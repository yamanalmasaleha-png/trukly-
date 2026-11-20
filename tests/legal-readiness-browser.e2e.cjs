#!/usr/bin/env node
// Real Headless Chrome + Real PostgreSQL Browser E2E Suite for BiteShark Legal-Policy Drafts,
// Keyboard & Mobile/Zoom Accessibility, 14+ Signup DOB, Existing-Account Assessment & `/admin#readiness`

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
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'biteshark-legale2e-pg-'));
  const dataDir = path.join(tmpBase, 'data');
  const pwFile = path.join(tmpBase, 'pw.txt');
  const logFile = path.join(tmpBase, 'postgres.log');
  const password = 'le2e_' + crypto.randomBytes(6).toString('hex');
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

  async pressKey(sessionId, key, code, windowsVirtualKeyCode) {
    await this.send(
      'Input.dispatchKeyEvent',
      { type: 'keyDown', key, code, windowsVirtualKeyCode, nativeVirtualKeyCode: windowsVirtualKeyCode },
      sessionId
    );
    await this.send(
      'Input.dispatchKeyEvent',
      { type: 'keyUp', key, code, windowsVirtualKeyCode, nativeVirtualKeyCode: windowsVirtualKeyCode },
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
  const chromeBin = findChromeBinary();
  const pgCluster = await createPostgresCluster();
  const suffix = crypto.randomBytes(4).toString('hex');
  const migratorRole = `bs_le2e_mig_${suffix}`;
  const migratorPass = `mig_${suffix}`;
  const appRole = `bs_le2e_app_${suffix}`;
  const appPass = `app_${suffix}`;
  const dbName = `bs_le2e_${suffix}`;

  const adminPool = new Pool({ connectionString: pgCluster.adminUrl, max: 4 });
  let migratorPool = null;
  let serverProc = null;
  let chromeProc = null;
  let chromeProfileDir = null;
  let cdp = null;

  try {
    await adminPool.query(`CREATE ROLE ${migratorRole} LOGIN PASSWORD '${migratorPass}'`);
    await adminPool.query(
      `CREATE ROLE ${appRole} LOGIN PASSWORD '${appPass}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`
    );
    await adminPool.query(`CREATE DATABASE ${dbName} OWNER ${migratorRole}`);

    const migratorUrl = buildDbUrl(pgCluster.adminUrl, {
      user: migratorRole,
      password: migratorPass,
      database: dbName
    });
    const appUrl = buildDbUrl(pgCluster.adminUrl, {
      user: appRole,
      password: appPass,
      database: dbName
    });

    execFileSync(
      process.execPath,
      [path.join(ROOT, 'scripts', 'run-migrations.cjs'), '--app-role', appRole],
      {
        cwd: ROOT,
        env: { ...process.env, MIGRATION_DATABASE_URL: migratorUrl },
        stdio: 'pipe',
        windowsHide: true
      }
    );

    const allowedDomain = 'legale2e.biteshark.invalid';
    const topEmail = `top-admin@${allowedDomain}`;
    const modEmail = `mod-admin@${allowedDomain}`;
    const existingUnassessedEmail = `existing-unassessed@${allowedDomain}`;

    execFileSync(
      process.execPath,
      [path.join(ROOT, 'scripts', 'bootstrap-top-admin.cjs'), '--email', topEmail],
      {
        cwd: ROOT,
        env: { ...process.env, MIGRATION_DATABASE_URL: migratorUrl },
        stdio: 'pipe',
        windowsHide: true
      }
    );

    migratorPool = new Pool({ connectionString: migratorUrl, max: 4 });
    // Seed a pre-existing `'not_assessed'` user + a `mod` user
    const modId = 'usr_sa_' + crypto.randomBytes(16).toString('hex');
    const unassessedId = 'usr_sa_' + crypto.randomBytes(16).toString('hex');
    await migratorPool.query('BEGIN');
    await migratorPool.query("SELECT set_config('app.auth_internal', 'true', true), set_config('app.admin_portal', 'true', true)");
    await migratorPool.query(
      `INSERT INTO auth_users (id, email_normalized, age_eligibility_status, age_policy_version, age_assessed_at, age_assessment_basis)
       VALUES ($1, $2, 'eligible_14_plus', 'draft-14plus-v0.1', now(), 'self_reported_dob_at_signup')`,
      [modId, modEmail]
    );
    await migratorPool.query(
      `INSERT INTO platform_roles (user_id, role, granted_by, notes)
       VALUES ($1, 'mod', 'e2e_seed', 'Mod readiness browser E2E')`,
      [modId]
    );
    await migratorPool.query(
      `INSERT INTO auth_users (id, email_normalized, created_at, updated_at)
       VALUES ($1, $2, now() - interval '45 days', now() - interval '45 days')`,
      [unassessedId, existingUnassessedEmail]
    );
    await migratorPool.query(
      `UPDATE compliance_readiness_items
       SET confidential_counsel_notes = 'CONFIDENTIAL MEMO: Pending outside counsel review of Sonoma DBA publication.'
       WHERE item_key = 'minimum_signup_age_14'`
    );
    await migratorPool.query('COMMIT');

    const appPort = await getFreePort();
    const baseUrl = `http://127.0.0.1:${appPort}`;
    const mailboxSecret = 'mbx_le2e_' + crypto.randomBytes(20).toString('hex');
    const authSecret = 'auth_le2e_' + crypto.randomBytes(24).toString('hex');

    const childEnv = {
      ...process.env,
      PORT: String(appPort),
      HOST: '127.0.0.1',
      DATABASE_URL: appUrl,
      BITESHARK_ENV: 'staging',
      BITESHARK_AUTH_SECRET: authSecret,
      BITESHARK_AUTH_DELIVERY_MODE: 'staging_mailbox',
      BITESHARK_STAGING_MAILBOX_SECRET: mailboxSecret,
      BITESHARK_STAGING_ALLOWED_EMAIL_DOMAINS: allowedDomain,
      BITESHARK_PUSH_PROVIDER_MODE: 'disabled',
      BITESHARK_AUTH_START_IP_MAX: '80',
      BITESHARK_AUTH_VERIFY_IP_MAX: '80',
      BITESHARK_RELEASE_SHA: 'legale2e00000000000000000000000000000019'
    };
    if (process.env.TRUCKLY_PG_NODE_MODULES) {
      childEnv.NODE_PATH = process.env.TRUCKLY_PG_NODE_MODULES;
    }

    serverProc = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
      cwd: ROOT,
      env: childEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });

    await waitForCondition(
      async () => {
        const r = await httpGetJson(`${baseUrl}/api/healthz`);
        return r.status === 200 && r.json.db === 'ready';
      },
      { label: 'standalone server healthz' }
    );

    const cdpPort = await getFreePort();
    chromeProfileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-legal-chrome-'));
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
      { stdio: 'ignore', windowsHide: true }
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

    async function newIsolatedPage() {
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
        'Network.setBlockedURLs',
        { urls: ['*://tile.openstreetmap.org/*', '*://unpkg.com/*'] },
        sessionId
      );
      return sessionId;
    }

    async function fetchOtp(email) {
      const r = await fetch(`${baseUrl}/api/auth/staging-mailbox`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Staging-Mailbox-Secret': mailboxSecret
        },
        body: JSON.stringify({ email })
      });
      assert.equal(r.status, 200, `Expected OTP in staging mailbox for ${email}`);
      return (await r.json()).code;
    }

    // =========================================================================
    // [E2E 1/5] Policy Pages: Keyboard Skip-Link, Focus Ring, Mobile 375px & 200% Zoom Reflow
    // =========================================================================
    const policySess = await newIsolatedPage();
    await cdp.send('Page.navigate', { url: `${baseUrl}/policies/terms.html` }, policySess);
    await waitForCondition(
      () => cdp.eval(policySess, `document.getElementById('policyMain') !== null`),
      { label: 'terms.html loaded' }
    );

    // Press Tab -> skip-link must receive keyboard focus with visible outline!
    await cdp.pressKey(policySess, 'Tab', 'Tab', 9);
    const skipFocusInfo = await cdp.eval(
      policySess,
      `(() => {
        const el = document.activeElement;
        if (!el) return null;
        const st = getComputedStyle(el);
        return {
          isSkipLink: el.classList.contains('skip-link'),
          href: el.getAttribute('href'),
          outlineStyle: st.outlineStyle,
          outlineWidth: st.outlineWidth,
          metaRobots: document.querySelector('meta[name="robots"]')?.getAttribute('content') || '',
          hasPlaceholder: document.body.textContent.includes('[LEGAL OPERATOR NAME], doing business as BiteShark'),
          hasDraftTag: document.body.textContent.includes('Staging Working Draft')
        };
      })()`
    );
    assert.equal(skipFocusInfo.isSkipLink, true, 'First Tab stop on policy page must focus skip-link');
    assert.equal(skipFocusInfo.href, '#policyMain');
    assert.notEqual(skipFocusInfo.outlineWidth, '0px', 'Focused skip-link must display visible focus indicator');
    assert.equal(skipFocusInfo.metaRobots, 'noindex,nofollow,noarchive');
    assert.equal(skipFocusInfo.hasPlaceholder, true);
    assert.equal(skipFocusInfo.hasDraftTag, true);

    // Test 375px narrow mobile viewport AND 200% zoom scale (`pageScaleFactor` / CSS zoom equivalent)
    await cdp.send(
      'Emulation.setDeviceMetricsOverride',
      { width: 375, height: 812, deviceScaleFactor: 2, mobile: true },
      policySess
    );
    const mobileOverflow = await cdp.eval(
      policySess,
      `document.documentElement.scrollWidth <= window.innerWidth + 4`
    );
    assert.equal(mobileOverflow, true, 'Policy page must reflow cleanly on 375px mobile viewport without horizontal overflow');

    await cdp.send(
      'Emulation.setDeviceMetricsOverride',
      { width: 640, height: 720, deviceScaleFactor: 2, mobile: false },
      policySess
    );
    const zoom200Overflow = await cdp.eval(
      policySess,
      `(() => {
        document.documentElement.style.fontSize = '200%';
        return document.documentElement.scrollWidth <= window.innerWidth + 8;
      })()`
    );
    assert.equal(zoom200Overflow, true, 'Policy page must remain readable at 200% font zoom without horizontal clipping');
    console.log('PASS [E2E 1/5]: Policy draft page skip-link keyboard focus, visible outline, 375px mobile reflow & 200% zoom verified');

    // =========================================================================
    // [E2E 2/5] Keyboard-Driven Signup Mode, Screen-Reader Labels & Under-14 Refusal + Cooldown
    // =========================================================================
    const under14Sess = await newIsolatedPage();
    await cdp.send('Page.navigate', { url: `${baseUrl}/login.html` }, under14Sess);
    await waitForCondition(
      () => cdp.eval(under14Sess, `Boolean(document.getElementById('tabSignIn') && window.bitesharkAuth)`),
      { label: 'login.html loaded' }
    );

    // Focus Sign-In tab, press ArrowRight to switch via keyboard to Create Account (14+)!
    await cdp.eval(under14Sess, `document.getElementById('tabSignIn').focus()`);
    await cdp.pressKey(under14Sess, 'ArrowRight', 'ArrowRight', 39);

    const a11ySignupCheck = await cdp.eval(
      under14Sess,
      `(() => {
        const active = document.activeElement;
        const st = getComputedStyle(active);
        const fs = document.getElementById('dobFieldset');
        const monthLbl = document.querySelector('label[for="dobMonth"]')?.textContent || '';
        const dayLbl = document.querySelector('label[for="dobDay"]')?.textContent || '';
        const yearLbl = document.querySelector('label[for="dobYear"]')?.textContent || '';
        const errRole = document.getElementById('error')?.getAttribute('role') || '';
        return {
          activeId: active.id,
          signUpSelected: document.getElementById('tabSignUp').getAttribute('aria-selected'),
          dobVisible: !fs.hidden && !fs.disabled,
          describedBy: fs.getAttribute('aria-describedby'),
          hasLegend: Boolean(fs.querySelector('legend')?.textContent.includes('14')),
          hasAllLabels: Boolean(monthLbl && dayLbl && yearLbl),
          errRole,
          outlineWidth: st.outlineWidth
        };
      })()`
    );
    assert.equal(a11ySignupCheck.activeId, 'tabSignUp', 'ArrowRight must move focus to Create account (14+) tab');
    assert.equal(a11ySignupCheck.signUpSelected, 'true');
    assert.equal(a11ySignupCheck.dobVisible, true);
    assert.equal(a11ySignupCheck.describedBy, 'dobPurposeNote');
    assert.equal(a11ySignupCheck.hasLegend, true);
    assert.equal(a11ySignupCheck.hasAllLabels, true);
    assert.equal(a11ySignupCheck.errRole, 'alert');

    // Submit age 12 (`2014-05-12`) in browser -> rejected, DOB inputs cleared & locked, zero DOB in URL/storage!
    await cdp.eval(
      under14Sess,
      `(() => {
        document.getElementById('email').value = 'young12@legale2e.biteshark.invalid';
        document.getElementById('dobMonth').value = '05';
        document.getElementById('dobDay').value = '12';
        document.getElementById('dobYear').value = '2014';
        document.getElementById('emailForm').requestSubmit();
      })()`
    );

    const under14Result = await waitForCondition(
      () =>
        cdp.eval(
          under14Sess,
          `(() => {
            const errText = document.getElementById('error')?.textContent || '';
            if (!errText) return null;
            return {
              errText,
              fieldsetDisabled: document.getElementById('dobFieldset').disabled,
              sendDisabled: document.getElementById('sendBtn').disabled,
              yearCleared: document.getElementById('dobYear').value === '',
              href: location.href,
              lsDump: JSON.stringify(localStorage),
              ssDump: JSON.stringify(sessionStorage)
            };
          })()`
        ),
      { label: 'under-14 browser error message' }
    );
    assert(under14Result.errText.includes('14 years old'));
    assert.equal(under14Result.fieldsetDisabled, true);
    assert.equal(under14Result.sendDisabled, true);
    assert.equal(under14Result.yearCleared, true);
    assert(!under14Result.href.includes('2014') && !under14Result.lsDump.includes('2014') && !under14Result.ssDump.includes('2014'));

    // Even if script tries `window.bitesharkAuth.startLogin` with a fake adult DOB in the same browser context,
    // `__Host-bs_age_gate` HttpOnly cookie blocks immediate retry!
    const sameBrowserRetryCode = await cdp.eval(
      under14Sess,
      `(async () => {
        try {
          await window.bitesharkAuth.startLogin({
            email: 'young12@legale2e.biteshark.invalid',
            intent: 'signup',
            dob: '1988-01-01'
          });
          return 'UNEXPECTED_OK';
        } catch (err) {
          return err.code || String(err.status);
        }
      })()`
    );
    assert.equal(sameBrowserRetryCode, 'AGE_INELIGIBLE');
    console.log('PASS [E2E 2/5]: Keyboard ArrowRight tab switch, labeled DOB fieldset, under-14 refusal, DOM scrubbing, and browser cooldown verified');

    // =========================================================================
    // [E2E 3/5] Eligible 14+ Browser Signup & Existing-Account Next-Sign-In Assessment
    // =========================================================================
    const teen14Sess = await newIsolatedPage();
    const teen14Email = `teen14@${allowedDomain}`;
    await cdp.send('Page.navigate', { url: `${baseUrl}/login.html?mode=signup&next=%2F` }, teen14Sess);
    await waitForCondition(
      () => cdp.eval(teen14Sess, `document.getElementById('dobFieldset')?.hidden === false`),
      { label: 'signup mode preselected via ?mode=signup' }
    );
    await cdp.eval(
      teen14Sess,
      `(() => {
        document.getElementById('email').value = ${JSON.stringify(teen14Email)};
        document.getElementById('dobMonth').value = '06';
        document.getElementById('dobDay').value = '15';
        document.getElementById('dobYear').value = '2011';
        document.getElementById('emailForm').requestSubmit();
      })()`
    );
    await waitForCondition(
      () => cdp.eval(teen14Sess, `document.getElementById('codeStep')?.hidden === false`),
      { label: 'teen14 OTP code step shown' }
    );
    const teenOtp = await fetchOtp(teen14Email);
    await cdp.eval(
      teen14Sess,
      `(() => {
        document.getElementById('code').value = ${JSON.stringify(teenOtp)};
        document.getElementById('codeForm').requestSubmit();
      })()`
    );
    await waitForCondition(
      () => cdp.eval(teen14Sess, `location.pathname === '/' && Boolean(window.bitesharkReady)`),
      { label: 'teen14 redirected to main app' }
    );

    // Existing `'not_assessed'` user signs in via Sign-In tab (without DOB) -> prompted by `#ageAssessmentStep`!
    const existingSess = await newIsolatedPage();
    await cdp.send('Page.navigate', { url: `${baseUrl}/login.html?next=%2F` }, existingSess);
    await waitForCondition(
      () => cdp.eval(existingSess, `Boolean(window.__bitesharkLoginReady)`),
      { label: 'existing user login.html loaded' }
    );
    await cdp.eval(
      existingSess,
      `(() => {
        document.getElementById('email').value = ${JSON.stringify(existingUnassessedEmail)};
        document.getElementById('emailForm').requestSubmit();
      })()`
    );
    await waitForCondition(
      () => cdp.eval(existingSess, `document.getElementById('codeStep')?.hidden === false`),
      { label: 'existing user code step shown' }
    );
    const existingOtp = await fetchOtp(existingUnassessedEmail);
    await cdp.eval(
      existingSess,
      `(() => {
        document.getElementById('code').value = ${JSON.stringify(existingOtp)};
        document.getElementById('codeForm').requestSubmit();
      })()`
    );

    // Must stop on `#ageAssessmentStep` before redirecting!
    await waitForCondition(
      () => cdp.eval(existingSess, `document.getElementById('ageAssessmentStep')?.hidden === false`),
      { label: 'existing unassessed account shown one-time 14+ check step' }
    );
    await cdp.eval(
      existingSess,
      `(() => {
        document.getElementById('assessDobMonth').value = '04';
        document.getElementById('assessDobDay').value = '19';
        document.getElementById('assessDobYear').value = '1989';
        document.getElementById('ageAssessmentForm').requestSubmit();
      })()`
    );
    await waitForCondition(
      () => cdp.eval(existingSess, `location.pathname === '/'`),
      { label: 'existing user redirected to / after completing 14+ assessment' }
    );
    console.log('PASS [E2E 3/5]: 14+ browser signup and existing-account next-sign-in 14+ assessment flow verified');

    // =========================================================================
    // [E2E 4/5] Unassessed Top Admin `/admin` Gate -> Assessment -> Zero-Loop Return to `/admin`
    // =========================================================================
    const topSess = await newIsolatedPage();
    await cdp.send('Page.navigate', { url: `${baseUrl}/login.html?next=%2Fadmin` }, topSess);
    await waitForCondition(() => cdp.eval(topSess, `Boolean(window.bitesharkAuth)`), { label: 'top login ready' });
    // Sign in WITHOUT DOB so `topEmail` remains `not_assessed`, then navigate directly to `/admin`:
    // `/admin` must redirect cleanly to `/login.html?assess=1&next=%2Fadmin` without fabricating eligibility or looping!
    await cdp.eval(
      topSess,
      `(async () => {
        await window.bitesharkAuth.startLogin({ email: ${JSON.stringify(topEmail)} });
      })()`
    );
    const topOtp = await fetchOtp(topEmail);
    await cdp.eval(
      topSess,
      `(async () => {
        await window.bitesharkAuth.verifyCode({ email: ${JSON.stringify(topEmail)}, code: ${JSON.stringify(topOtp)} });
        location.href = '/admin';
      })()`
    );

    // Must land on `/login.html?assess=1&next=%2Fadmin` with `#ageAssessmentStep` visible!
    await waitForCondition(
      () =>
        cdp.eval(
          topSess,
          `location.pathname === '/login.html' && location.search.includes('assess=1') && document.getElementById('ageAssessmentStep')?.hidden === false`
        ),
      { label: 'unassessed Top Admin redirected from /admin to /login.html?assess=1&next=%2Fadmin' }
    );

    // Complete 14+ age assessment -> must return directly to `/admin` with zero redirect loop!
    await cdp.eval(
      topSess,
      `(() => {
        document.getElementById('assessDobMonth').value = '02';
        document.getElementById('assessDobDay').value = '10';
        document.getElementById('assessDobYear').value = '1985';
        document.getElementById('ageAssessmentForm').requestSubmit();
      })()`
    );

    const topBannerState = await waitForCondition(
      () =>
        cdp.eval(
          topSess,
          `(() => {
            const banner = document.getElementById('adminLaunchReminderBanner');
            const ovCount = document.getElementById('ovUnresolvedReadiness')?.textContent || '';
            if (!banner || banner.hidden || !ovCount || ovCount === '0') return null;
            return {
              headline: document.getElementById('launchReminderHeadline')?.textContent || '',
              subnote: document.getElementById('launchReminderSubnote')?.textContent || '',
              unresolvedCount: Number(ovCount)
            };
          })()`
        ),
      { label: 'Top Admin launch reminder banner & Overview unresolved count' }
    );
    assert.equal(
      topBannerState.headline,
      'Legal review and launch readiness remain incomplete. Draft policies are not approved for public rollout.'
    );
    assert(topBannerState.subnote.includes('not technically prevented'));
    assert.equal(topBannerState.unresolvedCount, 22);

    // Click "Open Readiness Checklist ->" button on the reminder banner
    await cdp.eval(topSess, `document.getElementById('launchReminderOpenReadinessBtn').click()`);
    await waitForCondition(
      () =>
        cdp.eval(
          topSess,
          `!document.getElementById('sec-readiness').hidden && document.querySelectorAll('[data-readiness-key]').length === 23`
        ),
      { label: '23 readiness items rendered in /admin#readiness' }
    );

    // Select `terms_and_vendor_agreement`, record structured 4-field legal approval -> verify unresolved drops to 21!
    await cdp.eval(
      topSess,
      `(() => {
        document.querySelector('[data-readiness-key="terms_and_vendor_agreement"]').click();
      })()`
    );
    await waitForCondition(
      () => cdp.eval(topSess, `Boolean(document.getElementById('rtStatus'))`),
      { label: 'Top readiness detail form rendered' }
    );
    await cdp.eval(
      topSess,
      `(() => {
        document.getElementById('rtStatus').value = 'legally_approved';
        document.getElementById('rtPolicyVersion').value = 'terms-v1.0-ca';
        document.getElementById('rtApprovedVersion').value = 'terms-v1.0-ca';
        document.getElementById('rtApprovedScope').value = 'California, USA initial Sonoma directory rollout';
        document.getElementById('rtReviewerName').value = 'Marcus Reid, Esq. (Outside Commercial Counsel)';
        document.getElementById('rtReviewedAt').value = '2026-11-19';
        document.getElementById('readinessTopUpdateForm').requestSubmit();
      })()`
    );

    await waitForCondition(
      () =>
        cdp.eval(
          topSess,
          `document.getElementById('rsUnresolvedCritical')?.textContent === '21' && document.getElementById('rsLegallyApproved')?.textContent === '1'`
        ),
      { label: 'Structured legal approval saved and unresolved count decremented to 21' }
    );

    // Now edit `rtPolicyVersion` (`terms-v1.1-draft`) on that approved item -> verify auto-transition to `Needs re-review`!
    await cdp.eval(
      topSess,
      `(() => {
        document.getElementById('rtPolicyVersion').value = 'terms-v1.1-draft';
        document.getElementById('readinessTopUpdateForm').requestSubmit();
      })()`
    );
    await waitForCondition(
      () =>
        cdp.eval(
          topSess,
          `document.getElementById('rsNeedsReReview')?.textContent === '1' && document.getElementById('readinessDetailPane')?.textContent.includes('auto_needs_re_review')`
        ),
      { label: 'Material policy edit automatically marked item Needs re-review with history preserved' }
    );
    console.log('PASS [E2E 4/5]: Top Admin launch reminder banner, 23-item checklist UI, structured legal approval & auto-re-review verified');

    // =========================================================================
    // [E2E 5/5] Mod Admin `/admin#readiness` Scope & Redacted Counsel Material
    // =========================================================================
    const modSess = await newIsolatedPage();
    await cdp.send('Page.navigate', { url: `${baseUrl}/login.html?next=%2Fadmin%23readiness` }, modSess);
    await waitForCondition(() => cdp.eval(modSess, `Boolean(window.bitesharkAuth)`), { label: 'mod login ready' });
    await cdp.eval(
      modSess,
      `(async () => {
        await window.bitesharkAuth.startLogin({ email: ${JSON.stringify(modEmail)} });
      })()`
    );
    const modOtp = await fetchOtp(modEmail);
    await cdp.eval(
      modSess,
      `(async () => {
        await window.bitesharkAuth.verifyCode({ email: ${JSON.stringify(modEmail)}, code: ${JSON.stringify(modOtp)} });
        location.href = '/admin#readiness';
      })()`
    );

    const modUiState = await waitForCondition(
      () =>
        cdp.eval(
          modSess,
          `(() => {
            const items = document.querySelectorAll('[data-readiness-key]');
            if (!items.length) return null;
            const ageBtn = document.querySelector('[data-readiness-key="minimum_signup_age_14"]');
            if (ageBtn) ageBtn.click();
            const paneText = document.getElementById('readinessDetailPane')?.textContent || '';
            return {
              itemCount: items.length,
              hasLaunchGate: Boolean(document.querySelector('[data-readiness-key="final_legal_launch_gate"]')),
              hasTopForm: Boolean(document.getElementById('readinessTopUpdateForm')),
              hasModForm: Boolean(document.getElementById('readinessModNoteForm')),
              counselLeaked: paneText.includes('CONFIDENTIAL MEMO'),
              showsRedactedNotice: paneText.includes('restricted to Admin: Top')
            };
          })()`
        ),
      { label: 'Mod Admin /admin#readiness loaded' }
    );
    assert(modUiState.itemCount >= 15 && modUiState.itemCount < 23);
    assert.equal(modUiState.hasLaunchGate, false, 'Mod must not see final_legal_launch_gate');
    assert.equal(modUiState.hasTopForm, false, 'Mod must not see Top approval/governance form');
    assert.equal(modUiState.hasModForm, true, 'Mod must see operational note form');
    assert.equal(modUiState.counselLeaked, false, 'Confidential counsel notes must not leak to Mod UI');
    assert.equal(modUiState.showsRedactedNotice, true);

    await cdp.eval(
      modSess,
      `(() => {
        document.getElementById('rmOperationalNote').value = 'Browser E2E Mod operational verification note.';
        document.getElementById('readinessModNoteForm').requestSubmit();
      })()`
    );
    await waitForCondition(
      () =>
        cdp.eval(
          modSess,
          `document.getElementById('readinessDetailPane')?.textContent.includes('Browser E2E Mod operational verification note.')`
        ),
      { label: 'Mod operational note saved and rendered in detail pane' }
    );
    console.log('PASS [E2E 5/5]: Mod Admin readiness UI scope, counsel redaction, and operational note submission verified');

    console.log('ALL HEADLESS CHROME LEGAL-POLICY, ACCESSIBILITY & READINESS E2E CHECKS PASSED.');
  } finally {
    if (cdp) cdp.close();
    if (chromeProc) {
      try { chromeProc.kill('SIGKILL'); } catch {}
    }
    if (serverProc) {
      try { serverProc.kill('SIGTERM'); } catch {}
    }
    if (migratorPool) await migratorPool.end().catch(() => {});
    await adminPool.end().catch(() => {});
    await pgCluster.stop().catch(() => {});
    if (chromeProfileDir) {
      try { fs.rmSync(chromeProfileDir, { recursive: true, force: true }); } catch {}
    }
  }
})().catch(err => {
  console.error('FAIL legal-readiness-browser.e2e.cjs:', err);
  process.exitCode = 1;
});
