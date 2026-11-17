-- P0-A: Persistent vendor registry, scoped vendor memberships, platform roles, and redacted audit logging.

CREATE TABLE IF NOT EXISTS vendors (
  id TEXT PRIMARY KEY CHECK (char_length(btrim(id)) BETWEEN 1 AND 80),
  canonical_name TEXT NOT NULL CHECK (char_length(btrim(canonical_name)) BETWEEN 1 AND 120),
  city TEXT NOT NULL DEFAULT 'Sonoma County',
  cuisine TEXT NOT NULL DEFAULT 'Global',
  listing_kind TEXT NOT NULL DEFAULT 'food_truck'
    CHECK (listing_kind IN ('food_truck', 'venue', 'market_stall', 'farm_stand', 'cafe', 'popup')),
  event_bookable BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed canonical 47 primary Sonoma listings (event_bookable = true) and 12 v77 directory places (event_bookable = false).
INSERT INTO vendors (id, canonical_name, city, cuisine, listing_kind, event_bookable, is_active) VALUES
  ('ross', 'Ross Street Food Trucks', 'Santa Rosa', 'Global', 'popup', true, true),
  ('mitote', 'Mitote Food Park', 'Santa Rosa', 'Mexican', 'venue', true, true),
  ('jalapeno', 'Jalapeño Mexican Grill', 'Santa Rosa', 'Mexican', 'food_truck', true, true),
  ('iniguez', 'Tacos Iñiguez', 'Santa Rosa', 'Mexican', 'food_truck', true, true),
  ('elenita', 'Delicias Elenita', 'Santa Rosa', 'Mexican', 'food_truck', true, true),
  ('sunny', 'Sunny Cafe & Tacos', 'Santa Rosa', 'Mexican', 'food_truck', true, true),
  ('magos', 'Gio y Los Magos', 'Santa Rosa', 'Mexican', 'food_truck', true, true),
  ('elroys', 'El Roy''s Express Mex', 'Santa Rosa', 'Mexican', 'food_truck', true, true),
  ('lucha', 'Lucha Sabina', 'Santa Rosa', 'Mexican', 'food_truck', true, true),
  ('elroys-pet-1', 'El Roy''s Taco Truck', 'Petaluma', 'Mexican', 'food_truck', true, true),
  ('elroys-pet-2', 'El Roy''s Food Truck #2', 'Petaluma', 'Mexican', 'food_truck', true, true),
  ('holy-chile', 'Holy Chile Mole', 'Petaluma', 'Mexican', 'food_truck', true, true),
  ('block', 'The Block Petaluma', 'Petaluma', 'Global', 'venue', true, true),
  ('faron', 'Faron''s New Orleans BBQ', 'Sonoma', 'Global', 'food_truck', true, true),
  ('gameday', 'Gameday Grill', 'Santa Rosa', 'Burgers', 'food_truck', true, true),
  ('munchiez', 'Bay Area Munchiez', 'Santa Rosa', 'Burgers', 'food_truck', true, true),
  ('char', 'The Char Market', 'Santa Rosa', 'Burgers', 'food_truck', true, true),
  ('onion', 'The Onion Bomb', 'Santa Rosa', 'Burgers', 'food_truck', true, true),
  ('adams', 'Adam''s Grub Truck', 'Santa Rosa', 'Burgers', 'food_truck', true, true),
  ('cichy', 'Cichy Co.', 'Santa Rosa', 'Burgers', 'food_truck', true, true),
  ('worldfare', 'World Fare Food Truck', 'Santa Rosa', 'Burgers', 'food_truck', true, true),
  ('dogaday', 'A Dog A Day', 'Santa Rosa', 'Hot Dogs', 'food_truck', true, true),
  ('streetdogz', 'Streetdogz & Streetburgerz', 'Santa Rosa', 'Hot Dogs', 'food_truck', true, true),
  ('sausage', 'The Sausage Truck', 'Santa Rosa', 'Hot Dogs', 'food_truck', true, true),
  ('hefty', 'Hefty Gyros', 'Santa Rosa', 'Global', 'food_truck', true, true),
  ('momo', 'MoMo Man', 'Santa Rosa', 'Global', 'food_truck', true, true),
  ('xies', 'Xies707 Sushi Rolls', 'Santa Rosa', 'Global', 'food_truck', true, true),
  ('api-hot', 'API Hot Chicken', 'Santa Rosa', 'Global', 'food_truck', true, true),
  ('dinos', 'Dino''s Greek Food', 'Santa Rosa', 'Global', 'food_truck', true, true),
  ('dang', 'Dang That''s Good', 'Santa Rosa', 'Global', 'food_truck', true, true),
  ('drip', 'Drip Sandwiches', 'Santa Rosa', 'Global', 'food_truck', true, true),
  ('fruta', 'Fru-ta Ice Cream Truck', 'Santa Rosa', 'Sweets', 'food_truck', true, true),
  ('heritage', 'Best Food Truck Ever by Heritage Eats', 'Santa Rosa', 'Sweets', 'food_truck', true, true),
  ('andrew', 'Mr. Andrew Food Trailer', 'Santa Rosa', 'Sweets', 'food_truck', true, true),
  ('kolobok', 'Kolobok Russian Soul Food Truck', 'Santa Rosa', 'Global', 'food_truck', true, true),
  ('rich', 'Little Rich''s Italian Ice', 'Santa Rosa', 'Sweets', 'food_truck', true, true),
  ('momolicious', 'Momolicious', 'Santa Rosa', 'Sweets', 'food_truck', true, true),
  ('market-chavas', 'Chava''s Pizza', 'Petaluma', 'Global', 'market_stall', true, true),
  ('market-myriad', 'Myriad Coffee', 'Petaluma', 'Sweets', 'market_stall', true, true),
  ('market-chicken', 'What A Chicken!?', 'Petaluma', 'Global', 'market_stall', true, true),
  ('market-donpepe', 'Tacos Don Pepe', 'Petaluma', 'Mexican', 'market_stall', true, true),
  ('market-sushi', 'Sushi Shoubu', 'Petaluma', 'Global', 'market_stall', true, true),
  ('market-boba', 'Bai Chai Boba Tea', 'Petaluma', 'Sweets', 'market_stall', true, true),
  ('market-urban', 'Urban Deli', 'Petaluma', 'Global', 'market_stall', true, true),
  ('market-roti', 'Roti', 'Petaluma', 'Global', 'market_stall', true, true),
  ('market-mifiesta', 'Mi Fiesta Catering Co.', 'Petaluma', 'Mexican', 'market_stall', true, true),
  ('market-fusion', 'Fusion 2 Go', 'Petaluma', 'Global', 'market_stall', true, true),
  ('farm-oakhill', 'Oak Hill Farm — Red Barn Store', 'Glen Ellen', 'Farm produce', 'farm_stand', false, true),
  ('farm-barn', 'Farm Barn', 'Petaluma', 'Eggs & farm goods', 'farm_stand', false, true),
  ('market-sr-community', 'Santa Rosa Community Farmers Market', 'Santa Rosa', 'Farmers market', 'venue', false, true),
  ('market-sr-original', 'Santa Rosa Original Certified Farmers Market', 'Santa Rosa', 'Farmers market', 'venue', false, true),
  ('truck-galvans', 'Galvan’s Eatery', 'Sonoma County', 'Mexican-American', 'popup', false, true),
  ('truck-flippin', 'Los Flippin Tacos', 'Sonoma County', 'Mexican', 'popup', false, true),
  ('truck-casanostra', 'Casa Nostra NorCal', 'Rohnert Park', 'Pizza & pasta', 'popup', false, true),
  ('truck-thespot', 'The Spot Food Truck', 'Sonoma County', 'Burgers & sandwiches', 'popup', false, true),
  ('coffee-crooks', 'Crooks Coffee', 'Santa Rosa', 'Coffee & café', 'cafe', false, true),
  ('coffee-retrograde', 'Retrograde Coffee Roasters', 'Sebastopol', 'Coffee & café', 'cafe', false, true),
  ('coffee-avid-petaluma', 'Avid Coffee — Downtown Petaluma', 'Petaluma', 'Coffee & café', 'cafe', false, true),
  ('coffee-avid-sr', 'Avid Coffee — Montgomery Village', 'Santa Rosa', 'Coffee & café', 'cafe', false, true)
ON CONFLICT (id) DO NOTHING;

-- Quarantine any pre-existing legacy truck_ids (such as 'estrella' or 'owner-truck') as inactive/non-bookable
-- so foreign keys succeed cleanly without exposing legacy prototype rows to independent vendors or new bookings.
INSERT INTO vendors (id, canonical_name, city, cuisine, listing_kind, event_bookable, is_active)
SELECT DISTINCT legacy_id, 'Legacy Quarantined (' || legacy_id || ')', 'Unassigned', 'Legacy', 'food_truck', false, false
FROM (
  SELECT truck_id AS legacy_id FROM truck_settings WHERE truck_id IS NOT NULL AND btrim(truck_id) <> ''
  UNION
  SELECT truck_id AS legacy_id FROM owner_profiles WHERE truck_id IS NOT NULL AND btrim(truck_id) <> ''
  UNION
  SELECT truck_id AS legacy_id FROM owner_schedule WHERE truck_id IS NOT NULL AND btrim(truck_id) <> ''
  UNION
  SELECT truck_id AS legacy_id FROM bookings WHERE truck_id IS NOT NULL AND btrim(truck_id) <> ''
) AS existing_refs
ON CONFLICT (id) DO NOTHING;

-- Normalize blank legacy truck_ids in bookings to NULL before adding FK
UPDATE bookings SET truck_id = NULL WHERE truck_id IS NOT NULL AND btrim(truck_id) = '';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'truck_settings_vendor_fk') THEN
    ALTER TABLE truck_settings ADD CONSTRAINT truck_settings_vendor_fk FOREIGN KEY (truck_id) REFERENCES vendors(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'owner_profiles_vendor_fk') THEN
    ALTER TABLE owner_profiles ADD CONSTRAINT owner_profiles_vendor_fk FOREIGN KEY (truck_id) REFERENCES vendors(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'owner_schedule_vendor_fk') THEN
    ALTER TABLE owner_schedule ADD CONSTRAINT owner_schedule_vendor_fk FOREIGN KEY (truck_id) REFERENCES vendors(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_vendor_fk') THEN
    ALTER TABLE bookings ADD CONSTRAINT bookings_vendor_fk FOREIGN KEY (truck_id) REFERENCES vendors(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- Platform-wide privileged roles (distinct from vendor memberships).
CREATE TABLE IF NOT EXISTS platform_roles (
  user_id TEXT PRIMARY KEY CHECK (char_length(btrim(user_id)) BETWEEN 1 AND 128),
  role TEXT NOT NULL CHECK (role IN ('platform_admin', 'moderator')),
  granted_by TEXT NOT NULL CHECK (char_length(btrim(granted_by)) BETWEEN 1 AND 128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Vendor-scoped memberships: 'owner' (profile, booking decisions, schedule, location, pagers)
-- vs 'staff' (operational location, schedule, pagers, read-only vendor requests/stats).
CREATE TABLE IF NOT EXISTS vendor_memberships (
  vendor_id TEXT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL CHECK (char_length(btrim(user_id)) BETWEEN 1 AND 128),
  role TEXT NOT NULL CHECK (role IN ('owner', 'staff')),
  granted_by TEXT NOT NULL CHECK (char_length(btrim(granted_by)) BETWEEN 1 AND 128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (vendor_id, user_id)
);

CREATE INDEX IF NOT EXISTS vendor_memberships_user_idx ON vendor_memberships(user_id);

-- Prevent self-grant / self-elevation unless explicitly executed under a platform_admin context.
CREATE OR REPLACE FUNCTION guard_membership_grant() RETURNS trigger AS $$
BEGIN
  IF NEW.user_id = NEW.granted_by AND COALESCE(current_setting('app.is_platform_admin', true), '') <> 'true' THEN
    RAISE EXCEPTION 'Users cannot grant or elevate their own vendor membership';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_guard_membership_grant ON vendor_memberships;
CREATE TRIGGER trg_guard_membership_grant
  BEFORE INSERT OR UPDATE ON vendor_memberships
  FOR EACH ROW EXECUTE FUNCTION guard_membership_grant();

-- Extend pickup_pagers with canonical vendor_id and actor metadata.
ALTER TABLE pickup_pagers
  ADD COLUMN IF NOT EXISTS vendor_id TEXT REFERENCES vendors(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS created_by TEXT,
  ADD COLUMN IF NOT EXISTS updated_by TEXT;

-- Backfill legacy pickup_pagers where vendor display text unambiguously matches an active canonical vendor name.
UPDATE pickup_pagers p
SET vendor_id = v.id
FROM vendors v
WHERE p.vendor_id IS NULL
  AND v.is_active = true
  AND lower(btrim(p.vendor)) = lower(v.canonical_name);

CREATE INDEX IF NOT EXISTS pickup_pagers_vendor_active_idx
  ON pickup_pagers(vendor_id, created_at DESC)
  WHERE status NOT IN ('collected', 'cancelled');

-- Require canonical vendor_id on all new pickup_pagers rows (legacy unmapped rows stay NULL and restricted to platform_admin).
CREATE OR REPLACE FUNCTION enforce_pickup_pager_vendor_id() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' AND (NEW.vendor_id IS NULL OR btrim(NEW.vendor_id) = '') THEN
    RAISE EXCEPTION 'pickup_pagers requires a canonical vendor_id';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.vendor_id IS DISTINCT FROM NEW.vendor_id AND OLD.vendor_id IS NOT NULL THEN
    RAISE EXCEPTION 'pickup_pagers vendor_id is immutable once assigned';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_pickup_pager_vendor_id ON pickup_pagers;
CREATE TRIGGER trg_enforce_pickup_pager_vendor_id
  BEFORE INSERT OR UPDATE ON pickup_pagers
  FOR EACH ROW EXECUTE FUNCTION enforce_pickup_pager_vendor_id();

-- Privileged state-change audit log (private pager bearer UUIDs and sensitive bodies are redacted before insert).
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id TEXT NOT NULL CHECK (char_length(btrim(actor_id)) BETWEEN 1 AND 128),
  actor_role TEXT NOT NULL CHECK (char_length(btrim(actor_role)) BETWEEN 1 AND 40),
  vendor_id TEXT REFERENCES vendors(id) ON DELETE SET NULL,
  target_type TEXT NOT NULL CHECK (char_length(btrim(target_type)) BETWEEN 1 AND 60),
  target_id TEXT NOT NULL CHECK (char_length(btrim(target_id)) BETWEEN 1 AND 160),
  action TEXT NOT NULL CHECK (char_length(btrim(action)) BETWEEN 1 AND 80),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_logs_vendor_idx ON audit_logs(vendor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_actor_idx ON audit_logs(actor_id, created_at DESC);
