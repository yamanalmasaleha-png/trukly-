# Truckly Standalone Node Runtime, PostgreSQL Adapter & Authentication Architecture

## 1. Scope & Baseline Lineage

- **Executable baseline:** `fa4e40affb574d3da5a98e4874b301ad5251e17c`
- **Verification report baseline:** `3f89401e11ff4c0d376e58e1df216a8b0ee5ce13` (documentation-only commit on `docs/RELEASE_VERIFICATION_REPORT.md`)
- **Feature freeze:** Product features remain frozen. This architecture provides runtime portability off Hatchable (`server/index.js`, `packages/hatchable-adapter`), safe server-side authentication (`migrations/017_standalone_auth_and_sessions.sql`, `lib/standalone-auth.js`, `public/auth-client.js`), bounded deployment templates (`deploy/`), and VPS staging verification (`tests/vps-staging-gates.cjs`).
- **Developer simulator isolation:** `scripts/dev-server.cjs` remains a local-only developer preview facility and is **never** deployed. `server/index.js` exposes zero `/__debug/*` routes and strips/ignores `x-truckly-debug-role` and `truckly_debug_role`.

---

## 2. Module Resolution & Standalone HTTP Runtime

### Why a Local Package (`"hatchable": "file:./packages/hatchable-adapter"`) Was Chosen

Twenty-seven of Truckly's 30 route handlers in `api/**/*.js` import `{ db }` or `{ db, auth }` from bare specifier `"hatchable"`. Node.js `package.json` subpath `"imports"` only supports `#`-prefixed specifiers (`#hatchable`) and cannot remap a bare `"hatchable"` specifier.

Using an explicit local package (`"hatchable": "file:./packages/hatchable-adapter"` in [`package.json`](../package.json), locked in [`package-lock.json`](../package-lock.json)):

1. Installs `node_modules/hatchable` through normal `npm ci --omit=dev` so `node server/index.js` starts directly with **zero** experimental `--import` or `module.register()` test loaders.
2. Preserves all **30** domain route files in `api/**/*.js` without adding helper files inside `api/` or breaking Hatchable compatibility during staging evaluation.
3. Delegates `db.query`, `db.connect`, and `db.transaction` to a bounded `pg.Pool` (`pg@8.23.1`, `DATE` OID `1082` preserved as `YYYY-MM-DD`), preserving every P0/P1 single-connection transaction (`lib/db-tx.js`), `FOR SHARE` / `FOR NO KEY UPDATE` row lock, and `SET LOCAL` RLS GUC.

### HTTP Server Safeguards (`server/index.js` & `server/app.js`)

- **Startup fail-closed checks:** Refuses to start in `staging` or `production` if `DATABASE_URL` is missing, if the PostgreSQL connection role has `SUPERUSER` or `BYPASSRLS` privileges, if `TRUCKLY_AUTH_SECRET` is shorter than 32 characters, or if `TRUCKLY_AUTH_DELIVERY_MODE=staging_mailbox` is enabled outside confirmed isolated staging.
- **Explicit route manifest (`server/routes.js`):** Registers the exact 30 domain routes (`static /api/trucks/*` ordered ahead of dynamic `/api/trucks/:id`), enforces `route.methods` (`405` + `Allow`), and enforces `route.access === 'user'` (`401` + `Cache-Control: private, no-store, max-age=0`).
- **Bounded JSON bodies:** Caps domain mutations at `64 KiB` (`8 KiB` on `/api/auth/*`), immediately returning `413 Payload Too Large` on oversized bodies and `400 Bad Request` on malformed or non-object JSON.
- **Static-file confinement:** Serves only allowlisted asset extensions inside `fs.realpathSync(publicDir)` (`GET`/`HEAD` only), rejecting `..` traversal, encoded `%2e%2e` / `%00` sequences, backslashes, dotfiles, symlinks escaping `public/`, and all repository internals (`package.json`, `lib/*`, `server/*`, `migrations/*`, `scripts/*`, `deploy/*`).
- **Health & graceful shutdown:** `GET /api/healthz` verifies live PostgreSQL readiness (`SELECT 1`) and reports `release_sha` without secrets; `SIGTERM`/`SIGINT` drains active HTTP requests and closes `pg.Pool` cleanly.

---

## 3. Authentication Replacement Architecture

### Evaluation of Candidate Libraries

Before implementation, maintained Node.js + PostgreSQL authentication packages were inspected against npm registry status (`2026-11`):

| Option | Status & Findings | Decision |
|---|---|---|
| `lucia` & `@oslojs/crypto` | Both marked **deprecated** on npm (`Package no longer supported`). | **Rejected** (unmaintained/deprecated). |
| `better-auth` (`1.7.x`) | Active, ~742 KB minified + `kysely`, `zod`, `jose`, and multi-ORM adapters; executes SQL outside Truckly's transaction-scoped `SET LOCAL app.auth_internal = 'true'` `FORCE ROW LEVEL SECURITY` envelope. | **Rejected** (heavy footprint on `961 MiB` VPS; incompatible with `NOBYPASSRLS` `FORCE RLS` GUC model). |
| `iron-session` (`9.1.x`) | Active stateless encrypted cookie library; lacks immediate server-side logout/session revocation without adding a server session table anyway. | **Rejected** (no native server-side session revocation). |
| **`otplib@13.6.0` + `cookie@1.1.1` + `node:crypto` + PostgreSQL (`017`)** | Active (`deprecated: null`), minimal (`25` total lockfile packages), RFC 4226 HOTP generation (`@noble` + `@scure`), RFC 6265 `__Host-` cookie parsing/serialization, OpenSSL 3.5.9 HMAC-SHA256/SHA-256/AES-256-GCM, and full `FORCE ROW LEVEL SECURITY` enforcement. | **Selected**. |

### Security Specification

1. **User Identity & Email Normalization (`auth_users`):**
   - Emails are trimmed, lowercased, and validated against RFC 5321 length (`3..254`, local `1..64`, domain `3..253`) and character rules.
   - New standalone accounts receive opaque 128-bit CSPRNG IDs (`usr_sa_<32-hex>`) and preserve the `{ id, email }` contract consumed by `resolveIdentity(req, auth)`.
   - **No silent legacy auto-linking:** Standalone sign-in never queries or adopts old Hatchable `user_id`s from `vendor_memberships`, `platform_roles`, `bookings`, `favorites`, or `community_reviews` by email. Staging uses disposable `usr_sa_*` identities; production identity migration requires a separate reviewed mapping operation.
2. **Verification-Code Issuance, Expiry, Retry Limits & Single Use (`auth_otp_challenges`):**
   - Codes are 6-digit RFC 4226 HOTP tokens generated via `otplib` (`generateSecret()` + `generate({ strategy: 'hotp', digits: 6 })`).
   - Database rows store **only** `code_hmac = HMAC-SHA256(TRUCKLY_AUTH_SECRET, "truckly-otp-v1|<email>|<challenge_id>|<code>")` (`64` hex chars), never plaintext OTPs.
   - Challenges expire after `10 minutes` (`600s` default) and allow at most `5` verification attempts (`attempts < max_attempts`). Issuing a new challenge invalidates prior unconsumed challenges for that address.
3. **Atomic Consumption Under Concurrent Requests:**
   - `verifyEmailOtpChallenge` runs inside a single-connection PostgreSQL transaction (`withTransaction` + `SET LOCAL app.auth_internal = 'true'`), locking the active challenge row with `SELECT ... FOR UPDATE`.
   - Wrong attempts increment `attempts` (and set `invalidated_at` at `5` tries) and **commit** the counter update before returning `401`.
   - Valid matches execute `UPDATE auth_otp_challenges SET consumed_at = $2, attempts = attempts + 1 WHERE id = $1 AND consumed_at IS NULL AND invalidated_at IS NULL AND expires_at > $2 AND attempts < max_attempts RETURNING id`, guaranteeing at most one winner across simultaneous requests.
4. **Abuse Limits & Trusted Client-IP Resolution (`lib/client-ip.js`, `auth_rate_limits`):**
   - Enforces separate sliding/tumbling-window PostgreSQL rate limits by normalized email (`5` starts / `10` verifies per `15m`) and verified client IP (`15` starts / `25` verifies per `15m`).
   - By default (`TRUCKLY_TRUST_PROXY=none`), `X-Forwarded-For` and `X-Real-IP` are ignored on socket connections. Behind local Nginx (`TRUCKLY_TRUST_PROXY=loopback`), forwarding headers are accepted **only** when `req.socket.remoteAddress` is `127.0.0.1`/`::1`, and Nginx overwrites `X-Real-IP: $remote_addr` and `X-Forwarded-For: $remote_addr` (with `lib/client-ip.js` also reading the rightmost hop as defense in depth).
5. **Account-Enumeration Behavior:**
   - `POST /api/auth/start` returns an identical `200` payload (`{ ok: true, expires_in_seconds, has_passkey: false, passkeys_supported: false }`) whether or not `auth_users` already contains the email. Missing-challenge verifications perform a constant-work dummy HMAC before returning `401`.
6. **Session Creation, Rotation, Expiration, Logout & Revocation (`auth_sessions`):**
   - Sessions use `256-bit` CSPRNG tokens (`base64url`); PostgreSQL stores only `token_sha256`.
   - Re-authenticating rotates the session token and revokes any prior session cookie presented by the client (`revoked_at = now()`).
   - Default TTL is `14 days` (sliding renewal inside `< 7 days` remaining, capped at `30 days` `max_expires_at`). `POST /api/auth/logout` marks `revoked_at = now()` server-side and clears the cookie (`Max-Age=0`). Disabled users (`disabled_at IS NOT NULL`) fail closed immediately.
7. **Cookie Settings:**
   - Uses `__Host-truckly_session` with `HttpOnly; Secure; Path=/; SameSite=Lax` and **no** `Domain` attribute.
8. **CSRF & Same-Origin Protections:**
   - All mutating API requests (`POST`, `PUT`, `PATCH`, `DELETE`, except loopback Bearer-authenticated `/api/pager/worker`) enforce `verifySameOriginMutationRequest`: `Sec-Fetch-Site` check, `Origin` (and `Referer` fallback) host + HTTPS check, and `Content-Type: application/json` enforcement (plus `X-Truckly-Client: web-auth-v1` on `/api/auth/*`).
9. **Protected Staging Mailbox, Logging & Retention:**
   - `staging_mailbox` mode fails closed unless `TRUCKLY_ENV=staging` (never `production`), `TRUCKLY_STAGING_MAILBOX_SECRET` (`>= 24` chars) is set, and the email matches `TRUCKLY_STAGING_ALLOWED_EMAIL_DOMAINS` / `TRUCKLY_STAGING_ALLOWED_EMAILS`.
   - Staging mailbox entries are encrypted at rest with `AES-256-GCM` (HKDF-derived key + AAD binding email and challenge ID), purged immediately upon consumption or invalidation, and readable only via `POST /api/auth/staging-mailbox` with `X-Staging-Mailbox-Secret` (returning `404` otherwise).
   - Server logs and `audit_logs` never record OTP codes, session tokens, or cookies. `cleanupExpiredAuthRecords` purges expired mailbox rows immediately, OTP/rate-limit rows after `24h`, and expired/revoked sessions after `7d`.
10. **Frontend Auth Bridge (`public/auth-client.js`, `public/login.html`):**
    - Narrowly implements `window.hatchable.auth` over `/api/auth/{start,verify,session,logout}` with `supportsPasskeys() === false` and displays a visible notice on `/login.html` disclosing that passkeys are unavailable in standalone staging.

---

## 4. Independent Pre-Installation Code Review Findings & Narrow Fixes

Before installing anything on the VPS, an explicit line-by-line review of the standalone runtime, custom OTP/session logic, database grants, and deployment templates identified and corrected five material issues:

| ID | Area | Finding | Fix & Regression Coverage |
|---|---|---|---|
| `REV-01` | HTTP Caching & Session Resolution (`server/app.js`) | `server/app.js` resolved session cookies on `access: "public"` routes as well as `access: "user"` routes, risking sliding-window `Set-Cookie` headers on `Cache-Control: public` `/api/trucks` responses and adding extra DB queries on public reads. | Restricted `resolveSessionFromRequest` strictly to `access === 'user'` routes (plus `/api/auth/session` and staging probe). Verified in `standalone-runtime-auth.integration.cjs` (`[6/8]`). |
| `REV-02` | CSRF & Canonical Origin (`lib/standalone-auth.js`, `lib/authz.js`) | `verifySameOriginMutationRequest` enforced `https:` on `Origin` in hosted mode, but omitted `https:` protocol validation in the `Referer` fallback branch and did not bind `Host`/`Origin` to `TRUCKLY_PUBLIC_ORIGIN` when configured; private responses lacked `Vary: Cookie, Origin`. | Added `CSRF_INSECURE_REFERER` check, optional `TRUCKLY_PUBLIC_ORIGIN` canonical origin/host enforcement, and `Vary: Cookie, Origin` on `applyPrivateNoStoreHeaders`. Verified in `[6/8]`. |
| `REV-03` | Protected Staging Mailbox Boundary (`server/app.js`, `lib/standalone-auth.js`, `deploy/nginx/truckly-staging.conf.template`) | `/api/auth/staging-mailbox` relied solely on `X-Staging-Mailbox-Secret` without a loopback socket guard, per-IP rate limit, or explicit Nginx `404` rule. | Restricted `/api/auth/staging-mailbox` to loopback sockets by default (`TRUCKLY_ALLOW_REMOTE_STAGING_MAILBOX !== '1'`), added per-IP `staging_mailbox_ip` rate limiting, and added explicit `404` blocks for `/api/auth/staging-mailbox` and `/api/_staging_gate_probe` in Nginx template. |
| `REV-04` | Concurrent OTP Start, Disabled Accounts & Session Bounds (`migrations/017`, `lib/standalone-auth.js`) | Concurrent `POST /api/auth/start` calls for the same email could insert two active unconsumed challenges under `READ COMMITTED`; `verifyEmailOtpChallenge` updated `last_login_at` before checking `disabled_at` and allowed unbounded active sessions per user. | Added partial unique index `idx_auth_otp_one_active_per_email` + `pg_advisory_xact_lock`, checked `disabled_at` (`FOR UPDATE` + session revocation) before mutating `auth_users`, guarded `timingSafeEqual` buffer length, and bounded active sessions at `MAX_ACTIVE_SESSIONS_PER_USER = 10`. Verified in `[5/8]`. |
| `REV-05` | Least-Privilege DB Grants & Socket Hygiene (`scripts/run-migrations.cjs`, `server/app.js`) | `run-migrations.cjs` left `UPDATE, DELETE` granted to the runtime app role on append-only `audit_logs` and `SELECT` on `schema_migrations`; `413` responses did not tear down streaming sockets on `finish`. | Revoked `UPDATE, DELETE ON audit_logs` and `ALL ON schema_migrations` from `--app-role`, destroyed oversized `413` sockets on `finish`, and hardened `systemd` units (`UMask=0077`, empty `CapabilityBoundingSet=`). Verified in `[6/8]` and `vps-staging-gates.cjs`. |
| `DEF-VPS-03` | Loopback Proxy Trust Default (`deploy/staging.env.example`, `deploy/nginx/truckly-staging.conf.template`) | `deploy/staging.env.example` defaulted `TRUCKLY_TRUST_PROXY=loopback` before the Nginx reverse proxy was active to overwrite `X-Real-IP: $remote_addr` and `X-Forwarded-For: $remote_addr`, allowing loopback/tunneled callers on `127.0.0.1:4100` to rotate `X-Real-IP` / `X-Forwarded-For`. | Changed `deploy/staging.env.example` default to `TRUCKLY_TRUST_PROXY=none` and paired `TRUCKLY_TRUST_PROXY=loopback` strictly with Nginx vhost activation in `deploy/nginx/truckly-staging.conf.template` (`614dc99`). Verified in `[6/8]` and live VPS Stage 1. |
