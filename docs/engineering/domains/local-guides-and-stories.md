# Domain Map — Local Guides & Editorial Stories

## 1. Current Behavior (Branch-Aware)
- **Baseline (`a4e9f53` & `a2f0135`)**: Renders curated Sonoma County editorial stories inside `#guidesScreen` from static client definitions in [public/local-guides.js](../../../public/local-guides.js) (`#localGuidesList`), governed by `local_guides_passport`. *(Known issue at `a4e9f53`: references absent `/assets/retrograde-roasting.jpg`, `/assets/oak-hill-guide.jpg`, `/assets/mitote.jpg`, falling back to `.guide-image-error`.)*
- **Branch `feature/customer-exploration-journal-trails` (`83181ba`)**: Serves curated Sonoma stories from `lib/editorial-stories.js` via `GET /api/stories` (`server/customer-exploration-routes.js`), replacing missing `/assets/*.jpg` files with self-contained BiteShark SVG editorial artwork, deep links to live `vendors` detail modals, and granular `editorial_stories` feature gating (`public` read for anonymous visitors).

## 2. Entry Points, APIs, Flags & Tests
- **Files**: `public/local-guides.js`, `public/local-guides.css`, `#guidesScreen` (`public/index.html`) *(+ `lib/editorial-stories.js`, `server/customer-exploration-routes.js`, `public/exploration-client.js` on `83181ba`)*.
- **APIs**: Static client-only at `a4e9f53`; `GET /api/stories` on `83181ba`.
- **Feature Flags**: `local_guides_passport` *(+ child `editorial_stories` on `83181ba`)*.
- **Tests**: `tests/feature-controls-browser.e2e.cjs` *(+ `tests/customer-exploration.integration.cjs` & `tests/customer-exploration-browser.e2e.cjs` on `83181ba`)*.
- **Safe Extension Points**: Never reference unbundled `/assets/*.jpg` or third-party stock images; link story stops to canonical `vendors.id` slugs verified in `migrations/014`.
