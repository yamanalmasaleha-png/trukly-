// BiteShark Code Registry — Deterministic Markdown & Summary Catalog Generator
// (`tools/code-registry/doc-generator.mjs`)

import fs from 'node:fs';
import path from 'node:path';
import { deterministicStringify, DRIFT_SCHEMA_VERSION } from './schema-versions.mjs';

function relLinkFromGenerated(repoPath, line = null) {
  const target = `../../../${repoPath}${line ? `#L${line}` : ''}`;
  return `[${repoPath}${line ? `:L${line}` : ''}](${target})`;
}

function escapeMdCell(val) {
  return String(val ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ')
    .trim();
}

function buildGeneratedBanner(snapshot, title) {
  const p = snapshot.provenance;
  return [
    `# ${title}`,
    ``,
    `> [!NOTE]`,
    `> **Machine-Generated Reference Inventory** — Do not hand-edit. Regenerate via \`npm run registry:docs\` (\`node tools/code-registry/cli.mjs generate-docs\`).`,
    `> - **Repository**: \`${p.repository}\``,
    `> - **Branch / Ref at Generation**: \`${p.branch_or_ref}\``,
    `> - **Generator**: \`${snapshot.generator.name}@${snapshot.generator.version}\` (\`${snapshot.schema_version}\`)`,
    `> - **Deterministic Source Digest**: \`${snapshot.deterministic_digest_sha256}\``,
    `> - **Analysis Basis**: ${snapshot.generator.limitations_note}`,
    ``
  ].join('\n');
}

export function buildCompactRegistrySummary(snapshot) {
  return {
    schema_version: snapshot.schema_version,
    generator: snapshot.generator,
    branch_at_generation: snapshot.provenance.branch_or_ref,
    repository: snapshot.provenance.repository,
    deterministic_digest_sha256: snapshot.deterministic_digest_sha256,
    coverage_counts: snapshot.coverage_counts,
    parse_failures: snapshot.parse_failures,
    exclusion_rules: snapshot.scope.exclusion_rules,
    modules: snapshot.js_modules.map(m => ({
      file: m.file,
      source_type: m.source_type,
      symbol_count: m.symbols.length,
      exported_symbols: m.exports.map(e => e.name),
      globals_assigned: m.globals_assigned.map(g => g.name)
    })),
    routes: snapshot.backend_routes.map(r => ({
      path: r.path,
      methods: r.methods,
      dispatcher: r.dispatcher,
      handler_file: r.handler_file,
      auth_requirement: r.auth_requirement,
      feature_gate: r.feature_gate,
      caller_count: (r.known_frontend_callers || []).length,
      test_count: (r.verifying_tests || []).length
    })),
    database_tables: snapshot.database.tables.map(t => ({
      table_name: t.table_name,
      created_in_migration: t.created_in_migration,
      column_count: t.columns.length,
      rls_forced: t.rls_forced,
      policy_count: t.rls_policies.length
    })),
    feature_controls: snapshot.feature_controls.features.map(f => ({
      key: f.key,
      default_state: f.default_state,
      default_audience: f.default_audience,
      read_only: f.read_only,
      depends_on: f.depends_on
    })),
    drift_summary: {
      active_count: snapshot.drift_report.active_count,
      suppressed_count: snapshot.drift_report.suppressed_count,
      active_finding_ids: snapshot.drift_report.findings.filter(f => !f.suppressed).map(f => f.finding_id)
    }
  };
}

export function renderSymbolIndexMarkdown(snapshot) {
  // Build caller lookup across non-test modules
  const callerLookup = new Map();
  for (const mod of snapshot.js_modules) {
    if (mod.file.startsWith('tests/')) continue;
    for (const c of mod.calls) {
      const short = c.callee.split('.').pop();
      for (const k of [c.callee, short]) {
        if (!k) continue;
        if (!callerLookup.has(k)) callerLookup.set(k, new Set());
        callerLookup.get(k).add(`${mod.file}:${c.caller}`);
      }
    }
  }

  const lines = [
    buildGeneratedBanner(snapshot, 'Code Registry — First-Party Symbol & Module Index'),
    `## Coverage Summary`,
    ``,
    `| Metric | Count |`,
    `|---|---:|`,
    `| JavaScript / CJS / ESM Files Scanned | ${snapshot.coverage_counts.js_files_scanned} |`,
    `| Parse Failures | ${snapshot.coverage_counts.js_parse_failures} |`,
    `| Named Functions, Methods & Handlers | ${snapshot.coverage_counts.functions_and_methods} |`,
    `| Classes | ${snapshot.coverage_counts.classes} |`,
    `| Top-Level Constants | ${snapshot.coverage_counts.significant_constants} |`,
    `| Browser Globals & Assignments | ${snapshot.coverage_counts.browser_globals_and_assignments} |`,
    ``,
    `> **Type Notation**: BiteShark is plain JavaScript without TypeScript annotations. Parameter types below distinguish \`inferred_from_default\`, \`inferred_from_destructuring\`, \`inferred_from_rest\`, and \`undeclared\` (\`unknown\`). Signatures are never invented.`,
    ``
  ];

  const groups = [
    { title: '1. Server & Runtime Adapter (`server/`, `packages/`)', match: f => f.startsWith('server/') || f.startsWith('packages/') },
    { title: '2. Shared Backend Libraries (`lib/`)', match: f => f.startsWith('lib/') },
    { title: '3. Domain API Handlers (`api/`)', match: f => f.startsWith('api/') },
    { title: '4. Browser Frontend Scripts (`public/`)', match: f => f.startsWith('public/') },
    { title: '5. Operator & Build Scripts (`scripts/`)', match: f => f.startsWith('scripts/') }
  ];

  for (const grp of groups) {
    const mods = snapshot.js_modules.filter(m => grp.match(m.file));
    lines.push(`## ${grp.title}`, ``);
    for (const mod of mods) {
      lines.push(`### ${relLinkFromGenerated(mod.file)} (\`${mod.source_type}\`)`);
      if (mod.imports.length) {
        const deps = [...new Set(mod.imports.map(i => i.source))].sort();
        lines.push(`- **Imports / Dependencies**: ${deps.map(d => `\`${d}\``).join(', ')}`);
      }
      if (mod.exports.length) {
        lines.push(`- **Exports**: ${mod.exports.map(e => `\`${e.name}\``).join(', ')}`);
      }
      const winGlobals = mod.globals_assigned.filter(g => g.kind === 'explicit_window_property' || g.kind === 'browser_global_reassignment');
      if (winGlobals.length) {
        lines.push(
          `- **Explicit Window / Reassigned Globals**: ${winGlobals.map(g => `\`${g.name}\` (${g.kind} @ L${g.line})`).join(', ')}`
        );
      }
      if (mod.constants.length) {
        const topConsts = mod.constants.slice(0, 20);
        lines.push(
          `- **Significant Constants**: ${topConsts.map(c => `\`${c.name}\`${c.exported ? ' *(exported)*' : ''}`).join(', ')}${mod.constants.length > 20 ? ` (+${mod.constants.length - 20} more)` : ''}`
        );
      }

      const notableSyms = mod.symbols.filter(s => s.exported || s.top_level || s.kind === 'method' || s.kind === 'constructor');
      if (notableSyms.length) {
        lines.push(
          ``,
          `| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |`,
          `|---|---|---|---|---|---|---:|`
        );
        for (const s of notableSyms.slice(0, 80)) {
          const paramStr = s.params
            .map(p => `${p.name}: ${p.observed_type}`)
            .join(', ');
          const retStr = `${s.async ? 'async -> ' : ''}${s.return_behavior}${s.throws.length ? ` (throws: ${s.throws.join(', ')})` : ''}`;
          const callers = [...(callerLookup.get(s.name) || [])]
            .filter(loc => !loc.startsWith(`${mod.file}:${s.name}`))
            .slice(0, 4);
          lines.push(
            `| \`${escapeMdCell(s.name)}\` | \`${s.kind}\` | ${s.exported ? 'Yes' : 'No'} | \`(${escapeMdCell(paramStr)})\` | \`${escapeMdCell(retStr)}\` | ${callers.length ? callers.map(c => `\`${escapeMdCell(c)}\``).join(', ') : '—'} | L${s.start_line} |`
          );
        }
        if (notableSyms.length > 80) {
          lines.push(``, `*Showing first 80 of ${notableSyms.length} symbols in \`${mod.file}\`; query \`npm run registry:locate -- <name>\` for full list.*`);
        }
      }
      lines.push(``);
    }
  }

  return lines.join('\n');
}

export function renderRouteInventoryMarkdown(snapshot) {
  const lines = [
    buildGeneratedBanner(snapshot, 'Code Registry — Backend HTTP Route Inventory'),
    `Total HTTP endpoints indexed on branch \`${snapshot.provenance.branch_or_ref}\`: **${snapshot.backend_routes.length}**`,
    ``,
    `| Route Path | Methods | Dispatcher | Handler | Auth Requirement | Authorization Summary | Feature Gate | Frontend Callers | Verifying Tests |`,
    `|---|---|---|---|---|---|---|---|---|`
  ];

  for (const r of snapshot.backend_routes) {
    const callers = (r.known_frontend_callers || []).slice(0, 3).map(c => `\`${escapeMdCell(c)}\``).join(', ') || '*(none in public/)*';
    const tests = (r.verifying_tests || []).slice(0, 3).map(t => `\`${escapeMdCell(path.posix.basename(t))}\``).join(', ') || '—';
    lines.push(
      `| \`${r.path}\` | \`${r.methods.join(', ')}\` | \`${r.dispatcher}\` | ${relLinkFromGenerated(r.handler_file, r.line)} | \`${r.auth_requirement}\` | \`${escapeMdCell(r.authorization_summary)}\` | ${r.feature_gate ? `\`${r.feature_gate}\`` : '—'} | ${callers} | ${tests} |`
    );
  }

  lines.push(``);
  return lines.join('\n');
}

export function renderFrontendInventoryMarkdown(snapshot) {
  const lines = [
    buildGeneratedBanner(snapshot, 'Code Registry — Frontend Screens, DOM, Storage & CSS Inventory')
  ];

  for (const html of snapshot.html_documents) {
    if (html.file.startsWith('deploy/')) continue;
    lines.push(`## HTML Document: ${relLinkFromGenerated(html.file)}`, ``);
    if (html.screens.length) {
      lines.push(
        `### Screens (${html.screens.length})`,
        ``,
        `| Element ID | Tag | Default Active | Classes | Line |`,
        `|---|---|---|---|---:|`
      );
      for (const s of html.screens) {
        lines.push(`| \`#${s.id || 'unnamed'}\` | \`<${s.tag}>\` | ${s.active_by_default ? 'Yes' : 'No'} | \`${escapeMdCell(s.classes.join(' '))}\` | L${s.line} |`);
      }
      lines.push(``);
    }

    if (html.stylesheets_order.length) {
      lines.push(`### Stylesheet Load Order (${html.stylesheets_order.length})`, ``);
      for (const st of html.stylesheets_order) {
        lines.push(`${st.order}. \`${st.href}\`${st.external ? ' *(external CDN)*' : ''} (L${st.line})`);
      }
      lines.push(``);
    }

    if (html.scripts_order.length) {
      lines.push(`### Script Load Order (${html.scripts_order.length})`, ``);
      for (const sc of html.scripts_order) {
        lines.push(`${sc.order}. \`${sc.src}\`${sc.external ? ' *(external CDN)*' : ''} (L${sc.line})`);
      }
      lines.push(``);
    }

    if (html.inline_handlers.length) {
      lines.push(
        `### Inline Event Handlers (${html.inline_handlers.length})`,
        ``,
        `| Line | Tag / ID | Attribute | Expression | Called Functions |`,
        `|---:|---|---|---|---|`
      );
      for (const h of html.inline_handlers) {
        lines.push(
          `| L${h.line} | \`<${h.tag}${h.element_id ? '#' + h.element_id : ''}>\` | \`${h.attribute}\` | \`${escapeMdCell(h.expression)}\` | ${h.called_functions.map(f => `\`${escapeMdCell(f)}\``).join(', ') || '—'} |`
        );
      }
      lines.push(``);
    }

    if (html.data_attributes.length) {
      lines.push(`### Static \`data-*\` Attributes (${html.data_attributes.length})`, ``);
      lines.push(html.data_attributes.map(d => `\`${d}\``).join(', '), ``);
    }

    if (html.elements_by_id.length) {
      lines.push(
        `### Static HTML Element IDs (${html.elements_by_id.length})`,
        ``,
        html.elements_by_id.map(e => `\`#${e.id}\` (L${e.line})`).join(', '),
        ``
      );
    }
  }

  lines.push(
    `## Browser Storage, IndexedDB & Cookie Accesses (${snapshot.storage_inventory.length})`,
    ``,
    `| Storage Mechanism | Key / Database | Operations | Code Locations |`,
    `|---|---|---|---|`
  );
  for (const s of snapshot.storage_inventory) {
    lines.push(
      `| \`${s.storage_type}\` | \`${escapeMdCell(s.key)}\` | \`${s.operations.join(', ')}\` | ${s.locations.slice(0, 4).map(l => `\`${l}\``).join(', ')} |`
    );
  }

  lines.push(
    ``,
    `## CSS Stylesheets, Custom Properties & Responsive Breakpoints (${snapshot.css_stylesheets.length})`,
    ``,
    `| Stylesheet | Custom Properties Defined | Media Queries | \`!important\` Declarations |`,
    `|---|---:|---:|---:|`
  );
  for (const c of snapshot.css_stylesheets) {
    lines.push(
      `| ${relLinkFromGenerated(c.file)} | ${c.custom_properties.length} | ${c.media_queries.length} | ${c.important_count} |`
    );
  }
  lines.push(``);
  return lines.join('\n');
}

export function renderSchemaInventoryMarkdown(snapshot) {
  const db = snapshot.database;
  const lines = [
    buildGeneratedBanner(snapshot, 'Code Registry — Database Migrations, Tables, RLS & Schema Diagram'),
    `## Schema Provenance`,
    `- **Basis**: \`${db.schema_basis}\` (cross-validated against embedded PostgreSQL via \`node tools/code-registry/cli.mjs validate --verify-db\`)`,
    `- **Migrations Indexed**: **${db.migrations.length}**`,
    `- **Tables Indexed**: **${db.tables.length}** (**${db.tables.filter(t => t.rls_forced).length}** with \`FORCE ROW LEVEL SECURITY\`)`,
    `- **Views / Functions / Triggers**: **${db.views.length}** views, **${db.sql_functions.length}** SQL functions, **${db.triggers.length}** triggers`,
    ``,
    `## 1. Ordered SQL Migration Ledger`,
    ``,
    `| # | Migration File | SHA-256 (First 16) | Tables Created | Tables Altered | RLS Policies Added | Seed Data? |`,
    `|---:|---|---|---|---|---|---|`
  ];

  for (const m of db.migrations) {
    lines.push(
      `| ${m.sequence_number ?? '—'} | ${relLinkFromGenerated(`migrations/${m.filename}`)} | \`${m.sha256.slice(0, 16)}\` | ${m.tables_created.map(t => `\`${t}\``).join(', ') || '—'} | ${m.tables_altered.map(t => `\`${t}\``).join(', ') || '—'} | ${m.policies_created.length} | ${m.contains_seed_data ? 'Yes' : 'No'} |`
    );
  }

  lines.push(
    ``,
    `## 2. Entity-Relationship Diagram (Generated from Foreign Keys)`,
    ``,
    '```mermaid',
    db.mermaid_er_diagram,
    '```',
    ``,
    `## 3. Reconstructed Table & RLS Catalog (${db.tables.length} Tables)`,
    ``
  );

  for (const t of db.tables) {
    lines.push(
      `### Table \`${t.table_name}\``,
      `- **Created in**: \`${t.created_in_migration || 'unknown'}\`${t.altered_in_migrations.length ? ` | **Altered in**: ${t.altered_in_migrations.map(m => `\`${m}\``).join(', ')}` : ''}`,
      `- **Row-Level Security**: Enabled = \`${t.rls_enabled}\`, Forced = \`${t.rls_forced}\`${t.app_role_revokes.length ? ` | **Runtime Role Revokes**: \`REVOKE ${t.app_role_revokes.join(', ')}\`` : ''}`,
      ``
    );

    if (t.columns.length) {
      lines.push(
        `| Column | SQL Type | PK | Not Null | Default | Foreign Key | Origin Migration |`,
        `|---|---|---|---|---|---|---|`
      );
      for (const c of t.columns) {
        const fk = c.references_table ? `\`${c.references_table}(${c.references_column})\` (${c.on_delete})` : '—';
        lines.push(
          `| \`${c.name}\` | \`${escapeMdCell(c.sql_type)}\` | ${c.primary_key ? 'PK' : '—'} | ${c.not_null ? 'Yes' : 'No'} | ${c.default_expr ? `\`${escapeMdCell(c.default_expr)}\`` : '—'} | ${fk} | \`${c.added_in_migration}\` |`
        );
      }
      lines.push(``);
    }

    if (t.indexes.length) {
      lines.push(`- **Indexes (${t.indexes.length})**: ${t.indexes.map(ix => `\`${ix.name}\`${ix.unique ? ' *(UNIQUE)*' : ''}`).join(', ')}`);
    }
    if (t.rls_policies.length) {
      lines.push(`- **RLS Policies (${t.rls_policies.length})**:`);
      for (const p of t.rls_policies) {
        lines.push(
          `  - \`${p.policy_name}\` (\`FOR ${p.command}\`, GUCs: ${p.guc_keys.map(g => `\`${g}\``).join(', ') || 'none'}) — \`${p.migration}\``
        );
      }
    }
    lines.push(``);
  }

  if (db.views.length || db.sql_functions.length || db.triggers.length) {
    lines.push(`## 4. Views, SQL Functions & Triggers`, ``);
    for (const v of db.views) lines.push(`- **View**: \`${v.view_name}\` (\`${v.migration}\`)`);
    for (const fn of db.sql_functions) lines.push(`- **Function**: \`${fn.function_name}(${fn.args})\` (\`${fn.migration}\`)`);
    for (const tr of db.triggers) lines.push(`- **Trigger**: \`${tr.trigger_name}\` (\`${tr.timing} ${tr.events} ON ${tr.table_name}\`, \`${tr.migration}\`)`);
    lines.push(``);
  }

  return lines.join('\n');
}

export function renderDriftReportMarkdown(snapshot) {
  const active = snapshot.drift_report.findings.filter(f => !f.suppressed);
  const suppressed = snapshot.drift_report.findings.filter(f => f.suppressed);

  const lines = [
    buildGeneratedBanner(snapshot, 'Code Registry — Automated Baseline Drift & Discrepancy Report'),
    `- **Active Findings**: **${active.length}**`,
    `- **Scoped Suppressions Applied**: **${suppressed.length}** (configured in [suppressions.json](../../../tools/code-registry/suppressions.json))`,
    `- **Human-Curated Architectural & Cross-Branch Drift**: See [KNOWN-DRIFT.md](../KNOWN-DRIFT.md)`,
    ``,
    `> [!IMPORTANT]`,
    `> **Zero-Deletion Invariant**: Suspected orphan or duplicate findings in this report are diagnostic evidence only. Never delete runtime routes, files, or helpers without explicit product authorization and cross-branch impact verification.`,
    ``,
    `## 1. Active Findings (${active.length})`,
    ``
  ];

  for (const f of active) {
    lines.push(
      `### \`${f.finding_id}\``,
      `- **Category**: \`${f.category}\` | **Severity**: \`${f.severity}\` | **Confidence**: \`${f.confidence}\` (\`${f.determination}\`)`,
      `- **Affected Objects**: ${f.affected_objects.map(o => `\`${o}\``).join(', ')}`,
      `- **Evidence**: ${f.evidence}`,
      `- **Potential Impact**: ${f.potential_impact}`,
      `- **Suggested Verification**: ${f.suggested_verification}`,
      `- **Proposed Remediation**: ${f.proposed_remediation}`,
      `- **False-Positive Considerations**: ${f.false_positive_considerations}`,
      ``
    );
  }

  if (suppressed.length) {
    lines.push(`## 2. Audited Scoped Suppressions (${suppressed.length})`, ``);
    for (const s of suppressed) {
      lines.push(
        `- **\`${s.finding_id}\`** (Suppression \`${s.suppression_id}\`): ${s.suppression_reason} — *Evidence*: ${s.evidence}`
      );
    }
    lines.push(``);
  }

  return lines.join('\n');
}

export function buildDriftBaselineJson(snapshot) {
  const active = snapshot.drift_report.findings.filter(f => !f.suppressed);
  return {
    schema_version: DRIFT_SCHEMA_VERSION,
    branch_at_generation: snapshot.provenance.branch_or_ref,
    deterministic_digest_sha256: snapshot.deterministic_digest_sha256,
    baseline_finding_ids: active.map(f => f.finding_id).sort(),
    high_confidence_blocking_categories: [
      'DUPLICATE_HTML_ID',
      'UNRESOLVED_INLINE_HANDLER',
      'UNREGISTERED_FEATURE_KEY',
      'INVALID_WRITE_PAUSE_SCOPE',
      'MIGRATION_SEQUENCE_COLLISION',
      'MODULE_CYCLE',
      'BROKEN_DOC_LINK'
    ]
  };
}

export function writeGeneratedDocsAndBaseline(rootDir, snapshot, { updateBaseline = true } = {}) {
  const absRoot = path.resolve(rootDir);
  const genDir = path.join(absRoot, 'docs', 'engineering', 'generated');
  const schemasDir = path.join(absRoot, 'docs', 'engineering', 'schemas');
  fs.mkdirSync(genDir, { recursive: true });
  fs.mkdirSync(schemasDir, { recursive: true });

  const written = [];
  const filesToWrite = [
    {
      rel: 'docs/engineering/generated/registry-summary.json',
      content: deterministicStringify(buildCompactRegistrySummary(snapshot), true)
    },
    {
      rel: 'docs/engineering/generated/SYMBOL-INDEX.md',
      content: renderSymbolIndexMarkdown(snapshot)
    },
    {
      rel: 'docs/engineering/generated/ROUTE-INVENTORY.md',
      content: renderRouteInventoryMarkdown(snapshot)
    },
    {
      rel: 'docs/engineering/generated/FRONTEND-INVENTORY.md',
      content: renderFrontendInventoryMarkdown(snapshot)
    },
    {
      rel: 'docs/engineering/generated/SCHEMA-INVENTORY.md',
      content: renderSchemaInventoryMarkdown(snapshot)
    },
    {
      rel: 'docs/engineering/generated/DRIFT-REPORT.md',
      content: renderDriftReportMarkdown(snapshot)
    }
  ];

  if (updateBaseline) {
    filesToWrite.push({
      rel: 'docs/engineering/schemas/drift-baseline.json',
      content: deterministicStringify(buildDriftBaselineJson(snapshot), true)
    });
  }

  for (const item of filesToWrite) {
    const absPath = path.join(absRoot, item.rel);
    fs.writeFileSync(absPath, item.content, 'utf8');
    written.push(item.rel);
  }

  return written;
}
