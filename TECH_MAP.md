# Truckly Technical Map

This file is an architecture and editing guide for humans and LLM agents working on Truckly.

Read this together with `README.md` before making changes.

---

# 1. System overview

Truckly is a mobile-first food-truck discovery and event-booking web app hosted on Hatchable.

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

The live project runs on Hatchable:

```text
https://truckly.hatchable.site
```

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
map
mapMode
listMode
searchInput
filters
openNow
distanceText
nearbyCount
truckSheet
truckCards
favoriteGrid
bookingList
ownerLocation
ownerPhotoGrid
ownerRequests
ownerRequestCount
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
distanceModal
distanceRange
rangeValue
toast
```

If you rename an ID in `index.html`, search `public/app.js` for all references and update them together.

### Key interaction contracts

- Brand button opens owner mode.
- Map/List are separate modes.
- Search runs client-side on the loaded catalog.
- Cuisine filter buttons use `data-cuisine`.
- Bottom navigation calls global functions in `app.js`.
- Booking package radios use fixed values:
  - `dropin`
  - `party`
  - `festival`

These values must stay aligned with `api/bookings/create.js`.

---

# 4. Frontend behavior

## public/app.js

This is the main browser controller.

It owns:
- map initialization
- frontend state
- API loading
- fallback data
- localStorage cache
- marker creation
- filters
- Map/List state
- truck selection
- truck detail rendering
- favorites
- booking UI
- owner-mode interactions
- location requests
- Surprise Me
- toasts
- screen navigation

### Important global state

Current architecture uses globals such as:

```js
let trucks = [...]
let map
let markers = {}
let activeCuisine = 'All'
let openOnly = false
let maxDistance = 30
let selectedTruck = ...
```

Treat these as shared mutable state.

### Startup path

Conceptually:

```text
init()
  -> initialize Leaflet
  -> wire cuisine buttons
  -> load localStorage cache if available
  -> fetch /api/trucks
  -> replace fallback catalog with live catalog
  -> applyFilters()
  -> renderFavorites()
  -> renderBookings()
  -> loadOwnerRequests()
```

### Catalog behavior

The file contains old fallback prototype records.

Important:
- these are not the intended source of truth
- the live Sonoma catalog comes from `GET /api/trucks`
- fallback records only matter when the API or cache is unavailable

A future cleanup should replace the fallback records with a minimal Sonoma-compatible fallback dataset.

### localStorage keys

Known client-side storage includes:

```text
truckly_favs
truckly_bookings
truckly_catalog
```

Changing these keys can effectively reset user-local state.

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
Small detail lookup for a limited set of known records.

Access:
public

Caveat:
This endpoint does not currently mirror the full `api/trucks.js` catalog. Most detail UI is rendered from the already-loaded catalog instead.

---

## GET /api/trucks/search?q=...

File:
`api/trucks/search.js`

Purpose:
Server-side name search.

Access:
public

Caveat:
It currently contains its own hard-coded name list, so it can drift from `api/trucks.js`.

---

## GET /api/trucks/nearby?lat=...&lng=...

File:
`api/trucks/nearby.js`

Purpose:
Returns nearest regional hubs.

Access:
public

This endpoint does not currently return the full live catalog sorted by actual truck distance.

---

## GET /api/trucks/availability?truck_id=...&date=YYYY-MM-DD

File:
`api/trucks/availability.js`

Purpose:
Checks owner schedule records.

Access:
public

Database:
`owner_schedule`

---

# 8. Catalog metadata APIs

## GET /api/catalog/cities

File:
`api/catalog/cities.js`

Returns known service-area cities and center coordinates.

## GET /api/catalog/cuisines

File:
`api/catalog/cuisines.js`

Returns cuisine/category metadata.

## GET /api/catalog/featured

File:
`api/catalog/featured.js`

Returns a short list of featured truck IDs.

---

# 9. Booking system

## POST /api/bookings/create

File:
`api/bookings/create.js`

Access:
public

Uses Hatchable auth opportunistically:

```js
const user = await auth.getUser(req)
```

Anonymous requests are still possible; requester may be null.

### Required request fields

```text
event_type
event_date
location
guest_count >= 10
package_id
```

Optional:

```text
truck_id
truck_name
note
```

### Package contract

Backend package IDs:

```js
dropin
party
festival
```

Backend pricing:

```text
dropin   $750    max 50
party    $1500   max 100
festival $2900   max 250
```

The booking modal in `public/index.html` must remain synchronized with these values.

---

## GET /api/bookings/list

File:
`api/bookings/list.js`

Access:
user

Returns bookings where:

```sql
requester = req.user.email
```

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

Current implementation contains a hard-coded Ross Street date map.

Treat this endpoint as time-sensitive and stale unless refreshed.

---

# 13. Owner/admin API map

All owner routes currently use Hatchable admin access.

## GET / POST /api/owner/location

File:
`api/owner/location.js`

Table:
`truck_settings`

Purpose:
Read/update current location.

Important caveat:
The implementation currently defaults to truck ID `estrella`, a legacy prototype identifier.

---

## GET / POST /api/owner/profile

File:
`api/owner/profile.js`

Table:
`owner_profiles`

Purpose:
Read/update owner listing profile.

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
Create/update service schedule entries and list upcoming schedules.

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
updates request status to:
- accepted
- declined

---

## GET /api/owner/bookings

File:
`api/owner/bookings.js`

Table:
`bookings`

Purpose:
Admin booking history and filtering.

---

## GET /api/owner/stats

File:
`api/owner/stats.js`

Table:
`bookings`

Returns:
- total_requests
- pending
- accepted

Note:
The richer owner dashboard stats shown in the frontend include prototype values that are not all sourced from this endpoint.

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

# 17. Known inconsistencies to watch

These are especially important for another LLM because they can cause false assumptions.

## 17.1 Legacy fallback catalog

`public/app.js` begins with older prototype records from Austin-style locations.

The live catalog replaces them via `GET /api/trucks`.

Do not use the fallback dataset as evidence of current product geography.

Recommended future fix:
replace it with a small Sonoma-compatible offline fallback.

---

## 17.2 Duplicate catalog knowledge

Truck/vendor names appear in multiple places:
- `api/trucks.js`
- `api/trucks/search.js`
- `api/trucks/[id].js`
- cached data in browser localStorage

This can create drift.

Recommended future architecture:
one database-backed truck table with search/detail endpoints derived from it.

---

## 17.3 Hard-coded schedules

Ross Street dates exist in:
- `api/trucks.js`
- `api/schedule/today.js`

These are time-bound.

Do not present these as current without refreshing the data.

---

## 17.4 Prototype owner interactions

Some owner UI actions only trigger toast messages.

Examples may include:
- Edit menu
- Notify followers
- Save schedule portions
- photo management beyond preview

Do not assume these are fully persisted just because the UI button exists.

---

## 17.5 Client/server duplicate state

Favorites and bookings have both browser-local and API-backed behavior.

Before changing persistence, inspect both frontend and API flows.

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

These are not current requirements, but are the highest-value cleanup opportunities.

1. Move catalog records into PostgreSQL.
2. Create a single source of truth for trucks, categories, schedules, and search.
3. Replace legacy fallback catalog with Sonoma-compatible offline data.
4. Normalize user favorites/booking state so browser and server do not diverge.
5. Add schema/API tests.
6. Add basic end-to-end smoke tests.
7. Add a true owner/truck relationship rather than hard-coded owner IDs.
8. Replace hard-coded schedule maps with database schedule rows.
9. Add real image storage instead of external/hard-coded assets.
10. Add an explicit environment/config file strategy.

Do not implement these automatically unless requested.

---

# 22. File ownership summary

```text
public/index.html
  UI structure and screen markup

public/theme.css
  Visual system, spacing, responsive layout

public/app.js
  Browser state, map behavior, filters, navigation, modals

api/trucks.js
  Main catalog source

api/trucks/*
  Search/detail/nearby/availability helpers

api/bookings/*
  Customer event booking flow

api/favorites/*
  Authenticated saved-truck persistence

api/notifications/*
  Nearby notification preferences

api/owner/*
  Owner/admin operational endpoints

api/catalog/*
  Static discovery metadata

api/schedule/*
  Public schedule helper

migrations/*
  PostgreSQL schema history

hatchable.toml
  Project/auth/data permission configuration
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
