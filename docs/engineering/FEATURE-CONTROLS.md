# Feature Controls Architecture & Registry

BiteShark's Feature Controls system ([feature-controls.js](../../lib/feature-controls.js), `migrations/022_feature_controls.sql`) lets `Admin: Top` pause, hide, or restrict optional capabilities to `staff_beta` in real time (`0ms` server cache) without redeploying, while keeping essential security and safety capabilities permanently active.

---

## 1. Protected Non-Switchable Essential Capabilities

`PROTECTED_ESSENTIAL_CAPABILITIES` (`lib/feature-controls.js:31-62`) can **never** be disabled via DB toggles:
1. `authentication_and_sessions` (`/login.html`, `/api/auth/*`, logout)
2. `age_eligibility_and_restrictions` (`lib/age-policy.js`, account/vendor suspensions)
3. `rbac_csrf_rls_and_audit` (RBAC, CSRF, rate limits, `FORCE RLS`, `audit_logs`)
4. `policy_accessibility_and_privacy_support` (`/policies/*`, `/api/issues*` support channel)
5. `public_vendor_discovery` (`/api/trucks*`, `/api/catalog/*`, `/api/schedule/today`)
6. `top_admin_recovery_and_health` (`/admin`, `/api/admin/features*`, `/api/healthz`)

---

## 2. Precedence Hierarchy & Fail-Closed Rules

Effective availability (`evaluateFeatureControls`) requires **all** of the following in strict order:
1. **Trusted Configuration Read**: If PostgreSQL `feature_controls` cannot be queried, optional mutations fail closed with `503 FEATURE_CONFIG_UNAVAILABLE`.
2. **Authoritative Environment Overrides (Highest Priority)**:
   - `BITESHARK_PAUSE_WRITES` (`bookings`, `pagers`, `community`, `owner`, `notifications`, `all` — or any malformed token -> pauses all) forces matching controls into `paused`.
   - `BITESHARK_PUSH_PROVIDER_MODE=disabled` (or invalid VAPID config / `DISABLE_NOTIFICATION_DELIVERY=1` / `DISABLE_SUBSCRIPTIONS=1`) overrides `pager_push_delivery` and `pager_push_subscriptions`.
   - `BITESHARK_MAP_ENABLED=0` or invalid `MAP_*` config overrides `interactive_map` to `hidden`.
3. **Parent DAG Dependencies (`depends_on`)**: Validated cycle-free at startup via `assertCycleFreeFeatureRegistry()`. Hiding/pausing a parent restricts its child's `effective_state` **without overwriting** the child's saved database row.
4. **Persisted Operator State**: `enabled` | `paused` (`503 FEATURE_PAUSED` on mutations) | `hidden` (`403 FEATURE_DISABLED` on reads & mutations).
5. **Verified Audience**: `all` vs `staff_beta` (grants access to verified `Admin: Top`, `Admin: Mod`, and active `Vendor Owner`/`Staff` members).

---

## 3. Registered Feature Keys (`a4e9f53` Baseline + `83181ba` Additions)

| Key | Default (`Audience`) | Allowed States | Depends On | Server Enforcement (`ROUTE_FEATURE_ENFORCEMENT_RULES` / Worker) | Primary UI Consumers |
|---|---|---|---|---|---|
| `event_inquiries` | `enabled` (`all`) | `enabled, paused, hidden` | — | `POST /api/bookings/create`, `GET /api/trucks/availability` | `app.js`, `role-experience.js` (`#bookingModal`, Book nav) |
| `community_hub` | `enabled` (`all`) | `enabled, hidden` | — | `GET /api/community/list` *(Mod/Top allowed when hidden)*, `POST /api/community/report` | `community.js`, `role-experience.js` (`#communityScreen`) |
| `community_submissions` | `enabled` (`all`) | `enabled, paused, hidden` | `community_hub` | `POST /api/community/post` | `community.js`, `street-whispers.js` |
| `interactive_map` | `enabled` (`all`) | `enabled, hidden` | — | `lib/discovery.js` (`map_config` in `/api/trucks`) | `app.js` (Leaflet map vs List fallback) |
| `local_guides_passport` | `enabled` (`all`) | `enabled, paused, hidden` | — | Parent gate for `#guidesScreen` *(and `/api/me/exploration*` on `83181ba`)* | `local-guides.js`, `guide-passport.js`, `role-experience.js` |
| `flavor_lab_tools` | `enabled` (`all`) | `enabled, hidden` | — | Parent gate for `#smartScreen` | `smart.js`, `role-experience.js` |
| `vendor_onboarding` | `enabled` (`all`) | `enabled, paused, hidden` | — | `POST /api/onboarding/applications`, `POST /api/onboarding/evidence` | `role-experience.js` (`#vendorApplyModal`, `#vendorIntroScreen`) |
| `pickup_pager_demo` | `enabled` (`all`) | `enabled, hidden` | — | Client demo mode on `#pagerScreen` | `pager.js`, `role-experience.js` |
| `pickup_pager_creation` | `enabled` (`all`) | `enabled, paused, hidden` | — | `POST /api/pager/staff` *(existing tickets still updatable via `/api/pager/update`!)* | `pager.js` (`#pagerScreen` staff form) |
| `pager_push_delivery` | `enabled` (`all`) | `enabled, paused, hidden` | — | Worker batch dispatch (`lib/pager-notifications.js`) | `admin.js`, `pager.js` |
| `pager_push_subscriptions` | `enabled` (`all`) | `enabled, paused, hidden` | `pager_push_delivery` | `POST /api/pager/subscriptions` *(`DELETE` unsubscribe always allowed!)* | `pager.js` |
| `nearby_alert_preferences` | `enabled` (`all`) | `enabled, paused, hidden` | — | `POST /api/notifications/settings` | `app.js` |
| `passkey_signin` / `owner_menu_photo_upload` | Read-only disclosures | `read_only: true` | — | Informational disclosure cards in `/admin#features` | `admin.js` |
| *(Branch `83181ba` only)* `editorial_stories`, `visit_journal`, `private_photos`, `exploration_badges`, `weekly_challenges`, `suggested_trails`, `street_whispers` | `enabled` (`all`) | Granular sub-controls | `local_guides_passport` / `flavor_lab_tools` / `community_hub` | `/api/stories`, `/api/trails/suggest`, `/api/me/{visits,photos,trails}*` | `exploration-client.js`, `local-guides.js`, `guide-passport.js`, `smart.js`, `street-whispers.js` |

---

## 4. Administrative & CLI Management

- **Endpoints**: `GET /api/features` (public/caller-scoped), `GET /api/admin/features` (`Mod` + `Top`), `POST /api/admin/features/update` (`Admin: Top` ONLY; requires `expected_revision`, `reason`, and `confirmed_impact: true` for `high_impact_interrupt` controls; writes `feature_control_history` + `audit_logs`; broadcasts on `BroadcastChannel('biteshark_feature_controls_v1')`).
- **SSH Recovery CLI**: `node scripts/manage-feature-controls.cjs --status | --set <key>=<state>[:<audience>] --actor-email <top@email> --reason "..." --env-file /etc/truckly-staging/migrator.env`.
- **Verification Suites**: `tests/feature-controls.integration.cjs` and `tests/feature-controls-browser.e2e.cjs`.
