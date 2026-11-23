// Real Headless Chrome + Real PostgreSQL Browser End-to-End Suite for BiteShark
// Private Customer Profile (`My BiteShark`), Preferences, Progress, Greatest Hits Collections,
// Keyboard Reordering, Deliberate Note-Copy Confirmation, 18+ Sharing Eligibility,
// Exact Server Preview, Revocable Unlisted `/s/<token>` Links, Mobile Layout & Admin Moderation Queue
// (`tests/customer-profile-browser.e2e.cjs`)

const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const http = require('node:http');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');

const shotDirArgIdx = process.argv.indexOf('--screenshots-dir');
const SCREENSHOTS_DIR =
  shotDirArgIdx >= 0 && process.argv[shotDirArgIdx + 1]
    ? path.resolve(process.argv[shotDirArgIdx + 1])
    : null;

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
  for (const c of [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ]) {
    if (fs.existsSync(c)) return c;
  }
  for (const bin of ['google-chrome', 'google-chrome-stable', 'chromium-browser', 'chromium']) {
    try {
      const out = execFileSync('which', [bin], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      if (out) return out;
    } catch {}
  }
  throw new Error('Could not locate Chrome/Chromium/Edge binary.');
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
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'biteshark-prof-e2e-pg-'));
  const dataDir = path.join(tmpBase, 'data');
  const pwFile = path.join(tmpBase, 'pw.txt');
  const logFile = path.join(tmpBase, 'postgres.log');
  const password = 'profe2e_' + crypto.randomBytes(6).toString('hex');
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
  throw new Error(`Timed out waiting for ${label}${lastErr ? `: ${lastErr.message}` : ''}`);
}

class CdpClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.consoleErrors = [];
  }

  async connect() {
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', () => resolve(), { once: true });
      this.ws.addEventListener('error', err => reject(err.error || new Error('CDP WebSocket failed')), {
        once: true
      });
    });
    this.ws.addEventListener('message', ev => {
      const raw = typeof ev.data === 'string' ? ev.data : ev.data.toString('utf8');
      const msg = JSON.parse(raw);
      if (msg.id && this.pending.has(msg.id)) {
        const entry = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) entry.reject(new Error(`${msg.error.message || JSON.stringify(msg.error)}`));
        else entry.resolve(msg.result);
        return;
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        this.consoleErrors.push(
          msg.params?.exceptionDetails?.text || 'Uncaught page exception'
        );
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
  const migratorRole = `bs_profe2e_mig_${suffix}`;
  const migratorPass = `mig_${suffix}`;
  const appRole = `bs_profe2e_app_${suffix}`;
  const appPass = `app_${suffix}`;
  const dbName = `bs_profe2e_${suffix}`;

  const photoStorageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-profe2e-photos-'));
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

    const topEmail = 'top-profe2e@staging.biteshark.invalid';
    const mayaEmail = 'maya-profe2e@staging.biteshark.invalid';
    const otherEmail = 'other-profe2e@staging.biteshark.invalid';

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
    const mailboxSecret = 'profe2e_mbx_' + crypto.randomBytes(16).toString('hex');

    const childEnv = {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(appPort),
      DATABASE_URL: appDbUrl,
      BITESHARK_ENV: 'staging',
      BITESHARK_RELEASE_SHA: 'e2e-customer-profile-candidate',
      BITESHARK_AUTH_SECRET: authSecret,
      BITESHARK_AUTH_DELIVERY_MODE: 'staging_mailbox',
      BITESHARK_STAGING_MAILBOX_SECRET: mailboxSecret,
      BITESHARK_STAGING_ALLOWED_EMAIL_DOMAINS: 'staging.biteshark.invalid',
      BITESHARK_AUTH_START_IP_MAX: '150',
      BITESHARK_AUTH_VERIFY_IP_MAX: '150',
      BITESHARK_PUSH_PROVIDER_MODE: 'disabled',
      BITESHARK_PHOTO_STORAGE_DIR: photoStorageDir
    };
    delete childEnv.BITESHARK_PUBLIC_ORIGIN;

    serverProc = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
      cwd: ROOT,
      env: childEnv,
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
      chromeProfileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'biteshark-prof-chrome-'));
      chromeProc = spawn(
        chromeBin,
        [
          '--headless=new',
          '--no-sandbox',
          '--disable-gpu',
          '--disable-dev-shm-usage',
          '--hide-scrollbars',
          '--no-first-run',
          '--no-default-browser-check',
          '--window-size=1280,900',
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

    async function createBrowserTab(browserContextId = null, width = 1280, height = 900, mobile = false) {
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
        'Network.setCookie',
        { name: 'bs_start_pref', value: 'customer', url: baseUrl, path: '/' },
        sessionId
      );
      await cdp.send(
        'Emulation.setDeviceMetricsOverride',
        { width, height, deviceScaleFactor: 1, mobile },
        sessionId
      );
      await cdp.send(
        'Network.setBlockedURLs',
        { urls: ['*://tile.openstreetmap.org/*', '*://unpkg.com/*'] },
        sessionId
      );
      return { sessionId, browserContextId: ctxId };
    }

    async function saveScreenshotIfRequested(sessionId, filename) {
      if (!SCREENSHOTS_DIR) return;
      fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId);
      fs.writeFileSync(path.join(SCREENSHOTS_DIR, filename), Buffer.from(shot.data, 'base64'));
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
            dob: '1991-05-22'
          });
          return true;
        })()`
      );

      const mbxRes = await fetch(`${baseUrl}/api/auth/staging-mailbox`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: baseUrl,
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
          return true;
        })()`
      );
      await cdp.send('Page.navigate', { url: `${baseUrl}${nextRel}` }, sessionId);
    }

    // Ensure `unlisted_collection_sharing` and `shared_collection_photos` are enabled via Top Admin if defaulted hidden
    const topTab = await createBrowserTab();
    await browserSignIn(topTab.sessionId, topEmail, '/admin#features');
    await waitForCondition(
      async () => cdp.eval(topTab.sessionId, `Boolean(document.getElementById('fc-state-private_photos'))`),
      { label: 'admin#features loaded for top admin' }
    );
    await cdp.eval(
      topTab.sessionId,
      `(async () => {
        const res = await fetch('/api/admin/features', { credentials: 'same-origin' });
        const data = await res.json();
        for (const key of ['unlisted_collection_sharing', 'shared_collection_photos']) {
          const ctrl = (data.controls || []).find(c => c.key === key);
          if (ctrl && ctrl.effective_state !== 'enabled') {
            await fetch('/api/admin/features/update', {
              method: 'POST',
              credentials: 'same-origin',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                feature_key: key,
                configured_state: 'enabled',
                audience: 'all',
                expected_revision: ctrl.revision,
                confirmed_impact: true,
                reason: 'Enable sharing for browser acceptance walkthrough'
              })
            });
          }
        }
        return true;
      })()`
    );

    // =========================================================================
    // Walkthrough Step 1: Sign in as Maya & review existing activity + progress
    // =========================================================================
    const mayaTab = await createBrowserTab();
    await browserSignIn(mayaTab.sessionId, mayaEmail, '/');
    await cdp.send('Page.navigate', { url: `${baseUrl}/` }, mayaTab.sessionId);
    await waitForCondition(
      async () => cdp.eval(mayaTab.sessionId, `Boolean(window.bitesharkProfile && window.bitesharkExploration && document.getElementById('rxMyProfileBtn'))`),
      { label: 'main SPA & My BiteShark entry button ready' }
    );

    // Log 2 real visits, 1 private photo, 1 saved trail & 1 favorite through canonical client APIs
    const testDishPhotoBuf = await sharp({
      create: { width: 480, height: 360, channels: 3, background: { r: 204, g: 92, b: 56 } }
    })
      .jpeg({ quality: 84 })
      .toBuffer();
    const testDishDataUrl = 'data:image/jpeg;base64,' + testDishPhotoBuf.toString('base64');

    const PRIVATE_DIARY_NOTE = 'Private note: parked behind courthouse square, extra salsa';
    await cdp.eval(
      mayaTab.sessionId,
      `(async () => {
        await window.bitesharkExploration.logVisit({
          vendorId: 'mitote',
          privateNote: ${JSON.stringify(PRIVATE_DIARY_NOTE)}
        });
        await window.bitesharkExploration.logVisit({
          vendorId: 'fruta',
          privateNote: 'Mango mangonada after lunch'
        });
        const photoUp = await fetch('/api/me/photos', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vendor_id: 'mitote',
            caption: 'Private camera roll caption — never share',
            data_url: ${JSON.stringify(testDishDataUrl)}
          })
        });
        if (!photoUp.ok) throw new Error('Photo upload failed: ' + photoUp.status);
        await window.bitesharkExploration.saveTrail({
          title: 'Santa Rosa Taco & Paleta Loop',
          themeKey: 'sweet',
          stops: [
            { vendor_id: 'mitote', match_reason: 'Quesatacos' },
            { vendor_id: 'fruta', match_reason: 'Paletas' }
          ]
        });
        await fetch('/api/favorites/toggle', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ truck_id: 'mitote', desired_saved: true })
        });
        return true;
      })()`
    );

    // Click `#rxMyProfileBtn` (`🧭 My BiteShark`) to open the private profile screen!
    await cdp.eval(mayaTab.sessionId, `document.getElementById('rxMyProfileBtn').click()`);
    await waitForCondition(
      async () =>
        cdp.eval(
          mayaTab.sessionId,
          `Boolean(document.getElementById('profileScreen')?.classList.contains('active') && document.getElementById('cpDisplayNameInput'))`
        ),
      { label: 'My BiteShark Overview tab rendered' }
    );

    // Save display name & bio on Overview
    await cdp.eval(
      mayaTab.sessionId,
      `(async () => {
        document.getElementById('cpDisplayNameInput').value = 'Maya Sonoma';
        document.getElementById('cpBioInput').value = 'Exploring Sonoma County taco parks, farm stands & espresso carts.';
        const sprig = document.querySelector('input[name="cpAvatarStyle"][value="citrus_sprig"]');
        if (sprig) sprig.checked = true;
        document.getElementById('cpOverviewForm').requestSubmit();
        return true;
      })()`
    );
    await waitForCondition(
      async () =>
        cdp.eval(
          mayaTab.sessionId,
          `document.getElementById('profileScreenHeading')?.textContent?.includes('Maya Sonoma')`
        ),
      { label: 'Overview profile details saved' }
    );
    await saveScreenshotIfRequested(mayaTab.sessionId, 'profile-private-overview-desktop.png');

    // Keyboard tablist navigation (`ArrowRight` from Overview -> My activity -> My progress)
    await cdp.eval(
      mayaTab.sessionId,
      `(() => {
        const overviewTab = document.getElementById('cpTabBtn-overview');
        overviewTab.focus();
        overviewTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        return document.activeElement?.id;
      })()`
    );
    await waitForCondition(
      async () =>
        cdp.eval(
          mayaTab.sessionId,
          `document.getElementById('cpTabPanel-activity')?.textContent?.includes('Mitote Food Park')`
        ),
      { label: 'My activity tab rendered via ArrowRight keyboard navigation' }
    );

    // Switch to `My progress` tab and capture `profile-progress-desktop.png`
    await cdp.eval(mayaTab.sessionId, `document.getElementById('cpTabBtn-progress').click()`);
    await waitForCondition(
      async () =>
        cdp.eval(
          mayaTab.sessionId,
          `(() => {
            const t = document.getElementById('cpTabPanel-progress')?.textContent || '';
            return t.includes('60 pts') && t.includes('Two-stop taste trail') && t.includes('2 of 2 stops logged this week');
          })()`
        ),
      { label: 'My progress tab shows server-calculated 60 pts & completed weekly challenge' }
    );
    await saveScreenshotIfRequested(mayaTab.sessionId, 'profile-progress-desktop.png');

    // =========================================================================
    // Walkthrough Step 2: Edit account-backed customer preferences & verify persistence
    // =========================================================================
    await cdp.eval(mayaTab.sessionId, `document.getElementById('cpTabBtn-preferences').click()`);
    await waitForCondition(
      async () => cdp.eval(mayaTab.sessionId, `Boolean(document.getElementById('cpPreferencesForm'))`),
      { label: 'Preferences tab rendered' }
    );
    const prefCheckText = await cdp.eval(
      mayaTab.sessionId,
      `document.getElementById('cpTabPanel-preferences').textContent`
    );
    assert(
      prefCheckText.includes('never an allergy-safety'),
      'Preferences UI must display dietary non-allergy-safety disclaimer'
    );

    await cdp.eval(
      mayaTab.sessionId,
      `(() => {
        document.getElementById('cpPrefTownSelect').value = 'Sebastopol';
        for (const val of ['tacos_mexican', 'farmers_markets', 'vegetarian_friendly']) {
          const chk = document.querySelector('input[name="cpFoodInterest"][value="' + val + '"]');
          if (chk) chk.checked = true;
        }
        document.getElementById('cpPreferencesForm').requestSubmit();
      })()`
    );
    await waitForCondition(
      async () =>
        cdp.eval(
          mayaTab.sessionId,
          `document.querySelector('.cp-header-sub')?.textContent?.includes('Sebastopol')`
        ),
      { label: 'Preferred town Sebastopol saved and reflected in header' }
    );

    // Full page reload to `/profile` proves preferences persist server-side across reloads!
    await cdp.send('Page.navigate', { url: `${baseUrl}/profile` }, mayaTab.sessionId);
    await waitForCondition(
      async () =>
        cdp.eval(
          mayaTab.sessionId,
          `(async () => {
            if (window.bitesharkReady) await window.bitesharkReady;
            return Boolean(
              document.getElementById('cpTabBtn-collections') &&
              document.querySelector('.cp-header-sub')?.textContent?.includes('Sebastopol')
            );
          })()`
        ),
      { label: 'Direct /profile route loads persisted account state' }
    );

    // =========================================================================
    // Walkthrough Step 3: Create Greatest Hits collection, deliberate note copy & keyboard reorder
    // =========================================================================
    await waitForCondition(
      async () =>
        cdp.eval(
          mayaTab.sessionId,
          `(() => {
            const btn = document.getElementById('cpTabBtn-collections');
            if (!btn) return false;
            btn.click();
            return true;
          })()`
        ),
      { label: 'Click Greatest Hits tab' }
    );
    await waitForCondition(
      async () => cdp.eval(mayaTab.sessionId, `Boolean(document.getElementById('ghCreateColForm'))`),
      { label: 'Greatest Hits create form ready' }
    );

    await cdp.eval(
      mayaTab.sessionId,
      `(() => {
        document.getElementById('ghNewTitleInput').value = 'Sonoma Weekend Greatest Hits';
        document.getElementById('ghNewIntroInput').value = 'Personal favorite taco and paleta stops when friends visit.';
        document.getElementById('ghCreateColForm').requestSubmit();
      })()`
    );
    await waitForCondition(
      async () => cdp.eval(mayaTab.sessionId, `Boolean(document.getElementById('ghEditTitleInput'))`),
      { label: 'Collection editor opened' }
    );

    // Add `mitote` and `fruta` from quick-add / canonical catalog controls
    await cdp.eval(
      mayaTab.sessionId,
      `(() => {
        const sel = document.getElementById('ghCatalogSelect');
        sel.value = 'mitote';
        document.getElementById('ghAddSelectedCatalogBtn').click();
        const sel2 = document.getElementById('ghCatalogSelect');
        sel2.value = 'fruta';
        document.getElementById('ghAddSelectedCatalogBtn').click();
      })()`
    );
    await waitForCondition(
      async () => cdp.eval(mayaTab.sessionId, `document.querySelectorAll('.cp-entry-editor-card').length === 2`),
      { label: '2 spots added to Greatest Hits draft' }
    );

    // Verify private note was NOT auto-copied, and test deliberate copy confirmation UI!
    const initialRec0 = await cdp.eval(mayaTab.sessionId, `document.getElementById('ghRecInput-0').value`);
    assert.equal(initialRec0, '', 'Private visit note must never be auto-copied into recommendation');

    await waitForCondition(
      async () => cdp.eval(mayaTab.sessionId, `Boolean(document.querySelector('[data-gh-ask-note-copy="mitote"]'))`),
      { label: 'Review & copy private note helper button available' }
    );
    await cdp.eval(mayaTab.sessionId, `document.querySelector('[data-gh-ask-note-copy="mitote"]').click()`);
    await waitForCondition(
      async () => cdp.eval(mayaTab.sessionId, `Boolean(document.querySelector('[data-gh-confirm-note-copy="0"]'))`),
      { label: 'Deliberate note-copy confirmation prompt displayed' }
    );
    // Cancel private note copy so private diary note stays private, and write friend-facing recommendations!
    await cdp.eval(
      mayaTab.sessionId,
      `(() => {
        document.querySelector('[data-gh-cancel-note-copy]').click();
        const rec0 = document.getElementById('ghRecInput-0');
        rec0.value = 'Grab the birria quesatacos and hibiscus agua fresca.';
        rec0.dispatchEvent(new Event('input', { bubbles: true }));
        const rec1 = document.getElementById('ghRecInput-1');
        rec1.value = 'Refreshing strawberry-lime paletas on warm afternoons.';
        rec1.dispatchEvent(new Event('input', { bubbles: true }));
      })()`
    );

    // Keyboard-accessible reordering WITHOUT drag-and-drop: click `[data-gh-move-up="1"]` (`↑ Up`)
    const reorderCheck = await cdp.eval(
      mayaTab.sessionId,
      `(() => {
        const upBtn = document.querySelector('[data-gh-move-up="1"]');
        upBtn.focus();
        upBtn.click();
        const firstHeading = document.querySelector('.cp-entry-editor-card strong')?.textContent || '';
        const activeTag = document.activeElement?.tagName || '';
        return { firstHeading, activeTag };
      })()`
    );
    assert(reorderCheck.firstHeading.startsWith('#1 ·'), 'Spot #2 moved to #1 via keyboard Up button');
    assert.equal(reorderCheck.activeTag, 'BUTTON', 'Keyboard focus preserved on reorder control after move');

    // Save collection changes first so entries exist in DB before attaching consented photo
    await cdp.eval(mayaTab.sessionId, `document.getElementById('ghSaveCollectionBtn').click()`);
    await waitForCondition(
      async () =>
        cdp.eval(
          mayaTab.sessionId,
          `document.querySelector('#ghCollectionsHost .cp-privacy-pill')?.textContent?.includes('Rev 2')`
        ),
      { label: 'Collection saved at Revision 2' }
    );

    // Attach consented photo to `mitote`
    await cdp.eval(mayaTab.sessionId, `document.querySelector('[data-gh-open-photo-picker="mitote"]').click()`);
    await waitForCondition(
      async () =>
        cdp.eval(mayaTab.sessionId, `Boolean(document.querySelector('[data-gh-pick-photo-vendor="mitote"]'))`),
      { label: 'Private dish photos loaded in consent picker' }
    );
    await cdp.eval(
      mayaTab.sessionId,
      `(() => {
        const radio = document.querySelector('[data-gh-pick-photo-vendor="mitote"]');
        radio.checked = true;
        radio.dispatchEvent(new Event('change', { bubbles: true }));
        const consent = document.querySelector('[data-gh-photo-consent-vendor="mitote"]');
        consent.checked = true;
        consent.dispatchEvent(new Event('change', { bubbles: true }));
        document.querySelector('[data-gh-confirm-attach-photo="mitote"]').click();
      })()`
    );
    await waitForCondition(
      async () =>
        cdp.eval(mayaTab.sessionId, `Boolean(document.querySelector('[data-gh-remove-photo-att]'))`),
      { label: 'Consented shared photo derivative attached' }
    );

    await saveScreenshotIfRequested(mayaTab.sessionId, 'profile-greatest-hits-editor-desktop.png');

    // =========================================================================
    // Walkthrough Step 4: Preview exact shared view BEFORE creating any share link
    // =========================================================================
    await cdp.eval(mayaTab.sessionId, `document.getElementById('ghPreviewSharedBtn').click()`);
    await waitForCondition(
      async () =>
        cdp.eval(
          mayaTab.sessionId,
          `document.getElementById('ghCollectionsHost')?.textContent?.includes('Grab the birria quesatacos')`
        ),
      { label: 'Server-side preview rendered inside editor' }
    );

    // =========================================================================
    // Walkthrough Step 5: Complete 18+ self-attested confirmation & create unlisted link
    // =========================================================================
    await cdp.eval(
      mayaTab.sessionId,
      `(() => {
        document.getElementById('ghEligMonth').value = '04';
        document.getElementById('ghEligDay').value = '19';
        document.getElementById('ghEligYear').value = '1991';
        document.getElementById('ghAdultEligForm').requestSubmit();
      })()`
    );
    await waitForCondition(
      async () => cdp.eval(mayaTab.sessionId, `Boolean(document.getElementById('ghCreateShareLinkBtn'))`),
      { label: '18+ sharing eligibility confirmed and share link controls unlocked' }
    );

    // Select optional display name, preferred Sonoma town, and consented shared photos, then create link!
    await cdp.eval(
      mayaTab.sessionId,
      `(() => {
        for (const k of ['include_display_name', 'include_preferred_area', 'include_shared_photos']) {
          const chk = document.querySelector('[data-gh-disc="' + k + '"]');
          if (chk) {
            chk.checked = true;
            chk.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
        document.getElementById('ghCreateShareLinkBtn').click();
      })()`
    );
    const issuedShareUrl = await waitForCondition(
      async () => cdp.eval(mayaTab.sessionId, `document.getElementById('ghIssuedShareUrlInput')?.value || null`),
      { label: 'Unlisted /s/<token> URL issued once' }
    );
    assert(issuedShareUrl.includes('/s/'), `Expected /s/<token> URL, got ${issuedShareUrl}`);

    // =========================================================================
    // Walkthrough Step 6: Open `/s/<token>` signed out in a brand-new incognito context!
    // =========================================================================
    const anonViewerTab = await createBrowserTab();
    await cdp.send('Page.navigate', { url: issuedShareUrl }, anonViewerTab.sessionId);
    await waitForCondition(
      async () =>
        cdp.eval(
          anonViewerTab.sessionId,
          `document.body?.textContent?.includes('Sonoma Weekend Greatest Hits') && document.body?.textContent?.includes('Maya Sonoma')`
        ),
      { label: 'Signed-out viewer rendered live unlisted /s/<token> page' }
    );

    // Verify consented shared WebP image actually decoded & rendered (`naturalWidth > 0`), and ZERO private fields leaked!
    const sharedCheck = await waitForCondition(
      async () =>
        cdp.eval(
          anonViewerTab.sessionId,
          `(() => {
            const img = document.querySelector('img[src*="/photo/sha_"]');
            if (!img || !img.complete || img.naturalWidth === 0) return null;
            return {
              html: document.documentElement.outerHTML,
              imgWidth: img.naturalWidth
            };
          })()`
        ),
      { label: 'Consented shared WebP image decoded on signed-out page' }
    );
    assert(sharedCheck.imgWidth > 0);
    assert(!sharedCheck.html.includes(mayaEmail), 'Signed-out page must never contain owner email');
    assert(!sharedCheck.html.includes(PRIVATE_DIARY_NOTE), 'Signed-out page must never contain private visit note');
    assert(!sharedCheck.html.includes('Private camera roll caption'), 'Signed-out page must never contain private photo caption');
    assert(!sharedCheck.html.includes('Exploring Sonoma County taco parks'), 'Unselected bio must not appear');

    await saveScreenshotIfRequested(anonViewerTab.sessionId, 'profile-shared-preview-and-unlisted-desktop.png');

    // Signed-out viewer submits discreet "Report this shared page" report (`#spOpenReportBtn`)
    await cdp.eval(
      anonViewerTab.sessionId,
      `(() => {
        document.getElementById('spOpenReportBtn').click();
        document.getElementById('spReportReason').value = 'spam_or_abuse';
        document.getElementById('spReportDetails').value = 'E2E moderation queue verification check';
        document.getElementById('spReportForm').requestSubmit();
      })()`
    );
    await waitForCondition(
      async () =>
        cdp.eval(
          anonViewerTab.sessionId,
          `document.getElementById('spReportMsg')?.textContent?.includes('recorded for BiteShark moderation review')`
        ),
      { label: 'Signed-out abuse report submitted cleanly' }
    );

    // Verify Top Admin sees the reported shared page in `/admin#moderation` `Reported Shared Pages` subtab without private notes
    await cdp.send('Page.navigate', { url: `${baseUrl}/admin#moderation` }, topTab.sessionId);
    await waitForCondition(
      async () => cdp.eval(topTab.sessionId, `Boolean(document.querySelector('[data-mod-queue="shared_pages"]'))`),
      { label: 'Admin moderation shared_pages subtab ready' }
    );
    await cdp.eval(topTab.sessionId, `document.querySelector('[data-mod-queue="shared_pages"]').click()`);
    await waitForCondition(
      async () =>
        cdp.eval(
          topTab.sessionId,
          `document.getElementById('modList')?.textContent?.includes('Sonoma Weekend Greatest Hits')`
        ),
      { label: 'Admin Reported Shared Pages queue displays reported collection' }
    );
    const adminPanelText = await cdp.eval(
      topTab.sessionId,
      `(document.getElementById('modList')?.textContent || '') + ' ' + (document.getElementById('modDetailPane')?.textContent || '')`
    );
    assert(!adminPanelText.includes(PRIVATE_DIARY_NOTE), 'Admin shared moderation UI must never expose private notes');

    // Mobile `390x844` responsive check + screenshot on `#profileScreen`
    const mobileTab = await createBrowserTab(mayaTab.browserContextId, 390, 844, true);
    await cdp.send('Page.navigate', { url: `${baseUrl}/profile` }, mobileTab.sessionId);
    await waitForCondition(
      async () =>
        cdp.eval(
          mobileTab.sessionId,
          `(async () => {
            if (window.bitesharkReady) await window.bitesharkReady;
            return Boolean(document.getElementById('profileScreenHeading')?.textContent?.includes('Maya Sonoma'));
          })()`
        ),
      { label: 'Mobile 390x844 /profile loaded' }
    );
    const mobileMetrics = await cdp.eval(
      mobileTab.sessionId,
      `({ scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth })`
    );
    assert(
      mobileMetrics.scrollW <= mobileMetrics.innerW + 2,
      `Mobile /profile must not overflow horizontally (${mobileMetrics.scrollW} > ${mobileMetrics.innerW})`
    );
    await saveScreenshotIfRequested(mobileTab.sessionId, 'profile-mobile-390x844.png');

    // =========================================================================
    // Walkthrough Step 7: Revoke unlisted link & confirm signed-out access stops immediately
    // =========================================================================
    await cdp.eval(mayaTab.sessionId, `document.querySelector('[data-gh-revoke-share]').click()`);
    await waitForCondition(
      async () =>
        cdp.eval(
          mayaTab.sessionId,
          `document.getElementById('ghCollectionsHost')?.textContent?.includes('Unlisted link revoked immediately')`
        ),
      { label: 'Share link revoked in UI' }
    );

    await cdp.send('Page.navigate', { url: issuedShareUrl }, anonViewerTab.sessionId);
    await waitForCondition(
      async () =>
        cdp.eval(
          anonViewerTab.sessionId,
          `document.body?.textContent?.includes('available') && !document.body?.textContent?.includes('Sonoma Weekend Greatest Hits')`
        ),
      { label: 'Revoked /s/<token> immediately renders neutral unavailable page' }
    );

    // =========================================================================
    // Walkthrough Step 8: Confirm all private records remain intact + shared-device sign-out isolation
    // =========================================================================
    const intactStats = await cdp.eval(
      mayaTab.sessionId,
      `(async () => {
        const p = await window.bitesharkProfile.getProfile({ force: true });
        return {
          collections: p.collections_summary.count,
          visits: p.activity_preview.visits_total,
          photos: p.activity_preview.photos_total,
          favorites: p.activity_preview.favorites_total,
          town: p.preferences.preferred_town
        };
      })()`
    );
    assert.deepEqual(intactStats, {
      collections: 1,
      visits: 2,
      photos: 1,
      favorites: 1,
      town: 'Sebastopol'
    });

    // Sign out Maya on the same browser tab and sign in as `otherEmail` -> zero cross-account leakage!
    await cdp.eval(mayaTab.sessionId, `window.bitesharkAuth.logout()`).catch(() => null);
    await browserSignIn(mayaTab.sessionId, otherEmail, '/profile');
    await waitForCondition(
      async () =>
        cdp.eval(
          mayaTab.sessionId,
          `(async () => {
            if (window.bitesharkReady) await window.bitesharkReady;
            return Boolean(
              document.getElementById('profileScreenHeading') &&
              !document.getElementById('profileScreenHeading').textContent.includes('Maya Sonoma')
            );
          })()`
        ),
      { label: 'Second account on same browser sees fresh isolated profile' }
    );

    assert.equal(
      cdp.consoleErrors.length,
      0,
      `Expected 0 uncaught browser exceptions, got: ${JSON.stringify(cdp.consoleErrors)}`
    );

    console.log(
      JSON.stringify({
        ok: true,
        suite: 'customer-profile-browser.e2e',
        screenshots_dir: SCREENSHOTS_DIR,
        walkthrough_steps_verified: 8
      })
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
    try {
      fs.rmSync(photoStorageDir, { recursive: true, force: true });
    } catch {}
  }
})();
