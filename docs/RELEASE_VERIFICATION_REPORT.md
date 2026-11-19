# Truckly Staging & Physical-Device Release Verification Report

## Current Active Release Path — Standalone VPS Candidate (`614dc997e1b903c94948dc7ff13d02e51c434acd`)

- **Current Executed VPS Verification Report:** **[`docs/VPS_RELEASE_VERIFICATION_REPORT.md`](./VPS_RELEASE_VERIFICATION_REPORT.md)**
- **Active Branch & Verified Deployed Executable SHA:** `migrate/vps-standalone-staging` @ **`614dc997e1b903c94948dc7ff13d02e51c434acd`** (`120/120` deployed files SHA-256 matched against Git, composite manifest `3bef048c70e3deb353ed26441d9d0a481d91e680b696d3ce94c530f48d852c1d`; GitHub Actions Run `44180486982` `completed / success`)
- **Current Release Decision (Standalone VPS Path):** **`BLOCKED`** *(public HTTPS staging at `https://staging.biteshark.live`, root holding page at `https://biteshark.live`, 3-SAN Let's Encrypt TLS & `certbot renew --dry-run`, all `11/11` public HTTPS gates + `6/6` E2E checks `run_id=4b45084f`, real two-browser HTTPS login/publish/logout, `10.4h` `systemd` worker soak + live pause/drain + `SIGKILL` recovery, and GPG-encrypted backup + real `pg_restore` **PASSED** on `614dc997e1b903c94948dc7ff13d02e51c434acd`; remaining blockers on the VPS path are **only**: (1) off-server encrypted backup destination and (2) designated physical Android + iPhone `iOS 16.4+` Home Screen PWA devices for `PD-01`–`PD-18`. Hatchable staging is **no longer** required for the standalone VPS release path.)*
- **Production Guard Status:** Hatchable production (`proj_MEO518rmLLl0` / `https://truckly.hatchable.site`), `origin/main`, and all existing VPS co-tenant services (`lifestyle-api` / `pm2-matt`, `velvet_key_db`, `qwen-worker`, `/usr/bin/node v18.19.1`, default Nginx `:80`) remain **untouched**.

> **Historical Evidence Preservation Note:** The sections below preserve the original Hatchable-candidate verification record (`fa4e40affb574d3da5a98e4874b301ad5251e17c`, report commit `3f89401e11ff4c0d376e58e1df216a8b0ee5ce13` on `improve/p1-audit-and-pager-notifications`) verbatim as historical evidence. None of the historical rows below are relabeled as VPS evidence; see [`docs/VPS_RELEASE_VERIFICATION_REPORT.md`](./VPS_RELEASE_VERIFICATION_REPORT.md) for all executed standalone VPS staging evidence.

---

## Historical Archive — Hatchable Candidate Verification Record (`fa4e40affb574d3da5a98e4874b301ad5251e17c`)

**Historical Report Generated:** `2026-11-17T00:57:00-08:00` (`America/Los_Angeles` / `2026-11-17T08:57:00Z`)
**Repository:** `https://github.com/yamanalmasaleha-png/trukly-/`
**Production Guard Status:** `proj_MEO518rmLLl0` (`https://truckly.hatchable.site`) **UNTOUCHED** — zero production deploys, schema changes, data exports, or customer notifications occurred.

---

### 1. Release decision

**Decision: `BLOCKED`** *(required hosted staging access, scheduler runtime access, and physical test devices are unavailable in this environment)*.

- All local static checks, real-PostgreSQL (`18.6` locally and `16` in GitHub Actions CI) security/concurrency/migration/notification suites, local pre-flight staging harness checks (`G1`–`G9` + `E2E1`–`E2E6`), and real Headless Chrome (`157.0.8103.51`) browser E2E suites **passed** on the final defect-corrected code candidate (`fa4e40affb574d3da5a98e4874b301ad5251e17c`, GitHub Actions Run `44050906767` `completed / success`).
- Live hosted Hatchable staging gates (`G1`–`G9`), live Hatchable function timeout and scheduler cadence verification, and real Web Push provider + physical Android / iPhone (`iOS 16.4+` Home Screen PWA) checks remain **`BLOCKED` / `NOT RUN`** pending operator-provisioned staging access and physical test devices.
- Production deployment remains **unauthorized**.

---

### 2. Candidate and environment identity

| Attribute | Value |
|---|---|
| **Branch** | `improve/p1-audit-and-pager-notifications` (`origin/main` untouched at `4836520029e91e952fb1817595ee961c67514e6a`) |
| **Initial Reviewed Candidate SHA** | `5c63cbfa52b5188bb683b076a97a473861324ddd` |
| **Intermediate Fix SHA (`DEF-01` & `DEF-02`)** | `0948ee56275733ef3ec1ecdce0857d358f6d0e1e` |
| **Final Verified Code SHA (`DEF-03`)** | `fa4e40affb574d3da5a98e4874b301ad5251e17c` *(subsequent report commit modifies `docs/RELEASE_VERIFICATION_REPORT.md` only with `0` diff across `api/`, `lib/`, `public/`, `migrations/`, `hatchable.toml`, `scripts/`, and `tests/`)* |
| **Working-Tree Cleanliness** | Clean (`git status --short` empty; exact `30` permanent `api/**/*.js` files; `0` probe/debug files in `api/`) |
| **Staging Project ID & Canonical URL** | **`BLOCKED` (Unprovisioned)** — no `STAGING_BASE_URL`, `HATCHABLE_*` credentials, or non-production project designated in workspace (`proj_MEO518rmLLl0` / `https://truckly.hatchable.site` hard-blocked) |
| **Platform Deployment / Release ID** | **`NOT DEPLOYED` (`BLOCKED`)** |
| **Local Verification Runtime** | `Node.js v24.19.0`, `Microsoft Windows NT 10.0.19045.0`, `PostgreSQL 18.6 on x86_64-windows` (`pg@8.20.0`, `NOSUPERUSER NOBYPASSRLS` role), `Headless Chrome/157.0.8103.51` |
| **Remote CI Runtime** | GitHub Actions `ubuntu-latest`, `Node.js 22`, `postgres:16` service container (`pg@8.13.1`), Headless Chromium (Run `44050906767` on `fa4e40a` `completed / success`) |
| **Scheduler Mechanism & Measured Cadence** | Worker endpoint `POST /api/pager/worker` + CLI [`scripts/run-pager-worker.cjs`](../scripts/run-pager-worker.cjs); **hosted scheduler & Hatchable function timeout: `BLOCKED` (unmeasured)** |
| **Physical Device / Browser Matrix** | Android device: **Unavailable (`NOT RUN`)** · iPhone (`iOS/iPadOS 16.4+` Home Screen PWA): **Unavailable (`NOT RUN`)** · Local simulated browser: `Headless Chrome/157.0.8103.51` |
| **Verification Window & Timezone** | `2026-11-17T00:32:34-08:00` – `2026-11-17T00:57:00-08:00` (`America/Los_Angeles`, `UTC-08:00`) |

#### Migration Inventory (`migrations/001`–`016`) & SHA-256 Checksums

| Migration File | Size (Bytes) | SHA-256 Checksum |
|---|---:|---|
| `001_create_bookings.sql` | 368 | `504752fb30ed492f2ddf368c9564d808478c98ea5b8e45284e3100624e0e2d54` |
| `002_create_truck_settings.sql` | 210 | `82774792c7494d89bb54ba512146bfb70d4246b2cc367d4e71299cdfadfe9dfc` |
| `003_create_favorites.sql` | 164 | `acbad7e0c9fb01b73f812e7a2dbfb30e0f16f5c3b3dc8f57e1d6fec28d48c36a` |
| `004_create_notification_settings.sql` | 247 | `d6fefeda33ebe4d587695b7e975aae5892dd6816c924dece5ae68e67cdb10e13` |
| `005_create_owner_profiles.sql` | 226 | `8350916237fbb81fb79fc95e6b4165b6b437e979b8fbe933585dafaa0166458f` |
| `006_create_owner_schedule.sql` | 262 | `f9c5b84e2c530aa997195ccd086ed16cdd92b51909be4a70a0b705e840eef93d` |
| `007_add_booking_packages.sql` | 153 | `21ecf6a0e604efc896d6751658e0caa2f026fec31f46e88bff49d207a9bff33f` |
| `008_pickup_pagers.sql` | 550 | `0fe78e3ba4a9cda55cc2a6bdb0ca30e037740595d86bcbea4c5c1cdcf7ba7ca6` |
| `009_create_community_reviews.sql` | 1,029 | `912a32fc851320cb367f36e11c67948960b45b5ab34c310e369c93dad1472dfa` |
| `010_allow_community_whispers.sql` | 285 | `a6cb18f12b0ef6af3e71fdad05b6abb0a9d740f3136b1cc9e32d39df2dd8ce4f` |
| `011_vendor_authz_and_audit.sql` | 12,625 | `9918ac6921ab7d1fe17a86c5d27e8978888f1e69d89727fe8e15167cbdacdc4e` |
| `012_harden_bookings.sql` | 4,934 | `d8e00f0d040ed5e3f73e656ccde93657bf9c5143666e27814b92132d297127a2` |
| `013_harden_community_privacy.sql` | 5,161 | `e2e53f2b0f3298504c5ba2410a8c52e978f71de0115b90b47790a3caad6c1db4` |
| `014_unified_discovery_catalog.sql` | 44,475 | `9bf8c7d5b11fc787e6cc198f257964b5a5442f483bc927ec391e061c613910ad` |
| `015_pager_notifications_outbox.sql` | 6,954 | `813c20930ed191cb7ed54c867757d8cfb3830527f1291f2830f78031496cdbc3` |
| `016_pager_worker_fencing_and_catchup.sql` | 2,392 | `f8a67e3c72facaaa8637a8c226eb1331b42fbfe7fc83028a2e897d6feb5f8c83` |

---

### 3. Original six-item status table

| # | Improvement Item | Implementation Status | Local Verification | Hosted Verification | Device / Provider Verification | Evidence Reference | Remaining Blocker |
|---|---|---|---|---|---|---|---|
| 1 | **Vendor authorization** (`owner` vs `staff`, `FOR SHARE` lock serialization) | Implemented (`011`, `lib/authz.js`, `api/owner/*`, `api/pager/*`) | **PASS** (PG 18.6 & PG 16 CI) | **`BLOCKED`** | N/A | `PG-HARDEN` `[2/6]`, `[7/8]`, `[8/8]` | Isolated Hatchable staging (`HOSTED-G1`..`HOSTED-G4`) |
| 2 | **Booking integrity** (Pacific dates, server packages, idempotency, `FOR SHARE`/`FOR NO KEY UPDATE` locks) | Implemented (`012`, `api/bookings/create.js`, `lib/dates.js`) | **PASS** (PG 18.6 & PG 16 CI) | **`BLOCKED`** | N/A | `PG-HARDEN` `[3/6]`, `[5/6]`, `[7/8]` | Isolated Hatchable staging (`HOSTED-G2`, `HOSTED-E2E1`, `HOSTED-E2E3`) |
| 3 | **Community privacy** (`FORCE ROW LEVEL SECURITY`, moderator separation, direct-gateway removal) | Implemented (`013`, `hatchable.toml`, `api/community/*`) | **PASS** (PG 18.6 & PG 16 CI) | **`BLOCKED`** | N/A | `PG-HARDEN` `[4/6]`, `[5/6]` | Isolated Hatchable staging (`HOSTED-G3`, `HOSTED-G5`, `HOSTED-G6`, `HOSTED-E2E4`) |
| 4 | **Owner publishing** (profile, schedule, GPS & text-only pin safety, clock-aware `ETag`s, `private, no-store` coords) | Implemented (`014`, `lib/discovery.js`, `api/owner/*`, `api/trucks/nearby.js`) | **PASS** (PG 18.6 + Headless Chrome 157) | **`BLOCKED`** | N/A | `PG-DISCOVERY` `[2/7]`, `[8/8]`, `BR-DISCOVERY` `[1/3]`–`[3/3]` | Isolated Hatchable staging (`HOSTED-G8`) |
| 5 | **Unified directory** (single 59-place Sonoma County catalog across list, detail, search, featured, schedule) | Implemented (`014`, `lib/discovery.js`, `api/trucks*.js`) | **PASS** (PG 18.6 + Headless Chrome 157) | **`BLOCKED`** | N/A | `L-PARITY`, `PG-DISCOVERY` `[1/7]`–`[8/8]` | Isolated Hatchable staging (`HOSTED-G7`) |
| 6 | **Background pager notifications** (outbox, wave-fenced leases, pre-dispatch recheck, ready catch-up, RFC 8291/8292 Web Push, PWA SW) | Implemented (`015`–`016`, `lib/pager-notifications.js`, `lib/webpush-crypto.js`, `public/sw.js`, `public/pager.js`) | **PASS** (PG 18.6 + loopback HTTP + Headless Chrome 157) | **`BLOCKED`** | **`NOT RUN` / `BLOCKED`** | `PG-NOTIF` `[1/8]`–`[12/12]`, `BR-NOTIF` `[1/4]`–`[4/4]` | Isolated Hatchable staging (`HOSTED-G9`, `HOSTED-SCHEDULER`) + staging VAPID keys + physical Android & iPhone 16.4+ Home Screen PWA (`PD-01`..`PD-18`) |

---

### 4. Executed evidence matrix

#### A. Local, Real-PostgreSQL, Browser-Simulated & CI Executions

| Test ID | Environment | Expected Result | Observed Result | Status | Timestamp (UTC) | Sanitized Evidence Ref | Tested SHA |
|---|---|---|---|---|---|---|---|
| `CI-GHA-INITIAL` | GitHub Actions (`ubuntu-latest`, Node 22, PG 16) | All 3 workflow jobs pass on initial candidate | Run `44046236223`: syntax/30-route, catalog parity, PG 16 + Chrome E2E all `success` | **PASS** | `2026-11-17T08:23:27Z` | GHA Run `44046236223` | `5c63cbfa52b5188bb683b076a97a473861324ddd` |
| `L-NEARBY-AUDIT` | Local static & handler inspection | All coordinate-dependent endpoints emit `private, no-store` and reject blank `?lat=&lng=` | `/api/trucks/nearby` lacked `Cache-Control` and coerced `?lat=&lng=` to `(0,0)` (`DEF-01` filed & fixed in `0948ee5`) | **FAIL** *(pre-fix)* | `2026-11-17T08:35:06Z` | Section 5 `DEF-01` | `5c63cbfa52b5188bb683b076a97a473861324ddd` |
| `L-DEMO` | Local Node `v24.19.0` (`tests/pager-demo.test.cjs`) | Sample pager demo executes with `0` network/backend calls | `PASS` in `100ms` (`exit 0`) | **PASS** | `2026-11-17T08:43:53Z` | `tests/pager-demo.test.cjs` | `0948ee56275733ef3ec1ecdce0857d358f6d0e1e` |
| `L-PARITY` | Local Node `v24.19.0` (`tests/listing-verification.cjs`) | 59 Sonoma listings, syntax, safe photo defaults, `503` guards, nearby parity | `PASS` in `460ms` (`exit 0`) | **PASS** | `2026-11-17T08:43:54Z` | `tests/listing-verification.cjs` | `0948ee56275733ef3ec1ecdce0857d358f6d0e1e` |
| `PG-HARDEN` | Real PostgreSQL `18.6` (`NOBYPASSRLS` role) | Legacy `001`–`016` upgrade, P0 RBAC, Pacific dates, RLS, Tier 1/2 rollback, `FOR SHARE` permission-lock contention (`[8/8]`) | `PASS` `[1/6]`..`[8/8]` in `12,662ms` (`exit 0`) | **PASS** | `2026-11-17T08:44:06Z` | `tests/backend-hardening.integration.cjs` | `0948ee56275733ef3ec1ecdce0857d358f6d0e1e` |
| `PG-STG-PREFLIGHT` | Real PostgreSQL `18.6` + local HTTP (`--preflight-local`, **NOT hosted**) | Verify `staging-seed.sql`, `staging-runtime-probe`, `G1`–`G9`, `E2E1`–`E2E6`, and `staging-cleanup.sql` (`0` residual rows) | `PASS` in `10,592ms` (`exit 0`) | **PASS** *(local preflight only)* | `2026-11-17T08:44:17Z` | `tests/staging-hatchable-gates.cjs` | `0948ee56275733ef3ec1ecdce0857d358f6d0e1e` |
| `PG-DISCOVERY` | Real PostgreSQL `18.6` | 59-place parity, owner sync, DST/overnight schedules, zero-write clock `ETag`s, pin clearing, `/api/trucks/nearby` `private, no-store` & bounds (`DEF-01` retest) | `PASS` `[1/7]`..`[8/8]` in `9,271ms` (`exit 0`) | **PASS** | `2026-11-17T08:44:26Z` | `tests/p1-unified-discovery.integration.cjs` | `0948ee56275733ef3ec1ecdce0857d358f6d0e1e` |
| `PG-NOTIF` | Real PostgreSQL `18.6` + loopback RFC 8291/8292 HTTP | `001`–`016` migrations, `FORCE RLS`, SSRF/CSRF/rate limits, RFC 8291/8292 wire decrypt/verify, wave claims, pre-dispatch recheck, ready catch-up, fail-closed config | `PASS` `[1/8]`..`[12/12]` in `11,887ms` (`exit 0`) | **PASS** | `2026-11-17T08:44:38Z` | `tests/pager-notifications.integration.cjs` | `0948ee56275733ef3ec1ecdce0857d358f6d0e1e` |
| `BR-DISCOVERY` | Real Headless `Chrome/157.0.8103.51` + Real PG `18.6` | Customer loads 59 listings; Vendor owner publishes profile/GPS/schedule; Customer refreshes card & modal | `PASS` `[E2E 1/3]`–`[E2E 3/3]` in `11,359ms` (`exit 0`) | **PASS** | `2026-11-17T08:44:50Z` | `tests/discovery-browser.e2e.cjs` | `0948ee56275733ef3ec1ecdce0857d358f6d0e1e` |
| `BR-NOTIF` | Real Headless `Chrome/157.0.8103.51` + Real PG `18.6` + simulated loopback push | Sample demo isolated (`0` calls); real pager opt-in, `/sw.js`, worker push, `#pager-ref` tap routing, denied & unsupported fallbacks | `PASS` `[E2E 1/4]`–`[E2E 4/4]` in `11,512ms` (`exit 0`) | **PASS** *(simulated provider)* | `2026-11-17T08:45:01Z` | `tests/pager-notifications-browser.e2e.cjs` | `0948ee56275733ef3ec1ecdce0857d358f6d0e1e` |
| `CI-GHA-5E5FC01` | GitHub Actions (`ubuntu-latest`, Node 22, PG 16, Chromium) | Full workflow verification after `0948ee5` | PG 16 suites `PASS`, but Step 10 (`discovery-browser.e2e.cjs`) timed out at `15s` when external `unpkg.com` Leaflet CDN stalled (`DEF-03` filed & fixed in `fa4e40a`) | **FAIL** *(pre-`DEF-03`)* | `2026-11-17T08:50:06Z` | GHA Run `44049995512` | `5e5fc019efd0a4007dd3c5cbe9238f543e9720cb` |
| `RETEST-LOCAL-FINAL` | Local Node `v24.19.0` + Real PG `18.6` + Headless `Chrome/157.0.8103.51` (`unpkg.com` blocked) | Rerun `L-DEMO`, `L-PARITY`, `PG-STG-PREFLIGHT`, `BR-DISCOVERY`, `BR-NOTIF` on final code candidate | All 5 suites `PASS` (`0` external CDN requests; graceful map-unavailable rendering verified) | **PASS** | `2026-11-17T08:56:05Z` | Local retest log | `fa4e40affb574d3da5a98e4874b301ad5251e17c` |
| `CI-GHA-FINAL` | GitHub Actions (`ubuntu-latest`, Node 22, PG 16, Headless Chromium) | All 3 CI jobs (`Pager demo + syntax`, `Catalog & UX`, `Real PostgreSQL + Chrome E2E`) pass on final code SHA | Run `44050906767`: all 3 jobs & all 8 suites `completed / success` | **PASS** | `2026-11-17T08:56:28Z` | GHA Run `44050906767` | `fa4e40affb574d3da5a98e4874b301ad5251e17c` |

#### B. Hosted Hatchable Staging & Scheduler Gates (`--require-live`)

| Test ID | Environment | Expected Result | Observed Result | Status | Timestamp (UTC) | Sanitized Evidence Ref | Tested SHA |
|---|---|---|---|---|---|---|---|
| `HOSTED-G1` | Isolated Hatchable Staging | `lib/*.js`, `node:crypto`, RFC 8291/8292 crypto load; helpers & `/__debug/*` `404`; narrow probe auth; `no-store` headers | Runner exited `2` (`STAGING_BASE_URL` & staging credentials absent) | **`BLOCKED`** | `2026-11-17T08:45:01Z` | `HOSTED-LIVE-GATES` (`exit 2`) | `0948ee56275733ef3ec1ecdce0857d358f6d0e1e` |
| `HOSTED-G2` | Isolated Hatchable Staging | Hosted `db` single-PID/XID transaction commit & full multi-statement rollback | Not executed on hosted Hatchable | **`BLOCKED`** | `2026-11-17T08:45:01Z` | `HOSTED-LIVE-GATES` (`exit 2`) | `0948ee56275733ef3ec1ecdce0857d358f6d0e1e` |
| `HOSTED-G3` | Isolated Hatchable Staging | `app.user_id`, `app.can_moderate`, `app.pager_internal` GUCs do not leak across commit/rollback/reuse/concurrency | Not executed on hosted Hatchable | **`BLOCKED`** | `2026-11-17T08:45:01Z` | `HOSTED-LIVE-GATES` (`exit 2`) | `0948ee56275733ef3ec1ecdce0857d358f6d0e1e` |
| `HOSTED-G4` | Isolated Hatchable Staging | 7 real Hatchable sessions enforce vendor/staff/moderator/admin RBAC & debug immunity | Not executed on hosted Hatchable (7 staging session cookies unavailable) | **`BLOCKED`** | `2026-11-17T08:45:01Z` | `HOSTED-LIVE-GATES` (`exit 2`) | `0948ee56275733ef3ec1ecdce0857d358f6d0e1e` |
| `HOSTED-G5` | Isolated Hatchable Staging | Hosted DB connection role is `NOSUPERUSER`, `NOBYPASSRLS`; `FORCE RLS` effective across `community_reviews` + 4 notification tables | Not executed on hosted Hatchable | **`BLOCKED`** | `2026-11-17T08:45:01Z` | `HOSTED-LIVE-GATES` (`exit 2`) | `0948ee56275733ef3ec1ecdce0857d358f6d0e1e` |
| `HOSTED-G6` | Isolated Hatchable Staging | Direct table gateway paths return `403`/`404` on `community_reviews` and all 4 notification tables | Not executed on hosted Hatchable | **`BLOCKED`** | `2026-11-17T08:45:01Z` | `HOSTED-LIVE-GATES` (`exit 2`) | `0948ee56275733ef3ec1ecdce0857d358f6d0e1e` |
| `HOSTED-G7` | Isolated Hatchable Staging | 59 canonical listings parity, legacy favorites, quarantined `404`, clock/expiry `ETag`s | Not executed on hosted Hatchable | **`BLOCKED`** | `2026-11-17T08:45:01Z` | `HOSTED-LIVE-GATES` (`exit 2`) | `0948ee56275733ef3ec1ecdce0857d358f6d0e1e` |
| `HOSTED-G8` | Isolated Hatchable Staging | Separate browser sessions verify owner profile/schedule/GPS/text-only pin clearing & `private, no-store` coords | Not executed on hosted Hatchable | **`BLOCKED`** | `2026-11-17T08:45:01Z` | `HOSTED-LIVE-GATES` (`exit 2`) | `0948ee56275733ef3ec1ecdce0857d358f6d0e1e` |
| `HOSTED-G9` | Isolated Hatchable Staging | Capability/CSRF/SSRF guards, rate limits, atomic ready outbox, catch-up, pause controls, telemetry & worker secret auth | Not executed on hosted Hatchable | **`BLOCKED`** | `2026-11-17T08:45:01Z` | `HOSTED-LIVE-GATES` (`exit 2`) | `0948ee56275733ef3ec1ecdce0857d358f6d0e1e` |
| `HOSTED-SCHEDULER` | Isolated Hatchable Staging + Scheduler | Measure supported scheduler cadence, Hatchable function timeout vs `20s` worker budget, overlap safety, and pause/stop behavior | Hosted staging & scheduler unprovisioned | **`BLOCKED`** | `2026-11-17T08:45:01Z` | Section 9 Blocker #2 | `0948ee56275733ef3ec1ecdce0857d358f6d0e1e` |

#### C. Real Push Provider & Physical-Device Matrix (`Android` & `iPhone iOS 16.4+ Home Screen PWA`)

| Test ID | Check Description | Target Environment | Expected Result | Observed Result | Status | Tested SHA |
|---|---|---|---|---|---|---|
| `PD-01` | Permission prompt triggered only by explicit user tap (`#pagerSubscribeBtn`) | Physical Android Chrome + Physical iPhone Home Screen PWA | Prompt appears only on button tap | No physical devices connected (`adb` absent; no staging URL/VAPID) | **`NOT RUN`** | `0948ee56275733ef3ec1ecdce0857d358f6d0e1e` |
| `PD-02` | Successful Web Push subscription to designated staging pager | Physical Android + Physical iPhone | `201` subscription bound to FCM / Apple Web Push | Physical devices & staging unavailable | **`NOT RUN`** | `0948ee56275733ef3ec1ecdce0857d358f6d0e1e` |
| `PD-03` | Ready alert while app/page is foregrounded | Physical Android + Physical iPhone | Visible notification + live status update | Physical devices & staging unavailable | **`NOT RUN`** | `0948ee56275733ef3ec1ecdce0857d358f6d0e1e` |
| `PD-04` | Ready alert while browser/PWA is backgrounded | Physical Android + Physical iPhone | OS banner delivered in background | Physical devices & staging unavailable | **`NOT RUN`** | `0948ee56275733ef3ec1ecdce0857d358f6d0e1e` |
| `PD-05` | Ready alert while device screen is locked | Physical Android + Physical iPhone | Lock-screen alert displayed | Physical devices & staging unavailable | **`NOT RUN`** | `0948ee56275733ef3ec1ecdce0857d358f6d0e1e` |
| `PD-06` | Notification tap opens the correct pickup ticket | Physical Android + Physical iPhone | Resolves `/#pager-ref=<sub_id>` and scrubs URL hash | Physical devices & staging unavailable | **`NOT RUN`** | `0948ee56275733ef3ec1ecdce0857d358f6d0e1e` |
| `PD-07` | Cold-start tap routing (app closed before tap) | Physical Android + Physical iPhone | `clients.openWindow` opens ticket cleanly | Physical devices & staging unavailable | **`NOT RUN`** | `0948ee56275733ef3ec1ecdce0857d358f6d0e1e` |
| `PD-08` | Already-open app tap routing (`client.focus` + `postMessage`) | Physical Android + Physical iPhone | Focuses open window to ready ticket | Physical devices & staging unavailable | **`NOT RUN`** | `0948ee56275733ef3ec1ecdce0857d358f6d0e1e` |
| `PD-09` | Ready-state subscription catch-up on physical device | Physical Android + Physical iPhone | Subscribing to already-ready ticket delivers 1 alert | Physical devices & staging unavailable *(DB/worker verified in `PG-NOTIF` `[11/12]`)* | **`NOT RUN`** | `0948ee56275733ef3ec1ecdce0857d358f6d0e1e` |
| `PD-10` | Repeated registration does not create notification storm | Physical Android + Physical iPhone | Refresh/re-POST sends 0 extra alerts | Physical devices & staging unavailable *(DB/worker verified in `PG-NOTIF` `[11/12]`)* | **`NOT RUN`** | `0948ee56275733ef3ec1ecdce0857d358f6d0e1e` |
| `PD-11` | Repeated ready updates & 60s anti-flap policy | Physical Android + Physical iPhone | Rapid `ready -> almost -> ready` within 60s suppressed | Physical devices & staging unavailable *(DB verified in `PG-NOTIF` `[3/8]`)* | **`NOT RUN`** | `0948ee56275733ef3ec1ecdce0857d358f6d0e1e` |
| `PD-12` | Unsubscribe before dispatch prevents new sends | Physical Android + Physical iPhone | `0` pushes sent after unsubscribe | Physical devices & staging unavailable *(DB verified in `PG-NOTIF` `[6/8]`, `[10/12]`)* | **`NOT RUN`** | `0948ee56275733ef3ec1ecdce0857d358f6d0e1e` |
| `PD-13` | `collected` / `cancelled` tickets suppress unsent alerts | Physical Android + Physical iPhone | Queued/claimed-un-sent work suppressed | Physical devices & staging unavailable *(DB verified in `PG-NOTIF` `[10/12]`)* | **`NOT RUN`** | `0948ee56275733ef3ec1ecdce0857d358f6d0e1e` |
| `PD-14` | Permission denial produces truthful fallback UI | Physical Android + Physical iPhone (and non-installed iOS Safari tab) | Truthful guidance; foreground 8s polling works | Physical devices unavailable *(Chromium CDP verified in `BR-NOTIF` `[E2E 3/4]`)* | **`NOT RUN`** | `0948ee56275733ef3ec1ecdce0857d358f6d0e1e` |
| `PD-15` | Network loss (airplane mode) & reconnect recovery | Physical Android + Physical iPhone | Queued push or `online` listener refreshes ticket | Physical devices & staging unavailable | **`NOT RUN`** | `0948ee56275733ef3ec1ecdce0857d358f6d0e1e` |
| `PD-16` | Multiple test devices follow one ticket without cross-ticket leakage | Physical Android + Physical iPhone | Both receive Ticket A; neither receives Ticket B | Physical devices & staging unavailable | **`NOT RUN`** | `0948ee56275733ef3ec1ecdce0857d358f6d0e1e` |
| `PD-17` | Lock-screen text exposes only vendor + ticket label (zero bearer UUID) | Physical Android + Physical iPhone | Generic ready banner; no `pickup_pagers.id` UUID | Physical devices unavailable *(Ciphertext verified in `PG-NOTIF` `[4/8]`)* | **`NOT RUN`** | `0948ee56275733ef3ec1ecdce0857d358f6d0e1e` |
| `PD-18` | Sample demo creates no real subscriptions, staff events, or pushes | Physical Android + Physical iPhone | `0` network calls or push prompts | Physical devices unavailable *(Verified in `L-DEMO` & `BR-NOTIF` `[E2E 1/4]`)* | **`NOT RUN`** | `0948ee56275733ef3ec1ecdce0857d358f6d0e1e` |

---

### 5. Defect ledger and corrections

| Defect ID | Severity | Reproduction & Concrete Cause on `5c63cbf` | Impact | Fix Commit | Regression Test Added | Retest Result |
|---|---|---|---|---|---|---|
| **`DEF-01`** | Medium | `GET /api/trucks/nearby?lat=38.4404&lng=-122.7141` in [`api/trucks/nearby.js`](../api/trucks/nearby.js) omitted `Cache-Control: private, no-store, max-age=0`, and unary `+req.query.lat` coerced blank `?lat=&lng=` to `(0, 0)` (`200` instead of `400`) and accepted out-of-range coordinates (`|lat| > 90`, `|lng| > 180`). | Coordinate-derived responses could be cached by shared intermediaries, and blank/out-of-bounds coordinates returned bogus hub distances instead of `400`. | `0948ee56275733ef3ec1ecdce0857d358f6d0e1e` | [`tests/p1-unified-discovery.integration.cjs`](../tests/p1-unified-discovery.integration.cjs) Part `8c` & [`tests/staging-hatchable-gates.cjs`](../tests/staging-hatchable-gates.cjs) `G1` | Local & PG 18.6: **PASS** (`PG-DISCOVERY`, `PG-STG-PREFLIGHT`); Hosted: **`BLOCKED`** |
| **`DEF-02`** | Medium (Verification & Docs) | Staging probe & gate runner lacked runtime `webpush-crypto` execution, `/__debug/*` non-exposure checks, narrow probe `404`/`403` auth checks, `app.pager_internal` GUC non-leakage check, `moderator != platform_admin` check, notification-table direct-gateway probes, text-only location pin-clearing check in `G8`, and active notification CSRF/outbox/telemetry/worker-secret checks in `G9`; `HATCHABLE_STAGING_RUNBOOK.md` did not document the temporary `31`-route count while `api/_staging_gate_probe.js` is deployed. | Hosted gate execution could have reported `PASS` without exercising those required Phase 2/Phase 3 invariants, or confused operators during the temporary 31-route probe window. | `0948ee56275733ef3ec1ecdce0857d358f6d0e1e` | [`scripts/staging-runtime-probe.template.js`](../scripts/staging-runtime-probe.template.js), [`tests/staging-hatchable-gates.cjs`](../tests/staging-hatchable-gates.cjs), [`scripts/staging-cleanup.sql`](../scripts/staging-cleanup.sql), [`docs/HATCHABLE_STAGING_RUNBOOK.md`](./HATCHABLE_STAGING_RUNBOOK.md) | Local preflight (`PG-STG-PREFLIGHT`): **PASS**; Hosted: **`BLOCKED`** |
| **`DEF-03`** | Medium (Client Resilience & E2E Isolation) | Live GitHub Actions Run `44049995512` timed out at `15s` in `discovery-browser.e2e.cjs` when external `unpkg.com` Leaflet CDN stalled; in [`public/app.js`](../public/app.js), `init()` called `L.map(...)` unconditionally (throwing `ReferenceError: L is not defined` if `unpkg.com` fails) and `applyFilters()` returned early (`if (!map) return;`) before rendering `#truckCards` and `#nearbyCount`. | A third-party `unpkg.com` CDN outage/block broke Truckly's entire List view, detail modal, Owner Mode, and Pickup Pager initialization instead of degrading only the interactive map, and caused CI browser E2E flakiness. | `fa4e40affb574d3da5a98e4874b301ad5251e17c` | Blocked `*://unpkg.com/*` in [`tests/discovery-browser.e2e.cjs`](../tests/discovery-browser.e2e.cjs) & [`tests/pager-notifications-browser.e2e.cjs`](../tests/pager-notifications-browser.e2e.cjs) to verify CDN-offline rendering on every run | Local (`RETEST-LOCAL-FINAL`) & Remote CI (`CI-GHA-FINAL` Run `44050906767`): **PASS**; Hosted: **`BLOCKED`** |

---

### 6. Notification measurements

> **Measurement Caveat (Not a Production SLA):** The timings below were measured on `2026-11-17T08:45:09.975Z` against disposable local `PostgreSQL 18.6` and a local `127.0.0.1` HTTP loopback receiver on `Node.js v24.19.0` (`0948ee56275733ef3ec1ecdce0857d358f6d0e1e`). They exclude WAN TLS handshakes to Google FCM / Apple Web Push / Mozilla Autopush, Hatchable serverless cold starts, external scheduler cadence intervals, and mobile OS power-management delays.

| Metric | Sample Size | Observed Local Measurement | Hosted / Real-Device Status |
|---|---:|---|---|
| **Atomic ready transition + outbox enqueue (`POST /api/pager/update` tx)** | `n = 1` | **`8.93 ms`** | **`BLOCKED`** |
| **Single-item worker tick (`claimDueDeliveryWave` + `prepareClaimForDispatch` + ECDH/AES-128-GCM encrypt + ES256 VAPID sign + loopback HTTP `201` + `acknowledgeClaimedDelivery`)** | `n = 1` | **`75.68 ms`** (`72.87 ms` transition-to-loopback-accept) | **`BLOCKED`** |
| **15-item backlog drain (`batchSize = 15`, `concurrency = 3` -> 5 waves of 3 + `purgeExpiredNotificationRecords`)** | `n = 15` | **`164.19 ms` total** (**`10.95 ms / delivery`** avg; `aborted_lease_expired = 0`, `fenced_stale_acks = 0`) | **`BLOCKED`** |
| **Execution budget stop (`12` slow `180ms` items, `600ms` budget, `1s` lease)** | `n = 12` (`PG-NOTIF` `[9/12]`) | Stopped cleanly at wave boundary (`budget_exhausted = true`, `aborted_lease_expired = 0`); parallel 2-worker drain completed all `12` with `0` duplicate provider calls | **`BLOCKED`** |
| **Crash-after-send lease recovery (`WORKER_LEASE_SECONDS = 45`)** | `n = 1` (`PG-NOTIF` `[5/8]`) | Active lease respected at `+10s` (`claimed = 0`); recovered & delivered at `+46s` with identical `Topic` & `event_id` | **`BLOCKED`** |
| **`404` / `410 Gone` invalidation & key scrubbing** | `n = 1` (`PG-NOTIF` `[6/8]`) | Deterministic simulated `410` marked delivery `failed_permanent` and scrubbed `endpoint_url`, `p256dh_key`, and `auth_secret` to `NULL` | Live provider `410`: **`NOT RUN`** |

- **Provider Acceptance vs Confirmed Device Display:** An HTTP `201` from FCM, Mozilla Autopush, or Apple Web Push indicates **provider acceptance into its store-and-forward queue only** — it does **not** guarantee immediate or eventual display on a user's screen (devices may be offline, in Low Power / Doze mode, or have OS-level notification banners muted). Physical-device arrival latency remains **`NOT RUN`**.
- **Scheduler Cadence Latency Impact:** Total customer alert latency equals `(scheduler tick interval queuing delay) + (worker execution + provider WAN RTT) + (OS push delivery)`. Note that standard 5-field cron schedulers (such as GitHub Actions scheduled workflows) only support **`>= 60s` intervals** (typically delayed further under load), whereas achieving a `10–15s` alert target requires either a platform/cloud sub-minute trigger or a supervised 1-minute runner invoking `scripts/run-pager-worker.cjs --max-ticks 4 --interval-ms 12000` (provided the runner environment permits a ~48-second job). This must be verified on the actual hosting scheduler in Phase 4.

---

### 7. Cleanup evidence

- **Production Untouched:** Confirmed zero connections, HTTP requests, SQL statements, or deployments targeted `proj_MEO518rmLLl0` or `https://truckly.hatchable.site` (`assertNotProductionUrl` and `staging-runtime-probe.template.js` hard-block both).
- **Hosted Staging Resources:** None created (`BLOCKED` prior to Phase 2).
- **Repository & Route Hygiene (`fa4e40affb574d3da5a98e4874b301ad5251e17c`):**
  - Permanent API route file count in `api/`: **exact `30`** `.js` files.
  - Ephemeral probe (`api/_staging_gate_probe.js`) in `api/`: **absent (`0`)**.
  - Secrets, cookies, VAPID private keys, or bearer pager UUIDs in `public/`, `api/`, `lib/`, `tests/`, or `docs/`: **`0`**.
- **Cleanup Script Verification (`PG-STG-PREFLIGHT`):** Executed [`scripts/staging-cleanup.sql`](../scripts/staging-cleanup.sql) after running all `G1`–`G9` and `E2E1`–`E2E6` mutations against real PostgreSQL `18.6`, confirming `0` remaining `[STG-E2E-%]` bookings, `0` remaining `STG-%` pagers/subscriptions/events/deliveries, and `0` remaining `[STG-E2E-%]` community submissions while preserving all `59` active canonical vendors.

---

### 8. Release and incident procedure (Proposal Only — Do Not Execute Until Unblocked)

1. **Backup & Restore Prerequisite:**
   - Capture a verified full `pg_dump -Fc` snapshot of the target database and test restoring it into a disposable database **before** running any production migration.
2. **Migration & Deployment Order:**
   - Apply additive SQL migrations `011` → `012` → `013` → `014` → `015` → `016` sequentially within a maintenance window; verify `0` errors and inspect quarantined/unmapped counts per [`docs/BACKEND_SECURITY_HARDENING.md`](./BACKEND_SECURITY_HARDENING.md).
   - Seed verified `platform_roles` and `vendor_memberships` for authorized operator/vendor Hatchable `user.id`s.
   - Deploy `hatchable.toml`, `lib/*.js`, `api/**/*.js` (`30` routes), and `public/**` with **`TRUCKLY_ENV=production`**, **`TRUCKLY_RELEASE_SHA=<40-char-sha>`**, and **`TRUCKLY_PUSH_PROVIDER_MODE=disabled`** initially (never deploy `scripts/`, `tests/`, or `api/_staging_gate_probe.js`).
3. **Post-Deployment Smoke Checks (While Push Remains Disabled):**
   - Verify `GET /api/trucks` returns `200` (`total: 59`, `primary_total: 47`), `GET /api/trucks/estrella` returns `404`, anonymous `GET /api/owner/stats` returns `401`, `GET /api/community/list` omits private fields, and `GET /api/pager/telemetry` (as `platform_admin`) reports `release_sha` matching the deployed commit and `controls.provider_mode === "disabled"`, `controls.config_valid === true`.
4. **Controlled Notification Activation:**
   - Provision production-only `TRUCKLY_VAPID_PUBLIC_KEY`, `TRUCKLY_VAPID_PRIVATE_KEY`, `TRUCKLY_VAPID_SUBJECT`, and `TRUCKLY_NOTIFICATION_WORKER_SECRET` (`>= 24` chars, distinct from staging secrets) in Hatchable's secret manager.
   - Set `TRUCKLY_PUSH_PROVIDER_MODE=webpush`, redeploy/recycle functions, enable the verified external scheduler (`POST /api/pager/worker`), and confirm `GET /api/pager/telemetry` shows `provider_enabled: true`, `expired_leases: 0`, and `failed_permanent: 0`.
5. **Monitoring Ownership:**
   - Assign an on-call operator to monitor `GET /api/pager/telemetry` (`deliveries.queued`, `deliveries.expired_leases`, `deliveries.failed_permanent`, `recent_redacted_errors`) and scheduler HTTP `200` health; alert if `expired_leases > 0` for 2 consecutive minutes, `queued > 20` for > 60 seconds (indicating a stopped scheduler or provider outage), or `controls.config_valid === false`.
6. **Pause Behavior & Explicit In-Flight Limitations:**
   - **Pause dispatch:** Stop the external worker scheduler and/or set `TRUCKLY_DISABLE_NOTIFICATION_DELIVERY=1` (requires function redeploy/recycle on serverless platforms unless hot-reload is verified).
   - **Pause new subscriptions:** Set `TRUCKLY_DISABLE_SUBSCRIPTIONS=1` and redeploy/recycle (`POST /api/pager/subscriptions` returns `503`; `GET` status and `DELETE` unsubscribe continue working).
   - **Important operational limits (not instantaneous cancellation):** Stopping the scheduler does **not** abort worker invocations or outbound HTTP `fetch()` requests already in flight; environment variable changes may require function recycling/redeployment to take effect; and Web Push notifications already accepted (`201`) by FCM/Mozilla/Apple **cannot be recalled**.
7. **Security-Preserving Rollback / Recovery:**
   - **Default (Tier 1):** Keep migrations `011`–`016`, RBAC, and `FORCE ROW LEVEL SECURITY` intact; pause affected write scopes via `TRUCKLY_PAUSE_WRITES=<scope>` (`bookings`, `pagers`, `community`, `owner`, `notifications`, or `all`) + redeploy.
   - **Last-Resort Legacy Revert (Tier 2):** Only if forced to revert to pre-hardening `8bbbbe3`, follow [`docs/BACKEND_SECURITY_HARDENING.md`](./BACKEND_SECURITY_HARDENING.md) Section 5 (`scripts/rollback-legacy-8bbbbe3-compat.sql`), understanding that Tier 2 removes P0 booking/community DB guards.

---

### 9. Remaining decisions and limitations

| # | Unresolved Item | Impact | Owner | Exact Next Action Required |
|---|---|---|---|---|
| 1 | **Isolated Hatchable staging project & credentials** | Blocks all hosted runtime gates (`HOSTED-G1`–`HOSTED-G9`) and hosted transaction/RLS/gateway verification | Platform / Project Owner | Designate an existing isolated Hatchable staging project (or approve creating a blank staging project after confirming any Hatchable plan/billing cost), deploy `fa4e40affb574d3da5a98e4874b301ad5251e17c` with `TRUCKLY_ENV=staging`, sign in 7 disposable test personas into a local non-committed `.env.staging`, and run `node --env-file=.env.staging tests/staging-hatchable-gates.cjs --require-live`. |
| 2 | **Hosting scheduler cadence & function timeout measurement** | Blocks `HOSTED-SCHEDULER` and determines achievable background alert latency (`10–15s` vs `>= 60s`) | Platform / Ops | Measure actual Hatchable function timeout on staging and verify the supported external scheduler's minimum trigger cadence against `POST /api/pager/worker`; if only 1-minute cron is available without multi-tick runner support, approve either a supervised sub-minute runner or a revised alert-latency target. |
| 3 | **Physical Android & iPhone (`iOS 16.4+` Home Screen PWA) Web Push execution** | Blocks `PD-01`–`PD-18` (live FCM/APNs Web Push interoperability, lock-screen display, tap routing, and live `410` behavior) | QA / Operator with Physical Devices | Provision staging VAPID keys (`TRUCKLY_PUSH_PROVIDER_MODE=webpush`) on isolated staging and execute `PD-01`–`PD-18` on a designated Android Chrome phone and a designated iPhone running `iOS 16.4+` with Truckly added to the Home Screen. |
| 4 | **Platform scope boundary: Web Push vs Native Mobile Push** | Non-installed iOS Safari browser tabs cannot receive Web Push (`Add to Home Screen` required by Apple WebKit); native APNs/FCM requires a packaged mobile app | Product | Retain current truthful iOS Home Screen install guidance + foreground 8s live polling for web release; schedule packaged Capacitor/native APNs+FCM app only if non-PWA mobile background push is required later. |
