# 10 — AI Coding Agent Implementation Handoff Guide

- **Repository**: `https://github.com/yamanalmasaleha-png/trukly-.git`
- **Target Branch**: `working/biteshark-vps`
- **Audited Base Commit**: `f0e5e5deedc7636f448e1b0d629ceb1787d79944`
- **Master Task Queue**: [09_PRIORITIZED_REPAIR_PLAN.md](09_PRIORITIZED_REPAIR_PLAN.md) & [repair_tasks.json](repair_tasks.json) (`REP-001` through `REP-032`)
- **Complete Evidence Register**: [03_COMPLETE_FINDINGS.md](03_COMPLETE_FINDINGS.md) & [findings.json](findings.json) (`AUD-0001` through `AUD-0044`)

---

## 1. Reusable Repair-Agent Prompt

Copy and paste the following prompt when instructing an AI coding agent to execute repairs from this audit:

> "You are working in `https://github.com/yamanalmasaleha-png/trukly-.git` on branch `working/biteshark-vps`. First read `AGENTS.md`, `docs/engineering/START-HERE.md`, and `docs/code-audit/2026-11-23-0237-working-biteshark-vps/10_AGENT_HANDOFF.md`. Select the highest-priority uncompleted repair task in `docs/code-audit/2026-11-23-0237-working-biteshark-vps/repair_tasks.json` (or the specific `REP-XXX` batch authorized by the user), inspect the associated audit evidence in `03_COMPLETE_FINDINGS.md` and the live target files (`npm run registry:locate -- <symbol>`), implement the smallest safe root-cause change, add or update regression tests, run `npm run registry:docs && npm run registry:validate && npm run test:registry` plus the task's verification commands, and record the exact exit codes and outcome in `repair_tasks.json`. Do not proceed with unrelated repairs, schema rewrites, or destructive actions without authorization."

---

## 2. Critical BiteShark Invariants & Non-Negotiable Constraints

Before touching any file in this repository, enforce every rule below (`AGENTS.md`):

1. **Immutable Additive SQL Migrations (`migrations/001`–`029`)**:
   - **NEVER edit, rename, reorder, or reformat an existing SQL migration file (`001`–`029`).** `scripts/run-migrations.cjs` verifies SHA-256 checksums against `schema_migrations` and aborts deployment on any byte mismatch.
   - All schema/trigger/RLS fixes (`REP-002`, `REP-013`) must be authored as a new additive migration (`migrations/030_*.sql`), coordinating sequence numbers across active branches (`working/biteshark-vps`, `testing/yaman-staging2`, `antigravity/staging2-latest`).
2. **Enforced Domain Route Count (`REGISTERED_DOMAIN_ROUTE_COUNT === 30`)**:
   - **NEVER delete or rename any of the 30 `api/*.js` handlers or entries in `server/routes.js`** without explicit user authorization and coordinated updates to `shared-contracts.json`, `drift-baseline.json`, and `tests/backend-hardening.integration.cjs`.
3. **Dual HTTP Envelope Preservation (`docs/engineering/API-CONTRACTS.md`)**:
   - `api/*.js` routes return bare payloads (`200 [...]` or `{ error }`), whereas `server/admin-routes.js`, `customer-exploration-routes.js`, and `customer-profile-routes.js` return `{ ok: true, ... }` / `{ ok: false, error, code, correlation_id }`. Never change an endpoint's success/error envelope shape casually.
4. **Single-Client `pg` Transaction Discipline (`lib/db-tx.js`)**:
   - When passing an active transaction handle `tx` (`PoolClient`) to multiple helpers (e.g., `REP-029` inside `getPrivateOwnerProfile`), **ALWAYS `await` queries sequentially—NEVER use `Promise.all` on a single `pg.Client`!**
5. **Frontend `<script>` Load-Order Globals (`public/index.html`)**:
   - `public/index.html` loads 18 classic scripts in a strict dependency/wrapper order (`openDetail`, `applyFilters`, `bitesharkExploration`, `bitesharkProfile`). Do **not** reorder `<script>` tags without checking `docs/engineering/FRONTEND-MAP.md` and running `npm run registry:validate`.
6. **Intentionally Unfinished Style Guide (`docs/engineering/style-guide/decisions.json`)**:
   - **NEVER invent design decisions or populate blank/unanswered items in `decisions.json`.** Only record explicit team answers and run `npm run style-guide:generate && npm run style-guide:validate`.
7. **Registry Regeneration Rule**:
   - Whenever exports, routes, DOM IDs, config keys, or SQL migrations change, run:
     ```bash
     npm run registry:docs
     npm run registry:validate
     npm run test:registry
     ```
   - **Never** edit `docs/engineering/schemas/drift-baseline.json` or `tools/code-registry/suppressions.json` to hide a newly introduced violation.
8. **Git Commit Identity & Environment Isolation**:
   - Verify `git config user.name` and `git config user.email` before committing (`AGENTS.md` Section 2.2).
   - Never touch `https://biteshark.live` apex holding page (`deploy/holding/index.html`) or commit `.env` / secret values.

---

## 3. Files Requiring Extra Caution & Review

| File | Lines | Why Extra Caution Is Required |
|---|---:|---|
| `migrations/001`–`029` | `4,468` | **Read-only / immutable** — SHA-256 checksum verified on staging/production databases. |
| `server/routes.js` | `131` | Enforces `REGISTERED_DOMAIN_ROUTE_COUNT === 30` contract. |
| `server/app.js` | `1,490` | Central security choke point (CSRF, body limits, `__Host-` cookies, test-customer overlay, 14+ age gate, static path confinement). |
| `lib/db-tx.js` & `packages/runtime-adapter/index.js` | `383` | Core `FOR SHARE` session/user lock order (`auth_users -> auth_sessions`) and transaction-local `app.*` RLS GUC lifecycle; changing lock order risks deadlocks. |
| `lib/feature-controls.js` | `2,024` | Evaluated on nearly every request; changes to `stateUntrusted` (`REP-003`) must keep core `/api/trucks` resilient while failing closed on gated/sharing routes. |
| `server/admin-routes.js` | `8,331` | Contains 52+ governance endpoints; fix targeted security/workflow bugs (`REP-008`, `REP-009`, `REP-016`, `REP-026`, `REP-029`) *before* attempting structural modularization (`REP-030`). |
| `docs/engineering/style-guide/decisions.json` | `2,400+` | Team-owned design decisions; never populate unanswered tokens automatically. |

---

## 4. Recommended Execution & PR Batching Strategy

Execute repairs in **6 small, independently verifiable batches** rather than one giant branch:

1. **Batch 1 — Critical Security & Kill-Switch Stabilization (No Schema Changes)**:
   - Tasks: `REP-001` (Style Guide Mod->Top fix + file lock), `REP-003` (`feature_controls` fail-closed fix), `REP-004` + `REP-009` (`VALID_PAUSE_SCOPES`, `PAUSE_WRITES=all`, central `isPreviewViewpoint`), `REP-018` (`client.release(releaseErr)`).
2. **Batch 2 — Additive Migration `030` + Sandbox & Legacy RLS Hardening**:
   - Tasks: `REP-002` (synthetic user `platform_roles` block + read-only `GET /api/admin/test-customer`), `REP-013` (`favorites`/`notification_settings` `FORCE RLS` + `truck_id` validation), `REP-020` (`hasCustomerProfileSurface()` fix + un-skipping CI sandbox assertions + overlay `/admin` fixes).
3. **Batch 3 — Sharing Moderation, Age Gate, Privacy Fallback & Session Hygiene**:
   - Tasks: `REP-005` (moderation suppression bypasses), `REP-006` (`< 14` sharing-gate commit), `REP-007` (`staff_beta` `/s/<token>`), `REP-014` (hidden-profile `listShares()` fallback + Greatest Hits draft/cache fixes), `REP-016` (`SessionEligibilityError` & `related_review_id`), `REP-023` (`allowRenewal: false`), `REP-024` (soft-deleted `idempotency_key`).
4. **Batch 4 — Governance Isolation, Diagnostics, Retention, Worker & Community**:
   - Tasks: `REP-008` (`Mod` `ILIKE` oracle & telemetry masking), `REP-010` (untrusted diagnostic eviction + secret/cookie regexes), `REP-011` (Leaflet SRI + HTML CSP), `REP-012` (community hidden-vendor filter), `REP-015` (90-day evidence retention + disabled-push cleanup), `REP-017` (worker `failed_permanent`/`delivered` keys), `REP-021` (booking rate limit), `REP-026` (moderation/issue/onboarding workflow fixes).
5. **Batch 5 — Deploy Parity, CI Gate, UI Polish & Pool Performance**:
   - Tasks: `REP-019` (`staging2` systemd `ReadWritePaths`, `backup-staging2.sh`, CI `push` diff fix, Nginx/worker/tarball sync), `REP-025` (`updateShareSettings` UI), `REP-027` (`pager.js` step index, `/s/%...` `URIError`, `/admin` CSS & modal focus traps), `REP-028` (Style Guide `categories_completed`, memoization, no-cache headers, GitHub env/email cleanup), `REP-029` (single-`tx` `getPrivateOwnerProfile` + customer delegation order).
6. **Batch 6 — Registry Tooling, Test Scripts, Dead-Artifact Cleanup & Modularization**:
   - Tasks: `REP-022`, `REP-031` (`CREATE INDEX` regex + `package.json` `test:unit`), `REP-032` (remove `truckly-v63.zip`, `truckly-data.sql.gz`, stale `/build.json`, dead exports), `REP-030` (shared helpers/towns + incremental `server/admin-routes.js` manifest modularization).

---

## 5. Known Environmental Notes for Verification

- **Local Windows vs Linux/PostgreSQL CI**: Fast syntax and contract checks (`node tools/code-registry/cli.mjs validate`, `node tools/style-guide/cli.mjs validate`, `node tests/code-registry.test.cjs`, `node tests/style-guide.test.cjs`, `node tests/pager-demo.test.cjs`, `node tests/listing-verification.cjs`, `node tests/map-resilience.test.cjs`, `node tests/vps-platform-contract.test.cjs`, `node tests/staging2-ctl-security.test.cjs`) run in `< 15s` on Windows with zero external services.
- **PostgreSQL 16 & Browser E2E Suites**: Require `DATABASE_URL` / `MIGRATION_DATABASE_URL` (PostgreSQL 16 with `migrator` and `NOBYPASSRLS` `app` roles) + Playwright Chromium, or execution via GitHub Actions (`truckly-source-review.yml`) on a feature branch PR before merging into `working/biteshark-vps`.
