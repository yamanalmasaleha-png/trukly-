// BiteShark Controlled Feature Management, Worker Recheck, Dependency DAG,
// Active-Workflow Preservation & CLI Recovery Suite (`tests/feature-controls.integration.cjs`)
//
// Executes against a real PostgreSQL cluster using a non-superuser `NOBYPASSRLS` application role
// and real `createStandaloneServer` HTTP + worker + CLI operations.

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
    const extra = process.env.TRUCKLY_PG_NODE_MODULES || process.env.BITESHARK_PG_NODE_MODULES;
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
  if (process.env.BITESHARK_PG_NODE_MODULES) roots.push(process.env.BITESHARK_PG_NODE_MODULES);
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
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'biteshark-fc-pg-'));
  const dataDir = path.join(tmpBase, 'data');
  const pwFile = path.join(tmpBase, 'pw.txt');
  const logFile = path.join(tmpBase, 'postgres.log');
  const password = 'fc_pw_' + crypto.randomBytes(6).toString('hex');
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

function runChild(args, env, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: ROOT,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
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

function extractSessionCookie(res) {
  const setCookie =
    typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : res.headers.get('set-cookie');
  const joined = Array.isArray(setCookie) ? setCookie.join('; ') : String(setCookie || '');
  const m = /(__Host-truckly_session=[^;\s]+)/.exec(joined);
  return m ? m[1] : '';
}

function futureDateISO(days = 12) {
  const d = new Date(Date.now() + days * 86400 * 1000);
  return d.toISOString().slice(0, 10);
}

(async () => {
  const { Pool } = requirePg();
  const pgCluster = await createPostgresCluster();
  const suffix = crypto.randomBytes(3).toString('hex');
  const dbName = `biteshark_fc_${suffix}`;
  const migratorRole = `bs_fc_mig_${suffix}`;
  const appRole = `bs_fc_app_${suffix}`;
  const migratorPass = 'mig_' + crypto.randomBytes(8).toString('hex');
  const appPass = 'app_' + crypto.randomBytes(8).toString('hex');

  const adminPool = new Pool({ connectionString: pgCluster.adminUrl, max: 3 });
  let migratorPool = null;
  let appPool = null;
  let standalone = null;
  let loopbackPushServer = null;
  const loopbackDeliveries = [];

  try {
    await adminPool.query(`CREATE ROLE ${migratorRole} WITH LOGIN PASSWORD '${migratorPass}' CREATEDB`);
    await adminPool.query(
      `CREATE ROLE ${appRole} WITH LOGIN PASSWORD '${appPass}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`
    );
    await adminPool.query(`CREATE DATABASE ${dbName} OWNER ${migratorRole}`);

    const buildUrl = (user, pass) => {
      const u = new URL(pgCluster.adminUrl);
      u.username = user;
      u.password = pass;
      u.pathname = '/' + dbName;
      return u.toString();
    };
    const migratorUrl = buildUrl(migratorRole, migratorPass);
    const appUrl = buildUrl(appRole, appPass);

    const migRes = await runChild(
      [path.join(ROOT, 'scripts', 'run-migrations.cjs'), '--app-role', appRole],
      { ...process.env, MIGRATION_DATABASE_URL: migratorUrl }
    );
    assert.equal(migRes.code, 0, `Migrations failed: ${migRes.stderr}`);
    assert(migRes.stdout.includes('"newly_applied":26'), `Expected 26 migrations: ${migRes.stdout}`);

    migratorPool = new Pool({ connectionString: migratorUrl, max: 4 });
    appPool = new Pool({ connectionString: appUrl, max: 8 });

    // Start local loopback push receiver for deterministic worker verification
    const pushPort = await getFreePort();
    loopbackPushServer = http.createServer((req, res) => {
      let raw = '';
      req.on('data', d => (raw += d.toString()));
      req.on('end', () => {
        loopbackDeliveries.push({
          url: req.url,
          method: req.method,
          body: raw,
          at: new Date().toISOString()
        });
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ accepted: true }));
      });
    });
    await new Promise((resolve, reject) => {
      loopbackPushServer.listen(pushPort, '127.0.0.1', err => (err ? reject(err) : resolve()));
    });

    const port = await getFreePort();
    const baseOrigin = `http://127.0.0.1:${port}`;
    const mailboxSecret = 'mbx_' + crypto.randomBytes(24).toString('hex');
    const authSecret = crypto.randomBytes(32).toString('hex');
    const workerSecret = 'wrk_' + crypto.randomBytes(24).toString('hex');
    const subSalt = 'sub_' + crypto.randomBytes(24).toString('hex');

    process.env.BITESHARK_ENV = 'staging';
    delete process.env.BITESHARK_PUBLIC_ORIGIN;
    delete process.env.TRUCKLY_PUBLIC_ORIGIN;
    delete process.env.BITESHARK_PAUSE_WRITES;
    delete process.env.TRUCKLY_PAUSE_WRITES;
    delete process.env.BITESHARK_DISABLE_SUBSCRIPTIONS;
    delete process.env.TRUCKLY_DISABLE_SUBSCRIPTIONS;
    delete process.env.BITESHARK_DISABLE_NOTIFICATION_DELIVERY;
    delete process.env.TRUCKLY_DISABLE_NOTIFICATION_DELIVERY;
    process.env.BITESHARK_AUTH_START_IP_MAX = '100';
    process.env.BITESHARK_AUTH_VERIFY_IP_MAX = '100';
    process.env.BITESHARK_AUTH_SECRET = authSecret;
    process.env.BITESHARK_AUTH_DELIVERY_MODE = 'staging_mailbox';
    process.env.BITESHARK_STAGING_MAILBOX_SECRET = mailboxSecret;
    process.env.BITESHARK_STAGING_ALLOWED_EMAIL_DOMAINS = 'staging.biteshark.invalid';
    process.env.BITESHARK_PUSH_PROVIDER_MODE = 'disabled';
    process.env.BITESHARK_NOTIFICATION_WORKER_SECRET = workerSecret;
    process.env.BITESHARK_SUBSCRIPTION_HMAC_SALT = subSalt;

    const featureMod = await import(pathToFileURL(path.join(ROOT, 'lib', 'feature-controls.js')).href);
    const pagerNotifMod = await import(pathToFileURL(path.join(ROOT, 'lib', 'pager-notifications.js')).href);
    const { createStandaloneServer } = await import(pathToFileURL(path.join(ROOT, 'server', 'app.js')).href);

    // 1. Registry DAG cycle check
    assert.equal(featureMod.assertCycleFreeFeatureRegistry(), true);
    assert.throws(
      () =>
        featureMod.assertCycleFreeFeatureRegistry([
          { key: 'a', depends_on: ['b'] },
          { key: 'b', depends_on: ['a'] }
        ]),
      /Cycle detected/
    );

    standalone = createStandaloneServer({
      dbAdapter: appPool,
      releaseSha: 'fctest0000000000000000000000000000000022'
    });
    await new Promise((resolve, reject) => {
      standalone.server.listen(port, '127.0.0.1', err => (err ? reject(err) : resolve()));
    });

    async function httpReq(relPath, { method = 'GET', cookie = '', headers = {}, body } = {}) {
      const hdrs = { ...headers };
      if (cookie) hdrs.Cookie = cookie;
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        if (!('Origin' in hdrs)) hdrs.Origin = baseOrigin;
      }
      let payloadBody;
      if (body !== undefined) {
        hdrs['Content-Type'] = 'application/json';
        payloadBody = JSON.stringify(body);
      }
      const res = await fetch(`${baseOrigin}${relPath}`, {
        method,
        headers: hdrs,
        body: payloadBody,
        redirect: 'manual'
      });
      const contentType = String(res.headers.get('content-type') || '');
      let json = null;
      let text = '';
      if (contentType.includes('application/json')) {
        json = await res.json().catch(() => null);
      } else {
        text = await res.text();
      }
      return { status: res.status, headers: res.headers, json, text };
    }

    async function signInEmail(email) {
      const start = await httpReq('/api/auth/start', {
        method: 'POST',
        headers: { 'X-BiteShark-Client': 'web-auth-v1' },
        body: { email, intent: 'signup', dob: '1990-04-12' }
      });
      assert.equal(start.status, 200, `OTP start failed for ${email}: ${JSON.stringify(start.json)}`);

      const mbx = await httpReq('/api/auth/staging-mailbox', {
        method: 'POST',
        headers: { 'X-Staging-Mailbox-Secret': mailboxSecret },
        body: { email }
      });
      assert.equal(mbx.status, 200);

      const ver = await httpReq('/api/auth/verify', {
        method: 'POST',
        headers: { 'X-BiteShark-Client': 'web-auth-v1' },
        body: { email, code: mbx.json.code }
      });
      assert.equal(ver.status, 200, `OTP verify failed for ${email}: ${JSON.stringify(ver.json)}`);
      const cookie = extractSessionCookie(ver);
      assert(cookie, 'Expected session cookie');
      return { user: ver.json.user, cookie };
    }

    const topUser = await signInEmail('top@staging.biteshark.invalid');
    const modUser = await signInEmail('mod@staging.biteshark.invalid');
    const vendorOwner = await signInEmail('owner@staging.biteshark.invalid');
    const customerUser = await signInEmail('customer@staging.biteshark.invalid');
    const unassessedUser = await signInEmail('unassessed@staging.biteshark.invalid');

    // Grant roles via migratorPool inside explicit RLS guard transaction
    {
      const seedClient = await migratorPool.connect();
      try {
        await seedClient.query('BEGIN');
        await seedClient.query("SELECT set_config('app.auth_internal', 'true', true), set_config('app.is_platform_admin', 'true', true)");
        await seedClient.query(
          `INSERT INTO platform_roles (user_id, role, granted_by) VALUES ($1, 'top', 'bootstrap'), ($2, 'mod', $1)`,
          [topUser.user.id, modUser.user.id]
        );
        await seedClient.query(
          `INSERT INTO vendor_memberships (vendor_id, user_id, role, granted_by) VALUES ('iniguez', $1, 'owner', $2)`,
          [vendorOwner.user.id, topUser.user.id]
        );
        const updRes = await seedClient.query(
          `UPDATE auth_users
           SET age_eligibility_status = 'not_assessed',
               age_policy_version = NULL,
               age_assessed_at = NULL,
               age_assessment_basis = NULL
           WHERE id = $1`,
          [unassessedUser.user.id]
        );
        assert.equal(updRes.rowCount, 1, 'Expected unassessedUser updated to not_assessed');
        await seedClient.query('COMMIT');
      } finally {
        seedClient.release();
      }
    }

    // 2. Public `/api/features` safety & unassessed user allowlist check
    const pubAnon = await httpReq('/api/features');
    assert.equal(pubAnon.status, 200);
    assert.equal(pubAnon.json.config_trusted, true);
    assert.equal(pubAnon.json.features.event_inquiries.state, 'enabled');
    assert.equal(pubAnon.json.features.nearby_alert_preferences.implementation_status, 'placeholder');
    assert.equal(pubAnon.json.features.passkey_webauthn.implementation_status, 'deferred');
    // Push is paused due to BITESHARK_PUSH_PROVIDER_MODE=disabled
    assert.equal(pubAnon.json.features.pager_push_delivery.state, 'paused');
    const rawPubStr = JSON.stringify(pubAnon.json);
    assert(!rawPubStr.includes('actor_id'));
    assert(!rawPubStr.includes('recent_history'));
    assert(!rawPubStr.includes('configured_audience'));
    assert(!rawPubStr.includes('revision'));

    const pubUnassessed = await httpReq('/api/features', { cookie: unassessedUser.cookie });
    assert.equal(pubUnassessed.status, 200, 'Pending-age-assessment account may read safe /api/features');

    // 3. RBAC & CSRF enforcement on `/api/admin/features` and `/api/admin/features/update`
    assert.equal((await httpReq('/api/admin/features')).status, 401);
    assert.equal((await httpReq('/api/admin/features', { cookie: customerUser.cookie })).status, 403);
    assert.equal((await httpReq('/api/admin/features', { cookie: vendorOwner.cookie })).status, 403);

    const modGet = await httpReq('/api/admin/features', { cookie: modUser.cookie });
    assert.equal(modGet.status, 200);
    assert.equal(modGet.json.can_edit, false);

    const modUpdateAttempt = await httpReq('/api/admin/features/update', {
      method: 'POST',
      cookie: modUser.cookie,
      body: {
        feature_key: 'pickup_pager_demo',
        configured_state: 'hidden',
        audience: 'all',
        expected_revision: 0,
        reason: 'Mod attempted unauthorized toggle'
      }
    });
    assert.equal(modUpdateAttempt.status, 403);
    assert.equal(modUpdateAttempt.json.code, 'TOP_ADMIN_REQUIRED');

    const custUpdateAttempt = await httpReq('/api/admin/features/update', {
      method: 'POST',
      cookie: customerUser.cookie,
      body: {
        feature_key: 'pickup_pager_demo',
        configured_state: 'hidden',
        audience: 'all',
        expected_revision: 0,
        reason: 'Customer attempted unauthorized toggle'
      }
    });
    assert.equal(custUpdateAttempt.status, 403);

    const topPreviewAttempt = await httpReq('/api/admin/features/update', {
      method: 'POST',
      cookie: topUser.cookie,
      headers: { 'X-BiteShark-Viewpoint': 'preview' },
      body: {
        feature_key: 'pickup_pager_demo',
        configured_state: 'hidden',
        audience: 'all',
        expected_revision: 0,
        reason: 'Preview must remain read-only'
      }
    });
    assert.equal(topPreviewAttempt.status, 403);
    assert.equal(topPreviewAttempt.json.code, 'ADMIN_PREVIEW_READ_ONLY');

    const topBadOriginAttempt = await httpReq('/api/admin/features/update', {
      method: 'POST',
      cookie: topUser.cookie,
      headers: { Origin: 'https://evil.example' },
      body: {
        feature_key: 'pickup_pager_demo',
        configured_state: 'hidden',
        audience: 'all',
        expected_revision: 0,
        reason: 'Cross-origin CSRF test'
      }
    });
    assert.equal(topBadOriginAttempt.status, 403);

    // 4. Input validation, confirmation requirement, optimistic concurrency (409), and DB append-only rules
    const badKey = await httpReq('/api/admin/features/update', {
      method: 'POST',
      cookie: topUser.cookie,
      body: {
        feature_key: 'non_existent_switch',
        configured_state: 'hidden',
        audience: 'all',
        expected_revision: 0,
        reason: 'Unknown key test'
      }
    });
    assert.equal(badKey.status, 400);
    assert.equal(badKey.json.code, 'UNKNOWN_FEATURE_KEY');

    const readOnlyAttempt = await httpReq('/api/admin/features/update', {
      method: 'POST',
      cookie: topUser.cookie,
      body: {
        feature_key: 'passkey_webauthn',
        configured_state: 'enabled',
        audience: 'all',
        expected_revision: 0,
        reason: 'Cannot toggle deferred disclosure'
      }
    });
    assert.equal(readOnlyAttempt.status, 400);
    assert.equal(readOnlyAttempt.json.code, 'FEATURE_READ_ONLY');

    const badStateAttempt = await httpReq('/api/admin/features/update', {
      method: 'POST',
      cookie: topUser.cookie,
      body: {
        feature_key: 'pickup_pager_demo',
        configured_state: 'paused', // Demo only supports enabled/hidden
        audience: 'all',
        expected_revision: 0,
        reason: 'Invalid state for demo'
      }
    });
    assert.equal(badStateAttempt.status, 400);
    assert.equal(badStateAttempt.json.code, 'INVALID_FEATURE_STATE');

    // Low-impact change (`pickup_pager_demo` -> `hidden`) succeeds WITHOUT `confirmed_impact`
    const lowImpactSave = await httpReq('/api/admin/features/update', {
      method: 'POST',
      cookie: topUser.cookie,
      body: {
        feature_key: 'pickup_pager_demo',
        configured_state: 'hidden',
        audience: 'all',
        expected_revision: 0,
        reason: 'Hide sample demo during operator maintenance'
      }
    });
    assert.equal(lowImpactSave.status, 200);
    const demoAfter = lowImpactSave.json.controls.find(c => c.key === 'pickup_pager_demo');
    assert.equal(demoAfter.effective_state, 'hidden');
    assert.equal(demoAfter.revision, 1);

    // Optimistic concurrency conflict (`expected_revision: 0` when current is `1`)
    const staleRevAttempt = await httpReq('/api/admin/features/update', {
      method: 'POST',
      cookie: topUser.cookie,
      body: {
        feature_key: 'pickup_pager_demo',
        configured_state: 'enabled',
        audience: 'all',
        expected_revision: 0,
        reason: 'Stale admin tab save attempt'
      }
    });
    assert.equal(staleRevAttempt.status, 409);
    assert.equal(staleRevAttempt.json.code, 'FEATURE_REVISION_CONFLICT');

    // High-impact change (`event_inquiries` -> `paused`) requires `confirmed_impact: true`
    const unconfirmedHighImpact = await httpReq('/api/admin/features/update', {
      method: 'POST',
      cookie: topUser.cookie,
      body: {
        feature_key: 'event_inquiries',
        configured_state: 'paused',
        audience: 'all',
        expected_revision: 0,
        reason: 'Pause new bookings while reviewing templates',
        confirmed_impact: false
      }
    });
    assert.equal(unconfirmedHighImpact.status, 400);
    assert.equal(unconfirmedHighImpact.json.code, 'CONFIRMATION_REQUIRED');
    assert(Array.isArray(unconfirmedHighImpact.json.consequences) && unconfirmedHighImpact.json.consequences.length > 0);

    // Mod sees reason/explanation in GET /api/admin/features, while actor UUID is redacted
    const modViewAfter = await httpReq('/api/admin/features', { cookie: modUser.cookie });
    const modDemoEntry = modViewAfter.json.controls.find(c => c.key === 'pickup_pager_demo');
    assert.equal(modDemoEntry.last_change.actor_id, null);
    assert.equal(modDemoEntry.last_change.reason, 'Hide sample demo during operator maintenance');

    // Append-only DB protection on `feature_control_history` & `DELETE` revoked on `feature_controls`
    await assert.rejects(
      appPool.query(`DELETE FROM feature_control_history`),
      err => err.code === '42501',
      'appRole must not be able to DELETE from feature_control_history'
    );
    await assert.rejects(
      appPool.query(`UPDATE feature_control_history SET reason = 'tampered'`),
      err => err.code === '42501',
      'appRole must not be able to UPDATE feature_control_history'
    );
    await assert.rejects(
      appPool.query(`DELETE FROM feature_controls WHERE feature_key = 'pickup_pager_demo'`),
      err => err.code === '42501',
      'appRole must not be able to DELETE from feature_controls'
    );

    // 5. Parent-child dependency evaluation + no silent overwrite + `staff_beta` + viewpoint preview
    const setChildBeta = await httpReq('/api/admin/features/update', {
      method: 'POST',
      cookie: topUser.cookie,
      body: {
        feature_key: 'community_submissions',
        configured_state: 'enabled',
        audience: 'staff_beta',
        expected_revision: 0,
        reason: 'Restrict community posting to verified staff beta',
        confirmed_impact: true
      }
    });
    assert.equal(setChildBeta.status, 200);

    // Customer cannot post when `staff_beta`
    const custBetaFeatures = await httpReq('/api/features', { cookie: customerUser.cookie });
    assert.equal(custBetaFeatures.json.features.community_submissions.state, 'hidden');
    const custPostDenied = await httpReq('/api/community/post', {
      method: 'POST',
      cookie: customerUser.cookie,
      body: {
        kind: 'tip',
        place_id: 'iniguez',
        place_name: 'Taqueria Iniguez',
        town: 'Santa Rosa',
        nickname: 'Customer',
        title: 'Customer post during staff beta',
        body: 'Attempting direct API post while restricted to staff_beta.'
      }
    });
    assert.equal(custPostDenied.status, 403);
    assert.equal(custPostDenied.json.code, 'FEATURE_DISABLED');

    // Vendor Owner IS eligible for `staff_beta`
    const ownerBetaFeatures = await httpReq('/api/features', { cookie: vendorOwner.cookie });
    assert.equal(ownerBetaFeatures.json.features.community_submissions.state, 'enabled');
    const ownerPostAllowed = await httpReq('/api/community/post', {
      method: 'POST',
      cookie: vendorOwner.cookie,
      body: {
        kind: 'tip',
        place_id: 'iniguez',
        place_name: 'Taqueria Iniguez',
        town: 'Santa Rosa',
        nickname: 'Vendor Owner',
        title: 'Fresh salsa verde early Saturdays',
        body: 'Verified vendor staff beta submission works as expected on the server.'
      }
    });
    assert.equal(ownerPostAllowed.status, 201);
    const createdPostId = ownerPostAllowed.json.submission.id;

    // Top Admin in `viewpoint=customer` sees customer-equivalent `hidden` state for `staff_beta`
    const topNormalFeatures = await httpReq('/api/features', { cookie: topUser.cookie });
    assert.equal(topNormalFeatures.json.features.community_submissions.state, 'enabled');
    const topCustomerVpFeatures = await httpReq('/api/features?viewpoint=customer', {
      cookie: topUser.cookie,
      headers: { 'X-BiteShark-Viewpoint': 'preview' }
    });
    assert.equal(topCustomerVpFeatures.json.features.community_submissions.state, 'hidden');

    // Hide parent `community_hub` -> child `community_submissions` becomes effectively `hidden` WITHOUT overwriting saved child settings
    const hideParentHub = await httpReq('/api/admin/features/update', {
      method: 'POST',
      cookie: topUser.cookie,
      body: {
        feature_key: 'community_hub',
        configured_state: 'hidden',
        audience: 'all',
        expected_revision: 0,
        reason: 'Temporarily hide community hub',
        confirmed_impact: true
      }
    });
    assert.equal(hideParentHub.status, 200);
    const childWhileParentHidden = hideParentHub.json.controls.find(c => c.key === 'community_submissions');
    assert.equal(childWhileParentHidden.effective_state, 'hidden');
    assert.equal(childWhileParentHidden.configured_state, 'enabled', 'Child saved state must NOT be overwritten');
    assert.equal(childWhileParentHidden.configured_audience, 'staff_beta', 'Child saved audience must NOT be overwritten');
    assert.equal(childWhileParentHidden.dependency_block.blocked, true);

    // Explicitly setting child to `enabled` while parent is `hidden` returns 409 FEATURE_DEPENDENCY_VIOLATION
    const enableChildWhileParentHidden = await httpReq('/api/admin/features/update', {
      method: 'POST',
      cookie: topUser.cookie,
      body: {
        feature_key: 'community_submissions',
        configured_state: 'enabled',
        audience: 'all',
        expected_revision: childWhileParentHidden.revision,
        reason: 'Try enabling child while parent hidden'
      }
    });
    assert.equal(enableChildWhileParentHidden.status, 409);
    assert.equal(enableChildWhileParentHidden.json.code, 'FEATURE_DEPENDENCY_VIOLATION');

    // Public `/api/community/list` is blocked while `community_hub` is hidden, BUT Mod moderation remains accessible!
    assert.equal((await httpReq('/api/community/list', { cookie: customerUser.cookie })).status, 403);
    assert.equal((await httpReq('/api/community/list', { cookie: modUser.cookie })).status, 200);
    const modApproveWhileHidden = await httpReq('/api/community/moderate', {
      method: 'POST',
      cookie: modUser.cookie,
      body: { id: createdPostId, status: 'approved' }
    });
    assert.equal(modApproveWhileHidden.status, 200);

    // Re-enable parent `community_hub` -> child `community_submissions` resumes `enabled` + `staff_beta`
    const restoreParentHub = await httpReq('/api/admin/features/update', {
      method: 'POST',
      cookie: topUser.cookie,
      body: {
        feature_key: 'community_hub',
        configured_state: 'enabled',
        audience: 'all',
        expected_revision: 1,
        reason: 'Re-enable community hub'
      }
    });
    assert.equal(restoreParentHub.status, 200);
    const childRestored = restoreParentHub.json.controls.find(c => c.key === 'community_submissions');
    assert.equal(childRestored.effective_state, 'enabled');
    assert.equal(childRestored.configured_audience, 'staff_beta');

    // Pause `community_submissions` -> approved posts remain readable & reportable, new posts blocked with 503
    const pauseCommSubs = await httpReq('/api/admin/features/update', {
      method: 'POST',
      cookie: topUser.cookie,
      body: {
        feature_key: 'community_submissions',
        configured_state: 'paused',
        audience: 'all',
        expected_revision: childRestored.revision,
        reason: 'Pause new community posts while keeping approved feed live',
        confirmed_impact: true
      }
    });
    assert.equal(pauseCommSubs.status, 200);
    const pubListWhileSubsPaused = await httpReq('/api/community/list');
    assert.equal(pubListWhileSubsPaused.status, 200);
    assert.equal(pubListWhileSubsPaused.json.posts.length, 1);
    const postWhileSubsPaused = await httpReq('/api/community/post', {
      method: 'POST',
      cookie: vendorOwner.cookie,
      body: {
        kind: 'tip',
        place_id: 'iniguez',
        place_name: 'Taqueria Iniguez',
        town: 'Santa Rosa',
        nickname: 'Owner',
        title: 'Blocked while paused',
        body: 'Direct API submission must fail with 503 FEATURE_PAUSED.'
      }
    });
    assert.equal(postWhileSubsPaused.status, 503);
    assert.equal(postWhileSubsPaused.json.code, 'FEATURE_PAUSED');
    const reportWhileSubsPaused = await httpReq('/api/community/report', {
      method: 'POST',
      cookie: customerUser.cookie,
      body: { post_id: createdPostId, reason_category: 'other', details: 'Testing report remains active' }
    });
    assert.equal(reportWhileSubsPaused.status, 201);

    // 6. Active-workflow preservation for Event Bookings, Onboarding, and Pickup Pagers
    // 6A. Create booking while enabled, then pause & hide `event_inquiries`
    const createdBooking = await httpReq('/api/bookings/create', {
      method: 'POST',
      cookie: customerUser.cookie,
      body: {
        truck_id: 'iniguez',
        package_id: 'dropin',
        event_type: 'Office lunch',
        event_date: futureDateISO(14),
        guest_count: 35,
        location: 'Santa Rosa Plaza',
        note: 'Existing inquiry preservation test',
        idempotency_key: crypto.randomUUID()
      }
    });
    assert.equal(createdBooking.status, 201);
    const bookingId = createdBooking.json.id;

    const pauseBookings = await httpReq('/api/admin/features/update', {
      method: 'POST',
      cookie: topUser.cookie,
      body: {
        feature_key: 'event_inquiries',
        configured_state: 'paused',
        audience: 'all',
        expected_revision: 0,
        reason: 'Pause new catering inquiries',
        confirmed_impact: true
      }
    });
    assert.equal(pauseBookings.status, 200);

    // Stale client attempting POST /api/bookings/create receives 503 FEATURE_PAUSED
    const blockedBookingCreate = await httpReq('/api/bookings/create', {
      method: 'POST',
      cookie: customerUser.cookie,
      body: {
        truck_id: 'iniguez',
        package_id: 'dropin',
        event_type: 'Birthday party',
        event_date: futureDateISO(16),
        guest_count: 25,
        location: 'Petaluma',
        note: 'Should be blocked',
        idempotency_key: crypto.randomUUID()
      }
    });
    assert.equal(blockedBookingCreate.status, 503);
    assert.equal(blockedBookingCreate.json.code, 'FEATURE_PAUSED');

    // Existing booking remains readable by customer and actionable by vendor owner!
    const custBookingsWhilePaused = await httpReq('/api/bookings/list', { cookie: customerUser.cookie });
    assert.equal(custBookingsWhilePaused.status, 200);
    assert(custBookingsWhilePaused.json.bookings.some(b => String(b.id) === String(bookingId)));

    const ownerBookingsWhilePaused = await httpReq('/api/owner/bookings?truck_id=iniguez', {
      cookie: vendorOwner.cookie
    });
    assert.equal(ownerBookingsWhilePaused.status, 200);
    assert(ownerBookingsWhilePaused.json.bookings.some(b => String(b.id) === String(bookingId)));

    const ownerRespondWhilePaused = await httpReq('/api/owner/requests', {
      method: 'POST',
      cookie: vendorOwner.cookie,
      body: { id: String(bookingId), status: 'accepted' }
    });
    assert.equal(ownerRespondWhilePaused.status, 200);
    assert.equal(ownerRespondWhilePaused.json.status, 'accepted');

    // 6B. Onboarding preservation: submit application while enabled, then pause `vendor_onboarding`
    const submittedApp = await httpReq('/api/onboarding/applications', {
      method: 'POST',
      cookie: customerUser.cookie,
      body: {
        action: 'submit',
        application_type: 'new_listing',
        proposed_slug: 'sonoma-taco-express',
        business_name: 'Sonoma Taco Express',
        primary_town: 'Sonoma',
        category: 'Food Trucks',
        cuisine: 'Mexican',
        contact_name: 'Elena Gomez',
        ownership_statement: 'Sonoma County mobile food facility permit #9981'
      }
    });
    assert.equal(submittedApp.status, 201);

    const pauseOnboarding = await httpReq('/api/admin/features/update', {
      method: 'POST',
      cookie: topUser.cookie,
      body: {
        feature_key: 'vendor_onboarding',
        configured_state: 'paused',
        audience: 'all',
        expected_revision: 0,
        reason: 'Pause new onboarding intake',
        confirmed_impact: true
      }
    });
    assert.equal(pauseOnboarding.status, 200);

    const newAppBlocked = await httpReq('/api/onboarding/applications', {
      method: 'POST',
      cookie: customerUser.cookie,
      body: {
        action: 'save_draft',
        application_type: 'new_listing',
        proposed_slug: 'blocked-draft',
        business_name: 'Blocked Draft',
        primary_town: 'Santa Rosa',
        contact_name: 'Elena Gomez'
      }
    });
    assert.equal(newAppBlocked.status, 503);
    assert.equal(newAppBlocked.json.code, 'FEATURE_PAUSED');

    const existingAppsReadable = await httpReq('/api/onboarding/applications', { cookie: customerUser.cookie });
    assert.equal(existingAppsReadable.status, 200);
    assert.equal(existingAppsReadable.json.applications.length, 1);

    // 6C. Pickup pager active-ticket preservation + push worker pre-dispatch recheck
    process.env.BITESHARK_PUSH_PROVIDER_MODE = 'loopback_test';
    process.env.BITESHARK_ALLOW_TEST_PUSH_MODES = '1';

    const pagerCreated = await httpReq('/api/pager/staff', {
      method: 'POST',
      cookie: vendorOwner.cookie,
      body: { vendor_id: 'iniguez', ticket: '42', request_key: crypto.randomUUID() }
    });
    assert.equal(pagerCreated.status, 201);
    const activePagerCode = pagerCreated.json.pager.id;

    // Subscribe customer to loopback push endpoint while push is enabled
    const subRes = await httpReq('/api/pager/subscriptions', {
      method: 'POST',
      headers: { 'X-BiteShark-Client': 'web-pager-v1' },
      body: {
        code: activePagerCode,
        channel: 'web_push',
        platform_hint: 'web',
        subscription: {
          endpoint: `http://127.0.0.1:${pushPort}/push/${activePagerCode}`,
          keys: {
            p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
            auth: 'tBHItJI5svbpez7KI4CCXg'
          }
        }
      }
    });
    assert.equal(subRes.status, 201);
    const savedSubId = subRes.json.subscription.id;
    const savedUnsubToken = subRes.json.unsubscribe_token;

    // Pause `pickup_pager_creation` -> new pager creation blocked, active ticket status + staff update preserved!
    const pausePagerCreate = await httpReq('/api/admin/features/update', {
      method: 'POST',
      cookie: topUser.cookie,
      body: {
        feature_key: 'pickup_pager_creation',
        configured_state: 'paused',
        audience: 'all',
        expected_revision: 0,
        reason: 'Pause new pager creation while finishing active kitchen queue',
        confirmed_impact: true
      }
    });
    assert.equal(pausePagerCreate.status, 200);

    const newPagerBlocked = await httpReq('/api/pager/staff', {
      method: 'POST',
      cookie: vendorOwner.cookie,
      body: { vendor_id: 'iniguez', ticket: '43', request_key: crypto.randomUUID() }
    });
    assert.equal(newPagerBlocked.status, 503);
    assert.equal(newPagerBlocked.json.code, 'FEATURE_PAUSED');

    const almostUpdate = await httpReq('/api/pager/update', {
      method: 'POST',
      cookie: vendorOwner.cookie,
      body: { id: activePagerCode, status: 'almost' }
    });
    assert.equal(almostUpdate.status, 200);

    const customerStatusCheck = await httpReq(`/api/pager/status?code=${encodeURIComponent(activePagerCode)}`);
    assert.equal(customerStatusCheck.status, 200);
    assert.equal(customerStatusCheck.json.pager.status, 'almost');
    assert.equal(customerStatusCheck.json.notifications.enabled, true);

    // Mark pager `ready` -> queues outbox delivery in `pager_notification_deliveries`
    const readyUpdate = await httpReq('/api/pager/update', {
      method: 'POST',
      cookie: vendorOwner.cookie,
      body: { id: activePagerCode, status: 'ready' }
    });
    assert.equal(readyUpdate.status, 200);
    assert.equal(readyUpdate.json.notification.event_created, true);
    assert.equal(readyUpdate.json.notification.queued_deliveries, 1);

    // Pause `pager_push_delivery` BEFORE worker runs -> zero provider calls!
    const pausePushDelivery = await httpReq('/api/admin/features/update', {
      method: 'POST',
      cookie: topUser.cookie,
      body: {
        feature_key: 'pager_push_delivery',
        configured_state: 'paused',
        audience: 'all',
        expected_revision: 0,
        reason: 'Pause outbound push notifications immediately',
        confirmed_impact: true
      }
    });
    assert.equal(pausePushDelivery.status, 200);

    const workerWhilePaused = await httpReq('/api/pager/worker', {
      method: 'POST',
      headers: { Authorization: `Bearer ${workerSecret}` },
      body: { batch_size: 10 }
    });
    assert.equal(workerWhilePaused.status, 200);
    assert.equal(workerWhilePaused.json.paused, true);
    assert.equal(loopbackDeliveries.length, 0, 'Worker must send zero pushes while pager_push_delivery is paused');

    // Status endpoint reflects paused push, new subscription POST is blocked, and DELETE unsubscribe remains allowed!
    const statusWhilePushPaused = await httpReq(`/api/pager/status?code=${encodeURIComponent(activePagerCode)}`);
    assert.equal(statusWhilePushPaused.json.notifications.enabled, false);

    const newSubBlocked = await httpReq('/api/pager/subscriptions', {
      method: 'POST',
      headers: { 'X-BiteShark-Client': 'web-pager-v1' },
      body: {
        code: activePagerCode,
        channel: 'web_push',
        subscription: {
          endpoint: `http://127.0.0.1:${pushPort}/push/second`,
          keys: {
            p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
            auth: 'tBHItJI5svbpez7KI4CCXg'
          }
        }
      }
    });
    assert.equal(newSubBlocked.status, 503);
    assert.equal(newSubBlocked.json.code, 'FEATURE_PAUSED');

    // Mid-wave race: re-enable `pager_push_delivery`, claim the queued delivery in a worker wave,
    // and pause `pager_push_delivery` in `onAfterClaim` BEFORE `prepareClaimForDispatch`!
    const reEnablePushForRace = await httpReq('/api/admin/features/update', {
      method: 'POST',
      cookie: topUser.cookie,
      body: {
        feature_key: 'pager_push_delivery',
        configured_state: 'enabled',
        audience: 'all',
        expected_revision: 1,
        reason: 'Re-enable briefly to test mid-wave claim fencing'
      }
    });
    assert.equal(reEnablePushForRace.status, 200);

    const raceSummary = await pagerNotifMod.runNotificationWorkerBatch(appPool, {
      batchSize: 5,
      concurrency: 1,
      workerId: 'race-worker-1',
      runCleanup: false,
      hooks: {
        onAfterClaim: async claimedWave => {
          assert.equal(claimedWave.length, 1);
          const pauseMidWave = await httpReq('/api/admin/features/update', {
            method: 'POST',
            cookie: topUser.cookie,
            body: {
              feature_key: 'pager_push_delivery',
              configured_state: 'paused',
              audience: 'all',
              expected_revision: 2,
              reason: 'Pause mid-wave after worker claimed batch',
              confirmed_impact: true
            }
          });
          assert.equal(pauseMidWave.status, 200);
        }
      }
    });
    assert.equal(raceSummary.claimed, 1);
    assert.equal(raceSummary.released_unprocessed, 1, 'Pre-dispatch recheck must release claim when paused mid-wave');
    assert.equal(raceSummary.delivered, 0);
    assert.equal(loopbackDeliveries.length, 0, 'Zero provider sends may occur after mid-wave pause');

    // Re-enable `pager_push_delivery` -> queued outbox item now dispatches cleanly!
    const reEnablePushForSend = await httpReq('/api/admin/features/update', {
      method: 'POST',
      cookie: topUser.cookie,
      body: {
        feature_key: 'pager_push_delivery',
        configured_state: 'enabled',
        audience: 'all',
        expected_revision: 3,
        reason: 'Resume push delivery'
      }
    });
    assert.equal(reEnablePushForSend.status, 200);

    const workerSendRes = await httpReq('/api/pager/worker', {
      method: 'POST',
      headers: { Authorization: `Bearer ${workerSecret}` },
      body: { batch_size: 10 }
    });
    assert.equal(workerSendRes.status, 200);
    assert.equal(workerSendRes.json.delivered, 1);
    assert.equal(loopbackDeliveries.length, 1, 'Expected exact 1 loopback delivery after re-enabling');

    // Pause again and verify DELETE /api/pager/subscriptions cleanup still succeeds!
    await httpReq('/api/admin/features/update', {
      method: 'POST',
      cookie: topUser.cookie,
      body: {
        feature_key: 'pager_push_subscriptions',
        configured_state: 'paused',
        audience: 'all',
        expected_revision: 0,
        reason: 'Pause new push opt-ins while testing unsubscribe',
        confirmed_impact: false
      }
    });
    const unsubWhilePaused = await httpReq('/api/pager/subscriptions', {
      method: 'DELETE',
      headers: { 'X-BiteShark-Client': 'web-pager-v1' },
      body: {
        subscription_id: savedSubId,
        unsubscribe_token: savedUnsubToken,
        code: activePagerCode
      }
    });
    assert.equal(unsubWhilePaused.status, 200, 'Unsubscribe/cleanup must remain allowed while push is paused');

    // 7. Authoritative environment emergency controls override database `"enabled"` settings
    process.env.BITESHARK_DISABLE_NOTIFICATION_DELIVERY = '1';
    const adminWithEnvKill = await httpReq('/api/admin/features', { cookie: topUser.cookie });
    const pushWithEnvKill = adminWithEnvKill.json.controls.find(c => c.key === 'pager_push_delivery');
    assert.equal(pushWithEnvKill.configured_state, 'enabled');
    assert.equal(pushWithEnvKill.effective_state, 'paused');
    assert.equal(pushWithEnvKill.env_override.active, true);
    delete process.env.BITESHARK_DISABLE_NOTIFICATION_DELIVERY;
    process.env.BITESHARK_PUSH_PROVIDER_MODE = 'disabled';
    delete process.env.BITESHARK_ALLOW_TEST_PUSH_MODES;

    // 8. Protected essential capabilities cannot be disabled even when optional features are paused/hidden
    assert.equal((await httpReq('/api/healthz')).status, 200);
    const trucksRes = await httpReq('/api/trucks');
    assert.equal(trucksRes.status, 200);
    assert.equal(trucksRes.json.trucks.length, 59, 'Canonical 59 Sonoma listings remain discoverable');
    assert.equal((await httpReq('/policies/terms.html')).status, 200);
    assert.equal((await httpReq('/policies/accessibility.html')).status, 200);
    assert.equal((await httpReq('/admin')).status, 302, 'Unauthenticated /admin redirects to login');
    assert.equal((await httpReq('/admin', { cookie: topUser.cookie })).status, 200, 'Admin: Top /admin remains accessible');

    // Pending-age-assessment gate remains enforced
    const unassessedGate = await httpReq('/api/favorites/list', { cookie: unassessedUser.cookie });
    assert.equal(unassessedGate.status, 403);
    assert.equal(unassessedGate.json.code, 'AGE_ASSESSMENT_REQUIRED');

    // Privacy / access support issue remains open even when optional features are paused
    const supportIssue = await httpReq('/api/issues', {
      method: 'POST',
      cookie: customerUser.cookie,
      body: {
        category: 'account_access',
        subject: 'Privacy rights request while features paused',
        description: 'Essential privacy and support channel remains available at all times.'
      }
    });
    assert.equal(supportIssue.status, 201);

    // 9. Fail-closed safety when feature configuration is untrusted/unavailable
    featureMod.setSimulatedFeatureConfigFailureForTests('malformed_row');
    try {
      const failClosedMutation = await httpReq('/api/notifications/settings', {
        method: 'POST',
        cookie: customerUser.cookie,
        body: { nearby_enabled: true, radius_miles: 5 }
      });
      assert.equal(failClosedMutation.status, 503);
      assert.equal(failClosedMutation.json.code, 'FEATURE_CONFIG_UNAVAILABLE');

      // Essential discovery & healthz still succeed during feature-config failure!
      assert.equal((await httpReq('/api/healthz')).status, 200);
      assert.equal((await httpReq('/api/trucks')).status, 200);
    } finally {
      featureMod.setSimulatedFeatureConfigFailureForTests(null);
    }

    // 10. Operator SSH Recovery CLI (`scripts/manage-feature-controls.cjs`) & full restore verification
    const cliNonTop = await runChild(
      [
        path.join(ROOT, 'scripts', 'manage-feature-controls.cjs'),
        '--reset-defaults',
        '--actor-email',
        'mod@staging.biteshark.invalid',
        '--reason',
        'Mod must be rejected by recovery CLI'
      ],
      { ...process.env, DATABASE_URL: appUrl }
    );
    assert.notEqual(cliNonTop.code, 0, 'Recovery CLI must reject non-Top actors');

    const cliStatus = await runChild(
      [path.join(ROOT, 'scripts', 'manage-feature-controls.cjs'), '--status'],
      { ...process.env, DATABASE_URL: appUrl }
    );
    assert.equal(cliStatus.code, 0, `CLI --status failed: ${cliStatus.stderr}`);
    const statusJson = JSON.parse(cliStatus.stdout);
    assert.equal(statusJson.config_trusted, true);

    const cliReset = await runChild(
      [
        path.join(ROOT, 'scripts', 'manage-feature-controls.cjs'),
        '--reset-defaults',
        '--actor-email',
        'top@staging.biteshark.invalid',
        '--reason',
        'Restore all switchable features to clean default state after verification'
      ],
      { ...process.env, DATABASE_URL: appUrl }
    );
    assert.equal(cliReset.code, 0, `CLI --reset-defaults failed: ${cliReset.stderr}`);
    const resetJson = JSON.parse(cliReset.stdout);
    assert.equal(resetJson.ok, true);
    assert(resetJson.updated_count >= 5);

    // Verify re-enabling restored normal behavior & preserved all existing data!
    const pubRestored = await httpReq('/api/features');
    assert.equal(pubRestored.json.features.event_inquiries.state, 'enabled');
    assert.equal(pubRestored.json.features.community_hub.state, 'enabled');
    assert.equal(pubRestored.json.features.community_submissions.state, 'enabled');
    assert.equal(pubRestored.json.features.pickup_pager_creation.state, 'enabled');
    assert.equal(pubRestored.json.features.pickup_pager_demo.state, 'enabled');

    const bookingAfterRestore = await httpReq('/api/bookings/create', {
      method: 'POST',
      cookie: customerUser.cookie,
      body: {
        truck_id: 'iniguez',
        package_id: 'dropin',
        event_type: 'Community event',
        event_date: futureDateISO(20),
        guest_count: 30,
        location: 'Sebastopol Town Square',
        note: 'Restored booking flow works cleanly',
        idempotency_key: crypto.randomUUID()
      }
    });
    assert.equal(bookingAfterRestore.status, 201);

    const allBookingsAfter = await httpReq('/api/bookings/list', { cookie: customerUser.cookie });
    assert.equal(allBookingsAfter.json.bookings.length, 2, 'Both pre-pause and post-restore bookings preserved');

    // Audit trail verification
    const auditRes = await httpReq('/api/admin/audit?action=feature_control.', { cookie: topUser.cookie });
    assert.equal(auditRes.status, 200);
    assert(auditRes.json.entries.some(e => e.action === 'feature_control.update'));
    assert(auditRes.json.entries.some(e => e.action === 'feature_control.recover'));

    console.log(
      'PASS: Controlled feature registry, Top-only RBAC, optimistic concurrency (409), dependency DAG, staff_beta + viewpoint preview, active-workflow preservation, worker pre-dispatch recheck, fail-closed config safety, and SSH recovery CLI verified on PostgreSQL'
    );
  } finally {
    if (standalone?.server) {
      await new Promise(r => standalone.server.close(() => r()));
    }
    if (loopbackPushServer) {
      await new Promise(r => loopbackPushServer.close(() => r()));
    }
    if (appPool) await appPool.end().catch(() => {});
    if (migratorPool) await migratorPool.end().catch(() => {});
    await adminPool.end().catch(() => {});
    await pgCluster.stop();
  }
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
