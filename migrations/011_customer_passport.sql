CREATE TABLE IF NOT EXISTS customer_visits (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id text NOT NULL,
 place_id text NOT NULL,
 note text NOT NULL DEFAULT '',
 visited_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id, place_id)
);
CREATE INDEX IF NOT EXISTS customer_visits_user_idx ON customer_visits(user_id,visited_at DESC);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS user_id text;
CREATE INDEX IF NOT EXISTS bookings_customer_idx ON bookings(user_id,created_at DESC);