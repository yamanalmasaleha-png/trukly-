-- Migration 026: Urgent Pre-Pilot Security Hardening — Last-Top Lockout Protection (`BS-AUD-002`)
--
-- Security guarantees:
--   1. Explicit counted-account criteria (no email-domain heuristics):
--      A valid remaining `Admin: Top` administrator MUST simultaneously satisfy:
--        - `public.platform_roles.role IN ('top', 'platform_admin')`
--        - Matching row in `public.auth_users` (`au.id = pr.user_id`)
--        - `au.disabled_at IS NULL`
--        - `au.age_eligibility_status = 'eligible_14_plus'`
--      Orphaned `platform_roles` rows, suspended accounts, and unassessed/ineligible accounts
--      NEVER satisfy last-Top protection.
--   2. Enforced across BOTH `public.platform_roles` (demotion / role deletion across `'top'` and
--      `'platform_admin'` aliases) AND `public.auth_users` (account suspension, age-eligibility
--      downgrade/revocation, and account deletion).
--   3. Concurrency-safe under `READ COMMITTED`: acquires `pg_advisory_xact_lock(hashtext('biteshark_platform_roles_mutation'))`
--      plus `FOR SHARE OF pr, au` while temporarily setting transaction-local `app.auth_internal = 'true'`
--      (and restoring its prior value) so `FORCE ROW LEVEL SECURITY` on `auth_users` cannot hide rows
--      from the trigger.
--   4. Maintenance bypass hardening: `app.allow_last_top_cleanup = 'true'` is honored ONLY when the
--      executing database role owns `public.platform_roles` (i.e. `migrator` or superuser in an explicit
--      operator emergency session) and NEVER for the unprivileged runtime application role.

CREATE OR REPLACE FUNCTION public.is_last_top_cleanup_authorized()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    current_setting('app.allow_last_top_cleanup', true) = 'true'
    AND pg_has_role(
      current_user,
      (SELECT relowner FROM pg_class WHERE oid = 'public.platform_roles'::regclass),
      'MEMBER'
    );
$$;

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

DROP TRIGGER IF EXISTS trg_protect_last_top_admin ON public.platform_roles;
CREATE TRIGGER trg_protect_last_top_admin
  BEFORE UPDATE OR DELETE ON public.platform_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_last_top_admin();

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

DROP TRIGGER IF EXISTS trg_protect_last_top_admin_on_auth_users ON public.auth_users;
CREATE TRIGGER trg_protect_last_top_admin_on_auth_users
  BEFORE UPDATE OR DELETE ON public.auth_users
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_last_top_admin_on_auth_users();
