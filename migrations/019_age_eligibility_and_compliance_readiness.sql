-- Migration 019: Preliminary Age-Eligibility Metadata (14+ Proposed Rule, Zero Raw DOB Storage)
-- and Business & Compliance Readiness Register (`compliance_readiness_items` + `compliance_readiness_history`)
--
-- Non-Destructive & Privacy Guarantees:
--   1. Stores ONLY derived minimum-age eligibility evidence (`not_assessed` | `eligible_14_plus`,
--      policy version, assessment timestamp, and self-reported basis) on `auth_users` and
--      `auth_otp_challenges` — NEVER raw dates of birth, birth years, or identity documents.
--   2. Preserves all existing `auth_users` rows in the honest `'not_assessed'` state (zero
--      fabricated birth dates, zero automatic approvals, zero automatic account deletions).
--   3. Enforces `FORCE ROW LEVEL SECURITY` on `compliance_readiness_items` and append-only
--      `compliance_readiness_history`, requiring structured document-version/jurisdiction/reviewer/date
--      evidence before any item can enter `'legally_approved'`.

-- ============================================================================
-- 1. Derived Age-Eligibility Metadata (Zero Raw DOB Storage)
-- ============================================================================
ALTER TABLE auth_users
  ADD COLUMN IF NOT EXISTS age_eligibility_status TEXT NOT NULL DEFAULT 'not_assessed'
    CHECK (age_eligibility_status IN ('not_assessed', 'eligible_14_plus')),
  ADD COLUMN IF NOT EXISTS age_policy_version TEXT
    CHECK (age_policy_version IS NULL OR (length(btrim(age_policy_version)) BETWEEN 3 AND 64)),
  ADD COLUMN IF NOT EXISTS age_assessed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS age_assessment_basis TEXT
    CHECK (
      age_assessment_basis IS NULL
      OR age_assessment_basis IN ('self_reported_dob_at_signup', 'self_reported_dob_next_signin')
    );

ALTER TABLE auth_users DROP CONSTRAINT IF EXISTS auth_users_age_consistency;
ALTER TABLE auth_users
  ADD CONSTRAINT auth_users_age_consistency
  CHECK (
    (
      age_eligibility_status = 'not_assessed'
      AND age_policy_version IS NULL
      AND age_assessed_at IS NULL
      AND age_assessment_basis IS NULL
    )
    OR (
      age_eligibility_status = 'eligible_14_plus'
      AND age_policy_version IS NOT NULL
      AND age_assessed_at IS NOT NULL
      AND age_assessment_basis IS NOT NULL
    )
  );

ALTER TABLE auth_otp_challenges
  ADD COLUMN IF NOT EXISTS signup_age_eligible BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS signup_age_policy_version TEXT
    CHECK (signup_age_policy_version IS NULL OR (length(btrim(signup_age_policy_version)) BETWEEN 3 AND 64)),
  ADD COLUMN IF NOT EXISTS signup_age_assessed_at TIMESTAMPTZ;

-- ============================================================================
-- 2. Business & Compliance Readiness Register (`FORCE ROW LEVEL SECURITY`)
-- ============================================================================
CREATE TABLE IF NOT EXISTS compliance_readiness_items (
  item_key TEXT PRIMARY KEY CHECK (item_key ~ '^[a-z0-9_]{3,64}$'),
  sort_order INTEGER NOT NULL,
  category TEXT NOT NULL CHECK (
    category IN (
      'business_and_entity',
      'age_and_eligibility',
      'legal_and_privacy',
      'moderation_and_ip',
      'accessibility_and_ops',
      'launch_authorization'
    )
  ),
  topic TEXT NOT NULL CHECK (length(btrim(topic)) BETWEEN 4 AND 160),
  is_launch_critical BOOLEAN NOT NULL DEFAULT true,
  mod_visible BOOLEAN NOT NULL DEFAULT true,
  mod_counsel_access_granted BOOLEAN NOT NULL DEFAULT false,
  current_practice TEXT NOT NULL CHECK (length(btrim(current_practice)) BETWEEN 4 AND 2000),
  unresolved_questions TEXT CHECK (unresolved_questions IS NULL OR length(unresolved_questions) <= 2000),
  status TEXT NOT NULL CHECK (
    status IN (
      'not_assessed',
      'decision_pending',
      'proposed',
      'implemented_verification_pending',
      'verified_internally',
      'submitted_for_legal_review',
      'changes_requested',
      'legally_approved',
      'not_applicable',
      'needs_re_review'
    )
  ),
  not_applicable_explanation TEXT CHECK (
    not_applicable_explanation IS NULL OR length(btrim(not_applicable_explanation)) BETWEEN 8 AND 600
  ),
  decision_recorded BOOLEAN NOT NULL DEFAULT false,
  implemented_recorded BOOLEAN NOT NULL DEFAULT false,
  tested_recorded BOOLEAN NOT NULL DEFAULT false,
  owner_label TEXT NOT NULL CHECK (length(btrim(owner_label)) BETWEEN 2 AND 120),
  next_action TEXT NOT NULL CHECK (length(btrim(next_action)) BETWEEN 4 AND 600),
  target_review_date DATE,
  policy_version TEXT CHECK (policy_version IS NULL OR length(btrim(policy_version)) BETWEEN 2 AND 80),
  supporting_evidence TEXT CHECK (supporting_evidence IS NULL OR length(supporting_evidence) <= 1000),
  operational_notes TEXT CHECK (operational_notes IS NULL OR length(operational_notes) <= 2000),
  confidential_counsel_notes TEXT CHECK (confidential_counsel_notes IS NULL OR length(confidential_counsel_notes) <= 2000),
  approved_doc_version TEXT CHECK (approved_doc_version IS NULL OR length(btrim(approved_doc_version)) BETWEEN 2 AND 80),
  approved_jurisdiction_scope TEXT CHECK (
    approved_jurisdiction_scope IS NULL OR length(btrim(approved_jurisdiction_scope)) BETWEEN 3 AND 240
  ),
  legal_reviewer_name TEXT CHECK (legal_reviewer_name IS NULL OR length(btrim(legal_reviewer_name)) BETWEEN 3 AND 160),
  legal_reviewed_at DATE,
  dependencies TEXT[] NOT NULL DEFAULT '{}'::text[],
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT compliance_not_applicable_requires_explanation CHECK (
    status <> 'not_applicable'
    OR (not_applicable_explanation IS NOT NULL AND length(btrim(not_applicable_explanation)) >= 8)
  ),
  CONSTRAINT compliance_legally_approved_requires_evidence CHECK (
    status <> 'legally_approved'
    OR (
      approved_doc_version IS NOT NULL
      AND approved_jurisdiction_scope IS NOT NULL
      AND legal_reviewer_name IS NOT NULL
      AND legal_reviewed_at IS NOT NULL
    )
  )
);

CREATE TABLE IF NOT EXISTS compliance_readiness_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_key TEXT NOT NULL REFERENCES compliance_readiness_items(item_key) ON DELETE RESTRICT,
  actor_id TEXT NOT NULL CHECK (length(btrim(actor_id)) BETWEEN 1 AND 128),
  actor_role TEXT NOT NULL CHECK (actor_role IN ('mod', 'top', 'system')),
  change_kind TEXT NOT NULL CHECK (
    change_kind IN (
      'seed',
      'top_update',
      'legal_approval_recorded',
      'auto_needs_re_review',
      'mod_operational_note'
    )
  ),
  from_status TEXT,
  to_status TEXT NOT NULL,
  summary TEXT NOT NULL CHECK (length(btrim(summary)) BETWEEN 3 AND 600),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compliance_history_item_created
  ON compliance_readiness_history (item_key, created_at DESC);

ALTER TABLE compliance_readiness_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_readiness_items FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS compliance_items_admin_portal_all ON compliance_readiness_items;
CREATE POLICY compliance_items_admin_portal_all ON compliance_readiness_items
  FOR ALL
  USING (COALESCE(current_setting('app.admin_portal', true), '') = 'true')
  WITH CHECK (COALESCE(current_setting('app.admin_portal', true), '') = 'true');

ALTER TABLE compliance_readiness_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_readiness_history FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS compliance_history_admin_portal_select ON compliance_readiness_history;
CREATE POLICY compliance_history_admin_portal_select ON compliance_readiness_history
  FOR SELECT
  USING (COALESCE(current_setting('app.admin_portal', true), '') = 'true');

DROP POLICY IF EXISTS compliance_history_admin_portal_insert ON compliance_readiness_history;
CREATE POLICY compliance_history_admin_portal_insert ON compliance_readiness_history
  FOR INSERT
  WITH CHECK (COALESCE(current_setting('app.admin_portal', true), '') = 'true');

-- ============================================================================
-- 3. Seed All 23 Launch-Readiness Items (Evidence-Backed Only; Unresolved Explicit)
-- ============================================================================
DO $$
BEGIN
  PERFORM set_config('app.admin_portal', 'true', true);

  INSERT INTO compliance_readiness_items (
    item_key, sort_order, category, topic, is_launch_critical, mod_visible,
    current_practice, unresolved_questions, status,
    decision_recorded, implemented_recorded, tested_recorded,
    owner_label, next_action, policy_version, supporting_evidence, dependencies
  ) VALUES
    (
      'legal_operator_identity', 10, 'business_and_entity',
      'Legal operator name and business location', true, false,
      'Draft policy pages use literal placeholder "[LEGAL OPERATOR NAME], doing business as BiteShark". No street address or official legal notice inbox is published.',
      'Confirm legal operator full name/entity, mailing address for legal/privacy notices, and designated operator contact email.',
      'decision_pending', false, false, false,
      'Operator (Admin: Top)', 'Confirm legal operator name, notice mailing address, and official support/legal email before replacing placeholders.',
      'operator-identity-unset', 'public/policies/*.html', ARRAY[]::text[]
    ),
    (
      'dba_registration', 20, 'business_and_entity',
      'DBA registration', true, false,
      'UNRESOLVED: Public brand is renamed to "BiteShark", but no fictitious business name (DBA) filing in Sonoma County or California has been recorded in this repository.',
      'Determine whether a county/state DBA ("doing business as BiteShark") filing and publication are required based on chosen entity structure.',
      'not_assessed', false, false, false,
      'Operator / Legal Counsel', 'Verify DBA filing & publication obligations with counsel after confirming entity structure.',
      NULL, NULL, ARRAY['entity_structure', 'legal_operator_identity']
    ),
    (
      'entity_structure', 30, 'business_and_entity',
      'Entity-structure decision', true, false,
      'UNRESOLVED: No LLC, corporation, or partnership has been formed or asserted in product copy.',
      'Decide whether BiteShark launches under a newly formed LLC/corporation or individual proprietorship and confirm liability/contract implications.',
      'decision_pending', false, false, false,
      'Operator / Legal & Tax Counsel', 'Select and form legal entity (if applicable) prior to signing vendor agreements or launching publicly.',
      NULL, NULL, ARRAY[]::text[]
    ),
    (
      'banking_and_tax', 40, 'business_and_entity',
      'Business banking/tax setup', true, false,
      'UNRESOLVED: No payment processor, merchant account, EIN, or tax registration is configured in the application.',
      'Confirm EIN, dedicated business bank account, and state/local tax obligations before enabling any paid placement or subscription.',
      'not_assessed', false, false, false,
      'Operator / Tax Advisor', 'Complete EIN, banking, and tax registration assessment before enabling any monetized feature.',
      NULL, NULL, ARRAY['entity_structure']
    ),
    (
      'insurance_assessment', 50, 'business_and_entity',
      'Insurance assessment', true, false,
      'UNRESOLVED: No commercial general liability, errors & omissions, or cyber/media insurance policy is recorded.',
      'Assess platform/directory liability, vendor catering inquiry disclaimers, and cyber coverage requirements with an insurance broker/counsel.',
      'not_assessed', false, false, false,
      'Operator / Insurance Broker', 'Obtain commercial & cyber insurance quotes and confirm coverage scope prior to public rollout.',
      NULL, NULL, ARRAY['entity_structure']
    ),
    (
      'launch_jurisdictions', 60, 'business_and_entity',
      'Launch jurisdictions', true, true,
      'Curated catalog covers 59 food spots in Sonoma County, California, USA. Network access to web pages is not geo-fenced.',
      'Confirm permitted launch countries/states, California privacy/consumer disclosures, and whether non-US/EU/UK traffic restrictions or compliance rules apply.',
      'decision_pending', false, false, false,
      'Operator / Legal Counsel', 'Define target launch jurisdictions (e.g., California / US-only initial rollout) and review cross-border obligations.',
      'scope-sonoma-ca-draft', 'migrations/014_unified_discovery_catalog.sql', ARRAY[]::text[]
    ),
    (
      'minimum_signup_age_14', 70, 'age_and_eligibility',
      'Minimum signup age: proposed 14+', true, true,
      'Proposed operator rule implemented in lib/age-policy.js & /api/auth/start: users aged 13 and younger are denied account creation; minimum signup age is 14 (evaluated in America/Los_Angeles; Feb 29 reaches birthday on Mar 1 in non-leap years). Existing accounts default to not_assessed with next-sign-in check.',
      'Confirm with counsel whether 14+ satisfies all target US states and whether EU/UK/international digital-consent ages (up to 16) or parental-consent rules require a higher threshold or geo-scope.',
      'verified_internally', true, true, true,
      'Operator / Privacy Counsel', 'Submit 14+ rule, timezone/leap-day boundary, and existing-account assessment flow for legal review.',
      'draft-14plus-v0.1', 'lib/age-policy.js · tests/legal-readiness.integration.cjs', ARRAY['launch_jurisdictions']
    ),
    (
      'dob_collection_minimization', 80, 'age_and_eligibility',
      'DOB collection, storage, and deletion', true, true,
      'Registration collects self-reported Month/Day/Year over HTTPS, computes 14+ eligibility server-side, and stores ONLY age_eligibility_status, age_policy_version, age_assessed_at, and self-reported basis. Raw DOB is never stored in PostgreSQL, logs, cookies, URLs, or responses; rejected signups create zero account/OTP/marketing rows.',
      'Confirm with privacy counsel that derived boolean/timestamp retention without storing full birth date satisfies recordkeeping needs and does not misstate age verification.',
      'verified_internally', true, true, true,
      'Engineering / Privacy Counsel', 'Have counsel review derived-only eligibility storage and non-coaching under-14 refusal copy.',
      'dob-derived-only-v0.1', 'migrations/019_age_eligibility_and_compliance_readiness.sql', ARRAY['minimum_signup_age_14']
    ),
    (
      'teen_user_safeguards', 90, 'age_and_eligibility',
      'Teen-user safeguards', true, true,
      'No behavioral advertising, public user profiles, direct messaging, or sale/sharing of personal data exists. Public browsing and anonymous pickup pager status checks do not require sign-in.',
      'Review California AADC / teen privacy obligations for ages 14–17, parental supervision questions, community post nickname defaults, and whether anonymous browsing/pager use raises child-privacy duties.',
      'decision_pending', false, false, false,
      'Operator / Privacy Counsel', 'Obtain legal guidance on teen account defaults (ages 14–17) and unauthenticated browsing/pager surfaces.',
      'teen-policy-draft-v0.1', 'public/policies/privacy.html', ARRAY['minimum_signup_age_14', 'launch_jurisdictions']
    ),
    (
      'contractual_eligibility_split', 100, 'age_and_eligibility',
      'Customer versus vendor contractual eligibility', true, true,
      'Draft Terms & Vendor Agreement state that 14+ customer account creation does NOT establish authority to bind a food business, submit catering contracts, or accept commercial Vendor Terms (proposed 18+ adult authority required for Vendor Owners/Admins).',
      'Confirm age of majority (18+ in CA) attestation and authority verification requirements for Vendor Owners, catering event requesters, and administrators.',
      'proposed', true, false, false,
      'Operator / Commercial Counsel', 'Define and implement explicit adult/authority attestation on vendor onboarding & catering inquiry flows per counsel advice.',
      'contract-split-v0.1', 'public/policies/vendor-terms.html', ARRAY['minimum_signup_age_14', 'terms_and_vendor_agreement']
    ),
    (
      'terms_and_vendor_agreement', 110, 'legal_and_privacy',
      'Terms and vendor agreement', true, true,
      'Preliminary staging drafts published at /policies/terms.html and /policies/vendor-terms.html (noindex, labeled working drafts, no deceptive clickwrap acceptance).',
      'Resolve governing law/venue, limitation of liability, dispute resolution, food-safety/allergen allocation, catering inquiry non-binding status, and clickwrap acceptance recording.',
      'proposed', true, true, false,
      'Operator / Legal Counsel', 'Complete attorney review of Terms of Service and Vendor Agreement and build versioned acceptance logging before launch.',
      'terms-v0.1-draft', 'public/policies/terms.html · public/policies/vendor-terms.html', ARRAY['legal_operator_identity', 'entity_structure', 'contractual_eligibility_split']
    ),
    (
      'privacy_inventory_retention', 120, 'legal_and_privacy',
      'Privacy/data inventory and retention', true, true,
      'Preliminary Privacy Notice at /policies/privacy.html documents actual Postgres tables (auth_users, sessions, OTP challenges, favorites, bookings, pickup_pagers, push subscriptions, community_reviews, vendor_applications/evidence 90d retention, support_issues, audit_logs). Automated self-service account deletion is NOT yet implemented.',
      'Confirm exact retention schedules for bookings, community posts, support issues, and append-only audit logs, and implement verified account-deletion workflow.',
      'implemented_verification_pending', true, true, false,
      'Engineering / Privacy Counsel', 'Finalize table-by-table retention periods with counsel and implement/test user account deletion.',
      'privacy-v0.1-draft', 'public/policies/privacy.html', ARRAY['legal_operator_identity', 'user_privacy_requests']
    ),
    (
      'cookie_analytics_ad_inventory', 130, 'legal_and_privacy',
      'Cookie/analytics/advertising inventory', true, true,
      'Draft Cookie & Browser Storage Notice (/policies/cookies-storage.html) inventories __Host-truckly_session, __Host-bs_age_gate cooldown cookie, functional localStorage/sessionStorage keys, and /sw.js. Zero analytics SDKs, ad pixels, or third-party trackers are installed.',
      'Re-verify before adding any map tile provider change, crash reporter, analytics tool, or sponsored placement measurement.',
      'verified_internally', true, true, true,
      'Engineering / Privacy Counsel', 'Have counsel confirm strictly-necessary storage exemptions and re-audit if any analytics/sponsored features are proposed.',
      'cookies-storage-v0.1-draft', 'public/policies/cookies-storage.html · public/policies/advertising-sponsored.html', ARRAY[]::text[]
    ),
    (
      'marketing_consent_unsubscribe', 140, 'legal_and_privacy',
      'Marketing consent and unsubscribe', true, true,
      'PUSH_PROVIDER_MODE=disabled on staging; transactional email provider is not yet connected; zero promotional emails, SMS, or marketing push messages are sent.',
      'Before enabling any promotional messaging, implement separate opt-in consent, CAN-SPAM postal address/sender disclosures, and one-click unsubscribe.',
      'proposed', true, false, false,
      'Operator / Marketing & Legal', 'Keep promotional delivery disabled until transactional email + compliant opt-in/unsubscribe mechanics are built and reviewed.',
      'marketing-boundaries-v0.1', 'public/policies/advertising-sponsored.html', ARRAY['legal_operator_identity']
    ),
    (
      'user_privacy_requests', 150, 'legal_and_privacy',
      'User privacy-request procedures', true, true,
      'UNRESOLVED: Signed-in users can open private support tickets (/api/issues), but no formal DSAR (access, export, correction, deletion) SLA runbook or dedicated privacy inbox is established.',
      'Establish verified DSAR intake channel, identity-verification steps, response SLA, and safe handling of records subject to legal/security holds.',
      'not_assessed', false, false, false,
      'Operator / Privacy Counsel', 'Define and test end-to-end user data access and deletion SOP before public launch.',
      NULL, 'public/policies/privacy.html', ARRAY['legal_operator_identity', 'privacy_inventory_retention']
    ),
    (
      'vendor_review_verification_defs', 160, 'moderation_and_ip',
      'Vendor review and verification definitions', true, true,
      'Catalog separates curated unclaimed listings (57 on staging), approved ownership claims (Admin: Top only), independent field verification (verified), and photo-rights confirmation (photo_rights_verified). Paid placement cannot purchase verification.',
      'Review public badge wording with counsel so "Verified" or "Approved Owner" is never misconstrued as a government health inspection or food-safety warranty.',
      'verified_internally', true, true, true,
      'Admin: Top / Legal Counsel', 'Confirm public verification badge disclaimers in UI and Vendor Terms with counsel.',
      'vendor-governance-v0.1', 'migrations/018_admin_portal_onboarding_moderation_issues.sql · public/policies/vendor-terms.html', ARRAY['terms_and_vendor_agreement']
    ),
    (
      'content_moderation_appeals', 170, 'moderation_and_ip',
      'Content reporting, moderation, and appeals', true, true,
      'Pre-publication review, user reporting (/api/community/report), hide/restore with immutable original text, and private support issues (/api/issues) are active. Draft Community & Moderation Policy is published at /policies/community-moderation.html.',
      'Confirm moderation SLA targets, repeat-abuse escalation thresholds, defamation/intermediary liability safe harbors (e.g., Section 230 /DSA if applicable), and appeal workflow.',
      'implemented_verification_pending', true, true, true,
      'Admin: Mod & Top / Legal Counsel', 'Review Community & Moderation Policy and appeals handling with counsel.',
      'moderation-v0.1-draft', 'public/policies/community-moderation.html', ARRAY['launch_jurisdictions']
    ),
    (
      'copyright_dmca_process', 180, 'moderation_and_ip',
      'Copyright/takedown process', true, true,
      'Curated listings suppress unverified photos (photo_rights_verified = false); dish notebook photos stay local in browser storage. UNRESOLVED: No Copyright Office DMCA Designated Agent registration or formal notice/counter-notice inbox exists yet.',
      'Register a DMCA Designated Agent (17 U.S.C. § 512(c)) once legal operator identity/address are confirmed, and publish takedown contact details.',
      'not_assessed', false, false, false,
      'Operator / IP Counsel', 'Complete US Copyright Office DMCA agent registration and add takedown contact to Terms/Community Policy.',
      NULL, 'public/policies/community-moderation.html', ARRAY['legal_operator_identity', 'entity_structure']
    ),
    (
      'accessibility_statement_testing', 190, 'accessibility_and_ops',
      'Accessibility target, testing, statement, and remediation', true, true,
      'Draft Accessibility Statement (/policies/accessibility.html) targets WCAG 2.1 AA practices; keyboard navigation, visible focus, form labels, zoom/mobile layouts, and non-color status text are tested in automated browser E2E. No formal third-party accessibility audit or assistive-tech certification has been conducted.',
      'Conduct manual screen-reader (NVDA/VoiceOver) testing across map/list fallbacks, establish an accessible feedback contact channel, and remediate any findings.',
      'implemented_verification_pending', true, true, true,
      'Engineering / Product', 'Complete manual assistive-technology testing and publish confirmed accessibility feedback contact.',
      'accessibility-v0.1-draft', 'public/policies/accessibility.html · tests/legal-readiness-browser.e2e.cjs', ARRAY['legal_operator_identity']
    ),
    (
      'security_incident_procedures', 200, 'accessibility_and_ops',
      'Security/incident procedures', true, true,
      'Technical controls include HttpOnly __Host- sessions, immediate session revocation, scoped write-pause switches, FORCE RLS, rate limits, and redacted append-only audit logs. Formal breach-notification legal playbook is pending.',
      'Document incident severity matrix, credential rotation runbook, and statutory breach-notification timelines/counsel contacts.',
      'decision_pending', false, true, true,
      'Operator / Security & Legal', 'Draft and tabletop-test incident response & statutory notification runbook before production.',
      'sec-controls-v1', 'docs/ADMIN_GOVERNANCE_AND_ONBOARDING.md', ARRAY['legal_operator_identity']
    ),
    (
      'backups_offserver_restore', 210, 'accessibility_and_ops',
      'Off-server backups and actual restore verification', true, false,
      'Daily GPG-encrypted local PostgreSQL dumps (/var/backups/truckly-staging/*.dump.gpg) and local restore verification are active on 172.233.140.74. UNRESOLVED: Backups reside on the same VPS disk; off-server encrypted replication is not yet configured.',
      'Configure automated encrypted off-host backup replication with bounded retention and execute an off-server disaster-recovery restore drill.',
      'implemented_verification_pending', true, true, true,
      'Operator / Infrastructure', 'Set up off-server encrypted backup target and verify full restore on an isolated host before production.',
      'backup-local-gpg-v1', 'deploy/backup/truckly-staging-backup.sh', ARRAY[]::text[]
    ),
    (
      'payment_subscription_prereqs', 220, 'legal_and_privacy',
      'Payment/subscription requirements before activation', false, false,
      'No checkout, billing, vendor subscriptions, booking commissions, or paid placements are implemented in code. Proposed boundaries are documented in /policies/advertising-sponsored.html.',
      'If monetization is later planned: review auto-renewal laws (e.g., CA ARL), refund/cancellation disclosures, tax collection, PCI scope, and FTC endorsement/sponsorship labeling.',
      'not_assessed', false, false, false,
      'Operator / Commercial Counsel', 'Keep paid features unimplemented until banking/tax, processor terms, and legal disclosures are approved.',
      'advertising-v0.1-draft', 'public/policies/advertising-sponsored.html', ARRAY['entity_structure', 'banking_and_tax', 'terms_and_vendor_agreement']
    ),
    (
      'final_legal_launch_gate', 230, 'launch_authorization',
      'Final legal review and public-launch authorization', true, false,
      'BLOCKED / INCOMPLETE: BiteShark is restricted to isolated staging (https://staging.biteshark.live); https://biteshark.live serves only a static coming-soon holding page. Reminder only — deployment CLI is enforced operationally by SSH operator authorization.',
      'All launch-critical business, age/eligibility, legal/privacy, IP, accessibility, security, and off-server backup dependencies must be resolved and signed off by counsel and Admin: Top before production cutover.',
      'decision_pending', false, false, false,
      'Operator (Admin: Top) & Legal Counsel', 'Complete all launch-critical readiness items, record counsel approvals, and obtain explicit production cutover authorization.',
      'launch-gate-v0.1', 'docs/ADMIN_GOVERNANCE_AND_ONBOARDING.md',
      ARRAY[
        'legal_operator_identity', 'dba_registration', 'entity_structure', 'banking_and_tax',
        'insurance_assessment', 'launch_jurisdictions', 'minimum_signup_age_14', 'dob_collection_minimization',
        'teen_user_safeguards', 'contractual_eligibility_split', 'terms_and_vendor_agreement',
        'privacy_inventory_retention', 'cookie_analytics_ad_inventory', 'marketing_consent_unsubscribe',
        'user_privacy_requests', 'vendor_review_verification_defs', 'content_moderation_appeals',
        'copyright_dmca_process', 'accessibility_statement_testing', 'security_incident_procedures',
        'backups_offserver_restore'
      ]
    )
  ON CONFLICT (item_key) DO NOTHING;

  -- Record initial seed entries in `compliance_readiness_history` idempotently
  INSERT INTO compliance_readiness_history (item_key, actor_id, actor_role, change_kind, from_status, to_status, summary)
  SELECT i.item_key, 'migration:019', 'system', 'seed', NULL, i.status, 'Initial evidence-backed readiness baseline seeded by migration 019'
  FROM compliance_readiness_items i
  WHERE NOT EXISTS (
    SELECT 1 FROM compliance_readiness_history h WHERE h.item_key = i.item_key
  );
END $$;
