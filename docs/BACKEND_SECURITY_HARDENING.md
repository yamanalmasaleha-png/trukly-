> VPS-only deployment: follow [VPS operations](VPS_OPERATIONS.md). Historical hosted-platform references below are provenance, not release requirements.

# Truckly P0 Backend Security & Integrity Hardening

This document records the architecture, permission matrix, date-only serialization contract, database invariants, legacy-data quarantine rules, tested two-tier rollback plan, and blocked Hatchable staging gates for `harden/p0-vendor-booking-community`.

> **DEPLOYMENT STATUS: BLOCKED PENDING HOSTED HATCHABLE STAGING GATES (see Section 6).**
> Local regression suites and real-PostgreSQL integration tests pass, but production deployment must remain held until the six hosted Hatchable runtime/gateway checks in Section 6 are verified in an isolated staging project.

> **Scope & constraints respected:**
> - Shared backend modules live in `lib/` (`lib/authz.js`, `lib/catalog.js`, `lib/dates.js`, `lib/db-tx.js`) — **never** inside `api/`, preserving the exact **27** Hatchable serverless route files.
> - `scripts/dev-server.cjs` is strictly a non-deployed local development preview tool. Production routes in `api/**/*.js` never read `x-truckly-debug-role`, `truckly_debug_role`, or any client-supplied role/identity fields.
> - Historical archives (`truckly-v63.zip`, `truckly-data.sql.gz`) and existing migrations (`001`–`010`) are untouched; schema changes use additive migrations `011`–`013`.

---

## 1. Permission Matrix (P0-A, P0-B, P0-C)

Identity is resolved strictly on the server via `resolveIdentity(req, auth)` (`req.user` / `auth.getUser(req)`), relying only on `id` (`string`) and optional `email` (`string`). Unverified runtime role fields on `req.user` are ignored; `platform_admin` and `moderator` privileges come strictly from `platform_roles` in PostgreSQL (or `TRUCKLY_PLATFORM_ADMIN_IDS` server configuration), and vendor-scoped roles (`owner` vs `staff`) come strictly from `vendor_memberships`.

| Operation / Endpoint | Anonymous | Signed-in Customer | Vendor `staff` (own vendor) | Vendor `owner` (own vendor) | Vendor `owner`/`staff` (other vendor) | `moderator` (`platform_roles`) | `platform_admin` |
|---|---|---|---|---|---|---|---|
| `GET /api/trucks*`, `/api/catalog/*`, `/api/schedule/today` | Allow | Allow | Allow | Allow | Allow | Allow | Allow |
| `GET /api/trucks/availability` | Allow | Allow | Allow | Allow | Allow | Allow | Allow |
| `GET /api/pager/status?code=<uuid>` | Allow (valid bearer UUID) | Allow | Allow | Allow | Allow | Allow | Allow |
| `POST /api/bookings/create` | `401` | Allow (eligible active vendor) | Allow (as customer) | Allow (as customer) | Allow (as customer) | Allow (as customer) | Allow (as customer) |
| `GET /api/bookings/list` | `401` | Own `requester_user_id` only | Own `requester_user_id` only | Own `requester_user_id` only | — | Own `requester_user_id` only | Own `requester_user_id` only |
| `GET /api/owner/stats` | `401` | `403` | Scoped to vendor | Scoped to vendor | `403` | `403` (unless also vendor member) | Global (or `?truck_id=`) |
| `GET /api/owner/profile` | `401` | `403` | Scoped to vendor | Scoped to vendor | `403` | `403` | Explicit `?truck_id=` |
| `POST /api/owner/profile` | `401` | `403` | `403` | Scoped to vendor | `403` | `403` | Explicit `truck_id` |
| `GET / POST /api/owner/location` | `401` | `403` | Scoped to vendor | Scoped to vendor | `403` | `403` | Explicit `truck_id` |
| `GET / POST /api/owner/schedule` | `401` | `403` | Scoped to vendor | Scoped to vendor | `403` | `403` | Global GET / explicit POST |
| `GET /api/owner/bookings` & `GET /api/owner/requests` | `401` | `403` | Scoped read-only | Scoped to vendor | `403` | `403` | Global (or `?truck_id=`) |
| `POST /api/owner/requests` (accept/decline) | `401` | `403` | `403` | Scoped to vendor | `403` | `403` | Allow (incl. legacy unassigned) |
| `GET / POST /api/pager/staff` | `401` | `403` | Scoped to vendor | Scoped to vendor | `403` | `403` | Global GET / explicit POST |
| `POST /api/pager/update` | `401` | `403` | Scoped to vendor | Scoped to vendor | `403` | `403` | Allow (incl. legacy unmapped) |
| `GET /api/community/list` | Approved public projection only | Approved public projection only | Approved public projection only | Approved public projection only | Approved public projection only | Approved public projection only | Approved public projection only |
| `GET /api/community/mine` | `401` | Own `author_id` only | Own `author_id` only | Own `author_id` only | — | Own `author_id` only | Own `author_id` only |
| `POST /api/community/post` | `401` | Forced `pending`, own `author_id` | Forced `pending`, own `author_id` | Forced `pending`, own `author_id` | — | Forced `pending`, own `author_id` | Forced `pending`, own `author_id` |
| `GET / POST /api/community/moderate` | `401` | `403` | `403` | `403` | `403` | Allow | Allow |

### Self-Grant, Atomic Pager Creation & Audit Redaction Safeguards
- **Membership self-grant block:** Trigger `trg_guard_membership_grant` on `vendor_memberships` rejects `NEW.user_id = NEW.granted_by` unless transaction-local `app.is_platform_admin = 'true'` is set by a trusted administrative transaction. No public or user-facing API mutates `vendor_memberships` or `platform_roles`.
- **Atomic concurrent pager creation (`POST /api/pager/staff`):** Inserts use `ON CONFLICT (request_key) DO NOTHING RETURNING ...` inside a single transaction. Concurrent identical retries resolve atomically (`1` insert returning `201` + `1` `pager.create` audit event; retries return `200` with `idempotent_replay: true` and the identical ticket). Reusing a `request_key` with a different `ticket` or `vendor_id` returns a controlled `409 Conflict` containing only `{ error }` — never exposing another vendor's private pager UUID or metadata.
- **Audit logging & redaction:** `audit_logs` records `actor_id`, `actor_role`, `vendor_id`, `target_type`, `target_id`, `action`, `metadata`, and `created_at` inside the same database transaction as the state change. Private customer pager UUID tokens (`pickup_pagers.id`), `request_key`, `idempotency_key`, and free-text notes/bodies are stripped or hashed (`pager_sha256:<16-hex>`) by `redactPagerTargetId` and `FORBIDDEN_AUDIT_KEYS`.

---

## 2. Date-Only Contract, Booking Invariants & Capacity Model (P0-B)

1. **Date-Only (`YYYY-MM-DD`) Adapter & API Contract:**
   - **SQL layer (primary):** All `SELECT` and `RETURNING` clauses reading PostgreSQL `DATE` columns (`bookings.event_date`, `owner_schedule.service_date`) project `to_char(<col>, 'YYYY-MM-DD') AS <col>` so PostgreSQL emits canonical timezone-independent `TEXT` (`OID 25`) rather than `DATE` (`OID 1082`), avoiding driver `Date` instantiation.
   - **Adapter normalization layer (`normalizeCalendarDate` in `lib/dates.js`):** Enforces `YYYY-MM-DD` across both `string` values and JavaScript `Date` instances returned by adapters (handling both `node-postgres` local-midnight `new Date(y, m - 1, d)` and UTC-midnight `new Date('YYYY-MM-DD')` without shifting calendar days across `UTC-` or `UTC+` timezones, while throwing `TypeError` on ambiguous non-midnight timestamps). Never uses `String(date).slice(0, 10)` or indiscriminate `.toISOString().slice(0, 10)`.
2. **Calendar & Timezone Policy:** `lib/dates.js` validates real Gregorian calendar dates (rejecting impossible dates such as `2026-02-29` or `2026-11-31`) and enforces `event_date > getPacificToday(now)` in `America/Los_Angeles` (strictly future local date, up to 365 days out).
3. **Server-Resolved Vendor & Package Terms:** `POST /api/bookings/create` locks the `vendors` row (`FOR SHARE OF v`) and any `owner_profiles` row (`FOR SHARE`), rejects unknown, inactive, or `event_bookable = false` directory entries, and overwrites `truck_name`, `package_name`, and `package_price` from canonical server definitions (`dropin`: \$750 / 10–50 guests; `party`: \$1,500 / 10–100 guests; `festival`: \$2,900 / 10–250 guests).
4. **Fail-Closed Availability Verification:** Both `accepting_bookings = false` (`owner_profiles`) and `status = 'unavailable'` (`owner_schedule` locked `FOR SHARE`) return `409 Conflict` inside `POST /api/bookings/create`. Any database failure during verification rolls back and returns `503 Service Unavailable` with zero partial inserts.
5. **Stable Requester Ownership & Idempotency:** Authenticated `user.id` is required and stored in `requester_user_id` (`requester_email` / `requester` are contact snapshots only). `GET /api/bookings/list` filters strictly by `requester_user_id = $1`. Retries carrying the same `(requester_user_id, idempotency_key)` and identical `request_hash` return `200` (`idempotent_replay: true`), whereas reusing a key with altered booking details returns `409 Conflict`, backed by partial unique index `bookings_requester_idempotency_uidx` and `ON CONFLICT DO NOTHING` race recovery.
6. **Documented Inquiry vs. Capacity Rule:** Truckly event packages represent 2h/3h/5h catering inquiries by calendar date without time-slot exclusivity or payment capture. Multiple `pending` inquiries on the same date do not conflict, and no artificial "1 accepted booking per day" cap is invented. Instead, `POST /api/owner/requests` locks the target booking (`FOR UPDATE`), verifies `status = 'pending'`, verifies `(truck_id, event_date)` is not marked `unavailable` (`FOR SHARE` on `owner_schedule`), records `decided_by` and `decided_at`, and prevents any repeat or reverse transition from terminal states (`accepted`, `declined`, `cancelled`) at both API and PostgreSQL trigger (`trg_enforce_bookings_integrity`) levels.

---

## 3. Community Privacy & Direct-Table Defense-in-Depth (P0-C)

1. **No public table gateway:** the VPS exposes only explicit API routes. Community reads use the approved-only projection; PostgreSQL FORCE RLS remains mandatory. The retired hosted configuration is not a security control for this runtime.
2. **Approved-Only Public Projection:** `community_public_posts` (`013_harden_community_privacy.sql`) projects only `status = 'approved'` rows and omits `author_id`, `status`, `moderated_at`, and `moderated_by`.
3. **PostgreSQL `FORCE ROW LEVEL SECURITY` + Triggers:** `community_reviews` enables `FORCE ROW LEVEL SECURITY` with four policies:
   - `community_select_approved`: allows `SELECT` where `status = 'approved'` even if a connection runs without GUC context.
   - `community_select_own`: allows `SELECT` where `author_id = current_setting('app.user_id', true)`.
   - `community_insert_own`: allows `INSERT` only when `status = 'pending'`, moderation fields are `NULL`, and `author_id = current_setting('app.user_id', true)`.
   - `community_moderator_all`: allows `UPDATE` / full queue visibility only when transaction-local `app.can_moderate = 'true'`.
   - Note: Because `set_config(..., true)` (`SET LOCAL`) is scoped strictly to an active PostgreSQL transaction, it resets automatically on both `COMMIT` and `ROLLBACK` on pooled connections (verified on a `max: 1` `pg.Pool` in `tests/backend-hardening.integration.cjs`), and automatically fails closed if executed outside an open transaction block.

---

## 4. Additive Migrations & Legacy Data Handling (`011`–`013`)

| Migration | Purpose & Legacy Handling |
|---|---|
| `011_vendor_authz_and_audit.sql` | Creates `vendors` seeded with all 59 Sonoma catalog entries (47 `event_bookable = true`, 12 `event_bookable = false`). Quarantines any pre-existing non-catalog `truck_id` values (e.g., `'estrella'`, `'owner-truck'`) into `vendors` with `is_active = false, event_bookable = false` and normalizes blank `bookings.truck_id = ''` to `NULL` before adding foreign keys. Creates `platform_roles`, `vendor_memberships` (`trg_guard_membership_grant`), `audit_logs`, and adds `pickup_pagers.vendor_id` (backfilling exact canonical display-name matches and leaving ambiguous historical rows `NULL` for `platform_admin`-only access). |
| `012_harden_bookings.sql` | Adds `requester_user_id`, `requester_email`, `idempotency_key`, `request_hash`, `decided_by`, `decided_at`, `updated_at` to `bookings`. Copies historical `requester` text to `requester_email` while keeping `requester_user_id` `NULL` so unverified legacy rows are never exposed to arbitrary email matches and remain restricted to `platform_admin` when `truck_id` is unassigned/quarantined. Adds `NOT VALID` package/status `CHECK` constraints and `trg_enforce_bookings_integrity` so legacy rows do not abort migration while all new/updated rows are strictly validated. |
| `013_harden_community_privacy.sql` | Adds `moderated_by`, normalizes historical `approved`/`rejected` (`moderated_by = 'legacy_admin'`, `moderated_at = COALESCE(moderated_at, created_at)`) and `pending` rows so `community_reviews_moderation_consistency_chk` validates cleanly, installs `trg_enforce_community_reviews_guard`, enables `FORCE ROW LEVEL SECURITY`, and creates `community_public_posts`. |

---

## 5. Staging Rollout & Tested Two-Tier Rollback Plan

### Staging Rollout Steps
1. **Pre-flight backup:** Capture a full `pg_dump` snapshot of the target staging/production database before applying migrations.
2. **Apply additive migrations (`011` → `012` → `013`)** in order and inspect quarantined/unmapped counts:
   ```sql
   SELECT id, canonical_name, is_active FROM vendors WHERE is_active = false;
   SELECT count(*) AS unassigned_bookings FROM bookings WHERE truck_id IS NULL OR requester_user_id IS NULL;
   SELECT count(*) AS unmapped_pagers FROM pickup_pagers WHERE vendor_id IS NULL;
   ```
3. **Seed initial `platform_roles` and `vendor_memberships`** for verified Hatchable user IDs:
   ```sql
   BEGIN;
   SELECT set_config('app.is_platform_admin', 'true', true);
   INSERT INTO platform_roles (user_id, role, granted_by) VALUES ('<ADMIN_USER_ID>', 'platform_admin', 'bootstrap');
   INSERT INTO vendor_memberships (vendor_id, user_id, role, granted_by) VALUES ('<VENDOR_ID>', '<OWNER_USER_ID>', 'owner', '<ADMIN_USER_ID>');
   COMMIT;
   ```
4. **Deploy `hatchable.toml`, `lib/`, `api/`, and `public/` together** to an isolated Hatchable staging environment (**never** deploy `scripts/dev-server.cjs`) and execute **all six Section 6 deployment gates** before considering production rollout.

### Tested Two-Tier Rollback Strategy

#### Tier 1 (Preferred / Default Incident Response): Security-Preserving Write Pause — *Zero Schema Relaxation*
If a functional bug is discovered after deployment, **do not revert to pre-hardening `8bbbbe3` code or relax PostgreSQL security controls.** Keep migrations `011`–`013`, vendor RBAC, `FORCE ROW LEVEL SECURITY`, and `[db.tables.community_reviews]` removal active, and temporarily pause only the affected write scope via `TRUCKLY_PAUSE_WRITES`:
- Set `TRUCKLY_PAUSE_WRITES=bookings` (or comma-separated `bookings,pagers,community,owner,notifications`, or `all`). Setting an unrecognized scope token fails closed by pausing all hardened write scopes (`503`). Changing environment variables on hosted serverless runtimes requires redeploying/recycling function instances unless live hot-reload has been verified on Hatchable.
- In-transaction authorization rechecks (`reverifyVendorMembershipInTx`, `reverifyModeratorInTx`, `reverifyPlatformAdminInTx` in `lib/authz.js`) acquire `FOR SHARE` on `platform_roles`, `vendor_memberships`, and `vendors` (or `FOR NO KEY UPDATE` on `vendors` during booking-eligibility writes), conflict-serializing concurrent role downgrades (`owner -> staff`, `platform_admin -> moderator`), membership deletions, and vendor deactivations (`is_active = false`) through transaction commit on all write routes and `GET /api/pager/telemetry` (read-only `GET` endpoints evaluate a point-in-time `READ COMMITTED` snapshot).
- Affected `POST` handlers immediately return `503 Service Unavailable` with a maintenance message (`isWritePaused` in `lib/authz.js`), while catalog discovery, availability checks, existing customer pickup pagers, and approved community reads continue operating with **all** P0-A, P0-B, and P0-C protections intact.

#### Tier 2 (Last-Resort Emergency Only): Full Code Revert to `8bbbbe3` + `scripts/rollback-legacy-8bbbbe3-compat.sql`
If an emergency forces redeploying the prior `8bbbbe3` application bundle against a database that has already run `011`–`013`, run [`scripts/rollback-legacy-8bbbbe3-compat.sql`](../scripts/rollback-legacy-8bbbbe3-compat.sql) (tested empirically in `tests/backend-hardening.integration.cjs` Part 6 against the actual `8bbbbe3` handlers loaded via `git show 8bbbbe3:api/...`):

| Database / Config Object | Action in `rollback-legacy-8bbbbe3-compat.sql` | Why `8bbbbe3` Requires It & Security/Privacy Consequence |
|---|---|---|
| `[db.tables.community_reviews]` in `hatchable.toml` | **Keep omitted** (do NOT restore `8bbbbe3` `hatchable.toml` block) | `8bbbbe3` `public/community.js` only calls `/api/community/*`. Keeping direct table config omitted prevents public browser reads of unpublished rows once RLS is disabled. |
| `community_reviews` `FORCE ROW LEVEL SECURITY` + 4 policies | `NO FORCE` + `DISABLE ROW LEVEL SECURITY` + `DROP POLICY` (×4) | `8bbbbe3` `community/{mine,post,moderate}.js` do not set `app.user_id` or `app.can_moderate`. **Consequence:** DB-level row filtering is removed; if direct table access were ever re-enabled, pending/rejected rows and `author_id` would be exposed. |
| `trg_enforce_community_reviews_guard` & `community_reviews_moderation_consistency_chk` | `DROP TRIGGER` + `DROP CONSTRAINT` | `8bbbbe3` `api/community/moderate.js` updates `status` and `moderated_at = NOW()` while leaving `moderated_by` `NULL`. Leaving `community_reviews_moderation_consistency_chk` active would break all `8bbbbe3` approvals/rejections (`23514 check_violation`). |
| `trg_enforce_bookings_integrity` & `bookings_vendor_fk` | `DROP TRIGGER` + `DROP CONSTRAINT` | `8bbbbe3` `api/bookings/create.js` inserts `requester_user_id = NULL` and optional/unvalidated `truck_id` (`bookings_status_valid_chk` and `bookings_package_terms_chk` remain active and compatible). **Consequence:** Re-opens unauthenticated/unverified booking creation under `8bbbbe3`. |
| `trg_enforce_pickup_pager_vendor_id` | `DROP TRIGGER` | `8bbbbe3` `api/pager/staff.js` inserts pagers without `vendor_id`. **Consequence:** New pagers created under `8bbbbe3` have `vendor_id = NULL` (global admin scope). |
| `truck_settings_vendor_fk`, `owner_profiles_vendor_fk`, `owner_schedule_vendor_fk` | `DROP CONSTRAINT` (×3) | `8bbbbe3` owner handlers default `truck_id` to `'owner-truck'` or accept arbitrary caller strings. |

- **Non-destructive data preservation & normalizing steps:** All tables and columns (`vendors`, `vendor_memberships`, `platform_roles`, `audit_logs`, `community_public_posts`) remain intact. Historical normalizations from `011` (`bookings.truck_id = '' -> NULL`) and `013` (populating `moderated_by = 'legacy_admin'` / `moderated_at` on legacy `approved`/`rejected` rows and clearing `moderated_at` on `pending` rows) require the pre-flight `pg_dump` if verbatim pre-migration `NULL`/empty values must be restored.

---

## 6. Hatchable Deployment Feasibility & Blocked Staging Gates

VPS release checks replace hosted-platform checks. Run `tests/vps-staging-gates.cjs --preflight-local`, then its live staging mode; use `docs/VPS_OPERATIONS.md` for the protected probe lifecycle. Verify pinned transactions, GUC isolation, restricted application role and forced RLS, cross-vendor denials, CSRF, direct-table-path 404s and write pause behavior on the actual VPS runtime. Historical hosted-only blockers are preserved in `docs/archive/hatchable/HATCHABLE_STAGING_RUNBOOK.md`; they are not current release prerequisites. This change does not assert any unrun VPS or device gate passed.
