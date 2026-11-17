-- Migration 017: Standalone PostgreSQL Authentication, OTP Challenges, Server Sessions & Staging Mailbox
--
-- Security & Isolation Guarantees:
--   1. Creates opaque standalone user IDs (`usr_sa_<hex>`) in `auth_users`. Never auto-links
--      legacy Hatchable accounts, memberships, or roles merely because an email address matches.
--   2. Stores verification codes strictly as keyed HMAC-SHA256 digests (`code_hmac`) with bounded
--      expiry, max-attempt lockouts, and row-locked single-use consumption (`consumed_at`).
--   3. Stores server sessions strictly as SHA-256 token digests (`token_sha256`) with immediate
--      server-side logout/revocation (`revoked_at`) and sliding/hard expiration.
--   4. Enforces `FORCE ROW LEVEL SECURITY` (`current_setting('app.auth_internal', true) = 'true'`)
--      across all `auth_*` tables so a `NOBYPASSRLS` application connection cannot read or mutate
--      authentication state outside dedicated `lib/standalone-auth.js` transactions.

CREATE TABLE IF NOT EXISTS auth_users (
  id TEXT PRIMARY KEY CHECK (length(btrim(id)) BETWEEN 8 AND 128),
  email_normalized TEXT NOT NULL UNIQUE
    CHECK (
      email_normalized = lower(btrim(email_normalized))
      AND length(email_normalized) BETWEEN 3 AND 254
      AND position('@' in email_normalized) > 1
    ),
  disabled_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth_otp_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_normalized TEXT NOT NULL
    CHECK (email_normalized = lower(btrim(email_normalized)) AND length(email_normalized) BETWEEN 3 AND 254),
  code_hmac TEXT NOT NULL CHECK (length(code_hmac) = 64),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0 AND attempts <= max_attempts),
  max_attempts INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 10),
  requester_ip_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  invalidated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_otp_one_active_per_email
  ON auth_otp_challenges (email_normalized)
  WHERE consumed_at IS NULL AND invalidated_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_auth_otp_challenges_expires
  ON auth_otp_challenges (expires_at);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_sha256 TEXT NOT NULL UNIQUE CHECK (length(token_sha256) = 64),
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  ip_hash TEXT,
  ua_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  max_expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_active
  ON auth_sessions (user_id, expires_at DESC)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires
  ON auth_sessions (expires_at);

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  bucket_key TEXT NOT NULL CHECK (length(bucket_key) BETWEEN 8 AND 128),
  window_start TIMESTAMPTZ NOT NULL,
  hit_count INTEGER NOT NULL DEFAULT 1 CHECK (hit_count >= 1),
  PRIMARY KEY (bucket_key, window_start)
);

CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_window
  ON auth_rate_limits (window_start);

-- Staging-only AES-256-GCM encrypted test mailbox (inaccessible in production; purged on consume/expiry)
CREATE TABLE IF NOT EXISTS auth_staging_mailbox (
  challenge_id UUID PRIMARY KEY REFERENCES auth_otp_challenges(id) ON DELETE CASCADE,
  email_normalized TEXT NOT NULL,
  ciphertext_b64 TEXT NOT NULL,
  iv_b64 TEXT NOT NULL,
  auth_tag_b64 TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_staging_mailbox_email
  ON auth_staging_mailbox (email_normalized, created_at DESC);

-- Enforce FORCE ROW LEVEL SECURITY across every auth_* table
ALTER TABLE auth_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_users FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_users_internal_only ON auth_users;
CREATE POLICY auth_users_internal_only ON auth_users
  FOR ALL
  USING (current_setting('app.auth_internal', true) = 'true')
  WITH CHECK (current_setting('app.auth_internal', true) = 'true');

ALTER TABLE auth_otp_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_otp_challenges FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_otp_challenges_internal_only ON auth_otp_challenges;
CREATE POLICY auth_otp_challenges_internal_only ON auth_otp_challenges
  FOR ALL
  USING (current_setting('app.auth_internal', true) = 'true')
  WITH CHECK (current_setting('app.auth_internal', true) = 'true');

ALTER TABLE auth_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_sessions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_sessions_internal_only ON auth_sessions;
CREATE POLICY auth_sessions_internal_only ON auth_sessions
  FOR ALL
  USING (current_setting('app.auth_internal', true) = 'true')
  WITH CHECK (current_setting('app.auth_internal', true) = 'true');

ALTER TABLE auth_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_rate_limits FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_rate_limits_internal_only ON auth_rate_limits;
CREATE POLICY auth_rate_limits_internal_only ON auth_rate_limits
  FOR ALL
  USING (current_setting('app.auth_internal', true) = 'true')
  WITH CHECK (current_setting('app.auth_internal', true) = 'true');

ALTER TABLE auth_staging_mailbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_staging_mailbox FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_staging_mailbox_internal_only ON auth_staging_mailbox;
CREATE POLICY auth_staging_mailbox_internal_only ON auth_staging_mailbox
  FOR ALL
  USING (current_setting('app.auth_internal', true) = 'true')
  WITH CHECK (current_setting('app.auth_internal', true) = 'true');
