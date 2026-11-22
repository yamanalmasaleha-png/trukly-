# Start Here — BiteShark Developer & Assistant Quickstart

Use this page as your **2-minute entry point** before changing code, SQL migrations, routes, stylesheets, feature controls, or configuration in `https://github.com/yamanalmasaleha-png/trukly-/`.

---

## 1. Default Routine Workflow (Keep It Simple)

### Before changing shared code (2 steps)
1. **Locate the connected symbol, contract, route, table, or flag**:
   ```bash
   npm run registry:locate -- <identifier|route|table|flag|CTR-ID>
   ```
2. **Read the actual source file and check its confirmed consumers & contracts** (shown directly in `locate` output and [generated/CONTRACTS-CATALOG.md](generated/CONTRACTS-CATALOG.md)).

### Before opening a PR or requesting review (4 steps)
1. **Regenerate reference inventories** *(never accepts drift debt automatically)*:
   ```bash
   npm run registry:docs
   ```
2. **Validate freshness, recursive JSON Schemas, contracts, links & structural drift**:
   ```bash
   npm run registry:validate
   ```
3. **Run the relevant tests** covering your modified contract/domain ([TESTING.md](TESTING.md) + `npm run test:registry`).
4. **Review structural & body change impact** against the target branch:
   ```bash
   npm run registry:compare -- --base origin/working/biteshark-vps --head WORKTREE --merge-base
   ```

> **When you do NOT need to edit maintained contract JSON/Markdown**:
> Ordinary cosmetic CSS/copy edits, internal function-body fixes that preserve existing inputs/outputs/permissions/tables, and test-only additions **do not** require editing [contracts/shared-contracts.json](contracts/shared-contracts.json) or domain prose — just run `npm run registry:docs && npm run registry:validate`.

### Occasional operations (only when needed)
- **Accept reviewed debt explicitly**: `npm run registry:accept-drift -- --finding <DRIFT:...> --reason "<why>" --ref "<issue/PR>"`
- **Prune resolved baseline debt**: `npm run registry:prune-drift`
- **Verify reconstructed SQL schema against disposable PostgreSQL**: `node tools/code-registry/cli.mjs validate --verify-db`
- **Export full commit-bound JSON snapshot**: `npm run registry:scan -- --out /tmp/registry.json --include-timestamp`

---

## 2. Task-Oriented Lookup Index ("I Need To...")

| Task | Read First | Canonical Implementation / Contract |
|---|---|---|
| **Check which branch or staging host I am targeting** | [BRANCH-AND-ENVIRONMENT-MAP.md](BRANCH-AND-ENVIRONMENT-MAP.md) | `working/biteshark-vps` (`staging.biteshark.live:4100`) vs isolated `staging2.biteshark.live:4102`; apex `biteshark.live` is a static holding page. |
| **Add or modify an HTTP endpoint** | [API-CONTRACTS.md](API-CONTRACTS.md), [contracts/shared-api-envelopes.md](contracts/shared-api-envelopes.md) | `server/admin-routes.js` or `server/customer-exploration-routes.js` (`{ ok: true, ... }`); keep `REGISTERED_DOMAIN_ROUTE_COUNT === 30` in `server/routes.js`. |
| **Write a database query, transaction, or RLS policy** | [DATA-MODEL.md](DATA-MODEL.md), [MIGRATIONS.md](MIGRATIONS.md) | `CTR-DB-TX-SESSION` (`lib/db-tx.js#withTransaction`), `SET LOCAL` / `set_config(..., true)`, additive immutable `migrations/NNN_*.sql`. |
| **Enforce Customer / Vendor / Mod / Top permissions** | [AUTH-AND-PERMISSIONS.md](AUTH-AND-PERMISSIONS.md) | `CTR-AUTHZ-RBAC-VENDOR` (`lib/authz.js#reverifyPlatformAdminInTx`, `reverifyModeratorInTx`, `reverifyVendorMembershipInTx`). |
| **Gate an optional feature or pause mutations** | [FEATURE-CONTROLS.md](FEATURE-CONTROLS.md) | `CTR-FEATURE-CONTROLS` (`lib/feature-controls.js` + `window.bitesharkFeatures`). |
| **Add or read a `BITESHARK_*` environment variable** | [CONFIGURATION.md](CONFIGURATION.md), [contracts/configuration-keys.json](contracts/configuration-keys.json) | `lib/env-compat.js#readEnvCompat` (never commit `.env` values or secrets). |
| **Modify discovery cards, modals, or CSS** | [FRONTEND-MAP.md](FRONTEND-MAP.md), [UI-AND-CONTENT-GUIDE.md](UI-AND-CONTENT-GUIDE.md), [ACCESSIBILITY.md](ACCESSIBILITY.md) | `CTR-DISCOVERY-CATALOG` (`public/app.js#cardHTML`, `public/color-calm.css`, `openModalDialog`). |
| **Work on Stories, Visit Journal, Private Photos, or Trails** | [domains/visits-and-passport.md](domains/visits-and-passport.md), [domains/photos.md](domains/photos.md) | `CTR-CUSTOMER-EXPLORATION` & `CTR-PRIVATE-PHOTO-STORAGE` (`lib/customer-exploration.js`, `lib/photo-storage.js`, `window.bitesharkExploration`). |
| **Record operational errors or link support tickets** | [DIAGNOSTICS-AND-ERRORS.md](DIAGNOSTICS-AND-ERRORS.md), [domains/support-and-feedback.md](domains/support-and-feedback.md) | `CTR-DIAGNOSTICS-PIPELINE` & `CTR-SUPPORT-TICKETS` (`lib/diagnostics.js`, `lib/support-tickets.js`, `fetchJsonBounded`). |
| **Build a release tarball or rehearse staging rollback** | [RELEASE-AND-ROLLBACK.md](RELEASE-AND-ROLLBACK.md) | `CTR-RELEASE-MIGRATION-DEPLOY` (`scripts/build-linux-release-tarball.cjs`, `deploy/install-staging-release.sh`). |

---

## 3. Evidence Labels Used Across Reports (`No False Certainty`)

- **Caller / Dependency States**:
  - `confirmed_static` — Resolved via lexical scope, explicit ESM/CJS import/alias, unique `window.*` namespace registration, or unique page-level script global.
  - `documented_wrapper` — Intentional `<script>` load-order decorator chain (`openDetail`, `applyFilters`).
  - `inferred_candidate` — Ambiguous multi-script global or unverified member call (useful lead; never treated as confirmed proof).
  - `dynamic_unresolved` — Callback parameter, shadowed variable, or computed property lookup (`obj[k]()`).
- **Test Reference Levels** *(never infer a passing test run from static source presence)*:
  - `maintained_contract_mapping` (`contract:`) — Explicit assertion mapping in [contracts/shared-contracts.json](contracts/shared-contracts.json).
  - `static_http_call` (`http:`) — Static HTTP request helper call in `tests/*.cjs` targeting the exact route path.
  - `candidate_string_mention` (`mention:`) — Route path string literal appears in test file (lead only).
