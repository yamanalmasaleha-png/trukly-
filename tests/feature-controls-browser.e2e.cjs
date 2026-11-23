// Real Headless Chrome + Real PostgreSQL Browser End-to-End Suite for BiteShark
// Controlled Feature Management (`/admin#features`), Accessibility, Confirmation Modal,
// Stale Open-Tab Resync, Cross-Tab BroadcastChannel, and Customer Viewpoint Preview
// (`tests/feature-controls-browser.e2e.cjs`)

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
  try {
    return require('pg');
  } catch {
    const extraBase = process.env.TRUCKLY_PG_NODE_MODULES || process.env.BITESHARK_PG_NODE_MODULES;
    if (extraBase) return require(path.join(extraBase, 'pg'));
    throw new Error('Missing `pg` package.');
  }
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
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'biteshark-fc-e2e-pg-'));
  const dataDir = path.join(tmpBase, 'data');
  const pwFile = path.join(tmpBase, 'pw.txt');
  const logFile = path.join(tmpBase, 'postgres.log');
  const password = 'fce2e_' + crypto.randomBytes(6).toString('hex');
  fs.writeFileSync(pwFile, password + '\n', 'utf8');

  execFileSync(
    initdbExe,
    ['-D', dataDir, '-U', 'postgres', `--pwfile=${pwFile}`, '-A', 'scram-sha-256', '-E', 'UTF8', '--no-locale'],
    { stdio: 'ignore', windowsHide: true }
  );
  execFileSync(pgCtlExe, ['-D', dataDir, '-l', logFile, '-w', '-o', `-p ${port} -h 127.0.0.1`, 'start'], {
    stdio: 'ignore',
    windowsHide: true
  });

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
  const migratorRole = `bs_fce2e_mig_${suffix}`;
  const migratorPass = `mig_${suffix}`;
  const appRole = `bs_fce2e_app_${suffix}`;
  const appPass = `app_${suffix}`;
  const dbName = `bs_fce2e_${suffix}`;

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
    const appDbUrl = buildDbUrl(pgCluster.adminUrl, {
      user: appRole,
      password: appPass,
      database: dbName
    });

    execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'run-migrations.cjs'), '--app-role', appRole], {
      cwd: ROOT,
      env: { ...process.env, MIGRATION_DATABASE_URL: migratorDbUrl },
      stdio: 'pipe',
      windowsHide: true
    });

    const topEmail = 'top-fc@staging.biteshark.invalid';
    const modEmail = 'mod-fc@staging.biteshark.invalid';
    const custEmail = 'cust-fc@staging.biteshark.invalid';

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
    const mailboxSecret = 'fce2e_mbx_' + crypto.randomBytes(16).toString('hex');

    serverProc = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
      cwd: ROOT,
      env: {
        ...process.env,
        HOST: '127.0.0.1',
        PORT: String(appPort),
        DATABASE_URL: appDbUrl,
        BITESHARK_ENV: 'staging',
        BITESHARK_RELEASE_SHA: 'e2e-feature-controls-candidate',
        BITESHARK_AUTH_SECRET: authSecret,
        BITESHARK_AUTH_DELIVERY_MODE: 'staging_mailbox',
        BITESHARK_STAGING_MAILBOX_SECRET: mailboxSecret,
        BITESHARK_STAGING_ALLOWED_EMAIL_DOMAINS: 'staging.biteshark.invalid',
        BITESHARK_AUTH_START_IP_MAX: '80',
        BITESHARK_AUTH_VERIFY_IP_MAX: '80',
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

    let versionInfo = null;
    let lastChromeLaunchErr = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const cdpPort = await getFreePort();
      chromeProfileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'biteshark-fc-chrome-'));
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
      try {
        versionInfo = await waitForCondition(
          async () => {
            const r = await httpGetJson(`http://127.0.0.1:${cdpPort}/json/version`);
            return r.status === 200 && r.json.webSocketDebuggerUrl ? r.json : null;
          },
          { timeoutMs: 12000, label: `Chrome DevTools endpoint (attempt ${attempt}/3)` }
        );
        break;
      } catch (err) {
        lastChromeLaunchErr = err;
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
    if (!versionInfo) throw lastChromeLaunchErr;

    cdp = new CdpClient(versionInfo.webSocketDebuggerUrl);
    await cdp.connect();

    async function createBrowserTab(browserContextId = null) {
      const ctxId = browserContextId || (await cdp.send('Target.createBrowserContext')).browserContextId;
      const { targetId } = await cdp.send('Target.createTarget', {
        url: 'about:blank',
        browserContextId: ctxId
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
      return { sessionId, browserContextId: ctxId };
    }

    async function browserSignIn(sessionId, email, nextRel = '/') {
      await cdp.send(
        'Page.navigate',
        { url: `${baseUrl}/login.html?next=${encodeURIComponent(nextRel)}` },
        sessionId
      );
      await waitForCondition(
        async () => cdp.eval(sessionId, `Boolean(document.getElementById('email') && window.bitesharkAuth)`),
        { label: `login.html loaded for ${email}` }
      );
      await cdp.eval(
        sessionId,
        `(async () => {
          await window.bitesharkAuth.startLogin({
            email: ${JSON.stringify(email)},
            intent: 'signup',
            dob: '1991-03-19'
          });
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
      assert.equal(mbxRes.status, 200);

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

    const topTab = await createBrowserTab();
    // Second tab in the SAME browser context as topTab to verify BroadcastChannel live sync!
    const topCompanionAppTab = await createBrowserTab(topTab.browserContextId);
    const modTab = await createBrowserTab();
    const custTab = await createBrowserTab();

    // Sign in Mod user first as customer, grant `mod` role in DB, then open `/admin#features`
    await browserSignIn(modTab.sessionId, modEmail, '/');
    await waitForCondition(
      async () => cdp.eval(modTab.sessionId, `Boolean(window.bitesharkFeatures)`),
      { label: 'Mod initial sign-in complete' }
    );
    const migClient = await migratorPool.connect();
    try {
      await migClient.query('BEGIN');
      await migClient.query("SELECT set_config('app.auth_internal', 'true', true)");
      await migClient.query(
        `INSERT INTO platform_roles (user_id, role, granted_by)
         SELECT id, 'mod', 'bootstrap' FROM auth_users WHERE email_normalized = $1`,
        [modEmail]
      );
      await migClient.query('COMMIT');
    } finally {
      migClient.release();
    }

    // =========================================================================
    // [1/5] Admin: Mod Read-Only Feature Controls View
    // =========================================================================
    await cdp.send('Page.navigate', { url: `${baseUrl}/admin#features` }, modTab.sessionId);
    const modFeaturesCheck = await waitForCondition(
      async () =>
        cdp.eval(
          modTab.sessionId,
          `(() => {
            const sec = document.getElementById('sec-features');
            const cards = document.querySelectorAll('#featuresList .fc-card');
            if (!sec || sec.hidden || cards.length < 13) return null;
            const stateSelects = [...document.querySelectorAll('#featuresList select[name="configured_state"]')];
            const saveBtns = [...document.querySelectorAll('#featuresList button[type="submit"]')];
            return {
              cardCount: cards.length,
              switchableCount: stateSelects.length,
              allSelectsDisabled: stateSelects.every(s => s.disabled === true),
              allButtonsDisabled: saveBtns.every(b => b.disabled === true && b.textContent.includes('Admin: Top Only')),
              protectedCount: document.querySelectorAll('#fcProtectedList .fc-protected-item').length
            };
          })()`
        ),
      { label: 'Mod read-only Feature Controls loaded' }
    );
    assert.equal(modFeaturesCheck.cardCount, 15);
    assert.equal(modFeaturesCheck.switchableCount, 13);
    assert.equal(modFeaturesCheck.allSelectsDisabled, true);
    assert.equal(modFeaturesCheck.allButtonsDisabled, true);
    assert.equal(modFeaturesCheck.protectedCount, 6);

    // =========================================================================
    // [2/5] Admin: Top Accessibility, Low-Impact Direct Save & High-Impact Modal
    // =========================================================================
    await browserSignIn(topTab.sessionId, topEmail, '/admin#features');
    const topA11yCheck = await waitForCondition(
      async () =>
        cdp.eval(
          topTab.sessionId,
          `(() => {
            const cards = document.querySelectorAll('#featuresList .fc-card');
            if (cards.length < 13) return null;
            const controls = [...document.querySelectorAll('#featuresList select, #featuresList input')];
            const unlabeled = controls.filter(el => !el.id || !document.querySelector('label[for="' + el.id + '"]'));
            const liveStatus = document.getElementById('fcLiveStatus');
            const liveErr = document.getElementById('fcLiveError');
            const passkeyCard = document.getElementById('fc-card-passkey_webauthn');
            return {
              controlsCount: controls.length,
              unlabeledCount: unlabeled.length,
              hasPoliteStatus: liveStatus?.getAttribute('role') === 'status' && liveStatus?.getAttribute('aria-live') === 'polite',
              hasAlertErr: liveErr?.getAttribute('role') === 'alert',
              readOnlyHasNoSubmit: passkeyCard ? passkeyCard.querySelectorAll('button[type="submit"]').length === 0 : false,
              pushOverrideShown: document.getElementById('fc-card-pager_push_delivery')?.textContent.includes('Authoritative Environment Override Active') || false
            };
          })()`
        ),
      { label: 'Top Feature Controls loaded with full accessibility semantics' }
    );
    assert.equal(topA11yCheck.unlabeledCount, 0, 'Every feature input/select must have an explicit <label for>');
    assert.equal(topA11yCheck.hasPoliteStatus, true);
    assert.equal(topA11yCheck.hasAlertErr, true);
    assert.equal(topA11yCheck.readOnlyHasNoSubmit, true);
    assert.equal(topA11yCheck.pushOverrideShown, true);

    // Open companion app tab in same browser context before changing `flavor_lab_tools`
    await cdp.send('Page.navigate', { url: `${baseUrl}/` }, topCompanionAppTab.sessionId);
    await waitForCondition(
      async () =>
        cdp.eval(
          topCompanionAppTab.sessionId,
          `Boolean(window.bitesharkFeatures && document.querySelector('.smart-invite') && !document.querySelector('.smart-invite').hidden)`
        ),
      { label: 'Companion app tab loaded with Flavor Lab visible' }
    );

    // Low-impact change (`flavor_lab_tools` -> `hidden`) saves directly WITHOUT confirmation modal
    // and broadcasts via BroadcastChannel to `topCompanionAppTab`!
    await cdp.eval(
      topTab.sessionId,
      `(() => {
        document.getElementById('fc-state-flavor_lab_tools').value = 'hidden';
        document.getElementById('fc-reason-flavor_lab_tools').value = 'Hide Flavor Lab during staging UI review';
        document.getElementById('fc-save-flavor_lab_tools').click();
        return document.getElementById('featureConfirmModal').hidden;
      })()`
    );
    const lowImpactConfirmed = await waitForCondition(
      async () =>
        cdp.eval(
          topTab.sessionId,
          `(() => {
            const st = document.getElementById('fcLiveStatus');
            return st && !st.hidden && st.textContent.includes('Server confirmed: "Flavor Finder') ? st.textContent : null;
          })()`
        ),
      { label: 'Low-impact Flavor Lab save confirmed by server' }
    );
    assert(lowImpactConfirmed.includes('effective state: hidden'));

    // Companion open tab in same browser context updates automatically via BroadcastChannel!
    await waitForCondition(
      async () =>
        cdp.eval(
          topCompanionAppTab.sessionId,
          `document.querySelector('.smart-invite')?.hidden === true`
        ),
      { label: 'BroadcastChannel hid .smart-invite in companion tab automatically' }
    );

    // High-impact change (`event_inquiries` -> `paused`) opens confirmation modal, Escape cancels cleanly!
    const modalOpened = await cdp.eval(
      topTab.sessionId,
      `(() => {
        document.getElementById('fc-state-event_inquiries').value = 'paused';
        document.getElementById('fc-save-event_inquiries').click();
        const modal = document.getElementById('featureConfirmModal');
        const consequencesCount = document.querySelectorAll('#fcConfirmConsequences li').length;
        return {
          open: !modal.hidden,
          role: modal.querySelector('[role="dialog"]')?.getAttribute('aria-modal'),
          consequencesCount
        };
      })()`
    );
    assert.equal(modalOpened.open, true);
    assert.equal(modalOpened.role, 'true');
    assert(modalOpened.consequencesCount >= 2);

    // Press Escape -> modal closes, focus returns to `#fc-save-event_inquiries`, and server state remains `enabled`
    const afterEscape = await cdp.eval(
      topTab.sessionId,
      `(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        return {
          modalHidden: document.getElementById('featureConfirmModal').hidden,
          focusedId: document.activeElement?.id || '',
          cardBadges: document.getElementById('fc-card-event_inquiries')?.querySelector('.fc-badges')?.textContent || ''
        };
      })()`
    );
    assert.equal(afterEscape.modalHidden, true);
    assert.equal(afterEscape.focusedId, 'fc-save-event_inquiries');
    assert(afterEscape.cardBadges.includes('Effective: enabled'));

    // =========================================================================
    // [3/5] Open Stale Customer Tab Truthful Rejection & Automatic Resync
    // =========================================================================
    await browserSignIn(custTab.sessionId, custEmail, '/');
    await waitForCondition(
      async () =>
        cdp.eval(
          custTab.sessionId,
          `Boolean(window.bitesharkFeatures && document.querySelectorAll('.truck-card').length >= 10)`
        ),
      { label: 'Customer tab signed in and catalog loaded' }
    );

    // Customer opens Community Hub and starts composing a post while `community_submissions` is still `enabled`
    await cdp.eval(
      custTab.sessionId,
      `(async () => {
        await openCommunity();
        communityStartPost('tip', 'Great horchata at the Saturday market');
        const placeSel = document.getElementById('communityPlace');
        if (placeSel && placeSel.options.length > 1) placeSel.selectedIndex = 1;
        document.getElementById('communityBody').value = 'Try arriving before noon for fresh aguas frescas and warm tortillas.';
        return !document.getElementById('communityCompose').hidden;
      })()`
    );

    // Now Top Admin pauses `community_submissions` via confirmation modal!
    await cdp.eval(
      topTab.sessionId,
      `(() => {
        document.getElementById('fc-state-community_submissions').value = 'paused';
        document.getElementById('fc-save-community_submissions').click();
        document.getElementById('fcConfirmReason').value = 'Pause new community posts during moderation queue audit';
        document.getElementById('fcConfirmSubmitBtn').click();
        return true;
      })()`
    );
    await waitForCondition(
      async () =>
        cdp.eval(
          topTab.sessionId,
          `document.getElementById('fcLiveStatus')?.textContent.includes('Server confirmed: "New Community Reviews')`
        ),
      { label: 'Top Admin confirmed community_submissions pause' }
    );

    // Stale Customer tab (separate browser context, before 60s poll) submits the open compose form:
    // Server rejects with 503 FEATURE_PAUSED, truthful message is displayed, AND tab auto-resyncs!
    await cdp.eval(
      custTab.sessionId,
      `(() => {
        document.getElementById('communitySubmit').click();
        return true;
      })()`
    );
    const staleSyncState = await waitForCondition(
      async () =>
        cdp.eval(
          custTab.sessionId,
          `(() => {
            const actionMsg = document.getElementById('communityActionMessage')?.textContent || '';
            const banner = document.getElementById('fcCommunityStateBanner');
            const newBtn = document.querySelector('#communityScreen .community-new');
            if (!banner || banner.hidden || !newBtn?.hidden) return null;
            return {
              actionMsg,
              bannerText: banner.textContent,
              composeHidden: document.getElementById('communityCompose').hidden
            };
          })()`
        ),
      { label: 'Stale customer tab received truthful rejection and auto-resynced UI' }
    );
    assert(staleSyncState.actionMsg.toLowerCase().includes('paused'));
    assert(staleSyncState.bannerText.toLowerCase().includes('paused'));
    assert.equal(staleSyncState.composeHidden, true);

    // =========================================================================
    // [4/5] Staff-Beta Audience + Customer Viewpoint Preview (`/?viewpoint=customer`)
    // =========================================================================
    await cdp.eval(
      topTab.sessionId,
      `(() => {
        document.getElementById('fc-state-local_guides_passport').value = 'enabled';
        document.getElementById('fc-aud-local_guides_passport').value = 'staff_beta';
        document.getElementById('fc-reason-local_guides_passport').value = 'Test staff_beta audience with Customer Preview';
        document.getElementById('fc-save-local_guides_passport').click();
        return true;
      })()`
    );
    await waitForCondition(
      async () =>
        cdp.eval(
          topTab.sessionId,
          `document.getElementById('fcLiveStatus')?.textContent.includes('Server confirmed: "Local Guides')`
        ),
      { label: 'local_guides_passport set to staff_beta' }
    );

    // Top Admin normal app tab sees `.guides-launch` visible (`staff_beta` eligible)
    await waitForCondition(
      async () =>
        cdp.eval(
          topCompanionAppTab.sessionId,
          `window.bitesharkFeatures.refresh().then(() => document.querySelector('.guides-launch')?.hidden === false)`
        ),
      { label: 'Top Admin sees staff_beta Local Guides normally' }
    );

    // Top Admin launches Customer Preview (`/?viewpoint=customer`) -> `.guides-launch` is hidden just like for customers!
    await cdp.eval(topTab.sessionId, `document.getElementById('vpCustomerPreviewBtn').click(); true;`);
    await waitForCondition(
      async () =>
        cdp.eval(
          topTab.sessionId,
          `Boolean(document.getElementById('bitesharkViewpointBanner') && document.querySelector('.guides-launch')?.hidden === true)`
        ),
      { label: 'Customer Viewpoint Preview hides staff_beta Local Guides to match customer view' }
    );

    // =========================================================================
    // [5/5] Re-Enabling Restores Customer UI Without Data Loss
    // =========================================================================
    await cdp.send('Page.navigate', { url: `${baseUrl}/admin#features` }, topTab.sessionId);
    await waitForCondition(
      async () =>
        cdp.eval(
          topTab.sessionId,
          `Boolean(
            document.getElementById('sec-features') &&
            !document.getElementById('sec-features').hidden &&
            document.getElementById('fc-save-community_submissions') &&
            !document.getElementById('fc-save-community_submissions').disabled
          )`
        ),
      { label: 'Top Admin returned to /admin#features' }
    );

    for (const item of [
      { key: 'flavor_lab_tools', titlePrefix: 'Flavor Finder', state: 'enabled', aud: 'all' },
      { key: 'community_submissions', titlePrefix: 'New Community Reviews', state: 'enabled', aud: 'all' },
      { key: 'local_guides_passport', titlePrefix: 'Local Guides', state: 'enabled', aud: 'all' }
    ]) {
      await cdp.eval(
        topTab.sessionId,
        `(() => {
          const st = document.getElementById('fcLiveStatus');
          if (st) st.textContent = '';
          document.getElementById('fc-state-${item.key}').value = '${item.state}';
          const audEl = document.getElementById('fc-aud-${item.key}');
          if (audEl && !audEl.disabled) audEl.value = '${item.aud}';
          document.getElementById('fc-reason-${item.key}').value = 'Re-enable ${item.key} after E2E verification';
          document.getElementById('fc-save-${item.key}').click();
          return true;
        })()`
      );
      await waitForCondition(
        async () =>
          cdp.eval(
            topTab.sessionId,
            `(() => {
              const st = document.getElementById('fcLiveStatus')?.textContent || '';
              const badges = document.getElementById('fc-card-${item.key}')?.querySelector('.fc-badges')?.textContent || '';
              return (
                st.includes('Server confirmed: "${item.titlePrefix}') &&
                badges.includes('Effective: enabled') &&
                badges.includes('Audience: All eligible users')
              );
            })()`
          ),
        { label: `Re-enabled ${item.key} confirmed by server` }
      );
    }

    // Focus customer tab -> focus listener resyncs `/api/features` and restores all surfaces!
    await cdp.eval(custTab.sessionId, `window.dispatchEvent(new Event('focus')); true;`);
    await waitForCondition(
      async () =>
        cdp.eval(
          custTab.sessionId,
          `Boolean(
            document.querySelector('.guides-launch')?.hidden === false &&
            document.querySelector('.smart-invite')?.hidden === false &&
            document.querySelector('#communityScreen .community-new')?.hidden === false
          )`
        ),
      { label: 'Customer tab restored all re-enabled UI surfaces on focus' }
    );

    console.log(
      'PASS: Headless Chrome + PostgreSQL Feature Controls E2E (Mod read-only, Top ARIA/keyboard controls, low-impact direct save, high-impact confirmation modal + Escape cancel, BroadcastChannel sync, stale-tab 503 resync, Customer Preview staff_beta parity, and clean re-enable)'
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
    if (serverProc) {
      try {
        serverProc.kill('SIGTERM');
      } catch {}
    }
    if (migratorPool) await migratorPool.end().catch(() => {});
    await adminPool.end().catch(() => {});
    await pgCluster.stop();
  }
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
