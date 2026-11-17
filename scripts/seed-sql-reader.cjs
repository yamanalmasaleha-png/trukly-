// Parses the 59 canonical vendor seed rows directly from migrations/014_unified_discovery_catalog.sql
// for local zero-dependency tooling (scripts/dev-server.cjs fallback mock and tests/listing-verification.cjs).
// Production and real-PostgreSQL tests execute migrations/014_unified_discovery_catalog.sql in PostgreSQL directly.

const fs = require('node:fs');
const path = require('node:path');

const COLUMNS = [
  'id',
  'sort_order',
  'canonical_name',
  'section',
  'cuisine',
  'emoji',
  'city',
  'listing_kind',
  'kind_label',
  'listing_type',
  'popup',
  'extra',
  'blurb',
  'special_note',
  'source_url',
  'story_source_url',
  'checked_label',
  'price',
  'color',
  'tags',
  'rating',
  'reviews',
  'featured',
  'curated_location',
  'curated_lat',
  'curated_lng',
  'curated_location_source',
  'curated_location_accuracy',
  'curated_hours',
  'recurring_schedule',
  'verified',
  'verification_status',
  'photo',
  'photo_rights_verified',
  'event_bookable',
  'is_active',
  'updated_at'
];

function parseSqlValue(token) {
  const t = token.trim();
  if (/^NULL$/i.test(t)) return null;
  if (/^true$/i.test(t)) return true;
  if (/^false$/i.test(t)) return false;
  if (/^now\(\)$/i.test(t)) return '2026-11-16T00:00:00.000Z';

  if (/^ARRAY\[/i.test(t)) {
    const inner = t.replace(/^ARRAY\[/i, '').replace(/\](?:::text\[\])?$/i, '').trim();
    if (!inner) return [];
    const items = [];
    let i = 0;
    while (i < inner.length) {
      while (i < inner.length && (inner[i] === ' ' || inner[i] === ',')) i++;
      if (inner[i] === "'") {
        i++;
        let s = '';
        while (i < inner.length) {
          if (inner[i] === "'" && inner[i + 1] === "'") {
            s += "'";
            i += 2;
          } else if (inner[i] === "'") {
            i++;
            break;
          } else {
            s += inner[i++];
          }
        }
        items.push(s);
      } else {
        break;
      }
    }
    return items;
  }

  if (t.endsWith('::jsonb')) {
    const rawLit = t.slice(0, -'::jsonb'.length).trim();
    const unquoted = parseSqlValue(rawLit);
    return typeof unquoted === 'string' ? JSON.parse(unquoted) : unquoted;
  }

  if (t.startsWith("'") && t.endsWith("'")) {
    return t.slice(1, -1).replace(/''/g, "'");
  }

  const num = Number(t);
  if (Number.isFinite(num)) return num;
  throw new Error(`Unsupported SQL seed token: ${t}`);
}

function splitTupleTokens(tupleBody) {
  const tokens = [];
  let current = '';
  let inQuotes = false;
  let bracketDepth = 0;
  let parenDepth = 0;

  for (let i = 0; i < tupleBody.length; i++) {
    const ch = tupleBody[i];
    if (inQuotes) {
      current += ch;
      if (ch === "'" && tupleBody[i + 1] === "'") {
        current += "'";
        i++;
      } else if (ch === "'") {
        inQuotes = false;
      }
      continue;
    }

    if (ch === "'") {
      inQuotes = true;
      current += ch;
    } else if (ch === '[') {
      bracketDepth++;
      current += ch;
    } else if (ch === ']') {
      bracketDepth--;
      current += ch;
    } else if (ch === '(') {
      parenDepth++;
      current += ch;
    } else if (ch === ')') {
      parenDepth--;
      current += ch;
    } else if (ch === ',' && bracketDepth === 0 && parenDepth === 0) {
      tokens.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim().length > 0) tokens.push(current);
  return tokens;
}

function loadSeedVendorsFromMigration014(rootDir = path.resolve(__dirname, '..')) {
  const sqlPath = path.join(rootDir, 'migrations', '014_unified_discovery_catalog.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const markerIdx = sql.indexOf('INSERT INTO vendors');
  if (markerIdx < 0) throw new Error('INSERT INTO vendors not found in 014_unified_discovery_catalog.sql');
  const valuesIdx = sql.indexOf(') VALUES', markerIdx);
  const conflictIdx = sql.indexOf('ON CONFLICT (id)', valuesIdx);
  const block = sql.slice(valuesIdx + ') VALUES'.length, conflictIdx);

  const rows = [];
  const lines = block.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('--')) continue;
    const cleaned = line.replace(/,$/, '');
    if (!cleaned.startsWith('(') || !cleaned.endsWith(')')) continue;
    const body = cleaned.slice(1, -1);
    const tokens = splitTupleTokens(body);
    if (tokens.length !== COLUMNS.length) {
      throw new Error(`Expected ${COLUMNS.length} columns, got ${tokens.length} in line: ${line.slice(0, 80)}`);
    }
    const obj = {};
    for (let c = 0; c < COLUMNS.length; c++) {
      obj[COLUMNS[c]] = parseSqlValue(tokens[c]);
    }
    rows.push(obj);
  }
  return rows;
}

module.exports = { loadSeedVendorsFromMigration014 };
