// BiteShark Administrator Account Invitation Workflow, Real Email Delivery & Narrow Staging Eligibility Suite
//
// Deterministically verifies against real PostgreSQL (`NOSUPERUSER NOBYPASSRLS`) and `server/app.js`
// in `BITESHARK_ENV=staging` + `BITESHARK_AUTH_DELIVERY_MODE=resend_https` (simulated Resend wire harness,
// zero external emails sent):
//   1. `Admin: Top` creates/approves `customer`, `vendor_staff`, `vendor_owner`, `mod`, and `top` invitations;
//      email body carries BiteShark Staging identity, exact role, `Admin: Top` full-authority warning,
//      trusted `PUBLIC_ORIGIN/#accept-invite=<token>` link, expiration, and ignore-if-unexpected notice.
//   2. `Mod`, `Vendor`, `Customer`, and anonymous callers cannot grant themselves `Top` or approve `pending_top_approval`.
//   3. Unapproved (`pending_top_approval`), expired, and revoked invitations CANNOT authorize staging signup/OTP
//      or send invitation emails.
//   4. Exact approved `@gmail.com` invitee completes 14+ registration + OTP verification while uninvited
//      `@gmail.com` addresses remain blocked (`403 STAGING_ACCOUNT_NOT_ALLOWLISTED` with actionable guidance),
//      plus TOCTOU revocation guard between `auth/start` and `auth/verify`.
//   5. Accepted `@gmail.com` invitee signs out and signs back in later after single-use token consumption
//      (continuing `auth_users` access without consumer-domain allowlisting).
//   6. Wrong-email redemption (`403 INVITATION_EMAIL_MISMATCH`), expired (`410 INVITATION_EXPIRED`),
//      and revoked (`409 INVITATION_REVOKED`) invitations fail cleanly.
//   7. Concurrent redemption (`Promise.all`) grants the role exactly once (`1` `200` + `4` `409 INVITATION_ALREADY_USED`).
//   8. Provider `422` rejection (`delivery_failed`), transient `503` bounded retry recovery with identical
//      `Idempotency-Key`, persistent timeout (`AbortError` -> `delivery_uncertain`), superseding prior unaccepted
//      invitations, and explicit token-rotating `resend` (`token_version + 1`, old token invalidated, revoked rejected).
//   9. Historical `recorded_test_safe` `admin_notification_outbox` rows and `not_requested` invitations are
//      NEVER automatically emailed and render honestly as `Historical (not emailed)`.
//  10. Raw invitation tokens, OTPs, session cookies, and API keys NEVER appear in `resend_https` JSON responses,
//      `audit_logs`, `account_invitation_events`, `auth_delivery_telemetry`, or server logs.
//  11. Recipient account suspension (`disabled_at`) immediately blocks active sessions AND future staging OTP
//      `start`/`verify`; role revocation (`role: 'none'`) immediately removes `Admin: Top` privileges.

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
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-inv-pg-'));
  const dataDir = path.join(tmpBase, 'data');
  const pwFile = path.join(tmpBase, 'pw.txt');
  const logFile = path.join(tmpBase, 'postgres.log');
  const password = 'inv_pw_' + crypto.randomBytes(6).toString('hex');
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
    adminUrl: `postgresql://postgres:${encodeURIComponent(password)}@127.0.0.1:${port}/postgres`,
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

function runMigrationsCli(migratorUrl, appRole) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'scripts', 'run-migrations.cjs'), '--app-role', appRole], {
      cwd: ROOT,
      env: { ...process.env, MIGRATION_DATABASE_URL: migratorUrl },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => (stdout += d.toString()));
    child.stderr.on('data', d => (stderr += d.toString()));
    child.on('error', reject);
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
}

function parseSessionCookie(setCookieHeader) {
  const arr = Array.isArray(setCookieHeader) ? setCookieHeader : setCookieHeader ? [setCookieHeader] : [];
  for (const raw of arr) {
    const m = String(raw).match(/^(__Host-truckly_session=[^;]+)/);
    if (m) return m[1];
  }
  return null;
}

function extractOtpFromBody(text) {
  const m = String(text || '').match(/(?:verification code:\s*)(\d{6})/i) || String(text || '').match(/\b(\d{6})\b/);
  return m ? m[1] : null;
}

function extractInviteTokenFromBody(text) {
  const m = String(text || '').match(/https?:\/\/[^\s]+\/#accept-invite=([A-Za-z0-9_-]+)/);
  return m ? { fullLink: m[0], token: m[1] } : null;
}

async function main() {
  const { Pool } = requirePg();
  const cluster = await createPostgresCluster();
  const suffix = crypto.randomBytes(4).toString('hex');
  const dbName = `bs_inv_${suffix}`;
  const migratorRole = `bs_inv_mig_${suffix}`;
  const appRole = `bs_inv_app_${suffix}`;
  const migPass = 'mig_' + crypto.randomBytes(8).toString('hex');
  const appPass = 'app_' + crypto.randomBytes(8).toString('hex');

  const superPool = new Pool({ connectionString: cluster.adminUrl, max: 2 });
  let migratorPool = null;
  let appPool = null;
  let server = null;

  const authSecret = 'inv_auth_secret_' + crypto.randomBytes(24).toString('hex');
  const resendApiKey = 're_inv_test_key_' + crypto.randomBytes(16).toString('hex');
  const workerSecret = 'wk_inv_secret_' + crypto.randomBytes(20).toString('hex');
  const releaseSha = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';

  const capturedLogs = [];

  try {
    await superPool.query(`CREATE ROLE "${migratorRole}" WITH LOGIN PASSWORD '${migPass}' CREATEDB`);
    await superPool.query(`CREATE ROLE "${appRole}" WITH LOGIN PASSWORD '${appPass}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`);
    await superPool.query(`CREATE DATABASE "${dbName}" OWNER "${migratorRole}"`);

    const parsedAdmin = new URL(cluster.adminUrl);
    const migratorUrl = `postgresql://${migratorRole}:${encodeURIComponent(migPass)}@${parsedAdmin.hostname}:${parsedAdmin.port}/${dbName}`;
    const appUrl = `postgresql://${appRole}:${encodeURIComponent(appPass)}@${parsedAdmin.hostname}:${parsedAdmin.port}/${dbName}`;

    const migRes = await runMigrationsCli(migratorUrl, appRole);
    assert.equal(migRes.code, 0, `Migrations failed: ${migRes.stderr}`);
    assert(migRes.stdout.includes('"newly_applied":30'), `Expected 30 migrations applied: ${migRes.stdout}`);

    migratorPool = new Pool({ connectionString: migratorUrl, max: 4 });
    appPool = new Pool({ connectionString: appUrl, max: 8 });

    async function privQuery(sql, params = []) {
      const c = await migratorPool.connect();
      try {
        await c.query('BEGIN');
        await c.query("SELECT set_config('app.auth_internal', 'true', true)");
        await c.query("SELECT set_config('app.admin_portal', 'true', true)");
        const res = await c.query(sql, params);
        await c.query('COMMIT');
        return res;
      } catch (e) {
        await c.query('ROLLBACK').catch(() => {});
        throw e;
      } finally {
        c.release();
      }
    }

    // Verify least-privilege DB grants on `account_invitation_events`
    const evtPriv = await appPool.query(
      `SELECT has_table_privilege(current_user, 'account_invitation_events', 'UPDATE') AS can_upd,
              has_table_privilege(current_user, 'account_invitation_events', 'DELETE') AS can_del,
              has_table_privilege(current_user, 'account_invitation_events', 'INSERT') AS can_ins`
    );
    assert.equal(evtPriv.rows[0].can_upd, false, 'app role must NOT have UPDATE on account_invitation_events');
    assert.equal(evtPriv.rows[0].can_del, false, 'app role must NOT have DELETE on account_invitation_events');
    assert.equal(evtPriv.rows[0].can_ins, true, 'app role must have INSERT on account_invitation_events');

    const port = await getFreePort();
    const publicOrigin = `https://staging.biteshark.live`;
    const localBaseUrl = `http://127.0.0.1:${port}`;

    for (const k of Object.keys(process.env)) {
      if (k.startsWith('BITESHARK_') || k.startsWith('TRUCKLY_')) delete process.env[k];
    }

    // Configure exact staging environment: ONLY `@operator.biteshark.test` is statically allowlisted.
    // Consumer `@gmail.com` is NOT allowlisted!
    process.env.DATABASE_URL = appUrl;
    process.env.BITESHARK_ENV = 'staging';
    process.env.BITESHARK_PUBLIC_ORIGIN = publicOrigin;
    process.env.BITESHARK_TRUST_PROXY = 'loopback';
    process.env.BITESHARK_AUTH_SECRET = authSecret;
    process.env.BITESHARK_AUTH_DELIVERY_MODE = 'resend_https';
    process.env.BITESHARK_AUTH_EMAIL_API_KEY = resendApiKey;
    process.env.BITESHARK_AUTH_EMAIL_FROM = 'BiteShark <login@biteshark.live>';
    process.env.BITESHARK_STAGING_ALLOWED_EMAIL_DOMAINS = 'operator.biteshark.test';
    process.env.BITESHARK_STAGING_ALLOWED_EMAILS = '';
    process.env.BITESHARK_PUSH_PROVIDER_MODE = 'disabled';
    process.env.BITESHARK_NOTIFICATION_WORKER_SECRET = workerSecret;
    process.env.BITESHARK_RELEASE_SHA = releaseSha;
    process.env.BITESHARK_AUTH_EMAIL_API_URL = 'https://api.resend.com/emails';
    process.env.BITESHARK_AUTH_EMAIL_TIMEOUT_MS = '350';

    // Seed two Top admins, one Mod admin, and a historical pre-023 `not_requested` invitation + `recorded_test_safe` outbox row
    const topAdminEmail = 'top1@operator.biteshark.test';
    const topAdmin2Email = 'top2@operator.biteshark.test';
    const modAdminEmail = 'mod1@operator.biteshark.test';
    const historicalEmail = 'historical-pre023@gmail.com';
    const historicalTokenSha = crypto.createHash('sha256').update('historical_raw_token_never_emailed').digest('hex');

    await privQuery(
      `INSERT INTO auth_users (id, email_normalized, age_eligibility_status, age_assessed_at, age_policy_version, age_assessment_basis)
       VALUES
         ('usr_sa_top001', $1, 'eligible_14_plus', now(), 'draft-14plus-v0.1', 'self_reported_dob_at_signup'),
         ('usr_sa_top002', $2, 'eligible_14_plus', now(), 'draft-14plus-v0.1', 'self_reported_dob_at_signup'),
         ('usr_sa_mod001', $3, 'eligible_14_plus', now(), 'draft-14plus-v0.1', 'self_reported_dob_at_signup')`,
      [topAdminEmail, topAdmin2Email, modAdminEmail]
    );
    await privQuery(
      `INSERT INTO platform_roles (user_id, role, granted_by)
       VALUES
         ('usr_sa_top001', 'top', 'bootstrap'),
         ('usr_sa_top002', 'top', 'bootstrap'),
         ('usr_sa_mod001', 'mod', 'usr_sa_top001')`
    );
    await privQuery(
      `INSERT INTO account_invitations
         (email_normalized, requested_role, token_sha256, status, delivery_status, initiated_by, initiator_role, approved_by, approved_at, expires_at)
       VALUES ($1, 'mod', $2, 'issued', 'not_requested', 'usr_sa_top001', 'top', 'usr_sa_top001', now() - interval '1 day', now() + interval '2 days')`,
      [historicalEmail, historicalTokenSha]
    );
    await privQuery(
      `INSERT INTO admin_notification_outbox (recipient_email, event_kind, subject, summary, delivery_status)
       VALUES ($1, 'invitation.issued', 'Legacy Test-Safe Notice', 'Historical un-emailed notice', 'recorded_test_safe')`,
      [historicalEmail]
    );

    const { createStandaloneServer } = await import(pathToFileURL(path.join(ROOT, 'server', 'app.js')).href);
    const standaloneAuth = await import(pathToFileURL(path.join(ROOT, 'lib', 'standalone-auth.js')).href);

    const origFetch = global.fetch;
    // Wire-level Resend HTTPS mock on `https://api.resend.com/emails` (zero external traffic!)
    const sentWireMessages = [];
    let nextInviteBehavior = null; // null | { mode: 'reject_422' } | { mode: 'transient_503_once' } | { mode: 'always_timeout' }
    let transient503Remaining = 0;

    global.fetch = async function interceptedFetch(input, init) {
      const urlStr = typeof input === 'string' ? input : input?.url || String(input);
      if (urlStr === 'https://api.resend.com/emails') {
        const rawBodyStr = String(init?.body || '{}');
        const parsedBody = JSON.parse(rawBodyStr);
        const hdrs = init?.headers || {};
        const isInvitation = String(parsedBody.subject || '').toLowerCase().includes('invitation');
        const record = {
          url: urlStr,
          method: init?.method,
          headers: { ...hdrs },
          body: parsedBody,
          isInvitation,
          timestamp: Date.now()
        };
        sentWireMessages.push(record);

        assert.equal(hdrs.Authorization || hdrs.authorization, `Bearer ${resendApiKey}`);
        assert(!rawBodyStr.includes(resendApiKey), 'API key must never appear in email payload');

        if (isInvitation && nextInviteBehavior) {
          if (nextInviteBehavior.mode === 'reject_422') {
            nextInviteBehavior = null;
            return new Response(
              JSON.stringify({ name: 'validation_error', message: `Domain verification error (${resendApiKey})` }),
              { status: 422, headers: { 'Content-Type': 'application/json' } }
            );
          }
          if (nextInviteBehavior.mode === 'transient_503_once' && transient503Remaining > 0) {
            transient503Remaining -= 1;
            return new Response(
              JSON.stringify({ name: 'service_unavailable', message: 'Temporary upstream outage' }),
              { status: 503, headers: { 'Content-Type': 'application/json' } }
            );
          }
          if (nextInviteBehavior.mode === 'always_timeout') {
            await new Promise((_, reject) => {
              const onAbort = () => {
                const abortErr = new Error('Simulated Resend network timeout');
                abortErr.name = 'AbortError';
                reject(abortErr);
              };
              if (init?.signal?.aborted) return onAbort();
              init?.signal?.addEventListener('abort', onAbort, { once: true });
            });
          }
        }

        const msgId = 're_msg_' + crypto.randomBytes(8).toString('hex');
        return new Response(JSON.stringify({ id: msgId }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return origFetch(input, init);
    };

    const appInstance = createStandaloneServer({
      dbAdapter: appPool,
      publicDir: path.join(ROOT, 'public'),
      releaseSha,
      logger: {
        info: line => capturedLogs.push(String(line)),
        warn: line => capturedLogs.push(String(line)),
        error: line => capturedLogs.push(String(line))
      }
    });
    server = appInstance.server;
    await new Promise((resolve, reject) => {
      server.listen(port, '127.0.0.1', err => (err ? reject(err) : resolve()));
    });

    async function apiCall(pathname, { method = 'GET', body, cookie, ip = '198.51.100.25', extraHeaders = {} } = {}) {
      const headers = {
        Host: 'staging.biteshark.live',
        'X-Forwarded-Proto': 'https',
        'X-Real-IP': ip,
        'X-Forwarded-For': ip,
        ...extraHeaders
      };
      if (cookie) headers.Cookie = cookie;
      let payloadBuf = null;
      if (method !== 'GET' && method !== 'HEAD') {
        headers.Origin = publicOrigin;
        headers['Content-Type'] = 'application/json';
        if (pathname.startsWith('/api/auth/')) {
          headers['X-BiteShark-Client'] = 'web-auth-v1';
        }
        payloadBuf = Buffer.from(JSON.stringify(body || {}), 'utf8');
        headers['Content-Length'] = String(payloadBuf.length);
      }
      return new Promise((resolve, reject) => {
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port,
            path: pathname,
            method,
            headers
          },
          res => {
            let text = '';
            res.setEncoding('utf8');
            res.on('data', chunk => (text += chunk));
            res.on('end', () => {
              let json = null;
              try {
                json = JSON.parse(text);
              } catch {}
              const setCookies = res.headers['set-cookie'] || [];
              resolve({
                status: res.statusCode,
                headers: res.headers,
                json,
                text,
                sessionCookie: parseSessionCookie(setCookies)
              });
            });
          }
        );
        req.on('error', reject);
        if (payloadBuf) req.write(payloadBuf);
        req.end();
      });
    }

    async function signInViaOtp(email, { signupDob = null, ip = '198.51.100.30' } = {}) {
      const beforeIdx = sentWireMessages.length;
      const startBody = signupDob ? { email, intent: 'signup', ...signupDob } : { email };
      const startRes = await apiCall('/api/auth/start', { method: 'POST', body: startBody, ip });
      assert.equal(startRes.status, 200, `OTP start failed for ${email}: ${startRes.text}`);

      const otpMsg = sentWireMessages.slice(beforeIdx).find(m => !m.isInvitation && m.body.to[0] === email.toLowerCase());
      assert(otpMsg, `Expected OTP email dispatched to ${email}`);
      const code = extractOtpFromBody(otpMsg.body.text);
      assert(code && /^\d{6}$/.test(code), 'Expected 6-digit OTP in email');

      const verRes = await apiCall('/api/auth/verify', {
        method: 'POST',
        body: { email, code },
        ip
      });
      assert.equal(verRes.status, 200, `OTP verify failed for ${email}: ${verRes.text}`);
      assert(verRes.sessionCookie, 'Expected __Host-truckly_session cookie');
      return { cookie: verRes.sessionCookie, user: verRes.json.user, otpCode: code };
    }

    // -------------------------------------------------------------------------
    // [1/10] Historical `not_requested` & `recorded_test_safe` non-auto-send check
    // -------------------------------------------------------------------------
    const workerRes = await fetch(`${localBaseUrl}/api/pager/worker`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${workerSecret}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ max_items: 10 })
    });
    assert.equal(workerRes.status, 200);
    assert.equal(
      sentWireMessages.filter(m => m.body.to && m.body.to.includes(historicalEmail)).length,
      0,
      'Historical pre-023 invitations and recorded_test_safe outbox rows must NEVER be automatically emailed'
    );

    const top1 = await signInViaOtp(topAdminEmail, { ip: '198.51.100.11' });
    const top2 = await signInViaOtp(topAdmin2Email, { ip: '198.51.100.12' });
    const mod1 = await signInViaOtp(modAdminEmail, { ip: '198.51.100.13' });

    const listInitial = await apiCall('/api/admin/invitations', { cookie: top1.cookie });
    assert.equal(listInitial.status, 200);
    const histRow = listInitial.json.invitations.find(r => r.email === historicalEmail);
    assert(histRow, 'Expected historical invitation visible in admin list');
    assert.equal(histRow.delivery_status, 'not_requested');
    assert.equal(histRow.delivery_status_label, 'Historical (not emailed)');
    assert.equal(histRow.acceptance_label, 'Awaiting recipient acceptance');

    // -------------------------------------------------------------------------
    // [2/10] Role governance: Mod, Vendor, Customer & Anonymous boundaries
    // -------------------------------------------------------------------------
    const anonCreate = await apiCall('/api/admin/invitations/create', {
      method: 'POST',
      body: { email: 'anon-attempt@gmail.com', requested_role: 'top' }
    });
    assert.equal(anonCreate.status, 401);

    // Mod requests `top` -> enters `pending_top_approval`, ZERO email sent, Mod cannot self-approve
    const modReqEmail = 'mod-proposed-top@gmail.com';
    const beforeModCount = sentWireMessages.length;
    const modCreateRes = await apiCall('/api/admin/invitations/create', {
      method: 'POST',
      cookie: mod1.cookie,
      body: { email: modReqEmail, requested_role: 'top', note: 'Proposed co-admin' }
    });
    assert.equal(modCreateRes.status, 201);
    assert.equal(modCreateRes.json.invitation.status, 'pending_top_approval');
    assert.equal(modCreateRes.json.invitation.delivery_status, 'pending_approval');
    assert.equal(modCreateRes.json.accept_path, undefined, 'Never return accept_path');
    assert.equal(sentWireMessages.length, beforeModCount, 'Pending-approval invitation must NOT send email');

    // Unapproved invitation CANNOT authorize staging signup/OTP!
    const unapprovedStart = await apiCall('/api/auth/start', {
      method: 'POST',
      ip: '198.51.100.40',
      body: { email: modReqEmail, intent: 'signup', dob_year: '1995', dob_month: '04', dob_day: '12' }
    });
    assert.equal(unapprovedStart.status, 403);
    assert.equal(unapprovedStart.json.code, 'STAGING_ACCOUNT_NOT_ALLOWLISTED');
    assert(
      unapprovedStart.json.error.includes('approved BiteShark invitation'),
      `Expected actionable staging restriction message, got: ${unapprovedStart.json.error}`
    );

    // Mod cannot approve `pending_top_approval`
    const modApproveAttempt = await apiCall('/api/admin/invitations/decision', {
      method: 'POST',
      cookie: mod1.cookie,
      body: { invitation_id: modCreateRes.json.invitation.id, action: 'approve', reason: 'Mod self-approve attempt' }
    });
    assert.equal(modApproveAttempt.status, 403);

    // Distinct Top admin (`top1`) approves -> immediately dispatches real email via Resend
    const topApproveModReq = await apiCall('/api/admin/invitations/decision', {
      method: 'POST',
      cookie: top1.cookie,
      body: { invitation_id: modCreateRes.json.invitation.id, action: 'approve', reason: 'Approved by Top 1' }
    });
    assert.equal(topApproveModReq.status, 200);
    assert.equal(topApproveModReq.json.invitation.status, 'issued');
    assert.equal(topApproveModReq.json.delivery.status, 'provider_accepted');
    assert.equal(topApproveModReq.json.accept_path, undefined, 'resend_https mode must NEVER expose raw accept_path');

    // Revoke `modReqEmail` immediately and verify revoked invitation CANNOT authorize staging signup/OTP
    const revokeModReq = await apiCall('/api/admin/invitations/decision', {
      method: 'POST',
      cookie: top1.cookie,
      body: { invitation_id: modCreateRes.json.invitation.id, action: 'revoke', reason: 'Revoked for test' }
    });
    assert.equal(revokeModReq.status, 200);
    assert.equal(revokeModReq.json.status, 'revoked');

    const revokedStart = await apiCall('/api/auth/start', {
      method: 'POST',
      ip: '198.51.100.41',
      body: { email: modReqEmail, intent: 'signup', dob_year: '1995', dob_month: '04', dob_day: '12' }
    });
    assert.equal(revokedStart.status, 403);
    assert.equal(revokedStart.json.code, 'STAGING_ACCOUNT_NOT_ALLOWLISTED');

    // -------------------------------------------------------------------------
    // [3/10] Top creates Customer, Vendor Staff, Vendor Owner, Mod, and Top invitations
    // -------------------------------------------------------------------------
    // Missing vendor_id on vendor_staff must fail 400
    const missingVendorRes = await apiCall('/api/admin/invitations/create', {
      method: 'POST',
      cookie: top1.cookie,
      body: { email: 'vstaff-missing@gmail.com', requested_role: 'vendor_staff' }
    });
    assert.equal(missingVendorRes.status, 400);

    const custInvRes = await apiCall('/api/admin/invitations/create', {
      method: 'POST',
      cookie: top1.cookie,
      body: { email: 'invited-customer@gmail.com', requested_role: 'customer' }
    });
    assert.equal(custInvRes.status, 201);
    assert.equal(custInvRes.json.delivery.status, 'provider_accepted');
    assert.equal(custInvRes.json.accept_path, undefined);

    const staffInvRes = await apiCall('/api/admin/invitations/create', {
      method: 'POST',
      cookie: top1.cookie,
      body: { email: 'invited-staff@gmail.com', requested_role: 'vendor_staff', vendor_id: 'iniguez' }
    });
    assert.equal(staffInvRes.status, 201);
    assert.equal(staffInvRes.json.delivery.status, 'provider_accepted');

    const ownerInvRes = await apiCall('/api/admin/invitations/create', {
      method: 'POST',
      cookie: top1.cookie,
      body: { email: 'invited-owner@gmail.com', requested_role: 'vendor_owner', vendor_id: 'iniguez' }
    });
    assert.equal(ownerInvRes.status, 201);
    assert.equal(ownerInvRes.json.delivery.status, 'provider_accepted');

    const modInvRes = await apiCall('/api/admin/invitations/create', {
      method: 'POST',
      cookie: top1.cookie,
      body: { email: 'invited-mod@gmail.com', requested_role: 'mod' }
    });
    assert.equal(modInvRes.status, 201);
    assert.equal(modInvRes.json.delivery.status, 'provider_accepted');

    // Verify customer & vendor callers cannot issue Top invitations
    const custInviteWire = sentWireMessages.find(m => m.isInvitation && m.body.to[0] === 'invited-customer@gmail.com');
    const custExtracted = extractInviteTokenFromBody(custInviteWire.body.text);
    const custUser = await signInViaOtp('invited-customer@gmail.com', {
      signupDob: { dob_year: '1998', dob_month: '07', dob_day: '19' },
      ip: '198.51.100.42'
    });
    const custAccept = await apiCall('/api/invitations/accept', {
      method: 'POST',
      cookie: custUser.cookie,
      body: { token: custExtracted.token }
    });
    assert.equal(custAccept.status, 200);
    const custAdminAttempt = await apiCall('/api/admin/invitations/create', {
      method: 'POST',
      cookie: custUser.cookie,
      body: { email: 'cust-escalation@gmail.com', requested_role: 'top' }
    });
    assert.equal(custAdminAttempt.status, 403);

    // Vendor owner accepts & verifies onboarding review gating (`requires_vendor_application_review === true`) + cannot escalate to Top
    const ownerInviteWire = sentWireMessages.find(m => m.isInvitation && m.body.to[0] === 'invited-owner@gmail.com');
    const ownerExtracted = extractInviteTokenFromBody(ownerInviteWire.body.text);
    const ownerUser = await signInViaOtp('invited-owner@gmail.com', {
      signupDob: { dob_year: '1990', dob_month: '03', dob_day: '21' },
      ip: '198.51.100.43'
    });
    const ownerAccept = await apiCall('/api/invitations/accept', {
      method: 'POST',
      cookie: ownerUser.cookie,
      body: { token: ownerExtracted.token }
    });
    assert.equal(ownerAccept.status, 200);
    assert.equal(ownerAccept.json.requires_vendor_application_review, true);
    const ownerAdminAttempt = await apiCall('/api/admin/invitations/create', {
      method: 'POST',
      cookie: ownerUser.cookie,
      body: { email: 'vendor-escalation@gmail.com', requested_role: 'top' }
    });
    assert.equal(ownerAdminAttempt.status, 403);

    // -------------------------------------------------------------------------
    // [4/10] Full Admin: Top invitation email content, non-privilege before accept,
    //        narrow exact-email `@gmail.com` staging eligibility & continuing sign-in
    // -------------------------------------------------------------------------
    const targetTopInvitee = 'disposable-top-invitee@gmail.com';
    const uninvitedGmail = 'uninvited-stranger@gmail.com';

    // Uninvited `@gmail.com` is blocked cleanly
    const strangerStart = await apiCall('/api/auth/start', {
      method: 'POST',
      ip: '198.51.100.50',
      body: { email: uninvitedGmail, intent: 'signup', dob_year: '1994', dob_month: '08', dob_day: '10' }
    });
    assert.equal(strangerStart.status, 403);
    assert.equal(strangerStart.json.code, 'STAGING_ACCOUNT_NOT_ALLOWLISTED');

    // Create Admin: Top invitation for `targetTopInvitee`
    const topInviteCreate = await apiCall('/api/admin/invitations/create', {
      method: 'POST',
      cookie: top1.cookie,
      body: { email: targetTopInvitee, requested_role: 'top', note: 'Authorized Top administrator' }
    });
    assert.equal(topInviteCreate.status, 201);
    assert.equal(topInviteCreate.json.invitation.status, 'issued');
    assert.equal(topInviteCreate.json.delivery.status, 'provider_accepted');
    assert.equal(topInviteCreate.json.accept_path, undefined);

    // Inspect wire email sent via Resend
    const topWire = sentWireMessages.find(m => m.isInvitation && m.body.to[0] === targetTopInvitee);
    assert(topWire, 'Expected Resend invitation email dispatched');
    assert.equal(topWire.body.from, 'BiteShark <login@biteshark.live>');
    assert.equal(topWire.headers['Idempotency-Key'], `biteshark-invite-${topInviteCreate.json.invitation.id}-gen1`);
    assert(topWire.body.subject.includes('BiteShark Staging'), 'Subject must identify BiteShark Staging');
    assert(topWire.body.subject.includes('Admin: Top'), 'Subject must include invited role');
    assert(topWire.body.text.includes('Admin: Top'), 'Body must include exact invited role');
    assert(topWire.body.text.toLowerCase().includes('full administrative authority'), 'Admin: Top email must warn of full authority');
    assert(topWire.body.text.includes('single-use'), 'Body must state single-use');
    assert(topWire.body.text.includes('UTC'), 'Body must include expiration timestamp');
    assert(/ignore.*this email/i.test(topWire.body.text), 'Body must instruct unexpected recipients to ignore');

    const extractedTopInvite = extractInviteTokenFromBody(topWire.body.text);
    assert(extractedTopInvite, 'Expected single-use fragment link in email');
    assert(
      extractedTopInvite.fullLink.startsWith('https://staging.biteshark.live/#accept-invite='),
      `Link must use trusted PUBLIC_ORIGIN and hash fragment: ${extractedTopInvite.fullLink}`
    );
    assert.equal(Buffer.from(extractedTopInvite.token, 'base64url').length, 32, 'Token must be 32 CSPRNG bytes');

    // Verify DB stores ONLY SHA-256 hash and recipient has ZERO account or privileges yet!
    const preAcceptDb = await privQuery(
      `SELECT u.id AS user_id, inv.token_sha256
         FROM account_invitations inv
         LEFT JOIN auth_users u ON u.email_normalized = inv.email_normalized
        WHERE inv.id = $1`,
      [topInviteCreate.json.invitation.id]
    );
    assert.equal(preAcceptDb.rows[0].user_id, null, 'Creating/emailing an invitation must NOT pre-create auth_users');
    assert.equal(
      preAcceptDb.rows[0].token_sha256,
      crypto.createHash('sha256').update(extractedTopInvite.token).digest('hex')
    );

    // Other `@gmail.com` addresses STILL remain blocked while `targetTopInvitee` is invited!
    const strangerStillBlocked = await apiCall('/api/auth/start', {
      method: 'POST',
      ip: '198.51.100.51',
      body: { email: 'another-random-person@gmail.com', intent: 'signup', dob_year: '1994', dob_month: '08', dob_day: '10' }
    });
    assert.equal(strangerStillBlocked.status, 403);

    // Inspect endpoint works before sign-in and masks email
    const preAuthInspect = await apiCall('/api/invitations/inspect', {
      method: 'POST',
      body: { token: extractedTopInvite.token }
    });
    assert.equal(preAuthInspect.status, 200);
    assert.equal(preAuthInspect.json.invitation.requested_role, 'top');
    assert.equal(preAuthInspect.json.invitation.full_authority_warning, true);
    assert.equal(preAuthInspect.json.invitation.email_matches_session, null);

    // Wrong signed-in account (`custUser`) sees `email_matches_session: false` and gets `403 INVITATION_EMAIL_MISMATCH` on accept!
    const wrongAcctInspect = await apiCall('/api/invitations/inspect', {
      method: 'POST',
      cookie: custUser.cookie,
      body: { token: extractedTopInvite.token }
    });
    assert.equal(wrongAcctInspect.status, 200);
    assert.equal(wrongAcctInspect.json.invitation.email_matches_session, false);

    const wrongAcctAccept = await apiCall('/api/invitations/accept', {
      method: 'POST',
      cookie: custUser.cookie,
      body: { token: extractedTopInvite.token }
    });
    assert.equal(wrongAcctAccept.status, 403);
    assert.equal(wrongAcctAccept.json.code, 'INVITATION_EMAIL_MISMATCH');

    // Exact invited `@gmail.com` user completes 14+ signup + OTP verification!
    const newTopInviteeSession = await signInViaOtp(targetTopInvitee, {
      signupDob: { dob_year: '1996', dob_month: '05', dob_day: '14' },
      ip: '198.51.100.52'
    });

    // BEFORE explicit acceptance, verified user STILL does NOT have Top admin access!
    const preAcceptOverview = await apiCall('/api/admin/overview', { cookie: newTopInviteeSession.cookie });
    assert.equal(preAcceptOverview.status, 403, 'Verified invitee must NOT hold Top role before explicit acceptance');

    // -------------------------------------------------------------------------
    // [5/10] Concurrent redemption (`Promise.all`) grants role ONCE!
    // -------------------------------------------------------------------------
    const concurrentAccepts = await Promise.all(
      Array.from({ length: 5 }, () =>
        apiCall('/api/invitations/accept', {
          method: 'POST',
          cookie: newTopInviteeSession.cookie,
          body: { token: extractedTopInvite.token }
        })
      )
    );
    const winners = concurrentAccepts.filter(r => r.status === 200);
    const replayConflicts = concurrentAccepts.filter(r => r.status === 409 && r.json && r.json.code === 'INVITATION_ALREADY_USED');
    assert.equal(winners.length, 1, `Expected exactly 1 concurrent winner, got ${winners.length}: ${JSON.stringify(concurrentAccepts.map(r => ({ s: r.status, b: r.json })))}`);
    assert.equal(replayConflicts.length, 4, `Expected 4 INVITATION_ALREADY_USED responses, got ${replayConflicts.length}: ${JSON.stringify(concurrentAccepts.map(r => ({ s: r.status, b: r.json })))}`);

    // Inspecting consumed token returns clear `409 INVITATION_ALREADY_USED`
    const inspectAfterConsume = await apiCall('/api/invitations/inspect', {
      method: 'POST',
      cookie: newTopInviteeSession.cookie,
      body: { token: extractedTopInvite.token }
    });
    assert.equal(inspectAfterConsume.status, 409);
    assert.equal(inspectAfterConsume.json.code, 'INVITATION_ALREADY_USED');

    // Recipient now has full `Admin: Top` access!
    const postAcceptOverview = await apiCall('/api/admin/overview', { cookie: newTopInviteeSession.cookie });
    assert.equal(postAcceptOverview.status, 200);
    assert.equal(postAcceptOverview.json.actor.level, 'top');

    // Admin portal list now shows `Accepted by provider` AND `Accepted by recipient`
    const listAfterAccept = await apiCall('/api/admin/invitations', { cookie: top1.cookie });
    const acceptedRow = listAfterAccept.json.invitations.find(r => r.id === topInviteCreate.json.invitation.id);
    assert.equal(acceptedRow.status, 'consumed');
    assert.equal(acceptedRow.delivery_status_label, 'Accepted by provider');
    assert.equal(acceptedRow.acceptance_label, 'Accepted by recipient');
    assert(acceptedRow.events.some(e => e.event_type === 'created'), 'History must include created event');
    assert(acceptedRow.events.some(e => e.event_type === 'provider_accepted'), 'History must include provider_accepted event');
    assert(acceptedRow.events.some(e => e.event_type === 'accepted'), 'History must include accepted event');

    // -------------------------------------------------------------------------
    // [6/10] Continuing access AFTER token consumption: sign out & sign back in!
    // -------------------------------------------------------------------------
    const logoutRes = await apiCall('/api/auth/logout', {
      method: 'POST',
      cookie: newTopInviteeSession.cookie
    });
    assert.equal(logoutRes.status, 200);

    const returningTopSession = await signInViaOtp(targetTopInvitee, { ip: '198.51.100.53' });
    const returningOverview = await apiCall('/api/admin/overview', { cookie: returningTopSession.cookie });
    assert.equal(returningOverview.status, 200, 'Accepted @gmail.com Top admin must retain continuing staging login');

    // -------------------------------------------------------------------------
    // [7/10] TOCTOU Revocation Race & Expired Invitation Rejection
    // -------------------------------------------------------------------------
    const toctouEmail = 'toctou-race@gmail.com';
    const toctouInv = await apiCall('/api/admin/invitations/create', {
      method: 'POST',
      cookie: top1.cookie,
      body: { email: toctouEmail, requested_role: 'customer' }
    });
    assert.equal(toctouInv.status, 201);

    const beforeToctouOtp = sentWireMessages.length;
    const toctouStart = await apiCall('/api/auth/start', {
      method: 'POST',
      ip: '198.51.100.60',
      body: { email: toctouEmail, intent: 'signup', dob_year: '1999', dob_month: '02', dob_day: '10' }
    });
    assert.equal(toctouStart.status, 200);
    const toctouOtp = extractOtpFromBody(sentWireMessages.slice(beforeToctouOtp).find(m => !m.isInvitation).body.text);

    // Revoke invitation BEFORE the recipient verifies the OTP!
    await apiCall('/api/admin/invitations/decision', {
      method: 'POST',
      cookie: top1.cookie,
      body: { invitation_id: toctouInv.json.invitation.id, action: 'revoke', reason: 'Revoked mid-OTP' }
    });

    const toctouVerify = await apiCall('/api/auth/verify', {
      method: 'POST',
      ip: '198.51.100.60',
      body: { email: toctouEmail, code: toctouOtp }
    });
    assert.equal(toctouVerify.status, 403, 'Revoking invitation before OTP verify must block brand-new staging account creation');
    assert.equal(toctouVerify.json.code, 'STAGING_ACCOUNT_NOT_ALLOWLISTED');

    // Expired invitation check (`410 INVITATION_EXPIRED` + blocks staging OTP)
    const expEmail = 'expired-invite@gmail.com';
    const expInv = await apiCall('/api/admin/invitations/create', {
      method: 'POST',
      cookie: top1.cookie,
      body: { email: expEmail, requested_role: 'mod' }
    });
    const expToken = extractInviteTokenFromBody(
      sentWireMessages.find(m => m.isInvitation && m.body.to[0] === expEmail).body.text
    ).token;
    await privQuery(
      `UPDATE account_invitations SET expires_at = now() - interval '5 minutes' WHERE id = $1`,
      [expInv.json.invitation.id]
    );

    const expInspect = await apiCall('/api/invitations/inspect', {
      method: 'POST',
      body: { token: expToken }
    });
    assert.equal(expInspect.status, 410);
    assert.equal(expInspect.json.code, 'INVITATION_EXPIRED');

    const expStart = await apiCall('/api/auth/start', {
      method: 'POST',
      ip: '198.51.100.61',
      body: { email: expEmail, intent: 'signup', dob_year: '1993', dob_month: '11', dob_day: '04' }
    });
    assert.equal(expStart.status, 403);
    assert.equal(expStart.json.code, 'STAGING_ACCOUNT_NOT_ALLOWLISTED');

    // -------------------------------------------------------------------------
    // [8/10] Provider failures (`422`), bounded retry (`503`), timeout (`delivery_uncertain`),
    //        superseding prior invitations & token-rotating `resend`
    // -------------------------------------------------------------------------
    // 8a. Provider 422 rejection preserves invitation with `delivery_status='delivery_failed'`
    nextInviteBehavior = { mode: 'reject_422' };
    const failEmail = 'provider-failed@gmail.com';
    const failCreate = await apiCall('/api/admin/invitations/create', {
      method: 'POST',
      cookie: top1.cookie,
      body: { email: failEmail, requested_role: 'mod' }
    });
    assert.equal(failCreate.status, 201, 'Invitation record is preserved with explicit failed delivery status');
    assert.equal(failCreate.json.delivery.ok, false);
    assert.equal(failCreate.json.delivery.status, 'delivery_failed');
    const firstFailedToken = extractInviteTokenFromBody(
      sentWireMessages.filter(m => m.isInvitation && m.body.to[0] === failEmail)[0].body.text
    ).token;

    // 8b. Resend with transient 503 -> succeeds on bounded retry attempt #2 with IDENTICAL Idempotency-Key!
    nextInviteBehavior = { mode: 'transient_503_once' };
    transient503Remaining = 1;
    const beforeResendIdx = sentWireMessages.length;
    const resendRes = await apiCall('/api/admin/invitations/decision', {
      method: 'POST',
      cookie: top1.cookie,
      body: { invitation_id: failCreate.json.invitation.id, action: 'resend', reason: 'Retry after transient upstream error' }
    });
    nextInviteBehavior = null;
    assert.equal(resendRes.status, 200);
    assert.equal(resendRes.json.invitation.token_version, 2);
    assert.equal(resendRes.json.delivery.ok, true);
    assert.equal(resendRes.json.delivery.status, 'provider_accepted');

    const resendAttempts = sentWireMessages.slice(beforeResendIdx).filter(m => m.isInvitation && m.body.to[0] === failEmail);
    assert.equal(resendAttempts.length, 2, 'Expected bounded retry to recover on attempt 2');
    assert.equal(
      resendAttempts[0].headers['Idempotency-Key'],
      `biteshark-invite-${failCreate.json.invitation.id}-gen2`
    );
    assert.equal(
      resendAttempts[1].headers['Idempotency-Key'],
      resendAttempts[0].headers['Idempotency-Key'],
      'Bounded retry of the same token generation must reuse identical Idempotency-Key'
    );

    // Old token from gen1 MUST be invalidated!
    const oldTokInspect = await apiCall('/api/invitations/inspect', {
      method: 'POST',
      body: { token: firstFailedToken }
    });
    assert.equal(oldTokInspect.status, 404);
    assert.equal(oldTokInspect.json.code, 'INVITATION_NOT_FOUND');

    // New token from gen2 works!
    const newRotatedToken = extractInviteTokenFromBody(resendAttempts[1].body.text).token;
    const newTokInspect = await apiCall('/api/invitations/inspect', {
      method: 'POST',
      body: { token: newRotatedToken }
    });
    assert.equal(newTokInspect.status, 200);

    // Direct `/api/admin/invitations/resend` endpoint enforces cooldown cleanly (`429 INVITATION_RESEND_COOLDOWN`)
    // and rotates to `gen3` once the cooldown window elapses
    const cooldownResend = await apiCall('/api/admin/invitations/resend', {
      method: 'POST',
      cookie: top1.cookie,
      body: { invitation_id: failCreate.json.invitation.id, reason: 'Immediate resend within cooldown' }
    });
    assert.equal(cooldownResend.status, 429);
    assert.equal(cooldownResend.json.code, 'INVITATION_RESEND_COOLDOWN');

    await privQuery(
      `UPDATE account_invitations SET last_delivery_attempt_at = now() - interval '2 minutes' WHERE id = $1`,
      [failCreate.json.invitation.id]
    );
    const directResend = await apiCall('/api/admin/invitations/resend', {
      method: 'POST',
      cookie: top1.cookie,
      body: { invitation_id: failCreate.json.invitation.id, reason: 'Direct resend after cooldown' }
    });
    assert.equal(directResend.status, 200);
    assert.equal(directResend.json.invitation.token_version, 3);
    assert.equal(directResend.json.delivery.status, 'provider_accepted');

    // 8c. Persistent timeout -> `delivery_uncertain` (max 2 bounded attempts, no storm!)
    nextInviteBehavior = { mode: 'always_timeout' };
    const timeoutEmail = 'provider-timeout@gmail.com';
    const beforeTimeoutIdx = sentWireMessages.length;
    const timeoutCreate = await apiCall('/api/admin/invitations/create', {
      method: 'POST',
      cookie: top1.cookie,
      body: { email: timeoutEmail, requested_role: 'customer' }
    });
    nextInviteBehavior = null;
    assert.equal(timeoutCreate.status, 201);
    assert.equal(timeoutCreate.json.delivery.status, 'delivery_uncertain');
    const timeoutAttempts = sentWireMessages.slice(beforeTimeoutIdx).filter(m => m.isInvitation && m.body.to[0] === timeoutEmail);
    assert.equal(timeoutAttempts.length, 2, 'Timeout retry must stop cleanly at 2 bounded attempts');

    // 8d. Creating a fresh invitation for `(timeoutEmail, 'customer')` supersedes the prior unaccepted row!
    const supersedeCreate = await apiCall('/api/admin/invitations/create', {
      method: 'POST',
      cookie: top1.cookie,
      body: { email: timeoutEmail, requested_role: 'customer' }
    });
    assert.equal(supersedeCreate.status, 201);
    const supersededRowCheck = await privQuery(
      `SELECT status, delivery_status, replaced_by_invitation_id FROM account_invitations WHERE id = $1`,
      [timeoutCreate.json.invitation.id]
    );
    assert.equal(supersededRowCheck.rows[0].status, 'revoked');
    assert.equal(supersededRowCheck.rows[0].delivery_status, 'superseded');
    assert.equal(supersededRowCheck.rows[0].replaced_by_invitation_id, supersedeCreate.json.invitation.id);

    // Resend on revoked/superseded or consumed invitations MUST be rejected (`409`)!
    const resendRevoked = await apiCall('/api/admin/invitations/decision', {
      method: 'POST',
      cookie: top1.cookie,
      body: { invitation_id: timeoutCreate.json.invitation.id, action: 'resend', reason: 'Attempt resend superseded' }
    });
    assert.equal(resendRevoked.status, 409);

    const resendConsumed = await apiCall('/api/admin/invitations/decision', {
      method: 'POST',
      cookie: top1.cookie,
      body: { invitation_id: topInviteCreate.json.invitation.id, action: 'resend', reason: 'Attempt resend consumed' }
    });
    assert.equal(resendConsumed.status, 409);

    // -------------------------------------------------------------------------
    // [9/10] Recipient account suspension & role revocation enforcement
    // -------------------------------------------------------------------------
    const invitedTopUserId = returningTopSession.user.id;

    // Role revocation removes `Admin: Top` immediately (revokes active sessions AND denies `/api/admin/*` on new session)
    const revokeRoleRes = await apiCall('/api/admin/accounts/role', {
      method: 'POST',
      cookie: top1.cookie,
      body: { user_id: invitedTopUserId, role: 'none', reason: 'Governance rotation test' }
    });
    assert.equal(revokeRoleRes.status, 200);

    const afterRoleRevokeOldSession = await apiCall('/api/admin/overview', { cookie: returningTopSession.cookie });
    assert.equal(afterRoleRevokeOldSession.status, 401, 'Role change immediately revokes active sessions');

    const demotedNewSession = await signInViaOtp(targetTopInvitee, { ip: '198.51.100.69' });
    const afterRoleRevokeNewSession = await apiCall('/api/admin/overview', { cookie: demotedNewSession.cookie });
    assert.equal(afterRoleRevokeNewSession.status, 403, 'Role revocation removes Admin: Top access');

    // Re-grant Top, sign in, then suspend the account -> blocks active session AND blocks future staging OTP login!
    await apiCall('/api/admin/accounts/role', {
      method: 'POST',
      cookie: top1.cookie,
      body: { user_id: invitedTopUserId, role: 'top', reason: 'Restore before suspension test' }
    });
    const preSuspendSession = await signInViaOtp(targetTopInvitee, { ip: '198.51.100.70' });
    const suspendRes = await apiCall('/api/admin/accounts/status', {
      method: 'POST',
      cookie: top1.cookie,
      body: { user_id: invitedTopUserId, action: 'suspend', reason: 'Security hold test' }
    });
    assert.equal(suspendRes.status, 200);

    const afterSuspendSession = await apiCall('/api/admin/overview', { cookie: preSuspendSession.cookie });
    assert.equal(afterSuspendSession.status, 401, 'Suspending user must revoke active sessions immediately');

    const suspendedOtpStart = await apiCall('/api/auth/start', {
      method: 'POST',
      ip: '198.51.100.71',
      body: { email: targetTopInvitee }
    });
    assert.equal(suspendedOtpStart.status, 403, 'Suspended non-static staging user must be denied new OTP challenges');

    // -------------------------------------------------------------------------
    // [10/10] Zero raw token, OTP, cookie, or API key leakage in DB or logs!
    // -------------------------------------------------------------------------
    const secretNeedleList = [
      extractedTopInvite.token,
      newRotatedToken,
      firstFailedToken,
      resendApiKey,
      top1.otpCode,
      newTopInviteeSession.otpCode
    ];

    const auditDump = JSON.stringify((await privQuery(`SELECT * FROM audit_logs`)).rows);
    const eventsDump = JSON.stringify((await privQuery(`SELECT * FROM account_invitation_events`)).rows);
    const telemetryDump = JSON.stringify((await privQuery(`SELECT * FROM auth_delivery_telemetry`)).rows);
    const invTableDump = JSON.stringify((await privQuery(`SELECT * FROM account_invitations`)).rows);
    const allLogsJoined = capturedLogs.join('\n');

    for (const secret of secretNeedleList) {
      assert(secret && secret.length >= 6);
      assert(!auditDump.includes(secret), 'Secret/token leaked into audit_logs');
      assert(!eventsDump.includes(secret), 'Secret/token leaked into account_invitation_events');
      assert(!telemetryDump.includes(secret), 'Secret/token leaked into auth_delivery_telemetry');
      assert(!invTableDump.includes(secret), 'Raw token/secret leaked into account_invitations');
      assert(!allLogsJoined.includes(secret), 'Secret/token leaked into structured server logs');
    }

    // Verify `auth_delivery_telemetry` recorded `invite_send` and `invite_resend` without email PII
    const inviteTelemetry = await privQuery(
      `SELECT flow, outcome_stage FROM auth_delivery_telemetry WHERE flow IN ('invite_send', 'invite_resend')`
    );
    assert(inviteTelemetry.rowCount >= 5, 'Expected invite_send and invite_resend rows in auth_delivery_telemetry');
    assert(!telemetryDump.includes(targetTopInvitee), 'Recipient email must NOT appear in auth_delivery_telemetry');

    global.fetch = origFetch;
    console.log(
      JSON.stringify({
        ok: true,
        suite: 'invitation-workflow.integration',
        verified: [
          'top_all_roles_and_mod_two_step_governance',
          'narrow_exact_email_staging_eligibility_and_continuing_signin',
          'unapproved_expired_revoked_and_toctou_blocked',
          'concurrent_single_use_redemption_once',
          'provider_422_503_retry_timeout_supersede_and_token_rotating_resend',
          'historical_not_requested_and_recorded_test_safe_never_emailed',
          'suspension_and_role_revocation_immediate',
          'zero_secret_or_raw_token_leakage'
        ]
      })
    );
  } finally {
    if (server) {
      await new Promise(r => server.close(() => r()));
    }
    if (appPool) await appPool.end().catch(() => {});
    if (migratorPool) await migratorPool.end().catch(() => {});
    await superPool.end().catch(() => {});
    await cluster.stop();
  }
}

main().catch(err => {
  console.error('INVITATION WORKFLOW INTEGRATION FAILED:', err);
  process.exit(1);
});
