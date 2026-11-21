# VPS operations

This is the only supported deployment target. The production hostname remains a holding page until release approval.

## Prerequisites and configuration

Node 22, PostgreSQL 16+, Nginx with TLS, systemd and the existing separate application/migration roles. Use `deploy/staging.env.example` as a variable reference; store actual secrets in `/etc/truckly-staging/staging.env` outside the release. Preserve owner/group and mode 0640. The migrator credential stays separate and must not be available to the running application.

The current VPS also hosts unrelated services. Do not replace system Node, expose port 4100/PostgreSQL, reboot, or change unrelated services as part of an application release.

## Release

1. Pin the reviewed commit and require its CI checks. Build off-host using `scripts/build-linux-release-tarball.cjs`; record the commit and SHA-256.
2. Transfer the archive, verify SHA-256 before extracting/executing its installer, and follow the exact commands in `STANDALONE_VPS_RUNTIME_AND_AUTH.md`.
3. The installer validates archive paths, acquires a deployment lock, verifies immutable release contents, installs locked Linux dependencies, applies additive migrations and switches the current symlink with health checks/rollback.
4. Verify HTTPS `/api/healthz` reports the expected SHA and a ready database, login works, admin access remains restricted, assets load, the holding page remains intact, and unrelated services remain healthy.
5. Record executed results for that exact SHA. Never turn historical or missing evidence into PASS.

## Authentication and workers

OTP delivery and issued account invitations (`023_invitation_delivery_and_lifecycle.sql`) dispatch synchronously through the configured HTTPS provider (`BITESHARK_AUTH_DELIVERY_MODE=resend_https` + `PUBLIC_ORIGIN`); the pager worker does not deliver login codes or auto-send historical `admin_notification_outbox` (`recorded_test_safe`) or `not_requested` invitation rows. Staging recipient restrictions remain enforced without broad consumer-domain allowlisting: `evaluateStagingRecipientEligibilityInTx` permits designated static operator emails/domains, exact emails holding an active approved (`status='issued'`, unrevoked, unconsumed, unexpired) invitation, and continuing non-disabled (`disabled_at IS NULL`) `auth_users` accounts after invitation consumption. Invitation acceptance links use `#accept-invite=<token>` hash fragments so raw tokens never enter HTTP query strings, logs, or `resend_https` API responses. Never print API keys, session cookies, raw invitation tokens, or OTPs in diagnostics. Provider acceptance is distinct from inbox receipt.

`truckly-staging-worker.service` supervises `scripts/run-pager-worker.cjs` against the authenticated loopback endpoint. No external platform scheduler is needed. Leave push disabled until real provider and physical-device gates are satisfied.

## Verification and probe lifecycle

Use `tests/vps-staging-gates.cjs --preflight-local` on disposable PostgreSQL first, then its documented live mode with staging-only credentials. The HTTP assertions in `tests/staging-http-gates.cjs` are shared implementation, not a second CLI/platform target.

The built-in staging probe requires `BITESHARK_ENV=staging`, `BITESHARK_ENABLE_STAGING_PROBE=1`, a strong `BITESHARK_STAGING_PROBE_TOKEN`, and a platform-administrator session. It is mounted explicitly by the server; never add a 31st domain handler. After checks, disable the enable flag, revoke the token, restart staging API and verify the probe returns 404. Legacy aliases remain accepted but must not conflict.

## Pause, recovery and backup

Stop `truckly-staging-worker.service` for an immediate worker halt. Update pause settings in the protected environment and restart the applicable services to make changes effective. Preserve reads, authorization and RLS. See `PAGER_NOTIFICATIONS_RUNBOOK.md` for lease/backlog semantics.

Runtime feature controls in `/admin` (`Feature Controls`, `Admin: Top` only) can pause, hide, or `staff_beta`-restrict optional features in PostgreSQL (`022_feature_controls.sql`) without service restarts, but authoritative environment controls (`PAUSE_WRITES`, `PUSH_PROVIDER_MODE`, `DISABLE_SUBSCRIPTIONS`, `DISABLE_NOTIFICATION_DELIVERY`, `MAP_ENABLED`) always take precedence over database `enabled` settings. For SSH operator inspection or recovery without direct SQL edits, run `set -a && . /etc/truckly-staging/staging.env && set +a && node /srv/truckly-staging/current/scripts/manage-feature-controls.cjs --status` (or `--reset-defaults --actor-email <top-admin-email> --reason "..."`).

## Map tile provider configuration and switching

Map configuration is centralized and allowlisted in `lib/map-config.js` and delivered via browser-safe fields on `GET /api/features` (`map`). Approved tile requests send `referrerPolicy: 'origin'` (disclosing only scheme + host, never paths, query strings, tokens, or pager links) while keeping global `Referrer-Policy: same-origin` intact for all other requests.

- **Default provider (`osm_standard`)**: `https://tile.openstreetmap.org/{z}/{x}/{y}.png` (`min_zoom=3`, `max_zoom=19`, visible OpenStreetMap attribution, standard HTTP caching, zero bulk/prefetch/service-worker tile storage). Note that OSMF's public tile service is volunteer-run with no SLA and is unsuitable for heavy commercial production traffic.
- **Switching to an allowlisted commercial provider** (edit `/etc/truckly-staging/staging.env` and **restart `truckly-staging-api.service`** via `sudo systemctl restart truckly-staging-api.service`):
  1. **Stadia Maps (`stadia_osm_bright`)**: Create a Stadia Maps account and configure domain authentication for the BiteShark origin (`staging.biteshark.live` / `biteshark.live`), then set `BITESHARK_MAP_PROVIDER=stadia_osm_bright` (and optionally a domain-restricted `BITESHARK_MAP_PUBLIC_TOKEN`).
  2. **Mapbox (`mapbox_streets`)**: Create a Mapbox account, generate a URL-restricted **public** `pk.*` token scoped to the BiteShark origin (never use a secret `sk.*` token — `lib/map-config.js` rejects secret prefixes fail-closed), and set `BITESHARK_MAP_PROVIDER=mapbox_streets` + `BITESHARK_MAP_PUBLIC_TOKEN=pk.<token>`.
  3. **MapTiler (`maptiler_streets`)**: Create a MapTiler account, generate an origin-restricted public key, and set `BITESHARK_MAP_PROVIDER=maptiler_streets` + `BITESHARK_MAP_PUBLIC_TOKEN=<key>`.
- **Disabling the map**: For an immediate **zero-restart** disable (0 tile requests, List view preserved), set `interactive_map` to `hidden` in `/admin#features` (or via `scripts/manage-feature-controls.cjs`). To disable at the environment level, set `BITESHARK_MAP_ENABLED=0` in `/etc/truckly-staging/staging.env` and run `sudo systemctl restart truckly-staging-api.service`. Invalid `BITESHARK_MAP_*` settings fail safe to `hidden` without blocking server startup, List discovery, or authentication.

## Operational diagnostics and retention (`/admin#diagnostics`)

Operational errors across browser, API, worker, and external providers are deduplicated into `diagnostic_incident_groups` with rate-capped `diagnostic_event_samples`, release startup history in `diagnostic_releases`, and append-only operator triage/notes in `diagnostic_incident_notes` (`024_diagnostics_and_reliability.sql`), kept explicitly separate from `audit_logs`. `Admin: Top` manages full sanitized incidents, triage states, suspected causes, fixing commit SHAs, synthetic verification probes, and retention cleanup; `Admin: Mod` sees only `mod_visible = true` operational incidents and may append operational notes. Tune retention in `/etc/truckly-staging/staging.env` via `BITESHARK_DIAGNOSTICS_SAMPLE_RETENTION_DAYS` (default `14`), `BITESHARK_DIAGNOSTICS_RESOLVED_RETENTION_DAYS` (default `30`), `BITESHARK_DIAGNOSTICS_OPEN_RETENTION_DAYS` (default `60`), `BITESHARK_DIAGNOSTICS_MAX_SAMPLES_PER_GROUP` (default `15`), `BITESHARK_DIAGNOSTICS_SAMPLE_COOLDOWN_SEC` (default `30`), and `BITESHARK_DIAGNOSTICS_MAX_GROUPS` (default `500`); periodic worker cleanup purges aged samples/groups while preserving `diagnostic_incident_notes` and `audit_logs`.

Installer rollback restores code and environment, not committed database migrations. It accepts the old local adapter name only to validate older immutable VPS rollback releases. Never rewrite migrations to roll back an app.

Retain backup timers and restricted backup files. `pg_restore --list` is not a restore test: complete an isolated restoration and offsite recovery exercise before claiming recovery readiness. This platform transition does not close physical-device, legal, backup or production-approval gates.
