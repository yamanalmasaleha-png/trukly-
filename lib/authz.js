import crypto from 'node:crypto';

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FORBIDDEN_AUDIT_KEYS = new Set([
  'token',
  'code',
  'pager_code',
  'pager_id',
  'request_key',
  'idempotency_key',
  'note',
  'body',
  'password',
  'secret'
]);

function configuredAdminIds() {
  const raw = (typeof process !== 'undefined' && process.env && process.env.TRUCKLY_PLATFORM_ADMIN_IDS) || '';
  return new Set(
    raw
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
  );
}

/**
 * Security-preserving operational write kill-switch (`TRUCKLY_PAUSE_WRITES`).
 * Allows temporarily pausing specific write scopes (`bookings`, `pagers`, `community`, `owner`, or `all`)
 * during an incident without relaxing RLS, triggers, constraints, or RBAC.
 */
export function isWritePaused(scope) {
  const raw = (typeof process !== 'undefined' && process.env && process.env.TRUCKLY_PAUSE_WRITES) || '';
  if (!raw.trim()) return false;
  const paused = new Set(
    raw
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(Boolean)
  );
  return paused.has('all') || paused.has(String(scope || '').toLowerCase());
}

/**
 * Resolves authenticated user strictly from Hatchable's trusted server runtime (req.user / auth.getUser).
 * Relies only on `id` and optional `email` (proven in existing Hatchable routes).
 * Never inspects client headers, cookies, query strings, request bodies, or unverified user role fields.
 */
export async function resolveIdentity(req, auth) {
  let rawUser = null;
  if (req && req.user && typeof req.user === 'object') {
    rawUser = req.user;
  } else if (auth && typeof auth.getUser === 'function') {
    rawUser = await auth.getUser(req);
  }

  // Unwrap `{ data: { user } }` only if an SDK wrapper returns that envelope without top-level `id`.
  if (rawUser && typeof rawUser.id !== 'string' && rawUser.data && typeof rawUser.data.user === 'object') {
    rawUser = rawUser.data.user;
  }

  if (!rawUser || typeof rawUser.id !== 'string') return null;
  const id = rawUser.id.trim();
  if (!id || id.length > 128) return null;

  const email = typeof rawUser.email === 'string' && rawUser.email.trim()
    ? rawUser.email.trim().slice(0, 254)
    : null;

  return {
    id,
    email,
    configuredPlatformAdmin: configuredAdminIds().has(id)
  };
}

export async function loadAccessContext(req, auth, db) {
  const user = await resolveIdentity(req, auth);
  if (!user) {
    return {
      authenticated: false,
      user: null,
      isPlatformAdmin: false,
      isModerator: false,
      memberships: new Map(),
      vendorIds: []
    };
  }

  const [roleRes, memRes] = await Promise.all([
    db.query('SELECT role FROM platform_roles WHERE user_id = $1', [user.id]),
    db.query(
      `SELECT m.vendor_id, m.role, COALESCE(op.display_name, v.canonical_name) AS canonical_name
       FROM vendor_memberships m
       JOIN vendors v ON v.id = m.vendor_id
       LEFT JOIN owner_profiles op ON op.truck_id = v.id
       WHERE m.user_id = $1 AND v.is_active = true
       ORDER BY m.vendor_id ASC`,
      [user.id]
    )
  ]);

  const dbPlatformRole = roleRes.rows[0]?.role || null;
  const isPlatformAdmin = user.configuredPlatformAdmin || dbPlatformRole === 'platform_admin';
  const isModerator = isPlatformAdmin || dbPlatformRole === 'moderator';

  const memberships = new Map();
  for (const row of memRes.rows) {
    memberships.set(row.vendor_id, {
      vendor_id: row.vendor_id,
      role: row.role,
      canonical_name: row.canonical_name
    });
  }

  return {
    authenticated: true,
    user: { id: user.id, email: user.email },
    isPlatformAdmin,
    isModerator,
    memberships,
    vendorIds: Array.from(memberships.keys())
  };
}

export async function authorizeVendorTarget(ctx, requestedVendorId, requiredRole = 'staff', dbClient = null) {
  if (!ctx || !ctx.authenticated) {
    return { ok: false, status: 401, error: 'Sign in is required.' };
  }

  const cleanRequested = typeof requestedVendorId === 'string' ? requestedVendorId.trim() : '';
  if (cleanRequested.length > 80) {
    return { ok: false, status: 400, error: 'Invalid vendor identifier.' };
  }

  if (cleanRequested) {
    if (!ctx.isPlatformAdmin) {
      const mem = ctx.memberships.get(cleanRequested);
      if (!mem) {
        return { ok: false, status: 403, error: 'You do not have permission for this vendor.' };
      }
      if (requiredRole === 'owner' && mem.role !== 'owner') {
        return { ok: false, status: 403, error: 'Vendor owner permission is required for this action.' };
      }
      return {
        ok: true,
        vendorId: mem.vendor_id,
        actorRole: mem.role,
        canonicalName: mem.canonical_name
      };
    }

    if (!dbClient) {
      return { ok: true, vendorId: cleanRequested, actorRole: 'platform_admin', canonicalName: cleanRequested };
    }
    const { rows } = await dbClient.query(
      `SELECT v.id, COALESCE(op.display_name, v.canonical_name) AS canonical_name, v.is_active
       FROM vendors v
       LEFT JOIN owner_profiles op ON op.truck_id = v.id
       WHERE v.id = $1`,
      [cleanRequested]
    );
    if (!rows.length) {
      return { ok: false, status: 400, error: 'Unknown vendor identifier.' };
    }
    return {
      ok: true,
      vendorId: rows[0].id,
      actorRole: 'platform_admin',
      canonicalName: rows[0].canonical_name,
      isActive: rows[0].is_active
    };
  }

  if (ctx.memberships.size === 1) {
    const [mem] = ctx.memberships.values();
    if (requiredRole === 'owner' && mem.role !== 'owner' && !ctx.isPlatformAdmin) {
      return { ok: false, status: 403, error: 'Vendor owner permission is required for this action.' };
    }
    return {
      ok: true,
      vendorId: mem.vendor_id,
      actorRole: ctx.isPlatformAdmin ? 'platform_admin' : mem.role,
      canonicalName: mem.canonical_name
    };
  }

  if (ctx.memberships.size > 1) {
    return { ok: false, status: 400, error: 'Specify vendor/truck_id when managing multiple vendors.' };
  }

  if (ctx.isPlatformAdmin) {
    return { ok: false, status: 400, error: 'Specify vendor/truck_id for platform administrator operations.' };
  }

  return { ok: false, status: 403, error: 'Vendor membership is required.' };
}

export async function authorizeVendorScope(ctx, requestedVendorId, dbClient = null) {
  if (!ctx || !ctx.authenticated) {
    return { ok: false, status: 401, error: 'Sign in is required.' };
  }

  const cleanRequested = typeof requestedVendorId === 'string' ? requestedVendorId.trim() : '';
  if (cleanRequested) {
    const single = await authorizeVendorTarget(ctx, cleanRequested, 'staff', dbClient);
    if (!single.ok) return single;
    return {
      ok: true,
      global: false,
      vendorIds: [single.vendorId],
      actorRole: single.actorRole
    };
  }

  if (ctx.isPlatformAdmin) {
    return { ok: true, global: true, vendorIds: null, actorRole: 'platform_admin' };
  }

  if (ctx.memberships.size > 0) {
    const hasOwner = Array.from(ctx.memberships.values()).some(m => m.role === 'owner');
    return {
      ok: true,
      global: false,
      vendorIds: ctx.vendorIds,
      actorRole: hasOwner ? 'owner' : 'staff'
    };
  }

  return { ok: false, status: 403, error: 'Vendor membership is required.' };
}

export function redactPagerTargetId(pagerUuid) {
  const digest = crypto.createHash('sha256').update(String(pagerUuid || '')).digest('hex').slice(0, 16);
  return `pager_sha256:${digest}`;
}

function sanitizeMetadata(meta) {
  if (!meta || typeof meta !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(meta)) {
    if (FORBIDDEN_AUDIT_KEYS.has(k.toLowerCase())) continue;
    if (v === undefined) continue;
    if (typeof v === 'string' && UUID_RE.test(v) && k.toLowerCase().includes('pager')) continue;
    out[k] = v;
  }
  return out;
}

export async function recordAuditLog(dbClient, { actorId, actorRole, vendorId = null, targetType, targetId, action, metadata = {} }) {
  const safeMeta = sanitizeMetadata(metadata);
  await dbClient.query(
    `INSERT INTO audit_logs (actor_id, actor_role, vendor_id, target_type, target_id, action, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [
      String(actorId),
      String(actorRole),
      vendorId ? String(vendorId) : null,
      String(targetType),
      String(targetId),
      String(action),
      JSON.stringify(safeMeta)
    ]
  );
}
