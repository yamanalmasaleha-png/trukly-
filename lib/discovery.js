// Unified PostgreSQL discovery read model, truthful location resolver,
// Pacific (America/Los_Angeles) schedule evaluator, and freshness helpers.
// Placed in lib/ (outside api/) so Hatchable does not expose helper modules as routes.

import crypto from 'node:crypto';

export const CATALOG_SECTIONS = Object.freeze([
  'Mexican',
  'Burgers',
  'Hot Dogs',
  'Global',
  'Sweets',
  'Markets'
]);

export const MEASURED_LOCATION_ACCURACIES = Object.freeze([
  'verified_coordinate',
  'venue_address',
  'owner_reported_coords'
]);

export const FORBIDDEN_SELF_ELEVATION_FIELDS = Object.freeze([
  'verified',
  'verification_status',
  'photo_rights_verified',
  'photo'
]);

const MEASURED_ACCURACY_SET = new Set(MEASURED_LOCATION_ACCURACIES);
const SECTION_SET = new Set(CATALOG_SECTIONS);
const WEEKDAY_NAMES = Object.freeze(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
const LEGACY_LIVE_TTL_MS = 12 * 60 * 60 * 1000;

export function findForbiddenSelfElevationField(body) {
  if (!body || typeof body !== 'object') return null;
  for (const field of FORBIDDEN_SELF_ELEVATION_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      return field;
    }
  }
  return null;
}

export function validateCoordinates(rawLat, rawLng) {
  const latEmpty = rawLat === undefined || rawLat === null || rawLat === '';
  const lngEmpty = rawLng === undefined || rawLng === null || rawLng === '';
  if (latEmpty && lngEmpty) {
    return { ok: true, hasCoords: false, lat: null, lng: null };
  }
  if (latEmpty !== lngEmpty) {
    return { ok: false, error: 'Both lat and lng must be provided together, or both omitted.' };
  }
  if (typeof rawLat === 'boolean' || typeof rawLng === 'boolean' || Array.isArray(rawLat) || Array.isArray(rawLng)) {
    return { ok: false, error: 'lat and lng must be finite decimal coordinates.' };
  }
  const lat = typeof rawLat === 'number' ? rawLat : (typeof rawLat === 'string' && rawLat.trim() !== '' ? Number(rawLat.trim()) : NaN);
  const lng = typeof rawLng === 'number' ? rawLng : (typeof rawLng === 'string' && rawLng.trim() !== '' ? Number(rawLng.trim()) : NaN);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, error: 'lat and lng must be finite decimal coordinates.' };
  }
  if (lat < -90 || lat > 90) {
    return { ok: false, error: 'lat must be between -90 and 90 degrees.' };
  }
  if (lng < -180 || lng > 180) {
    return { ok: false, error: 'lng must be between -180 and 180 degrees.' };
  }
  if (Math.abs(lat) < 1e-6 && Math.abs(lng) < 1e-6) {
    return { ok: false, error: 'Coordinates (0, 0) are rejected; provide real venue/truck coordinates or omit lat/lng.' };
  }
  return {
    ok: true,
    hasCoords: true,
    lat: Number(lat.toFixed(6)),
    lng: Number(lng.toFixed(6))
  };
}

export function milesBetween(lat1, lng1, lat2, lng2) {
  const toRad = deg => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function shiftCalendarDate(isoDate, deltaDays) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(year, month - 1, day + deltaDays));
  const y = String(dt.getUTCFullYear()).padStart(4, '0');
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function weekdayForCalendarDate(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(year, month - 1, day));
  return WEEKDAY_NAMES[dt.getUTCDay()];
}

export function getPacificClock(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  })
    .formatToParts(now)
    .reduce((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});

  const pacificToday = `${parts.year}-${parts.month}-${parts.day}`;
  const pacificYesterday = shiftCalendarDate(pacificToday, -1);
  const hour = Number(parts.hour) % 24;
  const minute = Number(parts.minute);
  return {
    now,
    nowMs: now.getTime(),
    pacificToday,
    pacificYesterday,
    pacificWeekday: parts.weekday || weekdayForCalendarDate(pacificToday),
    pacificYesterdayWeekday: weekdayForCalendarDate(pacificYesterday),
    pacificMinutes: hour * 60 + minute
  };
}

export function parseTimeMinutes(value) {
  if (typeof value !== 'string') return null;
  const m = /^([01]\d|2[0-3]):([0-5]\d)/.exec(value.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function format12Hour(hhmm) {
  const mins = parseTimeMinutes(hhmm);
  if (mins === null) return null;
  const h24 = Math.floor(mins / 60);
  const m = mins % 60;
  const period = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return m === 0 ? `${h12} ${period}` : `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

function formatWindowHours(opensRaw, closesRaw, fallbackPrefix) {
  const openFmt = format12Hour(opensRaw);
  const closeFmt = format12Hour(closesRaw);
  const openMins = parseTimeMinutes(opensRaw);
  const closeMins = parseTimeMinutes(closesRaw);
  if (openFmt && closeFmt) {
    const overnightSuffix = openMins !== null && closeMins !== null && openMins > closeMins ? ' (overnight)' : '';
    return `${fallbackPrefix}: ${openFmt} – ${closeFmt}${overnightSuffix}`;
  }
  if (openFmt) return `${fallbackPrefix}: from ${openFmt}`;
  if (closeFmt) return `${fallbackPrefix}: until ${closeFmt}`;
  return fallbackPrefix;
}

function evaluateSameDayOrStartWindow(opensRaw, closesRaw, currentMinutes) {
  const openMins = parseTimeMinutes(opensRaw);
  const closeMins = parseTimeMinutes(closesRaw);
  if (openMins === null && closeMins === null) return true;
  if (openMins !== null && closeMins === null) return currentMinutes >= openMins;
  if (openMins === null && closeMins !== null) return currentMinutes < closeMins;
  if (openMins === closeMins) return true;
  if (openMins < closeMins) {
    return currentMinutes >= openMins && currentMinutes < closeMins;
  }
  // Overnight window starting today (e.g. 21:00 -> 02:00): open from opens_at through midnight.
  return currentMinutes >= openMins;
}

function evaluateLiveWindow(opensRaw, closesRaw, currentMinutes) {
  const openMins = parseTimeMinutes(opensRaw);
  const closeMins = parseTimeMinutes(closesRaw);
  if (openMins === null && closeMins === null) return true;
  if (openMins !== null && closeMins === null) return currentMinutes >= openMins;
  if (openMins === null && closeMins !== null) return currentMinutes < closeMins;
  if (openMins === closeMins) return true;
  if (openMins < closeMins) {
    return currentMinutes >= openMins && currentMinutes < closeMins;
  }
  // Non-expired live overnight window (e.g. 21:00 -> 02:00) spans across midnight while active.
  return currentMinutes >= openMins || currentMinutes < closeMins;
}

function toIsoOrNull(val) {
  if (!val) return null;
  const d = val instanceof Date ? val : new Date(val);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function epochMsOf(val) {
  if (!val) return 0;
  const d = val instanceof Date ? val : new Date(val);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

function sameLocationText(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const norm = s => s.replace(/\s+/g, ' ').trim().toLowerCase();
  const na = norm(a);
  const nb = norm(b);
  return Boolean(na && nb && na === nb);
}

function normalizePhotoUrl(photo, photoRightsVerified) {
  if (photoRightsVerified !== true || typeof photo !== 'string') return null;
  const trimmed = photo.trim();
  if (!trimmed || /images\.unsplash\.com/i.test(trimmed)) return null;
  return trimmed;
}

function parseRecurringSchedule(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return null;
}

export function evaluateSchedulePrecedence(row, clock) {
  const curatedHours = row.curated_hours || 'Schedule not verified · contact vendor';

  // 1. Explicit date-specific unavailability today overrides everything.
  if (row.os_status === 'unavailable') {
    return {
      open: false,
      schedule_source: 'owner_schedule',
      schedule_status: 'unavailable_today',
      is_confirmed_service: false,
      hours: 'Marked unavailable today by vendor',
      usedYesterdayOvernight: false
    };
  }

  // 2. Active overnight spillover from yesterday's scheduled service (e.g. 21:00 -> 02:00 at 01:15).
  if (row.ys_status === 'scheduled') {
    const yOpen = parseTimeMinutes(row.ys_opens_at);
    const yClose = parseTimeMinutes(row.ys_closes_at);
    if (yOpen !== null && yClose !== null && yOpen > yClose && clock.pacificMinutes < yClose) {
      return {
        open: true,
        schedule_source: 'owner_schedule',
        schedule_status: 'owner_scheduled_open',
        is_confirmed_service: true,
        hours: formatWindowHours(row.ys_opens_at, row.ys_closes_at, 'Scheduled service'),
        usedYesterdayOvernight: true
      };
    }
  }

  // 3. Date-specific schedule today.
  if (row.os_status === 'scheduled') {
    const isOpen = evaluateSameDayOrStartWindow(row.os_opens_at, row.os_closes_at, clock.pacificMinutes);
    return {
      open: isOpen,
      schedule_source: 'owner_schedule',
      schedule_status: isOpen ? 'owner_scheduled_open' : 'owner_scheduled_closed',
      is_confirmed_service: isOpen,
      hours: formatWindowHours(row.os_opens_at, row.os_closes_at, 'Scheduled today'),
      usedYesterdayOvernight: false
    };
  }

  // 4. Non-expired owner live status (`truck_settings`).
  const tsPresent = Boolean(row.ts_truck_id);
  const tsUpdatedMs = epochMsOf(row.ts_updated_at);
  const tsExpiresMs = row.ts_expires_at
    ? epochMsOf(row.ts_expires_at)
    : tsUpdatedMs > 0
      ? tsUpdatedMs + LEGACY_LIVE_TTL_MS
      : 0;
  const tsExpired = tsPresent ? !(tsExpiresMs > clock.nowMs) : false;

  if (tsPresent && !tsExpired) {
    if (row.ts_is_open === false) {
      return {
        open: false,
        schedule_source: 'owner_live',
        schedule_status: 'owner_paused_today',
        is_confirmed_service: false,
        hours: 'Closed right now · updated by vendor',
        usedYesterdayOvernight: false
      };
    }
    const isOpen = evaluateLiveWindow(row.ts_opens_at, row.ts_closes_at, clock.pacificMinutes);
    const liveHours =
      row.ts_opens_at || row.ts_closes_at
        ? formatWindowHours(row.ts_opens_at, row.ts_closes_at, 'Live hours today')
        : 'Open today · live vendor update';
    return {
      open: isOpen,
      schedule_source: 'owner_live',
      schedule_status: isOpen ? 'owner_live_open' : 'owner_live_closed',
      is_confirmed_service: isOpen,
      hours: liveHours,
      usedYesterdayOvernight: false
    };
  }

  // 5. Curated recurring hours (estimated/published, never marked confirmed live service).
  const recurring = parseRecurringSchedule(row.recurring_schedule);
  if (recurring && Array.isArray(recurring.days) && recurring.days.length > 0) {
    const rOpen = parseTimeMinutes(recurring.opens);
    const rClose = parseTimeMinutes(recurring.closes);
    let inRecurringWindow = false;

    if (rOpen !== null && rClose !== null && rOpen > rClose) {
      if (recurring.days.includes(clock.pacificYesterdayWeekday) && clock.pacificMinutes < rClose) {
        inRecurringWindow = true;
      } else if (recurring.days.includes(clock.pacificWeekday) && clock.pacificMinutes >= rOpen) {
        inRecurringWindow = true;
      }
    } else if (recurring.days.includes(clock.pacificWeekday)) {
      inRecurringWindow = evaluateSameDayOrStartWindow(recurring.opens, recurring.closes, clock.pacificMinutes);
    }

    return {
      open: inRecurringWindow,
      schedule_source: 'published_recurring',
      schedule_status: inRecurringWindow ? 'published_hours_unverified' : 'outside_published_hours',
      is_confirmed_service: false,
      hours: curatedHours,
      usedYesterdayOvernight: false
    };
  }

  // 6. Unverified / unknown schedule.
  return {
    open: null,
    schedule_source: 'unverified',
    schedule_status: 'unconfirmed',
    is_confirmed_service: false,
    hours: curatedHours,
    usedYesterdayOvernight: false
  };
}

export function evaluateVendorDiscoveryRow(row, { clock, userCoords } = {}) {
  const activeClock = clock || getPacificClock();

  const opName = typeof row.op_display_name === 'string' && row.op_display_name.trim() ? row.op_display_name.trim() : null;
  const opCuisine = typeof row.op_cuisine === 'string' && row.op_cuisine.trim() ? row.op_cuisine.trim() : null;
  const opDescription = typeof row.op_description === 'string' && row.op_description.trim() ? row.op_description.trim() : null;

  const name = opName || row.canonical_name;
  const cuisine = opCuisine || row.cuisine;
  const blurb = opDescription || row.blurb || 'Find local food and check the current menu, location and availability directly with the vendor.';
  const extra = row.extra === true;
  const eventBookable = row.event_bookable === true;
  const acceptingBookings = eventBookable
    ? row.op_accepting_bookings === null || row.op_accepting_bookings === undefined
      ? true
      : row.op_accepting_bookings === true
    : false;

  const baseTags = Array.isArray(row.tags) ? row.tags.filter(Boolean) : [];
  const mergedTags = [...baseTags];
  if (cuisine && SECTION_SET.has(cuisine) && !mergedTags.includes(cuisine)) {
    mergedTags.unshift(cuisine);
  }

  const verified = row.verified === true && row.verification_status === 'business_confirmed';
  const verificationStatus = verified ? 'business_confirmed' : 'needs_review';
  const photoRightsVerified = row.photo_rights_verified === true;
  const photo = normalizePhotoUrl(row.photo, photoRightsVerified);

  const schedule = evaluateSchedulePrecedence(row, activeClock);

  const tsPresent = Boolean(row.ts_truck_id);
  const tsUpdatedMs = epochMsOf(row.ts_updated_at);
  const tsExpiresMs = row.ts_expires_at
    ? epochMsOf(row.ts_expires_at)
    : tsUpdatedMs > 0
      ? tsUpdatedMs + LEGACY_LIVE_TTL_MS
      : 0;
  const tsExpired = tsPresent ? !(tsExpiresMs > activeClock.nowMs) : false;

  const curatedLat = row.curated_lat !== null && row.curated_lat !== undefined ? Number(row.curated_lat) : null;
  const curatedLng = row.curated_lng !== null && row.curated_lng !== undefined ? Number(row.curated_lng) : null;

  let location;
  let lat;
  let lng;
  let locationSource;
  let locationAccuracy;
  let locationObservedAt;
  let locationExpiresAt = tsPresent && tsExpiresMs > 0 ? new Date(tsExpiresMs).toISOString() : null;
  let locationExpired = Boolean(tsPresent && tsExpired);
  let locationIsLive = false;

  const scheduledStopLocation = schedule.usedYesterdayOvernight
    ? (typeof row.ys_location === 'string' && row.ys_location.trim() ? row.ys_location.trim() : null)
    : row.os_status === 'scheduled' && typeof row.os_location === 'string' && row.os_location.trim()
      ? row.os_location.trim()
      : null;

  if (tsPresent && !tsExpired && typeof row.ts_location === 'string' && row.ts_location.trim()) {
    location = row.ts_location.trim();
    locationSource = row.ts_location_source || 'owner_reported';
    locationObservedAt = toIsoOrNull(row.ts_observed_at || row.ts_updated_at);
    locationExpired = false;
    locationIsLive = schedule.open === true && schedule.is_confirmed_service === true;

    if (row.ts_lat !== null && row.ts_lat !== undefined && row.ts_lng !== null && row.ts_lng !== undefined) {
      lat = Number(row.ts_lat);
      lng = Number(row.ts_lng);
      locationAccuracy = 'owner_reported_coords';
    } else if (sameLocationText(location, row.curated_location)) {
      // Same published text as baseline address -> safe to retain baseline pin without upgrading accuracy
      lat = curatedLat;
      lng = curatedLng;
      locationAccuracy = 'owner_text_only';
    } else {
      // Different text-only parked spot without GPS coordinates -> never pin onto an unrelated default address!
      lat = null;
      lng = null;
      locationAccuracy = 'owner_text_only';
    }
  } else if (scheduledStopLocation) {
    location = scheduledStopLocation;
    locationSource = 'temporary_service';
    locationObservedAt = toIsoOrNull(schedule.usedYesterdayOvernight ? row.ys_updated_at : row.os_updated_at);
    locationIsLive = schedule.open === true && schedule.is_confirmed_service === true;

    if (sameLocationText(scheduledStopLocation, row.curated_location)) {
      lat = curatedLat;
      lng = curatedLng;
      locationAccuracy = row.curated_location_accuracy || (lat !== null ? 'illustrative_pin' : 'none');
    } else {
      // Temporary scheduled stop at a different location without coordinates -> omit stale default pin
      lat = null;
      lng = null;
      locationAccuracy = 'owner_text_only';
    }
  } else {
    location = row.curated_location || 'Sonoma County service area · location varies';
    lat = curatedLat;
    lng = curatedLng;
    locationSource = row.curated_location_source || 'curated_illustrative';
    locationAccuracy = row.curated_location_accuracy || (lat !== null ? 'illustrative_pin' : 'none');
    locationObservedAt = tsPresent ? toIsoOrNull(row.ts_observed_at || row.ts_updated_at) : null;
    locationIsLive = false;
  }

  let distance = null;
  if (
    userCoords &&
    userCoords.hasCoords &&
    lat !== null &&
    lng !== null &&
    MEASURED_ACCURACY_SET.has(locationAccuracy)
  ) {
    distance = Number(milesBetween(userCoords.lat, userCoords.lng, lat, lng).toFixed(1));
  }

  let availability;
  if (schedule.schedule_status === 'unavailable_today' || schedule.schedule_status === 'owner_paused_today') {
    availability = 'Marked closed / unavailable today by vendor';
  } else if (schedule.is_confirmed_service) {
    availability = schedule.schedule_source === 'owner_schedule'
      ? 'Vendor-published schedule active today'
      : 'Live status reported by vendor today';
  } else if (verified) {
    availability = row.listing_type === 'Fixed truck / venue' ? 'At this location' : row.listing_type || 'Mobile / catering';
  } else {
    availability = 'Hours and availability unconfirmed';
  }

  const listing = {
    id: row.id,
    name,
    canonical_name: row.canonical_name,
    section: row.section || null,
    cuisine,
    emoji: row.emoji || '🚚',
    rating: row.rating !== null && row.rating !== undefined ? Number(row.rating) : null,
    reviews: row.reviews !== null && row.reviews !== undefined ? Number(row.reviews) : null,
    distance,
    open: schedule.open,
    is_confirmed_service: schedule.is_confirmed_service,
    schedule_source: schedule.schedule_source,
    schedule_status: schedule.schedule_status,
    lat,
    lng,
    city: row.city,
    listing_type: row.listing_type || 'Mobile / catering',
    listing_kind: row.listing_kind,
    popup: row.popup === true,
    extra,
    featured: row.featured === true,
    event_bookable: eventBookable,
    accepting_bookings: acceptingBookings,
    location,
    location_source: locationSource,
    location_accuracy: locationAccuracy,
    location_observed_at: locationObservedAt,
    location_expires_at: locationExpiresAt,
    location_is_live: locationIsLive,
    location_expired: locationExpired,
    hours: schedule.hours,
    price: row.price ?? '$$',
    color: row.color || '#ff6b5f',
    photo,
    blurb,
    verified,
    verification_status: verificationStatus,
    photo_rights_verified: photoRightsVerified,
    availability,
    tags: mergedTags
  };

  if (row.kind_label) listing.kind = row.kind_label;
  if (row.special_note) listing.special = row.special_note;
  if (row.source_url) listing.source = row.source_url;
  if (row.story_source_url) listing.storySource = row.story_source_url;
  if (row.checked_label) listing.checked = row.checked_label;

  return listing;
}

const DISCOVERY_SQL_BASE = `
  WITH sched_latest AS (
    SELECT truck_id, max(updated_at) AS max_sched_updated_at
    FROM owner_schedule
    GROUP BY truck_id
  )
  SELECT
    v.id,
    v.sort_order,
    v.canonical_name,
    v.section,
    v.cuisine,
    v.emoji,
    v.city,
    v.listing_kind,
    v.kind_label,
    v.listing_type,
    v.popup,
    v.extra,
    v.blurb,
    v.special_note,
    v.source_url,
    v.story_source_url,
    v.checked_label,
    v.price,
    v.color,
    v.tags,
    v.rating,
    v.reviews,
    v.featured,
    v.curated_location,
    v.curated_lat,
    v.curated_lng,
    v.curated_location_source,
    v.curated_location_accuracy,
    v.curated_hours,
    v.recurring_schedule,
    v.verified,
    v.verification_status,
    v.photo,
    v.photo_rights_verified,
    v.event_bookable,
    v.updated_at AS v_updated_at,
    op.display_name AS op_display_name,
    op.description AS op_description,
    op.cuisine AS op_cuisine,
    op.accepting_bookings AS op_accepting_bookings,
    op.updated_at AS op_updated_at,
    ts.truck_id AS ts_truck_id,
    ts.location AS ts_location,
    ts.lat AS ts_lat,
    ts.lng AS ts_lng,
    ts.location_source AS ts_location_source,
    ts.location_accuracy AS ts_location_accuracy,
    ts.is_open AS ts_is_open,
    ts.opens_at AS ts_opens_at,
    ts.closes_at AS ts_closes_at,
    ts.observed_at AS ts_observed_at,
    ts.expires_at AS ts_expires_at,
    ts.updated_at AS ts_updated_at,
    os_today.opens_at AS os_opens_at,
    os_today.closes_at AS os_closes_at,
    os_today.location AS os_location,
    os_today.status AS os_status,
    os_today.updated_at AS os_updated_at,
    os_yest.opens_at AS ys_opens_at,
    os_yest.closes_at AS ys_closes_at,
    os_yest.location AS ys_location,
    os_yest.status AS ys_status,
    os_yest.updated_at AS ys_updated_at,
    sl.max_sched_updated_at AS any_os_updated_at
  FROM vendors v
  LEFT JOIN owner_profiles op ON op.truck_id = v.id
  LEFT JOIN truck_settings ts ON ts.truck_id = v.id
  LEFT JOIN owner_schedule os_today ON os_today.truck_id = v.id AND os_today.service_date = $1
  LEFT JOIN owner_schedule os_yest ON os_yest.truck_id = v.id AND os_yest.service_date = $2
  LEFT JOIN sched_latest sl ON sl.truck_id = v.id
`;

/**
 * Computes a deterministic version token over BOTH DB update timestamps AND the evaluated
 * clock-sensitive discovery projection (`localDate`, `open`, `schedule_status`, `location`,
 * `location_expired`, `location_is_live`, coordinates, verification, and descriptive fields).
 *
 * This guarantees that time-driven open/close transitions, Pacific midnight rollovers, and
 * `expires_at` live-location expirations advance `catalogVersion` and `ETag` immediately
 * even when zero database writes have occurred.
 */
export function computeEvaluatedCatalogVersion(listings, rows, localDate) {
  let maxEpochMs = 0;
  for (const row of rows) {
    const candidates = [
      epochMsOf(row.v_updated_at),
      epochMsOf(row.op_updated_at),
      epochMsOf(row.ts_updated_at),
      epochMsOf(row.os_updated_at),
      epochMsOf(row.ys_updated_at),
      epochMsOf(row.any_os_updated_at)
    ];
    for (const ms of candidates) {
      if (ms > maxEpochMs) maxEpochMs = ms;
    }
  }

  const hash = crypto.createHash('sha256');
  hash.update(`${localDate}|${maxEpochMs}|${listings.length}\n`);
  for (const item of listings) {
    hash.update(
      JSON.stringify([
        item.id,
        item.name,
        item.cuisine,
        item.blurb,
        item.accepting_bookings,
        item.open,
        item.is_confirmed_service,
        item.schedule_source,
        item.schedule_status,
        item.location,
        item.lat,
        item.lng,
        item.location_source,
        item.location_accuracy,
        item.location_is_live,
        item.location_expired,
        item.hours,
        item.verified,
        item.photo
      ]) + '\n'
    );
  }
  const digest = hash.digest('hex').slice(0, 20);
  return `v2:${digest}:${listings.length}`;
}

export function buildDiscoveryEtag(catalogVersion, variantKey = 'default') {
  const digest = crypto
    .createHash('sha256')
    .update(`${catalogVersion}|${variantKey}`)
    .digest('hex')
    .slice(0, 24);
  return `"e2:${digest}"`;
}

export async function loadDiscoveryCatalog(db, { now = new Date(), userCoords = null, vendorId = null } = {}) {
  const clock = getPacificClock(now);
  const params = [clock.pacificToday, clock.pacificYesterday];
  let sql = `${DISCOVERY_SQL_BASE} WHERE v.is_active = true`;
  if (vendorId) {
    params.push(vendorId);
    sql += ` AND v.id = $3`;
  }
  sql += ` ORDER BY v.sort_order ASC, v.id ASC`;

  const { rows } = await db.query(sql, params);
  const listings = rows.map(row => evaluateVendorDiscoveryRow(row, { clock, userCoords }));
  const catalogVersion = computeEvaluatedCatalogVersion(listings, rows, clock.pacificToday);

  return {
    listings,
    catalogVersion,
    localDate: clock.pacificToday,
    timezone: 'America/Los_Angeles',
    updatedAt: clock.now.toISOString()
  };
}

export function computeSectionCounts(listings) {
  return Object.fromEntries(
    CATALOG_SECTIONS.map(section => [
      section,
      listings.filter(item => !item.extra && (item.tags || [item.cuisine]).includes(section)).length
    ])
  );
}

export function applyDiscoveryCacheHeaders(
  res,
  catalogVersion,
  { freshRequested = false, personalized = false, variantKey = 'default' } = {}
) {
  if (typeof res?.setHeader !== 'function') return null;

  if (catalogVersion) {
    res.setHeader('X-Catalog-Version', catalogVersion);
  }

  // Personalized / user-coordinate-dependent responses MUST NEVER be publicly cached or shared via ETag.
  if (personalized) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    return null;
  }

  const etag = catalogVersion ? buildDiscoveryEtag(catalogVersion, variantKey) : null;
  if (etag) {
    res.setHeader('ETag', etag);
  }

  if (freshRequested) {
    res.setHeader('Cache-Control', 'no-store, max-age=0');
  } else {
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=5, stale-while-revalidate=10');
  }
  return etag;
}

export function foldSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}
