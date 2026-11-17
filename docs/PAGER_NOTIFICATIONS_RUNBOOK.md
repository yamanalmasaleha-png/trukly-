# Pickup Pager Notifications Architecture, Contracts & Incident Runbook

This document specifies the architecture, security/privacy model, schema, API & worker contracts, browser/platform requirements, native APNs/FCM adapter contract, deployment configuration, physical-device verification checklist, and incident recovery procedures for Truckly's background pickup-pager notifications.

---

## 1. Selected Delivery Path & Platform Support

### Workspace Inspection
Truckly has **no native Android or iOS app project** (`android/`, `ios/`, Gradle, or Xcode workspaces do not exist; the application is a mobile-first web app in `public/`). Accordingly:
1. **Implemented working path:** Provider-neutral durable PostgreSQL outbox + **standards-compliant Web Push** (`aes128gcm` payload encryption per **RFC 8291 / RFC 8188** and **VAPID ES256** authentication per **RFC 8292**, implemented using Node's built-in `node:crypto` in [`lib/webpush-crypto.js`](../lib/webpush-crypto.js) with zero third-party runtime dependencies) paired with [`public/sw.js`](../public/sw.js) and [`public/manifest.json`](../public/manifest.json).
2. **Documented native adapter contract:** `pager_notification_subscriptions.channel` supports `'web_push' | 'apns' | 'fcm'`. Until a packaged native app and APNs/FCM credentials exist, `'apns'` and `'fcm'` return HTTP `501` (`code: "NATIVE_PUSH_NOT_CONFIGURED"`).
3. **Sample pager isolation:** `pagerDemo === true` in [`public/pager.js`](../public/pager.js) renders **no** push opt-in UI and makes **zero** `/api/pager/*` or subscription requests.

### Browser & OS Requirements (Official Platform Rules)
- **Android (Chrome, Edge, Firefox) & Desktop (Chrome, Edge, Firefox, Safari 16+ on macOS):** Supports Web Push directly from HTTPS tabs after an explicit user gesture (`🔔 Notify me when ready`).
- **iPhone / iPad (iOS & iPadOS 16.4+ Safari / WebKit):**
  - WebKit requires the site to be installed to the user's **Home Screen** (`Share → Add to Home Screen`) and launched in standalone mode via [`public/manifest.json`](../public/manifest.json) (`"display": "standalone"`).
  - Permission (`Notification.requestPermission()`) **must** be triggered from a direct user tap (`#pagerSubscribeBtn`).
  - Every delivered Web Push **must** display a visible notification via `registration.showNotification()` within 30 seconds (enforced unconditionally by [`public/sw.js`](../public/sw.js)).
  - Regular non-installed iOS Safari tabs detect `isIosNeedsHomeScreen()` in [`public/pager.js`](../public/pager.js) and display step-by-step `"Add to Home Screen"` instructions while keeping foreground ~8-second live polling active — never promising background alerts when unavailable.

---

## 2. Security, Privacy & Capability Model

1. **Capability-Authorized Subscriptions (`POST /api/pager/subscriptions`):**
   - Requires possession of an active, non-expired, non-terminal private pager capability (`code` matching `pickup_pagers.id`).
   - Enforces at most `5` active devices per pager (`MAX_ACTIVE_SUBSCRIPTIONS_PER_PAGER`).
   - Returns `{ subscription: { id, channel, status, expires_at }, unsubscribe_token }` — **never** returning `endpoint_url`, `p256dh_key`, `auth_secret`, or other subscribers' records.
2. **Unsubscribe & Shared-Device Privacy (`DELETE /api/pager/subscriptions`):**
   - Authorized by `(subscription_id, unsubscribe_token)` or `(subscription_id, code)`.
   - Marks `status = 'unsubscribed'`, suppresses pending deliveries, and **immediately scrubs** `endpoint_url`, `p256dh_key`, `auth_secret`, and `device_token` to `NULL` (enforced by PostgreSQL constraint `pager_sub_material_scrubbed_chk`).
3. **Zero Bearer-UUID Exposure in Push Payloads, URLs, or Logs:**
   - Outbox and encrypted push payloads contain only `{ title, body, vendor, ticket, collapse_key, event_id, subscription_id, open_url: "/#pager-ref=<subscription_id>" }`.
   - The raw private pager bearer UUID (`pickup_pagers.id`) **never** appears in `pager_notification_events.payload`, Web Push ciphertext, notification click URLs, `audit_logs`, `/api/pager/telemetry`, or [`public/debug-admin.js`](../public/debug-admin.js).
   - When a customer opens `/#pager=<uuid>` or `/#pager-ref=<subscription_id>`, [`public/pager.js`](../public/pager.js) immediately scrubs `location.hash` from the browser address bar via `history.replaceState`.
4. **CSRF, SSRF & Rate-Limit Protections:**
   - **CSRF:** Browser `POST`/`DELETE` mutations require `X-Truckly-Client: web-pager-v1` and pass `Sec-Fetch-Site` + `Origin`/`Host` same-origin checks (`403` otherwise).
   - **SSRF:** Only `https:` port `443` URLs on allowlisted push domains (`fcm.googleapis.com`, `*.push.services.mozilla.com`, `*.push.apple.com`, `*.notify.windows.com`, plus optional server env `TRUCKLY_PUSH_ALLOWED_HOSTS`) with validated on-curve P-256 `p256dh` (65 bytes) and `auth` (16 bytes) keys are accepted. IP literals, credentials, fragments, and path traversals are rejected (`400`).
   - **Rate Limits (`pager_rate_limits`):** Stateless PostgreSQL fixed-window buckets rate-limit `/api/pager/status` (`90 / 60s` per hashed client) and `/api/pager/subscriptions` (`12 / 300s` per hashed client; `10 / 300s` per hashed pager) with `429` + `Retry-After`.
5. **Database Defense-in-Depth (`migrations/015_pager_notifications_outbox.sql`):**
   - None of the notification tables are exposed in `hatchable.toml`.
   - All four tables (`pager_notification_subscriptions`, `pager_notification_events`, `pager_notification_deliveries`, `pager_rate_limits`) enforce `FORCE ROW LEVEL SECURITY` requiring transaction-local `app.pager_internal = 'true'`.
   - [`public/sw.js`](../public/sw.js) registers **zero `fetch` caching listeners**, guaranteeing private API responses are never cached in Service Worker storage.

---

## 3. Durable Outbox, Worker Lease, Retry & Retention Contracts

- **Atomic Outbox Enqueue (`POST /api/pager/update`):**
  - Runs inside the same `withTransaction` as `UPDATE pickup_pagers`. If the transaction fails or rolls back, zero outbox events or deliveries persist.
  - Emits `pager.ready` only when transitioning from a non-ready state (`cooking` / `almost`) to `ready`, subject to a **60-second anti-flap cooldown** (`READY_FLAP_COOLDOWN_MS`) on the locked `pickup_pagers` row so repeated kitchen clicks do not storm customers.
  - Transitioning to `collected` or `cancelled` atomically marks queued/retry deliveries `suppressed` and scrubs active subscriptions (`status = 'expired'`).
- **At-Least-Once Worker Claim & Lease Recovery (`POST /api/pager/worker` / `scripts/run-pager-worker.cjs`):**
  - Claims up to `25` rows (`default 15`) using `FOR UPDATE SKIP LOCKED` across due `queued`/`retry_scheduled` rows **and** crashed `processing` rows where `lease_expires_at <= now()` (`45s` lease).
  - Increments `attempt_count` at claim time to prevent poison-message crash loops.
  - Minimizes duplicate user alerts on at-least-once replays using Web Push `Topic: pager-ready:<hash>` header + Service Worker `tag: collapse_key` (`renotify: false`).
  - **Retry schedule:** Exponential backoff `15s → 45s → 120s → 300s → 600s` (`max_attempts = 5`) on network timeouts, `408`, `429`, and `5xx`.
  - **Permanent failure & token cleanup:** `404` or `410 Gone` marks delivery `failed_permanent` and atomically marks the subscription `invalidated` with `NULL` endpoint/keys.
  - **Retention (`purgeExpiredNotificationRecords`):** Scrubs key material immediately when subscriptions/pagers expire, purges terminal events/deliveries/subscriptions older than **24 hours**, and purges rate-limit buckets older than **2 hours**.

---

## 4. Deployment Configuration & Secret Names (Never Commit Values)

| Environment Variable / Secret Name | Required Value / Format | Default When Unset |
|---|---|---|
| `TRUCKLY_PUSH_PROVIDER_MODE` | `disabled` \| `fake` \| `webpush` (`loopback_test` in local E2E only) | `disabled` (safe default — never sends pushes accidentally) |
| `TRUCKLY_VAPID_PUBLIC_KEY` | 87-char base64url uncompressed P-256 public key | Unset (push disabled) |
| `TRUCKLY_VAPID_PRIVATE_KEY` | 43-char base64url 32-byte P-256 private scalar (**secret manager only**) | Unset (push disabled) |
| `TRUCKLY_VAPID_SUBJECT` | Contact URI (`mailto:ops@...` or `https://...`) | Unset (push disabled) |
| `TRUCKLY_NOTIFICATION_WORKER_SECRET` | Random `>= 24`-char secret authenticating `POST /api/pager/worker` (**secret manager only**) | Unset (`503 WORKER_NOT_CONFIGURED`) |
| `TRUCKLY_DISABLE_SUBSCRIPTIONS` | `1` / `true` to pause new push registrations (`503`) | `0` |
| `TRUCKLY_DISABLE_NOTIFICATION_DELIVERY` | `1` / `true` to pause worker dispatch while retaining outbox rows | `0` |
| `TRUCKLY_PAUSE_WRITES` | Comma-separated scopes (`notifications`, `pagers`, `bookings`, `community`, `owner`, `all`) | Unset |
| `TRUCKLY_RELEASE_SHA` | Deployed Git commit SHA surfaced in `GET /api/pager/telemetry` | `local-dev` |

### Scheduler / Worker Execution
Serverless functions must **never** rely on in-request `setTimeout` timers for background delivery. Trigger `POST /api/pager/worker` every `10–15 seconds` from a supported external scheduler (e.g., Cloud Scheduler, GitHub Actions/cron runner, or a small supervised daemon running `node scripts/run-pager-worker.cjs --url https://<host>/api/pager/worker --max-ticks 4 --interval-ms 12000` once per minute) with `Authorization: Bearer <TRUCKLY_NOTIFICATION_WORKER_SECRET>`. Keep `TRUCKLY_PUSH_PROVIDER_MODE=disabled` until staging verification succeeds.

---

## 5. Native APNs / FCM Adapter Contract & Acceptance Gates (Future Native App)

When an Android/iOS native wrapper is built:
1. Implement provider dispatch branches for `channel = 'apns'` (HTTP/2 APNs token-based `.p8` ES256 auth) and `channel = 'fcm'` (FCM HTTP v1 OAuth2 service account) inside `dispatchToProvider` in [`lib/pager-notifications.js`](../lib/pager-notifications.js).
2. Set `TRUCKLY_ENABLE_NATIVE_PUSH=1` only after verifying on designated staging devices:
   - App killed/backgrounded & screen locked delivery
   - Deep-link tap routing to `/#pager-ref=<subscription_id>`
   - APNs `410 Unregistered` / FCM `UNREGISTERED` automatic `device_token = NULL` scrubbing.

---

## 6. Physical-Device Verification Matrix (Required Before Production Enablement)

Headless Chromium E2E (`tests/pager-notifications-browser.e2e.cjs`) does **not** substitute for real OS push service verification. Execute and record the following on designated disposable devices against isolated staging before setting `TRUCKLY_PUSH_PROVIDER_MODE=webpush` in production:

| Scenario | Target Devices | Pass Criteria |
|---|---|---|
| 1. Installed PWA background push | iPhone (iOS 16.4+, Home Screen PWA) + Android Chrome | Alert arrives within 15s with browser backgrounded. |
| 2. Screen locked privacy & alert | iPhone + Android | Lock screen shows generic ticket/vendor ready message; no bearer UUID exposed. |
| 3. Notification tap routing | iPhone + Android | Tapping notification opens Truckly directly to the ready ticket (`#pager-ref` scrubbed). |
| 4. Network loss & reconnect | Airplane mode 30s -> reconnect | Device receives queued push or foreground `online` listener refreshes status cleanly. |
| 5. Subscription invalidation (`410`) | Revoke site notification permission -> trigger ready | Worker records `invalidated_subscriptions: 1` and scrubs DB endpoint/keys to `NULL`. |
| 6. Duplicate collapse | Replay worker after simulated mid-flight retry | `Topic` + SW `tag` collapse prevents duplicate audible banners. |

---

## 7. Incident Response, Pause & Safe Recovery Runbook

1. **Immediate delivery pause (provider storm / misconfiguration):**
   - Set `TRUCKLY_DISABLE_NOTIFICATION_DELIVERY=1` (takes effect on the next worker invocation; P0 RBAC, bookings, community RLS, and foreground 8s pager polling remain 100% operational).
2. **Pause new subscriptions (abuse / endpoint flood):**
   - Set `TRUCKLY_DISABLE_SUBSCRIPTIONS=1` (blocks `POST /api/pager/subscriptions` with `503`; existing customers can still `DELETE` unsubscribe and track tickets live in-page).
3. **Inspect queue health (Platform Admin):**
   - Call `GET /api/pager/telemetry` as `platform_admin` to inspect `queued`, `processing`, `expired_leases`, `retry_scheduled`, `failed_permanent`, and `recent_redacted_errors`.
4. **Drain or suppress stale backlog before resuming:**
   - Tickets older than `pickup_pagers.expires_at` (4h) are automatically marked `expired` without sending when the worker runs `purgeExpiredNotificationRecords`! Verify `queued` count in `/api/pager/telemetry`, unset `TRUCKLY_DISABLE_NOTIFICATION_DELIVERY`, and monitor `delivered` vs `failed_permanent`.
