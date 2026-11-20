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
  document.querySelectorAll('[data-cuisine]').forEach(b => b.classList.toggle('active', b.dataset.cuisine === 'All'));
  document.querySelectorAll('[data-kind]').forEach(b => {
    const match = b.dataset.kind === kind;
    b.classList.toggle('active', match);
    b.setAttribute('aria-pressed', String(match));
  });
  const heading = document.getElementById('resultsHeading');
  if (heading) heading.textContent = kind === 'All' ? 'Around the neighborhood' : kind;
  setMode('list');
  if (heading && typeof heading.scrollIntoView === 'function') {
    heading.scrollIntoView({ block: 'start', behavior: 'smooth' });
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
  document.querySelectorAll('[data-cuisine]').forEach(b => b.classList.toggle('active', b.dataset.cuisine === s));
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
  document.getElementById('openNow')?.classList.remove('active');
  document.querySelectorAll('[data-cuisine]').forEach(b => b.classList.toggle('active', b.dataset.cuisine === 'All'));
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
  document.getElementById('detailContent').innerHTML = `<button class="modal-close" onclick="closeModal()" aria-label="Close details">×</button><div class="detail-hero icon-photo" style="background:${esc(t.color)}"><span class="photo-emoji">${esc(t.emoji)}</span></div><div class="detail-body"><small>${statusPrefix}${esc((t.kind || t.cuisine || 'Local').toUpperCase())}</small><h2>${esc(t.name)}</h2><p>${esc(t.blurb)}</p>${t.special ? `<aside class="special-note"><small>WHAT MAKES IT SPECIAL</small><p>${esc(t.special)}</p><a href="${storyHref}" target="_blank" rel="noopener noreferrer">Read the business’s own story ↗</a></aside>` : ''}<div class="detail-location"><b>⌖ ${esc(t.location)}</b><small>${esc(detailHoursNote(t))}</small></div><p class="meta">${metaDisclaimer}</p>${t.source ? `<a class="primary source-button" target="_blank" rel="noopener noreferrer" href="${esc(t.source)}">View published ${t.popup ? 'pop-up calendar' : 'hours & information'} ↗</a>` : ''}<a class="map-link" target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(t.popup && t.location_source === 'unknown' ? t.name + ' Sonoma County' : t.location)}">Find ${t.popup ? 'this truck' : 'this place'} on Google Maps ↗</a><button class="detail-link" type="button" onclick="if(typeof communityReviewPlace==='function')communityReviewPlace('${safeId}')">✎ Write a local review →</button></div>`;
  document.getElementById('detailModal').classList.add('show');
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
    map.flyTo([+t.lat + offset, +t.lng], 15, { duration: 0.55 });
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
  document.getElementById('detailContent').innerHTML = `<button class="modal-close" onclick="closeModal()">×</button><div class="detail-hero ${t.photo ? '' : 'icon-photo'}" style="${t.photo ? `background-image:url('${esc(t.photo)}')` : `background:${esc(t.color)}`}">${t.photo ? '' : `<span class="photo-emoji">${esc(t.emoji)}</span>`}</div><div class="detail-body"><small>${statusPrefix}${esc(t.cuisine).toUpperCase()}</small><h2>${esc(t.emoji)} ${esc(t.name)}</h2><p>${esc(t.blurb)}</p><div class="detail-tags"><span>${t.verified && t.rating ? `★ ${esc(t.rating)} (${esc(t.reviews)})` : 'Check the menu'}</span>${t.price ? `<span>${esc(t.price)}</span>` : ''}<span>${esc(distanceLabel(t, 'detail'))}</span></div><div class="detail-location"><b>⌖ ${esc(t.location)}</b><small>${esc(detailHoursNote(t))}</small></div><div class="truth-card"><span class="verified-dot">✓</span><div><b>${t.verified ? 'Source-verified listing' : 'Details pending verification'}</b><small>${esc(t.listing_type || t.availability || 'Mobile vendor')} · ${esc(t.city || 'Sonoma County')} · Pacific time</small></div></div><a class="map-link" target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(t.location)}">Open location in Google Maps ↗</a><button class="detail-link" type="button" onclick="if(typeof communityReviewPlace==='function')communityReviewPlace('${safeId}')">✎ Write a local review →</button><button class="primary" onclick="closeModal();openBooking('${safeId}')">Request this truck for an event →</button></div>`;
  document.getElementById('detailModal').classList.add('show');
  if (typeof window !== 'undefined' && window.bitesharkFeatures && typeof window.bitesharkFeatures.syncDom === 'function') {
    window.bitesharkFeatures.syncDom();
  }
}

function closeModal() {
  document.getElementById('detailModal').classList.remove('show');
}

function initialsFromUser(user) {
  const source = (user && (user.name || user.email)) || '';
  if (!source) return '✓';
  const clean = source.split('@')[0].replace(/[^a-zA-Z0-9]+/g, ' ').trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (clean.slice(0, 2) || '✓').toUpperCase();
}

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
    if (sub) sub.textContent = 'Favorites & bookings synced';
    if (signInLink) signInLink.hidden = true;
    if (signOutBtn) signOutBtn.hidden = false;
  } else {
    avatar.textContent = '👤';
    avatar.classList.remove('signed-in');
    avatar.title = 'Guest mode — sign in to sync';
    if (heading) heading.textContent = 'Guest mode';
    if (sub) sub.textContent = 'Saved on this device';
    if (signInLink) signInLink.hidden = false;
    if (signOutBtn) signOutBtn.hidden = true;
  }
}

async function syncAuthAndUserData() {
  try {
    if (window.biteshark && window.biteshark.auth && typeof window.biteshark.auth.getUser === 'function') {
      const u = await window.biteshark.auth.getUser().catch(() => null);
      if (u) currentUser = u;
    } else if (window.__BITESHARK__ && window.__BITESHARK__.user) {
      currentUser = window.__BITESHARK__.user;
    }
  } catch {}

  try {
    const r = await fetch(API + '/favorites/list', { credentials: 'same-origin' });
    if (r.ok) {
      const data = await r.json();
      isSignedIn = true;
      const serverIds = Array.isArray(data.favorites) ? data.favorites.map(f => f.truck_id).filter(Boolean) : [];
      if (!serverIds.length && favs.size > 0) {
        const guestIds = [...favs];
        await Promise.all(guestIds.map(truck_id =>
          fetch(API + '/favorites/toggle', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ truck_id })
          }).catch(() => null)
        ));
      } else {
        favs.clear();
        serverIds.forEach(id => favs.add(id));
        localStorage.setItem('truckly_favs', JSON.stringify([...favs]));
      }
      await Promise.all([loadUserBookings(), loadNotificationSettings()]);
      updateAuthUI();
      applyFilters();
      renderFavorites();
      return;
    }
  } catch {}

  isSignedIn = false;
  bookings = [];
  try { localStorage.removeItem('truckly_bookings'); } catch {}
  updateAuthUI();
  renderNotificationUI();
  renderBookings();
}

async function signOutUser() {
  try {
    const auth = window.biteshark && window.biteshark.auth;
    if (auth) {
      if (typeof auth.logout === 'function') await auth.logout();
      else if (typeof auth.signOut === 'function') await auth.signOut();
    }
  } catch {}
  isSignedIn = false;
  currentUser = null;
  bookings = [];
  try { localStorage.removeItem('truckly_bookings'); } catch {}
  updateAuthUI();
  renderNotificationUI();
  renderBookings();
  toast('Signed out — favorites stay saved on this device');
}

async function toggleFav(id) {
  const adding = !favs.has(id);
  adding ? favs.add(id) : favs.delete(id);
  localStorage.setItem('truckly_favs', JSON.stringify([...favs]));
  applyFilters();
  renderFavorites();
  toast(adding ? 'Saved! We’ll nudge you when they’re nearby.' : 'Removed from favorites');

  if (!isSignedIn) return;
  try {
    const r = await fetch(API + '/favorites/toggle', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ truck_id: id })
    });
    if (r.ok) {
      const out = await r.json();
      out.saved ? favs.add(id) : favs.delete(id);
      localStorage.setItem('truckly_favs', JSON.stringify([...favs]));
      applyFilters();
      renderFavorites();
    } else if (r.status === 401 || r.status === 403) {
      isSignedIn = false;
      updateAuthUI();
      renderNotificationUI();
    }
  } catch {}
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
  select.disabled = !toggle.checked;
  const syncText = isSignedIn ? 'synced to your account' : 'saved on this device';
  meta.textContent = toggle.checked
    ? `Within ${r} ${r === 1 ? 'mile' : 'miles'} · ${syncText}`
    : `Alerts paused · ${syncText}`;
}

async function loadNotificationSettings() {
  try {
    const r = await fetch(API + '/notifications/settings', { credentials: 'same-origin' });
    if (r.ok) {
      const data = await r.json();
      notifyPrefs = {
        nearby_enabled: data.nearby_enabled !== false,
        radius_miles: Math.max(1, Math.min(30, +data.radius_miles || 3))
      };
      localStorage.setItem('truckly_notify', JSON.stringify(notifyPrefs));
    }
  } catch {}
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
  localStorage.setItem('truckly_notify', JSON.stringify(notifyPrefs));
  renderNotificationUI();

  if (isSignedIn) {
    try {
      const r = await fetch(API + '/notifications/settings', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(notifyPrefs)
      });
      if (r.ok) {
        const saved = await r.json();
        notifyPrefs = {
          nearby_enabled: saved.nearby_enabled !== false,
          radius_miles: Math.max(1, Math.min(30, +saved.radius_miles || notifyPrefs.radius_miles))
        };
        localStorage.setItem('truckly_notify', JSON.stringify(notifyPrefs));
        renderNotificationUI();
      }
    } catch {}
  }
  toast(notifyPrefs.nearby_enabled ? `Nearby alerts set to ${notifyPrefs.radius_miles} mi` : 'Nearby alerts paused');
}

function toggleOpen() {
  openOnly = !openOnly;
  document.getElementById('openNow').classList.toggle('active', openOnly);
  applyFilters();
}

function openDistance() {
  document.getElementById('distanceModal').classList.add('show');
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
        map.flyTo([userCoords.lat, userCoords.lng], 13, { duration: 0.65 });
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

      document.getElementById('locationLabel').textContent = label;
      applyFilters();
      renderFavorites();
      toast('Distances updated from your location');
    },
    () => toast('Turn on location access to calculate nearby distances'),
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
  );
}

function setBookingError(msg) {
  const el = document.getElementById('bookingError');
  if (!el) return;
  if (msg) {
    el.textContent = msg;
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
    setBookingError('Please enter a whole number of at least 10 guests.');
    return false;
  }
  if (guests > pkg.max) {
    setBookingError(`${pkg.name} covers up to ${pkg.max} guests. Choose a larger package or reduce the guest count.`);
    return false;
  }
  setBookingError('');
  return true;
}

let bookingDateBlocked = false;

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

  try {
    const r = await fetch(`${API}/trucks/availability?truck_id=${encodeURIComponent(truckId)}&date=${encodeURIComponent(dateVal)}`);
    if (r.status === 503) {
      bookingDateBlocked = true;
      setBookingError('Vendor availability cannot be verified right now. Please try again in a moment.');
      return false;
    }
    if (r.ok) {
      const out = await r.json();
      if (out.requestable === false) {
        const t = trucks.find(x => x.id === truckId);
        const name = t ? t.name : 'This vendor';
        bookingDateBlocked = true;
        if (out.reason === 'bookings_paused') {
          setBookingError(`${name} has paused new event booking inquiries right now. Please choose another food truck.`);
        } else if (out.reason === 'past_or_same_day_pacific') {
          setBookingError('Event inquiries must be scheduled for a future calendar date (Pacific time).');
        } else if (out.reason === 'vendor_not_bookable') {
          setBookingError(`${name} is not eligible for event booking requests.`);
        } else {
          setBookingError(`${name} marked ${dateVal} as unavailable for event bookings. Please choose another date or truck.`);
        }
        return false;
      }
    }
  } catch {}
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
  document.getElementById('bookingModal').classList.add('show');
  if (fc) fc.syncDom();
  if (t && (!fc || fc.isAvailable('event_inquiries'))) checkBookingAvailability();
}

function closeBooking() {
  bookingDateBlocked = false;
  setBookingError('');
  document.getElementById('bookingModal').classList.remove('show');
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
    setBookingError(msg);
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
    const msg = 'Please include an event type, future date, location (3+ chars), and at least 10 guests.';
    setBookingError(msg);
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
  if (submitBtn) submitBtn.disabled = true;
  setBookingError('');

  try {
    const r = await fetch(API + '/bookings/create', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': bookingDraftKey
      },
      body: JSON.stringify(data)
    });
    const payload = await r.json().catch(() => ({}));
    if (r.status === 401) {
      isSignedIn = false;
      updateAuthUI();
      const msg = payload.error || 'Sign in to submit an event booking request.';
      setBookingError(msg);
      toast(msg);
      return;
    }
    if (!r.ok) {
      const msg = payload.error || 'Could not submit your booking request. Please review your details and try again.';
      setBookingError(msg);
      toast(msg);
      return;
    }

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

    closeBooking();
    e.target.reset();
    document.getElementById('eventDate').value = defaultEventDate();
    renderBookings();
    if (isSignedIn) loadUserBookings();
    toast(payload.idempotent_replay ? 'Inquiry already received — showing your existing request.' : 'Inquiry sent! Pending vendor review.');
    showScreen('bookings');
  } catch {
    const msg = 'Could not reach BiteShark right now. Check your connection and retry — duplicate sends are protected.';
    setBookingError(msg);
    toast(msg);
  } finally {
    const fc = typeof window !== 'undefined' && window.bitesharkFeatures ? window.bitesharkFeatures : null;
    if (submitBtn) submitBtn.disabled = Boolean(fc && !fc.isAvailable('event_inquiries'));
  }
}

async function loadUserBookings() {
  try {
    const r = await fetch(API + '/bookings/list', { credentials: 'same-origin' });
    if (r.status === 401) {
      bookings = [];
      renderBookings();
      return;
    }
    if (!r.ok) return;
    const data = await r.json();
    if (!Array.isArray(data.bookings)) return;

    bookings = data.bookings.map(b => ({
      ...b,
      event_date: toCalendarDateISO(b.event_date)
    }));
    renderBookings();
  } catch {}
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

async function loadOwnerDashboard() {
  populateOwnerTruckSelect();
  const schedDate = document.getElementById('ownerScheduleDate');
  if (schedDate && !schedDate.value) schedDate.value = todayPacificISO();

  const banner = document.getElementById('ownerModeBanner');
  try {
    const statsRes = await fetch(API + '/owner/stats', { credentials: 'same-origin' });
    if (statsRes.ok) {
      isOwnerAdmin = true;
      if (banner) banner.hidden = true;
      const stats = await statsRes.json();
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
        needScopedStats ? fetch(`${API}/owner/stats?truck_id=${qId}`, { credentials: 'same-origin' }).catch(() => null) : Promise.resolve(null),
        fetch(`${API}/owner/profile?truck_id=${qId}`, { credentials: 'same-origin' }).catch(() => null),
        fetch(`${API}/owner/location?truck_id=${qId}`, { credentials: 'same-origin' }).catch(() => null),
        fetch(`${API}/owner/schedule?truck_id=${qId}`, { credentials: 'same-origin' }).catch(() => null)
      ]);

      if (scopedStatsRes && scopedStatsRes.ok) {
        renderOwnerStats(await scopedStatsRes.json());
      } else {
        renderOwnerStats(stats);
      }

      if (profRes && profRes.ok) {
        const p = await profRes.json();
        const cat = trucks.find(t => t.id === ownerTruckId);
        ownerProfile = {
          truck_id: ownerTruckId,
          display_name: p.display_name || cat?.name || 'Your Food Truck',
          cuisine: p.cuisine || cat?.cuisine || 'Mexican',
          description: p.description || cat?.blurb || 'Keep Sonoma County regulars in the loop.',
          accepting_bookings: p.accepting_bookings !== false
        };
      }
      if (locRes && locRes.ok) {
        const loc = await locRes.json();
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
        if (opensEl && loc.opens_at) opensEl.value = String(loc.opens_at).slice(0, 5);
        if (closesEl && loc.closes_at) closesEl.value = String(loc.closes_at).slice(0, 5);
      }
      if (schedRes && schedRes.ok) {
        const sData = await schedRes.json();
        ownerSchedule = Array.isArray(sData.schedule) ? sData.schedule : [];
      }

      populateOwnerTruckSelect();
      renderOwnerHeader();
      syncOwnerScheduleDay();
      renderOwnerScheduleList();
      await loadOwnerRequests();
      return;
    }
  } catch {}

  // Non-vendor / offline Preview Mode
  isOwnerAdmin = false;
  ownerAccess = { isPlatformAdmin: false, isModerator: false, vendors: [] };
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
    btn.classList.toggle('active', btn.dataset.reqFilter === filter);
  });
  loadOwnerRequests();
}

async function loadOwnerRequests() {
  let rows = [];
  if (isOwnerAdmin) {
    try {
      const qId = encodeURIComponent(ownerTruckId);
      const url = ownerRequestFilter === 'pending'
        ? `${API}/owner/requests?truck_id=${qId}`
        : (ownerRequestFilter === 'accepted'
          ? `${API}/owner/bookings?truck_id=${qId}&status=accepted`
          : `${API}/owner/bookings?truck_id=${qId}`);
      const r = await fetch(url, { credentials: 'same-origin' });
      if (r.ok) {
        const data = await r.json();
        rows = data.requests || data.bookings || [];
      }
    } catch {}
  } else {
    const allPreview = getPreviewOwnerRows();
    const pendingCount = allPreview.filter(r => r.status === 'pending').length;
    const acceptedCount = allPreview.filter(r => r.status === 'accepted').length;
    renderOwnerStats({ total_requests: allPreview.length, pending: pendingCount, accepted: acceptedCount });
    rows = ownerRequestFilter === 'all'
      ? allPreview
      : allPreview.filter(r => r.status === ownerRequestFilter);
  }

  const container = document.getElementById('ownerRequests');
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
  if (!isOwnerAdmin) {
    const row = getPreviewOwnerRows().find(r => String(r.id) === String(id));
    if (row) row.status = status;
    await loadOwnerRequests();
    toast(status === 'accepted' ? 'Booking accepted (preview mode)' : 'Request passed (preview mode)');
    return;
  }

  if (getActiveVendorRole() === 'staff') {
    toast('Vendor owner permission is required to accept or decline bookings');
    return;
  }

  try {
    const r = await fetch(API + '/owner/requests', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status })
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      toast(err.error || 'Could not update booking status');
      return;
    }
    toast(status === 'accepted' ? 'Booking inquiry accepted — reach out to finalize details!' : 'Booking inquiry declined');
    await loadOwnerDashboard();
  } catch {
    toast('Connection error — could not update booking status');
  }
}

async function updateOwnerLocation() {
  const location = (document.getElementById('ownerLocation')?.value || '').trim();
  if (!location) return toast('Please enter a parked location first');

  const rawLat = (document.getElementById('ownerLat')?.value || '').trim();
  const rawLng = (document.getElementById('ownerLng')?.value || '').trim();
  if ((rawLat !== '') !== (rawLng !== '')) {
    return toast('Enter both latitude and longitude, or leave both blank');
  }
  const lat = rawLat === '' ? null : Number(rawLat);
  const lng = rawLng === '' ? null : Number(rawLng);
  if (rawLat !== '' && (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180 || (lat === 0 && lng === 0))) {
    return toast('Enter valid decimal latitude (-90..90) and longitude (-180..180)');
  }

  const ttlMinutes = Number(document.getElementById('ownerLocationTtl')?.value) || 480;
  const isOpen = document.getElementById('ownerIsOpen') ? !!document.getElementById('ownerIsOpen').checked : true;

  if (isOwnerAdmin) {
    try {
      const r = await fetch(API + '/owner/location', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          truck_id: ownerTruckId,
          location,
          lat,
          lng,
          ttl_minutes: ttlMinutes,
          is_open: isOpen,
          opens_at: null,
          closes_at: null
        })
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        return toast(err.error || 'Could not publish location update');
      }
      await refreshDiscoveryCatalog({ fresh: true });
      return toast('Live location published');
    } catch {
      return toast('Connection error — could not publish location');
    }
  }

  const target = trucks.find(t => t.id === ownerTruckId);
  if (target) {
    target.location = location;
    applyFilters();
  }
  toast('Location updated in preview mode');
}

function toggleOwnerOpenStatus() {
  const open = !!document.getElementById('ownerIsOpen')?.checked;
  toast(open ? 'Marked open — click Save schedule to persist' : 'Marked unavailable — click Save schedule to persist');
}

async function saveOwnerSchedule() {
  const serviceDate = (document.getElementById('ownerScheduleDate')?.value || '').trim() || todayPacificISO();
  const opensAt = document.getElementById('ownerOpensAt')?.value || '11:00';
  const closesAt = document.getElementById('ownerClosesAt')?.value || '20:00';
  const isOpen = !!document.getElementById('ownerIsOpen')?.checked;
  const location = (document.getElementById('ownerLocation')?.value || '').trim() || null;
  const status = isOpen ? 'scheduled' : 'unavailable';
  const entry = { truck_id: ownerTruckId, service_date: serviceDate, opens_at: opensAt, closes_at: closesAt, location, status };

  if (isOwnerAdmin) {
    try {
      const r = await fetch(API + '/owner/schedule', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry)
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        return toast(err.error || 'Could not save schedule');
      }
      const saved = await r.json();
      ownerSchedule = [saved, ...ownerSchedule.filter(s => !(s.truck_id === ownerTruckId && toCalendarDateISO(s.service_date) === serviceDate))]
        .sort((a, b) => toCalendarDateISO(a.service_date).localeCompare(toCalendarDateISO(b.service_date)));
      renderOwnerScheduleList();
      await refreshDiscoveryCatalog({ fresh: true });
      return toast('Service schedule saved');
    } catch {
      return toast('Connection error — could not save schedule');
    }
  }

  ownerSchedule = [entry, ...ownerSchedule.filter(s => !(s.truck_id === ownerTruckId && toCalendarDateISO(s.service_date) === serviceDate))]
    .sort((a, b) => toCalendarDateISO(a.service_date).localeCompare(toCalendarDateISO(b.service_date)));
  localStorage.setItem('truckly_owner_schedule', JSON.stringify(ownerSchedule));
  renderOwnerScheduleList();
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
  if (nameInput) nameInput.value = ownerProfile.display_name || 'Your Food Truck';
  if (bioInput) bioInput.value = ownerProfile.description || '';
  if (acceptToggle) acceptToggle.checked = ownerProfile.accepting_bookings !== false;
  document.getElementById('ownerProfileModal')?.classList.add('show');
}

function closeOwnerProfileModal() {
  document.getElementById('ownerProfileModal')?.classList.remove('show');
}

async function saveOwnerProfile(e) {
  e.preventDefault();
  const displayName = (document.getElementById('ownerProfileName')?.value || '').trim();
  const cuisine = document.getElementById('ownerProfileCuisine')?.value || 'Mexican';
  const description = (document.getElementById('ownerProfileBio')?.value || '').trim();
  const accepting = !!document.getElementById('ownerAcceptingBookings')?.checked;
  if (!displayName) return toast('Display name is required');

  const payload = {
    truck_id: ownerTruckId,
    display_name: displayName,
    cuisine,
    description,
    accepting_bookings: accepting
  };

  if (isOwnerAdmin) {
    try {
      const r = await fetch(API + '/owner/profile', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        return toast(err.error || 'Could not save owner profile');
      }
      ownerProfile = await r.json();
      await refreshDiscoveryCatalog({ fresh: true });
    } catch {
      return toast('Connection error — could not save profile');
    }
  } else {
    ownerProfile = payload;
    localStorage.setItem('truckly_owner_profile', JSON.stringify(ownerProfile));
  }

  populateOwnerTruckSelect();
  renderOwnerHeader();
  closeOwnerProfileModal();
  toast(isOwnerAdmin ? 'Listing profile published' : 'Profile updated in preview mode');
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
  const files = [...e.target.files].slice(0, 6);
  const grid = document.getElementById('ownerPhotoGrid');
  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = () => {
      const d = document.createElement('div');
      d.className = 'owner-photo';
      d.style.backgroundImage = `url('${reader.result}')`;
      d.textContent = '';
      grid.appendChild(d);
    };
    reader.readAsDataURL(file);
  });
  if (files.length) toast(files.length + ' photo preview' + (files.length > 1 ? 's' : '') + ' added on this device');
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
    document.querySelectorAll('.modal-backdrop.show').forEach(el => el.classList.remove('show'));
    const menu = document.getElementById('profileMenu');
    if (menu) menu.open = false;
  }
});

window.bitesharkReady = window.trucklyReady = (document.readyState === 'loading'
  ? new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true }))
  : Promise.resolve()
).then(init);
