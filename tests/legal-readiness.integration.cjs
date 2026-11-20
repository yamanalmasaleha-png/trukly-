#!/usr/bin/env node
// BiteShark Legal-Policy Framework, 14+ Age Eligibility & Business/Compliance Readiness Integration Suite
//
// Runs against a real disposable PostgreSQL instance (with separate migrator + NOSUPERUSER NOBYPASSRLS
// runtime role) and `createStandaloneServer`.

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
    throw new Error('Missing `pg` package. Set TRUCKLY_PG_NODE_MODULES or run `npm ci`.');
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
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'biteshark-legal-pg-'));
  const dataDir = path.join(tmpBase, 'data');
  const pwFile = path.join(tmpBase, 'pw.txt');
  const logFile = path.join(tmpBase, 'postgres.log');
  const password = 'lr_pw_' + crypto.randomBytes(6).toString('hex');
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

function runChild(args, env) {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, args, {
      cwd: ROOT,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => (stdout += d.toString()));
    proc.stderr.on('data', d => (stderr += d.toString()));
    proc.on('error', reject);
    proc.on('close', code => resolve({ code, stdout, stderr }));
  });
}

function extractCookiePair(res, cookieName) {
  const setCookie =
    typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : [res.headers.get('set-cookie') || ''];
  const joined = setCookie.join('; ');
  const re = new RegExp(`(${cookieName}=[^;\\s]+)`);
  const m = re.exec(joined);
  return { rawHeader: joined, pair: m ? m[1] : '' };
}

(async () => {
  const { Pool } = requirePg();
  const suffix = crypto.randomBytes(4).toString('hex');
  const dbName = `biteshark_legal_${suffix}`;
  const migratorRole = `bs_leg_mig_${suffix}`;
  const appRole = `bs_leg_app_${suffix}`;
  const migPass = 'mig_' + crypto.randomBytes(8).toString('hex');
  const appPass = 'app_' + crypto.randomBytes(8).toString('hex');

  let pgCluster = null;
  let adminPool = null;
  let migratorPool = null;
  let appPool = null;
  let standalone = null;

  try {
    // =========================================================================
    // [1/8] Exact 14+ Age Cutoff, Pacific Timezone Boundary, Leap-Day, Invalid & Future Dates
    // =========================================================================
    const agePolicy = await import(pathToFileURL(path.join(ROOT, 'lib', 'age-policy.js')).href);
    assert.equal(agePolicy.PROPOSED_MIN_ACCOUNT_AGE, 14, 'Proposed minimum account age must be 14 (NOT 13)');

    // Reference: 2026-11-19 at 20:00 UTC -> 2026-11-19 in America/Los_Angeles
    const refNov19 = new Date('2026-11-19T20:00:00Z');
    const exact14 = agePolicy.evaluateMinimumAgeEligibility({ dob: '2012-11-19' }, refNov19);
    assert.equal(exact14.eligible, true);
    assert.equal(exact14.status, 200);
    assert.equal(exact14.eligibilityMetadata.age_eligibility_status, 'eligible_14_plus');

    // One day before 14th birthday -> age 13 -> denied (403)
    const oneDayShort = agePolicy.evaluateMinimumAgeEligibility({ dob: '2012-11-20' }, refNov19);
    assert.equal(oneDayShort.eligible, false);
    assert.equal(oneDayShort.status, 403);
    assert.equal(oneDayShort.code, 'AGE_INELIGIBLE');
    // Must not invite or coach user to try a different birth date
    assert(!/try again|different date|re-enter|another date/i.test(oneDayShort.error));

    // Clear 13-year-old -> denied (403); clear 14-year-old -> allowed (200)
    assert.equal(agePolicy.evaluateMinimumAgeEligibility({ dob: '2013-05-10' }, refNov19).status, 403);
    assert.equal(agePolicy.evaluateMinimumAgeEligibility({ dob: '2011-12-31' }, refNov19).status, 200);

    // Timezone boundary: 2026-11-20T03:30:00Z is already Nov 20 in UTC, but still Nov 19 (19:30 PST) in America/Los_Angeles!
    const utcMidnightButStillNov19Pacific = new Date('2026-11-20T03:30:00Z');
    assert.equal(
      agePolicy.evaluateMinimumAgeEligibility({ dob: '2012-11-20' }, utcMidnightButStillNov19Pacific).status,
      403,
      'Must evaluate birthday against America/Los_Angeles civil date, not UTC'
    );
    // At 2026-11-20T08:05:00Z (00:05 PST Nov 20 in America/Los_Angeles) -> now 14!
    const afterMidnightPacific = new Date('2026-11-20T08:05:00Z');
    assert.equal(
      agePolicy.evaluateMinimumAgeEligibility({ dob: '2012-11-20' }, afterMidnightPacific).status,
      200
    );

    // Leap-day (`2012-02-29` is a leap year):
    //   On 2026-02-28 (non-leap year) -> still 13 -> denied (403)
    //   On 2026-03-01 (non-leap year) -> reaches 14th birthday -> allowed (200)
    assert.equal(
      agePolicy.evaluateMinimumAgeEligibility({ dob: '2012-02-29' }, new Date('2026-02-28T20:00:00Z')).status,
      403,
      'Feb 29 birth must still be 13 on Feb 28 of non-leap year 2026'
    );
    assert.equal(
      agePolicy.evaluateMinimumAgeEligibility({ dob: '2012-02-29' }, new Date('2026-03-01T20:00:00Z')).status,
      200,
      'Feb 29 birth must reach age 14 on Mar 1 of non-leap year 2026'
    );
    // Leap-year evaluation (`2010` non-leap year Feb 29 is invalid; `2008-02-29` on `2024-02-29` is 16 -> 200)
    assert.equal(
      agePolicy.evaluateMinimumAgeEligibility({ dob_year: '2010', dob_month: '02', dob_day: '29' }, refNov19).status,
      400,
      '2010-02-29 must be rejected as an impossible calendar date'
    );
    assert.equal(
      agePolicy.evaluateMinimumAgeEligibility({ dob: '2008-02-29' }, new Date('2024-02-29T20:00:00Z')).status,
      200
    );

    // Impossible Gregorian dates & future dates -> 400
    for (const bad of [
      { dob: '2008-04-31' },
      { dob: '2008-13-10' },
      { dob: '2008-00-10' },
      { dob: '1850-05-05' },
      { dob: '2026-11-20' }, // 1 day in future relative to refNov19
      { dob: '2030-01-01' }
    ]) {
      const r = agePolicy.evaluateMinimumAgeEligibility(bad, refNov19);
      assert.equal(r.status, 400, `Expected 400 for invalid/future input ${JSON.stringify(bad)}, got ${r.status}`);
    }
    assert.equal(agePolicy.evaluateMinimumAgeEligibility({}, refNov19).code, 'DOB_REQUIRED');
    console.log('PASS [1/8]: Exact 14+ cutoff (13 denied, 14 allowed), Pacific boundary, leap-day, invalid-date, and future-date checks verified');

    // =========================================================================
    // Provision disposable PostgreSQL database + roles & run all 19 migrations
    // =========================================================================
    pgCluster = await createPostgresCluster();
    adminPool = new Pool({ connectionString: pgCluster.adminUrl, max: 2 });
    await adminPool.query(`CREATE ROLE ${migratorRole} LOGIN PASSWORD '${migPass}'`);
    await adminPool.query(`CREATE ROLE ${appRole} LOGIN PASSWORD '${appPass}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`);
    await adminPool.query(`CREATE DATABASE ${dbName} OWNER ${migratorRole}`);

    const parsedAdmin = new URL(pgCluster.adminUrl);
    const baseDbOrigin = `${parsedAdmin.protocol}//${parsedAdmin.hostname}:${parsedAdmin.port || 5432}`;
    const migratorUrl = `${baseDbOrigin}/${dbName}?user=${encodeURIComponent(migratorRole)}&password=${encodeURIComponent(migPass)}`;
    const appUrl = `${baseDbOrigin}/${dbName}?user=${encodeURIComponent(appRole)}&password=${encodeURIComponent(appPass)}`;

    const migRes = await runChild(
      [path.join(ROOT, 'scripts', 'run-migrations.cjs'), '--app-role', appRole],
      { ...process.env, MIGRATION_DATABASE_URL: migratorUrl }
    );
    assert.equal(migRes.code, 0, `Migrations failed: ${migRes.stderr}`);
    assert(migRes.stdout.includes('"newly_applied":23'), `Expected 23 migrations, got: ${migRes.stdout}`);

    migratorPool = new Pool({ connectionString: migratorUrl, max: 4 });
    appPool = new Pool({ connectionString: appUrl, max: 8 });

    const port = await getFreePort();
    const baseOrigin = `http://127.0.0.1:${port}`;
    const mailboxSecret = 'mbx_' + crypto.randomBytes(24).toString('hex');
    const workerSecret = 'wrk_' + crypto.randomBytes(24).toString('hex');
    const authSecret = crypto.randomBytes(32).toString('hex');
    const allowedDomain = 'legal.biteshark.invalid';

    process.env.BITESHARK_ENV = 'staging';
    delete process.env.BITESHARK_PUBLIC_ORIGIN;
    delete process.env.TRUCKLY_PUBLIC_ORIGIN;
    process.env.BITESHARK_AUTH_START_IP_MAX = '160';
    process.env.BITESHARK_AUTH_VERIFY_IP_MAX = '160';
    process.env.BITESHARK_AUTH_AGE_GATE_IP_MAX = '20';
    process.env.BITESHARK_AUTH_SECRET = authSecret;
    process.env.BITESHARK_NOTIFICATION_WORKER_SECRET = workerSecret;
    process.env.BITESHARK_AUTH_DELIVERY_MODE = 'staging_mailbox';
    process.env.BITESHARK_STAGING_MAILBOX_SECRET = mailboxSecret;
    process.env.BITESHARK_STAGING_ALLOWED_EMAIL_DOMAINS = allowedDomain;
    process.env.BITESHARK_STAGING_ALLOWED_EMAILS = 'top.counsel@gmail.test';
    process.env.BITESHARK_PUSH_PROVIDER_MODE = 'disabled';

    let capturedServerLogs = '';
    const customLogger = {
      log: (...a) => { capturedServerLogs += a.join(' ') + '\n'; },
      info: (...a) => { capturedServerLogs += a.join(' ') + '\n'; },
      warn: (...a) => { capturedServerLogs += a.join(' ') + '\n'; },
      error: (...a) => { capturedServerLogs += a.join(' ') + '\n'; }
    };

    const { createStandaloneServer } = await import(pathToFileURL(path.join(ROOT, 'server', 'app.js')).href);
    standalone = createStandaloneServer({
      dbAdapter: appPool,
      releaseSha: 'legalreadiness0000000000000000000000000019',
      logger: customLogger
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
      const ct = String(res.headers.get('content-type') || '');
      const json = ct.includes('application/json') ? await res.json().catch(() => null) : null;
      const text = json ? '' : await res.text();
      return { status: res.status, headers: res.headers, json, text, rawRes: res };
    }

    async function signUp14Plus(email, dobStr = '1995-08-24') {
      const s = await httpReq('/api/auth/start', {
        method: 'POST',
        headers: { 'X-BiteShark-Client': 'web-auth-v1' },
        body: { email, intent: 'signup', dob: dobStr }
      });
      assert.equal(s.status, 200, `Expected 200 on 14+ signup start for ${email}: ${JSON.stringify(s.json)}`);
      const mbx = await httpReq('/api/auth/staging-mailbox', {
        method: 'POST',
        headers: { 'X-Staging-Mailbox-Secret': mailboxSecret },
        body: { email }
      });
      assert.equal(mbx.status, 200);
      const v = await httpReq('/api/auth/verify', {
        method: 'POST',
        headers: { 'X-BiteShark-Client': 'web-auth-v1' },
        body: { email, code: mbx.json.code }
      });
      assert.equal(v.status, 200);
      const sessCookie = extractCookiePair(v.rawRes, '__Host-truckly_session').pair;
      assert(sessCookie.startsWith('__Host-truckly_session='));
      return { user: v.json.user, cookie: sessCookie, verifyJson: v.json };
    }

    // =========================================================================
    // [2/8] Under-14 Rejection Side-Effects & Zero Raw DOB Storage / Leakage
    // =========================================================================
    const under14Email = `kid13@${allowedDomain}`;
    const under14Dob = '2014-07-19';
    const rejRes = await httpReq('/api/auth/start', {
      method: 'POST',
      headers: { 'X-BiteShark-Client': 'web-auth-v1' },
      body: { email: under14Email, intent: 'signup', dob: under14Dob }
    });
    assert.equal(rejRes.status, 403);
    assert.equal(rejRes.json.code, 'AGE_INELIGIBLE');
    assert(!JSON.stringify(rejRes.json).includes(under14Dob), 'Rejected response must never echo DOB');

    const ageGateCookie = extractCookiePair(rejRes.rawRes, '__Host-bs_age_gate');
    assert.equal(ageGateCookie.pair, '__Host-bs_age_gate=1');
    assert(/HttpOnly/i.test(ageGateCookie.rawHeader));
    assert(/Secure/i.test(ageGateCookie.rawHeader));
    assert(!ageGateCookie.rawHeader.includes('2014'), 'Cooldown cookie must never contain birth year/date');

    // Presenting cooldown cookie immediately blocks retrying with a different fake adult birth date!
    const retryDifferentDob = await httpReq('/api/auth/start', {
      method: 'POST',
      cookie: ageGateCookie.pair,
      headers: { 'X-BiteShark-Client': 'web-auth-v1' },
      body: { email: under14Email, intent: 'signup', dob: '1985-03-10' }
    });
    assert.equal(retryDifferentDob.status, 403);
    assert.equal(retryDifferentDob.json.code, 'AGE_INELIGIBLE');

    // Verify ZERO user row, ZERO OTP challenge, ZERO staging mailbox row, ZERO notification/marketing row created!
    await migratorPool.query('BEGIN');
    await migratorPool.query("SELECT set_config('app.auth_internal', 'true', true), set_config('app.pager_internal', 'true', true)");
    const uCount = await migratorPool.query('SELECT count(*)::int AS c FROM auth_users WHERE email_normalized = $1', [under14Email]);
    const cCount = await migratorPool.query('SELECT count(*)::int AS c FROM auth_otp_challenges WHERE email_normalized = $1', [under14Email]);
    const mCount = await migratorPool.query('SELECT count(*)::int AS c FROM auth_staging_mailbox WHERE email_normalized = $1', [under14Email]);
    const emailHashHex = crypto.createHash('sha256').update(`email:${under14Email}`).digest('hex').slice(0, 32);
    const emailBucketKey = 'arl:' + crypto.createHash('sha256').update(`auth_start_email|${emailHashHex}`).digest('hex').slice(0, 32);
    const rlEmailCount = await migratorPool.query('SELECT count(*)::int AS c FROM auth_rate_limits WHERE bucket_key = $1', [emailBucketKey]);
    const outboxCount = await migratorPool.query('SELECT count(*)::int AS c FROM pager_notification_deliveries');
    await migratorPool.query('COMMIT');

    assert.equal(uCount.rows[0].c, 0, 'Rejected under-14 signup must create 0 auth_users rows');
    assert.equal(cCount.rows[0].c, 0, 'Rejected under-14 signup must create 0 auth_otp_challenges rows');
    assert.equal(mCount.rows[0].c, 0, 'Rejected under-14 signup must create 0 auth_staging_mailbox rows');
    assert.equal(rlEmailCount.rows[0].c, 0, 'Rejected under-14 signup must not retain email hash in auth_rate_limits');
    assert.equal(outboxCount.rows[0].c, 0, 'Rejected under-14 signup must create 0 notification/marketing records');

    // Now test eligible 14-year-old signup (`teen14@...`) and verify derived-only metadata + zero DOB anywhere
    const teen14Dob = '2011-09-14';
    const teen14 = await signUp14Plus(`teen14@${allowedDomain}`, teen14Dob);
    assert.equal(teen14.verifyJson.requires_age_assessment, false);
    assert.equal(teen14.user.age_eligibility_status, 'eligible_14_plus');

    await migratorPool.query('BEGIN');
    await migratorPool.query("SELECT set_config('app.auth_internal', 'true', true)");
    const storedTeen = (
      await migratorPool.query('SELECT * FROM auth_users WHERE id = $1', [teen14.user.id])
    ).rows[0];
    await migratorPool.query('COMMIT');

    assert.equal(storedTeen.age_eligibility_status, 'eligible_14_plus');
    assert.equal(storedTeen.age_policy_version, 'draft-14plus-v0.1');
    assert.equal(storedTeen.age_assessment_basis, 'self_reported_dob_at_signup');
    assert(storedTeen.age_assessed_at, 'Expected age_assessed_at timestamp');
    assert(!JSON.stringify(storedTeen).includes(teen14Dob), 'auth_users row must never contain raw DOB');
    assert(!JSON.stringify(storedTeen).includes('2011-09'), 'auth_users row must never contain birth year-month');

    const acctCtxTeen = await httpReq('/api/account/context', { cookie: teen14.cookie });
    assert.equal(acctCtxTeen.status, 200);
    assert(!JSON.stringify(acctCtxTeen.json).includes(teen14Dob), '/api/account/context must never expose DOB');
    assert(!capturedServerLogs.includes(teen14Dob) && !capturedServerLogs.includes(under14Dob), 'Server logs must never contain DOB');
    console.log('PASS [2/8]: Under-14 signup creates zero account/OTP/email/marketing records, sets cooldown cookie, and retains zero raw DOB');

    // =========================================================================
    // [3/8] Direct API Bypass & Invitation Bypass Prevention
    // =========================================================================
    const bypassEmail = `direct-api-bypass@${allowedDomain}`;
    // Direct API call to `/api/auth/start` omitting `intent: 'signup'` and `dob` on a brand-new email:
    // Must return uniform non-enumerating 200 BUT issue ZERO OTP challenges and ZERO mailbox entries!
    const bypassStart = await httpReq('/api/auth/start', {
      method: 'POST',
      headers: { 'X-BiteShark-Client': 'web-auth-v1' },
      body: { email: bypassEmail }
    });
    assert.equal(bypassStart.status, 200);
    const bypassMbx = await httpReq('/api/auth/staging-mailbox', {
      method: 'POST',
      headers: { 'X-Staging-Mailbox-Secret': mailboxSecret },
      body: { email: bypassEmail }
    });
    assert.equal(bypassMbx.status, 404, 'Unassessed brand-new email without DOB must NOT receive a signup OTP');

    // Defense-in-depth check: even if an unassessed OTP row existed in DB (`signup_age_eligible = false`),
    // `verify` refuses to create a brand-new account (`403 AGE_ASSESSMENT_REQUIRED`)!
    const syntheticChId = crypto.randomUUID();
    const syntheticCode = '654321';
    const syntheticHmac = crypto
      .createHmac('sha256', Buffer.from(authSecret, 'utf8'))
      .update(`truckly-otp-v1|${bypassEmail}|${syntheticChId}|${syntheticCode}`, 'utf8')
      .digest('hex');
    await migratorPool.query('BEGIN');
    await migratorPool.query("SELECT set_config('app.auth_internal', 'true', true)");
    await migratorPool.query(
      `INSERT INTO auth_otp_challenges
         (id, email_normalized, code_hmac, attempts, max_attempts, requester_ip_hash, expires_at, signup_age_eligible)
       VALUES ($1, $2, $3, 0, 5, 'test_ip', now() + interval '5 minutes', false)`,
      [syntheticChId, bypassEmail, syntheticHmac]
    );
    await migratorPool.query('COMMIT');

    const bypassVerify = await httpReq('/api/auth/verify', {
      method: 'POST',
      headers: { 'X-BiteShark-Client': 'web-auth-v1' },
      body: { email: bypassEmail, code: syntheticCode }
    });
    assert.equal(bypassVerify.status, 403);
    assert.equal(bypassVerify.json.code, 'AGE_ASSESSMENT_REQUIRED');

    // Bootstrap Top Admin (`top.counsel@gmail.test`) and test Invitation Bypass Prevention on an unassessed account!
    const bootTop = await runChild(
      [path.join(ROOT, 'scripts', 'bootstrap-top-admin.cjs'), '--email', 'top.counsel@gmail.test'],
      { ...process.env, MIGRATION_DATABASE_URL: migratorUrl }
    );
    assert.equal(bootTop.code, 0);
    const topAdmin = await signUp14Plus('top.counsel@gmail.test', '1984-02-18');

    // Seed a pre-existing `'not_assessed'` account (`legacy-unassessed@...`) directly in `auth_users`
    const unassessedEmail = `legacy-unassessed@${allowedDomain}`;
    const unassessedId = 'usr_sa_' + crypto.randomBytes(16).toString('hex');
    await migratorPool.query('BEGIN');
    await migratorPool.query("SELECT set_config('app.auth_internal', 'true', true)");
    await migratorPool.query(
      `INSERT INTO auth_users (id, email_normalized, created_at, updated_at)
       VALUES ($1, $2, now() - interval '30 days', now() - interval '30 days')`,
      [unassessedId, unassessedEmail]
    );
    await migratorPool.query('COMMIT');

    // Issue a Vendor Staff invitation to `unassessedEmail` as Top Admin
    const invCreate = await httpReq('/api/admin/invitations/create', {
      method: 'POST',
      cookie: topAdmin.cookie,
      body: {
        email: unassessedEmail,
        requested_role: 'vendor_staff',
        vendor_id: 'iniguez',
        note: 'Test invitation age gate'
      }
    });
    assert.equal(invCreate.status, 201);
    const inviteToken = decodeURIComponent(invCreate.json.accept_path.split('#accept-invite=')[1]);

    // Returning sign-in WITHOUT DOB for existing `'not_assessed'` user succeeds, returning `requires_age_assessment: true`
    const unassessedStart = await httpReq('/api/auth/start', {
      method: 'POST',
      headers: { 'X-BiteShark-Client': 'web-auth-v1' },
      body: { email: unassessedEmail }
    });
    assert.equal(unassessedStart.status, 200);
    const unassessedMbx = await httpReq('/api/auth/staging-mailbox', {
      method: 'POST',
      headers: { 'X-Staging-Mailbox-Secret': mailboxSecret },
      body: { email: unassessedEmail }
    });
    assert.equal(unassessedMbx.status, 200);
    const unassessedVer = await httpReq('/api/auth/verify', {
      method: 'POST',
      headers: { 'X-BiteShark-Client': 'web-auth-v1' },
      body: { email: unassessedEmail, code: unassessedMbx.json.code }
    });
    assert.equal(unassessedVer.status, 200);
    assert.equal(unassessedVer.json.requires_age_assessment, true);
    assert.equal(unassessedVer.json.user.age_eligibility_status, 'not_assessed');
    const unassessedCookie = extractCookiePair(unassessedVer.rawRes, '__Host-truckly_session').pair;

    // Attempting to redeem the invitation BEFORE completing 14+ age assessment MUST return 403!
    const prematureAccept = await httpReq('/api/invitations/accept', {
      method: 'POST',
      cookie: unassessedCookie,
      body: { token: inviteToken }
    });
    assert.equal(prematureAccept.status, 403);
    assert.equal(prematureAccept.json.code, 'AGE_ASSESSMENT_REQUIRED');
    console.log('PASS [3/8]: Direct API signup bypass and unassessed invitation redemption bypass both blocked (403)');

    // =========================================================================
    // [4/8] Existing-Account Next-Sign-In Assessment (14+ Upgrade vs <14 Disable & Revoke)
    // =========================================================================
    const assessOk = await httpReq('/api/auth/age-assessment', {
      method: 'POST',
      cookie: unassessedCookie,
      headers: { 'X-BiteShark-Client': 'web-auth-v1' },
      body: { dob_year: '1993', dob_month: '11', dob_day: '05' }
    });
    assert.equal(assessOk.status, 200);
    assert.equal(assessOk.json.age_eligibility_status, 'eligible_14_plus');
    assert.equal(assessOk.json.requires_age_assessment, false);

    // Invitation redemption now succeeds!
    const validAccept = await httpReq('/api/invitations/accept', {
      method: 'POST',
      cookie: unassessedCookie,
      body: { token: inviteToken }
    });
    assert.equal(validAccept.status, 200);

    // Seed a second pre-existing `'not_assessed'` account that reports age 12 on next-sign-in check
    const legacyUnder14Email = `legacy-under14@${allowedDomain}`;
    const legacyUnder14Id = 'usr_sa_' + crypto.randomBytes(16).toString('hex');
    await migratorPool.query('BEGIN');
    await migratorPool.query("SELECT set_config('app.auth_internal', 'true', true)");
    await migratorPool.query(
      `INSERT INTO auth_users (id, email_normalized, created_at, updated_at)
       VALUES ($1, $2, now() - interval '20 days', now() - interval '20 days')`,
      [legacyUnder14Id, legacyUnder14Email]
    );
    await migratorPool.query('COMMIT');

    await httpReq('/api/auth/start', {
      method: 'POST',
      headers: { 'X-BiteShark-Client': 'web-auth-v1' },
      body: { email: legacyUnder14Email }
    });
    const luMbx = await httpReq('/api/auth/staging-mailbox', {
      method: 'POST',
      headers: { 'X-Staging-Mailbox-Secret': mailboxSecret },
      body: { email: legacyUnder14Email }
    });
    const luVer = await httpReq('/api/auth/verify', {
      method: 'POST',
      headers: { 'X-BiteShark-Client': 'web-auth-v1' },
      body: { email: legacyUnder14Email, code: luMbx.json.code }
    });
    const luCookie = extractCookiePair(luVer.rawRes, '__Host-truckly_session').pair;

    const assessUnder14 = await httpReq('/api/auth/age-assessment', {
      method: 'POST',
      cookie: luCookie,
      headers: { 'X-BiteShark-Client': 'web-auth-v1' },
      body: { dob: '2015-04-22' }
    });
    assert.equal(assessUnder14.status, 403);
    assert.equal(assessUnder14.json.code, 'AGE_INELIGIBLE');

    // Session must be immediately revoked (`401` on authenticated endpoints) and zero DOB stored in audit_logs!
    const afterRevokeFavs = await httpReq('/api/favorites/list', { cookie: luCookie });
    assert.equal(afterRevokeFavs.status, 401, 'Under-14 assessed account session must be immediately revoked');

    const auditCheck = await migratorPool.query(
      "SELECT metadata FROM audit_logs WHERE target_id = $1 AND action = 'account.age_assessment_ineligible'",
      [legacyUnder14Id]
    );
    assert.equal(auditCheck.rows.length, 1);
    assert(!JSON.stringify(auditCheck.rows[0]).includes('2015'), 'Audit log must never store raw DOB');
    console.log('PASS [4/8]: Existing-account not_assessed state, 14+ next-sign-in upgrade, and <14 session revocation verified');

    // =========================================================================
    // [5/8] Top vs Mod Readiness Permissions & Confidential Counsel Redaction
    // =========================================================================
    const modUser = await signUp14Plus(`mod.reviewer@${allowedDomain}`, '1991-03-14');
    const grantMod = await httpReq('/api/admin/accounts/role', {
      method: 'POST',
      cookie: topAdmin.cookie,
      body: {
        user_id: modUser.user.id,
        role: 'mod',
        reason: 'Grant Mod for readiness permission matrix test'
      }
    });
    assert.equal(grantMod.status, 200);
    // Re-authenticate Mod after role-change session revocation
    const modAuthed = await signUp14Plus(`mod.reviewer@${allowedDomain}`, '1991-03-14');

    // Ordinary customer denied `/api/admin/readiness` (`403`)
    assert.equal((await httpReq('/api/admin/readiness', { cookie: teen14.cookie })).status, 403);

    // Top Admin Overview & Readiness check
    const topOverview = await httpReq('/api/admin/overview', { cookie: topAdmin.cookie });
    assert.equal(topOverview.status, 200);
    assert.equal(topOverview.json.counts.unresolved_launch_critical, 22);
    assert.equal(topOverview.json.launch_readiness.launch_readiness_incomplete, true);
    assert.equal(
      topOverview.json.launch_readiness.reminder_banner,
      'Legal review and launch readiness remain incomplete. Draft policies are not approved for public rollout.'
    );
    assert(topOverview.json.launch_readiness.deployment_portal_notice.includes('not technically blocked'));

    const topReadiness = await httpReq('/api/admin/readiness', { cookie: topAdmin.cookie });
    assert.equal(topReadiness.status, 200);
    assert.equal(topReadiness.json.items.length, 23, 'Expected all 23 required readiness items seeded');

    // Top Admin adds confidential counsel notes to `minimum_signup_age_14` without Mod access
    const setCounselSecret = await httpReq('/api/admin/readiness/update', {
      method: 'POST',
      cookie: topAdmin.cookie,
      body: {
        item_key: 'minimum_signup_age_14',
        confidential_counsel_notes: 'PRIVILEGED DRAFT MEMO: Evaluate CA AADC impact before expanding outside Sonoma.',
        mod_counsel_access_granted: false
      }
    });
    assert.equal(setCounselSecret.status, 200);

    // Mod Admin reads `/api/admin/readiness`:
    //   - Sees only `mod_visible = true` items (excludes `legal_operator_identity`, `entity_structure`, `final_legal_launch_gate`)
    //   - Sees `confidential_counsel_notes: null` + `confidential_counsel_redacted: true` on `minimum_signup_age_14`
    const modReadiness = await httpReq('/api/admin/readiness', { cookie: modAuthed.cookie });
    assert.equal(modReadiness.status, 200);
    assert(modReadiness.json.items.length < 23 && modReadiness.json.items.length >= 15);
    assert(!modReadiness.json.items.some(i => i.item_key === 'final_legal_launch_gate'));
    assert(!modReadiness.json.items.some(i => i.item_key === 'entity_structure'));
    const modAgeItem = modReadiness.json.items.find(i => i.item_key === 'minimum_signup_age_14');
    assert(modAgeItem, 'Mod should see minimum_signup_age_14 operational item');
    assert.equal(modAgeItem.confidential_counsel_notes, null, 'Confidential counsel notes must be redacted for Mod by default');
    assert.equal(modAgeItem.confidential_counsel_redacted, true);

    // Mod CAN add operational notes/evidence on `mod_visible` item
    const modNoteOk = await httpReq('/api/admin/readiness/note', {
      method: 'POST',
      cookie: modAuthed.cookie,
      body: {
        item_key: 'minimum_signup_age_14',
        note: 'Verified signup form rejects age 13 and accepts age 14 on staging.',
        supporting_evidence: 'tests/legal-readiness.integration.cjs'
      }
    });
    assert.equal(modNoteOk.status, 200);
    assert(modNoteOk.json.item.operational_notes.includes('Verified signup form rejects age 13'));

    // Mod CANNOT call `/api/admin/readiness/update` (declare legal approval, change policy, or complete final launch gate)
    const modTryApprove = await httpReq('/api/admin/readiness/update', {
      method: 'POST',
      cookie: modAuthed.cookie,
      body: {
        item_key: 'minimum_signup_age_14',
        status: 'legally_approved',
        approved_doc_version: 'draft-14plus-v0.1',
        approved_jurisdiction_scope: 'California',
        legal_reviewer_name: 'Fake Mod Approval',
        legal_reviewed_at: '2026-11-19'
      }
    });
    assert.equal(modTryApprove.status, 403);
    assert.equal(modTryApprove.json.code, 'TOP_ADMIN_REQUIRED');

    // Mod CANNOT sneak `status` into `/api/admin/readiness/note` or add notes to `final_legal_launch_gate`
    const modSneakStatus = await httpReq('/api/admin/readiness/note', {
      method: 'POST',
      cookie: modAuthed.cookie,
      body: { item_key: 'minimum_signup_age_14', note: 'Sneak status', status: 'legally_approved' }
    });
    assert.equal(modSneakStatus.status, 403);
    const modTouchLaunchGate = await httpReq('/api/admin/readiness/note', {
      method: 'POST',
      cookie: modAuthed.cookie,
      body: { item_key: 'final_legal_launch_gate', note: 'Attempt note on launch gate' }
    });
    assert.equal(modTouchLaunchGate.status, 403);

    // When Top explicitly grants `mod_counsel_access_granted: true`, Mod CAN read counsel notes on that item
    await httpReq('/api/admin/readiness/update', {
      method: 'POST',
      cookie: topAdmin.cookie,
      body: { item_key: 'minimum_signup_age_14', mod_counsel_access_granted: true }
    });
    const modReadinessAfterGrant = await httpReq('/api/admin/readiness?item_key=minimum_signup_age_14', {
      cookie: modAuthed.cookie
    });
    assert(modReadinessAfterGrant.json.items[0].confidential_counsel_notes.includes('PRIVILEGED DRAFT MEMO'));
    console.log('PASS [5/8]: Top vs Mod readiness RBAC, Mod note workflow, and confidential counsel access gating verified');

    // =========================================================================
    // [6/8] Stage Separation, Structured Legal Approval Validation & Append-Only History
    // =========================================================================
    // Selecting `'proposed'` + `decision_recorded: true` must NOT auto-mark implemented, tested, or legally approved
    const stageSep = await httpReq('/api/admin/readiness/update', {
      method: 'POST',
      cookie: topAdmin.cookie,
      body: {
        item_key: 'launch_jurisdictions',
        status: 'proposed',
        decision_recorded: true
      }
    });
    assert.equal(stageSep.status, 200);
    assert.equal(stageSep.json.item.decision_recorded, true);
    assert.equal(stageSep.json.item.implemented_recorded, false);
    assert.equal(stageSep.json.item.tested_recorded, false);
    assert.equal(stageSep.json.item.stages.legally_reviewed, false);

    // `not_applicable` without explanation -> 400; with explanation -> 200
    const naMissing = await httpReq('/api/admin/readiness/update', {
      method: 'POST',
      cookie: topAdmin.cookie,
      body: { item_key: 'payment_subscription_prereqs', status: 'not_applicable' }
    });
    assert.equal(naMissing.status, 400);
    assert.equal(naMissing.json.code, 'NA_EXPLANATION_REQUIRED');

    const naValid = await httpReq('/api/admin/readiness/update', {
      method: 'POST',
      cookie: topAdmin.cookie,
      body: {
        item_key: 'payment_subscription_prereqs',
        status: 'not_applicable',
        not_applicable_explanation: 'Zero paid features, subscriptions, or checkout flows are enabled in initial rollout.'
      }
    });
    assert.equal(naValid.status, 200);

    // Generic checkbox / incomplete legal approval MUST fail (`400 LEGAL_APPROVAL_EVIDENCE_REQUIRED`)
    const incompleteApproval = await httpReq('/api/admin/readiness/update', {
      method: 'POST',
      cookie: topAdmin.cookie,
      body: {
        item_key: 'cookie_analytics_ad_inventory',
        status: 'legally_approved',
        approved_doc_version: 'cookies-storage-v0.1'
        // missing jurisdiction/scope, reviewer, date!
      }
    });
    assert.equal(incompleteApproval.status, 400);
    assert.equal(incompleteApproval.json.code, 'LEGAL_APPROVAL_EVIDENCE_REQUIRED');

    // Future `legal_reviewed_at` date rejected (`400`)
    const futureApproval = await httpReq('/api/admin/readiness/update', {
      method: 'POST',
      cookie: topAdmin.cookie,
      body: {
        item_key: 'cookie_analytics_ad_inventory',
        status: 'legally_approved',
        approved_doc_version: 'cookies-storage-v1.0',
        approved_jurisdiction_scope: 'California, USA',
        legal_reviewer_name: 'Elena Vance, Esq. (Privacy Counsel)',
        legal_reviewed_at: '2099-01-01'
      }
    });
    assert.equal(futureApproval.status, 400);

    // Complete 4-part structured legal approval succeeds!
    const validApproval = await httpReq('/api/admin/readiness/update', {
      method: 'POST',
      cookie: topAdmin.cookie,
      body: {
        item_key: 'cookie_analytics_ad_inventory',
        status: 'legally_approved',
        policy_version: 'cookies-storage-v1.0',
        approved_doc_version: 'cookies-storage-v1.0',
        approved_jurisdiction_scope: 'California, USA (Sonoma County initial directory launch)',
        legal_reviewer_name: 'Elena Vance, Esq. (Outside Privacy Counsel)',
        legal_reviewed_at: '2026-11-19'
      }
    });
    assert.equal(validApproval.status, 200);
    assert.equal(validApproval.json.item.status, 'legally_approved');

    // Verify `compliance_readiness_history` is strictly append-only for runtime DB role (`UPDATE` & `DELETE` denied!)
    let historyUpdateBlocked = false;
    try {
      await appPool.query("UPDATE compliance_readiness_history SET summary = 'tampered'");
    } catch {
      historyUpdateBlocked = true;
    }
    let historyDeleteBlocked = false;
    try {
      await appPool.query('DELETE FROM compliance_readiness_history');
    } catch {
      historyDeleteBlocked = true;
    }
    assert.equal(historyUpdateBlocked, true, 'Runtime app role must not be able to UPDATE compliance_readiness_history');
    assert.equal(historyDeleteBlocked, true, 'Runtime app role must not be able to DELETE compliance_readiness_history');
    console.log('PASS [6/8]: Discrete stage flags, N/A explanation, 4-field legal approval evidence, and append-only history verified');

    // =========================================================================
    // [7/8] Material Policy Change -> Automatic `needs_re_review` + Final Gate Dependency Block
    // =========================================================================
    const materialChange = await httpReq('/api/admin/readiness/update', {
      method: 'POST',
      cookie: topAdmin.cookie,
      body: {
        item_key: 'cookie_analytics_ad_inventory',
        policy_version: 'cookies-storage-v1.1-draft',
        current_practice: 'Proposed adding first-party performance timing counter — requires fresh counsel review.'
      }
    });
    assert.equal(materialChange.status, 200);
    assert.equal(materialChange.json.auto_needs_re_review, true);
    assert.equal(materialChange.json.item.status, 'needs_re_review');
    // Prior approval record & append-only history must be preserved!
    assert.equal(materialChange.json.item.approved_doc_version, 'cookies-storage-v1.0');
    assert(
      materialChange.json.item.history.some(
        h =>
          h.change_kind === 'auto_needs_re_review' &&
          h.from_status === 'legally_approved' &&
          h.to_status === 'needs_re_review'
      ),
      'Expected auto_needs_re_review entry in compliance_readiness_history'
    );

    // Attempting to mark `final_legal_launch_gate` complete while critical items are unresolved -> 409!
    const prematureLaunchGate = await httpReq('/api/admin/readiness/update', {
      method: 'POST',
      cookie: topAdmin.cookie,
      body: {
        item_key: 'final_legal_launch_gate',
        status: 'legally_approved',
        approved_doc_version: 'launch-v1.0',
        approved_jurisdiction_scope: 'California, USA',
        legal_reviewer_name: 'Elena Vance, Esq.',
        legal_reviewed_at: '2026-11-19'
      }
    });
    assert.equal(prematureLaunchGate.status, 409);
    assert.equal(prematureLaunchGate.json.code, 'UNRESOLVED_LAUNCH_DEPENDENCIES');
    console.log('PASS [7/8]: Material policy edit auto-transitions Legally approved -> Needs re-review with history preserved; final launch gate blocked while dependencies unresolved');

    // =========================================================================
    // [8/8] All 7 Draft Policy Pages (`noindex`, Unresolved Details Visible, Zero Ad/Analytics Trackers)
    // =========================================================================
    const policyUrls = [
      '/policies',
      '/policies/terms.html',
      '/policies/privacy.html',
      '/policies/vendor-terms.html',
      '/policies/community-moderation.html',
      '/policies/advertising-sponsored.html',
      '/policies/accessibility.html',
      '/policies/cookies-storage.html'
    ];

    for (const pUrl of policyUrls) {
      const res = await httpReq(pUrl);
      assert.equal(res.status, 200, `Expected 200 on ${pUrl}`);
      const xRobots = String(res.headers.get('x-robots-tag') || '');
      assert(xRobots.includes('noindex'), `${pUrl} must emit X-Robots-Tag: noindex`);
      assert(res.text.includes('content="noindex,nofollow,noarchive"'), `${pUrl} must include meta robots noindex`);
      assert(
        res.text.includes('[LEGAL OPERATOR NAME], doing business as BiteShark'),
        `${pUrl} must preserve literal [LEGAL OPERATOR NAME], doing business as BiteShark placeholder`
      );
      assert(res.text.includes('Version 0.1-draft'), `${pUrl} must display version`);
      assert(res.text.includes('November 19, 2026'), `${pUrl} must display last-updated date`);
      assert(/Legal review pending/i.test(res.text), `${pUrl} must state Legal review pending`);
      assert(res.text.includes('[UNRESOLVED — CONFIRMATION REQUIRED]'), `${pUrl} must highlight unresolved questions`);
      assert(
        !/googletagmanager|google-analytics|gtag\(|fbq\(|doubleclick|adsense|hotjar|segment\.com/i.test(res.text),
        `${pUrl} must contain zero analytics or ad-tech scripts`
      );
    }

    // Verify Accessibility Statement explicitly avoids claiming "ADA compliant"
    const a11yPage = await httpReq('/policies/accessibility.html');
    assert(
      a11yPage.text.includes('does not claim formal WCAG certification or “ADA compliance”'),
      'Accessibility Statement must explicitly disclaim automated-only ADA compliance claims'
    );

    // Verify main app & login pages also contain zero advertising/analytics trackers
    for (const appPage of ['/', '/login.html']) {
      const r = await httpReq(appPage);
      assert.equal(r.status, 200);
      assert(!/googletagmanager|google-analytics|gtag\(|fbq\(|doubleclick|adsense|hotjar/i.test(r.text));
    }

    console.log('PASS [8/10]: All 7 preliminary policy pages + hub verified (noindex, [LEGAL OPERATOR NAME] placeholder, unresolved items explicit, zero ad/analytics trackers)');

    // =========================================================================
    // [9/10] Central Server-Side Pending-Age-Assessment Gate Across Unassessed
    //        Customer, Vendor, Mod & Top Sessions + Narrow Allowlist + Preserved History
    // =========================================================================
    async function seedPreExistingUnassessedSession(emailLocal, { platformRole = null, vendorRole = null, vendorId = 'iniguez' } = {}) {
      const email = `${emailLocal}@${allowedDomain}`;
      const uid = 'usr_sa_' + crypto.randomBytes(16).toString('hex');
      await migratorPool.query('BEGIN');
      await migratorPool.query("SELECT set_config('app.auth_internal', 'true', true), set_config('app.admin_portal', 'true', true), set_config('app.is_platform_admin', 'true', true)");
      await migratorPool.query(
        `INSERT INTO auth_users (id, email_normalized, created_at, updated_at)
         VALUES ($1, $2, now() - interval '60 days', now() - interval '60 days')`,
        [uid, email]
      );
      if (platformRole) {
        await migratorPool.query(
          `INSERT INTO platform_roles (user_id, role, granted_by, notes)
           VALUES ($1, $2, 'seed', 'Pre-019 existing admin test')`,
          [uid, platformRole]
        );
      }
      if (vendorRole) {
        await migratorPool.query(
          `INSERT INTO vendor_memberships (vendor_id, user_id, role, granted_by)
           VALUES ($1, $2, $3, 'seed')`,
          [vendorId, uid, vendorRole]
        );
      }
      await migratorPool.query('COMMIT');

      // Establish real session via OTP sign-in WITHOUT DOB (never opening browser prompt)
      const st = await httpReq('/api/auth/start', {
        method: 'POST',
        headers: { 'X-BiteShark-Client': 'web-auth-v1' },
        body: { email }
      });
      assert.equal(st.status, 200);
      const mb = await httpReq('/api/auth/staging-mailbox', {
        method: 'POST',
        headers: { 'X-Staging-Mailbox-Secret': mailboxSecret },
        body: { email }
      });
      assert.equal(mb.status, 200);
      const vr = await httpReq('/api/auth/verify', {
        method: 'POST',
        headers: { 'X-BiteShark-Client': 'web-auth-v1' },
        body: { email, code: mb.json.code }
      });
      assert.equal(vr.status, 200);
      assert.equal(vr.json.requires_age_assessment, true);
      const ck = extractCookiePair(vr.rawRes, '__Host-truckly_session').pair;
      return { id: uid, email, cookie: ck };
    }

    const unassessedCust = await seedPreExistingUnassessedSession('pre-cust');
    const unassessedVendor = await seedPreExistingUnassessedSession('pre-vendor', {
      vendorRole: 'owner',
      vendorId: 'iniguez'
    });
    const unassessedMod = await seedPreExistingUnassessedSession('pre-mod', { platformRole: 'mod' });
    const unassessedTop = await seedPreExistingUnassessedSession('pre-top', { platformRole: 'top' });

    // Seed historical records on `unassessedCust` (booking, favorite, operational support issue)
    let histIssueId;
    const mcSeedHist = await migratorPool.connect();
    try {
      await mcSeedHist.query('BEGIN');
      await mcSeedHist.query("SELECT set_config('app.user_id', $1, true), set_config('app.can_moderate', 'true', true), set_config('app.admin_portal', 'true', true)", [unassessedCust.id]);
      await mcSeedHist.query("INSERT INTO favorites (user_id, truck_id) VALUES ($1, 'mitote')", [unassessedCust.id]);
      await mcSeedHist.query(
        `INSERT INTO bookings
           (truck_id, truck_name, event_type, event_date, location, guest_count, requester, requester_user_id, requester_email, package_id, package_name, package_price, status)
         VALUES
           ('iniguez', 'Tacos Iñiguez', 'Birthday', CURRENT_DATE + 20, 'Santa Rosa', 30, 'Pre Cust', $1, $2, 'dropin', 'Neighborhood Drop-in', 750, 'pending')`,
        [unassessedCust.id, unassessedCust.email]
      );
      const histIssRes = await mcSeedHist.query(
        `INSERT INTO support_issues
           (reporter_user_id, reporter_email, reporter_context, category, severity, vendor_id, subject, description, sla_due_at)
         VALUES
           ($1, $2, 'customer', 'booking_dispute', 'normal', 'iniguez', 'Historical booking question', 'Pre-existing operational dispute record before migration 019.', now() + interval '2 days')
         RETURNING id`,
        [unassessedCust.id, unassessedCust.email]
      );
      histIssueId = histIssRes.rows[0].id;
      await mcSeedHist.query('COMMIT');
    } finally {
      mcSeedHist.release();
    }

    // Verify ALL direct protected requests fail closed (`403 AGE_ASSESSMENT_REQUIRED`) across Customer, Vendor, Mod & Top!
    const protectedChecks = [
      // Customer routes
      [unassessedCust.cookie, 'GET', '/api/favorites/list', undefined],
      [unassessedCust.cookie, 'POST', '/api/favorites/toggle', { truck_id: 'mitote' }],
      [unassessedCust.cookie, 'GET', '/api/bookings/list', undefined],
      [unassessedCust.cookie, 'POST', '/api/bookings/create', { truck_id: 'iniguez', event_date: '2026-12-10', location: 'Santa Rosa', guest_count: 25, package_id: 'dropin' }],
      [unassessedCust.cookie, 'GET', '/api/community/mine', undefined],
      [unassessedCust.cookie, 'POST', '/api/community/post', { place_id: 'iniguez', nickname: 'Tester', body: 'Great tacos here!', rating: 5 }],
      [unassessedCust.cookie, 'POST', '/api/community/report', { post_id: crypto.randomUUID(), reason_category: 'spam' }],
      [unassessedCust.cookie, 'GET', '/api/notifications/settings', undefined],
      [unassessedCust.cookie, 'POST', '/api/notifications/settings', { nearby_enabled: true, radius_miles: 5 }],
      [unassessedCust.cookie, 'GET', '/api/onboarding/applications', undefined],
      [unassessedCust.cookie, 'POST', '/api/onboarding/applications', { action: 'save_draft', business_name: 'Bypass Spot' }],
      [unassessedCust.cookie, 'POST', '/api/invitations/accept', { token: 'x'.repeat(32) }],

      // Vendor Owner/Staff routes
      [unassessedVendor.cookie, 'GET', '/api/owner/profile?truck_id=iniguez', undefined],
      [unassessedVendor.cookie, 'POST', '/api/owner/profile', { truck_id: 'iniguez', display_name: 'Bypass Edit', cuisine: 'Mexican' }],
      [unassessedVendor.cookie, 'POST', '/api/owner/location', { truck_id: 'iniguez', location: 'Santa Rosa', is_open: true }],
      [unassessedVendor.cookie, 'GET', '/api/owner/schedule?truck_id=iniguez', undefined],
      [unassessedVendor.cookie, 'POST', '/api/owner/schedule', { truck_id: 'iniguez', service_date: '2026-12-01', opens_at: '11:00', closes_at: '18:00', location: 'Santa Rosa', status: 'scheduled' }],
      [unassessedVendor.cookie, 'GET', '/api/owner/bookings?truck_id=iniguez', undefined],
      [unassessedVendor.cookie, 'GET', '/api/owner/requests?truck_id=iniguez', undefined],
      [unassessedVendor.cookie, 'GET', '/api/owner/stats?truck_id=iniguez', undefined],
      [unassessedVendor.cookie, 'GET', '/api/vendor/members?vendor_id=iniguez', undefined],
      [unassessedVendor.cookie, 'POST', '/api/vendor/staff-invitations', { vendor_id: 'iniguez', email: `staff@${allowedDomain}` }],
      [unassessedVendor.cookie, 'GET', '/api/pager/staff?vendor_id=iniguez', undefined],
      [unassessedVendor.cookie, 'POST', '/api/pager/staff', { vendor_id: 'iniguez', ticket: 'T-99' }],
      [unassessedVendor.cookie, 'POST', '/api/pager/update', { pager_id: crypto.randomUUID(), status: 'ready' }],

      // Admin: Mod routes
      [unassessedMod.cookie, 'GET', '/api/admin/overview', undefined],
      [unassessedMod.cookie, 'GET', '/api/admin/applications', undefined],
      [unassessedMod.cookie, 'GET', '/api/admin/moderation', undefined],
      [unassessedMod.cookie, 'POST', '/api/community/moderate', { id: crypto.randomUUID(), status: 'approved' }],
      [unassessedMod.cookie, 'GET', '/api/admin/issues', undefined],
      [unassessedMod.cookie, 'GET', '/api/admin/readiness', undefined],
      [unassessedMod.cookie, 'POST', '/api/admin/readiness/note', { item_key: 'minimum_signup_age_14', note: 'Bypass note' }],

      // Admin: Top routes
      [unassessedTop.cookie, 'GET', '/api/admin/overview', undefined],
      [unassessedTop.cookie, 'GET', '/api/admin/vendors', undefined],
      [unassessedTop.cookie, 'POST', '/api/admin/vendors/update', { vendor_id: 'iniguez', reason: 'Bypass update' }],
      [unassessedTop.cookie, 'GET', '/api/admin/accounts', undefined],
      [unassessedTop.cookie, 'POST', '/api/admin/invitations/create', { email: `inv@${allowedDomain}`, requested_role: 'mod' }],
      [unassessedTop.cookie, 'POST', '/api/admin/readiness/update', { item_key: 'launch_jurisdictions', status: 'proposed' }],
      [unassessedTop.cookie, 'GET', '/api/admin/audit', undefined],
      [unassessedTop.cookie, 'GET', '/api/pager/telemetry', undefined]
    ];

    for (const [ck, m, p, b] of protectedChecks) {
      const r = await httpReq(p, { method: m, cookie: ck, body: b });
      assert.equal(r.status, 403, `Expected 403 on ${m} ${p} for unassessed session, got ${r.status}`);
      assert.equal(r.json?.code, 'AGE_ASSESSMENT_REQUIRED', `Expected AGE_ASSESSMENT_REQUIRED on ${m} ${p}`);
    }

    // Act-on-Behalf header by unassessed Top Admin MUST also be blocked (`403 AGE_ASSESSMENT_REQUIRED`)!
    const unassessedAob = await httpReq('/api/owner/location', {
      method: 'POST',
      cookie: unassessedTop.cookie,
      headers: {
        'X-BiteShark-Act-On-Behalf': 'iniguez',
        'X-BiteShark-Support-Reason': 'Testing unassessed Act-on-Behalf block'
      },
      body: { truck_id: 'iniguez', location: 'Santa Rosa', is_open: true }
    });
    assert.equal(unassessedAob.status, 403);
    assert.equal(unassessedAob.json?.code, 'AGE_ASSESSMENT_REQUIRED');

    // `/admin` HTML entry: non-admin still gets 403; unassessed Mod/Top get 302 -> `/login.html?assess=1&next=%2Fadmin`!
    assert.equal((await httpReq('/admin', { cookie: unassessedCust.cookie })).status, 403);
    assert.equal((await httpReq('/admin', { cookie: unassessedVendor.cookie })).status, 403);
    const modAdminHtml = await httpReq('/admin', { cookie: unassessedMod.cookie });
    assert.equal(modAdminHtml.status, 302);
    assert.equal(modAdminHtml.headers.get('location'), '/login.html?assess=1&next=%2Fadmin');
    const topAdminHtml = await httpReq('/admin', { cookie: unassessedTop.cookie });
    assert.equal(topAdminHtml.status, 302);
    assert.equal(topAdminHtml.headers.get('location'), '/login.html?assess=1&next=%2Fadmin');

    // Verify narrow allowlist & strict data minimization while `not_assessed`:
    // 1. Public discovery & policy/accessibility pages stay 200 even with unassessed cookie
    assert.equal((await httpReq('/api/trucks?summary=1', { cookie: unassessedTop.cookie })).status, 200);
    assert.equal((await httpReq('/api/schedule/today', { cookie: unassessedTop.cookie })).status, 200);
    assert.equal((await httpReq('/api/community/list?place_id=iniguez', { cookie: unassessedTop.cookie })).status, 200);
    assert.equal((await httpReq('/policies/privacy.html', { cookie: unassessedTop.cookie })).status, 200);
    assert.equal((await httpReq('/policies/accessibility.html', { cookie: unassessedTop.cookie })).status, 200);

    // 2. `/api/account/context` withholds memberships, admin capabilities, and historical counts while `not_assessed`!
    const redactedTopCtx = await httpReq('/api/account/context', { cookie: unassessedTop.cookie });
    assert.equal(redactedTopCtx.status, 200);
    assert.equal(redactedTopCtx.json.requires_age_assessment, true);
    assert.equal(redactedTopCtx.json.admin, null, 'Unassessed Top context must withhold admin object');
    assert.equal(redactedTopCtx.json.capabilities.can_access_admin_portal, false);
    assert.equal(redactedTopCtx.json.capabilities.is_top_admin, false);
    const redactedVendorCtx = await httpReq('/api/account/context', { cookie: unassessedVendor.cookie });
    assert.deepEqual(redactedVendorCtx.json.memberships, [], 'Unassessed Vendor context must withhold memberships');
    const redactedCustCtx = await httpReq('/api/account/context', { cookie: unassessedCust.cookie });
    assert.equal(redactedCustCtx.json.my_open_issues_count, 0, 'Unassessed Customer context must withhold historical counts');

    // 3. Narrow privacy/accessibility/account support channel on `/api/issues` & `/api/issues/reply` while `not_assessed`
    const blockedOpIssue = await httpReq('/api/issues', {
      method: 'POST',
      cookie: unassessedCust.cookie,
      body: {
        category: 'booking_dispute',
        vendor_id: 'iniguez',
        subject: 'Try operational dispute without age check',
        description: 'Attempting to file a vendor booking dispute while not_assessed.'
      }
    });
    assert.equal(blockedOpIssue.status, 403);
    assert.equal(blockedOpIssue.json?.code, 'AGE_ASSESSMENT_REQUIRED');

    const allowedPrivacyIssue = await httpReq('/api/issues', {
      method: 'POST',
      cookie: unassessedCust.cookie,
      body: {
        category: 'privacy_request',
        subject: 'Privacy inquiry about my pre-existing account',
        description: 'Requesting information on account data retention before completing check.'
      }
    });
    assert.equal(allowedPrivacyIssue.status, 201);
    const privacyIssueId = allowedPrivacyIssue.json.issue.id;

    // `GET /api/issues` while `not_assessed` returns ONLY the `account_access` support ticket, hiding `histIssueId`!
    const scopedIssuesList = await httpReq('/api/issues', { cookie: unassessedCust.cookie });
    assert.equal(scopedIssuesList.status, 200);
    assert.equal(scopedIssuesList.json.issues.length, 1);
    assert.equal(scopedIssuesList.json.issues[0].id, privacyIssueId);

    // Reply allowed on `privacyIssueId`, blocked (`403`) on `histIssueId`!
    assert.equal(
      (await httpReq('/api/issues/reply', { method: 'POST', cookie: unassessedCust.cookie, body: { issue_id: privacyIssueId, body: 'Follow-up privacy note.' } })).status,
      201
    );
    assert.equal(
      (await httpReq('/api/issues/reply', { method: 'POST', cookie: unassessedCust.cookie, body: { issue_id: histIssueId, body: 'Try replying to booking dispute.' } })).status,
      403
    );

    // 4. Legitimate Vendor, Mod & Top complete 14+ assessment -> immediately regain full intended permissions; Mod logs out cleanly
    for (const persona of [unassessedVendor, unassessedMod, unassessedTop]) {
      const aRes = await httpReq('/api/auth/age-assessment', {
        method: 'POST',
        cookie: persona.cookie,
        headers: { 'X-BiteShark-Client': 'web-auth-v1' },
        body: { dob: '1986-07-14' }
      });
      assert.equal(aRes.status, 200);
    }
    assert.equal((await httpReq('/api/owner/profile?truck_id=iniguez', { cookie: unassessedVendor.cookie })).status, 200);
    assert.equal((await httpReq('/admin', { cookie: unassessedTop.cookie })).status, 200, 'Assessed Top Admin must load /admin (200) with zero redirect loop');
    assert.equal((await httpReq('/api/admin/overview', { cookie: unassessedTop.cookie })).status, 200);
    const restoredTopCtx = await httpReq('/api/account/context', { cookie: unassessedTop.cookie });
    assert.equal(restoredTopCtx.json.capabilities.is_top_admin, true);

    assert.equal((await httpReq('/api/admin/overview', { cookie: unassessedMod.cookie })).status, 200);
    assert.equal(
      (await httpReq('/api/auth/logout', { method: 'POST', cookie: unassessedMod.cookie, headers: { 'X-BiteShark-Client': 'web-auth-v1' }, body: {} })).status,
      200
    );
    assert.equal((await httpReq('/api/admin/overview', { cookie: unassessedMod.cookie })).status, 401);

    // 5. Ineligible (`< 14`) assessment on `unassessedCust`: disables account & revokes session, while PRESERVING historical records!
    const custIneligible = await httpReq('/api/auth/age-assessment', {
      method: 'POST',
      cookie: unassessedCust.cookie,
      headers: { 'X-BiteShark-Client': 'web-auth-v1' },
      body: { dob: '2015-08-01' }
    });
    assert.equal(custIneligible.status, 403);
    assert.equal(custIneligible.json?.code, 'AGE_INELIGIBLE');
    assert.equal((await httpReq('/api/favorites/list', { cookie: unassessedCust.cookie })).status, 401);

    const mcCheck = await migratorPool.connect();
    let presFavs;
    let presBk;
    let presIss;
    try {
      await mcCheck.query('BEGIN');
      await mcCheck.query("SELECT set_config('app.admin_portal', 'true', true), set_config('app.can_moderate', 'true', true)");
      presFavs = await mcCheck.query('SELECT count(*)::int AS c FROM favorites WHERE user_id = $1', [unassessedCust.id]);
      presBk = await mcCheck.query('SELECT count(*)::int AS c FROM bookings WHERE requester_user_id = $1', [unassessedCust.id]);
      presIss = await mcCheck.query('SELECT count(*)::int AS c FROM support_issues WHERE reporter_user_id = $1', [unassessedCust.id]);
      await mcCheck.query('COMMIT');
    } finally {
      mcCheck.release();
    }
    assert.equal(presFavs.rows[0].c, 1, 'Historical favorites must not be deleted automatically');
    assert.equal(presBk.rows[0].c, 1, 'Historical bookings must not be deleted automatically');
    assert.equal(presIss.rows[0].c, 2, 'Historical support issues must not be deleted automatically');
    console.log('PASS [9/10]: Central server-side pending-age gate across Customer/Vendor/Mod/Top, narrow allowlist redaction, zero admin redirect loop, and preserved historical records verified');

    // =========================================================================
    // [10/10] Concurrent Assessment/Revocation Races + Verified 24h Rate-Limit Cleanup & Wording
    // =========================================================================
    const racePersona = await seedPreExistingUnassessedSession('race-top-vendor', {
      platformRole: 'top',
      vendorRole: 'owner',
      vendorId: 'iniguez'
    });

    // Fire `< 14` age assessment concurrently with protected booking, favorite, review, vendor & admin mutations!
    const raceOutcomes = await Promise.all([
      httpReq('/api/auth/age-assessment', {
        method: 'POST',
        cookie: racePersona.cookie,
        headers: { 'X-BiteShark-Client': 'web-auth-v1' },
        body: { dob: '2016-03-03' }
      }),
      httpReq('/api/bookings/create', {
        method: 'POST',
        cookie: racePersona.cookie,
        body: { truck_id: 'iniguez', event_date: '2026-12-22', location: 'Santa Rosa', guest_count: 35, package_id: 'dropin' }
      }),
      httpReq('/api/favorites/toggle', {
        method: 'POST',
        cookie: racePersona.cookie,
        body: { truck_id: 'mitote' }
      }),
      httpReq('/api/community/post', {
        method: 'POST',
        cookie: racePersona.cookie,
        body: { place_id: 'iniguez', nickname: 'Racer', body: 'Concurrent bypass attempt', rating: 5 }
      }),
      httpReq('/api/owner/profile', {
        method: 'POST',
        cookie: racePersona.cookie,
        body: { truck_id: 'iniguez', display_name: 'Race Tamper', cuisine: 'Mexican' }
      }),
      httpReq('/api/admin/overview', {
        method: 'GET',
        cookie: racePersona.cookie
      })
    ]);

    assert.equal(raceOutcomes[0].status, 403);
    assert.equal(raceOutcomes[0].json?.code, 'AGE_INELIGIBLE');
    for (let idx = 1; idx < raceOutcomes.length; idx++) {
      assert(
        raceOutcomes[idx].status === 403 || raceOutcomes[idx].status === 401,
        `Concurrent protected call #${idx} must fail closed (401 or 403), got ${raceOutcomes[idx].status}`
      );
    }

    // Also test concurrent suspension (`FOR SHARE` row lock inside `withTransaction`) on an assessed user
    const assessedRacer = await signUp14Plus(`assessed-racer@${allowedDomain}`, '1992-05-19');
    const suspRace = await Promise.all([
      httpReq('/api/admin/accounts/status', {
        method: 'POST',
        cookie: topAdmin.cookie,
        body: { user_id: assessedRacer.user.id, action: 'suspend', reason: 'Concurrent revocation test' }
      }),
      ...Array.from({ length: 4 }, (_, k) =>
        httpReq('/api/bookings/create', {
          method: 'POST',
          cookie: assessedRacer.cookie,
          body: {
            truck_id: 'iniguez',
            event_type: 'Company Lunch',
            event_date: `2027-02-${12 + k}`,
            location: 'Petaluma',
            guest_count: 20,
            package_id: 'dropin'
          }
        })
      )
    ]);
    assert.equal(suspRace[0].status, 200);
    assert(suspRace.slice(1).every(r => [200, 201, 401].includes(r.status)), 'No 500s during concurrent FOR SHARE suspension race');
    assert.equal((await httpReq('/api/bookings/list', { cookie: assessedRacer.cookie })).status, 401);

    // Verify actual retention & cleanup of expired `auth_rate_limits` (>24h), `auth_otp_challenges` (>24h),
    // and `auth_sessions` (>7d) via `/api/pager/worker` HTTP endpoint (the exact path run by systemd worker)
    const staleRlKey = 'arl:stale_verify_' + suffix;
    const staleChId = crypto.randomUUID();
    const staleSessSha = crypto.createHash('sha256').update('stale_sess_' + suffix).digest('hex');
    const mcStale = await migratorPool.connect();
    try {
      await mcStale.query('BEGIN');
      await mcStale.query("SELECT set_config('app.auth_internal', 'true', true)");
      await mcStale.query(
        "INSERT INTO auth_rate_limits (bucket_key, window_start, hit_count) VALUES ($1, now() - interval '26 hours', 3)",
        [staleRlKey]
      );
      await mcStale.query(
        `INSERT INTO auth_otp_challenges (id, email_normalized, code_hmac, attempts, max_attempts, requester_ip_hash, expires_at, created_at)
         VALUES ($1, $2, $3, 0, 5, 'stale_ip', now() - interval '25 hours', now() - interval '26 hours')`,
        [staleChId, `stale@${allowedDomain}`, '0'.repeat(64)]
      );
      await mcStale.query(
        `INSERT INTO auth_sessions (token_sha256, user_id, ip_hash, ua_hash, created_at, last_seen_at, expires_at, max_expires_at, revoked_at)
         VALUES ($1, $2, 'stale_ip', 'stale_ua', now() - interval '9 days', now() - interval '9 days', now() - interval '8 days', now() - interval '8 days', now() - interval '8 days')`,
        [staleSessSha, teen14.user.id]
      );
      await mcStale.query('COMMIT');
    } finally {
      mcStale.release();
    }

    const workerRes = await httpReq('/api/pager/worker', {
      method: 'POST',
      headers: { Authorization: `Bearer ${workerSecret}` },
      body: { batch_size: 5, cleanup: true }
    });
    assert.equal(workerRes.status, 200);

    const mcVerify = await migratorPool.connect();
    let remRl;
    let remOtp;
    let remSess;
    try {
      await mcVerify.query('BEGIN');
      await mcVerify.query("SELECT set_config('app.auth_internal', 'true', true)");
      remRl = await mcVerify.query('SELECT count(*)::int AS c FROM auth_rate_limits WHERE bucket_key = $1', [staleRlKey]);
      remOtp = await mcVerify.query('SELECT count(*)::int AS c FROM auth_otp_challenges WHERE id = $1', [staleChId]);
      remSess = await mcVerify.query('SELECT count(*)::int AS c FROM auth_sessions WHERE token_sha256 = $1', [staleSessSha]);
      await mcVerify.query('COMMIT');
    } finally {
      mcVerify.release();
    }
    assert.equal(remRl.rows[0].c, 0, 'Worker cleanup must purge >24h pseudonymous auth_rate_limits buckets');
    assert.equal(remOtp.rows[0].c, 0, 'Worker cleanup must purge >24h expired auth_otp_challenges');
    assert.equal(remSess.rows[0].c, 0, 'Worker cleanup must purge >7d expired/revoked auth_sessions');

    // Verify precise privacy & backup wording in policies and readiness items (Section 3)
    const privHtml = (await httpReq('/policies/privacy.html')).text;
    assert(privHtml.includes('minimized, pseudonymous'), 'Privacy Notice must describe IP rate-limit digests as minimized/pseudonymous');
    assert(privHtml.includes('not treated as anonymous'), 'Privacy Notice must avoid blanket anonymity claims');
    assert(privHtml.includes('existing non-auth historical records are preserved pending legal review'), 'Privacy Notice must document disabled-account historical record preservation pending legal review');

    const rItems = (await httpReq('/api/admin/readiness', { cookie: topAdmin.cookie })).json.items;
    const backupItem = rItems.find(i => i.item_key === 'backups_offserver_restore');
    const dobItem = rItems.find(i => i.item_key === 'dob_collection_minimization');
    assert(backupItem.current_practice.includes('pg_restore --list (archive TOC readability check, NOT a completed database restore)'));
    assert.notEqual(backupItem.status, 'legally_approved');
    assert(dobItem.current_practice.includes('minimized/pseudonymous'));
    assert(dobItem.unresolved_questions.includes('disabled on an under-14 assessment'));
    assert.notEqual(dobItem.status, 'legally_approved');

    console.log('PASS [10/10]: Concurrent assessment/revocation races, verified 24h/7d worker cleanup, pseudonymous IP wording & archive-readability vs DB-restore distinction verified');
    console.log('ALL LEGAL-POLICY, 14+ AGE ELIGIBILITY & READINESS INTEGRATION CHECKS PASSED.');
  } finally {
    if (standalone) await standalone.closeGracefully(1000).catch(() => {});
    if (appPool) await appPool.end().catch(() => {});
    if (migratorPool) await migratorPool.end().catch(() => {});
    if (adminPool) await adminPool.end().catch(() => {});
    if (pgCluster) await pgCluster.stop().catch(() => {});
  }
})().catch(err => {
  console.error('FAIL legal-readiness.integration.cjs:', err);
  process.exitCode = 1;
});
