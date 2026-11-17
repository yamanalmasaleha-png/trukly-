// Zero-dependency local Truckly full-stack preview & role simulator.
// Usage: node scripts/dev-server.cjs
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

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
  admin: { id: 'usr_demo_owner', email: 'owner@truckly.local', name: 'Truckly Provider', role: 'admin' }
};

function createInitialStore() {
  return {
    bookings: [],
    favorites: [],
    notification_settings: new Map(),
    truck_settings: new Map(),
    owner_profiles: new Map(),
    owner_schedule: [],
    pickup_pagers: [],
    community_reviews: []
  };
}

let store = createInitialStore();
let activeRequestUser = null;

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

const mockDb = {
  async query(sql, params = []) {
    const s = sql.replace(/\s+/g, ' ').trim();

    if (/^INSERT INTO bookings/i.test(s)) {
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
        package_id: params[8],
        package_name: params[9],
        package_price: Number(params[10]),
        status: 'pending',
        created_at: new Date().toISOString()
      };
      store.bookings.unshift(row);
      return { rows: [row], rowCount: 1 };
    }
    if (/SELECT count\(\*\)::int AS total_requests/i.test(s)) {
      const total_requests = store.bookings.length;
      const pending = store.bookings.filter(b => b.status === 'pending').length;
      const accepted = store.bookings.filter(b => b.status === 'accepted').length;
      return { rows: [{ total_requests, pending, accepted }], rowCount: 1 };
    }
    if (/^UPDATE bookings SET status\s*=\s*\$1 WHERE id\s*=\s*\$2/i.test(s)) {
      const row = store.bookings.find(b => b.id === params[1]);
      if (!row) return { rows: [], rowCount: 0 };
      row.status = params[0];
      return { rows: [{ id: row.id, status: row.status }], rowCount: 1 };
    }
    if (/FROM bookings WHERE requester\s*=\s*\$1/i.test(s)) {
      const rows = store.bookings.filter(b => b.requester === params[0]).sort((a, b) => String(b.event_date).localeCompare(String(a.event_date))).slice(0, 50);
      return { rows, rowCount: rows.length };
    }
    if (/FROM bookings WHERE status\s*=\s*'pending'/i.test(s)) {
      const rows = store.bookings.filter(b => b.status === 'pending').sort((a, b) => String(a.event_date).localeCompare(String(b.event_date))).slice(0, 25);
      return { rows, rowCount: rows.length };
    }
    if (/FROM bookings WHERE status\s*=\s*\$1/i.test(s)) {
      const rows = store.bookings.filter(b => b.status === params[0]).sort((a, b) => String(b.event_date).localeCompare(String(a.event_date))).slice(0, 100);
      return { rows, rowCount: rows.length };
    }
    if (/FROM bookings ORDER BY/i.test(s)) {
      const rows = [...store.bookings].sort((a, b) => String(b.event_date).localeCompare(String(a.event_date))).slice(0, 100);
      return { rows, rowCount: rows.length };
    }

    if (/SELECT truck_id,created_at FROM favorites WHERE user_id=\$1/i.test(s)) {
      const rows = store.favorites.filter(f => f.user_id === params[0]);
      return { rows, rowCount: rows.length };
    }
    if (/SELECT 1 FROM favorites WHERE user_id=\$1 AND truck_id=\$2/i.test(s)) {
      const found = store.favorites.some(f => f.user_id === params[0] && f.truck_id === params[1]);
      return { rows: found ? [{ '?column?': 1 }] : [], rowCount: found ? 1 : 0 };
    }
    if (/^DELETE FROM favorites WHERE user_id=\$1 AND truck_id=\$2/i.test(s)) {
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
    if (/FROM notification_settings WHERE user_id=\$1/i.test(s)) {
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
    if (/FROM truck_settings WHERE truck_id\s*=\s*\$1/i.test(s)) {
      const row = store.truck_settings.get(params[0]);
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }

    if (/^INSERT INTO owner_profiles/i.test(s)) {
      const row = { truck_id: params[0], display_name: params[1], description: params[2], cuisine: params[3], accepting_bookings: !!params[4], updated_at: new Date().toISOString() };
      store.owner_profiles.set(row.truck_id, row);
      return { rows: [row], rowCount: 1 };
    }
    if (/FROM owner_profiles WHERE truck_id=\$1/i.test(s)) {
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
    if (/FROM owner_schedule WHERE truck_id=\$1 AND service_date=\$2/i.test(s)) {
      const row = store.owner_schedule.find(x => x.truck_id === params[0] && x.service_date === params[1]);
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }
    if (/FROM owner_schedule s LEFT JOIN owner_profiles p/i.test(s)) {
      const rows = store.owner_schedule.filter(x => x.service_date === params[0] && x.status !== 'unavailable').map(x => {
        const prof = store.owner_profiles.get(x.truck_id);
        return { ...x, vendor: (prof && prof.display_name) || x.truck_id };
      });
      return { rows, rowCount: rows.length };
    }
    if (/FROM owner_schedule WHERE truck_id\s*=\s*\$1/i.test(s)) {
      const today = new Date().toISOString().slice(0, 10);
      const rows = store.owner_schedule.filter(x => x.truck_id === params[0] && x.service_date >= today).sort((a, b) => a.service_date.localeCompare(b.service_date));
      return { rows, rowCount: rows.length };
    }
    if (/FROM owner_schedule/i.test(s)) {
      const today = new Date().toISOString().slice(0, 10);
      const rows = store.owner_schedule.filter(x => x.service_date >= today).sort((a, b) => a.service_date.localeCompare(b.service_date));
      return { rows, rowCount: rows.length };
    }

    if (/^INSERT INTO pickup_pagers/i.test(s)) {
      let row = store.pickup_pagers.find(p => p.request_key === params[2]);
      if (!row) {
        const now = Date.now();
        row = { id: crypto.randomUUID(), vendor: params[0], ticket: params[1], status: 'cooking', request_key: params[2], created_at: new Date(now).toISOString(), updated_at: new Date(now).toISOString(), expires_at: new Date(now + 4 * 3600 * 1000).toISOString() };
        store.pickup_pagers.unshift(row);
      }
      return { rows: [row], rowCount: 1 };
    }
    if (/FROM pickup_pagers WHERE id=\$1/i.test(s)) {
      const row = store.pickup_pagers.find(p => p.id === params[0] && new Date(p.expires_at) > new Date());
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }
    if (/FROM pickup_pagers WHERE expires_at>now\(\)/i.test(s)) {
      const now = new Date();
      const rows = store.pickup_pagers.filter(p => new Date(p.expires_at) > now && !['collected', 'cancelled'].includes(p.status));
      return { rows, rowCount: rows.length };
    }
    if (/^UPDATE pickup_pagers SET status=\$2/i.test(s)) {
      const row = store.pickup_pagers.find(p => p.id === params[0] && new Date(p.expires_at) > new Date() && !['collected', 'cancelled'].includes(p.status));
      if (!row) return { rows: [], rowCount: 0 };
      row.status = params[1];
      row.updated_at = new Date().toISOString();
      return { rows: [row], rowCount: 1 };
    }

    if (/FROM community_reviews WHERE status='approved'/i.test(s)) {
      const rows = store.community_reviews.filter(c => c.status === 'approved');
      return { rows, rowCount: rows.length };
    }
    if (/FROM community_reviews WHERE author_id=\$1 AND created_at>NOW\(\)/i.test(s)) {
      const cutoff = Date.now() - 24 * 3600 * 1000;
      const total = store.community_reviews.filter(c => c.author_id === params[0] && new Date(c.created_at).getTime() > cutoff).length;
      return { rows: [{ total }], rowCount: 1 };
    }
    if (/FROM community_reviews WHERE author_id=\$1/i.test(s)) {
      const rows = store.community_reviews.filter(c => c.author_id === params[0]);
      return { rows, rowCount: rows.length };
    }
    if (/^INSERT INTO community_reviews/i.test(s)) {
      const row = { id: crypto.randomUUID(), author_id: params[0], nickname: params[1], kind: params[2], place_id: params[3], place_name: params[4], town: params[5], title: params[6], body: params[7], rating: params[8], status: 'pending', created_at: new Date().toISOString(), moderated_at: null };
      store.community_reviews.unshift(row);
      return { rows: [row], rowCount: 1 };
    }
    if (/FROM community_reviews WHERE status='pending'/i.test(s)) {
      const rows = store.community_reviews.filter(c => c.status === 'pending');
      return { rows, rowCount: rows.length };
    }
    if (/^UPDATE community_reviews SET status=\$1/i.test(s)) {
      const row = store.community_reviews.find(c => c.id === params[1] && c.status === 'pending');
      if (!row) return { rows: [], rowCount: 0 };
      row.status = params[0];
      row.moderated_at = new Date().toISOString();
      return { rows: [{ id: row.id, status: row.status }], rowCount: 1 };
    }

    return { rows: [], rowCount: 0 };
  }
};

const mockAuth = { async getUser() { return activeRequestUser; } };

function loadRoute(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const accessMatch = raw.match(/export\s+const\s+access\s*=\s*['"]([^'"]+)['"]/);
  const methodsMatch = raw.match(/export\s+const\s+methods\s*=\s*(\[[^\]]+\])/);
  const access = accessMatch ? accessMatch[1] : 'public';
  const methods = methodsMatch ? JSON.parse(methodsMatch[1].replace(/'/g, '"')) : ['GET'];

  const body = raw
    .replace(/import\s+\{[^}]*\}\s+from\s+['"]hatchable['"];?/g, '')
    .replace(/export\s+const\s+(?:access|methods)\s*=\s*[^;]+;?/g, '')
    .replace(/export\s+default\s+async\s+function\s*\(/, 'return async function(');

  const handler = new Function('db', 'auth', body)(mockDb, mockAuth);
  return { access, methods, handler };
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
          approved_reviews: store.community_reviews.filter(c => c.status === 'approved').length
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
      const route = loadRoute(resolved.filePath);
      if (!route.methods.includes(req.method)) {
        res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ error: 'Method not allowed' }));
      }

      const role = getRequestRole(req);
      const user = ROLE_USERS[role];
      activeRequestUser = user;

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
      await route.handler(mockReq, mockRes);
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
  console.log(`Truckly preview server listening at http://localhost:${addr.port}`);
});
