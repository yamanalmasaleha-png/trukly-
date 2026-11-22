// BiteShark Code Registry — Full Workspace / Commit Snapshot Scanner
// (`tools/code-registry/scanner.mjs`)

import fs from 'node:fs';
import path from 'node:path';
import {
  GENERATOR_NAME,
  GENERATOR_VERSION,
  REGISTRY_SCHEMA_VERSION,
  EXPLICIT_EXCLUSION_RULES,
  asciiCompare,
  sha256Text,
  collectWorkspaceFiles,
  resolveGitProvenance,
  computePayloadDigest,
  computeGovernanceDigest
} from './schema-versions.mjs';
import { analyzeJavaScriptFile } from './js-analyzer.mjs';
import { analyzeHtmlFile, analyzeCssFile } from './html-css-analyzer.mjs';
import { resolveSymbolRelationships } from './relationship-resolver.mjs';
import {
  extractFeatureControlsContract,
  extractDiagnosticsContract,
  extractBackendRoutes,
  analyzeMigrationsAndSchema,
  generateMermaidErDiagram
} from './backend-db-analyzer.mjs';
import { detectRepositoryDrift } from './drift-detector.mjs';

export const CANONICAL_GENERATED_DOC_PATHS = Object.freeze([
  'docs/engineering/generated/registry-summary.json',
  'docs/engineering/generated/CONTRACTS-CATALOG.md',
  'docs/engineering/generated/SYMBOL-INDEX.md',
  'docs/engineering/generated/symbols/server-and-runtime.md',
  'docs/engineering/generated/symbols/shared-libraries.md',
  'docs/engineering/generated/symbols/domain-api-handlers.md',
  'docs/engineering/generated/symbols/frontend-scripts.md',
  'docs/engineering/generated/symbols/scripts-and-tooling.md',
  'docs/engineering/generated/ROUTE-INVENTORY.md',
  'docs/engineering/generated/FRONTEND-INVENTORY.md',
  'docs/engineering/generated/SCHEMA-INVENTORY.md',
  'docs/engineering/generated/DRIFT-REPORT.md',
  'docs/engineering/schemas/drift-baseline.json'
]);

export function scanRepositorySnapshot(
  rootDir,
  {
    overrideRef = null,
    overrideSha = null,
    includeTimestamp = false,
    suppressionsPath = null,
    configContractPath = null,
    sharedContractsPath = null,
    routeOverridesPath = null
  } = {}
) {
  const absRoot = path.resolve(rootDir);
  const provenance = resolveGitProvenance(absRoot, { overrideRef, overrideSha });
  const collected = collectWorkspaceFiles(absRoot);

  const fileContentsByPath = new Map();
  const markdownFilesByPath = new Map();
  const allRepoPathsSet = new Set();

  for (const f of collected.includedFiles) {
    allRepoPathsSet.add(f.path);
  }
  for (const b of collected.binaryAssets) {
    allRepoPathsSet.add(b.path);
  }
  const walkAllSafePaths = (dir, relBase) => {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => asciiCompare(a.name, b.name));
    } catch {
      return;
    }
    for (const ent of entries) {
      if (ent.name === '.git' || ent.name === 'node_modules') continue;
      const rel = relBase ? `${relBase}/${ent.name}` : ent.name;
      allRepoPathsSet.add(rel);
      if (ent.isDirectory()) {
        walkAllSafePaths(path.join(dir, ent.name), rel);
      }
    }
  };
  walkAllSafePaths(absRoot, '');
  for (const genRel of CANONICAL_GENERATED_DOC_PATHS) {
    allRepoPathsSet.add(genRel);
  }

  const jsAnalyses = [];
  const jsAnalysesByPath = new Map();
  const htmlAnalyses = [];
  const cssAnalyses = [];
  const migrationFiles = [];
  const parseFailures = [];
  const manifestHashParts = [];

  for (const item of collected.includedFiles) {
    let text = '';
    try {
      text = fs.readFileSync(item.absPath, 'utf8').replace(/\r\n/g, '\n');
    } catch {
      continue;
    }
    fileContentsByPath.set(item.path, text);
    manifestHashParts.push(`${item.path}\0${sha256Text(text)}`);

    if (item.path.endsWith('.md')) {
      markdownFilesByPath.set(item.path, text);
    }

    if (/\.(m?js|cjs)$/i.test(item.path)) {
      const res = analyzeJavaScriptFile(text, item.path);
      jsAnalyses.push(res);
      jsAnalysesByPath.set(item.path, res);
      if (!res.parse_ok && res.parse_error) {
        parseFailures.push(res.parse_error);
      }
    } else if (/\.html?$/i.test(item.path)) {
      const hRes = analyzeHtmlFile(text, item.path);
      htmlAnalyses.push(hRes);
      for (const inl of hRes.inline_scripts || []) {
        jsAnalysesByPath.set(inl.file, inl);
        if (!inl.parse_ok && inl.parse_error) {
          parseFailures.push(inl.parse_error);
        }
      }
    } else if (/\.css$/i.test(item.path)) {
      cssAnalyses.push(analyzeCssFile(text, item.path));
    } else if (item.path.startsWith('migrations/') && item.path.endsWith('.sql')) {
      migrationFiles.push({
        filename: path.posix.basename(item.path),
        path: item.path,
        content: text
      });
    }
  }

  for (const bin of collected.binaryAssets) {
    manifestHashParts.push(`BIN:${bin.path}\0${bin.sha256}`);
  }
  const includedFilesManifestSha256 = sha256Text(manifestHashParts.join('\n'));

  // Resolve symbol-to-symbol relationships across ESM, CJS, browser scripts & HTML inline handlers
  const relationshipSummary = resolveSymbolRelationships({
    jsAnalyses,
    htmlAnalyses
  });

  // Load maintained shared contracts & route overrides (if present)
  const resolvedContractsPath =
    sharedContractsPath || path.join(absRoot, 'docs', 'engineering', 'contracts', 'shared-contracts.json');
  let sharedContracts = [];
  if (fs.existsSync(resolvedContractsPath)) {
    try {
      const parsedCtr = JSON.parse(fs.readFileSync(resolvedContractsPath, 'utf8'));
      sharedContracts = Array.isArray(parsedCtr.contracts) ? parsedCtr.contracts : [];
    } catch {}
  }

  const resolvedOverridesPath =
    routeOverridesPath || path.join(absRoot, 'docs', 'engineering', 'contracts', 'route-overrides.json');
  let routeOverrides = [];
  if (fs.existsSync(resolvedOverridesPath)) {
    try {
      const parsedOv = JSON.parse(fs.readFileSync(resolvedOverridesPath, 'utf8'));
      routeOverrides = Array.isArray(parsedOv.overrides) ? parsedOv.overrides : [];
    } catch {}
  }

  // Attach `contract_ids` onto matching JS symbols (`file#symbolName`)
  const symbolContractsMap = new Map();
  for (const ctr of sharedContracts) {
    for (const impl of ctr.implementation_symbols || []) {
      if (!symbolContractsMap.has(impl)) symbolContractsMap.set(impl, []);
      symbolContractsMap.get(impl).push(ctr.contract_id);
    }
  }
  for (const mod of jsAnalyses) {
    for (const sym of mod.symbols || []) {
      const key = `${mod.file}#${sym.name}`;
      sym.contract_ids = (symbolContractsMap.get(key) || []).sort(asciiCompare);
    }
  }

  const featureControlsSrc = fileContentsByPath.get('lib/feature-controls.js') || '';
  const diagnosticsSrc = fileContentsByPath.get('lib/diagnostics.js') || '';
  const runMigrationsSrc = fileContentsByPath.get('scripts/run-migrations.cjs') || '';

  const featureContract = extractFeatureControlsContract(featureControlsSrc, 'lib/feature-controls.js');
  const diagnosticsContract = extractDiagnosticsContract(diagnosticsSrc, 'lib/diagnostics.js');
  const routes = extractBackendRoutes({
    fileContentsByPath,
    featureRouteRules: featureContract.route_rules,
    jsAnalysesByPath,
    routeOverrides,
    sharedContracts
  });
  const schemaInfo = analyzeMigrationsAndSchema({
    migrationFiles,
    runMigrationsSource: runMigrationsSrc
  });
  const mermaidEr = generateMermaidErDiagram(schemaInfo.tables);

  // Load suppressions & baseline for governance digest
  const resolvedSuppPath = suppressionsPath || path.join(absRoot, 'tools', 'code-registry', 'suppressions.json');
  let parsedSuppObj = null;
  let suppressions = [];
  if (fs.existsSync(resolvedSuppPath)) {
    try {
      parsedSuppObj = JSON.parse(fs.readFileSync(resolvedSuppPath, 'utf8'));
      suppressions = Array.isArray(parsedSuppObj.suppressions) ? parsedSuppObj.suppressions : [];
    } catch {}
  }

  const baselinePath = path.join(absRoot, 'docs', 'engineering', 'schemas', 'drift-baseline.json');
  let parsedBaselineObj = null;
  if (fs.existsSync(baselinePath)) {
    try {
      parsedBaselineObj = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    } catch {}
  }

  const resolvedConfigPath =
    configContractPath || path.join(absRoot, 'docs', 'engineering', 'contracts', 'configuration-keys.json');
  const documentedConfigKeys = new Set();
  if (fs.existsSync(resolvedConfigPath)) {
    try {
      const parsedCfg = JSON.parse(fs.readFileSync(resolvedConfigPath, 'utf8'));
      for (const item of parsedCfg.keys || []) {
        if (item.name) documentedConfigKeys.add(item.name);
        for (const alias of item.aliases || []) documentedConfigKeys.add(alias);
      }
    } catch {}
  }

  const driftResult = detectRepositoryDrift({
    commitSha: provenance.commit_sha,
    jsAnalyses,
    htmlAnalyses,
    cssAnalyses,
    routes,
    featureContract,
    schemaInfo,
    documentedConfigKeys,
    markdownFilesByPath,
    allRepoPathsSet,
    suppressions
  });

  // Aggregate Dependencies (`package.json` + CDN external assets)
  let packageMeta = {
    name: 'biteshark',
    version: '1.0.0',
    engines: {},
    dependencies: {},
    devDependencies: {},
    scripts: {}
  };
  const pkgRaw = fileContentsByPath.get('package.json');
  if (pkgRaw) {
    try {
      const parsedPkg = JSON.parse(pkgRaw);
      packageMeta = {
        name: parsedPkg.name || 'biteshark',
        version: parsedPkg.version || '1.0.0',
        type: parsedPkg.type || 'commonjs',
        engines: parsedPkg.engines || {},
        dependencies: parsedPkg.dependencies || {},
        devDependencies: parsedPkg.devDependencies || {},
        scripts: parsedPkg.scripts || {}
      };
    } catch {}
  }

  const externalBrowserAssets = [];
  for (const h of htmlAnalyses) {
    for (const ext of h.external_resources) {
      externalBrowserAssets.push(ext);
    }
  }
  externalBrowserAssets.sort((a, b) => asciiCompare(a.url, b.url) || asciiCompare(a.file, b.file));

  // Aggregate unique configuration keys read in first-party non-test/non-registry-tool JS
  const configConsumersMap = new Map();
  for (const ja of jsAnalyses) {
    if (ja.file.startsWith('tests/') || ja.file.startsWith('tools/code-registry/')) continue;
    for (const er of ja.env_reads) {
      if (!configConsumersMap.has(er.key)) {
        configConsumersMap.set(er.key, {
          key: er.key,
          legacy_alias: er.legacy_alias || null,
          consumers: []
        });
      }
      const entry = configConsumersMap.get(er.key);
      if (er.legacy_alias && !entry.legacy_alias) entry.legacy_alias = er.legacy_alias;
      const loc = `${ja.file}:L${er.line}`;
      if (!entry.consumers.includes(loc)) entry.consumers.push(loc);
    }
  }
  const configurationConsumers = [...configConsumersMap.values()].sort((a, b) => asciiCompare(a.key, b.key));

  // Aggregate storage inventory (`localStorage`, `sessionStorage`, `IndexedDB`, `CacheStorage`, `cookie`)
  const storageInventoryMap = new Map();
  for (const ja of jsAnalyses) {
    if (ja.file.startsWith('tests/') || ja.file.startsWith('tools/code-registry/')) continue;
    for (const sa of ja.storage_accesses) {
      const sk = `${sa.storage_type}::${sa.key}`;
      if (!storageInventoryMap.has(sk)) {
        storageInventoryMap.set(sk, {
          storage_type: sa.storage_type,
          key: sa.key,
          operations: new Set(),
          files: new Set()
        });
      }
      const rec = storageInventoryMap.get(sk);
      rec.operations.add(sa.operation);
      rec.files.add(`${ja.file}:L${sa.line}`);
    }
  }
  const storageInventory = [...storageInventoryMap.values()]
    .map(r => ({
      storage_type: r.storage_type,
      key: r.key,
      operations: [...r.operations].sort(asciiCompare),
      locations: [...r.files].sort(asciiCompare)
    }))
    .sort((a, b) => asciiCompare(a.storage_type, b.storage_type) || asciiCompare(a.key, b.key));

  const totalSymbols = jsAnalyses.reduce((s, j) => s + j.symbols.length, 0);
  const totalClasses = jsAnalyses.reduce((s, j) => s + j.classes.length, 0);
  const totalConstants = jsAnalyses.reduce((s, j) => s + j.constants.length, 0);
  const totalGlobals = jsAnalyses.reduce((s, j) => s + j.globals_assigned.length, 0);
  const totalHtmlIds = htmlAnalyses.reduce((s, h) => s + h.elements_by_id.length, 0);
  const activeFindings = driftResult.findings.filter(f => !f.suppressed);

  const payload = {
    schema_version: REGISTRY_SCHEMA_VERSION,
    generator: {
      name: GENERATOR_NAME,
      version: GENERATOR_VERSION,
      analysis_mode: 'static_ast_html_css_sql_offline',
      limitations_note:
        'Static AST, HTML, CSS, and SQL analysis without executing application modules. Relationships distinguish confirmed_static, documented_wrapper, inferred_candidate, and dynamic_unresolved; static analysis does not prove runtime behavioral correctness.'
    },
    provenance: {
      ...provenance,
      ...(includeTimestamp ? { generated_at_utc: new Date().toISOString() } : {})
    },
    scope: {
      included_file_count: collected.includedFiles.length,
      included_files_manifest_sha256: includedFilesManifestSha256,
      binary_asset_count: collected.binaryAssets.length,
      excluded_item_count: collected.excludedRecords.length,
      exclusion_rules: EXPLICIT_EXCLUSION_RULES,
      excluded_paths: collected.excludedRecords
    },
    coverage_counts: {
      js_files_scanned: jsAnalyses.length,
      js_parse_failures: parseFailures.length,
      functions_and_methods: totalSymbols,
      classes: totalClasses,
      significant_constants: totalConstants,
      browser_globals_and_assignments: totalGlobals,
      confirmed_call_edges: relationshipSummary.confirmed_edge_count,
      inferred_call_edges: relationshipSummary.inferred_edge_count,
      html_files_scanned: htmlAnalyses.length,
      html_element_ids: totalHtmlIds,
      css_files_scanned: cssAnalyses.length,
      http_routes: routes.length,
      shared_contracts: sharedContracts.length,
      sql_migrations: schemaInfo.migrations.length,
      sql_tables: schemaInfo.tables.length,
      sql_rls_policies: schemaInfo.tables.reduce((s, t) => s + t.rls_policies.length, 0),
      feature_controls: featureContract.features.length,
      configuration_keys_observed: configurationConsumers.length,
      storage_keys_observed: storageInventory.length,
      drift_findings_active: activeFindings.length,
      drift_findings_suppressed: driftResult.findings.length - activeFindings.length
    },
    parse_failures: parseFailures,
    package_metadata: packageMeta,
    external_browser_assets: externalBrowserAssets,
    js_modules: jsAnalyses,
    relationships: {
      confirmed_edge_count: relationshipSummary.confirmed_edge_count,
      inferred_edge_count: relationshipSummary.inferred_edge_count,
      html_handler_bindings: relationshipSummary.html_handler_bindings,
      wrapper_chains: relationshipSummary.wrapper_chains
    },
    html_documents: htmlAnalyses,
    css_stylesheets: cssAnalyses,
    backend_routes: routes,
    shared_contracts: sharedContracts,
    feature_controls: featureContract,
    diagnostics_contract: diagnosticsContract,
    configuration_consumers: configurationConsumers,
    storage_inventory: storageInventory,
    database: {
      ...schemaInfo,
      mermaid_er_diagram: mermaidEr
    },
    binary_assets: collected.binaryAssets,
    drift_report: {
      active_count: activeFindings.length,
      suppressed_count: driftResult.findings.length - activeFindings.length,
      findings: driftResult.findings
    }
  };

  const sourceDigest = computePayloadDigest(payload);
  payload.source_analysis_digest_sha256 = sourceDigest;
  payload.deterministic_digest_sha256 = sourceDigest;
  payload.governance_digest_sha256 = computeGovernanceDigest({
    baselineObj: parsedBaselineObj,
    suppressionsObj: parsedSuppObj
  });
  return payload;
}
