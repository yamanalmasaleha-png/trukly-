// Platform-Admin Isolated Testing Customer Sandbox (`lib/admin-test-customer.js`)
//
// Security & Privacy Invariants:
//   1. Strictly restricted to verified platform administrators (`Admin: Top` and `Admin: Mod` via
//      `reverifyModeratorInTx`) across all BiteShark Admin consoles (unless explicitly disabled via
//      `BITESHARK_ENABLE_ADMIN_TEST_CUSTOMER=false`).
//   2. Uses a single synthetic sandbox identity (`usr_sa_top_admin_test_customer` /
//      `test-customer@sandbox.biteshark.invalid`) — NEVER impersonates or touches any real customer account.
//   3. Enforces zero `platform_roles` and zero `vendor_memberships` on the sandbox user.
//   4. Uses a real `auth_sessions` row paired with a separate `HttpOnly; Secure; SameSite=Lax`
//      overlay cookie (`__Host-bs_admin_test_session`) that is honored ONLY while the browser's
//      underlying `__Host-truckly_session` remains an active, non-revoked platform admin session.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCookie, serialize as serializeCookie } from 'cookie';
import { withTransaction } from './db-tx.js';
import { reverifyModeratorInTx, recordAuditLog } from './authz.js';
import { EnvAliasConflictError, readEnvCompat } from './env-compat.js';
import { AGE_POLICY_VERSION } from './age-policy.js';
import { resolveTrustedClientIp } from './client-ip.js';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_DIR, '..');

export const ADMIN_TEST_CUSTOMER_USER_ID = 'usr_sa_top_admin_test_customer';
export const ADMIN_TEST_CUSTOMER_EMAIL = 'test-customer@sandbox.biteshark.invalid';
export const ADMIN_TEST_CUSTOMER_COOKIE_NAME = '__Host-bs_admin_test_session';
export const ADMIN_TEST_CUSTOMER_TTL_SECONDS = 4 * 60 * 60; // 4 hours

function sha256Hex(input) {
  return crypto.createHash('sha256').update(String(input)).digest('hex');
}

export function hasCustomerProfileSurface() {
  return fs.existsSync(path.join(REPO_ROOT, 'public', 'profile.html'));
}

export function isAdminTestCustomerAllowed() {
  try {
    const rawToggle = String(
      readEnvCompat('ENABLE_ADMIN_TEST_CUSTOMER', { defaultValue: 'true' })
    )
      .trim()
      .toLowerCase();
    return rawToggle !== 'false' && rawToggle !== '0' && rawToggle !== 'disabled' && rawToggle !== 'off';
  } catch (err) {
    if (err instanceof EnvAliasConflictError) return false;
    return false;
  }
}

async function loadOptionalProfileModule() {
  if (!fs.existsSync(path.join(MODULE_DIR, 'customer-profile.js'))) return null;
  try {
    return await import('./customer-profile.js');
  } catch {
    return null;
  }
}

async function loadOptionalExplorationModule() {
  if (!fs.existsSync(path.join(MODULE_DIR, 'customer-exploration.js'))) return null;
  try {
    return await import('./customer-exploration.js');
  } catch {
    return null;
  }
}

export function buildAdminTestCustomerCookieHeader(
  rawToken,
  maxAgeSeconds = ADMIN_TEST_CUSTOMER_TTL_SECONDS
) {
  return serializeCookie(ADMIN_TEST_CUSTOMER_COOKIE_NAME, rawToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: Math.max(0, Math.floor(maxAgeSeconds))
  });
}

export function buildClearedAdminTestCustomerCookieHeader() {
  return serializeCookie(ADMIN_TEST_CUSTOMER_COOKIE_NAME, '', {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
    expires: new Date(0)
  });
}

export function extractRawAdminTestCustomerToken(req) {
  const cookieHeader = String(req?.headers?.cookie || req?.headers?.Cookie || '');
  if (!cookieHeader) return null;
  const parsed = parseCookie(cookieHeader);
  const val = parsed[ADMIN_TEST_CUSTOMER_COOKIE_NAME];
  if (typeof val !== 'string') return null;
  const clean = val.trim();
  if (clean.length < 24 || clean.length > 256 || !/^[A-Za-z0-9_-]+$/.test(clean)) {
    return null;
  }
  return clean;
}

export async function ensureAdminTestCustomerAccountInTx(tx, nowIso = new Date().toISOString()) {
  await tx.query("SELECT set_config('app.auth_internal', 'true', true)");
  await tx.query(
    `INSERT INTO auth_users (
       id, email_normalized, last_login_at, created_at, updated_at, disabled_at,
       age_eligibility_status, age_policy_version, age_assessed_at, age_assessment_basis
     )
     VALUES ($1, $2, $3, $3, $3, NULL, 'eligible_14_plus', $4, $3, 'self_reported_dob_at_signup')
     ON CONFLICT (id) DO UPDATE
       SET email_normalized = EXCLUDED.email_normalized,
           disabled_at = NULL,
           age_eligibility_status = 'eligible_14_plus',
           age_policy_version = EXCLUDED.age_policy_version,
           updated_at = EXCLUDED.updated_at`,
    [ADMIN_TEST_CUSTOMER_USER_ID, ADMIN_TEST_CUSTOMER_EMAIL, nowIso, AGE_POLICY_VERSION]
  );

  // Hard isolation invariant: sandbox test customer must NEVER hold admin or vendor privileges
  await tx.query('DELETE FROM platform_roles WHERE user_id = $1', [ADMIN_TEST_CUSTOMER_USER_ID]);
  await tx.query('DELETE FROM vendor_memberships WHERE user_id = $1', [ADMIN_TEST_CUSTOMER_USER_ID]);
}

async function collectSandboxCustomerCountsInTx(tx) {
  await tx.query(
    `SELECT
       set_config('app.user_id', $1, true),
       set_config('app.auth_internal', 'true', true)`,
    [ADMIN_TEST_CUSTOMER_USER_ID]
  );

  const queryCountSafe = async (sql, params = [ADMIN_TEST_CUSTOMER_USER_ID], spName = 'sp_cnt') => {
    await tx.query(`SAVEPOINT ${spName}`);
    try {
      const r = await tx.query(sql, params);
      await tx.query(`RELEASE SAVEPOINT ${spName}`);
      return Number(r.rows[0]?.c || 0);
    } catch {
      await tx.query(`ROLLBACK TO SAVEPOINT ${spName}`).catch(() => {});
      return 0;
    }
  };

  const visits = await queryCountSafe(
    'SELECT count(*)::int AS c FROM customer_visits WHERE user_id = $1 AND deleted_at IS NULL',
    [ADMIN_TEST_CUSTOMER_USER_ID],
    'sp_tc_vis'
  );
  const photos = await queryCountSafe(
    'SELECT count(*)::int AS c FROM customer_photos WHERE user_id = $1 AND deleted_at IS NULL',
    [ADMIN_TEST_CUSTOMER_USER_ID],
    'sp_tc_pho'
  );
  const savedTrails = await queryCountSafe(
    'SELECT count(*)::int AS c FROM customer_saved_trails WHERE user_id = $1 AND deleted_at IS NULL',
    [ADMIN_TEST_CUSTOMER_USER_ID],
    'sp_tc_trl'
  );
  const favorites = await queryCountSafe(
    'SELECT count(*)::int AS c FROM favorites WHERE user_id = $1',
    [ADMIN_TEST_CUSTOMER_USER_ID],
    'sp_tc_fav'
  );
  const collections = await queryCountSafe(
    'SELECT count(*)::int AS c FROM customer_collections WHERE user_id = $1 AND deleted_at IS NULL',
    [ADMIN_TEST_CUSTOMER_USER_ID],
    'sp_tc_col'
  );
  const activeShares = await queryCountSafe(
    `SELECT count(*)::int AS c
     FROM customer_collection_shares
     WHERE user_id = $1 AND status = 'active' AND (expires_at IS NULL OR expires_at > now())`,
    [ADMIN_TEST_CUSTOMER_USER_ID],
    'sp_tc_shr'
  );

  return {
    visits,
    photos,
    saved_trails: savedTrails,
    favorites,
    collections,
    active_shares: activeShares
  };
}

export async function inspectAdminTestCustomerStatus(dbAdapter, req, ctx, { now = new Date() } = {}) {
  if (!isAdminTestCustomerAllowed()) {
    return {
      ok: false,
      status: 403,
      code: 'TEST_CUSTOMER_DISABLED_IN_ENV',
      error: 'Testing customer sandbox is disabled by BITESHARK_ENABLE_ADMIN_TEST_CUSTOMER.'
    };
  }

  const rawOverlay = extractRawAdminTestCustomerToken(req);
  const nowIso = now.toISOString();

  return withTransaction(dbAdapter, async tx => {
    const rev = await reverifyModeratorInTx(tx, ctx);
    if (!rev.ok) {
      return { ok: false, status: rev.status, error: rev.error };
    }

    await ensureAdminTestCustomerAccountInTx(tx, nowIso);
    let activeInBrowser = false;
    let expiresAt = null;
    if (rawOverlay) {
      const overlayHash = sha256Hex(rawOverlay);
      const sessRes = await tx.query(
        `SELECT expires_at
         FROM auth_sessions
         WHERE token_sha256 = $1
           AND user_id = $2
           AND revoked_at IS NULL
           AND expires_at > $3
         LIMIT 1`,
        [overlayHash, ADMIN_TEST_CUSTOMER_USER_ID, nowIso]
      );
      if (sessRes.rows[0]) {
        activeInBrowser = true;
        expiresAt = sessRes.rows[0].expires_at;
      }
    }

    const counts = await collectSandboxCustomerCountsInTx(tx);
    return {
      ok: true,
      status: 200,
      body: {
        ok: true,
        available: true,
        has_profile_page: hasCustomerProfileSurface(),
        active_in_browser: activeInBrowser,
        expires_at: expiresAt,
        test_user: {
          id: ADMIN_TEST_CUSTOMER_USER_ID,
          email: ADMIN_TEST_CUSTOMER_EMAIL
        },
        counts
      }
    };
  });
}

export async function enterAdminTestCustomerSession(
  dbAdapter,
  req,
  ctx,
  { seedSample = false, now = new Date() } = {}
) {
  if (!isAdminTestCustomerAllowed()) {
    return {
      ok: false,
      status: 403,
      code: 'TEST_CUSTOMER_DISABLED_IN_ENV',
      error: 'Testing customer sandbox is disabled by BITESHARK_ENABLE_ADMIN_TEST_CUSTOMER.'
    };
  }

  const nowMs = now.getTime();
  const nowIso = now.toISOString();
  const clientIp = resolveTrustedClientIp(req) || '127.0.0.1';
  const ipHash = sha256Hex(`tc_ip:${clientIp}`);
  const uaHash = sha256Hex(`tc_ua:${String(req?.headers?.['user-agent'] || '').slice(0, 256)}`);

  const txOut = await withTransaction(dbAdapter, async tx => {
    const rev = await reverifyModeratorInTx(tx, ctx);
    if (!rev.ok) {
      return { ok: false, status: rev.status, error: rev.error };
    }

    await ensureAdminTestCustomerAccountInTx(tx, nowIso);

    // Revoke any prior overlay cookie presented by this browser
    const priorOverlay = extractRawAdminTestCustomerToken(req);
    if (priorOverlay) {
      await tx.query(
        'UPDATE auth_sessions SET revoked_at = $2 WHERE token_sha256 = $1 AND revoked_at IS NULL',
        [sha256Hex(priorOverlay), nowIso]
      );
    }

    // Bound concurrent sandbox sessions to <= 5
    await tx.query(
      `UPDATE auth_sessions
       SET revoked_at = $2
       WHERE id IN (
         SELECT id FROM auth_sessions
         WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > $2
         ORDER BY created_at DESC
         OFFSET 4
       )`,
      [ADMIN_TEST_CUSTOMER_USER_ID, nowIso]
    );

    const rawToken = crypto.randomBytes(32).toString('base64url');
    const tokenSha256 = sha256Hex(rawToken);
    const expiresAtIso = new Date(nowMs + ADMIN_TEST_CUSTOMER_TTL_SECONDS * 1000).toISOString();

    await tx.query(
      `INSERT INTO auth_sessions
         (token_sha256, user_id, ip_hash, ua_hash, created_at, last_seen_at, expires_at, max_expires_at)
       VALUES ($1, $2, $3, $4, $5, $5, $6, $6)`,
      [tokenSha256, ADMIN_TEST_CUSTOMER_USER_ID, ipHash, uaHash, nowIso, expiresAtIso]
    );

    await recordAuditLog(tx, {
      actorId: ctx.user.id,
      actorRole: rev.actorRole,
      targetType: 'user',
      targetId: ADMIN_TEST_CUSTOMER_USER_ID,
      action: 'test_customer_session_entered',
      metadata: {
        sandbox_user_id: ADMIN_TEST_CUSTOMER_USER_ID,
        seed_sample_requested: Boolean(seedSample)
      }
    });

    return {
      ok: true,
      rawToken,
      expiresAtIso
    };
  });

  if (!txOut.ok) return txOut;

  if (seedSample) {
    await seedAdminTestCustomerSampleData(dbAdapter, ctx, { now });
  }

  const statusCheck = await inspectAdminTestCustomerStatus(dbAdapter, req, ctx, { now });
  return {
    ok: true,
    status: 200,
    setCookieHeader: buildAdminTestCustomerCookieHeader(txOut.rawToken, ADMIN_TEST_CUSTOMER_TTL_SECONDS),
    body: {
      ok: true,
      has_profile_page: hasCustomerProfileSurface(),
      active_in_browser: true,
      expires_at: txOut.expiresAtIso,
      test_user: {
        id: ADMIN_TEST_CUSTOMER_USER_ID,
        email: ADMIN_TEST_CUSTOMER_EMAIL
      },
      counts: statusCheck.body?.counts || null
    }
  };
}

export async function seedAdminTestCustomerSampleData(dbAdapter, ctx, { now = new Date() } = {}) {
  if (!isAdminTestCustomerAllowed()) {
    return {
      ok: false,
      status: 403,
      code: 'TEST_CUSTOMER_DISABLED_IN_ENV',
      error: 'Testing customer sandbox is disabled by BITESHARK_ENABLE_ADMIN_TEST_CUSTOMER.'
    };
  }

  const nowIso = now.toISOString();
  const authCheck = await withTransaction(dbAdapter, async tx => {
    const rev = await reverifyModeratorInTx(tx, ctx);
    if (!rev.ok) return { ok: false, status: rev.status, error: rev.error };
    await ensureAdminTestCustomerAccountInTx(tx, nowIso);
    return { ok: true, actorRole: rev.actorRole };
  });
  if (!authCheck.ok) return authCheck;

  const [profileMod, explorationMod] = await Promise.all([
    loadOptionalProfileModule(),
    loadOptionalExplorationModule()
  ]);

  if (profileMod) {
    await profileMod.updatePrivateOwnerProfile(dbAdapter, {
      userId: ADMIN_TEST_CUSTOMER_USER_ID,
      body: {
        display_name: 'Admin Test Customer',
        bio: 'Sandbox Sonoma County food explorer for Admin QA & debugging.',
        avatar_style: 'shark_emblem',
        preferred_town: 'Santa Rosa'
      },
      now
    });

    await profileMod.updateCustomerPreferences(dbAdapter, {
      userId: ADMIN_TEST_CUSTOMER_USER_ID,
      body: {
        preferred_town: 'Santa Rosa',
        food_interests: ['tacos_mexican', 'coffee_espresso', 'farmers_markets']
      },
      now
    });

    await profileMod.submitAdultSharingEligibility(dbAdapter, {
      userId: ADMIN_TEST_CUSTOMER_USER_ID,
      body: { dob: '1990-04-15' },
      now
    });
  }

  if (explorationMod) {
    const existingVisits = await explorationMod.listUserVisits(dbAdapter, {
      userId: ADMIN_TEST_CUSTOMER_USER_ID,
      limit: 5
    });
    if ((existingVisits.visits || []).length === 0) {
      await explorationMod.logUserVisit(dbAdapter, {
        userId: ADMIN_TEST_CUSTOMER_USER_ID,
        vendorId: 'mitote',
        privateNote: 'Sandbox private note: crispy birria quesatacos & hibiscus agua fresca.',
        now
      });
      await explorationMod.logUserVisit(dbAdapter, {
        userId: ADMIN_TEST_CUSTOMER_USER_ID,
        vendorId: 'fruta',
        privateNote: 'Sandbox private note: strawberry-lime paleta after lunch.',
        now
      });
    }

    const existingPhotos = await explorationMod.listUserPhotos(dbAdapter, {
      userId: ADMIN_TEST_CUSTOMER_USER_ID
    });
    if ((existingPhotos.photos || []).length === 0) {
      try {
        const { default: sharp } = await import('sharp');
        const sampleBuf = await sharp({
          create: { width: 480, height: 360, channels: 3, background: { r: 35, g: 75, b: 58 } }
        })
          .jpeg({ quality: 84 })
          .toBuffer();
        await explorationMod
          .createUserPhoto(dbAdapter, {
            userId: ADMIN_TEST_CUSTOMER_USER_ID,
            vendorId: 'mitote',
            caption: 'Sandbox private dish photo (never public unless explicitly attached)',
            dataBase64: sampleBuf.toString('base64'),
            declaredMimeType: 'image/jpeg',
            now
          })
          .catch(() => {});
      } catch {}
    }

    const existingTrails = await explorationMod.listUserSavedTrails(dbAdapter, {
      userId: ADMIN_TEST_CUSTOMER_USER_ID
    });
    if ((existingTrails.trails || []).length === 0) {
      await explorationMod.saveUserTrail(dbAdapter, {
        userId: ADMIN_TEST_CUSTOMER_USER_ID,
        title: 'Santa Rosa Taco & Paleta Test Loop',
        themeKey: 'sweet',
        stops: [
          { vendor_id: 'mitote', match_reason: 'Quesatacos' },
          { vendor_id: 'fruta', match_reason: 'Paletas' }
        ],
        now
      });
    }
  }

  if (profileMod) {
    const existingCols = await profileMod.listOwnerCollections(dbAdapter, {
      userId: ADMIN_TEST_CUSTOMER_USER_ID,
      now
    });
    if ((existingCols.collections || []).length === 0) {
      await profileMod.createOwnerCollection(dbAdapter, {
        userId: ADMIN_TEST_CUSTOMER_USER_ID,
        body: {
          title: 'Sonoma Sandbox Greatest Hits',
          intro: 'Sample curated Sonoma County picks for Admin testing.',
          entries: [
            {
              vendor_id: 'mitote',
              recommendation: 'Try the crispy quesatacos and smoky salsa.'
            },
            {
              vendor_id: 'fruta',
              recommendation: 'Great afternoon mangonadas and fruit paletas.'
            }
          ]
        },
        now
      });
    }
  }

  const counts = await withTransaction(dbAdapter, async tx => {
    const rev = await reverifyModeratorInTx(tx, ctx);
    if (!rev.ok) throw new Error(rev.error);
    await tx.query("SELECT set_config('app.user_id', $1, true)", [ADMIN_TEST_CUSTOMER_USER_ID]);
    await tx.query(
      `INSERT INTO favorites (user_id, truck_id)
       VALUES ($1, 'mitote'), ($1, 'fruta')
       ON CONFLICT DO NOTHING`,
      [ADMIN_TEST_CUSTOMER_USER_ID]
    );
    await tx.query("SELECT set_config('app.user_id', $1, true)", [ctx.user.id]);
    await recordAuditLog(tx, {
      actorId: ctx.user.id,
      actorRole: rev.actorRole,
      targetType: 'user',
      targetId: ADMIN_TEST_CUSTOMER_USER_ID,
      action: 'test_customer_sample_seeded',
      metadata: { sandbox_user_id: ADMIN_TEST_CUSTOMER_USER_ID }
    });
    return collectSandboxCustomerCountsInTx(tx);
  });

  return {
    ok: true,
    status: 200,
    body: {
      ok: true,
      seeded: true,
      test_user: {
        id: ADMIN_TEST_CUSTOMER_USER_ID,
        email: ADMIN_TEST_CUSTOMER_EMAIL
      },
      counts
    }
  };
}

export async function resetAdminTestCustomerData(dbAdapter, ctx, { now = new Date() } = {}) {
  if (!isAdminTestCustomerAllowed()) {
    return {
      ok: false,
      status: 403,
      code: 'TEST_CUSTOMER_DISABLED_IN_ENV',
      error: 'Testing customer sandbox is disabled by BITESHARK_ENABLE_ADMIN_TEST_CUSTOMER.'
    };
  }

  const authCheck = await withTransaction(dbAdapter, async tx => {
    const rev = await reverifyModeratorInTx(tx, ctx);
    if (!rev.ok) return { ok: false, status: rev.status, error: rev.error };
    await ensureAdminTestCustomerAccountInTx(tx, now.toISOString());
    return { ok: true };
  });
  if (!authCheck.ok) return authCheck;

  const profileMod = await loadOptionalProfileModule();
  if (profileMod?.clearCustomerProfileAndCollectionsData) {
    await profileMod.clearCustomerProfileAndCollectionsData(dbAdapter, {
      userId: ADMIN_TEST_CUSTOMER_USER_ID,
      includeExplorationData: true
    });
  }

  const counts = await withTransaction(dbAdapter, async tx => {
    const rev = await reverifyModeratorInTx(tx, ctx);
    if (!rev.ok) throw new Error(rev.error);
    await tx.query("SELECT set_config('app.user_id', $1, true)", [ADMIN_TEST_CUSTOMER_USER_ID]);
    await tx.query('DELETE FROM favorites WHERE user_id = $1', [ADMIN_TEST_CUSTOMER_USER_ID]);
    await tx.query('DELETE FROM bookings WHERE requester_user_id = $1', [
      ADMIN_TEST_CUSTOMER_USER_ID
    ]);
    await tx.query('DELETE FROM notification_settings WHERE user_id = $1', [
      ADMIN_TEST_CUSTOMER_USER_ID
    ]);
    await tx.query("SELECT set_config('app.user_id', $1, true)", [ctx.user.id]);
    await recordAuditLog(tx, {
      actorId: ctx.user.id,
      actorRole: rev.actorRole,
      targetType: 'user',
      targetId: ADMIN_TEST_CUSTOMER_USER_ID,
      action: 'test_customer_data_reset',
      metadata: { sandbox_user_id: ADMIN_TEST_CUSTOMER_USER_ID }
    });
    return collectSandboxCustomerCountsInTx(tx);
  });

  return {
    ok: true,
    status: 200,
    body: {
      ok: true,
      reset: true,
      test_user: {
        id: ADMIN_TEST_CUSTOMER_USER_ID,
        email: ADMIN_TEST_CUSTOMER_EMAIL
      },
      counts
    }
  };
}

export async function exitAdminTestCustomerSession(dbAdapter, req, ctx, { now = new Date() } = {}) {
  const rawOverlay = extractRawAdminTestCustomerToken(req);
  const nowIso = now.toISOString();

  await withTransaction(dbAdapter, async tx => {
    await tx.query("SELECT set_config('app.auth_internal', 'true', true)");
    if (rawOverlay) {
      await tx.query(
        'UPDATE auth_sessions SET revoked_at = $2 WHERE token_sha256 = $1 AND revoked_at IS NULL',
        [sha256Hex(rawOverlay), nowIso]
      );
    }
    if (ctx?.authenticated && ctx?.user?.id) {
      const rev = await reverifyModeratorInTx(tx, ctx);
      if (rev.ok) {
        await recordAuditLog(tx, {
          actorId: ctx.user.id,
          actorRole: rev.actorRole,
          targetType: 'user',
          targetId: ADMIN_TEST_CUSTOMER_USER_ID,
          action: 'test_customer_session_exited',
          metadata: { sandbox_user_id: ADMIN_TEST_CUSTOMER_USER_ID }
        });
      }
    }
  });

  return {
    ok: true,
    status: 200,
    clearCookieHeader: buildClearedAdminTestCustomerCookieHeader(),
    body: {
      ok: true,
      active_in_browser: false
    }
  };
}
