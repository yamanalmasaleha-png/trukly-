# PostgreSQL Data Model, Roles & Row-Level Security

This document explains BiteShark's database security model, role separation, `FORCE ROW LEVEL SECURITY` session-variable contracts, triggers, and seed-vs-runtime data expectations.

For the full column-by-column table ledger and generated Mermaid `erDiagram`, see [SCHEMA-INVENTORY.md](generated/SCHEMA-INVENTORY.md).

---

## 1. Schema Provenance Levels

Per Handbook Section 9, distinguish three levels of schema evidence:
1. **Reconstructed from Repository Migrations** ([SCHEMA-INVENTORY.md](generated/SCHEMA-INVENTORY.md)): Deterministically parsed from `migrations/001_create_bookings.sql` through `029_customer_profiles_collections_and_sharing.sql` (`59` tables on `feature/private-profiles-greatest-hits`; `51` tables through `028` on `working/biteshark-vps`; `47` tables through `026` on `staging2` branches).
2. **Independently Verified Against Disposable PostgreSQL 16+**: Verified via `node tools/code-registry/cli.mjs validate --verify-db` and the repository's embedded PostgreSQL integration suites (`scripts/run-migrations.cjs` against a fresh database).
3. **Deployed Schema**: Never run experimental discovery DDL against `staging.biteshark.live` (`truckly_staging`) or `staging2.biteshark.live` (`biteshark_staging2`). Deployed migration state is tracked exclusively in `public.schema_migrations`.

---

## 2. Two-Role Least-Privilege Architecture

Defined in [bootstrap-staging-roles.sql.template](../../deploy/postgres/bootstrap-staging-roles.sql.template) and enforced by [run-migrations.cjs](../../scripts/run-migrations.cjs) + [server/index.js](../../server/index.js):

| Role | Staging1 / Staging2 Identifiers | Capabilities | Used By |
|---|---|---|---|
| **Migrator (Owner)** | `truckly_stg_migrator` / `biteshark_stg2_migrator` (`NOSUPERUSER NOBYPASSRLS`) | Owns schema & tables, executes DDL (`migrations/*.sql`), manages grants. Never loaded by running HTTP/worker services. | `scripts/run-migrations.cjs`, `scripts/bootstrap-top-admin.cjs` (`/etc/*/migrator.env`, `0600`) |
| **Application Runtime** | `truckly_stg_app` / `biteshark_stg2_app` (`NOSUPERUSER NOBYPASSRLS`) | `SELECT, INSERT, UPDATE, DELETE` on tables + sequence `USAGE` **minus explicit revokes** on `schema_migrations` and append-only audit/history tables. Cannot run DDL or bypass RLS. | `server/index.js`, `scripts/run-pager-worker.cjs` (`/etc/*/staging.env`, `0640`) |

---

## 3. `FORCE ROW LEVEL SECURITY` vs Non-RLS Tables

### A. 46 Tables Protected by `ENABLE` + `FORCE ROW LEVEL SECURITY`
Every table added from Migration `013` onward (`community_reviews`, `auth_*`, `pager_notification_*`, `vendor_applications`, `vendor_application_evidence`, `account_invitations`, `support_issues*`, `compliance_readiness_*`, `feature_controls*`, `diagnostic_*`, `worker_runtime_heartbeats`, `customer_visits`, `customer_photos`, `customer_saved_trails`, `customer_saved_trail_stops`, `customer_profiles`, `customer_sharing_eligibility`, `customer_collections`, `customer_collection_photo_attachments`, `customer_collection_entries`, `customer_collection_shares`, `customer_share_reports`, `customer_share_moderation_events`) enforces `FORCE ROW LEVEL SECURITY`.

Transactions **must** set the required transaction-local GUC via `SELECT set_config('app.<key>', $1, true)` inside `withTransaction(db, async tx => ...)`:

| GUC Key (`current_setting(..., true)`) | Meaning & Authorized Setters | Primary Consuming Tables |
|---|---|---|
| `app.user_id` | Verified `auth_users.id` of the caller | `community_reviews`, `vendor_applications`, `vendor_application_evidence`, `community_reports`, `support_issues*`, `customer_visits`, `customer_photos`, `customer_saved_trails`, `customer_saved_trail_stops` |
| `app.photo_maintenance` | `'true'` strictly inside `reconcilePhotoStorage()` (`028`; explicitly cleared in `setUserRlsContextInTx`) | `customer_photos` (`SELECT` + `UPDATE` restricted to `deleted_at IS NOT NULL`) |
| `app.auth_internal` | `'true'` inside `lib/standalone-auth.js` & `lib/db-tx.js` session lock check | `auth_users`, `auth_sessions`, `auth_otp_challenges`, `auth_rate_limits`, `auth_staging_mailbox`, `auth_delivery_telemetry` |
| `app.admin_internal` | `'true'` after row-locked admin verification (`enableAdminTxGuards` in `server/admin-routes.js`) | `account_invitations*`, `vendor_status_history`, `platform_role_revocations`, `admin_bootstrap_grants`, `compliance_readiness_*`, `support_issues*`, `diagnostic_*` |
| `app.is_top_admin` | `'true'` for verified `Admin: Top` actors | `feature_controls` (`feature_controls_top_write`), `feature_control_history` |
| `app.is_platform_admin` | `'true'` for `Admin: Top` / `Mod` read/history scopes | `pager_notification_*`, `compliance_readiness_*`, `feature_control_history` |
| `app.is_moderator` | `'true'` for verified `Mod` or `Top` actors | `community_reviews`, `community_reports`, `community_moderation_history` |
| `app.support_user_update` | `'true'` when a ticket reporter replies/reopens/marks read (`026`) | `support_issues` (paired with trigger `trg_guard_user_support_issue_bounds`) |
| `app.is_notification_worker` | `'true'` inside `/api/pager/worker` outbox batch processor | `pager_notification_subscriptions`, `pager_notification_events`, `pager_notification_deliveries` |
| `app.pager_lookup_id` / `app.subscription_lookup_id` / `app.vendor_id` | Capability UUID or authorized `vendor_id` | `pager_notification_subscriptions`, `pager_notification_events`, `pager_notification_deliveries` |
| `app.diagnostics_internal` | `'true'` inside `lib/diagnostics.js` | `diagnostic_releases`, `diagnostic_incident_groups`, `diagnostic_event_samples`, `diagnostic_incident_notes`, `worker_runtime_heartbeats` *(note: `024` also lists `app.worker_internal`, which is unused in Node)* |
| `app.share_lookup` / `app.share_report_intake` / `app.share_moderation` | Scoped Guards in `lib/customer-profile.js` (`029`): public `/s/<token>` read lookup, signed-out report intake, and scoped `Mod`/`Top` review (keeping `app.user_id` bound to the moderator so private visits/photos stay RLS-isolated) | `customer_profiles`, `customer_sharing_eligibility`, `customer_collections`, `customer_collection_photo_attachments`, `customer_collection_entries`, `customer_collection_shares`, `customer_share_reports`, `customer_share_moderation_events` |

### B. 13 Legacy / Directory Tables Without PostgreSQL RLS (Rely on Handler SQL `WHERE` Clauses!)
`schema_migrations`, `bookings`, `favorites`, `truck_settings`, `owner_profiles`, `owner_schedule`, `notification_settings`, `pickup_pagers`, `vendors`, `vendor_memberships`, `platform_roles`, `audit_logs`, and `pager_rate_limits` do **not** have RLS enabled. Any query against these tables **must** filter explicitly by verified `user.id` / `vendor_id` in SQL (`WHERE requester_id = $1`, `WHERE user_id = $1`, `WHERE truck_id = $1`).

---

## 4. Database Triggers & Immutability Guards

1. **Last-Top-Admin Protection (`migrations/018` + `026`)**:
   - `trg_protect_last_top_admin` on `platform_roles` and `trg_protect_last_top_admin_on_auth_users` on `auth_users` serialize under `pg_advisory_xact_lock(hashtext('biteshark_platform_roles_mutation'))` and block demoting, deleting, suspending, or age-disabling the last active `eligible_14_plus` `Admin: Top` account.
2. **Append-Only History Enforcement (`prevent_append_only_mutation` + `REVOKE UPDATE, DELETE`)**:
   - Blocks `UPDATE` and `DELETE` on `audit_logs`, `vendor_status_history`, `community_moderation_history`, `admin_bootstrap_grants`, `compliance_readiness_history`, `feature_control_history`, `diagnostic_incident_notes`, `support_issue_events`, `account_invitation_events`, and `customer_share_moderation_events`.
3. **User Column-Bound Triggers (`migrations/026`)**:
   - `trg_guard_user_onboarding_app_bounds` prevents non-admin updates on `vendor_applications` from forging `status = 'approved'` or reviewer fields.
   - `trg_guard_user_support_issue_bounds` prevents non-admin updates on `support_issues` from altering `severity`, `assigned_to`, `escalated_to_top`, `sla_due_at`, or `ticket_number`.

---

## 5. Seed vs Runtime Data Expectations

- **Canonical Seeded Reference Rows (Part of Schema Migrations)**:
  - `vendors`: **59** real Sonoma County food trucks, cafés, farm stands, and farmers markets seeded idempotently in `014_unified_discovery_catalog.sql` and cleaned of legacy template rows (`estrella`, `bao`, `ember`, `verde`, `swirl`, `masa`, `owner-truck`) in `016`. All 59 start with `ownership_status = 'unclaimed'` and `photo_rights_verified = false`.
  - `compliance_readiness_items`: **18** governance tracking rows seeded in `021`.
  - `feature_controls`: Seeded in `022` / `025` *(and `027` on `83181ba`)*.
- **Staging Test Fixtures (`scripts/staging-seed.sql` & `scripts/staging-cleanup.sql`)**:
  - Require `SET LOCAL app.confirm_staging = 'true'`; use `[STG-E2E-%]` / `stg_` prefixes so `staging-cleanup.sql` can purge test artifacts without touching canonical catalog rows. Never copy production/customer PII into `staging` or `staging2`.
