-- Migration 030: Audit Security & RLS Hardening (`REP-002`, `REP-013`)
--
-- Security guarantees:
--   1. Synthetic Sandbox Account Hard Isolation (`REP-002`):
--      - `usr_sa_top_admin_test_customer` can NEVER hold rows in `public.platform_roles` or
--        `public.vendor_memberships` (enforced via immutable `CHECK` constraints after purging any stray rows).
--      - `public.protect_last_top_admin()` and `public.protect_last_top_admin_on_auth_users()` explicitly
--        exclude `usr_sa_top_admin_test_customer` so the shared sandbox user can never satisfy last-Top checks.
--   2. Legacy Customer Tables `FORCE ROW LEVEL SECURITY` (`REP-013`):
--      - Enables and forces Row Level Security on `public.favorites` and `public.notification_settings`.
--      - Unprivileged runtime application role (`NOBYPASSRLS`, non-owner) may ONLY select/insert/update/delete
--        rows matching `current_setting('app.user_id', true) = user_id`.
--      - Table owner (`migrator`) in explicit maintenance/test transactions (`app.auth_internal = 'true'` or
--        `app.admin_portal = 'true'`) retains verification visibility.

-- 1. Purge any stray synthetic sandbox privileges and enforce hard CHECK constraints
DELETE FROM public.platform_roles WHERE user_id = 'usr_sa_top_admin_test_customer';
DELETE FROM public.vendor_memberships WHERE user_id = 'usr_sa_top_admin_test_customer';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_platform_roles_no_sandbox_test_customer'
      AND conrelid = 'public.platform_roles'::regclass
  ) THEN
    ALTER TABLE public.platform_roles
      ADD CONSTRAINT chk_platform_roles_no_sandbox_test_customer
      CHECK (user_id <> 'usr_sa_top_admin_test_customer');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_vendor_memberships_no_sandbox_test_customer'
      AND conrelid = 'public.vendor_memberships'::regclass
  ) THEN
    ALTER TABLE public.vendor_memberships
      ADD CONSTRAINT chk_vendor_memberships_no_sandbox_test_customer
      CHECK (user_id <> 'usr_sa_top_admin_test_customer');
  END IF;
END
$$;

-- 2. Exclude synthetic sandbox user from last-Top-Admin trigger counts (only when `auth_users` exists;
--    note `030` runs after `017_standalone_auth_and_sessions.sql` and `026_urgent_pilot_security_hardening.sql`)
CREATE OR REPLACE FUNCTION public.protect_last_top_admin()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_remaining integer;
  v_prev_auth text;
BEGIN
  IF public.is_last_top_cleanup_authorized() THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.role IN ('top', 'platform_admin')
     AND (TG_OP = 'DELETE' OR NEW.role NOT IN ('top', 'platform_admin')) THEN
    PERFORM pg_advisory_xact_lock(hashtext('biteshark_platform_roles_mutation'));

    v_prev_auth := COALESCE(current_setting('app.auth_internal', true), '');
    PERFORM set_config('app.auth_internal', 'true', true);

    SELECT count(*)::int INTO v_remaining
    FROM (
      SELECT pr.user_id
      FROM public.platform_roles pr
      JOIN public.auth_users au ON au.id = pr.user_id
      WHERE pr.user_id <> OLD.user_id
        AND pr.user_id <> 'usr_sa_top_admin_test_customer'
        AND pr.role IN ('top', 'platform_admin')
        AND au.disabled_at IS NULL
        AND au.age_eligibility_status = 'eligible_14_plus'
      FOR SHARE OF pr, au
    ) locked_tops;

    PERFORM set_config('app.auth_internal', v_prev_auth, true);

    IF v_remaining < 1 THEN
      RAISE EXCEPTION 'LAST_TOP_ADMIN_PROTECTED: BiteShark requires at least one active, eligible Admin: Top account.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_last_top_admin_on_auth_users()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_is_top boolean;
  v_remaining integer;
  v_prev_auth text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NOT (
      (OLD.disabled_at IS NULL AND NEW.disabled_at IS NOT NULL)
      OR (OLD.age_eligibility_status = 'eligible_14_plus' AND COALESCE(NEW.age_eligibility_status, '') <> 'eligible_14_plus')
    ) THEN
      RETURN NEW;
    END IF;
  END IF;

  IF public.is_last_top_cleanup_authorized() THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.platform_roles pr
    WHERE pr.user_id = OLD.id
      AND pr.user_id <> 'usr_sa_top_admin_test_customer'
      AND pr.role IN ('top', 'platform_admin')
  ) INTO v_is_top;

  IF NOT v_is_top THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('biteshark_platform_roles_mutation'));

  v_prev_auth := COALESCE(current_setting('app.auth_internal', true), '');
  PERFORM set_config('app.auth_internal', 'true', true);

  SELECT count(*)::int INTO v_remaining
  FROM (
    SELECT pr.user_id
    FROM public.platform_roles pr
    JOIN public.auth_users au ON au.id = pr.user_id
    WHERE pr.user_id <> OLD.id
      AND pr.user_id <> 'usr_sa_top_admin_test_customer'
      AND pr.role IN ('top', 'platform_admin')
      AND au.disabled_at IS NULL
      AND au.age_eligibility_status = 'eligible_14_plus'
    FOR SHARE OF pr, au
  ) locked_tops;

  PERFORM set_config('app.auth_internal', v_prev_auth, true);

  IF v_remaining < 1 THEN
    RAISE EXCEPTION 'LAST_TOP_ADMIN_PROTECTED: BiteShark requires at least one active, eligible Admin: Top account.'
      USING ERRCODE = 'P0001';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Enable & FORCE ROW LEVEL SECURITY on `favorites` and `notification_settings`
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorites FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS favorites_owner_all ON public.favorites;
CREATE POLICY favorites_owner_all ON public.favorites
  FOR ALL
  USING (
    (current_setting('app.user_id', true) <> '' AND user_id = current_setting('app.user_id', true))
    OR (
      (current_setting('app.auth_internal', true) = 'true' OR current_setting('app.admin_portal', true) = 'true')
      AND pg_has_role(
        current_user,
        (SELECT relowner FROM pg_class WHERE oid = 'public.favorites'::regclass),
        'MEMBER'
      )
    )
  )
  WITH CHECK (
    (current_setting('app.user_id', true) <> '' AND user_id = current_setting('app.user_id', true))
    OR (
      (current_setting('app.auth_internal', true) = 'true' OR current_setting('app.admin_portal', true) = 'true')
      AND pg_has_role(
        current_user,
        (SELECT relowner FROM pg_class WHERE oid = 'public.favorites'::regclass),
        'MEMBER'
      )
    )
  );

ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_settings FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_settings_owner_all ON public.notification_settings;
CREATE POLICY notification_settings_owner_all ON public.notification_settings
  FOR ALL
  USING (
    (current_setting('app.user_id', true) <> '' AND user_id = current_setting('app.user_id', true))
    OR (
      (current_setting('app.auth_internal', true) = 'true' OR current_setting('app.admin_portal', true) = 'true')
      AND pg_has_role(
        current_user,
        (SELECT relowner FROM pg_class WHERE oid = 'public.notification_settings'::regclass),
        'MEMBER'
      )
    )
  )
  WITH CHECK (
    (current_setting('app.user_id', true) <> '' AND user_id = current_setting('app.user_id', true))
    OR (
      (current_setting('app.auth_internal', true) = 'true' OR current_setting('app.admin_portal', true) = 'true')
      AND pg_has_role(
        current_user,
        (SELECT relowner FROM pg_class WHERE oid = 'public.notification_settings'::regclass),
        'MEMBER'
      )
    )
  );
