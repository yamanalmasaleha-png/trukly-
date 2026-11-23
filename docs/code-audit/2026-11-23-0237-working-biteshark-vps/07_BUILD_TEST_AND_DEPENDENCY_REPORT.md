# 07 — Build, Test & Dependency Report

- **Repository**: `https://github.com/yamanalmasaleha-png/trukly-.git` (`working/biteshark-vps` @ `f0e5e5deedc7636f448e1b0d629ceb1787d79944`)
- **Execution Environment**: Windows local developer workstation (`Node.js v24.19.0`), executed non-destructively against detached read-only worktree `C:\Users\Matt C\Truckly___\trukly-audit` (and `npm.cmd ls` / `npm.cmd audit` against `c:\Users\Matt C\Truckly___\trukly-` `node_modules`).
- **Coverage Metrics Note**: No line/branch coverage instrumentation (`c8`/`nyc`) is configured in `package.json`, and PostgreSQL/Playwright suites were not run locally in this audit session; per Phase 7, **no coverage percentages are invented**.

---

## 1. Exact Commands Executed & Results

| Category | Exact Command Executed | Exit Code | Result & Observed Output |
|---|---|---:|---|
| **JS/ESM/CJS Syntax Check** | `node --check` across all `148` first-party `.js`/`.cjs`/`.mjs` files | `0` | **PASS** — `0` syntax or parse errors across `server/`, `api/`, `lib/`, `packages/`, `public/`, `scripts/`, `tools/`, and `tests/`. |
| **Dependency Tree Integrity** | `npm.cmd ls --omit=dev --depth=0` | `0` | **PASS** — `@biteshark/runtime-adapter@1.0.0 -> .\packages\runtime-adapter`, `cookie@1.1.1`, `otplib@13.6.0`, `pg@8.23.1`, `sharp@0.35.5` (zero missing/extraneous production dependencies). |
| **Vulnerability Advisory Audit** | `npm.cmd audit --omit=dev --json` | `0` | **PASS** — `0` vulnerabilities reported across `30` production packages (`58` total lockfile packages). *(Evaluated against npm registry advisory database at audit time.)* |
| **Code & Schema Registry Validation** | `node tools/code-registry/cli.mjs validate` | `0` | **PASS** — `ok: true`, `failures: []`, `12` baseline drift items matching `drift-baseline.json`. |
| **Style Guide Schema & Output Validation** | `node tools/style-guide/cli.mjs validate` | `0` | **PASS** — `ok: true`, `failures: []` across all `103` decisions and `18` generated Markdown documents. |
| **Unit Suite: Code Registry** | `node tests/code-registry.test.cjs` | `0` | **PASS** (`10/10` subtests). |
| **Unit Suite: Style Guide Engine** | `node tests/style-guide.test.cjs` | `0` | **PASS** (`9/9` subtests). |
| **Unit Suite: Pickup Pager Demo** | `node tests/pager-demo.test.cjs` | `0` | **PASS**. |
| **Unit Suite: Listing Verification** | `node tests/listing-verification.cjs` | `0` | **PASS** (Sonoma County catalog & schema verification). |
| **Unit Suite: Map & SW Cache Resilience** | `node tests/map-resilience.test.cjs` | `0` | **PASS** (`map provider allowlist, HTTPS & zoom bounds, secret-key rejection, fail-safe config, feature-control integration, and service-worker cache hygiene`). |
| **Contract Suite: VPS Platform** | `node tests/vps-platform-contract.test.cjs` | `0` | **PASS**. |
| **Security Suite: Staging2 Controller** | `node tests/staging2-ctl-security.test.cjs` | `0` | **PASS**. |
| **Installer Integration Check** | `node tests/install-staging-release.test.cjs` | `1` | **BLOCKED BY ENV** — `Error: Set DATABASE_URL or provide @embedded-postgres binaries` (requires Linux bash + PostgreSQL 16 service, as configured in `.github/workflows/truckly-source-review.yml`). |

---

## 2. Blocked / Unexecuted Test Suites & Reasons

Out of **`41` test files** (`39,814` lines) in `tests/`:

- **`7` DB-free unit/contract suites** were **executed and passed (`exit 0`)** above.
- **`1` Linux/PostgreSQL release-installer test** (`tests/install-staging-release.test.cjs`) was attempted and exited `1` due to missing local `DATABASE_URL` / `@embedded-postgres`.
- **`17` PostgreSQL 16 integration suites** (`*.integration.cjs` + `vps-staging-gates.cjs`) and **`15` headless Chromium E2E suites** (`*-browser.e2e.cjs`) were **not executed locally** because this Windows workstation has no local PostgreSQL 16 cluster (`DATABASE_URL` / `MIGRATION_DATABASE_URL`) configured and the audit operated under strict non-intrusive read-only rules (no live staging server mutations). All `32` of these suites are wired into `.github/workflows/truckly-source-review.yml` on `ubuntu-latest` (`postgres:16` service container + Playwright Chromium).
- **`1` orphaned gate script** (`tests/staging-http-gates.cjs`, `912` lines) is **unreferenced** in `package.json`, CI, and `docs/engineering/TESTING.md` ([AUD-0042](03_COMPLETE_FINDINGS.md#aud-0042)).

---

## 3. Dependency & Build Configuration Findings

1. **Minimal, Clean Production Dependency Footprint**:
   - Direct `dependencies` in `package.json`: `@biteshark/runtime-adapter` (`file:packages/runtime-adapter`), `cookie` (`^1.1.1`), `otplib` (`^13.6.0`), `pg` (`^8.23.1`), `sharp` (`^0.35.5`).
   - Direct `devDependencies`: `playwright` (`^1.56.1`) — used strictly in `tests/*-browser.e2e.cjs` (`--omit=dev` cleanly excludes it from Linux release tarballs).
   - **Check on `otplib`**: Verify whether `otplib` is actively imported by runtime modules (`lib/standalone-auth.js` implements 6-digit email OTP via `node:crypto` HMAC-SHA-256!). Wait: our dependency scan confirmed `otplib` has `0` imports across `server/`, `api/`, `lib/`, and `scripts/`—keep documented as a low-priority verification item before removing from `package.json` in case TOTP 2FA for `Admin: Top` is planned.
2. **Native Binary Caution (`sharp` & `--ignore-scripts`)**:
   - `.github/workflows/truckly-source-review.yml:396` and `deploy/install-staging-release.sh` run `npm ci --omit=dev --ignore-scripts`. Modern `sharp@0.35.5` resolves prebuilt `@img/sharp-linux-x64` optional packages via `package-lock.json` without postinstall scripts on `x86_64` Linux, **provided `package-lock.json` is generated with optional platform dependencies intact** (never regenerate `package-lock.json` with `--omit=optional` on Windows!).
3. **Release Tarball Manifest Drift ([AUD-0037](03_COMPLETE_FINDINGS.md#aud-0037))**:
   - `scripts/build-linux-release-tarball.cjs:77-138` hardcodes `requiredEntry` checks stopping at `migrations/028_exploration_photo_reconciliation.sql`, omitting `migrations/029` and Customer Profile modules (`REP-019`).
4. **No Linter or TypeScript Checker Configured**:
   - Neither `eslint` nor `tsc` (`checkJs`) is configured; static verification relies on `node --check` and `tools/code-registry/cli.mjs validate` (which itself missed 5 `CREATE INDEX` statements without whitespace before `(` — [AUD-0041](03_COMPLETE_FINDINGS.md#aud-0041)).

---

## 4. Test Quality, CI Gate & Coverage Gaps Identified

1. **CRITICAL CI False-Green Vector on `push` Events ([AUD-0020](03_COMPLETE_FINDINGS.md#aud-0020))**:
   - `.github/workflows/truckly-source-review.yml:195-206` sets `BASE_REF="$PUSH_BEFORE"` on `push` events and excludes `.github/workflows` and `package.json` from `RUNTIME_DIFF`. Pushing a second commit touching only `docs/` after a failing code commit causes `postgres-backend-hardening` to skip all 33 PostgreSQL/browser suites and report green.
2. **Silently Skipped Sandbox Profile Assertions in CI ([AUD-0021](03_COMPLETE_FINDINGS.md#aud-0021))**:
   - `tests/admin-test-customer.integration.cjs:278` sets `const hasProfile = fs.existsSync(path.join(ROOT, 'public', 'profile.html'));` (`false`), silently skipping 4 critical assertion blocks (`visits`, `collections`, `/api/me/profile`, and real-customer visit preservation on sandbox reset) on every CI run, while lines `5-6` carry stale header claims ([AUD-0042](03_COMPLETE_FINDINGS.md#aud-0042)).
3. **19 of 41 Suites Missing `package.json` Scripts ([AUD-0042](03_COMPLETE_FINDINGS.md#aud-0042))**:
   - `npm test` runs only `pager-demo.test.cjs` + `listing-verification.cjs`, and 19 suites (including `urgent-pilot-security.integration.cjs`, `feature-controls.integration.cjs`, `diagnostics-and-reliability.integration.cjs`, `invitation-workflow.integration.cjs`, `support-feedback.integration.cjs`, and `customer-exploration.integration.cjs`) have no `npm run` script.

---

## 5. Recommended New Regression Tests (Mapped to Repair Plan)

1. **`tests/style-guide-admin.integration.cjs` (`REP-001`, `REP-028`)**: Assert `Admin: Mod` receives `403` on `"status": "approved "`, omitted `status` on an `approved` item, and `approved -> draft` downgrade; assert concurrent `save` during in-flight `push` survives; assert `categories_completed === 1` when a topic has 0 unanswered/draft items; assert `/reset` validates `ref:DEC-*` integrity.
2. **`tests/admin-test-customer.integration.cjs` (`REP-002`, `REP-020`)**: Assert `POST /api/admin/accounts/role` rejects `usr_sa_top_admin_test_customer` (`400`), `GET /api/admin/test-customer` performs 0 writes, `has_profile_page === true`, and all previously skipped `visits`/`collections`/`/api/me/profile` isolation checks execute unconditionally.
3. **`tests/feature-controls.integration.cjs` (`REP-003`, `REP-009`)**: Assert an unknown forward-migration `feature_key` row does not disable `hidden`/`staff_beta` gates; assert `stateUntrusted === true` fails closed on `/s/<token>` and `/api/me/profile`; assert `BITESHARK_PAUSE_WRITES=all` blocks `POST /api/me/photos` (`503`) while allowing `POST /api/me/shares/revoke` (`200`).
4. **`tests/customer-profile-sharing.integration.cjs` & `tests/customer-profile-browser.e2e.cjs` (`REP-005`, `REP-006`, `REP-007`, `REP-014`, `REP-016`, `REP-024`, `REP-029`)**: Assert `suppress_attachment` blocks re-attaching the same `source_photo_id`, `collections/update` blocks `suppressed_content_sha256`, `< 14` DOB on `/api/me/sharing-eligibility` locks `ineligible_under_18`, hidden `customer_profile` fallback UI renders `listShares()` revoke buttons, mid-tx session revocation returns `401` (not `500`), soft-deleted `idempotency_key` reuse returns `201`, and `GET /api/me/profile` checks out `1` DB connection.
5. **`tests/diagnostics-and-reliability.integration.cjs` & `tests/pager-notifications.integration.cjs` (`REP-010`, `REP-015`, `REP-017`)**: Assert 200 untrusted browser diagnostic groups cannot evict `server_verified` groups; assert `auth_secret=`/`unsubscribe_token=`/`__Host-bs_admin_test_session=` are redacted; assert permanent push batch failure records `PUSH_DELIVERY_BATCH_FAILURE` + `worker_status = "degraded"`; assert `BITESHARK_PUSH_PROVIDER_MODE=disabled` still runs `purgeExpiredNotificationRecords`.
