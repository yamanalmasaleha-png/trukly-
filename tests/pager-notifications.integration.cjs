// Real-PostgreSQL Integration Suite for Durable Pickup-Pager Notifications (Workstreams C & D):
//   [1/8] Migration matrix: empty DB, legacy 001..010 upgrade, P0/P1 001..014 upgrade + retry,
//         preservation of memberships/favorites/bookings/verified metadata/RLS, and FORCE RLS on outbox tables
//   [2/8] Authorization, cross-pager isolation, CSRF, SSRF destination allowlist & rate limiting
//   [3/8] Atomic outbox creation, mid-transaction rollback leaving zero events, concurrent ready & anti-flap
//   [4/8] Wire-level RFC 8291 (`aes128gcm`) ECDH decryption + RFC 8292 VAPID ES256 JWT verification
//   [5/8] Concurrent worker claims (`FOR UPDATE SKIP LOCKED`), crash recovery & crash-after-send lease replay
//   [6/8] Retry backoff, permanent failure, `410 Gone` token scrubbing, and unsubscribe/terminal/expired races
//   [7/8] Release controls (`TRUCKLY_DISABLE_SUBSCRIPTIONS`, `TRUCKLY_DISABLE_NOTIFICATION_DELIVERY`, default disabled)
//   [8/8] Telemetry RBAC, strict secret/endpoint/pager-UUID redaction, and retention cleanup

const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const os = require('node:os');
const http = require('node:http');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { register } = require('node:module');
const { pathToFileURL } = require('node:url');
const { AsyncLocalStorage } = require('node:async_hooks');

const ROOT = path.resolve(__dirname, '..');

function requirePg() {
  const extraBase = process.env.TRUCKLY_PG_NODE_MODULES;
  if (extraBase) {
    return require(path.join(extraBase, 'pg'));
  }
  return require('pg');
}

const { Pool } = requirePg();

const requestAls = new AsyncLocalStorage();
let activeDb = null;

globalThis.__BITESHARK_NOTIF_TEST_RUNTIME__ = {
  db: {
    query: (text, params) => {
      const dbRef = requestAls.getStore()?.db || activeDb;
      if (!dbRef) throw new Error('No active PostgreSQL pool bound');
      return dbRef.query(text, params);
    },
    transaction: async fn => {
      const dbRef = requestAls.getStore()?.db || activeDb;
      if (!dbRef) throw new Error('No active PostgreSQL pool bound');
      const client = await dbRef.connect();
      try {
        await client.query('BEGIN');
        const out = await fn(client);
        await client.query('COMMIT');
        return out;
      } catch (err) {
        try {
          await client.query('ROLLBACK');
        } catch {}
        throw err;
      } finally {
        client.release();
      }
    }
  },
  auth: {
    getUser: async () => requestAls.getStore()?.user || null
  }
};

register(
  'data:text/javascript,' +
    encodeURIComponent(`
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "@biteshark/runtime-adapter") {
    return {
      shortCircuit: true,
      url: "data:text/javascript,export const db = globalThis.__BITESHARK_NOTIF_TEST_RUNTIME__.db; export const auth = globalThis.__BITESHARK_NOTIF_TEST_RUNTIME__.auth;"
    };
  }
  return nextResolve(specifier, context);
}
`)
);

const routeCache = new Map();
async function loadRoute(relApiPath) {
  const full = path.join(ROOT, 'api', ...relApiPath.split('/'));
  if (!routeCache.has(full)) {
    routeCache.set(full, await import(pathToFileURL(full).href));
  }
  return routeCache.get(full);
}

async function callApi(
  relApiPath,
  {
    method = 'GET',
    user = null,
    query = {},
    params = {},
    body = {},
    headers = {},
    dbPool = null,
    testNow = null,
    testClock = null,
    testHooks = null,
    testLeaseSeconds = null,
    testProviderTimeoutMs = null,
    testWorkerId = null,
    forceRollbackAfterEvent = false,
    forceRollbackAfterCatchup = false
  } = {}
) {
  const mod = await loadRoute(relApiPath);

  let statusCode = 200;
  let jsonBody = undefined;
  const resHeaders = {};

  const req = {
    method,
    query,
    params,
    body,
    headers,
    ...(user ? { user } : {}),
    ...(testNow instanceof Date ? { _testNow: testNow } : {}),
    ...(typeof testClock === 'function' ? { _testClock: testClock } : {}),
    ...(testHooks && typeof testHooks === 'object' ? { _testHooks: testHooks } : {}),
    ...(typeof testLeaseSeconds === 'number' ? { _testLeaseSeconds: testLeaseSeconds } : {}),
    ...(typeof testProviderTimeoutMs === 'number' ? { _testProviderTimeoutMs: testProviderTimeoutMs } : {}),
    ...(typeof testWorkerId === 'string' ? { _testWorkerId: testWorkerId } : {}),
    ...(forceRollbackAfterEvent ? { _testForceRollbackAfterEvent: true } : {}),
    ...(forceRollbackAfterCatchup ? { _testForceRollbackAfterCatchup: true } : {})
  };

  const res = {
    setHeader(k, v) {
      resHeaders[k.toLowerCase()] = v;
    },
    status(c) {
      statusCode = c;
      return this;
    },
    end() {
      return this;
    },
    json(payload) {
      jsonBody = payload;
      return this;
    }
  };

  await requestAls.run({ db: dbPool || activeDb, user }, () => mod.default(req, res));

  return { status: statusCode, body: jsonBody, headers: resHeaders };
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
    throw new Error('Set DATABASE_URL or provide @embedded-postgres binaries via TRUCKLY_PG_NODE_MODULES.');
  }

  const initdbExe = path.join(nativeBinDir, 'initdb' + binSuffix);
  const pgCtlExe = path.join(nativeBinDir, 'pg_ctl' + binSuffix);
  const port = await getFreePort();
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'truckly-notif-pg-'));
  const dataDir = path.join(tmpBase, 'data');
  const pwFile = path.join(tmpBase, 'pw.txt');
  const logFile = path.join(tmpBase, 'postgres.log');
  const password = 'truckly_np_pw_' + crypto.randomBytes(6).toString('hex');
  fs.writeFileSync(pwFile, password + '\n', 'utf8');

  execFileSync(
    initdbExe,
    ['-D', dataDir, '-U', 'postgres', `--pwfile=${pwFile}`, '-A', 'scram-sha-256', '-E', 'UTF8', '--no-locale'],
    { stdio: 'ignore', windowsHide: true }
  );
  execFileSync(
    pgCtlExe,
    ['-D', dataDir, '-l', logFile, '-w', '-o', `-p ${port} -h 127.0.0.1`, 'start'],
    { stdio: 'ignore', windowsHide: true }
  );

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

function listMigrations(minPrefix = 1, maxPrefix = 999) {
  return fs
    .readdirSync(path.join(ROOT, 'migrations'))
    .filter(f => /^\d{3}_.+\.sql$/.test(f))
    .sort()
    .filter(f => {
      const n = Number(f.slice(0, 3));
      return n >= minPrefix && n <= maxPrefix;
    });
}

async function applyMigrations(pool, files) {
  for (const f of files) {
    await pool.query(fs.readFileSync(path.join(ROOT, 'migrations', f), 'utf8'));
  }
}

function buildDbUrl(baseAdminUrl, { user, password, database }) {
  const u = new URL(baseAdminUrl);
  u.username = user;
  u.password = password || '';
  u.pathname = `/${database}`;
  return u.toString();
}

function createSubscriberKeys(webpushCrypto) {
  const ecdh = crypto.createECDH('prime256v1');
  const pub = ecdh.generateKeys();
  const authSecret = crypto.randomBytes(16);
  return {
    ecdh,
    authSecret,
    p256dh: webpushCrypto.toBase64Url(pub),
    auth: webpushCrypto.toBase64Url(authSecret)
  };
}

const CLIENT_HEADERS = {
  'x-truckly-client': 'web-pager-v1',
  origin: 'https://truckly-staging.hatchable.site',
  host: 'truckly-staging.hatchable.site',
  'sec-fetch-site': 'same-origin',
  'x-forwarded-for': '198.51.100.10'
};

const ACTORS = {
  admin: { id: 'usr_notif_admin', email: 'admin@truckly.test', role: 'admin' },
  ownerA: { id: 'usr_notif_owner_a', email: 'iniguez@truckly.test', role: 'user' },
  staffA: { id: 'usr_notif_staff_a', email: 'iniguez-staff@truckly.test', role: 'user' },
  ownerB: { id: 'usr_notif_owner_b', email: 'mitote@truckly.test', role: 'user' },
  custA: { id: 'usr_notif_cust_a', email: 'cust@sonoma.test', role: 'user' }
};

const WORKER_SECRET = 'stg_worker_secret_' + crypto.randomBytes(16).toString('hex');

(async () => {
  const webpushCrypto = await import(pathToFileURL(path.join(ROOT, 'lib', 'webpush-crypto.js')).href);
  const notifLib = await import(pathToFileURL(path.join(ROOT, 'lib', 'pager-notifications.js')).href);

  const pgCluster = await createPostgresCluster();
  const suffix = crypto.randomBytes(4).toString('hex');
  const appRole = `truckly_np_app_${suffix}`;
  const appPass = `pw_${suffix}`;
  const emptyDbName = `truckly_np_empty_${suffix}`;
  const legacyDbName = `truckly_np_legacy_${suffix}`;
  const p1UpgradeDbName = `truckly_np_upgrade_${suffix}`;

  const adminPool = new Pool({ connectionString: pgCluster.adminUrl, max: 4 });
  let emptyPool = null;
  let legacyPool = null;
  let appPool = null;
  let loopbackServer = null;

  try {
    await adminPool.query(`CREATE ROLE ${appRole} LOGIN PASSWORD '${appPass}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`);
    await adminPool.query(`CREATE DATABASE ${emptyDbName} OWNER ${appRole}`);
    await adminPool.query(`CREATE DATABASE ${legacyDbName} OWNER ${appRole}`);
    await adminPool.query(`CREATE DATABASE ${p1UpgradeDbName} OWNER ${appRole}`);

    emptyPool = new Pool({ connectionString: buildDbUrl(pgCluster.adminUrl, { user: appRole, password: appPass, database: emptyDbName }), max: 4 });
    legacyPool = new Pool({ connectionString: buildDbUrl(pgCluster.adminUrl, { user: appRole, password: appPass, database: legacyDbName }), max: 4 });
    appPool = new Pool({ connectionString: buildDbUrl(pgCluster.adminUrl, { user: appRole, password: appPass, database: p1UpgradeDbName }), max: 8 });

    // =========================================================================
    // [1/8] Migration Matrix & Preservation + FORCE ROW LEVEL SECURITY
    // =========================================================================
    // 1a. Empty database -> 001..015
    await applyMigrations(emptyPool, listMigrations(1, 999));
    assert.equal((await emptyPool.query('SELECT count(*)::int AS c FROM vendors WHERE is_active = true')).rows[0].c, 59);

    // 1b. Legacy 001..010 database with pre-existing rows -> 011..015
    await applyMigrations(legacyPool, listMigrations(1, 10));
    await legacyPool.query(`INSERT INTO favorites (user_id, truck_id) VALUES ('usr_leg', 'mitote')`);
    await legacyPool.query(`INSERT INTO truck_settings (truck_id, location, is_open) VALUES ('estrella', 'Austin Legacy', true)`);
    await applyMigrations(legacyPool, listMigrations(11, 999));
    {
      const legChk = await legacyPool.connect();
      try {
        await legChk.query('BEGIN');
        await legChk.query("SELECT set_config('app.user_id', 'usr_leg', true)");
        assert.equal((await legChk.query('SELECT count(*)::int AS c FROM favorites WHERE user_id = $1', ['usr_leg'])).rows[0].c, 1);
        await legChk.query('COMMIT');
      } finally {
        legChk.release();
      }
    }

    // 1c. Existing P0/P1 schema (001..014) -> populate memberships, bookings, verified metadata, community RLS -> upgrade 015 + retry 014 & 015
    await applyMigrations(appPool, listMigrations(1, 14));
    await appPool.query(`INSERT INTO platform_roles (user_id, role, granted_by) VALUES ($1, 'platform_admin', 'bootstrap')`, [ACTORS.admin.id]);
    await appPool.query(
      `INSERT INTO vendor_memberships (vendor_id, user_id, role, granted_by) VALUES
         ('iniguez', $1, 'owner', $4),
         ('iniguez', $2, 'staff', $1),
         ('mitote', $3, 'owner', $4)`,
      [ACTORS.ownerA.id, ACTORS.staffA.id, ACTORS.ownerB.id, ACTORS.admin.id]
    );
    await appPool.query(`INSERT INTO favorites (user_id, truck_id) VALUES ($1, 'iniguez')`, [ACTORS.custA.id]);
    await appPool.query(
      `UPDATE vendors
       SET verified = true,
           verification_status = 'business_confirmed',
           photo_rights_verified = true,
           photo = 'https://cdn.truckly.test/licensed/mitote.jpg'
       WHERE id = 'mitote'`
    );
    const preUpgradeClient = await appPool.connect();
    try {
      await preUpgradeClient.query('BEGIN');
      await preUpgradeClient.query("SELECT set_config('app.user_id', $1, true)", [ACTORS.custA.id]);
      await preUpgradeClient.query(
        `INSERT INTO community_reviews (author_id, nickname, kind, place_id, place_name, town, title, body, rating, status)
         VALUES ($1, 'Maya', 'tip', 'mitote', 'Mitote Food Park', 'Santa Rosa', 'Great courtyard seating', 'Plenty of shade and tables near the music stage.', NULL, 'pending')`,
        [ACTORS.custA.id]
      );
      await preUpgradeClient.query('COMMIT');
    } finally {
      preUpgradeClient.release();
    }

    // Apply 015, then retry 014 + 015 idempotently
    await applyMigrations(appPool, listMigrations(15, 999));
    await applyMigrations(appPool, listMigrations(14, 999));

    const mitotePreserved = (await appPool.query(`SELECT verified, photo_rights_verified, photo FROM vendors WHERE id = 'mitote'`)).rows[0];
    assert.equal(mitotePreserved.verified, true);
    assert.equal(mitotePreserved.photo_rights_verified, true);
    assert.equal(mitotePreserved.photo, 'https://cdn.truckly.test/licensed/mitote.jpg');
    assert.equal((await appPool.query(`SELECT count(*)::int AS c FROM vendor_memberships`)).rows[0].c, 3);
    // Favorites RLS hides rows on bare SELECT without `app.user_id` while preserving owner rows
    assert.equal((await appPool.query(`SELECT count(*)::int AS c FROM favorites`)).rows[0].c, 0);
    {
      const favChk = await appPool.connect();
      try {
        await favChk.query('BEGIN');
        await favChk.query("SELECT set_config('app.user_id', $1, true)", [ACTORS.custA.id]);
        assert.equal((await favChk.query(`SELECT count(*)::int AS c FROM favorites`)).rows[0].c, 1);
        await favChk.query('COMMIT');
      } finally {
        favChk.release();
      }
    }
    // Community RLS still hides unpublished posts on bare SELECT
    assert.equal((await appPool.query(`SELECT count(*)::int AS c FROM community_reviews`)).rows[0].c, 0);

    // Notification tables enforce FORCE ROW LEVEL SECURITY on bare connection without `app.pager_internal = 'true'`
    assert.equal((await appPool.query(`SELECT count(*)::int AS c FROM pager_notification_subscriptions`)).rows[0].c, 0);
    await assert.rejects(
      () => appPool.query(`INSERT INTO pager_rate_limits (bucket_key, window_start, hit_count) VALUES ('test', now(), 1)`),
      /row-level security policy/,
      'FORCE RLS blocks direct writes to pager_rate_limits without app.pager_internal'
    );

    activeDb = appPool;
    console.log('PASS [1/8]: Empty, legacy, P0/P1 upgrade, idempotent migration retry, metadata preservation & FORCE RLS verified');

    // =========================================================================
    // [2/8] Authorization, Cross-Pager Isolation, CSRF, SSRF & Rate Limiting
    // =========================================================================
    // Verify default provider mode (unset) is safely disabled even if VAPID keys exist!
    const testVapid = webpushCrypto.generateVapidKeys();
    process.env.TRUCKLY_VAPID_PUBLIC_KEY = testVapid.publicKey;
    process.env.TRUCKLY_VAPID_PRIVATE_KEY = testVapid.privateKey;
    process.env.TRUCKLY_VAPID_SUBJECT = 'mailto:ops@truckly.test';
    process.env.TRUCKLY_NOTIFICATION_WORKER_SECRET = WORKER_SECRET;
    delete process.env.TRUCKLY_PUSH_PROVIDER_MODE;

    assert.equal(notifLib.getPushProviderConfig().enabled, false, 'default unset provider mode remains disabled');

    // Verify simulated modes fail closed unless TRUCKLY_ALLOW_TEST_PUSH_MODES=1 is explicitly set
    delete process.env.TRUCKLY_ALLOW_TEST_PUSH_MODES;
    process.env.TRUCKLY_PUSH_PROVIDER_MODE = 'fake';
    assert.equal(
      notifLib.getPushProviderConfig().enabled,
      false,
      'fake provider mode must fail closed without TRUCKLY_ALLOW_TEST_PUSH_MODES=1'
    );

    // Enable deterministic fake provider mode explicitly for non-production test harness
    process.env.TRUCKLY_ALLOW_TEST_PUSH_MODES = '1';
    process.env.TRUCKLY_PUSH_PROVIDER_MODE = 'fake';
    assert.equal(notifLib.getPushProviderConfig().enabled, true);

    // Create two real pagers: Pager A (`iniguez`) and Pager B (`mitote`)
    const createPagerA = await callApi('pager/staff.js', {
      method: 'POST',
      user: ACTORS.staffA,
      body: { vendor_id: 'iniguez', ticket: 'A-101', request_key: crypto.randomUUID() }
    });
    assert.equal(createPagerA.status, 201);
    const pagerA = createPagerA.body.pager;

    const createPagerB = await callApi('pager/staff.js', {
      method: 'POST',
      user: ACTORS.ownerB,
      body: { vendor_id: 'mitote', ticket: 'B-202', request_key: crypto.randomUUID() }
    });
    assert.equal(createPagerB.status, 201);
    const pagerB = createPagerB.body.pager;

    const subKeys1 = createSubscriberKeys(webpushCrypto);
    const validSubPayload = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/sub-device-1',
      keys: { p256dh: subKeys1.p256dh, auth: subKeys1.auth }
    };

    // CSRF blocks: missing X-Truckly-Client or cross-origin Origin
    assert.equal(
      (await callApi('pager/subscriptions.js', {
        method: 'POST',
        headers: { origin: 'https://truckly-staging.hatchable.site', host: 'truckly-staging.hatchable.site' },
        body: { code: pagerA.id, subscription: validSubPayload }
      })).status,
      403,
      'missing X-Truckly-Client rejected'
    );
    assert.equal(
      (await callApi('pager/subscriptions.js', {
        method: 'POST',
        headers: { ...CLIENT_HEADERS, origin: 'https://evil-attacker.example' },
        body: { code: pagerA.id, subscription: validSubPayload }
      })).status,
      403,
      'cross-origin POST rejected'
    );

    // Non-existent / guessed pager UUID cannot be subscribed (`404`)
    assert.equal(
      (await callApi('pager/subscriptions.js', {
        method: 'POST',
        headers: CLIENT_HEADERS,
        body: { code: crypto.randomUUID(), subscription: validSubPayload }
      })).status,
      404
    );

    // SSRF & malformed key blocks
    for (const badEndpoint of [
      'http://fcm.googleapis.com/fcm/send/insecure',
      'https://127.0.0.1/push/local',
      'https://169.254.169.254/latest/meta-data/',
      'https://fcm.googleapis.com:8443/fcm/send/port',
      'https://user:secret@fcm.googleapis.com/fcm/send/creds',
      'https://untrusted-ssrf-target.example.com/push/abc',
      'https://fcm.googleapis.com/'
    ]) {
      const badRes = await callApi('pager/subscriptions.js', {
        method: 'POST',
        headers: CLIENT_HEADERS,
        body: {
          code: pagerA.id,
          subscription: { endpoint: badEndpoint, keys: { p256dh: subKeys1.p256dh, auth: subKeys1.auth } }
        }
      });
      assert.equal(badRes.status, 400, `SSRF / invalid endpoint blocked: ${badEndpoint}`);
    }

    // Invalid cryptographic keys blocked (`400`), unconfigured native APNs/FCM returns `501`
    assert.equal(
      (await callApi('pager/subscriptions.js', {
        method: 'POST',
        headers: CLIENT_HEADERS,
        body: {
          code: pagerA.id,
          subscription: {
            endpoint: 'https://web.push.apple.com/Q123456',
            keys: { p256dh: webpushCrypto.toBase64Url(Buffer.alloc(65, 4)), auth: subKeys1.auth }
          }
        }
      })).status,
      400,
      'invalid off-curve P-256 point rejected'
    );
    assert.equal(
      (await callApi('pager/subscriptions.js', {
        method: 'POST',
        headers: CLIENT_HEADERS,
        body: { code: pagerA.id, channel: 'apns', device_token: 'a'.repeat(64) }
      })).status,
      501,
      'native APNs returns explicit 501 until packaged app & credentials are enabled'
    );

    // Valid subscription to Pager A succeeds (`201`) and omits raw endpoint/keys
    const subARes = await callApi('pager/subscriptions.js', {
      method: 'POST',
      headers: CLIENT_HEADERS,
      body: { code: pagerA.id, subscription: validSubPayload, platform_hint: 'web' }
    });
    assert.equal(subARes.status, 201);
    assert.equal(subARes.body.subscription.endpoint_url, undefined);
    assert.equal(subARes.body.subscription.p256dh_key, undefined);
    const subAId = subARes.body.subscription.id;
    const subAUnsubToken = subARes.body.unsubscribe_token;

    // Cross-pager unsubscribe attempt (possessing Pager B's code cannot delete Pager A's subscription!)
    assert.equal(
      (await callApi('pager/subscriptions.js', {
        method: 'DELETE',
        headers: CLIENT_HEADERS,
        body: { subscription_id: subAId, code: pagerB.id }
      })).status,
      403,
      'Pager B capability cannot delete Pager A subscription'
    );

    // Cross-vendor mutation attempt (`ownerB` trying to mark Pager A `ready`) -> `403`, zero events
    assert.equal(
      (await callApi('pager/update.js', {
        method: 'POST',
        user: ACTORS.ownerB,
        body: { id: pagerA.id, status: 'ready' }
      })).status,
      403
    );

    // Rate limit enforcement on a separate client IP
    const noisyHeaders = { ...CLIENT_HEADERS, 'x-forwarded-for': '203.0.113.99' };
    let rateLimited = false;
    for (let i = 0; i < 14; i++) {
      const r = await callApi('pager/subscriptions.js', {
        method: 'POST',
        headers: noisyHeaders,
        body: { code: crypto.randomUUID(), subscription: validSubPayload }
      });
      if (r.status === 429) {
        rateLimited = true;
        assert(Number(r.headers['retry-after']) >= 1);
        break;
      }
    }
    assert.equal(rateLimited, true, 'subscription endpoint enforces 429 rate limit');

    console.log('PASS [2/8]: Capability auth, cross-pager & cross-vendor isolation, CSRF, SSRF allowlist & rate limits verified');

    // =========================================================================
    // [3/8] Atomic Outbox Rollback, Concurrent Ready & Anti-Flap Storm Guard
    // =========================================================================
    // 3a. Mid-transaction failure rolls back BOTH pager status AND outbox event/deliveries!
    const rollbackRes = await callApi('pager/update.js', {
      method: 'POST',
      user: ACTORS.staffA,
      body: { id: pagerA.id, status: 'ready' },
      forceRollbackAfterEvent: true
    });
    assert.equal(rollbackRes.status, 503);

    const checkAfterRb = await callApi('pager/status.js', { query: { code: pagerA.id } });
    assert.equal(checkAfterRb.body.pager.status, 'cooking', 'pager status stayed cooking after rollback');

    const telemAfterRb = await callApi('pager/telemetry.js', { user: ACTORS.admin });
    assert.equal(telemAfterRb.body.events_last_24h, 0, 'zero outbox events survived rolled-back transaction');
    assert.equal(telemAfterRb.body.deliveries.queued, 0, 'zero deliveries survived rolled-back transaction');

    // 3b. Simultaneous concurrent `ready` updates produce ONLY ONE outbox event and ONE delivery!
    const tReady = new Date();
    const [upd1, upd2] = await Promise.all([
      callApi('pager/update.js', { method: 'POST', user: ACTORS.staffA, body: { id: pagerA.id, status: 'ready' }, testNow: tReady }),
      callApi('pager/update.js', { method: 'POST', user: ACTORS.ownerA, body: { id: pagerA.id, status: 'ready' }, testNow: tReady })
    ]);
    assert.equal(upd1.status, 200);
    assert.equal(upd2.status, 200);
    const createdEventsCount = [upd1.body.notification.event_created, upd2.body.notification.event_created].filter(Boolean).length;
    assert.equal(createdEventsCount, 1, 'concurrent ready transitions create exactly 1 event');

    // 3c. Rapid flapping (`ready -> almost -> ready` within 60s cooldown) does NOT emit a storm!
    await callApi('pager/update.js', {
      method: 'POST',
      user: ACTORS.staffA,
      body: { id: pagerA.id, status: 'almost' },
      testNow: new Date(tReady.getTime() + 5000)
    });
    const flapReady = await callApi('pager/update.js', {
      method: 'POST',
      user: ACTORS.staffA,
      body: { id: pagerA.id, status: 'ready' },
      testNow: new Date(tReady.getTime() + 10000)
    });
    assert.equal(flapReady.status, 200);
    assert.equal(flapReady.body.notification.event_created, false, 'flap within 60s cooldown suppressed');

    console.log('PASS [3/8]: Atomic outbox rollback, concurrent ready deduplication, and anti-flap storm protection verified');

    // =========================================================================
    // [4/8] Wire-Level RFC 8291 (`aes128gcm`) Decryption & RFC 8292 VAPID ES256 Verification
    // =========================================================================
    const receivedPushes = [];
    const pushPort = await getFreePort();
    loopbackServer = http.createServer(async (req, res) => {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      receivedPushes.push({
        url: req.url,
        headers: req.headers,
        body: Buffer.concat(chunks)
      });
      res.writeHead(201);
      res.end();
    });
    await new Promise(resolve => loopbackServer.listen(pushPort, '127.0.0.1', resolve));

    process.env.TRUCKLY_PUSH_PROVIDER_MODE = 'loopback_test';
    const wireKeys = createSubscriberKeys(webpushCrypto);
    const wirePagerRes = await callApi('pager/staff.js', {
      method: 'POST',
      user: ACTORS.ownerB,
      body: { vendor_id: 'mitote', ticket: 'WIRE-77', request_key: crypto.randomUUID() }
    });
    const wirePager = wirePagerRes.body.pager;

    const wireSubRes = await callApi('pager/subscriptions.js', {
      method: 'POST',
      headers: CLIENT_HEADERS,
      body: {
        code: wirePager.id,
        subscription: {
          endpoint: `http://127.0.0.1:${pushPort}/webpush/device-wire-77`,
          keys: { p256dh: wireKeys.p256dh, auth: wireKeys.auth }
        }
      }
    });
    assert.equal(wireSubRes.status, 201);

    await callApi('pager/update.js', {
      method: 'POST',
      user: ACTORS.ownerB,
      body: { id: wirePager.id, status: 'ready' }
    });

    // Clear earlier Pager A queued delivery first by setting Pager B worker run
    // Run worker via HTTP route `/api/pager/worker`!
    // Note: Pager A's endpoint is `https://fcm.googleapis.com/...`; let's cancel Pager A first so loopback test only dispatches `wirePager`!
    await callApi('pager/update.js', {
      method: 'POST',
      user: ACTORS.staffA,
      body: { id: pagerA.id, status: 'collected' }
    });

    const workerWireRes = await callApi('pager/worker.js', {
      method: 'POST',
      headers: { authorization: `Bearer ${WORKER_SECRET}` },
      body: { batch_size: 10 }
    });
    assert.equal(workerWireRes.status, 200);
    assert.equal(workerWireRes.body.delivered, 1);
    assert.equal(receivedPushes.length, 1);

    const captured = receivedPushes[0];
    assert.equal(captured.headers['content-encoding'], 'aes128gcm');
    assert.equal(captured.headers.urgency, 'high');
    assert(captured.headers.topic && captured.headers.topic.startsWith('pager-ready:'));

    // Verify VAPID ES256 JWT signature!
    const authMatch = /^vapid\s+t=([^,\s]+),\s*k=([^\s]+)$/i.exec(captured.headers.authorization || '');
    assert(authMatch, 'Authorization header uses RFC 8292 vapid t=..., k=... format');
    assert.equal(authMatch[2], testVapid.publicKey);
    const jwtVerified = webpushCrypto.verifyVapidJwt(authMatch[1], testVapid.publicKey);
    assert.equal(jwtVerified.valid, true, 'VAPID ES256 signature verified');
    assert.equal(jwtVerified.claims.aud, `http://127.0.0.1:${pushPort}`);
    assert.equal(jwtVerified.claims.sub, 'mailto:ops@truckly.test');

    // Decrypt actual `aes128gcm` binary body with subscriber's private ECDH key!
    const decryptedJsonStr = webpushCrypto.decryptWebPushPayload(captured.body, wireKeys.ecdh, wireKeys.authSecret);
    assert(!decryptedJsonStr.includes(wirePager.id), 'raw private pager UUID NEVER appears in push ciphertext');
    const decryptedPayload = JSON.parse(decryptedJsonStr);
    assert.equal(decryptedPayload.title, 'BiteShark · Order Ready for Pickup');
    assert(decryptedPayload.body.includes('WIRE-77'));
    assert.equal(decryptedPayload.subscription_id, wireSubRes.body.subscription.id);
    assert.equal(decryptedPayload.open_url, `/#pager-ref=${wireSubRes.body.subscription.id}`);

    console.log('PASS [4/8]: Wire-level RFC 8291 aes128gcm decryption, RFC 8292 VAPID ES256 signature, and zero-UUID payload verified');

    // =========================================================================
    // [5/8] Concurrent Worker Claims (`SKIP LOCKED`) & Crash-After-Send Lease Recovery
    // =========================================================================
    process.env.TRUCKLY_PUSH_PROVIDER_MODE = 'fake';

    // Enqueue 4 active subscribers across a new pager
    const concPager = (
      await callApi('pager/staff.js', {
        method: 'POST',
        user: ACTORS.staffA,
        body: { vendor_id: 'iniguez', ticket: 'CONC-4', request_key: crypto.randomUUID() }
      })
    ).body.pager;

    for (let i = 0; i < 4; i++) {
      const k = createSubscriberKeys(webpushCrypto);
      const sr = await callApi('pager/subscriptions.js', {
        method: 'POST',
        headers: { ...CLIENT_HEADERS, 'x-forwarded-for': `198.51.100.${30 + i}` },
        body: {
          code: concPager.id,
          subscription: { endpoint: `https://fcm.googleapis.com/fcm/send/conc-dev-${i}`, keys: { p256dh: k.p256dh, auth: k.auth } }
        }
      });
      assert.equal(sr.status, 201);
    }

    await callApi('pager/update.js', {
      method: 'POST',
      user: ACTORS.staffA,
      body: { id: concPager.id, status: 'ready' }
    });

    const seenDeliveryIds = [];
    notifLib.setFakePushProviderForTests(async ctx => {
      seenDeliveryIds.push(ctx.deliveryId);
      await new Promise(r => setTimeout(r, 25));
      return { status: 201, provider: 'fake_concurrent' };
    });

    const [wRunA, wRunB] = await Promise.all([
      callApi('pager/worker.js', {
        method: 'POST',
        headers: { authorization: `Bearer ${WORKER_SECRET}` },
        body: { batch_size: 2, cleanup: false }
      }),
      callApi('pager/worker.js', {
        method: 'POST',
        headers: { authorization: `Bearer ${WORKER_SECRET}` },
        body: { batch_size: 2, cleanup: false }
      })
    ]);
    assert.equal(wRunA.body.delivered + wRunB.body.delivered, 4, 'concurrent workers delivered all 4 items');
    assert.equal(new Set(seenDeliveryIds).size, 4, 'FOR UPDATE SKIP LOCKED prevented duplicate concurrent claims');

    // Crash-after-send before DB ack -> lease recovery after 45s with identical Topic & event_id
    const crashPager = (
      await callApi('pager/staff.js', {
        method: 'POST',
        user: ACTORS.staffA,
        body: { vendor_id: 'iniguez', ticket: 'CRASH-1', request_key: crypto.randomUUID() }
      })
    ).body.pager;
    const crashKeys = createSubscriberKeys(webpushCrypto);
    await callApi('pager/subscriptions.js', {
      method: 'POST',
      headers: { ...CLIENT_HEADERS, 'x-forwarded-for': '198.51.100.55' },
      body: {
        code: crashPager.id,
        subscription: { endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/crash-1', keys: { p256dh: crashKeys.p256dh, auth: crashKeys.auth } }
      }
    });
    const tCrash0 = new Date();
    await callApi('pager/update.js', {
      method: 'POST',
      user: ACTORS.staffA,
      body: { id: crashPager.id, status: 'ready' },
      testNow: tCrash0
    });

    const crashAttempts = [];
    notifLib.setFakePushProviderForTests(async ctx => {
      crashAttempts.push({ attempt: ctx.attemptCount, topic: ctx.headers.Topic, eventId: ctx.eventId });
      if (ctx.attemptCount === 1) {
        // Simulate provider receiving push followed by worker process crash before DB UPDATE
        return { status: 201, simulateCrashBeforeAck: true };
      }
      return { status: 201, provider: 'fake_recovered' };
    });

    await callApi('pager/worker.js', {
      method: 'POST',
      headers: { authorization: `Bearer ${WORKER_SECRET}` },
      body: { batch_size: 5, cleanup: false },
      testNow: tCrash0
    });
    assert.equal(crashAttempts.length, 1);

    // At +10s (before 45s lease expires), another worker MUST NOT steal the active lease
    const midLeaseRun = await callApi('pager/worker.js', {
      method: 'POST',
      headers: { authorization: `Bearer ${WORKER_SECRET}` },
      body: { batch_size: 5, cleanup: false },
      testNow: new Date(tCrash0.getTime() + 10 * 1000)
    });
    assert.equal(midLeaseRun.body.claimed, 0, 'active non-expired lease respected');

    // At +46s (after 45s lease expires), recovery worker reclaims and acknowledges delivery!
    const postLeaseRun = await callApi('pager/worker.js', {
      method: 'POST',
      headers: { authorization: `Bearer ${WORKER_SECRET}` },
      body: { batch_size: 5, cleanup: false },
      testNow: new Date(tCrash0.getTime() + 46 * 1000)
    });
    assert.equal(postLeaseRun.body.claimed, 1);
    assert.equal(postLeaseRun.body.delivered, 1);
    assert.equal(crashAttempts.length, 2);
    assert.equal(crashAttempts[0].topic, crashAttempts[1].topic, 'replayed delivery carries identical collapse Topic');
    assert.equal(crashAttempts[0].eventId, crashAttempts[1].eventId, 'replayed delivery carries identical event_id');

    console.log('PASS [5/8]: Concurrent SKIP LOCKED claims and worker crash / expired-lease recovery verified');

    // =========================================================================
    // [6/8] Retry Backoff, `410 Gone` Token Scrubbing & Unsubscribe/Terminal Races
    // =========================================================================
    const retryPager = (
      await callApi('pager/staff.js', {
        method: 'POST',
        user: ACTORS.staffA,
        body: { vendor_id: 'iniguez', ticket: 'RETRY-410', request_key: crypto.randomUUID() }
      })
    ).body.pager;

    const kRetry = createSubscriberKeys(webpushCrypto);
    const kGone = createSubscriberKeys(webpushCrypto);
    const kUnsubRace = createSubscriberKeys(webpushCrypto);

    await callApi('pager/subscriptions.js', {
      method: 'POST',
      headers: { ...CLIENT_HEADERS, 'x-forwarded-for': '198.51.100.61' },
      body: {
        code: retryPager.id,
        subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/retry-dev', keys: { p256dh: kRetry.p256dh, auth: kRetry.auth } }
      }
    });
    const goneSub = (
      await callApi('pager/subscriptions.js', {
        method: 'POST',
        headers: { ...CLIENT_HEADERS, 'x-forwarded-for': '198.51.100.62' },
        body: {
          code: retryPager.id,
          subscription: { endpoint: 'https://web.push.apple.com/Q-gone-410', keys: { p256dh: kGone.p256dh, auth: kGone.auth } }
        }
      })
    ).body;
    const unsubRaceSub = (
      await callApi('pager/subscriptions.js', {
        method: 'POST',
        headers: { ...CLIENT_HEADERS, 'x-forwarded-for': '198.51.100.63' },
        body: {
          code: retryPager.id,
          subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/unsub-race', keys: { p256dh: kUnsubRace.p256dh, auth: kUnsubRace.auth } }
        }
      })
    ).body;

    const tR0 = new Date();
    await callApi('pager/update.js', {
      method: 'POST',
      user: ACTORS.staffA,
      body: { id: retryPager.id, status: 'ready' },
      testNow: tR0
    });

    // Unsubscribe `unsubRaceSub` BEFORE worker runs!
    const delRaceRes = await callApi('pager/subscriptions.js', {
      method: 'DELETE',
      headers: CLIENT_HEADERS,
      body: { subscription_id: unsubRaceSub.subscription.id, unsubscribe_token: unsubRaceSub.unsubscribe_token },
      testNow: new Date(tR0.getTime() + 1000)
    });
    assert.equal(delRaceRes.status, 200);

    let unsubEndpointCalled = false;
    notifLib.setFakePushProviderForTests(async ctx => {
      if (ctx.endpointUrl.includes('unsub-race')) {
        unsubEndpointCalled = true;
      }
      if (ctx.endpointUrl.includes('Q-gone-410')) {
        return { status: 410, provider: 'apns_webpush' };
      }
      if (ctx.endpointUrl.includes('retry-dev')) {
        return ctx.attemptCount === 1
          ? { status: 503, provider: 'fcm_webpush' }
          : { status: 201, provider: 'fcm_webpush' };
      }
      return { status: 201 };
    });

    const firstPass = await callApi('pager/worker.js', {
      method: 'POST',
      headers: { authorization: `Bearer ${WORKER_SECRET}` },
      body: { batch_size: 10, cleanup: false },
      testNow: new Date(tR0.getTime() + 2000)
    });
    assert.equal(unsubEndpointCalled, false, 'unsubscribed device was never called by worker');
    assert.equal(firstPass.body.retried, 1, '503 scheduled retry');
    assert.equal(firstPass.body.failed_permanent, 1, '410 marked permanent failure');
    assert.equal(firstPass.body.invalidated_subscriptions, 1, '410 invalidated subscription');

    // Verify 410 subscription had its endpoint & keys scrubbed to NULL in PostgreSQL!
    const checkGoneStatus = await callApi('pager/subscriptions.js', {
      method: 'GET',
      query: { subscription_id: goneSub.subscription.id, unsubscribe_token: goneSub.unsubscribe_token }
    });
    assert.equal(checkGoneStatus.body.subscription.status, 'invalidated');

    // Advance +20s past 15s first-retry backoff -> retry succeeds!
    const secondPass = await callApi('pager/worker.js', {
      method: 'POST',
      headers: { authorization: `Bearer ${WORKER_SECRET}` },
      body: { batch_size: 10, cleanup: false },
      testNow: new Date(tR0.getTime() + 22 * 1000)
    });
    assert.equal(secondPass.body.delivered, 1, 'retried 503 delivery succeeded after backoff');

    notifLib.setFakePushProviderForTests(null);
    console.log('PASS [6/8]: Retry backoff, 410 Gone token scrubbing, and unsubscribe/terminal suppression verified');

    // =========================================================================
    // [7/8] Release Pause Controls & Worker Secret Authentication
    // =========================================================================
    assert.equal(
      (await callApi('pager/worker.js', { method: 'POST', headers: {}, body: {} })).status,
      401,
      'worker rejects missing secret'
    );
    assert.equal(
      (await callApi('pager/worker.js', { method: 'POST', headers: { authorization: 'Bearer wrong_secret_value_1234567890' }, body: {} })).status,
      401,
      'worker rejects wrong secret'
    );

    process.env.TRUCKLY_DISABLE_SUBSCRIPTIONS = '1';
    const pausedSubRes = await callApi('pager/subscriptions.js', {
      method: 'POST',
      headers: CLIENT_HEADERS,
      body: { code: retryPager.id, subscription: validSubPayload }
    });
    assert.equal(pausedSubRes.status, 503);
    assert.equal(pausedSubRes.body.code, 'SUBSCRIPTIONS_PAUSED');
    delete process.env.TRUCKLY_DISABLE_SUBSCRIPTIONS;

    process.env.TRUCKLY_DISABLE_NOTIFICATION_DELIVERY = '1';
    const pausedWorkerRes = await callApi('pager/worker.js', {
      method: 'POST',
      headers: { authorization: `Bearer ${WORKER_SECRET}` },
      body: {}
    });
    assert.equal(pausedWorkerRes.status, 200);
    assert.equal(pausedWorkerRes.body.paused, true);
    delete process.env.TRUCKLY_DISABLE_NOTIFICATION_DELIVERY;

    console.log('PASS [7/8]: Worker secret auth and subscription/delivery kill-switches verified');

    // =========================================================================
    // [8/8] Telemetry RBAC, Strict Secret/Endpoint/UUID Redaction & Retention Cleanup
    // =========================================================================
    assert.equal((await callApi('pager/telemetry.js')).status, 401);
    assert.equal((await callApi('pager/telemetry.js', { user: ACTORS.ownerA })).status, 403);

    const telemetry = await callApi('pager/telemetry.js', { user: ACTORS.admin });
    assert.equal(telemetry.status, 200);
    const telemetryStr = JSON.stringify(telemetry.body);
    assert(!telemetryStr.includes('fcm.googleapis.com'), 'telemetry omits push endpoint URLs');
    assert(!telemetryStr.includes('push.apple.com'), 'telemetry omits APNs URLs');
    assert(!telemetryStr.includes(subKeys1.p256dh), 'telemetry omits subscriber p256dh keys');
    assert(!telemetryStr.includes(WORKER_SECRET), 'telemetry omits worker secret');
    assert(!telemetryStr.includes(pagerA.id), 'telemetry omits raw private pager UUIDs');
    assert(!telemetryStr.includes(retryPager.id), 'telemetry omits raw private pager UUIDs');

    const auditDump = JSON.stringify((await appPool.query('SELECT * FROM audit_logs')).rows);
    assert(!auditDump.includes('fcm.googleapis.com'), 'audit_logs omits push endpoint URLs');
    assert(!auditDump.includes(subKeys1.p256dh), 'audit_logs omits subscriber keys');
    assert(!auditDump.includes(subAUnsubToken), 'audit_logs omits unsubscribe tokens');
    assert(!auditDump.includes(pagerA.id), 'audit_logs hashes private pager UUIDs');

    // Advance +26 hours -> retention cleanup scrubs expired active subscriptions & purges old terminal rows
    const cleanupRun = await callApi('pager/worker.js', {
      method: 'POST',
      headers: { authorization: `Bearer ${WORKER_SECRET}` },
      body: { batch_size: 5, cleanup: true },
      testNow: new Date(Date.now() + 26 * 3600 * 1000)
    });
    assert.equal(cleanupRun.status, 200);
    assert(cleanupRun.body.cleanup.purged_deliveries >= 1, 'retention cleanup purged old terminal deliveries');

    console.log('PASS [8/12]: Telemetry RBAC, strict secret/URL/UUID redaction, and 24h retention cleanup verified');

    // =========================================================================
    // [9/12] Worker Lease Ownership, Batch > Lease Bounds, Slow Providers & Fencing
    // =========================================================================
    process.env.TRUCKLY_ALLOW_TEST_PUSH_MODES = '1';
    process.env.TRUCKLY_PUSH_PROVIDER_MODE = 'fake';

    // 9a. Batch of 12 slow deliveries (12 * 180ms = 2160ms) > 1000ms lease & 650ms execution budget:
    //     Worker claims in small waves (`concurrency = 2`), stops cleanly at budget boundary
    //     without leaving unclaimed items locked or ever dispatching on an expired lease,
    //     and two parallel workers finish the remaining queue with zero duplicate sends.
    const slowPagers = [];
    for (let pIdx = 0; pIdx < 3; pIdx++) {
      const sp = (
        await callApi('pager/staff.js', {
          method: 'POST',
          user: ACTORS.staffA,
          body: { vendor_id: 'iniguez', ticket: `SLOW-B-${pIdx}`, request_key: crypto.randomUUID() }
        })
      ).body.pager;
      slowPagers.push(sp);
      for (let sIdx = 0; sIdx < 4; sIdx++) {
        const sk = createSubscriberKeys(webpushCrypto);
        const subR = await callApi('pager/subscriptions.js', {
          method: 'POST',
          headers: { ...CLIENT_HEADERS, 'x-forwarded-for': `198.51.101.${pIdx * 10 + sIdx + 1}` },
          body: {
            code: sp.id,
            subscription: {
              endpoint: `https://fcm.googleapis.com/fcm/send/slow-b-${pIdx}-${sIdx}`,
              keys: { p256dh: sk.p256dh, auth: sk.auth }
            }
          }
        });
        assert.equal(subR.status, 201);
      }
      await callApi('pager/update.js', {
        method: 'POST',
        user: ACTORS.staffA,
        body: { id: sp.id, status: 'ready' }
      });
    }

    const slowBatchCalls = [];
    notifLib.setFakePushProviderForTests(async ctx => {
      slowBatchCalls.push(ctx.deliveryId);
      await new Promise(r => setTimeout(r, 180));
      return { status: 201, provider: 'fake_slow' };
    });

    const boundedRun = await callApi('pager/worker.js', {
      method: 'POST',
      headers: { authorization: `Bearer ${WORKER_SECRET}` },
      body: { batch_size: 12, concurrency: 2, execution_budget_ms: 600, cleanup: false },
      testLeaseSeconds: 1,
      testProviderTimeoutMs: 500
    });
    assert.equal(boundedRun.status, 200);
    assert(boundedRun.body.claimed > 0 && boundedRun.body.claimed < 12, 'worker claimed only waves within execution budget');
    assert.equal(boundedRun.body.delivered, boundedRun.body.claimed, 'every claimed wave item finished cleanly inside lease');
    assert.equal(boundedRun.body.aborted_lease_expired, 0, 'zero sends attempted on expired leases');
    assert.equal(boundedRun.body.budget_exhausted, true, 'execution budget stop reported');

    // Drain remaining items with two concurrent workers
    const [drainA, drainB] = await Promise.all([
      callApi('pager/worker.js', {
        method: 'POST',
        headers: { authorization: `Bearer ${WORKER_SECRET}` },
        body: { batch_size: 12, concurrency: 3, execution_budget_ms: 8000, cleanup: false },
        testLeaseSeconds: 5
      }),
      callApi('pager/worker.js', {
        method: 'POST',
        headers: { authorization: `Bearer ${WORKER_SECRET}` },
        body: { batch_size: 12, concurrency: 3, execution_budget_ms: 8000, cleanup: false },
        testLeaseSeconds: 5
      })
    ]);
    assert.equal(
      boundedRun.body.delivered + drainA.body.delivered + drainB.body.delivered,
      12,
      'all 12 slow-batch deliveries completed across bounded waves'
    );
    assert.equal(slowBatchCalls.length, 12, 'exact 12 provider calls — zero duplicates from upfront batch over-claiming');
    assert.equal(new Set(slowBatchCalls).size, 12);

    // 9b. Old worker paused after claiming -> lease expires -> Worker-2 reclaims & delivers ->
    //     Old worker resumes and confirms lease ownership before dispatch -> ZERO duplicate provider calls!
    const takeoverPager = (
      await callApi('pager/staff.js', {
        method: 'POST',
        user: ACTORS.staffA,
        body: { vendor_id: 'iniguez', ticket: 'TAKEOVER-1', request_key: crypto.randomUUID() }
      })
    ).body.pager;
    const tkKeys = createSubscriberKeys(webpushCrypto);
    await callApi('pager/subscriptions.js', {
      method: 'POST',
      headers: { ...CLIENT_HEADERS, 'x-forwarded-for': '198.51.101.80' },
      body: {
        code: takeoverPager.id,
        subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/takeover-1', keys: { p256dh: tkKeys.p256dh, auth: tkKeys.auth } }
      }
    });
    let simTakeoverMs = Date.now();
    await callApi('pager/update.js', {
      method: 'POST',
      user: ACTORS.staffA,
      body: { id: takeoverPager.id, status: 'ready' },
      testNow: new Date(simTakeoverMs)
    });

    let takeoverProviderCalls = 0;
    notifLib.setFakePushProviderForTests(async () => {
      takeoverProviderCalls++;
      return { status: 201, provider: 'fake_takeover' };
    });

    const oldWorkerRes = await callApi('pager/worker.js', {
      method: 'POST',
      headers: { authorization: `Bearer ${WORKER_SECRET}` },
      body: { batch_size: 1, concurrency: 1, cleanup: false },
      testWorkerId: 'worker-old-stalled',
      testLeaseSeconds: 2,
      testClock: () => new Date(simTakeoverMs),
      testHooks: {
        onAfterClaim: async () => {
          // Advance clock +5s past 2s lease while Worker-Old is paused before dispatch!
          simTakeoverMs += 5000;
          const worker2Res = await callApi('pager/worker.js', {
            method: 'POST',
            headers: { authorization: `Bearer ${WORKER_SECRET}` },
            body: { batch_size: 1, concurrency: 1, cleanup: false },
            testWorkerId: 'worker-new-owner',
            testLeaseSeconds: 10,
            testClock: () => new Date(simTakeoverMs)
          });
          assert.equal(worker2Res.body.claimed, 1, 'Worker-2 reclaimed expired lease');
          assert.equal(worker2Res.body.delivered, 1, 'Worker-2 delivered notification');
        }
      }
    });
    assert.equal(oldWorkerRes.body.aborted_lease_lost, 1, 'Worker-Old detected superseded claim_token before dispatch');
    assert.equal(oldWorkerRes.body.delivered, 0);
    assert.equal(takeoverProviderCalls, 1, 'ZERO duplicate provider calls when superseded worker resumed before send');

    // 9c. Stalled worker wakes up after its lease expired even before any second worker ran ->
    //     refuses to send on an expired lease (`aborted_lease_expired === 1`, 0 provider calls)
    const expLeasePager = (
      await callApi('pager/staff.js', {
        method: 'POST',
        user: ACTORS.staffA,
        body: { vendor_id: 'iniguez', ticket: 'EXP-LEASE-1', request_key: crypto.randomUUID() }
      })
    ).body.pager;
    const expKeys = createSubscriberKeys(webpushCrypto);
    await callApi('pager/subscriptions.js', {
      method: 'POST',
      headers: { ...CLIENT_HEADERS, 'x-forwarded-for': '198.51.101.81' },
      body: {
        code: expLeasePager.id,
        subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/exp-lease-1', keys: { p256dh: expKeys.p256dh, auth: expKeys.auth } }
      }
    });
    let simExpMs = Date.now();
    await callApi('pager/update.js', {
      method: 'POST',
      user: ACTORS.staffA,
      body: { id: expLeasePager.id, status: 'ready' },
      testNow: new Date(simExpMs)
    });

    let expProviderCalls = 0;
    notifLib.setFakePushProviderForTests(async () => {
      expProviderCalls++;
      return { status: 201 };
    });

    const stalledExpiredRes = await callApi('pager/worker.js', {
      method: 'POST',
      headers: { authorization: `Bearer ${WORKER_SECRET}` },
      body: { batch_size: 1, concurrency: 1, cleanup: false },
      testLeaseSeconds: 2,
      testClock: () => new Date(simExpMs),
      testHooks: {
        onAfterClaim: async () => {
          simExpMs += 5000;
        }
      }
    });
    assert.equal(stalledExpiredRes.body.aborted_lease_expired, 1, 'worker refused to initiate send on expired lease');
    assert.equal(expProviderCalls, 0, 'zero provider calls on expired lease');

    // Subsequent worker recovers and delivers cleanly
    simExpMs += 1000;
    const recoverExpRes = await callApi('pager/worker.js', {
      method: 'POST',
      headers: { authorization: `Bearer ${WORKER_SECRET}` },
      body: { batch_size: 1, concurrency: 1, cleanup: false },
      testLeaseSeconds: 10,
      testClock: () => new Date(simExpMs)
    });
    assert.equal(recoverExpRes.body.delivered, 1);
    assert.equal(expProviderCalls, 1);

    // 9d. In-flight send/ack uncertainty vs fenced stale ack (`onBeforeAck`):
    //     Worker-SlowNet already dispatched to provider (unavoidable in-flight call), then stalls past lease;
    //     Worker-Recovery reclaims (`claim_token_2`) and delivers (`201`); Worker-SlowNet wakes up with a stale
    //     `410` response -> fenced by `claim_token`, so it cannot overwrite `delivered` or scrub the subscription!
    const fenceAckPager = (
      await callApi('pager/staff.js', {
        method: 'POST',
        user: ACTORS.staffA,
        body: { vendor_id: 'iniguez', ticket: 'FENCE-ACK-1', request_key: crypto.randomUUID() }
      })
    ).body.pager;
    const fenceKeys = createSubscriberKeys(webpushCrypto);
    const fenceSub = (
      await callApi('pager/subscriptions.js', {
        method: 'POST',
        headers: { ...CLIENT_HEADERS, 'x-forwarded-for': '198.51.101.82' },
        body: {
          code: fenceAckPager.id,
          subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/fence-ack-1', keys: { p256dh: fenceKeys.p256dh, auth: fenceKeys.auth } }
        }
      })
    ).body;
    let simFenceMs = Date.now();
    await callApi('pager/update.js', {
      method: 'POST',
      user: ACTORS.staffA,
      body: { id: fenceAckPager.id, status: 'ready' },
      testNow: new Date(simFenceMs)
    });

    let fenceCallNum = 0;
    notifLib.setFakePushProviderForTests(async () => {
      fenceCallNum++;
      // Call 1 (stale worker) returns 410; Call 2 (recovery worker) returns 201!
      return fenceCallNum === 1 ? { status: 410 } : { status: 201 };
    });

    const fencedOldAckRes = await callApi('pager/worker.js', {
      method: 'POST',
      headers: { authorization: `Bearer ${WORKER_SECRET}` },
      body: { batch_size: 1, concurrency: 1, cleanup: false },
      testWorkerId: 'worker-slow-inflight',
      testLeaseSeconds: 2,
      testClock: () => new Date(simFenceMs),
      testHooks: {
        onBeforeAck: async () => {
          simFenceMs += 5000;
          const recAckRes = await callApi('pager/worker.js', {
            method: 'POST',
            headers: { authorization: `Bearer ${WORKER_SECRET}` },
            body: { batch_size: 1, concurrency: 1, cleanup: false },
            testWorkerId: 'worker-recovery-ack',
            testLeaseSeconds: 10,
            testClock: () => new Date(simFenceMs)
          });
          assert.equal(recAckRes.body.delivered, 1);
        }
      }
    });
    assert.equal(fencedOldAckRes.body.fenced_stale_acks, 1, 'stale worker ack fenced by superseded claim_token');
    assert.equal(fencedOldAckRes.body.failed_permanent, 0);
    assert.equal(fencedOldAckRes.body.invalidated_subscriptions, 0);

    const verifyFenceSubStillActive = await callApi('pager/subscriptions.js', {
      method: 'GET',
      query: { subscription_id: fenceSub.subscription.id, unsubscribe_token: fenceSub.unsubscribe_token }
    });
    assert.equal(
      verifyFenceSubStillActive.body.subscription.status,
      'active',
      'fenced stale 410 ack could not invalidate active subscription'
    );

    console.log('PASS [9/12]: Worker wave claiming, execution budget, lease takeover, and claim-token ack fencing verified');

    // =========================================================================
    // [10/12] Pre-Dispatch Live Eligibility Recheck & Copied-Material Tamper Proof
    // =========================================================================
    // Create 5 separate pagers + active subscriptions + ready transitions, claim all 5 in one wave,
    // pause in `onAfterClaim`, tamper with in-memory claimed objects, invalidate all 5 via:
    //   (1) customer unsubscribe, (2) ticket collected, (3) ticket cancelled,
    //   (4) ready reverted to `almost`, and (5) pager expiry,
    // then resume worker and assert ZERO provider calls!
    const invCases = ['unsub', 'collected', 'cancelled', 'reverted', 'expired'];
    const invFixtures = {};
    for (let i = 0; i < invCases.length; i++) {
      const kind = invCases[i];
      const pgRow = (
        await callApi('pager/staff.js', {
          method: 'POST',
          user: ACTORS.staffA,
          body: { vendor_id: 'iniguez', ticket: `INV-${kind.toUpperCase()}`, request_key: crypto.randomUUID() }
        })
      ).body.pager;
      const k = createSubscriberKeys(webpushCrypto);
      const subRow = (
        await callApi('pager/subscriptions.js', {
          method: 'POST',
          headers: { ...CLIENT_HEADERS, 'x-forwarded-for': `198.51.102.${10 + i}` },
          body: {
            code: pgRow.id,
            subscription: {
              endpoint: `https://fcm.googleapis.com/fcm/send/inv-${kind}`,
              keys: { p256dh: k.p256dh, auth: k.auth }
            }
          }
        })
      ).body;
      await callApi('pager/update.js', {
        method: 'POST',
        user: ACTORS.staffA,
        body: { id: pgRow.id, status: 'ready' }
      });
      invFixtures[kind] = { pager: pgRow, sub: subRow, keys: k };
    }

    let preDispatchInvalidatedCalls = 0;
    notifLib.setFakePushProviderForTests(async () => {
      preDispatchInvalidatedCalls++;
      return { status: 201 };
    });

    const preDispatchRun = await callApi('pager/worker.js', {
      method: 'POST',
      headers: { authorization: `Bearer ${WORKER_SECRET}` },
      body: { batch_size: 5, concurrency: 5, cleanup: false },
      testHooks: {
        onAfterClaim: async claimedWave => {
          assert.equal(claimedWave.length, 5, 'all 5 deliveries claimed before invalidation');

          // Inject fake copied endpoint/key/status fields onto in-memory claimed objects
          // to prove `prepareClaimForDispatch` ignores in-memory snapshots and queries PostgreSQL!
          for (const c of claimedWave) {
            c.endpoint_url = 'https://fcm.googleapis.com/fcm/send/copied-stale-bypass';
            c.p256dh_key = invFixtures.unsub.keys.p256dh;
            c.auth_secret = invFixtures.unsub.keys.auth;
            c.sub_status = 'active';
            c.pager_status = 'ready';
          }

          // 1. Customer unsubscribes
          assert.equal(
            (
              await callApi('pager/subscriptions.js', {
                method: 'DELETE',
                headers: CLIENT_HEADERS,
                body: {
                  subscription_id: invFixtures.unsub.sub.subscription.id,
                  unsubscribe_token: invFixtures.unsub.sub.unsubscribe_token
                }
              })
            ).status,
            200
          );

          // 2. Ticket becomes `collected`
          assert.equal(
            (
              await callApi('pager/update.js', {
                method: 'POST',
                user: ACTORS.staffA,
                body: { id: invFixtures.collected.pager.id, status: 'collected' }
              })
            ).status,
            200
          );

          // 3. Ticket becomes `cancelled`
          assert.equal(
            (
              await callApi('pager/update.js', {
                method: 'POST',
                user: ACTORS.staffA,
                body: { id: invFixtures.cancelled.pager.id, status: 'cancelled' }
              })
            ).status,
            200
          );

          // 4. Ready state reverted (`ready` -> `almost`)
          assert.equal(
            (
              await callApi('pager/update.js', {
                method: 'POST',
                user: ACTORS.staffA,
                body: { id: invFixtures.reverted.pager.id, status: 'almost' }
              })
            ).status,
            200
          );

          // 5. Pager expires before pre-dispatch check
          await appPool.query(
            `UPDATE pickup_pagers SET expires_at = now() - interval '2 minutes' WHERE id = $1`,
            [invFixtures.expired.pager.id]
          );
        }
      }
    });

    assert.equal(preDispatchInvalidatedCalls, 0, 'ZERO provider calls for work invalidated between claim and dispatch');
    assert.equal(preDispatchRun.body.delivered, 0);
    assert.equal(preDispatchRun.body.suppressed, 5, 'all 5 invalidated claims suppressed/expired cleanly');

    console.log('PASS [10/12]: Pre-dispatch live eligibility recheck & copied-material tamper resistance verified');

    // =========================================================================
    // [11/12] Ready-State Subscription Catch-Up, Rollback, Dedupe, Rotation & Races
    // =========================================================================
    let catchupProviderCalls = 0;
    notifLib.setFakePushProviderForTests(async () => {
      catchupProviderCalls++;
      return { status: 201, provider: 'fake_catchup' };
    });

    // 11a. Subscribing to an ALREADY-ready ticket atomically enqueues catch-up; repeated refreshes do NOT storm
    const readyFirstPager = (
      await callApi('pager/staff.js', {
        method: 'POST',
        user: ACTORS.staffA,
        body: { vendor_id: 'iniguez', ticket: 'READY-FIRST-1', request_key: crypto.randomUUID() }
      })
    ).body.pager;
    await callApi('pager/update.js', {
      method: 'POST',
      user: ACTORS.staffA,
      body: { id: readyFirstPager.id, status: 'ready' }
    });

    // 11b. First verify atomic transaction rollback (`forceRollbackAfterCatchup`) leaves ZERO rows!
    const rbCatchKeys = createSubscriberKeys(webpushCrypto);
    const rbCatchRes = await callApi('pager/subscriptions.js', {
      method: 'POST',
      headers: { ...CLIENT_HEADERS, 'x-forwarded-for': '198.51.103.1' },
      body: {
        code: readyFirstPager.id,
        subscription: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/catchup-rollback',
          keys: { p256dh: rbCatchKeys.p256dh, auth: rbCatchKeys.auth }
        }
      },
      forceRollbackAfterCatchup: true
    });
    assert.equal(rbCatchRes.status, 503, 'forced failure after catch-up returns 503');

    const checkRbCounts = await appPool.connect();
    try {
      await checkRbCounts.query('BEGIN');
      await checkRbCounts.query("SELECT set_config('app.pager_internal', 'true', true)");
      const subCnt = await checkRbCounts.query(
        'SELECT count(*)::int AS c FROM pager_notification_subscriptions WHERE pager_id = $1',
        [readyFirstPager.id]
      );
      const delCnt = await checkRbCounts.query(
        'SELECT count(*)::int AS c FROM pager_notification_deliveries WHERE pager_id = $1',
        [readyFirstPager.id]
      );
      await checkRbCounts.query('COMMIT');
      assert.equal(subCnt.rows[0].c, 0, 'atomic rollback left zero subscriptions');
      assert.equal(delCnt.rows[0].c, 0, 'atomic rollback left zero catch-up deliveries');
    } finally {
      checkRbCounts.release();
    }

    // Now succeed on already-ready ticket
    const catchKeys1 = createSubscriberKeys(webpushCrypto);
    const catchSub1 = await callApi('pager/subscriptions.js', {
      method: 'POST',
      headers: { ...CLIENT_HEADERS, 'x-forwarded-for': '198.51.103.2' },
      body: {
        code: readyFirstPager.id,
        subscription: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/catchup-ok-1',
          keys: { p256dh: catchKeys1.p256dh, auth: catchKeys1.auth }
        }
      }
    });
    assert.equal(catchSub1.status, 201);
    assert.equal(catchSub1.body.catchup.queued, true);
    assert.equal(catchSub1.body.catchup.reason, 'ready_ticket_catchup');

    // Immediate duplicate retry/refresh BEFORE worker runs -> must NOT enqueue a second delivery!
    const dupBeforeSend = await callApi('pager/subscriptions.js', {
      method: 'POST',
      headers: { ...CLIENT_HEADERS, 'x-forwarded-for': '198.51.103.2' },
      body: {
        code: readyFirstPager.id,
        subscription: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/catchup-ok-1',
          keys: { p256dh: catchKeys1.p256dh, auth: catchKeys1.auth }
        }
      }
    });
    assert.equal(dupBeforeSend.status, 201);
    assert.equal(dupBeforeSend.body.catchup.queued, false);
    assert.equal(dupBeforeSend.body.catchup.reason, 'already_enqueued_for_cycle');

    const catchWorker1 = await callApi('pager/worker.js', {
      method: 'POST',
      headers: { authorization: `Bearer ${WORKER_SECRET}` },
      body: { batch_size: 5, cleanup: false }
    });
    assert.equal(catchWorker1.body.delivered, 1);
    assert.equal(catchupProviderCalls, 1);

    // Refresh AFTER delivery -> `already_delivered_for_cycle`, 0 new pushes!
    const dupAfterSend = await callApi('pager/subscriptions.js', {
      method: 'POST',
      headers: { ...CLIENT_HEADERS, 'x-forwarded-for': '198.51.103.2' },
      body: {
        code: readyFirstPager.id,
        subscription: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/catchup-ok-1',
          keys: { p256dh: catchKeys1.p256dh, auth: catchKeys1.auth }
        }
      }
    });
    assert.equal(dupAfterSend.body.catchup.queued, false);
    assert.equal(dupAfterSend.body.catchup.reason, 'already_delivered_for_cycle');

    // Unsubscribe + re-subscribe same endpoint AFTER already delivered -> still `already_delivered_for_cycle`!
    await callApi('pager/subscriptions.js', {
      method: 'DELETE',
      headers: CLIENT_HEADERS,
      body: { subscription_id: dupAfterSend.body.subscription.id, code: readyFirstPager.id }
    });
    const resubAfterDelivered = await callApi('pager/subscriptions.js', {
      method: 'POST',
      headers: { ...CLIENT_HEADERS, 'x-forwarded-for': '198.51.103.2' },
      body: {
        code: readyFirstPager.id,
        subscription: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/catchup-ok-1',
          keys: { p256dh: catchKeys1.p256dh, auth: catchKeys1.auth }
        }
      }
    });
    assert.equal(resubAfterDelivered.body.catchup.queued, false);
    assert.equal(resubAfterDelivered.body.catchup.reason, 'already_delivered_for_cycle');

    // Token rotation (`replaces_subscription_id`) after prior token was already delivered -> no duplicate alert!
    const rotatedKeys = createSubscriberKeys(webpushCrypto);
    const rotatedSub = await callApi('pager/subscriptions.js', {
      method: 'POST',
      headers: { ...CLIENT_HEADERS, 'x-forwarded-for': '198.51.103.3' },
      body: {
        code: readyFirstPager.id,
        replaces_subscription_id: resubAfterDelivered.body.subscription.id,
        subscription: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/catchup-rotated-2',
          keys: { p256dh: rotatedKeys.p256dh, auth: rotatedKeys.auth }
        }
      }
    });
    assert.equal(rotatedSub.status, 201);
    assert.equal(rotatedSub.body.catchup.queued, false);
    assert.equal(rotatedSub.body.catchup.reason, 'already_delivered_prior_token');

    // 11c. Reactivation of an UNDELIVERED (`suppressed`) subscription on a ready ticket re-queues once
    const reactPager = (
      await callApi('pager/staff.js', {
        method: 'POST',
        user: ACTORS.staffA,
        body: { vendor_id: 'iniguez', ticket: 'REACT-1', request_key: crypto.randomUUID() }
      })
    ).body.pager;
    const reactKeys = createSubscriberKeys(webpushCrypto);
    const reactSub0 = await callApi('pager/subscriptions.js', {
      method: 'POST',
      headers: { ...CLIENT_HEADERS, 'x-forwarded-for': '198.51.103.10' },
      body: {
        code: reactPager.id,
        subscription: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/react-1',
          keys: { p256dh: reactKeys.p256dh, auth: reactKeys.auth }
        }
      }
    });
    await callApi('pager/update.js', {
      method: 'POST',
      user: ACTORS.staffA,
      body: { id: reactPager.id, status: 'ready' }
    });
    // Unsubscribe before worker runs -> delivery becomes `suppressed` (`delivered_at IS NULL`)
    await callApi('pager/subscriptions.js', {
      method: 'DELETE',
      headers: CLIENT_HEADERS,
      body: {
        subscription_id: reactSub0.body.subscription.id,
        unsubscribe_token: reactSub0.body.unsubscribe_token
      }
    });
    // Re-subscribe while still `ready` -> re-queues the undelivered alert!
    const reactSub1 = await callApi('pager/subscriptions.js', {
      method: 'POST',
      headers: { ...CLIENT_HEADERS, 'x-forwarded-for': '198.51.103.10' },
      body: {
        code: reactPager.id,
        subscription: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/react-1',
          keys: { p256dh: reactKeys.p256dh, auth: reactKeys.auth }
        }
      }
    });
    assert.equal(reactSub1.body.catchup.queued, true);
    assert.equal(reactSub1.body.catchup.reason, 'reactivated_undelivered');
    const reactWorker = await callApi('pager/worker.js', {
      method: 'POST',
      headers: { authorization: `Bearer ${WORKER_SECRET}` },
      body: { batch_size: 5, cleanup: false }
    });
    assert.equal(reactWorker.body.delivered, 1);

    // 11d. Concurrent `POST /api/pager/subscriptions` racing `POST /api/pager/update { status: 'ready' }`
    //      produces EXACTLY 1 event and 1 delivery with zero missed or duplicate alerts!
    for (let rIdx = 0; rIdx < 4; rIdx++) {
      const racePager = (
        await callApi('pager/staff.js', {
          method: 'POST',
          user: ACTORS.staffA,
          body: { vendor_id: 'iniguez', ticket: `RACE-CR-${rIdx}`, request_key: crypto.randomUUID() }
        })
      ).body.pager;
      const rk = createSubscriberKeys(webpushCrypto);

      const [subRaceOut, updRaceOut] = await Promise.all([
        callApi('pager/subscriptions.js', {
          method: 'POST',
          headers: { ...CLIENT_HEADERS, 'x-forwarded-for': `198.51.103.${30 + rIdx}` },
          body: {
            code: racePager.id,
            subscription: {
              endpoint: `https://fcm.googleapis.com/fcm/send/race-cr-${rIdx}`,
              keys: { p256dh: rk.p256dh, auth: rk.auth }
            }
          }
        }),
        callApi('pager/update.js', {
          method: 'POST',
          user: ACTORS.staffA,
          body: { id: racePager.id, status: 'ready' }
        })
      ]);
      assert.equal(subRaceOut.status, 201);
      assert.equal(updRaceOut.status, 200);

      const raceDrain = await callApi('pager/worker.js', {
        method: 'POST',
        headers: { authorization: `Bearer ${WORKER_SECRET}` },
        body: { batch_size: 5, cleanup: false }
      });
      assert.equal(raceDrain.body.delivered, 1, `concurrent sub + ready transition produced exact 1 delivery (iter ${rIdx})`);
    }

    // 11e. Collected, cancelled, and expired ready tickets reject subscriptions & enqueue zero catch-up work
    for (const termState of ['collected', 'cancelled', 'expired']) {
      const termPager = (
        await callApi('pager/staff.js', {
          method: 'POST',
          user: ACTORS.staffA,
          body: { vendor_id: 'iniguez', ticket: `TERM-${termState}`, request_key: crypto.randomUUID() }
        })
      ).body.pager;
      await callApi('pager/update.js', {
        method: 'POST',
        user: ACTORS.staffA,
        body: { id: termPager.id, status: 'ready' }
      });
      if (termState === 'expired') {
        await appPool.query(`UPDATE pickup_pagers SET expires_at = now() - interval '5 minutes' WHERE id = $1`, [termPager.id]);
      } else {
        await callApi('pager/update.js', {
          method: 'POST',
          user: ACTORS.staffA,
          body: { id: termPager.id, status: termState }
        });
      }
      const tk = createSubscriberKeys(webpushCrypto);
      const deniedCatchup = await callApi('pager/subscriptions.js', {
        method: 'POST',
        headers: { ...CLIENT_HEADERS, 'x-forwarded-for': '198.51.103.90' },
        body: {
          code: termPager.id,
          subscription: {
            endpoint: `https://fcm.googleapis.com/fcm/send/denied-${termState}`,
            keys: { p256dh: tk.p256dh, auth: tk.auth }
          }
        }
      });
      assert.equal(deniedCatchup.status, 404, `${termState} ticket rejected subscription & catch-up`);
    }

    console.log('PASS [11/12]: Ready-state subscription catch-up, rollback, deduplication, token rotation & concurrent races verified');

    // =========================================================================
    // [12/12] Fail-Closed Configuration, Production Masquerade Blocks & Control Matrix
    // =========================================================================
    // 12a. Simulated modes (`fake`, `loopback_test`) CANNOT masquerade as production delivery
    //      even if `TRUCKLY_ALLOW_TEST_PUSH_MODES=1` is set!
    for (const simMode of ['fake', 'loopback_test']) {
      process.env.TRUCKLY_ALLOW_TEST_PUSH_MODES = '1';
      process.env.TRUCKLY_PUSH_PROVIDER_MODE = simMode;

      process.env.TRUCKLY_ENV = 'production';
      assert.equal(notifLib.getPushProviderConfig().enabled, false, `${simMode} blocked under TRUCKLY_ENV=production`);
      assert.equal(notifLib.getPushProviderConfig().configValid, false);
      delete process.env.TRUCKLY_ENV;

      process.env.NODE_ENV = 'production';
      assert.equal(notifLib.getPushProviderConfig().enabled, false, `${simMode} blocked under NODE_ENV=production`);
      delete process.env.NODE_ENV;

      process.env.HATCHABLE_PROJECT_ID = 'proj_MEO518rmLLl0';
      assert.equal(notifLib.getPushProviderConfig().enabled, false, `${simMode} blocked on production project ID`);
      delete process.env.HATCHABLE_PROJECT_ID;
    }

    // 12b. Invalid provider mode, invalid TRUCKLY_ENV, and incomplete webpush VAPID config fail closed
    process.env.TRUCKLY_PUSH_PROVIDER_MODE = 'invalid_provider_typo';
    assert.equal(notifLib.getPushProviderConfig().enabled, false);
    assert.equal(notifLib.getPushProviderConfig().configValid, false);

    process.env.TRUCKLY_PUSH_PROVIDER_MODE = 'webpush';
    const savedPriv = process.env.TRUCKLY_VAPID_PRIVATE_KEY;
    delete process.env.TRUCKLY_VAPID_PRIVATE_KEY;
    assert.equal(notifLib.getPushProviderConfig().enabled, false, 'webpush without private key fails closed');
    assert.equal(notifLib.getPushProviderConfig().configValid, false);
    process.env.TRUCKLY_VAPID_PRIVATE_KEY = savedPriv;
    assert.equal(notifLib.getPushProviderConfig().enabled, true, 'complete valid webpush config enables cleanly');

    // 12c. Invalid boolean values on pause controls fail closed (pausing operations while keeping reads intact)
    process.env.TRUCKLY_PUSH_PROVIDER_MODE = 'fake';
    process.env.TRUCKLY_DISABLE_SUBSCRIPTIONS = 'yes_typo';
    assert.equal(notifLib.isSubscriptionsDisabled(), true, 'invalid TRUCKLY_DISABLE_SUBSCRIPTIONS fails closed');
    const badBoolTelem = await callApi('pager/telemetry.js', { user: ACTORS.admin });
    assert.equal(badBoolTelem.body.controls.config_valid, false);
    assert.equal(badBoolTelem.body.controls.subscriptions_paused, true);
    // Public status read still works!
    const statusDuringSubPause = await callApi('pager/status.js', {
      method: 'GET',
      query: { code: readyFirstPager.id },
      headers: { 'x-forwarded-for': '198.51.103.99' }
    });
    assert.equal(statusDuringSubPause.status, 200, 'pager status read preserved during subscription pause');
    assert.equal(statusDuringSubPause.body.notifications.enabled, false);
    delete process.env.TRUCKLY_DISABLE_SUBSCRIPTIONS;

    process.env.TRUCKLY_DISABLE_NOTIFICATION_DELIVERY = 'invalid_bool';
    assert.equal(notifLib.isNotificationDeliveryDisabled(), true, 'invalid TRUCKLY_DISABLE_NOTIFICATION_DELIVERY fails closed');
    delete process.env.TRUCKLY_DISABLE_NOTIFICATION_DELIVERY;

    // 12d. Scoped `TRUCKLY_PAUSE_WRITES=notifications` pauses both subscriptions & worker delivery without pausing pager reads
    process.env.TRUCKLY_PAUSE_WRITES = 'notifications';
    assert.equal(notifLib.isSubscriptionsDisabled(), true);
    assert.equal(notifLib.isNotificationDeliveryDisabled(), true);
    delete process.env.TRUCKLY_PAUSE_WRITES;

    // 12e. Worker `X-Worker-Secret` header parity & short-secret fail-closed check
    const xHeaderWorkerRes = await callApi('pager/worker.js', {
      method: 'POST',
      headers: { 'x-worker-secret': WORKER_SECRET },
      body: { batch_size: 1, cleanup: false }
    });
    assert.equal(xHeaderWorkerRes.status, 200, 'X-Worker-Secret header accepted');

    process.env.TRUCKLY_NOTIFICATION_WORKER_SECRET = 'too_short';
    const shortSecretRes = await callApi('pager/worker.js', {
      method: 'POST',
      headers: { authorization: 'Bearer too_short' },
      body: {}
    });
    assert.equal(shortSecretRes.status, 503, 'worker fails closed with 503 when secret < 24 chars');
    process.env.TRUCKLY_NOTIFICATION_WORKER_SECRET = WORKER_SECRET;

    notifLib.setFakePushProviderForTests(null);
    console.log('PASS [12/12]: Fail-closed runtime configuration, production masquerade blocks, and pause control matrix verified');
    console.log('\nALL PAGER NOTIFICATION BACKEND & MIGRATION TESTS PASSED.');
  } finally {
    notifLib.setFakePushProviderForTests(null);
    delete process.env.TRUCKLY_ALLOW_TEST_PUSH_MODES;
    delete process.env.TRUCKLY_ENV;
    delete process.env.NODE_ENV;
    delete process.env.HATCHABLE_PROJECT_ID;
    delete process.env.TRUCKLY_PAUSE_WRITES;
    delete process.env.TRUCKLY_PUSH_PROVIDER_MODE;
    delete process.env.TRUCKLY_VAPID_PUBLIC_KEY;
    delete process.env.TRUCKLY_VAPID_PRIVATE_KEY;
    delete process.env.TRUCKLY_VAPID_SUBJECT;
    delete process.env.TRUCKLY_NOTIFICATION_WORKER_SECRET;
    delete process.env.TRUCKLY_DISABLE_SUBSCRIPTIONS;
    delete process.env.TRUCKLY_DISABLE_NOTIFICATION_DELIVERY;

    if (loopbackServer) {
      await new Promise(r => loopbackServer.close(() => r()));
    }
    if (emptyPool) await emptyPool.end().catch(() => {});
    if (legacyPool) await legacyPool.end().catch(() => {});
    if (appPool) await appPool.end().catch(() => {});
    await adminPool.end().catch(() => {});
    await pgCluster.stop();
  }
})().catch(err => {
  console.error('PAGER NOTIFICATIONS INTEGRATION FAILURE:', err);
  process.exitCode = 1;
});
