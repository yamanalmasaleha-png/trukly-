-- Migration 025: Connected Support & Feedback Workflow, Lifecycle History, Vendor Scope & Diagnostic Links
--
-- Purpose:
--   1. Additively extends `support_issues` and `support_issue_notes` (no competing ticket table;
--      all existing support tickets, UUIDs, notes, and audit logs are preserved intact).
--   2. Adds human-readable `ticket_number` (`BS-001001`), separate immutable `reporter_urgency`
--      vs staff-managed `severity` (priority + reason), explicit `sharing_scope` (`personal` vs
--      `vendor_service` — forbidding `vendor_service` on customer or `account_access` tickets),
--      unread/waiting indicators, escalation/reopen tracking, and strictly bounded safe technical context.
--   3. Creates append-only `support_issue_events` (`FORCE ROW LEVEL SECURITY`, `REVOKE UPDATE, DELETE`)
--      separating reporter-visible timeline updates from internal triage/assignment/priority events.
--   4. Creates many-to-many `support_issue_diagnostic_links` (`FORCE ROW LEVEL SECURITY`) connecting
--      support tickets and `diagnostic_incident_groups` (`suggested` vs `confirmed`, link/unlink reasons,
--      optional plain-language public summary, fixing SHA, and verification status).
--   5. Creates `support_issue_notifications` (`FORCE ROW LEVEL SECURITY`) for durable, deduplicated
--      support notification tracking without touching historical `admin_notification_outbox` rows.

-- 1. Human-readable ticket numbers (`BS-001001`)
CREATE SEQUENCE IF NOT EXISTS support_ticket_number_seq START WITH 1001;

CREATE OR REPLACE FUNCTION next_support_ticket_number() RETURNS text AS $$
BEGIN
  RETURN 'BS-' || lpad(nextval('support_ticket_number_seq')::text, 6, '0');
END;
$$ LANGUAGE plpgsql;

-- 2. Additive columns on `support_issues`
ALTER TABLE support_issues
  ADD COLUMN IF NOT EXISTS ticket_number TEXT,
  ADD COLUMN IF NOT EXISTS entry_kind TEXT NOT NULL DEFAULT 'problem',
  ADD COLUMN IF NOT EXISTS sharing_scope TEXT NOT NULL DEFAULT 'personal',
  ADD COLUMN IF NOT EXISTS reporter_urgency TEXT,
  ADD COLUMN IF NOT EXISTS priority_updated_by TEXT,
  ADD COLUMN IF NOT EXISTS priority_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS priority_change_reason TEXT,
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS assigned_by TEXT,
  ADD COLUMN IF NOT EXISTS escalated_to_top BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS escalation_reason TEXT,
  ADD COLUMN IF NOT EXISTS waiting_for_team BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS reporter_last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS staff_last_read_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_public_staff_activity_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS reopen_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reopened_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS affected_feature TEXT,
  ADD COLUMN IF NOT EXISTS operation_name TEXT,
  ADD COLUMN IF NOT EXISTS error_correlation_id TEXT,
  ADD COLUMN IF NOT EXISTS reported_occurred_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS server_release_sha TEXT,
  ADD COLUMN IF NOT EXISTS client_build_version TEXT,
  ADD COLUMN IF NOT EXISTS client_loaded_release_sha TEXT,
  ADD COLUMN IF NOT EXISTS coarse_device_info TEXT;

-- Backfill existing `support_issues` rows deterministically without losing history
-- (satisfy existing FORCE ROW LEVEL SECURITY policy on `support_issues` when migrator is NOBYPASSRLS)
SELECT
  set_config('app.can_moderate', 'true', true),
  set_config('app.admin_portal', 'true', true);

WITH ordered_existing AS (
  SELECT id
  FROM support_issues
  WHERE ticket_number IS NULL
  ORDER BY created_at ASC, id ASC
)
UPDATE support_issues si
SET ticket_number = next_support_ticket_number()
FROM ordered_existing oe
WHERE si.id = oe.id;

UPDATE support_issues
SET reporter_urgency = CASE
      WHEN severity = 'urgent' THEN 'critical'
      WHEN severity IN ('high', 'normal', 'low') THEN severity
      ELSE 'normal'
    END
WHERE reporter_urgency IS NULL;

UPDATE support_issues
SET last_activity_at = COALESCE(updated_at, created_at, now()),
    waiting_for_team = CASE WHEN status IN ('open', 'in_review', 'in_progress') THEN true ELSE false END,
    closed_at = CASE WHEN status = 'closed' AND closed_at IS NULL THEN COALESCE(resolved_at, updated_at, now()) ELSE closed_at END
WHERE true;

ALTER TABLE support_issues
  ALTER COLUMN ticket_number SET DEFAULT next_support_ticket_number(),
  ALTER COLUMN ticket_number SET NOT NULL,
  ALTER COLUMN reporter_urgency SET DEFAULT 'normal',
  ALTER COLUMN reporter_urgency SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_support_issues_ticket_number
  ON support_issues (ticket_number);

-- Update category & status CHECK constraints additively while preserving all legacy values
ALTER TABLE support_issues
  DROP CONSTRAINT IF EXISTS support_issues_category_check,
  ADD CONSTRAINT support_issues_category_check
    CHECK (
      category IN (
        'listing_accuracy',
        'booking_dispute',
        'pager_issue',
        'vendor_conduct',
        'account_access',
        'abuse_report',
        'other',
        'listing_hours_location',
        'event_inquiries',
        'pager_notifications',
        'technical_problem',
        'question_help',
        'suggestion_feedback'
      )
    );

ALTER TABLE support_issues
  DROP CONSTRAINT IF EXISTS support_issues_status_check,
  ADD CONSTRAINT support_issues_status_check
    CHECK (status IN ('open', 'in_review', 'in_progress', 'waiting', 'resolved', 'closed'));

ALTER TABLE support_issues
  DROP CONSTRAINT IF EXISTS support_issues_ticket_number_chk,
  ADD CONSTRAINT support_issues_ticket_number_chk
    CHECK (ticket_number ~ '^BS-[0-9]{6,10}$'),
  DROP CONSTRAINT IF EXISTS support_issues_entry_kind_chk,
  ADD CONSTRAINT support_issues_entry_kind_chk
    CHECK (entry_kind IN ('problem', 'question', 'suggestion')),
  DROP CONSTRAINT IF EXISTS support_issues_sharing_scope_chk,
  ADD CONSTRAINT support_issues_sharing_scope_chk
    CHECK (
      sharing_scope = 'personal'
      OR (
        sharing_scope = 'vendor_service'
        AND reporter_context = 'vendor'
        AND vendor_id IS NOT NULL
        AND category <> 'account_access'
      )
    ),
  DROP CONSTRAINT IF EXISTS support_issues_reporter_urgency_chk,
  ADD CONSTRAINT support_issues_reporter_urgency_chk
    CHECK (reporter_urgency IN ('critical', 'high', 'normal', 'low', 'feedback')),
  DROP CONSTRAINT IF EXISTS support_issues_priority_reason_chk,
  ADD CONSTRAINT support_issues_priority_reason_chk
    CHECK (priority_change_reason IS NULL OR char_length(priority_change_reason) <= 500),
  DROP CONSTRAINT IF EXISTS support_issues_escalation_reason_chk,
  ADD CONSTRAINT support_issues_escalation_reason_chk
    CHECK (escalation_reason IS NULL OR char_length(escalation_reason) <= 500),
  DROP CONSTRAINT IF EXISTS support_issues_reopen_count_chk,
  ADD CONSTRAINT support_issues_reopen_count_chk
    CHECK (reopen_count >= 0),
  DROP CONSTRAINT IF EXISTS support_issues_affected_feature_chk,
  ADD CONSTRAINT support_issues_affected_feature_chk
    CHECK (affected_feature IS NULL OR affected_feature ~ '^[a-z0-9_-]{2,48}$'),
  DROP CONSTRAINT IF EXISTS support_issues_operation_name_chk,
  ADD CONSTRAINT support_issues_operation_name_chk
    CHECK (
      operation_name IS NULL
      OR (
        char_length(operation_name) BETWEEN 2 AND 96
        AND position('?' in operation_name) = 0
        AND position('#' in operation_name) = 0
      )
    ),
  DROP CONSTRAINT IF EXISTS support_issues_error_corr_chk,
  ADD CONSTRAINT support_issues_error_corr_chk
    CHECK (error_correlation_id IS NULL OR error_correlation_id ~ '^corr_[0-9a-f]{12,32}$'),
  DROP CONSTRAINT IF EXISTS support_issues_server_sha_chk,
  ADD CONSTRAINT support_issues_server_sha_chk
    CHECK (server_release_sha IS NULL OR char_length(btrim(server_release_sha)) BETWEEN 1 AND 64),
  DROP CONSTRAINT IF EXISTS support_issues_client_build_chk,
  ADD CONSTRAINT support_issues_client_build_chk
    CHECK (client_build_version IS NULL OR char_length(btrim(client_build_version)) BETWEEN 1 AND 64),
  DROP CONSTRAINT IF EXISTS support_issues_client_sha_chk,
  ADD CONSTRAINT support_issues_client_sha_chk
    CHECK (client_loaded_release_sha IS NULL OR char_length(btrim(client_loaded_release_sha)) BETWEEN 1 AND 64),
  DROP CONSTRAINT IF EXISTS support_issues_coarse_device_chk,
  ADD CONSTRAINT support_issues_coarse_device_chk
    CHECK (coarse_device_info IS NULL OR (char_length(coarse_device_info) <= 120 AND position('?' in coarse_device_info) = 0 AND position('#' in coarse_device_info) = 0));

CREATE INDEX IF NOT EXISTS idx_support_issues_assignee_status
  ON support_issues (assignee_user_id, status, last_activity_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_issues_corr
  ON support_issues (error_correlation_id)
  WHERE error_correlation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_support_issues_waiting_team
  ON support_issues (waiting_for_team, reporter_urgency, last_activity_at DESC);

-- Enforce immutability of reporter authorship, ticket number, original description, and reporter urgency
CREATE OR REPLACE FUNCTION enforce_support_issues_immutable_fields() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.reporter_user_id IS DISTINCT FROM NEW.reporter_user_id
       OR OLD.ticket_number IS DISTINCT FROM NEW.ticket_number
       OR OLD.reporter_urgency IS DISTINCT FROM NEW.reporter_urgency
       OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
      RAISE EXCEPTION 'Support ticket authorship, ticket_number, reporter_urgency, and created_at are immutable';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_support_issues_immutable ON support_issues;
CREATE TRIGGER trg_support_issues_immutable
  BEFORE UPDATE ON support_issues
  FOR EACH ROW
  EXECUTE FUNCTION enforce_support_issues_immutable_fields();

-- Helper predicate (invoker-safe) for vendor_service co-member visibility
DROP POLICY IF EXISTS support_issues_rls ON support_issues;
CREATE POLICY support_issues_rls ON support_issues
  FOR ALL
  USING (
    COALESCE(current_setting('app.can_moderate', true), '') = 'true'
    OR current_setting('app.admin_portal', true) = 'true'
    OR reporter_user_id = NULLIF(btrim(COALESCE(current_setting('app.user_id', true), '')), '')
    OR (
      sharing_scope = 'vendor_service'
      AND vendor_id IS NOT NULL
      AND category <> 'account_access'
      AND EXISTS (
        SELECT 1
        FROM vendor_memberships vm
        WHERE vm.vendor_id = support_issues.vendor_id
          AND vm.user_id = NULLIF(btrim(COALESCE(current_setting('app.user_id', true), '')), '')
      )
    )
  )
  WITH CHECK (
    COALESCE(current_setting('app.can_moderate', true), '') = 'true'
    OR current_setting('app.admin_portal', true) = 'true'
    OR reporter_user_id = NULLIF(btrim(COALESCE(current_setting('app.user_id', true), '')), '')
    OR (
      sharing_scope = 'vendor_service'
      AND vendor_id IS NOT NULL
      AND category <> 'account_access'
      AND EXISTS (
        SELECT 1
        FROM vendor_memberships vm
        WHERE vm.vendor_id = support_issues.vendor_id
          AND vm.user_id = NULLIF(btrim(COALESCE(current_setting('app.user_id', true), '')), '')
      )
    )
  );

-- 3. Additive columns & append-only immutability on `support_issue_notes`
ALTER TABLE support_issue_notes
  ADD COLUMN IF NOT EXISTS author_display_label TEXT,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

ALTER TABLE support_issue_notes
  DROP CONSTRAINT IF EXISTS support_issue_notes_display_label_chk,
  ADD CONSTRAINT support_issue_notes_display_label_chk
    CHECK (author_display_label IS NULL OR char_length(btrim(author_display_label)) BETWEEN 2 AND 80),
  DROP CONSTRAINT IF EXISTS support_issue_notes_idem_chk,
  ADD CONSTRAINT support_issue_notes_idem_chk
    CHECK (
      idempotency_key IS NULL
      OR (
        char_length(btrim(idempotency_key)) BETWEEN 6 AND 128
        AND idempotency_key ~ '^[A-Za-z0-9_.:-]+$'
      )
    );

CREATE UNIQUE INDEX IF NOT EXISTS idx_support_issue_notes_idem
  ON support_issue_notes (issue_id, author_user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

DROP POLICY IF EXISTS support_issue_notes_reporter_visible ON support_issue_notes;
CREATE POLICY support_issue_notes_reporter_visible ON support_issue_notes
  FOR SELECT
  USING (
    visibility = 'reporter_visible'
    AND EXISTS (
      SELECT 1
      FROM support_issues si
      WHERE si.id = support_issue_notes.issue_id
        AND (
          si.reporter_user_id = NULLIF(btrim(COALESCE(current_setting('app.user_id', true), '')), '')
          OR (
            si.sharing_scope = 'vendor_service'
            AND si.vendor_id IS NOT NULL
            AND si.category <> 'account_access'
            AND EXISTS (
              SELECT 1
              FROM vendor_memberships vm
              WHERE vm.vendor_id = si.vendor_id
                AND vm.user_id = NULLIF(btrim(COALESCE(current_setting('app.user_id', true), '')), '')
            )
          )
        )
    )
  );

DROP POLICY IF EXISTS support_issue_notes_reporter_insert ON support_issue_notes;
CREATE POLICY support_issue_notes_reporter_insert ON support_issue_notes
  FOR INSERT
  WITH CHECK (
    visibility = 'reporter_visible'
    AND author_user_id = NULLIF(btrim(COALESCE(current_setting('app.user_id', true), '')), '')
    AND EXISTS (
      SELECT 1
      FROM support_issues si
      WHERE si.id = support_issue_notes.issue_id
        AND (
          si.reporter_user_id = NULLIF(btrim(COALESCE(current_setting('app.user_id', true), '')), '')
          OR (
            si.sharing_scope = 'vendor_service'
            AND si.vendor_id IS NOT NULL
            AND si.category <> 'account_access'
            AND EXISTS (
              SELECT 1
              FROM vendor_memberships vm
              WHERE vm.vendor_id = si.vendor_id
                AND vm.user_id = NULLIF(btrim(COALESCE(current_setting('app.user_id', true), '')), '')
            )
          )
        )
    )
  );

REVOKE UPDATE, DELETE ON support_issue_notes FROM PUBLIC;

-- 4. Append-only ticket lifecycle events (`support_issue_events`)
CREATE TABLE IF NOT EXISTS support_issue_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id UUID NOT NULL REFERENCES support_issues(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL
    CHECK (
      event_type IN (
        'ticket_created',
        'status_changed',
        'priority_changed',
        'assigned',
        'reassigned',
        'unassigned',
        'escalated',
        'reopened',
        'resolved',
        'closed',
        'diagnostic_suggested',
        'diagnostic_linked',
        'diagnostic_updated',
        'diagnostic_unlinked',
        'public_incident_update'
      )
    ),
  visibility TEXT NOT NULL
    CHECK (visibility IN ('reporter_visible', 'internal')),
  actor_user_id TEXT NOT NULL
    CHECK (char_length(btrim(actor_user_id)) BETWEEN 1 AND 128),
  actor_role TEXT NOT NULL
    CHECK (char_length(btrim(actor_role)) BETWEEN 1 AND 40),
  public_actor_label TEXT NOT NULL
    CHECK (char_length(btrim(public_actor_label)) BETWEEN 2 AND 80),
  summary TEXT NOT NULL
    CHECK (char_length(btrim(summary)) BETWEEN 2 AND 400),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (octet_length(metadata::text) <= 1024),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_issue_events_issue
  ON support_issue_events (issue_id, created_at ASC, id ASC);

ALTER TABLE support_issue_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_issue_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS support_issue_events_staff_all ON support_issue_events;
CREATE POLICY support_issue_events_staff_all ON support_issue_events
  FOR ALL
  USING (
    COALESCE(current_setting('app.can_moderate', true), '') = 'true'
    OR current_setting('app.admin_portal', true) = 'true'
    OR current_setting('app.diagnostics_internal', true) = 'true'
  )
  WITH CHECK (
    COALESCE(current_setting('app.can_moderate', true), '') = 'true'
    OR current_setting('app.admin_portal', true) = 'true'
    OR current_setting('app.diagnostics_internal', true) = 'true'
  );

DROP POLICY IF EXISTS support_issue_events_reporter_select ON support_issue_events;
CREATE POLICY support_issue_events_reporter_select ON support_issue_events
  FOR SELECT
  USING (
    visibility = 'reporter_visible'
    AND EXISTS (
      SELECT 1
      FROM support_issues si
      WHERE si.id = support_issue_events.issue_id
        AND (
          si.reporter_user_id = NULLIF(btrim(COALESCE(current_setting('app.user_id', true), '')), '')
          OR (
            si.sharing_scope = 'vendor_service'
            AND si.vendor_id IS NOT NULL
            AND si.category <> 'account_access'
            AND EXISTS (
              SELECT 1
              FROM vendor_memberships vm
              WHERE vm.vendor_id = si.vendor_id
                AND vm.user_id = NULLIF(btrim(COALESCE(current_setting('app.user_id', true), '')), '')
            )
          )
        )
    )
  );

DROP POLICY IF EXISTS support_issue_events_reporter_insert ON support_issue_events;
CREATE POLICY support_issue_events_reporter_insert ON support_issue_events
  FOR INSERT
  WITH CHECK (
    visibility = 'reporter_visible'
    AND event_type IN ('ticket_created', 'status_changed', 'reopened')
    AND actor_user_id = NULLIF(btrim(COALESCE(current_setting('app.user_id', true), '')), '')
  );

REVOKE UPDATE, DELETE ON support_issue_events FROM PUBLIC;

-- 5. Many-to-many Support Ticket <-> Diagnostic Incident Links (`support_issue_diagnostic_links`)
CREATE TABLE IF NOT EXISTS support_issue_diagnostic_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id UUID NOT NULL REFERENCES support_issues(id) ON DELETE CASCADE,
  diagnostic_group_id UUID NOT NULL REFERENCES diagnostic_incident_groups(id) ON DELETE CASCADE,
  diagnostic_fingerprint TEXT NOT NULL
    CHECK (diagnostic_fingerprint ~ '^[0-9a-f]{32,64}$'),
  link_state TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (link_state IN ('suggested', 'confirmed')),
  linked_by TEXT NOT NULL
    CHECK (char_length(btrim(linked_by)) BETWEEN 1 AND 128),
  linked_by_role TEXT NOT NULL
    CHECK (linked_by_role IN ('system', 'mod', 'top')),
  link_reason TEXT NOT NULL
    CHECK (char_length(btrim(link_reason)) BETWEEN 3 AND 500),
  public_summary TEXT
    CHECK (public_summary IS NULL OR char_length(btrim(public_summary)) BETWEEN 4 AND 240),
  fixing_release_sha TEXT
    CHECK (fixing_release_sha IS NULL OR fixing_release_sha ~ '^[0-9a-f]{7,40}$'),
  verification_status TEXT NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified', 'pending_release', 'verified_fixed', 'still_reproducing')),
  verification_note TEXT
    CHECK (verification_note IS NULL OR char_length(verification_note) <= 500),
  unlinked_at TIMESTAMPTZ,
  unlinked_by TEXT,
  unlink_reason TEXT
    CHECK (unlink_reason IS NULL OR char_length(unlink_reason) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_support_diag_links_active
  ON support_issue_diagnostic_links (issue_id, diagnostic_group_id)
  WHERE unlinked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_support_diag_links_diag
  ON support_issue_diagnostic_links (diagnostic_group_id, unlinked_at, created_at DESC);

ALTER TABLE support_issue_diagnostic_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_issue_diagnostic_links FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS support_diag_links_staff_all ON support_issue_diagnostic_links;
CREATE POLICY support_diag_links_staff_all ON support_issue_diagnostic_links
  FOR ALL
  USING (
    COALESCE(current_setting('app.can_moderate', true), '') = 'true'
    OR current_setting('app.admin_portal', true) = 'true'
    OR current_setting('app.diagnostics_internal', true) = 'true'
  )
  WITH CHECK (
    COALESCE(current_setting('app.can_moderate', true), '') = 'true'
    OR current_setting('app.admin_portal', true) = 'true'
    OR current_setting('app.diagnostics_internal', true) = 'true'
  );

DROP POLICY IF EXISTS support_diag_links_reporter_public ON support_issue_diagnostic_links;
CREATE POLICY support_diag_links_reporter_public ON support_issue_diagnostic_links
  FOR SELECT
  USING (
    unlinked_at IS NULL
    AND link_state = 'confirmed'
    AND public_summary IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM support_issues si
      WHERE si.id = support_issue_diagnostic_links.issue_id
        AND (
          si.reporter_user_id = NULLIF(btrim(COALESCE(current_setting('app.user_id', true), '')), '')
          OR (
            si.sharing_scope = 'vendor_service'
            AND si.vendor_id IS NOT NULL
            AND si.category <> 'account_access'
            AND EXISTS (
              SELECT 1
              FROM vendor_memberships vm
              WHERE vm.vendor_id = si.vendor_id
                AND vm.user_id = NULLIF(btrim(COALESCE(current_setting('app.user_id', true), '')), '')
            )
          )
        )
    )
  );

-- 6. Durable, deduplicated Support Notification Records (`support_issue_notifications`)
CREATE TABLE IF NOT EXISTS support_issue_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id UUID NOT NULL REFERENCES support_issues(id) ON DELETE CASCADE,
  recipient_user_id TEXT NOT NULL
    CHECK (char_length(btrim(recipient_user_id)) BETWEEN 1 AND 128),
  event_kind TEXT NOT NULL
    CHECK (event_kind IN ('ticket_acknowledged', 'staff_public_reply', 'ticket_resolved', 'linked_incident_update')),
  dedupe_key TEXT NOT NULL
    CHECK (char_length(btrim(dedupe_key)) BETWEEN 6 AND 140),
  delivery_status TEXT NOT NULL DEFAULT 'in_app_only'
    CHECK (
      delivery_status IN (
        'in_app_only',
        'staging_mailbox_only',
        'staging_restricted_in_app_only',
        'queued',
        'provider_accepted',
        'delivery_failed',
        'delivery_uncertain'
      )
    ),
  delivery_mode TEXT NOT NULL DEFAULT 'disabled'
    CHECK (char_length(btrim(delivery_mode)) BETWEEN 2 AND 32),
  attempt_count INTEGER NOT NULL DEFAULT 0
    CHECK (attempt_count >= 0 AND attempt_count <= 5),
  provider_status INTEGER
    CHECK (provider_status IS NULL OR (provider_status >= 100 AND provider_status <= 599)),
  provider_message_id TEXT
    CHECK (provider_message_id IS NULL OR char_length(btrim(provider_message_id)) BETWEEN 1 AND 128),
  error_code TEXT
    CHECK (error_code IS NULL OR char_length(btrim(error_code)) BETWEEN 1 AND 80),
  correlation_id TEXT
    CHECK (correlation_id IS NULL OR correlation_id ~ '^corr_[0-9a-f]{12,32}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (issue_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_support_issue_notifs_issue
  ON support_issue_notifications (issue_id, created_at DESC);

ALTER TABLE support_issue_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_issue_notifications FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS support_issue_notifs_rls ON support_issue_notifications;
CREATE POLICY support_issue_notifs_rls ON support_issue_notifications
  FOR ALL
  USING (
    COALESCE(current_setting('app.can_moderate', true), '') = 'true'
    OR current_setting('app.admin_portal', true) = 'true'
    OR current_setting('app.auth_internal', true) = 'true'
    OR recipient_user_id = NULLIF(btrim(COALESCE(current_setting('app.user_id', true), '')), '')
  )
  WITH CHECK (
    COALESCE(current_setting('app.can_moderate', true), '') = 'true'
    OR current_setting('app.admin_portal', true) = 'true'
    OR current_setting('app.auth_internal', true) = 'true'
    OR recipient_user_id = NULLIF(btrim(COALESCE(current_setting('app.user_id', true), '')), '')
  );

-- 7. Allow `support_notify` in `auth_delivery_telemetry.flow`
ALTER TABLE auth_delivery_telemetry
  DROP CONSTRAINT IF EXISTS auth_delivery_telemetry_flow_check,
  ADD CONSTRAINT auth_delivery_telemetry_flow_check
    CHECK (flow IN ('start', 'verify', 'invite_send', 'invite_resend', 'support_notify'));
