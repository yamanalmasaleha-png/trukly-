-- A moderated, explicitly unverified food-only community post type.
ALTER TABLE community_reviews DROP CONSTRAINT IF EXISTS community_reviews_kind_check;
ALTER TABLE community_reviews ADD CONSTRAINT community_reviews_kind_check CHECK (kind IN ('review','tip','question','whisper'));