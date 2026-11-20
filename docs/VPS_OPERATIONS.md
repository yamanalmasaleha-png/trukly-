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

OTP delivery is synchronous through the configured HTTPS provider; the pager worker does not deliver login codes. `BITESHARK_AUTH_DELIVERY_MODE=resend_https` needs the configured sending key and sender. Staging recipient restrictions remain enforced. Never print API keys, session cookies or OTPs in diagnostics. Provider acceptance is distinct from inbox receipt.

`truckly-staging-worker.service` supervises `scripts/run-pager-worker.cjs` against the authenticated loopback endpoint. No external platform scheduler is needed. Leave push disabled until real provider and physical-device gates are satisfied.

## Verification and probe lifecycle

Use `tests/vps-staging-gates.cjs --preflight-local` on disposable PostgreSQL first, then its documented live mode with staging-only credentials. The HTTP assertions in `tests/staging-http-gates.cjs` are shared implementation, not a second CLI/platform target.

The built-in staging probe requires `BITESHARK_ENV=staging`, `BITESHARK_ENABLE_STAGING_PROBE=1`, a strong `BITESHARK_STAGING_PROBE_TOKEN`, and a platform-administrator session. It is mounted explicitly by the server; never add a 31st domain handler. After checks, disable the enable flag, revoke the token, restart staging API and verify the probe returns 404. Legacy aliases remain accepted but must not conflict.

## Pause, recovery and backup

Stop `truckly-staging-worker.service` for an immediate worker halt. Update pause settings in the protected environment and restart the applicable services to make changes effective. Preserve reads, authorization and RLS. See `PAGER_NOTIFICATIONS_RUNBOOK.md` for lease/backlog semantics.

Runtime feature controls in `/admin` (`Feature Controls`, `Admin: Top` only) can pause, hide, or `staff_beta`-restrict optional features in PostgreSQL (`022_feature_controls.sql`) without service restarts, but authoritative environment controls (`PAUSE_WRITES`, `PUSH_PROVIDER_MODE`, `DISABLE_SUBSCRIPTIONS`, `DISABLE_NOTIFICATION_DELIVERY`) always take precedence over database `enabled` settings. For SSH operator inspection or recovery without direct SQL edits, run `set -a && . /etc/truckly-staging/staging.env && set +a && node /srv/truckly-staging/current/scripts/manage-feature-controls.cjs --status` (or `--reset-defaults --actor-email <top-admin-email> --reason "..."`).

Installer rollback restores code and environment, not committed database migrations. It accepts the old local adapter name only to validate older immutable VPS rollback releases. Never rewrite migrations to roll back an app.

Retain backup timers and restricted backup files. `pg_restore --list` is not a restore test: complete an isolated restoration and offsite recovery exercise before claiming recovery readiness. This platform transition does not close physical-device, legal, backup or production-approval gates.
