-- 027_customer_exploration_foundation.sql
-- Account-backed Customer Exploration Foundation:
--   1. `customer_visits`: Self-reported daily visit journal (at most 1 active visit per user + business + America/Los_Angeles calendar day; repeat visits on distinct days allowed).
--   2. `customer_photos`: Private account-backed dish & visit photo metadata pointing to verified, metadata-stripped storage files outside the public web root (max 12 active per user).
--   3. `customer_saved_trails` & `customer_saved_trail_stops`: Ordered saved itineraries with per-stop match rationale and post-save visit progress tracking.
-- All tables enforce `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` scoped strictly to `current_setting('app.user_id', true)`.

BEGIN;

-- ============================================================================
-- 1. Self-Reported Customer Visit Journal (`customer_visits`)
-- ============================================================================
CREATE TABLE IF NOT EXISTS customer_visits (
  id TEXT PRIMARY KEY CHECK (id ~ '^vst_[a-f0-9]{24,40}$'),
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  vendor_id TEXT REFERENCES vendors(id) ON DELETE SET NULL,
  recorded_vendor_id TEXT NOT NULL CHECK (recorded_vendor_id ~ '^[a-z0-9][a-z0-9_-]{0,79}$'),
  vendor_name_snapshot TEXT NOT NULL CHECK (length(btrim(vendor_name_snapshot)) BETWEEN 1 AND 140),
  normalized_cuisine TEXT NOT NULL CHECK (length(btrim(normalized_cuisine)) BETWEEN 1 AND 48),
  normalized_town TEXT CHECK (normalized_town IS NULL OR length(btrim(normalized_town)) BETWEEN 1 AND 64),
  private_note TEXT NOT NULL DEFAULT '' CHECK (char_length(private_note) <= 280),
  visited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  visit_local_date DATE NOT NULL,
  calendar_tz TEXT NOT NULL DEFAULT 'America/Los_Angeles' CHECK (calendar_tz = 'America/Los_Angeles'),
  entry_source TEXT NOT NULL DEFAULT 'manual'
    CHECK (entry_source IN ('manual', 'detail_modal', 'saved_trail', 'legacy_import')),
  idempotency_key TEXT CHECK (idempotency_key IS NULL OR length(btrim(idempotency_key)) BETWEEN 8 AND 128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_visits_active_user_vendor_day
  ON customer_visits (user_id, recorded_vendor_id, visit_local_date)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_visits_user_idempotency
  ON customer_visits (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customer_visits_user_active_history
  ON customer_visits (user_id, visit_local_date DESC, created_at DESC, id DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_customer_visits_user_vendor_active
  ON customer_visits (user_id, recorded_vendor_id, visit_local_date)
  WHERE deleted_at IS NULL;

ALTER TABLE customer_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_visits FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_visits_owner_all ON customer_visits;
CREATE POLICY customer_visits_owner_all ON customer_visits
  FOR ALL
  USING (
    current_setting('app.user_id', true) <> ''
    AND user_id = current_setting('app.user_id', true)
  )
  WITH CHECK (
    current_setting('app.user_id', true) <> ''
    AND user_id = current_setting('app.user_id', true)
  );

-- ============================================================================
-- 2. Private Account-Backed Customer Photos (`customer_photos`)
-- ============================================================================
CREATE TABLE IF NOT EXISTS customer_photos (
  id TEXT PRIMARY KEY CHECK (id ~ '^pht_[a-f0-9]{24,40}$'),
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  vendor_id TEXT REFERENCES vendors(id) ON DELETE SET NULL,
  recorded_vendor_id TEXT CHECK (recorded_vendor_id IS NULL OR recorded_vendor_id ~ '^[a-z0-9][a-z0-9_-]{0,79}$'),
  vendor_name_snapshot TEXT CHECK (vendor_name_snapshot IS NULL OR length(btrim(vendor_name_snapshot)) BETWEEN 1 AND 140),
  caption TEXT NOT NULL DEFAULT '' CHECK (char_length(caption) <= 160),
  mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 5242880),
  thumb_byte_size INTEGER NOT NULL CHECK (thumb_byte_size > 0 AND thumb_byte_size <= 1048576),
  width INTEGER NOT NULL CHECK (width BETWEEN 1 AND 6000),
  height INTEGER NOT NULL CHECK (height BETWEEN 1 AND 6000),
  sha256_hex TEXT NOT NULL CHECK (sha256_hex ~ '^[a-f0-9]{64}$'),
  storage_rel_path TEXT NOT NULL
    CHECK (storage_rel_path ~ '^[a-f0-9]{2}/pht_[a-f0-9]{24,40}_main\.(jpg|png|webp)$'),
  thumb_rel_path TEXT NOT NULL
    CHECK (thumb_rel_path ~ '^[a-f0-9]{2}/pht_[a-f0-9]{24,40}_thumb\.webp$'),
  entry_source TEXT NOT NULL DEFAULT 'manual'
    CHECK (entry_source IN ('manual', 'detail_modal', 'legacy_import')),
  idempotency_key TEXT CHECK (idempotency_key IS NULL OR length(btrim(idempotency_key)) BETWEEN 8 AND 128),
  taken_local_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  files_purged_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_photos_user_idempotency
  ON customer_photos (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customer_photos_user_active_created
  ON customer_photos (user_id, created_at DESC, id DESC)
  WHERE deleted_at IS NULL;

ALTER TABLE customer_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_photos FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_photos_owner_all ON customer_photos;
CREATE POLICY customer_photos_owner_all ON customer_photos
  FOR ALL
  USING (
    current_setting('app.user_id', true) <> ''
    AND user_id = current_setting('app.user_id', true)
  )
  WITH CHECK (
    current_setting('app.user_id', true) <> ''
    AND user_id = current_setting('app.user_id', true)
  );

-- ============================================================================
-- 3. Account-Backed Saved Suggested Trails (`customer_saved_trails` & `_stops`)
-- ============================================================================
CREATE TABLE IF NOT EXISTS customer_saved_trails (
  id TEXT PRIMARY KEY CHECK (id ~ '^trl_[a-f0-9]{24,40}$'),
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 100),
  theme_key TEXT NOT NULL CHECK (theme_key IN ('sweet', 'farm', 'mix', 'shared', 'custom')),
  town_filter TEXT CHECK (town_filter IS NULL OR length(btrim(town_filter)) BETWEEN 1 AND 64),
  saved_local_date DATE NOT NULL,
  idempotency_key TEXT CHECK (idempotency_key IS NULL OR length(btrim(idempotency_key)) BETWEEN 8 AND 128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_saved_trails_user_idempotency
  ON customer_saved_trails (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customer_saved_trails_user_active
  ON customer_saved_trails (user_id, created_at DESC, id DESC)
  WHERE deleted_at IS NULL;

ALTER TABLE customer_saved_trails ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_saved_trails FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_saved_trails_owner_all ON customer_saved_trails;
CREATE POLICY customer_saved_trails_owner_all ON customer_saved_trails
  FOR ALL
  USING (
    current_setting('app.user_id', true) <> ''
    AND user_id = current_setting('app.user_id', true)
  )
  WITH CHECK (
    current_setting('app.user_id', true) <> ''
    AND user_id = current_setting('app.user_id', true)
  );

CREATE TABLE IF NOT EXISTS customer_saved_trail_stops (
  trail_id TEXT NOT NULL REFERENCES customer_saved_trails(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  position SMALLINT NOT NULL CHECK (position BETWEEN 1 AND 6),
  vendor_id TEXT REFERENCES vendors(id) ON DELETE SET NULL,
  recorded_vendor_id TEXT NOT NULL CHECK (recorded_vendor_id ~ '^[a-z0-9][a-z0-9_-]{0,79}$'),
  vendor_name_snapshot TEXT NOT NULL CHECK (length(btrim(vendor_name_snapshot)) BETWEEN 1 AND 140),
  match_reason TEXT NOT NULL CHECK (length(btrim(match_reason)) BETWEEN 1 AND 220),
  PRIMARY KEY (trail_id, position),
  UNIQUE (trail_id, recorded_vendor_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_saved_trail_stops_user
  ON customer_saved_trail_stops (user_id, trail_id, position);

ALTER TABLE customer_saved_trail_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_saved_trail_stops FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_saved_trail_stops_owner_all ON customer_saved_trail_stops;
CREATE POLICY customer_saved_trail_stops_owner_all ON customer_saved_trail_stops
  FOR ALL
  USING (
    current_setting('app.user_id', true) <> ''
    AND user_id = current_setting('app.user_id', true)
  )
  WITH CHECK (
    current_setting('app.user_id', true) <> ''
    AND user_id = current_setting('app.user_id', true)
  );

COMMIT;
