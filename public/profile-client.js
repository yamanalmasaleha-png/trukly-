// BiteShark Private Customer Profile, Greatest Hits Collections & Unlisted Sharing Client
// (`public/profile-client.js` -> `window.bitesharkProfile`)
//
// Invariants:
//   - Account-scoped in-memory cache (`memState.userId`); purged immediately on sign-out or account switch.
//   - Zero persistent `localStorage` or `IndexedDB` storage of private profile, collections, or tokens.
//   - Uses `window.bitesharkDiagnostics.fetchJsonBounded` for bounded timeouts, correlation IDs,
//     and release-skew observation.

(function () {
  'use strict';

  var memState = {
    userId: null,
    profileData: null
  };

  function diag() {
    return (typeof window !== 'undefined' && window.bitesharkDiagnostics) || null;
  }

  function clearMemoryCache(opts) {
    var keepUser = Boolean(opts && opts.preserveUserId);
    memState.profileData = null;
    if (!keepUser) {
      memState.userId = null;
    }
  }

  function syncActiveUserScope(userObj) {
    var nextId = userObj && userObj.id ? String(userObj.id) : null;
    if (memState.userId === nextId) {
      return false;
    }
    clearMemoryCache();
    memState.userId = nextId;
    return true;
  }

  async function requestJson(url, opts) {
    var options = opts || {};
    var method = String(options.method || 'GET').toUpperCase();
    var d = diag();
    if (d && typeof d.fetchJsonBounded === 'function') {
      var res = await d.fetchJsonBounded(url, {
        method: method,
        body: options.body,
        timeoutMs: method === 'GET' ? 10000 : 12000,
        featureKey: options.featureKey || 'customer_profile',
        operationName: options.operationName || method.toLowerCase() + '_profile_api'
      });
      if (res.ok && res.data && res.data.ok !== false) {
        return res.data;
      }
      var err = new Error(
        (res.data && res.data.error) || res.errorMessage || 'Could not complete request right now.'
      );
      err.status = res.status || 0;
      err.code = (res.data && res.data.code) || res.outcome || 'REQUEST_FAILED';
      err.details = (res.data && res.data.details) || null;
      err.retryable = Boolean(res.retryable || (res.data && res.data.retryable));
      err.correlationId = (res.data && res.data.correlation_id) || res.correlationId || null;
      err.uncertainWrite = Boolean(res.uncertainWrite);
      throw err;
    }

    var fetchOpts = {
      method: method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    };
    if (options.body !== undefined) {
      fetchOpts.headers['Content-Type'] = 'application/json';
      fetchOpts.body = JSON.stringify(options.body);
    }
    var raw = await window.fetch(url, fetchOpts);
    var parsed = await raw.json().catch(function () {
      return null;
    });
    if (raw.ok && parsed && parsed.ok !== false) {
      return parsed;
    }
    var fallbackErr = new Error((parsed && parsed.error) || 'Request failed.');
    fallbackErr.status = raw.status;
    fallbackErr.code = (parsed && parsed.code) || 'REQUEST_FAILED';
    fallbackErr.details = (parsed && parsed.details) || null;
    fallbackErr.retryable = raw.status >= 500;
    fallbackErr.correlationId = (parsed && parsed.correlation_id) || raw.headers.get('x-correlation-id');
    throw fallbackErr;
  }

  async function getProfile(opts) {
    var options = opts || {};
    if (!options.force && memState.profileData) {
      return memState.profileData;
    }
    var data = await requestJson('/api/me/profile', {
      method: 'GET',
      featureKey: 'customer_profile',
      operationName: 'load_private_profile'
    });
    memState.profileData = data;
    return data;
  }

  async function updateProfile(payload) {
    var data = await requestJson('/api/me/profile', {
      method: 'POST',
      body: payload || {},
      featureKey: 'customer_profile',
      operationName: 'update_private_profile'
    });
    memState.profileData = data;
    return data;
  }

  async function updatePreferences(payload) {
    var data = await requestJson('/api/me/preferences', {
      method: 'POST',
      body: payload || {},
      featureKey: 'customer_profile',
      operationName: 'update_customer_preferences'
    });
    memState.profileData = data;
    return data;
  }

  async function exportPrivacyArchive() {
    return requestJson('/api/me/profile/privacy', {
      method: 'GET',
      featureKey: 'customer_profile',
      operationName: 'export_profile_privacy_archive'
    });
  }

  async function deleteProfileAndCollectionsData(payload) {
    var out = await requestJson('/api/me/profile/delete-data', {
      method: 'POST',
      body: payload || {},
      featureKey: 'customer_profile',
      operationName: 'delete_profile_collections_data'
    });
    clearMemoryCache({ preserveUserId: true });
    return out;
  }

  async function listCollections() {
    return requestJson('/api/me/collections', {
      method: 'GET',
      featureKey: 'greatest_hits_collections',
      operationName: 'list_collections'
    });
  }

  async function getCollectionDetail(collectionId) {
    return requestJson(
      '/api/me/collections/detail?id=' + encodeURIComponent(String(collectionId || '')),
      {
        method: 'GET',
        featureKey: 'greatest_hits_collections',
        operationName: 'get_collection_detail'
      }
    );
  }

  async function createCollection(payload) {
    var d = diag();
    var body = Object.assign({}, payload || {});
    if (!body.idempotency_key && d && typeof d.createIdempotencyKey === 'function') {
      body.idempotency_key = d.createIdempotencyKey('col');
    }
    var out = await requestJson('/api/me/collections', {
      method: 'POST',
      body: body,
      featureKey: 'greatest_hits_collections',
      operationName: 'create_collection'
    });
    clearMemoryCache({ preserveUserId: true });
    return out;
  }

  async function updateCollection(payload) {
    var out = await requestJson('/api/me/collections/update', {
      method: 'POST',
      body: payload || {},
      featureKey: 'greatest_hits_collections',
      operationName: 'update_collection'
    });
    clearMemoryCache({ preserveUserId: true });
    return out;
  }

  async function deleteCollection(collectionId) {
    var out = await requestJson('/api/me/collections/delete', {
      method: 'POST',
      body: { collection_id: String(collectionId || '') },
      featureKey: 'greatest_hits_collections',
      operationName: 'delete_collection'
    });
    clearMemoryCache({ preserveUserId: true });
    return out;
  }

  async function previewSharedCollection(payload) {
    return requestJson('/api/me/collections/preview', {
      method: 'POST',
      body: payload || {},
      featureKey: 'greatest_hits_collections',
      operationName: 'preview_shared_collection'
    });
  }

  async function attachCollectionPhoto(payload) {
    var out = await requestJson('/api/me/collections/attach-photo', {
      method: 'POST',
      body: payload || {},
      featureKey: 'greatest_hits_collections',
      operationName: 'attach_collection_photo'
    });
    clearMemoryCache({ preserveUserId: true });
    return out;
  }

  async function removeCollectionPhoto(payload) {
    var out = await requestJson('/api/me/collections/remove-photo', {
      method: 'POST',
      body: payload || {},
      featureKey: 'greatest_hits_collections',
      operationName: 'remove_collection_photo'
    });
    clearMemoryCache({ preserveUserId: true });
    return out;
  }

  async function submitSharingEligibility(payload) {
    var out = await requestJson('/api/me/sharing-eligibility', {
      method: 'POST',
      body: payload || {},
      featureKey: 'unlisted_sharing',
      operationName: 'submit_sharing_eligibility'
    });
    clearMemoryCache({ preserveUserId: true });
    return out;
  }

  async function listShares(collectionId) {
    var q = collectionId ? '?collection_id=' + encodeURIComponent(String(collectionId)) : '';
    return requestJson('/api/me/shares' + q, {
      method: 'GET',
      featureKey: 'unlisted_sharing',
      operationName: 'list_shares'
    });
  }

  async function createShare(payload) {
    var d = diag();
    var body = Object.assign({}, payload || {});
    if (!body.idempotency_key && d && typeof d.createIdempotencyKey === 'function') {
      body.idempotency_key = d.createIdempotencyKey('shr');
    }
    var out = await requestJson('/api/me/shares/create', {
      method: 'POST',
      body: body,
      featureKey: 'unlisted_sharing',
      operationName: 'create_share_link'
    });
    clearMemoryCache({ preserveUserId: true });
    return out;
  }

  async function updateShareSettings(payload) {
    var out = await requestJson('/api/me/shares/update-settings', {
      method: 'POST',
      body: payload || {},
      featureKey: 'unlisted_sharing',
      operationName: 'update_share_settings'
    });
    clearMemoryCache({ preserveUserId: true });
    return out;
  }

  async function rotateShare(payload) {
    var out = await requestJson('/api/me/shares/rotate', {
      method: 'POST',
      body: payload || {},
      featureKey: 'unlisted_sharing',
      operationName: 'rotate_share_link'
    });
    clearMemoryCache({ preserveUserId: true });
    return out;
  }

  async function revokeShare(shareId, reason) {
    var out = await requestJson('/api/me/shares/revoke', {
      method: 'POST',
      body: {
        share_id: String(shareId || ''),
        ...(reason ? { reason: String(reason) } : {})
      },
      featureKey: 'unlisted_sharing',
      operationName: 'revoke_share_link'
    });
    clearMemoryCache({ preserveUserId: true });
    return out;
  }

  var api = Object.freeze({
    clearMemoryCache: clearMemoryCache,
    syncActiveUserScope: syncActiveUserScope,
    getProfile: getProfile,
    updateProfile: updateProfile,
    updatePreferences: updatePreferences,
    exportPrivacyArchive: exportPrivacyArchive,
    deleteProfileAndCollectionsData: deleteProfileAndCollectionsData,
    listCollections: listCollections,
    getCollectionDetail: getCollectionDetail,
    createCollection: createCollection,
    updateCollection: updateCollection,
    deleteCollection: deleteCollection,
    previewSharedCollection: previewSharedCollection,
    attachCollectionPhoto: attachCollectionPhoto,
    removeCollectionPhoto: removeCollectionPhoto,
    submitSharingEligibility: submitSharingEligibility,
    listShares: listShares,
    createShare: createShare,
    updateShareSettings: updateShareSettings,
    rotateShare: rotateShare,
    revokeShare: revokeShare
  });

  if (typeof window !== 'undefined') {
    window.bitesharkProfile = api;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.bitesharkProfile = api;
  }
})();
