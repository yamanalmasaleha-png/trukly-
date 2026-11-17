# Truckly (Reconciled v77 + Pager Demo & Listing Audit)

Truckly is a mobile-first food-truck, market-vendor, farm-stand, and café discovery + event-booking app focused on Sonoma County (Santa Rosa, Petaluma, Sebastopol, Glen Ellen, Rohnert Park, and Sonoma). Users can discover nearby spots, explore neighborhood guides & Food Passport badges, read/submit moderated community tips & whispers, try the interactive **Pickup Pager** demo, save favorites, and request a truck for an event. Truck owners have an operational dashboard for live location, schedules, listing profile, marketing promo cards, pickup pager tickets, community moderation, and booking requests.

**Live app:** https://truckly.hatchable.site

> **Reconciliation note:** This repository reconciles the full Hatchable **v77** text-source mirror and **Pickup Pager Demo** (PR #2) with the **Photo/Menu Verification** patch (PR #1) and client/API parity fixes — combining all **59 directory listings** (47 primary + 12 neighborhood additions), **27 Hatchable API functions**, and **10 SQL migrations** with both regression suites passing. Three pre-existing binary JPEGs (`public/assets/mitote.jpg`, `oak-hill-guide.jpg`, `retrograde-roasting.jpg`) remain excluded pending image-rights review and gracefully fall back in UI.

> For an AI/LLM or new developer: read this README first, then read [TECH_MAP.md](./TECH_MAP.md), [docs/BACKEND_SECURITY_HARDENING.md](./docs/BACKEND_SECURITY_HARDENING.md), [docs/HATCHABLE_STAGING_RUNBOOK.md](./docs/HATCHABLE_STAGING_RUNBOOK.md), [docs/P1_UNIFIED_DISCOVERY_ARCHITECTURE.md](./docs/P1_UNIFIED_DISCOVERY_ARCHITECTURE.md), [docs/PAGER_NOTIFICATIONS_RUNBOOK.md](./docs/PAGER_NOTIFICATIONS_RUNBOOK.md), and [docs/PHOTO_MENU_VERIFICATION.md](./docs/PHOTO_MENU_VERIFICATION.md) before editing code.

## What this repository contains

```text
/
├── README.md
├── TECH_MAP.md                       # Full architecture, route, DOM & schema guide
├── docs/
│   ├── BACKEND_SECURITY_HARDENING.md # P0 RBAC permission matrix, booking/RLS invariants & rollout plan
│   ├── HATCHABLE_STAGING_RUNBOOK.md  # Hosted Hatchable staging gates (G1–G9) & operator verification guide
│   ├── P1_UNIFIED_DISCOVERY_ARCHITECTURE.md # Unified 59-place PostgreSQL read model, location/schedule precedence & cache contract
│   ├── PAGER_NOTIFICATIONS_RUNBOOK.md # Durable pager push outbox, RFC 8291/8292 Web Push, native contract & incident runbook
│   ├── PHOTO_MENU_VERIFICATION.md    # Vendor address, menu spotlight & photo-rights audit
│   └── V77_PAGER_SOURCE_REVIEW.md    # Reconciled v77 & pager UX review notes
├── hatchable.toml                    # Hatchable auth & table permission config (community_reviews & pager outbox restricted to API)
├── lib/                              # Shared backend helpers (outside api/ so Hatchable does not expose as routes)
│   ├── authz.js                      # Trusted identity resolution, in-tx RBAC revocation checks, and redacted audit logging
│   ├── catalog.js                    # Canonical 59-vendor registry & server-enforced booking package terms
│   ├── dates.js                      # Real calendar date & America/Los_Angeles future-date validation
│   ├── db-tx.js                      # Transaction wrapper for Hatchable db.transaction & node-postgres
│   ├── discovery.js                  # Unified PostgreSQL discovery read model, clock-aware ETag & Pacific schedule precedence
│   ├── pager-notifications.js        # Capability subscriptions, SSRF/CSRF/rate limits, outbox enqueue & bounded lease worker
│   └── webpush-crypto.js             # Standards-compliant RFC 8291 aes128gcm & RFC 8292 VAPID ES256 via native node:crypto
├── public/
│   ├── index.html                    # Main mobile UI, modals, community, pager & Owner Mode markup
│   ├── manifest.json                 # Standalone PWA manifest (required for iOS/iPadOS 16.4+ Home Screen Web Push)
│   ├── sw.js                         # Zero-API-cache Web Push notification & click-routing service worker
│   ├── app.js                        # Unified 59-place discovery client, truthful GPS distances, auth sync, bookings & Owner Mode
│   ├── pager.js                      # Isolated customer pager demo + opt-in Web Push alerts + vendor-scoped kitchen queue
│   ├── community.js                  # Approved-only community feed, author status & moderator queue UI
│   ├── listing-highlights.js         # Sourced menu spotlights & unlicensed stock-photo guard
│   ├── debug-admin.js                # Local developer/admin inspection workbench (redacts tokens/UUIDs; never bypasses prod auth)
│   ├── theme.css                     # Full visual system and responsive layout
│   ├── login.html                    # Hatchable email code + WebAuthn passkey sign-in
│   ├── logo.svg
│   └── build.json                    # Build/QA metadata
├── api/                              # Exact 30 standalone Hatchable serverless endpoints (no helper files here)
│   ├── trucks.js                     # Unified 59-listing PostgreSQL Sonoma County discovery endpoint
│   ├── trucks/                       # [id] detail, accent-folded search, nearby hubs, fail-closed availability
│   ├── bookings/                     # Authenticated, Pacific-validated, idempotent booking create & user list
│   ├── favorites/                    # Authenticated saved trucks
│   ├── owner/                        # Vendor-scoped RBAC APIs (stats, profile, location, schedule, requests, bookings)
│   ├── pager/                        # Public status, capability subscriptions, bounded worker, admin telemetry & staff queue
│   ├── community/                    # Public approved projection, author mine/post, moderator-only decisions
│   ├── catalog/                      # Cities, 6 cuisines/categories, PostgreSQL-backed featured IDs
│   ├── notifications/                # User nearby-alert preferences
│   └── schedule/                     # Public daily schedule backed by active vendors + owner_schedule
├── migrations/                       # PostgreSQL schema history (001–015)
├── scripts/
│   ├── dev-server.cjs                # LOCAL DEV ONLY preview simulator (supports DATABASE_URL or seed mock) — NEVER deploy
│   ├── run-pager-worker.cjs          # Bounded notification delivery worker CLI (HTTPS trigger or direct DB mode)
│   └── seed-sql-reader.cjs           # Local zero-dependency SQL seed reader for dev simulator & contract tests
├── tests/
│   ├── pager-demo.test.cjs           # Isolated pager demo zero-network smoke test
│   ├── listing-verification.cjs      # Zero-dependency Node catalog, UX & cross-API parity suite
│   ├── backend-hardening.integration.cjs # Real-PostgreSQL P0 RBAC, absent-row booking locks, revocation & RLS suite
│   ├── staging-hatchable-gates.cjs   # Hosted Hatchable staging gates (G1–G9) & local pre-flight validator
│   ├── p1-unified-discovery.integration.cjs # Real-PostgreSQL P1 unified catalog, clock-aware ETags & DST schedule suite
│   ├── pager-notifications.integration.cjs # Real-PostgreSQL pager outbox, RFC 8291/8292 crypto, leases, retries & RLS suite
│   ├── discovery-browser.e2e.cjs     # Real headless Chrome + real PostgreSQL owner-publish -> customer-refresh E2E test
│   └── pager-notifications-browser.e2e.cjs # Real headless Chrome + real PostgreSQL pager opt-in, SW, push & unsubscribe E2E test
├── truckly-v63.zip                   # Historical snapshot (retain)
└── truckly-data.sql.gz               # Historical data backup (retain)
```

## Stack

- **Frontend:** plain HTML, CSS, and browser JavaScript; no bundler/build framework.
- **Map:** Leaflet 1.9.4 with OpenStreetMap tiles loaded from CDN.
- **Backend:** 27 standalone Hatchable server functions in `api/**/*.js` + shared modules in `lib/*.js`.
- **Database:** PostgreSQL through Hatchable's `db` SDK (with additive migrations `001`–`013`, row-level locking, triggers, and `FORCE ROW LEVEL SECURITY` on `community_reviews`).
- **Auth & RBAC:** Hatchable hosted authentication (`/login.html`), server-side `vendor_memberships` (`owner` vs `staff`), `platform_roles` (`moderator` vs `platform_admin`), and redacted `audit_logs`.
- **Hosting:** Hatchable.

## Local preview & verification checks

Start the local full-stack preview server (**development facility only — never deploy `scripts/dev-server.cjs`**):

```bash
node scripts/dev-server.cjs
```

Run the zero-dependency smoke and parity suites from the repository root:

```bash
node tests/pager-demo.test.cjs
node tests/listing-verification.cjs
```

Run the real-PostgreSQL integration and headless Chromium E2E suites (requires PostgreSQL via `DATABASE_URL` and the `pg` client, as run automatically in `.github/workflows/truckly-source-review.yml`):

```bash
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres node tests/backend-hardening.integration.cjs
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres node tests/staging-hatchable-gates.cjs --preflight-local
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres node tests/p1-unified-discovery.integration.cjs
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres node tests/pager-notifications.integration.cjs
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres node tests/discovery-browser.e2e.cjs
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres node tests/pager-notifications-browser.e2e.cjs
```

This verifies all 59 unified Sonoma County catalog listings, truthful location provenance & expiry (`illustrative_pin` never treated as measured GPS proximity), Pacific (`America/Los_Angeles`) schedule precedence across overnight windows and DST transitions, safe photo defaults (`verified: false` and `photo_rights_verified: false` until platform-confirmed), explicit `503` database-outage handling, and real browser owner-publish → customer-refresh synchronization.

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

### Request a truck (event inquiry)
The booking modal sends a **pending event inquiry** (not a paid or confirmed reservation) and requires a signed-in account (`requester_user_id`):
- **Neighborhood Drop-in** — \$750, 10–50 guests (2 hours).
- **Party Favorite** — \$1,500, 10–100 guests (3 hours).
- **Full Festival** — \$2,900, 10–250 guests (5 hours).

`POST /api/bookings/create` validates real future calendar dates in `America/Los_Angeles`, checks active bookable `vendors`, resolves canonical vendor names and package pricing on the server, verifies `accepting_bookings` and `owner_schedule` availability atomically (failing closed with `503` on database outages), and enforces `(requester_user_id, idempotency_key)` deduplication (`200` on exact retry, `409` on payload mismatch).

### Owner mode, pickup pagers & community moderation
Clicking the Truckly brand opens **Owner Mode**:
- **Vendor `owner`s** manage their authorized vendor(s) only: profile (`GET/POST /api/owner/profile`), live location (`GET/POST /api/owner/location`), schedule (`GET/POST /api/owner/schedule`), booking inquiries & atomic accept/decline (`GET/POST /api/owner/requests`, `GET /api/owner/bookings`, `GET /api/owner/stats`), and canonical `vendor_id` pickup pagers (`GET/POST /api/pager/staff`, `POST /api/pager/update`).
- **Vendor `staff`** can update operational location, schedule, and pickup pagers for their assigned vendor(s), and view vendor requests/stats, but cannot modify `owner_profiles` or accept/decline bookings.
- **Community `moderator`s & `platform_admin`s** review pending community submissions (`GET/POST /api/community/moderate`). Ordinary vendor membership never grants moderation access, and `community_reviews` is protected by PostgreSQL `FORCE ROW LEVEL SECURITY` + approved-only `community_public_posts` projection.
- **Guests / non-members** see an explicit **Preview mode** banner where edits and sample requests stay local to their device without faking live publishes.

## Important source-of-truth rules

1. **PostgreSQL (`vendors` + `owner_profiles` + `truck_settings` + `owner_schedule` via `lib/discovery.js`) is the single discovery read model** for all **59** Sonoma County places (`47` primary `extra: false` + `12` neighborhood `extra: true`), seeded by `migrations/014_unified_discovery_catalog.sql`. `api/trucks.js`, `api/trucks/[id].js`, `api/trucks/search.js`, `api/catalog/featured.js`, and `api/schedule/today.js` all query PostgreSQL and return explicit `503` (`DISCOVERY_DB_UNAVAILABLE`) on database failures rather than silent empty `200` lists.
2. **`public/app.js` contains 6 Sonoma County offline fallback entries (`OFFLINE_FALLBACK_TRUCKS`)** used only when both `GET /api/trucks` and the bounded `truckly_catalog_v2` `localStorage` snapshot are unavailable, displaying an explicit offline notice.
3. **Truckly is Sonoma-first.** Preserve Santa Rosa / Sonoma County / Petaluma as the main geography unless product scope explicitly changes.
4. **Do not claim unverified facts, unmeasured GPS distances, or unlicensed photos.** Keep `verified: false` and `photo_rights_verified: false` unless platform-confirmed (`owner` routes block self-elevation with `403`), and compute numeric mileage only for `verified_coordinate`, `venue_address`, or non-expired `owner_reported_coords`.
5. **Map and List are intentionally separate views.** Avoid reintroducing cards overlaying the map.
6. **Preserve standalone Hatchable function files (`api/**/*.js`).** Do not add extra helper `.js` files inside `api/` (Hatchable treats files in `api/` as route functions).
7. **Do not silently remove historical files** `truckly-v63.zip` or `truckly-data.sql.gz`.

## Remaining architectural caveats

- **Hosted P0 Hatchable staging verification (`G1`–`G6`) remains required** before any production deployment (`docs/HATCHABLE_STAGING_RUNBOOK.md`).
- Owner photo uploads in `#ownerPhotoGrid` preview locally via `FileReader`; persistent cloud image hosting and admin rights-verification sign-off workflow remain on the P1 backlog.
- Transactional email/push delivery for booking notifications and nearby alerts remains on the P1 backlog.

## Quick change guide

| Goal | Start here |
|---|---|
| Change layout/text/screens | `public/index.html` |
| Change styling/responsiveness | `public/theme.css` |
| Change map/filter/auth/booking/owner client behavior | `public/app.js` |
| Change menu spotlights / stock-photo guard | `public/listing-highlights.js` and `docs/PHOTO_MENU_VERIFICATION.md` |
| Add/update curated trucks/vendors or discovery merge logic | new migration updating `vendors` + `lib/catalog.js` + `lib/discovery.js` (then run `tests/listing-verification.cjs` and `tests/p1-unified-discovery.integration.cjs`) |
| Change booking packages/validation | `api/bookings/create.js`, `public/index.html`, and `PACKAGES` in `public/app.js` |
| Change owner data behavior | `api/owner/*` and Owner Mode functions in `public/app.js` |
| Change database structure | add a new numbered SQL file in `migrations/` |
| Change auth/table permissions | `hatchable.toml` |

For deeper architecture, routes, schemas, and LLM edit guidance, see **[TECH_MAP.md](./TECH_MAP.md)**.
