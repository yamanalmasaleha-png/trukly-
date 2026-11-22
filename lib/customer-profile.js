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
import { loadDiscoveryCatalog, isVendorPubliclyDiscoverable } from './discovery.js';
import {
  computeExplorationSummaryInTx,
  listUserVisits,
  listUserPhotos,
  listUserSavedTrails,
  exportUserExplorationData
} from './customer-exploration.js';
import { resolvePhotoStorageRoot } from './photo-storage.js';

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
        .filter(b => b.unlocked)
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

    return {
      profileRow,
      sharingEligibility,
      notificationSettings,
      favRows: favRes.rows,
      explorationSummary,
      collectionsSummary,
      activeShareRows: sharesRes.rows
    };
  });

  // Bounded previews reusing canonical exploration services (no full lifetime downloads!)
  const [visitsPreview, photosPreview, trailsPreview] = await Promise.all([
    visitJournalVisible
      ? listUserVisits(dbAdapter, { userId, limit: 5, offset: 0, now })
      : Promise.resolve({ visits: [], pagination: { total: 0 } }),
    photosVisible
      ? listUserPhotos(dbAdapter, { userId, limit: 4, offset: 0, now })
      : Promise.resolve({ photos: [] }),
    trailsVisible
      ? listUserSavedTrails(dbAdapter, { userId, limit: 4, offset: 0, now })
      : Promise.resolve({ trails: [], pagination: { total: 0 } })
  ]);

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
