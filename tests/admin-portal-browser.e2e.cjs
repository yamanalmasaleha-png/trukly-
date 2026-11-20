// Real Headless Chrome + Real PostgreSQL End-to-End Browser Suite for BiteShark
// Administration Portal (`/admin`), Role Experiences, Onboarding, Moderation & Viewpoints
//
// Run locally:
//   $env:TRUCKLY_PG_NODE_MODULES="<path-to-pg-and-pg-binaries>"
//   node tests/admin-portal-browser.e2e.cjs
// Optional synthetic screenshot capture:
//   $env:BITESHARK_SAVE_SCREENSHOTS_DIR="<dir>"

const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const http = require('node:http');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');

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
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'biteshark-admin-e2e-pg-'));
  const dataDir = path.join(tmpBase, 'data');
  const pwFile = path.join(tmpBase, 'pw.txt');
  const logFile = path.join(tmpBase, 'postgres.log');
  const password = 'e2e_pw_' + crypto.randomBytes(6).toString('hex');
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
  const migratorRole = `bs_e2e_mig_${suffix}`;
  const migratorPass = `mig_${suffix}`;
  const appRole = `bs_e2e_app_${suffix}`;
  const appPass = `app_${suffix}`;
  const dbName = `bs_e2e_${suffix}`;

  const screenshotDir = process.env.BITESHARK_SAVE_SCREENSHOTS_DIR
    ? path.resolve(process.env.BITESHARK_SAVE_SCREENSHOTS_DIR)
    : null;
  if (screenshotDir) fs.mkdirSync(screenshotDir, { recursive: true });

  const adminPool = new Pool({ connectionString: pgCluster.adminUrl, max: 4 });
  let migratorPool = null;
  let serverProc = null;
  let chromeProc = null;
  let cdp = null;
  let chromeProfileDir = null;

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

    const topEmail = 'top-synth@staging.biteshark.invalid';
    const modEmail = 'mod-synth@staging.biteshark.invalid';
    const custEmail = 'elena-synth@staging.biteshark.invalid';

    execFileSync(
      process.execPath,
      [path.join(ROOT, 'scripts', 'bootstrap-top-admin.cjs'), '--email', topEmail],
      {
        cwd: ROOT,
        env: { ...process.env, MIGRATION_DATABASE_URL: migratorDbUrl },
        stdio: 'pipe',
        windowsHide: true
      }
    );

    migratorPool = new Pool({ connectionString: migratorDbUrl, max: 4 });

    const appPort = await getFreePort();
    const baseUrl = `http://127.0.0.1:${appPort}`;
    const authSecret = crypto.randomBytes(32).toString('hex');
    const mailboxSecret = 'e2e_mbx_' + crypto.randomBytes(16).toString('hex');

    serverProc = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
      cwd: ROOT,
      env: {
        ...process.env,
        HOST: '127.0.0.1',
        PORT: String(appPort),
        DATABASE_URL: appDbUrl,
        BITESHARK_ENV: 'staging',
        BITESHARK_RELEASE_SHA: 'e2e-admin-portal-candidate',
        BITESHARK_AUTH_SECRET: authSecret,
        BITESHARK_AUTH_DELIVERY_MODE: 'staging_mailbox',
        BITESHARK_STAGING_MAILBOX_SECRET: mailboxSecret,
        BITESHARK_STAGING_ALLOWED_EMAIL_DOMAINS: 'staging.biteshark.invalid',
        BITESHARK_AUTH_START_IP_MAX: '50',
        BITESHARK_AUTH_VERIFY_IP_MAX: '50',
        BITESHARK_PUSH_PROVIDER_MODE: 'disabled'
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });

    await waitForCondition(
      async () => {
        const res = await httpGetJson(`${baseUrl}/api/healthz`);
        return res.status === 200 && res.json.db === 'ready';
      },
      { label: 'standalone server/index.js healthz' }
    );

    const cdpPort = await getFreePort();
    chromeProfileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'biteshark-admin-chrome-'));
    chromeProc = spawn(
      chromeBin,
      [
        '--headless=new',
        '--no-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--no-first-run',
        '--no-default-browser-check',
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

    async function createIsolatedBrowserTab() {
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
        { width: 1440, height: 920, deviceScaleFactor: 1, mobile: false },
        sessionId
      );
      await cdp.send(
        'Network.setBlockedURLs',
        { urls: ['*://tile.openstreetmap.org/*', '*://unpkg.com/*'] },
        sessionId
      );
      return sessionId;
    }

    async function saveShot(sessionId, fileName) {
      if (!screenshotDir) return;
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId);
      fs.writeFileSync(path.join(screenshotDir, fileName), Buffer.from(data, 'base64'));
    }

    async function browserSignIn(sessionId, email, nextRel = '/') {
      await cdp.send(
        'Page.navigate',
        { url: `${baseUrl}/login.html?next=${encodeURIComponent(nextRel)}` },
        sessionId
      );
      await waitForCondition(
        async () =>
          cdp.eval(
            sessionId,
            `Boolean(document.getElementById('email') && window.bitesharkAuth)`
          ),
        { label: `login.html loaded for ${email}` }
      );
      await cdp.eval(
        sessionId,
        `(async () => {
          await window.bitesharkAuth.startLogin({ email: ${JSON.stringify(email)} });
          return true;
        })()`
      );

      const mbxRes = await fetch(`${baseUrl}/api/auth/staging-mailbox`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Staging-Mailbox-Secret': mailboxSecret
        },
        body: JSON.stringify({ email })
      });
      const mbxJson = await mbxRes.json();
      assert.equal(mbxRes.status, 200, `Mailbox fetch failed for ${email}`);

      await cdp.eval(
        sessionId,
        `(async () => {
          await window.bitesharkAuth.verifyCode({
            email: ${JSON.stringify(email)},
            code: ${JSON.stringify(mbxJson.code)}
          });
          window.location.href = ${JSON.stringify(nextRel)};
          return true;
        })()`
      );
    }

    const custSession = await createIsolatedBrowserTab();
    const modSession = await createIsolatedBrowserTab();
    const topSession = await createIsolatedBrowserTab();

    // =========================================================================
    // [1/5] Unauthenticated `/admin` Redirect & Ordinary Customer Access Denial
    // =========================================================================
    await cdp.send('Page.navigate', { url: `${baseUrl}/admin` }, custSession);
    await waitForCondition(
      async () => {
        const href = await cdp.eval(custSession, 'window.location.pathname + window.location.search');
        return href === '/login.html?next=%2Fadmin';
      },
      { label: 'unauthenticated /admin redirect to /login.html?next=%2Fadmin' }
    );

    await browserSignIn(custSession, custEmail, '/admin');
    const custDenied = await waitForCondition(
      async () => {
        const txt = await cdp.eval(custSession, 'document.body?.textContent || ""');
        return txt.includes('403 · Access Restricted') ? txt : null;
      },
      { label: 'Customer 403 access denied HTML on /admin' }
    );
    assert(custDenied.includes(custEmail));

    await cdp.send('Page.navigate', { url: `${baseUrl}/` }, custSession);
    const custHomeState = await waitForCondition(
      async () =>
        cdp.eval(
          custSession,
          `(() => {
            const adminLink = document.getElementById('navAdminPortalLink');
            const roleBox = document.getElementById('rxProfileRoleBox');
            if (!adminLink || !roleBox || !roleBox.textContent.includes('Customer')) return null;
            return {
              adminHidden: adminLink.hidden,
              rolesText: roleBox.textContent.trim()
            };
          })()`
        ),
      { label: 'Customer role pills on /' }
    );
    assert.equal(custHomeState.adminHidden, true);
    assert.equal(custHomeState.rolesText, 'Customer');

    const pdfB64 = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n', 'utf8').toString('base64');
    const custSeedOut = await cdp.eval(
      custSession,
      `(async () => {
        const draftRes = await fetch('/api/onboarding/applications', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'save_draft',
            claim_type: 'existing_listing',
            target_vendor_id: 'truck-galvans',
            business_name: "Galvan's Eatery (Synthetic Staging)",
            city: 'Santa Rosa',
            cuisine: 'Mexican',
            listing_kind: 'food_truck',
            service_area: 'Santa Rosa & Sebastopol',
            contact_name: 'Elena Galvan (Synthetic)',
            permit_or_license_summary: 'Synthetic Sonoma Health Permit #SYN-2026',
            ownership_statement: 'Synthetic vendor application for BiteShark staging review.'
          })
        }).then(r => r.json());
        const appId = draftRes.application.id;
        await fetch('/api/onboarding/evidence', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            application_id: appId,
            filename: 'synthetic-sonoma-permit.pdf',
            mime_type: 'application/pdf',
            evidence_kind: 'health_permit',
            data_base64: ${JSON.stringify(pdfB64)}
          })
        });
        await fetch('/api/onboarding/applications', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: appId,
            action: 'submit',
            claim_type: 'existing_listing',
            target_vendor_id: 'truck-galvans',
            business_name: "Galvan's Eatery (Synthetic Staging)",
            city: 'Santa Rosa',
            cuisine: 'Mexican',
            listing_kind: 'food_truck',
            service_area: 'Santa Rosa & Sebastopol',
            contact_name: 'Elena Galvan (Synthetic)',
            permit_or_license_summary: 'Synthetic Sonoma Health Permit #SYN-2026',
            ownership_statement: 'Synthetic vendor application for BiteShark staging review.'
          })
        });
        await fetch('/api/community/post', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind: 'review',
            place_id: 'iniguez',
            place_name: 'Tacos Iñiguez',
            town: 'Santa Rosa',
            nickname: 'SyntheticNeighbor',
            title: 'Fresh handmade tortillas at lunch',
            body: 'Synthetic staging review verifying community moderation workflow end-to-end.',
            rating: 5
          })
        });
        const issRes = await fetch('/api/issues', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            category: 'booking_dispute',
            severity: 'high',
            vendor_id: 'iniguez',
            subject: 'Synthetic Catering Inquiry Timing Question',
            description: 'Synthetic support issue verifying internal vs reporter-visible notes.'
          })
        }).then(r => r.json());
        return { appId, issueId: issRes.issue.id };
      })()`
    );
    assert(custSeedOut.appId && custSeedOut.issueId);
    console.log('✓ [1/5] Unauthenticated redirect, Customer 403 gate & synthetic submissions verified');

    // =========================================================================
    // [2/5] `Admin: Mod` Portal Session, Restricted Actions & Moderation/Review
    // =========================================================================
    await browserSignIn(modSession, modEmail, '/');
    const superClient = new Pool({
      connectionString: buildDbUrl(pgCluster.adminUrl, {
        user: 'postgres',
        password: decodeURIComponent(new URL(pgCluster.adminUrl).password),
        database: dbName
      }),
      max: 2
    });
    const modLookup = await waitForCondition(
      async () => {
        const r = await superClient.query('SELECT id FROM auth_users WHERE email_normalized = $1', [modEmail]);
        return r.rows[0] || null;
      },
      { label: 'Mod auth_users row created' }
    );
    await migratorPool.query(
      "INSERT INTO platform_roles (user_id, role, granted_by) VALUES ($1, 'mod', 'seed')",
      [modLookup.id]
    );

    await cdp.send('Page.navigate', { url: `${baseUrl}/admin` }, modSession);
    const modPortalState = await waitForCondition(
      async () =>
        cdp.eval(
          modSession,
          `(() => {
            const badge = document.getElementById('adminRoleBadge')?.textContent || '';
            const cards = document.getElementById('overviewCards');
            if (badge !== 'Admin: Mod' || !cards || cards.hidden) return null;
            return {
              badge,
              actBtnHidden: document.getElementById('vpActOnBehalfBtn')?.hidden,
              pendingApps: document.getElementById('ovPendingApps')?.textContent,
              flaggedComments: document.getElementById('ovFlaggedComments')?.textContent,
              openIssues: document.getElementById('ovOpenIssues')?.textContent
            };
          })()`
        ),
      { label: 'Mod /admin overview render' }
    );
    assert.equal(modPortalState.badge, 'Admin: Mod');
    assert.equal(modPortalState.actBtnHidden, true);
    assert.equal(modPortalState.pendingApps, '1');
    assert.equal(modPortalState.flaggedComments, '1');
    assert.equal(modPortalState.openIssues, '1');

    await cdp.eval(modSession, `document.querySelector('[data-section="applications"]').click()`);
    await waitForCondition(
      async () => cdp.eval(modSession, `Boolean(document.querySelector('#appsList [data-app-id]'))`),
      { label: 'Mod applications list loaded' }
    );
    await cdp.eval(modSession, `document.querySelector('#appsList [data-app-id]').click()`);
    const modAppDetail = await waitForCondition(
      async () =>
        cdp.eval(
          modSession,
          `(() => {
            const pane = document.getElementById('appsDetailPane');
            if (!pane || !pane.textContent.includes("Galvan's Eatery")) return null;
            return {
              hasTopApproveBtn: Boolean(pane.querySelector('[data-app-act="approve"]')),
              hasRecApproveBtn: Boolean(pane.querySelector('[data-app-act="recommend_approve"]')),
              hasModNotice: pane.textContent.includes('Admin: Mod Review Scope')
            };
          })()`
        ),
      { label: 'Mod application detail loaded' }
    );
    assert.equal(modAppDetail.hasTopApproveBtn, false);
    assert.equal(modAppDetail.hasRecApproveBtn, true);
    assert.equal(modAppDetail.hasModNotice, true);

    await cdp.eval(
      modSession,
      `(() => {
        document.getElementById('appInternalNotes').value = 'Synthetic Mod check: Sonoma permit #SYN-2026 looks complete.';
        document.getElementById('appDecisionReason').value = 'Permit & menu verified; recommending Admin: Top approval.';
        document.querySelector('[data-app-act="recommend_approve"]').click();
      })()`
    );
    await waitForCondition(
      async () =>
        cdp.eval(
          modSession,
          `document.getElementById('adminGlobalBanner')?.textContent?.includes('recommend_approve')`
        ),
      { label: 'Mod recommendation saved' }
    );

    await cdp.eval(modSession, `document.querySelector('[data-section="accounts"]').click()`);
    await waitForCondition(
      async () => cdp.eval(modSession, `!document.getElementById('sec-accounts').hidden`),
      { label: 'Mod accounts section visible' }
    );
    await cdp.eval(
      modSession,
      `(() => {
        const sel = document.getElementById('invRole');
        sel.value = 'mod';
        sel.onchange();
        document.getElementById('invEmail').value = 'candidate-mod-synth@staging.biteshark.invalid';
        document.getElementById('invNote').value = 'Synthetic moderator nomination requiring Top approval';
        document.getElementById('invSubmitBtn').click();
      })()`
    );
    const modInvBanner = await waitForCondition(
      async () => {
        const txt = await cdp.eval(modSession, `document.getElementById('invResultBox')?.textContent || ''`);
        return txt.includes('Pending Admin: Top Approval') ? txt : null;
      },
      { label: 'Mod-initiated privileged invite pending Top approval' }
    );
    assert(modInvBanner.includes('candidate-mod-synth@staging.biteshark.invalid'));

    await cdp.eval(modSession, `document.querySelector('[data-section="moderation"]').click()`);
    await waitForCondition(
      async () => cdp.eval(modSession, `Boolean(document.querySelector('#modList [data-post-id]'))`),
      { label: 'Mod pending comment loaded' }
    );
    const synthPostId = await cdp.eval(
      modSession,
      `(() => {
        const b = document.querySelector('#modList [data-post-id]');
        b.click();
        return b.dataset.postId;
      })()`
    );
    await waitForCondition(
      async () => cdp.eval(modSession, `Boolean(document.querySelector('[data-mod-act="approve"]'))`),
      { label: 'Approve post button visible' }
    );
    await cdp.eval(modSession, `document.querySelector('[data-mod-act="approve"]').click()`);
    await waitForCondition(
      async () =>
        cdp.eval(modSession, `document.getElementById('adminGlobalBanner')?.textContent?.includes('approve')`),
      { label: 'Community post approved' }
    );

    await cdp.eval(
      custSession,
      `(async () => {
        await openCommunity();
        window.bitesharkOpenCommunityReport(${JSON.stringify(synthPostId)});
        document.getElementById('crReason').value = 'inaccurate';
        document.getElementById('crDetails').value = 'Synthetic customer report verifying moderation resolution.';
        document.querySelector('#crReportForm button[type="submit"]').click();
        return true;
      })()`
    );
    await waitForCondition(
      async () =>
        cdp.eval(
          custSession,
          `document.getElementById('crFormMsg')?.textContent?.includes('moderators have received')`
        ),
      { label: 'Customer report submitted' }
    );

    console.log('✓ [2/5] Admin: Mod restricted portal UI, application recommendation, pending invite & report flow verified');

    // =========================================================================
    // [3/5] Real `Admin: Top` Login, Synthetic Portal Screenshots & Final Approvals
    // =========================================================================
    await browserSignIn(topSession, topEmail, '/admin');
    const topPortalState = await waitForCondition(
      async () =>
        cdp.eval(
          topSession,
          `(() => {
            const badge = document.getElementById('adminRoleBadge')?.textContent || '';
            const cards = document.getElementById('overviewCards');
            if (badge !== 'Admin: Top' || !cards || cards.hidden) return null;
            return {
              badge,
              actBtnHidden: document.getElementById('vpActOnBehalfBtn')?.hidden,
              pendingInvites: document.getElementById('ovPendingInvites')?.textContent
            };
          })()`
        ),
      { label: 'Top /admin overview loaded' }
    );
    assert.equal(topPortalState.badge, 'Admin: Top');
    assert.equal(topPortalState.actBtnHidden, false);
    assert.equal(topPortalState.pendingInvites, '1');

    await saveShot(topSession, 'admin-portal-overview.png');

    await cdp.eval(topSession, `document.querySelector('[data-section="applications"]').click()`);
    await waitForCondition(
      async () => cdp.eval(topSession, `Boolean(document.querySelector('#appsList [data-app-id]'))`),
      { label: 'Top applications list loaded' }
    );
    await cdp.eval(topSession, `document.querySelector('#appsList [data-app-id]').click()`);
    await waitForCondition(
      async () =>
        cdp.eval(topSession, `Boolean(document.querySelector('[data-app-act="approve"]'))`),
      { label: 'Top Approve button rendered' }
    );
    await saveShot(topSession, 'admin-portal-applications.png');

    await cdp.eval(
      topSession,
      `(() => {
        document.getElementById('appApplicantFeedback').value = 'Welcome to BiteShark! Your ownership of Galvan Eatery is approved.';
        document.getElementById('appDecisionReason').value = 'Confirmed Mod recommendation and synthetic permit attachment.';
        document.querySelector('[data-app-act="approve"]').click();
      })()`
    );
    await waitForCondition(
      async () =>
        cdp.eval(topSession, `document.getElementById('adminGlobalBanner')?.textContent?.includes('approve')`),
      { label: 'Top approved vendor application' }
    );

    await cdp.eval(topSession, `document.querySelector('[data-section="vendors"]').click()`);
    await waitForCondition(
      async () => cdp.eval(topSession, `Boolean(document.querySelector('#vendorsList [data-vid="iniguez"]'))`),
      { label: 'Top vendor directory loaded' }
    );
    await cdp.eval(topSession, `document.querySelector('#vendorsList [data-vid="iniguez"]').click()`);
    await waitForCondition(
      async () => cdp.eval(topSession, `Boolean(document.getElementById('topVendorEditForm'))`),
      { label: 'Top vendor detail controls loaded' }
    );
    await saveShot(topSession, 'admin-portal-vendors.png');

    await cdp.eval(topSession, `document.querySelector('[data-section="accounts"]').click()`);
    await waitForCondition(
      async () => cdp.eval(topSession, `Boolean(document.querySelector('#invList table'))`),
      { label: 'Top invitations table loaded' }
    );
    await saveShot(topSession, 'admin-portal-invitations.png');

    await cdp.eval(topSession, `document.querySelector('[data-section="moderation"]').click()`);
    await waitForCondition(
      async () => cdp.eval(topSession, `!document.getElementById('sec-moderation').hidden`),
      { label: 'Top moderation tab open' }
    );
    await cdp.eval(topSession, `document.querySelector('[data-mod-queue="reported"]').click()`);
    await waitForCondition(
      async () => cdp.eval(topSession, `Boolean(document.querySelector('#modList [data-post-id]'))`),
      { label: 'Reported post visible in Top moderation queue' }
    );
    await cdp.eval(topSession, `document.querySelector('#modList [data-post-id]').click()`);
    await waitForCondition(
      async () => cdp.eval(topSession, `Boolean(document.querySelector('[data-mod-act="hide"]'))`),
      { label: 'Hide button visible on reported post' }
    );
    await saveShot(topSession, 'admin-portal-moderation.png');

    await cdp.eval(
      topSession,
      `(() => {
        document.getElementById('modDecisionReason').value = 'Hidden while verifying reported synthetic details.';
        document.querySelector('[data-mod-act="hide"]').click();
      })()`
    );
    await waitForCondition(
      async () =>
        cdp.eval(topSession, `document.getElementById('adminGlobalBanner')?.textContent?.includes('hide')`),
      { label: 'Reported post hidden' }
    );

    await cdp.eval(topSession, `document.querySelector('[data-section="issues"]').click()`);
    await waitForCondition(
      async () => cdp.eval(topSession, `Boolean(document.querySelector('#issuesList [data-iss-id]'))`),
      { label: 'Support issue visible' }
    );
    await cdp.eval(topSession, `document.querySelector('#issuesList [data-iss-id]').click()`);
    await waitForCondition(
      async () => cdp.eval(topSession, `Boolean(document.getElementById('issueUpdateForm'))`),
      { label: 'Issue detail form rendered' }
    );
    await saveShot(topSession, 'admin-portal-issues.png');

    console.log('✓ [3/5] Real Top login, vendor approval, moderation resolution & synthetic screenshots verified');

    // =========================================================================
    // [4/5] Viewpoint Switcher: Read-Only Vendor Preview vs Audited Top Act-on-Behalf
    // =========================================================================
    await cdp.eval(
      topSession,
      `(() => {
        document.getElementById('vpVendorSelect').value = 'mitote';
        document.getElementById('vpVendorPreviewBtn').click();
      })()`
    );
    const vpPreviewState = await waitForCondition(
      async () =>
        cdp.eval(
          topSession,
          `(() => {
            const b = document.getElementById('bitesharkViewpointBanner');
            if (!b || !b.textContent.includes('Admin preview · Vendor View (Read-Only)')) return null;
            return {
              bannerText: b.textContent,
              ownerTitle: document.getElementById('ownerTitle')?.textContent
            };
          })()`
        ),
      { label: 'Read-only Vendor Preview banner on /' }
    );
    assert(vpPreviewState.bannerText.includes(topEmail));
    assert(vpPreviewState.bannerText.includes('mitote'));
    await saveShot(topSession, 'admin-viewpoint-preview.png');

    const previewMutStatus = await cdp.eval(
      topSession,
      `(async () => {
        const r = await fetch('/api/owner/location', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ truck_id: 'mitote', location: 'Blocked in preview' })
        });
        const j = await r.json();
        return { status: r.status, code: j.code };
      })()`
    );
    assert.equal(previewMutStatus.status, 403);
    assert.equal(previewMutStatus.code, 'ADMIN_PREVIEW_READ_ONLY');

    await cdp.send('Page.navigate', { url: `${baseUrl}/admin` }, topSession);
    await waitForCondition(
      async () => cdp.eval(topSession, `document.getElementById('vpVendorSelect')?.options?.length > 1`),
      { label: 'Returned to /admin' }
    );
    await cdp.eval(
      topSession,
      `(() => {
        document.getElementById('vpVendorSelect').value = 'mitote';
        document.getElementById('vpActOnBehalfBtn').click();
        document.getElementById('aobReasonInput').value = 'Synthetic support ticket #SYN-88: updating Mitote parked location';
        document.querySelector('#aobForm button[type="submit"]').click();
      })()`
    );

    await waitForCondition(
      async () =>
        cdp.eval(
          topSession,
          `document.getElementById('bitesharkViewpointBanner')?.textContent?.includes('ACTING ON BEHALF OF VENDOR')`
        ),
      { label: 'Act-on-Behalf banner rendered on /' }
    );

    const aobMutStatus = await cdp.eval(
      topSession,
      `(async () => {
        const r = await fetch('/api/owner/location', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ truck_id: 'mitote', location: '665 Sebastopol Rd, Santa Rosa (Support Verified)', ttl_minutes: 240 })
        });
        return r.status;
      })()`
    );
    assert.equal(aobMutStatus, 200);

    await cdp.eval(topSession, `document.getElementById('vpEndSupportBtn').click()`);
    await waitForCondition(
      async () =>
        cdp.eval(
          topSession,
          `window.location.pathname === '/admin' && document.getElementById('adminRoleBadge')?.textContent === 'Admin: Top'`
        ),
      { label: 'Returned to /admin after Act-on-Behalf' }
    );
    await cdp.eval(topSession, `document.querySelector('[data-section="audit"]').click()`);
    const auditRendered = await waitForCondition(
      async () => {
        const txt = await cdp.eval(topSession, `document.getElementById('auditList')?.textContent || ''`);
        return txt.includes('ACTING ON BEHALF') && txt.includes('SYN-88') ? txt : null;
      },
      { label: 'Audit log displays ACTING ON BEHALF + support reason' }
    );
    assert(auditRendered.includes('mitote'));
    await saveShot(topSession, 'admin-portal-audit.png');

    console.log('✓ [4/5] Read-only Vendor Preview, audited Top Act-on-Behalf & return to Admin Portal verified');

    // =========================================================================
    // [5/5] Applicant Role Refresh & Interactive Pager Demo Isolation Regression
    // =========================================================================
    await cdp.send('Page.navigate', { url: `${baseUrl}/` }, custSession);
    const approvedRoleText = await waitForCondition(
      async () => {
        const txt = await cdp.eval(custSession, `document.getElementById('rxProfileRoleBox')?.textContent || ''`);
        return txt.includes('Vendor Owner') ? txt : null;
      },
      { label: 'Approved applicant role updated to Customer + Vendor Owner' }
    );
    assert(approvedRoleText.includes('Customer') && approvedRoleText.includes('Vendor Owner'));

    await cdp.eval(custSession, `openPager(); startPagerDemo();`);
    const demoState = await waitForCondition(
      async () =>
        cdp.eval(
          custSession,
          `document.getElementById('pagerDisplay')?.textContent?.includes('BiteShark Test Kitchen')`
        ),
      { label: 'Pager demo isolation regression check' }
    );
    assert.equal(demoState, true);

    await superClient.end().catch(() => {});
    console.log('✓ [5/5] Approved owner role sync & discovery/pager demo regression verified');
    console.log('PASS: Headless Chrome + PostgreSQL E2E suite for BiteShark Admin Portal & Role Experiences passed.');
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
    if (migratorPool) await migratorPool.end().catch(() => {});
    await adminPool.query(`DROP DATABASE IF EXISTS ${dbName}`).catch(() => {});
    await adminPool.query(`DROP ROLE IF EXISTS ${appRole}`).catch(() => {});
    await adminPool.query(`DROP ROLE IF EXISTS ${migratorRole}`).catch(() => {});
    await adminPool.end().catch(() => {});
    await pgCluster.stop();
    if (chromeProfileDir) {
      try {
        fs.rmSync(chromeProfileDir, { recursive: true, force: true });
      } catch {}
    }
  }
})().catch(err => {
  console.error('ADMIN PORTAL BROWSER E2E FAILURE:', err);
  process.exit(1);
});
