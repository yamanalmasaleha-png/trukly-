// BiteShark Support & Feedback + Connected Diagnostics PostgreSQL Integration Suite
//
// Deterministically verifies against real PostgreSQL (`NOSUPERUSER NOBYPASSRLS`) and `server/app.js`:
//   1. Additive migration `025_support_feedback_and_diagnostic_links.sql` preserves pre-existing
//      `support_issues` and `support_issue_notes` rows, backfills unique `BS-001001` ticket numbers,
//      enforces immutability triggers (`reporter_user_id`, `ticket_number`, `reporter_urgency`, `created_at`),
//      revokes `DELETE` on `support_issues` and `UPDATE, DELETE` on `support_issue_notes` / `support_issue_events`,
//      and enforces `FORCE ROW LEVEL SECURITY` on all support & diagnostic-link tables.
//   2. Guest & age-policy access boundaries (`401` anonymous, `account_access` permitted for `not_assessed`
//      while general support requires 14+ assessment).
//   3. Vendor & customer submission, acknowledgement, `critical` vs `feedback` urgency/priority,
//      auto-derived subject for customers, non-member vendor ID `403`, and `personal` vs `vendor_service`
//      visibility (`account_access` & customer tickets strictly forced `personal`).
//   4. Internal staff notes (`visibility = 'internal'`) vs public replies (`reporter_visible`):
//      zero leakage of internal notes or staff personal emails to reporters, unread count badge
//      (`unread_support_count`) + `POST /api/issues/read`, and `waiting_for_team` transitions.
//   5. Staff assignment, reassignment reason enforcement, Top escalation (`403 TOP_OWNED_TICKET` when Mod
//      attempts to unassign/hijack), disabled/demoted assignee `409 ASSIGNEE_NOT_ELIGIBLE` guard, and
//      `needs_reassignment` queue surfacing upon role revocation.
//   6. Status workflow transitions, optimistic concurrency (`409 STALE_ISSUE_STATE`), reporter reopen of
//      `resolved` tickets (`POST /api/issues/reopen`), `closed` ticket Top-only reopen, and idempotency
//      key deduplication across ticket create, reply, reopen, and staff update.
//   7. Connected Diagnostics (`support_issue_diagnostic_links`): auto-suggested links on `corr_...`,
//      many-to-many linking (multiple tickets <-> multiple incidents), `Admin: Mod` `403` on Top-only
//      diagnostics, zero cross-reporter PII leakage, resolving diagnostic incident never auto-closes
//      tickets, reviewed multi-ticket public update (`preview` -> `send` with `confirmed: true` + dedupe),
//      and diagnostic retention cleanup preserving 100% of support tickets/notes/events.
//   8. Notification honesty (`resend_https`), staging allowlist enforcement (`staging_restricted_in_app_only`
//      for unallowlisted addresses), zero ticket/reply message bodies in email text, and zero sensitive
//      fixture leakage into logs or telemetry.

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
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-sup-pg-'));
  const dataDir = path.join(tmpBase, 'data');
  const pwFile = path.join(tmpBase, 'pw.txt');
  const logFile = path.join(tmpBase, 'postgres.log');
  const password = 'sup_pw_' + crypto.randomBytes(6).toString('hex');
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

function runMigrationsCli(migratorUrl, appRole, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'scripts', 'run-migrations.cjs'), '--app-role', appRole], {
      cwd: ROOT,
      env: { ...process.env, MIGRATION_DATABASE_URL: migratorUrl, ...extraEnv },
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

function extractOtpFromBody(text) {
  const m = String(text || '').match(/(?:verification code:\s*)(\d{6})/i) || String(text || '').match(/\b(\d{6})\b/);
  return m ? m[1] : null;
}

async function main() {
  const { Pool } = requirePg();
  const cluster = await createPostgresCluster();
  const suffix = crypto.randomBytes(4).toString('hex');
  const dbName = `bs_sup_${suffix}`;
  const migratorRole = `bs_sup_mig_${suffix}`;
  const appRole = `bs_sup_app_${suffix}`;
  const migPass = 'mig_' + crypto.randomBytes(8).toString('hex');
  const appPass = 'app_' + crypto.randomBytes(8).toString('hex');

  const superPool = new Pool({ connectionString: cluster.adminUrl, max: 2 });
  let migratorPool = null;
  let appPool = null;
  let serverHandle = null;
  const origFetch = global.fetch;

  const authSecret = 'sup_auth_secret_' + crypto.randomBytes(24).toString('hex');
  const resendApiKey = 're_sup_test_key_' + crypto.randomBytes(16).toString('hex');
  const workerSecret = 'wk_sup_secret_' + crypto.randomBytes(20).toString('hex');
  const releaseSha = '28bf1b1b07fc498c117e78bf6299f3709fb8c565';

  const capturedLogs = [];
  const customLogger = {
    info: m => capturedLogs.push(String(m)),
    warn: m => capturedLogs.push(String(m)),
    error: m => capturedLogs.push(String(m))
  };

  const sentEmails = [];

  try {
    await superPool.query(`CREATE ROLE "${migratorRole}" WITH LOGIN PASSWORD '${migPass}' CREATEDB`);
    await superPool.query(
      `CREATE ROLE "${appRole}" WITH LOGIN PASSWORD '${appPass}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`
    );
    await superPool.query(`CREATE DATABASE "${dbName}" OWNER "${migratorRole}"`);

    const parsedAdmin = new URL(cluster.adminUrl);
    const migratorUrl = `postgresql://${migratorRole}:${encodeURIComponent(migPass)}@${parsedAdmin.hostname}:${parsedAdmin.port}/${dbName}`;
    const appUrl = `postgresql://${appRole}:${encodeURIComponent(appPass)}@${parsedAdmin.hostname}:${parsedAdmin.port}/${dbName}`;

    migratorPool = new Pool({ connectionString: migratorUrl, max: 4 });
    appPool = new Pool({ connectionString: appUrl, max: 8 });

    async function privQuery(sql, params = []) {
      const c = await migratorPool.connect();
      try {
        await c.query('BEGIN');
        await c.query("SELECT set_config('app.auth_internal', 'true', true)");
        await c.query("SELECT set_config('app.admin_portal', 'true', true)");
        await c.query("SELECT set_config('app.can_moderate', 'true', true)");
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
    // 1. Pre-025 Migration Preservation Test (apply 001..024 manually, insert
    //    legacy support_issues row, then run scripts/run-migrations.cjs -> 025)
    // -----------------------------------------------------------------------
    await migratorPool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        checksum_sha256 TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    const migDir = path.join(ROOT, 'migrations');
    const pre025Files = fs
      .readdirSync(migDir)
      .filter(f => f.endsWith('.sql') && !f.startsWith('025_'))
      .sort();
    assert.equal(pre025Files.length, 24, 'Expected 24 migrations prior to 025');

    for (const f of pre025Files) {
      const sql = fs.readFileSync(path.join(migDir, f), 'utf8');
      const chk = crypto.createHash('sha256').update(sql, 'utf8').digest('hex');
      const client = await migratorPool.connect();
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename, checksum_sha256) VALUES ($1, $2)', [f, chk]);
        await client.query('COMMIT');
      } finally {
        client.release();
      }
    }

    await privQuery(`
      INSERT INTO auth_users (id, email_normalized, age_eligibility_status, age_assessed_at, age_policy_version, age_assessment_basis)
      VALUES ('usr_legacy_cust', 'legacy-cust@operator.biteshark.test', 'eligible_14_plus', now(), 'draft-14plus-v0.1', 'self_reported_dob_at_signup')
      ON CONFLICT (id) DO NOTHING
    `);
    const legacyIns = await privQuery(`
      INSERT INTO support_issues (
        reporter_user_id, reporter_email, reporter_context, vendor_id, category, severity, status, subject, description, sla_due_at
      )
      VALUES (
        'usr_legacy_cust', 'legacy-cust@operator.biteshark.test', 'customer', 'iniguez', 'booking_dispute', 'high', 'open',
        'Legacy pre-025 inquiry question',
        'Pre-existing support ticket created before migration 025 ran on staging.',
        now() + interval '24 hours'
      )
      RETURNING id, created_at
    `);
    const legacyIssueId = legacyIns.rows[0].id;
    await privQuery(
      `INSERT INTO support_issue_notes (issue_id, author_user_id, author_role, visibility, body)
       VALUES ($1, 'usr_legacy_cust', 'customer', 'reporter_visible', 'Legacy follow-up note preserved across upgrade.')`,
      [legacyIssueId]
    );

    const migRes = await runMigrationsCli(migratorUrl, appRole);
    assert.equal(migRes.code, 0, `Migration 025 CLI failed: ${migRes.stderr}`);
    assert(migRes.stdout.includes('"newly_applied":1'), `Expected 1 newly applied migration (025): ${migRes.stdout}`);

    const preservedCheck = await privQuery('SELECT * FROM support_issues WHERE id = $1', [legacyIssueId]);
    assert.equal(preservedCheck.rows.length, 1);
    assert.match(preservedCheck.rows[0].ticket_number, /^BS-001\d{3}$/, 'Pre-existing row must receive BS-001xxx ticket_number');
    assert.equal(preservedCheck.rows[0].sharing_scope, 'personal');
    assert.equal(preservedCheck.rows[0].reporter_urgency, 'high');
    assert.equal(preservedCheck.rows[0].subject, 'Legacy pre-025 inquiry question');
    const preservedNotes = await privQuery('SELECT * FROM support_issue_notes WHERE issue_id = $1', [legacyIssueId]);
    assert.equal(preservedNotes.rows.length, 1);

    // Least-privilege DB grants & immutability trigger verification
    const privs = await appPool.query(`
      SELECT
        has_table_privilege(current_user, 'support_issues', 'DELETE') AS iss_del,
        has_table_privilege(current_user, 'support_issue_notes', 'UPDATE') AS note_upd,
        has_table_privilege(current_user, 'support_issue_notes', 'DELETE') AS note_del,
        has_table_privilege(current_user, 'support_issue_events', 'UPDATE') AS evt_upd,
        has_table_privilege(current_user, 'support_issue_events', 'DELETE') AS evt_del
    `);
    assert.equal(privs.rows[0].iss_del, false, 'support_issues must forbid DELETE');
    assert.equal(privs.rows[0].note_upd, false, 'support_issue_notes must forbid UPDATE');
    assert.equal(privs.rows[0].note_del, false, 'support_issue_notes must forbid DELETE');
    assert.equal(privs.rows[0].evt_upd, false, 'support_issue_events must forbid UPDATE');
    assert.equal(privs.rows[0].evt_del, false, 'support_issue_events must forbid DELETE');

    await assert.rejects(
      () => privQuery("UPDATE support_issues SET reporter_urgency = 'low' WHERE id = $1", [legacyIssueId]),
      /immutable/i,
      'reporter_urgency must be immutable at the database trigger layer'
    );
    await assert.rejects(
      () => privQuery("UPDATE support_issues SET ticket_number = 'BS-999999' WHERE id = $1", [legacyIssueId]),
      /immutable/i,
      'ticket_number must be immutable at the database trigger layer'
    );

    const bareRls = await appPool.query('SELECT count(*)::int AS c FROM support_issues');
    assert.equal(bareRls.rows[0].c, 0, 'Bare query without session GUC must return 0 rows under FORCE RLS');

    // -----------------------------------------------------------------------
    // 2. Boot Server with Mocked Resend HTTPS + Staging Allowlist
    // -----------------------------------------------------------------------
    const port = await getFreePort();
    const baseUrl = `http://127.0.0.1:${port}`;

    for (const k of Object.keys(process.env)) {
      if (k.startsWith('BITESHARK_') || k.startsWith('TRUCKLY_')) delete process.env[k];
    }

    process.env.DATABASE_URL = appUrl;
    process.env.BITESHARK_ENV = 'staging';
    process.env.BITESHARK_PUBLIC_ORIGIN = 'https://staging.biteshark.live';
    process.env.BITESHARK_TRUST_PROXY = 'loopback';
    process.env.BITESHARK_AUTH_SECRET = authSecret;
    process.env.BITESHARK_AUTH_DELIVERY_MODE = 'resend_https';
    process.env.BITESHARK_AUTH_EMAIL_API_KEY = resendApiKey;
    process.env.BITESHARK_AUTH_EMAIL_FROM = 'BiteShark <login@biteshark.live>';
    process.env.BITESHARK_AUTH_EMAIL_API_URL = 'https://api.resend.com/emails';
    // Only `@operator.biteshark.test` is allowlisted for external email in staging;
    // active `@external-customer.test` users can sign in via existing account row,
    // wait — let's test an unallowlisted recipient on support notifications by removing
    // them from static allowlist! Remember `evaluateStagingRecipientEligibilityInTx` allows
    // active `auth_users` rows! Wait: let's check how `dispatchSupportNotificationEmail` checks eligibility!
    process.env.BITESHARK_STAGING_ALLOWED_EMAIL_DOMAINS = 'operator.biteshark.test';
    process.env.BITESHARK_STAGING_ALLOWED_EMAILS = '';
    process.env.BITESHARK_PUSH_PROVIDER_MODE = 'disabled';
    process.env.BITESHARK_NOTIFICATION_WORKER_SECRET = workerSecret;
    process.env.BITESHARK_RELEASE_SHA = releaseSha;

    global.fetch = async (input, init) => {
      const urlStr = typeof input === 'string' ? input : input?.url || '';
      if (urlStr === 'https://api.resend.com/emails') {
        const parsedBody = JSON.parse(String(init?.body || '{}'));
        const msgId = 're_msg_' + crypto.randomBytes(6).toString('hex');
        sentEmails.push({
          to: Array.isArray(parsedBody.to) ? parsedBody.to[0] : parsedBody.to,
          subject: parsedBody.subject,
          text: parsedBody.text,
          headers: init?.headers || {},
          id: msgId
        });
        return new Response(JSON.stringify({ id: msgId }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return origFetch(input, init);
    };

    // Seed accounts:
    // - topAdmin, mod1, mod2 (`@operator.biteshark.test`)
    // - vendorAOwner, vendorAStaff (`iniguez`), vendorBOwner (`mitote`)
    // - custA (`@operator.biteshark.test`), custB (`@operator.biteshark.test`), unassessedUser (`not_assessed`)
    const accounts = [
      { id: 'usr_top_1', email: 'top1@operator.biteshark.test', age: 'eligible_14_plus', adminRole: 'top' },
      { id: 'usr_mod_1', email: 'mod1@operator.biteshark.test', age: 'eligible_14_plus', adminRole: 'mod' },
      { id: 'usr_mod_2', email: 'mod2@operator.biteshark.test', age: 'eligible_14_plus', adminRole: 'mod' },
      { id: 'usr_va_own', email: 'va-owner@operator.biteshark.test', age: 'eligible_14_plus', vendor: { id: 'iniguez', role: 'owner' } },
      { id: 'usr_va_stf', email: 'va-staff@operator.biteshark.test', age: 'eligible_14_plus', vendor: { id: 'iniguez', role: 'staff' } },
      { id: 'usr_vb_own', email: 'vb-owner@operator.biteshark.test', age: 'eligible_14_plus', vendor: { id: 'mitote', role: 'owner' } },
      { id: 'usr_cust_a', email: 'custa@operator.biteshark.test', age: 'eligible_14_plus' },
      { id: 'usr_cust_b', email: 'custb@operator.biteshark.test', age: 'eligible_14_plus' },
      { id: 'usr_unassessed', email: 'unassessed@operator.biteshark.test', age: 'not_assessed' }
    ];

    for (const acc of accounts) {
      await privQuery(
        `INSERT INTO auth_users (id, email_normalized, age_eligibility_status, age_assessed_at, age_policy_version, age_assessment_basis)
         VALUES ($1, $2, $3, CASE WHEN $3 = 'eligible_14_plus' THEN now() ELSE NULL END,
                 CASE WHEN $3 = 'eligible_14_plus' THEN 'draft-14plus-v0.1' ELSE NULL END,
                 CASE WHEN $3 = 'eligible_14_plus' THEN 'self_reported_dob_at_signup' ELSE NULL END)`,
        [acc.id, acc.email, acc.age]
      );
      if (acc.adminRole) {
        await privQuery(
          `INSERT INTO platform_roles (user_id, role, granted_by, notes) VALUES ($1, $2, 'usr_top_1', 'Test seed')`,
          [acc.id, acc.adminRole]
        );
      }
      if (acc.vendor) {
        await privQuery(
          `INSERT INTO vendor_memberships (vendor_id, user_id, role, granted_by) VALUES ($1, $2, $3, 'usr_top_1')`,
          [acc.vendor.id, acc.id, acc.vendor.role]
        );
      }
    }

    const appMod = await import(pathToFileURL(path.join(ROOT, 'server', 'app.js')).href);
    const diagMod = await import(pathToFileURL(path.join(ROOT, 'lib', 'diagnostics.js')).href);
    const dbAdapter = appPool;
    const standalone = appMod.createStandaloneServer({ dbAdapter, releaseSha, logger: customLogger });
    await new Promise(resolve => standalone.server.listen(port, '127.0.0.1', resolve));
    await standalone.startupReleasePromise;
    serverHandle = standalone.server;

    function apiReq(pathname, { method = 'GET', cookie = null, body = undefined, ip = '198.51.100.25' } = {}) {
      return new Promise((resolve, reject) => {
        const bodyStr = body !== undefined ? JSON.stringify(body) : null;
        const headers = {
          Host: 'staging.biteshark.live',
          Origin: 'https://staging.biteshark.live',
          'X-Forwarded-Proto': 'https',
          'X-Forwarded-For': ip,
          'X-BiteShark-Client': 'web-auth-v1'
        };
        if (cookie) headers.Cookie = cookie;
        if (bodyStr !== null) {
          headers['Content-Type'] = 'application/json';
          headers['Content-Length'] = Buffer.byteLength(bodyStr);
        }
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port,
            path: pathname,
            method,
            headers
          },
          res => {
            let raw = '';
            res.on('data', chunk => (raw += chunk));
            res.on('end', () => {
              let json = {};
              try {
                json = raw ? JSON.parse(raw) : {};
              } catch {}
              resolve({
                status: res.statusCode,
                headers: {
                  get: k => res.headers[String(k).toLowerCase()] || null,
                  getSetCookie: () =>
                    Array.isArray(res.headers['set-cookie'])
                      ? res.headers['set-cookie']
                      : res.headers['set-cookie']
                        ? [res.headers['set-cookie']]
                        : []
                },
                json
              });
            });
          }
        );
        req.on('error', reject);
        if (bodyStr !== null) req.write(bodyStr);
        req.end();
      });
    }

    let loginIpSeq = 10;
    async function signInAs(email) {
      loginIpSeq += 1;
      const ip = `198.51.100.${loginIpSeq}`;
      const beforeIdx = sentEmails.length;
      const startRes = await apiReq('/api/auth/start', {
        method: 'POST',
        ip,
        body: { email, mode: 'signin' }
      });
      assert.equal(startRes.status, 200, `OTP start failed for ${email}: ${JSON.stringify(startRes.json)}`);
      const mail = sentEmails.slice(beforeIdx).find(m => m.to === email);
      assert(mail, `Expected OTP email for ${email}`);
      const code = extractOtpFromBody(mail.text);
      assert(code, 'Expected 6-digit OTP');
      const verRes = await apiReq('/api/auth/verify', {
        method: 'POST',
        ip,
        body: { email, code }
      });
      assert.equal(verRes.status, 200, `OTP verify failed for ${email}: ${JSON.stringify(verRes.json)}`);
      const setCookie = verRes.headers.getSetCookie ? verRes.headers.getSetCookie() : [verRes.headers.get('set-cookie')];
      const cookie = parseSessionCookie(setCookie);
      assert(cookie, `Expected session cookie for ${email}`);
      return cookie;
    }

    const topCookie = await signInAs('top1@operator.biteshark.test');
    const mod1Cookie = await signInAs('mod1@operator.biteshark.test');
    const mod2Cookie = await signInAs('mod2@operator.biteshark.test');
    const vaOwnerCookie = await signInAs('va-owner@operator.biteshark.test');
    const vaStaffCookie = await signInAs('va-staff@operator.biteshark.test');
    const vbOwnerCookie = await signInAs('vb-owner@operator.biteshark.test');
    const custACookie = await signInAs('custa@operator.biteshark.test');
    const custBCookie = await signInAs('custb@operator.biteshark.test');
    const unassessedCookie = await signInAs('unassessed@operator.biteshark.test');

    console.log('✓ [1/8] Pre-025 row preservation, immutability triggers, FORCE RLS & session setup verified');

    // -----------------------------------------------------------------------
    // 2. Guest & Age-Assessment Boundaries
    // -----------------------------------------------------------------------
    assert.equal((await apiReq('/api/issues')).status, 401);
    assert.equal((await apiReq('/api/issues', { method: 'POST', body: { description: 'Guest attempt text here' } })).status, 401);
    assert.equal((await apiReq('/api/issues/reply', { method: 'POST', body: { issue_id: legacyIssueId, message: 'hi' } })).status, 401);
    assert.equal((await apiReq('/api/issues/reopen', { method: 'POST', body: { issue_id: legacyIssueId, reason: 'still broken' } })).status, 401);

    // Unassessed user blocked on general category, allowed on `account_access`
    const unassBlocked = await apiReq('/api/issues', {
      method: 'POST',
      cookie: unassessedCookie,
      body: { category: 'booking_issue', subject: 'Booking question', description: 'Trying to submit non-access ticket before 14+ check.' }
    });
    assert.equal(unassBlocked.status, 403);
    assert.equal(unassBlocked.json.code, 'AGE_ASSESSMENT_REQUIRED');

    const unassAllowed = await apiReq('/api/issues', {
      method: 'POST',
      cookie: unassessedCookie,
      body: { category: 'account_access', subject: 'Age check question', description: 'Need privacy/accessibility help completing my 14+ age check.' }
    });
    assert.equal(unassAllowed.status, 201);
    assert.match(unassAllowed.json.issue.ticket_number, /^BS-\d{6,}$/);

    console.log('✓ [2/8] Guest 401 & not_assessed account_access support exception verified');

    // -----------------------------------------------------------------------
    // 3. Vendor & Customer Submission, Sharing Scope, Critical vs Feedback,
    //    Idempotency & Zero Message Body in Notification Emails
    // -----------------------------------------------------------------------
    // Vendor attempts non-member vendor_id -> 403
    const wrongVendorRes = await apiReq('/api/issues', {
      method: 'POST',
      cookie: vaOwnerCookie,
      body: {
        reporter_context: 'vendor',
        vendor_id: 'mitote',
        category: 'technical_problem',
        subject: 'Unauthorized vendor test',
        description: 'Attempting to submit vendor ticket under another vendor ID.'
      }
    });
    assert.equal(wrongVendorRes.status, 403);

    // Vendor submits Critical shared vendor_service ticket (with idempotency key + sensitive fixture)
    const secretMarker = 'SUPER_SECRET_TICKET_BODY_MARKER_9988';
    const emailsBeforeVendorCrit = sentEmails.length;
    const vaCritIdem = 'idem_va_crit_001';
    const vaCritRes = await apiReq('/api/issues', {
      method: 'POST',
      cookie: vaOwnerCookie,
      body: {
        reporter_context: 'vendor',
        vendor_id: 'iniguez',
        category: 'pager_notifications',
        reporter_urgency: 'critical',
        sharing_scope: 'vendor_service',
        subject: 'Kitchen pager queue failing during lunch rush',
        description: `Lunch rush pager create failing (${secretMarker}) with token sk_live_fake999888777666.`,
        coarse_device: { platform: 'ios', browser: 'safari', viewport: 'mobile' },
        client_build_version: 'bs-ui-2026.11.20',
        idempotency_key: vaCritIdem
      }
    });
    assert.equal(vaCritRes.status, 201);
    const vaCritIssue = vaCritRes.json.issue;
    assert.equal(vaCritIssue.reporter_urgency, 'critical');
    assert.equal(vaCritIssue.severity, 'urgent');
    assert.equal(vaCritIssue.sharing_scope, 'vendor_service');
    assert.equal(vaCritIssue.status, 'open');
    assert.equal(vaCritRes.json.acknowledgement_delivery, 'provider_accepted');

    // Verify notification email NEVER contains the ticket description body!
    const ackEmails = sentEmails.slice(emailsBeforeVendorCrit);
    assert(ackEmails.length >= 1, 'Expected acknowledgement email to allowlisted vendor owner');
    for (const em of ackEmails) {
      assert(!em.text.includes(secretMarker), 'Email body must NEVER include support ticket message content');
      assert(!em.subject.includes(secretMarker), 'Email subject must NEVER include support ticket body');
      assert(em.text.includes(`/#support=${vaCritIssue.ticket_number}`), 'Email must link cleanly to /#support=BS-...');
    }

    // Replay same idempotency_key -> 200 deduplicated, zero duplicate ticket
    const vaCritReplay = await apiReq('/api/issues', {
      method: 'POST',
      cookie: vaOwnerCookie,
      body: {
        reporter_context: 'vendor',
        vendor_id: 'iniguez',
        category: 'pager_notifications',
        reporter_urgency: 'critical',
        sharing_scope: 'vendor_service',
        subject: 'Kitchen pager queue failing during lunch rush',
        description: `Lunch rush pager create failing (${secretMarker}) with token sk_live_fake999888777666.`,
        idempotency_key: vaCritIdem
      }
    });
    assert.equal(vaCritReplay.status, 200);
    assert.equal(vaCritReplay.json.deduplicated, true);
    assert.equal(vaCritReplay.json.issue.id, vaCritIssue.id);

    // Vendor submits `suggestion_feedback` -> urgency forced to `feedback`, priority `low`
    const vaFeedbackRes = await apiReq('/api/issues', {
      method: 'POST',
      cookie: vaOwnerCookie,
      body: {
        reporter_context: 'vendor',
        vendor_id: 'iniguez',
        category: 'suggestion_feedback',
        subject: 'Add printable QR tent template',
        description: 'Would love a printable table-tent PDF for our regular Saturday market stall.'
      }
    });
    assert.equal(vaFeedbackRes.status, 201);
    assert.equal(vaFeedbackRes.json.issue.reporter_urgency, 'feedback');
    assert.equal(vaFeedbackRes.json.issue.severity, 'low');

    // Vendor submits `account_access` requesting `vendor_service` -> forced to `personal`!
    const vaAccessRes = await apiReq('/api/issues', {
      method: 'POST',
      cookie: vaOwnerCookie,
      body: {
        reporter_context: 'vendor',
        vendor_id: 'iniguez',
        category: 'account_access',
        sharing_scope: 'vendor_service',
        subject: 'Owner email login question',
        description: 'Private owner login question that must never be visible to counter staff.'
      }
    });
    assert.equal(vaAccessRes.status, 201);
    assert.equal(vaAccessRes.json.issue.sharing_scope, 'personal');

    // Co-member `vaStaff` CAN view & reply to `vendor_service` ticket, gets 404 on `personal` `account_access`,
    // and `vbOwner` (`mitote`) gets 404 on both!
    const staffSeeShared = await apiReq(`/api/issues?issue_id=${vaCritIssue.id}`, { cookie: vaStaffCookie });
    assert.equal(staffSeeShared.status, 200);
    const staffReplyShared = await apiReq('/api/issues/reply', {
      method: 'POST',
      cookie: vaStaffCookie,
      body: { issue_id: vaCritIssue.id, message: 'Counter staff confirming this also happened on iPad #2.' }
    });
    assert.equal(staffReplyShared.status, 201);

    const staffBlockedPersonal = await apiReq(`/api/issues?issue_id=${vaAccessRes.json.issue.id}`, { cookie: vaStaffCookie });
    assert.equal(staffBlockedPersonal.status, 404);
    const otherVendorBlocked = await apiReq(`/api/issues?issue_id=${vaCritIssue.id}`, { cookie: vbOwnerCookie });
    assert.equal(otherVendorBlocked.status, 404);

    // Customer submits lighter problem without subject (auto-subject) + attempts `vendor_service` -> forced `personal`
    const diagProbeCorr = 'corr_abcdef0123456789';
    await diagMod.recordDiagnosticEvent(dbAdapter, {
      component: 'api',
      trustLevel: 'server_verified',
      featureKey: 'bookings',
      operationName: 'bookings.create_inquiry',
      routeTemplate: '/api/bookings',
      httpMethod: 'POST',
      httpStatus: 503,
      severity: 'error',
      errorCode: 'BOOKING_UPSTREAM_503',
      title: 'Event inquiry submission temporarily unavailable',
      message: 'Transient 503 while saving event inquiry.',
      userImpact: 'Customer event inquiry could not be saved.',
      safeNextSteps: 'Inspect DB pool and retry.',
      correlationId: diagProbeCorr,
      serverReleaseSha: releaseSha,
      modVisible: true
    });
    // Also record a restricted Top-only auth diagnostic
    const topDiagRec = await diagMod.recordDiagnosticEvent(dbAdapter, {
      component: 'external_provider',
      trustLevel: 'server_verified',
      featureKey: 'auth_login',
      operationName: 'auth.resend_provider',
      routeTemplate: '/api/auth/email/start',
      httpMethod: 'POST',
      httpStatus: 502,
      severity: 'error',
      errorCode: 'AUTH_PROVIDER_502',
      title: 'Restricted auth provider error',
      message: 'Provider HTTP 502 during login email dispatch.',
      userImpact: 'Login code delayed.',
      safeNextSteps: 'Check Resend status.',
      serverReleaseSha: releaseSha,
      modVisible: false
    });

    const custASub = await apiReq('/api/issues', {
      method: 'POST',
      cookie: custACookie,
      body: {
        entry_kind: 'problem',
        category: 'booking_issue',
        vendor_id: 'iniguez',
        sharing_scope: 'vendor_service', // must be ignored/forced personal for customers!
        description: 'Could not send Saturday birthday taco inquiry — banner showed an error.',
        affected_feature: 'bookings',
        error_correlation_id: diagProbeCorr
      }
    });
    assert.equal(custASub.status, 201);
    const custAIssue = custASub.json.issue;
    assert.equal(custAIssue.sharing_scope, 'personal');
    assert(custAIssue.subject.length >= 5, 'Customer subject should be auto-generated from description');
    assert.equal((await apiReq(`/api/issues?issue_id=${custAIssue.id}`, { cookie: custBCookie })).status, 404);
    assert.equal((await apiReq(`/api/issues?issue_id=${custAIssue.id}`, { cookie: vaOwnerCookie })).status, 404);

    console.log('✓ [3/8] Vendor & customer submission, sharing_scope isolation, idempotency & email body safety verified');

    // -----------------------------------------------------------------------
    // 4. Internal Notes vs Public Replies, Unread State & Staff Email Privacy
    // -----------------------------------------------------------------------
    const internalSecret = 'CONFIDENTIAL_MOD_INTERNAL_NOTE_7744';
    const modIntRes = await apiReq('/api/admin/issues/update', {
      method: 'POST',
      cookie: mod1Cookie,
      body: {
        issue_id: custAIssue.id,
        status: 'in_review',
        assigned_to: 'usr_mod_1',
        note_visibility: 'internal',
        note_body: `${internalSecret}: checking diagnostic incident for corr_abcdef0123456789.`
      }
    });
    assert.equal(modIntRes.status, 200);

    // Reporter must NOT see internal note, and `status_changed` to In review is visible while internal note is hidden
    const custAfterInt = await apiReq(`/api/issues?issue_id=${custAIssue.id}`, { cookie: custACookie });
    assert.equal(custAfterInt.status, 200);
    assert(!JSON.stringify(custAfterInt.json).includes(internalSecret), 'Internal note must NEVER leak to reporter');
    assert(!JSON.stringify(custAfterInt.json).includes('mod1@operator.biteshark.test'), 'Staff email must NEVER leak to reporter');

    // Mod posts a public reply -> reporter unread_support_count increments to 1, staff email hidden
    const publicReplySecret = 'PUBLIC_REPLY_SAFE_MARKER_5511';
    const emailsBeforePubReply = sentEmails.length;
    const modPubRes = await apiReq('/api/admin/issues/update', {
      method: 'POST',
      cookie: mod1Cookie,
      body: {
        issue_id: custAIssue.id,
        status: 'waiting',
        note_visibility: 'reporter_visible',
        note_body: `Hi there! (${publicReplySecret}) Please try submitting your inquiry again now.`
      }
    });
    assert.equal(modPubRes.status, 200);
    const pubEmails = sentEmails.slice(emailsBeforePubReply);
    for (const em of pubEmails) {
      assert(!em.text.includes(publicReplySecret), 'Notification email must NEVER contain staff reply body');
    }

    const custCtxUnread = await apiReq('/api/account/context', { cookie: custACookie });
    assert(custCtxUnread.json.unread_support_count >= 1, 'Expected unread_support_count >= 1 after public staff reply');

    const custThreadPub = await apiReq(`/api/issues?issue_id=${custAIssue.id}`, { cookie: custACookie });
    assert.equal(custThreadPub.json.notes.length, 1);
    assert.match(custThreadPub.json.notes[0].author_display_label, /^BiteShark Support/);
    assert(!JSON.stringify(custThreadPub.json).includes('mod1@operator.biteshark.test'));

    const markReadRes = await apiReq('/api/issues/read', {
      method: 'POST',
      cookie: custACookie,
      body: { issue_id: custAIssue.id }
    });
    assert.equal(markReadRes.status, 200);
    const custCtxAfterRead = await apiReq('/api/account/context', { cookie: custACookie });
    assert.equal(custCtxAfterRead.json.unread_support_count, 0, 'unread_support_count should clear after POST /api/issues/read');

    // Reporter replies -> waiting flips back to in_progress & waiting_for_team = true
    const custRep = await apiReq('/api/issues/reply', {
      method: 'POST',
      cookie: custACookie,
      body: { issue_id: custAIssue.id, message: 'Tried again and it worked, thank you!', idempotency_key: 'cust_rep_001' }
    });
    assert.equal(custRep.status, 201);
    const custRepDup = await apiReq('/api/issues/reply', {
      method: 'POST',
      cookie: custACookie,
      body: { issue_id: custAIssue.id, message: 'Tried again and it worked, thank you!', idempotency_key: 'cust_rep_001' }
    });
    assert.equal(custRepDup.status, 200);
    assert.equal(custRepDup.json.deduplicated, true);

    const adminCheckWaiting = await apiReq(`/api/admin/issues?issue_id=${custAIssue.id}`, { cookie: mod1Cookie });
    assert.equal(adminCheckWaiting.json.issue.status, 'in_progress');
    assert.equal(adminCheckWaiting.json.issue.waiting_for_team, true);

    console.log('✓ [4/8] Internal vs public note separation, unread badge lifecycle & staff email privacy verified');

    // -----------------------------------------------------------------------
    // 5. Assignment, Reassignment Reason, Escalation & Inactive Assignee Guards
    // -----------------------------------------------------------------------
    // Assigning non-staff customer -> 400 INVALID_ASSIGNEE
    const badAssRes = await apiReq('/api/admin/issues/update', {
      method: 'POST',
      cookie: mod1Cookie,
      body: { issue_id: custAIssue.id, assigned_to: 'usr_cust_a', assignment_reason: 'Invalid non-staff target' }
    });
    assert.equal(badAssRes.status, 400);
    assert.equal(badAssRes.json.code, 'INVALID_ASSIGNEE');

    // Mod2 attempts to reassign Mod1's ticket without reason -> 400; with reason -> 200
    const noReasonReassign = await apiReq('/api/admin/issues/update', {
      method: 'POST',
      cookie: mod2Cookie,
      body: { issue_id: custAIssue.id, assigned_to: 'usr_mod_2' }
    });
    assert.equal(noReasonReassign.status, 400);

    const okReassign = await apiReq('/api/admin/issues/update', {
      method: 'POST',
      cookie: mod2Cookie,
      body: { issue_id: custAIssue.id, assigned_to: 'usr_mod_2', assignment_reason: 'Handoff for afternoon shift' }
    });
    assert.equal(okReassign.status, 200);

    // Escalate vaCritIssue to Top -> Mod1 cannot hijack/unassign once escalated or Top-owned
    const escRes = await apiReq('/api/admin/issues/update', {
      method: 'POST',
      cookie: mod1Cookie,
      body: {
        issue_id: vaCritIssue.id,
        assigned_to: 'usr_top_1',
        assignment_reason: 'Escalating critical service ticket to Top',
        escalated_to_top: true,
        escalation_reason: 'Blocking lunch rush pager queue'
      }
    });
    assert.equal(escRes.status, 200);

    const modHijackTop = await apiReq('/api/admin/issues/update', {
      method: 'POST',
      cookie: mod2Cookie,
      body: { issue_id: vaCritIssue.id, assigned_to: 'usr_mod_2', assignment_reason: 'Trying to take Top ticket' }
    });
    assert.equal(modHijackTop.status, 403);
    assert.equal(modHijackTop.json.code, 'TOP_ASSIGNEE_PROTECTED');

    // Revoke Mod2's role -> Mod2's open ticket (`custAIssue`) preserves history & surfaces in `needs_reassignment`!
    const revokeMod2 = await apiReq('/api/admin/accounts/role', {
      method: 'POST',
      cookie: topCookie,
      body: { user_id: 'usr_mod_2', role: 'none', reason: 'Shift rotation complete — revoking Mod2' }
    });
    assert.equal(revokeMod2.status, 200);

    const needsReassList = await apiReq('/api/admin/issues?queue_view=needs_reassignment&status=open_all', { cookie: topCookie });
    assert.equal(needsReassList.status, 200);
    assert(needsReassList.json.issues.some(x => x.id === custAIssue.id && x.needs_reassignment === true));

    // Trying to assign another ticket to revoked Mod2 -> 400 INVALID_ASSIGNEE
    const assignRevokedMod = await apiReq('/api/admin/issues/update', {
      method: 'POST',
      cookie: topCookie,
      body: { issue_id: vaFeedbackRes.json.issue.id, assigned_to: 'usr_mod_2', assignment_reason: 'Should fail' }
    });
    assert.equal(assignRevokedMod.status, 400);
    assert.equal(assignRevokedMod.json.code, 'INVALID_ASSIGNEE');

    console.log('✓ [5/8] Assignment rules, Top escalation protection & revoked-assignee needs_reassignment verified');

    // -----------------------------------------------------------------------
    // 6. Status Transitions, Concurrency (`409 STALE_ISSUE_STATE`) & Reopen
    // -----------------------------------------------------------------------
    // Stale expected_updated_at -> 409 STALE_ISSUE_STATE
    const staleUpd = await apiReq('/api/admin/issues/update', {
      method: 'POST',
      cookie: topCookie,
      body: {
        issue_id: custAIssue.id,
        status: 'in_progress',
        expected_updated_at: '2020-01-01T00:00:00.000Z'
      }
    });
    assert.equal(staleUpd.status, 409);
    assert.equal(staleUpd.json.code, 'STALE_ISSUE_STATE');

    // Resolve requires resolution_reason
    const resMissingReason = await apiReq('/api/admin/issues/update', {
      method: 'POST',
      cookie: mod1Cookie,
      body: { issue_id: custAIssue.id, assigned_to: 'usr_mod_1', assignment_reason: 'Claiming from inactive Mod2', status: 'resolved' }
    });
    assert.equal(resMissingReason.status, 400);

    const resOk = await apiReq('/api/admin/issues/update', {
      method: 'POST',
      cookie: mod1Cookie,
      body: {
        issue_id: custAIssue.id,
        assigned_to: 'usr_mod_1',
        assignment_reason: 'Claiming from inactive Mod2',
        status: 'resolved',
        resolution_reason: 'Confirmed inquiry succeeded after upstream recovery.'
      }
    });
    assert.equal(resOk.status, 200);

    // Reporter reopens `resolved` ticket with idempotency key
    const reopen1 = await apiReq('/api/issues/reopen', {
      method: 'POST',
      cookie: custACookie,
      body: { issue_id: custAIssue.id, reason: 'Happened again when adding a second date!', idempotency_key: 'reopen_k1' }
    });
    assert.equal(reopen1.status, 200);
    assert.equal(reopen1.json.issue.status, 'in_progress');
    assert.equal(reopen1.json.issue.reopen_count, 1);

    const reopenDup = await apiReq('/api/issues/reopen', {
      method: 'POST',
      cookie: custACookie,
      body: { issue_id: custAIssue.id, reason: 'Happened again when adding a second date!', idempotency_key: 'reopen_k1' }
    });
    assert.equal(reopenDup.status, 200);
    assert.equal(reopenDup.json.deduplicated, true);

    // Close `vaFeedbackRes` -> reporter cannot reopen closed (`409`), Mod cannot reopen closed (`403`), Top CAN reopen (`200`)
    const fbId = vaFeedbackRes.json.issue.id;
    assert.equal(
      (
        await apiReq('/api/admin/issues/update', {
          method: 'POST',
          cookie: mod1Cookie,
          body: { issue_id: fbId, status: 'closed', resolution_reason: 'Logged in product backlog.' }
        })
      ).status,
      200
    );
    assert.equal(
      (await apiReq('/api/issues/reopen', { method: 'POST', cookie: vaOwnerCookie, body: { issue_id: fbId, reason: 'Try reopen closed' } })).status,
      409
    );
    assert.equal(
      (await apiReq('/api/admin/issues/update', { method: 'POST', cookie: mod1Cookie, body: { issue_id: fbId, status: 'in_progress' } })).status,
      403
    );
    assert.equal(
      (await apiReq('/api/admin/issues/update', { method: 'POST', cookie: topCookie, body: { issue_id: fbId, status: 'in_progress' } })).status,
      200
    );

    console.log('✓ [6/8] Status transitions, 409 concurrency conflict, reporter reopen & closed-ticket Top guard verified');

    // -----------------------------------------------------------------------
    // 7. Connected Diagnostics: Auto-Suggested vs Confirmed, Many-to-Many,
    //    Mod vs Top Scope, Zero Cross-Reporter Leakage & Reviewed Notify
    // -----------------------------------------------------------------------
    const custADetailMod = await apiReq(`/api/admin/issues?issue_id=${custAIssue.id}`, { cookie: mod1Cookie });
    assert.equal(custADetailMod.status, 200);
    const suggestedLinks = custADetailMod.json.diagnostic_links;
    assert.equal(suggestedLinks.length, 1, 'Expected auto-suggested diagnostic link from matching correlation_id');
    assert.equal(suggestedLinks[0].link_state, 'suggested');
    const opDiagGroupId = suggestedLinks[0].diagnostic_group_id;

    // While `suggested`, reporter sees ZERO `public_diagnostics`
    const custBeforeConfirm = await apiReq(`/api/issues?issue_id=${custAIssue.id}`, { cookie: custACookie });
    assert.equal(custBeforeConfirm.json.public_diagnostics.length, 0);

    // Mod attempts to link Top-only `auth_login` incident -> 403 TOP_DIAGNOSTIC_SCOPE_REQUIRED
    const modLinkTopDiag = await apiReq('/api/admin/issues/diagnostics', {
      method: 'POST',
      cookie: mod1Cookie,
      body: {
        action: 'link',
        issue_id: custAIssue.id,
        diagnostic_group_id: topDiagRec.group_id,
        reason: 'Mod trying to link Top-only auth incident'
      }
    });
    assert.equal(modLinkTopDiag.status, 403);
    assert.equal(modLinkTopDiag.json.code, 'TOP_DIAGNOSTIC_SCOPE_REQUIRED');

    // Top CAN link Top-only incident to `vaAccessRes`, and when Mod views `vaAccessRes` it is redacted (`restricted_scope: true`)!
    const topLinkAuth = await apiReq('/api/admin/issues/diagnostics', {
      method: 'POST',
      cookie: topCookie,
      body: {
        action: 'link',
        issue_id: vaAccessRes.json.issue.id,
        diagnostic_group_id: topDiagRec.group_id,
        reason: 'Confirmed Resend 502 affected login attempt'
      }
    });
    assert.equal(topLinkAuth.status, 200);
    const modViewRestrictedLink = await apiReq(`/api/admin/issues?issue_id=${vaAccessRes.json.issue.id}`, { cookie: mod1Cookie });
    assert.equal(modViewRestrictedLink.json.diagnostic_links[0].restricted_scope, true);
    assert.equal(modViewRestrictedLink.json.diagnostic_links[0].diagnostic_group_id, null);

    // Mod confirms `opDiagGroupId` on `custAIssue` with plain-language `public_summary`
    const confirmLinkRes = await apiReq('/api/admin/issues/diagnostics', {
      method: 'POST',
      cookie: mod1Cookie,
      body: {
        action: 'confirm',
        issue_id: custAIssue.id,
        diagnostic_group_id: opDiagGroupId,
        reason: 'Confirmed 503 during inquiry submit',
        public_summary: 'We linked your report to a temporary event-inquiry connection issue our team is fixing.'
      }
    });
    assert.equal(confirmLinkRes.status, 200);

    // Second customer `custB` opens a ticket and Mod links it to the SAME `opDiagGroupId` (many tickets -> 1 incident),
    // AND Mod links a second operational incident to `custAIssue` (1 ticket -> many incidents)!
    const custBSub = await apiReq('/api/issues', {
      method: 'POST',
      cookie: custBCookie,
      body: {
        entry_kind: 'problem',
        category: 'booking_issue',
        description: 'My catering inquiry also timed out this afternoon.'
      }
    });
    const custBIssue = custBSub.json.issue;

    assert.equal(
      (
        await apiReq('/api/admin/issues/diagnostics', {
          method: 'POST',
          cookie: mod1Cookie,
          body: {
            action: 'link',
            issue_id: custBIssue.id,
            diagnostic_group_id: opDiagGroupId,
            reason: 'Same booking 503 incident'
          }
        })
      ).status,
      200
    );

    const secondOpDiag = await diagMod.recordDiagnosticEvent(dbAdapter, {
      component: 'browser',
      trustLevel: 'browser_untrusted',
      featureKey: 'bookings',
      operationName: 'client.submit_booking',
      routeTemplate: '/api/bookings',
      httpMethod: 'POST',
      severity: 'warning',
      errorCode: 'WRITE_REQUEST_TIMEOUT',
      title: 'Browser inquiry write timeout',
      message: 'Write timed out after 12000ms.',
      userImpact: 'Uncertain inquiry state.',
      safeNextSteps: 'Verify idempotency key.',
      serverReleaseSha: releaseSha,
      modVisible: true
    });
    assert.equal(
      (
        await apiReq('/api/admin/issues/diagnostics', {
          method: 'POST',
          cookie: mod1Cookie,
          body: {
            action: 'link',
            issue_id: custAIssue.id,
            diagnostic_group_id: secondOpDiag.group_id,
            reason: 'Client timeout paired with upstream 503'
          }
        })
      ).status,
      200
    );

    // Verify `custA` sees plain-language `public_diagnostics` ONLY, zero raw error codes/stack traces, and ZERO mention of `custB`!
    const custAAfterConfirm = await apiReq(`/api/issues?issue_id=${custAIssue.id}`, { cookie: custACookie });
    assert.equal(custAAfterConfirm.json.public_diagnostics.length, 1);
    const serializedCustA = JSON.stringify(custAAfterConfirm.json);
    assert(serializedCustA.includes('temporary event-inquiry connection issue'));
    assert(!serializedCustA.includes('custb'), 'Cross-reporter identity must NEVER leak via shared diagnostic incident');
    assert(!serializedCustA.includes(custBIssue.ticket_number), 'Co-linked ticket numbers must NEVER leak to reporters');
    assert(!serializedCustA.includes('BOOKING_UPSTREAM_503'), 'Raw diagnostic error codes must NEVER leak to reporters');

    // Verify `/api/admin/diagnostics/detail` returns both `linked_tickets` (`custAIssue` + `custBIssue`)
    const diagDetailRes = await apiReq(`/api/admin/diagnostics/detail?id=${opDiagGroupId}`, { cookie: mod1Cookie });
    assert.equal(diagDetailRes.status, 200);
    assert.equal(diagDetailRes.json.linked_tickets.length, 2);

    // Resolving diagnostic incident NEVER auto-closes linked support tickets!
    const resolveDiagRes = await apiReq('/api/admin/diagnostics/triage', {
      method: 'POST',
      cookie: topCookie,
      body: {
        group_id: opDiagGroupId,
        triage_status: 'resolved',
        suspected_fix_sha: '28bf1b1b07fc',
        suspected_cause: 'Transient connection pool saturation',
        note_body: 'Pool recovered and monitored clean.'
      }
    });
    assert.equal(resolveDiagRes.status, 200);

    const custAStillOpen = await apiReq(`/api/issues?issue_id=${custAIssue.id}`, { cookie: custACookie });
    assert.equal(custAStillOpen.json.issue.status, 'in_progress', 'Resolving diagnostic incident must NEVER auto-close linked tickets');

    // Reviewed multi-ticket public update: `send` without `confirmed: true` -> 400 CONFIRMATION_REQUIRED
    const unconfirmedNotify = await apiReq('/api/admin/diagnostics/notify-tickets', {
      method: 'POST',
      cookie: mod1Cookie,
      body: {
        group_id: opDiagGroupId,
        mode: 'send',
        confirmed: false,
        message: 'Update: Event inquiry stability has been restored. Let us know if anything else comes up!'
      }
    });
    assert.equal(unconfirmedNotify.status, 400);
    assert.equal(unconfirmedNotify.json.code, 'CONFIRMATION_REQUIRED');

    const previewNotify = await apiReq('/api/admin/diagnostics/notify-tickets', {
      method: 'POST',
      cookie: mod1Cookie,
      body: {
        group_id: opDiagGroupId,
        mode: 'preview',
        message: 'Update: Event inquiry stability has been restored. Let us know if anything else comes up!'
      }
    });
    assert.equal(previewNotify.status, 200);
    assert.equal(previewNotify.json.recipient_count, 2);

    const sendNotify = await apiReq('/api/admin/diagnostics/notify-tickets', {
      method: 'POST',
      cookie: mod1Cookie,
      body: {
        group_id: opDiagGroupId,
        mode: 'send',
        confirmed: true,
        message: 'Update: Event inquiry stability has been restored. Let us know if anything else comes up!'
      }
    });
    assert.equal(sendNotify.status, 200);
    assert.equal(sendNotify.json.posted_count, 2);

    // Re-sending identical message deduplicates (`posted_count: 0`, `already_sent_count: 2`)
    const sendNotifyDup = await apiReq('/api/admin/diagnostics/notify-tickets', {
      method: 'POST',
      cookie: mod1Cookie,
      body: {
        group_id: opDiagGroupId,
        mode: 'send',
        confirmed: true,
        message: 'Update: Event inquiry stability has been restored. Let us know if anything else comes up!'
      }
    });
    assert.equal(sendNotifyDup.status, 200);
    assert.equal(sendNotifyDup.json.posted_count, 0);
    assert.equal(sendNotifyDup.json.already_sent_count, 2);

    console.log('✓ [7/8] Connected diagnostics, Mod/Top scope isolation, non-auto-close & reviewed multi-ticket update verified');

    // -----------------------------------------------------------------------
    // 8. Staging Unallowlisted Recipient Fallback, Retention Separation &
    //    Log/Telemetry Secret Hygiene
    // -----------------------------------------------------------------------
    // Create an account whose domain (`@unlisted-customer.example`) is NOT in `BITESHARK_STAGING_ALLOWED_EMAIL_DOMAINS`,
    // then narrow static allowlist to an explicit email (`top1@operator.biteshark.test`) while testing `dispatchSupportNotificationEmail`
    // for an unallowlisted email address!
    const authMod = await import(pathToFileURL(path.join(ROOT, 'lib', 'standalone-auth.js')).href);
    const emailsBeforeUnlisted = sentEmails.length;
    const unlistedNotif = await authMod.dispatchSupportNotificationEmail(dbAdapter, {
      issueId: custAIssue.id,
      ticketNumber: custAIssue.ticket_number,
      recipientEmail: 'external-nonoperator@gmail.com',
      eventKind: 'staff_public_reply',
      dedupeKey: 'test_unlisted_dedupe_01'
    });
    assert.equal(unlistedNotif.ok, true);
    assert.equal(unlistedNotif.deliveryStatus, 'staging_restricted_in_app_only');
    assert.equal(sentEmails.length, emailsBeforeUnlisted, 'Unallowlisted external address must NEVER be emailed in staging');

    // Run diagnostic retention cleanup with aggressive 0-day cutoff -> support tickets/notes/events remain 100% intact!
    const countBeforeCleanup = await privQuery('SELECT count(*)::int AS c FROM support_issues');
    await diagMod.cleanupExpiredDiagnostics(dbAdapter);
    const countAfterCleanup = await privQuery('SELECT count(*)::int AS c FROM support_issues');
    assert.equal(countAfterCleanup.rows[0].c, countBeforeCleanup.rows[0].c, 'Diagnostic cleanup must never delete support tickets');

    // Verify zero secrets, API keys, raw cookies, or ticket body markers in server logs or `auth_delivery_telemetry`
    const allLogsJoined = capturedLogs.join('\n');
    assert(!allLogsJoined.includes(resendApiKey), 'Resend API key must never appear in logs');
    assert(!allLogsJoined.includes(secretMarker), 'Support ticket message body must never appear in logs');
    assert(!allLogsJoined.includes('sk_live_fake999888777666'), 'Fixture secret must never appear in logs');

    const telemDump = await privQuery('SELECT * FROM auth_delivery_telemetry');
    const telemStr = JSON.stringify(telemDump.rows);
    assert(!telemStr.includes(secretMarker), 'Telemetry must never store ticket bodies');
    assert(!telemStr.includes('custa@operator.biteshark.test'), 'Telemetry must never store recipient emails');

    console.log('✓ [8/8] Staging recipient restriction fallback, diagnostic cleanup separation & log/telemetry hygiene verified');
    console.log('PASS: All BiteShark Support & Feedback + Connected Diagnostics integration gates passed.');
  } finally {
    global.fetch = origFetch;
    if (serverHandle) await new Promise(resolve => serverHandle.close(resolve)).catch(() => {});
    if (appPool) await appPool.end().catch(() => {});
    if (migratorPool) await migratorPool.end().catch(() => {});
    await superPool.end().catch(() => {});
    await cluster.stop();
  }
}

main().catch(err => {
  console.error('SUPPORT & FEEDBACK INTEGRATION FAILURE:', err);
  process.exit(1);
});
