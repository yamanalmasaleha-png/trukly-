# Test Suites, Evidence Levels, Prerequisites & CI Matrix

All automated checks live in `tests/*.cjs` and run in GitHub Actions via [.github/workflows/truckly-source-review.yml](../../.github/workflows/truckly-source-review.yml).

> [!IMPORTANT]
> **Two Strict Verification Rules**:
> 1. **Never Run Destructive Tests Against Staging or Production**: PostgreSQL integration and E2E suites provision disposable temporary databases (`DATABASE_URL` pointing to a local/CI PostgreSQL server, never `/etc/*/staging.env`).
> 2. **Source Presence != Passing Coverage**: Mentioning a route path in `tests/*.cjs` is a `candidate_string_mention`, not proof of coverage or execution. Static registry output (`ROUTE-INVENTORY.md`, `locate`) distinguishes:
>    - `maintained_contract_mapping` (`contract:`): Explicit mapping in [contracts/shared-contracts.json](contracts/shared-contracts.json) identifying protected assertion classes (`authentication`, `ownership_rls`, `role_restrictions`, `input_validation`, `response_shape`, `feature_disabled`, `idempotency`, `concurrency_locking`, `rollback_and_recovery`).
>    - `static_http_call` (`http:`): AST-detected HTTP helper call in `tests/*.cjs` targeting that exact route path.
>    - `candidate_string_mention` (`mention:`): Plain string occurrence only.

---

## 1. Fast Offline Unit & Registry Suites (Zero DB / Browser Needed)

```bash
npm run test:registry     # node tests/code-registry.test.cjs (AST, routes, callers, SQL, schemas, drift governance)
npm run registry:validate # Determinism + recursive schemas + freshness + contracts + drift gate
npm run test:smoke        # node tests/pager-demo.test.cjs
npm run test:parity       # node tests/listing-verification.cjs (59-vendor catalog & address truth)
npm run test:platform     # node tests/vps-platform-contract.test.cjs (no Hatchable regressions)
node tests/map-resilience.test.cjs
node tests/staging2-ctl-security.test.cjs
```

---

## 2. Disposable PostgreSQL Schema Catalog Verification

```bash
BITESHARK_REGISTRY_VERIFY_PG_URL="postgres://postgres:postgres@127.0.0.1:5432/postgres" \
  node tools/code-registry/cli.mjs validate --verify-db
```
- Creates an isolated UTF-8 disposable database (`TEMPLATE template0`), runs `scripts/run-migrations.cjs`, compares tables, columns, normalized types, nullability, default presence, PK/FK constraints, explicit indexes, and `FORCE ROW LEVEL SECURITY` policies against `pg_catalog`, and drops the disposable database.
- Fails (`exit 1`) if `--verify-db` (`required`) cannot reach PostgreSQL; use `--verify-db=optional` locally when PostgreSQL is not running (reports `status: "NOT_RUN"`, never `PASS`).

---

## 3. Linux Release Tarball & Installer Suite (Requires Bash / Tar)

```bash
npm run build:release -- --ref HEAD --out-dir /tmp/bs-rel-check
npm run test:deploy      # node tests/install-staging-release.test.cjs
```

---

## 4. PostgreSQL 16+ Integration Suites

Require `DATABASE_URL` pointing to a disposable local PostgreSQL server with database/role-creation privileges:

- `node tests/standalone-runtime-auth.integration.cjs` — OTP, session cookies, CSRF, rate limits (`CTR-AUTH-SESSION-OTP`).
- `node tests/auth-email-delivery.integration.cjs` — Resend/webhook delivery, staging allowlists (`CTR-AUTH-SESSION-OTP`).
- `node tests/backend-hardening.integration.cjs` — Vendor RBAC, Pacific booking locks, `community_reviews` RLS (`CTR-DB-TX-SESSION`).
- `node tests/p1-unified-discovery.integration.cjs` — 59-vendor catalog merge, Pacific schedule precedence, `503` outage (`CTR-DISCOVERY-CATALOG`).
- `node tests/pager-notifications.integration.cjs` — Capability privacy, RFC 8291 Web Push, lease-fenced worker (`CTR-PAGER-WEBPUSH`).
- `node tests/admin-governance.integration.cjs` — `Admin: Top` vs `Mod` RBAC, onboarding evidence magic bytes, Act-on-Behalf (`CTR-AUTHZ-RBAC-VENDOR`).
- `node tests/legal-readiness.integration.cjs` — 14+ age policy, `/policies/*`, readiness auto-downgrade (`CTR-AGE-ELIGIBILITY`).
- `node tests/feature-controls.integration.cjs` — Live DB switches, DAG inheritance, `expected_revision` concurrency (`CTR-FEATURE-CONTROLS`).
- `node tests/invitation-workflow.integration.cjs` — `pending_top_approval`, token hashing, resend cooldown (`CTR-AUTHZ-RBAC-VENDOR`).
- `node tests/diagnostics-and-reliability.integration.cjs` — Fingerprinting, PII scrubbing, retention pruning (`CTR-DIAGNOSTICS-PIPELINE`).
- `node tests/support-feedback.integration.cjs` — `BS-001001` tickets, sharing scope, incident links (`CTR-SUPPORT-TICKETS`).
- `node tests/urgent-pilot-security.integration.cjs` — Last-Top `auth_users` trigger (`026`), column-bound triggers, lock races.
- `node tests/customer-exploration.integration.cjs` — `027`+`028` RLS & ownership, Pacific visits, trails, EXIF-stripped private photos & reconciliation (`CTR-CUSTOMER-EXPLORATION`, `CTR-PRIVATE-PHOTO-STORAGE`).
- `node tests/customer-profile-sharing.integration.cjs` (`npm run test:profile`) — `029` RLS & ownership across 8 tables, canonical exploration/favorites/notification reuse, Greatest Hits ordering/limits/concurrency, 18+ sharing eligibility without DOB persistence, hashed `/s/<token>` links, preview parity, EXIF-stripped `sha_*` derivatives, abuse reporting, and scoped `Mod`/`Top` suppression.
- `node tests/admin-test-customer.integration.cjs` (`npm run test:admin-test-customer`) — Top-Admin-only Testing Customer Sandbox (`usr_sa_top_admin_test_customer`), RBAC denials (`401`/`403` for anon, customer, Vendor Owner, and `Admin: Mod`), production environment fail-closed block, `/admin` portal isolation during active overlay session, sample seeding/resetting, primary-session revocation invalidation, and clean overlay exit without revoking the underlying `Admin: Top` session.

---

## 5. Headless Chrome Browser E2E Suites (`tests/*browser.e2e.cjs`)

Require disposable PostgreSQL + Chrome/Chromium (`CHROME_BIN` or system browser):
- `discovery-browser.e2e.cjs`, `discovery-cards-ux-browser.e2e.cjs`, `pager-notifications-browser.e2e.cjs`, `admin-portal-browser.e2e.cjs`, `legal-readiness-browser.e2e.cjs`, `feature-controls-browser.e2e.cjs`, `map-resilience-browser.e2e.cjs`, `invitation-workflow-browser.e2e.cjs`, `reliability-accessibility-browser.e2e.cjs`, `support-feedback-browser.e2e.cjs`, `welcome-experience-browser.e2e.cjs`, `urgent-pilot-security-browser.e2e.cjs`, `customer-exploration-browser.e2e.cjs`, `customer-profile-browser.e2e.cjs` (`npm run test:e2e:profile`).

---

## 6. Execution Report Requirements (Developers & Coding Assistants)

Whenever reporting verification results in a PR or engineering handoff, record:
1. **Exact Command**: e.g., `node tests/code-registry.test.cjs`
2. **Commit SHA**: 40-char SHA under test (plus dirty-worktree status if uncommitted)
3. **Environment**: OS, Node version, PostgreSQL version (or `NOT_RUN`), browser binary if E2E
4. **Exit Result**: Exact exit code and pass/fail count
5. **Skips / Unrun Suites**: Any skipped checks and why
6. **Artifact Location**: CI run URL / artifact name or local output path
7. **Mocked vs Real Dependencies**: e.g., real disposable PostgreSQL + mock Resend HTTPS vs live host gate
