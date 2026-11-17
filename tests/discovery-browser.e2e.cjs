// Real Headless Chromium + Real PostgreSQL End-to-End Test for P1 Unified Discovery:
//   Verifies across two isolated browser contexts (separate cookies & localStorage):
//     1. Customer loads `/` -> sees all 59 unified Sonoma County listings from PostgreSQL
//        (zero client-side mergeNeighborhoodAdditions, zero fabricated distances).
//     2. Authorized Vendor Owner signs in -> opens Owner Mode -> publishes profile,
//        live GPS location, and today's schedule through the real DOM forms.
//     3. Separate anonymous Customer browser refreshes discovery -> list card in #truckCards
//        and detail modal in #detailContent agree on updated name, bio, location, and
//        active schedule status while keeping `verified` un-elevated.
//
// Run locally:
//   $env:TRUCKLY_PG_NODE_MODULES="<path-to-pg-and-pg-binaries>"
//   node tests/discovery-browser.e2e.cjs

const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const os = require('node:os');
const http = require('node:http');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');

function requirePg() {
  const extraBase = process.env.TRUCKLY_PG_NODE_MODULES;
  if (extraBase) {
    return require(path.join(extraBase, 'pg'));
  }
  return require('pg');
}

const { Pool } = requirePg();

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

function findChromeBinary() {
  if (process.env.CHROME_BIN && fs.existsSync(process.env.CHROME_BIN)) {
    return process.env.CHROME_BIN;
  }
  const winCandidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ];
  for (const c of winCandidates) {
    if (fs.existsSync(c)) return c;
  }
  for (const bin of ['google-chrome', 'google-chrome-stable', 'chromium-browser', 'chromium']) {
    try {
      const out = execFileSync('which', [bin], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      if (out) return out;
    } catch {}
  }
  throw new Error('Could not locate Chrome/Chromium/Edge binary. Set CHROME_BIN to run browser E2E.');
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
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'truckly-e2e-pg-'));
  const dataDir = path.join(tmpBase, 'data');
  const pwFile = path.join(tmpBase, 'pw.txt');
  const logFile = path.join(tmpBase, 'postgres.log');
  const password = 'truckly_e2e_pw_' + crypto.randomBytes(6).toString('hex');
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

function buildDbUrl(baseAdminUrl, { user, password, database }) {
  const u = new URL(baseAdminUrl);
  u.username = user;
  u.password = password || '';
  u.pathname = `/${database}`;
  return u.toString();
}

function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, res => {
      let body = '';
      res.on('data', d => (body += d));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, json: JSON.parse(body) });
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('error', reject);
  });
}

async function waitForCondition(fn, { timeoutMs = 15000, intervalMs = 120, label = 'condition' } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastErr = null;
  while (Date.now() < deadline) {
    try {
      const val = await fn();
      if (val) return val;
    } catch (err) {
      lastErr = err;
    }
    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new Error(`Timed out waiting for ${label}${lastErr ? ': ' + lastErr.message : ''}`);
}

class CdpClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
  }

  async connect() {
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', () => resolve(), { once: true });
      this.ws.addEventListener('error', e => reject(e.error || new Error('CDP WebSocket error')), { once: true });
    });
    this.ws.addEventListener('message', event => {
      const msg = JSON.parse(typeof event.data === 'string' ? event.data : event.data.toString());
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    });
  }

  send(method, params = {}, sessionId = undefined) {
    const id = this.nextId++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(payload));
    });
  }

  async eval(sessionId, expression) {
    const res = await this.send(
      'Runtime.evaluate',
      {
        expression,
        awaitPromise: true,
        returnByValue: true
      },
      sessionId
    );
    if (res.exceptionDetails) {
      const desc =
        res.exceptionDetails.exception?.description ||
        res.exceptionDetails.text ||
        'Runtime.evaluate exception';
      throw new Error(desc);
    }
    return res.result?.value;
  }

  close() {
    try {
      this.ws.close();
    } catch {}
  }
}

(async () => {
  const chromeBin = findChromeBinary();
  const pgCluster = await createPostgresCluster();
  const suffix = crypto.randomBytes(4).toString('hex');
  const appRole = `truckly_e2e_app_${suffix}`;
  const appPass = `pw_${suffix}`;
  const dbName = `truckly_e2e_${suffix}`;

  const adminPool = new Pool({ connectionString: pgCluster.adminUrl, max: 4 });
  let appPool = null;
  let serverProc = null;
  let chromeProc = null;
  let cdp = null;
  let chromeProfileDir = null;

  try {
    await adminPool.query(`CREATE ROLE ${appRole} LOGIN PASSWORD '${appPass}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`);
    await adminPool.query(`CREATE DATABASE ${dbName} OWNER ${appRole}`);

    const appDbUrl = buildDbUrl(pgCluster.adminUrl, { user: appRole, password: appPass, database: dbName });
    appPool = new Pool({ connectionString: appDbUrl, max: 6 });

    // Apply all migrations 001..014
    const migFiles = fs
      .readdirSync(path.join(ROOT, 'migrations'))
      .filter(f => /^\d{3}_.+\.sql$/.test(f))
      .sort();
    for (const f of migFiles) {
      await appPool.query(fs.readFileSync(path.join(ROOT, 'migrations', f), 'utf8'));
    }

    // Seed vendor memberships matching dev-server's simulated auth identities
    await appPool.query(
      `INSERT INTO platform_roles (user_id, role, granted_by) VALUES ('usr_platform_admin', 'platform_admin', 'bootstrap')`
    );
    await appPool.query(
      `INSERT INTO vendor_memberships (vendor_id, user_id, role, granted_by) VALUES
         ('iniguez', 'usr_vendor_a_owner', 'owner', 'usr_platform_admin'),
         ('iniguez', 'usr_vendor_a_staff', 'staff', 'usr_vendor_a_owner'),
         ('mitote', 'usr_vendor_b_owner', 'owner', 'usr_platform_admin')`
    );

    // Start local HTTP server backed by REAL PostgreSQL
    const appPort = await getFreePort();
    const baseUrl = `http://127.0.0.1:${appPort}`;
    serverProc = spawn(process.execPath, [path.join(ROOT, 'scripts', 'dev-server.cjs')], {
      cwd: ROOT,
      env: {
        ...process.env,
        PORT: String(appPort),
        DATABASE_URL: appDbUrl
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });

    await waitForCondition(
      async () => {
        const res = await httpGetJson(`${baseUrl}/api/trucks?summary=1`);
        return res.status === 200 && res.json.total === 59;
      },
      { label: 'dev-server backed by PostgreSQL' }
    );

    // Launch real headless Chrome
    const cdpPort = await getFreePort();
    chromeProfileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'truckly-chrome-e2e-'));
    chromeProc = spawn(
      chromeBin,
      [
        '--headless=new',
        '--no-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--no-first-run',
        '--no-default-browser-check',
        `--user-data-dir=${chromeProfileDir}`,
        `--remote-debugging-port=${cdpPort}`,
        'about:blank'
      ],
      { stdio: ['ignore', 'ignore', 'ignore'], windowsHide: true }
    );

    const versionInfo = await waitForCondition(
      async () => {
        const r = await httpGetJson(`http://127.0.0.1:${cdpPort}/json/version`);
        return r.status === 200 && r.json.webSocketDebuggerUrl ? r.json : null;
      },
      { label: 'Chrome DevTools endpoint' }
    );
    console.log(`Connected to headless browser: ${versionInfo.Browser}`);

    cdp = new CdpClient(versionInfo.webSocketDebuggerUrl);
    await cdp.connect();

    // Create TWO isolated browser contexts (Customer vs Owner)
    const { browserContextId: customerCtx } = await cdp.send('Target.createBrowserContext');
    const { browserContextId: ownerCtx } = await cdp.send('Target.createBrowserContext');

    const { targetId: customerTarget } = await cdp.send('Target.createTarget', {
      url: 'about:blank',
      browserContextId: customerCtx
    });
    const { sessionId: customerSession } = await cdp.send('Target.attachToTarget', {
      targetId: customerTarget,
      flatten: true
    });
    await cdp.send('Page.enable', {}, customerSession);
    await cdp.send('Runtime.enable', {}, customerSession);
    await cdp.send('Network.enable', {}, customerSession);

    const { targetId: ownerTarget } = await cdp.send('Target.createTarget', {
      url: 'about:blank',
      browserContextId: ownerCtx
    });
    const { sessionId: ownerSession } = await cdp.send('Target.attachToTarget', {
      targetId: ownerTarget,
      flatten: true
    });
    await cdp.send('Page.enable', {}, ownerSession);
    await cdp.send('Runtime.enable', {}, ownerSession);
    await cdp.send('Network.enable', {}, ownerSession);

    // Block external OSM map tile image requests so headless E2E never touches external internet or waits on tiles
    for (const sess of [customerSession, ownerSession]) {
      await cdp.send(
        'Network.setBlockedURLs',
        { urls: ['*://tile.openstreetmap.org/*'] },
        sess
      );
    }

    // =========================================================================
    // STEP 1: Anonymous Customer opens discovery & sees 59 unified listings
    // =========================================================================
    await cdp.send('Page.navigate', { url: `${baseUrl}/` }, customerSession);
    const initialCustomerState = await waitForCondition(
      async () => {
        const state = await cdp.eval(
          customerSession,
          `(() => {
            if (!window.trucklyReady || typeof trucks === 'undefined' || trucks.length !== 59) return null;
            const iniguez = trucks.find(t => t.id === 'iniguez');
            const crooks = trucks.find(t => t.id === 'coffee-crooks');
            const cardsHtml = document.getElementById('truckCards')?.innerHTML || '';
            if (!cardsHtml.includes('Tacos Iñiguez')) return null;
            return {
              total: trucks.length,
              hasLegacyMergeFn: typeof window.mergeNeighborhoodAdditions !== 'undefined',
              nearbyText: document.getElementById('nearbyCount')?.textContent || '',
              iniguezName: iniguez?.name,
              iniguezLoc: iniguez?.location,
              iniguezDist: iniguez?.distance,
              crooksExtra: crooks?.extra,
              catalogVersion
            };
          })()`
        );
        return state;
      },
      { label: 'Customer initial 59-listing render' }
    );

    assert.equal(initialCustomerState.total, 59);
    assert.equal(initialCustomerState.hasLegacyMergeFn, false, 'mergeNeighborhoodAdditions removed from browser');
    assert(initialCustomerState.nearbyText.includes('59 places'));
    assert.equal(initialCustomerState.iniguezName, 'Tacos Iñiguez');
    assert.equal(initialCustomerState.iniguezLoc, '460 Mission Blvd, Santa Rosa');
    assert.equal(initialCustomerState.iniguezDist, null, 'no fabricated distance in browser');
    assert.equal(initialCustomerState.crooksExtra, true);
    console.log('PASS [E2E 1/3]: Anonymous customer browser loaded all 59 unified listings from PostgreSQL');

    // =========================================================================
    // STEP 2: Vendor A Owner signs in & publishes profile, location, and schedule via UI
    // =========================================================================
    await cdp.send(
      'Page.addScriptToEvaluateOnNewDocument',
      {
        source: `try { localStorage.setItem('truckly_debug_role', 'vendor_a_owner'); } catch (e) {}`
      },
      ownerSession
    );
    await cdp.send(
      'Network.setCookie',
      {
        name: 'truckly_debug_role',
        value: 'vendor_a_owner',
        url: baseUrl,
        path: '/'
      },
      ownerSession
    );
    await cdp.send('Page.navigate', { url: `${baseUrl}/` }, ownerSession);

    await waitForCondition(
      () => cdp.eval(ownerSession, `Boolean(window.trucklyReady && typeof trucks !== 'undefined' && trucks.length === 59)`),
      { label: 'Owner browser initial load' }
    );

    // Open Owner Mode via UI click on brand button
    await cdp.eval(ownerSession, `document.querySelector('header.topbar .brand').click(); true;`);

    const ownerLoaded = await waitForCondition(
      () =>
        cdp.eval(
          ownerSession,
          `(() => {
            if (!isOwnerAdmin || ownerTruckId !== 'iniguez') return null;
            return {
              bannerHidden: document.getElementById('ownerModeBanner')?.hidden,
              selectedTruck: document.getElementById('ownerTruckSelect')?.value,
              role: getActiveVendorRole()
            };
          })()`
        ),
      { label: 'Owner Mode authenticated dashboard for iniguez' }
    );
    assert.equal(ownerLoaded.bannerHidden, true);
    assert.equal(ownerLoaded.selectedTruck, 'iniguez');
    assert.equal(ownerLoaded.role, 'owner');

    // 2a. Publish Profile change via UI modal
    await cdp.eval(
      ownerSession,
      `(async () => {
        document.getElementById('ownerEditProfileBtn').click();
        document.getElementById('ownerProfileName').value = 'Tacos Iñiguez — Live Grill';
        document.getElementById('ownerProfileCuisine').value = 'Mexican';
        document.getElementById('ownerProfileBio').value = 'Wood-fired quesabirria & handmade tortillas tonight.';
        document.getElementById('ownerAcceptingBookings').checked = true;
        await saveOwnerProfile(new Event('submit', { cancelable: true }));
        return document.getElementById('toast')?.textContent || '';
      })()`
    );

    // 2b. Publish Live GPS Location via UI inputs & button
    const locToast = await cdp.eval(
      ownerSession,
      `(async () => {
        document.getElementById('ownerLocation').value = 'Courthouse Square, Downtown Santa Rosa';
        document.getElementById('ownerLat').value = '38.4404';
        document.getElementById('ownerLng').value = '-122.7141';
        document.getElementById('ownerLocationTtl').value = '240';
        await updateOwnerLocation();
        return document.getElementById('toast')?.textContent || '';
      })()`
    );
    assert.equal(locToast, 'Live location published');

    // 2c. Publish Today's Schedule (all-day 00:00 -> 23:59 so active regardless of test clock hour)
    const schedToast = await cdp.eval(
      ownerSession,
      `(async () => {
        document.getElementById('ownerScheduleDate').value = todayPacificISO();
        document.getElementById('ownerOpensAt').value = '00:00';
        document.getElementById('ownerClosesAt').value = '23:59';
        document.getElementById('ownerIsOpen').checked = true;
        await saveOwnerSchedule();
        return document.getElementById('toast')?.textContent || '';
      })()`
    );
    assert.equal(schedToast, 'Service schedule saved');
    console.log('PASS [E2E 2/3]: Vendor owner published profile, GPS location, and schedule through #ownerScreen UI');

    // =========================================================================
    // STEP 3: Separate Customer Browser refreshes discovery -> List & Detail Agree
    // =========================================================================
    const customerRefreshed = await cdp.eval(
      customerSession,
      `(async () => {
        document.getElementById('refreshCatalogBtn').click();
        // Wait until refreshDiscoveryCatalog updates catalogVersion
        const deadline = Date.now() + 8000;
        while (Date.now() < deadline) {
          const item = trucks.find(t => t.id === 'iniguez');
          if (item && item.name === 'Tacos Iñiguez — Live Grill') break;
          await new Promise(r => setTimeout(r, 80));
        }

        // Filter search to 'Live Grill' so we inspect the exact rendered card in #truckCards
        const searchEl = document.getElementById('searchInput');
        searchEl.value = 'Live Grill';
        applyFilters();
        const cardText = document.getElementById('truckCards')?.textContent || '';

        // Click the rendered card's detail trigger to open #detailModal
        openDetail('iniguez');
        const modalOpen = document.getElementById('detailModal')?.classList.contains('show');
        const detailText = document.getElementById('detailContent')?.textContent || '';
        const item = trucks.find(t => t.id === 'iniguez');

        return {
          catalogVersion,
          cardText,
          modalOpen,
          detailText,
          verified: item?.verified,
          locationSource: item?.location_source,
          locationAccuracy: item?.location_accuracy,
          isConfirmedService: item?.is_confirmed_service,
          open: item?.open
        };
      })()`
    );

    assert.notEqual(
      customerRefreshed.catalogVersion,
      initialCustomerState.catalogVersion,
      'customer catalog_version advanced on refresh'
    );

    // Verify list card in #truckCards
    assert(customerRefreshed.cardText.includes('Tacos Iñiguez — Live Grill'), 'list card shows updated owner display name');
    assert(customerRefreshed.cardText.includes('Courthouse Square, Downtown Santa Rosa'), 'list card shows updated live location');
    assert(customerRefreshed.cardText.includes('● SCHEDULED'), 'list card shows active vendor schedule badge');
    assert(customerRefreshed.cardText.includes('Owner-reported pin'), 'list card labels owner-reported pin truthfully');

    // Verify detail modal in #detailContent agrees 100% with list card
    assert.equal(customerRefreshed.modalOpen, true, 'detail modal opened');
    assert(customerRefreshed.detailText.includes('Tacos Iñiguez — Live Grill'), 'detail modal matches updated name');
    assert(
      customerRefreshed.detailText.includes('Wood-fired quesabirria & handmade tortillas tonight.'),
      'detail modal shows updated owner description'
    );
    assert(
      customerRefreshed.detailText.includes('Courthouse Square, Downtown Santa Rosa'),
      'detail modal matches updated live location'
    );
    assert(
      customerRefreshed.detailText.includes('VENDOR SCHEDULED OPEN'),
      'detail modal matches active vendor schedule status'
    );
    assert(
      customerRefreshed.detailText.includes('Details pending verification'),
      'detail modal preserves unverified platform status (no self-elevation)'
    );
    assert.equal(customerRefreshed.verified, false);
    assert.equal(customerRefreshed.locationSource, 'owner_reported');
    assert.equal(customerRefreshed.locationAccuracy, 'owner_reported_coords');
    assert.equal(customerRefreshed.isConfirmedService, true);
    assert.equal(customerRefreshed.open, true);

    console.log('PASS [E2E 3/3]: Customer refreshed discovery — list card and detail modal match published owner updates');
    console.log('\nREAL BROWSER + REAL POSTGRESQL DISCOVERY E2E PASSED.');
  } finally {
    if (cdp) cdp.close();
    if (chromeProc) {
      try {
        chromeProc.kill('SIGKILL');
      } catch {}
    }
    if (serverProc) {
      try {
        serverProc.kill('SIGTERM');
      } catch {}
    }
    if (appPool) await appPool.end().catch(() => {});
    await adminPool.end().catch(() => {});
    await pgCluster.stop();
    if (chromeProfileDir) {
      try {
        fs.rmSync(chromeProfileDir, { recursive: true, force: true });
      } catch {}
    }
  }
})().catch(err => {
  console.error('BROWSER E2E FAILURE:', err);
  process.exitCode = 1;
});
