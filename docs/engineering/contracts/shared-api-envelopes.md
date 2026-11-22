# Shared HTTP API Envelope, Header & Idempotency Contracts

This contract documents the **actual verified HTTP request/response shapes** across BiteShark's backend tiers as of base commit `a4e9f532223f88486610a3c8a1babaa58c6e4ee6` (plus additive `/api/stories`, `/api/trails/suggest`, and `/api/me/*` routes on `feature/customer-exploration-journal-trails` @ `83181ba0fea67183e21781896447f19f1a8f4860`). Frontend work must preserve these shapes because BiteShark uses **two distinct response conventions** depending on route family.

---

## 1. Two Coexisting Response Envelope Families

### Family A — Modern Governance, Auth & Exploration Routes (`{ ok: true, ... }`)
- **Routers**: [app.js](../../../server/app.js), [standalone-auth.js](../../../lib/standalone-auth.js), [admin-routes.js](../../../server/admin-routes.js) *(and `server/customer-exploration-routes.js` on `83181ba`)*.
- **Success (`200` / `201`)**:
  ```json
  {
    "ok": true,
    "...domain_fields": "..."
  }
  ```
- **Error (`400` / `401` / `403` / `404` / `405` / `409` / `413` / `422` / `429` / `503` / `500`)**:
  ```json
  {
    "error": "Human-readable message safe for UI display.",
    "code": "MACHINE_READABLE_UPPER_SNAKE_CODE",
    "correlation_id": "corr_0123456789abcdef"
  }
  ```
  *(Note: `correlation_id` + `X-Correlation-Id` are guaranteed on unexpected `>= 500` responses via `res.__bsDiagHook` in [app.js](../../../server/app.js#L516-L550) and on auth/email/diagnostic failures.)*

### Family B — Legacy 30-Route Domain Handlers (Bare Payloads / Arrays)
- **Router**: [routes.js](../../../server/routes.js) dispatching to `api/**/*.js`.
- **Success (`200` / `201`)**: Returns bare objects or arrays **without** an `ok: true` wrapper:
  - `GET /api/trucks` -> `{ "catalog_version": "...", "generated_at": "...", "total": 59, "map_config": { ... }, "trucks": [ ... ] }`
  - `GET /api/bookings/list` -> `[ { "id": 1, "truck_id": "...", ... } ]`
  - `POST /api/bookings/create` -> `201` `{ "id": 42, "status": "pending", ... }`
  - `GET /api/favorites/list` -> `[ "mitote", "el-roys", ... ]` (or `{ favorites: [...] }` normalized by `app.js`)
  - `POST /api/favorites/toggle` -> `{ "favorited": true, "truck_id": "mitote" }`
  - `GET /api/community/list` -> `[ { "id": 1, "vendor_id": "...", ... } ]`
- **Error (`4xx` / `5xx`)**: Returns `{ "error": "..." }`, optionally accompanied by `"code"` (e.g. `AGE_ASSESSMENT_REQUIRED`, `FEATURE_PAUSED`, `FEATURE_DISABLED`, `SESSION_REVOKED`).
- **Direction for New Routes**: New routes added outside the frozen 30-file `api/` directory must use **Family A** (`{ ok: true, ... }` on success and `{ error, code }` on failure). Do **not** wrap existing `api/*.js` responses in `{ ok: true }` without updating every caller in `public/*.js` and `tests/*.cjs`.

---

## 2. Mandatory Security & Context Request Headers

| Header | Sent By | Consumed By | Contract |
|---|---|---|---|
| `Cookie: __Host-truckly_session=<token>` | Browser (`credentials: 'same-origin'`) | `resolveSessionFromRequest` ([standalone-auth.js](../../../lib/standalone-auth.js)) | Authoritative session credential (`HttpOnly; Secure; SameSite=Lax; Path=/`). Never send user IDs in body/query/headers to claim identity. |
| `X-BiteShark-Client: web-auth-v1` *(alias `X-Truckly-Client`)* | `public/auth-client.js` | `verifySameOriginMutationRequest` ([standalone-auth.js](../../../lib/standalone-auth.js)) | Required on `POST /api/auth/{start,verify,age-assessment,logout}`. |
| `X-BiteShark-Client: web-pager-v1` | `public/pager.js` | `verifySameOriginMutation` ([pager-notifications.js](../../../lib/pager-notifications.js)) | Required on `POST`/`DELETE /api/pager/subscriptions`. |
| `X-BiteShark-Viewpoint: preview` | `public/role-experience.js` (`window.fetch` wrapper) | Step 0 guard ([app.js](../../../server/app.js#L556-L566)) | Rejects any `POST`/`PUT`/`PATCH`/`DELETE` (except `/api/auth/logout`) with `403 ADMIN_PREVIEW_READ_ONLY`. |
| `X-BiteShark-Act-On-Behalf: <vendor_id>` + `X-BiteShark-Support-Reason: <8..240 chars>` | `public/role-experience.js` | `parseActOnBehalfHeaders` ([app.js](../../../server/app.js#L146-L169)) | Permitted **only** for `Admin: Top` (`403 ACT_ON_BEHALF_FORBIDDEN` for `Mod`/others); logged in `audit_logs`. |
| `Idempotency-Key` / `body.idempotency_key` | Client mutation callers | Booking, community, support, invitation & exploration handlers | Deduplicates retried mutations after `outcome_uncertain` network timeouts. Note length rules: bookings `8..128` chars (header or body), governance/support `6..128` chars (body), community `8..80` chars (body). |

---

## 3. Standard Platform Response Headers on `/api/*`

- `X-BiteShark-Release`: Active server commit SHA (`BITESHARK_RELEASE_SHA` / `GITHUB_SHA` / `'local'`), inspected by `public/diagnostics-client.js` to detect client/server version skew across deploys.
- `X-BiteShark-Client-Bundle`: Expected frontend bundle version (`bs-ui-2026.11.20` in [diagnostics.js](../../../lib/diagnostics.js#L18)).
- `X-Correlation-Id`: `corr_<16-hex>` attached to `>= 500` and diagnostic-tracked error responses.
- `Cache-Control: private, no-store`: Enforced via `applyPrivateNoStoreHeaders` ([authz.js](../../../lib/authz.js)) on all authenticated, governance, pager-status, and session responses.

---

## 4. Globally Reserved Error Codes Handled by Browser Middleware

Frontend code in `public/role-experience.js`, `public/diagnostics-client.js`, and `public/admin.js` intercepts these exact `code` values globally — **never rename them**:
- `AGE_ASSESSMENT_REQUIRED` (`403`): Opens `#rxAgeAssessmentModal` (or redirects `/admin` -> `/login.html?assess=1`).
- `SESSION_REVOKED` / `ACCOUNT_SUSPENDED` (`401` / `403`): Triggers client sign-out cleanup and session refresh.
- `FEATURE_PAUSED` (`503`) / `FEATURE_DISABLED` (`403`) / `FEATURE_CONFIG_UNAVAILABLE` (`503`): Triggers `window.bitesharkFeatures.refresh()` and displays truthful pause/unavailable messaging without recording false server-crash diagnostics.
- `ADMIN_PREVIEW_READ_ONLY` (`403`): Reminds admin user that Customer/Vendor Viewpoint preview is read-only.
- `REVISION_CONFLICT` (`409`): Prompts `Admin: Top` in `/admin#features` to reload concurrent feature-control changes.
