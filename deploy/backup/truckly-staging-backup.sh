#!/usr/bin/env bash
# Truckly Isolated Staging Consistent Database Backup + AES-256 Encryption + Off-Server Sync
# Backs up ONLY `truckly_staging` (never touches unrelated databases without explicit authorization).

set -euo pipefail
umask 077

BACKUP_DIR="${TRUCKLY_BACKUP_DIR:-/var/backups/truckly-staging}"
RETENTION_DAYS="${TRUCKLY_BACKUP_RETENTION_DAYS:-7}"
PASSPHRASE_FILE="${TRUCKLY_BACKUP_PASSPHRASE_FILE:-/etc/truckly-staging/backup.passphrase}"
DB_NAME="${TRUCKLY_BACKUP_DB_NAME:-truckly_staging}"
OFFSITE_CMD="${TRUCKLY_BACKUP_OFFSITE_CMD:-}"

if [[ ! -s "${PASSPHRASE_FILE}" ]]; then
  echo '{"level":"fatal","event":"backup_missing_passphrase_file"}' >&2
  exit 1
fi

install -d -m 0700 "${BACKUP_DIR}"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
RAW_DUMP="${BACKUP_DIR}/${DB_NAME}-${STAMP}.dump"
ENC_ARCHIVE="${RAW_DUMP}.gpg"
SHA_FILE="${ENC_ARCHIVE}.sha256"

cleanup_raw() {
  rm -f "${RAW_DUMP}"
}
trap cleanup_raw EXIT

# 1. Consistent custom-format PostgreSQL dump via local peer postgres socket
sudo -u postgres pg_dump \
  --format=custom \
  --no-owner \
  --no-acl \
  --dbname="${DB_NAME}" \
  --file="${RAW_DUMP}"

# 2. Sanity-check archive TOC readability before encryption (note: real restore verification is separate)
pg_restore --list "${RAW_DUMP}" >/dev/null

# 3. Encrypt dump at rest & in transit using GPG AES-256 symmetric cipher
gpg --batch --yes \
  --symmetric \
  --cipher-algo AES256 \
  --pinentry-mode loopback \
  --passphrase-file "${PASSPHRASE_FILE}" \
  --output "${ENC_ARCHIVE}" \
  "${RAW_DUMP}"

rm -f "${RAW_DUMP}"
sha256sum "${ENC_ARCHIVE}" > "${SHA_FILE}"

# 4. Replicate encrypted archive + checksum off-server when configured
if [[ -n "${OFFSITE_CMD}" ]]; then
  export ENC_ARCHIVE SHA_FILE STAMP
  bash -c "${OFFSITE_CMD}"
fi

# 5. Prune local encrypted archives older than retention window
find "${BACKUP_DIR}" -maxdepth 1 -type f \( -name "${DB_NAME}-*.dump.gpg" -o -name "${DB_NAME}-*.dump.gpg.sha256" \) -mtime "+${RETENTION_DAYS}" -delete

BYTES="$(stat -c '%s' "${ENC_ARCHIVE}")"
echo "{\"level\":\"info\",\"event\":\"staging_backup_complete\",\"stamp\":\"${STAMP}\",\"encrypted_bytes\":${BYTES}}"
