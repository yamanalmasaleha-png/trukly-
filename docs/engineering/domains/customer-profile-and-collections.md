# Domain Map: Customer Profile Foundation, Greatest Hits Collections & Unlisted Sharing

This domain provides BiteShark's private-first customer account home (`My BiteShark`), account-backed preferences, curated **Greatest Hits** spot lists, revocable 256-bit hashed unlisted sharing (`/s/<opaque-token>`), per-photo consented WebP derivatives, and strictly scoped moderation.

> [!IMPORTANT]
> **Not a Social Network**: BiteShark intentionally omits followers, direct messages, comments on profiles, public activity feeds, popularity rankings, and public user search. `customer_profiles.visibility_mode` is constrained to `'private'` in PostgreSQL, and `public_profile_discovery` is locked `read_only: true` (`hidden`) in `lib/feature-controls.js`.

---

## 1. Authoritative Files & Canonical Reuse Map

| Layer | Files | Key Symbols / Responsibilities |
|---|---|---|
| **Domain Service** | [lib/customer-profile.js](../../../lib/customer-profile.js) | 4 explicit allowlisted DTO builders (`buildPrivateOwnerProfileDto`, `buildPrivateOwnerCollectionDto`, `buildSharedCollectionPublicDto`, `buildAdminShareModerationDto`), profile/preferences CRUD, Greatest Hits CRUD & reordering, 18+ sharing eligibility, hashed share-link lifecycle, `/s/<token>` SSR HTML renderer, consented photo attachment lifecycle, abuse report intake, and scoped staff moderation. |
| **Adult Eligibility** | [lib/age-policy.js](../../../lib/age-policy.js) | `evaluateAdultSharingEligibility` (`2026-11-draft-18plus-sharing-v1` in `America/Los_Angeles`; zero DOB persistence). |
| **Photo Derivatives** | [lib/photo-storage.js](../../../lib/photo-storage.js), [lib/customer-exploration.js](../../../lib/customer-exploration.js) | `createSharedPhotoDerivative` (`<2hex>/sha_<id>_shared.webp` re-encoded via `sharp` without metadata); `deleteUserPhoto` cascade revokes & unlinks derived `sha_*` files; `reconcilePhotoStorage` cleans revoked/orphaned `sha_*` files. |
| **HTTP Dispatcher** | [server/customer-profile-routes.js](../../../server/customer-profile-routes.js), [server/admin-routes.js](../../../server/admin-routes.js), [server/app.js](../../../server/app.js) | `CUSTOMER_PROFILE_PATHS` (21 JSON endpoints), `handleCustomerProfileRoute`, `handlePublicSharedPageRequest` (`GET|HEAD /s/:token`), `handlePublicSharedPhotoRequest` (`GET|HEAD /s/:token/photo/:attachment`), `GET|HEAD /profile`, `GET|HEAD /robots.txt`, and `sanitizeLoggedRequestPath`. |
| **Browser Client & UI** | [public/profile-client.js](../../../public/profile-client.js), [public/customer-profile.js](../../../public/customer-profile.js), [public/greatest-hits.js](../../../public/greatest-hits.js), [public/greatest-hits-sharing.js](../../../public/greatest-hits-sharing.js), [public/customer-profile.css](../../../public/customer-profile.css) | `window.bitesharkProfile` (in-memory user-scoped client), `#profileScreen` (`Overview`, `My activity`, `My progress`, `Greatest Hits`, `Preferences`, `Privacy & tools`), keyboard `↑ Up` / `↓ Down` reordering, deliberate note-copy confirmation, and server preview. |
| **Shared Page & Admin UI** | [public/shared-collection-page.js](../../../public/shared-collection-page.js), [public/shared-collection-page.css](../../../public/shared-collection-page.css), [public/admin.html](../../../public/admin.html), [public/admin.js](../../../public/admin.js) | Progressive recipient save-to-favorites (`/api/favorites/toggle`) & discreet signed-out/signed-in abuse reporting (`/api/shared/report` using `data-share-id`), plus `[data-mod-queue="shared_pages"]` in `/admin#moderation`. |
| **Schema & Edge** | [migrations/029_customer_profiles_collections_and_sharing.sql](../../../migrations/029_customer_profiles_collections_and_sharing.sql), `deploy/nginx/*.conf.template` | 8 `FORCE ROW LEVEL SECURITY` tables + Nginx `location ^~ /s/` (`access_log off;`, `no-store`, `no-referrer`, `noindex, nofollow, noarchive`). |

### Canonical Service Ownership (Zero Duplication)
- **Visits, Points, Levels, Badges, Weekly Challenge, Private Photos & Saved Trails** (*confirmed static*): Owned exclusively by `lib/customer-exploration.js` (`computeExplorationSummaryInTx`, `listUserVisits`, `listUserPhotos`, `listUserSavedTrails`, `exportUserExplorationData`) and `window.bitesharkExploration`.
- **Saved Places / Favorites** (*confirmed static*): Owned by `favorites` (`api/favorites/{list,toggle}.js`) and `favs` in `public/app.js`.
- **Nearby Alert Settings** (*confirmed static*): Owned by `notification_settings` (`api/notifications/settings.js`), surfaced with an explicit placeholder disclosure (`delivery_active: false`).
- **Business Catalog & Public Availability** (*confirmed static*): Owned by `lib/discovery.js` (`loadDiscoveryCatalog`, `isVendorPubliclyDiscoverable`).

---

## 2. Database Entities & RLS Session Guards (`migrations/029`)

All 8 tables enforce `ENABLE` + `FORCE ROW LEVEL SECURITY`:
1. `customer_profiles`: `user_id` PK (`REFERENCES auth_users ON DELETE CASCADE`), `public_profile_id` (`prf_*`), `display_name` (`<= 60`), `bio` (`<= 240`), `avatar_style`, `preferred_town`, `food_interests` (`TEXT[]`, `<= 10`), `communication_product_updates_opt_in` (`DEFAULT false`), `visibility_mode` (`CHECK = 'private'`), `allow_public_indexing` (`CHECK = false`), `revision`.
2. `customer_sharing_eligibility`: `user_id` PK, `eligibility_status` (`eligible_18_plus` | `ineligible_under_18`), `policy_version`, `assessment_basis` (`self_attested_dob_18plus_check`), `assessed_at` (zero DOB columns).
3. `customer_collections`: `id` (`col_*`), `user_id`, `title` (`1..100`), `intro` (`<= 500`), `visibility_mode` (`private` | `unlisted_link`), `moderation_status` (`active` | `suppressed`), `suppression_authority` (`mod` | `top`), `suppressed_content_sha256`, `revision`, `idempotency_key`, `deleted_at`. Cap: `5` active collections/user.
4. `customer_collection_photo_attachments`: `id` (`sha_*`), `collection_id`, `user_id`, `source_photo_id` (`REFERENCES customer_photos ON DELETE SET NULL`), `recorded_source_photo_id`, `shared_rel_path`, `mime_type` (`image/webp`), `byte_size`, `width`, `height`, `sha256_hex`, `owner_consented_at`, `moderation_status`, `revoked_at`, `files_purged_at`.
5. `customer_collection_entries`: `id` (`cle_*`), `collection_id`, `user_id`, `position` (`1..20`, `DEFERRABLE INITIALLY IMMEDIATE` unique `(collection_id, position)`), `vendor_id` (`REFERENCES vendors ON DELETE SET NULL`), `recorded_vendor_id`, `vendor_name_snapshot`, `vendor_town_snapshot`, `vendor_cuisine_snapshot`, `recommendation` (`<= 500`), `photo_attachment_id`.
6. `customer_collection_shares`: `id` (`shr_*`), `collection_id`, `user_id`, `token_sha256` (`UNIQUE`, 64-char SHA-256 hex of 256-bit random base64url token), `masked_token_hint`, `include_display_name`, `include_bio`, `include_preferred_area`, `include_achievements`, `include_shared_photos` (all `DEFAULT false`), `expires_at`, `status` (`active` | `revoked` | `replaced` | `suppressed`), `idempotency_key`. Cap: `3` active shares/collection.
7. `customer_share_reports`: `id` (`srp_*`), `share_id`, `collection_id`, `attachment_id`, `reporter_user_id`, `reporter_ip_hash`, `reason`, `details` (PII/token scrubbed), `status`.
8. `customer_share_moderation_events`: Append-only (`REVOKE UPDATE, DELETE` + trigger `prevent_append_only_mutation`).

**Transaction-Local RLS GUCs**:
- Owner context: `app.user_id = <verified auth_users.id>`.
- Public token lookup (`resolveLiveSharedCollectionByToken`, `readSharedCollectionPhotoByToken`): `app.share_lookup = 'true'` (read-only lookup by `token_sha256` / `share_id`).
- Signed-out/signed-in report intake (`submitPublicSharedPageReport`): `app.share_lookup = 'true'` + `app.share_report_intake = 'true'`.
- Scoped staff moderation (`enableShareModerationGuardsInTx`): sets `app.share_moderation = 'true'` while keeping `app.user_id` set to the **moderator's** own ID — `FORCE RLS` on `customer_visits` and `customer_photos` physically blocks moderators from reading unrelated private journals, private notes, or unshared photos.

---

## 3. HTTP Endpoints & `window.bitesharkProfile` Client Methods

| Endpoint | Methods | Auth / Feature Gate | Client Method (`window.bitesharkProfile`) |
|---|---|---|---|
| `/profile` | `GET, HEAD` | `14+` session (`302 /login.html?next=%2Fprofile` if anon) | Direct navigation / `window.openCustomerProfile` |
| `/api/me/profile` | `GET, POST` | `14+` session; `customer_profile` (`GET`), `customer_profile_editing` (`POST`) | `getProfile`, `updateProfile` |
| `/api/me/preferences` | `POST` | `14+` session; `customer_profile_editing` (+ `nearby_alert_preferences` if `nearby_alerts` supplied) | `updatePreferences` |
| `/api/me/profile/privacy` | `GET` | `14+` session (**always available** even if `customer_profile` is `hidden`) | `exportPrivacyArchive` |
| `/api/me/profile/delete-data` | `POST` | `14+` session + `confirm_delete: true` (**always available**) | `deleteProfileAndCollectionsData` |
| `/api/me/collections` | `GET, POST` | `14+` session; `greatest_hits_collections` | `listCollections`, `createCollection` |
| `/api/me/collections/detail` | `GET` | `14+` session; `greatest_hits_collections` | `getCollectionDetail` |
| `/api/me/collections/update` | `POST` | `14+` session; `greatest_hits_collections` (`409` if broadening active share without `confirm_shared_view_update: true`) | `updateCollection` |
| `/api/me/collections/delete` | `POST` | `14+` session (**always available** to owner) | `deleteCollection` |
| `/api/me/collections/preview` | `POST` | `14+` session; `greatest_hits_collections` | `previewSharedCollection` |
| `/api/me/collections/attach-photo` | `POST` | `14+` session; `shared_collection_photos` + `share_consent_confirmed: true` | `attachCollectionPhoto` |
| `/api/me/collections/remove-photo` | `POST` | `14+` session (**always available** to owner) | `removeCollectionPhoto` |
| `/api/me/sharing-eligibility` | `POST` | `14+` session; `unlisted_collection_sharing` (commits `ineligible_under_18` before returning `403` to prevent DOB retry coaching) | `submitSharingEligibility` |
| `/api/me/shares` | `GET` | `14+` session (**always available** to owner) | `listShares` |
| `/api/me/shares/create` | `POST` | `18+` eligible session; `unlisted_collection_sharing` | `createShare` |
| `/api/me/shares/update-settings` | `POST` | `18+` eligible session; `unlisted_collection_sharing` | `updateShareSettings` |
| `/api/me/shares/rotate` | `POST` | `18+` eligible session; `unlisted_collection_sharing` | `rotateShare` |
| `/api/me/shares/revoke` | `POST` | `14+` session (**always available** even if sharing `paused`/`hidden` or eligibility changed) | `revokeShare` |
| `/s/:token` | `GET, HEAD` | Public unlisted capability (`no-store`, `no-referrer`, `noindex, nofollow, noarchive`); `404` if invalid, expired, revoked, suppressed, owner suspended, or `unlisted_collection_sharing` `hidden` | Recipient browser navigation |
| `/s/:token/photo/:attachment` | `GET, HEAD` | Public unlisted image derivative (`image/webp`, `no-store`); re-validates active token, `include_shared_photos`, attachment status, source photo active, and `shared_collection_photos` state | `<img src="...">` on `/s/:token` |
| `/api/shared/report` | `POST` | Signed-out or signed-in (`5/hr` rate limit; age-gate exempt; accepts non-secret `share_id` only, rejecting raw tokens) | `public/shared-collection-page.js` |
| `/api/admin/shared-moderation` | `GET` | `Admin: Mod` or `Admin: Top` | `public/admin.js` (`loadSharedPagesModeration`) |
| `/api/admin/shared-moderation/decision` | `POST` | `Admin: Mod` or `Admin: Top` (`Admin: Top` required to reinstate `top` suppressions) | `public/admin.js` |
| `/api/admin/shared-moderation/photo` | `GET` | `Admin: Mod` or `Admin: Top` (serves reported `sha_*` derivative only) | `public/admin.js` |
