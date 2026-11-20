-- Migration 021: Bounded, Secret-Redacted Authentication Delivery Diagnostics
--
-- Purpose:
--   1. Distinguishes authentication stages (`invalid_email`, `delivery_unavailable`,
--      `allowlist_denied`, `rate_limited`, `age_ineligible`, `unknown_signin_noop`,
--      `staging_mailbox_stored`, `provider_accepted`, `provider_rejected`,
--      `provider_timeout`, `verify_succeeded`, `verify_failed`, `account_disabled`)
--      using sanitized correlation IDs (`corr_<hex>`) and bounded 7-day retention.
--   2. Strictly prohibits storing raw OTP codes, dates of birth, session tokens,
--      API credentials, mailbox secrets, or recipient email addresses.
--   3. Protected by `FORCE ROW LEVEL SECURITY` (`app.auth_internal = 'true'`).

CREATE TABLE IF NOT EXISTS auth_delivery_telemetry (
  id BIGSERIAL PRIMARY KEY,
  correlation_id TEXT NOT NULL
    CHECK (correlation_id ~ '^corr_[0-9a-f]{12,32}$'),
  flow TEXT NOT NULL
    CHECK (flow IN ('start', 'verify')),
  delivery_mode TEXT NOT NULL
    CHECK (length(btrim(delivery_mode)) BETWEEN 2 AND 32),
  outcome_stage TEXT NOT NULL
    CHECK (
      outcome_stage IN (
        'invalid_email',
        'delivery_unavailable',
        'allowlist_denied',
        'rate_limited',
        'age_ineligible',
        'unknown_signin_noop',
        'staging_mailbox_stored',
        'provider_accepted',
        'provider_rejected',
        'provider_timeout',
        'verify_succeeded',
        'verify_failed',
        'account_disabled'
      )
    ),
  http_status INTEGER NOT NULL
    CHECK (http_status BETWEEN 200 AND 599),
  provider_status INTEGER
    CHECK (provider_status IS NULL OR (provider_status BETWEEN 100 AND 599)),
  provider_message_id TEXT
    CHECK (
      provider_message_id IS NULL
      OR (
        length(btrim(provider_message_id)) BETWEEN 1 AND 128
        AND provider_message_id ~ '^[A-Za-z0-9._:@/-]+$'
      )
    ),
  error_code TEXT
    CHECK (
      error_code IS NULL
      OR (
        length(btrim(error_code)) BETWEEN 1 AND 80
        AND error_code ~ '^[A-Za-z0-9_.:-]+$'
      )
    ),
  is_designated_test BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_delivery_telemetry_created_desc
  ON auth_delivery_telemetry (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_auth_delivery_telemetry_outcome_created
  ON auth_delivery_telemetry (outcome_stage, created_at DESC);

ALTER TABLE auth_delivery_telemetry ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_delivery_telemetry FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS auth_delivery_telemetry_internal_only ON auth_delivery_telemetry;
CREATE POLICY auth_delivery_telemetry_internal_only ON auth_delivery_telemetry
  FOR ALL
  USING (current_setting('app.auth_internal', true) = 'true')
  WITH CHECK (current_setting('app.auth_internal', true) = 'true');
