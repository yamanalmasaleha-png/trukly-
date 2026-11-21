// BiteShark Administration Portal, Onboarding, Privileged Invitations, Moderation,
// Support Issues & Viewpoint Governance Integration Suite (`tests/admin-governance.integration.cjs`)
//
// Executes against a real PostgreSQL cluster using a non-superuser `NOBYPASSRLS` application role
// and real `createStandaloneServer` HTTP requests (zero mocked roles or fake database stubs).

const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
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
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'biteshark-gov-pg-'));
  const dataDir = path.join(tmpBase, 'data');
  const pwFile = path.join(tmpBase, 'pw.txt');
  const logFile = path.join(tmpBase, 'postgres.log');
  const password = 'gov_pw_' + crypto.randomBytes(6).toString('hex');
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

function runChild(args, env, timeoutMs = 12000) {
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

function futureDateISO(days = 10) {
  const d = new Date(Date.now() + days * 86400 * 1000);
  return d.toISOString().slice(0, 10);
}

(async () => {
  const { Pool } = requirePg();
  const pgCluster = await createPostgresCluster();
  const suffix = crypto.randomBytes(3).toString('hex');
  const dbName = `biteshark_gov_${suffix}`;
  const migratorRole = `bs_mig_${suffix}`;
  const appRole = `bs_app_${suffix}`;
  const migratorPass = 'mig_' + crypto.randomBytes(8).toString('hex');
  const appPass = 'app_' + crypto.randomBytes(8).toString('hex');

  const adminPool = new Pool({ connectionString: pgCluster.adminUrl, max: 3 });
  let migratorPool = null;
  let appPool = null;
  let standalone = null;

  try {
    await adminPool.query(`CREATE ROLE ${migratorRole} WITH LOGIN PASSWORD '${migratorPass}' CREATEDB`);
    await adminPool.query(`CREATE ROLE ${appRole} WITH LOGIN PASSWORD '${appPass}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`);
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
    assert(migRes.stdout.includes('"newly_applied":25'));

    migratorPool = new Pool({ connectionString: migratorUrl, max: 4 });
    appPool = new Pool({ connectionString: appUrl, max: 8 });

    const port = await getFreePort();
    const baseOrigin = `http://127.0.0.1:${port}`;
    const mailboxSecret = 'mbx_' + crypto.randomBytes(24).toString('hex');
    const authSecret = crypto.randomBytes(32).toString('hex');

    process.env.BITESHARK_ENV = 'staging';
    delete process.env.BITESHARK_PUBLIC_ORIGIN;
    delete process.env.TRUCKLY_PUBLIC_ORIGIN;
    process.env.BITESHARK_AUTH_START_IP_MAX = '60';
    process.env.BITESHARK_AUTH_VERIFY_IP_MAX = '60';
    process.env.BITESHARK_AUTH_SECRET = authSecret;
    process.env.BITESHARK_AUTH_DELIVERY_MODE = 'staging_mailbox';
    process.env.BITESHARK_STAGING_MAILBOX_SECRET = mailboxSecret;
    process.env.BITESHARK_STAGING_ALLOWED_EMAIL_DOMAINS = 'staging.biteshark.invalid';
    process.env.BITESHARK_STAGING_ALLOWED_EMAILS = 'matt.operator@gmail.test';
    process.env.BITESHARK_PUSH_PROVIDER_MODE = 'disabled';

    const { createStandaloneServer } = await import(pathToFileURL(path.join(ROOT, 'server', 'app.js')).href);
    standalone = createStandaloneServer({
      dbAdapter: appPool,
      releaseSha: 'govtest0000000000000000000000000000000018'
    });
    await new Promise((resolve, reject) => {
      standalone.server.listen(port, '127.0.0.1', err => (err ? reject(err) : resolve()));
    });

    async function httpReq(relPath, { method = 'GET', cookie = '', headers = {}, body } = {}) {
      const hdrs = { ...headers };
      if (cookie) hdrs.Cookie = cookie;
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        if (!hdrs.Origin) hdrs.Origin = baseOrigin;
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
      return { status: res.status, headers: res.headers, json, text, rawRes: res };
    }

    async function signInEmail(email) {
      const start = await httpReq('/api/auth/start', {
        method: 'POST',
        headers: { 'X-BiteShark-Client': 'web-auth-v1' },
        body: { email, intent: 'signup', dob: '1990-06-15' }
      });
      assert.equal(start.status, 200, `OTP start failed for ${email}: ${JSON.stringify(start.json)}`);

      const mbx = await httpReq('/api/auth/staging-mailbox', {
        method: 'POST',
        headers: { 'X-Staging-Mailbox-Secret': mailboxSecret },
        body: { email }
      });
      assert.equal(mbx.status, 200, `Mailbox read failed for ${email}`);

      const ver = await httpReq('/api/auth/verify', {
        method: 'POST',
        headers: { 'X-BiteShark-Client': 'web-auth-v1' },
        body: { email, code: mbx.json.code }
      });
      assert.equal(ver.status, 200, `OTP verify failed for ${email}`);
      const cookie = extractSessionCookie(ver.rawRes);
      assert(cookie.startsWith('__Host-truckly_session='));
      return { user: ver.json.user, cookie };
    }

    // =========================================================================
    // [1/7] Narrow Top-Admin Bootstrap CLI & Protected Operator OTP Helper
    // =========================================================================
    const bootRes1 = await runChild(
      [path.join(ROOT, 'scripts', 'bootstrap-top-admin.cjs'), '--email', 'matt.operator@gmail.test'],
      { ...process.env, MIGRATION_DATABASE_URL: migratorUrl }
    );
    assert.equal(bootRes1.code, 0, `Bootstrap Top CLI failed: ${bootRes1.stderr}`);
    const bootJson1 = JSON.parse(bootRes1.stdout.trim());
    assert.equal(bootJson1.role, 'top');
    assert.equal(bootJson1.role_label, 'Admin: Top');
    assert.equal(bootJson1.created_user, true);

    const bootRes2 = await runChild(
      [path.join(ROOT, 'scripts', 'bootstrap-top-admin.cjs'), '--email', 'matt.operator@gmail.test'],
      { ...process.env, MIGRATION_DATABASE_URL: migratorUrl }
    );
    assert.equal(bootRes2.code, 0);
    assert.equal(JSON.parse(bootRes2.stdout.trim()).changed_role, false);

    await httpReq('/api/auth/start', {
      method: 'POST',
      headers: { 'X-BiteShark-Client': 'web-auth-v1' },
      body: { email: 'matt.operator@gmail.test', intent: 'signup', dob: '1988-04-12' }
    });
    const otpCliRes = await runChild(
      [path.join(ROOT, 'scripts', 'operator-read-my-otp.cjs'), '--email', 'matt.operator@gmail.test', `--port=${port}`],
      { ...process.env, BITESHARK_STAGING_MAILBOX_SECRET: mailboxSecret }
    );
    assert.equal(otpCliRes.code, 0, `Operator OTP CLI failed: ${otpCliRes.stderr}`);
    assert(/OTP Code:\s+\d{6}/.test(otpCliRes.stdout));
    assert(!otpCliRes.stdout.includes(mailboxSecret), 'Operator OTP CLI must never output mailbox secret');

    const otpMatch = /OTP Code:\s+(\d{6})/.exec(otpCliRes.stdout);
    const topLogin = await httpReq('/api/auth/verify', {
      method: 'POST',
      headers: { 'X-BiteShark-Client': 'web-auth-v1' },
      body: { email: 'matt.operator@gmail.test', code: otpMatch[1] }
    });
    assert.equal(topLogin.status, 200);
    const topAdmin = { user: topLogin.json.user, cookie: extractSessionCookie(topLogin.rawRes) };

    const topAdmin2 = await signInEmail('top2@staging.biteshark.invalid');
    const modAdmin = await signInEmail('mod1@staging.biteshark.invalid');
    const vendorAOwner = await signInEmail('owner-a@staging.biteshark.invalid');
    const vendorAStaff = await signInEmail('staff-a@staging.biteshark.invalid');
    const vendorBOwner = await signInEmail('owner-b@staging.biteshark.invalid');
    const custA = await signInEmail('cust-a@staging.biteshark.invalid');
    const custB = await signInEmail('cust-b@staging.biteshark.invalid');
    const envAdmin = await signInEmail('env-admin@staging.biteshark.invalid');

    await migratorPool.query(
      `INSERT INTO platform_roles (user_id, role, granted_by)
       VALUES ($1, 'top', 'seed'), ($2, 'mod', 'seed')`,
      [topAdmin2.user.id, modAdmin.user.id]
    );
    await migratorPool.query(
      `INSERT INTO vendor_memberships (vendor_id, user_id, role, granted_by)
       VALUES ('iniguez', $1, 'owner', 'seed'),
              ('iniguez', $2, 'staff', 'seed'),
              ('mitote', $3, 'owner', 'seed')`,
      [vendorAOwner.user.id, vendorAStaff.user.id, vendorBOwner.user.id]
    );
    await migratorPool.query(
      "UPDATE vendors SET ownership_status = 'approved_owner' WHERE id IN ('iniguez', 'mitote')"
    );

    console.log('✓ [1/7] Migration 018, Top-Admin bootstrap CLI & protected OTP helper verified');

    // =========================================================================
    // [2/7] Role/Permission Matrix, Public Labels & Direct API Bypass Checks
    // =========================================================================
    const unauthAdminHtml = await httpReq('/admin');
    assert.equal(unauthAdminHtml.status, 302);
    assert.equal(unauthAdminHtml.headers.get('location'), '/login.html?next=%2Fadmin');
    assert.equal((await httpReq('/api/admin/overview')).status, 401);

    const custAdminHtml = await httpReq('/admin', { cookie: custA.cookie });
    assert.equal(custAdminHtml.status, 403);
    assert(custAdminHtml.text.includes('403 · Access Restricted'));
    assert.equal((await httpReq('/api/admin/overview', { cookie: custA.cookie })).status, 403);
    assert.equal((await httpReq('/api/admin/accounts', { cookie: custA.cookie })).status, 403);
    assert.equal((await httpReq('/api/owner/stats', { cookie: custA.cookie })).status, 403);

    assert.equal((await httpReq('/admin', { cookie: vendorAStaff.cookie })).status, 403);
    assert.equal(
      (
        await httpReq('/api/owner/profile', {
          method: 'POST',
          cookie: vendorAStaff.cookie,
          body: { truck_id: 'iniguez', display_name: 'Staff Unauthorized Edit', cuisine: 'Mexican' }
        })
      ).status,
      403
    );
    assert.equal(
      (
        await httpReq('/api/vendor/staff-invitations', {
          method: 'POST',
          cookie: vendorAStaff.cookie,
          body: { vendor_id: 'iniguez', email: 'newstaff@staging.biteshark.invalid' }
        })
      ).status,
      403
    );
    assert.equal((await httpReq('/api/owner/profile?truck_id=mitote', { cookie: vendorAStaff.cookie })).status, 403);

    const ownerCtx = await httpReq('/api/account/context', { cookie: vendorAOwner.cookie });
    assert.equal(ownerCtx.status, 200);
    assert.deepEqual(ownerCtx.json.role_labels, ['Customer', 'Vendor Owner']);
    assert.equal(ownerCtx.json.capabilities.can_access_admin_portal, false);
    assert.equal((await httpReq('/admin', { cookie: vendorAOwner.cookie })).status, 403);
    assert.equal((await httpReq('/api/owner/bookings?truck_id=mitote', { cookie: vendorAOwner.cookie })).status, 403);
    assert.equal(
      (
        await httpReq('/api/admin/vendors/update', {
          method: 'POST',
          cookie: vendorAOwner.cookie,
          body: { vendor_id: 'iniguez', verified: true, reason: 'Owner trying to self-verify' }
        })
      ).status,
      403
    );

    const ownerAsCustomerBooking = await httpReq('/api/bookings/create', {
      method: 'POST',
      cookie: vendorAOwner.cookie,
      headers: { 'Idempotency-Key': 'idem-owner-orders-food-1' },
      body: {
        truck_id: 'mitote',
        event_type: 'Office lunch',
        event_date: futureDateISO(12),
        guest_count: 40,
        location: 'Santa Rosa Plaza',
        package_id: 'dropin'
      }
    });
    assert.equal(ownerAsCustomerBooking.status, 201, 'Vendor Owner must retain Customer ability to book food');

    const modCtx = await httpReq('/api/account/context', { cookie: modAdmin.cookie });
    assert.deepEqual(modCtx.json.role_labels, ['Customer', 'Admin: Mod']);
    assert.equal((await httpReq('/admin', { cookie: modAdmin.cookie })).status, 200);
    assert.equal((await httpReq('/api/admin/overview', { cookie: modAdmin.cookie })).status, 200);
    assert.equal((await httpReq('/api/pager/telemetry', { cookie: modAdmin.cookie })).status, 403);
    assert.equal(
      (
        await httpReq('/api/admin/accounts/role', {
          method: 'POST',
          cookie: modAdmin.cookie,
          body: { user_id: custA.user.id, role: 'top', reason: 'Mod trying to grant Top' }
        })
      ).status,
      403
    );
    assert.equal(
      (
        await httpReq('/api/admin/accounts/status', {
          method: 'POST',
          cookie: modAdmin.cookie,
          body: { user_id: custA.user.id, action: 'suspend', reason: 'Mod trying to suspend account' }
        })
      ).status,
      403
    );

    const modAccts = await httpReq('/api/admin/accounts', { cookie: modAdmin.cookie });
    assert.equal(modAccts.status, 200);
    assert(!/token|secret|otp|password|hash/i.test(JSON.stringify(modAccts.json)));
    const custARowForMod = modAccts.json.accounts.find(a => a.id === custA.user.id);
    assert(custARowForMod.email.includes('***@'));

    console.log('✓ [2/7] Role/permission matrix, non-exclusive memberships & direct API bypass blocks verified');

    // =========================================================================
    // [3/7] Invitations ("At All Levels"), Tampering & Two-Step Privileged Approval
    // =========================================================================
    const modCustInv = await httpReq('/api/admin/invitations/create', {
      method: 'POST',
      cookie: modAdmin.cookie,
      body: {
        email: 'invited-cust@staging.biteshark.invalid',
        requested_role: 'customer',
        note: 'Welcome community tester',
        approved_by: modAdmin.user.id
      }
    });
    assert.equal(modCustInv.status, 201);
    assert.equal(modCustInv.json.pending_top_approval, false);
    const custToken = modCustInv.json.accept_path.split('#accept-invite=')[1];

    assert.equal(
      (await httpReq('/api/invitations/accept', { method: 'POST', cookie: custB.cookie, body: { token: custToken } })).status,
      403
    );

    const invitedCust = await signInEmail('invited-cust@staging.biteshark.invalid');
    assert.equal(
      (await httpReq('/api/invitations/accept', { method: 'POST', cookie: invitedCust.cookie, body: { token: custToken } })).status,
      200
    );
    assert.equal(
      (await httpReq('/api/invitations/accept', { method: 'POST', cookie: invitedCust.cookie, body: { token: custToken } })).status,
      409
    );

    const modSelfTop = await httpReq('/api/admin/invitations/create', {
      method: 'POST',
      cookie: modAdmin.cookie,
      body: { email: 'mod1@staging.biteshark.invalid', requested_role: 'top', note: 'Self elevation attempt' }
    });
    assert.equal(modSelfTop.status, 403);
    assert.equal(modSelfTop.json.code, 'SELF_ELEVATION_FORBIDDEN');

    const modToModInv = await httpReq('/api/admin/invitations/create', {
      method: 'POST',
      cookie: modAdmin.cookie,
      body: {
        email: 'new-mod@staging.biteshark.invalid',
        requested_role: 'mod',
        status: 'issued',
        note: 'Nominate community moderator'
      }
    });
    assert.equal(modToModInv.status, 201);
    assert.equal(modToModInv.json.pending_top_approval, true);
    assert.equal(modToModInv.json.invitation.status, 'pending_top_approval');
    assert.equal(modToModInv.json.accept_path, undefined);

    // Also verify FORCE RLS blocks even table-owner `migratorPool` without `app.admin_portal = 'true'`!
    const rlsCheckEmpty = await migratorPool.query('SELECT token_sha256 FROM account_invitations WHERE id = $1', [
      modToModInv.json.invitation.id
    ]);
    assert.equal(rlsCheckEmpty.rows.length, 0, 'FORCE RLS must block un-scoped queries even from table owner');

    const superDbUrl = buildUrl('postgres', decodeURIComponent(new URL(pgCluster.adminUrl).password));
    const superCheckPool = new Pool({ connectionString: superDbUrl, max: 1 });
    const dbInvCheck = await superCheckPool.query('SELECT token_sha256 FROM account_invitations WHERE id = $1', [
      modToModInv.json.invitation.id
    ]);
    await superCheckPool.end();
    assert.equal(dbInvCheck.rows[0].token_sha256, null);

    assert.equal(
      (
        await httpReq('/api/admin/invitations/decision', {
          method: 'POST',
          cookie: modAdmin.cookie,
          body: { invitation_id: modToModInv.json.invitation.id, action: 'approve', reason: 'Mod self-approving queue' }
        })
      ).status,
      403
    );

    const modInvForTop2 = await httpReq('/api/admin/invitations/create', {
      method: 'POST',
      cookie: modAdmin.cookie,
      body: { email: 'top2@staging.biteshark.invalid', requested_role: 'top', note: 'Testing self-approval guard' }
    });
    assert.equal(modInvForTop2.status, 201);
    assert.equal(
      (
        await httpReq('/api/admin/invitations/decision', {
          method: 'POST',
          cookie: topAdmin2.cookie,
          body: { invitation_id: modInvForTop2.json.invitation.id, action: 'approve', reason: 'Approving own email' }
        })
      ).status,
      403
    );

    const topApproveInv = await httpReq('/api/admin/invitations/decision', {
      method: 'POST',
      cookie: topAdmin.cookie,
      body: { invitation_id: modToModInv.json.invitation.id, action: 'approve', reason: 'Verified moderator candidate' }
    });
    assert.equal(topApproveInv.status, 200);
    const newModToken = topApproveInv.json.accept_path.split('#accept-invite=')[1];

    const newModUser = await signInEmail('new-mod@staging.biteshark.invalid');
    assert.equal(
      (await httpReq('/api/invitations/accept', { method: 'POST', cookie: newModUser.cookie, body: { token: newModToken } })).status,
      200
    );
    assert.equal((await httpReq('/api/account/context', { cookie: newModUser.cookie })).json.admin_level, 'mod');

    console.log('✓ [3/7] Privileged two-step invitations, tampering guards & email-verified redemption verified');

    // =========================================================================
    // [4/7] Last-Top Protection, Session Revocation & Static Env Override Suppression
    // =========================================================================
    process.env.BITESHARK_PLATFORM_ADMIN_IDS = envAdmin.user.id;
    assert.equal((await httpReq('/api/account/context', { cookie: envAdmin.cookie })).json.admin_level, 'top');

    const revokeEnvAdmin = await httpReq('/api/admin/accounts/role', {
      method: 'POST',
      cookie: topAdmin.cookie,
      body: { user_id: envAdmin.user.id, role: 'none', reason: 'Revoking static env admin via portal' }
    });
    assert.equal(revokeEnvAdmin.status, 200);
    assert.equal((await httpReq('/api/admin/overview', { cookie: envAdmin.cookie })).status, 401);

    const envAdminFresh = await signInEmail('env-admin@staging.biteshark.invalid');
    assert.equal((await httpReq('/api/account/context', { cookie: envAdminFresh.cookie })).json.admin_level, null);
    assert.equal((await httpReq('/admin', { cookie: envAdminFresh.cookie })).status, 403);
    delete process.env.BITESHARK_PLATFORM_ADMIN_IDS;

    const [raceRoleA, raceRoleB] = await Promise.all([
      httpReq('/api/admin/accounts/role', {
        method: 'POST',
        cookie: topAdmin.cookie,
        body: { user_id: newModUser.user.id, role: 'none', expected_role: 'mod', reason: 'Concurrent role update A' }
      }),
      httpReq('/api/admin/accounts/role', {
        method: 'POST',
        cookie: topAdmin2.cookie,
        body: { user_id: newModUser.user.id, role: 'top', expected_role: 'mod', reason: 'Concurrent role update B' }
      })
    ]);
    assert.deepEqual([raceRoleA.status, raceRoleB.status].sort(), [200, 409]);

    await httpReq('/api/admin/accounts/role', {
      method: 'POST',
      cookie: topAdmin.cookie,
      body: { user_id: newModUser.user.id, role: 'none', reason: 'Normalize test state' }
    });
    assert.equal(
      (
        await httpReq('/api/admin/accounts/role', {
          method: 'POST',
          cookie: topAdmin.cookie,
          body: { user_id: topAdmin2.user.id, role: 'mod', reason: 'Leave single active Top admin to test last-Top guard' }
        })
      ).status,
      200
    );

    assert.equal(
      (
        await httpReq('/api/admin/accounts/role', {
          method: 'POST',
          cookie: topAdmin.cookie,
          body: { user_id: topAdmin.user.id, role: 'mod', reason: 'Attempt self-demotion of last Top' }
        })
      ).status,
      403
    );
    await assert.rejects(
      () => migratorPool.query('DELETE FROM platform_roles WHERE user_id = $1', [topAdmin.user.id]),
      /LAST_TOP_ADMIN_PROTECTED/
    );

    await httpReq('/api/admin/accounts/role', {
      method: 'POST',
      cookie: topAdmin.cookie,
      body: { user_id: topAdmin2.user.id, role: 'top', reason: 'Restore second Top admin for concurrent review tests' }
    });
    const topAdmin2Reauth = await signInEmail('top2@staging.biteshark.invalid');

    console.log('✓ [4/7] Last-Top DB+API protection, session revocation & env-override suppression verified');

    // =========================================================================
    // [5/7] Vendor Onboarding, Magic-Byte Evidence, Conflicts & 5 Restrictions
    // =========================================================================
    const initialDisc = await httpReq('/api/trucks');
    assert.equal(initialDisc.status, 200);
    assert.equal(initialDisc.json.trucks.length, 59);

    const draftApp = await httpReq('/api/onboarding/applications', {
      method: 'POST',
      cookie: custA.cookie,
      body: {
        action: 'save_draft',
        claim_type: 'existing_listing',
        target_vendor_id: 'truck-galvans',
        business_name: "Galvan's Eatery",
        city: 'Santa Rosa',
        cuisine: 'Mexican',
        listing_kind: 'food_truck',
        service_area: 'Santa Rosa & Roseland',
        contact_name: 'Elena Galvan',
        permit_or_license_summary: 'Sonoma County Mobile Food Permit #SC-4410',
        ownership_statement: 'Primary owner-operator of Galvan Eatery truck in Santa Rosa.'
      }
    });
    assert.equal(draftApp.status, 201);
    const appId = draftApp.json.application.id;

    assert.equal(
      (
        await httpReq('/api/onboarding/applications', {
          method: 'POST',
          cookie: custA.cookie,
          body: {
            id: appId,
            status: 'approved',
            claim_type: 'existing_listing',
            target_vendor_id: 'truck-galvans',
            business_name: "Galvan's Eatery",
            city: 'Santa Rosa',
            service_area: 'Santa Rosa & Roseland',
            contact_name: 'Elena Galvan',
            permit_or_license_summary: 'Sonoma County Mobile Food Permit #SC-4410',
            ownership_statement: 'Primary owner-operator of Galvan Eatery truck in Santa Rosa.'
          }
        })
      ).status,
      403
    );

    const badExeRes = await httpReq('/api/onboarding/evidence', {
      method: 'POST',
      cookie: custA.cookie,
      body: {
        application_id: appId,
        filename: 'malware.pdf',
        mime_type: 'application/pdf',
        evidence_kind: 'health_permit',
        data_base64: Buffer.from('MZ\x90\x00<!doctype html><script>alert(1)</script>').toString('base64')
      }
    });
    assert.equal(badExeRes.status, 400);
    assert.equal(badExeRes.json.code, 'UNSAFE_EVIDENCE_FILE');

    const oversizedRes = await httpReq('/api/onboarding/evidence', {
      method: 'POST',
      cookie: custA.cookie,
      body: {
        application_id: appId,
        filename: 'huge.pdf',
        mime_type: 'application/pdf',
        evidence_kind: 'health_permit',
        data_base64: Buffer.alloc(530 * 1024, 0x41).toString('base64')
      }
    });
    assert.equal(oversizedRes.status, 413);

    const validPdfBytes = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n', 'utf8');
    const goodEvRes = await httpReq('/api/onboarding/evidence', {
      method: 'POST',
      cookie: custA.cookie,
      body: {
        application_id: appId,
        filename: 'sonoma-permit.pdf',
        mime_type: 'application/pdf',
        evidence_kind: 'health_permit',
        data_base64: validPdfBytes.toString('base64')
      }
    });
    assert.equal(goodEvRes.status, 201);
    const evId = goodEvRes.json.evidence.id;

    assert([403, 404].includes((await httpReq(`/api/onboarding/evidence?id=${evId}`, { cookie: custB.cookie })).status));
    const modEvDownload = await httpReq(`/api/onboarding/evidence?id=${evId}`, { cookie: modAdmin.cookie });
    assert.equal(modEvDownload.status, 200);
    assert(String(modEvDownload.headers.get('content-disposition')).startsWith('attachment;'));
    assert(String(modEvDownload.headers.get('content-security-policy')).includes('sandbox'));

    await httpReq('/api/onboarding/applications', {
      method: 'POST',
      cookie: custA.cookie,
      body: {
        id: appId,
        action: 'submit',
        claim_type: 'existing_listing',
        target_vendor_id: 'truck-galvans',
        business_name: "Galvan's Eatery",
        city: 'Santa Rosa',
        cuisine: 'Mexican',
        listing_kind: 'food_truck',
        service_area: 'Santa Rosa & Roseland',
        contact_name: 'Elena Galvan',
        permit_or_license_summary: 'Sonoma County Mobile Food Permit #SC-4410',
        ownership_statement: 'Primary owner-operator of Galvan Eatery truck in Santa Rosa.'
      }
    });

    await httpReq('/api/admin/applications/decision', {
      method: 'POST',
      cookie: modAdmin.cookie,
      body: {
        application_id: appId,
        action: 'add_internal_note',
        internal_note: 'CONFIDENTIAL_MOD_NOTE_9921: Cross-checking Sonoma permit registry.'
      }
    });
    assert.equal(
      (
        await httpReq('/api/admin/applications/decision', {
          method: 'POST',
          cookie: modAdmin.cookie,
          body: {
            application_id: appId,
            action: 'request_info',
            reason: 'Please confirm your regular Saturday market street address.'
          }
        })
      ).status,
      200
    );

    const applicantView = await httpReq('/api/onboarding/applications', { cookie: custA.cookie });
    assert.equal(applicantView.status, 200);
    assert(!JSON.stringify(applicantView.json).includes('CONFIDENTIAL_MOD_NOTE_9921'));
    assert(applicantView.json.applications[0].applicant_feedback.includes('Saturday market'));

    await httpReq('/api/onboarding/applications', {
      method: 'POST',
      cookie: custA.cookie,
      body: {
        id: appId,
        action: 'submit',
        claim_type: 'existing_listing',
        target_vendor_id: 'truck-galvans',
        business_name: "Galvan's Eatery",
        city: 'Santa Rosa',
        cuisine: 'Mexican',
        listing_kind: 'food_truck',
        service_area: 'Sebastopol Rd & Saturday Market, Santa Rosa',
        contact_name: 'Elena Galvan',
        permit_or_license_summary: 'Sonoma County Mobile Food Permit #SC-4410',
        ownership_statement: 'Confirmed Saturday market address on Sebastopol Rd.'
      }
    });

    const competingRes = await httpReq('/api/onboarding/applications', {
      method: 'POST',
      cookie: custB.cookie,
      body: {
        action: 'submit',
        claim_type: 'existing_listing',
        target_vendor_id: 'truck-galvans',
        business_name: "Galvan's Competing Claim",
        city: 'Santa Rosa',
        cuisine: 'Mexican',
        listing_kind: 'food_truck',
        service_area: 'Santa Rosa',
        contact_name: 'Rival Claimant',
        permit_or_license_summary: 'Unverified claim #000',
        ownership_statement: 'Attempting competing ownership claim on Galvan.'
      }
    });
    assert.equal(competingRes.status, 201);
    const competingAppId = competingRes.json.application.id;

    const adminAppsQueue = await httpReq('/api/admin/applications?status=submitted', { cookie: modAdmin.cookie });
    const queuedPrimary = adminAppsQueue.json.applications.find(a => a.id === appId);
    assert.equal(queuedPrimary.has_ownership_conflict, true);

    assert.equal(
      (
        await httpReq('/api/admin/applications/decision', {
          method: 'POST',
          cookie: modAdmin.cookie,
          body: { application_id: appId, action: 'recommend_approve', reason: 'Permit #SC-4410 matches business name' }
        })
      ).status,
      200
    );
    assert.equal(
      (
        await httpReq('/api/admin/applications/decision', {
          method: 'POST',
          cookie: modAdmin.cookie,
          body: { application_id: appId, action: 'approve', reason: 'Mod attempting final approval' }
        })
      ).status,
      403
    );

    const [concApp1, concApp2] = await Promise.all([
      httpReq('/api/admin/applications/decision', {
        method: 'POST',
        cookie: topAdmin.cookie,
        body: { application_id: appId, action: 'approve', expected_status: 'submitted', reason: 'Approved by Top 1' }
      }),
      httpReq('/api/admin/applications/decision', {
        method: 'POST',
        cookie: topAdmin2Reauth.cookie,
        body: { application_id: appId, action: 'approve', expected_status: 'submitted', reason: 'Approved by Top 2' }
      })
    ]);
    assert.deepEqual([concApp1.status, concApp2.status].sort(), [200, 409]);

    assert.equal(
      (
        await httpReq('/api/admin/applications/decision', {
          method: 'POST',
          cookie: topAdmin.cookie,
          body: { application_id: competingAppId, action: 'approve', reason: 'Should fail due to existing approved owner' }
        })
      ).status,
      409
    );

    const galvanPreview = await httpReq('/api/admin/vendor-preview?vendor_id=truck-galvans', { cookie: modAdmin.cookie });
    assert.equal(galvanPreview.json.vendor.ownership_status, 'approved_owner');
    assert.equal(galvanPreview.json.vendor.verified, false);

    // Granular restrictions on `iniguez` with an existing customer booking AND an active pickup pager
    const custBookingOnIniguez = await httpReq('/api/bookings/create', {
      method: 'POST',
      cookie: custB.cookie,
      headers: { 'Idempotency-Key': 'idem-iniguez-before-restr' },
      body: {
        truck_id: 'iniguez',
        event_type: 'Birthday party',
        event_date: futureDateISO(15),
        guest_count: 35,
        location: 'Sebastopol',
        package_id: 'dropin'
      }
    });
    assert.equal(custBookingOnIniguez.status, 201);

    const activePagerRes = await httpReq('/api/pager/staff', {
      method: 'POST',
      cookie: vendorAOwner.cookie,
      body: { vendor_id: 'iniguez', ticket: '42', request_key: crypto.randomUUID() }
    });
    assert.equal(activePagerRes.status, 201);
    const activePagerId = activePagerRes.json.pager.id;

    assert.equal(
      (
        await httpReq('/api/admin/vendors/update', {
          method: 'POST',
          cookie: modAdmin.cookie,
          body: {
            vendor_id: 'iniguez',
            action: 'mod_temp_restriction',
            hidden_from_discovery: true,
            bookings_restricted: true,
            pager_restricted: true,
            needs_info_correction: true,
            correction_note: 'Confirm updated generator permit.',
            duration_hours: 24,
            reason: 'Temporary safety hold pending permit check'
          }
        })
      ).status,
      200
    );

    const discDuringHold = await httpReq('/api/trucks');
    assert.equal(discDuringHold.json.trucks.some(l => l.id === 'iniguez'), false);
    assert.equal(discDuringHold.json.trucks.length, 58);

    const blockedNewBooking = await httpReq('/api/bookings/create', {
      method: 'POST',
      cookie: custB.cookie,
      headers: { 'Idempotency-Key': 'idem-iniguez-blocked-new' },
      body: {
        truck_id: 'iniguez',
        event_type: 'Wedding',
        event_date: futureDateISO(20),
        guest_count: 40,
        location: 'Santa Rosa',
        package_id: 'dropin'
      }
    });
    assert([400, 409].includes(blockedNewBooking.status));

    assert.equal(
      (
        await httpReq('/api/pager/staff', {
          method: 'POST',
          cookie: vendorAOwner.cookie,
          body: { vendor_id: 'iniguez', ticket: '43', request_key: crypto.randomUUID() }
        })
      ).status,
      403
    );

    const custBookingsDuringHold = await httpReq('/api/bookings/list', { cookie: custB.cookie });
    assert(custBookingsDuringHold.json.bookings.some(b => b.id === custBookingOnIniguez.json.id));

    const advanceExistingPager = await httpReq('/api/pager/update', {
      method: 'POST',
      cookie: vendorAOwner.cookie,
      body: { id: activePagerId, status: 'ready' }
    });
    assert.equal(advanceExistingPager.status, 200);
    assert.equal((await httpReq(`/api/pager/status?code=${activePagerId}`)).status, 200);

    assert.equal(
      (
        await httpReq('/api/admin/vendors/update', {
          method: 'POST',
          cookie: topAdmin.cookie,
          body: {
            vendor_id: 'iniguez',
            vendor_access_suspended: true,
            reason: 'Temporary account access suspension during dispute review'
          }
        })
      ).status,
      200
    );
    assert.equal(
      (
        await httpReq('/api/owner/location', {
          method: 'POST',
          cookie: vendorAOwner.cookie,
          body: { truck_id: 'iniguez', location: 'Should be blocked' }
        })
      ).status,
      403
    );

    assert.equal(
      (
        await httpReq('/api/admin/vendors/update', {
          method: 'POST',
          cookie: topAdmin.cookie,
          body: {
            vendor_id: 'iniguez',
            clear_restrictions: true,
            is_active: true,
            reason: 'Permit verified; all restrictions lifted'
          }
        })
      ).status,
      200
    );
    assert.equal((await httpReq('/api/trucks')).json.trucks.some(l => l.id === 'iniguez'), true);

    console.log('✓ [5/7] Onboarding lifecycle, magic-byte evidence, conflicts & customer-safe restrictions verified');

    // =========================================================================
    // [6/7] Extended Community Moderation & Private Customer/Vendor Issues
    // =========================================================================
    const createPost = await httpReq('/api/community/post', {
      method: 'POST',
      cookie: custA.cookie,
      body: {
        kind: 'review',
        place_id: 'iniguez',
        place_name: 'Tacos Iñiguez',
        town: 'Santa Rosa',
        nickname: 'SonomaFoodie',
        title: 'Crispy birria tacos worth the drive',
        body: 'Ordered three birria tacos with consomé on Sebastopol Rd — super fresh and fast.',
        rating: 5
      }
    });
    assert.equal(createPost.status, 201);

    const modPending = await httpReq('/api/admin/moderation?queue=pending', { cookie: modAdmin.cookie });
    const postId = modPending.json.posts[0].id;

    assert.equal(
      (
        await httpReq('/api/admin/moderation/decision', {
          method: 'POST',
          cookie: modAdmin.cookie,
          body: { post_id: postId, action: 'approve', reason: 'Authentic local review' }
        })
      ).status,
      200
    );
    assert.equal((await httpReq('/api/community/list')).json.posts.some(p => p.id === postId), true);

    assert.equal(
      (
        await httpReq('/api/community/report', {
          method: 'POST',
          cookie: custB.cookie,
          body: { post_id: postId, reason_category: 'inaccurate', details: 'Check hours mentioned' }
        })
      ).status,
      201
    );
    const rep2 = await httpReq('/api/community/report', {
      method: 'POST',
      cookie: custB.cookie,
      body: { post_id: postId, reason_category: 'inaccurate', details: 'Duplicate click' }
    });
    assert.equal(rep2.status, 200);
    assert.equal(rep2.json.already_reported, true);

    assert.equal(
      (
        await httpReq('/api/admin/moderation/decision', {
          method: 'POST',
          cookie: modAdmin.cookie,
          body: {
            post_id: postId,
            action: 'hide',
            reason: 'Temporarily hidden while verifying reported detail',
            internal_note: 'PRIVATE_MOD_ANNOTATION_774'
          }
        })
      ).status,
      200
    );
    assert.equal((await httpReq('/api/community/list')).json.posts.some(p => p.id === postId), false);
    const mineCheck = await httpReq('/api/community/mine', { cookie: custA.cookie });
    assert(!JSON.stringify(mineCheck.json).includes('PRIVATE_MOD_ANNOTATION_774'));

    assert.equal(
      (
        await httpReq('/api/admin/moderation/decision', {
          method: 'POST',
          cookie: modAdmin.cookie,
          body: { post_id: postId, action: 'restore', reason: 'Verified accurate; restored to neighborhood feed' }
        })
      ).status,
      200
    );
    assert.equal((await httpReq('/api/community/list')).json.posts.some(p => p.id === postId), true);
    const histQueue = await httpReq('/api/admin/moderation?queue=history', { cookie: modAdmin.cookie });
    const restoredPost = histQueue.json.posts.find(p => p.id === postId);
    assert.equal(restoredPost.title, 'Crispy birria tacos worth the drive');
    assert(restoredPost.moderation_history.length >= 3);

    const issCreate = await httpReq('/api/issues', {
      method: 'POST',
      cookie: custA.cookie,
      body: {
        category: 'booking_dispute',
        severity: 'high',
        vendor_id: 'iniguez',
        subject: 'Question about catering guest count adjustment',
        description: 'Need help updating our catering inquiry guest count before Friday.',
        idempotency_key: 'iss-idem-001'
      }
    });
    assert.equal(issCreate.status, 201);
    const issueId = issCreate.json.issue.id;

    const issDup = await httpReq('/api/issues', {
      method: 'POST',
      cookie: custA.cookie,
      body: {
        category: 'booking_dispute',
        severity: 'high',
        vendor_id: 'iniguez',
        subject: 'Question about catering guest count adjustment',
        description: 'Need help updating our catering inquiry guest count before Friday.',
        idempotency_key: 'iss-idem-001'
      }
    });
    assert.equal(issDup.status, 200);
    assert.equal(issDup.json.idempotent_replay, true);

    assert.equal((await httpReq(`/api/issues?issue_id=${issueId}`, { cookie: custB.cookie })).status, 404);
    assert.equal((await httpReq(`/api/issues?issue_id=${issueId}`, { cookie: vendorAOwner.cookie })).status, 404);

    await httpReq('/api/admin/issues/update', {
      method: 'POST',
      cookie: modAdmin.cookie,
      body: {
        issue_id: issueId,
        status: 'in_progress',
        assignee_user_id: modAdmin.user.id,
        note_visibility: 'internal',
        note_body: 'INTERNAL_TRIAGE_SECRET_881: Contacting vendor owner separately.'
      }
    });
    await httpReq('/api/admin/issues/update', {
      method: 'POST',
      cookie: modAdmin.cookie,
      body: {
        issue_id: issueId,
        status: 'resolved',
        resolution_reason: 'Confirmed updated guest count options with vendor',
        note_visibility: 'reporter_visible',
        note_body: 'Hello! We confirmed your 45-guest option is supported.'
      }
    });

    const custIssueThread = await httpReq(`/api/issues?issue_id=${issueId}`, { cookie: custA.cookie });
    assert.equal(custIssueThread.status, 200);
    const custThreadStr = JSON.stringify(custIssueThread.json);
    assert(!custThreadStr.includes('INTERNAL_TRIAGE_SECRET_881'));
    assert(custThreadStr.includes('45-guest option is supported'));

    console.log('✓ [6/7] Extended community moderation (hide/restore/reports) & private support issues verified');

    // =========================================================================
    // [7/7] Viewpoints: Read-Only Preview vs Audited Admin: Top Act-on-Behalf
    // =========================================================================
    const previewBlockedBooking = await httpReq('/api/bookings/create', {
      method: 'POST',
      cookie: topAdmin.cookie,
      headers: { 'X-BiteShark-Viewpoint': 'preview', 'Idempotency-Key': 'prev-blk-1' },
      body: {
        truck_id: 'mitote',
        event_type: 'Office lunch',
        event_date: futureDateISO(9),
        guest_count: 30,
        location: 'Santa Rosa',
        package_id: 'dropin'
      }
    });
    assert.equal(previewBlockedBooking.status, 403);
    assert.equal(previewBlockedBooking.json.code, 'ADMIN_PREVIEW_READ_ONLY');

    const topWithoutAob = await httpReq('/api/owner/location', {
      method: 'POST',
      cookie: topAdmin.cookie,
      body: { truck_id: 'mitote', location: 'Sebastopol Ave, Santa Rosa', ttl_minutes: 120 }
    });
    assert.equal(topWithoutAob.status, 403);
    assert(String(topWithoutAob.json?.error || '').includes('Act-on-Behalf'));

    const modAobTry = await httpReq('/api/owner/location', {
      method: 'POST',
      cookie: modAdmin.cookie,
      headers: {
        'X-BiteShark-Act-On-Behalf': 'mitote',
        'X-BiteShark-Support-Reason': 'Mod trying operational support'
      },
      body: { truck_id: 'mitote', location: 'Blocked', ttl_minutes: 120 }
    });
    assert.equal(modAobTry.status, 403);
    assert.equal(modAobTry.json.code, 'ACT_ON_BEHALF_FORBIDDEN');

    const topWithAob = await httpReq('/api/owner/location', {
      method: 'POST',
      cookie: topAdmin.cookie,
      headers: {
        'X-BiteShark-Act-On-Behalf': 'mitote',
        'X-BiteShark-Support-Reason': 'Support ticket #501: owner requested live park location update'
      },
      body: { truck_id: 'mitote', location: '665 Sebastopol Rd, Santa Rosa', ttl_minutes: 240 }
    });
    assert.equal(topWithAob.status, 200);

    const auditRes = await httpReq('/api/admin/audit?vendor_id=mitote', { cookie: topAdmin.cookie });
    assert.equal(auditRes.status, 200);
    const aobEntry = auditRes.json.entries.find(
      e => e.actor_id === topAdmin.user.id && e.metadata && e.metadata.acting_on_behalf === true
    );
    assert(aobEntry, 'Act-on-Behalf mutation must record acting_on_behalf audit entry');
    assert.equal(aobEntry.metadata.effective_vendor_id, 'mitote');
    assert(aobEntry.metadata.support_reason.includes('Support ticket #501'));

    await assert.rejects(() => appPool.query('DELETE FROM vendor_status_history'), /permission denied/i);
    await assert.rejects(() => appPool.query('DELETE FROM community_moderation_history'), /permission denied/i);
    await assert.rejects(() => appPool.query('DELETE FROM admin_bootstrap_grants'), /permission denied/i);

    console.log('✓ [7/7] Viewpoint read-only preview, audited Top Act-on-Behalf & append-only history verified');
    console.log('PASS: All BiteShark Administration, Onboarding, Invitations, Moderation, Issues & Viewpoint gates passed.');
  } finally {
    if (standalone) await standalone.closeGracefully(2000).catch(() => {});
    if (appPool) await appPool.end().catch(() => {});
    if (migratorPool) await migratorPool.end().catch(() => {});
    await adminPool.query(`DROP DATABASE IF EXISTS ${dbName}`).catch(() => {});
    await adminPool.query(`DROP ROLE IF EXISTS ${appRole}`).catch(() => {});
    await adminPool.query(`DROP ROLE IF EXISTS ${migratorRole}`).catch(() => {});
    await adminPool.end().catch(() => {});
    await pgCluster.stop();
  }
})().catch(err => {
  console.error('ADMIN GOVERNANCE INTEGRATION FAILURE:', err);
  process.exit(1);
});
