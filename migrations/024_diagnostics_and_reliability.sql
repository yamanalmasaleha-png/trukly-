-- Migration 024: Bounded Operational Diagnostics, Release Attribution & Community Idempotency
--
-- Purpose:
--   1. Adds optional `idempotency_key` to `community_reviews` with a per-author unique partial index
--      so timed-out or retried community submissions never create duplicate pending reviews.
--   2. Creates `worker_runtime_heartbeats` (`FORCE ROW LEVEL SECURITY`) so background workers record
--      truthful operational liveness and release attribution without exposing internal credentials.
--   3. Creates bounded operational diagnostic tables (`diagnostic_releases`, `diagnostic_incident_groups`,
--      `diagnostic_event_samples`, and append-only `diagnostic_incident_notes`), kept explicitly separate
--      from `audit_logs` (different purpose, Mod/Top permissions, and configurable retention).
--   4. Enforces database-level size/format constraints (`?`/`#` forbidden in `route_template`, bounded
--      JSONB context size, strict enums) and `FORCE ROW LEVEL SECURITY` on all new tables.

-- 1. Idempotent community review submissions
ALTER TABLE community_reviews
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

ALTER TABLE community_reviews
  DROP CONSTRAINT IF EXISTS community_reviews_idempotency_key_chk,
  ADD CONSTRAINT community_reviews_idempotency_key_chk
    CHECK (
      idempotency_key IS NULL
      OR (
        char_length(btrim(idempotency_key)) BETWEEN 8 AND 80
        AND idempotency_key ~ '^[A-Za-z0-9_.:-]+$'
      )
    );

CREATE UNIQUE INDEX IF NOT EXISTS idx_community_reviews_author_idem
  ON community_reviews (author_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- 2. Worker operational heartbeat state
CREATE TABLE IF NOT EXISTS worker_runtime_heartbeats (
  worker_name TEXT PRIMARY KEY
    CHECK (worker_name ~ '^[a-z0-9_-]{2,64}$'),
  last_run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_status TEXT NOT NULL
    CHECK (last_status IN ('ok', 'degraded', 'error')),
  release_sha TEXT
    CHECK (release_sha IS NULL OR char_length(btrim(release_sha)) BETWEEN 1 AND 64),
  last_correlation_id TEXT
    CHECK (last_correlation_id IS NULL OR char_length(btrim(last_correlation_id)) BETWEEN 1 AND 64),
  last_summary JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (octet_length(last_summary::text) <= 1024),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE worker_runtime_heartbeats ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_runtime_heartbeats FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS worker_runtime_heartbeats_rls ON worker_runtime_heartbeats;
CREATE POLICY worker_runtime_heartbeats_rls ON worker_runtime_heartbeats
  FOR ALL
  USING (
    current_setting('app.admin_portal', true) = 'true'
    OR current_setting('app.diagnostics_internal', true) = 'true'
    OR current_setting('app.worker_internal', true) = 'true'
  )
  WITH CHECK (
    current_setting('app.admin_portal', true) = 'true'
    OR current_setting('app.diagnostics_internal', true) = 'true'
    OR current_setting('app.worker_internal', true) = 'true'
  );

-- 3. Release history observed by standalone API/worker startups (append/update-only; never deleted)
CREATE TABLE IF NOT EXISTS diagnostic_releases (
  release_sha TEXT PRIMARY KEY
    CHECK (char_length(btrim(release_sha)) BETWEEN 1 AND 64 AND release_sha ~ '^[A-Za-z0-9._-]+$'),
  environment TEXT NOT NULL
    CHECK (char_length(btrim(environment)) BETWEEN 2 AND 32),
  previous_release_sha TEXT
    CHECK (previous_release_sha IS NULL OR (char_length(btrim(previous_release_sha)) BETWEEN 1 AND 64 AND previous_release_sha ~ '^[A-Za-z0-9._-]+$')),
  deploy_mode TEXT NOT NULL DEFAULT 'startup'
    CHECK (deploy_mode IN ('startup', 'worker_startup', 'manual_record')),
  client_bundle_version TEXT
    CHECK (client_bundle_version IS NULL OR char_length(btrim(client_bundle_version)) BETWEEN 1 AND 64),
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  startup_count BIGINT NOT NULL DEFAULT 1 CHECK (startup_count >= 1),
  notes TEXT CHECK (notes IS NULL OR char_length(notes) <= 400)
);

CREATE INDEX IF NOT EXISTS idx_diagnostic_releases_first_seen
  ON diagnostic_releases (first_seen_at DESC);

ALTER TABLE diagnostic_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE diagnostic_releases FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS diagnostic_releases_rls ON diagnostic_releases;
CREATE POLICY diagnostic_releases_rls ON diagnostic_releases
  FOR ALL
  USING (
    current_setting('app.admin_portal', true) = 'true'
    OR current_setting('app.diagnostics_internal', true) = 'true'
  )
  WITH CHECK (
    current_setting('app.admin_portal', true) = 'true'
    OR current_setting('app.diagnostics_internal', true) = 'true'
  );

REVOKE DELETE ON diagnostic_releases FROM PUBLIC;

-- 4. Grouped operational diagnostic incidents
CREATE TABLE IF NOT EXISTS diagnostic_incident_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint TEXT NOT NULL UNIQUE
    CHECK (fingerprint ~ '^[0-9a-f]{32,64}$'),
  title TEXT NOT NULL
    CHECK (char_length(btrim(title)) BETWEEN 1 AND 180),
  emitting_component TEXT NOT NULL
    CHECK (emitting_component IN ('browser', 'api', 'worker', 'external_provider')),
  trust_level TEXT NOT NULL
    CHECK (trust_level IN ('server_verified', 'browser_untrusted')),
  feature_key TEXT NOT NULL
    CHECK (feature_key ~ '^[a-z0-9_-]{2,48}$'),
  operation_name TEXT NOT NULL
    CHECK (operation_name ~ '^[A-Za-z0-9_.:/-]{2,96}$'),
  route_template TEXT
    CHECK (
      route_template IS NULL
      OR (
        char_length(route_template) BETWEEN 1 AND 140
        AND position('?' in route_template) = 0
        AND position('#' in route_template) = 0
      )
    ),
  severity TEXT NOT NULL
    CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  error_code TEXT NOT NULL
    CHECK (error_code ~ '^[A-Za-z0-9_.:-]{2,80}$'),
  sanitized_summary TEXT NOT NULL
    CHECK (char_length(btrim(sanitized_summary)) BETWEEN 1 AND 320),
  user_impact TEXT NOT NULL
    CHECK (char_length(btrim(user_impact)) BETWEEN 1 AND 320),
  safe_next_steps TEXT NOT NULL
    CHECK (char_length(btrim(safe_next_steps)) BETWEEN 1 AND 360),
  retryable BOOLEAN,
  outcome_state TEXT
    CHECK (
      outcome_state IS NULL
      OR outcome_state IN (
        'failed',
        'outcome_uncertain',
        'partial_success',
        'temporarily_unavailable',
        'degraded'
      )
    ),
  is_synthetic_test BOOLEAN NOT NULL DEFAULT false,
  mod_visible BOOLEAN NOT NULL DEFAULT true,
  triage_status TEXT NOT NULL DEFAULT 'new'
    CHECK (triage_status IN ('new', 'investigating', 'monitoring', 'resolved')),
  suspected_cause TEXT
    CHECK (suspected_cause IS NULL OR char_length(suspected_cause) <= 600),
  suspected_fix_sha TEXT
    CHECK (suspected_fix_sha IS NULL OR suspected_fix_sha ~ '^[0-9a-f]{7,40}$'),
  fix_recorded_at TIMESTAMPTZ,
  fix_recorded_by TEXT
    CHECK (fix_recorded_by IS NULL OR char_length(btrim(fix_recorded_by)) BETWEEN 1 AND 128),
  occurrence_count BIGINT NOT NULL DEFAULT 1
    CHECK (occurrence_count >= 1),
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  first_server_release_sha TEXT
    CHECK (first_server_release_sha IS NULL OR char_length(btrim(first_server_release_sha)) BETWEEN 1 AND 64),
  last_server_release_sha TEXT
    CHECK (last_server_release_sha IS NULL OR char_length(btrim(last_server_release_sha)) BETWEEN 1 AND 64),
  observed_server_releases TEXT[] NOT NULL DEFAULT '{}'
    CHECK (cardinality(observed_server_releases) <= 16),
  observed_client_builds TEXT[] NOT NULL DEFAULT '{}'
    CHECK (cardinality(observed_client_builds) <= 16),
  stale_client_observed BOOLEAN NOT NULL DEFAULT false,
  continued_after_suspected_fix BOOLEAN NOT NULL DEFAULT false,
  last_correlation_id TEXT
    CHECK (last_correlation_id IS NULL OR char_length(btrim(last_correlation_id)) BETWEEN 1 AND 64),
  last_sample_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_diag_groups_last_seen
  ON diagnostic_incident_groups (last_seen_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_diag_groups_filter
  ON diagnostic_incident_groups (triage_status, severity, feature_key, emitting_component, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_diag_groups_corr
  ON diagnostic_incident_groups (last_correlation_id)
  WHERE last_correlation_id IS NOT NULL;

ALTER TABLE diagnostic_incident_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE diagnostic_incident_groups FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS diagnostic_incident_groups_rls ON diagnostic_incident_groups;
CREATE POLICY diagnostic_incident_groups_rls ON diagnostic_incident_groups
  FOR ALL
  USING (
    current_setting('app.admin_portal', true) = 'true'
    OR current_setting('app.diagnostics_internal', true) = 'true'
  )
  WITH CHECK (
    current_setting('app.admin_portal', true) = 'true'
    OR current_setting('app.diagnostics_internal', true) = 'true'
  );

-- 5. Representative sanitized event samples (rate-capped & pruned per group)
CREATE TABLE IF NOT EXISTS diagnostic_event_samples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES diagnostic_incident_groups(id) ON DELETE CASCADE,
  occurred_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  emitting_component TEXT NOT NULL
    CHECK (emitting_component IN ('browser', 'api', 'worker', 'external_provider')),
  trust_level TEXT NOT NULL
    CHECK (trust_level IN ('server_verified', 'browser_untrusted')),
  server_release_sha TEXT NOT NULL
    CHECK (char_length(btrim(server_release_sha)) BETWEEN 1 AND 64),
  client_build_version TEXT
    CHECK (client_build_version IS NULL OR char_length(btrim(client_build_version)) BETWEEN 1 AND 64),
  client_loaded_release_sha TEXT
    CHECK (client_loaded_release_sha IS NULL OR char_length(btrim(client_loaded_release_sha)) BETWEEN 1 AND 64),
  is_stale_client BOOLEAN NOT NULL DEFAULT false,
  feature_key TEXT NOT NULL
    CHECK (feature_key ~ '^[a-z0-9_-]{2,48}$'),
  operation_name TEXT NOT NULL
    CHECK (operation_name ~ '^[A-Za-z0-9_.:/-]{2,96}$'),
  route_template TEXT
    CHECK (
      route_template IS NULL
      OR (
        char_length(route_template) BETWEEN 1 AND 140
        AND position('?' in route_template) = 0
        AND position('#' in route_template) = 0
      )
    ),
  http_method TEXT
    CHECK (http_method IS NULL OR http_method IN ('GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS')),
  http_status INTEGER
    CHECK (http_status IS NULL OR (http_status BETWEEN 100 AND 599)),
  severity TEXT NOT NULL
    CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  error_code TEXT NOT NULL
    CHECK (error_code ~ '^[A-Za-z0-9_.:-]{2,80}$'),
  sanitized_message TEXT NOT NULL
    CHECK (char_length(btrim(sanitized_message)) BETWEEN 1 AND 320),
  user_impact TEXT NOT NULL
    CHECK (char_length(btrim(user_impact)) BETWEEN 1 AND 320),
  correlation_id TEXT
    CHECK (correlation_id IS NULL OR char_length(btrim(correlation_id)) BETWEEN 1 AND 64),
  duration_ms INTEGER
    CHECK (duration_ms IS NULL OR (duration_ms >= 0 AND duration_ms <= 600000)),
  retryable BOOLEAN,
  outcome_state TEXT
    CHECK (
      outcome_state IS NULL
      OR outcome_state IN (
        'failed',
        'outcome_uncertain',
        'partial_success',
        'temporarily_unavailable',
        'degraded'
      )
    ),
  safe_context JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (octet_length(safe_context::text) <= 2048)
);

CREATE INDEX IF NOT EXISTS idx_diag_samples_group_recent
  ON diagnostic_event_samples (group_id, received_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_diag_samples_corr
  ON diagnostic_event_samples (correlation_id)
  WHERE correlation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_diag_samples_received
  ON diagnostic_event_samples (received_at DESC);

ALTER TABLE diagnostic_event_samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE diagnostic_event_samples FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS diagnostic_event_samples_rls ON diagnostic_event_samples;
CREATE POLICY diagnostic_event_samples_rls ON diagnostic_event_samples
  FOR ALL
  USING (
    current_setting('app.admin_portal', true) = 'true'
    OR current_setting('app.diagnostics_internal', true) = 'true'
  )
  WITH CHECK (
    current_setting('app.admin_portal', true) = 'true'
    OR current_setting('app.diagnostics_internal', true) = 'true'
  );

-- 6. Append-only operator notes & triage history (decoupled from sample/group retention cleanup)
CREATE TABLE IF NOT EXISTS diagnostic_incident_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL,
  group_fingerprint TEXT NOT NULL
    CHECK (group_fingerprint ~ '^[0-9a-f]{32,64}$'),
  group_title TEXT NOT NULL
    CHECK (char_length(btrim(group_title)) BETWEEN 1 AND 180),
  mod_visible BOOLEAN NOT NULL DEFAULT true,
  actor_id TEXT NOT NULL
    CHECK (char_length(btrim(actor_id)) BETWEEN 1 AND 128),
  actor_role TEXT NOT NULL
    CHECK (actor_role IN ('mod', 'top')),
  action_type TEXT NOT NULL
    CHECK (action_type IN ('note', 'triage_update', 'fix_reference')),
  previous_triage_status TEXT
    CHECK (previous_triage_status IS NULL OR previous_triage_status IN ('new', 'investigating', 'monitoring', 'resolved')),
  new_triage_status TEXT
    CHECK (new_triage_status IS NULL OR new_triage_status IN ('new', 'investigating', 'monitoring', 'resolved')),
  suspected_cause TEXT
    CHECK (suspected_cause IS NULL OR char_length(suspected_cause) <= 600),
  suspected_fix_sha TEXT
    CHECK (suspected_fix_sha IS NULL OR suspected_fix_sha ~ '^[0-9a-f]{7,40}$'),
  note_body TEXT NOT NULL
    CHECK (char_length(btrim(note_body)) BETWEEN 1 AND 1500),
  correlation_id TEXT
    CHECK (correlation_id IS NULL OR char_length(btrim(correlation_id)) BETWEEN 1 AND 64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_diag_notes_group
  ON diagnostic_incident_notes (group_id, created_at ASC, id ASC);

CREATE INDEX IF NOT EXISTS idx_diag_notes_fingerprint
  ON diagnostic_incident_notes (group_fingerprint, created_at ASC, id ASC);

ALTER TABLE diagnostic_incident_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE diagnostic_incident_notes FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS diagnostic_incident_notes_rls ON diagnostic_incident_notes;
CREATE POLICY diagnostic_incident_notes_rls ON diagnostic_incident_notes
  FOR ALL
  USING (
    current_setting('app.admin_portal', true) = 'true'
    OR current_setting('app.diagnostics_internal', true) = 'true'
  )
  WITH CHECK (
    current_setting('app.admin_portal', true) = 'true'
    OR current_setting('app.diagnostics_internal', true) = 'true'
  );

REVOKE UPDATE, DELETE ON diagnostic_incident_notes FROM PUBLIC;
