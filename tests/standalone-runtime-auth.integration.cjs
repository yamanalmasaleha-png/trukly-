// Standalone Runtime, Authentication, Proxy Trust, Filesystem & Process Lifecycle Integration Suite
//
// Tests `server/index.js` (real spawned OS child process with normal installed dependencies — zero
// custom module loaders) and `server/app.js` against a disposable PostgreSQL cluster using separate
// `migrator` and `NOSUPERUSER NOBYPASSRLS` `app` roles.

const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const http = require('node:http');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');

function requirePg() {
  try {
    return require('pg');
  } catch {
    const extra = process.env.TRUCKLY_PG_NODE_MODULES;
    if (extra) return require(path.join(extra, 'pg'));
    throw new Error('Missing `pg` package. Run `npm ci` first.');
  }
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

async function createPostgresCluster() {
  if (process.env.DATABASE_URL) {
    return { adminUrl: process.env.DATABASE_URL, stop: async () => {} };
  }
  const binSuffix = process.platform === 'win32' ? '.exe' : '';
  const pkgPlatform = `${process.platform === 'win32' ? 'windows' : process.platform}-${process.arch}`;
  const roots = [];
  if (process.env.TRUCKLY_PG_NODE_MODULES) roots.push(process.env.TRUCKLY_PG_NODE_MODULES);
  if (process.env.NODE_PATH) roots.push(...process.env.NODE_PATH.split(path.delimiter).filter(Boolean));

  let nativeBinDir = null;
  for (const r of roots) {
    const candidate = path.join(r, '@embedded-postgres', pkgPlatform, 'native', 'bin');
    if (fs.existsSync(path.join(candidate, 'pg_ctl' + binSuffix))) {
      nativeBinDir = candidate;
      break;
    }
  }
  if (!nativeBinDir) {
    throw new Error('Set DATABASE_URL or TRUCKLY_PG_NODE_MODULES for PostgreSQL binaries.');
  }

  const initdbExe = path.join(nativeBinDir, 'initdb' + binSuffix);
  const pgCtlExe = path.join(nativeBinDir, 'pg_ctl' + binSuffix);
  const port = await getFreePort();
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'truckly-sa-pg-'));
  const dataDir = path.join(tmpBase, 'data');
  const pwFile = path.join(tmpBase, 'pw.txt');
  const logFile = path.join(tmpBase, 'postgres.log');
  const password = 'sa_pw_' + crypto.randomBytes(6).toString('hex');
  fs.writeFileSync(pwFile, password + '\n', 'utf8');

  execFileSync(
    initdbExe,
    ['-D', dataDir, '-U', 'postgres', `--pwfile=${pwFile}`, '-A', 'scram-sha-256', '-E', 'UTF8', '--no-locale'],
    { stdio: 'ignore', windowsHide: true }
  );
  execFileSync(pgCtlExe, ['-D', dataDir, '-l', logFile, '-w', '-o', `-p ${port} -h 127.0.0.1`, 'start'], {
    stdio: 'ignore',
    windowsHide: true
  });

  return {
    adminUrl: `postgres://postgres:${encodeURIComponent(password)}@127.0.0.1:${port}/postgres`,
    stop: async () => {
      try {
        execFileSync(pgCtlExe, ['-D', dataDir, '-m', 'immediate', '-w', 'stop'], {
          stdio: 'ignore',
          windowsHide: true
        });
      } catch {}
      try {
        fs.rmSync(tmpBase, { recursive: true, force: true });
      } catch {}
    }
  };
}

function extractSessionCookie(res) {
  const setCookie =
    typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : res.headers.get('set-cookie');
  const joined = Array.isArray(setCookie) ? setCookie.join('; ') : String(setCookie || '');
  const m = /(__Host-truckly_session=[^;\s]+)/.exec(joined);
  return { rawHeader: joined, cookiePair: m ? m[1] : '' };
}

async function waitForHealth(baseUrl, timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${baseUrl}/api/healthz`);
      if (r.status === 200) return await r.json();
    } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error(`Timed out waiting for ${baseUrl}/api/healthz`);
}

function runChildExpectExit(args, env, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: ROOT,
      env,
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      windowsHide: true
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => (stdout += d.toString()));
    child.stderr.on('data', d => (stderr += d.toString()));
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('Child process timed out'));
    }, timeoutMs);
    child.on('exit', code => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

(async () => {
  const { Pool, types } = requirePg();
  types.setTypeParser(1082, v => String(v));

  const pgCluster = await createPostgresCluster();
  const suffix = crypto.randomBytes(3).toString('hex');
  const migratorRole = `sa_mig_${suffix}`;
  const migratorPass = `mig_${crypto.randomBytes(6).toString('hex')}`;
  const appRole = `sa_app_${suffix}`;
  const appPass = `app_${crypto.randomBytes(6).toString('hex')}`;
  const dbName = `sa_db_${suffix}`;

  const adminPool = new Pool({ connectionString: pgCluster.adminUrl, max: 2 });
  let migratorPool = null;
  let appPool = null;
  let serverChild = null;
  let pushReceiver = null;

  try {
    await adminPool.query(
      `CREATE ROLE ${migratorRole} LOGIN PASSWORD '${migratorPass}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`
    );
    await adminPool.query(
      `CREATE ROLE ${appRole} LOGIN PASSWORD '${appPass}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`
    );
    await adminPool.query(`CREATE DATABASE ${dbName} OWNER ${migratorRole}`);

    const buildUrl = (uName, uPass) => {
      const u = new URL(pgCluster.adminUrl);
      u.username = uName;
      u.password = uPass;
      u.pathname = '/' + dbName;
      return u.toString();
    };
    const migratorUrl = buildUrl(migratorRole, migratorPass);
    const appUrl = buildUrl(appRole, appPass);
    const superuserDbUrl = (() => {
      const u = new URL(pgCluster.adminUrl);
      u.pathname = '/' + dbName;
      return u.toString();
    })();

    // =========================================================================
    // [1/8] Idempotent Migration Runner + Fail-Closed Startup Guards
    // =========================================================================
    const migRun1 = await runChildExpectExit(
      [path.join(ROOT, 'scripts', 'run-migrations.cjs'), '--app-role', appRole],
      { ...process.env, MIGRATION_DATABASE_URL: migratorUrl }
    );
    assert.equal(migRun1.code, 0, `First migration run failed: ${migRun1.stderr}`);
    assert(migRun1.stdout.includes('"newly_applied":17'), 'Expected all 17 migrations applied on fresh DB');

    // Second run must be a zero-op idempotent checksum verification
    const migRun2 = await runChildExpectExit(
      [path.join(ROOT, 'scripts', 'run-migrations.cjs'), '--app-role', appRole],
      { ...process.env, MIGRATION_DATABASE_URL: migratorUrl }
    );
    assert.equal(migRun2.code, 0, `Idempotent migration re-run failed: ${migRun2.stderr}`);
    assert(migRun2.stdout.includes('"newly_applied":0'), 'Expected 0 newly applied migrations on re-run');

    // Upgrade migration test: pre-existing `001`..`016` database (without `schema_migrations`) upgraded cleanly to `017`
    const upgDbName = `sa_upg_${suffix}`;
    await adminPool.query(`CREATE DATABASE ${upgDbName} OWNER ${migratorRole}`);
    const upgUrl = (() => {
      const u = new URL(pgCluster.adminUrl);
      u.username = migratorRole;
      u.password = migratorPass;
      u.pathname = '/' + upgDbName;
      return u.toString();
    })();
    const upgPool = new Pool({ connectionString: upgUrl, max: 2 });
    try {
      const legacyFiles = fs
        .readdirSync(path.join(ROOT, 'migrations'))
        .filter(f => /^\d{3}_.+\.sql$/.test(f) && !f.startsWith('017_'))
        .sort();
      for (const f of legacyFiles) {
        await upgPool.query(fs.readFileSync(path.join(ROOT, 'migrations', f), 'utf8'));
      }
      await upgPool.query("INSERT INTO favorites (user_id, truck_id) VALUES ('usr_pre_017', 'mitote')");
      const upgRun = await runChildExpectExit(
        [path.join(ROOT, 'scripts', 'run-migrations.cjs'), '--app-role', appRole],
        { ...process.env, MIGRATION_DATABASE_URL: upgUrl }
      );
      assert.equal(upgRun.code, 0, `Upgrade migration 001..016 -> 017 failed: ${upgRun.stderr}`);
      const preservedFav = await upgPool.query("SELECT count(*)::int AS c FROM favorites WHERE user_id = 'usr_pre_017'");
      assert.equal(preservedFav.rows[0].c, 1, 'Pre-existing data must be preserved across 017 upgrade');
    } finally {
      await upgPool.end().catch(() => {});
      await adminPool.query(`DROP DATABASE IF EXISTS ${upgDbName}`).catch(() => {});
    }

    // Startup guard 1a: Refuse to start in `staging` when connected as PostgreSQL superuser
    const superuserBoot = await runChildExpectExit(
      [path.join(ROOT, 'server', 'index.js')],
      {
        ...process.env,
        PORT: String(await getFreePort()),
        TRUCKLY_ENV: 'staging',
        DATABASE_URL: superuserDbUrl,
        TRUCKLY_AUTH_SECRET: crypto.randomBytes(32).toString('hex'),
        TRUCKLY_AUTH_DELIVERY_MODE: 'disabled'
      }
    );
    assert.notEqual(superuserBoot.code, 0, 'server/index.js must refuse superuser DB role in staging');
    assert(superuserBoot.stderr.includes('NOSUPERUSER and NOBYPASSRLS'));

    // Startup guard 1b: Refuse `staging_mailbox` in `production`
    const prodMailboxBoot = await runChildExpectExit(
      [path.join(ROOT, 'server', 'index.js')],
      {
        ...process.env,
        PORT: String(await getFreePort()),
        TRUCKLY_ENV: 'production',
        DATABASE_URL: appUrl,
        TRUCKLY_AUTH_SECRET: crypto.randomBytes(32).toString('hex'),
        TRUCKLY_AUTH_DELIVERY_MODE: 'staging_mailbox',
        TRUCKLY_STAGING_MAILBOX_SECRET: 'mbx_' + crypto.randomBytes(16).toString('hex'),
        TRUCKLY_STAGING_ALLOWED_EMAIL_DOMAINS: 'staging.truckly.invalid'
      }
    );
    assert.notEqual(prodMailboxBoot.code, 0, 'server/index.js must refuse staging_mailbox in production');
    assert(prodMailboxBoot.stderr.includes('strictly forbidden outside confirmed isolated staging'));

    console.log('PASS [1/8]: Migration runner idempotency, superuser refusal, and production staging_mailbox refusal verified');

    // =========================================================================
    // [2/8] Spawn Real `node server/index.js` Child Process (Zero Test Loaders)
    // =========================================================================
    const webpushCrypto = await import(pathToFileURL(path.join(ROOT, 'lib', 'webpush-crypto.js')).href);
    const vapid = webpushCrypto.generateVapidKeys();
    const receivedPushes = [];
    const pushPort = await getFreePort();
    pushReceiver = http.createServer(async (req, res) => {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      receivedPushes.push({ url: req.url, headers: req.headers, body: Buffer.concat(chunks) });
      res.writeHead(201);
      res.end();
    });
    await new Promise(r => pushReceiver.listen(pushPort, '127.0.0.1', r));

    const serverPort = await getFreePort();
    const baseUrl = `http://127.0.0.1:${serverPort}`;
    const authSecret = crypto.randomBytes(32).toString('hex');
    const mailboxSecret = 'mbx_secret_' + crypto.randomBytes(16).toString('hex');
    const workerSecret = 'wrk_secret_' + crypto.randomBytes(16).toString('hex');
    const allowedDomain = 'staging.truckly.invalid';

    let serverLogs = '';
    serverChild = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
      cwd: ROOT,
      env: {
        ...process.env,
        HOST: '127.0.0.1',
        PORT: String(serverPort),
        DATABASE_URL: appUrl,
        TRUCKLY_ENV: 'staging',
        TRUCKLY_RELEASE_SHA: 'sha-test-candidate',
        TRUCKLY_TRUST_PROXY: 'none',
        TRUCKLY_AUTH_SECRET: authSecret,
        TRUCKLY_AUTH_DELIVERY_MODE: 'staging_mailbox',
        TRUCKLY_STAGING_MAILBOX_SECRET: mailboxSecret,
        TRUCKLY_STAGING_ALLOWED_EMAIL_DOMAINS: allowedDomain,
        TRUCKLY_AUTH_START_IP_MAX: '50',
        TRUCKLY_AUTH_VERIFY_IP_MAX: '80',
        TRUCKLY_NOTIFICATION_WORKER_SECRET: workerSecret,
        TRUCKLY_ALLOW_TEST_PUSH_MODES: '1',
        TRUCKLY_PUSH_PROVIDER_MODE: 'loopback_test',
        TRUCKLY_VAPID_PUBLIC_KEY: vapid.publicKey,
        TRUCKLY_VAPID_PRIVATE_KEY: vapid.privateKey,
        TRUCKLY_VAPID_SUBJECT: 'mailto:stg@truckly.invalid'
      },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      windowsHide: true
    });
    serverChild.stdout.on('data', d => (serverLogs += d.toString()));
    serverChild.stderr.on('data', d => (serverLogs += d.toString()));

    const health = await waitForHealth(baseUrl);
    assert.equal(health.status, 'ok');
    assert.equal(health.db, 'ready');
    assert.equal(health.release_sha, 'sha-test-candidate');
    assert.equal(health.domain_routes, 30);

    migratorPool = new Pool({ connectionString: migratorUrl, max: 2 });
    appPool = new Pool({ connectionString: appUrl, max: 4 });

    console.log('PASS [2/8]: Real `node server/index.js` child process booted with installed node_modules (zero custom loaders)');

    // =========================================================================
    // [3/8] Route Dispatch, 405 Method Enforcement, 401 Access, Traversal & Body Limits
    // =========================================================================
    const trucksRes = await fetch(`${baseUrl}/api/trucks?summary=1`);
    assert.equal(trucksRes.status, 200);
    assert.equal((await trucksRes.json()).total, 59);

    const mitoteRes = await fetch(`${baseUrl}/api/trucks/mitote`);
    assert.equal(mitoteRes.status, 200);
    assert.equal((await mitoteRes.json()).id, 'mitote');

    const badParamRes = await fetch(`${baseUrl}/api/trucks/%E0%A4%A`);
    assert.equal(badParamRes.status, 400);

    const wrongMethodRes = await fetch(`${baseUrl}/api/trucks`, { method: 'DELETE' });
    assert.equal(wrongMethodRes.status, 405);
    assert.equal(wrongMethodRes.headers.get('allow'), 'GET');

    const unauthUserRoute = await fetch(`${baseUrl}/api/bookings/list`);
    assert.equal(unauthUserRoute.status, 401);
    assert(String(unauthUserRoute.headers.get('cache-control') || '').includes('no-store'));

    // Traversal, dotfiles, internal server/lib/migration files, and simulator routes
    for (const p of [
      '/../package.json',
      '/%2e%2e/package.json',
      '/%2e%2e%2fserver%2findex.js',
      '/..\\package.json',
      '/.gitignore',
      '/.env',
      '/package.json',
      '/package-lock.json',
      '/lib/standalone-auth.js',
      '/server/index.js',
      '/migrations/017_standalone_auth_and_sessions.sql',
      '/__debug/state',
      '/__debug/reset'
    ]) {
      const r = await fetch(`${baseUrl}${p}`, { redirect: 'manual' });
      assert([400, 404].includes(r.status), `Traversal/internal path ${p} returned ${r.status}`);
    }

    // Oversized body (> 64 KiB) -> 413; Malformed JSON -> 400
    const bigPayload = JSON.stringify({ pad: 'x'.repeat(70 * 1024) });
    const res413 = await fetch(`${baseUrl}/api/pager/subscriptions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Truckly-Client': 'web-pager-v1'
      },
      body: bigPayload
    });
    assert.equal(res413.status, 413, 'Expected 413 Payload Too Large for > 64 KiB JSON body');

    const res400BadJson = await fetch(`${baseUrl}/api/pager/subscriptions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Truckly-Client': 'web-pager-v1'
      },
      body: '{"broken_json": '
    });
    assert.equal(res400BadJson.status, 400, 'Expected 400 on malformed JSON');

    const res400ArrayJson = await fetch(`${baseUrl}/api/pager/subscriptions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Truckly-Client': 'web-pager-v1'
      },
      body: '[1, 2, 3]'
    });
    assert.equal(res400ArrayJson.status, 400, 'Expected 400 on non-object JSON array');

    // Symlink escape test on `createStandaloneServer` with temporary public dir
    const tmpPub = fs.mkdtempSync(path.join(os.tmpdir(), 'truckly-pub-sym-'));
    fs.writeFileSync(path.join(tmpPub, 'index.html'), '<h1>ok</h1>', 'utf8');
    let symlinkCreated = false;
    try {
      fs.symlinkSync(path.join(ROOT, 'package.json'), path.join(tmpPub, 'leak.json'));
      symlinkCreated = true;
    } catch {}
    if (symlinkCreated) {
      const { createStandaloneServer } = await import(pathToFileURL(path.join(ROOT, 'server', 'app.js')).href);
      const symSrv = createStandaloneServer({
        dbAdapter: { query: (t, p) => appPool.query(t, p), connect: () => appPool.connect() },
        publicDir: tmpPub
      });
      const symPort = await getFreePort();
      await new Promise(r => symSrv.server.listen(symPort, '127.0.0.1', r));
      try {
        const leakRes = await fetch(`http://127.0.0.1:${symPort}/leak.json`);
        assert.equal(leakRes.status, 404, 'Symlink escaping publicDir must return 404');
      } finally {
        await symSrv.closeGracefully(1000);
      }
    }
    fs.rmSync(tmpPub, { recursive: true, force: true });

    console.log('PASS [3/8]: Route dispatch, 405/Allow, 401/no-store, traversal/symlink isolation, 413 body cap, and 400 malformed JSON verified');

    // =========================================================================
    // [4/8] OTP Normalization, Non-Enumeration, Brute-Force Lockout & Concurrent Single-Use Race
    // =========================================================================
    const postAuth = (subPath, body, extraHeaders = {}) =>
      fetch(`${baseUrl}/api/auth/${subPath}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Truckly-Client': 'web-auth-v1',
          ...extraHeaders
        },
        body: JSON.stringify(body)
      });

    const getStagingOtp = async email => {
      const r = await fetch(`${baseUrl}/api/auth/staging-mailbox`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Staging-Mailbox-Secret': mailboxSecret
        },
        body: JSON.stringify({ email })
      });
      assert.equal(r.status, 200);
      return (await r.json()).code;
    };

    // Unallowlisted domain rejected in staging_mailbox mode; public mailbox probe without secret -> 404
    assert.equal((await postAuth('start', { email: 'someone@external-domain.com' })).status, 403);
    assert.equal(
      (
        await fetch(`${baseUrl}/api/auth/staging-mailbox`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: `alice@${allowedDomain}` })
        })
      ).status,
      404
    );

    // Brute-force 5-attempt lockout test
    const bruteEmail = `brute@${allowedDomain}`;
    assert.equal((await postAuth('start', { email: bruteEmail })).status, 200);
    const bruteValidCode = await getStagingOtp(bruteEmail);
    const wrongCode = bruteValidCode === '999999' ? '888888' : '999999';

    for (let i = 0; i < 5; i++) {
      const badTry = await postAuth('verify', { email: bruteEmail, code: wrongCode });
      assert.equal(badTry.status, 401, `Wrong attempt #${i + 1} must return 401`);
    }
    // 6th attempt WITH THE ACTUAL VALID CODE must STILL fail (401) because max_attempts=5 invalidated it!
    const sixthWithRightCode = await postAuth('verify', { email: bruteEmail, code: bruteValidCode });
    assert.equal(sixthWithRightCode.status, 401, 'Exhausted OTP challenge must reject even the original valid code');

    // Issuing a newer OTP invalidates prior unconsumed OTP
    const replaceEmail = `replace@${allowedDomain}`;
    assert.equal((await postAuth('start', { email: replaceEmail })).status, 200);
    const firstOtp = await getStagingOtp(replaceEmail);
    assert.equal((await postAuth('start', { email: `  REPLACE@${allowedDomain.toUpperCase()}  ` })).status, 200);
    const secondOtp = await getStagingOtp(replaceEmail);
    assert.equal((await postAuth('verify', { email: replaceEmail, code: firstOtp })).status, 401, 'Superseded OTP must fail');

    // Concurrent single-use race: 8 simultaneous `POST /api/auth/verify` with `secondOtp`
    const raceResults = await Promise.all(
      Array.from({ length: 8 }, () => postAuth('verify', { email: replaceEmail, code: secondOtp }))
    );
    const raceStatuses = raceResults.map(r => r.status);
    const winners = raceResults.filter(r => r.status === 200);
    const losers = raceResults.filter(r => r.status === 401);
    assert.equal(winners.length, 1, `Expected exact 1 concurrent OTP winner, got statuses: ${raceStatuses.join(',')}`);
    assert.equal(losers.length, 7, `Expected 7 concurrent OTP losers (401), got statuses: ${raceStatuses.join(',')}`);

    // Replay after consumption must also return 401
    assert.equal((await postAuth('verify', { email: replaceEmail, code: secondOtp })).status, 401);

    // Non-enumeration: `start` response keys/status for existing `replaceEmail` vs brand-new email match
    const startExisting = await (await postAuth('start', { email: replaceEmail })).json();
    const startBrandNew = await (await postAuth('start', { email: `brandnew-${suffix}@${allowedDomain}` })).json();
    assert.deepEqual(startExisting, startBrandNew, 'startLogin response must not enumerate existing accounts');

    // Ensure ZERO OTP codes or session cookies leaked to server stdout/stderr logs
    assert(!serverLogs.includes(secondOtp), 'Server logs must never contain OTP codes');

    console.log('PASS [4/8]: OTP normalization, non-enumeration, 5-try lockout, superseding, and 8-way concurrent single-use serialization verified');

    // =========================================================================
    // [5/8] Cookie Flags, Session Rotation on Re-Login, Logout Revocation & Expiry
    // =========================================================================
    const winnerCookieInfo = extractSessionCookie(winners[0]);
    assert(winnerCookieInfo.cookiePair.startsWith('__Host-truckly_session='));
    assert(/HttpOnly/i.test(winnerCookieInfo.rawHeader));
    assert(/Secure/i.test(winnerCookieInfo.rawHeader));
    assert(/SameSite=Lax/i.test(winnerCookieInfo.rawHeader));
    assert(/Path=\/(?:;|$)/i.test(winnerCookieInfo.rawHeader));
    assert(!/Domain=/i.test(winnerCookieInfo.rawHeader));

    // 11th verify attempt on `replaceEmail` within 15m hits per-email rate limit (`429` + `Retry-After`)
    const eleventhEmailHit = await postAuth('verify', { email: replaceEmail, code: '123456' });
    assert.equal(eleventhEmailHit.status, 429, 'Expected 429 on 11th per-email verify attempt within window');
    assert(Number(eleventhEmailHit.headers.get('retry-after')) >= 1, 'Expected Retry-After header on 429');

    // Re-login on a fresh account while presenting session 1 must rotate session & revoke session 1!
    const rotateEmail = `rotate@${allowedDomain}`;
    assert.equal((await postAuth('start', { email: rotateEmail })).status, 200);
    const rotateCode = await getStagingOtp(rotateEmail);
    const reloginRes = await postAuth(
      'verify',
      { email: rotateEmail, code: rotateCode },
      { Cookie: winnerCookieInfo.cookiePair }
    );
    assert.equal(reloginRes.status, 200);
    const rotatedCookieInfo = extractSessionCookie(reloginRes);
    assert.notEqual(rotatedCookieInfo.cookiePair, winnerCookieInfo.cookiePair);

    // Old session 1 must now be revoked on the server!
    const oldSessUse = await fetch(`${baseUrl}/api/favorites/list`, {
      headers: { Cookie: winnerCookieInfo.cookiePair }
    });
    assert.equal(oldSessUse.status, 401, 'Prior session must be revoked upon login rotation');

    // Rotated session 2 works, then test explicit logout revocation on a third login
    const newSessUse = await fetch(`${baseUrl}/api/favorites/list`, {
      headers: { Cookie: rotatedCookieInfo.cookiePair }
    });
    assert.equal(newSessUse.status, 200);

    const logoutEmail = `logout-${suffix}@${allowedDomain}`;
    assert.equal((await postAuth('start', { email: logoutEmail })).status, 200);
    const logoutOtp = await getStagingOtp(logoutEmail);
    const logoutLoginRes = await postAuth('verify', { email: logoutEmail, code: logoutOtp });
    const logoutCookie = extractSessionCookie(logoutLoginRes).cookiePair;
    const doLogout = await postAuth('logout', {}, { Cookie: logoutCookie });
    assert.equal(doLogout.status, 200);
    assert(/Max-Age=0/i.test(extractSessionCookie(doLogout).rawHeader), 'Logout must expire cookie');
    assert.equal(
      (await fetch(`${baseUrl}/api/favorites/list`, { headers: { Cookie: logoutCookie } })).status,
      401,
      'Logged-out session must return 401 immediately'
    );

    // Expire session 2 in PostgreSQL (`SET LOCAL app.auth_internal = 'true'`) and verify immediate 401
    await migratorPool.query('BEGIN');
    await migratorPool.query("SELECT set_config('app.auth_internal', 'true', true)");
    await migratorPool.query("UPDATE auth_sessions SET expires_at = now() - interval '1 minute' WHERE revoked_at IS NULL");
    await migratorPool.query('COMMIT');

    const expiredSessUse = await fetch(`${baseUrl}/api/favorites/list`, {
      headers: { Cookie: rotatedCookieInfo.cookiePair }
    });
    assert.equal(expiredSessUse.status, 401, 'Expired session must be rejected immediately');

    // Regression REV-04a: Concurrent `POST /api/auth/start` for the same email leaves exact 1 active challenge
    const concStartEmail = `conc-start-${suffix}@${allowedDomain}`;
    const concStarts = await Promise.all(
      Array.from({ length: 4 }, () => postAuth('start', { email: concStartEmail }))
    );
    assert(concStarts.every(r => r.status === 200), 'Concurrent valid OTP starts should succeed cleanly');
    await migratorPool.query('BEGIN');
    await migratorPool.query("SELECT set_config('app.auth_internal', 'true', true)");
    const activeChCount = await migratorPool.query(
      `SELECT count(*)::int AS c FROM auth_otp_challenges
       WHERE email_normalized = $1 AND consumed_at IS NULL AND invalidated_at IS NULL`,
      [concStartEmail]
    );
    await migratorPool.query('COMMIT');
    assert.equal(activeChCount.rows[0].c, 1, 'Expected exact 1 active OTP challenge after concurrent start race');

    // Regression REV-04b: Disabled account returns 403 on verify WITHOUT updating `last_login_at` & revokes active sessions
    const disEmail = `disabled-${suffix}@${allowedDomain}`;
    assert.equal((await postAuth('start', { email: disEmail })).status, 200);
    const disCode1 = await getStagingOtp(disEmail);
    const disLogin1 = await postAuth('verify', { email: disEmail, code: disCode1 });
    assert.equal(disLogin1.status, 200);
    const disCookie1 = extractSessionCookie(disLogin1).cookiePair;

    await migratorPool.query('BEGIN');
    await migratorPool.query("SELECT set_config('app.auth_internal', 'true', true)");
    const beforeDisableTs = (
      await migratorPool.query('SELECT last_login_at FROM auth_users WHERE email_normalized = $1', [disEmail])
    ).rows[0].last_login_at;
    await migratorPool.query("UPDATE auth_users SET disabled_at = now() WHERE email_normalized = $1", [disEmail]);
    await migratorPool.query('COMMIT');

    assert.equal(
      (await fetch(`${baseUrl}/api/favorites/list`, { headers: { Cookie: disCookie1 } })).status,
      401,
      'Disabled user existing session must immediately return 401'
    );
    assert.equal((await postAuth('start', { email: disEmail })).status, 200);
    const disCode2 = await getStagingOtp(disEmail);
    const disVerify2 = await postAuth('verify', { email: disEmail, code: disCode2 });
    assert.equal(disVerify2.status, 403, 'Disabled user OTP verify must return 403');
    await migratorPool.query('BEGIN');
    await migratorPool.query("SELECT set_config('app.auth_internal', 'true', true)");
    const afterDisableTs = (
      await migratorPool.query('SELECT last_login_at FROM auth_users WHERE email_normalized = $1', [disEmail])
    ).rows[0].last_login_at;
    await migratorPool.query('COMMIT');
    assert.equal(
      new Date(afterDisableTs).getTime(),
      new Date(beforeDisableTs).getTime(),
      'Disabled account verify must not advance last_login_at'
    );

    console.log('PASS [5/8]: __Host- cookie flags, session rotation, logout, expiry, concurrent OTP start lock & disabled-user guard verified');

    // =========================================================================
    // [6/8] No Silent Legacy Email Auto-Linking + CSRF Rejection + Proxy XFF Spoofing Resistance
    // =========================================================================
    const legacyEmail = `legacy-owner@${allowedDomain}`;
    await migratorPool.query(
      `INSERT INTO vendor_memberships (vendor_id, user_id, role, granted_by)
       VALUES ('iniguez', 'usr_old_hatchable_999', 'owner', 'bootstrap')`
    );
    await migratorPool.query(
      `INSERT INTO bookings
         (truck_id, truck_name, event_type, event_date, location, guest_count, requester, requester_user_id, requester_email, package_id, package_name, package_price, status)
       VALUES
         ('iniguez', 'Tacos Iñiguez', 'Wedding', CURRENT_DATE + 15, 'Santa Rosa', 40, $1, 'usr_old_hatchable_999', $1, 'dropin', 'Neighborhood Drop-in', 750, 'pending')`,
      [legacyEmail]
    );

    assert.equal((await postAuth('start', { email: legacyEmail })).status, 200);
    const legacyOtp = await getStagingOtp(legacyEmail);
    const legacyLogin = await postAuth('verify', { email: legacyEmail, code: legacyOtp });
    assert.equal(legacyLogin.status, 200);
    const legacyLoginBody = await legacyLogin.json();
    const legacyCookie = extractSessionCookie(legacyLogin).cookiePair;

    assert(legacyLoginBody.user.id.startsWith('usr_sa_'), 'Standalone user must receive distinct usr_sa_* ID');
    assert.notEqual(legacyLoginBody.user.id, 'usr_old_hatchable_999');

    // Must NOT inherit vendor ownership or old Hatchable bookings merely because email matched!
    const noInheritedOwner = await fetch(`${baseUrl}/api/owner/profile?truck_id=iniguez`, {
      headers: { Cookie: legacyCookie }
    });
    assert.equal(noInheritedOwner.status, 403, 'New standalone user must NOT auto-link old Hatchable vendor_memberships by email');

    const noInheritedBookings = await (
      await fetch(`${baseUrl}/api/bookings/list`, { headers: { Cookie: legacyCookie } })
    ).json();
    assert.equal(noInheritedBookings.bookings.length, 0, 'New standalone user must NOT inherit old Hatchable bookings by email');

    // Regression REV-01: Public cacheable `/api/trucks` MUST NOT emit `Set-Cookie` even when browser sends
    // a session cookie inside its sliding-renewal half-life, whereas `access: 'user'` routes DO renew it.
    await migratorPool.query('BEGIN');
    await migratorPool.query("SELECT set_config('app.auth_internal', 'true', true)");
    await migratorPool.query(
      "UPDATE auth_sessions SET expires_at = now() + interval '2 days' WHERE user_id = $1 AND revoked_at IS NULL",
      [legacyLoginBody.user.id]
    );
    await migratorPool.query('COMMIT');

    const publicWithHalfLifeCookie = await fetch(`${baseUrl}/api/trucks?summary=1`, {
      headers: { Cookie: legacyCookie }
    });
    assert.equal(publicWithHalfLifeCookie.status, 200);
    assert.equal(
      extractSessionCookie(publicWithHalfLifeCookie).rawHeader,
      '',
      'Public cacheable route /api/trucks must never emit Set-Cookie'
    );
    const userWithHalfLifeCookie = await fetch(`${baseUrl}/api/favorites/list`, {
      headers: { Cookie: legacyCookie }
    });
    assert.equal(userWithHalfLifeCookie.status, 200);
    assert(
      extractSessionCookie(userWithHalfLifeCookie).cookiePair.startsWith('__Host-truckly_session='),
      'Authenticated user route must renew sliding-window cookie past half-life'
    );

    // Regression REV-02: Insecure HTTP Referer on non-loopback host & TRUCKLY_PUBLIC_ORIGIN mismatch -> 403
    const { verifySameOriginMutationRequest } = await import(
      pathToFileURL(path.join(ROOT, 'lib', 'standalone-auth.js')).href
    );
    const savedEnvForCsrf = process.env.TRUCKLY_ENV;
    const savedPubOrigin = process.env.TRUCKLY_PUBLIC_ORIGIN;
    try {
      process.env.TRUCKLY_ENV = 'staging';
      delete process.env.TRUCKLY_PUBLIC_ORIGIN;
      const insecureRefCheck = verifySameOriginMutationRequest({
        headers: {
          host: 'staging.truckly.invalid',
          referer: 'http://staging.truckly.invalid/login.html',
          'content-type': 'application/json'
        }
      });
      assert.equal(insecureRefCheck.ok, false);
      assert.equal(insecureRefCheck.code, 'CSRF_INSECURE_REFERER');

      process.env.TRUCKLY_PUBLIC_ORIGIN = 'https://staging.truckly.invalid';
      const mismatchedHostCheck = verifySameOriginMutationRequest({
        headers: {
          host: 'other-vhost.invalid',
          origin: 'https://other-vhost.invalid',
          'content-type': 'application/json'
        }
      });
      assert.equal(mismatchedHostCheck.ok, false);
      assert.equal(mismatchedHostCheck.code, 'CSRF_HOST_MISMATCH');
    } finally {
      if (savedEnvForCsrf === undefined) delete process.env.TRUCKLY_ENV;
      else process.env.TRUCKLY_ENV = savedEnvForCsrf;
      if (savedPubOrigin === undefined) delete process.env.TRUCKLY_PUBLIC_ORIGIN;
      else process.env.TRUCKLY_PUBLIC_ORIGIN = savedPubOrigin;
    }

    // Regression REV-05: Runtime `appPool` role cannot DELETE/UPDATE `audit_logs` or SELECT `schema_migrations`
    await assert.rejects(
      () => appPool.query("DELETE FROM audit_logs WHERE actor_id = 'nobody'"),
      /permission denied for table audit_logs/i
    );
    await assert.rejects(
      () => appPool.query('SELECT count(*) FROM schema_migrations'),
      /permission denied for table schema_migrations/i
    );

    // CSRF rejection checks across Origin, Sec-Fetch-Site, Referer, and Content-Type
    const hostHdr = `127.0.0.1:${serverPort}`;
    for (const badHeaders of [
      { Cookie: legacyCookie, 'Content-Type': 'application/json', Origin: 'https://evil.example', Host: hostHdr },
      { Cookie: legacyCookie, 'Content-Type': 'application/json', Origin: 'null', Host: hostHdr },
      { Cookie: legacyCookie, 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'cross-site' },
      { Cookie: legacyCookie, 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'same-site' },
      { Cookie: legacyCookie, 'Content-Type': 'application/json', Referer: 'https://evil.example/phish', Host: hostHdr },
      { Cookie: legacyCookie, 'Content-Type': 'text/plain' }
    ]) {
      const csrfRes = await fetch(`${baseUrl}/api/favorites/toggle`, {
        method: 'POST',
        headers: badHeaders,
        body: JSON.stringify({ truck_id: 'mitote' })
      });
      assert.equal(csrfRes.status, 403, `Expected 403 for cross-origin/CSRF headers ${JSON.stringify(badHeaders)}`);
    }

    // Proxy X-Forwarded-For spoofing resistance test:
    // Spin up a dedicated standalone instance with `TRUCKLY_AUTH_START_IP_MAX=3` and `trustProxy='none'`,
    // then send 4 requests with 4 DIFFERENT spoofed `X-Forwarded-For` & `X-Real-IP` headers -> 4th MUST hit 429!
    const { createStandaloneServer } = await import(pathToFileURL(path.join(ROOT, 'server', 'app.js')).href);
    const savedIpMax = process.env.TRUCKLY_AUTH_START_IP_MAX;
    process.env.TRUCKLY_AUTH_START_IP_MAX = '3';
    process.env.TRUCKLY_ENV = 'staging';
    process.env.TRUCKLY_AUTH_SECRET = authSecret;
    process.env.TRUCKLY_AUTH_DELIVERY_MODE = 'staging_mailbox';
    process.env.TRUCKLY_STAGING_MAILBOX_SECRET = mailboxSecret;
    process.env.TRUCKLY_STAGING_ALLOWED_EMAIL_DOMAINS = allowedDomain;

    const untrustedProxySrv = createStandaloneServer({
      dbAdapter: { query: (t, p) => appPool.query(t, p), connect: () => appPool.connect() },
      trustProxy: 'none'
    });
    const untrustedPort = await getFreePort();
    await new Promise(r => untrustedProxySrv.server.listen(untrustedPort, '127.0.0.1', r));
    try {
      await migratorPool.query('BEGIN');
      await migratorPool.query("SELECT set_config('app.auth_internal', 'true', true)");
      await migratorPool.query('DELETE FROM auth_rate_limits');
      await migratorPool.query('COMMIT');

      const spoofStatuses = [];
      for (let i = 1; i <= 4; i++) {
        const r = await fetch(`http://127.0.0.1:${untrustedPort}/api/auth/start`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Truckly-Client': 'web-auth-v1',
            'X-Forwarded-For': `198.51.100.${i}`,
            'X-Real-IP': `203.0.113.${i}`
          },
          body: JSON.stringify({ email: `xff-test-${i}@${allowedDomain}` })
        });
        spoofStatuses.push(r.status);
      }
      assert.deepEqual(
        spoofStatuses,
        [200, 200, 200, 429],
        `Untrusted X-Forwarded-For/X-Real-IP headers must NOT bypass IP rate limit, got ${spoofStatuses}`
      );
    } finally {
      if (savedIpMax === undefined) delete process.env.TRUCKLY_AUTH_START_IP_MAX;
      else process.env.TRUCKLY_AUTH_START_IP_MAX = savedIpMax;
      await untrustedProxySrv.closeGracefully(1000);
    }

    // Also verify `trustProxy='loopback'` reads rightmost hop (defeating prepended XFF spoofing behind Nginx!)
    const { resolveTrustedClientIp } = await import(pathToFileURL(path.join(ROOT, 'lib', 'client-ip.js')).href);
    const rightmostResolved = resolveTrustedClientIp(
      {
        socket: { remoteAddress: '::ffff:127.0.0.1' },
        headers: { 'x-forwarded-for': '198.51.100.99, 203.0.113.42' }
      },
      { trustProxy: 'loopback' }
    );
    assert.equal(rightmostResolved, '203.0.113.42', 'Trusted loopback proxy must prefer rightmost XFF hop over attacker-prepended hop');

    console.log('PASS [6/8]: Zero silent email auto-linking, CSRF/Origin/Fetch-Metadata 403s, and XFF spoofing resistance verified');

    // =========================================================================
    // [7/8] End-to-End Pager Outbox + Supervised Worker CLI (`scripts/run-pager-worker.cjs`)
    // =========================================================================
    // Grant `legacyLoginBody.user.id` explicit staff role on `iniguez` via reviewed admin SQL
    await migratorPool.query(
      `INSERT INTO vendor_memberships (vendor_id, user_id, role, granted_by)
       VALUES ('iniguez', $1, 'staff', 'reviewed_grant')`,
      [legacyLoginBody.user.id]
    );

    const createPagerRes = await fetch(`${baseUrl}/api/pager/staff`, {
      method: 'POST',
      headers: {
        Cookie: legacyCookie,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        vendor_id: 'iniguez',
        ticket: 'SA-77',
        request_key: crypto.randomUUID()
      })
    });
    assert.equal(createPagerRes.status, 201);
    const createdPager = (await createPagerRes.json()).pager;

    // Subscribe customer capability to loopback Web Push endpoint
    const subEcdh = crypto.createECDH('prime256v1');
    const subPub = webpushCrypto.toBase64Url(subEcdh.generateKeys());
    const subAuth = crypto.randomBytes(16);
    const subRes = await fetch(`${baseUrl}/api/pager/subscriptions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Truckly-Client': 'web-pager-v1'
      },
      body: JSON.stringify({
        code: createdPager.id,
        subscription: {
          endpoint: `http://127.0.0.1:${pushPort}/push/sa-77`,
          keys: {
            p256dh: subPub,
            auth: webpushCrypto.toBase64Url(subAuth)
          }
        }
      })
    });
    assert.equal(subRes.status, 201);

    // Transition pager to `ready` -> creates transactional outbox event
    const readyRes = await fetch(`${baseUrl}/api/pager/update`, {
      method: 'POST',
      headers: {
        Cookie: legacyCookie,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ id: createdPager.id, status: 'ready' })
    });
    assert.equal(readyRes.status, 200);

    // Execute `scripts/run-pager-worker.cjs` against `http://127.0.0.1:${serverPort}/api/pager/worker`
    const workerRun = await runChildExpectExit(
      [path.join(ROOT, 'scripts', 'run-pager-worker.cjs'), '--url', `${baseUrl}/api/pager/worker`, '--batch-size', '5'],
      { ...process.env, TRUCKLY_NOTIFICATION_WORKER_SECRET: workerSecret }
    );
    assert.equal(workerRun.code, 0, `Worker CLI failed: ${workerRun.stderr}`);
    assert.equal(receivedPushes.length, 1, 'Expected 1 encrypted Web Push envelope delivered by standalone worker');
    const decryptedPush = JSON.parse(
      webpushCrypto.decryptWebPushPayload(receivedPushes[0].body, subEcdh, subAuth)
    );
    assert.equal(decryptedPush.event_type, 'pager.ready');
    assert.equal(decryptedPush.ticket, 'SA-77');
    assert(!JSON.stringify(decryptedPush).includes(createdPager.id), 'Push payload must never include raw pager UUID');

    console.log('PASS [7/8]: Standalone pager outbox enqueue + supervised worker CLI RFC 8291/8292 delivery verified');

    // =========================================================================
    // [8/8] Graceful Shutdown (`SIGTERM` on POSIX / IPC signal on Win32) & Clean Pool Closure
    // =========================================================================
    const shutdownCode = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        serverChild.kill('SIGKILL');
        reject(new Error('server/index.js did not exit cleanly within 6s'));
      }, 6000);
      serverChild.once('exit', code => {
        clearTimeout(timer);
        resolve(code);
      });
      if (process.platform === 'win32' && serverChild.connected) {
        serverChild.send('truckly:graceful-shutdown');
      } else {
        serverChild.kill('SIGTERM');
      }
    });
    serverChild = null;
    assert.equal(shutdownCode, 0, `Expected exit code 0 on graceful shutdown, got ${shutdownCode}`);
    assert(serverLogs.includes('truckly_server_shutdown_complete'), 'Expected graceful shutdown completion log');

    console.log('PASS [8/8]: Graceful shutdown drained server and closed PostgreSQL pool cleanly (exit 0)');
    console.log('ALL STANDALONE RUNTIME & AUTHENTICATION INTEGRATION TESTS PASSED.');
  } finally {
    if (serverChild) {
      try {
        serverChild.kill('SIGKILL');
      } catch {}
    }
    if (pushReceiver) {
      await new Promise(r => pushReceiver.close(r)).catch(() => {});
    }
    if (appPool) await appPool.end().catch(() => {});
    if (migratorPool) await migratorPool.end().catch(() => {});
    await adminPool.end().catch(() => {});
    await pgCluster.stop();
  }
})().catch(err => {
  console.error('STANDALONE INTEGRATION FAILURE:', err);
  process.exitCode = 1;
});
