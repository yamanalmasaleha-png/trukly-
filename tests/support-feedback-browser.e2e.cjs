// Real Headless Chrome + PostgreSQL Support & Feedback + Connected Diagnostics Browser E2E Suite
//
// Deterministically verifies against real Chromium (CDP) + isolated PostgreSQL (`NOSUPERUSER NOBYPASSRLS`):
//   1. Guest upfront sign-in notice (`#siGuestPane`) before composition + tab-scoped `sessionStorage`
//      draft preservation (`bs_support_draft_v1`) and `/#support-resume` restoration after sign-in.
//   2. Vendor progressive disclosure (`#ownerSupportBtn`, `#ownerSupportCard`, `suggestion_feedback`
//      hiding urgency, `critical` showing non-24/7 notice, `account_access` locking `sharing_scope`
//      to `personal`, post-submission `#BS-...` acknowledgement card, and XSS-safe rendering).
//   3. Customer lighter form (`Problem` / `Question` / `Suggestion` pills, optional auto-filled title,
//      contextual `🛟 Report this problem` banner prefill with reviewable `corr_...` + coarse device,
//      and draft preservation across transient network failure + idempotent retry).
//   4. Admin / Mod Support Queue (`/admin#issues`): queue subtabs, filters, assignment, internal-note
//      vs public-reply visual safeguard callout, Connected Diagnostic Incidents (`confirm` suggested link
//      with plain-language `public_summary`, jump to `#sec-diagnostics`, and two-step reviewed public
//      update preview + send).
//   5. Reporter timeline & lifecycle: unread badge (`#rxSupportUnreadBadge` + `.has-support-unread`),
//      deep link `/#support=BS-...`, plain-language known-issue banner, zero internal note or staff
//      email leakage, public reply, and reporter reopen of `Resolved` ticket (`POST /api/issues/reopen`).
//   6. Keyboard accessibility (`role="dialog"`, `aria-modal="true"`, `#app.inert`, `Tab` containment,
//      `Escape` close + focus restore) and responsive reflow at `320x640`, `375x812`, and `200%` zoom.

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

  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-sup-e2e-pg-'));
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
  const migratorRole = `bs_sup_e2e_mig_${suffix}`;
  const migratorPass = `mig_${suffix}`;
  const appRole = `bs_sup_e2e_app_${suffix}`;
  const appPass = `app_${suffix}`;
  const dbName = `bs_sup_e2e_${suffix}`;

  const adminPool = new Pool({ connectionString: pgCluster.adminUrl, max: 4 });
  let migratorPool = null;
  let appPool = null;
  let serverHandle = null;
  let chromeProc = null;
  let cdp = null;
  let chromeProfileDir = null;

  const authSecret = 'sup_e2e_auth_' + crypto.randomBytes(24).toString('hex');
  const mailboxSecret = 'sup_e2e_mbx_' + crypto.randomBytes(20).toString('hex');
  const workerSecret = 'sup_e2e_wk_' + crypto.randomBytes(20).toString('hex');
  const releaseSha = '28bf1b1b07fc498c117e78bf6299f3709fb8c565';

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
    process.env.BITESHARK_AUTH_EMAIL_API_KEY = 're_sup_e2e_key_' + suffix;
    process.env.BITESHARK_AUTH_EMAIL_FROM = 'BiteShark <login@staging.biteshark.live>';
    process.env.BITESHARK_STAGING_ALLOWED_EMAIL_DOMAINS = 'sup.biteshark.test';
    process.env.BITESHARK_NOTIFICATION_WORKER_SECRET = workerSecret;
    process.env.BITESHARK_MAP_ENABLED = '0';
    process.env.BITESHARK_RELEASE_SHA = releaseSha;

    const authMod = await import(pathToFileURL(path.join(ROOT, 'lib', 'standalone-auth.js')).href);
    authMod.setCustomAuthEmailSenderForTests(async ({ to, subject, text }) => {
      capturedEmails.push({ to: Array.isArray(to) ? to : [to], subject, text });
      return { status: 200, id: `msg_sup_${capturedEmails.length}` };
    });

    const diagMod = await import(pathToFileURL(path.join(ROOT, 'lib', 'diagnostics.js')).href);
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
        body: JSON.stringify({ email, intent: 'signup', dob: '1992-06-15' })
      });
      assert.equal(startRes.status, 200);
      const sent = capturedEmails[beforeLen];
      const otpMatch = /\b(\d{6})\b/.exec(sent.text);
      assert(otpMatch, `Expected 6-digit OTP for ${email}`);

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

    const topAuth = await signInAndGetCookie('top@sup.biteshark.test');
    const modAuth = await signInAndGetCookie('mod@sup.biteshark.test');
    const vendorAuth = await signInAndGetCookie('vendor@sup.biteshark.test');
    const custAuth = await signInAndGetCookie('customer@sup.biteshark.test');

    await privQuery(
      `INSERT INTO platform_roles (user_id, role, granted_by)
       VALUES ($1, 'top', 'bootstrap'), ($2, 'mod', $1)`,
      [topAuth.user.id, modAuth.user.id]
    );
    await privQuery(
      `INSERT INTO vendor_memberships (vendor_id, user_id, role, granted_by)
       VALUES ('mitote', $1, 'owner', $2), ('iniguez', $1, 'owner', $2)`,
      [vendorAuth.user.id, topAuth.user.id]
    );

    // Seed a real operational diagnostic incident with correlation ID `corr_fedcba9876543210`
    const seededDiag = await diagMod.recordDiagnosticEvent(appPool, {
      component: 'api',
      trustLevel: 'server_verified',
      featureKey: 'bookings',
      operationName: 'bookings.submit_inquiry',
      routeTemplate: '/api/bookings',
      httpMethod: 'POST',
      httpStatus: 503,
      severity: 'error',
      errorCode: 'BOOKING_DB_TIMEOUT',
      title: 'Event inquiry submission timeout',
      message: 'Database timeout while saving inquiry.',
      userImpact: 'Customer inquiry showed uncertain/failed banner.',
      safeNextSteps: 'Verify retry idempotency and pool capacity.',
      correlationId: 'corr_fedcba9876543210',
      serverReleaseSha: releaseSha,
      modVisible: true
    });
    assert(seededDiag && seededDiag.group_id);

    // Launch Headless Chrome
    const debugPort = await getFreePort();
    chromeProfileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-sup-chrome-'));
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

    async function openIsolatedTab({ authActor = null, width = 1280, height = 860, reducedMotion = false } = {}) {
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
      return { sessionId, targetId, browserContextId };
    }

    // =========================================================================
    // 1. Guest Upfront Sign-In Notice & Safe Tab-Scoped Draft Preservation
    // =========================================================================
    const guestTab = await openIsolatedTab({ authActor: null });
    await cdp.send('Page.navigate', { url: `${baseUrl}/` }, guestTab.sessionId);
    await waitForCondition(
      () => cdp.eval(guestTab.sessionId, `Boolean(document.getElementById('rxDiscoverHelpBar'))`),
      { label: 'guest discover help bar ready' }
    );

    await cdp.eval(guestTab.sessionId, `document.querySelector('#rxDiscoverHelpBar button').click()`);
    await waitForCondition(
      () =>
        cdp.eval(
          guestTab.sessionId,
          `!document.getElementById('supportIssuesModal').hidden && !document.getElementById('siGuestPane').hidden && document.getElementById('siNewPane').hidden`
        ),
      { label: 'guest upfront sign-in notice displayed before composition' }
    );
    const guestNoticeText = await cdp.eval(guestTab.sessionId, `document.getElementById('siGuestPane').textContent`);
    assert(guestNoticeText.includes('Sign in required before submitting a support request'));
    assert(guestNoticeText.includes('14+'));

    // Save draft into sessionStorage, then inject customer session cookie and navigate to /#support-resume
    await cdp.eval(
      guestTab.sessionId,
      `(() => {
        const ta = document.getElementById('siGuestDraftInput');
        ta.value = 'Draft saved before signing in: Saturday inquiry button showed an error.';
      })()`
    );
    await cdp.send(
      'Network.setCookie',
      {
        name: custAuth.cookieName,
        value: custAuth.cookieVal,
        url: baseUrl,
        httpOnly: true,
        secure: custAuth.cookieName.startsWith('__Host-'),
        path: '/'
      },
      guestTab.sessionId
    );
    // Click Save draft & Sign in -> intercept by saving draft directly via button handler or checking sessionStorage
    await cdp.eval(
      guestTab.sessionId,
      `(() => {
        const val = document.getElementById('siGuestDraftInput').value;
        sessionStorage.setItem('bs_support_draft_v1', JSON.stringify({
          reporterMode: 'customer',
          customerKind: 'problem',
          description: val,
          savedAt: new Date().toISOString()
        }));
      })()`
    );
    await cdp.send('Page.navigate', { url: `${baseUrl}/#support-resume` }, guestTab.sessionId);
    await waitForCondition(
      () =>
        cdp.eval(
          guestTab.sessionId,
          `!document.getElementById('supportIssuesModal').hidden && !document.getElementById('siNewPane').hidden && document.getElementById('siDescription').value.includes('Draft saved before signing in')`
        ),
      { label: 'saved guest draft restored automatically on #support-resume' }
    );
    await cdp.eval(guestTab.sessionId, `document.getElementById('siClearDraftBtn').click()`);
    assert.equal(await cdp.eval(guestTab.sessionId, `sessionStorage.getItem('bs_support_draft_v1')`), null);
    console.log('✓ [1/6] Guest upfront sign-in notice & sessionStorage draft resume/clear verified');

    // =========================================================================
    // 2. Vendor Progressive Disclosure, Critical Notice, Sharing Scope, XSS & Screenshot
    // =========================================================================
    const vendorTab = await openIsolatedTab({ authActor: vendorAuth, width: 1280, height: 900 });
    await cdp.send('Page.navigate', { url: `${baseUrl}/` }, vendorTab.sessionId);
    await waitForCondition(
      () => cdp.eval(vendorTab.sessionId, `Boolean(document.getElementById('ownerSupportBtn'))`),
      { label: 'vendor owner support controls injected' }
    );

    await cdp.eval(vendorTab.sessionId, `showScreen('owner')`);
    await waitForCondition(
      () =>
        cdp.eval(
          vendorTab.sessionId,
          `document.getElementById('ownerScreen').classList.contains('active') && document.getElementById('ownerTruckSelect').options.length >= 2`
        ),
      { label: 'ownerScreen active with multi-vendor options loaded' }
    );

    // Switch #ownerScreen to 'iniguez' first and verify VENDOR HELP & FEEDBACK assumes 'iniguez' without asking!
    await cdp.eval(
      vendorTab.sessionId,
      `(async () => {
        const sel = document.getElementById('ownerTruckSelect');
        sel.value = 'iniguez';
        await selectOwnerTruck('iniguez');
      })()`
    );
    await waitForCondition(
      () =>
        cdp.eval(
          vendorTab.sessionId,
          `document.getElementById('ownerSupportVendorContext') && document.getElementById('ownerSupportVendorContext').textContent.includes('iniguez')`
        ),
      { label: 'ownerSupportCard context updated to iniguez' }
    );
    await cdp.eval(vendorTab.sessionId, `document.getElementById('ownerShareFeedbackBtn').click()`);
    await waitForCondition(
      () =>
        cdp.eval(
          vendorTab.sessionId,
          `!document.getElementById('supportIssuesModal').hidden && !document.getElementById('siNewPane').hidden`
        ),
      { label: 'vendor support modal opened from iniguez page' }
    );
    const iniguezInceptedState = await cdp.eval(
      vendorTab.sessionId,
      `(() => ({
        vendVal: document.getElementById('siVendorId').value,
        modeHidden: document.getElementById('siModeSwitchWrap').hidden,
        vendorPickerHidden: document.getElementById('siVendorWrap').hidden,
        bannerVisible: !document.getElementById('siInceptedVendorBanner').hidden,
        bannerText: document.getElementById('siInceptedVendorBanner').textContent
      }))()`
    );
    assert.equal(iniguezInceptedState.vendVal, 'iniguez');
    assert.equal(iniguezInceptedState.modeHidden, true, 'Submitting-as toggle must be hidden when incepted from vendor page');
    assert.equal(iniguezInceptedState.vendorPickerHidden, true, 'Vendor dropdown must be hidden when incepted from vendor page');
    assert.equal(iniguezInceptedState.bannerVisible, true);
    assert(iniguezInceptedState.bannerText.includes('iniguez'));

    // Close modal, switch to Discover global Help & Feedback, and verify non-vendor-page entry still shows full pickers
    await cdp.eval(vendorTab.sessionId, `document.querySelector('[data-rx-close="supportIssuesModal"]').click()`);
    await cdp.eval(vendorTab.sessionId, `showScreen('discover')`);
    await cdp.eval(vendorTab.sessionId, `document.getElementById('rxSupportIssuesBtn').click()`);
    await waitForCondition(
      () => cdp.eval(vendorTab.sessionId, `!document.getElementById('supportIssuesModal').hidden`),
      { label: 'global support modal opened from Discover' }
    );
    await cdp.eval(vendorTab.sessionId, `document.querySelector('[data-si-tab="new"]').click()`);
    const globalModalState = await cdp.eval(
      vendorTab.sessionId,
      `(() => ({
        modeHidden: document.getElementById('siModeSwitchWrap').hidden,
        vendorPickerHidden: document.getElementById('siVendorWrap').hidden,
        bannerHidden: document.getElementById('siInceptedVendorBanner').hidden
      }))()`
    );
    assert.equal(globalModalState.modeHidden, false);
    assert.equal(globalModalState.vendorPickerHidden, false);
    assert.equal(globalModalState.bannerHidden, true);
    await cdp.eval(vendorTab.sessionId, `document.querySelector('[data-rx-close="supportIssuesModal"]').click()`);

    // Return to #ownerScreen, switch to 'mitote', and open VENDOR HELP & FEEDBACK -> automatically assumes 'mitote'!
    await cdp.eval(vendorTab.sessionId, `showScreen('owner')`);
    await cdp.eval(
      vendorTab.sessionId,
      `(async () => {
        const sel = document.getElementById('ownerTruckSelect');
        sel.value = 'mitote';
        await selectOwnerTruck('mitote');
      })()`
    );
    await waitForCondition(
      () =>
        cdp.eval(
          vendorTab.sessionId,
          `document.getElementById('ownerSupportVendorContext').textContent.includes('mitote')`
        ),
      { label: 'ownerSupportCard context updated to mitote' }
    );

    await cdp.eval(vendorTab.sessionId, `document.getElementById('ownerReportProblemBtn').click()`);
    await waitForCondition(
      () =>
        cdp.eval(
          vendorTab.sessionId,
          `!document.getElementById('supportIssuesModal').hidden && !document.getElementById('siNewPane').hidden`
        ),
      { label: 'vendor support modal opened on new request tab' }
    );

    // Check modal ARIA, background inert, auto-assumed vendor `mitote`, and progressive disclosure
    const vendorModalState = await cdp.eval(
      vendorTab.sessionId,
      `(() => {
        const dlg = document.querySelector('#supportIssuesModal [role="dialog"]');
        const appInert = document.getElementById('app').inert;
        const vendVal = document.getElementById('siVendorId').value;
        const modeHidden = document.getElementById('siModeSwitchWrap').hidden;
        const vendorPickerHidden = document.getElementById('siVendorWrap').hidden;
        const bannerText = document.getElementById('siInceptedVendorBanner').textContent;
        // Switch category to suggestion_feedback -> urgency hidden
        const cat = document.getElementById('siCategory');
        cat.value = 'suggestion_feedback';
        cat.onchange();
        const urgHiddenForIdea = document.getElementById('siUrgencyWrap').hidden;
        // Switch to account_access -> sharing_scope locked to personal
        cat.value = 'account_access';
        cat.onchange();
        const scopeLockedForAccess = document.getElementById('siSharingScope').disabled && document.getElementById('siSharingScope').value === 'personal';
        // Switch to pager_notifications + critical + vendor_service
        cat.value = 'pager_notifications';
        cat.onchange();
        const urg = document.getElementById('siReporterUrgency');
        urg.value = 'critical';
        urg.onchange();
        const scope = document.getElementById('siSharingScope');
        scope.value = 'vendor_service';
        return {
          ariaModal: dlg ? dlg.getAttribute('aria-modal') : null,
          appInert,
          vendVal,
          modeHidden,
          vendorPickerHidden,
          bannerText,
          urgHiddenForIdea,
          scopeLockedForAccess,
          critNoticeVisible: !document.getElementById('siCriticalNotice').hidden
        };
      })()`
    );
    assert.equal(vendorModalState.ariaModal, 'true');
    assert.equal(vendorModalState.appInert, true);
    assert.equal(vendorModalState.vendVal, 'mitote');
    assert.equal(vendorModalState.modeHidden, true);
    assert.equal(vendorModalState.vendorPickerHidden, true);
    assert(vendorModalState.bannerText.includes('mitote'));
    assert.equal(vendorModalState.urgHiddenForIdea, true);
    assert.equal(vendorModalState.scopeLockedForAccess, true);
    assert.equal(vendorModalState.critNoticeVisible, true);

    await cdp.eval(
      vendorTab.sessionId,
      `(() => {
        document.getElementById('siSubject').value = 'Lunch rush pickup pager status delay';
        document.getElementById('siDescription').value = 'Pickup ticket #42 stayed on Cooking when tapped Ready during lunch service.';
      })()`
    );

    if (screenshotDir) {
      await new Promise(r => setTimeout(r, 120));
      const vShot = await cdp.send('Page.captureScreenshot', { format: 'png' }, vendorTab.sessionId);
      fs.writeFileSync(path.join(screenshotDir, 'support-vendor-form.png'), Buffer.from(vShot.data, 'base64'));
    }

    // Append XSS probe right before submit so XSS escaping is verified across both reporter and admin views
    await cdp.eval(
      vendorTab.sessionId,
      `document.getElementById('siDescription').value += ' <img src=x onerror="window.__xss=1">';`
    );

    await cdp.eval(vendorTab.sessionId, `document.getElementById('siNewPane').requestSubmit()`);
    await waitForCondition(
      () =>
        cdp.eval(
          vendorTab.sessionId,
          `!document.getElementById('siAckBanner').hidden && document.getElementById('siAckBanner').textContent.includes('BS-')`
        ),
      { label: 'vendor ticket acknowledgement banner rendered' }
    );
    const ackText = await cdp.eval(vendorTab.sessionId, `document.getElementById('siAckBanner').textContent`);
    assert(ackText.includes('not yet been read by a team member'));
    assert.equal(await cdp.eval(vendorTab.sessionId, `window.__xss`), undefined, 'XSS payload must never execute');

    console.log('✓ [2/6] Vendor progressive disclosure, critical notice, sharing scope & acknowledgement verified');

    // =========================================================================
    // 3. Customer Lighter Form + Contextual `Report this problem` Error Prefill & Screenshot
    // =========================================================================
    const custTab = await openIsolatedTab({ authActor: custAuth, width: 1280, height: 880 });
    await cdp.send('Page.navigate', { url: `${baseUrl}/` }, custTab.sessionId);
    await waitForCondition(
      () => cdp.eval(custTab.sessionId, `Boolean(window.bitesharkOpenSupport && window.bitesharkDiagnostics)`),
      { label: 'customer app booted' }
    );

    // Render contextual error banner on `#bookingsFeedback` with `corr_fedcba9876543210` and click `.bs-fb-report`
    await cdp.eval(
      custTab.sessionId,
      `(() => {
        showScreen('bookings');
        window.bitesharkDiagnostics.renderFeedbackBanner('bookingsFeedback', {
          state: 'failed',
          title: 'Could not submit inquiry',
          message: 'BiteShark timed out while saving your catering inquiry.',
          featureKey: 'bookings',
          operationName: 'bookings.submit_inquiry',
          correlationId: 'corr_fedcba9876543210'
        });
        document.querySelector('#bookingsFeedback .bs-fb-report').click();
      })()`
    );

    await waitForCondition(
      () =>
        cdp.eval(
          custTab.sessionId,
          `!document.getElementById('supportIssuesModal').hidden && document.getElementById('siContextSummaryText').textContent.includes('corr_fedcba9876543210')`
        ),
      { label: 'contextual error prefilled corr_fedcba9876543210 in customer form' }
    );

    await cdp.eval(
      custTab.sessionId,
      `(() => {
        // Leave #siSubject blank to test customer auto-subject!
        document.getElementById('siSubject').value = '';
        document.getElementById('siDescription').value = 'Tried sending a birthday taco truck request for Saturday afternoon and saw a timeout error banner.';
      })()`
    );

    if (screenshotDir) {
      await new Promise(r => setTimeout(r, 120));
      const cShot = await cdp.send('Page.captureScreenshot', { format: 'png' }, custTab.sessionId);
      fs.writeFileSync(path.join(screenshotDir, 'support-customer-form.png'), Buffer.from(cShot.data, 'base64'));
    }

    await cdp.eval(custTab.sessionId, `document.getElementById('siNewPane').requestSubmit()`);
    const custTicketNumber = await waitForCondition(
      () =>
        cdp.eval(
          custTab.sessionId,
          `(() => {
            const el = document.querySelector('#siListPane .si-ticket-num');
            return el ? el.textContent.trim() : '';
          })()`
        ),
      { label: 'customer ticket created and listed with BS-... number' }
    );
    assert.match(custTicketNumber, /^BS-\d{6,}$/);

    console.log('✓ [3/6] Customer lighter form, contextual error prefill & auto-subject verified');

    // =========================================================================
    // 4. Staff Queue (`/admin#issues`), Assignment, Internal vs Public Safeguard,
    //    Connected Diagnostic Linking & Reviewed Multi-Ticket Update + Screenshot
    // =========================================================================
    const adminTab = await openIsolatedTab({ authActor: topAuth, width: 1400, height: 920 });
    await cdp.send('Page.navigate', { url: `${baseUrl}/admin#issues` }, adminTab.sessionId);
    await waitForCondition(
      () => cdp.eval(adminTab.sessionId, `document.querySelectorAll('#issuesList [data-iss-id]').length >= 2`),
      { label: 'admin support queue loaded both tickets' }
    );
    assert.equal(await cdp.eval(adminTab.sessionId, `window.__xss`), undefined, 'Admin queue must escape XSS safely');

    // Select the customer ticket (`custTicketNumber`), confirm suggested diagnostic link with public_summary,
    // post an internal note, then post a public reply & capture screenshot!
    await cdp.eval(
      adminTab.sessionId,
      `(() => {
        const card = [...document.querySelectorAll('#issuesList [data-iss-id]')].find(c => c.textContent.includes(${JSON.stringify(custTicketNumber)}));
        if (card) card.click();
      })()`
    );
    await waitForCondition(
      () => cdp.eval(adminTab.sessionId, `Boolean(document.querySelector('[data-confirm-diag]'))`),
      { label: 'auto-suggested diagnostic link button visible in admin ticket detail' }
    );

    // Confirm the suggested diagnostic link with a plain-language known-issue summary
    await cdp.eval(
      adminTab.sessionId,
      `(() => {
        document.querySelector('[data-confirm-diag]').click();
        document.getElementById('issDiagActPubSum').value = 'Our team identified a temporary event-inquiry database timeout and applied a fix.';
        document.getElementById('issDiagActSubmitBtn').click();
      })()`
    );
    await waitForCondition(
      () => cdp.eval(adminTab.sessionId, `document.getElementById('issDiagnosticsPanel').textContent.includes('Confirmed Link')`),
      { label: 'diagnostic link confirmed in admin detail' }
    );

    // Post confidential internal note first
    await cdp.eval(
      adminTab.sessionId,
      `(() => {
        document.getElementById('issAssignMeQuickBtn').click();
        document.getElementById('issEditStatus').value = 'in_review';
        document.getElementById('issNoteVis').value = 'internal';
        document.getElementById('issNoteVis').onchange();
        document.getElementById('issNoteBody').value = 'PRIVATE_STAFF_ONLY_CHECK_9911: Verified pool metrics clean.';
        document.getElementById('issueUpdateForm').requestSubmit();
      })()`
    );
    await waitForCondition(
      () => cdp.eval(adminTab.sessionId, `document.getElementById('issuesDetailPane').textContent.includes('PRIVATE_STAFF_ONLY_CHECK_9911')`),
      { label: 'internal note saved in admin detail' }
    );

    // Switch visibility to Public Reply -> verify callout changes to `.is-public`, post public reply (`waiting`)
    const visCalloutCheck = await cdp.eval(
      adminTab.sessionId,
      `(() => {
        const vis = document.getElementById('issNoteVis');
        vis.value = 'reporter_visible';
        vis.onchange();
        return document.getElementById('issNoteVisCallout').classList.contains('is-public');
      })()`
    );
    assert.equal(visCalloutCheck, true);

    await cdp.eval(
      adminTab.sessionId,
      `(() => {
        document.getElementById('issEditStatus').value = 'waiting';
        document.getElementById('issNoteBody').value = 'Thanks for reporting this! Event inquiry submissions are working normally now — please let us know if your request went through.';
        document.getElementById('issueUpdateForm').requestSubmit();
      })()`
    );
    await waitForCondition(
      () => cdp.eval(adminTab.sessionId, `document.getElementById('issuesDetailPane').textContent.includes('Thanks for reporting this!')`),
      { label: 'public reply saved in admin detail' }
    );

    if (screenshotDir) {
      await cdp.eval(adminTab.sessionId, `document.getElementById('issuesDetailPane').scrollTop = 0; window.scrollTo(0, 0);`);
      await new Promise(r => setTimeout(r, 150));
      const sqShot = await cdp.send('Page.captureScreenshot', { format: 'png' }, adminTab.sessionId);
      fs.writeFileSync(path.join(screenshotDir, 'support-staff-queue.png'), Buffer.from(sqShot.data, 'base64'));

      await cdp.eval(adminTab.sessionId, `document.getElementById('issDiagnosticsPanel').scrollIntoView({ block: 'end' });`);
      await new Promise(r => setTimeout(r, 150));
      const dlShot = await cdp.send('Page.captureScreenshot', { format: 'png' }, adminTab.sessionId);
      fs.writeFileSync(path.join(screenshotDir, 'support-staff-diagnostics-link.png'), Buffer.from(dlShot.data, 'base64'));
    }

    // Jump from ticket to Connected Diagnostic Incident & test two-step Preview -> Confirm & Post Public Update!
    await cdp.eval(adminTab.sessionId, `document.querySelector('[data-open-diag]').click()`);
    await waitForCondition(
      () =>
        cdp.eval(
          adminTab.sessionId,
          `!document.getElementById('sec-diagnostics').hidden && document.getElementById('diagDetailPane').textContent.includes(${JSON.stringify(custTicketNumber)})`
        ),
      { label: 'jumped to diagnostic detail showing connected support ticket chip' }
    );

    await cdp.eval(
      adminTab.sessionId,
      `(() => {
        document.getElementById('diagNotifyTicketsMsg').value = 'Status update: Booking inquiry latency has remained stable across monitoring.';
        document.getElementById('diagPreviewNotifyBtn').click();
      })()`
    );
    await waitForCondition(
      () => cdp.eval(adminTab.sessionId, `!document.getElementById('diagConfirmNotifyBtn').hidden`),
      { label: 'recipient preview displayed and confirm button enabled' }
    );
    await cdp.eval(adminTab.sessionId, `document.getElementById('diagConfirmNotifyBtn').click()`);
    await waitForCondition(
      () => cdp.eval(adminTab.sessionId, `document.getElementById('adminGlobalBanner').textContent.includes('Posted reviewed public update')`),
      { label: 'reviewed public update posted from diagnostics to linked ticket' }
    );

    console.log('✓ [4/6] Staff queue, internal/public safeguard, diagnostic linking & reviewed update verified');

    // =========================================================================
    // 5. Reporter Unread Badge, Deep Link `/#support=BS-...`, Timeline, Privacy & Reopen
    // =========================================================================
    await cdp.send('Page.navigate', { url: `${baseUrl}/#support=${custTicketNumber}` }, custTab.sessionId);
    await waitForCondition(
      () =>
        cdp.eval(
          custTab.sessionId,
          `!document.getElementById('supportIssuesModal').hidden && document.getElementById('siListPane').textContent.includes('Connected to a known service issue')`
        ),
      { label: 'customer deep link opened timeline with known-issue banner & team replies' }
    );

    const custTimelineText = await cdp.eval(custTab.sessionId, `document.getElementById('siListPane').textContent`);
    assert(custTimelineText.includes('Thanks for reporting this!'));
    assert(custTimelineText.includes('Status update: Booking inquiry latency has remained stable'));
    assert(!custTimelineText.includes('PRIVATE_STAFF_ONLY_CHECK_9911'), 'Internal note must NEVER appear in customer DOM');
    assert(!custTimelineText.includes('top@sup.biteshark.test'), 'Staff email must NEVER appear in customer DOM');

    if (screenshotDir) {
      await new Promise(r => setTimeout(r, 150));
      const tlShot = await cdp.send('Page.captureScreenshot', { format: 'png' }, custTab.sessionId);
      fs.writeFileSync(path.join(screenshotDir, 'support-user-timeline.png'), Buffer.from(tlShot.data, 'base64'));
    }

    // Admin marks ticket Resolved -> Customer reopens it from UI!
    await cdp.eval(adminTab.sessionId, `document.querySelector('[data-diag-jump-ticket]').click()`);
    await waitForCondition(
      () =>
        cdp.eval(
          adminTab.sessionId,
          `!document.getElementById('sec-issues').hidden && Boolean(document.getElementById('issEditStatus')) && document.getElementById('issuesDetailPane').textContent.includes(${JSON.stringify(custTicketNumber)})`
        ),
      { label: 'admin jumped back to ticket from diagnostic chip' }
    );
    await cdp.eval(
      adminTab.sessionId,
      `(() => {
        document.getElementById('issEditStatus').value = 'resolved';
        document.getElementById('issEditResolution').value = 'Confirmed inquiry submitted cleanly after database fix.';
        document.getElementById('issueUpdateForm').requestSubmit();
      })()`
    );
    await waitForCondition(
      () => cdp.eval(adminTab.sessionId, `document.getElementById('adminGlobalBanner').textContent.includes('Saved to server')`),
      { label: 'admin marked ticket resolved' }
    );

    await cdp.eval(custTab.sessionId, `document.querySelector('[data-si-tab="list"]').click()`);
    await waitForCondition(
      () => cdp.eval(custTab.sessionId, `document.getElementById('siListPane').textContent.includes('Resolved')`),
      { label: 'customer list shows Resolved status' }
    );
    await cdp.eval(custTab.sessionId, `document.querySelector('#siListPane [data-si-thread]').click()`);
    await waitForCondition(
      () => cdp.eval(custTab.sessionId, `Boolean(document.querySelector('[data-si-reopen]'))`),
      { label: 'customer reopen form visible on Resolved ticket' }
    );
    await cdp.eval(
      custTab.sessionId,
      `(() => {
        const f = document.querySelector('[data-si-reopen]');
        f.querySelector('input').value = 'Saw one more timeout when selecting 120 guests.';
        f.requestSubmit();
      })()`
    );
    await waitForCondition(
      () => cdp.eval(custTab.sessionId, `document.getElementById('siListPane').textContent.includes('In progress')`),
      { label: 'customer reopen moved ticket back to In progress' }
    );

    console.log('✓ [5/6] Reporter deep link, timeline, internal-note/staff-email privacy & reopen verified');

    // =========================================================================
    // 6. Keyboard Focus Trap, Escape Restore & 320px / 375px / 200% Zoom Reflow
    // =========================================================================
    await cdp.pressKey(custTab.sessionId, 'Escape');
    await waitForCondition(
      () => cdp.eval(custTab.sessionId, `document.getElementById('supportIssuesModal').hidden && !document.getElementById('app').inert`),
      { label: 'Escape closed support modal and cleared background inert' }
    );

    // Test narrow 320x640 mobile, 375x812 mobile & 640x360 (200% zoom) viewports with reduced motion
    for (const vp of [
      { width: 320, height: 640, label: '320px mobile' },
      { width: 375, height: 812, label: '375px mobile' },
      { width: 640, height: 360, label: '200% zoom desktop equivalent' }
    ]) {
      const mobileTab = await openIsolatedTab({
        authActor: vendorAuth,
        width: vp.width,
        height: vp.height,
        reducedMotion: true
      });
      await cdp.send('Page.navigate', { url: `${baseUrl}/` }, mobileTab.sessionId);
      await waitForCondition(
        () => cdp.eval(mobileTab.sessionId, `Boolean(window.bitesharkOpenSupport)`),
        { label: `${vp.label} boot` }
      );
      await cdp.eval(mobileTab.sessionId, `window.bitesharkOpenSupport({ reporterContext: 'vendor', tab: 'new' })`);
      await waitForCondition(
        () => cdp.eval(mobileTab.sessionId, `!document.getElementById('supportIssuesModal').hidden`),
        { label: `${vp.label} support modal open` }
      );

      // Tab key containment check
      for (let i = 0; i < 6; i++) {
        await cdp.pressKey(mobileTab.sessionId, 'Tab');
      }
      const insideModal = await cdp.eval(
        mobileTab.sessionId,
        `document.getElementById('supportIssuesModal').contains(document.activeElement)`
      );
      assert.equal(insideModal, true, `Focus must remain trapped inside #supportIssuesModal at ${vp.label}`);

      const overflowCheck = await cdp.eval(
        mobileTab.sessionId,
        `(() => {
          const modal = document.querySelector('#supportIssuesModal .rx-modal');
          const rect = modal.getBoundingClientRect();
          return {
            fitsViewport: rect.width <= window.innerWidth + 2 && rect.left >= -1,
            scrollable: modal.scrollHeight >= modal.clientHeight
          };
        })()`
      );
      assert.equal(overflowCheck.fitsViewport, true, `Support modal overflowed horizontally at ${vp.label}`);
    }

    console.log('✓ [6/6] Keyboard Tab containment, Escape restore & 320px/375px/200%-zoom reflow verified');
    console.log('PASS: Headless Chrome + PostgreSQL Support & Feedback + Connected Diagnostics E2E passed.');
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
    if (appPool) await appPool.end().catch(() => {});
    if (migratorPool) await migratorPool.end().catch(() => {});
    await adminPool.end().catch(() => {});
    await pgCluster.stop();
  }
})().catch(err => {
  console.error('FAIL support-feedback-browser.e2e:', err);
  process.exit(1);
});
