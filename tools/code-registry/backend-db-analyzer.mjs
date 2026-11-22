// BiteShark Code Registry — Backend Routes, Feature Controls, Diagnostics & SQL Schema Analyzer
// (`tools/code-registry/backend-db-analyzer.mjs`)

import crypto from 'node:crypto';
import { parseJavaScriptSource } from './js-analyzer.mjs';

function walkAst(node, visitor) {
  if (!node || typeof node.type !== 'string') return;
  visitor(node);
  for (const k of Object.keys(node)) {
    if (k === 'loc' || k === 'start' || k === 'end') continue;
    const ch = node[k];
    if (Array.isArray(ch)) {
      for (const item of ch) {
        if (item && typeof item.type === 'string') walkAst(item, visitor);
      }
    } else if (ch && typeof ch.type === 'string') {
      walkAst(ch, visitor);
    }
  }
}

function unwrapObjectFreeze(node) {
  if (
    node &&
    node.type === 'CallExpression' &&
    node.callee?.type === 'MemberExpression' &&
    node.callee.object?.name === 'Object' &&
    node.callee.property?.name === 'freeze' &&
    node.arguments[0]
  ) {
    return node.arguments[0];
  }
  return node;
}

function evalStaticLiteral(node) {
  const n = unwrapObjectFreeze(node);
  if (!n) return undefined;
  if (n.type === 'Literal') return n.value;
  if (n.type === 'TemplateLiteral' && n.expressions.length === 0) {
    return n.quasis[0]?.value?.cooked ?? '';
  }
  if (n.type === 'UnaryExpression' && n.operator === '-' && n.argument?.type === 'Literal') {
    return -Number(n.argument.value);
  }
  if (n.type === 'ArrayExpression') {
    return n.elements.map(evalStaticLiteral).filter(v => v !== undefined);
  }
  if (n.type === 'NewExpression' && n.callee?.name === 'Set' && n.arguments[0]?.type === 'ArrayExpression') {
    return n.arguments[0].elements.map(evalStaticLiteral).filter(v => v !== undefined);
  }
  if (n.type === 'ObjectExpression') {
    const out = {};
    for (const p of n.properties) {
      if (p.type !== 'Property') continue;
      const key = p.key?.name ?? p.key?.value;
      if (key !== undefined) {
        const v = evalStaticLiteral(p.value);
        if (v !== undefined) out[key] = v;
      }
    }
    return out;
  }
  return undefined;
}

export function extractFeatureControlsContract(source, relPath = 'lib/feature-controls.js') {
  const parsed = parseJavaScriptSource(source, { filePath: relPath });
  if (!parsed.ok) return { features: [], route_rules: [] };

  const features = [];
  const routeRules = [];

  walkAst(parsed.ast, node => {
    if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier') {
      const name = node.id.name;
      const valNode = unwrapObjectFreeze(node.init);
      if (name === 'FEATURE_CONTROLS_REGISTRY' && valNode?.type === 'ArrayExpression') {
        for (const el of valNode.elements) {
          const obj = evalStaticLiteral(el);
          if (obj && obj.key) {
            features.push({
              key: obj.key,
              title: obj.title || obj.key,
              category: obj.category || 'unknown',
              implementation_status: obj.implementation_status || 'implemented',
              read_only: Boolean(obj.read_only),
              default_state: obj.default_state || 'enabled',
              default_audience: obj.default_audience || 'all',
              allowed_states: obj.allowed_states || [],
              allowed_audiences: obj.allowed_audiences || [],
              depends_on: obj.depends_on || [],
              high_impact_interrupt: Boolean(obj.high_impact_interrupt),
              description: obj.description || '',
              file: relPath,
              line: el.loc?.start?.line || 1
            });
          }
        }
      } else if (name === 'ROUTE_FEATURE_ENFORCEMENT_RULES' && valNode?.type === 'ArrayExpression') {
        for (const el of valNode.elements) {
          const obj = evalStaticLiteral(el);
          if (obj && obj.featureKey) {
            routeRules.push({
              path: obj.pathname || obj.path || obj.pathPrefix || '*',
              methods: obj.methods || ['*'],
              feature_key: obj.featureKey,
              operation_kind: obj.operationKind || 'mutation',
              allow_moderators_when_hidden: Boolean(obj.allowModeratorsWhenHidden),
              line: el.loc?.start?.line || 1
            });
          }
        }
      }
    }
  });

  features.sort((a, b) => a.key.localeCompare(b.key));
  return { features, route_rules: routeRules };
}

export function extractDiagnosticsContract(source, relPath = 'lib/diagnostics.js') {
  const parsed = parseJavaScriptSource(source, { filePath: relPath });
  if (!parsed.ok) {
    return {
      allowed_feature_keys: [],
      top_only_feature_keys: [],
      allowed_severities: [],
      allowed_outcomes: [],
      safe_context_keys: []
    };
  }

  const sets = {};
  walkAst(parsed.ast, node => {
    if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier') {
      const val = evalStaticLiteral(node.init);
      if (Array.isArray(val)) {
        sets[node.id.name] = val.map(String).sort();
      }
    }
  });

  return {
    allowed_feature_keys: sets.ALLOWED_FEATURE_KEYS || [],
    top_only_feature_keys: sets.TOP_ONLY_FEATURE_KEYS || [],
    allowed_severities: sets.ALLOWED_SEVERITIES || [],
    allowed_outcomes: sets.ALLOWED_OUTCOMES || [],
    safe_context_keys: sets.SAFE_CONTEXT_KEYS || []
  };
}

export function extractBackendRoutes({ fileContentsByPath, featureRouteRules = [], jsAnalysesByPath = new Map() }) {
  const routes = [];
  const seenKeys = new Set();

  function addRoute(entry) {
    const key = `${entry.path}::${(entry.methods || []).join(',')}`;
    if (seenKeys.has(key)) return;
    seenKeys.add(key);

    // Attach feature gate if matched
    const matchingGate = featureRouteRules.find(
      r => r.path === entry.path || (r.path.endsWith('*') && entry.path.startsWith(r.path.slice(0, -1)))
    );

    routes.push({
      route_id: `route:${entry.path}`,
      path: entry.path,
      methods: entry.methods,
      handler_file: entry.handler_file,
      handler_symbol: entry.handler_symbol || 'default',
      dispatcher: entry.dispatcher,
      auth_requirement: entry.auth_requirement || 'handler_verified',
      authorization_summary: entry.authorization_summary || 'See handler',
      feature_gate: entry.feature_gate || matchingGate?.feature_key || null,
      status_codes: entry.status_codes || [],
      error_codes: entry.error_codes || [],
      db_tables_touched: entry.db_tables_touched || [],
      line: entry.line || 1
    });
  }

  function inspectHandlerDetails(handlerPath) {
    const src = fileContentsByPath.get(handlerPath) || '';
    if (!src) return { methods: ['GET', 'POST'], status_codes: [], error_codes: [], db_tables: [], auth: 'public_or_session', authz: 'handler_enforced' };

    const statuses = new Set();
    const errCodes = new Set();
    const tables = new Set();

    for (const m of src.matchAll(/\bres\.status\(\s*(\d{3})\s*\)|\bsendJson\(\s*(\d{3})\b|\bwriteHead\(\s*(\d{3})\b/g)) {
      const code = Number(m[1] || m[2] || m[3]);
      if (code >= 100 && code <= 599) statuses.add(code);
    }
    for (const m of src.matchAll(/\bcode\s*:\s*['"]([A-Z][A-Z0-9_]{2,})['"]/g)) {
      errCodes.add(m[1]);
    }
    for (const m of src.matchAll(/\b(?:FROM|INTO|UPDATE|JOIN)\s+([a-z][a-z0-9_]{2,})\b/gi)) {
      const tbl = m[1].toLowerCase();
      if (!['select', 'where', 'values', 'set', 'public', 'jsonb_to_recordset', 'unnest'].includes(tbl)) {
        tables.add(tbl);
      }
    }

    let auth = 'public';
    let authz = 'public_read';
    const expAccessMatch = /export\s+const\s+access\s*=\s*['"](user|public)['"]/.exec(src);
    if (expAccessMatch && expAccessMatch[1] === 'user') {
      auth = 'authenticated_14_plus';
      authz = 'account_owner_or_handler_rbac';
    }
    if (/authorizeVendorOperation|requireVendorPermission|assertVendorPermission|resolveOwnerContext/.test(src)) {
      auth = 'authenticated_14_plus';
      authz = 'vendor_membership_or_platform_admin';
    } else if (/isTopAdmin|requirePlatformRole|canModerateCommunity|can_access_admin_portal/.test(src)) {
      auth = 'authenticated_14_plus';
      authz = 'platform_role_top_or_mod';
    } else if (/NOTIFICATION_WORKER_SECRET|WORKER_SECRET|verifyWorkerAuth/.test(src)) {
      auth = 'internal_worker_secret';
      authz = 'loopback_worker_bearer_secret';
    } else if (/auth\.getUser|requireAuthenticatedUser|verifiedUser/.test(src)) {
      auth = 'authenticated_14_plus';
      authz = 'account_owner_rls';
    }

    let methods = [];
    const expMethodsMatch = /export\s+const\s+methods\s*=\s*\[([^\]]+)\]/.exec(src);
    if (expMethodsMatch) {
      methods = [...expMethodsMatch[1].matchAll(/['"]([A-Z]+)['"]/g)].map(x => x[1]);
    }
    if (methods.length === 0) {
      if (/req\.method\s*[!=]==?\s*['"]GET['"]/.test(src)) methods.push('GET');
      if (/req\.method\s*[!=]==?\s*['"]POST['"]/.test(src)) methods.push('POST');
      if (/req\.method\s*[!=]==?\s*['"]PUT['"]/.test(src)) methods.push('PUT');
      if (/req\.method\s*[!=]==?\s*['"]PATCH['"]/.test(src)) methods.push('PATCH');
      if (/req\.method\s*[!=]==?\s*['"]DELETE['"]/.test(src)) methods.push('DELETE');
    }

    return {
      methods: methods.length ? [...new Set(methods)].sort() : ['GET', 'POST'],
      status_codes: [...statuses].sort((a, b) => a - b),
      error_codes: [...errCodes].sort(),
      db_tables: [...tables].sort(),
      auth,
      authz
    };
  }

  // 1. `server/routes.js` explicit domain manifest (30 frozen `api/*.js` routes)
  const routesSrc = fileContentsByPath.get('server/routes.js') || '';
  if (routesSrc) {
    const parsed = parseJavaScriptSource(routesSrc, { filePath: 'server/routes.js' });
    if (parsed.ok) {
      const importMap = new Map();
      for (const stmt of parsed.ast.body) {
        if (stmt.type === 'ImportDeclaration') {
          const spec = stmt.specifiers?.[0];
          const srcRel = String(stmt.source.value || '').replace(/^\.\.\//, '');
          if (spec?.local?.name && srcRel) {
            importMap.set(spec.local.name, srcRel);
          }
        }
      }
      walkAst(parsed.ast, node => {
        // Match `defineRoute('/api/...', importedModule, extraOpts)` in `server/routes.js`
        if (
          node.type === 'CallExpression' &&
          node.callee?.type === 'Identifier' &&
          node.callee.name === 'defineRoute' &&
          node.arguments.length >= 2
        ) {
          const pVal = evalStaticLiteral(node.arguments[0]);
          const hIdent = node.arguments[1]?.name;
          if (typeof pVal === 'string' && pVal.startsWith('/api/')) {
            const handlerFile = importMap.get(hIdent) || `api/${pVal.replace(/^\/api\//, '')}.js`;
            const details = inspectHandlerDetails(handlerFile);
            addRoute({
              path: pVal,
              methods: details.methods,
              handler_file: handlerFile,
              handler_symbol: 'default',
              dispatcher: 'server/routes.js',
              auth_requirement: details.auth,
              authorization_summary: details.authz,
              status_codes: details.status_codes,
              error_codes: details.error_codes,
              db_tables_touched: details.db_tables,
              line: node.loc?.start?.line || 1
            });
          }
        }
      });
    }
  }

  // 2. `server/app.js` built-in platform, auth & health routes
  const appSrc = fileContentsByPath.get('server/app.js') || '';
  if (appSrc) {
    const builtInAppRoutes = [
      { path: '/api/healthz', methods: ['GET'], symbol: 'createStandaloneServer', auth: 'public', authz: 'public_health_probe' },
      { path: '/api/features', methods: ['GET'], symbol: 'handlePublicFeaturesGet', auth: 'public_or_session', authz: 'caller_audience_evaluated' },
      { path: '/api/auth/start', methods: ['POST'], symbol: 'handleAuthStart', auth: 'public', authz: 'csrf_client_header_and_rate_limit' },
      { path: '/api/auth/verify', methods: ['POST'], symbol: 'handleAuthVerify', auth: 'public', authz: 'otp_verification_and_rate_limit' },
      { path: '/api/auth/session', methods: ['GET'], symbol: 'handleAuthSession', auth: 'public_or_session', authz: 'session_cookie_inspection' },
      { path: '/api/auth/age-assessment', methods: ['POST'], symbol: 'handleAuthAgeAssessment', auth: 'authenticated_pending_age', authz: 'self_session_only' },
      { path: '/api/auth/logout', methods: ['POST'], symbol: 'handleAuthLogout', auth: 'public_or_session', authz: 'csrf_origin_checked' },
      { path: '/api/auth/staging-mailbox', methods: ['POST'], symbol: 'handleStagingMailbox', auth: 'internal_mailbox_secret', authz: 'staging_loopback_operator_secret_only' },
      { path: '/api/_staging_gate_probe', methods: ['GET', 'POST'], symbol: 'stagingRuntimeProbe', auth: 'internal_probe_token_and_top_admin', authz: 'staging_flag_plus_operator_token' }
    ];
    for (const br of builtInAppRoutes) {
      const idx = appSrc.indexOf(br.path);
      if (idx !== -1 || br.path.startsWith('/api/auth/')) {
        const line = idx !== -1 ? appSrc.slice(0, idx).split('\n').length : 1;
        addRoute({
          path: br.path,
          methods: br.methods,
          handler_file: br.path.startsWith('/api/auth/') ? 'lib/standalone-auth.js' : 'server/app.js',
          handler_symbol: br.symbol,
          dispatcher: 'server/app.js',
          auth_requirement: br.auth,
          authorization_summary: br.authz,
          line
        });
      }
    }
  }

  // 3. `server/admin-routes.js` & optional `server/customer-exploration-routes.js`
  for (const routerFile of ['server/admin-routes.js', 'server/customer-exploration-routes.js']) {
    const src = fileContentsByPath.get(routerFile);
    if (!src) continue;
    const lines = src.split('\n');
    for (let idx = 0; idx < lines.length; idx++) {
      const lineText = lines[idx];
      for (const m of lineText.matchAll(/(?:normPath|pathname)\s*===\s*['"](\/api\/[A-Za-z0-9/_-]+)['"]/g)) {
        const routePath = m[1];
        const windowSlice = lines.slice(idx, Math.min(lines.length, idx + 85)).join('\n');
        const methods = [];
        for (const mm of windowSlice.matchAll(/\bmethod\s*===\s*['"]([A-Z]+)['"]/g)) {
          methods.push(mm[1]);
        }
        for (const mm of windowSlice.matchAll(/\bmethod\s*!==\s*['"]([A-Z]+)['"]\s*\)\s*return\s+sendJson\(\s*405/g)) {
          methods.push(mm[1]);
        }
        const uniqueMethods = [...new Set(methods)].sort();
        const isPublicStoryOrTrail = routePath === '/api/stories' || routePath === '/api/trails/suggest';
        const isInviteValidate = routePath === '/api/invitations/validate';
        let authReq = 'authenticated_14_plus';
        let authzSum = 'role_or_owner_scoped';
        if (isPublicStoryOrTrail || isInviteValidate) {
          authReq = 'public';
          authzSum = 'public_read_feature_gated';
        } else if (routePath.startsWith('/api/admin/features')) {
          authzSum = uniqueMethods.includes('POST') ? 'top_admin_only_for_mutation_mod_read' : 'top_or_mod_read';
        } else if (routePath.startsWith('/api/admin/')) {
          authzSum = /requireTop|!ctx\.isTop/.test(windowSlice) ? 'top_admin_only' : 'top_or_mod_scoped';
        } else if (routePath.startsWith('/api/me/')) {
          authzSum = 'authenticated_self_owner_rls';
        }

        const errCodes = [...new Set([...windowSlice.matchAll(/\bcode\s*:\s*['"]([A-Z][A-Z0-9_]{2,})['"]/g)].map(x => x[1]))].sort();
        const statuses = [...new Set([...windowSlice.matchAll(/\bsendJson\(\s*(\d{3})\b/g)].map(x => Number(x[1])))].sort((a, b) => a - b);

        addRoute({
          path: routePath,
          methods: uniqueMethods.length ? uniqueMethods : ['GET', 'POST'],
          handler_file: routerFile,
          handler_symbol: routerFile === 'server/customer-exploration-routes.js' ? 'handleCustomerExplorationRoute' : 'handleAdminAndGovernanceRoutes',
          dispatcher: 'server/admin-routes.js',
          auth_requirement: authReq,
          authorization_summary: authzSum,
          status_codes: statuses,
          error_codes: errCodes,
          line: idx + 1
        });
      }
    }
  }

  // Cross-reference callers (`public/*.js`) & tests (`tests/*.cjs`)
  const testFilesContent = [];
  for (const [fPath, content] of fileContentsByPath.entries()) {
    if (fPath.startsWith('tests/') && fPath.endsWith('.cjs')) {
      testFilesContent.push({ file: fPath, content });
    }
  }

  const allFrontendConsumers = [];
  for (const [fPath, jsData] of jsAnalysesByPath.entries()) {
    if (fPath.startsWith('public/') || fPath.includes('.html#inline')) {
      for (const c of jsData.api_consumers || []) {
        allFrontendConsumers.push(c);
      }
    }
  }

  for (const r of routes) {
    const shortSuffix = r.path.replace(/^\/api/, '');
    r.known_frontend_callers = allFrontendConsumers
      .filter(c => c.url_pattern.includes(r.path) || (shortSuffix.length > 4 && c.url_pattern.includes(shortSuffix)))
      .map(c => `${c.file}:${c.caller}`)
      .filter((v, i, arr) => arr.indexOf(v) === i)
      .sort();

    r.verifying_tests = testFilesContent
      .filter(t => t.content.includes(r.path))
      .map(t => t.file)
      .sort();
  }

  routes.sort((a, b) => a.path.localeCompare(b.path));
  return routes;
}

// ============================================================================
// SQL Migrations & Reconstructed Schema Analyzer (`migrations/*.sql`)
// ============================================================================
function stripSqlComments(sql) {
  let out = '';
  let i = 0;
  while (i < sql.length) {
    // Single-quoted string literal
    if (sql[i] === "'") {
      out += sql[i++];
      while (i < sql.length) {
        out += sql[i];
        if (sql[i] === "'" && sql[i + 1] === "'") {
          out += sql[++i];
          i++;
          continue;
        }
        if (sql[i] === "'") {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    // Dollar-quoted string (`$$...$$` or `$tag$...$tag$`)
    if (sql[i] === '$') {
      const m = /^\$([A-Za-z0-9_]*)\$/.exec(sql.slice(i));
      if (m) {
        const tag = m[0];
        const end = sql.indexOf(tag, i + tag.length);
        if (end !== -1) {
          out += sql.slice(i, end + tag.length);
          i = end + tag.length;
          continue;
        }
      }
    }
    // Line comment `-- ...`
    if (sql[i] === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i++;
      continue;
    }
    // Block comment `/* ... */`
    if (sql[i] === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      if (end === -1) break;
      for (let k = i; k < end + 2; k++) {
        if (sql[k] === '\n') out += '\n';
      }
      i = end + 2;
      continue;
    }
    out += sql[i++];
  }
  return out;
}

function splitTopLevelCommas(body) {
  const parts = [];
  let cur = '';
  let depth = 0;
  let inQuote = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === "'") {
      cur += ch;
      if (inQuote && body[i + 1] === "'") {
        cur += body[++i];
      } else {
        inQuote = !inQuote;
      }
      continue;
    }
    if (!inQuote) {
      if (ch === '(') depth++;
      else if (ch === ')') depth = Math.max(0, depth - 1);
      else if (ch === ',' && depth === 0) {
        if (cur.trim()) parts.push(cur.trim());
        cur = '';
        continue;
      }
    }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

function findBalancedParenBody(str, openIdx) {
  let depth = 0;
  let inQuote = false;
  for (let i = openIdx; i < str.length; i++) {
    const ch = str[i];
    if (ch === "'") {
      if (inQuote && str[i + 1] === "'") i++;
      else inQuote = !inQuote;
      continue;
    }
    if (!inQuote) {
      if (ch === '(') depth++;
      else if (ch === ')') {
        depth--;
        if (depth === 0) {
          return { body: str.slice(openIdx + 1, i), endIdx: i };
        }
      }
    }
  }
  return null;
}

function parseColumnOrConstraintItem(item, migrationFile, tableObj) {
  const norm = item.replace(/\s+/g, ' ').trim();
  if (/^(CONSTRAINT\s+[A-Za-z0-9_]+\s+)?(PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|CHECK)\b/i.test(norm)) {
    tableObj.constraints.push({ definition: norm, migration: migrationFile });
    const fkMatch = /FOREIGN\s+KEY\s*\(([^)]+)\)\s*REFERENCES\s+(?:public\.)?([A-Za-z0-9_]+)\s*\(([^)]+)\)(?:\s+ON\s+DELETE\s+(CASCADE|SET\s+NULL|RESTRICT|NO\s+ACTION))?/i.exec(norm);
    if (fkMatch) {
      tableObj.foreign_keys.push({
        columns: fkMatch[1].split(',').map(s => s.trim()),
        references_table: fkMatch[2].toLowerCase(),
        references_columns: fkMatch[3].split(',').map(s => s.trim()),
        on_delete: (fkMatch[4] || 'NO ACTION').toUpperCase(),
        migration: migrationFile
      });
    }
    const pkMatch = /PRIMARY\s+KEY\s*\(([^)]+)\)/i.exec(norm);
    if (pkMatch) {
      const pkCols = pkMatch[1].split(',').map(s => s.trim().toLowerCase());
      for (const c of tableObj.columns) {
        if (pkCols.includes(c.name.toLowerCase())) c.primary_key = true;
      }
    }
    return;
  }

  const colMatch = /^"?([A-Za-z0-9_]+)"?\s+(.+)$/.exec(norm);
  if (!colMatch) return;
  const colName = colMatch[1];
  const rest = colMatch[2];

  // Extract SQL type before column-constraint keywords
  const kwIdx = rest.search(/\b(PRIMARY\s+KEY|NOT\s+NULL|NULL\b|DEFAULT\b|REFERENCES\b|UNIQUE\b|CHECK\b|CONSTRAINT\b|GENERATED\b)/i);
  const sqlType = (kwIdx === -1 ? rest : rest.slice(0, kwIdx)).trim();
  const isPk = /\bPRIMARY\s+KEY\b/i.test(rest);
  const notNull = isPk || /\bNOT\s+NULL\b/i.test(rest);
  const defMatch = /\bDEFAULT\s+(.+?)(?=\s+(?:NOT\s+NULL|NULL\b|PRIMARY\s+KEY|REFERENCES|UNIQUE|CHECK|CONSTRAINT)|$)/i.exec(rest);
  const refMatch = /\bREFERENCES\s+(?:public\.)?([A-Za-z0-9_]+)(?:\s*\(([^)]+)\))?(?:\s+ON\s+DELETE\s+(CASCADE|SET\s+NULL|RESTRICT|NO\s+ACTION))?/i.exec(rest);

  const existing = tableObj.columns.find(c => c.name === colName);
  const colRecord = {
    name: colName,
    sql_type: sqlType,
    not_null: notNull,
    primary_key: isPk,
    default_expr: defMatch ? defMatch[1].trim() : null,
    references_table: refMatch ? refMatch[1].toLowerCase() : null,
    references_column: refMatch ? (refMatch[2] || 'id').trim() : null,
    on_delete: refMatch ? (refMatch[3] || 'NO ACTION').toUpperCase() : null,
    added_in_migration: migrationFile
  };

  if (existing) {
    Object.assign(existing, colRecord);
  } else {
    tableObj.columns.push(colRecord);
  }

  if (refMatch) {
    tableObj.foreign_keys.push({
      columns: [colName],
      references_table: refMatch[1].toLowerCase(),
      references_columns: [(refMatch[2] || 'id').trim()],
      on_delete: (refMatch[3] || 'NO ACTION').toUpperCase(),
      migration: migrationFile
    });
  }
}

export function analyzeMigrationsAndSchema({ migrationFiles, runMigrationsSource = '' }) {
  const tablesMap = new Map();
  const views = [];
  const sqlFunctions = [];
  const triggers = [];
  const migrations = [];

  function ensureTable(tableName, createdByMigration = null) {
    const key = tableName.toLowerCase();
    if (!tablesMap.has(key)) {
      tablesMap.set(key, {
        table_name: key,
        created_in_migration: createdByMigration,
        altered_in_migrations: [],
        rls_enabled: false,
        rls_forced: false,
        columns: [],
        constraints: [],
        foreign_keys: [],
        indexes: [],
        rls_policies: [],
        app_role_revokes: []
      });
    }
    return tablesMap.get(key);
  }

  const sortedMigrations = [...migrationFiles].sort((a, b) => a.filename.localeCompare(b.filename));

  for (const mig of sortedMigrations) {
    const sha256 = crypto.createHash('sha256').update(mig.content, 'utf8').digest('hex');
    const numMatch = /^(\d+)_/.exec(mig.filename);
    const seqNumber = numMatch ? Number(numMatch[1]) : null;
    const clean = stripSqlComments(mig.content);

    const tablesCreated = [];
    const tablesAltered = new Set();
    const indexesCreated = [];
    const policiesCreated = [];
    const funcsCreated = [];
    const trigsCreated = [];

    // 1. CREATE TABLE [IF NOT EXISTS] <name> (...)
    const createTableRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?"?([A-Za-z0-9_]+)"?\s*\(/gi;
    let cm;
    while ((cm = createTableRe.exec(clean)) !== null) {
      const tName = cm[1].toLowerCase();
      const openIdx = cm.index + cm[0].length - 1;
      const paren = findBalancedParenBody(clean, openIdx);
      const tbl = ensureTable(tName, mig.filename);
      if (!tbl.created_in_migration) tbl.created_in_migration = mig.filename;
      tablesCreated.push(tName);
      if (paren) {
        for (const item of splitTopLevelCommas(paren.body)) {
          parseColumnOrConstraintItem(item, mig.filename, tbl);
        }
      }
    }

    // 2. ALTER TABLE ...
    const alterRe = /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(?:public\.)?"?([A-Za-z0-9_]+)"?\s+([\s\S]*?);/gi;
    let am;
    while ((am = alterRe.exec(clean)) !== null) {
      const tName = am[1].toLowerCase();
      const body = am[2].replace(/\s+/g, ' ').trim();
      const tbl = ensureTable(tName);
      tablesAltered.add(tName);
      if (!tbl.altered_in_migrations.includes(mig.filename) && tbl.created_in_migration !== mig.filename) {
        tbl.altered_in_migrations.push(mig.filename);
      }

      if (/\bENABLE\s+ROW\s+LEVEL\s+SECURITY\b/i.test(body)) tbl.rls_enabled = true;
      if (/\bFORCE\s+ROW\s+LEVEL\s+SECURITY\b/i.test(body)) tbl.rls_forced = true;

      for (const addCol of body.matchAll(/ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?(.+?)(?=,\s*ADD\s+|\s*$)/gi)) {
        parseColumnOrConstraintItem(addCol[1], mig.filename, tbl);
      }
      for (const addCon of body.matchAll(/ADD\s+(CONSTRAINT\s+[A-Za-z0-9_]+\s+(?:PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|CHECK)\s*\([^;]+)$/gi)) {
        parseColumnOrConstraintItem(addCon[1], mig.filename, tbl);
      }
    }

    // 3. CREATE [UNIQUE] INDEX ...
    const idxRe = /CREATE\s+(UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?"?([A-Za-z0-9_]+)"?\s+ON\s+(?:public\.)?"?([A-Za-z0-9_]+)"?\s+([^;]+);/gi;
    let im;
    while ((im = idxRe.exec(clean)) !== null) {
      const isUnique = Boolean(im[1]);
      const idxName = im[2];
      const tName = im[3].toLowerCase();
      const restDef = im[4].replace(/\s+/g, ' ').trim();
      const whereIdx = restDef.search(/\bWHERE\b/i);
      const tbl = ensureTable(tName);
      tbl.indexes.push({
        name: idxName,
        unique: isUnique,
        partial_where: whereIdx !== -1 ? restDef.slice(whereIdx + 5).trim() : null,
        definition: restDef,
        migration: mig.filename
      });
      indexesCreated.push(idxName);
    }

    // 4. CREATE POLICY <name> ON <table> ...
    const polRe = /CREATE\s+POLICY\s+"?([A-Za-z0-9_]+)"?\s+ON\s+(?:public\.)?"?([A-Za-z0-9_]+)"?\s+([\s\S]*?);/gi;
    let pm;
    while ((pm = polRe.exec(clean)) !== null) {
      const polName = pm[1];
      const tName = pm[2].toLowerCase();
      const polBody = pm[3].replace(/\s+/g, ' ').trim();
      const cmdMatch = /\bFOR\s+(ALL|SELECT|INSERT|UPDATE|DELETE)\b/i.exec(polBody);
      const gucKeys = [...new Set([...polBody.matchAll(/current_setting\(\s*'([^']+)'/gi)].map(x => x[1]))].sort();
      const tbl = ensureTable(tName);
      tbl.rls_policies.push({
        policy_name: polName,
        command: (cmdMatch ? cmdMatch[1] : 'ALL').toUpperCase(),
        guc_keys: gucKeys,
        expression: polBody,
        migration: mig.filename
      });
      policiesCreated.push(`${tName}.${polName}`);
    }

    // 5. CREATE [OR REPLACE] VIEW
    for (const vm of clean.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+(?:public\.)?"?([A-Za-z0-9_]+)"?/gi)) {
      views.push({ view_name: vm[1].toLowerCase(), migration: mig.filename });
    }

    // 6. CREATE [OR REPLACE] FUNCTION
    for (const fm of clean.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?"?([A-Za-z0-9_]+)"?\s*\(([^)]*)\)/gi)) {
      const fnName = fm[1].toLowerCase();
      sqlFunctions.push({
        function_name: fnName,
        args: fm[2].replace(/\s+/g, ' ').trim(),
        migration: mig.filename
      });
      funcsCreated.push(fnName);
    }

    // 7. CREATE TRIGGER
    for (const trm of clean.matchAll(/CREATE\s+TRIGGER\s+"?([A-Za-z0-9_]+)"?\s+(BEFORE|AFTER|INSTEAD\s+OF)\s+([A-Z\s]+?)\s+ON\s+(?:public\.)?"?([A-Za-z0-9_]+)"?/gi)) {
      const trigName = trm[1].toLowerCase();
      triggers.push({
        trigger_name: trigName,
        timing: trm[2].toUpperCase(),
        events: trm[3].replace(/\s+/g, ' ').trim().toUpperCase(),
        table_name: trm[4].toLowerCase(),
        migration: mig.filename
      });
      trigsCreated.push(trigName);
    }

    migrations.push({
      sequence_number: seqNumber,
      filename: mig.filename,
      sha256,
      tables_created: tablesCreated,
      tables_altered: [...tablesAltered].sort(),
      indexes_created: indexesCreated,
      policies_created: policiesCreated,
      functions_created: funcsCreated,
      triggers_created: trigsCreated,
      contains_seed_data: /\bINSERT\s+INTO\s+vendors\b/i.test(clean)
    });
  }

  // Extract explicit REVOKE rules applied by `scripts/run-migrations.cjs` to the restricted `<appRole>`
  const roleGrants = {
    schema_grant: 'GRANT USAGE ON SCHEMA public TO <appRole>',
    default_table_grant: 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO <appRole>',
    sequence_grant: 'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO <appRole>',
    explicit_revokes: []
  };
  if (runMigrationsSource) {
    for (const rm of runMigrationsSource.matchAll(/REVOKE\s+([A-Z,\s]+)\s+ON\s+([A-Za-z0-9_]+)\s+FROM/gi)) {
      const privileges = rm[1].replace(/\s+/g, ' ').trim();
      const targetTable = rm[2].toLowerCase();
      roleGrants.explicit_revokes.push({ table_name: targetTable, revoked_privileges: privileges });
      if (tablesMap.has(targetTable)) {
        tablesMap.get(targetTable).app_role_revokes.push(privileges);
      }
    }
  }

  // Also include `schema_migrations` created dynamically by `scripts/run-migrations.cjs`
  if (runMigrationsSource.includes('CREATE TABLE IF NOT EXISTS schema_migrations')) {
    const sm = ensureTable('schema_migrations', 'scripts/run-migrations.cjs');
    if (sm.columns.length === 0) {
      sm.columns.push(
        { name: 'filename', sql_type: 'TEXT', not_null: true, primary_key: true, default_expr: null, references_table: null, references_column: null, on_delete: null, added_in_migration: 'scripts/run-migrations.cjs' },
        { name: 'checksum_sha256', sql_type: 'TEXT', not_null: true, primary_key: false, default_expr: null, references_table: null, references_column: null, on_delete: null, added_in_migration: 'scripts/run-migrations.cjs' },
        { name: 'applied_at', sql_type: 'TIMESTAMPTZ', not_null: true, primary_key: false, default_expr: 'now()', references_table: null, references_column: null, on_delete: null, added_in_migration: 'scripts/run-migrations.cjs' }
      );
    }
  }

  const tables = [...tablesMap.values()].sort((a, b) => a.table_name.localeCompare(b.table_name));
  return {
    schema_basis: 'reconstructed_from_repository_migrations',
    migrations,
    tables,
    views: views.sort((a, b) => a.view_name.localeCompare(b.view_name)),
    sql_functions: sqlFunctions.sort((a, b) => a.function_name.localeCompare(b.function_name)),
    triggers: triggers.sort((a, b) => a.trigger_name.localeCompare(b.trigger_name)),
    role_grants: roleGrants
  };
}

export function generateMermaidErDiagram(tables) {
  const lines = ['erDiagram'];
  const edgeSet = new Set();

  for (const t of tables) {
    lines.push(`  ${t.table_name} {`);
    for (const c of t.columns.slice(0, 14)) {
      const safeType = c.sql_type.replace(/[^A-Za-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'TEXT';
      const keyTag = c.primary_key ? ' PK' : c.references_table ? ' FK' : '';
      lines.push(`    ${safeType} ${c.name}${keyTag}`);
    }
    lines.push('  }');
  }

  for (const t of tables) {
    for (const fk of t.foreign_keys) {
      const edge = `  ${fk.references_table} ||--o{ ${t.table_name} : "${fk.columns.join('_')}"`;
      if (!edgeSet.has(edge)) {
        edgeSet.add(edge);
        lines.push(edge);
      }
    }
  }

  return lines.join('\n');
}
