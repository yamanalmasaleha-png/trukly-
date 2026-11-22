# Backend Server, Router & Service Layer Map

All backend code runs on **Node.js >= 22** using native ES modules (`"type": "module"` in `package.json`), `node:http`, `node:crypto`, `pg@8.23.1`, `cookie@1.1.1`, `otplib@13.6.0`, `sharp@0.35.5`, and the repository-owned `@biteshark/runtime-adapter` *(note: `staging2` branches prior to exploration merge do not yet include `sharp@0.35.5`)*.

For the complete endpoint table, see [ROUTE-INVENTORY.md](generated/ROUTE-INVENTORY.md) and [API-CONTRACTS.md](API-CONTRACTS.md).

---

## 1. 10-Stage Request Dispatch Pipeline (`server/app.js`)

`createStandaloneServer()` in [app.js](../../server/app.js#L425-L1256) executes every incoming HTTP request through a strict, deterministic sequence:

1. **Baseline Hardening & Trusted IP**:
   - Emits `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`.
   - Strips spoofable `x-truckly-debug-role` / `x-biteshark-debug-role` headers and resets `bindVerifiedRequestUser(req, null)`.
   - Stamps `Symbol.for('truckly.trustedClientIp')` via `stampTrustedClientIp` ([client-ip.js](../../lib/client-ip.js)): trusts `X-Real-IP` / rightmost `X-Forwarded-For` **only** when `BITESHARK_TRUST_PROXY=loopback` AND `req.socket.remoteAddress` is loopback (`127.0.0.1` / `::1`).
   - Attaches `X-BiteShark-Release`, `X-BiteShark-Client-Bundle`, and `res.__bsDiagHook` (auto-recording unexpected `>= 500` API errors with `X-Correlation-Id`).
2. **Step 0 — Read-Only Admin Viewpoint Guard**:
   - Rejects any `POST`/`PUT`/`PATCH`/`DELETE` carrying `X-BiteShark-Viewpoint: preview` (except `/api/auth/logout`) with `403 ADMIN_PREVIEW_READ_ONLY`.
3. **Step 1 — `GET /api/healthz`**:
   - Calls `assertNoSecurityEnvConflicts()` and runs `SELECT 1 AS ok`; returns `{ status: 'ok', service: 'biteshark-standalone', release_sha, domain_routes: 30 }` (or `503`).
4. **Step 2 — Standalone Auth (`/api/auth/*` -> `lib/standalone-auth.js`)**:
   - Handles `session`, `start`, `verify`, `age-assessment`, `logout`, and loopback-protected `staging-mailbox` (`8 KiB` JSON body cap; requires `X-BiteShark-Client: web-auth-v1` + same-origin CSRF on mutations).
5. **Step 3 — Ephemeral Staging Probe (`POST /api/_staging_gate_probe`)**:
   - Returns `404` unless `BITESHARK_ENV=staging` AND `BITESHARK_ENABLE_STAGING_PROBE=1`; additionally requires valid `X-Staging-Probe-Token`, same-origin headers, and an active `Admin: Top` session.
6. **Step 3B — Governance, Onboarding, Support, Features, Diagnostics & Customer Exploration (`server/admin-routes.js` + `server/customer-exploration-routes.js`)**:
   - Matches `isGovernanceApiPath(pathname)` (58 paths on `working/biteshark-vps`, including 12 exploration paths delegated to `server/customer-exploration-routes.js`; 46 paths on `staging2` branches).
   - Enforces `applyPrivateNoStoreHeaders`, `verifySameOriginMutationRequest`, body size bounds (`4 KiB` on `/api/diagnostics/report`, `900 KiB` on `/api/onboarding/evidence`, `8 MiB` on `/api/me/photos`, `64 KiB` default), `parseActOnBehalfHeaders` (`Admin: Top` only), 14+ age gate (exempting public `GET /api/stories` and `GET /api/trails/suggest` alongside `isGovernanceRouteExemptFromAgeGate`), and `enforceHttpFeatureGate`.
   - Note: `POST /api/diagnostics/report` intentionally skips session resolution/refresh (`trust_level = 'browser_untrusted'`).
7. **Step 4 — 30 Domain API Routes (`server/routes.js` -> `api/**/*.js`)**:
   - `/api/pager/worker` enforces loopback socket + constant-time `NOTIFICATION_WORKER_SECRET` (`>= 24` chars) and skips cookie CSRF.
   - Mutating domain routes enforce `verifySameOriginMutationRequest` (plus `verifyPagerSubscriptionCsrf` on `/api/pager/subscriptions`).
   - `route.access === 'user'` resolves session, enforces 14+ age eligibility, binds `req.user`, sets `govState.requireEligibleSessionInTx = true`, and wraps `res` via `createHandlerResponseAdapter(res, govState)` so `SessionEligibilityError` thrown inside `withTransaction` cannot be swallowed as a generic `503` by handler `catch` blocks.
8. **Step 4B — Server-Gated Admin Portal HTML (`/admin`, `/admin/`, `/admin.html`)**:
   - Redirects unauthenticated callers (`302 /login.html?next=%2Fadmin`) and unassessed callers (`302 /login.html?assess=1&next=%2Fadmin`); returns `403` HTML to non-`Mod`/`Top` users; serves `public/admin.html` with `Cache-Control: private, no-store` to verified `Mod`/`Top` admins.
9. **Step 5 — Confined Static Asset Serving (`resolveSafePublicFile`)**:
   - Blocks `/__debug*` and `/debug-admin.*` (`404`), checks extension allowlist, verifies `fs.realpathSync` stays inside `public/`, and applies `no-cache, must-revalidate` to `NO_CACHE_STATIC_FILES` & `/policies/*` (`public, max-age=300` for other static assets — see [KNOWN-DRIFT.md](KNOWN-DRIFT.md) §2.5).

---

## 2. Shared Library Responsibilities (`lib/`)

| Module | Key Exports | Responsibility |
|---|---|---|
| [env-compat.js](../../lib/env-compat.js) | `readEnvCompat`, `assertNoSecurityEnvConflicts`, `EnvAliasConflictError` | Dual-prefix `BITESHARK_*` / `TRUCKLY_*` resolution & fail-closed conflict detection across 28 security-critical suffixes. |
| [standalone-auth.js](../../lib/standalone-auth.js) | `startEmailOtpChallenge`, `verifyEmailOtpChallenge`, `resolveSessionFromRequest`, `verifySameOriginMutationRequest`, `dispatchInvitationEmail`, `inspectAdminEmailReadiness` | Email HOTP OTP challenges, `__Host-truckly_session` lifecycle, staging recipient allowlists, AES-256-GCM staging mailbox, Resend HTTPS email dispatch, and DNS SPF/DKIM/DMARC inspection. |
| [age-policy.js](../../lib/age-policy.js) | `evaluateMinimumAgeEligibility`, `isGovernanceRouteExemptFromAgeGate`, `PROPOSED_MIN_ACCOUNT_AGE` (`14`) | Pacific-calendar `14+` age calculation without storing raw DOBs; `__Host-bs_age_gate` cooldown cookie. |
| [db-tx.js](../../lib/db-tx.js) | `withTransaction`, `SessionEligibilityError` | Single-client PostgreSQL transaction wrapper + in-transaction `FOR SHARE` lock verification on `auth_users` -> `auth_sessions`. |
| [authz.js](../../lib/authz.js) | `loadAccessContext`, `authorizeVendorOperation`, `inspectWritePauseConfig`, `isWritePaused`, `recordAuditLog` | Platform RBAC (`Top`, `Mod`), vendor memberships (`owner`, `staff`), restriction evaluation, write-pause scopes, and `audit_logs` writes. |
| [admin-governance.js](../../lib/admin-governance.js) | `verifyEvidenceBufferAndMime`, `consumeGovernanceRateLimit`, `computeIssueSlaDueAt`, `formatInvitationRowForAdmin` | Magic-byte PDF/PNG/JPEG/WebP evidence validation, invitation lifecycle helpers, SLA calculation, and rate limiting. |
| [discovery.js](../../lib/discovery.js) | `loadUnifiedDiscoveryCatalog`, `invalidateDiscoveryCache` | Canonical 59-vendor PostgreSQL reader merging `vendors`, `owner_profiles`, `truck_settings`, and Pacific `owner_schedule` with truthful location/photo filtering and 30s memory cache. |
| [map-config.js](../../lib/map-config.js) | `resolveMapRuntimeConfig` | Allowlisted map tile provider validation (`osm_standard`, `stadia_osm_bright`, `mapbox_streets`, `maptiler_streets`) & secret-key leak rejection. |
| [feature-controls.js](../../lib/feature-controls.js) | `FEATURE_CONTROLS_REGISTRY`, `ROUTE_FEATURE_ENFORCEMENT_RULES`, `evaluateFeatureControls`, `enforceHttpFeatureGate`, `updateFeatureControl` | Live 0ms-cache feature control evaluation, DAG cycle validation, optimistic concurrency (`expected_revision`), and audit history. |
| [diagnostics.js](../../lib/diagnostics.js) | `recordDiagnosticEvent`, `sanitizeDiagnosticText`, `generateCorrelationId`, `cleanupExpiredDiagnostics` | SHA-256 incident fingerprinting, multi-pass PII/secret scrubbing, sample cooldowns, release skew tracking, and retention pruning. |
| [support-tickets.js](../../lib/support-tickets.js) | `validateStaffStatusTransition`, `serializeSupportTicketForReporter`, `resolveInitialUrgencyAndPriority` | Customer/vendor support ticket state machine (`BS-001001`+) and reporter-safe serialization. |
| [pager-notifications.js](../../lib/pager-notifications.js) & [webpush-crypto.js](../../lib/webpush-crypto.js) | `enqueuePagerReadyNotificationsInTx`, `processPagerNotificationBatch`, `encryptWebPushPayload`, `createVapidAuthorizationHeader` | Lease-fenced pickup pager outbox state machine + zero-native-dependency RFC 8291 (`aes128gcm`) & RFC 8292 (`ES256` VAPID) Web Push encryption. |
| [dates.js](../../lib/dates.js) & [catalog.js](../../lib/catalog.js) | `getPacificDateYYYYMMDD`, `isValidISODateOnly`, `BOOKING_PACKAGES` | Pacific `YYYY-MM-DD` date validation and catering package definitions (`lib/catalog.js` vendor array is legacy simulator-only). |
| [customer-exploration.js](../../lib/customer-exploration.js), [photo-storage.js](../../lib/photo-storage.js) & [editorial-stories.js](../../lib/editorial-stories.js) | `computeExplorationSummaryInTx`, `logUserVisit`, `createUserPhoto`, `readUserPhotoFile`, `deleteUserPhoto`, `reconcilePhotoStorage`, `buildSuggestedTrail`, `saveUserTrail`, `importLegacyDeviceVisits`, `exportUserExplorationData`, `listEditorialStories` | Account-backed Visit Journal, EXIF-stripped private photos + reconciliation, derived points/levels/badges, Monday–Sunday weekly challenge, Suggested Trails (post-save `visited_at >= trail.created_at` progress), and sourced editorial stories. |
