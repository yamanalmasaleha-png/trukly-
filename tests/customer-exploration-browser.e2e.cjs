// Real Headless Chrome + Real PostgreSQL Browser End-to-End Suite for BiteShark
// Local Guides, Editorial Stories, Account-Backed Visit Journal, Private Photos,
// Badges & Weekly Challenges, Suggested Trails, Legacy Device Migration,
// Cross-Account Isolation, Feature Controls, Responsive Layout & Accessibility
// (`tests/customer-exploration-browser.e2e.cjs`)

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
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'biteshark-exp-e2e-pg-'));
  const dataDir = path.join(tmpBase, 'data');
  const pwFile = path.join(tmpBase, 'pw.txt');
  const logFile = path.join(tmpBase, 'postgres.log');
  const password = 'expe2e_' + crypto.randomBytes(6).toString('hex');
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
  const migratorRole = `bs_expe2e_mig_${suffix}`;
  const migratorPass = `mig_${suffix}`;
  const appRole = `bs_expe2e_app_${suffix}`;
  const appPass = `app_${suffix}`;
  const dbName = `bs_expe2e_${suffix}`;

  const photoStorageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-expe2e-photos-'));
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

    const topEmail = 'top-exp@staging.biteshark.invalid';
    const userAEmail = 'alice-exp@staging.biteshark.invalid';
    const userBEmail = 'bob-exp@staging.biteshark.invalid';
    const ownerEmail = 'owner-exp@staging.biteshark.invalid';

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
    const mailboxSecret = 'expe2e_mbx_' + crypto.randomBytes(16).toString('hex');

    serverProc = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
      cwd: ROOT,
      env: {
        ...process.env,
        HOST: '127.0.0.1',
        PORT: String(appPort),
        DATABASE_URL: appDbUrl,
        BITESHARK_ENV: 'staging',
        BITESHARK_RELEASE_SHA: 'e2e-customer-exploration-candidate',
        BITESHARK_AUTH_SECRET: authSecret,
        BITESHARK_AUTH_DELIVERY_MODE: 'staging_mailbox',
        BITESHARK_STAGING_MAILBOX_SECRET: mailboxSecret,
        BITESHARK_STAGING_ALLOWED_EMAIL_DOMAINS: 'staging.biteshark.invalid',
        BITESHARK_AUTH_START_IP_MAX: '120',
        BITESHARK_AUTH_VERIFY_IP_MAX: '120',
        BITESHARK_PUSH_PROVIDER_MODE: 'disabled',
        BITESHARK_PHOTO_STORAGE_DIR: photoStorageDir
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
      chromeProfileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'biteshark-exp-chrome-'));
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

    // Prepare a synthetic 96x72 PNG data URL for legacy + live photo upload tests
    const samplePngBuffer = await sharp({
      create: { width: 96, height: 72, channels: 3, background: { r: 196, g: 82, b: 48 } }
    })
      .png()
      .toBuffer();
    const samplePngDataUrl = 'data:image/png;base64,' + samplePngBuffer.toString('base64');

    const custTab = await createBrowserTab();
    const separateDeviceTab = await createBrowserTab();
    const topTab = await createBrowserTab();

    // =========================================================================
    // [1/6] Anonymous Browsing: Top Discovery Entry, Editorial Stories, Sweet Trails & Old Shared URLs
    // =========================================================================
    await cdp.send('Page.navigate', { url: `${baseUrl}/` }, custTab.sessionId);
    const anonDiscoverCheck = await waitForCondition(
      async () =>
        cdp.eval(
          custTab.sessionId,
          `(() => {
            const bar = document.getElementById('discoverSuggestedTrailsBar');
            const cards = document.querySelectorAll('#truckCards .truck-card');
            if (!bar || cards.length < 50) return null;
            const barRect = bar.getBoundingClientRect();
            const firstCardRect = cards[0].getBoundingClientRect();
            return {
              barVisible: !bar.hidden && barRect.height > 24,
              barAboveCatalog: barRect.top < firstCardRect.top,
              bookIconDiffersFromGuides:
                document.querySelector('.bottom-nav .book-nav')?.innerHTML !==
                document.querySelector('.bottom-nav .guide-nav')?.innerHTML
            };
          })()`
        ),
      { label: 'Anonymous discovery screen with Suggested Trails bar above catalog' }
    );
    assert.equal(anonDiscoverCheck.barVisible, true);
    assert.equal(anonDiscoverCheck.barAboveCatalog, true, 'Suggested trails entry must appear above the catalog');
    assert.equal(anonDiscoverCheck.bookIconDiffersFromGuides, true, 'Book and Guides bottom-nav icons must be distinct');

    // Open Editorial Stories anonymously -> 5 sourced cards with 16:9 SVG illustrations, 0 broken images, 0 horizontal overflow
    await cdp.eval(custTab.sessionId, `openLocalGuides('stories')`);
    const storiesUi = await waitForCondition(
      async () =>
        cdp.eval(
          custTab.sessionId,
          `(() => {
            const cards = [...document.querySelectorAll('#guideStoryGrid .guide-story')];
            if (cards.length !== 5) return null;
            const svgs = document.querySelectorAll('#guideStoryGrid svg.guide-story-svg');
            const brokenImgs = [...document.querySelectorAll('#guideStoryGrid img')].filter(i => !i.complete || i.naturalWidth === 0);
            return {
              storyCount: cards.length,
              svgCount: svgs.length,
              brokenImgCount: brokenImgs.length,
              hasEditorialBadge: document.getElementById('guideStoryGrid').textContent.includes('EDITORIAL STORY'),
              overflowX: document.documentElement.scrollWidth > window.innerWidth
            };
          })()`
        ),
      { label: '5 editorial stories rendered with SVG artwork' }
    );
    assert.equal(storiesUi.storyCount, 5);
    assert.equal(storiesUi.svgCount, 5);
    assert.equal(storiesUi.brokenImgCount, 0);
    assert.equal(storiesUi.hasEditorialBadge, true);
    assert.equal(storiesUi.overflowX, false);
    await saveScreenshotIfRequested(custTab.sessionId, 'guides-after-stories-desktop.png');

    // Keyboard Left/Right arrow navigation on `#guidesScreen .guides-tabs`
    const tabKeyMoved = await cdp.eval(
      custTab.sessionId,
      `(() => {
        const storiesTab = document.querySelector('[data-guide-tab="stories"]');
        storiesTab.focus();
        storiesTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        return {
          activeTabId: document.activeElement?.id || '',
          photoPaneVisible: !document.getElementById('guidePhotoSection').hidden,
          requiresSignInPrompt: document.getElementById('dishPhotoGrid').textContent.includes('Sign in')
        };
      })()`
    );
    assert.equal(tabKeyMoved.activeTabId, 'guideTabPhotos');
    assert.equal(tabKeyMoved.photoPaneVisible, true);
    assert.equal(tabKeyMoved.requiresSignInPrompt, true);

    // Anonymous Suggested Trails: `"Something sweet"` returns real sweet stops + match reasons, NO Marketing kit tab!
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1120, deviceScaleFactor: 1, mobile: false }, custTab.sessionId);
    await cdp.eval(custTab.sessionId, `openSmart('trail')`);
    await waitForCondition(
      async () => cdp.eval(custTab.sessionId, `Boolean(document.getElementById('smartCraving'))`),
      { label: 'Suggested trails controls rendered' }
    );
    await cdp.eval(
      custTab.sessionId,
      `(() => {
        document.getElementById('smartCraving').value = 'sweet';
        buildFoodTrail(new Event('submit'));
        return true;
      })()`
    );
    const sweetUi = await waitForCondition(
      async () =>
        cdp.eval(
          custTab.sessionId,
          `(() => {
            const stops = [...document.querySelectorAll('#smartResults .trail-stop-card h3')].map(el => el.textContent.trim());
            if (!stops.length) return null;
            const reasons = [...document.querySelectorAll('#smartResults .trail-match-reason')].map(el => el.textContent.trim());
            const tabs = [...document.querySelectorAll('#smartScreen [data-smart-tab]')].map(b => b.dataset.smartTab);
            return { stops, reasons, tabs, signInPromptShown: document.getElementById('smartResults').textContent.includes('Sign in to save this trail') };
          })()`
        ),
      { label: 'Sweet suggested trail rendered' }
    );
    assert(!sweetUi.tabs.includes('marketing'), 'Vendor Marketing kit must not appear in customer smartScreen tabs');
    assert(!sweetUi.stops.some(s => s.includes('Bay Area Munchiez') || s.includes('Cichy')), 'Burger trucks must not appear in sweet trail');
    assert(sweetUi.reasons.length === sweetUi.stops.length && sweetUi.reasons.every(r => r.includes('Why it matched:')));
    assert.equal(sweetUi.signInPromptShown, true);
    await saveScreenshotIfRequested(custTab.sessionId, 'trails-after-sweet-desktop.png');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, custTab.sessionId);

    // Legacy shared URL compatibility (`/#trail=fruta,iniguez`)
    await cdp.send('Page.navigate', { url: `${baseUrl}/#trail=fruta,iniguez` }, custTab.sessionId);
    const sharedHashUi = await waitForCondition(
      async () =>
        cdp.eval(
          custTab.sessionId,
          `(() => {
            const cards = [...document.querySelectorAll('#smartResults .trail-stop-card h3')];
            return cards.length === 2 ? cards.map(c => c.textContent.trim()) : null;
          })()`
        ),
      { label: 'Legacy #trail= deep link resolved' }
    );
    assert(sharedHashUi[0].includes('Fru-ta') && sharedHashUi[1].includes('Iñiguez'));

    // =========================================================================
    // [2/6] Explicit Legacy Device Data Migration Offer (Visits + IndexedDB Photos)
    // =========================================================================
    await cdp.eval(
      custTab.sessionId,
      `(async () => {
        localStorage.setItem('truckly_guide_passport_v1', JSON.stringify({
          visits: [
            { id: 'iniguez', at: '2026-10-20T19:00:00.000Z', note: 'Legacy device carnitas note' },
            { id: 'deleted-unknown-spot', at: '2026-10-21T19:00:00.000Z', note: 'Unmappable spot' }
          ]
        }));
        await new Promise((resolve, reject) => {
          const req = indexedDB.open('truckly-dish-notebook-v1', 1);
          req.onupgradeneeded = () => {
            if (!req.result.objectStoreNames.contains('dishes')) {
              req.result.createObjectStore('dishes', { keyPath: 'id' });
            }
          };
          req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction('dishes', 'readwrite');
            tx.objectStore('dishes').put({
              id: 'legacy_photo_1',
              spotId: 'mitote',
              spot: 'Mitote Food Park',
              note: 'Legacy birria snapshot',
              created: '2026-10-22T20:00:00.000Z',
              data: ${JSON.stringify(samplePngDataUrl)}
            });
            tx.oncomplete = () => { db.close(); resolve(true); };
            tx.onerror = () => { db.close(); reject(tx.error); };
          };
          req.onerror = () => reject(req.error);
        });
        return true;
      })()`
    );

    // Sign in as User A -> legacy data MUST NOT silently auto-import before confirmation!
    await browserSignIn(custTab.sessionId, userAEmail, '/#passport');
    const preImportOffer = await waitForCondition(
      async () =>
        cdp.eval(
          custTab.sessionId,
          `(() => {
            const banner = document.getElementById('legacyImportPrompt');
            if (!banner) return null;
            return {
              text: banner.textContent,
              hasConfirmBtn: Boolean(document.getElementById('legacyConfirmImportBtn')),
              hasDiscardBtn: Boolean(document.getElementById('legacyAskDiscardBtn')),
              visitListEmptyBeforeConfirm: document.getElementById('journalVisitsList')?.textContent.includes('No visits in your journal yet') || false
            };
          })()`
        ),
      { label: 'Explicit legacy device import offer rendered after sign-in' }
    );
    assert(preImportOffer.text.includes('Import the visits and photos saved on this device into this account?'));
    assert(preImportOffer.text.includes(userAEmail));
    assert(preImportOffer.text.includes('another person'));
    assert.equal(preImportOffer.visitListEmptyBeforeConfirm, true, 'Legacy data must NEVER silently auto-import before confirmation');

    // Confirm import -> valid `iniguez` visit + valid `mitote` photo imported; invalid `deleted-unknown-spot` reported & kept recoverable!
    await cdp.eval(custTab.sessionId, `document.getElementById('legacyConfirmImportBtn').click()`);
    const postImportState = await waitForCondition(
      async () =>
        cdp.eval(
          custTab.sessionId,
          `(() => {
            const visitList = document.getElementById('journalVisitsList')?.textContent || '';
            const banner = document.querySelector('#guidePassport .passport-legacy-banner.is-warning')?.textContent || '';
            if (!visitList.includes('Iñiguez') || !banner) return null;
            return {
              visitList,
              banner,
              remainingLocalRaw: localStorage.getItem('truckly_guide_passport_v1')
            };
          })()`
        ),
      { label: 'Legacy import completed with partial-invalid report' }
    );
    assert(postImportState.banner.includes('Device import completed with some unimported items'));
    assert(postImportState.banner.includes('deleted-unknown-spot'));
    assert(
      postImportState.remainingLocalRaw && postImportState.remainingLocalRaw.includes('deleted-unknown-spot'),
      'Unmappable legacy entry must remain recoverable until user explicitly discards'
    );

    // Deliberate discard of remaining unmappable entry directly from the partial-import banner
    await cdp.eval(custTab.sessionId, `document.getElementById('legacyAskDiscardBtn').click()`);
    await waitForCondition(
      async () => cdp.eval(custTab.sessionId, `Boolean(document.getElementById('legacyConfirmDiscardBtn'))`),
      { label: 'Discard confirmation step' }
    );
    await cdp.eval(custTab.sessionId, `document.getElementById('legacyConfirmDiscardBtn').click()`);
    await waitForCondition(
      async () => cdp.eval(custTab.sessionId, `localStorage.getItem('truckly_guide_passport_v1') === null`),
      { label: 'Legacy localStorage cleared after explicit discard' }
    );

    // =========================================================================
    // [3/6] Detail Prefill Visit Logging, Private Photo Upload, Saved Trail Progress & Screenshots
    // =========================================================================
    await cdp.eval(custTab.sessionId, `showScreen('discover'); openDetail('elenita')`);
    await waitForCondition(
      async () => cdp.eval(custTab.sessionId, `Boolean(document.querySelector('#detailContent [data-detail-log-visit="elenita"]'))`),
      { label: 'Detail modal Log a visit button rendered' }
    );
    await cdp.eval(custTab.sessionId, `document.querySelector('#detailContent [data-detail-log-visit="elenita"]').click()`);
    await waitForCondition(
      async () => cdp.eval(custTab.sessionId, `document.getElementById('guideSpotSelect')?.value === 'elenita'`),
      { label: 'Visit journal prefilled with elenita from detail modal' }
    );
    await cdp.eval(
      custTab.sessionId,
      `(() => {
        const note = document.getElementById('guideVisitNote');
        note.value = 'Carnitas super burrito on Sebastopol Rd';
        note.dispatchEvent(new Event('input', { bubbles: true }));
        document.getElementById('guideVisitForm').requestSubmit();
        return true;
      })()`
    );
    await waitForCondition(
      async () =>
        cdp.eval(
          custTab.sessionId,
          `document.getElementById('journalVisitsList')?.textContent.includes('Delicias Elenita') && document.getElementById('journalAchievementsPanel')?.textContent.includes('60 points')`
        ),
      { label: 'Visit logged and server points updated to 60 (2 visits * 25 + 1 photo * 10)' }
    );

    // Capture Mobile (`390x844`) Visit Journal screenshot & verify zero horizontal overflow + form above/near fold!
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, custTab.sessionId);
    const mobileJournalCheck = await cdp.eval(
      custTab.sessionId,
      `(() => {
        document.getElementById('guidesScreen').scrollTop = 0;
        const formTop = document.getElementById('guideVisitForm').getBoundingClientRect().top;
        return {
          formTop,
          overflowX: document.documentElement.scrollWidth > window.innerWidth
        };
      })()`
    );
    assert.equal(mobileJournalCheck.overflowX, false, 'Mobile Visit Journal must have zero horizontal overflow');
    assert(mobileJournalCheck.formTop < 560, `Expected Log a visit form visible near top on mobile, got top=${mobileJournalCheck.formTop}`);
    await saveScreenshotIfRequested(custTab.sessionId, 'guides-after-journal-mobile.png');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, custTab.sessionId);

    // Private Photos tab: verify imported photo renders authorized thumbnail + capture desktop screenshot
    await cdp.eval(custTab.sessionId, `openLocalGuides('photos')`);
    const photosCheck = await waitForCondition(
      async () =>
        cdp.eval(
          custTab.sessionId,
          `(() => {
            const imgs = [...document.querySelectorAll('#dishPhotoGrid .dish-photo img')];
            if (imgs.length !== 1 || !imgs[0].complete || imgs[0].naturalWidth === 0) return null;
            return {
              countText: document.getElementById('dishPhotoCountBadge')?.textContent || '',
              hasPrivatePill: document.getElementById('dishPhotoGrid').textContent.includes('PRIVATE PHOTO'),
              thumbSrc: imgs[0].getAttribute('src')
            };
          })()`
        ),
      { label: 'Private photo thumbnail loaded via authorized /api/me/photos/file' }
    );
    assert.equal(photosCheck.countText, '1 / 12 saved');
    assert.equal(photosCheck.hasPrivatePill, true);
    assert(photosCheck.thumbSrc.startsWith('/api/me/photos/file?id='));
    await cdp.eval(
      custTab.sessionId,
      `(() => {
        const t = document.getElementById('toast');
        if (t) t.classList.remove('show');
        document.getElementById('guidesScreen').scrollTop = 260;
        return true;
      })()`
    );
    await saveScreenshotIfRequested(custTab.sessionId, 'guides-after-photos-desktop.png');

    // Save a Suggested Trail (`fruta` + `rich`), then log a visit to `fruta` from the saved trail -> progress becomes `1 / 2`!
    await cdp.eval(custTab.sessionId, `openSmart('trail')`);
    await waitForCondition(
      async () => cdp.eval(custTab.sessionId, `Boolean(document.getElementById('smartCraving'))`),
      { label: 'Trail builder ready for User A' }
    );
    await cdp.eval(
      custTab.sessionId,
      `(() => {
        document.getElementById('smartCraving').value = 'sweet';
        buildFoodTrail(new Event('submit'));
        return true;
      })()`
    );
    await waitForCondition(
      async () => cdp.eval(custTab.sessionId, `Boolean(document.getElementById('saveTrailToAccountBtn'))`),
      { label: 'Save trail to account button visible' }
    );
    await cdp.eval(
      custTab.sessionId,
      `(() => {
        document.getElementById('saveTrailTitleInput').value = 'Sonoma Sweet Run';
        document.getElementById('saveTrailToAccountBtn').click();
        return true;
      })()`
    );
    await waitForCondition(
      async () =>
        cdp.eval(
          custTab.sessionId,
          `document.getElementById('mySavedTrailsSection')?.textContent.includes('Sonoma Sweet Run') && document.getElementById('mySavedTrailsSection')?.textContent.includes('0 / ')`
        ),
      { label: 'Saved trail persisted with 0 visited stops initially' }
    );

    // Click `[data-saved-stop-log]` on the first saved stop -> logs visit -> return to `#smartScreen` -> `1 / ... visited`!
    await cdp.eval(
      custTab.sessionId,
      `document.querySelector('#mySavedTrailsSection [data-saved-stop-log]').click()`
    );
    await waitForCondition(
      async () => cdp.eval(custTab.sessionId, `Boolean(document.getElementById('guideVisitSubmitBtn'))`),
      { label: 'Navigated to prefilled Visit journal from saved trail' }
    );
    await cdp.eval(custTab.sessionId, `document.getElementById('guideVisitForm').requestSubmit()`);
    await waitForCondition(
      async () => cdp.eval(custTab.sessionId, `document.getElementById('guideActionMessage')?.textContent.includes('Logged')`),
      { label: 'Saved trail stop visit logged' }
    );
    await cdp.eval(custTab.sessionId, `openSmart('trail')`);
    await waitForCondition(
      async () =>
        cdp.eval(
          custTab.sessionId,
          `document.getElementById('mySavedTrailsSection')?.textContent.includes('1 / ') && document.getElementById('mySavedTrailsSection')?.textContent.includes('✓ Visited')`
        ),
      { label: 'Saved trail progress updated to 1 visited stop' }
    );

    // =========================================================================
    // [4/6] Cross-Session Persistence & Account-Switch Isolation
    // =========================================================================
    // Separate browser context (`separateDeviceTab`) signs in as User A -> retrieves identical visits, photo & saved trail!
    await browserSignIn(separateDeviceTab.sessionId, userAEmail, '/#passport');
    await waitForCondition(
      async () =>
        cdp.eval(
          separateDeviceTab.sessionId,
          `document.getElementById('journalVisitsList')?.textContent.includes('Delicias Elenita') && document.getElementById('journalAchievementsPanel')?.textContent.includes('85 points')`
        ),
      { label: 'Separate browser session retrieved User A exploration history' }
    );

    // Sign out User A in `custTab` and sign in as User B -> User B sees ZERO of User A's cached visits, photos, or trails!
    await cdp.eval(custTab.sessionId, `signOutUser()`);
    await waitForCondition(
      async () => cdp.eval(custTab.sessionId, `!isSignedIn`),
      { label: 'User A signed out' }
    );
    await browserSignIn(custTab.sessionId, userBEmail, '/#passport');
    const userBIsolation = await waitForCondition(
      async () =>
        cdp.eval(
          custTab.sessionId,
          `(() => {
            const vl = document.getElementById('journalVisitsList')?.textContent || '';
            const hdr = document.getElementById('journalAchievementsPanel')?.textContent || '';
            if (!vl.includes('No visits in your journal yet')) return null;
            return {
              zeroPoints: hdr.includes('0 points'),
              leakedElenita: vl.includes('Elenita') || vl.includes('Sebastopol Rd')
            };
          })()`
        ),
      { label: 'User B clean empty journal loaded' }
    );
    assert.equal(userBIsolation.zeroPoints, true);
    assert.equal(userBIsolation.leakedElenita, false, 'Account switch must expose zero previous account data');

    // =========================================================================
    // [5/6] Vendor Marketing Kit Relocated to Authorized Owner Mode
    // =========================================================================
    await browserSignIn(separateDeviceTab.sessionId, ownerEmail, '/');
    await waitForCondition(
      async () => cdp.eval(separateDeviceTab.sessionId, `Boolean(isSignedIn && currentUser)`),
      { label: 'Vendor owner signed in' }
    );
    {
      const migClient = await migratorPool.connect();
      try {
        await migClient.query('BEGIN');
        await migClient.query("SELECT set_config('app.auth_internal', 'true', true), set_config('app.is_platform_admin', 'true', true)");
        await migClient.query(
          `INSERT INTO vendor_memberships (vendor_id, user_id, role, granted_by)
           SELECT 'mitote', id, 'owner', 'bootstrap' FROM auth_users WHERE email_normalized = $1`,
          [ownerEmail]
        );
        await migClient.query('COMMIT');
      } finally {
        migClient.release();
      }
    }
    await cdp.send('Page.navigate', { url: `${baseUrl}/` }, separateDeviceTab.sessionId);
    await waitForCondition(
      async () => cdp.eval(separateDeviceTab.sessionId, `typeof showScreen === 'function' && Array.isArray(trucks) && trucks.length >= 50`),
      { label: 'Vendor owner reloaded app' }
    );
    await cdp.eval(separateDeviceTab.sessionId, `showScreen('owner')`);
    await waitForCondition(
      async () => cdp.eval(separateDeviceTab.sessionId, `Boolean(isOwnerAdmin && document.getElementById('ownerMarketingCard'))`),
      { label: 'Authorized Owner Mode loaded with #ownerMarketingCard' }
    );
    await cdp.eval(separateDeviceTab.sessionId, `openOwnerMarketingKit()`);
    const ownerPromoCheck = await waitForCondition(
      async () =>
        cdp.eval(
          separateDeviceTab.sessionId,
          `document.getElementById('ownerMarketingPanel')?.textContent.includes('Mitote Food Park') || false`
        ),
      { label: 'Vendor Marketing kit rendered inside Owner Mode' }
    );
    assert.equal(ownerPromoCheck, true);

    // =========================================================================
    // [6/6] Top Admin Independent Feature Controls Live Toggle (Zero Empty Tabs / Zero Data Loss)
    // =========================================================================
    await browserSignIn(topTab.sessionId, topEmail, '/admin#features');
    await waitForCondition(
      async () => cdp.eval(topTab.sessionId, `Boolean(document.getElementById('fc-state-private_photos'))`),
      { label: 'Top Admin feature controls loaded' }
    );

    // Hide `private_photos` -> in `custTab`, `[data-guide-tab="photos"]` hides cleanly while Visit journal & Stories tabs remain usable!
    await cdp.eval(
      topTab.sessionId,
      `(() => {
        document.getElementById('fc-state-private_photos').value = 'hidden';
        document.getElementById('fc-reason-private_photos').value = 'E2E test independent private_photos toggle';
        document.getElementById('fc-save-private_photos').click();
        return true;
      })()`
    );
    await waitForCondition(
      async () => cdp.eval(topTab.sessionId, `document.getElementById('fcLiveStatus')?.textContent.includes('Private Account-Backed')`),
      { label: 'Top Admin saved private_photos = hidden' }
    );
    await cdp.eval(custTab.sessionId, `window.bitesharkFeatures.refresh()`);
    const afterHidePhotos = await waitForCondition(
      async () =>
        cdp.eval(
          custTab.sessionId,
          `document.querySelector('[data-guide-tab="photos"]')?.hidden === true && document.querySelector('[data-guide-tab="passport"]')?.hidden === false`
        ),
      { label: 'Customer tab hid only Private photos tab while preserving Visit journal tab' }
    );
    assert.equal(afterHidePhotos, true);

    // Hide parent `local_guides_passport` -> `.bottom-nav .guide-nav` hides and remaining 5 bottom-nav buttons expand cleanly without empty grid slots!
    await cdp.eval(
      topTab.sessionId,
      `(() => {
        document.getElementById('fcLiveStatus').textContent = '';
        document.getElementById('fc-state-local_guides_passport').value = 'hidden';
        document.getElementById('fc-reason-local_guides_passport').value = 'E2E test hub hide bottom-nav layout';
        document.getElementById('fc-save-local_guides_passport').click();
        return true;
      })()`
    );
    await waitForCondition(
      async () => cdp.eval(topTab.sessionId, `document.getElementById('fcLiveStatus')?.textContent.includes('Local Guides')`),
      { label: 'Top Admin hid local_guides_passport' }
    );
    await cdp.eval(custTab.sessionId, `window.bitesharkFeatures.refresh()`);
    const navFillCheck = await waitForCondition(
      async () =>
        cdp.eval(
          custTab.sessionId,
          `(() => {
            const guideNav = document.querySelector('.bottom-nav .guide-nav');
            if (!guideNav || !guideNav.hidden) return null;
            const navRect = document.querySelector('.bottom-nav').getBoundingClientRect();
            const lastBtnRect = document.querySelector('.bottom-nav .surprise-nav').getBoundingClientRect();
            return {
              discoverActive: document.getElementById('discoverScreen').classList.contains('active'),
              rightGapPx: Math.round(navRect.right - lastBtnRect.right)
            };
          })()`
        ),
      { label: 'Customer redirected to Discover and bottom-nav auto-columns filled cleanly' }
    );
    assert.equal(navFillCheck.discoverActive, true);
    assert(navFillCheck.rightGapPx < 340, `Expected remaining 5 nav buttons to distribute evenly without an empty 6th slot, got rightGapPx=${navFillCheck.rightGapPx}`);

    // While `local_guides_passport` and `private_photos` are STILL `hidden`, verify signed-in User A (in a fresh session or `custTab`)
    // can open `#rxExplorationPrivacyModal` from `#profileMenu` (`#rxExplorationPrivacyBtn`)!
    // Sign in as User A on `custTab` while features are hidden -> open privacy modal -> verify User A's saved photo download link + visits + saved trail appear!
    await cdp.eval(custTab.sessionId, `signOutUser()`);
    await waitForCondition(async () => cdp.eval(custTab.sessionId, `!isSignedIn`), { label: 'User B signed out for hidden-mode privacy test' });
    await browserSignIn(custTab.sessionId, userAEmail, '/');
    await waitForCondition(
      async () => cdp.eval(custTab.sessionId, `Boolean(document.getElementById('rxExplorationPrivacyBtn') && !document.getElementById('rxExplorationPrivacyBtn').hidden)`),
      { label: '#rxExplorationPrivacyBtn visible for signed-in user even when exploration hub is hidden' }
    );
    await cdp.eval(custTab.sessionId, `document.getElementById('rxExplorationPrivacyBtn').click()`);
    const privacyModalWhileHidden = await waitForCondition(
      async () =>
        cdp.eval(
          custTab.sessionId,
          `(() => {
            const m = document.getElementById('rxExplorationPrivacyModal');
            if (!m || m.hidden) return null;
            const txt = document.getElementById('epRecordsContainer')?.textContent || '';
            if (!txt.includes('Sonoma Sweet Run')) return null;
            const dlLink = m.querySelector('[data-ep-download-photo]');
            return {
              hasPhotoDownloadLink: Boolean(dlLink && dlLink.getAttribute('href')?.includes('download=1')),
              hasVisitDeleteBtn: Boolean(m.querySelector('[data-ep-ask-del="visit"]')),
              hasPhotoDeleteBtn: Boolean(m.querySelector('[data-ep-ask-del="photo"]')),
              hasTrailDeleteBtn: Boolean(m.querySelector('[data-ep-ask-del="trail"]')),
              hasJsonExportBtn: Boolean(document.getElementById('epDownloadJsonBtn'))
            };
          })()`
        ),
      { label: 'Privacy export & self-service delete modal rendered User A records while features are hidden' }
    );
    assert.deepEqual(privacyModalWhileHidden, {
      hasPhotoDownloadLink: true,
      hasVisitDeleteBtn: true,
      hasPhotoDeleteBtn: true,
      hasTrailDeleteBtn: true,
      hasJsonExportBtn: true
    });
    await cdp.eval(custTab.sessionId, `document.querySelector('[data-rx-close="rxExplorationPrivacyModal"]').click()`);

    // Re-enable parent `local_guides_passport` first, then child `private_photos` (honoring DAG inheritance!)
    for (const key of ['local_guides_passport', 'private_photos']) {
      await cdp.eval(
        topTab.sessionId,
        `(() => {
          document.getElementById('fcLiveStatus').textContent = '';
          document.getElementById('fc-state-${key}').value = 'enabled';
          document.getElementById('fc-reason-${key}').value = 'Restore ${key} after E2E';
          document.getElementById('fc-save-${key}').click();
          return true;
        })()`
      );
      await waitForCondition(
        async () => cdp.eval(topTab.sessionId, `document.getElementById('fc-card-${key}')?.querySelector('.fc-badges')?.textContent.includes('Effective: enabled')`),
        { label: `Restored ${key} to enabled` }
      );
    }

    assert.equal(
      cdp.consoleErrors.length,
      0,
      `Expected zero uncaught page exceptions during browser E2E, got: ${cdp.consoleErrors.join('; ')}`
    );

    console.log(
      'PASS: Headless Chrome + PostgreSQL Customer Exploration E2E (anonymous stories/sweet trails/#trail= links, explicit legacy device migration + partial-invalid recovery, detail prefill visit logging, private photo thumbnails, saved trail visit progress, cross-session persistence, zero cross-account leakage, relocated Owner Mode Marketing kit, independent Feature Controls without empty nav slots, mobile/desktop zero overflow, and zero page exceptions)'
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
})().catch(err => {
  console.error('CUSTOMER EXPLORATION BROWSER E2E FAILURE:', err);
  process.exit(1);
});
