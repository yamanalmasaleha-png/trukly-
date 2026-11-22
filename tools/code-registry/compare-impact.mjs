// BiteShark Code Registry — Merge-Base-Aware Ref Comparison & Change-Impact Engine
// (`tools/code-registry/compare-impact.mjs`)

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { IMPACT_SCHEMA_VERSION, GENERATOR_NAME, GENERATOR_VERSION } from './schema-versions.mjs';
import { scanRepositorySnapshot } from './scanner.mjs';

export function scanGitRefSnapshot(repoRoot, gitRef) {
  const absRoot = path.resolve(repoRoot);
  const fullSha = execFileSync('git', ['rev-parse', '--verify', `${gitRef}^{commit}`], {
    cwd: absRoot,
    encoding: 'utf8'
  }).trim();

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-reg-ref-'));
  const tarFile = path.join(tmpDir, 'ref.tar');
  const extractDir = path.join(tmpDir, 'tree');
  fs.mkdirSync(extractDir, { recursive: true });

  try {
    // Use `--no-worktree-attributes`? Note: `git archive --worktree-attributes` is off unless requested,
    // wait: `.gitattributes` inside the commit has `export-ignore` on `tests`!
    // To scan the COMPLETE committed tree INCLUDING `tests/` and `.github/`, pass `--worktree-attributes`?
    // Even better: `git --git-dir=... archive` honors `.gitattributes` unless overridden via `-c` or `git checkout-index`!
    // Using `git worktree add --detach` (read-only temporary worktree) gives the 100% exact committed tree including `tests/` and `.github/`!
    execFileSync('git', ['worktree', 'add', '--detach', '--quiet', extractDir, fullSha], {
      cwd: absRoot,
      stdio: 'pipe'
    });
    try {
      return scanRepositorySnapshot(extractDir, {
        overrideRef: gitRef,
        overrideSha: fullSha
      });
    } finally {
      try {
        execFileSync('git', ['worktree', 'remove', '--force', extractDir], {
          cwd: absRoot,
          stdio: 'pipe'
        });
      } catch {}
    }
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  }
}

export function resolveMergeBaseSha(repoRoot, refA, refB) {
  try {
    return execFileSync('git', ['merge-base', refA, refB], {
      cwd: path.resolve(repoRoot),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch {
    return null;
  }
}

function buildSymbolIndex(snapshot) {
  const map = new Map();
  for (const mod of snapshot.js_modules || []) {
    if (mod.file.startsWith('tests/')) continue;
    for (const sym of mod.symbols || []) {
      map.set(sym.symbol_id, {
        ...sym,
        signature_key: `${sym.async ? 'async ' : ''}${sym.name}(${sym.params.map(p => p.name).join(', ')})`
      });
    }
  }
  return map;
}

function buildCallerIndex(snapshot) {
  // Maps callee identifier -> list of `file:caller`
  const map = new Map();
  for (const mod of snapshot.js_modules || []) {
    for (const c of mod.calls || []) {
      const baseName = c.callee.split('.').pop();
      for (const k of [c.callee, baseName]) {
        if (!k || k === '<computed_or_iife>') continue;
        if (!map.has(k)) map.set(k, new Set());
        map.get(k).add(`${mod.file}:${c.caller}`);
      }
    }
  }
  return map;
}

export function compareRegistrySnapshots(baseSnap, headSnap, { mergeBaseSha = null, comparisonMode = 'direct' } = {}) {
  const baseSymbols = buildSymbolIndex(baseSnap);
  const headSymbols = buildSymbolIndex(headSnap);
  const headCallers = buildCallerIndex(headSnap);
  const baseCallers = buildCallerIndex(baseSnap);

  const symbolsAdded = [];
  const symbolsRemoved = [];
  const symbolsChanged = [];
  const brokenCallersOfRemovedSymbols = [];

  for (const [id, sym] of headSymbols.entries()) {
    if (!baseSymbols.has(id)) {
      symbolsAdded.push({
        symbol_id: id,
        file: sym.file,
        name: sym.name,
        exported: sym.exported,
        signature: sym.signature_key
      });
    } else {
      const prev = baseSymbols.get(id);
      if (
        prev.signature_key !== sym.signature_key ||
        prev.exported !== sym.exported ||
        prev.return_behavior !== sym.return_behavior
      ) {
        const callers = [...(headCallers.get(sym.name) || [])].sort();
        symbolsChanged.push({
          symbol_id: id,
          file: sym.file,
          name: sym.name,
          before_signature: prev.signature_key,
          after_signature: sym.signature_key,
          before_exported: prev.exported,
          after_exported: sym.exported,
          known_callers: callers.slice(0, 20)
        });
      }
    }
  }

  for (const [id, prev] of baseSymbols.entries()) {
    if (!headSymbols.has(id)) {
      const remainingCallers = [...(headCallers.get(prev.name) || [])].filter(loc => !loc.startsWith('tests/')).sort();
      symbolsRemoved.push({
        symbol_id: id,
        file: prev.file,
        name: prev.name,
        was_exported: prev.exported,
        signature: prev.signature_key,
        remaining_callers_in_head: remainingCallers,
        prior_callers_in_base: [...(baseCallers.get(prev.name) || [])].slice(0, 15)
      });
      if ((prev.exported || prev.file.startsWith('public/')) && remainingCallers.length > 0) {
        brokenCallersOfRemovedSymbols.push({
          symbol_id: id,
          name: prev.name,
          remaining_callers: remainingCallers
        });
      }
    }
  }

  // Routes diff
  const baseRoutes = new Map((baseSnap.backend_routes || []).map(r => [r.path, r]));
  const headRoutes = new Map((headSnap.backend_routes || []).map(r => [r.path, r]));
  const routesAdded = [];
  const routesRemoved = [];
  const routesChanged = [];

  for (const [p, hr] of headRoutes.entries()) {
    if (!baseRoutes.has(p)) {
      routesAdded.push({
        path: p,
        methods: hr.methods,
        handler_file: hr.handler_file,
        auth_requirement: hr.auth_requirement,
        feature_gate: hr.feature_gate
      });
    } else {
      const br = baseRoutes.get(p);
      const removedMethods = br.methods.filter(m => !hr.methods.includes(m));
      const addedMethods = hr.methods.filter(m => !br.methods.includes(m));
      if (
        removedMethods.length > 0 ||
        addedMethods.length > 0 ||
        br.auth_requirement !== hr.auth_requirement ||
        br.feature_gate !== hr.feature_gate ||
        br.handler_file !== hr.handler_file
      ) {
        routesChanged.push({
          path: p,
          before_methods: br.methods,
          after_methods: hr.methods,
          removed_methods: removedMethods,
          before_auth: br.auth_requirement,
          after_auth: hr.auth_requirement,
          before_feature_gate: br.feature_gate,
          after_feature_gate: hr.feature_gate,
          known_frontend_callers: hr.known_frontend_callers || [],
          verifying_tests: hr.verifying_tests || []
        });
      }
    }
  }
  for (const [p, br] of baseRoutes.entries()) {
    if (!headRoutes.has(p)) {
      routesRemoved.push({
        path: p,
        methods: br.methods,
        handler_file: br.handler_file,
        prior_frontend_callers: br.known_frontend_callers || []
      });
    }
  }

  // Database tables & migrations diff
  const baseMigs = new Map((baseSnap.database?.migrations || []).map(m => [m.filename, m]));
  const headMigs = new Map((headSnap.database?.migrations || []).map(m => [m.filename, m]));
  const migrationsAdded = [];
  const migrationsRemoved = [];
  const migrationsChecksumChanged = [];

  for (const [fn, hm] of headMigs.entries()) {
    if (!baseMigs.has(fn)) migrationsAdded.push(fn);
    else if (baseMigs.get(fn).sha256 !== hm.sha256) {
      migrationsChecksumChanged.push({
        filename: fn,
        before_sha256: baseMigs.get(fn).sha256,
        after_sha256: hm.sha256
      });
    }
  }
  for (const fn of baseMigs.keys()) {
    if (!headMigs.has(fn)) migrationsRemoved.push(fn);
  }

  const baseTables = new Map((baseSnap.database?.tables || []).map(t => [t.table_name, t]));
  const headTables = new Map((headSnap.database?.tables || []).map(t => [t.table_name, t]));
  const tablesAdded = [];
  const tablesRemoved = [];
  const tablesChanged = [];

  for (const [tn, ht] of headTables.entries()) {
    if (!baseTables.has(tn)) {
      tablesAdded.push(tn);
    } else {
      const bt = baseTables.get(tn);
      const bCols = new Set(bt.columns.map(c => c.name));
      const hCols = new Set(ht.columns.map(c => c.name));
      const addedCols = [...hCols].filter(c => !bCols.has(c));
      const droppedCols = [...bCols].filter(c => !hCols.has(c));
      if (addedCols.length || droppedCols.length || bt.rls_forced !== ht.rls_forced) {
        tablesChanged.push({
          table_name: tn,
          columns_added: addedCols,
          columns_removed: droppedCols,
          before_rls_forced: bt.rls_forced,
          after_rls_forced: ht.rls_forced
        });
      }
    }
  }
  for (const tn of baseTables.keys()) {
    if (!headTables.has(tn)) tablesRemoved.push(tn);
  }

  // Feature Controls diff
  const baseFc = new Map((baseSnap.feature_controls?.features || []).map(f => [f.key, f]));
  const headFc = new Map((headSnap.feature_controls?.features || []).map(f => [f.key, f]));
  const featureControlsAdded = [...headFc.keys()].filter(k => !baseFc.has(k)).sort();
  const featureControlsRemoved = [...baseFc.keys()].filter(k => !headFc.has(k)).sort();
  const featureControlsChanged = [];
  for (const [k, hf] of headFc.entries()) {
    if (baseFc.has(k)) {
      const bf = baseFc.get(k);
      if (
        bf.default_state !== hf.default_state ||
        JSON.stringify(bf.depends_on) !== JSON.stringify(hf.depends_on) ||
        JSON.stringify(bf.allowed_states) !== JSON.stringify(hf.allowed_states)
      ) {
        featureControlsChanged.push({
          key: k,
          before_default: bf.default_state,
          after_default: hf.default_state,
          before_depends_on: bf.depends_on,
          after_depends_on: hf.depends_on
        });
      }
    }
  }

  // Configuration keys diff
  const baseCfg = new Set((baseSnap.configuration_consumers || []).map(c => c.key));
  const headCfg = new Set((headSnap.configuration_consumers || []).map(c => c.key));
  const configKeysAdded = [...headCfg].filter(k => !baseCfg.has(k)).sort();
  const configKeysRemoved = [...baseCfg].filter(k => !headCfg.has(k)).sort();

  // Relevant tests & docs requiring review
  const relevantTests = new Set();
  for (const r of [...routesAdded, ...routesChanged]) {
    for (const t of r.verifying_tests || []) relevantTests.add(t);
  }
  for (const mod of headSnap.js_modules || []) {
    if (mod.file.startsWith('tests/')) {
      const baseMod = (baseSnap.js_modules || []).find(m => m.file === mod.file);
      if (!baseMod || baseMod.symbols.length !== mod.symbols.length) {
        relevantTests.add(mod.file);
      }
    }
  }

  const docsRequiringReview = [];
  if (routesAdded.length || routesRemoved.length || routesChanged.length) {
    docsRequiringReview.push('docs/engineering/API-CONTRACTS.md', 'docs/engineering/BACKEND-MAP.md');
  }
  if (migrationsAdded.length || migrationsRemoved.length || tablesAdded.length || tablesChanged.length) {
    docsRequiringReview.push('docs/engineering/DATA-MODEL.md', 'docs/engineering/MIGRATIONS.md');
  }
  if (featureControlsAdded.length || featureControlsRemoved.length || featureControlsChanged.length) {
    docsRequiringReview.push('docs/engineering/FEATURE-CONTROLS.md');
  }
  if (configKeysAdded.length || configKeysRemoved.length) {
    docsRequiringReview.push('docs/engineering/CONFIGURATION.md', 'docs/engineering/contracts/configuration-keys.json');
  }
  if (symbolsAdded.some(s => s.file.startsWith('public/')) || symbolsRemoved.some(s => s.file.startsWith('public/'))) {
    docsRequiringReview.push('docs/engineering/FRONTEND-MAP.md');
  }

  // Compatibility Classification
  const breakingEvidence = [];
  const potentialBreakingEvidence = [];

  if (routesRemoved.length > 0) {
    breakingEvidence.push(`Removed HTTP route(s): ${routesRemoved.map(r => r.path).join(', ')}`);
  }
  for (const rc of routesChanged) {
    if (rc.removed_methods.length > 0) {
      breakingEvidence.push(`Route ${rc.path} removed HTTP method(s): ${rc.removed_methods.join(', ')}`);
    } else {
      potentialBreakingEvidence.push(`Route ${rc.path} changed auth/gate/handler metadata.`);
    }
  }
  if (migrationsChecksumChanged.length > 0) {
    breakingEvidence.push(
      `Immutable SQL migration checksum modified: ${migrationsChecksumChanged.map(m => m.filename).join(', ')}`
    );
  }
  if (migrationsRemoved.length > 0 || tablesRemoved.length > 0) {
    breakingEvidence.push(
      `Database migration or table removed (${[...migrationsRemoved, ...tablesRemoved].join(', ')})`
    );
  }
  for (const tc of tablesChanged) {
    if (tc.columns_removed.length > 0) {
      breakingEvidence.push(`Table ${tc.table_name} dropped column(s): ${tc.columns_removed.join(', ')}`);
    }
  }
  if (featureControlsRemoved.length > 0) {
    breakingEvidence.push(`Removed feature control key(s): ${featureControlsRemoved.join(', ')}`);
  }
  if (brokenCallersOfRemovedSymbols.length > 0) {
    breakingEvidence.push(
      `Removed symbol(s) still referenced by active callers: ${brokenCallersOfRemovedSymbols.map(b => `${b.name} (called by ${b.remaining_callers.join(', ')})`).join('; ')}`
    );
  }
  if (symbolsRemoved.some(s => s.was_exported)) {
    potentialBreakingEvidence.push(
      `Exported symbol(s) removed: ${symbolsRemoved.filter(s => s.was_exported).map(s => `${s.file}#${s.name}`).join(', ')}`
    );
  }
  if (symbolsChanged.length > 0) {
    potentialBreakingEvidence.push(
      `Symbol signature/export changes (${symbolsChanged.length}): ${symbolsChanged.slice(0, 8).map(s => `${s.file}#${s.name}`).join(', ')}`
    );
  }

  let compatibilityClass = 'compatible';
  if (headSnap.parse_failures.length > 0) {
    compatibilityClass = 'unresolved';
  } else if (breakingEvidence.length > 0) {
    compatibilityClass = 'breaking';
  } else if (potentialBreakingEvidence.length > 0) {
    compatibilityClass = 'potentially_breaking';
  }

  return {
    schema_version: IMPACT_SCHEMA_VERSION,
    generator: { name: GENERATOR_NAME, version: GENERATOR_VERSION },
    comparison: {
      mode: comparisonMode,
      base_ref: baseSnap.provenance.branch_or_ref,
      base_sha: baseSnap.provenance.commit_sha,
      head_ref: headSnap.provenance.branch_or_ref,
      head_sha: headSnap.provenance.commit_sha,
      merge_base_sha: mergeBaseSha
    },
    compatibility_assessment: {
      classification: compatibilityClass,
      breaking_evidence: breakingEvidence,
      potentially_breaking_evidence: potentialBreakingEvidence,
      behavioral_caveat:
        'Static signature compatibility does not prove runtime behavioral equivalence; execute verifying_tests before merging or deploying.'
    },
    summary_counts: {
      symbols_added: symbolsAdded.length,
      symbols_changed: symbolsChanged.length,
      symbols_removed: symbolsRemoved.length,
      routes_added: routesAdded.length,
      routes_changed: routesChanged.length,
      routes_removed: routesRemoved.length,
      migrations_added: migrationsAdded.length,
      tables_added: tablesAdded.length,
      feature_controls_added: featureControlsAdded.length,
      config_keys_added: configKeysAdded.length
    },
    symbols: {
      added: symbolsAdded,
      changed: symbolsChanged,
      removed: symbolsRemoved,
      broken_consumer_links: brokenCallersOfRemovedSymbols
    },
    apis: {
      added: routesAdded,
      changed: routesChanged,
      removed: routesRemoved
    },
    database: {
      migrations_added: migrationsAdded,
      migrations_removed: migrationsRemoved,
      migrations_checksum_changed: migrationsChecksumChanged,
      tables_added: tablesAdded,
      tables_removed: tablesRemoved,
      tables_changed: tablesChanged
    },
    feature_controls: {
      added: featureControlsAdded,
      removed: featureControlsRemoved,
      changed: featureControlsChanged
    },
    configuration: {
      added: configKeysAdded,
      removed: configKeysRemoved
    },
    relevant_tests: [...relevantTests].sort(),
    documentation_requiring_review: [...new Set(docsRequiringReview)].sort()
  };
}

export function formatImpactReportMarkdown(impact) {
  const lines = [
    `# BiteShark Change-Impact Report`,
    ``,
    `- **Base**: \`${impact.comparison.base_ref}\` (\`${impact.comparison.base_sha}\`)`,
    `- **Head**: \`${impact.comparison.head_ref}\` (\`${impact.comparison.head_sha}\`)`,
    ...(impact.comparison.merge_base_sha ? [`- **Merge-Base SHA**: \`${impact.comparison.merge_base_sha}\``] : []),
    `- **Compatibility Classification**: **\`${impact.compatibility_assessment.classification}\`**`,
    ``,
    `> ${impact.compatibility_assessment.behavioral_caveat}`,
    ``
  ];

  if (impact.compatibility_assessment.breaking_evidence.length) {
    lines.push(`## Breaking Evidence`);
    for (const e of impact.compatibility_assessment.breaking_evidence) lines.push(`- ${e}`);
    lines.push(``);
  }
  if (impact.compatibility_assessment.potentially_breaking_evidence.length) {
    lines.push(`## Potentially Breaking Changes`);
    for (const e of impact.compatibility_assessment.potentially_breaking_evidence) lines.push(`- ${e}`);
    lines.push(``);
  }

  lines.push(
    `## Summary Counts`,
    ``,
    `| Category | Added | Changed | Removed |`,
    `|---|---:|---:|---:|`,
    `| JS Symbols (non-test) | ${impact.summary_counts.symbols_added} | ${impact.summary_counts.symbols_changed} | ${impact.summary_counts.symbols_removed} |`,
    `| Backend HTTP Routes | ${impact.summary_counts.routes_added} | ${impact.summary_counts.routes_changed} | ${impact.summary_counts.routes_removed} |`,
    `| SQL Migrations | ${impact.database.migrations_added.length} | ${impact.database.migrations_checksum_changed.length} | ${impact.database.migrations_removed.length} |`,
    `| SQL Tables | ${impact.database.tables_added.length} | ${impact.database.tables_changed.length} | ${impact.database.tables_removed.length} |`,
    `| Feature Controls | ${impact.feature_controls.added.length} | ${impact.feature_controls.changed.length} | ${impact.feature_controls.removed.length} |`,
    `| Configuration Keys | ${impact.configuration.added.length} | — | ${impact.configuration.removed.length} |`,
    ``
  );

  if (impact.apis.added.length || impact.apis.changed.length || impact.apis.removed.length) {
    lines.push(`## Affected HTTP APIs`);
    for (const r of impact.apis.added) lines.push(`- **Added**: \`${r.methods.join(', ')} ${r.path}\` (\`${r.handler_file}\`, auth: \`${r.auth_requirement}\`)`);
    for (const r of impact.apis.changed) lines.push(`- **Changed**: \`${r.path}\` (methods: \`${r.before_methods.join(',')} -> ${r.after_methods.join(',')}\`, gate: \`${r.before_feature_gate || 'none'} -> ${r.after_feature_gate || 'none'}\`)`);
    for (const r of impact.apis.removed) lines.push(`- **Removed**: \`${r.path}\` (prior callers: ${r.prior_frontend_callers.join(', ') || 'none'})`);
    lines.push(``);
  }

  if (impact.database.migrations_added.length || impact.database.tables_added.length || impact.database.tables_changed.length) {
    lines.push(`## Affected Database Objects`);
    for (const m of impact.database.migrations_added) lines.push(`- **New Migration**: \`migrations/${m}\``);
    for (const t of impact.database.tables_added) lines.push(`- **New Table**: \`${t}\``);
    for (const tc of impact.database.tables_changed) lines.push(`- **Altered Table**: \`${tc.table_name}\` (added cols: \`${tc.columns_added.join(', ') || 'none'}\`, dropped cols: \`${tc.columns_removed.join(', ') || 'none'}\`)`);
    lines.push(``);
  }

  if (impact.symbols.added.length) {
    lines.push(`## Added Symbols (Top 30)`);
    for (const s of impact.symbols.added.slice(0, 30)) {
      lines.push(`- \`${s.file}\` -> \`${s.signature}\`${s.exported ? ' *(exported)*' : ''}`);
    }
    lines.push(``);
  }

  if (impact.documentation_requiring_review.length) {
    lines.push(`## Documentation Requiring Review`);
    for (const d of impact.documentation_requiring_review) lines.push(`- \`${d}\``);
    lines.push(``);
  }

  if (impact.relevant_tests.length) {
    lines.push(`## Relevant Verification Suites`);
    for (const t of impact.relevant_tests) lines.push(`- \`node ${t}\``);
    lines.push(``);
  }

  return lines.join('\n');
}
