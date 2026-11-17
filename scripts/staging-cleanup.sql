-- Truckly Isolated Hatchable Staging Cleanup SQL
--
-- Safely removes ONLY disposable `[STG-E2E-%]` records created by
-- `tests/staging-hatchable-gates.cjs` (and optional staging probe audit markers).
-- Never truncates tables or deletes non-test records.

BEGIN;

-- Uncomment ONLY after confirming target is the isolated Hatchable staging database:
-- SET LOCAL app.confirm_staging = 'true';

DO $$
BEGIN
  IF COALESCE(current_setting('app.confirm_staging', true), '') <> 'true' THEN
    RAISE EXCEPTION 'Refusing to run staging cleanup without SET LOCAL app.confirm_staging = ''true''.';
  END IF;
END $$;

SELECT set_config('app.can_moderate', 'true', true);
SELECT set_config('app.pager_internal', 'true', true);
SELECT set_config('app.auth_internal', 'true', true);

DO $$
BEGIN
  IF to_regclass('public.auth_staging_mailbox') IS NOT NULL THEN
    DELETE FROM auth_staging_mailbox WHERE expires_at < now() + interval '1 day';
  END IF;
  IF to_regclass('public.auth_rate_limits') IS NOT NULL THEN
    DELETE FROM auth_rate_limits WHERE window_start < now() + interval '1 day';
  END IF;
END $$;

DELETE FROM community_reviews
WHERE title LIKE '[STG-E2E-%]%'
   OR nickname LIKE 'stg-e2e-%';

DELETE FROM bookings
WHERE location LIKE '[STG-E2E-%]%'
   OR idempotency_key LIKE 'stg-e2e-%';

-- Cascades automatically to pager_notification_subscriptions, pager_notification_events,
-- and pager_notification_deliveries for disposable `STG-%` test pagers.
DELETE FROM pickup_pagers
WHERE ticket LIKE 'STG-%';

DELETE FROM pager_rate_limits
WHERE window_start < now() + interval '1 day';

DELETE FROM truck_settings
WHERE location LIKE '[STG-E2E-%]%';

DELETE FROM owner_schedule
WHERE location LIKE '[STG-E2E-%]%';

UPDATE owner_profiles
SET display_name = 'Tacos Iñiguez',
    description = 'Staging Vendor A test profile',
    accepting_bookings = true,
    updated_at = now()
WHERE truck_id = 'iniguez';

DELETE FROM audit_logs
WHERE action LIKE 'staging.%'
   OR (metadata ->> 'ticket') LIKE 'STG-%'
   OR target_id LIKE 'stg-rb-%';

-- Optional full RBAC persona teardown (uncomment if retiring disposable staging test accounts):
-- SELECT set_config('app.is_platform_admin', 'true', true);
-- DELETE FROM vendor_memberships WHERE user_id IN ('<STG_USER_ID_VENDOR_A_OWNER>', '<STG_USER_ID_VENDOR_A_STAFF>', '<STG_USER_ID_VENDOR_B_OWNER>');
-- DELETE FROM platform_roles WHERE user_id IN ('<STG_USER_ID_MODERATOR>', '<STG_USER_ID_PLATFORM_ADMIN>');

COMMIT;
