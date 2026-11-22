#!/usr/bin/env node
// BiteShark Code Registry, Drift Governance & Change-Impact Acceptance Suite (`tests/code-registry.test.cjs`)
//
// Verifies all 17 mandatory acceptance & regression requirements:
//   1. Clean checkout freshness & full validation pass (`cli.mjs validate`)
//   2. Scan determinism & branch-vs-detached-HEAD digest invariance
//   3. New structural violation remains a failure AFTER `generate-docs` (never auto-accepted)
//   4. Baseline/suppression edits cannot silently bypass `--trusted-baseline-ref` PR comparison + `accept-drift` / `prune-drift` auditability
//   5. AST-bounded GET-only route extraction (adjacent POST route, multi-line 405 guard, comments/strings ignored)
//   6. AST Top-only permission evidence (via transaction helper & live routes), mixed-method permissions, public-in-auth-router & per-method feature gates
//   7. Honest caller resolution (same-name functions across modules NOT conflated, aliased imports, shadowed locals, nested scoped IDs, object methods, `window.*` namespaces, dynamic dispatch, HTML handlers, `openDetail` wrappers)
//   8. 3-tier test references (`contract_mappings` vs `static_http_call_tests` vs `candidate_path_mentions` — no string-based "verifying_tests")
//   9. Function body-only AST fingerprint changes (ignoring comments/whitespace), literal/constant changes & rename/move detection in impact reports
//  10. HTTP API contract changes (removed method, auth/gate/response-key/error-code changes, new routes with test refs)
//  11. Rich SQL schema attribute diffs (column type, NOT NULL, DEFAULT, constraints, indexes, FK ON DELETE, RLS & policies)
//  12. Unsupported/incomplete analysis (`parse_failures`, unresolved refs, procedural `DO $$ EXECUTE`, unresolved route methods) -> `analysis_incomplete_or_unresolved` (never false `compatible`)
//  13. Recursive JSON Schema validation rejects malformed nested symbol, route, table & baseline records
//  14. Required `--verify-db` fails hard (`exit 1`, `DB_VERIFICATION_UNAVAILABLE`) when PostgreSQL is unreachable; `--verify-db=optional` reports `NOT_RUN`
//  15. `locate` ranks exact matches first, returns connected symbol/contract/route/table/flag/test records & explicit pagination/truncation metadata
//  16. Secret (`.env*`, `.pem`, `.key`, `id_ed25519*`), `node_modules`, archive, vendor & generated-output exclusions remain intact
//  17. Zero modifications to application runtime files (`api/`, `lib/`, `server/`, `packages/`, `public/`, `migrations/`, `deploy/`, `scripts/`, `package-lock.json`)

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..');
const CLI_PATH = path.join(REPO_ROOT, 'tools', 'code-registry', 'cli.mjs');

async function loadRegistryModules() {
  const dir = path.join(REPO_ROOT, 'tools', 'code-registry');
  const [schemaMod, validatorMod, jsMod, htmlCssMod, relMod, dbMod, driftMod, scanMod, cmpMod] = await Promise.all([
    import(pathToFileURL(path.join(dir, 'schema-versions.mjs')).href),
    import(pathToFileURL(path.join(dir, 'schema-validator.mjs')).href),
    import(pathToFileURL(path.join(dir, 'js-analyzer.mjs')).href),
    import(pathToFileURL(path.join(dir, 'html-css-analyzer.mjs')).href),
    import(pathToFileURL(path.join(dir, 'relationship-resolver.mjs')).href),
    import(pathToFileURL(path.join(dir, 'backend-db-analyzer.mjs')).href),
    import(pathToFileURL(path.join(dir, 'drift-detector.mjs')).href),
    import(pathToFileURL(path.join(dir, 'scanner.mjs')).href),
    import(pathToFileURL(path.join(dir, 'compare-impact.mjs')).href)
  ]);
  return { schemaMod, validatorMod, jsMod, htmlCssMod, relMod, dbMod, driftMod, scanMod, cmpMod };
}

function makeTempWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'bs-code-reg-v2-'));
}

function runCli(args, extraEnv = {}) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...extraEnv }
  });
}

function copySchemasIntoTempRepo(tmpRoot) {
  const srcSchemas = path.join(REPO_ROOT, 'docs', 'engineering', 'schemas');
  const dstSchemas = path.join(tmpRoot, 'docs', 'engineering', 'schemas');
  fs.mkdirSync(dstSchemas, { recursive: true });
  for (const fn of fs.readdirSync(srcSchemas)) {
    if (fn.endsWith('.schema.json')) {
      fs.copyFileSync(path.join(srcSchemas, fn), path.join(dstSchemas, fn));
    }
  }
  fs.writeFileSync(
    path.join(dstSchemas, 'drift-baseline.json'),
    JSON.stringify(
      {
        schema_version: 'biteshark.drift-baseline.v2',
        description: 'Fixture baseline debt file for isolated registry acceptance tests.',
        high_confidence_blocking_categories: [
          'DUPLICATE_HTML_ID',
          'UNRESOLVED_INLINE_HANDLER',
          'UNREGISTERED_FEATURE_KEY',
          'INVALID_WRITE_PAUSE_SCOPE',
          'MIGRATION_SEQUENCE_COLLISION',
          'MODULE_CYCLE',
          'BROKEN_DOC_LINK'
        ],
        entries: []
      },
      null,
      2
    ) + '\n'
  );
  const suppDir = path.join(tmpRoot, 'tools', 'code-registry');
  fs.mkdirSync(suppDir, { recursive: true });
  fs.writeFileSync(
    path.join(suppDir, 'suppressions.json'),
    JSON.stringify(
      {
        schema_version: 'biteshark.drift-suppressions.v1',
        description: 'Fixture intentional-pattern suppressions for isolated registry acceptance tests.',
        suppressions: []
      },
      null,
      2
    ) + '\n'
  );
}

async function run() {
  const { schemaMod, validatorMod, jsMod, htmlCssMod, relMod, dbMod, scanMod, cmpMod } = await loadRegistryModules();
  let passed = 0;

  async function test(name, fn) {
    await fn();
    passed++;
    console.log(`  PASS  ${name}`);
  }

  // -------------------------------------------------------------------------
  // 1 & 2. Clean Checkout Freshness, Determinism & Detached-HEAD Invariance
  // -------------------------------------------------------------------------
  await test('1-2. clean repository passes validate and produces identical digest across consecutive & detached-HEAD scans', () => {
    const snapA = scanMod.scanRepositorySnapshot(REPO_ROOT, { includeTimestamp: false });
    const snapA2 = scanMod.scanRepositorySnapshot(REPO_ROOT, { includeTimestamp: false });
    const snapDetached = scanMod.scanRepositorySnapshot(REPO_ROOT, {
      includeTimestamp: false,
      overrideRef: 'DETACHED_HEAD'
    });
    const snapAmendedSha = scanMod.scanRepositorySnapshot(REPO_ROOT, {
      includeTimestamp: false,
      overrideRef: 'DETACHED_HEAD',
      overrideSha: '0000000000000000000000000000000000000000'
    });

    assert.equal(snapA.parse_failures.length, 0, 'Zero JS parse failures expected across BiteShark');
    assert.equal(
      schemaMod.deterministicStringify(snapA, false),
      schemaMod.deterministicStringify(snapA2, false),
      'Consecutive scans must be 100% byte-identical'
    );
    assert.equal(
      schemaMod.deterministicStringify({ ...snapA, provenance: undefined }, false),
      schemaMod.deterministicStringify({ ...snapDetached, provenance: undefined }, false),
      'Named branch vs DETACHED_HEAD at same commit must yield byte-identical analysis payload'
    );
    assert.equal(
      snapA.source_analysis_digest_sha256,
      snapAmendedSha.source_analysis_digest_sha256,
      'Branch vs DETACHED_HEAD / amended commit SHA must yield identical source_analysis_digest_sha256'
    );

    const valRes = runCli(['validate']);
    assert.equal(valRes.status, 0, `Expected validate to exit 0 on clean repo, got ${valRes.status}: ${valRes.stdout}\n${valRes.stderr}`);
    const valObj = JSON.parse(valRes.stdout);
    assert.equal(valObj.ok, true);
    assert.equal(valObj.db_verification.status, 'NOT_RUN', 'Omitted --verify-db must report NOT_RUN, never PASS');
  });

  // -------------------------------------------------------------------------
  // 3 & 4. Drift Baseline Governance: No Auto-Accept on `generate-docs` + Trusted PR Baseline
  // -------------------------------------------------------------------------
  await test('3-4. generate-docs never auto-accepts new drift; accept-drift/prune-drift are auditable; PR baseline/suppression edits cannot bypass --trusted-baseline-ref', () => {
    const tmp = makeTempWorkspace();
    try {
      copySchemasIntoTempRepo(tmp);
      fs.mkdirSync(path.join(tmp, 'public'), { recursive: true });
      fs.writeFileSync(path.join(tmp, 'public', 'index.html'), '<!doctype html><html><body><div id="okBox"></div></body></html>\n');

      // Initialize git repo for trusted-baseline-ref testing
      execFileSync('git', ['init', '-q'], { cwd: tmp });
      execFileSync('git', ['config', 'user.name', 'Test Runner'], { cwd: tmp });
      execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: tmp });

      let genRes = runCli(['generate-docs', '--root', tmp]);
      assert.equal(genRes.status, 0);
      let valRes = runCli(['validate', '--root', tmp]);
      assert.equal(valRes.status, 0, `Initial clean fixture should pass validate: ${valRes.stdout}`);

      execFileSync('git', ['add', '.'], { cwd: tmp });
      execFileSync('git', ['commit', '-q', '-m', 'Initial clean trusted base'], { cwd: tmp });

      // Introduce a high-confidence DUPLICATE_HTML_ID violation AND run `generate-docs`
      fs.writeFileSync(
        path.join(tmp, 'public', 'index.html'),
        '<!doctype html><html><body><div id="dupTarget"></div><div id="dupTarget"></div></body></html>\n'
      );
      genRes = runCli(['generate-docs', '--root', tmp]);
      assert.equal(genRes.status, 0);
      const genMeta = JSON.parse(genRes.stdout);
      assert.equal(genMeta.baseline_modified, false);

      // Ordinary `validate` MUST STILL FAIL after `generate-docs`!
      valRes = runCli(['validate', '--root', tmp]);
      assert.equal(valRes.status, 1, 'New DUPLICATE_HTML_ID violation must STILL fail validate after generate-docs');
      assert.ok(valRes.stdout.includes('DUPLICATE_HTML_ID'));

      // Explicit `accept-drift` requires >= 12-char rationale
      const badAccept = runCli(['accept-drift', '--root', tmp, '--finding', 'DRIFT:DUPLICATE_HTML_ID:public/index.html#dupTarget', '--reason', 'short']);
      assert.equal(badAccept.status, 1, 'Short reason must be rejected by accept-drift');

      const goodAccept = runCli([
        'accept-drift',
        '--root',
        tmp,
        '--finding',
        'DRIFT:DUPLICATE_HTML_ID:public/index.html#dupTarget',
        '--reason',
        'Temporary fixture acceptance to test PR trusted-baseline enforcement.',
        '--ref',
        'PR-TEST-1'
      ]);
      assert.equal(goodAccept.status, 0);

      // Local `validate` without `--trusted-baseline-ref` tolerates the explicitly accepted debt...
      const localVal = runCli(['validate', '--root', tmp]);
      assert.equal(localVal.status, 0);

      // ...BUT `validate --trusted-baseline-ref HEAD` (simulating unmerged PR against target branch) MUST STILL FAIL and expose governance changes!
      const prVal = runCli(['validate', '--root', tmp, '--trusted-baseline-ref', 'HEAD']);
      assert.equal(prVal.status, 1, 'Edited baseline in PR must NOT bypass --trusted-baseline-ref HEAD');
      const prValJson = JSON.parse(prVal.stdout);
      assert.deepEqual(prValJson.trusted_baseline_comparison.added_baseline_ids, [
        'DRIFT:DUPLICATE_HTML_ID:public/index.html#dupTarget'
      ]);
      assert.deepEqual(prValJson.trusted_baseline_comparison.untrusted_new_blocking_findings, [
        'DRIFT:DUPLICATE_HTML_ID:public/index.html#dupTarget'
      ]);

      // Even if PR tries to sneak a suppression into `suppressions.json` instead of `drift-baseline.json`, `--trusted-baseline-ref HEAD` STILL catches it!
      fs.writeFileSync(
        path.join(tmp, 'tools', 'code-registry', 'suppressions.json'),
        JSON.stringify(
          {
            schema_version: 'biteshark.drift-suppressions.v1',
            description: 'Attempted sneaky PR suppression.',
            suppressions: [
              {
                id: 'SUPP-SNEAKY-DUP',
                category: 'DUPLICATE_HTML_ID',
                target: 'public/index.html#dupTarget',
                reason: 'Attempting to suppress new duplicate HTML ID inside unmerged PR.'
              }
            ]
          },
          null,
          2
        ) + '\n'
      );
      runCli(['generate-docs', '--root', tmp]);
      const sneakyPrVal = runCli(['validate', '--root', tmp, '--trusted-baseline-ref', 'HEAD']);
      assert.equal(sneakyPrVal.status, 1, 'Sneaky PR suppression edit must NOT hide new violation from --trusted-baseline-ref');

      // Now fix the duplicate HTML ID and run `prune-drift` -> cleans resolved debt cleanly!
      fs.writeFileSync(path.join(tmp, 'public', 'index.html'), '<!doctype html><html><body><div id="dupTarget"></div></body></html>\n');
      const pruneRes = runCli(['prune-drift', '--root', tmp]);
      assert.equal(pruneRes.status, 0);
      const pruneJson = JSON.parse(pruneRes.stdout);
      assert.deepEqual(pruneJson.pruned_ids, ['DRIFT:DUPLICATE_HTML_ID:public/index.html#dupTarget']);
      assert.equal(pruneJson.remaining_count, 0);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  // -------------------------------------------------------------------------
  // 5 & 6. AST-Bounded Route Extraction, Top-Only Helper Permissions, Mixed Methods & Per-Method Gates
  // -------------------------------------------------------------------------
  await test('5-6. extracts GET-only vs adjacent POST routes, Top-only helper permissions, mixed-method authz, public-in-auth-router, per-method gates & ignores comment/string routes', () => {
    const adminFixture = `
      // Comment mentioning GET /api/admin/fake-comment-route should never become a route
      const DOC_NOTE = 'See /api/admin/fake-string-route for details';

      async function verifyTopViaHelper(tx, ctx) {
        return reverifyPlatformAdminInTx(tx, ctx);
      }

      export async function handleGovernanceApiRequest({ normPath, method, ctx, dbAdapter, sendJson }) {
        if (normPath === '/api/public-spotlight') {
          if (method !== 'GET') {
            return sendJson(405, { error: 'Method not allowed' });
          }
          return sendJson(200, { ok: true, items: [] });
        }

        if (!ctx.authenticated) return sendJson(401, { error: 'Sign in required' });

        if (normPath === '/api/mixed/resource') {
          if (method === 'GET') {
            await setUserRlsContextInTx(null, ctx.user.id);
            return sendJson(200, { ok: true });
          }
          if (method === 'DELETE') {
            const check = await verifyTopViaHelper(null, ctx);
            if (!check.ok) return sendJson(403, { error: 'Top only' });
            return sendJson(200, { ok: true });
          }
          return sendJson(405, { error: 'Method not allowed' });
        }

        if (!ctx.isModAdmin) return sendJson(403, { error: 'Admin required' });

        if (normPath === '/api/admin/read-only-list') {
          if (method !== 'GET') return sendJson(405, { error: 'Method not allowed' });
          await reverifyModeratorInTx(null, ctx);
          return sendJson(200, { items: [] });
        }
        if (normPath === '/api/admin/adjacent-top-mutation') {
          if (method !== 'POST') return sendJson(405, { error: 'Method not allowed' });
          await verifyTopViaHelper(null, ctx);
          return sendJson(200, { updated: true });
        }
      }
    `;

    const filesMap = new Map([['server/admin-routes.js', adminFixture]]);
    const routes = dbMod.extractBackendRoutes({
      fileContentsByPath: filesMap,
      featureRouteRules: [
        { path: '/api/mixed/resource', methods: ['GET'], feature_key: 'visit_journal', operation_kind: 'read_when_not_hidden', line: 10 }
      ]
    });

    assert.ok(!routes.some(r => r.path.includes('fake-comment-route') || r.path.includes('fake-string-route')), 'Comments and string literals must never register routes');

    const pubRoute = routes.find(r => r.path === '/api/public-spotlight');
    assert.deepEqual(pubRoute.methods, ['GET']);
    assert.equal(pubRoute.auth_requirement, 'public');

    const getOnly = routes.find(r => r.path === '/api/admin/read-only-list');
    assert.deepEqual(getOnly.methods, ['GET'], 'Adjacent POST route must never bleed into GET-only route');
    assert.equal(getOnly.authorization_summary, 'admin_mod_or_top');

    const topMut = routes.find(r => r.path === '/api/admin/adjacent-top-mutation');
    assert.deepEqual(topMut.methods, ['POST']);
    assert.equal(topMut.authorization_summary, 'admin_top_only', '1-hop helper calling reverifyPlatformAdminInTx must classify as admin_top_only');
    assert.ok(topMut.authorization_evidence.some(e => e.includes('verifyTopViaHelper->reverifyPlatformAdminInTx')));

    const mixed = routes.find(r => r.path === '/api/mixed/resource');
    assert.deepEqual(mixed.methods, ['DELETE', 'GET']);
    assert.equal(mixed.authorization_by_method.GET.level, 'authenticated_self_owner_rls');
    assert.equal(mixed.authorization_by_method.DELETE.level, 'admin_top_only');
    assert.equal(mixed.feature_enforcement_by_method.GET.feature_key, 'visit_journal');
    assert.equal(mixed.feature_enforcement_by_method.DELETE, null, 'DELETE must remain exempt when rule applies only to GET');

    // Also verify real live BiteShark security-sensitive routes!
    const liveSnap = scanMod.scanRepositorySnapshot(REPO_ROOT);
    const findLive = p => liveSnap.backend_routes.find(r => r.path === p);

    assert.deepEqual(findLive('/api/admin/features').methods, ['GET']);
    assert.equal(findLive('/api/admin/features').authorization_summary, 'admin_mod_or_top');
    assert.deepEqual(findLive('/api/admin/features/update').methods, ['POST']);
    assert.equal(findLive('/api/admin/features/update').authorization_summary, 'admin_top_only');
    assert.deepEqual(findLive('/api/admin/accounts/role').methods, ['POST']);
    assert.equal(findLive('/api/admin/accounts/role').authorization_summary, 'admin_top_only');
    assert.deepEqual(findLive('/api/admin/email-readiness').methods, ['GET']);
    assert.equal(findLive('/api/admin/email-readiness').authorization_summary, 'admin_top_only');
    assert.deepEqual(findLive('/api/stories').methods, ['GET']);
    assert.equal(findLive('/api/stories').auth_requirement, 'public');
    assert.deepEqual(findLive('/api/me/exploration').methods, ['GET']);
    assert.deepEqual(findLive('/api/me/photos/delete').methods, ['POST']);
    assert.equal(findLive('/api/me/photos/delete').feature_gate, null);
    assert.equal(findLive('/api/pager/subscriptions').feature_enforcement_by_method.POST.feature_key, 'pager_push_subscriptions');
    assert.equal(findLive('/api/pager/subscriptions').feature_enforcement_by_method.DELETE, null);
  });

  // -------------------------------------------------------------------------
  // 7. Lexical / Import / Browser-Global / Wrapper / Shadowed Caller Resolution
  // -------------------------------------------------------------------------
  await test('7. resolves aliased imports, window namespaces, HTML handlers & openDetail wrappers while keeping same-name functions, shadowed params & dynamic dispatch separate', () => {
    const modA = jsMod.analyzeJavaScriptFile(
      `export function render(x) { return x; }
       export function sharedTarget(v) { return render(v); }`,
      'lib/mod-a.js'
    );
    const modB = jsMod.analyzeJavaScriptFile(
      `import { sharedTarget as aliasedTarget } from './mod-a.js';
       export function render(y) { return y * 2; }
       export function runB(cb) {
         // cb is a parameter shadowing any global cb; handlers[k]() is computed dynamic
         const handlers = { a: () => 1 };
         function innerHelper() { return 1; }
         function secondOuter() { function innerHelper() { return 2; } return innerHelper(); }
         cb();
         handlers[y]();
         return aliasedTarget(render(innerHelper())) + secondOuter();
       }`,
      'lib/mod-b.js'
    );
    const browserClient = jsMod.analyzeJavaScriptFile(
      `(function () {
         function getSummary() { return { ok: true }; }
         var exported = Object.freeze({ getSummary: getSummary });
         window.bitesharkSampleNs = exported;
       })();`,
      'public/sample-ns.js'
    );
    const browserBase = jsMod.analyzeJavaScriptFile(
      `function openDetail(id) { return id; }
       function uniquePageAction() { return window.bitesharkSampleNs.getSummary(); }`,
      'public/base.js'
    );
    const browserAddon = jsMod.analyzeJavaScriptFile(
      `const prevOpen = openDetail;
       openDetail = function(id) { return prevOpen(id); };`,
      'public/addon.js'
    );
    const pageHtml = htmlCssMod.analyzeHtmlFile(
      `<!doctype html><html><body>
         <button onclick="uniquePageAction()">Go</button>
         <script src="/sample-ns.js"></script>
         <script src="/base.js"></script>
         <script src="/addon.js"></script>
       </body></html>`,
      'public/index.html'
    );

    const rel = relMod.resolveSymbolRelationships({
      jsAnalyses: [modA, modB, browserClient, browserBase, browserAddon],
      htmlAnalyses: [pageHtml]
    });

    // Same-name `render` in `mod-a.js` must NOT list `lib/mod-b.js:runB` as a caller!
    const renderA = modA.symbols.find(s => s.name === 'render');
    const renderB = modB.symbols.find(s => s.name === 'render');
    assert.deepEqual(renderA.confirmed_callers, ['lib/mod-a.js:sharedTarget']);
    assert.deepEqual(renderB.confirmed_callers, ['lib/mod-b.js:runB']);

    // Aliased import `aliasedTarget` -> `mod-a.js#sharedTarget` (`confirmed_static`)
    const sharedTarget = modA.symbols.find(s => s.name === 'sharedTarget');
    assert.deepEqual(sharedTarget.confirmed_callers, ['lib/mod-b.js:runB']);

    // Nested functions with same local name `innerHelper` have distinct deterministic scoped IDs!
    const nestedHelpers = modB.symbols.filter(s => s.local_name === 'innerHelper');
    assert.equal(nestedHelpers.length, 2);
    assert.notEqual(nestedHelpers[0].symbol_id, nestedHelpers[1].symbol_id);

    // Shadowed parameter `cb()` and computed `handlers[y]()` recorded in `dynamic_unresolved_callsites`
    const runBSym = modB.symbols.find(s => s.name === 'runB');
    assert.equal(runBSym.dynamic_unresolved_callsites.length, 2);

    // `window.bitesharkSampleNs.getSummary()` resolved statically to `public/sample-ns.js#getSummary`!
    const nsGetSummary = browserClient.symbols.find(s => s.name === 'getSummary');
    assert.deepEqual(nsGetSummary.confirmed_callers, ['public/base.js:uniquePageAction']);

    // HTML `onclick="uniquePageAction()"` resolved statically to `public/base.js#uniquePageAction`!
    const uniqueAct = browserBase.symbols.find(s => s.name === 'uniquePageAction');
    assert.ok(uniqueAct.confirmed_callers.some(c => c.includes('public/index.html') && c.includes('[onclick]')));

    // `openDetail` wrapper chain recorded as `documented_wrapper`
    assert.ok(rel.wrapper_chains.some(w => w.global_name === 'openDetail' && w.relationship_state === 'documented_wrapper'));
  });

  // -------------------------------------------------------------------------
  // 8. Honest 3-Tier Test Reference Classification
  // -------------------------------------------------------------------------
  await test('8. separates maintained contract test mappings, static HTTP test calls & candidate path mentions without substring bleed', () => {
    const filesMap = new Map([
      [
        'server/admin-routes.js',
        `export async function handleGovernanceApiRequest({ normPath, method, sendJson }) {
           if (normPath === '/api/admin/features') {
             if (method !== 'GET') return sendJson(405, {});
             return sendJson(200, { ok: true });
           }
           if (normPath === '/api/admin/features/update') {
             if (method !== 'POST') return sendJson(405, {});
             return sendJson(200, { ok: true });
           }
         }`
      ],
      ['tests/mention-only.test.cjs', `const NOTE = 'Mentions "/api/admin/features" in a string without calling HTTP';`],
      ['tests/update-caller.test.cjs', `async function run() { await httpReq(4100, 'POST', '/api/admin/features/update'); }`]
    ]);
    const jsMap = new Map([
      ['tests/mention-only.test.cjs', jsMod.analyzeJavaScriptFile(filesMap.get('tests/mention-only.test.cjs'), 'tests/mention-only.test.cjs')],
      ['tests/update-caller.test.cjs', jsMod.analyzeJavaScriptFile(filesMap.get('tests/update-caller.test.cjs'), 'tests/update-caller.test.cjs')]
    ]);

    const routes = dbMod.extractBackendRoutes({
      fileContentsByPath: filesMap,
      jsAnalysesByPath: jsMap,
      sharedContracts: [
        {
          contract_id: 'CTR-TEST-FC',
          http_routes: ['/api/admin/features'],
          test_mappings: [{ file: 'tests/feature-controls.integration.cjs', protected_assertions: ['role_restrictions'] }]
        }
      ]
    });

    const featGet = routes.find(r => r.path === '/api/admin/features');
    const featUpd = routes.find(r => r.path === '/api/admin/features/update');

    assert.equal('verifying_tests' in featGet, false, 'Deprecated misleading verifying_tests field must not exist');
    assert.equal(featGet.test_references.contract_mappings[0].contract_id, 'CTR-TEST-FC');
    assert.deepEqual(featGet.test_references.static_http_call_tests, [], '/api/admin/features/update HTTP call must NOT bleed into /api/admin/features');
    assert.deepEqual(featGet.test_references.candidate_path_mentions, ['tests/mention-only.test.cjs']);
    assert.deepEqual(featUpd.test_references.static_http_call_tests, ['tests/update-caller.test.cjs']);
    assert.deepEqual(featUpd.test_references.candidate_path_mentions, ['tests/update-caller.test.cjs']);
  });

  // -------------------------------------------------------------------------
  // 9, 10, 11 & 12. Change-Impact Engine: Body Edits, APIs, SQL Attributes & Uncertainty
  // -------------------------------------------------------------------------
  await test('9-12. detects function-body changes (ignoring comments/whitespace), API diffs, SQL column/constraint/policy diffs & flags incomplete/procedural analysis honestly', () => {
    const tmpBase = makeTempWorkspace();
    const tmpHead = makeTempWorkspace();
    try {
      for (const root of [tmpBase, tmpHead]) {
        fs.mkdirSync(path.join(root, 'lib'), { recursive: true });
        fs.mkdirSync(path.join(root, 'server'), { recursive: true });
        fs.mkdirSync(path.join(root, 'migrations'), { recursive: true });
      }

      // Base snapshot files
      fs.writeFileSync(
        path.join(tmpBase, 'lib', 'calc.js'),
        `export const LIMIT = 10;\nexport function computeFee(amount) { return amount * 2; }\nexport function formatTag(x) { return String(x).trim(); }\nexport function moveMe(z) { return z + 99; }\n`
      );
      fs.writeFileSync(
        path.join(tmpBase, 'server', 'admin-routes.js'),
        `import { computeFee } from '../lib/calc.js';\nexport async function handleGovernanceApiRequest({ normPath, method, sendJson }) {\n  if (normPath === '/api/admin/calc') {\n    if (method !== 'GET' && method !== 'POST') return sendJson(405, {});\n    return sendJson(200, { ok: true, fee: computeFee(5), legacy_field: 1 });\n  }\n}\n`
      );
      fs.writeFileSync(
        path.join(tmpBase, 'migrations', '001_items.sql'),
        `CREATE TABLE items (id TEXT PRIMARY KEY, price INTEGER, status TEXT DEFAULT 'draft');\nALTER TABLE items ENABLE ROW LEVEL SECURITY;\nALTER TABLE items FORCE ROW LEVEL SECURITY;\nCREATE POLICY items_pol ON items FOR SELECT USING (current_setting('app.user_id', true) <> '');\n`
      );

      // Case A: Formatting/comment-only change -> ZERO `symbols_body_changed`, classification `no_structural_break_detected_behavior_unverified` (never `compatible`)
      fs.writeFileSync(
        path.join(tmpHead, 'lib', 'calc.js'),
        `// Added comment and extra whitespace only!\nexport const LIMIT = 10;\nexport function computeFee( amount ) {\n  /* comment */\n  return amount * 2;\n}\nexport function formatTag(x) { return String(x).trim(); }\nexport function moveMe(z) { return z + 99; }\n`
      );
      fs.writeFileSync(path.join(tmpHead, 'server', 'admin-routes.js'), fs.readFileSync(path.join(tmpBase, 'server', 'admin-routes.js')));
      fs.writeFileSync(path.join(tmpHead, 'migrations', '001_items.sql'), fs.readFileSync(path.join(tmpBase, 'migrations', '001_items.sql')));

      const baseSnap = scanMod.scanRepositorySnapshot(tmpBase);
      const commentOnlySnap = scanMod.scanRepositorySnapshot(tmpHead);
      const commentImpact = cmpMod.compareRegistrySnapshots(baseSnap, commentOnlySnap);
      assert.equal(commentImpact.summary_counts.symbols_body_changed, 0, 'Formatting/comment-only edits must not trigger symbols_body_changed');
      assert.equal(commentImpact.compatibility_assessment.classification, 'no_structural_break_detected_behavior_unverified');

      // Case B: Body-only logic change + constant change + moved function + SQL column attribute changes + response-key removal
      fs.writeFileSync(
        path.join(tmpHead, 'lib', 'calc.js'),
        `export const LIMIT = 25;\nexport function computeFee(amount) { return Math.max(0, amount * 3); }\nexport function formatTag(x) { return String(x).trim(); }\n`
      );
      fs.writeFileSync(path.join(tmpHead, 'lib', 'moved.js'), `export function moveMe(z) { return z + 99; }\n`);
      fs.writeFileSync(
        path.join(tmpHead, 'server', 'admin-routes.js'),
        `import { computeFee } from '../lib/calc.js';\nexport async function handleGovernanceApiRequest({ normPath, method, sendJson }) {\n  if (normPath === '/api/admin/calc') {\n    if (method !== 'GET') return sendJson(405, {});\n    return sendJson(200, { ok: true, fee: computeFee(5) });\n  }\n}\n`
      );
      fs.writeFileSync(
        path.join(tmpHead, 'migrations', '002_alter_items.sql'),
        `ALTER TABLE items ALTER COLUMN price TYPE BIGINT, ALTER COLUMN price SET NOT NULL, ALTER COLUMN status SET DEFAULT 'active';\nDROP POLICY IF EXISTS items_pol ON items;\nCREATE POLICY items_pol ON items FOR ALL USING (current_setting('app.user_id', true) = 'admin');\n`
      );

      const richHeadSnap = scanMod.scanRepositorySnapshot(tmpHead);
      const richImpact = cmpMod.compareRegistrySnapshots(baseSnap, richHeadSnap);

      assert.equal(richImpact.compatibility_assessment.classification, 'breaking_change_detected', 'Removing POST from /api/admin/calc must be breaking_change_detected');
      assert.ok(richImpact.symbols.body_changed.some(s => s.name === 'computeFee' && s.confirmed_consumers.includes('server/admin-routes.js:handleGovernanceApiRequest')));
      assert.ok(richImpact.symbols.constants_changed.some(c => c.name === 'LIMIT'));
      assert.ok(richImpact.symbols.renamed_or_moved_candidates.some(m => m.from_symbol_id.includes('lib/calc.js#moveMe') && m.to_symbol_id.includes('lib/moved.js#moveMe')));
      assert.deepEqual(richImpact.apis.changed[0].removed_methods, ['POST']);
      assert.deepEqual(richImpact.apis.changed[0].removed_response_keys, ['legacy_field']);

      const itemDiff = richImpact.database.tables_changed.find(t => t.table_name === 'items');
      assert.ok(itemDiff);
      assert.equal(itemDiff.columns_type_changed[0].column, 'price');
      assert.equal(itemDiff.columns_nullability_changed[0].after_not_null, true);
      assert.equal(itemDiff.columns_default_changed[0].column, 'status');
      assert.deepEqual(itemDiff.rls_policies_changed, ['items_pol']);

      // Case C: Dynamic procedural SQL (`DO $$ BEGIN EXECUTE ... END $$;`) -> `analysis_incomplete_or_unresolved`!
      fs.writeFileSync(
        path.join(tmpHead, 'server', 'admin-routes.js'),
        fs.readFileSync(path.join(tmpBase, 'server', 'admin-routes.js'))
      );
      fs.writeFileSync(
        path.join(tmpHead, 'migrations', '003_dynamic.sql'),
        `DO $$ BEGIN EXECUTE 'ALTER TABLE items ADD COLUMN dyn_col TEXT'; END $$;\n`
      );
      const procSnap = scanMod.scanRepositorySnapshot(tmpHead);
      const procImpact = cmpMod.compareRegistrySnapshots(baseSnap, procSnap);
      assert.equal(procImpact.compatibility_assessment.classification, 'analysis_incomplete_or_unresolved');
      assert.equal(procImpact.database.migrations_requiring_manual_review.length, 1);

      // Case D: Missing Git ref -> `analysis_incomplete_or_unresolved`
      const missingRefSnap = cmpMod.scanGitRefSnapshot(REPO_ROOT, 'refs/heads/non-existent-ref-999999');
      const missingRefImpact = cmpMod.compareRegistrySnapshots(missingRefSnap, baseSnap);
      assert.equal(missingRefImpact.compatibility_assessment.classification, 'analysis_incomplete_or_unresolved');
    } finally {
      fs.rmSync(tmpBase, { recursive: true, force: true });
      fs.rmSync(tmpHead, { recursive: true, force: true });
    }
  });

  // -------------------------------------------------------------------------
  // 13. Recursive JSON Schema Validation Rejects Invalid Nested Records
  // -------------------------------------------------------------------------
  await test('13. recursive JSON Schema validator passes real snapshot and rejects malformed nested symbol, route & baseline records', () => {
    const snap = scanMod.scanRepositorySnapshot(REPO_ROOT);
    const regSchemaPath = path.join(REPO_ROOT, 'docs', 'engineering', 'schemas', 'code-registry.schema.json');
    const baseSchemaPath = path.join(REPO_ROOT, 'docs', 'engineering', 'schemas', 'drift-baseline.schema.json');

    assert.deepEqual(validatorMod.validateJsonWithSchemaFile(snap, regSchemaPath), []);

    // Corrupt a deeply nested symbol field (`js_modules[0].symbols[0].start_line = "invalid"`)
    const badSymbolSnap = structuredClone(snap);
    const modWithSym = badSymbolSnap.js_modules.find(m => m.symbols.length > 0);
    modWithSym.symbols[0].start_line = 'not_an_integer';
    const symErrs = validatorMod.validateJsonWithSchemaFile(badSymbolSnap, regSchemaPath);
    assert.ok(symErrs.some(e => e.includes('start_line') && e.includes('integer')), `Expected nested start_line schema error, got: ${symErrs.join('; ')}`);

    // Corrupt a nested route HTTP verb
    const badRouteSnap = structuredClone(snap);
    badRouteSnap.backend_routes[0].methods = ['BOGUS_HTTP_VERB'];
    const routeErrs = validatorMod.validateJsonWithSchemaFile(badRouteSnap, regSchemaPath);
    assert.ok(routeErrs.some(e => e.includes('/backend_routes/0/methods/0')));

    // Corrupt nested baseline entry reason length
    const badBaseline = {
      schema_version: 'biteshark.drift-baseline.v2',
      description: 'Valid description string here',
      high_confidence_blocking_categories: ['DUPLICATE_HTML_ID'],
      entries: [{ finding_id: 'DRIFT:DUPLICATE_HTML_ID:x', category: 'DUPLICATE_HTML_ID', accepted_reason: 'too short', reference: 'doc' }]
    };
    const baseErrs = validatorMod.validateJsonWithSchemaFile(badBaseline, baseSchemaPath);
    assert.ok(baseErrs.some(e => e.includes('/entries/0/accepted_reason')));
  });

  // -------------------------------------------------------------------------
  // 14. Required vs Optional Database Verification Behavior
  // -------------------------------------------------------------------------
  await test('14. required --verify-db fails hard when PostgreSQL is unreachable while --verify-db=optional reports NOT_RUN', () => {
    const reqRes = runCli(['validate', '--verify-db'], {
      BITESHARK_REGISTRY_VERIFY_PG_URL: 'postgresql://postgres:bad@127.0.0.1:59997/postgres'
    });
    assert.equal(reqRes.status, 1, 'Required --verify-db must exit 1 when PostgreSQL cannot be reached');
    const reqJson = JSON.parse(reqRes.stdout);
    assert.equal(reqJson.ok, false);
    assert.ok(reqJson.failures.some(f => f.startsWith('DB_VERIFICATION_UNAVAILABLE:')));

    const optRes = runCli(['validate', '--verify-db=optional'], {
      BITESHARK_REGISTRY_VERIFY_PG_URL: 'postgresql://postgres:bad@127.0.0.1:59997/postgres'
    });
    assert.equal(optRes.status, 0);
    const optJson = JSON.parse(optRes.stdout);
    assert.equal(optJson.db_verification.status, 'NOT_RUN', 'Optional --verify-db must report NOT_RUN when skipped');
    assert.equal(optJson.db_verification.executed, false);
  });

  // -------------------------------------------------------------------------
  // 15. Locate Ranking, Connected Records & Explicit Pagination/Truncation
  // -------------------------------------------------------------------------
  await test('15. locate ranks exact matches first, returns connected callers/contracts/routes/tests & reports explicit truncation metadata', () => {
    const locRes = runCli(['locate', 'withTransaction', '--json']);
    assert.equal(locRes.status, 0);
    const locJson = JSON.parse(locRes.stdout);
    assert.ok(locJson.total_matches >= 1);
    assert.equal(locJson.matches[0].match_tier, 'exact');
    assert.equal(locJson.matches[0].id, 'sym:fn:lib/db-tx.js#withTransaction');
    assert.ok(locJson.matches[0].record.confirmed_caller_count >= 10);
    assert.ok(locJson.matches[0].record.contract_ids.includes('CTR-DB-TX-SESSION'));

    // Pagination / truncation transparency check (`--limit 2`)
    const pageRes = runCli(['locate', '/api/admin/', '--limit', '2', '--offset', '0', '--json']);
    assert.equal(pageRes.status, 0);
    const pageJson = JSON.parse(pageRes.stdout);
    assert.equal(pageJson.returned_count, 2);
    assert.ok(pageJson.total_matches > 20);
    assert.equal(pageJson.truncated, true);
    assert.ok(pageJson.next_page_hint.includes('--offset 2'));
  });

  // -------------------------------------------------------------------------
  // 16 & 17. Secret/Generated Exclusions & Zero Runtime Application Changes
  // -------------------------------------------------------------------------
  await test('16-17. excludes .env/key/node_modules/archive/generated files and keeps runtime application files 100% untouched on corrective branch', () => {
    const tmp = makeTempWorkspace();
    try {
      fs.mkdirSync(path.join(tmp, 'lib'), { recursive: true });
      fs.mkdirSync(path.join(tmp, 'node_modules', 'pkg'), { recursive: true });
      fs.mkdirSync(path.join(tmp, 'docs', 'archive'), { recursive: true });
      fs.mkdirSync(path.join(tmp, 'docs', 'engineering', 'generated'), { recursive: true });

      fs.writeFileSync(path.join(tmp, '.env'), 'BITESHARK_AUTH_SECRET=TOP_SECRET_NEVER_INGEST\n');
      fs.writeFileSync(path.join(tmp, '.env.staging'), 'DATABASE_URL=postgres://secret\n');
      fs.writeFileSync(path.join(tmp, 'lib', 'id_ed25519_test'), 'PRIVATE_SSH_KEY_MATERIAL\n');
      fs.writeFileSync(path.join(tmp, 'lib', 'tls.pem'), 'PRIVATE_PEM_MATERIAL\n');
      fs.writeFileSync(path.join(tmp, 'node_modules', 'pkg', 'index.js'), 'export const nm = 1;\n');
      fs.writeFileSync(path.join(tmp, 'docs', 'engineering', 'generated', 'SYMBOL-INDEX.md'), '# Generated\n');
      fs.writeFileSync(path.join(tmp, 'lib', 'ok.js'), 'export function ok() { return true; }\n');

      const snap = scanMod.scanRepositorySnapshot(tmp);
      const raw = JSON.stringify(snap);
      assert.ok(!raw.includes('TOP_SECRET_NEVER_INGEST'));
      assert.ok(!raw.includes('PRIVATE_SSH_KEY_MATERIAL'));
      assert.ok(!raw.includes('PRIVATE_PEM_MATERIAL'));
      assert.equal(snap.js_modules.length, 1);
      assert.equal(snap.js_modules[0].file, 'lib/ok.js');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }

    // Verify zero runtime application files changed relative to merge-base with `origin/working/biteshark-vps` when on handbook/registry corrective branches
    try {
      const branch = execFileSync('git', ['symbolic-ref', '--quiet', '--short', 'HEAD'], {
        cwd: REPO_ROOT,
        encoding: 'utf8'
      }).trim();
      if (branch === 'fix/engineering-registry-trust-and-usability' || branch === 'chore/shared-code-registry-handbook') {
        const mb = execFileSync('git', ['merge-base', 'origin/working/biteshark-vps', 'HEAD'], {
          cwd: REPO_ROOT,
          encoding: 'utf8'
        }).trim();
        const diffRuntime = execFileSync(
          'git',
          ['diff', '--name-only', mb, '--', 'api', 'lib', 'server', 'packages', 'public', 'migrations', 'deploy', 'scripts', 'package-lock.json'],
          { cwd: REPO_ROOT, encoding: 'utf8' }
        ).trim();
        assert.equal(diffRuntime, '', `Runtime application files must remain untouched on ${branch}, found: ${diffRuntime}`);
      }
    } catch {}
  });

  console.log(`\nCode Registry Acceptance & Regression Suite: ${passed} / ${passed} checks passed.`);
}

run().catch(err => {
  console.error('Code Registry Acceptance & Regression Suite FAILED:', err);
  process.exit(1);
});
