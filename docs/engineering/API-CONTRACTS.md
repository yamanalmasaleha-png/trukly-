# Backend HTTP API Contracts

This document summarizes BiteShark's HTTP route families, shared contracts, internal-only endpoints, and known client-server nuances.
- For the AST-extracted inventory of **97** HTTP routes indexed on `working/biteshark-vps` (with method basis, auth/authz evidence, per-method feature gates, confirmed frontend callers, and 3-tier test references), see [ROUTE-INVENTORY.md](generated/ROUTE-INVENTORY.md).
- For structured shared contracts (`CTR-*`), see [generated/CONTRACTS-CATALOG.md](generated/CONTRACTS-CATALOG.md) ([contracts/shared-contracts.json](contracts/shared-contracts.json)).
- For exact JSON envelope, header, and global error-code contracts, see [contracts/shared-api-envelopes.md](contracts/shared-api-envelopes.md).

---

## 1. Public vs Authenticated vs Internal Endpoint Boundaries

> [!CAUTION]
> **Internal / Operator-Only Endpoints (Never Expose in Public Product Docs or Nginx)**:
> - `POST /api/pager/worker`: Loopback socket + `Authorization: Bearer <NOTIFICATION_WORKER_SECRET>` (`403` at Nginx edge).
> - `POST /api/auth/staging-mailbox`: Loopback socket + `X-Staging-Mailbox-Secret` when `AUTH_DELIVERY_MODE=staging_mailbox` (`404` at Nginx edge).
> - `POST /api/_staging_gate_probe`: `ENV=staging` + `ENABLE_STAGING_PROBE=1` + `X-Staging-Probe-Token` + `Admin: Top` session (`404` at Nginx edge).

---

## 2. Route Family Summary & Key Contracts

### A. Health & Public Feature/Discovery Endpoints
- `GET /api/healthz` (`server/app.js`): Public health probe returning `{ status: 'ok', service: 'biteshark-standalone', env, release_sha, domain_routes: 30 }` (`503` on env alias conflict or DB ping failure). Used by `deploy/install-staging-release.sh` to verify `release_sha === TARGET_SHA`.
- `GET /api/features` (`server/admin-routes.js` -> `lib/feature-controls.js`): Evaluates all feature controls for the caller's session/role (`all` vs `staff_beta`). Age-gate exempt.
- `GET /api/trucks` (`api/trucks.js` -> `lib/discovery.js`): Canonical catalog payload `{ catalog_version, generated_at, total, map_config, trucks }` (`30s` memory cache; `?fresh=1` bypasses cache; returns `503` on DB outage).
- `GET /api/trucks/nearby?lat=<num>&lng=<num>`: Distance-sorted catalog + 5 Sonoma hubs (`400` on invalid coordinates).
- `GET /api/trucks/availability?truck_id=<id>&date=<YYYY-MM-DD>`: Checks catering date availability (`event_inquiries` feature gate).
- **6 Unreferenced Legacy Public Endpoints** (retained for `REGISTERED_DOMAIN_ROUTE_COUNT === 30` in `server/routes.js` — **do not delete**):
  `GET /api/catalog/cities`, `GET /api/catalog/cuisines`, `GET /api/catalog/featured`, `GET /api/schedule/today`, `GET /api/trucks/search`, `GET /api/trucks/:id`.

### B. Authentication & Session Endpoints (`/api/auth/*` -> `lib/standalone-auth.js`)
- `GET /api/auth/session`: Returns `{ ok: true, authenticated, user, auth_delivery }`; slides 14-day cookie TTL past half-life up to 30-day hard cap.
- `POST /api/auth/start`: Requires `X-BiteShark-Client: web-auth-v1` + JSON `{ email, intent: 'login'|'signup', birth_year?, birth_month?, birth_day?, invite_token? }`. Enforces IP/email rate limits, 14+ signup age check (`403 AGE_INELIGIBLE` + `__Host-bs_age_gate`), and staging recipient allowlists.
- `POST /api/auth/verify`: Verifies 6-digit HOTP code (`<= 5` attempts, 10-min TTL) and sets `HttpOnly; Secure; SameSite=Lax` `__Host-truckly_session`.
- `POST /api/auth/age-assessment`: One-time 14+ DOB verification for pre-existing `not_assessed` accounts (`< 14` suspends account and revokes all sessions).
- `POST /api/auth/logout`: Revokes active `auth_sessions` row and expires `__Host-truckly_session`.

### C. Customer Favorites, Notifications, Bookings, Community & Support
- `GET /api/favorites/list`, `POST /api/favorites/toggle` (`{ truck_id }`).
- `GET|POST /api/notifications/settings` (`{ nearby_enabled, radius_miles }` `1..30`, gated by `nearby_alert_preferences` on `POST`).
- `GET /api/bookings/list`, `POST /api/bookings/create` (`201`, gated by `event_inquiries`, Pacific `event_date >= today`, `pg_advisory_xact_lock` on `(truck_id, event_date)` and `(requester_id, idempotency_key)`).
- `GET /api/community/list` (`community_hub`), `GET /api/community/mine`, `POST /api/community/post` (`community_submissions`, 5/hr rate limit + `idempotency_key`), `POST /api/community/report`.
- `GET|POST /api/issues`, `POST /api/issues/reply`, `POST /api/issues/reopen`, `POST /api/issues/read` (`server/admin-routes.js` + `lib/support-tickets.js`; **exempt from feature-control disablement and age-gate lockout** so users can always request privacy/account help).
- **Customer Exploration, Journal, Private Photos & Suggested Trails** (`server/customer-exploration-routes.js`):
  - Public: `GET /api/stories`, `GET /api/trails/suggest` (also exempt from `14+` pending-age gate so signed-in `not_assessed` sessions can still browse public stories and suggested trails).
  - Personal (`14+` authenticated + `FORCE RLS`): `GET /api/me/exploration`, `POST /api/me/exploration/import`, `GET /api/me/exploration/export`, `GET|POST /api/me/visits`, `POST /api/me/visits/delete`, `GET|POST /api/me/photos`, `GET /api/me/photos/file?id=&variant=&download=`, `POST /api/me/photos/delete`, `GET|POST /api/me/trails`, `POST /api/me/trails/delete` (privacy export `/api/me/exploration/export`, owner binary download `/api/me/photos/file`, and self-service deletes `/api/me/{visits,photos,trails}/delete` remain accessible even when UI feature controls are `hidden`).

### D. Pickup Pagers (`/api/pager/*`)
- Customer capability endpoints (unauthenticated UUID bearer): `GET /api/pager/status?code=<uuid>`, `GET|POST|DELETE /api/pager/subscriptions` (`X-BiteShark-Client: web-pager-v1`; `DELETE` remains allowed even when `pager_push_subscriptions` is paused/hidden!).
- Vendor staff/owner endpoints: `GET|POST /api/pager/staff` (`pickup_pager_creation` on `POST`), `POST /api/pager/update` (`cooking|almost|ready|collected|cancelled`; enqueues Web Push on transition to `ready`).
- Admin telemetry: `GET /api/pager/telemetry` (`Admin: Top`).

### E. Vendor Operations, Onboarding, Invitations & Admin Portal
- Vendor Operations: `GET|POST /api/owner/{profile,location,schedule,requests}`, `GET /api/owner/{stats,bookings}` *(both `/api/owner/requests` and `/api/owner/bookings` are called conditionally in `public/app.js#loadOwnerRequests`)*.
- Vendor Team & Onboarding: `GET|POST /api/onboarding/applications`, `GET|POST|DELETE /api/onboarding/evidence` (`<= 512 KiB` magic-byte-verified PDF/PNG/JPEG/WebP; `DELETE` allows applicant on editable drafts or `Admin: Top` with audited reason), `GET|DELETE /api/vendor/members`, `POST /api/vendor/staff-invitations`, `GET|POST /api/invitations/inspect`, `POST /api/invitations/accept`.
- Admin Portal (`/api/admin/*` in `server/admin-routes.js`): `overview`, `email-readiness` (`Top`), `vendor-preview`, `applications` + `applications/decision`, `vendors` + `vendors/update`, `accounts` + `accounts/role` (`Top`) + `accounts/status` (`Top`), `invitations` + `invitations/create` + `invitations/decision` + `invitations/resend`, `moderation` + `moderation/decision`, `issues` + `issues/update` + `issues/diagnostics`, `readiness` + `readiness/note` + `readiness/update` (`Top`), `features` + `features/update` (`Top`), `diagnostics` + `diagnostics/{detail,triage,note,synthetic-test,cleanup,notify-tickets}`, `audit`.

---

## 3. Duplicated Browser Fetch Clients (Known Debt — Do Not Proliferate)

Seven fetch patterns currently coexist in `public/`:
1. `window.bitesharkDiagnostics.fetchJsonBounded` (`diagnostics-client.js` — **canonical**)
2. `appFetchJson` (`app.js` — wraps `fetchJsonBounded` with fallback `fetch`)
3. `rxJson` (`role-experience.js` — wraps `fetchJsonBounded`, throws `Error` on `!ok`)
4. `apiJson` (`admin.js` — wraps `fetchJsonBounded`, throws `Error` on `!ok`, redirects on `401`)
5. `kitchenFetch` (`pager.js` — `redirect: 'manual'`)
6. `postAuthJson` / `getSession` (`auth-client.js` — raw `fetch` with `AbortController`)
7. Raw `fetch` in `app.js` (`/api/trucks`, `/api/trucks/nearby`), `community.js` (`/api/community/moderate`), and `role-experience.js` (`/api/features`).
