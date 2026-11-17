-- Truckly Isolated Hatchable Staging Bootstrap & Gate 5 Diagnostic SQL
--
-- SAFETY GUARD:
--   1. NEVER execute against production (`proj_MEO518rmLLl0` / `https://truckly.hatchable.site`).
--   2. Requires `SET LOCAL app.confirm_staging = 'true'` inside the transaction block;
--      otherwise the DO block immediately aborts before mutating any rows.
--
-- Before running, replace the `<STG_USER_ID_*>` placeholders below with the real
-- Hatchable `user.id` values created via `/login.html` on the isolated staging project.

BEGIN;

-- Uncomment the line below ONLY after confirming you are connected to the isolated staging DB:
-- SET LOCAL app.confirm_staging = 'true';

DO $$
BEGIN
  IF COALESCE(current_setting('app.confirm_staging', true), '') <> 'true' THEN
    RAISE EXCEPTION 'Refusing to seed staging roles without SET LOCAL app.confirm_staging = ''true''.';
  END IF;
END $$;

-- ============================================================================
-- Gate 5 Pre-Check: Inspect effective database role, BYPASSRLS, and table RLS
-- ============================================================================
SELECT
  current_user AS db_current_user,
  session_user AS db_session_user,
  u.usesuper AS is_superuser,
  u.usebypassrls AS has_bypassrls,
  c.relowner::regrole::text AS community_table_owner,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced
FROM pg_user u
CROSS JOIN pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
WHERE u.usename = current_user
  AND c.relname = 'community_reviews';

-- ============================================================================
-- Seed disposable staging RBAC bindings (platform_admin, moderator, Vendor A/B)
-- ============================================================================
SELECT set_config('app.is_platform_admin', 'true', true);

INSERT INTO platform_roles (user_id, role, granted_by) VALUES
  ('<STG_USER_ID_PLATFORM_ADMIN>', 'platform_admin', 'staging_bootstrap'),
  ('<STG_USER_ID_MODERATOR>', 'moderator', '<STG_USER_ID_PLATFORM_ADMIN>')
ON CONFLICT (user_id) DO UPDATE
  SET role = EXCLUDED.role,
      granted_by = EXCLUDED.granted_by;

INSERT INTO vendor_memberships (vendor_id, user_id, role, granted_by) VALUES
  ('iniguez', '<STG_USER_ID_VENDOR_A_OWNER>', 'owner', '<STG_USER_ID_PLATFORM_ADMIN>'),
  ('iniguez', '<STG_USER_ID_VENDOR_A_STAFF>', 'staff', '<STG_USER_ID_VENDOR_A_OWNER>'),
  ('mitote', '<STG_USER_ID_VENDOR_B_OWNER>', 'owner', '<STG_USER_ID_PLATFORM_ADMIN>')
ON CONFLICT (vendor_id, user_id) DO UPDATE
  SET role = EXCLUDED.role,
      granted_by = EXCLUDED.granted_by;

-- Ensure baseline staging test vendors accept bookings before running E2E suite
INSERT INTO owner_profiles (truck_id, display_name, cuisine, description, accepting_bookings)
VALUES
  ('iniguez', 'Tacos Iñiguez', 'Mexican', 'Staging Vendor A test profile', true),
  ('mitote', 'Mitote Food Park', 'Mexican', 'Staging Vendor B test profile', true)
ON CONFLICT (truck_id) DO UPDATE
  SET accepting_bookings = true,
      updated_at = now();

COMMIT;
