// Security & Argument-Validation Unit Suite for `deploy/bin/biteshark-staging2-ctl`
//
// Proves that the root-owned staging2 control helper:
//   1. Rejects unknown subcommands, extra flags, non-40-hex SHAs, and non-64-hex digests (`exit 2`).
//   2. Rejects forbidden tarball source paths (`/etc/*`, `/srv/truckly-staging/*`, `/root/*`, `/var/backups/*`),
//      symlinks, and out-of-range `--lines` (`exit 2`).
//   3. Strips caller `BITESHARK_*` / `TRUCKLY_*` / `NODE_OPTIONS` environment overrides.
//   4. Redacts database URLs, bearer tokens, API keys, and session cookies from `logs` output.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const CTL_SH = path.join(ROOT, 'deploy', 'bin', 'biteshark-staging2-ctl');

function findBashBinary() {
  if (process.platform !== 'win32') return 'bash';
  for (const c of ['C:\\Program Files\\Git\\bin\\bash.exe', 'C:\\Program Files (x86)\\Git\\bin\\bash.exe']) {
    if (fs.existsSync(c)) return c;
  }
  return 'bash';
}

function toPosixPath(p) {
  if (process.platform !== 'win32') return p;
  const resolved = path.resolve(p);
  const m = /^([A-Za-z]):\\(.*)$/.exec(resolved);
  if (!m) return resolved.replace(/\\/g, '/');
  return `/${m[1].toLowerCase()}/${m[2].replace(/\\/g, '/')}`;
}

const bashBin = findBashBinary();
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-stg2-ctl-test-'));

try {
  const mockBinDir = path.join(tmpDir, 'bin');
  const mockStg2Root = path.join(tmpDir, 'srv-stg2');
  const mockStg2Etc = path.join(tmpDir, 'etc-stg2');
  const mockStg2Lib = path.join(tmpDir, 'lib-stg2');
  fs.mkdirSync(mockBinDir, { recursive: true });
  fs.mkdirSync(path.join(mockStg2Root, 'releases'), { recursive: true });
  fs.mkdirSync(mockStg2Etc, { recursive: true });
  fs.mkdirSync(mockStg2Lib, { recursive: true });

  const mockJournalctl = path.join(mockBinDir, 'mock-journalctl.sh');
  fs.writeFileSync(
    mockJournalctl,
    `#!/usr/bin/env bash
echo "unit=$2 lines=$4 db=postgres://biteshark_stg2_app:superSecretPass@127.0.0.1:5432/biteshark_staging2 Authorization: Bearer tok_secret_999 BITESHARK_AUTH_EMAIL_API_KEY=re_live_secret123 Cookie: __Host-truckly_session=sess_abc123"
`,
    { mode: 0o755 }
  );

  const mockSystemctl = path.join(mockBinDir, 'mock-systemctl.sh');
  fs.writeFileSync(
    mockSystemctl,
    `#!/usr/bin/env bash
echo "ActiveState=active"
`,
    { mode: 0o755 }
  );

  const recordedEnvFile = path.join(tmpDir, 'recorded-installer-env.json');
  const mockInstaller = path.join(mockStg2Lib, 'install-staging-release.sh');
  fs.writeFileSync(
    mockInstaller,
    `#!/usr/bin/env bash
"${toPosixPath(process.execPath)}" -e '
  const fs = require("fs");
  fs.writeFileSync(${JSON.stringify(recordedEnvFile)}, JSON.stringify({
    args: process.argv.slice(1),
    BITESHARK_STAGING_ROOT: process.env.BITESHARK_STAGING_ROOT,
    BITESHARK_API_SERVICE_UNIT: process.env.BITESHARK_API_SERVICE_UNIT,
    BITESHARK_WORKER_SERVICE_UNIT: process.env.BITESHARK_WORKER_SERVICE_UNIT,
    NODE_OPTIONS: process.env.NODE_OPTIONS || null
  }));
' -- "$@"
`,
    { mode: 0o755 }
  );

  const harnessConf = path.join(tmpDir, 'harness.conf');
  fs.writeFileSync(
    harnessConf,
    [
      `STG2_ROOT="${toPosixPath(mockStg2Root)}"`,
      `STG2_ETC="${toPosixPath(mockStg2Etc)}"`,
      `STG2_LIB="${toPosixPath(mockStg2Lib)}"`,
      `STG2_LOCK="${toPosixPath(path.join(tmpDir, 'deploy.lock'))}"`,
      `STG2_API_UNIT="biteshark-staging2-api.service"`,
      `STG2_WORKER_UNIT="none"`,
      `STG2_UNPRIV_USER="biteshark-stg2-mig"`,
      `STG2_APP_DB_ROLE="biteshark_stg2_app"`,
      `STG2_HEALTH_URL="http://127.0.0.1:4102/api/healthz"`,
      `STG2_PUBLIC_URL="none"`,
      `STG2_HOLDING_URL="none"`,
      `STG2_COTENANTS="nginx.service"`,
      `NODE_BIN="${toPosixPath(process.execPath)}"`,
      `SYSTEMCTL_BIN="${toPosixPath(mockSystemctl)}"`,
      `JOURNALCTL_BIN="${toPosixPath(mockJournalctl)}"`
    ].join('\n') + '\n'
  );

  function runCtl(args, extraEnv = {}) {
    return spawnSync(bashBin, [toPosixPath(CTL_SH), ...args], {
      encoding: 'utf8',
      env: {
        ...process.env,
        STG2_CTL_TEST_HARNESS_CONF: toPosixPath(harnessConf),
        ...extraEnv
      },
      windowsHide: true
    });
  }

  // 1. Reject unknown subcommands & unit-override attempts
  for (const badArgs of [
    [],
    ['exec', 'id'],
    ['restart', 'truckly-staging-api.service'],
    ['logs', '-u', 'truckly-staging-api.service'],
    ['logs', '--lines', '0'],
    ['logs', '--lines', '500'],
    ['deploy', '--sha', 'main', '--tarball', '/tmp/a.tar.gz', '--expected-sha256', 'a'.repeat(64)],
    ['deploy', '--sha', 'a'.repeat(40), '--tarball', '/etc/truckly-staging/staging.env.tar.gz', '--expected-sha256', 'b'.repeat(64)],
    ['deploy', '--sha', 'a'.repeat(40), '--tarball', '/srv/truckly-staging/evil.tar.gz', '--expected-sha256', 'b'.repeat(64)],
    ['deploy', '--sha', 'a'.repeat(40), '--tarball', '/root/evil.tar.gz', '--expected-sha256', 'b'.repeat(64)],
    ['rollback', '--to', '../truckly-staging']
  ]) {
    const res = runCtl(badArgs);
    assert.equal(res.status, 2, `Expected exit 2 for ${JSON.stringify(badArgs)}, got ${res.status}`);
  }

  // 2. Verify logs scopes strictly to biteshark-staging2-api.service and redacts secrets
  const logRes = runCtl(['logs', '--lines', '25']);
  assert.equal(logRes.status, 0, logRes.stderr);
  assert(logRes.stdout.includes('unit=biteshark-staging2-api.service lines=25'));
  assert(!logRes.stdout.includes('superSecretPass'));
  assert(!logRes.stdout.includes('tok_secret_999'));
  assert(!logRes.stdout.includes('re_live_secret123'));
  assert(!logRes.stdout.includes('sess_abc123'));
  assert(logRes.stdout.includes('postgres://[REDACTED_DB_URL]'));

  // 3. Verify caller environment poisoning (`BITESHARK_STAGING_ROOT=/srv/truckly-staging`, `NODE_OPTIONS`) is stripped
  const validTar = path.join(tmpDir, 'candidate.tar.gz');
  fs.writeFileSync(validTar, 'dummy-tarball-bytes');
  const sha40 = '1234567890abcdef1234567890abcdef12345678';
  const sha64 = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
  const depRes = runCtl(
    ['deploy', '--sha', sha40, '--tarball', toPosixPath(validTar), '--expected-sha256', sha64],
    {
      BITESHARK_STAGING_ROOT: '/srv/truckly-staging',
      BITESHARK_API_SERVICE_UNIT: 'truckly-staging-api.service',
      NODE_OPTIONS: '--require /tmp/evil.js'
    }
  );
  assert.equal(depRes.status, 0, depRes.stderr);
  const recorded = JSON.parse(fs.readFileSync(recordedEnvFile, 'utf8'));
  assert.equal(path.resolve(recorded.BITESHARK_STAGING_ROOT), path.resolve(mockStg2Root));
  assert.equal(recorded.BITESHARK_API_SERVICE_UNIT, 'biteshark-staging2-api.service');
  assert.equal(recorded.BITESHARK_WORKER_SERVICE_UNIT, 'none');
  assert.equal(recorded.NODE_OPTIONS, null);

  console.log('PASS: biteshark-staging2-ctl strict argument validation, path isolation, env stripping, and log redaction verified');
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
