# Code Registry — Frontend Screens, DOM, Storage & CSS Inventory

> [!NOTE]
> **Machine-Generated Reference Inventory** — Do not hand-edit. Regenerate via `npm run registry:docs` (`node tools/code-registry/cli.mjs generate-docs`).
> - **Repository**: `https://github.com/yamanalmasaleha-png/trukly-`
> - **Branch / Ref at Generation**: `feature/private-profiles-greatest-hits`
> - **Generator**: `biteshark-code-registry@1.0.0` (`biteshark.code-registry.v1`)
> - **Deterministic Source Digest**: `92550b00fa6f82baa76cb64e2ceec7d8554424ae7b8d600819352b703d3c195b`
> - **Analysis Basis**: Static AST, HTML, CSS, and SQL analysis without executing application modules. Dynamic string concatenation, computed property lookups, and runtime reflection are labeled as dynamic/unresolved rather than assumed complete.

## HTML Document: [public/admin.html](../../../public/admin.html)

### Stylesheet Load Order (1)

1. `/admin.css` (L12)

### Script Load Order (3)

1. `/diagnostics-client.js` (L983)
2. `/auth-client.js` (L984)
3. `/admin.js` (L985)

### Static `data-*` Attributes (6)

`data-acct-tab`, `data-goto`, `data-iss-queue`, `data-mod-queue`, `data-section`, `data-subfilter`

### Static HTML Element IDs (230)

`#adminShell` (L15), `#adminRoleBadge` (L32), `#vpCustomerPreviewBtn` (L38), `#vpVendorSelect` (L40), `#vpVendorPreviewBtn` (L43), `#vpActOnBehalfBtn` (L44), `#adminUserEmail` (L50), `#adminUserSub` (L51), `#adminSignOutBtn` (L54), `#badgeApplications` (L67), `#badgeVendors` (L72), `#badgeInvitations` (L77), `#badgeModeration` (L82), `#badgeIssues` (L87), `#badgeReadiness` (L92), `#badgeFeatures` (L97), `#badgeDiagnostics` (L106), `#adminMain` (L114), `#adminLaunchReminderBanner` (L115), `#launchReminderHeadline` (L118), `#launchReminderSubnote` (L119), `#launchReminderOpenReadinessBtn` (L122), `#adminGlobalBanner` (L127), `#sec-overview` (L130), `#heading-overview` (L134), `#refreshOverviewBtn` (L137), `#overviewLoading` (L140), `#overviewError` (L141), `#overviewCards` (L143), `#ovPendingApps` (L146), `#ovModRecApps` (L147), `#ovPendingInvites` (L151), `#ovFlaggedComments` (L156), `#ovCommentsBreakdown` (L157), `#ovOpenIssues` (L161), `#ovOverdueIssues` (L162), `#ovRestrictedVendors` (L166), `#ovVendorsBreakdown` (L167), `#ovReadinessCard` (L169), `#ovUnresolvedReadiness` (L171), `#ovReadinessSub` (L172), `#ovHealthStatus` (L176), `#ovHealthSub` (L177), `#overviewRoleNotice` (L181), `#overviewRoleDescription` (L183), `#sec-applications` (L211), `#heading-applications` (L215), `#refreshAppsBtn` (L218), `#appsFilterForm` (L221), `#appsStatusFilter` (L223), `#appsRecFilter` (L234), `#appsSearchInput` (L243), `#appsListState` (L250), `#appsList` (L251), `#appsPager` (L252), `#appsDetailPane` (L254), `#sec-vendors` (L261), `#heading-vendors` (L265), `#refreshVendorsBtn` (L268), `#vendorsFilterForm` (L271), `#vendorsStatusFilter` (L273), `#vendorsOwnershipFilter` (L282), `#vendorsVerifiedFilter` (L291), `#vendorsTownFilter` (L299), `#vendorsSearchInput` (L302), `#vendorsListState` (L309), `#vendorsList` (L310), `#vendorsPager` (L311), `#vendorsDetailPane` (L313), `#sec-accounts` (L320), `#heading-accounts` (L324), `#refreshAccountsBtn` (L327), `#inviteCreateForm` (L332), `#invEmail` (L334), `#invRole` (L337), `#invVendorWrap` (L345), `#invVendorId` (L346), `#invNote` (L351), `#invSubmitBtn` (L354), `#invTopAuthorityNotice` (L357), `#invModElevationNotice` (L360), `#invResultBox` (L363), `#acctInvitationsView` (L371), `#invFilterForm` (L372), `#invStatusFilter` (L374), `#invRoleFilter` (L386), `#invListState` (L397), `#invList` (L398), `#invPager` (L399), `#acctDirectoryView` (L402), `#accountsFilterForm` (L403), `#acctRoleFilter` (L405), `#acctStatusFilter` (L414), `#acctSearchInput` (L421), `#acctListState` (L427), `#acctList` (L428), `#acctPager` (L429), `#acctDetailPane` (L431), `#sec-moderation` (L439), `#heading-moderation` (L443), `#refreshModBtn` (L446), `#modFilterForm` (L456), `#modStatusFilter` (L458), `#modVendorFilter` (L467), `#modAuthorFilter` (L470), `#modReasonFilter` (L473), `#modDateFrom` (L476), `#modDateTo` (L479), `#modSearchInput` (L482), `#modListState` (L489), `#modList` (L490), `#modPager` (L491), `#modDetailPane` (L493), `#sec-issues` (L500), `#heading-issues` (L504), `#refreshIssuesBtn` (L507), `#issuesQueueTabs` (L510), `#issuesFilterForm` (L520), `#issuesStatusFilter` (L522), `#issuesSeverityFilter` (L534), `#issuesUrgencyFilter` (L543), `#issuesReporterTypeFilter` (L553), `#issuesCategoryFilter` (L560), `#issuesVendorFilter` (L579), `#issuesDateFrom` (L582), `#issuesDateTo` (L585), `#issuesOverdueOnly` (L588), `#issuesSearchInput` (L592), `#issuesListState` (L599), `#issuesList` (L600), `#issuesPager` (L601), `#issuesDetailPane` (L603), `#sec-readiness` (L610), `#heading-readiness` (L614), `#refreshReadinessBtn` (L619), `#readinessSummaryStrip` (L623), `#rsUnresolvedCritical` (L624), `#rsPendingDecision` (L625), `#rsNeedsReReview` (L626), `#rsLegallyApproved` (L627), `#rsVisibleTotal` (L628), `#readinessFilterForm` (L635), `#readinessCategoryFilter` (L637), `#readinessStatusFilter` (L648), `#readinessCriticalOnly` (L663), `#readinessSearchInput` (L667), `#readinessListState` (L674), `#readinessList` (L675), `#readinessDetailPane` (L677), `#sec-features` (L684), `#heading-features` (L688), `#refreshFeaturesBtn` (L691), `#fcLiveStatus` (L694), `#fcLiveError` (L695), `#fcRoleAndPropagationCard` (L697), `#fcPropagationNote` (L701), `#fcRolePermissionNote` (L702), `#featuresFilterForm` (L711), `#fcStatusFilter` (L713), `#fcImplFilter` (L723), `#fcSearchInput` (L733), `#featuresLoading` (L738), `#featuresList` (L739), `#fcProtectedEssentialsPanel` (L741), `#fcProtectedList` (L744), `#fcHistoryPanel` (L747), `#fcHistoryWrap` (L749), `#sec-audit` (L754), `#heading-audit` (L758), `#refreshAuditBtn` (L761), `#auditFilterForm` (L764), `#auditActionFilter` (L766), `#auditVendorFilter` (L769), `#auditActorFilter` (L772), `#auditListState` (L777), `#auditList` (L778), `#auditPager` (L779), `#sec-diagnostics` (L783), `#heading-diagnostics` (L787), `#diagCreateSyntheticBtn` (L791), `#diagRunCleanupBtn` (L792), `#refreshDiagnosticsBtn` (L793), `#diagReleaseStrip` (L797), `#diagSummaryRow` (L801), `#diagFilterForm` (L803), `#diagSearchInput` (L805), `#diagWindowFilter` (L808), `#diagSeverityFilter` (L817), `#diagComponentFilter` (L826), `#diagFeatureFilter` (L835), `#diagTriageFilter` (L864), `#diagReleaseFilter` (L874), `#diagIncludeSynthetic` (L877), `#diagListState` (L885), `#diagList` (L886), `#diagPager` (L887), `#diagDetailPane` (L889), `#sec-health` (L896), `#heading-health` (L900), `#refreshHealthBtn` (L903), `#healthContent` (L905), `#aobModal` (L914), `#aobForm` (L915), `#aobModalTitle` (L917), `#aobVendorDisplay` (L920), `#aobReasonInput` (L923), `#aobError` (L925), `#aobCancelBtn` (L927), `#featureConfirmModal` (L934), `#fcConfirmTitle` (L937), `#fcConfirmLead` (L938), `#fcConfirmTransitionSummary` (L939), `#fcConfirmConsequences` (L942), `#fcConfirmReason` (L945), `#fcConfirmError` (L947), `#fcConfirmCancelBtn` (L949), `#fcConfirmSubmitBtn` (L950), `#invActionModal` (L956), `#invActionForm` (L957), `#invActionKicker` (L958), `#invActionTitle` (L959), `#invActionSummary` (L960), `#invActionReason` (L962), `#invActionError` (L964), `#invActionCancelBtn` (L966), `#invActionSubmitBtn` (L967), `#invHistoryModal` (L972), `#invHistoryTitle` (L975), `#invHistoryBody` (L976), `#invHistoryCloseBtn` (L978)

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
| `cookie` | `:expr=; Path=/; Max-Age=0; Expir` | `write` | `public/role-experience.js:L40` |
| `cookie` | `<dynamic>` | `write` | `public/role-experience.js:L83` |
| `cookie` | `truckly_debug_role` | `write` | `scripts/dev-workbench/debug-admin.js:L123` |
| `IndexedDB` | `truckly-dish-notebook-v1` | `open` | `public/exploration-client.js:L702`, `public/exploration-client.js:L767`, `public/exploration-client.js:L814` |
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
| `sessionStorage` | `biteshark_admin_viewpoint_v1` | `getItem, removeItem, setItem` | `public/admin.js:L318`, `public/admin.js:L319`, `public/auth-client.js:L23`, `public/role-experience.js:L1097` |
| `sessionStorage` | `biteshark_pending_invite_v1` | `getItem, removeItem, setItem` | `public/admin.js:L4972`, `public/role-experience.js:L100`, `public/role-experience.js:L92`, `public/role-experience.js:L96` |
| `sessionStorage` | `bs_support_draft_v1` | `getItem, removeItem, setItem` | `public/admin.js:L4971`, `public/auth-client.js:L22`, `public/role-experience.js:L106`, `public/role-experience.js:L109` |

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
