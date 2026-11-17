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

DELETE FROM community_reviews
WHERE title LIKE '[STG-E2E-%]%'
   OR nickname LIKE 'stg-e2e-%';

DELETE FROM bookings
WHERE location LIKE '[STG-E2E-%]%'
   OR idempotency_key LIKE 'stg-e2e-%';

DELETE FROM pickup_pagers
WHERE ticket LIKE 'STG-%';

DELETE FROM owner_schedule
WHERE location LIKE '[STG-E2E-%]%';

DELETE FROM audit_logs
WHERE action LIKE 'staging.%'
   OR (metadata ->> 'ticket') LIKE 'STG-%';

COMMIT;
