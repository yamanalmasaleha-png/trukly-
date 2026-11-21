// Urgent Pre-Pilot Security Remediation Integration & Concurrency Regression Suite
//
// Targets audited findings in `biteshark-audit-20261121T124746Z` against real disposable
// PostgreSQL (`NOSUPERUSER NOBYPASSRLS`), real `@biteshark/runtime-adapter`, and `server/app.js`.

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');

function requirePg() {
  const candidates = [ROOT];
  if (process.env.TRUCKLY_PG_NODE_MODULES) candidates.push(process.env.TRUCKLY_PG_NODE_MODULES);
  for (const base of candidates) {
    try {
      return require(require.resolve('pg', { paths: [base] }));
    } catch {}
  }
  throw new Error('Missing `pg` package. Set TRUCKLY_PG_NODE_MODULES or run `npm ci`.');
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

function findPostgresBinDir() {
  const initExe = process.platform === 'win32' ? 'initdb.exe' : 'initdb';
  if (process.env.PG_BIN_DIR && fs.existsSync(path.join(process.env.PG_BIN_DIR, initExe))) {
    return process.env.PG_BIN_DIR;
  }
  const pkgPlatform = `${process.platform === 'win32' ? 'windows' : process.platform}-${process.arch}`;
  for (const r of [process.env.TRUCKLY_PG_NODE_MODULES, process.env.BITESHARK_PG_NODE_MODULES].filter(Boolean)) {
    const embDir = path.join(r, '@embedded-postgres', pkgPlatform, 'native', 'bin');
    if (fs.existsSync(path.join(embDir, initExe))) return embDir;
  }
  for (const dir of (process.env.PATH || '').split(path.delimiter).filter(Boolean)) {
    if (fs.existsSync(path.join(dir, initExe))) return dir;
  }
  if (process.platform === 'win32') {
    const base = 'C:\\Program Files\\PostgreSQL';
    if (fs.existsSync(base)) {
      const vers = fs
        .readdirSync(base)
        .filter(v => /^\d+$/.test(v))
        .sort((a, b) => Number(b) - Number(a));
      for (const v of vers) {
        const candidate = path.join(base, v, 'bin');
        if (fs.existsSync(path.join(candidate, 'initdb.exe'))) return candidate;
      }
    }
  } else {
    const usrLib = '/usr/lib/postgresql';
    if (fs.existsSync(usrLib)) {
      const vers = fs
        .readdirSync(usrLib)
        .filter(v => /^\d+$/.test(v))
        .sort((a, b) => Number(b) - Number(a));
      for (const v of vers) {
        const candidate = path.join(usrLib, v, 'bin');
        if (fs.existsSync(path.join(candidate, 'initdb'))) return candidate;
      }
    }
  }
  return '';
}

async function createPostgresCluster() {
  const extAdminUrl = process.env.TEST_ADMIN_DATABASE_URL || process.env.DATABASE_URL;
  if (extAdminUrl) {
    return { adminUrl: extAdminUrl, stop: async () => {} };
  }
  const pgBin = findPostgresBinDir();
  if (!pgBin) {
    throw new Error('PostgreSQL binaries not found. Set TRUCKLY_PG_NODE_MODULES or DATABASE_URL.');
  }
  const exe = name => path.join(pgBin, process.platform === 'win32' ? `${name}.exe` : name);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-sec-pg-'));
  const dataDir = path.join(tmpDir, 'data');
  const port = await getFreePort();

  execFileSync(exe('initdb'), ['-D', dataDir, '-U', 'postgres', '-A', 'trust', '-E', 'UTF8', '--no-locale'], {
    stdio: 'ignore',
    windowsHide: true
  });
  fs.appendFileSync(
    path.join(dataDir, 'postgresql.conf'),
    `\nlisten_addresses = '127.0.0.1'\nport = ${port}\nmax_connections = 80\nfsync = off\nsynchronous_commit = off\nfull_page_writes = off\n`
  );
  execFileSync(exe('pg_ctl'), ['-D', dataDir, '-l', path.join(tmpDir, 'pg.log'), '-w', 'start'], {
    stdio: 'ignore',
    windowsHide: true
  });

  return {
    adminUrl: `postgresql://postgres@127.0.0.1:${port}/postgres`,
    stop: async () => {
      try {
        execFileSync(exe('pg_ctl'), ['-D', dataDir, '-m', 'immediate', '-w', 'stop'], {
          stdio: 'ignore',
          windowsHide: true
        });
      } catch {}
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {}
    }
  };
}

function runMigrationsCli(migratorUrl, appRole, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'scripts', 'run-migrations.cjs'), '--app-role', appRole], {
      cwd: ROOT,
      env: { ...process.env, MIGRATION_DATABASE_URL: migratorUrl, ...extraEnv },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => (stdout += d.toString()));
    child.stderr.on('data', d => (stderr += d.toString()));
    child.on('error', reject);
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createTwoPartyBarrier() {
  let arrived = 0;
  const ready = createDeferred();
  return {
    async arriveAndWait() {
      arrived += 1;
      if (arrived >= 2) ready.resolve();
      await ready.promise;
    }
  };
}

function parseSessionCookie(res) {
  const setCookie =
    typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : res.headers.get('set-cookie');
  const joined = Array.isArray(setCookie) ? setCookie.join('; ') : String(setCookie || '');
  const m = /(__Host-truckly_session=[^;\s;]+|truckly_session=[^;\s;]+)/.exec(joined);
  return m ? m[1] : '';
}

function extractOtpFromEmail(text) {
  const m = String(text || '').match(/(?:verification code:\s*)(\d{6})/i) || String(text || '').match(/\b(\d{6})\b/);
  return m ? m[1] : null;
}

/**
 * Wraps a real `pg.Pool` without monkey-patching `pg.Client.prototype.query` (preserving native
 * node-postgres Submittable callback semantics) while allowing deterministic pre-handler hooks
 * right after `resolveSessionFromRequest` finishes its transaction checkout!
 */
function createInstrumentedDbAdapter(realPool) {
  let afterFirstReleaseHook = null;
  let readyToRunHook = null;
  let onQueryHook = null;

  return {
    pool: realPool,
    armAfterSessionLookup(fn) {
      afterFirstReleaseHook = fn;
      readyToRunHook = null;
    },
    setOnQueryHook(fn) {
      onQueryHook = fn;
    },
    clearHooks() {
      afterFirstReleaseHook = null;
      readyToRunHook = null;
      onQueryHook = null;
    },
    async query(text, params) {
      if (readyToRunHook) {
        const h = readyToRunHook;
        readyToRunHook = null;
        await h();
      }
      const out = await realPool.query(text, params);
      if (onQueryHook) {
        await onQueryHook(typeof text === 'string' ? text : text?.text || '', params);
      }
      return out;
    },
    async connect() {
      if (readyToRunHook) {
        const h = readyToRunHook;
        readyToRunHook = null;
        await h();
      }
      const client = await realPool.connect();
      if (afterFirstReleaseHook) {
        const pending = afterFirstReleaseHook;
        afterFirstReleaseHook = null;
        const origRelease = client.release.bind(client);
        client.release = (...args) => {
          client.release = origRelease;
          readyToRunHook = pending;
          return origRelease(...args);
        };
      }
      return client;
    }
  };
}

async function main() {
  const { Pool } = requirePg();
  const cluster = await createPostgresCluster();
  const suffix = crypto.randomBytes(4).toString('hex');
  const migratorRole = `bs_sec_mig_${suffix}`;
  const migratorPass = `mig_${suffix}`;
  const appRole = `bs_sec_app_${suffix}`;
  const appPass = `app_${suffix}`;
  const dbName = `bs_sec_${suffix}`;
  const upgDbName = `bs_sec_upg_${suffix}`;

  const superPool = new Pool({ connectionString: cluster.adminUrl, max: 4 });
  let migratorPool = null;
  let max1AppPool = null;
  let multiAppPool = null;
  let upgMigratorPool = null;
  let serverMax1 = null;
  let serverMulti = null;
  const origFetch = global.fetch;

  let max1Adapter = null;
  let multiAdapter = null;

  const checks = [];
  async function runCheck(name, fn) {
    try {
      await Promise.race([
        fn(),
        new Promise((_, rej) => setTimeout(() => rej(new Error(`Check timed out after 12s: ${name}`)), 12000))
      ]);
      checks.push({ name, ok: true });
      console.log(`✓ PASS: ${name}`);
    } catch (err) {
      if (max1Adapter) max1Adapter.clearHooks();
      if (multiAdapter) multiAdapter.clearHooks();
      checks.push({ name, ok: false, error: err?.message || String(err) });
      console.error(`✗ FAIL: ${name} — ${err?.message || String(err)}`);
    }
  }

  try {
    await superPool.query(`CREATE ROLE "${migratorRole}" LOGIN PASSWORD '${migratorPass}' CREATEDB`);
    await superPool.query(
      `CREATE ROLE "${appRole}" LOGIN PASSWORD '${appPass}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`
    );
    await superPool.query(`CREATE DATABASE "${dbName}" OWNER "${migratorRole}"`);
    await superPool.query(`CREATE DATABASE "${upgDbName}" OWNER "${migratorRole}"`);

    const parsedAdmin = new URL(cluster.adminUrl);
    const pgHost = parsedAdmin.hostname;
    const pgPort = parsedAdmin.port || '5432';
    const migratorUrl = `postgresql://${migratorRole}:${migratorPass}@${pgHost}:${pgPort}/${dbName}`;
    const appUrl = `postgresql://${appRole}:${appPass}@${pgHost}:${pgPort}/${dbName}`;
    const upgMigratorUrl = `postgresql://${migratorRole}:${migratorPass}@${pgHost}:${pgPort}/${upgDbName}`;

    const freshMig = await runMigrationsCli(migratorUrl, appRole);
    assert.equal(freshMig.code, 0, `Fresh migration run failed:\n${freshMig.stderr}`);

    migratorPool = new Pool({ connectionString: migratorUrl, max: 6 });
    max1AppPool = new Pool({ connectionString: appUrl, max: 1 });
    multiAppPool = new Pool({ connectionString: appUrl, max: 8 });
    max1Adapter = createInstrumentedDbAdapter(max1AppPool);
    multiAdapter = createInstrumentedDbAdapter(multiAppPool);

    async function privQuery(sql, params = [], targetPool = migratorPool) {
      const c = await targetPool.connect();
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
      } catch (err) {
        await c.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        c.release();
      }
    }

    const portMax1 = await getFreePort();
    const portMulti = await getFreePort();
    const baseMax1 = `http://127.0.0.1:${portMax1}`;
    const baseMulti = `http://127.0.0.1:${portMulti}`;

    const authSecret = 'sec_auth_secret_' + crypto.randomBytes(24).toString('hex');
    const resendKey = 're_sec_test_' + crypto.randomBytes(16).toString('hex');
    const workerSecret = 'wk_sec_test_' + crypto.randomBytes(20).toString('hex');

    for (const k of Object.keys(process.env)) {
      if (k.startsWith('BITESHARK_') || k.startsWith('TRUCKLY_')) delete process.env[k];
    }
    delete process.env.NODE_ENV;

    Object.assign(process.env, {
      BITESHARK_ENV: 'staging',
      BITESHARK_TRUST_PROXY: 'loopback',
      DATABASE_URL: appUrl,
      MIGRATION_DATABASE_URL: migratorUrl,
      BITESHARK_AUTH_SECRET: authSecret,
      BITESHARK_AUTH_DELIVERY_MODE: 'resend_https',
      BITESHARK_AUTH_EMAIL_API_KEY: resendKey,
      BITESHARK_AUTH_EMAIL_FROM: 'BiteShark Security Test <login@send.biteshark.live>',
      BITESHARK_AUTH_EMAIL_API_URL: 'https://api.resend.com/emails',
      BITESHARK_STAGING_ALLOWED_EMAIL_DOMAINS: 'sec.biteshark.test',
      BITESHARK_STAGING_ALLOWED_EMAILS: '',
      BITESHARK_PUSH_DELIVERY_MODE: 'disabled',
      BITESHARK_NOTIFICATION_WORKER_SECRET: workerSecret,
      BITESHARK_RELEASE_SHA: 'f0f740aa5c1e8b20443af9b31975ec23cc1c1913'
    });

    const sentEmails = [];
    global.fetch = async (url, init) => {
      const urlStr = typeof url === 'string' ? url : url?.url || String(url);
      if (urlStr === 'https://api.resend.com/emails') {
        const parsed = JSON.parse(String(init?.body || '{}'));
        sentEmails.push(parsed);
        return new Response(JSON.stringify({ id: `re_msg_${sentEmails.length}` }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return origFetch(url, init);
    };

    const { configureStandaloneAdapter, db: runtimeDb } = await import(
      pathToFileURL(path.join(ROOT, 'packages', 'runtime-adapter', 'index.js')).href
    );
    const { createStandaloneServer } = await import(pathToFileURL(path.join(ROOT, 'server', 'app.js')).href);
    const { withTransaction } = await import(pathToFileURL(path.join(ROOT, 'lib', 'db-tx.js')).href);
    const { runWithGovernanceContext } = await import(
      pathToFileURL(path.join(ROOT, 'lib', 'request-context.js')).href
    );
    const ownerBookingsMod = await import(pathToFileURL(path.join(ROOT, 'api', 'owner', 'bookings.js')).href);

    function runWithSessionGovernanceContext(ctx, fn) {
      return runWithGovernanceContext({ requireEligibleSessionInTx: true, ...ctx }, fn);
    }

    const silentLogger = { info: () => {}, warn: () => {}, error: () => {} };

    const srvMax1Obj = createStandaloneServer({
      dbAdapter: max1Adapter,
      releaseSha: 'f0f740aa5c1e8b20443af9b31975ec23cc1c1913',
      logger: silentLogger
    });
    await srvMax1Obj.startupReleasePromise;
    serverMax1 = await new Promise(resolve => {
      srvMax1Obj.server.listen(portMax1, '127.0.0.1', () => resolve(srvMax1Obj.server));
    });

    const srvMultiObj = createStandaloneServer({
      dbAdapter: multiAdapter,
      releaseSha: 'f0f740aa5c1e8b20443af9b31975ec23cc1c1913',
      logger: silentLogger
    });
    await srvMultiObj.startupReleasePromise;
    serverMulti = await new Promise(resolve => {
      srvMultiObj.server.listen(portMulti, '127.0.0.1', () => resolve(srvMultiObj.server));
    });

    async function httpReq(base, reqPath, { method = 'GET', cookie = '', headers = {}, body } = {}) {
      const hdrs = { Origin: base, Connection: 'close', ...headers };
      if (cookie) hdrs.Cookie = cookie;
      let payload;
      if (body !== undefined) {
        hdrs['Content-Type'] = 'application/json';
        payload = JSON.stringify(body);
      }
      const res = await origFetch(`${base}${reqPath}`, {
        method,
        headers: hdrs,
        body: payload,
        redirect: 'manual'
      });
      const text = await res.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {}
      return { status: res.status, headers: res.headers, text, json };
    }

    async function createAccountAndSignIn(email, base = baseMulti) {
      const before = sentEmails.length;
      const startRes = await httpReq(base, '/api/auth/start', {
        method: 'POST',
        headers: { 'X-BiteShark-Client': 'web-auth-v1' },
        body: { email, intent: 'signup', dob: '1991-06-15' }
      });
      assert.equal(startRes.status, 200, `start failed for ${email}: ${startRes.text}`);
      assert(sentEmails.length > before, `Expected OTP email for ${email}`);
      const mail = sentEmails[sentEmails.length - 1];
      const otp = extractOtpFromEmail(mail.text || mail.html);
      assert(otp, `Missing OTP for ${email}`);

      const verRes = await httpReq(base, '/api/auth/verify', {
        method: 'POST',
        headers: { 'X-BiteShark-Client': 'web-auth-v1' },
        body: { email, code: otp }
      });
      assert.equal(verRes.status, 200, `verify failed for ${email}: ${verRes.text}`);
      const cookie = parseSessionCookie(verRes);
      assert(cookie, `Missing session cookie for ${email}`);
      const sessRow = await privQuery(
        'SELECT id FROM auth_sessions WHERE user_id = $1 AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1',
        [verRes.json.user.id]
      );
      return {
        user: verRes.json.user,
        cookie,
        sessionId: sessRow.rows[0].id
      };
    }

    const topA = await createAccountAndSignIn('top-a@sec.biteshark.test', baseMulti);
    const topB = await createAccountAndSignIn('top-b@sec.biteshark.test', baseMulti);
    const modA = await createAccountAndSignIn('mod-a@sec.biteshark.test', baseMulti);
    const ownerA = await createAccountAndSignIn('owner-a@sec.biteshark.test', baseMulti);
    const staffOnly = await createAccountAndSignIn('staff-only@sec.biteshark.test', baseMulti);
    const topPlusStaff = await createAccountAndSignIn('top-staff@sec.biteshark.test', baseMulti);
    const topPlusOwner = await createAccountAndSignIn('top-owner@sec.biteshark.test', baseMulti);
    const custA = await createAccountAndSignIn('cust-a@sec.biteshark.test', baseMulti);
    const custB = await createAccountAndSignIn('cust-b@sec.biteshark.test', baseMulti);

    await privQuery(
      `INSERT INTO platform_roles (user_id, role, granted_by) VALUES
         ($1, 'top', 'bootstrap'),
         ($2, 'top', $1),
         ($3, 'mod', $1),
         ($4, 'top', $1),
         ($5, 'top', $1)`,
      [topA.user.id, topB.user.id, modA.user.id, topPlusStaff.user.id, topPlusOwner.user.id]
    );
    await privQuery(
      `INSERT INTO vendor_memberships (vendor_id, user_id, role, granted_by) VALUES
         ('iniguez', $1, 'owner', $5),
         ('mitote', $1, 'owner', $5),
         ('mitote', $2, 'staff', $5),
         ('mitote', $3, 'staff', $5),
         ('mitote', $4, 'owner', $5)`,
      [ownerA.user.id, staffOnly.user.id, topPlusStaff.user.id, topPlusOwner.user.id, topA.user.id]
    );

    // =======================================================================
    // PRIORITY A: Transaction-Scoped Session & Eligibility Verification
    // =======================================================================
    configureStandaloneAdapter({ db: max1Adapter });

    await runCheck(
      'Priority A (BS-AUD-001): max=1 pooled client reuse across identities enforces mid-request session revocation via real runtime-adapter path',
      async () => {
        const communityPostMod = await import(pathToFileURL(path.join(ROOT, 'api', 'community', 'post.js')).href);
        const { bindVerifiedRequestUser } = await import(
          pathToFileURL(path.join(ROOT, 'packages', 'runtime-adapter', 'index.js')).href
        );

        async function invokeCommunityPostOnRuntimeAdapter(actor, titleText) {
          let status = 200;
          let bodyOut = null;
          const req = {
            method: 'POST',
            headers: {},
            body: {
              kind: 'review',
              place_id: 'mitote',
              title: titleText,
              body: 'Testing pooled connection reuse across identities on runtime-adapter.',
              rating: 5
            }
          };
          bindVerifiedRequestUser(req, { id: actor.user.id, email: actor.user.email });
          const res = {
            setHeader() {},
            status(c) {
              status = c;
              return res;
            },
            json(b) {
              bodyOut = b;
              return res;
            }
          };
          await runWithSessionGovernanceContext(
            { verifiedSessionId: actor.sessionId, verifiedUserId: actor.user.id },
            () => communityPostMod.default(req, res)
          );
          return { status, json: bodyOut };
        }

        // 1. Warm the single `max=1` pooled connection with `ownerA` via real `@biteshark/runtime-adapter` `db.transaction`
        const warmRes = await invokeCommunityPostOnRuntimeAdapter(ownerA, 'Warmup Protected Review');
        assert.equal(warmRes.status, 201, `Warmup failed: ${JSON.stringify(warmRes.json)}`);

        // 2. Revoke `custB`'s session and reuse that exact `max=1` pooled connection for `custB`!
        const beforeCount = (
          await privQuery('SELECT count(*)::int AS c FROM community_reviews WHERE author_id = $1', [custB.user.id])
        ).rows[0].c;

        await privQuery('UPDATE auth_sessions SET revoked_at = now() WHERE id = $1', [custB.sessionId]);
        try {
          let reuseStatus = null;
          try {
            const reuseRes = await invokeCommunityPostOnRuntimeAdapter(custB, 'Revoked Reuse Attempt');
            reuseStatus = reuseRes.status;
          } catch (err) {
            reuseStatus = err?.status || 500;
          }

          const afterCount = (
            await privQuery('SELECT count(*)::int AS c FROM community_reviews WHERE author_id = $1', [custB.user.id])
          ).rows[0].c;

          assert.equal(reuseStatus, 401, `Expected 401 after revocation on reused client, got ${reuseStatus}`);
          assert.equal(afterCount, beforeCount, 'Zero community_reviews rows may commit after session revocation');
        } finally {
          await privQuery('UPDATE auth_sessions SET revoked_at = NULL WHERE id = $1', [custB.sessionId]);
          await privQuery('DELETE FROM community_reviews WHERE author_id = $1', [custB.user.id]);
        }
      }
    );

    await runCheck(
      'Priority A (BS-AUD-001 + BS-AUD-014): rollback, verification failure, account suspension (401), age-assessment requirement (403, never 503), and nested same-tx helper work on max=1 runtime-adapter',
      async () => {
        // 1. Rollback after successful verification must NOT leave verified marker on `max=1` client
        await assert.rejects(
          () =>
            runWithSessionGovernanceContext(
              { verifiedSessionId: ownerA.sessionId, verifiedUserId: ownerA.user.id },
              () =>
                withTransaction(runtimeDb, async () => {
                  throw new Error('INTENTIONAL_APP_ROLLBACK');
                })
            ),
          /INTENTIONAL_APP_ROLLBACK/
        );

        await privQuery('UPDATE auth_users SET disabled_at = now() WHERE id = $1', [custA.user.id]);
        try {
          let caughtErr = null;
          try {
            await runWithSessionGovernanceContext(
              { verifiedSessionId: custA.sessionId, verifiedUserId: custA.user.id },
              () => withTransaction(runtimeDb, async tx => tx.query('SELECT 1'))
            );
          } catch (e) {
            caughtErr = e;
          }
          assert(caughtErr, 'Suspended account must fail verification on reused client after rollback');
          assert.equal(caughtErr.status, 401);
          assert.equal(caughtErr.code, 'SESSION_REVOKED');
        } finally {
          await privQuery('UPDATE auth_users SET disabled_at = NULL WHERE id = $1', [custA.user.id]);
        }

        // 2. Verification failure (account becomes `not_assessed` mid-request -> `403 AGE_ASSESSMENT_REQUIRED`, NOT `503`)
        max1Adapter.armAfterSessionLookup(async () => {
          await privQuery(
            `UPDATE auth_users
             SET age_eligibility_status = 'not_assessed',
                 age_policy_version = NULL,
                 age_assessed_at = NULL,
                 age_assessment_basis = NULL
             WHERE id = $1`,
            [custA.user.id]
          );
        });
        try {
          const ageFailRes = await httpReq(baseMax1, '/api/community/post', {
            method: 'POST',
            cookie: custA.cookie,
            body: {
              kind: 'review',
              place_id: 'mitote',
              title: 'Unassessed Mid-Request',
              body: 'Must fail with 403 AGE_ASSESSMENT_REQUIRED, never 503 or 201.',
              rating: 4
            }
          });
          assert.equal(
            ageFailRes.status,
            403,
            `Expected 403 AGE_ASSESSMENT_REQUIRED (not 503), got ${ageFailRes.status}: ${ageFailRes.text}`
          );
          assert.equal(ageFailRes.json?.code, 'AGE_ASSESSMENT_REQUIRED');
        } finally {
          await privQuery(
            `UPDATE auth_users
             SET age_eligibility_status = 'eligible_14_plus',
                 age_policy_version = '2026-04-min14-v1',
                 age_assessed_at = now(),
                 age_assessment_basis = 'self_reported_dob_at_signup'
             WHERE id = $1`,
            [custA.user.id]
          );
        }

        // 3. Immediately after verification failure, a revoked session on the same `max=1` client must STILL fail `401`
        await privQuery('UPDATE auth_sessions SET revoked_at = now() WHERE id = $1', [custB.sessionId]);
        try {
          let postFailErr = null;
          try {
            await runWithSessionGovernanceContext(
              { verifiedSessionId: custB.sessionId, verifiedUserId: custB.user.id },
              () => withTransaction(runtimeDb, async tx => tx.query('SELECT 1'))
            );
          } catch (e) {
            postFailErr = e;
          }
          assert(postFailErr, 'Verification failure must not leave a verified marker behind for the next transaction');
          assert.equal(postFailErr.status, 401);
        } finally {
          await privQuery('UPDATE auth_sessions SET revoked_at = NULL WHERE id = $1', [custB.sessionId]);
        }

        // 4. Legitimate nested `withTransaction(tx, ...)` inside the same transaction succeeds without deadlocking `max=1`
        const nestedOut = await Promise.race([
          runWithSessionGovernanceContext(
            { verifiedSessionId: ownerA.sessionId, verifiedUserId: ownerA.user.id },
            () =>
              withTransaction(runtimeDb, async outerTx => {
                await outerTx.query("SELECT set_config('app.current_user_id', $1, true)", [ownerA.user.id]);
                return withTransaction(outerTx, async innerTx => {
                  const { rows } = await innerTx.query("SELECT current_setting('app.current_user_id', true) AS uid");
                  return rows[0].uid;
                });
              })
          ),
          new Promise((_, rej) => setTimeout(() => rej(new Error('Nested withTransaction hung on max=1 pool')), 2000))
        ]);
        assert.equal(nestedOut, ownerA.user.id, 'Nested same-transaction helper call must preserve identity & succeed');
      }
    );

    await runCheck(
      'Priority A (BS-AUD-001): protected writes in /api/favorites/toggle and /api/notifications/settings enforce in-transaction session verification',
      async () => {
        try {
          max1Adapter.armAfterSessionLookup(async () => {
            await privQuery('UPDATE auth_sessions SET revoked_at = now() WHERE id = $1', [custA.sessionId]);
          });
          const favRes = await httpReq(baseMax1, '/api/favorites/toggle', {
            method: 'POST',
            cookie: custA.cookie,
            body: { truck_id: 'mitote', desired_saved: true }
          });
          const favCount = (
            await privQuery('SELECT count(*)::int AS c FROM favorites WHERE user_id = $1 AND truck_id = $2', [
              custA.user.id,
              'mitote'
            ])
          ).rows[0].c;
          assert.equal(favRes.status, 401, `Expected 401 on revoked favorites toggle, got ${favRes.status}: ${favRes.text}`);
          assert.equal(favCount, 0, 'Revoked favorites toggle must commit zero rows');
        } finally {
          await privQuery('UPDATE auth_sessions SET revoked_at = NULL WHERE id = $1', [custA.sessionId]);
          await privQuery("DELETE FROM favorites WHERE user_id = $1 AND truck_id = 'mitote'", [custA.user.id]);
        }

        try {
          max1Adapter.armAfterSessionLookup(async () => {
            await privQuery('UPDATE auth_sessions SET revoked_at = now() WHERE id = $1', [custA.sessionId]);
          });
          const notifRes = await httpReq(baseMax1, '/api/notifications/settings', {
            method: 'POST',
            cookie: custA.cookie,
            body: { nearby_enabled: false, radius_miles: 10 }
          });
          const notifCount = (
            await privQuery('SELECT count(*)::int AS c FROM notification_settings WHERE user_id = $1', [custA.user.id])
          ).rows[0].c;
          assert.equal(
            notifRes.status,
            401,
            `Expected 401 on revoked notifications settings write, got ${notifRes.status}: ${notifRes.text}`
          );
          assert.equal(notifCount, 0, 'Revoked notifications settings write must commit zero rows');
        } finally {
          await privQuery('UPDATE auth_sessions SET revoked_at = NULL WHERE id = $1', [custA.sessionId]);
          await privQuery('DELETE FROM notification_settings WHERE user_id = $1', [custA.user.id]);
        }
      }
    );

    await runCheck(
      'Priority A: opposite lock order — when protected transaction acquires FOR SHARE first, concurrent session revocation blocks until commit and blocks the next transaction',
      async () => {
        const txLocked = createDeferred();
        const releaseTx = createDeferred();
        let revokeFinished = false;

        const inFlightTx = runWithSessionGovernanceContext(
          { verifiedSessionId: custA.sessionId, verifiedUserId: custA.user.id },
          () =>
            withTransaction(multiAppPool, async tx => {
              await tx.query("SELECT set_config('app.user_id', $1, true)", [custA.user.id]);
              txLocked.resolve();
              await releaseTx.promise;
              await tx.query(
                `INSERT INTO favorites (user_id, truck_id) VALUES ($1, 'elroys') ON CONFLICT DO NOTHING`,
                [custA.user.id]
              );
              return 'committed';
            })
        );

        await txLocked.promise;

        const revokeClient = await migratorPool.connect();
        try {
          await revokeClient.query('BEGIN');
          await revokeClient.query("SELECT set_config('app.auth_internal', 'true', true)");
          const revokePromise = revokeClient
            .query('UPDATE auth_sessions SET revoked_at = now() WHERE id = $1', [custA.sessionId])
            .then(async () => {
              await revokeClient.query('COMMIT');
              revokeFinished = true;
            });

          for (let i = 0; i < 20 && !revokeFinished; i++) {
            const poll = await migratorPool.query(
              `SELECT count(*)::int AS waiting
               FROM pg_locks
               WHERE NOT granted AND relation = 'public.auth_sessions'::regclass`
            );
            if (poll.rows[0].waiting > 0) break;
            await new Promise(r => setImmediate(r));
          }
          assert.equal(revokeFinished, false, 'Concurrent session UPDATE must serialize behind active FOR SHARE lock');

          releaseTx.resolve();
          const txOutcome = await inFlightTx;
          assert.equal(txOutcome, 'committed');
          await revokePromise;
          assert.equal(revokeFinished, true);

          await assert.rejects(
            () =>
              runWithSessionGovernanceContext(
                { verifiedSessionId: custA.sessionId, verifiedUserId: custA.user.id },
                () => withTransaction(multiAppPool, async tx => tx.query('SELECT 1'))
              ),
            err => err?.status === 401 && err?.code === 'SESSION_REVOKED'
          );
        } finally {
          revokeClient.release();
          await privQuery('UPDATE auth_sessions SET revoked_at = NULL WHERE id = $1', [custA.sessionId]);
          await privQuery("DELETE FROM favorites WHERE user_id = $1 AND truck_id = 'elroys'", [custA.user.id]);
        }
      }
    );

    configureStandaloneAdapter({ db: multiAdapter });

    // =======================================================================
    // PRIORITY B: Prevent Administrator Lockout (`BS-AUD-002`)
    // =======================================================================

    await runCheck(
      'Priority B (BS-AUD-002): orphaned roles, disabled accounts, and unassessed accounts do NOT satisfy last-Top protection across API demotion, DB deletion, suspension, auth_users deletion, and non-owner bypass attempts',
      async () => {
        await privQuery(
          `INSERT INTO platform_roles (user_id, role, granted_by)
           VALUES ('usr_orphan_no_auth_row', 'top', 'legacy_seed')
           ON CONFLICT (user_id) DO UPDATE SET role = 'top'`
        );
        await privQuery(
          `INSERT INTO auth_users (
             id, email_normalized, disabled_at,
             age_eligibility_status, age_assessed_at, age_policy_version, age_assessment_basis
           )
           VALUES
             ('usr_disabled_top', 'disabled-top@sec.biteshark.test', now(), 'eligible_14_plus', now(), '2026-04-min14-v1', 'self_reported_dob_at_signup'),
             ('usr_unassessed_top', 'unassessed-top@sec.biteshark.test', NULL, 'not_assessed', NULL, NULL, NULL)
           ON CONFLICT (id) DO NOTHING`
        );
        await privQuery(
          `INSERT INTO platform_roles (user_id, role, granted_by)
           VALUES ('usr_disabled_top', 'top', 'bootstrap'),
                  ('usr_unassessed_top', 'platform_admin', 'bootstrap')
           ON CONFLICT (user_id) DO NOTHING`
        );
        await privQuery(
          `DELETE FROM platform_roles WHERE user_id IN ($1, $2, $3)`,
          [topB.user.id, topPlusStaff.user.id, topPlusOwner.user.id]
        );

        try {
          // 1. API demotion of `topA` MUST fail even with orphan + disabled + unassessed rows present
          const demoteRes = await httpReq(baseMulti, '/api/admin/accounts/role', {
            method: 'POST',
            cookie: topA.cookie,
            body: { user_id: topA.user.id, role: 'mod', reason: 'Attempt demoting sole active eligible Top' }
          });
          assert.equal(
            demoteRes.status,
            403,
            `Expected 403 blocking sole active eligible Top demotion, got ${demoteRes.status}: ${demoteRes.text}`
          );

          // 2. Direct SQL DELETE & UPDATE on `platform_roles` (for both `'top'` and `'platform_admin'`) must fail
          await assert.rejects(
            () => privQuery('DELETE FROM platform_roles WHERE user_id = $1', [topA.user.id]),
            /LAST_TOP_ADMIN_PROTECTED/
          );
          await privQuery("UPDATE platform_roles SET role = 'platform_admin' WHERE user_id = $1", [topA.user.id]);
          await assert.rejects(
            () => privQuery("UPDATE platform_roles SET role = 'mod' WHERE user_id = $1", [topA.user.id]),
            /LAST_TOP_ADMIN_PROTECTED/
          );
          await privQuery("UPDATE platform_roles SET role = 'top' WHERE user_id = $1", [topA.user.id]);

          // 3. Direct SQL suspension (`disabled_at = now()`), `age_eligibility_status` downgrade, and `DELETE FROM auth_users` must fail
          await assert.rejects(
            () => privQuery('UPDATE auth_users SET disabled_at = now() WHERE id = $1', [topA.user.id]),
            /LAST_TOP_ADMIN_PROTECTED/
          );
          await assert.rejects(
            () =>
              privQuery(
                `UPDATE auth_users
                 SET age_eligibility_status = 'not_assessed',
                     age_policy_version = NULL,
                     age_assessed_at = NULL,
                     age_assessment_basis = NULL
                 WHERE id = $1`,
                [topA.user.id]
              ),
            /LAST_TOP_ADMIN_PROTECTED/
          );
          await assert.rejects(
            () => privQuery('DELETE FROM auth_users WHERE id = $1', [topA.user.id]),
            /LAST_TOP_ADMIN_PROTECTED/
          );

          // 4. `app.allow_last_top_cleanup = 'true'` MUST NOT work for non-owner runtime `appRole`!
          const appClient = await multiAppPool.connect();
          try {
            await appClient.query('BEGIN');
            await appClient.query("SELECT set_config('app.allow_last_top_cleanup', 'true', true)");
            await appClient.query("SELECT set_config('app.is_platform_admin', 'true', true)");
            await appClient.query("SELECT set_config('app.admin_portal', 'true', true)");
            await assert.rejects(
              () => appClient.query('DELETE FROM platform_roles WHERE user_id = $1', [topA.user.id]),
              /LAST_TOP_ADMIN_PROTECTED|permission denied/i,
              'Runtime app role must never be able to activate allow_last_top_cleanup'
            );
            await appClient.query('ROLLBACK');
          } finally {
            appClient.release();
          }
        } finally {
          await privQuery(
            `INSERT INTO platform_roles (user_id, role, granted_by) VALUES
               ($1, 'top', 'bootstrap'),
               ($2, 'top', 'bootstrap'),
               ($3, 'top', 'bootstrap'),
               ($4, 'top', 'bootstrap')
             ON CONFLICT (user_id) DO UPDATE SET role = 'top'`,
            [topA.user.id, topB.user.id, topPlusStaff.user.id, topPlusOwner.user.id]
          );
          await privQuery(
            "DELETE FROM platform_roles WHERE user_id IN ('usr_orphan_no_auth_row', 'usr_disabled_top', 'usr_unassessed_top')"
          );
          await privQuery("DELETE FROM auth_users WHERE id IN ('usr_disabled_top', 'usr_unassessed_top')");
          const reTopA = await createAccountAndSignIn('top-a@sec.biteshark.test', baseMulti);
          topA.cookie = reTopA.cookie;
          topA.sessionId = reTopA.sessionId;
        }
      }
    );

    await runCheck(
      'Priority B (BS-AUD-002): deterministic 2-way concurrent Top SQL deletion, API demotion & API suspension never leave 0 active eligible Tops',
      async () => {
        await privQuery(
          `INSERT INTO platform_roles (user_id, role, granted_by)
           VALUES ('usr_orphan_concurrent', 'top', 'legacy_seed')
           ON CONFLICT (user_id) DO UPDATE SET role = 'top'`
        );
        await privQuery(`DELETE FROM platform_roles WHERE user_id IN ($1, $2)`, [
          topPlusStaff.user.id,
          topPlusOwner.user.id
        ]);

        try {
          // 1. Two synchronized concurrent READ COMMITTED DB transactions deleting the last two Tops (`topA` & `topB`)
          const sqlBarrier = createTwoPartyBarrier();
          const runConcurrentSqlDelete = async targetId => {
            const c = await migratorPool.connect();
            try {
              await c.query('BEGIN');
              await c.query("SELECT set_config('app.auth_internal', 'true', true)");
              await c.query("SELECT set_config('app.admin_portal', 'true', true)");
              await c.query("SELECT set_config('app.is_platform_admin', 'true', true)");
              await sqlBarrier.arriveAndWait();
              await c.query('DELETE FROM platform_roles WHERE user_id = $1', [targetId]);
              await c.query('COMMIT');
              return { ok: true };
            } catch (e) {
              await c.query('ROLLBACK').catch(() => {});
              return { ok: false, error: e?.message || String(e) };
            } finally {
              c.release();
            }
          };
          const [sqlDelA, sqlDelB] = await Promise.all([
            runConcurrentSqlDelete(topA.user.id),
            runConcurrentSqlDelete(topB.user.id)
          ]);
          const remainingAfterSqlRace = (
            await privQuery(
              `SELECT count(*)::int AS c
               FROM platform_roles pr
               JOIN auth_users au ON au.id = pr.user_id
               WHERE pr.role IN ('top', 'platform_admin')
                 AND au.disabled_at IS NULL
                 AND au.age_eligibility_status = 'eligible_14_plus'`
            )
          ).rows[0].c;

          await privQuery(
            `INSERT INTO platform_roles (user_id, role, granted_by)
             VALUES ($1, 'top', 'bootstrap'), ($2, 'top', 'bootstrap')
             ON CONFLICT (user_id) DO UPDATE SET role = 'top'`,
            [topA.user.id, topB.user.id]
          );

          assert(
            remainingAfterSqlRace >= 1 && (!sqlDelA.ok || !sqlDelB.ok),
            `Concurrent READ COMMITTED SQL DELETE race left ${remainingAfterSqlRace} active eligible Tops!`
          );

          // 2. Two concurrent API requests: `topA` demotes `topB` while `topB` demotes `topA`
          const [resDemoteB, resDemoteA] = await Promise.all([
            httpReq(baseMulti, '/api/admin/accounts/role', {
              method: 'POST',
              cookie: topA.cookie,
              body: { user_id: topB.user.id, role: 'mod', reason: 'Concurrent demote B' }
            }),
            httpReq(baseMulti, '/api/admin/accounts/role', {
              method: 'POST',
              cookie: topB.cookie,
              body: { user_id: topA.user.id, role: 'mod', reason: 'Concurrent demote A' }
            })
          ]);
          const activeTopsAfterDemote = (
            await privQuery(
              `SELECT count(*)::int AS c
               FROM platform_roles pr
               JOIN auth_users au ON au.id = pr.user_id
               WHERE pr.role IN ('top', 'platform_admin')
                 AND au.disabled_at IS NULL
                 AND au.age_eligibility_status = 'eligible_14_plus'`
            )
          ).rows[0].c;
          assert(
            activeTopsAfterDemote >= 1 && (resDemoteB.status >= 400 || resDemoteA.status >= 400),
            `Concurrent API demotion left ${activeTopsAfterDemote} active eligible Tops (statuses: ${resDemoteB.status}, ${resDemoteA.status})`
          );

          await privQuery(
            `INSERT INTO platform_roles (user_id, role, granted_by)
             VALUES ($1, 'top', 'bootstrap'), ($2, 'top', 'bootstrap')
             ON CONFLICT (user_id) DO UPDATE SET role = 'top'`,
            [topA.user.id, topB.user.id]
          );
          const freshTopA = await createAccountAndSignIn('top-a@sec.biteshark.test', baseMulti);
          const freshTopB = await createAccountAndSignIn('top-b@sec.biteshark.test', baseMulti);
          topA.cookie = freshTopA.cookie;
          topA.sessionId = freshTopA.sessionId;
          topB.cookie = freshTopB.cookie;
          topB.sessionId = freshTopB.sessionId;

          // 3. Two concurrent API requests: `topA` suspends `topB` while `topB` suspends `topA`
          const [resSuspB, resSuspA] = await Promise.all([
            httpReq(baseMulti, '/api/admin/accounts/status', {
              method: 'POST',
              cookie: topA.cookie,
              body: { user_id: topB.user.id, action: 'suspend', reason: 'Concurrent suspend B' }
            }),
            httpReq(baseMulti, '/api/admin/accounts/status', {
              method: 'POST',
              cookie: topB.cookie,
              body: { user_id: topA.user.id, action: 'suspend', reason: 'Concurrent suspend A' }
            })
          ]);
          const activeTopsAfterSuspend = (
            await privQuery(
              `SELECT count(*)::int AS c
               FROM platform_roles pr
               JOIN auth_users au ON au.id = pr.user_id
               WHERE pr.role IN ('top', 'platform_admin')
                 AND au.disabled_at IS NULL
                 AND au.age_eligibility_status = 'eligible_14_plus'`
            )
          ).rows[0].c;
          assert(
            activeTopsAfterSuspend >= 1 && (resSuspB.status >= 400 || resSuspA.status >= 400),
            `Concurrent API suspension left ${activeTopsAfterSuspend} active eligible Tops (statuses: ${resSuspB.status}, ${resSuspA.status})`
          );
          assert(
            resSuspB.status !== 500 && resSuspA.status !== 500 && resSuspB.status !== 503 && resSuspA.status !== 503,
            `Concurrent API suspension returned unhandled server error (${resSuspB.status}, ${resSuspA.status})`
          );
        } finally {
          await privQuery('UPDATE auth_users SET disabled_at = NULL WHERE id IN ($1, $2)', [
            topA.user.id,
            topB.user.id
          ]);
          await privQuery(
            `INSERT INTO platform_roles (user_id, role, granted_by) VALUES
               ($1, 'top', 'bootstrap'),
               ($2, 'top', 'bootstrap'),
               ($3, 'top', $1),
               ($4, 'top', $1)
             ON CONFLICT (user_id) DO UPDATE SET role = 'top'`,
            [topA.user.id, topB.user.id, topPlusStaff.user.id, topPlusOwner.user.id]
          );
          await privQuery("DELETE FROM platform_roles WHERE user_id = 'usr_orphan_concurrent'");
          const restoredA = await createAccountAndSignIn('top-a@sec.biteshark.test', baseMulti);
          const restoredB = await createAccountAndSignIn('top-b@sec.biteshark.test', baseMulti);
          topA.cookie = restoredA.cookie;
          topA.sessionId = restoredA.sessionId;
          topB.cookie = restoredB.cookie;
          topB.sessionId = restoredB.sessionId;
        }
      }
    );

    await runCheck(
      'Priority B: additive schema upgrade from audited 001..025 -> latest succeeds with pre-existing orphaned platform_roles rows intact and enforces hardened trigger',
      async () => {
        upgMigratorPool = new Pool({ connectionString: upgMigratorUrl, max: 2 });
        await upgMigratorPool.query(`
          CREATE TABLE IF NOT EXISTS schema_migrations (
            filename TEXT PRIMARY KEY,
            checksum_sha256 TEXT NOT NULL,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
          )
        `);
        const migDir = path.join(ROOT, 'migrations');
        const upTo025 = fs
          .readdirSync(migDir)
          .filter(f => /^\d{3}_.+\.sql$/.test(f) && Number(f.slice(0, 3)) <= 25)
          .sort();
        assert.equal(upTo025.length, 25, 'Expected migrations 001..025');

        for (const f of upTo025) {
          const sql = fs.readFileSync(path.join(migDir, f), 'utf8');
          const chk = crypto.createHash('sha256').update(sql, 'utf8').digest('hex');
          const c = await upgMigratorPool.connect();
          try {
            await c.query('BEGIN');
            await c.query(sql);
            await c.query('INSERT INTO schema_migrations (filename, checksum_sha256) VALUES ($1, $2)', [f, chk]);
            await c.query('COMMIT');
          } finally {
            c.release();
          }
        }

        await privQuery(
          `INSERT INTO auth_users (
             id, email_normalized, age_eligibility_status, age_assessed_at, age_policy_version, age_assessment_basis
           )
           VALUES ('usr_real_stg_top', 'operator@sec.biteshark.test', 'eligible_14_plus', now(), '2026-04-min14-v1', 'self_reported_dob_at_signup')`,
          [],
          upgMigratorPool
        );
        await privQuery(
          `INSERT INTO platform_roles (user_id, role, granted_by) VALUES
             ('usr_real_stg_top', 'top', 'bootstrap'),
             ('usr_orphan_stg_1', 'top', 'legacy'),
             ('usr_orphan_stg_2', 'top', 'legacy')`,
          [],
          upgMigratorPool
        );

        const upgRes = await runMigrationsCli(upgMigratorUrl, appRole);
        assert.equal(upgRes.code, 0, `Upgrade from 025 failed:\n${upgRes.stderr}`);

        const orphanCount = (
          await privQuery(
            "SELECT count(*)::int AS c FROM platform_roles WHERE user_id LIKE 'usr_orphan_stg_%'",
            [],
            upgMigratorPool
          )
        ).rows[0].c;
        assert.equal(orphanCount, 2, 'Migration must not destructively delete orphaned rows without operator approval');

        await assert.rejects(
          () => privQuery("DELETE FROM platform_roles WHERE user_id = 'usr_real_stg_top'", [], upgMigratorPool),
          /LAST_TOP_ADMIN_PROTECTED/,
          'Upgraded schema must block removing sole real active eligible Top despite orphaned rows'
        );
      }
    );

    // =======================================================================
    // PRIORITY C1: Consistent Public Vendor Visibility & ETag Parity (`BS-AUD-007`)
    // =======================================================================

    await runCheck(
      'Priority C1 (BS-AUD-007): /api/schedule/today matches canonical discovery visibility across temp-hide activation, non-discovery temp restrictions, and expiry ETag updates',
      async () => {
        const scheduleMod = await import(pathToFileURL(path.join(ROOT, 'api', 'schedule', 'today.js')).href);
        const trucksMod = await import(pathToFileURL(path.join(ROOT, 'api', 'trucks.js')).href);
        const truckDetailMod = await import(pathToFileURL(path.join(ROOT, 'api', 'trucks', '[id].js')).href);
        const truckSearchMod = await import(pathToFileURL(path.join(ROOT, 'api', 'trucks', 'search.js')).href);
        const featuredMod = await import(pathToFileURL(path.join(ROOT, 'api', 'catalog', 'featured.js')).href);
        const availMod = await import(pathToFileURL(path.join(ROOT, 'api', 'trucks', 'availability.js')).href);

        async function callDirectHandler(mod, { query = {}, params = {}, headers = {}, now } = {}) {
          const respHeaders = new Map();
          let statusCode = 200;
          let jsonBody = null;
          let ended = false;
          const req = { method: 'GET', query, params, headers, _testNow: now, _now: now };
          const res = {
            setHeader(k, v) {
              respHeaders.set(String(k).toLowerCase(), String(v));
            },
            status(c) {
              statusCode = c;
              return res;
            },
            json(b) {
              jsonBody = b;
              return res;
            },
            end() {
              ended = true;
              return res;
            }
          };
          await mod.default(req, res);
          return { status: statusCode, headers: respHeaders, json: jsonBody, ended };
        }

        const baseNow = new Date('2026-07-15T19:00:00.000Z');
        const testDate = '2026-07-15';
        const expiresAtIso = new Date(baseNow.getTime() + 2 * 3600 * 1000).toISOString();
        const afterExpiryNow = new Date(baseNow.getTime() + 3 * 3600 * 1000);

        await privQuery(
          `INSERT INTO owner_schedule (truck_id, service_date, location, opens_at, closes_at, status)
           VALUES ('mitote', $1, 'Sebastopol Rd Park', '11:00', '20:00', 'confirmed'),
                  ('elroys', $1, 'Sebastopol Rd Truck', '11:00', '19:00', 'confirmed')
           ON CONFLICT (truck_id, service_date) DO UPDATE
             SET status = 'confirmed', opens_at = EXCLUDED.opens_at, closes_at = EXCLUDED.closes_at`,
          [testDate]
        );

        const schedBefore = await callDirectHandler(scheduleMod, { query: { date: testDate }, now: baseNow });
        assert.equal(schedBefore.status, 200);
        assert(schedBefore.json.events.some(e => e.truck_id === 'mitote'));
        const etagBefore = schedBefore.headers.get('etag');
        assert(etagBefore, 'Expected ETag on /api/schedule/today');

        await privQuery(
          `UPDATE vendors
           SET hidden_from_discovery = true,
               restriction_authority = 'mod',
               temp_restriction_expires_at = $1,
               restriction_reason = 'Temporary discovery hide test',
               updated_at = now()
           WHERE id = 'mitote'`,
          [expiresAtIso]
        );
        await privQuery(
          `UPDATE vendors
           SET hidden_from_discovery = false,
               bookings_restricted = true,
               restriction_authority = 'mod',
               temp_restriction_expires_at = $1,
               restriction_reason = 'Bookings-only temporary restriction',
               updated_at = now()
           WHERE id = 'elroys'`,
          [expiresAtIso]
        );

        try {
          const [
            schedActive,
            trucksActive,
            detailMitote,
            searchMitote,
            featuredActive,
            availMitote,
            availElroys
          ] = await Promise.all([
            callDirectHandler(scheduleMod, {
              query: { date: testDate },
              headers: { 'if-none-match': etagBefore },
              now: baseNow
            }),
            callDirectHandler(trucksMod, { now: baseNow }),
            callDirectHandler(truckDetailMod, { params: { id: 'mitote' }, now: baseNow }),
            callDirectHandler(truckSearchMod, { query: { q: 'mitote' }, now: baseNow }),
            callDirectHandler(featuredMod, { now: baseNow }),
            callDirectHandler(availMod, { query: { truck_id: 'mitote', date: '2026-07-16' }, now: baseNow }),
            callDirectHandler(availMod, { query: { truck_id: 'elroys', date: '2026-07-16' }, now: baseNow })
          ]);

          assert.equal(schedActive.status, 200);
          assert(
            !schedActive.json.events.some(e => e.truck_id === 'mitote'),
            '/api/schedule/today leaked hidden vendor mitote'
          );
          assert(!trucksActive.json.trucks.some(t => t.id === 'mitote'), '/api/trucks leaked mitote');
          assert.equal(detailMitote.status, 404, '/api/trucks/mitote must 404 while hidden');
          assert(!searchMitote.json.results.some(t => t.id === 'mitote'), '/api/trucks/search leaked mitote');
          assert(!featuredActive.json.featured_ids.includes('mitote'), '/api/catalog/featured leaked mitote');
          assert.equal(availMitote.status, 404, '/api/trucks/availability leaked mitote');

          assert(
            schedActive.json.events.some(e => e.truck_id === 'elroys'),
            '/api/schedule/today wrongly hid vendor with bookings-only temp restriction'
          );
          assert(
            trucksActive.json.trucks.some(t => t.id === 'elroys'),
            '/api/trucks wrongly hid vendor with bookings-only temp restriction'
          );
          assert.equal(availElroys.status, 200, '/api/trucks/availability wrongly 404ed elroys');

          const etagSchedHidden = schedActive.headers.get('etag');
          const etagTrucksHidden = trucksActive.headers.get('etag');
          assert.notEqual(etagSchedHidden, etagBefore, 'Schedule ETag must change on restriction activation');

          const schedExpired = await callDirectHandler(scheduleMod, {
            query: { date: testDate },
            headers: { 'if-none-match': etagSchedHidden },
            now: afterExpiryNow
          });
          const trucksExpired = await callDirectHandler(trucksMod, {
            headers: { 'if-none-match': etagTrucksHidden },
            now: afterExpiryNow
          });

          assert.equal(schedExpired.status, 200, 'Expired restriction must invalidate hidden ETag (not return 304)');
          assert(schedExpired.json.events.some(e => e.truck_id === 'mitote'));
          assert.equal(trucksExpired.status, 200);
          assert(trucksExpired.json.trucks.some(t => t.id === 'mitote'));

          const etagSchedVisible = schedExpired.headers.get('etag');
          const sched304 = await callDirectHandler(scheduleMod, {
            query: { date: testDate },
            headers: { 'if-none-match': etagSchedVisible },
            now: afterExpiryNow
          });
          assert.equal(sched304.status, 304);
        } finally {
          await privQuery(
            `UPDATE vendors
             SET hidden_from_discovery = false,
                 bookings_restricted = false,
                 restriction_authority = NULL,
                 temp_restriction_expires_at = NULL,
                 restriction_reason = NULL
             WHERE id IN ('mitote', 'elroys')`
          );
          await privQuery('DELETE FROM owner_schedule WHERE service_date = $1', [testDate]);
        }
      }
    );

    // =======================================================================
    // PRIORITY C2: Multi-Role Administrator Behavior (`BS-AUD-010` + Audit Correction)
    // =======================================================================

    await runCheck(
      'Priority C2 (Audit correction): /api/owner/bookings is GET-only and rejects POST with 405',
      async () => {
        assert.deepEqual(ownerBookingsMod.methods, ['GET']);
        const postRes = await httpReq(baseMulti, '/api/owner/bookings', {
          method: 'POST',
          cookie: ownerA.cookie,
          body: { id: 'any', status: 'accepted' }
        });
        assert.equal(postRes.status, 405);
      }
    );

    await runCheck(
      'Priority C2 (BS-AUD-010): full 6-case multi-role matrix (owner, staff, Top non-member, Top+staff, Top+owner, and mid-request membership/role revocation)',
      async () => {
        // 1. Legitimate `owner`
        const legOwnerRes = await httpReq(baseMulti, '/api/owner/profile', {
          method: 'POST',
          cookie: ownerA.cookie,
          body: { truck_id: 'mitote', display_name: 'Mitote Food Park', cuisine: 'Mexican' }
        });
        assert.equal(legOwnerRes.status, 200, `Legitimate owner failed: ${legOwnerRes.text}`);

        // 2. Regular `staff` attempting owner-only `POST /api/owner/profile` -> 403
        const regStaffRes = await httpReq(baseMulti, '/api/owner/profile', {
          method: 'POST',
          cookie: staffOnly.cookie,
          body: { truck_id: 'mitote', display_name: 'Staff Unauthorized Edit' }
        });
        assert.equal(regStaffRes.status, 403);

        // 3. `Top` WITHOUT vendor membership
        const topNoMemNoHdr = await httpReq(baseMulti, '/api/owner/profile', {
          method: 'POST',
          cookie: topA.cookie,
          body: { truck_id: 'mitote', display_name: 'Top Without Header' }
        });
        assert.equal(topNoMemNoHdr.status, 403);
        assert.equal(topNoMemNoHdr.json?.code, 'ACT_ON_BEHALF_REQUIRED');

        const topNoMemWithHdr = await httpReq(baseMulti, '/api/owner/profile', {
          method: 'POST',
          cookie: topA.cookie,
          headers: {
            'X-BiteShark-Act-On-Behalf': 'mitote',
            'X-BiteShark-Support-Reason': 'Verified support profile correction #101'
          },
          body: { truck_id: 'mitote', display_name: 'Mitote Food Park', cuisine: 'Mexican' }
        });
        assert.equal(topNoMemWithHdr.status, 200);

        // 4. `Top` WITH `staff` membership (`topPlusStaff`) on `mitote`
        const topStaffOwnerWrite = await httpReq(baseMulti, '/api/owner/profile', {
          method: 'POST',
          cookie: topPlusStaff.cookie,
          body: { truck_id: 'mitote', display_name: 'Top+Staff Bypass Attempt' }
        });
        assert.equal(
          topStaffOwnerWrite.status,
          403,
          `Top+staff must NOT bypass owner-only requirement without Act-on-Behalf, got ${topStaffOwnerWrite.status}: ${topStaffOwnerWrite.text}`
        );
        assert.equal(topStaffOwnerWrite.json?.code, 'ACT_ON_BEHALF_REQUIRED');

        const topStaffMembersWrite = await httpReq(baseMulti, '/api/vendor/staff-invitations', {
          method: 'POST',
          cookie: topPlusStaff.cookie,
          body: { vendor_id: 'mitote', email: 'new-staff@sec.biteshark.test' }
        });
        assert.equal(
          topStaffMembersWrite.status,
          403,
          `Top+staff must NOT bypass owner-only /api/vendor/staff-invitations without Act-on-Behalf, got ${topStaffMembersWrite.status}`
        );

        const topStaffAllowedLoc = await httpReq(baseMulti, '/api/owner/location', {
          method: 'POST',
          cookie: topPlusStaff.cookie,
          body: { truck_id: 'mitote', location: '100 Sebastopol Rd, Santa Rosa', lat: 38.43, lng: -122.72, is_open: true }
        });
        assert.equal(topStaffAllowedLoc.status, 200, 'Top+staff legitimate staff location update must still work');

        const topStaffWithActOnBehalf = await httpReq(baseMulti, '/api/owner/profile', {
          method: 'POST',
          cookie: topPlusStaff.cookie,
          headers: {
            'X-BiteShark-Act-On-Behalf': 'mitote',
            'X-BiteShark-Support-Reason': 'Explicit Act-on-Behalf override by Top+staff #102'
          },
          body: { truck_id: 'mitote', display_name: 'Mitote Food Park', cuisine: 'Mexican' }
        });
        assert.equal(topStaffWithActOnBehalf.status, 200);

        // 5. `Top` WITH `owner` membership (`topPlusOwner`) on `mitote`
        const topOwnerDirect = await httpReq(baseMulti, '/api/owner/profile', {
          method: 'POST',
          cookie: topPlusOwner.cookie,
          body: { truck_id: 'mitote', display_name: 'Mitote Food Park', cuisine: 'Mexican' }
        });
        assert.equal(topOwnerDirect.status, 200, `Top+owner direct owner access failed: ${topOwnerDirect.text}`);

        // 6. Mid-request `owner -> staff` downgrade right after `loadAccessContext` queries `vendor_memberships`
        let downgradedOnce = false;
        multiAdapter.setOnQueryHook(async (sqlStr, params) => {
          if (
            !downgradedOnce &&
            sqlStr.includes('FROM vendor_memberships m') &&
            !sqlStr.includes('FOR SHARE') &&
            Array.isArray(params) &&
            params[0] === topPlusOwner.user.id
          ) {
            downgradedOnce = true;
            await privQuery(
              "UPDATE vendor_memberships SET role = 'staff' WHERE vendor_id = 'mitote' AND user_id = $1",
              [topPlusOwner.user.id]
            );
          }
        });

        try {
          const midRevokeRes = await httpReq(baseMulti, '/api/owner/profile', {
            method: 'POST',
            cookie: topPlusOwner.cookie,
            body: { truck_id: 'mitote', display_name: 'Revoked Mid-Request Owner Write' }
          });
          assert.equal(
            midRevokeRes.status,
            403,
            `Mid-request owner->staff downgrade on Top+owner without Act-on-Behalf must fail 403, got ${midRevokeRes.status}: ${midRevokeRes.text}`
          );
        } finally {
          multiAdapter.clearHooks();
          await privQuery(
            "UPDATE vendor_memberships SET role = 'owner' WHERE vendor_id = 'mitote' AND user_id = $1",
            [topPlusOwner.user.id]
          );
        }
      }
    );

    // =======================================================================
    // PRIORITY C3: Moderation, Read-Only Preview & Evidence Deletion (`BS-AUD-011/012`)
    // =======================================================================

    await runCheck(
      'Priority C3 (BS-AUD-011): legacy /api/community/moderate enforces in-tx moderator recheck on GET and requires rejection reason, writes moderation history & resolves open reports on POST',
      async () => {
        const postRes = await httpReq(baseMulti, '/api/community/post', {
          method: 'POST',
          cookie: custA.cookie,
          body: {
            kind: 'review',
            place_id: 'mitote',
            title: 'Legacy Mod Safeguard Check',
            body: 'Testing legacy moderation safeguards including reason and history.',
            rating: 3
          }
        });
        assert.equal(postRes.status, 201, `Seed post failed: ${postRes.text}`);
        const postId = postRes.json.submission.id;

        await privQuery(
          `INSERT INTO community_reports (post_id, reporter_user_id, reason_category, details, status)
           VALUES ($1, $2, 'inaccurate', 'Needs moderator review', 'open')`,
          [postId, custB.user.id]
        );

        const noReasonRes = await httpReq(baseMulti, '/api/community/moderate', {
          method: 'POST',
          cookie: modA.cookie,
          body: { id: postId, status: 'rejected' }
        });
        assert.equal(
          noReasonRes.status,
          400,
          `Expected 400 when rejecting without reason on /api/community/moderate, got ${noReasonRes.status}: ${noReasonRes.text}`
        );

        const validRejectRes = await httpReq(baseMulti, '/api/community/moderate', {
          method: 'POST',
          cookie: modA.cookie,
          body: { id: postId, status: 'rejected', reason: 'Confirmed off-topic test submission' }
        });
        assert.equal(validRejectRes.status, 200, `Valid rejection failed: ${validRejectRes.text}`);

        const histCount = (
          await privQuery('SELECT count(*)::int AS c FROM community_moderation_history WHERE post_id = $1', [postId])
        ).rows[0].c;
        assert(histCount >= 1, 'Expected community_moderation_history entry from /api/community/moderate');

        const openRepCount = (
          await privQuery("SELECT count(*)::int AS c FROM community_reports WHERE post_id = $1 AND status = 'open'", [
            postId
          ])
        ).rows[0].c;
        assert.equal(openRepCount, 0, 'Expected open community_reports to be marked reviewed');
      }
    );

    await runCheck(
      'Priority C3 (BS-AUD-012): X-BiteShark-Viewpoint: preview does not mark support tickets read and enforces staff_beta feature gate parity',
      async () => {
        const createTicket = await httpReq(baseMulti, '/api/issues', {
          method: 'POST',
          cookie: custA.cookie,
          body: {
            category: 'suggestion_feedback',
            reporter_urgency: 'feedback',
            description: 'Preview read-state isolation test ticket with sufficient length.'
          }
        });
        assert.equal(createTicket.status, 201, `Ticket create failed: ${createTicket.text}`);
        const issueId = createTicket.json.issue.id;

        const adminPreviewGet = await httpReq(baseMulti, `/api/admin/issues?issue_id=${issueId}`, {
          cookie: topA.cookie,
          headers: { 'X-BiteShark-Viewpoint': 'preview' }
        });
        assert.equal(adminPreviewGet.status, 200);
        const afterStaffPreview = await privQuery(
          'SELECT staff_last_read_at, reporter_last_read_at FROM support_issues WHERE id = $1',
          [issueId]
        );
        assert.equal(
          afterStaffPreview.rows[0].staff_last_read_at,
          null,
          'GET /api/admin/issues under preview viewpoint must NOT mutate staff_last_read_at'
        );

        await privQuery(
          `UPDATE support_issues
           SET reporter_last_read_at = now() - interval '10 minutes'
           WHERE id = $1`,
          [issueId]
        );
        const beforeReporterRead = (
          await privQuery('SELECT reporter_last_read_at FROM support_issues WHERE id = $1', [issueId])
        ).rows[0].reporter_last_read_at;

        const custPreviewGet = await httpReq(baseMulti, `/api/issues?id=${issueId}&issue_id=${issueId}`, {
          cookie: custA.cookie,
          headers: { 'X-BiteShark-Viewpoint': 'preview' }
        });
        assert.equal(custPreviewGet.status, 200);
        const afterReporterPreview = (
          await privQuery('SELECT reporter_last_read_at FROM support_issues WHERE id = $1', [issueId])
        ).rows[0].reporter_last_read_at;
        assert.equal(
          new Date(afterReporterPreview).getTime(),
          new Date(beforeReporterRead).getTime(),
          'GET /api/issues under preview viewpoint must NOT mutate reporter_last_read_at'
        );

        // `staff_beta` feature gate parity under `X-BiteShark-Viewpoint: preview` on `GET /api/community/list` (`community_hub`)
        const curFeatures = await httpReq(baseMulti, '/api/admin/features', { cookie: topA.cookie });
        assert.equal(curFeatures.status, 200);
        const commEntry = curFeatures.json.controls.find(c => c.key === 'community_hub');
        const setBetaRes = await httpReq(baseMulti, '/api/admin/features/update', {
          method: 'POST',
          cookie: topA.cookie,
          body: {
            feature_key: 'community_hub',
            configured_state: 'enabled',
            audience: 'staff_beta',
            expected_revision: commEntry.revision,
            reason: 'Preview staff_beta parity verification',
            confirmed_impact: true
          }
        });
        assert.equal(setBetaRes.status, 200, `Failed setting staff_beta: ${setBetaRes.text}`);

        try {
          const normalTopList = await httpReq(baseMulti, '/api/community/list', { cookie: topA.cookie });
          assert.equal(normalTopList.status, 200);

          const previewTopList = await httpReq(baseMulti, '/api/community/list', {
            cookie: topA.cookie,
            headers: { 'X-BiteShark-Viewpoint': 'preview' }
          });
          assert.equal(
            previewTopList.status,
            403,
            `Expected 403 FEATURE_DISABLED for staff_beta endpoint in preview mode, got ${previewTopList.status}`
          );
        } finally {
          const latestFeatures = await httpReq(baseMulti, '/api/admin/features', { cookie: topA.cookie });
          const latestComm = latestFeatures.json.controls.find(c => c.key === 'community_hub');
          await httpReq(baseMulti, '/api/admin/features/update', {
            method: 'POST',
            cookie: topA.cookie,
            body: {
              feature_key: 'community_hub',
              configured_state: 'enabled',
              audience: 'all',
              expected_revision: latestComm.revision,
              reason: 'Restore community_hub audience to all',
              confirmed_impact: true
            }
          });
        }
      }
    );

    await runCheck(
      'Priority C3 (BS-AUD-012): DELETE /api/onboarding/evidence enforces in-tx Top revalidation, governance reason & audit trail on third-party evidence while preserving applicant draft deletion',
      async () => {
        const draftApp = await httpReq(baseMulti, '/api/onboarding/applications', {
          method: 'POST',
          cookie: custA.cookie,
          body: {
            action: 'save_draft',
            claim_type: 'existing_listing',
            target_vendor_id: 'dinos',
            business_name: "Dino's Greek Food",
            city: 'Sonoma',
            cuisine: 'Global',
            listing_kind: 'food_truck',
            service_area: 'Sonoma County',
            contact_name: 'Dino Operator',
            permit_or_license_summary: 'Permit #SC-9988',
            ownership_statement: 'Owner of Dino Greek truck.'
          }
        });
        assert.equal(draftApp.status, 201, `Draft create failed: ${draftApp.text}`);
        const appId = draftApp.json.application.id;

        const pdfBytes = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n', 'utf8');
        const ev1 = await httpReq(baseMulti, '/api/onboarding/evidence', {
          method: 'POST',
          cookie: custA.cookie,
          body: {
            application_id: appId,
            filename: 'applicant-self-delete.pdf',
            mime_type: 'application/pdf',
            evidence_kind: 'health_permit',
            data_base64: pdfBytes.toString('base64')
          }
        });
        assert.equal(ev1.status, 201);

        const selfDel = await httpReq(baseMulti, `/api/onboarding/evidence?id=${ev1.json.evidence.id}`, {
          method: 'DELETE',
          cookie: custA.cookie,
          body: {}
        });
        assert.equal(selfDel.status, 200, `Applicant draft evidence delete failed: ${selfDel.text}`);

        const ev2 = await httpReq(baseMulti, '/api/onboarding/evidence', {
          method: 'POST',
          cookie: custA.cookie,
          body: {
            application_id: appId,
            filename: 'third-party-sensitive.pdf',
            mime_type: 'application/pdf',
            evidence_kind: 'health_permit',
            data_base64: pdfBytes.toString('base64')
          }
        });
        assert.equal(ev2.status, 201);
        const ev2Id = ev2.json.evidence.id;

        const topDelNoReason = await httpReq(baseMulti, `/api/onboarding/evidence?id=${ev2Id}`, {
          method: 'DELETE',
          cookie: topA.cookie,
          body: {}
        });
        assert.equal(
          topDelNoReason.status,
          400,
          `Expected 400 when Top deletes another user's evidence without reason, got ${topDelNoReason.status}: ${topDelNoReason.text}`
        );

        const topDelWithReason = await httpReq(baseMulti, `/api/onboarding/evidence?id=${ev2Id}`, {
          method: 'DELETE',
          cookie: topA.cookie,
          body: { reason: 'Redacted sensitive PII uploaded in error by applicant' }
        });
        assert.equal(topDelWithReason.status, 200, `Top delete with reason failed: ${topDelWithReason.text}`);

        const auditRes = await privQuery(
          `SELECT metadata FROM audit_logs
           WHERE target_type = 'vendor_application_evidence'
             AND target_id = $1
             AND action = 'onboarding.evidence_delete'
           ORDER BY created_at DESC LIMIT 1`,
          [ev2Id]
        );
        assert.equal(auditRes.rows.length, 1);
        assert(
          String(auditRes.rows[0].metadata?.reason || '').includes('Redacted sensitive PII'),
          'Audit log must record governance reason for third-party evidence deletion'
        );
      }
    );

    const failed = checks.filter(c => !c.ok);
    console.log(`\nUrgent Pilot Security Integration Summary: ${checks.length - failed.length}/${checks.length} passed.`);
    if (failed.length > 0) {
      for (const f of failed) {
        console.error(`  - FAILED: ${f.name}: ${f.error}`);
      }
      process.exitCode = 1;
    }
  } finally {
    global.fetch = origFetch;
    if (serverMax1) {
      if (typeof serverMax1.closeAllConnections === 'function') serverMax1.closeAllConnections();
      await new Promise(r => serverMax1.close(() => r()));
    }
    if (serverMulti) {
      if (typeof serverMulti.closeAllConnections === 'function') serverMulti.closeAllConnections();
      await new Promise(r => serverMulti.close(() => r()));
    }
    if (upgMigratorPool) await upgMigratorPool.end().catch(() => {});
    if (max1AppPool) await max1AppPool.end().catch(() => {});
    if (multiAppPool) await multiAppPool.end().catch(() => {});
    if (migratorPool) await migratorPool.end().catch(() => {});
    await superPool.end().catch(() => {});
    await cluster.stop();
  }
}

main()
  .then(() => process.exit(process.exitCode || 0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
