-- Migration 018: Two-Tier Administration (`Admin: Mod` / `Admin: Top`), Privileged Invitations,
-- Vendor Onboarding & Granular Restriction Controls, Extended Community Moderation, and Support Issues
--
-- Non-destructive & Compatibility Guarantees:
--   1. Preserves all 59 curated Sonoma County `vendors` listings, existing `auth_users`,
--      `vendor_memberships`, `bookings`, `pickup_pagers`, `pager_notification_*`, `community_reviews`,
--      `verified` / `photo_rights_verified` provenance, and `audit_logs`.
--   2. Migrates existing `platform_roles` rows (`platform_admin` -> `top`, `moderator` -> `mod`)
--      while retaining `platform_admin` and `moderator` in the CHECK constraint for backward
--      compatibility with legacy queries and integration fixtures.
--   3. Protects the last active `Top` administrator against deletion or demotion at the database
--      trigger level (`trg_protect_last_top_admin`).
--   4. Keeps curated directory listings without an existing `vendor_memberships` owner in
--      `ownership_status = 'unclaimed'` while remaining visible in public discovery (`hidden_from_discovery = false`).
--   5. Enforces `FORCE ROW LEVEL SECURITY` on `account_invitations`, `vendor_applications`,
--      `vendor_application_evidence`, `community_reports`, `community_moderation_history`,
--      `support_issues`, `support_issue_notes`, and `admin_notification_outbox`.

-- ============================================================================
-- 1. Two-Tier Platform Administration (`Admin: Mod` & `Admin: Top`) & Revocation Guard
-- ============================================================================
ALTER TABLE platform_roles DROP CONSTRAINT IF EXISTS platform_roles_role_check;
ALTER TABLE platform_roles
  ADD CONSTRAINT platform_roles_role_check
  CHECK (role IN ('top', 'mod', 'platform_admin', 'moderator'));

ALTER TABLE platform_roles
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS notes TEXT;

UPDATE platform_roles SET role = 'top', updated_at = now() WHERE role = 'platform_admin';
UPDATE platform_roles SET role = 'mod', updated_at = now() WHERE role = 'moderator';

-- Explicit revocation ledger ensuring static `PLATFORM_ADMIN_IDS` env overrides cannot silently
-- bypass an administrative demotion or revocation performed through the Admin Portal.
CREATE TABLE IF NOT EXISTS platform_role_revocations (
  user_id TEXT PRIMARY KEY CHECK (char_length(btrim(user_id)) BETWEEN 1 AND 128),
  revoked_by TEXT NOT NULL CHECK (char_length(btrim(revoked_by)) BETWEEN 1 AND 128),
  reason TEXT NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 3 AND 500),
  revoked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Prevent removing or demoting the last active `Top` (`top` / `platform_admin`) administrator
CREATE OR REPLACE FUNCTION protect_last_top_admin() RETURNS trigger AS $$
DECLARE
  v_remaining INTEGER;
BEGIN
  IF COALESCE(current_setting('app.allow_last_top_cleanup', true), '') = 'true' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  IF OLD.role IN ('top', 'platform_admin') THEN
    IF TG_OP = 'DELETE' OR NEW.role NOT IN ('top', 'platform_admin') THEN
      SELECT count(*)::int INTO v_remaining
      FROM platform_roles pr
      WHERE pr.user_id <> OLD.user_id
        AND pr.role IN ('top', 'platform_admin');

      IF v_remaining < 1 THEN
        RAISE EXCEPTION 'LAST_TOP_ADMIN_PROTECTED: Cannot remove or demote the last active Admin: Top account';
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_last_top_admin ON platform_roles;
CREATE TRIGGER trg_protect_last_top_admin
  BEFORE UPDATE OR DELETE ON platform_roles
  FOR EACH ROW EXECUTE FUNCTION protect_last_top_admin();

-- Track narrow, auditable, idempotent initial Top-admin bootstrap grants
CREATE TABLE IF NOT EXISTS admin_bootstrap_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL UNIQUE CHECK (char_length(btrim(user_id)) BETWEEN 1 AND 128),
  email_normalized TEXT NOT NULL UNIQUE,
  bootstrap_source TEXT NOT NULL CHECK (char_length(btrim(bootstrap_source)) BETWEEN 3 AND 80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 2. Granular Vendor Governance, Ownership Status & Restriction History
-- ============================================================================
ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS ownership_status TEXT NOT NULL DEFAULT 'unclaimed',
  ADD COLUMN IF NOT EXISTS hidden_from_discovery BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bookings_restricted BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS vendor_access_suspended BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pager_restricted BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS needs_info_correction BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS correction_note TEXT,
  ADD COLUMN IF NOT EXISTS restriction_reason TEXT,
  ADD COLUMN IF NOT EXISTS restricted_by TEXT,
  ADD COLUMN IF NOT EXISTS restriction_authority TEXT,
  ADD COLUMN IF NOT EXISTS restricted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS temp_restriction_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vendors_ownership_status_chk') THEN
    ALTER TABLE vendors ADD CONSTRAINT vendors_ownership_status_chk
      CHECK (ownership_status IN ('unclaimed', 'claim_pending', 'approved_owner', 'suspended'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vendors_restriction_authority_chk') THEN
    ALTER TABLE vendors ADD CONSTRAINT vendors_restriction_authority_chk
      CHECK (restriction_authority IS NULL OR restriction_authority IN ('mod', 'top'));
  END IF;
END $$;

-- Mark ONLY listings that already hold an explicit `vendor_memberships` owner as `approved_owner`;
-- the remaining curated Sonoma County listings stay `unclaimed` while remaining publicly discoverable.
UPDATE vendors v
SET ownership_status = 'approved_owner'
WHERE v.ownership_status = 'unclaimed'
  AND EXISTS (
    SELECT 1 FROM vendor_memberships m
    WHERE m.vendor_id = v.id AND m.role = 'owner'
  );

CREATE TABLE IF NOT EXISTS vendor_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id TEXT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL CHECK (char_length(btrim(actor_id)) BETWEEN 1 AND 128),
  actor_role TEXT NOT NULL CHECK (char_length(btrim(actor_role)) BETWEEN 1 AND 40),
  action TEXT NOT NULL CHECK (char_length(btrim(action)) BETWEEN 2 AND 80),
  reason TEXT NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 3 AND 500),
  before_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  after_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendor_status_history_vendor
  ON vendor_status_history (vendor_id, created_at DESC);

-- ============================================================================
-- 3. Account Invitations Across All Role Levels (`FORCE ROW LEVEL SECURITY`)
-- ============================================================================
CREATE TABLE IF NOT EXISTS account_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_normalized TEXT NOT NULL
    CHECK (
      email_normalized = lower(btrim(email_normalized))
      AND length(email_normalized) BETWEEN 3 AND 254
      AND position('@' in email_normalized) > 1
    ),
  requested_role TEXT NOT NULL
    CHECK (requested_role IN ('customer', 'vendor_owner', 'vendor_staff', 'mod', 'top')),
  vendor_id TEXT REFERENCES vendors(id) ON DELETE CASCADE,
  status TEXT NOT NULL
    CHECK (status IN ('pending_top_approval', 'issued', 'consumed', 'rejected', 'revoked', 'expired')),
  token_sha256 TEXT UNIQUE CHECK (token_sha256 IS NULL OR length(token_sha256) = 64),
  initiated_by TEXT NOT NULL CHECK (char_length(btrim(initiated_by)) BETWEEN 1 AND 128),
  initiator_role TEXT NOT NULL CHECK (initiator_role IN ('mod', 'top', 'vendor_owner')),
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  approval_reason TEXT,
  rejected_by TEXT,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  consumed_by_user_id TEXT,
  consumed_at TIMESTAMPTZ,
  revoked_by TEXT,
  revoked_at TIMESTAMPTZ,
  idempotency_key TEXT,
  invite_note TEXT CHECK (invite_note IS NULL OR char_length(invite_note) <= 500),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT account_invitations_staff_vendor_chk
    CHECK (requested_role <> 'vendor_staff' OR vendor_id IS NOT NULL),
  CONSTRAINT account_invitations_owner_initiator_chk
    CHECK (initiator_role <> 'vendor_owner' OR (requested_role = 'vendor_staff' AND vendor_id IS NOT NULL)),
  CONSTRAINT account_invitations_pending_no_token_chk
    CHECK (status <> 'pending_top_approval' OR token_sha256 IS NULL),
  CONSTRAINT account_invitations_issued_token_chk
    CHECK (status <> 'issued' OR (token_sha256 IS NOT NULL AND expires_at IS NOT NULL)),
  CONSTRAINT account_invitations_mod_priv_requires_top_chk
    CHECK (
      NOT (
        initiator_role = 'mod'
        AND requested_role IN ('mod', 'top')
        AND status IN ('issued', 'consumed')
        AND (approved_by IS NULL OR approved_by = initiated_by)
      )
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_account_invitations_idempotency
  ON account_invitations (initiated_by, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_account_invitations_status_created
  ON account_invitations (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_account_invitations_email
  ON account_invitations (email_normalized, created_at DESC);

ALTER TABLE account_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_invitations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS account_invitations_rls ON account_invitations;
CREATE POLICY account_invitations_rls ON account_invitations
  FOR ALL
  USING (
    current_setting('app.admin_portal', true) = 'true'
    OR email_normalized = NULLIF(lower(btrim(COALESCE(current_setting('app.user_email', true), ''))), '')
    OR initiated_by = NULLIF(btrim(COALESCE(current_setting('app.user_id', true), '')), '')
  )
  WITH CHECK (
    current_setting('app.admin_portal', true) = 'true'
    OR email_normalized = NULLIF(lower(btrim(COALESCE(current_setting('app.user_email', true), ''))), '')
    OR initiated_by = NULLIF(btrim(COALESCE(current_setting('app.user_id', true), '')), '')
  );

-- ============================================================================
-- 4. Vendor Onboarding, Claims & Sensitive Evidence (`FORCE ROW LEVEL SECURITY`)
-- ============================================================================
CREATE TABLE IF NOT EXISTS vendor_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_user_id TEXT NOT NULL CHECK (char_length(btrim(applicant_user_id)) BETWEEN 1 AND 128),
  applicant_email TEXT NOT NULL CHECK (length(btrim(applicant_email)) BETWEEN 3 AND 254),
  claim_type TEXT NOT NULL CHECK (claim_type IN ('existing_listing', 'new_listing')),
  target_vendor_id TEXT REFERENCES vendors(id) ON DELETE SET NULL,
  proposed_slug TEXT CHECK (proposed_slug IS NULL OR proposed_slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  business_name TEXT NOT NULL CHECK (char_length(btrim(business_name)) BETWEEN 2 AND 120),
  city TEXT NOT NULL DEFAULT 'Santa Rosa' CHECK (char_length(btrim(city)) BETWEEN 2 AND 80),
  cuisine TEXT NOT NULL DEFAULT 'Mexican' CHECK (char_length(btrim(cuisine)) BETWEEN 2 AND 60),
  listing_kind TEXT NOT NULL DEFAULT 'food_truck'
    CHECK (listing_kind IN ('food_truck', 'venue', 'market_stall', 'farm_stand', 'cafe', 'popup')),
  service_area TEXT NOT NULL CHECK (char_length(btrim(service_area)) BETWEEN 2 AND 160),
  contact_name TEXT NOT NULL CHECK (char_length(btrim(contact_name)) BETWEEN 2 AND 100),
  contact_email TEXT NOT NULL CHECK (length(btrim(contact_email)) BETWEEN 3 AND 254),
  contact_phone TEXT CHECK (contact_phone IS NULL OR char_length(btrim(contact_phone)) <= 40),
  website_or_menu_url TEXT CHECK (website_or_menu_url IS NULL OR char_length(btrim(website_or_menu_url)) <= 300),
  permit_or_license_summary TEXT NOT NULL CHECK (char_length(btrim(permit_or_license_summary)) BETWEEN 4 AND 400),
  ownership_statement TEXT NOT NULL CHECK (char_length(btrim(ownership_statement)) BETWEEN 10 AND 800),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'needs_info', 'approved', 'rejected', 'suspended')),
  applicant_feedback TEXT CHECK (applicant_feedback IS NULL OR char_length(applicant_feedback) <= 1000),
  internal_notes TEXT CHECK (internal_notes IS NULL OR char_length(internal_notes) <= 2000),
  mod_recommendation TEXT NOT NULL DEFAULT 'none'
    CHECK (mod_recommendation IN ('none', 'recommend_approve', 'recommend_reject')),
  mod_recommended_by TEXT,
  mod_recommended_at TIMESTAMPTZ,
  mod_recommendation_reason TEXT CHECK (mod_recommendation_reason IS NULL OR char_length(mod_recommendation_reason) <= 600),
  decided_by TEXT,
  decided_role TEXT CHECK (decided_role IS NULL OR decided_role IN ('mod', 'top')),
  decided_at TIMESTAMPTZ,
  decision_reason TEXT CHECK (decision_reason IS NULL OR char_length(decision_reason) <= 600),
  approved_vendor_id TEXT REFERENCES vendors(id) ON DELETE SET NULL,
  revision_count INTEGER NOT NULL DEFAULT 0 CHECK (revision_count >= 0),
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT vendor_applications_claim_target_chk
    CHECK (
      (claim_type = 'existing_listing' AND target_vendor_id IS NOT NULL)
      OR (claim_type = 'new_listing' AND proposed_slug IS NOT NULL)
    ),
  CONSTRAINT vendor_applications_no_self_approval_chk
    CHECK (
      status <> 'approved'
      OR (decided_by IS NOT NULL AND decided_role = 'top' AND decided_by <> applicant_user_id)
    ),
  CONSTRAINT vendor_applications_no_self_mod_rec_chk
    CHECK (mod_recommended_by IS NULL OR mod_recommended_by <> applicant_user_id)
);

CREATE INDEX IF NOT EXISTS idx_vendor_applications_status
  ON vendor_applications (status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_vendor_applications_applicant
  ON vendor_applications (applicant_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_vendor_applications_target_vendor
  ON vendor_applications (target_vendor_id, status);

ALTER TABLE vendor_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_applications FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vendor_applications_rls ON vendor_applications;
CREATE POLICY vendor_applications_rls ON vendor_applications
  FOR ALL
  USING (
    current_setting('app.admin_portal', true) = 'true'
    OR applicant_user_id = NULLIF(btrim(COALESCE(current_setting('app.user_id', true), '')), '')
  )
  WITH CHECK (
    current_setting('app.admin_portal', true) = 'true'
    OR applicant_user_id = NULLIF(btrim(COALESCE(current_setting('app.user_id', true), '')), '')
  );

CREATE TABLE IF NOT EXISTS vendor_application_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES vendor_applications(id) ON DELETE CASCADE,
  uploaded_by TEXT NOT NULL CHECK (char_length(btrim(uploaded_by)) BETWEEN 1 AND 128),
  original_filename TEXT NOT NULL CHECK (char_length(btrim(original_filename)) BETWEEN 1 AND 120),
  mime_type TEXT NOT NULL CHECK (mime_type IN ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  byte_size INTEGER NOT NULL CHECK (byte_size BETWEEN 16 AND 524288),
  sha256_hex TEXT NOT NULL CHECK (length(sha256_hex) = 64),
  evidence_kind TEXT NOT NULL
    CHECK (evidence_kind IN ('health_permit', 'business_license', 'menu_or_signage', 'venue_authorization', 'other')),
  file_bytes BYTEA NOT NULL,
  retention_expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '90 days'),
  deleted_at TIMESTAMPTZ,
  deleted_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendor_application_evidence_app
  ON vendor_application_evidence (application_id, created_at ASC)
  WHERE deleted_at IS NULL;

ALTER TABLE vendor_application_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_application_evidence FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vendor_application_evidence_rls ON vendor_application_evidence;
CREATE POLICY vendor_application_evidence_rls ON vendor_application_evidence
  FOR ALL
  USING (
    current_setting('app.admin_portal', true) = 'true'
    OR uploaded_by = NULLIF(btrim(COALESCE(current_setting('app.user_id', true), '')), '')
  )
  WITH CHECK (
    current_setting('app.admin_portal', true) = 'true'
    OR uploaded_by = NULLIF(btrim(COALESCE(current_setting('app.user_id', true), '')), '')
  );

-- ============================================================================
-- 5. Extended Community Moderation (`hidden` / `restore`, Reports & Audit History)
-- ============================================================================
ALTER TABLE community_reviews DROP CONSTRAINT IF EXISTS community_reviews_status_check;
ALTER TABLE community_reviews DROP CONSTRAINT IF EXISTS community_reviews_moderation_consistency_chk;

ALTER TABLE community_reviews
  ADD COLUMN IF NOT EXISTS moderation_reason TEXT,
  ADD COLUMN IF NOT EXISTS moderation_internal_note TEXT,
  ADD COLUMN IF NOT EXISTS report_count INTEGER NOT NULL DEFAULT 0 CHECK (report_count >= 0),
  ADD COLUMN IF NOT EXISTS last_reported_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hidden_by TEXT,
  ADD COLUMN IF NOT EXISTS restored_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS restored_by TEXT;

ALTER TABLE community_reviews
  ADD CONSTRAINT community_reviews_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'hidden'));

ALTER TABLE community_reviews
  ADD CONSTRAINT community_reviews_moderation_consistency_chk
  CHECK (
    (status = 'pending' AND moderated_at IS NULL AND moderated_by IS NULL)
    OR (
      status IN ('approved', 'rejected', 'hidden')
      AND moderated_at IS NOT NULL
      AND moderated_by IS NOT NULL
      AND btrim(moderated_by) <> ''
    )
  );

CREATE OR REPLACE FUNCTION enforce_community_reviews_guard() RETURNS trigger AS $$
DECLARE
  v_session_user TEXT := NULLIF(btrim(COALESCE(current_setting('app.user_id', true), '')), '');
  v_can_moderate BOOLEAN := COALESCE(current_setting('app.can_moderate', true), '') = 'true';
  v_is_report_bump BOOLEAN := COALESCE(current_setting('app.community_report', true), '') = 'true';
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.author_id IS NULL OR btrim(NEW.author_id) = '' THEN
      RAISE EXCEPTION 'author_id is required';
    END IF;
    IF v_session_user IS NOT NULL AND NEW.author_id <> v_session_user THEN
      RAISE EXCEPTION 'Cannot spoof author_id on community submission';
    END IF;
    IF NEW.status <> 'pending' OR NEW.moderated_at IS NOT NULL OR NEW.moderated_by IS NOT NULL THEN
      RAISE EXCEPTION 'New community submissions must start in pending status without moderation metadata';
    END IF;
    IF char_length(btrim(NEW.title)) < 5 OR char_length(NEW.title) > 90 THEN
      RAISE EXCEPTION 'Community title must be between 5 and 90 characters';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Original user content and authorship are strictly immutable forever
    IF OLD.author_id IS DISTINCT FROM NEW.author_id
       OR OLD.nickname IS DISTINCT FROM NEW.nickname
       OR OLD.kind IS DISTINCT FROM NEW.kind
       OR OLD.place_id IS DISTINCT FROM NEW.place_id
       OR OLD.place_name IS DISTINCT FROM NEW.place_name
       OR OLD.town IS DISTINCT FROM NEW.town
       OR OLD.title IS DISTINCT FROM NEW.title
       OR OLD.body IS DISTINCT FROM NEW.body
       OR OLD.rating IS DISTINCT FROM NEW.rating
       OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
      RAISE EXCEPTION 'Community submission content and authorship are immutable';
    END IF;

    -- Allow controlled report_count / last_reported_at bump when recording a user report
    IF v_is_report_bump AND NOT v_can_moderate THEN
      IF OLD.status IS DISTINCT FROM NEW.status
         OR OLD.moderated_at IS DISTINCT FROM NEW.moderated_at
         OR OLD.moderated_by IS DISTINCT FROM NEW.moderated_by
         OR OLD.moderation_reason IS DISTINCT FROM NEW.moderation_reason
         OR OLD.moderation_internal_note IS DISTINCT FROM NEW.moderation_internal_note
         OR OLD.hidden_at IS DISTINCT FROM NEW.hidden_at
         OR OLD.hidden_by IS DISTINCT FROM NEW.hidden_by
         OR OLD.restored_at IS DISTINCT FROM NEW.restored_at
         OR OLD.restored_by IS DISTINCT FROM NEW.restored_by THEN
        RAISE EXCEPTION 'Report submission cannot alter moderation status';
      END IF;
      RETURN NEW;
    END IF;

    IF NOT v_can_moderate THEN
      RAISE EXCEPTION 'Moderator authorization is required to update moderation fields';
    END IF;

    IF NEW.status NOT IN ('approved', 'rejected', 'hidden') THEN
      RAISE EXCEPTION 'Moderation status must be approved, rejected, or hidden';
    END IF;

    -- Valid state transitions:
    --   pending -> approved | rejected
    --   approved -> hidden
    --   hidden | rejected -> approved (restore)
    IF OLD.status = 'pending' AND NEW.status NOT IN ('approved', 'rejected') THEN
      RAISE EXCEPTION 'Pending submissions can only transition to approved or rejected';
    END IF;
    IF OLD.status = 'approved' AND NEW.status NOT IN ('approved', 'hidden') THEN
      RAISE EXCEPTION 'Approved submissions can only be hidden (not overwritten or deleted)';
    END IF;
    IF OLD.status IN ('hidden', 'rejected') AND NEW.status NOT IN (OLD.status, 'approved') THEN
      RAISE EXCEPTION 'Hidden or rejected submissions can only be restored to approved';
    END IF;

    IF NEW.moderated_by IS NULL OR btrim(NEW.moderated_by) = '' OR NEW.moderated_at IS NULL THEN
      RAISE EXCEPTION 'moderated_by and moderated_at are required';
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Allow controlled report-counter update policy alongside moderator policy on `community_reviews`
DROP POLICY IF EXISTS community_report_bump ON community_reviews;
CREATE POLICY community_report_bump ON community_reviews
  FOR UPDATE
  USING (status = 'approved' AND COALESCE(current_setting('app.community_report', true), '') = 'true')
  WITH CHECK (status = 'approved' AND COALESCE(current_setting('app.community_report', true), '') = 'true');

CREATE TABLE IF NOT EXISTS community_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES community_reviews(id) ON DELETE CASCADE,
  reporter_user_id TEXT NOT NULL CHECK (char_length(btrim(reporter_user_id)) BETWEEN 1 AND 128),
  reason_category TEXT NOT NULL
    CHECK (reason_category IN ('spam', 'inaccurate', 'harassment', 'off_topic', 'other')),
  details TEXT CHECK (details IS NULL OR char_length(details) <= 500),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'dismissed')),
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (post_id, reporter_user_id)
);

CREATE INDEX IF NOT EXISTS idx_community_reports_status
  ON community_reports (status, created_at DESC);

ALTER TABLE community_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_reports FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS community_reports_rls ON community_reports;
CREATE POLICY community_reports_rls ON community_reports
  FOR ALL
  USING (
    COALESCE(current_setting('app.can_moderate', true), '') = 'true'
    OR reporter_user_id = NULLIF(btrim(COALESCE(current_setting('app.user_id', true), '')), '')
  )
  WITH CHECK (
    COALESCE(current_setting('app.can_moderate', true), '') = 'true'
    OR reporter_user_id = NULLIF(btrim(COALESCE(current_setting('app.user_id', true), '')), '')
  );

CREATE TABLE IF NOT EXISTS community_moderation_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES community_reviews(id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL CHECK (char_length(btrim(actor_id)) BETWEEN 1 AND 128),
  actor_role TEXT NOT NULL CHECK (char_length(btrim(actor_role)) BETWEEN 1 AND 40),
  action TEXT NOT NULL CHECK (action IN ('approve', 'reject', 'hide', 'restore', 'dismiss_reports')),
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  reason TEXT CHECK (reason IS NULL OR char_length(reason) <= 600),
  internal_note TEXT CHECK (internal_note IS NULL OR char_length(internal_note) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_community_mod_history_post
  ON community_moderation_history (post_id, created_at DESC);

ALTER TABLE community_moderation_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_moderation_history FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS community_mod_history_rls ON community_moderation_history;
CREATE POLICY community_mod_history_rls ON community_moderation_history
  FOR ALL
  USING (COALESCE(current_setting('app.can_moderate', true), '') = 'true')
  WITH CHECK (COALESCE(current_setting('app.can_moderate', true), '') = 'true');

-- ============================================================================
-- 6. Customer & Vendor Support Issues (`FORCE ROW LEVEL SECURITY`)
-- ============================================================================
CREATE TABLE IF NOT EXISTS support_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_user_id TEXT NOT NULL CHECK (char_length(btrim(reporter_user_id)) BETWEEN 1 AND 128),
  reporter_email TEXT CHECK (reporter_email IS NULL OR length(btrim(reporter_email)) <= 254),
  reporter_context TEXT NOT NULL DEFAULT 'customer' CHECK (reporter_context IN ('customer', 'vendor')),
  category TEXT NOT NULL
    CHECK (category IN ('listing_accuracy', 'booking_dispute', 'pager_issue', 'vendor_conduct', 'account_access', 'abuse_report', 'other')),
  severity TEXT NOT NULL DEFAULT 'normal' CHECK (severity IN ('low', 'normal', 'high', 'urgent')),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'waiting', 'resolved', 'closed')),
  vendor_id TEXT REFERENCES vendors(id) ON DELETE SET NULL,
  related_booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  related_review_id UUID REFERENCES community_reviews(id) ON DELETE SET NULL,
  subject TEXT NOT NULL CHECK (char_length(btrim(subject)) BETWEEN 5 AND 140),
  description TEXT NOT NULL CHECK (char_length(btrim(description)) BETWEEN 15 AND 1500),
  confidential_reporter BOOLEAN NOT NULL DEFAULT true,
  assignee_user_id TEXT,
  resolution_reason TEXT CHECK (resolution_reason IS NULL OR char_length(resolution_reason) <= 800),
  sla_due_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '48 hours'),
  idempotency_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  UNIQUE (reporter_user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_support_issues_status_sla
  ON support_issues (status, sla_due_at ASC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_issues_reporter
  ON support_issues (reporter_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_issues_vendor
  ON support_issues (vendor_id, created_at DESC);

ALTER TABLE support_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_issues FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS support_issues_rls ON support_issues;
CREATE POLICY support_issues_rls ON support_issues
  FOR ALL
  USING (
    COALESCE(current_setting('app.can_moderate', true), '') = 'true'
    OR reporter_user_id = NULLIF(btrim(COALESCE(current_setting('app.user_id', true), '')), '')
  )
  WITH CHECK (
    COALESCE(current_setting('app.can_moderate', true), '') = 'true'
    OR reporter_user_id = NULLIF(btrim(COALESCE(current_setting('app.user_id', true), '')), '')
  );

CREATE TABLE IF NOT EXISTS support_issue_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id UUID NOT NULL REFERENCES support_issues(id) ON DELETE CASCADE,
  author_user_id TEXT NOT NULL CHECK (char_length(btrim(author_user_id)) BETWEEN 1 AND 128),
  author_role TEXT NOT NULL CHECK (char_length(btrim(author_role)) BETWEEN 1 AND 40),
  visibility TEXT NOT NULL CHECK (visibility IN ('internal', 'reporter_visible')),
  body TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 2 AND 1500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_issue_notes_issue
  ON support_issue_notes (issue_id, created_at ASC);

ALTER TABLE support_issue_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_issue_notes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS support_issue_notes_mod_all ON support_issue_notes;
CREATE POLICY support_issue_notes_mod_all ON support_issue_notes
  FOR ALL
  USING (COALESCE(current_setting('app.can_moderate', true), '') = 'true')
  WITH CHECK (COALESCE(current_setting('app.can_moderate', true), '') = 'true');

DROP POLICY IF EXISTS support_issue_notes_reporter_visible ON support_issue_notes;
CREATE POLICY support_issue_notes_reporter_visible ON support_issue_notes
  FOR SELECT
  USING (
    visibility = 'reporter_visible'
    AND EXISTS (
      SELECT 1 FROM support_issues si
      WHERE si.id = support_issue_notes.issue_id
        AND si.reporter_user_id = NULLIF(btrim(COALESCE(current_setting('app.user_id', true), '')), '')
    )
  );

DROP POLICY IF EXISTS support_issue_notes_reporter_insert ON support_issue_notes;
CREATE POLICY support_issue_notes_reporter_insert ON support_issue_notes
  FOR INSERT
  WITH CHECK (
    visibility = 'reporter_visible'
    AND author_user_id = NULLIF(btrim(COALESCE(current_setting('app.user_id', true), '')), '')
    AND EXISTS (
      SELECT 1 FROM support_issues si
      WHERE si.id = support_issue_notes.issue_id
        AND si.reporter_user_id = NULLIF(btrim(COALESCE(current_setting('app.user_id', true), '')), '')
    )
  );

-- ============================================================================
-- 7. Test-Safe Administrative & Governance Notification Outbox (`FORCE RLS`)
-- ============================================================================
CREATE TABLE IF NOT EXISTS admin_notification_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id TEXT,
  recipient_email TEXT,
  event_kind TEXT NOT NULL CHECK (char_length(btrim(event_kind)) BETWEEN 2 AND 80),
  subject TEXT NOT NULL CHECK (char_length(btrim(subject)) BETWEEN 3 AND 160),
  summary TEXT NOT NULL CHECK (char_length(btrim(summary)) BETWEEN 3 AND 800),
  delivery_status TEXT NOT NULL DEFAULT 'recorded_test_safe'
    CHECK (delivery_status IN ('recorded_test_safe', 'delivered', 'suppressed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_notification_outbox_user
  ON admin_notification_outbox (recipient_user_id, created_at DESC);

ALTER TABLE admin_notification_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_notification_outbox FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_notification_outbox_rls ON admin_notification_outbox;
CREATE POLICY admin_notification_outbox_rls ON admin_notification_outbox
  FOR ALL
  USING (
    current_setting('app.admin_portal', true) = 'true'
    OR COALESCE(current_setting('app.can_moderate', true), '') = 'true'
    OR recipient_user_id = NULLIF(btrim(COALESCE(current_setting('app.user_id', true), '')), '')
  )
  WITH CHECK (
    current_setting('app.admin_portal', true) = 'true'
    OR COALESCE(current_setting('app.can_moderate', true), '') = 'true'
  );
