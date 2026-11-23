# Browser Storage, Uploaded Files, Host Paths & Backups

---

## 1. Browser Cookies, `localStorage`, `sessionStorage` & `IndexedDB`

| Mechanism | Key / Store Name | Owner Module | Lifecycle & Security Purpose |
|---|---|---|---|
| **Cookie** | `__Host-truckly_session` | `lib/standalone-auth.js` | `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=1209600` (14d sliding to 30d cap). Primary session credential. |
| **Cookie** | `__Host-bs_age_gate` | `lib/age-policy.js` | `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=900` (`1`). Under-14 signup cooldown marker (no DOB stored). |
| **Cookie** | `bs_start_pref` | `public/role-experience.js` | Optional 90-day client preference (`customer` \| `vendor`) controlling initial welcome routing. |
| **`localStorage`** | `truckly_catalog_v2` | `public/app.js` | 15-min TTL offline/degraded catalog snapshot (supersedes legacy `truckly_catalog`). |
| **`localStorage`** | `truckly_favs`, `truckly_favs_scope` | `public/app.js` | Local guest favorites or cached `'account'` favorites (cleared/rescoped on sign-out). |
| **`localStorage`** | `truckly_notify` | `public/app.js` | Cached nearby-alert preference (`{ enabled, radius }`). |
| **`localStorage`** | `truckly_owner_truck_id`, `truckly_owner_profile`, `truckly_owner_schedule` | `public/app.js` | Local owner-mode draft state (explicitly purged on sign-out via `applyConfirmedClientSignOutCleanup`). |
| **`localStorage`** | `truckly_pager_subs_v1` | `public/pager.js` | Up to 8 active `{ subscription_id, unsubscribe_token, status, expires_at }` capability records. |
| **`localStorage`** | `truckly_guide_passport_v1` | `public/guide-passport.js` | Legacy device-only visit stamps at `a4e9f53` *(imported into PostgreSQL `customer_visits` and retired as primary storage on `83181ba`)*. |
| **`localStorage`** | `passkey_offer_declined` | `public/login.html` | Remembers dismissal of deferred passkey info prompt. |
| **`sessionStorage`** | `biteshark_admin_viewpoint_v1` | `role-experience.js`, `admin.js` | Tab-scoped read-only Customer/Vendor/Act-on-Behalf admin viewpoint state. |
| **`sessionStorage`** | `biteshark_pending_invite_v1` | `role-experience.js`, `login.html` | Preserves invitation token across `/login.html` OTP round-trip. |
| **`sessionStorage`** | `bs_support_draft_v1` | `role-experience.js` | Preserves unsent support-ticket text across sign-in redirect. |
| **`IndexedDB`** | `truckly-dish-notebook-v1` (v1, store `photos`) | `public/local-guides.js` | Up to 12 local blobs (`<= 5 MB`) at `a4e9f53` *(migrated to account-backed `customer_photos` + disk storage on `83181ba`)*. |
| **Service Worker** | `public/sw.js` | Web Push runtime | Uses **zero `CacheStorage` caches** and intercepts **zero `fetch` requests**; handles `push` and `notificationclick` only. |
| **In-Memory Only** | `window.bitesharkProfile` | `public/profile-client.js` | Stores active customer profile/collections state strictly in JS memory scoped to `user.id` (never written to `localStorage`/`IndexedDB`; purged immediately on sign-out or account switch). |

---

## 2. Server-Side File & Binary Upload Storage

1. **Vendor Onboarding Evidence (`migrations/018`, `server/admin-routes.js`, `lib/admin-governance.js`)**:
   - Accepted via `POST /api/onboarding/evidence` (`900 KiB` JSON envelope cap; `<= 512 KiB` decoded file bytes, max `5` files per application).
   - Validated by magic bytes (`verifyEvidenceBufferAndMime`: `%PDF-`, PNG, JPEG, RIFF/WEBP) — never trusting client `Content-Type` or file extension.
   - Stored outside `public/` inside PostgreSQL `vendor_application_evidence.file_bytes` (`BYTEA`, `FORCE ROW LEVEL SECURITY`, 90-day retention metadata) and served with `Content-Disposition: attachment` + `X-Content-Type-Options: nosniff`.
2. **Customer Exploration Private Photos & Consented Shared Derivatives (`lib/photo-storage.js` + `migrations/027`, `028`, `029`)**:
   - Accepted via `POST /api/me/photos` (`8 MiB` JSON cap; `<= 5 MiB` decoded image, max `12` active photos/user in app layer, `<= 6000x6000` px, `<= 25M` pixels).
   - Decoded and re-encoded from scratch via `sharp@0.35.5` (`sharp.cache(false); sharp.concurrency(1)` — stripping EXIF/GPS metadata and neutralizing polyglot payloads; raw originals are never stored) into normalized `<2hex>/pht_*_main.<jpg|png|webp>` + `<2hex>/pht_*_thumb.webp` derivatives written atomically outside `public/` under `BITESHARK_PHOTO_STORAGE_DIR` (`/var/lib/truckly-staging/customer-photos`), streamed only to the authenticated owner via `GET /api/me/photos/file` (`Cache-Control: private, no-store`, optional `&download=1` attachment).
   - **Consented Shared Collection Derivatives (`createSharedPhotoDerivative`, `029`)**: When an owner explicitly consents (`share_consent_confirmed: true`) on `POST /api/me/collections/attach-photo`, `sharp` re-encodes a separate EXIF-stripped `<2hex>/sha_*_shared.webp` derivative (`<= 1280x1280`). Live delivery at `GET /s/:token/photo/:attachment` re-validates active token hash, `include_shared_photos`, attachment status, active source photo, and `shared_collection_photos` feature state on every request (`Cache-Control: no-store, max-age=0`). Deleting the source private photo (`POST /api/me/photos/delete`) immediately revokes all referencing `customer_collection_photo_attachments` rows and unlinks `<2hex>/sha_*_shared.webp` from disk (`reconcilePhotoStorage()` also retries failed unlinks and sweeps aged orphan `sha_*` files). Note: encrypted host backups (`truckly_staging-photos-<STAMP>.tar.gz.gpg`) age out under the standard `7`-day backup retention window.

---

## 3. Persistent VPS Host Directories & Encrypted Backups

| Environment | Release Tree (`ReadOnlyPaths`) | Configuration (`0750` / `0640` / `0600`) | Encrypted Backups (`0700`) |
|---|---|---|---|
| **Primary Staging (`staging.biteshark.live`)** | `/srv/truckly-staging/{releases/<sha>,current}` *(plus `/var/lib/truckly-staging/customer-photos` `ReadWritePaths` on `83181ba`)* | `/etc/truckly-staging/{staging.env,migrator.env,backup.env,backup.passphrase}` | `/var/backups/truckly-staging` (`09:40 UTC` daily timer) |
| **Secondary Staging (`staging2.biteshark.live`)** | `/srv/biteshark-staging2/{releases/<sha>,current}` | `/etc/biteshark-staging2/{staging.env,migrator.env,backup.env,backup.passphrase,ctl.conf}` | `/var/backups/biteshark-staging2` (`10:15 UTC` daily timer) |

- **Backup Verification (`deploy/backup/truckly-staging-backup.sh`)**: Runs `pg_dump --format=custom --no-owner --no-acl`, validates archive readability via `pg_restore --list`, encrypts with GPG `AES256` (`--passphrase-file`), writes `.sha256`, runs optional `BITESHARK_BACKUP_OFFSITE_CMD`, and prunes local archives older than `7` days. *(Note: Offsite replication remains an open production readiness gate `BACKUP-OFFSITE`.)*
