# BiteShark Staging2 (`staging2.biteshark.live`) — Yaman Operator & Testing Guide

## 1. Environment Summary & Access Scope

| Item | Value |
| :--- | :--- |
| **VPS Host & SSH User** | `yaman@172.233.140.74` (Port `22`) |
| **Secondary Testing URL** | `https://staging2.biteshark.live` |
| **Repository** | `https://github.com/yamanalmasaleha-png/trukly-/` |
| **Dedicated Testing Branch** | `testing/yaman-staging2` |
| **VPS Working Clone** | `/home/yaman/trukly` |
| **Release Build Scratch Dir** | `/home/yaman/staging2-artifacts` |
| **Staging2 Release Root** | `/srv/biteshark-staging2` (`releases/`, `current` symlink) |
| **Staging2 Systemd Service** | `biteshark-staging2-api.service` (`127.0.0.1:4102`, user `biteshark-stg2`) |
| **Staging2 PostgreSQL Database** | `biteshark_staging2` (isolated from `truckly_staging` and co-tenant databases) |
| **Scoped Control Helper** | `sudo /usr/local/sbin/biteshark-staging2-ctl` |

### Access Boundaries
- Your Linux account (`yaman`) has full control over your home checkout (`/home/yaman/trukly`) and scoped deployment, migration, restart, rollback, backup, health, and sanitized-log access to **`staging2` only** via `sudo /usr/local/sbin/biteshark-staging2-ctl`.
- You do **not** have root access, blanket `sudo`, Docker access, or access to primary staging (`staging.biteshark.live` / `/srv/truckly-staging` / `/etc/truckly-staging`), production (`biteshark.live`), or co-tenant services.
- Outbound email on `staging2` is restricted to explicitly allowlisted test recipients and active approved account invitations; Web Push / background pager notifications remain disabled (`BITESHARK_PUSH_PROVIDER_MODE=disabled`).
- Notice on `noindex`: `staging2.biteshark.live` sends `X-Robots-Tag: noindex, nofollow, noarchive` so search engines do not index testing pages. That header is a crawler hint—**not** access control. Real access control is enforced by BiteShark's staging invitation/allowlist gates, 14+ age verification, session authentication, CSRF checks, and server-side RBAC.

---

## 2. Local SSH Key Setup & Connection

Generate a dedicated Ed25519 SSH key pair with a strong passphrase using a distinct filename (`id_ed25519_biteshark_staging2`) so you never overwrite any existing SSH keys on your computer.

### Option A — Windows PowerShell
```powershell
New-Item -ItemType Directory -Force "$HOME\.ssh" | Out-Null
ssh-keygen -t ed25519 -a 64 -f "$HOME\.ssh\id_ed25519_biteshark_staging2" -C "yaman-biteshark-staging2"
Get-Content "$HOME\.ssh\id_ed25519_biteshark_staging2.pub"
```

### Option B — macOS / Linux Terminal
```bash
mkdir -p ~/.ssh && chmod 700 ~/.ssh
ssh-keygen -t ed25519 -a 64 -f ~/.ssh/id_ed25519_biteshark_staging2 -C "yaman-biteshark-staging2"
cat ~/.ssh/id_ed25519_biteshark_staging2.pub
```

### Key-Handling & First-Connection Verification
1. **Keep the private key (`id_ed25519_biteshark_staging2`) strictly on your computer.** Never email, paste, or upload it.
2. **Send only the single-line `.pub` public key (`id_ed25519_biteshark_staging2.pub`) to Matt**, who will append it to `/home/yaman/.ssh/authorized_keys` (`0600`, `yaman:yaman`) on `172.233.140.74`:
   ```bash
   # Operator installation command (run by Matt as root on 172.233.140.74):
   install -d -m 0700 -o yaman -g yaman /home/yaman/.ssh
   printf '%s\n' '<PASTE_YAMAN_SSH_ED25519_PUBKEY_LINE>' >> /home/yaman/.ssh/authorized_keys
   chown yaman:yaman /home/yaman/.ssh/authorized_keys
   chmod 0600 /home/yaman/.ssh/authorized_keys
   ```
   *(If you need to sign in before key installation or if a local tool requires your Linux account password, obtain the temporary password separately from Matt via a secure channel—it is never sent by email—and change it immediately with `passwd`.)*
3. **Verify the server host key fingerprint** before typing `yes` on your first SSH connection. Confirm with Matt that the fingerprint shown matches `172.233.140.74`:
   - **ED25519**: `SHA256:yAylRIcteo2P/sFO28O84YAfH9sekyNaN5KTzmKVBeU`
   - **ECDSA**: `SHA256:RB0AZw9BCQndswDRGlwfB91yTxC1rvmuIPT2BH5sLhg`
   - **RSA**: `SHA256:e2LFfXKSofryxnv+7BhK8Ee4o1Jfh/H4mtwv8q7fF8s`
4. **Connect via SSH**:
   ```bash
   ssh -i ~/.ssh/id_ed25519_biteshark_staging2 yaman@172.233.140.74
   ```
   *(PowerShell: `ssh -i "$HOME\.ssh\id_ed25519_biteshark_staging2" yaman@172.233.140.74`)*

### Optional `~/.ssh/config` Alias
Add this block to `~/.ssh/config` (`$HOME\.ssh\config` on Windows) so you can run `ssh biteshark-staging2`:
```sshconfig
Host biteshark-staging2
    HostName 172.233.140.74
    User yaman
    IdentityFile ~/.ssh/id_ed25519_biteshark_staging2
    IdentitiesOnly yes
```

---

## 3. Exact Staging2 Inspection, Deployment, Logs & Rollback Commands

All privileged `staging2` actions go through the fixed root-owned helper `sudo /usr/local/sbin/biteshark-staging2-ctl`. Always deploy from an **exact reviewed 40-character Git commit SHA**—never an uncontrolled `git pull` inside `/srv/biteshark-staging2`.

### Inspect Current Checkout, Active Release & Health
```bash
# 1. Inspect active staging2 release, installed SHAs, systemd state, and loopback health
sudo /usr/local/sbin/biteshark-staging2-ctl status

# 2. Check both loopback (127.0.0.1:4102) and public HTTPS (staging2.biteshark.live) health
sudo /usr/local/sbin/biteshark-staging2-ctl health

# 3. Inspect your working Git checkout and current commit
cd ~/trukly
git status -sb
git rev-parse HEAD
```

### Fetch `testing/yaman-staging2` & Deploy a Reviewed Commit
```bash
cd ~/trukly
git fetch origin --prune
git checkout testing/yaman-staging2
git pull --ff-only origin testing/yaman-staging2

# Record the exact 40-character commit SHA to deploy
CANDIDATE_SHA="$(git rev-parse HEAD)"
echo "Candidate SHA: ${CANDIDATE_SHA}"

# Run local syntax & catalog verification before packaging
/opt/nodejs/node-v22-lts/bin/node tests/vps-platform-contract.test.cjs
/opt/nodejs/node-v22-lts/bin/node tests/listing-verification.cjs

# Build a deterministic release archive + SHA-256 manifest in ~/staging2-artifacts
mkdir -p ~/staging2-artifacts
META="$(/opt/nodejs/node-v22-lts/bin/node scripts/build-linux-release-tarball.cjs --ref "${CANDIDATE_SHA}" --out-dir ~/staging2-artifacts)"
echo "${META}"

TARBALL="$(/opt/nodejs/node-v22-lts/bin/node -e 'console.log(JSON.parse(process.argv[1]).tarball_path)' "${META}")"
SHA256="$(/opt/nodejs/node-v22-lts/bin/node -e 'console.log(JSON.parse(process.argv[1]).sha256)' "${META}")"

# Optional: take an encrypted pre-deploy backup of biteshark_staging2
sudo /usr/local/sbin/biteshark-staging2-ctl backup

# Install, run additive migrations, switch /srv/biteshark-staging2/current, and verify health
sudo /usr/local/sbin/biteshark-staging2-ctl deploy \
  --sha "${CANDIDATE_SHA}" \
  --tarball "${TARBALL}" \
  --expected-sha256 "${SHA256}"
```

### Run Additive Migrations, Restart Staging2, Inspect Logs & Roll Back
```bash
# Re-run idempotent additive migrations on biteshark_staging2 safely
sudo /usr/local/sbin/biteshark-staging2-ctl migrate

# Restart ONLY biteshark-staging2-api.service and verify health
sudo /usr/local/sbin/biteshark-staging2-ctl restart

# View sanitized staging2 operational logs (1..200 lines)
sudo /usr/local/sbin/biteshark-staging2-ctl logs --lines 80

# Roll back staging2 application code + release SHA to a previously installed 40-hex SHA
# (Note: symlink rollback restores application code/env; committed SQL migrations are forward-only)
sudo /usr/local/sbin/biteshark-staging2-ctl rollback --to <PREVIOUS_40_CHAR_COMMIT_SHA>
```

---

## 4. Git & Pull Request Workflow

1. Work on **`testing/yaman-staging2`** (or a feature branch cut from `testing/yaman-staging2`). Never push directly to `working/biteshark-vps` or `main`, and never rewrite shared history (`--force`).
2. Note on GitHub authentication: `/home/yaman/trukly` uses the public HTTPS remote (`https://github.com/yamanalmasaleha-png/trukly-.git`) with **zero stored credentials**. To push commits to GitHub (`yamanalmasaleha-png/trukly-`), push from your own local workstation authenticated with your own GitHub account (or configure your own GitHub SSH deploy/user key or fine-grained PAT scoped only to your account—Matt's credentials are never stored on the VPS), then `git fetch origin` on `staging2` to build and deploy the reviewed commit after GitHub Actions CI passes.
3. When a change is verified on `https://staging2.biteshark.live` and green in GitHub Actions CI:
   - Open a Pull Request on GitHub from `testing/yaman-staging2` (or your topic branch) targeting **`working/biteshark-vps`**.
   - Include in the PR description: the exact source SHA, the deployed `staging2` SHA, test results, and any migration/feature-control notes.
   - Wait for review before merging into `working/biteshark-vps`.

---

## 5. Copyable Instructions for an AI Coding Agent

Copy and paste the block below at the start of any AI coding session targeting `staging2`:

```text
You are working only on BiteShark staging2 at staging2.biteshark.live using Linux user yaman and branch testing/yaman-staging2. Inspect the current state before changes. Use the dedicated deployment procedure (`scripts/build-linux-release-tarball.cjs` + `sudo /usr/local/sbin/biteshark-staging2-ctl deploy --sha <40-hex> --tarball <path> --expected-sha256 <64-hex>`). Never modify original staging (`staging.biteshark.live` / `/srv/truckly-staging` / `/etc/truckly-staging` / `truckly-staging-*`), production (`biteshark.live`), unrelated services, root configuration or another environment’s database/secrets. Do not enable outbound notifications broadly. Record source/deployed SHAs, run appropriate tests, and submit changes by PR rather than merging into the primary branch.
```

---

## 6. Encrypted Database Backups & Operator Recovery Procedure

- **Automated & On-Demand Backups**: `biteshark-staging2-backup.timer` runs daily (`10:15 UTC`), and Yaman can trigger an immediate encrypted snapshot before risky changes via `sudo /usr/local/sbin/biteshark-staging2-ctl backup`.
- **Isolated Destination**: AES-256 GPG-encrypted custom-format dumps (`biteshark_staging2-<UTC_STAMP>.dump.gpg` + `.sha256`) are stored in `/var/backups/biteshark-staging2` (`0700 root:root`, 7-day retention) using the dedicated `/etc/biteshark-staging2/backup.passphrase` (`0400 root:root`).
- **Operator Restore Procedure (run by Matt as `root` on `172.233.140.74`)**:
  ```bash
  # 1. Verify checksum of target archive
  cd /var/backups/biteshark-staging2
  sha256sum -c biteshark_staging2-<STAMP>.dump.gpg.sha256

  # 2. Stop staging2 API so connections release cleanly
  systemctl stop biteshark-staging2-api.service

  # 3. Decrypt to a 0600 temporary file, restore into biteshark_staging2, and re-verify app grants
  TMP_DUMP="$(mktemp /tmp/stg2-restore.XXXXXX.dump)"
  chmod 0600 "${TMP_DUMP}"
  gpg --batch --yes --decrypt \
    --pinentry-mode loopback \
    --passphrase-file /etc/biteshark-staging2/backup.passphrase \
    --output "${TMP_DUMP}" \
    "/var/backups/biteshark-staging2/biteshark_staging2-<STAMP>.dump.gpg"
  chmod 0640 "${TMP_DUMP}" && chgrp postgres "${TMP_DUMP}"
  runuser -u postgres -- pg_restore --clean --if-exists --no-owner --no-acl --dbname=biteshark_staging2 "${TMP_DUMP}"
  rm -f "${TMP_DUMP}"

  # 4. Re-apply idempotent grants and start staging2 API
  /usr/local/sbin/biteshark-staging2-ctl migrate
  systemctl start biteshark-staging2-api.service
  /usr/local/sbin/biteshark-staging2-ctl health
  ```

