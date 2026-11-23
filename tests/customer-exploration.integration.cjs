// BiteShark Account-Backed Customer Exploration, Visit Journal, Private Photos,
// Badges, Weekly Challenges, Suggested Trails, Legacy Import, Feature Controls & Diagnostics
// Real-PostgreSQL + Real-Sharp Integration Suite (`tests/customer-exploration.integration.cjs`)

const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const sharp = require('sharp');

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
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'biteshark-exp-pg-'));
  const dataDir = path.join(tmpBase, 'data');
  const pwFile = path.join(tmpBase, 'pw.txt');
  const logFile = path.join(tmpBase, 'postgres.log');
  const password = 'exp_pw_' + crypto.randomBytes(6).toString('hex');
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

function runChild(args, env, timeoutMs = 20000) {
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

(async () => {
  const { Pool } = requirePg();
  const pgCluster = await createPostgresCluster();
  const suffix = crypto.randomBytes(3).toString('hex');
  const dbName = `biteshark_exp_${suffix}`;
  const migratorRole = `bs_exp_mig_${suffix}`;
  const appRole = `bs_exp_app_${suffix}`;
  const migratorPass = 'mig_' + crypto.randomBytes(8).toString('hex');
  const appPass = 'app_' + crypto.randomBytes(8).toString('hex');

  const photoStorageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-cust-photos-'));
  const adminPool = new Pool({ connectionString: pgCluster.adminUrl, max: 3 });
  let migratorPool = null;
  let appPool = null;
  let standalone = null;
  let standaloneRelease2 = null;

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
    assert(migRes.stdout.includes('"newly_applied":30'), `Expected 30 migrations: ${migRes.stdout}`);

    migratorPool = new Pool({ connectionString: migratorUrl, max: 4 });
    appPool = new Pool({ connectionString: appUrl, max: 10 });

    const port = await getFreePort();
    const baseOrigin = `http://127.0.0.1:${port}`;
    const mailboxSecret = 'mbx_' + crypto.randomBytes(24).toString('hex');
    const authSecret = crypto.randomBytes(32).toString('hex');

    process.env.BITESHARK_ENV = 'staging';
    process.env.BITESHARK_AUTH_START_IP_MAX = '200';
    process.env.BITESHARK_AUTH_VERIFY_IP_MAX = '200';
    process.env.BITESHARK_AUTH_SECRET = authSecret;
    process.env.BITESHARK_AUTH_DELIVERY_MODE = 'staging_mailbox';
    process.env.BITESHARK_STAGING_MAILBOX_SECRET = mailboxSecret;
    process.env.BITESHARK_STAGING_ALLOWED_EMAIL_DOMAINS = 'staging.biteshark.invalid';
    process.env.BITESHARK_PUSH_PROVIDER_MODE = 'disabled';
    process.env.BITESHARK_PHOTO_STORAGE_DIR = photoStorageDir;

    const expMod = await import(pathToFileURL(path.join(ROOT, 'lib', 'customer-exploration.js')).href);
    const diagMod = await import(pathToFileURL(path.join(ROOT, 'lib', 'diagnostics.js')).href);
    const { createStandaloneServer } = await import(pathToFileURL(path.join(ROOT, 'server', 'app.js')).href);

    standalone = createStandaloneServer({
      dbAdapter: appPool,
      releaseSha: 'exptest000000000000000000000000000000027'
    });
    await new Promise((resolve, reject) => {
      standalone.server.listen(port, '127.0.0.1', err => (err ? reject(err) : resolve()));
    });

    async function httpReq(relPath, { method = 'GET', cookie = '', headers = {}, body, rawBuffer = false } = {}) {
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
      if (rawBuffer) {
        const buf = Buffer.from(await res.arrayBuffer());
        return { status: res.status, headers: res.headers, buffer: buf };
      }
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
        body: { email, intent: 'signup', dob: '1992-07-15' }
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
    const userA = await signInEmail('alice-new@staging.biteshark.invalid');
    const userB = await signInEmail('bob-new@staging.biteshark.invalid');

    {
      const seedClient = await migratorPool.connect();
      try {
        await seedClient.query('BEGIN');
        await seedClient.query("SELECT set_config('app.auth_internal', 'true', true), set_config('app.is_platform_admin', 'true', true)");
        await seedClient.query(
          `INSERT INTO platform_roles (user_id, role, granted_by) VALUES ($1, 'top', 'bootstrap'), ($2, 'mod', $1)`,
          [topUser.user.id, modUser.user.id]
        );
        await seedClient.query('COMMIT');
      } finally {
        seedClient.release();
      }
    }

    // =========================================================================
    // 1. Authorization, RLS & Anonymous Access Rejection
    // =========================================================================
    for (const ep of [
      { path: '/api/me/exploration', method: 'GET' },
      { path: '/api/me/exploration/export', method: 'GET' },
      { path: '/api/me/exploration/import', method: 'POST', body: { visits: [] } },
      { path: '/api/me/visits', method: 'GET' },
      { path: '/api/me/visits', method: 'POST', body: { vendor_id: 'mitote' } },
      { path: '/api/me/visits/delete', method: 'POST', body: { visit_id: 'vst_fake' } },
      { path: '/api/me/photos', method: 'GET' },
      { path: '/api/me/photos', method: 'POST', body: {} },
      { path: '/api/me/photos/file?id=pht_fake&variant=thumb', method: 'GET' },
      { path: '/api/me/photos/delete', method: 'POST', body: { photo_id: 'pht_fake' } },
      { path: '/api/me/trails', method: 'GET' },
      { path: '/api/me/trails', method: 'POST', body: { stops: [{ vendor_id: 'mitote' }] } },
      { path: '/api/me/trails/delete', method: 'POST', body: { trail_id: 'trl_fake' } }
    ]) {
      const anonRes = await httpReq(ep.path, { method: ep.method, body: ep.body });
      assert.equal(anonRes.status, 401, `Anonymous ${ep.method} ${ep.path} must return 401, got ${anonRes.status}`);
    }

    // Direct PostgreSQL `NOBYPASSRLS` verification: without `app.user_id`, appRole sees 0 rows
    {
      const rlsClient = await appPool.connect();
      try {
        const r = await rlsClient.query('SELECT count(*)::int AS c FROM customer_visits');
        assert.equal(r.rows[0].c, 0);
      } finally {
        rlsClient.release();
      }
    }

    // Cross-origin CSRF rejection on cookie-authenticated write
    {
      const csrfRes = await httpReq('/api/me/visits', {
        method: 'POST',
        cookie: userA.cookie,
        headers: { Origin: 'https://evil.example' },
        body: { vendor_id: 'mitote' }
      });
      assert.equal(csrfRes.status, 403, 'Cross-origin write must be rejected by CSRF guard');
    }

    // Verify client-supplied `user_id` in body is ignored — User A's write binds solely to User A's session
    {
      const spoofRes = await httpReq('/api/me/visits', {
        method: 'POST',
        cookie: userA.cookie,
        body: {
          user_id: userB.user.id,
          vendor_id: 'mitote',
          private_note: 'First taco stop at Mitote',
          idempotency_key: 'idemp_visit_mitote_1'
        }
      });
      assert.equal(spoofRes.status, 201, `Expected 201, got ${spoofRes.status}: ${JSON.stringify(spoofRes.json)}`);
      assert.equal(spoofRes.headers.get('cache-control'), 'private, no-store, max-age=0');

      // User B sees 0 visits
      const bList = await httpReq('/api/me/visits', { cookie: userB.cookie });
      assert.equal(bList.status, 200);
      assert.equal(bList.json.visits.length, 0, 'User B must see 0 visits');

      // User B cannot delete User A's visit
      const bDel = await httpReq('/api/me/visits/delete', {
        method: 'POST',
        cookie: userB.cookie,
        body: { visit_id: spoofRes.json.visit.visit_id }
      });
      assert.equal(bDel.status, 404, 'User B deleting User A visit must return 404');
    }

    // =========================================================================
    // 2. Visits, Idempotency, Same-Day Dedup, Repeat Days, Timezone/DST & Taxonomy
    // =========================================================================
    // Idempotent replay with exact same idempotency_key returns `idempotent_replay: true`
    {
      const replay = await httpReq('/api/me/visits', {
        method: 'POST',
        cookie: userA.cookie,
        body: {
          vendor_id: 'mitote',
          private_note: 'First taco stop at Mitote',
          idempotency_key: 'idemp_visit_mitote_1'
        }
      });
      assert.equal(replay.status, 200);
      assert.equal(replay.json.idempotent_replay, true);
      assert.equal(replay.json.exploration.achievements.total_points, 25);
    }

    // Concurrent same-day duplicate submissions with DIFFERENT idempotency keys -> 0 duplicates, `already_logged_today: true`
    {
      const concurrent = await Promise.all(
        [1, 2, 3, 4].map(n =>
          httpReq('/api/me/visits', {
            method: 'POST',
            cookie: userA.cookie,
            body: { vendor_id: 'mitote', idempotency_key: `idemp_mitote_dup_${n}` }
          })
        )
      );
      for (const c of concurrent) {
        assert.equal(c.status, 200);
        assert.equal(c.json.already_logged_today, true);
        assert.equal(c.json.code, 'VISIT_ALREADY_LOGGED_TODAY');
      }
      const listAfter = await httpReq('/api/me/visits', { cookie: userA.cookie });
      assert.equal(listAfter.json.visits.length, 1, 'Still exactly 1 visit row for today');
    }

    // Direct service-level calendar/DST/Monday-rollover + repeat-visit-on-different-days verification on real DB!
    // User B logs `iniguez` on Sunday 2026-03-08 (DST spring-forward day, 23:30 PT = 2026-03-09T06:30:00Z -> still 2026-03-08 PT!)
    // and again on Monday 2026-03-09 (00:15 PT = 2026-03-09T07:15:00Z -> new week Monday 2026-03-09 PT!)
    // and again on Tuesday 2026-03-10 (12:00 PT = 2026-03-10T19:00:00Z -> 2nd visit in same Monday week to SAME business!)
    {
      const sunLateUtc = new Date('2026-03-09T06:30:00.000Z'); // 2026-03-08 23:30 PDT (Sunday)
      const monEarlyUtc = new Date('2026-03-09T07:15:00.000Z'); // 2026-03-09 00:15 PDT (Monday)
      const tueNoonUtc = new Date('2026-03-10T19:00:00.000Z'); // 2026-03-10 12:00 PDT (Tuesday)
      const fallBackBeforeMidnightUtc = new Date('2026-11-02T07:30:00.000Z'); // 2026-11-01 23:30 PST (DST fall-back Sunday)

      // Check DST fall-back boundary too via `logUserVisit`
      const bSun = await expMod.logUserVisit(appPool, {
        userId: userB.user.id,
        vendorId: 'iniguez',
        privateNote: 'Sunday night before midnight PT',
        now: sunLateUtc
      });
      assert.equal(bSun.created, true);
      assert.equal(bSun.visit.visit_local_date, '2026-03-08');
      assert.equal(bSun.exploration.weekly_challenge.week_start_date, '2026-03-02');
      assert.equal(bSun.exploration.weekly_challenge.progress_stops, 1);

      // 45 minutes later in UTC crosses Pacific midnight into Monday 2026-03-09 -> repeat visit allowed & starts new Monday week!
      const bMon = await expMod.logUserVisit(appPool, {
        userId: userB.user.id,
        vendorId: 'iniguez',
        privateNote: 'Monday just after midnight PT',
        now: monEarlyUtc
      });
      assert.equal(bMon.created, true);
      assert.equal(bMon.visit.visit_local_date, '2026-03-09');
      assert.equal(bMon.exploration.counts.total_visits, 2);
      assert.equal(bMon.exploration.counts.distinct_businesses, 1, 'Repeat visit to same business keeps distinct_businesses === 1');
      assert.equal(bMon.exploration.achievements.total_points, 50, '2 counted visits = 50 points (Neighborhood Regular)');
      assert.equal(bMon.exploration.achievements.current_level.title, 'Neighborhood Regular');
      assert.equal(bMon.exploration.weekly_challenge.week_start_date, '2026-03-09');
      assert.equal(bMon.exploration.weekly_challenge.progress_stops, 1, 'Sunday visit was in previous week; Monday has 1 stop');

      // Tuesday visit to SAME business (`iniguez`) on distinct day completes Weekly Challenge (`2 / 2`), while `neighborhood_scout` stays `1 / 3`!
      const bTue = await expMod.logUserVisit(appPool, {
        userId: userB.user.id,
        vendorId: 'iniguez',
        now: tueNoonUtc
      });
      assert.equal(bTue.created, true);
      assert.equal(bTue.exploration.weekly_challenge.progress_stops, 2);
      assert.equal(bTue.exploration.weekly_challenge.completed, true, 'Same business on 2 different days completes weekly challenge');
      const scoutBadge = bTue.exploration.achievements.badges.find(x => x.badge_id === 'neighborhood_scout');
      assert.equal(scoutBadge.current, 1);
      assert.equal(scoutBadge.earned, false, '3 visits to 1 business must NOT unlock 3-business Neighborhood Scout');

      // Fall-back DST night check (2026-11-01 23:30 PST)
      const bFall = await expMod.logUserVisit(appPool, {
        userId: userB.user.id,
        vendorId: 'fruta',
        now: fallBackBeforeMidnightUtc
      });
      assert.equal(bFall.visit.visit_local_date, '2026-11-01');
      assert.equal(bFall.exploration.weekly_challenge.week_start_date, '2026-10-26');

      // Clean up User B's test visits so User B starts clean again for cross-user isolation checks below
      for (const vid of [bSun.visit.visit_id, bMon.visit.visit_id, bTue.visit.visit_id, bFall.visit.visit_id]) {
        await expMod.deleteUserVisit(appPool, { userId: userB.user.id, visitId: vid });
      }
      const bClean = await httpReq('/api/me/exploration', { cookie: userB.cookie });
      assert.equal(bClean.json.achievements.total_points, 0);
    }

    // Taxonomy & Badge Accuracy for User A:
    // User A already visited `mitote` (Santa Rosa · Mexican).
    // Now visit `jalapeno` (`city = 'Sonoma County'` county-wide placeholder · Mexican):
    //   - `distinct_businesses` becomes 2
    //   - `distinct_towns` MUST stay 1 (`'Sonoma County'` must NOT unlock `Town Hopper`!)
    //   - `distinct_cuisines` MUST stay 1 (both Mexican)
    {
      const vJalapeno = await httpReq('/api/me/visits', {
        method: 'POST',
        cookie: userA.cookie,
        body: { vendor_id: 'jalapeno' }
      });
      assert.equal(vJalapeno.status, 201);
      assert.equal(vJalapeno.json.exploration.counts.distinct_businesses, 2);
      assert.equal(vJalapeno.json.exploration.counts.distinct_towns, 1, 'County-wide placeholder must not count as 2nd town');
      assert.equal(
        vJalapeno.json.exploration.achievements.badges.find(b => b.badge_id === 'town_hopper').earned,
        false
      );

      // Visit `farm-barn` (Petaluma · Farm Stands, `cuisine = 'Eggs & farm goods'`) and `farm-oakhill` (Glen Ellen · Farm Stands, `cuisine = 'Farm produce'`):
      //   - Both normalize to `'Farm Stands'` (1 cuisine category, NOT 2!)
      //   - Towns become Santa Rosa + Petaluma + Glen Ellen (`3` towns -> `Town Hopper` unlocked!)
      //   - Businesses become 4 (`Neighborhood Scout` unlocked!)
      await httpReq('/api/me/visits', {
        method: 'POST',
        cookie: userA.cookie,
        body: { vendor_id: 'farm-barn' }
      });
      const vOak = await httpReq('/api/me/visits', {
        method: 'POST',
        cookie: userA.cookie,
        body: { vendor_id: 'farm-oakhill' }
      });
      assert.equal(vOak.status, 201);
      assert.equal(vOak.json.exploration.counts.distinct_businesses, 4);
      assert.equal(vOak.json.exploration.counts.distinct_towns, 3);
      assert.equal(vOak.json.exploration.counts.distinct_cuisines, 2, 'Farm produce & Eggs & farm goods both normalize to Farm Stands');
      assert.equal(vOak.json.exploration.achievements.badges.find(b => b.badge_id === 'flavor_hopper').earned, false);

      // Visit `coffee-retrograde` (Sebastopol · Coffee & Cafes) -> 3rd normalized cuisine -> `Flavor Hopper` unlocks!
      const vCoffee = await httpReq('/api/me/visits', {
        method: 'POST',
        cookie: userA.cookie,
        body: { vendor_id: 'coffee-retrograde' }
      });
      assert.equal(vCoffee.status, 201);
      assert.equal(vCoffee.json.exploration.counts.distinct_cuisines, 3);
      assert.equal(vCoffee.json.exploration.achievements.badges.find(b => b.badge_id === 'flavor_hopper').earned, true);

      // Delete `coffee-retrograde` visit -> reversible progress drops `Flavor Hopper` back to locked and reduces points by 25!
      const delCoffee = await httpReq('/api/me/visits/delete', {
        method: 'POST',
        cookie: userA.cookie,
        body: { visit_id: vCoffee.json.visit.visit_id }
      });
      assert.equal(delCoffee.status, 200);
      assert.equal(delCoffee.json.deleted_visit_id, vCoffee.json.visit.visit_id);
      assert.equal(delCoffee.json.exploration.counts.distinct_cuisines, 2);
      assert.equal(delCoffee.json.exploration.achievements.badges.find(b => b.badge_id === 'flavor_hopper').earned, false);
      assert.equal(delCoffee.json.exploration.achievements.total_points, 100);
    }

    // =========================================================================
    // 3. Private Account-Backed Photos: EXIF Rotation + GPS Strip + Validation + Limits + Survival
    // =========================================================================
    let uploadedPhotoA = null;
    {
      // Create synthetic 120x80 JPEG with EXIF Orientation=6 and GPS coordinates + phone model
      const jpegWithGpsAndOrient = await sharp({
        create: { width: 120, height: 80, channels: 3, background: { r: 210, g: 85, b: 40 } }
      })
        .withMetadata({
          orientation: 6,
          exif: {
            IFD0: { Make: 'PrivateDeviceModelXYZ' },
            IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '38/1 26/1 25/1', GPSLongitudeRef: 'W', GPSLongitude: '122/1 42/1 50/1' }
          }
        })
        .jpeg()
        .toBuffer();

      assert(jpegWithGpsAndOrient.includes('PrivateDeviceModelXYZ'), 'Fixture must embed EXIF marker before upload');

      const upRes = await httpReq('/api/me/photos', {
        method: 'POST',
        cookie: userA.cookie,
        body: {
          vendor_id: 'mitote',
          caption: 'Crispy birria tacos private note',
          data_url: 'data:image/jpeg;base64,' + jpegWithGpsAndOrient.toString('base64'),
          idempotency_key: 'idemp_photo_a_1'
        }
      });
      assert.equal(upRes.status, 201, `Photo upload failed: ${JSON.stringify(upRes.json)}`);
      uploadedPhotoA = upRes.json.photo;
      assert.equal(uploadedPhotoA.width, 80, 'Orientation=6 must rotate 120x80 into 80x120');
      assert.equal(uploadedPhotoA.height, 120);
      assert.equal(upRes.json.exploration.achievements.badges.find(b => b.badge_id === 'photo_keeper').earned, true);
      assert.equal(upRes.json.exploration.achievements.total_points, 110); // 100 visit pts + 10 photo pts

      // Read back main & thumb via authorized endpoint; check private caching & stripped EXIF!
      const mainBin = await httpReq(`/api/me/photos/file?id=${uploadedPhotoA.photo_id}&variant=main`, {
        cookie: userA.cookie,
        rawBuffer: true
      });
      assert.equal(mainBin.status, 200);
      assert.equal(mainBin.headers.get('cache-control'), 'private, no-store, max-age=0');
      assert.equal(mainBin.headers.get('x-content-type-options'), 'nosniff');
      assert(!mainBin.buffer.includes('PrivateDeviceModelXYZ'), 'Stored JPEG must strip EXIF device/GPS metadata');
      const storedMeta = await sharp(mainBin.buffer).metadata();
      assert.equal(Boolean(storedMeta.exif), false, 'Stored JPEG must contain zero EXIF buffer');
      assert.equal(storedMeta.width, 80);
      assert.equal(storedMeta.height, 120);

      const thumbBin = await httpReq(`/api/me/photos/file?id=${uploadedPhotoA.photo_id}&variant=thumb`, {
        cookie: userA.cookie,
        rawBuffer: true
      });
      assert.equal(thumbBin.status, 200);
      assert.equal(thumbBin.headers.get('content-type'), 'image/webp');

      // User B MUST NOT read or delete User A's private photo!
      const bReadPhoto = await httpReq(`/api/me/photos/file?id=${uploadedPhotoA.photo_id}&variant=main`, {
        cookie: userB.cookie
      });
      assert.equal(bReadPhoto.status, 404);
      const bDelPhoto = await httpReq('/api/me/photos/delete', {
        method: 'POST',
        cookie: userB.cookie,
        body: { photo_id: uploadedPhotoA.photo_id }
      });
      assert.equal(bDelPhoto.status, 404);

      // No public web-root exposure (`/customer-photos/...` or `/uploads/...` 404s)
      const pubProbe = await httpReq(`/customer-photos/${uploadedPhotoA.photo_id}_main.jpg`);
      assert.notEqual(pubProbe.status, 200);

      // Simulated release switch: start a second server instance (`releaseSha: 'exptest_release_2'`) pointing to the same DB & external `photoStorageDir`
      const port2 = await getFreePort();
      standaloneRelease2 = createStandaloneServer({
        dbAdapter: appPool,
        releaseSha: 'exptest000000000000000000000000000000028'
      });
      await new Promise((resolve, reject) => {
        standaloneRelease2.server.listen(port2, '127.0.0.1', err => (err ? reject(err) : resolve()));
      });
      const rel2Res = await fetch(`http://127.0.0.1:${port2}/api/me/photos/file?id=${uploadedPhotoA.photo_id}&variant=main`, {
        headers: { Cookie: userA.cookie }
      });
      assert.equal(rel2Res.status, 200, 'Uploaded private photos must survive application release switching');
      await new Promise(resolve => standaloneRelease2.server.close(() => resolve()));
      standaloneRelease2 = null;
    }

    // Reject false MIME / HTML / SVG / corrupt bytes / > 6000px dimensions / > 5 MB
    {
      const htmlSpoof = Buffer.from('<html><script>alert(1)</script></html>').toString('base64');
      const rHtml = await httpReq('/api/me/photos', {
        method: 'POST',
        cookie: userA.cookie,
        body: { data_url: `data:image/jpeg;base64,${htmlSpoof}` }
      });
      assert.equal(rHtml.status, 415);
      assert.equal(rHtml.json.code, 'UNSUPPORTED_PHOTO_FORMAT');

      // JPEG magic bytes followed by corrupt garbage
      const corruptJpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(128, 0x55)]).toString('base64');
      const rCorrupt = await httpReq('/api/me/photos', {
        method: 'POST',
        cookie: userA.cookie,
        body: { data_url: `data:image/jpeg;base64,${corruptJpeg}` }
      });
      assert.equal(rCorrupt.status, 422);

      // Oversized dimensions (`6100x20` PNG > `6000` max dimension)
      const widePng = await sharp({
        create: { width: 6100, height: 20, channels: 3, background: { r: 10, g: 20, b: 30 } }
      })
        .png()
        .toBuffer();
      const rWide = await httpReq('/api/me/photos', {
        method: 'POST',
        cookie: userA.cookie,
        body: { data_url: `data:image/png;base64,${widePng.toString('base64')}` }
      });
      assert.equal(rWide.status, 422);
      assert.equal(rWide.json.code, 'PHOTO_DIMENSIONS_EXCEEDED');

      // Oversized byte length (> 5 MB)
      const over5Mb = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(5 * 1024 * 1024 + 2048, 0x41)]).toString('base64');
      const rOver = await httpReq('/api/me/photos', {
        method: 'POST',
        cookie: userA.cookie,
        body: { data_url: `data:image/jpeg;base64,${over5Mb}` }
      });
      assert(rOver.status === 413, `Expected 413 for >5MB photo, got ${rOver.status}`);
    }

    // Disk-pressure (`507 PHOTO_STORAGE_LOW_DISK`) & unavailable storage (`503`) + zero orphan files on concurrent 12-photo cap!
    {
      const validPng = await sharp({
        create: { width: 48, height: 48, channels: 3, background: { r: 40, g: 140, b: 90 } }
      })
        .png()
        .toBuffer();
      const validWebp = await sharp({
        create: { width: 48, height: 48, channels: 3, background: { r: 90, g: 60, b: 150 } }
      })
        .webp()
        .toBuffer();

      // Simulate disk pressure via `BITESHARK_PHOTO_MIN_FREE_BYTES` impossibly high
      process.env.BITESHARK_PHOTO_MIN_FREE_BYTES = String(Number.MAX_SAFE_INTEGER);
      const rLowDisk = await httpReq('/api/me/photos', {
        method: 'POST',
        cookie: userB.cookie,
        body: { data_url: `data:image/png;base64,${validPng.toString('base64')}` }
      });
      assert.equal(rLowDisk.status, 507);
      assert.equal(rLowDisk.json.code, 'PHOTO_STORAGE_LOW_DISK');
      delete process.env.BITESHARK_PHOTO_MIN_FREE_BYTES;

      // Simulate missing storage path on staging -> `503 PHOTO_STORAGE_UNAVAILABLE`
      process.env.BITESHARK_PHOTO_STORAGE_DIR = path.join(photoStorageDir, 'nonexistent-subdir');
      const rMissingDir = await httpReq('/api/me/photos', {
        method: 'POST',
        cookie: userB.cookie,
        body: { data_url: `data:image/webp;base64,${validWebp.toString('base64')}` }
      });
      assert.equal(rMissingDir.status, 503);
      assert.equal(rMissingDir.json.code, 'PHOTO_STORAGE_UNAVAILABLE');
      process.env.BITESHARK_PHOTO_STORAGE_DIR = photoStorageDir;

      // Concurrent 15 photo uploads by User B -> strictly caps at 12 active photos (`PHOTO_LIMIT_REACHED` on extras) with ZERO orphan files!
      const burst = await Promise.all(
        Array.from({ length: 15 }, (_, idx) =>
          httpReq('/api/me/photos', {
            method: 'POST',
            cookie: userB.cookie,
            body: {
              caption: `Burst photo #${idx + 1}`,
              data_url: `data:image/png;base64,${validPng.toString('base64')}`
            }
          })
        )
      );
      const succeeded = burst.filter(r => r.status === 201);
      const capped = burst.filter(r => r.status === 409 && r.json?.code === 'PHOTO_LIMIT_REACHED');
      assert.equal(succeeded.length, 12, `Expected exactly 12 accepted photos under concurrency, got ${succeeded.length}`);
      assert.equal(capped.length, 3, `Expected 3 rejected with PHOTO_LIMIT_REACHED, got ${capped.length}`);

      const bPhotos = await httpReq('/api/me/photos', { cookie: userB.cookie });
      assert.equal(bPhotos.json.photos.length, 12);

      // Delete all 12 of User B's photos -> verify files & thumbnails are cleaned up from disk!
      for (const p of bPhotos.json.photos) {
        const del = await httpReq('/api/me/photos/delete', {
          method: 'POST',
          cookie: userB.cookie,
          body: { photo_id: p.photo_id }
        });
        assert.equal(del.status, 200);
      }
      const bAfterDel = await httpReq('/api/me/exploration', { cookie: userB.cookie });
      assert.equal(bAfterDel.json.counts.active_photos, 0);
      assert.equal(bAfterDel.json.achievements.total_points, 0);

      // Verify disk now contains ONLY User A's 2 files (1 main + 1 thumb)
      const allDiskFiles = [];
      for (const entry of fs.readdirSync(photoStorageDir)) {
        const sub = path.join(photoStorageDir, entry);
        if (fs.statSync(sub).isDirectory()) {
          for (const f of fs.readdirSync(sub)) allDiskFiles.push(f);
        }
      }
      assert.equal(allDiskFiles.length, 2, `Expected only User A's main+thumb files left on disk, found: ${allDiskFiles.join(', ')}`);
    }

    // =========================================================================
    // 4. Legacy Device Import & Account Export
    // =========================================================================
    {
      const legacyPayload = {
        visits: [
          { id: 'iniguez', at: '2026-10-12T19:30:00.000Z', note: 'Great carnitas tacos' },
          { id: 'iniguez', at: '2026-10-12T22:10:00.000Z', note: 'Same day duplicate in legacy store' },
          { id: 'iniguez', at: '2026-10-15T19:30:00.000Z', note: 'Repeat visit 3 days later' },
          { id: 'nonexistent-ghost-truck', at: '2026-10-16T18:00:00.000Z', note: 'Invalid vendor' },
          { id: 'fruta', at: 'not-a-valid-timestamp', note: 'Corrupt date' }
        ]
      };
      const imp1 = await httpReq('/api/me/exploration/import', {
        method: 'POST',
        cookie: userB.cookie,
        body: legacyPayload
      });
      assert.equal(imp1.status, 200);
      assert.equal(imp1.json.imported_count, 2, 'Two distinct Pacific dates for iniguez imported');
      assert.equal(imp1.json.already_present_count, 1, 'Same-day duplicate deduplicated');
      assert.equal(imp1.json.invalid_count, 2, 'Ghost vendor and corrupt timestamp reported as invalid');
      assert.equal(imp1.json.status_summary, 'partial_success');
      assert.equal(imp1.json.exploration.achievements.total_points, 50, 'Server recomputes 2 * 25 = 50 points');

      // Re-running identical legacy import is 100% idempotent (`imported_count: 0`, `already_present_count: 3`)
      const imp2 = await httpReq('/api/me/exploration/import', {
        method: 'POST',
        cookie: userB.cookie,
        body: legacyPayload
      });
      assert.equal(imp2.status, 200);
      assert.equal(imp2.json.imported_count, 0);
      assert.equal(imp2.json.already_present_count, 3);
      assert.equal(imp2.json.exploration.achievements.total_points, 50);

      // Account export (`GET /api/me/exploration/export`) returns complete structured snapshot
      const expRes = await httpReq('/api/me/exploration/export', { cookie: userB.cookie });
      assert.equal(expRes.status, 200);
      assert.equal(expRes.json.user_id, userB.user.id);
      assert.equal(expRes.json.visits.length, 2);
    }

    // =========================================================================
    // 5. Suggested Trails, Saved Trail Progress, Unpublished Vendor Safety & Editorial Stories
    // =========================================================================
    {
      // Editorial stories (`GET /api/stories`)
      const storiesRes = await httpReq('/api/stories');
      assert.equal(storiesRes.status, 200);
      assert.equal(storiesRes.json.stories.length, 5);
      for (const s of storiesRes.json.stories) {
        assert(s.story_id && s.vendor_id && s.source_url, `Story ${s.story_id} missing required fields`);
        assert.equal(s.media_kind, 'illustration', 'Stories without cleared photos must declare intentional illustration media_kind');
      }

      // `"Something sweet"` trail MUST return genuine sweet/dessert stops — NEVER Burger trucks (`munchiez`, `cichy`, `heritage`, `andrew`, `momolicious`)!
      const sweetRes = await httpReq('/api/trails/suggest?theme=sweet');
      assert.equal(sweetRes.status, 200);
      assert(sweetRes.json.stops.length >= 3);
      const sweetIds = sweetRes.json.stops.map(s => s.vendor_id);
      for (const badBurger of ['munchiez', 'cichy', 'heritage', 'andrew', 'momolicious']) {
        assert(!sweetIds.includes(badBurger), `"Something sweet" must not return savory/burger stop ${badBurger}`);
      }
      assert(sweetIds.includes('fruta') && sweetIds.includes('rich'), 'Primary sweet specialists prioritized');
      for (const stop of sweetRes.json.stops) {
        assert(stop.match_reason && stop.match_reason.length > 10, 'Every suggested stop must explain why it matches');
      }

      // Deterministic ranking: repeating exact same query returns identical ordered stops
      const sweetRes2 = await httpReq('/api/trails/suggest?theme=sweet');
      assert.deepEqual(sweetRes2.json.stops.map(s => s.vendor_id), sweetIds);

      // Insufficient matches (`town=Glen Ellen&theme=sweet` -> fewer than 3 stops, honest count!)
      const glenSweet = await httpReq('/api/trails/suggest?theme=sweet&town=' + encodeURIComponent('Glen Ellen'));
      assert.equal(glenSweet.status, 200);
      assert(glenSweet.json.stops.length < 3, 'Must return fewer than 3 stops when town lacks 3 reliable sweet matches');

      // Shared market venue deduplication (`town=Petaluma&theme=farm` -> `market-petaluma-east` and `market-boba` share Lucchesi Park; at most 1 stop from that shared venue!)
      const petFarm = await httpReq('/api/trails/suggest?theme=farm&town=Petaluma');
      assert.equal(petFarm.status, 200);
      assert.equal(new Set(petFarm.json.stops.map(s => s.vendor_id)).size, petFarm.json.stops.length);

      // Save trail for User A with ordered stops `['fruta', 'rich', 'elenita']`
      // Note: User A has NOT visited `fruta`, `rich`, or `elenita` yet -> progress starts at `0 / 3`!
      const saveTrailRes = await httpReq('/api/me/trails', {
        method: 'POST',
        cookie: userA.cookie,
        body: {
          title: 'My Saturday Sweet & Taco Idea',
          theme_key: 'sweet',
          stops: [
            { vendor_id: 'fruta', match_reason: 'Ice cream truck' },
            { vendor_id: 'rich', match_reason: 'Italian ice stop' },
            { vendor_id: 'elenita', match_reason: 'Roseland taco truck' }
          ],
          idempotency_key: 'idemp_trail_a_1'
        }
      });
      assert.equal(saveTrailRes.status, 201);
      assert.equal(saveTrailRes.json.trail.progress.completed_stops, 0);
      assert.equal(saveTrailRes.json.trail.progress.total_stops, 3);
      assert.deepEqual(
        saveTrailRes.json.trail.stops.map(s => s.vendor_id),
        ['fruta', 'rich', 'elenita']
      );

      // Log a visit to `rich` today -> Saved trail progress automatically updates to `1 / 3`!
      await httpReq('/api/me/visits', {
        method: 'POST',
        cookie: userA.cookie,
        body: { vendor_id: 'rich', private_note: 'Mango Italian ice' }
      });
      const trailsAfterVisit = await httpReq('/api/me/trails', { cookie: userA.cookie });
      assert.equal(trailsAfterVisit.json.trails[0].progress.completed_stops, 1);
      assert.equal(trailsAfterVisit.json.trails[0].stops[1].visited_since_save, true);

      // Temporarily hide `elenita` from discovery ->
      //  1) Public shared URL lookup `/api/trails/suggest?ids=fruta,rich,elenita` marks `elenita` `available: false` (`business_name: 'Unavailable listing'`) without leaking unpublished details or User A's private title/notes!
      //  2) User A's private saved trail preserves historical label (`business_status: 'unavailable'`, `can_open_detail: false`) safely!
      const modClient = await migratorPool.connect();
      try {
        await modClient.query("UPDATE vendors SET hidden_from_discovery = true WHERE id = 'elenita'");
        const publicShared = await httpReq('/api/trails/suggest?ids=fruta,rich,elenita');
        assert.equal(publicShared.status, 200);
        const pubElenita = publicShared.json.stops.find(s => s.vendor_id === 'elenita');
        assert.equal(pubElenita.available, false);
        assert.equal(pubElenita.business_name, 'Unavailable listing', 'Public shared URL must not leak unpublished business details');
        assert(!JSON.stringify(publicShared.json).includes('My Saturday Sweet'));

        const privateSaved = await httpReq('/api/me/trails', { cookie: userA.cookie });
        const elenitaStop = privateSaved.json.trails[0].stops.find(s => s.vendor_id === 'elenita');
        assert.equal(elenitaStop.business_status, 'unavailable');
        assert.equal(elenitaStop.can_open_detail, false);
        assert(elenitaStop.business_name.includes('Elenita'), 'Historical name snapshot preserved for owner of saved trail');
      } finally {
        await modClient.query("UPDATE vendors SET hidden_from_discovery = false WHERE id = 'elenita'");
        modClient.release();
      }
    }

    // =========================================================================
    // 6. Feature Controls (Top vs Mod RBAC, Independent Subfeatures, Parent DAG, Data Preservation)
    // =========================================================================
    async function setFeatureAsTop(featureKey, state, reason = 'Integration test verification on staging candidate') {
      const list = await httpReq('/api/admin/features', { cookie: topUser.cookie });
      const row = list.json.controls.find(f => f.key === featureKey);
      assert(row, `Feature ${featureKey} missing from /api/admin/features`);
      const upd = await httpReq('/api/admin/features/update', {
        method: 'POST',
        cookie: topUser.cookie,
        body: {
          feature_key: featureKey,
          configured_state: state,
          audience: 'all',
          reason,
          expected_revision: row.revision,
          confirmed_impact: true
        }
      });
      assert.equal(upd.status, 200, `Failed updating ${featureKey} -> ${state}: ${JSON.stringify(upd.json)}`);
      return upd.json.controls.find(f => f.key === featureKey);
    }

    {
      // Mod CANNOT mutate feature controls (`403`)
      const modAttempt = await httpReq('/api/admin/features/update', {
        method: 'POST',
        cookie: modUser.cookie,
        body: {
          feature_key: 'visit_journal',
          configured_state: 'paused',
          audience: 'all',
          expected_revision: 0,
          reason: 'Mod should not have permission'
        }
      });
      assert.equal(modAttempt.status, 403, 'Mods must not gain feature-control mutation access');

      // 6a. Hide `exploration_badges` and `weekly_challenges` ->
      //     `/api/me/exploration` hides badge & challenge presentation (`achievements_hidden: true`, `weekly_challenge_hidden: true`),
      //     while visits still log cleanly and underlying data is untouched!
      await setFeatureAsTop('exploration_badges', 'hidden');
      await setFeatureAsTop('weekly_challenges', 'hidden');
      const hiddenSummary = await httpReq('/api/me/exploration', { cookie: userA.cookie });
      assert.equal(hiddenSummary.status, 200);
      assert.equal(hiddenSummary.json.achievements_hidden, true);
      assert.equal(hiddenSummary.json.achievements, null);
      assert.equal(hiddenSummary.json.weekly_challenge_hidden, true);
      assert.equal(hiddenSummary.json.weekly_challenge, null);
      assert.equal(hiddenSummary.json.counts.total_visits, 5, 'Underlying visit count preserved');

      await setFeatureAsTop('exploration_badges', 'enabled');
      await setFeatureAsTop('weekly_challenges', 'enabled');
      const restoredSummary = await httpReq('/api/me/exploration', { cookie: userA.cookie });
      assert.equal(restoredSummary.json.achievements_hidden, false);
      assert.equal(restoredSummary.json.achievements.total_points, 135); // 5 visits (125) + 1 photo (10) = 135 (Local Insider!)
      assert.equal(restoredSummary.json.achievements.current_level.title, 'Local Insider');

      // 6b. Pause `visit_journal` -> `GET /api/me/visits` STILL works (`paused` allows reads!), `POST /api/me/visits` returns `503 FEATURE_DISABLED`!
      //     Meanwhile `private_photos` and `suggested_trails` remain `enabled`!
      await setFeatureAsTop('visit_journal', 'paused');
      const pausedRead = await httpReq('/api/me/visits', { cookie: userA.cookie });
      assert.equal(pausedRead.status, 200, 'Paused visit_journal still allows reading existing history');
      const pausedWrite = await httpReq('/api/me/visits', {
        method: 'POST',
        cookie: userA.cookie,
        body: { vendor_id: 'fruta' }
      });
      assert.equal(pausedWrite.status, 503);
      assert.equal(pausedWrite.json.code, 'FEATURE_PAUSED');
      assert.equal(pausedWrite.json.feature_key, 'visit_journal');

      // Hide `visit_journal` -> `GET /api/me/visits` returns `403 FEATURE_DISABLED`, BUT `/api/me/exploration/export` STILL works for privacy export!
      await setFeatureAsTop('visit_journal', 'hidden');
      const hiddenRead = await httpReq('/api/me/visits', { cookie: userA.cookie });
      assert.equal(hiddenRead.status, 403);
      assert.equal(hiddenRead.json.code, 'FEATURE_DISABLED');
      const exportWhileHidden = await httpReq('/api/me/exploration/export', { cookie: userA.cookie });
      assert.equal(exportWhileHidden.status, 200, 'Account privacy export must remain available even when UI feature is hidden');
      assert.equal(exportWhileHidden.json.visits.length, 5, 'Zero user data lost when feature is hidden');
      await setFeatureAsTop('visit_journal', 'enabled');

      // 6c. Hide `editorial_stories` -> `/api/stories` returns `403 FEATURE_DISABLED`; re-enable restores it
      await setFeatureAsTop('editorial_stories', 'hidden');
      const hiddenStories = await httpReq('/api/stories');
      assert.equal(hiddenStories.status, 403);
      assert.equal(hiddenStories.json.code, 'FEATURE_DISABLED');
      await setFeatureAsTop('editorial_stories', 'enabled');

      // 6d. Hide `suggested_trails` -> `/api/trails/suggest` and `/api/me/trails` return `403 FEATURE_DISABLED`, while `flavor_lab_tools` stays enabled; re-enable restores saved trail intact!
      await setFeatureAsTop('suggested_trails', 'hidden');
      const hiddenSuggest = await httpReq('/api/trails/suggest?theme=sweet');
      assert.equal(hiddenSuggest.status, 403);
      const hiddenSavedTrails = await httpReq('/api/me/trails', { cookie: userA.cookie });
      assert.equal(hiddenSavedTrails.status, 403);
      await setFeatureAsTop('suggested_trails', 'enabled');
      const restoredTrails = await httpReq('/api/me/trails', { cookie: userA.cookie });
      assert.equal(restoredTrails.status, 200);
      assert.equal(restoredTrails.json.trails.length, 1, 'Saved trail preserved across disable/re-enable');

      // 6e. Parent hub `local_guides_passport = hidden` cascades via DAG to `editorial_stories`, `visit_journal`, and `private_photos`!
      await setFeatureAsTop('local_guides_passport', 'hidden');
      const cascadedPhotoRead = await httpReq('/api/me/photos', { cookie: userA.cookie });
      assert.equal(cascadedPhotoRead.status, 403);
      assert.equal(cascadedPhotoRead.json.code, 'FEATURE_DISABLED');
      await setFeatureAsTop('local_guides_passport', 'enabled');
      const restoredPhotoRead = await httpReq('/api/me/photos', { cookie: userA.cookie });
      assert.equal(restoredPhotoRead.status, 200);
      assert.equal(restoredPhotoRead.json.photos.length, 1);
    }

    // =========================================================================
    // 7. Diagnostics Portal Integration, Redaction & Non-Cascading Fault Safety
    // =========================================================================
    {
      // Upload a corrupt image with a sensitive caption string `'MySecretCaptionToken999'` to trigger a diagnostic event,
      // then verify Top & Mod can filter `feature_key=private_photos` in `/api/admin/diagnostics` and that `'MySecretCaptionToken999'` is NEVER logged!
      const corruptBytes = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(96, 0x77)]).toString('base64');
      await httpReq('/api/me/photos', {
        method: 'POST',
        cookie: userA.cookie,
        body: {
          caption: 'MySecretCaptionToken999',
          data_url: `data:image/jpeg;base64,${corruptBytes}`
        }
      });

      const modDiagList = await httpReq('/api/admin/diagnostics?window=all&feature_key=private_photos', {
        cookie: modUser.cookie
      });
      assert.equal(modDiagList.status, 200);
      assert(modDiagList.json.items.length >= 1, 'Expected private_photos diagnostic group in portal');
      const grp = modDiagList.json.items[0];
      assert(grp.sanitized_summary && grp.user_impact && grp.safe_next_steps, 'Portal group must have human-readable fields');

      const rawSamples = await migratorPool.query(
        'SELECT sanitized_message, safe_context::text AS ctx FROM diagnostic_event_samples WHERE group_id = $1',
        [grp.id]
      );
      for (const s of rawSamples.rows) {
        assert(!String(s.sanitized_message || '').includes('MySecretCaptionToken999'), 'Private caption must never appear in diagnostic message');
        assert(!String(s.ctx || '').includes('MySecretCaptionToken999'), 'Private caption must never appear in diagnostic safe_context');
        assert(!String(s.ctx || '').includes(corruptBytes.slice(0, 24)), 'Raw photo base64 bytes must never appear in diagnostics');
      }

      // Fault-inject diagnostics backend -> customer visit write still succeeds!
      diagMod.__setDiagnosticsFaultInjectionForTests(() => {
        throw new Error('Simulated diagnostics DB outage');
      });
      try {
        const resUnderDiagFault = await httpReq('/api/me/visits', {
          method: 'POST',
          cookie: userA.cookie,
          body: { vendor_id: 'fruta', private_note: 'Diagnostic fault resilience check' }
        });
        assert.equal(resUnderDiagFault.status, 201, 'Diagnostics failure must never break customer actions');
      } finally {
        diagMod.__setDiagnosticsFaultInjectionForTests(null);
      }
    }

    // =========================================================================
    // 8. Integration Audit Regression Gate (Pre-Save Trail Timing, Hidden-Feature
    //    Privacy Export/Photo-Download/Delete, Photo Reconciliation, Pending-Age
    //    Public Allowlist, and Admin-Onboarded Vendor Taxonomy)
    // =========================================================================
    {
      // 8a. Pre-save same-day visit timing (`DEF-EXP-01`):
      //     User B logs a visit to `'fruta'` BEFORE saving a trail containing `['fruta', 'rich']` on the same day.
      //     The pre-save visit MUST NOT silently count as post-save trail progress (`completed_stops === 0`,
      //     `visited_since_save === false`, `visited_before_save_today === true`).
      const userC = await signInEmail('carol-timing@staging.biteshark.invalid');
      const preSaveVisit = await httpReq('/api/me/visits', {
        method: 'POST',
        cookie: userC.cookie,
        body: { vendor_id: 'fruta', private_note: 'Morning fruit bowl before trail saved' }
      });
      assert.equal(preSaveVisit.status, 201);

      await new Promise(resolve => setTimeout(resolve, 25));

      const saveAfterVisit = await httpReq('/api/me/trails', {
        method: 'POST',
        cookie: userC.cookie,
        body: {
          title: 'Afternoon Sweet Trail',
          theme_key: 'sweet',
          stops: [{ vendor_id: 'fruta' }, { vendor_id: 'rich' }]
        }
      });
      assert.equal(saveAfterVisit.status, 201);
      assert.equal(
        saveAfterVisit.json.trail.progress.completed_stops,
        0,
        'Visit logged earlier on the same day before saving trail must NOT count as post-save progress'
      );
      const frutaStop = saveAfterVisit.json.trail.stops.find(s => s.vendor_id === 'fruta');
      assert.equal(frutaStop.visited_since_save, false);
      assert.equal(frutaStop.visited_before_save_today, true, 'Must surface honest same-day pre-save indicator');

      // Same-day duplicate visit to `fruta` remains deduplicated (`200 VISIT_ALREADY_LOGGED_TODAY`) and still does not inflate post-save progress
      const sameDayRetry = await httpReq('/api/me/visits', {
        method: 'POST',
        cookie: userC.cookie,
        body: { vendor_id: 'fruta' }
      });
      assert.equal(sameDayRetry.status, 200);
      assert.equal(sameDayRetry.json.already_logged_today, true);

      // Post-save visit to `rich` (`visited_at >= trail.created_at`) DOES count (`1 / 2`)!
      await new Promise(resolve => setTimeout(resolve, 15));
      const postSaveVisit = await httpReq('/api/me/visits', {
        method: 'POST',
        cookie: userC.cookie,
        body: { vendor_id: 'rich', private_note: 'Post-save Italian ice' }
      });
      assert.equal(postSaveVisit.status, 201);
      const checkTrailsC = await httpReq('/api/me/trails', { cookie: userC.cookie });
      assert.equal(checkTrailsC.json.trails[0].progress.completed_stops, 1);
      assert.equal(checkTrailsC.json.trails[0].stops[0].visited_since_save, false);
      assert.equal(checkTrailsC.json.trails[0].stops[1].visited_since_save, true);

      // 8b. Privacy export, binary photo retrieval (`?download=1`), and self-service deletion
      //     while ALL exploration features are `hidden`, with strict cross-user ownership enforcement (`DEF-EXP-02`):
      const tinyPngBuf = await sharp({
        create: { width: 32, height: 32, channels: 3, background: { r: 22, g: 120, b: 88 } }
      })
        .png()
        .toBuffer();
      const cPhotoRes = await httpReq('/api/me/photos', {
        method: 'POST',
        cookie: userC.cookie,
        body: {
          vendor_id: 'rich',
          caption: 'Carol private photo for hidden-mode retrieval',
          data_url: `data:image/png;base64,${tinyPngBuf.toString('base64')}`
        }
      });
      assert.equal(cPhotoRes.status, 201);
      const cPhotoId = cPhotoRes.json.photo.photo_id;
      const cVisitId = postSaveVisit.json.visit.visit_id;
      const cTrailId = saveAfterVisit.json.trail.trail_id;

      await setFeatureAsTop('local_guides_passport', 'hidden');
      await setFeatureAsTop('visit_journal', 'hidden');
      await setFeatureAsTop('private_photos', 'hidden');
      await setFeatureAsTop('suggested_trails', 'hidden');

      try {
        // Standard browse endpoints remain gated (`403 FEATURE_DISABLED`)
        assert.equal((await httpReq('/api/me/photos', { cookie: userC.cookie })).status, 403);
        assert.equal((await httpReq('/api/me/visits', { cookie: userC.cookie })).status, 403);
        assert.equal((await httpReq('/api/me/trails', { cookie: userC.cookie })).status, 403);

        // Owner privacy export succeeds (`200`) and includes downloadable photo URL
        const cExport = await httpReq('/api/me/exploration/export', { cookie: userC.cookie });
        assert.equal(cExport.status, 200);
        const exportedPhoto = cExport.json.photos.find(p => p.photo_id === cPhotoId);
        assert(exportedPhoto && exportedPhoto.download_url.includes('download=1'));

        // Owner binary photo download succeeds (`200` + `Content-Disposition: attachment` + PNG signature) while feature is hidden!
        const ownerPhotoDl = await httpReq(exportedPhoto.download_url, {
          cookie: userC.cookie,
          rawBuffer: true
        });
        assert.equal(ownerPhotoDl.status, 200, 'Owner must be able to retrieve actual photo bytes when feature is hidden');
        assert(
          String(ownerPhotoDl.headers.get('content-disposition') || '').startsWith('attachment;'),
          'download=1 must set Content-Disposition: attachment'
        );
        assert.equal(ownerPhotoDl.buffer[0], 0x89);
        assert.equal(ownerPhotoDl.buffer[1], 0x50);

        // Cross-user and anonymous probes STILL fail (`404` / `401`) — never publicly exposed!
        assert.equal((await httpReq(exportedPhoto.download_url)).status, 401);
        assert.equal((await httpReq(exportedPhoto.download_url, { cookie: userA.cookie })).status, 404);
        assert.equal(
          (
            await httpReq('/api/me/photos/delete', {
              method: 'POST',
              cookie: userA.cookie,
              body: { photo_id: cPhotoId }
            })
          ).status,
          404,
          'Other user must never delete Carol photo'
        );

        // Owner self-service deletions succeed (`200`) even while all exploration features are hidden!
        const delPhotoHidden = await httpReq('/api/me/photos/delete', {
          method: 'POST',
          cookie: userC.cookie,
          body: { photo_id: cPhotoId }
        });
        assert.equal(delPhotoHidden.status, 200);
        assert.equal(delPhotoHidden.json.files_cleaned, true);

        const delVisitHidden = await httpReq('/api/me/visits/delete', {
          method: 'POST',
          cookie: userC.cookie,
          body: { visit_id: cVisitId }
        });
        assert.equal(delVisitHidden.status, 200);

        const delTrailHidden = await httpReq('/api/me/trails/delete', {
          method: 'POST',
          cookie: userC.cookie,
          body: { trail_id: cTrailId }
        });
        assert.equal(delTrailHidden.status, 200);
      } finally {
        await setFeatureAsTop('local_guides_passport', 'enabled');
        await setFeatureAsTop('visit_journal', 'enabled');
        await setFeatureAsTop('private_photos', 'enabled');
        await setFeatureAsTop('suggested_trails', 'enabled');
      }

      // 8c. Photo consistency reconciliation (`DEF-EXP-03`):
      //     Simulate (1) a soft-deleted photo row whose initial unlink failed (`files_purged_at IS NULL` with files still on disk),
      //     (2) an aged `.tmp-*` file, and (3) an aged unreferenced `pht_*` derivative file, while User A has an active photo.
      const reconUpload = await httpReq('/api/me/photos', {
        method: 'POST',
        cookie: userC.cookie,
        body: {
          caption: 'Simulated failed-unlink photo',
          data_url: `data:image/png;base64,${tinyPngBuf.toString('base64')}`
        }
      });
      assert.equal(reconUpload.status, 201);
      const reconPhotoId = reconUpload.json.photo.photo_id;

      let reconMainAbs = '';
      let reconThumbAbs = '';
      {
        const mc = await migratorPool.connect();
        try {
          await mc.query('BEGIN');
          await mc.query("SELECT set_config('app.photo_maintenance', 'true', true)");
          const reconPathsRes = await mc.query(
            'SELECT storage_rel_path, thumb_rel_path FROM customer_photos WHERE id = $1',
            [reconPhotoId]
          );
          reconMainAbs = path.join(photoStorageDir, ...reconPathsRes.rows[0].storage_rel_path.split('/'));
          reconThumbAbs = path.join(photoStorageDir, ...reconPathsRes.rows[0].thumb_rel_path.split('/'));
          assert(fs.existsSync(reconMainAbs) && fs.existsSync(reconThumbAbs));

          // Mark row soft-deleted WITHOUT unlinking files (`files_purged_at IS NULL`)
          await mc.query("SELECT set_config('app.user_id', $1, true)", [userC.user.id]);
          await mc.query(
            "UPDATE customer_photos SET deleted_at = now() - interval '20 minutes', files_purged_at = NULL WHERE id = $1",
            [reconPhotoId]
          );
          await mc.query('COMMIT');
        } finally {
          mc.release();
        }
      }

      // Create an aged `.tmp-*` file and an aged orphan `pht_*` file in shard `aa/`
      const orphanShardDir = path.join(photoStorageDir, 'aa');
      fs.mkdirSync(orphanShardDir, { recursive: true, mode: 0o700 });
      const staleTmpAbs = path.join(orphanShardDir, '.tmp-99999-aabbccddeeff');
      const orphanMainAbs = path.join(orphanShardDir, 'pht_aa11223344556677889900aabbccddee_main.jpg');
      fs.writeFileSync(staleTmpAbs, Buffer.from('partial'));
      fs.writeFileSync(orphanMainAbs, Buffer.from('orphan'));
      const twentyMinAgo = new Date(Date.now() - 20 * 60 * 1000);
      fs.utimesSync(staleTmpAbs, twentyMinAgo, twentyMinAgo);
      fs.utimesSync(orphanMainAbs, twentyMinAgo, twentyMinAgo);

      // Run Top Admin diagnostics & photo storage cleanup
      const adminCleanup = await httpReq('/api/admin/diagnostics/cleanup', {
        method: 'POST',
        cookie: topUser.cookie,
        body: {}
      });
      assert.equal(adminCleanup.status, 200);
      assert(adminCleanup.json.photo_reconciliation, 'Expected photo_reconciliation in cleanup response');
      assert.equal(adminCleanup.json.photo_reconciliation.pending_purges_completed, 1);
      assert.equal(adminCleanup.json.photo_reconciliation.stale_tmp_deleted, 1);
      assert.equal(adminCleanup.json.photo_reconciliation.orphan_files_deleted, 1);
      assert.equal(fs.existsSync(reconMainAbs), false, 'Failed-unlink main derivative must be purged');
      assert.equal(fs.existsSync(reconThumbAbs), false, 'Failed-unlink thumb derivative must be purged');
      assert.equal(fs.existsSync(staleTmpAbs), false, 'Aged .tmp-* file must be purged');
      assert.equal(fs.existsSync(orphanMainAbs), false, 'Aged orphan pht_* file must be purged');

      {
        const mc = await migratorPool.connect();
        try {
          await mc.query('BEGIN');
          await mc.query("SELECT set_config('app.photo_maintenance', 'true', true)");
          const verifyPurgedCol = await mc.query(
            'SELECT files_purged_at FROM customer_photos WHERE id = $1',
            [reconPhotoId]
          );
          await mc.query('COMMIT');
          assert(verifyPurgedCol.rows[0].files_purged_at, 'files_purged_at must be stamped after reconciliation');
        } finally {
          mc.release();
        }
      }

      // Verify User A's active photo was NOT touched by orphan cleanup!
      const userAPhotosStill = await httpReq('/api/me/photos', { cookie: userA.cookie });
      assert.equal(userAPhotosStill.status, 200);
      assert.equal(userAPhotosStill.json.photos.length, 1);
      const userAPhotoBytes = await httpReq(userAPhotosStill.json.photos[0].main_url, {
        cookie: userA.cookie,
        rawBuffer: true
      });
      assert.equal(userAPhotoBytes.status, 200, 'Active user photo must remain completely intact after reconciliation');

      // 8d. Signed-in `not_assessed` user (`requires_age_assessment = true`) can still browse public
      //     `/api/stories` and `/api/trails/suggest`, while `/api/me/*` returns `403 AGE_ASSESSMENT_REQUIRED` (`DEF-EXP-05`):
      const pendingUser = await signInEmail('pending-age-exp@staging.biteshark.invalid');
      await migratorPool.query(
        `BEGIN;
         SELECT set_config('app.auth_internal', 'true', true);
         UPDATE auth_users SET age_eligibility_status = 'not_assessed', age_policy_version = NULL, age_assessed_at = NULL, age_assessment_basis = NULL WHERE id = '${pendingUser.user.id}';
         COMMIT;`
      );
      assert.equal((await httpReq('/api/stories', { cookie: pendingUser.cookie })).status, 200);
      assert.equal((await httpReq('/api/trails/suggest?theme=sweet', { cookie: pendingUser.cookie })).status, 200);
      const blockedPersonal = await httpReq('/api/me/exploration', { cookie: pendingUser.cookie });
      assert.equal(blockedPersonal.status, 403);
      assert.equal(blockedPersonal.json.code, 'AGE_ASSESSMENT_REQUIRED');

      // 8e. Newly `/admin`-onboarded sweet vendor classifies & ranks in Suggested Trails without code edits (`DEF-EXP-04`):
      await migratorPool.query(
        `INSERT INTO vendors (id, sort_order, canonical_name, cuisine, city, listing_kind, blurb, curated_location, curated_location_source, curated_location_accuracy, is_active)
         VALUES ('sonoma-gelato-cart', 25, 'Sonoma Plaza Gelato Cart', 'Artisan Gelato & Sorbet', 'Sonoma', 'food_truck', 'Small-batch seasonal fruit gelato on Sonoma Plaza.', '453 1st St E, Sonoma', 'venue_published', 'venue_address', true);
         INSERT INTO owner_profiles (truck_id, display_name, cuisine, description, accepting_bookings)
         VALUES ('sonoma-gelato-cart', 'Sonoma Plaza Gelato Cart', 'Artisan Gelato & Sorbet', 'Fresh Sonoma gelato.', true);`
      );
      try {
        const sonomaSweet = await httpReq('/api/trails/suggest?theme=sweet&town=Sonoma');
        assert.equal(sonomaSweet.status, 200);
        assert(
          sonomaSweet.json.stops.some(s => s.vendor_id === 'sonoma-gelato-cart'),
          'Newly onboarded gelato vendor must classify automatically into sweet trails without hardcoded ID edits'
        );
      } finally {
        await migratorPool.query("DELETE FROM owner_profiles WHERE truck_id = 'sonoma-gelato-cart'");
        await migratorPool.query("DELETE FROM vendors WHERE id = 'sonoma-gelato-cart'");
      }
    }

    console.log(
      'PASS: Customer exploration PostgreSQL + Sharp integration suite (RLS & authz, repeat/same-day/DST/Monday visits, pre-save vs post-save trail timing, canonical taxonomy + dynamic onboarding, reversible deletes, EXIF rotation + GPS strip + 12-photo cap + failed-unlink/orphan reconciliation, idempotent legacy import + hidden-mode privacy export/download/delete, pending-age public allowlist, independent feature controls, and redacted non-cascading diagnostics)'
    );
  } finally {
    if (standaloneRelease2) {
      await new Promise(resolve => standaloneRelease2.server.close(() => resolve())).catch(() => {});
    }
    if (standalone) {
      await new Promise(resolve => standalone.server.close(() => resolve())).catch(() => {});
    }
    if (appPool) await appPool.end().catch(() => {});
    if (migratorPool) await migratorPool.end().catch(() => {});
    await adminPool.end().catch(() => {});
    await pgCluster.stop();
    try {
      fs.rmSync(photoStorageDir, { recursive: true, force: true });
    } catch {}
  }
})().catch(err => {
  console.error('CUSTOMER EXPLORATION INTEGRATION FAILURE:', err);
  process.exit(1);
});
