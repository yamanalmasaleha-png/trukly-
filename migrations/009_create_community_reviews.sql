-- Truckly community: submissions are private until an admin approves them.
CREATE TABLE IF NOT EXISTS community_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id TEXT NOT NULL,
  nickname TEXT NOT NULL DEFAULT 'Local food fan',
  kind TEXT NOT NULL CHECK (kind IN ('review','tip','question')),
  place_id TEXT NOT NULL,
  place_name TEXT NOT NULL,
  town TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  rating INTEGER NULL CHECK (rating BETWEEN 1 AND 5),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  moderated_at TIMESTAMPTZ,
  CHECK (char_length(body) BETWEEN 20 AND 700),
  CHECK ((kind='review' AND rating IS NOT NULL) OR (kind<>'review' AND rating IS NULL))
);
CREATE INDEX IF NOT EXISTS community_reviews_published_idx ON community_reviews(status,created_at DESC);
CREATE INDEX IF NOT EXISTS community_reviews_author_idx ON community_reviews(author_id,created_at DESC);