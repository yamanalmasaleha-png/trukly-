# Truckly Standalone VPS Staging & Physical-Device Release Verification Report

**Report Generated:** `2026-11-17T13:42:00-08:00` · **Updated After Domain & HTTPS Verification:** `2026-11-19T05:10:00-08:00` (`2026-11-19T13:10:00Z`)
**Repository:** `https://github.com/yamanalmasaleha-png/trukly-/`
**Branch:** `migrate/vps-standalone-staging`
**Verified & Deployed Executable Candidate SHA:** `614dc997e1b903c94948dc7ff13d02e51c434acd`
**Canonical Staging Origin:** `https://staging.biteshark.live` *(root holding page at `https://biteshark.live`; `www.biteshark.live` redirects to `https://biteshark.live`)*
**Historical Hatchable Baseline Record (Preserved Separately):** [`docs/RELEASE_VERIFICATION_REPORT.md`](./RELEASE_VERIFICATION_REPORT.md#historical-archive--hatchable-candidate-verification-record-fa4e40affb574d3da5a98e4874b301ad5251e17c) (`fa4e40affb574d3da5a98e4874b301ad5251e17c` / report `3f89401e11ff4c0d376e58e1df216a8b0ee5ce13`)
**Production & Co-Tenant Guard Status:** Hatchable production (`proj_MEO518rmLLl0` / `https://truckly.hatchable.site`), `origin/main` (`4836520029e91e952fb1817595ee961c67514e6a`), and all existing VPS co-tenant workloads (`lifestyle-api` / `pm2-matt`, `velvet_key_db` / `velvet_key_user`, `qwen-worker`, `/usr/bin/node v18.19.1`, default Nginx `:80` routing, `/root/.pm2`, SSH, and `ufw`) remained **untouched and healthy**.

---

## 1. Release decision

**Decision: `BLOCKED`** *(public HTTPS staging at `https://staging.biteshark.live`, root holding page at `https://biteshark.live`, Let's Encrypt TLS & auto-renewal dry-run, all `11/11` public HTTPS gates + `6/6` E2E flows, and real two-browser HTTPS login/publish/logout checks **PASSED**; production release review remains blocked only on an off-server encrypted backup destination and designated physical Android + iPhone `iOS 16.4+` Home Screen PWA Web Push checks `PD-01`–`PD-18`)*.

- **What Passed on the Live VPS & Public HTTPS Origin (`614dc997e1b903c94948dc7ff13d02e51c434acd`):**
  - Cryptographic artifact-to-source parity across all `120` deployed runtime files (`0` extra, `0` modified) and live `/proc/<pid>/cwd` verification for both `truckly-staging-api.service` and `truckly-staging-worker.service`.
  - Authoritative DNS (`nsa1`–`nsa4.squarespacedns.com`), public DNS (`1.1.1.1`, `8.8.8.8`, `9.9.9.9`), 3-SAN Let's Encrypt ECDSA certificate (`biteshark.live`, `www.biteshark.live`, `staging.biteshark.live`, valid `2026-11-19` → `2027-02-17`), `certbot renew --dry-run`, HTTP→HTTPS & `www`→root canonical redirects (with `/.well-known/acme-challenge/` exempted), isolated root holding page (`https://biteshark.live`), and `TRUCKLY_PUBLIC_ORIGIN=https://staging.biteshark.live` (`TRUCKLY_TRUST_PROXY=loopback`).
  - All `11` standalone VPS gates (`G1`–`G9`, `VPS_G10`–`VPS_G11`) and all `6` end-to-end flows (`E2E1`–`E2E6`, including live `TRUCKLY_PAUSE_WRITES=bookings,community`) executed both on loopback (`run_id=a1b6cfec`) and **end-to-end over public HTTPS `https://staging.biteshark.live` (`run_id=4b45084f`)**, plus two real `Chrome/157.0.8103.51` browser sessions over public HTTPS (`www`→root redirect, `59` listings, `/sw.js` scope `https://staging.biteshark.live/`, `/manifest.json` `standalone`, real `/login.html` OTP login + `__Host-truckly_session` TLS cookie, Owner Mode publish → Customer refresh, `/#pager-ref` tap routing, and logout revocation).
  - Live `systemd` worker supervision (`10.4` hours uninterrupted soak across `3,750` 10-second ticks, plus live subscription pause, delivery pause with durable queued outbox, terminal `collected` ticket suppression, RFC 8291/8292 encrypted drain, `410` key scrubbing & redacted telemetry, overlap safety, and `kill -9` `SIGKILL` `systemd` auto-restart + retry/lease recovery).
  - Live `systemd` GPG-encrypted PostgreSQL backup (`AES256`, confirmed running automatically via `truckly-staging-backup.timer` on `2026-11-18` and `2026-11-19`) + SHA-256 verification + actual `pg_restore` into disposable `truckly_staging_restore_verify`.
- **What Remains `BLOCKED` / `NOT RUN`:**
  1. Off-server encrypted backup replication (`BACKUP-OFFSITE`).
  2. Live Web Push provider (`FCM` / `Apple Web Push` with staging VAPID keys) and designated physical-device verification (`PD-01`–`PD-18` on physical Android Chrome and physical iPhone `iOS 16.4+` Home Screen PWA).
- **Governance Note:** Production readiness is **not** claimed, and even `READY FOR PRODUCTION REVIEW` does **not** authorize production deployment or cutover.

---

## 2. Candidate and environment identity

### 2.1 Baseline Reconciliation & Commit Lineage

| Milestone | Branch | Commit SHA | Scope |
|---|---|---|---|
| Frozen Hatchable executable baseline | `improve/p1-audit-and-pager-notifications` | `fa4e40affb574d3da5a98e4874b301ad5251e17c` | Frozen Phase 1–3 application code prior to VPS portability work |
| Historical Hatchable report commit | `improve/p1-audit-and-pager-notifications` | `3f89401e11ff4c0d376e58e1df216a8b0ee5ce13` | Documentation-only update to `docs/RELEASE_VERIFICATION_REPORT.md` (`0` code diff vs `fa4e40a`) |
| Standalone VPS runtime & auth adapter | `migrate/vps-standalone-staging` | `dfab57f879e7a0bd61e2401b3d03483d21c6c823` | `server/*`, `packages/hatchable-adapter`, migration `017`, `lib/standalone-auth.js`, `lib/client-ip.js`, `deploy/*`, `tests/vps-staging-gates.cjs` |
| Pre-install security review fixes (`REV-01`–`REV-05`) | `migrate/vps-standalone-staging` | `b6dcf2459f5ecc3c2b00e5f1b8006842b11f8825` | Public-route session skip, `https:` Referer + `TRUCKLY_PUBLIC_ORIGIN` CSRF, loopback mailbox guard, partial unique OTP index, append-only `audit_logs` grants |
| Linux archive & backup stream fixes (`DEF-VPS-01`–`02`) | `migrate/vps-standalone-staging` | `bc6a607168fe89d4ab9d0abbadb9e4e8404ba3c9` → `16594e95a556aec29f12c79bc70de0db4432d36f` | `.gitattributes` LF enforcement, `0700` root `pg_dump` stream, CRLF/LF-tolerant migration checksum verification |
| **Final Verified & Deployed Executable Candidate (`DEF-VPS-03`)** | `migrate/vps-standalone-staging` | **`614dc997e1b903c94948dc7ff13d02e51c434acd`** | Default `TRUCKLY_TRUST_PROXY=none` until Nginx reverse-proxy activation + regression test (GHA Run `44180486982` `success`) |

### 2.2 Staging Deployment & Host Identity

| Attribute | Recorded Value |
|---|---|
| **Staging Host** | Shared Linode VPS (`<linode-vps-ipv4>`, `Ubuntu 24.04.3 LTS`, `1 vCPU`, `961 MiB` RAM, `496 MiB` swap, `25 GiB` ext4) |
| **Deployed Executable SHA** | `614dc997e1b903c94948dc7ff13d02e51c434acd` (`git status --porcelain` clean) |
| **Linux Release Tarball SHA-256** | `8d23f085c4038de4306d8da2988d9ec5c42f75d805a1d96396c931d6412493cb` (`sha256sum -c` verified on host before extraction) |
| **Artifact-to-Source Proof (120 Deployed Files)** | Composite manifest SHA-256 `3bef048c70e3deb353ed26441d9d0a481d91e680b696d3ce94c530f48d852c1d` (`120` deployed files under `/srv/truckly-staging/current`, `0` extra files, `0` SHA-256 mismatches vs `git archive 614dc997e1b903c94948dc7ff13d02e51c434acd`; `tests/` and `scripts/dev-server.cjs` absent from host) |
| **Dependency Lockfile & Audit** | [`package-lock.json`](../package-lock.json) SHA-256 `446378fce11243f42a458e0c61cdd2bf827e083eb67cf7194805f7a1095163f2` (`25` pure-JS prod packages via `npm ci --omit=dev --ignore-scripts`: `pg@8.23.1`, `otplib@13.6.0`, `cookie@1.1.1`, `hatchable@file:packages/hatchable-adapter`; `npm audit`: `0` vulnerabilities) |
| **Isolated Runtime Versions** | `/opt/nodejs/node-v22.23.5-linux-x64/bin/node` (`v22.23.5`, `npm 10.9.9`, symlink `/opt/nodejs/node-v22-lts`); system `/usr/bin/node` untouched at `v18.19.1` |
| **System User & Release Path** | `truckly-stg` (`uid=997`, `gid=987`, `/nonexistent`, `/usr/sbin/nologin`); `/srv/truckly-staging/current` → `/srv/truckly-staging/releases/614dc997e1b903c94948dc7ff13d02e51c434acd` (`root:root`, mode `0755`/`0644`, verified `/proc/<pid>/cwd` for live API & worker PIDs) |
| **`systemd` Units** | `truckly-staging-api.service` (`MemoryMax=192M`, `CPUQuota=60%`), `truckly-staging-worker.service` (`--continuous --interval-ms 10000 --batch-size 15 --cleanup-every 30`, `Restart=always`, `RestartSec=5`, `MemoryMax=128M`, `CPUQuota=30%`), `truckly-staging-backup.service` + `truckly-staging-backup.timer` (`09:40 UTC` daily) |
| **Listening Sockets & Exposure** | Truckly API: `127.0.0.1:4100` **loopback only** (external TCP `:4100` verified unreachable; default Nginx `:80 /api/trucks` returns `404`); PostgreSQL `16.15`: `127.0.0.1:5432` & `[::1]:5432` loopback only |
| **Nginx Hostname & TLS Metadata** | `/etc/nginx/sites-available/biteshark.live` (`-> z-biteshark.live`: `https://biteshark.live` holding page + `www` `301`) & `/etc/nginx/sites-available/staging.biteshark.live` (`-> z-staging.biteshark.live`: `https://staging.biteshark.live` → `127.0.0.1:4100`); Let's Encrypt ECDSA (`Issuer: YE2`, SANs `biteshark.live, staging.biteshark.live, www.biteshark.live`, serial `0566222a76d1b778fbf102eaeb56b53a2c4f`, valid `2026-11-19` → `2027-02-17`); `certbot renew --dry-run` `success`; `lifestyle-api` default `:80` untouched |
| **Health Endpoint Identity** | `GET https://staging.biteshark.live/api/healthz` → `200 OK` `{"status":"ok","db":"ready","env":"staging","release_sha":"614dc997e1b903c94948dc7ff13d02e51c434acd","domain_routes":30}` (`Cache-Control: private, no-store, max-age=0`) |
| **Remote CI & Local Browser Harness** | GitHub Actions `ubuntu-latest` (`Node 22`, `PostgreSQL 16`, Headless Chromium): Run `44180486982` `completed / success` on `614dc99`; Local browser runner: `Headless Chrome/157.0.8103.51` on Windows 10 directly over TLS 1.3 against `https://staging.biteshark.live` (`0` browser processes on VPS) |
| **Physical Test Devices** | Physical Android (`Chrome`): **Unavailable (`NOT RUN`)** · Physical iPhone (`iOS/iPadOS 16.4+` Home Screen PWA): **Unavailable (`NOT RUN`)** |
| **Verification Window (UTC)** | Loopback & worker soak: `2026-11-17T10:44:40Z` – `2026-11-17T21:40:01Z` · Public DNS, Let's Encrypt TLS & HTTPS suite: `2026-11-19T12:54:08Z` – `2026-11-19T13:09:17Z` |

### 2.3 PostgreSQL Roles, Effective Privileges & Applied Migrations (`truckly_staging`)

- **Database Ownership & Isolation:** `truckly_staging` owned by `truckly_stg_migrator` (`REVOKE ALL ON DATABASE truckly_staging FROM PUBLIC`; `REVOKE CREATE ON SCHEMA public FROM PUBLIC`; `velvet_key_db` and `velvet_key_user` untouched).
- **Migration Role (`truckly_stg_migrator`):** `LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS CONNECTION LIMIT 4` (stored only in `0600 root:root /etc/truckly-staging/migrator.env`; never loaded by API or worker).
- **Application Role (`truckly_stg_app`):** `LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS CONNECTION LIMIT 12`; DML-only on application tables, `UPDATE`/`DELETE` explicitly revoked on append-only `audit_logs`, `ALL` revoked on `schema_migrations`, and subject to **`FORCE ROW LEVEL SECURITY`** across all `10` protected tables (`auth_users`, `auth_otp_challenges`, `auth_sessions`, `auth_rate_limits`, `auth_staging_mailbox`, `community_reviews`, `pager_notification_subscriptions`, `pager_notification_events`, `pager_notification_deliveries`, `pager_rate_limits`).

| Migration Filename | Recorded `schema_migrations.checksum_sha256` on VPS | Applied Timestamp (UTC) |
|---|---|---|
| `001_create_bookings.sql` | `504752fb30ed492f2ddf368c9564d808478c98ea5b8e45284e3100624e0e2d54` | `2026-11-17T10:34:14.761Z` |
| `002_create_truck_settings.sql` | `82774792c7494d89bb54ba512146bfb70d4246b2cc367d4e71299cdfadfe9dfc` | `2026-11-17T10:34:14.767Z` |
| `003_create_favorites.sql` | `acbad7e0c9fb01b73f812e7a2dbfb30e0f16f5c3b3dc8f57e1d6fec28d48c36a` | `2026-11-17T10:34:14.771Z` |
| `004_create_notification_settings.sql` | `d6fefeda33ebe4d587695b7e975aae5892dd6816c924dece5ae68e67cdb10e13` | `2026-11-17T10:34:14.774Z` |
| `005_create_owner_profiles.sql` | `8350916237fbb81fb79fc95e6b4165b6b437e979b8fbe933585dafaa0166458f` | `2026-11-17T10:34:14.778Z` |
| `006_create_owner_schedule.sql` | `f9c5b84e2c530aa997195ccd086ed16cdd92b51909be4a70a0b705e840eef93d` | `2026-11-17T10:34:14.783Z` |
| `007_add_booking_packages.sql` | `21ecf6a0e604efc896d6751658e0caa2f026fec31f46e88bff49d207a9bff33f` | `2026-11-17T10:34:14.787Z` |
| `008_pickup_pagers.sql` | `0fe78e3ba4a9cda55cc2a6bdb0ca30e037740595d86bcbea4c5c1cdcf7ba7ca6` | `2026-11-17T10:34:14.789Z` |
| `009_create_community_reviews.sql` | `912a32fc851320cb367f36e11c67948960b45b5ab34c310e369c93dad1472dfa` | `2026-11-17T10:34:14.793Z` |
| `010_allow_community_whispers.sql` | `a6cb18f12b0ef6af3e71fdad05b6abb0a9d740f3136b1cc9e32d39df2dd8ce4f` | `2026-11-17T10:34:14.799Z` |
| `011_vendor_authz_and_audit.sql` | `c9ed25c51867f2d93a24ba79470bb681ebf3391a279e53033f6b507bbc63a2ee` | `2026-11-17T10:34:14.801Z` |
| `012_harden_bookings.sql` | `06e3cf53a432a1ea3d6dae343384ae7b5075b21dcb0f5fbbd527e80a5cff6515` | `2026-11-17T10:34:14.824Z` |
| `013_harden_community_privacy.sql` | `ae01e99233f9230840742c741ad6bda69a6a262a88f4ff711e340011c00287cb` | `2026-11-17T10:34:14.830Z` |
| `014_unified_discovery_catalog.sql` | `027ecabb21a618bdae4c555f73a1e3ed82874dc427aa35a342c2a29338bc6614` | `2026-11-17T10:34:14.835Z` |
| `015_pager_notifications_outbox.sql` | `a4a56d74617c0f5d198386ab52d69e4f2f634a2d8cddd8e5109746c635ad04ba` | `2026-11-17T10:34:14.851Z` |
| `016_pager_worker_fencing_and_catchup.sql` | `67a268b7543b1ea3326e57c5aa37e7ed5c7aa2bd2bd7d1ba9ea6dd98e0853693` | `2026-11-17T10:34:14.874Z` |
| `017_standalone_auth_and_sessions.sql` | `f827b44178c94ff4d9ff21e12b7fb8a401216443fe734c5883e24a1c1ec856f9` | `2026-11-17T10:34:14.882Z` |

---

## 3. Six-item status table (Standalone VPS Path)

| # | Improvement Item | Implementation | Local & CI Verification | VPS-Hosted Public HTTPS Verification (`614dc99`) | Real Provider / Physical-Device Verification | Evidence Reference | Remaining Blocker on VPS Path |
|---|---|---|---|---|---|---|---|
| 1 | **Vendor authorization** (`owner` vs `staff`, `FOR SHARE` lock serialization, standalone `017` OTP/session auth) | Complete (`011`, `017`, `lib/authz.js`, `lib/standalone-auth.js`) | **PASS** (PG 18.6 & GHA PG 16 Run `44180486982`) | **PASS** (`HTTPS-GATES` `G4`/`VPS_G11`, `HTTPS-AUTH-BROWSER`, `VPS-AUTH-DYN-RBAC`) | N/A | `HTTPS-GATES` (`run_id=4b45084f`), `HTTPS-AUTH-BROWSER` | None *(staging HTTPS verified; production requires separate cutover review)* |
| 2 | **Booking integrity** (Pacific dates, server package terms/guest caps, requester ownership, idempotency, atomic rollback) | Complete (`012`, `api/bookings/create.js`, `lib/dates.js`) | **PASS** (PG 18.6 & GHA PG 16 Run `44180486982`) | **PASS** (`HTTPS-GATES` `G2`, `E2E1`, `E2E3`, `E2E5`) | N/A | `HTTPS-GATES` (`run_id=4b45084f`) | None *(staging HTTPS verified)* |
| 3 | **Community privacy** (`FORCE ROW LEVEL SECURITY`, moderator vs admin separation, metadata redaction, zero direct gateway) | Complete (`013`, `api/community/*`, `server/routes.js`) | **PASS** (PG 18.6 & GHA PG 16 Run `44180486982`) | **PASS** (`HTTPS-GATES` `G3`, `G5`, `G6`, `E2E4`) | N/A | `HTTPS-GATES` (`run_id=4b45084f`) | None *(staging HTTPS verified)* |
| 4 | **Owner publishing** (profile, schedule, GPS & text-only pin clearing, clock-aware `ETag`s, `private, no-store` coords) | Complete (`014`, `lib/discovery.js`, `api/owner/*`) | **PASS** (PG 18.6 + Chrome 157 + GHA Run `44180486982`) | **PASS** (`HTTPS-GATES` `G8`, `VPS-CACHE-ETAG`, `HTTPS-AUTH-BROWSER`) | N/A | `HTTPS-GATES` (`run_id=4b45084f`), `HTTPS-AUTH-BROWSER` | None *(staging HTTPS verified)* |
| 5 | **Unified 59-place directory** (consistent 59 Sonoma listings across list, search, detail, featured, schedule; quarantined `404`; explicit `503`) | Complete (`014`, `lib/discovery.js`, `api/trucks*.js`) | **PASS** (PG 18.6 + Chrome 157 + GHA Run `44180486982`) | **PASS** (`HTTPS-GATES` `G7`, `VPS-CACHE-ETAG`, `HTTPS-AUTH-BROWSER`) | N/A | `HTTPS-GATES` (`run_id=4b45084f`), `VPS-CACHE-ETAG` | None *(staging HTTPS verified)* |
| 6 | **Background pager notifications** (atomic outbox, ready catch-up, wave-fenced leases, `systemd` 10s worker, RFC 8291/8292 Web Push, `/sw.js`) | Complete (`015`–`016`, `lib/pager-notifications.js`, `scripts/run-pager-worker.cjs`, `public/sw.js`) | **PASS** (PG 18.6 + Chrome 157 + GHA Run `44180486982`) | **PASS** (`HTTPS-GATES` `G9`/`E2E6`, `HTTPS-WORKER-403`, `VPS-WRK-SOAK`, `VPS-WRK-PAUSE-DRAIN`, `VPS-WRK-SIGKILL`) | **`BLOCKED` / `NOT RUN`** (`PD-01`–`PD-18`) | `HTTPS-GATES`, `HTTPS-WORKER-403`, `VPS-WRK-SIGKILL` | Staging VAPID keys + physical Android Chrome & iPhone `iOS 16.4+` Home Screen PWA (`PD-01`–`PD-18`) |

---

## 4. Executed evidence matrix

### 4.1 CI, Artifact Integrity & Standalone VPS Runtime / Security Checks

| Test ID | Environment | Expected Result | Observed Result | Status | Timestamp (UTC) | Tested SHA | Sanitized Evidence Ref |
|---|---|---|---|---|---|---|---|
| `CI-GHA-614DC99` | GitHub Actions (`ubuntu-latest`, Node 22, PG 16, Headless Chromium) | All 3 CI jobs (`Pager demo + source syntax`, `Catalog & UX`, `Real PostgreSQL + Chrome E2E`) succeed | Run `44180486982`: all 3 jobs / 10 test suites `completed / success` (`npm audit`: `0` vulns) | **PASS** | `2026-11-17T21:31:52Z` | `614dc997e1b903c94948dc7ff13d02e51c434acd` | GHA Run `44180486982` |
| `VPS-ART-PARITY` | Live VPS `/srv/truckly-staging/current` + `/proc/<pid>` vs local `git archive` | Running `node` processes execute inside `/srv/truckly-staging/releases/614dc99...` with `0` file SHA-256 diffs vs Git | `api_pid` & `worker_pid` `/proc/*/cwd` verified; `120/120` deployed files matched Git byte-for-byte (`3bef048c70e3...`, `0` extra, `0` mismatches) | **PASS** | `2026-11-17T21:30:50Z` | `614dc997e1b903c94948dc7ff13d02e51c434acd` | Section 2.2 manifest SHA |
| `VPS-NET-EXPOSURE` | Remote client → `<linode-vps-ipv4>:4100` & `:80`, plus host `ss -tulnp` | `:4100` bound to `127.0.0.1` only (closed externally); default Nginx `:80 /api/trucks` returns `404` | `ss -tulnp` confirmed `127.0.0.1:4100` & `127.0.0.1:5432`; external TCP `:4100` `False` (closed); external `:80 /api/trucks` `404` | **PASS** | `2026-11-17T21:10:18Z` | `614dc997e1b903c94948dc7ff13d02e51c434acd` | Host socket & remote TCP check |
| `VPS-G1` | Live VPS (`127.0.0.1:4100`) | `30` domain routes load `lib/*.js` & `node:crypto` RFC 8291/8292; `15` helper/script/debug paths return `404`; `no-store` enforced | `G1_runtime_compatibility`: `PASS` (`run_id=a1b6cfec`) | **PASS** | `2026-11-17T21:32:40Z` | `614dc997e1b903c94948dc7ff13d02e51c434acd` | Stage 1 `run_id=a1b6cfec` |
| `VPS-G10` | Live VPS (`127.0.0.1:4100`) | `/api/healthz` returns `200` (`db: ready`, `domain_routes: 30`, no secrets); `15` traversal/dotfile/internal paths blocked (`404`); `/login.html` discloses deferred passkeys | `VPS_G10_standalone_health_and_filesystem`: `PASS` | **PASS** | `2026-11-17T21:32:48Z` | `614dc997e1b903c94948dc7ff13d02e51c434acd` | Stage 1 `VPS_G10` |
| `VPS-BODY-METHOD` | Live VPS (`127.0.0.1:4100`) | `>64 KiB` API body & `>8 KiB` auth body return `413`; malformed/array JSON returns `400`; disallowed methods return `405` + `Allow` | `70 KiB` API → `413`; `10 KiB` auth → `413`; `{invalid_json` & `[1,2,3]` → `400`; `DELETE /api/trucks`, `GET /api/pager/worker`, `POST /index.html` → `405` | **PASS** | `2026-11-17T21:32:49Z` | `614dc997e1b903c94948dc7ff13d02e51c434acd` | Stage 1 `runtime_security` |
| `VPS-IMMUTABILITY` | Live VPS (`runuser -u truckly-stg`) | Runtime user `truckly-stg` cannot modify `/srv/truckly-staging/current/server/index.js` or create files in release dir | Both write attempts denied (`EACCES` / `IMMUTABLE_OK`) | **PASS** | `2026-11-17T21:32:51Z` | `614dc997e1b903c94948dc7ff13d02e51c434acd` | Stage 1 `runtime_security` |
| `VPS-CACHE-ETAG` | Live VPS (`127.0.0.1:4100`) | Public `/api/trucks` emits `Cache-Control: public` with `0` `Set-Cookie` even when cookie sent; distinct `ETag`s across 5 query variants; `304` on `If-None-Match`; clock-expiry rotates `ETag` with `0` DB writes | `Set-Cookie: null`; `5/5` distinct `ETag`s (`/api/trucks`, `?summary=1`, `/search?q=tacos`, `?q=coffee`, `?q=tacos&include_extra=0`); `304` verified; live-location expiry rotated `ETag` after `2.6s` with `0` DB writes | **PASS** | `2026-11-17T21:32:54Z` | `614dc997e1b903c94948dc7ff13d02e51c434acd` | Stage 1 `runtime_security` |
| `VPS-XFF-SPOOF-PRE` | Live VPS (`127.0.0.1:4100`) | Rotating `X-Forwarded-For` / `X-Real-IP` headers cannot bypass `start_ip` rate limit | **Failed on `16594e9`**: `staging.env` had `TRUCKLY_TRUST_PROXY=loopback` before Nginx activation (`DEF-VPS-03` filed & fixed in `614dc99`) | **FAIL** *(pre-fix)* | `2026-11-17T21:26:33Z` | `16594e95a556aec29f12c79bc70de0db4432d36f` | Section 5 `DEF-VPS-03` |
| `VPS-XFF-SPOOF-RETEST` | Live VPS (`127.0.0.1:4100`) | Rotating `X-Forwarded-For: 203.0.113.<n>` and `X-Real-IP: 198.51.100.<n>` hit `429` on socket IP | `429 Too Many Requests` enforced (`xff_spoofing_blocked_429: true`) | **PASS** | `2026-11-17T21:32:57Z` | `614dc997e1b903c94948dc7ff13d02e51c434acd` | Stage 1 `auth_and_dynamic_rbac` |

### 4.2 Authentication, Authorization, PostgreSQL Guarantees & Six-Item Functional Gates

| Test ID | Environment | Expected Result | Observed Result | Status | Timestamp (UTC) | Tested SHA | Sanitized Evidence Ref |
|---|---|---|---|---|---|---|---|
| `VPS-G2` | Live VPS (`truckly_staging`) | Single backend PID/XID inside `withTransaction`; failed multi-statement write rolls back `100%` | `G2_transactions`: `PASS` (`0` partial rows persisted) | **PASS** | `2026-11-17T21:32:41Z` | `614dc997e1b903c94948dc7ff13d02e51c434acd` | Stage 1 `run_id=a1b6cfec` |
| `VPS-G3` | Live VPS (`truckly_staging`) | `app.user_id`, `app.can_moderate`, `app.pager_internal`, `app.auth_internal` GUCs do not leak across commit, rollback, pool reuse, or concurrent burst | `G3_identity_context_isolation`: `PASS` | **PASS** | `2026-11-17T21:32:43Z` | `614dc997e1b903c94948dc7ff13d02e51c434acd` | Stage 1 `run_id=a1b6cfec` |
| `VPS-G4` | Live VPS (`127.0.0.1:4100`) | 7 OTP-authenticated personas (`cust-a`, `cust-b`, `va-owner`, `va-staff`, `vb-owner`, `mod`, `padmin`) enforce RBAC, cross-vendor `403`s, staff `403`s, and debug-header immunity | `G4_hosted_identity_and_authz`: `PASS` (`va=sha256:cad4f833b876`, `vb=sha256:e4e147cdcd1e`) | **PASS** | `2026-11-17T21:32:42Z` | `614dc997e1b903c94948dc7ff13d02e51c434acd` | Stage 1 `run_id=a1b6cfec` |
| `VPS-G5` | Live VPS (`truckly_staging`) | `truckly_stg_app` is `NOSUPERUSER`, `NOBYPASSRLS`; `FORCE RLS` enforced across `community_reviews`, `auth_*`, and `pager_notification_*`; `audit_logs` `DELETE` denied | `G5_database_security_role`: `PASS` (`10` `FORCE RLS` tables, `0` bare rows visible, `audit_logs` append-only verified) | **PASS** | `2026-11-17T21:32:40Z` | `614dc997e1b903c94948dc7ff13d02e51c434acd` | Stage 1 `G5` + Stage 2 restore |
| `VPS-G6` | Live VPS (`127.0.0.1:4100`) | Direct table gateway paths (`/api/db/*`, `/_db/*`, `/__hatchable/db/*`, `/rest/v1/*`, `/db/*`) return `404`; public community omits moderation/author fields | `G6_direct_table_gateway`: `PASS` | **PASS** | `2026-11-17T21:32:44Z` | `614dc997e1b903c94948dc7ff13d02e51c434acd` | Stage 1 `run_id=a1b6cfec` |
| `VPS-G7` | Live VPS (`127.0.0.1:4100`) | All `59` canonical Sonoma listings (`47` primary + `12` neighborhood) consistent across list, search, detail & featured; quarantined `estrella` returns `404` | `G7_unified_59_place_discovery`: `PASS` | **PASS** | `2026-11-17T21:32:45Z` | `614dc997e1b903c94948dc7ff13d02e51c434acd` | Stage 1 `run_id=a1b6cfec` |
| `VPS-G8` | Live VPS (`127.0.0.1:4100`) | Vendor A publishes profile, schedule, GPS & text-only location; Customer A sees updates; text-only clears stale pins; `verified` self-elevation returns `403`; coordinate queries `private, no-store` | `G8_owner_publishing_to_customer`: `PASS` | **PASS** | `2026-11-17T21:32:46Z` | `614dc997e1b903c94948dc7ff13d02e51c434acd` | Stage 1 `run_id=a1b6cfec` |
| `VPS-G9` | Live VPS (`127.0.0.1:4100`) | Notification CSRF `403`s, atomic `pager.ready` outbox enqueue, redacted admin-only telemetry, worker Bearer secret auth, and `FORCE RLS` on all 4 notification tables | `G9_cache_refresh_and_outbox_rls`: `PASS` | **PASS** | `2026-11-17T21:32:47Z` | `614dc997e1b903c94948dc7ff13d02e51c434acd` | Stage 1 `run_id=a1b6cfec` |
| `VPS-G11` | Live VPS (`127.0.0.1:4100`) | `__Host-truckly_session` (`HttpOnly; Secure; SameSite=Lax; Path=/; no Domain`), cross-origin `Origin`, `http://` `Referer`, `Sec-Fetch-Site: cross-site`, and form-encoded CSRF `403`s, plus server-side logout revocation | `VPS_G11_standalone_auth_csrf_and_proxy_spoofing`: `PASS` | **PASS** | `2026-11-17T21:32:49Z` | `614dc997e1b903c94948dc7ff13d02e51c434acd` | Stage 1 `VPS_G11` |
| `VPS-AUTH-OTP-SESS` | Live VPS (`127.0.0.1:4100`) | Staging mailbox `404` without/wrong secret; non-allowlisted domain `403`; OTP 5-try lockout, 8-way `Promise.all` single-use (`1` `200`, `7` `401`), replay `401`, expiry `401`; session rotation & disabled-user immediate `401`; zero legacy email takeover | All checks passed (`winners=1, losers=7`, `user_hash=sha256:4750698c45c2`, `zero_legacy_email_takeover=true`) | **PASS** | `2026-11-17T21:32:55Z` | `614dc997e1b903c94948dc7ff13d02e51c434acd` | Stage 1 `auth_and_dynamic_rbac` |
| `VPS-AUTH-DYN-RBAC` | Live VPS (`127.0.0.1:4100` + `truckly_staging`) | Live role downgrade (`owner` → `staff`), vendor deactivation (`is_active = false`), and membership deletion take effect immediately without server restart | `owner` `200` → downgraded `staff` `403` on `/api/owner/profile` (`200` on `/api/pager/staff`) → deactivated `ross` `404` detail / `400` booking / `403` pager → deleted membership `403` (`ross` restored) | **PASS** | `2026-11-17T21:32:56Z` | `614dc997e1b903c94948dc7ff13d02e51c434acd` | Stage 1 `auth_and_dynamic_rbac` |
| `VPS-E2E1`..`E2E6` | Live VPS (`127.0.0.1:4100`) | Pacific booking dates & idempotency (`E2E1`), 5-way concurrent pager retries (`E2E2`), `YYYY-MM-DD` date contract (`E2E3`), moderator vs self-approval (`E2E4`), live `TRUCKLY_PAUSE_WRITES=bookings,community` `503` writes / `200` reads (`E2E5`), sample pager demo `0` writes (`E2E6`) | All `6/6` `PASS` (`ticket=sha256:a0a53ac7951a`) | **PASS** | `2026-11-17T21:32:47Z` | `614dc997e1b903c94948dc7ff13d02e51c434acd` | Stage 1 `e2e` |
| `VPS-BR-LOOPBACK` | Local `Chrome/157.0.8103.51` (2 isolated contexts) → SSH loopback tunnel → Live VPS `:4100` | Owner signs in via `/login.html` DOM OTP, publishes profile/GPS/schedule, signs out; separate anonymous Customer refreshes `/` (`unpkg.com` blocked), verifies `59` listings + List card & Detail modal match + Sample Pager `0` `/api/pager/*` calls | `PASS` (`listings_rendered=59`, `real_login_dom_otp_and_logout=true`, `owner_publish_to_customer_list_and_modal=true`, `sample_pager_demo_api_calls=0`) | **PASS** *(loopback SSH tunnel; NOT public HTTPS)* | `2026-11-17T21:33:04Z` | `614dc997e1b903c94948dc7ff13d02e51c434acd` | Stage 1 `browser_loopback_e2e` |

### 4.3 Live VPS Worker Supervision, Recovery & Backup/Restore Checks

| Test ID | Environment | Expected Result | Observed Result | Status | Timestamp (UTC) | Tested SHA | Sanitized Evidence Ref |
|---|---|---|---|---|---|---|---|
| `VPS-WRK-SOAK` | Live VPS `truckly-staging-worker.service` (`systemd`) | Continuous `10s` loop runs cleanly without restarts, memory leaks, or CPU pressure | `3,750` consecutive ticks over `10h 25m` (`126` 30-tick logs; `10.006s/tick`; `2–3ms` idle duration; `NRestarts=0`; `CPU=0.028%`; `MemoryPeak=37.0 MiB`) | **PASS** | `2026-11-17T21:09:54Z` | `16594e95` / `614dc997` (`0` worker diff) | `journalctl -u truckly-staging-worker` |
| `VPS-WRK-AUTH` | Live VPS (`POST /api/pager/worker`) | Missing or wrong Bearer secret rejected with `401` (`no-store`) | Missing secret → `401`; wrong Bearer secret → `401` | **PASS** | `2026-11-17T21:37:45Z` | `614dc997e1b903c94948dc7ff13d02e51c434acd` | Stage 2 `worker_auth_checks` |
| `VPS-WRK-PAUSE-DRAIN` | Live VPS `systemd` worker + `truckly_staging` + loopback push receiver | `TRUCKLY_DISABLE_SUBSCRIPTIONS=1` returns `503` (status `200`); `TRUCKLY_DISABLE_NOTIFICATION_DELIVERY=1` retains durable `queued` events; `collected` ticket suppressed; resume drains queue with RFC 8291/8292 payload omitting bearer UUID and scrubs `410` keys with redacted telemetry | Sub pause `503` (`status` `200`); delivery pause held `3` durable `queued` rows; after resume, `1` delivered (`aes128gcm` + `vapid`, decrypted payload contained `0` bearer UUIDs), `1` `410` scrubbed keys & logged `provider_410` with `0` URL/secret leak, `1` `collected` ticket suppressed (`0` sends) | **PASS** | `2026-11-17T21:38:18Z` | `614dc997e1b903c94948dc7ff13d02e51c434acd` | Stage 2 `resume_drain_and_redacted_telemetry` |
| `VPS-WRK-SIGKILL` | Live VPS `truckly-staging-worker.service` (`kill -9`) | Overlapping worker claims `0` during active lease; `SIGKILL` triggers `systemd` auto-restart (`RestartSec=5`), active lease respected, and in-flight item recovers & completes with `0` stuck leases | Overlap call returned `claimed=0`; `kill -9 689984` auto-restarted as `PID 691167` (`NRestarts: 0 → 1` in `6,252 ms`); active lease respected; recovered & delivered `201` at `25,773 ms` (`expired_leases=0`) | **PASS** | `2026-11-17T21:38:50Z` | `614dc997e1b903c94948dc7ff13d02e51c434acd` | Stage 2 `sigkill_crash_and_45s_lease_recovery` |
| `VPS-BACKUP-RESTORE` | Live VPS `truckly-staging-backup.service` + `pg_restore` | `pg_dump -Fc` encrypted with `AES256` GPG (`0600`), `.sha256` verified, decrypted & restored via `pg_restore --exit-on-error` into disposable `truckly_staging_restore_verify`, verified & dropped | `truckly_staging-20261117T213900Z.dump.gpg` (`52,782` bytes) verified & restored: `17` migrations, `59` vendors (`47` primary), `10` `FORCE RLS` tables, `0` residual test rows, `audit_logs` `DELETE` denied to `truckly_stg_app`, disposable DB dropped | **PASS** | `2026-11-17T21:39:00Z` | `614dc997e1b903c94948dc7ff13d02e51c434acd` | Stage 2 `backup_and_real_pg_restore` |
| `BACKUP-OFFSITE` | Off-server backup storage | Encrypted `.dump.gpg` + `.sha256` replicated off-host | `TRUCKLY_BACKUP_OFFSITE_CMD` unconfigured (awaiting operator destination) | **`BLOCKED`** | `2026-11-17T21:40:01Z` | `614dc997e1b903c94948dc7ff13d02e51c434acd` | Section 7 & Section 9 |

### 4.4 Public HTTPS, Reverse-Proxy (`biteshark.live` / `staging.biteshark.live`) & Physical-Device Matrix

| Test ID | Target Environment | Expected Result | Observed Result | Status | Timestamp (UTC) | Tested SHA | Sanitized Evidence Ref |
|---|---|---|---|---|---|---|---|
| `HTTPS-TLS` | Public Nginx `:80`/`:443` (`biteshark.live`, `www.biteshark.live`, `staging.biteshark.live`) | HTTP `301` → canonical HTTPS (ACME HTTP-01 `200` exempted), `www` `301` → `https://biteshark.live`, isolated holding page (`200`, HSTS `max-age=31536000` without `includeSubDomains`/`preload`), valid Let's Encrypt ECDSA cert (`YE2`), `certbot renew --dry-run` `success`, `lifestyle-api` `:80` untouched | All 3 SANs verified over TLS 1.3 (`authorized=true`, valid `2026-11-19` → `2027-02-17`); all `301`s & ACME `200`s verified externally & on VPS; `certbot renew --dry-run` succeeded; `lifestyle-api` `:80` → `404` untouched | **PASS** | `2026-11-19T13:08:08Z` | `614dc997e1b903c94948dc7ff13d02e51c434acd` | Public HTTPS verification `tls_certificates` & `external_redirects_and_holding` |
| `HTTPS-WORKER-403` | Public Nginx `POST https://staging.biteshark.live/api/pager/worker`, `/api/auth/staging-mailbox`, `/api/_staging_gate_probe` | External `/api/pager/worker` returns `403` (even with valid Bearer secret); `/api/auth/staging-mailbox` (even with valid secret) & `/api/_staging_gate_probe` return `404`; `/sw.js` `no-store` | `/api/pager/worker` → `403`; `/api/auth/staging-mailbox` → `404`; `/api/_staging_gate_probe` → `404`; `/sw.js` `Cache-Control: no-cache, no-store, must-revalidate` | **PASS** | `2026-11-19T13:08:09Z` | `614dc997e1b903c94948dc7ff13d02e51c434acd` | Public HTTPS verification `public_nginx_boundary` |
| `HTTPS-GATES` | Public `https://staging.biteshark.live` (`tests/staging-hatchable-gates.cjs` + `VPS_G10`–`G11`) | All `11` gates (`G1`–`G9`, `VPS_G10`–`G11`) + `6` E2E flows (`E2E1`–`E2E6` including live `TRUCKLY_PAUSE_WRITES`) + parent-domain `Origin: https://biteshark.live` CSRF `403` pass over public HTTPS | `11/11` gates & `6/6` E2E `PASS` (`run_id=4b45084f`, `ticket=sha256:26e388f47a53`); `Origin: https://biteshark.live` → `403`, `Origin: http://staging.biteshark.live` → `403`, `Origin: https://staging.biteshark.live` → `200` | **PASS** | `2026-11-19T13:08:18Z` | `614dc997e1b903c94948dc7ff13d02e51c434acd` | Public HTTPS verification `https_vps_gates` (`run_id=4b45084f`) |
| `HTTPS-AUTH-BROWSER` | Public `https://staging.biteshark.live` & `https://www.biteshark.live` in 2 isolated real `Chrome/157.0.8103.51` contexts | Full CA TLS validation; `www` → `https://biteshark.live` holding page; `/sw.js` scope `https://staging.biteshark.live/` & `/manifest.json` `standalone`; `0` localhost/IP leaks; real HTTPS OTP login (`__Host-` cookie), Owner publish → Customer refresh, `/#pager-ref` tap routing, and logout revocation | All assertions passed (`staging_sw_scope=https://staging.biteshark.live/`, `zero_localhost_or_ip_leaks=true`, `https_browser_login_owner_publish_customer_sync_and_logout=true`, `pager_ref_tap_routing_hash_scrubbed=true`) | **PASS** | `2026-11-19T13:08:25Z` | `614dc997e1b903c94948dc7ff13d02e51c434acd` | Public HTTPS verification `https_two_browser_e2e` |
| `PD-01` | Physical Android Chrome + Physical iPhone `iOS 16.4+` Home Screen PWA | Permission prompt appears **only** after explicit user tap on `#pagerSubscribeBtn` | Staging HTTPS origin & physical devices unavailable | **`NOT RUN`** | `2026-11-17T21:40:01Z` | `614dc997e1b903c94948dc7ff13d02e51c434acd` | Section 9.3 Operator Steps |
| `PD-02` | Physical Android + Physical iPhone Home Screen PWA | `201` Web Push subscription bound to live FCM / Apple Web Push | Staging HTTPS origin, staging VAPID keys & devices unavailable | **`NOT RUN`** | `2026-11-17T21:40:01Z` | `614dc997e1b903c94948dc7ff13d02e51c434acd` | Section 9.3 Operator Steps |
| `PD-03` | Physical Android + Physical iPhone Home Screen PWA | Foreground ready alert displayed + live UI status updates | Staging HTTPS origin & devices unavailable | **`NOT RUN`** | `2026-11-17T21:40:01Z` | `614dc997e1b903c94948dc7ff13d02e51c434acd` | Section 9.3 Operator Steps |
| `PD-04` | Physical Android + Physical iPhone Home Screen PWA | Background OS notification banner delivered when app is backgrounded | Staging HTTPS origin & devices unavailable | **`NOT RUN`** | `2026-11-17T21:40:01Z` | `614dc997e1b903c94948dc7ff13d02e51c434acd` | Section 9.3 Operator Steps |
| `PD-05` | Physical Android + Physical iPhone Home Screen PWA | Lock-screen notification banner delivered while screen is locked | Staging HTTPS origin & devices unavailable | **`NOT RUN`** | `2026-11-17T21:40:01Z` | `614dc997e1b903c94948dc7ff13d02e51c434acd` | Section 9.3 Operator Steps |
| `PD-06` | Physical Android + Physical iPhone Home Screen PWA | Tapping notification opens `/#pager-ref=<sub_id>`, resolves ticket, and scrubs hash | Staging HTTPS origin & devices unavailable | **`NOT RUN`** | `2026-11-17T21:40:01Z` | `614dc997e1b903c94948dc7ff13d02e51c434acd` | Section 9.3 Operator Steps |
| `PD-07` | Physical Android + Physical iPhone Home Screen PWA | Cold-start tap routing (`clients.openWindow`) opens ready ticket when app was closed | Staging HTTPS origin & devices unavailable | **`NOT RUN`** | `2026-11-17T21:40:01Z` | `614dc997e1b903c94948dc7ff13d02e51c434acd` | Section 9.3 Operator Steps |
| `PD-08` | Physical Android + Physical iPhone Home Screen PWA | Already-open tap routing (`client.focus` + `postMessage`) focuses open window to ticket | Staging HTTPS origin & devices unavailable | **`NOT RUN`** | `2026-11-17T21:40:01Z` | `614dc997e1b903c94948dc7ff13d02e51c434acd` | Section 9.3 Operator Steps |
| `PD-09` | Physical Android + Physical iPhone Home Screen PWA | Subscribing to an already-`ready` ticket delivers exact `1` catch-up alert | Staging HTTPS origin & devices unavailable *(server logic verified in CI)* | **`NOT RUN`** | `2026-11-17T21:40:01Z` | `614dc997e1b903c94948dc7ff13d02e51c434acd` | Section 9.3 Operator Steps |
| `PD-10` | Physical Android + Physical iPhone Home Screen PWA | Repeated registration / page reload does not trigger duplicate push storm | Staging HTTPS origin & devices unavailable *(server logic verified in CI)* | **`NOT RUN`** | `2026-11-17T21:40:01Z` | `614dc997e1b903c94948dc7ff13d02e51c434acd` | Section 9.3 Operator Steps |
| `PD-11` | Physical Android + Physical iPhone Home Screen PWA | `60s` anti-flap cooldown suppresses `ready → almost → ready` oscillation | Staging HTTPS origin & devices unavailable *(server logic verified in CI)* | **`NOT RUN`** | `2026-11-17T21:40:01Z` | `614dc997e1b903c94948dc7ff13d02e51c434acd` | Section 9.3 Operator Steps |
| `PD-12` | Physical Android + Physical iPhone Home Screen PWA | Unsubscribing before worker dispatch prevents delivery | Staging HTTPS origin & devices unavailable *(server logic verified in CI)* | **`NOT RUN`** | `2026-11-17T21:40:01Z` | `614dc997e1b903c94948dc7ff13d02e51c434acd` | Section 9.3 Operator Steps |
| `PD-13` | Physical Android + Physical iPhone Home Screen PWA | `collected` / `cancelled` ticket suppresses queued alert on real device | Verified on live VPS synthetic drain (`VPS-WRK-PAUSE-DRAIN`); physical device **`NOT RUN`** | **`NOT RUN`** | `2026-11-17T21:40:01Z` | `614dc997e1b903c94948dc7ff13d02e51c434acd` | Section 9.3 Operator Steps |
| `PD-14` | Physical Android + Physical iPhone (including non-installed iOS Safari tab) | Denied permission / non-Home-Screen iOS Safari shows truthful fallback & keeps `8s` live foreground polling | Staging HTTPS origin & devices unavailable | **`NOT RUN`** | `2026-11-17T21:40:01Z` | `614dc997e1b903c94948dc7ff13d02e51c434acd` | Section 9.3 Operator Steps |
| `PD-15` | Physical Android + Physical iPhone Home Screen PWA | Airplane-mode network loss & reconnect recovers ticket state | Staging HTTPS origin & devices unavailable | **`NOT RUN`** | `2026-11-17T21:40:01Z` | `614dc997e1b903c94948dc7ff13d02e51c434acd` | Section 9.3 Operator Steps |
| `PD-16` | Physical Android + Physical iPhone Home Screen PWA | Multiple devices follow Ticket A without cross-ticket leakage from Ticket B | Staging HTTPS origin & devices unavailable | **`NOT RUN`** | `2026-11-17T21:40:01Z` | `614dc997e1b903c94948dc7ff13d02e51c434acd` | Section 9.3 Operator Steps |
| `PD-17` | Physical Android + Physical iPhone Home Screen PWA | Lock-screen banner shows only vendor + ticket label (`0` private bearer UUIDs) | Wire ciphertext verified on live VPS (`VPS-WRK-PAUSE-DRAIN`); physical lock screen **`NOT RUN`** | **`NOT RUN`** | `2026-11-17T21:40:01Z` | `614dc997e1b903c94948dc7ff13d02e51c434acd` | Section 9.3 Operator Steps |
| `PD-18` | Physical Android + Physical iPhone Home Screen PWA | Sample pager demo creates `0` subscriptions, outbox events, or pushes | Verified in `VPS-E2E6` & `VPS-BR-LOOPBACK`; physical device **`NOT RUN`** | **`NOT RUN`** | `2026-11-17T21:40:01Z` | `614dc997e1b903c94948dc7ff13d02e51c434acd` | Section 9.3 Operator Steps |
| `PD-LIVE-410` | Live FCM / Apple Web Push endpoint invalidation | Live `404`/`410` scrubs endpoint/keys (`permission` revocation alone is not guaranteed to yield immediate `410`) | Deterministic `410` verified on live VPS (`VPS-WRK-PAUSE-DRAIN`); live provider `410` **`NOT RUN`** | **`NOT RUN`** | `2026-11-17T21:40:01Z` | `614dc997e1b903c94948dc7ff13d02e51c434acd` | Section 9.3 Operator Steps |

---

## 5. Defect ledger

*(For earlier Phase 1–3 application defects `DEF-01`–`DEF-03`, see the preserved historical Hatchable archive in [`docs/RELEASE_VERIFICATION_REPORT.md`](./RELEASE_VERIFICATION_REPORT.md#5-defect-ledger-and-corrections).)*

| ID | Discovered Phase | Concrete Cause | Security / Operational Impact | Fix Commit | Regression Coverage | Hosted VPS Retest |
|---|---|---|---|---|---|---|
| `REV-01`..`REV-05` | Pre-install review of `dfab57f` | Public routes queried sessions; `Referer` fallback lacked `https:` & canonical `TRUCKLY_PUBLIC_ORIGIN` check; `/api/auth/staging-mailbox` lacked loopback socket guard & Nginx `404`; concurrent `auth/start` lacked partial unique index; `truckly_stg_app` retained `DELETE`/`UPDATE` on `audit_logs` | Risked `Set-Cookie` on public responses, weaker `Referer` CSRF check, broader staging mailbox exposure, concurrent OTP start race, and mutable `audit_logs` | `b6dcf2459f5ecc3c2b00e5f1b8006842b11f8825` | [`tests/standalone-runtime-auth.integration.cjs`](../tests/standalone-runtime-auth.integration.cjs) `[5/8]`–`[6/8]` | **PASS** (`VPS-CACHE-ETAG`, `VPS-G5`, `VPS-G11`) |
| `DEF-VPS-01` | Initial Linux staging setup | Windows `git archive` exported CRLF in `truckly-staging-backup.sh`, and `pg_dump --file` as `postgres` could not open output files inside `0700 root:root /var/backups/truckly-staging` | `systemd` backup unit failed before writing archive | `bc6a607168fe89d4ab9d0abbadb9e4e8404ba3c9` | [`.gitattributes`](../.gitattributes) + streamed `pg_dump` in [`deploy/backup/truckly-staging-backup.sh`](../deploy/backup/truckly-staging-backup.sh) | **PASS** (`VPS-BACKUP-RESTORE`) |
| `DEF-VPS-02` | Initial `pg_restore` verification | `.gitattributes` LF export altered raw byte hashes of `008`–`010` SQL files when re-running `run-migrations.cjs` after restore | Post-restore migration verification rejected CRLF-recorded checksums | `16594e95a556aec29f12c79bc70de0db4432d36f` | CRLF/LF normalization in [`scripts/run-migrations.cjs`](../scripts/run-migrations.cjs) + GHA Run `44067277398` | **PASS** (`VPS-BACKUP-RESTORE`) |
| **`DEF-VPS-03`** | **Live VPS Stage 1 (`VPS-XFF-SPOOF-PRE` on `16594e9`)** | [`deploy/staging.env.example`](../deploy/staging.env.example) defaulted `TRUCKLY_TRUST_PROXY=loopback` **before** the Nginx reverse proxy was active to overwrite `X-Real-IP: $remote_addr` and `X-Forwarded-For: $remote_addr` | In loopback-only mode (`127.0.0.1:4100`), local or SSH-tunneled requests could rotate `X-Real-IP` / `X-Forwarded-For` headers and bypass `start_ip` rate limits | **`614dc997e1b903c94948dc7ff13d02e51c434acd`** | [`tests/standalone-runtime-auth.integration.cjs`](../tests/standalone-runtime-auth.integration.cjs) (`[6/8]`, GHA Run `44180486982`) + updated [`deploy/staging.env.example`](../deploy/staging.env.example) & [`deploy/nginx/truckly-staging.conf.template`](../deploy/nginx/truckly-staging.conf.template) | **PASS** (`VPS-XFF-SPOOF-RETEST` on `614dc99`) |

---

## 6. Measurements

> **Measurement Caveat (Not a Production SLA):** All timings and resource figures below were recorded on the shared `1 vCPU / 961 MiB` Linode staging host (`<linode-vps-ipv4>`) under loopback synthetic workloads (`n = 1`–`3` deliveries per test; `3,750` idle ticks for soak). They do **not** include public WAN TLS round-trips to FCM / Apple Web Push, cellular radio wake latencies, mobile OS Doze / Low Power delays, or concurrent multi-vendor production traffic, and must not be represented as a production SLA.

### 6.1 Observed VPS `systemd` Worker Timing, Queue Behavior & Resource Use

| Metric | Sample / Window | Observed Value on Live VPS | Notes |
|---|---|---|---|
| **Steady-state invocation cadence** | `3,750` consecutive ticks (`10h 25m`: `10:44:40Z` – `21:09:54Z`) | **`10.006 s / tick`** (`300.19 s`–`300.20 s` per 30-tick heartbeat) | Driven by `scripts/run-pager-worker.cjs --continuous --interval-ms 10000 --cleanup-every 30` |
| **Idle tick HTTP + DB check duration** | `126` logged heartbeats | **`2–3 ms`** steady state (`375–380 ms` cold tick 1) | `0` worker errors, `0` restarts over `10.4h` |
| **Cumulative CPU utilization (`10.4h` soak)** | `37,514 s` wall clock | Worker: **`10.49 s` CPU (`0.028%`)** · API: **`6.12 s` CPU (`0.016%`)** | Bounded by `CPUQuota=30%` (worker) and `CPUQuota=60%` (API) |
| **cgroup Memory footprint** | Post-soak peak / post-cleanup steady | Worker: **`17.3 MiB` steady / `37.0 MiB` peak** (`max 128M`) · API: **`22.3 MiB` steady / `28.2 MiB` peak** (`max 192M`) | PostgreSQL `truckly_stg_app` maintained `1` idle connection (`limit 12`) |
| **Delivery resume → loopback push `201` drain** | `n = 3` queued rows (`1` `201`, `1` `410`, `1` `collected` suppressed) | **`16,516 ms`** from `systemctl restart` + next `10s` worker tick to `201` accept | Includes API restart + remainder of `10s` sleep interval |
| **Ready transition → initial worker claim** | `n = 1` (`STG-W3`) | **`14,217 ms`** | Bounded by `10s` polling interval + wave claim |
| **`SIGKILL` (`kill -9`) `systemd` auto-restart** | `PID 689984` → `PID 691167` | **`6,252 ms`** (`NRestarts: 0 → 1`) | Matches `Restart=always`, `RestartSec=5` |
| **Hanging provider timeout + retry recovery** | `n = 1` (`/push/hang` stalled on attempt 1, `201` on attempt 2) | **`25,773 ms`** from initial claim to recovered `201` delivery (`overlap claimed = 0`) | API `DEFAULT_PROVIDER_TIMEOUT_MS = 5000` aborted stalled attempt 1, scheduled `RETRY_BACKOFF_SECONDS[0] = 15s`, and restarted worker `PID 691167` completed attempt 2 (`WORKER_LEASE_SECONDS = 45s` covers hard API process crashes) |
| **Physical-device push arrival latency** | Android Chrome & iPhone Home Screen PWA | **`NOT RUN`** | Blocked on HTTPS hostname, staging VAPID keys & physical devices |

### 6.2 Explicit Operational & Cancellation Limitations

1. **Supervisor Stop Does Not Cancel In-Flight HTTP/Provider Work:** Running `systemctl stop truckly-staging-worker.service` prevents *future* ticks, and setting `TRUCKLY_DISABLE_NOTIFICATION_DELIVERY=1` prevents *new* wave claims after API reload, but neither aborts a wave already dispatched inside `truckly-staging-api.service`.
2. **Provider-Accepted Pushes Cannot Be Recalled:** Once FCM, Mozilla Autopush, or Apple Web Push returns HTTP `201`, the notification is queued in the third-party push network and **cannot** be recalled even if the order is subsequently marked `collected` or `cancelled`.
3. **Provider Acceptance ≠ Confirmed Device Display:** HTTP `201` confirms push-service acceptance only, not screen rendering on the customer's handset.

---

## 7. Recovery and co-tenant health

### 7.1 Backup & Real `pg_restore` Verification (`truckly_staging` Only)

- **Backup Creation & Encryption:** `systemctl start truckly-staging-backup.service` streamed `pg_dump --format=custom --no-owner --no-acl` directly through `gpg --symmetric --cipher-algo AES256` inside `0700 root:root /var/backups/truckly-staging`, producing `truckly_staging-20261117T213900Z.dump.gpg` (`52,782` bytes, mode `0600`) and `.sha256` (`sha256sum -c`: `OK`). Retention pruning (`TRUCKLY_BACKUP_RETENTION_DAYS=7`) and non-zero failure exit (`set -euo pipefail`) verified.
- **Executed Restore into Disposable Database:** Created isolated database `truckly_staging_restore_verify`, decrypted the `.dump.gpg` archive, executed `pg_restore --exit-on-error`, re-verified `run-migrations.cjs --app-role truckly_stg_app` (`newly_applied: 0`), confirmed `17` migrations, `59` active canonical vendors (`47` primary), `3` vendor memberships, `2` platform roles, `10` `FORCE ROW LEVEL SECURITY` tables, `0` residual `[STG-%]` bookings/pagers, and confirmed `SET ROLE truckly_stg_app; DELETE FROM audit_logs;` failed with permission denied. Dropped `truckly_staging_restore_verify` immediately afterward.
- **Off-Server Transfer Status:** **`BLOCKED`** — `TRUCKLY_BACKUP_OFFSITE_CMD` in `/etc/truckly-staging/backup.env` remains unconfigured pending an operator-designated off-server destination (`rsync`/SSH path or S3-compatible bucket). Unrelated database `velvet_key_db` was **not** backed up or touched per scope boundary.

### 7.2 Existing-Workload & Host Health (Before vs After Full Verification)

| Workload / Resource | Pre-Verification (`21:05:31Z`) | Post-Verification (`21:40:01Z`) | Status |
|---|---|---|---|
| `nginx.service` | `active (running)`, `PID 584004`, `restarts=0`, `0.96 MiB` | `active (running)`, `PID 584004`, `restarts=0`, `0.92 MiB` (`sites-enabled`: `lifestyle-api` only) | **Healthy / Untouched** |
| `pm2-matt.service` (`lifestyle-api`) | `online`, `PID 584107`, `restarts=0`, `33.5 MiB` RSS, `:80`/`:4000` → `404` | `online`, `PID 584107`, `restarts=0`, `34.6 MiB` RSS, `:80`/`:4000` → `404` | **Healthy / Untouched** |
| `postgresql@16-main` & `velvet_key_db` | `active (running)`, `PID 584073`, `restarts=0`, `81.4 MiB` | `active (running)`, `PID 584073`, `restarts=0`, `86.5 MiB`; `velvet_key_db` & `velvet_key_user` untouched | **Healthy / Untouched** |
| `qwen-worker.service` | `active (running)`, `PID 678905`, `NRestarts=6`, `43.9 MiB` | `active (running)`, `PID 678905`, `NRestarts=6` (`0` new restarts), `43.7 MiB` | **Healthy / Untouched** |
| System `/usr/bin/node` & `ufw` | `/usr/bin/node v18.19.1`; `ufw` `22,80,443,4000` | `/usr/bin/node v18.19.1`; `ufw` `22,80,443,4000` (`4100` loopback-only) | **Healthy / Untouched** |
| Host RAM / Swap / Disk / Kernel OOM | `451 MiB` avail RAM, `116.5 MiB` swap, `8.0G` (`35%`) disk (`14%` inodes), `0` OOM | `460 MiB` avail RAM, `115.8 MiB` swap, `8.0G` (`35%`) disk (`14%` inodes), `0` OOM (`48h`) | **Healthy / Zero Pressure** |

---

## 8. Cleanup

### 8.1 Temporary Verification Artifacts Removed

- Disabled staging runtime probe (`TRUCKLY_ENABLE_STAGING_PROBE=0`, `TRUCKLY_STAGING_PROBE_TOKEN` removed; `POST /api/_staging_gate_probe` verified `404`).
- Reset push provider to `TRUCKLY_PUSH_PROVIDER_MODE=disabled` (`NODE_ENV=production`, `TRUCKLY_TRUST_PROXY=none`, `TRUCKLY_PAUSE_WRITES=` empty; `TRUCKLY_ALLOW_TEST_PUSH_MODES` removed).
- Removed temporary loopback push receiver (`/tmp/stg-push-receiver*`), temporary `.bak*` env copies, release tarballs, disposable `truckly_staging_restore_verify` database, and intermediate Stage 2 test backup files.
- Executed [`scripts/staging-cleanup.sql`](../scripts/staging-cleanup.sql) and purged all `stg-*@staging.truckly.invalid` test users, OTP challenges, mailbox ciphertexts, and rate-limit buckets (`stg_bookings=0`, `stg_community=0`, `stg_pagers=0`, `active_pager_subs=0`, `queued_or_processing_deliveries=0`).
- **Permanent Route Inventory Verified:**
  - `30` permanent domain route files in `/srv/truckly-staging/current/api/` (`0` probe/debug files; `GET /__debug/state` → `404`).
  - `4` standalone public auth endpoints (`/api/auth/start`, `/api/auth/verify`, `/api/auth/session`, `/api/auth/logout`) + `1` loopback/secret-gated staging operator mailbox endpoint (`POST /api/auth/staging-mailbox` → `404` without secret; blocked `404` in Nginx template).
  - `1` standalone readiness endpoint (`GET /api/healthz`).
- Confirmed zero secrets, private keys, OTP codes, session cookies, raw VPS IPv4 addresses, or bearer pager UUIDs exist in repository files or reports.

### 8.2 Deliberately Retained Staging Resources & Ownership

| Retained Resource on VPS | Purpose | Owner & Cleanup Responsibility |
|---|---|---|
| `/opt/nodejs/node-v22.23.5-linux-x64` (`/opt/nodejs/node-v22-lts`) & `certbot 2.9.0-1` | Isolated LTS Node 22 runtime & ACME TLS client ready for hostname activation | VPS Operator (decommission via bounded rollback in [`STANDALONE_VPS_RUNTIME_AND_AUTH.md`](./STANDALONE_VPS_RUNTIME_AND_AUTH.md) if staging is retired) |
| `/srv/biteshark/holding/public/index.html`, `/var/www/letsencrypt`, `/etc/nginx/sites-available/{biteshark.live,staging.biteshark.live}` (`-> z-*`), `/etc/letsencrypt/live/biteshark.live` | Root HTTPS holding page (`https://biteshark.live`), `www` redirect, ACME webroot, & staging HTTPS proxy (`https://staging.biteshark.live`) | VPS Operator |
| `truckly-stg` user, `/srv/truckly-staging/releases/614dc997...`, `/etc/truckly-staging/*` | Immutable staging release & config (`TRUCKLY_PUBLIC_ORIGIN=https://staging.biteshark.live`, `TRUCKLY_TRUST_PROXY=loopback`, push disabled) | VPS Operator |
| `truckly-staging-api.service`, `truckly-staging-worker.service`, `truckly-staging-backup.timer` | Operational staging API (`127.0.0.1:4100`), paused push worker, and daily encrypted local DB backup | VPS Operator |
| PostgreSQL `truckly_staging` DB (`truckly_stg_migrator`, `truckly_stg_app`) + 7 `@staging.truckly.invalid` personas | Ready for physical-device Web Push verification | VPS Operator |
| `/var/backups/truckly-staging/truckly_staging-*.dump.gpg` | Verified daily encrypted staging snapshots (`7d` automatic local pruning) | VPS Operator |

---

## 9. Remaining production decisions & operator device steps

### 9.1 Required External Inputs to Finish Physical-Device & Backup Sign-Off

1. **Off-Server Backup Destination (`BACKUP-OFFSITE`):** Provide an existing `rsync`-over-SSH destination or S3-compatible bucket path for `TRUCKLY_BACKUP_OFFSITE_CMD` in `/etc/truckly-staging/backup.env`.
2. **Designated Physical Test Devices (`PD-01`–`PD-18`):** Provide one physical Android phone (`Chrome`) and one physical iPhone (`iOS 16.4+`) to run against `https://staging.biteshark.live` once staging VAPID keys are enabled.

### 9.2 Production Architecture & Cutover Decisions (Prior to Any Production Launch)

| Decision Area | Requirement Before Production Cutover |
|---|---|
| **VPS Capacity / Resizing** | Current `1 vCPU / 961 MiB` Linode (`~485 MiB` free RAM with `147 MiB` swap already in use alongside `postgresql@16`, `lifestyle-api`, and `qwen-worker`) is suitable for **bounded staging only**. Resize to **`>= 2 GB–4 GB` RAM** or a dedicated Truckly VPS before production traffic. |
| **Production Hostname & Email OTP Provider** | Decide when `https://biteshark.live` transitions from its static coming-soon holding page to production and configure a real HTTPS transactional email provider (`TRUCKLY_AUTH_DELIVERY_MODE=resend_https` or `webhook_https` with SPF/DKIM/DMARC); `staging_mailbox` hard-fails in `TRUCKLY_ENV=production`. |
| **Identity & Data Migration (Zero Silent Auto-Linking)** | Standalone auth intentionally issues opaque `usr_sa_*` IDs and **never** auto-claims legacy Hatchable `user_id`s by email. Before cutover, execute an explicit operator-reviewed migration mapping verified vendor/customer accounts and decide whether passkeys remain deferred (`supportsPasskeys() === false`) or WebAuthn is scheduled post-cutover. |
| **Origin-Change Effects** | Moving from `https://truckly.hatchable.site` to `https://biteshark.live` resets browser-origin-scoped `localStorage` (guest favorites, Food Passport stamps, Coffee Club state) and invalidates any origin-bound Service Worker / Web Push registrations. Communicate this clearly at cutover. |
| **Backup & Monitoring Ownership** | Designate off-server backup verification owner (weekly `pg_restore` drill; separate decision if `velvet_key_db` also needs backups) and monitoring owner polling `/api/healthz` and `/api/pager/telemetry` (`expired_leases > 0`, `queued > 20`, `config_valid === false`). |
| **Controlled Cutover Order** | 1) Provision resized/dedicated host + off-server backups; 2) Apply migrations `001`–`017` & verified data/role seed; 3) Deploy with `TRUCKLY_ENV=production` and `TRUCKLY_PUSH_PROVIDER_MODE=disabled`; 4) Pass HTTPS smoke checks; 5) Enable production VAPID keys (`webpush`) & `systemd` worker; 6) Hold `TRUCKLY_PAUSE_WRITES` rollback switch ready. |

### 9.3 Concise Operator Steps for Physical-Device Checks (`PD-01`–`PD-18`) on `https://staging.biteshark.live`

Per official Apple WebKit (`iOS/iPadOS 16.4+`) and Android Chrome Web Push requirements verified against platform documentation, `https://staging.biteshark.live` serves `/manifest.json` with `"display": "standalone"`, `<link rel="manifest" href="/manifest.json">`, user-gesture-only `Notification.requestPermission()`, and immediate visible `self.registration.showNotification()` in `/sw.js`. Once staging VAPID keys (`TRUCKLY_PUSH_PROVIDER_MODE=webpush`) are enabled:

1. **iPhone (`iOS 16.4+`) Setup:** Open `https://staging.biteshark.live` in Safari → tap **Share** → **Add to Home Screen** → launch Truckly **from the Home Screen icon** (required by Apple WebKit; standard Safari tabs expose no Push API, which exercises `PD-14`).
2. **Android Setup:** Open `https://staging.biteshark.live` in Chrome.
3. **Sample Isolation (`PD-18`):** Open **Food pager** → run the sample demo on both phones → confirm zero permission prompts and `0` subscriptions in `/api/pager/telemetry`.
4. **Opt-In & Delivery (`PD-01`–`PD-08`, `PD-16`–`PD-17`):** Create staging Ticket A (`va-owner`) → open Ticket A on both phones → verify no prompt until tapping **Notify me when ready** (`PD-01`), then allow (`PD-02`). Trigger `ready` with app foregrounded (`PD-03`), reset/new ticket backgrounded (`PD-04`), and screen locked (`PD-05`, verifying lock screen shows only vendor + ticket number with zero UUID `PD-17`, and Ticket B stays isolated `PD-16`). Test notification tap while open (`PD-08`) and after swiping app closed (`PD-06`, `PD-07`).
5. **Edge & Lifecycle Checks (`PD-09`–`PD-15`):** Subscribe to an already-`ready` ticket (`PD-09`), reload/re-open (`PD-10`), toggle `ready → almost → ready` within `60s` (`PD-11`), unsubscribe before `ready` (`PD-12`), mark `collected` while delivery paused then resume (`PD-13`), test denied-permission banner (`PD-14`), and toggle Airplane Mode for `20s` then reconnect (`PD-15`). Record device model, OS/browser version, timestamps, server transition → worker dispatch → provider `201` → handset display times in Section 4.4.
