# Domain Map — Flavor Lab & Suggested Trails

## 1. Current Behavior (Branch-Aware)
- **Baseline (`a4e9f53` & `a2f0135`)**: Client-side Flavor Lab (`#smartScreen`, [public/smart.js](../../../public/smart.js), [public/smart.css](../../../public/smart.css)) providing 3-stop Sonoma trail generation (`#trail=<id1,id2,id3>` hash sharing), dish pairing suggestions, and client-side vendor marketing card previews (`openSmart('marketing')`).
- **Branch `feature/customer-exploration-journal-trails` (`83181ba`)**: Connects Suggested Trails to canonical PostgreSQL discovery via public `GET /api/trails/suggest` (`theme` in `sweet|farm|mix`, optional town filter, truthful `match_reason` per stop), adds account-backed trail saving/deletion (`customer_saved_trails` + `customer_saved_trail_stops` in `migrations/027`, max `50` saved trails/user, `1..6` stops), adds `#discoverSuggestedTrailsBar` quick-entry on `#discoverScreen`, and relocates the Vendor Marketing Kit onto `#ownerScreen` (`#ownerMarketingCard`). Anonymous visitors can generate and share `#trail=...` links and are prompted to sign in when saving a trail.

## 2. Entry Points, APIs, Flags & Tests
- **Files**: `public/smart.js`, `public/smart.css`, `#smartScreen` (`public/index.html`) *(+ `lib/customer-exploration.js#buildSuggestedTrail`, `saveUserTrail`, `listUserSavedTrails`, `deleteUserSavedTrail`, `server/customer-exploration-routes.js` on `83181ba`)*.
- **APIs (`83181ba`)**: `GET /api/trails/suggest` (public), `GET|POST /api/me/trails`, `POST /api/me/trails/delete` (`14+` authenticated).
- **Feature Flags**: `flavor_lab_tools` *(+ child `suggested_trails` on `83181ba`)*.
- **Tests**: `tests/feature-controls-browser.e2e.cjs` *(+ `tests/customer-exploration.integration.cjs` & `tests/customer-exploration-browser.e2e.cjs` on `83181ba`)*.
- **Safe Extension Points**: Generate stops strictly from active `loadUnifiedDiscoveryCatalog` rows (`hidden_from_discovery = false`) and preserve `#trail=<slug1,slug2,...>` URL compatibility.
