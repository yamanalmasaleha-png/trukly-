-- EMERGENCY LEGACY-CODE (8bbbbe3) COMPATIBILITY ROLLBACK SCRIPT
--
-- IMPORTANT — PREFERRED ROLLBACK POSTURE (TIER 1):
-- Do NOT run this script as a first resort. Instead, keep the hardened code and
-- migrations 011–013 active, and set `TRUCKLY_PAUSE_WRITES=bookings` (or `pagers`,
-- `community`, `owner`, `all`) to temporarily disable affected write endpoints while
-- preserving 100% of vendor RBAC, booking integrity, and community RLS protections.
--
-- TIER 2 (LAST RESORT ONLY):
-- Run this SQL script ONLY if an emergency forces redeploying the pre-hardening
-- `8bbbbe3` application code against a database where migrations 011–013 were applied.
-- Even if redeploying `8bbbbe3` handlers, DO NOT re-add `[db.tables.community_reviews]`
-- to `hatchable.toml` (the `8bbbbe3` UI calls `/api/community/*` exclusively).
--
-- Security/privacy consequences of running Tier 2 + `8bbbbe3` code:
--   1. Disables `FORCE ROW LEVEL SECURITY` and policies on `community_reviews` because
--      `8bbbbe3` community handlers do not set `app.user_id` / `app.can_moderate` GUCs;
--      if `[db.tables.community_reviews]` were ever re-enabled in `hatchable.toml`,
--      pending/rejected posts would become exposed to direct table reads.
--   2. Drops `community_reviews_moderation_consistency_chk` and
--      `trg_enforce_community_reviews_guard` because `8bbbbe3` `api/community/moderate.js`
--      sets `status` and `moderated_at` while leaving `moderated_by` NULL.
--   3. Drops `trg_enforce_bookings_integrity` and `bookings_vendor_fk` because `8bbbbe3`
--      `api/bookings/create.js` inserts rows with `requester_user_id IS NULL` and
--      optional/unverified `truck_id`. (`bookings_status_valid_chk` and
--      `bookings_package_terms_chk` remain active and compatible with `8bbbbe3`.)
--   4. Drops `trg_enforce_pickup_pager_vendor_id` because `8bbbbe3` `api/pager/staff.js`
--      inserts rows without `vendor_id`.
--   5. Drops `truck_settings_vendor_fk`, `owner_profiles_vendor_fk`, and
--      `owner_schedule_vendor_fk` because `8bbbbe3` owner handlers default `truck_id`
--      to `'owner-truck'` or accept arbitrary caller strings.
--   All historical data and new columns (`vendors`, `vendor_memberships`, `platform_roles`,
--   `audit_logs`, `community_public_posts`) are preserved non-destructively.

BEGIN;

-- 1. Community table compatibility for 8bbbbe3 handlers (no GUC context, NULL moderated_by)
ALTER TABLE community_reviews NO FORCE ROW LEVEL SECURITY;
ALTER TABLE community_reviews DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS community_select_approved ON community_reviews;
DROP POLICY IF EXISTS community_select_own ON community_reviews;
DROP POLICY IF EXISTS community_insert_own ON community_reviews;
DROP POLICY IF EXISTS community_moderator_all ON community_reviews;

DROP TRIGGER IF EXISTS trg_enforce_community_reviews_guard ON community_reviews;
ALTER TABLE community_reviews DROP CONSTRAINT IF EXISTS community_reviews_moderation_consistency_chk;

-- 2. Bookings compatibility for 8bbbbe3 handlers (NULL requester_user_id, optional truck_id)
DROP TRIGGER IF EXISTS trg_enforce_bookings_integrity ON bookings;
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_vendor_fk;

-- 3. Pickup pagers compatibility for 8bbbbe3 handlers (NULL vendor_id on insert)
DROP TRIGGER IF EXISTS trg_enforce_pickup_pager_vendor_id ON pickup_pagers;

-- 4. Owner tables compatibility for 8bbbbe3 handlers (default 'owner-truck' / unvalidated truck_id)
ALTER TABLE truck_settings DROP CONSTRAINT IF EXISTS truck_settings_vendor_fk;
ALTER TABLE owner_profiles DROP CONSTRAINT IF EXISTS owner_profiles_vendor_fk;
ALTER TABLE owner_schedule DROP CONSTRAINT IF EXISTS owner_schedule_vendor_fk;

COMMIT;
