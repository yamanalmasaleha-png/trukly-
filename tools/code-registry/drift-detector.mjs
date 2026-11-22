// BiteShark Code Registry — Evidence-Based Drift, Duplicate, Orphan & Link Detector
// (`tools/code-registry/drift-detector.mjs`)

import path from 'node:path';
import { toPosixPath } from './schema-versions.mjs';

const BUILTIN_BROWSER_OR_DOM_IDENTIFIERS = new Set([
  'alert',
  'confirm',
  'console.log',
  'console.warn',
  'console.error',
  'encodeURIComponent',
  'decodeURIComponent',
  'event.preventDefault',
  'event.stopPropagation',
  'history.back',
  'location.reload',
  'navigator.clipboard.writeText',
  'window.close',
  'window.open',
  'window.print',
  'window.scrollTo',
  'String',
  'Number',
  'Boolean',
  'Date.now',
  'Math.max',
  'Math.min',
  'Math.round',
  'JSON.stringify',
  'JSON.parse',
  'setTimeout',
  'clearTimeout'
]);

const RUNTIME_ONLY_NODE_ENV_ALLOWLIST = new Set([
  'NODE_ENV',
  'NODE_PATH',
  'PATH',
  'HOME',
  'USERPROFILE',
  'TMPDIR',
  'TEMP',
  'TMP',
  'CHROME_BIN',
  'CI',
  'GITHUB_ACTIONS'
]);

function makeStableFindingId(category, primaryKey) {
  const cleanKey = String(primaryKey || 'root')
    .replace(/[^A-Za-z0-9_./#-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 96);
  return `DRIFT:${category}:${cleanKey}`;
}

export function applyScopedSuppressions(findings, suppressions = []) {
  const activeSuppressions = Array.isArray(suppressions) ? suppressions : [];
  const applied = [];

  const decorated = findings.map(f => {
    const match = activeSuppressions.find(s => {
      if (s.finding_id && s.finding_id === f.finding_id) return true;
      if (s.category && s.category !== f.category) return false;
      if (s.target && !f.affected_objects.includes(s.target)) return false;
      if (s.scope_prefix && !f.affected_objects.some(o => o.startsWith(s.scope_prefix))) return false;
      return Boolean(s.category && (s.target || s.scope_prefix));
    });

    if (!match) {
      return { ...f, suppressed: false, suppression_id: null, suppression_reason: null };
    }
    applied.push({ finding_id: f.finding_id, suppression_id: match.id });
    return {
      ...f,
      suppressed: true,
      suppression_id: match.id || 'SUPP_UNNAMED',
      suppression_reason: match.reason || 'Explicitly suppressed with scope.'
    };
  });

  return { findings: decorated, applied_suppressions: applied };
}

export function validateMarkdownLinks({ markdownFilesByPath, allRepoPathsSet }) {
  const brokenLinks = [];

  for (const [mdPath, content] of markdownFilesByPath.entries()) {
    if (mdPath.startsWith('docs/archive/')) continue;
    // Strip fenced code blocks so example links inside ```markdown blocks do not false-trigger
    const withoutCodeBlocks = content.replace(/```[\s\S]*?```/g, match => '\n'.repeat(match.split('\n').length - 1));
    const lines = withoutCodeBlocks.split('\n');
    const dir = path.posix.dirname(mdPath);

    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx];
      for (const m of line.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
        const rawTarget = m[1].trim().replace(/^<|>$/g, '').split(/\s+/)[0];
        if (
          !rawTarget ||
          rawTarget.startsWith('#') ||
          /^(https?:|mailto:|tel:|data:|javascript:|conversation:|file:)/i.test(rawTarget)
        ) {
          continue;
        }
        const [relPart] = rawTarget.split('#');
        if (!relPart) continue;
        const cleanRel = relPart.split('?')[0];
        const resolved = toPosixPath(
          cleanRel.startsWith('/') ? cleanRel.slice(1) : path.posix.normalize(path.posix.join(dir === '.' ? '' : dir, cleanRel))
        );
        const dirReadme = `${resolved}/README.md`;
        if (!allRepoPathsSet.has(resolved) && !allRepoPathsSet.has(dirReadme)) {
          brokenLinks.push({
            source_file: mdPath,
            line: idx + 1,
            raw_link: rawTarget,
            resolved_path: resolved
          });
        }
      }
    }
  }

  brokenLinks.sort((a, b) => a.source_file.localeCompare(b.source_file) || a.line - b.line);
  return brokenLinks;
}

export function detectRepositoryDrift({
  commitSha,
  jsAnalyses,
  htmlAnalyses,
  cssAnalyses,
  routes,
  featureContract,
  schemaInfo,
  documentedConfigKeys = new Set(),
  markdownFilesByPath = new Map(),
  allRepoPathsSet = new Set(),
  suppressions = []
}) {
  const rawFindings = [];

  // 1. Duplicate HTML IDs within the same document (`high` severity, `high` confidence)
  for (const html of htmlAnalyses) {
    for (const dup of html.duplicate_ids) {
      rawFindings.push({
        finding_id: makeStableFindingId('DUPLICATE_HTML_ID', `${html.file}#${dup.id}`),
        category: 'DUPLICATE_HTML_ID',
        severity: 'high',
        confidence: 'high',
        determination: 'parsed_html',
        source_commit: commitSha,
        affected_objects: [`${html.file}#${dup.id}`],
        evidence: `HTML id="${dup.id}" is declared at both line ${dup.first_line} and line ${dup.duplicate_line} in ${html.file}.`,
        potential_impact: 'document.getElementById() returns only the first node, causing silent listener or state failures on the duplicate node.',
        suggested_verification: `Inspect ${html.file} lines ${dup.first_line} and ${dup.duplicate_line}.`,
        proposed_remediation: 'Assign unique IDs or convert repeated hooks to class/data-* attributes.',
        false_positive_considerations: 'None inside a single static HTML document.'
      });
    }
  }

  // Build HTML page -> loaded JS scopes so DOM & inline-handler checks respect per-page context (`index.html` vs `admin.html` vs `login.html`)
  const jsByPath = new Map(jsAnalyses.map(j => [j.file, j]));
  const allStaticDomIds = new Set();
  const allDynamicDomIds = new Set();
  const dynamicIdPrefixes = [];

  for (const h of htmlAnalyses) {
    for (const el of h.elements_by_id) allStaticDomIds.add(el.id);
  }
  for (const j of jsAnalyses) {
    for (const d of j.dynamic_dom_definitions || []) {
      if (d.id.endsWith('*')) {
        const pref = d.id.slice(0, -1);
        if (pref.length >= 2) dynamicIdPrefixes.push(pref);
      } else if (d.id) {
        allDynamicDomIds.add(d.id);
      }
    }
    // Also scan string literals in public/*.js for dynamically constructed IDs like `'fc-state-' + key` or `id="${...}"`
  }

  // 2. Competing / Reassigned Browser Globals across `public/*.js` loaded together in `public/index.html`
  const indexHtml = htmlAnalyses.find(h => h.file === 'public/index.html');
  const indexLoadedScripts = (indexHtml?.scripts_order || [])
    .filter(s => !s.external)
    .map(s => toPosixPath(path.posix.join('public', s.src.replace(/^\//, ''))));

  const globalsMap = new Map();
  for (const scriptPath of indexLoadedScripts) {
    const ja = jsByPath.get(scriptPath);
    if (!ja) continue;
    for (const g of ja.globals_assigned) {
      if (!globalsMap.has(g.name)) globalsMap.set(g.name, []);
      globalsMap.get(g.name).push(g);
    }
  }
  for (const [gName, defs] of [...globalsMap.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const distinctFiles = [...new Set(defs.map(d => d.file))];
    if (distinctFiles.length > 1) {
      const isIntentionalWrapper = defs.some(d => d.kind === 'browser_global_reassignment');
      rawFindings.push({
        finding_id: makeStableFindingId('COMPETING_BROWSER_GLOBAL', gName),
        category: isIntentionalWrapper ? 'LOAD_ORDER_GLOBAL_WRAPPER' : 'COMPETING_BROWSER_GLOBAL',
        severity: isIntentionalWrapper ? 'medium' : 'high',
        confidence: 'high',
        determination: 'parsed_ast',
        source_commit: commitSha,
        affected_objects: distinctFiles.map(f => `${f}#${gName}`),
        evidence: `Browser global "${gName}" is defined or reassigned across multiple scripts loaded in public/index.html: ${defs.map(d => `${d.file}:L${d.line} (${d.kind})`).join(', ')}.`,
        potential_impact: isIntentionalWrapper
          ? `Execution depends strictly on <script> load order in public/index.html; reordering scripts breaks wrapper chaining on ${gName}.`
          : `Later script silently overwrites ${gName} defined by an earlier script.`,
        suggested_verification: `Check script order in public/index.html and callers of ${gName}.`,
        proposed_remediation: isIntentionalWrapper
          ? 'Preserve documented load order or migrate post-render hooks to explicit event/callback registration in future refactors.'
          : 'Namespace module-private state inside an IIFE or distinct window.biteshark* namespace.',
        false_positive_considerations: 'Intentional post-render decorator wrappers (such as openDetail) are load-order-sensitive design patterns rather than accidental bugs.'
      });
    }
  }

  // 3. Inline HTML Event Handlers Without Resolvable Global Function
  for (const html of htmlAnalyses) {
    const pageScripts = html.scripts_order
      .filter(s => !s.external)
      .map(s => {
        const cleanSrc = s.src.split('?')[0];
        return cleanSrc.startsWith('/')
          ? toPosixPath(path.posix.join('public', cleanSrc.slice(1)))
          : toPosixPath(path.posix.join(path.posix.dirname(html.file), cleanSrc));
      });
    const availableGlobals = new Set();
    for (const sp of pageScripts) {
      const ja = jsByPath.get(sp);
      if (!ja) continue;
      for (const g of ja.globals_assigned) availableGlobals.add(g.name);
      for (const s of ja.symbols) {
        if (s.top_level) availableGlobals.add(s.name);
      }
    }
    for (const inl of html.inline_scripts || []) {
      for (const s of inl.symbols || []) {
        if (s.top_level) availableGlobals.add(s.name);
      }
      for (const g of inl.globals_assigned || []) availableGlobals.add(g.name);
    }

    for (const h of html.inline_handlers) {
      for (const fn of h.called_functions) {
        if (BUILTIN_BROWSER_OR_DOM_IDENTIFIERS.has(fn) || fn.startsWith('window.') || fn.startsWith('this.') || fn.startsWith('document.')) {
          continue;
        }
        const rootName = fn.split('.')[0];
        if (!availableGlobals.has(fn) && !availableGlobals.has(rootName)) {
          rawFindings.push({
            finding_id: makeStableFindingId('UNRESOLVED_INLINE_HANDLER', `${html.file}:L${h.line}#${fn}`),
            category: 'UNRESOLVED_INLINE_HANDLER',
            severity: 'high',
            confidence: 'high',
            determination: 'parsed_html_and_ast',
            source_commit: commitSha,
            affected_objects: [`${html.file}:L${h.line}`, fn],
            evidence: `Inline ${h.attribute}="${h.expression}" at ${html.file}:L${h.line} invokes "${fn}", which is not defined at top level or on window in any script loaded by ${html.file}.`,
            potential_impact: 'User interaction throws ReferenceError at runtime.',
            suggested_verification: `Verify ${html.file} script tags and global symbol "${fn}".`,
            proposed_remediation: 'Expose the handler on window or bind via addEventListener inside the owning module.',
            false_positive_considerations: 'Guarded typeof checks (`if (typeof fn === "function") fn()`) avoid ReferenceError when an optional script is omitted.'
          });
        }
      }
    }
  }

  // 4. Static `getElementById(...)` References to Absent DOM Elements
  for (const ja of jsAnalyses) {
    if (!ja.file.startsWith('public/')) continue;
    for (const ref of ja.dom_references) {
      if (ref.method !== 'getElementById' || ref.dynamic || !ref.selector || ref.selector === '<dynamic>') continue;
      const targetId = ref.selector;
      const matchesStatic = allStaticDomIds.has(targetId);
      const matchesDynamic =
        allDynamicDomIds.has(targetId) || dynamicIdPrefixes.some(pref => targetId.startsWith(pref));
      if (!matchesStatic && !matchesDynamic) {
        rawFindings.push({
          finding_id: makeStableFindingId('MISSING_DOM_TARGET', `${ja.file}#${targetId}`),
          category: 'MISSING_DOM_TARGET',
          severity: 'medium',
          confidence: 'medium',
          determination: 'parsed_ast_vs_html',
          source_commit: commitSha,
          affected_objects: [`${ja.file}:L${ref.line}`, `#${targetId}`],
          evidence: `${ja.file}:L${ref.line} (${ref.caller}) calls getElementById('${targetId}'), which does not appear in static public/*.html or detected innerHTML templates.`,
          potential_impact: 'Null return value; if unguarded, causes TypeError or dead UI wiring.',
          suggested_verification: `Search public/ for "${targetId}" and check whether ${ja.file} guards for null or dynamically creates the element via createElement().`,
          proposed_remediation: 'Keep explicit null guard if optional/dynamically created via createElement(), or remove obsolete DOM lookup.',
          false_positive_considerations: 'Elements created imperatively via document.createElement() + el.id = "..." (such as lazy error boxes) are valid runtime targets.'
        });
      }
    }
  }

  // 5. Duplicated Shared Helper Implementations (e.g., HTML escape helpers, fetch wrappers)
  const htmlEscapeImpls = [];
  for (const ja of jsAnalyses) {
    if (ja.file.startsWith('tests/')) continue;
    for (const sym of ja.symbols) {
      if (/^(esc|escapeHtml|escapeHtmlSafe|rxEsc|admEsc|pagerEscape|smartEscape|guidesEscape|guidePassportHtmlEscape|communityEscape|streetEscape|whispersEsc|loginEsc|dbgEsc)$/i.test(sym.name)) {
        htmlEscapeImpls.push(`${ja.file}:${sym.name}@L${sym.start_line}`);
      }
    }
  }
  if (htmlEscapeImpls.length >= 3) {
    rawFindings.push({
      finding_id: makeStableFindingId('DUPLICATE_HELPER_IMPLEMENTATION', 'html_escape_helpers'),
      category: 'DUPLICATE_HELPER_IMPLEMENTATION',
      severity: 'low',
      confidence: 'high',
      determination: 'parsed_ast',
      source_commit: commitSha,
      affected_objects: htmlEscapeImpls,
      evidence: `${htmlEscapeImpls.length} separate HTML-escaping helper functions exist across frontend/backend modules: ${htmlEscapeImpls.join(', ')}.`,
      potential_impact: 'Inconsistent character escaping (e.g., omitting single-quote &#39; or null coercion) can introduce XSS or display bugs if a weaker variant is copied.',
      suggested_verification: 'Inspect each escape helper to confirm all 5 characters (&, <, >, ", \') and nullish inputs are handled.',
      proposed_remediation: 'Retain existing helpers to avoid churn; for new frontend modules, reuse a single canonical 5-entity escape helper.',
      false_positive_considerations: 'IIFE-encapsulated browser scripts intentionally keep tiny local esc() functions to remain zero-build.'
    });
  }

  // 6. Unregistered Feature Control Keys Referenced in Code
  const registeredFeatureKeys = new Set((featureContract?.features || []).map(f => f.key));
  if (registeredFeatureKeys.size > 0) {
    for (const ja of jsAnalyses) {
      if (ja.file.startsWith('tests/')) continue;
      for (const fk of ja.feature_key_refs) {
        if (!registeredFeatureKeys.has(fk.feature_key)) {
          rawFindings.push({
            finding_id: makeStableFindingId('UNREGISTERED_FEATURE_KEY', `${ja.file}#${fk.feature_key}`),
            category: 'UNREGISTERED_FEATURE_KEY',
            severity: 'high',
            confidence: 'high',
            determination: 'parsed_ast',
            source_commit: commitSha,
            affected_objects: [`${ja.file}:L${fk.line}`, fk.feature_key],
            evidence: `${ja.file}:L${fk.line} checks feature key "${fk.feature_key}" via ${fk.helper}, which is not registered in FEATURE_CONTROLS_REGISTRY.`,
            potential_impact: 'Feature check falls back to default/unknown state and cannot be governed from /admin#features.',
            suggested_verification: `Check lib/feature-controls.js FEATURE_CONTROLS_REGISTRY for "${fk.feature_key}".`,
            proposed_remediation: 'Register the feature key in lib/feature-controls.js or correct the key typo.',
            false_positive_considerations: 'None for static literal feature-key lookups.'
          });
        }
      }
    }
  }

  // 6B. Invalid Write-Pause Scopes (`isWritePaused(...)` vs `VALID_WRITE_PAUSE_SCOPES` in `lib/authz.js`)
  const validPauseScopes = new Set(['bookings', 'pagers', 'community', 'owner', 'notifications', 'all']);
  for (const ja of jsAnalyses) {
    if (ja.file.startsWith('tests/')) continue;
    for (const wp of ja.write_pause_refs || []) {
      if (!validPauseScopes.has(wp.scope)) {
        rawFindings.push({
          finding_id: makeStableFindingId('INVALID_WRITE_PAUSE_SCOPE', `${ja.file}#${wp.scope}`),
          category: 'INVALID_WRITE_PAUSE_SCOPE',
          severity: 'high',
          confidence: 'high',
          determination: 'parsed_ast',
          source_commit: commitSha,
          affected_objects: [`${ja.file}:L${wp.line}`, 'lib/authz.js#VALID_WRITE_PAUSE_SCOPES'],
          evidence: `${ja.file}:L${wp.line} calls isWritePaused("${wp.scope}"), which is not in VALID_WRITE_PAUSE_SCOPES (bookings, pagers, community, owner, notifications, all).`,
          potential_impact: `Setting BITESHARK_PAUSE_WRITES=${wp.scope} triggers inspectWritePauseConfig() failClosedAll=true, halting ALL mutations across every domain.`,
          suggested_verification: `Inspect ${ja.file}:L${wp.line} and lib/authz.js:120-166.`,
          proposed_remediation: `Add "${wp.scope}" to VALID_WRITE_PAUSE_SCOPES in lib/authz.js (or map favorites to an approved scope) in a dedicated runtime fix PR.`,
          false_positive_considerations: 'None.'
        });
      }
    }
  }

  // 7. Undocumented Configuration Keys Read in Application Code
  if (documentedConfigKeys.size > 0) {
    const seenUndoc = new Set();
    for (const ja of jsAnalyses) {
      if (ja.file.startsWith('tests/')) continue;
      for (const env of ja.env_reads) {
        if (RUNTIME_ONLY_NODE_ENV_ALLOWLIST.has(env.key)) continue;
        if (!documentedConfigKeys.has(env.key) && !seenUndoc.has(env.key)) {
          seenUndoc.add(env.key);
          rawFindings.push({
            finding_id: makeStableFindingId('UNDOCUMENTED_CONFIG_VAR', env.key),
            category: 'UNDOCUMENTED_CONFIG_VAR',
            severity: 'medium',
            confidence: 'high',
            determination: 'parsed_ast_vs_contract',
            source_commit: commitSha,
            affected_objects: [`${ja.file}:L${env.line}`, env.key],
            evidence: `Environment variable "${env.key}" is read in ${ja.file}:L${env.line} (${env.via}) without an entry in docs/engineering/contracts/configuration-keys.json.`,
            potential_impact: 'Operators or staging environments may omit or misconfigure an undocumented runtime variable.',
            suggested_verification: `Inspect ${ja.file}:L${env.line} and deploy/*.env.example.`,
            proposed_remediation: 'Document the configuration key, default, validation, and secret classification in docs/engineering/contracts/configuration-keys.json and CONFIGURATION.md.',
            false_positive_considerations: 'Test-only fault injection variables should be scoped to tests or explicitly marked test_only in configuration-keys.json.'
          });
        }
      }
    }
  }

  // 8. Migration Sequence Prefix Collisions (`migrations/*.sql`)
  const migBySeq = new Map();
  for (const m of schemaInfo?.migrations || []) {
    if (m.sequence_number === null) continue;
    if (!migBySeq.has(m.sequence_number)) migBySeq.set(m.sequence_number, []);
    migBySeq.get(m.sequence_number).push(m.filename);
  }
  for (const [seq, files] of migBySeq.entries()) {
    if (files.length > 1) {
      rawFindings.push({
        finding_id: makeStableFindingId('MIGRATION_SEQUENCE_COLLISION', String(seq).padStart(3, '0')),
        category: 'MIGRATION_SEQUENCE_COLLISION',
        severity: 'high',
        confidence: 'high',
        determination: 'parsed_migrations',
        source_commit: commitSha,
        affected_objects: files.map(f => `migrations/${f}`),
        evidence: `Multiple SQL migrations share numeric sequence prefix ${String(seq).padStart(3, '0')}: ${files.join(', ')}.`,
        potential_impact: 'Lexical execution order across branches becomes ambiguous and risks schema conflict during cross-branch merges.',
        suggested_verification: 'Inspect migrations/ directory across both active staging branches before merging.',
        proposed_remediation: 'Renumber unapplied branch migration before merging into working/biteshark-vps (never rename already-applied staging migrations).',
        false_positive_considerations: 'None.'
      });
    }
  }

  // 9. ESM Module Import Cycles (`api/`, `lib/`, `server/`, `packages/`)
  const adj = new Map();
  for (const ja of jsAnalyses) {
    if (!/^(api|lib|server|packages)\//.test(ja.file)) continue;
    const deps = [];
    for (const imp of ja.imports) {
      if (imp.kind === 'esm_import' && imp.source.startsWith('.')) {
        const resolved = toPosixPath(path.posix.normalize(path.posix.join(path.posix.dirname(ja.file), imp.source)));
        deps.push(resolved);
      }
    }
    adj.set(ja.file, deps);
  }
  const visited = new Set();
  const stack = [];
  const inStack = new Set();
  const recordedCycles = new Set();

  function dfs(u) {
    visited.add(u);
    stack.push(u);
    inStack.add(u);
    for (const v of adj.get(u) || []) {
      if (!adj.has(v)) continue;
      if (!visited.has(v)) {
        dfs(v);
      } else if (inStack.has(v)) {
        const cycleSlice = stack.slice(stack.indexOf(v));
        const minRot = [...cycleSlice].sort()[0];
        const rotIdx = cycleSlice.indexOf(minRot);
        const canonical = [...cycleSlice.slice(rotIdx), ...cycleSlice.slice(0, rotIdx), minRot].join(' -> ');
        if (!recordedCycles.has(canonical)) {
          recordedCycles.add(canonical);
          rawFindings.push({
            finding_id: makeStableFindingId('MODULE_CYCLE', canonical),
            category: 'MODULE_CYCLE',
            severity: 'high',
            confidence: 'high',
            determination: 'parsed_ast',
            source_commit: commitSha,
            affected_objects: cycleSlice,
            evidence: `Circular ESM import cycle detected: ${canonical}.`,
            potential_impact: 'Can cause Temporal Dead Zone ReferenceError during module initialization.',
            suggested_verification: 'Trace top-level initialization order across the cycle.',
            proposed_remediation: 'Extract shared constants/types into a leaf module in lib/.',
            false_positive_considerations: 'Function-body-only references across cyclic ESM imports may run at runtime but remain fragile.'
          });
        }
      }
    }
    stack.pop();
    inStack.delete(u);
  }
  for (const mod of [...adj.keys()].sort()) {
    if (!visited.has(mod)) dfs(mod);
  }

  // 10. Broken Internal Markdown Documentation Links (`high` severity, `high` confidence)
  const brokenLinks = validateMarkdownLinks({ markdownFilesByPath, allRepoPathsSet });
  for (const bl of brokenLinks) {
    rawFindings.push({
      finding_id: makeStableFindingId('BROKEN_DOC_LINK', `${bl.source_file}:L${bl.line}->${bl.resolved_path}`),
      category: 'BROKEN_DOC_LINK',
      severity: 'high',
      confidence: 'high',
      determination: 'parsed_markdown',
      source_commit: commitSha,
      affected_objects: [`${bl.source_file}:L${bl.line}`, bl.resolved_path],
      evidence: `${bl.source_file}:L${bl.line} links to "${bl.raw_link}" (resolved: "${bl.resolved_path}"), which does not exist in the repository.`,
      potential_impact: 'Developers and coding assistants follow dead links to nonexistent contracts or runbooks.',
      suggested_verification: `Check ${bl.source_file} line ${bl.line}.`,
      proposed_remediation: 'Update the link path to the existing file or create the missing target document.',
      false_positive_considerations: 'None outside fenced example blocks.'
    });
  }

  // 11. Documentation vs Code Migration Count Drift (`README.md` / `TECH_MAP.md`)
  const maxMig = (schemaInfo?.migrations || []).reduce((acc, m) => Math.max(acc, m.sequence_number || 0), 0);
  const maxMigStr = String(maxMig).padStart(3, '0');
  for (const docFile of ['README.md', 'TECH_MAP.md']) {
    const txt = markdownFilesByPath.get(docFile);
    if (!txt) continue;
    const m = /`001`(?:\s*[–-]\s*|\s+through\s+)`(\d{3})`/.exec(txt);
    if (m && m[1] !== maxMigStr) {
      rawFindings.push({
        finding_id: makeStableFindingId('DOC_CODE_MISMATCH', `${docFile}#migrations_range`),
        category: 'DOC_CODE_MISMATCH',
        severity: 'medium',
        confidence: 'high',
        determination: 'parsed_docs_vs_migrations',
        source_commit: commitSha,
        affected_objects: [docFile, 'migrations/'],
        evidence: `${docFile} states migrations run 001 through ${m[1]}, whereas migrations/ currently contains 001 through ${maxMigStr}.`,
        potential_impact: 'Operators or assistants reading top-level docs underestimate active schema tables (e.g., 022..026+).',
        suggested_verification: `Compare ${docFile} against migrations/ directory.`,
        proposed_remediation: `Refer to docs/engineering/MIGRATIONS.md or update range in ${docFile}.`,
        false_positive_considerations: 'None.'
      });
    }
  }

  // 12. Suspected Unreferenced Domain API Endpoints (`api/*.js` with 0 frontend callers — retained for 30-route parity)
  for (const r of routes || []) {
    if (
      r.dispatcher === 'server/routes.js' &&
      r.path !== '/api/pager/worker' &&
      r.path !== '/api/pager/telemetry' &&
      (!r.known_frontend_callers || r.known_frontend_callers.length === 0)
    ) {
      rawFindings.push({
        finding_id: makeStableFindingId('SUSPECTED_ORPHAN_ROUTE', r.path),
        category: 'SUSPECTED_ORPHAN_ROUTE',
        severity: 'low',
        confidence: 'medium',
        determination: 'parsed_ast_route_callers',
        source_commit: commitSha,
        affected_objects: [r.handler_file, r.path],
        evidence: `Domain route ${r.path} (${r.handler_file}) has 0 detected callers in public/*.js or public/*.html.`,
        potential_impact: 'Unused HTTP surface retained for REGISTERED_DOMAIN_ROUTE_COUNT === 30 invariant; do not delete without updating server/routes.js and healthz tests.',
        suggested_verification: `Search public/ and tests/ for "${r.path}".`,
        proposed_remediation: 'Retain while 30-route parity is enforced; document as unreferenced in API-CONTRACTS.md.',
        false_positive_considerations: 'External or operator CLI tools may call public catalog endpoints directly.'
      });
    }
  }

  rawFindings.sort((a, b) => a.finding_id.localeCompare(b.finding_id));
  return applyScopedSuppressions(rawFindings, suppressions);
}
