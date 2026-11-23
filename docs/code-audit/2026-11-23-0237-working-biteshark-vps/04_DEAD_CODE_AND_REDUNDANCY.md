# 04 — Dead Code, Orphaned Surfaces & Redundancy Report

- **Repository**: `https://github.com/yamanalmasaleha-png/trukly-.git` (`working/biteshark-vps` @ `f0e5e5deedc7636f448e1b0d629ceb1787d79944`)
- **Methodology**: Cross-referenced AST symbol exports/imports (`tools/code-registry/`), HTTP fetch call graphs, SQL table read/write statements across all 29 migrations and JS modules, `package.json` scripts, CI workflows, and indirect runtime consumers (`AGENTS.md` contract `REGISTERED_DOMAIN_ROUTE_COUNT === 30`).

> [!IMPORTANT]
> Per `AGENTS.md` Section 2.2 and Phase 2.2 of the audit specification, **zero items are marked safe to remove based on grep counts alone**. Enforced contract boundaries (such as `REGISTERED_DOMAIN_ROUTE_COUNT === 30` in `server/routes.js`) are explicitly separated under **Probably intentional / preserve**.

---

## 1. Safe-to-Remove Candidates (Confirmed Unused — Verify Listed Indirect Consumers First)

| Item | Location | Classification | Evidence of Non-Use | Pre-Removal Check Required | Related Finding / Task |
|---|---|---|---|---|---|
| `truckly-v63.zip` (`234,146` bytes) & `truckly-data.sql.gz` (`653` bytes) | Repository root | `confirmed_unused` (Historical Hatchable archive) | Excluded from release tarballs in `scripts/build-linux-release-tarball.cjs`; zero code, test, or CI references across all 361 tracked files. | None (`git rm` in dedicated cleanup PR). | [AUD-0043](03_COMPLETE_FINDINGS.md#aud-0043) / [REP-032](09_PRIORITIZED_REPAIR_PLAN.md#rep-032) |
| `public/build.json` (`212` bytes) & `'/build.json'` entry in `NO_CACHE_STATIC_FILES` | `public/build.json:1-8`, `server/app.js:123` | `confirmed_unused` (Obsolete v77 metadata) | Hardcodes `"base_release": 77, "functions": 27, "migrations": 10` (`2026-11-16`); zero `fetch('/build.json')` callers in `public/`, `server/`, or `deploy/`. | Run `npm run registry:locate -- build.json` and check `tests/listing-verification.cjs` + external uptime monitors before removal. | [AUD-0043](03_COMPLETE_FINDINGS.md#aud-0043) / [REP-032](09_PRIORITIZED_REPAIR_PLAN.md#rep-032) |
| `VENDOR_SUPPORT_CATEGORIES` export | `lib/support-tickets.js:21-27` | `confirmed_unused` (Orphaned export) | Exported array with `0` imports across `server/`, `lib/`, `public/`, `scripts/`, and `tests/` (`SUPPORT_ISSUE_CATEGORIES` is used instead). | Run `npm run registry:docs && npm run registry:validate` after removal so `SYMBOL-INDEX.md` updates cleanly. | [AUD-0043](03_COMPLETE_FINDINGS.md#aud-0043) / [REP-032](09_PRIORITIZED_REPAIR_PLAN.md#rep-032) |
| `EDITORIAL_STORIES_BY_ID` & `EDITORIAL_STORIES_BY_VENDOR_ID` exports | `lib/editorial-stories.js:148-154` | `confirmed_unused` (Orphaned lookup maps) | Zero importers across the repository (`listEditorialStories` iterates `EDITORIAL_STORIES` directly). | Regenerate `npm run registry:docs && npm run registry:validate`. | [AUD-0040](03_COMPLETE_FINDINGS.md#aud-0040), [AUD-0043](03_COMPLETE_FINDINGS.md#aud-0043) / [REP-032](09_PRIORITIZED_REPAIR_PLAN.md#rep-032) |
| `LEGACY_DISH_NOTEBOOK_KEY` constant | `public/local-guides.js:6` | `confirmed_unused` (Orphaned constant) | Declared at `public/local-guides.js:6` and never read (`public/exploration-client.js` owns legacy localStorage key migration). | Grep `public/` and `tests/` to confirm zero browser global reads. | [AUD-0040](03_COMPLETE_FINDINGS.md#aud-0040), [AUD-0043](03_COMPLETE_FINDINGS.md#aud-0043) / [REP-032](09_PRIORITIZED_REPAIR_PLAN.md#rep-032) |
| Redundant dynamic `await import('./photo-storage.js')` calls | `lib/customer-profile.js:1221, 2100, 4179` | `confirmed_unused` (Redundant dynamic import) | `lib/customer-profile.js:40-46` already statically imports `./photo-storage.js` at module top level. | Replace with top-level static imports (`unlinkPhotoDerivativesBestEffort`, etc.). | [AUD-0036](03_COMPLETE_FINDINGS.md#aud-0036) |

**Estimated Safe Cleanup Impact**: Removes `~235 KB` of tracked binary archives from Git checkouts, eliminates misleading `/build.json` public metadata, and trims dead symbol exports with near-zero regression risk.

---

## 2. Requires Verification or Product Decision (Dead Branches, Disconnected Routes, Orphaned Tables & Scripts)

### 2.1 Permanently Dead Runtime Code Branches (Bugs — Must Fix, Not Delete!)

| Dead / Unreachable Branch | Location | Why It Never Executes / Always Evaluates One Way | Required Action |
|---|---|---|---|
| Worker batch-failure alert & degraded heartbeat (`failedCount > 0 && sentCount === 0`) | `api/pager/worker.js:127, 148`, `scripts/run-pager-worker.cjs:146, 243` | Reads `out.failed` and `out.sent` (`undefined -> 0`), whereas `processPushOutboxBatch` returns `out.failed_permanent` and `out.delivered`. | **Fix bug** (`REP-017` / [AUD-0018](03_COMPLETE_FINDINGS.md#aud-0018)). |
| Style Guide completed-categories counter (`t.remaining === 0`) | `lib/style-guide-admin.js:568` | `summarizeByTopic` emits `unanswered` and `draft`, never `remaining` (`undefined === 0` is always `false`). | **Fix bug** (`REP-028` / [AUD-0031](03_COMPLETE_FINDINGS.md#aud-0031)). |
| Sandbox `/profile` buttons & CI `if (hasProfile)` test blocks | `lib/admin-test-customer.js:37-39`, `tests/admin-test-customer.integration.cjs:278, 285, 316, 340, 358` | Checks `fs.existsSync('public/profile.html')` (`false`), permanently hiding UI links and skipping 4 integration assertion blocks. | **Fix bug** (`REP-020` / [AUD-0021](03_COMPLETE_FINDINGS.md#aud-0021)). |
| `app.Ownership_summary` check in `/admin` application detail | `public/admin.js:685` | Capitalized typo (`Ownership_summary` does not exist on DTO; `ownership_statement` / `public_summary` exist). | **Fix bug** (`REP-027` / [AUD-0039](03_COMPLETE_FINDINGS.md#aud-0039)). |
| Parsed `--decisions` CLI argument | `tools/style-guide/cli.mjs:18-34` | CLI parses `--decisions <path>` into `args.decisions` but never passes it into `loadStyleGuideInputs(...)`. | **Wire flag** (`REP-032` / [AUD-0043](03_COMPLETE_FINDINGS.md#aud-0043)). |

### 2.2 Disconnected Database Structures, Endpoints & Scripts (Requires Product / Ops Verification)

| Surface | Location | Evidence | Classification & Recommendation |
|---|---|---|---|
| `admin_notification_outbox` SQL table | `migrations/018_admin_portal_onboarding_moderation_issues.sql:300-318`, `server/admin-routes.js:3544, 3614` | Written on onboarding decisions (`INSERT INTO admin_notification_outbox`), **zero `SELECT`, `UPDATE`, or `DELETE` statements** anywhere in the repo. | `requires_investigation` ([AUD-0035](03_COMPLETE_FINDINGS.md#aud-0035)): Decide whether to wire applicant notifications or stop inserting + prune rows (never drop table from immutable `018`). |
| `POST /api/me/shares/update-settings` & `window.bitesharkProfile.updateShareSettings` / `listShares` | `server/customer-profile-routes.js:454`, `public/profile-client.js:247, 272` | Tested in `tests/customer-profile-sharing.integration.cjs`, `0` UI callers in `public/*.js`. | `likely_unused` in UI ([AUD-0015](03_COMPLETE_FINDINGS.md#aud-0015), [AUD-0028](03_COMPLETE_FINDINGS.md#aud-0028)): **Do not delete** — wire `listShares()` into hidden-profile privacy fallback (`REP-014`) and `updateShareSettings()` into Greatest Hits share cards (`REP-025`). |
| `POST /api/admin/invitations/resend` & `POST /api/admin/style-guide/reset` | `server/admin-routes.js:156, 179, 4917, 8312`, `lib/style-guide-admin.js:1220` | Exposed governance HTTP endpoints with `0` frontend callers and `0` integration tests (`/reset` also skips `validateStyleGuideData`). | `requires_investigation` ([AUD-0031](03_COMPLETE_FINDINGS.md#aud-0031), [AUD-0035](03_COMPLETE_FINDINGS.md#aud-0035)): Validate `/reset` + add integration tests (`REP-025`, `REP-028`), and confirm with team whether UI buttons should be exposed. |
| `communityLoadModerationQueue` & `communityModerate` | `public/community.js:283-315` | Calls legacy `/api/community/moderate`, superseded by `/admin` Moderation tab (`/api/admin/moderation/decision`); unreachable in normal customer UI. | `likely_unused` ([AUD-0035](03_COMPLETE_FINDINGS.md#aud-0035)): Verify no browser test invokes `communityModerate` before removing from `public/community.js`. |
| `tests/staging-http-gates.cjs` (`912` lines) | `tests/staging-http-gates.cjs` | Zero references in `package.json`, `.github/workflows/truckly-source-review.yml`, `deploy/`, or `docs/engineering/TESTING.md` (`tests/vps-staging-gates.cjs` replaced it). | `likely_unused` ([AUD-0042](03_COMPLETE_FINDINGS.md#aud-0042)): Confirm no local operator alias invokes it, then archive under `docs/archive/` or remove (`REP-031`). |
| `scripts/dev-server.cjs` (`npm run dev:mock`) | `scripts/dev-server.cjs`, `package.json:7` | Pre-Migration-017 mock server missing OTP auth, `/api/account/context`, `/api/features`, `/api/me/*`, and `/api/admin/*`. | `requires_investigation` ([AUD-0041](03_COMPLETE_FINDINGS.md#aud-0041)): Retain for offline static-catalog CSS checks only with an explicit startup warning (`REP-031`), or retire if unused. |

---

## 3. Duplicate & Redundant Implementations

| Duplicate Pattern | Locations | Behavioral Compatibility & Consolidation Guidance |
|---|---|---|
| `sha256Hex(input)` (`5` copies) | `lib/admin-governance.js:24`, `lib/admin-test-customer.js:33`, `lib/style-guide-admin.js:46`, `lib/standalone-auth.js:78`, `lib/pager-notifications.js:52` | **100% compatible** (`crypto.createHash('sha256').update(String(v)).digest('hex')`). Consolidate into `lib/admin-governance.js` (or tiny `lib/crypto-hash.js`) in `REP-030`. |
| `maskEmail(email)` (`2` copies) | `server/admin-routes.js:192`, `scripts/manage-feature-controls.cjs:53` | **Compatible**; consolidate into `lib/admin-governance.js` so masking rules never diverge (`REP-030`). |
| `appendSetCookie` vs `appendRawCookie` (`2` copies) | `server/app.js:254`, `server/admin-routes.js:8233` | **Compatible** multi-header `Set-Cookie` array appender; export once from `server/app.js` or shared HTTP utility (`REP-030`). |
| Editorial Stories registry (`2` drifted copies) | `lib/editorial-stories.js:10-146` vs `public/exploration-client.js:15-166` | **Drifted** (`story_mitote_food_park` clue text/icon differ, client hardcodes `business_available: true`). Align copy and drive `#discoverStoriesStrip` from `/api/stories` + active `trucks` (`REP-030` / [AUD-0040](03_COMPLETE_FINDINGS.md#aud-0040)). |
| Sonoma County town allowlists (`2` diverging lists) | `lib/customer-profile.js:67-84` (`SUPPORTED_SONOMA_TOWNS`) vs `lib/customer-exploration.js:109-128` (`CANONICAL_TOWNS_MAP`) | **Incompatible today** (`Graton` vs `Geyserville`/`Penngrove`). Unify into one shared Sonoma County town list (`REP-030` / [AUD-0040](03_COMPLETE_FINDINGS.md#aud-0040)). |
| HTML escaping helpers (`11` frontend copies) | `esc` / `rxEsc` / `pagerEscape` / `communityEscape` / `smartEscape` / `cpEsc` / `ghEsc` across `public/*.js` | **Preserve or consolidate cautiously**: Each classic `<script>` is self-contained; consolidating requires loading a shared `public/dom-safe.js` first in `public/index.html`, `admin.html`, and `login.html`. Low urgency because all 11 implementations escape `&`, `<`, `>`, `"`, and `'`. |

---

## 4. Probably Intentional / Preserve (Do NOT Delete Without Explicit Contract Authorization)

1. **Six Superseded Domain Routes in `server/routes.js` (`/api/trucks/list`, `/api/trucks/detail`, `/api/trucks/nearby`, `/api/pager/list`, `/api/community/moderate`, `/api/vendor/bookings`)**:
   - **Why Preserve**: Explicitly protected by `REGISTERED_DOMAIN_ROUTE_COUNT === 30` (`AGENTS.md` Section 2.2, `tests/backend-hardening.integration.cjs`, `docs/engineering/contracts/shared-contracts.json`) and exercised by backend contract tests. Do **not** delete unless Matt & Yaman authorize a coordinated contract version bump.
2. **Deferred Feature Control `public_profile_discovery` (`lib/feature-controls.js:466-470`, `migrations/029:36-39`)**:
   - **Why Preserve**: Intentionally locked to `hidden` and backed by SQL `CHECK (visibility_mode = 'private' AND allow_public_indexing = false)` as an explicit privacy guardrail (`tests/customer-profile-sharing.integration.cjs`).
3. **Unanswered Entries in `docs/engineering/style-guide/decisions.json` (`103` items)**:
   - **Why Preserve**: Intentionally unfinished team design questionnaire managed via `/admin#style-guide` (`AGENTS.md` Section 1.3).
4. **Archived Historical Docs in `docs/archive/hatchable/`**:
   - **Why Preserve**: Clearly labeled historical transition documentation (`README.md:62`).
5. **Vendored Parser in `tools/code-registry/vendor/acorn/`**:
   - **Why Preserve**: Intentionally vendored so `npm run registry:validate` runs with zero devDependencies on fresh checkouts and CI jobs prior to `npm ci`.
