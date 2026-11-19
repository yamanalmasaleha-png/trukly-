#!/usr/bin/env bash
# BiteShark Reproducible Single-SHA VPS Staging Installer & Atomic Switcher
#
# Deploys an explicitly selected 40-character commit SHA (and verified SHA-256 tarball)
# into `/srv/truckly-staging/releases/<sha>`, installs locked production dependencies via
# `/opt/nodejs/node-v22-lts`, applies idempotent PostgreSQL migrations as `truckly_stg_migrator`,
# updates release SHA metadata in `/etc/truckly-staging/staging.env`, atomically switches
# `/srv/truckly-staging/current`, restarts `truckly-staging-api` & `truckly-staging-worker`,
# and verifies `/api/healthz`.
#
# Usage (install/update):
#   sudo bash deploy/install-staging-release.sh \
#     --sha <40-hex-commit-sha> \
#     --tarball /tmp/biteshark-<sha12>.tar.gz \
#     --sha256-file /tmp/biteshark-<sha12>.tar.gz.sha256
#
# Usage (instant symlink rollback to an already-installed release):
#   sudo bash deploy/install-staging-release.sh --rollback-to <40-hex-commit-sha>

set -euo pipefail
umask 022

STAGING_ROOT="${BITESHARK_STAGING_ROOT:-/srv/truckly-staging}"
RELEASES_DIR="${STAGING_ROOT}/releases"
CURRENT_LINK="${STAGING_ROOT}/current"
ETC_DIR="${BITESHARK_STAGING_ETC:-/etc/truckly-staging}"
STAGING_ENV="${ETC_DIR}/staging.env"
MIGRATOR_ENV="${ETC_DIR}/migrator.env"
NODE_BIN_DIR="${BITESHARK_NODE_BIN_DIR:-/opt/nodejs/node-v22-lts/bin}"
APP_DB_ROLE="${BITESHARK_DB_APP_ROLE:-truckly_stg_app}"
HEALTH_URL="${BITESHARK_HEALTH_URL:-http://127.0.0.1:4100/api/healthz}"

TARGET_SHA=""
TARBALL_PATH=""
SHA256_FILE=""
ROLLBACK_MODE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --sha)
      TARGET_SHA="${2:-}"
      shift 2
      ;;
    --tarball)
      TARBALL_PATH="${2:-}"
      shift 2
      ;;
    --sha256-file)
      SHA256_FILE="${2:-}"
      shift 2
      ;;
    --rollback-to)
      TARGET_SHA="${2:-}"
      ROLLBACK_MODE=1
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

if [[ ! "${TARGET_SHA}" =~ ^[0-9a-f]{40}$ ]]; then
  echo "ERROR: --sha / --rollback-to must be a full 40-character lowercase hex commit SHA." >&2
  exit 2
fi

if [[ ! -x "${NODE_BIN_DIR}/node" || ! -x "${NODE_BIN_DIR}/npm" ]]; then
  echo "ERROR: Required Node 22 runtime not found at ${NODE_BIN_DIR}." >&2
  exit 1
fi

if [[ ! -f "${STAGING_ENV}" ]]; then
  echo "ERROR: Missing staging environment file at ${STAGING_ENV}." >&2
  exit 1
fi

export PATH="${NODE_BIN_DIR}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

PREV_REAL=""
if [[ -L "${CURRENT_LINK}" ]]; then
  PREV_REAL="$(readlink -f "${CURRENT_LINK}" || true)"
fi

RELEASE_DIR="${RELEASES_DIR}/${TARGET_SHA}"

if [[ "${ROLLBACK_MODE}" -eq 0 ]]; then
  if [[ -z "${TARBALL_PATH}" || ! -f "${TARBALL_PATH}" ]]; then
    echo "ERROR: --tarball <file.tar.gz> is required and must exist." >&2
    exit 2
  fi
  if [[ -z "${SHA256_FILE}" ]]; then
    SHA256_FILE="${TARBALL_PATH}.sha256"
  fi
  if [[ ! -f "${SHA256_FILE}" ]]; then
    echo "ERROR: Checksum file not found at ${SHA256_FILE}." >&2
    exit 2
  fi

  # 1. Verify tarball SHA-256 checksum before touching /srv
  EXPECTED_HASH="$(awk '{print $1}' "${SHA256_FILE}" | head -n 1 | tr 'A-F' 'a-f')"
  ACTUAL_HASH="$(sha256sum "${TARBALL_PATH}" | awk '{print $1}' | tr 'A-F' 'a-f')"
  if [[ -z "${EXPECTED_HASH}" || "${EXPECTED_HASH}" != "${ACTUAL_HASH}" ]]; then
    echo "ERROR: SHA-256 mismatch for ${TARBALL_PATH}: expected ${EXPECTED_HASH}, got ${ACTUAL_HASH}" >&2
    exit 1
  fi
  echo "{\"event\":\"tarball_checksum_verified\",\"sha\":\"${TARGET_SHA}\",\"tarball_sha256\":\"${ACTUAL_HASH}\"}"

  install -d -m 0755 "${RELEASES_DIR}"

  # 2. Extract into immutable staging directory and assert zero secrets / dev controls inside release
  STAGE_TMP="${RELEASES_DIR}/.staging-${TARGET_SHA}-$$"
  rm -rf "${STAGE_TMP}"
  install -d -m 0755 "${STAGE_TMP}"
  tar -xzf "${TARBALL_PATH}" -C "${STAGE_TMP}"

  if find "${STAGE_TMP}" -maxdepth 3 \( -name '.env*' -o -name 'debug-admin.js' -o -name 'dev-server.cjs' \) | grep -q .; then
    rm -rf "${STAGE_TMP}"
    echo "ERROR: Release archive contains forbidden secret or development-simulator files." >&2
    exit 1
  fi

  # 3. Install locked production dependencies inside isolated release directory
  (
    cd "${STAGE_TMP}"
    "${NODE_BIN_DIR}/npm" ci --omit=dev --ignore-scripts --no-audit --no-fund
  )
  chown -R root:root "${STAGE_TMP}"
  chmod -R u=rwX,go=rX "${STAGE_TMP}"

  if [[ -d "${RELEASE_DIR}" ]]; then
    rm -rf "${STAGE_TMP}"
    echo "{\"event\":\"release_dir_already_present\",\"release_dir\":\"${RELEASE_DIR}\"}"
  else
    mv "${STAGE_TMP}" "${RELEASE_DIR}"
  fi

  # 4. Run idempotent SQL migrations as `truckly_stg_migrator` before switching traffic
  if [[ ! -f "${MIGRATOR_ENV}" ]]; then
    echo "ERROR: Missing migrator credentials at ${MIGRATOR_ENV}." >&2
    exit 1
  fi
  (
    set -a
    # shellcheck disable=SC1090
    source "${MIGRATOR_ENV}"
    set +a
    cd "${RELEASE_DIR}"
    "${NODE_BIN_DIR}/node" scripts/run-migrations.cjs --app-role "${APP_DB_ROLE}"
  )
else
  if [[ ! -d "${RELEASE_DIR}" ]]; then
    echo "ERROR: Cannot roll back; release directory ${RELEASE_DIR} does not exist." >&2
    exit 1
  fi
fi

# 5. Update release SHA keys in `/etc/truckly-staging/staging.env` without altering ownership/mode (`0640 root:truckly-stg`)
ENV_TMP="${STAGING_ENV}.tmp.$$"
cp -p "${STAGING_ENV}" "${ENV_TMP}"
grep -v -E '^(BITESHARK_RELEASE_SHA|TRUCKLY_RELEASE_SHA)=' "${STAGING_ENV}" > "${ENV_TMP}"
{
  echo "BITESHARK_RELEASE_SHA=${TARGET_SHA}"
  echo "TRUCKLY_RELEASE_SHA=${TARGET_SHA}"
} >> "${ENV_TMP}"
chown root:truckly-stg "${ENV_TMP}"
chmod 0640 "${ENV_TMP}"
mv -f "${ENV_TMP}" "${STAGING_ENV}"

# 6. Atomically flip `/srv/truckly-staging/current` symlink
NEXT_LINK="${STAGING_ROOT}/.current-next-$$"
ln -sfn "${RELEASE_DIR}" "${NEXT_LINK}"
mv -Tf "${NEXT_LINK}" "${CURRENT_LINK}"

# 7. Restart API then worker sequentially
systemctl restart truckly-staging-api.service
systemctl restart truckly-staging-worker.service

# 8. Verify loopback readiness and exact deployed `release_sha`
HEALTH_OK=0
for _ in 1 2 3 4 5 6 7 8 9 10; do
  BODY="$(curl -fsS --max-time 3 "${HEALTH_URL}" 2>/dev/null || true)"
  if echo "${BODY}" | grep -q '"status":"ok"' && echo "${BODY}" | grep -q "\"release_sha\":\"${TARGET_SHA}\""; then
    HEALTH_OK=1
    break
  fi
  sleep 1
done

if [[ "${HEALTH_OK}" -ne 1 ]]; then
  echo "ERROR: Health check did not confirm status=ok and release_sha=${TARGET_SHA} at ${HEALTH_URL}." >&2
  if [[ -n "${PREV_REAL}" && -d "${PREV_REAL}" ]]; then
    echo "Attempting automatic symlink rollback to ${PREV_REAL}..." >&2
    PREV_SHA="$(basename "${PREV_REAL}")"
    ln -sfn "${PREV_REAL}" "${CURRENT_LINK}.rb.$$"
    mv -Tf "${CURRENT_LINK}.rb.$$" "${CURRENT_LINK}"
    grep -v -E '^(BITESHARK_RELEASE_SHA|TRUCKLY_RELEASE_SHA)=' "${STAGING_ENV}" > "${STAGING_ENV}.rb.$$"
    {
      echo "BITESHARK_RELEASE_SHA=${PREV_SHA}"
      echo "TRUCKLY_RELEASE_SHA=${PREV_SHA}"
    } >> "${STAGING_ENV}.rb.$$"
    chown root:truckly-stg "${STAGING_ENV}.rb.$$"
    chmod 0640 "${STAGING_ENV}.rb.$$"
    mv -f "${STAGING_ENV}.rb.$$" "${STAGING_ENV}"
    systemctl restart truckly-staging-api.service || true
    systemctl restart truckly-staging-worker.service || true
  fi
  exit 1
fi

echo "{\"event\":\"staging_release_active\",\"release_sha\":\"${TARGET_SHA}\",\"previous_release\":\"${PREV_REAL}\"}"
