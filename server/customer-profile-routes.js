// HTTP Route Handlers for BiteShark Customer Profile Foundation,
// Curated Greatest Hits Collections, Revocable Unlisted Sharing & Moderation
// (`server/customer-profile-routes.js`)

import { auth } from '@biteshark/runtime-adapter';
import { loadAccessContext } from '../lib/authz.js';
import { readEnvCompat } from '../lib/env-compat.js';
import { extractClientRateKey } from '../lib/pager-notifications.js';
import {
  loadPersistedFeatureControls,
  evaluateFeatureControlsSnapshot
} from '../lib/feature-controls.js';
import {
  recordDiagnosticEvent,
  sanitizeDiagnosticText
} from '../lib/diagnostics.js';
import { resolvePhotoStorageRoot } from '../lib/photo-storage.js';
import {
  CustomerProfileDomainError,
  assertNoForbiddenClientWriteFields,
  getPrivateOwnerProfile,
  updatePrivateOwnerProfile,
  updateCustomerPreferences,
  listOwnerCollections,
  getOwnerCollectionDetail,
  createOwnerCollection,
  updateOwnerCollection,
  deleteOwnerCollection,
  submitAdultSharingEligibility,
  previewOwnerSharedCollection,
  listOwnerShares,
  createCollectionShareLink,
  updateCollectionShareSettings,
  rotateCollectionShareLink,
  revokeCollectionShareLink,
  resolveLiveSharedCollectionByToken,
  renderSharedCollectionHtmlPage,
  renderSharedUnavailableHtmlPage,
  submitPublicSharedPageReport,
  listAdminSharedModerationQueue,
  applyAdminSharedModerationDecision,
  exportCustomerProfileAndExplorationArchive,
  clearCustomerProfileAndCollectionsData
} from '../lib/customer-profile.js';

export const CUSTOMER_PROFILE_PATHS = new Set([
  '/api/me/profile',
  '/api/me/preferences',
  '/api/me/profile/privacy',
  '/api/me/profile/delete-data',
  '/api/me/collections',
  '/api/me/collections/detail',
  '/api/me/collections/update',
  '/api/me/collections/delete',
  '/api/me/collections/preview',
  '/api/me/collections/attach-photo',
  '/api/me/collections/remove-photo',
  '/api/me/sharing-eligibility',
  '/api/me/shares',
  '/api/me/shares/create',
  '/api/me/shares/update-settings',
  '/api/me/shares/rotate',
  '/api/me/shares/revoke',
  '/api/shared/report',
  '/api/admin/shared-moderation',
  '/api/admin/shared-moderation/decision',
  '/api/admin/shared-moderation/photo'
]);

function shortInternalActorTag(userId) {
  if (!userId || typeof userId !== 'string') return null;
  const tail = userId.slice(-8).replace(/[^A-Za-z0-9_]/g, '');
  return tail ? `usr_${tail}` : null;
}

export async function resolveCallerProfileFeatureFlags(dbAdapter, req, verifiedUser) {
  const viewpointHeader = String(req.headers?.['x-biteshark-viewpoint'] || '')
    .trim()
    .toLowerCase();
  const viewpointMode = viewpointHeader === 'preview' ? 'customer_preview' : null;
  const accessCtx = verifiedUser ? await loadAccessContext(req, auth, dbAdapter) : null;
  const persistedResult = await loadPersistedFeatureControls(dbAdapter, { requireTablePresent: true });
  const evaluated = evaluateFeatureControlsSnapshot({
    persistedResult,
    accessCtx,
    viewpointMode
  });

  const keys = [
    'customer_profile',
    'customer_profile_editing',
    'greatest_hits_collections',
    'unlisted_collection_sharing',
    'shared_collection_photos',
    'public_profile_discovery',
    'local_guides_passport',
    'visit_journal',
    'private_photos',
    'exploration_badges',
    'weekly_challenges',
    'suggested_trails',
    'nearby_alert_preferences'
  ];

  const featureStates = {};
  for (const k of keys) {
    const entry = evaluated.entries.get(k);
    featureStates[k] = entry
      ? {
          state: entry.caller_effective_state,
          system_state: entry.system_effective_state,
          available: entry.available_to_caller,
          message: entry.public_message
        }
      : { state: 'hidden', system_state: 'hidden', available: false, message: null };
  }

  return { featureStates, accessCtx };
}

export async function recordProfileDiagnostic(
  dbAdapter,
  req,
  {
    featureKey = 'customer_profile',
    operationName,
    routeTemplate,
    httpMethod,
    httpStatus,
    severity = 'warning',
    errorCode,
    message,
    retryable = false,
    outcomeState = 'failed',
    actorId = null,
    safeContext = {}
  }
) {
  req.__bsDiagnosticRecorded = true;
  const actorTag = shortInternalActorTag(actorId);
  await recordDiagnosticEvent(dbAdapter, {
    component: 'api',
    featureKey,
    routeTemplate,
    operationName,
    httpMethod,
    httpStatus,
    severity,
    errorCode,
    message: sanitizeDiagnosticText(message, 240, 'Profile or sharing operation encountered an issue.'),
    correlationId: req.__bsCorrelationId || null,
    serverReleaseSha: req.__bsServerReleaseSha || null,
    clientBuildVersion: String(req.headers?.['x-biteshark-client-build'] || '').slice(0, 48) || null,
    clientLoadedReleaseSha: String(req.headers?.['x-biteshark-loaded-release'] || '').slice(0, 48) || null,
    retryable,
    outcomeState,
    safeContext: {
      http_status: httpStatus,
      ...(actorTag ? { actor_id: actorTag } : {}),
      ...safeContext
    }
  });
}

function sendProfileError(sendJson, req, err) {
  if (err instanceof CustomerProfileDomainError) {
    const payload = {
      ok: false,
      error: err.message,
      code: err.code,
      retryable: Boolean(err.retryable),
      ...(err.details ? { details: err.details } : {}),
      ...(err.status >= 500 && req.__bsCorrelationId ? { correlation_id: req.__bsCorrelationId } : {})
    };
    return sendJson(err.status, payload);
  }
  return sendJson(500, {
    ok: false,
    error: 'Unexpected profile service error.',
    code: 'PROFILE_INTERNAL_ERROR',
    retryable: true,
    ...(req.__bsCorrelationId ? { correlation_id: req.__bsCorrelationId } : {})
  });
}

export async function handleCustomerProfileRoute({
  pathname,
  method,
  req,
  query = {},
  body = {},
  verifiedUser,
  dbAdapter,
  sendJson,
  rawRes
}) {
  try {
    // 1. Private Owner Profile Read (`GET /api/me/profile`) & Update (`POST /api/me/profile`)
    if (pathname === '/api/me/profile') {
      if (method !== 'GET' && method !== 'POST') {
        return sendJson(
          405,
          { ok: false, error: 'Method not allowed.', code: 'METHOD_NOT_ALLOWED' },
          { Allow: 'GET, POST' }
        );
      }
      if (!verifiedUser?.id) {
        return sendJson(401, { ok: false, error: 'Sign in is required.', code: 'AUTH_REQUIRED' });
      }
      const { featureStates } = await resolveCallerProfileFeatureFlags(dbAdapter, req, verifiedUser);
      if (method === 'GET') {
        const dto = await getPrivateOwnerProfile(dbAdapter, {
          userId: verifiedUser.id,
          featureStates
        });
        return sendJson(200, dto);
      }
      const updated = await updatePrivateOwnerProfile(dbAdapter, {
        userId: verifiedUser.id,
        body,
        featureStates
      });
      return sendJson(200, updated);
    }

    // 1B. Account-Backed Customer Preferences (`POST /api/me/preferences`)
    if (pathname === '/api/me/preferences') {
      if (method !== 'POST') {
        return sendJson(
          405,
          { ok: false, error: 'Method not allowed.', code: 'METHOD_NOT_ALLOWED' },
          { Allow: 'POST' }
        );
      }
      if (!verifiedUser?.id) {
        return sendJson(401, { ok: false, error: 'Sign in is required.', code: 'AUTH_REQUIRED' });
      }
      const { featureStates } = await resolveCallerProfileFeatureFlags(dbAdapter, req, verifiedUser);
      const updated = await updateCustomerPreferences(dbAdapter, {
        userId: verifiedUser.id,
        body,
        featureStates
      });
      return sendJson(200, updated);
    }

    // 2. Self-Service Privacy, Export & Share Overview (`GET /api/me/profile/privacy` — always available!)
    if (pathname === '/api/me/profile/privacy') {
      if (method !== 'GET') {
        return sendJson(405, { ok: false, error: 'Method not allowed.', code: 'METHOD_NOT_ALLOWED' }, { Allow: 'GET' });
      }
      if (!verifiedUser?.id) {
        return sendJson(401, { ok: false, error: 'Sign in is required.', code: 'AUTH_REQUIRED' });
      }
      const archive = await exportCustomerProfileAndExplorationArchive(dbAdapter, {
        userId: verifiedUser.id
      });
      return sendJson(200, archive);
    }

    // 3. Self-Service Profile & Collection Data Deletion (`POST /api/me/profile/delete-data` — always available!)
    if (pathname === '/api/me/profile/delete-data') {
      if (method !== 'POST') {
        return sendJson(405, { ok: false, error: 'Method not allowed.', code: 'METHOD_NOT_ALLOWED' }, { Allow: 'POST' });
      }
      if (!verifiedUser?.id) {
        return sendJson(401, { ok: false, error: 'Sign in is required.', code: 'AUTH_REQUIRED' });
      }
      assertNoForbiddenClientWriteFields(body);
      if (body.confirm_delete !== true) {
        throw new CustomerProfileDomainError(
          'Explicit confirmation (`confirm_delete: true`) is required before deleting profile and collection data.',
          {
            status: 400,
            code: 'DELETE_CONFIRMATION_REQUIRED'
          }
        );
      }
      const result = await clearCustomerProfileAndCollectionsData(dbAdapter, {
        userId: verifiedUser.id,
        storageRoot: resolvePhotoStorageRoot(),
        includeExplorationData: Boolean(body.include_exploration_data)
      });
      return sendJson(200, result);
    }

    // 4. Greatest Hits Collections List (`GET /api/me/collections`) & Create (`POST /api/me/collections`)
    if (pathname === '/api/me/collections') {
      if (method !== 'GET' && method !== 'POST') {
        return sendJson(
          405,
          { ok: false, error: 'Method not allowed.', code: 'METHOD_NOT_ALLOWED' },
          { Allow: 'GET, POST' }
        );
      }
      if (!verifiedUser?.id) {
        return sendJson(401, { ok: false, error: 'Sign in is required.', code: 'AUTH_REQUIRED' });
      }
      if (method === 'GET') {
        const listOut = await listOwnerCollections(dbAdapter, { userId: verifiedUser.id });
        return sendJson(200, listOut);
      }
      const created = await createOwnerCollection(dbAdapter, {
        userId: verifiedUser.id,
        body
      });
      return sendJson(created.idempotent_replay ? 200 : 201, created);
    }

    // 5. Greatest Hits Collection Detail (`GET /api/me/collections/detail?id=col_...`)
    if (pathname === '/api/me/collections/detail') {
      if (method !== 'GET') {
        return sendJson(
          405,
          { ok: false, error: 'Method not allowed.', code: 'METHOD_NOT_ALLOWED' },
          { Allow: 'GET' }
        );
      }
      if (!verifiedUser?.id) {
        return sendJson(401, { ok: false, error: 'Sign in is required.', code: 'AUTH_REQUIRED' });
      }
      const detail = await getOwnerCollectionDetail(dbAdapter, {
        userId: verifiedUser.id,
        collectionId: query.id
      });
      return sendJson(200, detail);
    }

    // 6. Greatest Hits Collection Update (`POST /api/me/collections/update`)
    if (pathname === '/api/me/collections/update') {
      if (method !== 'POST') {
        return sendJson(
          405,
          { ok: false, error: 'Method not allowed.', code: 'METHOD_NOT_ALLOWED' },
          { Allow: 'POST' }
        );
      }
      if (!verifiedUser?.id) {
        return sendJson(401, { ok: false, error: 'Sign in is required.', code: 'AUTH_REQUIRED' });
      }
      const updated = await updateOwnerCollection(dbAdapter, {
        userId: verifiedUser.id,
        body
      });
      return sendJson(200, updated);
    }

    // 7. Greatest Hits Collection Delete (`POST /api/me/collections/delete` — always available to owner!)
    if (pathname === '/api/me/collections/delete') {
      if (method !== 'POST') {
        return sendJson(
          405,
          { ok: false, error: 'Method not allowed.', code: 'METHOD_NOT_ALLOWED' },
          { Allow: 'POST' }
        );
      }
      if (!verifiedUser?.id) {
        return sendJson(401, { ok: false, error: 'Sign in is required.', code: 'AUTH_REQUIRED' });
      }
      assertNoForbiddenClientWriteFields(body);
      const deleted = await deleteOwnerCollection(dbAdapter, {
        userId: verifiedUser.id,
        collectionId: body.collection_id,
        storageRoot: resolvePhotoStorageRoot()
      });
      return sendJson(200, deleted);
    }

    // 8. Owner Shared Projection Preview (`POST /api/me/collections/preview`)
    if (pathname === '/api/me/collections/preview') {
      if (method !== 'POST') {
        return sendJson(
          405,
          { ok: false, error: 'Method not allowed.', code: 'METHOD_NOT_ALLOWED' },
          { Allow: 'POST' }
        );
      }
      if (!verifiedUser?.id) {
        return sendJson(401, { ok: false, error: 'Sign in is required.', code: 'AUTH_REQUIRED' });
      }
      const { featureStates } = await resolveCallerProfileFeatureFlags(dbAdapter, req, verifiedUser);
      const out = await previewOwnerSharedCollection(dbAdapter, {
        userId: verifiedUser.id,
        body,
        featureStates
      });
      return sendJson(200, out);
    }

    // 9. One-Time Self-Attested 18+ Sharing Eligibility (`POST /api/me/sharing-eligibility` — zero DOB stored)
    if (pathname === '/api/me/sharing-eligibility') {
      if (method !== 'POST') {
        return sendJson(
          405,
          { ok: false, error: 'Method not allowed.', code: 'METHOD_NOT_ALLOWED' },
          { Allow: 'POST' }
        );
      }
      if (!verifiedUser?.id) {
        return sendJson(401, { ok: false, error: 'Sign in is required.', code: 'AUTH_REQUIRED' });
      }
      const out = await submitAdultSharingEligibility(dbAdapter, {
        userId: verifiedUser.id,
        body
      });
      return sendJson(200, out);
    }

    // 10. List Owner Shares (`GET /api/me/shares` — always available to owner!)
    if (pathname === '/api/me/shares') {
      if (method !== 'GET') {
        return sendJson(
          405,
          { ok: false, error: 'Method not allowed.', code: 'METHOD_NOT_ALLOWED' },
          { Allow: 'GET' }
        );
      }
      if (!verifiedUser?.id) {
        return sendJson(401, { ok: false, error: 'Sign in is required.', code: 'AUTH_REQUIRED' });
      }
      const out = await listOwnerShares(dbAdapter, {
        userId: verifiedUser.id,
        collectionId: query.collection_id || null
      });
      return sendJson(200, out);
    }

    // 11. Create Hashed Unlisted Share Link (`POST /api/me/shares/create`)
    if (pathname === '/api/me/shares/create') {
      if (method !== 'POST') {
        return sendJson(
          405,
          { ok: false, error: 'Method not allowed.', code: 'METHOD_NOT_ALLOWED' },
          { Allow: 'POST' }
        );
      }
      if (!verifiedUser?.id) {
        return sendJson(401, { ok: false, error: 'Sign in is required.', code: 'AUTH_REQUIRED' });
      }
      const publicOrigin = readEnvCompat('PUBLIC_ORIGIN', { securityCritical: false, defaultValue: '' });
      const created = await createCollectionShareLink(dbAdapter, {
        userId: verifiedUser.id,
        body,
        publicOrigin
      });
      return sendJson(created.idempotent_replay ? 200 : 201, created);
    }

    // 12. Update Share Disclosure Flags / Expiry (`POST /api/me/shares/update-settings`)
    if (pathname === '/api/me/shares/update-settings') {
      if (method !== 'POST') {
        return sendJson(
          405,
          { ok: false, error: 'Method not allowed.', code: 'METHOD_NOT_ALLOWED' },
          { Allow: 'POST' }
        );
      }
      if (!verifiedUser?.id) {
        return sendJson(401, { ok: false, error: 'Sign in is required.', code: 'AUTH_REQUIRED' });
      }
      const updated = await updateCollectionShareSettings(dbAdapter, {
        userId: verifiedUser.id,
        body
      });
      return sendJson(200, updated);
    }

    // 13. Rotate / Replace Share Link (`POST /api/me/shares/rotate`)
    if (pathname === '/api/me/shares/rotate') {
      if (method !== 'POST') {
        return sendJson(
          405,
          { ok: false, error: 'Method not allowed.', code: 'METHOD_NOT_ALLOWED' },
          { Allow: 'POST' }
        );
      }
      if (!verifiedUser?.id) {
        return sendJson(401, { ok: false, error: 'Sign in is required.', code: 'AUTH_REQUIRED' });
      }
      const publicOrigin = readEnvCompat('PUBLIC_ORIGIN', { securityCritical: false, defaultValue: '' });
      const rotated = await rotateCollectionShareLink(dbAdapter, {
        userId: verifiedUser.id,
        body,
        publicOrigin
      });
      return sendJson(200, rotated);
    }

    // 14. Revoke Share Link (`POST /api/me/shares/revoke` — ALWAYS available even if sharing paused/hidden!)
    if (pathname === '/api/me/shares/revoke') {
      if (method !== 'POST') {
        return sendJson(
          405,
          { ok: false, error: 'Method not allowed.', code: 'METHOD_NOT_ALLOWED' },
          { Allow: 'POST' }
        );
      }
      if (!verifiedUser?.id) {
        return sendJson(401, { ok: false, error: 'Sign in is required.', code: 'AUTH_REQUIRED' });
      }
      assertNoForbiddenClientWriteFields(body);
      const revoked = await revokeCollectionShareLink(dbAdapter, {
        userId: verifiedUser.id,
        shareId: body.share_id,
        reason: body.reason
      });
      return sendJson(200, revoked);
    }

    // 15. Signed-Out & Signed-In Abuse Reports on Shared Pages (`POST /api/shared/report`)
    if (pathname === '/api/shared/report') {
      if (method !== 'POST') {
        return sendJson(
          405,
          { ok: false, error: 'Method not allowed.', code: 'METHOD_NOT_ALLOWED' },
          { Allow: 'POST' }
        );
      }
      const clientRateKey = extractClientRateKey(req);
      const out = await submitPublicSharedPageReport(dbAdapter, {
        reporterUserId: verifiedUser?.id || null,
        clientRateKey,
        body
      });
      return sendJson(201, out);
    }

    // 16. Scoped Shared-Page Moderation Queue (`GET /api/admin/shared-moderation` — Mod & Top)
    if (pathname === '/api/admin/shared-moderation') {
      if (method !== 'GET') {
        return sendJson(
          405,
          { ok: false, error: 'Method not allowed.', code: 'METHOD_NOT_ALLOWED' },
          { Allow: 'GET' }
        );
      }
      if (!verifiedUser?.id) {
        return sendJson(401, { ok: false, error: 'Sign in is required.', code: 'AUTH_REQUIRED' });
      }
      const accessCtx = await loadAccessContext(req, auth, dbAdapter);
      if (!accessCtx.isModAdmin) {
        return sendJson(403, {
          ok: false,
          error: 'Moderator or platform administrator access is required.',
          code: 'MODERATOR_REQUIRED'
        });
      }
      const out = await listAdminSharedModerationQueue(dbAdapter, {
        accessCtx,
        statusFilter: String(query.status || '').trim(),
        page: query.page,
        pageSize: query.page_size
      });
      return sendJson(200, out);
    }

    // 17. Scoped Shared-Page Moderation Decision (`POST /api/admin/shared-moderation/decision` — Mod & Top)
    if (pathname === '/api/admin/shared-moderation/decision') {
      if (method !== 'POST') {
        return sendJson(
          405,
          { ok: false, error: 'Method not allowed.', code: 'METHOD_NOT_ALLOWED' },
          { Allow: 'POST' }
        );
      }
      if (!verifiedUser?.id) {
        return sendJson(401, { ok: false, error: 'Sign in is required.', code: 'AUTH_REQUIRED' });
      }
      const accessCtx = await loadAccessContext(req, auth, dbAdapter);
      if (!accessCtx.isModAdmin) {
        return sendJson(403, {
          ok: false,
          error: 'Moderator or platform administrator access is required.',
          code: 'MODERATOR_REQUIRED'
        });
      }
      const out = await applyAdminSharedModerationDecision(dbAdapter, {
        accessCtx,
        body
      });
      return sendJson(200, out);
    }

    return sendJson(404, { ok: false, error: 'Profile endpoint not found.', code: 'NOT_FOUND' });
  } catch (err) {
    const status = err instanceof CustomerProfileDomainError ? err.status : 500;
    if (status >= 500) {
      await recordProfileDiagnostic(dbAdapter, req, {
        featureKey: pathname.includes('/collections')
          ? 'greatest_hits_collections'
          : pathname.includes('/share')
            ? 'unlisted_sharing'
            : 'customer_profile',
        operationName: `${method.toLowerCase()}_${pathname.replace(/^\/api\//, '').replace(/\//g, '_')}`,
        routeTemplate: pathname,
        httpMethod: method,
        httpStatus: status,
        severity: 'error',
        errorCode: err?.code || 'PROFILE_INTERNAL_ERROR',
        message: err?.message || 'Unexpected customer profile error.',
        retryable: Boolean(err?.retryable ?? true),
        actorId: verifiedUser?.id || null
      });
    }
    return sendProfileError(sendJson, req, err);
  }
}

export function applyUnlistedSharedSecurityHeaders(res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
  );
}

/**
 * Dynamic server-rendered `/s/<opaque-token>` recipient handler.
 * Never logs raw tokens; expected invalid/expired/revoked tokens return uniform neutral 404 HTML
 * without generating high-severity diagnostic incidents.
 */
export async function handlePublicSharedPageRequest({
  rawToken,
  method,
  req,
  res,
  dbAdapter,
  viewerAuthenticated = false
}) {
  applyUnlistedSharedSecurityHeaders(res);
  req.__bsRouteTemplate = '/s/:token';

  if (method !== 'GET' && method !== 'HEAD') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET, HEAD');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Method not allowed.');
    return;
  }

  try {
    const { featureStates } = await resolveCallerProfileFeatureFlags(dbAdapter, req, null);
    const resolved = await resolveLiveSharedCollectionByToken(dbAdapter, {
      rawToken,
      systemFeatureStates: featureStates
    });

    if (!resolved.available) {
      const html404 = renderSharedUnavailableHtmlPage();
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Length', Buffer.byteLength(html404, 'utf8'));
      if (method === 'HEAD') {
        res.end();
        return;
      }
      res.end(html404);
      return;
    }

    const html200 = renderSharedCollectionHtmlPage(resolved.dto, { viewerAuthenticated });
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Length', Buffer.byteLength(html200, 'utf8'));
    if (method === 'HEAD') {
      res.end();
      return;
    }
    res.end(html200);
  } catch (err) {
    await recordProfileDiagnostic(dbAdapter, req, {
      featureKey: 'unlisted_sharing',
      operationName: 'render_shared_collection_page',
      routeTemplate: '/s/:token',
      httpMethod: method,
      httpStatus: 500,
      severity: 'error',
      errorCode: err?.code || 'SHARED_PAGE_RENDER_ERROR',
      message: 'Unexpected error while resolving unlisted shared page.',
      retryable: true
    });
    const htmlErr = renderSharedUnavailableHtmlPage();
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Length', Buffer.byteLength(htmlErr, 'utf8'));
    if (method === 'HEAD') {
      res.end();
      return;
    }
    res.end(htmlErr);
  }
}
