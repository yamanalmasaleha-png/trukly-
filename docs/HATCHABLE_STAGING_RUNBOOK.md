# Hatchable Isolated Staging Verification Runbook (Gates G1–G9 & E2E)

> **PRODUCTION DEPLOYMENT STATUS: BLOCKED**
> Do **not** merge to `main`, deploy to `proj_MEO518rmLLl0` (`https://truckly.hatchable.site`), copy production customer data, send notifications to real customers, or relax any RBAC/RLS/trigger controls. All nine hosted Hatchable gates below must pass on an **isolated staging project** before production rollout is reconsidered.

---

## 1. Missing Platform Access & Required Operator Decisions

Inspection of the current workspace confirmed:
- **No Hatchable MCP connection or API bearer token** (`https://hatchable.com/mcp` is not registered, and no `HATCHABLE_*` or `STAGING_*` environment variables, CLI binaries, or `~/.hatchable` credentials exist).
- **No designated staging Hatchable project** exists in repository configuration (`docs/V77_PAGER_SOURCE_REVIEW.md` references only production `proj_MEO518rmLLl0` / `https://truckly.hatchable.site`).

### Decisions & Access Required Before Provisioning Staging (Do Not Paste Secrets in Chat)
1. **Isolated Staging Project Allocation:** Designate an existing isolated Hatchable staging project (`https://<staging>.hatchable.site`), **or** approve creating a disposable blank staging project after confirming any Hatchable account plan/billing impact.
2. **Fail-Closed Environment Identity:** Configure `TRUCKLY_ENV=staging` on the staging project (never on production). Both `scripts/staging-runtime-probe.template.js` and `tests/staging-hatchable-gates.cjs` verify server-side `TRUCKLY_ENV=staging` and reject `proj_MEO518rmLLl0` before executing any write gates.
3. **Zero Production Data Copy:** Populate staging strictly with migrations `001`–`016` and disposable `[STG-E2E-*]` test rows — never import production `bookings`, `pickup_pagers`, `community_reviews`, or push subscriptions.
4. **Disposable Test Personas:** Sign in 7 operator-controlled disposable test accounts on staging `/login.html` (`customer_a`, `customer_b`, `vendor_a_owner`, `vendor_a_staff`, `vendor_b_owner`, `moderator`, `platform_admin`) and store cookies in a local non-committed operator env file.

---

## 2. Step-by-Step Staging Execution Procedure

### Step 1 — Deploy Candidate Branch (`improve/p1-audit-and-pager-notifications`) to Isolated Staging
1. Connect Hatchable CLI / MCP scoped strictly to the **isolated staging project** (confirm project ID is **not** `proj_MEO518rmLLl0`).
2. Apply migrations `migrations/001`–`016` in order.
3. Sync `hatchable.toml`, `lib/*.js`, `api/**/*.js` (**30** route files), and `public/**`. (**Never** upload `scripts/dev-server.cjs`, `scripts/seed-sql-reader.cjs`, `scripts/run-pager-worker.cjs`, or `tests/`.)
4. Set staging environment variables (redeploy staging whenever changing environment variables):
   - `TRUCKLY_ENV=staging`
   - `TRUCKLY_PUSH_PROVIDER_MODE=disabled` (keep push delivery disabled during initial gate run; switch to `webpush` with staging VAPID keys and `TRUCKLY_NOTIFICATION_WORKER_SECRET` only for designated physical-device push testing — never enable `fake` or `loopback_test` on hosted environments)
   - `TRUCKLY_STAGING_PROBE_TOKEN=<random-24+-char-secret>`
5. Temporarily upload [`scripts/staging-runtime-probe.template.js`](../scripts/staging-runtime-probe.template.js) as **`api/_staging_gate_probe.js` on the staging project only**, deploy staging, and record the staging release SHA / ID.

### Step 2 — Sign In 7 Disposable Staging Personas & Seed RBAC Roles
1. Sign in the 7 disposable staging test accounts via `/login.html` and record their `user.id` values and session cookies in a local operator `.env.staging` file (outside git).
2. In [`scripts/staging-seed.sql`](../scripts/staging-seed.sql), uncomment `SET LOCAL app.confirm_staging = 'true';`, substitute the `<STG_USER_ID_*>` placeholders, and execute on staging PostgreSQL.
   - Verify the Gate 5 SQL output confirms `is_superuser = false`, `has_bypassrls = false`, `rls_enabled = true`, and `rls_forced = true`.

### Step 3 — Run Hosted Gates `G1`–`G9` & End-to-End Checks (`E2E1`–`E2E6`)
Run [`tests/staging-hatchable-gates.cjs`](../tests/staging-hatchable-gates.cjs) using the local operator env file:

```bash
node --env-file=.env.staging tests/staging-hatchable-gates.cjs --require-live
```

This verifies:
- **G1:** Shared `lib/*.js` & `node:crypto` runtime compatibility; helper/script paths unexposed (`404`).
- **G2:** Single-connection transaction pinning (`pg_backend_pid()`, `txid_current()`) and full multi-statement rollback.
- **G3:** Zero leakage of transaction-local `app.user_id` and `app.can_moderate` GUCs after commit or rollback.
- **G4:** Hosted authentication & 7-persona RBAC matrix (cross-vendor denials, staff vs owner restrictions, debug-header immunity).
- **G5:** Effective DB connection role (`NOSUPERUSER`, `NOBYPASSRLS`) and `FORCE ROW LEVEL SECURITY` on `community_reviews` and `pager_notification_subscriptions`.
- **G6:** Direct table gateway de-exposure (`403`/`404`) and private field omission on `/api/community/list`.
- **G7:** Migration `014` & unified 59-place Sonoma County catalog parity across list, detail, search, and featured routes (`estrella` quarantined `404`).
- **G8:** Authorized Vendor A owner live location publish immediately observed by separate Customer A session (`verified` stays `false`).
- **G9:** Conditional `ETag` (`304` before publish, immediate `200` invalidation after publish, `private, no-store` on coordinate queries).
- **E2E1–E2E6:** Pacific booking validation/idempotency, concurrent pager creation idempotency, `YYYY-MM-DD` date contract, moderator separation, write-pause controls, and isolated customer pager demo (`0` writes).

### Step 4 — Remove Ephemeral Probe & Verify Post-Cleanup Behavior
1. Run [`scripts/staging-cleanup.sql`](../scripts/staging-cleanup.sql) (with `SET LOCAL app.confirm_staging = 'true';`) on staging PostgreSQL to delete all `[STG-E2E-*]` bookings, community posts, `STG-*` pagers, schedules, live location notes, and staging audit markers.
2. Delete `api/_staging_gate_probe.js` and `TRUCKLY_STAGING_PROBE_TOKEN` from the staging project and redeploy so staging matches the exact **30-route** repository tree.
3. Confirm `POST /api/_staging_gate_probe` returns `404`, `GET /api/trucks` returns `200` (`total: 59`), and `GET /api/owner/stats` (anonymous) returns `401`.
