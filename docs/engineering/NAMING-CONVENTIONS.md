# Canonical Component Registry & Naming Conventions

To prevent parallel branches from inventing third or fourth implementations of shared utilities, consult this registry and [canonical-components.json](contracts/canonical-components.json) before writing new helpers, routes, SQL objects, or UI components.

---

## 1. Canonical Implementations vs Competing / Legacy Copies

| Shared Responsibility | Canonical Implementation (Use for New Code) | Competing / Legacy Implementations (Do Not Expand) | Evidence & Guidance |
|---|---|---|---|
| **DB Transactions & In-Tx Session Locking** | `withTransaction(db, async tx => ...)` in [db-tx.js](../../lib/db-tx.js#L168) | Direct `db.query(...)` in legacy `GET` handlers (`api/bookings/list.js`, `api/favorites/list.js`, `api/owner/*.js`) | `withTransaction` pins one `pg.Client`, acquires `FOR SHARE` locks on `auth_users` -> `auth_sessions` when `requireEligibleSessionInTx` is active, scopes `SET LOCAL app.*` GUCs, and cleans up state on rollback. |
| **Environment Variable Resolution** | `readEnvCompat`, `readBoolEnvCompat`, `readIntEnvCompat` in [env-compat.js](../../lib/env-compat.js) | Local `readIntEnv` (`lib/diagnostics.js`), `readCliEnvCompat` (`scripts/*.cjs`), raw `process.env.TRUCKLY_PG_NODE_MODULES` (`scripts/dev-server.cjs:623`) | Enforces `BITESHARK_*` primary over `TRUCKLY_*` alias and throws `EnvAliasConflictError` on security-critical conflicts. Register every new key in [configuration-keys.json](contracts/configuration-keys.json). |
| **CSRF Same-Origin Mutation Check** | `verifySameOriginMutationRequest` in [standalone-auth.js](../../lib/standalone-auth.js) (enforced in `server/app.js`) | `verifySameOriginMutation` in `lib/pager-notifications.js` (retained for `X-BiteShark-Client: web-pager-v1` on `/api/pager/subscriptions`) | Enforced centrally by `server/app.js` across `/api/auth/*`, governance, exploration, and domain mutations. |
| **Vendor & Platform RBAC** | `authorizeVendorOperation` ([authz.js](../../lib/authz.js)) + `reverifyModeratorInTx` / `reverifyPlatformAdminInTx` ([admin-routes.js](../../server/admin-routes.js)) | `resolveActorPermissions` (`lib/authz.js`) | Enforces vendor restrictions (`vendor_access_suspended`, `bookings_restricted`, `pager_restricted`), `Top` Act-on-Behalf audit reasons, and row-locked role verification. |
| **Feature Control Evaluation** | Server: `enforceHttpFeatureGate` / `evaluateFeatureControls` ([feature-controls.js](../../lib/feature-controls.js)); Client: `window.bitesharkFeatures` ([role-experience.js](../../public/role-experience.js)) | Raw `isWritePaused(...)` alone for optional product features | Keep `PAUSE_WRITES` as emergency env override; expose operator-governed optional features in `FEATURE_CONTROLS_REGISTRY`. |
| **Browser JSON Fetch Wrapper** | `window.bitesharkDiagnostics.fetchJsonBounded(url, opts)` in [diagnostics-client.js](../../public/diagnostics-client.js#L218) | `appFetchJson` (`app.js`), `rxJson` (`role-experience.js` — throws on `!ok`), `apiJson` (`admin.js` — throws on `!ok`), `kitchenFetch` (`pager.js`), `postAuthJson` (`auth-client.js`), raw `fetch` | `fetchJsonBounded` handles `AbortController` timeouts, `X-BiteShark-Release` skew detection, `X-Correlation-Id` extraction, and bounded client diagnostics without throwing on HTTP `4xx`/`5xx`. |
| **HTML Escaping** | Server: `escapeHtml` ([app.js](../../server/app.js#L96)); Browser: `window.bitesharkDiagnostics.escapeHtml(str)` ([diagnostics-client.js](../../public/diagnostics-client.js#L724)) | 11 module-local copies (`esc` in `app.js`/`admin.js`/`listing-highlights.js`, `rxEsc`, `pagerEscape`, `smartEscape`, `guidesEscape`, `guidePassportHtmlEscape`, `communityEscape`, `streetEscape`, `loginEsc`) | `diagnostics-client.js` loads first on `/index.html`, `/login.html`, and `/admin.html` and escapes all 5 entities (`&`, `<`, `>`, `"`, `'`). |
| **Accessible Modal Dialogs** | `window.bitesharkDiagnostics.openModalDialog` / `closeModalDialog` via `openAppModal` (`app.js`), `rxOpenModal` (`role-experience.js`), `adminOpenModal` (`admin.js`) | Direct `el.hidden = false` toggles in `role-experience.js` (`#rxAgeAssessmentModal`, `#inviteAcceptModal`) and `admin.js` (`#invActionModal`, `#invHistoryModal`, `#featureConfirmModal`) | Direct `.hidden` toggles bypass background `inert` locking, `Tab` focus trapping, and focus restoration. |
| **Pacific Calendar Dates** | `getPacificDateYYYYMMDD` ([dates.js](../../lib/dates.js)) & `resolvePacificCalendarDateParts` ([age-policy.js](../../lib/age-policy.js)) | **Unresolved unification across 5 helpers**: `getPacificNowContext` (`lib/discovery.js`), `pacificDateStr` (`server/admin-routes.js`), `pacificTodayISO` (`public/app.js`) | Never use `new Date().toISOString().slice(0, 10)` (UTC off-by-one after 4 PM / 5 PM PT). Backend `YYYY-MM-DD` code should import `lib/dates.js`. |
| **Community Moderation API** | `/api/admin/moderation` & `/api/admin/moderation/decision` ([admin-routes.js](../../server/admin-routes.js)) | `/api/community/moderate` ([api/community/moderate.js](../../api/community/moderate.js), called by `#ownerScreen` in `public/community.js`) | Retain `/api/community/moderate` for 30-route parity; add all new moderation features to `/api/admin/moderation*`. |
| **Discovery Listing Cards** | `cardHTML(t)` in [app.js](../../public/app.js) + `.truck-card` rules in [color-calm.css](../../public/color-calm.css) | `extraCard(t)` (thin alias calling `cardHTML(t, 0)`), legacy `.truck-card` blocks in `theme.css` & `neighborhood.css` | All primary and neighborhood cards share one horizontal component (`cardHTML`). |

---

## 2. Naming Conventions for New Code

*(Do not bulk-rename legacy `truck_*` / `truckly_*` identifiers — see §3 Legacy Mappings.)*

1. **Files**:
   - Backend ESM libraries & routers: `kebab-case.js` (`lib/feature-controls.js`, `server/admin-routes.js`).
   - Standalone CLI / test scripts (CommonJS): `kebab-case.cjs` (`scripts/manage-feature-controls.cjs`, `tests/feature-controls.integration.cjs`, `tests/*-browser.e2e.cjs`).
   - Registry / ESM tooling: `kebab-case.mjs` (`tools/code-registry/*.mjs`).
   - SQL migrations: `NNN_snake_case_description.sql` (`migrations/027_...sql`), strictly sequential 3-digit prefix.
2. **JavaScript Identifiers**:
   - Functions & variables: `camelCase` (`evaluateFeatureControls`, `verifySameOriginMutationRequest`).
   - Classes & Custom Errors: `PascalCase` (`SessionEligibilityError`, `EnvAliasConflictError`).
   - Module constants & allowlists: `UPPER_SNAKE_CASE` (`FEATURE_CONTROLS_REGISTRY`, `ALLOWED_FEATURE_KEYS`).
   - Browser globals on `window`: Namespace under `window.biteshark<Domain>` (`window.bitesharkAuth`, `window.bitesharkDiagnostics`, `window.bitesharkFeatures`, `window.bitesharkExploration`, `window.BiteSharkMapCards`) — **do not** add new unprefixed top-level `let`/`function` globals in `public/*.js`.
3. **Database Objects**:
   - Tables, columns, views, SQL functions: `snake_case` (`vendor_applications`, `created_at`, `recorded_vendor_id`).
   - New vendor foreign keys: name column `vendor_id TEXT REFERENCES vendors(id)` (or `recorded_vendor_id TEXT` when soft-preserving historical logs independent of catalog changes).
   - Indexes: `idx_<table>_<columns>`; Constraints: `<table>_<column_or_rule>_chk` / `_uniq`; Triggers: `trg_<action>_on_<table>`; RLS policies: `<table>_<action>_policy` or `<table>_<scope>`.
   - Transaction-local RLS GUCs: `app.<snake_case>` set **only** via `SELECT set_config('app.<key>', $1, true)` inside `withTransaction`.
4. **HTTP APIs & Payload Fields**:
   - Paths: `/api/<kebab-domain>/<kebab-action>` (`/api/admin/email-readiness`, `/api/me/visits/delete`). Self-scoped authenticated customer routes belong under `/api/me/*`; admin portal routes belong under `/api/admin/*`.
   - JSON request/response keys: `snake_case` (`correlation_id`, `idempotency_key`, `effective_state`, `requires_age_assessment`).
5. **Feature Keys, Diagnostic Keys & Error Codes**:
   - Feature control & diagnostic feature keys: `lower_snake_case` (`event_inquiries`, `pickup_pager_creation`).
   - HTTP/diagnostic error codes: `UPPER_SNAKE_CASE` (`AGE_ASSESSMENT_REQUIRED`, `FEATURE_PAUSED`, `INVALID_PUBLIC_ORIGIN_CONFIG`).
6. **DOM IDs, Data Attributes & CSS**:
   - HTML IDs: `camelCase` prefixed by screen/module (`#rxSupportIssuesModal`, `#admDiagGroupList`) — never reuse generic IDs (`#status`, `#list`, `#form`) across screens.
   - Data attributes: `data-<module>-<name>` in `kebab-case` (`data-feature-control`, `data-screen`).
   - CSS classes & custom properties: `kebab-case` prefixed by component/domain (`.rx-modal`, `.food-map-card`, `--trk-green`).
7. **Dates & Timestamps**:
   - Stored instants: `TIMESTAMPTZ` serialized as ISO-8601 UTC (`2026-11-22T07:00:00.000Z`).
   - Local calendar dates (bookings, schedules, visits): `DATE` (`YYYY-MM-DD`) evaluated in `America/Los_Angeles`, preserved via `pg.types.setTypeParser(1082, val => String(val))`.

---

## 3. Legacy `Truckly` -> `BiteShark` Compatibility Mappings (Must Preserve)

The following `truckly` / `truck` identifiers are load-bearing upgrade-continuity contracts and **must not be renamed** without a coordinated migration and dual-read transition:
- Session cookie **`__Host-truckly_session`** (`lib/standalone-auth.js`).
- Browser storage keys **`truckly_catalog_v2`**, **`truckly_favs`**, **`truckly_favs_scope`**, **`truckly_notify`**, **`truckly_owner_*`**, **`truckly_pager_subs_v1`**, **`truckly_guide_passport_v1`**, and IndexedDB **`truckly-dish-notebook-v1`**.
- Primary staging paths, systemd units, Linux user, and DB roles: `/srv/truckly-staging`, `/etc/truckly-staging`, `truckly-staging-api.service`, `truckly-staging-worker.service`, `truckly-stg`, `truckly_staging`, `truckly_stg_app`, `truckly_stg_migrator`.
- Legacy SQL columns `bookings.truck_id`, `favorites.truck_id`, `owner_profiles.truck_id`, `owner_schedule.truck_id`, `truck_settings.truck_id` and frozen routes `/api/trucks*`.
- `TRUCKLY_*` environment variable aliases in `lib/env-compat.js` and `X-Truckly-Client` header alias.
