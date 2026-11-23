// Real Headless Chrome + PostgreSQL + Mock GitHub API E2E Browser Suite for BiteShark
// Style Guide Admin Section (`/admin#style-guide`), Type-Matched Controls, Live Hosted
// Markdown Preview & 1-Click GitHub Push (`tests/style-guide-admin-browser.e2e.cjs`)

'use strict';

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
  throw new Error('Could not locate Chrome/Chromium/Edge binary.');
}

async function createPostgresCluster() {
  if (process.env.DATABASE_URL) {
    return { adminUrl: process.env.DATABASE_URL, stop: async () => {} };
  }
  const binSuffix = process.platform === 'win32' ? '.exe' : '';
  const pkgPlatform = `${process.platform === 'win32' ? 'windows' : process.platform}-${process.arch}`;
  const roots = [
    process.env.TRUCKLY_PG_NODE_MODULES,
    process.env.BITESHARK_PG_NODE_MODULES,
    ...(process.env.NODE_PATH ? process.env.NODE_PATH.split(path.delimiter) : [])
  ].filter(Boolean);

  let nativeBinDir = null;
  for (const r of roots) {
    const candidate = path.join(r, '@embedded-postgres', pkgPlatform, 'native', 'bin');
    if (fs.existsSync(path.join(candidate, 'pg_ctl' + binSuffix))) {
      nativeBinDir = candidate;
      break;
    }
  }
  if (!nativeBinDir) {
    throw new Error('Set DATABASE_URL or TRUCKLY_PG_NODE_MODULES for PostgreSQL.');
  }

  const initdbExe = path.join(nativeBinDir, 'initdb' + binSuffix);
  const pgCtlExe = path.join(nativeBinDir, 'pg_ctl' + binSuffix);
  const port = await getFreePort();
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-sg-e2e-pg-'));
  const dataDir = path.join(tmpBase, 'data');
  const pwFile = path.join(tmpBase, 'pw.txt');
  const logFile = path.join(tmpBase, 'postgres.log');
  const password = 'sge_' + crypto.randomBytes(6).toString('hex');
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
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, json: JSON.parse(Buffer.concat(chunks).toString('utf8')) });
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
      { expression, awaitPromise: true, returnByValue: true },
      sessionId
    );
    if (res.exceptionDetails) {
      throw new Error(
        res.exceptionDetails.exception?.description || res.exceptionDetails.text || 'Eval error'
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

async function startMockGitHubApiServer(expectedToken) {
  let commitCount = 0;
  const srv = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      if (String(req.headers.authorization || '') !== `Bearer ${expectedToken}`) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Bad credentials' }));
        return;
      }
      const bodyText = Buffer.concat(chunks).toString('utf8');
      const body = bodyText ? JSON.parse(bodyText) : null;
      const urlPath = req.url.split('?')[0];

      if (req.method === 'GET' && urlPath.includes('/git/ref/heads/')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ object: { sha: 'aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111' } }));
        return;
      }
      if (req.method === 'GET' && urlPath.includes('/git/commits/')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ tree: { sha: 'bbbb2222bbbb2222bbbb2222bbbb2222bbbb2222' } }));
        return;
      }
      if (req.method === 'POST' && urlPath.endsWith('/git/blobs')) {
        const sha = crypto.createHash('sha1').update(String(body.content || ''), 'utf8').digest('hex');
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ sha }));
        return;
      }
      if (req.method === 'POST' && urlPath.endsWith('/git/trees')) {
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ sha: 'cccc3333cccc3333cccc3333cccc3333cccc3333' }));
        return;
      }
      if (req.method === 'POST' && urlPath.endsWith('/git/commits')) {
        commitCount += 1;
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ sha: 'dddd4444dddd4444dddd4444dddd4444dddd4444' }));
        return;
      }
      if (req.method === 'PATCH' && urlPath.includes('/git/refs/heads/')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ object: { sha: body.sha } }));
        return;
      }
      res.writeHead(404).end('{}');
    });
  });

  const port = await getFreePort();
  await new Promise((resolve, reject) => srv.listen(port, '127.0.0.1', e => (e ? reject(e) : resolve())));
  return {
    apiUrl: `http://127.0.0.1:${port}`,
    getCommitCount: () => commitCount,
    stop: () => new Promise(r => srv.close(() => r()))
  };
}

(async () => {
  const chromeBin = findChromeBinary();
  const pgCluster = await createPostgresCluster();
  const adminPool = new Pool({ connectionString: pgCluster.adminUrl, max: 2 });
  const suffix = crypto.randomBytes(3).toString('hex');
  const migratorRole = `bs_sge_mig_${suffix}`;
  const appRole = `bs_sge_app_${suffix}`;
  const dbName = `bs_sge_${suffix}`;
  const migratorPass = `mig_${suffix}`;
  const appPass = `app_${suffix}`;
  const sgStorageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-sge-storage-'));
  const photoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-sge-photos-'));
  const mockToken = 'github_pat_e2e_synthetic_token_9876543210';
  const mockGh = await startMockGitHubApiServer(mockToken);

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

    const topEmail = 'top-sge2e@staging.biteshark.invalid';
    execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'bootstrap-top-admin.cjs'), '--email', topEmail], {
      cwd: ROOT,
      env: { ...process.env, MIGRATION_DATABASE_URL: migratorDbUrl },
      stdio: 'pipe',
      windowsHide: true
    });

    const port = await getFreePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    const mailboxSecret = 'sge2embx_' + crypto.randomBytes(16).toString('hex');

    serverProc = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
      cwd: ROOT,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        HOST: '127.0.0.1',
        PORT: String(port),
        DATABASE_URL: appDbUrl,
        BITESHARK_ENV: 'staging',
        BITESHARK_RELEASE_SHA: 'sge2e-sha',
        BITESHARK_AUTH_SECRET: crypto.randomBytes(32).toString('hex'),
        BITESHARK_AUTH_DELIVERY_MODE: 'staging_mailbox',
        BITESHARK_STAGING_MAILBOX_SECRET: mailboxSecret,
        BITESHARK_STAGING_ALLOWED_EMAIL_DOMAINS: 'staging.biteshark.invalid',
        BITESHARK_PUSH_PROVIDER_MODE: 'disabled',
        BITESHARK_PHOTO_STORAGE_DIR: photoDir,
        BITESHARK_STYLE_GUIDE_STORAGE_DIR: sgStorageDir,
        BITESHARK_STYLE_GUIDE_GITHUB_API_URL: mockGh.apiUrl,
        BITESHARK_STYLE_GUIDE_GITHUB_TOKEN: mockToken
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });

    for (let i = 0; i < 60; i++) {
      try {
        const r = await fetch(`${baseUrl}/api/healthz`);
        if (r.ok) break;
      } catch {}
      await new Promise(r => setTimeout(r, 150));
    }

    // Launch headless Chrome with 3-attempt cold-start retry
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const cdpPort = await getFreePort();
        chromeProfileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-sge2e-chrome-'));
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
          { timeoutMs: 10000, label: 'Chrome DevTools endpoint' }
        );
        cdp = new CdpClient(versionInfo.webSocketDebuggerUrl);
        await cdp.connect();
        break;
      } catch (err) {
        if (chromeProc) chromeProc.kill('SIGTERM');
        if (attempt === 3) throw err;
      }
    }

    const { browserContextId } = await cdp.send('Target.createBrowserContext');
    const { targetId } = await cdp.send('Target.createTarget', {
      url: 'about:blank',
      browserContextId
    });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Runtime.enable', {}, sessionId);

    // Sign in as Admin: Top and open /admin#style-guide directly
    await cdp.send('Page.navigate', { url: `${baseUrl}/login.html?next=%2Fadmin` }, sessionId);
    await waitForCondition(
      () => cdp.eval(sessionId, `Boolean(window.bitesharkAuth)`),
      { label: 'login.html loaded' }
    );
    await cdp.eval(
      sessionId,
      `(async () => {
        await window.bitesharkAuth.startLogin({
          email: ${JSON.stringify(topEmail)},
          intent: 'signup',
          dob: '1990-06-15'
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
      body: JSON.stringify({ email: topEmail })
    });
    const mbxJson = await mbxRes.json();
    await cdp.eval(
      sessionId,
      `(async () => {
        await window.bitesharkAuth.verifyCode({
          email: ${JSON.stringify(topEmail)},
          code: ${JSON.stringify(mbxJson.code)}
        });
        window.location.href = '/admin#style-guide';
        return true;
      })()`
    );

    // 1. Wait for Style Guide Workspace & all 15 categories to render
    await waitForCondition(
      () =>
        cdp.eval(
          sessionId,
          `document.querySelectorAll('#sgCategoryRailList [data-sg-topic]').length === 15 &&
           Boolean(document.querySelector('[data-sg-enum="DEC-FND-THEME-POLICY"]'))`
        ),
      { label: 'Style Guide 15 categories and Foundations dropdown rendered' }
    );

    // 2. Select enum_choice dropdown (`DEC-FND-THEME-POLICY` -> `light_only`), mark Approved, and add optional note
    await cdp.eval(
      sessionId,
      `(() => {
        const sel = document.querySelector('[data-sg-enum="DEC-FND-THEME-POLICY"]');
        sel.value = 'light_only';
        sel.dispatchEvent(new Event('change', { bubbles: true }));

        const st = document.querySelector('[data-sg-status="DEC-FND-THEME-POLICY"]');
        st.value = 'approved';
        st.dispatchEvent(new Event('change', { bubbles: true }));

        const noteBtn = document.querySelector('[data-sg-note-toggle="DEC-FND-THEME-POLICY"]');
        noteBtn.click();
        const noteTa = document.querySelector('[data-sg-note-input="DEC-FND-THEME-POLICY"]');
        noteTa.value = 'E2E optional note: keep light warm Sonoma cream palette.';
        noteTa.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })()`
    );

    // 3. Click Save & Populate Hosted Style Guide
    await cdp.eval(
      sessionId,
      `document.getElementById('sgSaveAllDirtyBtn').click(); true;`
    );

    await waitForCondition(
      () =>
        cdp.eval(
          sessionId,
          `document.getElementById('sgStickySaveBar').hidden === true &&
           document.getElementById('sgProgressSummaryCard').textContent.includes('1 / 773 Done')`
        ),
      { label: 'Saved progress counter updated to 1 / 773 Done' }
    );

    // 4. Open Hosted Style Guide Viewer for `foundations.md` and verify live populated section!
    await cdp.eval(
      sessionId,
      `document.getElementById('sgPreviewTopicMdBtn').click(); true;`
    );
    await waitForCondition(
      () =>
        cdp.eval(
          sessionId,
          `!document.getElementById('sgHostedDocModal').hidden &&
           document.getElementById('sgHostedDocBody').textContent.includes('light_only') &&
           document.getElementById('sgHostedDocBody').textContent.includes('E2E optional note: keep light warm Sonoma cream palette.')`
        ),
      { label: 'Hosted foundations.md preview populated with answer and optional note' }
    );
    await cdp.eval(sessionId, `document.getElementById('sgHostedDocCloseBtn').click(); true;`);

    // 5. Click Push Answers to Repo and verify GitHub commit confirmation
    await cdp.eval(sessionId, `document.getElementById('sgPushToRepoTopBtn').click(); true;`);
    await waitForCondition(
      () => cdp.eval(sessionId, `!document.getElementById('sgPushRepoModal').hidden`),
      { label: 'Push to Repo modal opened' }
    );
    await cdp.eval(sessionId, `document.getElementById('sgPushSubmitBtn').click(); true;`);
    await waitForCondition(
      () =>
        cdp.eval(
          sessionId,
          `!document.getElementById('sgPushModalSuccess').hidden &&
           document.getElementById('sgPushModalSuccess').textContent.includes('dddd4444dddd')`
        ),
      { label: 'Push to Repo modal reported new GitHub commit SHA' }
    );
    assert.equal(mockGh.getCommitCount(), 1);

    console.log('[style-guide-admin-browser.e2e] PASS — all browser category, control, optional note, hosted preview & GitHub push checks succeeded.');
  } finally {
    if (cdp) cdp.close();
    if (chromeProc) chromeProc.kill('SIGTERM');
    if (serverProc) serverProc.kill('SIGTERM');
    await mockGh.stop().catch(() => {});
    await adminPool.end().catch(() => {});
    await pgCluster.stop().catch(() => {});
    try {
      if (chromeProfileDir) fs.rmSync(chromeProfileDir, { recursive: true, force: true });
      fs.rmSync(sgStorageDir, { recursive: true, force: true });
      fs.rmSync(photoDir, { recursive: true, force: true });
    } catch {}
  }
})().catch(err => {
  console.error('[style-guide-admin-browser.e2e] FAILED:', err);
  process.exit(1);
});
