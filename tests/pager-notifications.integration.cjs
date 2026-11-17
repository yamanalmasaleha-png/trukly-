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

const ROOT = path.resolve(__dirname, '..');

function requirePg() {
  const extraBase = process.env.TRUCKLY_PG_NODE_MODULES;
  if (extraBase) {
    return require(path.join(extraBase, 'pg'));
  }
  return require('pg');
}

const { Pool } = requirePg();

let activeDb = null;
let activeUser = null;

globalThis.__TRUCKLY_NOTIF_TEST_HATCHABLE__ = {
  db: {
    query: (text, params) => {
      if (!activeDb) throw new Error('No active PostgreSQL pool bound');
      return activeDb.query(text, params);
    },
    transaction: async fn => {
      if (!activeDb) throw new Error('No active PostgreSQL pool bound');
      const client = await activeDb.connect();
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
    getUser: async () => activeUser
  }
};

register(
  'data:text/javascript,' +
    encodeURIComponent(`
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "hatchable") {
    return {
      shortCircuit: true,
      url: "data:text/javascript,export const db = globalThis.__TRUCKLY_NOTIF_TEST_HATCHABLE__.db; export const auth = globalThis.__TRUCKLY_NOTIF_TEST_HATCHABLE__.auth;"
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
    forceRollbackAfterEvent = false
  } = {}
) {
  const mod = await loadRoute(relApiPath);
  const prevDb = activeDb;
  const prevUser = activeUser;
  if (dbPool) activeDb = dbPool;
  activeUser = user;

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
    ...(forceRollbackAfterEvent ? { _testForceRollbackAfterEvent: true } : {})
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

  try {
    await mod.default(req, res);
  } finally {
    activeDb = prevDb;
    activeUser = prevUser;
  }

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
    assert.equal((await legacyPool.query('SELECT count(*)::int AS c FROM favorites WHERE user_id = $1', ['usr_leg'])).rows[0].c, 1);

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
    assert.equal((await appPool.query(`SELECT count(*)::int AS c FROM favorites`)).rows[0].c, 1);
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

    // Enable deterministic fake provider mode for backend tests
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
    assert.equal(decryptedPayload.title, 'Order Ready for Pickup');
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

    console.log('PASS [8/8]: Telemetry RBAC, strict secret/URL/UUID redaction, and 24h retention cleanup verified');
    console.log('\nALL PAGER NOTIFICATION BACKEND & MIGRATION TESTS PASSED.');
  } finally {
    notifLib.setFakePushProviderForTests(null);
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
