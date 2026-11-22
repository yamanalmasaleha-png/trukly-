-- Migration 028: Private Photo Storage Reconciliation & Maintenance Policies
--
-- Additive, non-destructive migration supporting safe background/operator reconciliation of:
--   1. Soft-deleted `customer_photos` rows (`deleted_at IS NOT NULL AND files_purged_at IS NULL`)
--      whose initial filesystem `unlink` encountered a transient error or process interruption.
--   2. Orphaned derivative files (`<shard>/pht_*`) or interrupted temp files (`.tmp-*`) older than
--      the upload grace window, verified against active `customer_photos` rows without bypassing
--      per-user `FORCE ROW LEVEL SECURITY` on ordinary customer requests.
--
-- Rollback safety: Strictly additive index + transaction-local `app.photo_maintenance = 'true'`
-- policies. Earlier releases (`027`) never set `app.photo_maintenance` and continue operating
-- identically without destructive schema reversal.

CREATE INDEX IF NOT EXISTS idx_customer_photos_pending_file_purge
  ON customer_photos (deleted_at ASC, id ASC)
  WHERE deleted_at IS NOT NULL AND files_purged_at IS NULL;

DROP POLICY IF EXISTS customer_photos_maintenance_select ON customer_photos;
CREATE POLICY customer_photos_maintenance_select ON customer_photos
  FOR SELECT
  USING (
    current_setting('app.photo_maintenance', true) = 'true'
  );

DROP POLICY IF EXISTS customer_photos_maintenance_mark_purged ON customer_photos;
CREATE POLICY customer_photos_maintenance_mark_purged ON customer_photos
  FOR UPDATE
  USING (
    current_setting('app.photo_maintenance', true) = 'true'
    AND deleted_at IS NOT NULL
  )
  WITH CHECK (
    current_setting('app.photo_maintenance', true) = 'true'
    AND deleted_at IS NOT NULL
  );
