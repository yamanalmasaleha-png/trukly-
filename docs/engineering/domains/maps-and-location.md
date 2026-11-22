# Domain Map — Maps, Tile Providers & Vendor Location

## 1. Current Behavior
- **Baseline (`a4e9f53` & `83181ba`)**: Renders an interactive Leaflet 1.9.4 map inside `#discoverScreen` backed by server-validated `map_config` (`GET /api/trucks`), defaulting to `osm_standard` (`tile.openstreetmap.org`) with `referrerPolicy: 'origin'`, automatic tile-error counting, and graceful fallback to List view when tiles fail or `interactive_map` is `hidden`. Uses pin-capped (`10`/`14`/`18`) pill markers at `a4e9f53`/`83181ba`.
- **Integrated on `testing/yaman-staging2` from `antigravity/staging2-latest` (`a2f0135`)**: Replaces pin-capped pill markers with `public/map-cards.js` (`window.BiteSharkMapCards`) and `public/map-cards.css`: `84×82 px` self-contained SVG miniature cuisine truck markers (9 silhouettes) with deterministic collision-free screen-space clustering, `.food-cluster-menu` popup pickers, zero vendor cap, zero coordinate jitter, and explicit disclosure copy (`"Trucks are cuisine illustrations, not actual vendor vehicles."`).

## 2. Entry Points & Key Symbols
- **Server**: `resolveMapRuntimeConfig` ([lib/map-config.js](../../../lib/map-config.js)); `api/owner/location.js` (live vendor GPS/address publishing with `expires_at`).
- **Browser**: `ensureMapInitialized`, `bindMapResizeAndZoomListeners`, `applyFilters`, `selectArea` ([public/app.js](../../../public/app.js)) *(+ `BiteSharkMapCards.{layout,status,artwork,truckIcon}`, `renderMapCards`, `openMapCluster` on `a2f0135`)*.

## 3. HTTP APIs, Config & Data
- **APIs**: `GET /api/trucks` (`map_config` block), `GET /api/trucks/nearby`, `GET|POST /api/owner/location`, `GET /api/account/context` (`coarse_area` when `ENABLE_PROXY_COARSE_GEO=1`).
- **Tables**: `vendors` (`lat`, `lng`, `location_accuracy`, `primary_town`), `truck_settings` (`lat`, `lng`, `location`, `is_open`, `expires_at`).
- **Config Keys**: `BITESHARK_MAP_ENABLED`, `BITESHARK_MAP_PROVIDER`, `BITESHARK_MAP_TILE_URL`, `BITESHARK_MAP_PUBLIC_TOKEN` (rejects `sk.*`/`re_` secret prefixes!), `BITESHARK_MAP_MIN_ZOOM`, `BITESHARK_MAP_MAX_ZOOM`, `BITESHARK_ALLOW_TEST_MAP_PROVIDER`.

## 4. Permissions, Flags & Tests
- **Permissions**: Public map viewing; `POST /api/owner/location` requires `authorizeVendorOperation(..., 'manage_location')` (`Vendor Owner`, `Vendor Staff`, or `Admin: Top` AoB) + `!isWritePaused('owner')`.
- **Feature Flags**: `interactive_map` (`enabled` | `hidden`).
- **Tests**: `tests/map-resilience.test.cjs`, `tests/map-resilience-browser.e2e.cjs` *(+ `tests/map-cards.test.cjs` on `a2f0135`)*.
- **Known Inconsistencies**: Leaflet 1.9.4 loads from `unpkg.com` without SRI `integrity` attributes; volunteer OSM tiles require switching `BITESHARK_MAP_PROVIDER` to Stadia/Mapbox/MapTiler before high-traffic commercial launch; `/map-cards.js` and `/map-cards.css` are included in `NO_CACHE_STATIC_FILES` in `server/app.js` on `testing/yaman-staging2` to keep marker assets aligned with each deployed release.
- **Safe Extension Points**: Add commercial tile providers in `ALLOWED_MAP_PROVIDERS` (`lib/map-config.js`); extend SVG silhouettes in `public/map-cards.js` (`a2f0135`) while keeping `public/index.html` `<script>` order (`map-cards.js` before `app.js`).
