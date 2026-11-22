# Test Suites, Prerequisites & CI Matrix

All automated checks live in `tests/*.cjs` and run in GitHub Actions via [.github/workflows/truckly-source-review.yml](../../.github/workflows/truckly-source-review.yml) across 3 Linux jobs (`pager-and-source-syntax`, `linux-installer-and-tarball`, `postgres-backend-hardening`).

> [!IMPORTANT]
> **Never Run Destructive Tests Against Staging or Production**: PostgreSQL integration and E2E suites provision disposable temporary databases (`DATABASE_URL` pointing to a local/CI Postgres 16 server, never `/etc/*/staging.env`).

---

## 1. Fast Offline Unit & Contract Suites (Zero DB / Browser Needed)

```bash
npm run test:smoke       # node tests/pager-demo.test.cjs
npm run test:parity      # node tests/listing-verification.cjs (59-vendor catalog & address truth)
npm run test:platform    # node tests/vps-platform-contract.test.cjs (no Hatchable regressions)
npm run test:registry    # node tests/code-registry.test.cjs (AST, HTML/CSS/SQL, determinism, exclusions, links)
npm run registry:validate # Determinism + schema + link + new high-confidence drift gate
node tests/map-resilience.test.cjs
node tests/staging2-ctl-security.test.cjs
# Branch a2f0135 also adds:
# node tests/map-cards.test.cjs
```

---

## 2. Linux Release Tarball & Installer Suite (Requires Bash / Tar)

```bash
npm run build:release -- --ref HEAD --out-dir /tmp/bs-rel-check
npm run test:deploy      # node tests/install-staging-release.test.cjs
```

---

## 3. PostgreSQL 16+ Integration Suites

Require `DATABASE_URL` pointing to a disposable local PostgreSQL server with database-creation privileges (so tests can create restricted `NOBYPASSRLS` roles and verify `FORCE ROW LEVEL SECURITY`):

- `node tests/standalone-runtime-auth.integration.cjs` — OTP, `__Host-truckly_session`, CSRF, rate limits, session caps.
- `node tests/auth-email-delivery.integration.cjs` — Resend/webhook delivery, staging allowlists, zero silent mailbox fallback.
- `node tests/backend-hardening.integration.cjs` — Vendor RBAC, Pacific booking locks, `community_reviews` RLS, write-pause scopes.
- `node tests/p1-unified-discovery.integration.cjs` — 59-vendor catalog merge, Pacific schedule precedence, outage `503`.
- `node tests/pager-notifications.integration.cjs` — Capability privacy, RFC 8291 Web Push encryption, lease-fenced worker.
- `node tests/admin-governance.integration.cjs` — `Admin: Top` vs `Mod` RBAC, onboarding evidence magic bytes, Act-on-Behalf.
- `node tests/legal-readiness.integration.cjs` — 14+ age policy, `/policies/*`, 18-item readiness register downgrade rules.
- `node tests/feature-controls.integration.cjs` — Live DB switches, DAG inheritance, `expected_revision` concurrency, env precedence.
- `node tests/invitation-workflow.integration.cjs` — `pending_top_approval`, token hashing, `45s` resend cooldown, email match.
- `node tests/diagnostics-and-reliability.integration.cjs` — Fingerprinting, PII scrubbing, retention pruning, release skew.
- `node tests/support-feedback.integration.cjs` — `BS-001001` tickets, SLA transitions, diagnostic link notifications.
- `node tests/urgent-pilot-security.integration.cjs` — Last-Top `auth_users` trigger (`026`), column-bound triggers, session lock races.
- *(Branch `83181ba` adds `node tests/customer-exploration.integration.cjs`.)*

---

## 4. Headless Chrome Browser E2E Suites (`tests/*browser.e2e.cjs`)

Require disposable PostgreSQL + Chrome/Chromium (`CHROME_BIN` or standard system path):
- `discovery-browser.e2e.cjs`, `discovery-cards-ux-browser.e2e.cjs`, `pager-notifications-browser.e2e.cjs`, `admin-portal-browser.e2e.cjs`, `legal-readiness-browser.e2e.cjs`, `feature-controls-browser.e2e.cjs`, `map-resilience-browser.e2e.cjs`, `invitation-workflow-browser.e2e.cjs`, `reliability-accessibility-browser.e2e.cjs`, `support-feedback-browser.e2e.cjs`, `welcome-experience-browser.e2e.cjs`, `urgent-pilot-security-browser.e2e.cjs` *(+ `customer-exploration-browser.e2e.cjs` on `83181ba`)*.

---

## 5. Hosted Staging Verification Gates (Run Only When Authorized to Test Live Host)

- `node tests/vps-staging-gates.cjs --preflight-local` (local preflight)
- `node tests/staging-http-gates.cjs` (hosted HTTP gate checks when explicitly authorized)
