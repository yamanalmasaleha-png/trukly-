const API = (window.__HATCHABLE__ && window.__HATCHABLE__.api) || '/api';

let trucks = [
  {"id":"mitote","name":"Mitote Food Park","cuisine":"Mexican","section":"Mexican","emoji":"🎉","city":"Santa Rosa","lat":38.43,"lng":-122.72,"location":"100 Sebastopol Rd, Santa Rosa","blurb":"Mexican food park with a rotating vendor lineup.","source":"https://www.mitotefoodpark.com/","tags":["Mexican"],"rating":null,"reviews":null,"distance":0,"open":null,"price":"","color":"#f6bd4b","photo":null,"verified":false,"verification_status":"needs_review","location_accuracy":"illustrative_pin","listing_type":"Offline directory sample","hours":"Confirm the operator's current schedule","is_demo":true},
  {"id":"elroys","name":"El Roy's Express Mex","cuisine":"Mexican","section":"Mexican","emoji":"🌯","city":"Santa Rosa","lat":38.43,"lng":-122.74,"location":"1569 Sebastopol Rd, Santa Rosa","blurb":"Mexican street eats from the operator's Sebastopol Road truck.","source":"https://elroys.com/locations/","tags":["Mexican"],"rating":null,"reviews":null,"distance":0,"open":null,"price":"","color":"#d1cc94","photo":null,"verified":false,"verification_status":"needs_review","location_accuracy":"illustrative_pin","listing_type":"Offline directory sample","hours":"Confirm the operator's current schedule","is_demo":true},
  {"id":"xies","name":"Xies707 Sushi Rolls","cuisine":"Global","section":"Global","emoji":"🍣","city":"Santa Rosa","lat":38.43,"lng":-122.72,"location":"44 Sebastopol Ave, Santa Rosa","blurb":"Mexican-style sushi rolls; published Golden Tray selection.","source":"https://toast.app/r/xies-sushi-rolls-llc-xies707/order","tags":["Global"],"rating":null,"reviews":null,"distance":0,"open":null,"price":"","color":"#b8d7c7","photo":null,"verified":false,"verification_status":"needs_review","location_accuracy":"illustrative_pin","listing_type":"Offline directory sample","hours":"Confirm the operator's current schedule","is_demo":true},
  {"id":"dinos","name":"Dino's Greek Food","cuisine":"Global","section":"Global","emoji":"🥙","city":"Sonoma County","lat":38.44,"lng":-122.72,"location":"Sonoma County mobile schedule — location varies","blurb":"Greek street food including gyro and falafel.","source":"https://www.dinosgreekfoodtruck.com/","tags":["Global"],"rating":null,"reviews":null,"distance":0,"open":null,"price":"","color":"#b7c1ad","photo":null,"verified":false,"verification_status":"needs_review","location_accuracy":"illustrative_pin","listing_type":"Offline directory sample","hours":"Confirm the operator's current schedule","is_demo":true},
  {"id":"fruta","name":"Fru-ta Ice Cream Truck","cuisine":"Sweets","section":"Sweets","emoji":"🍨","city":"Santa Rosa","lat":38.4,"lng":-122.71,"location":"2970 Santa Rosa Ave, Santa Rosa","blurb":"Paletas, ice cream and a featured Bionico fruit bowl.","source":"https://toast.app/r/fru-ta-food-truck-2970-santa-rosa-ave/order","tags":["Sweets"],"rating":null,"reviews":null,"distance":0,"open":null,"price":"","color":"#e2c0a1","photo":null,"verified":false,"verification_status":"needs_review","location_accuracy":"illustrative_pin","listing_type":"Offline directory sample","hours":"Confirm the operator's current schedule","is_demo":true},
  {"id":"holy-chile","name":"Holy Chile Mole","cuisine":"Global","section":"Global","emoji":"🌮","city":"Petaluma area","lat":38.23,"lng":-122.63,"location":"Mobile schedule — confirm location before visiting","blurb":"BBQ-meat tacos and melts described by the operator.","source":"https://holychilemole.com/","tags":["Global"],"rating":null,"reviews":null,"distance":0,"open":null,"price":"","color":"#d5c69a","photo":null,"verified":false,"verification_status":"needs_review","location_accuracy":"illustrative_pin","listing_type":"Offline directory sample","hours":"Confirm the operator's current schedule","is_demo":true}
];

const cuisineSections = ['Mexican', 'Burgers', 'Hot Dogs', 'Global', 'Sweets', 'Coffee', 'Markets'];

const neighborhoodAdditions = [
  {"id":"farm-oakhill","name":"Oak Hill Farm — Red Barn Store","kind":"Farm Stands","cuisine":"Farm produce","emoji":"🥕","city":"Glen Ellen","location":"15101 Sonoma Highway, Glen Ellen","hours":"Spring–December · Wed 3–7 pm · Sat 9 am–3 pm; confirm before visiting","blurb":"Seasonal produce, flowers, and a pantry of goods from regional growers and makers.","source":"https://www.oakhillfarm.net/the-red-barn-store","extra":true,"open":null,"distance":null,"lat":null,"lng":null,"price":"","color":"#d5dfaa","verified":false,"photo_rights_verified":false,"photo":null,"tags":["Farm Stands"],"listing_type":"Farm Stands","checked":"November 14, 2026"},
  {"id":"farm-barn","name":"Farm Barn","kind":"Farm Stands","cuisine":"Eggs & farm goods","emoji":"🥚","city":"Petaluma","location":"2910 Pepper Road, Petaluma","hours":"Published hours: daily, 9 am to early evening; confirm before visiting","blurb":"An honor-system farm stand with eggs, honey, preserves, and goods from local producers.","source":"https://www.farmtrails.org/business/farm-barn/","extra":true,"open":null,"distance":null,"lat":null,"lng":null,"price":"","color":"#d5dfaa","verified":false,"photo_rights_verified":false,"photo":null,"tags":["Farm Stands"],"listing_type":"Farm Stands","checked":"November 14, 2026"},
  {"id":"market-sr-community","name":"Santa Rosa Community Farmers Market","kind":"Markets","cuisine":"Farmers market","emoji":"🧺","city":"Santa Rosa","location":"1351 Maple Ave, Santa Rosa","hours":"Wed 9 am–1 pm · Sat 8:30 am–1 pm · year-round; check organizer updates","blurb":"A regular stop for local growers and food vendors, now at the Veterans Memorial Building.","source":"https://www.ourfarmersmarkets.org/locations-santa-rosa/","extra":true,"open":null,"distance":null,"lat":null,"lng":null,"price":"","color":"#f3d28c","verified":false,"photo_rights_verified":false,"photo":null,"tags":["Markets"],"listing_type":"Markets","checked":"November 14, 2026"},
  {"id":"market-sr-original","name":"Santa Rosa Original Certified Farmers Market","kind":"Markets","cuisine":"Farmers market","emoji":"🍎","city":"Santa Rosa","location":"50 Mark West Springs Road, Santa Rosa","hours":"Sat 8:30 am–1 pm year-round; seasonal Wednesday market · check organizer updates","blurb":"Farmers and food producers gather at the Luther Burbank Center for the Arts.","source":"https://www.ourfarmersmarkets.org/locations-santa-rosa/","extra":true,"open":null,"distance":null,"lat":null,"lng":null,"price":"","color":"#f3d28c","verified":false,"photo_rights_verified":false,"photo":null,"tags":["Markets"],"listing_type":"Markets","checked":"November 14, 2026"},
  {"id":"truck-galvans","name":"Galvan’s Eatery","kind":"Food Trucks","popup":true,"cuisine":"Mexican-American","emoji":"🌮","city":"Sonoma County","location":"Rotating Sonoma County stops · see host calendar","hours":"Rotating pop-ups · confirm the next date and location with the host","blurb":"Mexican-American food truck with tacos and burritos; listed on Old Caz’s rotating food calendar.","source":"https://seadragon-flamingo-rwlk.squarespace.com/backyard-food-and-events","extra":true,"open":null,"distance":null,"lat":null,"lng":null,"price":"","color":"#eeb6a1","verified":false,"photo_rights_verified":false,"photo":null,"tags":["Food Trucks"],"listing_type":"Food Trucks","checked":"November 14, 2026"},
  {"id":"truck-flippin","name":"Los Flippin Tacos","kind":"Food Trucks","popup":true,"cuisine":"Mexican","emoji":"🌮","city":"Sonoma County","location":"Rotating stops · Old Caz host calendar","hours":"Rotating pop-ups · confirm the next date and location with the host","blurb":"Mexican street food served at local pop-up stops, including the Old Caz backyard.","source":"https://seadragon-flamingo-rwlk.squarespace.com/backyard-food-and-events","extra":true,"open":null,"distance":null,"lat":null,"lng":null,"price":"","color":"#eeb6a1","verified":false,"photo_rights_verified":false,"photo":null,"tags":["Food Trucks"],"listing_type":"Food Trucks","checked":"November 14, 2026"},
  {"id":"truck-casanostra","name":"Casa Nostra NorCal","kind":"Food Trucks","popup":true,"cuisine":"Pizza & pasta","emoji":"🍕","city":"Rohnert Park","location":"Rotating stops · Old Caz host calendar","hours":"Rotating pop-ups · confirm the next date and location with the host","blurb":"A Rohnert Park food truck serving wood-fired pizza and pasta at rotating stops.","source":"https://seadragon-flamingo-rwlk.squarespace.com/backyard-food-and-events","extra":true,"open":null,"distance":null,"lat":null,"lng":null,"price":"","color":"#eeb6a1","verified":false,"photo_rights_verified":false,"photo":null,"tags":["Food Trucks"],"listing_type":"Food Trucks","checked":"November 14, 2026"},
  {"id":"truck-thespot","name":"The Spot Food Truck","kind":"Food Trucks","popup":true,"cuisine":"Burgers & sandwiches","emoji":"🍔","city":"Sonoma County","location":"Rotating Sonoma County stops · see host calendar","hours":"Rotating pop-ups · confirm the next date and location with the host","blurb":"Burgers, sandwiches, and loaded fries on a rotating local food-truck schedule.","source":"https://seadragon-flamingo-rwlk.squarespace.com/backyard-food-and-events","extra":true,"open":null,"distance":null,"lat":null,"lng":null,"price":"","color":"#eeb6a1","verified":false,"photo_rights_verified":false,"photo":null,"tags":["Food Trucks"],"listing_type":"Food Trucks","checked":"November 14, 2026"},
  {"id":"coffee-crooks","name":"Crooks Coffee","city":"Santa Rosa","location":"404c Mendocino Avenue, Santa Rosa","hours":"Published hours: Mon–Fri 6 am–3 pm; Sat–Sun 7 am–3 pm. Confirm before visiting.","blurb":"A downtown coffee bar with espresso, specialty drinks, and toast plates.","special":"A crème brûlée latte shares the menu with Mexican mocha and café con miele. A coffee stop with a dessert-minded side.","source":"https://shadyraveninc.com/menu","extra":true,"kind":"Coffee","cuisine":"Coffee & café","emoji":"☕","open":null,"distance":null,"lat":null,"lng":null,"price":"","color":"#e4c4a0","verified":false,"photo_rights_verified":false,"photo":null,"tags":["Coffee"],"listing_type":"Coffee","checked":"November 14, 2026"},
  {"id":"coffee-retrograde","name":"Retrograde Coffee Roasters","city":"Sebastopol","location":"130 S Main Street #103, Sebastopol","hours":"Mon–Fri 7 am–5 pm; Sat–Sun 7 am–4 pm. Kitchen closes at 3 pm; confirm before visiting.","blurb":"Specialty coffee and prepared food on Main Street, with indoor seating and outdoor courtyard or parklet options.","special":"Coffee roasted in-house, a lineup of single origins and space-themed blends, and a Main Street café with outdoor seating.","source":"https://retrograderoasters.com/pages/visit","storySource":"https://retrograderoasters.com/","extra":true,"kind":"Coffee","cuisine":"Coffee & café","emoji":"☕","open":null,"distance":null,"lat":null,"lng":null,"price":"","color":"#e4c4a0","verified":false,"photo_rights_verified":false,"photo":null,"tags":["Coffee"],"listing_type":"Coffee","checked":"November 14, 2026"},
  {"id":"coffee-avid-petaluma","name":"Avid Coffee — Downtown Petaluma","city":"Petaluma","location":"21 4th Street, Petaluma","hours":"Sun–Thu 7 am–3 pm; Fri–Sat 7 am–4 pm. Confirm before visiting.","blurb":"A neighborhood café in historic downtown Petaluma.","special":"This café was the starting point of the business in 2011. Its local story began as Acre Coffee before the Avid name arrived in 2021.","source":"https://avidcoffee.com/pages/locations","storySource":"https://avidcoffee.com/pages/learn","extra":true,"kind":"Coffee","cuisine":"Coffee & café","emoji":"☕","open":null,"distance":null,"lat":null,"lng":null,"price":"","color":"#e4c4a0","verified":false,"photo_rights_verified":false,"photo":null,"tags":["Coffee"],"listing_type":"Coffee","checked":"November 14, 2026"},
  {"id":"coffee-avid-sr","name":"Avid Coffee — Montgomery Village","city":"Santa Rosa","location":"2365 Midway Drive, Santa Rosa","hours":"Published hours: daily 7 am–4 pm. Confirm before visiting.","blurb":"A spacious café at the north end of Montgomery Village.","special":"A neighborhood meeting place with roots in Sonoma County and a roastery in Windsor.","source":"https://avidcoffee.com/pages/locations","storySource":"https://avidcoffee.com/pages/learn","extra":true,"kind":"Coffee","cuisine":"Coffee & café","emoji":"☕","open":null,"distance":null,"lat":null,"lng":null,"price":"","color":"#e4c4a0","verified":false,"photo_rights_verified":false,"photo":null,"tags":["Coffee"],"listing_type":"Coffee","checked":"November 14, 2026"}
];

let activeKind = 'All';

function mergeNeighborhoodAdditions() {
  const ids = new Set(trucks.map(t => t.id));
  trucks.push(...neighborhoodAdditions.filter(t => !ids.has(t.id)).map(t => ({ ...t })));
}

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

function addDaysISO(isoDate, days) {
  const [y, m, d] = String(isoDate).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function defaultEventDate() {
  return addDaysISO(todayPacificISO(), 7);
}

function parseEventDate(raw) {
  const isoDay = String(raw || '').slice(0, 10);
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

function recomputeDistances() {
  if (!userCoords) return;
  trucks.forEach(t => {
    if (hasCoords(t)) {
      t.distance = +milesBetween(userCoords.lat, userCoords.lng, +t.lat, +t.lng).toFixed(1);
    }
  });
}

function distanceLabel(t, mode) {
  const hasDist = t && t.distance != null && Number.isFinite(+t.distance);
  if (t.location_accuracy === 'verified_coordinate' && hasDist) {
    return mode === 'detail' ? `${t.distance} mi away` : `${t.distance} mi`;
  }
  if (t.location_accuracy === 'venue_address' && hasDist) {
    return mode === 'detail' ? `~${t.distance} mi away` : `~${t.distance} mi`;
  }
  if (userCoords && hasDist) {
    return mode === 'detail' ? `~${t.distance} mi (area pin)` : `~${t.distance} mi area`;
  }
  if (mode === 'detail') return 'Pin is approximate';
  return mode === 'fav' ? 'Confirm location' : 'Location to confirm';
}

async function init() {
  map = L.map('map', { zoomControl: false, attributionControl: true }).setView([38.43, -122.70], 11);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19
  }).addTo(map);
  L.control.zoom({ position: 'bottomright' }).addTo(map);

  document.querySelectorAll('[data-cuisine]').forEach(b => {
    b.onclick = () => chooseCuisine(b.dataset.cuisine);
  });

  mergeNeighborhoodAdditions();

  const dateInput = document.getElementById('eventDate');
  if (dateInput && !dateInput.value) dateInput.value = defaultEventDate();

  let hasCached = false;
  try {
    const cached = safeJSON('truckly_catalog', null);
    if (Array.isArray(cached) && cached.length) {
      trucks = cached
        .filter(t => !t.extra && !['estrella', 'bao', 'ember', 'verde', 'swirl', 'masa'].includes(t.id))
        .map(t => ({
          ...t,
          verified: t.verification_status === 'business_confirmed',
          photo: t.photo_rights_verified ? t.photo : null
        }));
      mergeNeighborhoodAdditions();
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

  try {
    const r = await fetch(API + '/trucks');
    if (r.ok) {
      const live = await r.json();
      if (Array.isArray(live.trucks) && live.trucks.length) {
        trucks = live.trucks;
        localStorage.setItem('truckly_catalog', JSON.stringify(trucks));
        mergeNeighborhoodAdditions();
        recomputeDistances();
        selectedTruck = trucks[0]?.id || null;
        if (!userCoords) document.getElementById('locationLabel').textContent = 'Sonoma County';
      }
    }
  } catch (e) {
    console.warn('Live truck feed unavailable', e);
  }

  applyFilters();
  renderFavorites();
  renderBookings();
  syncAuthAndUserData();

  map.whenReady(() => {
    map.invalidateSize();
    setTimeout(() => map.invalidateSize(), 250);
  });
  map.on('zoomend', () => applyFilters());
  const mapWrap = document.querySelector('.map-wrap');
  if (mapWrap && typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => map.invalidateSize()).observe(mapWrap);
  }
  window.addEventListener('orientationchange', () => setTimeout(() => map.invalidateSize(), 250));
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

function applyFilters() {
  if (!map) return;
  mergeNeighborhoodAdditions();
  const show = filtered();
  Object.values(markers).forEach(m => map.removeLayer(m));
  markers = {};

  const pinLimit = map.getZoom() >= 14 ? 18 : (activeCuisine === 'All' ? 10 : 14);
  const pinList = show
    .filter(hasCoords)
    .sort((a, b) => (b.id === selectedTruck) - (a.id === selectedTruck) || (Number(b.open === true) - Number(a.open === true)) || ((a.distance ?? 999) - (b.distance ?? 999)))
    .slice(0, pinLimit);

  pinList.forEach(t => {
    const badge = t.verified && t.open === true
      ? 'OPEN'
      : (t.open === true ? 'EST OPEN' : (t.listing_type === 'Fixed truck / venue' ? 'HOURS' : 'CHECK'));
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

  const isListMode = document.getElementById('discoverScreen').classList.contains('list-mode');
  document.getElementById('nearbyCount').textContent = `${show.length} ${show.length === 1 ? 'place' : 'places'}${isListMode ? ' to explore' : ' · ' + pinList.length + ' on map'}`;

  const hoursNote = document.getElementById('openHoursNote');
  if (hoursNote) {
    hoursNote.hidden = !(openOnly && show.some(t => !t.verified));
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
  const safeId = esc(t.id);
  return `<article class="truck-card" onclick="openDetail('${safeId}')"><button class="heart ${isSaved ? 'saved' : ''}" aria-label="${isSaved ? 'Remove from favorites' : 'Save to favorites'}" aria-pressed="${isSaved}" onclick="event.stopPropagation();toggleFav('${safeId}')">${isSaved ? '♥' : '♡'}</button><div class="truck-photo icon-photo" style="background:${esc(t.color)}"><span class="photo-emoji">${esc(t.emoji)}</span><span class="open-tag">${esc(t.kind || 'Local')}</span></div><div class="truck-info"><h3>${esc(t.name)}</h3><div class="meta">${esc(t.cuisine)} · ${esc(t.city)}</div><div class="distance">${esc(t.blurb)}</div><button class="detail-link" onclick="event.stopPropagation();openDetail('${safeId}')">Hours &amp; details ↗</button></div></article>`;
}

function extraDetail(t) {
  const safeId = esc(t.id);
  const storyHref = esc(t.storySource || t.source || '');
  document.getElementById('detailContent').innerHTML = `<button class="modal-close" onclick="closeModal()" aria-label="Close details">×</button><div class="detail-hero icon-photo" style="background:${esc(t.color)}"><span class="photo-emoji">${esc(t.emoji)}</span></div><div class="detail-body"><small>${esc((t.kind || t.cuisine || 'Local').toUpperCase())}</small><h2>${esc(t.name)}</h2><p>${esc(t.blurb)}</p>${t.special ? `<aside class="special-note"><small>WHAT MAKES IT SPECIAL</small><p>${esc(t.special)}</p><a href="${storyHref}" target="_blank" rel="noopener noreferrer">Read the business’s own story ↗</a></aside>` : ''}<div class="detail-location"><b>${esc(t.location)}</b><small>${esc(t.hours)}</small></div><p class="meta">Source checked ${esc(t.checked || 'recently')}. Hours and pop-up locations can change. No live open status or verified distance is available for this listing.</p><a class="primary source-button" target="_blank" rel="noopener noreferrer" href="${esc(t.source || '#')}">View published ${t.popup ? 'pop-up calendar' : 'hours & information'} ↗</a><a class="map-link" target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(t.popup ? t.name + ' Sonoma County' : t.location)}">Find ${t.popup ? 'this truck' : 'this place'} on Google Maps ↗</a><button class="detail-link" type="button" onclick="if(typeof communityReviewPlace==='function')communityReviewPlace('${safeId}')">✎ Write a local review →</button></div>`;
  document.getElementById('detailModal').classList.add('show');
}

function cardHTML(t) {
  if (t.extra) return extraCard(t);
  const openTag = t.verified && t.open === true
    ? '● OPEN'
    : (t.open === true ? '◐ EST. OPEN' : (t.id === 'ross' ? 'CHECK LINEUP' : 'CHECK HOURS'));
  const isSaved = favs.has(t.id);
  const safeId = esc(t.id);
  return `<article class="truck-card" onclick="openTruck('${safeId}')"><button class="heart ${isSaved ? 'saved' : ''}" aria-label="${isSaved ? 'Remove from favorites' : 'Save to favorites'}" aria-pressed="${isSaved}" onclick="event.stopPropagation();toggleFav('${safeId}')">${isSaved ? '♥' : '♡'}</button><div class="truck-photo ${t.photo ? '' : 'icon-photo'}" style="${t.photo ? `background-image:url('${esc(t.photo)}')` : `background:${esc(t.color)}`}">${t.photo ? '' : `<span class="photo-emoji">${esc(t.emoji)}</span>`}<span class="open-tag">${openTag}</span></div><div class="truck-info"><h3>${esc(t.name)}</h3><div class="meta"><span class="rating">${t.verified && t.rating ? `★ ${esc(t.rating)}` : 'Menu & info'}</span> ${t.verified && t.reviews ? `(${esc(t.reviews)}) · ` : ''}${esc(t.cuisine)}${t.price ? ' · ' + esc(t.price) : ''}</div><div class="meta city-meta">${esc(t.city || 'Sonoma County')} · ${esc(t.listing_type || t.availability || '')}</div><div class="distance">⌖ <b>${esc(distanceLabel(t, 'card'))}</b> · ${esc(t.location)}</div><button class="detail-link" onclick="event.stopPropagation();openDetail('${safeId}')">Get the lowdown →</button></div></article>`;
}

function selectTruck(id) {
  selectedTruck = id;
  const t = trucks.find(x => x.id === id);
  if (!t || !map || !hasCoords(t)) return;
  const offset = window.innerWidth < 750 ? 0.006 : 0;
  map.flyTo([+t.lat + offset, +t.lng], 15, { duration: 0.55 });
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
  const statusPrefix = t.verified && t.open === true
    ? '● OPEN NOW · '
    : (t.open === true ? '◐ PUBLISHED HOURS (UNVERIFIED) · ' : '');
  const safeId = esc(t.id);
  document.getElementById('detailContent').innerHTML = `<button class="modal-close" onclick="closeModal()">×</button><div class="detail-hero ${t.photo ? '' : 'icon-photo'}" style="${t.photo ? `background-image:url('${esc(t.photo)}')` : `background:${esc(t.color)}`}">${t.photo ? '' : `<span class="photo-emoji">${esc(t.emoji)}</span>`}</div><div class="detail-body"><small>${statusPrefix}${esc(t.cuisine).toUpperCase()}</small><h2>${esc(t.emoji)} ${esc(t.name)}</h2><p>${esc(t.blurb)}</p><div class="detail-tags"><span>${t.verified && t.rating ? `★ ${esc(t.rating)} (${esc(t.reviews)})` : 'Check the menu'}</span>${t.price ? `<span>${esc(t.price)}</span>` : ''}<span>${esc(distanceLabel(t, 'detail'))}</span></div><div class="detail-location"><b>⌖ ${esc(t.location)}</b><small>Published/estimated · ${esc(t.hours)}</small></div><div class="truth-card"><span class="verified-dot">✓</span><div><b>${t.verified ? 'Source-verified listing' : 'Details pending verification'}</b><small>${esc(t.listing_type || t.availability || 'Mobile vendor')} · ${esc(t.city || 'Sonoma County')} · Pacific time</small></div></div><a class="map-link" target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(t.location)}">Open location in Google Maps ↗</a><button class="detail-link" type="button" onclick="if(typeof communityReviewPlace==='function')communityReviewPlace('${safeId}')">✎ Write a local review →</button><button class="primary" onclick="closeModal();openBooking('${safeId}')">Request this truck for an event →</button></div>`;
  document.getElementById('detailModal').classList.add('show');
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
    if (window.hatchable && window.hatchable.auth && typeof window.hatchable.auth.getUser === 'function') {
      const u = await window.hatchable.auth.getUser().catch(() => null);
      if (u) currentUser = u;
    } else if (window.__HATCHABLE__ && window.__HATCHABLE__.user) {
      currentUser = window.__HATCHABLE__.user;
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
    const auth = window.hatchable && window.hatchable.auth;
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
  document.getElementById('mapMode').setAttribute('aria-pressed', String(mode === 'map'));
  document.getElementById('listMode').setAttribute('aria-pressed', String(mode === 'list'));
  const discover = document.getElementById('discoverScreen');
  discover.classList.toggle('list-mode', mode === 'list');
  document.getElementById('mapMode').classList.toggle('active', mode === 'map');
  document.getElementById('listMode').classList.toggle('active', mode === 'list');
  applyFilters();
  if (mode === 'map' && map) setTimeout(() => map.invalidateSize(), 40);
}

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(name + 'Screen').classList.add('active');
  document.querySelectorAll('.bottom-nav button[data-screen]').forEach(b => b.classList.toggle('active', b.dataset.screen === name));
  if (name === 'discover' && map) setTimeout(() => map.invalidateSize(), 30);
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

      if (map) {
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
  if (t) checkBookingAvailability();
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
      event_date: String(payload.event_date || eventDate).slice(0, 10),
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
    const msg = 'Could not reach Truckly right now. Check your connection and retry — duplicate sends are protected.';
    setBookingError(msg);
    toast(msg);
  } finally {
    if (submitBtn) submitBtn.disabled = false;
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
      event_date: String(b.event_date || '').slice(0, 10)
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
    return new Date().toISOString().slice(0, 10);
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

  const existing = ownerSchedule.find(s => String(s.service_date).slice(0, 10) === dateInput.value && (!s.truck_id || s.truck_id === ownerTruckId));
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
        const dayStr = String(s.service_date || '').slice(0, 10);
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
        const openToggle = document.getElementById('ownerIsOpen');
        const opensEl = document.getElementById('ownerOpensAt');
        const closesEl = document.getElementById('ownerClosesAt');
        if (locInput && loc.location) locInput.value = loc.location;
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

  const isOpen = !!document.getElementById('ownerIsOpen')?.checked;
  const opensAt = document.getElementById('ownerOpensAt')?.value || null;
  const closesAt = document.getElementById('ownerClosesAt')?.value || null;

  if (isOwnerAdmin) {
    try {
      const r = await fetch(API + '/owner/location', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ truck_id: ownerTruckId, location, is_open: isOpen, opens_at: opensAt, closes_at: closesAt })
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        return toast(err.error || 'Could not publish location update');
      }
    } catch {
      return toast('Connection error — could not publish location');
    }
  }

  const target = trucks.find(t => t.id === ownerTruckId);
  if (target) {
    target.location = location;
    applyFilters();
  }
  toast(isOwnerAdmin ? 'Live location published' : 'Location updated in preview mode');
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
      ownerSchedule = [saved, ...ownerSchedule.filter(s => !(s.truck_id === ownerTruckId && String(s.service_date).slice(0, 10) === serviceDate))]
        .sort((a, b) => String(a.service_date).localeCompare(String(b.service_date)));
      renderOwnerScheduleList();
      return toast('Service schedule saved');
    } catch {
      return toast('Connection error — could not save schedule');
    }
  }

  ownerSchedule = [entry, ...ownerSchedule.filter(s => !(s.truck_id === ownerTruckId && String(s.service_date).slice(0, 10) === serviceDate))]
    .sort((a, b) => String(a.service_date).localeCompare(String(b.service_date)));
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
  const shareText = `${name} is parked at ${location} — find us on Truckly!`;
  try {
    if (navigator.share) {
      await navigator.share({ title: name, text: shareText, url: window.location?.origin || 'https://truckly.hatchable.site' });
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

window.trucklyReady = (document.readyState === 'loading'
  ? new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true }))
  : Promise.resolve()
).then(init);
