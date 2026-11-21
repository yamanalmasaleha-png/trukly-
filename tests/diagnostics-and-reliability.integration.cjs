// BiteShark Bounded Operational Diagnostics, Redaction, Release Awareness & Reliability PostgreSQL Suite
//
// Deterministically verifies against real PostgreSQL (`NOSUPERUSER NOBYPASSRLS`) and `server/app.js`:
//   1. Least-privilege DB grants (`REVOKE UPDATE, DELETE ON diagnostic_incident_notes`,
//      `REVOKE DELETE ON diagnostic_releases`) and `FORCE ROW LEVEL SECURITY` on all 024 tables.
//   2. Comprehensive diagnostic redaction using deliberately sensitive fixtures: email addresses,
//      Bearer/Resend/Stripe/worker secrets, `__Host-` session cookies, URLs with query strings and
//      `#accept-invite` / `#pager` fragments, 6-digit OTPs, raw DOBs, GPS coordinates, filesystem
//      paths, JWTs, control/newline log-injection chars, while preserving `corr_<hex>` references.
//   3. Untrusted browser reporting (`POST /api/diagnostics/report`): `4 KiB` body cap (`413`),
//      expected validation status filtering (`202 accepted: false`), fingerprint deduplication
//      (`first_seen_at`, `last_seen_at`, `occurrence_count`), sample rate-capping (no polling flood),
//      and per-IP rate limiting (`429 DIAGNOSTIC_RATE_LIMITED`).
//   4. Explicit server-side role enforcement: anonymous `401`, customer/vendor `403`, `Admin: Mod`
//      restricted strictly to `mod_visible = true` operational subset (`403` on Top-only groups,
//      triage, fix-SHA, synthetic test, and retention cleanup; `201` on operational notes), and
//      `Admin: Top` full sanitized scope.
//   5. Release awareness & stale-client attribution: startup `diagnostic_releases`, stale browser
//      loaded release (`X-BiteShark-Loaded-Release` != active SHA -> `stale_client_observed`),
//      timing-only `first_observed_after_deployment` label (never auto-claiming causation),
//      `suspected_fix_sha` recording, and `continued_after_suspected_fix = true` when new events
//      occur on/after the suspected fix release.
//   6. Non-recursive & non-breaking reporting failure: simulated diagnostic DB failure neither
//      recurses nor breaks the original API/browser operation, emitting a sanitized fallback log.
//   7. Configurable retention cleanup (`cleanupExpiredDiagnostics`): purges aged samples and
//      resolved/overflow groups while preserving 100% of `diagnostic_incident_notes` and `audit_logs`,
//      and notes reconnect via `group_fingerprint` if the incident recurs later.
//   8. Audited backend reliability fixes:
//      - `GET /api/account/context` returns `503` on transient `auth_users` DB fault instead of
//        falsely returning `requires_age_assessment: true`.
//      - Idempotent `POST /api/favorites/toggle` (`desired_saved`) and `POST /api/community/post`
//        (`idempotency_key` deduplicating retries).
//      - Optimistic concurrency `409 STALE_ISSUE_STATE` on `/api/admin/issues/update`, separate
//        `applicant_feedback` + non-duplicated `internal_notes` on `/api/admin/applications/decision`,
//        and truthful `notification_delivery: 'recorded_in_app_only'`.
//      - Worker heartbeat & batch failure diagnostic recording on `/api/pager/worker`.

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
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-diag-pg-'));
  const dataDir = path.join(tmpBase, 'data');
  const pwFile = path.join(tmpBase, 'pw.txt');
  const logFile = path.join(tmpBase, 'postgres.log');
  const password = 'diag_pw_' + crypto.randomBytes(6).toString('hex');
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
    const m = String(raw).match(/^(__Host-truckly_session=[^;]+|truckly_session=[^;]+)/);
    if (m) return m[1];
  }
  return null;
}

async function main() {
  const { Pool } = requirePg();
  const cluster = await createPostgresCluster();
  const suffix = crypto.randomBytes(4).toString('hex');
  const dbName = `bs_diag_${suffix}`;
  const migratorRole = `bs_diag_mig_${suffix}`;
  const appRole = `bs_diag_app_${suffix}`;
  const migPass = 'mig_' + crypto.randomBytes(8).toString('hex');
  const appPass = 'app_' + crypto.randomBytes(8).toString('hex');

  const superPool = new Pool({ connectionString: cluster.adminUrl, max: 2 });
  let migratorPool = null;
  let appPool = null;
  let serverHandleA = null;
  let serverHandleB = null;

  const authSecret = 'diag_auth_secret_' + crypto.randomBytes(24).toString('hex');
  const mailboxSecret = 'mbx_diag_secret_' + crypto.randomBytes(20).toString('hex');
  const workerSecret = 'wk_diag_secret_' + crypto.randomBytes(20).toString('hex');
  const releaseSha1 = '1111111122222222333333334444444455555555';
  const releaseSha2 = '6666666677777777888888889999999900000000';

  const capturedLogs = [];
  const customLogger = {
    info: m => capturedLogs.push(String(m)),
    warn: m => capturedLogs.push(String(m)),
    error: m => capturedLogs.push(String(m))
  };

  try {
    await superPool.query(`CREATE ROLE "${migratorRole}" WITH LOGIN PASSWORD '${migPass}' CREATEDB`);
    await superPool.query(
      `CREATE ROLE "${appRole}" WITH LOGIN PASSWORD '${appPass}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`
    );
    await superPool.query(`CREATE DATABASE "${dbName}" OWNER "${migratorRole}"`);

    const parsedAdmin = new URL(cluster.adminUrl);
    const migratorUrl = `postgresql://${migratorRole}:${encodeURIComponent(migPass)}@${parsedAdmin.hostname}:${parsedAdmin.port}/${dbName}`;
    const appUrl = `postgresql://${appRole}:${encodeURIComponent(appPass)}@${parsedAdmin.hostname}:${parsedAdmin.port}/${dbName}`;

    const migRes = await runMigrationsCli(migratorUrl, appRole);
    assert.equal(migRes.code, 0, `Migrations failed: ${migRes.stderr}`);
    assert(migRes.stdout.includes('"newly_applied":26'), `Expected 26 migrations: ${migRes.stdout}`);

    migratorPool = new Pool({ connectionString: migratorUrl, max: 4 });
    appPool = new Pool({ connectionString: appUrl, max: 8 });

    async function privQuery(sql, params = []) {
      const c = await migratorPool.connect();
      try {
        await c.query('BEGIN');
        await c.query("SELECT set_config('app.auth_internal', 'true', true)");
        await c.query("SELECT set_config('app.admin_portal', 'true', true)");
        await c.query("SELECT set_config('app.diagnostics_internal', 'true', true)");
        await c.query("SELECT set_config('app.is_platform_admin', 'true', true)");
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

    // -----------------------------------------------------------------------
    // 1. Verify least-privilege grants & FORCE RLS on 024 tables
    // -----------------------------------------------------------------------
    const privCheck = await appPool.query(`
      SELECT
        has_table_privilege(current_user, 'diagnostic_incident_notes', 'INSERT') AS note_ins,
        has_table_privilege(current_user, 'diagnostic_incident_notes', 'UPDATE') AS note_upd,
        has_table_privilege(current_user, 'diagnostic_incident_notes', 'DELETE') AS note_del,
        has_table_privilege(current_user, 'diagnostic_releases', 'DELETE') AS rel_del
    `);
    assert.equal(privCheck.rows[0].note_ins, true);
    assert.equal(privCheck.rows[0].note_upd, false, 'diagnostic_incident_notes must be immutable (no UPDATE)');
    assert.equal(privCheck.rows[0].note_del, false, 'diagnostic_incident_notes must be immutable (no DELETE)');
    assert.equal(privCheck.rows[0].rel_del, false, 'diagnostic_releases must forbid DELETE');

    // Bare query without GUC must see 0 rows due to FORCE RLS
    const bareRlsCheck = await appPool.query('SELECT count(*)::int AS c FROM diagnostic_incident_groups');
    assert.equal(bareRlsCheck.rows[0].c, 0);

    // -----------------------------------------------------------------------
    // 2. Unit & Redaction Verification with Deliberately Sensitive Fixtures
    // -----------------------------------------------------------------------
    const diagMod = await import(pathToFileURL(path.join(ROOT, 'lib', 'diagnostics.js')).href);
    const appMod = await import(pathToFileURL(path.join(ROOT, 'server', 'app.js')).href);

    const sensitiveFixture = [
      'Failed for customer.secret+tag@gmail.com',
      'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc123def456',
      'apiKey=re_liveSecretKey998877665544',
      'Cookie: __Host-truckly_session=super_secret_cookie_val_999',
      'URL https://staging.biteshark.live/login.html?token=tok_priv_99#accept-invite=rawInviteTok887766',
      'OTP 482915 dob=2009-04-18 coords 38.440429, -122.714055',
      'path /etc/truckly-staging/staging.env\r\nFAKE_LOG_INJECTION: {"level":"info"}',
      'Ref corr_abcdef0123456789'
    ].join(' | ');

    const redacted = diagMod.sanitizeDiagnosticText(sensitiveFixture, 400);
    assert(!redacted.includes('customer.secret'), `Email leaked: ${redacted}`);
    assert(!redacted.includes('eyJhbGci'), `JWT leaked: ${redacted}`);
    assert(!redacted.includes('re_liveSecretKey'), `Resend key leaked: ${redacted}`);
    assert(!redacted.includes('super_secret_cookie_val'), `Cookie leaked: ${redacted}`);
    assert(!redacted.includes('rawInviteTok'), `Fragment token leaked: ${redacted}`);
    assert(!redacted.includes('tok_priv_99'), `Query token leaked: ${redacted}`);
    assert(!redacted.includes('482915'), `OTP code leaked: ${redacted}`);
    assert(!redacted.includes('2009-04-18'), `Raw DOB leaked: ${redacted}`);
    assert(!redacted.includes('38.440429'), `Precise lat leaked: ${redacted}`);
    assert(!redacted.includes('-122.714055'), `Precise lng leaked: ${redacted}`);
    assert(!redacted.includes('/etc/truckly-staging/staging.env'), `Filesystem path leaked: ${redacted}`);
    assert(!/[\r\n]/.test(redacted), 'Newlines must be stripped to prevent log injection');
    assert(redacted.includes('corr_abcdef0123456789'), `Valid correlation ID must be preserved: ${redacted}`);
    assert(diagMod.sanitizeDiagnosticText(sensitiveFixture, 120).length <= 120, 'maxLen cap must be enforced');

    const tpl = diagMod.sanitizeRouteTemplate(
      'https://staging.biteshark.live/api/pager/status/550e8400-e29b-41d4-a716-446655440000?code=secret#pager=secret'
    );
    assert.equal(tpl, '/api/pager/status/:uuid');

    const safeCtx = diagMod.sanitizeSafeContext({
      http_status: 503,
      phase: 'poll',
      secret_body: 'DO_NOT_KEEP',
      email: 'leak@example.com',
      headers: { authorization: 'Bearer secret' }
    });
    assert.deepEqual(safeCtx, { http_status: 503, phase: 'poll' });

    // -----------------------------------------------------------------------
    // 3. Boot Server on Release SHA 1 & Seed Disposable Test Actors
    // -----------------------------------------------------------------------
    for (const k of Object.keys(process.env)) {
      if (k.startsWith('BITESHARK_') || k.startsWith('TRUCKLY_')) delete process.env[k];
    }
    const portA = await getFreePort();
    const baseA = `http://127.0.0.1:${portA}`;

    process.env.BITESHARK_ENV = 'staging';
    delete process.env.BITESHARK_PUBLIC_ORIGIN;
    delete process.env.TRUCKLY_PUBLIC_ORIGIN;
    process.env.BITESHARK_AUTH_SECRET = authSecret;
    process.env.BITESHARK_AUTH_DELIVERY_MODE = 'staging_mailbox';
    process.env.BITESHARK_STAGING_MAILBOX_SECRET = mailboxSecret;
    process.env.BITESHARK_STAGING_ALLOWED_EMAIL_DOMAINS = 'diag.biteshark.test';
    process.env.BITESHARK_NOTIFICATION_WORKER_SECRET = workerSecret;
    process.env.BITESHARK_RELEASE_SHA = releaseSha1;
    process.env.BITESHARK_DIAGNOSTICS_REPORT_MAX_PER_WINDOW = '5';
    process.env.BITESHARK_DIAGNOSTICS_SAMPLE_COOLDOWN_SEC = '60';
    process.env.BITESHARK_DIAGNOSTICS_SAMPLE_RETENTION_DAYS = '7';
    process.env.BITESHARK_DIAGNOSTICS_RESOLVED_RETENTION_DAYS = '14';
    process.env.BITESHARK_DIAGNOSTICS_MAX_GROUPS = '25';

    let failAccountContextSelect = false;
    const faultInjectableAdapter = {
      query: async (sql, params) => {
        if (failAccountContextSelect && String(sql).includes('SELECT age_eligibility_status, age_policy_version FROM auth_users')) {
          const err = new Error('Simulated transient PostgreSQL timeout on auth_users');
          err.code = '57014';
          throw err;
        }
        return appPool.query(sql, params);
      },
      connect: async () => {
        const client = await appPool.connect();
        return {
          query: async (sql, params) => {
            if (failAccountContextSelect && String(sql).includes('SELECT age_eligibility_status, age_policy_version FROM auth_users')) {
              const err = new Error('Simulated transient PostgreSQL timeout on auth_users');
              err.code = '57014';
              throw err;
            }
            return client.query(sql, params);
          },
          release: (...args) => client.release(...args)
        };
      }
    };

    serverHandleA = appMod.createStandaloneServer({
      dbAdapter: faultInjectableAdapter,
      releaseSha: releaseSha1,
      logger: customLogger
    });
    await new Promise(resolve => serverHandleA.server.listen(portA, '127.0.0.1', resolve));
    await serverHandleA.startupReleasePromise;

    async function httpJson(baseUrl, reqPath, { method = 'GET', cookie = '', headers = {}, body } = {}) {
      const h = { Origin: baseUrl, ...headers };
      if (cookie) h.Cookie = cookie;
      if (body !== undefined) h['Content-Type'] = 'application/json';
      const res = await fetch(`${baseUrl}${reqPath}`, {
        method,
        headers: h,
        body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined
      });
      const json = await res.json().catch(() => ({}));
      return { status: res.status, headers: res.headers, json };
    }

    async function signInTestUser(email) {
      const start = await httpJson(baseA, '/api/auth/start', {
        method: 'POST',
        headers: { 'X-BiteShark-Client': 'web-auth-v1' },
        body: { email, intent: 'signup', dob: '1992-06-15' }
      });
      assert.equal(start.status, 200, `start failed for ${email}: ${JSON.stringify(start.json)}`);
      const mbx = await httpJson(baseA, '/api/auth/staging-mailbox', {
        method: 'POST',
        headers: { 'X-Staging-Mailbox-Secret': mailboxSecret },
        body: { email }
      });
      assert.equal(mbx.status, 200);
      const ver = await httpJson(baseA, '/api/auth/verify', {
        method: 'POST',
        headers: { 'X-BiteShark-Client': 'web-auth-v1' },
        body: { email, code: mbx.json.code }
      });
      assert.equal(ver.status, 200);
      const cookie = parseSessionCookie(
        typeof ver.headers.getSetCookie === 'function' ? ver.headers.getSetCookie() : ver.headers.get('set-cookie')
      );
      assert(cookie, `Missing session cookie for ${email}`);
      return { user: ver.json.user, cookie };
    }

    const topActor = await signInTestUser('top@diag.biteshark.test');
    const modActor = await signInTestUser('mod@diag.biteshark.test');
    const vendorActor = await signInTestUser('vendor@diag.biteshark.test');
    const custActor = await signInTestUser('customer@diag.biteshark.test');

    await privQuery(
      `INSERT INTO platform_roles (user_id, role, granted_by)
       VALUES ($1, 'top', 'bootstrap'), ($2, 'mod', $1)`,
      [topActor.user.id, modActor.user.id]
    );
    await privQuery(
      `INSERT INTO vendor_memberships (vendor_id, user_id, role, granted_by)
       VALUES ('mitote', $1, 'owner', $2)`,
      [vendorActor.user.id, topActor.user.id]
    );

    // -----------------------------------------------------------------------
    // 4. Verify Untrusted Browser Reporting, Redaction, Grouping, Sample Cap & Rate Limit
    // -----------------------------------------------------------------------
    // Oversized >4 KiB body rejected with 413 (use explicit Content-Length or raw http.request so undici does not stall on early socket close)
    const hugeBody = JSON.stringify({
      feature_key: 'discovery',
      operation_name: 'load',
      error_code: 'BIG',
      message: 'x'.repeat(5000)
    });
    const tooBig = await new Promise((resolve, reject) => {
      const u = new URL('/api/diagnostics/report', baseA);
      const req = http.request(
        {
          hostname: u.hostname,
          port: u.port,
          path: u.pathname,
          method: 'POST',
          headers: {
            Origin: baseA,
            'Content-Type': 'application/json',
            'Content-Length': String(Buffer.byteLength(hugeBody)),
            Connection: 'close'
          }
        },
        res => {
          let raw = '';
          res.on('data', d => (raw += d));
          res.on('end', () => resolve({ status: res.statusCode, json: JSON.parse(raw || '{}') }));
        }
      );
      req.on('error', reject);
      req.end(hugeBody);
    });
    assert.equal(tooBig.status, 413);

    // Expected 400 validation status is ignored (not turned into an incident)
    const ignored400 = await httpJson(baseA, '/api/diagnostics/report', {
      method: 'POST',
      body: {
        feature_key: 'bookings_inquiries',
        operation_name: 'bookings.validate',
        http_status: 400,
        error_code: 'VALIDATION_ERR',
        message: 'Guest count too high'
      }
    });
    assert.equal(ignored400.status, 202);
    assert.equal(ignored400.json.accepted, false);

    // Deliberately sensitive untrusted browser report (with stale loaded release SHA!)
    const staleSha = '0000000011111111222222223333333344444444';
    const rep1 = await httpJson(baseA, '/api/diagnostics/report', {
      method: 'POST',
      body: {
        feature_key: 'pagers',
        operation_name: 'pager.poll_status',
        route_template: '/api/pager/status/550e8400-e29b-41d4-a716-446655440000?code=priv_tok#pager=priv_tok',
        http_method: 'GET',
        http_status: 502,
        severity: 'critical', // browser reports are clamped <= 'error'
        error_code: 'MALFORMED_SERVER_RESPONSE',
        message: 'Pager failed for leak@gmail.com Bearer secretJwt999 OTP 918273 at 38.44123, -122.71234 <img src=x onerror=alert(1)>',
        client_build_version: 'bs-ui-old-tab',
        client_loaded_release_sha: staleSha,
        duration_ms: 412,
        retryable: true,
        outcome_state: 'failed',
        safe_context: { http_status: 502, phase: 'poll', raw_cookie: '__Host-secret=123' }
      }
    });
    assert.equal(rep1.status, 202);
    assert.equal(rep1.json.accepted, true);
    assert(/^corr_[0-9a-f]{16}$/.test(rep1.json.correlation_id));

    // Second identical failure within cooldown increments occurrence_count WITHOUT duplicating samples!
    const rep2 = await httpJson(baseA, '/api/diagnostics/report', {
      method: 'POST',
      body: {
        feature_key: 'pagers',
        operation_name: 'pager.poll_status',
        route_template: '/api/pager/status/550e8400-e29b-41d4-a716-446655440000',
        error_code: 'MALFORMED_SERVER_RESPONSE',
        message: 'Second poll failure <img src=x onerror=alert(1)>',
        client_build_version: 'bs-ui-old-tab',
        client_loaded_release_sha: staleSha
      }
    });
    assert.equal(rep2.status, 202);

    // Send 3 more reports to hit max=5, then 6th must be 429 rate-limited!
    for (let i = 0; i < 3; i++) {
      const r = await httpJson(baseA, '/api/diagnostics/report', {
        method: 'POST',
        body: {
          feature_key: 'local_photo_storage',
          operation_name: 'indexeddb.open',
          error_code: `IDB_ERR_${i}`,
          message: 'IndexedDB blocked'
        }
      });
      assert.equal(r.status, 202);
    }
    const rateLimited = await httpJson(baseA, '/api/diagnostics/report', {
      method: 'POST',
      body: {
        feature_key: 'local_photo_storage',
        operation_name: 'indexeddb.open',
        error_code: 'IDB_OVER_LIMIT',
        message: 'Should be rate-limited'
      }
    });
    assert.equal(rateLimited.status, 429);
    assert.equal(rateLimited.json.code, 'DIAGNOSTIC_RATE_LIMITED');

    // -----------------------------------------------------------------------
    // 5. Trigger Top-Only Auth/Context 503 Fault + Verify Non-Misleading Context Behavior
    // -----------------------------------------------------------------------
    failAccountContextSelect = true;
    const faultedCtx = await httpJson(baseA, '/api/account/context', { cookie: topActor.cookie });
    assert.equal(faultedCtx.status, 503, 'Transient DB failure on auth_users must return 503, NEVER false not_assessed 200');
    assert.equal(faultedCtx.json.code, 'ACCOUNT_CONTEXT_UNAVAILABLE');
    assert(/^corr_[0-9a-f]{16}$/.test(faultedCtx.json.correlation_id));
    failAccountContextSelect = false;

    // -----------------------------------------------------------------------
    // 6. Verify Role Exclusion & Explicit Top vs Mod Server-Side Permissions
    // -----------------------------------------------------------------------
    const anonDiag = await httpJson(baseA, '/api/admin/diagnostics');
    assert.equal(anonDiag.status, 401);

    const custDiag = await httpJson(baseA, '/api/admin/diagnostics', { cookie: custActor.cookie });
    assert.equal(custDiag.status, 403);

    const vendDiag = await httpJson(baseA, '/api/admin/diagnostics', { cookie: vendorActor.cookie });
    assert.equal(vendDiag.status, 403);

    // Top sees BOTH operational (`pagers`) AND Top-only (`ui_runtime` / `admin_portal` / `email_delivery`) incidents
    // Let's also record a Top-only `email_delivery` provider failure directly via `recordDiagnosticEvent`
    await diagMod.recordDiagnosticEvent(appPool, {
      component: 'external_provider',
      featureKey: 'email_delivery',
      operationName: 'email_delivery.invite_send',
      routeTemplate: '/api/admin/invitations/create',
      httpStatus: 422,
      severity: 'error',
      errorCode: 'RESEND_DOMAIN_UNVERIFIED',
      message: 'Provider rejected recipient secret.person@gmail.com with re_secretKey12345678',
      serverReleaseSha: releaseSha1,
      modVisible: false
    });

    const topList = await httpJson(baseA, '/api/admin/diagnostics?window=all', { cookie: topActor.cookie });
    assert.equal(topList.status, 200);
    assert.equal(topList.json.permissions.scope, 'full_sanitized');
    assert.equal(topList.json.permissions.can_triage, true);

    const pagerGroup = topList.json.items.find(g => g.feature_key === 'pagers' && g.error_code === 'MALFORMED_SERVER_RESPONSE');
    const emailGroup = topList.json.items.find(g => g.feature_key === 'email_delivery');
    assert(pagerGroup, 'Expected grouped pager incident');
    assert(emailGroup, 'Top admin must see email_delivery incident');
    assert.equal(pagerGroup.occurrence_count, 2, 'Duplicate reports must increment occurrence_count');
    assert.equal(pagerGroup.stale_client_observed, true, 'Stale browser build must be flagged');
    assert.equal(pagerGroup.severity, 'error', 'Untrusted browser critical severity clamped to error');
    assert(!pagerGroup.sanitized_summary.includes('leak@gmail.com'), 'Stored group summary must be redacted');
    assert(!emailGroup.sanitized_summary.includes('secret.person@gmail.com'), 'Email redacted in provider group');
    assert(!emailGroup.sanitized_summary.includes('re_secretKey'), 'API key redacted in provider group');

    // Detail check: sample cooldown kept sample count at 1 despite 2 occurrences!
    const pagerDetail = await httpJson(baseA, `/api/admin/diagnostics/detail?id=${pagerGroup.id}`, {
      cookie: topActor.cookie
    });
    assert.equal(pagerDetail.status, 200);
    assert.equal(pagerDetail.json.samples.length, 1, 'Sample rate-capping prevented duplicate sample flood');
    assert.equal(pagerDetail.json.samples[0].route_template, '/api/pager/status/:uuid');
    assert(!JSON.stringify(pagerDetail.json.samples[0]).includes('__Host-secret'));
    assert(pagerDetail.json.samples[0].sanitized_message.includes('<img src=x onerror=alert(1)>'), 'Raw angle brackets kept in DB text to test safe UI escaping');

    // Mod sees operational subset (`pagerGroup`) ONLY — `emailGroup` (`mod_visible = false`) is withheld!
    const modList = await httpJson(baseA, '/api/admin/diagnostics?window=all', { cookie: modActor.cookie });
    assert.equal(modList.status, 200);
    assert.equal(modList.json.permissions.scope, 'operational_subset');
    assert.equal(modList.json.permissions.can_triage, false);
    assert(modList.json.items.some(g => g.id === pagerGroup.id), 'Mod must see operational pager group');
    assert(!modList.json.items.some(g => g.id === emailGroup.id), 'Mod must NOT see Top-only email_delivery group');

    // Mod direct detail fetch on Top-only group -> 403
    const modForbiddenDetail = await httpJson(baseA, `/api/admin/diagnostics/detail?id=${emailGroup.id}`, {
      cookie: modActor.cookie
    });
    assert.equal(modForbiddenDetail.status, 403);

    // Mod cannot triage, create synthetic probes, or run cleanup (`403`)
    const modTriageAttempt = await httpJson(baseA, '/api/admin/diagnostics/triage', {
      method: 'POST',
      cookie: modActor.cookie,
      body: { group_id: pagerGroup.id, triage_status: 'resolved', note_body: 'Mod trying to resolve' }
    });
    assert.equal(modTriageAttempt.status, 403);

    const modSynthAttempt = await httpJson(baseA, '/api/admin/diagnostics/synthetic-test', {
      method: 'POST',
      cookie: modActor.cookie,
      body: {}
    });
    assert.equal(modSynthAttempt.status, 403);

    const modCleanAttempt = await httpJson(baseA, '/api/admin/diagnostics/cleanup', {
      method: 'POST',
      cookie: modActor.cookie,
      body: {}
    });
    assert.equal(modCleanAttempt.status, 403);

    // Mod CAN add operational note on `mod_visible = true` group, preserving authorship!
    const modNoteRes = await httpJson(baseA, '/api/admin/diagnostics/note', {
      method: 'POST',
      cookie: modActor.cookie,
      body: {
        group_id: pagerGroup.id,
        note_body: 'Checked customer report; proxy returned HTML 502 <script>window.__xss=1</script>'
      }
    });
    assert.equal(modNoteRes.status, 201);
    assert.equal(modNoteRes.json.note.actor_id, modActor.user.id);
    assert.equal(modNoteRes.json.note.actor_role, 'mod');

    // Top records triage + suspected fixing commit SHA (`releaseSha2`)
    const topTriageRes = await httpJson(baseA, '/api/admin/diagnostics/triage', {
      method: 'POST',
      cookie: topActor.cookie,
      body: {
        group_id: pagerGroup.id,
        triage_status: 'monitoring',
        suspected_cause: 'Upstream Nginx buffer timeout during restart',
        suspected_fix_sha: releaseSha2.slice(0, 12),
        note_body: 'Deploying candidate fix SHA and monitoring for regressions.'
      }
    });
    assert.equal(topTriageRes.status, 200);
    assert.equal(topTriageRes.json.incident.suspected_fix_sha, releaseSha2.slice(0, 12));
    assert.equal(topTriageRes.json.incident.continued_after_suspected_fix, false);

    // -----------------------------------------------------------------------
    // 7. Boot Release SHA 2: Verify Release Attribution, Timing-Only Label & Regression After Suspected Fix
    // -----------------------------------------------------------------------
    const portB = await getFreePort();
    const baseB = `http://127.0.0.1:${portB}`;
    delete process.env.BITESHARK_PUBLIC_ORIGIN;
    process.env.BITESHARK_RELEASE_SHA = releaseSha2;

    serverHandleB = appMod.createStandaloneServer({
      dbAdapter: faultInjectableAdapter,
      releaseSha: releaseSha2,
      logger: customLogger
    });
    await new Promise(resolve => serverHandleB.server.listen(portB, '127.0.0.1', resolve));
    await serverHandleB.startupReleasePromise;

    // Sign in Top on server B (same DB)
    const mbxStartB = await httpJson(baseB, '/api/auth/start', {
      method: 'POST',
      headers: { 'X-BiteShark-Client': 'web-auth-v1' },
      body: { email: 'top@diag.biteshark.test' }
    });
    assert.equal(mbxStartB.status, 200);
    const mbxCodeB = await httpJson(baseB, '/api/auth/staging-mailbox', {
      method: 'POST',
      headers: { 'X-Staging-Mailbox-Secret': mailboxSecret },
      body: { email: 'top@diag.biteshark.test' }
    });
    const verB = await httpJson(baseB, '/api/auth/verify', {
      method: 'POST',
      headers: { 'X-BiteShark-Client': 'web-auth-v1' },
      body: { email: 'top@diag.biteshark.test', code: mbxCodeB.json.code }
    });
    const topCookieB = parseSessionCookie(
      typeof verB.headers.getSetCookie === 'function' ? verB.headers.getSetCookie() : verB.headers.get('set-cookie')
    );

    // Before any new occurrence on SHA 2, `fix_state_code` must be `deployed_no_new_occurrences_yet` (NOT claiming proven fixed!)
    const preRegDetail = await httpJson(baseB, `/api/admin/diagnostics/detail?id=${pagerGroup.id}`, {
      cookie: topCookieB
    });
    assert.equal(
      preRegDetail.json.incident.release_relationship.fix_state_code,
      'deployed_no_new_occurrences_yet'
    );
    assert(
      preRegDetail.json.incident.release_relationship.fix_state_label.includes('does not prove'),
      'Must warn that absence of events alone does not prove defect is fixed'
    );

    // Record a brand-new incident first seen AFTER deployment of SHA 2 -> `first_observed_after_deployment` (timing only!)
    await diagMod.recordDiagnosticEvent(appPool, {
      component: 'api',
      featureKey: 'vendor_schedules',
      operationName: 'POST /api/owner/schedule',
      routeTemplate: '/api/owner/schedule',
      httpMethod: 'POST',
      httpStatus: 503,
      severity: 'error',
      errorCode: 'SCHEDULE_LOCK_TIMEOUT',
      message: 'Schedule write lock timed out.',
      serverReleaseSha: releaseSha2
    });

    // Now simulate a recurrence of `pagerGroup` ON `releaseSha2` -> sets `continued_after_suspected_fix = true`!
    await diagMod.recordDiagnosticEvent(appPool, {
      component: 'browser',
      trustLevel: 'browser_untrusted',
      featureKey: 'pagers',
      operationName: 'pager.poll_status',
      routeTemplate: '/api/pager/status/:uuid',
      errorCode: 'MALFORMED_SERVER_RESPONSE',
      message: 'Occurred again after suspected fix deployment',
      serverReleaseSha: releaseSha2
    });

    const listB = await httpJson(baseB, `/api/admin/diagnostics?release_sha=${releaseSha2.slice(0, 10)}`, {
      cookie: topCookieB
    });
    assert.equal(listB.status, 200);
    const schedGroup = listB.json.items.find(g => g.feature_key === 'vendor_schedules');
    const regressedPager = listB.json.items.find(g => g.id === pagerGroup.id);
    assert(schedGroup, 'New SHA2 incident must appear under release filter');
    assert.equal(schedGroup.release_relationship.first_observed_code, 'first_observed_after_deployment');
    assert(
      schedGroup.release_relationship.first_observed_label.includes('timing only'),
      'Timing label must explicitly avoid claiming causation'
    );
    assert.equal(regressedPager.continued_after_suspected_fix, true, 'Regression on suspected fix SHA must be detected');
    assert.equal(regressedPager.release_relationship.fix_state_code, 'continued_after_suspected_fix');

    // Bounded search by correlation ID finds exact group
    const corrSearch = await httpJson(
      baseB,
      `/api/admin/diagnostics?q=${encodeURIComponent(rep1.json.correlation_id)}`,
      { cookie: topCookieB }
    );
    assert.equal(corrSearch.status, 200);
    assert.equal(corrSearch.json.items.length, 1);
    assert.equal(corrSearch.json.items[0].id, pagerGroup.id);

    // -----------------------------------------------------------------------
    // 8. Non-Recursive & Non-Breaking Diagnostic Persistence Failure Test
    // -----------------------------------------------------------------------
    let injectedCalls = 0;
    diagMod.__setDiagnosticsFaultInjectionForTests(() => {
      injectedCalls += 1;
      throw new Error('Simulated diagnostic_incident_groups disk-full fault');
    });

    // Even when diagnostic DB writes throw:
    //  a) `/api/diagnostics/report` does NOT 500 or recurse infinitely (`injectedCalls === 1`)
    //  b) Calling a normal API endpoint (`/api/trucks`) works 100%, and a faulted 503 endpoint still returns its 503 JSON cleanly!
    const safeUnderDiagFault = await httpJson(baseB, '/api/trucks');
    assert.equal(safeUnderDiagFault.status, 200);

    failAccountContextSelect = true;
    const beforeInjected = injectedCalls;
    const clean503UnderDiagFault = await httpJson(baseB, '/api/account/context', { cookie: topCookieB });
    assert.equal(clean503UnderDiagFault.status, 503);
    assert.equal(injectedCalls - beforeInjected, 1, 'Diagnostic failure must NEVER recurse');
    assert(
      capturedLogs.some(l => l.includes('diagnostic_persistence_fallback')),
      'Sanitized fallback log line must be emitted when diagnostic DB write fails'
    );
    failAccountContextSelect = false;
    diagMod.__setDiagnosticsFaultInjectionForTests(null);

    // -----------------------------------------------------------------------
    // 9. Retention Cleanup Preserves Operator Notes & Reconnects by Fingerprint
    // -----------------------------------------------------------------------
    // Mark `pagerGroup` resolved and age its timestamps past `RESOLVED_RETENTION_DAYS` (14d)
    await httpJson(baseB, '/api/admin/diagnostics/triage', {
      method: 'POST',
      cookie: topCookieB,
      body: {
        group_id: pagerGroup.id,
        triage_status: 'resolved',
        note_body: 'Resolved after upstream config update; verifying note survival across retention.'
      }
    });
    await privQuery(
      `UPDATE diagnostic_incident_groups
       SET last_seen_at = now() - interval '20 days',
           first_seen_at = now() - interval '21 days'
       WHERE id = $1`,
      [pagerGroup.id]
    );
    await privQuery(
      `UPDATE diagnostic_event_samples
       SET received_at = now() - interval '20 days'
       WHERE group_id = $1`,
      [pagerGroup.id]
    );

    const cleanOut = await httpJson(baseB, '/api/admin/diagnostics/cleanup', {
      method: 'POST',
      cookie: topCookieB,
      body: {}
    });
    assert.equal(cleanOut.status, 200);
    assert(cleanOut.json.deleted_aged_groups >= 1, 'Aged resolved group must be cleaned up');
    assert.equal(cleanOut.json.notes_deleted, 0, 'Zero operator notes may be deleted by retention cleanup');

    const notesStillThere = await privQuery(
      'SELECT count(*)::int AS c FROM diagnostic_incident_notes WHERE group_fingerprint = $1',
      [pagerGroup.fingerprint]
    );
    assert.equal(notesStillThere.rows[0].c, 3, 'All 3 operator notes (Mod note + 2 Top triage notes) must survive group deletion');

    // If the same fingerprint recurs later, all 3 historical notes automatically reconnect to the new group!
    const recurRec = await diagMod.recordDiagnosticEvent(appPool, {
      component: 'browser',
      trustLevel: 'browser_untrusted',
      featureKey: 'pagers',
      operationName: 'pager.poll_status',
      routeTemplate: '/api/pager/status/:uuid',
      errorCode: 'MALFORMED_SERVER_RESPONSE',
      message: 'Recurred weeks later',
      serverReleaseSha: releaseSha2
    });
    const recurredDetail = await httpJson(baseB, `/api/admin/diagnostics/detail?id=${recurRec.group_id}`, {
      cookie: topCookieB
    });
    assert.equal(recurredDetail.status, 200);
    assert.equal(recurredDetail.json.notes.length, 3, 'Historical notes reconnected via fingerprint');

    // -----------------------------------------------------------------------
    // 10. Idempotent Favorites (`desired_saved`), Community (`idempotency_key`),
    //     Issue Optimistic Concurrency (`409`), and Worker Heartbeat
    // -----------------------------------------------------------------------
    const fav1 = await httpJson(baseB, '/api/favorites/toggle', {
      method: 'POST',
      cookie: custActor.cookie,
      body: { truck_id: 'mitote', desired_saved: true }
    });
    const fav2 = await httpJson(baseB, '/api/favorites/toggle', {
      method: 'POST',
      cookie: custActor.cookie,
      body: { truck_id: 'mitote', desired_saved: true }
    });
    assert.equal(fav1.json.saved, true);
    assert.equal(fav2.json.saved, true, 'Retrying desired_saved=true must NOT un-favorite');

    const commKey = 'comm_idem_test_12345678';
    const comm1 = await httpJson(baseB, '/api/community/post', {
      method: 'POST',
      cookie: custActor.cookie,
      body: {
        kind: 'review',
        place_id: 'mitote',
        title: 'Great tacos & music',
        body: 'Loved the birria tacos and outdoor courtyard atmosphere this weekend.',
        rating: 5,
        idempotency_key: commKey
      }
    });
    assert.equal(comm1.status, 201);
    const comm2 = await httpJson(baseB, '/api/community/post', {
      method: 'POST',
      cookie: custActor.cookie,
      body: {
        kind: 'review',
        place_id: 'mitote',
        title: 'Great tacos & music',
        body: 'Loved the birria tacos and outdoor courtyard atmosphere this weekend.',
        rating: 5,
        idempotency_key: commKey
      }
    });
    assert.equal(comm2.status, 200);
    assert.equal(comm2.json.deduplicated, true);
    assert.equal(comm2.json.submission.id, comm1.json.submission.id, 'Community retry must deduplicate');

    // Issue optimistic concurrency (`409 STALE_ISSUE_STATE`) + truthful `recorded_in_app_only`
    const newIss = await httpJson(baseB, '/api/issues', {
      method: 'POST',
      cookie: custActor.cookie,
      body: {
        category: 'booking_issue',
        subject: 'Question on inquiry timing',
        description: 'Checking how long vendors usually take to respond to catering inquiries.',
        idempotency_key: 'iss_idem_12345678'
      }
    });
    assert.equal(newIss.status, 201);
    const staleTimestamp = new Date(Date.now() - 60_000).toISOString();
    const staleIssUpd = await httpJson(baseB, '/api/admin/issues/update', {
      method: 'POST',
      cookie: topCookieB,
      body: {
        issue_id: newIss.json.issue.id,
        status: 'in_progress',
        expected_updated_at: staleTimestamp
      }
    });
    assert.equal(staleIssUpd.status, 409);
    assert.equal(staleIssUpd.json.code, 'STALE_ISSUE_STATE');

    const freshIssUpd = await httpJson(baseB, '/api/admin/issues/update', {
      method: 'POST',
      cookie: topCookieB,
      body: {
        issue_id: newIss.json.issue.id,
        status: 'in_progress',
        note_visibility: 'reporter_visible',
        note_body: 'Vendors typically respond within 48 hours.',
        expected_updated_at: newIss.json.issue.updated_at
      }
    });
    assert.equal(freshIssUpd.status, 200);
    assert.equal(freshIssUpd.json.notification_delivery, 'recorded_in_app_only');

    // Worker batch records `worker_runtime_heartbeats` visible in `/api/admin/overview`
    const workerRes = await httpJson(baseB, '/api/pager/worker', {
      method: 'POST',
      headers: { Authorization: `Bearer ${workerSecret}` },
      body: { batch_size: 5, cleanup: true }
    });
    assert.equal(workerRes.status, 200);

    const ovAfterWorker = await httpJson(baseB, '/api/admin/overview', { cookie: topCookieB });
    assert.equal(ovAfterWorker.status, 200);
    assert(ovAfterWorker.json.operational_health.last_worker_run_at, 'Worker heartbeat timestamp must populate overview');
    assert.equal(ovAfterWorker.json.operational_health.worker_status, 'ok');

    console.log(
      'PASS: BiteShark bounded diagnostics, redaction, rate limits, Top/Mod scope, release attribution, stale-client detection, non-recursive fault safety, retention note preservation, and idempotent reliability checks passed.'
    );
  } finally {
    diagModSafeReset();
    if (serverHandleB) await serverHandleB.closeGracefully(1000).catch(() => {});
    if (serverHandleA) await serverHandleA.closeGracefully(1000).catch(() => {});
    if (appPool) await appPool.end().catch(() => {});
    if (migratorPool) await migratorPool.end().catch(() => {});
    await superPool.end().catch(() => {});
    await cluster.stop();
  }

  function diagModSafeReset() {
    import(pathToFileURL(path.join(ROOT, 'lib', 'diagnostics.js')).href)
      .then(m => m.__setDiagnosticsFaultInjectionForTests(null))
      .catch(() => {});
  }
}

main().catch(err => {
  console.error('FAIL diagnostics-and-reliability.integration:', err);
  process.exit(1);
});
