// BiteShark Code Registry — Deterministic Markdown & Summary Catalog Generator
// (`tools/code-registry/doc-generator.mjs`)
//
// IMPORTANT (`Section 5`): `writeGeneratedDocs` writes ONLY `docs/engineering/generated/**` and
// NEVER modifies `docs/engineering/schemas/drift-baseline.json`. Baseline debt acceptance is a
// separate, explicit, audited operation (`accept-drift` / `prune-drift`).

import fs from 'node:fs';
import path from 'node:path';
import { deterministicStringify, SUMMARY_SCHEMA_VERSION, asciiCompare } from './schema-versions.mjs';

function relLinkFromGenerated(repoPath, line = null, depthUp = 3) {
  const up = '../'.repeat(depthUp);
  const target = `${up}${repoPath}${line ? `#L${line}` : ''}`;
  return `[${repoPath}${line ? `:L${line}` : ''}](${target})`;
}

function escapeMdCell(val) {
  return String(val ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ')
    .trim();
}

function buildGeneratedBanner(snapshot, title) {
  return [
    `# ${title}`,
    ``,
    `> [!NOTE]`,
    `> **Machine-Generated Reference Inventory** — Do not hand-edit. Regenerate via \`npm run registry:docs\` (\`node tools/code-registry/cli.mjs generate-docs\`).`,
    `> - **Repository**: \`${snapshot.provenance.repository}\``,
    `> - **Provenance Mode**: \`committed_source_digest\` *(branch/detached-HEAD invariant; commit-bound runs use \`npm run registry:scan -- --include-timestamp\`)*`,
    `> - **Generator**: \`${snapshot.generator.name}@${snapshot.generator.version}\` (\`${snapshot.schema_version}\`)`,
    `> - **Source Analysis Digest**: \`${snapshot.source_analysis_digest_sha256}\``,
    `> - **Analysis Scope & Limits**: ${snapshot.generator.limitations_note}`,
    ``
  ].join('\n');
}

export function buildCompactRegistrySummary(snapshot) {
  return {
    schema_version: SUMMARY_SCHEMA_VERSION,
    snapshot_schema_version: snapshot.schema_version,
    provenance_mode: 'committed_source_digest',
    generator: snapshot.generator,
    repository: snapshot.provenance.repository,
    source_analysis_digest_sha256: snapshot.source_analysis_digest_sha256,
    deterministic_digest_sha256: snapshot.deterministic_digest_sha256,
    included_files_manifest_sha256: snapshot.scope.included_files_manifest_sha256,
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
      method_source: r.method_source,
      dispatcher: r.dispatcher,
      handler_file: r.handler_file,
      auth_requirement: r.auth_requirement,
      authorization_summary: r.authorization_summary,
      authorization_confidence: r.authorization_confidence,
      feature_gate: r.feature_gate,
      contract_ids: r.contract_ids || [],
      confirmed_caller_count: (r.known_frontend_callers || []).length,
      contract_test_count: (r.test_references?.contract_mappings || []).length,
      static_http_test_count: (r.test_references?.static_http_call_tests || []).length,
      candidate_test_mention_count: (r.test_references?.candidate_path_mentions || []).length
    })),
    shared_contracts: (snapshot.shared_contracts || []).map(c => ({
      contract_id: c.contract_id,
      title: c.title,
      domain: c.domain,
      implementation_symbols: c.implementation_symbols,
      http_routes: c.http_routes || [],
      db_tables: c.db_tables || []
    })),
    database_tables: snapshot.database.tables.map(t => ({
      table_name: t.table_name,
      created_in_migration: t.created_in_migration,
      column_count: t.columns.length,
      constraint_count: t.constraints.length,
      index_count: t.indexes.length,
      rls_enabled: t.rls_enabled,
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

const SYMBOL_GROUPS = [
  {
    slug: 'server-and-runtime',
    title: 'Server & Runtime Adapter (`server/`, `packages/`)',
    match: f => f.startsWith('server/') || f.startsWith('packages/')
  },
  {
    slug: 'shared-libraries',
    title: 'Shared Backend Libraries (`lib/`)',
    match: f => f.startsWith('lib/')
  },
  {
    slug: 'domain-api-handlers',
    title: 'Domain API Handlers (`api/`)',
    match: f => f.startsWith('api/')
  },
  {
    slug: 'frontend-scripts',
    title: 'Browser Frontend Scripts (`public/`)',
    match: f => f.startsWith('public/')
  },
  {
    slug: 'scripts-and-tooling',
    title: 'Operator Scripts & Code Registry Tooling (`scripts/`, `tools/`)',
    match: f => f.startsWith('scripts/') || f.startsWith('tools/')
  }
];

export function renderSymbolIndexOverviewMarkdown(snapshot) {
  const lines = [
    buildGeneratedBanner(snapshot, 'Code Registry — First-Party Symbol & Module Index'),
    `## Coverage Summary`,
    ``,
    `| Metric | Count |`,
    `|---|---:|`,
    `| JavaScript / CJS / ESM Files Scanned | ${snapshot.coverage_counts.js_files_scanned} |`,
    `| Parse Failures | ${snapshot.coverage_counts.js_parse_failures} |`,
    `| Functions, Methods & Handlers | ${snapshot.coverage_counts.functions_and_methods} |`,
    `| Classes | ${snapshot.coverage_counts.classes} |`,
    `| Top-Level Constants | ${snapshot.coverage_counts.significant_constants} |`,
    `| Browser Globals & Window Registrations | ${snapshot.coverage_counts.browser_globals_and_assignments} |`,
    `| Confirmed Static Call Edges | ${snapshot.coverage_counts.confirmed_call_edges} |`,
    `| Inferred Candidate Call Edges | ${snapshot.coverage_counts.inferred_call_edges} |`,
    ``,
    `> **Navigation & Exact Lookup**: Every module and symbol is listed **without truncation** in the 5 area catalogs below. For connected terminal/assistant lookups (showing callers, callees, contracts, routes, tables, and test evidence), run \`npm run registry:locate -- <identifier>\`.`,
    ``,
    `## Complete Non-Truncated Symbol Catalogs by Area`,
    ``,
    `| Area Catalog | Modules | Indexed Symbols | Exports |`,
    `|---|---:|---:|---:|`
  ];

  for (const grp of SYMBOL_GROUPS) {
    const mods = snapshot.js_modules.filter(m => grp.match(m.file));
    const symCount = mods.reduce((s, m) => s + m.symbols.length, 0);
    const expCount = mods.reduce((s, m) => s + m.exports.length, 0);
    lines.push(
      `| [${grp.title}](symbols/${grp.slug}.md) | ${mods.length} | ${symCount} | ${expCount} |`
    );
  }

  lines.push(``, `## Module Directory`, ``, `| Module | Area Catalog | Symbols | Exported / Window Globals |`, `|---|---|---:|---|`);
  for (const grp of SYMBOL_GROUPS) {
    for (const mod of snapshot.js_modules.filter(m => grp.match(m.file))) {
      const expSummary = [
        ...mod.exports.map(e => e.name),
        ...mod.globals_assigned
          .filter(g => g.kind === 'explicit_window_property' || g.kind === 'browser_global_reassignment')
          .map(g => `window.${g.name}`)
      ]
        .slice(0, 8)
        .map(x => `\`${escapeMdCell(x)}\``)
        .join(', ');
      lines.push(
        `| ${relLinkFromGenerated(mod.file)} | [${grp.slug}.md](symbols/${grp.slug}.md) | ${mod.symbols.length} | ${expSummary || '—'} |`
      );
    }
  }
  lines.push(``);
  return lines.join('\n');
}

export function renderSymbolAreaCatalogMarkdown(snapshot, grp) {
  const mods = snapshot.js_modules.filter(m => grp.match(m.file));
  const lines = [
    buildGeneratedBanner(snapshot, `Symbol Catalog — ${grp.title}`),
    `- [← Back to Symbol & Module Index](../SYMBOL-INDEX.md)`,
    `- **Relationship Labels**: \`confirmed\` = resolved via lexical scope, explicit ESM/CJS import/alias, unique \`window.*\` namespace, or page-level script binding. \`candidate\` = ambiguous multi-script or unverified member call (never conflated as confirmed).`,
    ``
  ];

  for (const mod of mods) {
    lines.push(`## ${relLinkFromGenerated(mod.file, null, 4)} (\`${mod.source_type}\`)`);
    if (mod.imports.length) {
      const deps = [...new Set(mod.imports.map(i => i.source))].sort(asciiCompare);
      lines.push(`- **Imports / Dependencies**: ${deps.map(d => `\`${d}\``).join(', ')}`);
    }
    if (mod.exports.length) {
      lines.push(`- **Exports**: ${mod.exports.map(e => `\`${e.name}\``).join(', ')}`);
    }
    const winGlobals = mod.globals_assigned.filter(
      g => g.kind === 'explicit_window_property' || g.kind === 'browser_global_reassignment'
    );
    if (winGlobals.length) {
      lines.push(
        `- **Explicit Window / Wrapper Globals**: ${winGlobals.map(g => `\`${g.name}\` (${g.kind} @ L${g.line})`).join(', ')}`
      );
    }
    if (mod.constants.length) {
      lines.push(
        `- **Top-Level Constants (${mod.constants.length})**: ${mod.constants.map(c => `\`${c.name}\`${c.exported ? ' *(exported)*' : ''}`).join(', ')}`
      );
    }

    if (mod.symbols.length) {
      lines.push(
        ``,
        `| Symbol | Kind | Exported | Parameters (Observed Basis) | Returns / Throws | Confirmed Callers (Inferred in italics) | Contracts | Lines |`,
        `|---|---|---|---|---|---|---|---|`
      );
      for (const s of mod.symbols) {
        const paramStr = (s.params || []).map(p => `${p.name}: ${p.observed_type}`).join(', ');
        const retStr = `${s.async ? 'async -> ' : ''}${s.return_behavior}${s.throws.length ? ` (throws: ${s.throws.join(', ')})` : ''}`;
        const confCallers = (s.confirmed_callers || []).slice(0, 4).map(c => `\`${escapeMdCell(c)}\``);
        const extraConf = (s.confirmed_callers || []).length > 4 ? ` (+${s.confirmed_callers.length - 4})` : '';
        const infCallers =
          confCallers.length === 0 && (s.inferred_candidate_callers || []).length > 0
            ? ` *candidate: ${(s.inferred_candidate_callers || []).slice(0, 2).map(escapeMdCell).join(', ')}*`
            : '';
        const callerCell = (confCallers.join(', ') + extraConf + infCallers).trim() || '—';
        const ctrs = (s.contract_ids || []).map(cid => `[${cid}](../CONTRACTS-CATALOG.md)`).join(', ') || '—';
        lines.push(
          `| \`${escapeMdCell(s.name)}\` | \`${s.kind}\` | ${s.exported ? 'Yes' : 'No'} | \`(${escapeMdCell(paramStr)})\` | \`${escapeMdCell(retStr)}\` | ${callerCell} | ${ctrs} | ${relLinkFromGenerated(mod.file, s.start_line, 4)} |`
        );
      }
    }
    lines.push(``);
  }

  return lines.join('\n');
}

export function renderContractsCatalogMarkdown(snapshot) {
  const contracts = snapshot.shared_contracts || [];
  const lines = [
    buildGeneratedBanner(snapshot, 'Code Registry — High-Value Shared Contracts Catalog'),
    `Generated from the single maintained contract specification [shared-contracts.json](../contracts/shared-contracts.json) (**${contracts.length}** shared contracts). Do not duplicate these signatures, route lists, or field definitions in prose docs — link here or query \`npm run registry:locate -- <CONTRACT_ID>\`.`,
    ``,
    `| Contract ID | Domain | Title | Primary Implementation Symbols | HTTP Routes |`,
    `|---|---|---|---|---|`
  ];

  for (const c of contracts) {
    const syms = (c.implementation_symbols || []).slice(0, 3).map(s => `\`${escapeMdCell(s)}\``).join(', ');
    const rts = (c.http_routes || []).slice(0, 4).map(r => `\`${escapeMdCell(r)}\``).join(', ') || '—';
    lines.push(`| \`${c.contract_id}\` | \`${c.domain}\` | ${escapeMdCell(c.title)} | ${syms} | ${rts} |`);
  }
  lines.push(``);

  for (const c of contracts) {
    lines.push(
      `## \`${c.contract_id}\` — ${c.title}`,
      `- **Domain**: \`${c.domain}\` | **Shape Basis**: \`${c.shape_evidence_basis}\``,
      `- **Purpose**: ${c.purpose}`,
      `- **Implementation Symbols**: ${(c.implementation_symbols || []).map(s => {
        const [f] = s.split('#');
        return `${relLinkFromGenerated(f)} (\`#${s.split('#')[1] || 'default'}\`)`;
      }).join(', ')}`,
      ...(c.http_routes?.length ? [`- **HTTP Routes**: ${c.http_routes.map(r => `\`${r}\``).join(', ')}`] : []),
      ...(c.db_tables?.length ? [`- **Database Tables / Storage**: ${c.db_tables.map(t => `\`${t}\``).join(', ')}`] : []),
      ...(c.feature_controls?.length ? [`- **Feature Controls**: ${c.feature_controls.map(f => `\`${f}\``).join(', ')}`] : []),
      `- **Permissions & Ownership**: ${c.permissions_and_ownership}`,
      `- **Inputs & Validation**: ${c.inputs_and_validation}`,
      `- **Outputs**: ${c.outputs}`,
      `- **Error Contract**: ${c.errors}`,
      `- **Side Effects**: ${c.side_effects}`,
      `- **Idempotency & Concurrency**: ${c.idempotency_and_concurrency}`,
      `- **Known Consumers**: ${(c.known_consumers || []).map(k => `\`${k}\``).join(', ')}`,
      `- **Compatibility Expectations**: ${c.compatibility_expectations}`,
      `- **Known Limitations**: ${c.known_limitations}`,
      `- **Maintained Test Mappings** *(source mapping only — run suite to verify execution)*:`
    );
    for (const tm of c.test_mappings || []) {
      lines.push(
        `  - ${relLinkFromGenerated(tm.file)} — protects: ${(tm.protected_assertions || []).map(a => `\`${a}\``).join(', ')}`
      );
    }
    lines.push(``);
  }

  return lines.join('\n');
}

export function renderRouteInventoryMarkdown(snapshot) {
  const lines = [
    buildGeneratedBanner(snapshot, 'Code Registry — Backend HTTP Route Inventory'),
    `Extracted via AST branch and registration analysis across \`server/routes.js\`, \`server/app.js\`, \`server/admin-routes.js\`, and \`server/customer-exploration-routes.js\` (**${snapshot.backend_routes.length}** indexed HTTP routes).`,
    ``,
    `> **Evidence Labels**:`,
    `> - **Methods**: \`declared_export\` (\`api/*.js\`), \`confirmed_method_guard\` (\`405\` guard), \`confirmed_method_branches\` (\`method === '...'\`), or \`manual_override\`.`,
    `> - **Test Evidence**: \`contract:\` = maintained mapping in \`shared-contracts.json\`; \`http:\` = static HTTP call in \`tests/*.cjs\`; \`mention:\` = route string occurrence only (candidate lead, not proof of assertion coverage).`,
    ``,
    `| Route Path | Methods (Basis) | Dispatcher | Handler | Auth | Authorization (Evidence) | Feature Enforcement | Confirmed Frontend Callers | Test References |`,
    `|---|---|---|---|---|---|---|---|---|`
  ];

  for (const r of snapshot.backend_routes) {
    const callers =
      (r.known_frontend_callers || []).slice(0, 3).map(c => `\`${escapeMdCell(c)}\``).join(', ') ||
      ((r.inferred_frontend_callers || []).length
        ? `*candidate: ${r.inferred_frontend_callers.slice(0, 2).map(escapeMdCell).join(', ')}*`
        : '*(none in public/)*');

    const feEntries = Object.entries(r.feature_enforcement_by_method || {})
      .map(([m, rule]) => (rule ? `${m}:\`${rule.feature_key}\`(${rule.operation_kind})` : `${m}:exempt`))
      .join(', ');
    const feCell = r.feature_gate ? feEntries : '—';

    const authzEvShort = (r.authorization_evidence || []).slice(0, 2).join(', ');
    const authzCell = `\`${escapeMdCell(r.authorization_summary)}\`${authzEvShort ? ` *(${escapeMdCell(authzEvShort)})*` : ''}`;

    const tRefs = [];
    for (const cm of (r.test_references?.contract_mappings || []).slice(0, 2)) {
      tRefs.push(`contract:\`${path.posix.basename(cm.file)}\``);
    }
    for (const sh of (r.test_references?.static_http_call_tests || []).slice(0, 2)) {
      if (!tRefs.some(x => x.includes(path.posix.basename(sh)))) {
        tRefs.push(`http:\`${path.posix.basename(sh)}\``);
      }
    }
    if (tRefs.length === 0) {
      for (const pm of (r.test_references?.candidate_path_mentions || []).slice(0, 2)) {
        tRefs.push(`mention:\`${path.posix.basename(pm)}\``);
      }
    }

    lines.push(
      `| \`${r.path}\` | \`${r.methods.join(', ')}\` *(${r.method_source})* | \`${r.dispatcher}\` | ${relLinkFromGenerated(r.handler_file, r.line)} | \`${r.auth_requirement}\` | ${authzCell} | ${feCell} | ${callers} | ${tRefs.join(', ') || '—'} |`
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
        lines.push(
          `| \`#${s.id || 'unnamed'}\` | \`<${s.tag}>\` | ${s.active_by_default ? 'Yes' : 'No'} | \`${escapeMdCell(s.classes.join(' '))}\` | L${s.line} |`
        );
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
    `## Schema Provenance & Verification Scope`,
    `- **Static Basis**: \`${db.schema_basis}\` *(reconstructed offline from \`migrations/*.sql\` and \`scripts/run-migrations.cjs\`; this static file alone does **not** prove a live database check ran)*`,
    `- **Live PostgreSQL Catalog Verification**: Run \`node tools/code-registry/cli.mjs validate --verify-db\` (enforced in CI \`postgres-backend-hardening\`) to cross-check reconstructed tables, columns, normalized types, nullability, default presence, primary/unique/foreign-key constraints, indexes, and \`FORCE ROW LEVEL SECURITY\` policies against PostgreSQL \`pg_catalog\`.`,
    `- **Migrations Indexed**: **${db.migrations.length}**`,
    `- **Tables Indexed**: **${db.tables.length}** (**${db.tables.filter(t => t.rls_forced).length}** with \`FORCE ROW LEVEL SECURITY\`)`,
    `- **Views / Functions / Triggers**: **${db.views.length}** views, **${db.sql_functions.length}** SQL functions, **${db.triggers.length}** triggers`,
    ``,
    `## 1. Ordered SQL Migration Ledger`,
    ``,
    `| # | Migration File | SHA-256 (First 16) | Tables Created | Tables Altered | RLS Policies Added | Manual Review Flag |`,
    `|---:|---|---|---|---|---|---|`
  ];

  for (const m of db.migrations) {
    lines.push(
      `| ${m.sequence_number ?? '—'} | ${relLinkFromGenerated(`migrations/${m.filename}`)} | \`${m.sha256.slice(0, 16)}\` | ${m.tables_created.map(t => `\`${t}\``).join(', ') || '—'} | ${m.tables_altered.map(t => `\`${t}\``).join(', ') || '—'} | ${m.policies_created.length} | ${m.requires_manual_migration_review ? 'Yes' : 'No'} |`
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

    if (t.constraints.length) {
      lines.push(
        `- **Constraints (${t.constraints.length})**: ${t.constraints.map(cn => `\`${cn.name || cn.kind}\` (${cn.kind})`).join(', ')}`
      );
    }
    if (t.indexes.length) {
      lines.push(
        `- **Indexes (${t.indexes.length})**: ${t.indexes.map(ix => `\`${ix.name}\`${ix.unique ? ' *(UNIQUE)*' : ''}`).join(', ')}`
      );
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
    for (const tr of db.triggers) {
      lines.push(`- **Trigger**: \`${tr.trigger_name}\` (\`${tr.timing} ${tr.events} ON ${tr.table_name}\`, \`${tr.migration}\`)`);
    }
    lines.push(``);
  }

  return lines.join('\n');
}

export function renderDriftReportMarkdown(snapshot) {
  const active = snapshot.drift_report.findings.filter(f => !f.suppressed);
  const suppressed = snapshot.drift_report.findings.filter(f => f.suppressed);

  const lines = [
    buildGeneratedBanner(snapshot, 'Code Registry — Automated Drift & Discrepancy Report'),
    `- **Active Findings**: **${active.length}** *(compared against audited baseline debt in [drift-baseline.json](../schemas/drift-baseline.json) during \`npm run registry:validate\`)*`,
    `- **Scoped Intentional-Pattern Suppressions**: **${suppressed.length}** *(configured in [suppressions.json](../../../tools/code-registry/suppressions.json))*`,
    `- **Human-Curated Architectural & Cross-Branch Drift**: See [KNOWN-DRIFT.md](../KNOWN-DRIFT.md)`,
    ``,
    `> [!IMPORTANT]`,
    `> **Governance Separation**: Running \`npm run registry:docs\` updates this report for visibility without modifying \`drift-baseline.json\`. Any newly introduced high-confidence blocking finding fails \`npm run registry:validate\` until fixed in code or explicitly accepted with rationale via \`npm run registry:accept-drift -- --finding <ID> --reason "..."\`.`,
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

export function writeGeneratedDocs(rootDir, snapshot) {
  const absRoot = path.resolve(rootDir);
  const genDir = path.join(absRoot, 'docs', 'engineering', 'generated');
  const symDir = path.join(genDir, 'symbols');
  fs.mkdirSync(symDir, { recursive: true });

  const filesToWrite = [
    {
      rel: 'docs/engineering/generated/registry-summary.json',
      content: deterministicStringify(buildCompactRegistrySummary(snapshot), true)
    },
    {
      rel: 'docs/engineering/generated/CONTRACTS-CATALOG.md',
      content: renderContractsCatalogMarkdown(snapshot)
    },
    {
      rel: 'docs/engineering/generated/SYMBOL-INDEX.md',
      content: renderSymbolIndexOverviewMarkdown(snapshot)
    },
    ...SYMBOL_GROUPS.map(grp => ({
      rel: `docs/engineering/generated/symbols/${grp.slug}.md`,
      content: renderSymbolAreaCatalogMarkdown(snapshot, grp)
    })),
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

  const written = [];
  for (const item of filesToWrite) {
    const absPath = path.join(absRoot, item.rel);
    fs.writeFileSync(absPath, item.content, 'utf8');
    written.push(item.rel);
  }
  return written;
}
