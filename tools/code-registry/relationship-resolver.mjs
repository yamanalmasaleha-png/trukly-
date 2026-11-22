// BiteShark Code Registry — Lexical, Import, Global & HTML Relationship Resolver
// (`tools/code-registry/relationship-resolver.mjs`)
//
// Builds honest symbol-to-symbol relationships using explicit states:
//   - `confirmed_static`: lexical binding, explicit ESM/CJS import/alias, unique `window.*` namespace,
//     unique page-level browser global, or resolved HTML inline event handler.
//   - `documented_wrapper`: intentional browser global decorator reassignment (`openDetail`, `applyFilters`).
//   - `inferred_candidate`: ambiguous multi-script browser global or unverified object-method candidate.
//   - `dynamic_unresolved`: callback parameter, shadowed local variable, or computed dispatch (`obj[k]()`).

import path from 'node:path';
import { asciiCompare, toPosixPath } from './schema-versions.mjs';

const BUILTIN_GLOBALS_AND_METHODS = new Set([
  'Array',
  'Boolean',
  'Buffer',
  'Date',
  'Error',
  'FormData',
  'Headers',
  'Intl',
  'JSON',
  'Map',
  'Math',
  'Number',
  'Object',
  'Promise',
  'RegExp',
  'Response',
  'Set',
  'String',
  'TextDecoder',
  'TextEncoder',
  'TypeError',
  'URIError',
  'URL',
  'URLSearchParams',
  'Uint8Array',
  'WeakMap',
  'WeakSet',
  'AbortController',
  'BroadcastChannel',
  'CustomEvent',
  'FileReader',
  'Image',
  'IntersectionObserver',
  'MutationObserver',
  'Notification',
  'ResizeObserver',
  'ServiceWorkerContainer',
  'Worker',
  'alert',
  'atob',
  'btoa',
  'clearInterval',
  'clearTimeout',
  'confirm',
  'console',
  'crypto',
  'decodeURIComponent',
  'decodeURI',
  'document',
  'encodeURIComponent',
  'encodeURI',
  'fetch',
  'globalThis',
  'history',
  'indexedDB',
  'isFinite',
  'isNaN',
  'localStorage',
  'location',
  'navigator',
  'parseFloat',
  'parseInt',
  'performance',
  'process',
  'queueMicrotask',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'sessionStorage',
  'setImmediate',
  'setInterval',
  'setTimeout',
  'structuredClone',
  'window',
  'require'
]);

function resolveImportTargetPath(fromFile, rawSource, jsByPath) {
  if (!rawSource) return null;
  if (rawSource === '@biteshark/runtime-adapter') {
    return jsByPath.has('packages/runtime-adapter/index.js') ? 'packages/runtime-adapter/index.js' : null;
  }
  if (!rawSource.startsWith('.')) return null;
  const baseDir = path.posix.dirname(fromFile);
  const baseCandidate = toPosixPath(path.posix.normalize(path.posix.join(baseDir, rawSource)));
  for (const ext of ['', '.js', '.mjs', '.cjs', '/index.js']) {
    const p = baseCandidate + ext;
    if (jsByPath.has(p)) return p;
  }
  return null;
}

export function resolveSymbolRelationships({ jsAnalyses = [], htmlAnalyses = [] } = {}) {
  const jsByPath = new Map();
  const symbolById = new Map();
  const moduleSymbolsByLocalName = new Map(); // file -> Map<name, symbol[]>
  const moduleExportMap = new Map(); // file -> Map<exportedName, symbol_id>
  const windowNamespaceLookup = new Map(); // "ns.member" or "directProp" -> Array<{ symbol_id, file, line }>

  for (const mod of jsAnalyses) {
    jsByPath.set(mod.file, mod);
    const localMap = new Map();
    for (const sym of mod.symbols || []) {
      symbolById.set(sym.symbol_id, sym);
      for (const key of new Set([sym.name, sym.local_name])) {
        if (!key || key === '<anonymous>') continue;
        if (!localMap.has(key)) localMap.set(key, []);
        localMap.get(key).push(sym);
      }
    }
    moduleSymbolsByLocalName.set(mod.file, localMap);
  }

  // Build export resolution per module (`exportedName -> target symbol_id`)
  for (const mod of jsAnalyses) {
    const expMap = new Map();
    const localMap = moduleSymbolsByLocalName.get(mod.file) || new Map();
    for (const exp of mod.exports || []) {
      const targetName = exp.local_target || exp.target || exp.name;
      const candidates = localMap.get(targetName) || localMap.get(exp.name) || [];
      const best =
        candidates.find(s => s.scope_kind === 'module_top' || s.scope_kind === 'iife_module') || candidates[0];
      if (best) {
        expMap.set(exp.name, best.symbol_id);
      }
    }
    moduleExportMap.set(mod.file, expMap);

    // Populate `window.<namespace>.<member>` and `window.<directFn>` registrations
    for (const wm of mod.window_namespace_members || []) {
      const lookupKey = wm.namespace ? `${wm.namespace}.${wm.member}` : wm.member;
      const candidates =
        (wm.local_target && localMap.get(wm.local_target)) ||
        localMap.get(wm.member) ||
        (wm.namespace ? localMap.get(`${wm.namespace}.${wm.member}`) : null) ||
        [];
      const targetSym =
        candidates.find(s => s.scope_kind !== 'nested_function') || candidates[0] || null;
      if (targetSym) {
        if (!windowNamespaceLookup.has(lookupKey)) windowNamespaceLookup.set(lookupKey, []);
        windowNamespaceLookup.get(lookupKey).push({
          symbol_id: targetSym.symbol_id,
          file: mod.file,
          line: wm.line
        });
      }
    }
  }

  // Build HTML page script groups so classic browser scripts only resolve globals loaded together on a page
  const pageGlobalsByScript = new Map(); // scriptFile -> Map<globalName, Array<{ symbol_id, file, kind }>>
  const htmlResolvedHandlers = [];
  const wrapperChains = [];

  for (const html of htmlAnalyses) {
    const loadedPaths = (html.scripts_order || [])
      .filter(s => !s.external)
      .map(s => {
        const cleanSrc = s.src.split('?')[0];
        return cleanSrc.startsWith('/')
          ? toPosixPath(path.posix.join('public', cleanSrc.slice(1)))
          : toPosixPath(path.posix.join(path.posix.dirname(html.file), cleanSrc));
      });

    const pageGlobalDefs = new Map(); // name -> Array<{ symbol_id, file, kind, line }>
    const registerDef = (gName, symId, file, kind, line) => {
      if (!gName || !symId) return;
      if (!pageGlobalDefs.has(gName)) pageGlobalDefs.set(gName, []);
      const arr = pageGlobalDefs.get(gName);
      if (!arr.some(x => x.symbol_id === symId && x.kind === kind)) {
        arr.push({ symbol_id: symId, file, kind, line });
      }
    };

    for (const sp of loadedPaths) {
      const mod = jsByPath.get(sp);
      if (!mod) continue;
      const localMap = moduleSymbolsByLocalName.get(sp) || new Map();
      for (const s of mod.symbols || []) {
        if (s.top_level) {
          registerDef(s.name, s.symbol_id, sp, 'top_level_browser_function', s.start_line);
        }
      }
      for (const g of mod.globals_assigned || []) {
        if (g.kind === 'browser_global_reassignment') {
          const matchSym = (localMap.get(g.name) || [])[0];
          registerDef(
            g.name,
            matchSym ? matchSym.symbol_id : `sym:fn:${sp}#${g.name}`,
            sp,
            'browser_global_reassignment',
            g.line
          );
        } else if (g.kind === 'explicit_window_property') {
          const wmHits = windowNamespaceLookup.get(g.name) || [];
          for (const h of wmHits) {
            registerDef(g.name, h.symbol_id, h.file, 'explicit_window_property', h.line);
          }
        }
      }
    }

    for (const inl of html.inline_scripts || []) {
      jsByPath.set(inl.file, inl);
      for (const s of inl.symbols || []) {
        symbolById.set(s.symbol_id, s);
        if (s.top_level) {
          registerDef(s.name, s.symbol_id, inl.file, 'inline_script_function', s.start_line);
        }
      }
    }

    // Record wrapper reassignment chains (`openDetail`, `applyFilters`) on this HTML page
    for (const [gName, defs] of pageGlobalDefs.entries()) {
      if (defs.some(d => d.kind === 'browser_global_reassignment') && defs.length > 1) {
        wrapperChains.push({
          page: html.file,
          global_name: gName,
          relationship_state: 'documented_wrapper',
          evidence: 'browser_load_order_wrapper',
          chain: defs.map(d => ({ symbol_id: d.symbol_id, file: d.file, kind: d.kind, line: d.line }))
        });
      }
    }

    for (const sp of loadedPaths) {
      if (!pageGlobalsByScript.has(sp)) {
        pageGlobalsByScript.set(sp, new Map());
      }
      const merged = pageGlobalsByScript.get(sp);
      for (const [k, defs] of pageGlobalDefs.entries()) {
        if (!merged.has(k)) merged.set(k, []);
        const cur = merged.get(k);
        for (const d of defs) {
          if (!cur.some(x => x.symbol_id === d.symbol_id)) cur.push(d);
        }
      }
    }

    // Resolve HTML inline `on*` handlers against `pageGlobalDefs` & `windowNamespaceLookup`
    for (const h of html.inline_handlers || []) {
      for (const fn of h.called_functions || []) {
        const cleanFn = fn.startsWith('window.') ? fn.slice('window.'.length) : fn;
        const rootIdent = cleanFn.split('.')[0];
        if (BUILTIN_GLOBALS_AND_METHODS.has(rootIdent) || rootIdent === 'this' || rootIdent === 'event') continue;

        const nsTargets = windowNamespaceLookup.get(cleanFn) || [];
        const globalTargets = pageGlobalDefs.get(cleanFn) || [];
        const nonWrapperGlobalTargets = globalTargets.filter(d => d.kind !== 'browser_global_reassignment');
        const primaryTargets = nsTargets.length > 0 ? nsTargets : nonWrapperGlobalTargets.length > 0 ? nonWrapperGlobalTargets : globalTargets;

        if (primaryTargets.length === 1) {
          htmlResolvedHandlers.push({
            caller_location: `${html.file}:L${h.line}`,
            attribute: h.attribute,
            callee_expr: fn,
            target_symbol_id: primaryTargets[0].symbol_id,
            relationship_state: globalTargets.some(d => d.kind === 'browser_global_reassignment')
              ? 'documented_wrapper'
              : 'confirmed_static',
            evidence: 'html_inline_handler_binding'
          });
        } else if (primaryTargets.length > 1) {
          htmlResolvedHandlers.push({
            caller_location: `${html.file}:L${h.line}`,
            attribute: h.attribute,
            callee_expr: fn,
            candidate_symbol_ids: primaryTargets.map(t => t.symbol_id),
            relationship_state: 'inferred_candidate',
            evidence: 'ambiguous_html_inline_handler'
          });
        }
      }
    }
  }

  // Per-symbol incoming/outgoing maps
  const confirmedCallersBySymbol = new Map(); // symbol_id -> Set<string>
  const inferredCallersBySymbol = new Map(); // symbol_id -> Set<string>
  const confirmedCalleesBySymbol = new Map(); // symbol_id -> Set<string>
  const dynamicCallsitesBySymbol = new Map(); // symbol_id -> Array<{ callee, line, reason }>
  const callEdges = [];

  const addSetEntry = (map, key, val) => {
    if (!key || !val) return;
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(val);
  };

  for (const mod of jsAnalyses) {
    // Build import binding table for this module:
    //   localIdent -> { kind: 'direct' | 'namespace', targetFile, exportedName }
    const importBindings = new Map();
    for (const imp of mod.imports || []) {
      if (imp.dynamic) continue;
      const targetFile = resolveImportTargetPath(mod.file, imp.source, jsByPath);
      if (!targetFile) continue;
      for (const spec of imp.specifiers || []) {
        if (spec.imported === '*') {
          importBindings.set(spec.local, { kind: 'namespace', targetFile, exportedName: '*' });
        } else {
          importBindings.set(spec.local, { kind: 'direct', targetFile, exportedName: spec.imported });
        }
      }
    }

    const localMap = moduleSymbolsByLocalName.get(mod.file) || new Map();
    const pageGlobals = pageGlobalsByScript.get(mod.file) || null;

    for (const call of mod.calls || []) {
      const callerLabel = `${mod.file}:${call.caller}`;
      const callerSymId = call.caller_symbol_id || null;

      // 1. Computed dispatch (`obj[key]()`) or shadowed parameter/callback (`fn(tx)`)
      if (call.callee_kind === 'computed_dynamic' || call.is_shadowed_local) {
        const reason =
          call.callee_kind === 'computed_dynamic'
            ? 'computed_property_or_iife'
            : 'shadowed_by_param_or_local_variable';
        if (callerSymId) {
          if (!dynamicCallsitesBySymbol.has(callerSymId)) dynamicCallsitesBySymbol.set(callerSymId, []);
          dynamicCallsitesBySymbol.get(callerSymId).push({
            callee: call.callee,
            line: call.line,
            reason
          });
        }
        continue;
      }

      const parts = call.callee.split('.');
      const root = parts[0];

      // Skip standard JS/DOM built-ins (`Math.max`, `JSON.stringify`, `document.getElementById`, `res.json`, etc.)
      if (
        BUILTIN_GLOBALS_AND_METHODS.has(root) &&
        root !== 'window' &&
        root !== 'globalThis'
      ) {
        continue;
      }

      // 2. Bound nested function in enclosing lexical scope
      if (call.bound_local_symbol_id && symbolById.has(call.bound_local_symbol_id)) {
        if (call.bound_local_symbol_id !== callerSymId) {
          addSetEntry(confirmedCallersBySymbol, call.bound_local_symbol_id, callerLabel);
          if (callerSymId) addSetEntry(confirmedCalleesBySymbol, callerSymId, call.bound_local_symbol_id);
          callEdges.push({
            from_file: mod.file,
            from_caller: call.caller,
            from_symbol_id: callerSymId,
            to_symbol_id: call.bound_local_symbol_id,
            relationship_state: 'confirmed_static',
            evidence: 'lexical_nested_function',
            line: call.line
          });
        }
        continue;
      }

      // 3. Unqualified identifier call (`foo()`)
      if (parts.length === 1) {
        // 3a. Same-module top-level or IIFE-level declaration
        const sameModSyms = (localMap.get(root) || []).filter(
          s => s.scope_kind === 'module_top' || s.scope_kind === 'iife_module'
        );
        if (sameModSyms.length === 1) {
          const targetId = sameModSyms[0].symbol_id;
          if (targetId !== callerSymId) {
            addSetEntry(confirmedCallersBySymbol, targetId, callerLabel);
            if (callerSymId) addSetEntry(confirmedCalleesBySymbol, callerSymId, targetId);
            callEdges.push({
              from_file: mod.file,
              from_caller: call.caller,
              from_symbol_id: callerSymId,
              to_symbol_id: targetId,
              relationship_state: 'confirmed_static',
              evidence: 'lexical_same_module',
              line: call.line
            });
          }
          continue;
        }

        // 3b. Direct ESM / CJS import binding (`import { a as b } from './x.js'`)
        const imp = importBindings.get(root);
        if (imp && imp.kind === 'direct') {
          const targetExpMap = moduleExportMap.get(imp.targetFile);
          const targetId = targetExpMap?.get(imp.exportedName) || null;
          if (targetId) {
            addSetEntry(confirmedCallersBySymbol, targetId, callerLabel);
            if (callerSymId) addSetEntry(confirmedCalleesBySymbol, callerSymId, targetId);
            callEdges.push({
              from_file: mod.file,
              from_caller: call.caller,
              from_symbol_id: callerSymId,
              to_symbol_id: targetId,
              relationship_state: 'confirmed_static',
              evidence: 'explicit_module_import',
              line: call.line
            });
            continue;
          }
        }

        // 3c. Browser page-level global across `<script>` tags loaded on the same HTML document
        if (pageGlobals && pageGlobals.has(root)) {
          const gDefs = pageGlobals.get(root);
          const hasWrapper = gDefs.some(d => d.kind === 'browser_global_reassignment');
          const primaryDefs = gDefs.filter(d => d.kind !== 'browser_global_reassignment');
          if (hasWrapper && primaryDefs.length >= 1) {
            for (const d of gDefs) {
              addSetEntry(confirmedCallersBySymbol, d.symbol_id, callerLabel);
              if (callerSymId) addSetEntry(confirmedCalleesBySymbol, callerSymId, d.symbol_id);
            }
            callEdges.push({
              from_file: mod.file,
              from_caller: call.caller,
              from_symbol_id: callerSymId,
              to_symbol_id: primaryDefs[0].symbol_id,
              relationship_state: 'documented_wrapper',
              evidence: 'browser_load_order_wrapper',
              line: call.line
            });
          } else if (gDefs.length === 1) {
            const targetId = gDefs[0].symbol_id;
            addSetEntry(confirmedCallersBySymbol, targetId, callerLabel);
            if (callerSymId) addSetEntry(confirmedCalleesBySymbol, callerSymId, targetId);
            callEdges.push({
              from_file: mod.file,
              from_caller: call.caller,
              from_symbol_id: callerSymId,
              to_symbol_id: targetId,
              relationship_state: 'confirmed_static',
              evidence: 'unique_page_script_global',
              line: call.line
            });
          } else if (gDefs.length > 1) {
            for (const d of gDefs) {
              addSetEntry(inferredCallersBySymbol, d.symbol_id, callerLabel);
            }
            callEdges.push({
              from_file: mod.file,
              from_caller: call.caller,
              from_symbol_id: callerSymId,
              candidate_symbol_ids: gDefs.map(d => d.symbol_id),
              relationship_state: 'inferred_candidate',
              evidence: 'ambiguous_multi_script_global',
              line: call.line
            });
          }
          continue;
        }

        // 3d. Direct `window.<fn>` called bare in a browser script
        if (mod.file.startsWith('public/') && windowNamespaceLookup.has(root)) {
          const hits = windowNamespaceLookup.get(root);
          if (hits.length === 1) {
            addSetEntry(confirmedCallersBySymbol, hits[0].symbol_id, callerLabel);
            if (callerSymId) addSetEntry(confirmedCalleesBySymbol, callerSymId, hits[0].symbol_id);
            callEdges.push({
              from_file: mod.file,
              from_caller: call.caller,
              from_symbol_id: callerSymId,
              to_symbol_id: hits[0].symbol_id,
              relationship_state: 'confirmed_static',
              evidence: 'window_direct_property',
              line: call.line
            });
          }
        }
        continue;
      }

      // 4. Member call (`ns.fn()`, `window.bitesharkX.fn()`, `localObj.fn()`, or `instance.method()`)
      // 4a. `window.<ns>.<member>()` or `window.<fn>()`
      if (root === 'window' || root === 'globalThis') {
        const subKey = parts.slice(1).join('.');
        const wmHits = windowNamespaceLookup.get(subKey) || [];
        if (wmHits.length === 1) {
          addSetEntry(confirmedCallersBySymbol, wmHits[0].symbol_id, callerLabel);
          if (callerSymId) addSetEntry(confirmedCalleesBySymbol, callerSymId, wmHits[0].symbol_id);
          callEdges.push({
            from_file: mod.file,
            from_caller: call.caller,
            from_symbol_id: callerSymId,
            to_symbol_id: wmHits[0].symbol_id,
            relationship_state: 'confirmed_static',
            evidence: 'window_namespace_registration',
            line: call.line
          });
        } else if (wmHits.length > 1) {
          for (const h of wmHits) addSetEntry(inferredCallersBySymbol, h.symbol_id, callerLabel);
          callEdges.push({
            from_file: mod.file,
            from_caller: call.caller,
            from_symbol_id: callerSymId,
            candidate_symbol_ids: wmHits.map(h => h.symbol_id),
            relationship_state: 'inferred_candidate',
            evidence: 'ambiguous_window_namespace_member',
            line: call.line
          });
        }
        continue;
      }

      // 4b. Imported namespace call (`ns.fn()` from `import * as ns` or `const ns = require(...)`)
      const nsImp = importBindings.get(root);
      if (nsImp && nsImp.kind === 'namespace' && parts.length === 2) {
        const memberName = parts[1];
        const targetExpMap = moduleExportMap.get(nsImp.targetFile);
        const targetId = targetExpMap?.get(memberName) || null;
        if (targetId) {
          addSetEntry(confirmedCallersBySymbol, targetId, callerLabel);
          if (callerSymId) addSetEntry(confirmedCalleesBySymbol, callerSymId, targetId);
          callEdges.push({
            from_file: mod.file,
            from_caller: call.caller,
            from_symbol_id: callerSymId,
            to_symbol_id: targetId,
            relationship_state: 'confirmed_static',
            evidence: 'module_namespace_import',
            line: call.line
          });
          continue;
        }
      }

      // 4c. Same-module object method (`localObj.method()`)
      if (parts.length === 2) {
        const exactObjMember = (localMap.get(`${root}.${parts[1]}`) || [])[0];
        if (exactObjMember) {
          addSetEntry(confirmedCallersBySymbol, exactObjMember.symbol_id, callerLabel);
          if (callerSymId) addSetEntry(confirmedCalleesBySymbol, callerSymId, exactObjMember.symbol_id);
          callEdges.push({
            from_file: mod.file,
            from_caller: call.caller,
            from_symbol_id: callerSymId,
            to_symbol_id: exactObjMember.symbol_id,
            relationship_state: 'confirmed_static',
            evidence: 'same_module_object_method',
            line: call.line
          });
          continue;
        }

        // 4d. Bare `<namespace>.<member>()` in browser script matching `window.<namespace>.<member>`
        if (mod.file.startsWith('public/')) {
          const wmHits = windowNamespaceLookup.get(`${root}.${parts[1]}`) || [];
          if (wmHits.length === 1) {
            addSetEntry(confirmedCallersBySymbol, wmHits[0].symbol_id, callerLabel);
            if (callerSymId) addSetEntry(confirmedCalleesBySymbol, callerSymId, wmHits[0].symbol_id);
            callEdges.push({
              from_file: mod.file,
              from_caller: call.caller,
              from_symbol_id: callerSymId,
              to_symbol_id: wmHits[0].symbol_id,
              relationship_state: 'confirmed_static',
              evidence: 'window_namespace_registration',
              line: call.line
            });
            continue;
          }
        }
      }
    }
  }

  // Attach HTML inline handler bindings into `confirmedCallersBySymbol` / `inferredCallersBySymbol`
  for (const hh of htmlResolvedHandlers) {
    if (hh.target_symbol_id) {
      addSetEntry(confirmedCallersBySymbol, hh.target_symbol_id, `${hh.caller_location}[${hh.attribute}]`);
    } else if (Array.isArray(hh.candidate_symbol_ids)) {
      for (const cid of hh.candidate_symbol_ids) {
        addSetEntry(inferredCallersBySymbol, cid, `${hh.caller_location}[${hh.attribute}]`);
      }
    }
  }

  // Decorate each symbol in `jsAnalyses` with deterministic sorted relationship summaries
  for (const mod of jsAnalyses) {
    for (const sym of mod.symbols || []) {
      const confirmedIn = [...(confirmedCallersBySymbol.get(sym.symbol_id) || [])]
        .filter(loc => !loc.startsWith('tests/'))
        .sort(asciiCompare);
      const confirmedTestIn = [...(confirmedCallersBySymbol.get(sym.symbol_id) || [])]
        .filter(loc => loc.startsWith('tests/'))
        .sort(asciiCompare);
      const inferredIn = [...(inferredCallersBySymbol.get(sym.symbol_id) || [])]
        .filter(loc => !loc.startsWith('tests/'))
        .sort(asciiCompare);
      const confirmedOut = [...(confirmedCalleesBySymbol.get(sym.symbol_id) || [])].sort(asciiCompare);
      const dynSites = (dynamicCallsitesBySymbol.get(sym.symbol_id) || []).slice(0, 20);

      sym.confirmed_callers = confirmedIn;
      sym.confirmed_test_callers = confirmedTestIn;
      sym.inferred_candidate_callers = inferredIn;
      sym.confirmed_callees = confirmedOut;
      sym.dynamic_unresolved_callsites = dynSites;
    }
  }

  return {
    confirmed_edge_count: callEdges.filter(
      e => e.relationship_state === 'confirmed_static' || e.relationship_state === 'documented_wrapper'
    ).length,
    inferred_edge_count: callEdges.filter(e => e.relationship_state === 'inferred_candidate').length,
    html_handler_bindings: htmlResolvedHandlers,
    wrapper_chains: wrapperChains,
    edges: callEdges
  };
}
