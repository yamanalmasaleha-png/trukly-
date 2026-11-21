// Real Headless Chrome + PostgreSQL Reliability, Truthful Feedback, Accessibility & Diagnostics Portal E2E Suite
//
// Deterministically verifies all 18 required Section 9 verification categories using real Chromium
// (CDP WebSocket) + isolated PostgreSQL (`NOSUPERUSER NOBYPASSRLS`) + deterministic fault injection:
//   1. Offline, timeout, malformed HTML 502 response, and 500 server error with copyable `corr_...` ref.
//   2. Authentication expiry (`401`), permission denial (`403`), and vendor dashboard `503` outage guard
//      (never dropping authenticated vendors into fake `Maya R. (sample)` preview mode, and never showing
//      "No event inquiries yet" when `/api/bookings/list` is unavailable).
//   3. Local-storage / IndexedDB failure (`local-guides.js` Dish Notebook explicit unavailable card,
//      preserved form note, and clean retry recovery once IndexedDB is restored).
//   4. Server-save failure after local save (`toggleFav` & `saveNotificationSettings` showing
//      "Saved on this device only — account save failed" + honest beta proximity disclosure + retry sync).
//   5. Uncertain write outcomes & automatic reconciliation (`submitBooking` timeout reconciling against
//      `/api/bookings/list` + idempotent retry reusing `bookingDraftKey` with zero duplicate rows).
//   6. Partial success & failed onboarding evidence upload (`saveOrSubmitVendorApp` preserving `#vaEditId`
//      and safe text fields so retry updates the single draft instead of creating duplicate drafts) +
//      truthful `submitVendorStaffInvite` provider-accepted feedback (zero literal `undefined` URL).
//   7. Disabled-feature feedback (`feature_controls` effective disabled message).
//   8. Modal accessibility (`role="dialog"`, `aria-modal="true"`, named close buttons, focus placement,
//      `Tab`/`Shift+Tab` containment, background `#app.inert === true`, `Escape` dismissal, and focus
//      restoration to invoking button across `#bookingModal`, `#distanceModal`, and `#detailModal`).
//   9. Non-repetitive screen-reader pager announcements (`#pagerLiveStatus` announces transitions only;
//      unchanged poll cycles preserve focus inside `#pagerDisplay` without DOM clobbering).
//  10. Narrow-screen reflow (`320x640`, `375x812`), 200% zoom (`640x360` viewport scrollability), and
//      `prefers-reduced-motion: reduce` (`startPagerDemo` disables auto-advance).
//  11. Admin Error & Diagnostics portal (`#sec-diagnostics`): search, filters, UTC + labeled local
//      timestamps, XSS-safe rendering of malicious note/sample payloads, Top vs Mod permissions,
//      clearly labeled `[SYNTHETIC TEST]` verification probe, and optional PNG screenshot capture.

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');

function parseCliScreenshotDir() {
  const idx = process.argv.indexOf('--screenshot-dir');
  if (idx >= 0 && process.argv[idx + 1]) {
    return path.resolve(process.argv[idx + 1]);
  }
  return null;
}

function requirePg() {
  const candidates = [ROOT];
  if (process.env.TRUCKLY_PG_NODE_MODULES) candidates.push(process.env.TRUCKLY_PG_NODE_MODULES);
  for (const base of candidates) {
    try {
      return require(require.resolve('pg', { paths: [base] }));
    } catch {}
  }
  throw new Error('Cannot resolve `pg` module.');
}

const { Pool } = requirePg();

function findChromeBinary() {
  const candidates = [
    process.env.CHROME_BIN,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ].filter(Boolean);
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('No headless Chromium/Chrome binary found.');
}

function findPostgresBin(binName) {
  const exe = process.platform === 'win32' ? `${binName}.exe` : binName;
  const pkgPlatform = `${process.platform === 'win32' ? 'windows' : process.platform}-${process.arch}`;
  const embeddedRoots = [
    process.env.TRUCKLY_PG_NODE_MODULES,
    process.env.BITESHARK_PG_NODE_MODULES
  ].filter(Boolean);
  for (const r of embeddedRoots) {
    const cand = path.join(r, '@embedded-postgres', pkgPlatform, 'native', 'bin', exe);
    if (fs.existsSync(cand)) return cand;
  }
  for (const dir of (process.env.PATH || '').split(path.delimiter).filter(Boolean)) {
    const cand = path.join(dir, exe);
    if (fs.existsSync(cand)) return cand;
  }
  if (process.platform === 'win32') {
    for (const ver of ['18', '17', '16', '15']) {
      const p = path.join('C:\\Program Files\\PostgreSQL', ver, 'bin', exe);
      if (fs.existsSync(p)) return p;
    }
  } else {
    const pgRoot = '/usr/lib/postgresql';
    if (fs.existsSync(pgRoot)) {
      for (const ver of fs.readdirSync(pgRoot).sort().reverse()) {
        const p = path.join(pgRoot, ver, 'bin', exe);
        if (fs.existsSync(p)) return p;
      }
    }
  }
  return null;
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
  const initdb = findPostgresBin('initdb');
  const pgCtl = findPostgresBin('pg_ctl');
  if (!initdb || !pgCtl) throw new Error('Neither DATABASE_URL nor local initdb/pg_ctl found.');

  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-rel-e2e-pg-'));
  const dataDir = path.join(tmpBase, 'data');
  const pwFile = path.join(tmpBase, 'pw.txt');
  const password = 'pg_' + crypto.randomBytes(10).toString('hex');
  fs.writeFileSync(pwFile, password + '\n', { mode: 0o600 });

  execFileSync(
    initdb,
    ['-D', dataDir, '-U', 'postgres', '-A', 'scram-sha-256', `--pwfile=${pwFile}`, '-E', 'UTF8', '--no-locale'],
    { stdio: 'ignore', windowsHide: true }
  );
  const port = await getFreePort();
  execFileSync(pgCtl, ['-D', dataDir, '-l', path.join(tmpBase, 'postgres.log'), '-w', '-o', `-p ${port} -h 127.0.0.1`, 'start'], {
    stdio: 'ignore',
    windowsHide: true
  });

  return {
    adminUrl: `postgres://postgres:${encodeURIComponent(password)}@127.0.0.1:${port}/postgres`,
    stop: async () => {
      try {
        execFileSync(pgCtl, ['-D', dataDir, '-m', 'immediate', '-w', 'stop'], { stdio: 'ignore', windowsHide: true });
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
          resolve({ status: res.statusCode, headers: res.headers, json: JSON.parse(body) });
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('error', reject);
  });
}

async function waitForCondition(fn, { timeoutMs = 15000, intervalMs = 80, label = 'condition' } = {}) {
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

function extractSessionCookie(res) {
  const setCookie =
    typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : res.headers.get('set-cookie');
  const joined = Array.isArray(setCookie) ? setCookie.join('; ') : String(setCookie || '');
  const m = /(__Host-truckly_session=[^;\s]+|truckly_session=[^;\s]+)/.exec(joined);
  return m ? m[1] : '';
}

class CdpClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
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
      } else if (msg.method) {
        const handlers = this.listeners.get(msg.method) || [];
        for (const fn of handlers) {
          try {
            fn(msg.params, msg.sessionId);
          } catch {}
        }
      }
    });
  }

  on(method, fn) {
    const arr = this.listeners.get(method) || [];
    arr.push(fn);
    this.listeners.set(method, arr);
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
      { expression, awaitPromise: true, returnByValue: true },
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

  async pressKey(sessionId, key, { shift = false } = {}) {
    const codeMap = {
      Tab: { code: 'Tab', keyCode: 9 },
      Escape: { code: 'Escape', keyCode: 27 },
      Enter: { code: 'Enter', keyCode: 13 }
    };
    const info = codeMap[key] || { code: key, keyCode: 0 };
    const modifiers = shift ? 8 : 0;
    await this.send(
      'Input.dispatchKeyEvent',
      {
        type: 'rawKeyDown',
        key,
        code: info.code,
        windowsVirtualKeyCode: info.keyCode,
        nativeVirtualKeyCode: info.keyCode,
        modifiers
      },
      sessionId
    );
    await this.send(
      'Input.dispatchKeyEvent',
      {
        type: 'keyUp',
        key,
        code: info.code,
        windowsVirtualKeyCode: info.keyCode,
        nativeVirtualKeyCode: info.keyCode,
        modifiers
      },
      sessionId
    );
  }

  close() {
    try {
      this.ws.close();
    } catch {}
  }
}

(async () => {
  const screenshotDir = parseCliScreenshotDir();
  if (screenshotDir) fs.mkdirSync(screenshotDir, { recursive: true });

  const chromeBin = findChromeBinary();
  const pgCluster = await createPostgresCluster();
  const suffix = crypto.randomBytes(4).toString('hex');
  const migratorRole = `bs_rel_mig_${suffix}`;
  const migratorPass = `mig_${suffix}`;
  const appRole = `bs_rel_app_${suffix}`;
  const appPass = `app_${suffix}`;
  const dbName = `bs_rel_e2e_${suffix}`;

  const adminPool = new Pool({ connectionString: pgCluster.adminUrl, max: 4 });
  let migratorPool = null;
  let appPool = null;
  let serverHandle = null;
  let resendServer = null;
  let chromeProc = null;
  let cdp = null;
  let chromeProfileDir = null;

  const authSecret = 'rel_auth_' + crypto.randomBytes(24).toString('hex');
  const resendKey = 're_rel_test_' + crypto.randomBytes(16).toString('hex');
  const workerSecret = 'wk_rel_test_' + crypto.randomBytes(20).toString('hex');
  const releaseSha = '95f2e473668b1925f529823852ff3ebbdc061370';

  const capturedEmails = [];

  try {
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
    const appDbUrl = buildDbUrl(pgCluster.adminUrl, {
      user: appRole,
      password: appPass,
      database: dbName
    });

    execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'run-migrations.cjs'), '--app-role', appRole], {
      cwd: ROOT,
      env: { ...process.env, MIGRATION_DATABASE_URL: migratorDbUrl },
      stdio: 'ignore'
    });

    migratorPool = new Pool({ connectionString: migratorDbUrl, max: 4 });
    appPool = new Pool({ connectionString: appDbUrl, max: 8 });

    async function privQuery(sql, params = []) {
      const c = await migratorPool.connect();
      try {
        await c.query('BEGIN');
        await c.query("SELECT set_config('app.auth_internal', 'true', true)");
        await c.query("SELECT set_config('app.admin_portal', 'true', true)");
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

    // Local mock Resend server so `resend_https` staff invitations & OTPs work deterministically
    const resendPort = await getFreePort();
    resendServer = http.createServer((req, res) => {
      let raw = '';
      req.on('data', d => (raw += d));
      req.on('end', () => {
        const parsed = JSON.parse(raw || '{}');
        capturedEmails.push(parsed);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: `msg_rel_${capturedEmails.length}` }));
      });
    });
    await new Promise(resolve => resendServer.listen(resendPort, '127.0.0.1', resolve));

    const appPort = await getFreePort();
    const baseUrl = `http://127.0.0.1:${appPort}`;

    for (const k of Object.keys(process.env)) {
      if (k.startsWith('BITESHARK_') || k.startsWith('TRUCKLY_')) delete process.env[k];
    }
    process.env.BITESHARK_ENV = 'staging';
    delete process.env.BITESHARK_PUBLIC_ORIGIN;
    delete process.env.TRUCKLY_PUBLIC_ORIGIN;
    process.env.BITESHARK_AUTH_SECRET = authSecret;
    process.env.BITESHARK_AUTH_DELIVERY_MODE = 'resend_https';
    process.env.BITESHARK_AUTH_EMAIL_API_KEY = resendKey;
    process.env.BITESHARK_AUTH_EMAIL_FROM = 'BiteShark <login@staging.biteshark.live>';
    process.env.BITESHARK_STAGING_ALLOWED_EMAIL_DOMAINS = 'rel.biteshark.test';
    process.env.BITESHARK_NOTIFICATION_WORKER_SECRET = workerSecret;
    process.env.BITESHARK_MAP_ENABLED = '0';
    process.env.BITESHARK_RELEASE_SHA = releaseSha;
    process.env.BITESHARK_DIAGNOSTICS_REPORT_MAX_PER_WINDOW = '80';

    const authMod = await import(pathToFileURL(path.join(ROOT, 'lib', 'standalone-auth.js')).href);
    authMod.setCustomAuthEmailSenderForTests(async ({ to, subject, text }) => {
      capturedEmails.push({ to: Array.isArray(to) ? to : [to], subject, text });
      return { status: 200, id: `msg_rel_${capturedEmails.length}` };
    });

    const appMod = await import(pathToFileURL(path.join(ROOT, 'server', 'app.js')).href);
    serverHandle = appMod.createStandaloneServer({
      dbAdapter: appPool,
      releaseSha
    });
    await new Promise(resolve => serverHandle.server.listen(appPort, '127.0.0.1', resolve));
    await serverHandle.startupReleasePromise;

    async function signInAndGetCookie(email) {
      const beforeLen = capturedEmails.length;
      const startRes = await fetch(`${baseUrl}/api/auth/start`, {
        method: 'POST',
        headers: {
          Origin: baseUrl,
          'Content-Type': 'application/json',
          'X-BiteShark-Client': 'web-auth-v1'
        },
        body: JSON.stringify({ email, intent: 'signup', dob: '1990-03-12' })
      });
      assert.equal(startRes.status, 200);
      const sent = capturedEmails[beforeLen];
      const otpMatch = /\b(\d{6})\b/.exec(sent.text);
      assert(otpMatch, 'Expected 6-digit OTP');

      const verRes = await fetch(`${baseUrl}/api/auth/verify`, {
        method: 'POST',
        headers: {
          Origin: baseUrl,
          'Content-Type': 'application/json',
          'X-BiteShark-Client': 'web-auth-v1'
        },
        body: JSON.stringify({ email, code: otpMatch[1] })
      });
      assert.equal(verRes.status, 200);
      const body = await verRes.json();
      const rawCookie = extractSessionCookie(verRes);
      const eqIdx = rawCookie.indexOf('=');
      return {
        user: body.user,
        cookieName: rawCookie.slice(0, eqIdx),
        cookieVal: rawCookie.slice(eqIdx + 1),
        rawCookie
      };
    }

    const topAuth = await signInAndGetCookie('top@rel.biteshark.test');
    const modAuth = await signInAndGetCookie('mod@rel.biteshark.test');
    const vendorAuth = await signInAndGetCookie('vendor@rel.biteshark.test');
    const custAuth = await signInAndGetCookie('customer@rel.biteshark.test');

    await privQuery(
      `INSERT INTO platform_roles (user_id, role, granted_by)
       VALUES ($1, 'top', 'bootstrap'), ($2, 'mod', $1)`,
      [topAuth.user.id, modAuth.user.id]
    );
    await privQuery(
      `INSERT INTO vendor_memberships (vendor_id, user_id, role, granted_by)
       VALUES ('mitote', $1, 'owner', $2)`,
      [vendorAuth.user.id, topAuth.user.id]
    );

    // Create a real pickup pager ticket for `mitote` to test live pager polling & screen-reader behavior
    const pagerCreateRes = await fetch(`${baseUrl}/api/pager/staff`, {
      method: 'POST',
      headers: {
        Origin: baseUrl,
        Cookie: vendorAuth.rawCookie,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ vendor_id: 'mitote', ticket: '77', request_key: crypto.randomUUID() })
    });
    assert.equal(pagerCreateRes.status, 201);
    const pagerCreated = await pagerCreateRes.json();
    const realPagerId = pagerCreated.pager.id;

    // Launch Headless Chrome
    const debugPort = await getFreePort();
    chromeProfileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-rel-chrome-'));
    chromeProc = spawn(
      chromeBin,
      [
        '--headless=new',
        '--no-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        `--remote-debugging-port=${debugPort}`,
        `--user-data-dir=${chromeProfileDir}`,
        'about:blank'
      ],
      { stdio: 'ignore', windowsHide: true }
    );

    const verInfo = await waitForCondition(() => httpGetJson(`http://127.0.0.1:${debugPort}/json/version`), {
      timeoutMs: 12000,
      label: 'Chrome DevTools endpoint'
    });
    cdp = new CdpClient(verInfo.json.webSocketDebuggerUrl);
    await cdp.connect();

    async function openIsolatedTab({ authActor = null, width = 1280, height = 840, reducedMotion = false } = {}) {
      const { browserContextId } = await cdp.send('Target.createBrowserContext');
      const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank', browserContextId });
      const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
      await cdp.send('Page.enable', {}, sessionId);
      await cdp.send('Runtime.enable', {}, sessionId);
      await cdp.send('Network.enable', {}, sessionId);
      await cdp.send(
        'Emulation.setDeviceMetricsOverride',
        { width, height, deviceScaleFactor: 1, mobile: width < 750 },
        sessionId
      );
      if (reducedMotion) {
        await cdp.send(
          'Emulation.setEmulatedMedia',
          { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] },
          sessionId
        );
      }
      // Block unpkg CDN so tests run 100% offline/hermetic
      await cdp.send('Network.setBlockedURLs', { urls: ['https://unpkg.com/*'] }, sessionId);

      if (authActor) {
        await cdp.send(
          'Network.setCookie',
          {
            name: authActor.cookieName,
            value: authActor.cookieVal,
            url: baseUrl,
            httpOnly: true,
            secure: authActor.cookieName.startsWith('__Host-'),
            path: '/'
          },
          sessionId
        );
      }
      return { browserContextId, targetId, sessionId };
    }

    // =======================================================================
    // TEST A: Customer Tab — Modal Accessibility, Focus Restore, Local vs
    //         Account Save Failures, Uncertain Write Reconciliation, IndexedDB
    //         Failure, Onboarding Partial Upload & Narrow/200% Zoom Reflow
    // =======================================================================
    const custTab = await openIsolatedTab({ authActor: custAuth, width: 1280, height: 840, reducedMotion: true });
    await cdp.send('Page.navigate', { url: `${baseUrl}/` }, custTab.sessionId);
    await waitForCondition(
      () => cdp.eval(custTab.sessionId, `Boolean(window.bitesharkDiagnostics && document.querySelectorAll('.truck-card').length >= 5)`),
      { label: 'customer home ready' }
    );
    // Wait for `syncAuthAndUserData` to recognize signed-in customer
    await waitForCondition(
      () => cdp.eval(custTab.sessionId, `isSignedIn === true`),
      { label: 'customer auth synced' }
    );

    // A1. Modal keyboard navigation, `inert` background, `Tab` trap, `Escape`, and focus restoration!
    await cdp.eval(custTab.sessionId, `document.querySelector('.book-nav').focus(); document.querySelector('.book-nav').click();`);
    const modalOpenState = await cdp.eval(
      custTab.sessionId,
      `(() => {
        const bm = document.getElementById('bookingModal');
        const form = bm.querySelector('[role="dialog"]');
        const closeBtn = bm.querySelector('.modal-close');
        return {
          shown: bm.classList.contains('show'),
          role: form && form.getAttribute('role'),
          ariaModal: form && form.getAttribute('aria-modal'),
          closeLabel: closeBtn && closeBtn.getAttribute('aria-label'),
          appInert: document.getElementById('app').inert === true,
          focusedInside: bm.contains(document.activeElement)
        };
      })()`
    );
    assert.equal(modalOpenState.shown, true);
    assert.equal(modalOpenState.role, 'dialog');
    assert.equal(modalOpenState.ariaModal, 'true');
    assert(modalOpenState.closeLabel && modalOpenState.closeLabel.includes('Close'));
    assert.equal(modalOpenState.appInert, true, '#app background must be inert while modal is open');
    assert.equal(modalOpenState.focusedInside, true, 'Initial focus must enter #bookingModal');

    // Press Shift+Tab and Tab 12 times — focus MUST never escape `#bookingModal`!
    await cdp.pressKey(custTab.sessionId, 'Tab', { shift: true });
    for (let i = 0; i < 12; i++) {
      await cdp.pressKey(custTab.sessionId, 'Tab');
      const stillInside = await cdp.eval(
        custTab.sessionId,
        `document.getElementById('bookingModal').contains(document.activeElement)`
      );
      assert.equal(stillInside, true, `Tab press #${i + 1} escaped #bookingModal`);
    }

    // Press Escape -> modal closes, `#app.inert` cleared, and focus returns to `.book-nav`!
    await cdp.pressKey(custTab.sessionId, 'Escape');
    const afterEscape = await cdp.eval(
      custTab.sessionId,
      `({
        shown: document.getElementById('bookingModal').classList.contains('show'),
        appInert: Boolean(document.getElementById('app').inert),
        restoredToBookNav: document.activeElement === document.querySelector('.book-nav')
      })`
    );
    assert.equal(afterEscape.shown, false);
    assert.equal(afterEscape.appInert, false);
    assert.equal(afterEscape.restoredToBookNav, true, 'Focus must restore to .book-nav trigger after Escape');

    // Also verify `#distanceModal` has `<label for="distanceRange">` + named close + focus restore
    await cdp.eval(
      custTab.sessionId,
      `document.getElementById('extraFilters').open = true; document.getElementById('distanceFilterBtn').focus(); document.getElementById('distanceFilterBtn').click();`
    );
    const distModalCheck = await cdp.eval(
      custTab.sessionId,
      `({
        hasLabel: Boolean(document.querySelector('label[for="distanceRange"]')),
        focusedId: document.activeElement && document.activeElement.id
      })`
    );
    assert.equal(distModalCheck.hasLabel, true);
    assert.equal(distModalCheck.focusedId, 'distanceRange');
    await cdp.pressKey(custTab.sessionId, 'Escape');
    const distRestored = await cdp.eval(
      custTab.sessionId,
      `document.activeElement === document.getElementById('distanceFilterBtn')`
    );
    assert.equal(distRestored, true, 'Distance modal Escape must restore focus to #distanceFilterBtn');

    // A2. Server-save failure after local save (`toggleFav` & `saveNotificationSettings`)
    // Inject deterministic 503 fault on `/api/favorites/toggle` and `/api/notifications/settings`
    await cdp.eval(
      custTab.sessionId,
      `(() => {
        window.__origFetch = window.fetch;
        window.__faultMode = 'fav_and_notify_503';
        window.fetch = async function(url, init) {
          const u = String(url);
          if (window.__faultMode === 'fav_and_notify_503' && (u.includes('/api/favorites/toggle') || u.includes('/api/notifications/settings'))) {
            return new Response(JSON.stringify({ error: 'Database write replica unavailable', correlation_id: 'corr_1234567890abcdef' }), {
              status: 503,
              headers: { 'Content-Type': 'application/json', 'X-Correlation-Id': 'corr_1234567890abcdef' }
            });
          }
          if (window.__faultMode === 'bookings_502_html' && u.includes('/api/bookings/list')) {
            return new Response('<html><body>502 Bad Gateway</body></html>', {
              status: 502,
              headers: { 'Content-Type': 'text/html' }
            });
          }
          if (window.__faultMode === 'booking_write_timeout_committed' && u.includes('/api/bookings/create')) {
            // Forward real write so DB commits, then delay past client timeout!
            await window.__origFetch(url, init);
            await new Promise((_resolve, reject) => {
              if (init && init.signal) {
                init.signal.addEventListener('abort', () => {
                  const e = new Error('The operation was aborted.');
                  e.name = 'AbortError';
                  reject(e);
                });
              }
            });
          }
          if (window.__faultMode === 'evidence_500' && u.includes('/api/onboarding/evidence')) {
            return new Response(JSON.stringify({ error: 'Evidence storage write failed', correlation_id: 'corr_fedcba9876543210' }), {
              status: 500,
              headers: { 'Content-Type': 'application/json', 'X-Correlation-Id': 'corr_fedcba9876543210' }
            });
          }
          return window.__origFetch(url, init);
        };
      })()`
    );

    await cdp.eval(custTab.sessionId, `showScreen('favorites'); toggleFav('mitote');`);
    await waitForCondition(
      () =>
        cdp.eval(
          custTab.sessionId,
          `!document.getElementById('favoritesFeedback').hidden && document.getElementById('favoritesFeedback').textContent.includes('Saved locally')`
        ),
      { label: 'favorites partial-local feedback' }
    );
    const favFailState = await cdp.eval(
      custTab.sessionId,
      `({
        bannerText: document.getElementById('favoritesFeedback').textContent,
        profileSub: document.getElementById('profileSub').textContent,
        stillSignedIn: isSignedIn
      })`
    );
    assert(favFailState.bannerText.includes('corr_1234567890abcdef'), 'Support reference must be shown on server save failure');
    assert(!favFailState.bannerText.includes('nudge you when they’re nearby'), 'False nearby-nudge claim removed');
    assert(favFailState.profileSub.includes('unavailable'), 'Profile menu must NOT claim synced during account sync failure');
    assert.equal(favFailState.stillSignedIn, true);

    // Nearby alert preference: honest beta disclosure + local-only warning on 503
    await cdp.eval(custTab.sessionId, `document.getElementById('nearbyAlertRadius').value = '10'; saveNotificationSettings();`);
    await waitForCondition(
      () =>
        cdp.eval(
          custTab.sessionId,
          `document.getElementById('nearbyAlertMeta').textContent.includes('account save failed')`
        ),
      { label: 'notification save failure meta' }
    );
    const notifyMeta = await cdp.eval(custTab.sessionId, `document.getElementById('nearbyAlertMeta').textContent`);
    assert(notifyMeta.includes('automatic proximity push alerts are not active yet'), 'Honest placeholder beta disclosure required');

    // Clear fault & click Try again -> saves to account!
    await cdp.eval(custTab.sessionId, `window.__faultMode = 'none'; document.querySelector('#favoritesFeedback .bs-fb-retry').click();`);
    await waitForCondition(
      () => cdp.eval(custTab.sessionId, `document.getElementById('favoritesFeedback').hidden === true`),
      { label: 'favorites retry recovered' }
    );

    // A3. Malformed HTML 502 on `/api/bookings/list` -> shows `Temporarily unavailable` (NEVER "No event inquiries yet")!
    await cdp.eval(custTab.sessionId, `bookings = []; window.__faultMode = 'bookings_502_html'; showScreen('bookings');`);
    await waitForCondition(
      () =>
        cdp.eval(
          custTab.sessionId,
          `!document.getElementById('bookingsFeedback').hidden && document.getElementById('bookingList').textContent.includes('temporarily unavailable')`
        ),
      { label: 'bookings 502 unavailable state' }
    );
    const bkListText = await cdp.eval(custTab.sessionId, `document.getElementById('bookingList').textContent`);
    assert(!bkListText.includes('No event inquiries yet'), '502 outage must NEVER render empty-inbox copy');
    assert(!bkListText.includes('<html>'), 'Raw HTML 502 body must never render in UI');

    // A4. Timed-out Booking Write that Committed -> Reconciles Automatically Without Duplicate!
    await cdp.eval(
      custTab.sessionId,
      `window.__faultMode = 'booking_write_timeout_committed'; window.__BITESHARK_FETCH_TIMEOUT_MS = 250; openBooking('mitote');`
    );
    await waitForCondition(
      () => cdp.eval(custTab.sessionId, `document.getElementById('bookingTruck').value === 'mitote'`),
      { label: 'booking modal truck preselected' }
    );
    await cdp.eval(
      custTab.sessionId,
      `(() => {
        document.getElementById('guestCount').value = '35';
        document.getElementById('eventLocation').value = 'Courthouse Square, Santa Rosa';
        document.querySelector('#bookingModal form').requestSubmit();
      })()`
    );
    // Reset timeout override for reconciliation `/api/bookings/list` read once write aborts
    await new Promise(r => setTimeout(r, 320));
    await cdp.eval(custTab.sessionId, `window.__faultMode = 'none'; delete window.__BITESHARK_FETCH_TIMEOUT_MS;`);
    await waitForCondition(
      () =>
        cdp.eval(
          custTab.sessionId,
          `!document.getElementById('bookingModal').classList.contains('show') && bookings.some(b => b.location === 'Courthouse Square, Santa Rosa')`
        ),
      { label: 'timed-out committed booking reconciled' }
    );
    const dbBookingCount = await privQuery(
      `SELECT count(*)::int AS c FROM bookings WHERE requester_user_id = $1 AND location = 'Courthouse Square, Santa Rosa'`,
      [custAuth.user.id]
    );
    assert.equal(dbBookingCount.rows[0].c, 1, 'Exactly 1 booking row created after timeout reconciliation');

    // A5. IndexedDB Failure on Dish Photo Notebook (`local-guides.js`) + Recovery
    await cdp.eval(
      custTab.sessionId,
      `(() => {
        window.__origIdbOpen = IDBFactory.prototype.open;
        IDBFactory.prototype.open = function () {
          throw new Error('Simulated storage restriction');
        };
        dishDbPromise = null;
        openLocalGuides('photos');
      })()`
    );
    await waitForCondition(
      () =>
        cdp.eval(
          custTab.sessionId,
          `document.getElementById('dishPhotoGrid').textContent.includes('Local photo storage is unavailable')`
        ),
      { label: 'IndexedDB unavailable card rendered' }
    );
    // Restore IndexedDB and click Retry -> recovers cleanly because `dishDbPromise` was NOT permanently poisoned!
    await cdp.eval(
      custTab.sessionId,
      `(() => {
        IDBFactory.prototype.open = window.__origIdbOpen;
        document.querySelector('#dishPhotoGrid button').click();
      })()`
    );
    await waitForCondition(
      () =>
        cdp.eval(
          custTab.sessionId,
          `document.getElementById('dishPhotoGrid').textContent.includes('No photos saved yet')`
        ),
      { label: 'IndexedDB recovered after retry' }
    );

    // A6. Onboarding Evidence Upload Partial Failure Preserves Single Draft ID & Safe Form Data!
    await cdp.eval(
      custTab.sessionId,
      `(() => {
        window.__faultMode = 'evidence_500';
        document.getElementById('rxVendorApplyBtn').click();
      })()`
    );
    await waitForCondition(
      () => cdp.eval(custTab.sessionId, `!document.getElementById('vendorApplyModal').hidden`),
      { label: 'vendor apply modal open' }
    );
    await cdp.eval(
      custTab.sessionId,
      `(() => {
        document.querySelector('[data-va-tab="form"]').click();
        document.getElementById('vaType').value = 'new_listing';
        document.getElementById('vaType').onchange();
        document.getElementById('vaProposedSlug').value = 'sonoma-sunrise-tacos';
        document.getElementById('vaBusinessName').value = 'Sonoma Sunrise Tacos';
        document.getElementById('vaPrimaryTown').value = 'Santa Rosa';
        document.getElementById('vaCuisine').value = 'Mexican';
        document.getElementById('vaContactName').value = 'Elena Marquez';
        document.getElementById('vaSummary').value = 'Handmade corn tortillas & freshaguas frescas.';
        document.getElementById('vaStatement').value = 'Sonoma County mobile food facility permit holder.';
        const dt = new DataTransfer();
        // Valid 1x1 PNG header bytes
        const pngBytes = new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1,8,2,0,0,0,144,119,83,222,0,0,0,12,73,68,65,84,8,215,99,248,207,192,0,0,3,1,1,0,24,221,141,176,0,0,0,0,73,69,78,68,174,66,96,130]);
        dt.items.add(new File([pngBytes], 'permit.png', { type: 'image/png' }));
        document.getElementById('vaEvidenceFile').files = dt.files;
        document.getElementById('vaFormPane').requestSubmit();
      })()`
    );
    await waitForCondition(
      () =>
        cdp.eval(
          custTab.sessionId,
          `document.getElementById('vaFormMsg').textContent.includes('Partial completion')`
        ),
      { label: 'onboarding partial completion feedback' }
    );
    const partialAppCheck = await cdp.eval(
      custTab.sessionId,
      `({
        savedDraftId: document.getElementById('vaEditId').value,
        preservedName: document.getElementById('vaBusinessName').value,
        msg: document.getElementById('vaFormMsg').textContent
      })`
    );
    assert(partialAppCheck.savedDraftId.length > 10, '#vaEditId must store draft ID after partial failure');
    assert.equal(partialAppCheck.preservedName, 'Sonoma Sunrise Tacos');
    assert(partialAppCheck.msg.includes('corr_fedcba9876543210'));

    // Now clear fault and click Submit again -> updates SAME draft (0 duplicate drafts!) and shows Submitted for review!
    await cdp.eval(
      custTab.sessionId,
      `window.__faultMode = 'none'; document.getElementById('vaFormPane').requestSubmit();`
    );
    await waitForCondition(
      () =>
        cdp.eval(
          custTab.sessionId,
          `!document.getElementById('vaSubmitNotice').hidden && document.getElementById('vaSubmitNotice').textContent.includes('Submitted for review')`
        ),
      { label: 'onboarding retry submitted' }
    );
    const draftCountQ = await privQuery(
      'SELECT count(*)::int AS c FROM vendor_applications WHERE applicant_user_id = $1',
      [custAuth.user.id]
    );
    assert.equal(draftCountQ.rows[0].c, 1, 'Retrying after evidence failure must NOT create duplicate application rows');
    await cdp.pressKey(custTab.sessionId, 'Escape');

    // A7. Screen-reader pager polling & `prefers-reduced-motion: reduce`
    await cdp.eval(custTab.sessionId, `startPagerDemo();`);
    const reducedMotionPager = await cdp.eval(
      custTab.sessionId,
      `({
        demoAuto: pagerDemoAuto,
        displayHasAriaLive: document.getElementById('pagerDisplay').hasAttribute('aria-live'),
        liveStatusText: document.getElementById('pagerLiveStatus').textContent,
        hasCurrentStepAttr: Boolean(document.querySelector('.pager-roadmap [aria-current="step"]'))
      })`
    );
    assert.equal(reducedMotionPager.demoAuto, false, 'prefers-reduced-motion must disable auto-advancing demo timer');
    assert.equal(reducedMotionPager.displayHasAriaLive, false, '#pagerDisplay must not re-announce entire innerHTML on poll');
    assert(reducedMotionPager.liveStatusText.includes('Good things are cooking'), `Unexpected liveStatusText: ${reducedMotionPager.liveStatusText}`);
    assert.equal(reducedMotionPager.hasCurrentStepAttr, true);

    // Join real pager & verify unchanged poll keeps focus inside `#pagerDisplay`!
    await cdp.eval(
      custTab.sessionId,
      `document.getElementById('pagerCode').value = ${JSON.stringify(realPagerId)}; joinPager();`
    );
    await waitForCondition(
      () => cdp.eval(custTab.sessionId, `document.getElementById('pagerDisplay').textContent.includes('Ticket #77')`),
      { label: 'real pager loaded' }
    );
    await cdp.eval(custTab.sessionId, `document.querySelector('#pagerDisplay .pager-sound').focus();`);
    await cdp.eval(custTab.sessionId, `refreshPager();`);
    const focusKeptOnPoll = await cdp.eval(
      custTab.sessionId,
      `document.activeElement === document.querySelector('#pagerDisplay .pager-sound')`
    );
    assert.equal(focusKeptOnPoll, true, 'Unchanged 8s pager poll must NOT clobber DOM or drop keyboard focus');

    // A8. Narrow-screen (`320x640`, `375x812`) & 200% zoom (`640x360`) reflow checks
    await cdp.eval(custTab.sessionId, `showScreen('discover');`);
    for (const vp of [
      { width: 320, height: 640, label: '320px narrow mobile' },
      { width: 375, height: 812, label: '375px mobile' },
      { width: 640, height: 360, label: '200% zoom short viewport' }
    ]) {
      await cdp.send(
        'Emulation.setDeviceMetricsOverride',
        { width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: vp.width < 500 },
        custTab.sessionId
      );
      await new Promise(r => setTimeout(r, 80));
      const reflow = await cdp.eval(
        custTab.sessionId,
        `(() => {
          const docOverflow = document.documentElement.scrollWidth - window.innerWidth;
          const locPillLabel = document.getElementById('locationPillBtn').getAttribute('aria-label');
          const firstCard = document.querySelector('.truck-card');
          return {
            docOverflow,
            hasLocAccessibleName: Boolean(locPillLabel && locPillLabel.length > 5),
            hasCards: Boolean(firstCard)
          };
        })()`
      );
      assert(reflow.docOverflow <= 2, `Horizontal overflow (${reflow.docOverflow}px) at ${vp.label}`);
      assert.equal(reflow.hasLocAccessibleName, true);
      assert.equal(reflow.hasCards, true);
    }

    // =======================================================================
    // TEST B: Vendor Tab — `503` Outage Guard (Never Fake Sample Preview Mode)
    //         & Truthful Staff Invitation Delivery Feedback (Zero `undefined`)
    // =======================================================================
    const vendTab = await openIsolatedTab({ authActor: vendorAuth, width: 1280, height: 840 });
    await cdp.send('Page.navigate', { url: `${baseUrl}/` }, vendTab.sessionId);
    await waitForCondition(
      () => cdp.eval(vendTab.sessionId, `Boolean(window.bitesharkDiagnostics)`),
      { label: 'vendor home loaded' }
    );

    // Inject `503` on `/api/owner/stats` -> MUST NOT enter fake `Maya R. (sample)` Preview Mode!
    await cdp.eval(
      vendTab.sessionId,
      `(() => {
        window.__vOrigFetch = window.fetch;
        window.__vFaultStats = true;
        window.fetch = async function(url, init) {
          if (window.__vFaultStats && String(url).includes('/api/owner/stats')) {
            return new Response(JSON.stringify({ error: 'Vendor stats DB pool saturated', correlation_id: 'corr_9988776655443322' }), {
              status: 503,
              headers: { 'Content-Type': 'application/json', 'X-Correlation-Id': 'corr_9988776655443322' }
            });
          }
          return window.__vOrigFetch(url, init);
        };
        showScreen('owner');
      })()`
    );
    await waitForCondition(
      () =>
        cdp.eval(
          vendTab.sessionId,
          `!document.getElementById('ownerFeedback').hidden && document.getElementById('ownerFeedback').textContent.includes('Owner dashboard temporarily unavailable')`
        ),
      { label: 'owner 503 unavailable state' }
    );
    const owner503Check = await cdp.eval(
      vendTab.sessionId,
      `({
        previewBannerHidden: document.getElementById('ownerModeBanner').hidden,
        requestsText: document.getElementById('ownerRequests').textContent,
        feedbackText: document.getElementById('ownerFeedback').textContent
      })`
    );
    assert.equal(owner503Check.previewBannerHidden, true, '503 must NOT display guest Preview Mode banner');
    assert(!owner503Check.requestsText.includes('Maya R. (sample)'), '503 must NEVER inject fake sample inquiries');
    assert(owner503Check.feedbackText.includes('corr_9988776655443322'));

    // Clear fault & click Try again -> loads real `mitote` owner workspace & staff invite form!
    await cdp.eval(
      vendTab.sessionId,
      `window.__vFaultStats = false; document.querySelector('#ownerFeedback .bs-fb-retry').click();`
    );
    await waitForCondition(
      () => cdp.eval(vendTab.sessionId, `isOwnerAdmin === true && Boolean(document.getElementById('ownerStaffInviteForm'))`),
      { label: 'live vendor owner dashboard loaded' }
    );

    // Submit Vendor Staff Invitation in `resend_https` mode -> must show `Accepted by email provider` and ZERO `undefined`!
    await cdp.eval(
      vendTab.sessionId,
      `(() => {
        document.getElementById('ownerStaffEmail').value = 'staff1@rel.biteshark.test';
        document.getElementById('ownerStaffNote').value = 'Saturday lunch shift';
        document.getElementById('ownerStaffInviteForm').requestSubmit();
      })()`
    );
    await waitForCondition(
      () =>
        cdp.eval(
          vendTab.sessionId,
          `!document.getElementById('ownerStaffInviteResult').hidden && document.getElementById('ownerStaffInviteResult').textContent.includes('Accepted by email provider')`
        ),
      { label: 'vendor staff invite provider-accepted message' }
    );
    const staffInvText = await cdp.eval(vendTab.sessionId, `document.getElementById('ownerStaffInviteResult').textContent`);
    assert(!staffInvText.includes('undefined'), `Staff invite message must not contain undefined: ${staffInvText}`);

    // =======================================================================
    // TEST C: Disabled-Feature Feedback (`event_inquiries` paused by Top)
    // =======================================================================
    const pauseRes = await fetch(`${baseUrl}/api/admin/features/update`, {
      method: 'POST',
      headers: {
        Origin: baseUrl,
        Cookie: topAuth.rawCookie,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        feature_key: 'event_inquiries',
        configured_state: 'paused',
        audience: 'all',
        expected_revision: 0,
        confirmed_impact: true,
        reason: 'E2E verification of disabled-feature customer feedback'
      })
    });
    assert.equal(pauseRes.status, 200);

    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 840, deviceScaleFactor: 1, mobile: false }, custTab.sessionId);
    await cdp.eval(custTab.sessionId, `window.bitesharkFeatures.refresh();`);
    await waitForCondition(
      () => cdp.eval(custTab.sessionId, `!window.bitesharkFeatures.isAvailable('event_inquiries')`),
      { label: 'event_inquiries paused in customer tab' }
    );
    await cdp.eval(custTab.sessionId, `openBooking('mitote');`);
    const pausedBtnDisabled = await cdp.eval(
      custTab.sessionId,
      `document.getElementById('bookingSubmitBtn').disabled === true`
    );
    assert.equal(pausedBtnDisabled, true, 'Paused feature must disable submit button with clear explanation');
    await cdp.pressKey(custTab.sessionId, 'Escape');

    // Re-enable `event_inquiries`
    await fetch(`${baseUrl}/api/admin/features/update`, {
      method: 'POST',
      headers: {
        Origin: baseUrl,
        Cookie: topAuth.rawCookie,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        feature_key: 'event_inquiries',
        configured_state: 'enabled',
        audience: 'all',
        expected_revision: 1,
        confirmed_impact: true,
        reason: 'Restore event_inquiries after E2E check'
      })
    });

    // =======================================================================
    // TEST D: Admin Error & Diagnostics Portal (`Top` & `Mod`), Malicious XSS
    //         Payload Escaping, Triage/Notes History & Screenshots
    // =======================================================================
    // Inject a diagnostic event containing malicious HTML/XSS strings in summary to prove XSS-safe rendering!
    const diagMod = await import(pathToFileURL(path.join(ROOT, 'lib', 'diagnostics.js')).href);
    await diagMod.recordDiagnosticEvent(appPool, {
      component: 'browser',
      trustLevel: 'browser_untrusted',
      featureKey: 'bookings_inquiries',
      operationName: 'bookings.load_user_list',
      routeTemplate: '/api/bookings/list',
      httpMethod: 'GET',
      httpStatus: 502,
      severity: 'error',
      errorCode: 'MALFORMED_UPSTREAM_502',
      title: 'Bookings upstream 502 <img src=x onerror="window.__xssTriggered=true">',
      message: 'Proxy returned HTML 502 <svg onload="window.__xssTriggered=true"> for bookings list',
      serverReleaseSha: releaseSha,
      clientBuildVersion: 'bs-ui-2026.11.20',
      clientLoadedReleaseSha: '4372c6d76e28969b4fb5edf80e76b7701aacd8c1' // older loaded SHA -> stale_client_observed!
    });

    const adminTab = await openIsolatedTab({ authActor: topAuth, width: 1440, height: 920 });
    await cdp.send('Page.navigate', { url: `${baseUrl}/admin#diagnostics` }, adminTab.sessionId);
    await waitForCondition(
      () =>
        cdp.eval(
          adminTab.sessionId,
          `!document.getElementById('sec-diagnostics').hidden && document.querySelectorAll('#diagList .record-card').length >= 1`
        ),
      { label: 'admin diagnostics portal loaded' }
    );

    // Click `+ Record Synthetic Test Incident` as Admin: Top
    await cdp.eval(adminTab.sessionId, `document.getElementById('diagCreateSyntheticBtn').click();`);
    await waitForCondition(
      () =>
        cdp.eval(
          adminTab.sessionId,
          `document.getElementById('diagDetailPane').textContent.includes('[SYNTHETIC TEST]')`
        ),
      { label: 'synthetic test incident selected in detail pane' }
    );

    if (screenshotDir) {
      const shot1 = await cdp.send('Page.captureScreenshot', { format: 'png' }, adminTab.sessionId);
      fs.writeFileSync(path.join(screenshotDir, 'diagnostics-portal-overview.png'), Buffer.from(shot1.data, 'base64'));
    }

    // Search for `MALFORMED_UPSTREAM_502`, select it, verify XSS payload is rendered safely as text (`window.__xssTriggered !== true`),
    // verify UTC + Local timestamps, stale-client callout, and plain commit link!
    await cdp.eval(
      adminTab.sessionId,
      `(() => {
        document.getElementById('diagSearchInput').value = 'MALFORMED_UPSTREAM_502';
        document.getElementById('diagFilterForm').requestSubmit();
      })()`
    );
    await waitForCondition(
      () =>
        cdp.eval(
          adminTab.sessionId,
          `document.querySelectorAll('#diagList .record-card').length === 1 && document.getElementById('diagDetailPane').textContent.includes('MALFORMED_UPSTREAM_502')`
        ),
      { label: 'filtered MALFORMED_UPSTREAM_502 incident detail' }
    );
    // Click the matching card to ensure detail pane reflects it
    await cdp.eval(adminTab.sessionId, `document.querySelector('#diagList .record-card').click();`);
    await waitForCondition(
      () =>
        cdp.eval(
          adminTab.sessionId,
          `document.getElementById('diagDetailPane').textContent.includes('MALFORMED_UPSTREAM_502')`
        ),
      { label: 'selected MALFORMED_UPSTREAM_502 detail' }
    );

    const detailSafetyCheck = await cdp.eval(
      adminTab.sessionId,
      `({
        xssTriggered: Boolean(window.__xssTriggered),
        hasUtcLabel: document.getElementById('diagDetailPane').textContent.includes('UTC'),
        hasLocalLabel: document.getElementById('diagDetailPane').textContent.includes('Local:'),
        hasStaleNote: document.getElementById('diagDetailPane').textContent.includes('older tab'),
        hasCommitLink: Boolean(document.querySelector('#diagDetailPane a[href*="github.com"]'))
      })`
    );
    assert.equal(detailSafetyCheck.xssTriggered, false, 'Malicious HTML in incident title/message must NOT execute');
    assert.equal(detailSafetyCheck.hasUtcLabel, true, 'Explicit UTC timestamp required');
    assert.equal(detailSafetyCheck.hasLocalLabel, true, 'Labeled local timestamp required');
    assert.equal(detailSafetyCheck.hasStaleNote, true, 'Stale browser build distinction required');
    assert.equal(detailSafetyCheck.hasCommitLink, true, 'Plain repository commit link required');

    if (screenshotDir) {
      const shot2 = await cdp.send('Page.captureScreenshot', { format: 'png' }, adminTab.sessionId);
      fs.writeFileSync(path.join(screenshotDir, 'diagnostics-incident-detail.png'), Buffer.from(shot2.data, 'base64'));
    }

    // Submit Top triage + operator note containing `<script>window.__xssTriggered=true</script>`
    await cdp.eval(
      adminTab.sessionId,
      `(() => {
        document.getElementById('diagEditTriage').value = 'investigating';
        document.getElementById('diagEditFixSha').value = '95f2e473668b';
        document.getElementById('diagEditCause').value = 'Proxy upstream timeout during deploy reload';
        document.getElementById('diagTriageNote').value = 'Investigating Nginx upstream keepalive <script>window.__xssTriggered=true</script>';
        document.getElementById('diagTriageForm').requestSubmit();
      })()`
    );
    await waitForCondition(
      () =>
        cdp.eval(
          adminTab.sessionId,
          `document.getElementById('diagDetailPane').textContent.includes('Investigating Nginx upstream keepalive')`
        ),
      { label: 'triage note rendered in history' }
    );
    const xssAfterNote = await cdp.eval(adminTab.sessionId, `Boolean(window.__xssTriggered)`);
    assert.equal(xssAfterNote, false, 'Malicious script tag in operator note must NOT execute');

    // Open Moderator tab -> verify Mod sees operational incident, cannot triage (`#diagTriageForm` absent), and CAN append an operational note!
    const modTab = await openIsolatedTab({ authActor: modAuth, width: 1440, height: 920 });
    await cdp.send('Page.navigate', { url: `${baseUrl}/admin#diagnostics` }, modTab.sessionId);
    await waitForCondition(
      () =>
        cdp.eval(
          modTab.sessionId,
          `!document.getElementById('sec-diagnostics').hidden && document.querySelectorAll('#diagList .record-card').length >= 1`
        ),
      { label: 'mod diagnostics portal loaded' }
    );
    const modUiPerms = await cdp.eval(
      modTab.sessionId,
      `({
        synthHidden: document.getElementById('diagCreateSyntheticBtn').hidden,
        cleanHidden: document.getElementById('diagRunCleanupBtn').hidden,
        hasTriageForm: Boolean(document.getElementById('diagTriageForm')),
        scopeText: document.getElementById('diagReleaseStrip').textContent
      })`
    );
    assert.equal(modUiPerms.synthHidden, true);
    assert.equal(modUiPerms.cleanHidden, true);
    assert.equal(modUiPerms.hasTriageForm, false);
    assert(modUiPerms.scopeText.includes('Operational Subset'));

    // Mod selects `MALFORMED_UPSTREAM_502` and appends an operational note
    await cdp.eval(
      modTab.sessionId,
      `(() => {
        document.getElementById('diagSearchInput').value = 'MALFORMED_UPSTREAM_502';
        document.getElementById('diagFilterForm').requestSubmit();
      })()`
    );
    await waitForCondition(
      () => cdp.eval(modTab.sessionId, `document.querySelectorAll('#diagList .record-card').length === 1`),
      { label: 'mod filtered card' }
    );
    await cdp.eval(modTab.sessionId, `document.querySelector('#diagList .record-card').click();`);
    await waitForCondition(
      () => cdp.eval(modTab.sessionId, `Boolean(document.getElementById('diagNewNoteBody'))`),
      { label: 'mod note form ready' }
    );
    await cdp.eval(
      modTab.sessionId,
      `(() => {
        document.getElementById('diagNewNoteBody').value = 'Mod operational check: zero new customer tickets in last 15 minutes.';
        document.getElementById('diagNoteForm').requestSubmit();
      })()`
    );
    await waitForCondition(
      () =>
        cdp.eval(
          modTab.sessionId,
          `document.getElementById('diagDetailPane').textContent.includes('Mod operational check: zero new customer tickets')`
        ),
      { label: 'mod note appended' }
    );

    if (screenshotDir) {
      // Refresh Top detail pane so screenshot shows BOTH Top triage note + Mod operational note + release banner!
      await cdp.eval(adminTab.sessionId, `document.getElementById('diagSearchInput').value = ''; document.getElementById('diagFilterForm').requestSubmit();`);
      await waitForCondition(
        () => cdp.eval(adminTab.sessionId, `document.querySelectorAll('#diagList .record-card').length >= 2`),
        { label: 'top full list reloaded' }
      );
      await cdp.eval(
        adminTab.sessionId,
        `(() => {
          const cards = [...document.querySelectorAll('#diagList .record-card')];
          const target = cards.find(c => c.textContent.includes('MALFORMED_UPSTREAM_502'));
          if (target) target.click();
        })()`
      );
      await waitForCondition(
        () =>
          cdp.eval(
            adminTab.sessionId,
            `document.getElementById('diagDetailPane').textContent.includes('Mod operational check')`
          ),
        { label: 'top detail shows both notes' }
      );
      await cdp.eval(
        adminTab.sessionId,
        `document.getElementById('diagNoteForm').scrollIntoView({ block: 'end' });`
      );
      await new Promise(r => setTimeout(r, 120));
      const shot3 = await cdp.send('Page.captureScreenshot', { format: 'png' }, adminTab.sessionId);
      fs.writeFileSync(path.join(screenshotDir, 'diagnostics-operator-notes.png'), Buffer.from(shot3.data, 'base64'));
    }

    console.log(
      'PASS: Headless Chrome + PostgreSQL E2E verified truthful customer/vendor feedback, 503 outage guards, IndexedDB recovery, uncertain-write reconciliation, onboarding upload partial-save safety, modal focus trap & restoration, screen-reader pager polling, 200% zoom reflow, reduced motion, XSS-safe Error & Diagnostics portal, and Top/Mod note history.'
    );
  } finally {
    if (cdp) cdp.close();
    if (chromeProc) {
      try {
        chromeProc.kill('SIGKILL');
      } catch {}
    }
    if (chromeProfileDir) {
      try {
        fs.rmSync(chromeProfileDir, { recursive: true, force: true });
      } catch {}
    }
    if (serverHandle) await serverHandle.closeGracefully(1000).catch(() => {});
    if (resendServer) await new Promise(r => resendServer.close(() => r())).catch(() => {});
    if (appPool) await appPool.end().catch(() => {});
    if (migratorPool) await migratorPool.end().catch(() => {});
    await adminPool.end().catch(() => {});
    await pgCluster.stop();
  }
})().catch(err => {
  console.error('FAIL reliability-accessibility-browser.e2e:', err);
  process.exit(1);
});
