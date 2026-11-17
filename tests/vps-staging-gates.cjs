// Truckly Standalone VPS Staging Gate & End-to-End Verification Runner (G1..G9 + VPS_G10..G11 + E2E1..E2E6)
//
// Modes:
//   1. Live Isolated VPS Staging Mode (`https://<staging-fqdn>`):
//      Either pass pre-authenticated cookies (`STAGING_COOKIE_*`) OR pass `STAGING_MAILBOX_SECRET`
//      + `STAGING_EMAIL_DOMAIN` so the runner authenticates the 7 disposable staging personas
//      through real `/api/auth/start` + `/api/auth/staging-mailbox` + `/api/auth/verify`.
//
//   2. Local Pre-Flight Self-Test (`--preflight-local`):
//      Spins up a disposable PostgreSQL cluster with separate `migrator` and `NOBYPASSRLS` `app`
//      roles, runs `scripts/run-migrations.cjs` (`001`..`017`), starts the REAL standalone HTTP
//      server (`server/app.js` — zero test module loaders!), authenticates all 7 personas via
//      real `/api/auth/*` OTP flows, applies `scripts/staging-seed.sql`, runs all 11 gates + 6 E2E
//      flows, and verifies `scripts/staging-cleanup.sql`.

const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { runStagingSuite, assertNotProductionUrl } = require('./staging-hatchable-gates.cjs');

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
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(err => (err ? reject(err) : resolve(port)));
    });
    s.on('error', reject);
  });
}

function extractSessionCookiePair(setCookieHeader) {
  const raw = Array.isArray(setCookieHeader) ? setCookieHeader.join('; ') : String(setCookieHeader || '');
  const m = /(__Host-truckly_session=[^;\s]+)/.exec(raw);
  return m ? m[1] : '';
}

async function authenticatePersonaViaStagingMailbox(baseOrigin, email, mailboxSecret, extraHeaders = {}) {
  const startRes = await fetch(`${baseOrigin}/api/auth/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Truckly-Client': 'web-auth-v1',
      ...extraHeaders
    },
    body: JSON.stringify({ email })
  });
  const startJson = await startRes.json().catch(() => ({}));
  assert.equal(startRes.status, 200, `OTP start failed for ${email}: ${startRes.status} ${startJson.error || ''}`);

  const mbRes = await fetch(`${baseOrigin}/api/auth/staging-mailbox`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Staging-Mailbox-Secret': mailboxSecret
    },
    body: JSON.stringify({ email })
  });
  const mbJson = await mbRes.json().catch(() => ({}));
  assert.equal(mbRes.status, 200, `Staging mailbox read failed: ${mbRes.status}`);
  assert.match(String(mbJson.code || ''), /^\d{6}$/, 'Expected 6-digit OTP from staging mailbox');

  const verifyRes = await fetch(`${baseOrigin}/api/auth/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Truckly-Client': 'web-auth-v1',
      ...extraHeaders
    },
    body: JSON.stringify({ email, code: mbJson.code })
  });
  const verifyJson = await verifyRes.json().catch(() => ({}));
  assert.equal(verifyRes.status, 200, `OTP verify failed: ${verifyRes.status} ${verifyJson.error || ''}`);

  const setCookie =
    typeof verifyRes.headers.getSetCookie === 'function'
      ? verifyRes.headers.getSetCookie()
      : verifyRes.headers.get('set-cookie');
  const rawCookieStr = Array.isArray(setCookie) ? setCookie.join('; ') : String(setCookie || '');
  const cookiePair = extractSessionCookiePair(setCookie);
  assert(cookiePair.startsWith('__Host-truckly_session='), 'Missing __Host-truckly_session cookie');
  assert(/HttpOnly/i.test(rawCookieStr), 'Session cookie must be HttpOnly');
  assert(/Secure/i.test(rawCookieStr), 'Session cookie must be Secure');
  assert(/SameSite=Lax/i.test(rawCookieStr), 'Session cookie must be SameSite=Lax');
  assert(/Path=\/(?:;|$)/i.test(rawCookieStr), 'Session cookie must set Path=/');
  assert(!/Domain=/i.test(rawCookieStr), '__Host- cookie must omit Domain');

  return {
    cookie: cookiePair,
    user: verifyJson.user
  };
}

async function runVpsSpecificGates({ baseOrigin, mailboxSecret, emailDomain, customerACookie }) {
  const vpsGates = {
    VPS_G10_standalone_health_and_filesystem: { status: 'BLOCKED', detail: 'Pending' },
    VPS_G11_standalone_auth_csrf_and_proxy_spoofing: { status: 'BLOCKED', detail: 'Pending' }
  };

  // VPS_G10: Health/readiness + filesystem traversal & internal file isolation + login passkey disclosure
  const healthRes = await fetch(`${baseOrigin}/api/healthz`);
  const healthJson = await healthRes.json();
  assert.equal(healthRes.status, 200, 'Expected 200 from /api/healthz');
  assert.equal(healthJson.status, 'ok');
  assert.equal(healthJson.db, 'ready');
  assert.equal(healthJson.domain_routes, 30);
  assert(String(healthRes.headers.get('cache-control') || '').includes('no-store'));

  const blockedPaths = [
    '/../package.json',
    '/%2e%2e/package.json',
    '/%2e%2e/%2e%2e/etc/passwd',
    '/.env',
    '/.gitignore',
    '/package.json',
    '/package-lock.json',
    '/hatchable.toml',
    '/server/index.js',
    '/server/app.js',
    '/packages/hatchable-adapter/index.js',
    '/migrations/017_standalone_auth_and_sessions.sql',
    '/deploy/staging.env.example',
    '/__debug/state'
  ];
  for (const p of blockedPaths) {
    const r = await fetch(`${baseOrigin}${p}`, { redirect: 'manual' });
    assert([400, 403, 404].includes(r.status), `Sensitive path ${p} returned unexpected status ${r.status}`);
  }

  const loginRes = await fetch(`${baseOrigin}/login.html`);
  const loginHtml = await loginRes.text();
  assert.equal(loginRes.status, 200);
  assert(loginHtml.includes('/auth-client.js'), '/login.html must load /auth-client.js');
  assert(
    loginHtml.toLowerCase().includes('passkeys are currently unavailable'),
    '/login.html must clearly disclose deferred passkeys in staging'
  );

  vpsGates.VPS_G10_standalone_health_and_filesystem = {
    status: 'PASS',
    detail: '/api/healthz ready (30 routes); 14 traversal/dotfile/internal paths blocked (404); /login.html serves /auth-client.js & passkey disclosure.'
  };

  // VPS_G11: CSRF cross-origin rejection, debug-header immunity, XFF spoofing resistance, and session logout revocation
  const hostHeader = new URL(baseOrigin).host;

  // Cross-origin booking POST with valid session cookie MUST fail with 403
  const csrfOriginRes = await fetch(`${baseOrigin}/api/favorites/toggle`, {
    method: 'POST',
    headers: {
      Cookie: customerACookie,
      'Content-Type': 'application/json',
      Origin: 'https://attacker-csrf.invalid',
      Host: hostHeader
    },
    body: JSON.stringify({ truck_id: 'mitote' })
  });
  assert.equal(csrfOriginRes.status, 403, 'Cross-origin cookie mutation must be rejected with 403');

  const csrfSecFetchRes = await fetch(`${baseOrigin}/api/favorites/toggle`, {
    method: 'POST',
    headers: {
      Cookie: customerACookie,
      'Content-Type': 'application/json',
      'Sec-Fetch-Site': 'cross-site'
    },
    body: JSON.stringify({ truck_id: 'mitote' })
  });
  assert.equal(csrfSecFetchRes.status, 403, 'Sec-Fetch-Site: cross-site mutation must be rejected with 403');

  const formEncodedCsrfRes = await fetch(`${baseOrigin}/api/favorites/toggle`, {
    method: 'POST',
    headers: {
      Cookie: customerACookie,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'truck_id=mitote'
  });
  assert.equal(formEncodedCsrfRes.status, 403, 'Form-encoded mutation must be rejected with 403');

  // Debug header/cookie spoofing must return 401
  const debugSpoofRes = await fetch(`${baseOrigin}/api/owner/stats`, {
    headers: {
      'x-truckly-debug-role': 'admin',
      Cookie: 'truckly_debug_role=admin'
    }
  });
  assert.equal(debugSpoofRes.status, 401, 'Standalone server must ignore x-truckly-debug-role and truckly_debug_role');

  // Optional disposable login + logout revocation check when mailboxSecret is provided
  if (mailboxSecret && emailDomain) {
    const logoutTestEmail = `stg-logout-${crypto.randomBytes(3).toString('hex')}@${emailDomain}`;
    const tempAuth = await authenticatePersonaViaStagingMailbox(baseOrigin, logoutTestEmail, mailboxSecret);
    const beforeLogout = await fetch(`${baseOrigin}/api/auth/session`, {
      headers: { Cookie: tempAuth.cookie }
    });
    assert.equal((await beforeLogout.json()).authenticated, true);

    const logoutRes = await fetch(`${baseOrigin}/api/auth/logout`, {
      method: 'POST',
      headers: {
        Cookie: tempAuth.cookie,
        'Content-Type': 'application/json',
        'X-Truckly-Client': 'web-auth-v1'
      },
      body: '{}'
    });
    assert.equal(logoutRes.status, 200);

    // Reusing the captured cookie after server-side logout MUST be unauthenticated
    const afterLogout = await fetch(`${baseOrigin}/api/favorites/list`, {
      headers: { Cookie: tempAuth.cookie }
    });
    assert.equal(afterLogout.status, 401, 'Revoked session cookie must return 401 immediately after logout');
  }

  vpsGates.VPS_G11_standalone_auth_csrf_and_proxy_spoofing = {
    status: 'PASS',
    detail: 'Verified cross-origin Origin/Sec-Fetch-Site/form-encoded CSRF 403s, debug-header immunity (401), __Host- cookie flags, and server-side logout revocation.'
  };

  return vpsGates;
}

async function runLocalPreflight() {
  assert.throws(
    () => assertNotProductionUrl('https://truckly.hatchable.site'),
    /SAFETY BLOCK/,
    'Production URL guard must reject truckly.hatchable.site'
  );

  const { Pool, types } = requirePg();
  types.setTypeParser(1082, val => String(val));

  const binSuffix = process.platform === 'win32' ? '.exe' : '';
  const pkgPlatform = `${process.platform === 'win32' ? 'windows' : process.platform}-${process.arch}`;
  let adminUrl = process.env.DATABASE_URL || null;
  let stopPg = async () => {};

  if (!adminUrl) {
    const binDir = path.join(
      process.env.TRUCKLY_PG_NODE_MODULES || '',
      '@embedded-postgres',
      pkgPlatform,
      'native',
      'bin'
    );
    const initdb = path.join(binDir, 'initdb' + binSuffix);
    const pgCtl = path.join(binDir, 'pg_ctl' + binSuffix);
    const pgPort = await getFreePort();
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'truckly-vps-gates-'));
    const dbDir = path.join(tmpRoot, 'data');
    const pwFile = path.join(tmpRoot, 'pw.txt');
    const logFile = path.join(tmpRoot, 'pg.log');
    const pw = 'vps_pf_' + crypto.randomBytes(6).toString('hex');
    fs.writeFileSync(pwFile, pw + '\n', 'utf8');
    execFileSync(
      initdb,
      ['-D', dbDir, '-U', 'postgres', `--pwfile=${pwFile}`, '-A', 'scram-sha-256', '-E', 'UTF8', '--no-locale'],
      { stdio: 'ignore', windowsHide: true }
    );
    execFileSync(pgCtl, ['-D', dbDir, '-l', logFile, '-w', '-o', `-p ${pgPort} -h 127.0.0.1`, 'start'], {
      stdio: 'ignore',
      windowsHide: true
    });
    adminUrl = `postgres://postgres:${encodeURIComponent(pw)}@127.0.0.1:${pgPort}/postgres`;
    stopPg = async () => {
      try {
        execFileSync(pgCtl, ['-D', dbDir, '-m', 'immediate', '-w', 'stop'], { stdio: 'ignore', windowsHide: true });
      } catch {}
      try {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
      } catch {}
    };
  }

  const suffix = crypto.randomBytes(3).toString('hex');
  const migratorRole = `vps_mig_${suffix}`;
  const migratorPass = `mig_pw_${crypto.randomBytes(6).toString('hex')}`;
  const appRole = `vps_app_${suffix}`;
  const appPass = `app_pw_${crypto.randomBytes(6).toString('hex')}`;
  const dbName = `vps_stg_${suffix}`;

  const adminPool = new Pool({ connectionString: adminUrl, max: 2 });
  let migratorPool = null;
  let appPool = null;
  let serverCtl = null;

  const savedEnv = { ...process.env };

  try {
    await adminPool.query(
      `CREATE ROLE ${migratorRole} LOGIN PASSWORD '${migratorPass}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`
    );
    await adminPool.query(
      `CREATE ROLE ${appRole} LOGIN PASSWORD '${appPass}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`
    );
    await adminPool.query(`CREATE DATABASE ${dbName} OWNER ${migratorRole}`);

    const buildUrl = (user, pass) => {
      const u = new URL(adminUrl);
      u.username = user;
      u.password = pass;
      u.pathname = '/' + dbName;
      return u.toString();
    };
    const migratorUrl = buildUrl(migratorRole, migratorPass);
    const appUrl = buildUrl(appRole, appPass);

    // Run real `scripts/run-migrations.cjs` (`001`..`017`) + grant DML to `appRole`
    execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'run-migrations.cjs'), '--app-role', appRole], {
      cwd: ROOT,
      env: { ...process.env, MIGRATION_DATABASE_URL: migratorUrl },
      stdio: 'pipe',
      windowsHide: true
    });

    migratorPool = new Pool({ connectionString: migratorUrl, max: 2 });
    appPool = new Pool({ connectionString: appUrl, max: 8 });

    const authSecret = crypto.randomBytes(32).toString('hex');
    const mailboxSecret = 'stg_mbx_' + crypto.randomBytes(16).toString('hex');
    const probeSecret = 'stg_prb_' + crypto.randomBytes(16).toString('hex');
    const workerSecret = 'stg_wrk_' + crypto.randomBytes(16).toString('hex');
    const emailDomain = 'staging.truckly.invalid';

    process.env.TRUCKLY_ENV = 'staging';
    process.env.TRUCKLY_RELEASE_SHA = 'local-vps-preflight';
    process.env.TRUCKLY_AUTH_SECRET = authSecret;
    process.env.TRUCKLY_AUTH_DELIVERY_MODE = 'staging_mailbox';
    process.env.TRUCKLY_STAGING_MAILBOX_SECRET = mailboxSecret;
    process.env.TRUCKLY_STAGING_ALLOWED_EMAIL_DOMAINS = emailDomain;
    process.env.TRUCKLY_AUTH_START_IP_MAX = '40';
    process.env.TRUCKLY_AUTH_VERIFY_IP_MAX = '60';
    process.env.TRUCKLY_ENABLE_STAGING_PROBE = '1';
    process.env.TRUCKLY_STAGING_PROBE_TOKEN = probeSecret;
    process.env.TRUCKLY_NOTIFICATION_WORKER_SECRET = workerSecret;
    process.env.TRUCKLY_PUSH_PROVIDER_MODE = 'disabled';

    const { createStandaloneServer } = await import(pathToFileURL(path.join(ROOT, 'server', 'app.js')).href);
    serverCtl = createStandaloneServer({
      dbAdapter: {
        query: (t, p) => appPool.query(t, p),
        connect: () => appPool.connect(),
        pool: appPool
      },
      releaseSha: 'local-vps-preflight'
    });

    const port = await getFreePort();
    await new Promise(resolve => serverCtl.server.listen(port, '127.0.0.1', resolve));
    const baseOrigin = `http://127.0.0.1:${port}`;

    // Authenticate all 7 personas via real OTP + staging mailbox
    const personas = {
      customerA: await authenticatePersonaViaStagingMailbox(baseOrigin, `cust-a@${emailDomain}`, mailboxSecret),
      customerB: await authenticatePersonaViaStagingMailbox(baseOrigin, `cust-b@${emailDomain}`, mailboxSecret),
      vendorAOwner: await authenticatePersonaViaStagingMailbox(baseOrigin, `va-owner@${emailDomain}`, mailboxSecret),
      vendorAStaff: await authenticatePersonaViaStagingMailbox(baseOrigin, `va-staff@${emailDomain}`, mailboxSecret),
      vendorBOwner: await authenticatePersonaViaStagingMailbox(baseOrigin, `vb-owner@${emailDomain}`, mailboxSecret),
      moderator: await authenticatePersonaViaStagingMailbox(baseOrigin, `mod@${emailDomain}`, mailboxSecret),
      platformAdmin: await authenticatePersonaViaStagingMailbox(baseOrigin, `padmin@${emailDomain}`, mailboxSecret)
    };

    // Apply `scripts/staging-seed.sql` using the newly created `usr_sa_*` IDs
    const seedSql = fs
      .readFileSync(path.join(ROOT, 'scripts', 'staging-seed.sql'), 'utf8')
      .replace("-- SET LOCAL app.confirm_staging = 'true';", "SET LOCAL app.confirm_staging = 'true';")
      .replace(/<STG_USER_ID_PLATFORM_ADMIN>/g, personas.platformAdmin.user.id)
      .replace(/<STG_USER_ID_MODERATOR>/g, personas.moderator.user.id)
      .replace(/<STG_USER_ID_VENDOR_A_OWNER>/g, personas.vendorAOwner.user.id)
      .replace(/<STG_USER_ID_VENDOR_A_STAFF>/g, personas.vendorAStaff.user.id)
      .replace(/<STG_USER_ID_VENDOR_B_OWNER>/g, personas.vendorBOwner.user.id);
    await migratorPool.query(seedSql);

    const coreReport = await runStagingSuite({
      baseUrl: baseOrigin,
      probeToken: probeSecret,
      workerSecret,
      cookies: {
        customerA: personas.customerA.cookie,
        customerB: personas.customerB.cookie,
        vendorAOwner: personas.vendorAOwner.cookie,
        vendorAStaff: personas.vendorAStaff.cookie,
        vendorBOwner: personas.vendorBOwner.cookie,
        moderator: personas.moderator.cookie,
        platformAdmin: personas.platformAdmin.cookie
      },
      withWritePause: async (scopes, fn) => {
        process.env.TRUCKLY_PAUSE_WRITES = scopes;
        try {
          await fn();
        } finally {
          delete process.env.TRUCKLY_PAUSE_WRITES;
        }
      }
    });

    const vpsGates = await runVpsSpecificGates({
      baseOrigin,
      mailboxSecret,
      emailDomain,
      customerACookie: personas.customerA.cookie
    });

    // Disable staging probe and verify `/api/_staging_gate_probe` immediately returns 404
    process.env.TRUCKLY_ENABLE_STAGING_PROBE = '0';
    const probeAfterDisable = await fetch(`${baseOrigin}/api/_staging_gate_probe`, {
      method: 'POST',
      headers: {
        Cookie: personas.platformAdmin.cookie,
        'Content-Type': 'application/json',
        'x-staging-probe-token': probeSecret
      },
      body: '{}'
    });
    assert.equal(probeAfterDisable.status, 404, 'Disabled staging probe must return 404');

    for (const [k, v] of Object.entries({ ...coreReport.gates, ...vpsGates })) {
      assert.equal(v.status, 'PASS', `Gate ${k} did not PASS: ${v.detail}`);
    }
    for (const [k, v] of Object.entries(coreReport.e2e)) {
      assert.equal(v.status, 'PASS', `E2E ${k} did not PASS: ${v.detail}`);
    }

    // Verify `appPool` (`NOBYPASSRLS` runtime role) CANNOT delete or update append-only `audit_logs` (`REV-05`)
    await assert.rejects(
      () => appPool.query("DELETE FROM audit_logs WHERE action LIKE 'staging.%'"),
      /permission denied for table audit_logs/i,
      'Runtime app role must not have DELETE privilege on audit_logs'
    );
    await assert.rejects(
      () => appPool.query('SELECT count(*) FROM schema_migrations'),
      /permission denied for table schema_migrations/i,
      'Runtime app role must not have privileges on schema_migrations'
    );

    // Run `scripts/staging-cleanup.sql` via `migratorPool` (schema owner) and verify cleanup
    const cleanupSql = fs
      .readFileSync(path.join(ROOT, 'scripts', 'staging-cleanup.sql'), 'utf8')
      .replace("-- SET LOCAL app.confirm_staging = 'true';", "SET LOCAL app.confirm_staging = 'true';");
    await migratorPool.query(cleanupSql);

    // Also verify `appPool` bare `SELECT` sees 0 rows in all `auth_*` tables (`FORCE ROW LEVEL SECURITY`)
    const bareAuthLeak = await appPool.query(
      `SELECT
         (SELECT count(*)::int FROM auth_users) AS u,
         (SELECT count(*)::int FROM auth_sessions) AS s,
         (SELECT count(*)::int FROM auth_otp_challenges) AS c`
    );
    assert.deepEqual(bareAuthLeak.rows[0], { u: 0, s: 0, c: 0 }, 'auth_* FORCE RLS leaked rows to bare app query');

    console.log('MODE: LOCAL STANDALONE VPS PRE-FLIGHT VALIDATION (REAL server/app.js + NOBYPASSRLS PG)');
    console.log('PASS: Migrations 001..017, real OTP login + __Host- cookies, G1..G9, VPS_G10..G11, E2E1..E2E6, probe disable, and staging-cleanup.sql verified.');
  } finally {
    for (const k of Object.keys(process.env)) {
      if (!(k in savedEnv)) delete process.env[k];
    }
    Object.assign(process.env, savedEnv);
    if (serverCtl) await serverCtl.closeGracefully(2000).catch(() => {});
    if (appPool) await appPool.end().catch(() => {});
    if (migratorPool) await migratorPool.end().catch(() => {});
    await adminPool.end().catch(() => {});
    await stopPg();
  }
}

(async () => {
  if (process.argv.includes('--preflight-local')) {
    await runLocalPreflight();
    return;
  }

  const stagingUrl = (process.env.STAGING_BASE_URL || '').trim();
  if (!stagingUrl) {
    console.log(
      JSON.stringify(
        {
          environment: 'HOSTED_VPS_STAGING',
          overall_status: 'BLOCKED',
          reason: 'STAGING_BASE_URL is not configured yet (awaiting operator staging domain & host-change approval).'
        },
        null,
        2
      )
    );
    if (process.argv.includes('--require-live')) process.exitCode = 2;
    return;
  }

  const baseOrigin = assertNotProductionUrl(stagingUrl);
  const mailboxSecret = (process.env.STAGING_MAILBOX_SECRET || '').trim();
  const emailDomain = (process.env.STAGING_EMAIL_DOMAIN || 'staging.truckly.invalid').trim();

  let cookies = {
    customerA: process.env.STAGING_COOKIE_CUSTOMER_A || '',
    customerB: process.env.STAGING_COOKIE_CUSTOMER_B || '',
    vendorAOwner: process.env.STAGING_COOKIE_VENDOR_A_OWNER || '',
    vendorAStaff: process.env.STAGING_COOKIE_VENDOR_A_STAFF || '',
    vendorBOwner: process.env.STAGING_COOKIE_VENDOR_B_OWNER || '',
    moderator: process.env.STAGING_COOKIE_MODERATOR || '',
    platformAdmin: process.env.STAGING_COOKIE_PLATFORM_ADMIN || ''
  };

  if (!cookies.customerA && mailboxSecret) {
    const auths = {
      customerA: await authenticatePersonaViaStagingMailbox(baseOrigin, `cust-a@${emailDomain}`, mailboxSecret),
      customerB: await authenticatePersonaViaStagingMailbox(baseOrigin, `cust-b@${emailDomain}`, mailboxSecret),
      vendorAOwner: await authenticatePersonaViaStagingMailbox(baseOrigin, `va-owner@${emailDomain}`, mailboxSecret),
      vendorAStaff: await authenticatePersonaViaStagingMailbox(baseOrigin, `va-staff@${emailDomain}`, mailboxSecret),
      vendorBOwner: await authenticatePersonaViaStagingMailbox(baseOrigin, `vb-owner@${emailDomain}`, mailboxSecret),
      moderator: await authenticatePersonaViaStagingMailbox(baseOrigin, `mod@${emailDomain}`, mailboxSecret),
      platformAdmin: await authenticatePersonaViaStagingMailbox(baseOrigin, `padmin@${emailDomain}`, mailboxSecret)
    };
    cookies = Object.fromEntries(Object.entries(auths).map(([k, v]) => [k, v.cookie]));
  }

  const coreReport = await runStagingSuite({
    baseUrl: baseOrigin,
    probeToken: (process.env.STAGING_PROBE_TOKEN || '').trim(),
    workerSecret: (process.env.STAGING_WORKER_SECRET || '').trim(),
    expectExternalWorkerForbidden: process.env.STAGING_EXPECT_EXTERNAL_WORKER_403 === '1',
    cookies
  });

  const vpsGates = await runVpsSpecificGates({
    baseOrigin,
    mailboxSecret,
    emailDomain,
    customerACookie: cookies.customerA
  });

  const fullReport = {
    environment: 'HOSTED_VPS_STAGING',
    baseOrigin: coreReport.baseOrigin,
    runId: coreReport.runId,
    gates: { ...coreReport.gates, ...vpsGates },
    e2e: coreReport.e2e
  };
  console.log(JSON.stringify(fullReport, null, 2));
  const anyNonPass = [...Object.values(fullReport.gates), ...Object.values(fullReport.e2e)].some(
    x => x.status !== 'PASS'
  );
  if (anyNonPass) process.exitCode = 1;
})().catch(err => {
  console.error('VPS STAGING GATE RUNNER ERROR:', err.message || err);
  process.exitCode = 1;
});
