# Domain Map — Listing Photos, Owner Preview & Private Customer Photos

## 1. Three Distinct Photo Subsystems in BiteShark

1. **Public Discovery Listing Photos (`vendors.photo_url` + `vendors.photo_rights_verified`)**:
   - Enforced in `lib/discovery.js#mapCatalogRow`, `public/app.js#resolveApprovedVendorImage`, and `public/listing-highlights.js#removeGenericStockPhoto`.
   - Public vendor photos render **only** when `photo_rights_verified === true` (set by `Admin: Top` in `/api/admin/vendors/update`) and the URL is not a generic stock host. All 59 seeded listings default to `false` and render BiteShark's category badge thumbnail.
2. **Owner Mode Menu Photo Preview (`#ownerPhotoGrid` in `public/app.js`)**:
   - Local browser-only preview tile governed by read-only disclosure `owner_menu_photo_upload` (`lib/feature-controls.js:414`). Never publishes unverified photos to public listings.
3. **Customer Personal Dish Photos (Branch-Aware)**:
   - **Baseline (`a4e9f53` & `a2f0135`)**: Browser-local `IndexedDB` (`truckly-dish-notebook-v1`, store `photos`, max 12 blobs `<= 5 MB`) in [public/local-guides.js](../../../public/local-guides.js).
   - **Branch `83181ba`**: Account-backed private photo storage (`lib/photo-storage.js` + `migrations/027` `customer_photos`, `FORCE RLS`, max 12 active photos/user, `<= 5 MiB`, re-encoded from scratch to `.webp` + thumbnail via `sharp@0.35.5` with EXIF/GPS stripped, stored outside `public/` under `BITESHARK_PHOTO_STORAGE_DIR`, served exclusively to the owner via `GET /api/me/photos/file` with `Cache-Control: private, no-store`, and backed up in `deploy/backup/truckly-staging-backup.sh`).

## 2. Permissions, Flags & Tests
- **Feature Flags**: `owner_menu_photo_upload` (read-only disclosure), `local_guides_passport` *(+ `private_photos` on `83181ba`)*.
- **Tests**: `tests/p1-unified-discovery.integration.cjs`, `tests/discovery-cards-ux-browser.e2e.cjs` *(+ `tests/customer-exploration.integration.cjs` & `tests/customer-exploration-browser.e2e.cjs` on `83181ba`)*.
- **Known Inconsistencies**: `public/policies/privacy.html:101` cites `localStorage` instead of `IndexedDB` (`KD-006`); on `83181ba`, `staging2` Nginx/systemd templates need `/api/me/photos` `8m` and `ReadWritePaths` before enabling photo uploads on `staging2`.
