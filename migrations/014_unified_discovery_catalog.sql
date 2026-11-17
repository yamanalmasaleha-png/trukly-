-- P1: Unified Discovery Catalog, Truthful Location Metadata & Schedule Timestamps.
-- Extends existing `vendors`, `truck_settings`, and `owner_schedule` tables additively
-- so all 59 Sonoma County directory listings and authorized owner updates are served
-- from a single PostgreSQL read model without competing hardcoded catalogs.

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS section TEXT,
  ADD COLUMN IF NOT EXISTS emoji TEXT NOT NULL DEFAULT '🚚',
  ADD COLUMN IF NOT EXISTS kind_label TEXT,
  ADD COLUMN IF NOT EXISTS listing_type TEXT NOT NULL DEFAULT 'Mobile / catering',
  ADD COLUMN IF NOT EXISTS popup BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS extra BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS blurb TEXT NOT NULL DEFAULT 'Find local food and check the current menu, location and availability directly with the vendor.',
  ADD COLUMN IF NOT EXISTS special_note TEXT,
  ADD COLUMN IF NOT EXISTS source_url TEXT,
  ADD COLUMN IF NOT EXISTS story_source_url TEXT,
  ADD COLUMN IF NOT EXISTS checked_label TEXT,
  ADD COLUMN IF NOT EXISTS price TEXT NOT NULL DEFAULT '$$',
  ADD COLUMN IF NOT EXISTS color TEXT NOT NULL DEFAULT '#ff6b5f',
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS rating NUMERIC(2,1),
  ADD COLUMN IF NOT EXISTS reviews INTEGER,
  ADD COLUMN IF NOT EXISTS featured BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS curated_location TEXT NOT NULL DEFAULT 'Sonoma County service area · location varies',
  ADD COLUMN IF NOT EXISTS curated_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS curated_lng DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS curated_location_source TEXT NOT NULL DEFAULT 'curated_illustrative',
  ADD COLUMN IF NOT EXISTS curated_location_accuracy TEXT NOT NULL DEFAULT 'illustrative_pin',
  ADD COLUMN IF NOT EXISTS curated_hours TEXT NOT NULL DEFAULT 'Schedule not verified · contact vendor',
  ADD COLUMN IF NOT EXISTS recurring_schedule JSONB,
  ADD COLUMN IF NOT EXISTS verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'needs_review',
  ADD COLUMN IF NOT EXISTS photo TEXT,
  ADD COLUMN IF NOT EXISTS photo_rights_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vendors_curated_lat_chk') THEN
    ALTER TABLE vendors ADD CONSTRAINT vendors_curated_lat_chk
      CHECK (curated_lat IS NULL OR (curated_lat BETWEEN -90 AND 90));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vendors_curated_lng_chk') THEN
    ALTER TABLE vendors ADD CONSTRAINT vendors_curated_lng_chk
      CHECK (curated_lng IS NULL OR (curated_lng BETWEEN -180 AND 180));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vendors_curated_coord_pair_chk') THEN
    ALTER TABLE vendors ADD CONSTRAINT vendors_curated_coord_pair_chk
      CHECK ((curated_lat IS NULL) = (curated_lng IS NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vendors_curated_loc_source_chk') THEN
    ALTER TABLE vendors ADD CONSTRAINT vendors_curated_loc_source_chk
      CHECK (curated_location_source IN ('venue_published', 'curated_illustrative', 'unknown'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vendors_curated_loc_accuracy_chk') THEN
    ALTER TABLE vendors ADD CONSTRAINT vendors_curated_loc_accuracy_chk
      CHECK (curated_location_accuracy IN ('verified_coordinate', 'venue_address', 'illustrative_pin', 'none'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vendors_verification_consistency_chk') THEN
    ALTER TABLE vendors ADD CONSTRAINT vendors_verification_consistency_chk
      CHECK (
        (verified = true AND verification_status = 'business_confirmed') OR
        (verified = false AND verification_status = 'needs_review')
      );
  END IF;
END $$;

-- Extend truck_settings with explicit truthful location coordinates, source, accuracy, observation & expiry.
ALTER TABLE truck_settings
  ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS location_source TEXT NOT NULL DEFAULT 'owner_reported',
  ADD COLUMN IF NOT EXISTS location_accuracy TEXT NOT NULL DEFAULT 'owner_text_only',
  ADD COLUMN IF NOT EXISTS observed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'truck_settings_lat_chk') THEN
    ALTER TABLE truck_settings ADD CONSTRAINT truck_settings_lat_chk
      CHECK (lat IS NULL OR (lat BETWEEN -90 AND 90));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'truck_settings_lng_chk') THEN
    ALTER TABLE truck_settings ADD CONSTRAINT truck_settings_lng_chk
      CHECK (lng IS NULL OR (lng BETWEEN -180 AND 180));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'truck_settings_coord_pair_chk') THEN
    ALTER TABLE truck_settings ADD CONSTRAINT truck_settings_coord_pair_chk
      CHECK ((lat IS NULL) = (lng IS NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'truck_settings_loc_source_chk') THEN
    ALTER TABLE truck_settings ADD CONSTRAINT truck_settings_loc_source_chk
      CHECK (location_source IN ('owner_reported', 'temporary_service'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'truck_settings_loc_accuracy_chk') THEN
    ALTER TABLE truck_settings ADD CONSTRAINT truck_settings_loc_accuracy_chk
      CHECK (location_accuracy IN ('owner_text_only', 'owner_reported_coords'));
  END IF;
END $$;

-- Add updated_at to owner_schedule so schedule publishes advance discovery catalog_version immediately.
ALTER TABLE owner_schedule
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS vendors_active_sort_idx ON vendors (is_active, sort_order ASC, id ASC);

-- Deterministic upsert of all 59 canonical Sonoma County directory listings:
--   1..47: Primary Sonoma County catalog listings (extra = false, event_bookable = true)
--   48..59: Reconciled v77 neighborhood directory places (extra = true, event_bookable = false)
INSERT INTO vendors (
  id, sort_order, canonical_name, section, cuisine, emoji, city,
  listing_kind, kind_label, listing_type, popup, extra,
  blurb, special_note, source_url, story_source_url, checked_label,
  price, color, tags, rating, reviews, featured,
  curated_location, curated_lat, curated_lng, curated_location_source, curated_location_accuracy,
  curated_hours, recurring_schedule,
  verified, verification_status, photo, photo_rights_verified,
  event_bookable, is_active, updated_at
) VALUES
  -- 1..47 Primary Sonoma County listings
  ('ross', 1, 'Ross Street Food Trucks', 'Global', 'Global', '📍', 'Santa Rosa', 'popup', NULL, 'Scheduled pop-up', false, false, 'Rotating Ross Street weekday food trucks. Published lineups vary by season; confirm the current schedule before visiting.', NULL, NULL, NULL, NULL, '$$', '#ff6b5f', ARRAY['Global'], NULL, NULL, true, 'Ross Street, Downtown Santa Rosa', 38.4405, -122.7144, 'curated_illustrative', 'illustrative_pin', 'Historical lunch window: 11 AM – 2 PM · confirm current schedule', NULL, false, 'needs_review', NULL, false, true, true, now()),
  ('mitote', 2, 'Mitote Food Park', 'Mexican', 'Mexican', '🎉', 'Santa Rosa', 'venue', NULL, 'Fixed truck / venue', false, false, 'Find local food and check the current menu, location and availability directly with the vendor.', NULL, 'https://www.mitotefoodpark.com/', NULL, NULL, '$$', '#f6bd4b', ARRAY['Mexican'], 4.7, 142, true, '100 Sebastopol Rd, Santa Rosa', 38.4375, -122.7289, 'venue_published', 'venue_address', 'Multiple vendors · check today’s lineup', NULL, false, 'needs_review', 'https://truckly.hatchable.site/assets/mitote.jpg', false, true, true, now()),
  ('jalapeno', 3, 'Jalapeño Mexican Grill', 'Mexican', 'Mexican', '🌶️', 'Santa Rosa', 'food_truck', NULL, 'Fixed truck / venue', false, false, 'Find local food and check the current menu, location and availability directly with the vendor.', NULL, NULL, NULL, NULL, '$$', '#80cbb2', ARRAY['Mexican'], 4.7, 102, false, '1630 Sebastopol Rd, Santa Rosa', 38.4321, -122.7372, 'venue_published', 'illustrative_pin', 'Schedule not verified · contact vendor', NULL, false, 'needs_review', NULL, false, true, true, now()),
  ('iniguez', 4, 'Tacos Iñiguez', 'Mexican', 'Mexican', '🌮', 'Santa Rosa', 'food_truck', NULL, 'Fixed truck / venue', false, false, 'Find local food and check the current menu, location and availability directly with the vendor.', NULL, NULL, NULL, NULL, '$$', '#f3a7c5', ARRAY['Mexican'], 4.6, 51, false, '460 Mission Blvd, Santa Rosa', 38.4358, -122.7315, 'venue_published', 'illustrative_pin', 'Schedule not verified · contact vendor', NULL, false, 'needs_review', NULL, false, true, true, now()),
  ('elenita', 5, 'Delicias Elenita', 'Mexican', 'Mexican', '🫔', 'Santa Rosa', 'food_truck', NULL, 'Fixed truck / venue', false, false, 'Find local food and check the current menu, location and availability directly with the vendor.', NULL, NULL, NULL, NULL, '$$', '#8db7e8', ARRAY['Mexican'], 4.3, 122, false, '816 Sebastopol Rd, Santa Rosa', 38.4694, -122.6679, 'venue_published', 'illustrative_pin', 'Schedule not verified · contact vendor', NULL, false, 'needs_review', NULL, false, true, true, now()),
  ('sunny', 6, 'Sunny Cafe & Tacos', 'Mexican', 'Mexican', '☀️', 'Santa Rosa', 'food_truck', NULL, 'Fixed truck / venue', false, false, 'Find local food and check the current menu, location and availability directly with the vendor.', NULL, NULL, NULL, NULL, '$$', '#ff6b5f', ARRAY['Mexican'], 4.7, 26, false, '3230 Coffey Ln, Santa Rosa', 38.4238, -122.7132, 'venue_published', 'illustrative_pin', 'Schedule not verified · contact vendor', NULL, false, 'needs_review', NULL, false, true, true, now()),
  ('magos', 7, 'Gio y Los Magos', 'Mexican', 'Mexican', '🪄', 'Santa Rosa', 'food_truck', NULL, 'Fixed truck / venue', false, false, 'Find local food and check the current menu, location and availability directly with the vendor.', NULL, NULL, NULL, NULL, '$$', '#f6bd4b', ARRAY['Mexican'], 4.8, 18, false, 'Previously at Mitote Food Park · confirm current vendor location', 38.4522, -122.6890, 'curated_illustrative', 'illustrative_pin', 'Schedule not verified · contact vendor', NULL, false, 'needs_review', NULL, false, true, true, now()),
  ('elroys', 8, 'El Roy''s Express Mex', 'Mexican', 'Mexican', '🌯', 'Santa Rosa', 'food_truck', NULL, 'Fixed truck / venue', false, false, 'Find local food and check the current menu, location and availability directly with the vendor.', NULL, 'https://elroys.com/locations/', NULL, NULL, '$$', '#80cbb2', ARRAY['Mexican'], 4.2, 71, false, '1569 Sebastopol Rd, Santa Rosa', 38.4610, -122.7350, 'venue_published', 'illustrative_pin', 'Schedule not verified · contact vendor', NULL, false, 'needs_review', NULL, false, true, true, now()),
  ('lucha', 9, 'Lucha Sabina', 'Mexican', 'Mexican', '🥊', 'Santa Rosa', 'food_truck', NULL, 'Mobile / catering', false, false, 'Find local food and check the current menu, location and availability directly with the vendor.', NULL, NULL, NULL, NULL, '$$', '#f3a7c5', ARRAY['Mexican'], NULL, NULL, false, 'Mitote Food Park / mobile schedule', 38.4460, -122.7010, 'curated_illustrative', 'illustrative_pin', 'Schedule not verified · contact vendor', NULL, false, 'needs_review', NULL, false, true, true, now()),
  ('elroys-pet-1', 10, 'El Roy''s Taco Truck', 'Mexican', 'Mexican', '🌮', 'Petaluma', 'food_truck', NULL, 'Fixed truck / venue', false, false, 'Find local food and check the current menu, location and availability directly with the vendor.', NULL, 'https://elroys.com/locations/', NULL, NULL, '$$', '#8db7e8', ARRAY['Mexican'], 4.2, 62, true, '401 E Washington St, Petaluma', 38.2437, -122.6269, 'venue_published', 'venue_address', 'Schedule not verified · contact vendor', NULL, false, 'needs_review', NULL, false, true, true, now()),
  ('elroys-pet-2', 11, 'El Roy''s Food Truck #2', 'Mexican', 'Mexican', '🌮', 'Petaluma', 'food_truck', NULL, 'Fixed truck / venue', false, false, 'Find local food and check the current menu, location and availability directly with the vendor.', NULL, 'https://elroys.com/locations/', NULL, NULL, '$$', '#ff6b5f', ARRAY['Mexican', 'Hot Dogs'], 4.5, 60, false, '175 Fairgrounds Dr, Petaluma', 38.2415, -122.6407, 'venue_published', 'venue_address', 'Schedule not verified · contact vendor', NULL, false, 'needs_review', NULL, false, true, true, now()),
  ('holy-chile', 12, 'Holy Chile Mole', 'Mexican', 'Mexican', '🌶️', 'Petaluma', 'food_truck', NULL, 'Mobile schedule', false, false, 'Find local food and check the current menu, location and availability directly with the vendor.', NULL, 'https://holychilemole.com/', NULL, NULL, '$$', '#f6bd4b', ARRAY['Mexican'], NULL, NULL, false, 'Petaluma mobile schedule', 38.2324, -122.6367, 'curated_illustrative', 'illustrative_pin', 'Schedule not verified · contact vendor', NULL, false, 'needs_review', NULL, false, true, true, now()),
  ('block', 13, 'The Block Petaluma', 'Global', 'Global', '🚚', 'Petaluma', 'venue', NULL, 'Rotating food-truck venue', false, false, 'Find local food and check the current menu, location and availability directly with the vendor.', NULL, NULL, NULL, NULL, '$$', '#80cbb2', ARRAY['Global'], 4.0, 57, true, '20 Grey St, Petaluma', 38.2359, -122.6412, 'venue_published', 'illustrative_pin', 'Schedule not verified · contact vendor', NULL, false, 'needs_review', NULL, false, true, true, now()),
  ('faron', 14, 'Faron''s New Orleans BBQ', 'Global', 'Global', '🍖', 'Sonoma', 'food_truck', NULL, 'Mobile / catering', false, false, 'Find local food and check the current menu, location and availability directly with the vendor.', NULL, NULL, NULL, NULL, '$$', '#f3a7c5', ARRAY['Global'], NULL, NULL, false, 'Sonoma County mobile schedule', 38.2919, -122.4580, 'curated_illustrative', 'illustrative_pin', 'Schedule not verified · contact vendor', NULL, false, 'needs_review', NULL, false, true, true, now()),
  ('gameday', 15, 'Gameday Grill', 'Burgers', 'Burgers', '🍔', 'Santa Rosa', 'food_truck', NULL, 'Mobile / catering', false, false, 'Find local food and check the current menu, location and availability directly with the vendor.', NULL, NULL, NULL, NULL, '$$', '#8db7e8', ARRAY['Burgers', 'Hot Dogs'], NULL, NULL, false, 'Sonoma County service area · location varies', 38.4724, -122.6709, 'curated_illustrative', 'illustrative_pin', 'Schedule not verified · contact vendor', NULL, false, 'needs_review', NULL, false, true, true, now()),
  ('munchiez', 16, 'Bay Area Munchiez', 'Burgers', 'Burgers', '🍔', 'Santa Rosa', 'food_truck', NULL, 'Mobile / catering', false, false, 'Find local food and check the current menu, location and availability directly with the vendor.', NULL, NULL, NULL, NULL, '$$', '#ff6b5f', ARRAY['Burgers', 'Sweets'], NULL, NULL, false, 'Sonoma County service area · location varies', 38.4268, -122.7162, 'curated_illustrative', 'illustrative_pin', 'Schedule not verified · contact vendor', NULL, false, 'needs_review', NULL, false, true, true, now()),
  ('char', 17, 'The Char Market', 'Burgers', 'Burgers', '🔥', 'Santa Rosa', 'food_truck', NULL, 'Mobile / catering', false, false, 'Find local food and check the current menu, location and availability directly with the vendor.', NULL, NULL, NULL, NULL, '$$', '#f6bd4b', ARRAY['Burgers'], NULL, NULL, false, 'Sonoma County service area · location varies', 38.4552, -122.6920, 'curated_illustrative', 'illustrative_pin', 'Schedule not verified · contact vendor', NULL, false, 'needs_review', NULL, false, true, true, now()),
  ('onion', 18, 'The Onion Bomb', 'Burgers', 'Burgers', '🧅', 'Santa Rosa', 'food_truck', NULL, 'Mobile / catering', false, false, 'Find local food and check the current menu, location and availability directly with the vendor.', NULL, NULL, NULL, NULL, '$$', '#80cbb2', ARRAY['Burgers'], NULL, NULL, false, 'Sonoma County service area · location varies', 38.4640, -122.7380, 'curated_illustrative', 'illustrative_pin', 'Schedule not verified · contact vendor', NULL, false, 'needs_review', NULL, false, true, true, now()),
  ('adams', 19, 'Adam''s Grub Truck', 'Burgers', 'Burgers', '🍔', 'Santa Rosa', 'food_truck', NULL, 'Mobile / catering', false, false, 'Find local food and check the current menu, location and availability directly with the vendor.', NULL, NULL, NULL, NULL, '$$', '#f3a7c5', ARRAY['Burgers'], NULL, NULL, false, 'Sonoma County service area · location varies', 38.4490, -122.7040, 'curated_illustrative', 'illustrative_pin', 'Schedule not verified · contact vendor', NULL, false, 'needs_review', NULL, false, true, true, now()),
  ('cichy', 20, 'Cichy Co.', 'Burgers', 'Burgers', '🥓', 'Santa Rosa', 'food_truck', NULL, 'Mobile / catering', false, false, 'Find local food and check the current menu, location and availability directly with the vendor.', NULL, NULL, NULL, NULL, '$$', '#8db7e8', ARRAY['Burgers', 'Hot Dogs', 'Sweets'], NULL, NULL, false, 'Sonoma County service area · location varies', 38.4320, -122.7080, 'curated_illustrative', 'illustrative_pin', 'Schedule not verified · contact vendor', NULL, false, 'needs_review', NULL, false, true, true, now()),
  ('worldfare', 21, 'World Fare Food Truck', 'Burgers', 'Burgers', '🌎', 'Santa Rosa', 'food_truck', NULL, 'Mobile / catering', false, false, 'Find local food and check the current menu, location and availability directly with the vendor.', NULL, NULL, NULL, NULL, '$$', '#ff6b5f', ARRAY['Burgers'], NULL, NULL, false, 'Sonoma County service area · location varies', 38.4465, -122.7204, 'curated_illustrative', 'illustrative_pin', 'Schedule not verified · contact vendor', NULL, false, 'needs_review', NULL, false, true, true, now()),
  ('dogaday', 22, 'A Dog A Day', 'Hot Dogs', 'Hot Dogs', '🌭', 'Santa Rosa', 'food_truck', NULL, 'Mobile / catering', false, false, 'Find local food and check the current menu, location and availability directly with the vendor.', NULL, NULL, NULL, NULL, '$$', '#f6bd4b', ARRAY['Hot Dogs'], 4.7, 500, false, 'Santa Rosa · mobile/pickup', 38.4435, -122.7349, 'curated_illustrative', 'illustrative_pin', '8:30 AM – 2:35 PM', '{"days":["Sun","Mon","Tue","Wed","Thu","Fri","Sat"],"opens":"08:30","closes":"14:35"}'::jsonb, false, 'needs_review', NULL, false, true, true, now()),
  ('streetdogz', 23, 'Streetdogz & Streetburgerz', 'Hot Dogs', 'Hot Dogs', '🌭', 'Santa Rosa', 'food_truck', NULL, 'Mobile / catering', false, false, 'Find local food and check the current menu, location and availability directly with the vendor.', NULL, NULL, NULL, NULL, '$$', '#80cbb2', ARRAY['Hot Dogs', 'Burgers'], NULL, NULL, false, 'Sonoma County service area · location varies', 38.4381, -122.7432, 'curated_illustrative', 'illustrative_pin', 'Schedule not verified · contact vendor', NULL, false, 'needs_review', NULL, false, true, true, now()),
  ('sausage', 24, 'The Sausage Truck', 'Hot Dogs', 'Hot Dogs', '🌭', 'Santa Rosa', 'food_truck', NULL, 'Mobile / catering', false, false, 'Find local food and check the current menu, location and availability directly with the vendor.', NULL, NULL, NULL, NULL, '$$', '#f3a7c5', ARRAY['Hot Dogs'], NULL, NULL, false, 'Sonoma County service area · location varies', 38.4418, -122.7375, 'curated_illustrative', 'illustrative_pin', 'Schedule not verified · contact vendor', NULL, false, 'needs_review', NULL, false, true, true, now()),
  ('hefty', 25, 'Hefty Gyros', 'Global', 'Global', '🥙', 'Santa Rosa', 'food_truck', NULL, 'Mobile / catering', false, false, 'Find local food and check the current menu, location and availability directly with the vendor.', NULL, NULL, NULL, NULL, '$$', '#8db7e8', ARRAY['Global'], NULL, NULL, false, 'Sonoma County service area · location varies', 38.4754, -122.6739, 'curated_illustrative', 'illustrative_pin', 'Schedule not verified · contact vendor', NULL, false, 'needs_review', NULL, false, true, true, now()),
  ('momo', 26, 'MoMo Man', 'Global', 'Global', '🥟', 'Santa Rosa', 'food_truck', NULL, 'Mobile / catering', false, false, 'Find local food and check the current menu, location and availability directly with the vendor.', NULL, NULL, NULL, NULL, '$$', '#ff6b5f', ARRAY['Global'], NULL, NULL, false, 'Sonoma County service area · location varies', 38.4298, -122.7192, 'curated_illustrative', 'illustrative_pin', 'Schedule not verified · contact vendor', NULL, false, 'needs_review', NULL, false, true, true, now()),
  ('xies', 27, 'Xies707 Sushi Rolls', 'Global', 'Global', '🍣', 'Santa Rosa', 'food_truck', NULL, 'Mobile / catering', false, false, 'Find local food and check the current menu, location and availability directly with the vendor.', NULL, 'https://toast.app/r/xies-sushi-rolls-llc-xies707/order', NULL, NULL, '$$', '#f6bd4b', ARRAY['Global'], NULL, NULL, false, 'Sonoma County service area · location varies', 38.4582, -122.6950, 'curated_illustrative', 'illustrative_pin', 'Schedule not verified · contact vendor', NULL, false, 'needs_review', NULL, false, true, true, now()),
  ('api-hot', 28, 'API Hot Chicken', 'Global', 'Global', '🍗', 'Santa Rosa', 'food_truck', NULL, 'Mobile / catering', false, false, 'Find local food and check the current menu, location and availability directly with the vendor.', NULL, NULL, NULL, NULL, '$$', '#80cbb2', ARRAY['Global'], NULL, NULL, false, 'Sonoma County service area · location varies', 38.4670, -122.7410, 'curated_illustrative', 'illustrative_pin', 'Schedule not verified · contact vendor', NULL, false, 'needs_review', NULL, false, true, true, now()),
  ('dinos', 29, 'Dino''s Greek Food', 'Global', 'Global', '🥙', 'Santa Rosa', 'food_truck', NULL, 'Mobile / catering', false, false, 'Find local food and check the current menu, location and availability directly with the vendor.', NULL, 'https://www.dinosgreekfoodtruck.com/', NULL, NULL, '$$', '#f3a7c5', ARRAY['Global'], NULL, NULL, false, 'Sonoma County service area · location varies', 38.4520, -122.7070, 'curated_illustrative', 'illustrative_pin', 'Schedule not verified · contact vendor', NULL, false, 'needs_review', NULL, false, true, true, now()),
  ('dang', 30, 'Dang That''s Good', 'Global', 'Global', '😋', 'Santa Rosa', 'food_truck', NULL, 'Mobile / catering', false, false, 'Find local food and check the current menu, location and availability directly with the vendor.', NULL, NULL, NULL, NULL, '$$', '#8db7e8', ARRAY['Global'], NULL, NULL, false, 'Sonoma County service area · location varies', 38.4350, -122.7110, 'curated_illustrative', 'illustrative_pin', 'Schedule not verified · contact vendor', NULL, false, 'needs_review', NULL, false, true, true, now()),
  ('drip', 31, 'Drip Sandwiches', 'Global', 'Global', '🥪', 'Santa Rosa', 'food_truck', NULL, 'Mobile / catering', false, false, 'Find local food and check the current menu, location and availability directly with the vendor.', NULL, NULL, NULL, NULL, '$$', '#ff6b5f', ARRAY['Global'], NULL, NULL, false, 'Sonoma County service area · location varies', 38.4495, -122.7234, 'curated_illustrative', 'illustrative_pin', 'Schedule not verified · contact vendor', NULL, false, 'needs_review', NULL, false, true, true, now()),
  ('fruta', 32, 'Fru-ta Ice Cream Truck', 'Sweets', 'Sweets', '🍦', 'Santa Rosa', 'food_truck', NULL, 'Fixed truck / venue', false, false, 'Find local food and check the current menu, location and availability directly with the vendor.', NULL, 'https://toast.app/r/fru-ta-food-truck-2970-santa-rosa-ave/order', NULL, NULL, '$$', '#f6bd4b', ARRAY['Sweets'], NULL, NULL, true, '2970 Santa Rosa Ave, Santa Rosa', 38.4465, -122.7379, 'venue_published', 'illustrative_pin', 'Daily · 1:30 PM – 8:45 PM (published; confirm before visiting)', '{"days":["Sun","Mon","Tue","Wed","Thu","Fri","Sat"],"opens":"13:30","closes":"20:45"}'::jsonb, false, 'needs_review', NULL, false, true, true, now()),
  ('heritage', 33, 'Best Food Truck Ever by Heritage Eats', 'Sweets', 'Sweets', '🍨', 'Santa Rosa', 'food_truck', NULL, 'Mobile / catering', false, false, 'Find local food and check the current menu, location and availability directly with the vendor.', NULL, NULL, NULL, NULL, '$$', '#80cbb2', ARRAY['Sweets'], NULL, NULL, false, 'Sonoma County service area · location varies', 38.4411, -122.7462, 'curated_illustrative', 'illustrative_pin', 'Schedule not verified · contact vendor', NULL, false, 'needs_review', NULL, false, true, true, now()),
  ('andrew', 34, 'Mr. Andrew Food Trailer', 'Sweets', 'Sweets', '🍧', 'Santa Rosa', 'food_truck', NULL, 'Mobile / catering', false, false, 'Find local food and check the current menu, location and availability directly with the vendor.', NULL, NULL, NULL, NULL, '$$', '#f3a7c5', ARRAY['Sweets'], NULL, NULL, false, 'Sonoma County service area · location varies', 38.4448, -122.7405, 'curated_illustrative', 'illustrative_pin', 'Schedule not verified · contact vendor', NULL, false, 'needs_review', NULL, false, true, true, now()),
  ('kolobok', 35, 'Kolobok Russian Soul Food Truck', 'Global', 'Global', '🥔', 'Santa Rosa', 'food_truck', NULL, 'Mobile / catering', false, false, 'Find local food and check the current menu, location and availability directly with the vendor.', NULL, NULL, NULL, NULL, '$$', '#8db7e8', ARRAY['Global'], NULL, NULL, false, 'Sonoma County service area · location varies', 38.4784, -122.6769, 'curated_illustrative', 'illustrative_pin', 'Schedule not verified · contact vendor', NULL, false, 'needs_review', NULL, false, true, true, now()),
  ('rich', 36, 'Little Rich''s Italian Ice', 'Sweets', 'Sweets', '🍋', 'Santa Rosa', 'food_truck', NULL, 'Mobile / catering', false, false, 'Find local food and check the current menu, location and availability directly with the vendor.', NULL, NULL, NULL, NULL, '$$', '#ff6b5f', ARRAY['Sweets'], NULL, NULL, false, 'Sonoma County service area · location varies', 38.4328, -122.7222, 'curated_illustrative', 'illustrative_pin', 'Schedule not verified · contact vendor', NULL, false, 'needs_review', NULL, false, true, true, now()),
  ('momolicious', 37, 'Momolicious', 'Sweets', 'Sweets', '🧁', 'Santa Rosa', 'food_truck', NULL, 'Mobile / catering', false, false, 'Find local food and check the current menu, location and availability directly with the vendor.', NULL, NULL, NULL, NULL, '$$', '#f6bd4b', ARRAY['Sweets', 'Global'], NULL, NULL, false, 'Sonoma County service area · location varies', 38.4612, -122.6980, 'curated_illustrative', 'illustrative_pin', 'Schedule not verified · contact vendor', NULL, false, 'needs_review', NULL, false, true, true, now()),
  ('market-chavas', 38, 'Chava''s Pizza', 'Global', 'Global', '🍕', 'Petaluma', 'market_stall', NULL, 'Farmers-market stall', false, false, 'Find local food and check the current menu, location and availability directly with the vendor.', NULL, NULL, NULL, NULL, '$$', '#80cbb2', ARRAY['Markets', 'Global'], NULL, NULL, false, 'East-Side Farmers’ Market · 320 N McDowell Blvd', 38.2585, -122.6262, 'venue_published', 'illustrative_pin', 'Tuesdays · 9:30 AM – 1:30 PM', '{"days":["Tue"],"opens":"09:30","closes":"13:30"}'::jsonb, false, 'needs_review', NULL, false, true, true, now()),
  ('market-myriad', 39, 'Myriad Coffee', 'Sweets', 'Sweets', '☕', 'Petaluma', 'market_stall', NULL, 'Farmers-market stall', false, false, 'Find local food and check the current menu, location and availability directly with the vendor.', NULL, NULL, NULL, NULL, '$$', '#f3a7c5', ARRAY['Markets', 'Sweets'], NULL, NULL, false, 'East-Side Farmers’ Market · 320 N McDowell Blvd', 38.2585, -122.6262, 'venue_published', 'illustrative_pin', 'Tuesdays · 9:30 AM – 1:30 PM', '{"days":["Tue"],"opens":"09:30","closes":"13:30"}'::jsonb, false, 'needs_review', NULL, false, true, true, now()),
  ('market-chicken', 40, 'What A Chicken!?', 'Global', 'Global', '🍗', 'Petaluma', 'market_stall', NULL, 'Farmers-market stall', false, false, 'Find local food and check the current menu, location and availability directly with the vendor.', NULL, NULL, NULL, NULL, '$$', '#8db7e8', ARRAY['Markets', 'Global'], NULL, NULL, false, 'East-Side Farmers’ Market · 320 N McDowell Blvd', 38.2585, -122.6262, 'venue_published', 'illustrative_pin', 'Tuesdays · 9:30 AM – 1:30 PM', '{"days":["Tue"],"opens":"09:30","closes":"13:30"}'::jsonb, false, 'needs_review', NULL, false, true, true, now()),
  ('market-donpepe', 41, 'Tacos Don Pepe', 'Mexican', 'Mexican', '🌮', 'Petaluma', 'market_stall', NULL, 'Farmers-market stall', false, false, 'Find local food and check the current menu, location and availability directly with the vendor.', NULL, NULL, NULL, NULL, '$$', '#ff6b5f', ARRAY['Markets', 'Mexican'], NULL, NULL, false, 'East-Side Farmers’ Market · 320 N McDowell Blvd', 38.2585, -122.6262, 'venue_published', 'illustrative_pin', 'Tuesdays · 9:30 AM – 1:30 PM', '{"days":["Tue"],"opens":"09:30","closes":"13:30"}'::jsonb, false, 'needs_review', NULL, false, true, true, now()),
  ('market-sushi', 42, 'Sushi Shoubu', 'Global', 'Global', '🍣', 'Petaluma', 'market_stall', NULL, 'Farmers-market stall', false, false, 'Find local food and check the current menu, location and availability directly with the vendor.', NULL, NULL, NULL, NULL, '$$', '#f6bd4b', ARRAY['Markets', 'Global'], NULL, NULL, false, 'East-Side Farmers’ Market · 320 N McDowell Blvd', 38.2585, -122.6262, 'venue_published', 'illustrative_pin', 'Tuesdays · 9:30 AM – 1:30 PM', '{"days":["Tue"],"opens":"09:30","closes":"13:30"}'::jsonb, false, 'needs_review', NULL, false, true, true, now()),
  ('market-boba', 43, 'Bai Chai Boba Tea', 'Sweets', 'Sweets', '🧋', 'Petaluma', 'market_stall', NULL, 'Farmers-market stall', false, false, 'Find local food and check the current menu, location and availability directly with the vendor.', NULL, NULL, NULL, NULL, '$$', '#80cbb2', ARRAY['Markets', 'Sweets'], NULL, NULL, false, 'East-Side Farmers’ Market · 320 N McDowell Blvd', 38.2585, -122.6262, 'venue_published', 'illustrative_pin', 'Tuesdays · 9:30 AM – 1:30 PM', '{"days":["Tue"],"opens":"09:30","closes":"13:30"}'::jsonb, false, 'needs_review', NULL, false, true, true, now()),
  ('market-urban', 44, 'Urban Deli', 'Global', 'Global', '🥪', 'Petaluma', 'market_stall', NULL, 'Farmers-market stall', false, false, 'Find local food and check the current menu, location and availability directly with the vendor.', NULL, NULL, NULL, NULL, '$$', '#f3a7c5', ARRAY['Markets', 'Global'], NULL, NULL, false, 'East-Side Farmers’ Market · 320 N McDowell Blvd', 38.2585, -122.6262, 'venue_published', 'illustrative_pin', 'Tuesdays · 9:30 AM – 1:30 PM', '{"days":["Tue"],"opens":"09:30","closes":"13:30"}'::jsonb, false, 'needs_review', NULL, false, true, true, now()),
  ('market-roti', 45, 'Roti', 'Global', 'Global', '🫓', 'Petaluma', 'market_stall', NULL, 'Farmers-market stall', false, false, 'Find local food and check the current menu, location and availability directly with the vendor.', NULL, NULL, NULL, NULL, '$$', '#8db7e8', ARRAY['Markets', 'Global'], NULL, NULL, false, 'East-Side Farmers’ Market · 320 N McDowell Blvd', 38.2585, -122.6262, 'venue_published', 'illustrative_pin', 'Tuesdays · 9:30 AM – 1:30 PM', '{"days":["Tue"],"opens":"09:30","closes":"13:30"}'::jsonb, false, 'needs_review', NULL, false, true, true, now()),
  ('market-mifiesta', 46, 'Mi Fiesta Catering Co.', 'Mexican', 'Mexican', '🫔', 'Petaluma', 'market_stall', NULL, 'Farmers-market stall', false, false, 'Find local food and check the current menu, location and availability directly with the vendor.', NULL, NULL, NULL, NULL, '$$', '#ff6b5f', ARRAY['Markets', 'Mexican'], NULL, NULL, false, 'East-Side Farmers’ Market · 320 N McDowell Blvd', 38.2585, -122.6262, 'venue_published', 'illustrative_pin', 'Tuesdays · 9:30 AM – 1:30 PM', '{"days":["Tue"],"opens":"09:30","closes":"13:30"}'::jsonb, false, 'needs_review', NULL, false, true, true, now()),
  ('market-fusion', 47, 'Fusion 2 Go', 'Global', 'Global', '🍜', 'Petaluma', 'market_stall', NULL, 'Farmers-market stall', false, false, 'Find local food and check the current menu, location and availability directly with the vendor.', NULL, NULL, NULL, NULL, '$$', '#f6bd4b', ARRAY['Markets', 'Global'], NULL, NULL, false, 'East-Side Farmers’ Market · 320 N McDowell Blvd', 38.2585, -122.6262, 'venue_published', 'illustrative_pin', 'Tuesdays · 9:30 AM – 1:30 PM', '{"days":["Tue"],"opens":"09:30","closes":"13:30"}'::jsonb, false, 'needs_review', NULL, false, true, true, now()),
  -- 48..59 Reconciled v77 neighborhood directory places (extra = true, event_bookable = false)
  ('farm-oakhill', 48, 'Oak Hill Farm — Red Barn Store', NULL, 'Farm produce', '🥕', 'Glen Ellen', 'farm_stand', 'Farm Stands', 'Farm Stands', false, true, 'Seasonal produce, flowers, and a pantry of goods from regional growers and makers.', NULL, 'https://www.oakhillfarm.net/the-red-barn-store', NULL, 'November 14, 2026', '', '#d5dfaa', ARRAY['Farm Stands'], NULL, NULL, false, '15101 Sonoma Highway, Glen Ellen', NULL, NULL, 'venue_published', 'none', 'Spring–December · Wed 3–7 pm · Sat 9 am–3 pm; confirm before visiting', NULL, false, 'needs_review', NULL, false, false, true, now()),
  ('farm-barn', 49, 'Farm Barn', NULL, 'Eggs & farm goods', '🥚', 'Petaluma', 'farm_stand', 'Farm Stands', 'Farm Stands', false, true, 'An honor-system farm stand with eggs, honey, preserves, and goods from local producers.', NULL, 'https://www.farmtrails.org/business/farm-barn/', NULL, 'November 14, 2026', '', '#d5dfaa', ARRAY['Farm Stands'], NULL, NULL, false, '2910 Pepper Road, Petaluma', NULL, NULL, 'venue_published', 'none', 'Published hours: daily, 9 am to early evening; confirm before visiting', NULL, false, 'needs_review', NULL, false, false, true, now()),
  ('market-sr-community', 50, 'Santa Rosa Community Farmers Market', NULL, 'Farmers market', '🧺', 'Santa Rosa', 'venue', 'Markets', 'Markets', false, true, 'A regular stop for local growers and food vendors, now at the Veterans Memorial Building.', NULL, 'https://www.ourfarmersmarkets.org/locations-santa-rosa/', NULL, 'November 14, 2026', '', '#f3d28c', ARRAY['Markets'], NULL, NULL, false, '1351 Maple Ave, Santa Rosa', NULL, NULL, 'venue_published', 'none', 'Wed 9 am–1 pm · Sat 8:30 am–1 pm · year-round; check organizer updates', NULL, false, 'needs_review', NULL, false, false, true, now()),
  ('market-sr-original', 51, 'Santa Rosa Original Certified Farmers Market', NULL, 'Farmers market', '🍎', 'Santa Rosa', 'venue', 'Markets', 'Markets', false, true, 'Farmers and food producers gather at the Luther Burbank Center for the Arts.', NULL, 'https://www.ourfarmersmarkets.org/locations-santa-rosa/', NULL, 'November 14, 2026', '', '#f3d28c', ARRAY['Markets'], NULL, NULL, false, '50 Mark West Springs Road, Santa Rosa', NULL, NULL, 'venue_published', 'none', 'Sat 8:30 am–1 pm year-round; seasonal Wednesday market · check organizer updates', NULL, false, 'needs_review', NULL, false, false, true, now()),
  ('truck-galvans', 52, 'Galvan’s Eatery', NULL, 'Mexican-American', '🌮', 'Sonoma County', 'popup', 'Food Trucks', 'Food Trucks', true, true, 'Mexican-American food truck with tacos and burritos; listed on Old Caz’s rotating food calendar.', NULL, 'https://seadragon-flamingo-rwlk.squarespace.com/backyard-food-and-events', NULL, 'November 14, 2026', '', '#eeb6a1', ARRAY['Food Trucks'], NULL, NULL, false, 'Rotating Sonoma County stops · see host calendar', NULL, NULL, 'unknown', 'none', 'Rotating pop-ups · confirm the next date and location with the host', NULL, false, 'needs_review', NULL, false, false, true, now()),
  ('truck-flippin', 53, 'Los Flippin Tacos', NULL, 'Mexican', '🌮', 'Sonoma County', 'popup', 'Food Trucks', 'Food Trucks', true, true, 'Mexican street food served at local pop-up stops, including the Old Caz backyard.', NULL, 'https://seadragon-flamingo-rwlk.squarespace.com/backyard-food-and-events', NULL, 'November 14, 2026', '', '#eeb6a1', ARRAY['Food Trucks'], NULL, NULL, false, 'Rotating stops · Old Caz host calendar', NULL, NULL, 'unknown', 'none', 'Rotating pop-ups · confirm the next date and location with the host', NULL, false, 'needs_review', NULL, false, false, true, now()),
  ('truck-casanostra', 54, 'Casa Nostra NorCal', NULL, 'Pizza & pasta', '🍕', 'Rohnert Park', 'popup', 'Food Trucks', 'Food Trucks', true, true, 'A Rohnert Park food truck serving wood-fired pizza and pasta at rotating stops.', NULL, 'https://seadragon-flamingo-rwlk.squarespace.com/backyard-food-and-events', NULL, 'November 14, 2026', '', '#eeb6a1', ARRAY['Food Trucks'], NULL, NULL, false, 'Rotating stops · Old Caz host calendar', NULL, NULL, 'unknown', 'none', 'Rotating pop-ups · confirm the next date and location with the host', NULL, false, 'needs_review', NULL, false, false, true, now()),
  ('truck-thespot', 55, 'The Spot Food Truck', NULL, 'Burgers & sandwiches', '🍔', 'Sonoma County', 'popup', 'Food Trucks', 'Food Trucks', true, true, 'Burgers, sandwiches, and loaded fries on a rotating local food-truck schedule.', NULL, 'https://seadragon-flamingo-rwlk.squarespace.com/backyard-food-and-events', NULL, 'November 14, 2026', '', '#eeb6a1', ARRAY['Food Trucks'], NULL, NULL, false, 'Rotating Sonoma County stops · see host calendar', NULL, NULL, 'unknown', 'none', 'Rotating pop-ups · confirm the next date and location with the host', NULL, false, 'needs_review', NULL, false, false, true, now()),
  ('coffee-crooks', 56, 'Crooks Coffee', NULL, 'Coffee & café', '☕', 'Santa Rosa', 'cafe', 'Coffee', 'Coffee', false, true, 'A downtown coffee bar with espresso, specialty drinks, and toast plates.', 'A crème brûlée latte shares the menu with Mexican mocha and café con miele. A coffee stop with a dessert-minded side.', 'https://shadyraveninc.com/menu', NULL, 'November 14, 2026', '', '#e4c4a0', ARRAY['Coffee'], NULL, NULL, false, '404c Mendocino Avenue, Santa Rosa', NULL, NULL, 'venue_published', 'none', 'Published hours: Mon–Fri 6 am–3 pm; Sat–Sun 7 am–3 pm. Confirm before visiting.', NULL, false, 'needs_review', NULL, false, false, true, now()),
  ('coffee-retrograde', 57, 'Retrograde Coffee Roasters', NULL, 'Coffee & café', '☕', 'Sebastopol', 'cafe', 'Coffee', 'Coffee', false, true, 'Specialty coffee and prepared food on Main Street, with indoor seating and outdoor courtyard or parklet options.', 'Coffee roasted in-house, a lineup of single origins and space-themed blends, and a Main Street café with outdoor seating.', 'https://retrograderoasters.com/pages/visit', 'https://retrograderoasters.com/', 'November 14, 2026', '', '#e4c4a0', ARRAY['Coffee'], NULL, NULL, false, '130 S Main Street #103, Sebastopol', NULL, NULL, 'venue_published', 'none', 'Mon–Fri 7 am–5 pm; Sat–Sun 7 am–4 pm. Kitchen closes at 3 pm; confirm before visiting.', NULL, false, 'needs_review', NULL, false, false, true, now()),
  ('coffee-avid-petaluma', 58, 'Avid Coffee — Downtown Petaluma', NULL, 'Coffee & café', '☕', 'Petaluma', 'cafe', 'Coffee', 'Coffee', false, true, 'A neighborhood café in historic downtown Petaluma.', 'This café was the starting point of the business in 2011. Its local story began as Acre Coffee before the Avid name arrived in 2021.', 'https://avidcoffee.com/pages/locations', 'https://avidcoffee.com/pages/learn', 'November 14, 2026', '', '#e4c4a0', ARRAY['Coffee'], NULL, NULL, false, '21 4th Street, Petaluma', NULL, NULL, 'venue_published', 'none', 'Sun–Thu 7 am–3 pm; Fri–Sat 7 am–4 pm. Confirm before visiting.', NULL, false, 'needs_review', NULL, false, false, true, now()),
  ('coffee-avid-sr', 59, 'Avid Coffee — Montgomery Village', NULL, 'Coffee & café', '☕', 'Santa Rosa', 'cafe', 'Coffee', 'Coffee', false, true, 'A spacious café at the north end of Montgomery Village.', 'A neighborhood meeting place with roots in Sonoma County and a roastery in Windsor.', 'https://avidcoffee.com/pages/locations', 'https://avidcoffee.com/pages/learn', 'November 14, 2026', '', '#e4c4a0', ARRAY['Coffee'], NULL, NULL, false, '2365 Midway Drive, Santa Rosa', NULL, NULL, 'venue_published', 'none', 'Published hours: daily 7 am–4 pm. Confirm before visiting.', NULL, false, 'needs_review', NULL, false, false, true, now())
ON CONFLICT (id) DO UPDATE SET
  sort_order = EXCLUDED.sort_order,
  canonical_name = EXCLUDED.canonical_name,
  section = EXCLUDED.section,
  cuisine = EXCLUDED.cuisine,
  emoji = EXCLUDED.emoji,
  city = EXCLUDED.city,
  listing_kind = EXCLUDED.listing_kind,
  kind_label = EXCLUDED.kind_label,
  listing_type = EXCLUDED.listing_type,
  popup = EXCLUDED.popup,
  extra = EXCLUDED.extra,
  blurb = EXCLUDED.blurb,
  special_note = EXCLUDED.special_note,
  source_url = EXCLUDED.source_url,
  story_source_url = EXCLUDED.story_source_url,
  checked_label = EXCLUDED.checked_label,
  price = EXCLUDED.price,
  color = EXCLUDED.color,
  tags = EXCLUDED.tags,
  rating = EXCLUDED.rating,
  reviews = EXCLUDED.reviews,
  featured = EXCLUDED.featured,
  curated_location = EXCLUDED.curated_location,
  curated_lat = EXCLUDED.curated_lat,
  curated_lng = EXCLUDED.curated_lng,
  curated_location_source = EXCLUDED.curated_location_source,
  curated_location_accuracy = EXCLUDED.curated_location_accuracy,
  curated_hours = EXCLUDED.curated_hours,
  recurring_schedule = EXCLUDED.recurring_schedule,
  event_bookable = EXCLUDED.event_bookable,
  updated_at = now();
