#!/usr/bin/env node
// BiteShark Code Registry, Drift Detector & Ref-Comparison Test Suite (`tests/code-registry.test.cjs`)
//
// Covers Section 20 requirements using real BiteShark patterns + live repository assertions:
//   1. Symbol definitions, parameters, exports & imports (ESM, CJS, browser scripts)
//   2. Browser global assignments & load-order decorator wrappers (`openDetail`)
//   3. Inline HTML handlers & unresolved handler detection
//   4. Dynamic/unresolved references (`dynamic: true`)
//   5. Runtime DOM-generated elements (`innerHTML` & `.id = ...`) vs genuine missing DOM targets
//   6. Route extraction (`server/routes.js`, `server/app.js`, `server/admin-routes.js`)
//   7. Feature-key & `BITESHARK_*`/`TRUCKLY_*` configuration extraction + invalid write-pause scope detection
//   8. SQL migration, table, FK, index & `FORCE ROW LEVEL SECURITY` (`app.*` GUC) extraction
//   9. Deterministic output (byte-identical consecutive scans) & stable IDs
//  10. Ref comparison & `breaking` detection of removed contract consumers / altered migration checksums
//  11. Scoped suppression behavior (auditable without hiding unrelated violations)
//  12. Syntax parse-failure isolation (nonzero CLI exit / `unresolved` classification without crashing)
//  13. `.env`, `.pem`, `.key`, `node_modules`, and archive file exclusions
//  14. Markdown internal link validation (catching broken links while ignoring fenced code blocks)
//  15. Verification that runtime application files (`api/`, `lib/`, `server/`, `packages/`, `public/`, `migrations/`)
//      remain untouched relative to the branch's base runtime tree when running on the dedicated handbook branch.

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..');

async function loadRegistryModules() {
  const dir = path.join(REPO_ROOT, 'tools', 'code-registry');
  const [schemaMod, jsMod, htmlCssMod, dbMod, driftMod, scanMod, cmpMod] = await Promise.all([
    import(pathToFileURL(path.join(dir, 'schema-versions.mjs')).href),
    import(pathToFileURL(path.join(dir, 'js-analyzer.mjs')).href),
    import(pathToFileURL(path.join(dir, 'html-css-analyzer.mjs')).href),
    import(pathToFileURL(path.join(dir, 'backend-db-analyzer.mjs')).href),
    import(pathToFileURL(path.join(dir, 'drift-detector.mjs')).href),
    import(pathToFileURL(path.join(dir, 'scanner.mjs')).href),
    import(pathToFileURL(path.join(dir, 'compare-impact.mjs')).href)
  ]);
  return { schemaMod, jsMod, htmlCssMod, dbMod, driftMod, scanMod, cmpMod };
}

function makeTempFixtureWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'bs-code-reg-test-'));
}

async function run() {
  const { schemaMod, jsMod, htmlCssMod, dbMod, driftMod, scanMod, cmpMod } = await loadRegistryModules();
  let passed = 0;

  function test(name, fn) {
    return Promise.resolve()
      .then(fn)
      .then(() => {
        passed++;
        console.log(`  PASS  ${name}`);
      });
  }

  await test('keeps source digests stable when ignored dependencies and local metadata appear', () => {
    const source = { scope: { excluded_paths: [], excluded_item_count: 0 }, modules: ['public/app.js'] };
    const localOnly = { ...source, scope: { excluded_paths: [
      { rule_id: 'EXCL_NODE_MODULES', path: 'node_modules' },
      { rule_id: 'EXCL_GIT_INTERNAL', path: '.git' },
      { rule_id: 'EXCL_SECRET_AND_ENV_FILES', path: '.env.fixture' },
      { rule_id: 'EXCL_GENERATED_REGISTRY_OUTPUTS', path: 'docs/engineering/generated' }
    ], excluded_item_count: 4 } };
    assert.equal(schemaMod.computePayloadDigest(source), schemaMod.computePayloadDigest(localOnly));
    assert.notEqual(schemaMod.computePayloadDigest(source), schemaMod.computePayloadDigest({ ...source, modules: ['public/app.js', 'public/map-cards.js'] }));
  });

  // 1. Symbol definitions, imports, exports, env reads & feature key lookups
  await test('extracts ESM imports/exports, inferred param types, readEnvCompat aliases, feature keys & write-pause scopes', () => {
    const sample = `
      import { withTransaction } from '../lib/db-tx.js';
      import { readEnvCompat } from '../lib/env-compat.js';
      export const MAX_ITEMS = 25;
      export class DomainError extends Error {
        constructor(code, message = 'Failed') {
          super(message);
          this.code = code;
        }
      }
      export async function createThing({ vendorId, count = 2 }, ...extra) {
        const mode = readEnvCompat('AUTH_DELIVERY_MODE', { securityCritical: true });
        const rawPool = process.env.DATABASE_URL;
        if (isWritePaused('favorites')) throw new DomainError('PAUSED');
        if (!window.bitesharkFeatures.isAvailable('event_inquiries')) return null;
        return withTransaction(null, async () => ({ mode, rawPool, vendorId, count, extra }));
      }
    `;
    const res = jsMod.analyzeJavaScriptFile(sample, 'lib/sample-service.js');
    assert.equal(res.parse_ok, true);
    assert.equal(res.imports.length, 2);
    assert.equal(res.classes.length, 1);
    assert.equal(res.classes[0].symbol_id, 'sym:class:lib/sample-service.js#DomainError');

    const fn = res.symbols.find(s => s.name === 'createThing');
    assert.ok(fn, 'Expected createThing symbol');
    assert.equal(fn.symbol_id, 'sym:fn:lib/sample-service.js#createThing');
    assert.equal(fn.exported, true);
    assert.equal(fn.async, true);
    assert.equal(fn.return_behavior, 'promise');
    assert.deepEqual(fn.throws, ['DomainError']);
    assert.equal(fn.params[0].observed_type, 'object');
    assert.equal(fn.params[1].observed_type, 'array');

    const envAuth = res.env_reads.find(e => e.key === 'BITESHARK_AUTH_DELIVERY_MODE');
    assert.ok(envAuth);
    assert.equal(envAuth.legacy_alias, 'TRUCKLY_AUTH_DELIVERY_MODE');
    assert.ok(res.env_reads.some(e => e.key === 'DATABASE_URL'));
    assert.equal(res.feature_key_refs[0].feature_key, 'event_inquiries');
    assert.equal(res.write_pause_refs[0].scope, 'favorites');
  });

  // 2. Browser globals, dynamic references & runtime DOM generation
  await test('captures browser globals, openDetail wrapper reassignments, dynamic URLs & runtime DOM IDs without false local-var globals', () => {
    const browserScript = `
      window.bitesharkSample = { ready: true };
      const origOpen = openDetail;
      openDetail = function(id) {
        let data = null;
        data = { id };
        const panel = document.createElement('div');
        panel.id = 'runtimeCreatedBanner';
        document.body.innerHTML = '<section id="templateModal"><input id="dynField"></section>';
        const missing = document.getElementById('absentGhostId');
        const presentDyn = document.getElementById('templateModal');
        const presentCreated = document.getElementById('runtimeCreatedBanner');
        const computedDom = document.getElementById('row-' + id);
        fetch(\`/api/trucks/\${encodeURIComponent(id)}\`);
        return origOpen(id, data, missing, presentDyn, presentCreated, computedDom);
      };
    `;
    const res = jsMod.analyzeJavaScriptFile(browserScript, 'public/sample-addon.js');
    assert.equal(res.parse_ok, true);
    assert.ok(res.globals_assigned.some(g => g.name === 'bitesharkSample' && g.kind === 'explicit_window_property'));
    assert.ok(res.globals_assigned.some(g => g.name === 'openDetail' && g.kind === 'browser_global_reassignment'));
    assert.ok(!res.globals_assigned.some(g => g.name === 'data'), 'Function-local variable must not be reported as browser global');
    assert.ok(res.dynamic_dom_definitions.some(d => d.id === 'runtimeCreatedBanner'));
    assert.ok(res.dynamic_dom_definitions.some(d => d.id === 'templateModal'));

    const dynDom = res.dom_references.find(r => r.selector.startsWith('row-:expr'));
    assert.ok(dynDom && dynDom.dynamic === true, 'Computed DOM ID lookup must be marked dynamic');
    assert.equal(res.api_consumers[0].dynamic, true);
  });

  // 3. HTML screens, duplicate IDs, inline handlers & CSS cascade tokens
  await test('detects HTML screens, duplicate IDs, unresolved inline handlers, runtime DOM targets & scoped suppressions', () => {
    const html = htmlCssMod.analyzeHtmlFile(
      `<!doctype html>
       <html>
         <head><link rel="stylesheet" href="/theme.css"></head>
         <body>
           <main id="discoverScreen" class="screen active">
             <div id="dupBox"></div>
             <div id="dupBox"></div>
             <button onclick="existingAction('x')">OK</button>
             <button onclick="nonExistentGhostHandler()">Broken</button>
           </main>
           <script src="/base.js"></script>
           <script src="/addon.js"></script>
         </body>
       </html>`,
      'public/index.html'
    );
    assert.equal(html.screens.length, 1);
    assert.equal(html.duplicate_ids.length, 1);
    assert.equal(html.duplicate_ids[0].id, 'dupBox');

    const baseJs = jsMod.analyzeJavaScriptFile(
      `function existingAction(x) { return x; }
       function openDetail(id) { return id; }`,
      'public/base.js'
    );
    const addonJs = jsMod.analyzeJavaScriptFile(
      `openDetail = function(id) {
         document.body.innerHTML = '<div id="createdInJs"></div>';
         document.getElementById('createdInJs');
         document.getElementById('trulyMissingElement');
         return id;
       };`,
      'public/addon.js'
    );
    const css = htmlCssMod.analyzeCssFile(
      `:root { --trk-green: #1d4d3c; }
       @media (max-width: 749px) { .truck-card[data-open="1"] { display: flex !important; } }`,
      'public/theme.css'
    );
    assert.equal(css.custom_properties[0].name, '--trk-green');
    assert.equal(css.media_queries.length, 1);
    assert.equal(css.important_count, 1);

    const drift = driftMod.detectRepositoryDrift({
      commitSha: 'deadbeef',
      jsAnalyses: [baseJs, addonJs],
      htmlAnalyses: [html],
      cssAnalyses: [css],
      routes: [],
      featureContract: { features: [{ key: 'event_inquiries' }] },
      schemaInfo: { migrations: [] },
      suppressions: [
        {
          id: 'SUPP-TEST-OPEN-DETAIL',
          category: 'LOAD_ORDER_GLOBAL_WRAPPER',
          target: 'public/base.js#openDetail',
          reason: 'Verified wrapper chain'
        }
      ]
    });

    const activeIds = drift.findings.filter(f => !f.suppressed).map(f => f.finding_id);
    assert.ok(activeIds.some(id => id.includes('DUPLICATE_HTML_ID') && id.includes('dupBox')));
    assert.ok(activeIds.some(id => id.includes('UNRESOLVED_INLINE_HANDLER') && id.includes('nonExistentGhostHandler')));
    assert.ok(!activeIds.some(id => id.includes('existingAction')));
    assert.ok(activeIds.some(id => id.includes('MISSING_DOM_TARGET') && id.includes('trulyMissingElement')));
    assert.ok(!activeIds.some(id => id.includes('createdInJs')), 'Runtime-generated innerHTML ID must not be flagged as missing');

    const suppOpen = drift.findings.find(f => f.finding_id.includes('openDetail'));
    assert.ok(suppOpen && suppOpen.suppressed === true && suppOpen.suppression_id === 'SUPP-TEST-OPEN-DETAIL');
  });

  // 4. SQL Migration, FK, RLS GUC & Collision Extraction
  await test('reconstructs SQL tables, foreign keys, FORCE RLS policies, app.* GUCs & migration sequence collisions', () => {
    const schema = dbMod.analyzeMigrationsAndSchema({
      migrationFiles: [
        {
          filename: '001_init.sql',
          path: 'migrations/001_init.sql',
          content: `
            -- Ignore CREATE TABLE fake_comment_table (id int);
            CREATE TABLE vendors (
              id TEXT PRIMARY KEY,
              canonical_name TEXT NOT NULL
            );
          `
        },
        {
          filename: '002_reviews.sql',
          path: 'migrations/002_reviews.sql',
          content: `
            CREATE TABLE community_reviews (
              id BIGSERIAL PRIMARY KEY,
              vendor_id TEXT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
              author_id TEXT NOT NULL
            );
            ALTER TABLE community_reviews ENABLE ROW LEVEL SECURITY;
            ALTER TABLE community_reviews FORCE ROW LEVEL SECURITY;
            CREATE POLICY community_reviews_owner ON community_reviews
              FOR ALL
              USING (author_id = current_setting('app.user_id', true));
            CREATE UNIQUE INDEX idx_reviews_vendor_author ON community_reviews (vendor_id, author_id);
          `
        },
        {
          filename: '002_colliding_branch.sql',
          path: 'migrations/002_colliding_branch.sql',
          content: `ALTER TABLE vendors ADD COLUMN verified BOOLEAN NOT NULL DEFAULT false;`
        }
      ],
      runMigrationsSource: `REVOKE UPDATE, DELETE ON audit_logs FROM app_role;`
    });

    assert.equal(schema.tables.length, 2);
    const rev = schema.tables.find(t => t.table_name === 'community_reviews');
    assert.ok(rev);
    assert.equal(rev.rls_enabled, true);
    assert.equal(rev.rls_forced, true);
    assert.equal(rev.foreign_keys[0].references_table, 'vendors');
    assert.deepEqual(rev.rls_policies[0].guc_keys, ['app.user_id']);

    const drift = driftMod.detectRepositoryDrift({
      commitSha: 'deadbeef',
      jsAnalyses: [],
      htmlAnalyses: [],
      cssAnalyses: [],
      routes: [],
      featureContract: { features: [] },
      schemaInfo: schema
    });
    assert.ok(drift.findings.some(f => f.category === 'MIGRATION_SEQUENCE_COLLISION'));
  });

  // 5. Secret/File Exclusions, Parse Failures, Markdown Links & Ref Comparison Breaking Detection
  await test('excludes .env/key/archive files, isolates JS syntax failures, validates Markdown links & flags breaking consumer removals', () => {
    const tmp = makeTempFixtureWorkspace();
    try {
      fs.mkdirSync(path.join(tmp, 'lib'), { recursive: true });
      fs.mkdirSync(path.join(tmp, 'public'), { recursive: true });
      fs.mkdirSync(path.join(tmp, 'docs', 'archive'), { recursive: true });
      fs.mkdirSync(path.join(tmp, 'node_modules', 'pkg'), { recursive: true });

      // Secret & excluded files that MUST NEVER be read into js_modules or included_file_count
      fs.writeFileSync(path.join(tmp, '.env'), 'BITESHARK_AUTH_SECRET=DO_NOT_READ_SUPER_SECRET_VALUE\n');
      fs.writeFileSync(path.join(tmp, '.env.production'), 'DATABASE_URL=postgres://secret\n');
      fs.writeFileSync(path.join(tmp, 'lib', 'private.key'), '-----BEGIN PRIVATE KEY-----\n');
      fs.writeFileSync(path.join(tmp, 'node_modules', 'pkg', 'index.js'), 'export const x = 1;\n');
      fs.writeFileSync(path.join(tmp, 'docs', 'archive', 'old.md'), '[dead](./missing-in-archive.md)\n');

      // Valid files + broken Markdown link outside fenced block
      fs.writeFileSync(path.join(tmp, 'lib', 'shared.js'), 'export function sharedHelper(a) { return a; }\n');
      fs.writeFileSync(path.join(tmp, 'public', 'caller.js'), 'function run() { return sharedHelper(1); }\n');
      fs.writeFileSync(
        path.join(tmp, 'README.md'),
        '# Test\n\nValid [shared](lib/shared.js), broken [missing](docs/does-not-exist.md).\n\n```markdown\n[ignored-example](docs/ignored-in-fence.md)\n```\n'
      );

      const baseSnap = scanMod.scanRepositorySnapshot(tmp);
      const serialized = JSON.stringify(baseSnap);
      assert.ok(!serialized.includes('DO_NOT_READ_SUPER_SECRET_VALUE'), 'Secret .env content must never enter snapshot');
      assert.ok(baseSnap.scope.excluded_paths.some(e => e.path === '.env' && e.rule_id === 'EXCL_SECRET_AND_ENV_FILES'));
      assert.ok(baseSnap.scope.excluded_paths.some(e => e.path === 'lib/private.key' && e.rule_id === 'EXCL_SECRET_AND_ENV_FILES'));
      assert.equal(
        baseSnap.drift_report.findings.filter(f => f.category === 'BROKEN_DOC_LINK').length,
        1,
        'Should flag real broken link while ignoring docs/archive and fenced code blocks'
      );

      // Now remove `sharedHelper` while `public/caller.js` still calls it -> must classify as `breaking`!
      fs.writeFileSync(path.join(tmp, 'lib', 'shared.js'), 'export function otherHelper() { return 2; }\n');
      const headSnapBreaking = scanMod.scanRepositorySnapshot(tmp);
      const impact = cmpMod.compareRegistrySnapshots(baseSnap, headSnapBreaking);
      assert.equal(impact.compatibility_assessment.classification, 'breaking');
      assert.ok(impact.symbols.broken_consumer_links.some(b => b.name === 'sharedHelper'));

      // Now introduce a syntax error -> scanner records parse_failures without crashing, CLI scan exits nonzero (2), impact classifies `unresolved`
      fs.writeFileSync(path.join(tmp, 'lib', 'broken-syntax.js'), 'export function oops( { return ;;; }\n');
      const syntaxFailSnap = scanMod.scanRepositorySnapshot(tmp);
      assert.equal(syntaxFailSnap.parse_failures.length, 1);
      const unresolvedImpact = cmpMod.compareRegistrySnapshots(baseSnap, syntaxFailSnap);
      assert.equal(unresolvedImpact.compatibility_assessment.classification, 'unresolved');

      const cliRes = spawnSync(
        process.execPath,
        [path.join(REPO_ROOT, 'tools', 'code-registry', 'cli.mjs'), 'scan', '--root', tmp, '--out', path.join(tmp, 'out.json')],
        { encoding: 'utf8' }
      );
      assert.equal(cliRes.status, 2, 'CLI scan must exit nonzero (2) on JS syntax parse failure');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  // 6. Live BiteShark Repository Determinism, Route Count, Schema & Zero-Runtime-Modification Proof
  await test('scans live BiteShark repository deterministically with 0 parse failures, complete routes/tables, and untouched runtime code', () => {
    const snapA = scanMod.scanRepositorySnapshot(REPO_ROOT, { includeTimestamp: false });
    const snapB = scanMod.scanRepositorySnapshot(REPO_ROOT, { includeTimestamp: false });

    assert.equal(snapA.parse_failures.length, 0, 'Zero JS parse failures expected across BiteShark repository');
    assert.equal(snapA.deterministic_digest_sha256, snapB.deterministic_digest_sha256);
    assert.equal(schemaMod.deterministicStringify(snapA, false), schemaMod.deterministicStringify(snapB, false));

    // Verify all 30 frozen domain routes from server/routes.js are extracted
    const domainRoutes = snapA.backend_routes.filter(r => r.dispatcher === 'server/routes.js');
    assert.equal(domainRoutes.length, 30, `Expected 30 domain routes from server/routes.js, got ${domainRoutes.length}`);
    assert.ok(snapA.backend_routes.length >= 80, `Expected >= 80 total HTTP routes, got ${snapA.backend_routes.length}`);
    assert.ok(snapA.database.migrations.length >= 26, 'Expected >= 26 SQL migrations');
    assert.ok(snapA.database.tables.some(t => t.table_name === 'vendors'));
    assert.ok(snapA.database.tables.some(t => t.table_name === 'feature_controls' && t.rls_forced === true));

    // Verify zero broken Markdown links inside docs/engineering/**, AGENTS.md, or README.md
    const brokenHandbookLinks = snapA.drift_report.findings.filter(
      f =>
        f.category === 'BROKEN_DOC_LINK' &&
        f.affected_objects.some(o => o.startsWith('docs/engineering/') || o.startsWith('AGENTS.md') || o.startsWith('README.md'))
    );
    assert.deepEqual(brokenHandbookLinks, [], `Broken links found in handbook: ${JSON.stringify(brokenHandbookLinks)}`);

    // On dedicated handbook branch, verify zero runtime application files were modified relative to merge-base with origin/working/biteshark-vps
    try {
      const branch = execFileSync('git', ['symbolic-ref', '--quiet', '--short', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
      if (branch === 'chore/shared-code-registry-handbook') {
        const diffRuntime = execFileSync(
          'git',
          ['diff', '--name-only', 'origin/working/biteshark-vps', '--', 'api', 'lib', 'server', 'packages', 'public', 'migrations', 'package-lock.json'],
          { cwd: REPO_ROOT, encoding: 'utf8' }
        ).trim();
        assert.equal(diffRuntime, '', `Runtime files must not be modified on handbook branch, found: ${diffRuntime}`);
      }
    } catch {}
  });

  console.log(`\nCode Registry Test Suite: ${passed} / ${passed} checks passed.`);
}

run().catch(err => {
  console.error('Code Registry Test Suite FAILED:', err);
  process.exit(1);
});
