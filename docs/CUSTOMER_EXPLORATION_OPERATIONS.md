# BiteShark Customer Exploration, Visit Journal, Private Photos & Suggested Trails — Operations & Contracts

## 1. Scope & Architecture

BiteShark’s customer exploration tools (`Local Guides`, `Editorial Stories`, `Visit journal / Passport`, `Private photos`, `Badges`, `Weekly challenges`, and `Suggested trails`) run on one unified account-backed persistence and governance layer:

- **Database Schema**: `migrations/027_customer_exploration_foundation.sql` (`customer_visits`, `customer_photos`, `customer_saved_trails`, `customer_saved_trail_stops`), all protected by `ENABLE` + `FORCE ROW LEVEL SECURITY` scoped to transaction-local `current_setting('app.user_id', true)`.
- **Backend Domain Service**: `lib/customer-exploration.js`, `lib/photo-storage.js`, `lib/editorial-stories.js`.
- **HTTP Handlers**: `server/customer-exploration-routes.js` mounted through `server/admin-routes.js` (preserving the frozen 30-file `api/*.js` surface).
- **Frontend Shared Client**: `public/exploration-client.js` (`window.bitesharkExploration`), consumed by `public/local-guides.js`, `public/guide-passport.js`, and `public/smart.js`.

## 2. Canonical Calendar Timezone & Scoring Rules

- **Canonical Timezone**: `America/Los_Angeles` (`EXPLORATION_TIMEZONE`). Every visit stores UTC `visited_at` (`TIMESTAMPTZ`) alongside server-computed `visit_local_date` (`DATE`).
- **Self-Reported Visits & Repeat Visits**:
  - Visits are self-reported (never GPS-, purchase-, or vendor-verified).
  - At most **1 active visit per `(user_id, recorded_vendor_id, visit_local_date)`** (`idx_customer_visits_unique_user_vendor_day`).
  - Repeat visits on distinct Pacific calendar days are allowed and each counts `+25` points.
  - Same-day duplicate retries return `200 OK` with `already_logged_today: true` (`VISIT_ALREADY_LOGGED_TODAY`).
- **Points & Levels** (non-monetary, reversible upon deletion):
  - `25` points per active visit; `10` points per active photo (up to `12` active photos per account).
  - Levels: `Flavor Scout` (`0`), `Neighborhood Regular` (`50`), `Local Insider` (`125`), `Flavor Legend` (`250`).
- **Exploration Badges** (canonical taxonomy; spelling variants and county-wide `'Sonoma County'` placeholders never create extra categories):
  - `first_bite` (`1` distinct business), `neighborhood_scout` (`3` distinct businesses), `flavor_hopper` (`3` normalized cuisine categories), `town_hopper` (`2` normalized Sonoma County towns), `photo_keeper` (`1` active private photo).
- **Weekly Challenge (`two_stop_taste_trail`)**:
  - Monday `00:00` through Sunday `23:59:59` in `America/Los_Angeles`.
  - Counts at most `1` visit per business per calendar day; visiting the same business on `2` different days in the same Monday–Sunday week satisfies `2 / 2`.
- **Saved Trail Progress**:
  - A saved stop counts as visited when the user has an active visit to `recorded_vendor_id` with `visit_local_date >= saved_local_date`. Opening, sharing, or viewing a trail never auto-logs a visit.

## 3. Contracts for Future Profile Pages

Future profile pages should consume the shared JSON endpoints directly without scraping DOM or reading browser storage:

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /api/me/exploration` | Required | Exploration summary: `counts`, `achievements` (`total_points`, `current_level`, `next_level`, `badges[]`), `weekly_challenge`, `disclosures`, and `feature_states`. |
| `GET /api/me/visits?limit=&offset=&vendor_id=` | Required | Paginated visit journal entries with `visit_id`, `vendor_id`, `business_name`, `business_status` (`active` \| `unavailable`), `can_open_detail`, `visit_local_date`, `private_note`. |
| `POST /api/me/visits` / `POST /api/me/visits/delete` | Required | Create or soft-delete a visit and receive recalculated `exploration` summary. |
| `GET /api/me/photos?limit=&offset=&vendor_id=` | Required | Paginated private photo records (`photo_id`, `vendor_id`, `caption`, `thumb_url`, `main_url`, dimensions, `taken_local_date`). |
| `GET /api/me/photos/file?id=<photo_id>&variant=thumb\|main` | Required | Owner-checked binary photo stream (`Cache-Control: private, no-store, max-age=0`). |
| `GET /api/me/trails?limit=&offset=` | Required | Saved suggested trails with ordered `stops[]` and `progress` (`completed_stops`, `total_stops`, `completed`). |
| `GET /api/me/exploration/export` | Required | Complete JSON privacy export of the authenticated user’s exploration summary, visits, photo metadata, and saved trails (remains accessible even when UI feature flags are `hidden`). |
| `GET /api/stories` | Public | Canonical sourced BiteShark editorial stories (`story_id`, `vendor_id`, `source_url`, `media_kind`, `illustration_key`). |
| `GET /api/trails/suggest?theme=&town=&offset=&ids=` | Public | Deterministic suggested trail generator and shared `?trail=` / `#trail=` resolver. |

**Historical Business Safety**: Each row stores `vendor_id REFERENCES vendors(id) ON DELETE SET NULL` plus immutable `recorded_vendor_id` and `vendor_name_snapshot`. If a vendor is later renamed, unpublished (`hidden_from_discovery = true`), or deactivated (`is_active = false`), the user’s private history retains a safe historical label (`business_status: 'unavailable'`, `can_open_detail: false`), while public shared trail links (`/api/trails/suggest?ids=...`) return `'Unavailable listing'` without exposing unpublished vendor metadata.

## 4. Private Photo Storage, Backup & Restore (`staging.biteshark.live`)

- **Persistent Host Path**: `/var/lib/truckly-staging/customer-photos` (`0700 truckly-stg:truckly-stg`; parent `/var/lib/truckly-staging` `0750 root:truckly-stg`), configured via `BITESHARK_PHOTO_STORAGE_DIR` in `/etc/truckly-staging/staging.env` and `ReadWritePaths=/var/lib/truckly-staging/customer-photos` in `truckly-staging-api.service`.
- **Isolation**: Stored outside `/srv/truckly-staging/releases/*` and outside any Nginx static root. Release switching preserves all uploaded files.
- **Image Sanitization**: Decoded and re-encoded via `sharp` (`<= 5 MB`, `<= 6000x6000` / `25M` pixels, JPEG/PNG/WebP magic-byte + full pixel decode, EXIF orientation auto-rotated, all EXIF/GPS/XMP/IPTC metadata stripped, `320x320` WebP thumbnail + `<= 1600px` main image written atomically with `0600` permissions).
- **Backup**: `deploy/backup/truckly-staging-backup.sh` archives `/var/lib/truckly-staging/customer-photos` into `truckly_staging_photos_<TS>.tar.gz.gpg` alongside the PostgreSQL dump `truckly_staging_<TS>.dump.gpg` using `/etc/truckly-staging/backup.passphrase`.
- **Restore**:
  ```bash
  gpg --batch --yes --passphrase-file /etc/truckly-staging/backup.passphrase \
    -d /var/backups/truckly-staging/truckly_staging_photos_<TS>.tar.gz.gpg \
    | tar -xzf - -C /var/lib/truckly-staging
  chown -R truckly-stg:truckly-stg /var/lib/truckly-staging/customer-photos
  chmod 0700 /var/lib/truckly-staging/customer-photos
  ```

## 5. Independent Feature Controls

Managed by `Top Admin` in `/admin#features` (or via `scripts/feature-control-cli.cjs`):

- `local_guides_passport`: Parent hub entry; hiding it cascades via DAG to `editorial_stories`, `visit_journal`, and `private_photos`.
- `editorial_stories`: Controls `/api/stories`, `#discoverStoriesStrip`, and the `Stories` tab.
- `visit_journal`: Controls `/api/me/visits*`, `[data-detail-log-visit]`, and the `Visit journal` tab (`paused` preserves read-only history while blocking new logs/deletes; `hidden` hides UI and blocks route reads while preserving database rows and `/api/me/exploration/export`).
- `private_photos`: Controls `/api/me/photos*`, `[data-detail-save-photo]`, and the `Private photos` tab.
- `exploration_badges`: Controls points/level/badge presentation (`achievements_hidden: true`) without erasing visits/photos or corrupting underlying counts; points continue accruing from underlying rows and reappear intact when re-enabled.
- `weekly_challenges`: Controls weekly challenge presentation (`weekly_challenge_hidden: true`) without affecting visit records.
- `suggested_trails`: Controls `/api/trails/suggest`, `/api/me/trails*`, `#discoverSuggestedTrailsBar`, and the `Suggested trails` tab (`paused` keeps public preview/sharing active while pausing account trail saves/deletes).
- `flavor_lab_tools`: Controls `Flavor finder` and the Owner Mode `Marketing kit` (`#ownerMarketingCard`).
- `street_whispers`: Controls the editorial clues, 3-question quiz, and weekend checkoff in `#communityScreen`.

## 6. Rollback Procedure (Non-Destructive)

1. **Immediate Feature-Level Rollback (Zero Restart)**: Top Admin sets any affected feature key (`private_photos`, `visit_journal`, `suggested_trails`, `editorial_stories`, or `local_guides_passport`) to `paused` or `hidden` in `/admin#features`.
2. **Application Release Rollback**: Point `/srv/truckly-staging/current` back to the prior release directory under `/srv/truckly-staging/releases/<PREV_SHA>` and run `systemctl restart truckly-staging-api.service truckly-staging-worker.service`.
3. **Database Compatibility**: Migration `027_customer_exploration_foundation.sql` is strictly additive (4 new `customer_*` tables; zero destructive alterations to existing tables). Never run `DROP TABLE` during a routine rollback — leaving `027` tables intact preserves customer records for forward repair while older releases ignore those tables cleanly.
