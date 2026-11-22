# Domain Map — Visit Journal & Food Passport

## 1. Current Behavior
- **Primary (`working/biteshark-vps` / `staging.biteshark.live`)**: Stores self-reported customer visits and private tasting notes (`<= 280` chars) in PostgreSQL table `customer_visits` (`migrations/027_customer_exploration_foundation.sql`, `FORCE ROW LEVEL SECURITY` via `app.user_id`). Enforces at most 1 active visit per `(user_id, recorded_vendor_id, visit_local_date)` in `America/Los_Angeles` (`idx_customer_visits_active_user_vendor_day`), allows repeat visits on distinct Pacific calendar days (`+25` points each), supports soft-delete (`POST /api/me/visits/delete`), explicit user-confirmed one-time import from legacy `localStorage['truckly_guide_passport_v1']` (`POST /api/me/exploration/import`), and self-service JSON privacy export (`GET /api/me/exploration/export` + `#rxExplorationPrivacyModal` in `public/role-experience.js`).
- **Secondary Staging (`staging2` branches prior to exploration merge)**: Still uses device-only `localStorage['truckly_guide_passport_v1']`.

## 2. Entry Points, APIs, Data & Tests
- **Files**: `lib/customer-exploration.js`, `server/customer-exploration-routes.js`, `public/exploration-client.js`, `public/guide-passport.js`, `public/guide-passport.css`, `public/role-experience.js` (`#rxExplorationPrivacyModal`), `migrations/027_customer_exploration_foundation.sql`.
- **APIs**: `GET /api/me/exploration`, `GET|POST /api/me/visits`, `POST /api/me/visits/delete`, `POST /api/me/exploration/import`, `GET /api/me/exploration/export`.
- **Permissions & Flags**: `14+` authenticated session (`account_owner_rls`); gated by `local_guides_passport` + `visit_journal` *(while `/api/me/exploration/export` and `/api/me/visits/delete` remain available to the account owner even when `visit_journal` is `hidden`)*.
- **Tests**: `tests/customer-exploration.integration.cjs`, `tests/customer-exploration-browser.e2e.cjs`.
- **Safe Extension Points**: Preserve `America/Los_Angeles` `visit_local_date` uniqueness and `recorded_vendor_id` + `vendor_name_snapshot` historical preservation when extending journal metadata.
