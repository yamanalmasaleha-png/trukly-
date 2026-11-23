#!/usr/bin/env bash
# BiteShark Isolated Staging Consistent Database Backup + AES-256 Encryption + Off-Server Sync
# Backs up ONLY `truckly_staging` (retains existing internal DB/directory names; never touches unrelated databases).

set -euo pipefail
umask 077

BACKUP_DIR="${BITESHARK_BACKUP_DIR:-${TRUCKLY_BACKUP_DIR:-/var/backups/truckly-staging}}"
RETENTION_DAYS="${BITESHARK_BACKUP_RETENTION_DAYS:-${TRUCKLY_BACKUP_RETENTION_DAYS:-7}}"
PASSPHRASE_FILE="${BITESHARK_BACKUP_PASSPHRASE_FILE:-${TRUCKLY_BACKUP_PASSPHRASE_FILE:-/etc/truckly-staging/backup.passphrase}}"
DB_NAME="${BITESHARK_BACKUP_DB_NAME:-${TRUCKLY_BACKUP_DB_NAME:-truckly_staging}}"
PHOTO_STORAGE_DIR="${BITESHARK_PHOTO_STORAGE_DIR:-${TRUCKLY_PHOTO_STORAGE_DIR:-/var/lib/truckly-staging/customer-photos}}"
STYLE_GUIDE_STORAGE_DIR="${BITESHARK_STYLE_GUIDE_STORAGE_DIR:-${TRUCKLY_STYLE_GUIDE_STORAGE_DIR:-/var/lib/truckly-staging/style-guide}}"
OFFSITE_CMD="${BITESHARK_BACKUP_OFFSITE_CMD:-${TRUCKLY_BACKUP_OFFSITE_CMD:-}}"

if [[ ! -s "${PASSPHRASE_FILE}" ]]; then
  echo '{"level":"fatal","event":"backup_missing_passphrase_file"}' >&2
  exit 1
fi

install -d -m 0700 "${BACKUP_DIR}"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
RAW_DUMP="${BACKUP_DIR}/${DB_NAME}-${STAMP}.dump"
ENC_ARCHIVE="${RAW_DUMP}.gpg"
SHA_FILE="${ENC_ARCHIVE}.sha256"
RAW_PHOTO_TAR="${BACKUP_DIR}/${DB_NAME}-photos-${STAMP}.tar.gz"
ENC_PHOTO_ARCHIVE="${RAW_PHOTO_TAR}.gpg"
PHOTO_SHA_FILE="${ENC_PHOTO_ARCHIVE}.sha256"
RAW_SG_TAR="${BACKUP_DIR}/${DB_NAME}-style-guide-${STAMP}.tar.gz"
ENC_SG_ARCHIVE="${RAW_SG_TAR}.gpg"
SG_SHA_FILE="${ENC_SG_ARCHIVE}.sha256"

cleanup_raw() {
  rm -f "${RAW_DUMP}" "${RAW_PHOTO_TAR}" "${RAW_SG_TAR}"
}
trap cleanup_raw EXIT

# 1. Consistent custom-format PostgreSQL dump via local peer postgres socket
#    Redirect stdout as root so `BACKUP_DIR` remains 0700 root:root without granting directory write to `postgres`.
runuser -u postgres -- pg_dump \
  --format=custom \
  --no-owner \
  --no-acl \
  --dbname="${DB_NAME}" > "${RAW_DUMP}"

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

# 3b. Encrypt persistent private customer photo storage directory when present
PHOTO_BYTES=0
if [[ -d "${PHOTO_STORAGE_DIR}" ]]; then
  tar -czf "${RAW_PHOTO_TAR}" -C "${PHOTO_STORAGE_DIR}" .
  gpg --batch --yes \
    --symmetric \
    --cipher-algo AES256 \
    --pinentry-mode loopback \
    --passphrase-file "${PASSPHRASE_FILE}" \
    --output "${ENC_PHOTO_ARCHIVE}" \
    "${RAW_PHOTO_TAR}"
  rm -f "${RAW_PHOTO_TAR}"
  sha256sum "${ENC_PHOTO_ARCHIVE}" > "${PHOTO_SHA_FILE}"
  PHOTO_BYTES="$(stat -c '%s' "${ENC_PHOTO_ARCHIVE}")"
fi

# 3c. Encrypt persistent Style Guide workspace directory when present
SG_BYTES=0
if [[ -d "${STYLE_GUIDE_STORAGE_DIR}" ]]; then
  tar -czf "${RAW_SG_TAR}" -C "${STYLE_GUIDE_STORAGE_DIR}" .
  gpg --batch --yes \
    --symmetric \
    --cipher-algo AES256 \
    --pinentry-mode loopback \
    --passphrase-file "${PASSPHRASE_FILE}" \
    --output "${ENC_SG_ARCHIVE}" \
    "${RAW_SG_TAR}"
  rm -f "${RAW_SG_TAR}"
  sha256sum "${ENC_SG_ARCHIVE}" > "${SG_SHA_FILE}"
  SG_BYTES="$(stat -c '%s' "${ENC_SG_ARCHIVE}")"
fi

# 4. Replicate encrypted archive + checksum off-server when configured
if [[ -n "${OFFSITE_CMD}" ]]; then
  export ENC_ARCHIVE SHA_FILE ENC_PHOTO_ARCHIVE PHOTO_SHA_FILE ENC_SG_ARCHIVE SG_SHA_FILE STAMP
  bash -c "${OFFSITE_CMD}"
fi

# 5. Prune local encrypted archives older than retention window
find "${BACKUP_DIR}" -maxdepth 1 -type f \( -name "${DB_NAME}-*.dump.gpg" -o -name "${DB_NAME}-*.dump.gpg.sha256" -o -name "${DB_NAME}-photos-*.tar.gz.gpg" -o -name "${DB_NAME}-photos-*.tar.gz.gpg.sha256" -o -name "${DB_NAME}-style-guide-*.tar.gz.gpg" -o -name "${DB_NAME}-style-guide-*.tar.gz.gpg.sha256" \) -mtime "+${RETENTION_DAYS}" -delete

BYTES="$(stat -c '%s' "${ENC_ARCHIVE}")"
echo "{\"level\":\"info\",\"event\":\"staging_backup_complete\",\"stamp\":\"${STAMP}\",\"encrypted_bytes\":${BYTES},\"encrypted_photo_bytes\":${PHOTO_BYTES},\"encrypted_style_guide_bytes\":${SG_BYTES}}"
