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
    const migratorRole = `truckly_e2e_mig_${suffix}`;
    const migratorPass = `mig_${suffix}`;
    await adminPool.query(
      `CREATE ROLE ${migratorRole} LOGIN PASSWORD '${migratorPass}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`
    );
    await adminPool.query(
      `CREATE ROLE ${appRole} LOGIN PASSWORD '${appPass}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`
    );
    await adminPool.query(`CREATE DATABASE ${dbName} OWNER ${migratorRole}`);

    const migratorDbUrl = buildDbUrl(pgCluster.adminUrl, {
      user: migratorRole,
      password: migratorPass,
      database: dbName
    });
    const appDbUrl = buildDbUrl(pgCluster.adminUrl, { user: appRole, password: appPass, database: dbName });

    // Apply all migrations 001..017 as migrator & grant DML to NOBYPASSRLS appRole
    execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'run-migrations.cjs'), '--app-role', appRole], {
      cwd: ROOT,
      env: { ...process.env, MIGRATION_DATABASE_URL: migratorDbUrl },
      stdio: 'pipe',
      windowsHide: true
    });

    appPool = new Pool({ connectionString: migratorDbUrl, max: 4 });

    // Start real standalone server (`server/index.js`) backed by NOBYPASSRLS PostgreSQL role
    const appPort = await getFreePort();
    const baseUrl = `http://127.0.0.1:${appPort}`;
    const authSecret = crypto.randomBytes(32).toString('hex');
    const mailboxSecret = 'e2e_mbx_' + crypto.randomBytes(16).toString('hex');
    const ownerEmail = 'iniguez-owner@staging.truckly.invalid';

    serverProc = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
      cwd: ROOT,
      env: {
        ...process.env,
        HOST: '127.0.0.1',
        PORT: String(appPort),
        DATABASE_URL: appDbUrl,
        BITESHARK_ENV: 'staging',
        BITESHARK_RELEASE_SHA: 'e2e-biteshark-standalone',
        BITESHARK_AUTH_SECRET: authSecret,
        BITESHARK_AUTH_DELIVERY_MODE: 'staging_mailbox',
        BITESHARK_STAGING_MAILBOX_SECRET: mailboxSecret,
        BITESHARK_STAGING_ALLOWED_EMAIL_DOMAINS: 'staging.truckly.invalid',
        BITESHARK_PUSH_PROVIDER_MODE: 'disabled'
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });

    await waitForCondition(
      async () => {
        const res = await httpGetJson(`${baseUrl}/api/trucks?summary=1`);
        return res.status === 200 && res.json.total === 59;
      },
      { label: 'standalone server/index.js backed by PostgreSQL' }
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

    // Block external CDN/tile requests so headless E2E never depends on third-party internet availability
    // and simultaneously verifies graceful map-CDN degradation (DEF-03).
    for (const sess of [customerSession, ownerSession]) {
      await cdp.send(
        'Network.setBlockedURLs',
        { urls: ['*://tile.openstreetmap.org/*', '*://unpkg.com/*'] },
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
            if (!window.bitesharkReady || !window.trucklyReady || typeof trucks === 'undefined' || trucks.length !== 59) return null;
            const iniguez = trucks.find(t => t.id === 'iniguez');
            const crooks = trucks.find(t => t.id === 'coffee-crooks');
            const cardsHtml = document.getElementById('truckCards')?.innerHTML || '';
            const brandBtn = document.querySelector('.topbar .brand');
            if (!cardsHtml.includes('Tacos Iñiguez') || !brandBtn) return null;
            return {
              docTitle: document.title,
              brandText: brandBtn.textContent.trim(),
              brandAria: brandBtn.getAttribute('aria-label') || '',
              hasBrandSvg: Boolean(brandBtn.querySelector('.brand-mark svg')),
              hasDebugGlobal: typeof window.trucklyDebug !== 'undefined',
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

    assert.equal(initialCustomerState.docTitle, 'BiteShark — Good food. Word gets around.');
    assert.equal(initialCustomerState.brandText, 'BiteShark');
    assert.equal(initialCustomerState.brandAria, 'BiteShark owner mode');
    assert.equal(initialCustomerState.hasBrandSvg, true, 'BiteShark inline SVG brand mark rendered');
    assert.equal(initialCustomerState.hasDebugGlobal, false, 'debug workbench absent from standalone runtime');
    assert.equal(initialCustomerState.total, 59);
    assert.equal(initialCustomerState.hasLegacyMergeFn, false, 'mergeNeighborhoodAdditions removed from browser');
    assert(initialCustomerState.nearbyText.includes('59 places'));
    assert.equal(initialCustomerState.iniguezName, 'Tacos Iñiguez');
    assert.equal(initialCustomerState.iniguezLoc, '460 Mission Blvd, Santa Rosa');
    assert.equal(initialCustomerState.iniguezDist, null, 'no fabricated distance in browser');
    assert.equal(initialCustomerState.crooksExtra, true);

    // Verify manifest, raster icons (200 image/png), and absence of debug controls (404) over HTTP
    const manifestHttp = await httpGetJson(`${baseUrl}/manifest.json`);
    assert.equal(manifestHttp.status, 200);
    assert.equal(manifestHttp.json.short_name, 'BiteShark');
    for (const iconPath of ['/icon-192.png', '/icon-512.png', '/icon-maskable-512.png', '/apple-touch-icon.png', '/badge-96.png']) {
      const iconRes = await fetch(`${baseUrl}${iconPath}`);
      assert.equal(iconRes.status, 200, `${iconPath} must return 200`);
      assert.equal(iconRes.headers.get('content-type'), 'image/png', `${iconPath} must serve image/png`);
    }
    const debugAssetRes = await fetch(`${baseUrl}/debug-admin.js`);
    assert.equal(debugAssetRes.status, 404, '/debug-admin.js must return 404 in standalone runtime');

    // Verify same-origin `localStorage` (`truckly_favs` & `truckly_catalog_v2`) survives reload seamlessly
    await cdp.eval(customerSession, `localStorage.setItem('truckly_favs', JSON.stringify(['mitote'])); true;`);
    await cdp.send('Page.reload', {}, customerSession);
    const persistedFavState = await waitForCondition(
      () =>
        cdp.eval(
          customerSession,
          `(() => {
            if (!window.bitesharkReady || typeof favs === 'undefined' || trucks.length !== 59) return null;
            showScreen('favorites');
            const favHtml = document.getElementById('favoriteGrid')?.innerHTML || '';
            if (!favHtml.includes('Mitote Food Park')) return null;
            showScreen('discover');
            return {
              hasMitoteFav: favs.has('mitote'),
              cachedSnapshotPresent: Boolean(localStorage.getItem('truckly_catalog_v2'))
            };
          })()`
        ),
      { label: 'Same-origin localStorage favorites continuity' }
    );
    assert.equal(persistedFavState.hasMitoteFav, true);
    assert.equal(persistedFavState.cachedSnapshotPresent, true);
    console.log('PASS [E2E 1/3]: Anonymous customer browser loaded all 59 unified listings from PostgreSQL');

    // =========================================================================
    // STEP 2: Vendor A Owner signs in through real `/login.html` Email OTP UI & publishes via Owner Mode
    // =========================================================================
    await cdp.send('Page.navigate', { url: `${baseUrl}/login.html?next=/` }, ownerSession);
    const loginPageInfo = await waitForCondition(
      () =>
        cdp.eval(
          ownerSession,
          `(() => {
            const emailInput = document.getElementById('email');
            const disclosure = document.getElementById('passkeyDisclosure');
            if (!emailInput || !window.hatchable || !window.hatchable.auth) return null;
            return {
              loginTitle: document.title,
              backText: document.getElementById('returnLink')?.textContent?.trim() || '',
              hasLoginSvg: Boolean(document.querySelector('.login-logo svg')),
              disclosureVisible: Boolean(disclosure && !disclosure.hidden),
              disclosureText: disclosure ? disclosure.textContent.trim() : ''
            };
          })()`
        ),
      { label: '/login.html loaded with standalone auth bridge' }
    );
    assert.equal(loginPageInfo.loginTitle, 'Sign in · BiteShark');
    assert(loginPageInfo.backText.includes('Back to BiteShark'));
    assert.equal(loginPageInfo.hasLoginSvg, true);
    assert.equal(loginPageInfo.disclosureVisible, true, 'Passkey unavailability disclosure must be visible on /login.html');
    assert(loginPageInfo.disclosureText.toLowerCase().includes('passkeys are currently unavailable'));

    // Submit email + 14+ DOB on `/login.html` Create Account tab
    await cdp.eval(
      ownerSession,
      `(async () => {
        document.getElementById('tabSignUp').click();
        document.getElementById('email').value = ${JSON.stringify(ownerEmail)};
        document.getElementById('dobMonth').value = '06';
        document.getElementById('dobDay').value = '15';
        document.getElementById('dobYear').value = '1990';
        document.getElementById('emailForm').requestSubmit();
      })()`
    );
    await waitForCondition(
      () => cdp.eval(ownerSession, `document.getElementById('codeStep')?.hidden === false`),
      { label: 'OTP code step shown on /login.html' }
    );

    // Retrieve 6-digit OTP via operator-secret-gated staging mailbox
    const mbRes = await fetch(`${baseUrl}/api/auth/staging-mailbox`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Staging-Mailbox-Secret': mailboxSecret
      },
      body: JSON.stringify({ email: ownerEmail })
    });
    assert.equal(mbRes.status, 200);
    const { code: ownerOtpCode } = await mbRes.json();

    // Enter OTP code in `/login.html` -> establishes real `__Host-truckly_session` cookie & redirects to `/`
    await cdp.eval(
      ownerSession,
      `(async () => {
        document.getElementById('code').value = ${JSON.stringify(ownerOtpCode)};
        document.getElementById('codeForm').requestSubmit();
      })()`
    );

    const signedInOwner = await waitForCondition(
      () =>
        cdp.eval(
          ownerSession,
          `(() => {
            if (!location.pathname || location.pathname !== '/') return null;
            if (!window.trucklyReady || typeof trucks === 'undefined' || trucks.length !== 59) return null;
            if (!isSignedIn || !currentUser || !currentUser.id) return null;
            return { id: currentUser.id, email: currentUser.email };
          })()`
        ),
      { label: 'Owner redirected to / and authenticated via __Host-truckly_session' }
    );
    assert(signedInOwner.id.startsWith('usr_sa_'), 'Owner authenticated with standalone usr_sa_* user ID');

    // Grant reviewed `owner` membership on `iniguez` to the newly created standalone user ID
    await appPool.query(
      `INSERT INTO vendor_memberships (vendor_id, user_id, role, granted_by)
       VALUES ('iniguez', $1, 'owner', 'e2e_bootstrap')`,
      [signedInOwner.id]
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

    // Verify Owner browser logout revokes session cleanly
    const loggedOutState = await cdp.eval(
      ownerSession,
      `(async () => {
        await signOutUser();
        const sessRes = await fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store' });
        const sessJson = await sessRes.json();
        return {
          authenticated: sessJson.authenticated,
          heading: document.getElementById('profileHeading')?.textContent || ''
        };
      })()`
    );
    assert.equal(loggedOutState.authenticated, false, 'Owner session revoked after signOutUser()');
    assert.equal(loggedOutState.heading, 'Guest mode');

    console.log('PASS [E2E 3/3]: Customer refreshed discovery, BiteShark branding/icons, same-origin storage & logout verified');
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
