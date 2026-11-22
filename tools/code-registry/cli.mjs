#!/usr/bin/env node
// BiteShark Code Registry, Drift Governance & Change-Impact CLI (`tools/code-registry/cli.mjs`)
//
// Supported commands:
//   node tools/code-registry/cli.mjs scan [--out <file>] [--include-timestamp]
//   node tools/code-registry/cli.mjs generate-docs
//   node tools/code-registry/cli.mjs validate [--verify-db[=required|optional]] [--trusted-baseline-ref <ref>] [--out <file>]
//   node tools/code-registry/cli.mjs accept-drift --finding <id> --reason "<rationale>" [--ref "<issue-or-pr>"]
//   node tools/code-registry/cli.mjs prune-drift [--dry-run]
//   node tools/code-registry/cli.mjs compare --base <ref> --head <ref> [--merge-base] [--format json|markdown] [--out <file>]
//   node tools/code-registry/cli.mjs impact  --base <ref> --head <ref> [--merge-base] [--format json|markdown] [--out <file>]
//   node tools/code-registry/cli.mjs locate <query> [--exact] [--kind <kind>] [--full] [--json] [--limit <n>] [--offset <m>]

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import {
  deterministicStringify,
  DRIFT_BASELINE_SCHEMA_VERSION,
  HIGH_CONFIDENCE_BLOCKING_DRIFT_CATEGORIES,
  asciiCompare
} from './schema-versions.mjs';
import { validateJsonWithSchemaFile } from './schema-validator.mjs';
import { scanRepositorySnapshot, CANONICAL_GENERATED_DOC_PATHS } from './scanner.mjs';
import { writeGeneratedDocs } from './doc-generator.mjs';
import {
  scanGitRefSnapshot,
  resolveMergeBaseSha,
  loadGovernanceFilesFromRef,
  diffGovernanceState,
  compareRegistrySnapshots,
  formatImpactReportMarkdown
} from './compare-impact.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_REPO_ROOT = path.resolve(__dirname, '..', '..');

function parseCliArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      if (eq !== -1) {
        flags[arg.slice(2, eq)] = arg.slice(eq + 1);
      } else {
        const key = arg.slice(2);
        const next = argv[i + 1];
        if (next && !next.startsWith('--')) {
          flags[key] = next;
          i++;
        } else {
          flags[key] = true;
        }
      }
    } else {
      positional.push(arg);
    }
  }
  return { command: positional[0] || 'help', positional: positional.slice(1), flags };
}

function normalizeDeclaredSqlType(rawSqlType) {
  const s = String(rawSqlType || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  if (s === 'bigserial' || s === 'serial8') return { canonicalType: 'bigint', impliesSerialDefault: true };
  if (s === 'serial' || s === 'serial4') return { canonicalType: 'integer', impliesSerialDefault: true };
  if (s === 'smallserial' || s === 'serial2') return { canonicalType: 'smallint', impliesSerialDefault: true };
  if (s.endsWith('[]')) return { canonicalType: 'array', impliesSerialDefault: false };
  if (s === 'timestamptz' || s === 'timestamp with time zone') {
    return { canonicalType: 'timestamp with time zone', impliesSerialDefault: false };
  }
  if (s === 'timestamp' || s === 'timestamp without time zone') {
    return { canonicalType: 'timestamp without time zone', impliesSerialDefault: false };
  }
  if (s === 'time' || s === 'time without time zone') {
    return { canonicalType: 'time without time zone', impliesSerialDefault: false };
  }
  if (s === 'timetz' || s === 'time with time zone') {
    return { canonicalType: 'time with time zone', impliesSerialDefault: false };
  }
  if (s === 'int' || s === 'int4' || s === 'integer') return { canonicalType: 'integer', impliesSerialDefault: false };
  if (s === 'int8' || s === 'bigint') return { canonicalType: 'bigint', impliesSerialDefault: false };
  if (s === 'int2' || s === 'smallint') return { canonicalType: 'smallint', impliesSerialDefault: false };
  if (s === 'bool' || s === 'boolean') return { canonicalType: 'boolean', impliesSerialDefault: false };
  if (s.startsWith('numeric') || s.startsWith('decimal')) return { canonicalType: 'numeric', impliesSerialDefault: false };
  if (s.startsWith('varchar') || s.startsWith('character varying')) {
    return { canonicalType: 'character varying', impliesSerialDefault: false };
  }
  if (s === 'float8' || s === 'double precision') {
    return { canonicalType: 'double precision', impliesSerialDefault: false };
  }
  if (s === 'float4' || s === 'real') return { canonicalType: 'real', impliesSerialDefault: false };
  return { canonicalType: s, impliesSerialDefault: false };
}

function normalizeLivePgColumnType(dataType, udtName) {
  const dt = String(dataType || '').toLowerCase();
  if (dt === 'array') return 'array';
  if (dt === 'user-defined') return String(udtName || '').toLowerCase();
  return dt;
}

const PG_DEL_ACTION_MAP = {
  a: 'NO ACTION',
  r: 'RESTRICT',
  c: 'CASCADE',
  n: 'SET NULL',
  d: 'SET DEFAULT'
};

const PG_POL_CMD_MAP = {
  '*': 'ALL',
  r: 'SELECT',
  a: 'INSERT',
  w: 'UPDATE',
  d: 'DELETE'
};

async function verifySchemaWithDisposablePostgres(repoRoot, snapshot, { mode = 'required' } = {}) {
  let pgMod;
  try {
    pgMod = await import('pg');
  } catch {
    if (process.env.TRUCKLY_PG_NODE_MODULES) {
      try {
        const reqPg = createRequire(path.join(path.resolve(process.env.TRUCKLY_PG_NODE_MODULES), '_resolve.cjs'));
        pgMod = reqPg('pg');
      } catch {}
    }
    if (!pgMod) {
      return {
        status: mode === 'required' ? 'FAILED_PREREQUISITE' : 'NOT_RUN',
        mode,
        executed: false,
        ok: false,
        reason: 'pg module is not installed in the current Node environment.'
      };
    }
  }

  const { Client } = pgMod.default || pgMod;
  const adminUrl =
    process.env.BITESHARK_REGISTRY_VERIFY_PG_URL || 'postgresql://postgres:postgres@127.0.0.1:5432/postgres';
  const redactedUrl = adminUrl.replace(/:[^:@/]+@/, ':***@');
  const tempDbName = `bs_reg_verify_${process.pid}_${Date.now()}`;

  const adminClient = new Client({ connectionString: adminUrl, connectionTimeoutMillis: 3000 });
  try {
    await adminClient.connect();
  } catch (err) {
    return {
      status: mode === 'required' ? 'FAILED_PREREQUISITE' : 'NOT_RUN',
      mode,
      executed: false,
      ok: false,
      reason: `Disposable PostgreSQL server not reachable at ${redactedUrl} (${err.code || err.message}).`
    };
  }

  try {
    await adminClient.query(
      `CREATE DATABASE ${tempDbName} TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C'`
    );
    const tempUrl = adminUrl.replace(/\/[^/?]+(\?.*)?$/, `/${tempDbName}$1`);
    try {
      execFileSync(process.execPath, [path.join(repoRoot, 'scripts', 'run-migrations.cjs')], {
        cwd: repoRoot,
        env: { ...process.env, MIGRATION_DATABASE_URL: tempUrl, DATABASE_URL: tempUrl },
        stdio: 'pipe'
      });

      const verifyClient = new Client({ connectionString: tempUrl });
      await verifyClient.connect();
      try {
        // 1. Tables & RLS flags
        const tblRes = await verifyClient.query(
          `SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
             FROM pg_class c
             JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind = 'r'
            ORDER BY c.relname`
        );
        // 2. Columns (types, nullability, defaults)
        const colRes = await verifyClient.query(
          `SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default
             FROM information_schema.columns
            WHERE table_schema = 'public'
            ORDER BY table_name, ordinal_position`
        );
        // 3. Foreign-key & Primary-key constraints
        const conRes = await verifyClient.query(
          `SELECT
             rel.relname AS table_name,
             con.conname AS constraint_name,
             con.contype AS contype,
             frel.relname AS ref_table,
             con.confdeltype AS on_delete_code
           FROM pg_constraint con
           JOIN pg_class rel ON rel.oid = con.conrelid
           JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
           LEFT JOIN pg_class frel ON frel.oid = con.confrelid
           WHERE nsp.nspname = 'public'`
        );
        // 4. Indexes
        const idxRes = await verifyClient.query(
          `SELECT
             t.relname AS table_name,
             i.relname AS index_name,
             ix.indisunique AS is_unique,
             ix.indisprimary AS is_primary
           FROM pg_index ix
           JOIN pg_class t ON t.oid = ix.indrelid
           JOIN pg_class i ON i.oid = ix.indexrelid
           JOIN pg_namespace n ON n.oid = t.relnamespace
           WHERE n.nspname = 'public'`
        );
        // 5. RLS Policies
        const polRes = await verifyClient.query(
          `SELECT
             c.relname AS table_name,
             p.polname AS policy_name,
             p.polcmd AS polcmd
           FROM pg_policy p
           JOIN pg_class c ON c.oid = p.polrelid
           JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public'`
        );

        const liveTables = new Map(tblRes.rows.map(r => [r.table_name, r]));
        const reconstructedNames = new Set(snapshot.database.tables.map(t => t.table_name));
        const missingTables = [...liveTables.keys()].filter(t => !reconstructedNames.has(t));
        const extraTables = [...reconstructedNames].filter(t => !liveTables.has(t));

        const liveColsByTable = new Map();
        for (const r of colRes.rows) {
          if (!liveColsByTable.has(r.table_name)) liveColsByTable.set(r.table_name, new Map());
          liveColsByTable.get(r.table_name).set(r.column_name, r);
        }

        const liveConsByTable = new Map();
        for (const r of conRes.rows) {
          if (!liveConsByTable.has(r.table_name)) liveConsByTable.set(r.table_name, []);
          liveConsByTable.get(r.table_name).push(r);
        }

        const liveIdxByTable = new Map();
        for (const r of idxRes.rows) {
          if (!liveIdxByTable.has(r.table_name)) liveIdxByTable.set(r.table_name, new Map());
          liveIdxByTable.get(r.table_name).set(r.index_name, r);
        }

        const livePolByTable = new Map();
        for (const r of polRes.rows) {
          if (!livePolByTable.has(r.table_name)) livePolByTable.set(r.table_name, new Map());
          livePolByTable.get(r.table_name).set(r.policy_name, PG_POL_CMD_MAP[r.polcmd] || 'ALL');
        }

        const rlsMismatches = [];
        const columnMismatches = [];
        const constraintMismatches = [];
        const indexMismatches = [];
        const policyMismatches = [];

        for (const t of snapshot.database.tables) {
          const liveT = liveTables.get(t.table_name);
          if (!liveT) continue;

          if (
            Boolean(liveT.rls_enabled) !== Boolean(t.rls_enabled) ||
            Boolean(liveT.rls_forced) !== Boolean(t.rls_forced)
          ) {
            rlsMismatches.push(
              `${t.table_name}: reconstructed(enabled=${t.rls_enabled},forced=${t.rls_forced}) != live(enabled=${liveT.rls_enabled},forced=${liveT.rls_forced})`
            );
          }

          // Column comparison
          const liveCols = liveColsByTable.get(t.table_name) || new Map();
          const recColNames = new Set(t.columns.map(c => c.name));
          for (const lcName of liveCols.keys()) {
            if (!recColNames.has(lcName)) {
              columnMismatches.push(`${t.table_name}.${lcName}: present in live DB, missing in reconstructed schema`);
            }
          }
          for (const rc of t.columns) {
            const lc = liveCols.get(rc.name);
            if (!lc) {
              columnMismatches.push(`${t.table_name}.${rc.name}: present in reconstructed schema, missing in live DB`);
              continue;
            }
            const { canonicalType, impliesSerialDefault } = normalizeDeclaredSqlType(rc.sql_type);
            const liveType = normalizeLivePgColumnType(lc.data_type, lc.udt_name);
            if (canonicalType !== liveType) {
              columnMismatches.push(
                `${t.table_name}.${rc.name}: type reconstructed="${canonicalType}" (${rc.sql_type}) != live="${liveType}"`
              );
            }
            const liveNotNull = lc.is_nullable === 'NO';
            if (Boolean(rc.not_null) !== liveNotNull) {
              columnMismatches.push(
                `${t.table_name}.${rc.name}: not_null reconstructed=${rc.not_null} != live=${liveNotNull}`
              );
            }
            const recHasDefault = Boolean(rc.default_expr) || impliesSerialDefault;
            const liveHasDefault = lc.column_default !== null;
            if (recHasDefault !== liveHasDefault) {
              columnMismatches.push(
                `${t.table_name}.${rc.name}: has_default reconstructed=${recHasDefault} != live=${liveHasDefault}`
              );
            }
          }

          // Constraints (PK + Foreign Keys)
          const liveCons = liveConsByTable.get(t.table_name) || [];
          const recHasPk = t.columns.some(c => c.primary_key) || t.constraints.some(c => c.kind === 'PRIMARY KEY');
          const liveHasPk = liveCons.some(c => c.contype === 'p');
          if (recHasPk !== liveHasPk) {
            constraintMismatches.push(`${t.table_name}: primary_key reconstructed=${recHasPk} != live=${liveHasPk}`);
          }
          for (const fk of t.foreign_keys || []) {
            const matchLiveFk = liveCons.find(
              c =>
                c.contype === 'f' &&
                c.ref_table === fk.references_table &&
                (PG_DEL_ACTION_MAP[c.on_delete_code] || 'NO ACTION') === fk.on_delete
            );
            if (!matchLiveFk) {
              constraintMismatches.push(
                `${t.table_name}: FK -> ${fk.references_table} (ON DELETE ${fk.on_delete}) not matched in live pg_constraint`
              );
            }
          }

          // Explicit CREATE INDEX checks
          const liveIdxs = liveIdxByTable.get(t.table_name) || new Map();
          for (const rix of t.indexes || []) {
            const lix = liveIdxs.get(rix.name);
            if (!lix) {
              indexMismatches.push(`${t.table_name}.${rix.name}: missing in live pg_index`);
            } else if (Boolean(lix.is_unique) !== Boolean(rix.unique)) {
              indexMismatches.push(
                `${t.table_name}.${rix.name}: unique reconstructed=${rix.unique} != live=${lix.is_unique}`
              );
            }
          }

          // RLS Policies
          const livePols = livePolByTable.get(t.table_name) || new Map();
          const recPolNames = new Set((t.rls_policies || []).map(p => p.policy_name));
          for (const [lpName] of livePols.entries()) {
            if (!recPolNames.has(lpName)) {
              policyMismatches.push(`${t.table_name}.${lpName}: policy in live pg_policy missing from reconstructed schema`);
            }
          }
          for (const rp of t.rls_policies || []) {
            const lpCmd = livePols.get(rp.policy_name);
            if (!lpCmd) {
              policyMismatches.push(`${t.table_name}.${rp.policy_name}: reconstructed policy missing from live pg_policy`);
            } else if (lpCmd !== rp.command) {
              policyMismatches.push(
                `${t.table_name}.${rp.policy_name}: command reconstructed=${rp.command} != live=${lpCmd}`
              );
            }
          }
        }

        const allOk =
          missingTables.length === 0 &&
          extraTables.length === 0 &&
          rlsMismatches.length === 0 &&
          columnMismatches.length === 0 &&
          constraintMismatches.length === 0 &&
          indexMismatches.length === 0 &&
          policyMismatches.length === 0;

        return {
          status: allOk ? 'VERIFIED' : 'MISMATCH',
          mode,
          executed: true,
          ok: allOk,
          verified_categories: [
            'tables',
            'columns_types_nullability_defaults',
            'pk_and_fk_constraints',
            'explicit_indexes',
            'rls_flags_and_policies'
          ],
          live_table_count: liveTables.size,
          reconstructed_table_count: reconstructedNames.size,
          missing_in_reconstructed: missingTables,
          extra_in_reconstructed: extraTables,
          rls_mismatches: rlsMismatches,
          column_mismatches: columnMismatches,
          constraint_mismatches: constraintMismatches,
          index_mismatches: indexMismatches,
          policy_mismatches: policyMismatches
        };
      } finally {
        await verifyClient.end();
      }
    } finally {
      await adminClient.query(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
        [tempDbName]
      );
      await adminClient.query(`DROP DATABASE IF EXISTS ${tempDbName}`);
    }
  } finally {
    await adminClient.end();
  }
}

function readBaselineIdSet(baselineObj) {
  const ids = new Set();
  if (!baselineObj || typeof baselineObj !== 'object') return ids;
  for (const e of baselineObj.entries || []) {
    if (e?.finding_id) ids.add(e.finding_id);
  }
  for (const id of baselineObj.baseline_finding_ids || []) {
    if (typeof id === 'string') ids.add(id);
  }
  return ids;
}

function validateContractsReferentialIntegrity(snapshot, repoRoot) {
  const errs = [];
  const filesSet = new Set(snapshot.js_modules.map(m => m.file));
  const symbolsByFile = new Map(
    snapshot.js_modules.map(m => [
      m.file,
      new Set([
        ...m.symbols.map(s => s.name),
        ...m.symbols.map(s => s.local_name),
        ...m.exports.map(e => e.name),
        ...m.globals_assigned.map(g => g.name),
        ...m.globals_assigned.map(g => `window.${g.name}`)
      ])
    ])
  );
  const routePaths = new Set(snapshot.backend_routes.map(r => r.path));
  const tableNames = new Set(snapshot.database.tables.map(t => t.table_name));
  const featureKeys = new Set(snapshot.feature_controls.features.map(f => f.key));

  for (const ctr of snapshot.shared_contracts || []) {
    for (const symRef of ctr.implementation_symbols || []) {
      const [filePart, symPart] = String(symRef).split('#');
      if (!fs.existsSync(path.join(repoRoot, filePart))) {
        errs.push(`Contract ${ctr.contract_id}: implementation file "${filePart}" does not exist.`);
      } else if (symPart && filesSet.has(filePart)) {
        const symSet = symbolsByFile.get(filePart);
        if (symSet && !symSet.has(symPart)) {
          errs.push(`Contract ${ctr.contract_id}: symbol "${symPart}" not found in ${filePart}.`);
        }
      }
    }
    for (const rp of ctr.http_routes || []) {
      if (!routePaths.has(rp)) {
        errs.push(`Contract ${ctr.contract_id}: HTTP route "${rp}" does not exist in backend_routes.`);
      }
    }
    for (const tn of ctr.db_tables || []) {
      if (!tableNames.has(tn)) {
        errs.push(`Contract ${ctr.contract_id}: database table "${tn}" does not exist in reconstructed schema.`);
      }
    }
    for (const fk of ctr.feature_controls || []) {
      if (!featureKeys.has(fk)) {
        errs.push(`Contract ${ctr.contract_id}: feature control "${fk}" is not in FEATURE_CONTROLS_REGISTRY.`);
      }
    }
    for (const tm of ctr.test_mappings || []) {
      if (!tm?.file || !fs.existsSync(path.join(repoRoot, tm.file))) {
        errs.push(`Contract ${ctr.contract_id}: mapped test file "${tm?.file}" does not exist.`);
      }
    }
  }

  const ovPath = path.join(repoRoot, 'docs', 'engineering', 'contracts', 'route-overrides.json');
  if (fs.existsSync(ovPath)) {
    try {
      const ovObj = JSON.parse(fs.readFileSync(ovPath, 'utf8'));
      for (const ov of ovObj.overrides || []) {
        if (!routePaths.has(ov.path)) {
          errs.push(`Stale route override "${ov.id || ov.path}": route "${ov.path}" does not exist.`);
        }
        if (ov.handler_file && !fs.existsSync(path.join(repoRoot, ov.handler_file))) {
          errs.push(`Stale route override "${ov.id || ov.path}": handler_file "${ov.handler_file}" does not exist.`);
        }
      }
    } catch (err) {
      errs.push(`Invalid JSON in route-overrides.json: ${err.message}`);
    }
  }

  return errs;
}

function scoreMatchTier(candidateLower, queryLower) {
  if (candidateLower === queryLower) return 0; // exact
  const tail = candidateLower.split(/[#/:>]/).pop() || '';
  if (tail === queryLower) return 0; // exact identifier / segment
  if (candidateLower.startsWith(queryLower) || tail.startsWith(queryLower)) return 1; // prefix
  if (candidateLower.includes(queryLower)) return 2; // substring
  return -1;
}

const TIER_LABELS = ['exact', 'prefix', 'substring'];

function runLocateQuery(snapshot, rawQuery, { exactOnly = false, kindFilter = null, full = false, limit = 25, offset = 0 } = {}) {
  const queryLower = rawQuery.trim().toLowerCase();
  const rawMatches = [];

  const allowKind = k => !kindFilter || kindFilter === k;

  // 1. Shared Contracts (`CTR-*`)
  if (allowKind('contract')) {
    for (const ctr of snapshot.shared_contracts || []) {
      const tiers = [
        scoreMatchTier(ctr.contract_id.toLowerCase(), queryLower),
        scoreMatchTier(ctr.title.toLowerCase(), queryLower),
        ...(ctr.implementation_symbols || []).map(s => {
          const st = scoreMatchTier(s.toLowerCase(), queryLower);
          return st >= 0 ? Math.max(1, st) : -1;
        })
      ].filter(t => t >= 0);
      if (tiers.length === 0) continue;
      const bestTier = Math.min(...tiers);
      if (exactOnly && bestTier !== 0) continue;
      rawMatches.push({
        tier: bestTier,
        match_tier: TIER_LABELS[bestTier],
        kind: 'contract',
        id: ctr.contract_id,
        location: 'docs/engineering/contracts/shared-contracts.json',
        summary: `${ctr.title} [${ctr.domain}]`,
        record: {
          purpose: ctr.purpose,
          implementation_symbols: ctr.implementation_symbols,
          http_routes: ctr.http_routes || [],
          db_tables: ctr.db_tables || [],
          feature_controls: ctr.feature_controls || [],
          permissions_and_ownership: ctr.permissions_and_ownership,
          test_mappings: ctr.test_mappings || []
        }
      });
    }
  }

  // 2. JavaScript Symbols
  if (allowKind('symbol')) {
    for (const mod of snapshot.js_modules) {
      for (const s of mod.symbols) {
        const t1 = scoreMatchTier(s.name.toLowerCase(), queryLower);
        const t2 = scoreMatchTier((s.local_name || '').toLowerCase(), queryLower);
        const t3 = scoreMatchTier(s.symbol_id.toLowerCase(), queryLower);
        const validTiers = [t1, t2, t3].filter(t => t >= 0);
        if (validTiers.length === 0) continue;
        const bestTier = Math.min(...validTiers);
        if (exactOnly && bestTier !== 0) continue;

        const sig = `${s.async ? 'async ' : ''}${s.name}(${(s.params || []).map(p => `${p.name}: ${p.observed_type}`).join(', ')}) -> ${s.return_behavior}`;
        rawMatches.push({
          tier: bestTier,
          match_tier: TIER_LABELS[bestTier],
          kind: 'symbol',
          id: s.symbol_id,
          location: `${mod.file}:L${s.start_line}-L${s.end_line}`,
          summary: `${sig}${s.exported ? ' [exported]' : ''}`,
          record: {
            qualified_name: s.name,
            scope_kind: s.scope_kind,
            exported: s.exported,
            throws: s.throws,
            confirmed_callers: full ? s.confirmed_callers : (s.confirmed_callers || []).slice(0, 8),
            confirmed_caller_count: (s.confirmed_callers || []).length,
            inferred_candidate_callers: full
              ? s.inferred_candidate_callers
              : (s.inferred_candidate_callers || []).slice(0, 5),
            confirmed_callees: full ? s.confirmed_callees : (s.confirmed_callees || []).slice(0, 8),
            dynamic_unresolved_callsites: s.dynamic_unresolved_callsites || [],
            contract_ids: s.contract_ids || [],
            confirmed_test_callers: full ? s.confirmed_test_callers : (s.confirmed_test_callers || []).slice(0, 5)
          }
        });
      }
      for (const g of mod.globals_assigned) {
        const gt = scoreMatchTier(g.name.toLowerCase(), queryLower);
        const wt = scoreMatchTier(`window.${g.name.toLowerCase()}`, queryLower);
        const vt = [gt, wt].filter(x => x >= 0);
        if (vt.length === 0) continue;
        const bestTier = Math.min(...vt);
        if (exactOnly && bestTier !== 0) continue;
        rawMatches.push({
          tier: bestTier,
          match_tier: TIER_LABELS[bestTier],
          kind: 'browser_global',
          id: `window.${g.name}`,
          location: `${g.file}:L${g.line}`,
          summary: `${g.kind} in ${g.file}`,
          record: { global_name: g.name, assignment_kind: g.kind }
        });
      }
    }
  }

  // 3. Backend HTTP Routes
  if (allowKind('route') || allowKind('http_route')) {
    for (const r of snapshot.backend_routes) {
      const tPath = scoreMatchTier(r.path.toLowerCase(), queryLower);
      const tHandler = scoreMatchTier(r.handler_file.toLowerCase(), queryLower);
      const vt = [tPath, tHandler].filter(x => x >= 0);
      if (vt.length === 0) continue;
      const bestTier = Math.min(...vt);
      if (exactOnly && bestTier !== 0) continue;
      rawMatches.push({
        tier: bestTier,
        match_tier: TIER_LABELS[bestTier],
        kind: 'http_route',
        id: `${r.methods.join(',')} ${r.path}`,
        location: `${r.handler_file}:L${r.line}`,
        summary: `dispatcher=${r.dispatcher}, auth=${r.auth_requirement}, authz=${r.authorization_summary}`,
        record: {
          path: r.path,
          methods: r.methods,
          method_source: r.method_source,
          dispatcher: r.dispatcher,
          handler: `${r.handler_file}#${r.handler_symbol}`,
          auth_requirement: r.auth_requirement,
          authentication_evidence: r.authentication_evidence,
          authorization_summary: r.authorization_summary,
          authorization_confidence: r.authorization_confidence,
          authorization_evidence: r.authorization_evidence,
          authorization_by_method: r.authorization_by_method,
          feature_enforcement_by_method: r.feature_enforcement_by_method,
          db_tables_touched: r.db_tables_touched,
          contract_ids: r.contract_ids,
          confirmed_frontend_callers: r.known_frontend_callers,
          inferred_frontend_callers: r.inferred_frontend_callers,
          test_references: r.test_references
        }
      });
    }
  }

  // 4. Database Tables
  if (allowKind('table') || allowKind('db_table')) {
    for (const t of snapshot.database.tables) {
      const tName = scoreMatchTier(t.table_name.toLowerCase(), queryLower);
      const colMatch = t.columns.find(c => scoreMatchTier(c.name.toLowerCase(), queryLower) >= 0);
      const colTier = colMatch ? Math.max(1, scoreMatchTier(colMatch.name.toLowerCase(), queryLower)) : -1;
      const vt = [tName, colTier].filter(x => x >= 0);
      if (vt.length === 0) continue;
      const bestTier = Math.min(...vt);
      if (exactOnly && bestTier !== 0) continue;

      const routesTouching = snapshot.backend_routes
        .filter(r => (r.db_tables_touched || []).includes(t.table_name))
        .map(r => r.path);
      const linkedCtrs = (snapshot.shared_contracts || [])
        .filter(c => (c.db_tables || []).includes(t.table_name))
        .map(c => c.contract_id);

      rawMatches.push({
        tier: bestTier,
        match_tier: TIER_LABELS[bestTier],
        kind: 'db_table',
        id: t.table_name,
        location: t.created_in_migration?.startsWith('scripts/')
          ? t.created_in_migration
          : `migrations/${t.created_in_migration}`,
        summary: `${t.columns.length} cols, rls_forced=${t.rls_forced}, ${t.rls_policies.length} policies`,
        record: {
          created_in_migration: t.created_in_migration,
          altered_in_migrations: t.altered_in_migrations,
          rls_enabled: t.rls_enabled,
          rls_forced: t.rls_forced,
          columns: full ? t.columns : t.columns.map(c => `${c.name}:${c.sql_type}${c.not_null ? ' NOT NULL' : ''}`),
          foreign_keys: t.foreign_keys,
          indexes: t.indexes.map(ix => ix.name),
          rls_policies: t.rls_policies.map(p => `${p.policy_name}(${p.command})`),
          routes_touching_table: routesTouching,
          contract_ids: linkedCtrs
        }
      });
    }
  }

  // 5. Feature Controls
  if (allowKind('flag') || allowKind('feature_control')) {
    for (const f of snapshot.feature_controls.features) {
      const kt = scoreMatchTier(f.key.toLowerCase(), queryLower);
      const tt = scoreMatchTier(f.title.toLowerCase(), queryLower);
      const vt = [kt, tt].filter(x => x >= 0);
      if (vt.length === 0) continue;
      const bestTier = Math.min(...vt);
      if (exactOnly && bestTier !== 0) continue;

      const gatedRoutes = snapshot.backend_routes
        .filter(r => r.feature_gate && r.feature_gate.split(',').includes(f.key))
        .map(r => r.path);
      const codeRefs = [];
      for (const m of snapshot.js_modules) {
        if (m.file.startsWith('tests/')) continue;
        for (const ref of m.feature_key_refs || []) {
          if (ref.feature_key === f.key) codeRefs.push(`${m.file}:L${ref.line}(${ref.caller})`);
        }
      }
      const linkedCtrs = (snapshot.shared_contracts || [])
        .filter(c => (c.feature_controls || []).includes(f.key))
        .map(c => c.contract_id);

      rawMatches.push({
        tier: bestTier,
        match_tier: TIER_LABELS[bestTier],
        kind: 'feature_control',
        id: f.key,
        location: `${f.file}:L${f.line}`,
        summary: `default=${f.default_state} (${f.default_audience}), depends_on=[${f.depends_on.join(', ')}]`,
        record: {
          allowed_states: f.allowed_states,
          depends_on: f.depends_on,
          gated_http_routes: gatedRoutes,
          code_check_sites: codeRefs,
          contract_ids: linkedCtrs
        }
      });
    }
  }

  // 6. Configuration Keys
  if (allowKind('config') || allowKind('config_var')) {
    for (const c of snapshot.configuration_consumers) {
      const kt = scoreMatchTier(c.key.toLowerCase(), queryLower);
      const at = c.legacy_alias ? scoreMatchTier(c.legacy_alias.toLowerCase(), queryLower) : -1;
      const vt = [kt, at].filter(x => x >= 0);
      if (vt.length === 0) continue;
      const bestTier = Math.min(...vt);
      if (exactOnly && bestTier !== 0) continue;
      rawMatches.push({
        tier: bestTier,
        match_tier: TIER_LABELS[bestTier],
        kind: 'config_var',
        id: c.key,
        location: c.consumers[0] || 'docs/engineering/contracts/configuration-keys.json',
        summary: `legacy_alias=${c.legacy_alias || 'none'}, ${c.consumers.length} consumer site(s)`,
        record: { consumers: c.consumers, legacy_alias: c.legacy_alias }
      });
    }
  }

  // 7. HTML Element IDs
  if (allowKind('dom') || allowKind('html_id')) {
    for (const h of snapshot.html_documents) {
      for (const el of h.elements_by_id) {
        const cleanQuery = queryLower.startsWith('#') ? queryLower.slice(1) : queryLower;
        const et = scoreMatchTier(el.id.toLowerCase(), cleanQuery);
        if (et < 0) continue;
        if (exactOnly && et !== 0) continue;
        const jsLookups = [];
        for (const m of snapshot.js_modules) {
          for (const d of m.dom_references || []) {
            if (!d.dynamic && (d.selector === el.id || d.selector === `#${el.id}`)) {
              jsLookups.push(`${m.file}:L${d.line}(${d.caller})`);
            }
          }
        }
        rawMatches.push({
          tier: et,
          match_tier: TIER_LABELS[et],
          kind: 'html_id',
          id: `#${el.id}`,
          location: `${h.file}:L${el.line}`,
          summary: `<${el.tag}> (${jsLookups.length} static JS lookup site(s))`,
          record: { tag: el.tag, classes: el.classes, js_lookup_sites: jsLookups.slice(0, 15) }
        });
      }
    }
  }

  // 8. Drift Findings
  if (allowKind('drift') || allowKind('drift_finding')) {
    for (const d of snapshot.drift_report.findings) {
      const dt = scoreMatchTier(d.finding_id.toLowerCase(), queryLower);
      if (dt < 0) continue;
      if (exactOnly && dt !== 0) continue;
      rawMatches.push({
        tier: dt,
        match_tier: TIER_LABELS[dt],
        kind: 'drift_finding',
        id: d.finding_id,
        location: d.affected_objects[0] || '',
        summary: `${d.severity}/${d.confidence} (${d.suppressed ? 'suppressed' : 'active'})`,
        record: {
          category: d.category,
          evidence: d.evidence,
          proposed_remediation: d.proposed_remediation
        }
      });
    }
  }

  // Sort: exact matches FIRST (`tier === 0`), then prefix (`1`), then substring (`2`), then kind/id
  const kindPriority = {
    contract: 0,
    http_route: 1,
    symbol: 2,
    db_table: 3,
    feature_control: 4,
    config_var: 5,
    html_id: 6,
    browser_global: 7,
    drift_finding: 8
  };
  rawMatches.sort(
    (a, b) =>
      a.tier - b.tier ||
      (kindPriority[a.kind] ?? 99) - (kindPriority[b.kind] ?? 99) ||
      asciiCompare(a.id, b.id) ||
      asciiCompare(a.location, b.location)
  );

  const safeOffset = Math.max(0, Number(offset) || 0);
  const safeLimit = Math.max(1, Number(limit) || 25);
  const sliced = rawMatches.slice(safeOffset, safeOffset + safeLimit).map(({ tier: _t, ...rest }) => rest);
  const truncated = safeOffset + sliced.length < rawMatches.length;

  return {
    query: rawQuery.trim(),
    source_commit: snapshot.provenance.commit_sha,
    branch_or_ref: snapshot.provenance.branch_or_ref,
    total_matches: rawMatches.length,
    offset: safeOffset,
    limit: safeLimit,
    returned_count: sliced.length,
    truncated,
    ...(truncated ? { next_page_hint: `Pass --offset ${safeOffset + safeLimit} --limit ${safeLimit} (or --full) to view remaining ${rawMatches.length - (safeOffset + sliced.length)} match(es).` } : {}),
    matches: sliced
  };
}

function formatLocateHumanReadable(res, { full = false } = {}) {
  const lines = [
    `BiteShark Code Registry — Locate "${res.query}" (ref: ${res.branch_or_ref} @ ${String(res.source_commit).slice(0, 12)})`,
    `Matches: showing ${res.returned_count} of ${res.total_matches} (offset=${res.offset}, limit=${res.limit}${res.truncated ? ', TRUNCATED' : ''})`,
    ``
  ];
  if (res.matches.length === 0) {
    lines.push(`  (no matching symbol, contract, route, table, feature flag, config var, or DOM ID found)`);
    return lines.join('\n') + '\n';
  }

  for (const m of res.matches) {
    lines.push(`[${m.match_tier.toUpperCase()}] (${m.kind}) ${m.id}`);
    lines.push(`  Location : ${m.location}`);
    lines.push(`  Summary  : ${m.summary}`);
    const r = m.record || {};
    if (m.kind === 'symbol') {
      if (r.confirmed_callers?.length) {
        lines.push(
          `  Confirmed Callers (${r.confirmed_caller_count}): ${r.confirmed_callers.join(', ')}`
        );
      }
      if (r.inferred_candidate_callers?.length) {
        lines.push(`  Candidate Callers (inferred): ${r.inferred_candidate_callers.join(', ')}`);
      }
      if (r.confirmed_callees?.length) {
        lines.push(`  Confirmed Callees: ${r.confirmed_callees.join(', ')}`);
      }
      if (r.contract_ids?.length) {
        lines.push(`  Contracts: ${r.contract_ids.join(', ')}`);
      }
      if (r.confirmed_test_callers?.length) {
        lines.push(`  Static Test Callers: ${r.confirmed_test_callers.join(', ')}`);
      }
    } else if (m.kind === 'http_route') {
      lines.push(
        `  Auth / Authz : ${r.auth_requirement} | ${r.authorization_summary} (evidence: ${(r.authorization_evidence || []).join(', ') || 'none'})`
      );
      const fe = Object.entries(r.feature_enforcement_by_method || {})
        .map(([k, v]) => (v ? `${k}:${v.feature_key}(${v.operation_kind})` : `${k}:exempt`))
        .join(', ');
      if (fe) lines.push(`  Feature Gate : ${fe}`);
      if (r.confirmed_frontend_callers?.length) {
        lines.push(`  Frontend Callers (confirmed): ${r.confirmed_frontend_callers.join(', ')}`);
      }
      if (r.contract_ids?.length) {
        lines.push(`  Contracts    : ${r.contract_ids.join(', ')}`);
      }
      const cm = (r.test_references?.contract_mappings || []).map(x => `${x.file}[${x.protected_assertions.join(',')}]`);
      const sh = r.test_references?.static_http_call_tests || [];
      const pm = r.test_references?.candidate_path_mentions || [];
      if (cm.length) lines.push(`  Contract Test Mappings: ${cm.join('; ')}`);
      if (sh.length) lines.push(`  Static HTTP Test Calls: ${sh.join(', ')}`);
      if (pm.length && (full || (!cm.length && !sh.length))) {
        lines.push(`  Candidate Test Path Mentions: ${pm.join(', ')}`);
      }
    } else if (m.kind === 'contract') {
      lines.push(`  Purpose  : ${r.purpose}`);
      lines.push(`  Symbols  : ${(r.implementation_symbols || []).join(', ')}`);
      if (r.http_routes?.length) lines.push(`  Routes   : ${r.http_routes.join(', ')}`);
      if (r.db_tables?.length) lines.push(`  Tables   : ${r.db_tables.join(', ')}`);
      if (r.test_mappings?.length) {
        lines.push(`  Tests    : ${r.test_mappings.map(t => `${t.file} (${t.protected_assertions.join(',')})`).join('; ')}`);
      }
    } else if (m.kind === 'db_table') {
      if (r.rls_policies?.length) lines.push(`  Policies : ${r.rls_policies.join(', ')}`);
      if (r.routes_touching_table?.length) lines.push(`  Routes   : ${r.routes_touching_table.join(', ')}`);
      if (r.contract_ids?.length) lines.push(`  Contracts: ${r.contract_ids.join(', ')}`);
    } else if (m.kind === 'feature_control') {
      if (r.gated_http_routes?.length) lines.push(`  Gated Routes: ${r.gated_http_routes.join(', ')}`);
      if (r.code_check_sites?.length) lines.push(`  Code Checks : ${r.code_check_sites.slice(0, 8).join(', ')}`);
    }
    lines.push(``);
  }

  if (res.truncated && res.next_page_hint) {
    lines.push(`Note: ${res.next_page_hint}`);
  }
  return lines.join('\n') + '\n';
}

async function main() {
  const { command, positional, flags } = parseCliArgs(process.argv.slice(2));
  const repoRoot = flags.root ? path.resolve(String(flags.root)) : DEFAULT_REPO_ROOT;

  if (command === 'help' || flags.help) {
    console.log(
      [
        'BiteShark Code Registry, Drift Governance & Change-Impact CLI',
        '',
        'Default Workflow:',
        '  locate <query> [--exact] [--json] [--full]      Find connected symbol, contract, route, table, flag & test records',
        '  generate-docs                                   Regenerate docs/engineering/generated/* (NEVER alters drift-baseline.json)',
        '  validate [--verify-db] [--trusted-baseline-ref] Verify determinism, full schemas, freshness, contracts & drift gate',
        '  compare --base <ref> --head <ref> [--merge-base] [--format markdown|json] [--out <file>]',
        '',
        'Occasional Governance & Export Operations:',
        '  accept-drift --finding <ID> --reason "<why>" [--ref "<issue/PR>"]',
        '  prune-drift [--dry-run]',
        '  scan [--out <file>] [--include-timestamp]'
      ].join('\n')
    );
    return;
  }

  if (command === 'scan') {
    const snap = scanRepositorySnapshot(repoRoot, {
      includeTimestamp: Boolean(flags['include-timestamp'])
    });
    if (snap.parse_failures.length > 0) {
      console.error(`[code-registry] Parse failures encountered (${snap.parse_failures.length}):`, snap.parse_failures);
      process.exitCode = 2;
    }
    const jsonText = deterministicStringify(snap, true);
    if (flags.out) {
      const outPath = path.resolve(repoRoot, String(flags.out));
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, jsonText, 'utf8');
      console.log(
        JSON.stringify({
          ok: snap.parse_failures.length === 0,
          output: outPath,
          commit_sha: snap.provenance.commit_sha,
          branch: snap.provenance.branch_or_ref,
          source_analysis_digest_sha256: snap.source_analysis_digest_sha256,
          governance_digest_sha256: snap.governance_digest_sha256,
          coverage_counts: snap.coverage_counts
        })
      );
    } else {
      process.stdout.write(jsonText);
    }
    return;
  }

  if (command === 'generate-docs') {
    const snap = scanRepositorySnapshot(repoRoot, { includeTimestamp: false });
    if (snap.parse_failures.length > 0) {
      console.error('[code-registry] Refusing to generate docs due to syntax parse failures:', snap.parse_failures);
      process.exit(2);
    }
    const written = writeGeneratedDocs(repoRoot, snap);
    console.log(
      JSON.stringify(
        {
          ok: true,
          baseline_modified: false,
          branch: snap.provenance.branch_or_ref,
          commit_sha: snap.provenance.commit_sha,
          source_analysis_digest_sha256: snap.source_analysis_digest_sha256,
          files_written: written,
          coverage_counts: snap.coverage_counts
        },
        null,
        2
      )
    );
    return;
  }

  if (command === 'accept-drift') {
    const findingId = typeof flags.finding === 'string' ? flags.finding.trim() : '';
    const reason = typeof flags.reason === 'string' ? flags.reason.trim() : '';
    const ref = typeof flags.ref === 'string' ? flags.ref.trim() : null;

    if (!findingId || !findingId.startsWith('DRIFT:')) {
      console.error('Usage: accept-drift --finding <DRIFT:...> --reason "<meaningful rationale >= 12 chars>" [--ref "<issue/PR/doc>"]');
      process.exit(1);
    }
    if (reason.length < 12) {
      console.error('Error: --reason must be at least 12 characters explaining why this debt is accepted rather than fixed immediately.');
      process.exit(1);
    }

    const snap = scanRepositorySnapshot(repoRoot, { includeTimestamp: false });
    const activeFinding = snap.drift_report.findings.find(f => !f.suppressed && f.finding_id === findingId);
    if (!activeFinding) {
      console.error(`Error: "${findingId}" is not an active unsuppressed finding in the current repository snapshot.`);
      process.exit(1);
    }
    if (
      activeFinding.category === 'BROKEN_DOC_LINK' &&
      activeFinding.affected_objects.some(
        o => o.startsWith('docs/engineering/') || o.startsWith('AGENTS.md') || o.startsWith('README.md')
      )
    ) {
      console.error(`Error: Broken links inside docs/engineering/**, AGENTS.md, or README.md cannot be accepted into baseline debt; fix the link directly.`);
      process.exit(1);
    }

    const baselinePath = path.join(repoRoot, 'docs', 'engineering', 'schemas', 'drift-baseline.json');
    let existingEntries = [];
    if (fs.existsSync(baselinePath)) {
      const parsed = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
      existingEntries = Array.isArray(parsed.entries)
        ? parsed.entries
        : (parsed.baseline_finding_ids || []).map(id => ({
            finding_id: id,
            category: id.split(':')[1] || 'UNKNOWN',
            accepted_reason: 'Pre-existing baseline debt migrated from v1.',
            reference: 'docs/engineering/KNOWN-DRIFT.md'
          }));
    }

    const filtered = existingEntries.filter(e => e.finding_id !== findingId);
    filtered.push({
      finding_id: findingId,
      category: activeFinding.category,
      accepted_reason: reason,
      reference: ref || 'docs/engineering/KNOWN-DRIFT.md'
    });
    filtered.sort((a, b) => asciiCompare(a.finding_id, b.finding_id));

    const nextBaseline = {
      schema_version: DRIFT_BASELINE_SCHEMA_VERSION,
      description:
        'Audited baseline structural/documentation debt. Never updated automatically by generate-docs; modify only via accept-drift or prune-drift with explicit review.',
      high_confidence_blocking_categories: [...HIGH_CONFIDENCE_BLOCKING_DRIFT_CATEGORIES],
      entries: filtered
    };
    fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
    fs.writeFileSync(baselinePath, deterministicStringify(nextBaseline, true), 'utf8');
    console.log(JSON.stringify({ ok: true, accepted: findingId, total_entries: filtered.length }, null, 2));
    return;
  }

  if (command === 'prune-drift') {
    const dryRun = Boolean(flags['dry-run']);
    const snap = scanRepositorySnapshot(repoRoot, { includeTimestamp: false });
    const activeSet = new Set(snap.drift_report.findings.filter(f => !f.suppressed).map(f => f.finding_id));
    const baselinePath = path.join(repoRoot, 'docs', 'engineering', 'schemas', 'drift-baseline.json');
    if (!fs.existsSync(baselinePath)) {
      console.log(JSON.stringify({ ok: true, pruned_ids: [], remaining_count: 0 }, null, 2));
      return;
    }
    const parsed = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    const existingEntries = Array.isArray(parsed.entries)
      ? parsed.entries
      : (parsed.baseline_finding_ids || []).map(id => ({
          finding_id: id,
          category: id.split(':')[1] || 'UNKNOWN',
          accepted_reason: 'Pre-existing baseline debt.',
          reference: 'docs/engineering/KNOWN-DRIFT.md'
        }));

    const kept = existingEntries.filter(e => activeSet.has(e.finding_id));
    const prunedIds = existingEntries.filter(e => !activeSet.has(e.finding_id)).map(e => e.finding_id);

    if (!dryRun && prunedIds.length > 0) {
      const nextBaseline = {
        schema_version: DRIFT_BASELINE_SCHEMA_VERSION,
        description:
          parsed.description ||
          'Audited baseline structural/documentation debt. Never updated automatically by generate-docs; modify only via accept-drift or prune-drift with explicit review.',
        high_confidence_blocking_categories:
          parsed.high_confidence_blocking_categories || [...HIGH_CONFIDENCE_BLOCKING_DRIFT_CATEGORIES],
        entries: kept
      };
      fs.writeFileSync(baselinePath, deterministicStringify(nextBaseline, true), 'utf8');
    }
    console.log(
      JSON.stringify({ ok: true, dry_run: dryRun, pruned_ids: prunedIds, remaining_count: kept.length }, null, 2)
    );
    return;
  }

  if (command === 'validate') {
    const failures = [];
    const snap1 = scanRepositorySnapshot(repoRoot, { includeTimestamp: false });
    const snap2 = scanRepositorySnapshot(repoRoot, { includeTimestamp: false });

    // 1. Parse-failure check
    if (snap1.parse_failures.length > 0) {
      failures.push(
        `AST parse failures (${snap1.parse_failures.length}): ${snap1.parse_failures.map(p => `${p.file}:L${p.line} ${p.message}`).join('; ')}`
      );
    }

    // 2. Determinism check
    const raw1 = deterministicStringify(snap1, false);
    const raw2 = deterministicStringify(snap2, false);
    if (raw1 !== raw2 || snap1.source_analysis_digest_sha256 !== snap2.source_analysis_digest_sha256) {
      failures.push('Non-deterministic registry scan output detected across consecutive runs.');
    }

    // 3. Full Recursive JSON Schema Validation (`Section 11`)
    const schemasDir = path.join(repoRoot, 'docs', 'engineering', 'schemas');
    const snapSchemaErrs = validateJsonWithSchemaFile(snap1, path.join(schemasDir, 'code-registry.schema.json'));
    for (const e of snapSchemaErrs) failures.push(`Snapshot schema error ${e}`);

    const suppPath = path.join(repoRoot, 'tools', 'code-registry', 'suppressions.json');
    if (fs.existsSync(suppPath)) {
      try {
        const suppObj = JSON.parse(fs.readFileSync(suppPath, 'utf8'));
        for (const e of validateJsonWithSchemaFile(suppObj, path.join(schemasDir, 'drift-suppressions.schema.json'))) {
          failures.push(`Suppressions schema error ${e}`);
        }
      } catch (err) {
        failures.push(`Invalid JSON in suppressions.json: ${err.message}`);
      }
    }

    const ctrsPath = path.join(repoRoot, 'docs', 'engineering', 'contracts', 'shared-contracts.json');
    if (fs.existsSync(ctrsPath)) {
      try {
        const ctrsObj = JSON.parse(fs.readFileSync(ctrsPath, 'utf8'));
        for (const e of validateJsonWithSchemaFile(ctrsObj, path.join(schemasDir, 'shared-contracts.schema.json'))) {
          failures.push(`Shared contracts schema error ${e}`);
        }
      } catch (err) {
        failures.push(`Invalid JSON in shared-contracts.json: ${err.message}`);
      }
    }

    // 4. Referential integrity of maintained contracts & route overrides (`Sections 7 & 12`)
    failures.push(...validateContractsReferentialIntegrity(snap1, repoRoot));

    // 5. Generated summary & Markdown freshness check (`Section 6`)
    const summaryPath = path.join(repoRoot, 'docs', 'engineering', 'generated', 'registry-summary.json');
    if (!fs.existsSync(summaryPath)) {
      failures.push('Missing docs/engineering/generated/registry-summary.json (run `npm run registry:docs`).');
    } else {
      try {
        const committedSummary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
        for (const e of validateJsonWithSchemaFile(
          committedSummary,
          path.join(schemasDir, 'registry-summary.schema.json')
        )) {
          failures.push(`registry-summary.json schema error ${e}`);
        }
        const committedDigest =
          committedSummary.source_analysis_digest_sha256 || committedSummary.deterministic_digest_sha256;
        if (committedDigest !== snap1.source_analysis_digest_sha256) {
          failures.push(
            `Generated docs are stale: registry-summary.json digest (${committedDigest}) != current workspace source digest (${snap1.source_analysis_digest_sha256}). Run \`npm run registry:docs\`.`
          );
        }
      } catch (err) {
        failures.push(`Invalid JSON in registry-summary.json: ${err.message}`);
      }
    }

    for (const genRel of CANONICAL_GENERATED_DOC_PATHS) {
      if (!genRel.endsWith('.md')) continue;
      const absGen = path.join(repoRoot, genRel);
      if (!fs.existsSync(absGen)) {
        failures.push(`Missing generated handbook file ${genRel} (run \`npm run registry:docs\`).`);
      } else {
        const headText = fs.readFileSync(absGen, 'utf8').slice(0, 1200);
        const dm = /Source Analysis Digest\*\*:\s*`([0-9a-f]{64})`/.exec(headText);
        if (!dm || dm[1] !== snap1.source_analysis_digest_sha256) {
          failures.push(
            `Generated Markdown ${genRel} is stale or hand-edited (digest=${dm ? dm[1] : 'missing'} != ${snap1.source_analysis_digest_sha256}). Run \`npm run registry:docs\`.`
          );
        }
      }
    }

    // 6. Drift Baseline & Trusted PR Target Baseline Comparison (`Section 5`)
    const baselinePath = path.join(schemasDir, 'drift-baseline.json');
    let localBaselineObj = null;
    let localBaselineIds = new Set();
    let blockingCategories = new Set(HIGH_CONFIDENCE_BLOCKING_DRIFT_CATEGORIES);

    if (fs.existsSync(baselinePath)) {
      try {
        localBaselineObj = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
        for (const e of validateJsonWithSchemaFile(localBaselineObj, path.join(schemasDir, 'drift-baseline.schema.json'))) {
          failures.push(`drift-baseline.json schema error ${e}`);
        }
        localBaselineIds = readBaselineIdSet(localBaselineObj);
        if (Array.isArray(localBaselineObj.high_confidence_blocking_categories)) {
          blockingCategories = new Set(localBaselineObj.high_confidence_blocking_categories);
        }
      } catch (err) {
        failures.push(`Invalid JSON in drift-baseline.json: ${err.message}`);
      }
    } else {
      failures.push('Missing docs/engineering/schemas/drift-baseline.json.');
    }

    const activeFindings = snap1.drift_report.findings.filter(f => !f.suppressed);
    const activeIdsSet = new Set(activeFindings.map(f => f.finding_id));
    const staleBaselineIds = [...localBaselineIds].filter(id => !activeIdsSet.has(id)).sort(asciiCompare);

    for (const f of activeFindings) {
      if (
        f.category === 'BROKEN_DOC_LINK' &&
        f.affected_objects.some(
          o => o.startsWith('docs/engineering/') || o.startsWith('AGENTS.md') || o.startsWith('README.md')
        )
      ) {
        failures.push(`Broken handbook link [${f.finding_id}]: ${f.evidence}`);
      } else if (!localBaselineIds.has(f.finding_id) && blockingCategories.has(f.category) && f.confidence === 'high') {
        failures.push(`New high-confidence structural violation [${f.finding_id}]: ${f.evidence}`);
      }
    }

    // Trusted target-branch baseline enforcement for PRs (`--trusted-baseline-ref <git-ref>`)
    let governanceComparison = null;
    const trustedRef = typeof flags['trusted-baseline-ref'] === 'string' ? flags['trusted-baseline-ref'].trim() : null;
    if (trustedRef) {
      const trustedGov = loadGovernanceFilesFromRef(repoRoot, trustedRef);
      const headGov = loadGovernanceFilesFromRef(repoRoot, 'WORKTREE');
      const govDiff = diffGovernanceState(trustedGov, headGov);

      // Re-scan using the trusted target branch's suppressions so a PR cannot hide a new violation by adding a suppression!
      const tmpSuppFile = path.join(
        os.tmpdir(),
        `bs-trusted-supp-${process.pid}-${Date.now()}.json`
      );
      let snapAgainstTrustedSuppressions = snap1;
      if (trustedGov.suppressions) {
        try {
          fs.writeFileSync(tmpSuppFile, JSON.stringify(trustedGov.suppressions), 'utf8');
          snapAgainstTrustedSuppressions = scanRepositorySnapshot(repoRoot, {
            includeTimestamp: false,
            suppressionsPath: tmpSuppFile
          });
        } finally {
          try {
            fs.rmSync(tmpSuppFile, { force: true });
          } catch {}
        }
      }

      const trustedBaselineIds = readBaselineIdSet(trustedGov.baseline);
      const untrustedNewBlocking = [];
      for (const f of snapAgainstTrustedSuppressions.drift_report.findings.filter(x => !x.suppressed)) {
        if (!trustedBaselineIds.has(f.finding_id) && blockingCategories.has(f.category) && f.confidence === 'high') {
          untrustedNewBlocking.push(f.finding_id);
          const msg = `PR introduces high-confidence violation not in trusted baseline (${trustedRef}) [${f.finding_id}]: ${f.evidence}`;
          if (!failures.includes(msg)) failures.push(msg);
        }
      }

      governanceComparison = {
        trusted_ref: trustedRef,
        trusted_baseline_found: Boolean(trustedGov.baseline),
        ...govDiff,
        untrusted_new_blocking_findings: untrustedNewBlocking
      };
    }

    // 7. Database Verification (`--verify-db` / `--verify-db=required` / `--verify-db=optional`)
    let dbVerifyResult = {
      status: 'NOT_RUN',
      mode: 'not_requested',
      executed: false
    };
    if (flags['verify-db']) {
      const verifyMode = flags['verify-db'] === 'optional' ? 'optional' : 'required';
      dbVerifyResult = await verifySchemaWithDisposablePostgres(repoRoot, snap1, { mode: verifyMode });
      if (verifyMode === 'required' && !dbVerifyResult.executed) {
        failures.push(`DB_VERIFICATION_UNAVAILABLE: ${dbVerifyResult.reason}`);
      } else if (dbVerifyResult.executed && !dbVerifyResult.ok) {
        failures.push(
          `Disposable DB schema verification mismatch: missing_tables=[${dbVerifyResult.missing_in_reconstructed.join(',')}], extra_tables=[${dbVerifyResult.extra_in_reconstructed.join(',')}], rls=[${dbVerifyResult.rls_mismatches.join(';')}], columns=[${dbVerifyResult.column_mismatches.slice(0, 8).join(';')}], constraints=[${dbVerifyResult.constraint_mismatches.slice(0, 8).join(';')}], indexes=[${dbVerifyResult.index_mismatches.slice(0, 8).join(';')}], policies=[${dbVerifyResult.policy_mismatches.slice(0, 8).join(';')}]`
        );
      }
    }

    const report = {
      ok: failures.length === 0,
      branch: snap1.provenance.branch_or_ref,
      commit_sha: snap1.provenance.commit_sha,
      source_analysis_digest_sha256: snap1.source_analysis_digest_sha256,
      governance_digest_sha256: snap1.governance_digest_sha256,
      coverage_counts: snap1.coverage_counts,
      baseline_debt_count: localBaselineIds.size,
      stale_resolved_baseline_ids: staleBaselineIds,
      active_drift_count: activeFindings.length,
      ...(governanceComparison ? { trusted_baseline_comparison: governanceComparison } : {}),
      db_verification: dbVerifyResult,
      failures
    };

    const jsonReport = JSON.stringify(report, null, 2);
    if (flags.out) {
      const outPath = path.resolve(repoRoot, String(flags.out));
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, jsonReport + '\n', 'utf8');
    }
    console.log(jsonReport);
    if (failures.length > 0) process.exit(1);
    return;
  }

  if (command === 'compare' || command === 'impact') {
    const baseRef = String(flags.base || 'HEAD~1');
    const headRef = String(flags.head || 'HEAD');
    const useMergeBase = Boolean(flags['merge-base']);
    const format = String(flags.format || 'markdown').toLowerCase();

    const mergeBaseSha = useMergeBase ? resolveMergeBaseSha(repoRoot, baseRef, headRef) : null;
    const effectiveBaseRef = useMergeBase && mergeBaseSha ? mergeBaseSha : baseRef;

    const baseSnap =
      effectiveBaseRef === 'WORKTREE'
        ? scanRepositorySnapshot(repoRoot, { overrideRef: 'WORKTREE' })
        : scanGitRefSnapshot(repoRoot, effectiveBaseRef);
    const headSnap =
      headRef === 'WORKTREE'
        ? scanRepositorySnapshot(repoRoot, { overrideRef: 'WORKTREE' })
        : scanGitRefSnapshot(repoRoot, headRef);

    const govDiff =
      !baseSnap?.ref_resolution_failed && !headSnap?.ref_resolution_failed
        ? diffGovernanceState(
            loadGovernanceFilesFromRef(repoRoot, effectiveBaseRef),
            loadGovernanceFilesFromRef(repoRoot, headRef)
          )
        : null;

    const impact = compareRegistrySnapshots(baseSnap, headSnap, {
      mergeBaseSha,
      comparisonMode: useMergeBase ? 'merge_base' : 'direct',
      governanceDiff: govDiff
    });

    const rendered = format === 'json' ? deterministicStringify(impact, true) : formatImpactReportMarkdown(impact);
    if (flags.out) {
      const outPath = path.resolve(repoRoot, String(flags.out));
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, rendered, 'utf8');
      console.log(
        JSON.stringify({
          ok: true,
          output: outPath,
          classification: impact.compatibility_assessment.classification,
          summary_counts: impact.summary_counts
        })
      );
    } else {
      process.stdout.write(rendered);
    }
    return;
  }

  if (command === 'locate') {
    const rawQuery = positional.join(' ').trim();
    if (!rawQuery) {
      console.error(
        'Usage: node tools/code-registry/cli.mjs locate <query> [--exact] [--kind <symbol|contract|route|table|flag|config|dom|drift>] [--full] [--json] [--limit <n>] [--offset <m>]'
      );
      process.exit(1);
    }
    const snap = scanRepositorySnapshot(repoRoot, { includeTimestamp: false });
    const fullMode = Boolean(flags.full);
    const res = runLocateQuery(snap, rawQuery, {
      exactOnly: Boolean(flags.exact),
      kindFilter: typeof flags.kind === 'string' ? flags.kind.trim().toLowerCase() : null,
      full: fullMode,
      limit: fullMode && !flags.limit ? 500 : flags.limit ? Number(flags.limit) : 20,
      offset: flags.offset ? Number(flags.offset) : 0
    });

    if (flags.json) {
      console.log(JSON.stringify(res, null, 2));
    } else {
      process.stdout.write(formatLocateHumanReadable(res, { full: fullMode }));
    }
    return;
  }

  console.error(`Unknown command "${command}". Run with --help for usage.`);
  process.exit(1);
}

main().catch(err => {
  console.error('[code-registry] Fatal error:', err);
  process.exit(2);
});
