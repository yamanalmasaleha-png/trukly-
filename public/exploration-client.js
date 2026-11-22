/* BiteShark Shared Account-Backed Exploration Client, Editorial Story Registry & Legacy Migrator
 * (`public/exploration-client.js`)
 *
 * Exposes `window.bitesharkExploration` as a DOM-independent data & artwork service so current
 * screens (Local Guides, Visit Journal, Private Photos, Suggested Trails, Detail Modal, Street
 * Whispers) and future Profile pages consume identical server contracts and stable IDs.
 */
(function () {
  'use strict';

  var LEGACY_PASSPORT_STORAGE_KEY = 'truckly_guide_passport_v1';
  var LEGACY_NOTEBOOK_DB_NAME = 'truckly-dish-notebook-v1';
  var LEGACY_NOTEBOOK_STORES = ['photos', 'dishes'];

  var CANONICAL_STORIES = Object.freeze([
    Object.freeze({
      story_id: 'story_retrograde_roast',
      vendor_id: 'coffee-retrograde',
      vendor_name: 'Retrograde Coffee Roasters',
      town: 'Sebastopol',
      tag: 'THE COFFEE CRAFT',
      title: 'Follow the roast, not the rush.',
      summary:
        'Retrograde began in 2014 with home roasting and a farmers-market coffee cart before opening its Sebastopol café, pairing in-house roasts with prepared food and patio seating.',
      detail_cue: 'Look beyond the cup: small-batch roasting is part of this stop’s everyday rhythm.',
      cta_label: 'View Retrograde details',
      source_url: 'https://retrograderoasters.com/pages/visit',
      source_label: 'Retrograde Coffee Roasters visit page',
      corroborating_url: 'https://retrograderoasters.com/pages/about',
      media_kind: 'illustration',
      photo_url: null,
      illustration_key: 'roaster_coffee',
      width: 640,
      height: 360,
      alt_text: 'Editorial illustration of a small-batch coffee roaster drum and pour-over cup in warm Sebastopol tones',
      attribution: 'BiteShark editorial illustration · not a photograph of the café or drinks',
      business_available: true,
      clue: Object.freeze({
        icon: '☕',
        kicker: 'ORIGIN FILE',
        headline: 'The café that started on wheels',
        question: 'This Sebastopol café began in 2014 with home roasting and a farmers-market coffee cart. Which local stop?',
        fact: 'Retrograde describes starting in 2014 roasting out of a home kitchen and taking a coffee cart to farmers markets before opening in Sebastopol.'
      })
    }),
    Object.freeze({
      story_id: 'story_oakhill_red_barn',
      vendor_id: 'farm-oakhill',
      vendor_name: 'Oak Hill Farm — Red Barn Store',
      town: 'Glen Ellen',
      tag: 'FIELD TO TOTE',
      title: 'A grocery run with barn character.',
      summary:
        'The Red Barn Store sits inside a roughly century-old barn at Oak Hill Farm in Glen Ellen, where seasonal farm harvests share shelves with honey, pantry staples, and goods from regional makers.',
      detail_cue: 'Check seasonal barn hours before heading up Sonoma Valley.',
      cta_label: 'View Red Barn Store details',
      source_url: 'https://www.oakhillfarm.net/the-red-barn-store',
      source_label: 'Oak Hill Farm Red Barn Store page',
      corroborating_url: null,
      media_kind: 'illustration',
      photo_url: null,
      illustration_key: 'red_barn_harvest',
      width: 640,
      height: 360,
      alt_text: 'Editorial illustration of a red timber barn beside harvest crates of Sonoma Valley produce and honey jars',
      attribution: 'BiteShark editorial illustration · not a photograph of the barn or farm stand',
      business_available: true,
      clue: Object.freeze({
        icon: '🧺',
        kicker: 'TUCKED-AWAY FIND',
        headline: 'The barn with a pantry shelf',
        question: 'Seasonal farm produce, honey, and regional pantry goods inside a century-old Glen Ellen barn. Where is it?',
        fact: 'Oak Hill Farm describes its Red Barn Store inside a roughly 100-year-old barn stocking seasonal produce and locally sourced pantry items.'
      })
    }),
    Object.freeze({
      story_id: 'story_mitote_food_park',
      vendor_id: 'mitote',
      vendor_name: 'Mitote Food Park',
      town: 'Santa Rosa',
      tag: 'THE GATHERING SPOT',
      title: 'One stop. A whole food-park mood.',
      summary:
        'Mitote Food Park brings multiple rotating food trucks together around shared outdoor tables at 100 Sebastopol Rd in Roseland—making it easy for a group to order from different kitchens.',
      detail_cue: 'Individual truck lineups and hours vary; confirm current vendors before visiting.',
      cta_label: 'View Mitote Food Park details',
      source_url: 'https://www.mitotefoodpark.com/',
      source_label: 'Mitote Food Park official site',
      corroborating_url: 'https://www.sonomamag.com/mitote-food-park-soft-opens-at-new-location/',
      media_kind: 'illustration',
      photo_url: null,
      illustration_key: 'food_park_gathering',
      width: 640,
      height: 360,
      alt_text: 'Editorial illustration of colorful food trucks gathered around string lights and communal picnic tables',
      attribution: 'BiteShark editorial illustration · not a photograph of the food park',
      business_available: true,
      clue: Object.freeze({
        icon: '🎉',
        kicker: 'SHARED TABLES',
        headline: 'Multiple kitchens, one courtyard',
        question: 'This Santa Rosa food park reopened at 100 Sebastopol Rd with rotating trucks and communal outdoor seating. Which venue?',
        fact: 'Mitote Food Park relocated to 100 Sebastopol Rd in Santa Rosa with rotating food trucks and shared outdoor seating.'
      })
    }),
    Object.freeze({
      story_id: 'story_crooks_creme_brulee',
      vendor_id: 'coffee-crooks',
      vendor_name: 'Crooks Coffee',
      town: 'Santa Rosa',
      tag: 'THE MENU DETAIL',
      title: 'A latte with a dessert plot twist.',
      summary:
        'Crooks Coffee’s published menu highlights specialty drinks including a crème brûlée latte, Mexican mocha, and café con miele—proof that one distinctive menu detail can define a neighborhood stop.',
      detail_cue: 'Menu offerings can change seasonally; check current drink availability.',
      cta_label: 'View Crooks Coffee details',
      source_url: 'https://shadyraveninc.com/menu',
      source_label: 'Crooks Coffee published menu',
      corroborating_url: null,
      media_kind: 'illustration',
      photo_url: null,
      illustration_key: 'creme_brulee_latte',
      width: 640,
      height: 360,
      alt_text: 'Editorial illustration of a caramelized espresso latte cup with cinnamon and cocoa accents',
      attribution: 'BiteShark editorial illustration · not a photograph of the drink',
      business_available: true,
      clue: Object.freeze({
        icon: '🍮',
        kicker: 'ON THE MENU',
        headline: 'A latte wearing dessert clothes',
        question: 'Which Santa Rosa café menu lists a crème brûlée latte, Mexican mocha, and café con miele?',
        fact: 'Crooks Coffee lists a crème brûlée latte, Mexican mocha, and café con miele on its published menu.'
      })
    }),
    Object.freeze({
      story_id: 'story_avid_petaluma_roots',
      vendor_id: 'coffee-avid-petaluma',
      vendor_name: 'Avid Coffee — Downtown Petaluma',
      town: 'Petaluma',
      tag: 'LOCAL COFFEE ROOTS',
      title: 'A downtown coffee stop with Sonoma roots.',
      summary:
        'Founded in Petaluma in 2011 (originally as Acre Coffee before adopting the Avid name in 2021), Avid anchors a walkable downtown Petaluma stop for espresso and pastries.',
      detail_cue: 'Pair a morning coffee stop with nearby Petaluma market or riverfront browsing.',
      cta_label: 'View Avid Petaluma details',
      source_url: 'https://avidcoffee.com/pages/locations',
      source_label: 'Avid Coffee locations & history',
      corroborating_url: 'https://avidcoffee.com/pages/learn',
      media_kind: 'illustration',
      photo_url: null,
      illustration_key: 'neighborhood_espresso',
      width: 640,
      height: 360,
      alt_text: 'Editorial illustration of an espresso portafilter, coffee beans, and historic downtown Petaluma storefront awning',
      attribution: 'BiteShark editorial illustration · not a photograph of the café',
      business_available: true,
      clue: Object.freeze({
        icon: '🫘',
        kicker: 'LOCAL ORIGIN STORY',
        headline: 'The coffee shop with a past name',
        question: 'This Sonoma County coffee roaster began in Petaluma in 2011 under a different name before becoming Avid in 2021. Which stop?',
        fact: 'Avid states it began as Acre Coffee in Petaluma in 2011 and adopted the Avid Coffee name in 2021.'
      })
    })
  ]);

  function escHtml(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function renderEditorialIllustrationSvg(key, altText) {
    var safeAlt = escHtml(altText || 'BiteShark editorial illustration');
    var scenes = {
      roaster_coffee:
        '<rect width="640" height="360" fill="#f3ead8"/>' +
        '<circle cx="520" cy="84" r="68" fill="#e6cfa8" opacity="0.7"/>' +
        '<rect x="64" y="250" width="512" height="14" rx="7" fill="#214b3b" opacity="0.18"/>' +
        '<rect x="130" y="122" width="168" height="128" rx="22" fill="#214b3b"/>' +
        '<circle cx="214" cy="186" r="42" fill="#f3c35c"/>' +
        '<circle cx="214" cy="186" r="18" fill="#214b3b"/>' +
        '<path d="M180 122V86h68v36" fill="#c96a4a"/>' +
        '<rect x="356" y="158" width="122" height="92" rx="18" fill="#fff9ee" stroke="#214b3b" stroke-width="6"/>' +
        '<path d="M478 176h22c18 0 26 14 26 26s-8 26-26 26h-22" fill="none" stroke="#214b3b" stroke-width="6"/>' +
        '<path d="M392 140c-6-16 8-24 2-40M422 140c-6-16 8-24 2-40M452 140c-6-16 8-24 2-40" fill="none" stroke="#c96a4a" stroke-width="5" stroke-linecap="round"/>',

      red_barn_harvest:
        '<rect width="640" height="360" fill="#eef1df"/>' +
        '<circle cx="116" cy="86" r="48" fill="#f5cf76" opacity="0.8"/>' +
        '<path d="M60 272h520" stroke="#214b3b" stroke-width="6" stroke-linecap="round"/>' +
        '<polygon points="140,152 256,82 372,152 372,270 140,270" fill="#bf543c" stroke="#214b3b" stroke-width="6" stroke-linejoin="round"/>' +
        '<rect x="216" y="182" width="80" height="88" fill="#fff7e8" stroke="#214b3b" stroke-width="5"/>' +
        '<path d="M216 182l80 88M296 182l-80 88" stroke="#214b3b" stroke-width="4"/>' +
        '<rect x="404" y="198" width="132" height="72" rx="10" fill="#e9c176" stroke="#214b3b" stroke-width="5"/>' +
        '<circle cx="436" cy="186" r="18" fill="#d96b43"/><circle cx="472" cy="182" r="20" fill="#6ca166"/><circle cx="506" cy="188" r="16" fill="#f3c35c"/>',

      food_park_gathering:
        '<rect width="640" height="360" fill="#f6efe0"/>' +
        '<path d="M80 74Q320 124 560 74" fill="none" stroke="#214b3b" stroke-width="4" stroke-dasharray="6 8"/>' +
        '<circle cx="160" cy="88" r="9" fill="#f3c35c"/><circle cx="266" cy="98" r="9" fill="#e07a5f"/><circle cx="374" cy="98" r="9" fill="#f3c35c"/><circle cx="480" cy="88" r="9" fill="#81b29a"/>' +
        '<rect x="86" y="148" width="196" height="106" rx="16" fill="#214b3b"/>' +
        '<rect x="108" y="168" width="96" height="46" rx="8" fill="#fff8ea"/>' +
        '<path d="M282 184h44l20 34v36h-64z" fill="#f3c35c" stroke="#214b3b" stroke-width="5" stroke-linejoin="round"/>' +
        '<circle cx="136" cy="258" r="20" fill="#374151"/><circle cx="298" cy="258" r="20" fill="#374151"/>' +
        '<rect x="394" y="206" width="156" height="16" rx="6" fill="#c96a4a"/>' +
        '<path d="M420 222l-16 48M524 222l16 48M380 246h184" stroke="#214b3b" stroke-width="6" stroke-linecap="round"/>',

      creme_brulee_latte:
        '<rect width="640" height="360" fill="#f7eedc"/>' +
        '<ellipse cx="320" cy="274" rx="168" ry="26" fill="#e4cda3"/>' +
        '<path d="M206 144h212v82c0 46-42 74-106 74s-106-28-106-74z" fill="#fffaf0" stroke="#214b3b" stroke-width="6"/>' +
        '<ellipse cx="312" cy="144" rx="106" ry="24" fill="#df9a4f" stroke="#214b3b" stroke-width="6"/>' +
        '<path d="M418 166h28c24 0 36 16 36 34s-12 34-36 34h-28" fill="none" stroke="#214b3b" stroke-width="6"/>' +
        '<path d="M276 108c-8-18 10-28 2-44M316 102c-8-18 10-28 2-44M356 108c-8-18 10-28 2-44" fill="none" stroke="#bf543c" stroke-width="5" stroke-linecap="round"/>',

      neighborhood_espresso:
        '<rect width="640" height="360" fill="#ecefe2"/>' +
        '<rect x="112" y="88" width="416" height="192" rx="18" fill="#fff9ee" stroke="#214b3b" stroke-width="6"/>' +
        '<path d="M98 88h444l-22 48H120z" fill="#214b3b"/>' +
        '<path d="M148 136v14M224 136v14M300 136v14M376 136v14M452 136v14" stroke="#f3c35c" stroke-width="8" stroke-linecap="round"/>' +
        '<rect x="172" y="172" width="144" height="108" rx="8" fill="#d7e4cf" stroke="#214b3b" stroke-width="5"/>' +
        '<rect x="358" y="172" width="118" height="72" rx="8" fill="#f3c35c" stroke="#214b3b" stroke-width="5"/>'
    };
    var art = scenes[key] || scenes.roaster_coffee;
    return (
      '<svg class="guide-story-svg" viewBox="0 0 640 360" width="640" height="360" role="img" aria-label="' +
      safeAlt +
      '" xmlns="http://www.w3.org/2000/svg">' +
      '<title>' +
      safeAlt +
      '</title>' +
      art +
      '</svg>'
    );
  }

  // Account-scoped in-memory cache (strictly cleared on sign-out or user switch!)
  var memState = {
    userId: null,
    summary: null,
    stories: null,
    legacyDismissedForSession: false
  };

  function clearMemoryCache(opts) {
    if (!opts || !opts.preserveUserId) {
      memState.userId = null;
    }
    memState.summary = null;
    memState.legacyDismissedForSession = false;
  }

  function syncActiveUserScope(userObj) {
    var nextId = userObj && typeof userObj.id === 'string' ? userObj.id : null;
    var changed = memState.userId !== nextId;
    if (changed) {
      clearMemoryCache();
      memState.userId = nextId;
    }
    return changed;
  }

  function getDiag() {
    return typeof window !== 'undefined' && window.bitesharkDiagnostics ? window.bitesharkDiagnostics : null;
  }

  function createIdempKey(prefix) {
    var d = getDiag();
    if (d && typeof d.createIdempotencyKey === 'function') {
      return d.createIdempotencyKey(prefix || 'exp');
    }
    var rand = Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
    return (prefix || 'exp') + '_' + rand;
  }

  async function apiRequest(url, opts) {
    var options = opts || {};
    var method = String(options.method || 'GET').toUpperCase();
    var d = getDiag();
    var corrId = d && typeof d.generateClientRef === 'function' ? d.generateClientRef() : null;
    var headers = Object.assign(
      {
        Accept: 'application/json',
        'X-BiteShark-Client-Build': d && d.CLIENT_BUNDLE_VERSION ? d.CLIENT_BUNDLE_VERSION : 'bs-ui-2026.11.20'
      },
      options.headers || {}
    );
    if (corrId) {
      headers['X-Correlation-Id'] = corrId;
    }
    if (typeof window !== 'undefined' && typeof window.bitesharkGetViewpointHeaders === 'function') {
      Object.assign(headers, window.bitesharkGetViewpointHeaders() || {});
    }

    var fetchInit = {
      method: method,
      credentials: 'same-origin',
      headers: headers
    };
    if (method !== 'GET' && method !== 'HEAD') {
      headers['Content-Type'] = 'application/json';
      fetchInit.body = JSON.stringify(options.body || {});
    }

    var res;
    try {
      res = await fetch(url, fetchInit);
    } catch (netErr) {
      var offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      var err = new Error(
        offline
          ? 'You appear to be offline. Reconnect and try again.'
          : 'Could not reach BiteShark right now. Check your connection and retry.'
      );
      err.code = offline ? 'CLIENT_OFFLINE' : 'NETWORK_UNREACHABLE';
      err.retryable = true;
      err.correlationId = corrId;
      if (d && typeof d.reportClientDiagnostic === 'function' && options.featureKey) {
        d.reportClientDiagnostic({
          featureKey: options.featureKey,
          operationName: options.operationName || method + ' ' + url,
          routeTemplate: options.routeTemplate || url.split('?')[0],
          errorCode: err.code,
          severity: 'warning',
          message: err.message,
          correlationId: corrId,
          retryable: true,
          outcomeState: 'temporarily_unavailable',
          safeContext: { is_offline: Boolean(offline) }
        });
      }
      throw err;
    }

    var respCorr = res.headers.get('x-correlation-id') || corrId;
    var data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }

    if (!res.ok) {
      var code = (data && data.code) || 'HTTP_' + res.status;
      var msg =
        (data && data.error) ||
        (res.status === 401
          ? 'Your session has expired. Please sign in again to continue.'
          : res.status === 413
            ? 'That upload is larger than the 5 MB limit. Choose a smaller photo.'
            : 'BiteShark could not complete that action right now.');
      var apiErr = new Error(msg);
      apiErr.status = res.status;
      apiErr.code = code;
      apiErr.correlationId = (data && data.correlation_id) || respCorr || null;
      apiErr.retryable = Boolean((data && data.retryable) || res.status === 502 || res.status === 503 || res.status === 504);
      apiErr.payload = data;
      throw apiErr;
    }

    return data;
  }

  async function fetchStories() {
    try {
      var out = await apiRequest('/api/stories', {
        method: 'GET',
        featureKey: 'editorial_stories',
        operationName: 'stories.list',
        routeTemplate: '/api/stories'
      });
      if (out && Array.isArray(out.stories)) {
        memState.stories = out.stories;
        return out.stories;
      }
    } catch (err) {
      if (err && err.code === 'FEATURE_DISABLED') throw err;
    }
    return memState.stories || CANONICAL_STORIES.slice();
  }

  async function getSummary(opts) {
    var options = opts || {};
    var currentUid =
      typeof currentUser !== 'undefined' && currentUser && currentUser.id ? currentUser.id : null;
    syncActiveUserScope(currentUser);
    if (!currentUid) {
      return null;
    }
    if (!options.force && memState.summary && memState.summary.user_id === currentUid) {
      return memState.summary;
    }
    var summary = await apiRequest('/api/me/exploration', {
      method: 'GET',
      featureKey: 'visit_journal',
      operationName: 'exploration.summary',
      routeTemplate: '/api/me/exploration'
    });
    if (summary && summary.user_id) {
      memState.userId = summary.user_id;
      memState.summary = summary;
    }
    return summary;
  }

  async function listVisits(opts) {
    var o = opts || {};
    var q = new URLSearchParams();
    if (o.limit) q.set('limit', String(o.limit));
    if (o.offset) q.set('offset', String(o.offset));
    if (o.vendorId) q.set('vendor_id', String(o.vendorId));
    var qs = q.toString();
    return apiRequest('/api/me/visits' + (qs ? '?' + qs : ''), {
      method: 'GET',
      featureKey: 'visit_journal',
      operationName: 'visits.list',
      routeTemplate: '/api/me/visits'
    });
  }

  async function logVisit(opts) {
    var o = opts || {};
    var out = await apiRequest('/api/me/visits', {
      method: 'POST',
      featureKey: 'visit_journal',
      operationName: 'visits.create',
      routeTemplate: '/api/me/visits',
      body: {
        vendor_id: o.vendorId,
        private_note: o.privateNote || '',
        entry_source: o.entrySource || 'manual',
        idempotency_key: o.idempotencyKey || createIdempKey('vst')
      }
    });
    if (out && out.exploration) {
      memState.summary = out.exploration;
      memState.userId = out.exploration.user_id;
    }
    return out;
  }

  async function deleteVisit(opts) {
    var o = opts || {};
    var out = await apiRequest('/api/me/visits/delete', {
      method: 'POST',
      featureKey: 'visit_journal',
      operationName: 'visits.delete',
      routeTemplate: '/api/me/visits/delete',
      body: { visit_id: o.visitId }
    });
    if (out && out.exploration) {
      memState.summary = out.exploration;
    }
    return out;
  }

  function readBlobAsBase64(blob, onProgress) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onprogress = function (ev) {
        if (ev.lengthComputable && typeof onProgress === 'function') {
          onProgress(Math.min(65, Math.round((ev.loaded / Math.max(1, ev.total)) * 65)));
        }
      };
      reader.onload = function () {
        var result = String(reader.result || '');
        var comma = result.indexOf(',');
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.onerror = function () {
        reject(new Error('Could not read the selected image file on this device.'));
      };
      reader.readAsDataURL(blob);
    });
  }

  async function listPhotos(opts) {
    var o = opts || {};
    var q = new URLSearchParams();
    if (o.limit) q.set('limit', String(o.limit));
    if (o.offset) q.set('offset', String(o.offset));
    if (o.vendorId) q.set('vendor_id', String(o.vendorId));
    var qs = q.toString();
    return apiRequest('/api/me/photos' + (qs ? '?' + qs : ''), {
      method: 'GET',
      featureKey: 'private_photos',
      operationName: 'photos.list',
      routeTemplate: '/api/me/photos'
    });
  }

  async function uploadPhoto(opts) {
    var o = opts || {};
    var file = o.file;
    if (!file) {
      throw new Error('Choose a JPEG, PNG, or WebP photo to upload.');
    }
    if (file.size > 5 * 1024 * 1024) {
      var sizeErr = new Error('Choose a photo smaller than 5 MB.');
      sizeErr.code = 'PHOTO_TOO_LARGE';
      throw sizeErr;
    }
    if (typeof o.onProgress === 'function') o.onProgress(10);
    var b64 = await readBlobAsBase64(file, o.onProgress);
    if (typeof o.onProgress === 'function') o.onProgress(75);
    var out = await apiRequest('/api/me/photos', {
      method: 'POST',
      featureKey: 'private_photos',
      operationName: 'photos.upload',
      routeTemplate: '/api/me/photos',
      body: {
        vendor_id: o.vendorId || null,
        caption: o.caption || '',
        mime_type: file.type || '',
        data_base64: b64,
        entry_source: o.entrySource || 'manual',
        taken_at: o.takenAt || null,
        idempotency_key: o.idempotencyKey || createIdempKey('pht')
      }
    });
    if (typeof o.onProgress === 'function') o.onProgress(100);
    if (out && out.exploration) {
      memState.summary = out.exploration;
      memState.userId = out.exploration.user_id;
    }
    return out;
  }

  async function deletePhoto(opts) {
    var o = opts || {};
    var out = await apiRequest('/api/me/photos/delete', {
      method: 'POST',
      featureKey: 'private_photos',
      operationName: 'photos.delete',
      routeTemplate: '/api/me/photos/delete',
      body: { photo_id: o.photoId }
    });
    if (out && out.exploration) {
      memState.summary = out.exploration;
    }
    return out;
  }

  async function fetchSuggestedTrail(opts) {
    var o = opts || {};
    var q = new URLSearchParams();
    if (Array.isArray(o.ids) && o.ids.length > 0) {
      q.set('ids', o.ids.join(','));
    } else {
      if (o.theme) q.set('theme', String(o.theme));
      if (o.town) q.set('town', String(o.town));
      if (o.offset) q.set('offset', String(o.offset));
    }
    return apiRequest('/api/trails/suggest?' + q.toString(), {
      method: 'GET',
      featureKey: 'suggested_trails',
      operationName: 'trails.suggest',
      routeTemplate: '/api/trails/suggest'
    });
  }

  async function listSavedTrails(opts) {
    var o = opts || {};
    var q = new URLSearchParams();
    if (o.limit) q.set('limit', String(o.limit));
    if (o.offset) q.set('offset', String(o.offset));
    var qs = q.toString();
    return apiRequest('/api/me/trails' + (qs ? '?' + qs : ''), {
      method: 'GET',
      featureKey: 'suggested_trails',
      operationName: 'trails.list',
      routeTemplate: '/api/me/trails'
    });
  }

  async function saveTrail(opts) {
    var o = opts || {};
    var out = await apiRequest('/api/me/trails', {
      method: 'POST',
      featureKey: 'suggested_trails',
      operationName: 'trails.save',
      routeTemplate: '/api/me/trails',
      body: {
        title: o.title || '',
        theme_key: o.themeKey || 'mix',
        town_filter: o.townFilter || null,
        stops: o.stops || [],
        idempotency_key: o.idempotencyKey || createIdempKey('trl')
      }
    });
    memState.summary = null;
    return out;
  }

  async function deleteSavedTrail(opts) {
    var o = opts || {};
    var out = await apiRequest('/api/me/trails/delete', {
      method: 'POST',
      featureKey: 'suggested_trails',
      operationName: 'trails.delete',
      routeTemplate: '/api/me/trails/delete',
      body: { trail_id: o.trailId }
    });
    memState.summary = null;
    return out;
  }

  async function exportAccountData() {
    return apiRequest('/api/me/exploration/export', {
      method: 'GET',
      featureKey: 'visit_journal',
      operationName: 'exploration.export',
      routeTemplate: '/api/me/exploration/export'
    });
  }

  // =========================================================================
  // Careful Legacy Device Data Inspection, Confirmed Import & Discard
  // =========================================================================
  function readLegacyVisitsFromLocalStorage() {
    var rawStr = null;
    try {
      rawStr = localStorage.getItem(LEGACY_PASSPORT_STORAGE_KEY);
    } catch {
      return [];
    }
    if (!rawStr) return [];
    try {
      var parsed = JSON.parse(rawStr);
      var arr = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === 'object' && Array.isArray(parsed.visits)
          ? parsed.visits
          : null;
      if (arr) {
        return arr
          .map(function (item, idx) {
            if (typeof item === 'string') {
              return { client_ref: 'ls_' + idx, id: item, note: '', at: null, raw: item };
            }
            if (item && typeof item === 'object') {
              return {
                client_ref: 'ls_' + idx,
                id: String(item.id || item.vendor_id || ''),
                name: String(item.name || item.id || ''),
                note: typeof item.note === 'string' ? item.note : typeof item.tip === 'string' ? item.tip : '',
                at: typeof item.at === 'string' ? item.at : typeof item.date === 'string' ? item.date : null,
                raw: item
              };
            }
            return null;
          })
          .filter(Boolean);
      }
      if (parsed && typeof parsed === 'object' && Array.isArray(parsed.visited)) {
        return parsed.visited.map(function (slug, idx) {
          return {
            client_ref: 'lsv_' + idx,
            id: String(slug || ''),
            name: String(slug || ''),
            note: '',
            at: null,
            raw: slug
          };
        });
      }
    } catch {}
    return [];
  }

  function writeRemainingLegacyVisits(remainingEntries) {
    try {
      if (!remainingEntries || remainingEntries.length === 0) {
        localStorage.removeItem(LEGACY_PASSPORT_STORAGE_KEY);
      } else {
        localStorage.setItem(
          LEGACY_PASSPORT_STORAGE_KEY,
          JSON.stringify(
            remainingEntries.map(function (e) {
              return e.raw || { id: e.id, name: e.name, note: e.note, at: e.at };
            })
          )
        );
      }
      return true;
    } catch {
      return false;
    }
  }

  function readLegacyPhotosFromIndexedDb() {
    return new Promise(function (resolve) {
      if (typeof indexedDB === 'undefined' || !indexedDB) {
        resolve({ available: false, photos: [] });
        return;
      }
      var req;
      try {
        // Open without forcing a schema upgrade on DBs that do not contain `photos`
        req = indexedDB.open(LEGACY_NOTEBOOK_DB_NAME);
      } catch {
        resolve({ available: false, photos: [] });
        return;
      }
      req.onupgradeneeded = function (ev) {
        // Brand-new empty DB did not exist; abort upgrade so we never create empty legacy stores!
        try {
          ev.target.transaction.abort();
        } catch {}
      };
      req.onerror = function () {
        resolve({ available: true, photos: [] });
      };
      req.onsuccess = function () {
        var db = req.result;
        var presentStores = LEGACY_NOTEBOOK_STORES.filter(function (s) {
          return db.objectStoreNames.contains(s);
        });
        if (presentStores.length === 0) {
          db.close();
          resolve({ available: true, photos: [] });
          return;
        }
        try {
          var tx = db.transaction(presentStores, 'readonly');
          var collected = [];
          var pending = presentStores.length;
          presentStores.forEach(function (storeName) {
            var getAllReq = tx.objectStore(storeName).getAll();
            getAllReq.onsuccess = function () {
              var rows = Array.isArray(getAllReq.result) ? getAllReq.result : [];
              rows.forEach(function (r) {
                collected.push(Object.assign({}, r, { __legacyStore: storeName }));
              });
              pending -= 1;
              if (pending === 0) {
                db.close();
                resolve({ available: true, photos: collected });
              }
            };
            getAllReq.onerror = function () {
              pending -= 1;
              if (pending === 0) {
                db.close();
                resolve({ available: true, photos: collected });
              }
            };
          });
        } catch {
          db.close();
          resolve({ available: true, photos: [] });
        }
      };
    });
  }

  function deleteLegacyPhotoFromIndexedDb(legacyId) {
    return new Promise(function (resolve) {
      if (typeof indexedDB === 'undefined' || !indexedDB || !legacyId) {
        resolve(false);
        return;
      }
      var req;
      try {
        req = indexedDB.open(LEGACY_NOTEBOOK_DB_NAME);
      } catch {
        resolve(false);
        return;
      }
      req.onerror = function () {
        resolve(false);
      };
      req.onsuccess = function () {
        var db = req.result;
        var presentStores = LEGACY_NOTEBOOK_STORES.filter(function (s) {
          return db.objectStoreNames.contains(s);
        });
        if (presentStores.length === 0) {
          db.close();
          resolve(false);
          return;
        }
        try {
          var tx = db.transaction(presentStores, 'readwrite');
          presentStores.forEach(function (s) {
            tx.objectStore(s).delete(legacyId);
          });
          tx.oncomplete = function () {
            db.close();
            resolve(true);
          };
          tx.onerror = function () {
            db.close();
            resolve(false);
          };
        } catch {
          db.close();
          resolve(false);
        }
      };
    });
  }

  function clearAllLegacyPhotosFromIndexedDb() {
    return new Promise(function (resolve) {
      if (typeof indexedDB === 'undefined' || !indexedDB) {
        resolve(true);
        return;
      }
      var req;
      try {
        req = indexedDB.open(LEGACY_NOTEBOOK_DB_NAME);
      } catch {
        resolve(false);
        return;
      }
      req.onupgradeneeded = function (ev) {
        try {
          ev.target.transaction.abort();
        } catch {}
      };
      req.onerror = function () {
        resolve(true);
      };
      req.onsuccess = function () {
        var db = req.result;
        var presentStores = LEGACY_NOTEBOOK_STORES.filter(function (s) {
          return db.objectStoreNames.contains(s);
        });
        if (presentStores.length === 0) {
          db.close();
          resolve(true);
          return;
        }
        try {
          var tx = db.transaction(presentStores, 'readwrite');
          presentStores.forEach(function (s) {
            tx.objectStore(s).clear();
          });
          tx.oncomplete = function () {
            db.close();
            resolve(true);
          };
          tx.onerror = function () {
            db.close();
            resolve(false);
          };
        } catch {
          db.close();
          resolve(false);
        }
      };
    });
  }

  async function inspectLegacyDeviceData() {
    var visits = readLegacyVisitsFromLocalStorage();
    var idbRes = await readLegacyPhotosFromIndexedDb();
    var photos = idbRes.photos || [];
    return {
      has_legacy_data: visits.length > 0 || photos.length > 0,
      dismissed_for_session: memState.legacyDismissedForSession,
      visit_count: visits.length,
      photo_count: photos.length,
      visits: visits,
      photos: photos
    };
  }

  function dismissLegacyOfferForSession() {
    memState.legacyDismissedForSession = true;
  }

  async function discardLegacyDeviceData() {
    writeRemainingLegacyVisits([]);
    await clearAllLegacyPhotosFromIndexedDb();
    memState.legacyDismissedForSession = true;
    return { ok: true };
  }

  async function importLegacyDeviceData(opts) {
    var options = opts || {};
    var snapshot = await inspectLegacyDeviceData();
    var report = {
      visits_imported: 0,
      visits_already_present: 0,
      visits_failed: [],
      photos_imported: 0,
      photos_already_present: 0,
      photos_failed: [],
      partial_failure: false
    };

    // 1. Import legacy visits via server validation & Pacific calendar-day mapping
    if (snapshot.visits.length > 0) {
      if (typeof options.onStatus === 'function') {
        options.onStatus('Validating and importing ' + snapshot.visits.length + ' device visit(s)…');
      }
      var visitRes = await apiRequest('/api/me/exploration/import', {
        method: 'POST',
        featureKey: 'legacy_import',
        operationName: 'legacy.importVisits',
        routeTemplate: '/api/me/exploration/import',
        body: {
          visits: snapshot.visits.map(function (v) {
            return {
              client_ref: v.client_ref,
              id: v.id,
              note: v.note,
              at: v.at
            };
          })
        }
      });

      report.visits_imported = Number(visitRes.imported_count || 0);
      report.visits_already_present = Number(visitRes.already_present_count || 0);
      report.visits_failed = Array.isArray(visitRes.invalid_entries) ? visitRes.invalid_entries : [];

      // Remove ONLY confirmed imported / already-present visits; keep failed/unmappable entries recoverable!
      var confirmedRefs = new Set();
      (visitRes.imported || []).forEach(function (x) {
        confirmedRefs.add(x.client_ref);
      });
      (visitRes.already_present || []).forEach(function (x) {
        confirmedRefs.add(x.client_ref);
      });
      var unimportedVisits = snapshot.visits.filter(function (v) {
        return !confirmedRefs.has(v.client_ref);
      });
      writeRemainingLegacyVisits(unimportedVisits);

      if (visitRes.exploration) {
        memState.summary = visitRes.exploration;
      }
    }

    // 2. Import legacy IndexedDB photos one-by-one so each <= 5 MB file gets full server validation & recovery
    for (var i = 0; i < snapshot.photos.length; i++) {
      var lp = snapshot.photos[i];
      var resolvedVendorId = lp && (lp.vendorId || lp.spotId || lp.placeId || null);
      var resolvedCaption = lp && typeof (lp.caption ?? lp.note) === 'string' ? String(lp.caption ?? lp.note) : '';
      var label = String((lp && (lp.vendorName || lp.spot || resolvedVendorId || resolvedCaption)) || 'Photo ' + (i + 1));
      if (typeof options.onStatus === 'function') {
        options.onStatus('Importing photo ' + (i + 1) + ' of ' + snapshot.photos.length + ' (' + label + ')…');
      }
      var blobFile = lp && lp.file instanceof Blob ? lp.file : null;
      if (!blobFile && lp && typeof (lp.dataUrl || lp.data) === 'string') {
        try {
          var dataStr = String(lp.dataUrl || lp.data);
          var commaIdx = dataStr.indexOf(',');
          if (commaIdx > 0) {
            var headerPart = dataStr.slice(0, commaIdx);
            var mimeMatch = /^data:([^;]+);base64$/i.exec(headerPart);
            var binStr = atob(dataStr.slice(commaIdx + 1));
            var bytes = new Uint8Array(binStr.length);
            for (var bi = 0; bi < binStr.length; bi++) bytes[bi] = binStr.charCodeAt(bi);
            blobFile = new Blob([bytes], { type: mimeMatch ? mimeMatch[1] : 'image/png' });
          }
        } catch {}
      }
      if (!blobFile) {
        report.photos_failed.push({
          id: lp && lp.id ? String(lp.id) : 'idx_' + i,
          label: label,
          message: 'Saved device record did not contain readable image bytes.'
        });
        continue;
      }
      var rawLegacyId = String(lp.id || 'idx_' + i).replace(/[^A-Za-z0-9._:-]/g, '_').slice(0, 64);
      var idempKey = 'legp_' + rawLegacyId;
      if (idempKey.length < 8) idempKey = idempKey + '_photo01';

      try {
        var upRes = await uploadPhoto({
          vendorId: resolvedVendorId || null,
          caption: resolvedCaption.slice(0, 160),
          file: blobFile,
          entrySource: 'legacy_import',
          takenAt: typeof lp.created === 'string' ? lp.created : null,
          idempotencyKey: idempKey
        });
        if (upRes.idempotent_replay) {
          report.photos_already_present += 1;
        } else {
          report.photos_imported += 1;
        }
        // Confirmed persisted on server -> remove this single photo from legacy IndexedDB
        await deleteLegacyPhotoFromIndexedDb(lp.id);
      } catch (photoErr) {
        report.photos_failed.push({
          id: lp.id ? String(lp.id) : 'idx_' + i,
          label: label,
          code: photoErr.code || 'UPLOAD_FAILED',
          message: photoErr.message || 'Could not import this photo.'
        });
      }
    }

    report.partial_failure = report.visits_failed.length > 0 || report.photos_failed.length > 0;
    return report;
  }

  var exported = Object.freeze({
    CANONICAL_STORIES: CANONICAL_STORIES,
    renderEditorialIllustrationSvg: renderEditorialIllustrationSvg,
    clearMemoryCache: clearMemoryCache,
    syncActiveUserScope: syncActiveUserScope,
    fetchStories: fetchStories,
    getSummary: getSummary,
    listVisits: listVisits,
    logVisit: logVisit,
    deleteVisit: deleteVisit,
    listPhotos: listPhotos,
    uploadPhoto: uploadPhoto,
    deletePhoto: deletePhoto,
    fetchSuggestedTrail: fetchSuggestedTrail,
    listSavedTrails: listSavedTrails,
    saveTrail: saveTrail,
    deleteSavedTrail: deleteSavedTrail,
    exportAccountData: exportAccountData,
    inspectLegacyDeviceData: inspectLegacyDeviceData,
    dismissLegacyOfferForSession: dismissLegacyOfferForSession,
    discardLegacyDeviceData: discardLegacyDeviceData,
    importLegacyDeviceData: importLegacyDeviceData
  });

  if (typeof window !== 'undefined') {
    window.bitesharkExploration = exported;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.bitesharkExploration = exported;
  }
})();
