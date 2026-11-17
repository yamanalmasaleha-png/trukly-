// Real Headless Chrome + Real PostgreSQL End-to-End Test for Pickup-Pager Notifications:
//   NOTE: Exercises real Chromium DOM, real `/sw.js` Service Worker registration,
//   real CDP Notification permission states, WebCrypto P-256 subscription keys,
//   PostgreSQL outbox + worker delivery to a local loopback Web Push receiver,
//   foreground updates, URL hash scrubbing, `/#pager-ref=` resolution, and unsubscribe.
//   (Physical-device OS lock-screen APNs/FCM push delivery is tracked separately and
//   never claimed from headless browser automation.)

const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const os = require('node:os');
const http = require('node:http');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

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
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'truckly-pnotif-e2e-'));
  const dataDir = path.join(tmpBase, 'data');
  const pwFile = path.join(tmpBase, 'pw.txt');
  const logFile = path.join(tmpBase, 'postgres.log');
  const password = 'truckly_pne2e_' + crypto.randomBytes(6).toString('hex');
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
      this.ws.addEventListener('error', e => reject(e.error || new Error('CDP error')), { once: true });
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
      throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text || 'Eval failed');
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
  const webpushCrypto = await import(pathToFileURL(path.join(ROOT, 'lib', 'webpush-crypto.js')).href);
  const vapid = webpushCrypto.generateVapidKeys();
  const workerSecret = 'e2e_worker_secret_' + crypto.randomBytes(16).toString('hex');

  const chromeBin = findChromeBinary();
  const pgCluster = await createPostgresCluster();
  const suffix = crypto.randomBytes(4).toString('hex');
  const appRole = `truckly_pne2e_app_${suffix}`;
  const appPass = `pw_${suffix}`;
  const dbName = `truckly_pne2e_${suffix}`;

  const adminPool = new Pool({ connectionString: pgCluster.adminUrl, max: 4 });
  let appPool = null;
  let pushReceiver = null;
  let serverProc = null;
  let chromeProc = null;
  let cdp = null;
  let chromeProfileDir = null;

  const receivedPushEnvelopes = [];

  try {
    await adminPool.query(`CREATE ROLE ${appRole} LOGIN PASSWORD '${appPass}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`);
    await adminPool.query(`CREATE DATABASE ${dbName} OWNER ${appRole}`);

    const appDbUrl = buildDbUrl(pgCluster.adminUrl, { user: appRole, password: appPass, database: dbName });
    appPool = new Pool({ connectionString: appDbUrl, max: 6 });

    const migFiles = fs
      .readdirSync(path.join(ROOT, 'migrations'))
      .filter(f => /^\d{3}_.+\.sql$/.test(f))
      .sort();
    for (const f of migFiles) {
      await appPool.query(fs.readFileSync(path.join(ROOT, 'migrations', f), 'utf8'));
    }

    await appPool.query(
      `INSERT INTO platform_roles (user_id, role, granted_by) VALUES ('usr_platform_admin', 'platform_admin', 'bootstrap')`
    );
    await appPool.query(
      `INSERT INTO vendor_memberships (vendor_id, user_id, role, granted_by) VALUES
         ('iniguez', 'usr_vendor_a_owner', 'owner', 'usr_platform_admin'),
         ('iniguez', 'usr_vendor_a_staff', 'staff', 'usr_vendor_a_owner')`
    );

    // Start local loopback Web Push receiver
    const pushPort = await getFreePort();
    pushReceiver = http.createServer(async (req, res) => {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      receivedPushEnvelopes.push({
        url: req.url,
        headers: req.headers,
        body: Buffer.concat(chunks)
      });
      res.writeHead(201);
      res.end();
    });
    await new Promise(r => pushReceiver.listen(pushPort, '127.0.0.1', r));

    // Start Truckly local server backed by real PostgreSQL + loopback_test Web Push mode
    const appPort = await getFreePort();
    const baseUrl = `http://127.0.0.1:${appPort}`;
    serverProc = spawn(process.execPath, [path.join(ROOT, 'scripts', 'dev-server.cjs')], {
      cwd: ROOT,
      env: {
        ...process.env,
        PORT: String(appPort),
        DATABASE_URL: appDbUrl,
        TRUCKLY_PUSH_PROVIDER_MODE: 'loopback_test',
        TRUCKLY_VAPID_PUBLIC_KEY: vapid.publicKey,
        TRUCKLY_VAPID_PRIVATE_KEY: vapid.privateKey,
        TRUCKLY_VAPID_SUBJECT: 'mailto:e2e@truckly.test',
        TRUCKLY_NOTIFICATION_WORKER_SECRET: workerSecret
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });

    await waitForCondition(
      async () => {
        const r = await httpGetJson(`${baseUrl}/api/trucks?summary=1`);
        return r.status === 200 && r.json.total === 59;
      },
      { label: 'dev-server startup' }
    );

    // Launch real headless Chrome
    const cdpPort = await getFreePort();
    chromeProfileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'truckly-chrome-pne2e-'));
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
      { label: 'Chrome DevTools' }
    );
    console.log(`Connected to headless browser: ${versionInfo.Browser}`);

    cdp = new CdpClient(versionInfo.webSocketDebuggerUrl);
    await cdp.connect();

    const { browserContextId: customerCtx } = await cdp.send('Target.createBrowserContext');
    const { targetId: customerTarget } = await cdp.send('Target.createTarget', {
      url: 'about:blank',
      browserContextId: customerCtx
    });
    const { sessionId } = await cdp.send('Target.attachToTarget', {
      targetId: customerTarget,
      flatten: true
    });
    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Runtime.enable', {}, sessionId);
    await cdp.send('Network.enable', {}, sessionId);
    await cdp.send('Network.setBlockedURLs', { urls: ['*://tile.openstreetmap.org/*'] }, sessionId);

    // Track any `/api/pager/*` requests fired by the browser
    const pagerApiCalls = [];
    cdp.ws.addEventListener('message', ev => {
      try {
        const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
        if (msg.sessionId === sessionId && msg.method === 'Network.requestWillBeSent') {
          const u = msg.params?.request?.url || '';
          if (u.includes('/api/pager/')) pagerApiCalls.push(u);
        }
      } catch {}
    });

    // Shim PushManager.subscribe in headless Chrome (which has no Google FCM daemon) to generate
    // genuine WebCrypto P-256 ECDH keys + 16-byte auth secret aimed at our loopback push receiver,
    // while keeping real `navigator.serviceWorker.register('/sw.js')` and real CDP Notification permissions!
    await cdp.send(
      'Page.addScriptToEvaluateOnNewDocument',
      {
        source: `(() => {
          let currentSub = null;
          function toB64Url(bytes) {
            let bin = '';
            const arr = new Uint8Array(bytes);
            for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
            return btoa(bin).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/g, '');
          }
          if (typeof PushManager !== 'undefined') {
            PushManager.prototype.getSubscription = async function() {
              return currentSub;
            };
            PushManager.prototype.subscribe = async function(opts) {
              if (!opts || opts.userVisibleOnly !== true || !opts.applicationServerKey) {
                throw new Error('userVisibleOnly and applicationServerKey required');
              }
              const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
              const rawPub = await crypto.subtle.exportKey('raw', kp.publicKey);
              const authBytes = crypto.getRandomValues(new Uint8Array(16));
              const endpoint = 'http://127.0.0.1:${pushPort}/browser-push/' + crypto.randomUUID();
              const subObj = {
                endpoint,
                expirationTime: null,
                toJSON() {
                  return {
                    endpoint,
                    keys: {
                      p256dh: toB64Url(rawPub),
                      auth: toB64Url(authBytes)
                    }
                  };
                },
                async unsubscribe() {
                  currentSub = null;
                  return true;
                }
              };
              currentSub = subObj;
              return subObj;
            };
          }
        })()`
      },
      sessionId
    );

    // =========================================================================
    // [E2E 1/4] Sample Pager Demo Makes ZERO `/api/pager/*` Calls & Shows No Push Prompt
    // =========================================================================
    await cdp.send('Page.navigate', { url: `${baseUrl}/` }, sessionId);
    await waitForCondition(
      () => cdp.eval(sessionId, `Boolean(window.trucklyReady && typeof startPagerDemo === 'function')`),
      { label: 'Truckly ready' }
    );

    const demoResult = await cdp.eval(
      sessionId,
      `(() => {
        startPagerDemo();
        const hasPushPanelInCooking = Boolean(document.getElementById('pagerPushPanel'));
        pagerAdvanceDemo();
        pagerAdvanceDemo(); // ready
        const readyHtml = document.getElementById('pagerDisplay')?.innerHTML || '';
        const hasPushPanelInReady = Boolean(document.getElementById('pagerPushPanel'));
        pagerLeaveDemo();
        return { hasPushPanelInCooking, hasPushPanelInReady, readyHtml };
      })()`
    );
    assert.equal(demoResult.hasPushPanelInCooking, false, 'demo pager renders zero push prompts');
    assert.equal(demoResult.hasPushPanelInReady, false, 'demo ready stage renders zero push prompts');
    assert(demoResult.readyHtml.includes('PLAY MODE · NOT A REAL ORDER'));
    assert.equal(pagerApiCalls.length, 0, 'sample pager demo triggered zero /api/pager/* requests');
    console.log('PASS [E2E 1/4]: Sample pager demo remains 100% isolated with zero backend/push activity');

    // =========================================================================
    // [E2E 2/4] Real Pager Join -> Hash Scrubbed -> Opt-In -> Ready -> Encrypted Push + UI Sync -> Unsubscribe
    // =========================================================================
    // Create a real pager via Vendor A staff API
    const createRes = await fetch(`${baseUrl}/api/pager/staff`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-truckly-debug-role': 'vendor_a_staff'
      },
      body: JSON.stringify({
        vendor_id: 'iniguez',
        ticket: '42',
        request_key: crypto.randomUUID()
      })
    });
    const createdJson = await createRes.json();
    assert.equal(createRes.status, 201);
    const realPagerId = createdJson.pager.id;

    // Grant notification permission in customer context via CDP (simulating user clicking Allow on prompt)
    await cdp.send(
      'Browser.grantPermissions',
      {
        origin: baseUrl,
        permissions: ['notifications'],
        browserContextId: customerCtx
      }
    );

    // Customer opens private link `/#pager=<uuid>`
    await cdp.send('Page.navigate', { url: `${baseUrl}/#pager=${realPagerId}` }, sessionId);

    const joinedState = await waitForCondition(
      () =>
        cdp.eval(
          sessionId,
          `(() => {
            const panel = document.getElementById('pagerPushPanel');
            if (!panel || pagerStatus !== 'cooking') return null;
            return {
              currentHash: location.hash,
              pushState: panel.dataset.pushState,
              btnText: document.getElementById('pagerSubscribeBtn')?.textContent || ''
            };
          })()`
        ),
      { label: 'Real pager cooking + push prompt render' }
    );
    assert.equal(joinedState.currentHash, '', 'private #pager=<uuid> immediately scrubbed from location.hash');
    assert.equal(joinedState.pushState, 'prompt');
    assert(joinedState.btnText.includes('Notify me when ready'));

    // Customer clicks "Notify me when ready"
    await cdp.eval(sessionId, `document.getElementById('pagerSubscribeBtn').click(); true;`);

    const subscribedState = await waitForCondition(
      () =>
        cdp.eval(
          sessionId,
          `(() => {
            const panel = document.getElementById('pagerPushPanel');
            if (!panel || panel.dataset.pushState !== 'subscribed') return null;
            const localRec = getLocalPagerSub(pagerToken);
            return {
              pushState: panel.dataset.pushState,
              subscriptionId: localRec?.subscription_id || null,
              hasSwController: Boolean(navigator.serviceWorker)
            };
          })()`
        ),
      { label: 'Customer subscribed state' }
    );
    assert.equal(subscribedState.pushState, 'subscribed');
    assert(subscribedState.subscriptionId, 'local subscription_id saved');

    // Verify `/sw.js` registered cleanly and does NOT cache `/api/*` responses (`caches.keys()` is empty)
    const swCheck = await cdp.eval(
      sessionId,
      `(async () => {
        const reg = await navigator.serviceWorker.getRegistration('/');
        const cacheKeys = typeof caches !== 'undefined' ? await caches.keys() : [];
        return {
          hasActiveSw: Boolean(reg && (reg.active || reg.installing || reg.waiting)),
          cacheCount: cacheKeys.length
        };
      })()`
    );
    assert.equal(swCheck.hasActiveSw, true, '/sw.js Service Worker registered');
    assert.equal(swCheck.cacheCount, 0, 'Service Worker stores zero API caches');

    // Vendor A marks Ticket #42 READY + bounded worker runs
    const markReadyRes = await fetch(`${baseUrl}/api/pager/update`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-truckly-debug-role': 'vendor_a_staff'
      },
      body: JSON.stringify({ id: realPagerId, status: 'ready' })
    });
    assert.equal(markReadyRes.status, 200);

    const workerRes = await fetch(`${baseUrl}/api/pager/worker`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${workerSecret}`
      },
      body: JSON.stringify({ batch_size: 10 })
    });
    const workerJson = await workerRes.json();
    assert.equal(workerRes.status, 200);
    assert.equal(workerJson.delivered, 1);
    assert.equal(receivedPushEnvelopes.length, 1, 'encrypted Web Push delivered to browser endpoint');

    // Customer foreground refresh updates to Ready! AND `/#pager-ref=<subscription_id>` resolves locally without UUID in URL!
    await cdp.send('Page.navigate', { url: `${baseUrl}/#pager-ref=${subscribedState.subscriptionId}` }, sessionId);
    const readyViaRefState = await waitForCondition(
      () =>
        cdp.eval(
          sessionId,
          `(() => {
            if (pagerStatus !== 'ready') return null;
            return {
              hashAfterRef: location.hash,
              displayHtml: document.getElementById('pagerDisplay')?.innerHTML || '',
              pushState: document.getElementById('pagerPushPanel')?.dataset?.pushState || ''
            };
          })()`
        ),
      { label: 'Notification tap /#pager-ref resolution to ready state' }
    );
    assert.equal(readyViaRefState.hashAfterRef, '', '#pager-ref scrubbed from URL bar after opening');
    assert(readyViaRefState.displayHtml.includes('Come get the good stuff!'));
    assert.equal(readyViaRefState.pushState, 'subscribed');

    // Customer clicks "Turn off background alerts" (unsubscribe)
    await cdp.eval(sessionId, `document.getElementById('pagerUnsubscribeBtn').click(); true;`);
    const afterUnsub = await waitForCondition(
      () =>
        cdp.eval(
          sessionId,
          `(() => {
            const p = document.getElementById('pagerPushPanel');
            return p && p.dataset.pushState === 'prompt' ? p.dataset.pushState : null;
          })()`
        ),
      { label: 'Unsubscribed UI return to prompt' }
    );
    assert.equal(afterUnsub, 'prompt');
    console.log('PASS [E2E 2/4]: Real pager opt-in, /sw.js registration, worker push, #pager-ref tap resolution & unsubscribe verified');

    // =========================================================================
    // [E2E 3/4] Permission-Denied State Remains Usable with Foreground Live Updates
    // =========================================================================
    await cdp.send(
      'Browser.setPermission',
      {
        origin: baseUrl,
        permission: { name: 'notifications' },
        setting: 'denied',
        browserContextId: customerCtx
      }
    );
    const deniedState = await cdp.eval(
      sessionId,
      `(async () => {
        await refreshPager();
        return {
          pushState: document.getElementById('pagerPushPanel')?.dataset?.pushState || '',
          text: document.getElementById('pagerPushPanel')?.textContent || '',
          pagerStatus
        };
      })()`
    );
    assert.equal(deniedState.pushState, 'denied');
    assert(deniedState.text.includes('Notifications blocked in browser settings'));
    assert.equal(deniedState.pagerStatus, 'ready', 'foreground live pager remains usable when push permission is denied');
    console.log('PASS [E2E 3/4]: Permission-denied path displays truthful guidance while foreground pager continues working');

    // =========================================================================
    // [E2E 4/4] Unsupported Browser Path Remains Usable
    // =========================================================================
    const { browserContextId: unsupportedCtx } = await cdp.send('Target.createBrowserContext');
    const { targetId: unsupportedTarget } = await cdp.send('Target.createTarget', {
      url: 'about:blank',
      browserContextId: unsupportedCtx
    });
    const { sessionId: unsupportedSess } = await cdp.send('Target.attachToTarget', {
      targetId: unsupportedTarget,
      flatten: true
    });
    await cdp.send('Page.enable', {}, unsupportedSess);
    await cdp.send('Runtime.enable', {}, unsupportedSess);
    await cdp.send('Network.enable', {}, unsupportedSess);
    await cdp.send('Network.setBlockedURLs', { urls: ['*://tile.openstreetmap.org/*'] }, unsupportedSess);
    await cdp.send(
      'Page.addScriptToEvaluateOnNewDocument',
      { source: `try { delete window.PushManager; } catch (e) {}` },
      unsupportedSess
    );
    await cdp.send('Page.navigate', { url: `${baseUrl}/#pager=${realPagerId}` }, unsupportedSess);

    const unsupportedState = await waitForCondition(
      () =>
        cdp.eval(
          unsupportedSess,
          `(() => {
            const p = document.getElementById('pagerPushPanel');
            if (!p || pagerStatus !== 'ready') return null;
            return { pushState: p.dataset.pushState, text: p.textContent };
          })()`
        ),
      { label: 'Unsupported browser pager render' }
    );
    assert.equal(unsupportedState.pushState, 'unsupported');
    assert(unsupportedState.text.includes('aren’t supported in this browser'));
    console.log('PASS [E2E 4/4]: Unsupported browser path displays truthful fallback while foreground pager works');
    console.log('\nREAL BROWSER + REAL POSTGRESQL PAGER NOTIFICATION E2E PASSED.');
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
    if (pushReceiver) {
      await new Promise(r => pushReceiver.close(() => r()));
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
  console.error('PAGER NOTIFICATION BROWSER E2E FAILURE:', err);
  process.exitCode = 1;
});
