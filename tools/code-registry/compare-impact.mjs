// BiteShark Code Registry — Merge-Base-Aware Ref Comparison & Change-Impact Engine
// (`tools/code-registry/compare-impact.mjs`)

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { IMPACT_SCHEMA_VERSION, GENERATOR_NAME, GENERATOR_VERSION, asciiCompare } from './schema-versions.mjs';
import { scanRepositorySnapshot } from './scanner.mjs';

export function scanGitRefSnapshot(repoRoot, gitRef) {
  const absRoot = path.resolve(repoRoot);
  let fullSha;
  try {
    fullSha = execFileSync('git', ['rev-parse', '--verify', `${gitRef}^{commit}`], {
      cwd: absRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
  } catch (err) {
    return {
      ref_resolution_failed: true,
      requested_ref: String(gitRef),
      error_message: `Git reference "${gitRef}" could not be resolved: ${err.message}`
    };
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-reg-ref-'));
  const extractDir = path.join(tmpDir, 'tree');
  fs.mkdirSync(extractDir, { recursive: true });

  try {
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

export function loadGovernanceFilesFromRef(repoRoot, gitRef) {
  const absRoot = path.resolve(repoRoot);
  const readGitJson = relPosix => {
    if (gitRef === 'WORKTREE') {
      const p = path.join(absRoot, relPosix);
      return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
    }
    try {
      const raw = execFileSync('git', ['show', `${gitRef}:${relPosix}`], {
        cwd: absRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      });
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };
  return {
    baseline: readGitJson('docs/engineering/schemas/drift-baseline.json'),
    suppressions: readGitJson('tools/code-registry/suppressions.json')
  };
}

export function diffGovernanceState(baseGov, headGov) {
  const extractIds = b => {
    if (!b) return new Map();
    if (Array.isArray(b.entries)) {
      return new Map(b.entries.map(e => [e.finding_id, e]));
    }
    if (Array.isArray(b.baseline_finding_ids)) {
      return new Map(b.baseline_finding_ids.map(id => [id, { finding_id: id }]));
    }
    return new Map();
  };
  const bMap = extractIds(baseGov?.baseline);
  const hMap = extractIds(headGov?.baseline);

  const addedBaseline = [...hMap.keys()].filter(id => !bMap.has(id)).sort(asciiCompare);
  const removedBaseline = [...bMap.keys()].filter(id => !hMap.has(id)).sort(asciiCompare);

  const bSupp = new Map((baseGov?.suppressions?.suppressions || []).map(s => [s.id, s]));
  const hSupp = new Map((headGov?.suppressions?.suppressions || []).map(s => [s.id, s]));
  const addedSuppressions = [...hSupp.keys()].filter(id => !bSupp.has(id)).sort(asciiCompare);
  const removedSuppressions = [...bSupp.keys()].filter(id => !hSupp.has(id)).sort(asciiCompare);
  const modifiedSuppressions = [...hSupp.keys()]
    .filter(id => bSupp.has(id) && JSON.stringify(bSupp.get(id)) !== JSON.stringify(hSupp.get(id)))
    .sort(asciiCompare);

  return {
    changed:
      addedBaseline.length > 0 ||
      removedBaseline.length > 0 ||
      addedSuppressions.length > 0 ||
      removedSuppressions.length > 0 ||
      modifiedSuppressions.length > 0,
    added_baseline_ids: addedBaseline,
    removed_baseline_ids: removedBaseline,
    added_suppressions: addedSuppressions,
    removed_suppressions: removedSuppressions,
    modified_suppressions: modifiedSuppressions
  };
}

function buildSymbolIndex(snapshot) {
  const map = new Map();
  for (const mod of snapshot.js_modules || []) {
    if (mod.file.startsWith('tests/')) continue;
    for (const sym of mod.symbols || []) {
      map.set(sym.symbol_id, {
        ...sym,
        signature_key: `${sym.async ? 'async ' : ''}${sym.name}(${(sym.params || []).map(p => p.name).join(', ')})`
      });
    }
  }
  return map;
}

function buildConstantsIndex(snapshot) {
  const map = new Map();
  for (const mod of snapshot.js_modules || []) {
    if (mod.file.startsWith('tests/')) continue;
    for (const c of mod.constants || []) {
      map.set(c.symbol_id, c);
    }
  }
  return map;
}

function buildUnresolvedShortCallLookup(snapshot) {
  // Finds call sites in non-test modules calling an identifier or member that might reference a removed symbol
  const byExactIdent = new Map();
  for (const mod of snapshot.js_modules || []) {
    if (mod.file.startsWith('tests/')) continue;
    for (const c of mod.calls || []) {
      if (c.is_shadowed_local || c.callee_kind === 'computed_dynamic') continue;
      if (!byExactIdent.has(c.callee)) byExactIdent.set(c.callee, new Set());
      byExactIdent.get(c.callee).add(`${mod.file}:${c.caller}@L${c.line}`);
    }
  }
  return byExactIdent;
}

function normalizeSqlTypeForDiff(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^timestamp with time zone$/, 'timestamptz')
    .replace(/^character varying/, 'varchar')
    .replace(/^int4$/, 'integer')
    .replace(/^int8$/, 'bigint')
    .replace(/^bool$/, 'boolean');
}

export function compareRegistrySnapshots(
  baseSnap,
  headSnap,
  { mergeBaseSha = null, comparisonMode = 'direct', governanceDiff = null } = {}
) {
  if (baseSnap?.ref_resolution_failed || headSnap?.ref_resolution_failed) {
    const errNotes = [
      ...(baseSnap?.ref_resolution_failed ? [baseSnap.error_message] : []),
      ...(headSnap?.ref_resolution_failed ? [headSnap.error_message] : [])
    ];
    return {
      schema_version: IMPACT_SCHEMA_VERSION,
      generator: { name: GENERATOR_NAME, version: GENERATOR_VERSION },
      comparison: {
        mode: comparisonMode,
        base_ref: baseSnap?.requested_ref || baseSnap?.provenance?.branch_or_ref || 'unknown',
        base_sha: baseSnap?.provenance?.commit_sha || 'unresolved',
        head_ref: headSnap?.requested_ref || headSnap?.provenance?.branch_or_ref || 'unknown',
        head_sha: headSnap?.provenance?.commit_sha || 'unresolved',
        merge_base_sha: mergeBaseSha
      },
      compatibility_assessment: {
        classification: 'analysis_incomplete_or_unresolved',
        breaking_evidence: [],
        potentially_breaking_evidence: [],
        unresolved_or_incomplete_reasons: errNotes,
        behavioral_caveat:
          'Comparison could not complete because one or both Git references could not be resolved.'
      },
      summary_counts: {
        symbols_added: 0,
        symbols_signature_changed: 0,
        symbols_body_changed: 0,
        symbols_removed: 0,
        constants_changed: 0,
        routes_added: 0,
        routes_changed: 0,
        routes_removed: 0,
        migrations_added: 0,
        tables_added: 0,
        tables_changed: 0,
        feature_controls_added: 0,
        config_keys_added: 0
      },
      symbols: {
        added: [],
        signature_changed: [],
        body_changed: [],
        removed: [],
        renamed_or_moved_candidates: [],
        constants_changed: [],
        broken_consumer_links: []
      },
      apis: { added: [], changed: [], removed: [] },
      database: {
        migrations_added: [],
        migrations_removed: [],
        migrations_checksum_changed: [],
        migrations_requiring_manual_review: [],
        tables_added: [],
        tables_removed: [],
        tables_changed: []
      },
      feature_controls: { added: [], removed: [], changed: [] },
      configuration: { added: [], removed: [] },
      events_and_diagnostics: { events_added: [], events_removed: [], diagnostics_changed: false },
      governance_changes: governanceDiff || {
        changed: false,
        added_baseline_ids: [],
        removed_baseline_ids: [],
        added_suppressions: [],
        removed_suppressions: [],
        modified_suppressions: []
      },
      relevant_tests: [],
      documentation_requiring_review: []
    };
  }

  const baseSymbols = buildSymbolIndex(baseSnap);
  const headSymbols = buildSymbolIndex(headSnap);
  const baseConstants = buildConstantsIndex(baseSnap);
  const headConstants = buildConstantsIndex(headSnap);
  const headCallSitesByIdent = buildUnresolvedShortCallLookup(headSnap);

  const symbolsAdded = [];
  const symbolsRemoved = [];
  const symbolsSignatureChanged = [];
  const symbolsBodyChanged = [];
  const constantsChanged = [];
  const brokenCallersOfRemovedSymbols = [];

  for (const [id, sym] of headSymbols.entries()) {
    if (!baseSymbols.has(id)) {
      symbolsAdded.push({
        symbol_id: id,
        file: sym.file,
        name: sym.name,
        exported: sym.exported,
        signature: sym.signature_key,
        body_fingerprint_sha256: sym.body_fingerprint_sha256
      });
    } else {
      const prev = baseSymbols.get(id);
      const sigChanged =
        prev.signature_key !== sym.signature_key ||
        prev.exported !== sym.exported ||
        prev.return_behavior !== sym.return_behavior;
      const bodyChanged =
        prev.body_fingerprint_sha256 &&
        sym.body_fingerprint_sha256 &&
        prev.body_fingerprint_sha256 !== sym.body_fingerprint_sha256;

      if (sigChanged) {
        symbolsSignatureChanged.push({
          symbol_id: id,
          file: sym.file,
          name: sym.name,
          before_signature: prev.signature_key,
          after_signature: sym.signature_key,
          before_exported: prev.exported,
          after_exported: sym.exported,
          body_also_changed: Boolean(bodyChanged),
          confirmed_consumers: (sym.confirmed_callers || []).slice(0, 25),
          inferred_candidate_consumers: (sym.inferred_candidate_callers || []).slice(0, 15),
          contract_ids: sym.contract_ids || []
        });
      } else if (bodyChanged) {
        symbolsBodyChanged.push({
          symbol_id: id,
          file: sym.file,
          name: sym.name,
          signature: sym.signature_key,
          exported: sym.exported,
          literals_changed: prev.literals_fingerprint_sha256 !== sym.literals_fingerprint_sha256,
          confirmed_consumers: (sym.confirmed_callers || []).slice(0, 25),
          inferred_candidate_consumers: (sym.inferred_candidate_callers || []).slice(0, 15),
          dynamic_callsites_within: (sym.dynamic_unresolved_callsites || []).length,
          contract_ids: sym.contract_ids || []
        });
      }
    }
  }

  // Build head module import sources so we know if a module still imports the file of a removed export
  const headModulesImportingFile = new Map(); // targetFile -> Set<importerFile>
  for (const mod of headSnap.js_modules || []) {
    if (mod.file.startsWith('tests/')) continue;
    for (const imp of mod.imports || []) {
      if (imp.source.startsWith('.')) {
        const resolved = path.posix
          .normalize(path.posix.join(path.posix.dirname(mod.file), imp.source))
          .replace(/^\/+/, '');
        if (!headModulesImportingFile.has(resolved)) headModulesImportingFile.set(resolved, new Set());
        headModulesImportingFile.get(resolved).add(mod.file);
      }
    }
  }

  for (const [id, prev] of baseSymbols.entries()) {
    if (!headSymbols.has(id)) {
      const priorConfirmedCallers = prev.confirmed_callers || [];
      // Check if any module in HEAD still invokes `prev.name` either in the same file, via explicit import of `prev.file`,
      // or via browser global in `public/` when no replacement global exists
      const rawHeadCalls = [...(headCallSitesByIdent.get(prev.name) || [])];
      const importingFiles = headModulesImportingFile.get(prev.file) || new Set();
      const headDefinesReplacementGlobal =
        prev.file.startsWith('public/') &&
        (headSnap.js_modules || []).some(
          m => m.file.startsWith('public/') && (m.symbols || []).some(s => s.top_level && s.name === prev.name)
        );

      const confirmedBrokenCallers = rawHeadCalls.filter(site => {
        const callerFile = site.split(':')[0];
        if (callerFile === prev.file) {
          // Only broken if same file no longer has any symbol with local_name === prev.name
          const headSameFile = (headSnap.js_modules || []).find(m => m.file === prev.file);
          return !(headSameFile?.symbols || []).some(s => s.name === prev.name || s.local_name === prev.name);
        }
        if (importingFiles.has(callerFile)) return true;
        if (prev.file.startsWith('public/') && callerFile.startsWith('public/') && !headDefinesReplacementGlobal) {
          return true;
        }
        return false;
      });

      symbolsRemoved.push({
        symbol_id: id,
        file: prev.file,
        name: prev.name,
        was_exported: prev.exported,
        signature: prev.signature_key,
        body_fingerprint_sha256: prev.body_fingerprint_sha256,
        confirmed_broken_callers_in_head: confirmedBrokenCallers,
        prior_confirmed_callers_in_base: priorConfirmedCallers.slice(0, 20)
      });

      if (confirmedBrokenCallers.length > 0) {
        brokenCallersOfRemovedSymbols.push({
          symbol_id: id,
          name: prev.name,
          file: prev.file,
          remaining_callers: confirmedBrokenCallers
        });
      }
    }
  }

  // Detect symbol rename / move candidates via identical `body_fingerprint_sha256`
  const renamedOrMovedCandidates = [];
  const addedByBodyHash = new Map();
  for (const a of symbolsAdded) {
    if (!a.body_fingerprint_sha256 || a.body_fingerprint_sha256 === '0'.repeat(64)) continue;
    if (!addedByBodyHash.has(a.body_fingerprint_sha256)) addedByBodyHash.set(a.body_fingerprint_sha256, []);
    addedByBodyHash.get(a.body_fingerprint_sha256).push(a);
  }
  for (const r of symbolsRemoved) {
    const matches = addedByBodyHash.get(r.body_fingerprint_sha256) || [];
    if (matches.length === 1) {
      renamedOrMovedCandidates.push({
        from_symbol_id: r.symbol_id,
        to_symbol_id: matches[0].symbol_id,
        basis: 'identical_ast_body_fingerprint'
      });
    }
  }

  // Constants / configuration literal changes
  for (const [cid, hc] of headConstants.entries()) {
    if (baseConstants.has(cid)) {
      const bc = baseConstants.get(cid);
      if (bc.value_fingerprint_sha256 !== hc.value_fingerprint_sha256) {
        constantsChanged.push({
          symbol_id: cid,
          file: hc.file,
          name: hc.name,
          exported: hc.exported
        });
      }
    }
  }

  // Rich HTTP API comparison
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
        authorization_summary: hr.authorization_summary,
        feature_gate: hr.feature_gate,
        test_references: hr.test_references || {
          contract_mappings: [],
          static_http_call_tests: [],
          candidate_path_mentions: []
        }
      });
    } else {
      const br = baseRoutes.get(p);
      const removedMethods = (br.methods || []).filter(m => !(hr.methods || []).includes(m));
      const addedMethods = (hr.methods || []).filter(m => !(br.methods || []).includes(m));
      const removedRespKeys = (br.observed_response_keys || []).filter(
        k => !(hr.observed_response_keys || []).includes(k)
      );
      const addedRespKeys = (hr.observed_response_keys || []).filter(
        k => !(br.observed_response_keys || []).includes(k)
      );
      const errCodesChanged =
        JSON.stringify(br.error_codes || []) !== JSON.stringify(hr.error_codes || []);
      const statusCodesChanged =
        JSON.stringify(br.status_codes || []) !== JSON.stringify(hr.status_codes || []);
      const gateByMethodChanged =
        JSON.stringify(br.feature_enforcement_by_method || {}) !==
        JSON.stringify(hr.feature_enforcement_by_method || {});
      const authChanged = br.auth_requirement !== hr.auth_requirement;
      const authzChanged = br.authorization_summary !== hr.authorization_summary;

      if (
        removedMethods.length > 0 ||
        addedMethods.length > 0 ||
        authChanged ||
        authzChanged ||
        br.feature_gate !== hr.feature_gate ||
        gateByMethodChanged ||
        removedRespKeys.length > 0 ||
        addedRespKeys.length > 0 ||
        errCodesChanged ||
        statusCodesChanged ||
        br.handler_file !== hr.handler_file
      ) {
        routesChanged.push({
          path: p,
          before_methods: br.methods,
          after_methods: hr.methods,
          removed_methods: removedMethods,
          added_methods: addedMethods,
          before_auth: br.auth_requirement,
          after_auth: hr.auth_requirement,
          before_authz: br.authorization_summary,
          after_authz: hr.authorization_summary,
          before_feature_gate: br.feature_gate,
          after_feature_gate: hr.feature_gate,
          feature_enforcement_by_method_changed: gateByMethodChanged,
          removed_response_keys: removedRespKeys,
          added_response_keys: addedRespKeys,
          before_error_codes: br.error_codes || [],
          after_error_codes: hr.error_codes || [],
          known_frontend_callers: hr.known_frontend_callers || [],
          test_references: hr.test_references || {
            contract_mappings: [],
            static_http_call_tests: [],
            candidate_path_mentions: []
          }
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

  // Rich Database Migrations & Schema Comparison
  const baseMigs = new Map((baseSnap.database?.migrations || []).map(m => [m.filename, m]));
  const headMigs = new Map((headSnap.database?.migrations || []).map(m => [m.filename, m]));
  const migrationsAdded = [];
  const migrationsRemoved = [];
  const migrationsChecksumChanged = [];
  const migrationsRequiringManualReview = [];

  for (const [fn, hm] of headMigs.entries()) {
    if (!baseMigs.has(fn)) {
      migrationsAdded.push(fn);
      if (hm.requires_manual_migration_review) {
        migrationsRequiringManualReview.push({
          filename: fn,
          reasons: hm.manual_review_reasons || []
        });
      }
    } else if (baseMigs.get(fn).sha256 !== hm.sha256) {
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
      const bColMap = new Map((bt.columns || []).map(c => [c.name, c]));
      const hColMap = new Map((ht.columns || []).map(c => [c.name, c]));

      const addedCols = [...hColMap.keys()].filter(c => !bColMap.has(c)).sort(asciiCompare);
      const droppedCols = [...bColMap.keys()].filter(c => !hColMap.has(c)).sort(asciiCompare);
      const typeChanges = [];
      const nullabilityChanges = [];
      const defaultChanges = [];

      for (const [cn, hc] of hColMap.entries()) {
        if (!bColMap.has(cn)) continue;
        const bc = bColMap.get(cn);
        if (normalizeSqlTypeForDiff(bc.sql_type) !== normalizeSqlTypeForDiff(hc.sql_type)) {
          typeChanges.push({ column: cn, before: bc.sql_type, after: hc.sql_type });
        }
        if (Boolean(bc.not_null) !== Boolean(hc.not_null)) {
          nullabilityChanges.push({ column: cn, before_not_null: bc.not_null, after_not_null: hc.not_null });
        }
        if (String(bc.default_expr || '') !== String(hc.default_expr || '')) {
          defaultChanges.push({ column: cn, before_default: bc.default_expr, after_default: hc.default_expr });
        }
      }

      const bCons = new Set((bt.constraints || []).map(c => `${c.kind}:${c.name || c.definition}`));
      const hCons = new Set((ht.constraints || []).map(c => `${c.kind}:${c.name || c.definition}`));
      const constraintsAdded = [...hCons].filter(x => !bCons.has(x)).sort(asciiCompare);
      const constraintsRemoved = [...bCons].filter(x => !hCons.has(x)).sort(asciiCompare);

      const bFks = new Map((bt.foreign_keys || []).map(f => [`${f.columns.join(',')}->${f.references_table}`, f]));
      const hFks = new Map((ht.foreign_keys || []).map(f => [`${f.columns.join(',')}->${f.references_table}`, f]));
      const fkChanges = [];
      for (const [fkKey, hfk] of hFks.entries()) {
        if (!bFks.has(fkKey)) fkChanges.push({ kind: 'added', key: fkKey, on_delete: hfk.on_delete });
        else if (bFks.get(fkKey).on_delete !== hfk.on_delete) {
          fkChanges.push({
            kind: 'on_delete_changed',
            key: fkKey,
            before_on_delete: bFks.get(fkKey).on_delete,
            after_on_delete: hfk.on_delete
          });
        }
      }
      for (const fkKey of bFks.keys()) {
        if (!hFks.has(fkKey)) fkChanges.push({ kind: 'removed', key: fkKey });
      }

      const bIdx = new Map((bt.indexes || []).map(ix => [ix.name, ix]));
      const hIdx = new Map((ht.indexes || []).map(ix => [ix.name, ix]));
      const indexesAdded = [...hIdx.keys()].filter(k => !bIdx.has(k)).sort(asciiCompare);
      const indexesRemoved = [...bIdx.keys()].filter(k => !hIdx.has(k)).sort(asciiCompare);
      const indexesChanged = [...hIdx.keys()]
        .filter(
          k =>
            bIdx.has(k) &&
            (bIdx.get(k).unique !== hIdx.get(k).unique ||
              String(bIdx.get(k).partial_where || '') !== String(hIdx.get(k).partial_where || '') ||
              bIdx.get(k).definition !== hIdx.get(k).definition)
        )
        .sort(asciiCompare);

      const bPol = new Map((bt.rls_policies || []).map(p => [p.policy_name, p]));
      const hPol = new Map((ht.rls_policies || []).map(p => [p.policy_name, p]));
      const policiesAdded = [...hPol.keys()].filter(k => !bPol.has(k)).sort(asciiCompare);
      const policiesRemoved = [...bPol.keys()].filter(k => !hPol.has(k)).sort(asciiCompare);
      const policiesChanged = [...hPol.keys()]
        .filter(
          k =>
            bPol.has(k) &&
            (bPol.get(k).command !== hPol.get(k).command || bPol.get(k).expression !== hPol.get(k).expression)
        )
        .sort(asciiCompare);

      const rlsChanged =
        Boolean(bt.rls_enabled) !== Boolean(ht.rls_enabled) || Boolean(bt.rls_forced) !== Boolean(ht.rls_forced);

      if (
        addedCols.length ||
        droppedCols.length ||
        typeChanges.length ||
        nullabilityChanges.length ||
        defaultChanges.length ||
        constraintsAdded.length ||
        constraintsRemoved.length ||
        fkChanges.length ||
        indexesAdded.length ||
        indexesRemoved.length ||
        indexesChanged.length ||
        policiesAdded.length ||
        policiesRemoved.length ||
        policiesChanged.length ||
        rlsChanged
      ) {
        tablesChanged.push({
          table_name: tn,
          columns_added: addedCols,
          columns_removed: droppedCols,
          columns_type_changed: typeChanges,
          columns_nullability_changed: nullabilityChanges,
          columns_default_changed: defaultChanges,
          constraints_added: constraintsAdded,
          constraints_removed: constraintsRemoved,
          foreign_keys_changed: fkChanges,
          indexes_added: indexesAdded,
          indexes_removed: indexesRemoved,
          indexes_changed: indexesChanged,
          before_rls_enabled: Boolean(bt.rls_enabled),
          after_rls_enabled: Boolean(ht.rls_enabled),
          before_rls_forced: Boolean(bt.rls_forced),
          after_rls_forced: Boolean(ht.rls_forced),
          rls_policies_added: policiesAdded,
          rls_policies_removed: policiesRemoved,
          rls_policies_changed: policiesChanged
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
  const featureControlsAdded = [...headFc.keys()].filter(k => !baseFc.has(k)).sort(asciiCompare);
  const featureControlsRemoved = [...baseFc.keys()].filter(k => !headFc.has(k)).sort(asciiCompare);
  const featureControlsChanged = [];
  for (const [k, hf] of headFc.entries()) {
    if (baseFc.has(k)) {
      const bf = baseFc.get(k);
      if (
        bf.default_state !== hf.default_state ||
        bf.default_audience !== hf.default_audience ||
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
  const configKeysAdded = [...headCfg].filter(k => !baseCfg.has(k)).sort(asciiCompare);
  const configKeysRemoved = [...baseCfg].filter(k => !headCfg.has(k)).sort(asciiCompare);

  // Events & Diagnostics contract diff
  const collectCustomEvents = snap => {
    const s = new Set();
    for (const m of snap.js_modules || []) {
      if (m.file.startsWith('tests/')) continue;
      for (const ev of m.event_bindings || []) {
        if (ev.kind === 'producer_custom_event' || ev.kind === 'broadcast_channel') {
          s.add(`${ev.kind}:${ev.event_name}`);
        }
      }
    }
    return s;
  };
  const bEvents = collectCustomEvents(baseSnap);
  const hEvents = collectCustomEvents(headSnap);
  const eventsAdded = [...hEvents].filter(x => !bEvents.has(x)).sort(asciiCompare);
  const eventsRemoved = [...bEvents].filter(x => !hEvents.has(x)).sort(asciiCompare);
  const diagnosticsChanged =
    JSON.stringify(baseSnap.diagnostics_contract || {}) !== JSON.stringify(headSnap.diagnostics_contract || {});

  // Relevant tests & docs requiring review
  const relevantTests = new Set();
  for (const r of [...routesAdded, ...routesChanged]) {
    for (const tm of r.test_references?.contract_mappings || []) relevantTests.add(tm.file);
    for (const st of r.test_references?.static_http_call_tests || []) relevantTests.add(st);
    for (const cm of r.test_references?.candidate_path_mentions || []) relevantTests.add(cm);
  }
  const contractTestMap = new Map(
    (headSnap.shared_contracts || []).map(c => [c.contract_id, (c.test_mappings || []).map(t => t.file)])
  );
  for (const s of [...symbolsSignatureChanged, ...symbolsBodyChanged]) {
    for (const cid of s.contract_ids || []) {
      for (const tf of contractTestMap.get(cid) || []) relevantTests.add(tf);
    }
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
    docsRequiringReview.push('docs/engineering/API-CONTRACTS.md', 'docs/engineering/contracts/shared-contracts.json');
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
  if (diagnosticsChanged) {
    docsRequiringReview.push('docs/engineering/DIAGNOSTICS-AND-ERRORS.md');
  }

  // Honest Compatibility Classification (`Section 10`)
  const breakingEvidence = [];
  const potentialBreakingEvidence = [];
  const unresolvedReasons = [];

  if ((baseSnap.parse_failures || []).length > 0 || (headSnap.parse_failures || []).length > 0) {
    unresolvedReasons.push(
      `JavaScript AST parse failure(s): base=${(baseSnap.parse_failures || []).length}, head=${(headSnap.parse_failures || []).length}.`
    );
  }
  for (const mr of migrationsRequiringManualReview) {
    unresolvedReasons.push(`Migration ${mr.filename} requires manual SQL review: ${mr.reasons.join('; ')}`);
  }
  for (const r of [...routesAdded, ...routesChanged]) {
    const afterM = r.after_methods || r.methods || [];
    if (afterM.includes('UNRESOLVED')) {
      unresolvedReasons.push(`Route ${r.path} has unresolved HTTP method extraction.`);
    }
  }

  if (routesRemoved.length > 0) {
    breakingEvidence.push(`Removed HTTP route(s): ${routesRemoved.map(r => r.path).join(', ')}`);
  }
  for (const rc of routesChanged) {
    if (rc.removed_methods.length > 0) {
      breakingEvidence.push(`Route ${rc.path} removed HTTP method(s): ${rc.removed_methods.join(', ')}`);
    } else if (rc.removed_response_keys.length > 0) {
      potentialBreakingEvidence.push(
        `Route ${rc.path} removed observed JSON response key(s): ${rc.removed_response_keys.join(', ')}`
      );
    } else {
      potentialBreakingEvidence.push(
        `Route ${rc.path} modified contract metadata (auth/authz/feature-gate/status/error/response shape).`
      );
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
    if (tc.before_rls_forced && !tc.after_rls_forced) {
      breakingEvidence.push(`Table ${tc.table_name} disabled FORCE ROW LEVEL SECURITY.`);
    }
    if (tc.columns_type_changed.length > 0) {
      potentialBreakingEvidence.push(
        `Table ${tc.table_name} changed column type(s): ${tc.columns_type_changed.map(c => `${c.column} (${c.before} -> ${c.after})`).join(', ')}`
      );
    }
    if (tc.columns_nullability_changed.some(c => !c.before_not_null && c.after_not_null)) {
      potentialBreakingEvidence.push(
        `Table ${tc.table_name} tightened NOT NULL constraint on: ${tc.columns_nullability_changed.filter(c => c.after_not_null).map(c => c.column).join(', ')}`
      );
    }
    if (
      tc.constraints_removed.length > 0 ||
      tc.rls_policies_removed.length > 0 ||
      tc.rls_policies_changed.length > 0 ||
      tc.foreign_keys_changed.some(f => f.kind !== 'added')
    ) {
      potentialBreakingEvidence.push(
        `Table ${tc.table_name} altered constraints, foreign-key actions, or RLS policies.`
      );
    }
  }

  if (featureControlsRemoved.length > 0) {
    breakingEvidence.push(`Removed feature control key(s): ${featureControlsRemoved.join(', ')}`);
  }
  if (brokenCallersOfRemovedSymbols.length > 0) {
    breakingEvidence.push(
      `Removed symbol(s) still referenced by confirmed callers: ${brokenCallersOfRemovedSymbols.map(b => `${b.file}#${b.name} (called by ${b.remaining_callers.join(', ')})`).join('; ')}`
    );
  }
  if (symbolsRemoved.some(s => s.was_exported && s.confirmed_broken_callers_in_head.length === 0)) {
    potentialBreakingEvidence.push(
      `Exported symbol(s) removed: ${symbolsRemoved.filter(s => s.was_exported).map(s => `${s.file}#${s.name}`).join(', ')}`
    );
  }
  if (symbolsSignatureChanged.length > 0) {
    potentialBreakingEvidence.push(
      `Symbol signature/export changes (${symbolsSignatureChanged.length}): ${symbolsSignatureChanged.slice(0, 8).map(s => `${s.file}#${s.name}`).join(', ')}`
    );
  }
  if (eventsRemoved.length > 0) {
    potentialBreakingEvidence.push(`Removed CustomEvent / BroadcastChannel producer: ${eventsRemoved.join(', ')}`);
  }

  let compatibilityClass = 'no_structural_break_detected_behavior_unverified';
  if (breakingEvidence.length > 0) {
    compatibilityClass = 'breaking_change_detected';
  } else if (unresolvedReasons.length > 0) {
    compatibilityClass = 'analysis_incomplete_or_unresolved';
  } else if (potentialBreakingEvidence.length > 0) {
    compatibilityClass = 'potentially_breaking_change';
  }

  const finalGov = governanceDiff || {
    changed: false,
    added_baseline_ids: [],
    removed_baseline_ids: [],
    added_suppressions: [],
    removed_suppressions: [],
    modified_suppressions: []
  };

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
      unresolved_or_incomplete_reasons: unresolvedReasons,
      behavioral_caveat:
        'Static structural analysis does not prove runtime behavioral equivalence or security correctness. Body-modified functions and affected contracts must be verified by running relevant test suites.'
    },
    summary_counts: {
      symbols_added: symbolsAdded.length,
      symbols_signature_changed: symbolsSignatureChanged.length,
      symbols_body_changed: symbolsBodyChanged.length,
      symbols_removed: symbolsRemoved.length,
      constants_changed: constantsChanged.length,
      routes_added: routesAdded.length,
      routes_changed: routesChanged.length,
      routes_removed: routesRemoved,
      migrations_added: migrationsAdded.length,
      tables_added: tablesAdded.length,
      tables_changed: tablesChanged.length,
      feature_controls_added: featureControlsAdded.length,
      config_keys_added: configKeysAdded.length
    },
    symbols: {
      added: symbolsAdded,
      signature_changed: symbolsSignatureChanged,
      body_changed: symbolsBodyChanged,
      removed: symbolsRemoved,
      renamed_or_moved_candidates: renamedOrMovedCandidates,
      constants_changed: constantsChanged,
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
      migrations_requiring_manual_review: migrationsRequiringManualReview,
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
    events_and_diagnostics: {
      events_added: eventsAdded,
      events_removed: eventsRemoved,
      diagnostics_changed: diagnosticsChanged
    },
    governance_changes: finalGov,
    relevant_tests: [...relevantTests].sort(asciiCompare),
    documentation_requiring_review: [...new Set(docsRequiringReview)].sort(asciiCompare)
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

  if (impact.governance_changes?.changed) {
    lines.push(`## Drift Baseline & Suppression Governance Changes`);
    if (impact.governance_changes.added_baseline_ids.length) {
      lines.push(`- **Added Baseline Debt IDs**: ${impact.governance_changes.added_baseline_ids.map(x => `\`${x}\``).join(', ')}`);
    }
    if (impact.governance_changes.removed_baseline_ids.length) {
      lines.push(`- **Removed/Pruned Baseline Debt IDs**: ${impact.governance_changes.removed_baseline_ids.map(x => `\`${x}\``).join(', ')}`);
    }
    if (impact.governance_changes.added_suppressions.length) {
      lines.push(`- **Added Suppressions**: ${impact.governance_changes.added_suppressions.map(x => `\`${x}\``).join(', ')}`);
    }
    if (impact.governance_changes.removed_suppressions.length) {
      lines.push(`- **Removed Suppressions**: ${impact.governance_changes.removed_suppressions.map(x => `\`${x}\``).join(', ')}`);
    }
    if (impact.governance_changes.modified_suppressions.length) {
      lines.push(`- **Modified Suppressions**: ${impact.governance_changes.modified_suppressions.map(x => `\`${x}\``).join(', ')}`);
    }
    lines.push(``);
  }

  if (impact.compatibility_assessment.breaking_evidence.length) {
    lines.push(`## Breaking Evidence`);
    for (const e of impact.compatibility_assessment.breaking_evidence) lines.push(`- ${e}`);
    lines.push(``);
  }
  if (impact.compatibility_assessment.unresolved_or_incomplete_reasons?.length) {
    lines.push(`## Analysis Incomplete / Manual Review Required`);
    for (const u of impact.compatibility_assessment.unresolved_or_incomplete_reasons) lines.push(`- ${u}`);
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
    `| Category | Added | Signature / Structural Changed | Body-Only Changed | Removed |`,
    `|---|---:|---:|---:|---:|`,
    `| JS Symbols (non-test) | ${impact.summary_counts.symbols_added} | ${impact.summary_counts.symbols_signature_changed} | ${impact.summary_counts.symbols_body_changed} | ${impact.summary_counts.symbols_removed} |`,
    `| Top-Level Constants / Literals | — | ${impact.summary_counts.constants_changed} | — | — |`,
    `| Backend HTTP Routes | ${impact.summary_counts.routes_added} | ${impact.summary_counts.routes_changed} | — | ${impact.summary_counts.routes_removed} |`,
    `| SQL Migrations | ${impact.database.migrations_added.length} | ${impact.database.migrations_checksum_changed.length} | — | ${impact.database.migrations_removed.length} |`,
    `| SQL Tables | ${impact.database.tables_added.length} | ${impact.database.tables_changed.length} | — | ${impact.database.tables_removed.length} |`,
    `| Feature Controls | ${impact.feature_controls.added.length} | ${impact.feature_controls.changed.length} | — | ${impact.feature_controls.removed.length} |`,
    `| Configuration Keys | ${impact.configuration.added.length} | — | — | ${impact.configuration.removed.length} |`,
    ``
  );

  if (impact.symbols.signature_changed.length || impact.symbols.body_changed.length || impact.symbols.renamed_or_moved_candidates.length) {
    lines.push(`## Modified & Moved Symbols`);
    for (const s of impact.symbols.signature_changed.slice(0, 25)) {
      lines.push(
        `- **Signature Changed**: \`${s.file}#${s.name}\` (\`${s.before_signature}\` -> \`${s.after_signature}\`; confirmed consumers: ${s.confirmed_consumers.length ? s.confirmed_consumers.map(c => `\`${c}\``).join(', ') : 'none'})`
      );
    }
    for (const s of impact.symbols.body_changed.slice(0, 25)) {
      lines.push(
        `- **Body Changed**: \`${s.file}#${s.name}\`${s.literals_changed ? ' *(literals modified)*' : ''} — confirmed consumers: ${s.confirmed_consumers.length ? s.confirmed_consumers.slice(0, 5).map(c => `\`${c}\``).join(', ') : 'none'}${s.contract_ids.length ? ` [contracts: ${s.contract_ids.join(', ')}]` : ''}`
      );
    }
    for (const mv of impact.symbols.renamed_or_moved_candidates) {
      lines.push(`- **Rename/Move Candidate**: \`${mv.from_symbol_id}\` -> \`${mv.to_symbol_id}\` (${mv.basis})`);
    }
    lines.push(``);
  }

  if (impact.apis.added.length || impact.apis.changed.length || impact.apis.removed.length) {
    lines.push(`## Affected HTTP APIs`);
    for (const r of impact.apis.added) {
      lines.push(
        `- **Added**: \`${r.methods.join(', ')} ${r.path}\` (\`${r.handler_file}\`, auth: \`${r.auth_requirement}\`, authz: \`${r.authorization_summary}\`)`
      );
    }
    for (const r of impact.apis.changed) {
      lines.push(
        `- **Changed**: \`${r.path}\` (methods: \`${r.before_methods.join(',')} -> ${r.after_methods.join(',')}\`, authz: \`${r.before_authz} -> ${r.after_authz}\`, gate: \`${r.before_feature_gate || 'none'} -> ${r.after_feature_gate || 'none'}\`)`
      );
    }
    for (const r of impact.apis.removed) {
      lines.push(`- **Removed**: \`${r.path}\` (prior confirmed callers: ${r.prior_frontend_callers.join(', ') || 'none'})`);
    }
    lines.push(``);
  }

  if (impact.database.migrations_added.length || impact.database.tables_added.length || impact.database.tables_changed.length) {
    lines.push(`## Affected Database Objects`);
    for (const m of impact.database.migrations_added) lines.push(`- **New Migration**: \`migrations/${m}\``);
    for (const t of impact.database.tables_added) lines.push(`- **New Table**: \`${t}\``);
    for (const tc of impact.database.tables_changed) {
      const parts = [];
      if (tc.columns_added.length) parts.push(`+cols: ${tc.columns_added.join(',')}`);
      if (tc.columns_removed.length) parts.push(`-cols: ${tc.columns_removed.join(',')}`);
      if (tc.columns_type_changed.length) parts.push(`types: ${tc.columns_type_changed.map(c => c.column).join(',')}`);
      if (tc.columns_nullability_changed.length) parts.push(`nullability: ${tc.columns_nullability_changed.map(c => c.column).join(',')}`);
      if (tc.columns_default_changed.length) parts.push(`defaults: ${tc.columns_default_changed.map(c => c.column).join(',')}`);
      if (tc.constraints_added.length || tc.constraints_removed.length) parts.push(`constraints changed`);
      if (tc.indexes_added.length || tc.indexes_removed.length || tc.indexes_changed.length) parts.push(`indexes changed`);
      if (tc.rls_policies_added.length || tc.rls_policies_removed.length || tc.rls_policies_changed.length) parts.push(`RLS policies changed`);
      lines.push(`- **Altered Table**: \`${tc.table_name}\` (${parts.join('; ') || 'RLS state changed'})`);
    }
    lines.push(``);
  }

  if (impact.documentation_requiring_review.length) {
    lines.push(`## Documentation & Contracts Requiring Review`);
    for (const d of impact.documentation_requiring_review) lines.push(`- \`${d}\``);
    lines.push(``);
  }

  if (impact.relevant_tests.length) {
    lines.push(`## Relevant Test Suites (Candidate & Contract-Mapped)`);
    for (const t of impact.relevant_tests) lines.push(`- \`node ${t}\``);
    lines.push(``);
  }

  return lines.join('\n');
}
