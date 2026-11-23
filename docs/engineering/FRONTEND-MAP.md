# Frontend Architecture, Load Order, DOM & CSS Cascade Map

BiteShark's frontend is a **classic-script browser application without a bundler**. Every `<script>` in `public/index.html` shares the global lexical scope, making `<script>` and `<link rel="stylesheet">` order a critical runtime contract.

For machine-generated element, handler, storage, and selector lists, see [FRONTEND-INVENTORY.md](generated/FRONTEND-INVENTORY.md).

---

## 1. HTML Entrypoints & Ordered `<script>` Chains

### A. Main Customer & Vendor App (`public/index.html`)
On `feature/private-profiles-greatest-hits`, `public/index.html` loads **19 synchronous scripts** at the end of `<body>` (`15` on `working/biteshark-vps`; `14` on `testing/yaman-staging2`; `+ /map-cards.js` on `antigravity/staging2-latest`):
1. `https://unpkg.com/leaflet@1.9.4/dist/leaflet.js` — External map library (`window.L`; graceful List fallback if unreachable).
2. `/diagnostics-client.js` — Exposes `window.bitesharkDiagnostics` (`fetchJsonBounded`, `escapeHtml`, `openModalDialog`, `closeModalDialog`, `createIdempotencyKey`, global `error`/`unhandledrejection` capture). **Must load before all first-party scripts.**
3. `/auth-client.js` — Exposes `window.bitesharkAuth` (aliases `window.trucklyAuth`, `window.biteshark.auth`) for `/api/auth/*`.
4. `/exploration-client.js` — Exposes `window.bitesharkExploration` (`getSummary`, `listVisits`, `logVisit`, `deleteVisit`, `listPhotos`, `uploadPhoto`, `deletePhoto`, `fetchSuggestedTrail`, `listSavedTrails`, `saveTrail`, `deleteSavedTrail`, `exportAccountData`, `inspectLegacyDeviceData`, `importLegacyDeviceData`).
5. `/profile-client.js` — Exposes `window.bitesharkProfile` (`getProfile`, `updateProfile`, `updatePreferences`, `exportPrivacyArchive`, `deleteProfileAndCollectionsData`, `listCollections`, `getCollectionDetail`, `createCollection`, `updateCollection`, `deleteCollection`, `previewSharedCollection`, `attachCollectionPhoto`, `removeCollectionPhoto`, `submitSharingEligibility`, `listShares`, `createShare`, `updateShareSettings`, `rotateShare`, `revokeShare`, `syncActiveUserScope`, `clearMemoryCache`).
6. `/role-experience.js` — Snapshots `INITIAL_ARRIVAL_PATH` and `INITIAL_ARRIVAL_HASH` **before** `pager.js` scrubs URL hashes; monkey-patches `window.fetch` to attach `X-BiteShark-Viewpoint` / `X-BiteShark-Act-On-Behalf` headers and handle `403`/`503` feature-control responses; injects `#rxMyProfileBtn` (`🧭 My BiteShark`); exposes `window.bitesharkFeatures`, `window.bitesharkWelcome`, `window.bitesharkOpenSupport`, `window.bitesharkOpenCommunityReport`, `window.openExplorationPrivacyModal`.
7. `/app.js` — Core catalog, map/list discovery, favorites, bookings, and `#ownerScreen` controller. Defines top-level globals `trucks`, `favs`, `bookings`, `showScreen`, `applyFilters`, `openDetail`, `cardHTML`, `extraDetail`, `openAppModal`, `closeAppModal`, and `window.bitesharkReady`.
8. `/listing-highlights.js` — Exposes `window.bitesharkListingHighlights`, **wraps `openDetail` (#1)** to inject verified menu/dish highlights into `#detailContent .detail-body`, and calls `applyFilters()`.
9. `/pager.js` — Customer pickup pager (`#pagerScreen`) and vendor kitchen queue; executes `loadPagerHash()` synchronously (scrubbing `#pager=<uuid>` via `history.replaceState`).
10. `/smart.js` — Flavor Lab / Suggested Trails (`#smartScreen`); **wraps `openDetail` (#2)** and runs `openSmartHash()`.
11. `/characters.js` — SVG mascots; **wraps `applyFilters`** to run `updateFlavorCharacters()`.
12. `/coffee-club.js` — Exposes `flavorDoodle` and executes `paintFlavorIcons()` mutating `.bottom-nav` and pill icons.
13. `/local-guides.js` — Editorial stories & photo notebook on `#guidesScreen`.
14. `/guide-passport.js` — Food Passport stamps, badges & weekly challenge on `#guidesScreen`.
15. `/community.js` — Community Hub (`#communityScreen`) & `#ownerScreen` legacy moderation queue.
16. `/street-whispers.js` — Street Whispers prompts/missions (`streetInit()`).
17. `/customer-profile.js` — Private profile shell & tab controller (`#profileScreen`, `window.openCustomerProfile`, `window.bitesharkResetProfileUiOnAuthChange`).
18. `/greatest-hits.js` — Curated Greatest Hits collection manager, keyboard `↑ Up`/`↓ Down` reordering & deliberate visit-note copy confirmation (`window.bitesharkGreatestHitsHooks`).
19. `/greatest-hits-sharing.js` — Server-side shared preview, 18+ self-attested confirmation, consented photo attachment picker & unlisted share-link controls.

> [!WARNING]
> **Branch-Specific Script Additions**:
> - `feature/customer-exploration-journal-trails` (`83181ba`) inserts `/exploration-client.js` (`window.bitesharkExploration`) **between `/auth-client.js` and `/role-experience.js`**.
> - `antigravity/staging2-latest` (`a2f0135`) inserts `/map-cards.js` (`window.BiteSharkMapCards`) **immediately before `/app.js`**.
> - Reordering scripts breaks `openDetail`/`applyFilters` decorator chains and `INITIAL_ARRIVAL_HASH` capture!

### B. Other HTML Entrypoints
- **`public/login.html`**: `/diagnostics-client.js` -> `/auth-client.js` -> inline OTP/signup/14+-DOB controller (`window.__bitesharkLoginReady = true`).
- **`public/admin.html`** (server-gated at `/admin` to `Admin: Mod` / `Admin: Top`): `/diagnostics-client.js` -> `/auth-client.js` -> `/admin.js`.
- **`public/policies/*.html`** (8 pages: `index`, `terms`, `privacy`, `cookies-storage`, `community-guidelines`, `vendor-terms`, `accessibility`, `security-contact`): Zero JavaScript; link `/policies/policies.css`.
- **Dynamic Server-Rendered Unlisted Shared Pages (`GET /s/<token>` in `lib/customer-profile.js`)**: Zero third-party scripts/fonts/trackers; loads only `/shared-collection-page.css` and `/shared-collection-page.js` under strict `Content-Security-Policy` + `no-referrer` + `no-store`.

---

## 2. Screens, Modals & Client URL Routing

- **11 `<main class="screen">` Views in `public/index.html`** (switched via `showScreen(name)` in `public/app.js`):
  `#discoverScreen` (default `.active.list-mode`), `#communityScreen`, `#guidesScreen`, `#smartScreen`, `#pagerScreen`, `#favoritesScreen`, `#bookingsScreen`, `#ownerScreen`, `#welcomeScreen`, `#vendorIntroScreen`, `#profileScreen` (`My BiteShark`).
- **Modal Systems (Watch Stacking Order!)**:
  1. Static `app.js` modals (`.modal-backdrop`, `z-index: 2000`, toggled via `.show` in `openAppModal`/`closeAppModal`): `#detailModal`, `#bookingModal`, `#ownerProfileModal`, `#distanceModal`, `#areaModal`.
  2. Dynamic `role-experience.js` modals inside `#rxModalsRoot` (`.rx-modal-backdrop`, `z-index: 1400`, toggled via `hidden` in `rxOpenModal`/`rxCloseModal`): `#vendorApplyModal`, `#supportIssuesModal`, `#communityReportModal`, `#inviteAcceptModal`, `#rxAgeAssessmentModal`, `#rxExplorationPrivacyModal`. *(Note: `.rx-modal-backdrop` has lower `z-index` than `.modal-backdrop`; close `#detailModal`/`#bookingModal` before opening `rx*` modals!)*
  3. Admin modals in `public/admin.html` (`.admin-modal-backdrop`, `adminOpenModal`/`adminCloseModal`): `#aobModal`, `#featureConfirmModal`, `#invActionModal`, `#invHistoryModal`.
- **Supported Hash & Query Routes**:
  - `index.html` / `/profile`: `/profile`, `#profile`, `#my-biteshark`, `#profile-activity`, `#profile-progress`, `#profile-collections`, `#greatest-hits`, `#profile-preferences`, `#profile-privacy`, `#welcome`, `#owner`, `#accept-invite=<token>`, `#support`, `#support-resume`, `#support=<BS-XXXXXX>`, `#pager=<uuid>`, `#pager-ref=<sub_uuid>`, `#spot=<id>`, `#trail=<id1,id2,...>`; query params `?viewpoint=customer|vendor|act|clear`, `&vendor_id=<id>`, `?vendor_onboard=claim|new`, `&claim_vendor=<id>`, `?vendor_intro=1`, `?place=<id>` / `?spot=<id>`, `?invite=1`.
  - `login.html`: `?mode=signup`, `?next=<path>`, `?assess=1`, `?invite=1`, `#accept-invite=<token>`.
  - `admin.html`: `#<section>` or `?section=<section>` (`overview`, `applications`, `vendors`, `accounts`, `moderation`, `issues`, `readiness`, `features`, `audit`, `diagnostics`, `health`).

---

## 3. Stylesheet Cascade Order & Known CSS Traps

`public/index.html` loads **17 stylesheets** in order:
`leaflet.css` -> `theme.css` -> `neighborhood.css` -> `pager.css` -> `pager-experience.css` -> `smart.css` -> `characters.css` -> `coffee-club.css` -> `local-guides.css` -> `guide-passport.css` -> `layout-polish.css` -> `community.css` -> `street-whispers.css` -> `mobile-scroll-fix.css` -> `color-calm.css` -> `role-experience.css` -> `customer-profile.css` *(+ `map-cards.css` on `a2f0135`)*.

### Critical Cascade Hot Spots to Know Before Styling
1. **`theme.css:20` `.primary, .secondary { width: 100%; min-height: 48px }`**: Stretches every `.primary` and `.secondary` button to `100%` width by default! Inline/flex button groups MUST explicitly set `width: auto` on `.primary, .secondary`.
2. **4× `:root` Token Redefinitions**: `--coral`, `--cream`, `--ink`, `--muted`, `--mustard`, `--mint`, `--shadow` are redefined across `theme.css` -> `neighborhood.css` -> `local-guides.css` -> `color-calm.css` (`color-calm.css` is authoritative for the cream/forest-green `--trk-*` palette).
3. **`.truck-card` Architecture**: Legacy `.truck-card` rules in `theme.css` and `neighborhood.css` are superseded by the compact horizontal card layout in `color-calm.css` (which also hides legacy `.truck-card > .truckly-spotlight`). Edit `color-calm.css` directly rather than appending `!important` sheets.
4. **`.bottom-nav` Grid & Runtime Icon Replacement**: Defined across 7 CSS files (primary mobile breakpoint `@media (max-width: 749px)`), and `coffee-club.js` (`paintFlavorIcons`) replaces `.bottom-nav button > span` text/emojis with SVG doodles at runtime.
