// BiteShark Customer Profile Foundation, Curated "Greatest Hits" Collections,
// Revocable Unlisted Sharing, 18+ Sharing Eligibility & Scoped Moderation Domain
// (`lib/customer-profile.js`)
//
// Core Product & Privacy Invariants:
//   1. Private-First Account Tool (NOT a Social Network):
//      - Zero followers, DMs, profile comments, public activity feeds, popularity rankings, or user search.
//      - Default visibility is strictly `private`; `public` / `discoverable` visibility is rejected.
//   2. Reuses Canonical Services Without Duplication:
//      - Points, levels, badges, weekly challenges, visits, photos, and saved trails come strictly
//        from `lib/customer-exploration.js`.
//      - Favorites come from `favorites`, nearby alert settings from `notification_settings`, and
//        business discovery/availability from `lib/discovery.js`.
//   3. Strict Allowlisted DTO Projections:
//      - Separate allowlisted builders for (1) Private Owner Profile, (2) Private Owner Collection,
//        (3) Shared Collection (used identically by preview and live `/s/<token>`), and
//        (4) Administrative Moderation (scoped strictly to reported shared content).

import crypto from 'node:crypto';
import { withTransaction } from './db-tx.js';
import {
  reverifyModeratorInTx,
  reverifyPlatformAdminInTx,
  recordAuditLog
} from './authz.js';
import {
  consumeGovernanceRateLimit,
  recordTestSafeNotificationInTx
} from './admin-governance.js';
import { sanitizeDiagnosticText } from './diagnostics.js';
import { evaluateAdultSharingEligibility } from './age-policy.js';
import { loadDiscoveryCatalog, isVendorPubliclyDiscoverable } from './discovery.js';
import {
  computeExplorationSummaryInTx,
  listUserVisits,
  listUserPhotos,
  listUserSavedTrails,
  exportUserExplorationData
} from './customer-exploration.js';
import {
  PhotoStorageError,
  resolvePhotoStorageRoot,
  createSharedPhotoDerivative,
  readPhotoDerivativeSafely,
  unlinkConfinedPhotoArtifact
} from './photo-storage.js';

export const MAX_COLLECTIONS_PER_USER = 5;
export const MAX_ENTRIES_PER_COLLECTION = 20;
export const MAX_COLLECTION_TITLE_LENGTH = 100;
export const MAX_COLLECTION_INTRO_LENGTH = 500;
export const MAX_ENTRY_RECOMMENDATION_LENGTH = 500;
export const MAX_ACTIVE_SHARES_PER_COLLECTION = 3;
export const MAX_DISPLAY_NAME_LENGTH = 60;
export const MAX_BIO_LENGTH = 240;
export const MAX_FOOD_INTERESTS = 10;

export const ALLOWED_AVATAR_STYLES = Object.freeze([
  'initials_fern',
  'initials_terracotta',
  'initials_ochre',
  'initials_slate',
  'shark_emblem',
  'citrus_sprig'
]);

export const SUPPORTED_SONOMA_TOWNS = Object.freeze([
  'Santa Rosa',
  'Petaluma',
  'Rohnert Park',
  'Sebastopol',
  'Healdsburg',
  'Sonoma',
  'Windsor',
  'Cotati',
  'Cloverdale',
  'Guerneville',
  'Forestville',
  'Bodega Bay',
  'Glen Ellen',
  'Kenwood',
  'Geyserville',
  'Penngrove',
  'Occidental',
  'Graton'
]);

export const SUPPORTED_FOOD_INTERESTS = Object.freeze([
  { key: 'tacos_mexican', label: 'Tacos & Regional Mexican', group: 'cuisine' },
  { key: 'burgers_smash', label: 'Smash Burgers & Sliders', group: 'cuisine' },
  { key: 'hot_dogs_sausage', label: 'Hot Dogs & Sausages', group: 'cuisine' },
  { key: 'coffee_espresso', label: 'Coffee & Espresso Carts', group: 'cuisine' },
  { key: 'sweets_bakery', label: 'Desserts, Churros & Pastries', group: 'cuisine' },
  { key: 'farmers_markets', label: 'Farmers Markets & Farm Stands', group: 'cuisine' },
  { key: 'bbq_smoked', label: 'BBQ & Wood-Fired', group: 'cuisine' },
  { key: 'seafood_coastal', label: 'Coastal Seafood', group: 'cuisine' },
  { key: 'global_street_food', label: 'Global Street Food', group: 'cuisine' },
  { key: 'vegetarian_friendly', label: 'Vegetarian-Friendly Options (Preference)', group: 'dietary_preference' },
  { key: 'plant_based_options', label: 'Plant-Based Options (Preference)', group: 'dietary_preference' },
  { key: 'gluten_conscious_options', label: 'Gluten-Conscious Options (Preference)', group: 'dietary_preference' }
]);

export const FORBIDDEN_CLIENT_PROFILE_WRITE_FIELDS = Object.freeze([
  'user_id',
  'owner_id',
  'id',
  'public_profile_id',
  'email',
  'email_normalized',
  'points',
  'total_points',
  'level',
  'badges',
  'achievements',
  'weekly_challenge',
  'age_eligibility_status',
  'sharing_eligibility',
  'eligibility_status',
  'moderation_status',
  'suppressed_at',
  'suppressed_by',
  'suppression_authority',
  'suppression_reason',
  'allow_public_indexing',
  'role',
  'roles',
  'is_admin',
  'vendor_memberships'
]);

export const ALLOWED_SHARE_REPORT_REASONS = Object.freeze([
  'inappropriate_content',
  'impersonation_or_misleading',
  'privacy_concern',
  'copyright_or_photo',
  'spam_or_abuse',
  'other'
]);

const AVATAR_STYLE_SET = new Set(ALLOWED_AVATAR_STYLES);
const SONOMA_TOWN_MAP = new Map(SUPPORTED_SONOMA_TOWNS.map(t => [t.toLowerCase(), t]));
const FOOD_INTEREST_SET = new Set(SUPPORTED_FOOD_INTERESTS.map(i => i.key));

export class CustomerProfileDomainError extends Error {
  constructor(message, { status = 400, code = 'PROFILE_ERROR', retryable = false, details = null } = {}) {
    super(message);
    this.name = 'CustomerProfileDomainError';
    this.status = status;
    this.code = code;
    this.retryable = Boolean(retryable);
    this.details = details || null;
  }
}

export function generateOpaqueId(prefix) {
  return `${prefix}_${crypto.randomBytes(16).toString('hex')}`;
}

export function assertNoForbiddenClientWriteFields(body, extraForbidden = []) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new CustomerProfileDomainError('Request body must be a JSON object.', {
      status: 400,
      code: 'INVALID_JSON_OBJECT'
    });
  }
  if (
    Object.prototype.hasOwnProperty.call(body, 'visibility_mode') &&
    body.visibility_mode !== undefined &&
    body.visibility_mode !== 'private' &&
    body.visibility_mode !== 'unlisted_link'
  ) {
    throw new CustomerProfileDomainError(
      'Public or searchable visibility is not available on BiteShark.',
      {
        status: 400,
        code: 'PUBLIC_VISIBILITY_UNSUPPORTED'
      }
    );
  }
  if (
    Object.prototype.hasOwnProperty.call(body, 'visibility') &&
    body.visibility !== undefined &&
    body.visibility !== 'private' &&
    body.visibility !== 'unlisted_link'
  ) {
    throw new CustomerProfileDomainError(
      'Public or searchable visibility is not available on BiteShark.',
      {
        status: 400,
        code: 'PUBLIC_VISIBILITY_UNSUPPORTED'
      }
    );
  }
  const combined = new Set([...FORBIDDEN_CLIENT_PROFILE_WRITE_FIELDS, ...extraForbidden]);
  for (const key of Object.keys(body)) {
    if (combined.has(key)) {
      throw new CustomerProfileDomainError(
        `Field "${key}" is server-managed and cannot be written by the client.`,
        {
          status: 400,
          code: 'FORBIDDEN_CLIENT_FIELD'
        }
      );
    }
  }
}

export function sanitizePlainText(raw, { maxLen, allowNewlines = false, fieldLabel = 'Text' }) {
  if (raw === null || raw === undefined) return '';
  if (typeof raw !== 'string') {
    throw new CustomerProfileDomainError(`${fieldLabel} must be text.`, {
      status: 400,
      code: 'INVALID_TEXT_FIELD'
    });
  }
  const stripped = allowNewlines
    ? raw.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').replace(/\r\n/g, '\n')
    : raw.replace(/[\x00-\x1F\x7F]+/g, ' ');
  const trimmed = allowNewlines
    ? stripped
        .split('\n')
        .map(line => line.replace(/[ \t]+/g, ' ').trimEnd())
        .join('\n')
        .trim()
    : stripped.replace(/\s+/g, ' ').trim();
  if ([...trimmed].length > maxLen) {
    throw new CustomerProfileDomainError(`${fieldLabel} must be ${maxLen} characters or fewer.`, {
      status: 400,
      code: 'TEXT_TOO_LONG'
    });
  }
  return trimmed;
}

export function computeSafeInitials(displayName) {
  const clean = String(displayName || '')
    .replace(/[^A-Za-z0-9 ]+/g, ' ')
    .trim();
  if (!clean) return 'BS';
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
}

export function validatePreferredTown(rawTown) {
  if (rawTown === null || rawTown === undefined || String(rawTown).trim() === '') {
    return null;
  }
  const cleaned = sanitizePlainText(rawTown, { maxLen: 60, fieldLabel: 'Preferred town/area' });
  // Guard against street addresses / precise home locations
  if (/\b\d{2,5}\s+[A-Za-z]/.test(cleaned) || /\b(st|street|ave|avenue|rd|road|apt|suite|blvd|ln|lane|dr|drive)\b\.?$/i.test(cleaned)) {
    throw new CustomerProfileDomainError(
      'Choose a coarse Sonoma County town or area rather than a street address.',
      {
        status: 400,
        code: 'PRECISE_ADDRESS_NOT_ALLOWED'
      }
    );
  }
  const canonical = SONOMA_TOWN_MAP.get(cleaned.toLowerCase());
  if (!canonical) {
    throw new CustomerProfileDomainError(
      'Select one of the supported Sonoma County towns/areas.',
      {
        status: 400,
        code: 'UNSUPPORTED_TOWN'
      }
    );
  }
  return canonical;
}

export function validateFoodInterests(rawList) {
  if (rawList === undefined || rawList === null) return [];
  if (!Array.isArray(rawList)) {
    throw new CustomerProfileDomainError('Food interests must be an array of preference keys.', {
      status: 400,
      code: 'INVALID_FOOD_INTERESTS'
    });
  }
  const deduped = [];
  const seen = new Set();
  for (const item of rawList) {
    const key = String(item || '').trim().toLowerCase();
    if (!key) continue;
    if (!FOOD_INTEREST_SET.has(key)) {
      throw new CustomerProfileDomainError(`Unsupported food interest preference "${key}".`, {
        status: 400,
        code: 'UNSUPPORTED_FOOD_INTEREST'
      });
    }
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(key);
    }
  }
  if (deduped.length > MAX_FOOD_INTERESTS) {
    throw new CustomerProfileDomainError(
      `Select up to ${MAX_FOOD_INTERESTS} food interest preferences.`,
      {
        status: 400,
        code: 'TOO_MANY_FOOD_INTERESTS'
      }
    );
  }
  return deduped;
}

export function validateAvatarStyle(rawStyle) {
  const s = String(rawStyle || 'initials_fern').trim();
  if (/^https?:/i.test(s) || s.includes('/') || s.includes('.')) {
    throw new CustomerProfileDomainError(
      'Arbitrary avatar URLs are not supported. Choose a built-in BiteShark avatar style.',
      {
        status: 400,
        code: 'ARBITRARY_AVATAR_URL_FORBIDDEN'
      }
    );
  }
  if (!AVATAR_STYLE_SET.has(s)) {
    throw new CustomerProfileDomainError('Unsupported avatar style.', {
      status: 400,
      code: 'INVALID_AVATAR_STYLE'
    });
  }
  return s;
}

export async function setOwnerProfileRlsInTx(tx, userId) {
  if (!userId || typeof userId !== 'string') {
    throw new CustomerProfileDomainError('Authenticated account required.', {
      status: 401,
      code: 'AUTH_REQUIRED'
    });
  }
  await tx.query("SELECT set_config('app.user_id', $1, true)", [userId]);
}

export async function ensureOrLoadCustomerProfileRowInTx(tx, userId) {
  await setOwnerProfileRlsInTx(tx, userId);
  const existing = await tx.query(
    `SELECT
       user_id,
       public_profile_id,
       display_name,
       bio,
       avatar_style,
       preferred_town,
       food_interests,
       communication_product_updates_opt_in,
       visibility_mode,
       allow_public_indexing,
       revision,
       created_at,
       updated_at
     FROM customer_profiles
     WHERE user_id = $1`,
    [userId]
  );
  if (existing.rows.length > 0) {
    return existing.rows[0];
  }

  const publicProfileId = generateOpaqueId('prf');
  const ins = await tx.query(
    `INSERT INTO customer_profiles (user_id, public_profile_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
     RETURNING
       user_id,
       public_profile_id,
       display_name,
       bio,
       avatar_style,
       preferred_town,
       food_interests,
       communication_product_updates_opt_in,
       visibility_mode,
       allow_public_indexing,
       revision,
       created_at,
       updated_at`,
    [userId, publicProfileId]
  );
  return ins.rows[0];
}

export async function loadCustomerSharingEligibilityInTx(tx, userId) {
  await setOwnerProfileRlsInTx(tx, userId);
  const { rows } = await tx.query(
    `SELECT eligibility_status, policy_version, assessment_basis, assessed_at, updated_at
     FROM customer_sharing_eligibility
     WHERE user_id = $1`,
    [userId]
  );
  if (rows.length === 0) {
    return {
      status: 'unknown',
      can_share: false,
      policy_version: null,
      assessment_basis: null,
      assessed_at: null,
      self_attested_disclosure:
        'Unlisted sharing requires a one-time self-attested 18+ confirmation. BiteShark checks your birth date on the server in Pacific Time without storing your date of birth; this is self-attested, not government ID verification.'
    };
  }
  const r = rows[0];
  return {
    status: r.eligibility_status,
    can_share: r.eligibility_status === 'eligible_18_plus',
    policy_version: r.policy_version,
    assessment_basis: r.assessment_basis,
    assessed_at: r.assessed_at instanceof Date ? r.assessed_at.toISOString() : String(r.assessed_at),
    self_attested_disclosure:
      'Self-attested 18+ confirmation (birth date was checked on the server in Pacific Time and is not stored; not government ID verification).'
  };
}

// ============================================================================
// 1. Explicit Allowlisted Response DTO Builders (Never leak internal fields)
// ============================================================================

export function buildPrivateOwnerProfileDto({
  profileRow,
  sharingEligibility,
  notificationSettings,
  explorationSummary,
  activityPreview,
  collectionsSummary,
  activeSharesSummary,
  featureStates
}) {
  const visitJournalVisible = featureStates?.visit_journal?.state !== 'hidden';
  const badgesVisible = visitJournalVisible && featureStates?.exploration_badges?.state !== 'hidden';
  const challengesVisible = visitJournalVisible && featureStates?.weekly_challenges?.state !== 'hidden';
  const photosVisible = featureStates?.private_photos?.state !== 'hidden';
  const trailsVisible = featureStates?.suggested_trails?.state !== 'hidden';
  const collectionsVisible = featureStates?.greatest_hits_collections?.state !== 'hidden';

  return {
    ok: true,
    profile: {
      profile_id: profileRow.public_profile_id,
      display_name: profileRow.display_name || '',
      initials: computeSafeInitials(profileRow.display_name),
      bio: profileRow.bio || '',
      avatar_style: profileRow.avatar_style || 'initials_fern',
      preferred_town: profileRow.preferred_town || null,
      visibility_mode: 'private',
      public_discovery_enabled: false,
      revision: Number(profileRow.revision || 1),
      updated_at:
        profileRow.updated_at instanceof Date
          ? profileRow.updated_at.toISOString()
          : String(profileRow.updated_at)
    },
    preferences: {
      preferred_town: profileRow.preferred_town || null,
      food_interests: Array.isArray(profileRow.food_interests) ? [...profileRow.food_interests] : [],
      communication_product_updates_opt_in: Boolean(profileRow.communication_product_updates_opt_in),
      nearby_alerts: notificationSettings
        ? {
            nearby_enabled: Boolean(notificationSettings.nearby_enabled),
            radius_miles: Number(notificationSettings.radius_miles || 3),
            feature_state: featureStates?.nearby_alert_preferences?.state || 'enabled',
            delivery_active: false,
            honest_status_note:
              'Saved to your account as a future preference only — BiteShark does not run background geolocation or send automatic nearby-vendor push alerts.'
          }
        : null,
      catalog_options: {
        supported_towns: SUPPORTED_SONOMA_TOWNS,
        supported_food_interests: SUPPORTED_FOOD_INTERESTS,
        allowed_avatar_styles: ALLOWED_AVATAR_STYLES
      },
      disclosures: {
        dietary_disclaimer:
          'Dietary tags reflect personal browsing preferences only — never an allergy-safety or cross-contact guarantee. Confirm ingredients directly with each food vendor.',
        communication_consent_note:
          'Product update preference is optional, separate from food interests, and never required to use your profile. Marketing email campaigns are not active during staging.'
      }
    },
    sharing_eligibility: sharingEligibility,
    progress: {
      visits_feature_state: featureStates?.visit_journal?.state || 'enabled',
      badges_feature_state: featureStates?.exploration_badges?.state || 'enabled',
      challenges_feature_state: featureStates?.weekly_challenges?.state || 'enabled',
      trails_feature_state: featureStates?.suggested_trails?.state || 'enabled',
      counts: {
        total_visits: visitJournalVisible ? Number(explorationSummary?.counts?.total_visits ?? 0) : null,
        distinct_businesses: visitJournalVisible ? Number(explorationSummary?.counts?.distinct_businesses ?? 0) : null,
        active_photos: photosVisible ? Number(explorationSummary?.counts?.active_photos ?? 0) : null,
        saved_trails: trailsVisible ? Number(explorationSummary?.counts?.saved_trails ?? 0) : null,
        favorites_count: Number(activityPreview?.favorites_total ?? 0)
      },
      achievements: badgesVisible ? explorationSummary?.achievements || null : null,
      weekly_challenge: challengesVisible ? explorationSummary?.weekly_challenge || null : null,
      disclosures: {
        self_reported_note:
          'Visits are self-reported personal check-ins. Points, levels, and badges are personal exploration milestones and have no cash or redeemable reward value.'
      }
    },
    activity_preview: {
      recent_visits: visitJournalVisible ? activityPreview?.recent_visits || [] : [],
      visits_total: visitJournalVisible ? Number(activityPreview?.visits_total ?? 0) : null,
      recent_photos: photosVisible ? activityPreview?.recent_photos || [] : [],
      photos_total: photosVisible ? Number(activityPreview?.photos_total ?? 0) : null,
      favorites: activityPreview?.favorites || [],
      favorites_total: Number(activityPreview?.favorites_total ?? 0),
      saved_trails: trailsVisible ? activityPreview?.saved_trails || [] : [],
      saved_trails_total: trailsVisible ? Number(activityPreview?.saved_trails_total ?? 0) : null
    },
    collections_summary: collectionsVisible
      ? {
          count: Number(collectionsSummary?.count ?? 0),
          max_collections: MAX_COLLECTIONS_PER_USER,
          items: collectionsSummary?.items || []
        }
      : {
          count: null,
          max_collections: MAX_COLLECTIONS_PER_USER,
          items: []
        },
    active_shares_summary: {
      active_count: Number(activeSharesSummary?.active_count ?? 0),
      items: activeSharesSummary?.items || []
    },
    feature_states: featureStates || {}
  };
}

export function buildPrivateOwnerCollectionDto({
  collectionRow,
  entryRows,
  catalogById,
  activeShareRows,
  attachmentById
}) {
  const entries = (entryRows || []).map(e => {
    const liveListing = e.vendor_id ? catalogById.get(e.vendor_id) || null : null;
    const attachment = e.photo_attachment_id ? attachmentById.get(e.photo_attachment_id) || null : null;
    const hasActiveAttachment =
      attachment && !attachment.revoked_at && Boolean(attachment.source_photo_active);

    return {
      entry_id: e.id,
      position: Number(e.position),
      vendor_id: e.recorded_vendor_id,
      catalog_status: liveListing ? 'available' : 'unavailable_publicly',
      display_name: liveListing ? liveListing.name : e.vendor_name_snapshot,
      historical_name_snapshot: e.vendor_name_snapshot,
      cuisine: liveListing ? liveListing.cuisine : e.vendor_cuisine_snapshot || 'Food vendor',
      town: liveListing ? liveListing.city || 'Sonoma County' : e.vendor_town_snapshot || 'Sonoma County',
      service_status_label: liveListing
        ? liveListing.isOpen
          ? liveListing.statusVerified
            ? 'Open now'
            : 'Est. open'
          : 'Currently closed / check hours'
        : 'Not currently listed in public discovery',
      can_open_detail: Boolean(liveListing),
      recommendation: e.recommendation || '',
      photo_attachment: hasActiveAttachment
        ? {
            attachment_id: attachment.id,
            source_photo_id: attachment.recorded_source_photo_id,
            moderation_status: attachment.moderation_status,
            moderation_reason: attachment.moderation_status === 'suppressed' ? attachment.suppression_reason : null,
            width: Number(attachment.width),
            height: Number(attachment.height),
            owner_thumb_url: `/api/me/photos/file?id=${encodeURIComponent(attachment.recorded_source_photo_id)}&variant=thumb`
          }
        : null
    };
  });

  return {
    collection_id: collectionRow.id,
    title: collectionRow.title,
    intro: collectionRow.intro || '',
    visibility_mode: collectionRow.visibility_mode,
    moderation_status: collectionRow.moderation_status,
    moderation_notice:
      collectionRow.moderation_status === 'suppressed'
        ? {
            suppressed: true,
            authority: collectionRow.suppression_authority || 'mod',
            reason:
              collectionRow.suppression_reason ||
              'Shared links for this collection were suppressed by moderation.',
            appeal_hint:
              'Your private collection remains visible to you. Use Help & feedback if you have questions about this moderation action.'
          }
        : null,
    revision: Number(collectionRow.revision || 1),
    entry_count: entries.length,
    max_entries: MAX_ENTRIES_PER_COLLECTION,
    entries,
    active_shares: (activeShareRows || []).map(s => ({
      share_id: s.id,
      masked_token_hint: s.masked_token_hint,
      status: s.status,
      disclosures: {
        include_display_name: Boolean(s.include_display_name),
        include_bio: Boolean(s.include_bio),
        include_preferred_area: Boolean(s.include_preferred_area),
        include_achievements: Boolean(s.include_achievements),
        include_shared_photos: Boolean(s.include_shared_photos)
      },
      expires_at: s.expires_at ? new Date(s.expires_at).toISOString() : null,
      created_at: s.created_at instanceof Date ? s.created_at.toISOString() : String(s.created_at)
    })),
    created_at:
      collectionRow.created_at instanceof Date
        ? collectionRow.created_at.toISOString()
        : String(collectionRow.created_at),
    updated_at:
      collectionRow.updated_at instanceof Date
        ? collectionRow.updated_at.toISOString()
        : String(collectionRow.updated_at)
  };
}

/**
 * Single authoritative allowlisted projection used identically by BOTH:
 *   1. `POST /api/me/collections/preview` (owner preview before/during sharing)
 *   2. `GET /s/<opaque-token>` (live recipient page)
 *
 * Physically omits email, internal user_id, age/DOB, roles, raw visit history, visit dates,
 * private notes, private photo captions, `pht_*` IDs, and unpublished business names/locations.
 */
export function buildSharedCollectionPublicDto({
  shareId = null,
  rawTokenForPhotoUrl = null,
  previewOwnerPhotoFallback = false,
  collectionRow,
  entryRows,
  catalogById,
  attachmentById,
  profileRow,
  achievementsSummary = null,
  disclosureFlags = {},
  featureStates = {}
}) {
  const showDisplayName = Boolean(disclosureFlags.include_display_name && profileRow?.display_name);
  const showBio = Boolean(disclosureFlags.include_bio && profileRow?.bio);
  const showPreferredArea = Boolean(disclosureFlags.include_preferred_area && profileRow?.preferred_town);
  const badgesFeatureEnabled =
    featureStates?.visit_journal?.state !== 'hidden' &&
    featureStates?.exploration_badges?.state !== 'hidden';
  const showAchievements = Boolean(
    disclosureFlags.include_achievements && badgesFeatureEnabled && achievementsSummary
  );
  const photosFeatureEnabled = featureStates?.shared_collection_photos?.state !== 'hidden';
  const showSharedPhotos = Boolean(disclosureFlags.include_shared_photos && photosFeatureEnabled);

  const curator = {
    included: showDisplayName || showBio || showPreferredArea || showAchievements
  };
  if (showDisplayName) {
    curator.display_name = profileRow.display_name;
    curator.avatar_style = profileRow.avatar_style || 'initials_fern';
    curator.initials = computeSafeInitials(profileRow.display_name);
  }
  if (showBio) {
    curator.bio = profileRow.bio;
  }
  if (showPreferredArea) {
    curator.preferred_town = profileRow.preferred_town;
  }
  if (showAchievements) {
    curator.achievements = {
      level_number: Number(achievementsSummary.current_level?.number || 1),
      level_title: String(achievementsSummary.current_level?.title || 'Flavor Scout'),
      total_points: Number(achievementsSummary.total_points || 0),
      unlocked_badge_titles: (achievementsSummary.badges || [])
        .filter(b => Boolean(b.earned || b.unlocked))
        .map(b => String(b.title)),
      self_reported_note: 'Self-reported exploration milestones (non-redeemable).'
    };
  }

  const publicEntries = (entryRows || []).map((e, idx) => {
    const liveListing = e.vendor_id ? catalogById.get(e.vendor_id) || null : null;
    if (!liveListing) {
      // Neutral unavailable placeholder — never leaks unpublished/deleted business names or locations
      return {
        position: idx + 1,
        available: false,
        status_code: 'unavailable',
        display_name: 'Unavailable Sonoma County food spot',
        cuisine: null,
        town: null,
        service_status_label: 'No longer listed in public discovery',
        detail_href: null,
        vendor_id: null,
        recommendation: null,
        shared_photo: null
      };
    }

    const attachment = e.photo_attachment_id ? attachmentById.get(e.photo_attachment_id) || null : null;
    const canShowPhoto =
      showSharedPhotos &&
      attachment &&
      !attachment.revoked_at &&
      attachment.moderation_status === 'active' &&
      Boolean(attachment.source_photo_active);

    let imageUrl = null;
    if (canShowPhoto) {
      if (rawTokenForPhotoUrl) {
        imageUrl = `/s/${encodeURIComponent(rawTokenForPhotoUrl)}/photo/${encodeURIComponent(attachment.id)}`;
      } else if (previewOwnerPhotoFallback && attachment.recorded_source_photo_id) {
        imageUrl = `/api/me/photos/file?id=${encodeURIComponent(attachment.recorded_source_photo_id)}&variant=main`;
      }
    }

    const factualStatus = liveListing.isOpen
      ? liveListing.statusVerified
        ? 'Open now'
        : 'Est. open · check hours'
      : 'Currently closed · check hours';

    return {
      position: idx + 1,
      available: true,
      status_code: liveListing.isOpen ? 'open_or_est' : 'closed',
      vendor_id: liveListing.id,
      display_name: liveListing.name,
      cuisine: liveListing.cuisine || 'Food spot',
      town: liveListing.city || 'Sonoma County',
      service_status_label: factualStatus,
      detail_href: `/?spot=${encodeURIComponent(liveListing.id)}`,
      recommendation: e.recommendation || '',
      shared_photo:
        canShowPhoto && imageUrl
          ? {
              attachment_id: attachment.id,
              image_url: imageUrl,
              width: Number(attachment.width),
              height: Number(attachment.height),
              alt_text: `Shared dish photo for ${liveListing.name}`
            }
          : null
    };
  });

  return {
    share_id: shareId,
    collection: {
      collection_id: collectionRow.id,
      title: collectionRow.title,
      intro: collectionRow.intro || '',
      updated_at:
        collectionRow.updated_at instanceof Date
          ? collectionRow.updated_at.toISOString()
          : String(collectionRow.updated_at),
      entry_count: publicEntries.length,
      entries: publicEntries
    },
    curator,
    disclosures: {
      recommendation_nature:
        'Personal Greatest Hits recommendations curated by a BiteShark member — not verified reviews or commercial endorsements.',
      unlisted_link_notice:
        'Unlisted shared page: anyone with this link can view or forward it until the owner revokes it.'
    }
  };
}

export function buildAdminShareModerationDto({
  collectionRow,
  shareRow,
  sharedProjection,
  reports,
  moderationEvents
}) {
  return {
    collection_id: collectionRow.id,
    share_id: shareRow ? shareRow.id : null,
    share_status: shareRow ? shareRow.status : null,
    masked_token_hint: shareRow ? shareRow.masked_token_hint : null,
    moderation_status: collectionRow.moderation_status,
    suppression_authority: collectionRow.suppression_authority || null,
    suppression_reason: collectionRow.suppression_reason || null,
    suppressed_at: collectionRow.suppressed_at
      ? new Date(collectionRow.suppressed_at).toISOString()
      : null,
    open_report_count: (reports || []).filter(r => r.status === 'open').length,
    total_report_count: (reports || []).length,
    reports: (reports || []).map(r => ({
      report_id: r.id,
      share_id: r.share_id,
      attachment_id: r.attachment_id || null,
      reason: r.reason,
      details: r.details || '',
      status: r.status,
      created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at)
    })),
    moderation_events: (moderationEvents || []).map(ev => ({
      event_id: Number(ev.id),
      action: ev.action,
      actor_authority: ev.actor_authority,
      attachment_id: ev.attachment_id || null,
      reason: ev.reason,
      created_at: ev.created_at instanceof Date ? ev.created_at.toISOString() : String(ev.created_at)
    })),
    shared_projection: sharedProjection
  };
}

// ============================================================================
// 2. Private Profile Read Model & Self-Service Privacy / Data Deletion
// ============================================================================

export async function getPrivateOwnerProfile(
  dbAdapter,
  {
    userId,
    featureStates = {},
    now = new Date()
  }
) {
  if (!userId) {
    throw new CustomerProfileDomainError('Sign in is required to view your BiteShark profile.', {
      status: 401,
      code: 'AUTH_REQUIRED'
    });
  }

  const visitJournalVisible = featureStates?.visit_journal?.state !== 'hidden';
  const badgesVisible = visitJournalVisible && featureStates?.exploration_badges?.state !== 'hidden';
  const challengesVisible = visitJournalVisible && featureStates?.weekly_challenges?.state !== 'hidden';
  const photosVisible = featureStates?.private_photos?.state !== 'hidden';
  const trailsVisible = featureStates?.suggested_trails?.state !== 'hidden';
  const collectionsVisible = featureStates?.greatest_hits_collections?.state !== 'hidden';

  const catalogResult = await loadDiscoveryCatalog(dbAdapter, { now });
  const catalogById = new Map(catalogResult.listings.map(item => [item.id, item]));

  const coreTx = await withTransaction(dbAdapter, async tx => {
    await setOwnerProfileRlsInTx(tx, userId);

    const profileRow = await ensureOrLoadCustomerProfileRowInTx(tx, userId);
    const sharingEligibility = await loadCustomerSharingEligibilityInTx(tx, userId);

    const notifRes = await tx.query(
      `SELECT nearby_enabled, radius_miles, updated_at
       FROM notification_settings
       WHERE user_id = $1`,
      [userId]
    );
    const notificationSettings = notifRes.rows[0] || {
      nearby_enabled: true,
      radius_miles: 3,
      updated_at: null
    };

    const favRes = await tx.query(
      `SELECT truck_id, created_at
       FROM favorites
       WHERE user_id = $1
       ORDER BY created_at DESC, truck_id ASC`,
      [userId]
    );

    const explorationSummary = await computeExplorationSummaryInTx(tx, {
      userId,
      now,
      showAchievements: badgesVisible,
      showWeeklyChallenge: challengesVisible,
      featureStates
    });

    let collectionsSummary = { count: 0, items: [] };
    if (collectionsVisible) {
      const colRes = await tx.query(
        `SELECT
           c.id,
           c.title,
           c.intro,
           c.visibility_mode,
           c.moderation_status,
           c.revision,
           c.updated_at,
           (SELECT COUNT(*)::int FROM customer_collection_entries ce WHERE ce.collection_id = c.id) AS entry_count,
           (SELECT COUNT(*)::int FROM customer_collection_shares cs WHERE cs.collection_id = c.id AND cs.status = 'active' AND (cs.expires_at IS NULL OR cs.expires_at > $2)) AS active_share_count
         FROM customer_collections c
         WHERE c.user_id = $1 AND c.deleted_at IS NULL
         ORDER BY c.updated_at DESC, c.id ASC
         LIMIT $3`,
        [userId, now.toISOString(), MAX_COLLECTIONS_PER_USER]
      );
      collectionsSummary = {
        count: colRes.rows.length,
        items: colRes.rows.map(r => ({
          collection_id: r.id,
          title: r.title,
          intro: r.intro || '',
          moderation_status: r.moderation_status,
          revision: Number(r.revision || 1),
          entry_count: Number(r.entry_count || 0),
          active_share_count: Number(r.active_share_count || 0),
          updated_at: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at)
        }))
      };
    }

    // Active shares remain visible for self-service revocation regardless of optional UI flags
    const sharesRes = await tx.query(
      `SELECT
         cs.id,
         cs.collection_id,
         cc.title AS collection_title,
         cs.masked_token_hint,
         cs.include_display_name,
         cs.include_bio,
         cs.include_preferred_area,
         cs.include_achievements,
         cs.include_shared_photos,
         cs.expires_at,
         cs.status,
         cs.created_at
       FROM customer_collection_shares cs
       JOIN customer_collections cc ON cc.id = cs.collection_id
       WHERE cs.user_id = $1
         AND cc.deleted_at IS NULL
         AND cs.status = 'active'
         AND (cs.expires_at IS NULL OR cs.expires_at > $2)
       ORDER BY cs.created_at DESC, cs.id ASC`,
      [userId, now.toISOString()]
    );

    // Bounded previews reusing canonical exploration services sequentially on the same `tx` client (never Promise.all on one pg.Client!)
    const visitsPreview = visitJournalVisible
      ? await listUserVisits(tx, { userId, limit: 5, offset: 0, now })
      : { visits: [], pagination: { total: 0 } };
    const photosPreview = photosVisible
      ? await listUserPhotos(tx, { userId, limit: 4, offset: 0, now })
      : { photos: [] };
    const trailsPreview = trailsVisible
      ? await listUserSavedTrails(tx, { userId, limit: 4, offset: 0, now })
      : { trails: [], pagination: { total: 0 } };

    return {
      profileRow,
      sharingEligibility,
      notificationSettings,
      favRows: favRes.rows,
      explorationSummary,
      collectionsSummary,
      activeShareRows: sharesRes.rows,
      visitsPreview,
      photosPreview,
      trailsPreview
    };
  });

  const { visitsPreview, photosPreview, trailsPreview } = coreTx;

  const resolvedFavorites = [];
  for (const f of coreTx.favRows) {
    const live = catalogById.get(f.truck_id);
    if (!live) continue;
    resolvedFavorites.push({
      vendor_id: live.id,
      name: live.name,
      cuisine: live.cuisine || 'Food spot',
      town: live.city || 'Sonoma County',
      service_status_label: live.isOpen
        ? live.statusVerified
          ? 'Open now'
          : 'Est. open'
        : 'Check hours',
      saved_at: f.created_at instanceof Date ? f.created_at.toISOString() : String(f.created_at)
    });
  }

  return buildPrivateOwnerProfileDto({
    profileRow: coreTx.profileRow,
    sharingEligibility: coreTx.sharingEligibility,
    notificationSettings: coreTx.notificationSettings,
    explorationSummary: coreTx.explorationSummary,
    activityPreview: {
      recent_visits: visitsPreview.visits || [],
      visits_total: Number(visitsPreview.pagination?.total ?? coreTx.explorationSummary?.counts?.total_visits ?? 0),
      recent_photos: (photosPreview.photos || []).slice(0, 4),
      photos_total: Number(coreTx.explorationSummary?.counts?.active_photos ?? 0),
      favorites: resolvedFavorites.slice(0, 6),
      favorites_total: resolvedFavorites.length,
      saved_trails: (trailsPreview.trails || []).slice(0, 4),
      saved_trails_total: Number(trailsPreview.pagination?.total ?? coreTx.explorationSummary?.counts?.saved_trails ?? 0)
    },
    collectionsSummary: coreTx.collectionsSummary,
    activeSharesSummary: {
      active_count: coreTx.activeShareRows.length,
      items: coreTx.activeShareRows.map(s => ({
        share_id: s.id,
        collection_id: s.collection_id,
        collection_title: s.collection_title,
        masked_token_hint: s.masked_token_hint,
        disclosures: {
          include_display_name: Boolean(s.include_display_name),
          include_bio: Boolean(s.include_bio),
          include_preferred_area: Boolean(s.include_preferred_area),
          include_achievements: Boolean(s.include_achievements),
          include_shared_photos: Boolean(s.include_shared_photos)
        },
        expires_at: s.expires_at ? new Date(s.expires_at).toISOString() : null,
        created_at: s.created_at instanceof Date ? s.created_at.toISOString() : String(s.created_at)
      }))
    },
    featureStates
  });
}

/**
 * Independent Privacy, Export & Share-Revocation Overview (`/api/me/profile/privacy`).
 * Remains accessible even when optional `customer_profile` or `greatest_hits_collections` UI is hidden!
 */
export async function exportCustomerProfileAndExplorationArchive(
  dbAdapter,
  { userId, now = new Date() }
) {
  if (!userId) {
    throw new CustomerProfileDomainError('Sign in is required.', {
      status: 401,
      code: 'AUTH_REQUIRED'
    });
  }

  const explorationArchive = await exportUserExplorationData(dbAdapter, { userId, now });

  const profileData = await withTransaction(dbAdapter, async tx => {
    await setOwnerProfileRlsInTx(tx, userId);
    const profRes = await tx.query(
      `SELECT public_profile_id, display_name, bio, avatar_style, preferred_town, food_interests,
              communication_product_updates_opt_in, visibility_mode, revision, created_at, updated_at
       FROM customer_profiles
       WHERE user_id = $1`,
      [userId]
    );
    const elig = await loadCustomerSharingEligibilityInTx(tx, userId);
    const colsRes = await tx.query(
      `SELECT id, title, intro, visibility_mode, moderation_status, revision, created_at, updated_at
       FROM customer_collections
       WHERE user_id = $1 AND deleted_at IS NULL
       ORDER BY created_at ASC`,
      [userId]
    );
    const entriesRes = await tx.query(
      `SELECT id, collection_id, position, recorded_vendor_id, vendor_name_snapshot,
              vendor_town_snapshot, vendor_cuisine_snapshot, recommendation, photo_attachment_id, created_at
       FROM customer_collection_entries
       WHERE user_id = $1
       ORDER BY collection_id ASC, position ASC`,
      [userId]
    );
    const sharesRes = await tx.query(
      `SELECT id, collection_id, masked_token_hint, include_display_name, include_bio,
              include_preferred_area, include_achievements, include_shared_photos,
              expires_at, status, revoked_at, created_at
       FROM customer_collection_shares
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );
    return {
      profile: profRes.rows[0] || null,
      sharing_eligibility: elig,
      collections: colsRes.rows,
      collection_entries: entriesRes.rows,
      share_grants: sharesRes.rows
    };
  });

  return {
    ok: true,
    exported_at: now.toISOString(),
    scope_notice:
      'Contains your BiteShark exploration records, private profile preferences, Greatest Hits collections, and non-secret share-link records. Use each photo download_url while signed in to download private image files.',
    account_deletion_notice:
      'Self-service deletion removes optional profile, collection, share-link, visit, photo, and saved-trail data without deleting your core login account, bookings, vendor roles, or support tickets. Submit a Privacy / Account Request in Help & feedback for full account review.',
    profile: profileData.profile
      ? {
          profile_id: profileData.profile.public_profile_id,
          display_name: profileData.profile.display_name,
          bio: profileData.profile.bio,
          avatar_style: profileData.profile.avatar_style,
          preferred_town: profileData.profile.preferred_town,
          food_interests: profileData.profile.food_interests || [],
          communication_product_updates_opt_in: Boolean(
            profileData.profile.communication_product_updates_opt_in
          ),
          visibility_mode: profileData.profile.visibility_mode,
          updated_at:
            profileData.profile.updated_at instanceof Date
              ? profileData.profile.updated_at.toISOString()
              : String(profileData.profile.updated_at)
        }
      : null,
    sharing_eligibility: {
      status: profileData.sharing_eligibility.status,
      policy_version: profileData.sharing_eligibility.policy_version,
      assessed_at: profileData.sharing_eligibility.assessed_at
    },
    collections: profileData.collections.map(c => ({
      collection_id: c.id,
      title: c.title,
      intro: c.intro,
      visibility_mode: c.visibility_mode,
      moderation_status: c.moderation_status,
      entries: profileData.collection_entries
        .filter(e => e.collection_id === c.id)
        .map(e => ({
          position: Number(e.position),
          vendor_id: e.recorded_vendor_id,
          vendor_name_snapshot: e.vendor_name_snapshot,
          recommendation: e.recommendation
        })),
      created_at: c.created_at instanceof Date ? c.created_at.toISOString() : String(c.created_at),
      updated_at: c.updated_at instanceof Date ? c.updated_at.toISOString() : String(c.updated_at)
    })),
    share_grants: profileData.share_grants.map(s => ({
      share_id: s.id,
      collection_id: s.collection_id,
      masked_token_hint: s.masked_token_hint,
      status: s.status,
      disclosures: {
        include_display_name: Boolean(s.include_display_name),
        include_bio: Boolean(s.include_bio),
        include_preferred_area: Boolean(s.include_preferred_area),
        include_achievements: Boolean(s.include_achievements),
        include_shared_photos: Boolean(s.include_shared_photos)
      },
      expires_at: s.expires_at ? new Date(s.expires_at).toISOString() : null,
      revoked_at: s.revoked_at ? new Date(s.revoked_at).toISOString() : null,
      created_at: s.created_at instanceof Date ? s.created_at.toISOString() : String(s.created_at)
    })),
    exploration: explorationArchive
  };
}

/**
 * Self-service deletion of optional profile, Greatest Hits collections, and active share links
 * (distinct fromexploration deletion and distinct from full core account deletion).
 */
export async function clearCustomerProfileAndCollectionsData(
  dbAdapter,
  { userId, storageRoot = resolvePhotoStorageRoot(), includeExplorationData = false }
) {
  if (!userId) {
    throw new CustomerProfileDomainError('Sign in is required.', {
      status: 401,
      code: 'AUTH_REQUIRED'
    });
  }

  const txOut = await withTransaction(dbAdapter, async tx => {
    await setOwnerProfileRlsInTx(tx, userId);
    await tx.query("SELECT pg_advisory_xact_lock(hashtext('bs_cust_profile_del:' || $1))", [userId]);

    const sharesRevoked = await tx.query(
      `UPDATE customer_collection_shares
       SET status = 'revoked', revoked_at = now(), revoke_reason = 'owner_data_clear', updated_at = now()
       WHERE user_id = $1 AND status = 'active'
       RETURNING id`,
      [userId]
    );

    const attRevoked = await tx.query(
      `UPDATE customer_collection_photo_attachments
       SET revoked_at = now()
       WHERE user_id = $1 AND revoked_at IS NULL
       RETURNING id, shared_rel_path`,
      [userId]
    );

    await tx.query(`DELETE FROM customer_collection_entries WHERE user_id = $1`, [userId]);

    const colsDeleted = await tx.query(
      `UPDATE customer_collections
       SET deleted_at = now(), visibility_mode = 'private', updated_at = now()
       WHERE user_id = $1 AND deleted_at IS NULL
       RETURNING id`,
      [userId]
    );

    await tx.query(`DELETE FROM customer_profiles WHERE user_id = $1`, [userId]);

    let deletedVisits = 0;
    let deletedTrails = 0;
    let deletedPhotos = [];
    if (includeExplorationData) {
      const vRes = await tx.query(
        `UPDATE customer_visits SET deleted_at = now() WHERE user_id = $1 AND deleted_at IS NULL RETURNING id`,
        [userId]
      );
      deletedVisits = vRes.rowCount || 0;
      const tRes = await tx.query(
        `UPDATE customer_saved_trails SET deleted_at = now() WHERE user_id = $1 AND deleted_at IS NULL RETURNING id`,
        [userId]
      );
      deletedTrails = tRes.rowCount || 0;
      const pRes = await tx.query(
        `UPDATE customer_photos SET deleted_at = now() WHERE user_id = $1 AND deleted_at IS NULL RETURNING id, storage_rel_path, thumb_rel_path`,
        [userId]
      );
      deletedPhotos = pRes.rows;
    }

    return {
      revoked_shares_count: sharesRevoked.rowCount || 0,
      deleted_collections_count: colsDeleted.rowCount || 0,
      revoked_attachments: attRevoked.rows,
      deleted_visits_count: deletedVisits,
      deleted_trails_count: deletedTrails,
      deleted_photos: deletedPhotos
    };
  });

  // Best-effort immediate unlink of any revoked shared derivatives & private photos (backed up by `reconcilePhotoStorage`)
  const { deletePhotoFilesSafely, unlinkConfinedPhotoArtifact } = await import('./photo-storage.js');
  for (const att of txOut.revoked_attachments) {
    if (att.shared_rel_path) {
      unlinkConfinedPhotoArtifact({ storageRoot, relPath: att.shared_rel_path });
    }
  }
  for (const p of txOut.deleted_photos) {
    deletePhotoFilesSafely({
      storageRoot,
      storageRelPath: p.storage_rel_path,
      thumbRelPath: p.thumb_rel_path
    });
  }

  return {
    ok: true,
    revoked_shares_count: txOut.revoked_shares_count,
    deleted_collections_count: txOut.deleted_collections_count,
    deleted_visits_count: txOut.deleted_visits_count,
    deleted_trails_count: txOut.deleted_trails_count,
    deleted_photos_count: txOut.deleted_photos.length,
    backup_retention_note:
      'Active database records and live photo files were removed immediately; encrypted operational backups retain historical snapshots for up to 7 days before automatic rotation.',
    account_status_note:
      'Your BiteShark sign-in account, bookings, vendor memberships, and support tickets remain active.'
  };
}

// ============================================================================
// 3. Profile Overview & Account-Backed Preference Mutations (Commit 2)
// ============================================================================

function parseOptionalExpectedRevision(raw) {
  if (raw === undefined || raw === null) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw new CustomerProfileDomainError('expected_revision must be a positive integer.', {
      status: 400,
      code: 'INVALID_EXPECTED_REVISION'
    });
  }
  return n;
}

export async function updatePrivateOwnerProfile(
  dbAdapter,
  { userId, body = {}, featureStates = {}, now = new Date() }
) {
  if (!userId) {
    throw new CustomerProfileDomainError('Sign in is required.', {
      status: 401,
      code: 'AUTH_REQUIRED'
    });
  }
  assertNoForbiddenClientWriteFields(body);

  const expectedRevision = parseOptionalExpectedRevision(body.expected_revision);
  const hasDisplayName = Object.prototype.hasOwnProperty.call(body, 'display_name');
  const hasBio = Object.prototype.hasOwnProperty.call(body, 'bio');
  const hasAvatarStyle = Object.prototype.hasOwnProperty.call(body, 'avatar_style');
  const hasPreferredTown = Object.prototype.hasOwnProperty.call(body, 'preferred_town');

  const nextDisplayName = hasDisplayName
    ? sanitizePlainText(body.display_name, { maxLen: MAX_DISPLAY_NAME_LENGTH, fieldLabel: 'Display name' })
    : undefined;
  const nextBio = hasBio
    ? sanitizePlainText(body.bio, { maxLen: MAX_BIO_LENGTH, allowNewlines: true, fieldLabel: 'Short bio' })
    : undefined;
  const nextAvatarStyle = hasAvatarStyle ? validateAvatarStyle(body.avatar_style) : undefined;
  const nextPreferredTown = hasPreferredTown ? validatePreferredTown(body.preferred_town) : undefined;

  await withTransaction(dbAdapter, async tx => {
    await setOwnerProfileRlsInTx(tx, userId);
    await tx.query("SELECT pg_advisory_xact_lock(hashtext('bs_cust_profile:' || $1))", [userId]);

    const current = await ensureOrLoadCustomerProfileRowInTx(tx, userId);
    if (expectedRevision !== null && Number(current.revision) !== expectedRevision) {
      throw new CustomerProfileDomainError(
        'Your profile was updated in another tab or device. Refresh to review the latest version before saving.',
        {
          status: 409,
          code: 'PROFILE_REVISION_CONFLICT',
          details: { current_revision: Number(current.revision) }
        }
      );
    }

    await tx.query(
      `UPDATE customer_profiles
       SET display_name = $2,
           bio = $3,
           avatar_style = $4,
           preferred_town = $5,
           revision = revision + 1,
           updated_at = $6
       WHERE user_id = $1`,
      [
        userId,
        nextDisplayName !== undefined ? nextDisplayName : current.display_name,
        nextBio !== undefined ? nextBio : current.bio,
        nextAvatarStyle !== undefined ? nextAvatarStyle : current.avatar_style,
        nextPreferredTown !== undefined ? nextPreferredTown : current.preferred_town,
        now.toISOString()
      ]
    );
  });

  return getPrivateOwnerProfile(dbAdapter, { userId, featureStates, now });
}
export async function updateCustomerPreferences(
  dbAdapter,
  { userId, body = {}, featureStates = {}, now = new Date() }
) {
  if (!userId) {
    throw new CustomerProfileDomainError('Sign in is required.', {
      status: 401,
      code: 'AUTH_REQUIRED'
    });
  }
  assertNoForbiddenClientWriteFields(body);

  const expectedRevision = parseOptionalExpectedRevision(body.expected_revision);
  const hasPreferredTown = Object.prototype.hasOwnProperty.call(body, 'preferred_town');
  const hasFoodInterests = Object.prototype.hasOwnProperty.call(body, 'food_interests');
  const hasCommOptIn = Object.prototype.hasOwnProperty.call(
    body,
    'communication_product_updates_opt_in'
  );
  const hasNearbyAlerts =
    body.nearby_alerts !== undefined && body.nearby_alerts !== null;

  const nextPreferredTown = hasPreferredTown ? validatePreferredTown(body.preferred_town) : undefined;
  const nextFoodInterests = hasFoodInterests ? validateFoodInterests(body.food_interests) : undefined;
  if (hasCommOptIn && typeof body.communication_product_updates_opt_in !== 'boolean') {
    throw new CustomerProfileDomainError(
      'communication_product_updates_opt_in must be true or false.',
      {
        status: 400,
        code: 'INVALID_COMMUNICATION_CONSENT'
      }
    );
  }

  let parsedNearby = null;
  if (hasNearbyAlerts) {
    const nearbyState = featureStates?.nearby_alert_preferences?.state || 'enabled';
    if (nearbyState === 'paused') {
      throw new CustomerProfileDomainError(
        featureStates?.nearby_alert_preferences?.message ||
          'Nearby alert preference updates are temporarily paused.',
        {
          status: 503,
          code: 'FEATURE_PAUSED',
          retryable: true
        }
      );
    }
    if (nearbyState === 'hidden') {
      throw new CustomerProfileDomainError('Nearby alert preferences are currently unavailable.', {
        status: 403,
        code: 'FEATURE_DISABLED'
      });
    }
    if (typeof body.nearby_alerts !== 'object' || Array.isArray(body.nearby_alerts)) {
      throw new CustomerProfileDomainError('nearby_alerts must be an object.', {
        status: 400,
        code: 'INVALID_NEARBY_ALERTS'
      });
    }
    const radius = Number(body.nearby_alerts.radius_miles);
    if (
      typeof body.nearby_alerts.nearby_enabled !== 'boolean' ||
      !Number.isInteger(radius) ||
      radius < 1 ||
      radius > 30
    ) {
      throw new CustomerProfileDomainError(
        'Nearby alert preferences require nearby_enabled (boolean) and radius_miles between 1 and 30.',
        {
          status: 400,
          code: 'INVALID_NEARBY_ALERTS'
        }
      );
    }
    parsedNearby = {
      nearby_enabled: body.nearby_alerts.nearby_enabled,
      radius_miles: radius
    };
  }

  await withTransaction(dbAdapter, async tx => {
    await setOwnerProfileRlsInTx(tx, userId);
    await tx.query("SELECT pg_advisory_xact_lock(hashtext('bs_cust_profile:' || $1))", [userId]);

    const current = await ensureOrLoadCustomerProfileRowInTx(tx, userId);
    if (expectedRevision !== null && Number(current.revision) !== expectedRevision) {
      throw new CustomerProfileDomainError(
        'Your preferences were updated in another tab or device. Refresh before saving.',
        {
          status: 409,
          code: 'PROFILE_REVISION_CONFLICT',
          details: { current_revision: Number(current.revision) }
        }
      );
    }

    await tx.query(
      `UPDATE customer_profiles
       SET preferred_town = $2,
           food_interests = $3::text[],
           communication_product_updates_opt_in = $4,
           revision = revision + 1,
           updated_at = $5
       WHERE user_id = $1`,
      [
        userId,
        nextPreferredTown !== undefined ? nextPreferredTown : current.preferred_town,
        nextFoodInterests !== undefined ? nextFoodInterests : current.food_interests || [],
        hasCommOptIn
          ? body.communication_product_updates_opt_in
          : Boolean(current.communication_product_updates_opt_in),
        now.toISOString()
      ]
    );

    if (parsedNearby) {
      await tx.query(
        `INSERT INTO notification_settings (user_id, nearby_enabled, radius_miles, updated_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id) DO UPDATE
           SET nearby_enabled = EXCLUDED.nearby_enabled,
               radius_miles = EXCLUDED.radius_miles,
               updated_at = EXCLUDED.updated_at`,
        [userId, parsedNearby.nearby_enabled, parsedNearby.radius_miles, now.toISOString()]
      );
    }
  });

  return getPrivateOwnerProfile(dbAdapter, { userId, featureStates, now });
}

// ============================================================================
// 4. Greatest Hits Curated Collections CRUD & Ordering (Commit 3)
// ============================================================================

function normalizeOptionalIdempotencyKey(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return null;
  const s = String(raw).trim();
  if (s.length < 8 || s.length > 128 || !/^[A-Za-z0-9_.:-]+$/.test(s)) {
    throw new CustomerProfileDomainError('Invalid idempotency_key format.', {
      status: 400,
      code: 'INVALID_IDEMPOTENCY_KEY'
    });
  }
  return s;
}

export function computeCollectionContentDigest({ title, intro, entries }) {
  const canonical = JSON.stringify({
    title: String(title || '').trim(),
    intro: String(intro || '').trim(),
    entries: (entries || []).map(e => ({
      v: String(e.recorded_vendor_id || e.vendor_id || ''),
      r: String(e.recommendation || '').trim(),
      p: String(e.attachment_sha256 || e.photo_attachment_id || '')
    }))
  });
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

export async function loadCollectionHydratedInTx(tx, { userId, collectionId, catalogById, now = new Date() }) {
  await setOwnerProfileRlsInTx(tx, userId);
  const colRes = await tx.query(
    `SELECT
       id, user_id, title, intro, visibility_mode, moderation_status,
       suppressed_at, suppressed_by, suppression_authority, suppression_reason,
       suppressed_content_sha256, revision, idempotency_key, created_at, updated_at
     FROM customer_collections
     WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [collectionId, userId]
  );
  if (colRes.rows.length === 0) {
    throw new CustomerProfileDomainError('Collection was not found.', {
      status: 404,
      code: 'COLLECTION_NOT_FOUND'
    });
  }
  const collectionRow = colRes.rows[0];

  const entriesRes = await tx.query(
    `SELECT
       id, collection_id, user_id, position, vendor_id, recorded_vendor_id,
       vendor_name_snapshot, vendor_town_snapshot, vendor_cuisine_snapshot,
       recommendation, photo_attachment_id, created_at, updated_at
     FROM customer_collection_entries
     WHERE collection_id = $1 AND user_id = $2
     ORDER BY position ASC, id ASC`,
    [collectionId, userId]
  );

  const attRes = await tx.query(
    `SELECT
       pa.id, pa.collection_id, pa.user_id, pa.source_photo_id, pa.recorded_source_photo_id,
       pa.shared_rel_path, pa.mime_type, pa.byte_size, pa.width, pa.height,
       pa.moderation_status, pa.suppression_reason, pa.revoked_at,
       (cp.id IS NOT NULL AND cp.deleted_at IS NULL) AS source_photo_active
     FROM customer_collection_photo_attachments pa
     LEFT JOIN customer_photos cp ON cp.id = pa.source_photo_id
     WHERE pa.collection_id = $1 AND pa.user_id = $2`,
    [collectionId, userId]
  );
  const attachmentById = new Map(attRes.rows.map(a => [a.id, a]));

  const sharesRes = await tx.query(
    `SELECT
       id, collection_id, masked_token_hint,
       include_display_name, include_bio, include_preferred_area,
       include_achievements, include_shared_photos,
       expires_at, status, created_at
     FROM customer_collection_shares
     WHERE collection_id = $1
       AND user_id = $2
       AND status = 'active'
       AND (expires_at IS NULL OR expires_at > $3)
     ORDER BY created_at DESC, id ASC`,
    [collectionId, userId, now.toISOString()]
  );

  return buildPrivateOwnerCollectionDto({
    collectionRow,
    entryRows: entriesRes.rows,
    catalogById,
    activeShareRows: sharesRes.rows,
    attachmentById
  });
}

export async function listOwnerCollections(dbAdapter, { userId, now = new Date() }) {
  if (!userId) {
    throw new CustomerProfileDomainError('Sign in is required.', {
      status: 401,
      code: 'AUTH_REQUIRED'
    });
  }
  const catalogResult = await loadDiscoveryCatalog(dbAdapter, { now });
  const catalogById = new Map(catalogResult.listings.map(item => [item.id, item]));

  return withTransaction(dbAdapter, async tx => {
    await setOwnerProfileRlsInTx(tx, userId);
    const idsRes = await tx.query(
      `SELECT id
       FROM customer_collections
       WHERE user_id = $1 AND deleted_at IS NULL
       ORDER BY updated_at DESC, id ASC
       LIMIT $2`,
      [userId, MAX_COLLECTIONS_PER_USER]
    );
    const collections = [];
    for (const row of idsRes.rows) {
      const dto = await loadCollectionHydratedInTx(tx, {
        userId,
        collectionId: row.id,
        catalogById,
        now
      });
      collections.push(dto);
    }
    return {
      ok: true,
      collections,
      max_collections: MAX_COLLECTIONS_PER_USER,
      max_entries_per_collection: MAX_ENTRIES_PER_COLLECTION
    };
  });
}

export async function getOwnerCollectionDetail(
  dbAdapter,
  { userId, collectionId, now = new Date() }
) {
  if (!userId) {
    throw new CustomerProfileDomainError('Sign in is required.', {
      status: 401,
      code: 'AUTH_REQUIRED'
    });
  }
  const cleanId = String(collectionId || '').trim();
  if (!/^col_[a-f0-9]{24,40}$/.test(cleanId)) {
    throw new CustomerProfileDomainError('Invalid collection identifier.', {
      status: 400,
      code: 'INVALID_COLLECTION_ID'
    });
  }
  const catalogResult = await loadDiscoveryCatalog(dbAdapter, { now });
  const catalogById = new Map(catalogResult.listings.map(item => [item.id, item]));

  const collection = await withTransaction(dbAdapter, tx =>
    loadCollectionHydratedInTx(tx, { userId, collectionId: cleanId, catalogById, now })
  );
  return { ok: true, collection };
}

function validateAndResolveRequestedEntries(rawEntries, { catalogById, existingByVendorId }) {
  if (rawEntries === undefined) return null;
  if (!Array.isArray(rawEntries)) {
    throw new CustomerProfileDomainError('entries must be an array.', {
      status: 400,
      code: 'INVALID_ENTRIES_ARRAY'
    });
  }
  if (rawEntries.length > MAX_ENTRIES_PER_COLLECTION) {
    throw new CustomerProfileDomainError(
      `Each Greatest Hits collection supports up to ${MAX_ENTRIES_PER_COLLECTION} businesses.`,
      {
        status: 400,
        code: 'ENTRY_LIMIT_EXCEEDED'
      }
    );
  }

  const seenVendors = new Set();
  const normalized = [];

  for (let i = 0; i < rawEntries.length; i++) {
    const item = rawEntries[i];
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new CustomerProfileDomainError('Each collection entry must be an object.', {
        status: 400,
        code: 'INVALID_ENTRY_OBJECT'
      });
    }
    assertNoForbiddenClientWriteFields(item);
    const vendorId = String(item.vendor_id || '').trim();
    if (!vendorId || vendorId.length > 80 || !/^[a-zA-Z0-9_-]+$/.test(vendorId)) {
      throw new CustomerProfileDomainError('Each entry requires a valid canonical vendor_id.', {
        status: 400,
        code: 'INVALID_VENDOR_ID'
      });
    }
    if (seenVendors.has(vendorId)) {
      throw new CustomerProfileDomainError(
        `Duplicate business "${vendorId}" in the same collection is not allowed.`,
        {
          status: 400,
          code: 'DUPLICATE_COLLECTION_ENTRY'
        }
      );
    }
    seenVendors.add(vendorId);

    const recommendation = sanitizePlainText(item.recommendation ?? '', {
      maxLen: MAX_ENTRY_RECOMMENDATION_LENGTH,
      allowNewlines: true,
      fieldLabel: 'Recommendation'
    });

    const live = catalogById.get(vendorId) || null;
    const prev = existingByVendorId.get(vendorId) || null;

    if (!live && !prev) {
      throw new CustomerProfileDomainError(
        `Business "${vendorId}" is not available in BiteShark's public Sonoma County catalog.`,
        {
          status: 400,
          code: 'UNKNOWN_OR_UNPUBLISHED_VENDOR'
        }
      );
    }

    const photoAttId =
      item.photo_attachment_id !== undefined
        ? item.photo_attachment_id
          ? String(item.photo_attachment_id).trim()
          : null
        : prev
          ? prev.photo_attachment_id || null
          : null;

    if (photoAttId && !/^sha_[a-f0-9]{24,40}$/.test(photoAttId)) {
      throw new CustomerProfileDomainError('Invalid photo_attachment_id format.', {
        status: 400,
        code: 'INVALID_PHOTO_ATTACHMENT_ID'
      });
    }

    normalized.push({
      position: i + 1,
      vendor_id: live ? live.id : prev.vendor_id || null,
      recorded_vendor_id: vendorId,
      vendor_name_snapshot: live ? live.name : prev.vendor_name_snapshot,
      vendor_town_snapshot: live ? live.city || 'Sonoma County' : prev.vendor_town_snapshot,
      vendor_cuisine_snapshot: live ? live.cuisine || 'Food spot' : prev.vendor_cuisine_snapshot,
      recommendation,
      photo_attachment_id: photoAttId,
      existing_entry_id: prev ? prev.id : null
    });
  }

  return normalized;
}

export async function createOwnerCollection(
  dbAdapter,
  { userId, body = {}, now = new Date() }
) {
  if (!userId) {
    throw new CustomerProfileDomainError('Sign in is required.', {
      status: 401,
      code: 'AUTH_REQUIRED'
    });
  }
  assertNoForbiddenClientWriteFields(body, ['collection_id']);

  const title = sanitizePlainText(body.title, {
    maxLen: MAX_COLLECTION_TITLE_LENGTH,
    fieldLabel: 'Collection title'
  });
  if (!title) {
    throw new CustomerProfileDomainError('Enter a collection title (1 to 100 characters).', {
      status: 400,
      code: 'INVALID_COLLECTION_TITLE'
    });
  }
  const intro = sanitizePlainText(body.intro ?? '', {
    maxLen: MAX_COLLECTION_INTRO_LENGTH,
    allowNewlines: true,
    fieldLabel: 'Collection introduction'
  });
  const idemKey = normalizeOptionalIdempotencyKey(body.idempotency_key);

  const catalogResult = await loadDiscoveryCatalog(dbAdapter, { now });
  const catalogById = new Map(catalogResult.listings.map(item => [item.id, item]));
  const requestedEntries = validateAndResolveRequestedEntries(body.entries || [], {
    catalogById,
    existingByVendorId: new Map()
  });

  return withTransaction(dbAdapter, async tx => {
    await setOwnerProfileRlsInTx(tx, userId);
    await tx.query("SELECT pg_advisory_xact_lock(hashtext('bs_cust_cols:' || $1))", [userId]);

    if (idemKey) {
      const idemRes = await tx.query(
        `SELECT id, deleted_at
         FROM customer_collections
         WHERE user_id = $1 AND idempotency_key = $2`,
        [userId, idemKey]
      );
      if (idemRes.rows.length > 0 && !idemRes.rows[0].deleted_at) {
        const existingDto = await loadCollectionHydratedInTx(tx, {
          userId,
          collectionId: idemRes.rows[0].id,
          catalogById,
          now
        });
        return { ok: true, idempotent_replay: true, collection: existingDto };
      }
      if (idemRes.rows.length > 0 && idemRes.rows[0].deleted_at) {
        await tx.query(
          `UPDATE customer_collections SET idempotency_key = NULL WHERE id = $1 AND user_id = $2 AND deleted_at IS NOT NULL`,
          [idemRes.rows[0].id, userId]
        );
      }
    }

    const activeCountRes = await tx.query(
      `SELECT COUNT(*)::int AS cnt
       FROM customer_collections
       WHERE user_id = $1 AND deleted_at IS NULL`,
      [userId]
    );
    if (Number(activeCountRes.rows[0]?.cnt || 0) >= MAX_COLLECTIONS_PER_USER) {
      throw new CustomerProfileDomainError(
        `You can keep up to ${MAX_COLLECTIONS_PER_USER} Greatest Hits collections per account. Delete or edit an existing collection first.`,
        {
          status: 409,
          code: 'COLLECTION_LIMIT_REACHED'
        }
      );
    }

    const colId = generateOpaqueId('col');
    await tx.query(
      `INSERT INTO customer_collections (
         id, user_id, title, intro, visibility_mode, revision, idempotency_key, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, 'private', 1, $5, $6, $6)`,
      [colId, userId, title, intro, idemKey, now.toISOString()]
    );

    for (const ent of requestedEntries || []) {
      await tx.query(
        `INSERT INTO customer_collection_entries (
           id, collection_id, user_id, position, vendor_id, recorded_vendor_id,
           vendor_name_snapshot, vendor_town_snapshot, vendor_cuisine_snapshot,
           recommendation, photo_attachment_id, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NULL, $11, $11)`,
        [
          generateOpaqueId('cle'),
          colId,
          userId,
          ent.position,
          ent.vendor_id,
          ent.recorded_vendor_id,
          ent.vendor_name_snapshot,
          ent.vendor_town_snapshot,
          ent.vendor_cuisine_snapshot,
          ent.recommendation,
          now.toISOString()
        ]
      );
    }

    const dto = await loadCollectionHydratedInTx(tx, {
      userId,
      collectionId: colId,
      catalogById,
      now
    });
    return { ok: true, idempotent_replay: false, collection: dto };
  });
}

export async function updateOwnerCollection(
  dbAdapter,
  { userId, body = {}, now = new Date() }
) {
  if (!userId) {
    throw new CustomerProfileDomainError('Sign in is required.', {
      status: 401,
      code: 'AUTH_REQUIRED'
    });
  }
  assertNoForbiddenClientWriteFields(body);

  const collectionId = String(body.collection_id || '').trim();
  if (!/^col_[a-f0-9]{24,40}$/.test(collectionId)) {
    throw new CustomerProfileDomainError('Valid collection_id is required.', {
      status: 400,
      code: 'INVALID_COLLECTION_ID'
    });
  }
  const expectedRevision = parseOptionalExpectedRevision(body.expected_revision);
  if (expectedRevision === null) {
    throw new CustomerProfileDomainError('expected_revision is required for collection updates.', {
      status: 400,
      code: 'EXPECTED_REVISION_REQUIRED'
    });
  }

  const catalogResult = await loadDiscoveryCatalog(dbAdapter, { now });
  const catalogById = new Map(catalogResult.listings.map(item => [item.id, item]));

  return withTransaction(dbAdapter, async tx => {
    await setOwnerProfileRlsInTx(tx, userId);
    await tx.query("SELECT pg_advisory_xact_lock(hashtext('bs_cust_col:' || $1))", [collectionId]);

    const curColRes = await tx.query(
      `SELECT id, title, intro, visibility_mode, moderation_status, revision
       FROM customer_collections
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
       FOR UPDATE`,
      [collectionId, userId]
    );
    if (curColRes.rows.length === 0) {
      throw new CustomerProfileDomainError('Collection was not found.', {
        status: 404,
        code: 'COLLECTION_NOT_FOUND'
      });
    }
    const curCol = curColRes.rows[0];
    if (Number(curCol.revision) !== expectedRevision) {
      throw new CustomerProfileDomainError(
        'This collection was modified in another tab or device. Reload the latest version before saving.',
        {
          status: 409,
          code: 'COLLECTION_REVISION_CONFLICT',
          details: { current_revision: Number(curCol.revision) }
        }
      );
    }

    const nextTitle = Object.prototype.hasOwnProperty.call(body, 'title')
      ? sanitizePlainText(body.title, {
          maxLen: MAX_COLLECTION_TITLE_LENGTH,
          fieldLabel: 'Collection title'
        })
      : curCol.title;
    if (!nextTitle) {
      throw new CustomerProfileDomainError('Collection title cannot be empty.', {
        status: 400,
        code: 'INVALID_COLLECTION_TITLE'
      });
    }

    const nextIntro = Object.prototype.hasOwnProperty.call(body, 'intro')
      ? sanitizePlainText(body.intro ?? '', {
          maxLen: MAX_COLLECTION_INTRO_LENGTH,
          allowNewlines: true,
          fieldLabel: 'Collection introduction'
        })
      : curCol.intro;

    const existingEntriesRes = await tx.query(
      `SELECT id, vendor_id, recorded_vendor_id, vendor_name_snapshot, vendor_town_snapshot,
              vendor_cuisine_snapshot, recommendation, photo_attachment_id
       FROM customer_collection_entries
       WHERE collection_id = $1 AND user_id = $2
       ORDER BY position ASC`,
      [collectionId, userId]
    );
    const existingByVendorId = new Map(
      existingEntriesRes.rows.map(r => [r.recorded_vendor_id, r])
    );

    const resolvedEntries =
      body.entries !== undefined
        ? validateAndResolveRequestedEntries(body.entries, {
            catalogById,
            existingByVendorId
          })
        : null;

    // Check if this collection has active share links and the edit broadens exposed entries/photos
    const activeSharesRes = await tx.query(
      `SELECT id, include_shared_photos
       FROM customer_collection_shares
       WHERE collection_id = $1
         AND user_id = $2
         AND status = 'active'
         AND (expires_at IS NULL OR expires_at > $3)`,
      [collectionId, userId, now.toISOString()]
    );
    if (activeSharesRes.rows.length > 0 && resolvedEntries !== null) {
      const addedNewSpot = resolvedEntries.some(e => !existingByVendorId.has(e.recorded_vendor_id));
      const addedNewPhoto = resolvedEntries.some(e => {
        const prev = existingByVendorId.get(e.recorded_vendor_id);
        return e.photo_attachment_id && (!prev || prev.photo_attachment_id !== e.photo_attachment_id);
      });
      if ((addedNewSpot || addedNewPhoto) && body.confirm_shared_view_update !== true) {
        throw new CustomerProfileDomainError(
          'This collection has an active unlisted share link. Confirm "Update shared view" so new spots or attachments are intentionally published to your shared page.',
          {
            status: 409,
            code: 'SHARED_VIEW_CONFIRMATION_REQUIRED'
          }
        );
      }
    }

    if (resolvedEntries !== null) {
      // Validate any referenced photo_attachment_id belongs to this collection & user
      const requestedAttIds = resolvedEntries
        .map(e => e.photo_attachment_id)
        .filter(Boolean);
      if (requestedAttIds.length > 0) {
        const validAttRes = await tx.query(
          `SELECT id, sha256_hex, moderation_status
           FROM customer_collection_photo_attachments
           WHERE collection_id = $1 AND user_id = $2 AND revoked_at IS NULL AND id = ANY($3::text[])`,
          [collectionId, userId, requestedAttIds]
        );
        const validAttMap = new Map(validAttRes.rows.map(r => [r.id, r]));
        for (const ent of resolvedEntries) {
          if (!ent.photo_attachment_id) continue;
          const attRow = validAttMap.get(ent.photo_attachment_id);
          if (!attRow) {
            throw new CustomerProfileDomainError('Invalid or revoked shared photo attachment.', {
              status: 400,
              code: 'INVALID_PHOTO_ATTACHMENT_ID'
            });
          }
          if (attRow.moderation_status === 'suppressed') {
            throw new CustomerProfileDomainError('Cannot attach a shared photo that was suppressed by moderation.', {
              status: 403,
              code: 'PHOTO_SUPPRESSED_BY_MODERATION'
            });
          }
          ent.attachment_sha256 = attRow.sha256_hex || '';
        }
      }

      await tx.query(`SET CONSTRAINTS customer_collection_entries_unique_position DEFERRED`);
      await tx.query(
        `DELETE FROM customer_collection_entries WHERE collection_id = $1 AND user_id = $2`,
        [collectionId, userId]
      );

      for (const ent of resolvedEntries) {
        await tx.query(
          `INSERT INTO customer_collection_entries (
             id, collection_id, user_id, position, vendor_id, recorded_vendor_id,
             vendor_name_snapshot, vendor_town_snapshot, vendor_cuisine_snapshot,
             recommendation, photo_attachment_id, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12)`,
          [
            ent.existing_entry_id || generateOpaqueId('cle'),
            collectionId,
            userId,
            ent.position,
            ent.vendor_id,
            ent.recorded_vendor_id,
            ent.vendor_name_snapshot,
            ent.vendor_town_snapshot,
            ent.vendor_cuisine_snapshot,
            ent.recommendation,
            ent.photo_attachment_id,
            now.toISOString()
          ]
        );
      }
    }

    // Block mutating an actively shared collection into previously suppressed content
    if (activeSharesRes.rows.length > 0) {
      const nextEntriesForDigest =
        resolvedEntries !== null
          ? resolvedEntries
          : (
              await tx.query(
                `SELECT cce.recorded_vendor_id, cce.recommendation, cce.photo_attachment_id, pa.sha256_hex AS attachment_sha256
                 FROM customer_collection_entries cce
                 LEFT JOIN customer_collection_photo_attachments pa ON pa.id = cce.photo_attachment_id
                 WHERE cce.collection_id = $1 AND cce.user_id = $2
                 ORDER BY cce.position ASC`,
                [collectionId, userId]
              )
            ).rows;
      const nextDigest = computeCollectionContentDigest({
        title: nextTitle,
        intro: nextIntro,
        entries: nextEntriesForDigest
      });
      const dupSuppressedRes = await tx.query(
        `SELECT id
         FROM customer_collections
         WHERE user_id = $1
           AND moderation_status = 'suppressed'
           AND suppressed_content_sha256 = $2
         LIMIT 1`,
        [userId, nextDigest]
      );
      if (dupSuppressedRes.rows.length > 0) {
        throw new CustomerProfileDomainError(
          'Identical content was previously suppressed by moderation and cannot be published to an active shared page.',
          {
            status: 403,
            code: 'SUPPRESSED_CONTENT_BYPASS_BLOCKED'
          }
        );
      }
    }

    await tx.query(
      `UPDATE customer_collections
       SET title = $3,
           intro = $4,
           revision = revision + 1,
           updated_at = $5
       WHERE id = $1 AND user_id = $2`,
      [collectionId, userId, nextTitle, nextIntro, now.toISOString()]
    );

    const dto = await loadCollectionHydratedInTx(tx, {
      userId,
      collectionId,
      catalogById,
      now
    });
    return { ok: true, collection: dto };
  });
}

export async function deleteOwnerCollection(
  dbAdapter,
  { userId, collectionId, storageRoot = resolvePhotoStorageRoot(), now = new Date() }
) {
  if (!userId) {
    throw new CustomerProfileDomainError('Sign in is required.', {
      status: 401,
      code: 'AUTH_REQUIRED'
    });
  }
  const cleanId = String(collectionId || '').trim();
  if (!/^col_[a-f0-9]{24,40}$/.test(cleanId)) {
    throw new CustomerProfileDomainError('Invalid collection identifier.', {
      status: 400,
      code: 'INVALID_COLLECTION_ID'
    });
  }

  const txOut = await withTransaction(dbAdapter, async tx => {
    await setOwnerProfileRlsInTx(tx, userId);
    await tx.query("SELECT pg_advisory_xact_lock(hashtext('bs_cust_col:' || $1))", [cleanId]);

    const delRes = await tx.query(
      `UPDATE customer_collections
       SET deleted_at = $3, visibility_mode = 'private', idempotency_key = NULL, updated_at = $3
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
       RETURNING id`,
      [cleanId, userId, now.toISOString()]
    );
    if (delRes.rows.length === 0) {
      throw new CustomerProfileDomainError('Collection was not found or already deleted.', {
        status: 404,
        code: 'COLLECTION_NOT_FOUND'
      });
    }

    const revokedShares = await tx.query(
      `UPDATE customer_collection_shares
       SET status = 'revoked', revoked_at = $3, revoke_reason = 'collection_deleted', updated_at = $3
       WHERE collection_id = $1 AND user_id = $2 AND status = 'active'
       RETURNING id`,
      [cleanId, userId, now.toISOString()]
    );

    const revokedAtt = await tx.query(
      `UPDATE customer_collection_photo_attachments
       SET revoked_at = $3
       WHERE collection_id = $1 AND user_id = $2 AND revoked_at IS NULL
       RETURNING id, shared_rel_path`,
      [cleanId, userId, now.toISOString()]
    );

    await tx.query(
      `DELETE FROM customer_collection_entries WHERE collection_id = $1 AND user_id = $2`,
      [cleanId, userId]
    );

    return {
      revoked_shares_count: revokedShares.rowCount || 0,
      revoked_attachments: revokedAtt.rows
    };
  });

  const { unlinkConfinedPhotoArtifact } = await import('./photo-storage.js');
  for (const att of txOut.revoked_attachments) {
    if (att.shared_rel_path) {
      unlinkConfinedPhotoArtifact({ storageRoot, relPath: att.shared_rel_path });
    }
  }

  return {
    ok: true,
    deleted_collection_id: cleanId,
    revoked_shares_count: txOut.revoked_shares_count
  };
}

// ============================================================================
// 5. 18+ Sharing Eligibility, Preview & Hashed Unlisted Share Links (Commit 4)
// ============================================================================

export function generateShareTokenMaterial() {
  // 32 random bytes = 256 bits of cryptographic entropy (`base64url`, 43 URL-safe chars)
  const rawToken = crypto.randomBytes(32).toString('base64url');
  const tokenSha256 = crypto.createHash('sha256').update(rawToken, 'utf8').digest('hex');
  const maskedTokenHint = `bs_…${rawToken.slice(-4)}`;
  return { rawToken, tokenSha256, maskedTokenHint };
}

export function hashRawShareToken(rawToken) {
  return crypto.createHash('sha256').update(String(rawToken || ''), 'utf8').digest('hex');
}

function parseDisclosureFlagsInput(rawDisclosures = {}, defaults = false) {
  if (rawDisclosures === null || typeof rawDisclosures !== 'object' || Array.isArray(rawDisclosures)) {
    throw new CustomerProfileDomainError('disclosures must be an object of boolean flags.', {
      status: 400,
      code: 'INVALID_DISCLOSURES'
    });
  }
  const allowedKeys = new Set([
    'include_display_name',
    'include_bio',
    'include_preferred_area',
    'include_achievements',
    'include_shared_photos'
  ]);
  for (const k of Object.keys(rawDisclosures)) {
    if (!allowedKeys.has(k)) {
      throw new CustomerProfileDomainError(
        `Disclosure field "${k}" is not allowed on shared links.`,
        {
          status: 400,
          code: 'FORBIDDEN_DISCLOSURE_FIELD'
        }
      );
    }
    if (typeof rawDisclosures[k] !== 'boolean') {
      throw new CustomerProfileDomainError(`Disclosure flag "${k}" must be boolean.`, {
        status: 400,
        code: 'INVALID_DISCLOSURES'
      });
    }
  }
  return {
    include_display_name:
      rawDisclosures.include_display_name !== undefined ? rawDisclosures.include_display_name : defaults,
    include_bio: rawDisclosures.include_bio !== undefined ? rawDisclosures.include_bio : defaults,
    include_preferred_area:
      rawDisclosures.include_preferred_area !== undefined ? rawDisclosures.include_preferred_area : defaults,
    include_achievements:
      rawDisclosures.include_achievements !== undefined ? rawDisclosures.include_achievements : defaults,
    include_shared_photos:
      rawDisclosures.include_shared_photos !== undefined ? rawDisclosures.include_shared_photos : defaults
  };
}

function parseOptionalShareExpiry(body = {}, now = new Date()) {
  if (body.expires_in_days !== undefined && body.expires_in_days !== null && body.expires_in_days !== '') {
    const days = Number(body.expires_in_days);
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      throw new CustomerProfileDomainError(
        'expires_in_days must be a whole number between 1 and 365 (or null for no automatic expiry).',
        {
          status: 400,
          code: 'INVALID_EXPIRY'
        }
      );
    }
    return new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
  }
  if (body.expires_at !== undefined && body.expires_at !== null && body.expires_at !== '') {
    const dt = new Date(String(body.expires_at));
    if (Number.isNaN(dt.getTime()) || dt.getTime() <= now.getTime()) {
      throw new CustomerProfileDomainError('expires_at must be a valid future timestamp.', {
        status: 400,
        code: 'INVALID_EXPIRY'
      });
    }
    const maxFuture = now.getTime() + 366 * 24 * 60 * 60 * 1000;
    if (dt.getTime() > maxFuture) {
      throw new CustomerProfileDomainError('expires_at cannot exceed 365 days in the future.', {
        status: 400,
        code: 'INVALID_EXPIRY'
      });
    }
    return dt.toISOString();
  }
  return null;
}

/**
 * Evaluates & persists minimal 18+ self-attested sharing eligibility without storing raw DOB.
 */
export async function submitAdultSharingEligibility(
  dbAdapter,
  { userId, body = {}, now = new Date() }
) {
  if (!userId) {
    throw new CustomerProfileDomainError('Sign in is required.', {
      status: 401,
      code: 'AUTH_REQUIRED'
    });
  }

  // Only allow `dob` or `dob_year`/`dob_month`/`dob_day` — reject client attempts to self-write status!
  for (const key of Object.keys(body || {})) {
    if (key !== 'dob' && key !== 'dob_year' && key !== 'dob_month' && key !== 'dob_day') {
      throw new CustomerProfileDomainError(`Field "${key}" is not allowed on sharing eligibility check.`, {
        status: 400,
        code: 'FORBIDDEN_CLIENT_FIELD'
      });
    }
  }

  const txOutcome = await withTransaction(dbAdapter, async tx => {
    await setOwnerProfileRlsInTx(tx, userId);
    await tx.query("SELECT pg_advisory_xact_lock(hashtext('bs_share_elig:' || $1))", [userId]);

    const cur = await loadCustomerSharingEligibilityInTx(tx, userId);
    if (cur.status === 'eligible_18_plus') {
      return {
        deniedError: null,
        payload: {
          ok: true,
          sharing_eligibility: cur
        }
      };
    }
    if (cur.status === 'ineligible_under_18') {
      throw new CustomerProfileDomainError(
        'External link sharing is unavailable for under-18 accounts. Your private BiteShark profile and collections remain available; contact Help & feedback if an entry error occurred.',
        {
          status: 403,
          code: 'SHARING_UNDER_18_RESTRICTED'
        }
      );
    }

    const evalRes = evaluateAdultSharingEligibility(body, now);
    if (!evalRes.provided || !evalRes.valid) {
      throw new CustomerProfileDomainError(evalRes.error, {
        status: evalRes.status || 400,
        code: evalRes.code || 'INVALID_DOB'
      });
    }
    const meta = evalRes.eligibilityMetadata;
    await tx.query(
      `INSERT INTO customer_sharing_eligibility (
         user_id, eligibility_status, policy_version, assessment_basis, assessed_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $5)
       ON CONFLICT (user_id) DO UPDATE
         SET eligibility_status = EXCLUDED.eligibility_status,
             policy_version = EXCLUDED.policy_version,
             assessment_basis = EXCLUDED.assessment_basis,
             assessed_at = EXCLUDED.assessed_at,
             updated_at = EXCLUDED.updated_at`,
      [userId, meta.eligibility_status, meta.policy_version, meta.assessment_basis, meta.assessed_at]
    );

    if (evalRes.under_14) {
      return {
        deniedError: new CustomerProfileDomainError(evalRes.error, {
          status: 403,
          code: 'AGE_INELIGIBLE'
        }),
        payload: null
      };
    }

    if (!evalRes.eligible_18_plus) {
      return {
        deniedError: new CustomerProfileDomainError(evalRes.error, {
          status: 403,
          code: 'SHARING_UNDER_18_RESTRICTED'
        }),
        payload: null
      };
    }

    const updated = await loadCustomerSharingEligibilityInTx(tx, userId);
    return {
      deniedError: null,
      payload: {
        ok: true,
        sharing_eligibility: updated
      }
    };
  });

  if (txOutcome.deniedError) {
    throw txOutcome.deniedError;
  }
  return txOutcome.payload;
}

async function assertOwnerEligibleForSharingInTx(tx, userId) {
  const elig = await loadCustomerSharingEligibilityInTx(tx, userId);
  if (elig.status === 'ineligible_under_18') {
    throw new CustomerProfileDomainError(
      'External link sharing is restricted to members aged 18 and older. Your private collections remain available for your own use.',
      {
        status: 403,
        code: 'SHARING_UNDER_18_RESTRICTED'
      }
    );
  }
  if (elig.status !== 'eligible_18_plus') {
    throw new CustomerProfileDomainError(
      'Complete the one-time 18+ sharing confirmation before creating or updating an unlisted share link.',
      {
        status: 403,
        code: 'SHARING_ELIGIBILITY_REQUIRED'
      }
    );
  }
  return elig;
}

/**
 * Owner preview (`POST /api/me/collections/preview`) — uses the exact same `buildSharedCollectionPublicDto`
 * allowlist projection as live `/s/<token>`!
 */
export async function previewOwnerSharedCollection(
  dbAdapter,
  { userId, body = {}, featureStates = {}, now = new Date() }
) {
  if (!userId) {
    throw new CustomerProfileDomainError('Sign in is required.', {
      status: 401,
      code: 'AUTH_REQUIRED'
    });
  }
  assertNoForbiddenClientWriteFields(body);
  const collectionId = String(body.collection_id || '').trim();
  if (!/^col_[a-f0-9]{24,40}$/.test(collectionId)) {
    throw new CustomerProfileDomainError('Valid collection_id is required.', {
      status: 400,
      code: 'INVALID_COLLECTION_ID'
    });
  }
  const disclosureFlags = parseDisclosureFlagsInput(body.disclosures || {}, false);
  const catalogResult = await loadDiscoveryCatalog(dbAdapter, { now });
  const catalogById = new Map(catalogResult.listings.map(item => [item.id, item]));

  return withTransaction(dbAdapter, async tx => {
    await setOwnerProfileRlsInTx(tx, userId);
    const colRes = await tx.query(
      `SELECT id, user_id, title, intro, visibility_mode, moderation_status, updated_at
       FROM customer_collections
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [collectionId, userId]
    );
    if (colRes.rows.length === 0) {
      throw new CustomerProfileDomainError('Collection was not found.', {
        status: 404,
        code: 'COLLECTION_NOT_FOUND'
      });
    }
    const entriesRes = await tx.query(
      `SELECT id, position, vendor_id, recorded_vendor_id, recommendation, photo_attachment_id
       FROM customer_collection_entries
       WHERE collection_id = $1 AND user_id = $2
       ORDER BY position ASC`,
      [collectionId, userId]
    );
    const attRes = await tx.query(
      `SELECT pa.id, pa.recorded_source_photo_id, pa.width, pa.height, pa.moderation_status, pa.revoked_at,
              (cp.id IS NOT NULL AND cp.deleted_at IS NULL) AS source_photo_active
       FROM customer_collection_photo_attachments pa
       LEFT JOIN customer_photos cp ON cp.id = pa.source_photo_id
       WHERE pa.collection_id = $1 AND pa.user_id = $2`,
      [collectionId, userId]
    );
    const attachmentById = new Map(attRes.rows.map(a => [a.id, a]));
    const profileRow = await ensureOrLoadCustomerProfileRowInTx(tx, userId);

    let achievementsSummary = null;
    if (
      disclosureFlags.include_achievements &&
      featureStates?.visit_journal?.state !== 'hidden' &&
      featureStates?.exploration_badges?.state !== 'hidden'
    ) {
      const exp = await computeExplorationSummaryInTx(tx, {
        userId,
        now,
        showAchievements: true,
        showWeeklyChallenge: false
      });
      achievementsSummary = exp?.achievements || null;
    }

    const previewDto = buildSharedCollectionPublicDto({
      shareId: null,
      rawTokenForPhotoUrl: null,
      previewOwnerPhotoFallback: true,
      collectionRow: colRes.rows[0],
      entryRows: entriesRes.rows,
      catalogById,
      attachmentById,
      profileRow,
      achievementsSummary,
      disclosureFlags,
      featureStates
    });

    return {
      ok: true,
      preview: previewDto
    };
  });
}

export async function listOwnerShares(
  dbAdapter,
  { userId, collectionId = null, now = new Date() }
) {
  if (!userId) {
    throw new CustomerProfileDomainError('Sign in is required.', {
      status: 401,
      code: 'AUTH_REQUIRED'
    });
  }
  const cleanColId = collectionId ? String(collectionId).trim() : null;
  if (cleanColId && !/^col_[a-f0-9]{24,40}$/.test(cleanColId)) {
    throw new CustomerProfileDomainError('Invalid collection_id filter.', {
      status: 400,
      code: 'INVALID_COLLECTION_ID'
    });
  }

  return withTransaction(dbAdapter, async tx => {
    await setOwnerProfileRlsInTx(tx, userId);
    const params = [userId];
    let colFilter = '';
    if (cleanColId) {
      params.push(cleanColId);
      colFilter = `AND cs.collection_id = $2`;
    }
    const { rows } = await tx.query(
      `SELECT
         cs.id, cs.collection_id, cc.title AS collection_title, cs.masked_token_hint,
         cs.include_display_name, cs.include_bio, cs.include_preferred_area,
         cs.include_achievements, cs.include_shared_photos,
         cs.expires_at, cs.status, cs.revoked_at, cs.created_at
       FROM customer_collection_shares cs
       JOIN customer_collections cc ON cc.id = cs.collection_id
       WHERE cs.user_id = $1 AND cc.deleted_at IS NULL ${colFilter}
       ORDER BY cs.created_at DESC, cs.id ASC
       LIMIT 50`,
      params
    );

    return {
      ok: true,
      shares: rows.map(s => {
        const isExpired = Boolean(s.expires_at && new Date(s.expires_at).getTime() <= now.getTime());
        return {
          share_id: s.id,
          collection_id: s.collection_id,
          collection_title: s.collection_title,
          masked_token_hint: s.masked_token_hint,
          status: s.status === 'active' && isExpired ? 'expired' : s.status,
          disclosures: {
            include_display_name: Boolean(s.include_display_name),
            include_bio: Boolean(s.include_bio),
            include_preferred_area: Boolean(s.include_preferred_area),
            include_achievements: Boolean(s.include_achievements),
            include_shared_photos: Boolean(s.include_shared_photos)
          },
          expires_at: s.expires_at ? new Date(s.expires_at).toISOString() : null,
          revoked_at: s.revoked_at ? new Date(s.revoked_at).toISOString() : null,
          created_at: s.created_at instanceof Date ? s.created_at.toISOString() : String(s.created_at)
        };
      })
    };
  });
}

export async function createCollectionShareLink(
  dbAdapter,
  { userId, body = {}, publicOrigin = '', now = new Date() }
) {
  if (!userId) {
    throw new CustomerProfileDomainError('Sign in is required.', {
      status: 401,
      code: 'AUTH_REQUIRED'
    });
  }
  assertNoForbiddenClientWriteFields(body, ['token', 'token_sha256', 'share_id']);

  const collectionId = String(body.collection_id || '').trim();
  if (!/^col_[a-f0-9]{24,40}$/.test(collectionId)) {
    throw new CustomerProfileDomainError('Valid collection_id is required.', {
      status: 400,
      code: 'INVALID_COLLECTION_ID'
    });
  }

  const disclosures = parseDisclosureFlagsInput(body.disclosures || {}, false);
  const expiresAtIso = parseOptionalShareExpiry(body, now);
  const idemKey = normalizeOptionalIdempotencyKey(body.idempotency_key);

  return withTransaction(dbAdapter, async tx => {
    await setOwnerProfileRlsInTx(tx, userId);
    await tx.query("SELECT pg_advisory_xact_lock(hashtext('bs_cust_col:' || $1))", [collectionId]);

    await assertOwnerEligibleForSharingInTx(tx, userId);

    const colRes = await tx.query(
      `SELECT id, title, intro, moderation_status, suppressed_content_sha256
       FROM customer_collections
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
       FOR UPDATE`,
      [collectionId, userId]
    );
    if (colRes.rows.length === 0) {
      throw new CustomerProfileDomainError('Collection was not found.', {
        status: 404,
        code: 'COLLECTION_NOT_FOUND'
      });
    }
    const col = colRes.rows[0];
    if (col.moderation_status === 'suppressed') {
      throw new CustomerProfileDomainError(
        'Shared links for this collection were suppressed by moderation and cannot be recreated while suppressed.',
        {
          status: 403,
          code: 'COLLECTION_SUPPRESSED_BY_MODERATION'
        }
      );
    }

    // Also block bypassing suppression by cloning identical suppressed content into a fresh collection
    const curEntriesRes = await tx.query(
      `SELECT cce.recorded_vendor_id, cce.recommendation, cce.photo_attachment_id, pa.sha256_hex AS attachment_sha256
       FROM customer_collection_entries cce
       LEFT JOIN customer_collection_photo_attachments pa ON pa.id = cce.photo_attachment_id
       WHERE cce.collection_id = $1 AND cce.user_id = $2
       ORDER BY cce.position ASC`,
      [collectionId, userId]
    );
    const contentDigest = computeCollectionContentDigest({
      title: col.title,
      intro: col.intro,
      entries: curEntriesRes.rows
    });
    const dupSuppressedRes = await tx.query(
      `SELECT id
       FROM customer_collections
       WHERE user_id = $1
         AND moderation_status = 'suppressed'
         AND suppressed_content_sha256 = $2
       LIMIT 1`,
      [userId, contentDigest]
    );
    if (dupSuppressedRes.rows.length > 0) {
      throw new CustomerProfileDomainError(
        'Identical content was previously suppressed by moderation and cannot be re-shared without staff review.',
        {
          status: 403,
          code: 'SUPPRESSED_CONTENT_BYPASS_BLOCKED'
        }
      );
    }

    if (idemKey) {
      const idemRes = await tx.query(
        `SELECT id, masked_token_hint, status, expires_at, created_at
         FROM customer_collection_shares
         WHERE user_id = $1 AND idempotency_key = $2`,
        [userId, idemKey]
      );
      if (idemRes.rows.length > 0) {
        const s = idemRes.rows[0];
        return {
          ok: true,
          idempotent_replay: true,
          plaintext_unavailable_on_replay: true,
          share: {
            share_id: s.id,
            collection_id: collectionId,
            masked_token_hint: s.masked_token_hint,
            status: s.status,
            disclosures,
            expires_at: s.expires_at ? new Date(s.expires_at).toISOString() : null,
            created_at: s.created_at instanceof Date ? s.created_at.toISOString() : String(s.created_at)
          }
        };
      }
    }

    const activeCountRes = await tx.query(
      `SELECT COUNT(*)::int AS cnt
       FROM customer_collection_shares
       WHERE collection_id = $1
         AND user_id = $2
         AND status = 'active'
         AND (expires_at IS NULL OR expires_at > $3)`,
      [collectionId, userId, now.toISOString()]
    );
    if (Number(activeCountRes.rows[0]?.cnt || 0) >= MAX_ACTIVE_SHARES_PER_COLLECTION) {
      throw new CustomerProfileDomainError(
        `Each collection can have up to ${MAX_ACTIVE_SHARES_PER_COLLECTION} active unlisted links. Revoke or rotate an existing link first.`,
        {
          status: 409,
          code: 'SHARE_LIMIT_REACHED'
        }
      );
    }

    const { rawToken, tokenSha256, maskedTokenHint } = generateShareTokenMaterial();
    const shareId = generateOpaqueId('shr');

    await tx.query(
      `INSERT INTO customer_collection_shares (
         id, collection_id, user_id, token_sha256, masked_token_hint,
         include_display_name, include_bio, include_preferred_area,
         include_achievements, include_shared_photos,
         expires_at, status, idempotency_key, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'active', $12, $13, $13)`,
      [
        shareId,
        collectionId,
        userId,
        tokenSha256,
        maskedTokenHint,
        disclosures.include_display_name,
        disclosures.include_bio,
        disclosures.include_preferred_area,
        disclosures.include_achievements,
        disclosures.include_shared_photos,
        expiresAtIso,
        idemKey,
        now.toISOString()
      ]
    );

    await tx.query(
      `UPDATE customer_collections
       SET visibility_mode = 'unlisted_link', updated_at = $3
       WHERE id = $1 AND user_id = $2`,
      [collectionId, userId, now.toISOString()]
    );

    const sharePath = `/s/${rawToken}`;
    const cleanOrigin = String(publicOrigin || '').replace(/\/+$/, '');
    return {
      ok: true,
      idempotent_replay: false,
      share_path: sharePath,
      share_url: cleanOrigin ? `${cleanOrigin}${sharePath}` : sharePath,
      one_time_token_notice:
        'Copy this link now — BiteShark stores only its cryptographic hash and cannot display the full URL again. You can revoke or replace it anytime.',
      unlisted_warning:
        'Anyone with this link can view it. They can forward the link. You can revoke it.',
      share: {
        share_id: shareId,
        collection_id: collectionId,
        masked_token_hint: maskedTokenHint,
        status: 'active',
        disclosures,
        expires_at: expiresAtIso,
        created_at: now.toISOString()
      }
    };
  });
}

export async function updateCollectionShareSettings(
  dbAdapter,
  { userId, body = {}, now = new Date() }
) {
  if (!userId) {
    throw new CustomerProfileDomainError('Sign in is required.', {
      status: 401,
      code: 'AUTH_REQUIRED'
    });
  }
  assertNoForbiddenClientWriteFields(body, ['token', 'token_sha256']);
  const shareId = String(body.share_id || '').trim();
  if (!/^shr_[a-f0-9]{24,40}$/.test(shareId)) {
    throw new CustomerProfileDomainError('Valid share_id is required.', {
      status: 400,
      code: 'INVALID_SHARE_ID'
    });
  }

  return withTransaction(dbAdapter, async tx => {
    await setOwnerProfileRlsInTx(tx, userId);
    await assertOwnerEligibleForSharingInTx(tx, userId);

    const curRes = await tx.query(
      `SELECT
         cs.id, cs.collection_id, cs.masked_token_hint, cs.status, cs.expires_at, cs.created_at,
         cs.include_display_name, cs.include_bio, cs.include_preferred_area,
         cs.include_achievements, cs.include_shared_photos,
         cc.moderation_status
       FROM customer_collection_shares cs
       JOIN customer_collections cc ON cc.id = cs.collection_id
       WHERE cs.id = $1 AND cs.user_id = $2 AND cc.deleted_at IS NULL
       FOR UPDATE OF cs`,
      [shareId, userId]
    );
    if (curRes.rows.length === 0) {
      throw new CustomerProfileDomainError('Share link was not found.', {
        status: 404,
        code: 'SHARE_NOT_FOUND'
      });
    }
    const cur = curRes.rows[0];
    if (cur.status !== 'active') {
      throw new CustomerProfileDomainError('Only active share links can be updated.', {
        status: 409,
        code: 'SHARE_NOT_ACTIVE'
      });
    }
    const isAlreadyExpired =
      Boolean(cur.expires_at) && new Date(cur.expires_at).getTime() <= now.getTime();
    const callerSuppliedExpiry =
      body.expires_at !== undefined || body.expires_in_days !== undefined;
    if (isAlreadyExpired && !callerSuppliedExpiry) {
      throw new CustomerProfileDomainError(
        'This share link has already expired. Set a new future expiration or create a fresh share link.',
        {
          status: 409,
          code: 'SHARE_EXPIRED'
        }
      );
    }
    if (cur.moderation_status === 'suppressed') {
      throw new CustomerProfileDomainError('This collection is suppressed by moderation.', {
        status: 403,
        code: 'COLLECTION_SUPPRESSED_BY_MODERATION'
      });
    }

    const nextDisclosures = body.disclosures
      ? parseDisclosureFlagsInput(body.disclosures, false)
      : {
          include_display_name: Boolean(cur.include_display_name),
          include_bio: Boolean(cur.include_bio),
          include_preferred_area: Boolean(cur.include_preferred_area),
          include_achievements: Boolean(cur.include_achievements),
          include_shared_photos: Boolean(cur.include_shared_photos)
        };

    const broadensExposure =
      (!cur.include_display_name && nextDisclosures.include_display_name) ||
      (!cur.include_bio && nextDisclosures.include_bio) ||
      (!cur.include_preferred_area && nextDisclosures.include_preferred_area) ||
      (!cur.include_achievements && nextDisclosures.include_achievements) ||
      (!cur.include_shared_photos && nextDisclosures.include_shared_photos);

    if (broadensExposure && body.confirm_shared_view_update !== true) {
      throw new CustomerProfileDomainError(
        'Confirm "Update shared view" (`confirm_shared_view_update: true`) before exposing additional profile details or shared photos on an active link.',
        {
          status: 409,
          code: 'SHARED_VIEW_CONFIRMATION_REQUIRED'
        }
      );
    }

    const nextExpiresAt =
      body.expires_at === null || body.expires_in_days === null
        ? null
        : body.expires_at !== undefined || body.expires_in_days !== undefined
          ? parseOptionalShareExpiry(body, now)
          : cur.expires_at
            ? new Date(cur.expires_at).toISOString()
            : null;

    await tx.query(
      `UPDATE customer_collection_shares
       SET include_display_name = $3,
           include_bio = $4,
           include_preferred_area = $5,
           include_achievements = $6,
           include_shared_photos = $7,
           expires_at = $8,
           updated_at = $9
       WHERE id = $1 AND user_id = $2`,
      [
        shareId,
        userId,
        nextDisclosures.include_display_name,
        nextDisclosures.include_bio,
        nextDisclosures.include_preferred_area,
        nextDisclosures.include_achievements,
        nextDisclosures.include_shared_photos,
        nextExpiresAt,
        now.toISOString()
      ]
    );

    return {
      ok: true,
      share: {
        share_id: shareId,
        collection_id: cur.collection_id,
        masked_token_hint: cur.masked_token_hint,
        status: 'active',
        disclosures: nextDisclosures,
        expires_at: nextExpiresAt,
        created_at: cur.created_at instanceof Date ? cur.created_at.toISOString() : String(cur.created_at)
      }
    };
  });
}

export async function rotateCollectionShareLink(
  dbAdapter,
  { userId, body = {}, publicOrigin = '', now = new Date() }
) {
  if (!userId) {
    throw new CustomerProfileDomainError('Sign in is required.', {
      status: 401,
      code: 'AUTH_REQUIRED'
    });
  }
  assertNoForbiddenClientWriteFields(body, ['token', 'token_sha256']);
  const shareId = String(body.share_id || '').trim();
  if (!/^shr_[a-f0-9]{24,40}$/.test(shareId)) {
    throw new CustomerProfileDomainError('Valid share_id is required.', {
      status: 400,
      code: 'INVALID_SHARE_ID'
    });
  }

  return withTransaction(dbAdapter, async tx => {
    await setOwnerProfileRlsInTx(tx, userId);
    await assertOwnerEligibleForSharingInTx(tx, userId);

    const curRes = await tx.query(
      `SELECT
         cs.id, cs.collection_id, cs.status, cs.expires_at,
         cs.include_display_name, cs.include_bio, cs.include_preferred_area,
         cs.include_achievements, cs.include_shared_photos,
         cc.moderation_status
       FROM customer_collection_shares cs
       JOIN customer_collections cc ON cc.id = cs.collection_id
       WHERE cs.id = $1 AND cs.user_id = $2 AND cc.deleted_at IS NULL
       FOR UPDATE OF cs`,
      [shareId, userId]
    );
    if (curRes.rows.length === 0) {
      throw new CustomerProfileDomainError('Share link was not found.', {
        status: 404,
        code: 'SHARE_NOT_FOUND'
      });
    }
    const cur = curRes.rows[0];
    if (cur.moderation_status === 'suppressed' || cur.status === 'suppressed') {
      throw new CustomerProfileDomainError(
        'Suppressed shared links cannot be rotated to bypass moderation.',
        {
          status: 403,
          code: 'COLLECTION_SUPPRESSED_BY_MODERATION'
        }
      );
    }
    if (cur.status !== 'active') {
      throw new CustomerProfileDomainError('Only active share links can be rotated.', {
        status: 409,
        code: 'SHARE_NOT_ACTIVE'
      });
    }
    const isAlreadyExpired =
      Boolean(cur.expires_at) && new Date(cur.expires_at).getTime() <= now.getTime();
    const callerSuppliedExpiry =
      body.expires_at !== undefined || body.expires_in_days !== undefined;
    if (isAlreadyExpired && !callerSuppliedExpiry) {
      throw new CustomerProfileDomainError(
        'This share link has already expired. Supply a new expiration window or create a new share link.',
        {
          status: 409,
          code: 'SHARE_EXPIRED'
        }
      );
    }

    const { rawToken, tokenSha256, maskedTokenHint } = generateShareTokenMaterial();
    const newShareId = generateOpaqueId('shr');
    const nextExpiresAt =
      body.expires_in_days !== undefined || body.expires_at !== undefined
        ? parseOptionalShareExpiry(body, now)
        : cur.expires_at
          ? new Date(cur.expires_at).toISOString()
          : null;

    await tx.query(
      `INSERT INTO customer_collection_shares (
         id, collection_id, user_id, token_sha256, masked_token_hint,
         include_display_name, include_bio, include_preferred_area,
         include_achievements, include_shared_photos,
         expires_at, status, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'active', $12, $12)`,
      [
        newShareId,
        cur.collection_id,
        userId,
        tokenSha256,
        maskedTokenHint,
        Boolean(cur.include_display_name),
        Boolean(cur.include_bio),
        Boolean(cur.include_preferred_area),
        Boolean(cur.include_achievements),
        Boolean(cur.include_shared_photos),
        nextExpiresAt,
        now.toISOString()
      ]
    );

    await tx.query(
      `UPDATE customer_collection_shares
       SET status = 'rotated',
           replaced_by_share_id = $3,
           revoked_at = $4,
           revoke_reason = 'rotated_by_owner',
           updated_at = $4
       WHERE id = $1 AND user_id = $2`,
      [shareId, userId, newShareId, now.toISOString()]
    );

    const sharePath = `/s/${rawToken}`;
    const cleanOrigin = String(publicOrigin || '').replace(/\/+$/, '');
    return {
      ok: true,
      previous_share_id: shareId,
      share_path: sharePath,
      share_url: cleanOrigin ? `${cleanOrigin}${sharePath}` : sharePath,
      one_time_token_notice:
        'Your previous link has stopped working immediately. Copy this replacement link now — BiteShark stores only its hash.',
      share: {
        share_id: newShareId,
        collection_id: cur.collection_id,
        masked_token_hint: maskedTokenHint,
        status: 'active',
        disclosures: {
          include_display_name: Boolean(cur.include_display_name),
          include_bio: Boolean(cur.include_bio),
          include_preferred_area: Boolean(cur.include_preferred_area),
          include_achievements: Boolean(cur.include_achievements),
          include_shared_photos: Boolean(cur.include_shared_photos)
        },
        expires_at: nextExpiresAt,
        created_at: now.toISOString()
      }
    };
  });
}

/**
 * Always permitted for the account owner even when sharing features are paused/hidden or eligibility changes!
 */
export async function revokeCollectionShareLink(
  dbAdapter,
  { userId, shareId, reason = 'revoked_by_owner', now = new Date() }
) {
  if (!userId) {
    throw new CustomerProfileDomainError('Sign in is required.', {
      status: 401,
      code: 'AUTH_REQUIRED'
    });
  }
  const cleanId = String(shareId || '').trim();
  if (!/^shr_[a-f0-9]{24,40}$/.test(cleanId)) {
    throw new CustomerProfileDomainError('Valid share_id is required.', {
      status: 400,
      code: 'INVALID_SHARE_ID'
    });
  }
  const cleanReason = sanitizePlainText(reason || 'revoked_by_owner', {
    maxLen: 240,
    fieldLabel: 'Revocation reason'
  });

  return withTransaction(dbAdapter, async tx => {
    await setOwnerProfileRlsInTx(tx, userId);
    const upd = await tx.query(
      `UPDATE customer_collection_shares
       SET status = CASE WHEN status = 'suppressed' THEN 'suppressed' ELSE 'revoked' END,
           revoked_at = COALESCE(revoked_at, $3),
           revoke_reason = COALESCE(revoke_reason, $4),
           updated_at = $3
       WHERE id = $1 AND user_id = $2
       RETURNING id, collection_id, status`,
      [cleanId, userId, now.toISOString(), cleanReason]
    );
    if (upd.rows.length === 0) {
      throw new CustomerProfileDomainError('Share link was not found.', {
        status: 404,
        code: 'SHARE_NOT_FOUND'
      });
    }
    const collectionId = upd.rows[0].collection_id;
    const remActive = await tx.query(
      `SELECT COUNT(*)::int AS cnt
       FROM customer_collection_shares
       WHERE collection_id = $1 AND user_id = $2 AND status = 'active' AND (expires_at IS NULL OR expires_at > $3)`,
      [collectionId, userId, now.toISOString()]
    );
    if (Number(remActive.rows[0]?.cnt || 0) === 0) {
      await tx.query(
        `UPDATE customer_collections SET visibility_mode = 'private', updated_at = $3 WHERE id = $1 AND user_id = $2`,
        [collectionId, userId, now.toISOString()]
      );
    }
    return {
      ok: true,
      revoked_share_id: cleanId,
      collection_id: collectionId
    };
  });
}

/**
 * Resolves an unlisted `/s/<opaque-token>` request with all 7 authorization & privacy gates.
 * Returns `{ available: false, reason_code }` for ANY invalid/expired/revoked/ineligible/disabled state
 * so the caller always renders a uniform neutral `404` page.
 */
export async function resolveLiveSharedCollectionByToken(
  dbAdapter,
  { rawToken, systemFeatureStates = {}, now = new Date() }
) {
  // Gate 1: System & caller (`staff_beta`) feature control check (`unlisted_collection_sharing` & parent `greatest_hits_collections`)
  if (
    systemFeatureStates?.greatest_hits_collections?.system_state === 'hidden' ||
    systemFeatureStates?.greatest_hits_collections?.state === 'hidden' ||
    systemFeatureStates?.unlisted_collection_sharing?.system_state === 'hidden' ||
    systemFeatureStates?.unlisted_collection_sharing?.state === 'hidden'
  ) {
    return { available: false, reason_code: 'FEATURE_DISABLED' };
  }

  // Gate 2: Strict token format check before hashing
  const tokenStr = String(rawToken || '').trim();
  if (!/^[A-Za-z0-9_-]{32,80}$/.test(tokenStr)) {
    return { available: false, reason_code: 'MALFORMED_TOKEN' };
  }
  const tokenSha256 = hashRawShareToken(tokenStr);

  const catalogResult = await loadDiscoveryCatalog(dbAdapter, { now });
  const catalogById = new Map(catalogResult.listings.map(item => [item.id, item]));

  return withTransaction(dbAdapter, async tx => {
    await tx.query("SELECT set_config('app.user_id', '', true)");
    await tx.query("SELECT set_config('app.share_lookup', 'true', true)");

    const shareRes = await tx.query(
      `SELECT
         cs.id, cs.collection_id, cs.user_id, cs.status, cs.expires_at,
         cs.include_display_name, cs.include_bio, cs.include_preferred_area,
         cs.include_achievements, cs.include_shared_photos,
         cc.id AS col_id, cc.title, cc.intro, cc.visibility_mode, cc.moderation_status,
         cc.deleted_at, cc.updated_at
       FROM customer_collection_shares cs
       JOIN customer_collections cc ON cc.id = cs.collection_id
       WHERE cs.token_sha256 = $1
       LIMIT 1`,
      [tokenSha256]
    );
    if (shareRes.rows.length === 0) {
      return { available: false, reason_code: 'NOT_FOUND' };
    }
    const row = shareRes.rows[0];

    // Gate 3: Share status & expiry
    if (row.status !== 'active') {
      return { available: false, reason_code: `SHARE_${String(row.status).toUpperCase()}` };
    }
    if (row.expires_at && new Date(row.expires_at).getTime() <= now.getTime()) {
      return { available: false, reason_code: 'SHARE_EXPIRED' };
    }

    // Gate 4: Collection deletion & moderation status
    if (row.deleted_at || row.moderation_status !== 'active') {
      return { available: false, reason_code: 'COLLECTION_UNAVAILABLE' };
    }

    // Gate 5: Owner account active (`auth_users.disabled_at IS NULL`)
    await tx.query("SELECT set_config('app.auth_internal', 'true', true)");
    const ownerRes = await tx.query(
      `SELECT disabled_at, age_eligibility_status
       FROM auth_users
       WHERE id = $1
       LIMIT 1`,
      [row.user_id]
    );
    await tx.query("SELECT set_config('app.auth_internal', '', true)");
    if (
      ownerRes.rows.length === 0 ||
      ownerRes.rows[0].disabled_at !== null ||
      ownerRes.rows[0].age_eligibility_status !== 'eligible_14_plus'
    ) {
      return { available: false, reason_code: 'OWNER_INACTIVE' };
    }

    // Gate 6: Owner 18+ adult sharing eligibility
    const eligRes = await tx.query(
      `SELECT eligibility_status
       FROM customer_sharing_eligibility
       WHERE user_id = $1
       LIMIT 1`,
      [row.user_id]
    );
    if (eligRes.rows.length === 0 || eligRes.rows[0].eligibility_status !== 'eligible_18_plus') {
      return { available: false, reason_code: 'OWNER_SHARING_INELIGIBLE' };
    }

    // Load only allowlisted collection entries, attachments, and opted-in profile fields
    const entriesRes = await tx.query(
      `SELECT id, position, vendor_id, recorded_vendor_id, recommendation, photo_attachment_id
       FROM customer_collection_entries
       WHERE collection_id = $1
       ORDER BY position ASC`,
      [row.collection_id]
    );

    // Check source photo active status safely under maintenance/share lookup
    await tx.query("SELECT set_config('app.photo_maintenance', 'true', true)");
    const attRes = await tx.query(
      `SELECT pa.id, pa.width, pa.height, pa.moderation_status, pa.revoked_at,
              (cp.id IS NOT NULL AND cp.deleted_at IS NULL) AS source_photo_active
       FROM customer_collection_photo_attachments pa
       LEFT JOIN customer_photos cp ON cp.id = pa.source_photo_id
       WHERE pa.collection_id = $1`,
      [row.collection_id]
    );
    await tx.query("SELECT set_config('app.photo_maintenance', '', true)");
    const attachmentById = new Map(attRes.rows.map(a => [a.id, a]));

    const profRes = await tx.query(
      `SELECT display_name, bio, avatar_style, preferred_town
       FROM customer_profiles
       WHERE user_id = $1`,
      [row.user_id]
    );
    const profileRow = profRes.rows[0] || null;

    let achievementsSummary = null;
    if (
      row.include_achievements &&
      systemFeatureStates?.visit_journal?.system_state !== 'hidden' &&
      systemFeatureStates?.exploration_badges?.system_state !== 'hidden'
    ) {
      await tx.query("SELECT set_config('app.user_id', $1, true)", [row.user_id]);
      const exp = await computeExplorationSummaryInTx(tx, {
        userId: row.user_id,
        now,
        showAchievements: true,
        showWeeklyChallenge: false
      });
      await tx.query("SELECT set_config('app.user_id', '', true)");
      achievementsSummary = exp?.achievements || null;
    }

    const dto = buildSharedCollectionPublicDto({
      shareId: row.id,
      rawTokenForPhotoUrl: tokenStr,
      previewOwnerPhotoFallback: false,
      collectionRow: {
        id: row.col_id,
        title: row.title,
        intro: row.intro,
        updated_at: row.updated_at
      },
      entryRows: entriesRes.rows,
      catalogById,
      attachmentById,
      profileRow,
      achievementsSummary,
      disclosureFlags: {
        include_display_name: Boolean(row.include_display_name),
        include_bio: Boolean(row.include_bio),
        include_preferred_area: Boolean(row.include_preferred_area),
        include_achievements: Boolean(row.include_achievements),
        include_shared_photos: Boolean(row.include_shared_photos)
      },
      featureStates: {
        visit_journal: { state: systemFeatureStates?.visit_journal?.system_state || 'enabled' },
        exploration_badges: { state: systemFeatureStates?.exploration_badges?.system_state || 'enabled' },
        shared_collection_photos: {
          state: systemFeatureStates?.shared_collection_photos?.system_state || 'hidden'
        }
      }
    });

    return {
      available: true,
      dto
    };
  });
}

function htmlEsc(raw) {
  return String(raw === null || raw === undefined ? '' : raw)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderSharedUnavailableHtmlPage() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="robots" content="noindex, nofollow, noarchive" />
  <meta name="referrer" content="no-referrer" />
  <title>Shared Recommendations Unavailable · BiteShark</title>
  <link rel="stylesheet" href="/shared-collection-page.css" />
</head>
<body>
  <a class="sp-skip-link" href="#spMain">Skip to content</a>
  <header class="sp-topbar">
    <a class="sp-brand" href="/" rel="noreferrer">BiteShark · Sonoma County</a>
  </header>
  <main id="spMain" class="sp-shell">
    <section class="sp-card sp-unavailable">
      <span class="sp-kicker">UNLISTED LINK UNAVAILABLE</span>
      <h1>This shared BiteShark link isn’t available</h1>
      <p>The link may have expired, been revoked or replaced by its owner, or is not currently active.</p>
      <div class="sp-actions">
        <a class="sp-btn sp-btn-primary" href="/" rel="noreferrer">Explore Sonoma County food spots →</a>
      </div>
    </section>
  </main>
</body>
</html>`;
}

export function renderSharedCollectionHtmlPage(dto, { viewerAuthenticated = false } = {}) {
  const cur = dto.curator || {};
  const col = dto.collection || {};
  const entries = col.entries || [];

  let curatorHtml = '';
  if (cur.included) {
    const badgesList =
      cur.achievements && Array.isArray(cur.achievements.unlocked_badge_titles) && cur.achievements.unlocked_badge_titles.length > 0
        ? ` · Badges: ${cur.achievements.unlocked_badge_titles.map(htmlEsc).join(', ')}`
        : '';
    curatorHtml = `<section class="sp-card sp-curator" aria-label="Curator details">
      ${cur.display_name ? `<div class="sp-curator-head"><div class="sp-avatar" data-style="${htmlEsc(cur.avatar_style || 'initials_fern')}">${htmlEsc(cur.initials || 'BS')}</div><div><strong>Shared by ${htmlEsc(cur.display_name)}</strong>${cur.preferred_town ? `<span class="sp-meta">Preferred area: ${htmlEsc(cur.preferred_town)}</span>` : ''}</div></div>` : cur.preferred_town ? `<p class="sp-meta">Preferred area: ${htmlEsc(cur.preferred_town)}</p>` : ''}
      ${cur.bio ? `<p class="sp-bio">${htmlEsc(cur.bio)}</p>` : ''}
      ${cur.achievements ? `<p class="sp-meta">Level ${Number(cur.achievements.level_number)} (${htmlEsc(cur.achievements.level_title)}) · ${Number(cur.achievements.total_points)} pts${badgesList} <small>(${htmlEsc(cur.achievements.self_reported_note)})</small></p>` : ''}
    </section>`;
  }

  const entriesHtml =
    entries.length === 0
      ? `<div class="sp-card"><p class="sp-meta">No spots are listed in this collection yet.</p></div>`
      : `<ol class="sp-entry-list">${entries
          .map(e => {
            if (!e.available) {
              return `<li class="sp-card sp-entry sp-entry-unavailable">
                <div class="sp-entry-head">
                  <span class="sp-pos">#${Number(e.position)}</span>
                  <div>
                    <h2>${htmlEsc(e.display_name)}</h2>
                    <span class="sp-meta">${htmlEsc(e.service_status_label || 'Currently unavailable')}</span>
                  </div>
                </div>
              </li>`;
            }
            const photoHtml = e.shared_photo
              ? `<figure class="sp-photo-wrap">
                   <img src="${htmlEsc(e.shared_photo.image_url)}" alt="${htmlEsc(e.shared_photo.alt_text)}" loading="lazy" />
                   <figcaption>Shared dish photo · <button type="button" class="sp-link-btn" data-sp-report-attachment="${htmlEsc(e.shared_photo.attachment_id)}">Report photo</button></figcaption>
                 </figure>`
              : '';
            const saveBtnHtml = viewerAuthenticated
              ? `<button type="button" class="sp-btn" data-sp-save-vendor="${htmlEsc(e.vendor_id)}">♡ Save to my places</button>`
              : '';

            return `<li class="sp-card sp-entry">
              <div class="sp-entry-head">
                <span class="sp-pos">#${Number(e.position)}</span>
                <div class="sp-entry-title-wrap">
                  <h2>${htmlEsc(e.display_name)}</h2>
                  <span class="sp-meta">${htmlEsc(e.cuisine || 'Food spot')} · ${htmlEsc(e.town || 'Sonoma County')} · ${htmlEsc(e.service_status_label || '')}</span>
                </div>
              </div>
              ${e.recommendation ? `<blockquote class="sp-rec">${htmlEsc(e.recommendation)}</blockquote>` : ''}
              ${photoHtml}
              <div class="sp-actions">
                <a class="sp-btn sp-btn-primary" href="${htmlEsc(e.detail_href)}" rel="noreferrer noopener">View details on BiteShark →</a>
                ${saveBtnHtml}
              </div>
            </li>`;
          })
          .join('')}</ol>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="robots" content="noindex, nofollow, noarchive" />
  <meta name="referrer" content="no-referrer" />
  <title>Shared Food Recommendations · BiteShark</title>
  <link rel="stylesheet" href="/shared-collection-page.css" />
</head>
<body data-share-id="${htmlEsc(dto.share_id || '')}" data-viewer-auth="${viewerAuthenticated ? '1' : '0'}">
  <a class="sp-skip-link" href="#spMain">Skip to recommendations</a>
  <header class="sp-topbar">
    <a class="sp-brand" href="/" rel="noreferrer">BiteShark · Sonoma County</a>
    <a class="sp-btn" href="/" rel="noreferrer">Browse directory</a>
  </header>
  <main id="spMain" class="sp-shell">
    <section class="sp-card sp-hero">
      <span class="sp-kicker">GREATEST HITS · UNLISTED SHARED LIST</span>
      <h1>${htmlEsc(col.title || 'Greatest Hits')}</h1>
      ${col.intro ? `<p class="sp-intro">${htmlEsc(col.intro)}</p>` : ''}
      <p class="sp-disclosure">${htmlEsc(dto.disclosures?.recommendation_nature || '')}</p>
    </section>
    ${curatorHtml}
    <div id="spSaveStatus" data-sp-el="save-status" class="sp-status" role="status" aria-live="polite" hidden></div>
    ${entriesHtml}
    <footer class="sp-footer">
      <p>${htmlEsc(dto.disclosures?.unlisted_link_notice || '')}</p>
      <button type="button" class="sp-link-btn" id="spOpenReportBtn" data-sp-el="open-report">Report this shared page</button>
    </footer>
    <section id="spReportPanel" data-sp-el="report-panel" class="sp-card sp-report-panel" role="region" aria-labelledby="spReportHeading" hidden>
      <h2 id="spReportHeading">Report this shared page</h2>
      <p class="sp-meta">Reports go to BiteShark moderators using a non-secret record reference (no account required).</p>
      <form id="spReportForm" data-sp-el="report-form" novalidate>
        <input type="hidden" id="spReportAttachmentId" data-sp-el="report-attachment-id" value="" />
        <label class="sp-field">
          <span>Reason</span>
          <select id="spReportReason" data-sp-el="report-reason" required>
            <option value="inappropriate_content">Inappropriate or offensive content</option>
            <option value="impersonation_or_misleading">Misleading business claim or impersonation</option>
            <option value="privacy_concern">Personal or private information concern</option>
            <option value="copyright_or_photo">Photo or rights concern</option>
            <option value="spam_or_abuse">Spam or abuse</option>
            <option value="other">Other concern</option>
          </select>
        </label>
        <label class="sp-field">
          <span>Optional details (up to 500 chars — do not paste passwords or personal contact info)</span>
          <textarea id="spReportDetails" data-sp-el="report-details" maxlength="500"></textarea>
        </label>
        <div id="spReportMsg" data-sp-el="report-msg" class="sp-status" role="alert" hidden></div>
        <div class="sp-actions">
          <button type="submit" class="sp-btn sp-btn-primary" id="spSubmitReportBtn" data-sp-el="submit-report">Submit report</button>
          <button type="button" class="sp-btn" id="spCancelReportBtn" data-sp-el="cancel-report">Cancel</button>
        </div>
      </form>
    </section>
  </main>
  <script src="/shared-collection-page.js"></script>
</body>
</html>`;
}

// ============================================================================
// 6. Abuse Reporting & Scoped Mod/Top Shared Content Moderation (Commit 5)
// ============================================================================

const SHARE_REPORT_REASON_SET = new Set(ALLOWED_SHARE_REPORT_REASONS);

/**
 * Accepts both signed-out and signed-in abuse reports on `/s/<token>` using ONLY the
 * non-secret `share_id` (`shr_...`) — never accepting or storing raw share tokens.
 */
export async function submitPublicSharedPageReport(
  dbAdapter,
  { reporterUserId = null, clientRateKey = 'anon', body = {}, now = new Date() }
) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new CustomerProfileDomainError('Request body must be a JSON object.', {
      status: 400,
      code: 'INVALID_JSON_OBJECT'
    });
  }
  if (Object.prototype.hasOwnProperty.call(body, 'token') || Object.prototype.hasOwnProperty.call(body, 'share_url')) {
    throw new CustomerProfileDomainError(
      'Do not transmit raw share tokens or full shared URLs in abuse reports; supply share_id only.',
      {
        status: 400,
        code: 'RAW_TOKEN_IN_REPORT_FORBIDDEN'
      }
    );
  }

  const shareId = String(body.share_id || '').trim();
  if (!/^shr_[a-f0-9]{24,40}$/.test(shareId)) {
    throw new CustomerProfileDomainError('Valid non-secret share_id reference is required.', {
      status: 400,
      code: 'INVALID_SHARE_ID'
    });
  }

  const attachmentId =
    body.attachment_id !== undefined && body.attachment_id !== null && String(body.attachment_id).trim() !== ''
      ? String(body.attachment_id).trim()
      : null;
  if (attachmentId && !/^sha_[a-f0-9]{24,40}$/.test(attachmentId)) {
    throw new CustomerProfileDomainError('Invalid attachment_id format.', {
      status: 400,
      code: 'INVALID_ATTACHMENT_ID'
    });
  }

  const reason = String(body.reason || '').trim().toLowerCase();
  if (!SHARE_REPORT_REASON_SET.has(reason)) {
    throw new CustomerProfileDomainError('Select a valid report reason.', {
      status: 400,
      code: 'INVALID_REPORT_REASON'
    });
  }

  const rawDetails = sanitizePlainText(body.details ?? '', {
    maxLen: 500,
    allowNewlines: false,
    fieldLabel: 'Report details'
  });
  // Scrub any accidentally pasted URLs, tokens, emails, or dates from report free-text!
  const scrubbedDetails = rawDetails
    ? sanitizeDiagnosticText(rawDetails, 500, '')
    : '';

  const ipHash = crypto
    .createHash('sha256')
    .update(`bs_share_rep:${String(clientRateKey || 'unknown')}`, 'utf8')
    .digest('hex')
    .slice(0, 32);

  return withTransaction(dbAdapter, async tx => {
    const rateSubject = reporterUserId ? `user:${reporterUserId}` : `ip:${ipHash}`;
    const rl = await consumeGovernanceRateLimit(tx, {
      scope: 'shared_page_report',
      subjectKey: rateSubject,
      maxHits: 5,
      windowSeconds: 3600,
      now
    });
    if (!rl.allowed) {
      throw new CustomerProfileDomainError(
        'Too many shared-page reports submitted recently. Please wait before submitting another report.',
        {
          status: 429,
          code: 'REPORT_RATE_LIMITED',
          retryable: true,
          details: { retry_after_seconds: rl.retryAfterSeconds }
        }
      );
    }

    await tx.query("SELECT set_config('app.share_lookup', 'true', true)");
    await tx.query("SELECT set_config('app.share_report_intake', 'true', true)");

    const shareLookup = await tx.query(
      `SELECT cs.id, cs.collection_id, cc.deleted_at
       FROM customer_collection_shares cs
       JOIN customer_collections cc ON cc.id = cs.collection_id
       WHERE cs.id = $1
       LIMIT 1`,
      [shareId]
    );
    if (shareLookup.rows.length === 0 || shareLookup.rows[0].deleted_at) {
      throw new CustomerProfileDomainError('Shared page reference was not found.', {
        status: 404,
        code: 'SHARE_NOT_FOUND'
      });
    }
    const collectionId = shareLookup.rows[0].collection_id;

    if (attachmentId) {
      const attCheck = await tx.query(
        `SELECT id FROM customer_collection_photo_attachments WHERE id = $1 AND collection_id = $2`,
        [attachmentId, collectionId]
      );
      if (attCheck.rows.length === 0) {
        throw new CustomerProfileDomainError('Reported photo attachment was not found on this collection.', {
          status: 404,
          code: 'ATTACHMENT_NOT_FOUND'
        });
      }
    }

    const reportId = generateOpaqueId('srp');
    await tx.query(
      `INSERT INTO customer_share_reports (
         id, share_id, collection_id, attachment_id,
         reporter_user_id, reporter_ip_hash, reason, details, status, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open', $9)`,
      [
        reportId,
        shareId,
        collectionId,
        attachmentId,
        reporterUserId || null,
        ipHash,
        reason,
        scrubbedDetails,
        now.toISOString()
      ]
    );

    return {
      ok: true,
      report_id: reportId,
      share_id: shareId,
      status: 'open'
    };
  });
}

async function enableShareModerationGuardsInTx(tx, accessCtx) {
  // IMPORTANT: `app.user_id` is set to the MODERATOR's user ID (never a customer owner's ID),
  // so PostgreSQL FORCE RLS on `customer_visits` and `customer_photos` physically blocks
  // moderators from reading any customer's private journal, private notes, or unshared photos!
  await tx.query(
    `SELECT
       set_config('app.admin_portal', 'true', true),
       set_config('app.can_moderate', 'true', true),
       set_config('app.share_moderation', 'true', true),
       set_config('app.share_lookup', 'true', true),
       set_config('app.auth_internal', 'true', true),
       set_config('app.user_id', $1, true),
       set_config('app.user_email', $2, true)`,
    [accessCtx?.user?.id || '', accessCtx?.user?.email || '']
  );
}

export async function listAdminSharedModerationQueue(
  dbAdapter,
  { accessCtx, statusFilter = '', page = 1, pageSize = 20, now = new Date() }
) {
  const safePage = Math.max(1, Math.min(200, Number.parseInt(String(page || 1), 10) || 1));
  const safeSize = Math.max(1, Math.min(50, Number.parseInt(String(pageSize || 20), 10) || 20));
  const offset = (safePage - 1) * safeSize;

  const catalogResult = await loadDiscoveryCatalog(dbAdapter, { now });
  const catalogById = new Map(catalogResult.listings.map(item => [item.id, item]));

  return withTransaction(dbAdapter, async tx => {
    await enableShareModerationGuardsInTx(tx, accessCtx);
    const modCheck = await reverifyModeratorInTx(tx, accessCtx);
    if (!modCheck.ok) {
      throw new CustomerProfileDomainError(modCheck.error, {
        status: modCheck.status || 403,
        code: 'MODERATOR_REQUIRED'
      });
    }

    const filterClause =
      statusFilter === 'suppressed'
        ? `AND cc.moderation_status = 'suppressed'`
        : statusFilter === 'open'
          ? `AND EXISTS (SELECT 1 FROM customer_share_reports r WHERE r.collection_id = cc.id AND r.status = 'open')`
          : `AND (cc.moderation_status = 'suppressed' OR EXISTS (SELECT 1 FROM customer_share_reports r WHERE r.collection_id = cc.id))`;

    const countRes = await tx.query(
      `SELECT COUNT(*)::int AS total
       FROM customer_collections cc
       WHERE cc.deleted_at IS NULL ${filterClause}`
    );
    const total = Number(countRes.rows[0]?.total || 0);

    const colsRes = await tx.query(
      `SELECT
         cc.id, cc.user_id, cc.title, cc.intro, cc.visibility_mode,
         cc.moderation_status, cc.suppression_authority, cc.suppression_reason,
         cc.suppressed_at, cc.updated_at
       FROM customer_collections cc
       WHERE cc.deleted_at IS NULL ${filterClause}
       ORDER BY
         (SELECT COUNT(*) FROM customer_share_reports r WHERE r.collection_id = cc.id AND r.status = 'open') DESC,
         cc.updated_at DESC
       LIMIT $1 OFFSET $2`,
      [safeSize, offset]
    );

    const items = [];
    for (const col of colsRes.rows) {
      const sharesRes = await tx.query(
        `SELECT
           id, masked_token_hint, status,
           include_display_name, include_bio, include_preferred_area,
           include_achievements, include_shared_photos
         FROM customer_collection_shares
         WHERE collection_id = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [col.id]
      );
      const latestShare = sharesRes.rows[0] || null;
      const aggSharesRes = await tx.query(
        `SELECT
           BOOL_OR(include_display_name) AS any_display_name,
           BOOL_OR(include_bio) AS any_bio,
           BOOL_OR(include_preferred_area) AS any_preferred_area,
           BOOL_OR(include_shared_photos) AS any_shared_photos
         FROM customer_collection_shares cs
         WHERE cs.collection_id = $1
           AND (
             cs.status IN ('active', 'suppressed')
             OR EXISTS (SELECT 1 FROM customer_share_reports r WHERE r.share_id = cs.id)
           )`,
        [col.id]
      );
      const aggShare = aggSharesRes.rows[0] || {};

      const entriesRes = await tx.query(
        `SELECT id, position, vendor_id, recorded_vendor_id, recommendation, photo_attachment_id
         FROM customer_collection_entries
         WHERE collection_id = $1
         ORDER BY position ASC`,
        [col.id]
      );

      await tx.query("SELECT set_config('app.photo_maintenance', 'true', true)");
      const attRes = await tx.query(
        `SELECT pa.id, pa.width, pa.height, pa.moderation_status, pa.revoked_at,
                (cp.id IS NOT NULL AND cp.deleted_at IS NULL) AS source_photo_active
         FROM customer_collection_photo_attachments pa
         LEFT JOIN customer_photos cp ON cp.id = pa.source_photo_id
         WHERE pa.collection_id = $1`,
        [col.id]
      );
      await tx.query("SELECT set_config('app.photo_maintenance', '', true)");
      const attachmentById = new Map(attRes.rows.map(a => [a.id, a]));

      const profRes = await tx.query(
        `SELECT display_name, bio, avatar_style, preferred_town
         FROM customer_profiles
         WHERE user_id = $1`,
        [col.user_id]
      );

      const disc = latestShare
        ? {
            include_display_name: Boolean(aggShare.any_display_name || latestShare.include_display_name),
            include_bio: Boolean(aggShare.any_bio || latestShare.include_bio),
            include_preferred_area: Boolean(aggShare.any_preferred_area || latestShare.include_preferred_area),
            include_achievements: false,
            include_shared_photos: Boolean(aggShare.any_shared_photos || latestShare.include_shared_photos)
          }
        : {
            include_display_name: false,
            include_bio: false,
            include_preferred_area: false,
            include_achievements: false,
            include_shared_photos: false
          };

      const sharedProjection = buildSharedCollectionPublicDto({
        shareId: latestShare ? latestShare.id : null,
        rawTokenForPhotoUrl: null,
        previewOwnerPhotoFallback: false,
        collectionRow: col,
        entryRows: entriesRes.rows,
        catalogById,
        attachmentById,
        profileRow: profRes.rows[0] || null,
        achievementsSummary: null,
        disclosureFlags: disc,
        featureStates: {
          shared_collection_photos: { state: 'enabled' }
        }
      });

      // Rewrite shared photo preview URL in moderation DTO to the scoped moderator attachment endpoint
      for (const pe of sharedProjection.collection.entries) {
        const rawEnt = entriesRes.rows[pe.position - 1];
        if (rawEnt && rawEnt.photo_attachment_id) {
          const att = attachmentById.get(rawEnt.photo_attachment_id);
          if (att && !att.revoked_at && att.source_photo_active) {
            pe.shared_photo = {
              attachment_id: att.id,
              moderation_status: att.moderation_status,
              image_url: `/api/admin/shared-moderation/photo?attachment_id=${encodeURIComponent(att.id)}`,
              width: Number(att.width),
              height: Number(att.height),
              alt_text: `Reported shared attachment ${att.id}`
            };
          }
        }
      }

      const reportsRes = await tx.query(
        `SELECT id, share_id, attachment_id, reason, details, status, created_at
         FROM customer_share_reports
         WHERE collection_id = $1
         ORDER BY created_at DESC
         LIMIT 25`,
        [col.id]
      );

      const eventsRes = await tx.query(
        `SELECT id, action, actor_authority, attachment_id, reason, created_at
         FROM customer_share_moderation_events
         WHERE collection_id = $1
         ORDER BY created_at DESC
         LIMIT 25`,
        [col.id]
      );

      items.push(
        buildAdminShareModerationDto({
          collectionRow: col,
          shareRow: latestShare,
          sharedProjection,
          reports: reportsRes.rows,
          moderationEvents: eventsRes.rows
        })
      );
    }

    return {
      ok: true,
      items,
      total,
      page: safePage,
      page_size: safeSize
    };
  });
}

export async function applyAdminSharedModerationDecision(
  dbAdapter,
  { accessCtx, body = {}, now = new Date() }
) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new CustomerProfileDomainError('Request body must be a JSON object.', {
      status: 400,
      code: 'INVALID_JSON_OBJECT'
    });
  }

  const collectionId = String(body.collection_id || '').trim();
  if (!/^col_[a-f0-9]{24,40}$/.test(collectionId)) {
    throw new CustomerProfileDomainError('Valid collection_id is required.', {
      status: 400,
      code: 'INVALID_COLLECTION_ID'
    });
  }

  const allowedActions = new Set([
    'suppress_collection',
    'suppress_attachment',
    'dismiss_reports',
    'reinstate_collection',
    'reinstate_attachment'
  ]);
  const action = String(body.action || '').trim();
  if (!allowedActions.has(action)) {
    throw new CustomerProfileDomainError('Unsupported moderation action.', {
      status: 400,
      code: 'INVALID_MODERATION_ACTION'
    });
  }

  const reason = sanitizePlainText(body.reason, {
    maxLen: 400,
    fieldLabel: 'Moderation reason'
  });
  if (reason.length < 4) {
    throw new CustomerProfileDomainError(
      'Enter a moderation reason (4 to 400 characters).',
      {
        status: 400,
        code: 'REASON_REQUIRED'
      }
    );
  }

  const attachmentId = body.attachment_id ? String(body.attachment_id).trim() : null;
  if (
    (action === 'suppress_attachment' || action === 'reinstate_attachment') &&
    (!attachmentId || !/^sha_[a-f0-9]{24,40}$/.test(attachmentId))
  ) {
    throw new CustomerProfileDomainError('Valid attachment_id is required for attachment moderation.', {
      status: 400,
      code: 'INVALID_ATTACHMENT_ID'
    });
  }

  return withTransaction(dbAdapter, async tx => {
    await enableShareModerationGuardsInTx(tx, accessCtx);
    const modCheck = await reverifyModeratorInTx(tx, accessCtx);
    if (!modCheck.ok) {
      throw new CustomerProfileDomainError(modCheck.error, {
        status: modCheck.status || 403,
        code: 'MODERATOR_REQUIRED'
      });
    }
    const actorAuthority = modCheck.actorRole === 'top' ? 'top' : 'mod';

    const colRes = await tx.query(
      `SELECT id, user_id, title, intro, moderation_status, suppression_authority
       FROM customer_collections
       WHERE id = $1 AND deleted_at IS NULL
       FOR UPDATE`,
      [collectionId]
    );
    if (colRes.rows.length === 0) {
      throw new CustomerProfileDomainError('Shared collection was not found.', {
        status: 404,
        code: 'COLLECTION_NOT_FOUND'
      });
    }
    const col = colRes.rows[0];

    if (action === 'reinstate_collection' && col.suppression_authority === 'top' && actorAuthority !== 'top') {
      const topCheck = await reverifyPlatformAdminInTx(tx, accessCtx);
      if (!topCheck.ok) {
        throw new CustomerProfileDomainError(
          'Only Admin: Top may reinstate a shared collection suppressed by Admin: Top.',
          {
            status: 403,
            code: 'TOP_ADMIN_REQUIRED'
          }
        );
      }
    }

    if (action === 'suppress_collection') {
      const entriesRes = await tx.query(
        `SELECT cce.recorded_vendor_id, cce.recommendation, cce.photo_attachment_id, pa.sha256_hex AS attachment_sha256
         FROM customer_collection_entries cce
         LEFT JOIN customer_collection_photo_attachments pa ON pa.id = cce.photo_attachment_id
         WHERE cce.collection_id = $1
         ORDER BY cce.position ASC`,
        [collectionId]
      );
      const digest = computeCollectionContentDigest({
        title: col.title,
        intro: col.intro,
        entries: entriesRes.rows
      });

      await tx.query(
        `UPDATE customer_collections
         SET moderation_status = 'suppressed',
             suppressed_at = $2,
             suppressed_by = $3,
             suppression_authority = $4,
             suppression_reason = $5,
             suppressed_content_sha256 = $6,
             visibility_mode = 'private',
             updated_at = $2
         WHERE id = $1`,
        [collectionId, now.toISOString(), accessCtx.user.id, actorAuthority, reason, digest]
      );

      await tx.query(
        `UPDATE customer_collection_shares
         SET status = 'suppressed',
             moderation_suppressed_at = $2,
             moderation_suppressed_by = $3,
             moderation_authority = $4,
             moderation_reason = $5,
             updated_at = $2
         WHERE collection_id = $1 AND status = 'active'`,
        [collectionId, now.toISOString(), accessCtx.user.id, actorAuthority, reason]
      );

      await tx.query(
        `UPDATE customer_share_reports
         SET status = 'reviewed_suppressed', reviewed_by = $2, reviewed_at = $3
         WHERE collection_id = $1 AND status = 'open'`,
        [collectionId, accessCtx.user.id, now.toISOString()]
      );

      await recordTestSafeNotificationInTx(tx, {
        recipientUserId: col.user_id,
        eventKind: 'shared_collection.suppressed',
        subject: 'Unlisted BiteShark shared link suppressed by moderation',
        summary: `Shared links for "${col.title}" were disabled after moderation review: ${reason}`
      });
    } else if (action === 'reinstate_collection') {
      await tx.query(
        `UPDATE customer_collections
         SET moderation_status = 'active',
             suppressed_at = NULL,
             suppressed_by = NULL,
             suppression_authority = NULL,
             suppression_reason = NULL,
             suppressed_content_sha256 = NULL,
             updated_at = $2
         WHERE id = $1`,
        [collectionId, now.toISOString()]
      );
    } else if (action === 'suppress_attachment' || action === 'reinstate_attachment') {
      const attRes = await tx.query(
        `SELECT id, moderation_status, suppression_authority
         FROM customer_collection_photo_attachments
         WHERE id = $1 AND collection_id = $2
         FOR UPDATE`,
        [attachmentId, collectionId]
      );
      if (attRes.rows.length === 0) {
        throw new CustomerProfileDomainError('Attachment was not found on this collection.', {
          status: 404,
          code: 'ATTACHMENT_NOT_FOUND'
        });
      }
      if (
        action === 'reinstate_attachment' &&
        attRes.rows[0].suppression_authority === 'top' &&
        actorAuthority !== 'top'
      ) {
        throw new CustomerProfileDomainError(
          'Only Admin: Top may reinstate a shared photo suppressed by Admin: Top.',
          {
            status: 403,
            code: 'TOP_ADMIN_REQUIRED'
          }
        );
      }

      if (action === 'suppress_attachment') {
        await tx.query(
          `UPDATE customer_collection_photo_attachments
           SET moderation_status = 'suppressed',
               suppressed_at = $3,
               suppressed_by = $4,
               suppression_authority = $5,
               suppression_reason = $6
           WHERE id = $1 AND collection_id = $2`,
          [attachmentId, collectionId, now.toISOString(), accessCtx.user.id, actorAuthority, reason]
        );
        await tx.query(
          `UPDATE customer_share_reports
           SET status = 'reviewed_suppressed', reviewed_by = $3, reviewed_at = $4
           WHERE collection_id = $1 AND attachment_id = $2 AND status = 'open'`,
          [collectionId, attachmentId, accessCtx.user.id, now.toISOString()]
        );
        await recordTestSafeNotificationInTx(tx, {
          recipientUserId: col.user_id,
          eventKind: 'shared_photo.suppressed',
          subject: 'Shared photo attachment suppressed by moderation',
          summary: `A shared photo in "${col.title}" was suppressed by moderation: ${reason}`
        });
      } else {
        await tx.query(
          `UPDATE customer_collection_photo_attachments
           SET moderation_status = 'active',
               suppressed_at = NULL,
               suppressed_by = NULL,
               suppression_authority = NULL,
               suppression_reason = NULL
           WHERE id = $1 AND collection_id = $2`,
          [attachmentId, collectionId]
        );
      }
    } else if (action === 'dismiss_reports') {
      await tx.query(
        `UPDATE customer_share_reports
         SET status = 'dismissed', reviewed_by = $2, reviewed_at = $3
         WHERE collection_id = $1 AND status = 'open'`,
        [collectionId, accessCtx.user.id, now.toISOString()]
      );
    }

    await tx.query(
      `INSERT INTO customer_share_moderation_events (
         collection_id, share_id, attachment_id, actor_user_id, actor_authority, action, reason, created_at
       ) VALUES ($1, NULL, $2, $3, $4, $5, $6, $7)`,
      [collectionId, attachmentId, accessCtx.user.id, actorAuthority, action, reason, now.toISOString()]
    );

    await recordAuditLog(tx, {
      actorId: accessCtx.user.id,
      actorRole: modCheck.legacyRole,
      targetType: 'customer_collection',
      targetId: collectionId,
      action: `shared_collection.${action}`,
      metadata: {
        authority: actorAuthority,
        ...(attachmentId ? { attachment_id: attachmentId } : {}),
        reason
      }
    });

    return {
      ok: true,
      collection_id: collectionId,
      action,
      authority: actorAuthority
    };
  });
}

// ============================================================================
// 7. Consented Re-Encoded Shared Photo Attachments Lifecycle (Commit 6)
// ============================================================================

export async function attachPhotoToCollectionEntry(
  dbAdapter,
  { userId, body = {}, storageRoot = resolvePhotoStorageRoot(), now = new Date() }
) {
  if (!userId) {
    throw new CustomerProfileDomainError('Sign in is required.', {
      status: 401,
      code: 'AUTH_REQUIRED'
    });
  }
  assertNoForbiddenClientWriteFields(body);

  const collectionId = String(body.collection_id || '').trim();
  const vendorId = String(body.vendor_id || '').trim();
  const sourcePhotoId = String(body.source_photo_id || '').trim();

  if (!/^col_[a-f0-9]{24,40}$/.test(collectionId)) {
    throw new CustomerProfileDomainError('Valid collection_id is required.', {
      status: 400,
      code: 'INVALID_COLLECTION_ID'
    });
  }
  if (!vendorId || vendorId.length > 80) {
    throw new CustomerProfileDomainError('Valid vendor_id is required.', {
      status: 400,
      code: 'INVALID_VENDOR_ID'
    });
  }
  if (!/^pht_[a-f0-9]{24,40}$/.test(sourcePhotoId)) {
    throw new CustomerProfileDomainError('Valid source_photo_id is required.', {
      status: 400,
      code: 'INVALID_PHOTO_ID'
    });
  }
  if (body.share_consent_confirmed !== true) {
    throw new CustomerProfileDomainError(
      'Explicit per-photo sharing consent (`share_consent_confirmed: true`) is required before attaching a private photo to a collection.',
      {
        status: 400,
        code: 'PHOTO_CONSENT_REQUIRED'
      }
    );
  }

  // Step 1: Verify ownership of collection, entry, and source photo before touching filesystem
  const preflight = await withTransaction(dbAdapter, async tx => {
    await setOwnerProfileRlsInTx(tx, userId);

    const colRes = await tx.query(
      `SELECT id, moderation_status
       FROM customer_collections
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [collectionId, userId]
    );
    if (colRes.rows.length === 0) {
      throw new CustomerProfileDomainError('Collection was not found.', {
        status: 404,
        code: 'COLLECTION_NOT_FOUND'
      });
    }
    if (colRes.rows[0].moderation_status === 'suppressed') {
      throw new CustomerProfileDomainError(
        'Cannot attach new shared photos while this collection is suppressed by moderation.',
        {
          status: 403,
          code: 'COLLECTION_SUPPRESSED_BY_MODERATION'
        }
      );
    }

    const entryRes = await tx.query(
      `SELECT id, photo_attachment_id
       FROM customer_collection_entries
       WHERE collection_id = $1 AND user_id = $2 AND recorded_vendor_id = $3`,
      [collectionId, userId, vendorId]
    );
    if (entryRes.rows.length === 0) {
      throw new CustomerProfileDomainError(
        'Save this spot in the collection first before attaching a photo to it.',
        {
          status: 404,
          code: 'COLLECTION_ENTRY_NOT_FOUND'
        }
      );
    }

    const photoRes = await tx.query(
      `SELECT id, storage_rel_path, sha256_hex
       FROM customer_photos
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [sourcePhotoId, userId]
    );
    if (photoRes.rows.length === 0) {
      throw new CustomerProfileDomainError('Private photo was not found in your account.', {
        status: 404,
        code: 'PHOTO_NOT_FOUND'
      });
    }

    const suppressedPhotoRes = await tx.query(
      `SELECT id
       FROM customer_collection_photo_attachments
       WHERE user_id = $1
         AND moderation_status = 'suppressed'
         AND recorded_source_photo_id = $2
       LIMIT 1`,
      [userId, sourcePhotoId]
    );
    if (suppressedPhotoRes.rows.length > 0) {
      throw new CustomerProfileDomainError(
        'This photo was previously suppressed by moderation and cannot be re-attached to shared collections.',
        {
          status: 403,
          code: 'PHOTO_SUPPRESSED_BY_MODERATION'
        }
      );
    }

    const activePhotoSharesRes = await tx.query(
      `SELECT id
       FROM customer_collection_shares
       WHERE collection_id = $1
         AND user_id = $2
         AND status = 'active'
         AND include_shared_photos = true
         AND (expires_at IS NULL OR expires_at > $3)`,
      [collectionId, userId, now.toISOString()]
    );
    if (activePhotoSharesRes.rows.length > 0 && body.confirm_shared_view_update !== true) {
      throw new CustomerProfileDomainError(
        'This collection has an active unlisted link with photo sharing enabled. Confirm "Update shared view" (`confirm_shared_view_update: true`) before publishing this photo.',
        {
          status: 409,
          code: 'SHARED_VIEW_CONFIRMATION_REQUIRED'
        }
      );
    }

    return {
      entryId: entryRes.rows[0].id,
      previousAttachmentId: entryRes.rows[0].photo_attachment_id || null,
      sourceRelPath: photoRes.rows[0].storage_rel_path
    };
  });

  // Step 2: Create separate EXIF-stripped WebP shared derivative (`<shard>/sha_<id>_shared.webp`)
  const attachmentId = generateOpaqueId('sha');
  let deriv;
  try {
    deriv = await createSharedPhotoDerivative({
      storageRoot,
      sourceRelPath: preflight.sourceRelPath,
      attachmentId
    });
  } catch (err) {
    if (err instanceof PhotoStorageError) {
      throw new CustomerProfileDomainError(err.message, {
        status: err.status,
        code: err.code,
        retryable: err.retryable
      });
    }
    throw err;
  }

  // Step 3: Commit DB record atomically (unlinking new file if DB commit fails)
  const catalogResult = await loadDiscoveryCatalog(dbAdapter, { now });
  const catalogById = new Map(catalogResult.listings.map(item => [item.id, item]));
  let prevSharedRelToClean = null;

  try {
    const out = await withTransaction(dbAdapter, async tx => {
      await setOwnerProfileRlsInTx(tx, userId);
      await tx.query("SELECT pg_advisory_xact_lock(hashtext('bs_cust_col:' || $1))", [collectionId]);

      const dupHashSuppressed = await tx.query(
        `SELECT id
         FROM customer_collection_photo_attachments
         WHERE user_id = $1
           AND moderation_status = 'suppressed'
           AND (recorded_source_photo_id = $2 OR sha256_hex = $3)
         LIMIT 1`,
        [userId, sourcePhotoId, deriv.sha256Hex]
      );
      if (dupHashSuppressed.rows.length > 0) {
        throw new CustomerProfileDomainError(
          'This photo was previously suppressed by moderation and cannot be re-attached to shared collections.',
          {
            status: 403,
            code: 'PHOTO_SUPPRESSED_BY_MODERATION'
          }
        );
      }

      if (preflight.previousAttachmentId) {
        const oldAtt = await tx.query(
          `UPDATE customer_collection_photo_attachments
           SET revoked_at = $3
           WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL
           RETURNING shared_rel_path, moderation_status`,
          [preflight.previousAttachmentId, userId, now.toISOString()]
        );
        if (oldAtt.rows[0]?.moderation_status !== 'suppressed') {
          prevSharedRelToClean = oldAtt.rows[0]?.shared_rel_path || null;
        }
      }

      await tx.query(
        `INSERT INTO customer_collection_photo_attachments (
           id, collection_id, user_id, source_photo_id, recorded_source_photo_id,
           shared_rel_path, mime_type, byte_size, width, height, sha256_hex,
           share_consent_confirmed, consented_at, moderation_status, created_at
         ) VALUES ($1, $2, $3, $4, $4, $5, 'image/webp', $6, $7, $8, $9, true, $10, 'active', $10)`,
        [
          attachmentId,
          collectionId,
          userId,
          sourcePhotoId,
          deriv.sharedRelPath,
          deriv.byteSize,
          deriv.width,
          deriv.height,
          deriv.sha256Hex,
          now.toISOString()
        ]
      );

      await tx.query(
        `UPDATE customer_collection_entries
         SET photo_attachment_id = $3, updated_at = $4
         WHERE id = $1 AND user_id = $2`,
        [preflight.entryId, userId, attachmentId, now.toISOString()]
      );

      await tx.query(
        `UPDATE customer_collections
         SET revision = revision + 1, updated_at = $3
         WHERE id = $1 AND user_id = $2`,
        [collectionId, userId, now.toISOString()]
      );

      const dto = await loadCollectionHydratedInTx(tx, {
        userId,
        collectionId,
        catalogById,
        now
      });
      return {
        ok: true,
        attachment_id: attachmentId,
        collection: dto
      };
    });

    if (prevSharedRelToClean) {
      unlinkConfinedPhotoArtifact({ storageRoot, relPath: prevSharedRelToClean });
    }
    return out;
  } catch (err) {
    unlinkConfinedPhotoArtifact({ storageRoot, relPath: deriv.sharedRelPath });
    throw err;
  }
}

export async function removePhotoFromCollectionEntry(
  dbAdapter,
  { userId, body = {}, storageRoot = resolvePhotoStorageRoot(), now = new Date() }
) {
  if (!userId) {
    throw new CustomerProfileDomainError('Sign in is required.', {
      status: 401,
      code: 'AUTH_REQUIRED'
    });
  }
  assertNoForbiddenClientWriteFields(body);

  const collectionId = String(body.collection_id || '').trim();
  const attachmentId = String(body.attachment_id || '').trim();
  if (!/^col_[a-f0-9]{24,40}$/.test(collectionId) || !/^sha_[a-f0-9]{24,40}$/.test(attachmentId)) {
    throw new CustomerProfileDomainError('Valid collection_id and attachment_id are required.', {
      status: 400,
      code: 'INVALID_ATTACHMENT_ID'
    });
  }

  const catalogResult = await loadDiscoveryCatalog(dbAdapter, { now });
  const catalogById = new Map(catalogResult.listings.map(item => [item.id, item]));

  const txOut = await withTransaction(dbAdapter, async tx => {
    await setOwnerProfileRlsInTx(tx, userId);
    await tx.query("SELECT pg_advisory_xact_lock(hashtext('bs_cust_col:' || $1))", [collectionId]);

    const revRes = await tx.query(
      `UPDATE customer_collection_photo_attachments
       SET revoked_at = $4
       WHERE id = $1 AND collection_id = $2 AND user_id = $3 AND revoked_at IS NULL
       RETURNING id, shared_rel_path, moderation_status`,
      [attachmentId, collectionId, userId, now.toISOString()]
    );
    if (revRes.rows.length === 0) {
      throw new CustomerProfileDomainError('Photo attachment was not found on this collection.', {
        status: 404,
        code: 'ATTACHMENT_NOT_FOUND'
      });
    }

    await tx.query(
      `UPDATE customer_collection_entries
       SET photo_attachment_id = NULL, updated_at = $3
       WHERE collection_id = $1 AND user_id = $2 AND photo_attachment_id = $4`,
      [collectionId, userId, now.toISOString(), attachmentId]
    );

    await tx.query(
      `UPDATE customer_collections
       SET revision = revision + 1, updated_at = $3
       WHERE id = $1 AND user_id = $2`,
      [collectionId, userId, now.toISOString()]
    );

    const dto = await loadCollectionHydratedInTx(tx, {
      userId,
      collectionId,
      catalogById,
      now
    });

    return {
      sharedRelPath: revRes.rows[0].moderation_status === 'suppressed' ? null : revRes.rows[0].shared_rel_path,
      dto
    };
  });

  if (txOut.sharedRelPath && unlinkConfinedPhotoArtifact({ storageRoot, relPath: txOut.sharedRelPath })) {
    try {
      await withTransaction(dbAdapter, async tx => {
        await setOwnerProfileRlsInTx(tx, userId);
        await tx.query(
          `UPDATE customer_collection_photo_attachments SET files_purged_at = now() WHERE id = $1 AND user_id = $2`,
          [attachmentId, userId]
        );
      });
    } catch {}
  }

  return {
    ok: true,
    removed_attachment_id: attachmentId,
    collection: txOut.dto
  };
}

/**
 * Re-verifies all active share, feature, eligibility, moderation, and source-photo invariants
 * on EVERY `/s/<token>/photo/<attachment>` request before streaming the WebP derivative.
 */
export async function readSharedCollectionPhotoByToken(
  dbAdapter,
  {
    rawToken,
    attachmentId,
    systemFeatureStates = {},
    storageRoot = resolvePhotoStorageRoot(),
    now = new Date()
  }
) {
  if (
    systemFeatureStates?.greatest_hits_collections?.system_state === 'hidden' ||
    systemFeatureStates?.greatest_hits_collections?.state === 'hidden' ||
    systemFeatureStates?.unlisted_collection_sharing?.system_state === 'hidden' ||
    systemFeatureStates?.unlisted_collection_sharing?.state === 'hidden' ||
    systemFeatureStates?.shared_collection_photos?.system_state === 'hidden' ||
    systemFeatureStates?.shared_collection_photos?.state === 'hidden'
  ) {
    return { available: false };
  }

  const tokenStr = String(rawToken || '').trim();
  const cleanAttId = String(attachmentId || '').trim();
  if (!/^[A-Za-z0-9_-]{32,80}$/.test(tokenStr) || !/^sha_[a-f0-9]{24,40}$/.test(cleanAttId)) {
    return { available: false };
  }
  const tokenSha256 = hashRawShareToken(tokenStr);

  const dbCheck = await withTransaction(dbAdapter, async tx => {
    await tx.query("SELECT set_config('app.user_id', '', true)");
    await tx.query("SELECT set_config('app.share_lookup', 'true', true)");

    const shareRes = await tx.query(
      `SELECT
         cs.id, cs.collection_id, cs.user_id, cs.status, cs.expires_at, cs.include_shared_photos,
         cc.deleted_at, cc.moderation_status
       FROM customer_collection_shares cs
       JOIN customer_collections cc ON cc.id = cs.collection_id
       WHERE cs.token_sha256 = $1
       LIMIT 1`,
      [tokenSha256]
    );
    if (shareRes.rows.length === 0) return null;
    const sh = shareRes.rows[0];
    if (
      sh.status !== 'active' ||
      !sh.include_shared_photos ||
      sh.deleted_at ||
      sh.moderation_status !== 'active' ||
      (sh.expires_at && new Date(sh.expires_at).getTime() <= now.getTime())
    ) {
      return null;
    }

    await tx.query("SELECT set_config('app.auth_internal', 'true', true)");
    const ownerRes = await tx.query(
      `SELECT disabled_at, age_eligibility_status FROM auth_users WHERE id = $1`,
      [sh.user_id]
    );
    await tx.query("SELECT set_config('app.auth_internal', '', true)");
    if (
      ownerRes.rows.length === 0 ||
      ownerRes.rows[0].disabled_at !== null ||
      ownerRes.rows[0].age_eligibility_status !== 'eligible_14_plus'
    ) {
      return null;
    }

    const eligRes = await tx.query(
      `SELECT eligibility_status FROM customer_sharing_eligibility WHERE user_id = $1`,
      [sh.user_id]
    );
    if (eligRes.rows.length === 0 || eligRes.rows[0].eligibility_status !== 'eligible_18_plus') {
      return null;
    }

    // Verify entry on this collection still references `cleanAttId`, vendor is publicly discoverable,
    // attachment is active & consented & not suppressed, AND source private photo is NOT deleted!
    await tx.query("SELECT set_config('app.photo_maintenance', 'true', true)");
    const attRes = await tx.query(
      `SELECT
         pa.shared_rel_path, pa.mime_type, pa.revoked_at, pa.moderation_status, pa.share_consent_confirmed,
         ce.vendor_id,
         (cp.id IS NOT NULL AND cp.deleted_at IS NULL) AS source_photo_active
       FROM customer_collection_entries ce
       JOIN customer_collection_photo_attachments pa ON pa.id = ce.photo_attachment_id
       LEFT JOIN customer_photos cp ON cp.id = pa.source_photo_id
       WHERE ce.collection_id = $1
         AND pa.id = $2
         AND pa.collection_id = $1
       LIMIT 1`,
      [sh.collection_id, cleanAttId]
    );
    await tx.query("SELECT set_config('app.photo_maintenance', '', true)");

    if (attRes.rows.length === 0) return null;
    const att = attRes.rows[0];
    if (
      att.revoked_at ||
      att.moderation_status !== 'active' ||
      !att.share_consent_confirmed ||
      !att.source_photo_active ||
      !att.vendor_id
    ) {
      return null;
    }

    const vendRes = await tx.query(
      `SELECT id, is_active, hidden_from_discovery, restriction_authority, temp_restriction_expires_at
       FROM vendors WHERE id = $1`,
      [att.vendor_id]
    );
    if (vendRes.rows.length === 0 || !isVendorPubliclyDiscoverable(vendRes.rows[0], now.getTime())) {
      return null;
    }

    return {
      sharedRelPath: att.shared_rel_path,
      mimeType: att.mime_type || 'image/webp'
    };
  });

  if (!dbCheck) {
    return { available: false };
  }

  try {
    const bytes = readPhotoDerivativeSafely({ storageRoot, relPath: dbCheck.sharedRelPath });
    return {
      available: true,
      bytes,
      mimeType: dbCheck.mimeType
    };
  } catch {
    return { available: false };
  }
}

/**
 * Strictly scoped moderator inspection of a reported shared photo derivative (`sha_...` ONLY —
 * never allows reading arbitrary `pht_*` private photos!).
 */
export async function readAdminReportedSharedPhoto(
  dbAdapter,
  { accessCtx, attachmentId, storageRoot = resolvePhotoStorageRoot() }
) {
  const cleanAttId = String(attachmentId || '').trim();
  if (!/^sha_[a-f0-9]{24,40}$/.test(cleanAttId)) {
    throw new CustomerProfileDomainError('Invalid shared attachment identifier.', {
      status: 400,
      code: 'INVALID_ATTACHMENT_ID'
    });
  }

  const relInfo = await withTransaction(dbAdapter, async tx => {
    await enableShareModerationGuardsInTx(tx, accessCtx);
    const modCheck = await reverifyModeratorInTx(tx, accessCtx);
    if (!modCheck.ok) {
      throw new CustomerProfileDomainError(modCheck.error, {
        status: modCheck.status || 403,
        code: 'MODERATOR_REQUIRED'
      });
    }

    await tx.query("SELECT set_config('app.photo_maintenance', 'true', true)");
    const { rows } = await tx.query(
      `SELECT
         pa.shared_rel_path, pa.mime_type, pa.revoked_at,
         (cp.id IS NOT NULL AND cp.deleted_at IS NULL) AS source_photo_active,
         (
           cc.moderation_status = 'suppressed'
           OR pa.moderation_status = 'suppressed'
           OR EXISTS (SELECT 1 FROM customer_share_reports r WHERE r.collection_id = cc.id)
         ) AS in_moderation_scope
       FROM customer_collection_photo_attachments pa
       JOIN customer_collections cc ON cc.id = pa.collection_id
       LEFT JOIN customer_photos cp ON cp.id = pa.source_photo_id
       WHERE pa.id = $1 AND cc.deleted_at IS NULL
       LIMIT 1`,
      [cleanAttId]
    );
    await tx.query("SELECT set_config('app.photo_maintenance', '', true)");

    if (rows.length === 0 || !rows[0].in_moderation_scope) {
      throw new CustomerProfileDomainError('Shared photo attachment is not available in moderation scope.', {
        status: 404,
        code: 'ATTACHMENT_NOT_FOUND'
      });
    }
    return rows[0];
  });

  const bytes = readPhotoDerivativeSafely({ storageRoot, relPath: relInfo.shared_rel_path });
  return {
    bytes,
    mimeType: relInfo.mime_type || 'image/webp'
  };
}
