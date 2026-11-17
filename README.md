# Truckly (Reconciled v77 + Pager Demo & Listing Audit)

Truckly is a mobile-first food-truck, market-vendor, farm-stand, and café discovery + event-booking app focused on Sonoma County (Santa Rosa, Petaluma, Sebastopol, Glen Ellen, Rohnert Park, and Sonoma). Users can discover nearby spots, explore neighborhood guides & Food Passport badges, read/submit moderated community tips & whispers, try the interactive **Pickup Pager** demo, save favorites, and request a truck for an event. Truck owners have an operational dashboard for live location, schedules, listing profile, marketing promo cards, pickup pager tickets, community moderation, and booking requests.

**Live app:** https://truckly.hatchable.site

> **Reconciliation note:** This repository reconciles the full Hatchable **v77** text-source mirror and **Pickup Pager Demo** (PR #2) with the **Photo/Menu Verification** patch (PR #1) and client/API parity fixes — combining all **59 directory listings** (47 primary + 12 neighborhood additions), **27 Hatchable API functions**, and **10 SQL migrations** with both regression suites passing. Three pre-existing binary JPEGs (`public/assets/mitote.jpg`, `oak-hill-guide.jpg`, `retrograde-roasting.jpg`) remain excluded pending image-rights review and gracefully fall back in UI.

> For an AI/LLM or new developer: read this README first, then read [TECH_MAP.md](./TECH_MAP.md) and [docs/PHOTO_MENU_VERIFICATION.md](./docs/PHOTO_MENU_VERIFICATION.md) before editing code.

## What this repository contains

```text
/
├── README.md
├── TECH_MAP.md                       # Full architecture, route, DOM & schema guide
├── docs/
│   └── PHOTO_MENU_VERIFICATION.md    # Vendor address, menu spotlight & photo-rights audit
├── hatchable.toml                    # Hatchable auth & table permission config
├── public/
│   ├── index.html                    # Main mobile UI, modals, and Owner Mode markup
│   ├── app.js                        # Map, filters, geolocation, hybrid auth sync, bookings & owner controller
│   ├── listing-highlights.js         # Sourced menu spotlights & unlicensed stock-photo guard
│   ├── theme.css                     # Full visual system and responsive layout
│   ├── login.html                    # Hatchable email code + WebAuthn passkey sign-in
│   ├── logo.svg
│   └── build.json                    # Build/QA metadata
├── api/                              # 20 standalone Hatchable serverless endpoints
│   ├── trucks.js                     # Canonical 47-listing Sonoma County catalog endpoint
│   ├── trucks/                       # [id] detail, accent-folded search, nearby hubs, date availability
│   ├── bookings/                     # Create/list user booking requests
│   ├── favorites/                    # Authenticated saved trucks
│   ├── owner/                        # Admin dashboard APIs (stats, profile, location, schedule, requests, bookings)
│   ├── catalog/                      # Cities, 6 cuisines/categories, featured IDs
│   ├── notifications/                # User nearby-alert preferences
│   └── schedule/                     # Public daily schedule backed by owner_schedule
├── migrations/                       # PostgreSQL schema history (001–007)
├── tests/
│   └── listing-verification.cjs      # Zero-dependency Node verification & regression suite
├── truckly-v63.zip                   # Historical snapshot (retain)
└── truckly-data.sql.gz               # Historical data backup (retain)
```

## Stack

- **Frontend:** plain HTML, CSS, and browser JavaScript; no bundler/build framework.
- **Map:** Leaflet 1.9.4 with OpenStreetMap tiles loaded from CDN.
- **Backend:** 20 standalone Hatchable server functions in `api/**/*.js`.
- **Database:** PostgreSQL through Hatchable's `db` SDK.
- **Auth:** Hatchable email + passkey auth (`/login.html`), with hybrid guest `localStorage` fallback.
- **Hosting:** Hatchable.

## Local preview & verification checks

Start the zero-dependency local full-stack preview server (with in-memory DB + Customer/Provider Role Simulator in the `🛠️` Admin & Debug Workbench, `Alt+D`):

```bash
node scripts/dev-server.cjs
```

Run the built-in verification suites from the repository root (requires Node.js, zero external packages):

```bash
node tests/pager-demo.test.cjs
node tests/listing-verification.cjs
```

This verifies all 47 primary catalog listings, corrected addresses, safe photo defaults (`verified: false` and `photo_rights_verified: false` until confirmed), JS syntax, spotlight script wiring, client UX flows (booking validation, Open Now, geolocation distances, hybrid auth sync, XSS escaping, Owner Mode), and 100% cross-endpoint parity across `api/`.

## Core product flows

### Discover
The default screen is the food-truck map centered on Santa Rosa / Sonoma County. Users can:
- Search accent-insensitively by truck name, cuisine, tag, city, or location.
- Filter across 6 categories (`Mexican`, `Burgers`, `Hot Dogs`, `Global`, `Sweets`, `Markets`).
- Filter to **Open now** (matches published schedule windows with an unverified-hours notice, plus a visible Map-mode empty banner if none are open).
- Recalculate real Haversine distances from GPS (**Locate me**) and filter by mile radius (`1–30 mi`).
- Switch between **Map** and **List** views.
- Open a truck detail view with sourced menu spotlights (`public/listing-highlights.js`).
- Save favorites and configure nearby alert radius (persisted locally for guests; synced to PostgreSQL when signed in).
- Use **Surprise me**.

### Book a truck
The booking modal offers three packages enforced on both client and server:
- **Neighborhood Drop-in** — $750, up to 50 guests (min 10).
- **Party Favorite** — $1,500, up to 100 guests.
- **Full Festival** — $2,900, up to 250 guests.

When a specific truck is selected, the modal also checks `GET /api/trucks/availability` against `owner_schedule` so unavailable dates are flagged before submission. Valid requests post to `POST /api/bookings/create` and store in PostgreSQL.

### Owner mode
Clicking the Truckly brand opens **Owner Mode**:
- **Authenticated admins** get live stats (`GET /api/owner/stats`), truck profile editing (`GET/POST /api/owner/profile`), live location updates (`GET/POST /api/owner/location`), date-based schedule & availability publishing (`GET/POST /api/owner/schedule`), and pending/accepted/all booking management (`GET/POST /api/owner/requests`, `GET /api/owner/bookings`).
- **Guests / non-admins** see an explicit **Preview mode** banner where edits and sample requests stay local to their device without faking live publishes.

## Important source-of-truth rules

1. **`api/trucks.js` is the canonical primary catalog source** (47 Sonoma County records). `api/trucks/[id].js`, `api/trucks/search.js`, and `api/catalog/cuisines.js` are synced 1:1 with it and guarded by `tests/listing-verification.cjs`.
2. **`public/app.js` contains 6 Sonoma County offline fallback entries** used only when both `GET /api/trucks` and cached `localStorage` catalog data are unavailable.
3. **Truckly is Sonoma-first.** Preserve Santa Rosa / Sonoma County / Petaluma as the main geography unless product scope explicitly changes.
4. **Do not claim unverified facts or unlicensed photos.** Keep `verified: false` and `photo_rights_verified: false` unless independently confirmed per [docs/PHOTO_MENU_VERIFICATION.md](./docs/PHOTO_MENU_VERIFICATION.md).
5. **Map and List are intentionally separate views.** Avoid reintroducing cards overlaying the map.
6. **Preserve standalone Hatchable function files (`api/**/*.js`).** Do not add extra helper `.js` files inside `api/` (Hatchable treats files in `api/` as route functions).
7. **Do not silently remove historical files** `truckly-v63.zip` or `truckly-data.sql.gz`.

## Remaining architectural caveats

- The 47-record primary catalog is maintained in code (`api/trucks.js` + synced `api/trucks/[id].js` and `api/trucks/search.js`) rather than normalized into a PostgreSQL `trucks` table yet.
- Owner photo uploads in `#ownerPhotoGrid` preview locally via `FileReader`; persistent cloud image hosting and rights verification workflow are not yet wired.
- Rebase/reconcile with Hatchable **v77** before production deployment.

## Quick change guide

| Goal | Start here |
|---|---|
| Change layout/text/screens | `public/index.html` |
| Change styling/responsiveness | `public/theme.css` |
| Change map/filter/auth/booking/owner client behavior | `public/app.js` |
| Change menu spotlights / stock-photo guard | `public/listing-highlights.js` and `docs/PHOTO_MENU_VERIFICATION.md` |
| Add/update trucks/vendors | `api/trucks.js`, `api/trucks/[id].js`, `api/trucks/search.js` (then run `node tests/listing-verification.cjs`) |
| Change booking packages/validation | `api/bookings/create.js`, `public/index.html`, and `PACKAGES` in `public/app.js` |
| Change owner data behavior | `api/owner/*` and Owner Mode functions in `public/app.js` |
| Change database structure | add a new numbered SQL file in `migrations/` |
| Change auth/table permissions | `hatchable.toml` |

For deeper architecture, routes, schemas, and LLM edit guidance, see **[TECH_MAP.md](./TECH_MAP.md)**.
