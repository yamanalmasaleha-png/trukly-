# BiteShark — VPS application

BiteShark provides Sonoma County food discovery, vendor operations, event inquiries, community moderation and pickup pagers.

**VPS hosting is the only supported deployment.** There is no supported Hatchable build or deployment workflow. The integration branch is `working/biteshark-vps`; branch consolidation is separate work.

## Engineering handbook & shared code registry

Start here before changing routes, database schema, browser globals, CSS cascades, feature controls, or configuration:

- **[Shared Engineering Handbook (`docs/engineering/README.md`)](docs/engineering/README.md)** — Code-grounded index of symbols, HTTP contracts, PostgreSQL tables/RLS, frontend screens/cascades, 17 domain maps, canonical components, and known drift across active branches.
- **[Standing Agent & Developer Rules (`AGENTS.md`)](AGENTS.md)** & **[Assistant Instructions (`docs/engineering/ASSISTANT-INSTRUCTIONS.md`)](docs/engineering/ASSISTANT-INSTRUCTIONS.md)**.
- **Code Registry CLI** (offline AST/HTML/CSS/SQL inventory, drift check & ref comparison):
  ```bash
  npm run registry:locate -- <symbol|route|table|flag|config>
  npm run registry:docs
  npm run registry:validate
  npm run registry:compare -- --base origin/working/biteshark-vps --head HEAD
  npm run test:registry
  ```

## Runtime and domains

- Node.js 22, PostgreSQL 16+, Nginx TLS, and systemd API/worker/backup services.
- Primary staging: https://staging.biteshark.live (`127.0.0.1:4100`, [VPS operations](docs/VPS_OPERATIONS.md)) and isolated secondary staging: https://staging2.biteshark.live (`127.0.0.1:4102`, [Staging2 operator guide](docs/STAGING2_YAMAN_OPERATOR_GUIDE.md)) on `172.233.140.74`.
- https://biteshark.live remains a holding page until production launch is separately approved.
- `server/index.js` starts the application; `server/app.js` handles authentication, administration and static assets; `server/routes.js` explicitly registers domain handlers in `api/`.
- `@biteshark/runtime-adapter` is a repository-owned package in `packages/runtime-adapter`, backed by PostgreSQL and server-verified sessions. It does not call a hosted SDK.
- Apply additive migrations `001`–`026`+ (see [MIGRATIONS.md](docs/engineering/MIGRATIONS.md) for exact branch sequence) using the separate migrator role. Never edit applied migrations.

## Development and verification

```bash
npm ci
npm run test:smoke
npm run test:parity
# Use a disposable PostgreSQL admin connection, never staging or production data:
node tests/standalone-runtime-auth.integration.cjs
node tests/auth-email-delivery.integration.cjs
node tests/backend-hardening.integration.cjs
node tests/p1-unified-discovery.integration.cjs
node tests/pager-notifications.integration.cjs
node tests/admin-governance.integration.cjs
node tests/legal-readiness.integration.cjs
node tests/vps-staging-gates.cjs --preflight-local
```

The integration suites require `DATABASE_URL` for a disposable test server, or their documented embedded PostgreSQL prerequisites. Browser suites are `tests/*browser.e2e.cjs`; the Linux installer suite is `npm run test:deploy`. CI runs these against PostgreSQL 16. Local simulation uses `npm run dev:simulator` and never authorizes real users.

## Deploy and operate

Read [VPS operations](docs/VPS_OPERATIONS.md) and [runtime/auth details](docs/STANDALONE_VPS_RUNTIME_AND_AUTH.md). Build a Linux release from a reviewed exact commit with `npm run build:release -- --ref <sha> --out-dir <directory>`. Verify its SHA-256 before executing its installer. Install dependencies on Linux; never upload Windows `node_modules`.

Keep credentials outside Git. Primary settings use `BITESHARK_*`; existing `TRUCKLY_*` aliases remain supported and conflicting security settings fail closed. Existing systemd names, Linux users, database names, session cookies and browser-storage keys remain stable for upgrade continuity.

Login uses same-origin email OTP and HttpOnly sessions. Staging can use Resend HTTPS with its recipient allowlist preserved. It must never silently fall back to the operator mailbox after provider failure. Public APIs do not expose database tables; restricted database roles, transactions and forced RLS enforce access.

## Readiness and evidence

[VPS release evidence](docs/VPS_RELEASE_VERIFICATION_REPORT.md) records earlier exact releases; it is not proof that a newer commit passed. [Platform retirement](docs/VPS_ONLY_TRANSITION.md) describes the VPS-only change. Physical Android/iPhone background push, legal approval and recovery/offsite-backup evidence remain separate launch gates. Receiving an OTP proves that delivery attempt, not every notification workflow.

The old platform runbook and review reports are [historical only](docs/archive/hatchable/README.md). They are not current deployment prerequisites. The former hosted project is not modified by this repository change.

## Source rules

- PostgreSQL discovery is canonical; preserve truthful provenance, photo rights and explicit outage responses.
- Enforce vendor membership and Top/Mod permissions on the server, not just in the UI.
- Preserve CSRF protection, rate limits, idempotency, RLS, lease fencing and fail-closed controls.
- Add domain routes explicitly to `server/routes.js`; keep shared code in `lib/`.
- Do not claim unrun hosted/device checks passed. Do not commit credentials or overwrite immutable releases.
- Historical source archives remain preserved in Git; they are excluded from new deployable releases.

See [TECH_MAP.md](TECH_MAP.md) for the code map.
