// Disposable Service-Command & PostgreSQL Failure-Path Test Suite for `deploy/install-staging-release.sh`
//
// Exercises the real `deploy/install-staging-release.sh` bash installer in an isolated temporary
// directory (never touching `/srv`, `/etc`, systemd, or any live host) across all 12 scenarios:
//   [1/12] Push-not-disabled guard refuses live push mode during installation
//   [2/12] Checksum mismatch & expected-vs-file hash conflict rejected before extraction
//   [3/12] Pre-extraction tar header validator blocks `..` traversal, `/abs` paths, symlinks, hardlinks & `.env`/debug files
//   [4/12] Existing release directory with tampered or stray files rejected before activation
//   [5/12] Concurrent deployment invocations serialized via lock (`exit 3` `deploy_lock_busy`)
//   [6/12] API restart failure triggers verified rollback + secret-redacted diagnostics (`exit 1`)
//   [7/12] Worker restart failure & post-start worker crash trigger verified rollback (`exit 1`)
//   [8/12] API readiness (`503`) failure triggers verified rollback (`exit 1`)
//   [9/12] Wrong `release_sha` & co-tenant/holding-page regressions trigger verified rollback (`exit 1`)
//   [10/12] Failed rollback recovery is clearly reported (`exit 4`, `rollback_verified: false`), never masked
//   [11/12] Clean successful install + byte-verified existing-directory reuse (`exit 0`, `0640`/`0600` modes intact)
//   [12/12] Explicit `--rollback-to <prev_sha>` restores previous release & verifies whole deployment (`exit 0`)

const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const zlib = require('node:zlib');
const http = require('node:http');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const INSTALLER_SH = path.join(ROOT, 'deploy', 'install-staging-release.sh');

function findBashBinary() {
  if (process.platform !== 'win32') return 'bash';
  const candidates = [
    'C:\\Program Files\\Git\\bin\\bash.exe',
    'C:\\Program Files (x86)\\Git\\bin\\bash.exe'
  ];
  for (const c of candidates) {
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

function requirePg() {
  try {
    return require('pg');
  } catch {
    const extra = process.env.BITESHARK_PG_NODE_MODULES || process.env.TRUCKLY_PG_NODE_MODULES;
    if (extra) return require(path.join(extra, 'pg'));
    throw new Error('Missing `pg` package. Run `npm ci` first.');
  }
}

async function createPostgresCluster() {
  if (process.env.DATABASE_URL) {
    return { adminUrl: process.env.DATABASE_URL, stop: async () => {} };
  }
  const binSuffix = process.platform === 'win32' ? '.exe' : '';
  const pkgPlatform = `${process.platform === 'win32' ? 'windows' : process.platform}-${process.arch}`;
  const searchBases = [
    process.env.BITESHARK_PG_NODE_MODULES,
    process.env.TRUCKLY_PG_NODE_MODULES,
    path.join(ROOT, 'node_modules')
  ].filter(Boolean);

  let pgNativeBase = null;
  for (const base of searchBases) {
    const candidate = path.join(base, `@embedded-postgres/${pkgPlatform}`, 'native', 'bin');
    if (fs.existsSync(path.join(candidate, `initdb${binSuffix}`))) {
      pgNativeBase = candidate;
      break;
    }
  }
  if (!pgNativeBase) {
    throw new Error('Set DATABASE_URL or provide @embedded-postgres binaries.');
  }

  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-deploy-pg-'));
  const port = await getFreePort();
  const initdb = path.join(pgNativeBase, `initdb${binSuffix}`);
  const pgCtl = path.join(pgNativeBase, `pg_ctl${binSuffix}`);

  execFileSync(initdb, ['-D', dataDir, '-U', 'postgres', '-A', 'trust', '-E', 'UTF8', '--no-locale'], {
    stdio: 'ignore',
    windowsHide: true
  });
  execFileSync(pgCtl, ['-D', dataDir, '-o', `-p ${port} -h 127.0.0.1 -k ""`, '-w', 'start'], {
    stdio: 'ignore',
    windowsHide: true
  });

  return {
    adminUrl: `postgres://postgres@127.0.0.1:${port}/postgres`,
    stop: async () => {
      try {
        execFileSync(pgCtl, ['-D', dataDir, '-m', 'immediate', '-w', 'stop'], {
          stdio: 'ignore',
          windowsHide: true
        });
      } catch {}
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  };
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(err => (err ? reject(err) : resolve(port)));
    });
    srv.on('error', reject);
  });
}

// Deterministic minimal ustar `.tar.gz` crafter for testing malicious archive members (`..`, `/abs`, symlinks, hardlinks)
function buildCraftedTarGz(entries) {
  const blocks = [];
  for (const ent of entries) {
    const data = ent.content ? Buffer.from(ent.content, 'utf8') : Buffer.alloc(0);
    const hdr = Buffer.alloc(512, 0);
    Buffer.from(ent.name, 'utf8').copy(hdr, 0, 0, 100);
    Buffer.from('0000644\0', 'ascii').copy(hdr, 100);
    Buffer.from('0000000\0', 'ascii').copy(hdr, 108);
    Buffer.from('0000000\0', 'ascii').copy(hdr, 116);
    const sizeOct = (ent.type === '0' || !ent.type ? data.length : 0).toString(8).padStart(11, '0') + '\0';
    Buffer.from(sizeOct, 'ascii').copy(hdr, 124);
    Buffer.from('14712345670\0', 'ascii').copy(hdr, 136);
    Buffer.from('        ', 'ascii').copy(hdr, 148);
    hdr[156] = (ent.type || '0').charCodeAt(0);
    if (ent.linkname) {
      Buffer.from(ent.linkname, 'utf8').copy(hdr, 157, 0, 100);
    }
    Buffer.from('ustar\0', 'ascii').copy(hdr, 257);
    Buffer.from('00', 'ascii').copy(hdr, 263);

    let sum = 0;
    for (let i = 0; i < 512; i++) sum += hdr[i];
    const chk = sum.toString(8).padStart(6, '0') + '\0 ';
    Buffer.from(chk, 'ascii').copy(hdr, 148);
    blocks.push(hdr);

    if ((ent.type === '0' || !ent.type) && data.length > 0) {
      blocks.push(data);
      const rem = data.length % 512;
      if (rem !== 0) blocks.push(Buffer.alloc(512 - rem, 0));
    }
  }
  blocks.push(Buffer.alloc(1024, 0));
  const gz = zlib.gzipSync(Buffer.concat(blocks));
  const sha256 = crypto.createHash('sha256').update(gz).digest('hex');
  return { gz, sha256 };
}

function runInstaller(bashBin, args, envOverrides = {}) {
  return new Promise(resolve => {
    const child = spawn(bashBin, [toPosixPath(INSTALLER_SH), ...args], {
      cwd: ROOT,
      env: { ...process.env, ...envOverrides },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => {
      stdout += d.toString('utf8');
    });
    child.stderr.on('data', d => {
      stderr += d.toString('utf8');
    });
    child.on('close', code => {
      resolve({ code, stdout, stderr });
    });
  });
}

(async () => {
  const bashBin = findBashBinary();
  const { Pool } = requirePg();
  const pgCluster = await createPostgresCluster();
  const adminPool = new Pool({ connectionString: pgCluster.adminUrl, max: 3 });

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-install-harness-'));
  const srvRoot = path.join(tmpRoot, 'srv-staging');
  const releasesDir = path.join(srvRoot, 'releases');
  const currentLink = path.join(srvRoot, 'current');
  const etcDir = path.join(tmpRoot, 'etc-staging');
  const lockFile = path.join(tmpRoot, 'lock', 'deploy.lock');
  const binDir = path.join(tmpRoot, 'mock-bin');
  const stateDir = path.join(tmpRoot, 'svc-state');
  const artDir = path.join(tmpRoot, 'artifacts');

  fs.mkdirSync(releasesDir, { recursive: true });
  fs.mkdirSync(etcDir, { recursive: true });
  fs.mkdirSync(binDir, { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true });
  fs.mkdirSync(artDir, { recursive: true });

  const spawnedServicePids = new Set();
  let mockHttpServer = null;

  const suffix = crypto.randomBytes(4).toString('hex');
  const migRole = `bs_inst_mig_${suffix}`;
  const appRole = `bs_inst_app_${suffix}`;
  const dbName = `bs_inst_db_${suffix}`;
  const secretDbPass = `DO_NOT_LEAK_DB_PW_${suffix}`;
  const secretAuthHmac = `DO_NOT_LEAK_AUTH_SECRET_${crypto.randomBytes(20).toString('hex')}`;
  const secretWorkerBearer = `DO_NOT_LEAK_WORKER_SECRET_${crypto.randomBytes(16).toString('hex')}`;

  try {
    // 1. Provision disposable PostgreSQL database + migrator/app roles and pre-apply 001..017
    await adminPool.query(
      `CREATE ROLE ${migRole} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD '${secretDbPass}'`
    );
    await adminPool.query(
      `CREATE ROLE ${appRole} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD '${secretDbPass}'`
    );
    await adminPool.query(`CREATE DATABASE ${dbName} OWNER ${migRole}`);

    const migUrl = (() => {
      const u = new URL(pgCluster.adminUrl);
      u.username = migRole;
      u.password = secretDbPass;
      u.pathname = '/' + dbName;
      return u.toString();
    })();
    const appUrl = (() => {
      const u = new URL(pgCluster.adminUrl);
      u.username = appRole;
      u.password = secretDbPass;
      u.pathname = '/' + dbName;
      return u.toString();
    })();

    execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'run-migrations.cjs'), '--app-role', appRole], {
      cwd: ROOT,
      env: { ...process.env, MIGRATION_DATABASE_URL: migUrl },
      stdio: 'pipe',
      windowsHide: true
    });

    // 2. Build real Linux tarball from current HEAD (`TARGET_SHA`) via `build-linux-release-tarball.cjs`
    const buildOut = JSON.parse(
      execFileSync(
        process.execPath,
        [path.join(ROOT, 'scripts', 'build-linux-release-tarball.cjs'), '--ref', 'HEAD', '--out-dir', artDir],
        { cwd: ROOT, encoding: 'utf8', windowsHide: true }
      )
    );
    const TARGET_SHA = buildOut.commit_sha;
    const TARBALL_PATH = buildOut.tarball_path;
    const SHA256_FILE = buildOut.sha256_path;
    const EXPECTED_SHA256 = buildOut.sha256;

    // 3. Seed a valid pre-existing release (`PREV_SHA`) representing `614dc997e1b903c94948dc7ff13d02e51c434acd`
    const PREV_SHA = '614dc997e1b903c94948dc7ff13d02e51c434acd';
    const prevReleaseDir = path.join(releasesDir, PREV_SHA);
    fs.mkdirSync(path.join(prevReleaseDir, 'server'), { recursive: true });
    fs.mkdirSync(path.join(prevReleaseDir, 'public'), { recursive: true });
    fs.mkdirSync(path.join(prevReleaseDir, 'scripts'), { recursive: true });
    fs.mkdirSync(path.join(prevReleaseDir, 'node_modules', 'pg'), { recursive: true });
    fs.mkdirSync(path.join(prevReleaseDir, 'node_modules', 'hatchable'), { recursive: true });
    fs.writeFileSync(path.join(prevReleaseDir, 'package.json'), '{"name":"truckly","version":"1.0.0"}\n');
    fs.writeFileSync(path.join(prevReleaseDir, 'server', 'index.js'), '// prev server\n');
    fs.writeFileSync(path.join(prevReleaseDir, 'server', 'app.js'), '// prev app\n');
    fs.writeFileSync(path.join(prevReleaseDir, 'public', 'index.html'), '<!doctype html><title>Staging</title>\n');
    fs.writeFileSync(path.join(prevReleaseDir, 'scripts', 'run-pager-worker.cjs'), '// prev worker\n');
    fs.writeFileSync(path.join(prevReleaseDir, 'node_modules', 'pg', 'package.json'), '{"name":"pg"}\n');
    fs.writeFileSync(path.join(prevReleaseDir, 'node_modules', 'hatchable', 'package.json'), '{"name":"hatchable"}\n');

    if (process.platform === 'win32') {
      fs.symlinkSync(prevReleaseDir, currentLink, 'junction');
    } else {
      fs.symlinkSync(prevReleaseDir, currentLink);
    }

    // 4. Write protected `staging.env` (`0640`) and `migrator.env` (`0600`)
    const stagingEnvPath = path.join(etcDir, 'staging.env');
    const migratorEnvPath = path.join(etcDir, 'migrator.env');
    const initialStagingEnv = [
      '# Custom operator comment preserved across rollbacks',
      'NODE_ENV=production',
      'BITESHARK_ENV=staging',
      `DATABASE_URL=${appUrl}`,
      `BITESHARK_AUTH_SECRET=${secretAuthHmac}`,
      `BITESHARK_NOTIFICATION_WORKER_SECRET=${secretWorkerBearer}`,
      'BITESHARK_PUSH_PROVIDER_MODE=disabled',
      `BITESHARK_RELEASE_SHA=${PREV_SHA}`,
      `TRUCKLY_RELEASE_SHA=${PREV_SHA}`,
      ''
    ].join('\n');
    fs.writeFileSync(stagingEnvPath, initialStagingEnv, { mode: 0o640 });
    if (process.platform !== 'win32') fs.chmodSync(stagingEnvPath, 0o640);

    const migEnvLines = [`MIGRATION_DATABASE_URL="${migUrl}"`];
    const extraPgMods = process.env.BITESHARK_PG_NODE_MODULES || process.env.TRUCKLY_PG_NODE_MODULES || path.join(ROOT, 'node_modules');
    if (fs.existsSync(path.join(extraPgMods, 'pg'))) {
      migEnvLines.push(`BITESHARK_PG_NODE_MODULES="${extraPgMods.replace(/\\/g, '/')}"`);
    }
    fs.writeFileSync(migratorEnvPath, migEnvLines.join('\n') + '\n', { mode: 0o600 });
    if (process.platform !== 'win32') fs.chmodSync(migratorEnvPath, 0o600);

    // 5. Create controllable service supervisor (`mock-systemctl.cjs` + bash wrapper) that spawns
    //    real background processes inside `realpath(currentLink)` so `/proc/<pid>/cwd` is genuinely tested on Linux!
    const ctlConfigPath = path.join(stateDir, 'ctl-config.json');
    const writeCtlConfig = cfg => fs.writeFileSync(ctlConfigPath, JSON.stringify(cfg, null, 2));
    writeCtlConfig({
      failApiRestartOnSha: null,
      failWorkerRestartOnSha: null,
      failWorkerRestartAlways: false,
      workerCrashAfterMsOnSha: null,
      cotenantInactiveUnit: null
    });

    const daemonScriptPath = path.join(binDir, 'dummy-service-daemon.cjs');
    fs.writeFileSync(
      daemonScriptPath,
      `const crashMs = Number(process.argv[2] || 0);
       if (crashMs > 0) { setTimeout(() => process.exit(1), crashMs); }
       else { setInterval(() => {}, 30000); }
       process.on('SIGTERM', () => process.exit(0));\n`
    );

    const mockSystemctlJs = path.join(binDir, 'mock-systemctl.cjs');
    fs.writeFileSync(
      mockSystemctlJs,
      `const fs = require('node:fs');
       const path = require('node:path');
       const { spawn } = require('node:child_process');
       const stateDir = ${JSON.stringify(stateDir)};
       const currentLink = ${JSON.stringify(currentLink)};
       const cfgPath = ${JSON.stringify(ctlConfigPath)};
       const daemonScript = ${JSON.stringify(daemonScriptPath)};

       const args = process.argv.slice(2).filter(a => a !== '--quiet');
       const cmd = args[0];
       const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));

       function svcFile(unit) { return path.join(stateDir, unit.replace(/[^a-zA-Z0-9_.-]/g, '_') + '.json'); }
       function readSvc(unit) {
         const f = svcFile(unit);
         if (!fs.existsSync(f)) return { active: false, pid: 0, cwd: '', sha: '' };
         const s = JSON.parse(fs.readFileSync(f, 'utf8'));
         if (s.active && s.pid > 0) {
           try { process.kill(s.pid, 0); } catch { s.active = false; s.pid = 0; fs.writeFileSync(f, JSON.stringify(s)); }
         }
         return s;
       }
       function stopSvc(unit) {
         const s = readSvc(unit);
         if (s.pid > 0) { try { process.kill(s.pid, 'SIGTERM'); } catch {} }
         fs.writeFileSync(svcFile(unit), JSON.stringify({ active: false, pid: 0, cwd: '', sha: '' }));
       }

       if (cmd === 'restart') {
         const unit = args[1];
         stopSvc(unit);
         const resolvedDir = fs.realpathSync(currentLink);
         const activeSha = path.basename(resolvedDir);
         if (unit === 'truckly-staging-api.service' && cfg.failApiRestartOnSha === activeSha) {
           console.error('Job for truckly-staging-api.service failed.');
           process.exit(1);
         }
         if (unit === 'truckly-staging-worker.service' && (cfg.failWorkerRestartAlways || cfg.failWorkerRestartOnSha === activeSha)) {
           console.error('Job for truckly-staging-worker.service failed.');
           process.exit(1);
         }
         const crashMs = (unit === 'truckly-staging-worker.service' && cfg.workerCrashAfterMsOnSha === activeSha) ? 60 : 0;
         const child = spawn(process.execPath, [daemonScript, String(crashMs)], {
           cwd: resolvedDir,
           detached: true,
           stdio: 'ignore',
           windowsHide: true
         });
         child.unref();
         fs.writeFileSync(svcFile(unit), JSON.stringify({ active: true, pid: child.pid, cwd: resolvedDir, sha: activeSha }));
         process.exit(0);
       }

       if (cmd === 'is-active') {
         const unit = args[1];
         if (['nginx.service', 'postgresql.service', 'pm2-matt.service', 'qwen-worker.service'].includes(unit)) {
           process.exit(cfg.cotenantInactiveUnit === unit ? 3 : 0);
         }
         const s = readSvc(unit);
         process.exit(s.active ? 0 : 3);
       }

       if (cmd === 'show') {
         const unit = args[args.length - 1];
         const s = readSvc(unit);
         console.log('Id=' + unit);
         console.log('ActiveState=' + (s.active ? 'active' : 'failed'));
         console.log('SubState=' + (s.active ? 'running' : 'failed'));
         console.log('MainPID=' + (s.active ? s.pid : 0));
         console.log('WorkingDirectory=' + (s.cwd || currentLink));
         console.log('ExecMainCode=1');
         console.log('ExecMainStatus=' + (s.active ? 0 : 1));
         console.log('Result=' + (s.active ? 'success' : 'exit-code'));
         process.exit(0);
       }
       process.exit(0);\n`
    );

    const mockJournalJs = path.join(binDir, 'mock-journalctl.cjs');
    fs.writeFileSync(
      mockJournalJs,
      `// Intentionally includes synthetic secrets to verify capture_sanitized_diagnostics redacts all credentials!
       console.log(${JSON.stringify(
         `Nov 19 06:00:00 vps truckly-staging-api[123]: DATABASE_URL=postgres://user:${secretDbPass}@127.0.0.1:5432/db BITESHARK_AUTH_SECRET=${secretAuthHmac} Authorization: Bearer ${secretWorkerBearer} Cookie: __Host-truckly_session=RAW_COOKIE_SECRET_999`
       )});\n`
    );

    const systemctlSh = path.join(binDir, 'mock-systemctl.sh');
    const journalctlSh = path.join(binDir, 'mock-journalctl.sh');
    const nodePosix = toPosixPath(process.execPath);
    fs.writeFileSync(systemctlSh, `#!/usr/bin/env bash\nexec "${nodePosix}" "${toPosixPath(mockSystemctlJs)}" "$@"\n`, { mode: 0o755 });
    fs.writeFileSync(journalctlSh, `#!/usr/bin/env bash\nexec "${nodePosix}" "${toPosixPath(mockJournalJs)}" "$@"\n`, { mode: 0o755 });
    if (process.platform !== 'win32') {
      fs.chmodSync(systemctlSh, 0o755);
      fs.chmodSync(journalctlSh, 0o755);
    }

    // Boot initial `PREV_SHA` services via `mock-systemctl.cjs`
    execFileSync(process.execPath, [mockSystemctlJs, 'restart', 'truckly-staging-api.service'], { windowsHide: true });
    execFileSync(process.execPath, [mockSystemctlJs, 'restart', 'truckly-staging-worker.service'], { windowsHide: true });

    // 6. Start HTTP multi-vhost simulator serving:
    //    - `/local-api/api/healthz` (`HEALTH_URL`)
    //    - `/public-staging/*` (`PUBLIC_STAGING_URL`)
    //    - `/holding/*` (`PUBLIC_HOLDING_URL`)
    //    - `/cotenant/` (`COTENANT_HTTP_URL` returning `404` like `lifestyle-api` `:4000` on VPS)
    const httpState = {
      forceDegradedOnSha: null,
      overrideReleaseShaOnSha: null,
      cotenantStatus: 404,
      holdingCorrupted: false
    };

    function readRunningApiState() {
      const f = path.join(stateDir, 'truckly-staging-api.service.json');
      if (!fs.existsSync(f)) return { active: false, sha: '', cwd: '' };
      return JSON.parse(fs.readFileSync(f, 'utf8'));
    }

    const httpPort = await getFreePort();
    mockHttpServer = http.createServer((req, res) => {
      const u = new URL(req.url, `http://127.0.0.1:${httpPort}`);
      const p = u.pathname;

      if (p.startsWith('/cotenant')) {
        res.writeHead(httpState.cotenantStatus, { 'Content-Type': 'text/plain' });
        return res.end('lifestyle-api default host');
      }

      if (p.startsWith('/holding')) {
        const sub = p.slice('/holding'.length) || '/';
        if (sub === '/' || sub === '/index.html') {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          return res.end(httpState.holdingCorrupted ? '<h1>Wrong page</h1>' : '<!doctype html><h1>BiteShark</h1><p>BiteShark is coming soon.</p>');
        }
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('Not found');
      }

      if (p.startsWith('/local-api/') || p.startsWith('/public-staging')) {
        const sub = p.startsWith('/local-api')
          ? p.slice('/local-api'.length) || '/'
          : p.slice('/public-staging'.length) || '/';
        const apiState = readRunningApiState();
        if (!apiState.active) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Bad gateway' }));
        }

        if (sub === '/api/healthz') {
          if (httpState.forceDegradedOnSha === apiState.sha) {
            res.writeHead(503, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ status: 'degraded', db: 'unavailable', release_sha: apiState.sha }));
          }
          const reportedSha =
            httpState.overrideReleaseShaOnSha && httpState.overrideReleaseShaOnSha.whenSha === apiState.sha
              ? httpState.overrideReleaseShaOnSha.reportSha
              : apiState.sha;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ status: 'ok', db: 'ready', env: 'staging', release_sha: reportedSha, domain_routes: 30 }));
        }

        if (sub === '/debug-admin.js' || sub === '/debug-admin.css' || sub.startsWith('/__debug')) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Not found' }));
        }

        const relAsset = sub === '/' ? 'index.html' : sub.replace(/^\/+/, '');
        const assetPath = path.join(apiState.cwd, 'public', ...relAsset.split('/'));
        if (fs.existsSync(assetPath) && fs.statSync(assetPath).isFile()) {
          const ext = path.extname(assetPath);
          const mime = ext === '.json' ? 'application/json' : ext === '.png' ? 'image/png' : 'text/html; charset=utf-8';
          res.writeHead(200, { 'Content-Type': mime });
          return res.end(fs.readFileSync(assetPath));
        }
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Not found' }));
      }

      res.writeHead(404);
      res.end();
    });
    await new Promise(r => mockHttpServer.listen(httpPort, '127.0.0.1', r));

    // Fast `npm ci` stub for failure-matrix runs that creates `node_modules/{pg,hatchable}` cleanly
    const npmStubCmd = `"${nodePosix}" -e 'const fs=require("node:fs");fs.mkdirSync("node_modules/pg",{recursive:true});fs.mkdirSync("node_modules/hatchable",{recursive:true});fs.writeFileSync("node_modules/pg/package.json","{\\"name\\":\\"pg\\"}");fs.writeFileSync("node_modules/hatchable/package.json","{\\"name\\":\\"hatchable\\"}");'`;

    const baseEnv = {
      BITESHARK_STAGING_ROOT: toPosixPath(srvRoot),
      BITESHARK_STAGING_ETC: toPosixPath(etcDir),
      BITESHARK_DEPLOY_LOCK_FILE: toPosixPath(lockFile),
      BITESHARK_NODE_BIN_DIR: toPosixPath(path.dirname(process.execPath)),
      BITESHARK_SYSTEMCTL_CMD: toPosixPath(systemctlSh),
      BITESHARK_JOURNALCTL_CMD: toPosixPath(journalctlSh),
      BITESHARK_DB_APP_ROLE: appRole,
      BITESHARK_HEALTH_URL: `http://127.0.0.1:${httpPort}/local-api/api/healthz`,
      BITESHARK_PUBLIC_STAGING_URL: `http://127.0.0.1:${httpPort}/public-staging`,
      BITESHARK_PUBLIC_HOLDING_URL: `http://127.0.0.1:${httpPort}/holding`,
      BITESHARK_COTENANT_HTTP_URL: `http://127.0.0.1:${httpPort}/cotenant/`,
      BITESHARK_HEALTH_MAX_ATTEMPTS: '4',
      BITESHARK_HEALTH_SLEEP_SEC: '0.1',
      BITESHARK_WORKER_SETTLE_SEC: '0.3',
      BITESHARK_NPM_CI_CMD: npmStubCmd
    };

    function assertNoSecretsLeaked(run, label) {
      const combined = `${run.stdout}\n${run.stderr}`;
      assert(!combined.includes(secretDbPass), `${label}: leaked DB password in output`);
      assert(!combined.includes(secretAuthHmac), `${label}: leaked AUTH_SECRET in output`);
      assert(!combined.includes(secretWorkerBearer), `${label}: leaked WORKER_SECRET in output`);
      assert(!combined.includes('RAW_COOKIE_SECRET_999'), `${label}: leaked raw session cookie in output`);
    }

    function assertProtectedStateRestoredToPrev(label) {
      const realCur = fs.realpathSync(currentLink);
      assert.equal(path.basename(realCur), PREV_SHA, `${label}: current symlink must point to ${PREV_SHA}`);
      const envAfter = fs.readFileSync(stagingEnvPath, 'utf8');
      assert.equal(envAfter, initialStagingEnv, `${label}: staging.env must be restored byte-for-byte`);
      if (process.platform !== 'win32') {
        assert.equal(fs.lstatSync(stagingEnvPath).mode & 0o777, 0o640, `${label}: staging.env mode 0640 preserved`);
        assert.equal(fs.lstatSync(migratorEnvPath).mode & 0o777, 0o600, `${label}: migrator.env mode 0600 preserved`);
      }
      const apiSvc = JSON.parse(fs.readFileSync(path.join(stateDir, 'truckly-staging-api.service.json'), 'utf8'));
      const wrkSvc = JSON.parse(fs.readFileSync(path.join(stateDir, 'truckly-staging-worker.service.json'), 'utf8'));
      assert.equal(apiSvc.active, true, `${label}: API active after rollback`);
      assert.equal(apiSvc.sha, PREV_SHA, `${label}: API running PREV_SHA after rollback`);
      assert.equal(wrkSvc.active, true, `${label}: Worker active after rollback`);
      assert.equal(wrkSvc.sha, PREV_SHA, `${label}: Worker running PREV_SHA after rollback`);
    }

    // =========================================================================
    // [1/12] Push-Not-Disabled Guard
    // =========================================================================
    fs.writeFileSync(
      stagingEnvPath,
      initialStagingEnv.replace('BITESHARK_PUSH_PROVIDER_MODE=disabled', 'BITESHARK_PUSH_PROVIDER_MODE=webpush'),
      { mode: 0o640 }
    );
    if (process.platform !== 'win32') fs.chmodSync(stagingEnvPath, 0o640);
    const pushGuardRun = await runInstaller(
      bashBin,
      ['--sha', TARGET_SHA, '--tarball', toPosixPath(TARBALL_PATH), '--expected-sha256', EXPECTED_SHA256],
      baseEnv
    );
    assert.equal(pushGuardRun.code, 2);
    assert(pushGuardRun.stderr.includes('push_provider_not_disabled_during_install'));
    assert(!fs.existsSync(path.join(releasesDir, TARGET_SHA)));
    fs.writeFileSync(stagingEnvPath, initialStagingEnv, { mode: 0o640 });
    if (process.platform !== 'win32') fs.chmodSync(stagingEnvPath, 0o640);
    console.log('PASS [1/12]: Push-not-disabled guard blocks live push mode during installation');

    // =========================================================================
    // [2/12] Invalid Checksum & Expected-vs-File Conflict
    // =========================================================================
    const badHashRun = await runInstaller(
      bashBin,
      ['--sha', TARGET_SHA, '--tarball', toPosixPath(TARBALL_PATH), '--expected-sha256', '0'.repeat(64)],
      baseEnv
    );
    assert.equal(badHashRun.code, 1);
    assert(badHashRun.stderr.includes('archive_validation_failed'));
    assert(!fs.existsSync(path.join(releasesDir, TARGET_SHA)), 'Invalid checksum must never extract to releases/');

    const conflictHashRun = await runInstaller(
      bashBin,
      [
        '--sha',
        TARGET_SHA,
        '--tarball',
        toPosixPath(TARBALL_PATH),
        '--expected-sha256',
        'f'.repeat(64),
        '--sha256-file',
        toPosixPath(SHA256_FILE)
      ],
      baseEnv
    );
    assert.equal(conflictHashRun.code, 1);
    assert(conflictHashRun.stderr.includes('expected_vs_file_sha256_conflict'));
    console.log('PASS [2/12]: Checksum mismatch & expected-vs-file SHA-256 conflicts rejected pre-extraction');

    // =========================================================================
    // [3/12] Malicious Tarball Member Paths & Link Types (Each With Valid Matching SHA-256!)
    // =========================================================================
    const evilCases = [
      {
        label: 'parent traversal (../)',
        entries: [{ name: 'public/../../escaped-traversal.txt', type: '0', content: 'pwned' }]
      },
      {
        label: 'absolute path (/tmp/...)',
        entries: [{ name: '/tmp/abs-evil-file.txt', type: '0', content: 'pwned' }]
      },
      {
        label: 'symlink (typeflag 2)',
        entries: [{ name: 'public/evil-symlink.txt', type: '2', linkname: '/etc/shadow' }]
      },
      {
        label: 'hardlink (typeflag 1)',
        entries: [{ name: 'public/evil-hardlink.txt', type: '1', linkname: '/etc/passwd' }]
      },
      {
        label: 'embedded .env secret file',
        entries: [{ name: '.env.production', type: '0', content: 'SECRET=1' }]
      }
    ];
    for (const ec of evilCases) {
      const { gz, sha256 } = buildCraftedTarGz(ec.entries);
      const evilTarPath = path.join(artDir, `evil-${sha256.slice(0, 8)}.tar.gz`);
      fs.writeFileSync(evilTarPath, gz);
      const r = await runInstaller(
        bashBin,
        ['--sha', TARGET_SHA, '--tarball', toPosixPath(evilTarPath), '--expected-sha256', sha256],
        baseEnv
      );
      assert.equal(r.code, 1, `Evil archive (${ec.label}) must exit 1`);
      assert(r.stderr.includes('archive_validation_failed'), `Evil archive (${ec.label}) must fail pre-extraction`);
      assert(!fs.existsSync(path.join(releasesDir, TARGET_SHA)), `Evil archive (${ec.label}) must not create release dir`);
      assert(!fs.existsSync(path.join(releasesDir, 'escaped-traversal.txt')));
    }
    console.log('PASS [3/12]: Pre-extraction tar header validator blocked .., /abs, symlinks, hardlinks & .env archives');

    // =========================================================================
    // [4/12] Existing Release Directory With Tampered or Stray Contents
    // =========================================================================
    const tamperedDir = path.join(releasesDir, TARGET_SHA);
    fs.mkdirSync(tamperedDir, { recursive: true });
    execFileSync('tar', ['-xzf', TARBALL_PATH, '-C', tamperedDir], { windowsHide: true });
    fs.mkdirSync(path.join(tamperedDir, 'node_modules', 'pg'), { recursive: true });
    fs.mkdirSync(path.join(tamperedDir, 'node_modules', 'hatchable'), { recursive: true });
    fs.writeFileSync(path.join(tamperedDir, 'node_modules', 'pg', 'package.json'), '{}');
    fs.writeFileSync(path.join(tamperedDir, 'node_modules', 'hatchable', 'package.json'), '{}');
    // Tamper 1 file inside existing release dir
    fs.appendFileSync(path.join(tamperedDir, 'server', 'app.js'), '\n// TAMPERED\n');

    const tamperedRun = await runInstaller(
      bashBin,
      ['--sha', TARGET_SHA, '--tarball', toPosixPath(TARBALL_PATH), '--expected-sha256', EXPECTED_SHA256],
      baseEnv
    );
    assert.equal(tamperedRun.code, 1);
    assert(tamperedRun.stderr.includes('existing_release_dir_integrity_failed'));
    assertProtectedStateRestoredToPrev('tampered existing dir');
    fs.rmSync(tamperedDir, { recursive: true, force: true });
    console.log('PASS [4/12]: Existing release directory with tampered content rejected before activation');

    // =========================================================================
    // [5/12] Concurrent Deployment Attempts Serialized by Exclusive Lock (`exit 3`)
    // =========================================================================
    // Hold lock in Process A while Process B attempts simultaneous rollback/deploy
    const procAPromise = runInstaller(
      bashBin,
      ['--rollback-to', PREV_SHA],
      { ...baseEnv, BITESHARK_TEST_HOLD_LOCK_MS: '1400' }
    );
    await new Promise(r => setTimeout(r, 250));
    const procBRun = await runInstaller(
      bashBin,
      ['--sha', TARGET_SHA, '--tarball', toPosixPath(TARBALL_PATH), '--expected-sha256', EXPECTED_SHA256],
      baseEnv
    );
    const procARun = await procAPromise;
    assert.equal(procBRun.code, 3, `Concurrent second deployment must fail fast with exit 3, got ${procBRun.code}: ${procBRun.stderr}`);
    assert(procBRun.stderr.includes('deploy_lock_busy'));
    assert.equal(procARun.code, 0, `Lock-holding deployment must finish cleanly, got ${procARun.code}: ${procARun.stderr}`);
    console.log('PASS [5/12]: Concurrent deployment attempts blocked safely (exit 3 deploy_lock_busy)');

    // =========================================================================
    // [6/12] API Restart Failure Triggers Verified Rollback + Redacted Diagnostics
    // =========================================================================
    writeCtlConfig({
      failApiRestartOnSha: TARGET_SHA,
      failWorkerRestartOnSha: null,
      failWorkerRestartAlways: false,
      workerCrashAfterMsOnSha: null,
      cotenantInactiveUnit: null
    });
    const apiFailRun = await runInstaller(
      bashBin,
      ['--sha', TARGET_SHA, '--tarball', toPosixPath(TARBALL_PATH), '--expected-sha256', EXPECTED_SHA256],
      baseEnv
    );
    assert.equal(apiFailRun.code, 1);
    assert(apiFailRun.stderr.includes('"event":"deploy_failed_rolled_back"'));
    assert(apiFailRun.stderr.includes('"failed_phase":"api_restart"'));
    assert(apiFailRun.stderr.includes('"rollback_verified":true'));
    assert(apiFailRun.stderr.includes('[REDACTED_DB_URL]') && apiFailRun.stderr.includes('[REDACTED]'));
    assertNoSecretsLeaked(apiFailRun, 'api_restart failure');
    assertProtectedStateRestoredToPrev('api_restart failure');
    console.log('PASS [6/12]: API restart failure rolled back current + staging.env, verified both services & redacted secrets');

    // =========================================================================
    // [7/12] Worker Restart Failure & Post-Start Worker Crash Trigger Verified Rollback
    // =========================================================================
    writeCtlConfig({
      failApiRestartOnSha: null,
      failWorkerRestartOnSha: TARGET_SHA,
      failWorkerRestartAlways: false,
      workerCrashAfterMsOnSha: null,
      cotenantInactiveUnit: null
    });
    const wrkFailRun = await runInstaller(
      bashBin,
      ['--sha', TARGET_SHA, '--tarball', toPosixPath(TARBALL_PATH), '--expected-sha256', EXPECTED_SHA256],
      baseEnv
    );
    assert.equal(wrkFailRun.code, 1);
    assert(wrkFailRun.stderr.includes('"failed_phase":"worker_restart"'));
    assert(wrkFailRun.stderr.includes('"rollback_verified":true'));
    assertNoSecretsLeaked(wrkFailRun, 'worker_restart failure');
    assertProtectedStateRestoredToPrev('worker_restart failure');

    // 7b: Worker exits 0 on `restart` then crashes 150ms later during settle window
    writeCtlConfig({
      failApiRestartOnSha: null,
      failWorkerRestartOnSha: null,
      failWorkerRestartAlways: false,
      workerCrashAfterMsOnSha: TARGET_SHA,
      cotenantInactiveUnit: null
    });
    const wrkCrashRun = await runInstaller(
      bashBin,
      ['--sha', TARGET_SHA, '--tarball', toPosixPath(TARBALL_PATH), '--expected-sha256', EXPECTED_SHA256],
      { ...baseEnv, BITESHARK_WORKER_SETTLE_SEC: '1.2' }
    );
    assert.equal(wrkCrashRun.code, 1);
    assert(wrkCrashRun.stderr.includes('"failed_phase":"verify_worker_active_and_identity"'));
    assert(wrkCrashRun.stderr.includes('"rollback_verified":true'));
    assertProtectedStateRestoredToPrev('worker post-start crash');
    console.log('PASS [7/12]: Worker restart failure & post-start settle crash rolled back and verified both services');

    // =========================================================================
    // [8/12] API Readiness Failure (`503`) Triggers Verified Rollback
    // =========================================================================
    writeCtlConfig({
      failApiRestartOnSha: null,
      failWorkerRestartOnSha: null,
      failWorkerRestartAlways: false,
      workerCrashAfterMsOnSha: null,
      cotenantInactiveUnit: null
    });
    httpState.forceDegradedOnSha = TARGET_SHA;
    const readyFailRun = await runInstaller(
      bashBin,
      ['--sha', TARGET_SHA, '--tarball', toPosixPath(TARBALL_PATH), '--expected-sha256', EXPECTED_SHA256],
      baseEnv
    );
    httpState.forceDegradedOnSha = null;
    assert.equal(readyFailRun.code, 1);
    assert(readyFailRun.stderr.includes('"failed_phase":"verify_api_readiness"'));
    assert(readyFailRun.stderr.includes('"rollback_verified":true'));
    assertProtectedStateRestoredToPrev('api readiness 503');
    console.log('PASS [8/12]: API readiness 503 rolled back and verified recovery on previous release');

    // =========================================================================
    // [9/12] Wrong Release Identity & Co-Tenant / Holding-Page Regressions Trigger Rollback
    // =========================================================================
    httpState.overrideReleaseShaOnSha = { whenSha: TARGET_SHA, reportSha: '0'.repeat(40) };
    const wrongShaRun = await runInstaller(
      bashBin,
      ['--sha', TARGET_SHA, '--tarball', toPosixPath(TARBALL_PATH), '--expected-sha256', EXPECTED_SHA256],
      baseEnv
    );
    httpState.overrideReleaseShaOnSha = null;
    assert.equal(wrongShaRun.code, 1);
    assert(wrongShaRun.stderr.includes('"failed_phase":"verify_api_release_sha"'));
    assert(wrongShaRun.stderr.includes('"rollback_verified":true'));
    assertProtectedStateRestoredToPrev('wrong release_sha');

    httpState.holdingCorrupted = true;
    const holdFailRun = await runInstaller(
      bashBin,
      ['--sha', TARGET_SHA, '--tarball', toPosixPath(TARBALL_PATH), '--expected-sha256', EXPECTED_SHA256],
      baseEnv
    );
    httpState.holdingCorrupted = false;
    assert.equal(holdFailRun.code, 1);
    assert(holdFailRun.stderr.includes('"failed_phase":"verify_holding_page"'));
    assertProtectedStateRestoredToPrev('holding page regression');
    console.log('PASS [9/12]: Wrong release_sha & holding-page verification failures rolled back cleanly');

    // =========================================================================
    // [10/12] Failed Rollback Recovery Clearly Reported (`exit 4`, Never Masked!)
    // =========================================================================
    writeCtlConfig({
      failApiRestartOnSha: TARGET_SHA,
      failWorkerRestartOnSha: null,
      failWorkerRestartAlways: true, // fails during rollback too!
      workerCrashAfterMsOnSha: null,
      cotenantInactiveUnit: null
    });
    const rbFailRun = await runInstaller(
      bashBin,
      ['--sha', TARGET_SHA, '--tarball', toPosixPath(TARBALL_PATH), '--expected-sha256', EXPECTED_SHA256],
      baseEnv
    );
    assert.equal(rbFailRun.code, 4, `Failed rollback must exit 4, got ${rbFailRun.code}`);
    assert(rbFailRun.stderr.includes('"event":"deploy_and_rollback_failed"'));
    assert(rbFailRun.stderr.includes('"rollback_verified":false'));
    assert(rbFailRun.stderr.includes('rollback_worker_restart_failed'));
    assertNoSecretsLeaked(rbFailRun, 'failed rollback');

    // Restore healthy `PREV_SHA` worker before testing clean install
    writeCtlConfig({
      failApiRestartOnSha: null,
      failWorkerRestartOnSha: null,
      failWorkerRestartAlways: false,
      workerCrashAfterMsOnSha: null,
      cotenantInactiveUnit: null
    });
    execFileSync(process.execPath, [mockSystemctlJs, 'restart', 'truckly-staging-api.service'], { windowsHide: true });
    execFileSync(process.execPath, [mockSystemctlJs, 'restart', 'truckly-staging-worker.service'], { windowsHide: true });
    console.log('PASS [10/12]: Failed rollback recovery clearly reported with exit 4 and rollback_verified=false');

    // =========================================================================
    // [11/12] Clean Successful Install + Verified Existing-Directory Idempotent Reuse
    // =========================================================================
    // Remove `releases/<TARGET_SHA>` first so full fresh extraction + stage verification runs end-to-end!
    fs.rmSync(path.join(releasesDir, TARGET_SHA), { recursive: true, force: true });
    const cleanInstallRun = await runInstaller(
      bashBin,
      ['--sha', TARGET_SHA, '--tarball', toPosixPath(TARBALL_PATH), '--expected-sha256', EXPECTED_SHA256],
      baseEnv
    );
    assert.equal(cleanInstallRun.code, 0, `Clean install failed: ${cleanInstallRun.stderr}`);
    assert(cleanInstallRun.stdout.includes('"event":"release_dir_installed"'));
    assert(cleanInstallRun.stdout.includes('"event":"staging_release_active"'));
    assert(cleanInstallRun.stdout.includes(`"release_sha":"${TARGET_SHA}"`));
    assert(cleanInstallRun.stdout.includes('"migrations_newly_applied":0'));
    assertNoSecretsLeaked(cleanInstallRun, 'clean install');
    assert.equal(path.basename(fs.realpathSync(currentLink)), TARGET_SHA);
    const activeEnv = fs.readFileSync(stagingEnvPath, 'utf8');
    assert(activeEnv.includes(`BITESHARK_RELEASE_SHA=${TARGET_SHA}`));
    assert(activeEnv.includes('# Custom operator comment preserved across rollbacks'));
    if (process.platform !== 'win32') {
      assert.equal(fs.lstatSync(stagingEnvPath).mode & 0o777, 0o640, 'staging.env 0640 preserved on install');
      assert.equal(fs.lstatSync(migratorEnvPath).mode & 0o777, 0o600, 'migrator.env 0600 preserved on install');
    }

    // Re-running against intact `releases/<TARGET_SHA>` verifies all 158 files byte-for-byte & succeeds
    const reuseInstallRun = await runInstaller(
      bashBin,
      ['--sha', TARGET_SHA, '--tarball', toPosixPath(TARBALL_PATH), '--expected-sha256', EXPECTED_SHA256],
      baseEnv
    );
    assert.equal(reuseInstallRun.code, 0, `Verified reuse install failed: ${reuseInstallRun.stderr}`);
    assert(reuseInstallRun.stdout.includes('"event":"existing_release_dir_verified"'));
    console.log('PASS [11/12]: Clean fresh install, whole-deployment verification & intact existing-dir reuse passed');

    // =========================================================================
    // [12/12] Explicit `--rollback-to <PREV_SHA>` Succeeds & Restores Whole Deployment
    // =========================================================================
    const explicitRbRun = await runInstaller(bashBin, ['--rollback-to', PREV_SHA], baseEnv);
    assert.equal(explicitRbRun.code, 0, `Explicit rollback failed: ${explicitRbRun.stderr}`);
    assert(explicitRbRun.stdout.includes('"mode":"rollback"'));
    assert(explicitRbRun.stdout.includes(`"release_sha":"${PREV_SHA}"`));
    assert.equal(path.basename(fs.realpathSync(currentLink)), PREV_SHA);
    const rbEnv = fs.readFileSync(stagingEnvPath, 'utf8');
    assert(rbEnv.includes(`BITESHARK_RELEASE_SHA=${PREV_SHA}`) && rbEnv.includes(`TRUCKLY_RELEASE_SHA=${PREV_SHA}`));
    console.log('PASS [12/12]: Explicit --rollback-to verified and restored previous release cleanly');

    console.log('\nALL 12 DEPLOYMENT INSTALLER, ARCHIVE SAFETY & VERIFIED ROLLBACK TESTS PASSED.');
  } finally {
    // Clean up any spawned mock daemon processes
    for (const unitFile of fs.readdirSync(stateDir)) {
      if (!unitFile.endsWith('.json') || unitFile === 'ctl-config.json') continue;
      try {
        const s = JSON.parse(fs.readFileSync(path.join(stateDir, unitFile), 'utf8'));
        if (s.pid > 0) process.kill(s.pid, 'SIGKILL');
      } catch {}
    }
    if (mockHttpServer) {
      await new Promise(r => mockHttpServer.close(r)).catch(() => {});
    }
    await adminPool.end().catch(() => {});
    await pgCluster.stop();
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {}
  }
})().catch(err => {
  console.error('DEPLOYMENT INSTALLER TEST FAILURE:', err);
  process.exitCode = 1;
});
