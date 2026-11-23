#!/usr/bin/env bash
# BiteShark Secondary Staging (`staging2`) Consistent Database Backup + AES-256 Encryption
# Backs up ONLY `biteshark_staging2` and `/var/lib/biteshark-staging2/*` (never touches `truckly_staging` or unrelated workloads).

set -euo pipefail
umask 077

BACKUP_DIR="${BITESHARK_BACKUP_DIR:-/var/backups/biteshark-staging2}"
RETENTION_DAYS="${BITESHARK_BACKUP_RETENTION_DAYS:-7}"
PASSPHRASE_FILE="${BITESHARK_BACKUP_PASSPHRASE_FILE:-/etc/biteshark-staging2/backup.passphrase}"
DB_NAME="${BITESHARK_BACKUP_DB_NAME:-biteshark_staging2}"
PHOTO_STORAGE_DIR="${BITESHARK_PHOTO_STORAGE_DIR:-/var/lib/biteshark-staging2/customer-photos}"
STYLE_GUIDE_STORAGE_DIR="${BITESHARK_STYLE_GUIDE_STORAGE_DIR:-/var/lib/biteshark-staging2/style-guide}"
OFFSITE_CMD="${BITESHARK_BACKUP_OFFSITE_CMD:-}"

if [[ ! -s "${PASSPHRASE_FILE}" ]]; then
  echo '{"level":"fatal","event":"backup_missing_passphrase_file","env":"staging2"}' >&2
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

runuser -u postgres -- pg_dump \
  --format=custom \
  --no-owner \
  --no-acl \
  --dbname="${DB_NAME}" > "${RAW_DUMP}"

pg_restore --list "${RAW_DUMP}" >/dev/null

gpg --batch --yes \
  --symmetric \
  --cipher-algo AES256 \
  --pinentry-mode loopback \
  --passphrase-file "${PASSPHRASE_FILE}" \
  --output "${ENC_ARCHIVE}" \
  "${RAW_DUMP}"

rm -f "${RAW_DUMP}"
sha256sum "${ENC_ARCHIVE}" > "${SHA_FILE}"

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

if [[ -n "${OFFSITE_CMD}" ]]; then
  export ENC_ARCHIVE SHA_FILE ENC_PHOTO_ARCHIVE PHOTO_SHA_FILE ENC_SG_ARCHIVE SG_SHA_FILE STAMP
  bash -c "${OFFSITE_CMD}"
fi

find "${BACKUP_DIR}" -maxdepth 1 -type f \( -name "${DB_NAME}-*.dump.gpg" -o -name "${DB_NAME}-*.dump.gpg.sha256" -o -name "${DB_NAME}-photos-*.tar.gz.gpg" -o -name "${DB_NAME}-photos-*.tar.gz.gpg.sha256" -o -name "${DB_NAME}-style-guide-*.tar.gz.gpg" -o -name "${DB_NAME}-style-guide-*.tar.gz.gpg.sha256" \) -mtime "+${RETENTION_DAYS}" -delete

BYTES="$(stat -c '%s' "${ENC_ARCHIVE}")"
echo "{\"level\":\"info\",\"event\":\"staging2_backup_complete\",\"stamp\":\"${STAMP}\",\"encrypted_bytes\":${BYTES},\"encrypted_photo_bytes\":${PHOTO_BYTES},\"encrypted_style_guide_bytes\":${SG_BYTES}}"
