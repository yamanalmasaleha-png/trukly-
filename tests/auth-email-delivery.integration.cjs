// BiteShark Authentication Email Delivery, Provider Diagnostics, Domain Readiness & UI Contract Suite
//
// Deterministically verifies against real PostgreSQL (`NOSUPERUSER NOBYPASSRLS`) and `server/app.js`:
//   1. Existing Top account sign-in via `resend_https` (real wire-level fetch payload inspection:
//      BiteShark sender, plain-text content, expiry, unrequested-code warning, zero marketing/secrets).
//   2. Unknown-account non-enumerating `200` response (zero provider calls, zero challenges created).
//   3. Eligible 14+ signup via `resend_https` + single-use verification + zero stored raw DOB.
//   4. Pending-age-assessment recovery after Top-admin OTP login (`/admin` -> `302` -> 14+ check -> `/admin`).
//   5. Wrong, expired, replayed, and superseded codes + concurrent resend/verification safety.
//   6. Resend & verification rate limiting (`429` + `Retry-After` + `retry_after_seconds`).
//   7. Provider HTTP rejection (`403 domain_not_verified`) and timeout (`AbortError`) fail-closed (`503`),
//      invalidating unverified challenges immediately so no misleading auth state remains.
//   8. Staging email allowlist enforcement across BOTH `staging_mailbox` AND `ENV=staging` + `resend_https`.
//   9. Configuration alias conflicts (`BITESHARK_*` vs `TRUCKLY_*`) & sender address validation.
//  10. `Admin: Top` `/api/admin/email-readiness` (DNS SPF `-all` / multiple-SPF / DKIM / DMARC / return-path,
//      recent sanitized failures, last designated test), `Admin: Mod` `403`, zero secret/OTP/email leakage
//      in logs/DB/responses, 7-day telemetry cleanup, honest `/login.html` UI states, and clean logout.

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
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-email-pg-'));
  const dataDir = path.join(tmpBase, 'data');
  const pwFile = path.join(tmpBase, 'pw.txt');
  const logFile = path.join(tmpBase, 'postgres.log');
  const password = 'em_pw_' + crypto.randomBytes(6).toString('hex');
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

function runMigrationsCli(migratorUrl, appRole) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [path.join(ROOT, 'scripts', 'run-migrations.cjs'), '--app-role', appRole],
      {
        cwd: ROOT,
        env: { ...process.env, MIGRATION_DATABASE_URL: migratorUrl },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
      }
    );
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => (stdout += d.toString()));
    child.stderr.on('data', d => (stderr += d.toString()));
    child.on('error', reject);
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
}

function extractCookiePair(setCookieHeader, name) {
  const arr = Array.isArray(setCookieHeader) ? setCookieHeader : setCookieHeader ? [setCookieHeader] : [];
  for (const h of arr) {
    const first = String(h).split(';')[0].trim();
    if (first.startsWith(name + '=')) return first;
  }
  return null;
}

(async () => {
  const { Pool, Client } = requirePg();
  const pgCluster = await createPostgresCluster();
  const suffix = crypto.randomBytes(4).toString('hex');
  const dbName = `bs_email_test_${suffix}`;
  const migRole = `bs_em_mig_${suffix}`;
  const appRole = `bs_em_app_${suffix}`;
  const migPass = 'mig_' + crypto.randomBytes(8).toString('hex');
  const appPass = 'app_' + crypto.randomBytes(8).toString('hex');

  const adminClient = new Client({ connectionString: pgCluster.adminUrl });
  await adminClient.connect();
  await adminClient.query(`CREATE ROLE ${migRole} LOGIN PASSWORD '${migPass}' NOSUPERUSER NOCREATEDB NOCREATEROLE`);
  await adminClient.query(
    `CREATE ROLE ${appRole} LOGIN PASSWORD '${appPass}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`
  );
  await adminClient.query(`CREATE DATABASE ${dbName} OWNER ${migRole}`);
  await adminClient.end();

  const baseUrlObj = new URL(pgCluster.adminUrl);
  const migratorUrl = `postgres://${migRole}:${encodeURIComponent(migPass)}@${baseUrlObj.host}/${dbName}`;
  const appUrl = `postgres://${appRole}:${encodeURIComponent(appPass)}@${baseUrlObj.host}/${dbName}`;

  const migOwnerClient = new Client({ connectionString: migratorUrl });
  await migOwnerClient.connect();
  await migOwnerClient.query('GRANT CREATE, USAGE ON SCHEMA public TO ' + migRole);
  await migOwnerClient.end();

  let migratorPool = null;
  let appPool = null;
  let server = null;
  const origFetch = global.fetch;

  const savedEnv = { ...process.env };
  const authSecret = 'auth_secret_test_' + crypto.randomBytes(24).toString('hex');
  const mailboxSecret = 'mb_secret_test_' + crypto.randomBytes(20).toString('hex');
  const resendApiKey = 're_live_secret_key_' + crypto.randomBytes(16).toString('hex');
  const workerSecret = 'wk_secret_test_' + crypto.randomBytes(20).toString('hex');

  try {
    const migRes = await runMigrationsCli(migratorUrl, appRole);
    assert.equal(migRes.code, 0, `Migrations failed: ${migRes.stderr}`);
    assert(migRes.stdout.includes('"newly_applied":27'), 'Expected 27 migrations applied');

    migratorPool = new Pool({ connectionString: migratorUrl, max: 4 });
    appPool = new Pool({ connectionString: appUrl, max: 8 });

    const { createStandaloneServer } = await import(pathToFileURL(path.join(ROOT, 'server', 'app.js')).href);
    const standaloneAuth = await import(pathToFileURL(path.join(ROOT, 'lib', 'standalone-auth.js')).href);

    const capturedLogs = [];
    const logger = {
      info: line => capturedLogs.push(String(line)),
      warn: line => capturedLogs.push(String(line)),
      error: line => capturedLogs.push(String(line))
    };

    const port = await getFreePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    const topEmail = 'mattcallawaysemail@gmail.com';
    const modEmail = 'mod-operator@staging.truckly.invalid';
    const signupEmail = 'teen14-signup@staging.truckly.invalid';

    // Seed existing unassessed Top Admin (`mattcallawaysemail@gmail.com`) and Mod Admin
    const seedClient = await migratorPool.connect();
    try {
      await seedClient.query('BEGIN');
      await seedClient.query("SELECT set_config('app.auth_internal', 'true', true)");
      await seedClient.query(
        `INSERT INTO auth_users (id, email_normalized, age_eligibility_status, age_policy_version, age_assessed_at, age_assessment_basis)
         VALUES ('usr_sa_top_op', $1, 'not_assessed', NULL, NULL, NULL),
                ('usr_sa_mod_op', $2, 'eligible_14_plus', 'draft-14plus-v0.1', now(), 'self_reported_dob_at_signup')`,
        [topEmail, modEmail]
      );
      await seedClient.query(
        `INSERT INTO platform_roles (user_id, role, granted_by)
         VALUES ('usr_sa_top_op', 'top', 'usr_sa_top_op'),
                ('usr_sa_mod_op', 'mod', 'usr_sa_top_op')`
      );
      await seedClient.query('COMMIT');
    } finally {
      seedClient.release();
    }

    // Configure environment for isolated staging + `resend_https`
    for (const k of Object.keys(process.env)) {
      if (k.startsWith('BITESHARK_') || k.startsWith('TRUCKLY_')) delete process.env[k];
    }
    process.env.BITESHARK_ENV = 'staging';
    process.env.BITESHARK_AUTH_SECRET = authSecret;
    process.env.BITESHARK_STAGING_MAILBOX_SECRET = mailboxSecret;
    process.env.BITESHARK_NOTIFICATION_WORKER_SECRET = workerSecret;
    process.env.BITESHARK_PUSH_PROVIDER_MODE = 'disabled';
    process.env.BITESHARK_STAGING_ALLOWED_EMAILS = topEmail;
    process.env.BITESHARK_STAGING_ALLOWED_EMAIL_DOMAINS = 'staging.truckly.invalid';
    process.env.BITESHARK_AUTH_DELIVERY_MODE = 'resend_https';
    process.env.BITESHARK_AUTH_EMAIL_API_KEY = resendApiKey;
    process.env.BITESHARK_AUTH_EMAIL_FROM = 'login@biteshark.live';
    process.env.BITESHARK_AUTH_EMAIL_API_URL = 'https://api.resend.com/emails';
    process.env.BITESHARK_AUTH_START_EMAIL_MAX = '4';
    process.env.BITESHARK_AUTH_EMAIL_TIMEOUT_MS = '600';

    // Wire-level `fetch` interceptor ONLY for `https://api.resend.com/emails`; passes local HTTP through!
    const sentProviderRequests = [];
    let nextProviderBehavior = { mode: 'accept' };

    global.fetch = async function interceptedFetch(input, init) {
      const urlStr = typeof input === 'string' ? input : input?.url || String(input);
      if (urlStr === 'https://api.resend.com/emails') {
        const hdrs = init?.headers || {};
        const parsedBody = JSON.parse(String(init?.body || '{}'));
        sentProviderRequests.push({
          url: urlStr,
          method: init?.method,
          authHeader: hdrs.Authorization || hdrs.authorization,
          contentType: hdrs['Content-Type'] || hdrs['content-type'],
          body: parsedBody
        });

        if (nextProviderBehavior.mode === 'timeout') {
          await new Promise((_, reject) => {
            const onAbort = () => {
              const e = new Error('The operation was aborted');
              e.name = 'AbortError';
              reject(e);
            };
            if (init?.signal?.aborted) return onAbort();
            init?.signal?.addEventListener('abort', onAbort, { once: true });
          });
        }

        if (nextProviderBehavior.mode === 'reject') {
          return new Response(
            JSON.stringify({
              statusCode: nextProviderBehavior.status || 403,
              name: nextProviderBehavior.name || 'domain_not_verified',
              message: `The bitshark.live domain is not verified (secret=${resendApiKey} recipient=${parsedBody.to?.[0]})`
            }),
            { status: nextProviderBehavior.status || 403, headers: { 'Content-Type': 'application/json' } }
          );
        }

        const msgId = `re_mock_${crypto.randomBytes(6).toString('hex')}`;
        return new Response(JSON.stringify({ id: msgId }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return origFetch(input, init);
    };

    const appInst = createStandaloneServer({ dbAdapter: appPool, logger });
    server = appInst.server;
    await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));

    async function httpReq(relPath, { method = 'GET', body, cookie, headers = {} } = {}) {
      const reqHeaders = { ...headers };
      if (cookie) reqHeaders.Cookie = cookie;
      if (method !== 'GET' && method !== 'HEAD') {
        reqHeaders['Content-Type'] = reqHeaders['Content-Type'] || 'application/json';
        reqHeaders['X-BiteShark-Client'] = reqHeaders['X-BiteShark-Client'] || 'web-auth-v1';
        reqHeaders.Origin = reqHeaders.Origin || baseUrl;
      }
      const res = await origFetch(`${baseUrl}${relPath}`, {
        method,
        headers: reqHeaders,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        redirect: 'manual'
      });
      const text = await res.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {}
      const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
      return { status: res.status, headers: res.headers, setCookies, text, json };
    }

    function extractOtpFromText(txt) {
      const m = /\b(\d{6})\b/.exec(String(txt));
      return m ? m[1] : null;
    }

    // =========================================================================
    // [1/8] Existing Top Account Sign-In via `resend_https` + Message Quality + Pending Age Gate Recovery
    // =========================================================================
    const sessInit = await httpReq('/api/auth/session');
    assert.equal(sessInit.status, 200);
    assert.equal(sessInit.json.auth_delivery_mode, 'email');

    const startTop = await httpReq('/api/auth/start', {
      method: 'POST',
      body: { email: topEmail }
    });
    assert.equal(startTop.status, 200);
    assert.equal(startTop.json.delivery_mode, 'email');
    assert.match(String(startTop.headers.get('x-correlation-id')), /^corr_[0-9a-f]{16}$/);
    assert.equal(sentProviderRequests.length, 1);

    const sentMsg = sentProviderRequests[0];
    assert.equal(sentMsg.authHeader, `Bearer ${resendApiKey}`);
    assert.equal(sentMsg.body.from, 'BiteShark <login@biteshark.live>');
    assert.deepEqual(sentMsg.body.to, [topEmail]);
    assert.equal(sentMsg.body.subject, 'Your BiteShark verification code');
    assert(sentMsg.body.text.includes('expires in 10 minutes'), 'Must state 10-minute expiry');
    assert(sentMsg.body.text.includes('immediately invalidates earlier codes'), 'Must explain superseding codes');
    assert(sentMsg.body.text.includes('ignore this email'), 'Must include unrequested-code guidance');
    assert(!/unsubscribe|promo|discount|sponsor/i.test(sentMsg.body.text), 'Zero marketing content');
    assert(!sentMsg.body.text.includes('127.0.0.1') && !sentMsg.body.text.includes(authSecret), 'Zero internal URLs or secrets');

    const topCode = extractOtpFromText(sentMsg.body.text);
    assert(topCode && /^\d{6}$/.test(topCode));

    const verifyTop = await httpReq('/api/auth/verify', {
      method: 'POST',
      body: { email: topEmail, code: topCode }
    });
    assert.equal(verifyTop.status, 200);
    assert.equal(verifyTop.json.requires_age_assessment, true);
    const topCookie = extractCookiePair(verifyTop.setCookies, '__Host-truckly_session');
    assert(topCookie, 'Expected __Host-truckly_session cookie');

    // Replay of single-use code must fail immediately (401)
    const replayTop = await httpReq('/api/auth/verify', {
      method: 'POST',
      body: { email: topEmail, code: topCode }
    });
    assert.equal(replayTop.status, 401);

    // While `not_assessed`, `/admin` redirects to `/login.html?assess=1&next=%2Fadmin` and `/api/admin/email-readiness` returns 403
    assert.equal((await httpReq('/admin', { cookie: topCookie })).status, 302);
    assert.equal((await httpReq('/api/admin/email-readiness', { cookie: topCookie })).status, 403);

    // Complete 14+ age assessment -> unlocks `/admin` and `/api/admin/email-readiness`!
    const assessTop = await httpReq('/api/auth/age-assessment', {
      method: 'POST',
      cookie: topCookie,
      body: { dob_year: '1988', dob_month: '06', dob_day: '15' }
    });
    assert.equal(assessTop.status, 200);
    assert.equal((await httpReq('/admin', { cookie: topCookie })).status, 200);
    console.log('PASS [1/8]: Existing Top account resend_https sign-in, plain-text message quality, single-use OTP, and 14+ recovery verified');

    // =========================================================================
    // [2/8] Unknown-Account Public Non-Enumeration & Staging Allowlist Enforcement
    // =========================================================================
    const beforeUnknownCount = sentProviderRequests.length;
    const unknownAllowlisted = await httpReq('/api/auth/start', {
      method: 'POST',
      body: { email: 'never-created@staging.truckly.invalid' }
    });
    assert.equal(unknownAllowlisted.status, 200);
    assert.equal(unknownAllowlisted.json.delivery_mode, 'email');
    assert.equal(unknownAllowlisted.json.expires_in_seconds, 600);
    assert.equal(sentProviderRequests.length, beforeUnknownCount, 'Unknown signin must NOT invoke email provider');

    // Non-allowlisted external email MUST be blocked (403) in `ENV=staging` even when `resend_https` is active!
    const nonAllowlisted = await httpReq('/api/auth/start', {
      method: 'POST',
      body: { email: 'stranger@example.org', intent: 'signup', dob_year: '1995', dob_month: '04', dob_day: '12' }
    });
    assert.equal(nonAllowlisted.status, 403);
    assert.equal(nonAllowlisted.json.code, 'STAGING_ACCOUNT_NOT_ALLOWLISTED');
    assert.equal(sentProviderRequests.length, beforeUnknownCount, 'Non-allowlisted address must NOT invoke provider');
    console.log('PASS [2/8]: Unknown-account non-enumerating 200 response and staging email allowlist in resend_https mode verified');

    // =========================================================================
    // [3/8] Eligible 14+ Signup, Resend Superseding, Wrong/Expired Codes & Rate Limiting
    // =========================================================================
    const signupStart1 = await httpReq('/api/auth/start', {
      method: 'POST',
      body: { email: signupEmail, intent: 'signup', dob_year: '2010', dob_month: '03', dob_day: '10' }
    });
    assert.equal(signupStart1.status, 200);
    const firstCode = extractOtpFromText(sentProviderRequests[sentProviderRequests.length - 1].body.text);

    // Resend supersedes first code immediately
    const signupStart2 = await httpReq('/api/auth/start', {
      method: 'POST',
      body: { email: signupEmail, intent: 'signup', dob_year: '2010', dob_month: '03', dob_day: '10' }
    });
    assert.equal(signupStart2.status, 200);
    const secondCode = extractOtpFromText(sentProviderRequests[sentProviderRequests.length - 1].body.text);

    // Old superseded code must be rejected (401)
    assert.equal(
      (await httpReq('/api/auth/verify', { method: 'POST', body: { email: signupEmail, code: firstCode } })).status,
      401
    );
    // Wrong code must be rejected (401)
    const wrongDigit = secondCode === '000000' ? '111111' : '000000';
    assert.equal(
      (await httpReq('/api/auth/verify', { method: 'POST', body: { email: signupEmail, code: wrongDigit } })).status,
      401
    );
    // Latest code succeeds and creates `eligible_14_plus` account with zero raw DOB
    const signupVerify = await httpReq('/api/auth/verify', {
      method: 'POST',
      body: { email: signupEmail, code: secondCode }
    });
    assert.equal(signupVerify.status, 200);
    assert.equal(signupVerify.json.user.age_eligibility_status, 'eligible_14_plus');

    // Exhaust per-email start rate limit (`AUTH_START_EMAIL_MAX=4`, 2 already used -> 3rd & 4th ok, 5th -> 429)
    await httpReq('/api/auth/start', { method: 'POST', body: { email: signupEmail } });
    await httpReq('/api/auth/start', { method: 'POST', body: { email: signupEmail } });
    const rlHit = await httpReq('/api/auth/start', { method: 'POST', body: { email: signupEmail } });
    assert.equal(rlHit.status, 429);
    assert.equal(rlHit.json.code, 'AUTH_RATE_LIMITED');
    assert(Number(rlHit.headers.get('retry-after')) > 0, 'Must emit Retry-After header');
    assert(Number(rlHit.json.retry_after_seconds) > 0, 'Must include retry_after_seconds in JSON');
    console.log('PASS [3/8]: 14+ signup, resend code superseding, wrong-code rejection, and 429 Retry-After rate limiting verified');

    // =========================================================================
    // [4/8] Concurrent Resend + Verification Serialization Safety
    // =========================================================================
    const concEmail = 'concurrent-op@staging.truckly.invalid';
    await httpReq('/api/auth/start', {
      method: 'POST',
      body: { email: concEmail, intent: 'signup', dob_year: '1999', dob_month: '09', dob_day: '09' }
    });
    const concCode = extractOtpFromText(sentProviderRequests[sentProviderRequests.length - 1].body.text);
    const concVerifyResults = await Promise.all(
      Array.from({ length: 6 }, () =>
        httpReq('/api/auth/verify', { method: 'POST', body: { email: concEmail, code: concCode } })
      )
    );
    const okCount = concVerifyResults.filter(r => r.status === 200).length;
    const failCount = concVerifyResults.filter(r => r.status === 401).length;
    assert.equal(okCount, 1, 'Exactly one concurrent verification may consume single-use code');
    assert.equal(failCount, 5, 'Remaining concurrent verifications must return 401');
    console.log('PASS [4/8]: 6-way concurrent single-use OTP consumption serialized cleanly');

    // =========================================================================
    // [5/8] Provider HTTP Rejection & Timeout Fail-Closed Without Dangling Challenges
    // =========================================================================
    const failTestEmail = 'provider-fail@staging.truckly.invalid';
    nextProviderBehavior = { mode: 'reject', status: 403, name: 'domain_not_verified' };
    const rejRes = await httpReq('/api/auth/start', {
      method: 'POST',
      body: { email: failTestEmail, intent: 'signup', dob_year: '1994', dob_month: '02', dob_day: '14' }
    });
    assert.equal(rejRes.status, 503);
    assert.equal(rejRes.json.code, 'AUTH_EMAIL_SEND_FAILED');
    assert.match(String(rejRes.json.correlation_id), /^corr_[0-9a-f]{16}$/);

    nextProviderBehavior = { mode: 'timeout' };
    const toRes = await httpReq('/api/auth/start', {
      method: 'POST',
      body: { email: failTestEmail, intent: 'signup', dob_year: '1994', dob_month: '02', dob_day: '14' }
    });
    assert.equal(toRes.status, 503);
    assert.equal(toRes.json.code, 'AUTH_EMAIL_PROVIDER_TIMEOUT');
    nextProviderBehavior = { mode: 'accept' };

    // Confirm both failed challenges were invalidated immediately in PostgreSQL
    const mc = await migratorPool.connect();
    try {
      await mc.query('BEGIN');
      await mc.query("SELECT set_config('app.auth_internal', 'true', true)");
      const activeDangling = await mc.query(
        `SELECT count(*)::int AS cnt
         FROM auth_otp_challenges
         WHERE email_normalized = $1 AND consumed_at IS NULL AND invalidated_at IS NULL`,
        [failTestEmail]
      );
      await mc.query('COMMIT');
      assert.equal(activeDangling.rows[0].cnt, 0, 'Failed provider deliveries must leave zero active challenges');
    } finally {
      mc.release();
    }
    console.log('PASS [5/8]: Provider HTTP 403 rejection and AbortError timeout fail closed (503) and invalidate challenges');

    // =========================================================================
    // [6/8] Config Alias Conflicts, Invalid Sender Validation & Honest `staging_mailbox` Mode
    // =========================================================================
    process.env.TRUCKLY_AUTH_DELIVERY_MODE = 'staging_mailbox'; // Conflicts with BITESHARK_AUTH_DELIVERY_MODE=resend_https!
    const conflictStart = await httpReq('/api/auth/start', {
      method: 'POST',
      body: { email: modEmail }
    });
    assert.equal(conflictStart.status, 503);
    assert.equal(conflictStart.json.code, 'AUTH_DELIVERY_UNAVAILABLE');
    assert.equal((await httpReq('/api/auth/session')).json.auth_delivery_mode, 'unavailable');
    delete process.env.TRUCKLY_AUTH_DELIVERY_MODE;

    // Invalid sender format fails closed
    process.env.BITESHARK_AUTH_EMAIL_FROM = 'not-an-email-address';
    assert.equal(standaloneAuth.inspectAuthDeliveryConfig().valid, false);
    process.env.BITESHARK_AUTH_EMAIL_FROM = 'BiteShark Staging <login@biteshark.live>';
    assert.equal(standaloneAuth.inspectAuthDeliveryConfig().valid, true);

    // Switch to `staging_mailbox` and verify `/api/auth/session` + `/api/auth/start` report `staging_mailbox`
    process.env.BITESHARK_AUTH_DELIVERY_MODE = 'staging_mailbox';
    assert.equal((await httpReq('/api/auth/session')).json.auth_delivery_mode, 'staging_mailbox');
    const modStartMb = await httpReq('/api/auth/start', { method: 'POST', body: { email: modEmail } });
    assert.equal(modStartMb.status, 200);
    assert.equal(modStartMb.json.delivery_mode, 'staging_mailbox');

    // Verify `/login.html` contains honest staging-mode & resend controls and zero misleading static "Check your inbox"
    const loginHtmlRes = await httpReq('/login.html');
    assert.equal(loginHtmlRes.status, 200);
    assert(!loginHtmlRes.text.includes('<h1>Check your inbox</h1>'), 'Static misleading Check your inbox heading removed');
    assert(loginHtmlRes.text.includes('Protected staging testing mode'), 'Includes staging_mailbox disclosure');
    assert(loginHtmlRes.text.includes('id="resendBtn"'), 'Includes Request a new code control');
    console.log('PASS [6/8]: Alias conflict 503 guard, sender validation, and honest staging_mailbox UI/API contract verified');

    // =========================================================================
    // [7/8] `Admin: Top` `/api/admin/email-readiness` RBAC, DNS Checks & Zero Secret/OTP Leakage
    // =========================================================================
    // Sign in Mod via loopback staging mailbox to verify Mod receives 403 on `/api/admin/email-readiness`
    const mbRead = await httpReq('/api/auth/staging-mailbox', {
      method: 'POST',
      headers: { 'X-Staging-Mailbox-Secret': mailboxSecret },
      body: { email: modEmail }
    });
    assert.equal(mbRead.status, 200);
    const modVerify = await httpReq('/api/auth/verify', {
      method: 'POST',
      body: { email: modEmail, code: mbRead.json.code }
    });
    assert.equal(modVerify.status, 200);
    const modCookie = extractCookiePair(modVerify.setCookies, '__Host-truckly_session');
    const modEmailReadiness = await httpReq('/api/admin/email-readiness', { cookie: modCookie });
    assert.equal(modEmailReadiness.status, 403);
    assert.equal(modEmailReadiness.json.code, 'TOP_ADMIN_REQUIRED');

    // Mock DNS resolver: first simulate current live `biteshark.live` (`v=spf1 -all`, strict DMARC, missing DKIM/send)
    standaloneAuth.setCustomDnsResolverForTests({
      async resolveTxt(host) {
        if (host === 'biteshark.live') return [['v=spf1 -all']];
        if (host === '_dmarc.biteshark.live') return [['v=DMARC1; p=reject; sp=reject; adkim=s; aspf=s']];
        return [];
      },
      async resolveMx() {
        return [];
      }
    });

    const topReadiness1 = await httpReq('/api/admin/email-readiness', { cookie: topCookie });
    assert.equal(topReadiness1.status, 200);
    assert.equal(topReadiness1.json.effective_mode, 'staging_mailbox');
    assert.equal(topReadiness1.json.real_email_enabled, false);
    assert.equal(topReadiness1.json.sender_domain_dns.domain, 'biteshark.live');
    assert.equal(topReadiness1.json.sender_domain_dns.spf.status, 'blocks_all_mail');
    assert.equal(topReadiness1.json.sender_domain_dns.dmarc.policy, 'reject');
    assert.equal(topReadiness1.json.sender_domain_dns.resend_dkim.status, 'missing');
    assert.equal(topReadiness1.json.sender_domain_dns.ready_for_authenticated_sending, false);
    assert(topReadiness1.json.recent_failures.length >= 2, 'Should report sanitized recent provider failures');
    assert(topReadiness1.json.last_successful_designated_test?.provider_message_id?.startsWith('re_mock_'));

    // Also verify multiple-SPF detection AND ready-domain detection
    standaloneAuth.setCustomDnsResolverForTests({
      async resolveTxt(host) {
        if (host === 'biteshark.live') return [['v=spf1 -all'], ['v=spf1 include:amazonses.com ~all']];
        return [];
      },
      async resolveMx() {
        return [];
      }
    });
    const dupSpfDns = await standaloneAuth.inspectSenderDomainDns('biteshark.live');
    assert.equal(dupSpfDns.spf.status, 'invalid_multiple_spf');

    standaloneAuth.setCustomDnsResolverForTests({
      async resolveTxt(host) {
        if (host === 'biteshark.live') return [['v=spf1 -all']];
        if (host === '_dmarc.biteshark.live') return [['v=DMARC1; p=reject; sp=reject; adkim=s; aspf=s']];
        if (host === 'resend._domainkey.biteshark.live') return [['p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC1234567890']];
        if (host === 'send.biteshark.live') return [['v=spf1 include:amazonses.com ~all']];
        return [];
      },
      async resolveMx(host) {
        if (host === 'send.biteshark.live') return [{ exchange: 'feedback-smtp.us-east-1.amazonses.com', priority: 10 }];
        return [];
      }
    });
    const readyDns = await standaloneAuth.inspectSenderDomainDns('biteshark.live');
    assert.equal(readyDns.ready_for_authenticated_sending, true);
    standaloneAuth.setCustomDnsResolverForTests(null);

    // Assert ZERO leakage of secrets, OTPs, DOBs, or emails in readiness JSON, structured logs, or telemetry table!
    const serializedEvidence = JSON.stringify({
      readiness: topReadiness1.json,
      logs: capturedLogs
    });
    for (const forbidden of [
      authSecret,
      mailboxSecret,
      resendApiKey,
      topCode,
      secondCode,
      topEmail,
      modEmail,
      signupEmail,
      failTestEmail,
      '1988-06-15',
      '2010-03-10'
    ]) {
      assert(!serializedEvidence.includes(forbidden), `Diagnostic output leaked forbidden value: ${forbidden}`);
    }
    console.log('PASS [7/8]: Top-only /api/admin/email-readiness, DNS SPF/DKIM/DMARC checks, and zero secret/OTP/email leakage verified');

    // =========================================================================
    // [8/8] 7-Day Telemetry Cleanup & Logout Session Revocation
    // =========================================================================
    const mcTel = await migratorPool.connect();
    try {
      await mcTel.query('BEGIN');
      await mcTel.query("SELECT set_config('app.auth_internal', 'true', true)");
      await mcTel.query(
        `INSERT INTO auth_delivery_telemetry
           (correlation_id, flow, delivery_mode, outcome_stage, http_status, created_at)
         VALUES ('corr_0000000000000001', 'start', 'staging_mailbox', 'staging_mailbox_stored', 200, now() - interval '8 days')`
      );
      await mcTel.query('COMMIT');
    } finally {
      mcTel.release();
    }

    const cleanupRes = await standaloneAuth.cleanupExpiredAuthRecords(appPool);
    assert(cleanupRes.deleted_auth_telemetry >= 1, 'Expected >7d auth_delivery_telemetry row purged');

    const logoutRes = await httpReq('/api/auth/logout', { method: 'POST', cookie: topCookie });
    assert.equal(logoutRes.status, 200);
    assert.equal((await httpReq('/api/admin/overview', { cookie: topCookie })).status, 401);
    console.log('PASS [8/8]: 7-day auth_delivery_telemetry cleanup and logout session revocation verified');
    console.log('ALL AUTHENTICATION EMAIL DELIVERY & DIAGNOSTICS INTEGRATION TESTS PASSED.');
  } finally {
    global.fetch = origFetch;
    for (const k of Object.keys(process.env)) {
      if (!(k in savedEnv)) delete process.env[k];
    }
    Object.assign(process.env, savedEnv);

    if (server) {
      await new Promise(resolve => server.close(() => resolve()));
    }
    if (appPool) await appPool.end().catch(() => {});
    if (migratorPool) await migratorPool.end().catch(() => {});

    try {
      const dropClient = new Client({ connectionString: pgCluster.adminUrl });
      await dropClient.connect();
      await dropClient.query(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
        [dbName]
      );
      await dropClient.query(`DROP DATABASE IF EXISTS ${dbName}`);
      await dropClient.query(`DROP ROLE IF EXISTS ${appRole}`);
      await dropClient.query(`DROP ROLE IF EXISTS ${migRole}`);
      await dropClient.end();
    } catch {}
    await pgCluster.stop();
  }
})().catch(err => {
  console.error('FAIL auth-email-delivery.integration.cjs:', err);
  process.exit(1);
});
