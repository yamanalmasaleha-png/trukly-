// Real PostgreSQL + Mock GitHub Git Data API Integration Suite for BiteShark
// Style Guide Admin Workspace, Live Hosted Section Population & Repo Push
// (`tests/style-guide-admin.integration.cjs`)

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
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-sg-int-pg-'));
  const dataDir = path.join(tmpBase, 'data');
  const pwFile = path.join(tmpBase, 'pw.txt');
  const logFile = path.join(tmpBase, 'postgres.log');
  const password = 'sg_' + crypto.randomBytes(6).toString('hex');
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

function createCookieJarClient(baseUrl) {
  const cookies = new Map();
  async function req(method, relPath, body = undefined, headers = {}) {
    const cookieHeader = [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
    const res = await fetch(`${baseUrl}${relPath}`, {
      method,
      redirect: 'manual',
      headers: {
        Origin: baseUrl,
        'X-BiteShark-Admin-Portal': '1',
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers
      },
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    for (const sc of setCookies) {
      const parts = sc.split(';').map(s => s.trim());
      const eq = parts[0].indexOf('=');
      if (eq > 0) {
        const name = parts[0].slice(0, eq);
        const val = parts[0].slice(eq + 1);
        const isMaxAgeZero = parts.some(p => /^max-age=0$/i.test(p));
        if (isMaxAgeZero || val === '') cookies.delete(name);
        else cookies.set(name, val);
      }
    }
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {}
    return { status: res.status, json, text, cookies };
  }
  return { req, cookies };
}

async function startMockGitHubApiServer(expectedToken) {
  const state = {
    blobs: new Map(),
    trees: [],
    commits: [],
    refUpdates: [],
    authHeadersSeen: []
  };

  const srv = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const auth = String(req.headers.authorization || '');
      state.authHeadersSeen.push(auth);
      if (auth !== `Bearer ${expectedToken}`) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Bad credentials' }));
        return;
      }

      const bodyText = Buffer.concat(chunks).toString('utf8');
      const body = bodyText ? JSON.parse(bodyText) : null;
      const urlPath = req.url.split('?')[0];

      if (req.method === 'GET' && urlPath.includes('/git/ref/heads/')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            ref: 'refs/heads/working/biteshark-vps',
            object: { sha: '1111111111111111111111111111111111111111', type: 'commit' }
          })
        );
        return;
      }

      if (req.method === 'GET' && urlPath.includes('/git/commits/')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            sha: '1111111111111111111111111111111111111111',
            tree: { sha: '2222222222222222222222222222222222222222' }
          })
        );
        return;
      }

      if (req.method === 'POST' && urlPath.endsWith('/git/blobs')) {
        const sha = crypto.createHash('sha1').update(String(body.content || ''), 'utf8').digest('hex');
        state.blobs.set(sha, body.content);
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ sha }));
        return;
      }

      if (req.method === 'POST' && urlPath.endsWith('/git/trees')) {
        state.trees.push(body);
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ sha: '3333333333333333333333333333333333333333' }));
        return;
      }

      if (req.method === 'POST' && urlPath.endsWith('/git/commits')) {
        state.commits.push(body);
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ sha: 'abcdef0123456789abcdef0123456789abcdef01' }));
        return;
      }

      if ((req.method === 'PATCH' || req.method === 'POST') && urlPath.includes('/git/refs')) {
        state.refUpdates.push({ method: req.method, urlPath, body });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ref: urlPath, object: { sha: body.sha } }));
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Mock endpoint not found: ' + urlPath }));
    });
  });

  const port = await getFreePort();
  await new Promise((resolve, reject) => {
    srv.listen(port, '127.0.0.1', err => (err ? reject(err) : resolve()));
  });

  return {
    apiUrl: `http://127.0.0.1:${port}`,
    state,
    stop: () => new Promise(r => srv.close(() => r()))
  };
}

(async () => {
  const pgCluster = await createPostgresCluster();
  const adminPool = new Pool({ connectionString: pgCluster.adminUrl, max: 2 });
  const suffix = crypto.randomBytes(3).toString('hex');
  const migratorRole = `bs_sg_mig_${suffix}`;
  const appRole = `bs_sg_app_${suffix}`;
  const dbName = `bs_sg_test_${suffix}`;
  const migratorPass = 'mig_' + crypto.randomBytes(6).toString('hex');
  const appPass = 'app_' + crypto.randomBytes(6).toString('hex');
  const sgStorageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-sg-storage-'));
  const photoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-sg-photos-'));
  const mockGhToken = 'github_pat_synthetic_test_token_1234567890';
  const mockGh = await startMockGitHubApiServer(mockGhToken);

  let migratorPool = null;
  let serverProc = null;

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

    const topEmail = 'top-sg@staging.biteshark.invalid';
    const modEmail = 'mod-sg@staging.biteshark.invalid';
    const custEmail = 'cust-sg@staging.biteshark.invalid';

    execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'bootstrap-top-admin.cjs'), '--email', topEmail], {
      cwd: ROOT,
      env: { ...process.env, MIGRATION_DATABASE_URL: migratorDbUrl },
      stdio: 'pipe',
      windowsHide: true
    });

    migratorPool = new Pool({ connectionString: migratorDbUrl, max: 2 });

    const port = await getFreePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    const mailboxSecret = 'sgmbx_' + crypto.randomBytes(16).toString('hex');

    serverProc = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
      cwd: ROOT,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        HOST: '127.0.0.1',
        PORT: String(port),
        DATABASE_URL: appDbUrl,
        BITESHARK_ENV: 'staging',
        BITESHARK_RELEASE_SHA: 'sg-integration-sha',
        BITESHARK_AUTH_SECRET: crypto.randomBytes(32).toString('hex'),
        BITESHARK_AUTH_DELIVERY_MODE: 'staging_mailbox',
        BITESHARK_STAGING_MAILBOX_SECRET: mailboxSecret,
        BITESHARK_STAGING_ALLOWED_EMAIL_DOMAINS: 'staging.biteshark.invalid',
        BITESHARK_PUSH_PROVIDER_MODE: 'disabled',
        BITESHARK_PHOTO_STORAGE_DIR: photoDir,
        BITESHARK_STYLE_GUIDE_STORAGE_DIR: sgStorageDir,
        BITESHARK_STYLE_GUIDE_GITHUB_API_URL: mockGh.apiUrl,
        BITESHARK_STYLE_GUIDE_GITHUB_REPO: 'yamanalmasaleha-png/trukly-',
        BITESHARK_STYLE_GUIDE_GITHUB_BRANCH: 'working/biteshark-vps'
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

    async function signInUser(email) {
      const client = createCookieJarClient(baseUrl);
      await client.req(
        'POST',
        '/api/auth/start',
        { email, intent: 'signup', dob: '1990-02-14' },
        { 'X-BiteShark-Client': 'web-auth-v1' }
      );
      const mbx = await client.req(
        'POST',
        '/api/auth/staging-mailbox',
        { email },
        { 'X-Staging-Mailbox-Secret': mailboxSecret }
      );
      const ver = await client.req(
        'POST',
        '/api/auth/verify',
        { email, code: mbx.json.code },
        { 'X-BiteShark-Client': 'web-auth-v1' }
      );
      assert.equal(ver.status, 200);
      return { client, user: ver.json.user };
    }

    const anon = createCookieJarClient(baseUrl);
    const { client: topClient, user: topUser } = await signInUser(topEmail);
    const { client: modClient, user: modUser } = await signInUser(modEmail);
    const { client: custClient } = await signInUser(custEmail);

    // Grant Admin: Mod to modUser
    await migratorPool.query(
      `INSERT INTO platform_roles (user_id, role, granted_by) VALUES ($1, 'mod', $2)`,
      [modUser.id, topUser.id]
    );

    // 1. RBAC: Anonymous 401 & Customer 403
    const anonGet = await anon.req('GET', '/api/admin/style-guide');
    assert.equal(anonGet.status, 401);
    const custGet = await custClient.req('GET', '/api/admin/style-guide');
    assert.equal(custGet.status, 403);

    // 2. Load initial workspace
    const initWs = await topClient.req('GET', '/api/admin/style-guide');
    assert.equal(initWs.status, 200);
    assert.equal(initWs.json.topics.length, 15);
    assert.ok(initWs.json.components.length >= 25);
    assert.equal(initWs.json.decisions.length, 773);
    assert.equal(initWs.json.has_unpushed_changes, false);
    assert.equal(initWs.json.stats.totals.approved, 0);

    // 3. Admin: Mod can save draft answers & optional notes (even on unanswered items!), but cannot approve or push
    const modSaveDraftAndNote = await modClient.req('POST', '/api/admin/style-guide/save', {
      expected_revision: initWs.json.revision,
      updates: [
        {
          decision_id: 'DEC-TYP-DISPLAY-FAMILY',
          status: 'draft',
          applicability: 'applicable',
          value: "'Fredoka', Georgia, serif"
        },
        {
          decision_id: 'DEC-FND-BRAND-ATTRIBUTES',
          status: 'unanswered',
          applicability: 'applicable',
          value: null,
          notes: 'Optional team note without filling an answer yet — verify outdoor readability.'
        }
      ]
    });
    assert.equal(modSaveDraftAndNote.status, 200, JSON.stringify(modSaveDraftAndNote.json));
    assert.equal(modSaveDraftAndNote.json.stats.totals.draft, 1);
    assert.equal(modSaveDraftAndNote.json.stats.with_notes_count, 1);

    const modTryApprove = await modClient.req('POST', '/api/admin/style-guide/save', {
      updates: [
        {
          decision_id: 'DEC-FND-THEME-POLICY',
          status: 'approved',
          applicability: 'applicable',
          value: 'light_only'
        }
      ]
    });
    assert.equal(modTryApprove.status, 403);

    const modTryPush = await modClient.req('POST', '/api/admin/style-guide/push', {
      github_token: mockGhToken
    });
    assert.equal(modTryPush.status, 403);

    // 4. Admin: Top approves decisions across enum_choice, boolean, token_map, structured_spec & N/A (without notes required!)
    const topSave = await topClient.req('POST', '/api/admin/style-guide/save', {
      expected_revision: modSaveDraftAndNote.json.revision,
      updates: [
        {
          decision_id: 'DEC-FND-THEME-POLICY',
          status: 'approved',
          applicability: 'applicable',
          value: 'light_only',
          approved_by: 'Matt Callaway',
          approved_at: '2026-11-23'
        },
        {
          decision_id: 'DEC-OVL-SEQUENTIAL-MODALS',
          status: 'approved',
          applicability: 'applicable',
          value: true,
          approved_by: 'Matt Callaway',
          approved_at: '2026-11-23'
        },
        {
          decision_id: 'DEC-FND-SURFACE-INK-ROLES',
          status: 'approved',
          applicability: 'applicable',
          value: {
            canvas_bg: '#FFFDF7',
            card_surface: '#FFFFFF',
            ink_primary: '#234B3A'
          },
          approved_by: 'Yaman',
          approved_at: '2026-11-23',
          notes: 'Matches warm Sonoma cream and forest green contrast floor.'
        },
        {
          decision_id: 'DEC-UNCONF-DARK-THEME-APPLICABILITY',
          status: 'not_applicable',
          applicability: 'not_applicable',
          value: null,
          not_applicable_reason: 'Light-only palette selected in DEC-FND-THEME-POLICY.'
        }
      ]
    });
    assert.equal(topSave.status, 200, JSON.stringify(topSave.json));
    assert.equal(topSave.json.stats.totals.approved, 3);
    assert.equal(topSave.json.stats.totals.not_applicable, 1);
    assert.equal(topSave.json.stats.resolved_count, 4);
    assert.equal(topSave.json.has_unpushed_changes, true);

    // 5. Verify live hosted Style Guide Markdown sections are populated immediately!
    const fndDoc = await topClient.req('GET', '/api/admin/style-guide/doc?file=foundations.md');
    assert.equal(fndDoc.status, 200);
    assert.match(fndDoc.json.content, /light_only/);
    assert.match(fndDoc.json.content, /#234B3A/);
    assert.match(fndDoc.json.content, /Matches warm Sonoma cream and forest green contrast floor/);
    assert.match(fndDoc.json.content, /Optional team note without filling an answer yet/);

    const remDoc = await topClient.req('GET', '/api/admin/style-guide/doc?file=COMPLETION-REMINDER.md');
    assert.equal(remDoc.status, 200);
    assert.match(remDoc.json.content, /Partially Completed Style Guide/);
    assert.match(remDoc.json.content, /\*\*3\*\* approved/);

    // Verify hosted files were also materialized onto persistent storage disk
    assert.ok(
      fs.existsSync(path.join(sgStorageDir, 'hosted/docs/engineering/style-guide/foundations.md')),
      'Expected foundations.md materialized in hosted storage directory'
    );

    // 6. Push Style Guide answers to Mock GitHub Repository via Git Data API
    const pushRes = await topClient.req('POST', '/api/admin/style-guide/push', {
      branch: 'working/biteshark-vps',
      commit_message: 'docs(style-guide): record Foundations & Dialog decisions',
      author_name: 'Matt Callaway',
      author_email: 'mattcallawaysemail@gmail.com',
      github_token: mockGhToken
    });
    assert.equal(pushRes.status, 200, JSON.stringify(pushRes.json));
    assert.equal(pushRes.json.files_committed_count, 19);
    assert.equal(pushRes.json.commit_sha, 'abcdef0123456789abcdef0123456789abcdef01');
    assert.equal(pushRes.json.has_unpushed_changes, false);

    assert.equal(mockGh.state.trees.length, 1);
    assert.equal(mockGh.state.trees[0].tree.length, 19);
    for (const entry of mockGh.state.trees[0].tree) {
      assert.ok(
        entry.path.startsWith('docs/engineering/style-guide/'),
        `Unexpected path in pushed tree: ${entry.path}`
      );
    }

    // Verify zero token leakage in workspace-state.json or audit_logs
    const wsStateRaw = fs.readFileSync(path.join(sgStorageDir, 'workspace-state.json'), 'utf8');
    assert.ok(!wsStateRaw.includes(mockGhToken), 'One-time GitHub token must never be persisted on disk');

    const auditRows = await migratorPool.query(
      `SELECT action, metadata::text AS meta_text FROM audit_logs WHERE target_type = 'style_guide' ORDER BY created_at ASC`
    );
    assert.ok(auditRows.rows.some(r => r.action === 'style_guide_decisions_saved'));
    assert.ok(auditRows.rows.some(r => r.action === 'style_guide_pushed_to_github'));
    for (const row of auditRows.rows) {
      assert.ok(!String(row.meta_text).includes(mockGhToken), 'GitHub token must never appear in audit_logs');
    }

    // 7. Feature control `admin_style_guide_workspace` pause & hide enforcement
    const fcList = await topClient.req('GET', '/api/admin/features');
    const sgFc = (fcList.json.controls || []).find(c => c.key === 'admin_style_guide_workspace');
    assert.ok(sgFc, 'Expected admin_style_guide_workspace in feature controls');

    const pauseFc = await topClient.req('POST', '/api/admin/features/update', {
      feature_key: 'admin_style_guide_workspace',
      configured_state: 'paused',
      audience: 'all',
      expected_revision: sgFc.revision,
      reason: 'Pause Style Guide saves while keeping hosted sections readable'
    });
    assert.equal(pauseFc.status, 200);

    const readWhilePaused = await topClient.req('GET', '/api/admin/style-guide/doc?file=foundations.md');
    assert.equal(readWhilePaused.status, 200, 'Hosted Style Guide sections remain readable while paused');

    const saveWhilePaused = await topClient.req('POST', '/api/admin/style-guide/save', {
      updates: [{ decision_id: 'DEC-TYP-DISPLAY-FAMILY', status: 'draft', value: 'DM Sans, sans-serif' }]
    });
    assert.equal(saveWhilePaused.status, 503, 'Saves must return 503 FEATURE_PAUSED while paused');

    console.log('[style-guide-admin.integration] PASS — all RBAC, completion tracking, optional notes, live hosted Markdown population & GitHub push checks succeeded.');
  } finally {
    if (serverProc) {
      serverProc.kill('SIGTERM');
    }
    await mockGh.stop().catch(() => {});
    if (migratorPool) await migratorPool.end().catch(() => {});
    await adminPool.end().catch(() => {});
    await pgCluster.stop().catch(() => {});
    try {
      fs.rmSync(sgStorageDir, { recursive: true, force: true });
      fs.rmSync(photoDir, { recursive: true, force: true });
    } catch {}
  }
})().catch(err => {
  console.error('[style-guide-admin.integration] FAILED:', err);
  process.exit(1);
});
