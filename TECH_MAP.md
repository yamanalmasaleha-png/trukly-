# BiteShark VPS code map

## Supported architecture

```text
Browser / installed PWA
  -> HTTPS Nginx
     -> loopback Node HTTP server (systemd)
        -> verified OTP session + CSRF + Top/Mod/vendor authorization
        -> explicit domain handlers + admin/auth handlers
        -> repository-owned runtime adapter -> bounded pg.Pool
           -> PostgreSQL: additive migrations, restricted app role, forced RLS
systemd worker -> authenticated loopback worker endpoint -> outbox -> Web Push
OTP request -> configured HTTPS transactional email provider
```

Only the VPS runtime is supported. No filesystem-to-serverless-route discovery or external hosted authentication SDK is used.

| Area | Source |
| --- | --- |
| Process startup, restricted DB role, shutdown | `server/index.js` |
| HTTP bounds, origin/CSRF checks, sessions, static confinement | `server/app.js` |
| Explicit domain route and method/access manifest | `server/routes.js` |
| Admin routes, review, accounts, readiness | `server/admin-routes.js`, `lib/style-guide-admin.js`, `lib/admin-test-customer.js` |
| Customer exploration, private photos, profiles & unlisted sharing | `server/customer-exploration-routes.js`, `server/customer-profile-routes.js`, `lib/customer-exploration.js`, `lib/customer-profile.js`, `lib/photo-storage.js` |
| PostgreSQL/request identity adapter | `packages/runtime-adapter/index.js` |
| OTP/session/email and diagnostics | `lib/standalone-auth.js` |
| Vendor permissions and audit | `lib/authz.js`, `lib/admin-governance.js` |
| 14+ age eligibility | `lib/age-policy.js` |
| Canonical customer discovery | `lib/discovery.js`, `lib/catalog.js` |
| Pinned transactions and date semantics | `lib/db-tx.js`, `lib/dates.js` |
| Push outbox, fencing and crypto | `lib/pager-notifications.js`, `lib/webpush-crypto.js` |
| Frontend and same-origin auth bridge | `public/app.js`, `public/auth-client.js`, `public/login.html` |
| Admin frontend | `public/admin.html`, `public/admin.js`, `public/role-experience.js` |
| Pickup PWA | `public/pager.js`, `public/sw.js`, `public/manifest.json` |
| Database evolution | `migrations/001` through `030` |
| Migration runner / role separation | `scripts/run-migrations.cjs` |
| Linux release build and verified install/rollback | `scripts/build-linux-release-tarball.cjs`, `deploy/install-staging-release.sh` |
| Nginx, systemd, backup, environment | `deploy/` |
| VPS staging checks | `tests/vps-staging-gates.cjs`, `tests/staging-http-gates.cjs` |
| Protected staging diagnostics | `scripts/staging-runtime-probe.js` |

## Boundaries that must remain intact

The browser bridge is `window.biteshark.auth`; requests stay on `/api`. Client data never grants roles. The adapter's AsyncLocalStorage and verified request binding isolate identities; it is not a remote service. Browser simulation and test module loaders remain development-only.

Keep database grants/forced RLS in numbered migrations, application authorization in shared server libraries, and HTTP routing in the explicit server manifest. PostgreSQL is the canonical discovery source. Do not add a generic public database API.

Staging diagnostics are mounted by `server/app.js` only when the server is staging and the enable flag is set. The diagnostic handler additionally requires an operator token and administrator identity. Disable after gate execution; never copy the handler into `api/`.

Legacy `TRUCKLY_*` aliases, existing VPS resource names, cookies/storage keys and old-origin denial guards remain intentionally. They do not imply support for a second deployment platform. Applied migration text is immutable.

See [VPS operations](docs/VPS_OPERATIONS.md), [runtime/auth](docs/STANDALONE_VPS_RUNTIME_AND_AUTH.md), [security](docs/BACKEND_SECURITY_HARDENING.md), [discovery](docs/P1_UNIFIED_DISCOVERY_ARCHITECTURE.md), [push](docs/PAGER_NOTIFICATIONS_RUNBOOK.md), and [admin](docs/ADMIN_GOVERNANCE_AND_ONBOARDING.md).

The longer pre-transition code map is retained under `docs/archive/hatchable/` as a historical snapshot, not implementation guidance.
