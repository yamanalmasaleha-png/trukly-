-- P0-B: Requester identity, idempotency keys, package/guest invariants, and booking status transition guards.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS requester_user_id TEXT,
  ADD COLUMN IF NOT EXISTS requester_email TEXT,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS request_hash TEXT,
  ADD COLUMN IF NOT EXISTS decided_by TEXT,
  ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Preserve historical email contact text in requester_email while keeping requester_user_id NULL on unverified legacy rows.
UPDATE bookings
SET requester_email = requester
WHERE requester_email IS NULL
  AND requester IS NOT NULL
  AND btrim(requester) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS bookings_requester_idempotency_uidx
  ON bookings (requester_user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS bookings_requester_user_idx
  ON bookings (requester_user_id, event_date DESC, created_at DESC)
  WHERE requester_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS bookings_vendor_status_date_idx
  ON bookings (truck_id, status, event_date ASC);

-- Add NOT VALID constraints so pre-existing legacy rows are quarantined safely while all new/updated rows are strictly checked.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_status_valid_chk') THEN
    ALTER TABLE bookings ADD CONSTRAINT bookings_status_valid_chk
      CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_package_terms_chk') THEN
    ALTER TABLE bookings ADD CONSTRAINT bookings_package_terms_chk
      CHECK (
        (package_id = 'dropin' AND package_price = 750 AND guest_count BETWEEN 10 AND 50) OR
        (package_id = 'party' AND package_price = 1500 AND guest_count BETWEEN 10 AND 100) OR
        (package_id = 'festival' AND package_price = 2900 AND guest_count BETWEEN 10 AND 250)
      ) NOT VALID;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION enforce_bookings_integrity() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.requester_user_id IS NULL OR btrim(NEW.requester_user_id) = '' THEN
      RAISE EXCEPTION 'Authenticated requester_user_id is required';
    END IF;
    IF NEW.truck_id IS NULL OR btrim(NEW.truck_id) = '' THEN
      RAISE EXCEPTION 'Canonical truck_id is required';
    END IF;
    IF NEW.status <> 'pending' OR NEW.decided_by IS NOT NULL OR NEW.decided_at IS NOT NULL THEN
      RAISE EXCEPTION 'New bookings must begin in pending status without decision metadata';
    END IF;
    IF char_length(btrim(NEW.event_type)) < 2 OR char_length(NEW.event_type) > 80 THEN
      RAISE EXCEPTION 'event_type must be between 2 and 80 characters';
    END IF;
    IF char_length(btrim(NEW.location)) < 3 OR char_length(NEW.location) > 240 THEN
      RAISE EXCEPTION 'location must be between 3 and 240 characters';
    END IF;
    IF NEW.note IS NOT NULL AND char_length(NEW.note) > 1000 THEN
      RAISE EXCEPTION 'note cannot exceed 1000 characters';
    END IF;
    IF NEW.idempotency_key IS NOT NULL AND (char_length(btrim(NEW.idempotency_key)) < 8 OR char_length(NEW.idempotency_key) > 128) THEN
      RAISE EXCEPTION 'idempotency_key must be between 8 and 128 characters';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.requester_user_id IS DISTINCT FROM NEW.requester_user_id THEN
      RAISE EXCEPTION 'requester_user_id is immutable';
    END IF;
    IF OLD.truck_id IS DISTINCT FROM NEW.truck_id AND OLD.truck_id IS NOT NULL THEN
      RAISE EXCEPTION 'truck_id is immutable';
    END IF;
    IF OLD.idempotency_key IS DISTINCT FROM NEW.idempotency_key THEN
      RAISE EXCEPTION 'idempotency_key is immutable';
    END IF;
    IF OLD.request_hash IS DISTINCT FROM NEW.request_hash THEN
      RAISE EXCEPTION 'request_hash is immutable';
    END IF;

    IF OLD.status IS DISTINCT FROM NEW.status THEN
      IF OLD.status <> 'pending' THEN
        RAISE EXCEPTION 'Booking status cannot transition from terminal state % to %', OLD.status, NEW.status;
      END IF;
      IF NEW.status NOT IN ('accepted', 'declined', 'cancelled') THEN
        RAISE EXCEPTION 'Invalid target booking status %', NEW.status;
      END IF;
      IF NEW.status IN ('accepted', 'declined') AND (NEW.decided_by IS NULL OR btrim(NEW.decided_by) = '' OR NEW.decided_at IS NULL) THEN
        RAISE EXCEPTION 'decided_by and decided_at are required when accepting or declining a booking';
      END IF;
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_bookings_integrity ON bookings;
CREATE TRIGGER trg_enforce_bookings_integrity
  BEFORE INSERT OR UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION enforce_bookings_integrity();
