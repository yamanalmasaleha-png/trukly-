// BiteShark Private Customer Profile, Editable Preferences, Curated "Greatest Hits" Collections,
// 18+ Self-Attested Sharing Eligibility, Hashed Unlisted Share Links (`/s/<token>`),
// Consented EXIF-Stripped Shared Photo Derivatives, Abuse Reporting & Scoped Moderation
// Real-PostgreSQL + Real-Sharp Integration Suite (`tests/customer-profile-sharing.integration.cjs`)

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
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'biteshark-prof-pg-'));
  const dataDir = path.join(tmpBase, 'data');
  const pwFile = path.join(tmpBase, 'pw.txt');
  const logFile = path.join(tmpBase, 'postgres.log');
  const password = 'prof_pw_' + crypto.randomBytes(6).toString('hex');
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

function runChild(args, env, timeoutMs = 25000) {
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

/**
 * Generates a real JPEG containing synthetic EXIF APP1 metadata so we can prove
 * that both private photo storage and shared `sha_*` WebP derivatives strip EXIF completely.
 */
async function createTestJpegWithExif(color = { r: 214, g: 108, b: 68 }) {
  return sharp({
    create: {
      width: 640,
      height: 480,
      channels: 3,
      background: color
    }
  })
    .withExif({
      IFD0: {
        Make: 'SecretCameraMaker',
        Model: 'PrivatePhonePro',
        Artist: 'Alice Private Author'
      }
    })
    .jpeg({ quality: 86 })
    .toBuffer();
}

(async () => {
  const { Pool } = requirePg();
  const pgCluster = await createPostgresCluster();
  const suffix = crypto.randomBytes(3).toString('hex');
  const dbName = `biteshark_prof_${suffix}`;
  const migratorRole = `bs_prof_mig_${suffix}`;
  const appRole = `bs_prof_app_${suffix}`;
  const migratorPass = 'mig_' + crypto.randomBytes(8).toString('hex');
  const appPass = 'app_' + crypto.randomBytes(8).toString('hex');

  const photoStorageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-prof-photos-'));
  const adminPool = new Pool({ connectionString: pgCluster.adminUrl, max: 3 });
  let migratorPool = null;
  let appPool = null;
  let standalone = null;

  const capturedServerLogs = [];
  const origConsoleLog = console.log;
  const origConsoleWarn = console.warn;
  const origConsoleError = console.error;
  console.log = (...args) => {
    capturedServerLogs.push(args.map(String).join(' '));
    origConsoleLog(...args);
  };
  console.warn = (...args) => {
    capturedServerLogs.push(args.map(String).join(' '));
    origConsoleWarn(...args);
  };
  console.error = (...args) => {
    capturedServerLogs.push(args.map(String).join(' '));
    origConsoleError(...args);
  };

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
    assert(migRes.stdout.includes('"newly_applied":29'), `Expected 29 migrations: ${migRes.stdout}`);

    // Idempotent second run must apply 0 new migrations
    const migRes2 = await runChild(
      [path.join(ROOT, 'scripts', 'run-migrations.cjs'), '--app-role', appRole],
      { ...process.env, MIGRATION_DATABASE_URL: migratorUrl }
    );
    assert.equal(migRes2.code, 0);
    assert(migRes2.stdout.includes('"newly_applied":0'));

    migratorPool = new Pool({ connectionString: migratorUrl, max: 4 });
    appPool = new Pool({ connectionString: appUrl, max: 10 });
    const superDbUrl = (() => {
      const u = new URL(pgCluster.adminUrl);
      u.pathname = '/' + dbName;
      return u.toString();
    })();
    var superDbPool = new Pool({ connectionString: superDbUrl, max: 3 });

    const port = await getFreePort();
    const baseOrigin = `http://127.0.0.1:${port}`;
    const mailboxSecret = 'mbx_' + crypto.randomBytes(24).toString('hex');
    const authSecret = crypto.randomBytes(32).toString('hex');

    process.env.BITESHARK_ENV = 'staging';
    process.env.BITESHARK_AUTH_START_IP_MAX = '250';
    process.env.BITESHARK_AUTH_VERIFY_IP_MAX = '250';
    process.env.BITESHARK_AUTH_SECRET = authSecret;
    process.env.BITESHARK_AUTH_DELIVERY_MODE = 'staging_mailbox';
    process.env.BITESHARK_STAGING_MAILBOX_SECRET = mailboxSecret;
    process.env.BITESHARK_STAGING_ALLOWED_EMAIL_DOMAINS = 'staging.biteshark.invalid';
    process.env.BITESHARK_PUSH_PROVIDER_MODE = 'disabled';
    process.env.BITESHARK_PHOTO_STORAGE_DIR = photoStorageDir;
    delete process.env.BITESHARK_PUBLIC_ORIGIN;

    const { createStandaloneServer } = await import(pathToFileURL(path.join(ROOT, 'server', 'app.js')).href);

    standalone = createStandaloneServer({
      dbAdapter: appPool,
      releaseSha: 'proftest00000000000000000000000000000029'
    });
    await new Promise((resolve, reject) => {
      standalone.server.listen(port, '127.0.0.1', err => (err ? reject(err) : resolve()));
    });

    async function httpReq(
      relPath,
      { method = 'GET', cookie = '', headers = {}, body, rawBodyBuffer = null, rawBuffer = false } = {}
    ) {
      const hdrs = { ...headers };
      if (cookie) hdrs.Cookie = cookie;
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        if (!('Origin' in hdrs)) hdrs.Origin = baseOrigin;
      }
      let payloadBody;
      if (rawBodyBuffer) {
        payloadBody = rawBodyBuffer;
      } else if (body !== undefined) {
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

    async function signInEmail(email, dob = '1992-07-15') {
      const start = await httpReq('/api/auth/start', {
        method: 'POST',
        headers: { 'X-BiteShark-Client': 'web-auth-v1' },
        body: { email, intent: 'signup', dob }
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

    async function setFeatureStateAsTop(topCookie, featureKey, configuredState, audience = 'all') {
      const current = await httpReq('/api/admin/features', { cookie: topCookie });
      assert.equal(current.status, 200);
      const ctrl = current.json.controls.find(c => c.key === featureKey);
      assert(ctrl, `Expected feature control ${featureKey}`);
      const upd = await httpReq('/api/admin/features/update', {
        method: 'POST',
        cookie: topCookie,
        body: {
          feature_key: featureKey,
          configured_state: configuredState,
          audience,
          expected_revision: ctrl.revision,
          confirmed_impact: true,
          reason: `Integration test toggle ${featureKey} -> ${configuredState}`
        }
      });
      assert.equal(upd.status, 200, `Feature update failed for ${featureKey}: ${JSON.stringify(upd.json)}`);
      return upd.json.controls.find(c => c.key === featureKey);
    }

    // Calculate an exact 15-year-old DOB dynamically so age test never rots over calendar years
    const nowYear = new Date().getUTCFullYear();
    const teenDob = `${nowYear - 15}-06-15`;
    const adultSharingDob = '1991-04-19';

    const topUser = await signInEmail('top-prof@staging.biteshark.invalid');
    const modUser = await signInEmail('mod-prof@staging.biteshark.invalid');
    const vendorOwner = await signInEmail('vendor-prof@staging.biteshark.invalid');
    const alice = await signInEmail('alice-prof@staging.biteshark.invalid');
    const bob = await signInEmail('bob-prof@staging.biteshark.invalid');
    const teenUser = await signInEmail('teen-prof@staging.biteshark.invalid', teenDob);

    // Seed Top Admin, Moderator, Vendor Owner + two DB-backed catalog businesses for rename/unpublish truthfulness tests
    const dbSpotRenameId = `vnd_prof_rename_${suffix}`;
    const dbSpotSecretId = `vnd_prof_secret_${suffix}`;
    {
      const seedClient = await migratorPool.connect();
      try {
        await seedClient.query('BEGIN');
        await seedClient.query(
          "SELECT set_config('app.auth_internal', 'true', true), set_config('app.is_platform_admin', 'true', true)"
        );
        await seedClient.query(
          `INSERT INTO platform_roles (user_id, role, granted_by)
           VALUES ($1, 'top', 'bootstrap'), ($2, 'mod', $1)`,
          [topUser.user.id, modUser.user.id]
        );
        await seedClient.query(
          `INSERT INTO vendors (
             id, canonical_name, city, cuisine, listing_kind, event_bookable, is_active
           ) VALUES
             ($1, 'Sonoma Sunrise Tortillas', 'Santa Rosa', 'Mexican', 'food_truck', true, true),
             ($2, 'Confidential Test Kitchen Alpha', 'Petaluma', 'Global', 'popup', false, true)`,
          [dbSpotRenameId, dbSpotSecretId]
        );
        await seedClient.query(
          `INSERT INTO owner_profiles (truck_id, display_name, description, cuisine, accepting_bookings)
           VALUES
             ($1, 'Sonoma Sunrise Tortillas', 'Fresh heirloom masa tacos', 'Mexican', true),
             ($2, 'Confidential Test Kitchen Alpha', 'Temporary pop-up before unpublishing', 'Global', false)`,
          [dbSpotRenameId, dbSpotSecretId]
        );
        await seedClient.query(
          `INSERT INTO vendor_memberships (vendor_id, user_id, role, granted_by)
           VALUES ($1, $2, 'owner', $3)`,
          [dbSpotRenameId, vendorOwner.user.id, topUser.user.id]
        );
        await seedClient.query('COMMIT');
      } finally {
        seedClient.release();
      }
    }

    // =========================================================================
    // 1. Anonymous Rejection, RLS Enforcement, Service Worker & Robots Controls
    // =========================================================================
    for (const ep of [
      { path: '/api/me/profile', method: 'GET' },
      { path: '/api/me/profile', method: 'POST', body: { display_name: 'Anon' } },
      { path: '/api/me/preferences', method: 'POST', body: { preferred_town: 'Sonoma' } },
      { path: '/api/me/profile/privacy', method: 'GET' },
      { path: '/api/me/profile/delete-data', method: 'POST', body: { confirm_delete: true } },
      { path: '/api/me/collections', method: 'GET' },
      { path: '/api/me/collections', method: 'POST', body: { title: 'Anon List' } },
      { path: '/api/me/collections/detail?id=col_000000000000000000000000', method: 'GET' },
      { path: '/api/me/collections/update', method: 'POST', body: {} },
      { path: '/api/me/collections/delete', method: 'POST', body: {} },
      { path: '/api/me/collections/preview', method: 'POST', body: {} },
      { path: '/api/me/collections/attach-photo', method: 'POST', body: {} },
      { path: '/api/me/collections/remove-photo', method: 'POST', body: {} },
      { path: '/api/me/sharing-eligibility', method: 'POST', body: { dob: '1990-01-01' } },
      { path: '/api/me/shares', method: 'GET' },
      { path: '/api/me/shares/create', method: 'POST', body: {} },
      { path: '/api/me/shares/update-settings', method: 'POST', body: {} },
      { path: '/api/me/shares/rotate', method: 'POST', body: {} },
      { path: '/api/me/shares/revoke', method: 'POST', body: {} },
      { path: '/api/admin/shared-moderation', method: 'GET' },
      { path: '/api/admin/shared-moderation/decision', method: 'POST', body: {} },
      { path: '/api/admin/shared-moderation/photo?attachment_id=sha_000000000000000000000000', method: 'GET' }
    ]) {
      const anonRes = await httpReq(ep.path, { method: ep.method, body: ep.body });
      assert.equal(anonRes.status, 401, `Anonymous ${ep.method} ${ep.path} must return 401, got ${anonRes.status}`);
    }

    // Anonymous `/profile` redirects to `/login.html?next=%2Fprofile` with private no-store headers
    {
      const anonProfPage = await httpReq('/profile');
      assert.equal(anonProfPage.status, 302);
      assert.equal(anonProfPage.headers.get('location'), '/login.html?next=%2Fprofile');
      assert(String(anonProfPage.headers.get('cache-control') || '').includes('no-store'));
      assert(String(anonProfPage.headers.get('x-robots-tag') || '').includes('noindex'));

      const authedProfPage = await httpReq('/profile', { cookie: alice.cookie });
      assert.equal(authedProfPage.status, 200);
      assert(String(authedProfPage.headers.get('cache-control') || '').includes('no-store'));
      assert(authedProfPage.text.includes('profileScreen'));
    }

    // `/robots.txt` disallows `/s/` and `/profile`; `public/sw.js` registers zero fetch cache handlers
    {
      const robots = await httpReq('/robots.txt');
      assert.equal(robots.status, 200);
      assert(robots.text.includes('Disallow: /s/'), 'robots.txt must disallow /s/');
      assert(robots.text.includes('Disallow: /profile'), 'robots.txt must disallow /profile');

      const swSource = fs.readFileSync(path.join(ROOT, 'public', 'sw.js'), 'utf8');
      assert(!/addEventListener\s*\(\s*['"]fetch['"]/.test(swSource), 'sw.js must not intercept fetch for caching');
      assert(!/caches\.open/.test(swSource), 'sw.js must not write Cache Storage');
    }

    // Direct PostgreSQL `NOBYPASSRLS` check across all 8 new tables + append-only moderation events
    {
      const rlsClient = await appPool.connect();
      try {
        for (const tbl of [
          'customer_profiles',
          'customer_sharing_eligibility',
          'customer_collections',
          'customer_collection_photo_attachments',
          'customer_collection_entries',
          'customer_collection_shares',
          'customer_share_reports',
          'customer_share_moderation_events'
        ]) {
          const res = await rlsClient.query(`SELECT COUNT(*)::int AS c FROM ${tbl}`);
          assert.equal(res.rows[0].c, 0, `Expected 0 rows without RLS session context on ${tbl}`);
        }
        await assert.rejects(
          () => rlsClient.query(`DELETE FROM customer_share_moderation_events`),
          err => err.code === '42501',
          'appRole must not have DELETE privilege on customer_share_moderation_events'
        );
        await assert.rejects(
          () => rlsClient.query(`UPDATE customer_share_moderation_events SET reason = 'tamper'`),
          err => err.code === '42501',
          'appRole must not have UPDATE privilege on customer_share_moderation_events'
        );
      } finally {
        rlsClient.release();
      }
    }

    // Cross-origin CSRF write blocked
    {
      const csrfAttempt = await httpReq('/api/me/profile', {
        method: 'POST',
        cookie: alice.cookie,
        headers: { Origin: 'https://evil.example' },
        body: { display_name: 'CSRF Attacker' }
      });
      assert.equal(csrfAttempt.status, 403);
    }

    // Public profile discovery is permanently locked off (`read_only: true`, `hidden`)
    {
      const pubAttempt = await httpReq('/api/admin/features/update', {
        method: 'POST',
        cookie: topUser.cookie,
        body: {
          feature_key: 'public_profile_discovery',
          configured_state: 'enabled',
          audience: 'all',
          expected_revision: 0,
          confirmed_impact: true,
          reason: 'Attempt to activate unsupported public user discovery'
        }
      });
      assert.equal(pubAttempt.status, 400);
      assert.equal(pubAttempt.json.code, 'FEATURE_READ_ONLY');

      // Moderator & regular customer cannot mutate Feature Controls
      const modFeat = await httpReq('/api/admin/features/update', {
        method: 'POST',
        cookie: modUser.cookie,
        body: {
          feature_key: 'customer_profile',
          configured_state: 'paused',
          audience: 'all',
          expected_revision: 0,
          confirmed_impact: true,
          reason: 'Unauthorized mod toggle'
        }
      });
      assert.equal(modFeat.status, 403);
      assert.equal(modFeat.json.code, 'TOP_ADMIN_REQUIRED');
    }

    // Ensure `unlisted_collection_sharing` and `shared_collection_photos` can be enabled cleanly if currently hidden,
    // and verify that when hidden initially, `/api/me/shares/create` is blocked (`403 FEATURE_DISABLED`)
    {
      const feats = await httpReq('/api/admin/features', { cookie: topUser.cookie });
      const shareCtrl = feats.json.controls.find(c => c.key === 'unlisted_collection_sharing');
      if (shareCtrl.effective_state === 'hidden') {
        const blockedWhenHidden = await httpReq('/api/me/shares/create', {
          method: 'POST',
          cookie: alice.cookie,
          body: { collection_id: 'col_000000000000000000000000' }
        });
        assert.equal(blockedWhenHidden.status, 403);
        assert.equal(blockedWhenHidden.json.code, 'FEATURE_DISABLED');
        await setFeatureStateAsTop(topUser.cookie, 'unlisted_collection_sharing', 'enabled');
      }
      const photoCtrl = (await httpReq('/api/admin/features', { cookie: topUser.cookie })).json.controls.find(
        c => c.key === 'shared_collection_photos'
      );
      if (photoCtrl.effective_state === 'hidden') {
        await setFeatureStateAsTop(topUser.cookie, 'shared_collection_photos', 'enabled');
      }
    }

    // =========================================================================
    // 2. Private Profile Read Model, Canonical Exploration/Favorites Reuse & Preferences
    // =========================================================================
    // Seed canonical activity for Alice: 2 visits (with a sensitive private note), 1 private photo (with EXIF + private caption),
    // 1 saved trail, and 1 favorite.
    const PRIVATE_VISIT_NOTE = 'Secret private taco diary note — ask for extra charred habanero salsa';
    const PRIVATE_PHOTO_CAPTION = 'Private camera roll caption — eyes only';
    let alicePhotoId = null;
    let alicePhoto2Id = null;
    {
      const v1 = await httpReq('/api/me/visits', {
        method: 'POST',
        cookie: alice.cookie,
        body: {
          vendor_id: 'mitote',
          private_note: PRIVATE_VISIT_NOTE,
          idempotency_key: 'prof_visit_1'
        }
      });
      assert.equal(v1.status, 201, `v1 failed: ${JSON.stringify(v1.json)}`);

      const v2 = await httpReq('/api/me/visits', {
        method: 'POST',
        cookie: alice.cookie,
        body: {
          vendor_id: dbSpotRenameId,
          private_note: 'Tried the blue corn tortilla special',
          idempotency_key: 'prof_visit_2'
        }
      });
      assert.equal(v2.status, 201, `v2 failed: ${JSON.stringify(v2.json)}`);

      const jpegBuf1 = await createTestJpegWithExif({ r: 210, g: 95, b: 55 });
      const up1 = await httpReq('/api/me/photos', {
        method: 'POST',
        cookie: alice.cookie,
        body: {
          vendor_id: 'mitote',
          caption: PRIVATE_PHOTO_CAPTION,
          data_url: 'data:image/jpeg;base64,' + jpegBuf1.toString('base64'),
          idempotency_key: 'prof_photo_1'
        }
      });
      assert.equal(up1.status, 201, `Photo upload 1 failed: ${JSON.stringify(up1.json)}`);
      alicePhotoId = up1.json.photo.photo_id;

      const jpegBuf2 = await createTestJpegWithExif({ r: 65, g: 145, b: 95 });
      const up2 = await httpReq('/api/me/photos', {
        method: 'POST',
        cookie: alice.cookie,
        body: {
          vendor_id: dbSpotRenameId,
          caption: 'Second private tortilla photo',
          data_url: 'data:image/jpeg;base64,' + jpegBuf2.toString('base64'),
          idempotency_key: 'prof_photo_2'
        }
      });
      assert.equal(up2.status, 201, `Photo upload 2 failed: ${JSON.stringify(up2.json)}`);
      alicePhoto2Id = up2.json.photo.photo_id;

      const trl = await httpReq('/api/me/trails', {
        method: 'POST',
        cookie: alice.cookie,
        body: {
          title: 'Santa Rosa Taco Afternoon',
          theme_key: 'sweet',
          stops: [
            { vendor_id: 'mitote', match_reason: 'Taco park' },
            { vendor_id: dbSpotRenameId, match_reason: 'Fresh masa' }
          ],
          idempotency_key: 'prof_trail_1'
        }
      });
      assert.equal(trl.status, 201, `Trail save failed: ${JSON.stringify(trl.json)}`);

      const fav = await httpReq('/api/favorites/toggle', {
        method: 'POST',
        cookie: alice.cookie,
        body: { truck_id: 'mitote', desired_saved: true }
      });
      assert(fav.status === 200 || fav.status === 201, `Favorite add failed: ${fav.status}`);
    }

    // Verify `GET /api/me/profile` matches canonical `GET /api/me/exploration` exactly (zero duplicate scoring!)
    const expDirect = await httpReq('/api/me/exploration', { cookie: alice.cookie });
    assert.equal(expDirect.status, 200);

    const aliceProf0 = await httpReq('/api/me/profile', { cookie: alice.cookie });
    assert.equal(aliceProf0.status, 200);
    assert.equal(aliceProf0.headers.get('cache-control'), 'private, no-store, max-age=0');
    assert.equal(aliceProf0.json.profile.visibility_mode, 'private');
    assert.equal(aliceProf0.json.profile.public_discovery_enabled, false);
    assert.equal(
      aliceProf0.json.progress.achievements.total_points,
      expDirect.json.achievements.total_points,
      'Profile total_points must match canonical exploration summary'
    );
    assert.equal(
      aliceProf0.json.progress.achievements.current_level.number,
      expDirect.json.achievements.current_level.number
    );
    assert.equal(aliceProf0.json.activity_preview.visits_total, 2);
    assert.equal(aliceProf0.json.activity_preview.photos_total, 2);
    assert.equal(aliceProf0.json.activity_preview.favorites_total, 1);
    assert.equal(aliceProf0.json.activity_preview.saved_trails_total, 1);
    assert.equal(aliceProf0.json.sharing_eligibility.status, 'unknown');
    assert.equal(aliceProf0.json.sharing_eligibility.can_share, false);

    // Reject client attempts to write forbidden fields (`user_id`, `points`, `badges`, `moderation_status`, `visibility_mode: 'public'`)
    for (const badBody of [
      { display_name: 'Spoof', user_id: bob.user.id },
      { display_name: 'Spoof', owner_id: bob.user.id },
      { display_name: 'Spoof', points: 99999 },
      { display_name: 'Spoof', badges: ['all'] },
      { display_name: 'Spoof', sharing_eligibility: 'eligible_18_plus' },
      { display_name: 'Spoof', moderation_status: 'active' },
      { display_name: 'Spoof', visibility_mode: 'public' },
      { display_name: 'Spoof', allow_public_indexing: true }
    ]) {
      const rej = await httpReq('/api/me/profile', {
        method: 'POST',
        cookie: alice.cookie,
        body: badBody
      });
      assert.equal(rej.status, 400, `Forbidden field payload ${JSON.stringify(badBody)} must return 400`);
    }

    // Reject arbitrary remote avatar URLs
    {
      const badAvatar = await httpReq('/api/me/profile', {
        method: 'POST',
        cookie: alice.cookie,
        body: {
          display_name: 'Alice Sonoma',
          avatar_style: 'https://tracker.evil.example/pixel.png'
        }
      });
      assert.equal(badAvatar.status, 400);
      assert.equal(badAvatar.json.code, 'ARBITRARY_AVATAR_URL_FORBIDDEN');
    }

    // Update Alice's private profile (`display_name`, `bio`, `avatar_style`) + optimistic concurrency check
    const profUpd1 = await httpReq('/api/me/profile', {
      method: 'POST',
      cookie: alice.cookie,
      body: {
        display_name: 'Alice Sonoma',
        bio: 'Weekend farmers market regular & salsa verde fan.',
        avatar_style: 'citrus_sprig',
        expected_revision: aliceProf0.json.profile.revision
      }
    });
    assert.equal(profUpd1.status, 200);
    assert.equal(profUpd1.json.profile.display_name, 'Alice Sonoma');
    assert.equal(profUpd1.json.profile.initials, 'AS');
    assert.equal(profUpd1.json.profile.avatar_style, 'citrus_sprig');
    assert.equal(profUpd1.json.profile.revision, aliceProf0.json.profile.revision + 1);
    // Profile creation/edit must NOT imply marketing/communication opt-in!
    assert.equal(profUpd1.json.preferences.communication_product_updates_opt_in, false);

    // Stale `expected_revision` rejected with `409`
    {
      const staleProf = await httpReq('/api/me/profile', {
        method: 'POST',
        cookie: alice.cookie,
        body: {
          display_name: 'Stale Write',
          expected_revision: aliceProf0.json.profile.revision
        }
      });
      assert.equal(staleProf.status, 409);
    }

    // Preferences validation: street addresses & unsupported cities rejected; coarse Sonoma towns, curated interests,
    // honest placeholder nearby-alert settings, and separate communication consent persisted across sessions!
    {
      const streetAttempt = await httpReq('/api/me/preferences', {
        method: 'POST',
        cookie: alice.cookie,
        body: { preferred_town: '1234 Fourth Street' }
      });
      assert.equal(streetAttempt.status, 400);
      assert.equal(streetAttempt.json.code, 'PRECISE_ADDRESS_NOT_ALLOWED');

      const unknownTown = await httpReq('/api/me/preferences', {
        method: 'POST',
        cookie: alice.cookie,
        body: { preferred_town: 'Atlantis' }
      });
      assert.equal(unknownTown.status, 400);
      assert.equal(unknownTown.json.code, 'UNSUPPORTED_TOWN');

      const tooManyInterests = await httpReq('/api/me/preferences', {
        method: 'POST',
        cookie: alice.cookie,
        body: {
          food_interests: [
            'tacos_mexican',
            'burgers_smash',
            'hot_dogs_sausage',
            'coffee_espresso',
            'sweets_bakery',
            'farmers_markets',
            'bbq_smoked',
            'seafood_coastal',
            'global_street_food',
            'vegetarian_friendly',
            'plant_based_options'
          ]
        }
      });
      assert.equal(tooManyInterests.status, 400);
      assert.equal(tooManyInterests.json.code, 'TOO_MANY_FOOD_INTERESTS');

      const validPrefs = await httpReq('/api/me/preferences', {
        method: 'POST',
        cookie: alice.cookie,
        body: {
          preferred_town: 'Healdsburg',
          food_interests: ['tacos_mexican', 'farmers_markets', 'vegetarian_friendly'],
          nearby_alerts: {
            nearby_enabled: true,
            radius_miles: 5
          },
          communication_product_updates_opt_in: false
        }
      });
      assert.equal(validPrefs.status, 200, `Prefs update failed: ${JSON.stringify(validPrefs.json)}`);
      assert.equal(validPrefs.json.preferences.preferred_town, 'Healdsburg');
      assert.deepEqual(validPrefs.json.preferences.food_interests, [
        'tacos_mexican',
        'farmers_markets',
        'vegetarian_friendly'
      ]);
      assert(
        validPrefs.json.preferences.disclosures.dietary_disclaimer.includes('never an allergy-safety'),
        'Dietary preference disclaimer must clearly state preferences are not allergy guarantees'
      );
      assert.equal(validPrefs.json.preferences.nearby_alerts.nearby_enabled, true);
      assert.equal(validPrefs.json.preferences.nearby_alerts.radius_miles, 5);
      assert.equal(validPrefs.json.preferences.nearby_alerts.delivery_active, false);
      assert.equal(validPrefs.json.preferences.communication_product_updates_opt_in, false);

      // Verify canonical `GET /api/notifications/settings` sees the exact same `nearby_enabled` & `radius_miles` row
      const notifSettings = await httpReq('/api/notifications/settings', { cookie: alice.cookie });
      assert.equal(notifSettings.status, 200);
      assert.equal(notifSettings.json.nearby_enabled, true);
      assert.equal(notifSettings.json.radius_miles, 5);
    }

    // Vendor Owner & Admin roles remain unaffected when opening customer profile
    {
      const vendorProf = await httpReq('/api/me/profile', { cookie: vendorOwner.cookie });
      assert.equal(vendorProf.status, 200);
      const vendorCtx = await httpReq('/api/account/context', { cookie: vendorOwner.cookie });
      assert.equal(vendorCtx.status, 200);
      assert(vendorCtx.json.role_labels.includes('Vendor Owner'));

      const topProf = await httpReq('/api/me/profile', { cookie: topUser.cookie });
      assert.equal(topProf.status, 200);
      const topCtx = await httpReq('/api/account/context', { cookie: topUser.cookie });
      assert.equal(topCtx.status, 200);
      assert.equal(topCtx.json.capabilities.is_top_admin, true);
    }

    // =========================================================================
    // 3. Greatest Hits Collections: Limits, Ordering, Concurrency, XSS & Catalog Truthfulness
    // =========================================================================
    const XSS_PAYLOAD = `<script>window.__pwned=1</script><img src=x onerror="window.__pwned=2">`;

    const colCreate1 = await httpReq('/api/me/collections', {
      method: 'POST',
      cookie: alice.cookie,
      body: {
        title: 'Sonoma Taco & Masa Greatest Hits',
        intro: 'My go-to spots when friends visit Sonoma County for the weekend.',
        idempotency_key: 'col_idem_alice_1',
        entries: [
          {
            vendor_id: 'mitote',
            recommendation: 'Order the birria quesatacos and grab aguas frescas early.'
          },
          {
            vendor_id: dbSpotRenameId,
            recommendation: 'Handmade heirloom blue-corn tortillas pressed to order.'
          },
          {
            vendor_id: dbSpotSecretId,
            recommendation: 'Late afternoon salsa flight.'
          }
        ]
      }
    });
    assert.equal(colCreate1.status, 201, `Create collection failed: ${JSON.stringify(colCreate1.json)}`);
    const aliceColId = colCreate1.json.collection.collection_id;
    assert.match(aliceColId, /^col_[a-f0-9]{24,40}$/);
    assert.equal(colCreate1.json.collection.entries.length, 3);
    // Private visit notes & private photo captions must NEVER be auto-copied into recommendations!
    assert(!JSON.stringify(colCreate1.json.collection).includes(PRIVATE_VISIT_NOTE));
    assert(!JSON.stringify(colCreate1.json.collection).includes(PRIVATE_PHOTO_CAPTION));

    // Idempotent retry with same `idempotency_key` returns `200` with `idempotent_replay: true` and creates no duplicate
    {
      const replay = await httpReq('/api/me/collections', {
        method: 'POST',
        cookie: alice.cookie,
        body: {
          title: 'Sonoma Taco & Masa Greatest Hits',
          idempotency_key: 'col_idem_alice_1'
        }
      });
      assert.equal(replay.status, 200);
      assert.equal(replay.json.idempotent_replay, true);
      assert.equal(replay.json.collection.collection_id, aliceColId);
    }

    // Cross-user isolation: Bob cannot view, update, delete, or preview Alice's collection
    {
      const bobDetail = await httpReq(`/api/me/collections/detail?id=${encodeURIComponent(aliceColId)}`, {
        cookie: bob.cookie
      });
      assert.equal(bobDetail.status, 404);

      const bobUpd = await httpReq('/api/me/collections/update', {
        method: 'POST',
        cookie: bob.cookie,
        body: {
          collection_id: aliceColId,
          expected_revision: 1,
          title: 'Hijacked'
        }
      });
      assert.equal(bobUpd.status, 404);

      const bobDel = await httpReq('/api/me/collections/delete', {
        method: 'POST',
        cookie: bob.cookie,
        body: { collection_id: aliceColId }
      });
      assert.equal(bobDel.status, 404);
    }

    // Duplicate business in the same collection rejected (`400`); > 20 entries rejected (`400`)
    {
      const dupSpot = await httpReq('/api/me/collections/update', {
        method: 'POST',
        cookie: alice.cookie,
        body: {
          collection_id: aliceColId,
          expected_revision: 1,
          entries: [
            { vendor_id: 'mitote', recommendation: 'First' },
            { vendor_id: 'mitote', recommendation: 'Duplicate' }
          ]
        }
      });
      assert.equal(dupSpot.status, 400);

      const over20 = Array.from({ length: 21 }, (_, idx) => ({
        vendor_id: `spot_${idx}`,
        recommendation: 'Too many'
      }));
      const over20Res = await httpReq('/api/me/collections/update', {
        method: 'POST',
        cookie: alice.cookie,
        body: {
          collection_id: aliceColId,
          expected_revision: 1,
          entries: over20
        }
      });
      assert.equal(over20Res.status, 400);
    }

    // Enforce 5-collections-per-account cap (`409 COLLECTION_LIMIT_REACHED` on 6th), then clean up extras
    {
      const extraIds = [];
      for (let i = 2; i <= 5; i++) {
        const extra = await httpReq('/api/me/collections', {
          method: 'POST',
          cookie: alice.cookie,
          body: { title: `Extra Collection #${i}` }
        });
        assert.equal(extra.status, 201);
        extraIds.push(extra.json.collection.collection_id);
      }
      const sixth = await httpReq('/api/me/collections', {
        method: 'POST',
        cookie: alice.cookie,
        body: { title: 'Sixth Collection Over Cap' }
      });
      assert.equal(sixth.status, 409);
      assert.equal(sixth.json.code, 'COLLECTION_LIMIT_REACHED');

      for (const eid of extraIds) {
        const del = await httpReq('/api/me/collections/delete', {
          method: 'POST',
          cookie: alice.cookie,
          body: { collection_id: eid }
        });
        assert.equal(del.status, 200);
      }
    }

    // Transactional reordering (`dbSpotRenameId` moved to #1, `mitote` to #2, `dbSpotSecretId` #3) + revision check
    {
      const reordered = await httpReq('/api/me/collections/update', {
        method: 'POST',
        cookie: alice.cookie,
        body: {
          collection_id: aliceColId,
          expected_revision: 1,
          entries: [
            {
              vendor_id: dbSpotRenameId,
              recommendation: 'Handmade heirloom blue-corn tortillas pressed to order.'
            },
            {
              vendor_id: 'mitote',
              recommendation: 'Order the birria quesatacos and grab aguas frescas early.'
            },
            {
              vendor_id: dbSpotSecretId,
              recommendation: 'Late afternoon salsa flight.'
            }
          ]
        }
      });
      assert.equal(reordered.status, 200);
      assert.equal(reordered.json.collection.revision, 2);
      assert.deepEqual(
        reordered.json.collection.entries.map(e => [e.position, e.vendor_id]),
        [
          [1, dbSpotRenameId],
          [2, 'mitote'],
          [3, dbSpotSecretId]
        ]
      );

      // Stale revision `1` now fails with `409 COLLECTION_REVISION_CONFLICT`
      const staleCol = await httpReq('/api/me/collections/update', {
        method: 'POST',
        cookie: alice.cookie,
        body: {
          collection_id: aliceColId,
          expected_revision: 1,
          title: 'Stale'
        }
      });
      assert.equal(staleCol.status, 409);
      assert.equal(staleCol.json.code, 'COLLECTION_REVISION_CONFLICT');
    }

    // Catalog truthfulness: rename `dbSpotRenameId` (and mark closed) AND unpublish `dbSpotSecretId` in PostgreSQL
    {
      const catClient = await migratorPool.connect();
      try {
        await catClient.query('BEGIN');
        await catClient.query("SELECT set_config('app.is_platform_admin', 'true', true)");
        await catClient.query(
          `UPDATE owner_profiles SET display_name = 'Sonoma Masa Madre Kitchen', updated_at = NOW() WHERE truck_id = $1`,
          [dbSpotRenameId]
        );
        await catClient.query(
          `INSERT INTO truck_settings (truck_id, location, is_open, observed_at, updated_at)
           VALUES ($1, '400 Courthouse Sq', false, NOW(), NOW())
           ON CONFLICT (truck_id) DO UPDATE SET is_open = false, updated_at = NOW()`,
          [dbSpotRenameId]
        );
        await catClient.query(
          `UPDATE vendors SET is_active = false, hidden_from_discovery = true WHERE id = $1`,
          [dbSpotSecretId]
        );
        await catClient.query('COMMIT');
      } finally {
        catClient.release();
      }

      // Owner detail retains historical snapshot for unpublished spot while showing live renamed business name
      const ownerDetail = await httpReq(`/api/me/collections/detail?id=${encodeURIComponent(aliceColId)}`, {
        cookie: alice.cookie
      });
      assert.equal(ownerDetail.status, 200);
      const ent1 = ownerDetail.json.collection.entries[0];
      const ent3 = ownerDetail.json.collection.entries[2];
      assert.equal(ent1.display_name, 'Sonoma Masa Madre Kitchen', 'Renamed business must display current public name');
      assert(ent1.service_status_label.toLowerCase().includes('closed'), 'Closed business must report factual status');
      assert.equal(ent3.catalog_status, 'unavailable_publicly');
      assert.equal(ent3.historical_name_snapshot, 'Confidential Test Kitchen Alpha');

      // Shared preview MUST NOT expose unpublished business name `Confidential Test Kitchen Alpha`!
      const previewCheck = await httpReq('/api/me/collections/preview', {
        method: 'POST',
        cookie: alice.cookie,
        body: {
          collection_id: aliceColId,
          disclosures: { include_display_name: true }
        }
      });
      assert.equal(previewCheck.status, 200);
      const previewSerialized = JSON.stringify(previewCheck.json.preview);
      assert(previewSerialized.includes('Sonoma Masa Madre Kitchen'));
      assert(
        !previewSerialized.includes('Confidential Test Kitchen Alpha'),
        'Unpublished business name must never leak in shared preview'
      );
      assert.equal(previewCheck.json.preview.collection.entries[2].available, false);
    }

    // =========================================================================
    // 4. Age Eligibility (14+ vs 18+): Under-18 & Unknown Blocked; Zero DOB Stored
    // =========================================================================
    // Alice currently has `unknown` 18+ status (14+ signup alone does NOT authorize sharing!)
    {
      const unknownShareAttempt = await httpReq('/api/me/shares/create', {
        method: 'POST',
        cookie: alice.cookie,
        body: { collection_id: aliceColId }
      });
      assert.equal(unknownShareAttempt.status, 403);
      assert.equal(unknownShareAttempt.json.code, 'SHARING_ELIGIBILITY_REQUIRED');
    }

    // Teen user (age 15) creates a private collection (succeeds!) then attempts 18+ sharing assessment -> blocked (`403`)
    {
      const teenCol = await httpReq('/api/me/collections', {
        method: 'POST',
        cookie: teenUser.cookie,
        body: { title: 'My Private Teen Favorites' }
      });
      assert.equal(teenCol.status, 201);

      const teenElig = await httpReq('/api/me/sharing-eligibility', {
        method: 'POST',
        cookie: teenUser.cookie,
        body: { dob: teenDob }
      });
      assert.equal(teenElig.status, 403);
      assert.equal(teenElig.json.code, 'SHARING_UNDER_18_RESTRICTED');

      // Teen cannot coach/retry with a fake adult DOB in the same/later session
      const teenRetryAdult = await httpReq('/api/me/sharing-eligibility', {
        method: 'POST',
        cookie: teenUser.cookie,
        body: { dob: '1988-01-01' }
      });
      assert.equal(teenRetryAdult.status, 403);
      assert.equal(teenRetryAdult.json.code, 'SHARING_UNDER_18_RESTRICTED');

      // Teen private profile, collections, and privacy export remain 100% functional
      const teenProf = await httpReq('/api/me/profile', { cookie: teenUser.cookie });
      assert.equal(teenProf.status, 200);
      assert.equal(teenProf.json.sharing_eligibility.status, 'ineligible_under_18');
      const teenExport = await httpReq('/api/me/profile/privacy', { cookie: teenUser.cookie });
      assert.equal(teenExport.status, 200);
    }

    // Reject client attempt to self-assert `status: 'eligible_18_plus'` without DOB evaluation
    {
      const spoofElig = await httpReq('/api/me/sharing-eligibility', {
        method: 'POST',
        cookie: alice.cookie,
        body: { dob: adultSharingDob, eligibility_status: 'eligible_18_plus' }
      });
      assert.equal(spoofElig.status, 400);
      assert.equal(spoofElig.json.code, 'FORBIDDEN_CLIENT_FIELD');
    }

    // Alice completes 18+ self-attested check -> `eligible_18_plus`, and raw DOB is NEVER stored anywhere in PostgreSQL
    {
      const aliceElig = await httpReq('/api/me/sharing-eligibility', {
        method: 'POST',
        cookie: alice.cookie,
        body: { dob: adultSharingDob }
      });
      assert.equal(aliceElig.status, 200);
      assert.equal(aliceElig.json.sharing_eligibility.status, 'eligible_18_plus');
      assert.equal(aliceElig.json.sharing_eligibility.can_share, true);
      assert(aliceElig.json.sharing_eligibility.self_attested_disclosure.includes('not government ID verification'));

      const dbDobCheck = await superDbPool.query(
        `SELECT
           (SELECT COUNT(*)::int FROM customer_sharing_eligibility WHERE user_id = $1) AS elig_rows,
           (SELECT row_to_json(e)::text FROM customer_sharing_eligibility e WHERE e.user_id = $1) AS elig_json,
           (SELECT COUNT(*)::int FROM audit_logs a WHERE row_to_json(a)::text LIKE $2 OR row_to_json(a)::text LIKE $3) AS audit_dob_hits,
           (SELECT COUNT(*)::int FROM diagnostic_event_samples d WHERE row_to_json(d)::text LIKE $2 OR row_to_json(d)::text LIKE $3) AS diag_dob_hits`,
        [alice.user.id, `%${adultSharingDob}%`, `%${teenDob}%`]
      );
      assert.equal(dbDobCheck.rows[0].elig_rows, 1);
      assert(!String(dbDobCheck.rows[0].elig_json).includes(adultSharingDob), 'Raw DOB must never be stored in DB');
      assert.equal(dbDobCheck.rows[0].audit_dob_hits, 0, 'Raw DOB must never appear in audit_logs');
      assert.equal(dbDobCheck.rows[0].diag_dob_hits, 0, 'Raw DOB must never appear in diagnostic_event_samples');
    }

    // =========================================================================
    // 5. Unlisted Sharing Lifecycle, Preview Parity, Token Safety & Broadening Confirmation
    // =========================================================================
    // No share link exists before explicit creation
    {
      const initialShares = await httpReq('/api/me/shares', { cookie: alice.cookie });
      assert.equal(initialShares.status, 200);
      assert.equal(initialShares.json.shares.length, 0);
    }

    // Create first unlisted share link with SAFE DEFAULTS (all optional profile disclosures `false`)
    const shareCreate1 = await httpReq('/api/me/shares/create', {
      method: 'POST',
      cookie: alice.cookie,
      body: {
        collection_id: aliceColId,
        idempotency_key: 'shr_idem_1'
      }
    });
    assert.equal(shareCreate1.status, 201, `Share create failed: ${JSON.stringify(shareCreate1.json)}`);
    const share1Id = shareCreate1.json.share.share_id;
    const sharePath1 = shareCreate1.json.share_path;
    const rawToken1 = sharePath1.replace(/^\/s\//, '');
    assert(rawToken1.length >= 43, '256-bit base64url token must be >= 43 characters');
    assert.deepEqual(shareCreate1.json.share.disclosures, {
      include_display_name: false,
      include_bio: false,
      include_preferred_area: false,
      include_achievements: false,
      include_shared_photos: false
    });

    // Verify DB stores ONLY SHA-256 hash (`token_sha256`), never plaintext `rawToken1`, and `GET /api/me/shares` masks it
    {
      const expectedHash = crypto.createHash('sha256').update(rawToken1, 'utf8').digest('hex');
      const dbShareRow = await superDbPool.query(
        `SELECT token_sha256, masked_token_hint, row_to_json(customer_collection_shares)::text AS full_row
         FROM customer_collection_shares WHERE id = $1`,
        [share1Id]
      );
      assert.equal(dbShareRow.rows[0].token_sha256, expectedHash);
      assert(!dbShareRow.rows[0].full_row.includes(rawToken1), 'Plaintext token must never be stored in PostgreSQL');

      const listed = await httpReq('/api/me/shares', { cookie: alice.cookie });
      assert.equal(listed.status, 200);
      assert(!JSON.stringify(listed.json).includes(rawToken1), 'GET /api/me/shares must never return raw token');
      assert(listed.json.shares[0].masked_token_hint.includes('…') || listed.json.shares[0].masked_token_hint.includes('...'));
    }

    // Anonymous `GET /s/<token>` returns 200 HTML with strict privacy headers and ZERO private fields
    {
      const livePage = await httpReq(sharePath1);
      assert.equal(livePage.status, 200);
      assert.equal(livePage.headers.get('cache-control'), 'no-store, max-age=0');
      assert.equal(livePage.headers.get('referrer-policy'), 'no-referrer');
      assert(String(livePage.headers.get('x-robots-tag') || '').includes('noindex'));
      assert(livePage.text.includes('name="robots" content="noindex, nofollow, noarchive"'));
      assert(shareCreate1.json.unlisted_warning.includes('Anyone with this link can view it'));
      assert(livePage.text.toLowerCase().includes('anyone with this link can view'));

      for (const forbiddenLeak of [
        'alice-prof@staging.biteshark.invalid',
        alice.user.id,
        PRIVATE_VISIT_NOTE,
        PRIVATE_PHOTO_CAPTION,
        alicePhotoId,
        adultSharingDob,
        'Alice Sonoma', // include_display_name is false by default!
        'Healdsburg', // include_preferred_area is false by default!
        'Weekend farmers market regular' // include_bio is false by default!
      ]) {
        assert(
          !livePage.text.includes(forbiddenLeak),
          `Shared HTML leaked non-disclosed or private value: ${forbiddenLeak}`
        );
      }
    }

    // Share token CANNOT be used as credential/authorization on private endpoints!
    for (const attempt of [
      { headers: { Authorization: `Bearer ${rawToken1}` } },
      { cookie: `__Host-truckly_session=${rawToken1}` },
      { relSuffix: `?token=${encodeURIComponent(rawToken1)}` }
    ]) {
      const privTry = await httpReq(`/api/me/profile${attempt.relSuffix || ''}`, {
        cookie: attempt.cookie || '',
        headers: attempt.headers || {}
      });
      assert.equal(privTry.status, 401, 'Share token must never authorize private /api/me/* endpoints');
    }

    // Changing Alice's private profile (`bio` + XSS test string) does NOT silently expose `bio` or `preferred_town` on `share1`
    {
      const profXssUpd = await httpReq('/api/me/profile', {
        method: 'POST',
        cookie: alice.cookie,
        body: {
          display_name: 'Alice <script>alert(1)</script><img src=x onerror=y()>',
          bio: `Updated private bio ${XSS_PAYLOAD}`
        }
      });
      assert.equal(profXssUpd.status, 200, `profXssUpd failed: ${JSON.stringify(profXssUpd.json)}`);

      const liveAfterPrivEdit = await httpReq(sharePath1);
      assert.equal(liveAfterPrivEdit.status, 200);
      assert(!liveAfterPrivEdit.text.includes('Updated private bio'));
      assert(!liveAfterPrivEdit.text.includes('Healdsburg'));
    }

    // Broadening disclosures on `share1` requires `confirm_shared_view_update: true` (`409` without it!)
    {
      const unconfirmedBroaden = await httpReq('/api/me/shares/update-settings', {
        method: 'POST',
        cookie: alice.cookie,
        body: {
          share_id: share1Id,
          disclosures: {
            include_display_name: true,
            include_bio: true,
            include_preferred_area: true,
            include_achievements: true,
            include_shared_photos: false
          }
        }
      });
      assert.equal(unconfirmedBroaden.status, 409);
      assert.equal(unconfirmedBroaden.json.code, 'SHARED_VIEW_CONFIRMATION_REQUIRED');

      const confirmedBroaden = await httpReq('/api/me/shares/update-settings', {
        method: 'POST',
        cookie: alice.cookie,
        body: {
          share_id: share1Id,
          confirm_shared_view_update: true,
          disclosures: {
            include_display_name: true,
            include_bio: true,
            include_preferred_area: true,
            include_achievements: true,
            include_shared_photos: false
          }
        }
      });
      assert.equal(confirmedBroaden.status, 200);

      // Verify XSS payload in `display_name` & `bio` is safely stripped/escaped on live `/s/<token>` AND preview matches live!
      const previewBroad = await httpReq('/api/me/collections/preview', {
        method: 'POST',
        cookie: alice.cookie,
        body: {
          collection_id: aliceColId,
          disclosures: {
            include_display_name: true,
            include_bio: true,
            include_preferred_area: true,
            include_achievements: true,
            include_shared_photos: false
          }
        }
      });
      assert.equal(previewBroad.status, 200);

      const liveBroad = await httpReq(sharePath1);
      assert.equal(liveBroad.status, 200);
      assert(!liveBroad.text.includes('<script>window.__pwned=1</script>'), 'XSS script tag must never execute');
      assert(!liveBroad.text.includes('onerror="window.__pwned=2"'), 'XSS event handler must never render unescaped');
      assert(liveBroad.text.includes('Healdsburg'));

      // Hiding `exploration_badges` suppresses achievements on BOTH `GET /api/me/profile` and live `/s/<token>`!
      await setFeatureStateAsTop(topUser.cookie, 'exploration_badges', 'hidden');
      const liveBadgesHidden = await httpReq(sharePath1);
      assert.equal(liveBadgesHidden.status, 200);
      const profBadgesHidden = await httpReq('/api/me/profile', { cookie: alice.cookie });
      assert.equal(profBadgesHidden.json.progress.achievements, null);
      await setFeatureStateAsTop(topUser.cookie, 'exploration_badges', 'enabled');
    }

    // Adding a new business to an actively shared collection requires `confirm_shared_view_update: true`
    {
      const curCol = await httpReq(`/api/me/collections/detail?id=${encodeURIComponent(aliceColId)}`, {
        cookie: alice.cookie
      });
      const existingEntries = curCol.json.collection.entries.map(e => ({
        vendor_id: e.vendor_id,
        recommendation: e.recommendation
      }));
      const catalogList = await httpReq('/api/trucks');
      const catalogItems = Array.isArray(catalogList.json) ? catalogList.json : catalogList.json?.trucks || [];
      const extraCatalogVendor = catalogItems.find(
        v => ![dbSpotRenameId, 'mitote', dbSpotSecretId].includes(v.id)
      );
      assert(extraCatalogVendor, 'Expected at least one additional canonical Sonoma County catalog spot');
      const unconf2 = await httpReq('/api/me/collections/update', {
        method: 'POST',
        cookie: alice.cookie,
        body: {
          collection_id: aliceColId,
          expected_revision: curCol.json.collection.revision,
          entries: [...existingEntries, { vendor_id: extraCatalogVendor.id, recommendation: 'Great stop!' }]
        }
      });
      assert.equal(unconf2.status, 409);
      assert.equal(unconf2.json.code, 'SHARED_VIEW_CONFIRMATION_REQUIRED');

      const conf2 = await httpReq('/api/me/collections/update', {
        method: 'POST',
        cookie: alice.cookie,
        body: {
          collection_id: aliceColId,
          expected_revision: curCol.json.collection.revision,
          confirm_shared_view_update: true,
          entries: [...existingEntries, { vendor_id: extraCatalogVendor.id, recommendation: 'Great stop!' }]
        }
      });
      assert.equal(conf2.status, 200);
    }

    // Active share cap (`<= 3` per collection), expiry, rotation, feature disablement & account suspension
    let shareRotatedToken = null;
    let shareRotatedId = null;
    {
      const s2 = await httpReq('/api/me/shares/create', {
        method: 'POST',
        cookie: alice.cookie,
        body: { collection_id: aliceColId, expires_in_days: 7 }
      });
      assert.equal(s2.status, 201, `s2 failed: ${JSON.stringify(s2.json)}`);

      const s3 = await httpReq('/api/me/shares/create', {
        method: 'POST',
        cookie: alice.cookie,
        body: { collection_id: aliceColId, expires_in_days: 30 }
      });
      assert.equal(s3.status, 201, `s3 failed: ${JSON.stringify(s3.json)}`);

      const s4OverCap = await httpReq('/api/me/shares/create', {
        method: 'POST',
        cookie: alice.cookie,
        body: { collection_id: aliceColId }
      });
      assert.equal(s4OverCap.status, 409);

      // Expire `s2` in DB and verify `/s/<s2Token>` returns uniform `404`
      await superDbPool.query(
        `UPDATE customer_collection_shares SET expires_at = NOW() - INTERVAL '5 minutes' WHERE id = $1`,
        [s2.json.share.share_id]
      );
      const expiredPage = await httpReq(s2.json.share_path);
      assert.equal(expiredPage.status, 404);

      // Revoke `s3`
      const revS3 = await httpReq('/api/me/shares/revoke', {
        method: 'POST',
        cookie: alice.cookie,
        body: { share_id: s3.json.share.share_id }
      });
      assert.equal(revS3.status, 200);
      const revokedS3Page = await httpReq(s3.json.share_path);
      assert.equal(revokedS3Page.status, 404);

      // Rotate `share1` -> old `rawToken1` immediately becomes `404`, new token serves `200`
      const rotated = await httpReq('/api/me/shares/rotate', {
        method: 'POST',
        cookie: alice.cookie,
        body: { share_id: share1Id }
      });
      assert.equal(rotated.status, 200);
      shareRotatedToken = rotated.json.share_path.replace(/^\/s\//, '');
      shareRotatedId = rotated.json.share.share_id;
      assert.notEqual(shareRotatedToken, rawToken1);

      const oldTokenRes = await httpReq(sharePath1);
      assert.equal(oldTokenRes.status, 404, 'Rotated-away share token must immediately return 404');
      const newTokenRes = await httpReq(`/s/${shareRotatedToken}`);
      assert.equal(newTokenRes.status, 200);

      // Hiding `unlisted_collection_sharing` immediately blocks live `/s/<token>` (`404`) while preserving collections
      // AND allowing `GET /api/me/shares` + `POST /api/me/shares/revoke`!
      await setFeatureStateAsTop(topUser.cookie, 'unlisted_collection_sharing', 'hidden');
      const liveWhenFeatureHidden = await httpReq(`/s/${shareRotatedToken}`);
      assert.equal(liveWhenFeatureHidden.status, 404);
      const sharesStillListable = await httpReq('/api/me/shares', { cookie: alice.cookie });
      assert.equal(sharesStillListable.status, 200);
      const colsStillIntact = await httpReq('/api/me/collections', { cookie: alice.cookie });
      assert.equal(colsStillIntact.status, 200);
      assert.equal(colsStillIntact.json.collections.length, 1);
      await setFeatureStateAsTop(topUser.cookie, 'unlisted_collection_sharing', 'enabled');
      assert.equal((await httpReq(`/s/${shareRotatedToken}`)).status, 200);

      // Suspending owner account (`auth_users.disabled_at = NOW()`) immediately invalidates live `/s/<token>` (`404`)
      await superDbPool.query(`UPDATE auth_users SET disabled_at = NOW() WHERE id = $1`, [alice.user.id]);
      assert.equal((await httpReq(`/s/${shareRotatedToken}`)).status, 404);
      await superDbPool.query(`UPDATE auth_users SET disabled_at = NULL WHERE id = $1`, [alice.user.id]);
      assert.equal((await httpReq(`/s/${shareRotatedToken}`)).status, 200);
    }

    // =========================================================================
    // 6. Consented EXIF-Stripped Shared Photo Derivatives, Revocation & Source Deletion
    // =========================================================================
    // Missing `share_consent_confirmed: true` rejected (`400`)
    {
      const noConsent = await httpReq('/api/me/collections/attach-photo', {
        method: 'POST',
        cookie: alice.cookie,
        body: {
          collection_id: aliceColId,
          vendor_id: 'mitote',
          source_photo_id: alicePhotoId,
          share_consent_confirmed: false
        }
      });
      assert.equal(noConsent.status, 400);
      assert.equal(noConsent.json.code, 'PHOTO_CONSENT_REQUIRED');

      // Bob cannot attach Alice's private photo to Bob's collection
      const bobCol = await httpReq('/api/me/collections', {
        method: 'POST',
        cookie: bob.cookie,
        body: {
          title: 'Bob Spots',
          entries: [{ vendor_id: 'mitote', recommendation: 'Good tacos' }]
        }
      });
      assert.equal(bobCol.status, 201);
      const crossPhoto = await httpReq('/api/me/collections/attach-photo', {
        method: 'POST',
        cookie: bob.cookie,
        body: {
          collection_id: bobCol.json.collection.collection_id,
          vendor_id: 'mitote',
          source_photo_id: alicePhotoId,
          share_consent_confirmed: true
        }
      });
      assert.equal(crossPhoto.status, 404);
    }

    // Alice attaches `alicePhotoId` to `mitote` with explicit consent + `confirm_shared_view_update: true`
    const att1Res = await httpReq('/api/me/collections/attach-photo', {
      method: 'POST',
      cookie: alice.cookie,
      body: {
        collection_id: aliceColId,
        vendor_id: 'mitote',
        source_photo_id: alicePhotoId,
        share_consent_confirmed: true,
        confirm_shared_view_update: true
      }
    });
    assert.equal(att1Res.status, 200, `Attach photo failed: ${JSON.stringify(att1Res.json)}`);
    const sha1Id = att1Res.json.attachment_id;
    assert.match(sha1Id, /^sha_[a-f0-9]{24,40}$/);

    // Enable `include_shared_photos: true` on `shareRotatedId`
    const enablePhotosOnShare = await httpReq('/api/me/shares/update-settings', {
      method: 'POST',
      cookie: alice.cookie,
      body: {
        share_id: shareRotatedId,
        confirm_shared_view_update: true,
        disclosures: {
          include_display_name: true,
          include_bio: false,
          include_preferred_area: true,
          include_achievements: false,
          include_shared_photos: true
        }
      }
    });
    assert.equal(enablePhotosOnShare.status, 200);

    // Fetch `/s/<token>/photo/<sha1Id>` signed out -> `200 image/webp`, EXIF completely stripped!
    {
      const sharedImg = await httpReq(`/s/${shareRotatedToken}/photo/${sha1Id}`, { rawBuffer: true });
      assert.equal(sharedImg.status, 200);
      assert.equal(sharedImg.headers.get('content-type'), 'image/webp');
      assert.equal(sharedImg.headers.get('cache-control'), 'no-store, max-age=0');

      const meta = await sharp(sharedImg.buffer).metadata();
      assert.equal(meta.format, 'webp');
      assert.equal(meta.exif, undefined, 'Shared WebP derivative must strip EXIF metadata completely');
      assert(!sharedImg.buffer.toString('latin1').includes('SecretCameraMaker'));

      // Probing private `pht_*` ID or revoked token on `/s/<token>/photo/...` returns `404`
      const probePrivateId = await httpReq(`/s/${shareRotatedToken}/photo/${alicePhotoId}`);
      assert.equal(probePrivateId.status, 404);
      const probeRevokedToken = await httpReq(`/s/${rawToken1}/photo/${sha1Id}`);
      assert.equal(probeRevokedToken.status, 404);

      // Hiding `shared_collection_photos` blocks `/s/<token>/photo/<sha1Id>` (`404`) while keeping text `/s/<token>` `200`!
      await setFeatureStateAsTop(topUser.cookie, 'shared_collection_photos', 'hidden');
      assert.equal((await httpReq(`/s/${shareRotatedToken}/photo/${sha1Id}`)).status, 404);
      assert.equal((await httpReq(`/s/${shareRotatedToken}`)).status, 200);
      await setFeatureStateAsTop(topUser.cookie, 'shared_collection_photos', 'enabled');
      assert.equal((await httpReq(`/s/${shareRotatedToken}/photo/${sha1Id}`)).status, 200);
    }

    // Deleting source private photo (`POST /api/me/photos/delete`) IMMEDIATELY stops shared image serving & unlinks derived file!
    {
      const dbAttBefore = await superDbPool.query(
        `SELECT shared_rel_path FROM customer_collection_photo_attachments WHERE id = $1`,
        [sha1Id]
      );
      const derivedDiskPath = path.join(photoStorageDir, dbAttBefore.rows[0].shared_rel_path);
      assert(fs.existsSync(derivedDiskPath), 'Derived shared WebP file must exist before deletion');

      const delSource = await httpReq('/api/me/photos/delete', {
        method: 'POST',
        cookie: alice.cookie,
        body: { photo_id: alicePhotoId }
      });
      assert.equal(delSource.status, 200);

      const afterSourceDelete = await httpReq(`/s/${shareRotatedToken}/photo/${sha1Id}`);
      assert.equal(afterSourceDelete.status, 404, 'Deleted source photo must immediately cease serving via shared link');
      assert(!fs.existsSync(derivedDiskPath), 'Derived shared WebP file must be unlinked when source photo is deleted');
    }

    // Attach second photo (`alicePhoto2Id`) so we can verify share revocation & moderation suppression!
    const att2Res = await httpReq('/api/me/collections/attach-photo', {
      method: 'POST',
      cookie: alice.cookie,
      body: {
        collection_id: aliceColId,
        vendor_id: dbSpotRenameId,
        source_photo_id: alicePhoto2Id,
        share_consent_confirmed: true,
        confirm_shared_view_update: true
      }
    });
    assert.equal(att2Res.status, 200);
    const sha2Id = att2Res.json.attachment_id;
    assert.equal((await httpReq(`/s/${shareRotatedToken}/photo/${sha2Id}`)).status, 200);

    // =========================================================================
    // 7. Abuse Reporting & Scoped Staff Moderation (`Admin: Mod` vs `Admin: Top`)
    // =========================================================================
    // Reject report payloads attempting to transmit raw `token` or `share_url`
    {
      const rawTokReport = await httpReq('/api/shared/report', {
        method: 'POST',
        body: {
          share_id: shareRotatedId,
          token: shareRotatedToken,
          reason: 'spam_or_scam'
        }
      });
      assert.equal(rawTokReport.status, 400);
      assert.equal(rawTokReport.json.code, 'RAW_TOKEN_IN_REPORT_FORBIDDEN');
    }

    // Signed-out viewer submits abuse report -> `201`, and free-text URL/email/token is scrubbed before DB insert!
    {
      const rep1 = await httpReq('/api/shared/report', {
        method: 'POST',
        headers: { 'X-Forwarded-For': '198.51.100.44' },
        body: {
          share_id: shareRotatedId,
          attachment_id: sha2Id,
          reason: 'copyright_or_photo',
          details: `Found via ${baseOrigin}/s/${shareRotatedToken} from leak@example.com`
        }
      });
      assert.equal(rep1.status, 201, `Report 1 failed: ${JSON.stringify(rep1.json)}`);
      assert.match(rep1.json.report_id, /^srp_[a-f0-9]{24,40}$/);

      const repRow = await superDbPool.query(`SELECT details FROM customer_share_reports WHERE id = $1`, [
        rep1.json.report_id
      ]);
      assert(!repRow.rows[0].details.includes(shareRotatedToken), 'Report details must scrub raw share tokens');
      assert(!repRow.rows[0].details.includes('leak@example.com'), 'Report details must scrub email addresses');

      // Rate limit: 4 more allowed (total 5), 6th rejected with `429 REPORT_RATE_LIMITED`
      for (let i = 2; i <= 5; i++) {
        const r = await httpReq('/api/shared/report', {
          method: 'POST',
          body: { share_id: shareRotatedId, reason: 'spam_or_abuse', details: `Report #${i}` }
        });
        assert.equal(r.status, 201);
      }
      const sixthReport = await httpReq('/api/shared/report', {
        method: 'POST',
        body: { share_id: shareRotatedId, reason: 'spam_or_abuse', details: 'Report #6 over limit' }
      });
      assert.equal(sixthReport.status, 429);
      assert.equal(sixthReport.json.code, 'REPORT_RATE_LIMITED');
    }

    // Regular customer denied `/api/admin/shared-moderation` (`403`); `Admin: Mod` receives strictly scoped queue DTO
    {
      const custModDenied = await httpReq('/api/admin/shared-moderation', { cookie: bob.cookie });
      assert.equal(custModDenied.status, 403);

      const modQueue = await httpReq('/api/admin/shared-moderation?status=open', { cookie: modUser.cookie });
      assert.equal(modQueue.status, 200);
      assert.equal(modQueue.json.items.length, 1);
      const qSerialized = JSON.stringify(modQueue.json);
      assert(!qSerialized.includes(PRIVATE_VISIT_NOTE), 'Moderator queue must NEVER expose private visit notes');
      assert(!qSerialized.includes('alice-prof@staging.biteshark.invalid'), 'Moderator queue must NEVER expose owner email');
      assert(!qSerialized.includes(shareRotatedToken), 'Moderator queue must NEVER expose raw share token');

      // Moderator can fetch the reported shared attachment derivative, NOT private `pht_*` photos
      const modSharedImg = await httpReq(
        `/api/admin/shared-moderation/photo?attachment_id=${encodeURIComponent(sha2Id)}`,
        { cookie: modUser.cookie, rawBuffer: true }
      );
      assert.equal(modSharedImg.status, 200);

      const modPrivateProbe = await httpReq(
        `/api/admin/shared-moderation/photo?attachment_id=${encodeURIComponent(alicePhoto2Id)}`,
        { cookie: modUser.cookie }
      );
      assert.equal(modPrivateProbe.status, 400);
    }

    // `Admin: Mod` suppresses attachment -> `/s/<token>/photo/<sha2Id>` returns `404` while text `/s/<token>` stays `200`
    {
      const supAtt = await httpReq('/api/admin/shared-moderation/decision', {
        method: 'POST',
        cookie: modUser.cookie,
        body: {
          collection_id: aliceColId,
          attachment_id: sha2Id,
          action: 'suppress_attachment',
          reason: 'Reported image violates food listing photo standards.'
        }
      });
      assert.equal(supAtt.status, 200);
      assert.equal((await httpReq(`/s/${shareRotatedToken}/photo/${sha2Id}`)).status, 404);
      assert.equal((await httpReq(`/s/${shareRotatedToken}`)).status, 200);
    }

    // `Admin: Mod` suppresses collection -> `/s/<token>` immediately returns `404`, and Alice CANNOT bypass by rotating,
    // creating a new link, or cloning identical suppressed content into another collection!
    {
      const rmAttRes = await httpReq('/api/me/collections/remove-photo', {
        method: 'POST',
        cookie: alice.cookie,
        body: { collection_id: aliceColId, attachment_id: sha2Id }
      });
      assert.equal(rmAttRes.status, 200);
      const preSupDetail = await httpReq(`/api/me/collections/detail?id=${encodeURIComponent(aliceColId)}`, {
        cookie: alice.cookie
      });
      const cleanActiveEntries = preSupDetail.json.collection.entries
        .filter(e => e.catalog_status === 'available')
        .map(e => ({ vendor_id: e.vendor_id, recommendation: e.recommendation }));
      const cleanUpd = await httpReq('/api/me/collections/update', {
        method: 'POST',
        cookie: alice.cookie,
        body: {
          collection_id: aliceColId,
          expected_revision: preSupDetail.json.collection.revision,
          confirm_shared_view_update: true,
          entries: cleanActiveEntries
        }
      });
      assert.equal(cleanUpd.status, 200);

      const supCol = await httpReq('/api/admin/shared-moderation/decision', {
        method: 'POST',
        cookie: modUser.cookie,
        body: {
          collection_id: aliceColId,
          action: 'suppress_collection',
          reason: 'Collection text violates community guidelines.'
        }
      });
      assert.equal(supCol.status, 200);
      assert.equal((await httpReq(`/s/${shareRotatedToken}`)).status, 404);

      // Owner cannot create or rotate link on suppressed collection
      const bypassCreate = await httpReq('/api/me/shares/create', {
        method: 'POST',
        cookie: alice.cookie,
        body: { collection_id: aliceColId }
      });
      assert.equal(bypassCreate.status, 403);
      assert.equal(bypassCreate.json.code, 'COLLECTION_SUPPRESSED_BY_MODERATION');

      // Owner cannot clone identical content into a new collection and create a share link for it!
      const curDetail = await httpReq(`/api/me/collections/detail?id=${encodeURIComponent(aliceColId)}`, {
        cookie: alice.cookie
      });
      const cloneCol = await httpReq('/api/me/collections', {
        method: 'POST',
        cookie: alice.cookie,
        body: {
          title: curDetail.json.collection.title,
          intro: curDetail.json.collection.intro,
          entries: curDetail.json.collection.entries.map(e => ({
            vendor_id: e.vendor_id,
            recommendation: e.recommendation
          }))
        }
      });
      assert.equal(cloneCol.status, 201);
      const cloneShareAttempt = await httpReq('/api/me/shares/create', {
        method: 'POST',
        cookie: alice.cookie,
        body: { collection_id: cloneCol.json.collection.collection_id }
      });
      assert.equal(cloneShareAttempt.status, 403, 'Owner must not bypass suppression by cloning identical content');

      await httpReq('/api/me/collections/delete', {
        method: 'POST',
        cookie: alice.cookie,
        body: { collection_id: cloneCol.json.collection.collection_id }
      });

      // Mod can reinstate Mod-level suppression; Top Admin suppression blocks Mod reinstatement (`403 TOP_ADMIN_REQUIRED`)
      const modReinstate = await httpReq('/api/admin/shared-moderation/decision', {
        method: 'POST',
        cookie: modUser.cookie,
        body: {
          collection_id: aliceColId,
          action: 'reinstate_collection',
          reason: 'Reviewed appeal and cleared collection.'
        }
      });
      assert.equal(modReinstate.status, 200);

      const topSup = await httpReq('/api/admin/shared-moderation/decision', {
        method: 'POST',
        cookie: topUser.cookie,
        body: {
          collection_id: aliceColId,
          action: 'suppress_collection',
          reason: 'Top Admin policy hold.'
        }
      });
      assert.equal(topSup.status, 200);

      const modBlockedReinstate = await httpReq('/api/admin/shared-moderation/decision', {
        method: 'POST',
        cookie: modUser.cookie,
        body: {
          collection_id: aliceColId,
          action: 'reinstate_collection',
          reason: 'Mod attempting to override Top Admin.'
        }
      });
      assert.equal(modBlockedReinstate.status, 403);
      assert.equal(modBlockedReinstate.json.code, 'TOP_ADMIN_REQUIRED');

      const topReinstate = await httpReq('/api/admin/shared-moderation/decision', {
        method: 'POST',
        cookie: topUser.cookie,
        body: {
          collection_id: aliceColId,
          action: 'reinstate_collection',
          reason: 'Top Admin cleared hold.'
        }
      });
      assert.equal(topReinstate.status, 200);
    }

    // =========================================================================
    // 8. Essential Privacy/Export/Deletion Independence & Log Redaction Verification
    // =========================================================================
    // Hide `customer_profile` completely -> `/api/me/profile` returns `403`, while `/api/me/profile/privacy`,
    // `/api/me/shares`, `/api/me/shares/revoke`, and `/api/me/profile/delete-data` ALL remain operational!
    {
      const freshShare = await httpReq('/api/me/shares/create', {
        method: 'POST',
        cookie: alice.cookie,
        body: { collection_id: aliceColId }
      });
      assert.equal(freshShare.status, 201);
      const freshToken = freshShare.json.share_path.replace(/^\/s\//, '');
      const freshShareId = freshShare.json.share.share_id;

      await setFeatureStateAsTop(topUser.cookie, 'customer_profile', 'hidden');

      const blockedProfile = await httpReq('/api/me/profile', { cookie: alice.cookie });
      assert.equal(blockedProfile.status, 403);
      assert.equal(blockedProfile.json.code, 'FEATURE_DISABLED');

      const exportStillWorks = await httpReq('/api/me/profile/privacy', { cookie: alice.cookie });
      assert.equal(exportStillWorks.status, 200);
      assert(!JSON.stringify(exportStillWorks.json).includes(freshToken), 'Export must never contain raw share tokens');

      const revokeStillWorks = await httpReq('/api/me/shares/revoke', {
        method: 'POST',
        cookie: alice.cookie,
        body: { share_id: freshShareId }
      });
      assert.equal(revokeStillWorks.status, 200);
      assert.equal((await httpReq(`/s/${freshToken}`)).status, 404);

      const deleteStillWorks = await httpReq('/api/me/profile/delete-data', {
        method: 'POST',
        cookie: alice.cookie,
        body: { confirm_delete: true, include_exploration_data: false }
      });
      assert.equal(deleteStillWorks.status, 200);

      await setFeatureStateAsTop(topUser.cookie, 'customer_profile', 'enabled');

      // Alice's collections were cleared, while her private exploration visits & account remain intact!
      const afterClear = await httpReq('/api/me/profile', { cookie: alice.cookie });
      assert.equal(afterClear.status, 200);
      assert.equal(afterClear.json.collections_summary.count, 0);
      assert.equal(afterClear.json.activity_preview.visits_total, 2, 'Exploration visits must remain intact when include_exploration_data is false');
      assert.equal(afterClear.json.activity_preview.photos_total, 1, 'Remaining private photo must remain intact');

      // Hit an invalid `/s/<randomToken>` and verify zero raw tokens appear in server logs or `diagnostic_event_samples`
      const probeBogusToken = 'bogus_' + crypto.randomBytes(32).toString('base64url');
      const bogusRes = await httpReq(`/s/${probeBogusToken}`);
      assert.equal(bogusRes.status, 404);

      const allLogsJoined = capturedServerLogs.join('\n');
      for (const secretToken of [rawToken1, shareRotatedToken, freshToken, probeBogusToken]) {
        assert(
          !allLogsJoined.includes(secretToken),
          `Raw share token leaked into server logs: ${secretToken.slice(0, 8)}...`
        );
      }

      const diagLeakCheck = await superDbPool.query(
        `SELECT COUNT(*)::int AS leaks
         FROM diagnostic_event_samples d
         WHERE row_to_json(d)::text LIKE $1
            OR row_to_json(d)::text LIKE $2`,
        [`%${rawToken1}%`, `%${probeBogusToken}%`]
      );
      assert.equal(diagLeakCheck.rows[0].leaks, 0, 'Diagnostic samples must never contain raw share tokens');
    }

    origConsoleLog(
      JSON.stringify({
        ok: true,
        suite: 'customer-profile-sharing.integration',
        verified: [
          'migration_029_idempotent_and_rls_enforced',
          'private_profile_reuses_canonical_exploration_favorites_and_notifications',
          'coarse_sonoma_town_and_dietary_preference_validation',
          'greatest_hits_collections_limits_reordering_concurrency_and_catalog_truthfulness',
          'adult_18_plus_sharing_eligibility_without_dob_storage',
          'hashed_256bit_unlisted_links_preview_parity_rotation_revocation_and_broadening_confirmation',
          'consented_exif_stripped_shared_photo_derivatives_and_source_deletion_cascade',
          'signed_out_abuse_reporting_and_scoped_mod_top_suppression',
          'feature_controls_and_zero_raw_token_logging'
        ]
      })
    );
  } finally {
    console.log = origConsoleLog;
    console.warn = origConsoleWarn;
    console.error = origConsoleError;
    if (standalone?.server) {
      await new Promise(resolve => standalone.server.close(() => resolve()));
    }
    if (typeof superDbPool !== 'undefined' && superDbPool) await superDbPool.end().catch(() => {});
    if (appPool) await appPool.end().catch(() => {});
    if (migratorPool) await migratorPool.end().catch(() => {});
    await adminPool.end().catch(() => {});
    await pgCluster.stop();
    try {
      fs.rmSync(photoStorageDir, { recursive: true, force: true });
    } catch {}
  }
})();
