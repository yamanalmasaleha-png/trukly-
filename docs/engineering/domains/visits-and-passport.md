# Domain Map — Visit Journal & Food Passport

## 1. Current Behavior (Branch-Aware)
- **Baseline (`a4e9f53` & `a2f0135`)**: Client-side self-reported Food Passport on `#guidesScreen` ([public/guide-passport.js](../../../public/guide-passport.js), [public/guide-passport.css](../../../public/guide-passport.css)) storing up to 300 stamp entries in browser `localStorage['truckly_guide_passport_v1']`.
- **Branch `feature/customer-exploration-journal-trails` (`83181ba`)**: Moves durable customer visits into account-backed PostgreSQL table `customer_visits` (`migrations/027_customer_exploration_foundation.sql`, `FORCE ROW LEVEL SECURITY` via `app.user_id`), enforcing one active visit per `(user_id, recorded_vendor_id, visit_local_date)` in `America/Los_Angeles`, optional `<= 280` char personal notes, soft-delete (`POST /api/me/visits/delete`), JSON data export (`GET /api/me/exploration/export`), and explicit one-click legacy import from `localStorage['truckly_guide_passport_v1']` (`POST /api/me/exploration/import`). Anonymous visitors are prompted to sign in before saving visits.

## 2. Entry Points, APIs, Data & Tests
- **Files**: `public/guide-passport.js`, `public/guide-passport.css` *(+ `lib/customer-exploration.js`, `server/customer-exploration-routes.js`, `public/exploration-client.js`, `migrations/027` on `83181ba`)*.
- **APIs (`83181ba`)**: `GET /api/me/exploration`, `GET|POST /api/me/visits`, `POST /api/me/visits/delete`, `POST /api/me/exploration/import`, `GET /api/me/exploration/export`.
- **Permissions & Flags**: `14+` authenticated session (`account_owner_rls`); gated by `local_guides_passport` *(+ child `visit_journal` on `83181ba`)*.
- **Tests**: `tests/customer-exploration.integration.cjs`, `tests/customer-exploration-browser.e2e.cjs` (`83181ba`).
- **Safe Extension Points**: Preserve `America/Los_Angeles` `visit_local_date` uniqueness and `recorded_vendor_id` historical preservation when extending journal metadata.
