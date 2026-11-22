// HTTP Route Handlers for BiteShark Customer Profile Foundation,
// Curated Greatest Hits Collections, Revocable Unlisted Sharing & Moderation
// (`server/customer-profile-routes.js`)

import { auth } from '@biteshark/runtime-adapter';
import { loadAccessContext } from '../lib/authz.js';
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
