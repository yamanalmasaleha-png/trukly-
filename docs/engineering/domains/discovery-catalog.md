# Domain Map — Discovery & Unified Catalog

- **Shared Contract**: [`CTR-DISCOVERY-CATALOG`](../generated/CONTRACTS-CATALOG.md) ([shared-contracts.json](../contracts/shared-contracts.json))
- **Authoritative Deep Dive**: [P1_UNIFIED_DISCOVERY_ARCHITECTURE.md](../../P1_UNIFIED_DISCOVERY_ARCHITECTURE.md) & [PHOTO_MENU_VERIFICATION.md](../../PHOTO_MENU_VERIFICATION.md)

## 1. Current Behavior
Serves BiteShark's canonical 59-listing Sonoma County directory (food trucks, pop-ups, cafés, farm stands, farmers markets) from PostgreSQL, merging static verified seed metadata with live vendor settings/schedules (`America/Los_Angeles`), rendering compact horizontal `.truck-card` items (`cardHTML`) and rich `#detailModal` views, with a 15-minute client `localStorage` fallback during transient backend outages.

## 2. Entry Points & Key Symbols
- **Server**: `loadUnifiedDiscoveryCatalog`, `mapCatalogRow`, `invalidateDiscoveryCache` ([lib/discovery.js](../../../lib/discovery.js)); `api/trucks.js`, `api/trucks/nearby.js`.
- **Browser**: `refreshDiscoveryCatalog`, `sanitizeCatalogItem`, `applyFilters`, `cardHTML`, `openDetail`, `extraDetail`, `surpriseMe` ([public/app.js](../../../public/app.js)); `window.bitesharkListingHighlights` ([public/listing-highlights.js](../../../public/listing-highlights.js)); `.truck-card` ([public/color-calm.css](../../../public/color-calm.css)).

## 3. HTTP APIs & Storage
- **Active Routes**: `GET /api/trucks` (`?fresh=1` bypasses 30s server cache), `GET /api/trucks/nearby?lat=&lng=`.
- **Unreferenced Legacy Routes (Retained for 30-route parity)**: `GET /api/catalog/{cities,cuisines,featured}`, `GET /api/schedule/today`, `GET /api/trucks/{search,:id}`.
- **Database Tables**: `vendors` (`migrations/011,014,016,018,025`), joined with `owner_profiles`, `truck_settings`, and `owner_schedule`.
- **Browser Storage**: `localStorage['truckly_catalog_v2']` (15-min TTL), `localStorage['truckly_favs']` + `truckly_favs_scope` (`GET /api/favorites/list`, `POST /api/favorites/toggle`).

## 4. Permissions, Flags & Cross-Domain Dependencies
- **Permissions**: Public read (`hidden_from_discovery = true` vendors suppressed via `evaluateEffectiveVendorRestrictions`). Favorites require `14+` authenticated session.
- **Feature Flags**: Core catalog is **protected essential** (`public_vendor_discovery` — never switchable). Detail modal CTAs read `event_inquiries` *(and `visit_journal` / `private_photos` on `83181ba`)*.
- **Cross-Domain Dependencies**: Feeds `trucks` array to Maps, Bookings, Community vendor selectors, Flavor Lab/Trails, Local Guides, and Admin Vendor Preview.

## 5. Tests, Known Inconsistencies & Safe Extension Points
- **Tests**: `tests/p1-unified-discovery.integration.cjs`, `tests/listing-verification.cjs`, `tests/discovery-browser.e2e.cjs`, `tests/discovery-cards-ux-browser.e2e.cjs`.
- **Known Inconsistencies**: `api/favorites/toggle.js:10` calls `isWritePaused("favorites")` (`KD-001`); `openDetail` is wrapped twice by `listing-highlights.js` and `smart.js` (load-order sensitive); `lib/catalog.js` vendor array is simulator-only.
- **Safe Extension Points**: Add catalog columns via additive migration on `vendors` + projection in `lib/discovery.js#mapCatalogRow`; style card updates in `public/color-calm.css`.
