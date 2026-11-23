# Observed UI Element Inventory (Code-Grounded Layer 1)

> [!NOTE]
> **Generated from Structured Source ([decisions.json](decisions.json))** — Do not edit answers directly in Markdown.
> Update `docs/engineering/style-guide/decisions.json` and run `npm run style-guide:generate` (verified by `npm run style-guide:validate`).
> - **Generator**: `biteshark-style-guide@1.0.0` (`biteshark.style-guide-decisions.v1`)
> - **Decisions Source Digest**: `6ca6ad2afe647b1bb681bf8b3167fa105f60151da370936266954f1e8626a121`

> [!IMPORTANT]
> **Implementation Facts vs. Design Decisions**:
> Everything in this inventory records **observed code facts** from BiteShark's HTML, CSS, and JavaScript modules on `working/biteshark-vps (via handbook baseline)` (cross-referenced with [FRONTEND-INVENTORY.md](../generated/FRONTEND-INVENTORY.md), [FRONTEND-MAP.md](../FRONTEND-MAP.md), and [UI-AND-CONTENT-GUIDE.md](../UI-AND-CONTENT-GUIDE.md)).
> Existing implementation values are **not** approved style-guide decisions; blank decision fields live in the linked topic questionnaires.

---

## 1. Component Catalog Overview (29 Total: 25 Applicable, 4 Unconfirmed)

| Component ID | Implementation Name | Topic Questionnaire | Applicability | Evidence Level | Roles |
|---|---|---|---|---|---|
| [`CMP-NAV-TOPBAR`](#cmp-nav-topbar) | Primary App Header, Area Pill & Account Menu (.topbar) | [Navigation, Wayfinding & Role Switching](navigation.md#cmp-nav-topbar) | `applicable` | `confirmed_static` | `Anonymous Visitor`, `Customer`, `Vendor Staff`, `Vendor Owner`, `Admin: Mod`, `Admin: Top` |
| [`CMP-NAV-BOTTOM-BAR`](#cmp-nav-bottom-bar) | Mobile Bottom Navigation Bar (.bottom-nav) | [Navigation, Wayfinding & Role Switching](navigation.md#cmp-nav-bottom-bar) | `applicable` | `confirmed_static` | `Anonymous Visitor`, `Customer`, `Vendor Staff`, `Vendor Owner`, `Admin: Mod`, `Admin: Top` |
| [`CMP-NAV-TABS-SWITCHES`](#cmp-nav-tabs-switches) | Segmented Mode Switches, ARIA Tablists & Queue Sub-Tabs | [Navigation, Wayfinding & Role Switching](navigation.md#cmp-nav-tabs-switches) | `applicable` | `confirmed_static` | `Anonymous Visitor`, `Customer`, `Vendor Staff`, `Vendor Owner`, `Admin: Mod`, `Admin: Top` |
| [`CMP-NAV-ROLE-BANNER`](#cmp-nav-role-banner) | Viewpoint Preview Banner, Act-on-Behalf Strip & Admin Sidebar Shell | [Navigation, Wayfinding & Role Switching](navigation.md#cmp-nav-role-banner) | `applicable` | `confirmed_static` | `Vendor Staff`, `Vendor Owner`, `Admin: Mod`, `Admin: Top` |
| [`CMP-FORM-CONTROLS`](#cmp-form-controls) | Standard Form Fields, Search Inputs, Selects, Toggles & Package Radios | [Forms, Inputs & Validation](forms-and-inputs.md#cmp-form-controls) | `applicable` | `confirmed_static` | `Anonymous Visitor`, `Customer`, `Vendor Staff`, `Vendor Owner`, `Admin: Mod`, `Admin: Top` |
| [`CMP-FORM-UPLOAD-OTP`](#cmp-form-upload-otp) | File Upload Controls, 14+ DOB Fieldset & Email OTP Sign-In Card | [Forms, Inputs & Validation](forms-and-inputs.md#cmp-form-upload-otp) | `applicable` | `confirmed_static` | `Anonymous Visitor`, `Customer`, `Vendor Owner`, `Admin: Mod`, `Admin: Top` |
| [`CMP-BTN-ACTIONS`](#cmp-btn-actions) | Action Buttons, Icon Buttons, Link-Buttons & Admin Action Controls | [Buttons, Links & Destructive Actions](buttons-and-actions.md#cmp-btn-actions) | `applicable` | `confirmed_static` | `Anonymous Visitor`, `Customer`, `Vendor Staff`, `Vendor Owner`, `Admin: Mod`, `Admin: Top` |
| [`CMP-CARD-DISCOVERY`](#cmp-card-discovery) | Unified Discovery & Saved Listing Card (cardHTML / .truck-card) | [Cards, Listings, Badges, Tables & Pagination](cards-and-listings.md#cmp-card-discovery) | `applicable` | `confirmed_static` | `Anonymous Visitor`, `Customer`, `Vendor Staff`, `Vendor Owner`, `Admin: Mod`, `Admin: Top` |
| [`CMP-CARD-DETAIL`](#cmp-card-detail) | Business Detail Sheet, Verified Menu Highlights & Source Truthfulness Card | [Cards, Listings, Badges, Tables & Pagination](cards-and-listings.md#cmp-card-detail) | `applicable` | `confirmed_static` | `Anonymous Visitor`, `Customer`, `Vendor Staff`, `Vendor Owner`, `Admin: Mod`, `Admin: Top` |
| [`CMP-CHIPS-BADGES`](#cmp-chips-badges) | Filter Chips, Status Pills, Role/Verification Badges & Severity Tags | [Cards, Listings, Badges, Tables & Pagination](cards-and-listings.md#cmp-chips-badges) | `applicable` | `confirmed_static` | `Anonymous Visitor`, `Customer`, `Vendor Staff`, `Vendor Owner`, `Admin: Mod`, `Admin: Top` |
| [`CMP-DATA-TABLES-PAGERS`](#cmp-data-tables-pagers) | Admin Data Tables, Key-Value Metadata Grids & Pagination Controls | [Cards, Listings, Badges, Tables & Pagination](cards-and-listings.md#cmp-data-tables-pagers) | `applicable` | `confirmed_static` | `Customer`, `Admin: Mod`, `Admin: Top` |
| [`CMP-DIALOG-MODAL`](#cmp-dialog-modal) | Modal Dialogs & Governance Confirmation Modals | [Dialogs, Sheets, Popovers & Disclosures](dialogs-and-overlays.md#cmp-dialog-modal) | `applicable` | `confirmed_static` | `Anonymous Visitor`, `Customer`, `Vendor Staff`, `Vendor Owner`, `Admin: Mod`, `Admin: Top` |
| [`CMP-DRAWER-DISCLOSURE`](#cmp-drawer-disclosure) | Discovery Sheet (#truckSheet), Inline &lt;details&gt; Disclosures & Dropdown Popovers | [Dialogs, Sheets, Popovers & Disclosures](dialogs-and-overlays.md#cmp-drawer-disclosure) | `applicable` | `confirmed_static` | `Anonymous Visitor`, `Customer`, `Vendor Staff`, `Vendor Owner`, `Admin: Mod`, `Admin: Top` |
| [`CMP-FEEDBACK-NOTICES`](#cmp-feedback-notices) | Toasts, Callout Banners, Feature-Paused Notices, Loading & Empty/Offline States | [Feedback, Banners, Loading & Recovery States](feedback-and-status.md#cmp-feedback-notices) | `applicable` | `confirmed_static` | `Anonymous Visitor`, `Customer`, `Vendor Staff`, `Vendor Owner`, `Admin: Mod`, `Admin: Top` |
| [`CMP-MEDIA-VISUALS`](#cmp-media-visuals) | Vendor Thumbnails, Category SVG Fallbacks, Editorial Artwork, Mascots & Doodles | [Imagery, Fallbacks, Illustrations & Icons](imagery-and-icons.md#cmp-media-visuals) | `applicable` | `confirmed_static` | `Anonymous Visitor`, `Customer`, `Vendor Staff`, `Vendor Owner`, `Admin: Mod`, `Admin: Top` |
| [`CMP-MAP-SURFACE`](#cmp-map-surface) | Interactive Leaflet Map, Pins, Area/Distance Selectors & Map Fallback Card | [Maps, Markers, Area Selection & Location Confidence](maps-and-location.md#cmp-map-surface) | `applicable` | `confirmed_static` | `Anonymous Visitor`, `Customer`, `Vendor Staff`, `Vendor Owner`, `Admin: Mod`, `Admin: Top` |
| [`CMP-DOM-ONBOARDING`](#cmp-dom-onboarding) | Customer Welcome Screen, Vendor Intro Screen & Vendor Application Flow | [Domain & Specialized Role Interfaces](domain-components.md#cmp-dom-onboarding) | `applicable` | `confirmed_static` | `Anonymous Visitor`, `Customer`, `Vendor Owner` |
| [`CMP-DOM-BOOKINGS`](#cmp-dom-bookings) | Event Catering Inquiry Form, Customer Bookings List & Vendor Request Queue | [Domain & Specialized Role Interfaces](domain-components.md#cmp-dom-bookings) | `applicable` | `confirmed_static` | `Anonymous Visitor`, `Customer`, `Vendor Staff`, `Vendor Owner`, `Admin: Mod`, `Admin: Top` |
| [`CMP-DOM-PAGER`](#cmp-dom-pager) | Digital Pickup Pager, Interactive Sample Demo, Push Panel & Kitchen Queue | [Domain & Specialized Role Interfaces](domain-components.md#cmp-dom-pager) | `applicable` | `confirmed_static` | `Anonymous Visitor`, `Customer`, `Vendor Staff`, `Vendor Owner`, `Admin: Top` |
| [`CMP-DOM-COMMUNITY`](#cmp-dom-community) | Community Hub Posts, 1-5 Star Reviews, Street Whispers & Moderation Queue | [Domain & Specialized Role Interfaces](domain-components.md#cmp-dom-community) | `applicable` | `confirmed_static` | `Anonymous Visitor`, `Customer`, `Vendor Owner`, `Admin: Mod`, `Admin: Top` |
| [`CMP-DOM-EXPLORATION`](#cmp-dom-exploration) | Visit Journal, Food Passport Badges/Challenges, Editorial Stories, Private Photos & Suggested Trails | [Domain & Specialized Role Interfaces](domain-components.md#cmp-dom-exploration) | `applicable` | `confirmed_static` | `Anonymous Visitor`, `Customer`, `Vendor Staff`, `Vendor Owner`, `Admin: Mod`, `Admin: Top` |
| [`CMP-DOM-VENDOR-OPS`](#cmp-dom-vendor-ops) | Vendor Owner Workspace (#ownerScreen: Live Spot, Schedule, Marketing Kit & Team Invites) | [Domain & Specialized Role Interfaces](domain-components.md#cmp-dom-vendor-ops) | `applicable` | `confirmed_static` | `Anonymous Visitor`, `Customer`, `Vendor Staff`, `Vendor Owner`, `Admin: Mod`, `Admin: Top` |
| [`CMP-DOM-SUPPORT`](#cmp-dom-support) | Support & Feedback Ticket Composer, Ticket Inbox & Timeline Thread | [Domain & Specialized Role Interfaces](domain-components.md#cmp-dom-support) | `applicable` | `confirmed_static` | `Anonymous Visitor`, `Customer`, `Vendor Staff`, `Vendor Owner`, `Admin: Mod`, `Admin: Top` |
| [`CMP-DOM-ADMIN-PORTAL`](#cmp-dom-admin-portal) | Two-Tier Admin Portal (Overview, Split-Pane Queues, Feature Controls, Diagnostics & Readiness) | [Domain & Specialized Role Interfaces](domain-components.md#cmp-dom-admin-portal) | `applicable` | `confirmed_static` | `Admin: Mod`, `Admin: Top` |
| [`CMP-DOM-LEGAL-POLICIES`](#cmp-dom-legal-policies) | Preliminary Legal & Policy Pages, Draft Banners & Unresolved Callouts (/policies/*.html) | [Domain & Specialized Role Interfaces](domain-components.md#cmp-dom-legal-policies) | `applicable` | `confirmed_static` | `Anonymous Visitor`, `Customer`, `Vendor Staff`, `Vendor Owner`, `Admin: Mod`, `Admin: Top` |
| [`CMP-UNCONF-DARK-COLOR-SCHEME`](#cmp-unconf-dark-color-scheme) | Dark Theme / Automatic prefers-color-scheme Surface Mode (Unconfirmed) | [Foundations & Design Tokens](foundations.md#cmp-unconf-dark-color-scheme) | `unconfirmed` | `unconfirmed_future_or_branch` | `Anonymous Visitor`, `Customer`, `Vendor Staff`, `Vendor Owner`, `Admin: Mod`, `Admin: Top` |
| [`CMP-UNCONF-MINIATURE-TRUCK-MARKERS`](#cmp-unconf-miniature-truck-markers) | Illustrated Cuisine SVG Truck Map Markers & Cluster Menus (Branch Candidate) | [Maps, Markers, Area Selection & Location Confidence](maps-and-location.md#cmp-unconf-miniature-truck-markers) | `unconfirmed` | `unconfirmed_future_or_branch` | `Anonymous Visitor`, `Customer`, `Vendor Staff`, `Vendor Owner`, `Admin: Mod`, `Admin: Top` |
| [`CMP-UNCONF-CUSTOMER-PROFILE-SHARING`](#cmp-unconf-customer-profile-sharing) | Private Customer Profile Dashboard, Curated "Greatest Hits" & Unlisted /s/&lt;token&gt; Share Page (Branch Candidate) | [Domain & Specialized Role Interfaces](domain-components.md#cmp-unconf-customer-profile-sharing) | `unconfirmed` | `unconfirmed_future_or_branch` | `Anonymous Visitor`, `Customer`, `Admin: Mod`, `Admin: Top` |
| [`CMP-UNCONF-PUBLIC-PHOTO-MODERATION`](#cmp-unconf-public-photo-moderation) | Public Vendor Menu/Listing Photo Upload & Rights Verification UI (Disabled Flag) | [Domain & Specialized Role Interfaces](domain-components.md#cmp-unconf-public-photo-moderation) | `unconfirmed` | `unconfirmed_future_or_branch` | `Vendor Owner`, `Admin: Mod`, `Admin: Top` |

---

## 2. Active Reusable Components Observed in Code (25)

### <a id="cmp-nav-topbar"></a>`CMP-NAV-TOPBAR` — Primary App Header, Area Pill & Account Menu (.topbar)

- **Design Questionnaire**: [Navigation, Wayfinding & Role Switching (`navigation.md`)](navigation.md#cmp-nav-topbar)
- **Applicability**: `applicable` · **Evidence Level**: `confirmed_static`
- **Screens / Surfaces**: `public/index.html (persistent across all 10 screens)`
- **User Roles**: `Anonymous Visitor`, `Customer`, `Vendor Staff`, `Vendor Owner`, `Admin: Mod`, `Admin: Top`
- **Selectors**: `.topbar`, `.topbar .brand`, `.location-pill`, `.header-actions`, `.guides-launch`, `.pager-launch`, `.home-button`, `details.profile-menu`, `.profile-dropdown`
- **DOM IDs**: `locationPillBtn`, `locationLabel`, `profileMenu`, `profileAvatar`, `profileHeading`, `profileSub`, `authSignInLink`, `authSignOutBtn`, `rxSupportUnreadBadge`
- **Definition Files**: `public/index.html`, `public/app.js`, `public/role-experience.js`, `public/theme.css`, `public/layout-polish.css`, `public/color-calm.css`, `public/role-experience.css`
- **Definition Symbols**: `showScreen`, `openAreaPicker`, `openLocalGuides`, `openPager`, `signOutUser`
- **Observed Existing Variants**: Guest dropdown state vs authenticated role-badged dropdown state; Vendor/Admin dynamically injected menu actions (Owner workspace, Admin Portal link, Support & feedback item with unread badge)
- **Observed Existing States**: Collapsed vs open &lt;details#profileMenu&gt;; Manual town vs whole-county vs live geolocation label in #locationPillBtn; Unread support count badge (#rxSupportUnreadBadge)
- **Related Feature Keys**: `authentication_and_sessions`, `local_guides_passport`, `pickup_pager_creation`, `community_hub`
- **Source & Handbook Records**: [index.html](../../../public/index.html), [FRONTEND-MAP.md](../FRONTEND-MAP.md), [FRONTEND-INVENTORY.md](../generated/FRONTEND-INVENTORY.md)
- **Unresolved References & Known Cascade/DOM Caveats**: .brand button triggers showScreen("owner") with aria-label="BiteShark owner mode" rather than returning to Discover, while .home-button navigates to Discover. | --header height custom property is redefined across theme.css, layout-polish.css, and mobile-scroll-fix.css.

### <a id="cmp-nav-bottom-bar"></a>`CMP-NAV-BOTTOM-BAR` — Mobile Bottom Navigation Bar (.bottom-nav)

- **Design Questionnaire**: [Navigation, Wayfinding & Role Switching (`navigation.md`)](navigation.md#cmp-nav-bottom-bar)
- **Applicability**: `applicable` · **Evidence Level**: `confirmed_static`
- **Screens / Surfaces**: `public/index.html (mobile viewport @media max-width: 749px)`
- **User Roles**: `Anonymous Visitor`, `Customer`, `Vendor Staff`, `Vendor Owner`, `Admin: Mod`, `Admin: Top`
- **Selectors**: `.bottom-nav`, `.bottom-nav button`, `.bottom-nav button.active`, `.bottom-nav .book-nav`, `.bottom-nav .guide-nav`, `.bottom-nav .surprise-nav`
- **DOM IDs**: *(dynamic or none)*
- **Definition Files**: `public/index.html`, `public/app.js`, `public/coffee-club.js`, `public/theme.css`, `public/layout-polish.css`, `public/mobile-scroll-fix.css`, `public/color-calm.css`
- **Definition Symbols**: `showScreen`, `openBooking`, `openLocalGuides`, `surpriseMe`, `paintFlavorIcons`
- **Observed Existing Variants**: 6-slot bar mixing screen switches (Discover, Saved, Guides, Bookings), modal launcher (Book), and randomizer action (Surprise)
- **Observed Existing States**: Active screen tab (.active); Feature-hidden slot when gated feature is disabled
- **Related Feature Keys**: `public_vendor_discovery`, `event_inquiries`, `local_guides_passport`
- **Source & Handbook Records**: [index.html](../../../public/index.html), [coffee-club.js](../../../public/coffee-club.js), [FRONTEND-MAP.md](../FRONTEND-MAP.md)
- **Unresolved References & Known Cascade/DOM Caveats**: Styled across 7 stylesheets; coffee-club.js#paintFlavorIcons replaces static emoji spans with inline SVG doodles at runtime.

### <a id="cmp-nav-tabs-switches"></a>`CMP-NAV-TABS-SWITCHES` — Segmented Mode Switches, ARIA Tablists & Queue Sub-Tabs

- **Design Questionnaire**: [Navigation, Wayfinding & Role Switching (`navigation.md`)](navigation.md#cmp-nav-tabs-switches)
- **Applicability**: `applicable` · **Evidence Level**: `confirmed_static`
- **Screens / Surfaces**: `#discoverScreen`, `#guidesScreen`, `#smartScreen`, `#ownerScreen`, `#supportIssuesModal`, `public/login.html`, `public/admin.html`
- **User Roles**: `Anonymous Visitor`, `Customer`, `Vendor Staff`, `Vendor Owner`, `Admin: Mod`, `Admin: Top`
- **Selectors**: `.mode-switch`, `.guides-tabs [role="tab"]`, `.smart-tabs [role="tab"]`, `.request-tabs .req-tab`, `.rx-tabs .rx-tab`, `.mode-tabs .mode-tab`, `.sub-tabs [data-acct-tab]`, `[data-iss-queue]`, `[data-mod-queue]`
- **DOM IDs**: `mapMode`, `listMode`, `guideTabPassport`, `guideTabStories`, `guideTabPhotos`, `issuesQueueTabs`
- **Definition Files**: `public/index.html`, `public/login.html`, `public/admin.html`, `public/app.js`, `public/local-guides.js`, `public/smart.js`, `public/role-experience.js`, `public/admin.js`
- **Definition Symbols**: `setMode`, `showGuidesTab`, `openSmart`, `setOwnerRequestFilter`
- **Observed Existing Variants**: Pill segmented toggle (.mode-switch Map/List; login.html Sign in/Create account .mode-tabs); Horizontal ARIA tablist (.guides-tabs, .smart-tabs, .request-tabs, .rx-tabs); Admin queue/subfilter tabs (#issuesQueueTabs, [data-acct-tab], [data-mod-queue])
- **Observed Existing States**: Selected (aria-selected="true" or aria-pressed="true" + .active); Unselected (tabindex="-1" on guides tabs; default tabindex on others); Feature-hidden tab (when editorial_stories, visit_journal, or private_photos is disabled)
- **Related Feature Keys**: `interactive_map`, `visit_journal`, `editorial_stories`, `private_photos`, `suggested_trails`, `flavor_lab_tools`
- **Source & Handbook Records**: [index.html](../../../public/index.html), [login.html](../../../public/login.html), [admin.html](../../../public/admin.html), [ACCESSIBILITY.md](../ACCESSIBILITY.md)
- **Unresolved References & Known Cascade/DOM Caveats**: Tab keyboard roving tabindex is implemented on #guidesScreen tabs but inconsistent across other tablists and segmented groups.

### <a id="cmp-nav-role-banner"></a>`CMP-NAV-ROLE-BANNER` — Viewpoint Preview Banner, Act-on-Behalf Strip & Admin Sidebar Shell

- **Design Questionnaire**: [Navigation, Wayfinding & Role Switching (`navigation.md`)](navigation.md#cmp-nav-role-banner)
- **Applicability**: `applicable` · **Evidence Level**: `confirmed_static`
- **Screens / Surfaces**: `public/index.html (when preview/AOB active)`, `public/admin.html`, `public/policies/*.html`
- **User Roles**: `Vendor Staff`, `Vendor Owner`, `Admin: Mod`, `Admin: Top`
- **Selectors**: `#rxRoleBanner`, `.vp-banner-actions`, `.vp-banner-btn`, `#adminShell`, `.admin-sidebar`, `.admin-nav [data-section]`, `.policy-header`, `.policy-nav`
- **DOM IDs**: `adminShell`, `adminRoleBadge`, `vpCustomerPreviewBtn`, `vpVendorSelect`, `vpVendorPreviewBtn`, `vpActOnBehalfBtn`, `vpExitBtn`, `vpEndSupportBtn`
- **Definition Files**: `public/role-experience.js`, `public/role-experience.css`, `public/admin.html`, `public/admin.js`, `public/admin.css`, `public/policies/index.html`, `public/policies/policies.css`
- **Definition Symbols**: `applyViewpointState`, `switchAdminSection`
- **Observed Existing Variants**: Read-only Customer/Vendor viewpoint preview banner; Audited Act-on-Behalf active session banner (Admin: Top only); Admin Portal left navigation rail with count badges (#badgeApplications .. #badgeDiagnostics); Policy Hub sticky top navigation bar (.policy-header)
- **Observed Existing States**: Hidden (normal customer session); Preview active; Act-on-Behalf active; Active admin section
- **Related Feature Keys**: `rbac_csrf_rls_and_audit`, `top_admin_recovery_and_health`
- **Source & Handbook Records**: [admin.html](../../../public/admin.html), [role-experience.js](../../../public/role-experience.js), [AUTH-AND-PERMISSIONS.md](../AUTH-AND-PERMISSIONS.md)
- **Unresolved References & Known Cascade/DOM Caveats**: None flagged.

### <a id="cmp-form-controls"></a>`CMP-FORM-CONTROLS` — Standard Form Fields, Search Inputs, Selects, Toggles & Package Radios

- **Design Questionnaire**: [Forms, Inputs & Validation (`forms-and-inputs.md`)](forms-and-inputs.md#cmp-form-controls)
- **Applicability**: `applicable` · **Evidence Level**: `confirmed_static`
- **Screens / Surfaces**: `#discoverScreen`, `#communityScreen`, `#guidesScreen`, `#smartScreen`, `#favoritesScreen`, `#ownerScreen`, `#vendorIntroScreen`, `#bookingModal`, `#ownerProfileModal`, `#distanceModal`, `#rxModalsRoot`, `public/admin.html`
- **User Roles**: `Anonymous Visitor`, `Customer`, `Vendor Staff`, `Vendor Owner`, `Admin: Mod`, `Admin: Top`
- **Selectors**: `label.search`, `.form-row`, `.rx-form`, `.admin-form`, `.switch-row`, `.alerts-toggle`, `.package-picker`, `.package-option`, `input[type="range"]#distanceRange`
- **DOM IDs**: `searchInput`, `communityPostForm`, `bookingTruck`, `eventDate`, `guestCount`, `ownerScheduleDate`, `ownerOpensAt`, `ownerClosesAt`, `ownerIsOpen`, `nearbyAlertToggle`, `distanceRange`, `visitSpotSearch`, `guideSpotSelect`, `viListingSearch`, `viListingSelect`
- **Definition Files**: `public/index.html`, `public/admin.html`, `public/theme.css`, `public/color-calm.css`, `public/role-experience.css`, `public/admin.css`
- **Definition Symbols**: `applyFilters`, `validateBookingChoice`, `checkBookingAvailability`, `saveNotificationSettings`
- **Observed Existing Variants**: Pill search bar with leading icon (label.search); Stacked label wrapping &lt;input&gt;, &lt;select&gt;, or &lt;textarea&gt;; Paired search-filter input + &lt;select&gt; searchable spot selector (#visitSpotSearch + #guideSpotSelect, #viListingSearch + #viListingSelect); Checkbox switch row (.switch-row, .alerts-toggle); Bordered radio card fieldset (.package-picker .package-option); Range slider with live readout (#distanceRange + #rangeValue); Compact multi-field admin filter bar (.filter-bar)
- **Observed Existing States**: Resting; Focused; Invalid/error; Readonly (#pagerVendor); Disabled/paused
- **Related Feature Keys**: `public_vendor_discovery`, `event_inquiries`, `community_submissions`, `visit_journal`, `nearby_alert_preferences`
- **Source & Handbook Records**: [index.html](../../../public/index.html), [admin.html](../../../public/admin.html), [FRONTEND-MAP.md](../FRONTEND-MAP.md), [ACCESSIBILITY.md](../ACCESSIBILITY.md)
- **Unresolved References & Known Cascade/DOM Caveats**: Mixes implicit &lt;label&gt;text&lt;input&gt;&lt;/label&gt; wrapping with explicit for/id pairing across forms; required fields use asterisks on some forms and native required attributes without markers on others.

### <a id="cmp-form-upload-otp"></a>`CMP-FORM-UPLOAD-OTP` — File Upload Controls, 14+ DOB Fieldset & Email OTP Sign-In Card

- **Design Questionnaire**: [Forms, Inputs & Validation (`forms-and-inputs.md`)](forms-and-inputs.md#cmp-form-upload-otp)
- **Applicability**: `applicable` · **Evidence Level**: `confirmed_static`
- **Screens / Surfaces**: `public/login.html`, `#guidesScreen (Private photos tab)`, `#ownerScreen (Menu photos device preview)`, `#vendorApplyModal`, `#rxAgeAssessmentModal`
- **User Roles**: `Anonymous Visitor`, `Customer`, `Vendor Owner`, `Admin: Mod`, `Admin: Top`
- **Selectors**: `.login-card`, `.dob-fieldset`, `.dob-grid`, `input.code`, `.guide-photo-form input[type="file"]`, `.photo-upload-progress`, `.upload-tile`, `#vaEvidenceFile`
- **DOM IDs**: `dishPhotoFile`, `dishPhotoProgress`, `vaEvidenceFile`, `rxAgeAssessmentModal`
- **Definition Files**: `public/login.html`, `public/auth-client.js`, `public/local-guides.js`, `public/role-experience.js`, `public/app.js`
- **Definition Symbols**: `saveDishPhoto`, `previewOwnerPhotos`
- **Observed Existing Variants**: Centered standalone auth card (.login-card) with Sign in / Create account tabs and 6-digit OTP input (.code); 3-part Month/Day/Year 14+ age-eligibility fieldset (.dob-fieldset in login.html and #rxAgeAssessmentModal); Validated private photo file input + &lt;progress#dishPhotoProgress&gt; (JPEG/PNG/WebP &lt;= 5 MB); Optional PDF/image ownership evidence upload (#vaEvidenceFile); Tab-local device-only photo preview tile (.upload-tile on #ownerScreen)
- **Observed Existing States**: Email entry -&gt; OTP sent cooldown -&gt; verifying -&gt; success redirect; Under-14 neutral restriction cooldown state; Upload progress bar active; Deferred passkey notice (.passkey-note)
- **Related Feature Keys**: `authentication_and_sessions`, `age_eligibility_and_restrictions`, `private_photos`, `vendor_onboarding`, `passkey_webauthn`, `owner_menu_photo_upload`
- **Source & Handbook Records**: [login.html](../../../public/login.html), [AUTH-AND-PERMISSIONS.md](../AUTH-AND-PERMISSIONS.md), [STORAGE-AND-FILES.md](../STORAGE-AND-FILES.md)
- **Unresolved References & Known Cascade/DOM Caveats**: public/login.html loads public/theme.css plus a 260-line inline &lt;style&gt; block without public/color-calm.css, leaving .login-logo on legacy --coral.

### <a id="cmp-btn-actions"></a>`CMP-BTN-ACTIONS` — Action Buttons, Icon Buttons, Link-Buttons & Admin Action Controls

- **Design Questionnaire**: [Buttons, Links & Destructive Actions (`buttons-and-actions.md`)](buttons-and-actions.md#cmp-btn-actions)
- **Applicability**: `applicable` · **Evidence Level**: `confirmed_static`
- **Screens / Surfaces**: `All screens and modals across public/index.html, public/login.html, and public/admin.html`
- **User Roles**: `Anonymous Visitor`, `Customer`, `Vendor Staff`, `Vendor Owner`, `Admin: Mod`, `Admin: Top`
- **Selectors**: `button.primary`, `button.secondary`, `button.ghost`, `button.small`, `.small-btn`, `.danger-btn`, `.danger-link`, `.round-btn`, `.modal-close`, `.rx-close`, `.back-link`, `.detail-link`, `.local-surprise`, `.owner-action`, `.admin-btn`, `.admin-btn-primary`, `.admin-btn-secondary`, `.admin-btn-warn`, `.admin-btn-danger`, `.admin-btn-sm`
- **DOM IDs**: `searchLocateBtn`, `bookingSubmitBtn`, `dishPhotoSave`, `ownerUpdateLocationBtn`, `vaSubmitAppBtn`, `fcConfirmSubmitBtn`
- **Definition Files**: `public/theme.css`, `public/color-calm.css`, `public/guide-passport.css`, `public/role-experience.css`, `public/admin.css`
- **Definition Symbols**: *(declarative HTML/CSS only or unconfirmed)*
- **Observed Existing Variants**: Primary CTA (.primary / .admin-btn-primary); Secondary outlined/soft button (.secondary / .admin-btn-secondary); Subtle/ghost/link-styled buttons (.ghost, .back-link, .detail-link, .vi-link-btn); Destructive actions (.danger-btn, .danger-link, .admin-btn-danger, .decline); Warning/elevated admin button (.admin-btn-warn); Circular icon button (.round-btn, .modal-close, .rx-close); Multi-line descriptive tile button (.owner-action, .welcome-path-btn, .crew-pal)
- **Observed Existing States**: Default; Hover; Active/pressed; Focus-visible; In-flight/submitting; Disabled
- **Related Feature Keys**: *(always-on / not feature-gated)*
- **Source & Handbook Records**: [theme.css](../../../public/theme.css), [color-calm.css](../../../public/color-calm.css), [admin.css](../../../public/admin.css), [UI-AND-CONTENT-GUIDE.md](../UI-AND-CONTENT-GUIDE.md)
- **Unresolved References & Known Cascade/DOM Caveats**: public/theme.css:20 declares .primary, .secondary { width: 100%; min-height: 48px }, requiring repeated width: auto overrides in horizontal button groups. | Button class naming splits between .primary/.secondary/.danger-btn in index.html and .admin-btn-* in admin.html.

### <a id="cmp-card-discovery"></a>`CMP-CARD-DISCOVERY` — Unified Discovery & Saved Listing Card (cardHTML / .truck-card)

- **Design Questionnaire**: [Cards, Listings, Badges, Tables & Pagination (`cards-and-listings.md`)](cards-and-listings.md#cmp-card-discovery)
- **Applicability**: `applicable` · **Evidence Level**: `confirmed_static`
- **Screens / Surfaces**: `#discoverScreen`, `#favoritesScreen`
- **User Roles**: `Anonymous Visitor`, `Customer`, `Vendor Staff`, `Vendor Owner`, `Admin: Mod`, `Admin: Top`
- **Selectors**: `.truck-cards`, `.favorite-grid`, `.truck-card`, `.truck-card.selected-card`, `.truck-photo-img`, `.truck-photo-fallback`, `.truck-photo-medallion`, `.truck-info`, `.truck-card-top`, `.truck-card-title`, `.truck-card-sub`, `.truck-card-status-row`, `.card-status-pill`, `.truck-card-highlight`, `.truck-card-foot`, `.fav-btn`
- **DOM IDs**: `truckCards`, `favoriteGrid`
- **Definition Files**: `public/app.js`, `public/color-calm.css`, `public/theme.css`, `public/neighborhood.css`, `lib/discovery.js`
- **Definition Symbols**: `cardHTML`, `extraCard`, `resolveApprovedVendorImage`, `toggleFav`
- **Observed Existing Variants**: Horizontal card with verified vendor photo (.truck-photo-img) vs restrained category SVG fallback (.truck-photo-fallback); Selected map-synced card (.selected-card); Saved heart state (.saved on favorite toggle)
- **Observed Existing States**: Verified live open vs published open window vs estimated/check-hours status pill; Saved vs unsaved favorite toggle; Selected/highlighted from map marker tap
- **Related Feature Keys**: `public_vendor_discovery`
- **Source & Handbook Records**: [app.js](../../../public/app.js), [color-calm.css](../../../public/color-calm.css), [UI-AND-CONTENT-GUIDE.md](../UI-AND-CONTENT-GUIDE.md), [discovery-catalog.md](../domains/discovery-catalog.md)
- **Unresolved References & Known Cascade/DOM Caveats**: Legacy vertical .truck-card rules remain in theme.css and neighborhood.css and are overridden later in color-calm.css; .truck-card &gt; .truckly-spotlight is hidden by CSS.

### <a id="cmp-card-detail"></a>`CMP-CARD-DETAIL` — Business Detail Sheet, Verified Menu Highlights & Source Truthfulness Card

- **Design Questionnaire**: [Cards, Listings, Badges, Tables & Pagination (`cards-and-listings.md`)](cards-and-listings.md#cmp-card-detail)
- **Applicability**: `applicable` · **Evidence Level**: `confirmed_static`
- **Screens / Surfaces**: `#detailModal (invoked from Discover, Map, Saved, Guides, Trails, Community)`
- **User Roles**: `Anonymous Visitor`, `Customer`, `Vendor Staff`, `Vendor Owner`, `Admin: Mod`, `Admin: Top`
- **Selectors**: `#detailModal .detail-modal`, `.detail-body`, `.detail-location`, `.detail-tags`, `.truth-card`, `.verified-dot`, `.truckly-spotlight`, `.detail-exploration-actions`, `.source-button`, `.map-link`
- **DOM IDs**: `detailModal`, `detailContent`, `detailDialogTitle`
- **Definition Files**: `public/app.js`, `public/listing-highlights.js`, `public/smart.js`, `public/guide-passport.js`, `public/color-calm.css`
- **Definition Symbols**: `openDetail`, `extraDetail`, `closeModal`
- **Observed Existing Variants**: Verified vendor listing vs unclaimed curated Sonoma directory listing; Bookable food truck (shows Request event inquiry CTA) vs non-bookable market/stand/coffee listing; With vs without verified dish/menu spotlight (.truckly-spotlight)
- **Observed Existing States**: Open dialog; Saved/unsaved favorite; Logged visit action available/paused
- **Related Feature Keys**: `public_vendor_discovery`, `event_inquiries`, `visit_journal`, `suggested_trails`
- **Source & Handbook Records**: [app.js](../../../public/app.js), [listing-highlights.js](../../../public/listing-highlights.js), [FRONTEND-MAP.md](../FRONTEND-MAP.md), [ACCESSIBILITY.md](../ACCESSIBILITY.md)
- **Unresolved References & Known Cascade/DOM Caveats**: openDetail is wrapped sequentially by listing-highlights.js and smart.js, injecting interactive nodes after openAppModal("detailModal") runs initial focus inspection.

### <a id="cmp-chips-badges"></a>`CMP-CHIPS-BADGES` — Filter Chips, Status Pills, Role/Verification Badges & Severity Tags

- **Design Questionnaire**: [Cards, Listings, Badges, Tables & Pagination (`cards-and-listings.md`)](cards-and-listings.md#cmp-chips-badges)
- **Applicability**: `applicable` · **Evidence Level**: `confirmed_static`
- **Screens / Surfaces**: `All screens across public/index.html, public/login.html, public/admin.html, and public/policies/*.html`
- **User Roles**: `Anonymous Visitor`, `Customer`, `Vendor Staff`, `Vendor Owner`, `Admin: Mod`, `Admin: Top`
- **Selectors**: `.filters .chip`, `.map-chip`, `.explore-kinds button`, `.community-filters button`, `.card-status-pill`, `.status-pill`, `.profile-role-pill`, `.rx-badge`, `.photo-count-pill`, `.private-pill`, `.guide-unavailable-pill`, `.pill`, `.pill-ok`, `.pill-warn`, `.pill-danger`, `.pill-info`, `.pill-top`, `.pill-mod`, `.status-tag`
- **DOM IDs**: `filters`, `openNow`, `distanceFilterBtn`, `dishPhotoCountBadge`, `ownerStatusPill`, `adminRoleBadge`
- **Definition Files**: `public/index.html`, `public/color-calm.css`, `public/role-experience.css`, `public/guide-passport.css`, `public/admin.css`, `public/policies/policies.css`
- **Definition Symbols**: `chooseCuisine`, `chooseKind`, `toggleOpen`, `communitySetFilter`
- **Observed Existing Variants**: Interactive toggle filter chips (.chip, .map-chip, [data-community-filter], .area-town-btn); Category tile chips (.explore-kinds button); Non-interactive operational status & privacy pills (.card-status-pill, .private-pill, .guide-unavailable-pill); Role & governance severity pills (.profile-role-pill, .rx-badge, .pill-ok/.pill-warn/.pill-danger/.pill-top/.pill-mod, .status-tag)
- **Observed Existing States**: Unselected; Pressed/active (aria-pressed="true"); Non-interactive informational badge
- **Related Feature Keys**: `public_vendor_discovery`, `community_hub`
- **Source & Handbook Records**: [index.html](../../../public/index.html), [admin.css](../../../public/admin.css), [UI-AND-CONTENT-GUIDE.md](../UI-AND-CONTENT-GUIDE.md)
- **Unresolved References & Known Cascade/DOM Caveats**: Interactive filter chips and non-interactive status pills share similar pill geometry across screens; four separate badge class families (.rx-badge, .pill-*, .status-tag, .card-status-pill) exist.

### <a id="cmp-data-tables-pagers"></a>`CMP-DATA-TABLES-PAGERS` — Admin Data Tables, Key-Value Metadata Grids & Pagination Controls

- **Design Questionnaire**: [Cards, Listings, Badges, Tables & Pagination (`cards-and-listings.md`)](cards-and-listings.md#cmp-data-tables-pagers)
- **Applicability**: `applicable` · **Evidence Level**: `confirmed_static`
- **Screens / Surfaces**: `public/admin.html (all 8 paginated queues + Feature history)`, `#guidesScreen (Visit journal history)`, `public/policies/*.html`
- **User Roles**: `Customer`, `Admin: Mod`, `Admin: Top`
- **Selectors**: `.admin-table`, `.kv-grid`, `.meta-grid`, `.pager-bar`, `.passport-more-wrap`
- **DOM IDs**: `appsPager`, `vendorsPager`, `invPager`, `acctPager`, `modPager`, `issuesPager`, `auditPager`, `diagPager`, `fcHistoryWrap`, `journalLoadMoreBtn`
- **Definition Files**: `public/admin.html`, `public/admin.js`, `public/admin.css`, `public/guide-passport.js`, `public/policies/index.html`, `public/policies/policies.css`
- **Definition Symbols**: `renderPager`
- **Observed Existing Variants**: Tabular admin log/history table (.admin-table in Accounts, Audit, Feature Controls history); Two-column/multi-cell key-value detail summary (.kv-grid in Admin detail panes; .meta-grid in Policy drafts); Prev / Page X of Y / Next offset pager (#*Pager in Admin); Cursor/offset "Load more" incremental button (#journalLoadMoreBtn in Visit journal)
- **Observed Existing States**: Populated; Single-page (disabled Prev/Next); Loading page; Empty table
- **Related Feature Keys**: `rbac_csrf_rls_and_audit`, `visit_journal`
- **Source & Handbook Records**: [admin.html](../../../public/admin.html), [admin.js](../../../public/admin.js), [FRONTEND-INVENTORY.md](../generated/FRONTEND-INVENTORY.md)
- **Unresolved References & Known Cascade/DOM Caveats**: None flagged.

### <a id="cmp-dialog-modal"></a>`CMP-DIALOG-MODAL` — Modal Dialogs & Governance Confirmation Modals

- **Design Questionnaire**: [Dialogs, Sheets, Popovers & Disclosures (`dialogs-and-overlays.md`)](dialogs-and-overlays.md#cmp-dialog-modal)
- **Applicability**: `applicable` · **Evidence Level**: `confirmed_static`
- **Screens / Surfaces**: `public/index.html`, `public/admin.html`
- **User Roles**: `Anonymous Visitor`, `Customer`, `Vendor Staff`, `Vendor Owner`, `Admin: Mod`, `Admin: Top`
- **Selectors**: `.modal-backdrop`, `.detail-modal`, `.booking-modal`, `.distance-modal`, `.area-modal`, `.private-photo-modal`, `.rx-modal-backdrop`, `.rx-modal`, `.admin-modal-backdrop`, `.admin-modal`
- **DOM IDs**: `detailModal`, `bookingModal`, `ownerProfileModal`, `distanceModal`, `areaModal`, `vendorApplyModal`, `supportIssuesModal`, `communityReportModal`, `inviteAcceptModal`, `rxAgeAssessmentModal`, `rxExplorationPrivacyModal`, `aobModal`, `featureConfirmModal`, `invActionModal`, `invHistoryModal`
- **Definition Files**: `public/diagnostics-client.js`, `public/app.js`, `public/role-experience.js`, `public/local-guides.js`, `public/admin.js`, `public/theme.css`, `public/role-experience.css`, `public/admin.css`
- **Definition Symbols**: `openModalDialog`, `closeModalDialog`, `openAppModal`, `closeAppModal`, `rxOpenModal`, `rxCloseModal`, `adminOpenModal`, `adminCloseModal`
- **Observed Existing Variants**: Content/detail sheet modal (#detailModal, .private-photo-modal); Structured form modal (#bookingModal, #ownerProfileModal, #vendorApplyModal, #supportIssuesModal, #communityReportModal); Compact picker/filter modal (#distanceModal, #areaModal); Blocking eligibility/invitation modal (#rxAgeAssessmentModal, #inviteAcceptModal); Reason-required administrative confirmation modal (#aobModal, #featureConfirmModal, #invActionModal)
- **Observed Existing States**: Closed (hidden / without .show); Open with background inert + focus trap; Submitting
- **Related Feature Keys**: `event_inquiries`, `vendor_onboarding`, `community_hub`, `age_eligibility_and_restrictions`, `private_photos`
- **Source & Handbook Records**: [diagnostics-client.js](../../../public/diagnostics-client.js), [FRONTEND-MAP.md](../FRONTEND-MAP.md), [ACCESSIBILITY.md](../ACCESSIBILITY.md)
- **Unresolved References & Known Cascade/DOM Caveats**: .modal-backdrop (z-index: 2000) stacks above .rx-modal-backdrop (z-index: 1400). | Several dialogs (#rxAgeAssessmentModal, #inviteAcceptModal, #invActionModal, #invHistoryModal, #featureConfirmModal) toggle .hidden directly instead of calling openModalDialog.

### <a id="cmp-drawer-disclosure"></a>`CMP-DRAWER-DISCLOSURE` — Discovery Sheet (#truckSheet), Inline &lt;details&gt; Disclosures & Dropdown Popovers

- **Design Questionnaire**: [Dialogs, Sheets, Popovers & Disclosures (`dialogs-and-overlays.md`)](dialogs-and-overlays.md#cmp-drawer-disclosure)
- **Applicability**: `applicable` · **Evidence Level**: `confirmed_static`
- **Screens / Surfaces**: `#discoverScreen`, `#communityScreen`, `#pagerScreen`, `#guidesScreen`, `#smartScreen`, `.topbar`
- **User Roles**: `Anonymous Visitor`, `Customer`, `Vendor Staff`, `Vendor Owner`, `Admin: Mod`, `Admin: Top`
- **Selectors**: `aside.truck-sheet`, `details.extra-filters`, `details.discover-extras`, `details.community-extra-ideas`, `details.pager-real-entry`, `details.profile-menu .profile-dropdown`, `.guide-confirm-box`
- **DOM IDs**: `truckSheet`, `extraFilters`, `discoverExtras`, `pagerRealEntry`, `profileMenu`
- **Definition Files**: `public/index.html`, `public/theme.css`, `public/mobile-scroll-fix.css`, `public/color-calm.css`, `public/guide-passport.css`
- **Definition Symbols**: *(declarative HTML/CSS only or unconfirmed)*
- **Observed Existing Variants**: Split-pane / mobile sheet listing container (aside#truckSheet alongside #map); Native &lt;details&gt;/&lt;summary&gt; progressive disclosure accordions (#extraFilters, #discoverExtras, .community-extra-ideas, #pagerRealEntry); Anchored header dropdown popover (details#profileMenu &gt; .profile-dropdown); Inline destructive confirmation box (.guide-confirm-box)
- **Observed Existing States**: Collapsed; Expanded ([open]); Map-mode docked vs List-mode full-flow (#truckSheet)
- **Related Feature Keys**: `public_vendor_discovery`, `interactive_map`
- **Source & Handbook Records**: [index.html](../../../public/index.html), [mobile-scroll-fix.css](../../../public/mobile-scroll-fix.css), [FRONTEND-MAP.md](../FRONTEND-MAP.md)
- **Unresolved References & Known Cascade/DOM Caveats**: details#profileMenu closes via inline this.closest("details").open=false on item click rather than centralized outside-click/Escape dismissal.

### <a id="cmp-feedback-notices"></a>`CMP-FEEDBACK-NOTICES` — Toasts, Callout Banners, Feature-Paused Notices, Loading & Empty/Offline States

- **Design Questionnaire**: [Feedback, Banners, Loading & Recovery States (`feedback-and-status.md`)](feedback-and-status.md#cmp-feedback-notices)
- **Applicability**: `applicable` · **Evidence Level**: `confirmed_static`
- **Screens / Surfaces**: `All screens and modals across index.html, login.html, admin.html, and policies/*.html`
- **User Roles**: `Anonymous Visitor`, `Customer`, `Vendor Staff`, `Vendor Owner`, `Admin: Mod`, `Admin: Top`
- **Selectors**: `#toast.toast`, `.bs-feedback-banner`, `.hours-note`, `.coarse-area-banner`, `.owner-banner`, `.form-error`, `.error-banner`, `.status-banner`, `.staging-mode-banner`, `.invite-context-banner`, `.loading-state`, `.guide-loading-state`, `.state-box`, `.state-error`, `.community-empty`, `.dish-empty`, `.passport-empty`, `.draft-banner`, `.conflict-callout`, `.policy-callout`, `.diag-callout`
- **DOM IDs**: `toast`, `coarseAreaBanner`, `openHoursNote`, `catalogOfflineNote`, `mapEmpty`, `favoritesFeedback`, `bookingsFeedback`, `ownerModeBanner`, `ownerFeedback`, `viOnboardingPausedNotice`, `adminLaunchReminderBanner`, `adminGlobalBanner`, `fcLiveError`
- **Definition Files**: `public/index.html`, `public/login.html`, `public/admin.html`, `public/app.js`, `public/role-experience.js`, `public/theme.css`, `public/color-calm.css`, `public/role-experience.css`, `public/admin.css`, `public/policies/policies.css`
- **Definition Symbols**: `toast`
- **Observed Existing Variants**: Floating bottom/top ephemeral toast (#toast); Contextual inline notice / warning / offline banner (.bs-feedback-banner, .hours-note, .owner-banner); Authentication / staging / invite banners (.staging-mode-banner, .invite-context-banner, #bookingAuthNotice); Admin governance callouts (#adminLaunchReminderBanner, .conflict-callout, .policy-callout, .diag-callout); Loading & empty placeholders (.loading-state, .guide-loading-state, .state-box, .community-empty, .dish-empty)
- **Observed Existing States**: Hidden; Informational; Success; Warning / Feature-paused (503); Error / Destructive; Loading
- **Related Feature Keys**: `public_vendor_discovery`, `rbac_csrf_rls_and_audit`
- **Source & Handbook Records**: [index.html](../../../public/index.html), [DIAGNOSTICS-AND-ERRORS.md](../DIAGNOSTICS-AND-ERRORS.md), [FEATURE-CONTROLS.md](../FEATURE-CONTROLS.md), [ACCESSIBILITY.md](../ACCESSIBILITY.md)
- **Unresolved References & Known Cascade/DOM Caveats**: Over 12 distinct banner/callout CSS classes exist across index.html, login.html, admin.html, and policies/*.html without a unified semantic banner component.

### <a id="cmp-media-visuals"></a>`CMP-MEDIA-VISUALS` — Vendor Thumbnails, Category SVG Fallbacks, Editorial Artwork, Mascots & Doodles

- **Design Questionnaire**: [Imagery, Fallbacks, Illustrations & Icons (`imagery-and-icons.md`)](imagery-and-icons.md#cmp-media-visuals)
- **Applicability**: `applicable` · **Evidence Level**: `confirmed_static`
- **Screens / Surfaces**: `#discoverScreen`, `#guidesScreen`, `#detailModal`, `#ownerScreen`
- **User Roles**: `Anonymous Visitor`, `Customer`, `Vendor Staff`, `Vendor Owner`, `Admin: Mod`, `Admin: Top`
- **Selectors**: `.truck-photo-img`, `.truck-photo-fallback`, `.card-fallback-svg`, `.guide-story-media`, `.guide-story-photo`, `.dish-photo`, `.dish-photo-thumb-btn`, `[data-truck-character]`, `[data-doodle]`, `.character-hero`, `.flavor-crew .crew-pal`
- **DOM IDs**: `characterHeroSlogan`, `dishPhotoGrid`, `ownerPhotoGrid`
- **Definition Files**: `public/app.js`, `public/local-guides.js`, `public/characters.js`, `public/coffee-club.js`, `public/characters.css`, `public/coffee-club.css`, `public/local-guides.css`, `public/color-calm.css`
- **Definition Symbols**: `resolveApprovedVendorImage`, `updateFlavorCharacters`, `paintFlavorIcons`, `flavorDoodle`
- **Observed Existing Variants**: Rights-verified business photograph (.truck-photo-img when photo_rights_verified is true); Restrained cuisine/category badge SVG fallback (.truck-photo-fallback when unverified); Labeled editorial story SVG/artwork frame (.guide-story-media + .guide-badge-editorial); Private authenticated customer photo derivative thumbnail & modal preview (.dish-photo); Illustrated mascot characters (Tito, Sprout, Scoop, Brew via [data-truck-character]) and runtime SVG nav doodles ([data-doodle])
- **Observed Existing States**: Loaded media; Category fallback; Loading derivative; Broken-image fallback
- **Related Feature Keys**: `public_vendor_discovery`, `editorial_stories`, `private_photos`, `owner_menu_photo_upload`
- **Source & Handbook Records**: [app.js](../../../public/app.js), [characters.js](../../../public/characters.js), [coffee-club.js](../../../public/coffee-club.js), [UI-AND-CONTENT-GUIDE.md](../UI-AND-CONTENT-GUIDE.md), [photos.md](../domains/photos.md)
- **Unresolved References & Known Cascade/DOM Caveats**: Iconography mixes literal Unicode emojis in HTML, inline stroke SVGs (.home-button), and runtime JS DOM replacement via coffee-club.js#paintFlavorIcons.

### <a id="cmp-map-surface"></a>`CMP-MAP-SURFACE` — Interactive Leaflet Map, Pins, Area/Distance Selectors & Map Fallback Card

- **Design Questionnaire**: [Maps, Markers, Area Selection & Location Confidence (`maps-and-location.md`)](maps-and-location.md#cmp-map-surface)
- **Applicability**: `applicable` · **Evidence Level**: `confirmed_static`
- **Screens / Surfaces**: `#discoverScreen`, `#areaModal`, `#distanceModal`, `#ownerScreen (.mini-map)`
- **User Roles**: `Anonymous Visitor`, `Customer`, `Vendor Staff`, `Vendor Owner`, `Admin: Mod`, `Admin: Top`
- **Selectors**: `.map-wrap`, `#map`, `.truck-pin`, `.truck-pin.selected`, `.user-pin`, `#mapFallback`, `.map-fallback-card`, `.area-town-grid`, `.area-town-btn`, `.mini-map`
- **DOM IDs**: `map`, `mapFallback`, `mapFallbackTitle`, `mapFallbackCopy`, `mapFallbackListBtn`, `mapFallbackRetryBtn`, `mapEmpty`, `coarseAreaBanner`, `areaModal`, `areaUseLocationBtn`, `areaAllSonomaBtn`, `distanceModal`
- **Definition Files**: `public/index.html`, `public/app.js`, `public/theme.css`, `public/color-calm.css`, `lib/map-config.js`, `lib/discovery.js`
- **Definition Symbols**: `setMode`, `locateMe`, `openAreaPicker`, `selectManualArea`, `openDistance`, `setDistance`, `continueInListFromMapFallback`, `retryInteractiveMap`
- **Observed Existing Variants**: Interactive Leaflet tile map with vendor pins (.truck-pin) and user geolocation marker (.user-pin); Graceful List-view fallback card (#mapFallback) when Leaflet/tiles fail or interactive_map is paused/disabled; Sonoma County 8-option town grid selector (#areaModal .area-town-grid); 1-30 mile radius filter dialog (#distanceModal); Decorative parked-status preview card (.mini-map on #ownerScreen)
- **Observed Existing States**: List mode default vs Map mode active; Selected marker synced to #truckSheet / #detailModal; Coarse town-centroid notice (#coarseAreaBanner) vs measured user GPS distance; Zero matching map pins (#mapEmpty); Tile/CDN unavailable (#mapFallback)
- **Related Feature Keys**: `interactive_map`, `public_vendor_discovery`
- **Source & Handbook Records**: [app.js](../../../public/app.js), [map-config.js](../../../lib/map-config.js), [maps-and-location.md](../domains/maps-and-location.md)
- **Unresolved References & Known Cascade/DOM Caveats**: None flagged.

### <a id="cmp-dom-onboarding"></a>`CMP-DOM-ONBOARDING` — Customer Welcome Screen, Vendor Intro Screen & Vendor Application Flow

- **Design Questionnaire**: [Domain & Specialized Role Interfaces (`domain-components.md`)](domain-components.md#cmp-dom-onboarding)
- **Applicability**: `applicable` · **Evidence Level**: `confirmed_static`
- **Screens / Surfaces**: `#welcomeScreen`, `#vendorIntroScreen`, `#vendorApplyModal`
- **User Roles**: `Anonymous Visitor`, `Customer`, `Vendor Owner`
- **Selectors**: `#welcomeScreen .welcome-card`, `.welcome-paths .welcome-path-btn`, `.welcome-remember`, `#vendorIntroScreen .vendor-intro-card`, `.vendor-intro-picker`, `#vendorApplyModal`
- **DOM IDs**: `welcomeScreen`, `welcomeCustomerBtn`, `welcomeVendorBtn`, `welcomeRememberChoice`, `welcomeJustBrowseBtn`, `vendorIntroScreen`, `viCapabilitiesList`, `viListingSearch`, `viListingSelect`, `viClaimBusinessBtn`, `viAddBusinessBtn`, `vendorApplyModal`, `vaStatusPane`, `vaFormPane`
- **Definition Files**: `public/index.html`, `public/role-experience.js`, `public/role-experience.css`
- **Definition Symbols**: `window.bitesharkWelcome`
- **Observed Existing Variants**: Two-path first-visit welcome chooser (#welcomeScreen with optional 90-day bs_start_pref cookie checkbox); Vendor capability overview & directory claim lookup (#vendorIntroScreen); Draftable/submittable vendor claim or new-business application modal (#vendorApplyModal with status tracker)
- **Observed Existing States**: Unremembered vs remembered starting preference (#viRememberedBadge); Application draft, submitted pending review, needs_info revision requested, approved, rejected; Vendor onboarding paused (#viOnboardingPausedNotice)
- **Related Feature Keys**: `vendor_onboarding`, `event_inquiries`, `pickup_pager_creation`
- **Source & Handbook Records**: [index.html](../../../public/index.html), [role-experience.js](../../../public/role-experience.js), [customer-onboarding.md](../domains/customer-onboarding.md), [vendor-onboarding-and-admin.md](../domains/vendor-onboarding-and-admin.md)
- **Unresolved References & Known Cascade/DOM Caveats**: None flagged.

### <a id="cmp-dom-bookings"></a>`CMP-DOM-BOOKINGS` — Event Catering Inquiry Form, Customer Bookings List & Vendor Request Queue

- **Design Questionnaire**: [Domain & Specialized Role Interfaces (`domain-components.md`)](domain-components.md#cmp-dom-bookings)
- **Applicability**: `applicable` · **Evidence Level**: `confirmed_static`
- **Screens / Surfaces**: `#bookingModal`, `#bookingsScreen`, `#ownerScreen`
- **User Roles**: `Anonymous Visitor`, `Customer`, `Vendor Staff`, `Vendor Owner`, `Admin: Mod`, `Admin: Top`
- **Selectors**: `#bookingModal .booking-modal`, `.package-picker`, `#bookingsScreen .booking-list`, `.booking-item`, `.date-box`, `.booking-status`, `#ownerRequests .request-row`, `.request-actions`
- **DOM IDs**: `bookingModal`, `bookingsScreen`, `bookingList`, `bookingsFeedback`, `ownerRequests`, `ownerRequestCount`, `statTotalRequests`, `statPendingRequests`, `statAcceptedRequests`
- **Definition Files**: `public/index.html`, `public/app.js`, `public/theme.css`, `public/color-calm.css`
- **Definition Symbols**: `openBooking`, `submitBooking`, `checkBookingAvailability`, `validateBookingChoice`, `setOwnerRequestFilter`
- **Observed Existing Variants**: Customer inquiry composer (#bookingModal with 3 preset packages, date availability check, guest count 10-250); Customer submitted inquiry cards (.booking-item on #bookingsScreen); Vendor opportunity queue row (.request-row with Accept / Decline actions on #ownerScreen)
- **Observed Existing States**: Unauthenticated sign-in prompt (#bookingAuthNotice); Pending inquiry, accepted inquiry, declined inquiry; Vendor unavailable date warning; Feature paused (#bookingsFeedback)
- **Related Feature Keys**: `event_inquiries`
- **Source & Handbook Records**: [index.html](../../../public/index.html), [app.js](../../../public/app.js), [bookings.md](../domains/bookings.md)
- **Unresolved References & Known Cascade/DOM Caveats**: Preset catering package tiers ($750 / $1,500 / $2,900) are hardcoded in public/index.html rather than vendor-configured.

### <a id="cmp-dom-pager"></a>`CMP-DOM-PAGER` — Digital Pickup Pager, Interactive Sample Demo, Push Panel & Kitchen Queue

- **Design Questionnaire**: [Domain & Specialized Role Interfaces (`domain-components.md`)](domain-components.md#cmp-dom-pager)
- **Applicability**: `applicable` · **Evidence Level**: `confirmed_static`
- **Screens / Surfaces**: `#pagerScreen`, `#ownerScreen (.pager-owner)`
- **User Roles**: `Anonymous Visitor`, `Customer`, `Vendor Staff`, `Vendor Owner`, `Admin: Top`
- **Selectors**: `#pagerScreen .pager-layout`, `.pager-example-hero`, `details.pager-real-entry`, `#pagerDisplay.food-pager`, `.pager-roadmap`, `.pager-demo-workbench`, `.pager-push-box`, `.pager-owner`, `.kitchen-ticket`
- **DOM IDs**: `pagerScreen`, `pagerRealEntry`, `pagerCode`, `pagerDisplay`, `pagerMessage`, `pagerLiveStatus`, `pagerPushPanel`, `kitchenPanel`, `pagerCreateForm`, `kitchenQueue`
- **Definition Files**: `public/index.html`, `public/pager.js`, `public/pager.css`, `public/pager-experience.css`
- **Definition Symbols**: `openPager`, `startPagerDemo`, `joinPager`, `createPager`, `loadKitchen`
- **Observed Existing Variants**: Interactive pretend-order sandbox (.pager-example-hero + .pager-demo-workbench); Live token-joined customer pickup tracker (#pagerDisplay states: idle, received, cooking, ready, completed); Optional Web Push notification opt-in panel (#pagerPushPanel when push flags enabled); Vendor kitchen ticket creator & status advancement queue (#kitchenPanel / .kitchen-ticket)
- **Observed Existing States**: Idle preview; Demo active; Live polling (8s interval) — Waiting / Cooking / Ready celebration / Picked up; Expired or invalid token; Push unsupported / denied / subscribed
- **Related Feature Keys**: `pickup_pager_creation`, `pickup_pager_demo`, `pager_push_delivery`, `pager_push_subscriptions`
- **Source & Handbook Records**: [pager.js](../../../public/pager.js), [pager-and-notifications.md](../domains/pager-and-notifications.md)
- **Unresolved References & Known Cascade/DOM Caveats**: None flagged.

### <a id="cmp-dom-community"></a>`CMP-DOM-COMMUNITY` — Community Hub Posts, 1-5 Star Reviews, Street Whispers & Moderation Queue

- **Design Questionnaire**: [Domain & Specialized Role Interfaces (`domain-components.md`)](domain-components.md#cmp-dom-community)
- **Applicability**: `applicable` · **Evidence Level**: `confirmed_static`
- **Screens / Surfaces**: `#communityScreen`, `#ownerScreen (#ownerModerationCard)`, `#communityReportModal`
- **User Roles**: `Anonymous Visitor`, `Customer`, `Vendor Owner`, `Admin: Mod`, `Admin: Top`
- **Selectors**: `#communityScreen`, `.community-shortcuts`, `#communityCompose`, `.community-post`, `.community-stars`, `.community-report-btn`, `.street-section`, `.street-game`, `.street-file-row`, `#communityReportModal`, `#communityModeration .community-queue-item`
- **DOM IDs**: `communityScreen`, `communityCompose`, `communityPostForm`, `communityKind`, `communityRatingRow`, `communityRating`, `communityMyPosts`, `communityFeed`, `streetQuiz`, `streetFiles`, `communityReportModal`, `communityModeration`
- **Definition Files**: `public/index.html`, `public/community.js`, `public/street-whispers.js`, `public/role-experience.js`, `public/community.css`, `public/street-whispers.css`
- **Definition Symbols**: `openCommunity`, `communityStartPost`, `communitySubmitPost`, `communityRender`, `communityOpenModeration`, `streetMysteryPick`, `streetNextMission`, `window.bitesharkOpenCommunityReport`
- **Observed Existing Variants**: Moderated review card with 1-5 contributor stars (.community-stars), local tip card, neighborhood question card, and labeled unverified food whisper card; Author-only "My contributions" status view (#communityMyPosts showing pending/approved/rejected); Street Whispers interactive clue quiz (#streetQuiz), mystery roulette, side-quest mission, and sourced food files (#streetFiles); Community post report dialog (#communityReportModal)
- **Observed Existing States**: Browse approved feed; Compose drawer open; Held for pre-publication moderation; Flagged/reported; Submissions paused
- **Related Feature Keys**: `community_hub`, `community_submissions`, `street_whispers`
- **Source & Handbook Records**: [community.js](../../../public/community.js), [street-whispers.js](../../../public/street-whispers.js), [community-and-moderation.md](../domains/community-and-moderation.md)
- **Unresolved References & Known Cascade/DOM Caveats**: Contributor 1-5 star ratings exist only on individual #communityScreen review posts (disclosed as contributor opinion), never aggregated onto .truck-card discovery listings.

### <a id="cmp-dom-exploration"></a>`CMP-DOM-EXPLORATION` — Visit Journal, Food Passport Badges/Challenges, Editorial Stories, Private Photos & Suggested Trails

- **Design Questionnaire**: [Domain & Specialized Role Interfaces (`domain-components.md`)](domain-components.md#cmp-dom-exploration)
- **Applicability**: `applicable` · **Evidence Level**: `confirmed_static`
- **Screens / Surfaces**: `#guidesScreen`, `#smartScreen`, `#discoverScreen (trails bar & stories strip)`, `#rxExplorationPrivacyModal`
- **User Roles**: `Anonymous Visitor`, `Customer`, `Vendor Staff`, `Vendor Owner`, `Admin: Mod`, `Admin: Top`
- **Selectors**: `#guidesScreen`, `.passport-summary-bar`, `.passport-badges .passport-badge`, `.passport-challenges`, `.passport-visits .passport-visit-item`, `.passport-legacy-banner`, `#guideStoryGrid .guide-story`, `#discoverStoriesStrip`, `#dishPhotoGrid .dish-photo`, `#smartScreen .smart-panel`, `.trail-stops-list .trail-stop-card`, `.saved-trails-grid .saved-trail-card`, `#rxExplorationPrivacyModal`
- **DOM IDs**: `guidesScreen`, `guidePassport`, `guideStoryGrid`, `guidePhotoSection`, `dishPhotoGrid`, `smartScreen`, `smartBody`, `discoverSuggestedTrailsBar`, `discoverStoriesStrip`, `rxExplorationPrivacyModal`
- **Definition Files**: `public/index.html`, `public/exploration-client.js`, `public/guide-passport.js`, `public/local-guides.js`, `public/smart.js`, `public/role-experience.js`, `public/guide-passport.css`, `public/local-guides.css`, `public/smart.css`
- **Definition Symbols**: `showGuidesTab`, `saveDishPhoto`, `openSmart`, `window.openExplorationPrivacyModal`, `window.bitesharkExploration`
- **Observed Existing Variants**: Private account Visit journal logger + chronological visit history with private notes (.passport-visit-item); Points/level summary bar, unlocked/locked achievement badges (.passport-badge), and weekly challenge progress card (.passport-challenges); One-time legacy browser localStorage migration prompt (.passport-legacy-banner); Public curated editorial stories grid (#guideStoryGrid & #discoverStoriesStrip); Private EXIF-stripped customer photo gallery (#dishPhotoGrid, max 12 photos); 2-3 stop Suggested trail generator, preview, and account-saved trail progress cards (.saved-trail-card) + Flavor finder; Exploration privacy disclosure & JSON account export modal (#rxExplorationPrivacyModal)
- **Observed Existing States**: Signed-out auth gate (.passport-signin-card / #guidePhotoAuthGate) vs signed-in private state; Badge locked vs unlocked; Saved trail in-progress vs completed (.is-complete) vs unavailable listing stop (.is-unavailable); Individual sub-feature paused or hidden
- **Related Feature Keys**: `local_guides_passport`, `editorial_stories`, `visit_journal`, `private_photos`, `exploration_badges`, `weekly_challenges`, `suggested_trails`, `flavor_lab_tools`
- **Source & Handbook Records**: [guide-passport.js](../../../public/guide-passport.js), [local-guides.js](../../../public/local-guides.js), [smart.js](../../../public/smart.js), [visits-and-passport.md](../domains/visits-and-passport.md), [local-guides-and-stories.md](../domains/local-guides-and-stories.md), [photos.md](../domains/photos.md), [badges-points-and-challenges.md](../domains/badges-points-and-challenges.md), [suggested-trails.md](../domains/suggested-trails.md)
- **Unresolved References & Known Cascade/DOM Caveats**: None flagged.

### <a id="cmp-dom-vendor-ops"></a>`CMP-DOM-VENDOR-OPS` — Vendor Owner Workspace (#ownerScreen: Live Spot, Schedule, Marketing Kit & Team Invites)

- **Design Questionnaire**: [Domain & Specialized Role Interfaces (`domain-components.md`)](domain-components.md#cmp-dom-vendor-ops)
- **Applicability**: `applicable` · **Evidence Level**: `confirmed_static`
- **Screens / Surfaces**: `#ownerScreen`, `#ownerProfileModal`
- **User Roles**: `Anonymous Visitor`, `Customer`, `Vendor Staff`, `Vendor Owner`, `Admin: Mod`, `Admin: Top`
- **Selectors**: `#ownerScreen`, `.owner-hero`, `.owner-stats`, `.owner-grid .owner-card`, `.owner-marketing-panel`, `.owner-schedule-list`, `.owner-photo-grid`, `#ownerProfileModal`
- **DOM IDs**: `ownerScreen`, `ownerTruckSelect`, `ownerStatusPill`, `ownerModeBanner`, `ownerMarketingCard`, `ownerMarketingPanel`, `ownerUpdateLocationBtn`, `ownerSaveScheduleBtn`, `ownerScheduleList`, `ownerEditProfileBtn`, `ownerProfileModal`, `ownerTeamList`, `ownerStaffInviteForm`
- **Definition Files**: `public/index.html`, `public/app.js`, `public/smart.js`, `public/role-experience.js`, `public/theme.css`, `public/color-calm.css`, `public/role-experience.css`
- **Definition Symbols**: `selectOwnerTruck`, `updateOwnerLocation`, `saveOwnerSchedule`, `openOwnerProfileModal`, `saveOwnerProfile`, `openOwnerMarketingKit`, `shareOwnerLocation`
- **Observed Existing Variants**: Device-only guest/customer demo preview mode (#ownerModeBanner visible) vs live authorized Vendor Staff / Vendor Owner / Admin Act-on-Behalf mode; Vendor Owner-only Team & Staff Invitations card (#ownerStaffInviteForm) vs Staff-accessible operational cards (live location, schedule, pager, inquiries); Downloadable SVG promo card & social caption generator (#ownerMarketingPanel)
- **Observed Existing States**: Preview mode vs live authorized mode; Multi-listing selector (#ownerTruckSelect); Accepting bookings vs paused bookings; Vendor restricted / suspended state
- **Related Feature Keys**: `vendor_onboarding`, `event_inquiries`, `pickup_pager_creation`, `owner_menu_photo_upload`
- **Source & Handbook Records**: [index.html](../../../public/index.html), [app.js](../../../public/app.js), [role-experience.js](../../../public/role-experience.js), [vendor-onboarding-and-admin.md](../domains/vendor-onboarding-and-admin.md)
- **Unresolved References & Known Cascade/DOM Caveats**: Anonymous visitors clicking the top-left .brand logo land in #ownerScreen preview mode; #ownerModerationCard also sits inside #ownerScreen even though moderation requires Mod/Top Admin authority.

### <a id="cmp-dom-support"></a>`CMP-DOM-SUPPORT` — Support & Feedback Ticket Composer, Ticket Inbox & Timeline Thread

- **Design Questionnaire**: [Domain & Specialized Role Interfaces (`domain-components.md`)](domain-components.md#cmp-dom-support)
- **Applicability**: `applicable` · **Evidence Level**: `confirmed_static`
- **Screens / Surfaces**: `#supportIssuesModal (launched from Account menu, Owner workspace, error banners, or #support hash)`
- **User Roles**: `Anonymous Visitor`, `Customer`, `Vendor Staff`, `Vendor Owner`, `Admin: Mod`, `Admin: Top`
- **Selectors**: `#supportIssuesModal`, `.si-mode-switch`, `.si-kind-pills`, `.si-safety-note`, `.si-context-box`, `.si-ticket-card`, `.si-known-issue-banner`, `.si-timeline`, `.si-tl-item`, `.si-reopen-box`, `.si-ack-card`
- **DOM IDs**: `supportIssuesModal`, `ownerReportProblemBtn`, `ownerShareFeedbackBtn`, `ownerMyTicketsBtn`, `rxSupportUnreadBadge`, `ownerSupportUnreadBadge`
- **Definition Files**: `public/role-experience.js`, `public/role-experience.css`
- **Definition Symbols**: `window.bitesharkOpenSupport`
- **Observed Existing Variants**: Report a problem vs Share feedback mode (.si-mode-switch); Vendor-scoped support context banner (.si-incepted-vendor-banner); Submitted acknowledgment card with BS-XXXXXX reference (.si-ack-card); Authenticated "My tickets" inbox & conversation timeline (.si-ticket-card, .si-timeline) with reopen prompt (.si-reopen-box)
- **Observed Existing States**: Composing (with optional diagnostic correlation context); Submitted acknowledgement; Ticket open / waiting_on_user (unread badge) / in_progress / resolved / closed; Known-issue advisory banner visible
- **Related Feature Keys**: `policy_accessibility_and_privacy_support`
- **Source & Handbook Records**: [role-experience.js](../../../public/role-experience.js), [support-and-feedback.md](../domains/support-and-feedback.md)
- **Unresolved References & Known Cascade/DOM Caveats**: None flagged.

### <a id="cmp-dom-admin-portal"></a>`CMP-DOM-ADMIN-PORTAL` — Two-Tier Admin Portal (Overview, Split-Pane Queues, Feature Controls, Diagnostics & Readiness)

- **Design Questionnaire**: [Domain & Specialized Role Interfaces (`domain-components.md`)](domain-components.md#cmp-dom-admin-portal)
- **Applicability**: `applicable` · **Evidence Level**: `confirmed_static`
- **Screens / Surfaces**: `public/admin.html (/admin)`
- **User Roles**: `Admin: Mod`, `Admin: Top`
- **Selectors**: `#adminShell`, `#overviewCards .kpi-card`, `.split-layout`, `.list-pane .record-card`, `.detail-pane`, `.thread-list .thread-item`, `.note-internal`, `.iss-diag-link-card`, `#featuresList`, `#fcProtectedEssentialsPanel`, `#diagReleaseStrip`, `#readinessSummaryStrip`
- **DOM IDs**: `sec-overview`, `sec-applications`, `sec-vendors`, `sec-accounts`, `sec-moderation`, `sec-issues`, `sec-readiness`, `sec-features`, `sec-audit`, `sec-diagnostics`, `sec-health`, `aobModal`, `featureConfirmModal`, `invActionModal`, `invHistoryModal`
- **Definition Files**: `public/admin.html`, `public/admin.js`, `public/admin.css`
- **Definition Symbols**: `switchAdminSection`, `adminOpenModal`, `adminCloseModal`
- **Observed Existing Variants**: Overview KPI summary grid (#overviewCards) + Mod vs Top authority notice (#overviewRoleNotice); Filterable master-detail split queues (.split-layout in Applications, Vendors, Accounts, Moderation, Support Issues, Readiness, Diagnostics); Admin: Mod recommendation/temporary-restriction controls vs Admin: Top final approval, role assignment, Feature Controls, and Act-on-Behalf controls; Internal team-only notes (.note-internal) vs user-visible support replies (.note-visible) with visibility warning callout (.iss-vis-callout); Protected essential capabilities strip (#fcProtectedEssentialsPanel) vs toggleable Feature Control cards (#featuresList); Diagnostic fingerprint detail pane with correlated support-ticket linking (.iss-diag-link-card)
- **Observed Existing States**: Admin: Mod view (Top-only mutations hidden or read-only); Admin: Top full authority view; Record unselected (.empty-detail) vs selected (.record-card.selected); Overdue SLA / critical blocker / high-severity diagnostic states
- **Related Feature Keys**: `rbac_csrf_rls_and_audit`, `top_admin_recovery_and_health`
- **Source & Handbook Records**: [admin.html](../../../public/admin.html), [admin.js](../../../public/admin.js), [admin.css](../../../public/admin.css), [AUTH-AND-PERMISSIONS.md](../AUTH-AND-PERMISSIONS.md), [FEATURE-CONTROLS.md](../FEATURE-CONTROLS.md), [DIAGNOSTICS-AND-ERRORS.md](../DIAGNOSTICS-AND-ERRORS.md)
- **Unresolved References & Known Cascade/DOM Caveats**: None flagged.

### <a id="cmp-dom-legal-policies"></a>`CMP-DOM-LEGAL-POLICIES` — Preliminary Legal & Policy Pages, Draft Banners & Unresolved Callouts (/policies/*.html)

- **Design Questionnaire**: [Domain & Specialized Role Interfaces (`domain-components.md`)](domain-components.md#cmp-dom-legal-policies)
- **Applicability**: `applicable` · **Evidence Level**: `confirmed_static`
- **Screens / Surfaces**: `public/policies/*.html (8 static zero-JS pages)`, `public/login.html (.policy-draft-footer)`
- **User Roles**: `Anonymous Visitor`, `Customer`, `Vendor Staff`, `Vendor Owner`, `Admin: Mod`, `Admin: Top`
- **Selectors**: `.policy-wrap`, `.draft-banner`, `.status-tag-draft`, `.status-tag-pending`, `.placeholder-token`, `.policy-card`, `.hub-grid .hub-item`, `.unresolved-box`, `.policy-footer`, `.policy-draft-footer`
- **DOM IDs**: `policyMain`
- **Definition Files**: `public/policies/index.html`, `public/policies/terms.html`, `public/policies/privacy.html`, `public/policies/vendor-terms.html`, `public/policies/community-moderation.html`, `public/policies/advertising-sponsored.html`, `public/policies/accessibility.html`, `public/policies/cookies-storage.html`, `public/policies/policies.css`
- **Definition Symbols**: *(declarative HTML/CSS only or unconfirmed)*
- **Observed Existing Variants**: Policy Hub index grid (/policies/index.html .hub-grid); Long-form legal/privacy/accessibility draft document (.policy-card with TOC, tables, and .unresolved-box); Compact login/signup policy draft footer (.policy-draft-footer)
- **Observed Existing States**: Staging Working Draft / Legal Review Pending (static HTML; no JS runtime states)
- **Related Feature Keys**: `policy_accessibility_and_privacy_support`
- **Source & Handbook Records**: [index.html](../../../public/policies/index.html), [policies.css](../../../public/policies/policies.css), [legal-and-readiness.md](../domains/legal-and-readiness.md)
- **Unresolved References & Known Cascade/DOM Caveats**: Static policy pages intentionally run zero client JavaScript; interactive form/loading states apply only if future search, version-diff, or consent UI is introduced.

---

## 3. Unconfirmed Branch-Specific or Future Candidate Components (4)

The items below are **not** active on `working/biteshark-vps` (or are behind disabled/preview-only flags). Their applicability is recorded as `unconfirmed` until Matt and Yaman decide whether to include or mark them `not_applicable`:

### <a id="cmp-unconf-dark-color-scheme"></a>`CMP-UNCONF-DARK-COLOR-SCHEME` — Dark Theme / Automatic prefers-color-scheme Surface Mode (Unconfirmed)

> [!NOTE]
> **Unconfirmed Applicability (`unconfirmed`)**: No dark color scheme or prefers-color-scheme: dark stylesheet exists on working/biteshark-vps. Confirm whether BiteShark will remain single warm-light palette or support a dark mode. *(Not implied as active on `working/biteshark-vps`.)*

- **Design Questionnaire**: [Foundations & Design Tokens (`foundations.md`)](foundations.md#cmp-unconf-dark-color-scheme)
- **Applicability**: `unconfirmed` · **Evidence Level**: `unconfirmed_future_or_branch`
- **Screens / Surfaces**: `Unconfirmed (all surfaces if adopted)`
- **User Roles**: `Anonymous Visitor`, `Customer`, `Vendor Staff`, `Vendor Owner`, `Admin: Mod`, `Admin: Top`
- **Selectors**: *(none — unconfirmed / not present on active branch)*
- **DOM IDs**: *(dynamic or none)*
- **Definition Files**: *(unconfirmed)*
- **Definition Symbols**: *(declarative HTML/CSS only or unconfirmed)*
- **Observed Existing Variants**: *(none observed)*
- **Observed Existing States**: *(none observed)*
- **Related Feature Keys**: *(always-on / not feature-gated)*
- **Source & Handbook Records**: [UI-AND-CONTENT-GUIDE.md](../UI-AND-CONTENT-GUIDE.md)
- **Unresolved References & Known Cascade/DOM Caveats**: Not implemented on working/biteshark-vps.

### <a id="cmp-unconf-miniature-truck-markers"></a>`CMP-UNCONF-MINIATURE-TRUCK-MARKERS` — Illustrated Cuisine SVG Truck Map Markers & Cluster Menus (Branch Candidate)

> [!NOTE]
> **Unconfirmed Applicability (`unconfirmed`)**: Present on secondary staging branch antigravity/staging2-latest (map-cards.js / map-cards.css) but not merged to working/biteshark-vps. Confirm whether illustrated SVG vehicle markers and cluster menus will become standard. *(Not implied as active on `working/biteshark-vps`.)*

- **Design Questionnaire**: [Maps, Markers, Area Selection & Location Confidence (`maps-and-location.md`)](maps-and-location.md#cmp-unconf-miniature-truck-markers)
- **Applicability**: `unconfirmed` · **Evidence Level**: `unconfirmed_future_or_branch`
- **Screens / Surfaces**: `#discoverScreen (Map mode — staging2 candidate only)`
- **User Roles**: `Anonymous Visitor`, `Customer`, `Vendor Staff`, `Vendor Owner`, `Admin: Mod`, `Admin: Top`
- **Selectors**: `.food-cluster-menu`
- **DOM IDs**: *(dynamic or none)*
- **Definition Files**: `public/map-cards.js`, `public/map-cards.css`
- **Definition Symbols**: `window.BiteSharkMapCards`
- **Observed Existing Variants**: Cuisine-illustrated SVG truck marker + multi-vendor cluster popover menu (on staging2 branch only)
- **Observed Existing States**: *(none observed)*
- **Related Feature Keys**: `interactive_map`
- **Source & Handbook Records**: [FRONTEND-MAP.md](../FRONTEND-MAP.md), [UI-AND-CONTENT-GUIDE.md](../UI-AND-CONTENT-GUIDE.md)
- **Unresolved References & Known Cascade/DOM Caveats**: Exists on antigravity/staging2-latest; requires truthful disclosure ("Trucks are cuisine illustrations, not actual vendor vehicles.") whenever shown.

### <a id="cmp-unconf-customer-profile-sharing"></a>`CMP-UNCONF-CUSTOMER-PROFILE-SHARING` — Private Customer Profile Dashboard, Curated "Greatest Hits" & Unlisted /s/&lt;token&gt; Share Page (Branch Candidate)

> [!NOTE]
> **Unconfirmed Applicability (`unconfirmed`)**: Implemented on candidate review branch feature/private-profiles-greatest-hits (PR #4) and not yet merged into working/biteshark-vps. Confirm applicability and style scope once reviewed. *(Not implied as active on `working/biteshark-vps`.)*

- **Design Questionnaire**: [Domain & Specialized Role Interfaces (`domain-components.md`)](domain-components.md#cmp-unconf-customer-profile-sharing)
- **Applicability**: `unconfirmed` · **Evidence Level**: `unconfirmed_future_or_branch`
- **Screens / Surfaces**: `#profileScreen and /s/<token> (feature/private-profiles-greatest-hits candidate only)`
- **User Roles**: `Anonymous Visitor`, `Customer`, `Admin: Mod`, `Admin: Top`
- **Selectors**: `#profileScreen`, `.gh-collection-card`, `.shared-collection-shell`
- **DOM IDs**: `profileScreen`
- **Definition Files**: `public/customer-profile.js`, `public/greatest-hits.js`, `public/customer-profile.css`
- **Definition Symbols**: *(declarative HTML/CSS only or unconfirmed)*
- **Observed Existing Variants**: Private account overview & settings dashboard; Curated Greatest Hits collection editor (up to 8 spots, reorderable); Revocable 18+ unlisted read-only shared collection page (/s/&lt;token&gt;)
- **Observed Existing States**: *(none observed)*
- **Related Feature Keys**: `visit_journal`, `private_photos`, `exploration_badges`, `suggested_trails`
- **Source & Handbook Records**: [BRANCH-AND-ENVIRONMENT-MAP.md](../BRANCH-AND-ENVIRONMENT-MAP.md), [visits-and-passport.md](../domains/visits-and-passport.md)
- **Unresolved References & Known Cascade/DOM Caveats**: Pending review on feature/private-profiles-greatest-hits; not on working/biteshark-vps.

### <a id="cmp-unconf-public-photo-moderation"></a>`CMP-UNCONF-PUBLIC-PHOTO-MODERATION` — Public Vendor Menu/Listing Photo Upload & Rights Verification UI (Disabled Flag)

> [!NOTE]
> **Unconfirmed Applicability (`unconfirmed`)**: Feature key owner_menu_photo_upload defaults to disabled in lib/feature-controls.js; #ownerScreen currently provides tab-local device-only preview (.photo-manager) with zero server upload. Confirm whether/when public vendor photo upload UI will be built. *(Not implied as active on `working/biteshark-vps`.)*

- **Design Questionnaire**: [Domain & Specialized Role Interfaces (`domain-components.md`)](domain-components.md#cmp-unconf-public-photo-moderation)
- **Applicability**: `unconfirmed` · **Evidence Level**: `unconfirmed_future_or_branch`
- **Screens / Surfaces**: `#ownerScreen`, `public/admin.html (future photo rights review if enabled)`
- **User Roles**: `Vendor Owner`, `Admin: Mod`, `Admin: Top`
- **Selectors**: `.photo-manager`, `#ownerPhotoGrid`
- **DOM IDs**: `ownerPhotoGrid`
- **Definition Files**: `public/index.html`, `lib/feature-controls.js`
- **Definition Symbols**: `previewOwnerPhotos`
- **Observed Existing Variants**: Device-only local preview placeholder currently in #ownerScreen
- **Observed Existing States**: *(none observed)*
- **Related Feature Keys**: `owner_menu_photo_upload`
- **Source & Handbook Records**: [FEATURE-CONTROLS.md](../FEATURE-CONTROLS.md), [photos.md](../domains/photos.md)
- **Unresolved References & Known Cascade/DOM Caveats**: owner_menu_photo_upload is disabled by default; public photo rights attestation workflow is not yet implemented.

