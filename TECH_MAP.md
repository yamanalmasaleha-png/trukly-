# BiteShark Technical Map (Formerly Truckly)

This file is an architecture and editing guide for humans and LLM agents working on BiteShark (`working/biteshark-vps`).

Read this together with [`README.md`](./README.md) and [`docs/STANDALONE_VPS_RUNTIME_AND_AUTH.md`](./docs/STANDALONE_VPS_RUNTIME_AND_AUTH.md) before making changes.

---

# 1. System overview

BiteShark is a mobile-first Sonoma County food-truck, market, farm-stand, and café discovery, event-inquiry, and pickup-pager web app running on a standalone Node 22 + PostgreSQL 16 Linux VPS (`server/index.js` behind TLS Nginx on `172.233.140.74`, candidate branch `working/biteshark-vps`), while preserving compatibility with the 30-route `api/**/*.js` handler contract originally built on Hatchable.

High-level flow:

```text
Browser
  |
  |-- public/index.html
  |-- public/theme.css
  |-- public/app.js
  |
  +---- GET /api/trucks --------------------------+
  |                                               |
  +---- GET /api/trucks/search                    |
  +---- GET /api/trucks/:id                       |
  +---- GET /api/trucks/nearby                    |
  +---- GET /api/trucks/availability              |
  |                                               |
  +---- POST /api/bookings/create                 |
  +---- GET  /api/bookings/list                   |
  |                                               |
  +---- favorites / notifications                 |
  |                                               v
  +---- owner/admin APIs -----------------> Hatchable Functions
                                                   |
                                                   v
                                              PostgreSQL
```

Frontend and backend are intentionally simple:
- no React/Vue/Svelte
- no bundler
- no generated client
- no ORM
- no shared TypeScript model layer

That means API response shapes and DOM IDs are important integration contracts.

---

# 2. Runtime platform

## Hosting

- **Active standalone VPS staging:** `https://staging.biteshark.live` (`172.233.140.74`)
- **Canonical main domain (holding page until production release is separately authorized):** `https://biteshark.live` (`https://www.biteshark.live` redirects to `https://biteshark.live`)
- **Candidate installation branch:** `working/biteshark-vps`
- **Historical Hatchable deployment (untouched):** `https://truckly.hatchable.site` (`proj_MEO518rmLLl0`)

## Frontend runtime

Static files in `public/` are served directly.

The frontend loads:
- Leaflet 1.9.4 from unpkg
- OpenStreetMap raster tiles
- Truckly API endpoints under `/api`

The app determines its API base with:

```js
const API = (window.__HATCHABLE__ && window.__HATCHABLE__.api) || '/api';
```

## Backend runtime

Each file under `api/**/*.js` is a Hatchable server function.

Common pattern:

```js
export const access = "public";
export const methods = ["GET"];

export default async function(req, res) {
  // ...
}
```

Some functions import:

```js
import { db, auth } from "hatchable";
```

Do not replace this with Node/Express conventions unless the hosting architecture is intentionally being changed.

---

# 3. Frontend map

## public/index.html

Primary responsibilities:
- app shell
- top navigation
- Discover screen
- Map/List switch
- search input
- cuisine filters
- nearby/open/radius controls
- truck card container
- Favorites screen
- Bookings screen
- Owner Mode screen
- bottom navigation
- truck detail modal
- booking modal
- distance modal
- Leaflet bootstrapping

Important DOM IDs used by JavaScript include:

```text
discoverScreen
favoritesScreen
bookingsScreen
ownerScreen
profileMenu
profileAvatar
profileHeading
profileSub
authSignInLink
authSignOutBtn
map
mapMode
listMode
searchInput
filters
openNow
openHoursNote
mapEmpty
distanceText
nearbyCount
truckSheet
truckCards
nearbyAlertToggle
nearbyAlertRadius
nearbyAlertMeta
favoriteGrid
bookingList
ownerModeBanner
ownerTruckSelect
ownerTitle
ownerSubtitle
ownerStatusPill
statTotalRequests
statPendingRequests
statAcceptedRequests
ownerLocation
ownerScheduleDate
ownerScheduleWeekday
ownerOpensAt
ownerClosesAt
ownerIsOpen
ownerScheduleList
ownerPhotoGrid
ownerRequests
ownerRequestCount
ownerProfileModal
ownerProfileName
ownerProfileCuisine
ownerProfileBio
ownerAcceptingBookings
detailModal
detailContent
bookingModal
bookingTruck
bookingTruckLabel
eventType
eventDate
guestCount
eventLocation
eventNote
bookingError
bookingSubmitBtn
distanceModal
distanceRange
rangeValue
toast
```

If you rename an ID in `index.html`, search `public/app.js` and `public/listing-highlights.js` for all references and update them together.

### Key interaction contracts

- Brand button opens owner mode (`loadOwnerDashboard()` runs on navigation to `ownerScreen`).
- Map/List are separate modes.
- Search runs accent-insensitively client-side on the loaded catalog.
- Cuisine filter buttons use `data-cuisine`.
- Bottom navigation calls global functions in `app.js`.
- Booking package radios use fixed values:
  - `dropin` ($750, max 50)
  - `party` ($1500, max 100)
  - `festival` ($2900, max 250)

These values must stay aligned with `api/bookings/create.js` and `PACKAGES` in `public/app.js`.

---

# 4. Frontend behavior

## public/app.js & public/listing-highlights.js

`public/app.js` is the main browser controller, complemented by `public/listing-highlights.js` (loaded immediately after `app.js`), which wraps `cardHTML` and `openDetail` to render sourced menu spotlights and strip unlicensed stock photos.

`public/app.js` owns:
- map initialization and GPS Haversine distance recalculation (`locateMe()`)
- frontend state and Sonoma offline fallback catalog
- `localStorage` cache and safe JSON parsing
- marker creation and Open Now published-hours filtering (`openHoursNote` + `mapEmpty` banner)
- Map/List state
- truck selection and detail rendering (`esc()` HTML escaping throughout)
- hybrid guest/authenticated sync for favorites, bookings, and nearby alert settings
- booking package validation, `/api/trucks/availability` date checks, and server error surfacing
- Owner Mode controller (`loadOwnerDashboard()`, live admin API persistence vs. non-admin Preview Mode)
- Surprise Me, toasts, and screen navigation

### Startup path

Conceptually (`init()` is deferred one microtask so `listing-highlights.js` wraps `cardHTML`/`openDetail` first):

```text
init()
  -> initialize Leaflet
  -> wire cuisine buttons & default event date (+7 days)
  -> load localStorage catalog cache if available
  -> fetch /api/trucks
  -> replace fallback catalog with live catalog (& recompute GPS distances if located)
  -> applyFilters()
  -> renderFavorites()
  -> renderBookings()
  -> syncAuthAndUserData() (probes /api/favorites/list; syncs favorites, bookings & alert settings when signed in)
```

(`loadOwnerDashboard()` is invoked lazily when opening `ownerScreen` rather than on initial customer startup.)

### Catalog behavior

`public/app.js` starts with 6 Sonoma County offline fallback records (`mitote`, `elroys`, `xies`, `dinos`, `fruta`, `holy-chile`, all marked `verified: false`, `photo: null`, `is_demo: true`).
- The live 47-record Sonoma catalog comes from `GET /api/trucks`.
- Fallback records only appear when both `GET /api/trucks` and cached `truckly_catalog` are unavailable.

### localStorage keys

Known client-side storage includes:

```text
truckly_favs
truckly_bookings
truckly_catalog
truckly_notify
truckly_owner_truck_id
truckly_owner_profile
truckly_owner_schedule
```

Changing these keys can reset user-local or preview-mode state.

---

# 5. Styling system

## public/theme.css

This file is the full visual system.

It controls:
- app shell
- typography
- header
- search
- chips
- map layout
- Leaflet overrides
- markers
- Map/List switch
- truck cards
- navigation
- favorites/bookings pages
- owner dashboard
- modals
- responsive layout

Design intent:
- mobile first
- warm cream background
- dark/forest-like ink tones
- coral primary accent
- restrained mustard/mint/pink/blue accents
- large rounded cards
- iPhone-friendly touch targets

When editing layout:
1. preserve map prominence
2. keep search visible
3. keep filter chips horizontally scrollable
4. avoid cards overlaying the map
5. keep bottom navigation compact
6. verify narrow iPhone widths first

---

# 6. Main catalog backend

## api/trucks.js

This is the main catalog endpoint and the current primary source of truck/vendor records.

Route:

```text
GET /api/trucks
```

Special summary mode:

```text
GET /api/trucks?summary=1
```

The endpoint currently builds records in code using an internal `add(...)` helper.

Typical record shape:

```js
{
  id,
  name,
  section,
  cuisine,
  emoji,
  rating,
  reviews,
  distance,
  open,
  lat,
  lng,
  city,
  listing_type,
  location,
  hours,
  price,
  color,
  photo,
  blurb,
  verified,
  availability,
  tags
}
```

### Critical fields consumed by the frontend

Do not remove or rename without updating `public/app.js`:

```text
id
name
cuisine
emoji
rating
reviews
distance
open
lat
lng
city
listing_type
location
hours
price
color
photo
blurb
tags
```

### Categories

Current catalog sections:

```text
Mexican
Burgers
Hot Dogs
Global
Sweets
Markets
```

The frontend cuisine chips and `cuisineSections` list must remain aligned with this set.

### Geography

Current intended geography:
- Santa Rosa
- Sonoma County
- Petaluma
- Sonoma
- nearby corridor locations

The app is centered around Santa Rosa.

### Data-quality warning

A mix of:
- fixed venues
- mobile trucks
- rotating food-truck venues
- market stalls
- demo-like schedule records

exists in this file.

Do not automatically label every entry "open now" unless its schedule logic actually supports that claim.

---

# 7. Truck-related API map

## GET /api/trucks

File:
`api/trucks.js`

Purpose:
Primary catalog feed.

Access:
public

---

## GET /api/trucks/:id

File:
`api/trucks/[id].js`

Purpose:
Detail lookup synced across all 47 primary records (`name`, `cuisine`, `emoji`, `city`, `location`, `type`, `hours`, `price`, `tags`, `verified`, `verification_status`).

Access:
public

Parity:
Guarded by `tests/listing-verification.cjs` against `api/trucks.js`.

---

## GET /api/trucks/search?q=...&limit=...

File:
`api/trucks/search.js`

Purpose:
Accent-insensitive server-side search across all 47 primary records (`name`, `cuisine`, `tags`, `city`, `location`).

Access:
public

Parity:
Guarded by `tests/listing-verification.cjs` against `api/trucks.js`.

---

## GET /api/trucks/nearby?lat=...&lng=...

File:
`api/trucks/nearby.js`

Purpose:
Returns nearest regional Sonoma County hubs sorted by Haversine mileage (`Santa Rosa`, `Rohnert Park`, `Cotati`, `Petaluma`, `Sonoma`). Used by `locateMe()` to label the user's area while client-side Haversine recalculates per-listing distances.

Access:
public

---

## GET /api/trucks/availability?truck_id=...&date=YYYY-MM-DD

File:
`api/trucks/availability.js`

Purpose:
Checks `owner_schedule` records and returns `requestable: false` when an owner has marked `status = 'unavailable'` for that date. Checked live by the booking modal when a specific truck is selected.

Access:
public

Database:
`owner_schedule`

---

# 8. Catalog metadata APIs

## GET /api/catalog/cities

File:
`api/catalog/cities.js`

Returns known service-area cities and center coordinates (synced with `api/trucks/nearby.js`).

## GET /api/catalog/cuisines

File:
`api/catalog/cuisines.js`

Returns all 6 cuisine/category metadata entries (`Mexican`, `Burgers`, `Hot Dogs`, `Global`, `Sweets`, `Markets`).

## GET /api/catalog/featured

File:
`api/catalog/featured.js`

Returns featured truck IDs (verified to exist in `api/trucks.js`).

---

# 9. Booking system

## POST /api/bookings/create

File:
`api/bookings/create.js` (with `lib/dates.js`, `lib/catalog.js`, `lib/authz.js`, `lib/db-tx.js`)

Access:
`user` (authenticated `requester_user_id` required via `resolveIdentity(req, auth)`)

### Server-enforced validation & invariants

- **Real calendar & Pacific future-date policy:** Rejects impossible dates (e.g. `2026-02-29`, `2026-11-31`) and enforces `event_date > getPacificToday()` in `America/Los_Angeles` (up to 365 days ahead).
- **Eligible vendor & canonical terms:** Verifies `vendors.id` exists with `is_active = true` and `event_bookable = true` (`FOR SHARE OF v`), locks any `owner_profiles` row (`FOR SHARE`), and resolves canonical `truck_name`, `package_name`, and `package_price` on the server (`dropin`: $750 / 10–50 guests; `party`: $1,500 / 10–100 guests; `festival`: $2,900 / 10–250 guests).
- **Fail-closed availability:** Rejects with `409` if `accepting_bookings = false` or `owner_schedule.status = 'unavailable'` (`FOR SHARE`). Any database read/write failure rolls back and returns `503`.
- **Idempotency:** Optional `Idempotency-Key` header / `idempotency_key` body (`8–128` ASCII token chars) hashed with request parameters (`request_hash`). Exact retries return `200` (`idempotent_replay: true`); reusing a key with different booking parameters returns `409`.

---

## GET /api/bookings/list

File:
`api/bookings/list.js`

Access:
`user`

Returns bookings strictly owned by the authenticated requester:

```sql
WHERE requester_user_id = $1
```

Unverified legacy rows (`requester_user_id IS NULL`) are never matched by email.

---

# 10. Favorites

## GET /api/favorites/list

File:
`api/favorites/list.js`

Access:
user

Database:
`favorites`

## POST /api/favorites/toggle

File:
`api/favorites/toggle.js`

Access:
user

Contract:

```json
{
  "truck_id": "..."
}
```

Response contains:

```json
{
  "truck_id": "...",
  "saved": true
}
```

The browser currently also keeps favorite IDs in localStorage, so server/client favorite behavior is partly duplicated.

---

# 11. Notification settings

## GET /api/notifications/settings
## POST /api/notifications/settings

File:
`api/notifications/settings.js`

Access:
user

Database:
`notification_settings`

Fields:

```text
nearby_enabled
radius_miles
updated_at
```

Radius is clamped to 1–30 miles.

---

# 12. Public schedule

## GET /api/schedule/today

File:
`api/schedule/today.js`

Access:
public

Database:
`owner_schedule` (with `LEFT JOIN owner_profiles`)

Queries scheduled service rows (`status <> 'unavailable'`) for today's `America/Los_Angeles` date (or optional `?date=YYYY-MM-DD`). Gracefully returns `events: []` if no rows are scheduled.

---

# 13. Vendor RBAC, Pickup Pager & Community Moderation APIs

All `/api/owner/*`, `/api/pager/staff`, `/api/pager/update`, and `/api/community/moderate` routes export `access = "user"` and enforce explicit server-side authorization via `lib/authz.js` (`loadAccessContext`, `authorizeVendorTarget`, `authorizeVendorScope`). See `docs/BACKEND_SECURITY_HARDENING.md` for the complete permission matrix.

- **Vendor roles (`vendor_memberships`):**
  - `owner`: full access for assigned `vendor_id` (`profile`, `location`, `schedule`, `requests` GET/POST accept/decline, `bookings`, `stats`, and `pager` create/update).
  - `staff`: operational access for assigned `vendor_id` (`location`, `schedule`, `pager` create/update, and read-only `profile`/`requests`/`bookings`/`stats`); `403` on `POST /api/owner/profile` and `POST /api/owner/requests`.
- **Platform roles (`platform_roles`):**
  - `moderator`: `GET/POST /api/community/moderate` only (vendor membership never grants moderation access).
  - `platform_admin`: intentional global read access and explicit-vendor write access, including legacy unassigned/quarantined rows.
- **Audit logging (`audit_logs`):** Privileged mutations record `actor_id`, `actor_role`, `vendor_id`, `target_type`, `target_id`, `action`, and sanitized `metadata` (redacting private pager UUID tokens and customer notes).

## GET / POST /api/owner/location

File:
`api/owner/location.js`

Table:
`truck_settings`

Purpose:
Read/update parked `location` (plus optional `is_open`, `opens_at`, `closes_at`) for `?truck_id=...` / `body.truck_id` (defaults to `owner-truck`, Sonoma County fallback `"Ross Street, Downtown Santa Rosa"`, `is_open: false`).

---

## GET / POST /api/owner/profile

File:
`api/owner/profile.js`

Table:
`owner_profiles`

Purpose:
Read/update owner listing profile (wired to `#ownerProfileModal`).

Fields:
- truck_id
- display_name
- description
- cuisine
- accepting_bookings

---

## GET / POST /api/owner/schedule

File:
`api/owner/schedule.js`

Table:
`owner_schedule`

Purpose:
Create/update service schedule entries (`YYYY-MM-DD`, `opens_at`, `closes_at`, `location`, `status` in `scheduled | unavailable`) and list upcoming schedules (with optional `?truck_id=...` filter).

---

## GET /api/owner/requests
## POST /api/owner/requests

File:
`api/owner/requests.js`

Table:
`bookings`

GET:
returns pending requests.

POST:
validates UUID format and updates request status to:
- accepted
- declined

---

## GET /api/owner/bookings

File:
`api/owner/bookings.js`

Table:
`bookings`

Purpose:
Admin booking history and status filtering (`Pending`, `Accepted`, `All` tabs in `ownerScreen`).

---

## GET /api/owner/stats

File:
`api/owner/stats.js`

Table:
`bookings`

Returns live operational counts rendered in `.owner-stats`:
- total_requests
- pending
- accepted

---

# 14. Database schema

## bookings

Created by:
`migrations/001_create_bookings.sql`

Extended by:
`migrations/007_add_booking_packages.sql`

Fields:

```text
id UUID PK
truck_id TEXT
truck_name TEXT NOT NULL
event_type TEXT NOT NULL
event_date DATE NOT NULL
guest_count INTEGER NOT NULL
location TEXT NOT NULL
note TEXT
requester TEXT
status TEXT NOT NULL DEFAULT 'pending'
created_at TIMESTAMPTZ NOT NULL DEFAULT now()

package_id TEXT
package_name TEXT
package_price INTEGER
```

---

## truck_settings

Created by:
`migrations/002_create_truck_settings.sql`

Fields:

```text
truck_id TEXT PK
location TEXT NOT NULL
is_open BOOLEAN NOT NULL DEFAULT true
opens_at TIME
closes_at TIME
updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
```

---

## favorites

Created by:
`migrations/003_create_favorites.sql`

Fields:

```text
user_id TEXT
truck_id TEXT
created_at TIMESTAMPTZ
PRIMARY KEY (user_id, truck_id)
```

---

## notification_settings

Created by:
`migrations/004_create_notification_settings.sql`

Fields:

```text
user_id TEXT PK
nearby_enabled BOOLEAN
radius_miles INTEGER
updated_at TIMESTAMPTZ
```

---

## owner_profiles

Created by:
`migrations/005_create_owner_profiles.sql`

Fields:

```text
truck_id TEXT PK
display_name TEXT
description TEXT
cuisine TEXT
accepting_bookings BOOLEAN
updated_at TIMESTAMPTZ
```

---

## owner_schedule

Created by:
`migrations/006_create_owner_schedule.sql`

Fields:

```text
id UUID PK
truck_id TEXT
service_date DATE
opens_at TIME
closes_at TIME
location TEXT
status TEXT
UNIQUE(truck_id, service_date)
```

---

# 15. Auth and data permissions

Configured in:

`hatchable.toml`

Current config:

```toml
name = "Truckly"

[auth]
enabled = true
providers = ["email"]

[db.tables.favorites]
read = "own"
write = "own"

[db.tables.notification_settings]
read = "own"
write = "own"
```

Do not assume all database tables are directly browser-readable. The application mainly uses server functions.

---

# 16. Important product invariants

An LLM modifying Truckly should preserve these unless the user explicitly asks otherwise.

## Discovery

- Map remains the focal point.
- Map and List remain separate views.
- Search stays visible and accessible.
- Filters remain horizontally scrollable on mobile.
- Closed trucks may still be displayed for demo/discovery.
- Santa Rosa remains the default map focus.

## Content

- Categories should have enough content to feel populated.
- Cuisine imagery should match the food.
- Small vendors, carts, food parks, and farmers-market vendors matter.
- Sonoma County and Petaluma are part of the intended catalog.

## Booking

- User can request a truck to come to an event/location.
- Three package tiers exist.
- Booking requests are not immediate confirmed transactions.

## Owner mode

- Owner mode is a separate screen.
- It should feel like an operational command center, not merely settings.
- Core actions should remain reachable in 1–2 taps.

## Design

- Mobile first.
- Premium but friendly NorCal feel.
- Warm cream background.
- Dark forest/ink primary.
- Restrained accents.
- Large readable text.
- Clear spacing.
- Strong touch targets.
- Avoid UI clutter.

---

# 17. Known caveats & deployment checkpoints

These are especially important for another LLM or developer before deploying or extending Truckly.

## 17.1 Reconciled v77 source & binary asset note

This repository reconciles the Hatchable **v77** source mirror (59 total listings: 47 primary in `api/trucks.js` + 12 `neighborhoodAdditions` in `public/app.js`, 27 API routes, 10 migrations, Pickup Pager demo, Community/Street Whispers, and Local Guides/Passport) with the photo/menu verification safeguards (`docs/PHOTO_MENU_VERIFICATION.md` and `docs/V77_PAGER_SOURCE_REVIEW.md`). Three pre-existing binary JPEGs (`public/assets/mitote.jpg`, `oak-hill-guide.jpg`, `retrograde-roasting.jpg`) are intentionally omitted pending image-rights confirmation and degrade cleanly in the UI.

---

## 17.2 Code-maintained catalog & standalone function constraint

Every `.js` file under `api/` is treated by Hatchable as a serverless route (currently **27** functions). Do not place shared helper `.js` files inside `api/`.
Because the 47-record primary catalog is still maintained in code rather than PostgreSQL, `api/trucks.js`, `api/trucks/[id].js`, `api/trucks/search.js`, and `api/catalog/cuisines.js` are kept in lockstep and enforced by `node tests/listing-verification.cjs` (alongside `node tests/pager-demo.test.cjs`).

Recommended future architecture:
migrate the catalog into a PostgreSQL `trucks` table and derive `/api/trucks`, `/api/trucks/[id]`, and `/api/trucks/search` from SQL queries.

---

## 17.3 Verification & photo licensing rules

Per `docs/PHOTO_MENU_VERIFICATION.md`:
- Keep `verified: false` and `photo_rights_verified: false` unless independently verified with the vendor.
- Do not use generic stock photography (e.g. Unsplash) to represent named vendors (`public/listing-highlights.js` strips unlicensed photos and renders illustrative icons + sourced menu spotlights).
- Owner photo uploads in `#ownerPhotoGrid` currently preview locally via `FileReader`; persistent cloud storage + rights sign-off are not yet wired.

---

## 17.4 Hybrid guest / signed-in & Preview Mode state

- **Customers:** Guests use `localStorage` (`truckly_favs`, `truckly_bookings`, `truckly_notify`). Signed-in users sync against `/api/favorites/*`, `/api/bookings/list`, and `/api/notifications/settings`.
- **Owners:** Admin sessions read/write `/api/owner/*` in PostgreSQL. Non-admin sessions display `#ownerModeBanner` and operate in local **Preview mode** without faking server writes.

---

# 18. Change-impact map

## If changing a truck record

Inspect:
- `api/trucks.js`
- `api/trucks/search.js` if search support matters
- `api/trucks/[id].js` if direct detail lookup matters
- `public/app.js` for assumptions about fields

## If changing categories

Inspect:
- `api/trucks.js`
- `api/catalog/cuisines.js`
- filter buttons in `public/index.html`
- `cuisineSections` in `public/app.js`

## If changing booking packages

Inspect:
- package radio buttons in `public/index.html`
- `api/bookings/create.js`
- any price/guest-count text in `public/app.js`

## If changing a DOM ID

Search:
- `public/app.js`

## If changing database structure

Do:
- create a new numbered migration
- update dependent API routes
- do not edit already-applied migrations unless rebuilding history intentionally

## If changing auth

Inspect:
- `hatchable.toml`
- `access` exports in affected API files
- frontend assumptions for anonymous vs authenticated users

## If changing owner mode

Inspect:
- owner HTML in `public/index.html`
- owner functions in `public/app.js`
- `api/owner/*`
- related tables

---

# 19. Recommended LLM workflow

For every edit:

1. Read `README.md`.
2. Read this file.
3. Read the complete target file.
4. Search for identifiers being changed across the repo.
5. Identify API/DOM/database contracts affected.
6. Make the smallest coherent change.
7. Avoid broad rewrites unless the task explicitly asks for one.
8. Preserve existing working behavior not related to the request.
9. Verify mobile layout mentally and, where possible, visually.
10. Verify all affected API routes.
11. Confirm no secrets were added.
12. Record meaningful architectural changes in this file.

---

# 20. Manual smoke-test checklist

After meaningful changes, verify:

## Discover
- app loads
- map renders
- Santa Rosa/Sonoma area appears
- search filters results
- cuisine chips work
- Open Now works
- radius control works
- markers render
- marker selection works
- Map/List switch works
- List scrolls independently

## Detail
- card opens detail
- photo/emoji renders
- rating/cuisine/location render
- booking action opens modal

## Favorites
- favorite toggle works
- saved state persists as expected

## Booking
- package can be selected
- invalid guest counts are blocked
- request submits
- expected status appears

## Navigation
- Discover
- Saved
- Book a truck
- Bookings
- Surprise Me

## Owner mode
- owner screen opens
- location UI works
- owner requests load
- accept/decline still work if wired
- back navigation works

## Responsive
- narrow iPhone portrait
- no horizontal overflow
- no map/card overlap
- bottom nav does not cover content
- touch targets remain usable

---

# 21. Architecture roadmap ideas

These are not current requirements, but are the highest-value next-stage opportunities:

1. Rebase/reconcile this `v64` review branch with the live Hatchable `v77` export (59 listings).
2. Move catalog records into a PostgreSQL `trucks` table so `/api/trucks`, `/api/trucks/[id]`, and `/api/trucks/search` query a single SQL source.
3. Add a multi-tenant `user_id <-> truck_id` ownership relationship (replacing single-role admin ownership).
4. Add licensed vendor photo upload + cloud storage + image-rights sign-off workflow.
5. Add Playwright/browser visual smoke tests alongside `tests/listing-verification.cjs`.

Do not implement these automatically unless requested.

---

# 22. File ownership summary

```text
public/index.html
  UI structure, modals, and Owner Mode markup

public/theme.css
  Visual system, spacing, responsive layout

public/app.js
  Browser state, map/GPS behavior, filters, hybrid auth sync, bookings, Owner Mode controller

public/listing-highlights.js
  Sourced menu spotlights and unlicensed stock-photo removal

public/login.html
  Email code + WebAuthn passkey authentication UI

api/trucks.js
  Unified 59-listing PostgreSQL Sonoma County catalog endpoint (`lib/discovery.js`)

api/trucks/*
  PostgreSQL-backed detail, accent-folded search, nearby hubs, and date availability endpoints

api/bookings/*
  Customer event booking flow

api/favorites/*
  Authenticated saved-truck persistence

api/notifications/*
  Nearby notification preferences

api/owner/*
  Owner/admin operational endpoints (stats, profile, location, schedule, requests, bookings)

api/catalog/*
  Cities, 6 cuisines/categories, and PostgreSQL-backed featured metadata

api/schedule/*
  Public schedule endpoint backed by active vendors + owner_schedule

migrations/*
  PostgreSQL schema history (001–016, including unified 59-place `vendors` catalog, truthful `truck_settings` location/expiry columns, `vendor_memberships`, `platform_roles`, `audit_logs`, booking integrity triggers, `community_reviews` FORCE RLS + `community_public_posts` view, and `pager_notification_*` outbox/subscription/claim-fenced delivery/rate-limit tables with FORCE RLS)

lib/*
  Shared server-side authorization (`authz.js`), unified discovery read model (`discovery.js`), durable pager notifications (`pager-notifications.js`), RFC 8291/8292 Web Push crypto (`webpush-crypto.js`), catalog/package terms (`catalog.js`), Pacific date validation (`dates.js`), and transaction helpers (`db-tx.js`) — kept outside `api/` so Hatchable does not register helpers as routes

docs/BACKEND_SECURITY_HARDENING.md
  P0 permission matrix, invariants, legacy quarantine rules, and staging rollout/rollback guide

docs/HATCHABLE_STAGING_RUNBOOK.md
  Hosted Hatchable staging verification gates (`G1`–`G9`) and operator runbook

docs/P1_UNIFIED_DISCOVERY_ARCHITECTURE.md
  P1 unified discovery schema ownership, truthful location/schedule precedence, caching & rollback plan

docs/PAGER_NOTIFICATIONS_RUNBOOK.md
  Durable pager notification outbox, Web Push / native adapter contract, physical-device checklist & incident runbook

docs/PHOTO_MENU_VERIFICATION.md
  Listing verification, address corrections, and photo/menu audit register

tests/listing-verification.cjs
  Zero-dependency Node regression & cross-API parity test suite

tests/backend-hardening.integration.cjs
  Real-PostgreSQL integration suite for P0-A RBAC/revocation, P0-B booking integrity/locks, and P0-C community RLS

tests/p1-unified-discovery.integration.cjs
  Real-PostgreSQL integration suite for P1 unified 59-listing catalog, clock-aware ETags, truthful locations/expiry, and Pacific DST/overnight schedule precedence

tests/pager-notifications.integration.cjs
  Real-PostgreSQL integration suite for pager notification migrations, capability auth, SSRF/CSRF, atomic outbox rollback, RFC 8291/8292 wire crypto, worker leases/retries, 410 scrubbing, and telemetry redaction

tests/discovery-browser.e2e.cjs
  Real headless Chrome + real PostgreSQL browser E2E suite verifying owner publish -> customer discovery refresh parity

tests/pager-notifications-browser.e2e.cjs
  Real headless Chrome + real PostgreSQL browser E2E suite verifying sample pager isolation, real pager opt-in, Service Worker registration, `#pager-ref` routing, unsubscribe, and denied/unsupported fallbacks

hatchable.toml
  Project/auth/data permission configuration (direct table access restricted to favorites & notification_settings)
```

---

# 23. Definition of "safe edit"

A safe Truckly edit:
- does not accidentally switch the geography away from Sonoma
- does not merge Map and List into one cluttered screen
- does not silently remove booking or owner functionality
- does not break package IDs
- does not rename API response fields without updating callers
- does not modify old migrations in place
- does not introduce secrets into source
- does not assume prototype/demo values are production truth
- leaves the repository understandable for the next human or LLM
