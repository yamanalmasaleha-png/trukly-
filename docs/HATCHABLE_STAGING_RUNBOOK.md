# Hatchable Isolated Staging Verification Runbook (Gates G1–G6 & E2E)

> **PRODUCTION DEPLOYMENT STATUS: BLOCKED**
> Do **not** merge to `main`, deploy to `proj_MEO518rmLLl0` (`https://truckly.hatchable.site`), copy production customer data, or relax any RBAC/RLS/trigger controls. All six hosted Hatchable gates below must pass on an **isolated staging project** before production rollout is reconsidered.

---

## 1. Missing Platform Access & Required Operator Decisions

Inspection of the current workspace confirmed:
- **No Hatchable MCP connection or API bearer token** (`https://hatchable.com/mcp` is not registered, and no `HATCHABLE_*` environment variables, CLI binaries, or `~/.hatchable` credentials exist).
- **No designated staging Hatchable project** exists in repository configuration (`docs/V77_PAGER_SOURCE_REVIEW.md` references only production `proj_MEO518rmLLl0` / `https://truckly.hatchable.site`).

### Decisions Required Before Provisioning Staging
1. **Isolated Staging Project Allocation:** Designate an existing isolated Hatchable staging project (`https://<staging>.hatchable.site`), **or** approve running Hatchable MCP `create_project` to create a disposable blank staging project (confirming any plan/billing impact on the Hatchable account first).
2. **Zero Production Data Copy:** Keep the staging database populated strictly with the repository's canonical seed migrations (`001`–`013`) and disposable `[STG-E2E-*]` test rows — **do not** import production `bookings`, `pickup_pagers`, or `community_reviews`.
3. **Disposable Test Mailboxes / Accounts:** Approve 7 disposable staging sign-in identities on `/login.html` (e.g., `+cust-a`, `+cust-b`, `+va-owner`, `+va-staff`, `+vb-owner`, `+mod`, `+padmin` aliases on an operator-controlled test inbox — never real customer or vendor emails so zero real notifications are sent to external parties).

---

## 2. Step-by-Step Staging Execution Procedure

### Step 1 — Deploy `harden/p0-vendor-booking-community` to Isolated Staging
1. Connect the Hatchable MCP server (`https://hatchable.com/mcp`) scoped to the **isolated staging project** (never `proj_MEO518rmLLl0`).
2. Sync `hatchable.toml`, `migrations/001`–`013`, `lib/*.js`, `api/**/*.js` (27 routes), and `public/**` from commit `HEAD` of `harden/p0-vendor-booking-community`. (**Never** upload `scripts/dev-server.cjs` or `tests/`.)
3. Temporarily upload [`scripts/staging-runtime-probe.template.js`](../scripts/staging-runtime-probe.template.js) to **`api/_staging_gate_probe.js` on the staging project only**, and set staging secret `TRUCKLY_STAGING_PROBE_TOKEN` to a random >= 24-character token.
4. Run `dry_run_deploy` followed by `deploy` on the **staging project**, and record the staging release number and `https://<staging>.hatchable.site` URL.

### Step 2 — Sign In 7 Disposable Staging Personas & Seed RBAC Roles
1. On `https://<staging>.hatchable.site/login.html`, sign in with the 7 disposable test email aliases (`customer_a`, `customer_b`, `vendor_a_owner`, `vendor_a_staff`, `vendor_b_owner`, `moderator`, `platform_admin`) and capture each session's `Cookie` header and Hatchable `user.id`.
2. In [`scripts/staging-seed.sql`](../scripts/staging-seed.sql), uncomment `SET LOCAL app.confirm_staging = 'true';`, substitute the 5 `<STG_USER_ID_*>` placeholders, and execute via Hatchable staging `execute_sql`.
   - Confirm the Gate 5 query output from `staging-seed.sql` reports `is_superuser = false`, `has_bypassrls = false`, `rls_enabled = true`, and `rls_forced = true`.

### Step 3 — Run the Automated Gate 1–6 & End-to-End Suite
Execute [`tests/staging-hatchable-gates.cjs`](../tests/staging-hatchable-gates.cjs) from the repository root (the script hard-blocks `truckly.hatchable.site` and redacts all cookies, emails, and private pager UUIDs):

```bash
STAGING_BASE_URL="https://<staging>.hatchable.site" \
STAGING_PROBE_TOKEN="<same-24+-char-secret>" \
STAGING_COOKIE_CUSTOMER_A="<cookie>" \
STAGING_COOKIE_CUSTOMER_B="<cookie>" \
STAGING_COOKIE_VENDOR_A_OWNER="<cookie>" \
STAGING_COOKIE_VENDOR_A_STAFF="<cookie>" \
STAGING_COOKIE_VENDOR_B_OWNER="<cookie>" \
STAGING_COOKIE_MODERATOR="<cookie>" \
STAGING_COOKIE_PLATFORM_ADMIN="<cookie>" \
node tests/staging-hatchable-gates.cjs --require-live
```

### Step 4 — Verify Write-Pause Controls (`E2E-5`) on Staging
1. Set staging environment variable `TRUCKLY_PAUSE_WRITES=bookings,community` on the staging project.
2. Confirm:
   - `POST /api/bookings/create` -> `503`
   - `POST /api/community/post` -> `503`
   - `GET /api/trucks`, `GET /api/trucks/availability?truck_id=mitote&date=2026-12-20`, and `GET /api/community/list` -> `200` (with unpublished posts still hidden).
3. Unset `TRUCKLY_PAUSE_WRITES` on the staging project.

### Step 5 — Remove Ephemeral Probe & Clean Up Disposable Staging Records
1. Run [`scripts/staging-cleanup.sql`](../scripts/staging-cleanup.sql) (with `SET LOCAL app.confirm_staging = 'true';` uncommented) via staging `execute_sql` to delete all `[STG-E2E-*]` bookings, community posts, `STG-*` pagers, schedules, and `staging.*` audit markers.
2. Delete `api/_staging_gate_probe.js` and `TRUCKLY_STAGING_PROBE_TOKEN` from the staging project, re-deploy staging so it matches the exact **27-route** repository tree, and verify `POST /api/_staging_gate_probe` returns `404` while `GET /api/owner/stats` (unauthenticated) returns `401`.
