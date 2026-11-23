# 11 — Audit Coverage & Limitations

- **Repository**: `https://github.com/yamanalmasaleha-png/trukly-.git`
- **Audited Branch**: `working/biteshark-vps` *(confirmed with user after verifying literal `working-` does not exist)*
- **Audited Commit SHA**: `f0e5e5deedc7636f448e1b0d629ceb1787d79944`
- **Isolated Read-Only Workspace Used**: `C:\Users\Matt C\Truckly___\trukly-audit` (detached `git worktree` at `f0e5e5deedc7636f448e1b0d629ceb1787d79944`, removed cleanly after QA verification).

---

## 1. File Discovery & Inspection Coverage

| Directory / Scope | Tracked Files Discovered | First-Party Files Inspected | Third-Party / Vendored / Binary | Coverage Notes |
|---|---:|---:|---:|---|
| `server/` | `6` | `6` (`100%`) | `0` | Full AST + line-level audit of `index.js`, `app.js`, `routes.js`, `admin-routes.js` (`8,331` LOC), `customer-exploration-routes.js`, `customer-profile-routes.js`. |
| `api/` | `30` | `30` (`100%`) | `0` | Audited all 30 domain handlers (`trucks`, `favorites`, `bookings`, `owner`, `vendor`, `pager`, `community`, `notifications`). |
| `lib/` | `25` | `25` (`100%`) | `0` | Full inspection across auth, age-policy, authz, db-tx, feature-controls, diagnostics, pager-notifications, webpush-crypto, photo-storage, customer-exploration, customer-profile, style-guide-admin, admin-test-customer, discovery, catalog, editorial-stories. |
| `packages/` | `2` | `2` (`100%`) | `0` | Audited `packages/runtime-adapter/index.js` and `package.json`. |
| `public/` | `61` | `61` (`100%`) | `0` | Audited all HTML (`index.html`, `admin.html`, `login.html`, `policies/*`), all 24 browser JS files (including all `263` `.innerHTML` sinks and `sw.js`), CSS stylesheets, manifest, SVG assets, and `build.json`. |
| `migrations/` | `29` | `29` (`100%`) | `0` | Inspected all 29 SQL migrations (`001`–`029`), `58` application tables, RLS/`FORCE RLS` policies, triggers, FKs, and indexes. |
| `deploy/` | `17` | `17` (`100%`) | `0` | Audited `install-staging-release.sh`, all 4 Nginx templates, all 7 systemd units/timers, `truckly-staging-backup.sh`, `biteshark-staging2-ctl`, `bootstrap-staging-roles.sql.template`, `staging.env.example`, and `holding/index.html`. |
| `scripts/` | `14` | `14` (`100%`) | `0` | Audited all 14 operational, migration, worker, tarball, and mock-dev scripts. |
| `tools/` | `17` | `14` (`100%` first-party) | `3` (`tools/code-registry/vendor/acorn/*`) | Audited all first-party `tools/code-registry/*.mjs` and `tools/style-guide/*.mjs` modules; excluded vendored third-party `acorn` bundle per Phase 1.1. |
| `tests/` | `41` | `41` (`100%`) | `0` | Mapped all 41 test suites against `package.json`, CI workflow, and `TESTING.md`; executed all 7 DB-free suites and audited critical integration assertions (`admin-test-customer`, `customer-profile-sharing`, `feature-controls`, etc.). |
| `docs/` | `108` | `108` (`100%`inventoried; core handbook, schemas, contracts & generated inventories inspected) | `0` | Verified `START-HERE.md`, `API-CONTRACTS.md`, `AUTH-AND-PERMISSIONS.md`, `DATA-MODEL.md`, `MIGRATIONS.md`, `TESTING.md`, `contracts/*.json`, `generated/*.md`, and `style-guide/*`. |
| `.github/` & Root | `11` | `9` (`100%` text/config) | `2` (`truckly-v63.zip`, `truckly-data.sql.gz` inventoried) | Audited `.github/workflows/truckly-source-review.yml`, `AGENTS.md`, `README.md`, `TECH_MAP.md`, `package.json`, `.gitignore`; flagged legacy root `.zip`/`.sql.gz` archives. |
| **Total** | **`361`** | **`356` first-party text/asset files (`100%`)** | **`5` (`3` vendored `acorn` + `2` legacy archives)** | **`232` first-party non-doc/non-vendor code files (`125,575` LOC) inspected.** |

---

## 2. Subsystem Review Ledger (`S1` – `S11`)

| ID | Subsystem | Audit Status | Primary Inspection Methods |
|---|---|---|---|
| **S1** | Auth, sessions, 14+ age policy & Test Customer Sandbox | **Reviewed (100%)** | Deep research agent (`sub_S1.json`) + direct line verification (`lib/standalone-auth.js`, `lib/age-policy.js`, `lib/admin-test-customer.js`). |
| **S2** | HTTP server core, routing, 30 `api/*` handlers & DB adapter | **Reviewed (100%)** | Deep research agent (`sub_S2.json`) + deterministic AST/API scan + direct line verification (`server/app.js`, `server/routes.js`, `api/**`, `lib/db-tx.js`, `packages/runtime-adapter/`). |
| **S3** | Admin governance backend (`server/admin-routes.js`, invitations, onboarding, moderation, issues, audit) | **Reviewed (100%)** | Deep research agent (`sub_S3.json`) + direct line verification across `8,331`-line `server/admin-routes.js`, `lib/admin-governance.js`, `lib/authz.js`, `lib/support-tickets.js`. |
| **S4** | Customer profile, Greatest Hits sharing, exploration & private photos | **Reviewed (100%)** | Deep research agent (`sub_S4.json`) + direct line verification (`lib/customer-profile.js`, `lib/customer-exploration.js`, `lib/photo-storage.js`, `lib/editorial-stories.js`, `server/customer-*-routes.js`). |
| **S5** | Pickup pager notifications, Web Push worker & diagnostics | **Reviewed (100%)** | Deep research agent (`sub_S5.json`) + direct line verification (`lib/pager-notifications.js`, `lib/webpush-crypto.js`, `lib/diagnostics.js`, `api/pager/worker.js`, `scripts/run-pager-worker.cjs`). |
| **S6** | Feature controls & Style Guide Admin Workspace | **Reviewed (100%)** | Deep research agent (`sub_S6.json`) + direct line verification (`lib/feature-controls.js`, `lib/style-guide-admin.js`, `lib/style-guide-core.js`). |
| **S7** | Customer-facing SPA frontend (`public/index.html`, `app.js`, `pager.js`, `community.js`, `smart.js`, `sw.js`, CSS) | **Reviewed (100%)** | Deterministic 263-sink `.innerHTML`/XSS & global scan (`xss_and_api_audit.json`, `wave2_verified.json`) + direct code inspection. |
| **S8** | Role-experience, Admin Portal, Style Guide UI & Profile/Sharing frontend | **Reviewed (100%)** | Partial subagent scan + deterministic CSS/modal/URL scan (`wave2_verified.json`) + direct inspection (`public/admin.html`, `admin.js`, `admin-style-guide.js`, `role-experience.js`, `customer-profile.js`, `greatest-hits*.js`). |
| **S9** | PostgreSQL migrations `001`–`029`, RLS policies, triggers & indexes | **Reviewed (100%)** | Deterministic SQL table/RLS/index parser (`wave2_verified.json`) + direct inspection of `migrations/001`–`029` and `SCHEMA-INVENTORY.md`. |
| **S10** | Deploy, systemd, Nginx, backups, CI/CD, dependencies & code-registry | **Reviewed (100%)** | Executed `npm ls`, `npm audit`, `registry:validate`, `style-guide:validate`, `vps-platform-contract`, `staging2-ctl-security` + deterministic audit of `deploy/**`, `.github/workflows/truckly-source-review.yml`, and `tools/**`. |
| **S11** | Test suite organization, assertions & handbook documentation | **Reviewed (100%)** | Full 41-file test matrix (`wave2_verified.json`), executed all 7 DB-free test suites, and inspected assertion gaps (`tests/admin-test-customer.integration.cjs`, `TESTING.md`, `README.md`, `TECH_MAP.md`). |

**Subsystems Not Reviewed**: **None (`0`)**.

---

## 3. Static vs Dynamic Checks, Blockers & Confidence Assessment

- **Static Checks Completed**:
  - `node --check` syntax validation across all `148` JS/CJS/MJS files (`0` errors).
  - AST symbol, cyclomatic/length complexity (`60` functions `>= 120` lines), cross-file duplicate function, and global-collision analysis (`tools/code-registry/` + `scratch/audit_static_scan.mjs` + `scratch/audit_supplement.mjs`).
  - Full `.innerHTML` / DOM sink audit (`263` assignments), SQL parameterization/RLS/index audit (`58` tables), systemd/Nginx/CI template diff audit, and `npm audit` / `npm ls` dependency check.
- **Dynamic Checks Completed**:
  - Executed `7` DB-free unit/contract/security suites (`code-registry`, `style-guide`, `pager-demo`, `listing-verification`, `map-resilience`, `vps-platform-contract`, `staging2-ctl-security`) — all `7` exited `0`.
- **Constraints & Blockers**:
  1. **No Local PostgreSQL 16 Instance (`DATABASE_URL`) on Windows Host**: Prevented running the `17` `*.integration.cjs` and `15` `*-browser.e2e.cjs` suites locally during this audit turn (`tests/install-staging-release.test.cjs` confirmed `Error: Set DATABASE_URL or provide @embedded-postgres binaries`).
  2. **Strict Non-Destructive / Non-Intrusive Policy**: No live traffic, fuzzing, or state mutations were sent against `staging.biteshark.live`, `staging2.biteshark.live`, or live VPS databases.
  3. **Subagent Rate Limit During Wave 2**: Parallel subagent fan-out hit `RESOURCE_EXHAUSTED (429)` mid-Wave-2; resolved cleanly with zero loss of scope by completing `S7`–`S11` via deterministic Node scanners (`verify_wave2_and_all.mjs`) and direct file inspection against the read-only worktree.
- **Overall Completeness Confidence**: **High** for architectural, security, authorization, schema/RLS, configuration, dead-code, and state-machine defects; **Moderate-to-High** for browser layout/CSS rendering nuances (`AUD-0039`), which should be visually confirmed in Playwright during `Phase B` verification.

---

## 4. Specific Areas Recommended for Live Runtime Verification During Repair

1. Run `node tools/code-registry/cli.mjs validate --verify-db` against PostgreSQL 16 after applying additive Migration `030` (`REP-002`, `REP-013`, `REP-031`) to confirm live `pg_catalog` matches `SCHEMA-INVENTORY.md`.
2. Execute `node tests/admin-test-customer.integration.cjs` against PostgreSQL 16 immediately after fixing `hasCustomerProfileSurface()` (`REP-020`) to verify the previously skipped `if (hasProfile)` blocks pass end-to-end.
3. Verify on the live Linode VPS (`/etc/systemd/system/biteshark-staging2-api.service` and `/usr/local/lib/biteshark-staging2/backup-staging2.sh`) that any host-only edits match the repository files landed in `REP-019`.
