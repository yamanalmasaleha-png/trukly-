# Code Registry — Frontend Screens, DOM, Storage & CSS Inventory

> [!NOTE]
> **Machine-Generated Reference Inventory** — Do not hand-edit. Regenerate via `npm run registry:docs` (`node tools/code-registry/cli.mjs generate-docs`).
> - **Repository**: `https://github.com/yamanalmasaleha-png/trukly-`
> - **Branch / Ref at Generation**: `testing/yaman-staging2`
> - **Generator**: `biteshark-code-registry@1.0.0` (`biteshark.code-registry.v1`)
> - **Deterministic Source Digest**: `c9bab6b5651ec1f6f328d144f7b4b00db41bffd8353808fa07224f75f7eae109`
> - **Analysis Basis**: Static AST, HTML, CSS, and SQL analysis without executing application modules. Dynamic string concatenation, computed property lookups, and runtime reflection are labeled as dynamic/unresolved rather than assumed complete.

## HTML Document: [public/admin.html](../../../public/admin.html)

### Stylesheet Load Order (1)

1. `/admin.css` (L12)

### Script Load Order (3)

1. `/diagnostics-client.js` (L977)
2. `/auth-client.js` (L978)
3. `/admin.js` (L979)

### Static `data-*` Attributes (6)

`data-acct-tab`, `data-goto`, `data-iss-queue`, `data-mod-queue`, `data-section`, `data-subfilter`

### Static HTML Element IDs (230)

`#adminShell` (L15), `#adminRoleBadge` (L32), `#vpCustomerPreviewBtn` (L38), `#vpVendorSelect` (L40), `#vpVendorPreviewBtn` (L43), `#vpActOnBehalfBtn` (L44), `#adminUserEmail` (L50), `#adminUserSub` (L51), `#adminSignOutBtn` (L54), `#badgeApplications` (L67), `#badgeVendors` (L72), `#badgeInvitations` (L77), `#badgeModeration` (L82), `#badgeIssues` (L87), `#badgeReadiness` (L92), `#badgeFeatures` (L97), `#badgeDiagnostics` (L106), `#adminMain` (L114), `#adminLaunchReminderBanner` (L115), `#launchReminderHeadline` (L118), `#launchReminderSubnote` (L119), `#launchReminderOpenReadinessBtn` (L122), `#adminGlobalBanner` (L127), `#sec-overview` (L130), `#heading-overview` (L134), `#refreshOverviewBtn` (L137), `#overviewLoading` (L140), `#overviewError` (L141), `#overviewCards` (L143), `#ovPendingApps` (L146), `#ovModRecApps` (L147), `#ovPendingInvites` (L151), `#ovFlaggedComments` (L156), `#ovCommentsBreakdown` (L157), `#ovOpenIssues` (L161), `#ovOverdueIssues` (L162), `#ovRestrictedVendors` (L166), `#ovVendorsBreakdown` (L167), `#ovReadinessCard` (L169), `#ovUnresolvedReadiness` (L171), `#ovReadinessSub` (L172), `#ovHealthStatus` (L176), `#ovHealthSub` (L177), `#overviewRoleNotice` (L181), `#overviewRoleDescription` (L183), `#sec-applications` (L211), `#heading-applications` (L215), `#refreshAppsBtn` (L218), `#appsFilterForm` (L221), `#appsStatusFilter` (L223), `#appsRecFilter` (L234), `#appsSearchInput` (L243), `#appsListState` (L250), `#appsList` (L251), `#appsPager` (L252), `#appsDetailPane` (L254), `#sec-vendors` (L261), `#heading-vendors` (L265), `#refreshVendorsBtn` (L268), `#vendorsFilterForm` (L271), `#vendorsStatusFilter` (L273), `#vendorsOwnershipFilter` (L282), `#vendorsVerifiedFilter` (L291), `#vendorsTownFilter` (L299), `#vendorsSearchInput` (L302), `#vendorsListState` (L309), `#vendorsList` (L310), `#vendorsPager` (L311), `#vendorsDetailPane` (L313), `#sec-accounts` (L320), `#heading-accounts` (L324), `#refreshAccountsBtn` (L327), `#inviteCreateForm` (L332), `#invEmail` (L334), `#invRole` (L337), `#invVendorWrap` (L345), `#invVendorId` (L346), `#invNote` (L351), `#invSubmitBtn` (L354), `#invTopAuthorityNotice` (L357), `#invModElevationNotice` (L360), `#invResultBox` (L363), `#acctInvitationsView` (L371), `#invFilterForm` (L372), `#invStatusFilter` (L374), `#invRoleFilter` (L386), `#invListState` (L397), `#invList` (L398), `#invPager` (L399), `#acctDirectoryView` (L402), `#accountsFilterForm` (L403), `#acctRoleFilter` (L405), `#acctStatusFilter` (L414), `#acctSearchInput` (L421), `#acctListState` (L427), `#acctList` (L428), `#acctPager` (L429), `#acctDetailPane` (L431), `#sec-moderation` (L439), `#heading-moderation` (L443), `#refreshModBtn` (L446), `#modFilterForm` (L455), `#modStatusFilter` (L457), `#modVendorFilter` (L466), `#modAuthorFilter` (L469), `#modReasonFilter` (L472), `#modDateFrom` (L475), `#modDateTo` (L478), `#modSearchInput` (L481), `#modListState` (L488), `#modList` (L489), `#modPager` (L490), `#modDetailPane` (L492), `#sec-issues` (L499), `#heading-issues` (L503), `#refreshIssuesBtn` (L506), `#issuesQueueTabs` (L509), `#issuesFilterForm` (L519), `#issuesStatusFilter` (L521), `#issuesSeverityFilter` (L533), `#issuesUrgencyFilter` (L542), `#issuesReporterTypeFilter` (L552), `#issuesCategoryFilter` (L559), `#issuesVendorFilter` (L578), `#issuesDateFrom` (L581), `#issuesDateTo` (L584), `#issuesOverdueOnly` (L587), `#issuesSearchInput` (L591), `#issuesListState` (L598), `#issuesList` (L599), `#issuesPager` (L600), `#issuesDetailPane` (L602), `#sec-readiness` (L609), `#heading-readiness` (L613), `#refreshReadinessBtn` (L618), `#readinessSummaryStrip` (L622), `#rsUnresolvedCritical` (L623), `#rsPendingDecision` (L624), `#rsNeedsReReview` (L625), `#rsLegallyApproved` (L626), `#rsVisibleTotal` (L627), `#readinessFilterForm` (L634), `#readinessCategoryFilter` (L636), `#readinessStatusFilter` (L647), `#readinessCriticalOnly` (L662), `#readinessSearchInput` (L666), `#readinessListState` (L673), `#readinessList` (L674), `#readinessDetailPane` (L676), `#sec-features` (L683), `#heading-features` (L687), `#refreshFeaturesBtn` (L690), `#fcLiveStatus` (L693), `#fcLiveError` (L694), `#fcRoleAndPropagationCard` (L696), `#fcPropagationNote` (L700), `#fcRolePermissionNote` (L701), `#featuresFilterForm` (L710), `#fcStatusFilter` (L712), `#fcImplFilter` (L722), `#fcSearchInput` (L732), `#featuresLoading` (L737), `#featuresList` (L738), `#fcProtectedEssentialsPanel` (L740), `#fcProtectedList` (L743), `#fcHistoryPanel` (L746), `#fcHistoryWrap` (L748), `#sec-audit` (L753), `#heading-audit` (L757), `#refreshAuditBtn` (L760), `#auditFilterForm` (L763), `#auditActionFilter` (L765), `#auditVendorFilter` (L768), `#auditActorFilter` (L771), `#auditListState` (L776), `#auditList` (L777), `#auditPager` (L778), `#sec-diagnostics` (L782), `#heading-diagnostics` (L786), `#diagCreateSyntheticBtn` (L790), `#diagRunCleanupBtn` (L791), `#refreshDiagnosticsBtn` (L792), `#diagReleaseStrip` (L796), `#diagSummaryRow` (L800), `#diagFilterForm` (L802), `#diagSearchInput` (L804), `#diagWindowFilter` (L807), `#diagSeverityFilter` (L816), `#diagComponentFilter` (L825), `#diagFeatureFilter` (L834), `#diagTriageFilter` (L858), `#diagReleaseFilter` (L868), `#diagIncludeSynthetic` (L871), `#diagListState` (L879), `#diagList` (L880), `#diagPager` (L881), `#diagDetailPane` (L883), `#sec-health` (L890), `#heading-health` (L894), `#refreshHealthBtn` (L897), `#healthContent` (L899), `#aobModal` (L908), `#aobForm` (L909), `#aobModalTitle` (L911), `#aobVendorDisplay` (L914), `#aobReasonInput` (L917), `#aobError` (L919), `#aobCancelBtn` (L921), `#featureConfirmModal` (L928), `#fcConfirmTitle` (L931), `#fcConfirmLead` (L932), `#fcConfirmTransitionSummary` (L933), `#fcConfirmConsequences` (L936), `#fcConfirmReason` (L939), `#fcConfirmError` (L941), `#fcConfirmCancelBtn` (L943), `#fcConfirmSubmitBtn` (L944), `#invActionModal` (L950), `#invActionForm` (L951), `#invActionKicker` (L952), `#invActionTitle` (L953), `#invActionSummary` (L954), `#invActionReason` (L956), `#invActionError` (L958), `#invActionCancelBtn` (L960), `#invActionSubmitBtn` (L961), `#invHistoryModal` (L966), `#invHistoryTitle` (L969), `#invHistoryBody` (L970), `#invHistoryCloseBtn` (L972)

## HTML Document: [public/index.html](../../../public/index.html)

### Screens (10)

| Element ID | Tag | Default Active | Classes | Line |
|---|---|---|---|---:|
| `#discoverScreen` | `<main>` | Yes | `screen active list-mode` | L48 |
| `#communityScreen` | `<main>` | No | `screen page-screen` | L115 |
| `#guidesScreen` | `<main>` | No | `screen page-screen` | L200 |
| `#smartScreen` | `<main>` | No | `screen page-screen` | L212 |
| `#pagerScreen` | `<main>` | No | `screen page-screen` | L214 |
| `#favoritesScreen` | `<main>` | No | `screen page-screen` | L246 |
| `#bookingsScreen` | `<main>` | No | `screen page-screen` | L256 |
| `#ownerScreen` | `<main>` | No | `screen page-screen owner-page` | L262 |
| `#welcomeScreen` | `<main>` | No | `screen page-screen welcome-screen` | L283 |
| `#vendorIntroScreen` | `<main>` | No | `screen page-screen vendor-intro-screen` | L323 |

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

### Script Load Order (14)

1. `https://unpkg.com/leaflet@1.9.4/dist/leaflet.js` *(external CDN)* (L405)
2. `/diagnostics-client.js` (L406)
3. `/auth-client.js` (L407)
4. `/role-experience.js` (L408)
5. `/app.js` (L409)
6. `/listing-highlights.js` (L410)
7. `/pager.js` (L411)
8. `/smart.js` (L412)
9. `/characters.js` (L413)
10. `/coffee-club.js` (L414)
11. `/local-guides.js` (L415)
12. `/guide-passport.js` (L416)
13. `/community.js` (L417)
14. `/street-whispers.js` (L418)

### Inline Event Handlers (128)

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
| L99 | `<button>` | `onclick` | `chooseKind('Farm Stands')` | `chooseKind` |
| L100 | `<button>` | `onclick` | `chooseKind('All');chooseCuisine('Sweets');setMode('list');document.getElementById('resultsHeading').scrollIntoView({block:'start',behavior:'smooth'})` | `chooseCuisine`, `chooseKind`, `document.getElementById`, `setMode` |
| L101 | `<button>` | `onclick` | `chooseKind('Coffee')` | `chooseKind` |
| L103 | `<button>` | `onclick` | `chooseKind('Coffee')` | `chooseKind` |
| L103 | `<button>` | `onclick` | `openDetail('coffee-crooks')` | `openDetail` |
| L103 | `<button>` | `onclick` | `openDetail('coffee-retrograde')` | `openDetail` |
| L105 | `<button>` | `onclick` | `openDetail('coffee-crooks')` | `openDetail` |
| L106 | `<button>` | `onclick` | `openDetail('coffee-avid-petaluma')` | `openDetail` |
| L107 | `<button>` | `onclick` | `openDetail('farm-oakhill')` | `openDetail` |
| L109 | `<button>` | `onclick` | `openSmart('finder')` | `openSmart` |
| L109 | `<button>` | `onclick` | `openSmart('trail')` | `openSmart` |
| L119 | `<button>` | `onclick` | `communityStartPost('review')` | `communityStartPost` |
| L120 | `<button>` | `onclick` | `communityToggleMy()` | `communityToggleMy` |
| L128 | `<button>` | `onclick` | `communityStartPost('review')` | `communityStartPost` |
| L129 | `<button>` | `onclick` | `communityStartPost('tip')` | `communityStartPost` |
| L130 | `<button>` | `onclick` | `communityStartPost('question')` | `communityStartPost` |
| L134 | `<button>` | `onclick` | `communityStartPost('tip','A hidden gem worth finding')` | `communityStartPost` |
| L135 | `<button>` | `onclick` | `communityStartPost('review','My favorite bite here')` | `communityStartPost` |
| L136 | `<button>` | `onclick` | `communityStartPost('tip','A great budget-friendly order')` | `communityStartPost` |
| L137 | `<button>` | `onclick` | `communityStartPost('tip','My local coffee tip')` | `communityStartPost` |
| L138 | `<button>` | `onclick` | `communityStartPost('tip','Weekend market finds')` | `communityStartPost` |
| L139 | `<button>` | `onclick` | `communityStartPost('question','What should I try at this spot?')` | `communityStartPost` |
| L153 | `<button>` | `onclick` | `streetMysteryPick()` | `streetMysteryPick` |
| L154 | `<button>` | `onclick` | `streetNextMission()` | `streetNextMission` |
| L157 | `<button>` | `onclick` | `streetOpenWhisper()` | `streetOpenWhisper` |
| L162 | `<button>` | `onclick` | `communityClosePost()` | `communityClosePost` |
| L164 | `<form#communityPostForm>` | `onsubmit` | `communitySubmitPost(event)` | `communitySubmitPost` |
| L166 | `<select#communityKind>` | `onchange` | `communityKindChange()` | `communityKindChange` |
| L181 | `<button>` | `onclick` | `communitySetFilter('all')` | `communitySetFilter` |
| L182 | `<button>` | `onclick` | `communitySetFilter('review')` | `communitySetFilter` |
| L183 | `<button>` | `onclick` | `communitySetFilter('tip')` | `communitySetFilter` |
| L184 | `<button>` | `onclick` | `communitySetFilter('question')` | `communitySetFilter` |
| L185 | `<button>` | `onclick` | `communitySetFilter('whisper')` | `communitySetFilter` |
| L186 | `<select#communityTownFilter>` | `onchange` | `communityState.town=this.value;communityRender()` | `communityRender` |
| L187 | `<select#communitySort>` | `onchange` | `communityState.sort=this.value;communityRender()` | `communityRender` |
| L188 | `<input#communitySearch>` | `oninput` | `communityState.search=this.value.toLowerCase().trim();communityRender()` | `communityRender`, `this.value.toLowerCase` |
| L193 | `<button>` | `onclick` | `openLocalGuides('passport')` | `openLocalGuides` |
| L194 | `<button>` | `onclick` | `openLocalGuides('stories')` | `openLocalGuides` |
| L195 | `<button>` | `onclick` | `showScreen('discover')` | `showScreen` |
| L202 | `<button>` | `onclick` | `showGuidesTab('passport')` | `showGuidesTab` |
| L202 | `<button>` | `onclick` | `showGuidesTab('stories')` | `showGuidesTab` |
| L202 | `<button>` | `onclick` | `showGuidesTab('photos')` | `showGuidesTab` |
| L203 | `<button>` | `onclick` | `openCommunity()` | `openCommunity` |
| L207 | `<form>` | `onsubmit` | `saveDishPhoto(event)` | `saveDishPhoto` |
| L212 | `<button>` | `onclick` | `openSmart('finder')` | `openSmart` |
| L212 | `<button>` | `onclick` | `openSmart('trail')` | `openSmart` |
| L212 | `<button>` | `onclick` | `openSmart('marketing')` | `openSmart` |
| L223 | `<button>` | `onclick` | `startPagerDemo()` | `startPagerDemo` |
| L230 | `<form>` | `onsubmit` | `joinPager(event)` | `joinPager` |
| L249 | `<input#nearbyAlertToggle>` | `onchange` | `saveNotificationSettings()` | `saveNotificationSettings` |
| L250 | `<select#nearbyAlertRadius>` | `onchange` | `saveNotificationSettings()` | `saveNotificationSettings` |
| L264 | `<button>` | `onclick` | `showScreen('discover')` | `showScreen` |
| L266 | `<select#ownerTruckSelect>` | `onchange` | `selectOwnerTruck(this.value)` | `selectOwnerTruck` |
| L272 | `<button>` | `onclick` | `openSmart('marketing')` | `openSmart` |
| L273 | `<button>` | `onclick` | `openPager();startPagerDemo()` | `openPager`, `startPagerDemo` |
| L273 | `<button>` | `onclick` | `loadKitchen()` | `loadKitchen` |
| L273 | `<form#pagerCreateForm>` | `onsubmit` | `createPager(event)` | `createPager` |
| L273 | `<button>` | `onclick` | `loadKitchen()` | `loadKitchen` |
| L274 | `<button>` | `onclick` | `communityOpenModeration()` | `communityOpenModeration` |
| L275 | `<button#ownerUpdateLocationBtn>` | `onclick` | `updateOwnerLocation()` | `updateOwnerLocation` |
| L276 | `<input#ownerScheduleDate>` | `onchange` | `syncOwnerScheduleDay()` | `syncOwnerScheduleDay` |
| L276 | `<input#ownerIsOpen>` | `onchange` | `toggleOwnerOpenStatus()` | `toggleOwnerOpenStatus` |
| L276 | `<button#ownerSaveScheduleBtn>` | `onclick` | `saveOwnerSchedule()` | `saveOwnerSchedule` |
| L277 | `<input>` | `onchange` | `previewOwnerPhotos(event)` | `previewOwnerPhotos` |
| L278 | `<button#ownerEditProfileBtn>` | `onclick` | `openOwnerProfileModal()` | `openOwnerProfileModal` |
| L278 | `<button>` | `onclick` | `shareOwnerLocation()` | `shareOwnerLocation` |
| L278 | `<button>` | `onclick` | `openBooking(ownerTruckId)` | `openBooking` |
| L279 | `<button>` | `onclick` | `setOwnerRequestFilter('pending')` | `setOwnerRequestFilter` |
| L279 | `<button>` | `onclick` | `setOwnerRequestFilter('accepted')` | `setOwnerRequestFilter` |
| L279 | `<button>` | `onclick` | `setOwnerRequestFilter('all')` | `setOwnerRequestFilter` |
| L368 | `<button>` | `onclick` | `showScreen('discover')` | `showScreen` |
| L369 | `<button>` | `onclick` | `showScreen('favorites')` | `showScreen` |
| L370 | `<button>` | `onclick` | `openBooking()` | `openBooking` |
| L371 | `<button>` | `onclick` | `openLocalGuides('passport')` | `openLocalGuides` |
| L372 | `<button>` | `onclick` | `showScreen('bookings')` | `showScreen` |
| L373 | `<button>` | `onclick` | `surpriseMe()` | `surpriseMe` |
| L377 | `<div#detailModal>` | `onclick` | `if(event.target===this)closeModal()` | `closeModal` |
| L378 | `<div#bookingModal>` | `onclick` | `if(event.target===this)closeBooking()` | `closeBooking` |
| L378 | `<form>` | `onsubmit` | `submitBooking(event)` | `submitBooking` |
| L379 | `<button>` | `onclick` | `closeBooking()` | `closeBooking` |
| L382 | `<select#bookingTruck>` | `onchange` | `onBookingTruckChange()` | `onBookingTruckChange` |
| L383 | `<fieldset>` | `onchange` | `validateBookingChoice()` | `validateBookingChoice` |
| L388 | `<input#eventDate>` | `onchange` | `checkBookingAvailability()` | `checkBookingAvailability` |
| L388 | `<input#guestCount>` | `oninput` | `validateBookingChoice()` | `validateBookingChoice` |
| L393 | `<div#ownerProfileModal>` | `onclick` | `if(event.target===this)closeOwnerProfileModal()` | `closeOwnerProfileModal` |
| L393 | `<form>` | `onsubmit` | `saveOwnerProfile(event)` | `saveOwnerProfile` |
| L394 | `<button>` | `onclick` | `closeOwnerProfileModal()` | `closeOwnerProfileModal` |
| L402 | `<div#distanceModal>` | `onclick` | `if(event.target===this)closeDistanceModal()` | `closeDistanceModal` |
| L402 | `<button>` | `onclick` | `closeDistanceModal()` | `closeDistanceModal` |
| L402 | `<input#distanceRange>` | `oninput` | `setDistance(this.value)` | `setDistance` |
| L402 | `<button>` | `onclick` | `closeDistanceModal();applyFilters()` | `applyFilters`, `closeDistanceModal` |
| L403 | `<div#areaModal>` | `onclick` | `if(event.target===this)closeAreaModal()` | `closeAreaModal` |
| L403 | `<button>` | `onclick` | `closeAreaModal()` | `closeAreaModal` |
| L403 | `<button#areaUseLocationBtn>` | `onclick` | `closeAreaModal();locateMe()` | `closeAreaModal`, `locateMe` |
| L403 | `<button#areaAllSonomaBtn>` | `onclick` | `selectManualArea('')` | `selectManualArea` |
| L403 | `<button>` | `onclick` | `selectManualArea('Santa Rosa')` | `selectManualArea` |
| L403 | `<button>` | `onclick` | `selectManualArea('Petaluma')` | `selectManualArea` |
| L403 | `<button>` | `onclick` | `selectManualArea('Rohnert Park')` | `selectManualArea` |
| L403 | `<button>` | `onclick` | `selectManualArea('Cotati')` | `selectManualArea` |
| L403 | `<button>` | `onclick` | `selectManualArea('Sonoma')` | `selectManualArea` |
| L403 | `<button>` | `onclick` | `selectManualArea('Sebastopol')` | `selectManualArea` |
| L403 | `<button>` | `onclick` | `selectManualArea('Healdsburg')` | `selectManualArea` |

### Static `data-*` Attributes (14)

`data-area-town`, `data-community-filter`, `data-cuisine`, `data-doodle`, `data-guide-tab`, `data-kind`, `data-max`, `data-name`, `data-price`, `data-req-filter`, `data-screen`, `data-smart-tab`, `data-truck-character`, `data-vi-feature`

### Static HTML Element IDs (192)

`#app` (L25), `#locationPillBtn` (L28), `#locationLabel` (L28), `#profileMenu` (L33), `#profileAvatar` (L34), `#profileHeading` (L36), `#profileSub` (L37), `#authSignInLink` (L41), `#authSignOutBtn` (L42), `#discoverScreen` (L48), `#map` (L50), `#mapFallback` (L51), `#mapFallbackStatus` (L53), `#mapFallbackTitle` (L55), `#mapFallbackCopy` (L56), `#mapFallbackListBtn` (L58), `#mapFallbackRetryBtn` (L59), `#mapFallbackHint` (L61), `#mapMode` (L64), `#listMode` (L64), `#searchInput` (L66), `#searchLocateBtn` (L66), `#filters` (L67), `#extraFilters` (L70), `#openNow` (L70), `#distanceFilterBtn` (L70), `#distanceText` (L70), `#refreshCatalogBtn` (L70), `#nearbyCount` (L71), `#coarseAreaBanner` (L72), `#openHoursNote` (L73), `#catalogOfflineNote` (L74), `#mapEmpty` (L76), `#truckSheet` (L77), `#neighborhoodHeading` (L79), `#characterHeroSlogan` (L80), `#resultsHeading` (L92), `#flavorGuide` (L93), `#flavorGuideText` (L93), `#truckCards` (L94), `#discoverExtras` (L95), `#coffeeHeading` (L103), `#streetHeading` (L104), `#smartInvite` (L109), `#communityScreen` (L115), `#communitySuccess` (L123), `#streetSectionTitle` (L145), `#streetQuiz` (L149), `#streetMysteryResult` (L153), `#streetMissionResult` (L154), `#streetFiles` (L158), `#communityCompose` (L161), `#communityPostForm` (L164), `#communityKind` (L166), `#communityNickname` (L167), `#communityPlace` (L169), `#communityRatingRow` (L170), `#communityRating` (L170), `#communityTitle` (L171), `#communityBody` (L172), `#communitySubmit` (L174), `#communityActionMessage` (L174), `#communityMyPosts` (L177), `#communityCount` (L179), `#communityTownFilter` (L186), `#communitySort` (L187), `#communitySearch` (L188), `#communityFeed` (L190), `#guidesScreen` (L200), `#guidePassportSection` (L204), `#guidePassport` (L204), `#guideStories` (L205), `#guideStoryGrid` (L205), `#guidePhotoSection` (L206), `#dishPhotoVendor` (L207), `#dishPhotoCaption` (L207), `#dishPhotoFile` (L207), `#dishPhotoSave` (L207), `#dishPhotoMessage` (L208), `#dishPhotoGrid` (L208), `#smartScreen` (L212), `#smartBody` (L212), `#smartMessage` (L212), `#pagerScreen` (L214), `#pagerRealEntry` (L227), `#pagerCode` (L230), `#pagerMessage` (L233), `#pagerLiveStatus` (L234), `#pagerDisplay` (L236), `#favoritesScreen` (L246), `#nearbyAlertToggle` (L249), `#nearbyAlertMeta` (L249), `#nearbyAlertRadius` (L250), `#favoritesFeedback` (L252), `#favoriteGrid` (L253), `#bookingsScreen` (L256), `#bookingsFeedback` (L258), `#bookingList` (L259), `#ownerScreen` (L262), `#ownerLogo` (L265), `#ownerTitle` (L265), `#ownerSubtitle` (L265), `#ownerTruckSelect` (L266), `#ownerStatusPill` (L266), `#ownerModeBanner` (L268), `#ownerFeedback` (L269), `#statTotalRequests` (L270), `#statPendingRequests` (L270), `#statAcceptedRequests` (L270), `#kitchenPanel` (L273), `#pagerCreateForm` (L273), `#pagerVendor` (L273), `#pagerTicket` (L273), `#pagerCreateButton` (L273), `#kitchenMessage` (L273), `#kitchenQueue` (L273), `#ownerModerationCard` (L274), `#communityModeration` (L274), `#ownerPinEmoji` (L275), `#ownerLocation` (L275), `#ownerLat` (L275), `#ownerLng` (L275), `#ownerLocationTtl` (L275), `#ownerUpdateLocationBtn` (L275), `#ownerLocationMsg` (L275), `#ownerScheduleDate` (L276), `#ownerScheduleWeekday` (L276), `#ownerOpensAt` (L276), `#ownerClosesAt` (L276), `#ownerIsOpen` (L276), `#ownerSaveScheduleBtn` (L276), `#ownerScheduleMsg` (L276), `#ownerScheduleList` (L276), `#ownerPhotoGrid` (L277), `#ownerPhotoMsg` (L277), `#ownerEditProfileBtn` (L278), `#ownerEditProfileSub` (L278), `#ownerRequestCount` (L279), `#ownerRequests` (L279), `#welcomeScreen` (L283), `#welcomeHeading` (L287), `#welcomeCustomerBtn` (L290), `#welcomeVendorBtn` (L298), `#welcomeRememberChoice` (L308), `#welcomeJustBrowseBtn` (L315), `#welcomeSignInLink` (L316), `#welcomeFeedbackMsg` (L318), `#vendorIntroScreen` (L323), `#viBackToBrowseBtn` (L326), `#viRememberedBadge` (L327), `#viForgetPrefBtn` (L329), `#vendorIntroHeading` (L334), `#viCapabilitiesList` (L336), `#viOnboardingPausedNotice` (L345), `#viListingPickerWrap` (L346), `#viListingSearch` (L349), `#viListingSelect` (L350), `#viClaimBusinessBtn` (L356), `#viAddBusinessBtn` (L357), `#viManageSignInLink` (L360), `#viJustExploreBtn` (L361), `#detailModal` (L377), `#detailContent` (L377), `#bookingModal` (L378), `#bookingModalTitle` (L379), `#bookingTruckLabel` (L379), `#bookingAuthNotice` (L381), `#bookingTruck` (L382), `#eventType` (L387), `#eventDate` (L388), `#guestCount` (L388), `#eventLocation` (L389), `#eventNote` (L389), `#bookingError` (L390), `#bookingSubmitBtn` (L391), `#ownerProfileModal` (L393), `#ownerProfileModalTitle` (L394), `#ownerProfileName` (L395), `#ownerProfileCuisine` (L396), `#ownerProfileBio` (L397), `#ownerAcceptingBookings` (L398), `#ownerProfileError` (L399), `#ownerProfileSaveBtn` (L400), `#distanceModal` (L402), `#distanceModalTitle` (L402), `#distanceRange` (L402), `#rangeValue` (L402), `#areaModal` (L403), `#areaModalTitle` (L403), `#areaUseLocationBtn` (L403), `#areaAllSonomaBtn` (L403), `#toast` (L404)

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
| `cookie` | `:expr=; Path=/; Max-Age=0; Expir` | `write` | `public/role-experience.js:L40` |
| `cookie` | `<dynamic>` | `write` | `public/role-experience.js:L83` |
| `cookie` | `truckly_debug_role` | `write` | `scripts/dev-workbench/debug-admin.js:L123` |
| `IndexedDB` | `truckly-dish-notebook-v1` | `open` | `public/local-guides.js:L39` |
| `localStorage` | `<constant_or_var>` | `getItem, removeItem, setItem` | `public/app.js:L108`, `public/app.js:L128`, `scripts/dev-workbench/debug-admin.js:L13`, `scripts/dev-workbench/debug-admin.js:L21` |
| `localStorage` | `truckly_bookings` | `removeItem` | `public/app.js:L1707`, `public/app.js:L1775`, `public/auth-client.js:L24` |
| `localStorage` | `truckly_catalog` | `removeItem` | `public/app.js:L423` |
| `localStorage` | `truckly_catalog_v2` | `safeJSON, setItem` | `public/app.js:L424`, `public/app.js:L980` |
| `localStorage` | `truckly_favs` | `removeItem, safeJSON, safeStorageSet` | `public/app.js:L1655`, `public/app.js:L1661`, `public/app.js:L1704`, `public/app.js:L1776` |
| `localStorage` | `truckly_favs_scope` | `getItem, removeItem, safeStorageSet` | `public/app.js:L1632`, `public/app.js:L1656`, `public/app.js:L1662`, `public/app.js:L1702` |
| `localStorage` | `truckly_guide_passport_v1` | `getItem, setItem` | `public/guide-passport.js:L10`, `public/guide-passport.js:L5` |
| `localStorage` | `truckly_notify` | `removeItem, safeJSON, safeStorageSet` | `public/app.js:L1778`, `public/app.js:L2028`, `public/app.js:L2050`, `public/app.js:L2084` |
| `localStorage` | `truckly_owner_profile` | `removeItem, safeJSON, safeStorageSet` | `public/app.js:L1780`, `public/app.js:L2870`, `public/app.js:L3650`, `public/auth-client.js:L29` |
| `localStorage` | `truckly_owner_schedule` | `removeItem, safeJSON, safeStorageSet` | `public/app.js:L1781`, `public/app.js:L2878`, `public/app.js:L3546`, `public/auth-client.js:L30` |
| `localStorage` | `truckly_owner_truck_id` | `getItem, removeItem, setItem` | `public/app.js:L1779`, `public/app.js:L2863`, `public/app.js:L3048`, `public/auth-client.js:L28` |
| `localStorage` | `truckly_pager_subs_v1` | `getItem, setItem` | `public/pager.js:L21`, `public/pager.js:L42` |
| `sessionStorage` | `biteshark_admin_viewpoint_v1` | `getItem, removeItem, setItem` | `public/admin.js:L318`, `public/admin.js:L319`, `public/auth-client.js:L23`, `public/role-experience.js:L1041` |
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
| [public/guide-passport.css](../../../public/guide-passport.css) | 2 | 3 | 0 |
| [public/layout-polish.css](../../../public/layout-polish.css) | 5 | 3 | 0 |
| [public/local-guides.css](../../../public/local-guides.css) | 4 | 3 | 0 |
| [public/mobile-scroll-fix.css](../../../public/mobile-scroll-fix.css) | 2 | 5 | 17 |
| [public/neighborhood.css](../../../public/neighborhood.css) | 18 | 3 | 0 |
| [public/pager-experience.css](../../../public/pager-experience.css) | 0 | 2 | 1 |
| [public/pager.css](../../../public/pager.css) | 0 | 3 | 1 |
| [public/policies/policies.css](../../../public/policies/policies.css) | 14 | 1 | 0 |
| [public/role-experience.css](../../../public/role-experience.css) | 0 | 3 | 6 |
| [public/smart.css](../../../public/smart.css) | 0 | 1 | 0 |
| [public/street-whispers.css](../../../public/street-whispers.css) | 0 | 3 | 2 |
| [public/theme.css](../../../public/theme.css) | 26 | 4 | 11 |
| [scripts/dev-workbench/debug-admin.css](../../../scripts/dev-workbench/debug-admin.css) | 0 | 1 | 1 |
