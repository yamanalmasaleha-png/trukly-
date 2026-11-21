// Real Headless Chrome + PostgreSQL First-Visit Welcome, Vendor Intro & Area Preference E2E Suite
//
// Verifies end-to-end against real Chromium (CDP) + isolated PostgreSQL (`NOSUPERUSER NOBYPASSRLS`):
//   1. Authenticated Customer, Vendor Owner, Admin: Mod, and Admin: Top users skip welcome with
//      zero onboarding flash during delayed session resolution, and authenticated vendors opening `/`
//      land in customer discovery without losing their vendor permissions.
//   2. Signed-out first visit to `/` shows `#welcomeScreen` (`Welcome to BiteShark. What brings you here?`),
//      with `#welcomeRememberChoice` unchecked by default and zero automatic geolocation calls.
//   3. Customer ("Find something good") & "Just browse" paths open discovery immediately with no signup,
//      no notification prompt, and no persistent cookie when remember is unchecked.
//   4. Vendor path ("I run a food business") opens `#vendorIntroScreen` before signup, searches/preselects
//      an existing listing, preserves selection safely across `/login.html?mode=signup&next=...`, enforces
//      both 14+ age eligibility and staging recipient restrictions, opens `#vendorApplyModal` pre-filled
//      after verification, and grants ZERO vendor/admin privileges prior to admin approval.
//   5. Opt-in 90-day `bs_start_pref` cookie (`customer` | `vendor`, `SameSite=Lax`, `Path=/`, `Max-Age=7776000`),
//      shared-device session precedence, malformed/tampered cookie scrubbing, blocked-cookie truthful notice,
//      and 1-click "Forget saved start preference" preserving guest `localStorage` favorites and sessions.
//   6. Direct links (`/#spot=mitote`, `/#trail=mitote,iniguez`, `/#pager=<uuid>`, `/#accept-invite=<tok>`,
//      `/#support`) bypass welcome and preserve destination state.
//   7. Failed/slow session lookup leaves public discovery usable (never trapped); simulated coarse location
//      (`Near Santa Rosa?`) never fabricates GPS distances and is overridden by manual town selection;
//      outside-Sonoma geolocation explains Sonoma County launch scope without emptying the directory.
//   8. Keyboard Tab/Enter operation, visible focus, `prefers-reduced-motion: reduce`, and horizontal-overflow-free
//      reflow at `320x640`, `375x812`, and `200%` zoom (`640x360`).

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
  throw new Error('Cannot resolve `pg` module. Set TRUCKLY_PG_NODE_MODULES or install pg.');
}

const { Pool } = requirePg();

function findPostgresBinDir() {
  const initExe = process.platform === 'win32' ? 'initdb.exe' : 'initdb';
  if (process.env.PG_BIN_DIR && fs.existsSync(path.join(process.env.PG_BIN_DIR, initExe))) {
    return process.env.PG_BIN_DIR;
  }
  const pkgPlatform = `${process.platform === 'win32' ? 'windows' : process.platform}-${process.arch}`;
  for (const r of [process.env.TRUCKLY_PG_NODE_MODULES, process.env.BITESHARK_PG_NODE_MODULES].filter(Boolean)) {
    const embDir = path.join(r, '@embedded-postgres', pkgPlatform, 'native', 'bin');
    if (fs.existsSync(path.join(embDir, initExe))) return embDir;
  }
  for (const dir of (process.env.PATH || '').split(path.delimiter).filter(Boolean)) {
    if (fs.existsSync(path.join(dir, initExe))) return dir;
  }
  if (process.platform === 'win32') {
    const base = 'C:\\Program Files\\PostgreSQL';
    if (fs.existsSync(base)) {
      const vers = fs
        .readdirSync(base)
        .filter(v => /^\d+$/.test(v))
        .sort((a, b) => Number(b) - Number(a));
      for (const v of vers) {
        const candidate = path.join(base, v, 'bin');
        if (fs.existsSync(path.join(candidate, 'initdb.exe'))) return candidate;
      }
    }
  } else {
    const usrLib = '/usr/lib/postgresql';
    if (fs.existsSync(usrLib)) {
      const vers = fs
        .readdirSync(usrLib)
        .filter(v => /^\d+$/.test(v))
        .sort((a, b) => Number(b) - Number(a));
      for (const v of vers) {
        const candidate = path.join(usrLib, v, 'bin');
        if (fs.existsSync(path.join(candidate, 'initdb'))) return candidate;
      }
    }
  }
  return '';
}

function findChromeBinary() {
  const envBin = process.env.CHROME_BIN || process.env.GOOGLE_CHROME_BIN;
  if (envBin && fs.existsSync(envBin)) return envBin;
  const candidates =
    process.platform === 'win32'
      ? [
          'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
          'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
          'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
          'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
        ]
      : ['/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium'];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error('No Chromium/Chrome binary found for welcome-experience-browser.e2e.cjs.');
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
  const extAdminUrl = process.env.TEST_ADMIN_DATABASE_URL || process.env.DATABASE_URL;
  if (extAdminUrl) {
    return { adminUrl: extAdminUrl, stop: async () => {} };
  }
  const pgBin = findPostgresBinDir();
  const exe = name =>
    pgBin ? path.join(pgBin, process.platform === 'win32' ? `${name}.exe` : name) : name;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-welcome-pg-'));
  const dataDir = path.join(tmpDir, 'data');
  const port = await getFreePort();

  execFileSync(exe('initdb'), ['-D', dataDir, '-U', 'postgres', '-A', 'trust', '-E', 'UTF8', '--no-locale'], {
    stdio: 'ignore'
  });
  fs.appendFileSync(
    path.join(dataDir, 'postgresql.conf'),
    `\nlisten_addresses = '127.0.0.1'\nport = ${port}\nmax_connections = 60\nfsync = off\nsynchronous_commit = off\nfull_page_writes = off\n`
  );
  execFileSync(exe('pg_ctl'), ['-D', dataDir, '-l', path.join(tmpDir, 'pg.log'), '-w', 'start'], {
    stdio: 'ignore'
  });

  return {
    adminUrl: `postgresql://postgres@127.0.0.1:${port}/postgres`,
    stop: async () => {
      try {
        execFileSync(exe('pg_ctl'), ['-D', dataDir, '-m', 'immediate', '-w', 'stop'], { stdio: 'ignore' });
      } catch {}
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {}
    }
  };
}

function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, res => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', d => (raw += d));
      res.on('end', () => {
        try {
          resolve(JSON.parse(raw));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
  });
}

async function waitForCondition(fn, { timeoutMs = 15000, intervalMs = 60, label = 'condition' } = {}) {
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
        const handlers = this.listeners.get(msg.method);
        if (handlers) {
          for (const h of handlers) h(msg.params, msg.sessionId);
        }
      }
    });
  }

  on(method, fn) {
    if (!this.listeners.has(method)) this.listeners.set(method, new Set());
    this.listeners.get(method).add(fn);
    return () => this.listeners.get(method)?.delete(fn);
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
        type: key === 'Enter' ? 'keyDown' : 'rawKeyDown',
        key,
        code: info.code,
        text: key === 'Enter' ? '\r' : undefined,
        unmodifiedText: key === 'Enter' ? '\r' : undefined,
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
  const migratorRole = `bs_wel_mig_${suffix}`;
  const migratorPass = `mig_${suffix}`;
  const appRole = `bs_wel_app_${suffix}`;
  const appPass = `app_${suffix}`;
  const dbName = `bs_wel_${suffix}`;

  const adminPool = new Pool({ connectionString: pgCluster.adminUrl, max: 4 });
  let migratorPool = null;
  let appPool = null;
  let serverHandle = null;
  let chromeProc = null;
  let chromeProfileDir = null;
  let cdp = null;

  try {
    await adminPool.query(`CREATE ROLE ${migratorRole} LOGIN PASSWORD '${migratorPass}' CREATEDB`);
    await adminPool.query(`CREATE ROLE ${appRole} LOGIN PASSWORD '${appPass}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`);
    await adminPool.query(`CREATE DATABASE ${dbName} OWNER ${migratorRole}`);

    const parsedAdmin = new URL(pgCluster.adminUrl);
    const adminPort = parsedAdmin.port || '5432';
    const migUrl = `postgresql://${migratorRole}:${migratorPass}@${parsedAdmin.hostname}:${adminPort}/${dbName}`;
    const appUrl = `postgresql://${appRole}:${appPass}@${parsedAdmin.hostname}:${adminPort}/${dbName}`;

    execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'run-migrations.cjs'), '--app-role', appRole], {
      cwd: ROOT,
      env: { ...process.env, MIGRATION_DATABASE_URL: migUrl },
      stdio: 'ignore'
    });
    migratorPool = new Pool({ connectionString: migUrl, max: 4 });

    async function privQuery(text, params = []) {
      const c = await migratorPool.connect();
      try {
        await c.query('BEGIN');
        await c.query(
          "SELECT set_config('app.admin_portal', 'true', true), set_config('app.can_moderate', 'true', true), set_config('app.auth_internal', 'true', true), set_config('app.diagnostics_internal', 'true', true)"
        );
        const res = await c.query(text, params);
        await c.query('COMMIT');
        return res;
      } catch (err) {
        await c.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        c.release();
      }
    }

    appPool = new Pool({ connectionString: appUrl, max: 12 });
    const appPort = await getFreePort();
    const baseUrl = `http://127.0.0.1:${appPort}`;
    const capturedEmails = [];
    const releaseSha = 'c0ffee1234567890abcdef1234567890abcdef12';

    for (const k of Object.keys(process.env)) {
      if (k.startsWith('BITESHARK_') || k.startsWith('TRUCKLY_')) delete process.env[k];
    }
    process.env.BITESHARK_ENV = 'staging';
    process.env.BITESHARK_DATABASE_URL = appUrl;
    process.env.BITESHARK_TRUST_PROXY = 'loopback';
    process.env.BITESHARK_ENABLE_PROXY_COARSE_GEO = '1';
    process.env.BITESHARK_AUTH_SECRET = 'sec_wel_' + suffix + '_0123456789abcdef0123456789abcdef';
    process.env.BITESHARK_AUTH_DELIVERY_MODE = 'resend_https';
    process.env.BITESHARK_AUTH_EMAIL_API_KEY = 're_wel_e2e_key_' + suffix;
    process.env.BITESHARK_AUTH_EMAIL_FROM = 'BiteShark <login@staging.biteshark.live>';
    process.env.BITESHARK_STAGING_ALLOWED_EMAIL_DOMAINS = 'wel.biteshark.test';
    process.env.BITESHARK_NOTIFICATION_WORKER_SECRET = 'wrk_wel_' + suffix + '_1234567890123456';
    process.env.BITESHARK_MAP_ENABLED = '0';
    process.env.BITESHARK_RELEASE_SHA = releaseSha;

    const authMod = await import(pathToFileURL(path.join(ROOT, 'lib', 'standalone-auth.js')).href);
    authMod.setCustomAuthEmailSenderForTests(async ({ to, subject, text }) => {
      capturedEmails.push({ to: Array.isArray(to) ? to : [to], subject, text });
      return { status: 200, id: `msg_wel_${capturedEmails.length}` };
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
        body: JSON.stringify({ email, intent: 'signup', dob: '1991-04-12' })
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

    const topAuth = await signInAndGetCookie('top@wel.biteshark.test');
    const modAuth = await signInAndGetCookie('mod@wel.biteshark.test');
    const vendorAuth = await signInAndGetCookie('vendor@wel.biteshark.test');
    const custAuth = await signInAndGetCookie('customer@wel.biteshark.test');

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

    // Create a real pickup pager ticket & real single-use invitation for deep-link bypass tests
    const pagerCreateRes = await fetch(`${baseUrl}/api/pager/staff`, {
      method: 'POST',
      headers: {
        Origin: baseUrl,
        Cookie: vendorAuth.rawCookie,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ vendor_id: 'mitote', ticket: '88', request_key: crypto.randomUUID() })
    });
    assert.equal(pagerCreateRes.status, 201);
    const pagerCreated = await pagerCreateRes.json();
    const realPagerId = pagerCreated.pager?.id || pagerCreated.id;
    assert(realPagerId);

    process.env.BITESHARK_AUTH_DELIVERY_MODE = 'staging_mailbox';
    const invRes = await fetch(`${baseUrl}/api/admin/invitations/create`, {
      method: 'POST',
      headers: {
        Origin: baseUrl,
        Cookie: topAuth.rawCookie,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: 'invitee@wel.biteshark.test',
        requested_role: 'customer',
        note: 'Welcome deep-link bypass test'
      })
    });
    process.env.BITESHARK_AUTH_DELIVERY_MODE = 'resend_https';
    assert.equal(invRes.status, 201);
    const invJson = await invRes.json();
    const tokMatch = /#accept-invite=([A-Za-z0-9_%-]+)/.exec(String(invJson.accept_path || ''));
    assert(tokMatch, 'Expected single-use #accept-invite token');
    const realInviteToken = decodeURIComponent(tokMatch[1]);

    // Launch Headless Chrome (with retry for transient CI runner cold-start/port races)
    let verInfo = null;
    let lastChromeErr = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const debugPort = await getFreePort();
      chromeProfileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-wel-chrome-'));
      let stderrTail = '';
      chromeProc = spawn(
        chromeBin,
        [
          '--headless=new',
          '--no-sandbox',
          '--disable-gpu',
          '--disable-dev-shm-usage',
          '--no-first-run',
          '--no-default-browser-check',
          `--remote-debugging-port=${debugPort}`,
          `--user-data-dir=${chromeProfileDir}`,
          'about:blank'
        ],
        { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true }
      );
      if (chromeProc.stderr) {
        chromeProc.stderr.on('data', chunk => {
          stderrTail = (stderrTail + chunk.toString('utf8')).slice(-1200);
        });
      }
      try {
        verInfo = await waitForCondition(() => httpGetJson(`http://127.0.0.1:${debugPort}/json/version`), {
          timeoutMs: 12000,
          label: `Chrome DevTools endpoint (attempt ${attempt}/3)`
        });
        break;
      } catch (err) {
        lastChromeErr = new Error(`${err.message}${stderrTail ? ' | stderr: ' + stderrTail.trim() : ''}`);
        try {
          chromeProc.kill('SIGKILL');
        } catch {}
        chromeProc = null;
        try {
          fs.rmSync(chromeProfileDir, { recursive: true, force: true });
        } catch {}
        chromeProfileDir = null;
      }
    }
    if (!verInfo) throw lastChromeErr;
    cdp = new CdpClient(verInfo.webSocketDebuggerUrl);
    await cdp.connect();

    async function openIsolatedTab({
      authActor = null,
      width = 1280,
      height = 860,
      reducedMotion = false,
      extraHeaders = null,
      trackGeoCalls = true
    } = {}) {
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
      if (extraHeaders) {
        await cdp.send('Network.setExtraHTTPHeaders', { headers: extraHeaders }, sessionId);
      }
      if (trackGeoCalls) {
        await cdp.send(
          'Page.addScriptToEvaluateOnNewDocument',
          {
            source: `
              window.__geoCallCount = 0;
              window.__mockGeoPosition = { coords: { latitude: 38.4405, longitude: -122.7144 } };
              navigator.geolocation.getCurrentPosition = function (ok, err) {
                window.__geoCallCount += 1;
                if (window.__mockGeoDeny) {
                  if (err) err({ code: 1, message: 'Denied' });
                  return;
                }
                ok(window.__mockGeoPosition);
              };
            `
          },
          sessionId
        );
      }
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
    // 1. Authenticated Customer, Vendor, Mod & Top Skip Welcome (Zero Flash!)
    // =========================================================================
    for (const [roleName, actor] of [
      ['Customer', custAuth],
      ['Vendor Owner', vendorAuth],
      ['Admin: Mod', modAuth],
      ['Admin: Top', topAuth]
    ]) {
      const tab = await openIsolatedTab({ authActor: actor });
      // Inject a MutationObserver + 400ms session delay on Vendor Owner to prove ZERO welcome flash!
      if (roleName === 'Vendor Owner') {
        await cdp.send(
          'Page.addScriptToEvaluateOnNewDocument',
          {
            source: `
              window.__welcomeEverActive = false;
              const origFetch = window.fetch.bind(window);
              window.fetch = async function (url, opts) {
                if (String(url).includes('/api/account/context')) {
                  await new Promise(r => setTimeout(r, 400));
                }
                return origFetch(url, opts);
              };
              document.addEventListener('DOMContentLoaded', () => {
                const w = document.getElementById('welcomeScreen');
                if (w && w.classList.contains('active')) window.__welcomeEverActive = true;
                if (w) {
                  new MutationObserver(() => {
                    if (w.classList.contains('active')) window.__welcomeEverActive = true;
                  }).observe(w, { attributes: true, attributeFilter: ['class'] });
                }
              });
            `
          },
          tab.sessionId
        );
      }
      await cdp.send('Page.navigate', { url: `${baseUrl}/` }, tab.sessionId);
      await waitForCondition(
        () =>
          cdp.eval(
            tab.sessionId,
            `Boolean(window.bitesharkWelcome && document.getElementById('profileHeading').textContent.includes('@wel.biteshark.test'))`
          ),
        { label: `${roleName} authenticated home settled` }
      );
      const state = await cdp.eval(
        tab.sessionId,
        `({
          welcomeActive: document.getElementById('welcomeScreen').classList.contains('active'),
          vendorIntroActive: document.getElementById('vendorIntroScreen').classList.contains('active'),
          discoverActive: document.getElementById('discoverScreen').classList.contains('active'),
          ownerActive: document.getElementById('ownerScreen').classList.contains('active'),
          welcomeEverActive: Boolean(window.__welcomeEverActive),
          geoCalls: window.__geoCallCount
        })`
      );
      assert.equal(state.welcomeActive, false, `${roleName} must skip welcome`);
      assert.equal(state.vendorIntroActive, false, `${roleName} must not see vendor intro`);
      assert.equal(state.discoverActive, true, `${roleName} must land on customer discovery`);
      assert.equal(state.ownerActive, false, 'Authenticated vendor opening / must not be forced into Owner Mode');
      assert.equal(state.welcomeEverActive, false, 'Authenticated user must see ZERO welcome flash while session resolves');
      assert.equal(state.geoCalls, 0, 'Zero automatic geolocation prompts on arrival');

      if (roleName === 'Vendor Owner') {
        // Switch between vendor intro and customer browsing -> verify Vendor Owner permissions remain 100% intact!
        await cdp.eval(tab.sessionId, `document.getElementById('rxSwitchExperienceBtn').click()`);
        assert.equal(
          await cdp.eval(tab.sessionId, `document.getElementById('vendorIntroScreen').classList.contains('active')`),
          true
        );
        await cdp.eval(tab.sessionId, `document.getElementById('rxSwitchExperienceBtn').click()`);
        const afterSwitch = await cdp.eval(
          tab.sessionId,
          `(async () => {
            const r = await fetch('/api/account/context', { credentials: 'same-origin' });
            const j = await r.json();
            return {
              discoverActive: document.getElementById('discoverScreen').classList.contains('active'),
              memberships: j.memberships.map(m => m.vendor_id + ':' + m.role)
            };
          })()`
        );
        assert.equal(afterSwitch.discoverActive, true);
        assert.deepEqual(afterSwitch.memberships, ['mitote:owner']);
      }
    }
    console.log('✓ [1/8] Authenticated Customer, Vendor, Mod & Top skip welcome with zero flash & preserved roles');

    // =========================================================================
    // 2. Signed-Out First Visit Welcome + Customer / Just Browse Paths + Screenshots
    // =========================================================================
    const firstVisitTab = await openIsolatedTab({ authActor: null, width: 1280, height: 860 });
    await cdp.send('Page.navigate', { url: `${baseUrl}/` }, firstVisitTab.sessionId);
    await waitForCondition(
      () =>
        cdp.eval(
          firstVisitTab.sessionId,
          `document.getElementById('welcomeScreen').classList.contains('active')`
        ),
      { label: 'signed-out first visit shows welcomeScreen' }
    );

    const welcomeCheck = await cdp.eval(
      firstVisitTab.sessionId,
      `({
        heading: document.getElementById('welcomeHeading').textContent.trim(),
        rememberChecked: document.getElementById('welcomeRememberChoice').checked,
        cookies: document.cookie,
        geoCalls: window.__geoCallCount,
        hasCustomerBtn: document.getElementById('welcomeCustomerBtn').textContent.includes('Find something good'),
        hasVendorBtn: document.getElementById('welcomeVendorBtn').textContent.includes('I run a food business'),
        hasJustBrowse: document.getElementById('welcomeJustBrowseBtn').textContent.trim() === 'Just browse',
        hasSignIn: document.getElementById('welcomeSignInLink').textContent.includes('Already have an account? Sign in')
      })`
    );
    assert.equal(welcomeCheck.heading, 'Welcome to BiteShark. What brings you here?');
    assert.equal(welcomeCheck.rememberChecked, false, 'Remember checkbox must default to unchecked');
    assert.equal(welcomeCheck.cookies, '', 'No preference cookie set before choice');
    assert.equal(welcomeCheck.geoCalls, 0);
    assert(welcomeCheck.hasCustomerBtn && welcomeCheck.hasVendorBtn && welcomeCheck.hasJustBrowse && welcomeCheck.hasSignIn);

    if (screenshotDir) {
      await new Promise(r => setTimeout(r, 120));
      const wShot = await cdp.send('Page.captureScreenshot', { format: 'png' }, firstVisitTab.sessionId);
      fs.writeFileSync(path.join(screenshotDir, 'welcome-first-visit.png'), Buffer.from(wShot.data, 'base64'));
    }

    // Click "Find something good" with remember UNCHECKED -> opens discovery, 0 cookies written, 0 geo calls
    await cdp.eval(firstVisitTab.sessionId, `document.getElementById('welcomeCustomerBtn').click()`);
    await waitForCondition(
      () =>
        cdp.eval(
          firstVisitTab.sessionId,
          `document.getElementById('discoverScreen').classList.contains('active') && document.querySelectorAll('#truckCards .truck-card').length === 59`
        ),
      { label: 'customer path immediately opens 59-listing discovery' }
    );
    assert.equal(await cdp.eval(firstVisitTab.sessionId, `document.cookie`), '', 'Unchecked remember must set zero cookies');
    assert.equal(await cdp.eval(firstVisitTab.sessionId, `window.__geoCallCount`), 0, 'Customer entry must not auto-prompt geolocation');

    if (screenshotDir) {
      await new Promise(r => setTimeout(r, 120));
      const cShot = await cdp.send('Page.captureScreenshot', { format: 'png' }, firstVisitTab.sessionId);
      fs.writeFileSync(path.join(screenshotDir, 'welcome-customer-entry.png'), Buffer.from(cShot.data, 'base64'));
    }

    // Also verify "Just browse" requires no registration and sets no cookie
    await cdp.send('Page.reload', {}, firstVisitTab.sessionId);
    await waitForCondition(
      () => cdp.eval(firstVisitTab.sessionId, `document.getElementById('welcomeScreen').classList.contains('active')`),
      { label: 'unremembered reload shows welcome again' }
    );
    await cdp.eval(firstVisitTab.sessionId, `document.getElementById('welcomeJustBrowseBtn').click()`);
    assert.equal(
      await cdp.eval(firstVisitTab.sessionId, `document.getElementById('discoverScreen').classList.contains('active')`),
      true
    );
    assert.equal(await cdp.eval(firstVisitTab.sessionId, `document.cookie`), '');
    console.log('✓ [2/8] Signed-out first visit welcome, Customer path & Just browse verified (+ screenshots)');

    // =========================================================================
    // 3. Vendor Introduction, Listing Search/Preselect, 14+ & Staging Gates,
    //    Validated Handoff Into Existing Claim Flow & Zero Privilege Escalation
    // =========================================================================
    const vendorFlowTab = await openIsolatedTab({ authActor: null, width: 1280, height: 900 });
    await cdp.send('Page.navigate', { url: `${baseUrl}/` }, vendorFlowTab.sessionId);
    await waitForCondition(
      () => cdp.eval(vendorFlowTab.sessionId, `document.getElementById('welcomeScreen').classList.contains('active')`),
      { label: 'vendor flow welcome ready' }
    );
    await cdp.eval(vendorFlowTab.sessionId, `document.getElementById('welcomeVendorBtn').click()`);
    await waitForCondition(
      () =>
        cdp.eval(
          vendorFlowTab.sessionId,
          `document.getElementById('vendorIntroScreen').classList.contains('active') && document.getElementById('viListingSelect').options.length > 10`
        ),
      { label: 'vendorIntroScreen active with Sonoma listings populated' }
    );

    // Search "Iñiguez" and verify it filters & preselects `iniguez` cleanly
    const viCheck = await cdp.eval(
      vendorFlowTab.sessionId,
      `(() => {
        const search = document.getElementById('viListingSearch');
        search.value = 'Iniguez';
        search.dispatchEvent(new Event('input', { bubbles: true }));
        const sel = document.getElementById('viListingSelect');
        return {
          lead: document.getElementById('vendorIntroHeading').textContent.trim(),
          selectedId: sel.value,
          bodyText: document.getElementById('vendorIntroScreen').textContent
        };
      })()`
    );
    assert.equal(viCheck.lead, 'Your customers should find your food—not give you more admin work.');
    assert.equal(viCheck.selectedId, 'iniguez');
    assert(viCheck.bodyText.includes('Account creation and business approval are separate steps'));
    assert(viCheck.bodyText.includes('push alerts are not enabled'));

    if (screenshotDir) {
      await new Promise(r => setTimeout(r, 120));
      const viShot = await cdp.send('Page.captureScreenshot', { format: 'png' }, vendorFlowTab.sessionId);
      fs.writeFileSync(path.join(screenshotDir, 'welcome-vendor-intro.png'), Buffer.from(viShot.data, 'base64'));
    }

    // Click "Find and claim my business" -> navigates to `/login.html?mode=signup&next=...claim_vendor=iniguez`
    await cdp.eval(vendorFlowTab.sessionId, `document.getElementById('viClaimBusinessBtn').click()`);
    await waitForCondition(
      () =>
        cdp.eval(
          vendorFlowTab.sessionId,
          `window.location.pathname === '/login.html' && Boolean(window.__bitesharkLoginReady)`
        ),
      { label: 'navigated to login.html with claim_vendor context' }
    );
    const loginBannerState = await cdp.eval(
      vendorFlowTab.sessionId,
      `({
        href: window.location.search,
        signupSelected: document.getElementById('tabSignUp').getAttribute('aria-selected'),
        vendorBannerVisible: !document.getElementById('vendorContextBanner').hidden,
        vendorBannerText: document.getElementById('vendorContextBanner').textContent
      })`
    );
    assert.equal(loginBannerState.signupSelected, 'true');
    assert.equal(loginBannerState.vendorBannerVisible, true);
    assert(loginBannerState.vendorBannerText.includes('iniguez'));

    // Verify staging recipient restriction STILL rejects unallowlisted domain (`@outside.example.com`)
    await cdp.eval(
      vendorFlowTab.sessionId,
      `(() => {
        document.getElementById('email').value = 'blocked@outside.example.com';
        document.getElementById('dobMonth').value = '05';
        document.getElementById('dobDay').value = '14';
        document.getElementById('dobYear').value = '1990';
        document.getElementById('emailForm').requestSubmit();
      })()`
    );
    await waitForCondition(
      () =>
        cdp.eval(
          vendorFlowTab.sessionId,
          `/staging|invitation|operator/i.test(document.getElementById('error').textContent)`
        ),
      { label: 'staging recipient restriction enforced on vendor signup path' }
    );

    // Verify 14+ age eligibility STILL rejects under-14 birth year (`2020`) in an isolated tab
    const under14Tab = await openIsolatedTab({ authActor: null });
    await cdp.send(
      'Page.navigate',
      { url: `${baseUrl}/login.html?mode=signup&next=${encodeURIComponent('/?vendor_onboard=claim&claim_vendor=iniguez')}` },
      under14Tab.sessionId
    );
    await waitForCondition(() => cdp.eval(under14Tab.sessionId, `Boolean(window.__bitesharkLoginReady)`));
    await cdp.eval(
      under14Tab.sessionId,
      `(() => {
        document.getElementById('email').value = 'child@wel.biteshark.test';
        document.getElementById('dobMonth').value = '06';
        document.getElementById('dobDay').value = '10';
        document.getElementById('dobYear').value = '2020';
        document.getElementById('emailForm').requestSubmit();
      })()`
    );
    await waitForCondition(
      () =>
        cdp.eval(
          under14Tab.sessionId,
          `document.getElementById('error').textContent.includes('14') && document.getElementById('sendBtn').disabled`
        ),
      { label: 'under-14 age eligibility gate enforced on vendor signup path' }
    );

    // Complete 14+ signup on `vendorFlowTab` with allowlisted disposable email `applicant@wel.biteshark.test`
    const beforeApplicantOtp = capturedEmails.length;
    await cdp.eval(
      vendorFlowTab.sessionId,
      `(() => {
        document.getElementById('email').value = 'applicant@wel.biteshark.test';
        document.getElementById('dobMonth').value = '03';
        document.getElementById('dobDay').value = '22';
        document.getElementById('dobYear').value = '1988';
        document.getElementById('emailForm').requestSubmit();
      })()`
    );
    await waitForCondition(
      () => cdp.eval(vendorFlowTab.sessionId, `!document.getElementById('codeStep').hidden`),
      { label: 'applicant OTP step shown' }
    );
    const appOtp = /\b(\d{6})\b/.exec(capturedEmails[beforeApplicantOtp].text)[1];
    await cdp.eval(
      vendorFlowTab.sessionId,
      `(() => {
        document.getElementById('code').value = ${JSON.stringify(appOtp)};
        document.getElementById('codeForm').requestSubmit();
      })()`
    );

    // Must return to `/` and automatically open `#vendorApplyModal` with `claim_existing` + `iniguez` pre-filled!
    await waitForCondition(
      () =>
        cdp.eval(
          vendorFlowTab.sessionId,
          `window.location.pathname === '/' && !document.getElementById('vendorApplyModal').hidden && !document.getElementById('vaFormPane').hidden`
        ),
      { label: 'vendorApplyModal opened automatically after signup with preserved listing' }
    );
    const postSignupVendorState = await cdp.eval(
      vendorFlowTab.sessionId,
      `(async () => {
        const ctxRes = await fetch('/api/account/context', { credentials: 'same-origin' });
        const ctxJson = await ctxRes.json();
        const mutRes = await fetch('/api/owner/location', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ truck_id: 'iniguez', location: 'Unauthorized attempt' })
        });
        return {
          cleanSearch: window.location.search,
          vaType: document.getElementById('vaType').value,
          vaTargetVendor: document.getElementById('vaTargetVendor').value,
          vaBusinessName: document.getElementById('vaBusinessName').value,
          roleLabels: ctxJson.role_labels,
          membershipsCount: ctxJson.memberships.length,
          ownerMutStatus: mutRes.status
        };
      })()`
    );
    assert.equal(postSignupVendorState.cleanSearch, '', 'One-time vendor_onboard query cleaned after handoff');
    assert.equal(postSignupVendorState.vaType, 'claim_existing');
    assert.equal(postSignupVendorState.vaTargetVendor, 'iniguez');
    assert.equal(postSignupVendorState.vaBusinessName, 'Tacos Iñiguez');
    assert.deepEqual(postSignupVendorState.roleLabels, ['Customer']);
    assert.equal(postSignupVendorState.membershipsCount, 0, 'Selecting vendor path + listing must grant ZERO memberships');
    assert.equal(postSignupVendorState.ownerMutStatus, 403, 'Unapproved vendor applicant blocked from owner mutations');
    console.log('✓ [3/8] Vendor intro, listing search/handoff, 14+/staging gates & zero privilege escalation verified');

    // =========================================================================
    // 4. Remembered Cookie (`bs_start_pref`), Shared-Device Safety, Malformed
    //    & Blocked Cookie Resilience, and Non-Destructive Forget Reset
    // =========================================================================
    const prefTab = await openIsolatedTab({ authActor: null });
    await cdp.send('Page.navigate', { url: `${baseUrl}/` }, prefTab.sessionId);
    await waitForCondition(
      () => cdp.eval(prefTab.sessionId, `document.getElementById('welcomeScreen').classList.contains('active')`),
      { label: 'prefTab welcome active' }
    );

    // Save a guest favorite first, then remember 'vendor' choice
    await cdp.eval(
      prefTab.sessionId,
      `(() => {
        localStorage.setItem('truckly_favs', JSON.stringify(['mitote']));
        document.getElementById('welcomeRememberChoice').checked = true;
        document.getElementById('welcomeVendorBtn').click();
      })()`
    );
    const allCookies = await cdp.send('Network.getCookies', { urls: [baseUrl] }, prefTab.sessionId);
    const startCookie = allCookies.cookies.find(c => c.name === 'bs_start_pref');
    assert(startCookie, 'Expected bs_start_pref cookie when Remember is checked');
    assert.equal(startCookie.value, 'vendor');
    assert.equal(startCookie.sameSite, 'Lax');
    assert.equal(startCookie.path, '/');
    const daysExpiry = (startCookie.expires * 1000 - Date.now()) / (24 * 3600 * 1000);
    assert(daysExpiry > 88 && daysExpiry <= 91, `Expected ~90-day finite expiry, got ${daysExpiry} days`);

    // Reload -> skips welcome and opens `#vendorIntroScreen`
    await cdp.send('Page.reload', {}, prefTab.sessionId);
    await waitForCondition(
      () =>
        cdp.eval(
          prefTab.sessionId,
          `document.getElementById('vendorIntroScreen').classList.contains('active') && !document.getElementById('viRememberedBadge').hidden`
        ),
      { label: 'remembered vendor preference opens vendorIntroScreen on reload' }
    );

    // Shared-device check: if Customer signs in on this browser with `bs_start_pref=vendor`, session wins -> Discover!
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
      prefTab.sessionId
    );
    await cdp.send('Page.navigate', { url: `${baseUrl}/` }, prefTab.sessionId);
    await waitForCondition(
      () =>
        cdp.eval(
          prefTab.sessionId,
          `document.getElementById('profileHeading').textContent.includes('customer@wel.biteshark.test')`
        ),
      { label: 'shared device customer signed in' }
    );
    assert.equal(
      await cdp.eval(prefTab.sessionId, `document.getElementById('discoverScreen').classList.contains('active')`),
      true,
      'Authenticated customer on shared device must skip vendor intro'
    );

    // Forget saved preference -> clears ONLY `bs_start_pref`, does NOT log out, and preserves `localStorage`!
    await cdp.eval(prefTab.sessionId, `document.getElementById('rxForgetStartPrefBtn').click()`);
    const afterForget = await cdp.eval(
      prefTab.sessionId,
      `(async () => {
        const s = await fetch('/api/auth/session', { credentials: 'same-origin' }).then(r => r.json());
        return {
          prefNow: window.bitesharkWelcome.readPreference(),
          stillAuthenticated: s.authenticated,
          favsPreserved: localStorage.getItem('truckly_favs')
        };
      })()`
    );
    assert.equal(afterForget.prefNow, null);
    assert.equal(afterForget.stillAuthenticated, true, 'Forgetting preference must not log user out');
    assert(afterForget.favsPreserved && afterForget.favsPreserved.includes('mitote'));

    // Malformed / tampered cookie (`bs_start_pref=admin_top`) fails safely and scrubs cookie
    const badCookieTab = await openIsolatedTab({ authActor: null });
    await cdp.send(
      'Network.setCookie',
      { name: 'bs_start_pref', value: 'admin_top', url: baseUrl, path: '/' },
      badCookieTab.sessionId
    );
    await cdp.send('Page.navigate', { url: `${baseUrl}/` }, badCookieTab.sessionId);
    await waitForCondition(
      () => cdp.eval(badCookieTab.sessionId, `document.getElementById('welcomeScreen').classList.contains('active')`),
      { label: 'malformed cookie scrubbed and welcome shown safely' }
    );
    assert.equal(await cdp.eval(badCookieTab.sessionId, `document.cookie`), '');

    // Blocked cookie storage fails safely without blocking navigation or falsely claiming saved
    const blockedCookieTab = await openIsolatedTab({ authActor: null });
    await cdp.send(
      'Page.addScriptToEvaluateOnNewDocument',
      {
        source: `Object.defineProperty(document, 'cookie', { get: () => '', set: () => {} });`
      },
      blockedCookieTab.sessionId
    );
    await cdp.send('Page.navigate', { url: `${baseUrl}/` }, blockedCookieTab.sessionId);
    await waitForCondition(
      () => cdp.eval(blockedCookieTab.sessionId, `document.getElementById('welcomeScreen').classList.contains('active')`),
      { label: 'blocked cookie tab welcome shown' }
    );
    const blockedNav = await cdp.eval(
      blockedCookieTab.sessionId,
      `(() => {
        document.getElementById('welcomeRememberChoice').checked = true;
        document.getElementById('welcomeCustomerBtn').click();
        return {
          discoverActive: document.getElementById('discoverScreen').classList.contains('active'),
          toastText: document.getElementById('toast').textContent
        };
      })()`
    );
    assert.equal(blockedNav.discoverActive, true, 'Blocked cookie write must never block navigation');
    assert(blockedNav.toastText.includes('blocked saving the preference cookie'));
    console.log('✓ [4/8] 90-day cookie, shared-device safety, malformed/blocked resilience & reset verified');

    // =========================================================================
    // 5. Direct Deep Links Bypass Welcome & Retain Context
    // =========================================================================
    // 5a. Direct listing `/#spot=mitote`
    const spotTab = await openIsolatedTab({ authActor: null });
    await cdp.send('Page.navigate', { url: `${baseUrl}/#spot=mitote` }, spotTab.sessionId);
    await waitForCondition(
      () =>
        cdp.eval(
          spotTab.sessionId,
          `document.getElementById('detailModal').classList.contains('show') && document.getElementById('detailContent').textContent.includes('Mitote Food Park')`
        ),
      { label: '/#spot=mitote bypassed welcome and opened detail modal' }
    );
    assert.equal(await cdp.eval(spotTab.sessionId, `window.location.hash`), '#spot=mitote');

    // 5b. Food trail `/#trail=mitote,iniguez`
    const trailTab = await openIsolatedTab({ authActor: null });
    await cdp.send('Page.navigate', { url: `${baseUrl}/#trail=mitote,iniguez` }, trailTab.sessionId);
    await waitForCondition(
      () =>
        cdp.eval(
          trailTab.sessionId,
          `document.getElementById('smartScreen').classList.contains('active') && document.getElementById('smartResults').textContent.includes('Mitote Food Park')`
        ),
      { label: '/#trail=mitote,iniguez bypassed welcome and rendered trail' }
    );
    assert.equal(await cdp.eval(trailTab.sessionId, `window.location.hash`), '#trail=mitote,iniguez');

    // 5c. Pickup pager `/#pager=<uuid>`
    const pagerTab = await openIsolatedTab({ authActor: null });
    await cdp.send('Page.navigate', { url: `${baseUrl}/#pager=${realPagerId}` }, pagerTab.sessionId);
    await waitForCondition(
      () =>
        cdp.eval(
          pagerTab.sessionId,
          `document.getElementById('pagerScreen').classList.contains('active') && document.getElementById('pagerDisplay').textContent.includes('#88')`
        ),
      { label: '/#pager=<uuid> bypassed welcome and joined pickup ticket' }
    );

    // 5d. Single-use invitation `/#accept-invite=<token>`
    const inviteTab = await openIsolatedTab({ authActor: null });
    await cdp.send(
      'Page.navigate',
      { url: `${baseUrl}/#accept-invite=${encodeURIComponent(realInviteToken)}` },
      inviteTab.sessionId
    );
    await waitForCondition(
      () =>
        cdp.eval(
          inviteTab.sessionId,
          `!document.getElementById('inviteAcceptModal').hidden && document.getElementById('iaBody').textContent.includes('Customer')`
        ),
      { label: '/#accept-invite=<token> bypassed welcome and opened invite modal' }
    );

    // 5e. Support link `/#support`
    const supLinkTab = await openIsolatedTab({ authActor: null });
    await cdp.send('Page.navigate', { url: `${baseUrl}/#support` }, supLinkTab.sessionId);
    await waitForCondition(
      () =>
        cdp.eval(
          supLinkTab.sessionId,
          `!document.getElementById('supportIssuesModal').hidden && !document.getElementById('siGuestPane').hidden`
        ),
      { label: '/#support bypassed welcome and opened support modal' }
    );
    console.log('✓ [5/8] Direct listing, trail, pager, invitation & support links bypass welcome cleanly');

    // =========================================================================
    // 6. Session Failure Resilience, Coarse Suggestion Override & Outside-Area Notice
    // =========================================================================
    // 6a. Failed `/api/account/context` (503) leaves public discovery usable with truthful notice!
    const failedCtxTab = await openIsolatedTab({ authActor: null });
    await cdp.send(
      'Page.addScriptToEvaluateOnNewDocument',
      {
        source: `
          const origF = window.fetch.bind(window);
          window.fetch = async function (u, o) {
            if (String(u).includes('/api/account/context')) {
              return new Response(JSON.stringify({ error: 'Unavailable' }), {
                status: 503,
                headers: { 'Content-Type': 'application/json' }
              });
            }
            return origF(u, o);
          };
        `
      },
      failedCtxTab.sessionId
    );
    await cdp.send('Page.navigate', { url: `${baseUrl}/` }, failedCtxTab.sessionId);
    await waitForCondition(
      () =>
        cdp.eval(
          failedCtxTab.sessionId,
          `document.getElementById('discoverScreen').classList.contains('active') && document.querySelectorAll('#truckCards .truck-card').length === 59 && !document.getElementById('coarseAreaBanner').hidden`
        ),
      { label: 'failed session check keeps discovery usable with guest notice' }
    );
    assert(
      (await cdp.eval(failedCtxTab.sessionId, `document.getElementById('coarseAreaBanner').textContent`)).includes(
        'guest mode'
      )
    );

    // 6b. Coarse area suggestion (`Near Santa Rosa?`) + zero fabricated distances + manual override (`Petaluma`)
    const coarseTab = await openIsolatedTab({
      authActor: null,
      extraHeaders: { 'x-geo-city': 'Santa Rosa', 'x-geo-region': 'CA', 'x-geo-country': 'US' }
    });
    await cdp.send(
      'Network.setCookie',
      { name: 'bs_start_pref', value: 'customer', url: baseUrl, path: '/' },
      coarseTab.sessionId
    );
    await cdp.send('Page.navigate', { url: `${baseUrl}/` }, coarseTab.sessionId);
    await waitForCondition(
      () =>
        cdp.eval(
          coarseTab.sessionId,
          `!document.getElementById('coarseAreaBanner').hidden && document.getElementById('coarseAreaBanner').textContent.includes('Near Santa Rosa?')`
        ),
      { label: 'coarse Santa Rosa suggestion rendered asynchronously' }
    );
    const coarseCheck = await cdp.eval(
      coarseTab.sessionId,
      `({
        userCoordsNull: userCoords === null,
        anyFabricatedDistance: trucks.some(t => t.distance !== null),
        geoCalls: window.__geoCallCount
      })`
    );
    assert.equal(coarseCheck.userCoordsNull, true);
    assert.equal(coarseCheck.anyFabricatedDistance, false, 'Coarse area must never fabricate measured distances');
    assert.equal(coarseCheck.geoCalls, 0);

    // Manual area selection (`Petaluma`) overrides coarse suggestion without calling geolocation!
    await cdp.eval(coarseTab.sessionId, `document.getElementById('locationPillBtn').click()`);
    await waitForCondition(
      () => cdp.eval(coarseTab.sessionId, `document.getElementById('areaModal').classList.contains('show')`),
      { label: 'areaModal opened without calling geolocation' }
    );
    assert.equal(await cdp.eval(coarseTab.sessionId, `window.__geoCallCount`), 0);
    await cdp.eval(coarseTab.sessionId, `document.querySelector('[data-area-town="Petaluma"]').click()`);
    const manualOverrideState = await cdp.eval(
      coarseTab.sessionId,
      `({
        locLabel: document.getElementById('locationLabel').textContent,
        coarseBannerHidden: document.getElementById('coarseAreaBanner').hidden,
        filteredCount: filtered().length
      })`
    );
    assert.equal(manualOverrideState.locLabel, 'Petaluma');
    assert.equal(manualOverrideState.coarseBannerHidden, true);
    assert(manualOverrideState.filteredCount >= 3 && manualOverrideState.filteredCount < 59);

    // 6c. Explicit "Use my location" outside Sonoma County (San Francisco) explains Sonoma scope & keeps all 59 spots!
    const outsideGeoState = await cdp.eval(
      coarseTab.sessionId,
      `(async () => {
        window.__mockGeoPosition = { coords: { latitude: 37.7749, longitude: -122.4194 } };
        document.getElementById('searchLocateBtn').click();
        await new Promise(r => setTimeout(r, 80));
        return {
          geoCalls: window.__geoCallCount,
          locLabel: document.getElementById('locationLabel').textContent,
          bannerText: document.getElementById('coarseAreaBanner').textContent,
          visibleCards: document.querySelectorAll('#truckCards .truck-card').length
        };
      })()`
    );
    assert.equal(outsideGeoState.geoCalls, 1, 'Geolocation called ONLY on explicit Use my location click');
    assert.equal(outsideGeoState.locLabel, 'Sonoma County');
    assert(outsideGeoState.bannerText.includes('BiteShark is starting in Sonoma County'));
    assert.equal(outsideGeoState.visibleCards, 59, 'Outside-Sonoma visitor can still explore all 59 Sonoma spots');
    console.log('✓ [6/8] Failed-session resilience, coarse suggestion, manual override & outside-area scope verified');

    // =========================================================================
    // 7. Feature Controls Respected on `#vendorIntroScreen`
    // =========================================================================
    const fcListRes = await fetch(`${baseUrl}/api/admin/features`, {
      headers: { Cookie: topAuth.rawCookie }
    });
    const fcListJson = await fcListRes.json();
    const curRev = fcListJson.controls.find(f => f.key === 'pickup_pager_creation')?.revision ?? 1;

    const fcPauseRes = await fetch(`${baseUrl}/api/admin/features/update`, {
      method: 'POST',
      headers: {
        Origin: baseUrl,
        Cookie: topAuth.rawCookie,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        feature_key: 'pickup_pager_creation',
        state: 'paused',
        expected_revision: curRev,
        confirmed_impact: true,
        reason: 'Verify vendor intro hides disabled capability promises'
      })
    });
    assert.equal(fcPauseRes.status, 200);
    await cdp.eval(
      firstVisitTab.sessionId,
      `(async () => {
        await window.bitesharkFeatures.refresh();
        window.bitesharkWelcome.openVendorIntro({ focusHeading: true });
      })()`
    );
    const pagerCapHidden = await cdp.eval(
      firstVisitTab.sessionId,
      `document.querySelector('#viCapabilitiesList [data-vi-feature="pickup_pager_creation"]').hidden`
    );
    assert.equal(pagerCapHidden, true, 'Vendor intro must hide disabled capabilities rather than promising them');

    // Restore `pickup_pager_creation` to `enabled`
    await fetch(`${baseUrl}/api/admin/features/update`, {
      method: 'POST',
      headers: {
        Origin: baseUrl,
        Cookie: topAuth.rawCookie,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        feature_key: 'pickup_pager_creation',
        state: 'enabled',
        expected_revision: curRev + 1,
        confirmed_impact: true,
        reason: 'Restore default after check'
      })
    });
    console.log('✓ [7/8] Vendor introduction dynamically respects runtime feature controls');

    // =========================================================================
    // 8. Keyboard Operation, Reduced Motion & 320px / 375px / 200%-Zoom Reflow
    // =========================================================================
    const a11yTab = await openIsolatedTab({ authActor: null, width: 1280, height: 840, reducedMotion: true });
    await cdp.send('Page.navigate', { url: `${baseUrl}/` }, a11yTab.sessionId);
    await waitForCondition(
      () => cdp.eval(a11yTab.sessionId, `document.getElementById('welcomeScreen').classList.contains('active')`),
      { label: 'a11y welcome screen active' }
    );
    assert.equal(await cdp.eval(a11yTab.sessionId, `document.activeElement?.id`), 'welcomeHeading');
    // Press Tab -> focuses `#welcomeCustomerBtn` -> press Enter -> opens discovery via keyboard!
    await cdp.pressKey(a11yTab.sessionId, 'Tab');
    assert.equal(await cdp.eval(a11yTab.sessionId, `document.activeElement?.id`), 'welcomeCustomerBtn');

    for (const vp of [
      { width: 320, height: 640, label: '320x640 narrow mobile' },
      { width: 375, height: 812, label: '375x812 mobile' },
      { width: 640, height: 360, label: '640x360 (200% zoom)' }
    ]) {
      await cdp.send(
        'Emulation.setDeviceMetricsOverride',
        { width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: vp.width < 500 },
        a11yTab.sessionId
      );
      await cdp.eval(a11yTab.sessionId, `window.bitesharkWelcome.openWelcome()`);
      await new Promise(r => setTimeout(r, 60));
      const wOverflow = await cdp.eval(
        a11yTab.sessionId,
        `document.documentElement.scrollWidth - window.innerWidth`
      );
      assert(wOverflow <= 2, `Welcome horizontal overflow (${wOverflow}px) at ${vp.label}`);

      await cdp.eval(a11yTab.sessionId, `window.bitesharkWelcome.openVendorIntro({ focusHeading: true })`);
      await new Promise(r => setTimeout(r, 60));
      const viOverflow = await cdp.eval(
        a11yTab.sessionId,
        `document.documentElement.scrollWidth - window.innerWidth`
      );
      assert(viOverflow <= 2, `Vendor intro horizontal overflow (${viOverflow}px) at ${vp.label}`);
    }

    // Activate customer path via keyboard Enter on `#welcomeCustomerBtn`
    await cdp.eval(a11yTab.sessionId, `window.bitesharkWelcome.openWelcome(); document.getElementById('welcomeCustomerBtn').focus();`);
    await cdp.pressKey(a11yTab.sessionId, 'Enter');
    await waitForCondition(
      () => cdp.eval(a11yTab.sessionId, `document.getElementById('discoverScreen').classList.contains('active')`),
      { label: 'keyboard Enter activated customer discovery' }
    );
    console.log('✓ [8/8] Keyboard navigation, focus, reduced-motion & 320px/375px/200%-zoom reflow verified');

    console.log('PASS: Headless Chrome + PostgreSQL First-Visit Welcome & Vendor Intro E2E passed.');
  } finally {
    if (cdp) cdp.close();
    if (chromeProc) {
      try {
        chromeProc.kill('SIGKILL');
      } catch {}
    }
    if (serverHandle) {
      await new Promise(r => serverHandle.server.close(r)).catch(() => {});
    }
    if (appPool) await appPool.end().catch(() => {});
    if (migratorPool) await migratorPool.end().catch(() => {});
    await adminPool.end().catch(() => {});
    await pgCluster.stop();
    if (chromeProfileDir) {
      try {
        fs.rmSync(chromeProfileDir, { recursive: true, force: true });
      } catch {}
    }
  }
})().catch(err => {
  console.error('WELCOME E2E FAILURE:', err);
  process.exitCode = 1;
});
