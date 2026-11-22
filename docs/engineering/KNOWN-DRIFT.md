# Known Drift, Latent Bugs & Doc-vs-Code Discrepancy Ledger

This ledger records **verified discrepancies** discovered by inspecting the codebase at base commit `a4e9f532223f88486610a3c8a1babaa58c6e4ee6` alongside active branches `feature/customer-exploration-journal-trails` (`83181ba`) and `antigravity/staging2-latest` (`a2f0135`).

Per task scope, runtime application code was **not** altered in this handbook branch; every item below includes exact file/symbol evidence so fixes can be scheduled cleanly in dedicated PRs. For machine-detected baseline items, see [DRIFT-REPORT.md](generated/DRIFT-REPORT.md).

---

## 1. High-Priority Runtime & Security-Adjacent Drift (Fix in Dedicated Runtime PRs)

### `KD-001` — Invalid Write-Pause Scope `"favorites"` Triggers Global Write Lockout (`High`)
- **Evidence**: [api/favorites/toggle.js](../../api/favorites/toggle.js#L10) calls `isWritePaused("favorites")`, whereas `VALID_WRITE_PAUSE_SCOPES` in [lib/authz.js](../../lib/authz.js#L120-L127) contains only `['bookings', 'pagers', 'community', 'owner', 'notifications', 'all']`.
- **Impact**: Because `inspectWritePauseConfig()` fails closed (`failClosedAll = true`) on any unrecognized token, setting `BITESHARK_PAUSE_WRITES=favorites` halts **all** writes across bookings, pagers, community, and owner routes (`503`).
- **Remediation**: Add `'favorites'` to `VALID_WRITE_PAUSE_SCOPES` in `lib/authz.js` and `tests/backend-hardening.integration.cjs`.

### `KD-002` — Stale DOM Element IDs in Sign-Out Cleanup (`Medium` — Shared-Device Privacy)
- **Evidence**: `resetRoleExperienceSignedOutState` in [public/role-experience.js](../../public/role-experience.js#L1051-L1072) looks up:
  1. `getElementById('rxViewpointBanner')` — actual banner ID created at line 365 is `'bitesharkViewpointBanner'`.
  2. `['rxAgeAssessmentModal', 'vendorApplyModal', 'supportModal', 'myAppsModal']` — `'supportModal'` and `'myAppsModal'` do not exist; actual IDs are `'supportIssuesModal'` (line 756) and `'communityReportModal'` (line 855).
  3. `['siDesc', 'siSubject', 'siCorrId']` — `'siDesc'` and `'siCorrId'` do not exist; actual textarea ID is `'siDescription'` (line 804).
- **Impact**: Signing out without a full page reload leaves `#bitesharkViewpointBanner` visible, leaves `#supportIssuesModal` open, and retains typed draft text inside `#siDescription`.
- **Remediation**: Update those exact IDs in `resetRoleExperienceSignedOutState` and add a browser E2E assertion.

### `KD-003` — Static Asset `NO_CACHE_STATIC_FILES` Omissions (`Medium` — Deploy Skew)
- **Evidence**: `NO_CACHE_STATIC_FILES` in [server/app.js](../../server/app.js#L68-L94) lists 20 paths at `a4e9f53`, omitting 16 unhashed JS/CSS files loaded by `public/index.html` (`/listing-highlights.js`, `/characters.js`, `/coffee-club.js`, `/street-whispers.js`, `/neighborhood.css`, `/pager.css`, `/pager-experience.css`, `/smart.css`, `/characters.css`, `/coffee-club.css`, `/local-guides.css`, `/guide-passport.css`, `/layout-polish.css`, `/community.css`, `/street-whispers.css`, `/color-calm.css`, plus `/map-cards.{js,css}` on `a2f0135`).
- **Impact**: Omitted files are served with `Cache-Control: public, max-age=300` without content hashes, allowing 5-minute mixed-asset skew right after a release switch.

### `KD-004` — Bottom-Nav Guides Icon Overwritten by `paintFlavorIcons` (`Low` — UI Bug)
- **Evidence**: `paintFlavorIcons()` in [public/coffee-club.js](../../public/coffee-club.js#L29-L30) maps `discover`, `favorites`, and `bookings` and falls back to `'party'` for both `.book-nav` and `.guide-nav` (`[data-screen="guides"]`), replacing the Guides medal icon with a duplicate party horn *(repaired on `83181ba`)*.

### `KD-005` — Missing Static Story Images at `a4e9f53` / `a2f0135` (`Medium` — Repaired on `83181ba`)
- **Evidence**: `public/local-guides.js:2-4` at `a4e9f53` references `/assets/retrograde-roasting.jpg`, `/assets/oak-hill-guide.jpg`, and `/assets/mitote.jpg`, which do not exist in `public/` (`404` into fallback UI). Branch `83181ba` replaces these with curated SVG artwork via `lib/editorial-stories.js`.

### `KD-006` — Branch-Specific Deployment Template Gaps (`Medium`)
- **Evidence**:
  - `deploy/nginx/truckly-staging.conf.template` at `a4e9f53` omits `location = /api/onboarding/evidence { client_max_body_size 1m; }` (present in `staging.biteshark.live.conf.template` and `staging2.biteshark.live.conf.template`).
  - On `83181ba`, `deploy/nginx/staging2.biteshark.live.conf.template` and `deploy/systemd/biteshark-staging2-api.service` do not yet include the `/api/me/photos` `8m` body limit or `ReadWritePaths` photo directory added to `staging1` templates, and `lib/age-policy.js` does not exempt `/api/stories` or `/api/trails/suggest` for signed-in `not_assessed` users.

---

## 2. Documentation-vs-Code Discrepancies in Existing `docs/*.md`

1. **`docs/VPS_RELEASE_VERIFICATION_REPORT.md` (Lines 10, 159, 185)**:
   - Broken links to `./RELEASE_VERIFICATION_REPORT.md` (actual path: `./archive/hatchable/RELEASE_VERIFICATION_REPORT.md`) and reference to deleted `tests/staging-hatchable-gates.cjs`.
2. **`docs/ADMIN_GOVERNANCE_AND_ONBOARDING.md`**:
   - Line 49 omits Migration `026` (`trg_protect_last_top_admin_on_auth_users` on `auth_users`).
   - Line 84 cites `--app-role truckly_staging_app` (actual role: `truckly_stg_app`); line 98 cites `/etc/truckly-staging/migration.env` (actual file: `/etc/truckly-staging/migrator.env`).
   - Line 178 cites nonexistent `POST /api/admin/users/role` (actual route: `POST /api/admin/accounts/role`).
   - Line 181 cites `'sent' | 'failed'` for `account_invitations.delivery_status` (actual check constraint in `023`: `'not_requested' | 'pending_approval' | 'queued' | 'provider_accepted' | 'delivery_failed' | 'delivery_uncertain' | 'staging_mailbox_only' | 'superseded'`).
   - Line 182 cites `30s` invitation resend cooldown (actual default in `server/admin-routes.js:4980`: `45s`, plus dedicated `POST /api/admin/invitations/resend`).
3. **`docs/BACKEND_SECURITY_HARDENING.md`**:
   - Carries historical pre-VPS Hatchable banner (`27` routes, `hatchable.toml`); actual `api/` has `30` routes on standalone VPS runtime.
4. **`docs/P1_UNIFIED_DISCOVERY_ARCHITECTURE.md` & `docs/PAGER_NOTIFICATIONS_RUNBOOK.md`**:
   - `P1_UNIFIED_DISCOVERY_ARCHITECTURE.md:18` states `vendors` is written by migrations only (superseded by `/api/admin/vendors/update` & `/api/admin/applications/decision` in `018`).
   - `PAGER_NOTIFICATIONS_RUNBOOK.md:117-134` lists legacy `TRUCKLY_*` env names without primary `BITESHARK_*` names or Migration `022` feature controls.
5. **Policy Copy Drift (`public/policies/privacy.html:101`)**:
   - States Dish Notebook photos stay in `localStorage` (`cookies-storage.html:99` accurately states `IndexedDB` at `a4e9f53`; on `83181ba`, customer photos move to authenticated account storage).
6. **`TECH_MAP.md:35` & `deploy/install-staging-release.sh:24`**:
   - Cite migrations `001`–`021` and `001`–`017` respectively (`migrations/` is at `026` on `a4e9f53` and `027` on `83181ba`).
7. *(On `83181ba`)* **`docs/CUSTOMER_EXPLORATION_OPERATIONS.md`**:
   - Cites `scripts/feature-control-cli.cjs` (actual script: `scripts/manage-feature-controls.cjs`) and underscores in `truckly_staging_photos_<TS>.tar.gz.gpg` (actual backup script uses hyphens: `${DB_NAME}-photos-${STAMP}.tar.gz.gpg`).

---

## 3. Suspected Orphans & Dead Artifacts (Do Not Auto-Delete)

- **7 Unreferenced `api/*.js` Routes** (`api/catalog/{cities,cuisines,featured}.js`, `api/schedule/today.js`, `api/trucks/{search,[id]}.js`, `api/owner/bookings.js`) — retained for `REGISTERED_DOMAIN_ROUTE_COUNT === 30` in `server/routes.js`.
- **`public/build.json`** — Frozen v77 static JSON (`functions: 27, migrations: 10`), unreferenced at runtime.
- **`lib/catalog.js` (`CANONICAL_VENDORS`, `VENDORS_BY_ID`, `getCanonicalVendor`)** — Used only by local simulator `scripts/dev-server.cjs` (production imports only `BOOKING_PACKAGES`).
- **`lib/diagnostics.js#reportDomainRouteFailure`** — Exported with 0 callers (`server/app.js` uses `res.__bsDiagHook`).
- **Dead RLS GUC `app.worker_internal`** in `migrations/024:58,63` (`recordWorkerHeartbeat` sets `app.diagnostics_internal = 'true'`).
- **Unreferenced `public/app.js` Helpers & `.pager-steps` CSS** — `cardOpenBadge(t)`, `extraCard(t)`, `window.__BITESHARK__.user` simulator branch, and `.pager-steps` in `public/pager.css`.
