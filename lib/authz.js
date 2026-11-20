import crypto from 'node:crypto';
import { getActiveGovernanceContext } from './request-context.js';
import { EnvAliasConflictError, readEnvCompat } from './env-compat.js';

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ROLE_LABELS = Object.freeze({
  customer: 'Customer',
  owner: 'Vendor Owner',
  staff: 'Vendor Staff',
  mod: 'Admin: Mod',
  top: 'Admin: Top'
});

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
  'cookie',
  'invite_token',
  'raw_token',
  'file_bytes',
  'file_base64',
  'dob',
  'date_of_birth',
  'birth_date',
  'dob_year',
  'dob_month',
  'dob_day',
  'confidential_counsel_notes'
]);

export function normalizeAdminLevel(rawRole) {
  const r = typeof rawRole === 'string' ? rawRole.trim().toLowerCase() : '';
  if (r === 'top' || r === 'platform_admin') return 'top';
  if (r === 'mod' || r === 'moderator') return 'mod';
  return null;
}

export function isTempRestrictionActive(vendorRow, nowMs = Date.now()) {
  if (!vendorRow) return false;
  if (vendorRow.restriction_authority === 'mod' && vendorRow.temp_restriction_expires_at) {
    const expMs = new Date(vendorRow.temp_restriction_expires_at).getTime();
    if (Number.isFinite(expMs) && expMs <= nowMs) {
      return false;
    }
  }
  return true;
}

export function evaluateEffectiveVendorRestrictions(vendorRow, nowMs = Date.now()) {
  if (!vendorRow) {
    return {
      hidden_from_discovery: false,
      bookings_restricted: false,
      vendor_access_suspended: false,
      pager_restricted: false,
      needs_info_correction: false,
      correction_note: null,
      restriction_reason: null
    };
  }
  const activeWindow = isTempRestrictionActive(vendorRow, nowMs);
  return {
    hidden_from_discovery: activeWindow ? vendorRow.hidden_from_discovery === true : false,
    bookings_restricted: activeWindow ? vendorRow.bookings_restricted === true : false,
    vendor_access_suspended: activeWindow ? vendorRow.vendor_access_suspended === true : false,
    pager_restricted: activeWindow ? vendorRow.pager_restricted === true : false,
    needs_info_correction: vendorRow.needs_info_correction === true,
    correction_note: vendorRow.correction_note || null,
    restriction_reason: activeWindow ? vendorRow.restriction_reason || null : null
  };
}

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

export function isWritePaused(scope) {
  const cfg = inspectWritePauseConfig();
  if (!cfg.active) return false;
  if (cfg.failClosedAll) return true;
  return cfg.scopes.includes(String(scope || '').toLowerCase());
}

export async function resolveIdentity(req, auth) {
  let rawUser = null;
  if (req && req.user && typeof req.user === 'object') {
    rawUser = req.user;
  } else if (auth && typeof auth.getUser === 'function') {
    rawUser = await auth.getUser(req);
  }

  if (rawUser && typeof rawUser.id !== 'string' && rawUser.data && typeof rawUser.data.user === 'object') {
    rawUser = rawUser.data.user;
  }

  if (!rawUser || typeof rawUser.id !== 'string') return null;
  const id = rawUser.id.trim();
  if (!id || id.length > 128) return null;

  const email =
    typeof rawUser.email === 'string' && rawUser.email.trim()
      ? rawUser.email.trim().slice(0, 254)
      : null;

  return {
    id,
    email,
    configuredPlatformAdmin: configuredAdminIds().has(id)
  };
}

async function queryRoleAndRevocation(dbClient, userId, lockClause = '') {
  const roleRes = await dbClient.query(
    `SELECT role FROM platform_roles WHERE user_id = $1 ${lockClause}`,
    [userId]
  );
  let isRevoked = false;
  if (configuredAdminIds().has(userId)) {
    try {
      const revRes = await dbClient.query(
        `SELECT 1 FROM platform_role_revocations WHERE user_id = $1 ${lockClause}`,
        [userId]
      );
      isRevoked = revRes.rows.length > 0;
    } catch (err) {
      // Graceful fallback on pre-018 historical schemas tested in Tier-2 rollback suites
      if (err?.code !== '42P01') throw err;
    }
  }
  return {
    dbRole: roleRes.rows[0]?.role || null,
    isRevoked
  };
}

async function queryUserVendorMemberships(dbClient, userId) {
  try {
    const { rows } = await dbClient.query(
      `SELECT
         m.vendor_id,
         m.role,
         COALESCE(op.display_name, v.canonical_name) AS canonical_name,
         v.ownership_status,
         v.hidden_from_discovery,
         v.bookings_restricted,
         v.vendor_access_suspended,
         v.pager_restricted,
         v.needs_info_correction,
         v.correction_note,
         v.restriction_reason,
         v.restriction_authority,
         v.temp_restriction_expires_at
       FROM vendor_memberships m
       JOIN vendors v ON v.id = m.vendor_id
       LEFT JOIN owner_profiles op ON op.truck_id = v.id
       WHERE m.user_id = $1 AND v.is_active = true
       ORDER BY m.vendor_id ASC`,
      [userId]
    );
    return rows;
  } catch (err) {
    if (err?.code !== '42703') throw err;
    const { rows } = await dbClient.query(
      `SELECT m.vendor_id, m.role, COALESCE(op.display_name, v.canonical_name) AS canonical_name
       FROM vendor_memberships m
       JOIN vendors v ON v.id = m.vendor_id
       LEFT JOIN owner_profiles op ON op.truck_id = v.id
       WHERE m.user_id = $1 AND v.is_active = true
       ORDER BY m.vendor_id ASC`,
      [userId]
    );
    return rows;
  }
}

export async function loadAccessContext(req, auth, db) {
  const user = await resolveIdentity(req, auth);
  if (!user) {
    return {
      authenticated: false,
      user: null,
      adminLevel: null,
      adminLabel: null,
      isTopAdmin: false,
      isModAdmin: false,
      isPlatformAdmin: false,
      isModerator: false,
      roleLabels: [],
      memberships: new Map(),
      vendorIds: []
    };
  }

  const [{ dbRole, isRevoked }, memRows] = await Promise.all([
    queryRoleAndRevocation(db, user.id),
    queryUserVendorMemberships(db, user.id)
  ]);

  const dbAdminLevel = normalizeAdminLevel(dbRole);
  const effectiveConfigAdmin = Boolean(user.configuredPlatformAdmin && !isRevoked);
  const adminLevel = dbAdminLevel === 'top' || effectiveConfigAdmin ? 'top' : dbAdminLevel === 'mod' ? 'mod' : null;
  const isTopAdmin = adminLevel === 'top';
  const isModAdmin = adminLevel === 'top' || adminLevel === 'mod';

  const nowMs = Date.now();
  const memberships = new Map();
  let hasOwner = false;
  let hasStaff = false;
  for (const row of memRows) {
    const restrictions = evaluateEffectiveVendorRestrictions(row, nowMs);
    if (row.role === 'owner') hasOwner = true;
    if (row.role === 'staff') hasStaff = true;
    memberships.set(row.vendor_id, {
      vendor_id: row.vendor_id,
      role: row.role,
      role_label: row.role === 'owner' ? ROLE_LABELS.owner : ROLE_LABELS.staff,
      canonical_name: row.canonical_name,
      ownership_status: row.ownership_status || 'approved_owner',
      restrictions
    });
  }

  // Every signed-in identity retains Customer permissions alongside any Vendor or Admin roles
  const roleLabels = [ROLE_LABELS.customer];
  if (hasOwner) roleLabels.push(ROLE_LABELS.owner);
  if (hasStaff) roleLabels.push(ROLE_LABELS.staff);
  if (adminLevel === 'mod') roleLabels.push(ROLE_LABELS.mod);
  if (adminLevel === 'top') roleLabels.push(ROLE_LABELS.top);

  return {
    authenticated: true,
    user: { id: user.id, email: user.email },
    configuredPlatformAdmin: effectiveConfigAdmin,
    adminLevel,
    adminLabel: adminLevel ? ROLE_LABELS[adminLevel] : null,
    isTopAdmin,
    isModAdmin,
    isPlatformAdmin: isTopAdmin,
    isModerator: isModAdmin,
    roleLabels,
    memberships,
    vendorIds: Array.from(memberships.keys())
  };
}

function checkStandaloneHttpActOnBehalfRequirement(targetVendorId) {
  const reqCtx = getActiveGovernanceContext();
  if (!reqCtx || !reqCtx.isStandaloneHttpMutation) {
    return { ok: true };
  }
  const act = reqCtx.actOnBehalf;
  if (!act || act.vendorId !== targetVendorId || typeof act.reason !== 'string' || act.reason.length < 8) {
    return {
      ok: false,
      status: 403,
      code: 'ACT_ON_BEHALF_REQUIRED',
      error:
        'Admin preview is read-only. Enable explicit Act-on-Behalf mode with a support reason (at least 8 characters) to perform operational actions for this vendor.'
    };
  }
  return { ok: true, actOnBehalf: act };
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
    const directMem = ctx.memberships.get(cleanRequested);
    if (!ctx.isPlatformAdmin) {
      if (!directMem) {
        return { ok: false, status: 403, error: 'You do not have permission for this vendor.' };
      }
      if (directMem.restrictions?.vendor_access_suspended) {
        return {
          ok: false,
          status: 403,
          code: 'VENDOR_ACCESS_SUSPENDED',
          error: 'Vendor operational access is currently suspended. Contact BiteShark support for assistance.'
        };
      }
      if (requiredRole === 'owner' && directMem.role !== 'owner') {
        return { ok: false, status: 403, error: 'Vendor owner permission is required for this action.' };
      }
      return {
        ok: true,
        vendorId: directMem.vendor_id,
        actorRole: directMem.role,
        canonicalName: directMem.canonical_name
      };
    }

    // Platform Admin (`Admin: Top`): if not a direct owner/staff member of this vendor,
    // HTTP mutations require explicit Act-on-Behalf mode + support reason!
    if (!directMem) {
      const aobCheck = checkStandaloneHttpActOnBehalfRequirement(cleanRequested);
      if (!aobCheck.ok) return aobCheck;
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
    if (!ctx.isPlatformAdmin && mem.restrictions?.vendor_access_suspended) {
      return {
        ok: false,
        status: 403,
        code: 'VENDOR_ACCESS_SUSPENDED',
        error: 'Vendor operational access is currently suspended. Contact BiteShark support for assistance.'
      };
    }
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

  const { dbRole, isRevoked } = await queryRoleAndRevocation(tx, ctx.user.id, 'FOR SHARE');
  const rawConfigAdmin = Boolean(ctx.configuredPlatformAdmin || configuredAdminIds().has(ctx.user.id));
  const isTopAdmin = normalizeAdminLevel(dbRole) === 'top' || (rawConfigAdmin && !isRevoked);

  if (isTopAdmin) {
    if (!vendorId) {
      return { ok: true, vendorId: null, actorRole: 'platform_admin' };
    }
    // Check if caller also has direct vendor membership; if not, HTTP mutations require Act-on-Behalf
    if (!ctx.memberships?.has(vendorId)) {
      const aobCheck = checkStandaloneHttpActOnBehalfRequirement(vendorId);
      if (!aobCheck.ok) return aobCheck;
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

  let memRow = null;
  try {
    const memRes = await tx.query(
      `SELECT m.vendor_id, m.role, v.vendor_access_suspended, v.restriction_authority, v.temp_restriction_expires_at
       FROM vendor_memberships m
       JOIN vendors v ON v.id = m.vendor_id
       WHERE m.user_id = $1 AND m.vendor_id = $2 AND v.is_active = true
       ${lockClause}`,
      [ctx.user.id, vendorId]
    );
    memRow = memRes.rows[0] || null;
  } catch (err) {
    if (err?.code !== '42703') throw err;
    const memRes = await tx.query(
      `SELECT m.vendor_id, m.role
       FROM vendor_memberships m
       JOIN vendors v ON v.id = m.vendor_id
       WHERE m.user_id = $1 AND m.vendor_id = $2 AND v.is_active = true
       ${lockClause}`,
      [ctx.user.id, vendorId]
    );
    memRow = memRes.rows[0] || null;
  }

  if (!memRow) {
    return { ok: false, status: 403, error: 'You do not have permission for this vendor.' };
  }
  const effRestr = evaluateEffectiveVendorRestrictions(memRow);
  if (effRestr.vendor_access_suspended) {
    return {
      ok: false,
      status: 403,
      code: 'VENDOR_ACCESS_SUSPENDED',
      error: 'Vendor operational access is currently suspended. Contact BiteShark support for assistance.'
    };
  }
  if (requiredRole === 'owner' && memRow.role !== 'owner') {
    return { ok: false, status: 403, error: 'Vendor owner permission is required for this action.' };
  }

  return {
    ok: true,
    vendorId,
    actorRole: memRow.role,
    isActive: true
  };
}

export async function reverifyModeratorInTx(tx, ctx) {
  if (!ctx || !ctx.authenticated || !ctx.user?.id) {
    return { ok: false, status: 401, error: 'Sign in is required.' };
  }
  const { dbRole, isRevoked } = await queryRoleAndRevocation(tx, ctx.user.id, 'FOR SHARE');
  const rawConfigAdmin = Boolean(ctx.configuredPlatformAdmin || configuredAdminIds().has(ctx.user.id));
  const level = normalizeAdminLevel(dbRole) || (rawConfigAdmin && !isRevoked ? 'top' : null);
  if (level === 'top') {
    return { ok: true, actorRole: 'top', legacyRole: 'platform_admin' };
  }
  if (level === 'mod') {
    return { ok: true, actorRole: 'mod', legacyRole: 'moderator' };
  }
  return { ok: false, status: 403, error: 'Moderator or platform administrator access is required.' };
}

export async function reverifyPlatformAdminInTx(tx, ctx) {
  if (!ctx || !ctx.authenticated || !ctx.user?.id) {
    return { ok: false, status: 401, error: 'Sign in is required.' };
  }
  const { dbRole, isRevoked } = await queryRoleAndRevocation(tx, ctx.user.id, 'FOR SHARE');
  const rawConfigAdmin = Boolean(ctx.configuredPlatformAdmin || configuredAdminIds().has(ctx.user.id));
  if (normalizeAdminLevel(dbRole) === 'top' || (rawConfigAdmin && !isRevoked)) {
    return { ok: true, actorRole: 'top', legacyRole: 'platform_admin' };
  }
  return { ok: false, status: 403, error: 'Admin: Top access is required.' };
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
    const activeVids = [];
    let hasOwner = false;
    for (const m of ctx.memberships.values()) {
      if (!m.restrictions?.vendor_access_suspended) {
        activeVids.push(m.vendor_id);
        if (m.role === 'owner') hasOwner = true;
      }
    }
    if (!activeVids.length) {
      return {
        ok: false,
        status: 403,
        code: 'VENDOR_ACCESS_SUSPENDED',
        error: 'Vendor operational access is currently suspended.'
      };
    }
    return {
      ok: true,
      global: false,
      vendorIds: activeVids,
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
  const reqCtx = getActiveGovernanceContext();
  if (reqCtx && reqCtx.actOnBehalf) {
    safeMeta.acting_on_behalf = true;
    safeMeta.effective_vendor_id = reqCtx.actOnBehalf.vendorId;
    safeMeta.support_reason = reqCtx.actOnBehalf.reason;
  }
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
