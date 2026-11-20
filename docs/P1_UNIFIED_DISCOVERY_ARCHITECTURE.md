> VPS-only deployment: follow [VPS operations](VPS_OPERATIONS.md). Historical hosted-platform references below are provenance, not release requirements.

# P1 Unified Discovery & Owner Publishing Architecture

This document defines the schema ownership, override merge rules, truthful location taxonomy, Pacific schedule precedence, caching/freshness contract, and migration/rollback plan for the P1 unified discovery vertical slice (`improve/p1-unified-discovery`, branched from P0 candidate `44f9682`).

> **Dependency & Deployment Gate:**
> `improve/p1-unified-discovery` builds on the P0 RBAC, booking, and RLS hardening (`migrations/011`–`013`, `lib/authz.js`, `lib/dates.js`, `lib/db-tx.js`). Production deployment requires the corresponding VPS staging gates and review of the exact release; historical hosted-platform gates are retired.

---

## 1. Database Ownership & Table Responsibilities

No competing vendor registry is introduced; all 59 canonical Sonoma County listings live in `vendors` (`migrations/011` + extended in `migrations/014_unified_discovery_catalog.sql`):

| Table | Authoritative Owner | Columns Owned | Write Access |
|---|---|---|---|
| `vendors` | Platform / Seed Migration (`011`, `014`) | `id` (59 canonical IDs), `sort_order` (`1..59`), `canonical_name`, `section`, `cuisine`, `emoji`, `city`, `listing_kind`, `listing_type`, `kind_label`, `popup`, `extra`, `blurb`, `special_note`, `source_url`, `story_source_url`, `checked_label`, `price`, `color`, `tags`, `rating`, `reviews`, `featured`, `curated_location`, `curated_lat`, `curated_lng`, `curated_location_source`, `curated_location_accuracy`, `curated_hours`, `recurring_schedule`, **`verified`**, **`verification_status`**, **`photo`**, **`photo_rights_verified`**, `event_bookable`, `is_active`, `updated_at` | Platform/migrations only. Vendor owners/staff **cannot** write `vendors` or elevate `verified` / `photo_rights_verified`. |
| `owner_profiles` | Authorized Vendor `owner` (`POST /api/owner/profile`) | `truck_id`, `display_name`, `description`, `cuisine`, `accepting_bookings`, `updated_at` | Vendor `owner` (own vendor) or `platform_admin`. (`staff` denied `403`.) |
| `truck_settings` | Authorized Vendor `owner` / `staff` (`POST /api/owner/location`) | `truck_id`, `location`, `lat`, `lng`, `location_source`, `location_accuracy`, `is_open`, `opens_at`, `closes_at`, `observed_at`, `expires_at`, `updated_at` | Vendor `owner`/`staff` (own vendor) or `platform_admin`. |
| `owner_schedule` | Authorized Vendor `owner` / `staff` (`POST /api/owner/schedule`) | `id`, `truck_id`, `service_date` (`DATE`), `opens_at`, `closes_at`, `location`, `status` (`scheduled` \| `unavailable`), `updated_at` | Vendor `owner`/`staff` (own vendor) or `platform_admin`. |

---

## 2. Read-Model Merge & Precedence Rules (`lib/discovery.js`)

### 2.1 Descriptive Overrides (`vendors` + `owner_profiles`)
- `name`: `COALESCE(NULLIF(btrim(op.display_name), ''), v.canonical_name)` (`canonical_name` retained separately for reference and search).
- `cuisine`: `COALESCE(NULLIF(btrim(op.cuisine), ''), v.cuisine)`.
- `blurb`: `COALESCE(NULLIF(btrim(op.description), ''), v.blurb)`.
- `tags`: Union of curated `v.tags` and `cuisine` (if `cuisine` matches a catalog section), preserving existing category counts while making updated cuisines immediately filterable/searchable.
- `verified`, `verification_status`, `photo_rights_verified`, `photo`: Strictly read from `vendors`; `photo` is suppressed (`null`) unless `v.photo_rights_verified = true` and URL is non-stock. Any owner API payload attempting to set `verified`, `verification_status`, `photo_rights_verified`, or `photo` is rejected with `403`.

### 2.2 Truthful Location Taxonomy & Expiry
Locations are resolved at read time against `now`:
1. **Active owner-reported location** (`truck_settings` present and `expires_at > now`; legacy rows with `expires_at IS NULL` expire 12h after `updated_at`):
   - `location = ts.location`
   - `location_source = 'owner_reported'`
   - If `ts.lat` and `ts.lng` are present: `lat = ts.lat`, `lng = ts.lng`, `location_accuracy = 'owner_reported_coords'` (**never** `'verified_coordinate'`).
   - If text-only (`ts.lat IS NULL`): `location_accuracy = 'owner_text_only'`; does **not** fabricate verified GPS coordinates (retains curated pin only for area map context without measured mileage claims, or `null` if unpinned).
   - `location_observed_at = ts.observed_at`, `location_expires_at = ts.expires_at`, `location_is_live = (ts.is_open = true)`, `location_expired = false`.
2. **Active today date-specific service location** (`owner_schedule` for `todayPacific` with `status = 'scheduled'` and non-empty `location`, when no non-expired `owner_reported` override supersedes it):
   - `location = os_today.location`, `location_source = 'temporary_service'`, `location_accuracy = 'owner_text_only'`, `location_is_live = (open === true)`.
3. **Curated baseline** (including when an earlier `truck_settings` report has expired: `expires_at <= now`, which sets `location_expired = true` and `location_is_live = false`):
   - `location = v.curated_location`, `lat = v.curated_lat`, `lng = v.curated_lng`, `location_source = v.curated_location_source` (`'venue_published'` \| `'curated_illustrative'` \| `'unknown'`), `location_accuracy = v.curated_location_accuracy` (`'verified_coordinate'` \| `'venue_address'` \| `'illustrative_pin'` \| `'none'`).

**Distance & Radius Policy:**
- Numeric Haversine `distance` is computed **only** when user coordinates are provided AND `location_accuracy` is `'verified_coordinate'`, `'venue_address'`, or non-expired `'owner_reported_coords'`.
- Listings with `'illustrative_pin'`, `'owner_text_only'`, or `'none'` always have `distance: null` so illustrative coordinates are never presented as measured proximity or used to claim exact radius distance.

### 2.3 Pacific Schedule Precedence, Overnight Windows & DST (`America/Los_Angeles`)
Evaluated at `now` converted via `Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', ... })` (handling PST/PDT daylight-saving transitions automatically) using both `todayPacific` (`YYYY-MM-DD`) and `yesterdayPacific` (`YYYY-MM-DD`):
1. **Explicit unavailability today** (`owner_schedule` on `todayPacific` with `status = 'unavailable'`):
   - `open = false`, `schedule_source = 'owner_schedule'`, `schedule_status = 'unavailable_today'`, `is_confirmed_service = false`. Overrides all live/recurring windows.
2. **Active overnight spillover from yesterday** (`owner_schedule` on `yesterdayPacific` with `status = 'scheduled'`, `opens_at > closes_at`, and `localMinutes < closesMinutes`, provided today is not marked `unavailable`):
   - `open = true`, `schedule_source = 'owner_schedule'`, `schedule_status = 'owner_scheduled_open'`, `is_confirmed_service = true`.
3. **Date-specific schedule today** (`owner_schedule` on `todayPacific` with `status = 'scheduled'`):
   - Evaluates `[opens_at, closes_at)` (supporting both same-day `opens_at < closes_at` and overnight `opens_at > closes_at` where `localMinutes >= opens_at`, or all-day if times are null).
   - `schedule_source = 'owner_schedule'`, `schedule_status = open ? 'owner_scheduled_open' : 'owner_scheduled_closed'`, `is_confirmed_service = open`.
4. **Non-expired live owner setting** (`truck_settings` where `expires_at > now`):
   - If `is_open = false` -> `open = false`, `schedule_source = 'owner_live'`, `schedule_status = 'owner_paused_today'`, `is_confirmed_service = false`.
   - If `is_open = true` -> evaluates optional `[opens_at, closes_at)` (including overnight) or `true`; `schedule_source = 'owner_live'`, `schedule_status = open ? 'owner_live_open' : 'owner_live_closed'`, `is_confirmed_service = open`.
5. **Curated recurring hours** (`vendors.recurring_schedule` JSONB):
   - Evaluates weekday + `[opens, closes)` in Pacific time; `schedule_source = 'published_recurring'`, `schedule_status = open ? 'published_hours_unverified' : 'outside_published_hours'`, `is_confirmed_service = false` (always labeled estimated/published, never confirmed live service).
6. **Unconfirmed fallback:** `open = null`, `schedule_source = 'unverified'`, `schedule_status = 'unconfirmed'`, `is_confirmed_service = false`.

> **Booking authority:** Discovery `open` labels never grant booking eligibility; `POST /api/bookings/create` continues enforcing `vendors.event_bookable`, `owner_profiles.accepting_bookings`, and `owner_schedule` row-locked checks on the server.

---

## 3. API Consumers, Freshness Strategy & Outage Behavior

All customer discovery routes consume `lib/discovery.js` against PostgreSQL:
- `GET /api/trucks`: Returns all **59** active listings (`47` primary `extra: false` + `12` neighborhood `extra: true`), `total: 59`, `primary_total: 47`, `sections`, `counts`, `catalog_version`, `local_date` (`YYYY-MM-DD`), `timezone: "America/Los_Angeles"`. Supports optional `?lat=&lng=` for measured distances and `?fresh=1` for cache-bypassing reads.
- `GET /api/trucks/[id]`: Returns the single unified listing for any of the **59** active IDs (including `type` alias for `listing_type`, truthful location metadata, schedule metadata, `accepting_bookings`, and `catalog_version`), or `404` if unknown/quarantined.
- `GET /api/trucks/search`: Accent-folded search across all **59** active listings (`name`, `canonical_name`, `cuisine`, `kind`, `tags`, `city`, `location`, `blurb`), reflecting owner updates immediately (`limit` `1..100`, default `20`), plus `catalog_version`.
- `GET /api/catalog/featured`: Returns active `featured = true` IDs and summaries from `vendors` + `catalog_version`.
- `GET /api/schedule/today`: Returns scheduled events for `local_date` (`YYYY-MM-DD`) from `owner_schedule` joined to active `vendors` & `owner_profiles`.

### Freshness, Caching & Outage Contract
- **Version token & headers:** Responses include `catalog_version` (`v1:<max_updated_epoch_ms>:<row_count>`) and `ETag`. Default `Cache-Control` is `public, max-age=0, s-maxage=5, stale-while-revalidate=10` (`no-store` when `?fresh=1` is passed).
- **Visibility SLA:** Owner profile, location, and schedule updates advance `updated_at` -> `catalog_version` immediately (`0s` on `?fresh=1` / revalidated browser fetch; `<= 5s` max shared edge TTL). When an owner publishes in the UI, `public/app.js` immediately calls `refreshDiscoveryCatalog({ fresh: true })`.
- **Browser cache & offline fallback:** `public/app.js` removes `neighborhoodAdditions` / `mergeNeighborhoodAdditions()`, caches `{ catalog_version, fetched_at, trucks }` in `localStorage` (`truckly_catalog_v2`, 15-minute warm-start TTL, always revalidated on `init()`), and falls back to the 6-item Sonoma sample **only** when live fetch fails and no valid cache exists — surfacing an explicit offline/degraded notice.
- **Explicit DB outage errors:** When PostgreSQL reads fail on `GET /api/trucks`, `GET /api/trucks/[id]`, `GET /api/trucks/search`, `GET /api/catalog/featured`, or `GET /api/schedule/today`, handlers return **HTTP `503`** `{ error: "...", code: "DISCOVERY_DB_UNAVAILABLE", retryable: true }` rather than an empty `200` list.

---

## 4. Migration & Rollback Plan

- **Additive Migration (`migrations/014_unified_discovery_catalog.sql`):** Adds discovery columns and `CHECK` constraints to `vendors`, `truck_settings`, and `owner_schedule`, and deterministically upserts the 59 canonical Sonoma County listings while preserving any quarantined legacy `vendors` rows (`is_active = false`) and all existing `owner_profiles`, `truck_settings`, `owner_schedule`, `bookings`, `pickup_pagers`, and `community_reviews` data.
- **Rollback:** All `014` schema changes are additive (`ADD COLUMN IF NOT EXISTS`). Reverting application code to P0 (`harden/p0-vendor-booking-community` `44f9682`) requires **zero** SQL rollback because P0 handlers ignore the extra `014` columns and all `014` columns have safe defaults / nullable definitions!
