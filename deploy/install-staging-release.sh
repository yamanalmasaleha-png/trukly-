#!/usr/bin/env bash
# BiteShark Reproducible Single-SHA VPS Staging Installer, Verifier & Verified Rollback Tool
#
# Security & Reliability Invariants:
#   1. Trust Before Execution: Operators MUST verify the uploaded archive's SHA-256 against the
#      trusted release record (`echo "<EXPECTED_SHA256>  /tmp/biteshark-<sha12>.tar.gz" | sha256sum -c -`)
#      BEFORE extracting or running this script. As defense in depth, this script also re-verifies
#      `--expected-sha256` / `--sha256-file` and inspects every 512-byte tar header block in memory
#      BEFORE extraction (rejecting absolute paths, `..` traversal, symlinks, hardlinks, devices,
#      FIFOs, global PAX headers, duplicate paths, `.env*`, `node_modules/`, and debug controls).
#   2. Existing Release Directory Verification: Never blindly trusts `/srv/truckly-staging/releases/<sha>`;
#      verifies every file byte-for-byte against the authenticated archive manifest before reuse.
#   3. Concurrency Exclusion: Acquires a non-blocking exclusive deployment lock (`flock` on Linux,
#      atomic lock-dir fallback) so concurrent deploy/rollback invocations fail fast (`exit 3`)
#      without racing on `/srv/truckly-staging/current` or `/etc/truckly-staging/staging.env`.
#   4. Phase-Guarded Activation & Verified Rollback: Snapshots the previous release target and a
#      `0600` verbatim copy of `/etc/truckly-staging/staging.env` (preserving `0640` owner/group).
#      Any failure during env update, symlink switch, `truckly-staging-api` restart,
#      `truckly-staging-worker` restart, API readiness/release-SHA verification, worker active/CWD
#      verification, co-tenant health verification, public staging HTTPS verification, or holding-page
#      verification triggers automatic rollback, verifies recovery of BOTH services, preserves
#      secret-redacted diagnostics, and exits `1` (or `4` if rollback itself fails — never masking
#      failed recovery).
#   5. Database vs Application Rollback Separation: Confirms SQL migration checksums (`001`–`017`)
#      and records `newly_applied`. Symlink/env rollback restores application code and runtime config
#      only; it does NOT reverse already-committed PostgreSQL schema changes.

set -euo pipefail
umask 022

STAGING_ROOT="${BITESHARK_STAGING_ROOT:-/srv/truckly-staging}"
RELEASES_DIR="${STAGING_ROOT}/releases"
CURRENT_LINK="${STAGING_ROOT}/current"
ETC_DIR="${BITESHARK_STAGING_ETC:-/etc/truckly-staging}"
STAGING_ENV="${ETC_DIR}/staging.env"
MIGRATOR_ENV="${ETC_DIR}/migrator.env"
LOCK_FILE="${BITESHARK_DEPLOY_LOCK_FILE:-/var/lock/biteshark-staging-deploy.lock}"
NODE_BIN_DIR="${BITESHARK_NODE_BIN_DIR:-/opt/nodejs/node-v22-lts/bin}"
SYSTEMCTL_CMD="${BITESHARK_SYSTEMCTL_CMD:-systemctl}"
JOURNALCTL_CMD="${BITESHARK_JOURNALCTL_CMD:-journalctl}"
API_SERVICE_UNIT="${BITESHARK_API_SERVICE_UNIT:-truckly-staging-api.service}"
WORKER_SERVICE_UNIT="${BITESHARK_WORKER_SERVICE_UNIT:-truckly-staging-worker.service}"
UNPRIV_BUILD_USER="${BITESHARK_UNPRIV_BUILD_USER:-}"
UNPRIV_MIGRATE_USER="${BITESHARK_UNPRIV_MIGRATE_USER:-}"
APP_DB_ROLE="${BITESHARK_DB_APP_ROLE:-truckly_stg_app}"
HEALTH_URL="${BITESHARK_HEALTH_URL:-http://127.0.0.1:4100/api/healthz}"
PUBLIC_STAGING_URL="${BITESHARK_PUBLIC_STAGING_URL:-https://staging.biteshark.live}"
PUBLIC_HOLDING_URL="${BITESHARK_PUBLIC_HOLDING_URL:-https://biteshark.live}"
COTENANT_HTTP_URL="${BITESHARK_COTENANT_HTTP_URL:-http://127.0.0.1/}"
COTENANT_UNITS="${BITESHARK_COTENANT_UNITS:-nginx.service postgresql.service pm2-matt.service qwen-worker.service}"
HEALTH_MAX_ATTEMPTS="${BITESHARK_HEALTH_MAX_ATTEMPTS:-12}"
HEALTH_SLEEP_SEC="${BITESHARK_HEALTH_SLEEP_SEC:-1}"
WORKER_SETTLE_SEC="${BITESHARK_WORKER_SETTLE_SEC:-2}"
TEST_HOLD_LOCK_MS="${BITESHARK_TEST_HOLD_LOCK_MS:-0}"

TARGET_SHA=""
TARBALL_PATH=""
EXPECTED_SHA256=""
SHA256_FILE=""
ROLLBACK_MODE=0
ALLOW_LIVE_PUSH=0

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
    --expected-sha256)
      EXPECTED_SHA256="${2:-}"
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
    --public-staging-url)
      PUBLIC_STAGING_URL="${2:-}"
      shift 2
      ;;
    --public-holding-url)
      PUBLIC_HOLDING_URL="${2:-}"
      shift 2
      ;;
    --cotenant-http-url)
      COTENANT_HTTP_URL="${2:-}"
      shift 2
      ;;
    --allow-live-push)
      ALLOW_LIVE_PUSH=1
      shift 1
      ;;
    *)
      echo "{\"level\":\"fatal\",\"event\":\"invalid_argument\",\"arg\":\"$1\"}" >&2
      exit 2
      ;;
  esac
done

if [[ ! "${TARGET_SHA}" =~ ^[0-9a-f]{40}$ ]]; then
  echo '{"level":"fatal","event":"invalid_target_sha","message":"--sha / --rollback-to must be a 40-character lowercase hex commit SHA."}' >&2
  exit 2
fi

NODE_EXE="${NODE_BIN_DIR}/node"
NPM_EXE="${NODE_BIN_DIR}/npm"
if [[ ! -x "${NODE_EXE}" && -x "${NODE_BIN_DIR}/node.exe" ]]; then
  NODE_EXE="${NODE_BIN_DIR}/node.exe"
fi
if [[ ! -x "${NPM_EXE}" && -f "${NODE_BIN_DIR}/npm.cmd" ]]; then
  NPM_EXE="${NODE_BIN_DIR}/npm.cmd"
fi
if [[ ! -x "${NODE_EXE}" ]]; then
  echo "{\"level\":\"fatal\",\"event\":\"missing_node_runtime\",\"node_bin_dir\":\"${NODE_BIN_DIR}\"}" >&2
  exit 1
fi

export PATH="${NODE_BIN_DIR}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:${PATH}"

UNAME_S="$(uname -s 2>/dev/null || echo unknown)"
IS_WINDOWS_BASH=0
case "${UNAME_S}" in
  MINGW*|MSYS*|CYGWIN*) IS_WINDOWS_BASH=1 ;;
esac

to_node_path() {
  local p="$1"
  if [[ "${IS_WINDOWS_BASH}" -eq 1 ]] && command -v cygpath >/dev/null 2>&1; then
    cygpath -w "$p"
  else
    printf '%s' "$p"
  fi
}

from_node_path() {
  local p="$1"
  if [[ "${IS_WINDOWS_BASH}" -eq 1 ]] && command -v cygpath >/dev/null 2>&1; then
    cygpath -u "$p"
  else
    printf '%s' "$p"
  fi
}

now_epoch_ms() {
  "${NODE_EXE}" -e 'process.stdout.write(String(Date.now()))'
}

sleep_ms() {
  local ms="$1"
  if [[ "${ms}" -gt 0 ]]; then
    "${NODE_EXE}" -e 'setTimeout(() => {}, Number(process.argv[1]))' "${ms}"
  fi
}

# ============================================================================
# Cleanup & Exclusive Lock State
# ============================================================================
LOCK_ACQUIRED=0
LOCK_DIR_PATH="${LOCK_FILE}.dir"
STAGE_TMP=""
ENV_BACKUP=""

cleanup_ephemeral() {
  if [[ -n "${STAGE_TMP}" && -d "${STAGE_TMP}" ]]; then
    rm -rf "${STAGE_TMP}" 2>/dev/null || true
  fi
  if [[ -n "${ENV_BACKUP}" && -f "${ENV_BACKUP}" ]]; then
    rm -f "${ENV_BACKUP}" 2>/dev/null || true
  fi
  if [[ "${LOCK_ACQUIRED}" -eq 1 && -d "${LOCK_DIR_PATH}" ]]; then
    rm -rf "${LOCK_DIR_PATH}" 2>/dev/null || true
  fi
}
trap cleanup_ephemeral EXIT

mkdir -p "$(dirname "${LOCK_FILE}")"
if command -v flock >/dev/null 2>&1; then
  exec 9>"${LOCK_FILE}"
  if ! flock -n 9; then
    echo "{\"level\":\"fatal\",\"event\":\"deploy_lock_busy\",\"lock_file\":\"${LOCK_FILE}\"}" >&2
    exit 3
  fi
  LOCK_ACQUIRED=1
else
  if ! mkdir "${LOCK_DIR_PATH}" 2>/dev/null; then
    if [[ -f "${LOCK_DIR_PATH}/pid" ]]; then
      HOLDER_PID="$(cat "${LOCK_DIR_PATH}/pid" 2>/dev/null || true)"
      if [[ -n "${HOLDER_PID}" ]] && ! kill -0 "${HOLDER_PID}" 2>/dev/null; then
        rm -rf "${LOCK_DIR_PATH}" 2>/dev/null || true
        mkdir "${LOCK_DIR_PATH}" 2>/dev/null || {
          echo "{\"level\":\"fatal\",\"event\":\"deploy_lock_busy\",\"lock_file\":\"${LOCK_DIR_PATH}\"}" >&2
          exit 3
        }
      else
        echo "{\"level\":\"fatal\",\"event\":\"deploy_lock_busy\",\"lock_file\":\"${LOCK_DIR_PATH}\"}" >&2
        exit 3
      fi
    else
      echo "{\"level\":\"fatal\",\"event\":\"deploy_lock_busy\",\"lock_file\":\"${LOCK_DIR_PATH}\"}" >&2
      exit 3
    fi
  fi
  printf '%s\n' "$$" > "${LOCK_DIR_PATH}/pid"
  LOCK_ACQUIRED=1
fi

if [[ "${TEST_HOLD_LOCK_MS}" -gt 0 ]]; then
  sleep_ms "${TEST_HOLD_LOCK_MS}"
fi

# ============================================================================
# Protected Environment & Push-Disabled Pre-Flight Checks (Never Prints Values)
# ============================================================================
if [[ ! -f "${STAGING_ENV}" ]]; then
  echo "{\"level\":\"fatal\",\"event\":\"missing_staging_env\",\"path\":\"${STAGING_ENV}\"}" >&2
  exit 1
fi

STAGING_ENV_META="$("${NODE_EXE}" - "$(to_node_path "${STAGING_ENV}")" "${ALLOW_LIVE_PUSH}" "${IS_WINDOWS_BASH}" <<'NODE'
const fs = require('node:fs');
const [envPath, allowLivePush, isWin] = process.argv.slice(2);
const st = fs.lstatSync(envPath);
if (!st.isFile() || st.isSymbolicLink()) {
  console.error(JSON.stringify({ level: 'fatal', event: 'unsafe_staging_env_type' }));
  process.exit(1);
}
const modeOctal = st.mode & 0o777;
if (isWin !== '1' && (modeOctal & 0o007) !== 0) {
  console.error(JSON.stringify({ level: 'fatal', event: 'staging_env_world_accessible', mode_octal: modeOctal.toString(8) }));
  process.exit(1);
}
const raw = fs.readFileSync(envPath, 'utf8');
let bsPush = '';
let trPush = '';
for (const line of raw.split(/\r?\n/)) {
  const m = /^\s*(BITESHARK_PUSH_PROVIDER_MODE|TRUCKLY_PUSH_PROVIDER_MODE)\s*=\s*(.*?)\s*$/.exec(line);
  if (!m) continue;
  const val = m[2].replace(/^['"]|['"]$/g, '').trim().toLowerCase();
  if (m[1] === 'BITESHARK_PUSH_PROVIDER_MODE') bsPush = val;
  if (m[1] === 'TRUCKLY_PUSH_PROVIDER_MODE') trPush = val;
}
if (bsPush && trPush && bsPush !== trPush) {
  console.error(JSON.stringify({ level: 'fatal', event: 'push_mode_alias_conflict' }));
  process.exit(1);
}
const effectivePush = bsPush || trPush || 'disabled';
if (allowLivePush !== '1' && effectivePush !== 'disabled') {
  console.error(JSON.stringify({
    level: 'fatal',
    event: 'push_provider_not_disabled_during_install',
    effective_push_mode: effectivePush,
    message: 'Keep push disabled during installation (or pass --allow-live-push explicitly when authorized).'
  }));
  process.exit(2);
}
console.log(JSON.stringify({ uid: st.uid, gid: st.gid, mode: modeOctal, push_mode: effectivePush }));
NODE
)"

ENV_ORIG_UID="$("${NODE_EXE}" -e 'process.stdout.write(String(JSON.parse(process.argv[1]).uid))' "${STAGING_ENV_META}")"
ENV_ORIG_GID="$("${NODE_EXE}" -e 'process.stdout.write(String(JSON.parse(process.argv[1]).gid))' "${STAGING_ENV_META}")"
ENV_ORIG_MODE="$("${NODE_EXE}" -e 'process.stdout.write(JSON.parse(process.argv[1]).mode.toString(8).padStart(4, "0"))' "${STAGING_ENV_META}")"

# ============================================================================
# Symlink & Realpath Helpers (POSIX Linux `ln -sfn` + `mv -Tf`, Windows Junction Fallback)
# ============================================================================
resolve_link_target() {
  local link_path="$1"
  if [[ ! -e "${link_path}" && ! -L "${link_path}" ]]; then
    return 0
  fi
  local resolved_np
  resolved_np="$("${NODE_EXE}" -e '
    const fs = require("node:fs");
    try { process.stdout.write(fs.realpathSync(process.argv[1])); } catch {}
  ' "$(to_node_path "${link_path}")")"
  if [[ -n "${resolved_np}" ]]; then
    from_node_path "${resolved_np}"
  fi
}

atomic_switch_current_link() {
  local target_dir="$1"
  if [[ "${IS_WINDOWS_BASH}" -eq 1 ]]; then
    "${NODE_EXE}" - "$(to_node_path "${target_dir}")" "$(to_node_path "${CURRENT_LINK}")" <<'NODE'
const fs = require('node:fs');
const [target, linkPath] = process.argv.slice(2);
try {
  const st = fs.lstatSync(linkPath);
  if (st.isSymbolicLink() || st.isDirectory()) {
    fs.unlinkSync(linkPath);
  }
} catch {}
fs.symlinkSync(target, linkPath, 'junction');
NODE
  else
    local next_link="${STAGING_ROOT}/.current-next-$$"
    ln -sfn "${target_dir}" "${next_link}"
    mv -Tf "${next_link}" "${CURRENT_LINK}"
  fi
}

update_staging_env_release_sha() {
  local sha_val="$1"
  "${NODE_EXE}" - "$(to_node_path "${STAGING_ENV}")" "${sha_val}" "${ENV_ORIG_UID}" "${ENV_ORIG_GID}" "${ENV_ORIG_MODE}" "${IS_WINDOWS_BASH}" <<'NODE'
const fs = require('node:fs');
const [envPath, shaVal, uidStr, gidStr, modeOctStr, isWin] = process.argv.slice(2);
const raw = fs.readFileSync(envPath, 'utf8');
const kept = raw
  .split(/\r?\n/)
  .filter(line => !/^(BITESHARK_RELEASE_SHA|TRUCKLY_RELEASE_SHA)=/.test(line));
while (kept.length > 0 && kept[kept.length - 1] === '') kept.pop();
kept.push(`BITESHARK_RELEASE_SHA=${shaVal}`);
kept.push(`TRUCKLY_RELEASE_SHA=${shaVal}`);
const tmpPath = `${envPath}.tmp.${process.pid}`;
const targetMode = parseInt(modeOctStr, 8) || 0o640;
fs.writeFileSync(tmpPath, kept.join('\n') + '\n', { encoding: 'utf8', mode: 0o600 });
if (isWin !== '1') {
  if (typeof process.getuid === 'function' && process.getuid() === 0) {
    fs.chownSync(tmpPath, Number(uidStr), Number(gidStr));
  }
  fs.chmodSync(tmpPath, targetMode);
}
fs.renameSync(tmpPath, envPath);
if (isWin !== '1') {
  const check = fs.lstatSync(envPath).mode & 0o777;
  if ((check & 0o007) !== 0) {
    throw new Error(`Unsafe mode after staging.env update: ${check.toString(8)}`);
  }
}
NODE
}

restore_staging_env_backup() {
  "${NODE_EXE}" - "$(to_node_path "${ENV_BACKUP}")" "$(to_node_path "${STAGING_ENV}")" "${ENV_ORIG_UID}" "${ENV_ORIG_GID}" "${ENV_ORIG_MODE}" "${IS_WINDOWS_BASH}" <<'NODE'
const fs = require('node:fs');
const [backupPath, envPath, uidStr, gidStr, modeOctStr, isWin] = process.argv.slice(2);
const tmpPath = `${envPath}.rb.${process.pid}`;
const targetMode = parseInt(modeOctStr, 8) || 0o640;
fs.copyFileSync(backupPath, tmpPath);
if (isWin !== '1') {
  if (typeof process.getuid === 'function' && process.getuid() === 0) {
    fs.chownSync(tmpPath, Number(uidStr), Number(gidStr));
  }
  fs.chmodSync(tmpPath, targetMode);
}
fs.renameSync(tmpPath, envPath);
if (isWin !== '1') {
  const check = fs.lstatSync(envPath).mode & 0o777;
  if ((check & 0o007) !== 0) {
    throw new Error(`Unsafe mode after staging.env restore: ${check.toString(8)}`);
  }
}
NODE
}

# ============================================================================
# Tarball Checksum, Pre-Extraction Member Safety & Release Directory Verifier
# ============================================================================
verify_archive_or_dir() {
  local mode="$1" # "inspect-tar", "verify-dir-against-tar", "verify-rollback-dir"
  local arg_tar="$2"
  local arg_hash="$3"
  local arg_dir="$4"

  "${NODE_EXE}" - "${mode}" "${arg_tar}" "${arg_hash}" "${arg_dir}" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');

const [mode, tarballPath, expectedHash, targetDir] = process.argv.slice(2);

function validateRelativeMemberPath(rawPath, label) {
  if (!rawPath || typeof rawPath !== 'string') {
    throw new Error(`Empty ${label} path in archive`);
  }
  if (rawPath.includes('\0') || rawPath.includes('\\')) {
    throw new Error(`Forbidden backslash or NUL in ${label}: ${JSON.stringify(rawPath)}`);
  }
  for (let i = 0; i < rawPath.length; i++) {
    if (rawPath.charCodeAt(i) < 0x20) {
      throw new Error(`Control character in ${label}: ${JSON.stringify(rawPath)}`);
    }
  }
  if (rawPath.startsWith('/') || /^[a-zA-Z]:/.test(rawPath)) {
    throw new Error(`Absolute or drive-prefixed path rejected in ${label}: ${rawPath}`);
  }
  const trimmed = rawPath.replace(/\/+$/, '');
  if (!trimmed) return '';
  const parts = trimmed.split('/');
  for (const seg of parts) {
    if (!seg || seg === '.' || seg === '..') {
      throw new Error(`Unsafe path traversal or empty segment rejected in ${label}: ${rawPath}`);
    }
  }
  const normalized = parts.join('/');
  if (
    /(^|\/)\.env(\.|$)/i.test(normalized) ||
    normalized === 'node_modules' ||
    normalized.startsWith('node_modules/') ||
    normalized === '.github' ||
    normalized.startsWith('.github/') ||
    normalized === 'tests' ||
    normalized.startsWith('tests/') ||
    normalized.includes('debug-admin.') ||
    normalized.includes('dev-server.cjs')
  ) {
    throw new Error(`Forbidden file or directory in release archive: ${normalized}`);
  }
  return normalized;
}

function parsePaxRecords(buf) {
  const out = Object.create(null);
  let pos = 0;
  const text = buf.toString('utf8');
  while (pos < text.length) {
    const sp = text.indexOf(' ', pos);
    if (sp === -1) break;
    const len = parseInt(text.slice(pos, sp), 10);
    if (!Number.isInteger(len) || len <= 0) {
      throw new Error('Malformed PAX extended header length');
    }
    const rec = text.slice(sp + 1, pos + len);
    const stripped = rec.endsWith('\n') ? rec.slice(0, -1) : rec;
    const eq = stripped.indexOf('=');
    if (eq === -1) throw new Error('Malformed PAX key=value record');
    out[stripped.slice(0, eq)] = stripped.slice(eq + 1);
    pos += len;
  }
  return out;
}

function readCString(buf, start, end) {
  let i = start;
  while (i < end && buf[i] !== 0) i++;
  return buf.subarray(start, i).toString('utf8');
}

function readOctal(buf, start, end) {
  const s = readCString(buf, start, end).trim();
  if (!s) return 0;
  if (!/^[0-7]+$/.test(s)) {
    throw new Error(`Invalid octal field in tar header: ${JSON.stringify(s)}`);
  }
  return parseInt(s, 8);
}

function parseAndValidateTarball(tarGzFile, expectedSha256) {
  const gzBytes = fs.readFileSync(tarGzFile);
  const actualSha256 = crypto.createHash('sha256').update(gzBytes).digest('hex');
  if (!/^[0-9a-f]{64}$/.test(expectedSha256) || actualSha256 !== expectedSha256) {
    throw new Error(`SHA-256 mismatch: expected ${expectedSha256}, got ${actualSha256}`);
  }

  const tarBytes = zlib.gunzipSync(gzBytes);
  if (tarBytes.length === 0 || tarBytes.length % 512 !== 0) {
    throw new Error(`Malformed tar stream length: ${tarBytes.length}`);
  }

  const fileHashes = new Map();
  let offset = 0;
  let pendingPax = null;
  let pendingLongName = null;

  while (offset < tarBytes.length) {
    const hdr = tarBytes.subarray(offset, offset + 512);
    offset += 512;

    let allZero = true;
    for (let i = 0; i < 512; i++) {
      if (hdr[i] !== 0) {
        allZero = false;
        break;
      }
    }
    if (allZero) continue;

    // Verify ustar header checksum
    const recordedChksum = readOctal(hdr, 148, 156);
    let unsignedSum = 0;
    for (let i = 0; i < 512; i++) {
      unsignedSum += i >= 148 && i < 156 ? 32 : hdr[i];
    }
    if (unsignedSum !== recordedChksum) {
      throw new Error(`Tar header checksum mismatch at offset ${offset - 512}`);
    }

    const typeChar = hdr[156] === 0 ? '0' : String.fromCharCode(hdr[156]);
    const nameField = readCString(hdr, 0, 100);
    const prefixField = readCString(hdr, 345, 500);
    const linkField = readCString(hdr, 157, 257);
    let size = readOctal(hdr, 124, 136);
    if (pendingPax && pendingPax.size !== undefined) {
      size = Number(pendingPax.size);
      if (!Number.isInteger(size) || size < 0) throw new Error('Invalid PAX size');
    }

    const dataEnd = offset + size;
    const paddedBlocks = Math.ceil(size / 512) * 512;
    if (offset + paddedBlocks > tarBytes.length) {
      throw new Error('Truncated tar entry payload');
    }
    const payload = tarBytes.subarray(offset, dataEnd);
    offset += paddedBlocks;

    if (typeChar === 'x') {
      pendingPax = parsePaxRecords(payload);
      if (pendingPax.linkpath) {
        throw new Error(`PAX linkpath forbidden in release archive: ${pendingPax.linkpath}`);
      }
      continue;
    }

    if (typeChar === 'L') {
      pendingLongName = readCString(payload, 0, payload.length);
      continue;
    }

    if (typeChar === 'g') {
      // git archive writes a 52-byte global PAX comment header containing only `comment=<40-hex-sha>`
      const gpax = parsePaxRecords(payload);
      const gkeys = Object.keys(gpax);
      if (gkeys.some(k => k !== 'comment')) {
        throw new Error(`Forbidden global PAX header keys in archive: ${gkeys.join(',')}`);
      }
      continue;
    }

    if (typeChar !== '0' && typeChar !== '5') {
      throw new Error(
        `Unsafe tar entry type '${typeChar}' (links, devices, and FIFOs are forbidden; linkname=${JSON.stringify(linkField)})`
      );
    }

    if (linkField) {
      throw new Error(`Unexpected non-empty linkname on entry: ${linkField}`);
    }

    let rawEntryPath = prefixField ? `${prefixField}/${nameField}` : nameField;
    if (pendingLongName !== null) rawEntryPath = pendingLongName;
    if (pendingPax && pendingPax.path !== undefined) rawEntryPath = pendingPax.path;

    pendingPax = null;
    pendingLongName = null;

    const cleanPath = validateRelativeMemberPath(rawEntryPath, 'tar member');
    if (!cleanPath) continue;

    if (typeChar === '0') {
      if (fileHashes.has(cleanPath)) {
        throw new Error(`Duplicate file entry in tar archive: ${cleanPath}`);
      }
      const fileSha = crypto.createHash('sha256').update(payload).digest('hex');
      fileHashes.set(cleanPath, fileSha);
    }
  }

  for (const reqFile of [
    'package.json',
    'package-lock.json',
    'server/index.js',
    'server/app.js',
    'public/index.html',
    'public/manifest.json',
    'scripts/run-migrations.cjs',
    'scripts/run-pager-worker.cjs'
  ]) {
    if (!fileHashes.has(reqFile)) {
      throw new Error(`Archive is missing required runtime file: ${reqFile}`);
    }
  }

  return { actualSha256, fileHashes };
}

function verifyDirectoryAgainstMap(dirPath, fileHashes, requireNodeModules) {
  const rootStat = fs.lstatSync(dirPath);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new Error(`Release path is not a real directory: ${dirPath}`);
  }

  // 1. Every archived file must exist as a regular non-symlink file with exact matching SHA-256
  for (const [rel, expectedFileSha] of fileHashes.entries()) {
    const full = path.join(dirPath, ...rel.split('/'));
    let st;
    try {
      st = fs.lstatSync(full);
    } catch {
      throw new Error(`Missing expected file in release directory: ${rel}`);
    }
    if (!st.isFile() || st.isSymbolicLink()) {
      throw new Error(`Expected regular non-symlink file in release directory: ${rel}`);
    }
    const actualFileSha = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');
    if (actualFileSha !== expectedFileSha) {
      throw new Error(`Content hash mismatch in existing release directory for ${rel}`);
    }
  }

  // 2. Walk release directory to reject unexpected extra files, `.env*`, or debug controls
  function walk(curr, relPrefix) {
    for (const ent of fs.readdirSync(curr, { withFileTypes: true })) {
      const rel = relPrefix ? `${relPrefix}/${ent.name}` : ent.name;
      const full = path.join(curr, ent.name);
      const lst = fs.lstatSync(full);

      if (
        /(^|\/)\.env(\.|$)/i.test(rel) ||
        rel.includes('debug-admin.') ||
        rel.includes('dev-server.cjs')
      ) {
        throw new Error(`Forbidden file found inside release directory: ${rel}`);
      }

      if (rel === 'node_modules') {
        continue;
      }
      if (rel === '.release-manifest.json') {
        continue;
      }

      if (lst.isSymbolicLink()) {
        throw new Error(`Unexpected symlink in release directory outside node_modules: ${rel}`);
      }
      if (lst.isDirectory()) {
        walk(full, rel);
      } else if (lst.isFile()) {
        if (!fileHashes.has(rel)) {
          throw new Error(`Unexpected extra file in release directory: ${rel}`);
        }
      } else {
        throw new Error(`Unsupported filesystem entry in release directory: ${rel}`);
      }
    }
  }
  walk(dirPath, '');

  if (requireNodeModules) {
    for (const modPkg of [
      path.join(dirPath, 'node_modules', 'pg', 'package.json'),
      path.join(dirPath, 'node_modules', '@biteshark/runtime-adapter', 'package.json')
    ]) {
      if (!fs.existsSync(modPkg)) {
        throw new Error(`Existing release directory is missing installed dependency: ${modPkg}`);
      }
    }
  }
}

if (mode === 'inspect-tar') {
  const res = parseAndValidateTarball(tarballPath, expectedHash);
  console.log(JSON.stringify({ ok: true, tarball_sha256: res.actualSha256, verified_files: res.fileHashes.size }));
} else if (mode === 'verify-extracted-stage') {
  const res = parseAndValidateTarball(tarballPath, expectedHash);
  verifyDirectoryAgainstMap(targetDir, res.fileHashes, false);
  fs.writeFileSync(
    path.join(targetDir, '.release-manifest.json'),
    JSON.stringify({ tarball_sha256: res.actualSha256, verified_files: res.fileHashes.size }, null, 2) + '\n',
    'utf8'
  );
  console.log(JSON.stringify({ ok: true, stage_verified_files: res.fileHashes.size }));
} else if (mode === 'verify-existing-dir') {
  const res = parseAndValidateTarball(tarballPath, expectedHash);
  verifyDirectoryAgainstMap(targetDir, res.fileHashes, true);
  console.log(JSON.stringify({ ok: true, reused_verified_files: res.fileHashes.size }));
} else if (mode === 'verify-rollback-dir') {
  const rootStat = fs.lstatSync(targetDir);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new Error(`Rollback target is not a real directory: ${targetDir}`);
  }
  for (const req of [
    'package.json',
    'server/index.js',
    'server/app.js',
    'public/index.html',
    'scripts/run-pager-worker.cjs',
    'node_modules/pg/package.json'
  ]) {
    if (!fs.existsSync(path.join(targetDir, ...req.split('/')))) {
      throw new Error(`Rollback target directory is incomplete (missing ${req})`);
    }
  }
  // Older immutable VPS releases used the former local adapter package name.
  const hasAdapter = ['@biteshark/runtime-adapter', 'hatchable'].some(name =>
    fs.existsSync(path.join(targetDir, 'node_modules', name, 'package.json')));
  if (!hasAdapter) throw new Error('Rollback target is missing its runtime adapter');
  for (const ent of fs.readdirSync(targetDir)) {
    if (/^\.env(\.|$)/i.test(ent)) {
      throw new Error(`Forbidden .env file inside rollback directory: ${ent}`);
    }
  }
  console.log(JSON.stringify({ ok: true, rollback_dir_verified: true }));
} else {
  throw new Error(`Unknown mode: ${mode}`);
}
NODE
}

# ============================================================================
# Sanitized Diagnostic Evidence Collector (Strips Credentials, Tokens & Secrets)
# ============================================================================
capture_sanitized_diagnostics() {
  local context_label="$1"
  local raw_diag=""
  local api_show=""
  local wrk_show=""
  local j_out=""

  api_show="$(${SYSTEMCTL_CMD} show -p Id,ActiveState,SubState,MainPID,ExecMainCode,ExecMainStatus,Result "${API_SERVICE_UNIT}" 2>&1 || true)"
  if [[ -n "${WORKER_SERVICE_UNIT}" && "${WORKER_SERVICE_UNIT}" != "none" ]]; then
    wrk_show="$(${SYSTEMCTL_CMD} show -p Id,ActiveState,SubState,MainPID,ExecMainCode,ExecMainStatus,Result "${WORKER_SERVICE_UNIT}" 2>&1 || true)"
    j_out="$(${JOURNALCTL_CMD} -u "${API_SERVICE_UNIT}" -u "${WORKER_SERVICE_UNIT}" -n 20 --no-pager 2>&1 || true)"
  else
    wrk_show="disabled_or_omitted"
    j_out="$(${JOURNALCTL_CMD} -u "${API_SERVICE_UNIT}" -n 20 --no-pager 2>&1 || true)"
  fi

  raw_diag="$(printf '=== api ===\n%s\n=== worker ===\n%s\n=== journal ===\n%s\n' "${api_show}" "${wrk_show}" "${j_out}")"

  "${NODE_EXE}" - "${context_label}" "${raw_diag}" <<'NODE' >&2
const [label, raw] = process.argv.slice(2);
const redacted = String(raw || '')
  .replace(/postgres(?:ql)?:\/\/[^\s"'`]+/gi, 'postgres://[REDACTED_DB_URL]')
  .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED_TOKEN]')
  .replace(/((?:SECRET|TOKEN|PASSWORD|PASSPHRASE|API_KEY|PRIVATE_KEY|COOKIE)[A-Z0-9_]*\s*[:=]\s*)([^\s,"']+)/gi, '$1[REDACTED]')
  .replace(/(__Host-truckly_session=)[^;\s"']+/gi, '$1[REDACTED]')
  .slice(0, 2400);
console.error(JSON.stringify({
  level: 'warn',
  event: 'sanitized_service_diagnostics',
  context: label,
  diagnostics: redacted
}));
NODE
}

# ============================================================================
# Phase 1: Prepare & Validate Release Directory + Migrations (Pre-Activation)
# ============================================================================
PREV_REAL="$(resolve_link_target "${CURRENT_LINK}")"
PREV_SHA=""
if [[ -n "${PREV_REAL}" ]]; then
  PREV_SHA="$(basename "${PREV_REAL}")"
fi

RELEASE_DIR="${RELEASES_DIR}/${TARGET_SHA}"
MIGRATIONS_NEWLY_APPLIED=0

if [[ "${ROLLBACK_MODE}" -eq 0 ]]; then
  if [[ -z "${TARBALL_PATH}" || ! -f "${TARBALL_PATH}" ]]; then
    echo '{"level":"fatal","event":"missing_tarball","message":"--tarball <file.tar.gz> is required and must exist."}' >&2
    exit 2
  fi

  FILE_HASH=""
  if [[ -n "${SHA256_FILE}" ]]; then
    if [[ ! -f "${SHA256_FILE}" ]]; then
      echo "{\"level\":\"fatal\",\"event\":\"missing_sha256_file\",\"path\":\"${SHA256_FILE}\"}" >&2
      exit 2
    fi
    FILE_HASH="$(awk '{print $1}' "${SHA256_FILE}" | head -n 1 | tr 'A-F' 'a-f' | tr -d '\r')"
  fi

  NORM_EXPECTED=""
  if [[ -n "${EXPECTED_SHA256}" ]]; then
    NORM_EXPECTED="$(printf '%s' "${EXPECTED_SHA256}" | tr 'A-F' 'a-f' | tr -d ' \t\r\n')"
  fi

  if [[ -n "${NORM_EXPECTED}" && -n "${FILE_HASH}" && "${NORM_EXPECTED}" != "${FILE_HASH}" ]]; then
    echo '{"level":"fatal","event":"expected_vs_file_sha256_conflict"}' >&2
    exit 1
  fi

  TRUSTED_HASH="${NORM_EXPECTED:-${FILE_HASH}}"
  if [[ ! "${TRUSTED_HASH}" =~ ^[0-9a-f]{64}$ ]]; then
    echo '{"level":"fatal","event":"missing_expected_sha256","message":"Provide --expected-sha256 <64-hex> (recommended) or --sha256-file <path>."}' >&2
    exit 2
  fi

  # 1a. Inspect tarball checksum & every 512-byte tar member header BEFORE extracting anything
  if ! verify_archive_or_dir "inspect-tar" "$(to_node_path "${TARBALL_PATH}")" "${TRUSTED_HASH}" ""; then
    echo "{\"level\":\"fatal\",\"event\":\"archive_validation_failed\",\"sha\":\"${TARGET_SHA}\"}" >&2
    exit 1
  fi
  echo "{\"level\":\"info\",\"event\":\"archive_verified_safe\",\"sha\":\"${TARGET_SHA}\",\"tarball_sha256\":\"${TRUSTED_HASH}\"}"

  mkdir -p "${RELEASES_DIR}"

  # 1b. Verify existing release directory byte-for-byte OR extract & install clean release directory
  if [[ -e "${RELEASE_DIR}" || -L "${RELEASE_DIR}" ]]; then
    if ! verify_archive_or_dir "verify-existing-dir" "$(to_node_path "${TARBALL_PATH}")" "${TRUSTED_HASH}" "$(to_node_path "${RELEASE_DIR}")"; then
      echo "{\"level\":\"fatal\",\"event\":\"existing_release_dir_integrity_failed\",\"release_dir\":\"${RELEASE_DIR}\"}" >&2
      exit 1
    fi
    echo "{\"level\":\"info\",\"event\":\"existing_release_dir_verified\",\"release_dir\":\"${RELEASE_DIR}\"}"
  else
    STAGE_TMP="${RELEASES_DIR}/.staging-${TARGET_SHA}-$$"
    rm -rf "${STAGE_TMP}"
    mkdir -p "${STAGE_TMP}"
    chmod 0755 "${STAGE_TMP}"
    if [[ -n "${UNPRIV_BUILD_USER}" && "${IS_WINDOWS_BASH}" -eq 0 && "$(id -u)" -eq 0 ]]; then
      chown "${UNPRIV_BUILD_USER}:${UNPRIV_BUILD_USER}" "${STAGE_TMP}"
      runuser -u "${UNPRIV_BUILD_USER}" -- tar -xzf "${TARBALL_PATH}" -C "${STAGE_TMP}" --no-same-owner --no-same-permissions
    else
      tar -xzf "${TARBALL_PATH}" -C "${STAGE_TMP}" --no-same-owner --no-same-permissions
    fi

    if ! verify_archive_or_dir "verify-extracted-stage" "$(to_node_path "${TARBALL_PATH}")" "${TRUSTED_HASH}" "$(to_node_path "${STAGE_TMP}")"; then
      rm -rf "${STAGE_TMP}"
      echo "{\"level\":\"fatal\",\"event\":\"extracted_stage_verification_failed\",\"sha\":\"${TARGET_SHA}\"}" >&2
      exit 1
    fi

    if [[ -n "${BITESHARK_NPM_CI_CMD:-}" ]]; then
      (
        cd "${STAGE_TMP}"
        eval "${BITESHARK_NPM_CI_CMD}"
      )
    else
      if [[ ! -x "${NPM_EXE}" && ! -f "${NPM_EXE}" ]]; then
        echo "{\"level\":\"fatal\",\"event\":\"missing_npm_binary\",\"npm_exe\":\"${NPM_EXE}\"}" >&2
        exit 1
      fi
      if [[ -n "${UNPRIV_BUILD_USER}" && "${IS_WINDOWS_BASH}" -eq 0 && "$(id -u)" -eq 0 ]]; then
        NPM_CACHE_TMP="${STAGE_TMP}/.npm-cache-tmp"
        mkdir -p "${NPM_CACHE_TMP}"
        chown "${UNPRIV_BUILD_USER}:${UNPRIV_BUILD_USER}" "${NPM_CACHE_TMP}"
        runuser -u "${UNPRIV_BUILD_USER}" -- env HOME="${NPM_CACHE_TMP}" npm_config_cache="${NPM_CACHE_TMP}" PATH="${NODE_BIN_DIR}:/usr/bin:/bin" "${NPM_EXE}" ci --omit=dev --ignore-scripts --no-audit --no-fund --prefix "${STAGE_TMP}"
        rm -rf "${NPM_CACHE_TMP}"
      else
        (
          cd "${STAGE_TMP}"
          "${NPM_EXE}" ci --omit=dev --ignore-scripts --no-audit --no-fund
        )
      fi
    fi

    if [[ "${IS_WINDOWS_BASH}" -eq 0 ]]; then
      # Verify no symlink inside STAGE_TMP resolves outside STAGE_TMP before root locks ownership
      "${NODE_EXE}" - "${STAGE_TMP}" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const rootReal = fs.realpathSync(process.argv[2]);
function walkSafe(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    const lst = fs.lstatSync(full);
    if (lst.isSymbolicLink()) {
      const targetReal = fs.realpathSync(full);
      if (targetReal !== rootReal && !targetReal.startsWith(rootReal + path.sep)) {
        throw new Error(`Symlink escapes release stage directory: ${full} -> ${targetReal}`);
      }
    } else if (lst.isDirectory()) {
      walkSafe(full);
    } else if (!lst.isFile()) {
      throw new Error(`Unsupported special file in release stage: ${full}`);
    }
  }
}
walkSafe(rootReal);
NODE
      if [[ "$(id -u)" -eq 0 ]]; then
        chown -hR root:root "${STAGE_TMP}"
      fi
      find "${STAGE_TMP}" -type d -exec chmod 0755 {} +
      find "${STAGE_TMP}" -type f -perm /0111 -exec chmod 0755 {} +
      find "${STAGE_TMP}" -type f ! -perm /0111 -exec chmod 0644 {} +
    fi

    mv "${STAGE_TMP}" "${RELEASE_DIR}"
    STAGE_TMP=""
    echo "{\"level\":\"info\",\"event\":\"release_dir_installed\",\"release_dir\":\"${RELEASE_DIR}\"}"
  fi

  # 1c. Verify `migrator.env` protection and run idempotent SQL migrations BEFORE switching traffic
  if [[ ! -f "${MIGRATOR_ENV}" ]]; then
    echo "{\"level\":\"fatal\",\"event\":\"missing_migrator_env\",\"path\":\"${MIGRATOR_ENV}\"}" >&2
    exit 1
  fi
  "${NODE_EXE}" - "$(to_node_path "${MIGRATOR_ENV}")" "${IS_WINDOWS_BASH}" <<'NODE'
const fs = require('node:fs');
const [p, isWin] = process.argv.slice(2);
const st = fs.lstatSync(p);
if (!st.isFile() || st.isSymbolicLink()) process.exit(1);
if (isWin !== '1' && ((st.mode & 0o007) !== 0 || (st.mode & 0o020) !== 0)) {
  console.error(JSON.stringify({ level: 'fatal', event: 'migrator_env_unsafe_mode', mode: (st.mode & 0o777).toString(8) }));
  process.exit(1);
}
NODE

  if [[ -n "${UNPRIV_MIGRATE_USER}" && "${IS_WINDOWS_BASH}" -eq 0 && "$(id -u)" -eq 0 ]]; then
    MIG_OUT="$(
      runuser -u "${UNPRIV_MIGRATE_USER}" -- bash -c '
        set -euo pipefail
        set -a
        source "$1"
        set +a
        cd "$2"
        exec "$3" scripts/run-migrations.cjs --app-role "$4"
      ' _ "${MIGRATOR_ENV}" "${RELEASE_DIR}" "${NODE_EXE}" "${APP_DB_ROLE}"
    )"
  else
    MIG_OUT="$(
      set -a
      # shellcheck disable=SC1090
      source "${MIGRATOR_ENV}"
      set +a
      cd "${RELEASE_DIR}"
      "${NODE_EXE}" scripts/run-migrations.cjs --app-role "${APP_DB_ROLE}"
    )"
  fi
  echo "${MIG_OUT}"
  MIGRATIONS_NEWLY_APPLIED="$("${NODE_EXE}" - "${MIG_OUT}" <<'NODE'
const lines = String(process.argv[2] || '').trim().split(/\r?\n/);
let newly = 0;
for (const l of lines) {
  try {
    const obj = JSON.parse(l);
    if (obj && obj.event === 'migrations_complete' && Number.isInteger(obj.newly_applied)) {
      newly = obj.newly_applied;
    }
  } catch {}
}
process.stdout.write(String(newly));
NODE
)"
else
  if [[ ! -e "${RELEASE_DIR}" ]]; then
    echo "{\"level\":\"fatal\",\"event\":\"rollback_target_missing\",\"release_dir\":\"${RELEASE_DIR}\"}" >&2
    exit 1
  fi
  if ! verify_archive_or_dir "verify-rollback-dir" "" "" "$(to_node_path "${RELEASE_DIR}")"; then
    echo "{\"level\":\"fatal\",\"event\":\"rollback_target_integrity_failed\",\"release_dir\":\"${RELEASE_DIR}\"}" >&2
    exit 1
  fi
fi

# ============================================================================
# Phase 2: Pre-Activation Snapshot (Co-Tenants, Previous Release & Protected Env)
# ============================================================================
RELEASE_DIR_REAL="$(resolve_link_target "${RELEASE_DIR}")"

declare -a ACTIVE_COTENANT_UNITS=()
for unit in ${COTENANT_UNITS}; do
  if ${SYSTEMCTL_CMD} is-active --quiet "${unit}" 2>/dev/null; then
    ACTIVE_COTENANT_UNITS+=("${unit}")
  fi
done

BASELINE_COTENANT_HTTP=""
if [[ -n "${COTENANT_HTTP_URL}" && "${COTENANT_HTTP_URL}" != "none" ]]; then
  BASELINE_COTENANT_HTTP="$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "${COTENANT_HTTP_URL}" 2>/dev/null || echo "000")"
fi

ENV_BACKUP="${ETC_DIR}/.staging.env.rollback.$$"
(
  umask 077
  cp "${STAGING_ENV}" "${ENV_BACKUP}"
  chmod 0600 "${ENV_BACKUP}" 2>/dev/null || true
)

# ============================================================================
# Verification Helpers (API, Worker Identity, Co-Tenants, Public Staging & Holding)
# ============================================================================
verify_health_endpoint_for_sha() {
  local expected_sha="$1"
  local url="$2"
  local last_status="000"
  local last_body=""
  local attempt=1

  while [[ "${attempt}" -le "${HEALTH_MAX_ATTEMPTS}" ]]; do
    local tmp_body="${ETC_DIR}/.health-body.$$"
    last_status="$(curl -sS -o "${tmp_body}" -w '%{http_code}' --max-time 3 "${url}" 2>/dev/null || echo "000")"
    last_body="$(cat "${tmp_body}" 2>/dev/null || true)"
    rm -f "${tmp_body}" 2>/dev/null || true

    if [[ "${last_status}" == "200" ]]; then
      local check_res
      check_res="$("${NODE_EXE}" - "${last_body}" "${expected_sha}" <<'NODE'
try {
  const j = JSON.parse(process.argv[2]);
  const exp = process.argv[3];
  if (j && j.status === 'ok' && j.db === 'ready') {
    if (j.release_sha === exp) {
      process.stdout.write('MATCH');
    } else {
      process.stdout.write('WRONG_SHA:' + String(j.release_sha || 'unset'));
    }
  } else {
    process.stdout.write('NOT_READY');
  }
} catch {
  process.stdout.write('INVALID_JSON');
}
NODE
)"
      if [[ "${check_res}" == "MATCH" ]]; then
        return 0
      fi
      if [[ "${check_res}" == WRONG_SHA:* && "${attempt}" -ge 3 ]]; then
        VERIFICATION_DETAIL="wrong_release_sha (${check_res})"
        return 2
      fi
    fi

    if [[ "${attempt}" -lt "${HEALTH_MAX_ATTEMPTS}" ]]; then
      sleep "${HEALTH_SLEEP_SEC}"
    fi
    attempt=$((attempt + 1))
  done

  VERIFICATION_DETAIL="health_not_ready (http=${last_status})"
  return 1
}

verify_service_running_and_release_cwd() {
  local unit_name="$1"
  local expected_real_dir="$2"

  if ! ${SYSTEMCTL_CMD} is-active --quiet "${unit_name}" 2>/dev/null; then
    VERIFICATION_DETAIL="${unit_name}_not_active"
    return 1
  fi

  local props
  props="$(${SYSTEMCTL_CMD} show -p ActiveState,SubState,MainPID,WorkingDirectory "${unit_name}" 2>/dev/null || true)"
  local active_state sub_state main_pid work_dir
  active_state="$(printf '%s\n' "${props}" | awk -F= '$1=="ActiveState"{print $2}' | tr -d '\r')"
  sub_state="$(printf '%s\n' "${props}" | awk -F= '$1=="SubState"{print $2}' | tr -d '\r')"
  main_pid="$(printf '%s\n' "${props}" | awk -F= '$1=="MainPID"{print $2}' | tr -d '\r')"
  work_dir="$(printf '%s\n' "${props}" | awk -F= '$1=="WorkingDirectory"{print substr($0,18)}' | tr -d '\r')"

  if [[ "${active_state}" != "active" || "${sub_state}" != "running" || -z "${main_pid}" || "${main_pid}" == "0" ]]; then
    VERIFICATION_DETAIL="${unit_name}_bad_substate (ActiveState=${active_state},SubState=${sub_state},MainPID=${main_pid})"
    return 1
  fi

  # On Linux, inspect real `/proc/<pid>/cwd` to prove the live process resolved the expected release dir
  if [[ "${IS_WINDOWS_BASH}" -eq 0 && -e "/proc/${main_pid}/cwd" ]]; then
    local proc_cwd
    proc_cwd="$(readlink -f "/proc/${main_pid}/cwd" 2>/dev/null || true)"
    if [[ -n "${proc_cwd}" && "${proc_cwd}" != "${expected_real_dir}" ]]; then
      VERIFICATION_DETAIL="${unit_name}_cwd_mismatch (proc_cwd=${proc_cwd},expected=${expected_real_dir})"
      return 1
    fi
  elif [[ -n "${work_dir}" ]]; then
    local resolved_wd
    resolved_wd="$(resolve_link_target "${work_dir}")"
    if [[ -n "${resolved_wd}" && "${resolved_wd}" != "${expected_real_dir}" ]]; then
      VERIFICATION_DETAIL="${unit_name}_workdir_mismatch (resolved=${resolved_wd},expected=${expected_real_dir})"
      return 1
    fi
  fi

  return 0
}

# ============================================================================
# Phase 3: Guarded Activation & Whole-Deployment Verification
# ============================================================================
FAILED_PHASE=""
VERIFICATION_DETAIL=""

activate_and_verify_release() {
  FAILED_PHASE="env_update"
  if ! update_staging_env_release_sha "${TARGET_SHA}"; then
    VERIFICATION_DETAIL="staging_env_update_failed"
    return 1
  fi

  FAILED_PHASE="symlink_switch"
  if ! atomic_switch_current_link "${RELEASE_DIR}"; then
    VERIFICATION_DETAIL="current_symlink_switch_failed"
    return 1
  fi

  FAILED_PHASE="api_restart"
  if ! ${SYSTEMCTL_CMD} restart "${API_SERVICE_UNIT}"; then
    VERIFICATION_DETAIL="systemctl_restart_api_failed"
    return 1
  fi
  if ! ${SYSTEMCTL_CMD} is-active --quiet "${API_SERVICE_UNIT}"; then
    VERIFICATION_DETAIL="api_inactive_immediately_after_restart"
    return 1
  fi

  if [[ -n "${WORKER_SERVICE_UNIT}" && "${WORKER_SERVICE_UNIT}" != "none" ]]; then
    FAILED_PHASE="worker_restart"
    if ! ${SYSTEMCTL_CMD} restart "${WORKER_SERVICE_UNIT}"; then
      VERIFICATION_DETAIL="systemctl_restart_worker_failed"
      return 1
    fi
    if ! ${SYSTEMCTL_CMD} is-active --quiet "${WORKER_SERVICE_UNIT}"; then
      VERIFICATION_DETAIL="worker_inactive_immediately_after_restart"
      return 1
    fi
  fi

  FAILED_PHASE="verify_api_readiness"
  local health_rc=0
  verify_health_endpoint_for_sha "${TARGET_SHA}" "${HEALTH_URL}" || health_rc=$?
  if [[ "${health_rc}" -eq 2 ]]; then
    FAILED_PHASE="verify_api_release_sha"
    return 1
  elif [[ "${health_rc}" -ne 0 ]]; then
    return 1
  fi

  FAILED_PHASE="verify_api_process_identity"
  if ! verify_service_running_and_release_cwd "${API_SERVICE_UNIT}" "${RELEASE_DIR_REAL}"; then
    return 1
  fi

  if [[ -n "${WORKER_SERVICE_UNIT}" && "${WORKER_SERVICE_UNIT}" != "none" ]]; then
    FAILED_PHASE="verify_worker_active_and_identity"
    if [[ "${WORKER_SETTLE_SEC}" != "0" ]]; then
      sleep "${WORKER_SETTLE_SEC}"
    fi
    if ! verify_service_running_and_release_cwd "${WORKER_SERVICE_UNIT}" "${RELEASE_DIR_REAL}"; then
      return 1
    fi
  fi

  FAILED_PHASE="verify_cotenant_health"
  for unit in "${ACTIVE_COTENANT_UNITS[@]}"; do
    if ! ${SYSTEMCTL_CMD} is-active --quiet "${unit}" 2>/dev/null; then
      VERIFICATION_DETAIL="cotenant_unit_inactive (${unit})"
      return 1
    fi
  done
  if [[ -n "${COTENANT_HTTP_URL}" && "${COTENANT_HTTP_URL}" != "none" && "${BASELINE_COTENANT_HTTP}" != "000" ]]; then
    local post_cotenant_http
    post_cotenant_http="$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "${COTENANT_HTTP_URL}" 2>/dev/null || echo "000")"
    if [[ "${post_cotenant_http}" != "${BASELINE_COTENANT_HTTP}" ]]; then
      VERIFICATION_DETAIL="cotenant_http_changed (before=${BASELINE_COTENANT_HTTP},after=${post_cotenant_http})"
      return 1
    fi
  fi

  if [[ -n "${PUBLIC_STAGING_URL}" && "${PUBLIC_STAGING_URL}" != "none" ]]; then
    FAILED_PHASE="verify_public_staging_https"
    local pub_rc=0
    verify_health_endpoint_for_sha "${TARGET_SHA}" "${PUBLIC_STAGING_URL}/api/healthz" || pub_rc=$?
    if [[ "${pub_rc}" -ne 0 ]]; then
      return 1
    fi

    if [[ -f "${RELEASE_DIR}/public/icon-192.png" ]]; then
      local pub_html pub_manifest icon_code dbg_code
      pub_html="$(curl -fsS --max-time 5 "${PUBLIC_STAGING_URL}/" 2>/dev/null || true)"
      if [[ "${pub_html}" != *"BiteShark"* ]]; then
        VERIFICATION_DETAIL="public_staging_index_missing_biteshark"
        return 1
      fi
      pub_manifest="$(curl -fsS --max-time 5 "${PUBLIC_STAGING_URL}/manifest.json" 2>/dev/null || true)"
      if [[ "${pub_manifest}" != *'"short_name": "BiteShark"'* ]]; then
        VERIFICATION_DETAIL="public_staging_manifest_missing_biteshark"
        return 1
      fi
      icon_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "${PUBLIC_STAGING_URL}/icon-192.png" 2>/dev/null || echo "000")"
      if [[ "${icon_code}" != "200" ]]; then
        VERIFICATION_DETAIL="public_staging_icon_192_http_${icon_code}"
        return 1
      fi
      dbg_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "${PUBLIC_STAGING_URL}/debug-admin.js" 2>/dev/null || echo "000")"
      if [[ "${dbg_code}" != "404" ]]; then
        VERIFICATION_DETAIL="public_staging_debug_admin_not_404 (${dbg_code})"
        return 1
      fi
    else
      local legacy_root_code
      legacy_root_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "${PUBLIC_STAGING_URL}/" 2>/dev/null || echo "000")"
      if [[ "${legacy_root_code}" != "200" ]]; then
        VERIFICATION_DETAIL="public_staging_root_http_${legacy_root_code}"
        return 1
      fi
    fi
  fi

  if [[ -n "${PUBLIC_HOLDING_URL}" && "${PUBLIC_HOLDING_URL}" != "none" ]]; then
    FAILED_PHASE="verify_holding_page"
    local hold_html hold_api_code
    hold_html="$(curl -fsS --max-time 5 "${PUBLIC_HOLDING_URL}/" 2>/dev/null || true)"
    if [[ "${hold_html}" != *"BiteShark is coming soon."* ]]; then
      VERIFICATION_DETAIL="holding_page_unexpected_content"
      return 1
    fi
    hold_api_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "${PUBLIC_HOLDING_URL}/api/healthz" 2>/dev/null || echo "000")"
    if [[ "${hold_api_code}" != "404" ]]; then
      VERIFICATION_DETAIL="holding_page_exposed_api_healthz (${hold_api_code})"
      return 1
    fi
  fi

  FAILED_PHASE=""
  return 0
}

# ============================================================================
# Phase 4: Automatic Verified Rollback on Any Activation / Verification Failure
# ============================================================================
perform_verified_rollback() {
  local trigger_phase="$1"
  local trigger_detail="$2"
  local rb_start_ms
  rb_start_ms="$(now_epoch_ms)"

  capture_sanitized_diagnostics "activation_failure:${trigger_phase}"

  if [[ -z "${PREV_REAL}" || ! -d "${PREV_REAL}" ]]; then
    echo "{\"level\":\"critical\",\"event\":\"deploy_failed_no_previous_release\",\"failed_phase\":\"${trigger_phase}\",\"detail\":\"${trigger_detail}\",\"rollback_verified\":false}" >&2
    return 4
  fi

  local -a rb_errors=()

  if ! restore_staging_env_backup; then
    rb_errors+=("restore_staging_env_failed")
  fi

  if ! atomic_switch_current_link "${PREV_REAL}"; then
    rb_errors+=("restore_current_symlink_failed")
  fi

  if ! ${SYSTEMCTL_CMD} restart "${API_SERVICE_UNIT}"; then
    rb_errors+=("rollback_api_restart_failed")
  fi

  if [[ -n "${WORKER_SERVICE_UNIT}" && "${WORKER_SERVICE_UNIT}" != "none" ]]; then
    if ! ${SYSTEMCTL_CMD} restart "${WORKER_SERVICE_UNIT}"; then
      rb_errors+=("rollback_worker_restart_failed")
    fi
  fi

  if ! verify_health_endpoint_for_sha "${PREV_SHA}" "${HEALTH_URL}"; then
    rb_errors+=("rollback_api_health_failed:${VERIFICATION_DETAIL}")
  fi

  if ! verify_service_running_and_release_cwd "${API_SERVICE_UNIT}" "${PREV_REAL}"; then
    rb_errors+=("rollback_api_service_verify_failed:${VERIFICATION_DETAIL}")
  fi

  if [[ -n "${WORKER_SERVICE_UNIT}" && "${WORKER_SERVICE_UNIT}" != "none" ]]; then
    if [[ "${WORKER_SETTLE_SEC}" != "0" ]]; then
      sleep "${WORKER_SETTLE_SEC}"
    fi
    if ! verify_service_running_and_release_cwd "${WORKER_SERVICE_UNIT}" "${PREV_REAL}"; then
      rb_errors+=("rollback_worker_service_verify_failed:${VERIFICATION_DETAIL}")
    fi
  fi

  local rb_end_ms rb_duration_ms db_note
  rb_end_ms="$(now_epoch_ms)"
  rb_duration_ms=$((rb_end_ms - rb_start_ms))

  if [[ "${MIGRATIONS_NEWLY_APPLIED}" -gt 0 ]]; then
    db_note="WARNING: ${MIGRATIONS_NEWLY_APPLIED} SQL migration(s) were committed prior to rollback and are NOT reversed by symlink rollback."
  else
    db_note="0 SQL migrations were applied during this attempt; database schema was unchanged."
  fi

  if [[ "${#rb_errors[@]}" -gt 0 ]]; then
    capture_sanitized_diagnostics "rollback_recovery_failure"
    local joined_errs
    joined_errs="$(IFS=,; printf '%s' "${rb_errors[*]}")"
    echo "{\"level\":\"critical\",\"event\":\"deploy_and_rollback_failed\",\"failed_phase\":\"${trigger_phase}\",\"detail\":\"${trigger_detail}\",\"attempted_restore_sha\":\"${PREV_SHA}\",\"rollback_verified\":false,\"rollback_errors\":\"${joined_errs}\",\"rollback_duration_ms\":${rb_duration_ms},\"migrations_newly_applied\":${MIGRATIONS_NEWLY_APPLIED},\"db_rollback_note\":\"${db_note}\"}" >&2
    return 4
  fi

  echo "{\"level\":\"error\",\"event\":\"deploy_failed_rolled_back\",\"failed_phase\":\"${trigger_phase}\",\"detail\":\"${trigger_detail}\",\"restored_release_sha\":\"${PREV_SHA}\",\"rollback_verified\":true,\"rollback_duration_ms\":${rb_duration_ms},\"migrations_newly_applied\":${MIGRATIONS_NEWLY_APPLIED},\"db_rollback_note\":\"${db_note}\"}" >&2
  return 1
}

DEPLOY_START_MS="$(now_epoch_ms)"
ACTIVATION_RC=0
set +e
activate_and_verify_release
ACTIVATION_RC=$?
set -e

if [[ "${ACTIVATION_RC}" -ne 0 ]]; then
  RB_EXIT_CODE=0
  set +e
  perform_verified_rollback "${FAILED_PHASE}" "${VERIFICATION_DETAIL}"
  RB_EXIT_CODE=$?
  set -e
  exit "${RB_EXIT_CODE}"
fi

DEPLOY_END_MS="$(now_epoch_ms)"
DEPLOY_DURATION_MS=$((DEPLOY_END_MS - DEPLOY_START_MS))

echo "{\"level\":\"info\",\"event\":\"staging_release_active\",\"mode\":\"$( [[ "${ROLLBACK_MODE}" -eq 1 ]] && echo rollback || echo install )\",\"release_sha\":\"${TARGET_SHA}\",\"previous_release_sha\":\"${PREV_SHA}\",\"activation_duration_ms\":${DEPLOY_DURATION_MS},\"migrations_newly_applied\":${MIGRATIONS_NEWLY_APPLIED},\"db_rollback_note\":\"Application symlink/env activation only; SQL migrations are forward-only and separate from symlink rollback.\"}"
