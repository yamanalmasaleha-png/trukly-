// BiteShark Code Registry — Stateful HTML5 & CSS3 Structure, Cascade & Token Analyzer
// (`tools/code-registry/html-css-analyzer.mjs`)

import { asciiCompare } from './schema-versions.mjs';
import { analyzeJavaScriptFile, extractCalledIdentifiersInInlineHandler } from './js-analyzer.mjs';

function stripCommentsPreservingNewlines(text, openDelim, closeDelim) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    if (text.startsWith(openDelim, i)) {
      const end = text.indexOf(closeDelim, i + openDelim.length);
      const stop = end === -1 ? text.length : end + closeDelim.length;
      for (let k = i; k < stop; k++) {
        out += text[k] === '\n' ? '\n' : ' ';
      }
      i = stop;
    } else {
      out += text[i++];
    }
  }
  return out;
}

function buildLineOffsets(text) {
  const offsets = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') offsets.push(i + 1);
  }
  return offsets;
}

function lineAtIndex(lineOffsets, index) {
  let lo = 0;
  let hi = lineOffsets.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lineOffsets[mid] <= index) lo = mid + 1;
    else hi = mid - 1;
  }
  return hi + 1;
}

function parseAttributes(attrText) {
  const attrs = [];
  const attrRe = /([A-Za-z_:][A-Za-z0-9_.:-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  while ((m = attrRe.exec(attrText)) !== null) {
    const name = m[1].toLowerCase();
    const val = m[2] ?? m[3] ?? m[4] ?? '';
    attrs.push({ name, value: val });
  }
  return attrs;
}

export function analyzeHtmlFile(source, relPath) {
  // Mask HTML comments while preserving exact offsets & line numbers
  const masked = stripCommentsPreservingNewlines(source, '<!--', '-->');
  const lineOffsets = buildLineOffsets(masked);

  // Mask <script> and <style> inner bodies before tag scanning so `<` inside JS/CSS never confuses tag parsing
  const inlineScripts = [];
  let tagSafeHtml = masked.replace(
    /(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi,
    (full, openTag, body, closeTag, offset) => {
      const line = lineAtIndex(lineOffsets, offset);
      const attrs = parseAttributes(openTag.slice(7, -1));
      const srcAttr = attrs.find(a => a.name === 'src');
      if (!srcAttr && body.trim()) {
        inlineScripts.push({
          line,
          source: '\n'.repeat(Math.max(0, line - 1)) + body
        });
      }
      const blankBody = body.replace(/[^\n]/g, ' ');
      return openTag + blankBody + closeTag;
    }
  );
  tagSafeHtml = tagSafeHtml.replace(
    /(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi,
    (_full, openTag, body, closeTag) => openTag + body.replace(/[^\n]/g, ' ') + closeTag
  );

  const elementsById = [];
  const duplicateIds = [];
  const seenIds = new Map();
  const screens = [];
  const formFields = [];
  const dataAttributes = new Set();
  const classesUsed = new Set();
  const inlineHandlers = [];
  const scriptsOrder = [];
  const stylesheetsOrder = [];
  const externalResources = [];

  const openTagRe = /<([A-Za-z][A-Za-z0-9:-]*)(\s[^>]*)?>/g;
  let tm;
  while ((tm = openTagRe.exec(tagSafeHtml)) !== null) {
    const tag = tm[1].toLowerCase();
    const attrRaw = tm[2] || '';
    const line = lineAtIndex(lineOffsets, tm.index);
    const attrs = parseAttributes(attrRaw);
    const attrMap = new Map();
    for (const a of attrs) {
      if (!attrMap.has(a.name)) attrMap.set(a.name, a.value);
    }

    const idVal = attrMap.get('id');
    const classVal = attrMap.get('class') || '';
    const classTokens = classVal.split(/\s+/).filter(Boolean);
    for (const c of classTokens) classesUsed.add(c);

    if (idVal) {
      if (seenIds.has(idVal)) {
        duplicateIds.push({
          id: idVal,
          file: relPath,
          first_line: seenIds.get(idVal),
          duplicate_line: line
        });
      } else {
        seenIds.set(idVal, line);
      }
      elementsById.push({
        id: idVal,
        tag,
        classes: classTokens,
        role: attrMap.get('role') || null,
        line
      });
    }

    if (classTokens.includes('screen') || (idVal && idVal.endsWith('Screen'))) {
      screens.push({
        id: idVal || null,
        tag,
        classes: classTokens,
        active_by_default: classTokens.includes('active'),
        line
      });
    }

    if (['input', 'select', 'textarea'].includes(tag)) {
      formFields.push({
        tag,
        id: idVal || null,
        name: attrMap.get('name') || null,
        type: attrMap.get('type') || (tag === 'select' ? 'select' : 'textarea'),
        required: attrs.some(a => a.name === 'required'),
        line
      });
    }

    for (const a of attrs) {
      if (a.name.startsWith('data-')) {
        dataAttributes.add(a.name);
      }
      if (/^on[a-z]+$/.test(a.name) && a.value.trim()) {
        const parsedExpr = extractCalledIdentifiersInInlineHandler(a.value);
        inlineHandlers.push({
          attribute: a.name,
          tag,
          element_id: idVal || null,
          expression: a.value.trim(),
          called_functions: parsedExpr.called_functions,
          parse_ok: parsedExpr.parse_ok,
          line
        });
      }
    }

    if (tag === 'script') {
      const src = attrMap.get('src');
      if (src) {
        const isExternal = /^https?:\/\//i.test(src);
        scriptsOrder.push({
          order: scriptsOrder.length + 1,
          src,
          external: isExternal,
          type: attrMap.get('type') || 'classic',
          defer: attrs.some(a => a.name === 'defer'),
          async: attrs.some(a => a.name === 'async'),
          integrity: attrMap.get('integrity') || null,
          line
        });
        if (isExternal) {
          externalResources.push({ kind: 'script', url: src, file: relPath, line });
        }
      }
    } else if (tag === 'link') {
      const rel = (attrMap.get('rel') || '').toLowerCase();
      const href = attrMap.get('href') || '';
      if (rel.includes('stylesheet') && href) {
        const isExternal = /^https?:\/\//i.test(href);
        stylesheetsOrder.push({
          order: stylesheetsOrder.length + 1,
          href,
          external: isExternal,
          line
        });
        if (isExternal) {
          externalResources.push({ kind: 'stylesheet', url: href, file: relPath, line });
        }
      }
    }
  }

  const inlineScriptAnalyses = inlineScripts.map((blk, idx) =>
    analyzeJavaScriptFile(blk.source, `${relPath}#inline_script_${idx + 1}`)
  );

  return {
    file: relPath,
    screens,
    elements_by_id: elementsById,
    duplicate_ids: duplicateIds,
    form_fields: formFields,
    data_attributes: [...dataAttributes].sort(),
    classes_used: [...classesUsed].sort(),
    inline_handlers: inlineHandlers,
    scripts_order: scriptsOrder,
    stylesheets_order: stylesheetsOrder,
    external_resources: externalResources,
    inline_scripts: inlineScriptAnalyses
  };
}

export function analyzeCssFile(source, relPath) {
  const masked = stripCommentsPreservingNewlines(source, '/*', '*/');
  const lineOffsets = buildLineOffsets(masked);

  const customProperties = [];
  const mediaQueries = [];
  const classSelectors = new Set();
  const idSelectors = new Set();
  const behavioralSelectors = new Set();
  const importantDeclarations = [];

  // 1. Custom property definitions (`--token-name: value`)
  for (const m of masked.matchAll(/(--[A-Za-z0-9_-]+)\s*:\s*([^;{}]+)[;}]/g)) {
    customProperties.push({
      name: m[1],
      value: m[2].trim(),
      file: relPath,
      line: lineAtIndex(lineOffsets, m.index)
    });
  }

  // 2. Media queries (`@media ... {`)
  for (const m of masked.matchAll(/@media\s*([^{]+)\{/gi)) {
    mediaQueries.push({
      condition: m[1].trim().replace(/\s+/g, ' '),
      file: relPath,
      line: lineAtIndex(lineOffsets, m.index)
    });
  }

  // 3. `!important` overrides
  for (const m of masked.matchAll(/([A-Za-z-]+)\s*:\s*([^;{}]*?!important)/gi)) {
    importantDeclarations.push({
      property: m[1].trim(),
      value: m[2].trim(),
      file: relPath,
      line: lineAtIndex(lineOffsets, m.index)
    });
  }

  // 4. Selector extraction from rule headers (masking declaration bodies at depth >= 1 except @media/@supports wrappers)
  let i = 0;
  let buf = '';
  const selectorHeaders = [];
  while (i < masked.length) {
    const ch = masked[i];
    if (ch === '"' || ch === "'") {
      const q = ch;
      buf += ch;
      i++;
      while (i < masked.length && masked[i] !== q) {
        if (masked[i] === '\\') {
          buf += masked[i++];
        }
        if (i < masked.length) buf += masked[i++];
      }
      if (i < masked.length) buf += masked[i++];
      continue;
    }
    if (ch === '{') {
      const header = buf.trim();
      buf = '';
      if (header.startsWith('@media') || header.startsWith('@supports') || header.startsWith('@layer')) {
        // Dive inside conditional group rule!
        i++;
        continue;
      }
      if (header && !header.startsWith('@')) {
        selectorHeaders.push(header);
      }
      // Skip declaration block balanced braces
      let depth = 1;
      i++;
      while (i < masked.length && depth > 0) {
        if (masked[i] === '{') depth++;
        else if (masked[i] === '}') depth--;
        i++;
      }
      continue;
    }
    if (ch === '}' || ch === ';') {
      buf = '';
      i++;
      continue;
    }
    buf += ch;
    i++;
  }

  for (const hdr of selectorHeaders) {
    for (const cm of hdr.matchAll(/\.([A-Za-z_-][A-Za-z0-9_-]*)/g)) {
      classSelectors.add(cm[1]);
    }
    for (const im of hdr.matchAll(/#([A-Za-z_-][A-Za-z0-9_-]*)/g)) {
      idSelectors.add(im[1]);
    }
    for (const bm of hdr.matchAll(/\[([A-Za-z0-9_:-]+)(?:[~|^$*]?=[^\]]+)?\]/g)) {
      const attr = bm[1].toLowerCase();
      if (attr === 'hidden' || attr.startsWith('aria-') || attr.startsWith('data-') || attr === 'role' || attr === 'open') {
        behavioralSelectors.add(`[${attr}]`);
      }
    }
  }

  return {
    file: relPath,
    custom_properties: customProperties,
    media_queries: mediaQueries,
    class_selectors: [...classSelectors].sort(),
    id_selectors: [...idSelectors].sort(),
    behavioral_selectors: [...behavioralSelectors].sort(),
    important_count: importantDeclarations.length,
    important_declarations: importantDeclarations
  };
}
