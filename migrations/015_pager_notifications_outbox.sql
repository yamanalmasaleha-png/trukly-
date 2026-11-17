-- P1 (Item 6): Durable Pickup-Pager Notification Subscriptions, Transactional Outbox,
-- Bounded Lease Delivery Queue, Rate-Limit Buckets & FORCE ROW LEVEL SECURITY.
--
-- Security & Privacy Invariants:
--   1. None of these tables are exposed in `hatchable.toml`; all access goes through backend APIs.
--   2. `FORCE ROW LEVEL SECURITY` requires transaction-local `app.pager_internal = 'true'`
--      so accidental unpinned or direct-gateway queries fail closed with zero rows.
--   3. Inactive subscriptions (`unsubscribed`, `invalidated`, `expired`) are enforced by
--      CHECK constraint `pager_sub_material_scrubbed_chk` to have NULL endpoint/key/token columns.

ALTER TABLE pickup_pagers
  ADD COLUMN IF NOT EXISTS ready_notified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ready_notify_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS pager_notification_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pager_id UUID NOT NULL REFERENCES pickup_pagers(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('web_push', 'apns', 'fcm')),
  destination_hash TEXT NOT NULL,
  endpoint_url TEXT,
  p256dh_key TEXT,
  auth_secret TEXT,
  device_token TEXT,
  unsubscribe_token_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'unsubscribed', 'invalidated', 'expired')),
  platform_hint TEXT,
  invalidated_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT pager_sub_unique_dest UNIQUE (pager_id, destination_hash),
  CONSTRAINT pager_sub_material_scrubbed_chk CHECK (
    (
      status = 'active'
      AND (
        (channel = 'web_push' AND endpoint_url IS NOT NULL AND p256dh_key IS NOT NULL AND auth_secret IS NOT NULL AND device_token IS NULL)
        OR
        (channel IN ('apns', 'fcm') AND device_token IS NOT NULL AND endpoint_url IS NULL AND p256dh_key IS NULL AND auth_secret IS NULL)
      )
    )
    OR
    (
      status IN ('unsubscribed', 'invalidated', 'expired')
      AND endpoint_url IS NULL
      AND p256dh_key IS NULL
      AND auth_secret IS NULL
      AND device_token IS NULL
    )
  )
);

CREATE INDEX IF NOT EXISTS pager_sub_active_pager_idx
  ON pager_notification_subscriptions (pager_id, status, expires_at);

CREATE TABLE IF NOT EXISTS pager_notification_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pager_id UUID NOT NULL REFERENCES pickup_pagers(id) ON DELETE CASCADE,
  vendor_id TEXT REFERENCES vendors(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('pager.ready')),
  transition_seq INTEGER NOT NULL CHECK (transition_seq >= 1),
  dedupe_key TEXT NOT NULL UNIQUE,
  collapse_key TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS pager_events_pager_idx
  ON pager_notification_events (pager_id, created_at DESC);

CREATE TABLE IF NOT EXISTS pager_notification_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES pager_notification_events(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES pager_notification_subscriptions(id) ON DELETE CASCADE,
  pager_id UUID NOT NULL REFERENCES pickup_pagers(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (
    status IN ('queued', 'processing', 'delivered', 'retry_scheduled', 'failed_permanent', 'expired', 'suppressed')
  ),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 10),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lease_owner TEXT,
  lease_expires_at TIMESTAMPTZ,
  provider_name TEXT,
  provider_status INTEGER,
  last_error_code TEXT,
  last_error_redacted TEXT,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pager_delivery_event_sub_uidx UNIQUE (event_id, subscription_id)
);

CREATE INDEX IF NOT EXISTS pager_deliveries_claim_idx
  ON pager_notification_deliveries (status, next_attempt_at ASC, lease_expires_at ASC);

CREATE INDEX IF NOT EXISTS pager_deliveries_pager_idx
  ON pager_notification_deliveries (pager_id, status);

CREATE TABLE IF NOT EXISTS pager_rate_limits (
  bucket_key TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  hit_count INTEGER NOT NULL DEFAULT 1 CHECK (hit_count >= 1),
  PRIMARY KEY (bucket_key, window_start)
);

-- Enable FORCE ROW LEVEL SECURITY across notification tables so only trusted backend
-- transactions setting `SET LOCAL app.pager_internal = 'true'` can read or mutate rows.
ALTER TABLE pager_notification_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pager_notification_subscriptions FORCE ROW LEVEL SECURITY;

ALTER TABLE pager_notification_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE pager_notification_events FORCE ROW LEVEL SECURITY;

ALTER TABLE pager_notification_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE pager_notification_deliveries FORCE ROW LEVEL SECURITY;

ALTER TABLE pager_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE pager_rate_limits FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'pager_notification_subscriptions' AND policyname = 'pager_sub_internal_only'
  ) THEN
    CREATE POLICY pager_sub_internal_only ON pager_notification_subscriptions
      FOR ALL
      USING (current_setting('app.pager_internal', true) = 'true')
      WITH CHECK (current_setting('app.pager_internal', true) = 'true');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'pager_notification_events' AND policyname = 'pager_events_internal_only'
  ) THEN
    CREATE POLICY pager_events_internal_only ON pager_notification_events
      FOR ALL
      USING (current_setting('app.pager_internal', true) = 'true')
      WITH CHECK (current_setting('app.pager_internal', true) = 'true');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'pager_notification_deliveries' AND policyname = 'pager_deliveries_internal_only'
  ) THEN
    CREATE POLICY pager_deliveries_internal_only ON pager_notification_deliveries
      FOR ALL
      USING (current_setting('app.pager_internal', true) = 'true')
      WITH CHECK (current_setting('app.pager_internal', true) = 'true');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'pager_rate_limits' AND policyname = 'pager_ratelimit_internal_only'
  ) THEN
    CREATE POLICY pager_ratelimit_internal_only ON pager_rate_limits
      FOR ALL
      USING (current_setting('app.pager_internal', true) = 'true')
      WITH CHECK (current_setting('app.pager_internal', true) = 'true');
  END IF;
END $$;
