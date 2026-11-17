-- P0-C: Community privacy, moderation immutability guards, forced RLS, and approved-only public view.

ALTER TABLE community_reviews
  ADD COLUMN IF NOT EXISTS moderated_by TEXT;

-- Normalize any pre-existing historical rows so the moderation consistency check validates cleanly.
UPDATE community_reviews
SET moderated_at = COALESCE(moderated_at, created_at),
    moderated_by = COALESCE(NULLIF(btrim(moderated_by), ''), 'legacy_admin')
WHERE status IN ('approved', 'rejected');

UPDATE community_reviews
SET moderated_at = NULL,
    moderated_by = NULL
WHERE status = 'pending';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'community_reviews_moderation_consistency_chk') THEN
    ALTER TABLE community_reviews ADD CONSTRAINT community_reviews_moderation_consistency_chk
      CHECK (
        (status = 'pending' AND moderated_at IS NULL AND moderated_by IS NULL) OR
        (status IN ('approved', 'rejected') AND moderated_at IS NOT NULL AND moderated_by IS NOT NULL AND btrim(moderated_by) <> '')
      );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION enforce_community_reviews_guard() RETURNS trigger AS $$
DECLARE
  v_session_user TEXT := NULLIF(btrim(COALESCE(current_setting('app.user_id', true), '')), '');
  v_can_moderate BOOLEAN := COALESCE(current_setting('app.can_moderate', true), '') = 'true';
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
    IF OLD.author_id IS DISTINCT FROM NEW.author_id
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

    IF NOT v_can_moderate THEN
      RAISE EXCEPTION 'Moderator authorization is required to update moderation fields';
    END IF;

    IF OLD.status <> 'pending' THEN
      RAISE EXCEPTION 'Only pending submissions can be moderated';
    END IF;
    IF NEW.status NOT IN ('approved', 'rejected') THEN
      RAISE EXCEPTION 'Moderation decision must be approved or rejected';
    END IF;
    IF NEW.moderated_by IS NULL OR btrim(NEW.moderated_by) = '' OR NEW.moderated_at IS NULL THEN
      RAISE EXCEPTION 'moderated_by and moderated_at are required';
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_community_reviews_guard ON community_reviews;
CREATE TRIGGER trg_enforce_community_reviews_guard
  BEFORE INSERT OR UPDATE ON community_reviews
  FOR EACH ROW EXECUTE FUNCTION enforce_community_reviews_guard();

-- Enforce Row-Level Security even for the table owner connection (FORCE ROW LEVEL SECURITY)
-- so direct table queries without explicit session GUC context can ONLY ever see approved rows.
ALTER TABLE community_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_reviews FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS community_select_approved ON community_reviews;
CREATE POLICY community_select_approved ON community_reviews
  FOR SELECT
  USING (status = 'approved');

DROP POLICY IF EXISTS community_select_own ON community_reviews;
CREATE POLICY community_select_own ON community_reviews
  FOR SELECT
  USING (author_id = NULLIF(btrim(COALESCE(current_setting('app.user_id', true), '')), ''));

DROP POLICY IF EXISTS community_insert_own ON community_reviews;
CREATE POLICY community_insert_own ON community_reviews
  FOR INSERT
  WITH CHECK (
    status = 'pending'
    AND moderated_at IS NULL
    AND moderated_by IS NULL
    AND author_id = NULLIF(btrim(COALESCE(current_setting('app.user_id', true), '')), '')
  );

DROP POLICY IF EXISTS community_moderator_all ON community_reviews;
CREATE POLICY community_moderator_all ON community_reviews
  FOR ALL
  USING (COALESCE(current_setting('app.can_moderate', true), '') = 'true')
  WITH CHECK (COALESCE(current_setting('app.can_moderate', true), '') = 'true');

-- Public approved-only projection view omitting author_id, status, moderated_at, and moderated_by.
CREATE OR REPLACE VIEW community_public_posts AS
SELECT
  id,
  nickname,
  kind,
  place_id,
  place_name,
  town,
  title,
  body,
  rating,
  created_at
FROM community_reviews
WHERE status = 'approved';
