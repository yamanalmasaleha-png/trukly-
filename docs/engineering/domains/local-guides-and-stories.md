# Domain Map — Local Guides & Editorial Stories

- **Shared Contract**: [`CTR-CUSTOMER-EXPLORATION`](../generated/CONTRACTS-CATALOG.md) ([shared-contracts.json](../contracts/shared-contracts.json))

## 1. Current Behavior
- **Primary (`working/biteshark-vps` / `staging.biteshark.live`)**: Serves 5 sourced Sonoma County editorial stories from [lib/editorial-stories.js](../../../lib/editorial-stories.js) (`EDITORIAL_STORIES`, `listEditorialStories`) via public `GET /api/stories` ([server/customer-exploration-routes.js](../../../server/customer-exploration-routes.js)), rendered on `#discoverStoriesStrip` and `#guidesScreen` ([public/local-guides.js](../../../public/local-guides.js)) with self-contained BiteShark SVG editorial artwork, deep links to live `vendors` detail modals, and independent `editorial_stories` feature gating (`depends_on: ['local_guides_passport']`). Accessible to both anonymous visitors and signed-in `not_assessed` sessions (`isGovernanceRouteExemptFromAgeGate` in `lib/age-policy.js`).
- **Secondary Staging (`staging2` branches prior to exploration merge)**: Still renders static client story definitions from `public/local-guides.js`.

## 2. Entry Points, APIs, Flags & Tests
- **Files**: `lib/editorial-stories.js`, `server/customer-exploration-routes.js`, `public/exploration-client.js`, `public/local-guides.js`, `public/local-guides.css`, `#guidesScreen` (`public/index.html`).
- **APIs**: `GET /api/stories` (public).
- **Feature Flags**: `local_guides_passport` (parent hub) and `editorial_stories`.
- **Tests**: `tests/customer-exploration.integration.cjs`, `tests/customer-exploration-browser.e2e.cjs`, `tests/feature-controls-browser.e2e.cjs`.
- **Safe Extension Points**: Never reference unbundled `/assets/*.jpg` or third-party stock images; link story stops to canonical `vendors.id` slugs verified in `migrations/014`.
