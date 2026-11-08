# Truckly v64

Truckly is a mobile-first food-truck discovery and booking app focused on Sonoma County, especially Santa Rosa and Petaluma. Users can discover nearby trucks and market vendors, filter the map/list, save favorites, use Surprise Me, and request a truck for an event. Truck owners have a lightweight owner dashboard for location, schedule, photos, and booking requests.

**Live app:** https://truckly.hatchable.site

> For an AI/LLM or new developer: read this README first, then read [TECH_MAP.md](./TECH_MAP.md) before editing code.

## What this repository contains

This is the source for the current Truckly Hatchable project, exported from Hatchable project version **64**.

```text
/
├── README.md
├── TECH_MAP.md
├── hatchable.toml
├── public/
│   ├── index.html        # Main mobile UI and screen markup
│   ├── app.js            # Front-end state, map, filters, bookings, favorites
│   ├── theme.css         # Entire visual system and responsive layout
│   ├── login.html
│   ├── logo.svg
│   └── build.json
├── api/
│   ├── trucks.js         # Main truck/vendor catalog endpoint
│   ├── trucks/           # Search, detail, nearby, availability
│   ├── bookings/         # Create/list user booking requests
│   ├── favorites/        # Saved trucks
│   ├── owner/            # Owner/admin dashboard APIs
│   ├── catalog/          # Cities, cuisines, featured IDs
│   ├── notifications/    # User notification preferences
│   └── schedule/         # Public schedule endpoint
├── migrations/           # PostgreSQL schema
├── truckly-v63.zip       # Historical snapshot
└── truckly-data.sql.gz   # Historical data backup
```

## Stack

- **Frontend:** plain HTML, CSS, and browser JavaScript; no bundler/build framework.
- **Map:** Leaflet 1.9.4 with OpenStreetMap tiles loaded from CDN.
- **Backend:** Hatchable server functions in `api/**/*.js`.
- **Database:** PostgreSQL through Hatchable's `db` SDK.
- **Auth:** Hatchable email auth.
- **Persistence in browser:** `localStorage` for cached truck catalog, favorites, and some booking UI state.
- **Hosting:** Hatchable.

## Core product flows

### Discover
The default screen is the food-truck map. Users can:
- Search by truck name, cuisine, or location.
- Filter by cuisine.
- Filter to open-now.
- Limit distance radius.
- Switch between Map and List.
- Open a truck detail view.
- Save favorites.
- Use Surprise Me.

### Book a truck
The booking modal offers three packages:
- Neighborhood Drop-in — $750, up to 50 guests.
- Party Favorite — $1,500, up to 100 guests.
- Full Festival — $2,900, up to 250 guests.

Requests are posted to `POST /api/bookings/create` and stored in PostgreSQL.

### Owner mode
Clicking the Truckly brand opens owner mode. Owner/admin APIs exist for:
- Live location.
- Schedule.
- Profile.
- Booking requests.
- Booking history.
- Basic stats.

## Important source-of-truth rules

1. **`api/trucks.js` is currently the primary catalog source.** Most truck/vendor records are hard-coded there.
2. **`public/app.js` contains legacy fallback demo data.** The app replaces it with `GET /api/trucks` when the API succeeds. Do not assume the initial Austin-style fallback records are the production catalog.
3. **Truckly is Sonoma-first.** New discovery work should preserve Santa Rosa / Sonoma County / Petaluma as the main geography unless the product scope explicitly changes.
4. **Map and List are intentionally separate views.** Avoid reintroducing cards over the map.
5. **The owner experience is a separate screen.**
6. **Preserve mobile-first behavior.** The primary target is iPhone portrait.
7. **Do not silently remove historical files** `truckly-v63.zip` or `truckly-data.sql.gz`.

## Known technical debt / caveats

- The main truck catalog is hand-maintained in `api/trucks.js`; it is not yet normalized into database tables.
- `public/app.js` still contains fallback demo records from an earlier prototype. They are used only when the live catalog cannot load, but they can confuse maintainers.
- Some UI actions in owner mode are prototype interactions that show toast messages rather than fully persisted features.
- The Ross Street schedule in `api/trucks.js` and `api/schedule/today.js` is date-specific and should be treated as stale unless refreshed.
- The Mitote image is referenced from the live Truckly asset URL.
- The frontend uses inline `onclick` handlers and global functions rather than a component framework.
- There is no formal automated test suite in this repository yet.

## Safe editing workflow for another LLM

Before changing code:
1. Read [TECH_MAP.md](./TECH_MAP.md).
2. Identify whether the change is frontend, catalog/data, booking/auth, owner/admin, or database-related.
3. Read the complete target file before editing.
4. Preserve API response shapes unless all callers are updated in the same change.
5. Preserve mobile layout and accessible touch targets.
6. Avoid replacing the working Leaflet map or Hatchable APIs unless the task explicitly requires an architecture change.
7. For schema changes, add a new migration; do not rewrite already-shipped migration files.
8. Keep secrets, credentials, and environment-specific values out of the repository.
9. After a change, manually verify Discover, Map/List, filters, truck detail, favorites, booking modal, bottom navigation, and owner-mode entry.

## Quick change guide

| Goal | Start here |
|---|---|
| Change layout/text/screens | `public/index.html` |
| Change styling/responsiveness | `public/theme.css` |
| Change map/filter/client behavior | `public/app.js` |
| Add/update trucks/vendors | `api/trucks.js` |
| Change truck search | `api/trucks/search.js` |
| Change booking packages/validation | `api/bookings/create.js` and booking modal in `public/index.html` |
| Change owner dashboard UI | `public/index.html`, `public/app.js`, `public/theme.css` |
| Change owner data behavior | `api/owner/*` |
| Change database structure | add a new file in `migrations/` |
| Change auth/table permissions | `hatchable.toml` |

## Historical files

`truckly-v63.zip` and `truckly-data.sql.gz` are retained as historical snapshots. The editable source at the repository root is the newer v64 source.

## Version

- Hatchable project version: **64**
- GitHub source import commit: `0ae007a153ecc690982b73c9176daa9490f9bc06`

For deeper architecture, routes, schemas, and LLM edit guidance, see **[TECH_MAP.md](./TECH_MAP.md)**.
