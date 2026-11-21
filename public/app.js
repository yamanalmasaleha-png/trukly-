const API = '/api';

const OFFLINE_FALLBACK_TRUCKS = [
  {"id":"mitote","name":"Mitote Food Park","cuisine":"Mexican","section":"Mexican","emoji":"🎉","city":"Santa Rosa","lat":38.43,"lng":-122.72,"location":"100 Sebastopol Rd, Santa Rosa","blurb":"Mexican food park with a rotating vendor lineup.","source":"https://www.mitotefoodpark.com/","tags":["Mexican"],"rating":null,"reviews":null,"distance":null,"open":null,"price":"","color":"#f6bd4b","photo":null,"verified":false,"verification_status":"needs_review","location_source":"curated_illustrative","location_accuracy":"illustrative_pin","listing_type":"Offline directory sample","hours":"Confirm the operator's current schedule","event_bookable":true,"accepting_bookings":true,"is_demo":true},
  {"id":"elroys","name":"El Roy's Express Mex","cuisine":"Mexican","section":"Mexican","emoji":"🌯","city":"Santa Rosa","lat":38.43,"lng":-122.74,"location":"1569 Sebastopol Rd, Santa Rosa","blurb":"Mexican street eats from the operator's Sebastopol Road truck.","source":"https://elroys.com/locations/","tags":["Mexican"],"rating":null,"reviews":null,"distance":null,"open":null,"price":"","color":"#d1cc94","photo":null,"verified":false,"verification_status":"needs_review","location_source":"curated_illustrative","location_accuracy":"illustrative_pin","listing_type":"Offline directory sample","hours":"Confirm the operator's current schedule","event_bookable":true,"accepting_bookings":true,"is_demo":true},
  {"id":"xies","name":"Xies707 Sushi Rolls","cuisine":"Global","section":"Global","emoji":"🍣","city":"Santa Rosa","lat":38.43,"lng":-122.72,"location":"44 Sebastopol Ave, Santa Rosa","blurb":"Mexican-style sushi rolls; published Golden Tray selection.","source":"https://toast.app/r/xies-sushi-rolls-llc-xies707/order","tags":["Global"],"rating":null,"reviews":null,"distance":null,"open":null,"price":"","color":"#b8d7c7","photo":null,"verified":false,"verification_status":"needs_review","location_source":"curated_illustrative","location_accuracy":"illustrative_pin","listing_type":"Offline directory sample","hours":"Confirm the operator's current schedule","event_bookable":true,"accepting_bookings":true,"is_demo":true},
  {"id":"dinos","name":"Dino's Greek Food","cuisine":"Global","section":"Global","emoji":"🥙","city":"Sonoma County","lat":38.44,"lng":-122.72,"location":"Sonoma County mobile schedule — location varies","blurb":"Greek street food including gyro and falafel.","source":"https://www.dinosgreekfoodtruck.com/","tags":["Global"],"rating":null,"reviews":null,"distance":null,"open":null,"price":"","color":"#b7c1ad","photo":null,"verified":false,"verification_status":"needs_review","location_source":"curated_illustrative","location_accuracy":"illustrative_pin","listing_type":"Offline directory sample","hours":"Confirm the operator's current schedule","event_bookable":true,"accepting_bookings":true,"is_demo":true},
  {"id":"fruta","name":"Fru-ta Ice Cream Truck","cuisine":"Sweets","section":"Sweets","emoji":"🍨","city":"Santa Rosa","lat":38.4,"lng":-122.71,"location":"2970 Santa Rosa Ave, Santa Rosa","blurb":"Paletas, ice cream and a featured Bionico fruit bowl.","source":"https://toast.app/r/fru-ta-food-truck-2970-santa-rosa-ave/order","tags":["Sweets"],"rating":null,"reviews":null,"distance":null,"open":null,"price":"","color":"#e2c0a1","photo":null,"verified":false,"verification_status":"needs_review","location_source":"curated_illustrative","location_accuracy":"illustrative_pin","listing_type":"Offline directory sample","hours":"Confirm the operator's current schedule","event_bookable":true,"accepting_bookings":true,"is_demo":true},
  {"id":"holy-chile","name":"Holy Chile Mole","cuisine":"Global","section":"Global","emoji":"🌮","city":"Petaluma area","lat":38.23,"lng":-122.63,"location":"Mobile schedule — confirm location before visiting","blurb":"BBQ-meat tacos and melts described by the operator.","source":"https://holychilemole.com/","tags":["Global"],"rating":null,"reviews":null,"distance":null,"open":null,"price":"","color":"#d5c69a","photo":null,"verified":false,"verification_status":"needs_review","location_source":"curated_illustrative","location_accuracy":"illustrative_pin","listing_type":"Offline directory sample","hours":"Confirm the operator's current schedule","event_bookable":true,"accepting_bookings":true,"is_demo":true}
];

let trucks = OFFLINE_FALLBACK_TRUCKS.map(t => ({ ...t }));
let catalogVersion = null;
const CATALOG_CACHE_KEY = 'truckly_catalog_v2';
const CATALOG_CACHE_MAX_AGE_MS = 15 * 60 * 1000;
const MEASURED_ACCURACIES = new Set(['verified_coordinate', 'venue_address', 'owner_reported_coords']);

const cuisineSections = ['Mexican', 'Burgers', 'Hot Dogs', 'Global', 'Sweets', 'Coffee', 'Markets'];

let activeKind = 'All';

function kindMatches(t) {
  if (activeKind === 'All') return true;
  if (activeKind === 'Coffee') return t.kind === 'Coffee' || /coffee/i.test(t.name);
  if (activeKind === 'Pop-ups') return t.popup === true;
  if (activeKind === 'Markets') return t.kind === 'Markets' || (t.tags || []).includes('Markets');
  if (activeKind === 'Farm Stands') return t.kind === 'Farm Stands';
  return t.kind === 'Food Trucks' || (!t.extra && !(t.tags || []).includes('Markets'));
}

function chooseKind(kind) {
  activeKind = kind;
  activeCuisine = 'All';
  const search = document.getElementById('searchInput');
  if (search) search.value = '';
  document.querySelectorAll('[data-cuisine]').forEach(b => {
    const isAll = b.dataset.cuisine === 'All';
    b.classList.toggle('active', isAll);
    b.setAttribute('aria-pressed', String(isAll));
  });
  document.querySelectorAll('[data-kind]').forEach(b => {
    const match = b.dataset.kind === kind;
    b.classList.toggle('active', match);
    b.setAttribute('aria-pressed', String(match));
  });
  const heading = document.getElementById('resultsHeading');
  if (heading) heading.textContent = kind === 'All' ? 'Around the neighborhood' : kind;
  setMode('list');
  if (heading && typeof heading.scrollIntoView === 'function') {
    heading.scrollIntoView({ block: 'start', behavior: isReducedMotion() ? 'auto' : 'smooth' });
  }
}

function chooseCuisine(s) {
  activeCuisine = s;
  activeKind = 'All';
  const search = document.getElementById('searchInput');
  if (search) search.value = '';
  document.querySelectorAll('[data-kind]').forEach(k => {
    const isAll = k.dataset.kind === 'All';
    k.classList.toggle('active', isAll);
    k.setAttribute('aria-pressed', String(isAll));
  });
  document.querySelectorAll('[data-cuisine]').forEach(b => {
    const match = b.dataset.cuisine === s;
    b.classList.toggle('active', match);
    b.setAttribute('aria-pressed', String(match));
  });
  const heading = document.getElementById('resultsHeading');
  if (heading) heading.textContent = s === 'All' ? 'Around the neighborhood' : s;
  applyFilters();
}
const PACKAGES = {
  dropin: { name: 'Neighborhood Drop-in', price: 750, max: 50 },
  party: { name: 'Party Favorite', price: 1500, max: 100 },
  festival: { name: 'Full Festival', price: 2900, max: 250 }
};
const HUBS = [
  { city: 'Santa Rosa', lat: 38.4405, lng: -122.7144 },
  { city: 'Rohnert Park', lat: 38.3396, lng: -122.7011 },
  { city: 'Cotati', lat: 38.3269, lng: -122.7072 },
  { city: 'Petaluma', lat: 38.2324, lng: -122.6367 },
  { city: 'Sonoma', lat: 38.2919, lng: -122.458 }
];

function safeJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed == null ? fallback : parsed;
  } catch {
    return fallback;
  }
}

function bsDiag() {
  return typeof window !== 'undefined' && window.bitesharkDiagnostics ? window.bitesharkDiagnostics : null;
}

function isReducedMotion() {
  const d = bsDiag();
  return Boolean(d && typeof d.prefersReducedMotion === 'function' && d.prefersReducedMotion());
}

function safeStorageSet(key, value, featureKey = 'ui_runtime') {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    const d = bsDiag();
    if (d && typeof d.reportClientDiagnostic === 'function') {
      d.reportClientDiagnostic({
        featureKey,
        operationName: 'localStorage.setItem',
        errorCode: 'LOCAL_STORAGE_WRITE_FAILED',
        severity: 'warning',
        message: 'Browser localStorage write failed or was blocked.',
        retryable: false,
        outcomeState: 'degraded',
        safeContext: { storage_kind: 'localStorage' }
      });
    }
    return false;
  }
}

async function appFetchJson(url, opts = {}) {
  const d = bsDiag();
  if (d && typeof d.fetchJsonBounded === 'function') {
    return d.fetchJsonBounded(url, { credentials: 'same-origin', ...opts });
  }
  const method = String(opts.method || 'GET').toUpperCase();
  const isWrite = Boolean(opts.isWrite || (method !== 'GET' && method !== 'HEAD'));
  try {
    const initObj = {
      method,
      credentials: opts.credentials || 'same-origin',
      headers: { ...(opts.headers || {}) }
    };
    if (opts.cache) initObj.cache = opts.cache;
    if (opts.body !== undefined) {
      initObj.body = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
      if (!initObj.headers['Content-Type']) initObj.headers['Content-Type'] = 'application/json';
    }
    const r = await fetch(url, initObj);
    let data = {};
    let badJson = false;
    try {
      data = await r.json();
    } catch {
      badJson = true;
    }
    if (badJson) {
      return {
        ok: false,
        status: r.status || 502,
        data: {},
        outcome: isWrite && r.status >= 500 ? 'outcome_uncertain' : 'malformed_response',
        uncertainWrite: Boolean(isWrite && r.status >= 500),
        correlationId: null,
        errorMessage: 'Unexpected server response.'
      };
    }
    const corr = (data && data.correlation_id) || r.headers?.get?.('x-correlation-id') || null;
    if (r.ok) {
      return { ok: true, status: r.status, data: data || {}, outcome: 'completed', correlationId: corr, errorMessage: null };
    }
    return {
      ok: false,
      status: r.status,
      data: data || {},
      outcome: r.status === 401 ? 'session_expired' : (r.status === 503 ? 'temporarily_unavailable' : 'failed'),
      correlationId: corr,
      errorMessage: (data && data.error) || 'Request could not be completed.'
    };
  } catch {
    return {
      ok: false,
      status: 0,
      data: {},
      outcome: 'temporarily_unavailable',
      correlationId: null,
      errorMessage: 'Could not reach BiteShark right now.'
    };
  }
}

function renderSectionFeedback(containerId, opts) {
  const d = bsDiag();
  if (d && typeof d.renderFeedbackBanner === 'function') {
    d.renderFeedbackBanner(containerId, opts);
    return;
  }
  const el = typeof document !== 'undefined' ? document.getElementById(containerId) : null;
  if (!el) return;
  if (!opts) {
    el.hidden = true;
    el.textContent = '';
    return;
  }
  el.hidden = false;
  el.textContent = (opts.title ? opts.title + ': ' : '') + (opts.message || '');
}

function setInlineStatus(elId, tone, text) {
  const el = typeof document !== 'undefined' ? document.getElementById(elId) : null;
  if (!el) return;
  if (!text) {
    el.hidden = true;
    el.textContent = '';
    return;
  }
  el.hidden = false;
  el.className = 'owner-inline-status' + (tone ? ' is-' + tone : '');
  el.textContent = text;
}

function openAppModal(modalId, opts = {}) {
  const el = typeof document !== 'undefined' ? document.getElementById(modalId) : null;
  if (!el) return;
  el.classList.add('show');
  const d = bsDiag();
  if (d && typeof d.openModalDialog === 'function') {
    d.openModalDialog(el, opts);
  }
}

function closeAppModal(modalId) {
  const el = typeof document !== 'undefined' ? document.getElementById(modalId) : null;
  if (!el) return;
  el.classList.remove('show');
  const d = bsDiag();
  if (d && typeof d.closeModalDialog === 'function') {
    d.closeModalDialog(el);
  }
}

function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}

let map, markers = {}, userMarker = null, userCoords = null;
let activeCuisine = 'All', openOnly = false, maxDistance = 30, selectedTruck = trucks[0].id;
let isSignedIn = false, currentUser = null;

const favs = new Set((() => {
  const stored = safeJSON('truckly_favs', []);
  return Array.isArray(stored) ? stored : [];
})());
let bookings = [];
let bookingDraftKey = null;
let bookingDraftSignature = '';
let notifyPrefs = (() => {
  const stored = safeJSON('truckly_notify', null);
  return stored && typeof stored === 'object'
    ? { nearby_enabled: stored.nearby_enabled !== false, radius_miles: Math.max(1, Math.min(30, +stored.radius_miles || 3)) }
    : { nearby_enabled: true, radius_miles: 3 };
})();

function formatUTCDateISO(dt) {
  return (
    dt.getUTCFullYear() +
    '-' +
    String(dt.getUTCMonth() + 1).padStart(2, '0') +
    '-' +
    String(dt.getUTCDate()).padStart(2, '0')
  );
}

function addDaysISO(isoDate, days) {
  const [y, m, d] = String(isoDate).split('-').map(Number);
  return formatUTCDateISO(new Date(Date.UTC(y, m - 1, d + days)));
}

function toCalendarDateISO(raw) {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    if (raw.getHours() === 0 && raw.getMinutes() === 0 && raw.getSeconds() === 0 && raw.getMilliseconds() === 0) {
      return (
        raw.getFullYear() +
        '-' +
        String(raw.getMonth() + 1).padStart(2, '0') +
        '-' +
        String(raw.getDate()).padStart(2, '0')
      );
    }
    return formatUTCDateISO(raw);
  }
  const s = String(raw || '').trim();
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  return m ? m[1] : s;
}

function defaultEventDate() {
  return addDaysISO(todayPacificISO(), 7);
}

function parseEventDate(raw) {
  const isoDay = toCalendarDateISO(raw);
  const d = /^\d{4}-\d{2}-\d{2}$/.test(isoDay) ? new Date(isoDay + 'T12:00:00') : new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function milesBetween(lat1, lng1, lat2, lng2) {
  const r = Math.PI / 180;
  const dLat = (lat2 - lat1) * r;
  const dLng = (lng2 - lng1) * r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLng / 2) ** 2;
  return 3959 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function hasCoords(t) {
  return t != null && t.lat !== null && t.lng !== null && Number.isFinite(Number(t.lat)) && Number.isFinite(Number(t.lng));
}

function hasMeasuredCoords(t) {
  return hasCoords(t) && !t.location_expired && MEASURED_ACCURACIES.has(t.location_accuracy);
}

function recomputeDistances() {
  trucks.forEach(t => {
    if (userCoords && hasMeasuredCoords(t)) {
      t.distance = +milesBetween(userCoords.lat, userCoords.lng, +t.lat, +t.lng).toFixed(1);
    } else {
      t.distance = null;
    }
  });
}

function distanceLabel(t, mode) {
  const hasDist = t && t.distance != null && Number.isFinite(+t.distance);
  if (t.location_accuracy === 'verified_coordinate' && hasDist) {
    return mode === 'detail' ? `${t.distance} mi away` : `${t.distance} mi`;
  }
  if (t.location_accuracy === 'venue_address' && hasDist) {
    return mode === 'detail' ? `~${t.distance} mi (venue address)` : `~${t.distance} mi`;
  }
  if (t.location_accuracy === 'owner_reported_coords' && hasDist) {
    return mode === 'detail' ? `~${t.distance} mi (owner-reported)` : `~${t.distance} mi (owner)`;
  }
  if (t.location_expired) {
    return mode === 'detail' ? 'Earlier live pin expired · confirm spot' : 'Past pin expired';
  }
  if (t.location_accuracy === 'owner_text_only') {
    return mode === 'detail' ? 'Vendor-reported spot · no GPS pin' : 'Vendor-reported spot';
  }
  if (t.location_accuracy === 'venue_address') {
    return mode === 'detail' ? 'Published venue address' : 'Published address';
  }
  if (t.location_accuracy === 'owner_reported_coords') {
    return mode === 'detail' ? 'Owner-reported pin' : 'Owner-reported pin';
  }
  if (mode === 'detail') return 'Area pin · confirm exact spot';
  return mode === 'fav' ? 'Confirm location' : 'Location to confirm';
}

function sanitizeCatalogItem(t) {
  const verified = t.verified === true && t.verification_status === 'business_confirmed';
  const photoRights = t.photo_rights_verified === true;
  return {
    ...t,
    verified,
    verification_status: verified ? 'business_confirmed' : 'needs_review',
    photo_rights_verified: photoRights,
    photo: photoRights && t.photo && !/images\.unsplash\.com/i.test(t.photo) ? t.photo : null
  };
}

function setCatalogOfflineNotice(visible, text) {
  const note = document.getElementById('catalogOfflineNote');
  if (!note) return;
  if (text) note.textContent = text;
  note.hidden = !visible;
}

async function refreshDiscoveryCatalog({ fresh = false, announce = false } = {}) {
  const params = new URLSearchParams();
  if (userCoords && Number.isFinite(userCoords.lat) && Number.isFinite(userCoords.lng)) {
    params.set('lat', String(userCoords.lat));
    params.set('lng', String(userCoords.lng));
  }
  if (fresh) params.set('fresh', '1');
  const qs = params.toString();
  const url = `${API}/trucks${qs ? '?' + qs : ''}`;

  try {
    const r = await fetch(url, { cache: fresh ? 'no-store' : 'default' });
    if (r.ok) {
      const live = await r.json();
      if (Array.isArray(live.trucks) && live.trucks.length) {
        trucks = live.trucks.map(sanitizeCatalogItem);
        catalogVersion = live.catalog_version || null;
        try {
          localStorage.removeItem('truckly_catalog');
          localStorage.setItem(
            CATALOG_CACHE_KEY,
            JSON.stringify({
              catalog_version: catalogVersion,
              fetched_at: Date.now(),
              trucks
            })
          );
        } catch {}
        setCatalogOfflineNotice(false);
        recomputeDistances();
        if (!selectedTruck || !trucks.some(t => t.id === selectedTruck)) {
          selectedTruck = trucks[0]?.id || null;
        }
        if (!userCoords) {
          const locLbl = document.getElementById('locationLabel');
          if (locLbl) locLbl.textContent = 'Sonoma County';
        }
        applyFilters();
        renderFavorites();
        if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
          const detail = { catalog_version: catalogVersion, total: trucks.length };
          window.dispatchEvent(new CustomEvent('biteshark:catalog-updated', { detail }));
          window.dispatchEvent(new CustomEvent('truckly:catalog-updated', { detail }));
        }
        if (announce) toast('Discovery directory refreshed');
        return true;
      }
    }
  } catch (e) {
    console.warn('Live truck feed unavailable', e);
  }

  const isOfflineDemo = trucks.every(t => t.is_demo);
  setCatalogOfflineNotice(
    true,
    isOfflineDemo
      ? 'Live catalog unavailable — showing 6-item offline Sonoma County fallback sample.'
      : 'Live catalog temporarily unavailable — showing your last saved Sonoma County directory snapshot.'
  );
  if (announce) toast('Live catalog unavailable — showing saved directory snapshot');
  return false;
}

const CLIENT_ALLOWLISTED_TILE_HOSTS = {
  osm_standard: ['tile.openstreetmap.org'],
  stadia_osm_bright: ['tiles.stadiamaps.com', 'tiles-eu.stadiamaps.com'],
  mapbox_streets: ['api.mapbox.com'],
  maptiler_streets: ['api.maptiler.com'],
  loopback_test: ['127.0.0.1', 'localhost']
};

const DEFAULT_BROWSER_MAP_CONFIG = {
  enabled: true,
  config_valid: true,
  provider_id: 'osm_standard',
  provider_label: 'OpenStreetMap Standard',
  tile_url_template: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  allowed_hosts: ['tile.openstreetmap.org'],
  attribution_html:
    '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
  min_zoom: 3,
  max_zoom: 19,
  referrer_policy: 'origin'
};

let activeTileLayer = null;
let activeMapTileTemplate = null;
let mapLifecycleBound = false;
const activeTileTimers = new Set();
const mapRuntimeState = {
  unavailable: false,
  failureReason: null,
  waveId: 0,
  startedCount: 0,
  pendingCount: 0,
  loadedCount: 0,
  errorCount: 0,
  lastRetryAt: 0,
  retryInFlight: false,
  cooldownTimer: null
};

function clearActiveTileTimers() {
  activeTileTimers.forEach(tId => clearTimeout(tId));
  activeTileTimers.clear();
}

function teardownActiveTileLayer({ abortPendingImages = false } = {}) {
  mapRuntimeState.waveId += 1;
  mapRuntimeState.pendingCount = 0;
  clearActiveTileTimers();

  if (activeTileLayer) {
    if (
      abortPendingImages &&
      activeTileLayer._container &&
      typeof activeTileLayer._container.querySelectorAll === 'function'
    ) {
      activeTileLayer._container.querySelectorAll('img').forEach(img => {
        try {
          if (!img.complete) img.removeAttribute('src');
        } catch {}
      });
    }
    if (map && typeof map.removeLayer === 'function') {
      try {
        map.removeLayer(activeTileLayer);
      } catch {}
    }
    activeTileLayer = null;
    activeMapTileTemplate = null;
  }
}

function isLocalLoopbackPage() {
  const host =
    typeof window !== 'undefined' && window.location && typeof window.location.hostname === 'string'
      ? window.location.hostname.toLowerCase()
      : '';
  return host === '127.0.0.1' || host === 'localhost';
}

function validateClientMapConfig(rawCfg) {
  if (!rawCfg || typeof rawCfg !== 'object') {
    return { valid: false, errorCode: 'MISSING_MAP_CONFIG' };
  }
  if (rawCfg.enabled === false || rawCfg.config_valid === false) {
    return {
      valid: false,
      disabled: rawCfg.config_valid !== false,
      errorCode: rawCfg.status_reason || 'MAP_DISABLED'
    };
  }

  const providerId = typeof rawCfg.provider_id === 'string' ? rawCfg.provider_id.trim() : '';
  const allowedHosts = Object.prototype.hasOwnProperty.call(CLIENT_ALLOWLISTED_TILE_HOSTS, providerId)
    ? CLIENT_ALLOWLISTED_TILE_HOSTS[providerId]
    : null;
  if (!allowedHosts) {
    return { valid: false, errorCode: 'UNAPPROVED_CLIENT_MAP_PROVIDER' };
  }
  if (providerId === 'loopback_test' && !isLocalLoopbackPage()) {
    return { valid: false, errorCode: 'LOOPBACK_PROVIDER_FORBIDDEN' };
  }

  const tpl = typeof rawCfg.tile_url_template === 'string' ? rawCfg.tile_url_template.trim() : '';
  if (
    !tpl ||
    tpl.length > 512 ||
    /[\s<>"'`\\]/.test(tpl) ||
    !tpl.includes('{z}') ||
    !tpl.includes('{x}') ||
    !tpl.includes('{y}')
  ) {
    return { valid: false, errorCode: 'INVALID_CLIENT_TILE_TEMPLATE' };
  }

  const braceTokens = [];
  const braceRe = /\{([^}]+)\}/g;
  let bm;
  while ((bm = braceRe.exec(tpl)) !== null) {
    braceTokens.push(bm[1]);
  }
  for (let i = 0; i < braceTokens.length; i += 1) {
    const tokenName = braceTokens[i];
    if (tokenName !== 'z' && tokenName !== 'x' && tokenName !== 'y' && tokenName !== 'r') {
      return { valid: false, errorCode: 'UNAPPROVED_TILE_PLACEHOLDER' };
    }
  }

  const probe = tpl
    .replace(/\{z\}/g, '11')
    .replace(/\{x\}/g, '326')
    .replace(/\{y\}/g, '791')
    .replace(/\{r\}/g, '');

  if (providerId === 'loopback_test') {
    const m = /^https?:\/\/(127\.0\.0\.1|localhost):(\d{1,5})(\/[^\s#]*)?$/i.exec(probe);
    if (!m) {
      return { valid: false, errorCode: 'INVALID_LOOPBACK_TILE_URL' };
    }
  } else {
    const m = /^https:\/\/([a-z0-9.-]+)(\/[^\s#]*)?$/i.exec(probe);
    if (!m || !allowedHosts.includes(m[1].toLowerCase())) {
      return { valid: false, errorCode: 'UNAPPROVED_CLIENT_TILE_HOST' };
    }
  }

  const minZoom = Number.isInteger(Number(rawCfg.min_zoom)) ? Number(rawCfg.min_zoom) : 3;
  const maxZoom = Number.isInteger(Number(rawCfg.max_zoom)) ? Number(rawCfg.max_zoom) : 19;
  if (minZoom < 0 || minZoom > 18 || maxZoom < 1 || maxZoom > 22 || minZoom > maxZoom) {
    return { valid: false, errorCode: 'INVALID_CLIENT_ZOOM_RANGE' };
  }

  const attribution =
    typeof rawCfg.attribution_html === 'string' && rawCfg.attribution_html.trim()
      ? rawCfg.attribution_html
      : DEFAULT_BROWSER_MAP_CONFIG.attribution_html;

  return {
    valid: true,
    provider_id: providerId,
    tile_url_template: tpl,
    attribution_html: attribution,
    min_zoom: minZoom,
    max_zoom: maxZoom,
    referrer_policy: 'origin'
  };
}

function isInteractiveMapDisabledByControl() {
  const fc = typeof window !== 'undefined' && window.bitesharkFeatures ? window.bitesharkFeatures : null;
  if (!fc) return false;
  if (typeof fc.isHidden === 'function' && fc.isHidden('interactive_map')) {
    return true;
  }
  const mc = typeof fc.getMapConfig === 'function' ? fc.getMapConfig() : null;
  if (mc && mc.enabled === false && mc.config_valid !== false) {
    return true;
  }
  return false;
}

function getValidatedBrowserMapConfig() {
  if (
    typeof window !== 'undefined' &&
    window.__BITESHARK_TEST_MAP_CONFIG &&
    isLocalLoopbackPage()
  ) {
    return validateClientMapConfig(window.__BITESHARK_TEST_MAP_CONFIG);
  }
  const fc = typeof window !== 'undefined' && window.bitesharkFeatures ? window.bitesharkFeatures : null;
  if (fc && typeof fc.getMapConfig === 'function') {
    const serverCfg = fc.getMapConfig();
    if (serverCfg) {
      return validateClientMapConfig(serverCfg);
    }
  }
  return validateClientMapConfig(DEFAULT_BROWSER_MAP_CONFIG);
}

function showMapFallbackUI({ title, copy, statusText, showRetry = true, hint = '' } = {}) {
  mapRuntimeState.unavailable = true;
  mapRuntimeState.retryInFlight = false;
  const wrap = typeof document.querySelector === 'function' ? document.querySelector('.map-wrap') : null;
  if (wrap && wrap.classList) wrap.classList.add('is-map-unavailable');

  const fb = document.getElementById('mapFallback');
  const titleEl = document.getElementById('mapFallbackTitle');
  const copyEl = document.getElementById('mapFallbackCopy');
  const statusEl = document.getElementById('mapFallbackStatus');
  const retryBtn = document.getElementById('mapFallbackRetryBtn');
  const hintEl = document.getElementById('mapFallbackHint');

  if (titleEl && title) titleEl.textContent = title;
  if (copyEl && copy) copyEl.textContent = copy;
  if (statusEl) statusEl.textContent = statusText || copy || title || 'Map is unavailable right now.';
  if (retryBtn) retryBtn.hidden = !showRetry;
  if (hintEl) {
    hintEl.textContent = hint || '';
    hintEl.hidden = !hint;
  }
  if (fb) fb.hidden = false;
}

function hideMapFallbackUI() {
  mapRuntimeState.unavailable = false;
  const wrap = typeof document.querySelector === 'function' ? document.querySelector('.map-wrap') : null;
  if (wrap && wrap.classList) wrap.classList.remove('is-map-unavailable');
  const fb = document.getElementById('mapFallback');
  const hintEl = document.getElementById('mapFallbackHint');
  const statusEl = document.getElementById('mapFallbackStatus');
  if (fb) fb.hidden = true;
  if (hintEl) {
    hintEl.textContent = '';
    hintEl.hidden = true;
  }
  if (statusEl) statusEl.textContent = '';
}

function shouldTriggerMapTileOutage() {
  const { startedCount, pendingCount, loadedCount, errorCount } = mapRuntimeState;
  // Never disable the map on a single failed tile
  if (errorCount < 3) {
    if (startedCount >= 2 && pendingCount === 0 && loadedCount === 0 && errorCount >= 2) {
      return true;
    }
    return false;
  }
  const settled = loadedCount + errorCount;
  return loadedCount === 0 || errorCount / Math.max(1, settled) >= 0.6;
}

function enterMapTileOutage(reason) {
  mapRuntimeState.failureReason = reason || 'tile_error';
  teardownActiveTileLayer({ abortPendingImages: true });
  const d = bsDiag();
  if (d && typeof d.reportClientDiagnostic === 'function') {
    d.reportClientDiagnostic({
      featureKey: 'map_tiles',
      operationName: 'map.tile_layer',
      errorCode: reason === 'tile_timeout' ? 'MAP_TILE_TIMEOUT' : 'MAP_TILE_LOAD_ERROR',
      severity: 'warning',
      message: 'Map tiles degraded (' + (reason || 'tile_error') + '); switched to accessible list fallback.',
      retryable: true,
      outcomeState: 'temporarily_unavailable',
      safeContext: { phase: String(reason || 'tile_error').slice(0, 32) }
    });
  }
  showMapFallbackUI({
    title: 'Map view isn’t available right now',
    copy: 'Map tiles could not be loaded from the map provider. Your Sonoma County food directory, search, filters, and saved places remain ready in List view.',
    statusText: 'Map is unavailable right now. Continue in List view or retry the map.',
    showRetry: true
  });
}

function syncUserMarkerOnMap() {
  if (!map || !userCoords || typeof L === 'undefined' || typeof L.divIcon !== 'function') return;
  const userIcon = L.divIcon({
    className: '',
    html: '<div class="user-pin" title="Your location"></div>',
    iconSize: [18, 18],
    iconAnchor: [9, 9]
  });
  if (userMarker && typeof userMarker.setLatLng === 'function') {
    userMarker.setLatLng([userCoords.lat, userCoords.lng]);
  } else if (typeof L.marker === 'function') {
    userMarker = L.marker([userCoords.lat, userCoords.lng], { icon: userIcon }).addTo(map);
  }
}

function attachApprovedTileLayer(cfg) {
  teardownActiveTileLayer({ abortPendingImages: true });

  const currentWave = ++mapRuntimeState.waveId;
  mapRuntimeState.startedCount = 0;
  mapRuntimeState.pendingCount = 0;
  mapRuntimeState.loadedCount = 0;
  mapRuntimeState.errorCount = 0;
  mapRuntimeState.failureReason = null;

  if (typeof map.setMinZoom === 'function') map.setMinZoom(cfg.min_zoom);
  if (typeof map.setMaxZoom === 'function') map.setMaxZoom(cfg.max_zoom);

  const tileTimeoutMs = Math.max(
    350,
    Number((typeof window !== 'undefined' && window.__BITESHARK_MAP_TILE_TIMEOUT_MS) || 8000)
  );

  const layer = L.tileLayer(cfg.tile_url_template, {
    attribution: cfg.attribution_html,
    minZoom: cfg.min_zoom,
    maxZoom: cfg.max_zoom,
    referrerPolicy: 'origin'
  });

  if (layer && typeof layer.on === 'function') {
    const clearTileTimer = tileEl => {
      if (tileEl && tileEl.__bsTileTimer) {
        clearTimeout(tileEl.__bsTileTimer);
        activeTileTimers.delete(tileEl.__bsTileTimer);
        tileEl.__bsTileTimer = null;
      }
    };

    const recordTileFailure = (tileEl, reason) => {
      if (currentWave !== mapRuntimeState.waveId) return;
      if (tileEl && tileEl.__bsSettled) return;
      if (tileEl) tileEl.__bsSettled = true;
      clearTileTimer(tileEl);
      if (mapRuntimeState.pendingCount > 0) mapRuntimeState.pendingCount -= 1;
      mapRuntimeState.errorCount += 1;
      if (shouldTriggerMapTileOutage()) {
        enterMapTileOutage(reason);
      }
    };

    layer.on('tileloadstart', ev => {
      if (currentWave !== mapRuntimeState.waveId) return;
      const tileEl = ev && ev.tile ? ev.tile : null;
      mapRuntimeState.startedCount += 1;
      mapRuntimeState.pendingCount += 1;
      if (tileEl) {
        tileEl.__bsSettled = false;
        const timerId = setTimeout(() => {
          activeTileTimers.delete(timerId);
          if (currentWave !== mapRuntimeState.waveId) return;
          if (tileEl && !tileEl.__bsSettled) {
            try {
              tileEl.removeAttribute('src');
            } catch {}
            recordTileFailure(tileEl, 'tile_timeout');
          }
        }, tileTimeoutMs);
        tileEl.__bsTileTimer = timerId;
        activeTileTimers.add(timerId);
      }
    });

    layer.on('tileload', ev => {
      if (currentWave !== mapRuntimeState.waveId) return;
      const tileEl = ev && ev.tile ? ev.tile : null;
      if (tileEl && tileEl.__bsSettled) return;
      if (tileEl) tileEl.__bsSettled = true;
      clearTileTimer(tileEl);
      if (mapRuntimeState.pendingCount > 0) mapRuntimeState.pendingCount -= 1;
      mapRuntimeState.loadedCount += 1;
      mapRuntimeState.retryInFlight = false;
    });

    layer.on('tileerror', ev => {
      const tileEl = ev && ev.tile ? ev.tile : null;
      recordTileFailure(tileEl, 'tile_error');
    });
  }

  layer.addTo(map);
  activeTileLayer = layer;
  activeMapTileTemplate = cfg.tile_url_template;
  syncUserMarkerOnMap();
}

function bindMapResizeAndZoomListeners() {
  if (!map || mapLifecycleBound) return;
  mapLifecycleBound = true;
  if (typeof map.whenReady === 'function') {
    map.whenReady(() => {
      if (map && typeof map.invalidateSize === 'function') {
        map.invalidateSize();
        setTimeout(() => {
          if (map && typeof map.invalidateSize === 'function') map.invalidateSize();
        }, 250);
      }
    });
  }
  if (typeof map.on === 'function') {
    map.on('zoomend', () => applyFilters());
  }
  const mapWrap = typeof document.querySelector === 'function' ? document.querySelector('.map-wrap') : null;
  if (mapWrap && typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => {
      if (map && !mapRuntimeState.unavailable && typeof map.invalidateSize === 'function') {
        map.invalidateSize();
      }
    }).observe(mapWrap);
  }
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('orientationchange', () =>
      setTimeout(() => {
        if (map && !mapRuntimeState.unavailable && typeof map.invalidateSize === 'function') {
          map.invalidateSize();
        }
      }, 250)
    );
  }
}

function ensureMapInitialized({ forceRetry = false } = {}) {
  if (isInteractiveMapDisabledByControl()) {
    teardownActiveTileLayer({ abortPendingImages: true });
    hideMapFallbackUI();
    return false;
  }

  const cfg = getValidatedBrowserMapConfig();
  if (!cfg.valid) {
    teardownActiveTileLayer({ abortPendingImages: true });
    showMapFallbackUI({
      title: 'Map view isn’t available right now',
      copy: 'Interactive map configuration is currently unavailable. All Sonoma County food spots, search, filters, and saved places remain ready in List view.',
      statusText: 'Map configuration is unavailable. Continue in List view.',
      showRetry: false
    });
    return false;
  }

  if (typeof L === 'undefined' || typeof L.map !== 'function' || typeof L.tileLayer !== 'function') {
    map = null;
    mapRuntimeState.failureReason = 'leaflet_missing';
    showMapFallbackUI({
      title: 'Map view isn’t available right now',
      copy: 'Interactive map scripts could not be loaded right now. All Sonoma County food spots, search, filters, and saved places remain ready in List view.',
      statusText: 'Map scripts could not be loaded. Continue in List view or retry the map.',
      showRetry: true
    });
    return false;
  }

  if (!map) {
    try {
      map = L.map('map', {
        zoomControl: false,
        attributionControl: true,
        minZoom: cfg.min_zoom,
        maxZoom: cfg.max_zoom
      }).setView([38.43, -122.70], 11);
      if (L.control && typeof L.control.zoom === 'function') {
        L.control.zoom({ position: 'bottomright' }).addTo(map);
      }
      bindMapResizeAndZoomListeners();
    } catch {
      map = null;
      mapRuntimeState.failureReason = 'leaflet_init_failed';
      showMapFallbackUI({
        title: 'Map view isn’t available right now',
        copy: 'Interactive map could not be initialized on this device right now. Continue browsing all Sonoma County food listings in List view.',
        statusText: 'Map could not be initialized. Continue in List view or retry the map.',
        showRetry: true
      });
      return false;
    }
  }

  if (!activeTileLayer || forceRetry || activeMapTileTemplate !== cfg.tile_url_template) {
    hideMapFallbackUI();
    attachApprovedTileLayer(cfg);
  } else if (!mapRuntimeState.unavailable) {
    hideMapFallbackUI();
  }

  return true;
}

if (typeof window !== 'undefined') {
  window.bitesharkSyncInteractiveMapControl = function () {
    const discover = document.getElementById('discoverScreen');
    if (isInteractiveMapDisabledByControl()) {
      teardownActiveTileLayer({ abortPendingImages: true });
      hideMapFallbackUI();
      if (discover && !discover.classList.contains('list-mode')) {
        setMode('list');
      }
    }
  };
}

async function init() {
  const discoverEl = document.getElementById('discoverScreen');
  const startsInListMode = Boolean(
    discoverEl && discoverEl.classList && discoverEl.classList.contains('list-mode')
  );
  if (!startsInListMode && !isInteractiveMapDisabledByControl()) {
    ensureMapInitialized();
  }

  document.querySelectorAll('[data-cuisine]').forEach(b => {
    b.onclick = () => chooseCuisine(b.dataset.cuisine);
  });

  const dateInput = document.getElementById('eventDate');
  if (dateInput && !dateInput.value) dateInput.value = defaultEventDate();

  let hasCached = false;
  try {
    const cached = safeJSON(CATALOG_CACHE_KEY, null);
    if (
      cached &&
      Array.isArray(cached.trucks) &&
      cached.trucks.length &&
      Number.isFinite(cached.fetched_at) &&
      Date.now() - cached.fetched_at <= CATALOG_CACHE_MAX_AGE_MS
    ) {
      trucks = cached.trucks
        .filter(t => !['estrella', 'owner-truck', 'bao', 'ember', 'verde', 'swirl', 'masa'].includes(t.id))
        .map(sanitizeCatalogItem);
      catalogVersion = cached.catalog_version || null;
      recomputeDistances();
      selectedTruck = trucks[0]?.id || null;
      hasCached = true;
      applyFilters();
    }
  } catch {}

  if (!hasCached) {
    document.getElementById('nearbyCount').textContent = 'Loading…';
    document.getElementById('truckCards').innerHTML = '<div class="loading-state">Finding nearby food trucks…</div>';
  }

  renderNotificationUI();
  updateAuthUI();

  await refreshDiscoveryCatalog({ fresh: false });

  applyFilters();
  renderFavorites();
  renderBookings();
  syncAuthAndUserData();
}

function foldText(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function filtered() {
  const q = foldText((document.getElementById('searchInput')?.value || '').trim());
  const list = trucks.filter(t =>
    kindMatches(t) &&
    (activeCuisine === 'All' || (activeCuisine === 'Coffee' && (t.kind === 'Coffee' || /coffee/i.test(t.name))) || (t.tags || [t.cuisine]).includes(activeCuisine)) &&
    (!openOnly || t.open === true) &&
    (t.distance == null ? maxDistance === 30 : t.distance <= maxDistance) &&
    (!q || foldText([t.name, t.cuisine, t.kind || '', ...(t.tags || []), t.location, t.city].join(' ')).includes(q))
  );
  if (userCoords) {
    list.sort((a, b) => (a.distance ?? 999) - (b.distance ?? 999));
  }
  return list;
}

function pinStatusBadge(t) {
  if (t.verified && t.open === true) return 'OPEN';
  if (t.is_confirmed_service && t.open === true) return 'LIVE';
  if (t.schedule_status === 'unavailable_today' || t.schedule_status === 'owner_paused_today') return 'CLOSED';
  if (t.open === true) return 'EST OPEN';
  return t.listing_type === 'Fixed truck / venue' ? 'HOURS' : 'CHECK';
}

function cardOpenBadge(t) {
  if (t.verified && t.open === true) return '● OPEN';
  if (t.is_confirmed_service && t.open === true) {
    return t.schedule_source === 'owner_schedule' ? '● SCHEDULED' : '● LIVE TODAY';
  }
  if (t.schedule_status === 'unavailable_today' || t.schedule_status === 'owner_paused_today') {
    return '○ CLOSED TODAY';
  }
  if (t.open === true) return '◐ EST. OPEN';
  return t.id === 'ross' ? 'CHECK LINEUP' : 'CHECK HOURS';
}

function detailStatusPrefix(t) {
  if (t.verified && t.open === true) return '● OPEN NOW · ';
  if (t.is_confirmed_service && t.open === true) {
    return t.schedule_source === 'owner_schedule' ? '● VENDOR SCHEDULED OPEN · ' : '● VENDOR LIVE TODAY · ';
  }
  if (t.schedule_status === 'unavailable_today' || t.schedule_status === 'owner_paused_today') {
    return '○ CLOSED TODAY · ';
  }
  if (t.open === true) return '◐ PUBLISHED HOURS (UNVERIFIED) · ';
  return '';
}

function detailHoursNote(t) {
  if (t.location_source === 'owner_reported' && !t.location_expired) {
    return `Vendor live update · ${t.hours}`;
  }
  if (t.location_source === 'temporary_service') {
    return `Scheduled service stop · ${t.hours}`;
  }
  if (t.location_expired) {
    return `Earlier live update expired · ${t.hours}`;
  }
  return `Published/estimated · ${t.hours}`;
}

function applyFilters() {
  const show = filtered();
  const zoomLevel = map && typeof map.getZoom === 'function' ? map.getZoom() : 11;
  const pinLimit = zoomLevel >= 14 ? 18 : (activeCuisine === 'All' ? 10 : 14);
  const pinList = show
    .filter(hasCoords)
    .sort((a, b) => (b.id === selectedTruck) - (a.id === selectedTruck) || (Number(b.open === true) - Number(a.open === true)) || ((a.distance ?? 999) - (b.distance ?? 999)))
    .slice(0, pinLimit);

  if (map && typeof L !== 'undefined') {
    Object.values(markers).forEach(m => map.removeLayer(m));
    markers = {};

    pinList.forEach(t => {
      const badge = pinStatusBadge(t);
      const icon = L.divIcon({
        className: '',
        html: `<div class="truck-pin ${t.id === selectedTruck ? 'selected' : ''}" style="--pin:${esc(t.color)}"><span>${esc(t.emoji)}</span><b>${badge}</b></div>`,
        iconSize: [58, 58],
        iconAnchor: [24, 48]
      });
      const m = L.marker([t.lat, t.lng], { icon })
        .addTo(map)
        .on('click', () => {
          selectTruck(t.id);
          openDetail(t.id);
        });
      markers[t.id] = m;
    });
  }

  const isListMode = document.getElementById('discoverScreen').classList.contains('list-mode');
  document.getElementById('nearbyCount').textContent = `${show.length} ${show.length === 1 ? 'place' : 'places'}${isListMode ? ' to explore' : ' · ' + pinList.length + ' on map'}`;

  const hoursNote = document.getElementById('openHoursNote');
  if (hoursNote) {
    hoursNote.hidden = !(openOnly && show.some(t => !t.verified && !t.is_confirmed_service));
  }

  const mapEmpty = document.getElementById('mapEmpty');
  if (mapEmpty) {
    if (!show.length) {
      mapEmpty.hidden = false;
      mapEmpty.innerHTML = openOnly
        ? `<p>No places have published open hours right now. Unverified schedules aren’t shown as open.</p><button type="button" class="secondary" onclick="toggleOpen()">Turn off Open now</button>`
        : `<p>No spots match your current search or radius filters.</p><button type="button" class="secondary" onclick="resetFilters()">Reset filters</button>`;
    } else {
      mapEmpty.hidden = true;
      mapEmpty.innerHTML = '';
    }
  }

  document.getElementById('truckCards').innerHTML = show.length
    ? show.map(cardHTML).join('')
    : (openOnly
      ? '<div class="empty">No places have published open hours right now. Turn off Open now to browse all spots and confirm their schedules.</div>'
      : '<div class="empty">No spots match those filters. Try widening your search or setting radius to 30 mi.</div>');
}

function resetFilters() {
  activeCuisine = 'All';
  activeKind = 'All';
  openOnly = false;
  maxDistance = 30;
  const search = document.getElementById('searchInput');
  if (search) search.value = '';
  const openBtn = document.getElementById('openNow');
  if (openBtn) {
    openBtn.classList.remove('active');
    openBtn.setAttribute('aria-pressed', 'false');
  }
  document.querySelectorAll('[data-cuisine]').forEach(b => {
    const isAll = b.dataset.cuisine === 'All';
    b.classList.toggle('active', isAll);
    b.setAttribute('aria-pressed', String(isAll));
  });
  document.querySelectorAll('[data-kind]').forEach(b => {
    const isAll = b.dataset.kind === 'All';
    b.classList.toggle('active', isAll);
    b.setAttribute('aria-pressed', String(isAll));
  });
  const heading = document.getElementById('resultsHeading');
  if (heading) heading.textContent = 'Around the neighborhood';
  const range = document.getElementById('distanceRange');
  if (range) range.value = '30';
  setDistance(30);
  applyFilters();
}

function openTruck(id) {
  document.getElementById('discoverScreen').classList.contains('list-mode') ? openDetail(id) : selectTruck(id);
}

function extraCard(t) {
  const isSaved = favs.has(t.id);
  const isSelected = t.id === selectedTruck;
  const safeId = esc(t.id);
  const tagLabel = t.is_confirmed_service && t.open === true
    ? `● LIVE · ${t.kind || 'Local'}`
    : (t.schedule_status === 'unavailable_today' || t.schedule_status === 'owner_paused_today' ? '○ CLOSED TODAY' : (t.kind || 'Local'));
  return `<article class="truck-card${isSelected ? ' selected-card' : ''}" onclick="openDetail('${safeId}')"><button class="heart ${isSaved ? 'saved' : ''}" aria-label="${isSaved ? 'Remove from favorites' : 'Save to favorites'}" aria-pressed="${isSaved}" onclick="event.stopPropagation();toggleFav('${safeId}')">${isSaved ? '♥' : '♡'}</button><div class="truck-photo icon-photo" style="background:${esc(t.color)}"><span class="photo-emoji">${esc(t.emoji)}</span><span class="open-tag">${esc(tagLabel)}</span></div><div class="truck-info"><h3>${esc(t.name)}</h3><div class="meta">${esc(t.cuisine)} · ${esc(t.city)}</div><div class="distance">⌖ <b>${esc(distanceLabel(t, 'card'))}</b> · ${esc(t.location)}</div><button class="detail-link" onclick="event.stopPropagation();openDetail('${safeId}')">Hours &amp; details ↗</button></div></article>`;
}

function extraDetail(t) {
  const safeId = esc(t.id);
  const storyHref = esc(t.storySource || t.source || '');
  const statusPrefix = detailStatusPrefix(t);
  const metaDisclaimer = t.is_confirmed_service
    ? `Status reported directly by authorized vendor staff (${esc(distanceLabel(t, 'detail'))}).`
    : `Source checked ${esc(t.checked || 'recently')}. Hours and pop-up locations can change. ${esc(distanceLabel(t, 'detail'))}.`;
  document.getElementById('detailContent').innerHTML = `<button type="button" class="modal-close" onclick="closeModal()" aria-label="Close details">×</button><div class="detail-hero icon-photo" style="background:${esc(t.color)}"><span class="photo-emoji" aria-hidden="true">${esc(t.emoji)}</span></div><div class="detail-body"><small>${statusPrefix}${esc((t.kind || t.cuisine || 'Local').toUpperCase())}</small><h2 id="detailDialogTitle">${esc(t.name)}</h2><p>${esc(t.blurb)}</p>${t.special ? `<aside class="special-note"><small>WHAT MAKES IT SPECIAL</small><p>${esc(t.special)}</p><a href="${storyHref}" target="_blank" rel="noopener noreferrer">Read the business’s own story ↗</a></aside>` : ''}<div class="detail-location"><b>⌖ ${esc(t.location)}</b><small>${esc(detailHoursNote(t))}</small></div><p class="meta">${metaDisclaimer}</p>${t.source ? `<a class="primary source-button" target="_blank" rel="noopener noreferrer" href="${esc(t.source)}">View published ${t.popup ? 'pop-up calendar' : 'hours & information'} ↗</a>` : ''}<a class="map-link" target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(t.popup && t.location_source === 'unknown' ? t.name + ' Sonoma County' : t.location)}">Find ${t.popup ? 'this truck' : 'this place'} on Google Maps ↗</a><button class="detail-link" type="button" onclick="if(typeof communityReviewPlace==='function')communityReviewPlace('${safeId}')">✎ Write a local review →</button></div>`;
  openAppModal('detailModal', { onClose: closeModal });
  if (typeof window !== 'undefined' && window.bitesharkFeatures && typeof window.bitesharkFeatures.syncDom === 'function') {
    window.bitesharkFeatures.syncDom();
  }
}

function cardHTML(t) {
  if (t.extra) return extraCard(t);
  const openTag = cardOpenBadge(t);
  const isSaved = favs.has(t.id);
  const isSelected = t.id === selectedTruck;
  const safeId = esc(t.id);
  return `<article class="truck-card${isSelected ? ' selected-card' : ''}" onclick="openTruck('${safeId}')"><button class="heart ${isSaved ? 'saved' : ''}" aria-label="${isSaved ? 'Remove from favorites' : 'Save to favorites'}" aria-pressed="${isSaved}" onclick="event.stopPropagation();toggleFav('${safeId}')">${isSaved ? '♥' : '♡'}</button><div class="truck-photo ${t.photo ? '' : 'icon-photo'}" style="${t.photo ? `background-image:url('${esc(t.photo)}')` : `background:${esc(t.color)}`}">${t.photo ? '' : `<span class="photo-emoji">${esc(t.emoji)}</span>`}<span class="open-tag">${openTag}</span></div><div class="truck-info"><h3>${esc(t.name)}</h3><div class="meta"><span class="rating">${t.verified && t.rating ? `★ ${esc(t.rating)}` : 'Menu & info'}</span> ${t.verified && t.reviews ? `(${esc(t.reviews)}) · ` : ''}${esc(t.cuisine)}${t.price ? ' · ' + esc(t.price) : ''}</div><div class="meta city-meta">${esc(t.city || 'Sonoma County')} · ${esc(t.listing_type || t.availability || '')}</div><div class="distance">⌖ <b>${esc(distanceLabel(t, 'card'))}</b> · ${esc(t.location)}</div><button class="detail-link" onclick="event.stopPropagation();openDetail('${safeId}')">Get the lowdown →</button></div></article>`;
}

function selectTruck(id) {
  selectedTruck = id;
  const t = trucks.find(x => x.id === id);
  if (t && map && !mapRuntimeState.unavailable && hasCoords(t)) {
    const offset = window.innerWidth < 750 ? 0.006 : 0;
    map.flyTo([+t.lat + offset, +t.lng], 15, isReducedMotion() ? { animate: false, duration: 0 } : { duration: 0.55 });
  }
  applyFilters();
  document.querySelectorAll('.truck-card').forEach(c => c.classList.toggle('selected-card', c.getAttribute('onclick')?.includes(`'${id}'`)));
}

function openDetail(id) {
  const t = trucks.find(x => x.id === id);
  if (!t) return;
  selectedTruck = id;
  if (t.extra) {
    extraDetail(t);
    return;
  }
  const statusPrefix = detailStatusPrefix(t);
  const safeId = esc(t.id);
  document.getElementById('detailContent').innerHTML = `<button type="button" class="modal-close" aria-label="Close details" onclick="closeModal()">×</button><div class="detail-hero ${t.photo ? '' : 'icon-photo'}" style="${t.photo ? `background-image:url('${esc(t.photo)}')` : `background:${esc(t.color)}`}">${t.photo ? '' : `<span class="photo-emoji" aria-hidden="true">${esc(t.emoji)}</span>`}</div><div class="detail-body"><small>${statusPrefix}${esc(t.cuisine).toUpperCase()}</small><h2 id="detailDialogTitle">${esc(t.emoji)} ${esc(t.name)}</h2><p>${esc(t.blurb)}</p><div class="detail-tags"><span>${t.verified && t.rating ? `★ ${esc(t.rating)} (${esc(t.reviews)})` : 'Check the menu'}</span>${t.price ? `<span>${esc(t.price)}</span>` : ''}<span>${esc(distanceLabel(t, 'detail'))}</span></div><div class="detail-location"><b>⌖ ${esc(t.location)}</b><small>${esc(detailHoursNote(t))}</small></div><div class="truth-card"><span class="verified-dot" aria-hidden="true">✓</span><div><b>${t.verified ? 'Source-verified listing' : 'Details pending verification'}</b><small>${esc(t.listing_type || t.availability || 'Mobile vendor')} · ${esc(t.city || 'Sonoma County')} · Pacific time</small></div></div><a class="map-link" target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(t.location)}">Open location in Google Maps ↗</a><button class="detail-link" type="button" onclick="if(typeof communityReviewPlace==='function')communityReviewPlace('${safeId}')">✎ Write a local review →</button><button type="button" class="primary" onclick="closeModal();openBooking('${safeId}')">Request this truck for an event →</button></div>`;
  openAppModal('detailModal', { onClose: closeModal });
  if (typeof window !== 'undefined' && window.bitesharkFeatures && typeof window.bitesharkFeatures.syncDom === 'function') {
    window.bitesharkFeatures.syncDom();
  }
}

function closeModal() {
  closeAppModal('detailModal');
}

function initialsFromUser(user) {
  const source = (user && (user.name || user.email)) || '';
  if (!source) return '✓';
  const clean = source.split('@')[0].replace(/[^a-zA-Z0-9]+/g, ' ').trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (clean.slice(0, 2) || '✓').toUpperCase();
}

let accountSyncState = 'local_only'; // 'synced' | 'local_only' | 'degraded'
let notifySyncState = 'local_only'; // 'synced' | 'local_only' | 'working' | 'failed'

function updateAuthUI() {
  const avatar = document.getElementById('profileAvatar');
  const heading = document.getElementById('profileHeading');
  const sub = document.getElementById('profileSub');
  const signInLink = document.getElementById('authSignInLink');
  const signOutBtn = document.getElementById('authSignOutBtn');
  const bookingAuthNotice = document.getElementById('bookingAuthNotice');
  if (bookingAuthNotice) bookingAuthNotice.hidden = isSignedIn;
  if (!avatar) return;

  if (isSignedIn) {
    avatar.textContent = initialsFromUser(currentUser);
    avatar.classList.add('signed-in');
    avatar.title = currentUser?.email ? `Signed in as ${currentUser.email}` : 'Signed in';
    if (heading) heading.textContent = currentUser?.email || 'Signed in';
    if (sub) {
      sub.textContent =
        accountSyncState === 'degraded'
          ? 'Account sync temporarily unavailable · device state shown'
          : 'Favorites & bookings saved to your account';
    }
    if (signInLink) signInLink.hidden = true;
    if (signOutBtn) signOutBtn.hidden = false;
  } else {
    avatar.textContent = '👤';
    avatar.classList.remove('signed-in');
    avatar.title = 'Guest mode — sign in to save to your account';
    if (heading) heading.textContent = 'Guest mode';
    if (sub) sub.textContent = 'Saved on this device';
    if (signInLink) signInLink.hidden = false;
    if (signOutBtn) signOutBtn.hidden = true;
  }
}

async function syncAuthAndUserData() {
  let detectedSessionUser = null;
  try {
    if (window.biteshark && window.biteshark.auth && typeof window.biteshark.auth.getUser === 'function') {
      const u = await window.biteshark.auth.getUser().catch(() => null);
      if (u) {
        currentUser = u;
        detectedSessionUser = u;
      }
    } else if (window.__BITESHARK__ && window.__BITESHARK__.user) {
      currentUser = window.__BITESHARK__.user;
      detectedSessionUser = currentUser;
    }
  } catch {}

  const favRes = await appFetchJson(API + '/favorites/list', {
    featureKey: 'favorites',
    operationName: 'favorites.sync_list',
    routeTemplate: '/api/favorites/list'
  });

  if (favRes.ok) {
    isSignedIn = true;
    accountSyncState = 'synced';
    const data = favRes.data;
    const serverIds = Array.isArray(data.favorites) ? data.favorites.map(f => f.truck_id).filter(Boolean) : [];
    if (!serverIds.length && favs.size > 0) {
      const guestIds = [...favs];
      const migrateOutcomes = await Promise.all(
        guestIds.map(truck_id =>
          appFetchJson(API + '/favorites/toggle', {
            method: 'POST',
            isWrite: true,
            idempotentWrite: true,
            featureKey: 'favorites',
            operationName: 'favorites.migrate_guest',
            routeTemplate: '/api/favorites/toggle',
            body: { truck_id, desired_saved: true }
          })
        )
      );
      if (migrateOutcomes.some(o => !o.ok)) {
        accountSyncState = 'degraded';
      }
    } else {
      favs.clear();
      serverIds.forEach(id => favs.add(id));
      safeStorageSet('truckly_favs', JSON.stringify([...favs]), 'favorites');
    }
    await Promise.all([loadUserBookings(), loadNotificationSettings()]);
    updateAuthUI();
    applyFilters();
    renderFavorites();
    return;
  }

  // Distinguish actual unauthenticated (401) from age-assessment gate (403) or server/network outage!
  if (favRes.status === 403 && (favRes.outcome === 'age_assessment_required' || favRes.data?.requires_age_assessment)) {
    isSignedIn = Boolean(detectedSessionUser || currentUser);
    accountSyncState = 'local_only';
    updateAuthUI();
    renderNotificationUI();
    return;
  }

  if (favRes.status !== 401 && (detectedSessionUser || isSignedIn)) {
    isSignedIn = true;
    accountSyncState = 'degraded';
    updateAuthUI();
    renderNotificationUI();
    renderSectionFeedback('favoritesFeedback', {
      state: 'temporarily_unavailable',
      title: 'Saved locally — account sync temporarily unavailable',
      message: 'Your session is active, but BiteShark could not load account favorites right now.',
      nextStep: 'Favorites saved on this device remain available. Try again when ready.',
      correlationId: favRes.correlationId,
      onRetry: () => syncAuthAndUserData()
    });
    return;
  }

  isSignedIn = false;
  accountSyncState = 'local_only';
  notifySyncState = 'local_only';
  bookings = [];
  try { localStorage.removeItem('truckly_bookings'); } catch {}
  updateAuthUI();
  renderNotificationUI();
  renderBookings();
}

async function signOutUser() {
  let serverLoggedOut = false;
  try {
    if (window.biteshark && window.biteshark.auth && typeof window.biteshark.auth.signOut === 'function') {
      await window.biteshark.auth.signOut();
      serverLoggedOut = true;
    } else {
      const r = await appFetchJson('/api/auth/logout', {
        method: 'POST',
        isWrite: true,
        idempotentWrite: true,
        featureKey: 'auth_login',
        operationName: 'auth.logout',
        routeTemplate: '/api/auth/logout',
        headers: { 'X-BiteShark-Client': 'web-auth-v1' },
        body: {}
      });
      serverLoggedOut = r.ok || r.status === 401;
    }
    if (!serverLoggedOut) {
      toast('Sign-out failed — your server session may still be active. Please try signing out again.');
      return;
    }
  } catch {
    toast('Could not reach BiteShark to sign out — your session may still be active.');
    return;
  }
  isSignedIn = false;
  currentUser = null;
  accountSyncState = 'local_only';
  notifySyncState = 'local_only';
  bookings = [];
  try { localStorage.removeItem('truckly_bookings'); } catch {}
  updateAuthUI();
  renderNotificationUI();
  renderBookings();
  toast('Signed out — device-saved favorites remain on this browser');
}

async function toggleFav(id) {
  const adding = !favs.has(id);
  adding ? favs.add(id) : favs.delete(id);
  const storedLocally = safeStorageSet('truckly_favs', JSON.stringify([...favs]), 'favorites');
  applyFilters();
  renderFavorites();

  if (!isSignedIn) {
    renderSectionFeedback('favoritesFeedback', null);
    toast(
      storedLocally
        ? (adding ? 'Saved on this device (sign in to save to your account)' : 'Removed from this device')
        : (adding ? 'Saved for this tab only (browser storage unavailable)' : 'Removed for this tab')
    );
    return;
  }

  toast('Working — saving to your account…');
  const out = await appFetchJson(API + '/favorites/toggle', {
    method: 'POST',
    isWrite: true,
    idempotentWrite: true,
    featureKey: 'favorites',
    operationName: 'favorites.toggle',
    routeTemplate: '/api/favorites/toggle',
    body: { truck_id: id, desired_saved: adding }
  });

  if (out.ok) {
    out.data.saved ? favs.add(id) : favs.delete(id);
    safeStorageSet('truckly_favs', JSON.stringify([...favs]), 'favorites');
    accountSyncState = 'synced';
    updateAuthUI();
    applyFilters();
    renderFavorites();
    renderSectionFeedback('favoritesFeedback', null);
    toast(out.data.saved ? 'Saved to your account' : 'Removed from your account');
    return;
  }

  accountSyncState = 'degraded';
  if (out.status === 401) {
    isSignedIn = false;
    accountSyncState = 'local_only';
    updateAuthUI();
    renderNotificationUI();
    const msg = 'Your session ended — change saved on this device only. Sign in to save to your account.';
    renderSectionFeedback('favoritesFeedback', {
      state: 'saved_locally',
      title: 'Saved locally (session expired)',
      message: msg,
      loginHref: '/login.html?next=/'
    });
    toast(msg);
    return;
  }

  if (out.status === 403) {
    updateAuthUI();
    if (out.outcome === 'age_assessment_required') {
      const assessModal = document.getElementById('rxAgeAssessmentModal');
      if (assessModal) assessModal.hidden = false;
    }
    const msg = out.errorMessage || 'Saved on this device only — account action is restricted.';
    renderSectionFeedback('favoritesFeedback', {
      state: 'saved_locally',
      title: 'Saved locally only',
      message: msg,
      correlationId: out.correlationId
    });
    toast(msg);
    return;
  }

  updateAuthUI();
  const failMsg = adding
    ? 'Saved on this device only — could not save to your account right now.'
    : 'Updated on this device only — could not update your account right now.';
  renderSectionFeedback('favoritesFeedback', {
    state: 'partial_success',
    title: 'Saved locally — account save failed',
    message: failMsg,
    nextStep: 'Your choice is kept on this device. Retry saving to your account when ready.',
    correlationId: out.correlationId,
    onRetry: () => toggleFavRetry(id, adding)
  });
  toast(failMsg);
}

async function toggleFavRetry(id, desiredSaved) {
  if (!isSignedIn) return;
  const out = await appFetchJson(API + '/favorites/toggle', {
    method: 'POST',
    isWrite: true,
    idempotentWrite: true,
    featureKey: 'favorites',
    operationName: 'favorites.toggle_retry',
    routeTemplate: '/api/favorites/toggle',
    body: { truck_id: id, desired_saved: Boolean(desiredSaved) }
  });
  if (out.ok) {
    out.data.saved ? favs.add(id) : favs.delete(id);
    safeStorageSet('truckly_favs', JSON.stringify([...favs]), 'favorites');
    accountSyncState = 'synced';
    updateAuthUI();
    applyFilters();
    renderFavorites();
    renderSectionFeedback('favoritesFeedback', null);
    toast(out.data.saved ? 'Saved to your account' : 'Removed from your account');
  } else {
    toast(out.errorMessage || 'Still unable to save to your account right now.');
  }
}

function renderFavorites() {
  const el = document.getElementById('favoriteGrid');
  if (!el) return;
  const saved = trucks.filter(t => favs.has(t.id));
  el.innerHTML = saved.length
    ? saved.map(t => t.extra ? extraCard(t) : `<article class="favorite-item"><div class="truck-photo ${t.photo ? '' : 'icon-photo'}" style="${t.photo ? `background-image:url('${esc(t.photo)}')` : `background:${esc(t.color)}`}">${t.photo ? '' : `<span class="photo-emoji">${esc(t.emoji)}</span>`}</div><div><small>${esc(t.cuisine).toUpperCase()}</small><h3>${esc(t.name)}</h3><p class="meta">${t.verified && t.rating ? `★ ${esc(t.rating)} · ` : ''}${esc(distanceLabel(t, 'fav'))}</p><button class="detail-link" onclick="openDetail('${esc(t.id)}')">See where they are →</button></div></article>`).join('')
    : '<div class="empty">Tap a heart on the map or list to save your first favorite.</div>';
}

function renderNotificationUI() {
  const toggle = document.getElementById('nearbyAlertToggle');
  const select = document.getElementById('nearbyAlertRadius');
  const meta = document.getElementById('nearbyAlertMeta');
  if (!toggle || !select || !meta) return;

  toggle.checked = notifyPrefs.nearby_enabled !== false;
  const r = Math.max(1, Math.min(30, +notifyPrefs.radius_miles || 3));
  if (![...select.options].some(o => +o.value === r)) {
    const opt = document.createElement('option');
    opt.value = String(r);
    opt.textContent = `${r} mi`;
    select.appendChild(opt);
  }
  select.value = String(r);
  select.disabled = !toggle.checked || notifySyncState === 'working';
  toggle.disabled = notifySyncState === 'working';

  let syncText = 'saved on this device';
  if (notifySyncState === 'working') {
    syncText = 'saving to your account…';
  } else if (isSignedIn && notifySyncState === 'synced') {
    syncText = 'saved to your account';
  } else if (isSignedIn && notifySyncState === 'failed') {
    syncText = 'saved on this device only (account save failed)';
  }
  const betaNote = 'automatic proximity push alerts are not active yet';
  meta.textContent = toggle.checked
    ? `Within ${r} ${r === 1 ? 'mile' : 'miles'} · ${syncText} · ${betaNote}`
    : `Preference paused · ${syncText}`;
}

async function loadNotificationSettings() {
  const res = await appFetchJson(API + '/notifications/settings', {
    featureKey: 'notification_preferences',
    operationName: 'notifications.load_settings',
    routeTemplate: '/api/notifications/settings'
  });
  if (res.ok) {
    const data = res.data;
    notifyPrefs = {
      nearby_enabled: data.nearby_enabled !== false,
      radius_miles: Math.max(1, Math.min(30, +data.radius_miles || 3))
    };
    notifySyncState = 'synced';
    safeStorageSet('truckly_notify', JSON.stringify(notifyPrefs), 'notification_preferences');
  } else if (isSignedIn && res.status !== 401) {
    notifySyncState = 'local_only';
  }
  renderNotificationUI();
}

async function saveNotificationSettings() {
  const fc = typeof window !== 'undefined' && window.bitesharkFeatures ? window.bitesharkFeatures : null;
  if (fc && !fc.isAvailable('nearby_alert_preferences')) {
    toast(fc.getMessage('nearby_alert_preferences'));
    fc.syncDom();
    return;
  }
  const toggle = document.getElementById('nearbyAlertToggle');
  const select = document.getElementById('nearbyAlertRadius');
  if (!toggle || !select) return;

  notifyPrefs = {
    nearby_enabled: !!toggle.checked,
    radius_miles: Math.max(1, Math.min(30, +select.value || 3))
  };
  const localOk = safeStorageSet('truckly_notify', JSON.stringify(notifyPrefs), 'notification_preferences');

  if (!isSignedIn) {
    notifySyncState = 'local_only';
    renderNotificationUI();
    toast(
      localOk
        ? (notifyPrefs.nearby_enabled
            ? `Preference (${notifyPrefs.radius_miles} mi) saved on this device — automatic alerts are not active yet`
            : 'Nearby alert preference paused on this device')
        : 'Preference updated for this tab only (browser storage unavailable)'
    );
    return;
  }

  notifySyncState = 'working';
  renderNotificationUI();

  const out = await appFetchJson(API + '/notifications/settings', {
    method: 'POST',
    isWrite: true,
    idempotentWrite: true,
    featureKey: 'notification_preferences',
    operationName: 'notifications.save_settings',
    routeTemplate: '/api/notifications/settings',
    body: notifyPrefs
  });

  if (out.ok) {
    const saved = out.data;
    notifyPrefs = {
      nearby_enabled: saved.nearby_enabled !== false,
      radius_miles: Math.max(1, Math.min(30, +saved.radius_miles || notifyPrefs.radius_miles))
    };
    safeStorageSet('truckly_notify', JSON.stringify(notifyPrefs), 'notification_preferences');
    notifySyncState = 'synced';
    renderNotificationUI();
    renderSectionFeedback('favoritesFeedback', null);
    toast(
      notifyPrefs.nearby_enabled
        ? `Preference (${notifyPrefs.radius_miles} mi) saved to your account (automatic alerts not active yet)`
        : 'Nearby alert preference paused on your account'
    );
    return;
  }

  if (out.status === 401) {
    isSignedIn = false;
    accountSyncState = 'local_only';
    notifySyncState = 'local_only';
    updateAuthUI();
    renderNotificationUI();
    const msg = 'Session expired — preference saved on this device only. Sign in to save to your account.';
    renderSectionFeedback('favoritesFeedback', {
      state: 'saved_locally',
      title: 'Saved locally (session expired)',
      message: msg,
      loginHref: '/login.html?next=/'
    });
    toast(msg);
    return;
  }

  notifySyncState = 'failed';
  renderNotificationUI();
  const errMsg = out.errorMessage || 'Saved on this device only — could not save preference to your account.';
  renderSectionFeedback('favoritesFeedback', {
    state: 'partial_success',
    title: 'Saved locally — account save failed',
    message: errMsg,
    nextStep: 'Your preference is stored on this device. Retry saving to your account when ready.',
    correlationId: out.correlationId,
    onRetry: () => saveNotificationSettings()
  });
  toast('Saved on this device only — account save failed');
}

function toggleOpen() {
  openOnly = !openOnly;
  const btn = document.getElementById('openNow');
  if (btn) {
    btn.classList.toggle('active', openOnly);
    btn.setAttribute('aria-pressed', String(openOnly));
  }
  applyFilters();
}

function openDistance() {
  openAppModal('distanceModal', {
    initialFocusSelector: '#distanceRange',
    onClose: closeDistanceModal
  });
}

function closeDistanceModal() {
  closeAppModal('distanceModal');
}

function setDistance(v) {
  maxDistance = Math.max(1, Math.min(30, +v || 30));
  document.getElementById('distanceText').textContent = maxDistance + ' mi';
  document.getElementById('rangeValue').textContent = maxDistance + (maxDistance === 1 ? ' mile' : ' miles');
}

function setMode(mode) {
  if (mode === 'map' && isInteractiveMapDisabledByControl()) {
    mode = 'list';
  }

  const mapBtn = document.getElementById('mapMode');
  const listBtn = document.getElementById('listMode');
  const discover = document.getElementById('discoverScreen');
  if (mapBtn) {
    mapBtn.setAttribute('aria-pressed', String(mode === 'map'));
    mapBtn.classList.toggle('active', mode === 'map');
  }
  if (listBtn) {
    listBtn.setAttribute('aria-pressed', String(mode === 'list'));
    listBtn.classList.toggle('active', mode === 'list');
  }
  if (discover) {
    discover.classList.toggle('list-mode', mode === 'list');
  }

  if (mode === 'map') {
    const fc = typeof window !== 'undefined' && window.bitesharkFeatures ? window.bitesharkFeatures : null;
    if (
      fc &&
      typeof fc.isLoaded === 'function' &&
      !fc.isLoaded() &&
      typeof fc.waitUntilReady === 'function'
    ) {
      Promise.race([fc.waitUntilReady(), new Promise(resolve => setTimeout(resolve, 2000))]).then(() => {
        if (!discover || discover.classList.contains('list-mode')) return;
        if (isInteractiveMapDisabledByControl()) {
          setMode('list');
          return;
        }
        ensureMapInitialized();
        applyFilters();
        if (map && !mapRuntimeState.unavailable && typeof map.invalidateSize === 'function') {
          setTimeout(() => map.invalidateSize(), 40);
        }
      });
      return;
    }

    ensureMapInitialized();
    applyFilters();
    if (map && !mapRuntimeState.unavailable && typeof map.invalidateSize === 'function') {
      setTimeout(() => map.invalidateSize(), 40);
    }
    return;
  }

  applyFilters();
}

function continueInListFromMapFallback() {
  setMode('list');
  const listBtn = document.getElementById('listMode');
  if (listBtn && typeof listBtn.focus === 'function') {
    listBtn.focus();
  }
}

function retryInteractiveMap() {
  if (isInteractiveMapDisabledByControl()) {
    setMode('list');
    return;
  }

  const cooldownMs = Math.max(
    400,
    Number((typeof window !== 'undefined' && window.__BITESHARK_MAP_RETRY_COOLDOWN_MS) || 4000)
  );
  const now = Date.now();
  const elapsed = now - mapRuntimeState.lastRetryAt;

  if (mapRuntimeState.retryInFlight || (mapRuntimeState.lastRetryAt > 0 && elapsed < cooldownMs)) {
    const remainingSec = Math.max(1, Math.ceil((cooldownMs - Math.max(0, elapsed)) / 1000));
    const retryMsg = `Please wait ${remainingSec}s before retrying the map.`;
    const hintEl = document.getElementById('mapFallbackHint');
    const statusEl = document.getElementById('mapFallbackStatus');
    const retryBtn = document.getElementById('mapFallbackRetryBtn');
    if (hintEl) {
      hintEl.textContent = retryMsg;
      hintEl.hidden = false;
    }
    if (statusEl) statusEl.textContent = retryMsg;
    if (retryBtn) {
      retryBtn.disabled = true;
      if (mapRuntimeState.cooldownTimer) clearTimeout(mapRuntimeState.cooldownTimer);
      mapRuntimeState.cooldownTimer = setTimeout(() => {
        retryBtn.disabled = false;
        if (hintEl) hintEl.hidden = true;
      }, Math.max(200, cooldownMs - Math.max(0, elapsed)));
    }
    return;
  }

  mapRuntimeState.lastRetryAt = now;
  mapRuntimeState.retryInFlight = true;
  const retryBtn = document.getElementById('mapFallbackRetryBtn');
  if (retryBtn) retryBtn.disabled = false;
  const statusEl = document.getElementById('mapFallbackStatus');
  if (statusEl) statusEl.textContent = 'Retrying map…';

  ensureMapInitialized({ forceRetry: true });
  applyFilters();
  if (map && !mapRuntimeState.unavailable && typeof map.invalidateSize === 'function') {
    setTimeout(() => map.invalidateSize(), 40);
  }
}

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(name + 'Screen').classList.add('active');
  document.querySelectorAll('.bottom-nav button[data-screen]').forEach(b => b.classList.toggle('active', b.dataset.screen === name));
  if (name === 'discover') {
    if (map) setTimeout(() => map.invalidateSize(), 30);
    refreshDiscoveryCatalog({ fresh: false });
  }
  if (name === 'favorites') renderFavorites();
  if (name === 'bookings') {
    renderBookings();
    if (isSignedIn) loadUserBookings();
  }
  if (name === 'owner') loadOwnerDashboard();
}

function locateMe() {
  if (!navigator.geolocation) return toast('Location isn’t available on this device');
  navigator.geolocation.getCurrentPosition(
    async p => {
      userCoords = { lat: p.coords.latitude, lng: p.coords.longitude };
      recomputeDistances();

      if (map && typeof L !== 'undefined') {
        const userIcon = L.divIcon({
          className: '',
          html: '<div class="user-pin" title="Your location"></div>',
          iconSize: [18, 18],
          iconAnchor: [9, 9]
        });
        if (userMarker) userMarker.setLatLng([userCoords.lat, userCoords.lng]);
        else userMarker = L.marker([userCoords.lat, userCoords.lng], { icon: userIcon }).addTo(map);
        map.flyTo([userCoords.lat, userCoords.lng], 13, isReducedMotion() ? { animate: false, duration: 0 } : { duration: 0.65 });
      }

      let label = 'Near me';
      try {
        const r = await fetch(`${API}/trucks/nearby?lat=${encodeURIComponent(userCoords.lat)}&lng=${encodeURIComponent(userCoords.lng)}`);
        if (r.ok) {
          const data = await r.json();
          const nearest = Array.isArray(data.nearest_hubs) ? data.nearest_hubs[0] : null;
          if (nearest && nearest.distance_miles <= 15) label = `Near ${nearest.city}`;
        } else {
          throw new Error('fallback');
        }
      } catch {
        const nearest = HUBS
          .map(h => ({ ...h, d: milesBetween(userCoords.lat, userCoords.lng, h.lat, h.lng) }))
          .sort((a, b) => a.d - b.d)[0];
        if (nearest && nearest.d <= 15) label = `Near ${nearest.city}`;
      }

      const locLbl = document.getElementById('locationLabel');
      if (locLbl) locLbl.textContent = label;
      const locBtn = document.getElementById('locationPillBtn');
      if (locBtn) locBtn.setAttribute('aria-label', `Use my location (currently ${label})`);
      applyFilters();
      renderFavorites();
      toast('Distances updated from your location');
    },
    () => toast('Turn on location access to calculate nearby distances'),
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
  );
}

function setBookingFieldInvalid(fieldIds = [], isInvalid = false) {
  ['bookingTruck', 'eventDate', 'guestCount', 'eventLocation'].forEach(fid => {
    const el = document.getElementById(fid);
    if (!el) return;
    const mark = isInvalid && fieldIds.includes(fid);
    if (mark) {
      if (typeof el.setAttribute === 'function') {
        el.setAttribute('aria-invalid', 'true');
        el.setAttribute('aria-describedby', 'bookingError');
      }
    } else if (typeof el.removeAttribute === 'function') {
      el.removeAttribute('aria-invalid');
    }
  });
}

function setBookingError(msg, corrId = null, invalidFieldIds = []) {
  const el = document.getElementById('bookingError');
  if (!el) return;
  setBookingFieldInvalid(invalidFieldIds, Boolean(msg));
  if (msg) {
    const refSuffix = corrId ? ` (Support ref: ${corrId})` : '';
    el.textContent = `${msg}${refSuffix}`;
    el.hidden = false;
  } else {
    el.textContent = '';
    el.hidden = true;
  }
}

function validateBookingChoice() {
  const chosen = document.querySelector('input[name="bookingPackage"]:checked');
  const pkg = PACKAGES[chosen?.value];
  const guests = Number(document.getElementById('guestCount')?.value);
  if (!pkg) {
    setBookingError('Choose a booking package.');
    return false;
  }
  if (!Number.isFinite(guests) || !Number.isInteger(guests) || guests < 10) {
    setBookingError('Please enter a whole number of at least 10 guests.', null, ['guestCount']);
    return false;
  }
  if (guests > pkg.max) {
    setBookingError(`${pkg.name} covers up to ${pkg.max} guests. Choose a larger package or reduce the guest count.`, null, ['guestCount']);
    return false;
  }
  setBookingError('');
  return true;
}

let bookingDateBlocked = false;
let bookingsLoadState = 'idle'; // 'idle' | 'loading' | 'ready' | 'error'
let bookingsLoadCorr = null;

function makeIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'idem-' + Date.now() + '-' + Math.random().toString(36).slice(2, 12);
}

function populateBookingTruckSelect(preferredId) {
  const sel = document.getElementById('bookingTruck');
  if (!sel) return;
  const eligible = trucks.filter(t => !t.extra);
  const current = preferredId && preferredId !== 'owner-truck' ? preferredId : sel.value;
  sel.innerHTML =
    '<option value="">Choose an eligible food truck</option>' +
    eligible.map(t => `<option value="${esc(t.id)}">${esc(t.name)} · ${esc(t.city)}</option>`).join('');
  sel.value = eligible.some(t => t.id === current) ? current : '';
}

function onBookingTruckChange() {
  const sel = document.getElementById('bookingTruck');
  const t = sel ? trucks.find(x => !x.extra && x.id === sel.value) : null;
  const lbl = document.getElementById('bookingTruckLabel');
  if (lbl) {
    lbl.textContent = t
      ? `Send an event inquiry to ${t.name}.`
      : 'Send an event inquiry. The vendor will review and confirm availability.';
  }
  setBookingError('');
  checkBookingAvailability();
}

async function checkBookingAvailability() {
  bookingDateBlocked = false;
  const truckId = (document.getElementById('bookingTruck')?.value || '').trim();
  const dateVal = (document.getElementById('eventDate')?.value || '').trim();
  if (!truckId || !/^\d{4}-\d{2}-\d{2}$/.test(dateVal)) return true;

  const res = await appFetchJson(
    `${API}/trucks/availability?truck_id=${encodeURIComponent(truckId)}&date=${encodeURIComponent(dateVal)}`,
    {
      featureKey: 'bookings_inquiries',
      operationName: 'bookings.check_availability',
      routeTemplate: '/api/trucks/availability'
    }
  );
  if (res.status === 503 || res.status === 0 || (!res.ok && res.status >= 500)) {
    bookingDateBlocked = true;
    setBookingError(
      'Vendor availability is temporarily unavailable and cannot be verified right now. Please try again in a moment.',
      res.correlationId,
      ['eventDate']
    );
    return false;
  }
  if (res.ok) {
    const out = res.data;
    if (out.requestable === false) {
      const t = trucks.find(x => x.id === truckId);
      const name = t ? t.name : 'This vendor';
      bookingDateBlocked = true;
      if (out.reason === 'bookings_paused') {
        setBookingError(`${name} has paused new event booking inquiries right now. Please choose another food truck.`, null, ['bookingTruck']);
      } else if (out.reason === 'past_or_same_day_pacific') {
        setBookingError('Event inquiries must be scheduled for a future calendar date (Pacific time).', null, ['eventDate']);
      } else if (out.reason === 'vendor_not_bookable') {
        setBookingError(`${name} is not eligible for event booking requests.`, null, ['bookingTruck']);
      } else {
        setBookingError(`${name} marked ${dateVal} as unavailable for event bookings. Please choose another date or truck.`, null, ['eventDate']);
      }
      return false;
    }
  }
  return true;
}

function openBooking(id) {
  const fc = typeof window !== 'undefined' && window.bitesharkFeatures ? window.bitesharkFeatures : null;
  if (fc && fc.isHidden('event_inquiries')) {
    toast(fc.getMessage('event_inquiries'));
    return;
  }
  const t = id && id !== 'owner-truck' ? trucks.find(x => !x.extra && x.id === id) : null;
  populateBookingTruckSelect(t ? t.id : '');
  const lbl = document.getElementById('bookingTruckLabel');
  if (lbl) {
    lbl.textContent = t
      ? `Send an event inquiry to ${t.name}.`
      : 'Send an event inquiry. The vendor will review and confirm availability.';
  }
  const authNotice = document.getElementById('bookingAuthNotice');
  if (authNotice) authNotice.hidden = isSignedIn;
  const dateInput = document.getElementById('eventDate');
  const minDate = addDaysISO(todayPacificISO(), 1);
  if (dateInput) {
    dateInput.min = minDate;
    if (!dateInput.value || dateInput.value < minDate) dateInput.value = defaultEventDate();
  }
  bookingDateBlocked = false;
  setBookingError('');
  openAppModal('bookingModal', {
    initialFocusSelector: '#bookingTruck',
    onClose: closeBooking
  });
  if (fc) fc.syncDom();
  if (t && (!fc || fc.isAvailable('event_inquiries'))) checkBookingAvailability();
}

function closeBooking() {
  bookingDateBlocked = false;
  setBookingError('');
  closeAppModal('bookingModal');
}

async function submitBooking(e) {
  e.preventDefault();
  if (!validateBookingChoice()) return;

  if (!isSignedIn) {
    const authNotice = document.getElementById('bookingAuthNotice');
    if (authNotice) authNotice.hidden = false;
    const msg = 'Please sign in first so your event inquiry is linked to your account.';
    setBookingError(msg);
    toast(msg);
    return;
  }

  const truckVal = (document.getElementById('bookingTruck')?.value || '').trim();
  const truck = trucks.find(t => !t.extra && t.id === truckVal);
  if (!truck) {
    const msg = 'Choose an eligible food truck for your event.';
    setBookingError(msg, null, ['bookingTruck']);
    toast(msg);
    return;
  }

  if (bookingDateBlocked || !(await checkBookingAvailability())) return;

  const chosen = document.querySelector('input[name="bookingPackage"]:checked');
  const pkgId = chosen?.value || '';
  const pkg = PACKAGES[pkgId];
  const eventType = document.getElementById('eventType').value.trim();
  const eventDate = document.getElementById('eventDate').value.trim();
  const guestCount = Number(document.getElementById('guestCount').value);
  const location = document.getElementById('eventLocation').value.trim();
  const note = document.getElementById('eventNote').value.trim();

  if (eventType.length < 2 || !eventDate || location.length < 3 || !Number.isInteger(guestCount) || guestCount < 10) {
    const invalidIds = [];
    if (!eventDate) invalidIds.push('eventDate');
    if (location.length < 3) invalidIds.push('eventLocation');
    if (!Number.isInteger(guestCount) || guestCount < 10) invalidIds.push('guestCount');
    const msg = 'Please include an event type, future date, location (3+ chars), and at least 10 guests.';
    setBookingError(msg, null, invalidIds);
    toast(msg);
    return;
  }

  const sig = JSON.stringify([truck.id, pkgId, eventType, eventDate, guestCount, location, note]);
  if (!bookingDraftKey || bookingDraftSignature !== sig) {
    bookingDraftKey = makeIdempotencyKey();
    bookingDraftSignature = sig;
  }

  const data = {
    truck_id: truck.id,
    package_id: pkgId,
    event_type: eventType,
    event_date: eventDate,
    guest_count: guestCount,
    location,
    note,
    idempotency_key: bookingDraftKey
  };

  const submitBtn = document.getElementById('bookingSubmitBtn');
  const origBtnHtml = submitBtn ? submitBtn.innerHTML : '';
  if (submitBtn) {
    submitBtn.disabled = true;
    if (typeof submitBtn.setAttribute === 'function') submitBtn.setAttribute('aria-busy', 'true');
    submitBtn.textContent = '⏳ Working — sending inquiry…';
  }
  setBookingError('');

  try {
    const out = await appFetchJson(API + '/bookings/create', {
      method: 'POST',
      isWrite: true,
      idempotentWrite: true,
      featureKey: 'bookings_inquiries',
      operationName: 'bookings.create_inquiry',
      routeTemplate: '/api/bookings/create',
      headers: {
        'Idempotency-Key': bookingDraftKey
      },
      body: data
    });

    if (out.status === 401) {
      isSignedIn = false;
      updateAuthUI();
      const authNotice = document.getElementById('bookingAuthNotice');
      if (authNotice) authNotice.hidden = false;
      const msg = out.data?.error || 'Your session expired. Sign in again — your inquiry draft is still here.';
      setBookingError(msg);
      toast(msg);
      return;
    }

    if (out.uncertainWrite || out.timedOut) {
      // Reconcile before inviting a retry so we never encourage blind duplicate submission!
      await loadUserBookings();
      const matched = bookings.find(
        b => b.truck_id === truck.id && toCalendarDateISO(b.event_date) === eventDate && String(b.location || '') === location
      );
      if (matched) {
        bookingDraftKey = null;
        bookingDraftSignature = '';
        closeBooking();
        if (e.target && typeof e.target.reset === 'function') e.target.reset();
        const ed = document.getElementById('eventDate');
        if (ed) ed.value = defaultEventDate();
        renderBookings();
        toast('Submitted for review — inquiry confirmed on your account after connection delay.');
        showScreen('bookings');
        return;
      }
      const uncMsg =
        'Outcome uncertain — BiteShark timed out before confirming your inquiry. Your form input is preserved, and clicking Send inquiry again safely reuses the same request key without creating duplicates.';
      setBookingError(uncMsg, out.correlationId);
      toast('Outcome uncertain — review details or safely retry.');
      return;
    }

    if (!out.ok) {
      const msg =
        out.status === 0
          ? 'Could not reach BiteShark right now. Check your connection and retry — duplicate sends are protected.'
          : (out.data?.error || out.errorMessage || 'Could not submit your booking request. Please review your details and try again.');
      setBookingError(msg, out.correlationId);
      toast(msg);
      return;
    }

    const payload = out.data;
    bookingDraftKey = null;
    bookingDraftSignature = '';

    const savedBooking = {
      id: payload.id,
      truck_id: payload.truck_id || truck.id,
      truck_name: payload.truck_name || truck.name,
      event_type: payload.event_type || eventType,
      event_date: toCalendarDateISO(payload.event_date || eventDate),
      guest_count: payload.guest_count ?? guestCount,
      location: payload.location || location,
      status: payload.status || 'pending',
      package_id: payload.package_id || pkgId,
      package_name: payload.package_name || pkg.name,
      package_price: payload.package_price ?? pkg.price,
      created_at: payload.created_at || new Date().toISOString()
    };
    bookings = [savedBooking, ...bookings.filter(b => String(b.id) !== String(savedBooking.id))];
    bookingsLoadState = 'ready';

    closeBooking();
    if (e.target && typeof e.target.reset === 'function') e.target.reset();
    const ed = document.getElementById('eventDate');
    if (ed) ed.value = defaultEventDate();
    renderBookings();
    renderSectionFeedback('bookingsFeedback', {
      state: 'submitted_for_review',
      title: payload.idempotent_replay ? 'Inquiry already submitted for review' : 'Submitted for vendor review',
      message: `Your inquiry for ${savedBooking.truck_name} (${savedBooking.event_date}) is pending vendor review — it is not a confirmed or paid reservation yet.`,
      nextStep: 'Track vendor acceptance or updates below on this screen.'
    });
    if (isSignedIn) loadUserBookings();
    toast(payload.idempotent_replay ? 'Inquiry already received — showing your existing request.' : 'Submitted for review — pending vendor response.');
    showScreen('bookings');
  } finally {
    const fc = typeof window !== 'undefined' && window.bitesharkFeatures ? window.bitesharkFeatures : null;
    if (submitBtn) {
      if (origBtnHtml) submitBtn.innerHTML = origBtnHtml;
      if (typeof submitBtn.removeAttribute === 'function') submitBtn.removeAttribute('aria-busy');
      submitBtn.disabled = Boolean(fc && !fc.isAvailable('event_inquiries'));
    }
  }
}

async function loadUserBookings() {
  bookingsLoadState = 'loading';
  renderBookings();

  const res = await appFetchJson(API + '/bookings/list', {
    featureKey: 'bookings_inquiries',
    operationName: 'bookings.load_user_list',
    routeTemplate: '/api/bookings/list'
  });

  if (res.status === 401) {
    isSignedIn = false;
    accountSyncState = 'local_only';
    bookings = [];
    bookingsLoadState = 'idle';
    updateAuthUI();
    renderSectionFeedback('bookingsFeedback', null);
    renderBookings();
    return;
  }

  if (!res.ok) {
    bookingsLoadState = 'error';
    bookingsLoadCorr = res.correlationId;
    renderSectionFeedback('bookingsFeedback', {
      state: 'temporarily_unavailable',
      title: 'Temporarily unavailable — could not load event inquiries',
      message: res.errorMessage || 'BiteShark could not load your event inquiries right now.',
      nextStep: 'Your saved inquiries were not deleted. Retry loading in a moment.',
      correlationId: res.correlationId,
      onRetry: () => loadUserBookings()
    });
    renderBookings();
    return;
  }

  const data = res.data;
  if (Array.isArray(data.bookings)) {
    bookings = data.bookings.map(b => ({
      ...b,
      event_date: toCalendarDateISO(b.event_date)
    }));
  }
  bookingsLoadState = 'ready';
  bookingsLoadCorr = null;
  renderBookings();
}

function formatBookingStatus(raw) {
  const s = String(raw || 'pending').toLowerCase();
  if (s === 'accepted') return { label: 'Accepted · Confirm with vendor', cls: 'status-accepted' };
  if (s === 'declined') return { label: 'Declined', cls: 'status-declined' };
  if (s === 'cancelled') return { label: 'Cancelled', cls: 'status-declined' };
  return { label: 'Pending inquiry', cls: 'status-pending' };
}

function renderBookings() {
  const el = document.getElementById('bookingList');
  if (!el) return;
  if (!isSignedIn && !bookings.length) {
    el.innerHTML = '<div class="empty">Sign in to view your event inquiries and track vendor responses. <a href="/login.html?next=/">Sign in →</a></div>';
    return;
  }
  if (bookingsLoadState === 'loading' && !bookings.length) {
    el.innerHTML = '<div class="loading-state" role="status">⏳ Loading your event inquiries…</div>';
    return;
  }
  if (bookingsLoadState === 'error' && !bookings.length) {
    el.innerHTML = `<div class="empty">⏸ Event inquiries are temporarily unavailable right now.${bookingsLoadCorr ? ` (Support ref: <code>${esc(bookingsLoadCorr)}</code>)` : ''}</div>`;
    return;
  }
  el.innerHTML = bookings.length
    ? bookings.map(b => {
        const d = parseEventDate(b.event_date);
        const month = d ? d.toLocaleString('en', { month: 'short' }).toUpperCase() : 'TBD';
        const day = d ? d.getDate() : '—';
        const st = formatBookingStatus(b.status);
        return `<article class="booking-item"><div class="date-box"><small>${esc(month)}</small><b>${esc(day)}</b></div><div class="booking-main"><h3>${esc(b.truck_name)}</h3><div class="meta">${esc(b.event_type)} · ${esc(b.guest_count)} guests · ${esc(b.location)}${b.package_name ? ` · ${esc(b.package_name)}` : ''}${b.package_price ? ` ($${Number(b.package_price).toLocaleString()})` : ''}</div></div><span class="booking-status ${st.cls}">${esc(st.label)}</span></article>`;
      }).join('')
    : '<div class="empty">No event inquiries yet. Tap Book below to send an inquiry to an eligible food truck.</div>';
}

let isOwnerAdmin = false;
let ownerAccess = { isPlatformAdmin: false, isModerator: false, vendors: [] };
let ownerTruckId = (() => {
  try {
    const saved = localStorage.getItem('truckly_owner_truck_id');
    return saved && saved !== 'estrella' && saved !== 'owner-truck' ? saved : 'mitote';
  } catch {
    return 'mitote';
  }
})();
let ownerRequestFilter = 'pending';
let ownerProfile = safeJSON('truckly_owner_profile', {
  truck_id: ownerTruckId,
  display_name: 'Mitote Food Park',
  cuisine: 'Mexican',
  description: 'Keep Sonoma County regulars in the loop.',
  accepting_bookings: true
});
let ownerSchedule = (() => {
  const s = safeJSON('truckly_owner_schedule', []);
  return Array.isArray(s) ? s : [];
})();
let previewOwnerRows = null;

function getActiveVendorRole() {
  if (!isOwnerAdmin) return 'preview';
  if (ownerAccess.isPlatformAdmin) return 'platform_admin';
  const match = ownerAccess.vendors.find(v => v.vendor_id === ownerTruckId);
  return match ? match.role : null;
}

function futureDateISO(daysAhead) {
  return addDaysISO(todayPacificISO(), daysAhead);
}

function todayPacificISO() {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());
  } catch {
    const now = new Date();
    return (
      now.getFullYear() +
      '-' +
      String(now.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(now.getDate()).padStart(2, '0')
    );
  }
}

function getPreviewOwnerRows() {
  if (!previewOwnerRows) {
    previewOwnerRows = [
      { id: 'preview-1', event_type: 'Office lunch', event_date: futureDateISO(5), guest_count: 85, location: 'Downtown Santa Rosa', requester: 'Maya R. (sample)', package_name: 'Party Favorite', package_price: 1500, status: 'pending' },
      { id: 'preview-2', event_type: 'Birthday party', event_date: futureDateISO(10), guest_count: 45, location: 'Petaluma', requester: 'Alex T. (sample)', package_name: 'Neighborhood Drop-in', package_price: 750, status: 'pending' },
      { id: 'preview-3', event_type: 'Community event', event_date: futureDateISO(18), guest_count: 160, location: 'Rohnert Park', requester: 'Sonoma PTA (sample)', package_name: 'Full Festival', package_price: 2900, status: 'pending' }
    ];
  }
  return previewOwnerRows;
}

function populateOwnerTruckSelect() {
  const sel = document.getElementById('ownerTruckSelect');
  if (!sel) return;

  let items;
  if (isOwnerAdmin && !ownerAccess.isPlatformAdmin && ownerAccess.vendors.length > 0) {
    items = ownerAccess.vendors.map(v => {
      const cat = trucks.find(t => t.id === v.vendor_id);
      const emoji = cat?.emoji || '🚚';
      const name = v.canonical_name || cat?.name || v.vendor_id;
      return { id: v.vendor_id, label: `${emoji} ${name} (${v.role})` };
    });
  } else {
    items = trucks.map(t => ({ id: t.id, label: `${t.emoji || '🚚'} ${t.name}` }));
  }

  if (!items.length) {
    items = [{ id: 'mitote', label: '🎉 Mitote Food Park' }];
  }

  sel.innerHTML = items.map(x => `<option value="${esc(x.id)}">${esc(x.label)}</option>`).join('');
  if (!items.some(x => x.id === ownerTruckId)) {
    ownerTruckId = items[0].id;
  }
  sel.value = ownerTruckId;
}

function syncOwnerPermissionsUI() {
  const modCard = document.getElementById('ownerModerationCard');
  if (modCard) {
    modCard.hidden = isOwnerAdmin && !ownerAccess.isModerator && !ownerAccess.isPlatformAdmin;
  }

  const editBtn = document.getElementById('ownerEditProfileBtn');
  const editSub = document.getElementById('ownerEditProfileSub');
  const role = getActiveVendorRole();
  const staffRestricted = isOwnerAdmin && role === 'staff';
  if (editBtn) editBtn.disabled = staffRestricted;
  if (editSub) {
    editSub.textContent = staffRestricted
      ? 'Vendor owner permission required'
      : 'Update name, cuisine, bio & booking status';
  }
}

function renderOwnerHeader() {
  const catalogMatch = trucks.find(t => t.id === ownerTruckId);
  const titleEl = document.getElementById('ownerTitle');
  const subEl = document.getElementById('ownerSubtitle');
  const logoEl = document.getElementById('ownerLogo');
  const pinEl = document.getElementById('ownerPinEmoji');
  const pillEl = document.getElementById('ownerStatusPill');
  const pagerVendorEl = document.getElementById('pagerVendor');
  const emoji = catalogMatch?.emoji || '🌮';
  const name = ownerProfile.display_name || catalogMatch?.name || 'Your Food Truck';
  const accepting = ownerProfile.accepting_bookings !== false;

  if (titleEl) titleEl.textContent = name;
  if (subEl) subEl.textContent = ownerProfile.description || catalogMatch?.blurb || 'Keep Sonoma County regulars in the loop.';
  if (logoEl) logoEl.textContent = emoji;
  if (pinEl) pinEl.textContent = emoji;
  if (pagerVendorEl) pagerVendorEl.value = name;
  if (pillEl) {
    pillEl.textContent = accepting ? '● Accepting bookings' : '○ Bookings paused';
    pillEl.classList.toggle('paused', !accepting);
  }
  syncOwnerPermissionsUI();
  if (typeof window !== 'undefined' && typeof window.bitesharkSyncOwnerVendorContext === 'function') {
    window.bitesharkSyncOwnerVendorContext(ownerTruckId);
  }
}

function renderOwnerStats(stats) {
  const totalEl = document.getElementById('statTotalRequests');
  const pendingEl = document.getElementById('statPendingRequests');
  const acceptedEl = document.getElementById('statAcceptedRequests');
  const badgeEl = document.getElementById('ownerRequestCount');
  if (totalEl) totalEl.textContent = String(stats.total_requests ?? 0);
  if (pendingEl) pendingEl.textContent = String(stats.pending ?? 0);
  if (acceptedEl) acceptedEl.textContent = String(stats.accepted ?? 0);
  if (badgeEl) badgeEl.textContent = String(stats.pending ?? 0);
}

function syncOwnerScheduleDay() {
  const dateInput = document.getElementById('ownerScheduleDate');
  const dayLabel = document.getElementById('ownerScheduleWeekday');
  if (!dateInput) return;
  if (!dateInput.value) dateInput.value = todayPacificISO();
  const d = parseEventDate(dateInput.value);
  if (dayLabel) dayLabel.textContent = d ? d.toLocaleString('en', { weekday: 'short' }) : 'Date';

  const existing = ownerSchedule.find(s => toCalendarDateISO(s.service_date) === dateInput.value && (!s.truck_id || s.truck_id === ownerTruckId));
  if (existing) {
    const opensEl = document.getElementById('ownerOpensAt');
    const closesEl = document.getElementById('ownerClosesAt');
    const openToggle = document.getElementById('ownerIsOpen');
    if (opensEl && existing.opens_at) opensEl.value = String(existing.opens_at).slice(0, 5);
    if (closesEl && existing.closes_at) closesEl.value = String(existing.closes_at).slice(0, 5);
    if (openToggle) openToggle.checked = existing.status !== 'unavailable';
  }
}

function renderOwnerScheduleList() {
  const el = document.getElementById('ownerScheduleList');
  if (!el) return;
  const upcoming = ownerSchedule
    .filter(s => !s.truck_id || s.truck_id === ownerTruckId)
    .slice(0, 4);
  el.innerHTML = upcoming.length
    ? upcoming.map(s => {
        const dayStr = toCalendarDateISO(s.service_date);
        const d = parseEventDate(dayStr);
        const label = d ? d.toLocaleString('en', { weekday: 'short', month: 'short', day: 'numeric' }) : dayStr;
        const hrs = s.status === 'unavailable'
          ? 'Unavailable'
          : `${s.opens_at ? String(s.opens_at).slice(0, 5) : '11:00'}–${s.closes_at ? String(s.closes_at).slice(0, 5) : '20:00'}`;
        return `<div class="schedule-chip"><b>${esc(label)}</b><small>${esc(hrs)}${s.location ? ' · ' + esc(s.location) : ''}</small></div>`;
      }).join('')
    : '';
}

async function selectOwnerTruck(id) {
  ownerTruckId = id && id !== 'owner-truck' ? id : 'mitote';
  try { localStorage.setItem('truckly_owner_truck_id', ownerTruckId); } catch {}
  await loadOwnerDashboard();
  const kp = document.getElementById('kitchenPanel');
  if (kp && !kp.hidden && typeof loadKitchen === 'function') {
    await loadKitchen();
  }
}

let ownerDashboardUnavailable = false;
let ownerLastKnownLocationHours = { opens_at: null, closes_at: null };

async function loadOwnerDashboard() {
  populateOwnerTruckSelect();
  const schedDate = document.getElementById('ownerScheduleDate');
  if (schedDate && !schedDate.value) schedDate.value = todayPacificISO();

  const banner = document.getElementById('ownerModeBanner');
  ownerDashboardUnavailable = false;

  const statsOut = await appFetchJson(API + '/owner/stats', {
    featureKey: 'vendor_publishing',
    operationName: 'owner.load_stats',
    routeTemplate: '/api/owner/stats'
  });

  if (statsOut.ok) {
    isOwnerAdmin = true;
    if (banner) banner.hidden = true;
    const stats = statsOut.data;
    if (stats.actor && typeof stats.actor === 'object') {
      ownerAccess = {
        isPlatformAdmin: !!stats.actor.is_platform_admin,
        isModerator: !!stats.actor.is_moderator,
        vendors: Array.isArray(stats.actor.vendors) ? stats.actor.vendors : []
      };
    } else {
      ownerAccess = { isPlatformAdmin: true, isModerator: true, vendors: [] };
    }

    populateOwnerTruckSelect();
    const qId = encodeURIComponent(ownerTruckId);

    const needScopedStats = ownerAccess.isPlatformAdmin || ownerAccess.vendors.length > 1;
    const [scopedStatsRes, profRes, locRes, schedRes] = await Promise.all([
      needScopedStats
        ? appFetchJson(`${API}/owner/stats?truck_id=${qId}`, {
            featureKey: 'vendor_publishing',
            operationName: 'owner.load_scoped_stats',
            routeTemplate: '/api/owner/stats'
          })
        : Promise.resolve(null),
      appFetchJson(`${API}/owner/profile?truck_id=${qId}`, {
        featureKey: 'vendor_publishing',
        operationName: 'owner.load_profile',
        routeTemplate: '/api/owner/profile'
      }),
      appFetchJson(`${API}/owner/location?truck_id=${qId}`, {
        featureKey: 'vendor_publishing',
        operationName: 'owner.load_location',
        routeTemplate: '/api/owner/location'
      }),
      appFetchJson(`${API}/owner/schedule?truck_id=${qId}`, {
        featureKey: 'vendor_schedules',
        operationName: 'owner.load_schedule',
        routeTemplate: '/api/owner/schedule'
      })
    ]);

    if (scopedStatsRes && scopedStatsRes.ok) {
      renderOwnerStats(scopedStatsRes.data);
    } else {
      renderOwnerStats(stats);
    }

    const partialFailures = [];
    let partialCorr = null;

    if (profRes && profRes.ok) {
      const p = profRes.data;
      const cat = trucks.find(t => t.id === ownerTruckId);
      ownerProfile = {
        truck_id: ownerTruckId,
        display_name: p.display_name || cat?.name || 'Your Food Truck',
        cuisine: p.cuisine || cat?.cuisine || 'Mexican',
        description: p.description || cat?.blurb || 'Keep Sonoma County regulars in the loop.',
        accepting_bookings: p.accepting_bookings !== false
      };
    } else if (profRes && !profRes.ok) {
      partialFailures.push('listing profile');
      partialCorr = partialCorr || profRes.correlationId;
    }

    if (locRes && locRes.ok) {
      const loc = locRes.data;
      const locInput = document.getElementById('ownerLocation');
      const latInput = document.getElementById('ownerLat');
      const lngInput = document.getElementById('ownerLng');
      const openToggle = document.getElementById('ownerIsOpen');
      const opensEl = document.getElementById('ownerOpensAt');
      const closesEl = document.getElementById('ownerClosesAt');
      if (locInput && loc.location) locInput.value = loc.location;
      if (latInput) latInput.value = loc.lat != null ? String(loc.lat) : '';
      if (lngInput) lngInput.value = loc.lng != null ? String(loc.lng) : '';
      if (openToggle && typeof loc.is_open === 'boolean') openToggle.checked = loc.is_open;
      ownerLastKnownLocationHours = {
        opens_at: loc.opens_at || null,
        closes_at: loc.closes_at || null
      };
      if (opensEl && loc.opens_at) opensEl.value = String(loc.opens_at).slice(0, 5);
      if (closesEl && loc.closes_at) closesEl.value = String(loc.closes_at).slice(0, 5);
    } else if (locRes && !locRes.ok) {
      partialFailures.push('live location');
      partialCorr = partialCorr || locRes.correlationId;
    }

    if (schedRes && schedRes.ok) {
      const sData = schedRes.data;
      ownerSchedule = Array.isArray(sData.schedule) ? sData.schedule : [];
    } else if (schedRes && !schedRes.ok) {
      partialFailures.push('service schedule');
      partialCorr = partialCorr || schedRes.correlationId;
    }

    if (partialFailures.length > 0) {
      renderSectionFeedback('ownerFeedback', {
        state: 'partial_success',
        title: 'Partial dashboard load',
        message: `Loaded your vendor workspace, but could not refresh: ${partialFailures.join(', ')}.`,
        nextStep: 'Displayed fields may show cached values. Retry before publishing updates.',
        correlationId: partialCorr,
        onRetry: () => loadOwnerDashboard()
      });
    } else {
      renderSectionFeedback('ownerFeedback', null);
    }

    populateOwnerTruckSelect();
    renderOwnerHeader();
    syncOwnerScheduleDay();
    renderOwnerScheduleList();
    await loadOwnerRequests();
    return;
  }

  // CRITICAL RELIABILITY GUARD: Never drop authenticated vendors into fake sample Preview Mode on 5xx / timeout / offline!
  if (statsOut.status !== 401 && statsOut.status !== 403) {
    ownerDashboardUnavailable = true;
    if (banner) banner.hidden = true;
    renderOwnerStats({ total_requests: '—', pending: '—', accepted: '—' });
    renderSectionFeedback('ownerFeedback', {
      state: 'temporarily_unavailable',
      title: 'Owner dashboard temporarily unavailable',
      message: statsOut.errorMessage || 'Could not load live vendor controls right now.',
      nextStep: 'BiteShark kept you out of sample preview mode so live edits are not mistaken for saved changes. Try again in a moment.',
      correlationId: statsOut.correlationId,
      onRetry: () => loadOwnerDashboard()
    });
    const container = document.getElementById('ownerRequests');
    if (container) {
      container.innerHTML = `<div class="empty">⏸ Live booking requests are temporarily unavailable.${statsOut.correlationId ? ` (Support ref: <code>${esc(statsOut.correlationId)}</code>)` : ''}</div>`;
    }
    return;
  }

  // Genuine non-vendor / unauthenticated Preview Mode (401 or 403)
  isOwnerAdmin = false;
  ownerAccess = { isPlatformAdmin: false, isModerator: false, vendors: [] };
  renderSectionFeedback('ownerFeedback', null);
  if (banner) banner.hidden = false;
  populateOwnerTruckSelect();
  const cat = trucks.find(t => t.id === ownerTruckId);
  if (cat) {
    ownerProfile = {
      truck_id: cat.id,
      display_name: cat.name,
      cuisine: cat.cuisine,
      description: cat.blurb,
      accepting_bookings: true
    };
    const locInput = document.getElementById('ownerLocation');
    if (locInput) locInput.value = cat.location;
  }
  renderOwnerHeader();
  syncOwnerScheduleDay();
  renderOwnerScheduleList();
  await loadOwnerRequests();
}

function setOwnerRequestFilter(filter) {
  ownerRequestFilter = filter;
  document.querySelectorAll('[data-req-filter]').forEach(btn => {
    const active = btn.dataset.reqFilter === filter;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', String(active));
  });
  loadOwnerRequests();
}

async function loadOwnerRequests() {
  const container = document.getElementById('ownerRequests');
  if (ownerDashboardUnavailable) {
    if (container) {
      container.innerHTML = '<div class="empty">⏸ Live booking requests are temporarily unavailable. Use Try again above to reload.</div>';
    }
    return;
  }

  let rows = [];
  if (isOwnerAdmin) {
    const qId = encodeURIComponent(ownerTruckId);
    const url = ownerRequestFilter === 'pending'
      ? `${API}/owner/requests?truck_id=${qId}`
      : (ownerRequestFilter === 'accepted'
        ? `${API}/owner/bookings?truck_id=${qId}&status=accepted`
        : `${API}/owner/bookings?truck_id=${qId}`);
    const res = await appFetchJson(url, {
      featureKey: 'bookings_inquiries',
      operationName: 'owner.load_requests',
      routeTemplate: ownerRequestFilter === 'pending' ? '/api/owner/requests' : '/api/owner/bookings'
    });
    if (!res.ok) {
      if (container) {
        container.innerHTML = `<div class="empty">⏸ Could not load booking requests right now.${res.correlationId ? ` (Support ref: <code>${esc(res.correlationId)}</code>)` : ''} <button type="button" class="ghost small" onclick="loadOwnerRequests()">Try again</button></div>`;
      }
      return;
    }
    rows = res.data.requests || res.data.bookings || [];
  } else {
    const allPreview = getPreviewOwnerRows();
    const pendingCount = allPreview.filter(r => r.status === 'pending').length;
    const acceptedCount = allPreview.filter(r => r.status === 'accepted').length;
    renderOwnerStats({ total_requests: allPreview.length, pending: pendingCount, accepted: acceptedCount });
    rows = ownerRequestFilter === 'all'
      ? allPreview
      : allPreview.filter(r => r.status === ownerRequestFilter);
  }

  if (!container) return;

  if (!rows.length) {
    const emptyMsg = ownerRequestFilter === 'pending'
      ? 'No pending booking requests right now.'
      : (ownerRequestFilter === 'accepted' ? 'No accepted bookings yet.' : 'No booking requests recorded yet.');
    container.innerHTML = `<div class="empty">${emptyMsg}</div>`;
    return;
  }

  const canDecide = !isOwnerAdmin || getActiveVendorRole() === 'owner' || getActiveVendorRole() === 'platform_admin';

  container.innerHTML = rows.slice(0, 15).map(r => {
    const d = parseEventDate(r.event_date);
    const month = d ? d.toLocaleString('en', { month: 'short' }) : 'TBD';
    const day = d ? d.getDate() : '—';
    const safeId = esc(r.id);
    const st = formatBookingStatus(r.status);
    const isPending = String(r.status || 'pending').toLowerCase() === 'pending';
    const actionsHtml = isPending
      ? (canDecide
        ? `<div class="request-actions"><button type="button" class="accept" onclick="handleRequest('${safeId}','accepted')">Accept</button><button type="button" class="decline" onclick="handleRequest('${safeId}','declined')">Pass</button></div>`
        : `<span class="booking-status status-pending">Owner decision required</span>`)
      : `<span class="booking-status ${st.cls}">${esc(st.label)}</span>`;
    return `<div class="request-row" id="req-${safeId}"><div class="request-date"><small>${esc(month)}</small><b>${esc(day)}</b></div><div class="request-info"><b>${esc(r.event_type)} · ${esc(r.guest_count)} guests</b><small>${esc(r.requester || 'Signed-in customer')} · ${esc(r.location)}</small><small class="request-package">${esc(r.package_name || 'Custom request')}${r.package_price ? ` · $${Number(r.package_price).toLocaleString()}` : ''}</small></div>${actionsHtml}</div>`;
  }).join('');
}

async function handleRequest(id, status) {
  if (ownerDashboardUnavailable) {
    toast('Owner dashboard is temporarily unavailable — reload before updating requests.');
    return;
  }
  if (!isOwnerAdmin) {
    const row = getPreviewOwnerRows().find(r => String(r.id) === String(id));
    if (row) row.status = status;
    await loadOwnerRequests();
    toast(status === 'accepted' ? 'Booking accepted (preview only — not saved to server)' : 'Request passed (preview only — not saved to server)');
    return;
  }

  if (getActiveVendorRole() === 'staff') {
    toast('Vendor owner permission is required to accept or decline bookings');
    return;
  }

  const rowEl = document.getElementById('req-' + id);
  const btns = rowEl && typeof rowEl.querySelectorAll === 'function' ? [...rowEl.querySelectorAll('button')] : [];
  btns.forEach(b => {
    b.disabled = true;
    if (typeof b.setAttribute === 'function') b.setAttribute('aria-busy', 'true');
  });

  try {
    const out = await appFetchJson(API + '/owner/requests', {
      method: 'POST',
      isWrite: true,
      idempotentWrite: true,
      featureKey: 'bookings_inquiries',
      operationName: 'owner.decide_request',
      routeTemplate: '/api/owner/requests',
      body: { id, status }
    });
    if (out.uncertainWrite || out.timedOut) {
      await loadOwnerDashboard();
      toast('Outcome uncertain — refreshed booking queue to check current status.');
      return;
    }
    if (!out.ok) {
      const errMsg = out.data?.error || out.errorMessage || 'Could not update booking status';
      renderSectionFeedback('ownerFeedback', {
        state: out.status === 401 || out.status === 403 ? 'failed' : 'temporarily_unavailable',
        title: 'Booking decision failed',
        message: errMsg,
        correlationId: out.correlationId,
        loginHref: out.status === 401 ? '/login.html?next=/' : null
      });
      toast(errMsg);
      return;
    }
    renderSectionFeedback('ownerFeedback', null);
    toast(status === 'accepted' ? 'Saved to server — booking inquiry accepted! Reach out directly to finalize details.' : 'Saved to server — booking inquiry declined.');
    await loadOwnerDashboard();
  } finally {
    btns.forEach(b => {
      b.disabled = false;
      if (typeof b.removeAttribute === 'function') b.removeAttribute('aria-busy');
    });
  }
}

async function updateOwnerLocation() {
  if (ownerDashboardUnavailable) {
    setInlineStatus('ownerLocationMsg', 'err', '✕ Owner dashboard is temporarily unavailable — reload before publishing location.');
    return toast('Owner dashboard temporarily unavailable');
  }
  const location = (document.getElementById('ownerLocation')?.value || '').trim();
  if (!location) {
    setInlineStatus('ownerLocationMsg', 'err', '✕ Enter your current parked location note before publishing.');
    return toast('Please enter a parked location first');
  }

  const rawLat = (document.getElementById('ownerLat')?.value || '').trim();
  const rawLng = (document.getElementById('ownerLng')?.value || '').trim();
  if ((rawLat !== '') !== (rawLng !== '')) {
    setInlineStatus('ownerLocationMsg', 'err', '✕ Enter both latitude and longitude, or leave both blank.');
    return toast('Enter both latitude and longitude, or leave both blank');
  }
  const lat = rawLat === '' ? null : Number(rawLat);
  const lng = rawLng === '' ? null : Number(rawLng);
  if (rawLat !== '' && (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180 || (lat === 0 && lng === 0))) {
    setInlineStatus('ownerLocationMsg', 'err', '✕ Enter valid decimal latitude (-90..90) and longitude (-180..180).');
    return toast('Enter valid decimal latitude (-90..90) and longitude (-180..180)');
  }

  const ttlMinutes = Number(document.getElementById('ownerLocationTtl')?.value) || 480;
  const isOpen = document.getElementById('ownerIsOpen') ? !!document.getElementById('ownerIsOpen').checked : true;
  const opensVal = document.getElementById('ownerOpensAt')?.value || ownerLastKnownLocationHours.opens_at || null;
  const closesVal = document.getElementById('ownerClosesAt')?.value || ownerLastKnownLocationHours.closes_at || null;

  if (isOwnerAdmin) {
    const btn = document.getElementById('ownerUpdateLocationBtn');
    if (btn) {
      btn.disabled = true;
      if (typeof btn.setAttribute === 'function') btn.setAttribute('aria-busy', 'true');
    }
    setInlineStatus('ownerLocationMsg', '', '⏳ Working — publishing live location to BiteShark…');
    try {
      const out = await appFetchJson(API + '/owner/location', {
        method: 'POST',
        isWrite: true,
        idempotentWrite: true,
        featureKey: 'vendor_publishing',
        operationName: 'owner.update_location',
        routeTemplate: '/api/owner/location',
        body: {
          truck_id: ownerTruckId,
          location,
          lat,
          lng,
          ttl_minutes: ttlMinutes,
          is_open: isOpen,
          opens_at: opensVal,
          closes_at: closesVal
        }
      });
      if (out.uncertainWrite || out.timedOut) {
        setInlineStatus(
          'ownerLocationMsg',
          'warn',
          `⚠ Outcome uncertain — timed out waiting for confirmation.${out.correlationId ? ` Support ref: ${out.correlationId}` : ''}`
        );
        await refreshDiscoveryCatalog({ fresh: true });
        return toast('Outcome uncertain — check listing or retry.');
      }
      if (!out.ok) {
        const msg = out.data?.error || out.errorMessage || 'Could not publish location update';
        setInlineStatus(
          'ownerLocationMsg',
          'err',
          `✕ Failed: ${msg}${out.correlationId ? ` (Support ref: ${out.correlationId})` : ''}`
        );
        return toast(msg);
      }
      await refreshDiscoveryCatalog({ fresh: true });
      setInlineStatus('ownerLocationMsg', 'ok', '✓ Saved to server — live location published.');
      return toast('Live location published');
    } finally {
      if (btn) {
        btn.disabled = false;
        if (typeof btn.removeAttribute === 'function') btn.removeAttribute('aria-busy');
      }
    }
  }

  const target = trucks.find(t => t.id === ownerTruckId);
  if (target) {
    target.location = location;
    applyFilters();
  }
  setInlineStatus('ownerLocationMsg', 'warn', '💾 Saved locally in preview mode only (sign in as vendor to publish publicly).');
  toast('Location updated in preview mode (device only)');
}

function toggleOwnerOpenStatus() {
  const open = !!document.getElementById('ownerIsOpen')?.checked;
  setInlineStatus(
    'ownerScheduleMsg',
    '',
    open ? 'Unsaved change: marked Open — click Save schedule to save.' : 'Unsaved change: marked Unavailable — click Save schedule to save.'
  );
  toast(open ? 'Marked open — click Save schedule to persist' : 'Marked unavailable — click Save schedule to persist');
}

async function saveOwnerSchedule() {
  if (ownerDashboardUnavailable) {
    setInlineStatus('ownerScheduleMsg', 'err', '✕ Owner dashboard is temporarily unavailable — reload before saving schedule.');
    return toast('Owner dashboard temporarily unavailable');
  }
  const serviceDate = (document.getElementById('ownerScheduleDate')?.value || '').trim() || todayPacificISO();
  const opensAt = document.getElementById('ownerOpensAt')?.value || '11:00';
  const closesAt = document.getElementById('ownerClosesAt')?.value || '20:00';
  const isOpen = !!document.getElementById('ownerIsOpen')?.checked;
  const location = (document.getElementById('ownerLocation')?.value || '').trim() || null;
  const status = isOpen ? 'scheduled' : 'unavailable';
  const entry = { truck_id: ownerTruckId, service_date: serviceDate, opens_at: opensAt, closes_at: closesAt, location, status };

  if (isOwnerAdmin) {
    const btn = document.getElementById('ownerSaveScheduleBtn');
    if (btn) {
      btn.disabled = true;
      if (typeof btn.setAttribute === 'function') btn.setAttribute('aria-busy', 'true');
    }
    setInlineStatus('ownerScheduleMsg', '', '⏳ Working — saving schedule to server…');
    try {
      const out = await appFetchJson(API + '/owner/schedule', {
        method: 'POST',
        isWrite: true,
        idempotentWrite: true,
        featureKey: 'vendor_schedules',
        operationName: 'owner.save_schedule',
        routeTemplate: '/api/owner/schedule',
        body: entry
      });
      if (out.uncertainWrite || out.timedOut) {
        setInlineStatus(
          'ownerScheduleMsg',
          'warn',
          `⚠ Outcome uncertain — timed out before schedule confirmation.${out.correlationId ? ` Support ref: ${out.correlationId}` : ''}`
        );
        return toast('Outcome uncertain — retry saving schedule.');
      }
      if (!out.ok) {
        const msg = out.data?.error || out.errorMessage || 'Could not save schedule';
        setInlineStatus(
          'ownerScheduleMsg',
          'err',
          `✕ Failed: ${msg}${out.correlationId ? ` (Support ref: ${out.correlationId})` : ''}`
        );
        return toast(msg);
      }
      const saved = out.data;
      ownerSchedule = [saved, ...ownerSchedule.filter(s => !(s.truck_id === ownerTruckId && toCalendarDateISO(s.service_date) === serviceDate))]
        .sort((a, b) => toCalendarDateISO(a.service_date).localeCompare(toCalendarDateISO(b.service_date)));
      renderOwnerScheduleList();
      await refreshDiscoveryCatalog({ fresh: true });
      setInlineStatus('ownerScheduleMsg', 'ok', `✓ Saved to server for ${serviceDate}.`);
      return toast('Service schedule saved');
    } finally {
      if (btn) {
        btn.disabled = false;
        if (typeof btn.removeAttribute === 'function') btn.removeAttribute('aria-busy');
      }
    }
  }

  ownerSchedule = [entry, ...ownerSchedule.filter(s => !(s.truck_id === ownerTruckId && toCalendarDateISO(s.service_date) === serviceDate))]
    .sort((a, b) => toCalendarDateISO(a.service_date).localeCompare(toCalendarDateISO(b.service_date)));
  safeStorageSet('truckly_owner_schedule', JSON.stringify(ownerSchedule), 'vendor_schedules');
  renderOwnerScheduleList();
  setInlineStatus('ownerScheduleMsg', 'warn', '💾 Saved locally on this device (preview mode only — not published).');
  toast('Schedule saved on this device (preview mode)');
}

function openOwnerProfileModal() {
  if (isOwnerAdmin && getActiveVendorRole() === 'staff') {
    toast('Vendor owner permission is required to edit listing profile');
    return;
  }
  const cuisineSel = document.getElementById('ownerProfileCuisine');
  if (cuisineSel) {
    cuisineSel.innerHTML = cuisineSections.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    cuisineSel.value = cuisineSections.includes(ownerProfile.cuisine) ? ownerProfile.cuisine : cuisineSections[0];
  }
  const nameInput = document.getElementById('ownerProfileName');
  const bioInput = document.getElementById('ownerProfileBio');
  const acceptToggle = document.getElementById('ownerAcceptingBookings');
  const errEl = document.getElementById('ownerProfileError');
  if (nameInput) nameInput.value = ownerProfile.display_name || 'Your Food Truck';
  if (bioInput) bioInput.value = ownerProfile.description || '';
  if (acceptToggle) acceptToggle.checked = ownerProfile.accepting_bookings !== false;
  if (errEl) {
    errEl.hidden = true;
    errEl.textContent = '';
  }
  openAppModal('ownerProfileModal', {
    initialFocusSelector: '#ownerProfileName',
    onClose: closeOwnerProfileModal
  });
}

function closeOwnerProfileModal() {
  closeAppModal('ownerProfileModal');
}

async function saveOwnerProfile(e) {
  e.preventDefault();
  const nameEl = document.getElementById('ownerProfileName');
  const displayName = (nameEl?.value || '').trim();
  const cuisine = document.getElementById('ownerProfileCuisine')?.value || 'Mexican';
  const description = (document.getElementById('ownerProfileBio')?.value || '').trim();
  const accepting = !!document.getElementById('ownerAcceptingBookings')?.checked;
  const errEl = document.getElementById('ownerProfileError');

  if (!displayName) {
    if (nameEl && typeof nameEl.setAttribute === 'function') nameEl.setAttribute('aria-invalid', 'true');
    if (errEl) {
      errEl.hidden = false;
      errEl.textContent = '⚠ Display name is required.';
    }
    return toast('Display name is required');
  }
  if (nameEl && typeof nameEl.removeAttribute === 'function') nameEl.removeAttribute('aria-invalid');
  if (errEl) {
    errEl.hidden = true;
    errEl.textContent = '';
  }

  const payload = {
    truck_id: ownerTruckId,
    display_name: displayName,
    cuisine,
    description,
    accepting_bookings: accepting
  };

  if (isOwnerAdmin) {
    const saveBtn = document.getElementById('ownerProfileSaveBtn');
    if (saveBtn) {
      saveBtn.disabled = true;
      if (typeof saveBtn.setAttribute === 'function') saveBtn.setAttribute('aria-busy', 'true');
    }
    try {
      const out = await appFetchJson(API + '/owner/profile', {
        method: 'POST',
        isWrite: true,
        idempotentWrite: true,
        featureKey: 'vendor_publishing',
        operationName: 'owner.save_profile',
        routeTemplate: '/api/owner/profile',
        body: payload
      });
      if (!out.ok) {
        const msg = out.uncertainWrite
          ? 'Outcome uncertain — timed out waiting for confirmation. Your edits remain in this form; retry to save.'
          : (out.data?.error || out.errorMessage || 'Could not save owner profile');
        if (errEl) {
          errEl.hidden = false;
          errEl.textContent = `⚠ ${msg}${out.correlationId ? ` (Support ref: ${out.correlationId})` : ''}`;
        }
        return toast(msg);
      }
      ownerProfile = out.data;
      await refreshDiscoveryCatalog({ fresh: true });
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        if (typeof saveBtn.removeAttribute === 'function') saveBtn.removeAttribute('aria-busy');
      }
    }
  } else {
    ownerProfile = payload;
    safeStorageSet('truckly_owner_profile', JSON.stringify(ownerProfile), 'vendor_publishing');
  }

  populateOwnerTruckSelect();
  renderOwnerHeader();
  closeOwnerProfileModal();
  toast(isOwnerAdmin ? 'Saved to server — listing profile published' : 'Saved locally on this device (preview mode)');
}

async function shareOwnerLocation() {
  const location = (document.getElementById('ownerLocation')?.value || '').trim() || 'Sonoma County';
  const name = ownerProfile.display_name || 'Our food truck';
  const shareText = `${name} is parked at ${location} — find us on BiteShark!`;
  try {
    if (navigator.share) {
      await navigator.share({ title: name, text: shareText, url: window.location?.origin || 'https://biteshark.live' });
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(shareText);
      return toast('Live spot copied to clipboard!');
    }
  } catch {}
  toast(shareText);
}

function previewOwnerPhotos(e) {
  const files = [...(e.target?.files || [])].slice(0, 6);
  const grid = document.getElementById('ownerPhotoGrid');
  if (!files.length || !grid) return;
  let failedCount = 0;
  let loadedCount = 0;
  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = () => {
      loadedCount += 1;
      const d = document.createElement('div');
      d.className = 'owner-photo';
      d.style.backgroundImage = `url('${reader.result}')`;
      d.textContent = '';
      grid.appendChild(d);
      setInlineStatus(
        'ownerPhotoMsg',
        'warn',
        `💾 ${loadedCount} photo preview(s) shown in this tab only — not uploaded to your public listing.`
      );
    };
    reader.onerror = () => {
      failedCount += 1;
      setInlineStatus('ownerPhotoMsg', 'err', `✕ ${failedCount} photo file(s) could not be read on this device.`);
    };
    reader.readAsDataURL(file);
  });
  toast(`${files.length} local preview${files.length > 1 ? 's' : ''} added in this tab (not published)`);
}

let lastSurpriseId = null;
function surpriseMe() {
  const matches = filtered();
  if (!matches.length) {
    toast('No matches yet — try another cuisine or a wider radius.');
    return;
  }
  const choices = matches.length > 1 ? matches.filter(t => t.id !== lastSurpriseId) : matches;
  const pick = choices[Math.floor(Math.random() * choices.length)];
  lastSurpriseId = pick.id;
  openDetail(pick.id);
}

function toast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

document.addEventListener('click', e => {
  const menu = document.getElementById('profileMenu');
  if (menu && menu.open && !menu.contains(e.target)) menu.open = false;
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    const menu = document.getElementById('profileMenu');
    if (menu && menu.open) {
      menu.open = false;
      return;
    }
    const d = bsDiag();
    if (!d) {
      document.querySelectorAll('.modal-backdrop.show').forEach(el => el.classList.remove('show'));
    }
  }
});

window.bitesharkReady = window.trucklyReady = (document.readyState === 'loading'
  ? new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true }))
  : Promise.resolve()
).then(init);
