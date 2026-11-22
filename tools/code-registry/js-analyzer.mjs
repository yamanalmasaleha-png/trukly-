// BiteShark Code Registry — Syntax-Aware JavaScript / Module / Browser Script AST Analyzer
// (`tools/code-registry/js-analyzer.mjs`)
//
// Uses vendored `acorn@8.14.1` (MIT) to parse ESM (`api/`, `lib/`, `server/`, `packages/`, `tools/`),
// CommonJS (`scripts/*.cjs`, `tests/*.cjs`), classic browser scripts (`public/*.js`), and inline
// HTML event/script snippets without executing untrusted code.

import crypto from 'node:crypto';
import * as acorn from './vendor/acorn/acorn.mjs';
import { asciiCompare } from './schema-versions.mjs';

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

/**
 * Produces a deterministic SHA-256 fingerprint of an AST subtree ignoring comments,
 * formatting, line numbers, and source byte offsets.
 */
export function computeAstNodeFingerprint(rootNode) {
  if (!rootNode) return '0'.repeat(64);
  const tokens = [];

  function visit(n) {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) {
      tokens.push('[');
      for (const el of n) visit(el);
      tokens.push(']');
      return;
    }
    if (typeof n.type !== 'string') return;
    tokens.push(`(${n.type}`);
    if (n.operator) tokens.push(`op:${n.operator}`);
    if (n.kind) tokens.push(`k:${n.kind}`);
    if (n.async) tokens.push('async');
    if (n.generator) tokens.push('gen');
    if (n.computed) tokens.push('comp');
    if (n.optional) tokens.push('opt');
    if (n.prefix !== undefined && (n.type === 'UnaryExpression' || n.type === 'UpdateExpression')) {
      tokens.push(`pre:${n.prefix ? 1 : 0}`);
    }
    if (n.type === 'Identifier' || n.type === 'PrivateIdentifier') {
      tokens.push(`id:${n.name}`);
    } else if (n.type === 'Literal') {
      if (n.regex) tokens.push(`re:/${n.regex.pattern}/${n.regex.flags}`);
      else if (typeof n.bigint === 'string') tokens.push(`bi:${n.bigint}`);
      else tokens.push(`lit:${typeof n.value}:${JSON.stringify(n.value)}`);
    } else if (n.type === 'TemplateElement') {
      tokens.push(`tpl:${JSON.stringify(n.value?.cooked ?? n.value?.raw ?? '')}`);
    }

    for (const key of Object.keys(n).sort(asciiCompare)) {
      if (
        key === 'type' ||
        key === 'loc' ||
        key === 'start' ||
        key === 'end' ||
        key === 'raw' ||
        key === 'shorthand' ||
        key.startsWith('__registry')
      ) {
        continue;
      }
      const val = n[key];
      if (val && typeof val === 'object') {
        tokens.push(`.${key}=`);
        visit(val);
      }
    }
    tokens.push(')');
  }

  visit(rootNode);
  return crypto.createHash('sha256').update(tokens.join(''), 'utf8').digest('hex');
}

function computeBodyLiteralsFingerprint(bodyNode) {
  if (!bodyNode) return '0'.repeat(64);
  const lits = [];
  function walkNoNestedFn(n, isRoot = false) {
    if (!n || typeof n !== 'object') return;
    if (
      !isRoot &&
      (n.type === 'FunctionDeclaration' ||
        n.type === 'FunctionExpression' ||
        n.type === 'ArrowFunctionExpression')
    ) {
      return;
    }
    if (n.type === 'Literal') {
      lits.push(`${typeof n.value}:${JSON.stringify(n.value)}`);
    } else if (n.type === 'TemplateElement') {
      lits.push(`tpl:${JSON.stringify(n.value?.cooked ?? n.value?.raw ?? '')}`);
    }
    for (const k of Object.keys(n)) {
      if (k === 'loc' || k === 'start' || k === 'end' || k.startsWith('__registry')) continue;
      const v = n[k];
      if (Array.isArray(v)) v.forEach(el => walkNoNestedFn(el, false));
      else if (v && typeof v.type === 'string') walkNoNestedFn(v, false);
    }
  }
  walkNoNestedFn(bodyNode, true);
  return crypto.createHash('sha256').update(lits.join('|'), 'utf8').digest('hex');
}

function collectPatternIdentifiers(pat, out = []) {
  if (!pat) return out;
  if (pat.type === 'Identifier') {
    out.push(pat.name);
  } else if (pat.type === 'AssignmentPattern') {
    collectPatternIdentifiers(pat.left, out);
  } else if (pat.type === 'RestElement') {
    collectPatternIdentifiers(pat.argument, out);
  } else if (pat.type === 'ObjectPattern') {
    for (const p of pat.properties || []) {
      if (p.type === 'RestElement') collectPatternIdentifiers(p.argument, out);
      else collectPatternIdentifiers(p.value, out);
    }
  } else if (pat.type === 'ArrayPattern') {
    for (const el of pat.elements || []) {
      if (el) collectPatternIdentifiers(el, out);
    }
  }
  return out;
}

function formatParamNode(param) {
  if (!param) return { name: 'unknown', observed_type: 'unknown', type_basis: 'undeclared', kind: 'identifier' };
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
    if (key === 'loc' || key === 'start' || key === 'end' || key.startsWith('__registry')) continue;
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

function isFunctionNode(n) {
  return (
    n?.type === 'FunctionDeclaration' ||
    n?.type === 'FunctionExpression' ||
    n?.type === 'ArrowFunctionExpression'
  );
}

function isTopLevelIifeNode(fnNode, ancestors) {
  if (!fnNode || (fnNode.type !== 'FunctionExpression' && fnNode.type !== 'ArrowFunctionExpression')) {
    return false;
  }
  // Only enclose Program -> ExpressionStatement -> CallExpression -> (Sequence/Paren) -> FunctionExpression
  const outerFnAncestors = ancestors.filter(isFunctionNode);
  if (outerFnAncestors.length > 0) return false;
  const parent = ancestors[ancestors.length - 1];
  return parent?.type === 'CallExpression' && parent.callee === fnNode;
}

function enclosingFunctionInfo(ancestors, relPath) {
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const a = ancestors[i];
    if (isFunctionNode(a)) {
      if (a.__registryIsTopIife) {
        return { name: '<iife_top>', symbol_id: null, is_iife_root: true };
      }
      const rName = a.__registryName || '<top_level>';
      return {
        name: rName,
        symbol_id: a.__registrySymbolId || `sym:fn:${relPath}#${rName}`,
        is_iife_root: false
      };
    }
  }
  return { name: '<top_level>', symbol_id: null, is_iife_root: false };
}

function isTopLevelScope(ancestors) {
  return !ancestors.some(isFunctionNode);
}

function isDirectTopIifeScope(ancestors) {
  const fns = ancestors.filter(isFunctionNode);
  return fns.length === 1 && Boolean(fns[0].__registryIsTopIife);
}

export function analyzeJavaScriptFile(source, relPath) {
  const isBrowserPublicScript =
    relPath.startsWith('public/') && relPath.endsWith('.js') && relPath !== 'public/sw.js';
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
      window_namespace_members: [],
      calls: [],
      dom_references: [],
      dynamic_dom_definitions: [],
      event_bindings: [],
      api_consumers: [],
      test_http_calls: [],
      env_reads: [],
      feature_key_refs: [],
      write_pause_refs: [],
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
  const windowNamespaceMembers = [];
  const calls = [];
  const domReferences = [];
  const dynamicDomDefinitions = [];
  const eventBindings = [];
  const apiConsumers = [];
  const testHttpCalls = [];
  const envReads = [];
  const featureKeyRefs = [];
  const writePauseRefs = [];
  const storageAccesses = [];
  const exportedNames = new Map(); // exportedName -> localName
  const functionScopedIdentifiers = new Set();
  const iifeGlobalAliasParams = new Set(); // e.g. `globalScope` in `(function(globalScope){...})(window)`
  const localObjectVarProperties = new Map(); // varName -> Array<{ prop, localTarget, line }>
  const moduleConstStrings = new Map(); // top-level/IIFE `const API = '/api'` -> '/api'
  const scopedVarInitByFnAndName = new Map(); // `${fnStart}::${varName}` -> initNode

  // Pre-pass: mark top-level IIFEs, collect local variable/parameter bindings per function node,
  // and record local object literals (`var exported = Object.freeze({ a: fnA })`)
  walkAst(ast, [], (n, anc) => {
    if (isFunctionNode(n)) {
      n.__registryLocalParams = new Set();
      n.__registryLocalVars = new Set();
      n.__registryLocalFunctions = new Map(); // localFnName -> symbol_id (populated in pass 2)
      for (const p of n.params || []) {
        for (const id of collectPatternIdentifiers(p)) {
          n.__registryLocalParams.add(id);
          if (!isTopLevelScope(anc)) functionScopedIdentifiers.add(id);
        }
      }
      if (isTopLevelIifeNode(n, anc)) {
        n.__registryIsTopIife = true;
        const callParent = anc[anc.length - 1];
        const firstArg = callParent?.arguments?.[0];
        const firstParam = n.params?.[0];
        if (firstParam?.type === 'Identifier' && firstArg) {
          const argSrc = computeAstNodeFingerprint(firstArg);
          if (
            (firstArg.type === 'Identifier' && (firstArg.name === 'window' || firstArg.name === 'globalThis')) ||
            (firstArg.type === 'ConditionalExpression' && argSrc.includes('window'))
          ) {
            iifeGlobalAliasParams.add(firstParam.name);
          }
        }
      } else if (n.id?.name && !isTopLevelScope(anc)) {
        functionScopedIdentifiers.add(n.id.name);
      }
    }

    if (n.type === 'VariableDeclarator') {
      const enclosingFn = [...anc].reverse().find(isFunctionNode);
      const declParent = anc[anc.length - 1];
      for (const id of collectPatternIdentifiers(n.id)) {
        if (enclosingFn) {
          enclosingFn.__registryLocalVars.add(id);
          if (!enclosingFn.__registryIsTopIife) functionScopedIdentifiers.add(id);
        }
      }
      if (n.id?.type === 'Identifier') {
        const sv = getStaticStringValue(n.init);
        if (sv !== null && declParent?.kind === 'const' && (!enclosingFn || enclosingFn.__registryIsTopIife)) {
          moduleConstStrings.set(n.id.name, sv);
        }
        if (n.init) {
          const scopeKey = `${enclosingFn ? enclosingFn.start : 0}::${n.id.name}`;
          scopedVarInitByFnAndName.set(scopeKey, n.init);
        }
        const unwrapped = unwrapObjectFreeze(n.init);
        if (unwrapped?.type === 'ObjectExpression') {
          const props = [];
          for (const prop of unwrapped.properties || []) {
            if (prop.type !== 'Property') continue;
            const pName = prop.key?.name || prop.key?.value;
            if (!pName) continue;
            let localTarget = null;
            if (prop.value?.type === 'Identifier') {
              localTarget = prop.value.name;
            } else if (isFunctionNode(prop.value)) {
              localTarget = `${n.id.name}.${pName}`;
            }
            props.push({ prop: String(pName), localTarget, line: prop.loc?.start?.line || 1 });
          }
          localObjectVarProperties.set(n.id.name, props);
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
          exportedNames.set(decl.id.name, decl.id.name);
          exportsList.push({
            name: decl.id.name,
            local_target: decl.id.name,
            kind: 'function',
            line: decl.loc.start.line
          });
        } else if (decl.type === 'ClassDeclaration' && decl.id?.name) {
          exportedNames.set(decl.id.name, decl.id.name);
          exportsList.push({
            name: decl.id.name,
            local_target: decl.id.name,
            kind: 'class',
            line: decl.loc.start.line
          });
        } else if (decl.type === 'VariableDeclaration') {
          for (const d of decl.declarations) {
            if (d.id?.type === 'Identifier') {
              exportedNames.set(d.id.name, d.id.name);
              exportsList.push({
                name: d.id.name,
                local_target: d.id.name,
                kind: decl.kind,
                line: d.loc.start.line
              });
            }
          }
        }
      }
      for (const spec of stmt.specifiers || []) {
        const exported = spec.exported?.name || spec.exported?.value;
        const local = spec.local?.name || spec.local?.value || exported;
        if (exported) {
          exportedNames.set(exported, local);
          exportsList.push({
            name: exported,
            local_target: local,
            kind: 'specifier',
            line: spec.loc.start.line
          });
        }
      }
    } else if (stmt.type === 'ExportDefaultDeclaration') {
      const dName = stmt.declaration?.id?.name || 'default';
      exportedNames.set('default', dName);
      exportsList.push({
        name: 'default',
        local_target: dName,
        target: dName,
        kind: 'default',
        line: stmt.loc.start.line
      });
    }
  }

  const usedSymbolNames = new Set();

  function isGlobalRootObject(objName) {
    return objName === 'window' || objName === 'globalThis' || iifeGlobalAliasParams.has(objName);
  }

  // Second pass: full AST walk
  walkAst(ast, [], (node, ancestors) => {
    const line = node.loc?.start?.line || 1;
    const col = node.loc?.start?.column || 0;
    const endLine = node.loc?.end?.line || line;
    const parent = ancestors[ancestors.length - 1] || null;
    const atTopLevel = isTopLevelScope(ancestors);
    const atDirectIife = isDirectTopIifeScope(ancestors);

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
        dynamic: false,
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
      const cjsSpecs = [];
      if (parent?.type === 'VariableDeclarator') {
        if (parent.id?.type === 'Identifier') {
          cjsSpecs.push({ imported: '*', local: parent.id.name });
        } else if (parent.id?.type === 'ObjectPattern') {
          for (const p of parent.id.properties || []) {
            if (p.type === 'Property') {
              const impName = p.key?.name || p.key?.value;
              const locName = p.value?.type === 'Identifier' ? p.value.name : impName;
              if (impName && locName) cjsSpecs.push({ imported: String(impName), local: String(locName) });
            }
          }
        }
      }
      imports.push({
        source: reqPath || '<dynamic_require>',
        kind: 'cjs_require',
        dynamic: reqPath === null,
        specifiers: cjsSpecs,
        line
      });
    }

    // 2. Classes
    if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') {
      const clsName =
        node.id?.name ||
        (parent?.type === 'VariableDeclarator' && parent.id?.type === 'Identifier'
          ? parent.id.name
          : `AnonymousClass@L${line}C${col}`);
      node.__registryClassName = clsName;
      const methods = (node.body?.body || [])
        .filter(m => m.type === 'MethodDefinition')
        .map(m => m.key?.name || m.key?.value || '<computed>');
      const isExported = [...exportedNames.values()].includes(clsName) || exportedNames.has(clsName);
      classes.push({
        symbol_id: `sym:class:${relPath}#${clsName}`,
        name: clsName,
        super_class: getMemberChain(node.superClass) || null,
        exported: isExported,
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
    if (isFunctionNode(node)) {
      if (node.__registryIsTopIife) {
        node.__registryName = `<iife@L${line}>`;
        node.__registrySymbolId = `sym:fn:${relPath}#<iife@L${line}>`;
        return;
      }

      let localName = node.id?.name || '';
      let fnKind = node.type === 'ArrowFunctionExpression' ? 'arrow_function' : 'function';
      let scopeKind = atTopLevel ? 'module_top' : atDirectIife ? 'iife_module' : 'nested_function';
      let ownerPrefix = '';

      if (parent?.type === 'MethodDefinition') {
        const clsNode = ancestors.findLast(a => a.type === 'ClassDeclaration' || a.type === 'ClassExpression');
        ownerPrefix = clsNode?.__registryClassName ? `${clsNode.__registryClassName}.` : '';
        localName = String(parent.key?.name || parent.key?.value || 'method');
        fnKind = parent.kind === 'constructor' ? 'constructor' : 'method';
        scopeKind = 'class_member';
      } else if (!localName && parent?.type === 'VariableDeclarator' && parent.id?.type === 'Identifier') {
        localName = parent.id.name;
      } else if (!localName && parent?.type === 'AssignmentExpression') {
        const lhs = getMemberChain(parent.left);
        if (lhs) {
          const parts = lhs.split('.');
          if (parts.length >= 2 && isGlobalRootObject(parts[0])) {
            localName = parts.slice(1).join('.');
          } else {
            localName = lhs;
          }
        }
      } else if (!localName && parent?.type === 'Property') {
        const propName = String(parent.key?.name || parent.key?.value || '');
        const grand = ancestors[ancestors.length - 2];
        const greatGrand = ancestors[ancestors.length - 3];
        const objOwner =
          grand?.type === 'ObjectExpression' && greatGrand?.type === 'VariableDeclarator' && greatGrand.id?.name
            ? greatGrand.id.name
            : grand?.type === 'ObjectExpression' &&
                greatGrand?.type === 'CallExpression' &&
                greatGrand.callee?.property?.name === 'freeze' &&
                ancestors[ancestors.length - 4]?.type === 'VariableDeclarator'
              ? ancestors[ancestors.length - 4].id?.name
              : grand?.type === 'ObjectExpression' && greatGrand?.type === 'AssignmentExpression'
                ? (() => {
                    const ch = getMemberChain(greatGrand.left);
                    if (!ch) return '';
                    const ps = ch.split('.');
                    return isGlobalRootObject(ps[0]) ? ps.slice(1).join('.') : ch;
                  })()
                : '';
        ownerPrefix = objOwner ? `${objOwner}.` : '';
        localName = propName;
        fnKind = 'object_method';
        scopeKind = 'object_member';
      } else if (!localName && parent?.type === 'ExportDefaultDeclaration') {
        localName = 'default';
      }

      const isAnon = !localName;
      let qualifiedName = '';

      if (isAnon) {
        const enc = enclosingFunctionInfo(ancestors, relPath);
        const encPrefix = enc.name === '<top_level>' || enc.name === '<iife_top>' ? 'top' : enc.name;
        localName = '<anonymous>';
        qualifiedName = `${encPrefix}>anon@L${line}C${col}`;
        fnKind = 'anonymous_function';
      } else if (ownerPrefix) {
        qualifiedName = `${ownerPrefix}${localName}`;
      } else if (atTopLevel || atDirectIife) {
        qualifiedName = localName;
      } else {
        const enc = enclosingFunctionInfo(ancestors, relPath);
        const encPrefix = enc.name === '<top_level>' || enc.name === '<iife_top>' ? '' : `${enc.name}>`;
        qualifiedName = `${encPrefix}${localName}`;
      }

      if (usedSymbolNames.has(qualifiedName)) {
        qualifiedName = `${qualifiedName}@L${line}C${col}`;
      }
      usedSymbolNames.add(qualifiedName);

      const symId = `sym:fn:${relPath}#${qualifiedName}`;
      node.__registryName = qualifiedName;
      node.__registrySymbolId = symId;

      const enclosingFn = [...ancestors].reverse().find(isFunctionNode);
      if (enclosingFn && localName && localName !== '<anonymous>') {
        enclosingFn.__registryLocalFunctions.set(localName, symId);
      }

      // Detect return / throw behavior inside immediate function body (non-nested)
      let hasExplicitReturn = false;
      let returnsPromiseExpr = Boolean(node.async);
      const thrownCodes = new Set();

      if (node.body) {
        if (node.body.type !== 'BlockStatement') {
          hasExplicitReturn = true;
        } else {
          walkAst(node.body, [], (inner, innerAnc) => {
            if (innerAnc.some(isFunctionNode)) return;
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

      const isExported =
        exportedNames.has(qualifiedName) ||
        [...exportedNames.values()].includes(qualifiedName) ||
        (qualifiedName === 'default' && exportedNames.has('default'));

      // Index all named functions/methods plus significant multi-line anonymous handlers (>= 4 lines)
      if (!isAnon || endLine - line >= 4) {
        symbols.push({
          symbol_id: symId,
          name: qualifiedName,
          local_name: localName,
          scope_kind: scopeKind,
          kind: fnKind,
          async: Boolean(node.async),
          generator: Boolean(node.generator),
          exported: isExported,
          top_level: atTopLevel,
          params: (node.params || []).map(formatParamNode),
          return_behavior: returnsPromiseExpr ? 'promise' : hasExplicitReturn ? 'sync_value' : 'void_or_implicit',
          throws: [...thrownCodes].sort(asciiCompare),
          body_fingerprint_sha256: computeAstNodeFingerprint({
            type: 'RegistryFunctionRoot',
            params: node.params || [],
            body: node.body
          }),
          literals_fingerprint_sha256: computeBodyLiteralsFingerprint(node.body),
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
    if (node.type === 'VariableDeclaration' && (atTopLevel || atDirectIife)) {
      for (const decl of node.declarations) {
        if (decl.id?.type === 'Identifier') {
          const vName = decl.id.name;
          const isFnInit = decl.init && isFunctionNode(decl.init);
          const isExported = exportedNames.has(vName) || [...exportedNames.values()].includes(vName);

          if (
            !isFnInit &&
            (atTopLevel || /^[A-Z][A-Z0-9_]{2,}$/.test(vName)) &&
            (node.kind === 'const' || isExported || /^[A-Z][A-Z0-9_]{2,}$/.test(vName))
          ) {
            let valSummary = decl.init?.type || 'uninitialized';
            if (decl.init?.type === 'Literal') {
              valSummary = typeof decl.init.value;
            }
            constants.push({
              symbol_id: `sym:const:${relPath}#${vName}`,
              name: vName,
              decl_kind: node.kind,
              value_kind: valSummary,
              value_fingerprint_sha256: computeAstNodeFingerprint(decl.init),
              exported: isExported,
              file: relPath,
              line
            });
          }

          if (isBrowserPublicScript && atTopLevel) {
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

    // 5. Assignments: window.*, globalThis.*, globalScope.*, module.exports, innerHTML dynamic DOM, cookie writes, Global Reassignments
    if (node.type === 'AssignmentExpression') {
      const lhsChain = getMemberChain(node.left);
      if (lhsChain) {
        const chainParts = lhsChain.split('.');
        if (chainParts.length >= 2 && isGlobalRootObject(chainParts[0])) {
          const prop = chainParts.slice(1).join('.');
          globalsAssigned.push({
            name: prop,
            target_object: chainParts[0] === 'globalThis' ? 'globalThis' : 'window',
            kind: 'explicit_window_property',
            file: relPath,
            line
          });

          // Extract `window.bitesharkX = { methodA: localFn, ... }` or `window.bitesharkX = exported`
          if (chainParts.length === 2) {
            const nsName = chainParts[1];
            const rhsUnwrapped = unwrapObjectFreeze(node.right);
            if (rhsUnwrapped?.type === 'ObjectExpression') {
              for (const p of rhsUnwrapped.properties || []) {
                if (p.type !== 'Property') continue;
                const mName = p.key?.name || p.key?.value;
                if (!mName) continue;
                const localTarget =
                  p.value?.type === 'Identifier'
                    ? p.value.name
                    : isFunctionNode(p.value)
                      ? `${nsName}.${mName}`
                      : null;
                windowNamespaceMembers.push({
                  namespace: nsName,
                  member: String(mName),
                  local_target: localTarget,
                  file: relPath,
                  line: p.loc?.start?.line || line
                });
              }
            } else if (rhsUnwrapped?.type === 'Identifier' && localObjectVarProperties.has(rhsUnwrapped.name)) {
              for (const item of localObjectVarProperties.get(rhsUnwrapped.name)) {
                windowNamespaceMembers.push({
                  namespace: nsName,
                  member: item.prop,
                  local_target: item.localTarget,
                  file: relPath,
                  line: item.line
                });
              }
            } else if (rhsUnwrapped?.type === 'Identifier') {
              windowNamespaceMembers.push({
                namespace: null,
                member: nsName,
                local_target: rhsUnwrapped.name,
                file: relPath,
                line
              });
            } else if (isFunctionNode(rhsUnwrapped)) {
              windowNamespaceMembers.push({
                namespace: null,
                member: nsName,
                local_target: nsName,
                file: relPath,
                line
              });
            }
          }
        } else if (
          lhsChain === 'module.exports' ||
          lhsChain.startsWith('module.exports.') ||
          lhsChain.startsWith('exports.')
        ) {
          if (lhsChain === 'module.exports' && unwrapObjectFreeze(node.right)?.type === 'ObjectExpression') {
            for (const p of unwrapObjectFreeze(node.right).properties || []) {
              if (p.type !== 'Property') continue;
              const expName = p.key?.name || p.key?.value;
              const locTarget = p.value?.type === 'Identifier' ? p.value.name : expName;
              if (expName) {
                exportsList.push({
                  name: String(expName),
                  local_target: String(locTarget || expName),
                  kind: 'cjs_export_property',
                  line: p.loc?.start?.line || line
                });
              }
            }
          } else {
            const expShort = lhsChain === 'module.exports' ? 'default' : lhsChain.replace(/^(module\.)?exports\./, '');
            const locTarget = node.right?.type === 'Identifier' ? node.right.name : expShort;
            exportsList.push({
              name: expShort,
              local_target: locTarget,
              raw_lhs: lhsChain,
              kind: 'cjs_export',
              line
            });
          }
        } else if (
          isBrowserPublicScript &&
          node.left.type === 'Identifier' &&
          !functionScopedIdentifiers.has(node.left.name)
        ) {
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
      const callerInfo = enclosingFunctionInfo(ancestors, relPath);
      if (chain && chain.startsWith('process.env.') && !node.computed) {
        const envKey = chain.slice('process.env.'.length);
        envReads.push({
          key: envKey,
          via: 'process.env',
          caller: callerInfo.name,
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
          caller: callerInfo.name,
          file: relPath,
          line
        });
      }
    }

    // 7. Call Expressions: Call Graph, DOM, Events, Fetch/API, Test HTTP Calls, Env Helpers, Feature Controls, Storage
    if (node.type === 'CallExpression') {
      if (node.__registryIsTopIife || node.callee?.__registryIsTopIife) return;

      const rawCalleeChain = getMemberChain(node.callee);
      const calleeChain =
        rawCalleeChain && iifeGlobalAliasParams.has(rawCalleeChain.split('.')[0])
          ? ['window', ...rawCalleeChain.split('.').slice(1)].join('.')
          : rawCalleeChain;
      const callerInfo = enclosingFunctionInfo(ancestors, relPath);
      const caller = callerInfo.name;

      if (calleeChain) {
        // Check if identifier call is shadowed by an enclosing function parameter or non-function local variable
        const rootIdent = calleeChain.split('.')[0];
        let isShadowedByParamOrVar = false;
        let boundLocalFnSymbolId = null;
        for (let i = ancestors.length - 1; i >= 0; i--) {
          const anc = ancestors[i];
          if (!isFunctionNode(anc)) continue;
          if (anc.__registryLocalFunctions?.has(rootIdent) && !calleeChain.includes('.')) {
            boundLocalFnSymbolId = anc.__registryLocalFunctions.get(rootIdent);
            break;
          }
          if (!anc.__registryIsTopIife && anc.__registryLocalParams?.has(rootIdent)) {
            isShadowedByParamOrVar = true;
            break;
          }
          if (
            !anc.__registryIsTopIife &&
            anc.__registryLocalVars?.has(rootIdent) &&
            !anc.__registryLocalFunctions?.has(rootIdent)
          ) {
            isShadowedByParamOrVar = true;
            break;
          }
        }

        calls.push({
          caller,
          caller_symbol_id: callerInfo.symbol_id,
          callee: calleeChain,
          callee_kind: calleeChain.includes('.') ? 'member' : 'identifier',
          is_shadowed_local: isShadowedByParamOrVar,
          bound_local_symbol_id: boundLocalFnSymbolId,
          confidence: isShadowedByParamOrVar
            ? 'shadowed_local_or_callback'
            : calleeChain.includes('.')
              ? 'parsed_member_call'
              : 'parsed_identifier_call',
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
          const enclosingFnForUrl = [...ancestors].reverse().find(isFunctionNode);
          const evalUrlCandidates = (uNode, depth = 0) => {
            if (!uNode || depth > 4) return [];
            const exact = getStaticStringValue(uNode);
            if (exact !== null) return [{ value: exact, dynamic: false }];
            if (uNode.type === 'Identifier') {
              if (moduleConstStrings.has(uNode.name)) {
                return [{ value: moduleConstStrings.get(uNode.name), dynamic: false }];
              }
              const scopedInit = scopedVarInitByFnAndName.get(`${enclosingFnForUrl ? enclosingFnForUrl.start : 0}::${uNode.name}`);
              if (scopedInit) return evalUrlCandidates(scopedInit, depth + 1);
              return [];
            }
            if (uNode.type === 'ConditionalExpression') {
              return [
                ...evalUrlCandidates(uNode.consequent, depth + 1),
                ...evalUrlCandidates(uNode.alternate, depth + 1)
              ];
            }
            if (uNode.type === 'TemplateLiteral') {
              let acc = '';
              let isDyn = false;
              for (let qi = 0; qi < uNode.quasis.length; qi++) {
                acc += uNode.quasis[qi].value.cooked ?? uNode.quasis[qi].value.raw ?? '';
                if (qi < uNode.expressions.length) {
                  const ex = uNode.expressions[qi];
                  if (ex.type === 'Identifier' && moduleConstStrings.has(ex.name)) {
                    acc += moduleConstStrings.get(ex.name);
                  } else if (
                    ex.type === 'ConditionalExpression' &&
                    (getPartialTemplatePrefix(ex.consequent)?.value?.startsWith('?') ||
                      getStaticStringValue(ex.alternate) === '')
                  ) {
                    acc += '?:expr';
                    isDyn = true;
                  } else {
                    acc += ':expr';
                    isDyn = true;
                  }
                }
              }
              return [{ value: acc, dynamic: isDyn }];
            }
            if (uNode.type === 'BinaryExpression' && uNode.operator === '+') {
              const ls = evalUrlCandidates(uNode.left, depth + 1);
              const rs = evalUrlCandidates(uNode.right, depth + 1);
              if (ls.length && rs.length) {
                const out = [];
                for (const l of ls) {
                  for (const r of rs) out.push({ value: l.value + r.value, dynamic: l.dynamic || r.dynamic });
                }
                return out;
              }
            }
            const fallback = getPartialTemplatePrefix(uNode);
            return fallback ? [fallback] : [];
          };

          const urlCandidates = evalUrlCandidates(node.arguments[0]);
          let method = 'GET';
          const optNode = node.arguments[1];
          if (optNode && optNode.type === 'ObjectExpression') {
            for (const p of optNode.properties) {
              const pk = p.key?.name || p.key?.value;
              if (pk === 'method') {
                const mVal = getStaticStringValue(p.value);
                if (mVal) method = mVal.toUpperCase();
              } else if (pk === 'routeTemplate' && urlCandidates.length === 0) {
                const rtVal = getStaticStringValue(p.value);
                if (rtVal) urlCandidates.push({ value: rtVal, dynamic: false });
              }
            }
          }
          for (const urlInfo of urlCandidates) {
            let normUrl = urlInfo.value;
            if (calleeChain === 'kitchenFetch' && !normUrl.startsWith('/')) {
              normUrl = `/api/pager/${normUrl}`;
            } else if (normUrl.startsWith(':expr/api/')) {
              normUrl = normUrl.slice(':expr'.length);
            } else if (normUrl.startsWith(':expr/')) {
              normUrl = '/api/' + normUrl.slice(':expr/'.length);
            }
            const record = {
              helper: calleeChain,
              method,
              url_pattern: normUrl,
              dynamic: urlInfo.dynamic,
              caller,
              file: relPath,
              line
            };
            if (relPath.startsWith('tests/')) {
              testHttpCalls.push(record);
            } else {
              apiConsumers.push(record);
            }
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
        } else if (relPath.startsWith('tests/')) {
          // Detect test harness HTTP helpers such as `httpReq(port, '/api/...', ...)` or `requestJson(baseUrl, 'POST', '/api/...')`
          for (let ai = 0; ai < Math.min(node.arguments.length, 4); ai++) {
            const argInfo = getPartialTemplatePrefix(node.arguments[ai]);
            if (!argInfo) continue;
            let u = argInfo.value;
            const apiIdx = u.indexOf('/api/');
            if (apiIdx !== -1) {
              u = u.slice(apiIdx);
              let methodGuess = null;
              for (const otherArg of node.arguments) {
                const sv = getStaticStringValue(otherArg);
                if (sv && /^(GET|POST|PUT|PATCH|DELETE|HEAD)$/i.test(sv)) {
                  methodGuess = sv.toUpperCase();
                } else if (otherArg?.type === 'ObjectExpression') {
                  for (const p of otherArg.properties) {
                    if ((p.key?.name || p.key?.value) === 'method') {
                      const mv = getStaticStringValue(p.value);
                      if (mv) methodGuess = mv.toUpperCase();
                    }
                  }
                }
              }
              testHttpCalls.push({
                helper: calleeChain,
                method: methodGuess || 'ANY',
                url_pattern: u,
                dynamic: argInfo.dynamic,
                caller,
                file: relPath,
                line
              });
              break;
            }
          }
        }

        // 7e. Feature Control key lookups
        if (
          calleeChain.endsWith('.isAvailable') ||
          calleeChain.endsWith('.isHidden') ||
          calleeChain.endsWith('.getState') ||
          calleeChain.endsWith('.getMessage') ||
          calleeChain === 'getFeatureState' ||
          calleeChain === 'isFeatureAvailable' ||
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
        } else if (
          calleeChain === 'indexedDB.open' ||
          calleeChain === 'window.indexedDB.open'
        ) {
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
          caller_symbol_id: callerInfo.symbol_id,
          callee: '<computed_or_iife>',
          callee_kind: 'computed_dynamic',
          is_shadowed_local: false,
          bound_local_symbol_id: null,
          confidence: 'unresolved_dynamic',
          line
        });
      }
    }

    // 8. NewExpression: `new BroadcastChannel('...')`, `new CustomEvent('...')`
    if (node.type === 'NewExpression') {
      const clsName = getMemberChain(node.callee);
      const callerInfo = enclosingFunctionInfo(ancestors, relPath);
      if (clsName === 'BroadcastChannel' || clsName === 'window.BroadcastChannel') {
        const ch = getStaticStringValue(node.arguments[0]);
        if (ch) {
          eventBindings.push({
            kind: 'broadcast_channel',
            target: 'BroadcastChannel',
            event_name: ch,
            caller: callerInfo.name,
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
            caller: callerInfo.name,
            file: relPath,
            line
          });
        }
      }
    }
  });

  // Resolve constant-backed storage keys within the same file (e.g. `const KEY = 'truckly_...'`)
  const constStringMap = new Map();
  walkAst(ast, [], node => {
    if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier') {
      const sv = getStaticStringValue(node.init);
      if (sv) constStringMap.set(node.id.name, sv);
    }
  });
  walkAst(ast, [], node => {
    if (node.type === 'CallExpression') {
      const rawCh = getMemberChain(node.callee);
      const ch =
        rawCh && iifeGlobalAliasParams.has(rawCh.split('.')[0])
          ? ['window', ...rawCh.split('.').slice(1)].join('.')
          : rawCh;
      if (
        ch &&
        (ch.startsWith('localStorage.') ||
          ch.startsWith('sessionStorage.') ||
          ch === 'safeStorageSet' ||
          ch === 'safeJSON' ||
          ch === 'indexedDB.open' ||
          ch === 'window.indexedDB.open') &&
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
    window_namespace_members: windowNamespaceMembers,
    calls,
    dom_references: domReferences,
    dynamic_dom_definitions: dynamicDomDefinitions,
    event_bindings: eventBindings,
    api_consumers: apiConsumers,
    test_http_calls: testHttpCalls,
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
  return { parse_ok: true, error: null, called_functions: [...called].sort(asciiCompare) };
}
