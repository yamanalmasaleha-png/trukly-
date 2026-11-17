-- P1 Follow-up: Unique per-claim worker fencing tokens, pre-dispatch vs in-flight
-- tracking, and ready-state subscription catch-up origin metadata.
--
-- Invariants enforced by PostgreSQL:
--   1. `pager_delivery_origin_chk`: `delivery_origin` is `'transition'` or `'catchup'`.
--   2. `pager_delivery_lease_consistency_chk`: `status = 'processing'` requires non-null
--      `lease_owner`, `claim_token`, and `lease_expires_at`; all other statuses require
--      those active lease columns to be NULL.

ALTER TABLE pager_notification_deliveries
  ADD COLUMN IF NOT EXISTS claim_token TEXT,
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivery_origin TEXT NOT NULL DEFAULT 'transition';

DO $$
BEGIN
  PERFORM set_config('app.pager_internal', 'true', true);

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pager_delivery_origin_chk'
  ) THEN
    ALTER TABLE pager_notification_deliveries
      ADD CONSTRAINT pager_delivery_origin_chk
      CHECK (delivery_origin IN ('transition', 'catchup'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pager_delivery_lease_consistency_chk'
  ) THEN
    UPDATE pager_notification_deliveries
    SET claim_token = COALESCE(claim_token, 'legacy-claim-' || id::text),
        lease_owner = COALESCE(lease_owner, 'legacy-worker'),
        lease_expires_at = COALESCE(lease_expires_at, now())
    WHERE status = 'processing'
      AND (claim_token IS NULL OR lease_owner IS NULL OR lease_expires_at IS NULL);

    UPDATE pager_notification_deliveries
    SET lease_owner = NULL,
        claim_token = NULL,
        claimed_at = NULL,
        dispatched_at = NULL,
        lease_expires_at = NULL
    WHERE status <> 'processing'
      AND (lease_owner IS NOT NULL OR claim_token IS NOT NULL OR lease_expires_at IS NOT NULL);

    ALTER TABLE pager_notification_deliveries
      ADD CONSTRAINT pager_delivery_lease_consistency_chk CHECK (
        (
          status = 'processing'
          AND lease_owner IS NOT NULL
          AND claim_token IS NOT NULL
          AND lease_expires_at IS NOT NULL
        )
        OR
        (
          status <> 'processing'
          AND lease_owner IS NULL
          AND claim_token IS NULL
          AND lease_expires_at IS NULL
        )
      );
  END IF;
END $$;
