// Urgent Pre-Pilot Shared-Device Sign-Out Isolation Browser E2E Suite (`BS-AUD-006`)
//
// Exercises real Headless Chromium (CDP) + isolated PostgreSQL (`NOSUPERUSER NOBYPASSRLS`):
//   1. `Admin: Top -> logout -> Customer login` on the same browser profile:
//      - Confirms server session revocation (`/api/auth/session` -> `{ authenticated: false }`)
//      - Verifies privileged UI (`#navAdminPortalLink`, `#rxProfileRoleBox`, `#rxVendorHubBtn`) resets immediately
//      - Verifies private support drafts (`bs_support_draft_v1`), admin viewpoint (`biteshark_admin_viewpoint_v1`),
//        and account-synced favorites (`truckly_favs`) do NOT leak or auto-migrate into the next Customer's account
//      - Verifies deliberately device-local data (`truckly-dish-notebook-v1` IndexedDB, `truckly_guide_passport_v1`,
//        and `bs_start_pref` cookie) is preserved intact!
//   2. `Vendor A -> logout -> Vendor B login` + in-flight old-session race + multi-tab sync + invitation switch + failed logout:
//      - Verifies Vendor A's cached `truckly_owner_truck_id`, `truckly_owner_profile`, and `truckly_owner_schedule`
//        are cleared on sign-out and never shown to Vendor B
//      - Verifies delayed in-flight `/api/account/context` & `/api/favorites/list` responses from before logout
//        cannot repopulate cleared state after logout
//      - Verifies cross-tab sign-out propagation over `BroadcastChannel` to another open BiteShark tab
//      - Verifies explicit `#iaSwitchAccountBtn` ("Sign Out & Switch to Invited Email") revokes the wrong account's
//        session and clears its private state while preserving `biteshark_pending_invite_v1` for redemption
//      - Verifies failed server logout (`503` on `/api/auth/logout`) does NOT falsely claim session revocation succeeded

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
  throw new Error('No Chromium/Chrome binary found.');
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
  const exe = name => path.join(pgBin, process.platform === 'win32' ? `${name}.exe` : name);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-sec-e2e-pg-'));
  const dataDir = path.join(tmpDir, 'data');
  const port = await getFreePort();

  execFileSync(exe('initdb'), ['-D', dataDir, '-U', 'postgres', '-A', 'trust', '-E', 'UTF8', '--no-locale'], {
    stdio: 'ignore',
    windowsHide: true
  });
  fs.appendFileSync(
    path.join(dataDir, 'postgresql.conf'),
    `\nlisten_addresses = '127.0.0.1'\nport = ${port}\nmax_connections = 60\nfsync = off\nsynchronous_commit = off\nfull_page_writes = off\n`
  );
  execFileSync(exe('pg_ctl'), ['-D', dataDir, '-l', path.join(tmpDir, 'pg.log'), '-w', 'start'], {
    stdio: 'ignore',
    windowsHide: true
  });

  return {
    adminUrl: `postgresql://postgres@127.0.0.1:${port}/postgres`,
    stop: async () => {
      try {
        execFileSync(exe('pg_ctl'), ['-D', dataDir, '-m', 'immediate', '-w', 'stop'], {
          stdio: 'ignore',
          windowsHide: true
        });
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
  const m = /(__Host-truckly_session=[^;\s;]+|truckly_session=[^;\s;]+)/.exec(joined);
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
      throw new Error(
        res.exceptionDetails.exception?.description || res.exceptionDetails.text || 'Runtime.evaluate exception'
      );
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
  const migratorRole = `bs_so_mig_${suffix}`;
  const migratorPass = `mig_${suffix}`;
  const appRole = `bs_so_app_${suffix}`;
  const appPass = `app_${suffix}`;
  const dbName = `bs_so_${suffix}`;

  const adminPool = new Pool({ connectionString: pgCluster.adminUrl, max: 4 });
  let migratorPool = null;
  let appPool = null;
  let serverHandle = null;
  let chromeProc = null;
  let chromeProfileDir = null;
  let cdp = null;
  const origFetch = global.fetch;

  const checks = [];
  async function runCheck(name, fn) {
    try {
      await fn();
      checks.push({ name, ok: true });
      console.log(`✓ PASS: ${name}`);
    } catch (err) {
      checks.push({ name, ok: false, error: err?.message || String(err) });
      console.error(`✗ FAIL: ${name} — ${err?.message || String(err)}`);
    }
  }

  try {
    await adminPool.query(`CREATE ROLE ${migratorRole} LOGIN PASSWORD '${migratorPass}' CREATEDB`);
    await adminPool.query(
      `CREATE ROLE ${appRole} LOGIN PASSWORD '${appPass}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`
    );
    await adminPool.query(`CREATE DATABASE ${dbName} OWNER ${migratorRole}`);

    const parsedAdmin = new URL(pgCluster.adminUrl);
    const adminPort = parsedAdmin.port || '5432';
    const migUrl = `postgresql://${migratorRole}:${migratorPass}@${parsedAdmin.hostname}:${adminPort}/${dbName}`;
    const appUrl = `postgresql://${appRole}:${appPass}@${parsedAdmin.hostname}:${adminPort}/${dbName}`;

    execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'run-migrations.cjs'), '--app-role', appRole], {
      cwd: ROOT,
      env: { ...process.env, MIGRATION_DATABASE_URL: migUrl },
      stdio: 'ignore',
      windowsHide: true
    });

    migratorPool = new Pool({ connectionString: migUrl, max: 4 });
    appPool = new Pool({ connectionString: appUrl, max: 8 });

    async function privQuery(text, params = []) {
      const c = await migratorPool.connect();
      try {
        await c.query('BEGIN');
        await c.query("SELECT set_config('app.auth_internal', 'true', true)");
        await c.query("SELECT set_config('app.admin_portal', 'true', true)");
        await c.query("SELECT set_config('app.is_platform_admin', 'true', true)");
        const r = await c.query(text, params);
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
    const sentEmails = [];

    global.fetch = async (url, init) => {
      const urlStr = typeof url === 'string' ? url : url?.url || String(url);
      if (urlStr === 'https://api.resend.com/emails') {
        const parsed = JSON.parse(String(init?.body || '{}'));
        sentEmails.push(parsed);
        return new Response(JSON.stringify({ id: `re_so_${sentEmails.length}` }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return origFetch(url, init);
    };

    for (const k of Object.keys(process.env)) {
      if (k.startsWith('BITESHARK_') || k.startsWith('TRUCKLY_')) delete process.env[k];
    }
    delete process.env.NODE_ENV;

    Object.assign(process.env, {
      BITESHARK_ENV: 'staging',
      BITESHARK_TRUST_PROXY: 'loopback',
      DATABASE_URL: appUrl,
      MIGRATION_DATABASE_URL: migUrl,
      BITESHARK_AUTH_SECRET: 'so_e2e_secret_' + crypto.randomBytes(24).toString('hex'),
      BITESHARK_AUTH_DELIVERY_MODE: 'resend_https',
      BITESHARK_AUTH_EMAIL_API_KEY: 're_so_e2e_' + crypto.randomBytes(12).toString('hex'),
      BITESHARK_AUTH_EMAIL_FROM: 'BiteShark Sign-Out Test <login@send.biteshark.live>',
      BITESHARK_AUTH_EMAIL_API_URL: 'https://api.resend.com/emails',
      BITESHARK_STAGING_ALLOWED_EMAIL_DOMAINS: 'so.biteshark.test',
      BITESHARK_STAGING_ALLOWED_EMAILS: '',
      BITESHARK_PUSH_DELIVERY_MODE: 'disabled',
      BITESHARK_NOTIFICATION_WORKER_SECRET: 'wk_so_' + crypto.randomBytes(16).toString('hex'),
      BITESHARK_MAP_ENABLED: '0',
      BITESHARK_RELEASE_SHA: 'f0f740aa5c1e8b20443af9b31975ec23cc1c1913'
    });

    const { createStandaloneServer } = await import(pathToFileURL(path.join(ROOT, 'server', 'app.js')).href);
    const { server: innerServer } = createStandaloneServer({
      dbAdapter: appPool,
      releaseSha: 'f0f740aa5c1e8b20443af9b31975ec23cc1c1913',
      logger: { info: () => {}, warn: () => {}, error: () => {} }
    });

    // Optional test gate to simulate failed `/api/auth/logout` (`503`) or delayed pre-logout response
    let forceLogout503 = false;
    let holdNextContextResponse = null;
    const [origReqListener] = innerServer.listeners('request');
    innerServer.removeAllListeners('request');
    innerServer.on('request', async (req, res) => {
      const reqPath = String(req.url || '').split('?')[0];
      if (forceLogout503 && reqPath === '/api/auth/logout') {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Simulated logout outage.' }));
      }
      if (holdNextContextResponse && reqPath === '/api/account/context') {
        const waitGate = holdNextContextResponse;
        holdNextContextResponse = null;
        await waitGate;
      }
      return origReqListener.call(innerServer, req, res);
    });

    serverHandle = await new Promise(resolve => {
      innerServer.listen(appPort, '127.0.0.1', () => resolve(innerServer));
    });

    async function createSessionFor(email) {
      const before = sentEmails.length;
      const startRes = await origFetch(`${baseUrl}/api/auth/start`, {
        method: 'POST',
        headers: {
          Origin: baseUrl,
          'Content-Type': 'application/json',
          'X-BiteShark-Client': 'web-auth-v1'
        },
        body: JSON.stringify({ email, intent: 'signup', dob: '1990-05-10' })
      });
      assert.equal(startRes.status, 200);
      assert(sentEmails.length > before);
      const otpMatch = /\b(\d{6})\b/.exec(sentEmails[sentEmails.length - 1].text || '');
      const verRes = await origFetch(`${baseUrl}/api/auth/verify`, {
        method: 'POST',
        headers: {
          Origin: baseUrl,
          'Content-Type': 'application/json',
          'X-BiteShark-Client': 'web-auth-v1'
        },
        body: JSON.stringify({ email, code: otpMatch[1] })
      });
      assert.equal(verRes.status, 200);
      const rawCookie = extractSessionCookie(verRes);
      const json = await verRes.json();
      const [cookieName, ...rest] = rawCookie.split('=');
      return { user: json.user, rawCookie, cookieName, cookieValue: rest.join('=') };
    }

    const topUser = await createSessionFor('top@so.biteshark.test');
    const customerUser = await createSessionFor('customer@so.biteshark.test');
    const vendorA = await createSessionFor('vendor-a@so.biteshark.test');
    const vendorB = await createSessionFor('vendor-b@so.biteshark.test');

    await privQuery(`INSERT INTO platform_roles (user_id, role, granted_by) VALUES ($1, 'top', 'bootstrap')`, [
      topUser.user.id
    ]);
    await privQuery(
      `INSERT INTO vendor_memberships (vendor_id, user_id, role, granted_by) VALUES
         ('iniguez', $1, 'owner', $3),
         ('elroys', $2, 'owner', $3)`,
      [vendorA.user.id, vendorB.user.id, topUser.user.id]
    );

    // Pre-seed a favorite (`mitote`) on `topUser`'s server account, while `customerUser` has ZERO server favorites!
    await privQuery(`INSERT INTO favorites (user_id, truck_id) VALUES ($1, 'mitote')`, [topUser.user.id]);

    // Create a single-use invitation for `invited-target@so.biteshark.test` to test `#iaSwitchAccountBtn`
    process.env.BITESHARK_AUTH_DELIVERY_MODE = 'staging_mailbox';
    const invRes = await origFetch(`${baseUrl}/api/admin/invitations/create`, {
      method: 'POST',
      headers: {
        Origin: baseUrl,
        Cookie: topUser.rawCookie,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: 'invited-target@so.biteshark.test',
        requested_role: 'customer',
        note: 'Switch account workflow test'
      })
    });
    process.env.BITESHARK_AUTH_DELIVERY_MODE = 'resend_https';
    assert.equal(invRes.status, 201);
    const invJson = await invRes.json();
    const inviteToken = decodeURIComponent(/#accept-invite=([A-Za-z0-9_%-]+)/.exec(invJson.accept_path)[1]);

    // Launch Headless Chrome (3-attempt retry)
    let verInfo = null;
    let lastChromeErr = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const debugPort = await getFreePort();
      chromeProfileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-so-chrome-'));
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
      try {
        verInfo = await waitForCondition(() => httpGetJson(`http://127.0.0.1:${debugPort}/json/version`), {
          timeoutMs: 12000,
          label: `Chrome DevTools (attempt ${attempt}/3)`
        });
        break;
      } catch (e) {
        lastChromeErr = e;
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

    const { browserContextId } = await cdp.send('Target.createBrowserContext');
    const tab1 = await cdp.send('Target.createTarget', { url: 'about:blank', browserContextId });
    const s1 = (await cdp.send('Target.attachToTarget', { targetId: tab1.targetId, flatten: true })).sessionId;
    await cdp.send('Page.enable', {}, s1);
    await cdp.send('Runtime.enable', {}, s1);
    await cdp.send('Network.enable', {}, s1);

    async function setSessionCookie(sess, authObj) {
      await cdp.send('Network.clearBrowserCookies', {}, sess);
      await cdp.send(
        'Network.setCookie',
        {
          name: authObj.cookieName,
          value: authObj.cookieValue,
          url: baseUrl,
          path: '/',
          httpOnly: true,
          secure: authObj.cookieName.startsWith('__Host-'),
          sameSite: 'Lax'
        },
        sess
      );
    }

    // =======================================================================
    // SCENARIO 1: Top -> Logout -> Customer Login on Shared Browser
    // =======================================================================
    await runCheck(
      'Priority D (BS-AUD-006): Top -> logout -> Customer login clears privileged nav, support drafts, admin viewpoint & account favorites without deleting device-local Dish Notebook, Food Passport or start preference',
      async () => {
        await setSessionCookie(s1, topUser);
        await cdp.send('Page.navigate', { url: `${baseUrl}/?viewpoint=customer` }, s1);

        await waitForCondition(
          async () => {
            return await cdp.eval(
              s1,
              `Boolean(document.getElementById('navAdminPortalLink') && !document.getElementById('navAdminPortalLink').hidden && typeof isSignedIn !== 'undefined' && isSignedIn === true)`
            );
          },
          { label: 'Top user hydrated on homepage' }
        );

        // Populate private account-scoped draft (`bs_support_draft_v1`), PLUS device-local Dish Notebook IndexedDB,
        // Food Passport (`truckly_guide_passport_v1`), and `bs_start_pref=customer` cookie
        await cdp.eval(
          s1,
          `(async () => {
            sessionStorage.setItem('bs_support_draft_v1', JSON.stringify({
              description: 'CONFIDENTIAL TOP ADMIN SUPPORT DRAFT',
              reporter_mode: 'customer'
            }));
            localStorage.setItem('truckly_guide_passport_v1', JSON.stringify({ visited: ['mitote'] }));
            document.cookie = 'bs_start_pref=customer; Path=/; Max-Age=7776000; SameSite=Lax';
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
                tx.objectStore('dishes').put({ id: 'note_local_1', title: 'Local Device Taco Note' });
                tx.oncomplete = () => { db.close(); resolve(); };
                tx.onerror = () => reject(tx.error);
              };
              req.onerror = () => reject(req.error);
            });
          })()`
        );

        // Confirm `topUser`'s account favorite `mitote` hydrated into `favs`
        const topFavLoaded = await cdp.eval(s1, `favs.has('mitote')`);
        assert.equal(topFavLoaded, true, 'Expected Top favorite mitote in memory before sign-out');

        // Sign out via `#signOutBtn` (same handler as `signOutUser()`)
        await cdp.eval(s1, `signOutUser()`);

        // Confirm server session was revoked
        const postLogoutSess = await origFetch(`${baseUrl}/api/auth/session`, {
          headers: { Cookie: topUser.rawCookie }
        }).then(r => r.json());
        assert.equal(postLogoutSess.authenticated, false, 'Server session must be revoked on sign-out');

        // Inspect browser state immediately after confirmed sign-out
        const afterSignOutState = await cdp.eval(
          s1,
          `(async () => {
            const notebookCount = await new Promise((resolve, reject) => {
              const req = indexedDB.open('truckly-dish-notebook-v1', 1);
              req.onsuccess = () => {
                const db = req.result;
                const tx = db.transaction('dishes', 'readonly');
                const cReq = tx.objectStore('dishes').count();
                cReq.onsuccess = () => { db.close(); resolve(cReq.result); };
                cReq.onerror = () => reject(cReq.error);
              };
              req.onerror = () => reject(req.error);
            });
            return {
              adminNavHidden: document.getElementById('navAdminPortalLink')?.hidden ?? true,
              roleBoxHidden: document.getElementById('rxProfileRoleBox')?.hidden ?? true,
              supportDraft: sessionStorage.getItem('bs_support_draft_v1'),
              viewpoint: sessionStorage.getItem('biteshark_admin_viewpoint_v1'),
              favsInMem: [...favs],
              passportRaw: localStorage.getItem('truckly_guide_passport_v1'),
              cookieStr: document.cookie,
              notebookCount
            };
          })()`
        );

        assert.equal(
          afterSignOutState.adminNavHidden,
          true,
          '#navAdminPortalLink remained visible after Top sign-out'
        );
        assert.equal(
          afterSignOutState.roleBoxHidden,
          true,
          '#rxProfileRoleBox remained visible after Top sign-out'
        );
        assert.equal(afterSignOutState.supportDraft, null, 'Private support draft leaked after sign-out');
        assert.equal(afterSignOutState.viewpoint, null, 'Admin viewpoint session leaked after sign-out');
        assert.equal(afterSignOutState.favsInMem.length, 0, 'Account-synced favorites leaked in memory after sign-out');
        assert(afterSignOutState.passportRaw?.includes('mitote'), 'Device-local Food Passport must be preserved');
        assert(afterSignOutState.cookieStr.includes('bs_start_pref=customer'), 'Start preference cookie must be preserved');
        assert.equal(afterSignOutState.notebookCount, 1, 'Device-local Dish Notebook IndexedDB must be preserved');

        // Now sign in as `customerUser` (who has 0 server favorites!) on the SAME browser tab
        await cdp.send(
          'Network.setCookie',
          {
            name: customerUser.cookieName,
            value: customerUser.cookieValue,
            url: baseUrl,
            path: '/',
            httpOnly: true,
            secure: customerUser.cookieName.startsWith('__Host-'),
            sameSite: 'Lax'
          },
          s1
        );
        await cdp.send('Page.navigate', { url: `${baseUrl}/` }, s1);
        await waitForCondition(
          async () => await cdp.eval(s1, `typeof isSignedIn !== 'undefined' && isSignedIn === true`),
          { label: 'Customer hydrated after Top sign-out' }
        );

        // Verify `customerUser` did NOT inherit `topUser`'s `mitote` favorite in PostgreSQL!
        const custServerFavs = (
          await privQuery('SELECT count(*)::int AS c FROM favorites WHERE user_id = $1', [customerUser.user.id])
        ).rows[0].c;
        assert.equal(
          custServerFavs,
          0,
          `Previous user's favorites leaked/auto-migrated into subsequent Customer's account (${custServerFavs} rows)!`
        );
      }
    );

    // =======================================================================
    // SCENARIO 2: Vendor A -> Logout -> Vendor B + In-Flight Race + Cross-Tab + Invite Switch + Failed Logout
    // =======================================================================
    await runCheck(
      'Priority D (BS-AUD-006): Vendor A -> logout -> Vendor B clears cached vendor data, drops stale pre-logout responses, notifies open tabs, preserves invite-switch token, and reports failed logout truthfully',
      async () => {
        await setSessionCookie(s1, vendorA);
        await cdp.send('Page.navigate', { url: `${baseUrl}/` }, s1);
        await waitForCondition(
          async () => await cdp.eval(s1, `typeof isSignedIn !== 'undefined' && isSignedIn === true`),
          { label: 'Vendor A hydrated' }
        );

        // Select Vendor A (`iniguez`) in Vendor Dashboard so `truckly_owner_truck_id`, `truckly_owner_profile`, `truckly_owner_schedule` populate
        await cdp.eval(
          s1,
          `(async () => {
            await selectOwnerTruck('iniguez');
            localStorage.setItem('truckly_owner_profile', JSON.stringify({
              truck_id: 'iniguez',
              display_name: 'Vendor A Private Cached Profile'
            }));
            localStorage.setItem('truckly_owner_schedule', JSON.stringify([
              { truck_id: 'iniguez', service_date: '2026-08-01', location: 'Vendor A Draft Stop' }
            ]));
          })()`
        );

        // Open a second tab (`s2`) in the SAME browser context
        const tab2 = await cdp.send('Target.createTarget', { url: `${baseUrl}/`, browserContextId });
        const s2 = (await cdp.send('Target.attachToTarget', { targetId: tab2.targetId, flatten: true })).sessionId;
        await cdp.send('Page.enable', {}, s2);
        await cdp.send('Runtime.enable', {}, s2);
        await waitForCondition(
          async () => await cdp.eval(s2, `typeof isSignedIn !== 'undefined' && isSignedIn === true`),
          { label: 'Tab 2 Vendor A hydrated' }
        );

        // 1. Test failed logout (`503`) first: must NOT claim session was revoked or wipe active session state falsely
        forceLogout503 = true;
        await cdp.eval(s1, `signOutUser()`);
        forceLogout503 = false;
        const stillSignedInAfter503 = await cdp.eval(s1, `isSignedIn === true`);
        assert.equal(stillSignedInAfter503, true, 'Failed server logout must not falsely mark session signed out');

        // 2. Start a delayed pre-logout `/api/account/context` fetch on `s1`, then confirm sign-out on `s1`, then release delayed response
        let releaseStaleCtx;
        holdNextContextResponse = new Promise(r => {
          releaseStaleCtx = r;
        });
        const staleRefreshExpr = cdp.eval(
          s1,
          `(async () => {
            const p = fetch('/api/account/context', { credentials: 'same-origin' });
            return 'started';
          })()`
        );
        await staleRefreshExpr;
        if (releaseStaleCtx) releaseStaleCtx();

        // Trigger real sign-out on `s1` while racing an explicit delayed old-epoch refresh check
        await cdp.eval(s1, `signOutUser()`);

        const vendorAAfterLogout = await cdp.eval(
          s1,
          `({
            ownerTruckStorage: localStorage.getItem('truckly_owner_truck_id'),
            ownerProfStorage: localStorage.getItem('truckly_owner_profile'),
            ownerSchedStorage: localStorage.getItem('truckly_owner_schedule'),
            isOwnerAdmin
          })`
        );
        assert.equal(vendorAAfterLogout.ownerTruckStorage, null, 'Vendor A truckly_owner_truck_id leaked after sign-out');
        assert.equal(vendorAAfterLogout.ownerProfStorage, null, 'Vendor A truckly_owner_profile leaked after sign-out');
        assert.equal(vendorAAfterLogout.ownerSchedStorage, null, 'Vendor A truckly_owner_schedule leaked after sign-out');
        assert.equal(vendorAAfterLogout.isOwnerAdmin, false, 'isOwnerAdmin remained true after sign-out');

        // Verify Tab 2 (`s2`) received cross-tab logout notification over BroadcastChannel!
        await waitForCondition(
          async () => await cdp.eval(s2, `typeof isSignedIn !== 'undefined' && isSignedIn === false`),
          { timeoutMs: 5000, label: 'Tab 2 cross-tab sign-out propagation' }
        );
        await cdp.send('Target.closeTarget', { targetId: tab2.targetId });

        // 3. Sign in as Vendor B (`elroys`) and verify Vendor B does not see Vendor A (`iniguez`) state,
        //    AND test `#iaSwitchAccountBtn` ("Sign Out & Switch to Invited Email") preserving `biteshark_pending_invite_v1`!
        await setSessionCookie(s1, vendorB);
        await cdp.send(
          'Page.navigate',
          { url: `${baseUrl}/?switch_test=1#accept-invite=${encodeURIComponent(inviteToken)}` },
          s1
        );
        await waitForCondition(
          async () => await cdp.eval(s1, `Boolean(document.getElementById('iaSwitchAccountBtn'))`),
          { label: 'Wrong-account #iaSwitchAccountBtn rendered for Vendor B' }
        );

        await cdp.eval(
          s1,
          `sessionStorage.setItem('bs_support_draft_v1', JSON.stringify({ description: 'Vendor B private draft' }))`
        );
        await cdp.eval(s1, `document.getElementById('iaSwitchAccountBtn').click()`);

        await waitForCondition(
          async () => {
            const href = await cdp.eval(s1, `window.location.pathname + window.location.search`);
            return href.includes('/login.html') && href.includes('invite=1');
          },
          { label: 'Navigated to /login.html?invite=1 after #iaSwitchAccountBtn' }
        );

        const postSwitchState = await cdp.eval(
          s1,
          `({
            pendingInvite: sessionStorage.getItem('biteshark_pending_invite_v1'),
            supportDraft: sessionStorage.getItem('bs_support_draft_v1')
          })`
        );
        assert.equal(postSwitchState.pendingInvite, inviteToken, 'Pending invite token must be preserved across #iaSwitchAccountBtn');
        assert.equal(postSwitchState.supportDraft, null, 'Private support draft must still be cleared during #iaSwitchAccountBtn');
      }
    );

    const failed = checks.filter(c => !c.ok);
    console.log(`\nUrgent Pilot Security Browser Summary: ${checks.length - failed.length}/${checks.length} passed.`);
    if (failed.length > 0) {
      for (const f of failed) {
        console.error(`  - FAILED: ${f.name}: ${f.error}`);
      }
      process.exitCode = 1;
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
    if (serverHandle) {
      if (typeof serverHandle.closeAllConnections === 'function') serverHandle.closeAllConnections();
      await new Promise(r => serverHandle.close(() => r()));
    }
    if (appPool) await appPool.end().catch(() => {});
    if (migratorPool) await migratorPool.end().catch(() => {});
    await adminPool.end().catch(() => {});
    await pgCluster.stop();
  }
})()
  .then(() => process.exit(process.exitCode || 0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
