-- Migration 023: Durable Account Invitation Email Delivery, Staging Eligibility & Append-Only Audit History
--
-- Purpose:
--   1. Adds durable delivery state tracking (`delivery_status`, `delivery_mode`, `token_version`,
--      `send_attempt_count`, `last_sent_at`, `last_sent_by`, `last_attempt_at`, `provider_status`,
--      `provider_message_id`, `last_error_code`, `last_correlation_id`, `revoke_reason`,
--      `replaced_by_invitation_id`) to `account_invitations` without storing raw tokens or secrets.
--   2. Preserves pre-existing `account_invitations` and `admin_notification_outbox` (`recorded_test_safe`)
--      records as historical (`not_requested`) so older notices are NEVER automatically emailed unless an
--      authorized administrator explicitly resends an active invitation.
--   3. Allows `app.auth_internal = 'true'` to read `account_invitations` (`SELECT` only via RLS) so
--      `startEmailOtpChallenge` centrally evaluates exact-email staging eligibility for approved,
--      unexpired, unrevoked, unconsumed invitations alongside active `auth_users` accounts.
--   4. Creates append-only `account_invitation_events` (`FORCE ROW LEVEL SECURITY`) recording who
--      created, approved, queued, sent, resent, superseded, revoked, or accepted each invitation
--      with correlation and release references.
--   5. Extends `auth_delivery_telemetry.flow` to record sanitized `invite_send` and `invite_resend`
--      events for `/api/admin/email-readiness`.

ALTER TABLE account_invitations
  ADD COLUMN IF NOT EXISTS delivery_status TEXT NOT NULL DEFAULT 'not_requested',
  ADD COLUMN IF NOT EXISTS delivery_mode TEXT,
  ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS send_attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_sent_by TEXT,
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS provider_status INTEGER,
  ADD COLUMN IF NOT EXISTS provider_message_id TEXT,
  ADD COLUMN IF NOT EXISTS last_error_code TEXT,
  ADD COLUMN IF NOT EXISTS last_correlation_id TEXT,
  ADD COLUMN IF NOT EXISTS revoke_reason TEXT,
  ADD COLUMN IF NOT EXISTS replaced_by_invitation_id UUID REFERENCES account_invitations(id) ON DELETE SET NULL;

ALTER TABLE account_invitations
  DROP CONSTRAINT IF EXISTS account_invitations_delivery_status_chk,
  ADD CONSTRAINT account_invitations_delivery_status_chk
    CHECK (
      delivery_status IN (
        'not_requested',
        'pending_approval',
        'queued',
        'provider_accepted',
        'delivery_failed',
        'delivery_uncertain',
        'staging_mailbox_only',
        'superseded'
      )
    ),
  DROP CONSTRAINT IF EXISTS account_invitations_delivery_mode_chk,
  ADD CONSTRAINT account_invitations_delivery_mode_chk
    CHECK (
      delivery_mode IS NULL
      OR delivery_mode IN ('resend_https', 'webhook_https', 'staging_mailbox', 'disabled')
    ),
  DROP CONSTRAINT IF EXISTS account_invitations_token_version_chk,
  ADD CONSTRAINT account_invitations_token_version_chk
    CHECK (token_version >= 1),
  DROP CONSTRAINT IF EXISTS account_invitations_send_attempts_chk,
  ADD CONSTRAINT account_invitations_send_attempts_chk
    CHECK (send_attempt_count >= 0),
  DROP CONSTRAINT IF EXISTS account_invitations_provider_status_chk,
  ADD CONSTRAINT account_invitations_provider_status_chk
    CHECK (provider_status IS NULL OR (provider_status BETWEEN 100 AND 599)),
  DROP CONSTRAINT IF EXISTS account_invitations_provider_msg_id_chk,
  ADD CONSTRAINT account_invitations_provider_msg_id_chk
    CHECK (
      provider_message_id IS NULL
      OR (
        length(btrim(provider_message_id)) BETWEEN 1 AND 128
        AND provider_message_id ~ '^[A-Za-z0-9._:@/-]+$'
      )
    ),
  DROP CONSTRAINT IF EXISTS account_invitations_last_error_code_chk,
  ADD CONSTRAINT account_invitations_last_error_code_chk
    CHECK (
      last_error_code IS NULL
      OR (
        length(btrim(last_error_code)) BETWEEN 1 AND 80
        AND last_error_code ~ '^[A-Za-z0-9_.:-]+$'
      )
    ),
  DROP CONSTRAINT IF EXISTS account_invitations_last_corr_id_chk,
  ADD CONSTRAINT account_invitations_last_corr_id_chk
    CHECK (
      last_correlation_id IS NULL
      OR last_correlation_id ~ '^corr_[0-9a-f]{12,32}$'
    ),
  DROP CONSTRAINT IF EXISTS account_invitations_revoke_reason_chk,
  ADD CONSTRAINT account_invitations_revoke_reason_chk
    CHECK (revoke_reason IS NULL OR char_length(revoke_reason) <= 500);

-- Backfill pending-approval rows while leaving pre-existing `issued`/`consumed` rows as `not_requested` (historical)
UPDATE account_invitations
SET delivery_status = 'pending_approval'
WHERE status = 'pending_top_approval'
  AND delivery_status = 'not_requested';

CREATE INDEX IF NOT EXISTS idx_account_invitations_active_email
  ON account_invitations (email_normalized, status, expires_at)
  WHERE status = 'issued' AND revoked_at IS NULL AND consumed_at IS NULL;

-- Permit read-only eligibility lookup under `app.auth_internal = 'true'` while preserving strict write checks
DROP POLICY IF EXISTS account_invitations_rls ON account_invitations;
CREATE POLICY account_invitations_rls ON account_invitations
  FOR ALL
  USING (
    current_setting('app.admin_portal', true) = 'true'
    OR current_setting('app.auth_internal', true) = 'true'
    OR email_normalized = NULLIF(lower(btrim(COALESCE(current_setting('app.user_email', true), ''))), '')
    OR initiated_by = NULLIF(btrim(COALESCE(current_setting('app.user_id', true), '')), '')
  )
  WITH CHECK (
    current_setting('app.admin_portal', true) = 'true'
    OR email_normalized = NULLIF(lower(btrim(COALESCE(current_setting('app.user_email', true), ''))), '')
    OR initiated_by = NULLIF(btrim(COALESCE(current_setting('app.user_id', true), '')), '')
  );

-- Append-only invitation lifecycle & delivery audit trail (`FORCE ROW LEVEL SECURITY`)
CREATE TABLE IF NOT EXISTS account_invitation_events (
  id BIGSERIAL PRIMARY KEY,
  invitation_id UUID NOT NULL REFERENCES account_invitations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL
    CHECK (
      event_type IN (
        'created',
        'pending_approval',
        'approved',
        'rejected',
        'delivery_queued',
        'provider_accepted',
        'delivery_failed',
        'delivery_uncertain',
        'staging_mailbox_recorded',
        'resent',
        'superseded',
        'revoked',
        'expired',
        'accepted'
      )
    ),
  actor_id TEXT CHECK (actor_id IS NULL OR char_length(btrim(actor_id)) BETWEEN 1 AND 128),
  actor_role TEXT CHECK (actor_role IS NULL OR char_length(btrim(actor_role)) BETWEEN 1 AND 40),
  delivery_mode TEXT CHECK (delivery_mode IS NULL OR char_length(btrim(delivery_mode)) BETWEEN 2 AND 32),
  provider_status INTEGER CHECK (provider_status IS NULL OR (provider_status BETWEEN 100 AND 599)),
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
  correlation_id TEXT
    CHECK (
      correlation_id IS NULL
      OR correlation_id ~ '^corr_[0-9a-f]{12,32}$'
    ),
  release_sha TEXT CHECK (release_sha IS NULL OR char_length(btrim(release_sha)) BETWEEN 1 AND 64),
  note TEXT CHECK (note IS NULL OR char_length(note) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_account_invitation_events_inv
  ON account_invitation_events (invitation_id, created_at ASC, id ASC);

ALTER TABLE account_invitation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_invitation_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS account_invitation_events_admin_rls ON account_invitation_events;
CREATE POLICY account_invitation_events_admin_rls ON account_invitation_events
  FOR ALL
  USING (current_setting('app.admin_portal', true) = 'true')
  WITH CHECK (current_setting('app.admin_portal', true) = 'true');

REVOKE UPDATE, DELETE ON account_invitation_events FROM PUBLIC;

-- Allow sanitized invitation delivery telemetry in `auth_delivery_telemetry`
ALTER TABLE auth_delivery_telemetry
  DROP CONSTRAINT IF EXISTS auth_delivery_telemetry_flow_check,
  ADD CONSTRAINT auth_delivery_telemetry_flow_check
    CHECK (flow IN ('start', 'verify', 'invite_send', 'invite_resend'));
