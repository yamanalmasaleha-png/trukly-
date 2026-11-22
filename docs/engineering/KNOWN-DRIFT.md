# Known Drift, Latent Bugs & Doc-vs-Code Discrepancy Ledger

This ledger tracks **verified discrepancies** across the codebase on `working/biteshark-vps` alongside secondary-staging branches (`testing/yaman-staging2`, `antigravity/staging2-latest`). For machine-detected baseline items, see [DRIFT-REPORT.md](generated/DRIFT-REPORT.md).

---

## 1. Active Runtime Drift (Unresolved — Schedule in Dedicated PRs)

### `KD-001` — Invalid Write-Pause Scope `"favorites"` Triggers Global Write Lockout (`High`)
- **Evidence**: [api/favorites/toggle.js](../../api/favorites/toggle.js#L10) calls `isWritePaused("favorites")`, whereas `VALID_WRITE_PAUSE_SCOPES` in [lib/authz.js](../../lib/authz.js#L120-L127) contains only `['bookings', 'pagers', 'community', 'owner', 'notifications', 'all']`.
- **Impact**: Because `inspectWritePauseConfig()` fails closed (`failClosedAll = true`) on any unrecognized token, setting `BITESHARK_PAUSE_WRITES=favorites` halts **all** writes across bookings, pagers, community, and owner routes (`503`).
- **Remediation**: Add `'favorites'` to `VALID_WRITE_PAUSE_SCOPES` in `lib/authz.js` and `tests/backend-hardening.integration.cjs`.

---

## 2. Resolved on `working/biteshark-vps` (Still Pending Merge Into `staging2` Branches)

- **`KD-002` (Resolved on `working/biteshark-vps`)**: Stale DOM IDs in `resetRoleExperienceSignedOutState` (`public/role-experience.js`) repaired to use `#bitesharkViewpointBanner`, `#supportIssuesModal`, `#communityReportModal`, `#rxExplorationPrivacyModal`, and `#siDescription`.
- **`KD-003` (Resolved on `working/biteshark-vps`)**: All 38 unhashed first-party HTML/CSS/JS entry assets in `public/` (including `/layout-polish.css` and `/color-calm.css`) are now registered in `NO_CACHE_STATIC_FILES` (`server/app.js`). *(When `antigravity/staging2-latest` merges, also add `/map-cards.js` and `/map-cards.css`.)*
- **`KD-004` & `KD-005` (Resolved on `working/biteshark-vps`)**: `paintFlavorIcons` (`public/coffee-club.js`) preserves `.guide-nav` icon, and `lib/editorial-stories.js` (`GET /api/stories`) serves self-contained BiteShark SVG story artwork instead of absent `/assets/*.jpg` files.
- **`KD-006` (Resolved on `working/biteshark-vps`)**: `deploy/nginx/staging2.biteshark.live.conf.template`, `deploy/systemd/biteshark-staging2-api.service`, `deploy/staging.env.example`, `lib/age-policy.js` (`/api/stories`, `/api/trails/suggest`), `public/policies/{privacy,cookies-storage}.html`, and `docs/CUSTOMER_EXPLORATION_OPERATIONS.md` are aligned with actual implementation.

---

## 3. Remaining Documentation-vs-Code Discrepancies in Legacy `docs/*.md`

1. **`docs/VPS_RELEASE_VERIFICATION_REPORT.md` (Lines 10, 159, 185)**:
   - Broken links to `./RELEASE_VERIFICATION_REPORT.md` (actual path: `./archive/hatchable/RELEASE_VERIFICATION_REPORT.md`) and reference to deleted `tests/staging-hatchable-gates.cjs`.
2. **`docs/ADMIN_GOVERNANCE_AND_ONBOARDING.md`**:
   - Line 49 omits Migration `026` (`trg_protect_last_top_admin_on_auth_users` on `auth_users`).
   - Line 84 cites `--app-role truckly_staging_app` (actual role: `truckly_stg_app`); line 98 cites `/etc/truckly-staging/migration.env` (actual file: `/etc/truckly-staging/migrator.env`).
   - Line 178 cites nonexistent `POST /api/admin/users/role` (actual route: `POST /api/admin/accounts/role`).
   - Line 181 cites `'sent' | 'failed'` for `account_invitations.delivery_status` (actual check constraint in `023`: `'not_requested' | 'pending_approval' | 'queued' | 'provider_accepted' | 'delivery_failed' | 'delivery_uncertain' | 'staging_mailbox_only' | 'superseded'`).
   - Line 182 cites `30s` invitation resend cooldown (actual default in `server/admin-routes.js`: `45s`, plus dedicated `POST /api/admin/invitations/resend`).
3. **`docs/BACKEND_SECURITY_HARDENING.md`**:
   - Carries historical pre-VPS Hatchable banner (`27` routes, `hatchable.toml`); actual `api/` has `30` routes on standalone VPS runtime.
4. **`docs/P1_UNIFIED_DISCOVERY_ARCHITECTURE.md` & `docs/PAGER_NOTIFICATIONS_RUNBOOK.md`**:
   - `P1_UNIFIED_DISCOVERY_ARCHITECTURE.md:18` states `vendors` is written by migrations only (superseded by `/api/admin/vendors/update` & `/api/admin/applications/decision` in `018`).
   - `PAGER_NOTIFICATIONS_RUNBOOK.md:117-134` lists legacy `TRUCKLY_*` env names without primary `BITESHARK_*` names or Migration `022` feature controls.
5. **`TECH_MAP.md:35` & `deploy/install-staging-release.sh:24`**:
   - Cite historical migration counts (`001`–`021` and `001`–`017`); `migrations/` is at `028` on `working/biteshark-vps`.

---

## 4. Suspected Orphans & Dead Artifacts (Do Not Auto-Delete)

- **7 Unreferenced `api/*.js` Routes** (`api/catalog/{cities,cuisines,featured}.js`, `api/schedule/today.js`, `api/trucks/{search,[id]}.js`, `api/owner/bookings.js`) — retained for `REGISTERED_DOMAIN_ROUTE_COUNT === 30` in `server/routes.js`.
- **`public/build.json`** — Frozen v77 static JSON (`functions: 27, migrations: 10`), unreferenced at runtime.
- **`lib/catalog.js` (`CANONICAL_VENDORS`, `VENDORS_BY_ID`, `getCanonicalVendor`)** — Used only by local simulator `scripts/dev-server.cjs` (production imports only `BOOKING_PACKAGES`).
- **`lib/diagnostics.js#reportDomainRouteFailure`** — Exported with 0 callers (`server/app.js` uses `res.__bsDiagHook`).
- **Dead RLS GUC `app.worker_internal`** in `migrations/024:58,63` (`recordWorkerHeartbeat` sets `app.diagnostics_internal = 'true'`).
- **Unreferenced `public/app.js` Helpers, `LEGACY_DISH_NOTEBOOK_KEY` (`public/local-guides.js:6`), & `.pager-steps` CSS** — `cardOpenBadge(t)`, `extraCard(t)`, `window.__BITESHARK__.user` simulator branch, and `.pager-steps` in `public/pager.css`.
