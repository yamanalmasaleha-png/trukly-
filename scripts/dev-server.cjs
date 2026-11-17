// LOCAL DEVELOPMENT PREVIEW & ROLE SIMULATOR ONLY — DO NOT DEPLOY TO PRODUCTION.
// Usage: node scripts/dev-server.cjs
// Note: Simulated role headers/cookies exist strictly in this local harness.
// Production Hatchable routes in api/**/*.js never read debug headers or cookies.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { register } = require('node:module');
const { pathToFileURL } = require('node:url');
const { AsyncLocalStorage } = require('node:async_hooks');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const API_DIR = path.join(ROOT, 'api');
const PORT = Number(process.env.PORT || 3456);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg'
};

const ROLE_USERS = {
  guest: null,
  customer: { id: 'usr_demo_customer', email: 'alex@sonoma.local', name: 'Alex Rivera', role: 'user' },
  customer_b: { id: 'usr_demo_customer_b', email: 'jordan@sonoma.local', name: 'Jordan Kim', role: 'user' },
  vendor_a_owner: { id: 'usr_vendor_a_owner', email: 'iniguez-owner@truckly.local', name: 'Iñiguez Owner', role: 'user' },
  vendor_a_staff: { id: 'usr_vendor_a_staff', email: 'iniguez-staff@truckly.local', name: 'Iñiguez Staff', role: 'user' },
  vendor_b_owner: { id: 'usr_vendor_b_owner', email: 'mitote-owner@truckly.local', name: 'Mitote Owner', role: 'user' },
  moderator: { id: 'usr_demo_moderator', email: 'moderator@truckly.local', name: 'Community Moderator', role: 'user' },
  admin: { id: 'usr_platform_admin', email: 'admin@truckly.local', name: 'Platform Admin', role: 'admin' }
};

const requestAls = new AsyncLocalStorage();
let canonicalVendors = [];
let store = null;

function createInitialStore() {
  const vendors = new Map(
    canonicalVendors.map(v => [
      v.id,
      {
        id: v.id,
        canonical_name: v.canonical_name,
        city: v.city,
        cuisine: v.cuisine,
        listing_kind: v.listing_kind,
        event_bookable: !!v.event_bookable,
        is_active: true
      }
    ])
  );

  return {
    vendors,
    platform_roles: new Map([
      ['usr_platform_admin', { user_id: 'usr_platform_admin', role: 'platform_admin' }],
      ['usr_demo_moderator', { user_id: 'usr_demo_moderator', role: 'moderator' }]
    ]),
    vendor_memberships: [
      { vendor_id: 'iniguez', user_id: 'usr_vendor_a_owner', role: 'owner', granted_by: 'usr_platform_admin' },
      { vendor_id: 'iniguez', user_id: 'usr_vendor_a_staff', role: 'staff', granted_by: 'usr_vendor_a_owner' },
      { vendor_id: 'mitote', user_id: 'usr_vendor_b_owner', role: 'owner', granted_by: 'usr_platform_admin' }
    ],
    bookings: [],
    favorites: [],
    notification_settings: new Map(),
    truck_settings: new Map(),
    owner_profiles: new Map(),
    owner_schedule: [],
    pickup_pagers: [],
    community_reviews: [],
    audit_logs: []
  };
}

function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return out;
}

function getRequestRole(req) {
  const hdr = String(req.headers['x-truckly-debug-role'] || '').trim().toLowerCase();
  if (hdr && Object.prototype.hasOwnProperty.call(ROLE_USERS, hdr)) return hdr;
  const cookies = parseCookies(req.headers.cookie);
  const cRole = String(cookies.truckly_debug_role || '').trim().toLowerCase();
  if (cRole && Object.prototype.hasOwnProperty.call(ROLE_USERS, cRole)) return cRole;
  return 'guest';
}

function vendorDisplayName(vendorId) {
  const v = store.vendors.get(vendorId);
  const op = store.owner_profiles.get(vendorId);
  return (op && op.display_name) || (v && v.canonical_name) || vendorId;
}

const mockDb = {
  async transaction(fn) {
    return fn(mockDb);
  },
  async query(sql, params = []) {
    const s = sql.replace(/\s+/g, ' ').trim();

    if (/^SELECT set_config/i.test(s)) {
      return { rows: [{}], rowCount: 1 };
    }

    if (/^INSERT INTO audit_logs/i.test(s)) {
      const entry = {
        id: crypto.randomUUID(),
        actor_id: params[0],
        actor_role: params[1],
        vendor_id: params[2],
        target_type: params[3],
        target_id: params[4],
        action: params[5],
        metadata: JSON.parse(params[6] || '{}'),
        created_at: new Date().toISOString()
      };
      store.audit_logs.unshift(entry);
      return { rows: [entry], rowCount: 1 };
    }

    if (/SELECT role FROM platform_roles WHERE user_id = \$1/i.test(s)) {
      const r = store.platform_roles.get(params[0]);
      return { rows: r ? [r] : [], rowCount: r ? 1 : 0 };
    }

    if (/FROM vendor_memberships m JOIN vendors v/i.test(s)) {
      const rows = store.vendor_memberships
        .filter(m => m.user_id === params[0] && store.vendors.get(m.vendor_id)?.is_active)
        .map(m => ({
          vendor_id: m.vendor_id,
          role: m.role,
          canonical_name: vendorDisplayName(m.vendor_id)
        }))
        .sort((a, b) => a.vendor_id.localeCompare(b.vendor_id));
      return { rows, rowCount: rows.length };
    }

    if (/FROM vendors v LEFT JOIN owner_profiles op ON op\.truck_id = v\.id WHERE v\.id = \$1/i.test(s)) {
      const v = store.vendors.get(params[0]);
      if (!v) return { rows: [], rowCount: 0 };
      if (/AND v\.is_active = true/i.test(s) && !v.is_active) return { rows: [], rowCount: 0 };
      const op = store.owner_profiles.get(v.id);
      return {
        rows: [{
          id: v.id,
          truck_id: v.id,
          is_active: v.is_active,
          event_bookable: v.event_bookable,
          canonical_name: vendorDisplayName(v.id),
          display_name: vendorDisplayName(v.id),
          place_name: vendorDisplayName(v.id),
          town: v.city,
          description: op?.description || null,
          cuisine: op?.cuisine || v.cuisine,
          accepting_bookings: op ? op.accepting_bookings !== false : true,
          updated_at: op?.updated_at || null
        }],
        rowCount: 1
      };
    }

    if (/FROM bookings WHERE requester_user_id = \$1 AND idempotency_key = \$2/i.test(s)) {
      const found = store.bookings.find(b => b.requester_user_id === params[0] && b.idempotency_key === params[1]);
      return { rows: found ? [found] : [], rowCount: found ? 1 : 0 };
    }

    if (/^INSERT INTO bookings/i.test(s)) {
      const hasIdem = params.length === 14;
      const idemKey = hasIdem ? params[12] : null;
      const reqHash = hasIdem ? params[13] : params[12];
      if (idemKey) {
        const dup = store.bookings.find(b => b.requester_user_id === params[8] && b.idempotency_key === idemKey);
        if (dup) return { rows: [], rowCount: 0 };
      }
      const row = {
        id: crypto.randomUUID(),
        truck_id: params[0],
        truck_name: params[1],
        event_type: params[2],
        event_date: params[3],
        guest_count: Number(params[4]),
        location: params[5],
        note: params[6],
        requester: params[7],
        requester_user_id: params[8],
        requester_email: params[7],
        package_id: params[9],
        package_name: params[10],
        package_price: Number(params[11]),
        idempotency_key: idemKey,
        request_hash: reqHash,
        status: 'pending',
        decided_by: null,
        decided_at: null,
        created_at: new Date().toISOString()
      };
      store.bookings.unshift(row);
      return { rows: [row], rowCount: 1 };
    }

    if (/SELECT count\(\*\)::int AS total_requests/i.test(s)) {
      const scoped = /ANY\(\$1::text\[\]\)/i.test(s)
        ? store.bookings.filter(b => Array.isArray(params[0]) && params[0].includes(b.truck_id))
        : store.bookings;
      return {
        rows: [{
          total_requests: scoped.length,
          pending: scoped.filter(b => b.status === 'pending').length,
          accepted: scoped.filter(b => b.status === 'accepted').length
        }],
        rowCount: 1
      };
    }

    if (/SELECT id, truck_id, (?:to_char\(event_date, 'YYYY-MM-DD'\) AS )?event_date, status FROM bookings WHERE id = \$1/i.test(s)) {
      const row = store.bookings.find(b => b.id === params[0]);
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }

    if (/^UPDATE bookings SET status = \$1, decided_by = \$2/i.test(s)) {
      const row = store.bookings.find(b => b.id === params[2] && b.status === 'pending');
      if (!row) return { rows: [], rowCount: 0 };
      row.status = params[0];
      row.decided_by = params[1];
      row.decided_at = new Date().toISOString();
      return { rows: [row], rowCount: 1 };
    }

    if (/FROM bookings WHERE requester_user_id = \$1/i.test(s)) {
      const rows = store.bookings
        .filter(b => b.requester_user_id === params[0])
        .sort((a, b) => String(b.event_date).localeCompare(String(a.event_date)))
        .slice(0, 50);
      return { rows, rowCount: rows.length };
    }

    if (/FROM bookings WHERE status = 'pending' AND truck_id = ANY/i.test(s)) {
      const rows = store.bookings
        .filter(b => b.status === 'pending' && Array.isArray(params[0]) && params[0].includes(b.truck_id))
        .sort((a, b) => String(a.event_date).localeCompare(String(b.event_date)));
      return { rows, rowCount: rows.length };
    }

    if (/FROM bookings WHERE status = 'pending'/i.test(s)) {
      const rows = store.bookings
        .filter(b => b.status === 'pending')
        .sort((a, b) => String(a.event_date).localeCompare(String(b.event_date)));
      return { rows, rowCount: rows.length };
    }

    if (/FROM bookings WHERE truck_id = ANY\(\$1::text\[\]\) AND status = \$2/i.test(s)) {
      const rows = store.bookings
        .filter(b => Array.isArray(params[0]) && params[0].includes(b.truck_id) && b.status === params[1])
        .sort((a, b) => String(b.event_date).localeCompare(String(a.event_date)));
      return { rows, rowCount: rows.length };
    }

    if (/FROM bookings WHERE truck_id = ANY\(\$1::text\[\]\)/i.test(s)) {
      const rows = store.bookings
        .filter(b => Array.isArray(params[0]) && params[0].includes(b.truck_id))
        .sort((a, b) => String(b.event_date).localeCompare(String(a.event_date)));
      return { rows, rowCount: rows.length };
    }

    if (/FROM bookings WHERE status = \$1/i.test(s)) {
      const rows = store.bookings
        .filter(b => b.status === params[0])
        .sort((a, b) => String(b.event_date).localeCompare(String(a.event_date)));
      return { rows, rowCount: rows.length };
    }

    if (/FROM bookings ORDER BY/i.test(s)) {
      const rows = [...store.bookings].sort((a, b) => String(b.event_date).localeCompare(String(a.event_date)));
      return { rows, rowCount: rows.length };
    }

    if (/SELECT truck_id, created_at FROM favorites WHERE user_id = \$1/i.test(s)) {
      const rows = store.favorites.filter(f => f.user_id === params[0]);
      return { rows, rowCount: rows.length };
    }
    if (/SELECT 1 FROM favorites WHERE user_id = \$1 AND truck_id = \$2/i.test(s)) {
      const found = store.favorites.some(f => f.user_id === params[0] && f.truck_id === params[1]);
      return { rows: found ? [{ '?column?': 1 }] : [], rowCount: found ? 1 : 0 };
    }
    if (/^DELETE FROM favorites/i.test(s)) {
      const before = store.favorites.length;
      store.favorites = store.favorites.filter(f => !(f.user_id === params[0] && f.truck_id === params[1]));
      return { rows: [], rowCount: before - store.favorites.length };
    }
    if (/^INSERT INTO favorites/i.test(s)) {
      const row = { user_id: params[0], truck_id: params[1], created_at: new Date().toISOString() };
      if (!store.favorites.some(f => f.user_id === row.user_id && f.truck_id === row.truck_id)) store.favorites.unshift(row);
      return { rows: [row], rowCount: 1 };
    }

    if (/^INSERT INTO notification_settings/i.test(s)) {
      const row = { user_id: params[0], nearby_enabled: !!params[1], radius_miles: Number(params[2]), updated_at: new Date().toISOString() };
      store.notification_settings.set(row.user_id, row);
      return { rows: [row], rowCount: 1 };
    }
    if (/FROM notification_settings WHERE user_id = \$1/i.test(s)) {
      const row = store.notification_settings.get(params[0]);
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }

    if (/^INSERT INTO truck_settings/i.test(s)) {
      const prev = store.truck_settings.get(params[0]) || {};
      const row = {
        truck_id: params[0],
        location: params[1],
        is_open: params.length > 2 ? (params[5] != null ? params[5] : params[2]) : (prev.is_open ?? true),
        opens_at: params.length > 2 ? (params[3] || prev.opens_at || null) : (prev.opens_at || null),
        closes_at: params.length > 2 ? (params[4] || prev.closes_at || null) : (prev.closes_at || null),
        updated_at: new Date().toISOString()
      };
      store.truck_settings.set(row.truck_id, row);
      return { rows: [row], rowCount: 1 };
    }
    if (/FROM truck_settings WHERE truck_id = \$1/i.test(s)) {
      const row = store.truck_settings.get(params[0]);
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }

    if (/^INSERT INTO owner_profiles/i.test(s)) {
      const row = { truck_id: params[0], display_name: params[1], description: params[2], cuisine: params[3], accepting_bookings: !!params[4], updated_at: new Date().toISOString() };
      store.owner_profiles.set(row.truck_id, row);
      return { rows: [row], rowCount: 1 };
    }
    if (/FROM owner_profiles WHERE truck_id = \$1/i.test(s)) {
      const row = store.owner_profiles.get(params[0]);
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }

    if (/^INSERT INTO owner_schedule/i.test(s)) {
      const idx = store.owner_schedule.findIndex(x => x.truck_id === params[0] && x.service_date === params[1]);
      const row = { id: idx >= 0 ? store.owner_schedule[idx].id : crypto.randomUUID(), truck_id: params[0], service_date: params[1], opens_at: params[2], closes_at: params[3], location: params[4], status: params[5] || 'scheduled' };
      if (idx >= 0) store.owner_schedule[idx] = row;
      else store.owner_schedule.push(row);
      return { rows: [row], rowCount: 1 };
    }
    if (/FROM owner_schedule WHERE truck_id = \$1 AND service_date = \$2/i.test(s)) {
      const row = store.owner_schedule.find(x => x.truck_id === params[0] && x.service_date === params[1]);
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }
    if (/FROM owner_schedule s JOIN vendors v/i.test(s)) {
      const rows = store.owner_schedule
        .filter(x => x.service_date === params[0] && x.status !== 'unavailable' && store.vendors.get(x.truck_id)?.is_active)
        .map(x => ({ ...x, vendor: vendorDisplayName(x.truck_id) }));
      return { rows, rowCount: rows.length };
    }
    if (/FROM owner_schedule WHERE truck_id = ANY\(\$1::text\[\]\) AND service_date >= \$2/i.test(s)) {
      const rows = store.owner_schedule
        .filter(x => Array.isArray(params[0]) && params[0].includes(x.truck_id) && x.service_date >= params[1])
        .sort((a, b) => a.service_date.localeCompare(b.service_date));
      return { rows, rowCount: rows.length };
    }
    if (/FROM owner_schedule WHERE service_date >= \$1/i.test(s)) {
      const rows = store.owner_schedule
        .filter(x => x.service_date >= params[0])
        .sort((a, b) => a.service_date.localeCompare(b.service_date));
      return { rows, rowCount: rows.length };
    }

    if (/FROM pickup_pagers WHERE request_key = \$1/i.test(s)) {
      const row = store.pickup_pagers.find(p => p.request_key === params[0]);
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }
    if (/^INSERT INTO pickup_pagers/i.test(s)) {
      const existing = store.pickup_pagers.find(p => p.request_key === params[3]);
      if (existing) {
        return { rows: [], rowCount: 0 };
      }
      const now = Date.now();
      const row = {
        id: crypto.randomUUID(),
        vendor_id: params[0],
        vendor: params[1],
        ticket: params[2],
        request_key: params[3],
        created_by: params[4],
        updated_by: params[4],
        status: 'cooking',
        created_at: new Date(now).toISOString(),
        updated_at: new Date(now).toISOString(),
        expires_at: new Date(now + 4 * 3600 * 1000).toISOString()
      };
      store.pickup_pagers.unshift(row);
      return { rows: [row], rowCount: 1 };
    }
    if (/FROM pickup_pagers WHERE id=\$1 AND expires_at>now\(\)/i.test(s)) {
      const row = store.pickup_pagers.find(p => p.id === params[0] && new Date(p.expires_at) > new Date());
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }
    if (/FROM pickup_pagers WHERE id = \$1/i.test(s)) {
      const row = store.pickup_pagers.find(p => p.id === params[0]);
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }
    if (/FROM pickup_pagers WHERE vendor_id = ANY/i.test(s)) {
      const now = new Date();
      const rows = store.pickup_pagers.filter(
        p => Array.isArray(params[0]) && params[0].includes(p.vendor_id) && new Date(p.expires_at) > now && !['collected', 'cancelled'].includes(p.status)
      );
      return { rows, rowCount: rows.length };
    }
    if (/FROM pickup_pagers WHERE expires_at > now\(\)/i.test(s)) {
      const now = new Date();
      const rows = store.pickup_pagers.filter(p => new Date(p.expires_at) > now && !['collected', 'cancelled'].includes(p.status));
      return { rows, rowCount: rows.length };
    }
    if (/^UPDATE pickup_pagers SET status = \$2/i.test(s)) {
      const row = store.pickup_pagers.find(p => p.id === params[0]);
      if (!row) return { rows: [], rowCount: 0 };
      row.status = params[1];
      row.updated_by = params[2];
      row.updated_at = new Date().toISOString();
      return { rows: [row], rowCount: 1 };
    }

    if (/FROM community_public_posts/i.test(s)) {
      const rows = store.community_reviews
        .filter(c => c.status === 'approved')
        .map(({ id, nickname, kind, place_id, place_name, town, title, body, rating, created_at }) => ({
          id, nickname, kind, place_id, place_name, town, title, body, rating, created_at
        }));
      return { rows, rowCount: rows.length };
    }
    if (/FROM community_reviews WHERE author_id = \$1 AND created_at > NOW\(\)/i.test(s)) {
      const cutoff = Date.now() - 24 * 3600 * 1000;
      const total = store.community_reviews.filter(c => c.author_id === params[0] && new Date(c.created_at).getTime() > cutoff).length;
      return { rows: [{ total }], rowCount: 1 };
    }
    if (/FROM community_reviews WHERE author_id = \$1/i.test(s)) {
      const rows = store.community_reviews.filter(c => c.author_id === params[0]);
      return { rows, rowCount: rows.length };
    }
    if (/^INSERT INTO community_reviews/i.test(s)) {
      const row = {
        id: crypto.randomUUID(),
        author_id: params[0],
        nickname: params[1],
        kind: params[2],
        place_id: params[3],
        place_name: params[4],
        town: params[5],
        title: params[6],
        body: params[7],
        rating: params[8],
        status: 'pending',
        created_at: new Date().toISOString(),
        moderated_at: null,
        moderated_by: null
      };
      store.community_reviews.unshift(row);
      return { rows: [row], rowCount: 1 };
    }
    if (/FROM community_reviews WHERE status = 'pending'/i.test(s)) {
      const rows = store.community_reviews.filter(c => c.status === 'pending');
      return { rows, rowCount: rows.length };
    }
    if (/SELECT id, place_id, status FROM community_reviews WHERE id = \$1/i.test(s)) {
      const row = store.community_reviews.find(c => c.id === params[0]);
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }
    if (/^UPDATE community_reviews SET status = \$1, moderated_at = NOW\(\), moderated_by = \$2/i.test(s)) {
      const row = store.community_reviews.find(c => c.id === params[2] && c.status === 'pending');
      if (!row) return { rows: [], rowCount: 0 };
      row.status = params[0];
      row.moderated_by = params[1];
      row.moderated_at = new Date().toISOString();
      return { rows: [{ id: row.id, status: row.status, moderated_at: row.moderated_at }], rowCount: 1 };
    }

    return { rows: [], rowCount: 0 };
  }
};

const mockAuth = {
  async getUser() {
    return requestAls.getStore()?.user || null;
  }
};

globalThis.__TRUCKLY_HATCHABLE__ = { db: mockDb, auth: mockAuth };
const loaderCode = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "hatchable") {
    return {
      shortCircuit: true,
      url: "data:text/javascript,export const db = globalThis.__TRUCKLY_HATCHABLE__.db; export const auth = globalThis.__TRUCKLY_HATCHABLE__.auth;"
    };
  }
  return nextResolve(specifier, context);
}
`;
register('data:text/javascript,' + encodeURIComponent(loaderCode));

const routeCache = new Map();
async function loadRoute(filePath) {
  if (!routeCache.has(filePath)) {
    const mod = await import(pathToFileURL(filePath).href);
    routeCache.set(filePath, {
      access: mod.access || 'public',
      methods: mod.methods || ['GET'],
      handler: mod.default
    });
  }
  return routeCache.get(filePath);
}

function resolveApiRoute(pathname) {
  const rel = pathname.replace(/^\/api\/?/, '');
  if (!rel) return null;
  const directFile = path.join(API_DIR, ...rel.split('/')) + '.js';
  if (fs.existsSync(directFile) && fs.statSync(directFile).isFile()) return { filePath: directFile, params: {} };
  const parts = rel.split('/');
  if (parts.length === 2 && parts[0] === 'trucks') {
    const dynFile = path.join(API_DIR, 'trucks', '[id].js');
    if (fs.existsSync(dynFile)) return { filePath: dynFile, params: { id: decodeURIComponent(parts[1]) } };
  }
  return null;
}

(async () => {
  const catalogMod = await import(pathToFileURL(path.join(ROOT, 'lib', 'catalog.js')).href);
  canonicalVendors = catalogMod.CANONICAL_VENDORS;
  store = createInitialStore();

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const pathname = url.pathname;

      if (pathname === '/__debug/state') {
        const role = getRequestRole(req);
        if (req.method === 'POST') {
          let rawBody = '';
          for await (const chunk of req) rawBody += chunk;
          const body = rawBody ? JSON.parse(rawBody) : {};
          if (body.action === 'reset') store = createInitialStore();
        }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        return res.end(JSON.stringify({
          local_simulator: true,
          role,
          user: ROLE_USERS[role],
          counts: {
            bookings: store.bookings.length,
            pending_bookings: store.bookings.filter(b => b.status === 'pending').length,
            favorites: store.favorites.length,
            schedules: store.owner_schedule.length,
            active_pagers: store.pickup_pagers.filter(p => !['collected', 'cancelled'].includes(p.status)).length,
            pending_reviews: store.community_reviews.filter(c => c.status === 'pending').length,
            approved_reviews: store.community_reviews.filter(c => c.status === 'approved').length,
            audit_logs: store.audit_logs.length
          },
          pagers: store.pickup_pagers.slice(0, 5)
        }));
      }

      if (pathname.startsWith('/api/')) {
        const resolved = resolveApiRoute(pathname);
        if (!resolved) {
          res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ error: 'Not found' }));
        }
        const route = await loadRoute(resolved.filePath);
        if (!route.methods.includes(req.method)) {
          res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ error: 'Method not allowed' }));
        }

        const role = getRequestRole(req);
        const user = ROLE_USERS[role];

        if (route.access === 'user' && !user) {
          res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ error: 'Sign in required' }));
        }
        if (route.access === 'admin' && (!user || user.role !== 'admin')) {
          res.writeHead(user ? 403 : 401, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ error: 'Admin access required' }));
        }

        let rawBody = '';
        for await (const chunk of req) rawBody += chunk;
        let parsedBody = {};
        if (rawBody) {
          try { parsedBody = JSON.parse(rawBody); } catch { parsedBody = {}; }
        }

        const query = Object.fromEntries(url.searchParams.entries());
        let statusCode = 200;
        const headers = { 'Content-Type': 'application/json; charset=utf-8' };

        const mockReq = { method: req.method, query, params: resolved.params, body: parsedBody, headers: req.headers, user };
        const mockRes = {
          setHeader(k, v) { headers[k] = v; },
          status(code) { statusCode = code; return this; },
          json(payload) {
            if (!res.headersSent) {
              res.writeHead(statusCode, headers);
              res.end(JSON.stringify(payload));
            }
            return this;
          }
        };
        await requestAls.run({ user }, () => route.handler(mockReq, mockRes));
        return;
      }

      const relPath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
      const safePath = path.normalize(path.join(PUBLIC_DIR, relPath));
      if (!safePath.startsWith(PUBLIC_DIR) || !fs.existsSync(safePath) || !fs.statSync(safePath).isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Not found');
      }
      const ext = path.extname(safePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      fs.createReadStream(safePath).pipe(res);
    } catch (err) {
      console.error('Server error:', err);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
    }
  });

  server.listen(PORT, '127.0.0.1', () => {
    const addr = server.address();
    console.log(`Truckly LOCAL DEV simulator listening at http://localhost:${addr.port} (DO NOT DEPLOY)`);
  });
})();
