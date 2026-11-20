# BiteShark Administration, Role Experiences, Vendor Onboarding & Moderation Governance

## 1. Pre-Migration Baseline (Inspected at `fcf01fed68259a9d69329447e6c7454393f67bde`)

Before migration `018_admin_portal_onboarding_moderation_issues.sql`:

- **Authentication**: PostgreSQL-backed 6-digit email verification challenges (`auth_otp_challenges`) and server-revocable `__Host-truckly_session` HttpOnly cookies (`auth_sessions`) managed by `lib/standalone-auth.js`. On VPS staging (`https://staging.biteshark.live`), `TRUCKLY_AUTH_DELIVERY_MODE=staging_mailbox` encrypts active OTP codes in `auth_staging_mailbox` for allowlisted staging addresses only, ensuring zero unsolicited external emails.
- **Roles & Memberships**:
  - `vendor_memberships (vendor_id, user_id, role)` supported `'owner'` and `'staff'`.
  - `platform_roles (user_id, role)` supported `'platform_admin'` and `'moderator'`.
  - Static environment variable `BITESHARK_PLATFORM_ADMIN_IDS` / `TRUCKLY_PLATFORM_ADMIN_IDS` granted unconditional `platform_admin` status when present, with no database revocation override if an account was later demoted or revoked.
  - Account bootstrap on staging relied on direct SQL inserts during test harness setup (`tests/vps-staging-gates.cjs`), with no dedicated idempotent operator CLI.
- **UI & Moderation**:
  - No dedicated `/admin` route existed; basic pending-only community moderation (`approved` / `rejected`) lived inside `#ownerScreen`.
  - All 59 curated Sonoma County listings in `vendors` lacked an explicit `ownership_status` separating curated directory entries from approved owner-managed businesses.

---

## 2. Two-Tier Administrative & Non-Exclusive Role Model

Migration `018` upgrades legacy `platform_admin` rows to `'top'` (**`Admin: Top`**) and `moderator` rows to `'mod'` (**`Admin: Mod`**) while preserving backward-compatible check constraints and helper aliases.

Every signed-in user retains **`Customer`** capabilities alongside any vendor or administrative roles (so a `Vendor Owner` or `Admin: Mod` can still save favorites and submit personal catering inquiries without role conflicts).

| Capability / Surface | Customer | Vendor Staff | Vendor Owner | Admin: Mod | Admin: Top |
| :--- | :---: | :---: | :---: | :---: | :---: |
| Manage own favorites, bookings, reviews, reports & private support issues | Yes | Yes | Yes | Yes | Yes |
| Manage assigned vendor live location, schedule & pickup pagers | No | Scoped vendor | Scoped vendor | Preview only | Audited Act-on-Behalf |
| Edit vendor profile & invite/remove Vendor Staff | No | No | Scoped vendor | No | Audited / Portal |
| Access `/admin` Administration Portal & Overview | No (`403`) | No (`403`) | No (`403`) | Yes | Yes |
| Review vendor applications, add internal notes, request info & recommend | No | No | No | Yes (except own) | Yes (except own) |
| Final vendor ownership approval, rejection & suspension | No | No | No | No (`403`) | Yes (except own) |
| Manage independent verification (`verified`) & photo rights | No | No | No | No (`403`) | Yes |
| Apply temporary vendor safety restriction (`<= 72h`) | No | No | No | Yes | Yes |
| Apply permanent vendor restrictions / account access suspension | No | No | No | No (`403`) | Yes |
| Initiate account invitations at all 5 levels | No | No | Staff only | Yes (`Mod`/`Top` pending Top) | Yes (immediate) |
| Approve/reject pending `Admin: Mod` / `Admin: Top` invitations | No | No | No | No (`403`) | Yes (not self) |
| Moderate comments (`approve`, `reject`, `hide`, `restore`, `dismiss_reports`) | No | No | No | Yes | Yes |
| Triage & resolve support issues (`internal` vs `reporter_visible` notes) | Own only | Own only | Own only | Yes (masked email) | Yes |
| Grant/demote/revoke platform roles & suspend accounts | No | No | No | No (`403`) | Yes (not self / not last Top) |
| Explicit `Act on Behalf of Vendor` operational support mode | No | No | No | No (`403`) | Yes (reason required + audited) |

### Static Environment Override Safeguard

`platform_role_revocations` records any administrative revocation or demotion performed through `/api/admin/accounts/role`. When `configuredAdminIds()` (`BITESHARK_PLATFORM_ADMIN_IDS` / `TRUCKLY_PLATFORM_ADMIN_IDS`) contains a `user_id` present in `platform_role_revocations`, `lib/authz.js` suppresses the static override so portal revocations cannot be silently bypassed. Prefer database-backed roles in `platform_roles` (`staging.env` leaves `PLATFORM_ADMIN_IDS` unset).

### Last-Top Protection

Both `/api/admin/accounts/role` + `/api/admin/accounts/status` (using `FOR UPDATE` locks across `platform_roles`) and PostgreSQL trigger `trg_protect_last_top_admin` block removing, demoting, or suspending the last active `Admin: Top` account.

---

## 3. Vendor Onboarding, Evidence Security & Granular Restrictions

### Curated Catalog vs Approved Ownership vs Verification

- **Curated Public Listing (`ownership_status = 'unclaimed'`)**: Remains visible in public discovery (`/api/trucks`) without fabricating an owner account. On migration `018`, only listings with an existing `vendor_memberships (role = 'owner')` row are marked `'approved_owner'`; the remaining curated Sonoma County listings stay `'unclaimed'` and publicly discoverable.
- **Application States (`vendor_applications`)**:
  - `draft` -> `submitted` (by applicant)
  - `submitted` -> `needs_info` (`Admin: Mod` or `Admin: Top`, with `applicant_feedback`)
  - `needs_info` -> `submitted` (applicant resubmission)
  - `submitted` -> `approved` | `rejected` (`Admin: Top` only; blocked if self-application or unresolved `approved_owner` conflict)
  - `approved` -> `suspended` (`Admin: Top` only)
- **Independent Verification**: Approving ownership sets `ownership_status = 'approved_owner'` and creates `vendor_memberships (role = 'owner')`, but **never** auto-sets `verified = true` or `photo_rights_verified = true`.
- **Sensitive Evidence (`vendor_application_evidence`)**:
  - Non-executable allowlist verified by magic bytes (`application/pdf`, `image/png`, `image/jpeg`, `image/webp`), max `512 KiB` per attachment, max 5 files per application.
  - Never served from `public/`; downloaded only via authenticated `/api/onboarding/evidence?id=<uuid>` (restricted by RLS + route check to the uploading applicant and `Admin: Mod`/`Top`) with `Content-Disposition: attachment`, `Content-Security-Policy: default-src 'none'; sandbox`, and `X-Content-Type-Options: nosniff`.
  - Default 90-day retention window (`retention_expires_at`); `DELETE /api/onboarding/evidence` zeros `file_bytes` immediately.

### Customer-Safe Vendor Restriction Policy

| Restriction Flag | Public Discovery (`/api/trucks`) | New Bookings (`/api/bookings/create`) | Existing Customer Bookings (`/api/bookings/list`) | New Pickup Pagers | Active Pickup Pagers In Flight | Owner / Staff Dashboard Writes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `hidden_from_discovery` | Hidden | Blocked (`409` if unbookable) | **Preserved & visible** | Allowed unless restricted | **Preserved & completable** | Allowed |
| `bookings_restricted` | Visible (marked not bookable) | **Blocked (`409`)** | **Preserved & visible** | Allowed | **Preserved & completable** | Allowed |
| `vendor_access_suspended` | Visible unless hidden | Allowed unless restricted | **Preserved & visible** | **Blocked (`403`)** | Customer status stays readable | **Blocked (`403`)** |
| `pager_restricted` | Visible | Allowed | **Preserved & visible** | **Blocked (`403`)** | **Staff can still mark `ready`/`completed`** | Non-pager writes allowed |
| `needs_info_correction` | Visible | Allowed | **Preserved & visible** | Allowed | **Preserved & completable** | Shows correction banner |

---

## 4. Migration & Safe Database Recovery Approach

- **Forward Migration**: `node scripts/run-migrations.cjs --app-role truckly_staging_app` applies `migrations/018_admin_portal_onboarding_moderation_issues.sql` inside a single checksum-tracked transaction and revokes `UPDATE, DELETE` on append-only history tables (`vendor_status_history`, `community_moderation_history`, `admin_bootstrap_grants`) from the runtime role.
- **Recovery Limitation & Pre-Migration Backup Requirement**:
  - Application symlink rollback (`deploy/install-staging-release.sh`) restores the previous Node release and restarts services, **but does not undo PostgreSQL DDL/data changes**.
  - Although `lib/authz.js` and `lib/discovery.js` retain backward-compatible column/role checks and `018` is additive (preserving all `001`..`017` tables and columns), full database rollback to pre-`018` state requires restoring the verified GPG-encrypted pre-deployment `pg_dump` backup (`/var/backups/truckly-staging/truckly_staging-<timestamp>.dump.gpg`) into a clean staging database before repointing `/srv/truckly-staging/current`.

---

## 5. Secure Top-Admin Bootstrap & Protected Staging Sign-In

1. **Bootstrap (`Admin: Top`)**:
   ```bash
   sudo -u postgres /opt/nodejs/node-v22-lts/bin/node \
     /srv/truckly-staging/current/scripts/bootstrap-top-admin.cjs \
     --email <operator-email> \
     --env-file /etc/truckly-staging/migration.env
   ```
2. **Protected Operator OTP Retrieval (`staging_mailbox` mode)**:
   - Open `https://staging.biteshark.live/login.html?next=%2Fadmin` and click **Request staging code →** for `<operator-email>`. (When `staging_mailbox` is active, `/login.html` displays a *Protected staging testing mode* banner instead of claiming an external email was sent.)
   - Retrieve only your own active 6-digit code over SSH without exposing `STAGING_MAILBOX_SECRET`:
     ```bash
     ssh root@172.233.140.74 "/opt/nodejs/node-v22-lts/bin/node /srv/truckly-staging/current/scripts/operator-read-my-otp.cjs --email <operator-email>"
     ```
3. **Enabling Real HTTPS Transactional Email (`resend_https`) & Top-Admin Diagnostics**:
   - Inspect live delivery mode, non-secret credential presence, authoritative SPF/DKIM/DMARC/return-path DNS state, recent sanitized failures, and last designated provider acceptance via `/admin` -> **Operational Health** (`GET /api/admin/email-readiness`, restricted strictly to `Admin: Top`).
   - Every `/api/auth/start` and `/api/auth/verify` call emits a sanitized `X-Correlation-Id` (`corr_<hex>`) and records bounded 7-day stage telemetry in `auth_delivery_telemetry` (`migrations/021_auth_diagnostics_and_email_readiness.sql`) without storing OTPs, DOBs, tokens, secrets, or recipient email addresses.
   - In `ENV=staging`, configured `STAGING_ALLOWED_EMAILS` / `STAGING_ALLOWED_EMAIL_DOMAINS` remain enforced even when `AUTH_DELIVERY_MODE=resend_https` so staging cannot contact non-allowlisted external addresses.

---

## 6. Preliminary Legal-Policy Framework, Proposed 14+ Age Policy & Launch Readiness Register (`migrations/019`–`020`)

> **Important Status Notice:** All policy pages (`/policies/*.html`), age-eligibility rules (`lib/age-policy.js`), and readiness records (`compliance_readiness_items`) are **preliminary working drafts and internal tracking tools — NOT approved legal documents or declarations of compliance**. Qualified counsel must review, revise, and sign off before public rollout.

### 6.1 Proposed Minimum Account Age (`14+`), Central Server-Side Gate & Data Minimization

- **Proposed Operator Policy (Pending Legal Review)**: Users aged **13 and younger cannot create accounts**. Minimum account age is **14** (`PROPOSED_MIN_ACCOUNT_AGE = 14`, `AGE_POLICY_VERSION = 'draft-14plus-v0.1'`). Customer account eligibility does **not** establish contractual capacity for vendor agreements, commercial representation, or paid transactions.
- **Timezone & Leap-Day Boundary**: Evaluated server-side against the current civil calendar date in `America/Los_Angeles` (Sonoma County local calendar). Leap-day (`02-29`) births reach their Nth birthday on `02-29` in leap years and on `03-01` in non-leap years (still age `N - 1` on `02-28`).
- **Pre-OTP Enforcement, Minimized/Pseudonymous Rate Limits & Zero Raw DOB Storage**:
  - Eligibility is evaluated on `POST /api/auth/start` **before** issuing any signup verification code or creating a new `auth_users` row; returning sign-in requests (`{ email }` without DOB) preserve exact non-enumerating `200` responses while issuing OTP challenges **only** for existing `auth_users` accounts.
  - BiteShark **never** stores raw date of birth, birth year, birth month, or birth day in PostgreSQL, logs, URLs, cookies, analytics, or responses. Only `age_eligibility_status` (`'not_assessed' | 'eligible_14_plus'`), `age_policy_version`, `age_assessed_at`, and `age_assessment_basis` are persisted.
  - Rejected `< 14` signups create **zero** accounts, **zero** OTP challenges, **zero** per-email rate-limit hashes, and **zero** marketing records. Browser cooldown uses a 15-minute constant-value HttpOnly cookie (`__Host-bs_age_gate=1`, containing no identifier); server-side network throttling records a truncated SHA-256 IP digest (`age_ineligible_ip` in `auth_rate_limits`), which is treated as a **minimized, pseudonymous security identifier** (never claimed to be anonymous) and purged after **24 hours** both opportunistically during `consumeAuthRateLimit` / `consumeGovernanceRateLimit` writes and every 30 worker ticks (~5 minutes) via `/api/pager/worker` -> `cleanupExpiredAuthRecords` (which also purges expired OTP challenges after 24 hours and expired/revoked `auth_sessions` carrying `ip_hash`/`ua_hash` after 7 days).
- **Central Server-Side Gate for Pre-Existing `'not_assessed'` Accounts & Documented Allowlist**:
  - Pre-existing accounts (including administrators) default honestly to `'not_assessed'` (no fabricated birth dates, no automatic approvals, no automatic deletions).
  - `server/app.js` enforces a central server-side eligibility gate (`403 AGE_ASSESSMENT_REQUIRED`) across **all** authenticated Domain API routes (`route.access === 'user'`), Act-on-Behalf requests, staging probes, `/admin` HTML entry (`302 -> /login.html?assess=1&next=%2Fadmin` for legitimate Mod/Top admins, returning cleanly to `/admin` after assessment without any redirect loop), and Governance/Admin API routes, reinforced by `FOR SHARE` row locks on `auth_sessions` + `auth_users` inside `withTransaction` (`lib/db-tx.js`).
  - **Documented Narrow Allowlist (`AGE_ASSESSMENT_ALLOWLIST_SPEC` in `lib/age-policy.js`)**:
    1. `POST /api/auth/age-assessment` — Complete the one-time 14+ age check.
    2. `POST /api/auth/logout` — Revoke active session and clear cookie.
    3. `GET /api/auth/session` — Minimum session identity (`id`, `email`, `age_eligibility_status`, `requires_age_assessment`) needed to render the assessment form.
    4. `POST /api/auth/start`, `POST /api/auth/verify`, `POST /api/auth/staging-mailbox` — Authentication bootstrap.
    5. `GET /api/account/context` — Redacted bootstrap context while `not_assessed` (withholds vendor memberships, role elevations, admin flags, and application/issue counts).
    6. `GET|POST /api/invitations/inspect` — Masked public token metadata preview (`accept` remains gated).
    7. `GET|POST /api/issues` & `POST /api/issues/reply` — Narrowly restricted while `not_assessed` to `account_access` / `privacy_request` / `accessibility_support` tickets with zero vendor/booking links (blocking operational ticket categories and withholding historical operational tickets).
    8. Public discovery endpoints, static shell, and `/policies/*` draft/accessibility pages.
  - **Ineligible Existing Accounts & Historical Records**: Submitting `< 14` on `POST /api/auth/age-assessment` immediately disables `auth_users` (`disabled_at`) and revokes active `auth_sessions`, **without** automatically deleting historical non-auth records (`bookings`, `favorites`, `community_reviews`, `support_issues`); retention/deletion handling for disabled under-14 pre-existing accounts is explicitly tracked as an unresolved legal-review item.

### 6.2 Business & Compliance Readiness Register (`/admin#readiness`), Backup Distinction & Non-Blocking Portal Reminder

- **23 Seeded Readiness Items (`22` Launch-Critical + `1` Pre-Activation Monetization Gate)**:
  - Out of 22 launch-critical items, **all 22 remain unresolved for legal sign-off (`0` `legally_approved`)**:
    - Unassessed / Decision Pending / Proposed: `legal_operator_identity` (`[LEGAL OPERATOR NAME], doing business as BiteShark`), `dba_registration`, `entity_structure`, `banking_and_tax`, `insurance_assessment`, `launch_jurisdictions`, `teen_user_safeguards`, `contractual_eligibility_split`, `terms_and_vendor_agreement`, `marketing_consent_unsubscribe`, `user_privacy_requests`, `copyright_dmca_process`, `security_incident_procedures`, `final_legal_launch_gate` (plus pre-activation `payment_subscription_prereqs`).
    - Implemented / Verified Internally (Still Awaiting Counsel Sign-Off): `minimum_signup_age_14`, `dob_collection_minimization`, `privacy_inventory_retention`, `cookie_analytics_ad_inventory`, `vendor_review_verification_defs`, `content_moderation_appeals`, `accessibility_statement_testing`, `backups_offserver_restore`.
  - **Archive Readability Checks vs. Completed Database Restores**: Pre-deployment verification runs `gpg --decrypt` + `pg_restore --list`, which confirms **archive decryptability and table-of-contents readability** — distinct from a **completed `pg_restore` into a PostgreSQL database** (executed earlier in a disposable local staging DB during Stage 1/2 verification in `docs/VPS_RELEASE_VERIFICATION_REPORT.md`; off-server backup replication and an off-host restore drill on the current schema remain unresolved).
- **Permissions & Versioned Legal Sign-Off**:
  - `Admin: Mod` may view `mod_visible` items and record operational notes/evidence (`POST /api/admin/readiness/note`), but cannot change statuses, modify governing policies, view `confidential_counsel_notes` (unless `mod_counsel_access_granted = true`), or mark `final_legal_launch_gate` complete.
  - `Admin: Top` (`POST /api/admin/readiness/update`) cannot mark an item `legally_approved` without structured `approved_doc_version`, `approved_jurisdiction_scope`, `legal_reviewer_name`, and `legal_reviewed_at`. Modifying `policy_version` or `current_practice` on a `legally_approved` item automatically transitions it to `needs_re_review` while preserving append-only `compliance_readiness_history`.
- **Deployment Control Limitation (Explicit)**:
  - `/admin` displays the prominent `Admin: Top` reminder **“Legal review and launch readiness remain incomplete. Draft policies are not approved for public rollout.”** alongside the unresolved launch-critical count on Overview.
  - **Deployment automation (`deploy/install-staging-release.sh`) is executed by operators over SSH/CLI and is NOT technically controlled or blocked by the Admin Portal database register.** Production cutover remains operationally gated by keeping `https://biteshark.live` on its static holding page until explicit operator & counsel sign-off.
