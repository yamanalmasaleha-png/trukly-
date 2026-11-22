# Configuration & Environment Variable Reference

> [!CAUTION]
> **Names Only — Zero Secret Values**: Never commit `.env` files, API keys, DB passwords, VAPID private keys, or mailbox/worker/auth secrets. Machine-readable definitions live in [contracts/configuration-keys.json](contracts/configuration-keys.json); reference template lives in [deploy/staging.env.example](../../deploy/staging.env.example).

---

## 1. Dual-Prefix Precedence & Restart Rule (`lib/env-compat.js`)

1. **`BITESHARK_<SUFFIX>` Primary, `TRUCKLY_<SUFFIX>` Legacy Alias**:
   - Resolved via `readEnvCompat(suffix, { securityCritical, defaultValue })`.
   - When `securityCritical: true` (`28` suffixes in `SECURITY_CRITICAL_ENV_SUFFIXES`), supplying **both** `BITESHARK_<SUFFIX>` and `TRUCKLY_<SUFFIX>` with differing non-empty values throws `EnvAliasConflictError` (`code: 'ENV_ALIAS_CONFLICT'`), aborting `server/index.js` startup and failing `GET /api/healthz` (`503`).
   - When `securityCritical: false`, `BITESHARK_<SUFFIX>` takes precedence over `TRUCKLY_<SUFFIX>`.
2. **Systemd Restart Requirement**:
   - Editing `/etc/truckly-staging/staging.env` or `/etc/biteshark-staging2/staging.env` **always requires restarting the systemd unit(s)** (`truckly-staging-api`, `truckly-staging-worker`, or `sudo /usr/local/sbin/biteshark-staging2-ctl restart`) because `EnvironmentFile=` is read at process spawn.

---

## 2. Core Runtime, Auth, Push, Map & Diagnostics Variables

| Variable (`BITESHARK_*` / Standalone) | Accepted Values | Default | Fail Mode | Secret Class |
|---|---|---|---|---|
| `DATABASE_URL` | PostgreSQL URI (`NOSUPERUSER NOBYPASSRLS` in hosted) | Required | **Fail-closed** startup error if empty or `SUPERUSER`/`BYPASSRLS` in staging/prod | **Secret** |
| `MIGRATION_DATABASE_URL` | PostgreSQL URI (DDL owner role) | Fallback `DATABASE_URL` | **Fail-closed** CLI exit `1` (`run-migrations.cjs`, `bootstrap-top-admin.cjs`) | **Secret** |
| `HOST` / `PORT` | IP / `1..65535` | `127.0.0.1` / `4100` (`3456` dev-server) | **Fail-closed** startup error on invalid port | Non-secret |
| `NODE_ENV` / `BITESHARK_ENV` | `production\|development\|test` / `local\|development\|test\|staging\|production` | `""` / `local` | **Fail-closed** on alias conflict; activates hosted/prod guards | Security-critical |
| `HATCHABLE_PROJECT_ID` (`PROJECT_ID`) | Must NOT equal `proj_MEO518rmLLl0` | `""` | **Fail-closed** startup/probe refusal if legacy prod ID present | Non-secret |
| `BITESHARK_PUBLIC_ORIGIN` | Bare `https://<host>` origin | `""` | **Fail-closed** `503 INVALID_PUBLIC_ORIGIN_CONFIG` on CSRF checks; blocks external invites if non-HTTPS | Security-critical |
| `BITESHARK_TRUST_PROXY` | `none` \| `loopback` | `none` | **Fail-closed** to `none` unless socket peer is `127.0.0.1`/`::1` | Security-critical |
| `BITESHARK_PLATFORM_ADMIN_IDS` | Comma-separated `user_id`s | `""` | **Fail-closed** (`0` IDs on conflict; suppressed by `platform_role_revocations`) | Internal security |
| `BITESHARK_PAUSE_WRITES` | Comma list: `bookings,pagers,community,owner,notifications,all` | `""` | **Fail-closed**: any unknown/empty token pauses **all** write scopes (`503`) | Security-critical |
| `BITESHARK_AUTH_SECRET` | `>= 32` chars | Dev ephemeral only | **Fail-closed** startup refusal in `staging`/`production` | **Secret** |
| `BITESHARK_AUTH_DELIVERY_MODE` | `disabled` \| `staging_mailbox` \| `resend_https` \| `webhook_https` | `disabled` | **Fail-closed** startup refusal on invalid mode/prereqs; zero silent fallback | Security-critical |
| `BITESHARK_STAGING_MAILBOX_SECRET` | `>= 24` chars | `""` | **Fail-closed** startup refusal in `staging_mailbox`; `404` on mismatch | **Secret** |
| `BITESHARK_STAGING_ALLOWED_EMAIL_DOMAINS` / `_EMAILS` | Comma-separated domains (no `*`) / emails | `""` | **Fail-closed** recipient allowlist in `ENV=staging` & `staging_mailbox` | Internal security |
| `BITESHARK_AUTH_EMAIL_API_KEY` / `_FROM` / `_API_URL` | Bearer key / sender / `https://...` | `""` / `""` / Resend URL | **Fail-closed** startup refusal in `resend_https` / `webhook_https` | `_API_KEY` is **Secret** |
| `BITESHARK_AUTH_EMAIL_TIMEOUT_MS`, `_OTP_TTL_SECONDS`, `_OTP_MAX_ATTEMPTS`, `_SESSION_TTL_SECONDS`, `_RATE_WINDOW_SECONDS`, `_START_*_MAX`, `_VERIFY_*_MAX`, `_AGE_GATE_IP_MAX`, `_INVITATION_RESEND_COOLDOWN_SECONDS` | Bounded integers | `6000ms`, `600s`, `5`, `14d`, `900s`, `15/5`, `25/10`, `5`, `45s` | Clamped to safe min/max bounds (`BITESHARK_*` wins) | Non-secret |
| `BITESHARK_NOTIFICATION_WORKER_SECRET` | `>= 24` chars | `""` | **Fail-closed** `503`/`401` on `/api/pager/worker` & worker CLI | **Secret** |
| `BITESHARK_PUSH_PROVIDER_MODE` | `disabled` \| `webpush` (`fake`/`loopback_test` in test) | `disabled` | **Fail-closed** (`enabled: false`); installer blocks live push without `--allow-live-push` | Security-critical |
| `BITESHARK_VAPID_PUBLIC_KEY` / `_PRIVATE_KEY` / `_SUBJECT` | P-256 keys + `mailto:`/`https:` | `""` | **Fail-closed** push disabled on invalid/mismatched keypair | `_PRIVATE_KEY` is **Secret** |
| `BITESHARK_DISABLE_SUBSCRIPTIONS` / `_DISABLE_NOTIFICATION_DELIVERY` / `_PUSH_ALLOWED_HOSTS` / `_ENABLE_NATIVE_PUSH` | Booleans / extra HTTPS push hosts | `""` | **Fail-closed** pauses subscriptions/dispatch or returns `501` | Security-critical |
| `BITESHARK_MAP_ENABLED`, `_MAP_PROVIDER`, `_MAP_TILE_URL`, `_MAP_PUBLIC_TOKEN`, `_MAP_MIN_ZOOM`, `_MAP_MAX_ZOOM` | Allowlisted provider (`osm_standard`, `stadia_osm_bright`, `mapbox_streets`, `maptiler_streets`) + public token (`pk.*`) | `true`, `osm_standard`, `3..19` | **Isolated fail-safe**: disables map (`0` tile requests, List view intact); rejects `sk.*`/`re_` secrets (`MAP_SECRET_KEY_REJECTED`) | `_PUBLIC_TOKEN` is public origin-scoped |
| `BITESHARK_ENABLE_STAGING_PROBE` / `_STAGING_PROBE_TOKEN` | `0\|1` / `>= 24` chars | `0` / `""` | **Fail-closed** `404` unless `ENV=staging` + enabled + valid token | `_TOKEN` is **Secret** |
| `BITESHARK_DIAGNOSTICS_*` (8 retention & rate-limit keys) | Bounded integers | `14d/30d/60d`, `15` samples, `500` groups, `25/600s` | Clamped to bounded min/max ranges | Non-secret |
| `BITESHARK_DB_POOL_MAX` / `_WORKER_DB_POOL_MAX` / `_MAX_JSON_BYTES` / `_RELEASE_SHA` | Bounded integers / SHA | `8` / `4` / `65536` / `GITHUB_SHA` | Clamped (`2..20`, `2..6`), `413` on oversize JSON, verified by `/api/healthz` | Non-secret |
| *(Branch `83181ba`)* `BITESHARK_PHOTO_STORAGE_DIR` / `_PHOTO_MIN_FREE_BYTES` | Path / bytes | `/var/lib/truckly-staging/customer-photos` / `64 MiB` | **Fail-closed** upload refusal when free disk `< MIN_FREE_BYTES` | Non-secret |

### Deployment & Backup Script Variables (`deploy/`)
`BITESHARK_STAGING_ROOT`, `BITESHARK_STAGING_ETC`, `BITESHARK_DEPLOY_LOCK_FILE`, `BITESHARK_NODE_BIN_DIR`, `BITESHARK_API_SERVICE_UNIT`, `BITESHARK_WORKER_SERVICE_UNIT`, `BITESHARK_UNPRIV_BUILD_USER`, `BITESHARK_UNPRIV_MIGRATE_USER`, `BITESHARK_BACKUP_DIR`, `BITESHARK_BACKUP_DB_NAME`, `BITESHARK_BACKUP_RETENTION_DAYS`, `BITESHARK_BACKUP_PASSPHRASE_FILE` (**points to `0400` root secret passphrase file**), and `BITESHARK_BACKUP_OFFSITE_CMD`. Note: `deploy/bin/biteshark-staging2-ctl` strips all caller `BITESHARK_*`/`TRUCKLY_*` variables before invoking `install-staging-release.sh`.
