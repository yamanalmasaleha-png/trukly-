-- Migration 020: Central Server-Side Pending-Age-Assessment Gate Documentation,
-- Pseudonymous Rate-Limit Identifier Wording, Historical-Record Retention Legal Question,
-- and Archive-Readability vs Completed-Database-Restore Distinction in Readiness Register.
--
-- Non-Destructive Guarantees:
--   - Additive wording refinement only on unapproved readiness items (`status <> 'legally_approved'`).
--   - Does NOT mark any unresolved legal or operational item approved.
--   - Does NOT fabricate eligibility for any existing `auth_users` row or delete historical records.

DO $$
BEGIN
  PERFORM set_config('app.admin_portal', 'true', true);

  UPDATE compliance_readiness_items
  SET current_practice = 'Proposed operator rule implemented in lib/age-policy.js, /api/auth/start, and central server/app.js + lib/db-tx.js gates: users aged 13 and younger are denied signup; minimum account age is 14 (America/Los_Angeles; Feb 29 -> Mar 1 in non-leap years). Existing not_assessed sessions (including admins) are blocked server-side across protected domain and admin routes outside a documented narrow allowlist until POST /api/auth/age-assessment succeeds.',
      unresolved_questions = 'Confirm with counsel whether 14+ satisfies target US states, whether EU/UK/international digital-consent ages or parental rules apply, and how historical non-auth records of pre-existing accounts disabled after an under-14 check should be retained or deleted.'
  WHERE item_key = 'minimum_signup_age_14'
    AND status <> 'legally_approved';

  UPDATE compliance_readiness_items
  SET current_practice = 'Registration evaluates Month/Day/Year server-side and stores ONLY age_eligibility_status, age_policy_version, age_assessed_at, and self-reported basis. Raw DOB is never stored. Rejected signups create zero accounts/OTPs/marketing rows; abuse throttling uses a 15m constant-value cookie (__Host-bs_age_gate=1) plus truncated SHA-256 IP rate-limit buckets (age_ineligible_ip), treated as minimized/pseudonymous security identifiers (not anonymous) and purged after 24h.',
      unresolved_questions = 'Confirm with privacy counsel that derived eligibility metadata + 24h pseudonymous IP rate-limit digests satisfy minimization rules, and define legal retention/deletion handling for historical records when a pre-existing account is disabled on an under-14 assessment.'
  WHERE item_key = 'dob_collection_minimization'
    AND status <> 'legally_approved';

  UPDATE compliance_readiness_items
  SET current_practice = 'Preliminary Privacy Notice (/policies/privacy.html) inventories auth_users, sessions (7d post-expiry/revocation cleanup), OTP challenges & minimized/pseudonymous truncated SHA-256 IP rate-limit buckets (24h cleanup via consumeAuthRateLimit & worker cleanupExpiredAuthRecords), favorites, bookings, pickup_pagers, community_reviews, vendor_applications/evidence (90d), support_issues, and audit_logs. Automated user account deletion is NOT yet built; disabling an ineligible existing account preserves historical records pending legal review.',
      unresolved_questions = 'Finalize table-by-table retention schedules (including historical records of disabled accounts), verify pseudonymization disclosures with counsel, and implement/test user-initiated account deletion.'
  WHERE item_key = 'privacy_inventory_retention'
    AND status <> 'legally_approved';

  UPDATE compliance_readiness_items
  SET current_practice = 'Daily GPG-encrypted local PostgreSQL dumps (/var/backups/truckly-staging/*.dump.gpg) run on 172.233.140.74. Pre-deployment checks decrypt and run pg_restore --list (archive TOC readability check, NOT a completed database restore); a full disposable-DB pg_restore drill was executed earlier during Stage 1/2 staging setup (docs/VPS_RELEASE_VERIFICATION_REPORT.md). UNRESOLVED: Backups remain on the same VPS disk without off-server replication or an off-host restore drill on the latest schema.',
      unresolved_questions = 'Configure automated encrypted off-server backup replication with bounded retention and execute a full off-server PostgreSQL database restore verification (not merely pg_restore --list) on the current schema before production launch.'
  WHERE item_key = 'backups_offserver_restore'
    AND status <> 'legally_approved';

  INSERT INTO compliance_readiness_history (item_key, actor_id, actor_role, change_kind, from_status, to_status, summary)
  SELECT
    i.item_key,
    'migration:020',
    'system',
    'seed',
    i.status,
    i.status,
    'Refined readiness wording: server-side pending-age gate allowlist, pseudonymous IP rate-limit cleanup, disabled-account record retention review item, and archive-readability vs full DB restore distinction.'
  FROM compliance_readiness_items i
  WHERE i.item_key IN ('minimum_signup_age_14', 'dob_collection_minimization', 'privacy_inventory_retention', 'backups_offserver_restore')
    AND NOT EXISTS (
      SELECT 1 FROM compliance_readiness_history h
      WHERE h.item_key = i.item_key AND h.actor_id = 'migration:020'
    );
END $$;
