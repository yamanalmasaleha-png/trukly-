// HTTP Route Handlers for BiteShark Customer Exploration, Editorial Stories,
// Visit Journal, Private Photos, Badges/Challenges, Suggested Trails & Legacy Import
// (`server/customer-exploration-routes.js`)

import { auth } from '@biteshark/runtime-adapter';
import { loadAccessContext } from '../lib/authz.js';
import { isVendorPubliclyDiscoverable } from '../lib/discovery.js';
import { buildPublicStoriesPayload } from '../lib/editorial-stories.js';
import {
  loadPersistedFeatureControls,
  evaluateFeatureControlsSnapshot
} from '../lib/feature-controls.js';
import {
  recordDiagnosticEvent,
  sanitizeDiagnosticText
} from '../lib/diagnostics.js';
import {
  PhotoStorageError,
  resolvePhotoStorageRoot,
  resolvePhotoMinFreeBytes
} from '../lib/photo-storage.js';
import {
  ExplorationDomainError,
  getExplorationSummary,
  listUserVisits,
  logUserVisit,
  deleteUserVisit,
  listUserPhotos,
  createUserPhoto,
  readUserPhotoFile,
  deleteUserPhoto,
  buildSuggestedTrail,
  listUserSavedTrails,
  saveUserTrail,
  deleteUserSavedTrail,
  importLegacyDeviceVisits,
  exportUserExplorationData
} from '../lib/customer-exploration.js';

export const CUSTOMER_EXPLORATION_PATHS = new Set([
  '/api/stories',
  '/api/trails/suggest',
  '/api/me/exploration',
  '/api/me/exploration/import',
  '/api/me/exploration/export',
  '/api/me/visits',
  '/api/me/visits/delete',
  '/api/me/photos',
  '/api/me/photos/file',
  '/api/me/photos/delete',
  '/api/me/trails',
  '/api/me/trails/delete'
]);

function shortInternalActorTag(userId) {
  if (!userId || typeof userId !== 'string') return null;
  const tail = userId.slice(-8).replace(/[^A-Za-z0-9_]/g, '');
  return tail ? `usr_${tail}` : null;
}

async function resolveCallerExplorationFeatureFlags(dbAdapter, req, verifiedUser) {
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
    'local_guides_passport',
    'editorial_stories',
    'visit_journal',
    'private_photos',
    'exploration_badges',
    'weekly_challenges',
    'suggested_trails'
  ];
  const featureStates = {};
  for (const k of keys) {
    const entry = evaluated.entries.get(k);
    featureStates[k] = entry
      ? {
          state: entry.caller_effective_state,
          available: entry.available_to_caller,
          message: entry.public_message
        }
      : { state: 'hidden', available: false, message: null };
  }

  return {
    showAchievements:
      featureStates.visit_journal.state !== 'hidden' &&
      featureStates.exploration_badges.state !== 'hidden',
    showWeeklyChallenge:
      featureStates.visit_journal.state !== 'hidden' &&
      featureStates.weekly_challenges.state !== 'hidden',
    featureStates
  };
}

async function recordExplorationDiagnostic(
  dbAdapter,
  req,
  {
    featureKey,
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
    message: sanitizeDiagnosticText(message, 240, 'Exploration operation encountered an issue.'),
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

function sendExplorationError(dbAdapter, req, sendJson, err, { featureKey, operationName, routeTemplate, method, userId }) {
  const corrId = req.__bsCorrelationId || null;

  if (err instanceof PhotoStorageError || err instanceof ExplorationDomainError) {
    const status = err.status || 400;
    const isStorageOrServerFailure = status >= 500 || err.code === 'CORRUPT_PHOTO_DATA' || err.code === 'UNSUPPORTED_PHOTO_FORMAT' || err.code === 'PHOTO_MIME_MISMATCH' || err.code === 'PHOTO_DIMENSIONS_EXCEEDED' || err.code === 'PHOTO_FILE_MISSING';
    if (isStorageOrServerFailure) {
      // Record structured diagnostic asynchronously without blocking if DB is degraded,
      // or await via __pendingDiagPromise pattern
      const severity = status >= 500 ? 'error' : 'warning';
      const outcomeState = status === 503 || status === 507 ? 'temporarily_unavailable' : 'failed';
      return recordExplorationDiagnostic(dbAdapter, req, {
        featureKey,
        operationName,
        routeTemplate,
        httpMethod: method,
        httpStatus: status,
        severity,
        errorCode: err.code,
        message: err.message,
        retryable: Boolean(err.retryable),
        outcomeState,
        actorId: userId
      }).finally(() => {
        sendJson(
          status,
          {
            error: err.message,
            code: err.code,
            retryable: Boolean(err.retryable),
            correlation_id: corrId
          },
          corrId ? { 'X-Correlation-Id': corrId } : {}
        );
      });
    }

    return sendJson(
      status,
      {
        error: err.message,
        code: err.code,
        retryable: Boolean(err.retryable),
        correlation_id: corrId
      },
      corrId ? { 'X-Correlation-Id': corrId } : {}
    );
  }

  // Re-throw SessionEligibilityError or unexpected errors so server/app.js handles them centrally
  throw err;
}

export async function handleCustomerExplorationRoute({
  pathname,
  method,
  req,
  query,
  body,
  verifiedUser,
  dbAdapter,
  sendJson,
  rawRes
}) {
  // =========================================================================
  // 1. Public Editorial Stories (`GET /api/stories`)
  // =========================================================================
  if (pathname === '/api/stories') {
    if (method !== 'GET') {
      return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'GET' });
    }
    const { rows } = await dbAdapter.query(
      `SELECT id, is_active, hidden_from_discovery, restriction_authority, temp_restriction_expires_at
       FROM vendors`
    );
    const nowMs = Date.now();
    const discoverableSet = new Set(
      rows.filter(r => isVendorPubliclyDiscoverable(r, nowMs)).map(r => r.id)
    );
    return sendJson(200, buildPublicStoriesPayload(discoverableSet));
  }

  // =========================================================================
  // 2. Public Suggested Trails Generator & Shared-Link Resolver (`GET /api/trails/suggest`)
  // =========================================================================
  if (pathname === '/api/trails/suggest') {
    if (method !== 'GET') {
      return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'GET' });
    }
    try {
      const rawIds = typeof query.ids === 'string' && query.ids.trim() ? query.ids.split(',') : null;
      const result = await buildSuggestedTrail(dbAdapter, {
        theme: query.theme || 'mix',
        town: query.town || '',
        offset: query.offset || 0,
        explicitIds: rawIds
      });
      return sendJson(200, result);
    } catch (err) {
      return sendExplorationError(dbAdapter, req, sendJson, err, {
        featureKey: 'suggested_trails',
        operationName: 'GET /api/trails/suggest',
        routeTemplate: '/api/trails/suggest',
        method,
        userId: verifiedUser?.id || null
      });
    }
  }

  // All `/api/me/*` routes strictly require an authenticated, eligible session (`401` if anonymous).
  // Never accept a client-provided `user_id` parameter!
  if (!verifiedUser || !verifiedUser.id) {
    return sendJson(401, {
      error: 'Sign in is required to view or save personal exploration history, photos, or trails.',
      code: 'AUTH_REQUIRED'
    });
  }
  const userId = verifiedUser.id;

  // =========================================================================
  // 3. Unified Account Exploration Summary (`GET /api/me/exploration`)
  // =========================================================================
  if (pathname === '/api/me/exploration') {
    if (method !== 'GET') {
      return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'GET' });
    }
    try {
      const flags = await resolveCallerExplorationFeatureFlags(dbAdapter, req, verifiedUser);
      const summary = await getExplorationSummary(dbAdapter, {
        userId,
        showAchievements: flags.showAchievements,
        showWeeklyChallenge: flags.showWeeklyChallenge,
        featureStates: flags.featureStates
      });
      return sendJson(200, summary);
    } catch (err) {
      return sendExplorationError(dbAdapter, req, sendJson, err, {
        featureKey: 'visit_journal',
        operationName: 'GET /api/me/exploration',
        routeTemplate: '/api/me/exploration',
        method,
        userId
      });
    }
  }

  // =========================================================================
  // 4. Account-Level Personal Exploration Export (`GET /api/me/exploration/export`)
  // =========================================================================
  if (pathname === '/api/me/exploration/export') {
    if (method !== 'GET') {
      return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'GET' });
    }
    try {
      const payload = await exportUserExplorationData(dbAdapter, { userId });
      return sendJson(200, payload);
    } catch (err) {
      return sendExplorationError(dbAdapter, req, sendJson, err, {
        featureKey: 'visit_journal',
        operationName: 'GET /api/me/exploration/export',
        routeTemplate: '/api/me/exploration/export',
        method,
        userId
      });
    }
  }

  // =========================================================================
  // 5. Legacy Device Visits Import (`POST /api/me/exploration/import`)
  // =========================================================================
  if (pathname === '/api/me/exploration/import') {
    if (method !== 'POST') {
      return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'POST' });
    }
    try {
      const flags = await resolveCallerExplorationFeatureFlags(dbAdapter, req, verifiedUser);
      const out = await importLegacyDeviceVisits(dbAdapter, {
        userId,
        visits: body?.visits || [],
        showAchievements: flags.showAchievements,
        showWeeklyChallenge: flags.showWeeklyChallenge,
        featureStates: flags.featureStates
      });

      if (out.invalid_count > 0) {
        await recordExplorationDiagnostic(dbAdapter, req, {
          featureKey: 'legacy_import',
          operationName: 'POST /api/me/exploration/import',
          routeTemplate: '/api/me/exploration/import',
          httpMethod: 'POST',
          httpStatus: 200,
          severity: 'warning',
          errorCode: 'LEGACY_IMPORT_PARTIAL_INVALID',
          message: `Legacy device visit import skipped ${out.invalid_count} invalid or unmappable entries.`,
          retryable: false,
          outcomeState: out.imported_count > 0 ? 'partial_success' : 'failed',
          actorId: userId,
          safeContext: { item_count: out.invalid_count }
        });
      }

      return sendJson(200, {
        ...out,
        correlation_id: req.__bsCorrelationId || null
      });
    } catch (err) {
      return sendExplorationError(dbAdapter, req, sendJson, err, {
        featureKey: 'legacy_import',
        operationName: 'POST /api/me/exploration/import',
        routeTemplate: '/api/me/exploration/import',
        method,
        userId
      });
    }
  }

  // =========================================================================
  // 6. Visit Journal (`GET / POST /api/me/visits`, `POST /api/me/visits/delete`)
  // =========================================================================
  if (pathname === '/api/me/visits') {
    if (method === 'GET') {
      try {
        const out = await listUserVisits(dbAdapter, {
          userId,
          limit: query.limit,
          offset: query.offset,
          vendorId: query.vendor_id || null
        });
        return sendJson(200, out);
      } catch (err) {
        return sendExplorationError(dbAdapter, req, sendJson, err, {
          featureKey: 'visit_journal',
          operationName: 'GET /api/me/visits',
          routeTemplate: '/api/me/visits',
          method,
          userId
        });
      }
    }

    if (method === 'POST') {
      try {
        const flags = await resolveCallerExplorationFeatureFlags(dbAdapter, req, verifiedUser);
        const out = await logUserVisit(dbAdapter, {
          userId,
          vendorId: body?.vendor_id,
          privateNote: body?.private_note ?? body?.note ?? '',
          entrySource: body?.entry_source || 'manual',
          idempotencyKey: body?.idempotency_key || null,
          showAchievements: flags.showAchievements,
          showWeeklyChallenge: flags.showWeeklyChallenge,
          featureStates: flags.featureStates
        });
        return sendJson(out.created ? 201 : 200, out);
      } catch (err) {
        return sendExplorationError(dbAdapter, req, sendJson, err, {
          featureKey: 'visit_journal',
          operationName: 'POST /api/me/visits',
          routeTemplate: '/api/me/visits',
          method,
          userId
        });
      }
    }

    return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'GET, POST' });
  }

  if (pathname === '/api/me/visits/delete') {
    if (method !== 'POST') {
      return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'POST' });
    }
    try {
      const flags = await resolveCallerExplorationFeatureFlags(dbAdapter, req, verifiedUser);
      const out = await deleteUserVisit(dbAdapter, {
        userId,
        visitId: body?.visit_id,
        showAchievements: flags.showAchievements,
        showWeeklyChallenge: flags.showWeeklyChallenge,
        featureStates: flags.featureStates
      });
      return sendJson(200, out);
    } catch (err) {
      return sendExplorationError(dbAdapter, req, sendJson, err, {
        featureKey: 'visit_journal',
        operationName: 'POST /api/me/visits/delete',
        routeTemplate: '/api/me/visits/delete',
        method,
        userId
      });
    }
  }

  // =========================================================================
  // 7. Private Account-Backed Photos (`GET / POST /api/me/photos`, `/file`, `/delete`)
  // =========================================================================
  if (pathname === '/api/me/photos') {
    if (method === 'GET') {
      try {
        const out = await listUserPhotos(dbAdapter, {
          userId,
          limit: query.limit,
          offset: query.offset,
          vendorId: query.vendor_id || null
        });
        return sendJson(200, out);
      } catch (err) {
        return sendExplorationError(dbAdapter, req, sendJson, err, {
          featureKey: 'private_photos',
          operationName: 'GET /api/me/photos',
          routeTemplate: '/api/me/photos',
          method,
          userId
        });
      }
    }

    if (method === 'POST') {
      try {
        const flags = await resolveCallerExplorationFeatureFlags(dbAdapter, req, verifiedUser);
        const out = await createUserPhoto(dbAdapter, {
          userId,
          vendorId: body?.vendor_id || null,
          caption: body?.caption ?? '',
          entrySource: body?.entry_source || 'manual',
          idempotencyKey: body?.idempotency_key || null,
          takenAtIso: body?.taken_at || null,
          dataBase64: body?.data_base64 ?? body?.data_url,
          declaredMimeType: body?.mime_type || '',
          storageRoot: resolvePhotoStorageRoot(),
          minFreeBytes: resolvePhotoMinFreeBytes(),
          showAchievements: flags.showAchievements,
          showWeeklyChallenge: flags.showWeeklyChallenge,
          featureStates: flags.featureStates
        });
        return sendJson(out.created ? 201 : 200, out);
      } catch (err) {
        return sendExplorationError(dbAdapter, req, sendJson, err, {
          featureKey: 'private_photos',
          operationName: 'POST /api/me/photos',
          routeTemplate: '/api/me/photos',
          method,
          userId
        });
      }
    }

    return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'GET, POST' });
  }

  if (pathname === '/api/me/photos/file') {
    if (method !== 'GET') {
      return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'GET' });
    }
    try {
      const fileOut = await readUserPhotoFile(dbAdapter, {
        userId,
        photoId: query.id || '',
        variant: query.variant || 'main',
        storageRoot: resolvePhotoStorageRoot()
      });

      rawRes.setHeader('Content-Type', fileOut.contentType);
      rawRes.setHeader('Content-Length', String(fileOut.bytes.length));
      rawRes.setHeader('Cache-Control', 'private, no-store, max-age=0');
      rawRes.setHeader('Vary', 'Cookie');
      rawRes.setHeader('X-Content-Type-Options', 'nosniff');
      rawRes.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      rawRes.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
      rawRes.statusCode = 200;
      rawRes.end(fileOut.bytes);
      return;
    } catch (err) {
      return sendExplorationError(dbAdapter, req, sendJson, err, {
        featureKey: 'private_photos',
        operationName: 'GET /api/me/photos/file',
        routeTemplate: '/api/me/photos/file',
        method,
        userId
      });
    }
  }

  if (pathname === '/api/me/photos/delete') {
    if (method !== 'POST') {
      return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'POST' });
    }
    try {
      const flags = await resolveCallerExplorationFeatureFlags(dbAdapter, req, verifiedUser);
      const out = await deleteUserPhoto(dbAdapter, {
        userId,
        photoId: body?.photo_id,
        storageRoot: resolvePhotoStorageRoot(),
        showAchievements: flags.showAchievements,
        showWeeklyChallenge: flags.showWeeklyChallenge,
        featureStates: flags.featureStates
      });
      return sendJson(200, out);
    } catch (err) {
      return sendExplorationError(dbAdapter, req, sendJson, err, {
        featureKey: 'private_photos',
        operationName: 'POST /api/me/photos/delete',
        routeTemplate: '/api/me/photos/delete',
        method,
        userId
      });
    }
  }

  // =========================================================================
  // 8. Saved Suggested Trails (`GET / POST /api/me/trails`, `POST /api/me/trails/delete`)
  // =========================================================================
  if (pathname === '/api/me/trails') {
    if (method === 'GET') {
      try {
        const out = await listUserSavedTrails(dbAdapter, {
          userId,
          limit: query.limit,
          offset: query.offset
        });
        return sendJson(200, out);
      } catch (err) {
        return sendExplorationError(dbAdapter, req, sendJson, err, {
          featureKey: 'suggested_trails',
          operationName: 'GET /api/me/trails',
          routeTemplate: '/api/me/trails',
          method,
          userId
        });
      }
    }

    if (method === 'POST') {
      try {
        const out = await saveUserTrail(dbAdapter, {
          userId,
          title: body?.title ?? '',
          themeKey: body?.theme_key || 'mix',
          townFilter: body?.town_filter || null,
          stops: body?.stops || [],
          idempotencyKey: body?.idempotency_key || null
        });
        return sendJson(out.created ? 201 : 200, out);
      } catch (err) {
        return sendExplorationError(dbAdapter, req, sendJson, err, {
          featureKey: 'suggested_trails',
          operationName: 'POST /api/me/trails',
          routeTemplate: '/api/me/trails',
          method,
          userId
        });
      }
    }

    return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'GET, POST' });
  }

  if (pathname === '/api/me/trails/delete') {
    if (method !== 'POST') {
      return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'POST' });
    }
    try {
      const out = await deleteUserSavedTrail(dbAdapter, {
        userId,
        trailId: body?.trail_id
      });
      return sendJson(200, out);
    } catch (err) {
      return sendExplorationError(dbAdapter, req, sendJson, err, {
        featureKey: 'suggested_trails',
        operationName: 'POST /api/me/trails/delete',
        routeTemplate: '/api/me/trails/delete',
        method,
        userId
      });
    }
  }

  return sendJson(404, { error: 'Not found' });
}
