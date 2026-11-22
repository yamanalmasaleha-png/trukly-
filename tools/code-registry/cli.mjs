#!/usr/bin/env node
// BiteShark Code Registry, Drift & Change-Impact CLI (`tools/code-registry/cli.mjs`)
//
// Supported commands:
//   node tools/code-registry/cli.mjs scan [--out <file>] [--include-timestamp]
//   node tools/code-registry/cli.mjs generate-docs [--no-baseline-update]
//   node tools/code-registry/cli.mjs validate [--verify-db]
//   node tools/code-registry/cli.mjs compare --base <ref> --head <ref> [--merge-base] [--format json|markdown] [--out <file>]
//   node tools/code-registry/cli.mjs impact --base <ref> --head <ref> [--merge-base] [--format json|markdown] [--out <file>]
//   node tools/code-registry/cli.mjs locate <query>

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { deterministicStringify, REGISTRY_SCHEMA_VERSION } from './schema-versions.mjs';
import { scanRepositorySnapshot } from './scanner.mjs';
import { writeGeneratedDocsAndBaseline } from './doc-generator.mjs';
import {
  scanGitRefSnapshot,
  resolveMergeBaseSha,
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

function validateSnapshotAgainstMinimalSchema(snapshot, schemaPath) {
  const errors = [];
  if (!snapshot || typeof snapshot !== 'object') {
    return ['Snapshot root is not an object.'];
  }
  if (snapshot.schema_version !== REGISTRY_SCHEMA_VERSION) {
    errors.push(`Expected schema_version "${REGISTRY_SCHEMA_VERSION}", got "${snapshot.schema_version}".`);
  }
  const requiredTopKeys = [
    'schema_version',
    'generator',
    'provenance',
    'scope',
    'coverage_counts',
    'parse_failures',
    'js_modules',
    'html_documents',
    'css_stylesheets',
    'backend_routes',
    'feature_controls',
    'database',
    'drift_report',
    'deterministic_digest_sha256'
  ];
  for (const k of requiredTopKeys) {
    if (!(k in snapshot)) errors.push(`Missing required top-level key "${k}".`);
  }
  if (fs.existsSync(schemaPath)) {
    try {
      const schemaObj = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
      for (const reqKey of schemaObj.required || []) {
        if (!(reqKey in snapshot)) {
          errors.push(`Schema required property "${reqKey}" missing from snapshot.`);
        }
      }
    } catch (err) {
      errors.push(`Failed to parse JSON schema at ${schemaPath}: ${err.message}`);
    }
  }
  return errors;
}

async function verifySchemaWithDisposablePostgres(repoRoot, snapshot) {
  // Uses local PostgreSQL if TEST_DATABASE_URL / PGUSER / local postgres is available, or reports clean skip if unavailable
  let pgMod;
  try {
    pgMod = await import('pg');
  } catch {
    return { executed: false, reason: 'pg module not installed in current environment.' };
  }
  const { Client } = pgMod.default || pgMod;
  const adminUrl = process.env.BITESHARK_REGISTRY_VERIFY_PG_URL || 'postgresql://postgres:postgres@127.0.0.1:5432/postgres';
  const tempDbName = `bs_reg_verify_${process.pid}_${Date.now()}`;

  const adminClient = new Client({ connectionString: adminUrl, connectionTimeoutMillis: 2500 });
  try {
    await adminClient.connect();
  } catch (err) {
    return {
      executed: false,
      reason: `Local disposable PostgreSQL server not reachable at ${adminUrl.replace(/:[^:@/]+@/, ':***@')} (${err.code || err.message}).`
    };
  }

  try {
    await adminClient.query(`CREATE DATABASE ${tempDbName}`);
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
        const tblRes = await verifyClient.query(
          `SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
             FROM pg_class c
             JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind = 'r'
            ORDER BY c.relname`
        );
        const liveTables = new Map(tblRes.rows.map(r => [r.table_name, r]));
        const reconstructedNames = new Set(snapshot.database.tables.map(t => t.table_name));
        const missingInReconstructed = [...liveTables.keys()].filter(t => !reconstructedNames.has(t));
        const extraInReconstructed = [...reconstructedNames].filter(t => !liveTables.has(t));
        const rlsMismatches = [];
        for (const t of snapshot.database.tables) {
          const live = liveTables.get(t.table_name);
          if (live && (Boolean(live.rls_forced) !== Boolean(t.rls_forced))) {
            rlsMismatches.push(`${t.table_name}: reconstructed rls_forced=${t.rls_forced} vs live=${live.rls_forced}`);
          }
        }
        return {
          executed: true,
          live_table_count: liveTables.size,
          reconstructed_table_count: reconstructedNames.size,
          missing_in_reconstructed: missingInReconstructed,
          extra_in_reconstructed: extraInReconstructed,
          rls_mismatches: rlsMismatches,
          ok:
            missingInReconstructed.length === 0 &&
            extraInReconstructed.length === 0 &&
            rlsMismatches.length === 0
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

async function main() {
  const { command, positional, flags } = parseCliArgs(process.argv.slice(2));
  const repoRoot = flags.root ? path.resolve(String(flags.root)) : DEFAULT_REPO_ROOT;

  if (command === 'help' || flags.help) {
    console.log(
      [
        'BiteShark Code Registry & Drift CLI',
        '',
        'Commands:',
        '  scan [--out <file>] [--include-timestamp]       Scan repository and emit full JSON inventory',
        '  generate-docs [--no-baseline-update]            Regenerate docs/engineering/generated/* and drift-baseline.json',
        '  validate [--verify-db]                          Verify determinism, schemas, links, freshness & new structural drift',
        '  compare --base <ref> --head <ref> [--merge-base] [--format json|markdown] [--out <file>]',
        '  impact  --base <ref> --head <ref> [--merge-base] [--format json|markdown] [--out <file>]',
        '  locate <query>                                  Search symbols, routes, tables, flags, configs, DOM IDs & reports'
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
          deterministic_digest_sha256: snap.deterministic_digest_sha256,
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
    const written = writeGeneratedDocsAndBaseline(repoRoot, snap, {
      updateBaseline: !flags['no-baseline-update']
    });
    console.log(
      JSON.stringify(
        {
          ok: true,
          branch: snap.provenance.branch_or_ref,
          commit_sha: snap.provenance.commit_sha,
          deterministic_digest_sha256: snap.deterministic_digest_sha256,
          files_written: written,
          coverage_counts: snap.coverage_counts
        },
        null,
        2
      )
    );
    return;
  }

  if (command === 'validate') {
    const failures = [];
    const snap1 = scanRepositorySnapshot(repoRoot, { includeTimestamp: false });
    const snap2 = scanRepositorySnapshot(repoRoot, { includeTimestamp: false });

    // 1. Parse-failure check (distinguishes failed analysis from discovered debt)
    if (snap1.parse_failures.length > 0) {
      failures.push(
        `AST parse failures (${snap1.parse_failures.length}): ${snap1.parse_failures.map(p => `${p.file}:L${p.line} ${p.message}`).join('; ')}`
      );
    }

    // 2. Determinism check
    const raw1 = deterministicStringify(snap1, false);
    const raw2 = deterministicStringify(snap2, false);
    if (raw1 !== raw2 || snap1.deterministic_digest_sha256 !== snap2.deterministic_digest_sha256) {
      failures.push('Non-deterministic registry scan output detected across consecutive runs.');
    }

    // 3. Schema check
    const schemaErrors = validateSnapshotAgainstMinimalSchema(
      snap1,
      path.join(repoRoot, 'docs', 'engineering', 'schemas', 'code-registry.schema.json')
    );
    failures.push(...schemaErrors);

    // 4. Generated summary freshness check
    const summaryPath = path.join(repoRoot, 'docs', 'engineering', 'generated', 'registry-summary.json');
    if (!fs.existsSync(summaryPath)) {
      failures.push('Missing docs/engineering/generated/registry-summary.json (run `npm run registry:docs`).');
    } else {
      try {
        const committedSummary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
        if (committedSummary.deterministic_digest_sha256 !== snap1.deterministic_digest_sha256) {
          failures.push(
            `Generated docs are stale: registry-summary.json digest (${committedSummary.deterministic_digest_sha256}) != current workspace digest (${snap1.deterministic_digest_sha256}). Run \`npm run registry:docs\`.`
          );
        }
      } catch (err) {
        failures.push(`Invalid JSON in registry-summary.json: ${err.message}`);
      }
    }

    // 5. Baseline vs newly introduced high-confidence structural drift check
    const baselinePath = path.join(repoRoot, 'docs', 'engineering', 'schemas', 'drift-baseline.json');
    let baselineIds = new Set();
    let blockingCategories = new Set([
      'DUPLICATE_HTML_ID',
      'UNRESOLVED_INLINE_HANDLER',
      'UNREGISTERED_FEATURE_KEY',
      'INVALID_WRITE_PAUSE_SCOPE',
      'MIGRATION_SEQUENCE_COLLISION',
      'MODULE_CYCLE',
      'BROKEN_DOC_LINK'
    ]);
    if (fs.existsSync(baselinePath)) {
      try {
        const baseObj = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
        baselineIds = new Set(baseObj.baseline_finding_ids || []);
        if (Array.isArray(baseObj.high_confidence_blocking_categories)) {
          blockingCategories = new Set(baseObj.high_confidence_blocking_categories);
        }
      } catch (err) {
        failures.push(`Invalid JSON in drift-baseline.json: ${err.message}`);
      }
    }

    const activeFindings = snap1.drift_report.findings.filter(f => !f.suppressed);
    // Any broken link inside `docs/engineering/**`, `AGENTS.md`, or `README.md` is NEVER allowed even if baseline existed
    for (const f of activeFindings) {
      if (
        f.category === 'BROKEN_DOC_LINK' &&
        f.affected_objects.some(o => o.startsWith('docs/engineering/') || o.startsWith('AGENTS.md') || o.startsWith('README.md'))
      ) {
        failures.push(`Broken handbook link [${f.finding_id}]: ${f.evidence}`);
      } else if (!baselineIds.has(f.finding_id) && blockingCategories.has(f.category) && f.confidence === 'high') {
        failures.push(`New high-confidence structural violation [${f.finding_id}]: ${f.evidence}`);
      }
    }

    // 6. Optional disposable PostgreSQL verification (`--verify-db`)
    let dbVerifyResult = null;
    if (flags['verify-db']) {
      dbVerifyResult = await verifySchemaWithDisposablePostgres(repoRoot, snap1);
      if (dbVerifyResult.executed && !dbVerifyResult.ok) {
        failures.push(
          `Disposable DB schema verification mismatch: missing=${dbVerifyResult.missing_in_reconstructed.join(',')}, extra=${dbVerifyResult.extra_in_reconstructed.join(',')}, rls=${dbVerifyResult.rls_mismatches.join(';')}`
        );
      }
    }

    const report = {
      ok: failures.length === 0,
      branch: snap1.provenance.branch_or_ref,
      commit_sha: snap1.provenance.commit_sha,
      deterministic_digest_sha256: snap1.deterministic_digest_sha256,
      coverage_counts: snap1.coverage_counts,
      baseline_debt_count: baselineIds.size,
      active_drift_count: activeFindings.length,
      ...(dbVerifyResult ? { db_verification: dbVerifyResult } : {}),
      failures
    };
    console.log(JSON.stringify(report, null, 2));
    if (failures.length > 0) process.exit(1);
    return;
  }

  if (command === 'compare' || command === 'impact') {
    const baseRef = String(flags.base || 'HEAD~1');
    const headRef = String(flags.head || 'HEAD');
    const useMergeBase = Boolean(flags['merge-base']);
    const format = String(flags.format || 'markdown').toLowerCase();

    const mergeBaseSha = resolveMergeBaseSha(repoRoot, baseRef, headRef);
    const effectiveBaseRef = useMergeBase && mergeBaseSha ? mergeBaseSha : baseRef;

    const baseSnap =
      effectiveBaseRef === 'WORKTREE'
        ? scanRepositorySnapshot(repoRoot, { overrideRef: 'WORKTREE' })
        : scanGitRefSnapshot(repoRoot, effectiveBaseRef);
    const headSnap =
      headRef === 'WORKTREE'
        ? scanRepositorySnapshot(repoRoot, { overrideRef: 'WORKTREE' })
        : scanGitRefSnapshot(repoRoot, headRef);

    const impact = compareRegistrySnapshots(baseSnap, headSnap, {
      mergeBaseSha,
      comparisonMode: useMergeBase ? 'merge_base' : 'direct'
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
    const query = positional.join(' ').trim().toLowerCase();
    if (!query) {
      console.error('Usage: node tools/code-registry/cli.mjs locate <symbol|route|table|flag|config|dom-id>');
      process.exit(1);
    }
    const snap = scanRepositorySnapshot(repoRoot, { includeTimestamp: false });
    const hits = [];

    for (const mod of snap.js_modules) {
      for (const s of mod.symbols) {
        if (s.name.toLowerCase().includes(query)) {
          hits.push({ kind: 'symbol', id: s.symbol_id, location: `${mod.file}:L${s.start_line}-L${s.end_line}`, detail: `(${s.params.map(p => p.name).join(', ')}) -> ${s.return_behavior}` });
        }
      }
      for (const g of mod.globals_assigned) {
        if (g.name.toLowerCase().includes(query)) {
          hits.push({ kind: 'browser_global', id: g.name, location: `${g.file}:L${g.line}`, detail: g.kind });
        }
      }
    }
    for (const r of snap.backend_routes) {
      if (r.path.toLowerCase().includes(query) || r.handler_file.toLowerCase().includes(query)) {
        hits.push({ kind: 'http_route', id: `${r.methods.join(',')} ${r.path}`, location: `${r.handler_file}:L${r.line}`, detail: `auth=${r.auth_requirement}, gate=${r.feature_gate || 'none'}` });
      }
    }
    for (const t of snap.database.tables) {
      if (t.table_name.toLowerCase().includes(query) || t.columns.some(c => c.name.toLowerCase().includes(query))) {
        hits.push({ kind: 'db_table', id: t.table_name, location: `migrations/${t.created_in_migration}`, detail: `${t.columns.length} cols, rls_forced=${t.rls_forced}` });
      }
    }
    for (const f of snap.feature_controls.features) {
      if (f.key.toLowerCase().includes(query) || f.title.toLowerCase().includes(query)) {
        hits.push({ kind: 'feature_control', id: f.key, location: `${f.file}:L${f.line}`, detail: `default=${f.default_state} (${f.default_audience})` });
      }
    }
    for (const c of snap.configuration_consumers) {
      if (c.key.toLowerCase().includes(query) || (c.legacy_alias && c.legacy_alias.toLowerCase().includes(query))) {
        hits.push({ kind: 'config_var', id: c.key, location: c.consumers[0] || '', detail: `alias=${c.legacy_alias || 'none'} (${c.consumers.length} consumer sites)` });
      }
    }
    for (const h of snap.html_documents) {
      for (const el of h.elements_by_id) {
        if (el.id.toLowerCase().includes(query)) {
          hits.push({ kind: 'html_id', id: `#${el.id}`, location: `${h.file}:L${el.line}`, detail: `<${el.tag}>` });
        }
      }
    }
    for (const d of snap.drift_report.findings) {
      if (d.finding_id.toLowerCase().includes(query) || d.evidence.toLowerCase().includes(query)) {
        hits.push({ kind: 'drift_finding', id: d.finding_id, location: d.affected_objects[0] || '', detail: `${d.severity} (${d.suppressed ? 'suppressed' : 'active'})` });
      }
    }

    console.log(
      JSON.stringify(
        {
          query,
          hit_count: hits.length,
          generated_reports: [
            'docs/engineering/README.md',
            'docs/engineering/generated/SYMBOL-INDEX.md',
            'docs/engineering/generated/ROUTE-INVENTORY.md',
            'docs/engineering/generated/FRONTEND-INVENTORY.md',
            'docs/engineering/generated/SCHEMA-INVENTORY.md',
            'docs/engineering/generated/DRIFT-REPORT.md'
          ],
          hits: hits.slice(0, 60)
        },
        null,
        2
      )
    );
    return;
  }

  console.error(`Unknown command "${command}". Run with --help for usage.`);
  process.exit(1);
}

main().catch(err => {
  console.error('[code-registry] Fatal error:', err);
  process.exit(2);
});
