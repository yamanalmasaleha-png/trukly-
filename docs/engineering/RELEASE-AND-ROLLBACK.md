# Release Packaging, Deployment & Verified Rollback

> [!IMPORTANT]
> Read [VPS_OPERATIONS.md](../VPS_OPERATIONS.md) (primary `staging.biteshark.live`) and [STAGING2_YAMAN_OPERATOR_GUIDE.md](../STAGING2_YAMAN_OPERATOR_GUIDE.md) (`staging2.biteshark.live`) before executing any host operation. Never deploy without explicit task authorization.

---

## 1. Deterministic Release Tarball (`scripts/build-linux-release-tarball.cjs`)

```bash
npm run build:release -- --ref <40-char-sha> --out-dir <dir>
```
- Uses `git archive` honoring `.gitattributes` `export-ignore` (excluding `.github`, `tests`, `tools`, `docs/archive`, `docs/engineering`, `scripts/dev-server.cjs`, `scripts/dev-workbench`, `truckly-v63.zip`, `truckly-data.sql.gz`).
- Emits `biteshark-<sha12>.tar.gz` + `.sha256` and verifies all required runtime files exist and zero forbidden paths are included.

---

## 2. Single-SHA Installer (`deploy/install-staging-release.sh`)

1. **Pre-Extraction Tar Header Inspection**: Parses every 512-byte tar block before extraction, rejecting symlinks, hardlinks, device nodes, `..` traversal, `.env*`, `node_modules/`, `tests/`, and simulator files.
2. **Unprivileged Build & Dependency Install**: Extracts into `/srv/<env>/releases/<sha>` and runs `npm ci --omit=dev --ignore-scripts` using `/opt/nodejs/node-v22-lts/bin` (dropping privileges via `runuser -u` when `BITESHARK_UNPRIV_BUILD_USER` is set).
3. **Database Migrations**: Loads `/etc/<env>/migrator.env` (`0600`) and executes `scripts/run-migrations.cjs --app-role <app_role>`.
4. **Atomic Symlink Switch & Restart**: Atomically switches `/srv/<env>/current`, updates `BITESHARK_RELEASE_SHA` + `TRUCKLY_RELEASE_SHA` in `staging.env`, and restarts `BITESHARK_API_SERVICE_UNIT` (and `BITESHARK_WORKER_SERVICE_UNIT` on `staging1`).
5. **Post-Switch Health & Co-Tenant Verification**:
   - Polls loopback `/api/healthz` verifying `status === 'ok'` AND `release_sha === TARGET_SHA`.
   - Verifies `/proc/<pid>/cwd` points to `/srv/<env>/releases/<sha>`.
   - Verifies co-tenant units (`nginx`, `postgresql`, `pm2-matt`, `qwen-worker`), public HTTPS staging URL, and `https://biteshark.live` holding page.

---

## 3. Scoped `staging2` Wrapper (`deploy/bin/biteshark-staging2-ctl`)

On `172.233.140.74`, Linux user `yaman` operates `staging2.biteshark.live` exclusively through:
```bash
sudo /usr/local/sbin/biteshark-staging2-ctl status|health|logs|restart|migrate|backup|deploy|rollback
```
- Strips `NODE_OPTIONS`, `LD_*`, `NODE_PATH`, and all caller `BITESHARK_*`/`TRUCKLY_*` env vars.
- Pins targets to `/srv/biteshark-staging2`, `/etc/biteshark-staging2`, `biteshark-staging2-api.service` (`127.0.0.1:4102`), `biteshark_stg2_app`, and `biteshark-stg2-mig` (`WORKER=none`).

---

## 4. Rollback Behavior & Forward-Only Schema Caveat

- Any health/SHA/co-tenant check failure during `install-staging-release.sh` automatically restores the previous `current` symlink and previous `staging.env`, restarts services, and verifies rollback health (`exit 1` if rollback succeeded; `exit 4` if rollback also failed).
- **Critical Caveat**: Code rollback does **not** undo applied PostgreSQL migrations. All migrations must remain backward-compatible with the immediately preceding release (`N-1`).
