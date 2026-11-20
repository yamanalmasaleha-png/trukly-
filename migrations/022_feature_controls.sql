-- Migration 022: Controlled Feature Management & Append-Only Change History
--
-- Purpose:
--   1. Stores operator-configured state (`enabled` | `paused` | `hidden`), audience
--      (`all` | `staff_beta`), optimistic-concurrency `revision`, and non-secret reason
--      for reviewed feature keys defined in `lib/feature-controls.js`.
--   2. Records an immutable append-only history (`feature_control_history`) for every
--      Admin: Top change and operator CLI recovery action.
--   3. Enforces `FORCE ROW LEVEL SECURITY` so runtime reads require explicit server
--      transaction context and writes require verified `app.is_platform_admin = 'true'`.

CREATE TABLE IF NOT EXISTS feature_controls (
  feature_key TEXT PRIMARY KEY
    CHECK (feature_key ~ '^[a-z0-9_]{3,64}$'),
  configured_state TEXT NOT NULL
    CHECK (configured_state IN ('enabled', 'paused', 'hidden')),
  audience TEXT NOT NULL DEFAULT 'all'
    CHECK (audience IN ('all', 'staff_beta')),
  revision INTEGER NOT NULL DEFAULT 1
    CHECK (revision >= 1),
  reason TEXT NOT NULL
    CHECK (length(btrim(reason)) BETWEEN 4 AND 500),
  updated_by TEXT NOT NULL
    CHECK (length(btrim(updated_by)) BETWEEN 2 AND 128),
  updated_by_email_masked TEXT
    CHECK (updated_by_email_masked IS NULL OR length(updated_by_email_masked) <= 254),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS feature_control_history (
  id BIGSERIAL PRIMARY KEY,
  feature_key TEXT NOT NULL
    CHECK (feature_key ~ '^[a-z0-9_]{3,64}$'),
  previous_state TEXT
    CHECK (previous_state IS NULL OR previous_state IN ('enabled', 'paused', 'hidden')),
  new_state TEXT NOT NULL
    CHECK (new_state IN ('enabled', 'paused', 'hidden')),
  previous_audience TEXT
    CHECK (previous_audience IS NULL OR previous_audience IN ('all', 'staff_beta')),
  new_audience TEXT NOT NULL
    CHECK (new_audience IN ('all', 'staff_beta')),
  revision INTEGER NOT NULL
    CHECK (revision >= 1),
  actor_id TEXT NOT NULL
    CHECK (length(btrim(actor_id)) BETWEEN 2 AND 128),
  actor_role TEXT NOT NULL
    CHECK (actor_role IN ('top', 'platform_admin', 'operator_cli')),
  change_source TEXT NOT NULL
    CHECK (change_source IN ('admin_portal', 'operator_recovery_cli')),
  reason TEXT NOT NULL
    CHECK (length(btrim(reason)) BETWEEN 4 AND 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feature_control_history_key_created
  ON feature_control_history (feature_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_feature_control_history_created_desc
  ON feature_control_history (created_at DESC);

ALTER TABLE feature_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_controls FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS feature_controls_select_policy ON feature_controls;
CREATE POLICY feature_controls_select_policy ON feature_controls
  FOR SELECT
  USING (
    current_setting('app.feature_controls_read', true) = 'true'
    OR current_setting('app.can_moderate', true) = 'true'
    OR current_setting('app.is_platform_admin', true) = 'true'
  );

DROP POLICY IF EXISTS feature_controls_write_top_only ON feature_controls;
CREATE POLICY feature_controls_write_top_only ON feature_controls
  FOR INSERT
  WITH CHECK (current_setting('app.is_platform_admin', true) = 'true');

DROP POLICY IF EXISTS feature_controls_update_top_only ON feature_controls;
CREATE POLICY feature_controls_update_top_only ON feature_controls
  FOR UPDATE
  USING (current_setting('app.is_platform_admin', true) = 'true')
  WITH CHECK (current_setting('app.is_platform_admin', true) = 'true');

ALTER TABLE feature_control_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_control_history FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS feature_control_history_select_admin ON feature_control_history;
CREATE POLICY feature_control_history_select_admin ON feature_control_history
  FOR SELECT
  USING (
    current_setting('app.can_moderate', true) = 'true'
    OR current_setting('app.is_platform_admin', true) = 'true'
  );

DROP POLICY IF EXISTS feature_control_history_insert_top_only ON feature_control_history;
CREATE POLICY feature_control_history_insert_top_only ON feature_control_history
  FOR INSERT
  WITH CHECK (current_setting('app.is_platform_admin', true) = 'true');
