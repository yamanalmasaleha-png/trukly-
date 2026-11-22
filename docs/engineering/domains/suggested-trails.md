# Domain Map — Flavor Finder & Suggested Trails

## 1. Current Behavior
- **Primary (`working/biteshark-vps` / `staging.biteshark.live`)**: Connects Suggested Trails (`#smartScreen`, [public/smart.js](../../../public/smart.js)) to canonical PostgreSQL discovery via public `GET /api/trails/suggest` (`theme` in `sweet|farm|mix`, optional town filter, shared `?trail=` / `#trail=` stop resolution, truthful `match_reason` per stop, documented `SEED_014_TAXONOMY_CORRECTIONS` + attribute-driven classification for newly `/admin`-onboarded businesses, and address-normalized venue deduplication). Supports account-backed trail saving/deletion (`customer_saved_trails` + `customer_saved_trail_stops` in `migrations/027`, max `50` saved trails/user, `1..6` stops), authoritative post-save stop progress (`visited_at >= trail.created_at` with honest `visited_before_save_today` notice for earlier same-day visits), `#discoverSuggestedTrailsBar` quick-entry on `#discoverScreen`, and Vendor Marketing Kit relocated onto `#ownerScreen` (`#ownerMarketingCard`).
- **Secondary Staging (`staging2` branches prior to exploration merge)**: Still uses client-only `#smartScreen` trail previews.

## 2. Entry Points, APIs, Flags & Tests
- **Files**: `lib/customer-exploration.js` (`buildSuggestedTrail`, `saveUserTrail`, `listUserSavedTrails`, `deleteUserSavedTrail`, `hydrateSavedTrailsInTx`), `server/customer-exploration-routes.js`, `public/exploration-client.js`, `public/smart.js`, `public/smart.css`, `#smartScreen` (`public/index.html`).
- **APIs**: `GET /api/trails/suggest` (public + pending-age exempt), `GET|POST /api/me/trails`, `POST /api/me/trails/delete` (`14+` authenticated; `POST /api/me/trails/delete` remains available even when `suggested_trails` is `hidden`).
- **Feature Flags**: `suggested_trails` (itinerary builder, share links & saved trails) and `flavor_lab_tools` (stateless Flavor Finder craving matcher).
- **Tests**: `tests/customer-exploration.integration.cjs`, `tests/customer-exploration-browser.e2e.cjs`, `tests/feature-controls-browser.e2e.cjs`.
- **Safe Extension Points**: Generate stops strictly from active `isVendorPubliclyDiscoverable` rows and preserve `?trail=` / `#trail=<slug1,slug2,...>` URL compatibility.
