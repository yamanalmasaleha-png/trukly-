# Code Registry — Frontend Screens, DOM, Storage & CSS Inventory

> [!NOTE]
> **Machine-Generated Reference Inventory** — Do not hand-edit. Regenerate via `npm run registry:docs` (`node tools/code-registry/cli.mjs generate-docs`).
> - **Repository**: `https://github.com/yamanalmasaleha-png/trukly-`
> - **Provenance Mode**: `committed_source_digest` *(branch/detached-HEAD invariant; commit-bound runs use `npm run registry:scan -- --include-timestamp`)*
> - **Generator**: `biteshark-code-registry@2.0.0` (`biteshark.code-registry.v2`)
> - **Source Analysis Digest**: `914390a6fd40c85b1790a4e4970c4b5675a8136fe1a89670b8a3edae3d520fba`
> - **Analysis Scope & Limits**: Static AST, HTML, CSS, and SQL analysis without executing application modules. Relationships distinguish confirmed_static, documented_wrapper, inferred_candidate, and dynamic_unresolved; static analysis does not prove runtime behavioral correctness.

## HTML Document: [public/admin.html](../../../public/admin.html)

### Stylesheet Load Order (1)

1. `/admin.css` (L12)

### Script Load Order (3)

1. `/diagnostics-client.js` (L982)
2. `/auth-client.js` (L983)
3. `/admin.js` (L984)

### Static `data-*` Attributes (6)

`data-acct-tab`, `data-goto`, `data-iss-queue`, `data-mod-queue`, `data-section`, `data-subfilter`

### Static HTML Element IDs (230)

`#adminShell` (L15), `#adminRoleBadge` (L32), `#vpCustomerPreviewBtn` (L38), `#vpVendorSelect` (L40), `#vpVendorPreviewBtn` (L43), `#vpActOnBehalfBtn` (L44), `#adminUserEmail` (L50), `#adminUserSub` (L51), `#adminSignOutBtn` (L54), `#badgeApplications` (L67), `#badgeVendors` (L72), `#badgeInvitations` (L77), `#badgeModeration` (L82), `#badgeIssues` (L87), `#badgeReadiness` (L92), `#badgeFeatures` (L97), `#badgeDiagnostics` (L106), `#adminMain` (L114), `#adminLaunchReminderBanner` (L115), `#launchReminderHeadline` (L118), `#launchReminderSubnote` (L119), `#launchReminderOpenReadinessBtn` (L122), `#adminGlobalBanner` (L127), `#sec-overview` (L130), `#heading-overview` (L134), `#refreshOverviewBtn` (L137), `#overviewLoading` (L140), `#overviewError` (L141), `#overviewCards` (L143), `#ovPendingApps` (L146), `#ovModRecApps` (L147), `#ovPendingInvites` (L151), `#ovFlaggedComments` (L156), `#ovCommentsBreakdown` (L157), `#ovOpenIssues` (L161), `#ovOverdueIssues` (L162), `#ovRestrictedVendors` (L166), `#ovVendorsBreakdown` (L167), `#ovReadinessCard` (L169), `#ovUnresolvedReadiness` (L171), `#ovReadinessSub` (L172), `#ovHealthStatus` (L176), `#ovHealthSub` (L177), `#overviewRoleNotice` (L181), `#overviewRoleDescription` (L183), `#sec-applications` (L211), `#heading-applications` (L215), `#refreshAppsBtn` (L218), `#appsFilterForm` (L221), `#appsStatusFilter` (L223), `#appsRecFilter` (L234), `#appsSearchInput` (L243), `#appsListState` (L250), `#appsList` (L251), `#appsPager` (L252), `#appsDetailPane` (L254), `#sec-vendors` (L261), `#heading-vendors` (L265), `#refreshVendorsBtn` (L268), `#vendorsFilterForm` (L271), `#vendorsStatusFilter` (L273), `#vendorsOwnershipFilter` (L282), `#vendorsVerifiedFilter` (L291), `#vendorsTownFilter` (L299), `#vendorsSearchInput` (L302), `#vendorsListState` (L309), `#vendorsList` (L310), `#vendorsPager` (L311), `#vendorsDetailPane` (L313), `#sec-accounts` (L320), `#heading-accounts` (L324), `#refreshAccountsBtn` (L327), `#inviteCreateForm` (L332), `#invEmail` (L334), `#invRole` (L337), `#invVendorWrap` (L345), `#invVendorId` (L346), `#invNote` (L351), `#invSubmitBtn` (L354), `#invTopAuthorityNotice` (L357), `#invModElevationNotice` (L360), `#invResultBox` (L363), `#acctInvitationsView` (L371), `#invFilterForm` (L372), `#invStatusFilter` (L374), `#invRoleFilter` (L386), `#invListState` (L397), `#invList` (L398), `#invPager` (L399), `#acctDirectoryView` (L402), `#accountsFilterForm` (L403), `#acctRoleFilter` (L405), `#acctStatusFilter` (L414), `#acctSearchInput` (L421), `#acctListState` (L427), `#acctList` (L428), `#acctPager` (L429), `#acctDetailPane` (L431), `#sec-moderation` (L439), `#heading-moderation` (L443), `#refreshModBtn` (L446), `#modFilterForm` (L455), `#modStatusFilter` (L457), `#modVendorFilter` (L466), `#modAuthorFilter` (L469), `#modReasonFilter` (L472), `#modDateFrom` (L475), `#modDateTo` (L478), `#modSearchInput` (L481), `#modListState` (L488), `#modList` (L489), `#modPager` (L490), `#modDetailPane` (L492), `#sec-issues` (L499), `#heading-issues` (L503), `#refreshIssuesBtn` (L506), `#issuesQueueTabs` (L509), `#issuesFilterForm` (L519), `#issuesStatusFilter` (L521), `#issuesSeverityFilter` (L533), `#issuesUrgencyFilter` (L542), `#issuesReporterTypeFilter` (L552), `#issuesCategoryFilter` (L559), `#issuesVendorFilter` (L578), `#issuesDateFrom` (L581), `#issuesDateTo` (L584), `#issuesOverdueOnly` (L587), `#issuesSearchInput` (L591), `#issuesListState` (L598), `#issuesList` (L599), `#issuesPager` (L600), `#issuesDetailPane` (L602), `#sec-readiness` (L609), `#heading-readiness` (L613), `#refreshReadinessBtn` (L618), `#readinessSummaryStrip` (L622), `#rsUnresolvedCritical` (L623), `#rsPendingDecision` (L624), `#rsNeedsReReview` (L625), `#rsLegallyApproved` (L626), `#rsVisibleTotal` (L627), `#readinessFilterForm` (L634), `#readinessCategoryFilter` (L636), `#readinessStatusFilter` (L647), `#readinessCriticalOnly` (L662), `#readinessSearchInput` (L666), `#readinessListState` (L673), `#readinessList` (L674), `#readinessDetailPane` (L676), `#sec-features` (L683), `#heading-features` (L687), `#refreshFeaturesBtn` (L690), `#fcLiveStatus` (L693), `#fcLiveError` (L694), `#fcRoleAndPropagationCard` (L696), `#fcPropagationNote` (L700), `#fcRolePermissionNote` (L701), `#featuresFilterForm` (L710), `#fcStatusFilter` (L712), `#fcImplFilter` (L722), `#fcSearchInput` (L732), `#featuresLoading` (L737), `#featuresList` (L738), `#fcProtectedEssentialsPanel` (L740), `#fcProtectedList` (L743), `#fcHistoryPanel` (L746), `#fcHistoryWrap` (L748), `#sec-audit` (L753), `#heading-audit` (L757), `#refreshAuditBtn` (L760), `#auditFilterForm` (L763), `#auditActionFilter` (L765), `#auditVendorFilter` (L768), `#auditActorFilter` (L771), `#auditListState` (L776), `#auditList` (L777), `#auditPager` (L778), `#sec-diagnostics` (L782), `#heading-diagnostics` (L786), `#diagCreateSyntheticBtn` (L790), `#diagRunCleanupBtn` (L791), `#refreshDiagnosticsBtn` (L792), `#diagReleaseStrip` (L796), `#diagSummaryRow` (L800), `#diagFilterForm` (L802), `#diagSearchInput` (L804), `#diagWindowFilter` (L807), `#diagSeverityFilter` (L816), `#diagComponentFilter` (L825), `#diagFeatureFilter` (L834), `#diagTriageFilter` (L863), `#diagReleaseFilter` (L873), `#diagIncludeSynthetic` (L876), `#diagListState` (L884), `#diagList` (L885), `#diagPager` (L886), `#diagDetailPane` (L888), `#sec-health` (L895), `#heading-health` (L899), `#refreshHealthBtn` (L902), `#healthContent` (L904), `#aobModal` (L913), `#aobForm` (L914), `#aobModalTitle` (L916), `#aobVendorDisplay` (L919), `#aobReasonInput` (L922), `#aobError` (L924), `#aobCancelBtn` (L926), `#featureConfirmModal` (L933), `#fcConfirmTitle` (L936), `#fcConfirmLead` (L937), `#fcConfirmTransitionSummary` (L938), `#fcConfirmConsequences` (L941), `#fcConfirmReason` (L944), `#fcConfirmError` (L946), `#fcConfirmCancelBtn` (L948), `#fcConfirmSubmitBtn` (L949), `#invActionModal` (L955), `#invActionForm` (L956), `#invActionKicker` (L957), `#invActionTitle` (L958), `#invActionSummary` (L959), `#invActionReason` (L961), `#invActionError` (L963), `#invActionCancelBtn` (L965), `#invActionSubmitBtn` (L966), `#invHistoryModal` (L971), `#invHistoryTitle` (L974), `#invHistoryBody` (L975), `#invHistoryCloseBtn` (L977)

## HTML Document: [public/index.html](../../../public/index.html)

### Screens (10)

| Element ID | Tag | Default Active | Classes | Line |
|---|---|---|---|---:|
| `#discoverScreen` | `<main>` | Yes | `screen active list-mode` | L48 |
| `#communityScreen` | `<main>` | No | `screen page-screen` | L117 |
| `#guidesScreen` | `<main>` | No | `screen page-screen` | L202 |
| `#smartScreen` | `<main>` | No | `screen page-screen` | L247 |
| `#pagerScreen` | `<main>` | No | `screen page-screen` | L263 |
| `#favoritesScreen` | `<main>` | No | `screen page-screen` | L295 |
| `#bookingsScreen` | `<main>` | No | `screen page-screen` | L305 |
| `#ownerScreen` | `<main>` | No | `screen page-screen owner-page` | L311 |
| `#welcomeScreen` | `<main>` | No | `screen page-screen welcome-screen` | L332 |
| `#vendorIntroScreen` | `<main>` | No | `screen page-screen vendor-intro-screen` | L372 |

### Stylesheet Load Order (16)

1. `https://unpkg.com/leaflet@1.9.4/dist/leaflet.css` *(external CDN)* (L7)
2. `/theme.css` (L8)
3. `/neighborhood.css` (L9)
4. `/pager.css` (L10)
5. `/pager-experience.css` (L11)
6. `/smart.css` (L12)
7. `/characters.css` (L13)
8. `/coffee-club.css` (L14)
9. `/local-guides.css` (L15)
10. `/guide-passport.css` (L16)
11. `/layout-polish.css` (L17)
12. `/community.css` (L18)
13. `/street-whispers.css` (L19)
14. `/mobile-scroll-fix.css` (L20)
15. `/color-calm.css` (L21)
16. `/role-experience.css` (L22)

### Script Load Order (15)

1. `https://unpkg.com/leaflet@1.9.4/dist/leaflet.js` *(external CDN)* (L454)
2. `/diagnostics-client.js` (L455)
3. `/auth-client.js` (L456)
4. `/exploration-client.js` (L457)
5. `/role-experience.js` (L458)
6. `/app.js` (L459)
7. `/listing-highlights.js` (L460)
8. `/pager.js` (L461)
9. `/smart.js` (L462)
10. `/characters.js` (L463)
11. `/coffee-club.js` (L464)
12. `/local-guides.js` (L465)
13. `/guide-passport.js` (L466)
14. `/community.js` (L467)
15. `/street-whispers.js` (L468)

### Inline Event Handlers (122)

| Line | Tag / ID | Attribute | Expression | Called Functions |
|---:|---|---|---|---|
| L27 | `<button>` | `onclick` | `showScreen('owner')` | `showScreen` |
| L28 | `<button#locationPillBtn>` | `onclick` | `openAreaPicker()` | `openAreaPicker` |
| L30 | `<button>` | `onclick` | `openLocalGuides()` | `openLocalGuides` |
| L31 | `<button>` | `onclick` | `openPager()` | `openPager` |
| L32 | `<button>` | `onclick` | `showScreen('discover')` | `showScreen` |
| L38 | `<button>` | `onclick` | `showScreen('favorites');this.closest('details').open=false` | `showScreen`, `this.closest` |
| L39 | `<button>` | `onclick` | `showScreen('bookings');this.closest('details').open=false` | `showScreen`, `this.closest` |
| L40 | `<button>` | `onclick` | `this.closest('details').open=false;openCommunity()` | `openCommunity`, `this.closest` |
| L42 | `<button#authSignOutBtn>` | `onclick` | `signOutUser();this.closest('details').open=false` | `signOutUser`, `this.closest` |
| L58 | `<button#mapFallbackListBtn>` | `onclick` | `continueInListFromMapFallback()` | `continueInListFromMapFallback` |
| L59 | `<button#mapFallbackRetryBtn>` | `onclick` | `retryInteractiveMap()` | `retryInteractiveMap` |
| L64 | `<button#mapMode>` | `onclick` | `setMode('map')` | `setMode` |
| L64 | `<button#listMode>` | `onclick` | `setMode('list')` | `setMode` |
| L66 | `<input#searchInput>` | `oninput` | `applyFilters()` | `applyFilters` |
| L66 | `<button#searchLocateBtn>` | `onclick` | `locateMe()` | `locateMe` |
| L70 | `<button#openNow>` | `onclick` | `toggleOpen()` | `toggleOpen` |
| L70 | `<button#distanceFilterBtn>` | `onclick` | `openDistance()` | `openDistance` |
| L70 | `<button#refreshCatalogBtn>` | `onclick` | `refreshDiscoveryCatalog({fresh:true,announce:true})` | `refreshDiscoveryCatalog` |
| L79 | `<button>` | `onclick` | `surpriseMe()` | `surpriseMe` |
| L82 | `<button>` | `onclick` | `openCommunity()` | `openCommunity` |
| L84 | `<button>` | `onclick` | `chooseKind('All')` | `chooseKind` |
| L85 | `<button>` | `onclick` | `chooseKind('Pop-ups')` | `chooseKind` |
| L86 | `<button>` | `onclick` | `chooseKind('Markets')` | `chooseKind` |
| L87 | `<button>` | `onclick` | `chooseKind('Food Trucks')` | `chooseKind` |
| L88 | `<button>` | `onclick` | `chooseKind('Coffee')` | `chooseKind` |
| L89 | `<button>` | `onclick` | `chooseKind('Farm Stands')` | `chooseKind` |
| L99 | `<button#discoverOpenTrailsBtn>` | `onclick` | `openSmart('trail')` | `openSmart` |
| L106 | `<button>` | `onclick` | `chooseKind('Farm Stands')` | `chooseKind` |
| L107 | `<button>` | `onclick` | `chooseKind('All');chooseCuisine('Sweets');setMode('list');document.getElementById('resultsHeading').scrollIntoView({block:'start',behavior:'smooth'})` | `chooseCuisine`, `chooseKind`, `document.getElementById`, `setMode` |
| L108 | `<button>` | `onclick` | `chooseKind('Coffee')` | `chooseKind` |
| L111 | `<button>` | `onclick` | `openSmart('finder')` | `openSmart` |
| L111 | `<button>` | `onclick` | `openSmart('trail')` | `openSmart` |
| L121 | `<button>` | `onclick` | `communityStartPost('review')` | `communityStartPost` |
| L122 | `<button>` | `onclick` | `communityToggleMy()` | `communityToggleMy` |
| L130 | `<button>` | `onclick` | `communityStartPost('review')` | `communityStartPost` |
| L131 | `<button>` | `onclick` | `communityStartPost('tip')` | `communityStartPost` |
| L132 | `<button>` | `onclick` | `communityStartPost('question')` | `communityStartPost` |
| L136 | `<button>` | `onclick` | `communityStartPost('tip','A hidden gem worth finding')` | `communityStartPost` |
| L137 | `<button>` | `onclick` | `communityStartPost('review','My favorite bite here')` | `communityStartPost` |
| L138 | `<button>` | `onclick` | `communityStartPost('tip','A great budget-friendly order')` | `communityStartPost` |
| L139 | `<button>` | `onclick` | `communityStartPost('tip','My local coffee tip')` | `communityStartPost` |
| L140 | `<button>` | `onclick` | `communityStartPost('tip','Weekend market finds')` | `communityStartPost` |
| L141 | `<button>` | `onclick` | `communityStartPost('question','What should I try at this spot?')` | `communityStartPost` |
| L155 | `<button>` | `onclick` | `streetMysteryPick()` | `streetMysteryPick` |
| L156 | `<button>` | `onclick` | `streetNextMission()` | `streetNextMission` |
| L159 | `<button>` | `onclick` | `streetOpenWhisper()` | `streetOpenWhisper` |
| L164 | `<button>` | `onclick` | `communityClosePost()` | `communityClosePost` |
| L166 | `<form#communityPostForm>` | `onsubmit` | `communitySubmitPost(event)` | `communitySubmitPost` |
| L168 | `<select#communityKind>` | `onchange` | `communityKindChange()` | `communityKindChange` |
| L183 | `<button>` | `onclick` | `communitySetFilter('all')` | `communitySetFilter` |
| L184 | `<button>` | `onclick` | `communitySetFilter('review')` | `communitySetFilter` |
| L185 | `<button>` | `onclick` | `communitySetFilter('tip')` | `communitySetFilter` |
| L186 | `<button>` | `onclick` | `communitySetFilter('question')` | `communitySetFilter` |
| L187 | `<button>` | `onclick` | `communitySetFilter('whisper')` | `communitySetFilter` |
| L188 | `<select#communityTownFilter>` | `onchange` | `communityState.town=this.value;communityRender()` | `communityRender` |
| L189 | `<select#communitySort>` | `onchange` | `communityState.sort=this.value;communityRender()` | `communityRender` |
| L190 | `<input#communitySearch>` | `oninput` | `communityState.search=this.value.toLowerCase().trim();communityRender()` | `communityRender`, `this.value.toLowerCase` |
| L195 | `<button>` | `onclick` | `openLocalGuides('passport')` | `openLocalGuides` |
| L196 | `<button>` | `onclick` | `openLocalGuides('stories')` | `openLocalGuides` |
| L197 | `<button>` | `onclick` | `showScreen('discover')` | `showScreen` |
| L209 | `<button#guidesOpenTrailsBtn>` | `onclick` | `openSmart('trail')` | `openSmart` |
| L212 | `<button#guideTabPassport>` | `onclick` | `showGuidesTab('passport')` | `showGuidesTab` |
| L213 | `<button#guideTabStories>` | `onclick` | `showGuidesTab('stories')` | `showGuidesTab` |
| L214 | `<button#guideTabPhotos>` | `onclick` | `showGuidesTab('photos')` | `showGuidesTab` |
| L231 | `<form>` | `onsubmit` | `saveDishPhoto(event)` | `saveDishPhoto` |
| L256 | `<button>` | `onclick` | `openSmart('trail')` | `openSmart` |
| L257 | `<button>` | `onclick` | `openSmart('finder')` | `openSmart` |
| L272 | `<button>` | `onclick` | `startPagerDemo()` | `startPagerDemo` |
| L279 | `<form>` | `onsubmit` | `joinPager(event)` | `joinPager` |
| L298 | `<input#nearbyAlertToggle>` | `onchange` | `saveNotificationSettings()` | `saveNotificationSettings` |
| L299 | `<select#nearbyAlertRadius>` | `onchange` | `saveNotificationSettings()` | `saveNotificationSettings` |
| L313 | `<button>` | `onclick` | `showScreen('discover')` | `showScreen` |
| L315 | `<select#ownerTruckSelect>` | `onchange` | `selectOwnerTruck(this.value)` | `selectOwnerTruck` |
| L321 | `<button>` | `onclick` | `openOwnerMarketingKit()` | `openOwnerMarketingKit` |
| L322 | `<button>` | `onclick` | `openPager();startPagerDemo()` | `openPager`, `startPagerDemo` |
| L322 | `<button>` | `onclick` | `loadKitchen()` | `loadKitchen` |
| L322 | `<form#pagerCreateForm>` | `onsubmit` | `createPager(event)` | `createPager` |
| L322 | `<button>` | `onclick` | `loadKitchen()` | `loadKitchen` |
| L323 | `<button>` | `onclick` | `communityOpenModeration()` | `communityOpenModeration` |
| L324 | `<button#ownerUpdateLocationBtn>` | `onclick` | `updateOwnerLocation()` | `updateOwnerLocation` |
| L325 | `<input#ownerScheduleDate>` | `onchange` | `syncOwnerScheduleDay()` | `syncOwnerScheduleDay` |
| L325 | `<input#ownerIsOpen>` | `onchange` | `toggleOwnerOpenStatus()` | `toggleOwnerOpenStatus` |
| L325 | `<button#ownerSaveScheduleBtn>` | `onclick` | `saveOwnerSchedule()` | `saveOwnerSchedule` |
| L326 | `<input>` | `onchange` | `previewOwnerPhotos(event)` | `previewOwnerPhotos` |
| L327 | `<button#ownerEditProfileBtn>` | `onclick` | `openOwnerProfileModal()` | `openOwnerProfileModal` |
| L327 | `<button>` | `onclick` | `shareOwnerLocation()` | `shareOwnerLocation` |
| L327 | `<button>` | `onclick` | `openBooking(ownerTruckId)` | `openBooking` |
| L328 | `<button>` | `onclick` | `setOwnerRequestFilter('pending')` | `setOwnerRequestFilter` |
| L328 | `<button>` | `onclick` | `setOwnerRequestFilter('accepted')` | `setOwnerRequestFilter` |
| L328 | `<button>` | `onclick` | `setOwnerRequestFilter('all')` | `setOwnerRequestFilter` |
| L417 | `<button>` | `onclick` | `showScreen('discover')` | `showScreen` |
| L418 | `<button>` | `onclick` | `showScreen('favorites')` | `showScreen` |
| L419 | `<button>` | `onclick` | `openBooking()` | `openBooking` |
| L420 | `<button>` | `onclick` | `openLocalGuides('passport')` | `openLocalGuides` |
| L421 | `<button>` | `onclick` | `showScreen('bookings')` | `showScreen` |
| L422 | `<button>` | `onclick` | `surpriseMe()` | `surpriseMe` |
| L426 | `<div#detailModal>` | `onclick` | `if(event.target===this)closeModal()` | `closeModal` |
| L427 | `<div#bookingModal>` | `onclick` | `if(event.target===this)closeBooking()` | `closeBooking` |
| L427 | `<form>` | `onsubmit` | `submitBooking(event)` | `submitBooking` |
| L428 | `<button>` | `onclick` | `closeBooking()` | `closeBooking` |
| L431 | `<select#bookingTruck>` | `onchange` | `onBookingTruckChange()` | `onBookingTruckChange` |
| L432 | `<fieldset>` | `onchange` | `validateBookingChoice()` | `validateBookingChoice` |
| L437 | `<input#eventDate>` | `onchange` | `checkBookingAvailability()` | `checkBookingAvailability` |
| L437 | `<input#guestCount>` | `oninput` | `validateBookingChoice()` | `validateBookingChoice` |
| L442 | `<div#ownerProfileModal>` | `onclick` | `if(event.target===this)closeOwnerProfileModal()` | `closeOwnerProfileModal` |
| L442 | `<form>` | `onsubmit` | `saveOwnerProfile(event)` | `saveOwnerProfile` |
| L443 | `<button>` | `onclick` | `closeOwnerProfileModal()` | `closeOwnerProfileModal` |
| L451 | `<div#distanceModal>` | `onclick` | `if(event.target===this)closeDistanceModal()` | `closeDistanceModal` |
| L451 | `<button>` | `onclick` | `closeDistanceModal()` | `closeDistanceModal` |
| L451 | `<input#distanceRange>` | `oninput` | `setDistance(this.value)` | `setDistance` |
| L451 | `<button>` | `onclick` | `closeDistanceModal();applyFilters()` | `applyFilters`, `closeDistanceModal` |
| L452 | `<div#areaModal>` | `onclick` | `if(event.target===this)closeAreaModal()` | `closeAreaModal` |
| L452 | `<button>` | `onclick` | `closeAreaModal()` | `closeAreaModal` |
| L452 | `<button#areaUseLocationBtn>` | `onclick` | `closeAreaModal();locateMe()` | `closeAreaModal`, `locateMe` |
| L452 | `<button#areaAllSonomaBtn>` | `onclick` | `selectManualArea('')` | `selectManualArea` |
| L452 | `<button>` | `onclick` | `selectManualArea('Santa Rosa')` | `selectManualArea` |
| L452 | `<button>` | `onclick` | `selectManualArea('Petaluma')` | `selectManualArea` |
| L452 | `<button>` | `onclick` | `selectManualArea('Rohnert Park')` | `selectManualArea` |
| L452 | `<button>` | `onclick` | `selectManualArea('Cotati')` | `selectManualArea` |
| L452 | `<button>` | `onclick` | `selectManualArea('Sonoma')` | `selectManualArea` |
| L452 | `<button>` | `onclick` | `selectManualArea('Sebastopol')` | `selectManualArea` |
| L452 | `<button>` | `onclick` | `selectManualArea('Healdsburg')` | `selectManualArea` |

### Static `data-*` Attributes (14)

`data-area-town`, `data-community-filter`, `data-cuisine`, `data-doodle`, `data-guide-tab`, `data-kind`, `data-max`, `data-name`, `data-price`, `data-req-filter`, `data-screen`, `data-smart-tab`, `data-truck-character`, `data-vi-feature`

### Static HTML Element IDs (203)

`#app` (L25), `#locationPillBtn` (L28), `#locationLabel` (L28), `#profileMenu` (L33), `#profileAvatar` (L34), `#profileHeading` (L36), `#profileSub` (L37), `#authSignInLink` (L41), `#authSignOutBtn` (L42), `#discoverScreen` (L48), `#map` (L50), `#mapFallback` (L51), `#mapFallbackStatus` (L53), `#mapFallbackTitle` (L55), `#mapFallbackCopy` (L56), `#mapFallbackListBtn` (L58), `#mapFallbackRetryBtn` (L59), `#mapFallbackHint` (L61), `#mapMode` (L64), `#listMode` (L64), `#searchInput` (L66), `#searchLocateBtn` (L66), `#filters` (L67), `#extraFilters` (L70), `#openNow` (L70), `#distanceFilterBtn` (L70), `#distanceText` (L70), `#refreshCatalogBtn` (L70), `#nearbyCount` (L71), `#coarseAreaBanner` (L72), `#openHoursNote` (L73), `#catalogOfflineNote` (L74), `#mapEmpty` (L76), `#truckSheet` (L77), `#neighborhoodHeading` (L79), `#characterHeroSlogan` (L80), `#resultsHeading` (L92), `#flavorGuide` (L93), `#flavorGuideText` (L93), `#discoverSuggestedTrailsBar` (L94), `#discoverOpenTrailsBtn` (L99), `#truckCards` (L101), `#discoverExtras` (L102), `#discoverStoriesStrip` (L110), `#smartInvite` (L111), `#communityScreen` (L117), `#communitySuccess` (L125), `#streetSectionTitle` (L147), `#streetQuiz` (L151), `#streetMysteryResult` (L155), `#streetMissionResult` (L156), `#streetFiles` (L160), `#communityCompose` (L163), `#communityPostForm` (L166), `#communityKind` (L168), `#communityNickname` (L169), `#communityPlace` (L171), `#communityRatingRow` (L172), `#communityRating` (L172), `#communityTitle` (L173), `#communityBody` (L174), `#communitySubmit` (L176), `#communityActionMessage` (L176), `#communityMyPosts` (L179), `#communityCount` (L181), `#communityTownFilter` (L188), `#communitySort` (L189), `#communitySearch` (L190), `#communityFeed` (L192), `#guidesScreen` (L202), `#guidesOpenTrailsBtn` (L209), `#guideTabPassport` (L212), `#guideTabStories` (L213), `#guideTabPhotos` (L214), `#guidePassportSection` (L216), `#guidePassport` (L216), `#guideStories` (L217), `#guideStoryGrid` (L219), `#guidePhotoSection` (L221), `#dishPhotoCountBadge` (L227), `#guidePhotoAuthGate` (L229), `#guidePhotoFormWrap` (L230), `#dishPhotoVendor` (L233), `#dishPhotoCaption` (L234), `#dishPhotoFile` (L236), `#dishPhotoProgress` (L237), `#dishPhotoSave` (L238), `#dishPhotoMessage` (L242), `#dishPhotoGrid` (L243), `#smartScreen` (L247), `#smartBody` (L259), `#smartMessage` (L260), `#pagerScreen` (L263), `#pagerRealEntry` (L276), `#pagerCode` (L279), `#pagerMessage` (L282), `#pagerLiveStatus` (L283), `#pagerDisplay` (L285), `#favoritesScreen` (L295), `#nearbyAlertToggle` (L298), `#nearbyAlertMeta` (L298), `#nearbyAlertRadius` (L299), `#favoritesFeedback` (L301), `#favoriteGrid` (L302), `#bookingsScreen` (L305), `#bookingsFeedback` (L307), `#bookingList` (L308), `#ownerScreen` (L311), `#ownerLogo` (L314), `#ownerTitle` (L314), `#ownerSubtitle` (L314), `#ownerTruckSelect` (L315), `#ownerStatusPill` (L315), `#ownerModeBanner` (L317), `#ownerFeedback` (L318), `#statTotalRequests` (L319), `#statPendingRequests` (L319), `#statAcceptedRequests` (L319), `#ownerMarketingCard` (L321), `#ownerMarketingPanel` (L321), `#kitchenPanel` (L322), `#pagerCreateForm` (L322), `#pagerVendor` (L322), `#pagerTicket` (L322), `#pagerCreateButton` (L322), `#kitchenMessage` (L322), `#kitchenQueue` (L322), `#ownerModerationCard` (L323), `#communityModeration` (L323), `#ownerPinEmoji` (L324), `#ownerLocation` (L324), `#ownerLat` (L324), `#ownerLng` (L324), `#ownerLocationTtl` (L324), `#ownerUpdateLocationBtn` (L324), `#ownerLocationMsg` (L324), `#ownerScheduleDate` (L325), `#ownerScheduleWeekday` (L325), `#ownerOpensAt` (L325), `#ownerClosesAt` (L325), `#ownerIsOpen` (L325), `#ownerSaveScheduleBtn` (L325), `#ownerScheduleMsg` (L325), `#ownerScheduleList` (L325), `#ownerPhotoGrid` (L326), `#ownerPhotoMsg` (L326), `#ownerEditProfileBtn` (L327), `#ownerEditProfileSub` (L327), `#ownerRequestCount` (L328), `#ownerRequests` (L328), `#welcomeScreen` (L332), `#welcomeHeading` (L336), `#welcomeCustomerBtn` (L339), `#welcomeVendorBtn` (L347), `#welcomeRememberChoice` (L357), `#welcomeJustBrowseBtn` (L364), `#welcomeSignInLink` (L365), `#welcomeFeedbackMsg` (L367), `#vendorIntroScreen` (L372), `#viBackToBrowseBtn` (L375), `#viRememberedBadge` (L376), `#viForgetPrefBtn` (L378), `#vendorIntroHeading` (L383), `#viCapabilitiesList` (L385), `#viOnboardingPausedNotice` (L394), `#viListingPickerWrap` (L395), `#viListingSearch` (L398), `#viListingSelect` (L399), `#viClaimBusinessBtn` (L405), `#viAddBusinessBtn` (L406), `#viManageSignInLink` (L409), `#viJustExploreBtn` (L410), `#detailModal` (L426), `#detailContent` (L426), `#bookingModal` (L427), `#bookingModalTitle` (L428), `#bookingTruckLabel` (L428), `#bookingAuthNotice` (L430), `#bookingTruck` (L431), `#eventType` (L436), `#eventDate` (L437), `#guestCount` (L437), `#eventLocation` (L438), `#eventNote` (L438), `#bookingError` (L439), `#bookingSubmitBtn` (L440), `#ownerProfileModal` (L442), `#ownerProfileModalTitle` (L443), `#ownerProfileName` (L444), `#ownerProfileCuisine` (L445), `#ownerProfileBio` (L446), `#ownerAcceptingBookings` (L447), `#ownerProfileError` (L448), `#ownerProfileSaveBtn` (L449), `#distanceModal` (L451), `#distanceModalTitle` (L451), `#distanceRange` (L451), `#rangeValue` (L451), `#areaModal` (L452), `#areaModalTitle` (L452), `#areaUseLocationBtn` (L452), `#areaAllSonomaBtn` (L452), `#toast` (L453)

## HTML Document: [public/login.html](../../../public/login.html)

### Stylesheet Load Order (1)

1. `/theme.css` (L14)

### Script Load Order (2)

1. `/diagnostics-client.js` (L448)
2. `/auth-client.js` (L449)

### Static HTML Element IDs (47)

`#loginMain` (L279), `#returnLink` (L280), `#emailStep` (L290), `#stepKicker` (L291), `#stepHeading` (L292), `#tabSignIn` (L295), `#tabSignUp` (L298), `#inviteContextBanner` (L303), `#vendorContextBanner` (L304), `#stagingModeNotice` (L305), `#modeHelperText` (L307), `#emailForm` (L311), `#email` (L313), `#dobFieldset` (L316), `#dobMonth` (L321), `#dobDay` (L339), `#dobYear` (L343), `#dobPurposeNote` (L346), `#sendBtn` (L351), `#passkeyDisclosure` (L354), `#loginHelpDisclosure` (L357), `#codeStep` (L362), `#backBtn` (L363), `#codeStepHeading` (L364), `#codeStepLead` (L365), `#emailLabel` (L365), `#codeStepGuidance` (L366), `#codeForm` (L369), `#code` (L371), `#codeExpiryNote` (L373), `#codeTtlMinutes` (L374), `#verifyBtn` (L376), `#resendBtn` (L377), `#codeStepStatus` (L379), `#ageAssessmentStep` (L382), `#assessEmailLabel` (L386), `#ageAssessmentForm` (L388), `#assessDobMonth` (L394), `#assessDobDay` (L412), `#assessDobYear` (L416), `#assessPurposeNote` (L419), `#assessSubmitBtn` (L423), `#assessSignOutBtn` (L424), `#passkeyOffer` (L428), `#addPasskeyBtn` (L431), `#skipPasskeyBtn` (L432), `#error` (L435)

## HTML Document: [public/policies/accessibility.html](../../../public/policies/accessibility.html)

### Stylesheet Load Order (1)

1. `/policies/policies.css` (L9)

### Static HTML Element IDs (1)

`#policyMain` (L29)

## HTML Document: [public/policies/advertising-sponsored.html](../../../public/policies/advertising-sponsored.html)

### Stylesheet Load Order (1)

1. `/policies/policies.css` (L9)

### Static HTML Element IDs (1)

`#policyMain` (L29)

## HTML Document: [public/policies/community-moderation.html](../../../public/policies/community-moderation.html)

### Stylesheet Load Order (1)

1. `/policies/policies.css` (L9)

### Static HTML Element IDs (1)

`#policyMain` (L29)

## HTML Document: [public/policies/cookies-storage.html](../../../public/policies/cookies-storage.html)

### Stylesheet Load Order (1)

1. `/policies/policies.css` (L9)

### Static HTML Element IDs (1)

`#policyMain` (L29)

## HTML Document: [public/policies/index.html](../../../public/policies/index.html)

### Stylesheet Load Order (1)

1. `/policies/policies.css` (L9)

### Static HTML Element IDs (1)

`#policyMain` (L29)

## HTML Document: [public/policies/privacy.html](../../../public/policies/privacy.html)

### Stylesheet Load Order (1)

1. `/policies/policies.css` (L9)

### Static HTML Element IDs (1)

`#policyMain` (L29)

## HTML Document: [public/policies/terms.html](../../../public/policies/terms.html)

### Stylesheet Load Order (1)

1. `/policies/policies.css` (L9)

### Static HTML Element IDs (1)

`#policyMain` (L29)

## HTML Document: [public/policies/vendor-terms.html](../../../public/policies/vendor-terms.html)

### Stylesheet Load Order (1)

1. `/policies/policies.css` (L9)

### Static HTML Element IDs (1)

`#policyMain` (L29)

## Browser Storage, IndexedDB & Cookie Accesses (19)

| Storage Mechanism | Key / Database | Operations | Code Locations |
|---|---|---|---|
| `IndexedDB` | `truckly-dish-notebook-v1` | `open` | `public/exploration-client.js:L702`, `public/exploration-client.js:L767`, `public/exploration-client.js:L814` |
| `cookie` | `:expr=; Path=/; Max-Age=0; Expir` | `write` | `public/role-experience.js:L40` |
| `cookie` | `<dynamic>` | `write` | `public/role-experience.js:L83` |
| `cookie` | `truckly_debug_role` | `write` | `scripts/dev-workbench/debug-admin.js:L123` |
| `localStorage` | `<constant_or_var>` | `getItem, removeItem, setItem` | `public/app.js:L108`, `public/app.js:L128`, `scripts/dev-workbench/debug-admin.js:L13`, `scripts/dev-workbench/debug-admin.js:L21` |
| `localStorage` | `truckly_bookings` | `removeItem` | `public/app.js:L1726`, `public/app.js:L1794`, `public/auth-client.js:L24` |
| `localStorage` | `truckly_catalog` | `removeItem` | `public/app.js:L423` |
| `localStorage` | `truckly_catalog_v2` | `safeJSON, setItem` | `public/app.js:L424`, `public/app.js:L980` |
| `localStorage` | `truckly_favs` | `removeItem, safeJSON, safeStorageSet` | `public/app.js:L1655`, `public/app.js:L1661`, `public/app.js:L1723`, `public/app.js:L1795` |
| `localStorage` | `truckly_favs_scope` | `getItem, removeItem, safeStorageSet` | `public/app.js:L1632`, `public/app.js:L1656`, `public/app.js:L1662`, `public/app.js:L1721` |
| `localStorage` | `truckly_guide_passport_v1` | `getItem, removeItem, setItem` | `public/exploration-client.js:L625`, `public/exploration-client.js:L676`, `public/exploration-client.js:L678` |
| `localStorage` | `truckly_notify` | `removeItem, safeJSON, safeStorageSet` | `public/app.js:L1797`, `public/app.js:L2054`, `public/app.js:L2076`, `public/app.js:L2110` |
| `localStorage` | `truckly_owner_profile` | `removeItem, safeJSON, safeStorageSet` | `public/app.js:L1799`, `public/app.js:L2896`, `public/app.js:L3676`, `public/auth-client.js:L29` |
| `localStorage` | `truckly_owner_schedule` | `removeItem, safeJSON, safeStorageSet` | `public/app.js:L1800`, `public/app.js:L2904`, `public/app.js:L3572`, `public/auth-client.js:L30` |
| `localStorage` | `truckly_owner_truck_id` | `getItem, removeItem, setItem` | `public/app.js:L1798`, `public/app.js:L2889`, `public/app.js:L3074`, `public/auth-client.js:L28` |
| `localStorage` | `truckly_pager_subs_v1` | `getItem, setItem` | `public/pager.js:L21`, `public/pager.js:L42` |
| `sessionStorage` | `biteshark_admin_viewpoint_v1` | `getItem, removeItem, setItem` | `public/admin.js:L318`, `public/admin.js:L319`, `public/auth-client.js:L23`, `public/role-experience.js:L1077` |
| `sessionStorage` | `biteshark_pending_invite_v1` | `getItem, removeItem, setItem` | `public/admin.js:L4769`, `public/role-experience.js:L100`, `public/role-experience.js:L92`, `public/role-experience.js:L96` |
| `sessionStorage` | `bs_support_draft_v1` | `getItem, removeItem, setItem` | `public/admin.js:L4768`, `public/auth-client.js:L22`, `public/role-experience.js:L106`, `public/role-experience.js:L109` |

## CSS Stylesheets, Custom Properties & Responsive Breakpoints (18)

| Stylesheet | Custom Properties Defined | Media Queries | `!important` Declarations |
|---|---:|---:|---:|
| [public/admin.css](../../../public/admin.css) | 18 | 5 | 13 |
| [public/characters.css](../../../public/characters.css) | 0 | 3 | 1 |
| [public/coffee-club.css](../../../public/coffee-club.css) | 0 | 2 | 0 |
| [public/color-calm.css](../../../public/color-calm.css) | 18 | 4 | 4 |
| [public/community.css](../../../public/community.css) | 0 | 3 | 1 |
| [public/guide-passport.css](../../../public/guide-passport.css) | 2 | 4 | 2 |
| [public/layout-polish.css](../../../public/layout-polish.css) | 5 | 3 | 0 |
| [public/local-guides.css](../../../public/local-guides.css) | 4 | 4 | 2 |
| [public/mobile-scroll-fix.css](../../../public/mobile-scroll-fix.css) | 2 | 5 | 17 |
| [public/neighborhood.css](../../../public/neighborhood.css) | 18 | 3 | 0 |
| [public/pager-experience.css](../../../public/pager-experience.css) | 0 | 2 | 1 |
| [public/pager.css](../../../public/pager.css) | 0 | 3 | 1 |
| [public/policies/policies.css](../../../public/policies/policies.css) | 14 | 1 | 0 |
| [public/role-experience.css](../../../public/role-experience.css) | 0 | 3 | 6 |
| [public/smart.css](../../../public/smart.css) | 0 | 1 | 3 |
| [public/street-whispers.css](../../../public/street-whispers.css) | 0 | 3 | 2 |
| [public/theme.css](../../../public/theme.css) | 26 | 4 | 11 |
| [scripts/dev-workbench/debug-admin.css](../../../scripts/dev-workbench/debug-admin.css) | 0 | 1 | 1 |
