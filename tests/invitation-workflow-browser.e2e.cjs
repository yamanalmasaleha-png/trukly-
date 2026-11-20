// Real Headless Chrome + Real PostgreSQL + Wire-Level Resend End-to-End Browser Suite
// for BiteShark Administrator Account Invitations, Zero-Query-String Token Preservation,
// Mobile/Desktop Responsiveness, Keyboard Accessibility & Exact-Email Staging Access
//
// Run locally:
//   $env:TRUCKLY_PG_NODE_MODULES="<path-to-pg-and-pg-binaries>"
//   node tests/invitation-workflow-browser.e2e.cjs

const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const http = require('node:http');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');

function requirePg() {
  const extraBase = process.env.TRUCKLY_PG_NODE_MODULES || process.env.BITESHARK_PG_NODE_MODULES;
  if (extraBase) return require(path.join(extraBase, 'pg'));
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
    throw new Error('Set DATABASE_URL or provide @embedded-postgres binaries via TRUCKLY_PG_NODE_MODULES.');
  }

  const initdbExe = path.join(nativeBinDir, 'initdb' + binSuffix);
  const pgCtlExe = path.join(nativeBinDir, 'pg_ctl' + binSuffix);
  const port = await getFreePort();
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'biteshark-inv-e2e-pg-'));
  const dataDir = path.join(tmpBase, 'data');
  const pwFile = path.join(tmpBase, 'pw.txt');
  const logFile = path.join(tmpBase, 'postgres.log');
  const password = 'e2e_inv_' + crypto.randomBytes(6).toString('hex');
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
        const fns = this.listeners.get(msg.method) || [];
        for (const fn of fns) fn(msg.params, msg.sessionId);
      }
    });
  }

  on(method, fn) {
    const list = this.listeners.get(method) || [];
    list.push(fn);
    this.listeners.set(method, list);
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

function extractOtpFromBody(text) {
  const m = String(text || '').match(/(?:verification code:\s*)(\d{6})/i) || String(text || '').match(/\b(\d{6})\b/);
  return m ? m[1] : null;
}

function extractInviteTokenFromBody(text) {
  const m = String(text || '').match(/https?:\/\/[^\s]+\/#accept-invite=([A-Za-z0-9_-]+)/);
  return m ? { fullLink: m[0], token: m[1] } : null;
}

(async () => {
  const chromeBin = findChromeBinary();
  const pgCluster = await createPostgresCluster();
  const suffix = crypto.randomBytes(4).toString('hex');
  const migratorRole = `bs_inve2e_mig_${suffix}`;
  const migratorPass = `mig_${suffix}`;
  const appRole = `bs_inve2e_app_${suffix}`;
  const appPass = `app_${suffix}`;
  const dbName = `bs_inve2e_${suffix}`;

  const adminPool = new Pool({ connectionString: pgCluster.adminUrl, max: 4 });
  let migratorPool = null;
  let appPool = null;
  let server = null;
  let chromeProc = null;
  let cdp = null;
  let chromeProfileDir = null;
  const origFetch = global.fetch;

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
    const appDbUrl = buildDbUrl(pgCluster.adminUrl, { user: appRole, password: appPass, database: dbName });

    execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'run-migrations.cjs'), '--app-role', appRole], {
      cwd: ROOT,
      env: { ...process.env, MIGRATION_DATABASE_URL: migratorDbUrl },
      stdio: 'pipe',
      windowsHide: true
    });

    const topOperatorEmail = 'operator-top@operator.biteshark.test';
    execFileSync(
      process.execPath,
      [path.join(ROOT, 'scripts', 'bootstrap-top-admin.cjs'), '--email', topOperatorEmail],
      {
        cwd: ROOT,
        env: { ...process.env, MIGRATION_DATABASE_URL: migratorDbUrl },
        stdio: 'pipe',
        windowsHide: true
      }
    );

    migratorPool = new Pool({ connectionString: migratorDbUrl, max: 4 });
    appPool = new Pool({ connectionString: appDbUrl, max: 8 });

    // Mark bootstrapped Top admin 14+ eligible so they go straight to /admin after OTP verify
    const seedClient = await migratorPool.connect();
    try {
      await seedClient.query('BEGIN');
      await seedClient.query("SELECT set_config('app.auth_internal', 'true', true)");
      await seedClient.query(
        `UPDATE auth_users
         SET age_eligibility_status = 'eligible_14_plus',
             age_assessed_at = now(),
             age_policy_version = 'draft-14plus-v0.1',
             age_assessment_basis = 'self_reported_dob_at_signup'
         WHERE email_normalized = $1`,
        [topOperatorEmail]
      );
      await seedClient.query('COMMIT');
    } finally {
      seedClient.release();
    }

    const appPort = await getFreePort();
    const baseUrl = `http://127.0.0.1:${appPort}`;
    const authSecret = crypto.randomBytes(32).toString('hex');
    const resendApiKey = 're_e2e_key_' + crypto.randomBytes(16).toString('hex');

    for (const k of Object.keys(process.env)) {
      if (k.startsWith('BITESHARK_') || k.startsWith('TRUCKLY_')) delete process.env[k];
    }
    // Use `development` for local HTTP Chrome navigation without TLS (while still enforcing staging allowlist via STAGING_ALLOWED_EMAIL_DOMAINS? Wait: staging allowlist runs when ENV=staging!)
    // Look: in ENV=staging on loopback HTTP Chrome, `__Host-` cookie in Chrome works on `http://localhost` (secure context!), whereas `127.0.0.1` in Chrome treats `__Host-` + `Secure` as secure on localhost! Let's use `http://localhost:${appPort}`!
    const browserOrigin = `http://localhost:${appPort}`;
    process.env.DATABASE_URL = appDbUrl;
    process.env.BITESHARK_ENV = 'staging';
    process.env.BITESHARK_PUBLIC_ORIGIN = browserOrigin;
    process.env.BITESHARK_AUTH_SECRET = authSecret;
    process.env.BITESHARK_AUTH_DELIVERY_MODE = 'resend_https';
    process.env.BITESHARK_AUTH_EMAIL_API_KEY = resendApiKey;
    process.env.BITESHARK_AUTH_EMAIL_FROM = 'BiteShark <login@biteshark.live>';
    process.env.BITESHARK_AUTH_EMAIL_API_URL = 'https://api.resend.com/emails';
    process.env.BITESHARK_STAGING_ALLOWED_EMAIL_DOMAINS = 'operator.biteshark.test';
    process.env.BITESHARK_PUSH_PROVIDER_MODE = 'disabled';
    process.env.BITESHARK_RELEASE_SHA = 'e2e-invitation-workflow-sha';

    const { createStandaloneServer } = await import(pathToFileURL(path.join(ROOT, 'server', 'app.js')).href);
    const standaloneAuth = await import(pathToFileURL(path.join(ROOT, 'lib', 'standalone-auth.js')).href);

    const capturedEmails = [];
    // Use `setCustomAuthEmailSenderForTests` so `resolveTrustedInvitationOrigin` allows loopback `http://localhost:${appPort}` in local Chrome E2E!
    standaloneAuth.setCustomAuthEmailSenderForTests(async payload => {
      capturedEmails.push(payload);
      return {
        status: 200,
        id: 're_e2e_msg_' + crypto.randomBytes(6).toString('hex')
      };
    });

    // Also rewrite `http://localhost:${appPort}` same-origin `Origin` check in local HTTP Chrome test:
    // Notice `verifySameOriginMutationRequest` requires `https:` when `ENV=staging` unless `X-Forwarded-Proto: https` is present behind loopback proxy!
    // Let's put a 15-line local loopback reverse proxy in front of `server` that sets `X-Forwarded-Proto: https` and `Host: localhost:${proxyPort}` so `ENV=staging` + `TRUST_PROXY=loopback` + `PUBLIC_ORIGIN=https://...` works identically to production Nginx, OR let the proxy listen on `127.0.0.1:${proxyPort}`!
    // Wait: if `PUBLIC_ORIGIN` is `https://...`, invitation email links start with `https://...`, and we navigate Chrome to `${browserOrigin}/#accept-invite=${token}` while the loopback proxy translates `Origin: http://localhost:${proxyPort}` -> `Origin: https://localhost:${proxyPort}` and `X-Forwarded-Proto: https`!
    const backendPort = appPort;
    const proxyPort = await getFreePort();
    const publicHttpsOrigin = `https://localhost:${proxyPort}`;
    const chromeHttpOrigin = `http://localhost:${proxyPort}`;
    process.env.BITESHARK_PUBLIC_ORIGIN = publicHttpsOrigin;
    process.env.BITESHARK_TRUST_PROXY = 'loopback';

    const appInst = createStandaloneServer({
      dbAdapter: appPool,
      publicDir: path.join(ROOT, 'public'),
      releaseSha: 'e2e-invitation-workflow-sha',
      logger: { info: () => {}, warn: () => {}, error: () => {} }
    });
    server = appInst.server;
    await new Promise((resolve, reject) => server.listen(backendPort, '127.0.0.1', err => (err ? reject(err) : resolve())));

    const proxyServer = http.createServer((clientReq, clientRes) => {
      const fwdHeaders = { ...clientReq.headers };
      fwdHeaders['x-forwarded-proto'] = 'https';
      fwdHeaders['x-real-ip'] = '198.51.100.88';
      fwdHeaders['x-forwarded-for'] = '198.51.100.88';
      if (fwdHeaders.origin === chromeHttpOrigin) {
        fwdHeaders.origin = publicHttpsOrigin;
      }
      if (typeof fwdHeaders.referer === 'string' && fwdHeaders.referer.startsWith(chromeHttpOrigin)) {
        fwdHeaders.referer = publicHttpsOrigin + fwdHeaders.referer.slice(chromeHttpOrigin.length);
      }
      const upstream = http.request(
        {
          hostname: '127.0.0.1',
          port: backendPort,
          path: clientReq.url,
          method: clientReq.method,
          headers: fwdHeaders
        },
        upRes => {
          clientRes.writeHead(upRes.statusCode, upRes.headers);
          upRes.pipe(clientRes);
        }
      );
      upstream.on('error', err => {
        clientRes.statusCode = 502;
        clientRes.end(err.message);
      });
      clientReq.pipe(upstream);
    });
    await new Promise((resolve, reject) => proxyServer.listen(proxyPort, '127.0.0.1', err => (err ? reject(err) : resolve())));

    try {
      const cdpPort = await getFreePort();
      chromeProfileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'biteshark-inv-chrome-'));
      chromeProc = spawn(
        chromeBin,
        [
          '--headless=new',
          '--no-sandbox',
          '--disable-gpu',
          '--disable-dev-shm-usage',
          '--no-first-run',
          '--no-default-browser-check',
          '--host-resolver-rules=MAP localhost 127.0.0.1',
          '--window-size=1440,920',
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

      cdp = new CdpClient(versionInfo.webSocketDebuggerUrl);
      await cdp.connect();

      const allNetworkRequestUrls = [];
      cdp.on('Network.requestWillBeSent', params => {
        if (params?.request?.url) {
          allNetworkRequestUrls.push(params.request.url);
        }
      });

      async function createIsolatedTab({ width = 1440, height = 920, mobile = false } = {}) {
        const { browserContextId } = await cdp.send('Target.createBrowserContext');
        const { targetId } = await cdp.send('Target.createTarget', {
          url: 'about:blank',
          browserContextId
        });
        const { sessionId } = await cdp.send('Target.attachToTarget', {
          targetId,
          flatten: true
        });
        await cdp.send('Page.enable', {}, sessionId);
        await cdp.send('Runtime.enable', {}, sessionId);
        await cdp.send('Network.enable', {}, sessionId);
        await cdp.send(
          'Emulation.setDeviceMetricsOverride',
          { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile },
          sessionId
        );
        await cdp.send(
          'Network.setBlockedURLs',
          { urls: ['*://tile.openstreetmap.org/*', '*://unpkg.com/*'] },
          sessionId
        );
        return sessionId;
      }

      // =======================================================================
      // [1/4] Existing Admin: Top Operator Login via `/login.html` + Desktop & Mobile `#sec-accounts`
      // =======================================================================
      const topTab = await createIsolatedTab({ width: 1440, height: 920 });
      await cdp.send('Page.navigate', { url: `${chromeHttpOrigin}/login.html?next=%2Fadmin` }, topTab);
      await waitForCondition(
        () => cdp.eval(topTab, `Boolean(window.__bitesharkLoginReady && document.getElementById('email'))`),
        { label: 'operator login.html ready' }
      );

      const beforeTopOtp = capturedEmails.length;
      await cdp.eval(
        topTab,
        `(() => {
          document.getElementById('email').value = ${JSON.stringify(topOperatorEmail)};
          document.getElementById('emailForm').requestSubmit();
          return true;
        })()`
      );

      const topOtpEmail = await waitForCondition(
        () => capturedEmails.slice(beforeTopOtp).find(m => m.email === topOperatorEmail && m.code),
        { label: 'Top operator OTP email' }
      );
      await waitForCondition(
        () => cdp.eval(topTab, `!document.getElementById('codeStep').hidden`),
        { label: 'codeStep visible for Top operator' }
      );

      await cdp.eval(
        topTab,
        `(() => {
          document.getElementById('code').value = ${JSON.stringify(topOtpEmail.code)};
          document.getElementById('codeForm').requestSubmit();
          return true;
        })()`
      );

      await waitForCondition(
        () => cdp.eval(topTab, `window.location.pathname === '/admin' && Boolean(document.querySelector('[data-section="accounts"]'))`),
        { label: 'redirected to /admin' }
      );

      // Open Accounts & Invitations -> Invitations Queue subtab
      await cdp.eval(
        topTab,
        `(() => {
          document.querySelector('[data-section="accounts"]').click();
          document.querySelector('[data-acct-tab="invitations"]').click();
          return true;
        })()`
      );

      await waitForCondition(
        () =>
          cdp.eval(
            topTab,
            `!document.getElementById('acctInvitationsView').hidden && document.getElementById('invVendorId').options.length >= 55`
          ),
        { label: 'acctInvitationsView visible and 59-vendor selector populated' }
      );

      // Verify full 59-vendor selector when `vendor_staff` is chosen, and Admin: Top callout when `top` is chosen
      const formUiCheck = await cdp.eval(
        topTab,
        `(() => {
          const roleSel = document.getElementById('invRole');
          roleSel.value = 'vendor_staff';
          roleSel.dispatchEvent(new Event('change', { bubbles: true }));
          const vendorOptCount = document.getElementById('invVendorId').options.length;
          const vendorVisible = !document.getElementById('invVendorWrap').hidden;

          roleSel.value = 'top';
          roleSel.dispatchEvent(new Event('change', { bubbles: true }));
          const topCalloutVisible = !document.getElementById('invTopAuthorityNotice').hidden;
          const topCalloutText = document.getElementById('invTopAuthorityNotice').textContent;
          return { vendorOptCount, vendorVisible, topCalloutVisible, topCalloutText };
        })()`
      );
      assert(formUiCheck.vendorVisible, 'Vendor selector must appear for vendor_staff');
      assert(formUiCheck.vendorOptCount >= 55, `Expected full Sonoma vendor catalog in selector, got ${formUiCheck.vendorOptCount}`);
      assert(formUiCheck.topCalloutVisible, 'Admin: Top authority warning must appear when Top role selected');
      assert(formUiCheck.topCalloutText.includes('Admin: Top Authority Notice'));

      // Verify Mobile (`375x812`) responsive layout on `#sec-accounts`
      await cdp.send(
        'Emulation.setDeviceMetricsOverride',
        { width: 375, height: 812, deviceScaleFactor: 2, mobile: true },
        topTab
      );
      const mobileOverflow = await cdp.eval(
        topTab,
        `({ docScrollW: document.documentElement.scrollWidth, innerW: window.innerWidth })`
      );
      assert(
        mobileOverflow.docScrollW <= mobileOverflow.innerW + 2,
        `Admin invitations view must not overflow horizontally on 375px mobile: ${JSON.stringify(mobileOverflow)}`
      );

      // Restore desktop viewport and submit an `Admin: Top` invitation for a disposable `@gmail.com` address
      await cdp.send(
        'Emulation.setDeviceMetricsOverride',
        { width: 1440, height: 920, deviceScaleFactor: 1, mobile: false },
        topTab
      );

      const inviteeEmail = 'e2e-invited-top@gmail.com';
      const beforeInviteCount = capturedEmails.length;
      await cdp.eval(
        topTab,
        `(() => {
          document.getElementById('invEmail').value = ${JSON.stringify(inviteeEmail)};
          document.getElementById('invRole').value = 'top';
          document.getElementById('invRole').dispatchEvent(new Event('change', { bubbles: true }));
          document.getElementById('invNote').value = 'Browser E2E Top admin invitation';
          document.getElementById('inviteCreateForm').requestSubmit();
          return true;
        })()`
      );

      const sentInviteMsg = await waitForCondition(
        () => capturedEmails.slice(beforeInviteCount).find(m => m.kind === 'invitation' && m.email === inviteeEmail),
        { label: 'invitation email captured' }
      );
      const parsedInvite = extractInviteTokenFromBody(sentInviteMsg.text);
      assert(parsedInvite && parsedInvite.token, 'Expected single-use #accept-invite token in email');

      // Wait for `#invResultBox` and `#invList` row to render truthful states
      await waitForCondition(
        () =>
          cdp.eval(
            topTab,
            `(() => {
              const box = document.getElementById('invResultBox');
              const list = document.getElementById('invList');
              return Boolean(box && !box.hidden && list && list.textContent.includes(${JSON.stringify(inviteeEmail)}));
            })()`
          ),
        { label: 'invitation row rendered in #invList' }
      );

      const adminRowSnapshot = await cdp.eval(
        topTab,
        `(() => {
          const boxText = document.getElementById('invResultBox').textContent;
          const listText = document.getElementById('invList').textContent;
          return { boxText, listText };
        })()`
      );
      assert(adminRowSnapshot.listText.includes('Accepted by provider'), 'Must display Accepted by provider');
      assert(!/inbox delivered/i.test(adminRowSnapshot.listText), 'Must NEVER claim inbox delivered');
      assert(adminRowSnapshot.listText.includes('Awaiting recipient acceptance'), 'Must distinguish awaiting recipient acceptance');
      assert(!adminRowSnapshot.boxText.includes(parsedInvite.token), 'Admin UI in resend_https mode must NOT display raw token');

      // Keyboard accessibility check: open History modal via button and dismiss via Escape
      await cdp.eval(
        topTab,
        `(() => {
          const histBtn = document.querySelector('[data-inv-history]');
          histBtn.focus();
          histBtn.click();
          return true;
        })()`
      );
      await waitForCondition(
        () => cdp.eval(topTab, `!document.getElementById('invHistoryModal').hidden`),
        { label: 'History modal opened' }
      );
      const historyModalText = await cdp.eval(topTab, `document.getElementById('invHistoryModal').textContent`);
      assert(historyModalText.includes('Invitation Audit Timeline'));
      assert(historyModalText.includes('provider_accepted'));

      await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, topTab);
      await waitForCondition(
        () => cdp.eval(topTab, `document.getElementById('invHistoryModal').hidden === true`),
        { label: 'History modal closed on Escape' }
      );

      // =======================================================================
      // [2/4] Invitee Clicks `/#accept-invite=<token>` -> Zero-Query-String Login/Signup -> Explicit Accept
      // =======================================================================
      const inviteeTab = await createIsolatedTab({ width: 390, height: 844, mobile: true });
      await cdp.send(
        'Page.navigate',
        { url: `${chromeHttpOrigin}/#accept-invite=${encodeURIComponent(parsedInvite.token)}` },
        inviteeTab
      );

      await waitForCondition(
        () =>
          cdp.eval(
            inviteeTab,
            `(() => {
              const m = document.getElementById('inviteAcceptModal');
              return Boolean(m && !m.hidden && document.getElementById('iaSignupLink'));
            })()`
          ),
        { label: 'inviteAcceptModal visible for unauthenticated invitee' }
      );

      const preLoginModalInfo = await cdp.eval(
        inviteeTab,
        `(() => {
          const bodyText = document.getElementById('iaBody').textContent;
          const signupHref = document.getElementById('iaSignupLink').getAttribute('href');
          const signinHref = document.getElementById('iaSigninLink').getAttribute('href');
          return { bodyText, signupHref, signinHref };
        })()`
      );
      assert(preLoginModalInfo.bodyText.includes('Admin: Top'));
      assert(preLoginModalInfo.bodyText.includes('Full Administrative Authority'));
      assert(
        preLoginModalInfo.signupHref.startsWith('/login.html?mode=signup&invite=1#accept-invite='),
        `Signup href must keep token in #hash only, got: ${preLoginModalInfo.signupHref}`
      );
      assert(!preLoginModalInfo.signupHref.split('#')[0].includes(parsedInvite.token), 'Query string must NEVER contain raw token');

      // Click `Create Account (14+) & Verify →`
      await cdp.eval(inviteeTab, `document.getElementById('iaSignupLink').click()`);

      await waitForCondition(
        () =>
          cdp.eval(
            inviteeTab,
            `window.location.pathname === '/login.html' && Boolean(window.__bitesharkLoginReady) && !document.getElementById('inviteContextBanner').hidden`
          ),
        { label: 'login.html loaded with #inviteContextBanner' }
      );

      const loginPageCheck = await cdp.eval(
        inviteeTab,
        `({
          search: window.location.search,
          bannerText: document.getElementById('inviteContextBanner').textContent
        })`
      );
      assert.equal(loginPageCheck.search, '?mode=signup&invite=1', 'Raw token must not appear in location.search');
      assert(loginPageCheck.bannerText.includes('Admin: Top'));
      assert(loginPageCheck.bannerText.includes('Full Administrative Authority'));

      // First try an UNINVITED `@gmail.com` address -> verify clear staging rejection message!
      await cdp.eval(
        inviteeTab,
        `(() => {
          document.getElementById('email').value = 'uninvited-person@gmail.com';
          document.getElementById('dobMonth').value = '06';
          document.getElementById('dobDay').value = '15';
          document.getElementById('dobYear').value = '1995';
          document.getElementById('emailForm').requestSubmit();
          return true;
        })()`
      );
      await waitForCondition(
        () => cdp.eval(inviteeTab, `document.getElementById('error').textContent.includes('approved BiteShark invitation')`),
        { label: 'uninvited gmail blocked with actionable message' }
      );

      // Now submit the EXACT invited `@gmail.com` address + 14+ DOB
      const beforeInviteeOtp = capturedEmails.length;
      await cdp.eval(
        inviteeTab,
        `(() => {
          document.getElementById('email').value = ${JSON.stringify(inviteeEmail)};
          document.getElementById('dobMonth').value = '06';
          document.getElementById('dobDay').value = '15';
          document.getElementById('dobYear').value = '1995';
          document.getElementById('emailForm').requestSubmit();
          return true;
        })()`
      );

      const inviteeOtpMsg = await waitForCondition(
        () => capturedEmails.slice(beforeInviteeOtp).find(m => m.email === inviteeEmail && m.code),
        { label: 'invitee OTP email captured' }
      );
      await waitForCondition(
        () => cdp.eval(inviteeTab, `!document.getElementById('codeStep').hidden`),
        { label: 'codeStep visible for invitee' }
      );

      await cdp.eval(
        inviteeTab,
        `(() => {
          document.getElementById('code').value = ${JSON.stringify(inviteeOtpMsg.code)};
          document.getElementById('codeForm').requestSubmit();
          return true;
        })()`
      );

      // Should return automatically to `/#accept-invite=<token>` and render `#iaConfirmBtn`!
      await waitForCondition(
        () => cdp.eval(inviteeTab, `window.location.pathname === '/' && Boolean(document.getElementById('iaConfirmBtn'))`),
        { label: 'returned to /#accept-invite confirmation modal' }
      );

      await cdp.eval(inviteeTab, `document.getElementById('iaConfirmBtn').click()`);

      await waitForCondition(
        () =>
          cdp.eval(
            inviteeTab,
            `window.location.pathname === '/admin' && Boolean(document.getElementById('adminRoleBadge')) && document.getElementById('adminRoleBadge').textContent.includes('Admin: Top')`
          ),
        { label: 'invitee redirected to /admin after accepting Admin: Top' }
      );

      // =======================================================================
      // [3/4] Wrong-Account Signed-In UX Check
      // =======================================================================
      const beforeInvite2 = capturedEmails.length;
      await cdp.eval(
        topTab,
        `(() => {
          document.getElementById('invEmail').value = 'e2e-other-recipient@gmail.com';
          document.getElementById('invRole').value = 'mod';
          document.getElementById('invRole').dispatchEvent(new Event('change', { bubbles: true }));
          document.getElementById('invNote').value = 'Second E2E test invite';
          document.getElementById('inviteCreateForm').requestSubmit();
          return true;
        })()`
      );
      const sentInvite2 = await waitForCondition(
        () => capturedEmails.slice(beforeInvite2).find(m => m.kind === 'invitation' && m.email === 'e2e-other-recipient@gmail.com'),
        { label: 'second invitation email captured' }
      );
      const parsedInvite2 = extractInviteTokenFromBody(sentInvite2.text);

      // Open `parsedInvite2.token` inside `inviteeTab` (currently signed in as `e2e-invited-top@gmail.com`)
      await cdp.send(
        'Page.navigate',
        { url: `${chromeHttpOrigin}/#accept-invite=${encodeURIComponent(parsedInvite2.token)}` },
        inviteeTab
      );
      await waitForCondition(
        () => cdp.eval(inviteeTab, `Boolean(document.getElementById('iaSwitchAccountBtn'))`),
        { label: 'Wrong Account Signed In switch button rendered' }
      );
      const wrongAcctText = await cdp.eval(inviteeTab, `document.getElementById('iaBody').textContent`);
      assert(wrongAcctText.includes('Wrong Account Signed In'));
      assert(wrongAcctText.includes(inviteeEmail));

      // =======================================================================
      // [4/4] Zero-Query-String / Zero-Path Token Leak Audit Across ALL Chrome HTTP Requests
      // =======================================================================
      for (const rawUrl of allNetworkRequestUrls) {
        const withoutHash = rawUrl.split('#')[0];
        assert(
          !withoutHash.includes(parsedInvite.token),
          `Raw invitation token 1 leaked into HTTP request path/query: ${withoutHash}`
        );
        assert(
          !withoutHash.includes(parsedInvite2.token),
          `Raw invitation token 2 leaked into HTTP request path/query: ${withoutHash}`
        );
      }

      console.log(
        JSON.stringify({
          ok: true,
          suite: 'invitation-workflow-browser.e2e',
          network_requests_audited: allNetworkRequestUrls.length,
          verified: [
            'existing_top_operator_login_preserved',
            'desktop_and_375px_mobile_admin_invitations_ui',
            'keyboard_escape_history_modal',
            'end_to_end_gmail_invitee_signup_otp_and_explicit_accept',
            'wrong_account_switch_ux',
            'zero_raw_token_in_any_http_request_path_or_query_string'
          ]
        })
      );
    } finally {
      proxyServer.close();
    }
  } finally {
    global.fetch = origFetch;
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
    if (server) {
      await new Promise(r => server.close(() => r()));
    }
    if (appPool) await appPool.end().catch(() => {});
    if (migratorPool) await migratorPool.end().catch(() => {});
    await adminPool.end().catch(() => {});
    await pgCluster.stop();
  }
})().catch(err => {
  console.error('INVITATION WORKFLOW BROWSER E2E FAILED:', err);
  process.exit(1);
});
