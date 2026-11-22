# Domain Map — Listing Photos, Owner Preview & Private Customer Photos

## 1. Three Distinct Photo Subsystems in BiteShark

1. **Public Discovery Listing Photos (`vendors.photo_url` + `vendors.photo_rights_verified`)**:
   - Enforced in `lib/discovery.js#mapCatalogRow`, `public/app.js#resolveApprovedVendorImage`, and `public/listing-highlights.js#removeGenericStockPhoto`.
   - Public vendor photos render **only** when `photo_rights_verified === true` (set by `Admin: Top` in `/api/admin/vendors/update`) and the URL is not a generic stock host. All 59 seeded listings default to `false` and render BiteShark's category badge thumbnail.
2. **Owner Mode Menu Photo Preview (`#ownerPhotoGrid` in `public/app.js`)**:
   - Local browser-only preview tile governed by read-only disclosure `owner_menu_photo_upload` (`lib/feature-controls.js`). Never publishes unverified photos to public listings.
3. **Customer Personal Dish & Visit Photos (`working/biteshark-vps` / `staging.biteshark.live`)**:
   - Account-backed private photo storage ([lib/photo-storage.js](../../../lib/photo-storage.js) + [lib/customer-exploration.js](../../../lib/customer-exploration.js) + `migrations/027` & `028` `customer_photos`, `FORCE RLS`, max 12 active photos/user, `<= 5 MiB`, `<= 6000x6000` / `25M` pixels).
   - Decoded and re-encoded from scratch via `sharp@0.35.5` (`sharp.cache(false); sharp.concurrency(1)`) into normalized `<2hex>/pht_*_main.<jpg|png|webp>` and `320x320` `<2hex>/pht_*_thumb.webp` derivatives with EXIF orientation corrected and all EXIF/GPS/XMP/IPTC metadata stripped; raw originals are never stored.
   - Stored outside `public/` under `BITESHARK_PHOTO_STORAGE_DIR` (`/var/lib/truckly-staging/customer-photos`), served exclusively to the owner via `GET /api/me/photos/file` (`Cache-Control: private, no-store`, optional `&download=1` attachment; remains available to the owner alongside `POST /api/me/photos/delete` and `#rxExplorationPrivacyModal` even when `private_photos` is `hidden`), reconciled via `reconcilePhotoStorage()` (`files_purged_at` retries + stale `.tmp-*` / aged orphan cleanup), and GPG-encrypted in `deploy/backup/truckly-staging-backup.sh` (`truckly_staging-photos-<STAMP>.tar.gz.gpg`).
   - *(Note: `staging2` branches prior to exploration merge still use browser-local `IndexedDB['truckly-dish-notebook-v1']`; `staging2` Nginx/systemd templates on `working/biteshark-vps` are already updated for `/api/me/photos` `8m` and `/var/lib/biteshark-staging2/customer-photos`.)*

## 2. Permissions, Flags & Tests
- **Feature Flags**: `owner_menu_photo_upload` (read-only disclosure), `local_guides_passport`, `private_photos`.
- **Tests**: `tests/customer-exploration.integration.cjs`, `tests/customer-exploration-browser.e2e.cjs`, `tests/p1-unified-discovery.integration.cjs`, `tests/discovery-cards-ux-browser.e2e.cjs`.
