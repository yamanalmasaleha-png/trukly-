// BiteShark Code Registry — Syntax-Aware JavaScript / Module / Browser Script AST Analyzer
// (`tools/code-registry/js-analyzer.mjs`)
//
// Uses vendored `acorn@8.14.1` (MIT) to parse ESM (`api/`, `lib/`, `server/`, `packages/`),
// CommonJS (`scripts/*.cjs`, `tests/*.cjs`), classic browser scripts (`public/*.js`), and inline
// HTML event/script snippets without executing untrusted code.

import * as acorn from './vendor/acorn/acorn.mjs';

function stripShebangPreservingLines(source) {
  if (source.startsWith('#!')) {
    const nl = source.indexOf('\n');
    if (nl === -1) return ' '.repeat(source.length);
    return ' '.repeat(nl) + source.slice(nl);
  }
  return source;
}

export function parseJavaScriptSource(source, { filePath = '<inline>', preferScript = false } = {}) {
  const clean = stripShebangPreservingLines(source);
  const modes = preferScript ? ['script', 'module'] : ['module', 'script'];
  let lastErr = null;

  for (const mode of modes) {
    try {
      const ast = acorn.parse(clean, {
        ecmaVersion: 'latest',
        sourceType: mode,
        locations: true,
        allowHashBang: true,
        allowReturnOutsideFunction: mode === 'script'
      });
      return { ok: true, ast, sourceType: mode, error: null };
    } catch (err) {
      lastErr = err;
    }
  }

  return {
    ok: false,
    ast: null,
    sourceType: null,
    error: {
      file: filePath,
      line: lastErr?.loc?.line || 1,
      column: lastErr?.loc?.column || 0,
      message: String(lastErr?.message || 'Unknown JavaScript syntax error')
    }
  };
}

function formatParamNode(param) {
  if (!param) return { name: 'unknown', observed_type: 'unknown', kind: 'identifier' };
  if (param.type === 'Identifier') {
    return { name: param.name, observed_type: 'unknown', type_basis: 'undeclared', kind: 'identifier' };
  }
  if (param.type === 'AssignmentPattern') {
    const left = formatParamNode(param.left);
    let inferred = 'unknown';
    if (param.right.type === 'Literal') {
      inferred = param.right.value === null ? 'null_or_object' : typeof param.right.value;
    } else if (param.right.type === 'ObjectExpression') {
      inferred = 'object';
    } else if (param.right.type === 'ArrayExpression') {
      inferred = 'array';
    } else if (param.right.type === 'NewExpression' && param.right.callee?.name === 'Date') {
      inferred = 'Date';
    }
    return {
      name: left.name,
      observed_type: inferred,
      type_basis: inferred === 'unknown' ? 'undeclared' : 'inferred_from_default',
      kind: 'default_param'
    };
  }
  if (param.type === 'ObjectPattern') {
    const keys = param.properties
      .map(p => {
        if (p.type === 'RestElement') return '...' + (p.argument?.name || 'rest');
        return p.key?.name || p.key?.value || '?';
      })
      .slice(0, 12);
    return {
      name: `{ ${keys.join(', ')} }`,
      observed_type: 'object',
      type_basis: 'inferred_from_destructuring',
      kind: 'destructured_object'
    };
  }
  if (param.type === 'ArrayPattern') {
    return {
      name: '[...]',
      observed_type: 'array',
      type_basis: 'inferred_from_destructuring',
      kind: 'destructured_array'
    };
  }
  if (param.type === 'RestElement') {
    return {
      name: '...' + (param.argument?.name || 'args'),
      observed_type: 'array',
      type_basis: 'inferred_from_rest',
      kind: 'rest_param'
    };
  }
  return { name: 'param', observed_type: 'unknown', type_basis: 'undeclared', kind: param.type };
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

function getStaticStringValue(node) {
  if (!node) return null;
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0 && node.quasis.length === 1) {
    return node.quasis[0].value.cooked ?? node.quasis[0].value.raw ?? '';
  }
  return null;
}

function getPartialTemplatePrefix(node) {
  if (!node) return null;
  const exact = getStaticStringValue(node);
  if (exact !== null) return { value: exact, dynamic: false };
  if (node.type === 'TemplateLiteral' && node.quasis.length > 0) {
    const joined = node.quasis.map(q => q.value.cooked ?? q.value.raw ?? '').join(':expr');
    return { value: joined, dynamic: true };
  }
  if (node.type === 'BinaryExpression' && node.operator === '+') {
    const left = getPartialTemplatePrefix(node.left);
    const right = getPartialTemplatePrefix(node.right);
    if (left && right) {
      return { value: left.value + right.value, dynamic: left.dynamic || right.dynamic };
    }
    if (left) return { value: left.value + ':expr', dynamic: true };
    if (right) return { value: ':expr' + right.value, dynamic: true };
  }
  return null;
}

function extractDynamicMarkupIdsAndAttrs(str, relPath, line) {
  const ids = [];
  const dataAttrs = [];
  for (const m of str.matchAll(/\bid\s*=\s*["']([A-Za-z0-9_:-]+)["']/g)) {
    ids.push({ id: m[1], file: relPath, line, dynamic_template: false });
  }
  for (const m of str.matchAll(/\bid\s*=\s*["']([A-Za-z0-9_:-]+)$/g)) {
    ids.push({ id: m[1] + '*', file: relPath, line, dynamic_template: true });
  }
  for (const m of str.matchAll(/\b(data-[a-z0-9-]+)\b/g)) {
    dataAttrs.push(m[1]);
  }
  return { ids, dataAttrs };
}

function collectAllStringFragments(node, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (node.type === 'Literal' && typeof node.value === 'string') {
    out.push({ text: node.value, line: node.loc?.start?.line || 1 });
    return out;
  }
  if (node.type === 'TemplateLiteral') {
    const combined = node.quasis.map(q => q.value.cooked ?? q.value.raw ?? '').join('');
    if (combined) out.push({ text: combined, line: node.loc?.start?.line || 1 });
    for (const ex of node.expressions) collectAllStringFragments(ex, out);
    return out;
  }
  if (node.type === 'BinaryExpression' && node.operator === '+') {
    collectAllStringFragments(node.left, out);
    collectAllStringFragments(node.right, out);
    return out;
  }
  if (node.type === 'ConditionalExpression') {
    collectAllStringFragments(node.consequent, out);
    collectAllStringFragments(node.alternate, out);
    return out;
  }
  if (node.type === 'CallExpression') {
    collectAllStringFragments(node.callee, out);
    for (const a of node.arguments) collectAllStringFragments(a, out);
  }
  return out;
}

function walkAst(node, ancestors, visitor) {
  if (!node || typeof node.type !== 'string') return;
  visitor(node, ancestors);
  const nextAncestors = [...ancestors, node];
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end') continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item.type === 'string') {
          walkAst(item, nextAncestors, visitor);
        }
      }
    } else if (child && typeof child.type === 'string') {
      walkAst(child, nextAncestors, visitor);
    }
  }
}

function enclosingFunctionName(ancestors) {
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const a = ancestors[i];
    if (
      a.type === 'FunctionDeclaration' ||
      a.type === 'FunctionExpression' ||
      a.type === 'ArrowFunctionExpression'
    ) {
      return a.__registryName || '<top_level>';
    }
  }
  return '<top_level>';
}

function isTopLevelScope(ancestors) {
  return !ancestors.some(
    a =>
      a.type === 'FunctionDeclaration' ||
      a.type === 'FunctionExpression' ||
      a.type === 'ArrowFunctionExpression'
  );
}

export function analyzeJavaScriptFile(source, relPath) {
  const isBrowserPublicScript = relPath.startsWith('public/') && relPath.endsWith('.js') && relPath !== 'public/sw.js';
  const isCjs = relPath.endsWith('.cjs');
  const parsed = parseJavaScriptSource(source, {
    filePath: relPath,
    preferScript: isBrowserPublicScript || isCjs
  });

  if (!parsed.ok) {
    return {
      file: relPath,
      parse_ok: false,
      parse_error: parsed.error,
      source_type: null,
      symbols: [],
      classes: [],
      constants: [],
      imports: [],
      exports: [],
      globals_assigned: [],
      calls: [],
      dom_references: [],
      dynamic_dom_definitions: [],
      event_bindings: [],
      api_consumers: [],
      env_reads: [],
      feature_key_refs: [],
      storage_accesses: [],
      side_effect_only: false
    };
  }

  const ast = parsed.ast;
  const symbols = [];
  const classes = [];
  const constants = [];
  const imports = [];
  const exportsList = [];
  const globalsAssigned = [];
  const calls = [];
  const domReferences = [];
  const dynamicDomDefinitions = [];
  const eventBindings = [];
  const apiConsumers = [];
  const envReads = [];
  const featureKeyRefs = [];
  const writePauseRefs = [];
  const storageAccesses = [];
  const exportedNames = new Set();
  const functionScopedIdentifiers = new Set();

  // Pre-pass: collect local variable/parameter names declared inside non-top-level scopes so local reassignments (`data = ...`) are not misclassified as browser globals
  walkAst(ast, [], (n, anc) => {
    if (!isTopLevelScope(anc)) {
      if (n.type === 'VariableDeclarator' && n.id?.type === 'Identifier') {
        functionScopedIdentifiers.add(n.id.name);
      } else if (
        n.type === 'FunctionDeclaration' ||
        n.type === 'FunctionExpression' ||
        n.type === 'ArrowFunctionExpression'
      ) {
        if (n.id?.name) functionScopedIdentifiers.add(n.id.name);
        for (const p of n.params || []) {
          if (p.type === 'Identifier') functionScopedIdentifiers.add(p.name);
        }
      }
    }
  });

  // First pass: collect ESM exports & top-level names
  for (const stmt of ast.body) {
    if (stmt.type === 'ExportNamedDeclaration') {
      if (stmt.declaration) {
        const decl = stmt.declaration;
        if (decl.type === 'FunctionDeclaration' && decl.id?.name) {
          exportedNames.add(decl.id.name);
          exportsList.push({ name: decl.id.name, kind: 'function', line: decl.loc.start.line });
        } else if (decl.type === 'ClassDeclaration' && decl.id?.name) {
          exportedNames.add(decl.id.name);
          exportsList.push({ name: decl.id.name, kind: 'class', line: decl.loc.start.line });
        } else if (decl.type === 'VariableDeclaration') {
          for (const d of decl.declarations) {
            if (d.id?.type === 'Identifier') {
              exportedNames.add(d.id.name);
              exportsList.push({ name: d.id.name, kind: decl.kind, line: d.loc.start.line });
            }
          }
        }
      }
      for (const spec of stmt.specifiers || []) {
        const exported = spec.exported?.name || spec.exported?.value;
        if (exported) {
          exportedNames.add(exported);
          exportsList.push({ name: exported, kind: 'specifier', line: spec.loc.start.line });
        }
      }
    } else if (stmt.type === 'ExportDefaultDeclaration') {
      const dName = stmt.declaration?.id?.name || 'default';
      exportedNames.add('default');
      exportsList.push({ name: 'default', target: dName, kind: 'default', line: stmt.loc.start.line });
    }
  }

  let anonCounter = 0;

  // Second pass: full AST walk
  walkAst(ast, [], (node, ancestors) => {
    const line = node.loc?.start?.line || 1;
    const endLine = node.loc?.end?.line || line;
    const parent = ancestors[ancestors.length - 1] || null;
    const atTopLevel = isTopLevelScope(ancestors);

    // 1. Imports & CJS require()
    if (node.type === 'ImportDeclaration') {
      const specifiers = (node.specifiers || []).map(s => {
        if (s.type === 'ImportDefaultSpecifier') return { imported: 'default', local: s.local.name };
        if (s.type === 'ImportNamespaceSpecifier') return { imported: '*', local: s.local.name };
        return {
          imported: s.imported?.name || s.imported?.value || '?',
          local: s.local?.name || '?'
        };
      });
      imports.push({
        source: String(node.source?.value || ''),
        kind: 'esm_import',
        specifiers,
        line
      });
    } else if (node.type === 'ImportExpression') {
      const dyn = getPartialTemplatePrefix(node.source);
      imports.push({
        source: dyn ? dyn.value : '<dynamic_expr>',
        kind: 'dynamic_import',
        dynamic: !dyn || dyn.dynamic,
        specifiers: [],
        line
      });
    } else if (
      node.type === 'CallExpression' &&
      node.callee?.type === 'Identifier' &&
      node.callee.name === 'require' &&
      node.arguments.length >= 1
    ) {
      const reqPath = getStaticStringValue(node.arguments[0]);
      imports.push({
        source: reqPath || '<dynamic_require>',
        kind: 'cjs_require',
        dynamic: reqPath === null,
        specifiers: [],
        line
      });
    }

    // 2. Classes
    if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') {
      const clsName =
        node.id?.name ||
        (parent?.type === 'VariableDeclarator' && parent.id?.type === 'Identifier' ? parent.id.name : `AnonymousClass_${++anonCounter}`);
      node.__registryClassName = clsName;
      const methods = (node.body?.body || [])
        .filter(m => m.type === 'MethodDefinition')
        .map(m => m.key?.name || m.key?.value || '<computed>');
      classes.push({
        symbol_id: `sym:class:${relPath}#${clsName}`,
        name: clsName,
        super_class: getMemberChain(node.superClass) || null,
        exported: exportedNames.has(clsName),
        methods,
        start_line: line,
        end_line: endLine
      });
      if (isBrowserPublicScript && atTopLevel && node.type === 'ClassDeclaration' && node.id?.name) {
        globalsAssigned.push({
          name: node.id.name,
          kind: 'top_level_browser_class',
          file: relPath,
          line
        });
      }
    }

    // 3. Functions, Arrow Functions & Class Methods
    if (
      node.type === 'FunctionDeclaration' ||
      node.type === 'FunctionExpression' ||
      node.type === 'ArrowFunctionExpression'
    ) {
      let fnName = node.id?.name || '';
      let fnKind = node.type === 'ArrowFunctionExpression' ? 'arrow_function' : 'function';

      if (parent?.type === 'MethodDefinition') {
        const clsNode = ancestors.findLast(a => a.type === 'ClassDeclaration' || a.type === 'ClassExpression');
        const clsPrefix = clsNode?.__registryClassName ? `${clsNode.__registryClassName}.` : '';
        fnName = `${clsPrefix}${parent.key?.name || parent.key?.value || 'method'}`;
        fnKind = parent.kind === 'constructor' ? 'constructor' : 'method';
      } else if (!fnName && parent?.type === 'VariableDeclarator' && parent.id?.type === 'Identifier') {
        fnName = parent.id.name;
      } else if (!fnName && parent?.type === 'AssignmentExpression') {
        const lhs = getMemberChain(parent.left);
        if (lhs) fnName = lhs;
      } else if (!fnName && parent?.type === 'Property') {
        fnName = String(parent.key?.name || parent.key?.value || '');
        fnKind = 'object_method';
      } else if (!fnName && parent?.type === 'ExportDefaultDeclaration') {
        fnName = 'default';
      }

      const isAnon = !fnName;
      if (!fnName) {
        const enc = enclosingFunctionName(ancestors);
        fnName = `${enc}$anon_L${line}_${++anonCounter}`;
        fnKind = 'anonymous_function';
      }
      node.__registryName = fnName;

      // Detect return / throw behavior inside immediate function body (non-nested)
      let hasExplicitReturn = false;
      let returnsPromiseExpr = Boolean(node.async);
      const thrownCodes = new Set();

      if (node.body) {
        if (node.body.type !== 'BlockStatement') {
          hasExplicitReturn = true;
        } else {
          walkAst(node.body, [], (inner, innerAnc) => {
            // Stop at nested functions
            if (
              innerAnc.some(
                ia =>
                  ia.type === 'FunctionDeclaration' ||
                  ia.type === 'FunctionExpression' ||
                  ia.type === 'ArrowFunctionExpression'
              )
            ) {
              return;
            }
            if (inner.type === 'ReturnStatement' && inner.argument) {
              hasExplicitReturn = true;
              const chain = getMemberChain(inner.argument?.callee);
              if (
                (inner.argument.type === 'NewExpression' && inner.argument.callee?.name === 'Promise') ||
                (chain && (chain.endsWith('.then') || chain === 'withTransaction' || chain === 'Promise.resolve'))
              ) {
                returnsPromiseExpr = true;
              }
            }
            if (inner.type === 'ThrowStatement' && inner.argument) {
              if (inner.argument.type === 'NewExpression') {
                const errCls = getMemberChain(inner.argument.callee) || 'Error';
                thrownCodes.add(errCls);
              } else {
                thrownCodes.add('thrown_value');
              }
            }
          });
        }
      }

      // Only index named functions/methods or significant top-level anonymous handlers (skip trivial `.map(x => x.id)` inline lambdas < 4 lines to keep signal high, while counting all)
      if (!isAnon || endLine - line >= 4) {
        symbols.push({
          symbol_id: `sym:fn:${relPath}#${fnName}`,
          name: fnName,
          kind: fnKind,
          async: Boolean(node.async),
          generator: Boolean(node.generator),
          exported: exportedNames.has(fnName) || (fnName === 'default' && exportedNames.has('default')),
          top_level: atTopLevel,
          params: (node.params || []).map(formatParamNode),
          return_behavior: returnsPromiseExpr ? 'promise' : hasExplicitReturn ? 'sync_value' : 'void_or_implicit',
          throws: [...thrownCodes].sort(),
          file: relPath,
          start_line: line,
          end_line: endLine
        });
      }

      if (isBrowserPublicScript && atTopLevel && node.type === 'FunctionDeclaration' && node.id?.name) {
        globalsAssigned.push({
          name: node.id.name,
          kind: 'top_level_browser_function',
          file: relPath,
          line
        });
      }
    }

    // 4. Top-level Variable Declarations (Constants & Browser Globals)
    if (node.type === 'VariableDeclaration' && atTopLevel) {
      for (const decl of node.declarations) {
        if (decl.id?.type === 'Identifier') {
          const vName = decl.id.name;
          const isFnInit =
            decl.init &&
            (decl.init.type === 'FunctionExpression' || decl.init.type === 'ArrowFunctionExpression');

          if (!isFnInit && (node.kind === 'const' || exportedNames.has(vName) || /^[A-Z][A-Z0-9_]{2,}$/.test(vName))) {
            let valSummary = decl.init?.type || 'uninitialized';
            if (decl.init?.type === 'Literal') {
              valSummary = typeof decl.init.value;
            }
            constants.push({
              symbol_id: `sym:const:${relPath}#${vName}`,
              name: vName,
              decl_kind: node.kind,
              value_kind: valSummary,
              exported: exportedNames.has(vName),
              file: relPath,
              line
            });
          }

          if (isBrowserPublicScript) {
            globalsAssigned.push({
              name: vName,
              kind: `top_level_browser_${node.kind}`,
              file: relPath,
              line
            });
          }
        }
      }
    }

    // 5. Assignments: window.*, globalThis.*, module.exports, innerHTML dynamic DOM, cookie writes, Global Reassignments
    if (node.type === 'AssignmentExpression') {
      const lhsChain = getMemberChain(node.left);
      if (lhsChain) {
        if (lhsChain.startsWith('window.') || lhsChain.startsWith('globalThis.')) {
          const prop = lhsChain.split('.').slice(1).join('.');
          globalsAssigned.push({
            name: prop,
            target_object: lhsChain.split('.')[0],
            kind: 'explicit_window_property',
            file: relPath,
            line
          });
        } else if (lhsChain === 'module.exports' || lhsChain.startsWith('module.exports.') || lhsChain.startsWith('exports.')) {
          exportsList.push({
            name: lhsChain,
            kind: 'cjs_export',
            line
          });
        } else if (
          isBrowserPublicScript &&
          node.left.type === 'Identifier' &&
          !functionScopedIdentifiers.has(node.left.name)
        ) {
          // E.g. `openDetail = function(...)` monkey-patch wrapper across public scripts!
          globalsAssigned.push({
            name: node.left.name,
            kind: 'browser_global_reassignment',
            file: relPath,
            line
          });
        }

        if (lhsChain.endsWith('.innerHTML') || lhsChain.endsWith('.outerHTML')) {
          const frags = collectAllStringFragments(node.right);
          for (const f of frags) {
            const { ids } = extractDynamicMarkupIdsAndAttrs(f.text, relPath, f.line);
            dynamicDomDefinitions.push(...ids);
          }
        } else if (lhsChain.endsWith('.id')) {
          const idLit = getPartialTemplatePrefix(node.right);
          if (idLit) {
            const prefix = idLit.value.split(':expr')[0];
            if (!idLit.dynamic && /^[A-Za-z][A-Za-z0-9_:-]*$/.test(idLit.value)) {
              dynamicDomDefinitions.push({
                id: idLit.value,
                file: relPath,
                line,
                dynamic_template: false
              });
            } else if (idLit.dynamic && prefix.length >= 2 && /^[A-Za-z][A-Za-z0-9_:-]*$/.test(prefix)) {
              dynamicDomDefinitions.push({
                id: prefix + '*',
                file: relPath,
                line,
                dynamic_template: true
              });
            }
          }
        }
        if (lhsChain === 'document.cookie') {
          const cVal = getPartialTemplatePrefix(node.right);
          const m = cVal ? /^([A-Za-z0-9_-]+)=/.exec(cVal.value) : null;
          storageAccesses.push({
            storage_type: 'cookie',
            operation: 'write',
            key: m ? m[1] : cVal?.value?.slice(0, 32) || '<dynamic>',
            file: relPath,
            line
          });
        }
      }
    }

    // 5B. String/Template Literals in Frontend Scripts Containing Dynamic Markup `id="..."`
    if (isBrowserPublicScript && (node.type === 'Literal' || node.type === 'TemplateLiteral')) {
      const txt =
        node.type === 'Literal' && typeof node.value === 'string'
          ? node.value
          : node.type === 'TemplateLiteral'
            ? node.quasis.map(q => q.value.cooked ?? q.value.raw ?? '').join(':expr')
            : '';
      if (txt && txt.includes('id=')) {
        const { ids } = extractDynamicMarkupIdsAndAttrs(txt, relPath, line);
        for (const d of ids) {
          if (d.id.includes(':expr')) {
            const pref = d.id.split(':expr')[0];
            if (pref.length >= 2) {
              dynamicDomDefinitions.push({ id: pref + '*', file: relPath, line, dynamic_template: true });
            }
          } else if (d.id === '*') {
            continue;
          } else {
            dynamicDomDefinitions.push(d);
          }
        }
      }
    }

    // 6. Environment variable reads: `process.env.X`
    if (node.type === 'MemberExpression') {
      const chain = getMemberChain(node);
      if (chain && chain.startsWith('process.env.') && !node.computed) {
        const envKey = chain.slice('process.env.'.length);
        envReads.push({
          key: envKey,
          via: 'process.env',
          caller: enclosingFunctionName(ancestors),
          file: relPath,
          line
        });
      } else if (
        node.computed &&
        getMemberChain(node.object) === 'process.env' &&
        getStaticStringValue(node.property)
      ) {
        envReads.push({
          key: getStaticStringValue(node.property),
          via: 'process.env_bracket',
          caller: enclosingFunctionName(ancestors),
          file: relPath,
          line
        });
      }
    }

    // 7. Call Expressions: Call Graph, DOM, Events, Fetch/API, Env Helpers, Feature Controls, Storage
    if (node.type === 'CallExpression') {
      const calleeChain = getMemberChain(node.callee);
      const caller = enclosingFunctionName(ancestors);

      if (calleeChain) {
        calls.push({
          caller,
          callee: calleeChain,
          confidence: calleeChain.includes('.') ? 'parsed_member_call' : 'parsed_identifier_call',
          line
        });

        // 7a. Env compat helpers: `readEnvCompat('KEY', ...)`, `readBoolEnvCompat`, `readIntEnvCompat`
        if (
          calleeChain === 'readEnvCompat' ||
          calleeChain === 'readBoolEnvCompat' ||
          calleeChain === 'readIntEnvCompat'
        ) {
          const suffix = getStaticStringValue(node.arguments[0]);
          if (suffix) {
            envReads.push({
              key: `BITESHARK_${suffix}`,
              legacy_alias: `TRUCKLY_${suffix}`,
              via: calleeChain,
              caller,
              file: relPath,
              line
            });
          }
        }

        // 7b. DOM Queries & Dynamic HTML insertion
        if (calleeChain === 'document.getElementById' || calleeChain.endsWith('.getElementById')) {
          const idArg = getPartialTemplatePrefix(node.arguments[0]);
          domReferences.push({
            method: 'getElementById',
            selector: idArg ? idArg.value : '<dynamic>',
            dynamic: !idArg || idArg.dynamic,
            caller,
            file: relPath,
            line
          });
        } else if (
          calleeChain.endsWith('.querySelector') ||
          calleeChain.endsWith('.querySelectorAll') ||
          calleeChain.endsWith('.closest') ||
          calleeChain.endsWith('.matches')
        ) {
          const method = calleeChain.split('.').pop();
          const selArg = getPartialTemplatePrefix(node.arguments[0]);
          domReferences.push({
            method,
            selector: selArg ? selArg.value : '<dynamic>',
            dynamic: !selArg || selArg.dynamic,
            caller,
            file: relPath,
            line
          });
        } else if (calleeChain.endsWith('.insertAdjacentHTML')) {
          const frags = collectAllStringFragments(node.arguments[1]);
          for (const f of frags) {
            const { ids } = extractDynamicMarkupIdsAndAttrs(f.text, relPath, f.line);
            dynamicDomDefinitions.push(...ids);
          }
        }

        // 7c. Event Listeners, CustomEvent, BroadcastChannel
        if (calleeChain.endsWith('.addEventListener')) {
          const evName = getStaticStringValue(node.arguments[0]);
          if (evName) {
            eventBindings.push({
              kind: 'listener',
              target: calleeChain.slice(0, -'.addEventListener'.length) || 'global',
              event_name: evName,
              caller,
              file: relPath,
              line
            });
          }
        }

        // 7d. API / Fetch calls (`fetch`, `fetchJsonBounded`, `appFetchJson`, `rxJson`, `apiJson`, `kitchenFetch`, `postAuthJson`, etc.)
        if (
          calleeChain === 'fetch' ||
          calleeChain === 'window.fetch' ||
          calleeChain.endsWith('.fetchJsonBounded') ||
          calleeChain === 'fetchJsonBounded' ||
          calleeChain === 'appFetchJson' ||
          calleeChain === 'rxJson' ||
          calleeChain === 'apiJson' ||
          calleeChain === 'kitchenFetch' ||
          calleeChain === 'adminApi' ||
          calleeChain === 'apiRequest' ||
          calleeChain === 'rxApi' ||
          calleeChain === 'expJson' ||
          calleeChain === 'expFetchJson'
        ) {
          const urlInfo = getPartialTemplatePrefix(node.arguments[0]);
          let method = 'GET';
          const optNode = node.arguments[1];
          if (optNode && optNode.type === 'ObjectExpression') {
            for (const p of optNode.properties) {
              if ((p.key?.name || p.key?.value) === 'method') {
                const mVal = getStaticStringValue(p.value);
                if (mVal) method = mVal.toUpperCase();
              }
            }
          }
          if (urlInfo) {
            let normUrl = urlInfo.value;
            if (calleeChain === 'kitchenFetch' && !normUrl.startsWith('/')) {
              normUrl = `/api/pager/${normUrl}`;
            } else if (normUrl.startsWith(':expr/')) {
              normUrl = '/api/' + normUrl.slice(':expr/'.length);
            }
            apiConsumers.push({
              helper: calleeChain,
              method,
              url_pattern: normUrl,
              dynamic: urlInfo.dynamic,
              caller,
              file: relPath,
              line
            });
          }
        } else if (calleeChain === 'postAuthJson') {
          const sub = getStaticStringValue(node.arguments[0]);
          if (sub) {
            apiConsumers.push({
              helper: 'postAuthJson',
              method: 'POST',
              url_pattern: `/api/auth/${sub}`,
              dynamic: false,
              caller,
              file: relPath,
              line
            });
          }
        }

        // 7e. Feature Control key lookups
        if (
          calleeChain.endsWith('.isAvailable') ||
          calleeChain.endsWith('.isHidden') ||
          calleeChain.endsWith('.getState') ||
          calleeChain.endsWith('.getMessage') ||
          calleeChain === 'getFeatureState' ||
          calleeChain === 'isFeatureHidden' ||
          calleeChain === 'getFeatureMessage' ||
          calleeChain === 'isGuidesSubfeatureHidden'
        ) {
          const fk = getStaticStringValue(node.arguments[0]);
          if (fk) {
            featureKeyRefs.push({
              feature_key: fk,
              helper: calleeChain,
              caller,
              file: relPath,
              line
            });
          }
        }

        if (calleeChain === 'isWritePaused') {
          const scopeArg = getStaticStringValue(node.arguments[0]);
          if (scopeArg) {
            writePauseRefs.push({ scope: scopeArg, caller, file: relPath, line });
          }
        }

        // 7f. Browser Storage: localStorage, sessionStorage, indexedDB, caches
        if (calleeChain.startsWith('localStorage.') || calleeChain.startsWith('sessionStorage.')) {
          const [storeType, op] = calleeChain.split('.');
          const keyArg = getPartialTemplatePrefix(node.arguments[0]);
          storageAccesses.push({
            storage_type: storeType,
            operation: op,
            key: keyArg ? keyArg.value : '<constant_or_var>',
            file: relPath,
            line
          });
        } else if (calleeChain === 'safeStorageSet' || calleeChain === 'safeJSON') {
          const keyArg = getPartialTemplatePrefix(node.arguments[0]);
          storageAccesses.push({
            storage_type: 'localStorage',
            operation: calleeChain,
            key: keyArg ? keyArg.value : '<constant_or_var>',
            file: relPath,
            line
          });
        } else if (calleeChain === 'indexedDB.open' || calleeChain === 'window.indexedDB.open') {
          const dbName = getPartialTemplatePrefix(node.arguments[0]);
          const ver = node.arguments[1]?.type === 'Literal' ? node.arguments[1].value : null;
          storageAccesses.push({
            storage_type: 'IndexedDB',
            operation: 'open',
            key: dbName ? dbName.value : '<constant_or_var>',
            version: ver,
            file: relPath,
            line
          });
        } else if (calleeChain === 'caches.open' || calleeChain === 'caches.delete') {
          const cacheKey = getPartialTemplatePrefix(node.arguments[0]);
          storageAccesses.push({
            storage_type: 'CacheStorage',
            operation: calleeChain.split('.')[1],
            key: cacheKey ? cacheKey.value : '<constant_or_var>',
            file: relPath,
            line
          });
        }
      } else {
        calls.push({
          caller,
          callee: '<computed_or_iife>',
          confidence: 'unresolved_dynamic',
          line
        });
      }
    }

    // 8. NewExpression: `new BroadcastChannel('...')`, `new CustomEvent('...')`
    if (node.type === 'NewExpression') {
      const clsName = getMemberChain(node.callee);
      if (clsName === 'BroadcastChannel' || clsName === 'window.BroadcastChannel') {
        const ch = getStaticStringValue(node.arguments[0]);
        if (ch) {
          eventBindings.push({
            kind: 'broadcast_channel',
            target: 'BroadcastChannel',
            event_name: ch,
            caller: enclosingFunctionName(ancestors),
            file: relPath,
            line
          });
        }
      } else if (clsName === 'CustomEvent') {
        const ev = getStaticStringValue(node.arguments[0]);
        if (ev) {
          eventBindings.push({
            kind: 'producer_custom_event',
            target: 'CustomEvent',
            event_name: ev,
            caller: enclosingFunctionName(ancestors),
            file: relPath,
            line
          });
        }
      }
    }
  });

  // Resolve constant-backed storage keys within the same file (e.g. `const KEY = 'truckly_...'`)
  const constStringMap = new Map();
  for (const stmt of ast.body) {
    if (stmt.type === 'VariableDeclaration') {
      for (const d of stmt.declarations) {
        if (d.id?.type === 'Identifier') {
          const sv = getStaticStringValue(d.init);
          if (sv) constStringMap.set(d.id.name, sv);
        }
      }
    }
  }
  walkAst(ast, [], node => {
    if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier') {
      const sv = getStaticStringValue(node.init);
      if (sv) constStringMap.set(node.id.name, sv);
    }
  });
  walkAst(ast, [], node => {
    if (node.type === 'CallExpression') {
      const ch = getMemberChain(node.callee);
      if (
        (ch && (ch.startsWith('localStorage.') || ch.startsWith('sessionStorage.') || ch === 'safeStorageSet' || ch === 'safeJSON' || ch === 'indexedDB.open')) &&
        node.arguments[0]?.type === 'Identifier' &&
        constStringMap.has(node.arguments[0].name)
      ) {
        const resolvedVal = constStringMap.get(node.arguments[0].name);
        const line = node.loc?.start?.line || 1;
        const matchEntry = storageAccesses.find(s => s.line === line && s.key === '<constant_or_var>');
        if (matchEntry) {
          matchEntry.key = resolvedVal;
          matchEntry.resolved_from_const = node.arguments[0].name;
        }
      }
    }
  });

  const sideEffectOnly =
    exportsList.length === 0 &&
    !globalsAssigned.some(g => g.kind.startsWith('explicit_window') || g.kind.startsWith('top_level_browser'));

  return {
    file: relPath,
    parse_ok: true,
    parse_error: null,
    source_type: parsed.sourceType,
    symbols,
    classes,
    constants,
    imports,
    exports: exportsList,
    globals_assigned: globalsAssigned,
    calls,
    dom_references: domReferences,
    dynamic_dom_definitions: dynamicDomDefinitions,
    event_bindings: eventBindings,
    api_consumers: apiConsumers,
    env_reads: envReads,
    feature_key_refs: featureKeyRefs,
    write_pause_refs: writePauseRefs,
    storage_accesses: storageAccesses,
    side_effect_only: sideEffectOnly
  };
}

export function extractCalledIdentifiersInInlineHandler(exprSource) {
  const parsed = parseJavaScriptSource(exprSource, { filePath: '<inline-handler>', preferScript: true });
  if (!parsed.ok) {
    return { parse_ok: false, error: parsed.error, called_functions: [] };
  }
  const called = new Set();
  walkAst(parsed.ast, [], node => {
    if (node.type === 'CallExpression') {
      const ch = getMemberChain(node.callee);
      if (ch) called.add(ch);
    }
  });
  return { parse_ok: true, error: null, called_functions: [...called].sort() };
}
