// Real-PostgreSQL integration test suite for P1 Unified Discovery & Owner Publishing:
//   1. Single 59-listing catalog across /api/trucks, /api/trucks/[id], /api/trucks/search, /api/catalog/featured
//   2. Quarantined ID exclusion & legacy favorites resolution
//   3. Owner publishing (profile, location, schedule) -> immediate customer visibility & catalog_version bump
//   4. Cross-vendor RBAC, staff restrictions & self-elevation blocks (verified / photo_rights_verified)
//   5. Truthful location taxonomy, coordinate validation, unmeasured illustrative pins & automatic live expiry
//   6. America/Los_Angeles schedule precedence, overnight spillover, DST transitions & YYYY-MM-DD contract
//   7. Cache headers (ETag / 304 / ?fresh=1) & explicit 503 DISCOVERY_DB_UNAVAILABLE outage behavior
//
// Run locally:
//   $env:TRUCKLY_PG_NODE_MODULES="<path-to-pg-and-pg-binaries>"
//   node tests/p1-unified-discovery.integration.cjs

const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const os = require('node:os');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { register } = require('node:module');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const extraNodeModules = process.env.TRUCKLY_PG_NODE_MODULES;

function requireExternal(pkgName) {
  if (extraNodeModules) {
    return require(path.join(extraNodeModules, pkgName));
  }
  return require(pkgName);
}

const { Pool } = requireExternal('pg');

let activeDb = null;
let activeUser = null;

globalThis.__TRUCKLY_TEST_HATCHABLE__ = {
  db: {
    query: (text, params) => {
      if (!activeDb) throw new Error('No active PostgreSQL pool bound');
      return activeDb.query(text, params);
    },
    transaction: async fn => {
      if (!activeDb) throw new Error('No active PostgreSQL pool bound');
      if (typeof activeDb.connect !== 'function') {
        return fn(activeDb);
      }
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
      url: "data:text/javascript,export const db = globalThis.__TRUCKLY_TEST_HATCHABLE__.db; export const auth = globalThis.__TRUCKLY_TEST_HATCHABLE__.auth;"
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
  { method = 'GET', user = null, query = {}, params = {}, body = {}, headers = {}, dbPool = null, testNow = null } = {}
) {
  const mod = await loadRoute(relApiPath);
  const prevDb = activeDb;
  const prevUser = activeUser;
  if (dbPool) activeDb = dbPool;
  activeUser = user;

  let statusCode = 200;
  let jsonBody = undefined;
  let ended = false;
  const resHeaders = {};

  const req = {
    method,
    query,
    params,
    body,
    headers,
    ...(user ? { user } : {}),
    ...(testNow instanceof Date ? { _testNow: testNow } : {})
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
      ended = true;
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

  return { status: statusCode, body: jsonBody, headers: resHeaders, ended };
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

async function createPostgresTestCluster() {
  if (process.env.DATABASE_URL) {
    return {
      adminUrl: process.env.DATABASE_URL,
      stop: async () => {}
    };
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
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'truckly-pg-p1-'));
  const dataDir = path.join(tmpBase, 'data');
  const pwFile = path.join(tmpBase, 'pw.txt');
  const logFile = path.join(tmpBase, 'postgres.log');
  const password = 'truckly_ep_pw_' + crypto.randomBytes(6).toString('hex');
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

function listMigrationFiles(maxPrefix = 999) {
  const dir = path.join(ROOT, 'migrations');
  return fs
    .readdirSync(dir)
    .filter(f => /^\d{3}_.+\.sql$/.test(f) && Number(f.slice(0, 3)) <= maxPrefix)
    .sort();
}

async function applyMigrations(pool, files) {
  for (const file of files) {
    const sql = fs.readFileSync(path.join(ROOT, 'migrations', file), 'utf8');
    await pool.query(sql);
  }
}

function buildDbUrl(baseAdminUrl, { user, password, database }) {
  const u = new URL(baseAdminUrl);
  u.username = user;
  u.password = password || '';
  u.pathname = `/${database}`;
  return u.toString();
}

const ACTORS = {
  admin: { id: 'usr_platform_admin', email: 'admin@truckly.test', role: 'admin' },
  ownerA: { id: 'usr_vendor_a_owner', email: 'iniguez-owner@truckly.test', role: 'user' },
  staffA: { id: 'usr_vendor_a_staff', email: 'iniguez-staff@truckly.test', role: 'user' },
  ownerB: { id: 'usr_vendor_b_owner', email: 'mitote-owner@truckly.test', role: 'user' },
  ownerDog: { id: 'usr_dogaday_owner', email: 'dogaday-owner@truckly.test', role: 'user' },
  ownerLucha: { id: 'usr_lucha_owner', email: 'lucha-owner@truckly.test', role: 'user' },
  custA: { id: 'usr_customer_a', email: 'maya@sonoma.test', role: 'user' }
};

(async () => {
  const pgServer = await createPostgresTestCluster();
  const suffix = crypto.randomBytes(4).toString('hex');
  const appRole = `truckly_p1_app_${suffix}`;
  const appPass = `pw_${suffix}`;
  const dbName = `truckly_p1_${suffix}`;

  const adminPool = new Pool({ connectionString: pgServer.adminUrl, max: 4 });
  let appPool = null;

  try {
    const versionRes = await adminPool.query('SELECT version()');
    console.log('Connected to real PostgreSQL:', versionRes.rows[0].version.split(',')[0]);

    await adminPool.query(`CREATE ROLE ${appRole} LOGIN PASSWORD '${appPass}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`);
    await adminPool.query(`CREATE DATABASE ${dbName} OWNER ${appRole}`);

    appPool = new Pool({
      connectionString: buildDbUrl(pgServer.adminUrl, { user: appRole, password: appPass, database: dbName }),
      max: 10
    });
    activeDb = appPool;

    // =========================================================================
    // [1/7] Pre-Migration Legacy State -> 014 Unified 59-Listing Catalog & Parity
    // =========================================================================
    await applyMigrations(appPool, listMigrationFiles(10));

    // Seed pre-unification legacy records (quarantined IDs + customer favorites)
    await appPool.query(
      `INSERT INTO truck_settings (truck_id, location, is_open) VALUES
         ('estrella', 'Legacy Austin Park', true),
         ('owner-truck', 'Legacy Owner Demo', true)`
    );
    await appPool.query(
      `INSERT INTO favorites (user_id, truck_id) VALUES
         ($1, 'iniguez'),
         ($1, 'coffee-crooks')`,
      [ACTORS.custA.id]
    );

    await applyMigrations(
      appPool,
      listMigrationFiles(999).filter(f => Number(f.slice(0, 3)) >= 11)
    );

    // Seed RBAC memberships
    await appPool.query(
      `INSERT INTO platform_roles (user_id, role, granted_by) VALUES ($1, 'platform_admin', 'bootstrap')`,
      [ACTORS.admin.id]
    );
    await appPool.query(
      `INSERT INTO vendor_memberships (vendor_id, user_id, role, granted_by) VALUES
         ('iniguez', $1, 'owner', $6),
         ('iniguez', $2, 'staff', $1),
         ('mitote', $3, 'owner', $6),
         ('dogaday', $4, 'owner', $6),
         ('lucha', $5, 'owner', $6)`,
      [ACTORS.ownerA.id, ACTORS.staffA.id, ACTORS.ownerB.id, ACTORS.ownerDog.id, ACTORS.ownerLucha.id, ACTORS.admin.id]
    );

    const fixedNow = new Date('2026-11-17T20:00:00.000Z'); // Tue 12:00 PST in America/Los_Angeles
    const listRes = await callApi('trucks.js', { testNow: fixedNow });
    assert.equal(listRes.status, 200);
    assert.equal(listRes.body.total, 59, 'expected 59 active Sonoma County listings');
    assert.equal(listRes.body.primary_total, 47, 'expected 47 primary event-bookable listings');
    assert.equal(listRes.body.trucks.length, 59);
    assert.equal(listRes.body.trucks.filter(t => !t.extra).length, 47);
    assert.equal(listRes.body.trucks.filter(t => t.extra).length, 12);
    assert.equal(listRes.body.local_date, '2026-11-17');

    // Quarantined IDs excluded everywhere
    assert.equal(listRes.body.trucks.some(t => t.id === 'estrella' || t.id === 'owner-truck'), false);
    assert.equal((await callApi('trucks/[id].js', { params: { id: 'estrella' }, testNow: fixedNow })).status, 404);
    assert.equal((await callApi('trucks/[id].js', { params: { id: 'owner-truck' }, testNow: fixedNow })).status, 404);

    // Every single one of the 59 canonical IDs resolves identically in detail & search
    const searchAll = await callApi('trucks/search.js', { query: { limit: '100' }, testNow: fixedNow });
    assert.equal(searchAll.status, 200);
    assert.equal(searchAll.body.total, 59);
    assert.equal(searchAll.body.catalog_version, listRes.body.catalog_version);

    for (const item of listRes.body.trucks) {
      const det = await callApi('trucks/[id].js', { params: { id: item.id }, testNow: fixedNow });
      assert.equal(det.status, 200, `detail 200 for ${item.id}`);
      assert.equal(det.body.name, item.name, `name parity for ${item.id}`);
      assert.equal(det.body.cuisine, item.cuisine, `cuisine parity for ${item.id}`);
      assert.equal(det.body.location, item.location, `location parity for ${item.id}`);
      assert.equal(det.body.open, item.open, `open parity for ${item.id}`);
      assert.equal(det.body.location_accuracy, item.location_accuracy, `accuracy parity for ${item.id}`);
      assert.equal(det.body.verified, false, `unverified default for ${item.id}`);
      assert.equal(det.body.photo, null, `unlicensed photo suppressed for ${item.id}`);
      assert.equal(det.body.catalog_version, listRes.body.catalog_version);
    }

    const featuredRes = await callApi('catalog/featured.js', { testNow: fixedNow });
    assert.equal(featuredRes.status, 200);
    assert.deepEqual(featuredRes.body.featured_ids, ['ross', 'mitote', 'elroys-pet-1', 'block', 'fruta']);

    // Existing favorites resolve cleanly against unified IDs
    const favListRes = await callApi('favorites/list.js', { user: ACTORS.custA });
    assert.equal(favListRes.status, 200);
    const favIds = favListRes.body.favorites.map(f => f.truck_id);
    assert(favIds.includes('iniguez') && favIds.includes('coffee-crooks'));
    assert(favIds.every(id => listRes.body.trucks.some(t => t.id === id)));

    console.log('PASS [1/7]: Unified 59-listing PostgreSQL catalog parity, quarantine exclusion, photo suppression & favorites continuity');

    // =========================================================================
    // [2/7] Owner Publishing -> Immediate Customer List / Detail / Search / Schedule Sync
    // =========================================================================
    const initialCatalogVersion = listRes.body.catalog_version;

    const profUpdate = await callApi('owner/profile.js', {
      method: 'POST',
      user: ACTORS.ownerA,
      body: {
        truck_id: 'iniguez',
        display_name: 'Tacos Iñiguez — Westside',
        cuisine: 'Mexican',
        description: 'Quesabirria, consomé & handmade corn tortillas.',
        accepting_bookings: false
      }
    });
    assert.equal(profUpdate.status, 200);

    const listAfterProf = await callApi('trucks.js', { query: { fresh: '1' }, testNow: fixedNow });
    const detAfterProf = await callApi('trucks/[id].js', { params: { id: 'iniguez' }, query: { fresh: '1' }, testNow: fixedNow });
    const searchAfterProf = await callApi('trucks/search.js', { query: { q: 'quesabirria', fresh: '1' }, testNow: fixedNow });

    assert.notEqual(listAfterProf.body.catalog_version, initialCatalogVersion, 'catalog_version bumped on profile update');
    assert.equal(detAfterProf.body.catalog_version, listAfterProf.body.catalog_version);
    assert.equal(searchAfterProf.body.catalog_version, listAfterProf.body.catalog_version);

    const iniguezList = listAfterProf.body.trucks.find(t => t.id === 'iniguez');
    assert.equal(iniguezList.name, 'Tacos Iñiguez — Westside');
    assert.equal(iniguezList.blurb, 'Quesabirria, consomé & handmade corn tortillas.');
    assert.equal(iniguezList.accepting_bookings, false);
    assert.equal(detAfterProf.body.name, 'Tacos Iñiguez — Westside');
    assert.equal(detAfterProf.body.blurb, 'Quesabirria, consomé & handmade corn tortillas.');
    assert.equal(searchAfterProf.body.results[0]?.id, 'iniguez');

    // Staff publishes live location with coordinates
    const locUpdate = await callApi('owner/location.js', {
      method: 'POST',
      user: ACTORS.staffA,
      body: {
        truck_id: 'iniguez',
        location: 'Courthouse Square, Downtown Santa Rosa',
        lat: 38.4404,
        lng: -122.7141,
        ttl_minutes: 120,
        is_open: true,
        opens_at: '11:00',
        closes_at: '19:00'
      }
    });
    assert.equal(locUpdate.status, 200);
    assert.equal(locUpdate.body.location_accuracy, 'owner_reported_coords');

    const liveCheckTime = new Date(Date.now() + 60 * 1000); // 1 min after publish (non-expired)
    const detAfterLoc = await callApi('trucks/[id].js', { params: { id: 'iniguez' }, testNow: liveCheckTime });
    assert.equal(detAfterLoc.body.location, 'Courthouse Square, Downtown Santa Rosa');
    assert.equal(detAfterLoc.body.location_source, 'owner_reported');
    assert.equal(detAfterLoc.body.location_accuracy, 'owner_reported_coords');
    assert.equal(detAfterLoc.body.location_expired, false);
    assert.equal(detAfterLoc.body.verified, false, 'live publish never self-verifies listing');

    // Staff publishes today's schedule -> reflected in /api/schedule/today with updated display_name
    const pacificTodayReal = (await callApi('trucks.js')).body.local_date;
    const schedSave = await callApi('owner/schedule.js', {
      method: 'POST',
      user: ACTORS.staffA,
      body: {
        truck_id: 'iniguez',
        service_date: pacificTodayReal,
        opens_at: '11:00',
        closes_at: '19:30',
        location: 'Courthouse Square, Downtown Santa Rosa',
        status: 'scheduled'
      }
    });
    assert.equal(schedSave.status, 200);
    assert.equal(schedSave.body.service_date, pacificTodayReal);

    const todaySchedRes = await callApi('schedule/today.js', { query: { date: pacificTodayReal, fresh: '1' } });
    assert.equal(todaySchedRes.status, 200);
    const iniguezEvent = todaySchedRes.body.events.find(e => e.truck_id === 'iniguez');
    assert(iniguezEvent, 'iniguez appears in /api/schedule/today');
    assert.equal(iniguezEvent.vendor, 'Tacos Iñiguez — Westside');
    assert.equal(iniguezEvent.opens, '11:00');
    assert.equal(iniguezEvent.closes, '19:30');

    console.log('PASS [2/7]: Owner profile, location & schedule updates immediately sync across list, detail, search, and schedule/today');

    // =========================================================================
    // [3/7] Cross-Vendor Isolation, Staff Restrictions & Self-Elevation Denials
    // =========================================================================
    // Owner A cannot modify Vendor B (`mitote`)
    assert.equal(
      (await callApi('owner/profile.js', {
        method: 'POST',
        user: ACTORS.ownerA,
        body: { truck_id: 'mitote', display_name: 'Hijacked Mitote' }
      })).status,
      403
    );
    assert.equal(
      (await callApi('owner/location.js', {
        method: 'POST',
        user: ACTORS.ownerA,
        body: { truck_id: 'mitote', location: 'Wrong Spot' }
      })).status,
      403
    );
    assert.equal(
      (await callApi('owner/schedule.js', {
        method: 'POST',
        user: ACTORS.ownerA,
        body: { truck_id: 'mitote', service_date: pacificTodayReal, status: 'unavailable' }
      })).status,
      403
    );

    // Staff A cannot edit Owner A's profile
    assert.equal(
      (await callApi('owner/profile.js', {
        method: 'POST',
        user: ACTORS.staffA,
        body: { truck_id: 'iniguez', display_name: 'Staff Unauthorized Rename' }
      })).status,
      403
    );

    // Self-elevation attempts on profile, location, and schedule are rejected with 403
    for (const payload of [
      { verified: true },
      { verification_status: 'business_confirmed' },
      { photo_rights_verified: true },
      { photo: 'https://example.com/fake-licensed.jpg' }
    ]) {
      const pRes = await callApi('owner/profile.js', {
        method: 'POST',
        user: ACTORS.ownerA,
        body: { truck_id: 'iniguez', display_name: 'Tacos Iñiguez — Westside', ...payload }
      });
      assert.equal(pRes.status, 403, `profile self-elevation blocked for ${Object.keys(payload)[0]}`);

      const lRes = await callApi('owner/location.js', {
        method: 'POST',
        user: ACTORS.ownerA,
        body: { truck_id: 'iniguez', location: '460 Mission Blvd', ...payload }
      });
      assert.equal(lRes.status, 403, `location self-elevation blocked for ${Object.keys(payload)[0]}`);

      const sRes = await callApi('owner/schedule.js', {
        method: 'POST',
        user: ACTORS.ownerA,
        body: { truck_id: 'iniguez', service_date: pacificTodayReal, status: 'scheduled', ...payload }
      });
      assert.equal(sRes.status, 403, `schedule self-elevation blocked for ${Object.keys(payload)[0]}`);
    }

    const verifyCheck = await callApi('trucks/[id].js', { params: { id: 'iniguez' } });
    assert.equal(verifyCheck.body.verified, false);
    assert.equal(verifyCheck.body.photo_rights_verified, false);
    assert.equal(verifyCheck.body.photo, null);

    console.log('PASS [3/7]: Cross-vendor isolation, staff profile restriction, and self-elevation guards enforced');

    // =========================================================================
    // [4/7] Truthful Location Taxonomy, Coordinate Validation & Stale Live Expiry
    // =========================================================================
    for (const badLoc of [
      { lat: 95, lng: -122.7 },
      { lat: 38.4, lng: -185 },
      { lat: 0, lng: 0 },
      { lat: 38.44 },
      { lng: -122.71 },
      { lat: 'north', lng: 'west' },
      { lat: true, lng: false },
      { ttl_minutes: 2 },
      { ttl_minutes: 9999 },
      { expires_at: '2020-01-01T00:00:00Z' }
    ]) {
      const badRes = await callApi('owner/location.js', {
        method: 'POST',
        user: ACTORS.ownerA,
        body: { truck_id: 'iniguez', location: '460 Mission Blvd, Santa Rosa', ...badLoc }
      });
      assert.equal(badRes.status, 400, `rejected invalid location payload: ${JSON.stringify(badLoc)}`);
    }

    // Invalid user coordinates on GET discovery endpoints also return 400
    assert.equal((await callApi('trucks.js', { query: { lat: '999', lng: '-122.7' } })).status, 400);
    assert.equal((await callApi('trucks/[id].js', { params: { id: 'mitote' }, query: { lat: '38.4' } })).status, 400);
    assert.equal((await callApi('trucks/search.js', { query: { lat: '0', lng: '0' } })).status, 400);

    // Clear today's schedule on `iniguez` so we test pure `truck_settings` live location -> expiry transition
    await appPool.query('DELETE FROM owner_schedule WHERE truck_id = $1', ['iniguez']);

    // Re-publish fresh 60-minute GPS location on `iniguez` (open now without hour restriction)
    const freshLocRes = await callApi('owner/location.js', {
      method: 'POST',
      user: ACTORS.ownerA,
      body: {
        truck_id: 'iniguez',
        location: 'Courthouse Square, Downtown Santa Rosa',
        lat: 38.4404,
        lng: -122.7141,
        ttl_minutes: 60,
        is_open: true,
        opens_at: null,
        closes_at: null
      }
    });
    assert.equal(freshLocRes.status, 200);
    const expiresAtDate = new Date(freshLocRes.body.expires_at);

    // Query with user coordinates in Downtown Santa Rosa while live location is active
    const duringLive = await callApi('trucks.js', {
      query: { lat: '38.4404', lng: '-122.7141' },
      testNow: new Date(expiresAtDate.getTime() - 30 * 60 * 1000)
    });
    assert.equal(duringLive.status, 200);
    const iniguezDuring = duringLive.body.trucks.find(t => t.id === 'iniguez');
    const mitoteDuring = duringLive.body.trucks.find(t => t.id === 'mitote');
    const rossDuring = duringLive.body.trucks.find(t => t.id === 'ross');
    const oakhillDuring = duringLive.body.trucks.find(t => t.id === 'farm-oakhill');

    assert.equal(iniguezDuring.location_accuracy, 'owner_reported_coords');
    assert.equal(iniguezDuring.distance, 0, 'owner_reported_coords receives measured distance');
    assert.equal(iniguezDuring.location_is_live, true);
    assert.equal(mitoteDuring.location_accuracy, 'venue_address');
    assert(typeof mitoteDuring.distance === 'number' && mitoteDuring.distance > 0, 'venue_address receives measured distance');
    assert.equal(rossDuring.location_accuracy, 'illustrative_pin');
    assert.equal(rossDuring.distance, null, 'illustrative_pin NEVER receives measured distance');
    assert.equal(oakhillDuring.location_accuracy, 'none');
    assert.equal(oakhillDuring.distance, null, 'unpinned listing has null distance');

    // Advance clock past expires_at -> stale live location expires automatically without manual DB cleanup
    const afterExpiry = await callApi('trucks/[id].js', {
      params: { id: 'iniguez' },
      query: { lat: '38.4404', lng: '-122.7141' },
      testNow: new Date(expiresAtDate.getTime() + 5 * 60 * 1000)
    });
    assert.equal(afterExpiry.status, 200);
    assert.equal(afterExpiry.body.location, '460 Mission Blvd, Santa Rosa', 'expired live location reverts to curated baseline');
    assert.equal(afterExpiry.body.location_expired, true, 'location_expired flagged true');
    assert.equal(afterExpiry.body.location_is_live, false, 'expired location_is_live is false');
    assert.equal(afterExpiry.body.is_confirmed_service, false, 'expired live status no longer claims confirmed service');
    assert.equal(afterExpiry.body.open, null, 'expired live open claim cleared');
    assert.equal(afterExpiry.body.distance, null, 'illustrative baseline after expiry does not claim measured distance');

    // Text-only owner update clears previous GPS coordinates so stale coords are never reused
    const textOnlyLoc = await callApi('owner/location.js', {
      method: 'POST',
      user: ACTORS.ownerA,
      body: {
        truck_id: 'iniguez',
        location: 'Railroad Square Pop-Up, Santa Rosa',
        ttl_minutes: 60,
        is_open: true
      }
    });
    assert.equal(textOnlyLoc.status, 200);
    assert.equal(textOnlyLoc.body.lat, null);
    assert.equal(textOnlyLoc.body.lng, null);
    assert.equal(textOnlyLoc.body.location_accuracy, 'owner_text_only');

    const textOnlyRead = await callApi('trucks/[id].js', {
      params: { id: 'iniguez' },
      query: { lat: '38.4404', lng: '-122.7141' },
      testNow: new Date(Date.now() + 60 * 1000)
    });
    assert.equal(textOnlyRead.body.location, 'Railroad Square Pop-Up, Santa Rosa');
    assert.equal(textOnlyRead.body.location_accuracy, 'owner_text_only');
    assert.equal(textOnlyRead.body.distance, null, 'owner_text_only never claims measured GPS mileage');

    console.log('PASS [4/7]: Coordinate bounds, unmeasured illustrative pins, text-only coordinate reset & stale live expiry verified');

    // =========================================================================
    // [5/7] Pacific Schedule Precedence, Overnight Windows, DST & YYYY-MM-DD
    // =========================================================================
    // Test full precedence chain on `dogaday` (curated recurring_schedule: daily 08:30 - 14:35)
    // Choose future Pacific date 2026-12-10 at 10:00 PST (2026-12-10T18:00:00Z)
    const dec10MorningPst = new Date('2026-12-10T18:00:00.000Z'); // 10:00 PST

    // 5a. Baseline recurring hours -> open: true, is_confirmed_service: false
    const dogBase = await callApi('trucks/[id].js', { params: { id: 'dogaday' }, testNow: dec10MorningPst });
    assert.equal(dogBase.body.local_date, '2026-12-10');
    assert.equal(dogBase.body.open, true);
    assert.equal(dogBase.body.schedule_source, 'published_recurring');
    assert.equal(dogBase.body.is_confirmed_service, false);

    // 5b. Non-expired `truck_settings` (is_open = false) overrides recurring hours
    await appPool.query(
      `INSERT INTO truck_settings (truck_id, location, location_source, location_accuracy, is_open, observed_at, expires_at, updated_at)
       VALUES ('dogaday', 'Santa Rosa · taking morning break', 'owner_reported', 'owner_text_only', false, '2026-12-10T17:00:00Z', '2026-12-10T23:00:00Z', '2026-12-10T17:00:00Z')
       ON CONFLICT (truck_id) DO UPDATE SET is_open = false, expires_at = EXCLUDED.expires_at, updated_at = EXCLUDED.updated_at`
    );
    const dogPaused = await callApi('trucks/[id].js', { params: { id: 'dogaday' }, testNow: dec10MorningPst });
    assert.equal(dogPaused.body.open, false);
    assert.equal(dogPaused.body.schedule_source, 'owner_live');
    assert.equal(dogPaused.body.schedule_status, 'owner_paused_today');

    // 5c. Date-specific `owner_schedule` ('scheduled' 09:00-15:00) overrides paused `truck_settings`
    await callApi('owner/schedule.js', {
      method: 'POST',
      user: ACTORS.ownerDog,
      body: {
        truck_id: 'dogaday',
        service_date: '2026-12-10',
        opens_at: '09:00',
        closes_at: '15:00',
        location: 'Juilliard Park Pop-Up, Santa Rosa',
        status: 'scheduled'
      }
    });
    const dogScheduled = await callApi('trucks/[id].js', { params: { id: 'dogaday' }, testNow: dec10MorningPst });
    assert.equal(dogScheduled.body.open, true);
    assert.equal(dogScheduled.body.schedule_source, 'owner_schedule');
    assert.equal(dogScheduled.body.schedule_status, 'owner_scheduled_open');
    assert.equal(dogScheduled.body.is_confirmed_service, true);

    // 5d. Date-specific `unavailable` overrides active `is_open = true` `truck_settings` AND recurring hours
    await appPool.query(
      `UPDATE truck_settings SET is_open = true, expires_at = '2026-12-10T23:00:00Z' WHERE truck_id = 'dogaday'`
    );
    await callApi('owner/schedule.js', {
      method: 'POST',
      user: ACTORS.ownerDog,
      body: {
        truck_id: 'dogaday',
        service_date: '2026-12-10',
        status: 'unavailable'
      }
    });
    const dogUnavailable = await callApi('trucks/[id].js', { params: { id: 'dogaday' }, testNow: dec10MorningPst });
    assert.equal(dogUnavailable.body.open, false);
    assert.equal(dogUnavailable.body.schedule_source, 'owner_schedule');
    assert.equal(dogUnavailable.body.schedule_status, 'unavailable_today');
    assert.equal(dogUnavailable.body.is_confirmed_service, false);

    // 5e. Overnight window (`21:00` -> `02:00`) across midnight + Fall-Back DST Sunday (`2026-11-01`)
    await appPool.query(
      `INSERT INTO owner_schedule (truck_id, service_date, opens_at, closes_at, location, status, updated_at)
       VALUES ('lucha', '2026-10-31', '21:00', '02:00', 'Mitote Halloween Night Lot', 'scheduled', now())`
    );
    // Sat 2026-10-31 20:30 PDT = 2026-11-01T03:30:00Z -> not open yet
    const luchaBefore = await callApi('trucks/[id].js', {
      params: { id: 'lucha' },
      testNow: new Date('2026-11-01T03:30:00.000Z')
    });
    assert.equal(luchaBefore.body.local_date, '2026-10-31');
    assert.equal(luchaBefore.body.open, false);

    // Sat 2026-10-31 22:30 PDT = 2026-11-01T05:30:00Z -> open (same-evening half)
    const luchaEvening = await callApi('trucks/[id].js', {
      params: { id: 'lucha' },
      testNow: new Date('2026-11-01T05:30:00.000Z')
    });
    assert.equal(luchaEvening.body.local_date, '2026-10-31');
    assert.equal(luchaEvening.body.open, true);
    assert.equal(luchaEvening.body.is_confirmed_service, true);
    assert.equal(luchaEvening.body.location, 'Mitote Halloween Night Lot');

    // Sun 2026-11-01 01:30 PST (after DST fall-back!) = 2026-11-01T09:30:00Z -> still open via yesterday spillover!
    const luchaAfterMidnightDst = await callApi('trucks/[id].js', {
      params: { id: 'lucha' },
      testNow: new Date('2026-11-01T09:30:00.000Z')
    });
    assert.equal(luchaAfterMidnightDst.body.local_date, '2026-11-01');
    assert.equal(luchaAfterMidnightDst.body.open, true, 'overnight spillover stays open across Fall-Back DST boundary');
    assert.equal(luchaAfterMidnightDst.body.location, 'Mitote Halloween Night Lot');

    // Sun 2026-11-01 02:05 PST = 2026-11-01T10:05:00Z -> overnight window ended
    const luchaClosed = await callApi('trucks/[id].js', {
      params: { id: 'lucha' },
      testNow: new Date('2026-11-01T10:05:00.000Z')
    });
    assert.equal(luchaClosed.body.local_date, '2026-11-01');
    assert.equal(luchaClosed.body.open, null);

    // 5f. Spring-Forward DST Sunday (`2026-03-08`: 15:15Z = 08:15 PDT -> fruta closed, dogaday closed; 15:45Z = 08:45 PDT -> dogaday open)
    await appPool.query(`DELETE FROM truck_settings WHERE truck_id = 'dogaday'`);
    const springBeforeOpen = await callApi('trucks/[id].js', {
      params: { id: 'dogaday' },
      testNow: new Date('2026-03-08T15:15:00.000Z') // 08:15 PDT
    });
    const springAfterOpen = await callApi('trucks/[id].js', {
      params: { id: 'dogaday' },
      testNow: new Date('2026-03-08T15:45:00.000Z') // 08:45 PDT
    });
    assert.equal(springBeforeOpen.body.local_date, '2026-03-08');
    assert.equal(springBeforeOpen.body.open, false, '08:15 PDT on Spring-Forward Sunday is before 08:30');
    assert.equal(springAfterOpen.body.open, true, '08:45 PDT on Spring-Forward Sunday is inside 08:30-14:35');

    console.log('PASS [5/7]: America/Los_Angeles schedule precedence, overnight spillover, and Spring/Fall DST transitions verified');

    // =========================================================================
    // [6/7] Freshness / Cache Headers (ETag, 304, ?fresh=1) & Explicit 503 Outages
    // =========================================================================
    const cachedCheck = await callApi('trucks.js', { testNow: fixedNow });
    assert(cachedCheck.headers.etag && cachedCheck.headers.etag.startsWith('"e2:'));
    assert.equal(cachedCheck.headers['cache-control'], 'public, max-age=0, s-maxage=5, stale-while-revalidate=10');

    const notModified = await callApi('trucks.js', {
      headers: { 'if-none-match': cachedCheck.headers.etag },
      testNow: fixedNow
    });
    assert.equal(notModified.status, 304, 'matching If-None-Match returns 304 Not Modified');
    assert.equal(notModified.ended, true);

    const freshBypass = await callApi('trucks.js', {
      query: { fresh: '1' },
      headers: { 'if-none-match': cachedCheck.headers.etag },
      testNow: fixedNow
    });
    assert.equal(freshBypass.status, 200, 'fresh=1 bypasses 304 and forces no-store');
    assert.equal(freshBypass.headers['cache-control'], 'no-store, max-age=0');

    // Broken PostgreSQL adapter returns explicit 503 DISCOVERY_DB_UNAVAILABLE on all 5 read routes
    const failingPool = {
      query: async () => {
        throw new Error('ECONNREFUSED simulated postgres down');
      }
    };
    for (const [route, params] of [
      ['trucks.js', {}],
      ['trucks/[id].js', { id: 'mitote' }],
      ['trucks/search.js', {}],
      ['catalog/featured.js', {}],
      ['schedule/today.js', {}]
    ]) {
      const outage = await callApi(route, { params, dbPool: failingPool });
      assert.equal(outage.status, 503, `expected 503 on ${route}`);
      assert.equal(outage.body.code, 'DISCOVERY_DB_UNAVAILABLE');
      assert.equal(outage.body.retryable, true);
    }

    console.log('PASS [6/7]: ETag/304/fresh=1 cache headers and explicit 503 database outage responses verified');

    // =========================================================================
    // [7/7] Database-Level CHECK Constraints Guard Data Integrity Directly
    // =========================================================================
    await assert.rejects(
      () => appPool.query(`UPDATE vendors SET verified = true WHERE id = 'mitote'`),
      /vendors_verification_consistency_chk/,
      'DB rejects inconsistent verified=true with needs_review'
    );
    await assert.rejects(
      () => appPool.query(`UPDATE truck_settings SET lat = 38.44, lng = NULL WHERE truck_id = 'iniguez'`),
      /truck_settings_coord_pair_chk/,
      'DB rejects partial single-axis coordinate in truck_settings'
    );
    await assert.rejects(
      () => appPool.query(`UPDATE truck_settings SET lat = 120, lng = -122.7 WHERE truck_id = 'iniguez'`),
      /truck_settings_lat_chk/,
      'DB rejects out-of-range latitude in truck_settings'
    );

    console.log('PASS [7/7]: PostgreSQL CHECK constraints enforce verification consistency and coordinate bounds');
    console.log('\nALL P1 UNIFIED DISCOVERY POSTGRESQL INTEGRATION TESTS PASSED.');
  } finally {
    if (appPool) await appPool.end().catch(() => {});
    await adminPool.end().catch(() => {});
    await pgServer.stop();
  }
})().catch(err => {
  console.error('P1 INTEGRATION TEST FAILURE:', err);
  process.exitCode = 1;
});
