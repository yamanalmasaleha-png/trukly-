// Real Headless Chrome + Real PostgreSQL End-to-End Verification for
// BiteShark Discovery & Listing Cards Presentation, Truthful Status,
// Approved/Broken Image Handling, Responsive Breakpoints, 200% Zoom & Accessibility.

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');

function requirePg() {
  const candidates = [ROOT];
  if (process.env.TRUCKLY_PG_NODE_MODULES) candidates.push(process.env.TRUCKLY_PG_NODE_MODULES);
  for (const base of candidates) {
    try {
      return require(require.resolve('pg', { paths: [base] }));
    } catch {}
  }
  throw new Error('Missing `pg` package. Set TRUCKLY_PG_NODE_MODULES or run `npm ci`.');
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
      const vers = fs.readdirSync(base).filter(v => /^\d+$/.test(v)).sort((a, b) => Number(b) - Number(a));
      for (const v of vers) {
        const candidate = path.join(base, v, 'bin');
        if (fs.existsSync(path.join(candidate, initExe))) return candidate;
      }
    }
  } else {
    const usrLib = '/usr/lib/postgresql';
    if (fs.existsSync(usrLib)) {
      const vers = fs.readdirSync(usrLib).filter(v => /^\d+$/.test(v)).sort((a, b) => Number(b) - Number(a));
      for (const v of vers) {
        const candidate = path.join(usrLib, v, 'bin');
        if (fs.existsSync(path.join(candidate, initExe))) return candidate;
      }
    }
  }
  throw new Error('Set DATABASE_URL or provide PostgreSQL binaries.');
}

async function createPostgresCluster() {
  if (process.env.DATABASE_URL) {
    return { adminUrl: process.env.DATABASE_URL, stop: async () => {} };
  }
  const binDir = findPostgresBinDir();
  const binSuffix = process.platform === 'win32' ? '.exe' : '';
  const initdbExe = path.join(binDir, 'initdb' + binSuffix);
  const pgCtlExe = path.join(binDir, 'pg_ctl' + binSuffix);
  const port = await getFreePort();
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-cards-pg-'));
  const dataDir = path.join(tmpBase, 'data');
  const pwFile = path.join(tmpBase, 'pw.txt');
  const logFile = path.join(tmpBase, 'pg.log');
  const password = 'cards_pw_' + crypto.randomBytes(6).toString('hex');
  fs.writeFileSync(pwFile, password + '\n', 'utf8');

  execFileSync(initdbExe, ['-D', dataDir, '-U', 'postgres', `--pwfile=${pwFile}`, '-A', 'scram-sha-256', '-E', 'UTF8', '--no-locale'], { stdio: 'ignore', windowsHide: true });
  execFileSync(pgCtlExe, ['-D', dataDir, '-l', logFile, '-w', '-o', `-p ${port} -h 127.0.0.1`, 'start'], { stdio: 'ignore', windowsHide: true });

  return {
    adminUrl: `postgres://postgres:${encodeURIComponent(password)}@127.0.0.1:${port}/postgres`,
    stop: async () => {
      try { execFileSync(pgCtlExe, ['-D', dataDir, '-m', 'immediate', '-w', 'stop'], { stdio: 'ignore', windowsHide: true }); } catch {}
      try { fs.rmSync(tmpBase, { recursive: true, force: true }); } catch {}
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
    http.get(url, res => {
      let body = '';
      res.on('data', d => (body += d));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, json: JSON.parse(body) });
        } catch (err) {
          reject(err);
        }
      });
    }).on('error', reject);
  });
}

async function waitForCondition(fn, { timeoutMs = 15000, intervalMs = 100, label = 'condition' } = {}) {
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
    const res = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text || 'Eval error');
    }
    return res.result?.value;
  }
  close() {
    try { this.ws.close(); } catch {}
  }
}

(async () => {
  const chromeBin = findChromeBinary();
  const pgCluster = await createPostgresCluster();
  const suffix = crypto.randomBytes(4).toString('hex');
  const migratorRole = `bs_cards_mig_${suffix}`;
  const migratorPass = `mig_${suffix}`;
  const appRole = `bs_cards_app_${suffix}`;
  const appPass = `app_${suffix}`;
  const dbName = `bs_cards_${suffix}`;

  const adminPool = new Pool({ connectionString: pgCluster.adminUrl, max: 3 });
  let migPool = null;
  let serverProc = null;
  let chromeProc = null;
  let cdp = null;
  let chromeProfileDir = null;

  try {
    await adminPool.query(`CREATE ROLE ${migratorRole} LOGIN PASSWORD '${migratorPass}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`);
    await adminPool.query(`CREATE ROLE ${appRole} LOGIN PASSWORD '${appPass}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`);
    await adminPool.query(`CREATE DATABASE ${dbName} OWNER ${migratorRole}`);

    const migratorDbUrl = buildDbUrl(pgCluster.adminUrl, { user: migratorRole, password: migratorPass, database: dbName });
    const appDbUrl = buildDbUrl(pgCluster.adminUrl, { user: appRole, password: appPass, database: dbName });

    execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'run-migrations.cjs'), '--app-role', appRole], {
      cwd: ROOT,
      env: { ...process.env, MIGRATION_DATABASE_URL: migratorDbUrl },
      stdio: 'pipe',
      windowsHide: true
    });

    migPool = new Pool({ connectionString: migratorDbUrl, max: 3 });

    // Seed real edge cases on disposable DB:
    // 1. Approved photo (`mitote` -> real local `/icon-192.png` with `photo_rights_verified = true`)
    // 2. Broken approved photo (`faron` -> `/nonexistent-approved-photo-404.png` with `photo_rights_verified = true`)
    // 3. Unverified external stock photo (`jalapeno` -> Unsplash URL with `photo_rights_verified = false` -> must NOT render `<img>`)
    // 4. Expired live location (`ross`), active owner live pin (`iniguez`), closed today (`jalapeno`), scheduled open (`mitote`)
    await migPool.query(
      `UPDATE vendors
       SET photo = '/icon-192.png', photo_rights_verified = true
       WHERE id = 'mitote'`
    );
    await migPool.query(
      `UPDATE vendors
       SET photo = '/nonexistent-approved-photo-404.png', photo_rights_verified = true
       WHERE id = 'faron'`
    );
    await migPool.query(
      `UPDATE vendors
       SET photo = 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47', photo_rights_verified = false
       WHERE id = 'jalapeno'`
    );
    await migPool.query(
      `INSERT INTO owner_schedule (truck_id, service_date, opens_at, closes_at, status, location)
       VALUES ('mitote', (now() AT TIME ZONE 'America/Los_Angeles')::date, '00:00', '23:59', 'scheduled', '100 Sebastopol Rd, Santa Rosa'),
              ('jalapeno', (now() AT TIME ZONE 'America/Los_Angeles')::date, '11:00', '19:00', 'unavailable', '1630 Sebastopol Rd, Santa Rosa')
       ON CONFLICT (truck_id, service_date) DO NOTHING`
    );
    await migPool.query(
      `INSERT INTO truck_settings (truck_id, location, lat, lng, location_source, location_accuracy, is_open, opens_at, closes_at, observed_at, expires_at)
       VALUES ('iniguez', 'Courthouse Square, Downtown Santa Rosa — North Lawn by Fourth Street', 38.4404, -122.7141, 'owner_reported', 'owner_reported_coords', true, '00:00', '23:59', now(), now() + interval '4 hours'),
              ('ross', 'Ross Street, Downtown Santa Rosa', 38.4412, -122.7138, 'owner_reported', 'owner_reported_coords', false, '11:00', '14:00', now() - interval '9 hours', now() - interval '1 hour')
       ON CONFLICT (truck_id) DO NOTHING`
    );

    const appPort = await getFreePort();
    const baseUrl = `http://127.0.0.1:${appPort}`;
    serverProc = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
      cwd: ROOT,
      env: {
        ...process.env,
        HOST: '127.0.0.1',
        PORT: String(appPort),
        DATABASE_URL: appDbUrl,
        BITESHARK_ENV: 'staging',
        BITESHARK_RELEASE_SHA: 'e2e-cards-ux',
        BITESHARK_AUTH_SECRET: crypto.randomBytes(32).toString('hex'),
        BITESHARK_AUTH_DELIVERY_MODE: 'staging_mailbox',
        BITESHARK_STAGING_MAILBOX_SECRET: 'mbx_' + crypto.randomBytes(12).toString('hex'),
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
      { label: 'server ready' }
    );

    let versionInfo = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const cdpPort = await getFreePort();
      chromeProfileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-cards-chrome-'));
      chromeProc = spawn(
        chromeBin,
        [
          '--headless=new',
          '--no-sandbox',
          '--disable-gpu',
          '--disable-dev-shm-usage',
          '--no-first-run',
          `--user-data-dir=${chromeProfileDir}`,
          `--remote-debugging-port=${cdpPort}`,
          'about:blank'
        ],
        { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true }
      );
      try {
        versionInfo = await waitForCondition(
          async () => {
            const r = await httpGetJson(`http://127.0.0.1:${cdpPort}/json/version`);
            return r.status === 200 && r.json.webSocketDebuggerUrl ? r.json : null;
          },
          { timeoutMs: 12000, label: 'Chrome DevTools' }
        );
        break;
      } catch (e) {
        try { chromeProc.kill('SIGKILL'); } catch {}
        try { fs.rmSync(chromeProfileDir, { recursive: true, force: true }); } catch {}
        if (attempt === 3) throw e;
      }
    }

    cdp = new CdpClient(versionInfo.webSocketDebuggerUrl);
    await cdp.connect();

    const { browserContextId } = await cdp.send('Target.createBrowserContext');
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank', browserContextId });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Runtime.enable', {}, sessionId);
    await cdp.send('Network.enable', {}, sessionId);
    await cdp.send('Network.setBlockedURLs', { urls: ['*://tile.openstreetmap.org/*', '*://unpkg.com/*'] }, sessionId);
    await cdp.send('Network.setCookie', { name: 'bs_start_pref', value: 'customer', url: baseUrl, path: '/' }, sessionId);

    // 1. Desktop 1280x900 verification: structure, density, truthful text, image handling, zero overlap
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
    await cdp.send('Page.navigate', { url: `${baseUrl}/` }, sessionId);

    await waitForCondition(
      () => cdp.eval(sessionId, `document.getElementById('discoverScreen')?.classList.contains('active') && document.querySelectorAll('#truckCards .truck-card').length === 59`),
      { label: '59 unified cards rendered' }
    );
    // Verify below-the-fold `faron` (`index >= 6`) uses `loading="lazy"`, then scroll it into view to trigger load + 404 fallback
    const lazyAttr = await cdp.eval(
      sessionId,
      `document.querySelector('.truck-card[data-truck-id="faron"] .truck-photo-img')?.getAttribute('loading')`
    );
    assert.equal(lazyAttr, 'lazy', 'Below-the-fold approved images use loading="lazy"');
    await cdp.eval(
      sessionId,
      `document.querySelector('.truck-card[data-truck-id="faron"]')?.scrollIntoView({ block: 'center', behavior: 'instant' }); true;`
    );
    await waitForCondition(
      () =>
        cdp.eval(
          sessionId,
          `(() => {
            const faronSlot = document.querySelector('.truck-card[data-truck-id="faron"] .truck-photo');
            const mitoteImg = document.querySelector('.truck-card[data-truck-id="mitote"] .truck-photo-img');
            return Boolean(faronSlot && faronSlot.classList.contains('icon-photo') && mitoteImg && mitoteImg.complete && mitoteImg.naturalWidth > 0);
          })()`
        ),
      { label: 'approved image loaded and 404 image fell back cleanly' }
    );
    await cdp.eval(sessionId, `document.getElementById('truckSheet').scrollTop = 0; true;`);

    const desktopAudit = await cdp.eval(
      sessionId,
      `(() => {
        const cards = [...document.querySelectorAll('#truckCards .truck-card')];
        const fullText = document.getElementById('truckCards').textContent || '';
        const nestedInteractiveCount = document.querySelectorAll('#truckCards button button, #truckCards button a, #truckCards a button').length;
        const legacySpotlightInCards = document.querySelectorAll('#truckCards .truckly-spotlight').length;

        let maxCardHeight = 0;
        let ordinaryHeights = [];
        let overlapErrors = [];
        let smallTargetErrors = [];

        for (const card of cards) {
          const id = card.dataset.truckId;
          const rCard = card.getBoundingClientRect();
          if (rCard.height > maxCardHeight) maxCardHeight = rCard.height;
          if (!card.querySelector('.truck-card-highlight')) {
            ordinaryHeights.push(rCard.height);
          }
          const title = card.querySelector('.truck-card-title');
          const sub = card.querySelector('.truck-card-sub');
          const heart = card.querySelector('.heart');
          const detailBtn = card.querySelector('.detail-link');
          const thumb = card.querySelector('.truck-photo');

          if (!title || !sub || !heart || !detailBtn || !thumb) {
            overlapErrors.push(id + ':missing-subelement');
            continue;
          }
          const rHeart = heart.getBoundingClientRect();
          const rTitle = title.getBoundingClientRect();
          const rSub = sub.getBoundingClientRect();
          const rDetail = detailBtn.getBoundingClientRect();
          const rThumb = thumb.getBoundingClientRect();

          // Heart must never overlap title or category/town line
          const overlaps = (a, b) => !(a.right <= b.left + 1 || a.left >= b.right - 1 || a.bottom <= b.top + 1 || a.top >= b.bottom - 1);
          if (overlaps(rTitle, rHeart)) overlapErrors.push(id + ':title-overlaps-heart');
          if (overlaps(rSub, rHeart)) overlapErrors.push(id + ':sub-overlaps-heart');

          // Touch targets >= 44px
          if (rHeart.width < 43.5 || rHeart.height < 43.5) {
            smallTargetErrors.push(id + ':heart-' + Math.round(rHeart.width) + 'x' + Math.round(rHeart.height));
          }
          if (rDetail.height < 43.5) {
            smallTargetErrors.push(id + ':detail-h-' + Math.round(rDetail.height));
          }
          // Square thumbnail (~96-112px desktop)
          if (Math.abs(rThumb.width - rThumb.height) > 1.5 || rThumb.width < 90 || rThumb.width > 116) {
            overlapErrors.push(id + ':thumb-' + Math.round(rThumb.width) + 'x' + Math.round(rThumb.height));
          }
        }

        // Check row alignment: side-by-side cards in each row share top Y and title top Y
        let rowAlignMismatches = 0;
        for (let i = 0; i + 1 < cards.length; i += 2) {
          const topA = cards[i].querySelector('.truck-card-title').getBoundingClientRect().top;
          const topB = cards[i + 1].querySelector('.truck-card-title').getBoundingClientRect().top;
          if (Math.abs(topA - topB) > 1.5) rowAlignMismatches++;
        }

        const jalapenoHasImg = Boolean(document.querySelector('.truck-card[data-truck-id="jalapeno"] .truck-photo-img'));
        const faronImgHidden = document.querySelector('.truck-card[data-truck-id="faron"] .truck-photo-img')?.hidden === true;
        const belowFoldLazy = document.querySelector('.truck-card[data-truck-id="coffee-crooks"] .truck-photo') !== null;

        const avgOrdinaryHeight = Math.round(ordinaryHeights.reduce((a, b) => a + b, 0) / ordinaryHeights.length);
        return {
          cardCount: cards.length,
          nestedInteractiveCount,
          legacySpotlightInCards,
          hasUndefinedOrNull: /\bundefined\b|\bnull\b/i.test(fullText),
          hasResearchPendingOnCard: /dish and photo research pending/i.test(fullText),
          hasBookableClaimOnCard: /\bbookable\b/i.test(fullText),
          hasMenuAndInfoFiller: /menu & info/i.test(fullText),
          hasAccurateDetailCta: cards.every(c => (c.querySelector('.detail-link')?.textContent || '').includes('View details & hours')),
          avgOrdinaryHeight,
          maxCardHeight: Math.round(maxCardHeight),
          overlapErrors,
          smallTargetErrors,
          rowAlignMismatches,
          jalapenoHasImg,
          faronImgHidden,
          belowFoldLazy,
          rossExpiredText: document.querySelector('.truck-card[data-truck-id="ross"]')?.textContent || '',
          mitoteScheduledText: document.querySelector('.truck-card[data-truck-id="mitote"]')?.textContent || '',
          jalapenoClosedText: document.querySelector('.truck-card[data-truck-id="jalapeno"]')?.textContent || '',
          crooksCardText: document.querySelector('.truck-card[data-truck-id="coffee-crooks"]')?.textContent || '',
          rotiCardText: document.querySelector('.truck-card[data-truck-id="market-roti"]')?.textContent || '',
          longNameCardText: document.querySelector('.truck-card[data-truck-id="market-sr-original"]')?.textContent || ''
        };
      })()`
    );

    assert.equal(desktopAudit.cardCount, 59, 'All 59 primary + neighborhood listings rendered with unified component');
    assert.equal(desktopAudit.nestedInteractiveCount, 0, 'Zero nested interactive elements');
    assert.equal(desktopAudit.legacySpotlightInCards, 0, 'Zero disconnected .truckly-spotlight boxes in #truckCards');
    assert.equal(desktopAudit.hasUndefinedOrNull, false, 'Zero raw undefined/null strings');
    assert.equal(desktopAudit.hasResearchPendingOnCard, false, 'No DISH AND PHOTO RESEARCH PENDING on cards');
    assert.equal(desktopAudit.hasBookableClaimOnCard, false, 'No BOOKABLE badge claims on cards');
    assert.equal(desktopAudit.hasMenuAndInfoFiller, false, 'Redundant Menu & info filler removed');
    assert.equal(desktopAudit.hasAccurateDetailCta, true, 'All 59 cards use accurate View details & hours CTA');
    assert.deepEqual(desktopAudit.overlapErrors, [], 'Zero title/subtitle/heart overlaps or non-square thumbnails');
    assert.deepEqual(desktopAudit.smallTargetErrors, [], 'All favorite & detail controls meet >= 44px touch target');
    assert.equal(desktopAudit.rowAlignMismatches, 0, 'Business names align cleanly across 2-column rows');
    assert(
      desktopAudit.avgOrdinaryHeight >= 136 && desktopAudit.avgOrdinaryHeight <= 182,
      `Expected compact ordinary desktop card height (~144-176px), got ${desktopAudit.avgOrdinaryHeight}px`
    );
    assert.equal(desktopAudit.jalapenoHasImg, false, 'Unverified Unsplash photo suppressed');
    assert.equal(desktopAudit.faronImgHidden, true, 'Broken 404 image hidden and replaced by illustration fallback');
    assert(desktopAudit.rossExpiredText.includes('Past pin expired'), 'Expired location labeled truthfully');
    assert(desktopAudit.mitoteScheduledText.includes('● SCHEDULED'), 'Scheduled open status preserved');
    assert(desktopAudit.jalapenoClosedText.includes('○ CLOSED TODAY'), 'Closed today status preserved');
    assert(desktopAudit.crooksCardText.includes('Crème Brûlée Latte'), 'Sourced highlight preserved as 1-line note');
    console.log(`✓ [1/4] Desktop structure, density (avg ${desktopAudit.avgOrdinaryHeight}px), images & truthful status verified`);

    // 2. Interaction, Favorites Isolation, Detail Provenance Preservation, Scroll & Keyboard Focus Return
    const interactionCheck = await cdp.eval(
      sessionId,
      `(async () => {
        const sheet = document.getElementById('truckSheet');
        const targetCard = document.querySelector('.truck-card[data-truck-id="coffee-crooks"]');
        targetCard.scrollIntoView({ block: 'center', behavior: 'instant' });
        const scrollBefore = sheet.scrollTop;

        // Focus favorite button via keyboard and toggle -> must NOT open detail modal and must retain focus on heart
        const heartBtn = targetCard.querySelector('.heart');
        heartBtn.focus();
        heartBtn.click();
        await new Promise(r => setTimeout(r, 60));

        const modalOpenedOnFav = document.getElementById('detailModal').classList.contains('show');
        const reRenderedHeart = document.querySelector('#truckCards .truck-card[data-truck-id="coffee-crooks"] .heart');
        const heartPressedAfter = reRenderedHeart?.getAttribute('aria-pressed');
        const heartRetainedFocus = document.activeElement === reRenderedHeart;

        // Now focus detail button on coffee-crooks, open detail, verify provenance spotlight IS in detail modal, then Escape
        const detailBtn = document.querySelector('#truckCards .truck-card[data-truck-id="coffee-crooks"] .detail-link');
        detailBtn.focus();
        detailBtn.click();
        await new Promise(r => setTimeout(r, 60));

        const modalOpen = document.getElementById('detailModal').classList.contains('show');
        const hasDetailSpotlight = Boolean(document.querySelector('#detailContent .truckly-spotlight'));
        const detailTitle = document.getElementById('detailDialogTitle')?.textContent || '';

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        await new Promise(r => setTimeout(r, 60));

        const modalClosedAfterEsc = !document.getElementById('detailModal').classList.contains('show');
        const focusRestoredToCardDetail = document.activeElement === detailBtn;
        const scrollPreserved = Math.abs(sheet.scrollTop - scrollBefore) <= 4;

        // Verify Saved Places screen uses the same unified .truck-card component
        showScreen('favorites');
        const savedCardCount = document.querySelectorAll('#favoriteGrid .truck-card').length;
        showScreen('discover');

        return {
          modalOpenedOnFav,
          heartPressedAfter,
          heartRetainedFocus,
          modalOpen,
          hasDetailSpotlight,
          detailTitle,
          modalClosedAfterEsc,
          focusRestoredToCardDetail,
          scrollPreserved,
          savedCardCount
        };
      })()`
    );

    assert.equal(interactionCheck.modalOpenedOnFav, false, 'Favoriting must never open the detail modal');
    assert.equal(interactionCheck.heartPressedAfter, 'true', 'Favorite button updates aria-pressed="true"');
    assert.equal(interactionCheck.heartRetainedFocus, true, 'Keyboard focus remains on favorite button across re-render');
    assert.equal(interactionCheck.modalOpen, true, 'Detail button opens detail modal');
    assert.equal(interactionCheck.hasDetailSpotlight, true, 'Researched dish & photo-rights provenance preserved in detail modal');
    assert.equal(interactionCheck.detailTitle, 'Crooks Coffee', 'Correct listing detail opened');
    assert.equal(interactionCheck.modalClosedAfterEsc, true, 'Escape closes detail modal');
    assert.equal(interactionCheck.focusRestoredToCardDetail, true, 'Focus restored to triggering card detail button');
    assert.equal(interactionCheck.scrollPreserved, true, 'Discovery list scroll position preserved after closing detail');
    assert.equal(interactionCheck.savedCardCount, 1, 'Saved Places renders unified .truck-card component');
    console.log('✓ [2/4] Keyboard focus, favorite toggle isolation, detail provenance & scroll preservation verified');

    // 3. Responsive Breakpoints (360px, 390px, 768px, 1280px) & 200% Zoom Reflow
    for (const vp of [
      { width: 360, height: 800, dpr: 2, mobile: true, expectedCols: 1, label: '360px narrow mobile' },
      { width: 390, height: 844, dpr: 2, mobile: true, expectedCols: 1, label: '390px mobile' },
      { width: 640, height: 450, dpr: 2, mobile: false, expectedCols: 1, label: '200% zoom desktop (640x450 CSS px)' },
      { width: 1024, height: 768, dpr: 1, mobile: false, expectedCols: 2, label: '1024px landscape tablet' },
      { width: 1280, height: 900, dpr: 1, mobile: false, expectedCols: 2, label: '1280px desktop' }
    ]) {
      await cdp.send(
        'Emulation.setDeviceMetricsOverride',
        { width: vp.width, height: vp.height, deviceScaleFactor: vp.dpr, mobile: vp.mobile },
        sessionId
      );
      await new Promise(r => setTimeout(r, 100));
      const check = await cdp.eval(
        sessionId,
        `(() => {
          const docOverflow = document.documentElement.scrollWidth - window.innerWidth;
          const cards = [...document.querySelectorAll('#truckCards .truck-card')];
          const firstTop = Math.round(cards[0].getBoundingClientRect().top);
          const secondTop = Math.round(cards[1].getBoundingClientRect().top);
          const cols = Math.abs(firstTop - secondTop) <= 4 ? 2 : 1;
          let anyCardHorizontalOverflow = false;
          let anyHeartOverlap = false;
          for (const c of cards.slice(0, 16)) {
            if (c.scrollWidth > c.clientWidth + 2) anyCardHorizontalOverflow = true;
            const rt = c.querySelector('.truck-card-title').getBoundingClientRect();
            const rs = c.querySelector('.truck-card-sub').getBoundingClientRect();
            const rh = c.querySelector('.heart').getBoundingClientRect();
            const ov = (a, b) => !(a.right <= b.left + 1 || a.left >= b.right - 1 || a.bottom <= b.top + 1 || a.top >= b.bottom - 1);
            if (ov(rt, rh) || ov(rs, rh)) anyHeartOverlap = true;
          }
          return { docOverflow, cols, anyCardHorizontalOverflow, anyHeartOverlap };
        })()`
      );
      assert(check.docOverflow <= 1, `Zero document horizontal overflow at ${vp.label} (got ${check.docOverflow}px)`);
      assert.equal(check.cols, vp.expectedCols, `Expected ${vp.expectedCols} column(s) at ${vp.label}`);
      assert.equal(check.anyCardHorizontalOverflow, false, `Zero card overflow at ${vp.label}`);
      assert.equal(check.anyHeartOverlap, false, `Zero heart overlap at ${vp.label}`);
    }
    console.log('✓ [3/4] Responsive columns, 360px/390px mobile & 200% zoom reflow verified');

    // 4. Search, Filtering, Map/List Switch & Feature-Disabled Booking CTA Check
    const fcClient = await migPool.connect();
    try {
      await fcClient.query('BEGIN');
      await fcClient.query(`SELECT set_config('app.is_platform_admin', 'true', true)`);
      await fcClient.query(
        `INSERT INTO feature_controls (feature_key, configured_state, audience, revision, updated_by, reason)
         VALUES ('event_inquiries', 'hidden', 'all', 2, 'test_admin', 'Pilot inquiries disabled test')
         ON CONFLICT (feature_key) DO UPDATE SET configured_state = 'hidden', revision = feature_controls.revision + 1`
      );
      await fcClient.query('COMMIT');
    } finally {
      fcClient.release();
    }
    const featureAndFilterCheck = await cdp.eval(
      sessionId,
      `(async () => {
        await window.bitesharkFeatures.refresh();
        openDetail('iniguez');
        const bookBtn = document.querySelector('#detailContent button[onclick*="openBooking"]');
        const bookBtnHiddenWhenDisabled = !bookBtn || bookBtn.hidden === true;
        closeModal();

        document.getElementById('searchInput').value = 'Iñiguez';
        applyFilters();
        const searchCount = document.querySelectorAll('#truckCards .truck-card').length;
        resetFilters();
        const resetCount = document.querySelectorAll('#truckCards .truck-card').length;

        setMode('map');
        const inMapMode = !document.getElementById('discoverScreen').classList.contains('list-mode');
        setMode('list');
        const backInListMode = document.getElementById('discoverScreen').classList.contains('list-mode');

        return { bookBtnHiddenWhenDisabled, searchCount, resetCount, inMapMode, backInListMode };
      })()`
    );
    assert.equal(featureAndFilterCheck.bookBtnHiddenWhenDisabled, true, 'Booking CTA hidden when event_inquiries feature is disabled');
    assert.equal(featureAndFilterCheck.searchCount, 1, 'Unicode search filter works');
    assert.equal(featureAndFilterCheck.resetCount, 59, 'Reset filters restores all 59 cards');
    assert.equal(featureAndFilterCheck.inMapMode, true, 'Map mode switch intact');
    assert.equal(featureAndFilterCheck.backInListMode, true, 'List mode switch intact');
    console.log('✓ [4/4] Feature controls, search/filtering & Map/List switching verified');

    console.log('\nDISCOVERY CARDS UX & ACCESSIBILITY BROWSER E2E PASSED.');
  } finally {
    if (cdp) cdp.close();
    if (chromeProc) try { chromeProc.kill('SIGKILL'); } catch {}
    if (serverProc) try { serverProc.kill('SIGTERM'); } catch {}
    if (migPool) await migPool.end().catch(() => {});
    await adminPool.end().catch(() => {});
    await pgCluster.stop();
    if (chromeProfileDir) try { fs.rmSync(chromeProfileDir, { recursive: true, force: true }); } catch {}
  }
})().catch(err => {
  console.error('DISCOVERY CARDS E2E FAILURE:', err);
  process.exitCode = 1;
});
