-- Migration 029: Customer Private Profiles, Curated Greatest Hits Collections,
-- Revocable Unlisted Sharing, 18+ Adult Sharing Assessment & Scoped Moderation
--
-- Invariants:
--   1. Additive-only schema (`001`..`028` untouched).
--   2. Every table enables and forces Row Level Security (`ENABLE` + `FORCE ROW LEVEL SECURITY`).
--   3. Default visibility is strictly `private`; public discovery / indexing is rejected at SQL CHECK level.
--   4. Unlisted share tokens store only `token_sha256` (never plaintext tokens).
--   5. Adult sharing eligibility stores only minimal derived outcome (`unknown` | `ineligible_under_18` | `eligible_18_plus`),
--      policy version, basis, and timestamp — never raw date of birth.
--   6. Append-only `customer_share_moderation_events` revokes `UPDATE` and `DELETE`.

-- 1. Private Customer Profile & Account-Backed Preferences (`customer_profiles`)
CREATE TABLE IF NOT EXISTS customer_profiles (
  user_id TEXT PRIMARY KEY REFERENCES auth_users(id) ON DELETE CASCADE,
  public_profile_id TEXT NOT NULL UNIQUE
    CHECK (public_profile_id ~ '^prf_[a-f0-9]{24,40}$'),
  display_name TEXT NOT NULL DEFAULT ''
    CHECK (char_length(display_name) <= 60),
  bio TEXT NOT NULL DEFAULT ''
    CHECK (char_length(bio) <= 240),
  avatar_style TEXT NOT NULL DEFAULT 'initials_fern'
    CHECK (avatar_style IN (
      'initials_fern',
      'initials_terracotta',
      'initials_ochre',
      'initials_slate',
      'shark_emblem',
      'citrus_sprig'
    )),
  preferred_town TEXT
    CHECK (preferred_town IS NULL OR char_length(btrim(preferred_town)) BETWEEN 2 AND 60),
  food_interests TEXT[] NOT NULL DEFAULT '{}'::text[]
    CHECK (cardinality(food_interests) <= 10),
  communication_product_updates_opt_in BOOLEAN NOT NULL DEFAULT false,
  visibility_mode TEXT NOT NULL DEFAULT 'private'
    CHECK (visibility_mode IN ('private')),
  allow_public_indexing BOOLEAN NOT NULL DEFAULT false
    CHECK (allow_public_indexing = false),
  revision INTEGER NOT NULL DEFAULT 1
    CHECK (revision >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE customer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_profiles FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_profiles_owner_all ON customer_profiles;
CREATE POLICY customer_profiles_owner_all ON customer_profiles
  FOR ALL
  USING (
    current_setting('app.user_id', true) <> ''
    AND user_id = current_setting('app.user_id', true)
  )
  WITH CHECK (
    current_setting('app.user_id', true) <> ''
    AND user_id = current_setting('app.user_id', true)
  );

DROP POLICY IF EXISTS customer_profiles_share_lookup_select ON customer_profiles;
CREATE POLICY customer_profiles_share_lookup_select ON customer_profiles
  FOR SELECT
  USING (
    current_setting('app.share_lookup', true) = 'true'
  );

-- 2. Minimal 18+ Adult Sharing Assessment (`customer_sharing_eligibility` — zero DOB stored)
CREATE TABLE IF NOT EXISTS customer_sharing_eligibility (
  user_id TEXT PRIMARY KEY REFERENCES auth_users(id) ON DELETE CASCADE,
  eligibility_status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (eligibility_status IN ('unknown', 'ineligible_under_18', 'eligible_18_plus')),
  policy_version TEXT NOT NULL
    CHECK (char_length(btrim(policy_version)) BETWEEN 3 AND 64),
  assessment_basis TEXT NOT NULL DEFAULT 'self_attested_calendar_dob'
    CHECK (assessment_basis IN ('self_attested_calendar_dob')),
  assessed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE customer_sharing_eligibility ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_sharing_eligibility FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_sharing_eligibility_owner_all ON customer_sharing_eligibility;
CREATE POLICY customer_sharing_eligibility_owner_all ON customer_sharing_eligibility
  FOR ALL
  USING (
    current_setting('app.user_id', true) <> ''
    AND user_id = current_setting('app.user_id', true)
  )
  WITH CHECK (
    current_setting('app.user_id', true) <> ''
    AND user_id = current_setting('app.user_id', true)
  );

DROP POLICY IF EXISTS customer_sharing_eligibility_share_lookup_select ON customer_sharing_eligibility;
CREATE POLICY customer_sharing_eligibility_share_lookup_select ON customer_sharing_eligibility
  FOR SELECT
  USING (
    current_setting('app.share_lookup', true) = 'true'
  );

-- 3. Curated Greatest Hits Collections (`customer_collections`)
CREATE TABLE IF NOT EXISTS customer_collections (
  id TEXT PRIMARY KEY
    CHECK (id ~ '^col_[a-f0-9]{24,40}$'),
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  title TEXT NOT NULL
    CHECK (char_length(btrim(title)) BETWEEN 1 AND 100),
  intro TEXT NOT NULL DEFAULT ''
    CHECK (char_length(intro) <= 500),
  visibility_mode TEXT NOT NULL DEFAULT 'private'
    CHECK (visibility_mode IN ('private', 'unlisted_link')),
  moderation_status TEXT NOT NULL DEFAULT 'active'
    CHECK (moderation_status IN ('active', 'suppressed')),
  suppressed_at TIMESTAMPTZ,
  suppressed_by TEXT,
  suppression_authority TEXT
    CHECK (suppression_authority IS NULL OR suppression_authority IN ('mod', 'top')),
  suppression_reason TEXT
    CHECK (suppression_reason IS NULL OR char_length(suppression_reason) <= 400),
  suppressed_content_sha256 TEXT
    CHECK (suppressed_content_sha256 IS NULL OR suppressed_content_sha256 ~ '^[a-f0-9]{64}$'),
  revision INTEGER NOT NULL DEFAULT 1
    CHECK (revision >= 1),
  idempotency_key TEXT
    CHECK (idempotency_key IS NULL OR char_length(btrim(idempotency_key)) BETWEEN 8 AND 128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_customer_collections_user_active
  ON customer_collections (user_id, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_collections_user_idem
  ON customer_collections (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE customer_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_collections FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_collections_owner_all ON customer_collections;
CREATE POLICY customer_collections_owner_all ON customer_collections
  FOR ALL
  USING (
    current_setting('app.user_id', true) <> ''
    AND user_id = current_setting('app.user_id', true)
  )
  WITH CHECK (
    current_setting('app.user_id', true) <> ''
    AND user_id = current_setting('app.user_id', true)
  );

DROP POLICY IF EXISTS customer_collections_share_lookup_select ON customer_collections;
CREATE POLICY customer_collections_share_lookup_select ON customer_collections
  FOR SELECT
  USING (
    current_setting('app.share_lookup', true) = 'true'
  );

DROP POLICY IF EXISTS customer_collections_moderation_access ON customer_collections;
CREATE POLICY customer_collections_moderation_access ON customer_collections
  FOR ALL
  USING (
    (current_setting('app.can_moderate', true) = 'true' OR current_setting('app.is_platform_admin', true) = 'true')
    AND current_setting('app.share_moderation', true) = 'true'
  )
  WITH CHECK (
    (current_setting('app.can_moderate', true) = 'true' OR current_setting('app.is_platform_admin', true) = 'true')
    AND current_setting('app.share_moderation', true) = 'true'
  );

-- 4. Consented Re-Encoded Shared Photo Attachments (`customer_collection_photo_attachments`)
CREATE TABLE IF NOT EXISTS customer_collection_photo_attachments (
  id TEXT PRIMARY KEY
    CHECK (id ~ '^sha_[a-f0-9]{24,40}$'),
  collection_id TEXT NOT NULL REFERENCES customer_collections(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  source_photo_id TEXT REFERENCES customer_photos(id) ON DELETE SET NULL,
  recorded_source_photo_id TEXT NOT NULL
    CHECK (recorded_source_photo_id ~ '^pht_[a-f0-9]{24,40}$'),
  shared_rel_path TEXT NOT NULL
    CHECK (shared_rel_path ~ '^[a-f0-9]{2}/sha_[a-f0-9]{24,40}_shared\.webp$'),
  mime_type TEXT NOT NULL DEFAULT 'image/webp'
    CHECK (mime_type IN ('image/webp')),
  byte_size INTEGER NOT NULL
    CHECK (byte_size BETWEEN 1 AND 2097152),
  width INTEGER NOT NULL
    CHECK (width BETWEEN 1 AND 2400),
  height INTEGER NOT NULL
    CHECK (height BETWEEN 1 AND 2400),
  sha256_hex TEXT NOT NULL
    CHECK (sha256_hex ~ '^[a-f0-9]{64}$'),
  share_consent_confirmed BOOLEAN NOT NULL
    CHECK (share_consent_confirmed = true),
  consented_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  moderation_status TEXT NOT NULL DEFAULT 'active'
    CHECK (moderation_status IN ('active', 'suppressed')),
  suppressed_at TIMESTAMPTZ,
  suppressed_by TEXT,
  suppression_authority TEXT
    CHECK (suppression_authority IS NULL OR suppression_authority IN ('mod', 'top')),
  suppression_reason TEXT
    CHECK (suppression_reason IS NULL OR char_length(suppression_reason) <= 400),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  files_purged_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_collection_photo_attachments_collection
  ON customer_collection_photo_attachments (collection_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_collection_photo_attachments_source_photo
  ON customer_collection_photo_attachments (source_photo_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_collection_photo_attachments_pending_purge
  ON customer_collection_photo_attachments (revoked_at ASC)
  WHERE revoked_at IS NOT NULL AND files_purged_at IS NULL;

ALTER TABLE customer_collection_photo_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_collection_photo_attachments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_collection_photos_owner_all ON customer_collection_photo_attachments;
CREATE POLICY customer_collection_photos_owner_all ON customer_collection_photo_attachments
  FOR ALL
  USING (
    current_setting('app.user_id', true) <> ''
    AND user_id = current_setting('app.user_id', true)
  )
  WITH CHECK (
    current_setting('app.user_id', true) <> ''
    AND user_id = current_setting('app.user_id', true)
  );

DROP POLICY IF EXISTS customer_collection_photos_share_lookup_select ON customer_collection_photo_attachments;
CREATE POLICY customer_collection_photos_share_lookup_select ON customer_collection_photo_attachments
  FOR SELECT
  USING (
    current_setting('app.share_lookup', true) = 'true'
  );

DROP POLICY IF EXISTS customer_collection_photos_moderation_access ON customer_collection_photo_attachments;
CREATE POLICY customer_collection_photos_moderation_access ON customer_collection_photo_attachments
  FOR ALL
  USING (
    (current_setting('app.can_moderate', true) = 'true' OR current_setting('app.is_platform_admin', true) = 'true')
    AND current_setting('app.share_moderation', true) = 'true'
  )
  WITH CHECK (
    (current_setting('app.can_moderate', true) = 'true' OR current_setting('app.is_platform_admin', true) = 'true')
    AND current_setting('app.share_moderation', true) = 'true'
  );

DROP POLICY IF EXISTS customer_collection_photos_maintenance_all ON customer_collection_photo_attachments;
CREATE POLICY customer_collection_photos_maintenance_all ON customer_collection_photo_attachments
  FOR ALL
  USING (
    current_setting('app.photo_maintenance', true) = 'true'
  )
  WITH CHECK (
    current_setting('app.photo_maintenance', true) = 'true'
  );

-- 5. Ordered Greatest Hits Collection Entries (`customer_collection_entries`)
CREATE TABLE IF NOT EXISTS customer_collection_entries (
  id TEXT PRIMARY KEY
    CHECK (id ~ '^cle_[a-f0-9]{24,40}$'),
  collection_id TEXT NOT NULL REFERENCES customer_collections(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  position SMALLINT NOT NULL
    CHECK (position BETWEEN 1 AND 20),
  vendor_id TEXT REFERENCES vendors(id) ON DELETE SET NULL,
  recorded_vendor_id TEXT NOT NULL
    CHECK (char_length(btrim(recorded_vendor_id)) BETWEEN 1 AND 80),
  vendor_name_snapshot TEXT NOT NULL
    CHECK (char_length(btrim(vendor_name_snapshot)) BETWEEN 1 AND 140),
  vendor_town_snapshot TEXT
    CHECK (vendor_town_snapshot IS NULL OR char_length(vendor_town_snapshot) <= 80),
  vendor_cuisine_snapshot TEXT
    CHECK (vendor_cuisine_snapshot IS NULL OR char_length(vendor_cuisine_snapshot) <= 80),
  recommendation TEXT NOT NULL DEFAULT ''
    CHECK (char_length(recommendation) <= 500),
  photo_attachment_id TEXT REFERENCES customer_collection_photo_attachments(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT customer_collection_entries_unique_position UNIQUE (collection_id, position) DEFERRABLE INITIALLY IMMEDIATE,
  CONSTRAINT customer_collection_entries_unique_vendor UNIQUE (collection_id, recorded_vendor_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_collection_entries_collection_pos
  ON customer_collection_entries (collection_id, position ASC);

ALTER TABLE customer_collection_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_collection_entries FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_collection_entries_owner_all ON customer_collection_entries;
CREATE POLICY customer_collection_entries_owner_all ON customer_collection_entries
  FOR ALL
  USING (
    current_setting('app.user_id', true) <> ''
    AND user_id = current_setting('app.user_id', true)
  )
  WITH CHECK (
    current_setting('app.user_id', true) <> ''
    AND user_id = current_setting('app.user_id', true)
  );

DROP POLICY IF EXISTS customer_collection_entries_share_or_mod_select ON customer_collection_entries;
CREATE POLICY customer_collection_entries_share_or_mod_select ON customer_collection_entries
  FOR SELECT
  USING (
    current_setting('app.share_lookup', true) = 'true'
    OR (
      (current_setting('app.can_moderate', true) = 'true' OR current_setting('app.is_platform_admin', true) = 'true')
      AND current_setting('app.share_moderation', true) = 'true'
    )
  );

-- 6. Revocable Hashed Unlisted Share Grants (`customer_collection_shares`)
CREATE TABLE IF NOT EXISTS customer_collection_shares (
  id TEXT PRIMARY KEY
    CHECK (id ~ '^shr_[a-f0-9]{24,40}$'),
  collection_id TEXT NOT NULL REFERENCES customer_collections(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  token_sha256 TEXT NOT NULL UNIQUE
    CHECK (token_sha256 ~ '^[a-f0-9]{64}$'),
  masked_token_hint TEXT NOT NULL
    CHECK (char_length(masked_token_hint) BETWEEN 6 AND 24),
  include_display_name BOOLEAN NOT NULL DEFAULT false,
  include_bio BOOLEAN NOT NULL DEFAULT false,
  include_preferred_area BOOLEAN NOT NULL DEFAULT false,
  include_achievements BOOLEAN NOT NULL DEFAULT false,
  include_shared_photos BOOLEAN NOT NULL DEFAULT false,
  expires_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'revoked', 'rotated', 'suppressed')),
  replaced_by_share_id TEXT REFERENCES customer_collection_shares(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ,
  revoke_reason TEXT
    CHECK (revoke_reason IS NULL OR char_length(revoke_reason) <= 240),
  moderation_suppressed_at TIMESTAMPTZ,
  moderation_suppressed_by TEXT,
  moderation_authority TEXT
    CHECK (moderation_authority IS NULL OR moderation_authority IN ('mod', 'top')),
  moderation_reason TEXT
    CHECK (moderation_reason IS NULL OR char_length(moderation_reason) <= 400),
  idempotency_key TEXT
    CHECK (idempotency_key IS NULL OR char_length(btrim(idempotency_key)) BETWEEN 8 AND 128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_collection_shares_collection_status
  ON customer_collection_shares (collection_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_collection_shares_user_status
  ON customer_collection_shares (user_id, status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_collection_shares_user_idem
  ON customer_collection_shares (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE customer_collection_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_collection_shares FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_collection_shares_owner_all ON customer_collection_shares;
CREATE POLICY customer_collection_shares_owner_all ON customer_collection_shares
  FOR ALL
  USING (
    current_setting('app.user_id', true) <> ''
    AND user_id = current_setting('app.user_id', true)
  )
  WITH CHECK (
    current_setting('app.user_id', true) <> ''
    AND user_id = current_setting('app.user_id', true)
  );

DROP POLICY IF EXISTS customer_collection_shares_share_lookup_select ON customer_collection_shares;
CREATE POLICY customer_collection_shares_share_lookup_select ON customer_collection_shares
  FOR SELECT
  USING (
    current_setting('app.share_lookup', true) = 'true'
  );

DROP POLICY IF EXISTS customer_collection_shares_moderation_access ON customer_collection_shares;
CREATE POLICY customer_collection_shares_moderation_access ON customer_collection_shares
  FOR ALL
  USING (
    (current_setting('app.can_moderate', true) = 'true' OR current_setting('app.is_platform_admin', true) = 'true')
    AND current_setting('app.share_moderation', true) = 'true'
  )
  WITH CHECK (
    (current_setting('app.can_moderate', true) = 'true' OR current_setting('app.is_platform_admin', true) = 'true')
    AND current_setting('app.share_moderation', true) = 'true'
  );

-- 7. Abuse Reports on Unlisted Shared Pages (`customer_share_reports` — no raw tokens)
CREATE TABLE IF NOT EXISTS customer_share_reports (
  id TEXT PRIMARY KEY
    CHECK (id ~ '^srp_[a-f0-9]{24,40}$'),
  share_id TEXT NOT NULL REFERENCES customer_collection_shares(id) ON DELETE CASCADE,
  collection_id TEXT NOT NULL REFERENCES customer_collections(id) ON DELETE CASCADE,
  attachment_id TEXT REFERENCES customer_collection_photo_attachments(id) ON DELETE SET NULL,
  reporter_user_id TEXT REFERENCES auth_users(id) ON DELETE SET NULL,
  reporter_ip_hash TEXT NOT NULL
    CHECK (reporter_ip_hash ~ '^[a-f0-9]{16,64}$'),
  reason TEXT NOT NULL
    CHECK (reason IN (
      'inappropriate_content',
      'impersonation_or_misleading',
      'privacy_concern',
      'copyright_or_photo',
      'spam_or_abuse',
      'other'
    )),
  details TEXT NOT NULL DEFAULT ''
    CHECK (char_length(details) <= 500),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'reviewed_suppressed', 'dismissed')),
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_share_reports_status_created
  ON customer_share_reports (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_share_reports_collection
  ON customer_share_reports (collection_id, created_at DESC);

ALTER TABLE customer_share_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_share_reports FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_share_reports_intake ON customer_share_reports;
CREATE POLICY customer_share_reports_intake ON customer_share_reports
  FOR ALL
  USING (
    current_setting('app.share_report_intake', true) = 'true'
    OR (
      (current_setting('app.can_moderate', true) = 'true' OR current_setting('app.is_platform_admin', true) = 'true')
      AND current_setting('app.share_moderation', true) = 'true'
    )
  )
  WITH CHECK (
    current_setting('app.share_report_intake', true) = 'true'
    OR (
      (current_setting('app.can_moderate', true) = 'true' OR current_setting('app.is_platform_admin', true) = 'true')
      AND current_setting('app.share_moderation', true) = 'true'
    )
  );

-- 8. Append-Only Shared Content Moderation History (`customer_share_moderation_events`)
CREATE TABLE IF NOT EXISTS customer_share_moderation_events (
  id BIGSERIAL PRIMARY KEY,
  collection_id TEXT NOT NULL REFERENCES customer_collections(id) ON DELETE CASCADE,
  share_id TEXT REFERENCES customer_collection_shares(id) ON DELETE SET NULL,
  attachment_id TEXT REFERENCES customer_collection_photo_attachments(id) ON DELETE SET NULL,
  actor_user_id TEXT NOT NULL,
  actor_authority TEXT NOT NULL
    CHECK (actor_authority IN ('mod', 'top')),
  action TEXT NOT NULL
    CHECK (action IN (
      'suppress_collection',
      'suppress_attachment',
      'dismiss_reports',
      'reinstate_collection',
      'reinstate_attachment'
    )),
  reason TEXT NOT NULL
    CHECK (char_length(btrim(reason)) BETWEEN 4 AND 400),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_share_mod_events_collection
  ON customer_share_moderation_events (collection_id, created_at DESC);

ALTER TABLE customer_share_moderation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_share_moderation_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_share_mod_events_access ON customer_share_moderation_events;
CREATE POLICY customer_share_mod_events_access ON customer_share_moderation_events
  FOR ALL
  USING (
    (current_setting('app.can_moderate', true) = 'true' OR current_setting('app.is_platform_admin', true) = 'true')
    AND current_setting('app.share_moderation', true) = 'true'
  )
  WITH CHECK (
    (current_setting('app.can_moderate', true) = 'true' OR current_setting('app.is_platform_admin', true) = 'true')
    AND current_setting('app.share_moderation', true) = 'true'
  );

REVOKE UPDATE, DELETE ON customer_share_moderation_events FROM PUBLIC;
