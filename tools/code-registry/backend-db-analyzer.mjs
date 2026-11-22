// BiteShark Code Registry — AST-Bounded Routes, Feature Controls, Diagnostics & SQL Schema Analyzer
// (`tools/code-registry/backend-db-analyzer.mjs`)

import crypto from 'node:crypto';
import { asciiCompare } from './schema-versions.mjs';
import { parseJavaScriptSource } from './js-analyzer.mjs';

function walkAst(node, visitor, ancestors = []) {
  if (!node || typeof node.type !== 'string') return;
  visitor(node, ancestors);
  const nextAnc = [...ancestors, node];
  for (const k of Object.keys(node)) {
    if (k === 'loc' || k === 'start' || k === 'end' || k.startsWith('__registry')) continue;
    const ch = node[k];
    if (Array.isArray(ch)) {
      for (const item of ch) {
        if (item && typeof item.type === 'string') walkAst(item, visitor, nextAnc);
      }
    } else if (ch && typeof ch.type === 'string') {
      walkAst(ch, visitor, nextAnc);
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

function getMemberChain(node) {
  if (!node) return null;
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'ThisExpression') return 'this';
  if (node.type === 'MemberExpression' && !node.computed) {
    const obj = getMemberChain(node.object);
    const prop = node.property?.name || node.property?.value;
    if (obj && prop) return `${obj}.${prop}`;
  }
  return null;
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
              methods: (obj.methods || ['*']).map(m => String(m).toUpperCase()),
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

  features.sort((a, b) => asciiCompare(a.key, b.key));
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
        sets[node.id.name] = val.map(String).sort(asciiCompare);
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

export function extractAgePolicyAllowlist(source, relPath = 'lib/age-policy.js') {
  const parsed = parseJavaScriptSource(source, { filePath: relPath });
  const exemptMap = new Map();
  if (!parsed.ok) return exemptMap;

  walkAst(parsed.ast, node => {
    if (
      node.type === 'VariableDeclarator' &&
      node.id?.name === 'EXEMPT_GOVERNANCE_METHODS_BY_PATH' &&
      node.init?.type === 'NewExpression' &&
      node.init.callee?.name === 'Map' &&
      node.init.arguments[0]?.type === 'ArrayExpression'
    ) {
      for (const pair of node.init.arguments[0].elements) {
        if (pair?.type !== 'ArrayExpression' || pair.elements.length < 2) continue;
        const p = evalStaticLiteral(pair.elements[0]);
        const methods = evalStaticLiteral(pair.elements[1]);
        if (typeof p === 'string' && Array.isArray(methods)) {
          exemptMap.set(p, new Set(methods.map(m => String(m).toUpperCase())));
        }
      }
    }
  });
  return exemptMap;
}

// ============================================================================
// AST-Bounded Route & Permission Evidence Extractor (`Section 7`)
// ============================================================================

const SQL_NON_TABLE_KEYWORDS = new Set([
  'select',
  'where',
  'values',
  'set',
  'public',
  'jsonb_to_recordset',
  'unnest',
  'lateral',
  'only',
  'dual',
  'generate_series',
  'ordered_existing'
]);

function isMethodVarNode(node) {
  if (!node) return false;
  if (node.type === 'Identifier' && (node.name === 'method' || node.name === 'httpMethod')) return true;
  if (node.type === 'MemberExpression' && !node.computed) {
    const ch = getMemberChain(node);
    if (ch === 'req.method') return true;
  }
  return false;
}

function isPathVarNode(node) {
  if (!node) return false;
  if (node.type === 'Identifier' && (node.name === 'normPath' || node.name === 'pathname' || node.name === 'normGovPath')) {
    return true;
  }
  const ch = getMemberChain(node);
  return ch === 'req.url' || ch === 'req.path' || ch === 'parsedUrl.pathname';
}

function extractRoutePathsFromTestExpr(testNode) {
  if (!testNode) return [];
  if (testNode.type === 'BinaryExpression' && (testNode.operator === '===' || testNode.operator === '==')) {
    if (isPathVarNode(testNode.left)) {
      const lit = evalStaticLiteral(testNode.right);
      if (typeof lit === 'string' && lit.startsWith('/api/')) return [lit];
    }
    if (isPathVarNode(testNode.right)) {
      const lit = evalStaticLiteral(testNode.left);
      if (typeof lit === 'string' && lit.startsWith('/api/')) return [lit];
    }
  }
  if (testNode.type === 'LogicalExpression' && testNode.operator === '||') {
    return [
      ...extractRoutePathsFromTestExpr(testNode.left),
      ...extractRoutePathsFromTestExpr(testNode.right)
    ];
  }
  return [];
}

function extractNegativeMethodGuardFromTest(testNode) {
  // Matches:
  //   `method !== 'GET'` -> ['GET']
  //   `method !== 'GET' && method !== 'POST'` -> ['GET', 'POST']
  //   `!['GET', 'POST'].includes(method)` -> ['GET', 'POST']
  if (!testNode) return null;
  if (testNode.type === 'BinaryExpression' && (testNode.operator === '!==' || testNode.operator === '!=')) {
    if (isMethodVarNode(testNode.left)) {
      const m = evalStaticLiteral(testNode.right);
      if (typeof m === 'string' && /^[A-Z]+$/.test(m)) return [m];
    }
    if (isMethodVarNode(testNode.right)) {
      const m = evalStaticLiteral(testNode.left);
      if (typeof m === 'string' && /^[A-Z]+$/.test(m)) return [m];
    }
  }
  if (testNode.type === 'LogicalExpression' && testNode.operator === '&&') {
    const left = extractNegativeMethodGuardFromTest(testNode.left);
    const right = extractNegativeMethodGuardFromTest(testNode.right);
    if (left && right) return [...new Set([...left, ...right])];
  }
  if (
    testNode.type === 'UnaryExpression' &&
    testNode.operator === '!' &&
    testNode.argument?.type === 'CallExpression' &&
    testNode.argument.callee?.type === 'MemberExpression' &&
    testNode.argument.callee.property?.name === 'includes' &&
    isMethodVarNode(testNode.argument.arguments?.[0])
  ) {
    const arr = evalStaticLiteral(testNode.argument.callee.object);
    if (Array.isArray(arr) && arr.every(x => typeof x === 'string' && /^[A-Z]+$/.test(x))) {
      return [...new Set(arr)];
    }
  }
  return null;
}

function extractPositiveMethodFromTest(testNode) {
  if (!testNode) return null;
  if (testNode.type === 'BinaryExpression' && (testNode.operator === '===' || testNode.operator === '==')) {
    if (isMethodVarNode(testNode.left)) {
      const m = evalStaticLiteral(testNode.right);
      if (typeof m === 'string' && /^[A-Z]+$/.test(m)) return [m];
    }
    if (isMethodVarNode(testNode.right)) {
      const m = evalStaticLiteral(testNode.left);
      if (typeof m === 'string' && /^[A-Z]+$/.test(m)) return [m];
    }
  }
  if (testNode.type === 'LogicalExpression' && testNode.operator === '||') {
    const l = extractPositiveMethodFromTest(testNode.left);
    const r = extractPositiveMethodFromTest(testNode.right);
    if (l && r) return [...new Set([...l, ...r])];
  }
  return null;
}

function blockAlwaysReturns(stmt) {
  if (!stmt) return false;
  if (stmt.type === 'ReturnStatement' || stmt.type === 'ThrowStatement') return true;
  if (stmt.type === 'BlockStatement') {
    return stmt.body.some(s => s.type === 'ReturnStatement' || s.type === 'ThrowStatement');
  }
  return false;
}

function buildIntraFileHelperSignals(ast) {
  // Collects permission/auth signals inside local functions in the same module so 1-hop helper calls
  // (`await verifyTopAdminTx(tx, ctx)`) propagate exact permission evidence!
  const helperMap = new Map(); // fnName -> Set<signal>
  for (const stmt of ast.body || []) {
    const decl = stmt.type === 'ExportNamedDeclaration' ? stmt.declaration : stmt;
    if (!decl) continue;
    let fnName = null;
    let fnNode = null;
    if (decl.type === 'FunctionDeclaration' && decl.id?.name) {
      fnName = decl.id.name;
      fnNode = decl;
    } else if (decl.type === 'VariableDeclaration') {
      for (const d of decl.declarations) {
        if (
          d.id?.type === 'Identifier' &&
          d.init &&
          (d.init.type === 'FunctionExpression' || d.init.type === 'ArrowFunctionExpression')
        ) {
          fnName = d.id.name;
          fnNode = d.init;
        }
      }
    }
    if (fnName && fnNode) {
      helperMap.set(fnName, collectPermissionSignalsFromAst(fnNode, new Map()));
    }
  }
  return helperMap;
}

function collectPermissionSignalsFromAst(subtree, intraFileHelperSignals = new Map()) {
  const signals = {
    requiresAuthGuard: false,
    topAdminTx: false,
    topAdminGuard: false,
    modAdminTx: false,
    modAdminGuard: false,
    vendorOwnerTx: false,
    vendorStaffTx: false,
    vendorScopeHelper: false,
    workerSecret: false,
    pagerCapability: false,
    userRlsGuc: false,
    selfUserCheck: false,
    evidenceList: new Set()
  };

  walkAst(subtree, node => {
    if (node.type === 'CallExpression') {
      const ch = getMemberChain(node.callee);
      if (!ch) return;

      if (ch === 'reverifyPlatformAdminInTx') {
        signals.topAdminTx = true;
        signals.evidenceList.add('reverifyPlatformAdminInTx');
      } else if (ch === 'reverifyModeratorInTx') {
        signals.modAdminTx = true;
        signals.evidenceList.add('reverifyModeratorInTx');
      } else if (ch === 'reverifyVendorMembershipInTx' || ch === 'authorizeVendorTarget' || ch === 'authorizeVendorOperation') {
        const roleArg = node.arguments.find(a => a?.type === 'Literal' && (a.value === 'owner' || a.value === 'staff'));
        if (roleArg?.value === 'owner') {
          signals.vendorOwnerTx = true;
          signals.evidenceList.add(`${ch}('owner')`);
        } else {
          signals.vendorStaffTx = true;
          signals.evidenceList.add(`${ch}(${roleArg?.value ? `'${roleArg.value}'` : 'vendor'})`);
        }
      } else if (ch === 'authorizeVendorScope') {
        signals.vendorScopeHelper = true;
        signals.evidenceList.add('authorizeVendorScope');
      } else if (ch === 'verifySameOriginMutation') {
        signals.pagerCapability = true;
        signals.evidenceList.add('verifySameOriginMutation(X-BiteShark-Client)');
      } else if (ch === 'readProtectedStagingMailboxCode') {
        signals.workerSecret = true;
        signals.evidenceList.add('readProtectedStagingMailboxCode');
      } else if (ch === 'setUserRlsContextInTx') {
        signals.userRlsGuc = true;
        signals.evidenceList.add('setUserRlsContextInTx(app.user_id)');
      } else if (
        [
          'getExplorationSummary',
          'listUserVisits',
          'logUserVisit',
          'deleteUserVisit',
          'listUserPhotos',
          'createUserPhoto',
          'readUserPhotoFile',
          'deleteUserPhoto',
          'listUserSavedTrails',
          'saveUserTrail',
          'deleteUserSavedTrail',
          'importLegacyDeviceVisits',
          'exportUserExplorationData'
        ].includes(ch)
      ) {
        signals.userRlsGuc = true;
        signals.selfUserCheck = true;
        signals.evidenceList.add(`${ch}(userId + FORCE_RLS)`);
      } else if (intraFileHelperSignals.has(ch)) {
        const sub = intraFileHelperSignals.get(ch);
        if (sub.topAdminTx) {
          signals.topAdminTx = true;
          signals.evidenceList.add(`${ch}->reverifyPlatformAdminInTx`);
        }
        if (sub.modAdminTx) {
          signals.modAdminTx = true;
          signals.evidenceList.add(`${ch}->reverifyModeratorInTx`);
        }
        if (sub.vendorOwnerTx) {
          signals.vendorOwnerTx = true;
          signals.evidenceList.add(`${ch}->vendorOwnerCheck`);
        }
        if (sub.vendorStaffTx) {
          signals.vendorStaffTx = true;
          signals.evidenceList.add(`${ch}->vendorStaffCheck`);
        }
        if (sub.userRlsGuc) {
          signals.userRlsGuc = true;
          signals.evidenceList.add(`${ch}->app.user_id`);
        }
      }

      // Check SQL strings inside `.query(...)` for `set_config('app.user_id', ...)`
      if (ch.endsWith('.query') && node.arguments[0]) {
        const qLit = evalStaticLiteral(node.arguments[0]);
        if (typeof qLit === 'string' && qLit.includes("'app.user_id'")) {
          signals.userRlsGuc = true;
          signals.evidenceList.add("set_config('app.user_id')");
        }
      }
    }

    if (node.type === 'MemberExpression') {
      const ch = getMemberChain(node);
      if (ch === 'ctx.isPlatformAdmin' || ch === 'ctx.isTopAdmin') {
        signals.topAdminGuard = true;
        signals.evidenceList.add(ch);
      } else if (ch === 'ctx.isModerator' || ch === 'ctx.isModAdmin') {
        signals.modAdminGuard = true;
        signals.evidenceList.add(ch);
      } else if (ch === 'ctx.authenticated') {
        signals.requiresAuthGuard = true;
        signals.evidenceList.add('ctx.authenticated');
      } else if (ch === 'user.id' || ch === 'ctx.user.id' || ch === 'verifiedUser.id') {
        signals.selfUserCheck = true;
      } else if (ch === 'process.env.NOTIFICATION_WORKER_SECRET') {
        signals.workerSecret = true;
        signals.evidenceList.add('NOTIFICATION_WORKER_SECRET');
      }
    }

    if (
      node.type === 'CallExpression' &&
      getMemberChain(node.callee) === 'readEnvCompat' &&
      evalStaticLiteral(node.arguments[0]) === 'NOTIFICATION_WORKER_SECRET'
    ) {
      signals.workerSecret = true;
      signals.evidenceList.add('BITESHARK_NOTIFICATION_WORKER_SECRET');
    }
  });

  return signals;
}

function classifyAuthorizationFromSignals(signals, { routerEntryAuthz = null, defaultAccess = null } = {}) {
  const ev = [...signals.evidenceList].sort(asciiCompare);
  // Note: If BOTH `reverifyModeratorInTx` AND `reverifyPlatformAdminInTx` appear on a single-method route,
  // check whether `reverifyModeratorInTx` is the primary gate (e.g. Mod recommends, Top finalizes) vs Top-only!
  if (signals.topAdminTx && !signals.modAdminTx) {
    return {
      level: 'admin_top_only',
      confidence: 'confirmed_static',
      evidence: ev
    };
  }
  if (signals.topAdminGuard && !signals.modAdminGuard && !signals.modAdminTx && !signals.vendorScopeHelper && !signals.selfUserCheck) {
    return {
      level: 'admin_top_only',
      confidence: 'confirmed_static',
      evidence: ev
    };
  }
  if (signals.modAdminTx) {
    return {
      level: 'admin_mod_or_top',
      confidence: 'confirmed_static',
      evidence: ev
    };
  }
  if (signals.vendorOwnerTx && !signals.vendorScopeHelper) {
    return {
      level: 'vendor_owner_or_top_admin',
      confidence: 'confirmed_static',
      evidence: ev
    };
  }
  if (signals.vendorStaffTx || signals.vendorScopeHelper || signals.vendorOwnerTx) {
    return {
      level: 'vendor_staff_or_owner_or_admin',
      confidence: 'confirmed_static',
      evidence: ev
    };
  }
  if (signals.workerSecret) {
    return {
      level: 'internal_worker_or_operator_secret',
      confidence: 'confirmed_static',
      evidence: ev
    };
  }
  if (signals.pagerCapability) {
    return {
      level: 'pager_capability_or_unsubscribe_token',
      confidence: 'confirmed_static',
      evidence: ev
    };
  }
  if (routerEntryAuthz) {
    return {
      level: routerEntryAuthz.level,
      confidence: 'confirmed_static',
      evidence: [...new Set([routerEntryAuthz.evidence, ...ev])]
    };
  }
  if (signals.userRlsGuc || (defaultAccess === 'user' && signals.selfUserCheck) || signals.requiresAuthGuard) {
    return {
      level: signals.userRlsGuc ? 'authenticated_self_owner_rls' : 'authenticated_self_owner',
      confidence: 'confirmed_static',
      evidence: ev.length ? ev : ['session_user_id_bound']
    };
  }
  if (defaultAccess === 'public') {
    return {
      level: 'public_read',
      confidence: 'confirmed_static',
      evidence: ev.length ? ev : ['public_route']
    };
  }
  return {
    level: 'handler_conditional_or_public',
    confidence: ev.length > 0 ? 'inferred' : 'confirmed_static',
    evidence: ev
  };
}

function extractSubtreeHttpTelemetry(subtree, sourceText) {
  const statuses = new Set();
  const errorCodes = new Set();
  const tables = new Set();
  const responseKeys = new Set();

  walkAst(subtree, node => {
    if (node.type === 'CallExpression') {
      const ch = getMemberChain(node.callee);
      if (ch === 'sendJson' || ch === 'sendJsonResponse') {
        const st = evalStaticLiteral(node.arguments[ch === 'sendJsonResponse' ? 1 : 0]);
        const payloadNode = node.arguments[ch === 'sendJsonResponse' ? 2 : 1];
        if (typeof st === 'number' && st >= 100 && st <= 599) statuses.add(st);
        if (payloadNode?.type === 'ObjectExpression' && (st === 200 || st === 201 || st === undefined)) {
          for (const p of payloadNode.properties) {
            if (p.type === 'Property') {
              const k = p.key?.name || p.key?.value;
              if (k) responseKeys.add(String(k));
            }
          }
        }
      } else if (ch?.endsWith('.status') && typeof evalStaticLiteral(node.arguments[0]) === 'number') {
        const st = evalStaticLiteral(node.arguments[0]);
        if (st >= 100 && st <= 599) statuses.add(st);
      } else if (ch?.endsWith('.json') && node.arguments[0]?.type === 'ObjectExpression') {
        // Check if chained on `.status(4xx/5xx)` or plain `res.json({...})` (200)
        const isErrStatus =
          node.callee?.object?.type === 'CallExpression' &&
          getMemberChain(node.callee.object.callee)?.endsWith('.status') &&
          Number(evalStaticLiteral(node.callee.object.arguments[0])) >= 400;
        if (!isErrStatus) {
          for (const p of node.arguments[0].properties) {
            if (p.type === 'Property') {
              const k = p.key?.name || p.key?.value;
              if (k) responseKeys.add(String(k));
            }
          }
        }
      }
    }
    if (node.type === 'Property') {
      const k = node.key?.name || node.key?.value;
      if (k === 'code') {
        const v = evalStaticLiteral(node.value);
        if (typeof v === 'string' && /^[A-Z][A-Z0-9_]{2,}$/.test(v)) {
          errorCodes.add(v);
        }
      }
    }
  });

  if (sourceText && typeof subtree.start === 'number' && typeof subtree.end === 'number') {
    const slice = sourceText.slice(subtree.start, subtree.end);
    for (const m of slice.matchAll(/\b(?:FROM|INTO|UPDATE|JOIN)\s+([a-z][a-z0-9_]{2,})\b/gi)) {
      const tbl = m[1].toLowerCase();
      if (!SQL_NON_TABLE_KEYWORDS.has(tbl)) tables.add(tbl);
    }
  }

  return {
    status_codes: [...statuses].sort((a, b) => a - b),
    error_codes: [...errorCodes].sort(asciiCompare),
    db_tables: [...tables].sort(asciiCompare),
    observed_response_keys: [...responseKeys].sort(asciiCompare)
  };
}

function extractMethodsAndBranchesFromConsequent(consequentBlock) {
  const stmts =
    consequentBlock?.type === 'BlockStatement' ? consequentBlock.body : consequentBlock ? [consequentBlock] : [];

  let guardedMethods = null;
  const methodBranches = new Map(); // METHOD -> AST node[]

  for (const s of stmts) {
    if (s.type === 'IfStatement') {
      const neg = extractNegativeMethodGuardFromTest(s.test);
      if (neg && blockAlwaysReturns(s.consequent) && !guardedMethods) {
        guardedMethods = neg;
      }
      const pos = extractPositiveMethodFromTest(s.test);
      if (pos) {
        for (const m of pos) {
          if (!methodBranches.has(m)) methodBranches.set(m, []);
          methodBranches.get(m).push(s.consequent);
        }
      }
    }
  }

  // Also scan 1 level deeper (e.g. `try { if (req.method === 'GET') { ... } }`)
  for (const s of stmts) {
    if (s.type === 'TryStatement' && s.block?.body) {
      for (const ts of s.block.body) {
        if (ts.type === 'IfStatement') {
          const neg = extractNegativeMethodGuardFromTest(ts.test);
          if (neg && blockAlwaysReturns(ts.consequent) && !guardedMethods) {
            guardedMethods = neg;
          }
          const pos = extractPositiveMethodFromTest(ts.test);
          if (pos) {
            for (const m of pos) {
              if (!methodBranches.has(m)) methodBranches.set(m, []);
              methodBranches.get(m).push(ts.consequent);
            }
          }
        }
      }
    }
  }

  if (guardedMethods && guardedMethods.length > 0) {
    return {
      methods: [...new Set(guardedMethods)].sort(asciiCompare),
      method_source: 'confirmed_method_guard',
      methodBranches
    };
  }
  if (methodBranches.size > 0) {
    return {
      methods: [...methodBranches.keys()].sort(asciiCompare),
      method_source: 'confirmed_method_branches',
      methodBranches
    };
  }
  return {
    methods: [],
    method_source: 'unresolved',
    methodBranches
  };
}

function normalizeConsumerUrlForRouteMatch(rawPattern) {
  if (!rawPattern || typeof rawPattern !== 'string') return { basePath: '', parameterized: false, prefixDynamic: false };
  const withoutQuery = rawPattern.split('?')[0].split('#')[0];
  const clean = withoutQuery.length > 1 && withoutQuery.endsWith('/') ? withoutQuery.slice(0, -1) : withoutQuery;
  if (!clean.includes(':expr')) {
    return { basePath: clean, parameterized: false, prefixDynamic: false };
  }
  // Distinguish `/api/trucks/:expr` (single segment param) vs `/api/admin/:expr`
  if (/^\/api\/trucks\/:expr$/.test(clean)) {
    return { basePath: '/api/trucks/:id', parameterized: true, prefixDynamic: false };
  }
  return { basePath: clean.split(':expr')[0], parameterized: false, prefixDynamic: true };
}

function matchesExactRouteStringInTest(testSource, routePath) {
  if (!testSource || !routePath) return false;
  const escaped = routePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const boundaryRe = new RegExp(`['"\`]${escaped}(?=['"\`?#\\s])`);
  if (boundaryRe.test(testSource)) return true;
  if (routePath === '/api/trucks/:id') {
    return /\/api\/trucks\/[A-Za-z0-9_${]/.test(testSource) && !/\/api\/trucks\/(nearby|search|availability)\b/.test(testSource);
  }
  return false;
}

export function extractBackendRoutes({
  fileContentsByPath,
  featureRouteRules = [],
  jsAnalysesByPath = new Map(),
  routeOverrides = [],
  sharedContracts = []
}) {
  const routes = [];
  const seenPaths = new Map();
  const ageExemptMap = extractAgePolicyAllowlist(fileContentsByPath.get('lib/age-policy.js') || '');

  const overridesByPath = new Map();
  for (const ov of routeOverrides || []) {
    if (ov?.path) overridesByPath.set(ov.path, ov);
  }

  // Build route -> contract map from `shared-contracts.json`
  const contractsByRoutePath = new Map();
  for (const ctr of sharedContracts || []) {
    for (const rp of ctr.http_routes || []) {
      const rPath = typeof rp === 'string' ? rp : rp?.path;
      if (!rPath) continue;
      if (!contractsByRoutePath.has(rPath)) contractsByRoutePath.set(rPath, []);
      contractsByRoutePath.get(rPath).push(ctr);
    }
  }

  function computeFeatureEnforcementForRoute(routePath, methods) {
    const byMethod = {};
    const matchedKeys = new Set();
    for (const m of methods) {
      if (m === 'UNRESOLVED') continue;
      const rule = featureRouteRules.find(
        r =>
          (r.path === routePath || (r.path.endsWith('*') && routePath.startsWith(r.path.slice(0, -1)))) &&
          (r.methods.includes('*') || r.methods.includes(m))
      );
      if (rule) {
        byMethod[m] = {
          feature_key: rule.feature_key,
          operation_kind: rule.operation_kind,
          allow_moderators_when_hidden: Boolean(rule.allow_moderators_when_hidden),
          rule_line: rule.line
        };
        matchedKeys.add(rule.feature_key);
      } else {
        byMethod[m] = null;
      }
    }
    return {
      by_method: byMethod,
      primary_feature_key: matchedKeys.size === 1 ? [...matchedKeys][0] : matchedKeys.size > 1 ? [...matchedKeys].join(',') : null
    };
  }

  function registerRoute(entry) {
    const ov = overridesByPath.get(entry.path) || null;
    const finalMethods =
      ov?.methods && ov.methods.length > 0
        ? [...ov.methods].sort(asciiCompare)
        : entry.methods.length > 0
          ? [...new Set(entry.methods)].sort(asciiCompare)
          : ['UNRESOLVED'];
    const finalMethodSource = ov?.methods ? 'manual_override' : entry.method_source || 'unresolved';

    if (seenPaths.has(entry.path)) return;
    seenPaths.set(entry.path, true);

    const fe = computeFeatureEnforcementForRoute(entry.path, finalMethods);
    const linkedContracts = (contractsByRoutePath.get(entry.path) || []).map(c => c.contract_id).sort(asciiCompare);
    const unresolvedNotes = [...(entry.unresolved_notes || [])];
    if (finalMethods.includes('UNRESOLVED')) {
      unresolvedNotes.push(`HTTP methods could not be proven statically in ${entry.handler_file}:L${entry.line}.`);
    }

    routes.push({
      route_id: `route:${entry.path}`,
      path: entry.path,
      methods: finalMethods,
      method_source: finalMethodSource,
      dispatcher: entry.dispatcher,
      handler_file: entry.handler_file,
      handler_symbol: entry.handler_symbol || 'default',
      line: entry.line || 1,
      auth_requirement: ov?.auth_requirement || entry.auth_requirement,
      authentication_evidence: entry.authentication_evidence || [],
      authorization_summary: ov?.authorization_summary || entry.authorization_summary,
      authorization_confidence: ov?.authorization_summary ? 'manual_override' : entry.authorization_confidence || 'confirmed_static',
      authorization_evidence: entry.authorization_evidence || [],
      authorization_by_method: entry.authorization_by_method || {},
      age_gate_exempt_methods: entry.age_gate_exempt_methods || [],
      feature_gate: fe.primary_feature_key,
      feature_enforcement_by_method: fe.by_method,
      status_codes: entry.status_codes || [],
      error_codes: entry.error_codes || [],
      observed_response_keys: entry.observed_response_keys || [],
      db_tables_touched: entry.db_tables_touched || [],
      contract_ids: linkedContracts,
      override_applied: ov ? ov.id || entry.path : null,
      unresolved_notes: unresolvedNotes
    });
  }

  // 1. `server/routes.js` explicit domain manifest (`api/*.js` routes)
  const routesSrc = fileContentsByPath.get('server/routes.js') || '';
  if (routesSrc) {
    const parsedRoutes = parseJavaScriptSource(routesSrc, { filePath: 'server/routes.js' });
    if (parsedRoutes.ok) {
      const importMap = new Map();
      for (const stmt of parsedRoutes.ast.body) {
        if (stmt.type === 'ImportDeclaration') {
          const spec = stmt.specifiers?.[0];
          const srcRel = String(stmt.source.value || '').replace(/^\.\.\//, '');
          if (spec?.local?.name && srcRel) {
            importMap.set(spec.local.name, srcRel);
          }
        }
      }

      walkAst(parsedRoutes.ast, node => {
        if (
          node.type === 'CallExpression' &&
          node.callee?.type === 'Identifier' &&
          node.callee.name === 'defineRoute' &&
          node.arguments.length >= 2
        ) {
          const pVal = evalStaticLiteral(node.arguments[0]);
          const hIdent = node.arguments[1]?.name;
          const extraOpts = evalStaticLiteral(node.arguments[2]) || {};
          if (typeof pVal !== 'string' || !pVal.startsWith('/api/')) return;

          const handlerFile = importMap.get(hIdent) || `api/${pVal.replace(/^\/api\//, '')}.js`;
          const hSrc = fileContentsByPath.get(handlerFile) || '';
          const hParsed = hSrc ? parseJavaScriptSource(hSrc, { filePath: handlerFile }) : { ok: false };

          let declaredMethods = [];
          let methodSource = 'unresolved';
          let declaredAccess = 'public';
          let authReq = 'public';
          const authEv = [];
          let authzInfo = { level: 'unresolved', confidence: 'unresolved', evidence: [] };
          const authzByMethod = {};
          let telemetry = { status_codes: [], error_codes: [], db_tables: [], observed_response_keys: [] };

          if (hParsed.ok) {
            const intraHelpers = buildIntraFileHelperSignals(hParsed.ast);
            let defaultHandlerFn = null;

            for (const st of hParsed.ast.body) {
              if (st.type === 'ExportNamedDeclaration' && st.declaration?.type === 'VariableDeclaration') {
                for (const d of st.declaration.declarations) {
                  if (d.id?.name === 'methods') {
                    const mv = evalStaticLiteral(d.init);
                    if (Array.isArray(mv)) {
                      declaredMethods = mv.map(x => String(x).toUpperCase());
                      methodSource = 'declared_export';
                    }
                  } else if (d.id?.name === 'access') {
                    const av = evalStaticLiteral(d.init);
                    if (typeof av === 'string') declaredAccess = av;
                  }
                }
              } else if (st.type === 'ExportDefaultDeclaration') {
                defaultHandlerFn = st.declaration;
              }
            }

            if (declaredMethods.length === 0 && defaultHandlerFn) {
              const extracted = extractMethodsAndBranchesFromConsequent(defaultHandlerFn.body);
              declaredMethods = extracted.methods;
              methodSource = extracted.method_source;
            }

            const wholeSignals = collectPermissionSignalsFromAst(hParsed.ast, intraHelpers);
            if (extraOpts.loopbackWorkerOnly || wholeSignals.workerSecret) {
              authReq = 'internal_worker_secret';
              authEv.push('server/app.js:loopbackWorkerOnly', ...wholeSignals.evidenceList);
            } else if (declaredAccess === 'user') {
              authReq = 'authenticated_14_plus';
              authEv.push(`${handlerFile}:access="user"`, 'server/app.js:resolveSessionFromRequest+14plus_gate');
            } else {
              authReq = 'public';
              authEv.push(`${handlerFile}:access="public"`);
            }

            authzInfo = classifyAuthorizationFromSignals(wholeSignals, { defaultAccess: declaredAccess });

            // Extract per-method authorization when `req.method === '...'` branches exist
            if (defaultHandlerFn?.body) {
              const { methodBranches } = extractMethodsAndBranchesFromConsequent(defaultHandlerFn.body);
              for (const m of declaredMethods) {
                const subNodes = methodBranches.get(m);
                if (subNodes && subNodes.length > 0) {
                  const subSig = collectPermissionSignalsFromAst(
                    { type: 'BlockStatement', body: subNodes },
                    intraHelpers
                  );
                  authzByMethod[m] = classifyAuthorizationFromSignals(subSig, { defaultAccess: declaredAccess });
                } else {
                  authzByMethod[m] = authzInfo;
                }
              }
            }

            telemetry = extractSubtreeHttpTelemetry(hParsed.ast, hSrc);
          }

          registerRoute({
            path: pVal,
            methods: declaredMethods,
            method_source: methodSource,
            dispatcher: 'server/routes.js',
            handler_file: handlerFile,
            handler_symbol: 'default',
            line: node.loc?.start?.line || 1,
            auth_requirement: authReq,
            authentication_evidence: authEv,
            authorization_summary: authzInfo.level,
            authorization_confidence: authzInfo.confidence,
            authorization_evidence: authzInfo.evidence,
            authorization_by_method: authzByMethod,
            age_gate_exempt_methods: declaredAccess === 'public' ? declaredMethods : [],
            status_codes: telemetry.status_codes,
            error_codes: telemetry.error_codes,
            observed_response_keys: telemetry.observed_response_keys,
            db_tables_touched: telemetry.db_tables
          });
        }
      });
    }
  }

  // 2. `server/app.js` AST-bounded built-in platform, auth & staging-probe routes
  const appSrc = fileContentsByPath.get('server/app.js') || '';
  if (appSrc) {
    const parsedApp = parseJavaScriptSource(appSrc, { filePath: 'server/app.js' });
    if (parsedApp.ok) {
      const intraAppHelpers = buildIntraFileHelperSignals(parsedApp.ast);
      walkAst(parsedApp.ast, node => {
        if (node.type !== 'IfStatement') return;
        const routePaths = extractRoutePathsFromTestExpr(node.test);
        for (const rPath of routePaths) {
          // Skip `/api/features` if handled in `server/admin-routes.js` (`isGovernanceApiPath`)
          if (rPath === '/api/features' || rPath === '/api/me/photos' || rPath === '/api/onboarding/evidence' || rPath === '/api/diagnostics/report') {
            continue;
          }
          const mInfo = extractMethodsAndBranchesFromConsequent(node.consequent);
          const sigs = collectPermissionSignalsFromAst(node.consequent, intraAppHelpers);
          const telem = extractSubtreeHttpTelemetry(node.consequent, appSrc);

          let authReq = 'public';
          const authEv = [`server/app.js:L${node.loc?.start?.line || 1}`];
          let authzSummary = 'public_endpoint';
          let handlerFile = 'server/app.js';
          let handlerSym = 'createStandaloneServer';

          if (rPath === '/api/healthz') {
            // `/api/healthz` accepts GET/HEAD (`if (method !== 'GET' && method !== 'HEAD')`)
            authReq = 'public';
            authzSummary = 'public_health_probe';
          } else if (rPath.startsWith('/api/auth/')) {
            handlerFile = 'lib/standalone-auth.js';
            if (rPath === '/api/auth/start') {
              authReq = 'public';
              authzSummary = 'csrf_client_header_and_rate_limit';
              handlerSym = 'startEmailOtpChallenge';
            } else if (rPath === '/api/auth/verify') {
              authReq = 'public';
              authzSummary = 'otp_verification_and_rate_limit';
              handlerSym = 'verifyEmailOtpChallenge';
            } else if (rPath === '/api/auth/session') {
              authReq = 'public_or_session';
              authzSummary = 'session_cookie_inspection';
              handlerSym = 'resolveSessionFromRequest';
            } else if (rPath === '/api/auth/age-assessment') {
              authReq = 'authenticated_pending_age';
              authzSummary = 'self_session_only';
              handlerSym = 'submitExistingAccountAgeAssessment';
            } else if (rPath === '/api/auth/logout') {
              authReq = 'public_or_session';
              authzSummary = 'csrf_origin_checked';
              handlerSym = 'revokeSessionFromRequest';
            } else if (rPath === '/api/auth/staging-mailbox') {
              authReq = 'internal_mailbox_secret';
              authzSummary = 'staging_loopback_operator_secret_only';
              handlerSym = 'readProtectedStagingMailboxCode';
            }
          } else if (rPath === '/api/_staging_gate_probe') {
            authReq = 'authenticated_14_plus_and_staging_flag';
            authzSummary = 'staging_probe_secret_and_top_admin';
            handlerFile = 'lib/staging-gate-probe.js';
            handlerSym = 'default';
          }

          registerRoute({
            path: rPath,
            methods: mInfo.methods,
            method_source: mInfo.method_source,
            dispatcher: 'server/app.js',
            handler_file: handlerFile,
            handler_symbol: handlerSym,
            line: node.loc?.start?.line || 1,
            auth_requirement: authReq,
            authentication_evidence: authEv,
            authorization_summary: authzSummary,
            authorization_confidence: 'confirmed_static',
            authorization_evidence: [...sigs.evidenceList].sort(asciiCompare),
            authorization_by_method: Object.fromEntries(
              mInfo.methods.map(m => [m, { level: authzSummary, confidence: 'confirmed_static', evidence: authEv }])
            ),
            age_gate_exempt_methods: rPath.startsWith('/api/auth/') || rPath === '/api/healthz' ? mInfo.methods : [],
            status_codes: telem.status_codes,
            error_codes: telem.error_codes,
            observed_response_keys: telem.observed_response_keys,
            db_tables_touched: telem.db_tables
          });
        }
      });
    }
  }

  // 3. `server/admin-routes.js` & `server/customer-exploration-routes.js` (AST statement-sequential & branch-bounded)
  for (const routerFile of ['server/admin-routes.js', 'server/customer-exploration-routes.js']) {
    const src = fileContentsByPath.get(routerFile);
    if (!src) continue;
    const parsed = parseJavaScriptSource(src, { filePath: routerFile });
    if (!parsed.ok) continue;

    const intraHelpers = buildIntraFileHelperSignals(parsed.ast);
    const handlerSym =
      routerFile === 'server/customer-exploration-routes.js'
        ? 'handleCustomerExplorationRoute'
        : 'handleGovernanceApiRequest';

    // Find exported router functions and walk their top-level statement blocks sequentially
    for (const topStmt of parsed.ast.body) {
      const decl = topStmt.type === 'ExportNamedDeclaration' ? topStmt.declaration : topStmt;
      if (decl?.type !== 'FunctionDeclaration' || !decl.body?.body) continue;

      let activeRouterAuth = null; // { level, evidence }
      let activeRouterAuthz = null; // { level, evidence }

      for (const stmt of decl.body.body) {
        if (stmt.type !== 'IfStatement') continue;
        const matchedRoutePaths = extractRoutePathsFromTestExpr(stmt.test);

        // Check if this `IfStatement` is a router-wide early-return guard (not a specific route branch)
        if (matchedRoutePaths.length === 0 && blockAlwaysReturns(stmt.consequent)) {
          const testSrc = src.slice(stmt.test.start, stmt.test.end);
          const guardLine = stmt.loc?.start?.line || 1;
          if (/!\s*(?:ctx\.authenticated|verifiedUser)\b/.test(testSrc)) {
            activeRouterAuth = {
              level: 'authenticated_14_plus',
              evidence: `${routerFile}:L${guardLine}(router_auth_guard)`
            };
          }
          if (/!\s*ctx\.(?:isModAdmin|isModerator)\b/.test(testSrc)) {
            activeRouterAuthz = {
              level: 'admin_mod_or_top',
              evidence: `${routerFile}:L${guardLine}(router_mod_admin_guard)`
            };
          } else if (/!\s*ctx\.(?:isTopAdmin|isPlatformAdmin)\b/.test(testSrc)) {
            activeRouterAuthz = {
              level: 'admin_top_only',
              evidence: `${routerFile}:L${guardLine}(router_top_admin_guard)`
            };
          }
          continue;
        }

        // Route-specific `IfStatement`: analyze ONLY `stmt.consequent`!
        for (const rPath of matchedRoutePaths) {
          const mInfo = extractMethodsAndBranchesFromConsequent(stmt.consequent);
          const branchSignals = collectPermissionSignalsFromAst(stmt.consequent, intraHelpers);
          const telem = extractSubtreeHttpTelemetry(stmt.consequent, src);
          const exemptSet = ageExemptMap.get(rPath) || new Set();

          // Determine authentication requirement from router guard + branch guard + age-policy allowlist
          let authReq = 'public';
          const authEvidence = [];
          if (activeRouterAuth) {
            authReq = activeRouterAuth.level;
            authEvidence.push(activeRouterAuth.evidence);
          } else if (branchSignals.requiresAuthGuard) {
            // Check if route is on `EXEMPT_GOVERNANCE_METHODS_BY_PATH` while still requiring auth (e.g. `/api/issues*`)
            const allMethodsExemptAge =
              mInfo.methods.length > 0 && mInfo.methods.every(m => exemptSet.has(m));
            authReq = allMethodsExemptAge ? 'authenticated_age_exempt_support' : 'authenticated_14_plus';
            authEvidence.push(`${routerFile}:L${stmt.loc?.start?.line || 1}(ctx.authenticated)`);
          } else if (rPath === '/api/account/context' || rPath === '/api/features') {
            authReq = 'public_or_session';
            authEvidence.push(`${routerFile}:L${stmt.loc?.start?.line || 1}(optional_session_projection)`);
          } else {
            authReq = 'public';
            authEvidence.push(`${routerFile}:L${stmt.loc?.start?.line || 1}(anonymous_allowed)`);
          }

          if (authReq === 'authenticated_14_plus') {
            authEvidence.push('server/app.js:central_14plus_age_gate');
          }

          // Determine per-method and overall authorization from actual AST calls
          const authzByMethod = {};
          const distinctMethodLevels = new Set();
          for (const m of mInfo.methods) {
            const subNodes = mInfo.methodBranches.get(m);
            let mAuthz;
            if (subNodes && subNodes.length > 0) {
              const subSignals = collectPermissionSignalsFromAst(
                { type: 'BlockStatement', body: subNodes },
                intraHelpers
              );
              mAuthz = classifyAuthorizationFromSignals(subSignals, {
                routerEntryAuthz: activeRouterAuthz,
                defaultAccess: authReq === 'public' ? 'public' : 'user'
              });
            } else {
              mAuthz = classifyAuthorizationFromSignals(branchSignals, {
                routerEntryAuthz: activeRouterAuthz,
                defaultAccess: authReq === 'public' ? 'public' : 'user'
              });
            }
            authzByMethod[m] = mAuthz;
            distinctMethodLevels.add(mAuthz.level);
          }

          const overallAuthz =
            distinctMethodLevels.size === 1
              ? [...distinctMethodLevels][0]
              : distinctMethodLevels.size > 1
                ? `method_specific(${mInfo.methods.map(m => `${m}:${authzByMethod[m].level}`).join(', ')})`
                : classifyAuthorizationFromSignals(branchSignals, {
                    routerEntryAuthz: activeRouterAuthz,
                    defaultAccess: authReq === 'public' ? 'public' : 'user'
                  }).level;

          const allAuthzEv = [
            ...new Set([
              ...(activeRouterAuthz ? [activeRouterAuthz.evidence] : []),
              ...branchSignals.evidenceList
            ])
          ].sort(asciiCompare);

          registerRoute({
            path: rPath,
            methods: mInfo.methods,
            method_source: mInfo.method_source,
            dispatcher: 'server/admin-routes.js',
            handler_file: routerFile,
            handler_symbol: handlerSym,
            line: stmt.loc?.start?.line || 1,
            auth_requirement: authReq,
            authentication_evidence: authEvidence,
            authorization_summary: overallAuthz,
            authorization_confidence: mInfo.methods.length > 0 ? 'confirmed_static' : 'unresolved',
            authorization_evidence: allAuthzEv,
            authorization_by_method: authzByMethod,
            age_gate_exempt_methods: [...exemptSet].filter(m => mInfo.methods.includes(m)).sort(asciiCompare),
            status_codes: telem.status_codes,
            error_codes: telem.error_codes,
            observed_response_keys: telem.observed_response_keys,
            db_tables_touched: telem.db_tables
          });
        }
      }
    }
  }

  // Cross-reference callers (`public/*.js`) & 3-tier test evidence (`tests/*.cjs` + `shared-contracts.json`)
  const testFiles = [];
  for (const [fPath, content] of fileContentsByPath.entries()) {
    if (fPath.startsWith('tests/') && /\.(cjs|m?js)$/i.test(fPath)) {
      testFiles.push({
        file: fPath,
        content,
        jsData: jsAnalysesByPath.get(fPath) || null
      });
    }
  }

  const allFrontendConsumers = [];
  for (const [fPath, jsData] of jsAnalysesByPath.entries()) {
    if (fPath.startsWith('public/') || fPath.includes('.html#inline')) {
      for (const c of jsData.api_consumers || []) {
        allFrontendConsumers.push({
          ...c,
          normalized: normalizeConsumerUrlForRouteMatch(c.url_pattern)
        });
      }
    }
  }

  for (const r of routes) {
    const confirmedFrontend = new Set();
    const inferredFrontend = new Set();

    for (const c of allFrontendConsumers) {
      if (!c.normalized.prefixDynamic && c.normalized.basePath === r.path) {
        confirmedFrontend.add(`${c.file}:${c.caller}`);
      } else if (
        c.normalized.prefixDynamic &&
        c.normalized.basePath.length >= 6 &&
        r.path.startsWith(c.normalized.basePath)
      ) {
        inferredFrontend.add(`${c.file}:${c.caller}`);
      }
    }

    r.known_frontend_callers = [...confirmedFrontend].sort(asciiCompare);
    r.inferred_frontend_callers = [...inferredFrontend]
      .filter(x => !confirmedFrontend.has(x))
      .sort(asciiCompare);

    // 3-Tier Test Evidence (`Section 9`): never label string mentions as "verifying_tests"!
    const contractTestMappings = [];
    for (const ctr of contractsByRoutePath.get(r.path) || []) {
      for (const tm of ctr.test_mappings || []) {
        contractTestMappings.push({
          file: tm.file,
          contract_id: ctr.contract_id,
          protected_assertions: tm.protected_assertions || [],
          evidence_level: 'maintained_contract_mapping'
        });
      }
    }

    const staticHttpCallTests = new Set();
    const candidatePathMentions = new Set();

    for (const tf of testFiles) {
      for (const hc of tf.jsData?.test_http_calls || []) {
        const normHc = normalizeConsumerUrlForRouteMatch(hc.url_pattern);
        if (!normHc.prefixDynamic && normHc.basePath === r.path) {
          staticHttpCallTests.add(tf.file);
        }
      }
      if (matchesExactRouteStringInTest(tf.content, r.path)) {
        candidatePathMentions.add(tf.file);
      }
    }

    r.test_references = {
      contract_mappings: contractTestMappings,
      static_http_call_tests: [...staticHttpCallTests].sort(asciiCompare),
      candidate_path_mentions: [...candidatePathMentions].sort(asciiCompare)
    };
  }

  routes.sort((a, b) => asciiCompare(a.path, b.path));
  return routes;
}

// ============================================================================
// SQL Migrations & Reconstructed Schema Analyzer (`migrations/*.sql`)
// ============================================================================
function stripSqlComments(sql) {
  let out = '';
  let i = 0;
  while (i < sql.length) {
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
    if (sql[i] === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i++;
      continue;
    }
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

function recordTableConstraint(normDef, migrationFile, tableObj) {
  const conMatch = /^(?:CONSTRAINT\s+"?([A-Za-z0-9_]+)"?\s+)?(PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|CHECK)\b/i.exec(normDef);
  const conName = conMatch?.[1] ? conMatch[1].toLowerCase() : null;
  const conKind = conMatch?.[2] ? conMatch[2].replace(/\s+/g, ' ').toUpperCase() : 'OTHER';

  if (conName) {
    tableObj.constraints = tableObj.constraints.filter(c => c.name !== conName);
  }
  tableObj.constraints.push({
    name: conName,
    kind: conKind,
    definition: normDef,
    migration: migrationFile
  });

  const fkMatch =
    /FOREIGN\s+KEY\s*\(([^)]+)\)\s*REFERENCES\s+(?:public\.)?"?([A-Za-z0-9_]+)"?\s*\(([^)]+)\)(?:\s+ON\s+DELETE\s+(CASCADE|SET\s+NULL|RESTRICT|NO\s+ACTION))?/i.exec(
      normDef
    );
  if (fkMatch) {
    const fkCols = fkMatch[1].split(',').map(s => s.trim().replace(/^"|"$/g, ''));
    const refTable = fkMatch[2].toLowerCase();
    const refCols = fkMatch[3].split(',').map(s => s.trim().replace(/^"|"$/g, ''));
    const onDel = (fkMatch[4] || 'NO ACTION').replace(/\s+/g, ' ').toUpperCase();
    const existsFk = tableObj.foreign_keys.some(
      fk => fk.columns.join(',') === fkCols.join(',') && fk.references_table === refTable
    );
    if (!existsFk) {
      tableObj.foreign_keys.push({
        constraint_name: conName,
        columns: fkCols,
        references_table: refTable,
        references_columns: refCols,
        on_delete: onDel,
        migration: migrationFile
      });
    }
    if (fkCols.length === 1) {
      const col = tableObj.columns.find(c => c.name.toLowerCase() === fkCols[0].toLowerCase());
      if (col && !col.references_table) {
        col.references_table = refTable;
        col.references_column = refCols[0] || 'id';
        col.on_delete = onDel;
      }
    }
  }

  const pkMatch = /PRIMARY\s+KEY\s*\(([^)]+)\)/i.exec(normDef);
  if (pkMatch) {
    const pkCols = pkMatch[1].split(',').map(s => s.trim().replace(/^"|"$/g, '').toLowerCase());
    for (const c of tableObj.columns) {
      if (pkCols.includes(c.name.toLowerCase())) {
        c.primary_key = true;
        c.not_null = true;
      }
    }
  }
}

function parseColumnOrConstraintItem(item, migrationFile, tableObj) {
  const norm = item.replace(/\s+/g, ' ').trim();
  if (/^(CONSTRAINT\s+"?[A-Za-z0-9_]+"?\s+)?(PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|CHECK)\b/i.test(norm)) {
    recordTableConstraint(norm, migrationFile, tableObj);
    return;
  }

  const colMatch = /^"?([A-Za-z0-9_]+)"?\s+(.+)$/.exec(norm);
  if (!colMatch) return;
  const colName = colMatch[1];
  const rest = colMatch[2];

  const kwIdx = rest.search(
    /\b(PRIMARY\s+KEY|NOT\s+NULL|NULL\b|DEFAULT\b|REFERENCES\b|UNIQUE\b|CHECK\b|CONSTRAINT\b|GENERATED\b)/i
  );
  const sqlType = (kwIdx === -1 ? rest : rest.slice(0, kwIdx)).trim();
  const isPk = /\bPRIMARY\s+KEY\b/i.test(rest);
  const isUniqueInline = /\bUNIQUE\b/i.test(rest);
  const hasCheckInline = /\bCHECK\s*\(/i.test(rest);
  const notNull = isPk || /\bNOT\s+NULL\b/i.test(rest);
  const defMatch =
    /\bDEFAULT\s+(.+?)(?=\s+(?:NOT\s+NULL|NULL\b|PRIMARY\s+KEY|REFERENCES|UNIQUE|CHECK|CONSTRAINT)|$)/i.exec(rest);
  const refMatch =
    /\bREFERENCES\s+(?:public\.)?"?([A-Za-z0-9_]+)"?(?:\s*\(([^)]+)\))?(?:\s+ON\s+DELETE\s+(CASCADE|SET\s+NULL|RESTRICT|NO\s+ACTION))?/i.exec(
      rest
    );

  if (isPk) {
    tableObj.constraints.push({
      name: `${tableObj.table_name}_pkey`,
      kind: 'PRIMARY KEY',
      definition: `PRIMARY KEY (${colName})`,
      migration: migrationFile
    });
  }
  if (isUniqueInline) {
    tableObj.constraints.push({
      name: `${tableObj.table_name}_${colName}_key`,
      kind: 'UNIQUE',
      definition: `UNIQUE (${colName})`,
      migration: migrationFile
    });
  }
  if (hasCheckInline) {
    const chkNameMatch = /\bCONSTRAINT\s+"?([A-Za-z0-9_]+)"?\s+CHECK/i.exec(rest);
    const chkName = chkNameMatch ? chkNameMatch[1].toLowerCase() : `${tableObj.table_name}_${colName}_check`;
    tableObj.constraints.push({
      name: chkName,
      kind: 'CHECK',
      definition: `CHECK on ${colName}`,
      migration: migrationFile
    });
  }

  const existing = tableObj.columns.find(c => c.name === colName);
  const colRecord = {
    name: colName,
    sql_type: sqlType,
    not_null: notNull,
    primary_key: isPk,
    default_expr: defMatch ? defMatch[1].trim() : null,
    references_table: refMatch ? refMatch[1].toLowerCase() : existing?.references_table || null,
    references_column: refMatch ? (refMatch[2] || 'id').trim() : existing?.references_column || null,
    on_delete: refMatch
      ? (refMatch[3] || 'NO ACTION').replace(/\s+/g, ' ').toUpperCase()
      : existing?.on_delete || null,
    added_in_migration: existing?.added_in_migration || migrationFile
  };

  if (existing) {
    // `ADD COLUMN IF NOT EXISTS` should not clobber existing column definition
    return;
  }
  tableObj.columns.push(colRecord);

  if (refMatch) {
    tableObj.foreign_keys.push({
      constraint_name: `${tableObj.table_name}_${colName}_fkey`,
      columns: [colName],
      references_table: refMatch[1].toLowerCase(),
      references_columns: [(refMatch[2] || 'id').trim()],
      on_delete: (refMatch[3] || 'NO ACTION').replace(/\s+/g, ' ').toUpperCase(),
      migration: migrationFile
    });
  }
}

function applyAlterTableClause(clause, migrationFile, tbl, manualReviewReasons) {
  const norm = clause.replace(/\s+/g, ' ').trim();
  if (!norm) return;

  if (/^ENABLE\s+ROW\s+LEVEL\s+SECURITY$/i.test(norm)) {
    tbl.rls_enabled = true;
    return;
  }
  if (/^DISABLE\s+ROW\s+LEVEL\s+SECURITY$/i.test(norm)) {
    tbl.rls_enabled = false;
    return;
  }
  if (/^FORCE\s+ROW\s+LEVEL\s+SECURITY$/i.test(norm)) {
    tbl.rls_forced = true;
    return;
  }
  if (/^NO\s+FORCE\s+ROW\s+LEVEL\s+SECURITY$/i.test(norm)) {
    tbl.rls_forced = false;
    return;
  }

  const addColMatch = /^ADD\s+(?:COLUMN\s+)?(?:IF\s+NOT\s+EXISTS\s+)?(.+)$/i.exec(norm);
  if (addColMatch && !/^(?:CONSTRAINT|PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|CHECK)\b/i.test(addColMatch[1])) {
    parseColumnOrConstraintItem(addColMatch[1], migrationFile, tbl);
    return;
  }

  const dropColMatch = /^DROP\s+(?:COLUMN\s+)?(?:IF\s+EXISTS\s+)?"?([A-Za-z0-9_]+)"?(?:\s+(?:CASCADE|RESTRICT))?$/i.exec(
    norm
  );
  if (dropColMatch && !/^CONSTRAINT$/i.test(dropColMatch[1])) {
    const colLower = dropColMatch[1].toLowerCase();
    tbl.columns = tbl.columns.filter(c => c.name.toLowerCase() !== colLower);
    return;
  }

  const dropConMatch = /^DROP\s+CONSTRAINT\s+(?:IF\s+EXISTS\s+)?"?([A-Za-z0-9_]+)"?(?:\s+(?:CASCADE|RESTRICT))?$/i.exec(
    norm
  );
  if (dropConMatch) {
    const conLower = dropConMatch[1].toLowerCase();
    tbl.constraints = tbl.constraints.filter(c => c.name !== conLower);
    tbl.foreign_keys = tbl.foreign_keys.filter(fk => fk.constraint_name !== conLower);
    return;
  }

  const addConMatch = /^ADD\s+((?:CONSTRAINT\s+"?[A-Za-z0-9_]+"?\s+)?(?:PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|CHECK)\b[\s\S]+)$/i.exec(
    norm
  );
  if (addConMatch) {
    recordTableConstraint(addConMatch[1], migrationFile, tbl);
    return;
  }

  const alterColMatch = /^ALTER\s+(?:COLUMN\s+)?"?([A-Za-z0-9_]+)"?\s+(.+)$/i.exec(norm);
  if (alterColMatch) {
    const colName = alterColMatch[1];
    const action = alterColMatch[2].trim();
    const col = tbl.columns.find(c => c.name.toLowerCase() === colName.toLowerCase());
    if (!col) {
      manualReviewReasons.push(`ALTER COLUMN on unknown column ${tbl.table_name}.${colName}`);
      return;
    }
    if (/^SET\s+NOT\s+NULL$/i.test(action)) {
      col.not_null = true;
    } else if (/^DROP\s+NOT\s+NULL$/i.test(action)) {
      col.not_null = false;
    } else if (/^DROP\s+DEFAULT$/i.test(action)) {
      col.default_expr = null;
    } else if (/^SET\s+DEFAULT\s+(.+)$/i.test(action)) {
      col.default_expr = action.replace(/^SET\s+DEFAULT\s+/i, '').trim();
    } else if (/^(?:SET\s+DATA\s+)?TYPE\s+(.+)$/i.test(action)) {
      const rawType = action.replace(/^(?:SET\s+DATA\s+)?TYPE\s+/i, '').split(/\bUSING\b/i)[0].trim();
      col.sql_type = rawType;
    } else {
      manualReviewReasons.push(`Unsupported ALTER COLUMN clause on ${tbl.table_name}.${colName}: ${action}`);
    }
    return;
  }

  manualReviewReasons.push(`Unrecognized ALTER TABLE clause on ${tbl.table_name}: ${norm.slice(0, 80)}`);
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

  const sortedMigrations = [...migrationFiles].sort((a, b) => asciiCompare(a.filename, b.filename));

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
    const manualReviewReasons = [];

    // Inspect DO $$ procedural blocks for unsupported dynamic SQL (`EXECUTE`, loops)
    for (const doMatch of clean.matchAll(/\bDO\s+(\$[A-Za-z0-9_]*\$)([\s\S]*?)\1\s*;/gi)) {
      const doBody = doMatch[2];
      if (/\bEXECUTE\b|\bFOR\s+[A-Za-z0-9_]+\s+IN\b/i.test(doBody)) {
        manualReviewReasons.push('Contains dynamic PL/pgSQL EXECUTE or loop inside DO $$ block.');
      }
    }

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

    // 2. DROP INDEX [IF EXISTS] <idx>
    for (const dim of clean.matchAll(/DROP\s+INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+EXISTS\s+)?(?:public\.)?"?([A-Za-z0-9_]+)"?\s*;/gi)) {
      const droppedIdx = dim[1].toLowerCase();
      for (const tbl of tablesMap.values()) {
        tbl.indexes = tbl.indexes.filter(ix => ix.name.toLowerCase() !== droppedIdx);
      }
    }

    // 3. DROP POLICY [IF EXISTS] <pol> ON <table>
    for (const dpm of clean.matchAll(/DROP\s+POLICY\s+(?:IF\s+EXISTS\s+)?"?([A-Za-z0-9_]+)"?\s+ON\s+(?:public\.)?"?([A-Za-z0-9_]+)"?\s*;/gi)) {
      const polLower = dpm[1].toLowerCase();
      const tName = dpm[2].toLowerCase();
      if (tablesMap.has(tName)) {
        const tbl = tablesMap.get(tName);
        tbl.rls_policies = tbl.rls_policies.filter(p => p.policy_name.toLowerCase() !== polLower);
      }
    }

    // 4. ALTER TABLE ... (splitting top-level comma-separated clauses cleanly; supports EOF without trailing semicolon)
    const alterRe = /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(?:public\.)?"?([A-Za-z0-9_]+)"?\s+([\s\S]*?)(?:;|\s*$)/gi;
    let am;
    while ((am = alterRe.exec(clean)) !== null) {
      const tName = am[1].toLowerCase();
      const body = am[2].trim();
      const tbl = ensureTable(tName);
      tablesAltered.add(tName);
      if (!tbl.altered_in_migrations.includes(mig.filename) && tbl.created_in_migration !== mig.filename) {
        tbl.altered_in_migrations.push(mig.filename);
      }
      for (const clause of splitTopLevelCommas(body)) {
        applyAlterTableClause(clause, mig.filename, tbl, manualReviewReasons);
      }
    }

    // 5. CREATE [UNIQUE] INDEX ...
    const idxRe =
      /CREATE\s+(UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?"?([A-Za-z0-9_]+)"?\s+ON\s+(?:public\.)?"?([A-Za-z0-9_]+)"?\s+([^;]+);/gi;
    let im;
    while ((im = idxRe.exec(clean)) !== null) {
      const isUnique = Boolean(im[1]);
      const idxName = im[2];
      const tName = im[3].toLowerCase();
      const restDef = im[4].replace(/\s+/g, ' ').trim();
      const whereIdx = restDef.search(/\bWHERE\b/i);
      const tbl = ensureTable(tName);
      if (!tbl.indexes.some(ix => ix.name.toLowerCase() === idxName.toLowerCase())) {
        tbl.indexes.push({
          name: idxName,
          unique: isUnique,
          partial_where: whereIdx !== -1 ? restDef.slice(whereIdx + 5).trim() : null,
          definition: restDef,
          migration: mig.filename
        });
      }
      indexesCreated.push(idxName);
    }

    // 6. CREATE POLICY <name> ON <table> ...
    const polRe = /CREATE\s+POLICY\s+"?([A-Za-z0-9_]+)"?\s+ON\s+(?:public\.)?"?([A-Za-z0-9_]+)"?\s+([\s\S]*?);/gi;
    let pm;
    while ((pm = polRe.exec(clean)) !== null) {
      const polName = pm[1];
      const tName = pm[2].toLowerCase();
      const polBody = pm[3].replace(/\s+/g, ' ').trim();
      const cmdMatch = /\bFOR\s+(ALL|SELECT|INSERT|UPDATE|DELETE)\b/i.exec(polBody);
      const gucKeys = [...new Set([...polBody.matchAll(/current_setting\(\s*'([^']+)'/gi)].map(x => x[1]))].sort(
        asciiCompare
      );
      const tbl = ensureTable(tName);
      tbl.rls_policies = tbl.rls_policies.filter(p => p.policy_name.toLowerCase() !== polName.toLowerCase());
      tbl.rls_policies.push({
        policy_name: polName,
        command: (cmdMatch ? cmdMatch[1] : 'ALL').toUpperCase(),
        guc_keys: gucKeys,
        expression: polBody,
        migration: mig.filename
      });
      policiesCreated.push(`${tName}.${polName}`);
    }

    // 7. CREATE [OR REPLACE] VIEW (avoiding inside comments since `clean` is comment-stripped; ignore FUNCTION $$ bodies!)
    const cleanOutsideDollarQuotes = clean.replace(
      /(\$[A-Za-z0-9_]*\$)[\s\S]*?\1/g,
      match => '\n'.repeat(match.split('\n').length - 1)
    );

    for (const vm of cleanOutsideDollarQuotes.matchAll(
      /CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+(?:public\.)?"?([A-Za-z0-9_]+)"?/gi
    )) {
      views.push({ view_name: vm[1].toLowerCase(), migration: mig.filename });
    }

    // 8. CREATE [OR REPLACE] FUNCTION
    for (const fm of cleanOutsideDollarQuotes.matchAll(
      /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?"?([A-Za-z0-9_]+)"?\s*\(([^)]*)\)/gi
    )) {
      const fnName = fm[1].toLowerCase();
      const existingFn = sqlFunctions.findIndex(x => x.function_name === fnName);
      const rec = {
        function_name: fnName,
        args: fm[2].replace(/\s+/g, ' ').trim(),
        migration: mig.filename
      };
      if (existingFn !== -1) sqlFunctions[existingFn] = rec;
      else sqlFunctions.push(rec);
      funcsCreated.push(fnName);
    }

    // 9. CREATE TRIGGER
    for (const trm of cleanOutsideDollarQuotes.matchAll(
      /CREATE\s+TRIGGER\s+"?([A-Za-z0-9_]+)"?\s+(BEFORE|AFTER|INSTEAD\s+OF)\s+([A-Z\s]+?)\s+ON\s+(?:public\.)?"?([A-Za-z0-9_]+)"?/gi
    )) {
      const trigName = trm[1].toLowerCase();
      const rec = {
        trigger_name: trigName,
        timing: trm[2].toUpperCase(),
        events: trm[3].replace(/\s+/g, ' ').trim().toUpperCase(),
        table_name: trm[4].toLowerCase(),
        migration: mig.filename
      };
      const existingTr = triggers.findIndex(x => x.trigger_name === trigName && x.table_name === rec.table_name);
      if (existingTr !== -1) triggers[existingTr] = rec;
      else triggers.push(rec);
      trigsCreated.push(trigName);
    }

    migrations.push({
      sequence_number: seqNumber,
      filename: mig.filename,
      sha256,
      tables_created: tablesCreated,
      tables_altered: [...tablesAltered].sort(asciiCompare),
      indexes_created: indexesCreated,
      policies_created: policiesCreated,
      functions_created: funcsCreated,
      triggers_created: trigsCreated,
      contains_seed_data: /\bINSERT\s+INTO\s+vendors\b/i.test(cleanOutsideDollarQuotes),
      requires_manual_migration_review: manualReviewReasons.length > 0,
      manual_review_reasons: manualReviewReasons
    });
  }

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

  if (runMigrationsSource.includes('CREATE TABLE IF NOT EXISTS schema_migrations')) {
    const sm = ensureTable('schema_migrations', 'scripts/run-migrations.cjs');
    if (sm.columns.length === 0) {
      sm.columns.push(
        {
          name: 'filename',
          sql_type: 'TEXT',
          not_null: true,
          primary_key: true,
          default_expr: null,
          references_table: null,
          references_column: null,
          on_delete: null,
          added_in_migration: 'scripts/run-migrations.cjs'
        },
        {
          name: 'checksum_sha256',
          sql_type: 'TEXT',
          not_null: true,
          primary_key: false,
          default_expr: null,
          references_table: null,
          references_column: null,
          on_delete: null,
          added_in_migration: 'scripts/run-migrations.cjs'
        },
        {
          name: 'applied_at',
          sql_type: 'TIMESTAMPTZ',
          not_null: true,
          primary_key: false,
          default_expr: 'now()',
          references_table: null,
          references_column: null,
          on_delete: null,
          added_in_migration: 'scripts/run-migrations.cjs'
        }
      );
      sm.constraints.push({
        name: 'schema_migrations_pkey',
        kind: 'PRIMARY KEY',
        definition: 'PRIMARY KEY (filename)',
        migration: 'scripts/run-migrations.cjs'
      });
    }
  }

  const tables = [...tablesMap.values()].sort((a, b) => asciiCompare(a.table_name, b.table_name));
  return {
    schema_basis: 'reconstructed_from_repository_migrations',
    database_verified: false,
    migrations,
    tables,
    views: views.sort((a, b) => asciiCompare(a.view_name, b.view_name)),
    sql_functions: sqlFunctions.sort((a, b) => asciiCompare(a.function_name, b.function_name)),
    triggers: triggers.sort((a, b) => asciiCompare(a.trigger_name, b.trigger_name)),
    role_grants: roleGrants
  };
}

export function generateMermaidErDiagram(tables = []) {
  const lines = ['erDiagram'];
  for (const t of tables) {
    lines.push(`  ${t.table_name} {`);
    for (const c of t.columns.slice(0, 14)) {
      const cleanType = String(c.sql_type || 'text')
        .replace(/[^A-Za-z0-9_]/g, '_')
        .replace(/^_+|_+$/g, '')
        .toLowerCase();
      const tag = c.primary_key ? ' PK' : c.references_table ? ' FK' : '';
      lines.push(`    ${cleanType || 'text'} ${c.name}${tag}`);
    }
    lines.push(`  }`);
  }
  for (const t of tables) {
    for (const fk of t.foreign_keys || []) {
      lines.push(`  ${fk.references_table} ||--o{ ${t.table_name} : "${fk.columns.join(',')}"`);
    }
  }
  return lines.join('\n');
}
