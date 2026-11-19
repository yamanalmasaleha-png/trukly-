import crypto from 'node:crypto';
import { EnvAliasConflictError, readEnvCompat } from './env-compat.js';

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
  'secret',
  'endpoint',
  'endpoint_url',
  'p256dh',
  'p256dh_key',
  'auth',
  'auth_secret',
  'device_token',
  'unsubscribe_token',
  'session_token',
  'session_id',
  'otp',
  'otp_code',
  'mailbox_secret',
  'cookie'
]);

function configuredAdminIds() {
  if (typeof process === 'undefined' || !process.env) return new Set();
  try {
    const raw = readEnvCompat('PLATFORM_ADMIN_IDS', { securityCritical: true });
    return new Set(
      raw
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
    );
  } catch (err) {
    if (err instanceof EnvAliasConflictError) {
      // Fail closed: grant zero env-bootstrapped admin IDs when BITESHARK_* and TRUCKLY_* conflict.
      return new Set();
    }
    throw err;
  }
}

export function applyPrivateNoStoreHeaders(res) {
  if (typeof res?.setHeader !== 'function') return;
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Vary', 'Cookie, Origin');
}

export const VALID_WRITE_PAUSE_SCOPES = Object.freeze([
  'bookings',
  'pagers',
  'community',
  'owner',
  'notifications',
  'all'
]);

const VALID_WRITE_PAUSE_SET = new Set(VALID_WRITE_PAUSE_SCOPES);

export function inspectWritePauseConfig() {
  if (typeof process === 'undefined' || !process.env) {
    return { active: false, valid: true, failClosedAll: false, scopes: [], invalidScopes: [] };
  }
  let raw = '';
  try {
    raw = readEnvCompat('PAUSE_WRITES', { securityCritical: true });
  } catch (err) {
    if (err instanceof EnvAliasConflictError) {
      return {
        active: true,
        valid: false,
        failClosedAll: true,
        scopes: [],
        invalidScopes: ['ENV_ALIAS_CONFLICT']
      };
    }
    throw err;
  }
  if (!raw.trim()) {
    return { active: false, valid: true, failClosedAll: false, scopes: [], invalidScopes: [] };
  }
  const parts = raw.split(',').map(s => s.trim().toLowerCase());
  const scopes = [];
  const invalidScopes = [];
  for (const token of parts) {
    if (!token) {
      invalidScopes.push('<empty>');
    } else if (!VALID_WRITE_PAUSE_SET.has(token)) {
      invalidScopes.push(token);
    } else if (!scopes.includes(token)) {
      scopes.push(token);
    }
  }
  const valid = invalidScopes.length === 0 && scopes.length > 0;
  return {
    active: true,
    valid,
    failClosedAll: !valid || scopes.includes('all'),
    scopes,
    invalidScopes
  };
}

/**
 * Security-preserving operational write kill-switch (`TRUCKLY_PAUSE_WRITES`).
 * Allows temporarily pausing specific write scopes (`bookings`, `pagers`, `community`, `owner`, `notifications`, or `all`)
 * during an incident without relaxing RLS, triggers, constraints, or RBAC.
 * Fails closed (pausing all hardened write scopes) if set to an unrecognized scope token.
 */
export function isWritePaused(scope) {
  const cfg = inspectWritePauseConfig();
  if (!cfg.active) return false;
  if (cfg.failClosedAll) return true;
  return cfg.scopes.includes(String(scope || '').toLowerCase());
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
    configuredPlatformAdmin: user.configuredPlatformAdmin,
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

/**
 * Re-verifies vendor membership or platform_admin privilege inside an active write transaction
 * using `FOR SHARE` (or `FOR NO KEY UPDATE` on `vendors` when requested by booking-eligibility writers)
 * so concurrent role downgrades, membership deletions, or vendor deactivations (`FOR NO KEY UPDATE` /
 * `FOR UPDATE`) conflict-serialize through transaction commit.
 */
export async function reverifyVendorMembershipInTx(
  tx,
  ctx,
  vendorId,
  requiredRole = 'staff',
  options = {}
) {
  if (!ctx || !ctx.authenticated || !ctx.user?.id) {
    return { ok: false, status: 401, error: 'Sign in is required.' };
  }

  const vendorLockSql = options?.vendorLockMode === 'NO KEY UPDATE' ? 'NO KEY UPDATE' : 'SHARE';
  const allowInactiveForAdmin = Boolean(options?.allowInactiveForAdmin);

  const isConfigAdmin = Boolean(ctx.configuredPlatformAdmin || configuredAdminIds().has(ctx.user.id));
  let isDbAdmin = false;
  if (!isConfigAdmin) {
    const roleRes = await tx.query(
      'SELECT role FROM platform_roles WHERE user_id = $1 FOR SHARE',
      [ctx.user.id]
    );
    isDbAdmin = roleRes.rows[0]?.role === 'platform_admin';
  }

  if (isConfigAdmin || isDbAdmin) {
    if (!vendorId) {
      return { ok: true, vendorId: null, actorRole: 'platform_admin' };
    }
    const vRes = await tx.query(
      `SELECT id, is_active FROM vendors WHERE id = $1 FOR ${vendorLockSql}`,
      [vendorId]
    );
    if (!vRes.rows.length) {
      return { ok: false, status: 400, error: 'Unknown vendor identifier.' };
    }
    if (!vRes.rows[0].is_active && !allowInactiveForAdmin) {
      return { ok: false, status: 403, error: 'Selected vendor is inactive.' };
    }
    return {
      ok: true,
      vendorId: vRes.rows[0].id,
      actorRole: 'platform_admin',
      isActive: vRes.rows[0].is_active
    };
  }

  if (!vendorId) {
    return { ok: false, status: 403, error: 'You do not have permission for this vendor.' };
  }

  const lockClause =
    vendorLockSql === 'NO KEY UPDATE'
      ? 'FOR SHARE OF m FOR NO KEY UPDATE OF v'
      : 'FOR SHARE OF m, v';

  const memRes = await tx.query(
    `SELECT m.vendor_id, m.role
     FROM vendor_memberships m
     JOIN vendors v ON v.id = m.vendor_id
     WHERE m.user_id = $1 AND m.vendor_id = $2 AND v.is_active = true
     ${lockClause}`,
    [ctx.user.id, vendorId]
  );

  if (!memRes.rows.length) {
    return { ok: false, status: 403, error: 'You do not have permission for this vendor.' };
  }
  const role = memRes.rows[0].role;
  if (requiredRole === 'owner' && role !== 'owner') {
    return { ok: false, status: 403, error: 'Vendor owner permission is required for this action.' };
  }

  return {
    ok: true,
    vendorId,
    actorRole: role,
    isActive: true
  };
}

/**
 * Re-verifies moderator or platform_admin privilege inside an active write transaction using `FOR SHARE`
 * so concurrent `UPDATE platform_roles` downgrades or `DELETE` revocations serialize through commit.
 */
export async function reverifyModeratorInTx(tx, ctx) {
  if (!ctx || !ctx.authenticated || !ctx.user?.id) {
    return { ok: false, status: 401, error: 'Sign in is required.' };
  }
  if (ctx.configuredPlatformAdmin || configuredAdminIds().has(ctx.user.id)) {
    return { ok: true, actorRole: 'platform_admin' };
  }
  const roleRes = await tx.query(
    'SELECT role FROM platform_roles WHERE user_id = $1 FOR SHARE',
    [ctx.user.id]
  );
  const role = roleRes.rows[0]?.role || null;
  if (role === 'platform_admin' || role === 'moderator') {
    return { ok: true, actorRole: role };
  }
  return { ok: false, status: 403, error: 'Moderator or platform administrator access is required.' };
}

/**
 * Re-verifies platform_admin privilege inside an active transaction using `FOR SHARE`.
 */
export async function reverifyPlatformAdminInTx(tx, ctx) {
  if (!ctx || !ctx.authenticated || !ctx.user?.id) {
    return { ok: false, status: 401, error: 'Sign in is required.' };
  }
  if (ctx.configuredPlatformAdmin || configuredAdminIds().has(ctx.user.id)) {
    return { ok: true, actorRole: 'platform_admin' };
  }
  const roleRes = await tx.query(
    'SELECT role FROM platform_roles WHERE user_id = $1 FOR SHARE',
    [ctx.user.id]
  );
  if (roleRes.rows[0]?.role === 'platform_admin') {
    return { ok: true, actorRole: 'platform_admin' };
  }
  return { ok: false, status: 403, error: 'Platform administrator access is required.' };
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
    if (typeof v === 'string' && /^https?:\/\//i.test(v) && k.toLowerCase().includes('endpoint')) continue;
    out[k] = v;
  }
  return out;
}

export async function recordAuditLog(
  dbClient,
  { actorId, actorRole, vendorId = null, targetType, targetId, action, metadata = {} }
) {
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
