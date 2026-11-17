// Real-PostgreSQL Backend Hardening Integration Suite (P0-A, P0-B, P0-C)
//
// Executes actual unmodified api/**/*.js route handlers, lib/*.js helpers, and
// numbered SQL migrations (001-013) against a real PostgreSQL instance using a
// non-superuser NOBYPASSRLS database owner role (`truckly_app`) so constraints,
// triggers, row-level locks (FOR UPDATE / FOR SHARE), transactions, and
// FORCE ROW LEVEL SECURITY policies are genuinely enforced by PostgreSQL.
//
// Note on authentication boundary:
// Hosted Hatchable SSO session issuance is external to this repository, so
// `auth.getUser(req)` is supplied by an AsyncLocalStorage test adapter while
// all SQL, RBAC lookups, transactions, locks, triggers, and RLS run on real Postgres.
//
// Usage:
//   DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres node tests/backend-hardening.integration.cjs
//   (or with embedded-postgres available on NODE_PATH for zero-Docker local runs)

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { register } = require('node:module');
const { pathToFileURL } = require('node:url');
const { AsyncLocalStorage } = require('node:async_hooks');

const ROOT = path.resolve(__dirname, '..');
const MIGRATIONS_DIR = path.join(ROOT, 'migrations');
const als = new AsyncLocalStorage();

let defaultDbAdapter = null;

const hatchableDbProxy = {
  query(sql, params) {
    const store = als.getStore();
    const db = (store && store.db) || defaultDbAdapter;
    if (!db) throw new Error('No active PostgreSQL adapter configured');
    return db.query(sql, params);
  },
  connect() {
    const store = als.getStore();
    const db = (store && store.db) || defaultDbAdapter;
    if (!db || typeof db.connect !== 'function') {
      throw new Error('Active DB adapter does not expose connect()');
    }
    return db.connect();
  }
};

const hatchableAuthProxy = {
  async getUser() {
    const store = als.getStore();
    return store ? store.authUser || null : null;
  }
};

globalThis.__TRUCKLY_HATCHABLE__ = {
  db: hatchableDbProxy,
  auth: hatchableAuthProxy
};

register(
  'data:text/javascript,' +
    encodeURIComponent(`
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "hatchable") {
    return {
      shortCircuit: true,
      url: "data:text/javascript,export const db = globalThis.__TRUCKLY_HATCHABLE__.db; export const auth = globalThis.__TRUCKLY_HATCHABLE__.auth;"
    };
  }
  return nextResolve(specifier, context);
}
`)
);

async function resolvePgDriver() {
  try {
    return require('pg');
  } catch {
    const extraBase = process.env.TRUCKLY_PG_NODE_MODULES;
    if (extraBase) {
      return require(path.join(extraBase, 'pg'));
    }
    throw new Error(
      'Missing `pg` driver. Provide `pg` via NODE_PATH / TRUCKLY_PG_NODE_MODULES or install in temp harness.'
    );
  }
}

async function maybeStartEmbeddedPostgres() {
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
    throw new Error(
      'Set DATABASE_URL to a PostgreSQL instance (e.g. postgres://postgres:postgres@127.0.0.1:5432/postgres) or provide @embedded-postgres binaries via TRUCKLY_PG_NODE_MODULES.'
    );
  }

  const initdbBin = path.join(nativeBinDir, 'initdb' + binSuffix);
  const pgCtlBin = path.join(nativeBinDir, 'pg_ctl' + binSuffix);
  const port = 55400 + Math.floor(Math.random() * 400);
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'truckly-pg-'));
  const dbDir = path.join(tmpRoot, 'data');
  const pwFile = path.join(tmpRoot, 'pw.txt');
  const logFile = path.join(tmpRoot, 'pg.log');
  const password = 'truckly_ep_pw_' + crypto.randomBytes(6).toString('hex');
  fs.writeFileSync(pwFile, password + '\n', 'utf8');

  execFileSync(
    initdbBin,
    ['-D', dbDir, '-U', 'postgres', `--pwfile=${pwFile}`, '-A', 'scram-sha-256', '-E', 'UTF8', '--no-locale'],
    { stdio: 'ignore', windowsHide: true }
  );
  execFileSync(
    pgCtlBin,
    ['-D', dbDir, '-l', logFile, '-w', '-o', `-p ${port} -h 127.0.0.1`, 'start'],
    { stdio: 'ignore', windowsHide: true }
  );

  const adminUrl = `postgres://postgres:${encodeURIComponent(password)}@127.0.0.1:${port}/postgres`;
  return {
    adminUrl,
    stop: async () => {
      try {
        execFileSync(pgCtlBin, ['-D', dbDir, '-m', 'immediate', '-w', 'stop'], {
          stdio: 'ignore',
          windowsHide: true
        });
      } catch {}
      try {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
      } catch {}
    }
  };
}

function buildDbUrl(baseUrl, { user, password, database }) {
  const u = new URL(baseUrl);
  if (user) u.username = user;
  if (password) u.password = password;
  if (database) u.pathname = '/' + database;
  return u.toString();
}

function listMigrationFiles(maxNum = 999) {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter(f => /^\d{3}_.+\.sql$/.test(f))
    .sort()
    .filter(f => Number(f.slice(0, 3)) <= maxNum);
}

async function applyMigrations(pool, files) {
  for (const file of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    await pool.query(sql);
  }
}

const loadedRoutes = new Map();
async function getRoute(relApiPath) {
  const full = path.join(ROOT, 'api', ...relApiPath.split('/'));
  if (!loadedRoutes.has(full)) {
    const mod = await import(pathToFileURL(full).href);
    loadedRoutes.set(full, mod);
  }
  return loadedRoutes.get(full);
}

async function callApi(relApiPath, { method = 'GET', user = null, authOnlyUser = null, query = {}, params = {}, body = {}, headers = {}, _now = undefined, dbOverride = null } = {}) {
  const mod = await getRoute(relApiPath);
  assert(mod.methods.includes(method), `Route ${relApiPath} does not declare method ${method}`);

  let statusCode = 200;
  const resHeaders = {};
  let jsonBody = undefined;

  const req = {
    method,
    query,
    params,
    body,
    headers,
    ...(user !== undefined && user !== null ? { user } : {}),
    ...(_now ? { _now } : {})
  };

  const res = {
    setHeader(k, v) {
      resHeaders[k.toLowerCase()] = v;
    },
    status(c) {
      statusCode = c;
      return this;
    },
    json(payload) {
      jsonBody = payload;
      return this;
    }
  };

  await als.run(
    {
      db: dbOverride || defaultDbAdapter,
      authUser: authOnlyUser !== null ? authOnlyUser : user
    },
    () => mod.default(req, res)
  );

  return { status: statusCode, headers: resHeaders, body: jsonBody, access: mod.access };
}

function futurePacificDate(daysAhead = 12) {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
  const [y, m, d] = today.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + daysAhead)).toISOString().slice(0, 10);
}

(async () => {
  const { Pool } = await resolvePgDriver();
  const pgServer = await maybeStartEmbeddedPostgres();
  const appRole = 'truckly_app_' + crypto.randomBytes(3).toString('hex');
  const appPass = 'app_pw_' + crypto.randomBytes(8).toString('hex');
  const cleanDbName = 'truckly_clean_' + crypto.randomBytes(3).toString('hex');
  const legacyDbName = 'truckly_legacy_' + crypto.randomBytes(3).toString('hex');
  const rollbackDbName = 'truckly_rollback_' + crypto.randomBytes(3).toString('hex');

  const adminPool = new Pool({ connectionString: pgServer.adminUrl, max: 4 });
  let cleanPool = null;
  let legacyPool = null;
  let rollbackPool = null;
  let singleConnPool = null;

  try {
    const verRes = await adminPool.query('SELECT version()');
    console.log('Connected to real PostgreSQL:', verRes.rows[0].version.split(',')[0]);

    await adminPool.query(
      `CREATE ROLE ${appRole} LOGIN PASSWORD '${appPass}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`
    );
    await adminPool.query(`CREATE DATABASE ${cleanDbName} OWNER ${appRole}`);
    await adminPool.query(`CREATE DATABASE ${legacyDbName} OWNER ${appRole}`);

    cleanPool = new Pool({
      connectionString: buildDbUrl(pgServer.adminUrl, { user: appRole, password: appPass, database: cleanDbName }),
      max: 10
    });
    legacyPool = new Pool({
      connectionString: buildDbUrl(pgServer.adminUrl, { user: appRole, password: appPass, database: legacyDbName }),
      max: 4
    });

    // Verify our app connection does NOT have SUPERUSER or BYPASSRLS
    const roleCheck = await cleanPool.query(
      'SELECT current_user, usesuper, usebypassrls FROM pg_user WHERE usename = current_user'
    );
    assert.equal(roleCheck.rows[0].usesuper, false, 'app role must not be superuser');
    assert.equal(roleCheck.rows[0].usebypassrls, false, 'app role must not bypass RLS');

    // =========================================================================
    // PART 1: Legacy Fixture Pre-Population & Safe Additive Migration (001->013)
    // =========================================================================
    const preHardeningFiles = listMigrationFiles(10);
    const hardeningFiles = listMigrationFiles(999).filter(f => Number(f.slice(0, 3)) >= 11);
    assert.equal(preHardeningFiles.length, 10, 'expected 001..010 baseline migrations');
    assert(hardeningFiles.length >= 3, 'expected 011+ post-baseline migrations');

    await applyMigrations(legacyPool, preHardeningFiles);

    // Seed realistic pre-hardening rows (including legacy prototype IDs & unverified bookings)
    await legacyPool.query(
      `INSERT INTO truck_settings (truck_id, location, is_open) VALUES
         ('estrella', 'Legacy Austin Park', true),
         ('owner-truck', 'Ross Street', true),
         ('mitote', '100 Sebastopol Rd, Santa Rosa', true)`
    );
    await legacyPool.query(
      `INSERT INTO owner_profiles (truck_id, display_name, cuisine, accepting_bookings) VALUES
         ('owner-truck', 'My Prototype Truck', 'Mexican', true)`
    );
    const legacyNullBooking = await legacyPool.query(
      `INSERT INTO bookings (truck_id, truck_name, event_type, event_date, guest_count, location, requester, package_id, package_price, status)
       VALUES ('', 'Best available match', 'Wedding', '2025-05-01', 5, 'Santa Rosa', 'legacy-guest@example.test', 'custom', 100, 'pending')
       RETURNING id`
    );
    const legacyEstrellaBooking = await legacyPool.query(
      `INSERT INTO bookings (truck_id, truck_name, event_type, event_date, guest_count, location, requester, status)
       VALUES ('estrella', 'La Estrella', 'Party', '2025-06-01', 30, 'Petaluma', 'legacy-guest@example.test', 'pending')
       RETURNING id`
    );
    const legacyMappedPager = await legacyPool.query(
      `INSERT INTO pickup_pagers (vendor, ticket, status, request_key)
       VALUES ('Mitote Food Park', '11', 'cooking', $1) RETURNING id`,
      [crypto.randomUUID()]
    );
    const legacyUnmappedPager = await legacyPool.query(
      `INSERT INTO pickup_pagers (vendor, ticket, status, request_key)
       VALUES ('Unmapped Legacy Cart', '99', 'cooking', $1) RETURNING id`,
      [crypto.randomUUID()]
    );
    await legacyPool.query(
      `INSERT INTO community_reviews (author_id, nickname, kind, place_id, place_name, town, title, body, rating, status, moderated_at)
       VALUES
         ('usr_hist_1', 'Old Timer', 'review', 'mitote', 'Mitote Food Park', 'Santa Rosa', 'Great tacos', 'Loved visiting the park last weekend with friends.', 5, 'approved', NULL),
         ('usr_hist_2', 'Neighbor', 'tip', 'elroys', 'El Roy''s Express Mex', 'Santa Rosa', 'Parking tip', 'Plenty of parking on the side street before noon.', NULL, 'pending', now())`
    );

    // Apply 011, 012, 013 onto populated legacy database
    await applyMigrations(legacyPool, hardeningFiles);

    const quarantined = await legacyPool.query(
      `SELECT id, is_active, event_bookable FROM vendors WHERE id IN ('estrella', 'owner-truck') ORDER BY id`
    );
    assert.equal(quarantined.rows.length, 2, 'legacy prototype truck_ids preserved as quarantined vendor rows');
    assert(quarantined.rows.every(r => r.is_active === false && r.event_bookable === false), 'quarantined rows inactive & non-bookable');

    const migratedBookings = await legacyPool.query(
      `SELECT id, truck_id, requester_user_id, requester_email FROM bookings ORDER BY created_at ASC`
    );
    assert.equal(migratedBookings.rows[0].truck_id, null, 'blank legacy truck_id normalized to NULL');
    assert.equal(migratedBookings.rows[0].requester_user_id, null, 'unverified legacy booking keeps requester_user_id NULL');
    assert.equal(migratedBookings.rows[0].requester_email, 'legacy-guest@example.test', 'legacy contact email preserved in requester_email');

    const migratedPagers = await legacyPool.query(
      `SELECT id, vendor_id FROM pickup_pagers WHERE id = ANY($1::uuid[])`,
      [[legacyMappedPager.rows[0].id, legacyUnmappedPager.rows[0].id]]
    );
    const pagerMap = new Map(migratedPagers.rows.map(r => [r.id, r.vendor_id]));
    assert.equal(pagerMap.get(legacyMappedPager.rows[0].id), 'mitote', 'exact canonical vendor name backfilled to vendor_id');
    assert.equal(pagerMap.get(legacyUnmappedPager.rows[0].id), null, 'ambiguous legacy pager left NULL (admin-only)');

    // Verify Customer with matching email CANNOT see legacy unverified bookings, and Vendor A CANNOT accept legacy unassigned/quarantined bookings or pagers
    await legacyPool.query(
      `INSERT INTO platform_roles (user_id, role, granted_by) VALUES ('usr_admin', 'platform_admin', 'system_bootstrap')`
    );
    await legacyPool.query('BEGIN');
    await legacyPool.query("SELECT set_config('app.is_platform_admin', 'true', true)");
    await legacyPool.query(
      `INSERT INTO vendor_memberships (vendor_id, user_id, role, granted_by) VALUES ('mitote', 'usr_mitote_owner', 'owner', 'usr_admin')`
    );
    await legacyPool.query('COMMIT');

    const sameEmailCustomerList = await callApi('bookings/list.js', {
      method: 'GET',
      user: { id: 'usr_new_with_same_email', email: 'legacy-guest@example.test' },
      dbOverride: legacyPool
    });
    assert.equal(sameEmailCustomerList.status, 200);
    assert.equal(sameEmailCustomerList.body.bookings.length, 0, 'matching email never claims legacy unverified bookings');

    const vendorTouchNullBooking = await callApi('owner/requests.js', {
      method: 'POST',
      user: { id: 'usr_mitote_owner', email: 'm@t.test' },
      body: { id: legacyNullBooking.rows[0].id, status: 'accepted' },
      dbOverride: legacyPool
    });
    assert.equal(vendorTouchNullBooking.status, 403, 'independent vendor cannot claim unassigned NULL booking');

    const vendorTouchQuarantinedBooking = await callApi('owner/requests.js', {
      method: 'POST',
      user: { id: 'usr_mitote_owner', email: 'm@t.test' },
      body: { id: legacyEstrellaBooking.rows[0].id, status: 'accepted' },
      dbOverride: legacyPool
    });
    assert.equal(vendorTouchQuarantinedBooking.status, 403, 'independent vendor cannot touch quarantined legacy booking');

    const vendorTouchUnmappedPager = await callApi('pager/update.js', {
      method: 'POST',
      user: { id: 'usr_mitote_owner', email: 'm@t.test' },
      body: { id: legacyUnmappedPager.rows[0].id, status: 'ready' },
      dbOverride: legacyPool
    });
    assert.equal(vendorTouchUnmappedPager.status, 403, 'independent vendor cannot update unmapped legacy pager');

    const adminTouchUnmappedPager = await callApi('pager/update.js', {
      method: 'POST',
      user: { id: 'usr_admin', email: 'admin@t.test' },
      body: { id: legacyUnmappedPager.rows[0].id, status: 'ready' },
      dbOverride: legacyPool
    });
    assert.equal(adminTouchUnmappedPager.status, 200, 'platform_admin retains intentional access to legacy unmapped records');

    console.log('PASS [1/6]: Legacy database fixture migration, quarantine, and admin-only legacy isolation');

    // =========================================================================
    // PART 2: Clean Database Setup & P0-A Vendor Authorization & Audit Redaction
    // =========================================================================
    await applyMigrations(cleanPool, listMigrationFiles(999));
    defaultDbAdapter = cleanPool;

    const ACTORS = {
      anon: null,
      custA: { id: 'usr_cust_a', email: 'custa@sonoma.test' },
      custB: { id: 'usr_cust_b', email: 'custb@sonoma.test' },
      vaOwner: { id: 'usr_va_owner', email: 'owner-iniguez@sonoma.test' },
      vaStaff: { id: 'usr_va_staff', email: 'staff-iniguez@sonoma.test' },
      vbOwner: { id: 'usr_vb_owner', email: 'owner-mitote@sonoma.test' },
      mod: { id: 'usr_moderator', email: 'mod@sonoma.test' },
      padmin: { id: 'usr_platform_admin', email: 'padmin@sonoma.test' }
    };

    await cleanPool.query(
      `INSERT INTO platform_roles (user_id, role, granted_by) VALUES
         ($1, 'platform_admin', 'bootstrap'),
         ($2, 'moderator', $1)`,
      [ACTORS.padmin.id, ACTORS.mod.id]
    );
    await cleanPool.query(
      `INSERT INTO vendor_memberships (vendor_id, user_id, role, granted_by) VALUES
         ('iniguez', $1, 'owner', $4),
         ('iniguez', $2, 'staff', $1),
         ('mitote', $3, 'owner', $4)`,
      [ACTORS.vaOwner.id, ACTORS.vaStaff.id, ACTORS.vbOwner.id, ACTORS.padmin.id]
    );

    // P0-A(8): Self-grant and self-elevation blocked by PostgreSQL trigger
    await assert.rejects(
      () =>
        cleanPool.query(
          `INSERT INTO vendor_memberships (vendor_id, user_id, role, granted_by)
           VALUES ('mitote', $1, 'owner', $1)`,
          [ACTORS.vaOwner.id]
        ),
      /cannot grant or elevate their own vendor membership/i,
      'self-grant blocked at DB trigger level'
    );
    await assert.rejects(
      () =>
        cleanPool.query(
          `UPDATE vendor_memberships SET role = 'owner', granted_by = $1
           WHERE vendor_id = 'iniguez' AND user_id = $1`,
          [ACTORS.vaStaff.id]
        ),
      /cannot grant or elevate their own vendor membership/i,
      'self-elevation blocked at DB trigger level'
    );

    // P0-A: Unauthenticated & Customer denials + Debug header/cookie immunity
    const sensitiveRoutes = [
      ['owner/stats.js', 'GET'],
      ['owner/profile.js', 'GET'],
      ['owner/profile.js', 'POST'],
      ['owner/location.js', 'GET'],
      ['owner/location.js', 'POST'],
      ['owner/schedule.js', 'GET'],
      ['owner/schedule.js', 'POST'],
      ['owner/bookings.js', 'GET'],
      ['owner/requests.js', 'GET'],
      ['owner/requests.js', 'POST'],
      ['pager/staff.js', 'GET'],
      ['pager/staff.js', 'POST'],
      ['pager/update.js', 'POST']
    ];

    const spoofHeaders = {
      'x-truckly-debug-role': 'admin',
      cookie: 'truckly_debug_role=admin'
    };

    for (const [route, method] of sensitiveRoutes) {
      const anonRes = await callApi(route, {
        method,
        user: null,
        headers: spoofHeaders,
        query: { truck_id: 'iniguez', vendor_id: 'iniguez' },
        body: { truck_id: 'iniguez', vendor_id: 'iniguez', role: 'admin', is_admin: true }
      });
      assert.equal(anonRes.status, 401, `Anonymous ${method} ${route} with spoofed debug headers must return 401`);

      const custRes = await callApi(route, {
        method,
        user: ACTORS.custA,
        headers: spoofHeaders,
        query: { truck_id: 'iniguez', vendor_id: 'iniguez' },
        body: { truck_id: 'iniguez', vendor_id: 'iniguez', role: 'admin', user_id: ACTORS.padmin.id }
      });
      assert.equal(custRes.status, 403, `Customer ${method} ${route} with spoofed debug headers/body must return 403`);
    }

    // Vendor B sets up profile, location, schedule, pager, and receives a booking
    const eventDateB = futurePacificDate(15);
    const vbProf = await callApi('owner/profile.js', {
      method: 'POST',
      user: ACTORS.vbOwner,
      body: {
        truck_id: 'mitote',
        display_name: 'Mitote Food Park',
        cuisine: 'Mexican',
        description: 'Roseland food park',
        accepting_bookings: true
      }
    });
    assert.equal(vbProf.status, 200);

    const vbLoc = await callApi('owner/location.js', {
      method: 'POST',
      user: ACTORS.vbOwner,
      body: { truck_id: 'mitote', location: '100 Sebastopol Rd, Santa Rosa', is_open: true, opens_at: '11:00', closes_at: '21:00' }
    });
    assert.equal(vbLoc.status, 200);

    const vbSched = await callApi('owner/schedule.js', {
      method: 'POST',
      user: ACTORS.vbOwner,
      body: { truck_id: 'mitote', service_date: eventDateB, opens_at: '11:00', closes_at: '20:00', status: 'scheduled' }
    });
    assert.equal(vbSched.status, 200);

    const pagerReqKeyB = crypto.randomUUID();
    const vbPagerCreate = await callApi('pager/staff.js', {
      method: 'POST',
      user: ACTORS.vbOwner,
      body: { vendor_id: 'mitote', vendor: 'SPOOFED VENDOR NAME', ticket: '42', request_key: pagerReqKeyB }
    });
    assert.equal(vbPagerCreate.status, 201);
    assert.equal(vbPagerCreate.body.pager.vendor_id, 'mitote');
    assert.equal(vbPagerCreate.body.pager.vendor, 'Mitote Food Park', 'canonical vendor name enforced on pager');
    const pagerBId = vbPagerCreate.body.pager.id;

    const bookingBCreate = await callApi('bookings/create.js', {
      method: 'POST',
      user: ACTORS.custA,
      body: {
        truck_id: 'mitote',
        package_id: 'party',
        event_type: 'Birthday party',
        event_date: eventDateB,
        guest_count: 60,
        location: 'Courthouse Square, Santa Rosa',
        note: 'PRIVATE_DIETARY_NOTE_DO_NOT_LOG'
      }
    });
    assert.equal(bookingBCreate.status, 201);
    const bookingBId = bookingBCreate.body.id;

    // Vendor A attempts to read or modify Vendor B across every endpoint (even knowing valid UUIDs!)
    assert.equal((await callApi('owner/profile.js', { method: 'GET', user: ACTORS.vaOwner, query: { truck_id: 'mitote' }, headers: spoofHeaders })).status, 403);
    assert.equal((await callApi('owner/profile.js', { method: 'POST', user: ACTORS.vaOwner, body: { truck_id: 'mitote', display_name: 'Hijacked' } })).status, 403);
    assert.equal((await callApi('owner/location.js', { method: 'GET', user: ACTORS.vaOwner, query: { truck_id: 'mitote' } })).status, 403);
    assert.equal((await callApi('owner/location.js', { method: 'POST', user: ACTORS.vaOwner, body: { truck_id: 'mitote', location: 'Hijacked' } })).status, 403);
    assert.equal((await callApi('owner/schedule.js', { method: 'GET', user: ACTORS.vaOwner, query: { truck_id: 'mitote' } })).status, 403);
    assert.equal((await callApi('owner/schedule.js', { method: 'POST', user: ACTORS.vaOwner, body: { truck_id: 'mitote', service_date: eventDateB, status: 'unavailable' } })).status, 403);
    assert.equal((await callApi('owner/bookings.js', { method: 'GET', user: ACTORS.vaOwner, query: { truck_id: 'mitote' } })).status, 403);
    assert.equal((await callApi('owner/requests.js', { method: 'GET', user: ACTORS.vaOwner, query: { truck_id: 'mitote' } })).status, 403);
    assert.equal((await callApi('owner/stats.js', { method: 'GET', user: ACTORS.vaOwner, query: { truck_id: 'mitote' } })).status, 403);
    assert.equal((await callApi('pager/staff.js', { method: 'GET', user: ACTORS.vaOwner, query: { vendor_id: 'mitote' } })).status, 403);
    assert.equal((await callApi('pager/staff.js', { method: 'POST', user: ACTORS.vaOwner, body: { vendor_id: 'mitote', ticket: '77', request_key: crypto.randomUUID() } })).status, 403);

    // Knowing Vendor B's booking UUID or pager UUID still denies Vendor A
    assert.equal((await callApi('owner/requests.js', { method: 'POST', user: ACTORS.vaOwner, body: { id: bookingBId, status: 'accepted', truck_id: 'iniguez' } })).status, 403);
    assert.equal((await callApi('pager/update.js', { method: 'POST', user: ACTORS.vaOwner, body: { id: pagerBId, status: 'ready', vendor_id: 'iniguez' } })).status, 403);

    // Unfiltered reads by Vendor A return strictly Vendor A scope (0 Vendor B records)
    const vaStats = await callApi('owner/stats.js', { method: 'GET', user: ACTORS.vaOwner });
    assert.equal(vaStats.status, 200);
    assert.equal(vaStats.body.total_requests, 0, 'Vendor A sees 0 bookings when only Vendor B has bookings');
    assert.equal((await callApi('owner/bookings.js', { method: 'GET', user: ACTORS.vaOwner })).body.bookings.length, 0);
    assert.equal((await callApi('owner/requests.js', { method: 'GET', user: ACTORS.vaOwner })).body.requests.length, 0);
    assert.equal((await callApi('owner/schedule.js', { method: 'GET', user: ACTORS.vaOwner })).body.schedule.length, 0);
    assert.equal((await callApi('pager/staff.js', { method: 'GET', user: ACTORS.vaOwner })).body.pagers.length, 0);

    // Vendor A Staff vs Owner role differentiation
    assert.equal((await callApi('owner/location.js', { method: 'POST', user: ACTORS.vaStaff, body: { truck_id: 'iniguez', location: 'Sebastopol Rd', is_open: true } })).status, 200, 'staff can update location');
    assert.equal((await callApi('owner/schedule.js', { method: 'POST', user: ACTORS.vaStaff, body: { truck_id: 'iniguez', service_date: eventDateB, status: 'scheduled' } })).status, 200, 'staff can update schedule');
    const staffPagerRes = await callApi('pager/staff.js', { method: 'POST', user: ACTORS.vaStaff, body: { vendor_id: 'iniguez', ticket: '19', request_key: crypto.randomUUID() } });
    assert.equal(staffPagerRes.status, 201, 'staff can create vendor pager');
    assert.equal((await callApi('pager/update.js', { method: 'POST', user: ACTORS.vaStaff, body: { id: staffPagerRes.body.pager.id, status: 'almost' } })).status, 200, 'staff can advance vendor pager');

    // Staff CANNOT edit owner profile or accept/decline bookings
    assert.equal((await callApi('owner/profile.js', { method: 'POST', user: ACTORS.vaStaff, body: { truck_id: 'iniguez', display_name: 'Staff Rename' } })).status, 403, 'staff cannot edit vendor profile');

    const bookingACreate = await callApi('bookings/create.js', {
      method: 'POST',
      user: ACTORS.custA,
      body: {
        truck_id: 'iniguez',
        package_id: 'dropin',
        event_type: 'Office lunch',
        event_date: eventDateB,
        guest_count: 35,
        location: 'Downtown Santa Rosa'
      }
    });
    assert.equal(bookingACreate.status, 201);
    assert.equal(
      (await callApi('owner/requests.js', { method: 'POST', user: ACTORS.vaStaff, body: { id: bookingACreate.body.id, status: 'accepted' } })).status,
      403,
      'staff cannot accept or decline bookings'
    );

    // Platform Admin retains intentional global read + explicit-target write
    const adminGlobalStats = await callApi('owner/stats.js', { method: 'GET', user: ACTORS.padmin });
    assert.equal(adminGlobalStats.status, 200);
    assert.equal(adminGlobalStats.body.total_requests, 2, 'platform_admin sees global booking count');
    assert.equal((await callApi('owner/profile.js', { method: 'POST', user: ACTORS.padmin, body: { display_name: 'Missing Target' } })).status, 400, 'platform_admin must specify explicit vendor target on writes');

    console.log('PASS [2/6]: P0-A vendor scoping, owner vs staff RBAC, debug-header immunity, and self-grant blocks');

    // =========================================================================
    // PART 3: P0-B Booking Integrity, Pacific Boundaries, Idempotency & Races
    // =========================================================================
    // Unauthenticated & missing user.id
    assert.equal((await callApi('bookings/create.js', { method: 'POST', user: null, body: {} })).status, 401);
    assert.equal((await callApi('bookings/create.js', { method: 'POST', user: { email: 'noid@sonoma.test' }, body: {} })).status, 401);

    // Impossible calendar dates
    for (const badDate of ['2026-02-29', '2026-04-31', '2026-11-31', '2026-13-01', '2026-00-10', 'not-a-date']) {
      const r = await callApi('bookings/create.js', {
        method: 'POST',
        user: ACTORS.custA,
        body: { truck_id: 'iniguez', package_id: 'dropin', event_type: 'Party', event_date: badDate, guest_count: 25, location: 'Santa Rosa' }
      });
      assert.equal(r.status, 400, `Impossible date ${badDate} must return 400`);
      const av = await callApi('trucks/availability.js', { method: 'GET', query: { truck_id: 'iniguez', date: badDate } });
      assert.equal(av.status, 400, `Availability must reject impossible date ${badDate}`);
    }

    // Pacific-time midnight boundary verification
    // 2026-11-16T23:30:00-08:00 is 2026-11-17T07:30:00Z (already Nov 17 in UTC, still Nov 16 in America/Los_Angeles!)
    const lateNightPacific = new Date('2026-11-16T23:30:00-08:00');
    const sameDayPacificRes = await callApi('bookings/create.js', {
      method: 'POST',
      user: ACTORS.custA,
      _now: lateNightPacific,
      body: { truck_id: 'iniguez', package_id: 'dropin', event_type: 'Lunch', event_date: '2026-11-16', guest_count: 20, location: 'Santa Rosa' }
    });
    assert.equal(sameDayPacificRes.status, 400, 'Same-day Pacific date rejected');

    const tomorrowPacificRes = await callApi('bookings/create.js', {
      method: 'POST',
      user: ACTORS.custA,
      _now: lateNightPacific,
      body: { truck_id: 'iniguez', package_id: 'dropin', event_type: 'Lunch', event_date: '2026-11-17', guest_count: 20, location: 'Santa Rosa' }
    });
    assert.equal(tomorrowPacificRes.status, 201, 'Tomorrow in Pacific time (23:30 PST -> next calendar day) is allowed');

    // 35 minutes later: 2026-11-17T00:05:00-08:00 -> 2026-11-17 is now same-day in Pacific time and must be rejected!
    const justAfterMidnightPacific = new Date('2026-11-17T00:05:00-08:00');
    const afterMidnightRes = await callApi('bookings/create.js', {
      method: 'POST',
      user: ACTORS.custA,
      _now: justAfterMidnightPacific,
      body: { truck_id: 'iniguez', package_id: 'dropin', event_type: 'Lunch', event_date: '2026-11-17', guest_count: 20, location: 'Santa Rosa' }
    });
    assert.equal(afterMidnightRes.status, 400, 'After Pacific midnight, 2026-11-17 becomes same-day and is rejected');

    // Unknown vendor, non-bookable cafe place, and spoofed vendor/package terms
    const validFuture = futurePacificDate(20);
    assert.equal(
      (await callApi('bookings/create.js', {
        method: 'POST',
        user: ACTORS.custA,
        body: { truck_id: 'invented-truck', package_id: 'dropin', event_type: 'Lunch', event_date: validFuture, guest_count: 20, location: 'Santa Rosa' }
      })).status,
      400,
      'unknown vendor rejected'
    );
    assert.equal(
      (await callApi('bookings/create.js', {
        method: 'POST',
        user: ACTORS.custA,
        body: { truck_id: 'coffee-crooks', package_id: 'dropin', event_type: 'Coffee bar', event_date: validFuture, guest_count: 20, location: 'Santa Rosa' }
      })).status,
      400,
      'non-bookable neighborhood listing rejected'
    );

    const spoofedTermsRes = await callApi('bookings/create.js', {
      method: 'POST',
      user: ACTORS.custA,
      body: {
        truck_id: 'iniguez',
        truck_name: 'COMPLETELY FAKE TRUCK NAME',
        package_id: 'festival',
        package_name: 'Free Promo',
        package_price: 1,
        event_type: 'Community event',
        event_date: validFuture,
        guest_count: 180,
        location: 'Petaluma Fairgrounds',
        requester: 'spoofed-victim@sonoma.test'
      }
    });
    assert.equal(spoofedTermsRes.status, 201);
    assert.equal(spoofedTermsRes.body.truck_name, 'Tacos Iñiguez', 'spoofed truck_name overwritten by canonical vendor name');
    assert.equal(spoofedTermsRes.body.package_name, 'Full Festival', 'spoofed package_name overwritten on server');
    assert.equal(spoofedTermsRes.body.package_price, 2900, 'spoofed package_price overwritten on server');

    // Invalid package IDs, guest counts, and text bounds
    for (const badBody of [
      { truck_id: 'iniguez', package_id: 'platinum', event_type: 'Party', event_date: validFuture, guest_count: 25, location: 'Santa Rosa' },
      { truck_id: 'iniguez', package_id: 'dropin', event_type: 'Party', event_date: validFuture, guest_count: 9, location: 'Santa Rosa' },
      { truck_id: 'iniguez', package_id: 'dropin', event_type: 'Party', event_date: validFuture, guest_count: 51, location: 'Santa Rosa' },
      { truck_id: 'iniguez', package_id: 'party', event_type: 'Party', event_date: validFuture, guest_count: 101, location: 'Santa Rosa' },
      { truck_id: 'iniguez', package_id: 'festival', event_type: 'Party', event_date: validFuture, guest_count: 251, location: 'Santa Rosa' },
      { truck_id: 'iniguez', package_id: 'dropin', event_type: 'Party', event_date: validFuture, guest_count: 20.5, location: 'Santa Rosa' },
      { truck_id: 'iniguez', package_id: 'dropin', event_type: ' ', event_date: validFuture, guest_count: 20, location: 'Santa Rosa' },
      { truck_id: 'iniguez', package_id: 'dropin', event_type: 'Party', event_date: validFuture, guest_count: 20, location: 'AB' }
    ]) {
      assert.equal((await callApi('bookings/create.js', { method: 'POST', user: ACTORS.custA, body: badBody })).status, 400);
    }

    // Explicitly unavailable schedule date & disabled accepting_bookings block booking creation (409)
    const blockedDate = futurePacificDate(22);
    await callApi('owner/schedule.js', {
      method: 'POST',
      user: ACTORS.vaOwner,
      body: { truck_id: 'iniguez', service_date: blockedDate, status: 'unavailable' }
    });
    const availUnavail = await callApi('trucks/availability.js', { method: 'GET', query: { truck_id: 'iniguez', date: blockedDate } });
    assert.equal(availUnavail.body.requestable, false);
    assert.equal(availUnavail.body.reason, 'date_unavailable');
    assert.equal(
      (await callApi('bookings/create.js', {
        method: 'POST',
        user: ACTORS.custA,
        body: { truck_id: 'iniguez', package_id: 'dropin', event_type: 'Party', event_date: blockedDate, guest_count: 20, location: 'Santa Rosa' }
      })).status,
      409,
      'unavailable schedule date blocks booking creation with 409'
    );

    // Pause accepting_bookings on iniguez
    await callApi('owner/profile.js', {
      method: 'POST',
      user: ACTORS.vaOwner,
      body: { truck_id: 'iniguez', display_name: 'Tacos Iñiguez', accepting_bookings: false }
    });
    assert.equal(
      (await callApi('bookings/create.js', {
        method: 'POST',
        user: ACTORS.custA,
        body: { truck_id: 'iniguez', package_id: 'dropin', event_type: 'Party', event_date: validFuture, guest_count: 20, location: 'Santa Rosa' }
      })).status,
      409,
      'disabled accepting_bookings blocks booking creation with 409'
    );
    // Re-enable accepting_bookings
    await callApi('owner/profile.js', {
      method: 'POST',
      user: ACTORS.vaOwner,
      body: { truck_id: 'iniguez', display_name: 'Tacos Iñiguez', accepting_bookings: true }
    });

    // Idempotency: concurrent retries + sequential replay + conflicting payload detection
    const idemKey = 'idem-concurrent-' + crypto.randomUUID();
    const idemPayload = {
      truck_id: 'iniguez',
      package_id: 'party',
      event_type: 'Wedding welcome',
      event_date: futurePacificDate(25),
      guest_count: 80,
      location: 'Healdsburg Plaza'
    };

    const concurrentIdemResults = await Promise.all(
      Array.from({ length: 5 }, () =>
        callApi('bookings/create.js', {
          method: 'POST',
          user: ACTORS.custB,
          headers: { 'Idempotency-Key': idemKey },
          body: idemPayload
        })
      )
    );
    const createdCount = concurrentIdemResults.filter(r => r.status === 201).length;
    const replayCount = concurrentIdemResults.filter(r => r.status === 200 && r.body.idempotent_replay === true).length;
    assert.equal(createdCount, 1, 'exactly 1 concurrent request inserted the booking');
    assert.equal(replayCount, 4, 'other 4 concurrent retries received 200 idempotent replay');
    const uniqueIds = new Set(concurrentIdemResults.map(r => r.body.id));
    assert.equal(uniqueIds.size, 1, 'all concurrent retries resolved to the exact same booking UUID');

    const dbCountIdem = await cleanPool.query(
      'SELECT count(*)::int AS c FROM bookings WHERE requester_user_id = $1 AND idempotency_key = $2',
      [ACTORS.custB.id, idemKey]
    );
    assert.equal(dbCountIdem.rows[0].c, 1, 'only 1 row persisted in PostgreSQL');

    // Reusing same Idempotency-Key with modified guest_count returns 409
    const idemConflictRes = await callApi('bookings/create.js', {
      method: 'POST',
      user: ACTORS.custB,
      headers: { 'Idempotency-Key': idemKey },
      body: { ...idemPayload, guest_count: 85 }
    });
    assert.equal(idemConflictRes.status, 409, 'reused idempotency_key with altered payload returns 409');

    // Requester A vs Requester B booking history isolation
    const listA = await callApi('bookings/list.js', { method: 'GET', user: ACTORS.custA });
    const listB = await callApi('bookings/list.js', { method: 'GET', user: ACTORS.custB });
    assert(listA.body.bookings.length >= 3);
    assert.equal(listB.body.bookings.length, 1);
    assert(!listA.body.bookings.some(b => b.id === listB.body.bookings[0].id), 'Requester A never sees Requester B bookings');
    assert(!listB.body.bookings.some(b => listA.body.bookings.map(x => x.id).includes(b.id)), 'Requester B never sees Requester A bookings');

    // Atomic acceptance & concurrent status transition race on real Postgres connections
    const targetBookingId = listB.body.bookings[0].id;
    // First mark that booking's date unavailable -> acceptance must fail with 409!
    await callApi('owner/schedule.js', {
      method: 'POST',
      user: ACTORS.vaOwner,
      body: { truck_id: 'iniguez', service_date: idemPayload.event_date, status: 'unavailable' }
    });
    assert.equal(
      (await callApi('owner/requests.js', { method: 'POST', user: ACTORS.vaOwner, body: { id: targetBookingId, status: 'accepted' } })).status,
      409,
      'cannot accept booking when date is marked unavailable'
    );

    // Restore date to scheduled, then race concurrent accept + decline on real pg.Pool!
    await callApi('owner/schedule.js', {
      method: 'POST',
      user: ACTORS.vaOwner,
      body: { truck_id: 'iniguez', service_date: idemPayload.event_date, status: 'scheduled' }
    });
    const [raceRes1, raceRes2] = await Promise.all([
      callApi('owner/requests.js', { method: 'POST', user: ACTORS.vaOwner, body: { id: targetBookingId, status: 'accepted' } }),
      callApi('owner/requests.js', { method: 'POST', user: ACTORS.vaOwner, body: { id: targetBookingId, status: 'declined' } })
    ]);
    const statuses = [raceRes1.status, raceRes2.status].sort();
    assert.deepEqual(statuses, [200, 409], 'FOR UPDATE row lock ensures exactly one transition wins (200) and the other gets 409');

    // Repeated transition from terminal state fails with 409 (and DB trigger also blocks direct SQL mutation)
    assert.equal(
      (await callApi('owner/requests.js', { method: 'POST', user: ACTORS.vaOwner, body: { id: targetBookingId, status: 'accepted' } })).status,
      409
    );
    await assert.rejects(
      () => cleanPool.query("UPDATE bookings SET status = 'pending' WHERE id = $1", [targetBookingId]),
      /cannot transition from terminal state/i,
      'PostgreSQL trigger blocks terminal status reversal'
    );

    // Simulated DB failure during booking creation fails closed (503) with zero partial bookings
    const beforeFailCount = (await cleanPool.query('SELECT count(*)::int AS c FROM bookings')).rows[0].c;
    const brokenDb = {
      async connect() {
        return {
          async query(sql) {
            if (/BEGIN|ROLLBACK/i.test(sql)) return { rows: [] };
            if (/FROM owner_schedule/i.test(sql)) throw new Error('Simulated schedule read outage');
            return cleanPool.query(sql, arguments[1]);
          },
          release() {}
        };
      }
    };
    const failClosedRes = await callApi('bookings/create.js', {
      method: 'POST',
      user: ACTORS.custA,
      dbOverride: brokenDb,
      body: {
        truck_id: 'iniguez',
        package_id: 'dropin',
        event_type: 'Office lunch',
        event_date: futurePacificDate(30),
        guest_count: 25,
        location: 'Santa Rosa Plaza'
      }
    });
    assert.equal(failClosedRes.status, 503, 'DB failure during availability read returns 503 instead of permitting booking');
    const afterFailCount = (await cleanPool.query('SELECT count(*)::int AS c FROM bookings')).rows[0].c;
    assert.equal(afterFailCount, beforeFailCount, 'zero partial bookings written when DB availability check fails');

    console.log('PASS [3/6]: P0-B Pacific calendar boundaries, server package resolution, idempotency, row-locked races, and fail-closed DB errors');

    // =========================================================================
    // PART 4: P0-C Community Privacy, Forced RLS, Direct Table Checks & Audit Redaction
    // =========================================================================
    const tomlRaw = fs.readFileSync(path.join(ROOT, 'hatchable.toml'), 'utf8');
    assert(!tomlRaw.includes('community_reviews'), 'direct community_reviews table exposure removed from hatchable.toml');

    // Anonymous cannot post; authors cannot spoof author_id or set moderation fields
    assert.equal((await callApi('community/post.js', { method: 'POST', user: null, body: {} })).status, 401);
    assert.equal(
      (await callApi('community/post.js', {
        method: 'POST',
        user: ACTORS.custA,
        body: {
          kind: 'review',
          place_id: 'mitote',
          title: 'Self approved post',
          body: 'Trying to publish immediately without moderation!',
          rating: 5,
          status: 'approved'
        }
      })).status,
      403,
      'author cannot set status=approved on submission'
    );
    assert.equal(
      (await callApi('community/post.js', {
        method: 'POST',
        user: ACTORS.custA,
        body: {
          kind: 'tip',
          place_id: 'mitote',
          title: 'Spoofed author post',
          body: 'Trying to attribute my post to another user ID!',
          author_id: ACTORS.custB.id
        }
      })).status,
      403,
      'author cannot spoof another author_id'
    );

    // Create 2 legitimate submissions (Customer A and Customer B)
    const postARes = await callApi('community/post.js', {
      method: 'POST',
      user: ACTORS.custA,
      body: {
        kind: 'review',
        place_id: 'mitote',
        place_name: 'SPOOFED PLACE NAME',
        town: 'SPOOFED TOWN',
        nickname: 'Alex',
        title: 'Fantastic birria tacos',
        body: 'Crisp tortillas, rich consomé, and plenty of shaded picnic tables.',
        rating: 5
      }
    });
    assert.equal(postARes.status, 201);
    assert.equal(postARes.body.submission.status, 'pending');
    const postAId = postARes.body.submission.id;

    const postBRes = await callApi('community/post.js', {
      method: 'POST',
      user: ACTORS.custB,
      body: {
        kind: 'whisper',
        place_id: 'elroys',
        nickname: 'Jordan',
        title: 'Late afternoon salsa batch',
        body: 'Heard they bring out a fresh roasted habanero salsa around 3pm on Fridays.'
      }
    });
    assert.equal(postBRes.status, 201);
    const postBId = postBRes.body.submission.id;

    // While pending: BOTH API `/api/community/list` AND direct SQL `SELECT * FROM community_reviews` return 0 rows!
    const publicBeforeMod = await callApi('community/list.js', { method: 'GET' });
    assert.equal(publicBeforeMod.status, 200);
    assert.equal(publicBeforeMod.body.posts.length, 0, 'pending posts never appear in public list');

    const directTableNoGuc = await cleanPool.query('SELECT * FROM community_reviews');
    assert.equal(directTableNoGuc.rows.length, 0, 'FORCE ROW LEVEL SECURITY hides pending posts on direct table SELECT');

    // Author A sees ONLY own submission via `/api/community/mine`
    const mineA = await callApi('community/mine.js', { method: 'GET', user: ACTORS.custA });
    assert.equal(mineA.status, 200);
    assert.equal(mineA.body.submissions.length, 1);
    assert.equal(mineA.body.submissions[0].id, postAId);
    assert.equal(mineA.body.submissions[0].place_name, 'Mitote Food Park', 'canonical place_name stored instead of spoofed input');

    // Direct SQL with Author A session GUC cannot self-approve (RLS blocks UPDATE -> 0 rows) or spoof Author B (RLS/trigger rejects INSERT)
    const authorClient = await cleanPool.connect();
    try {
      await authorClient.query('BEGIN');
      await authorClient.query("SELECT set_config('app.user_id', $1, true)", [ACTORS.custA.id]);
      const selfApproveAttempt = await authorClient.query(
        "UPDATE community_reviews SET status = 'approved', moderated_at = now(), moderated_by = $1 WHERE id = $2 RETURNING id",
        [ACTORS.custA.id, postAId]
      );
      assert.equal(selfApproveAttempt.rowCount, 0, 'FORCE RLS blocks author from updating moderation fields on own submission');
      const verifyStillPending = await authorClient.query(
        'SELECT status, moderated_by, moderated_at FROM community_reviews WHERE id = $1',
        [postAId]
      );
      assert.equal(verifyStillPending.rows[0].status, 'pending', 'submission remains pending after direct SQL self-approve attempt');
      assert.equal(verifyStillPending.rows[0].moderated_by, null);

      await assert.rejects(
        () =>
          authorClient.query(
            `INSERT INTO community_reviews (author_id, nickname, kind, place_id, place_name, town, title, body, status)
             VALUES ($1, 'Spoof', 'tip', 'mitote', 'Mitote', 'Santa Rosa', 'Spoofed', 'Spoofing another user directly in SQL', 'pending')`,
            [ACTORS.custB.id]
          ),
        /Cannot spoof author_id|row-level security/i,
        'author cannot spoof author_id via direct SQL INSERT'
      );
      await authorClient.query('ROLLBACK');
    } finally {
      authorClient.release();
    }

    // Vendor owners & staff DO NOT inherit community moderation privileges!
    assert.equal((await callApi('community/moderate.js', { method: 'GET', user: ACTORS.custA })).status, 403);
    assert.equal((await callApi('community/moderate.js', { method: 'GET', user: ACTORS.vaOwner })).status, 403, 'vendor owner cannot view moderation queue');
    assert.equal((await callApi('community/moderate.js', { method: 'POST', user: ACTORS.vaOwner, body: { id: postAId, status: 'approved' } })).status, 403, 'vendor owner cannot moderate posts');
    assert.equal((await callApi('community/moderate.js', { method: 'POST', user: ACTORS.vaStaff, body: { id: postAId, status: 'approved' } })).status, 403, 'vendor staff cannot moderate posts');

    // Authorized Moderator approves post A and rejects post B
    const modQueue = await callApi('community/moderate.js', { method: 'GET', user: ACTORS.mod });
    assert.equal(modQueue.status, 200);
    assert.equal(modQueue.body.pending.length, 2);

    const approveRes = await callApi('community/moderate.js', {
      method: 'POST',
      user: ACTORS.mod,
      body: { id: postAId, status: 'approved' }
    });
    assert.equal(approveRes.status, 200);

    const rejectRes = await callApi('community/moderate.js', {
      method: 'POST',
      user: ACTORS.mod,
      body: { id: postBId, status: 'rejected' }
    });
    assert.equal(rejectRes.status, 200);

    // Re-moderating an already-decided post returns 409
    assert.equal(
      (await callApi('community/moderate.js', { method: 'POST', user: ACTORS.mod, body: { id: postAId, status: 'rejected' } })).status,
      409
    );

    // Verify public feed & direct SQL visibility after moderation
    const publicAfterMod = await callApi('community/list.js', { method: 'GET' });
    assert.equal(publicAfterMod.status, 200);
    assert.equal(publicAfterMod.body.posts.length, 1, 'only approved post is public; rejected post remains hidden');
    const pubPost = publicAfterMod.body.posts[0];
    assert.equal(pubPost.id, postAId);
    assert.equal('author_id' in pubPost, false, 'author_id omitted from public payload');
    assert.equal('status' in pubPost, false, 'status omitted from public payload');
    assert.equal('moderated_by' in pubPost, false, 'moderated_by omitted from public payload');
    assert.equal('moderated_at' in pubPost, false, 'moderated_at omitted from public payload');

    const directTableAfterMod = await cleanPool.query('SELECT id, status FROM community_reviews');
    assert.equal(directTableAfterMod.rows.length, 1, 'direct table SELECT without GUC sees strictly approved row, hiding rejected row');
    assert.equal(directTableAfterMod.rows[0].id, postAId);

    // Verify Audit Logs recorded privileged mutations and REDACTED all private tokens & notes
    const auditRes = await cleanPool.query('SELECT * FROM audit_logs ORDER BY created_at ASC');
    const actions = new Set(auditRes.rows.map(r => r.action));
    for (const expectedAction of [
      'profile.update',
      'location.update',
      'schedule.upsert',
      'pager.create',
      'pager.status_transition',
      'community.approve',
      'community.reject'
    ]) {
      assert(actions.has(expectedAction), `audit_logs recorded ${expectedAction}`);
    }
    assert(actions.has('booking.accept') || actions.has('booking.decline'), 'audit_logs recorded booking decision');

    const serializedAudit = JSON.stringify(auditRes.rows);
    assert(!serializedAudit.includes(pagerBId), 'raw private pager UUID token is never written to audit_logs');
    assert(!serializedAudit.includes(staffPagerRes.body.pager.id), 'staff pager bearer UUID is never written to audit_logs');
    assert(!serializedAudit.includes(pagerReqKeyB), 'pager request_key is never written to audit_logs');
    assert(!serializedAudit.includes('PRIVATE_DIETARY_NOTE_DO_NOT_LOG'), 'private booking notes are never written to audit_logs');

    console.log('PASS [4/6]: P0-C community privacy, FORCE ROW LEVEL SECURITY, moderator separation, and redacted audit logging');

    // =========================================================================
    // PART 5: Follow-up Review Regressions — Date Serialization, Concurrent
    //         Pager Idempotency, Runtime Role Tightening & GUC Non-Leakage
    // =========================================================================

    // 5a. Date-only Contract & Serialization (String vs JS Date, Dec 20 2026, Replay, Timezone Offsets)
    const datesMod = await import(pathToFileURL(path.join(ROOT, 'lib', 'dates.js')).href);
    const createMod = await getRoute('bookings/create.js');
    const authzMod = await import(pathToFileURL(path.join(ROOT, 'lib', 'authz.js')).href);

    // Exact Dec 20, 2026 regression check (previously String(new Date(2026, 11, 20)).slice(0, 10) -> "Sun Dec 20")
    const localDec20 = new Date(2026, 11, 20);
    const utcDec20 = new Date('2026-12-20');
    assert.equal(datesMod.normalizeCalendarDate('2026-12-20'), '2026-12-20');
    assert.equal(datesMod.normalizeCalendarDate(localDec20), '2026-12-20', 'local-midnight JS Date formats to YYYY-MM-DD (never "Sun Dec 20")');
    assert.equal(datesMod.normalizeCalendarDate(utcDec20), '2026-12-20', 'UTC-midnight JS Date formats to YYYY-MM-DD without PST day-shift');
    assert.throws(
      () => datesMod.normalizeCalendarDate(new Date('2026-12-20T15:45:00Z')),
      TypeError,
      'non-midnight timestamp Date rejected rather than guessed'
    );

    // FormatBookingResponse with both Date and string adapter values
    const baseSampleRow = {
      id: '00000000-0000-4000-8000-000000000099',
      truck_id: 'iniguez',
      truck_name: 'Tacos Iñiguez',
      event_type: 'Holiday party',
      guest_count: 40,
      location: 'Santa Rosa',
      package_id: 'dropin',
      package_name: 'Neighborhood Drop-in',
      package_price: 750,
      status: 'pending',
      created_at: '2026-11-16T20:00:00Z'
    };
    assert.equal(createMod.formatBookingResponse({ ...baseSampleRow, event_date: localDec20 }, false).event_date, '2026-12-20');
    assert.equal(createMod.formatBookingResponse({ ...baseSampleRow, event_date: utcDec20 }, true).event_date, '2026-12-20');
    assert.equal(createMod.formatBookingResponse({ ...baseSampleRow, event_date: '2026-12-20' }, false).event_date, '2026-12-20');

    // Verify positive & negative host timezone boundaries (`TZ=Asia/Tokyo` UTC+9 and `TZ=America/Los_Angeles` UTC-8)
    for (const tz of ['Asia/Tokyo', 'America/Los_Angeles', 'UTC']) {
      const tzOut = execFileSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `import { normalizeCalendarDate } from ${JSON.stringify(pathToFileURL(path.join(ROOT, 'lib', 'dates.js')).href)};
           const a = normalizeCalendarDate(new Date(2026, 11, 20));
           const b = normalizeCalendarDate(new Date('2026-12-20'));
           const c = normalizeCalendarDate('2026-12-20');
           process.stdout.write(JSON.stringify([a, b, c]));`
        ],
        { env: { ...process.env, TZ: tz }, encoding: 'utf8', windowsHide: true }
      );
      assert.deepEqual(JSON.parse(tzOut), ['2026-12-20', '2026-12-20', '2026-12-20'], `Date normalization invariant holds under TZ=${tz}`);
    }

    // End-to-end PostgreSQL creation + idempotent replay + list + owner views + schedule + audit metadata for 2026-12-20
    const dec20Now = new Date('2026-11-16T12:00:00-08:00');
    const dec20IdemKey = 'idem-dec20-' + crypto.randomUUID();
    const dec20Create = await callApi('bookings/create.js', {
      method: 'POST',
      user: ACTORS.custA,
      _now: dec20Now,
      headers: { 'Idempotency-Key': dec20IdemKey },
      body: {
        truck_id: 'mitote',
        package_id: 'dropin',
        event_type: 'Winter gathering',
        event_date: '2026-12-20',
        guest_count: 30,
        location: '100 Sebastopol Rd, Santa Rosa'
      }
    });
    assert.equal(dec20Create.status, 201);
    assert.equal(dec20Create.body.event_date, '2026-12-20', 'created booking event_date is strict YYYY-MM-DD');

    const dec20Replay = await callApi('bookings/create.js', {
      method: 'POST',
      user: ACTORS.custA,
      _now: dec20Now,
      headers: { 'Idempotency-Key': dec20IdemKey },
      body: {
        truck_id: 'mitote',
        package_id: 'dropin',
        event_type: 'Winter gathering',
        event_date: '2026-12-20',
        guest_count: 30,
        location: '100 Sebastopol Rd, Santa Rosa'
      }
    });
    assert.equal(dec20Replay.status, 200);
    assert.equal(dec20Replay.body.idempotent_replay, true);
    assert.equal(dec20Replay.body.event_date, '2026-12-20', 'idempotent replay event_date is strict YYYY-MM-DD');

    // Adapter wrapper returning raw JavaScript Date objects for event_date / service_date
    const dateObjectAdapter = {
      async query(sql, params) {
        const res = await cleanPool.query(sql, params);
        return {
          ...res,
          rows: res.rows.map(r => {
            const copy = { ...r };
            if (typeof copy.event_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(copy.event_date)) {
              const [y, m, d] = copy.event_date.split('-').map(Number);
              copy.event_date = new Date(y, m - 1, d);
            }
            if (typeof copy.service_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(copy.service_date)) {
              const [y, m, d] = copy.service_date.split('-').map(Number);
              copy.service_date = new Date(y, m - 1, d);
            }
            return copy;
          })
        };
      },
      async connect() {
        const c = await cleanPool.connect();
        return {
          async query(sql, params) {
            const res = await c.query(sql, params);
            return {
              ...res,
              rows: (res.rows || []).map(r => {
                const copy = { ...r };
                if (typeof copy.event_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(copy.event_date)) {
                  const [y, m, d] = copy.event_date.split('-').map(Number);
                  copy.event_date = new Date(y, m - 1, d);
                }
                if (typeof copy.service_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(copy.service_date)) {
                  const [y, m, d] = copy.service_date.split('-').map(Number);
                  copy.service_date = new Date(y, m - 1, d);
                }
                return copy;
              })
            };
          },
          release() {
            c.release();
          }
        };
      }
    };

    const dec20DateAdapterReplay = await callApi('bookings/create.js', {
      method: 'POST',
      user: ACTORS.custA,
      _now: dec20Now,
      dbOverride: dateObjectAdapter,
      headers: { 'Idempotency-Key': dec20IdemKey },
      body: {
        truck_id: 'mitote',
        package_id: 'dropin',
        event_type: 'Winter gathering',
        event_date: '2026-12-20',
        guest_count: 30,
        location: '100 Sebastopol Rd, Santa Rosa'
      }
    });
    assert.equal(dec20DateAdapterReplay.status, 200);
    assert.equal(dec20DateAdapterReplay.body.event_date, '2026-12-20', 'Date-returning DB adapter still serializes YYYY-MM-DD');

    const custListDates = await callApi('bookings/list.js', { method: 'GET', user: ACTORS.custA, dbOverride: dateObjectAdapter });
    assert(custListDates.body.bookings.every(b => /^\d{4}-\d{2}-\d{2}$/.test(b.event_date)), 'bookings/list returns strict YYYY-MM-DD');

    const ownerPendingDates = await callApi('owner/requests.js', { method: 'GET', user: ACTORS.vbOwner, dbOverride: dateObjectAdapter });
    assert(ownerPendingDates.body.requests.every(b => /^\d{4}-\d{2}-\d{2}$/.test(b.event_date)), 'owner/requests GET returns strict YYYY-MM-DD');

    const acceptDec20 = await callApi('owner/requests.js', {
      method: 'POST',
      user: ACTORS.vbOwner,
      dbOverride: dateObjectAdapter,
      body: { id: dec20Create.body.id, status: 'accepted' }
    });
    assert.equal(acceptDec20.status, 200);
    const dec20Audit = await cleanPool.query(
      "SELECT metadata FROM audit_logs WHERE target_type = 'booking' AND target_id = $1",
      [dec20Create.body.id]
    );
    assert.equal(dec20Audit.rows[0].metadata.event_date, '2026-12-20', 'audit_logs booking event_date is strict YYYY-MM-DD');

    const ownerAllDates = await callApi('owner/bookings.js', { method: 'GET', user: ACTORS.vbOwner, dbOverride: dateObjectAdapter });
    assert(ownerAllDates.body.bookings.every(b => /^\d{4}-\d{2}-\d{2}$/.test(b.event_date)), 'owner/bookings returns strict YYYY-MM-DD');

    const schedDec20 = await callApi('owner/schedule.js', {
      method: 'POST',
      user: ACTORS.vbOwner,
      dbOverride: dateObjectAdapter,
      body: { truck_id: 'mitote', service_date: futurePacificDate(40), opens_at: '11:00', closes_at: '19:00', status: 'scheduled' }
    });
    assert.equal(schedDec20.status, 200);
    assert.match(schedDec20.body.service_date, /^\d{4}-\d{2}-\d{2}$/, 'owner/schedule POST returns strict YYYY-MM-DD');
    const schedListDates = await callApi('owner/schedule.js', { method: 'GET', user: ACTORS.vbOwner, dbOverride: dateObjectAdapter });
    assert(schedListDates.body.schedule.every(s => /^\d{4}-\d{2}-\d{2}$/.test(s.service_date)), 'owner/schedule GET returns strict YYYY-MM-DD');
    const availDates = await callApi('trucks/availability.js', {
      method: 'GET',
      dbOverride: dateObjectAdapter,
      query: { truck_id: 'mitote', date: schedDec20.body.service_date }
    });
    assert.equal(availDates.body.schedule.service_date, schedDec20.body.service_date, 'availability schedule.service_date is strict YYYY-MM-DD');

    // 5b. Concurrent Pager Creation Idempotency & Cross-Vendor Non-Disclosure
    const concurrentPagerKey = crypto.randomUUID();
    const concurrentPagerCalls = await Promise.all(
      Array.from({ length: 5 }, () =>
        callApi('pager/staff.js', {
          method: 'POST',
          user: ACTORS.vaOwner,
          body: { vendor_id: 'iniguez', ticket: '88', request_key: concurrentPagerKey }
        })
      )
    );
    assert(concurrentPagerCalls.every(r => r.status === 201 || r.status === 200), 'no concurrent pager creation failed with 503');
    assert.equal(concurrentPagerCalls.filter(r => r.status === 201).length, 1, 'exactly 1 concurrent pager request returned 201');
    assert.equal(
      concurrentPagerCalls.filter(r => r.status === 200 && r.body.idempotent_replay === true).length,
      4,
      'remaining 4 concurrent pager requests returned 200 idempotent replay'
    );
    const pagerIdsSet = new Set(concurrentPagerCalls.map(r => r.body.pager.id));
    assert.equal(pagerIdsSet.size, 1, 'all 5 concurrent calls returned the identical pager ticket UUID');
    const canonicalPagerId = concurrentPagerCalls[0].body.pager.id;

    const persistedPagerRows = await cleanPool.query(
      'SELECT id, vendor_id, ticket FROM pickup_pagers WHERE request_key = $1',
      [concurrentPagerKey]
    );
    assert.equal(persistedPagerRows.rows.length, 1, 'strictly 1 pager ticket persisted in PostgreSQL');

    const pagerAuditRows = await cleanPool.query(
      "SELECT * FROM audit_logs WHERE action = 'pager.create' AND target_id = $1",
      [authzMod.redactPagerTargetId(canonicalPagerId)]
    );
    assert.equal(pagerAuditRows.rows.length, 1, 'strictly 1 pager.create audit event recorded across 5 concurrent retries');

    // Same-vendor conflicting ticket parameter on existing request_key -> 409
    const sameVendorMismatch = await callApi('pager/staff.js', {
      method: 'POST',
      user: ACTORS.vaOwner,
      body: { vendor_id: 'iniguez', ticket: '99-DIFFERENT', request_key: concurrentPagerKey }
    });
    assert.equal(sameVendorMismatch.status, 409, 'reused request_key with mismatched ticket returns 409');
    assert.equal('pager' in sameVendorMismatch.body, false);

    // Simultaneous cross-vendor race with identical request_key -> 1 wins (201), other gets controlled 409 without leaking winner's pager!
    const crossVendorKey = crypto.randomUUID();
    const [crossA, crossB] = await Promise.all([
      callApi('pager/staff.js', {
        method: 'POST',
        user: ACTORS.vaOwner,
        body: { vendor_id: 'iniguez', ticket: '51', request_key: crossVendorKey }
      }),
      callApi('pager/staff.js', {
        method: 'POST',
        user: ACTORS.vbOwner,
        body: { vendor_id: 'mitote', ticket: '51', request_key: crossVendorKey }
      })
    ]);
    const crossWinner = crossA.status === 201 ? crossA : crossB;
    const crossLoser = crossA.status === 201 ? crossB : crossA;
    assert.equal(crossWinner.status, 201, 'one vendor wins the cross-vendor request_key race');
    assert.equal(crossLoser.status, 409, 'other vendor receives controlled 409 conflict');
    assert.equal('pager' in crossLoser.body, false, '409 response omits pager object');
    assert(!JSON.stringify(crossLoser.body).includes(crossWinner.body.pager.id), 'other vendor private pager UUID never leaked on conflict');
    assert.equal(
      (await cleanPool.query('SELECT count(*)::int AS c FROM pickup_pagers WHERE request_key = $1', [crossVendorKey])).rows[0].c,
      1,
      'only 1 pager persisted in cross-vendor key race'
    );
    assert.equal(
      (
        await cleanPool.query("SELECT count(*)::int AS c FROM audit_logs WHERE action = 'pager.create' AND target_id = $1", [
          authzMod.redactPagerTargetId(crossWinner.body.pager.id)
        ])
      ).rows[0].c,
      1,
      'only 1 pager.create audit log written in cross-vendor key race'
    );

    // 5c. Unverified runtime user.role/is_admin fields do NOT grant platform_admin
    const unverifiedRoleClaim = await callApi('owner/stats.js', {
      method: 'GET',
      user: { id: ACTORS.custA.id, email: ACTORS.custA.email, role: 'admin', is_admin: true }
    });
    assert.equal(unverifiedRoleClaim.status, 403, 'runtime user.role/is_admin fields do not grant platform_admin without platform_roles/env');

    // 5d. Single-Connection Pool (`max: 1`) Transaction-Local GUC Non-Leakage Proof
    singleConnPool = new Pool({
      connectionString: buildDbUrl(pgServer.adminUrl, { user: appRole, password: appPass, database: cleanDbName }),
      max: 1
    });
    const pidBefore = (await singleConnPool.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;

    // Run moderator GET (sets app.can_moderate = 'true' and app.user_id via set_config(..., true) and COMMITs)
    const modOnSingleConn = await callApi('community/moderate.js', {
      method: 'GET',
      user: ACTORS.mod,
      dbOverride: singleConnPool
    });
    assert.equal(modOnSingleConn.status, 200);

    // Also run a transaction on the same single connection that sets both GUCs and ROLLBACKs
    const c1 = await singleConnPool.connect();
    try {
      await c1.query('BEGIN');
      await c1.query("SELECT set_config('app.can_moderate', 'true', true), set_config('app.user_id', $1, true)", [ACTORS.padmin.id]);
      await c1.query('ROLLBACK');
    } finally {
      c1.release();
    }

    // Immediately inspect the exact same backend connection without setting GUCs
    const afterCheck = await singleConnPool.query(
      "SELECT pg_backend_pid() AS pid, COALESCE(current_setting('app.can_moderate', true), '') AS mod, COALESCE(current_setting('app.user_id', true), '') AS uid"
    );
    assert.equal(afterCheck.rows[0].pid, pidBefore, 'verified reuse of the exact same physical PostgreSQL connection');
    assert.equal(afterCheck.rows[0].mod, '', 'app.can_moderate did not leak to subsequent pooled request');
    assert.equal(afterCheck.rows[0].uid, '', 'app.user_id did not leak to subsequent pooled request');
    const rlsCheckOnReusedConn = await singleConnPool.query('SELECT id, status FROM community_reviews');
    assert(rlsCheckOnReusedConn.rows.every(r => r.status === 'approved'), 'FORCE RLS still hides unpublished posts on reused connection');

    console.log('PASS [5/6]: Date-only YYYY-MM-DD contract across timezones/adapters, concurrent pager idempotency, and single-connection GUC non-leakage');

    // =========================================================================
    // PART 6: Two-Tier Rollback Verification (Tier 1 Write Hold + Tier 2 Actual
    //         `8bbbbe3` Legacy Handlers Executed Against Rolled-Back Schema)
    // =========================================================================

    // Tier 1: Security-preserving write pause (`TRUCKLY_PAUSE_WRITES`)
    process.env.TRUCKLY_PAUSE_WRITES = 'bookings,community';
    try {
      assert.equal(
        (await callApi('bookings/create.js', { method: 'POST', user: ACTORS.custA, body: {} })).status,
        503,
        'paused bookings write returns 503'
      );
      assert.equal(
        (await callApi('community/post.js', { method: 'POST', user: ACTORS.custA, body: {} })).status,
        503,
        'paused community write returns 503'
      );
      assert.equal(
        (await callApi('community/moderate.js', { method: 'POST', user: ACTORS.mod, body: { id: postAId, status: 'approved' } })).status,
        503,
        'paused community moderation write returns 503'
      );
      // Reads & RLS stay 100% active during Tier 1 write pause
      const listDuringPause = await callApi('community/list.js', { method: 'GET' });
      assert.equal(listDuringPause.status, 200);
      assert.equal(listDuringPause.body.posts.length, 1);
    } finally {
      delete process.env.TRUCKLY_PAUSE_WRITES;
    }

    // Tier 2: Empirical test of `scripts/rollback-legacy-8bbbbe3-compat.sql` using actual `8bbbbe3` handlers!
    await adminPool.query(`CREATE DATABASE ${rollbackDbName} OWNER ${appRole}`);
    rollbackPool = new Pool({
      connectionString: buildDbUrl(pgServer.adminUrl, { user: appRole, password: appPass, database: rollbackDbName }),
      max: 4
    });

    // Apply full 001..013 hardened schema and insert post-hardening rows first
    await applyMigrations(rollbackPool, listMigrationFiles(999));
    await rollbackPool.query(
      `INSERT INTO bookings (
         truck_id, truck_name, event_type, event_date, guest_count, location,
         requester, requester_user_id, requester_email, package_id, package_name, package_price, status
       ) VALUES ('mitote', 'Mitote Food Park', 'Office lunch', $1, 40, 'Santa Rosa', 'a@b.test', 'usr_1', 'a@b.test', 'dropin', 'Neighborhood Drop-in', 750, 'pending')`,
      [futurePacificDate(14)]
    );

    // Apply the documented Tier 2 compatibility rollback SQL
    const rollbackSql = fs.readFileSync(path.join(ROOT, 'scripts', 'rollback-legacy-8bbbbe3-compat.sql'), 'utf8');
    await rollbackPool.query(rollbackSql);

    // Load the ACTUAL pre-hardening `8bbbbe3` route modules from git history and invoke them against `rollbackPool`!
    async function loadLegacy8bbbbe3Handler(relApiPath) {
      const legacySource = execFileSync('git', ['show', `8bbbbe3:api/${relApiPath}`], {
        cwd: ROOT,
        encoding: 'utf8',
        windowsHide: true
      });
      const dataUrl =
        'data:text/javascript;base64,' +
        Buffer.from(`${legacySource}\n//# sourceURL=legacy-8bbbbe3-${relApiPath}`, 'utf8').toString('base64');
      const mod = await import(dataUrl);
      return async ({ method = 'GET', user = null, query = {}, params = {}, body = {} } = {}) => {
        let code = 200;
        let out = undefined;
        const req = { method, query, params, body, headers: {}, ...(user ? { user } : {}) };
        const res = {
          setHeader() {},
          status(c) {
            code = c;
            return this;
          },
          json(p) {
            out = p;
            return this;
          }
        };
        await als.run({ db: rollbackPool, authUser: user }, () => mod.default(req, res));
        return { status: code, body: out };
      };
    }

    const legCommPost = await loadLegacy8bbbbe3Handler('community/post.js');
    const legCommMine = await loadLegacy8bbbbe3Handler('community/mine.js');
    const legCommMod = await loadLegacy8bbbbe3Handler('community/moderate.js');
    const legCommList = await loadLegacy8bbbbe3Handler('community/list.js');
    const legBookCreate = await loadLegacy8bbbbe3Handler('bookings/create.js');
    const legBookList = await loadLegacy8bbbbe3Handler('bookings/list.js');
    const legOwnerReq = await loadLegacy8bbbbe3Handler('owner/requests.js');
    const legOwnerProf = await loadLegacy8bbbbe3Handler('owner/profile.js');
    const legOwnerLoc = await loadLegacy8bbbbe3Handler('owner/location.js');
    const legOwnerSched = await loadLegacy8bbbbe3Handler('owner/schedule.js');
    const legPagerStaff = await loadLegacy8bbbbe3Handler('pager/staff.js');
    const legPagerUpdate = await loadLegacy8bbbbe3Handler('pager/update.js');

    // 1. Legacy community post -> mine -> moderate (sets status + moderated_at WITHOUT moderated_by!) -> public list
    const legSub = await legCommPost({
      method: 'POST',
      user: { id: 'usr_leg_author', email: 'leg@sonoma.test' },
      body: {
        kind: 'review',
        place_id: 'mitote',
        place_name: 'Mitote Food Park',
        town: 'Santa Rosa',
        nickname: 'Legacy Reviewer',
        title: 'Rollback test review',
        body: 'Testing the actual 8bbbbe3 community handlers against rolled-back schema.',
        rating: 5
      }
    });
    assert.equal(legSub.status, 201, '8bbbbe3 community/post succeeds after rollback SQL');

    const legMine = await legCommMine({ method: 'GET', user: { id: 'usr_leg_author' } });
    assert.equal(legMine.status, 200);
    assert.equal(legMine.body.submissions.length, 1, '8bbbbe3 community/mine reads submission without GUC');

    const legQueue = await legCommMod({ method: 'GET' });
    assert.equal(legQueue.status, 200);
    assert.equal(legQueue.body.pending.length, 1, '8bbbbe3 community/moderate GET sees pending queue without GUC');

    const legApprove = await legCommMod({
      method: 'POST',
      body: { id: legSub.body.submission.id, status: 'approved' }
    });
    assert.equal(legApprove.status, 200, '8bbbbe3 community/moderate POST succeeds without moderated_by');

    const legPub = await legCommList({ method: 'GET' });
    assert.equal(legPub.status, 200);
    assert.equal(legPub.body.posts.length, 1, 'approved post appears in 8bbbbe3 community/list');

    // 2. Legacy bookings/create (anonymous + null truck_id + No requester_user_id) & owner/requests accept
    const legAnonBook = await legBookCreate({
      method: 'POST',
      user: { email: 'legacy-buyer@sonoma.test' },
      body: {
        truck_id: null,
        truck_name: 'Best available match',
        package_id: 'party',
        event_type: 'Birthday',
        event_date: futurePacificDate(18),
        guest_count: 60,
        location: 'Santa Rosa'
      }
    });
    assert.equal(legAnonBook.status, 201, '8bbbbe3 bookings/create succeeds without requester_user_id or truck_id');
    const legBuyerList = await legBookList({ method: 'GET', user: { email: 'legacy-buyer@sonoma.test' } });
    assert.equal(legBuyerList.body.bookings.length, 1);
    const legAcceptBook = await legOwnerReq({
      method: 'POST',
      body: { id: legAnonBook.body.id, status: 'accepted' }
    });
    assert.equal(legAcceptBook.status, 200, '8bbbbe3 owner/requests POST accept succeeds');

    // 3. Legacy pager/staff (NULL vendor_id) & pager/update
    const legPager = await legPagerStaff({
      method: 'POST',
      body: { vendor: 'Mitote Stand', ticket: '12', request_key: crypto.randomUUID() }
    });
    assert.equal(legPager.status, 201, '8bbbbe3 pager/staff POST succeeds without vendor_id');
    const legPagerUpd = await legPagerUpdate({
      method: 'POST',
      body: { id: legPager.body.pager.id, status: 'ready' }
    });
    assert.equal(legPagerUpd.status, 200, '8bbbbe3 pager/update POST succeeds');

    // 4. Legacy owner profile/location/schedule with default 'owner-truck'
    assert.equal((await legOwnerProf({ method: 'POST', body: { display_name: 'Legacy Owner Truck' } })).status, 200);
    assert.equal((await legOwnerLoc({ method: 'POST', body: { location: 'Ross Street' } })).status, 200);
    assert.equal(
      (await legOwnerSched({ method: 'POST', body: { truck_id: 'owner-truck', service_date: futurePacificDate(10), status: 'scheduled' } })).status,
      200
    );

    // Confirm pre-rollback rows were preserved non-destructively
    assert.equal((await rollbackPool.query('SELECT count(*)::int AS c FROM vendors')).rows[0].c, 59);
    assert.equal((await rollbackPool.query('SELECT count(*)::int AS c FROM bookings')).rows[0].c, 2);

    console.log('PASS [6/6]: Two-tier rollback verified (Tier 1 write pause + Tier 2 actual 8bbbbe3 handlers on rolled-back PostgreSQL)');

    // =========================================================================
    // PART 7: Absent-Row Booking Concurrency Serialization & In-Tx Revocation
    // =========================================================================
    // 7a. Prove `FOR SHARE OF v` vs `FOR NO KEY UPDATE` on `vendors` prevents booking creation
    //     when `owner_profiles` has NO existing row and an owner concurrently pauses bookings!
    const absentProfileVendor = 'sunny';
    const raceDate = futurePacificDate(21);
    await cleanPool.query('DELETE FROM owner_profiles WHERE truck_id = $1', [absentProfileVendor]);
    await cleanPool.query('DELETE FROM owner_schedule WHERE truck_id = $1', [absentProfileVendor]);

    const lockClient = await cleanPool.connect();
    try {
      await lockClient.query('BEGIN');
      // Simulate POST /api/owner/profile holding FOR NO KEY UPDATE on vendors('sunny') before inserting owner_profiles
      await lockClient.query('SELECT id FROM vendors WHERE id = $1 FOR NO KEY UPDATE', [absentProfileVendor]);
      await lockClient.query(
        `INSERT INTO owner_profiles (truck_id, display_name, cuisine, accepting_bookings, updated_at)
         VALUES ($1, 'Sunny Cafe & Tacos', 'Mexican', false, now())`,
        [absentProfileVendor]
      );

      // Fire customer booking concurrently while owner transaction is in flight; commit owner pause after 90ms
      const commitTimer = setTimeout(() => {
        lockClient.query('COMMIT').catch(() => {});
      }, 90);

      const concurrentBookRes = await callApi('bookings/create.js', {
        method: 'POST',
        user: ACTORS.custA,
        body: {
          truck_id: absentProfileVendor,
          package_id: 'dropin',
          event_type: 'Office lunch',
          event_date: raceDate,
          guest_count: 25,
          location: '100 Fourth St, Santa Rosa',
          idempotency_key: 'absent-prof-race-1'
        }
      });
      clearTimeout(commitTimer);
      assert.equal(
        concurrentBookRes.status,
        409,
        'concurrent booking waits on vendors lock and observes newly inserted accepting_bookings=false'
      );
    } finally {
      lockClient.release();
    }

    // Same proof for absent `owner_schedule` row concurrently marked `unavailable`:
    await cleanPool.query('UPDATE owner_profiles SET accepting_bookings = true WHERE truck_id = $1', [absentProfileVendor]);
    const schedLockClient = await cleanPool.connect();
    try {
      await schedLockClient.query('BEGIN');
      await schedLockClient.query('SELECT id FROM vendors WHERE id = $1 FOR NO KEY UPDATE', [absentProfileVendor]);
      await schedLockClient.query(
        `INSERT INTO owner_schedule (truck_id, service_date, status, updated_at)
         VALUES ($1, $2, 'unavailable', now())`,
        [absentProfileVendor, raceDate]
      );

      const commitSchedTimer = setTimeout(() => {
        schedLockClient.query('COMMIT').catch(() => {});
      }, 90);

      const concurrentSchedBookRes = await callApi('bookings/create.js', {
        method: 'POST',
        user: ACTORS.custA,
        body: {
          truck_id: absentProfileVendor,
          package_id: 'dropin',
          event_type: 'Office lunch',
          event_date: raceDate,
          guest_count: 25,
          location: '100 Fourth St, Santa Rosa',
          idempotency_key: 'absent-sched-race-1'
        }
      });
      clearTimeout(commitSchedTimer);
      assert.equal(
        concurrentSchedBookRes.status,
        409,
        'concurrent booking waits on vendors lock and observes newly inserted unavailable schedule'
      );
    } finally {
      schedLockClient.release();
    }

    // 7b. In-transaction revocation check (`reverifyVendorMembershipInTx` & `reverifyModeratorInTx`)
    const authzRevokeMod = await import(pathToFileURL(path.join(ROOT, 'lib', 'authz.js')).href);
    const staleOwnerCtx = await authzRevokeMod.loadAccessContext({ user: ACTORS.vaOwner }, null, cleanPool);
    assert.equal(staleOwnerCtx.memberships.has('iniguez'), true);

    // Revoke membership in PostgreSQL AFTER `loadAccessContext` already ran
    await cleanPool.query(
      'DELETE FROM vendor_memberships WHERE vendor_id = $1 AND user_id = $2',
      ['iniguez', ACTORS.vaOwner.id]
    );
    const txReverify = await authzRevokeMod.reverifyVendorMembershipInTx(cleanPool, staleOwnerCtx, 'iniguez', 'owner');
    assert.equal(txReverify.ok, false, 'revoked membership denied inside transaction despite stale pre-tx context');
    assert.equal(txReverify.status, 403);

    const staleModCtx = await authzRevokeMod.loadAccessContext({ user: ACTORS.mod }, null, cleanPool);
    assert.equal(staleModCtx.isModerator, true);
    await cleanPool.query('DELETE FROM platform_roles WHERE user_id = $1', [ACTORS.mod.id]);
    const txModReverify = await authzRevokeMod.reverifyModeratorInTx(cleanPool, staleModCtx);
    assert.equal(txModReverify.ok, false, 'revoked moderator denied inside transaction despite stale pre-tx context');
    assert.equal(txModReverify.status, 403);

    console.log('PASS [7/8]: Absent-row booking concurrency locks and mid-request RBAC revocation verified');

    // =========================================================================
    // PART 8: Concurrent Permission-Change Lock Serialization (`FOR SHARE`) &
    //         Scoped / Fail-Closed `TRUCKLY_PAUSE_WRITES` Controls
    // =========================================================================
    // Restore vaOwner membership on `iniguez` before testing concurrent non-key updates
    await cleanPool.query(
      `INSERT INTO vendor_memberships (vendor_id, user_id, role, granted_by)
       VALUES ('iniguez', $1, 'owner', $2)
       ON CONFLICT (vendor_id, user_id) DO UPDATE SET role = 'owner', granted_by = EXCLUDED.granted_by`,
      [ACTORS.vaOwner.id, ACTORS.padmin.id]
    );

    // 8a. Vendor owner downgraded to `staff` (`UPDATE vendor_memberships SET role = 'staff'`)
    //     during an owner-only write (`POST /api/owner/profile`).
    //     Proves `FOR SHARE` blocks on the uncommitted non-key `UPDATE` (`FOR NO KEY UPDATE`)
    //     and denies the write (`403`) once the downgrade commits.
    const ownerDowngradeClient = await cleanPool.connect();
    try {
      await ownerDowngradeClient.query('BEGIN');
      await ownerDowngradeClient.query(
        `UPDATE vendor_memberships
         SET role = 'staff', granted_by = $2
         WHERE vendor_id = 'iniguez' AND user_id = $1`,
        [ACTORS.vaOwner.id, ACTORS.padmin.id]
      );

      let profileSettledBeforeCommit = false;
      const concurrentOwnerProfPromise = callApi('owner/profile.js', {
        method: 'POST',
        user: ACTORS.vaOwner,
        body: {
          truck_id: 'iniguez',
          display_name: 'Unauthorized After Downgrade',
          accepting_bookings: true
        }
      }).then(res => {
        profileSettledBeforeCommit = true;
        return res;
      });

      await new Promise(r => setTimeout(r, 60));
      assert.equal(
        profileSettledBeforeCommit,
        false,
        'FOR SHARE on vendor_memberships must block until uncommitted role downgrade commits'
      );

      await ownerDowngradeClient.query('COMMIT');
      const downgradedProfRes = await concurrentOwnerProfPromise;
      assert.equal(
        downgradedProfRes.status,
        403,
        'owner-only write rejected after concurrent owner->staff downgrade committed'
      );
      const profAfterDowngrade = await cleanPool.query(
        'SELECT display_name FROM owner_profiles WHERE truck_id = $1',
        ['iniguez']
      );
      assert.notEqual(
        profAfterDowngrade.rows[0]?.display_name,
        'Unauthorized After Downgrade',
        'downgraded actor did not mutate owner_profiles'
      );
    } finally {
      ownerDowngradeClient.release();
    }

    // 8b. Platform administrator downgraded to `moderator` (`UPDATE platform_roles SET role = 'moderator'`)
    //     during both an admin-only vendor write (`POST /api/owner/profile` on `sunny`) AND `GET /api/pager/telemetry`.
    const tempAdminUser = { id: 'usr_temp_padmin_lock', email: 'temp-admin@sonoma.test' };
    await cleanPool.query(
      `INSERT INTO platform_roles (user_id, role, granted_by)
       VALUES ($1, 'platform_admin', 'bootstrap')`,
      [tempAdminUser.id]
    );

    const adminDowngradeClient = await cleanPool.connect();
    try {
      await adminDowngradeClient.query('BEGIN');
      await adminDowngradeClient.query(
        `UPDATE platform_roles SET role = 'moderator' WHERE user_id = $1`,
        [tempAdminUser.id]
      );

      let adminWriteSettled = false;
      let adminTelemetrySettled = false;

      const adminWritePromise = callApi('owner/profile.js', {
        method: 'POST',
        user: tempAdminUser,
        body: { truck_id: 'sunny', display_name: 'Downgraded Admin Write' }
      }).then(res => {
        adminWriteSettled = true;
        return res;
      });

      const adminTelemetryPromise = callApi('pager/telemetry.js', {
        method: 'GET',
        user: tempAdminUser
      }).then(res => {
        adminTelemetrySettled = true;
        return res;
      });

      await new Promise(r => setTimeout(r, 60));
      assert.equal(adminWriteSettled, false, 'FOR SHARE on platform_roles blocks admin write during uncommitted downgrade');
      assert.equal(adminTelemetrySettled, false, 'FOR SHARE on platform_roles blocks admin telemetry during uncommitted downgrade');

      await adminDowngradeClient.query('COMMIT');
      const [adminWriteRes, adminTelemetryRes] = await Promise.all([
        adminWritePromise,
        adminTelemetryPromise
      ]);
      assert.equal(adminWriteRes.status, 403, 'downgraded platform_admin denied vendor write');
      assert.equal(adminTelemetryRes.status, 403, 'downgraded platform_admin denied admin telemetry');
    } finally {
      adminDowngradeClient.release();
    }

    // 8c. Vendor deactivation (`UPDATE vendors SET is_active = false`) during a vendor write (`POST /api/owner/location`)
    const deactClient = await cleanPool.connect();
    try {
      await deactClient.query('BEGIN');
      await deactClient.query(`UPDATE vendors SET is_active = false WHERE id = 'mitote'`);

      let locSettledBeforeCommit = false;
      const deactLocPromise = callApi('owner/location.js', {
        method: 'POST',
        user: ACTORS.vbOwner,
        body: {
          truck_id: 'mitote',
          location: 'Deactivated Vendor Attempt',
          is_open: true
        }
      }).then(res => {
        locSettledBeforeCommit = true;
        return res;
      });

      await new Promise(r => setTimeout(r, 60));
      assert.equal(
        locSettledBeforeCommit,
        false,
        'FOR SHARE on vendors blocks owner location write during uncommitted vendor deactivation'
      );

      await deactClient.query('COMMIT');
      const deactLocRes = await deactLocPromise;
      assert.equal(deactLocRes.status, 403, 'deactivated vendor write denied once deactivation commits');
      const tsAfterDeact = await cleanPool.query(
        'SELECT location FROM truck_settings WHERE truck_id = $1',
        ['mitote']
      );
      assert.notEqual(tsAfterDeact.rows[0]?.location, 'Deactivated Vendor Attempt');
    } finally {
      deactClient.release();
      await cleanPool.query(`UPDATE vendors SET is_active = true WHERE id = 'mitote'`);
    }

    // 8d. Membership deletion (`DELETE FROM vendor_memberships`) during a vendor write (`POST /api/pager/staff`)
    const delMemClient = await cleanPool.connect();
    try {
      await delMemClient.query('BEGIN');
      await delMemClient.query(
        `DELETE FROM vendor_memberships WHERE vendor_id = 'iniguez' AND user_id = $1`,
        [ACTORS.vaStaff.id]
      );

      let pagerSettledBeforeCommit = false;
      const delMemPagerPromise = callApi('pager/staff.js', {
        method: 'POST',
        user: ACTORS.vaStaff,
        body: {
          vendor_id: 'iniguez',
          ticket: 'DEL-MEM-99',
          request_key: crypto.randomUUID()
        }
      }).then(res => {
        pagerSettledBeforeCommit = true;
        return res;
      });

      await new Promise(r => setTimeout(r, 60));
      assert.equal(
        pagerSettledBeforeCommit,
        false,
        'FOR SHARE on vendor_memberships blocks staff pager creation during uncommitted membership deletion'
      );

      await delMemClient.query('COMMIT');
      const delMemPagerRes = await delMemPagerPromise;
      assert.equal(delMemPagerRes.status, 403, 'deleted membership denied pager creation once delete commits');
      const checkDelPager = await cleanPool.query(
        `SELECT count(*)::int AS c FROM pickup_pagers WHERE ticket = 'DEL-MEM-99'`
      );
      assert.equal(checkDelPager.rows[0].c, 0);
    } finally {
      delMemClient.release();
    }

    // 8e. Fail-closed `TRUCKLY_PAUSE_WRITES` on unrecognized scope token while preserving public reads
    process.env.TRUCKLY_PAUSE_WRITES = 'unrecognized_typo_scope';
    try {
      assert.equal(authzRevokeMod.inspectWritePauseConfig().valid, false);
      assert.equal(authzRevokeMod.isWritePaused('bookings'), true, 'invalid TRUCKLY_PAUSE_WRITES fails closed');
      assert.equal(authzRevokeMod.isWritePaused('owner'), true, 'invalid TRUCKLY_PAUSE_WRITES fails closed');
      const failClosedBook = await callApi('bookings/create.js', {
        method: 'POST',
        user: ACTORS.custA,
        body: {
          truck_id: 'mitote',
          package_id: 'dropin',
          event_type: 'Lunch',
          event_date: futurePacificDate(25),
          guest_count: 20,
          location: 'Santa Rosa'
        }
      });
      assert.equal(failClosedBook.status, 503, 'write rejected with 503 when TRUCKLY_PAUSE_WRITES is malformed');
      const publicReadStillWorks = await callApi('community/list.js', { method: 'GET' });
      assert.equal(publicReadStillWorks.status, 200, 'public reads remain available under fail-closed write pause');
    } finally {
      delete process.env.TRUCKLY_PAUSE_WRITES;
    }

    console.log('PASS [8/8]: Concurrent permission-change lock serialization (FOR SHARE) and fail-closed write-pause verified');
    console.log('ALL REAL-POSTGRESQL BACKEND HARDENING INTEGRATION TESTS PASSED.');
  } finally {
    if (singleConnPool) await singleConnPool.end().catch(() => {});
    if (rollbackPool) await rollbackPool.end().catch(() => {});
    if (cleanPool) await cleanPool.end().catch(() => {});
    if (legacyPool) await legacyPool.end().catch(() => {});
    await adminPool.end().catch(() => {});
    await pgServer.stop();
  }
})().catch(err => {
  console.error('INTEGRATION TEST FAILURE:', err);
  process.exitCode = 1;
});
