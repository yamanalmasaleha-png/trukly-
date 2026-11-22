# Domain Map — Pickup Pagers & Web Push Notifications

- **Authoritative Deep Dive**: [PAGER_NOTIFICATIONS_RUNBOOK.md](../../PAGER_NOTIFICATIONS_RUNBOOK.md) *(note: primary env prefix is now `BITESHARK_*` + Migration `022` feature controls)*

## 1. Current Behavior (Including Disabled Hosted State)
Provides capability-URL customer pickup pagers (`#pager=<uuid>`, scrubbed immediately from browser URL history via `history.replaceState` to prevent Referer leakage), vendor staff kitchen queue creation/updates (`cooking` -> `almost` -> `ready` -> `collected` / `cancelled`), and a lease-fenced PostgreSQL outbox worker (`scripts/run-pager-worker.cjs` -> `POST /api/pager/worker`) implementing zero-dependency RFC 8291 (`aes128gcm`) + RFC 8292 (`ES256` VAPID) Web Push encryption (`lib/webpush-crypto.js` + `public/sw.js`).
- **Hosted Operational State**: `BITESHARK_PUSH_PROVIDER_MODE` defaults to **`disabled`** on both `staging.biteshark.live` and `staging2.biteshark.live` (`staging2` also runs `WORKER=none`) until physical iOS/Android background push gates (`PD-01`–`PD-18`) are separately approved.

## 2. Entry Points, APIs, Data & Flags
- **Code**: `lib/pager-notifications.js`, `lib/webpush-crypto.js`, `api/pager/{staff,status,subscriptions,telemetry,update,worker}.js`, `scripts/run-pager-worker.cjs`, `public/pager.js`, `public/pager.css`, `public/pager-experience.css`, `public/sw.js`.
- **Tables**: `pickup_pagers`, `pager_rate_limits` *(no RLS)*; `pager_notification_subscriptions`, `pager_notification_events`, `pager_notification_deliveries` *(`FORCE RLS` via `app.pager_lookup_id`, `app.subscription_lookup_id`, `app.vendor_id`, `app.is_notification_worker`, `app.is_platform_admin`)*.
- **Feature Flags & Env Stops**: `pickup_pager_demo`, `pickup_pager_creation`, `pager_push_delivery`, `pager_push_subscriptions`, plus `BITESHARK_PUSH_PROVIDER_MODE`, `BITESHARK_DISABLE_SUBSCRIPTIONS`, `BITESHARK_DISABLE_NOTIFICATION_DELIVERY`, `BITESHARK_PAUSE_WRITES=pagers`. Note: `POST /api/pager/update` (advancing existing tickets) and `DELETE /api/pager/subscriptions` (unsubscribe) remain permitted when creation/subscriptions are paused!
- **Tests**: `tests/pager-demo.test.cjs`, `tests/pager-notifications.integration.cjs`, `tests/pager-notifications-browser.e2e.cjs`.
- **Known Inconsistencies**: `.pager-steps` in `public/pager.css` is orphaned (`pager.js` renders `.pager-roadmap`).
