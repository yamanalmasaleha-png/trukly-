// Unified Account-Backed Customer Exploration, Visit Journal, Points/Badges,
// Weekly Challenges, Suggested Trails & Legacy Import Service (`lib/customer-exploration.js`)
//
// Core Product & Security Invariants:
//   1. Account-Backed Authority: Never trusts client-supplied user IDs, points, levels, or badge
//      states. Every personal-data query executes inside `withTransaction(dbAdapter, ...)` (which
//      verifies live session + 14+ age eligibility under row lock) AND sets transaction-local
//      `SELECT set_config('app.user_id', $1, true)` enforced by PostgreSQL `FORCE ROW LEVEL SECURITY`.
//   2. Canonical Calendar Timezone (`America/Los_Angeles`):
//      - Visits store UTC `visited_at` AND server-computed `visit_local_date` (`YYYY-MM-DD`).
//      - At most 1 active visit per `(user_id, recorded_vendor_id, visit_local_date)`. Repeat visits
//        on distinct calendar days are allowed and each counts `+25` points.
//      - Weekly challenges use Monday `00:00` through Sunday `23:59:59` in `America/Los_Angeles`,
//        computed via pure calendar-date arithmetic on `YYYY-MM-DD` (immune to DST 23h/25h shifts).
//   3. Canonical Taxonomy: Normalizes Sonoma County towns (excluding county-wide `'Sonoma County'`
//      placeholders from `Town Hopper`) and normalizes cuisine categories across all 59 primary +
//      neighborhood listings so spelling variants or raw tags never inflate `Flavor Hopper`.
//   4. Reversible Derived Progress: Points (`25`/visit, `10`/photo up to 12 photos), levels, badges,
//      weekly challenge progress, and saved-trail progress are computed dynamically from active rows
//      and have zero monetary or redeemable value.

import crypto from 'node:crypto';
import { withTransaction } from './db-tx.js';
import { getPacificToday, isValidCalendarDate } from './dates.js';
import { isVendorPubliclyDiscoverable } from './discovery.js';
import {
  MAX_ACTIVE_PHOTOS_PER_USER,
  PhotoStorageError,
  verifyAndNormalizeUploadedPhoto,
  writePhotoDerivativesAtomically,
  deletePhotoFilesSafely,
  readPhotoDerivativeSafely,
  scanPhotoStorageFiles,
  unlinkConfinedPhotoArtifact,
  resolvePhotoStorageRoot,
  resolvePhotoMinFreeBytes
} from './photo-storage.js';

export const EXPLORATION_TIMEZONE = 'America/Los_Angeles';
export const POINTS_PER_VISIT = 25;
export const POINTS_PER_PHOTO = 10;
export const MAX_VISIT_NOTE_LENGTH = 280;
export const MAX_PHOTO_CAPTION_LENGTH = 160;
export const MAX_SAVED_TRAILS_PER_USER = 50;
export const WEEKLY_CHALLENGE_TARGET = 2;

export const NON_MONETARY_DISCLOSURE =
  'Visits are self-reported (not GPS-, purchase-, or vendor-verified). Points and badges track personal food exploration only and have no monetary or redeemable value.';

export const REVERSIBLE_PROGRESS_DISCLOSURE =
  'Progress reflects your currently saved entries: removing a visit or photo recalculates points, level, badges, weekly challenge count, and saved-trail progress.';

export const TRAIL_DISCLAIMERS = Object.freeze([
  'Hours and mobile locations must be confirmed directly with each vendor before heading out.',
  'Suggested stops may not operate on the same day.',
  'This list is an idea from the directory, not a route-optimized navigation itinerary.'
]);

export const EXPLORATION_LEVELS = Object.freeze([
  Object.freeze({ level_id: 'level_1_flavor_scout', number: 1, min_points: 0, title: 'Flavor Scout' }),
  Object.freeze({ level_id: 'level_2_neighborhood_regular', number: 2, min_points: 50, title: 'Neighborhood Regular' }),
  Object.freeze({ level_id: 'level_3_local_insider', number: 3, min_points: 125, title: 'Local Insider' }),
  Object.freeze({ level_id: 'level_4_flavor_legend', number: 4, min_points: 250, title: 'Flavor Legend' })
]);

export const EXPLORATION_BADGE_DEFINITIONS = Object.freeze([
  Object.freeze({
    badge_id: 'first_bite',
    icon: '🍴',
    title: 'First Bite',
    rule: 'Log a visit to 1 local food business',
    metric: 'distinct_businesses',
    target: 1
  }),
  Object.freeze({
    badge_id: 'neighborhood_scout',
    icon: '🧭',
    title: 'Neighborhood Scout',
    rule: 'Visit 3 distinct businesses',
    metric: 'distinct_businesses',
    target: 3
  }),
  Object.freeze({
    badge_id: 'flavor_hopper',
    icon: '🌮',
    title: 'Flavor Hopper',
    rule: 'Explore 3 normalized cuisine categories',
    metric: 'distinct_cuisines',
    target: 3
  }),
  Object.freeze({
    badge_id: 'town_hopper',
    icon: '📍',
    title: 'Town Hopper',
    rule: 'Visit businesses in 2 Sonoma County towns',
    metric: 'distinct_towns',
    target: 2
  }),
  Object.freeze({
    badge_id: 'photo_keeper',
    icon: '📸',
    title: 'Photo Keeper',
    rule: 'Save 1 private dish or visit photo',
    metric: 'active_photos',
    target: 1
  })
]);

const CANONICAL_TOWNS_MAP = new Map([
  ['santa rosa', 'Santa Rosa'],
  ['petaluma', 'Petaluma'],
  ['petaluma area', 'Petaluma'],
  ['sebastopol', 'Sebastopol'],
  ['rohnert park', 'Rohnert Park'],
  ['sonoma', 'Sonoma'],
  ['glen ellen', 'Glen Ellen'],
  ['healdsburg', 'Healdsburg'],
  ['windsor', 'Windsor'],
  ['cotati', 'Cotati'],
  ['cloverdale', 'Cloverdale'],
  ['guerneville', 'Guerneville'],
  ['bodega bay', 'Bodega Bay'],
  ['forestville', 'Forestville'],
  ['kenwood', 'Kenwood'],
  ['geyserville', 'Geyserville'],
  ['penngrove', 'Penngrove'],
  ['occidental', 'Occidental'],
  ['graton', 'Graton']
]);

// Documented curated seed taxonomy exceptions (`migrations/014_unified_discovery_catalog.sql`
// & `015_sonoma_neighborhood_expansion.sql`):
//   - `heritage` (Smash Burgers), `andrew` (Smash Burgers), and `momolicious` (Nepalese Momo)
//     were seeded in `014` under `section = 'Sweets'`.
//   - `market-myriad` (Myriad Coffee stall) was seeded with `section = 'Sweets'` / `'Sweets'` tag.
//   - `fruta` (La Fruta Ice Cream), `rich` (Rich's Little Sicily Italian Ice), and `market-boba`
//     are verified dedicated frozen-treat / boba vendors.
//   - All newly `/admin`-onboarded businesses classify automatically via `listing_kind`, `cuisine`,
//     `canonical_name`, `blurb`, `special_note`, and `tags[]` without editing these seed sets.
export const SEED_014_TAXONOMY_CORRECTIONS = Object.freeze({
  primarySweetIds: Object.freeze(['fruta', 'rich', 'market-boba']),
  savoryDespiteSweetsSection: Object.freeze(['heritage', 'andrew', 'momolicious']),
  coffeeDespiteSweetsSection: Object.freeze(['market-myriad'])
});

const PRIMARY_SWEET_VENDOR_IDS = new Set(SEED_014_TAXONOMY_CORRECTIONS.primarySweetIds);
const SOURCED_SWEET_SPECIALTY_NOTES = new Map([
  [
    'coffee-crooks',
    'Coffee & café stop with published sweet drink specialties (crème brûlée latte and Mexican mocha).'
  ]
]);
const HISTORICAL_SAVORY_DESPITE_SWEETS_SECTION = new Set(
  SEED_014_TAXONOMY_CORRECTIONS.savoryDespiteSweetsSection
);
const HISTORICAL_COFFEE_DESPITE_SWEETS_SECTION = new Set(
  SEED_014_TAXONOMY_CORRECTIONS.coffeeDespiteSweetsSection
);

const SOURCED_DISH_NOTES = new Map([
  ['fruta', 'Ice cream & fruit-bowl truck — menu features Bionico fruit bowls and frozen treats.'],
  ['rich', 'Dedicated Italian ice & frozen-treat stop in Santa Rosa.'],
  ['market-boba', 'Dedicated boba & sweet-tea stall at the Petaluma East-Side Farmers’ Market.'],
  ['iniguez', 'Santa Rosa taco truck — known for street tacos on Mission Blvd.'],
  ['elenita', 'Roseland Mexican food truck on Sebastopol Rd.'],
  ['mitote', 'Rotating multi-truck food park with shared outdoor seating at 100 Sebastopol Rd.'],
  ['block', 'Indoor-outdoor rotating food-truck venue in Petaluma.'],
  ['ross', 'Scheduled downtown Santa Rosa weekday lunch pop-up lineup.'],
  ['farm-oakhill', 'Farm stand in a century-old Glen Ellen barn with seasonal produce and regional pantry goods.'],
  ['farm-barn', 'Petaluma farm stand stocking local eggs, honey, preserves, and farm goods.'],
  ['market-sr-community', 'Year-round Santa Rosa farmers market at the Veterans Memorial Building.'],
  ['market-sr-original', 'Certified Santa Rosa farmers market at the Luther Burbank Center.'],
  ['coffee-retrograde', 'Sebastopol roaster-café roasting coffee in-house since 2014.'],
  ['coffee-avid-petaluma', 'Walkable downtown Petaluma neighborhood café founded in 2011.']
]);

export class ExplorationDomainError extends Error {
  constructor(message, { status = 400, code = 'EXPLORATION_INVALID_INPUT', retryable = false } = {}) {
    super(message);
    this.name = 'ExplorationDomainError';
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

export function normalizeCanonicalTown(rawCity) {
  if (typeof rawCity !== 'string') return null;
  const cleaned = rawCity
    .replace(/[\x00-\x1f\x7f]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
  if (!cleaned) return null;
  const lower = cleaned.toLowerCase();
  // County-wide / mobile placeholders never count as a specific town for Town Hopper or Town filters
  if (
    lower === 'sonoma county' ||
    lower === 'sonoma county area' ||
    lower === 'sonoma county service area' ||
    lower === 'various' ||
    lower === 'mobile' ||
    lower === 'unknown'
  ) {
    return null;
  }
  if (CANONICAL_TOWNS_MAP.has(lower)) {
    return CANONICAL_TOWNS_MAP.get(lower);
  }
  // Allow newly onboarded legitimate Sonoma towns cleanly formatted
  if (/^[A-Za-z][A-Za-z .'-]{1,48}$/.test(cleaned) && !/county/i.test(cleaned)) {
    return cleaned;
  }
  return null;
}

export function classifyVendorTaxonomy(vendorRow) {
  const id = String(vendorRow?.id || '').trim();
  const rawCuisine = String(vendorRow?.effective_cuisine || vendorRow?.cuisine || '').trim();
  const rawSection = String(vendorRow?.section || '').trim();
  const listingKind = String(vendorRow?.listing_kind || '').trim().toLowerCase();
  const kindLabel = String(vendorRow?.kind_label || '').trim();
  const nameLower = String(vendorRow?.effective_name || vendorRow?.canonical_name || vendorRow?.name || '').toLowerCase();
  const blurbLower = String(vendorRow?.blurb || '').toLowerCase();
  const specialLower = String(vendorRow?.special_note || '').toLowerCase();
  const tags = Array.isArray(vendorRow?.tags) ? vendorRow.tags.map(t => String(t || '').trim()) : [];
  const cuisineLower = rawCuisine.toLowerCase();

  let cuisineKey = 'global';
  let cuisineLabel = 'Global & Savory';

  if (
    listingKind === 'farm_stand' ||
    kindLabel === 'Farm Stands' ||
    cuisineLower.includes('farm') ||
    cuisineLower.includes('farmers market') ||
    (listingKind === 'venue' && tags.includes('Markets'))
  ) {
    cuisineKey = 'farm_market';
    cuisineLabel = 'Farms & Markets';
  } else if (
    HISTORICAL_COFFEE_DESPITE_SWEETS_SECTION.has(id) ||
    listingKind === 'cafe' ||
    kindLabel === 'Coffee' ||
    cuisineLower.includes('coffee') ||
    cuisineLower.includes('café') ||
    cuisineLower.includes('cafe')
  ) {
    cuisineKey = 'coffee';
    cuisineLabel = 'Coffee & Café';
  } else if (HISTORICAL_SAVORY_DESPITE_SWEETS_SECTION.has(id)) {
    cuisineKey = 'global';
    cuisineLabel = 'Global & Savory';
  } else if (
    PRIMARY_SWEET_VENDOR_IDS.has(id) ||
    rawSection === 'Sweets' ||
    cuisineLower === 'sweets' ||
    /\b(ice cream|gelato|dessert|bakery|pastry|donut|doughnut|italian ice|boba|sweet)\b/i.test(
      `${rawCuisine} ${nameLower}`
    )
  ) {
    cuisineKey = 'sweets';
    cuisineLabel = 'Sweets & Desserts';
  } else if (cuisineLower.includes('mexican') || cuisineLower.includes('taco') || rawSection === 'Mexican') {
    cuisineKey = 'mexican';
    cuisineLabel = 'Mexican';
  } else if (
    cuisineLower.includes('burger') ||
    cuisineLower.includes('sandwich') ||
    rawSection === 'Burgers'
  ) {
    cuisineKey = 'burgers';
    cuisineLabel = 'Burgers & Sandwiches';
  } else if (
    cuisineLower.includes('hot dog') ||
    cuisineLower.includes('sausage') ||
    rawSection === 'Hot Dogs'
  ) {
    cuisineKey = 'hot_dogs';
    cuisineLabel = 'Hot Dogs & Sausages';
  } else {
    cuisineKey = 'global';
    cuisineLabel = 'Global & Savory';
  }

  // Sweet trail tiering:
  //   1 = Dedicated primary sweet/frozen-treat/dessert stop
  //   2 = Café or food stop with documented sweet specialty in catalog notes
  //   3 = Savory stop whose catalog `tags[]` explicitly include 'Sweets' (secondary only, always explained)
  //   0 = Not a sweet match
  let sweetTier = 0;
  if (cuisineKey === 'sweets') {
    sweetTier = 1;
  } else if (
    SOURCED_SWEET_SPECIALTY_NOTES.has(id) ||
    /\b(crème brûlée|creme brulee|mocha|pastry|sweet|dessert|horchata|churro)\b/i.test(`${specialLower} ${blurbLower}`)
  ) {
    sweetTier = 2;
  } else if (tags.includes('Sweets') && !HISTORICAL_SAVORY_DESPITE_SWEETS_SECTION.has(id) && !HISTORICAL_COFFEE_DESPITE_SWEETS_SECTION.has(id)) {
    sweetTier = 3;
  }

  const isFarmOrMarket =
    listingKind === 'farm_stand' ||
    listingKind === 'market_stall' ||
    kindLabel === 'Farm Stands' ||
    kindLabel === 'Markets' ||
    tags.includes('Markets') ||
    tags.includes('Farm Stands');

  // Deduplicate multiple stalls sharing the exact same farmers market, food park, or street address
  const rawLoc = String(vendorRow?.curated_location || vendorRow?.location || '').trim().toLowerCase();
  let venueGroupKey = `vendor:${id}`;
  if (rawLoc.includes('320 n mcdowell') || rawLoc.includes('east-side farmers')) {
    venueGroupKey = 'venue:petaluma-eastside-market';
  } else if (rawLoc.includes('100 sebastopol rd') || rawLoc.includes('mitote food park')) {
    venueGroupKey = 'venue:mitote-food-park';
  } else if (rawLoc.includes('1351 maple ave')) {
    venueGroupKey = 'venue:sr-community-market';
  } else if (rawLoc.includes('50 mark west springs')) {
    venueGroupKey = 'venue:sr-original-market';
  } else {
    const addrMatch = rawLoc.match(/\b(\d{2,5}\s+[a-z0-9 .'-]{3,36}?)(?:,|\s+·|\s+-|$)/);
    if (addrMatch && addrMatch[1]) {
      venueGroupKey = `addr:${addrMatch[1].trim().replace(/\s+/g, ' ')}`;
    }
  }

  return {
    cuisineKey,
    cuisineLabel,
    normalizedTown: normalizeCanonicalTown(vendorRow?.city),
    sweetTier,
    isFarmOrMarket,
    venueGroupKey
  };
}

export function getMondayWeekBounds(localIsoDate) {
  if (!isValidCalendarDate(localIsoDate)) {
    throw new ExplorationDomainError('Invalid local calendar date.', {
      status: 500,
      code: 'INVALID_CALENDAR_DATE'
    });
  }
  const [y, m, d] = localIsoDate.split('-').map(Number);
  const utcMid = new Date(Date.UTC(y, m - 1, d));
  const dow = utcMid.getUTCDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const deltaToMonday = (dow + 6) % 7;

  const mondayUtc = new Date(Date.UTC(y, m - 1, d - deltaToMonday));
  const sundayUtc = new Date(Date.UTC(y, m - 1, d - deltaToMonday + 6));

  const fmt = dt =>
    `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;

  return {
    week_start_date: fmt(mondayUtc),
    week_end_date: fmt(sundayUtc)
  };
}

function startOfPacificDateIso(localIsoDate) {
  // Resolve exact UTC instant corresponding to 00:00:00 in America/Los_Angeles (07:00Z PDT or 08:00Z PST)
  for (const utcHour of ['07', '08', '09']) {
    const candidateIso = `${localIsoDate}T${utcHour}:00:00.000Z`;
    const candidateDate = new Date(candidateIso);
    if (getPacificToday(candidateDate) === localIsoDate) {
      const hourFmt = new Intl.DateTimeFormat('en-US', {
        timeZone: EXPLORATION_TIMEZONE,
        hour: '2-digit',
        hourCycle: 'h23'
      }).format(candidateDate);
      if (hourFmt === '00') {
        return candidateIso;
      }
    }
  }
  return `${localIsoDate}T08:00:00.000Z`;
}

export function mapHistoricalTimestampToPacificDate(rawTimestamp, now = new Date()) {
  if (typeof rawTimestamp !== 'string' || !rawTimestamp.trim()) {
    return { ok: false, error: 'Missing visit timestamp.' };
  }
  const s = rawTimestamp.trim();
  const todayPacific = getPacificToday(now);

  // Direct YYYY-MM-DD calendar date (anchored to 00:00:00 America/Los_Angeles so a date-only
  // legacy import never appears newer than a trail saved later on that same calendar day)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    if (!isValidCalendarDate(s)) {
      return { ok: false, error: 'Invalid calendar date.' };
    }
    if (s < '2020-01-01' || s > todayPacific) {
      return { ok: false, error: `Visit date ${s} is outside valid historical range.` };
    }
    return {
      ok: true,
      visitLocalDate: s,
      visitedAtIso: startOfPacificDateIso(s)
    };
  }

  const parsed = new Date(s);
  if (Number.isNaN(parsed.getTime())) {
    return { ok: false, error: 'Unparseable timestamp.' };
  }
  const maxAllowedFutureMs = now.getTime() + 24 * 60 * 60 * 1000; // tolerate small device clock skew up to 24h
  if (parsed.getTime() > maxAllowedFutureMs) {
    return { ok: false, error: 'Timestamp is in the future.' };
  }
  if (parsed.getTime() < Date.UTC(2020, 0, 1)) {
    return { ok: false, error: 'Timestamp predates BiteShark history.' };
  }
  const clampedDate = parsed.getTime() > now.getTime() ? now : parsed;
  const localDate = getPacificToday(clampedDate);
  return {
    ok: true,
    visitLocalDate: localDate,
    visitedAtIso: clampedDate.toISOString()
  };
}

function sanitizeNoteText(raw, maxLen) {
  if (raw === null || raw === undefined) return '';
  if (typeof raw !== 'string') {
    throw new ExplorationDomainError('Note or caption must be text.', {
      status: 400,
      code: 'INVALID_TEXT_FIELD'
    });
  }
  const cleaned = raw.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, ' ').trim();
  if (cleaned.length > maxLen) {
    throw new ExplorationDomainError(`Text must be ${maxLen} characters or fewer.`, {
      status: 400,
      code: 'TEXT_TOO_LONG'
    });
  }
  return cleaned;
}

function sanitizeOptionalIdempotencyKey(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw !== 'string') {
    throw new ExplorationDomainError('Invalid idempotency_key.', {
      status: 400,
      code: 'INVALID_IDEMPOTENCY_KEY'
    });
  }
  const trimmed = raw.trim();
  if (trimmed.length < 8 || trimmed.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(trimmed)) {
    throw new ExplorationDomainError('idempotency_key must be 8–128 safe ASCII characters.', {
      status: 400,
      code: 'INVALID_IDEMPOTENCY_KEY'
    });
  }
  return trimmed;
}

function sanitizeVendorIdInput(raw, { allowEmpty = false } = {}) {
  if (raw === null || raw === undefined || String(raw).trim() === '') {
    if (allowEmpty) return null;
    throw new ExplorationDomainError('Select a listed local food business.', {
      status: 400,
      code: 'INVALID_VENDOR_ID'
    });
  }
  const slug = String(raw).trim();
  if (!/^[a-z0-9][a-z0-9_-]{0,79}$/i.test(slug)) {
    throw new ExplorationDomainError('Invalid business identifier.', {
      status: 400,
      code: 'INVALID_VENDOR_ID'
    });
  }
  return slug.toLowerCase();
}

function generatePrefixedId(prefix) {
  return `${prefix}_${crypto.randomBytes(16).toString('hex')}`;
}

async function setUserRlsContextInTx(tx, userId) {
  if (!userId || typeof userId !== 'string') {
    throw new ExplorationDomainError('Sign in is required.', {
      status: 401,
      code: 'AUTH_REQUIRED'
    });
  }
  await tx.query("SELECT set_config('app.photo_maintenance', '', true)");
  await tx.query("SELECT set_config('app.user_id', $1, true)", [userId]);
}

async function loadVendorForUserActionInTx(tx, vendorSlug, nowMs = Date.now()) {
  const { rows } = await tx.query(
    `SELECT
       v.id,
       v.canonical_name,
       v.section,
       v.cuisine,
       v.city,
       v.listing_kind,
       v.kind_label,
       v.blurb,
       v.special_note,
       v.tags,
       v.curated_location,
       v.is_active,
       v.hidden_from_discovery,
       v.restriction_authority,
       v.temp_restriction_expires_at,
       op.display_name AS owner_display_name,
       op.cuisine AS owner_cuisine
     FROM vendors v
     LEFT JOIN owner_profiles op ON op.truck_id = v.id
     WHERE v.id = $1
     LIMIT 1`,
    [vendorSlug]
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  if (!isVendorPubliclyDiscoverable(row, nowMs)) {
    return null;
  }
  const effectiveName = String(row.owner_display_name || row.canonical_name || row.id).trim();
  const effectiveCuisine = String(row.owner_cuisine || row.cuisine || 'Global').trim();
  const taxonomy = classifyVendorTaxonomy({
    ...row,
    effective_name: effectiveName,
    effective_cuisine: effectiveCuisine
  });
  return {
    id: row.id,
    businessName: effectiveName.slice(0, 140),
    effectiveCuisine,
    city: row.city || 'Sonoma County',
    taxonomy
  };
}

function computeLevelProgress(totalPoints) {
  let idx = 0;
  for (let i = 0; i < EXPLORATION_LEVELS.length; i++) {
    if (totalPoints >= EXPLORATION_LEVELS[i].min_points) idx = i;
  }
  const cur = EXPLORATION_LEVELS[idx];
  const next = EXPLORATION_LEVELS[idx + 1] || null;
  const span = next ? Math.max(1, next.min_points - cur.min_points) : 1;
  const progressPct = next
    ? Math.max(0, Math.min(100, Math.round(((totalPoints - cur.min_points) / span) * 100)))
    : 100;

  return {
    current_level: {
      level_id: cur.level_id,
      number: cur.number,
      title: cur.title,
      min_points: cur.min_points
    },
    next_level: next
      ? {
          level_id: next.level_id,
          number: next.number,
          title: next.title,
          min_points: next.min_points,
          points_needed: Math.max(0, next.min_points - totalPoints)
        }
      : null,
    progress_percent: progressPct
  };
}

export async function computeExplorationSummaryInTx(
  tx,
  {
    userId,
    now = new Date(),
    showAchievements = true,
    showWeeklyChallenge = true,
    featureStates = null
  }
) {
  await setUserRlsContextInTx(tx, userId);
  const todayLocalDate = getPacificToday(now);
  const weekBounds = getMondayWeekBounds(todayLocalDate);

  const visitsAggRes = await tx.query(
    `SELECT
       COUNT(*)::int AS total_visits,
       COUNT(DISTINCT recorded_vendor_id)::int AS distinct_businesses,
       COUNT(DISTINCT normalized_cuisine)::int AS distinct_cuisines,
       COUNT(DISTINCT normalized_town) FILTER (WHERE normalized_town IS NOT NULL)::int AS distinct_towns
     FROM customer_visits
     WHERE user_id = $1 AND deleted_at IS NULL`,
    [userId]
  );
  const photosCountRes = await tx.query(
    `SELECT COUNT(*)::int AS active_photos
     FROM customer_photos
     WHERE user_id = $1 AND deleted_at IS NULL`,
    [userId]
  );
  const trailsCountRes = await tx.query(
    `SELECT COUNT(*)::int AS saved_trails
     FROM customer_saved_trails
     WHERE user_id = $1 AND deleted_at IS NULL`,
    [userId]
  );
  const weekVisitsRes = await tx.query(
    `SELECT
       cv.id,
       cv.recorded_vendor_id,
       cv.vendor_name_snapshot,
       to_char(cv.visit_local_date, 'YYYY-MM-DD') AS visit_local_date,
       v.id AS live_vendor_id,
       v.canonical_name,
       v.is_active,
       v.hidden_from_discovery,
       v.restriction_authority,
       v.temp_restriction_expires_at,
       op.display_name AS owner_display_name
     FROM customer_visits cv
     LEFT JOIN vendors v ON v.id = cv.vendor_id
     LEFT JOIN owner_profiles op ON op.truck_id = v.id
     WHERE cv.user_id = $1
       AND cv.deleted_at IS NULL
       AND cv.visit_local_date >= $2::date
       AND cv.visit_local_date <= $3::date
     ORDER BY cv.visit_local_date DESC, cv.created_at DESC`,
    [userId, weekBounds.week_start_date, weekBounds.week_end_date]
  );

  const vAgg = visitsAggRes.rows[0] || {
    total_visits: 0,
    distinct_businesses: 0,
    distinct_cuisines: 0,
    distinct_towns: 0
  };
  const activePhotos = Math.min(
    MAX_ACTIVE_PHOTOS_PER_USER,
    Number(photosCountRes.rows[0]?.active_photos || 0)
  );
  const savedTrails = Number(trailsCountRes.rows[0]?.saved_trails || 0);
  const totalVisits = Number(vAgg.total_visits || 0);
  const distinctBusinesses = Number(vAgg.distinct_businesses || 0);
  const distinctCuisines = Number(vAgg.distinct_cuisines || 0);
  const distinctTowns = Number(vAgg.distinct_towns || 0);

  const visitPoints = totalVisits * POINTS_PER_VISIT;
  const photoPoints = activePhotos * POINTS_PER_PHOTO;
  const totalPoints = visitPoints + photoPoints;

  const metricsMap = {
    distinct_businesses: distinctBusinesses,
    distinct_cuisines: distinctCuisines,
    distinct_towns: distinctTowns,
    active_photos: activePhotos
  };

  const badges = EXPLORATION_BADGE_DEFINITIONS.map(def => {
    const currentVal = Number(metricsMap[def.metric] || 0);
    return {
      badge_id: def.badge_id,
      icon: def.icon,
      title: def.title,
      rule: def.rule,
      metric: def.metric,
      current: currentVal,
      target: def.target,
      earned: currentVal >= def.target
    };
  });

  const levelInfo = computeLevelProgress(totalPoints);
  const nowMs = now.getTime();
  const weekQualifyingVisits = weekVisitsRes.rows.map(r => {
    const discoverable = Boolean(r.live_vendor_id && isVendorPubliclyDiscoverable(r, nowMs));
    return {
      visit_id: r.id,
      vendor_id: r.recorded_vendor_id,
      business_name: discoverable
        ? String(r.owner_display_name || r.canonical_name || r.vendor_name_snapshot)
        : r.vendor_name_snapshot,
      business_available: discoverable,
      visit_local_date: r.visit_local_date
    };
  });

  return {
    user_id: userId,
    calendar_timezone: EXPLORATION_TIMEZONE,
    today_local_date: todayLocalDate,
    disclosures: {
      non_monetary: NON_MONETARY_DISCLOSURE,
      reversible_progress: REVERSIBLE_PROGRESS_DISCLOSURE
    },
    counts: {
      total_visits: totalVisits,
      distinct_businesses: distinctBusinesses,
      distinct_cuisines: distinctCuisines,
      distinct_towns: distinctTowns,
      active_photos: activePhotos,
      photo_limit: MAX_ACTIVE_PHOTOS_PER_USER,
      saved_trails: savedTrails
    },
    achievements_hidden: !showAchievements,
    achievements: showAchievements
      ? {
          total_points: totalPoints,
          visit_points: visitPoints,
          photo_points: photoPoints,
          points_per_visit: POINTS_PER_VISIT,
          points_per_photo: POINTS_PER_PHOTO,
          ...levelInfo,
          levels: EXPLORATION_LEVELS,
          earned_badge_count: badges.filter(b => b.earned).length,
          total_badge_count: badges.length,
          badges
        }
      : null,
    weekly_challenge_hidden: !showWeeklyChallenge,
    weekly_challenge: showWeeklyChallenge
      ? {
          challenge_id: 'two_stop_taste_trail',
          title: 'Two-stop taste trail',
          rule_summary:
            'Log 2 self-reported visits during the Monday–Sunday week (America/Los_Angeles). Counts at most 1 visit per business per calendar day; visiting the same business on 2 different days counts.',
          calendar_timezone: EXPLORATION_TIMEZONE,
          week_start_date: weekBounds.week_start_date,
          week_end_date: weekBounds.week_end_date,
          target_stops: WEEKLY_CHALLENGE_TARGET,
          progress_stops: Math.min(WEEKLY_CHALLENGE_TARGET, weekQualifyingVisits.length),
          raw_qualifying_visits: weekQualifyingVisits.length,
          completed: weekQualifyingVisits.length >= WEEKLY_CHALLENGE_TARGET,
          qualifying_visits: weekQualifyingVisits.slice(0, 10)
        }
      : null,
    ...(featureStates ? { feature_states: featureStates } : {})
  };
}

export async function getExplorationSummary(dbAdapter, opts) {
  return withTransaction(dbAdapter, tx => computeExplorationSummaryInTx(tx, opts));
}

function formatVisitDto(row, nowMs = Date.now()) {
  const discoverable = Boolean(row.live_vendor_id && isVendorPubliclyDiscoverable(row, nowMs));
  return {
    visit_id: row.id,
    vendor_id: row.recorded_vendor_id,
    business_name: discoverable
      ? String(row.owner_display_name || row.canonical_name || row.vendor_name_snapshot)
      : row.vendor_name_snapshot,
    business_status: discoverable ? 'active' : 'unavailable',
    can_open_detail: discoverable,
    normalized_cuisine: row.normalized_cuisine,
    normalized_town: row.normalized_town || null,
    display_town: row.normalized_town || (discoverable ? row.live_city : null) || 'Sonoma County',
    private_note: row.private_note || '',
    visited_at: row.visited_at instanceof Date ? row.visited_at.toISOString() : String(row.visited_at),
    visit_local_date: row.visit_local_date_iso,
    calendar_timezone: row.calendar_tz,
    entry_source: row.entry_source,
    self_reported: true
  };
}

export async function listUserVisits(
  dbAdapter,
  { userId, limit = 20, offset = 0, vendorId = null, now = new Date() }
) {
  const safeLimit = Math.max(1, Math.min(50, Number.parseInt(String(limit || 20), 10) || 20));
  const safeOffset = Math.max(0, Math.min(5000, Number.parseInt(String(offset || 0), 10) || 0));
  const filterVendor = vendorId ? sanitizeVendorIdInput(vendorId, { allowEmpty: true }) : null;

  return withTransaction(dbAdapter, async tx => {
    await setUserRlsContextInTx(tx, userId);

    const params = [userId];
    let vendorFilterSql = '';
    if (filterVendor) {
      params.push(filterVendor);
      vendorFilterSql = `AND cv.recorded_vendor_id = $${params.length}`;
    }

    const countRes = await tx.query(
      `SELECT COUNT(*)::int AS total
       FROM customer_visits cv
       WHERE cv.user_id = $1 AND cv.deleted_at IS NULL ${vendorFilterSql}`,
      params
    );
    const total = Number(countRes.rows[0]?.total || 0);

    params.push(safeLimit, safeOffset);
    const { rows } = await tx.query(
      `SELECT
         cv.id,
         cv.recorded_vendor_id,
         cv.vendor_name_snapshot,
         cv.normalized_cuisine,
         cv.normalized_town,
         cv.private_note,
         cv.visited_at,
         to_char(cv.visit_local_date, 'YYYY-MM-DD') AS visit_local_date_iso,
         cv.calendar_tz,
         cv.entry_source,
         v.id AS live_vendor_id,
         v.canonical_name,
         v.city AS live_city,
         v.is_active,
         v.hidden_from_discovery,
         v.restriction_authority,
         v.temp_restriction_expires_at,
         op.display_name AS owner_display_name
       FROM customer_visits cv
       LEFT JOIN vendors v ON v.id = cv.vendor_id
       LEFT JOIN owner_profiles op ON op.truck_id = v.id
       WHERE cv.user_id = $1
         AND cv.deleted_at IS NULL
         ${vendorFilterSql}
       ORDER BY cv.visit_local_date DESC, cv.created_at DESC, cv.id DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const nowMs = now.getTime();
    const visits = rows.map(r => formatVisitDto(r, nowMs));

    return {
      visits,
      pagination: {
        total,
        limit: safeLimit,
        offset: safeOffset,
        has_more: safeOffset + visits.length < total,
        next_offset: safeOffset + visits.length < total ? safeOffset + visits.length : null
      }
    };
  });
}

const VALID_VISIT_SOURCES = new Set(['manual', 'detail_modal', 'saved_trail', 'legacy_import']);

export async function logUserVisit(
  dbAdapter,
  {
    userId,
    vendorId,
    privateNote = '',
    entrySource = 'manual',
    idempotencyKey = null,
    now = new Date(),
    showAchievements = true,
    showWeeklyChallenge = true,
    featureStates = null
  }
) {
  const cleanVendorSlug = sanitizeVendorIdInput(vendorId);
  const cleanNote = sanitizeNoteText(privateNote, MAX_VISIT_NOTE_LENGTH);
  const cleanIdemp = sanitizeOptionalIdempotencyKey(idempotencyKey);
  const safeSource = VALID_VISIT_SOURCES.has(entrySource) ? entrySource : 'manual';
  const todayLocalDate = getPacificToday(now);

  return withTransaction(dbAdapter, async tx => {
    await setUserRlsContextInTx(tx, userId);
    await tx.query("SELECT pg_advisory_xact_lock(hashtext('bs_cust_visits:' || $1))", [userId]);

    // 1. Check idempotency key first
    if (cleanIdemp) {
      const idempRes = await tx.query(
        `SELECT
           cv.id,
           cv.recorded_vendor_id,
           cv.vendor_name_snapshot,
           cv.normalized_cuisine,
           cv.normalized_town,
           cv.private_note,
           cv.visited_at,
           to_char(cv.visit_local_date, 'YYYY-MM-DD') AS visit_local_date_iso,
           cv.calendar_tz,
           cv.entry_source,
           cv.deleted_at,
           v.id AS live_vendor_id,
           v.canonical_name,
           v.city AS live_city,
           v.is_active,
           v.hidden_from_discovery,
           v.restriction_authority,
           v.temp_restriction_expires_at,
           op.display_name AS owner_display_name
         FROM customer_visits cv
         LEFT JOIN vendors v ON v.id = cv.vendor_id
         LEFT JOIN owner_profiles op ON op.truck_id = v.id
         WHERE cv.user_id = $1 AND cv.idempotency_key = $2
         LIMIT 1`,
        [userId, cleanIdemp]
      );
      if (idempRes.rows.length > 0 && !idempRes.rows[0].deleted_at) {
        const exploration = await computeExplorationSummaryInTx(tx, {
          userId,
          now,
          showAchievements,
          showWeeklyChallenge,
          featureStates
        });
        return {
          ok: true,
          created: false,
          idempotent_replay: true,
          already_logged_today: false,
          code: 'VISIT_IDEMPOTENT_REPLAY',
          visit: formatVisitDto(idempRes.rows[0], now.getTime()),
          exploration
        };
      }
      if (idempRes.rows.length > 0 && idempRes.rows[0].deleted_at) {
        await tx.query(
          `UPDATE customer_visits SET idempotency_key = NULL WHERE id = $1 AND user_id = $2 AND deleted_at IS NOT NULL`,
          [idempRes.rows[0].id, userId]
        );
      }
    }

    // 2. Verify target vendor is active and publicly discoverable
    const vendor = await loadVendorForUserActionInTx(tx, cleanVendorSlug, now.getTime());
    if (!vendor) {
      throw new ExplorationDomainError('That business could not be found in the active directory.', {
        status: 404,
        code: 'VENDOR_NOT_FOUND'
      });
    }

    // 3. Check same-day existing active visit (`(user_id, recorded_vendor_id, visit_local_date)`)
    const existingSameDay = await tx.query(
      `SELECT
         cv.id,
         cv.recorded_vendor_id,
         cv.vendor_name_snapshot,
         cv.normalized_cuisine,
         cv.normalized_town,
         cv.private_note,
         cv.visited_at,
         to_char(cv.visit_local_date, 'YYYY-MM-DD') AS visit_local_date_iso,
         cv.calendar_tz,
         cv.entry_source,
         v.id AS live_vendor_id,
         v.canonical_name,
         v.city AS live_city,
         v.is_active,
         v.hidden_from_discovery,
         v.restriction_authority,
         v.temp_restriction_expires_at,
         op.display_name AS owner_display_name
       FROM customer_visits cv
       LEFT JOIN vendors v ON v.id = cv.vendor_id
       LEFT JOIN owner_profiles op ON op.truck_id = v.id
       WHERE cv.user_id = $1
         AND cv.recorded_vendor_id = $2
         AND cv.visit_local_date = $3::date
         AND cv.deleted_at IS NULL
       LIMIT 1`,
      [userId, vendor.id, todayLocalDate]
    );

    if (existingSameDay.rows.length > 0) {
      const exploration = await computeExplorationSummaryInTx(tx, {
        userId,
        now,
        showAchievements,
        showWeeklyChallenge,
        featureStates
      });
      return {
        ok: true,
        created: false,
        idempotent_replay: false,
        already_logged_today: true,
        code: 'VISIT_ALREADY_LOGGED_TODAY',
        message: `Already logged today (${todayLocalDate}) for ${vendor.businessName}. Repeat visits can be logged on another calendar day.`,
        visit: formatVisitDto(existingSameDay.rows[0], now.getTime()),
        exploration
      };
    }

    // 4. Insert new counted visit
    const visitId = generatePrefixedId('vst');
    const insRes = await tx.query(
      `INSERT INTO customer_visits (
         id, user_id, vendor_id, recorded_vendor_id, vendor_name_snapshot,
         normalized_cuisine, normalized_town, private_note,
         visited_at, visit_local_date, calendar_tz, entry_source, idempotency_key
       ) VALUES (
         $1, $2, $3, $3, $4,
         $5, $6, $7,
         $8::timestamptz, $9::date, 'America/Los_Angeles', $10, $11
       )
       RETURNING
         id,
         recorded_vendor_id,
         vendor_name_snapshot,
         normalized_cuisine,
         normalized_town,
         private_note,
         visited_at,
         to_char(visit_local_date, 'YYYY-MM-DD') AS visit_local_date_iso,
         calendar_tz,
         entry_source`,
      [
        visitId,
        userId,
        vendor.id,
        vendor.businessName,
        vendor.taxonomy.cuisineKey,
        vendor.taxonomy.normalizedTown,
        cleanNote,
        now.toISOString(),
        todayLocalDate,
        safeSource,
        cleanIdemp
      ]
    );

    const row = {
      ...insRes.rows[0],
      live_vendor_id: vendor.id,
      canonical_name: vendor.businessName,
      live_city: vendor.city,
      is_active: true,
      hidden_from_discovery: false
    };

    const exploration = await computeExplorationSummaryInTx(tx, {
      userId,
      now,
      showAchievements,
      showWeeklyChallenge,
      featureStates
    });

    return {
      ok: true,
      created: true,
      idempotent_replay: false,
      already_logged_today: false,
      code: 'VISIT_LOGGED',
      message: `Logged today’s self-reported visit to ${vendor.businessName}.`,
      visit: formatVisitDto(row, now.getTime()),
      exploration
    };
  });
}

export async function deleteUserVisit(
  dbAdapter,
  {
    userId,
    visitId,
    now = new Date(),
    showAchievements = true,
    showWeeklyChallenge = true,
    featureStates = null
  }
) {
  const cleanId = String(visitId || '').trim();
  if (!/^vst_[a-f0-9]{24,40}$/.test(cleanId)) {
    throw new ExplorationDomainError('Invalid visit identifier.', {
      status: 400,
      code: 'INVALID_VISIT_ID'
    });
  }

  return withTransaction(dbAdapter, async tx => {
    await setUserRlsContextInTx(tx, userId);
    await tx.query("SELECT pg_advisory_xact_lock(hashtext('bs_cust_visits:' || $1))", [userId]);

    const upd = await tx.query(
      `UPDATE customer_visits
       SET deleted_at = now(), idempotency_key = NULL
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
       RETURNING id, vendor_name_snapshot, to_char(visit_local_date, 'YYYY-MM-DD') AS visit_local_date`,
      [cleanId, userId]
    );

    if (upd.rows.length === 0) {
      throw new ExplorationDomainError('Visit entry was not found or has already been removed.', {
        status: 404,
        code: 'VISIT_NOT_FOUND'
      });
    }

    const exploration = await computeExplorationSummaryInTx(tx, {
      userId,
      now,
      showAchievements,
      showWeeklyChallenge,
      featureStates
    });

    return {
      ok: true,
      deleted_visit_id: upd.rows[0].id,
      business_name: upd.rows[0].vendor_name_snapshot,
      visit_local_date: upd.rows[0].visit_local_date,
      exploration
    };
  });
}

// ============================================================================
// Private Account-Backed Photos
// ============================================================================
function formatPhotoDto(row, nowMs = Date.now()) {
  const hasVendor = Boolean(row.recorded_vendor_id);
  const discoverable = Boolean(hasVendor && row.live_vendor_id && isVendorPubliclyDiscoverable(row, nowMs));
  return {
    photo_id: row.id,
    vendor_id: row.recorded_vendor_id || null,
    business_name: hasVendor
      ? discoverable
        ? String(row.owner_display_name || row.canonical_name || row.vendor_name_snapshot || row.recorded_vendor_id)
        : row.vendor_name_snapshot || 'Unavailable listing'
      : null,
    business_status: hasVendor ? (discoverable ? 'active' : 'unavailable') : 'unassigned',
    can_open_detail: discoverable,
    caption: row.caption || '',
    mime_type: row.mime_type,
    byte_size: Number(row.byte_size),
    width: Number(row.width),
    height: Number(row.height),
    taken_local_date: row.taken_local_date_iso,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    thumb_url: `/api/me/photos/file?id=${encodeURIComponent(row.id)}&variant=thumb`,
    main_url: `/api/me/photos/file?id=${encodeURIComponent(row.id)}&variant=main`,
    private_only: true
  };
}

export async function listUserPhotos(
  dbAdapter,
  { userId, limit = 20, offset = 0, vendorId = null, now = new Date() }
) {
  const safeLimit = Math.max(1, Math.min(24, Number.parseInt(String(limit || 20), 10) || 20));
  const safeOffset = Math.max(0, Math.min(200, Number.parseInt(String(offset || 0), 10) || 0));
  const filterVendor = vendorId ? sanitizeVendorIdInput(vendorId, { allowEmpty: true }) : null;

  return withTransaction(dbAdapter, async tx => {
    await setUserRlsContextInTx(tx, userId);

    const params = [userId];
    let vendorSql = '';
    if (filterVendor) {
      params.push(filterVendor);
      vendorSql = `AND cp.recorded_vendor_id = $${params.length}`;
    }

    const cntRes = await tx.query(
      `SELECT COUNT(*)::int AS total
       FROM customer_photos cp
       WHERE cp.user_id = $1 AND cp.deleted_at IS NULL ${vendorSql}`,
      params
    );
    const total = Number(cntRes.rows[0]?.total || 0);

    params.push(safeLimit, safeOffset);
    const { rows } = await tx.query(
      `SELECT
         cp.id,
         cp.recorded_vendor_id,
         cp.vendor_name_snapshot,
         cp.caption,
         cp.mime_type,
         cp.byte_size,
         cp.width,
         cp.height,
         to_char(cp.taken_local_date, 'YYYY-MM-DD') AS taken_local_date_iso,
         cp.created_at,
         v.id AS live_vendor_id,
         v.canonical_name,
         v.is_active,
         v.hidden_from_discovery,
         v.restriction_authority,
         v.temp_restriction_expires_at,
         op.display_name AS owner_display_name
       FROM customer_photos cp
       LEFT JOIN vendors v ON v.id = cp.vendor_id
       LEFT JOIN owner_profiles op ON op.truck_id = v.id
       WHERE cp.user_id = $1
         AND cp.deleted_at IS NULL
         ${vendorSql}
       ORDER BY cp.created_at DESC, cp.id DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const nowMs = now.getTime();
    const photos = rows.map(r => formatPhotoDto(r, nowMs));

    return {
      photos,
      limit_per_account: MAX_ACTIVE_PHOTOS_PER_USER,
      pagination: {
        total,
        limit: safeLimit,
        offset: safeOffset,
        has_more: safeOffset + photos.length < total
      }
    };
  });
}

const VALID_PHOTO_SOURCES = new Set(['manual', 'detail_modal', 'legacy_import']);

export async function createUserPhoto(
  dbAdapter,
  {
    userId,
    vendorId = null,
    caption = '',
    entrySource = 'manual',
    idempotencyKey = null,
    takenAtIso = null,
    dataBase64,
    declaredMimeType = '',
    storageRoot = resolvePhotoStorageRoot(),
    minFreeBytes = resolvePhotoMinFreeBytes(),
    now = new Date(),
    showAchievements = true,
    showWeeklyChallenge = true,
    featureStates = null
  }
) {
  const cleanVendorSlug = sanitizeVendorIdInput(vendorId, { allowEmpty: true });
  const cleanCaption = sanitizeNoteText(caption, MAX_PHOTO_CAPTION_LENGTH);
  const cleanIdemp = sanitizeOptionalIdempotencyKey(idempotencyKey);
  const safeSource = VALID_PHOTO_SOURCES.has(entrySource) ? entrySource : 'manual';

  let takenLocalDate = getPacificToday(now);
  if (takenAtIso && safeSource === 'legacy_import') {
    const mapped = mapHistoricalTimestampToPacificDate(takenAtIso, now);
    if (mapped.ok) {
      takenLocalDate = mapped.visitLocalDate;
    }
  }

  // 1. Fast pre-check of idempotency & vendor existence before CPU-bound sharp decode
  const preCheck = await withTransaction(dbAdapter, async tx => {
    await setUserRlsContextInTx(tx, userId);
    if (cleanIdemp) {
      const idempRes = await tx.query(
        `SELECT
           cp.id,
           cp.recorded_vendor_id,
           cp.vendor_name_snapshot,
           cp.caption,
           cp.mime_type,
           cp.byte_size,
           cp.width,
           cp.height,
           to_char(cp.taken_local_date, 'YYYY-MM-DD') AS taken_local_date_iso,
           cp.created_at,
           cp.deleted_at,
           v.id AS live_vendor_id,
           v.canonical_name,
           v.is_active,
           v.hidden_from_discovery,
           v.restriction_authority,
           v.temp_restriction_expires_at,
           op.display_name AS owner_display_name
         FROM customer_photos cp
         LEFT JOIN vendors v ON v.id = cp.vendor_id
         LEFT JOIN owner_profiles op ON op.truck_id = v.id
         WHERE cp.user_id = $1 AND cp.idempotency_key = $2
         LIMIT 1`,
        [userId, cleanIdemp]
      );
      if (idempRes.rows.length > 0 && !idempRes.rows[0].deleted_at) {
        const exploration = await computeExplorationSummaryInTx(tx, {
          userId,
          now,
          showAchievements,
          showWeeklyChallenge,
          featureStates
        });
        return {
          replay: {
            ok: true,
            created: false,
            idempotent_replay: true,
            photo: formatPhotoDto(idempRes.rows[0], now.getTime()),
            exploration
          }
        };
      }
      if (idempRes.rows.length > 0 && idempRes.rows[0].deleted_at) {
        await tx.query(
          `UPDATE customer_photos SET idempotency_key = NULL WHERE id = $1 AND user_id = $2 AND deleted_at IS NOT NULL`,
          [idempRes.rows[0].id, userId]
        );
      }
    }

    let resolvedVendor = null;
    if (cleanVendorSlug) {
      resolvedVendor = await loadVendorForUserActionInTx(tx, cleanVendorSlug, now.getTime());
      if (!resolvedVendor) {
        throw new ExplorationDomainError('Selected business could not be found in the active directory.', {
          status: 404,
          code: 'VENDOR_NOT_FOUND'
        });
      }
    }

    const cntRes = await tx.query(
      `SELECT COUNT(*)::int AS active_count
       FROM customer_photos
       WHERE user_id = $1 AND deleted_at IS NULL`,
      [userId]
    );
    if (Number(cntRes.rows[0]?.active_count || 0) >= MAX_ACTIVE_PHOTOS_PER_USER) {
      throw new ExplorationDomainError(
        `You have reached the limit of ${MAX_ACTIVE_PHOTOS_PER_USER} saved photos. Remove a photo before uploading another.`,
        { status: 409, code: 'PHOTO_LIMIT_REACHED' }
      );
    }

    return { replay: null, vendor: resolvedVendor };
  });

  if (preCheck.replay) {
    return preCheck.replay;
  }

  // 2. Decode, verify dimensions, auto-orient, strip EXIF/GPS, and build thumbnail outside DB tx
  const normalized = await verifyAndNormalizeUploadedPhoto({
    dataBase64,
    declaredMimeType
  });

  const photoId = generatePrefixedId('pht');
  const writtenPaths = writePhotoDerivativesAtomically({
    storageRoot,
    photoId,
    ext: normalized.ext,
    mainBuffer: normalized.mainBuffer,
    thumbBuffer: normalized.thumbBuffer,
    minFreeBytes
  });

  // 3. Commit metadata atomically under per-user advisory lock; clean up files on any rollback!
  try {
    return await withTransaction(dbAdapter, async tx => {
      await setUserRlsContextInTx(tx, userId);
      await tx.query("SELECT pg_advisory_xact_lock(hashtext('bs_cust_photos:' || $1))", [userId]);

      if (cleanIdemp) {
        const raceIdemp = await tx.query(
          `SELECT id, deleted_at FROM customer_photos WHERE user_id = $1 AND idempotency_key = $2 LIMIT 1`,
          [userId, cleanIdemp]
        );
        if (raceIdemp.rows.length > 0 && !raceIdemp.rows[0].deleted_at) {
          deletePhotoFilesSafely({
            storageRoot,
            storageRelPath: writtenPaths.storageRelPath,
            thumbRelPath: writtenPaths.thumbRelPath
          });
          const existingList = await tx.query(
            `SELECT
               cp.id, cp.recorded_vendor_id, cp.vendor_name_snapshot, cp.caption, cp.mime_type,
               cp.byte_size, cp.width, cp.height,
               to_char(cp.taken_local_date, 'YYYY-MM-DD') AS taken_local_date_iso,
               cp.created_at, v.id AS live_vendor_id, v.canonical_name, v.is_active,
               v.hidden_from_discovery, v.restriction_authority, v.temp_restriction_expires_at,
               op.display_name AS owner_display_name
             FROM customer_photos cp
             LEFT JOIN vendors v ON v.id = cp.vendor_id
             LEFT JOIN owner_profiles op ON op.truck_id = v.id
             WHERE cp.id = $1 AND cp.user_id = $2`,
            [raceIdemp.rows[0].id, userId]
          );
          const exploration = await computeExplorationSummaryInTx(tx, {
            userId,
            now,
            showAchievements,
            showWeeklyChallenge,
            featureStates
          });
          return {
            ok: true,
            created: false,
            idempotent_replay: true,
            photo: formatPhotoDto(existingList.rows[0], now.getTime()),
            exploration
          };
        }
      }

      const activeRes = await tx.query(
        `SELECT COUNT(*)::int AS active_count
         FROM customer_photos
         WHERE user_id = $1 AND deleted_at IS NULL`,
        [userId]
      );
      if (Number(activeRes.rows[0]?.active_count || 0) >= MAX_ACTIVE_PHOTOS_PER_USER) {
        throw new ExplorationDomainError(
          `You have reached the limit of ${MAX_ACTIVE_PHOTOS_PER_USER} saved photos. Remove a photo before uploading another.`,
          { status: 409, code: 'PHOTO_LIMIT_REACHED' }
        );
      }

      const vendorRef = preCheck.vendor;
      const ins = await tx.query(
        `INSERT INTO customer_photos (
           id, user_id, vendor_id, recorded_vendor_id, vendor_name_snapshot,
           caption, mime_type, byte_size, thumb_byte_size, width, height,
           sha256_hex, storage_rel_path, thumb_rel_path, entry_source,
           idempotency_key, taken_local_date
         ) VALUES (
           $1, $2, $3, $3, $4,
           $5, $6, $7, $8, $9, $10,
           $11, $12, $13, $14,
           $15, $16::date
         )
         RETURNING
           id, recorded_vendor_id, vendor_name_snapshot, caption, mime_type,
           byte_size, width, height,
           to_char(taken_local_date, 'YYYY-MM-DD') AS taken_local_date_iso,
           created_at`,
        [
          photoId,
          userId,
          vendorRef ? vendorRef.id : null,
          vendorRef ? vendorRef.businessName : null,
          cleanCaption,
          normalized.mimeType,
          normalized.byteSize,
          normalized.thumbByteSize,
          normalized.width,
          normalized.height,
          normalized.sha256Hex,
          writtenPaths.storageRelPath,
          writtenPaths.thumbRelPath,
          safeSource,
          cleanIdemp,
          takenLocalDate
        ]
      );

      const exploration = await computeExplorationSummaryInTx(tx, {
        userId,
        now,
        showAchievements,
        showWeeklyChallenge,
        featureStates
      });

      const dtoRow = {
        ...ins.rows[0],
        live_vendor_id: vendorRef ? vendorRef.id : null,
        canonical_name: vendorRef ? vendorRef.businessName : null,
        is_active: true,
        hidden_from_discovery: false
      };

      return {
        ok: true,
        created: true,
        idempotent_replay: false,
        photo: formatPhotoDto(dtoRow, now.getTime()),
        exploration
      };
    });
  } catch (err) {
    deletePhotoFilesSafely({
      storageRoot,
      storageRelPath: writtenPaths.storageRelPath,
      thumbRelPath: writtenPaths.thumbRelPath
    });
    throw err;
  }
}

export async function readUserPhotoFile(
  dbAdapter,
  { userId, photoId, variant = 'main', storageRoot = resolvePhotoStorageRoot() }
) {
  const cleanId = String(photoId || '').trim();
  if (!/^pht_[a-f0-9]{24,40}$/.test(cleanId)) {
    throw new ExplorationDomainError('Photo not found.', {
      status: 404,
      code: 'PHOTO_NOT_FOUND'
    });
  }
  const isThumb = String(variant || 'main').toLowerCase() === 'thumb';

  const row = await withTransaction(dbAdapter, async tx => {
    await setUserRlsContextInTx(tx, userId);
    const { rows } = await tx.query(
      `SELECT id, mime_type, storage_rel_path, thumb_rel_path, sha256_hex
       FROM customer_photos
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
       LIMIT 1`,
      [cleanId, userId]
    );
    return rows[0] || null;
  });

  if (!row) {
    // Deliberately return 404 for both nonexistent and other-user photos so ownership is never leaked
    throw new ExplorationDomainError('Photo not found.', {
      status: 404,
      code: 'PHOTO_NOT_FOUND'
    });
  }

  const relPath = isThumb ? row.thumb_rel_path : row.storage_rel_path;
  const contentType = isThumb ? 'image/webp' : row.mime_type;
  const bytes = readPhotoDerivativeSafely({ storageRoot, relPath });

  return {
    photoId: row.id,
    contentType,
    bytes,
    etag: `"${row.sha256_hex.slice(0, 24)}-${isThumb ? 't' : 'm'}"`
  };
}

export async function deleteUserPhoto(
  dbAdapter,
  {
    userId,
    photoId,
    storageRoot = resolvePhotoStorageRoot(),
    now = new Date(),
    showAchievements = true,
    showWeeklyChallenge = true,
    featureStates = null
  }
) {
  const cleanId = String(photoId || '').trim();
  if (!/^pht_[a-f0-9]{24,40}$/.test(cleanId)) {
    throw new ExplorationDomainError('Invalid photo identifier.', {
      status: 400,
      code: 'INVALID_PHOTO_ID'
    });
  }

  const txResult = await withTransaction(dbAdapter, async tx => {
    await setUserRlsContextInTx(tx, userId);
    await tx.query("SELECT pg_advisory_xact_lock(hashtext('bs_cust_photos:' || $1))", [userId]);

    const upd = await tx.query(
      `UPDATE customer_photos
       SET deleted_at = now(), idempotency_key = NULL
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
       RETURNING id, storage_rel_path, thumb_rel_path`,
      [cleanId, userId]
    );
    if (upd.rows.length === 0) {
      throw new ExplorationDomainError('Photo was not found or has already been removed.', {
        status: 404,
        code: 'PHOTO_NOT_FOUND'
      });
    }

    // Immediately revoke any shared Greatest Hits photo attachments derived from this source photo!
    let revokedSharedRows = [];
    try {
      const spRes = await tx.query(
        `UPDATE customer_collection_photo_attachments
         SET revoked_at = now()
         WHERE source_photo_id = $1 AND user_id = $2 AND revoked_at IS NULL
         RETURNING id, shared_rel_path`,
        [cleanId, userId]
      );
      revokedSharedRows = spRes.rows || [];
      if (revokedSharedRows.length > 0) {
        const attIds = revokedSharedRows.map(r => r.id);
        await tx.query(
          `UPDATE customer_collection_entries
           SET photo_attachment_id = NULL, updated_at = now()
           WHERE user_id = $1 AND photo_attachment_id = ANY($2::text[])`,
          [userId, attIds]
        );
      }
    } catch (spErr) {
      if (spErr?.code !== '42P01') throw spErr;
    }

    const exploration = await computeExplorationSummaryInTx(tx, {
      userId,
      now,
      showAchievements,
      showWeeklyChallenge,
      featureStates
    });

    return {
      row: upd.rows[0],
      revokedSharedRows,
      exploration
    };
  });

  const unlinkSummary = deletePhotoFilesSafely({
    storageRoot,
    storageRelPath: txResult.row.storage_rel_path,
    thumbRelPath: txResult.row.thumb_rel_path
  });

  const purgedSharedIds = [];
  for (const sr of txResult.revokedSharedRows || []) {
    if (sr.shared_rel_path && unlinkConfinedPhotoArtifact({ storageRoot, relPath: sr.shared_rel_path })) {
      purgedSharedIds.push(sr.id);
    }
  }

  if ((unlinkSummary.deletedMain && unlinkSummary.deletedThumb) || purgedSharedIds.length > 0) {
    try {
      await withTransaction(dbAdapter, async tx => {
        await setUserRlsContextInTx(tx, userId);
        if (unlinkSummary.deletedMain && unlinkSummary.deletedThumb) {
          await tx.query(
            `UPDATE customer_photos SET files_purged_at = now() WHERE id = $1 AND user_id = $2`,
            [cleanId, userId]
          );
        }
        if (purgedSharedIds.length > 0) {
          await tx.query(
            `UPDATE customer_collection_photo_attachments
             SET files_purged_at = now()
             WHERE id = ANY($1::text[]) AND user_id = $2`,
            [purgedSharedIds, userId]
          );
        }
      });
    } catch {}
  }

  return {
    ok: true,
    deleted_photo_id: cleanId,
    files_cleaned: unlinkSummary.deletedMain && unlinkSummary.deletedThumb,
    exploration: txResult.exploration
  };
}

export async function reconcilePhotoStorage(
  dbAdapter,
  {
    storageRoot = resolvePhotoStorageRoot(),
    orphanMinAgeMs = 10 * 60 * 1000,
    batchLimit = 100,
    now = new Date()
  } = {}
) {
  const safeBatch = Math.max(1, Math.min(500, Number.parseInt(String(batchLimit || 100), 10) || 100));

  return withTransaction(dbAdapter, async tx => {
    await tx.query("SELECT set_config('app.user_id', '', true)");
    await tx.query("SELECT set_config('app.photo_maintenance', 'true', true)");

    const lockRes = await tx.query(
      "SELECT pg_try_advisory_xact_lock(hashtext('bs_photo_reconcile_global')) AS locked"
    );
    if (!lockRes.rows[0]?.locked) {
      return {
        ok: true,
        skipped_concurrent: true,
        pending_purges_retried: 0,
        pending_purges_completed: 0,
        stale_tmp_deleted: 0,
        orphan_files_deleted: 0
      };
    }

    // 1. Retry unlinking soft-deleted photos whose initial filesystem cleanup failed or was interrupted
    const pendingRes = await tx.query(
      `SELECT id, storage_rel_path, thumb_rel_path
       FROM customer_photos
       WHERE deleted_at IS NOT NULL AND files_purged_at IS NULL
       ORDER BY deleted_at ASC, id ASC
       LIMIT $1`,
      [safeBatch]
    );

    const purgedIds = [];
    for (const row of pendingRes.rows) {
      const unlinkSummary = deletePhotoFilesSafely({
        storageRoot,
        storageRelPath: row.storage_rel_path,
        thumbRelPath: row.thumb_rel_path
      });
      if (unlinkSummary.deletedMain && unlinkSummary.deletedThumb) {
        purgedIds.push(row.id);
      }
    }

    if (purgedIds.length > 0) {
      await tx.query(
        `UPDATE customer_photos
         SET files_purged_at = now()
         WHERE id = ANY($1::text[]) AND deleted_at IS NOT NULL`,
        [purgedIds]
      );
    }

    // 1B. Retry unlinking revoked shared photo derivatives (`customer_collection_photo_attachments`)
    try {
      const pendingSharedRes = await tx.query(
        `SELECT id, shared_rel_path
         FROM customer_collection_photo_attachments
         WHERE revoked_at IS NOT NULL AND files_purged_at IS NULL
         ORDER BY revoked_at ASC, id ASC
         LIMIT $1`,
        [safeBatch]
      );
      const purgedSharedAttIds = [];
      for (const srow of pendingSharedRes.rows) {
        if (unlinkConfinedPhotoArtifact({ storageRoot, relPath: srow.shared_rel_path })) {
          purgedSharedAttIds.push(srow.id);
        }
      }
      if (purgedSharedAttIds.length > 0) {
        await tx.query(
          `UPDATE customer_collection_photo_attachments
           SET files_purged_at = now()
           WHERE id = ANY($1::text[]) AND revoked_at IS NOT NULL`,
          [purgedSharedAttIds]
        );
      }
    } catch (shErr) {
      if (shErr?.code !== '42P01') throw shErr;
    }

    // 2. Clean stale `.tmp-*` write artifacts and aged orphan `pht_*` / `sha_*` derivatives not referenced by active rows
    const scanned = scanPhotoStorageFiles({
      storageRoot,
      nowMs: now.getTime(),
      orphanMinAgeMs
    });

    let staleTmpDeleted = 0;
    for (const tmpRel of scanned.staleTmpRelPaths) {
      if (unlinkConfinedPhotoArtifact({ storageRoot, relPath: tmpRel })) {
        staleTmpDeleted += 1;
      }
    }

    let orphanFilesDeleted = 0;
    if (scanned.agedDerivativeRelPaths.length > 0) {
      const activeRefsRes = await tx.query(
        `SELECT storage_rel_path, thumb_rel_path
         FROM customer_photos
         WHERE deleted_at IS NULL
           AND (storage_rel_path = ANY($1::text[]) OR thumb_rel_path = ANY($1::text[]))`,
        [scanned.agedDerivativeRelPaths]
      );
      const referencedActiveSet = new Set();
      for (const r of activeRefsRes.rows) {
        if (r.storage_rel_path) referencedActiveSet.add(r.storage_rel_path);
        if (r.thumb_rel_path) referencedActiveSet.add(r.thumb_rel_path);
      }
      try {
        const activeSharedRefs = await tx.query(
          `SELECT shared_rel_path
           FROM customer_collection_photo_attachments
           WHERE revoked_at IS NULL AND shared_rel_path = ANY($1::text[])`,
          [scanned.agedDerivativeRelPaths]
        );
        for (const sr of activeSharedRefs.rows) {
          if (sr.shared_rel_path) referencedActiveSet.add(sr.shared_rel_path);
        }
      } catch (shRefErr) {
        if (shRefErr?.code !== '42P01') throw shRefErr;
      }

      for (const derivRel of scanned.agedDerivativeRelPaths) {
        if (!referencedActiveSet.has(derivRel)) {
          if (unlinkConfinedPhotoArtifact({ storageRoot, relPath: derivRel })) {
            orphanFilesDeleted += 1;
          }
        }
      }
    }

    return {
      ok: true,
      storage_available: scanned.available,
      pending_purges_retried: pendingRes.rows.length,
      pending_purges_completed: purgedIds.length,
      stale_tmp_deleted: staleTmpDeleted,
      orphan_files_deleted: orphanFilesDeleted
    };
  });
}

// ============================================================================
// Suggested Trails (Public Ranking/Resolution + Account-Backed Saved Trails)
// ============================================================================
function buildStopMatchReason(vendor, themeKey) {
  const townPhrase = vendor.taxonomy.normalizedTown ? ` in ${vendor.taxonomy.normalizedTown}` : '';
  const sourced = SOURCED_DISH_NOTES.get(vendor.id);

  if (themeKey === 'sweet') {
    if (vendor.taxonomy.sweetTier === 1) {
      return sourced || `Primary sweets & desserts stop${townPhrase} (${vendor.effectiveCuisine}).`;
    }
    if (vendor.taxonomy.sweetTier === 2) {
      return (
        SOURCED_SWEET_SPECIALTY_NOTES.get(vendor.id) ||
        `Café stop${townPhrase} with sweet menu offerings noted in its listing.`
      );
    }
    if (vendor.taxonomy.sweetTier === 3) {
      return `Primary category is ${vendor.effectiveCuisine}; included as a secondary match because catalog tags also list Sweets — confirm dessert items on current menu.`;
    }
  }

  if (themeKey === 'farm') {
    if (vendor.listing_kind === 'farm_stand') {
      return sourced || `Local farm stand${townPhrase} featuring farm goods and regional produce.`;
    }
    if (vendor.listing_kind === 'venue' && vendor.taxonomy.isFarmOrMarket) {
      return sourced || `Community farmers market venue${townPhrase}.`;
    }
    if (vendor.listing_kind === 'market_stall') {
      return `Farmers-market food stall${townPhrase} (${vendor.effectiveCuisine} at ${vendor.curated_location || 'local market'}).`;
    }
    return `Market & local-producer stop${townPhrase}.`;
  }

  if (themeKey === 'shared') {
    return sourced || `${vendor.taxonomy.cuisineLabel} stop${townPhrase} from shared BiteShark trail.`;
  }

  // `mix`
  if (vendor.taxonomy.isFarmOrMarket) {
    return sourced || `Market or farm stop${townPhrase} for fresh local browsing.`;
  }
  if (vendor.taxonomy.sweetTier === 1 || vendor.taxonomy.sweetTier === 2) {
    return (
      SOURCED_SWEET_SPECIALTY_NOTES.get(vendor.id) ||
      sourced ||
      `Sweet or coffee finish${townPhrase} (${vendor.taxonomy.cuisineLabel}).`
    );
  }
  return sourced || `Savory local ${vendor.taxonomy.cuisineLabel} stop${townPhrase}.`;
}

function scoreTrailCandidate(vendor, themeKey) {
  let base = 0;
  if (themeKey === 'sweet') {
    if (vendor.taxonomy.sweetTier === 1) base = 300;
    else if (vendor.taxonomy.sweetTier === 2) base = 200;
    else if (vendor.taxonomy.sweetTier === 3) base = 80;
    else return -1;
  } else if (themeKey === 'farm') {
    if (!vendor.taxonomy.isFarmOrMarket) return -1;
    if (vendor.listing_kind === 'farm_stand') base = 280;
    else if (vendor.listing_kind === 'venue') base = 240;
    else base = 180;
  } else {
    base = 150;
  }

  if (
    SOURCED_DISH_NOTES.has(vendor.id) ||
    SOURCED_SWEET_SPECIALTY_NOTES.has(vendor.id) ||
    Boolean(vendor.owner_display_name) ||
    Boolean(vendor.special_note)
  ) {
    base += 25;
  }
  if (
    vendor.curated_location_accuracy === 'verified_coordinate' ||
    vendor.curated_location_accuracy === 'venue_address' ||
    vendor.curated_location_source === 'venue_published'
  ) {
    base += 15;
  }
  // Small deterministic tie-adjustment favoring lower sort_order without letting sort_order override tier!
  const orderPenalty = Math.min(20, Number(vendor.sort_order || 100) * 0.15);
  return Number((base - orderPenalty).toFixed(4));
}

function selectDeduplicatedStops(sortedCandidates, maxCount = 3, rotationOffset = 0) {
  if (sortedCandidates.length === 0) return [];
  const safeOffset = Math.max(0, rotationOffset) % sortedCandidates.length;
  const rotated =
    safeOffset === 0
      ? sortedCandidates
      : [...sortedCandidates.slice(safeOffset), ...sortedCandidates.slice(0, safeOffset)];

  const chosen = [];
  const usedIds = new Set();
  const usedVenues = new Set();

  for (const cand of rotated) {
    if (chosen.length >= maxCount) break;
    if (usedIds.has(cand.id) || usedVenues.has(cand.taxonomy.venueGroupKey)) continue;
    usedIds.add(cand.id);
    usedVenues.add(cand.taxonomy.venueGroupKey);
    chosen.push(cand);
  }
  return chosen;
}

export async function buildSuggestedTrail(
  dbAdapter,
  { theme = 'mix', town = '', offset = 0, explicitIds = null, now = new Date() } = {}
) {
  const cleanTheme = ['sweet', 'farm', 'mix'].includes(String(theme || '').toLowerCase())
    ? String(theme).toLowerCase()
    : 'mix';
  const cleanTown = town ? normalizeCanonicalTown(town) : null;
  if (town && String(town).trim() !== '' && !cleanTown) {
    throw new ExplorationDomainError('Choose a valid Sonoma County town or Any town.', {
      status: 400,
      code: 'INVALID_TRAIL_TOWN'
    });
  }
  const safeOffset = Math.max(0, Math.min(20, Number.parseInt(String(offset || 0), 10) || 0));
  const nowMs = now.getTime();

  const { rows } = await dbAdapter.query(
    `SELECT
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
       v.blurb,
       v.special_note,
       v.tags,
       v.curated_location,
       v.curated_location_source,
       v.curated_location_accuracy,
       v.curated_hours,
       v.is_active,
       v.hidden_from_discovery,
       v.restriction_authority,
       v.temp_restriction_expires_at,
       op.display_name AS owner_display_name,
       op.cuisine AS owner_cuisine
     FROM vendors v
     LEFT JOIN owner_profiles op ON op.truck_id = v.id
     ORDER BY v.sort_order ASC, v.id ASC`
  );

  const discoverableById = new Map();
  const allDiscoverable = [];
  const availableTownsSet = new Set();

  for (const r of rows) {
    if (!isVendorPubliclyDiscoverable(r, nowMs)) continue;
    const effectiveName = String(r.owner_display_name || r.canonical_name || r.id).trim();
    const effectiveCuisine = String(r.owner_cuisine || r.cuisine || 'Global').trim();
    const taxonomy = classifyVendorTaxonomy({
      ...r,
      effective_name: effectiveName,
      effective_cuisine: effectiveCuisine
    });
    if (taxonomy.normalizedTown) {
      availableTownsSet.add(taxonomy.normalizedTown);
    }
    const enriched = {
      ...r,
      effectiveName,
      effectiveCuisine,
      taxonomy
    };
    discoverableById.set(r.id, enriched);
    allDiscoverable.push(enriched);
  }

  // Case A: Resolve explicit shared trail IDs (`#trail=id1,id2,id3` or `?trail=id1,id2,id3`)
  // Never leaks unpublished/missing vendor names on public links!
  if (Array.isArray(explicitIds) && explicitIds.length > 0) {
    const seen = new Set();
    const cleanIds = [];
    for (const rawId of explicitIds.slice(0, 6)) {
      const slug = String(rawId || '').trim().toLowerCase();
      if (!slug || seen.has(slug) || !/^[a-z0-9][a-z0-9_-]{0,79}$/.test(slug)) continue;
      seen.add(slug);
      cleanIds.push(slug);
    }

    const stops = cleanIds.map((slug, idx) => {
      const live = discoverableById.get(slug);
      if (!live) {
        return {
          position: idx + 1,
          vendor_id: slug,
          business_name: 'Unavailable listing',
          town: null,
          cuisine_label: null,
          emoji: '📍',
          location_note: 'This stop is not currently active in the BiteShark directory.',
          hours_note: null,
          match_reason: 'Shared trail stop is currently unavailable.',
          available: false
        };
      }
      return {
        position: idx + 1,
        vendor_id: live.id,
        business_name: live.effectiveName,
        town: live.taxonomy.normalizedTown || 'Sonoma County',
        cuisine_label: live.taxonomy.cuisineLabel,
        emoji: live.emoji || '🍴',
        location_note: live.curated_location || 'Confirm current location with vendor',
        hours_note: live.curated_hours || 'Schedule not verified · contact vendor',
        match_reason: buildStopMatchReason(live, 'shared'),
        available: true
      };
    });

    const activeStopIds = stops.filter(s => s.available).map(s => s.vendor_id);
    return {
      mode: 'shared',
      theme: 'shared',
      town: null,
      stops,
      available_towns: [...availableTownsSet].sort(),
      insufficient_matches: activeStopIds.length < 3,
      share_query_path: activeStopIds.length ? `/?trail=${activeStopIds.map(encodeURIComponent).join(',')}` : null,
      share_hash_path: activeStopIds.length ? `/#trail=${activeStopIds.map(encodeURIComponent).join(',')}` : null,
      disclaimers: TRAIL_DISCLAIMERS
    };
  }

  // Case B: Generate ranked Suggested Trail for `(cleanTheme, cleanTown, safeOffset)`
  const townPool = cleanTown
    ? allDiscoverable.filter(v => v.taxonomy.normalizedTown === cleanTown)
    : allDiscoverable;

  let selected = [];
  if (cleanTheme === 'sweet') {
    // Prioritize clear dessert/sweet specialists (Tier 1) and sourced sweet specialties (Tier 2).
    // Secondary tag-only savory trucks (Tier 3) are included ONLY if Tier 1+2 have < 3 stops AND
    // only when explicitly explained in `match_reason`.Wait: to ensure "Something sweet" never surprises
    // customers with burger trucks when primary sweet stops exist, filter to Tier 1 & Tier 2 first,
    // and only include Tier 3 if explicitly needed? Even better: exclude burger/hot-dog primary trucks
    // unless their listing text/notes support sweets, returning < 3 stops when a town has fewer!
    const reliableSweet = townPool
      .filter(v => v.taxonomy.sweetTier === 1 || v.taxonomy.sweetTier === 2)
      .map(v => ({ vendor: v, score: scoreTrailCandidate(v, 'sweet') }))
      .sort((a, b) => b.score - a.score || a.vendor.id.localeCompare(b.vendor.id))
      .map(x => x.vendor);

    selected = selectDeduplicatedStops(reliableSweet, 3, safeOffset);
  } else if (cleanTheme === 'farm') {
    const farmCandidates = townPool
      .filter(v => v.taxonomy.isFarmOrMarket)
      .map(v => ({ vendor: v, score: scoreTrailCandidate(v, 'farm') }))
      .sort((a, b) => b.score - a.score || a.vendor.id.localeCompare(b.vendor.id))
      .map(x => x.vendor);

    selected = selectDeduplicatedStops(farmCandidates, 3, safeOffset);
  } else {
    // `mix`: 1 Farm/Market/Coffee opener + 1 Savory Lunch Truck/Venue + 1 Sweet or Café finisher,
    // all deduplicated by venue and ranked deterministically.
    const openers = townPool
      .filter(v => v.taxonomy.isFarmOrMarket || v.taxonomy.cuisineKey === 'coffee')
      .sort((a, b) => scoreTrailCandidate(b, 'mix') - scoreTrailCandidate(a, 'mix') || a.id.localeCompare(b.id));
    const savories = townPool
      .filter(
        v =>
          !v.taxonomy.isFarmOrMarket &&
          v.taxonomy.cuisineKey !== 'sweets' &&
          v.taxonomy.cuisineKey !== 'coffee'
      )
      .sort((a, b) => scoreTrailCandidate(b, 'mix') - scoreTrailCandidate(a, 'mix') || a.id.localeCompare(b.id));
    const finishers = townPool
      .filter(v => v.taxonomy.sweetTier === 1 || v.taxonomy.sweetTier === 2 || v.taxonomy.cuisineKey === 'coffee')
      .sort((a, b) => scoreTrailCandidate(b, 'sweet') - scoreTrailCandidate(a, 'sweet') || a.id.localeCompare(b.id));

    const usedIds = new Set();
    const usedVenues = new Set();
    for (const bucket of [openers, savories, finishers]) {
      if (bucket.length === 0) continue;
      const startIdx = safeOffset % bucket.length;
      const rotated = [...bucket.slice(startIdx), ...bucket.slice(0, startIdx)];
      const pick = rotated.find(c => !usedIds.has(c.id) && !usedVenues.has(c.taxonomy.venueGroupKey));
      if (pick) {
        usedIds.add(pick.id);
        usedVenues.add(pick.taxonomy.venueGroupKey);
        selected.push(pick);
      }
    }

    // Backfill up to 3 from remaining distinct-venue candidates in `townPool` if available
    if (selected.length < 3) {
      const rest = townPool
        .slice()
        .sort((a, b) => scoreTrailCandidate(b, 'mix') - scoreTrailCandidate(a, 'mix') || a.id.localeCompare(b.id));
      for (const cand of rest) {
        if (selected.length >= 3) break;
        if (usedIds.has(cand.id) || usedVenues.has(cand.taxonomy.venueGroupKey)) continue;
        usedIds.add(cand.id);
        usedVenues.add(cand.taxonomy.venueGroupKey);
        selected.push(cand);
      }
    }
  }

  const stops = selected.map((v, idx) => ({
    position: idx + 1,
    vendor_id: v.id,
    business_name: v.effectiveName,
    town: v.taxonomy.normalizedTown || 'Sonoma County',
    cuisine_label: v.taxonomy.cuisineLabel,
    emoji: v.emoji || '🍴',
    location_note: v.curated_location || 'Confirm current location with vendor',
    hours_note: v.curated_hours || 'Schedule not verified · contact vendor',
    match_reason: buildStopMatchReason(v, cleanTheme),
    available: true
  }));

  const stopIds = stops.map(s => s.vendor_id);

  return {
    mode: 'generated',
    theme: cleanTheme,
    town: cleanTown,
    stops,
    available_towns: [...availableTownsSet].sort(),
    insufficient_matches: stops.length < 3,
    insufficient_note:
      stops.length === 0
        ? `No reliable ${cleanTheme === 'sweet' ? 'sweet or dessert' : cleanTheme === 'farm' ? 'farm or market' : 'directory'} stops matched${cleanTown ? ` in ${cleanTown}` : ''}. Try Any town or another trail theme.`
        : stops.length < 3
          ? `Found ${stops.length} reliable ${stops.length === 1 ? 'match' : 'matches'}${cleanTown ? ` in ${cleanTown}` : ''} rather than padding with unrelated listings.`
          : null,
    ranking_rule:
      'Deterministic category-tier match score + sourced-highlight bonus + published-location bonus, deduplicated across shared market/park venues with alphabetical ID tie-breaking.',
    share_query_path: stopIds.length ? `/?trail=${stopIds.map(encodeURIComponent).join(',')}` : null,
    share_hash_path: stopIds.length ? `/#trail=${stopIds.map(encodeURIComponent).join(',')}` : null,
    disclaimers: TRAIL_DISCLAIMERS
  };
}

const DEFAULT_TRAIL_TITLES = {
  sweet: 'Something Sweet Trail',
  farm: 'Farm & Market Trail',
  mix: 'Sonoma Mix Trail',
  shared: 'Saved Shared Trail',
  custom: 'Saved Sonoma Trail'
};

async function hydrateSavedTrailsInTx(tx, { userId, trailRows, now = new Date() }) {
  if (trailRows.length === 0) return [];
  const trailIds = trailRows.map(t => t.id);

  const stopsRes = await tx.query(
    `SELECT
       s.trail_id,
       s.position,
       s.recorded_vendor_id,
       s.vendor_name_snapshot,
       s.match_reason,
       v.id AS live_vendor_id,
       v.canonical_name,
       v.city AS live_city,
       v.curated_location,
       v.curated_hours,
       v.is_active,
       v.hidden_from_discovery,
       v.restriction_authority,
       v.temp_restriction_expires_at,
       op.display_name AS owner_display_name
     FROM customer_saved_trail_stops s
     LEFT JOIN vendors v ON v.id = s.vendor_id
     LEFT JOIN owner_profiles op ON op.truck_id = v.id
     WHERE s.user_id = $1 AND s.trail_id = ANY($2::text[])
     ORDER BY s.trail_id, s.position ASC`,
    [userId, trailIds]
  );
  const stopVendorIds = [...new Set(stopsRes.rows.map(s => s.recorded_vendor_id).filter(Boolean))];
  const visitsRes =
    stopVendorIds.length > 0
      ? await tx.query(
          `SELECT
             recorded_vendor_id,
             visited_at,
             to_char(visit_local_date, 'YYYY-MM-DD') AS visit_local_date_iso
           FROM customer_visits
           WHERE user_id = $1 AND deleted_at IS NULL AND recorded_vendor_id = ANY($2::text[])
           ORDER BY visited_at DESC, id DESC`,
          [userId, stopVendorIds]
        )
      : { rows: [] };

  const visitsByVendor = new Map();
  for (const v of visitsRes.rows) {
    const visitedAtDate = v.visited_at instanceof Date ? v.visited_at : new Date(v.visited_at);
    const visitedAtMs = visitedAtDate.getTime();
    if (!Number.isFinite(visitedAtMs)) continue;
    if (!visitsByVendor.has(v.recorded_vendor_id)) {
      visitsByVendor.set(v.recorded_vendor_id, []);
    }
    visitsByVendor.get(v.recorded_vendor_id).push({
      visitedAtMs,
      visitedAtIso: visitedAtDate.toISOString(),
      visitLocalDateIso: v.visit_local_date_iso
    });
  }

  const stopsByTrail = new Map();
  for (const s of stopsRes.rows) {
    if (!stopsByTrail.has(s.trail_id)) stopsByTrail.set(s.trail_id, []);
    stopsByTrail.get(s.trail_id).push(s);
  }

  const nowMs = now.getTime();
  const todayLocalDate = getPacificToday(now);
  return trailRows.map(tr => {
    const trailCreatedDate = tr.created_at instanceof Date ? tr.created_at : new Date(tr.created_at);
    const trailCreatedAtMs = trailCreatedDate.getTime();
    const trailCreatedAtIso = trailCreatedDate.toISOString();
    const rawStops = stopsByTrail.get(tr.id) || [];
    const stops = rawStops.map(s => {
      const discoverable = Boolean(s.live_vendor_id && isVendorPubliclyDiscoverable(s, nowMs));
      const vendorVisits = visitsByVendor.get(s.recorded_vendor_id) || [];
      // Authoritative post-save progress rule: a saved trail stop counts as visited ONLY when the
      // user has an active self-reported visit logged at or after `trail.created_at`. Pre-save
      // visits logged earlier on the same day do NOT silently count as post-save progress.
      const postSaveVisit = vendorVisits.find(v => v.visitedAtMs >= trailCreatedAtMs) || null;
      const visitedSinceSave = Boolean(postSaveVisit);
      const todayPreSaveVisit = !visitedSinceSave
        ? vendorVisits.find(
            v => v.visitLocalDateIso === todayLocalDate && v.visitedAtMs < trailCreatedAtMs
          ) || null
        : null;
      return {
        position: Number(s.position),
        vendor_id: s.recorded_vendor_id,
        business_name: discoverable
          ? String(s.owner_display_name || s.canonical_name || s.vendor_name_snapshot)
          : s.vendor_name_snapshot,
        business_status: discoverable ? 'active' : 'unavailable',
        can_open_detail: discoverable,
        town: discoverable ? normalizeCanonicalTown(s.live_city) || 'Sonoma County' : null,
        location_note: discoverable
          ? s.curated_location || 'Confirm current location with vendor'
          : 'This business is currently unavailable in the active directory.',
        hours_note: discoverable ? s.curated_hours || 'Schedule not verified · contact vendor' : null,
        match_reason: s.match_reason,
        visited_since_save: visitedSinceSave,
        qualifying_visit_date: visitedSinceSave ? postSaveVisit.visitLocalDateIso : null,
        visited_before_save_today: Boolean(todayPreSaveVisit),
        pre_save_visit_date: todayPreSaveVisit ? todayPreSaveVisit.visitLocalDateIso : null
      };
    });

    const completedStops = stops.filter(s => s.visited_since_save).length;
    const shareIds = stops.filter(s => s.can_open_detail).map(s => s.vendor_id);

    return {
      trail_id: tr.id,
      title: tr.title,
      theme_key: tr.theme_key,
      town_filter: tr.town_filter || null,
      saved_local_date: tr.saved_local_date_iso,
      created_at: trailCreatedAtIso,
      progress: {
        completed_stops: completedStops,
        total_stops: stops.length,
        completed: stops.length > 0 && completedStops === stops.length,
        rule: `Counts active self-reported visits logged at or after ${trailCreatedAtIso} (one counted visit per business per America/Los_Angeles calendar day).`
      },
      share_query_path: shareIds.length ? `/?trail=${shareIds.map(encodeURIComponent).join(',')}` : null,
      share_hash_path: shareIds.length ? `/#trail=${shareIds.map(encodeURIComponent).join(',')}` : null,
      stops
    };
  });
}

export async function listUserSavedTrails(
  dbAdapter,
  { userId, limit = 20, offset = 0, now = new Date() }
) {
  const safeLimit = Math.max(1, Math.min(30, Number.parseInt(String(limit || 20), 10) || 20));
  const safeOffset = Math.max(0, Math.min(200, Number.parseInt(String(offset || 0), 10) || 0));

  return withTransaction(dbAdapter, async tx => {
    await setUserRlsContextInTx(tx, userId);

    const cntRes = await tx.query(
      `SELECT COUNT(*)::int AS total
       FROM customer_saved_trails
       WHERE user_id = $1 AND deleted_at IS NULL`,
      [userId]
    );
    const total = Number(cntRes.rows[0]?.total || 0);

    const { rows } = await tx.query(
      `SELECT
         id,
         title,
         theme_key,
         town_filter,
         to_char(saved_local_date, 'YYYY-MM-DD') AS saved_local_date_iso,
         created_at
       FROM customer_saved_trails
       WHERE user_id = $1 AND deleted_at IS NULL
       ORDER BY created_at DESC, id DESC
       LIMIT $2 OFFSET $3`,
      [userId, safeLimit, safeOffset]
    );

    const trails = await hydrateSavedTrailsInTx(tx, { userId, trailRows: rows, now });
    return {
      trails,
      disclaimers: TRAIL_DISCLAIMERS,
      pagination: {
        total,
        limit: safeLimit,
        offset: safeOffset,
        has_more: safeOffset + trails.length < total
      }
    };
  });
}

export async function saveUserTrail(
  dbAdapter,
  {
    userId,
    title = '',
    themeKey = 'mix',
    townFilter = null,
    stops = [],
    idempotencyKey = null,
    now = new Date()
  }
) {
  const safeTheme = ['sweet', 'farm', 'mix', 'shared', 'custom'].includes(String(themeKey || '').toLowerCase())
    ? String(themeKey).toLowerCase()
    : 'custom';
  const cleanTown = townFilter ? normalizeCanonicalTown(townFilter) : null;
  const cleanIdemp = sanitizeOptionalIdempotencyKey(idempotencyKey);

  if (!Array.isArray(stops) || stops.length < 1 || stops.length > 6) {
    throw new ExplorationDomainError('A saved trail must include between 1 and 6 stops.', {
      status: 400,
      code: 'INVALID_TRAIL_STOPS'
    });
  }

  const normalizedStopInputs = [];
  const seenSlugs = new Set();
  for (const item of stops) {
    const rawId = typeof item === 'string' ? item : item?.vendor_id;
    const slug = sanitizeVendorIdInput(rawId);
    if (seenSlugs.has(slug)) {
      throw new ExplorationDomainError('Duplicate stops are not allowed in a saved trail.', {
        status: 400,
        code: 'DUPLICATE_TRAIL_STOP'
      });
    }
    seenSlugs.add(slug);
    const customReason =
      typeof item === 'object' && item?.match_reason
        ? sanitizeNoteText(String(item.match_reason), 220)
        : '';
    normalizedStopInputs.push({ slug, customReason });
  }

  const defaultTitleBase = DEFAULT_TRAIL_TITLES[safeTheme] || 'Saved Sonoma Trail';
  const autoTitle = cleanTown ? `${cleanTown} · ${defaultTitleBase}` : defaultTitleBase;
  const cleanTitle = sanitizeNoteText(title || autoTitle, 100) || autoTitle;
  const todayLocalDate = getPacificToday(now);

  return withTransaction(dbAdapter, async tx => {
    await setUserRlsContextInTx(tx, userId);
    await tx.query("SELECT pg_advisory_xact_lock(hashtext('bs_cust_trails:' || $1))", [userId]);

    if (cleanIdemp) {
      const existing = await tx.query(
        `SELECT
           id, title, theme_key, town_filter,
           to_char(saved_local_date, 'YYYY-MM-DD') AS saved_local_date_iso,
           created_at, deleted_at
         FROM customer_saved_trails
         WHERE user_id = $1 AND idempotency_key = $2
         LIMIT 1`,
        [userId, cleanIdemp]
      );
      if (existing.rows.length > 0 && !existing.rows[0].deleted_at) {
        const hydrated = await hydrateSavedTrailsInTx(tx, {
          userId,
          trailRows: [existing.rows[0]],
          now
        });
        return {
          ok: true,
          created: false,
          idempotent_replay: true,
          trail: hydrated[0]
        };
      }
      if (existing.rows.length > 0 && existing.rows[0].deleted_at) {
        await tx.query(
          `UPDATE customer_saved_trails SET idempotency_key = NULL WHERE id = $1 AND user_id = $2 AND deleted_at IS NOT NULL`,
          [existing.rows[0].id, userId]
        );
      }
    }

    const cntRes = await tx.query(
      `SELECT COUNT(*)::int AS active_count
       FROM customer_saved_trails
       WHERE user_id = $1 AND deleted_at IS NULL`,
      [userId]
    );
    if (Number(cntRes.rows[0]?.active_count || 0) >= MAX_SAVED_TRAILS_PER_USER) {
      throw new ExplorationDomainError(
        `You can keep up to ${MAX_SAVED_TRAILS_PER_USER} saved trails. Remove an older trail before saving another.`,
        { status: 409, code: 'SAVED_TRAIL_LIMIT_REACHED' }
      );
    }

    // Verify all stops exist & are currently discoverable
    const verifiedStops = [];
    for (let i = 0; i < normalizedStopInputs.length; i++) {
      const inp = normalizedStopInputs[i];
      const v = await loadVendorForUserActionInTx(tx, inp.slug, now.getTime());
      if (!v) {
        throw new ExplorationDomainError(
          `Stop "${inp.slug}" is not currently active in the directory and cannot be saved.`,
          { status: 404, code: 'TRAIL_STOP_UNAVAILABLE' }
        );
      }
      const fallbackReason = `${v.taxonomy.cuisineLabel} stop${v.taxonomy.normalizedTown ? ` in ${v.taxonomy.normalizedTown}` : ''}.`;
      verifiedStops.push({
        position: i + 1,
        vendorId: v.id,
        businessName: v.businessName,
        matchReason: (inp.customReason || fallbackReason).slice(0, 220)
      });
    }

    const trailId = generatePrefixedId('trl');
    const savedAtIso = now.toISOString();
    const insTrail = await tx.query(
      `INSERT INTO customer_saved_trails (
         id, user_id, title, theme_key, town_filter, saved_local_date, idempotency_key, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6::date, $7, $8::timestamptz)
       RETURNING
         id, title, theme_key, town_filter,
         to_char(saved_local_date, 'YYYY-MM-DD') AS saved_local_date_iso,
         created_at`,
      [trailId, userId, cleanTitle, safeTheme, cleanTown, todayLocalDate, cleanIdemp, savedAtIso]
    );

    for (const st of verifiedStops) {
      await tx.query(
        `INSERT INTO customer_saved_trail_stops (
           trail_id, user_id, position, vendor_id, recorded_vendor_id, vendor_name_snapshot, match_reason
         ) VALUES ($1, $2, $3, $4, $4, $5, $6)`,
        [trailId, userId, st.position, st.vendorId, st.businessName, st.matchReason]
      );
    }

    const hydrated = await hydrateSavedTrailsInTx(tx, {
      userId,
      trailRows: [insTrail.rows[0]],
      now
    });

    return {
      ok: true,
      created: true,
      idempotent_replay: false,
      trail: hydrated[0]
    };
  });
}

export async function deleteUserSavedTrail(dbAdapter, { userId, trailId }) {
  const cleanId = String(trailId || '').trim();
  if (!/^trl_[a-f0-9]{24,40}$/.test(cleanId)) {
    throw new ExplorationDomainError('Invalid saved trail identifier.', {
      status: 400,
      code: 'INVALID_TRAIL_ID'
    });
  }

  return withTransaction(dbAdapter, async tx => {
    await setUserRlsContextInTx(tx, userId);
    const upd = await tx.query(
      `UPDATE customer_saved_trails
       SET deleted_at = now(), idempotency_key = NULL
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
       RETURNING id, title`,
      [cleanId, userId]
    );
    if (upd.rows.length === 0) {
      throw new ExplorationDomainError('Saved trail was not found or has already been removed.', {
        status: 404,
        code: 'TRAIL_NOT_FOUND'
      });
    }
    return {
      ok: true,
      deleted_trail_id: upd.rows[0].id,
      title: upd.rows[0].title
    };
  });
}

// ============================================================================
// Careful Legacy Device Data Import & Account Data Export (`Sections 8 & 11`)
// ============================================================================
export async function importLegacyDeviceVisits(
  dbAdapter,
  {
    userId,
    visits = [],
    now = new Date(),
    showAchievements = true,
    showWeeklyChallenge = true,
    featureStates = null
  }
) {
  if (!Array.isArray(visits)) {
    throw new ExplorationDomainError('visits must be an array of legacy visit entries.', {
      status: 400,
      code: 'INVALID_LEGACY_VISITS'
    });
  }
  if (visits.length > 300) {
    throw new ExplorationDomainError('At most 300 legacy visits can be imported per request.', {
      status: 400,
      code: 'LEGACY_IMPORT_TOO_LARGE'
    });
  }

  return withTransaction(dbAdapter, async tx => {
    await setUserRlsContextInTx(tx, userId);
    await tx.query("SELECT pg_advisory_xact_lock(hashtext('bs_cust_visits:' || $1))", [userId]);

    const imported = [];
    const alreadyPresent = [];
    const invalidEntries = [];

    for (let index = 0; index < visits.length; index++) {
      const raw = visits[index];
      const clientRef =
        typeof raw === 'object' && raw !== null && typeof raw.client_ref === 'string'
          ? raw.client_ref.slice(0, 64)
          : `idx_${index}`;

      const rawId = typeof raw === 'string' ? raw : raw?.id || raw?.vendor_id;
      const slug = typeof rawId === 'string' ? rawId.trim().toLowerCase() : '';
      if (!slug || !/^[a-z0-9][a-z0-9_-]{0,79}$/.test(slug)) {
        invalidEntries.push({
          client_ref: clientRef,
          vendor_id: String(rawId || '').slice(0, 40),
          reason_code: 'INVALID_VENDOR_ID',
          message: 'Entry did not reference a valid business ID.'
        });
        continue;
      }

      const vendor = await loadVendorForUserActionInTx(tx, slug, now.getTime());
      if (!vendor) {
        invalidEntries.push({
          client_ref: clientRef,
          vendor_id: slug,
          reason_code: 'UNKNOWN_OR_INACTIVE_VENDOR',
          message: `Business "${slug}" does not exist in the active BiteShark directory.`
        });
        continue;
      }

      const rawAtCandidate =
        typeof raw === 'object' && raw !== null
          ? raw.at ?? raw.visited_at ?? raw.date
          : null;
      const rawAt =
        typeof rawAtCandidate === 'string' && rawAtCandidate.trim()
          ? rawAtCandidate.trim()
          : getPacificToday(now);
      const dateMapped = mapHistoricalTimestampToPacificDate(rawAt, now);
      if (!dateMapped.ok) {
        invalidEntries.push({
          client_ref: clientRef,
          vendor_id: slug,
          reason_code: 'INVALID_TIMESTAMP',
          message: dateMapped.error
        });
        continue;
      }

      let note = '';
      const rawNoteCandidate =
        typeof raw === 'object' && raw !== null
          ? raw.note ?? raw.private_note ?? raw.tip
          : undefined;
      if (rawNoteCandidate !== undefined && rawNoteCandidate !== null) {
        note = String(rawNoteCandidate)
          .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, ' ')
          .trim()
          .slice(0, MAX_VISIT_NOTE_LENGTH);
      }

      // Check if `(user_id, recorded_vendor_id, visit_local_date)` already exists
      const dupCheck = await tx.query(
        `SELECT id
         FROM customer_visits
         WHERE user_id = $1
           AND recorded_vendor_id = $2
           AND visit_local_date = $3::date
           AND deleted_at IS NULL
         LIMIT 1`,
        [userId, vendor.id, dateMapped.visitLocalDate]
      );

      if (dupCheck.rows.length > 0) {
        alreadyPresent.push({
          client_ref: clientRef,
          visit_id: dupCheck.rows[0].id,
          vendor_id: vendor.id,
          visit_local_date: dateMapped.visitLocalDate
        });
        continue;
      }

      const idempHash = crypto
        .createHash('sha256')
        .update(`legacy-visit|${userId}|${vendor.id}|${dateMapped.visitLocalDate}`)
        .digest('hex')
        .slice(0, 32);
      const idempKey = `legv_${idempHash}`;

      // Guard against soft-deleted prior row sharing the same legacy idempotency key
      const existingIdemp = await tx.query(
        `SELECT id FROM customer_visits WHERE user_id = $1 AND idempotency_key = $2 LIMIT 1`,
        [userId, idempKey]
      );
      const effectiveIdemp = existingIdemp.rows.length === 0 ? idempKey : null;

      const visitId = generatePrefixedId('vst');
      await tx.query(
        `INSERT INTO customer_visits (
           id, user_id, vendor_id, recorded_vendor_id, vendor_name_snapshot,
           normalized_cuisine, normalized_town, private_note,
           visited_at, visit_local_date, calendar_tz, entry_source, idempotency_key
         ) VALUES (
           $1, $2, $3, $3, $4,
           $5, $6, $7,
           $8::timestamptz, $9::date, 'America/Los_Angeles', 'legacy_import', $10
         )`,
        [
          visitId,
          userId,
          vendor.id,
          vendor.businessName,
          vendor.taxonomy.cuisineKey,
          vendor.taxonomy.normalizedTown,
          note,
          dateMapped.visitedAtIso,
          dateMapped.visitLocalDate,
          effectiveIdemp
        ]
      );

      imported.push({
        client_ref: clientRef,
        visit_id: visitId,
        vendor_id: vendor.id,
        business_name: vendor.businessName,
        visit_local_date: dateMapped.visitLocalDate
      });
    }

    const exploration = await computeExplorationSummaryInTx(tx, {
      userId,
      now,
      showAchievements,
      showWeeklyChallenge,
      featureStates
    });

    const partialFailure = invalidEntries.length > 0;
    return {
      ok: true,
      status_summary: partialFailure
        ? imported.length > 0 || alreadyPresent.length > 0
          ? 'partial_success'
          : 'no_valid_entries'
        : 'complete',
      imported_count: imported.length,
      already_present_count: alreadyPresent.length,
      invalid_count: invalidEntries.length,
      imported,
      already_present: alreadyPresent,
      invalid_entries: invalidEntries,
      exploration
    };
  });
}

export async function exportUserExplorationData(dbAdapter, { userId, now = new Date() }) {
  return withTransaction(dbAdapter, async tx => {
    await setUserRlsContextInTx(tx, userId);

    const summary = await computeExplorationSummaryInTx(tx, {
      userId,
      now,
      showAchievements: true,
      showWeeklyChallenge: true
    });
    const visitsRes = await tx.query(
      `SELECT
         id AS visit_id,
         recorded_vendor_id AS vendor_id,
         vendor_name_snapshot AS business_name,
         normalized_cuisine,
         normalized_town,
         private_note,
         visited_at,
         to_char(visit_local_date, 'YYYY-MM-DD') AS visit_local_date,
         calendar_tz,
         entry_source,
         created_at
       FROM customer_visits
       WHERE user_id = $1 AND deleted_at IS NULL
       ORDER BY visit_local_date DESC, created_at DESC`,
      [userId]
    );
    const photosRes = await tx.query(
      `SELECT
         id AS photo_id,
         recorded_vendor_id AS vendor_id,
         vendor_name_snapshot AS business_name,
         caption,
         mime_type,
         byte_size,
         width,
         height,
         to_char(taken_local_date, 'YYYY-MM-DD') AS taken_local_date,
         entry_source,
         created_at
       FROM customer_photos
       WHERE user_id = $1 AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [userId]
    );
    const trailsRes = await tx.query(
      `SELECT
         id, title, theme_key, town_filter,
         to_char(saved_local_date, 'YYYY-MM-DD') AS saved_local_date_iso,
         created_at
       FROM customer_saved_trails
       WHERE user_id = $1 AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [userId]
    );

    const trails = await hydrateSavedTrailsInTx(tx, {
      userId,
      trailRows: trailsRes.rows,
      now
    });

    return {
      exported_at: now.toISOString(),
      user_id: userId,
      calendar_timezone: EXPLORATION_TIMEZONE,
      summary,
      visits: visitsRes.rows,
      photos: photosRes.rows.map(p => ({
        ...p,
        download_url: `/api/me/photos/file?id=${encodeURIComponent(p.photo_id)}&variant=main&download=1`,
        view_url: `/api/me/photos/file?id=${encodeURIComponent(p.photo_id)}&variant=main`,
        thumb_url: `/api/me/photos/file?id=${encodeURIComponent(p.photo_id)}&variant=thumb`
      })),
      saved_trails: trails
    };
  });
}
