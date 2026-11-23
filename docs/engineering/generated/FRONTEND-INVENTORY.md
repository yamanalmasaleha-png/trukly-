# Code Registry — Frontend Screens, DOM, Storage & CSS Inventory

> [!NOTE]
> **Machine-Generated Reference Inventory** — Do not hand-edit. Regenerate via `npm run registry:docs` (`node tools/code-registry/cli.mjs generate-docs`).
> - **Repository**: `https://github.com/yamanalmasaleha-png/trukly-`
> - **Provenance Mode**: `committed_source_digest` *(branch/detached-HEAD invariant; commit-bound runs use `npm run registry:scan -- --include-timestamp`)*
> - **Generator**: `biteshark-code-registry@2.0.0` (`biteshark.code-registry.v2`)
> - **Source Analysis Digest**: `83af83f9b4eaab27410a8f676064af9ae54aa5ef700bb9025620190caaabcc20`
> - **Analysis Scope & Limits**: Static AST, HTML, CSS, and SQL analysis without executing application modules. Relationships distinguish confirmed_static, documented_wrapper, inferred_candidate, and dynamic_unresolved; static analysis does not prove runtime behavioral correctness.

## HTML Document: [public/admin.html](../../../public/admin.html)

### Stylesheet Load Order (1)

1. `/admin.css` (L12)

### Script Load Order (3)

1. `/diagnostics-client.js` (L1001)
2. `/auth-client.js` (L1002)
3. `/admin.js` (L1003)

### Static `data-*` Attributes (6)

`data-acct-tab`, `data-goto`, `data-iss-queue`, `data-mod-queue`, `data-section`, `data-subfilter`

### Static HTML Element IDs (238)

`#adminShell` (L15), `#adminRoleBadge` (L32), `#vpCustomerPreviewBtn` (L38), `#vpTestCustomerBtn` (L39), `#vpVendorSelect` (L41), `#vpVendorPreviewBtn` (L44), `#vpActOnBehalfBtn` (L45), `#adminUserEmail` (L51), `#adminUserSub` (L52), `#adminSignOutBtn` (L55), `#badgeApplications` (L68), `#badgeVendors` (L73), `#badgeInvitations` (L78), `#badgeModeration` (L83), `#badgeIssues` (L88), `#badgeReadiness` (L93), `#badgeFeatures` (L98), `#badgeDiagnostics` (L107), `#adminMain` (L115), `#adminLaunchReminderBanner` (L116), `#launchReminderHeadline` (L119), `#launchReminderSubnote` (L120), `#launchReminderOpenReadinessBtn` (L123), `#adminGlobalBanner` (L128), `#sec-overview` (L131), `#heading-overview` (L135), `#refreshOverviewBtn` (L138), `#overviewLoading` (L141), `#overviewError` (L142), `#overviewCards` (L144), `#ovPendingApps` (L147), `#ovModRecApps` (L148), `#ovPendingInvites` (L152), `#ovFlaggedComments` (L157), `#ovCommentsBreakdown` (L158), `#ovOpenIssues` (L162), `#ovOverdueIssues` (L163), `#ovRestrictedVendors` (L167), `#ovVendorsBreakdown` (L168), `#ovReadinessCard` (L170), `#ovUnresolvedReadiness` (L172), `#ovReadinessSub` (L173), `#ovHealthStatus` (L177), `#ovHealthSub` (L178), `#overviewRoleNotice` (L182), `#overviewRoleDescription` (L184), `#sec-applications` (L212), `#heading-applications` (L216), `#refreshAppsBtn` (L219), `#appsFilterForm` (L222), `#appsStatusFilter` (L224), `#appsRecFilter` (L235), `#appsSearchInput` (L244), `#appsListState` (L251), `#appsList` (L252), `#appsPager` (L253), `#appsDetailPane` (L255), `#sec-vendors` (L262), `#heading-vendors` (L266), `#refreshVendorsBtn` (L269), `#vendorsFilterForm` (L272), `#vendorsStatusFilter` (L274), `#vendorsOwnershipFilter` (L283), `#vendorsVerifiedFilter` (L292), `#vendorsTownFilter` (L300), `#vendorsSearchInput` (L303), `#vendorsListState` (L310), `#vendorsList` (L311), `#vendorsPager` (L312), `#vendorsDetailPane` (L314), `#sec-accounts` (L321), `#heading-accounts` (L325), `#refreshAccountsBtn` (L328), `#testCustomerSandboxPanel` (L331), `#testCustomerStatusLine` (L336), `#tcOpenProfileBtn` (L340), `#tcOpenDiscoverBtn` (L341), `#tcSeedSampleBtn` (L342), `#tcResetDataBtn` (L343), `#tcExitSessionBtn` (L344), `#inviteCreateForm` (L350), `#invEmail` (L352), `#invRole` (L355), `#invVendorWrap` (L363), `#invVendorId` (L364), `#invNote` (L369), `#invSubmitBtn` (L372), `#invTopAuthorityNotice` (L375), `#invModElevationNotice` (L378), `#invResultBox` (L381), `#acctInvitationsView` (L389), `#invFilterForm` (L390), `#invStatusFilter` (L392), `#invRoleFilter` (L404), `#invListState` (L415), `#invList` (L416), `#invPager` (L417), `#acctDirectoryView` (L420), `#accountsFilterForm` (L421), `#acctRoleFilter` (L423), `#acctStatusFilter` (L432), `#acctSearchInput` (L439), `#acctListState` (L445), `#acctList` (L446), `#acctPager` (L447), `#acctDetailPane` (L449), `#sec-moderation` (L457), `#heading-moderation` (L461), `#refreshModBtn` (L464), `#modFilterForm` (L474), `#modStatusFilter` (L476), `#modVendorFilter` (L485), `#modAuthorFilter` (L488), `#modReasonFilter` (L491), `#modDateFrom` (L494), `#modDateTo` (L497), `#modSearchInput` (L500), `#modListState` (L507), `#modList` (L508), `#modPager` (L509), `#modDetailPane` (L511), `#sec-issues` (L518), `#heading-issues` (L522), `#refreshIssuesBtn` (L525), `#issuesQueueTabs` (L528), `#issuesFilterForm` (L538), `#issuesStatusFilter` (L540), `#issuesSeverityFilter` (L552), `#issuesUrgencyFilter` (L561), `#issuesReporterTypeFilter` (L571), `#issuesCategoryFilter` (L578), `#issuesVendorFilter` (L597), `#issuesDateFrom` (L600), `#issuesDateTo` (L603), `#issuesOverdueOnly` (L606), `#issuesSearchInput` (L610), `#issuesListState` (L617), `#issuesList` (L618), `#issuesPager` (L619), `#issuesDetailPane` (L621), `#sec-readiness` (L628), `#heading-readiness` (L632), `#refreshReadinessBtn` (L637), `#readinessSummaryStrip` (L641), `#rsUnresolvedCritical` (L642), `#rsPendingDecision` (L643), `#rsNeedsReReview` (L644), `#rsLegallyApproved` (L645), `#rsVisibleTotal` (L646), `#readinessFilterForm` (L653), `#readinessCategoryFilter` (L655), `#readinessStatusFilter` (L666), `#readinessCriticalOnly` (L681), `#readinessSearchInput` (L685), `#readinessListState` (L692), `#readinessList` (L693), `#readinessDetailPane` (L695), `#sec-features` (L702), `#heading-features` (L706), `#refreshFeaturesBtn` (L709), `#fcLiveStatus` (L712), `#fcLiveError` (L713), `#fcRoleAndPropagationCard` (L715), `#fcPropagationNote` (L719), `#fcRolePermissionNote` (L720), `#featuresFilterForm` (L729), `#fcStatusFilter` (L731), `#fcImplFilter` (L741), `#fcSearchInput` (L751), `#featuresLoading` (L756), `#featuresList` (L757), `#fcProtectedEssentialsPanel` (L759), `#fcProtectedList` (L762), `#fcHistoryPanel` (L765), `#fcHistoryWrap` (L767), `#sec-audit` (L772), `#heading-audit` (L776), `#refreshAuditBtn` (L779), `#auditFilterForm` (L782), `#auditActionFilter` (L784), `#auditVendorFilter` (L787), `#auditActorFilter` (L790), `#auditListState` (L795), `#auditList` (L796), `#auditPager` (L797), `#sec-diagnostics` (L801), `#heading-diagnostics` (L805), `#diagCreateSyntheticBtn` (L809), `#diagRunCleanupBtn` (L810), `#refreshDiagnosticsBtn` (L811), `#diagReleaseStrip` (L815), `#diagSummaryRow` (L819), `#diagFilterForm` (L821), `#diagSearchInput` (L823), `#diagWindowFilter` (L826), `#diagSeverityFilter` (L835), `#diagComponentFilter` (L844), `#diagFeatureFilter` (L853), `#diagTriageFilter` (L882), `#diagReleaseFilter` (L892), `#diagIncludeSynthetic` (L895), `#diagListState` (L903), `#diagList` (L904), `#diagPager` (L905), `#diagDetailPane` (L907), `#sec-health` (L914), `#heading-health` (L918), `#refreshHealthBtn` (L921), `#healthContent` (L923), `#aobModal` (L932), `#aobForm` (L933), `#aobModalTitle` (L935), `#aobVendorDisplay` (L938), `#aobReasonInput` (L941), `#aobError` (L943), `#aobCancelBtn` (L945), `#featureConfirmModal` (L952), `#fcConfirmTitle` (L955), `#fcConfirmLead` (L956), `#fcConfirmTransitionSummary` (L957), `#fcConfirmConsequences` (L960), `#fcConfirmReason` (L963), `#fcConfirmError` (L965), `#fcConfirmCancelBtn` (L967), `#fcConfirmSubmitBtn` (L968), `#invActionModal` (L974), `#invActionForm` (L975), `#invActionKicker` (L976), `#invActionTitle` (L977), `#invActionSummary` (L978), `#invActionReason` (L980), `#invActionError` (L982), `#invActionCancelBtn` (L984), `#invActionSubmitBtn` (L985), `#invHistoryModal` (L990), `#invHistoryTitle` (L993), `#invHistoryBody` (L994), `#invHistoryCloseBtn` (L996)

## HTML Document: [public/index.html](../../../public/index.html)

### Screens (11)

| Element ID | Tag | Default Active | Classes | Line |
|---|---|---|---|---:|
| `#discoverScreen` | `<main>` | Yes | `screen active list-mode` | L49 |
| `#communityScreen` | `<main>` | No | `screen page-screen` | L118 |
| `#guidesScreen` | `<main>` | No | `screen page-screen` | L203 |
| `#smartScreen` | `<main>` | No | `screen page-screen` | L248 |
| `#pagerScreen` | `<main>` | No | `screen page-screen` | L264 |
| `#favoritesScreen` | `<main>` | No | `screen page-screen` | L296 |
| `#bookingsScreen` | `<main>` | No | `screen page-screen` | L306 |
| `#ownerScreen` | `<main>` | No | `screen page-screen owner-page` | L312 |
| `#welcomeScreen` | `<main>` | No | `screen page-screen welcome-screen` | L333 |
| `#vendorIntroScreen` | `<main>` | No | `screen page-screen vendor-intro-screen` | L373 |
| `#profileScreen` | `<main>` | No | `screen page-screen` | L417 |

### Stylesheet Load Order (17)

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
17. `/customer-profile.css` (L23)

### Script Load Order (19)

1. `https://unpkg.com/leaflet@1.9.4/dist/leaflet.js` *(external CDN)* (L459)
2. `/diagnostics-client.js` (L460)
3. `/auth-client.js` (L461)
4. `/exploration-client.js` (L462)
5. `/profile-client.js` (L463)
6. `/role-experience.js` (L464)
7. `/app.js` (L465)
8. `/listing-highlights.js` (L466)
9. `/pager.js` (L467)
10. `/smart.js` (L468)
11. `/characters.js` (L469)
12. `/coffee-club.js` (L470)
13. `/local-guides.js` (L471)
14. `/guide-passport.js` (L472)
15. `/community.js` (L473)
16. `/street-whispers.js` (L474)
17. `/customer-profile.js` (L475)
18. `/greatest-hits.js` (L476)
19. `/greatest-hits-sharing.js` (L477)

### Inline Event Handlers (122)

| Line | Tag / ID | Attribute | Expression | Called Functions |
|---:|---|---|---|---|
| L28 | `<button>` | `onclick` | `showScreen('owner')` | `showScreen` |
| L29 | `<button#locationPillBtn>` | `onclick` | `openAreaPicker()` | `openAreaPicker` |
| L31 | `<button>` | `onclick` | `openLocalGuides()` | `openLocalGuides` |
| L32 | `<button>` | `onclick` | `openPager()` | `openPager` |
| L33 | `<button>` | `onclick` | `showScreen('discover')` | `showScreen` |
| L39 | `<button>` | `onclick` | `showScreen('favorites');this.closest('details').open=false` | `showScreen`, `this.closest` |
| L40 | `<button>` | `onclick` | `showScreen('bookings');this.closest('details').open=false` | `showScreen`, `this.closest` |
| L41 | `<button>` | `onclick` | `this.closest('details').open=false;openCommunity()` | `openCommunity`, `this.closest` |
| L43 | `<button#authSignOutBtn>` | `onclick` | `signOutUser();this.closest('details').open=false` | `signOutUser`, `this.closest` |
| L59 | `<button#mapFallbackListBtn>` | `onclick` | `continueInListFromMapFallback()` | `continueInListFromMapFallback` |
| L60 | `<button#mapFallbackRetryBtn>` | `onclick` | `retryInteractiveMap()` | `retryInteractiveMap` |
| L65 | `<button#mapMode>` | `onclick` | `setMode('map')` | `setMode` |
| L65 | `<button#listMode>` | `onclick` | `setMode('list')` | `setMode` |
| L67 | `<input#searchInput>` | `oninput` | `applyFilters()` | `applyFilters` |
| L67 | `<button#searchLocateBtn>` | `onclick` | `locateMe()` | `locateMe` |
| L71 | `<button#openNow>` | `onclick` | `toggleOpen()` | `toggleOpen` |
| L71 | `<button#distanceFilterBtn>` | `onclick` | `openDistance()` | `openDistance` |
| L71 | `<button#refreshCatalogBtn>` | `onclick` | `refreshDiscoveryCatalog({fresh:true,announce:true})` | `refreshDiscoveryCatalog` |
| L80 | `<button>` | `onclick` | `surpriseMe()` | `surpriseMe` |
| L83 | `<button>` | `onclick` | `openCommunity()` | `openCommunity` |
| L85 | `<button>` | `onclick` | `chooseKind('All')` | `chooseKind` |
| L86 | `<button>` | `onclick` | `chooseKind('Pop-ups')` | `chooseKind` |
| L87 | `<button>` | `onclick` | `chooseKind('Markets')` | `chooseKind` |
| L88 | `<button>` | `onclick` | `chooseKind('Food Trucks')` | `chooseKind` |
| L89 | `<button>` | `onclick` | `chooseKind('Coffee')` | `chooseKind` |
| L90 | `<button>` | `onclick` | `chooseKind('Farm Stands')` | `chooseKind` |
| L100 | `<button#discoverOpenTrailsBtn>` | `onclick` | `openSmart('trail')` | `openSmart` |
| L107 | `<button>` | `onclick` | `chooseKind('Farm Stands')` | `chooseKind` |
| L108 | `<button>` | `onclick` | `chooseKind('All');chooseCuisine('Sweets');setMode('list');document.getElementById('resultsHeading').scrollIntoView({block:'start',behavior:'smooth'})` | `chooseCuisine`, `chooseKind`, `document.getElementById`, `setMode` |
| L109 | `<button>` | `onclick` | `chooseKind('Coffee')` | `chooseKind` |
| L112 | `<button>` | `onclick` | `openSmart('finder')` | `openSmart` |
| L112 | `<button>` | `onclick` | `openSmart('trail')` | `openSmart` |
| L122 | `<button>` | `onclick` | `communityStartPost('review')` | `communityStartPost` |
| L123 | `<button>` | `onclick` | `communityToggleMy()` | `communityToggleMy` |
| L131 | `<button>` | `onclick` | `communityStartPost('review')` | `communityStartPost` |
| L132 | `<button>` | `onclick` | `communityStartPost('tip')` | `communityStartPost` |
| L133 | `<button>` | `onclick` | `communityStartPost('question')` | `communityStartPost` |
| L137 | `<button>` | `onclick` | `communityStartPost('tip','A hidden gem worth finding')` | `communityStartPost` |
| L138 | `<button>` | `onclick` | `communityStartPost('review','My favorite bite here')` | `communityStartPost` |
| L139 | `<button>` | `onclick` | `communityStartPost('tip','A great budget-friendly order')` | `communityStartPost` |
| L140 | `<button>` | `onclick` | `communityStartPost('tip','My local coffee tip')` | `communityStartPost` |
| L141 | `<button>` | `onclick` | `communityStartPost('tip','Weekend market finds')` | `communityStartPost` |
| L142 | `<button>` | `onclick` | `communityStartPost('question','What should I try at this spot?')` | `communityStartPost` |
| L156 | `<button>` | `onclick` | `streetMysteryPick()` | `streetMysteryPick` |
| L157 | `<button>` | `onclick` | `streetNextMission()` | `streetNextMission` |
| L160 | `<button>` | `onclick` | `streetOpenWhisper()` | `streetOpenWhisper` |
| L165 | `<button>` | `onclick` | `communityClosePost()` | `communityClosePost` |
| L167 | `<form#communityPostForm>` | `onsubmit` | `communitySubmitPost(event)` | `communitySubmitPost` |
| L169 | `<select#communityKind>` | `onchange` | `communityKindChange()` | `communityKindChange` |
| L184 | `<button>` | `onclick` | `communitySetFilter('all')` | `communitySetFilter` |
| L185 | `<button>` | `onclick` | `communitySetFilter('review')` | `communitySetFilter` |
| L186 | `<button>` | `onclick` | `communitySetFilter('tip')` | `communitySetFilter` |
| L187 | `<button>` | `onclick` | `communitySetFilter('question')` | `communitySetFilter` |
| L188 | `<button>` | `onclick` | `communitySetFilter('whisper')` | `communitySetFilter` |
| L189 | `<select#communityTownFilter>` | `onchange` | `communityState.town=this.value;communityRender()` | `communityRender` |
| L190 | `<select#communitySort>` | `onchange` | `communityState.sort=this.value;communityRender()` | `communityRender` |
| L191 | `<input#communitySearch>` | `oninput` | `communityState.search=this.value.toLowerCase().trim();communityRender()` | `communityRender`, `this.value.toLowerCase` |
| L196 | `<button>` | `onclick` | `openLocalGuides('passport')` | `openLocalGuides` |
| L197 | `<button>` | `onclick` | `openLocalGuides('stories')` | `openLocalGuides` |
| L198 | `<button>` | `onclick` | `showScreen('discover')` | `showScreen` |
| L210 | `<button#guidesOpenTrailsBtn>` | `onclick` | `openSmart('trail')` | `openSmart` |
| L213 | `<button#guideTabPassport>` | `onclick` | `showGuidesTab('passport')` | `showGuidesTab` |
| L214 | `<button#guideTabStories>` | `onclick` | `showGuidesTab('stories')` | `showGuidesTab` |
| L215 | `<button#guideTabPhotos>` | `onclick` | `showGuidesTab('photos')` | `showGuidesTab` |
| L232 | `<form>` | `onsubmit` | `saveDishPhoto(event)` | `saveDishPhoto` |
| L257 | `<button>` | `onclick` | `openSmart('trail')` | `openSmart` |
| L258 | `<button>` | `onclick` | `openSmart('finder')` | `openSmart` |
| L273 | `<button>` | `onclick` | `startPagerDemo()` | `startPagerDemo` |
| L280 | `<form>` | `onsubmit` | `joinPager(event)` | `joinPager` |
| L299 | `<input#nearbyAlertToggle>` | `onchange` | `saveNotificationSettings()` | `saveNotificationSettings` |
| L300 | `<select#nearbyAlertRadius>` | `onchange` | `saveNotificationSettings()` | `saveNotificationSettings` |
| L314 | `<button>` | `onclick` | `showScreen('discover')` | `showScreen` |
| L316 | `<select#ownerTruckSelect>` | `onchange` | `selectOwnerTruck(this.value)` | `selectOwnerTruck` |
| L322 | `<button>` | `onclick` | `openOwnerMarketingKit()` | `openOwnerMarketingKit` |
| L323 | `<button>` | `onclick` | `openPager();startPagerDemo()` | `openPager`, `startPagerDemo` |
| L323 | `<button>` | `onclick` | `loadKitchen()` | `loadKitchen` |
| L323 | `<form#pagerCreateForm>` | `onsubmit` | `createPager(event)` | `createPager` |
| L323 | `<button>` | `onclick` | `loadKitchen()` | `loadKitchen` |
| L324 | `<button>` | `onclick` | `communityOpenModeration()` | `communityOpenModeration` |
| L325 | `<button#ownerUpdateLocationBtn>` | `onclick` | `updateOwnerLocation()` | `updateOwnerLocation` |
| L326 | `<input#ownerScheduleDate>` | `onchange` | `syncOwnerScheduleDay()` | `syncOwnerScheduleDay` |
| L326 | `<input#ownerIsOpen>` | `onchange` | `toggleOwnerOpenStatus()` | `toggleOwnerOpenStatus` |
| L326 | `<button#ownerSaveScheduleBtn>` | `onclick` | `saveOwnerSchedule()` | `saveOwnerSchedule` |
| L327 | `<input>` | `onchange` | `previewOwnerPhotos(event)` | `previewOwnerPhotos` |
| L328 | `<button#ownerEditProfileBtn>` | `onclick` | `openOwnerProfileModal()` | `openOwnerProfileModal` |
| L328 | `<button>` | `onclick` | `shareOwnerLocation()` | `shareOwnerLocation` |
| L328 | `<button>` | `onclick` | `openBooking(ownerTruckId)` | `openBooking` |
| L329 | `<button>` | `onclick` | `setOwnerRequestFilter('pending')` | `setOwnerRequestFilter` |
| L329 | `<button>` | `onclick` | `setOwnerRequestFilter('accepted')` | `setOwnerRequestFilter` |
| L329 | `<button>` | `onclick` | `setOwnerRequestFilter('all')` | `setOwnerRequestFilter` |
| L422 | `<button>` | `onclick` | `showScreen('discover')` | `showScreen` |
| L423 | `<button>` | `onclick` | `showScreen('favorites')` | `showScreen` |
| L424 | `<button>` | `onclick` | `openBooking()` | `openBooking` |
| L425 | `<button>` | `onclick` | `openLocalGuides('passport')` | `openLocalGuides` |
| L426 | `<button>` | `onclick` | `showScreen('bookings')` | `showScreen` |
| L427 | `<button>` | `onclick` | `surpriseMe()` | `surpriseMe` |
| L431 | `<div#detailModal>` | `onclick` | `if(event.target===this)closeModal()` | `closeModal` |
| L432 | `<div#bookingModal>` | `onclick` | `if(event.target===this)closeBooking()` | `closeBooking` |
| L432 | `<form>` | `onsubmit` | `submitBooking(event)` | `submitBooking` |
| L433 | `<button>` | `onclick` | `closeBooking()` | `closeBooking` |
| L436 | `<select#bookingTruck>` | `onchange` | `onBookingTruckChange()` | `onBookingTruckChange` |
| L437 | `<fieldset>` | `onchange` | `validateBookingChoice()` | `validateBookingChoice` |
| L442 | `<input#eventDate>` | `onchange` | `checkBookingAvailability()` | `checkBookingAvailability` |
| L442 | `<input#guestCount>` | `oninput` | `validateBookingChoice()` | `validateBookingChoice` |
| L447 | `<div#ownerProfileModal>` | `onclick` | `if(event.target===this)closeOwnerProfileModal()` | `closeOwnerProfileModal` |
| L447 | `<form>` | `onsubmit` | `saveOwnerProfile(event)` | `saveOwnerProfile` |
| L448 | `<button>` | `onclick` | `closeOwnerProfileModal()` | `closeOwnerProfileModal` |
| L456 | `<div#distanceModal>` | `onclick` | `if(event.target===this)closeDistanceModal()` | `closeDistanceModal` |
| L456 | `<button>` | `onclick` | `closeDistanceModal()` | `closeDistanceModal` |
| L456 | `<input#distanceRange>` | `oninput` | `setDistance(this.value)` | `setDistance` |
| L456 | `<button>` | `onclick` | `closeDistanceModal();applyFilters()` | `applyFilters`, `closeDistanceModal` |
| L457 | `<div#areaModal>` | `onclick` | `if(event.target===this)closeAreaModal()` | `closeAreaModal` |
| L457 | `<button>` | `onclick` | `closeAreaModal()` | `closeAreaModal` |
| L457 | `<button#areaUseLocationBtn>` | `onclick` | `closeAreaModal();locateMe()` | `closeAreaModal`, `locateMe` |
| L457 | `<button#areaAllSonomaBtn>` | `onclick` | `selectManualArea('')` | `selectManualArea` |
| L457 | `<button>` | `onclick` | `selectManualArea('Santa Rosa')` | `selectManualArea` |
| L457 | `<button>` | `onclick` | `selectManualArea('Petaluma')` | `selectManualArea` |
| L457 | `<button>` | `onclick` | `selectManualArea('Rohnert Park')` | `selectManualArea` |
| L457 | `<button>` | `onclick` | `selectManualArea('Cotati')` | `selectManualArea` |
| L457 | `<button>` | `onclick` | `selectManualArea('Sonoma')` | `selectManualArea` |
| L457 | `<button>` | `onclick` | `selectManualArea('Sebastopol')` | `selectManualArea` |
| L457 | `<button>` | `onclick` | `selectManualArea('Healdsburg')` | `selectManualArea` |

### Static `data-*` Attributes (14)

`data-area-town`, `data-community-filter`, `data-cuisine`, `data-doodle`, `data-guide-tab`, `data-kind`, `data-max`, `data-name`, `data-price`, `data-req-filter`, `data-screen`, `data-smart-tab`, `data-truck-character`, `data-vi-feature`

### Static HTML Element IDs (205)

`#app` (L26), `#locationPillBtn` (L29), `#locationLabel` (L29), `#profileMenu` (L34), `#profileAvatar` (L35), `#profileHeading` (L37), `#profileSub` (L38), `#authSignInLink` (L42), `#authSignOutBtn` (L43), `#discoverScreen` (L49), `#map` (L51), `#mapFallback` (L52), `#mapFallbackStatus` (L54), `#mapFallbackTitle` (L56), `#mapFallbackCopy` (L57), `#mapFallbackListBtn` (L59), `#mapFallbackRetryBtn` (L60), `#mapFallbackHint` (L62), `#mapMode` (L65), `#listMode` (L65), `#searchInput` (L67), `#searchLocateBtn` (L67), `#filters` (L68), `#extraFilters` (L71), `#openNow` (L71), `#distanceFilterBtn` (L71), `#distanceText` (L71), `#refreshCatalogBtn` (L71), `#nearbyCount` (L72), `#coarseAreaBanner` (L73), `#openHoursNote` (L74), `#catalogOfflineNote` (L75), `#mapEmpty` (L77), `#truckSheet` (L78), `#neighborhoodHeading` (L80), `#characterHeroSlogan` (L81), `#resultsHeading` (L93), `#flavorGuide` (L94), `#flavorGuideText` (L94), `#discoverSuggestedTrailsBar` (L95), `#discoverOpenTrailsBtn` (L100), `#truckCards` (L102), `#discoverExtras` (L103), `#discoverStoriesStrip` (L111), `#smartInvite` (L112), `#communityScreen` (L118), `#communitySuccess` (L126), `#streetSectionTitle` (L148), `#streetQuiz` (L152), `#streetMysteryResult` (L156), `#streetMissionResult` (L157), `#streetFiles` (L161), `#communityCompose` (L164), `#communityPostForm` (L167), `#communityKind` (L169), `#communityNickname` (L170), `#communityPlace` (L172), `#communityRatingRow` (L173), `#communityRating` (L173), `#communityTitle` (L174), `#communityBody` (L175), `#communitySubmit` (L177), `#communityActionMessage` (L177), `#communityMyPosts` (L180), `#communityCount` (L182), `#communityTownFilter` (L189), `#communitySort` (L190), `#communitySearch` (L191), `#communityFeed` (L193), `#guidesScreen` (L203), `#guidesOpenTrailsBtn` (L210), `#guideTabPassport` (L213), `#guideTabStories` (L214), `#guideTabPhotos` (L215), `#guidePassportSection` (L217), `#guidePassport` (L217), `#guideStories` (L218), `#guideStoryGrid` (L220), `#guidePhotoSection` (L222), `#dishPhotoCountBadge` (L228), `#guidePhotoAuthGate` (L230), `#guidePhotoFormWrap` (L231), `#dishPhotoVendor` (L234), `#dishPhotoCaption` (L235), `#dishPhotoFile` (L237), `#dishPhotoProgress` (L238), `#dishPhotoSave` (L239), `#dishPhotoMessage` (L243), `#dishPhotoGrid` (L244), `#smartScreen` (L248), `#smartBody` (L260), `#smartMessage` (L261), `#pagerScreen` (L264), `#pagerRealEntry` (L277), `#pagerCode` (L280), `#pagerMessage` (L283), `#pagerLiveStatus` (L284), `#pagerDisplay` (L286), `#favoritesScreen` (L296), `#nearbyAlertToggle` (L299), `#nearbyAlertMeta` (L299), `#nearbyAlertRadius` (L300), `#favoritesFeedback` (L302), `#favoriteGrid` (L303), `#bookingsScreen` (L306), `#bookingsFeedback` (L308), `#bookingList` (L309), `#ownerScreen` (L312), `#ownerLogo` (L315), `#ownerTitle` (L315), `#ownerSubtitle` (L315), `#ownerTruckSelect` (L316), `#ownerStatusPill` (L316), `#ownerModeBanner` (L318), `#ownerFeedback` (L319), `#statTotalRequests` (L320), `#statPendingRequests` (L320), `#statAcceptedRequests` (L320), `#ownerMarketingCard` (L322), `#ownerMarketingPanel` (L322), `#kitchenPanel` (L323), `#pagerCreateForm` (L323), `#pagerVendor` (L323), `#pagerTicket` (L323), `#pagerCreateButton` (L323), `#kitchenMessage` (L323), `#kitchenQueue` (L323), `#ownerModerationCard` (L324), `#communityModeration` (L324), `#ownerPinEmoji` (L325), `#ownerLocation` (L325), `#ownerLat` (L325), `#ownerLng` (L325), `#ownerLocationTtl` (L325), `#ownerUpdateLocationBtn` (L325), `#ownerLocationMsg` (L325), `#ownerScheduleDate` (L326), `#ownerScheduleWeekday` (L326), `#ownerOpensAt` (L326), `#ownerClosesAt` (L326), `#ownerIsOpen` (L326), `#ownerSaveScheduleBtn` (L326), `#ownerScheduleMsg` (L326), `#ownerScheduleList` (L326), `#ownerPhotoGrid` (L327), `#ownerPhotoMsg` (L327), `#ownerEditProfileBtn` (L328), `#ownerEditProfileSub` (L328), `#ownerRequestCount` (L329), `#ownerRequests` (L329), `#welcomeScreen` (L333), `#welcomeHeading` (L337), `#welcomeCustomerBtn` (L340), `#welcomeVendorBtn` (L348), `#welcomeRememberChoice` (L358), `#welcomeJustBrowseBtn` (L365), `#welcomeSignInLink` (L366), `#welcomeFeedbackMsg` (L368), `#vendorIntroScreen` (L373), `#viBackToBrowseBtn` (L376), `#viRememberedBadge` (L377), `#viForgetPrefBtn` (L379), `#vendorIntroHeading` (L384), `#viCapabilitiesList` (L386), `#viOnboardingPausedNotice` (L395), `#viListingPickerWrap` (L396), `#viListingSearch` (L399), `#viListingSelect` (L400), `#viClaimBusinessBtn` (L406), `#viAddBusinessBtn` (L407), `#viManageSignInLink` (L410), `#viJustExploreBtn` (L411), `#profileScreen` (L417), `#customerProfileRoot` (L418), `#detailModal` (L431), `#detailContent` (L431), `#bookingModal` (L432), `#bookingModalTitle` (L433), `#bookingTruckLabel` (L433), `#bookingAuthNotice` (L435), `#bookingTruck` (L436), `#eventType` (L441), `#eventDate` (L442), `#guestCount` (L442), `#eventLocation` (L443), `#eventNote` (L443), `#bookingError` (L444), `#bookingSubmitBtn` (L445), `#ownerProfileModal` (L447), `#ownerProfileModalTitle` (L448), `#ownerProfileName` (L449), `#ownerProfileCuisine` (L450), `#ownerProfileBio` (L451), `#ownerAcceptingBookings` (L452), `#ownerProfileError` (L453), `#ownerProfileSaveBtn` (L454), `#distanceModal` (L456), `#distanceModalTitle` (L456), `#distanceRange` (L456), `#rangeValue` (L456), `#areaModal` (L457), `#areaModalTitle` (L457), `#areaUseLocationBtn` (L457), `#areaAllSonomaBtn` (L457), `#toast` (L458)

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
| `localStorage` | `truckly_bookings` | `removeItem` | `public/app.js:L1738`, `public/app.js:L1806`, `public/auth-client.js:L24` |
| `localStorage` | `truckly_catalog` | `removeItem` | `public/app.js:L423` |
| `localStorage` | `truckly_catalog_v2` | `safeJSON, setItem` | `public/app.js:L424`, `public/app.js:L980` |
| `localStorage` | `truckly_favs` | `removeItem, safeJSON, safeStorageSet` | `public/app.js:L1655`, `public/app.js:L1661`, `public/app.js:L1735`, `public/app.js:L1807` |
| `localStorage` | `truckly_favs_scope` | `getItem, removeItem, safeStorageSet` | `public/app.js:L1632`, `public/app.js:L1656`, `public/app.js:L1662`, `public/app.js:L1733` |
| `localStorage` | `truckly_guide_passport_v1` | `getItem, removeItem, setItem` | `public/exploration-client.js:L625`, `public/exploration-client.js:L676`, `public/exploration-client.js:L678` |
| `localStorage` | `truckly_notify` | `removeItem, safeJSON, safeStorageSet, setItem` | `public/app.js:L1809`, `public/app.js:L2076`, `public/app.js:L2098`, `public/app.js:L2132` |
| `localStorage` | `truckly_owner_profile` | `removeItem, safeJSON, safeStorageSet` | `public/app.js:L1811`, `public/app.js:L2918`, `public/app.js:L3698`, `public/auth-client.js:L29` |
| `localStorage` | `truckly_owner_schedule` | `removeItem, safeJSON, safeStorageSet` | `public/app.js:L1812`, `public/app.js:L2926`, `public/app.js:L3594`, `public/auth-client.js:L30` |
| `localStorage` | `truckly_owner_truck_id` | `getItem, removeItem, setItem` | `public/app.js:L1810`, `public/app.js:L2911`, `public/app.js:L3096`, `public/auth-client.js:L28` |
| `localStorage` | `truckly_pager_subs_v1` | `getItem, setItem` | `public/pager.js:L21`, `public/pager.js:L42` |
| `sessionStorage` | `biteshark_admin_viewpoint_v1` | `getItem, removeItem, setItem` | `public/admin.js:L319`, `public/admin.js:L320`, `public/auth-client.js:L23`, `public/role-experience.js:L1163` |
| `sessionStorage` | `biteshark_pending_invite_v1` | `getItem, removeItem, setItem` | `public/admin.js:L5115`, `public/role-experience.js:L100`, `public/role-experience.js:L92`, `public/role-experience.js:L96` |
| `sessionStorage` | `bs_support_draft_v1` | `getItem, removeItem, setItem` | `public/admin.js:L5114`, `public/auth-client.js:L22`, `public/role-experience.js:L106`, `public/role-experience.js:L109` |

## CSS Stylesheets, Custom Properties & Responsive Breakpoints (20)

| Stylesheet | Custom Properties Defined | Media Queries | `!important` Declarations |
|---|---:|---:|---:|
| [public/admin.css](../../../public/admin.css) | 18 | 5 | 13 |
| [public/characters.css](../../../public/characters.css) | 0 | 3 | 1 |
| [public/coffee-club.css](../../../public/coffee-club.css) | 0 | 2 | 0 |
| [public/color-calm.css](../../../public/color-calm.css) | 18 | 4 | 4 |
| [public/community.css](../../../public/community.css) | 0 | 3 | 1 |
| [public/customer-profile.css](../../../public/customer-profile.css) | 0 | 2 | 2 |
| [public/guide-passport.css](../../../public/guide-passport.css) | 2 | 4 | 2 |
| [public/layout-polish.css](../../../public/layout-polish.css) | 5 | 3 | 0 |
| [public/local-guides.css](../../../public/local-guides.css) | 4 | 4 | 2 |
| [public/mobile-scroll-fix.css](../../../public/mobile-scroll-fix.css) | 2 | 5 | 17 |
| [public/neighborhood.css](../../../public/neighborhood.css) | 18 | 3 | 0 |
| [public/pager-experience.css](../../../public/pager-experience.css) | 0 | 2 | 1 |
| [public/pager.css](../../../public/pager.css) | 0 | 3 | 1 |
| [public/policies/policies.css](../../../public/policies/policies.css) | 14 | 1 | 0 |
| [public/role-experience.css](../../../public/role-experience.css) | 0 | 3 | 6 |
| [public/shared-collection-page.css](../../../public/shared-collection-page.css) | 9 | 0 | 0 |
| [public/smart.css](../../../public/smart.css) | 0 | 1 | 3 |
| [public/street-whispers.css](../../../public/street-whispers.css) | 0 | 3 | 2 |
| [public/theme.css](../../../public/theme.css) | 26 | 4 | 11 |
| [scripts/dev-workbench/debug-admin.css](../../../scripts/dev-workbench/debug-admin.css) | 0 | 1 | 1 |
