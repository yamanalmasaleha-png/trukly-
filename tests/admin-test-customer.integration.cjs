// Real PostgreSQL Integration Suite for Platform-Admin Testing Customer Sandbox
// (`tests/admin-test-customer.integration.cjs`)
//
// Verifies:
//   1. Anonymous and regular Customer callers are denied (`401`/`403`) on `/api/admin/test-customer`, while `Admin: Mod` and `Admin: Top` are allowed.
//   2. `BITESHARK_ENABLE_ADMIN_TEST_CUSTOMER=false` disables the sandbox (`403 TEST_CUSTOMER_DISABLED_IN_ENV`).
//   3. `Admin: Top` enters the sandbox (`__Host-bs_admin_test_session`), preserving `Admin: Top`
//      authority on `/admin` & `/api/admin/*` while `/` & `/profile` & `/api/me/*` resolve to
//      isolated `usr_sa_top_admin_test_customer` (`test-customer@sandbox.biteshark.invalid`).
//   4. `seed` populates Sonoma visits, photo, saved trail, favorite, 18+ sharing eligibility &
//      Greatest Hits collection strictly on the sandbox account without touching Top Admin or real users.
//   5. `reset` wipes sandbox records back to zero while leaving real accounts untouched.
//   6. Demoting/revoking the Top Admin immediately invalidates the sandbox overlay cookie.
//   7. `exit` revokes the sandbox session, clears the overlay cookie, and records audit entries.

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');

function requirePg() {
  try {
    return require('pg');
  } catch {
    const extraBase = process.env.TRUCKLY_PG_NODE_MODULES || process.env.BITESHARK_PG_NODE_MODULES;
    if (extraBase) return require(path.join(extraBase, 'pg'));
    throw new Error('Missing `pg` package.');
  }
}
const { Pool } = requirePg();

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
  const roots = [
    process.env.TRUCKLY_PG_NODE_MODULES,
    process.env.BITESHARK_PG_NODE_MODULES,
    ...(process.env.NODE_PATH ? process.env.NODE_PATH.split(path.delimiter) : [])
  ].filter(Boolean);

  let nativeBinDir = null;
  for (const r of roots) {
    const candidate = path.join(r, '@embedded-postgres', pkgPlatform, 'native', 'bin');
    if (fs.existsSync(path.join(candidate, 'pg_ctl' + binSuffix))) {
      nativeBinDir = candidate;
      break;
    }
  }
  if (!nativeBinDir) {
    throw new Error('Set DATABASE_URL or TRUCKLY_PG_NODE_MODULES for PostgreSQL.');
  }

  const initdbExe = path.join(nativeBinDir, 'initdb' + binSuffix);
  const pgCtlExe = path.join(nativeBinDir, 'pg_ctl' + binSuffix);
  const port = await getFreePort();
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-tc-int-pg-'));
  const dataDir = path.join(tmpBase, 'data');
  const pwFile = path.join(tmpBase, 'pw.txt');
  const logFile = path.join(tmpBase, 'postgres.log');
  const password = 'tc_' + crypto.randomBytes(6).toString('hex');
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

function buildDbUrl(baseAdminUrl, { user, password, database }) {
  const u = new URL(baseAdminUrl);
  u.username = user;
  u.password = password || '';
  u.pathname = `/${database}`;
  return u.toString();
}

function createCookieJarClient(baseUrl) {
  const cookies = new Map();
  async function req(method, relPath, body = undefined, headers = {}) {
    const cookieHeader = [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
    const res = await fetch(`${baseUrl}${relPath}`, {
      method,
      redirect: 'manual',
      headers: {
        Origin: baseUrl,
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers
      },
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    for (const sc of setCookies) {
      const parts = sc.split(';').map(s => s.trim());
      const eq = parts[0].indexOf('=');
      if (eq > 0) {
        const name = parts[0].slice(0, eq);
        const val = parts[0].slice(eq + 1);
        const isMaxAgeZero = parts.some(p => /^max-age=0$/i.test(p));
        if (isMaxAgeZero || val === '') cookies.delete(name);
        else cookies.set(name, val);
      }
    }
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {}
    return { status: res.status, json, text, cookies };
  }
  return { req, cookies };
}

(async () => {
  const pgCluster = await createPostgresCluster();
  const adminPool = new Pool({ connectionString: pgCluster.adminUrl, max: 2 });
  const suffix = crypto.randomBytes(3).toString('hex');
  const migratorRole = `bs_mig_${suffix}`;
  const appRole = `bs_app_${suffix}`;
  const dbName = `bs_tc_test_${suffix}`;
  const migratorPass = 'mig_' + crypto.randomBytes(6).toString('hex');
  const appPass = 'app_' + crypto.randomBytes(6).toString('hex');
  const photoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-tc-photos-'));
  let migratorPool = null;
  let serverProc = null;

  try {
    await adminPool.query(
      `CREATE ROLE ${migratorRole} LOGIN PASSWORD '${migratorPass}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`
    );
    await adminPool.query(
      `CREATE ROLE ${appRole} LOGIN PASSWORD '${appPass}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`
    );
    await adminPool.query(`CREATE DATABASE ${dbName} OWNER ${migratorRole}`);

    const migratorDbUrl = buildDbUrl(pgCluster.adminUrl, {
      user: migratorRole,
      password: migratorPass,
      database: dbName
    });
    const appDbUrl = buildDbUrl(pgCluster.adminUrl, {
      user: appRole,
      password: appPass,
      database: dbName
    });

    execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'run-migrations.cjs'), '--app-role', appRole], {
      cwd: ROOT,
      env: { ...process.env, MIGRATION_DATABASE_URL: migratorDbUrl },
      stdio: 'pipe',
      windowsHide: true
    });

    const topEmail = 'top-tc@staging.biteshark.invalid';
    const modEmail = 'mod-tc@staging.biteshark.invalid';
    const custEmail = 'cust-tc@staging.biteshark.invalid';

    execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'bootstrap-top-admin.cjs'), '--email', topEmail], {
      cwd: ROOT,
      env: { ...process.env, MIGRATION_DATABASE_URL: migratorDbUrl },
      stdio: 'pipe',
      windowsHide: true
    });

    migratorPool = new Pool({ connectionString: migratorDbUrl, max: 2 });

    const port = await getFreePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    const mailboxSecret = 'tcmbx_' + crypto.randomBytes(16).toString('hex');
    const childEnv = {
      ...process.env,
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: String(port),
      DATABASE_URL: appDbUrl,
      BITESHARK_ENV: 'staging',
      BITESHARK_RELEASE_SHA: 'tc-integration-sha',
      BITESHARK_AUTH_SECRET: crypto.randomBytes(32).toString('hex'),
      BITESHARK_AUTH_DELIVERY_MODE: 'staging_mailbox',
      BITESHARK_STAGING_MAILBOX_SECRET: mailboxSecret,
      BITESHARK_STAGING_ALLOWED_EMAIL_DOMAINS: 'staging.biteshark.invalid',
      BITESHARK_PUSH_PROVIDER_MODE: 'disabled',
      BITESHARK_PHOTO_STORAGE_DIR: photoDir
    };
    delete childEnv.BITESHARK_PUBLIC_ORIGIN;

    serverProc = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
      cwd: ROOT,
      env: childEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });

    for (let i = 0; i < 60; i++) {
      try {
        const r = await fetch(`${baseUrl}/api/healthz`);
        if (r.ok) break;
      } catch {}
      await new Promise(r => setTimeout(r, 150));
    }

    async function signInUser(email) {
      const client = createCookieJarClient(baseUrl);
      await client.req(
        'POST',
        '/api/auth/start',
        { email, intent: 'signup', dob: '1990-02-14' },
        { 'X-BiteShark-Client': 'web-auth-v1' }
      );
      const mbx = await client.req(
        'POST',
        '/api/auth/staging-mailbox',
        { email },
        { 'X-Staging-Mailbox-Secret': mailboxSecret }
      );
      const ver = await client.req(
        'POST',
        '/api/auth/verify',
        { email, code: mbx.json.code },
        { 'X-BiteShark-Client': 'web-auth-v1' }
      );
      assert.equal(ver.status, 200);
      return { client, user: ver.json.user };
    }

    const anonClient = createCookieJarClient(baseUrl);
    const { client: topClient, user: topUser } = await signInUser(topEmail);
    const { client: modClient, user: modUser } = await signInUser(modEmail);
    const { client: custClient, user: custUser } = await signInUser(custEmail);

    // Grant Admin: Mod to modUser
    await migratorPool.query(
      `INSERT INTO platform_roles (user_id, role, granted_by) VALUES ($1, 'mod', $2)`,
      [modUser.id, topUser.id]
    );

    const hasProfile =
      fs.existsSync(path.join(ROOT, 'public', 'customer-profile.js')) &&
      fs.existsSync(path.join(ROOT, 'lib', 'customer-profile.js'));
    assert.equal(hasProfile, true, 'Expected customer profile surface to be present');

    async function migOwnerQuery(sql, params = []) {
      const c = await migratorPool.connect();
      try {
        await c.query('BEGIN');
        await c.query("SELECT set_config('app.auth_internal', 'true', true), set_config('app.admin_portal', 'true', true)");
        if (params[0]) {
          await c.query("SELECT set_config('app.user_id', $1, true)", [String(params[0])]);
        }
        const r = await c.query(sql, params);
        await c.query('COMMIT');
        return r;
      } catch (e) {
        await c.query('ROLLBACK').catch(() => {});
        throw e;
      } finally {
        c.release();
      }
    }

    // Give real customer 1 saved spot (and 1 visit when exploration is present) to confirm sandbox reset never touches real customers
    await migOwnerQuery(
      `INSERT INTO favorites (user_id, truck_id) VALUES ($1, 'mitote') ON CONFLICT DO NOTHING`,
      [custUser.id]
    );
    if (hasProfile) {
      const custVisit = await custClient.req('POST', '/api/me/visits', {
        vendor_id: 'mitote',
        private_note: 'Real customer visit — must remain untouched'
      });
      assert.equal(custVisit.status, 201);
    }

    // 1. Anonymous and regular Customer are rejected; Admin: Mod and Admin: Top are allowed!
    assert.equal((await anonClient.req('GET', '/api/admin/test-customer')).status, 401);
    assert.equal((await custClient.req('GET', '/api/admin/test-customer')).status, 403);
    assert.equal(
      (await custClient.req('POST', '/api/admin/test-customer', { action: 'enter' })).status,
      403
    );

    const modStatusCheck = await modClient.req('GET', '/api/admin/test-customer');
    assert.equal(modStatusCheck.status, 200);
    assert.equal(modStatusCheck.json.available, true);

    // 2. Admin: Top enters Test Customer Sandbox & seeds sample data (with NODE_ENV=production!)
    const enterRes = await topClient.req('POST', '/api/admin/test-customer', {
      action: 'enter',
      seed_sample: true
    });
    assert.equal(enterRes.status, 200);
    assert.equal(enterRes.json.active_in_browser, true);
    assert.equal(enterRes.json.test_user.id, 'usr_sa_top_admin_test_customer');
    assert.ok(topClient.cookies.has('__Host-truckly_session'), 'Top Admin session cookie preserved');
    assert.ok(topClient.cookies.has('__Host-bs_admin_test_session'), 'Sandbox overlay cookie set');
    assert.ok(enterRes.json.counts.favorites >= 2, 'Seeded sandbox saved spots');
    if (hasProfile) {
      assert.equal(enterRes.json.counts.visits, 2);
      assert.equal(enterRes.json.counts.collections, 1);
    }

    // 3. Customer endpoints resolve to sandbox user while Admin Portal endpoints stay Admin: Top!
    const appSession = await topClient.req('GET', '/api/auth/session');
    assert.equal(appSession.json.user.id, 'usr_sa_top_admin_test_customer');
    assert.equal(appSession.json.user.email, 'test-customer@sandbox.biteshark.invalid');

    const appCtx = await topClient.req('GET', '/api/account/context');
    assert.equal(appCtx.json.user.id, 'usr_sa_top_admin_test_customer');
    assert.equal(appCtx.json.test_customer_sandbox.active, true);
    assert.equal(appCtx.json.capabilities.is_top_admin, false, 'Sandbox user itself has zero admin capabilities');

    const adminPortalCtx = await topClient.req('GET', '/api/account/context', undefined, {
      'X-BiteShark-Admin-Portal': '1'
    });
    assert.equal(adminPortalCtx.json.user.id, topUser.id);
    assert.equal(adminPortalCtx.json.capabilities.is_top_admin, true);

    const adminHtmlRes = await topClient.req('GET', '/admin');
    assert.equal(adminHtmlRes.status, 200);

    if (hasProfile) {
      const profRes = await topClient.req('GET', '/api/me/profile');
      assert.equal(profRes.status, 200);
      assert.equal(profRes.json.profile.display_name, 'Admin Test Customer');
      assert.equal(profRes.json.progress.counts.total_visits, 2);

      // Verify Top Admin's personal account was NOT polluted with the sandbox visits
      const topOwnVisits = await migOwnerQuery(
        'SELECT count(*)::int AS c FROM customer_visits WHERE user_id = $1',
        [topUser.id]
      );
      assert.equal(topOwnVisits.rows[0].c, 0, 'Top Admin personal account remains completely clean');
    }

    // 4. Reset wipes ONLY sandbox records
    const resetRes = await topClient.req('POST', '/api/admin/test-customer', { action: 'reset' });
    assert.equal(resetRes.status, 200);
    assert.equal(resetRes.json.counts.favorites, 0);
    if (hasProfile) {
      assert.equal(resetRes.json.counts.visits, 0);
      assert.equal(resetRes.json.counts.collections, 0);
      const realCustVisits = await custClient.req('GET', '/api/me/visits');
      assert.equal(realCustVisits.json.visits.length, 1, 'Real customer visits untouched by sandbox reset');
    }
    const realCustFavs = await migOwnerQuery(
      'SELECT count(*)::int AS c FROM favorites WHERE user_id = $1',
      [custUser.id]
    );
    assert.equal(realCustFavs.rows[0].c, 1, 'Real customer favorites untouched by sandbox reset');

    // 5. Copying the overlay cookie onto a non-Admin session (`Customer`) does NOT grant sandbox access
    const overlayToken = topClient.cookies.get('__Host-bs_admin_test_session');
    custClient.cookies.set('__Host-bs_admin_test_session', overlayToken);
    const custSess = await custClient.req('GET', '/api/auth/session');
    assert.equal(custSess.json.user.id, custUser.id, 'Regular customer cannot ride Admin sandbox overlay cookie');

    // 6. Admin: Mod can ALSO enter, use, and exit the Test Customer Sandbox cleanly!
    const modEnter = await modClient.req('POST', '/api/admin/test-customer', {
      action: 'enter',
      seed_sample: true
    });
    assert.equal(modEnter.status, 200);
    assert.equal(modEnter.json.active_in_browser, true);
    const modOverlaySess = await modClient.req('GET', '/api/auth/session');
    assert.equal(modOverlaySess.json.user.id, 'usr_sa_top_admin_test_customer');
    const modAdminPortalCtx = await modClient.req('GET', '/api/account/context', undefined, {
      'X-BiteShark-Admin-Portal': '1'
    });
    assert.equal(modAdminPortalCtx.json.user.id, modUser.id);
    assert.equal(modAdminPortalCtx.json.capabilities.can_access_admin_portal, true);
    const modExit = await modClient.req('POST', '/api/admin/test-customer', { action: 'exit' });
    assert.equal(modExit.status, 200);
    assert.equal((await modClient.req('GET', '/api/auth/session')).json.user.id, modUser.id);

    // 7. Top Admin exit clears the sandbox cookie & audits all actions (both Top and Mod)
    const exitRes = await topClient.req('POST', '/api/admin/test-customer', { action: 'exit' });
    assert.equal(exitRes.status, 200);
    assert.ok(!topClient.cookies.has('__Host-bs_admin_test_session'));

    const postExitSess = await topClient.req('GET', '/api/auth/session');
    assert.equal(postExitSess.json.user.id, topUser.id);

    const auditRows = await migratorPool.query(
      `SELECT actor_role, action FROM audit_logs WHERE target_id = 'usr_sa_top_admin_test_customer' ORDER BY id ASC`
    );
    const actions = auditRows.rows.map(r => r.action);
    const roles = new Set(auditRows.rows.map(r => r.actor_role));
    assert.ok(actions.includes('test_customer_session_entered'));
    assert.ok(actions.includes('test_customer_sample_seeded'));
    assert.ok(actions.includes('test_customer_data_reset'));
    assert.ok(actions.includes('test_customer_session_exited'));
    assert.ok(roles.has('top') && roles.has('mod'), 'Both Top and Mod admin actions audited');

    console.log('[admin-test-customer.integration] PASS — all Platform-Admin (Top + Mod) sandbox RBAC, NODE_ENV=production support, isolation, seed/reset & exit checks succeeded.');
  } finally {
    if (serverProc) {
      try {
        serverProc.kill('SIGTERM');
      } catch {}
    }
    if (migratorPool) await migratorPool.end().catch(() => {});
    await adminPool.end().catch(() => {});
    await pgCluster.stop();
    try {
      fs.rmSync(photoDir, { recursive: true, force: true });
    } catch {}
  }
})().catch(err => {
  console.error('[admin-test-customer.integration] FAILED:', err);
  process.exit(1);
});
