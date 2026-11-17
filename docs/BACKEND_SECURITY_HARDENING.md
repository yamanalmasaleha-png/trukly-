# Truckly P0 Backend Security & Integrity Hardening

This document records the architecture, permission matrix, database invariants, legacy-data quarantine rules, and staging rollout/rollback plan for the P0 backend hardening branch (`harden/p0-vendor-booking-community`).

> **Scope & constraints respected:**
> - Shared backend modules live in `lib/` (`lib/authz.js`, `lib/catalog.js`, `lib/dates.js`, `lib/db-tx.js`) — **never** inside `api/`, preserving the exact **27** Hatchable serverless route files.
> - `scripts/dev-server.cjs` is strictly a non-deployed local development preview tool. Production routes in `api/**/*.js` never read `x-truckly-debug-role`, `truckly_debug_role`, or any client-supplied role/identity fields.
> - Historical archives (`truckly-v63.zip`, `truckly-data.sql.gz`) and existing migrations (`001`–`010`) are untouched; schema changes use additive migrations `011`–`013`.

---

## 1. Permission Matrix (P0-A, P0-B, P0-C)

Identity is resolved strictly on the server via `resolveIdentity(req, auth)` (`req.user` / `auth.getUser(req)`). Platform roles (`platform_roles`) and vendor-scoped memberships (`vendor_memberships`) are loaded from PostgreSQL in `loadAccessContext`.

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

### Self-Grant & Audit Redaction Safeguards
- **Membership self-grant block:** Trigger `trg_guard_membership_grant` on `vendor_memberships` rejects `NEW.user_id = NEW.granted_by` unless transaction-local `app.is_platform_admin = 'true'` is set by a trusted administrative transaction. No public or user-facing API mutates `vendor_memberships` or `platform_roles`.
- **Audit logging & redaction:** `audit_logs` records `actor_id`, `actor_role`, `vendor_id`, `target_type`, `target_id`, `action`, `metadata`, and `created_at` inside the same database transaction as the state change. Private customer pager UUID tokens (`pickup_pagers.id`), `request_key`, `idempotency_key`, and free-text notes/bodies are stripped or hashed (`pager_sha256:<16-hex>`) by `redactPagerTargetId` and `FORBIDDEN_AUDIT_KEYS`.

---

## 2. Booking Invariants & Documented Capacity Model (P0-B)

1. **Calendar & Timezone Policy:** `lib/dates.js` validates real Gregorian calendar dates (rejecting impossible dates such as `2026-02-29` or `2026-11-31`) and enforces `event_date > getPacificToday(now)` in `America/Los_Angeles` (strictly future local date, up to 365 days out).
2. **Server-Resolved Vendor & Package Terms:** `POST /api/bookings/create` locks the `vendors` row (`FOR SHARE OF v`) and any `owner_profiles` row (`FOR SHARE`), rejects unknown, inactive, or `event_bookable = false` directory entries (such as cafés/farm stands or quarantined legacy IDs), and overwrites `truck_name`, `package_name`, and `package_price` from canonical server definitions (`dropin`: \$750 / 10–50 guests; `party`: \$1,500 / 10–100 guests; `festival`: \$2,900 / 10–250 guests).
3. **Fail-Closed Availability Verification:** Both `accepting_bookings = false` (`owner_profiles`) and `status = 'unavailable'` (`owner_schedule` locked `FOR SHARE`) return `409 Conflict` inside `POST /api/bookings/create`. Any database failure during verification rolls back and returns `503 Service Unavailable` with zero partial inserts.
4. **Stable Requester Ownership & Idempotency:** Authenticated `user.id` is required and stored in `requester_user_id` (`requester_email` / `requester` are contact snapshots only). `GET /api/bookings/list` filters strictly by `requester_user_id = $1`. Retries carrying the same `(requester_user_id, idempotency_key)` and identical `request_hash` return `200` (`idempotent_replay: true`), whereas reusing a key with altered booking details returns `409 Conflict`, backed by partial unique index `bookings_requester_idempotency_uidx` and `ON CONFLICT DO NOTHING` race recovery.
5. **Documented Inquiry vs. Capacity Rule:** Truckly event packages represent 2h/3h/5h catering inquiries by calendar date without time-slot exclusivity or payment capture. Multiple `pending` inquiries on the same date do not conflict, and no artificial "1 accepted booking per day" cap is invented. Instead, `POST /api/owner/requests` locks the target booking (`FOR UPDATE`), verifies `status = 'pending'`, verifies `(truck_id, event_date)` is not marked `unavailable` (`FOR SHARE` on `owner_schedule`), records `decided_by` and `decided_at`, and prevents any repeat or reverse transition from terminal states (`accepted`, `declined`, `cancelled`) at both API and PostgreSQL trigger (`trg_enforce_bookings_integrity`) levels.

---

## 3. Community Privacy & Direct-Table Defense-in-Depth (P0-C)

1. **Direct Table Exposure Removed:** `[db.tables.community_reviews]` was removed from `hatchable.toml` (`public/community.js` uses `/api/community/*` functions exclusively).
2. **Approved-Only Public Projection:** `community_public_posts` (`013_harden_community_privacy.sql`) projects only `status = 'approved'` rows and omits `author_id`, `status`, `moderated_at`, and `moderated_by`.
3. **PostgreSQL `FORCE ROW LEVEL SECURITY` + Triggers:** `community_reviews` enables `FORCE ROW LEVEL SECURITY` with four policies:
   - `community_select_approved`: allows `SELECT` where `status = 'approved'` even if a connection runs without GUC context.
   - `community_select_own`: allows `SELECT` where `author_id = current_setting('app.user_id', true)`.
   - `community_insert_own`: allows `INSERT` only when `status = 'pending'`, moderation fields are `NULL`, and `author_id = current_setting('app.user_id', true)`.
   - `community_moderator_all`: allows `UPDATE` / full queue visibility only when transaction-local `app.can_moderate = 'true'`.
   - Trigger `trg_enforce_community_reviews_guard` additionally enforces content/author immutability and moderation invariants.

---

## 4. Additive Migrations & Legacy Data Handling (`011`–`013`)

| Migration | Purpose & Legacy Handling |
|---|---|
| `011_vendor_authz_and_audit.sql` | Creates `vendors` seeded with all 59 Sonoma catalog entries (47 `event_bookable = true`, 12 `event_bookable = false`). Quarantines any pre-existing non-catalog `truck_id` values (e.g., `'estrella'`, `'owner-truck'`) into `vendors` with `is_active = false, event_bookable = false` and normalizes blank `bookings.truck_id = ''` to `NULL` before adding foreign keys. Creates `platform_roles`, `vendor_memberships` (`trg_guard_membership_grant`), `audit_logs`, and adds `pickup_pagers.vendor_id` (backfilling exact canonical display-name matches and leaving ambiguous historical rows `NULL` for `platform_admin`-only access). |
| `012_harden_bookings.sql` | Adds `requester_user_id`, `requester_email`, `idempotency_key`, `request_hash`, `decided_by`, `decided_at`, `updated_at` to `bookings`. Copies historical `requester` text to `requester_email` while keeping `requester_user_id` `NULL` so unverified legacy rows are never exposed to arbitrary email matches and remain restricted to `platform_admin` when `truck_id` is unassigned/quarantined. Adds `NOT VALID` package/status `CHECK` constraints and `trg_enforce_bookings_integrity` so legacy rows do not abort migration while all new/updated rows are strictly validated. |
| `013_harden_community_privacy.sql` | Adds `moderated_by`, normalizes historical `approved`/`rejected` (`moderated_by = 'legacy_admin'`, `moderated_at = COALESCE(moderated_at, created_at)`) and `pending` rows so `community_reviews_moderation_consistency_chk` validates cleanly, installs `trg_enforce_community_reviews_guard`, enables `FORCE ROW LEVEL SECURITY`, and creates `community_public_posts`. |

---

## 5. Staging Rollout & Rollback Plan

### Staging Rollout Steps
1. **Pre-flight backup:** Take a logical snapshot (`pg_dump`) of the target Hatchable PostgreSQL database prior to applying migrations.
2. **Apply additive migrations (`011` → `012` → `013`)** in order. Inspect any quarantined legacy vendor IDs:
   ```sql
   SELECT id, canonical_name, is_active FROM vendors WHERE is_active = false;
   SELECT count(*) AS unassigned_bookings FROM bookings WHERE truck_id IS NULL OR requester_user_id IS NULL;
   SELECT count(*) AS unmapped_pagers FROM pickup_pagers WHERE vendor_id IS NULL;
   ```
3. **Seed initial `platform_roles` and `vendor_memberships`** for real Hatchable user IDs (using a bootstrap admin session):
   ```sql
   BEGIN;
   SELECT set_config('app.is_platform_admin', 'true', true);
   INSERT INTO platform_roles (user_id, role, granted_by) VALUES ('<ADMIN_USER_ID>', 'platform_admin', 'bootstrap');
   INSERT INTO vendor_memberships (vendor_id, user_id, role, granted_by) VALUES ('<VENDOR_ID>', '<OWNER_USER_ID>', 'owner', '<ADMIN_USER_ID>');
   COMMIT;
   ```
4. **Deploy `hatchable.toml`, `lib/`, `api/`, and `public/` together** to a staging Hatchable environment (never deploy `scripts/dev-server.cjs`).
5. **Run staging smoke checks** with real Hatchable-authenticated accounts:
   - Verify anonymous `GET /api/community/list` and direct Hatchable client/REST table probe against `community_reviews` cannot read pending/rejected rows.
   - Verify Vendor A cannot read/write Vendor B profile, schedule, pagers, or bookings.
   - Verify authenticated customer booking creation, retry idempotency, and Pacific-date validation.

### Rollback Plan & Irreversible Steps
- **Application rollback:** Re-deploying the prior commit restores previous `api/` and `public/` code, **except** that new triggers (`trg_enforce_bookings_integrity`, `trg_enforce_pickup_pager_vendor_id`, `trg_enforce_community_reviews_guard`) and `FORCE ROW LEVEL SECURITY` on `community_reviews` will block legacy unauthenticated booking inserts, `vendor_id`-less pager inserts, and GUC-less community moderation queries until relaxed:
  ```sql
  -- Emergency compatibility rollback SQL (preserves all data columns & audit_logs)
  ALTER TABLE community_reviews NO FORCE ROW LEVEL SECURITY;
  ALTER TABLE community_reviews DISABLE ROW LEVEL SECURITY;
  DROP TRIGGER IF EXISTS trg_enforce_community_reviews_guard ON community_reviews;
  DROP TRIGGER IF EXISTS trg_enforce_bookings_integrity ON bookings;
  DROP TRIGGER IF EXISTS trg_enforce_pickup_pager_vendor_id ON pickup_pagers;
  ```
- **Data transformations to note (non-destructive but normalizing):**
  - Blank `bookings.truck_id = ''` values are normalized to `NULL` (`011`).
  - Historical `approved`/`rejected` `community_reviews` rows with `NULL` `moderated_at`/`moderated_by` are populated with `created_at` / `'legacy_admin'`, and `pending` rows have `moderated_at` cleared to `NULL` (`013`). Restoring exact pre-migration `NULL`s would require the pre-flight `pg_dump` backup.
