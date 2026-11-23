# Code Registry — Frontend Screens, DOM, Storage & CSS Inventory

> [!NOTE]
> **Machine-Generated Reference Inventory** — Do not hand-edit. Regenerate via `npm run registry:docs` (`node tools/code-registry/cli.mjs generate-docs`).
> - **Repository**: `https://github.com/yamanalmasaleha-png/trukly-`
> - **Branch / Ref at Generation**: `testing/yaman-staging2`
> - **Generator**: `biteshark-code-registry@1.0.0` (`biteshark.code-registry.v1`)
> - **Deterministic Source Digest**: `e2366f1378644f89df4d9af78e3937662f9ec4f497107eda8bb714c8e1d39852`
> - **Analysis Basis**: Static AST, HTML, CSS, and SQL analysis without executing application modules. Dynamic string concatenation, computed property lookups, and runtime reflection are labeled as dynamic/unresolved rather than assumed complete.

## HTML Document: [public/admin.html](../../../public/admin.html)

### Stylesheet Load Order (2)

1. `/admin.css` (L12)
2. `/admin-style-guide.css` (L13)

### Script Load Order (4)

1. `/diagnostics-client.js` (L1108)
2. `/auth-client.js` (L1109)
3. `/admin.js` (L1110)
4. `/admin-style-guide.js` (L1111)

### Static `data-*` Attributes (6)

`data-acct-tab`, `data-goto`, `data-iss-queue`, `data-mod-queue`, `data-section`, `data-subfilter`

### Static HTML Element IDs (279)

`#adminShell` (L16), `#adminRoleBadge` (L33), `#vpCustomerPreviewBtn` (L39), `#vpTestCustomerBtn` (L40), `#vpVendorSelect` (L42), `#vpVendorPreviewBtn` (L45), `#vpActOnBehalfBtn` (L46), `#adminUserEmail` (L52), `#adminUserSub` (L53), `#adminSignOutBtn` (L56), `#badgeApplications` (L69), `#badgeVendors` (L74), `#badgeInvitations` (L79), `#badgeModeration` (L84), `#badgeIssues` (L89), `#badgeReadiness` (L94), `#badgeFeatures` (L99), `#navStyleGuideBtn` (L101), `#badgeStyleGuide` (L104), `#badgeDiagnostics` (L113), `#adminMain` (L121), `#adminLaunchReminderBanner` (L122), `#launchReminderHeadline` (L125), `#launchReminderSubnote` (L126), `#launchReminderOpenReadinessBtn` (L129), `#adminGlobalBanner` (L134), `#sec-overview` (L137), `#heading-overview` (L141), `#refreshOverviewBtn` (L144), `#overviewLoading` (L147), `#overviewError` (L148), `#overviewCards` (L150), `#ovPendingApps` (L153), `#ovModRecApps` (L154), `#ovPendingInvites` (L158), `#ovFlaggedComments` (L163), `#ovCommentsBreakdown` (L164), `#ovOpenIssues` (L168), `#ovOverdueIssues` (L169), `#ovRestrictedVendors` (L173), `#ovVendorsBreakdown` (L174), `#ovReadinessCard` (L176), `#ovUnresolvedReadiness` (L178), `#ovReadinessSub` (L179), `#ovHealthStatus` (L183), `#ovHealthSub` (L184), `#overviewRoleNotice` (L188), `#overviewRoleDescription` (L190), `#sec-applications` (L218), `#heading-applications` (L222), `#refreshAppsBtn` (L225), `#appsFilterForm` (L228), `#appsStatusFilter` (L230), `#appsRecFilter` (L241), `#appsSearchInput` (L250), `#appsListState` (L257), `#appsList` (L258), `#appsPager` (L259), `#appsDetailPane` (L261), `#sec-vendors` (L268), `#heading-vendors` (L272), `#refreshVendorsBtn` (L275), `#vendorsFilterForm` (L278), `#vendorsStatusFilter` (L280), `#vendorsOwnershipFilter` (L289), `#vendorsVerifiedFilter` (L298), `#vendorsTownFilter` (L306), `#vendorsSearchInput` (L309), `#vendorsListState` (L316), `#vendorsList` (L317), `#vendorsPager` (L318), `#vendorsDetailPane` (L320), `#sec-accounts` (L327), `#heading-accounts` (L331), `#refreshAccountsBtn` (L334), `#testCustomerSandboxPanel` (L337), `#testCustomerStatusLine` (L342), `#tcOpenProfileBtn` (L346), `#tcOpenDiscoverBtn` (L347), `#tcSeedSampleBtn` (L348), `#tcResetDataBtn` (L349), `#tcExitSessionBtn` (L350), `#inviteCreateForm` (L356), `#invEmail` (L358), `#invRole` (L361), `#invVendorWrap` (L369), `#invVendorId` (L370), `#invNote` (L375), `#invSubmitBtn` (L378), `#invTopAuthorityNotice` (L381), `#invModElevationNotice` (L384), `#invResultBox` (L387), `#acctInvitationsView` (L395), `#invFilterForm` (L396), `#invStatusFilter` (L398), `#invRoleFilter` (L410), `#invListState` (L421), `#invList` (L422), `#invPager` (L423), `#acctDirectoryView` (L426), `#accountsFilterForm` (L427), `#acctRoleFilter` (L429), `#acctStatusFilter` (L438), `#acctSearchInput` (L445), `#acctListState` (L451), `#acctList` (L452), `#acctPager` (L453), `#acctDetailPane` (L455), `#sec-moderation` (L463), `#heading-moderation` (L467), `#refreshModBtn` (L470), `#modFilterForm` (L479), `#modStatusFilter` (L481), `#modVendorFilter` (L490), `#modAuthorFilter` (L493), `#modReasonFilter` (L496), `#modDateFrom` (L499), `#modDateTo` (L502), `#modSearchInput` (L505), `#modListState` (L512), `#modList` (L513), `#modPager` (L514), `#modDetailPane` (L516), `#sec-issues` (L523), `#heading-issues` (L527), `#refreshIssuesBtn` (L530), `#issuesQueueTabs` (L533), `#issuesFilterForm` (L543), `#issuesStatusFilter` (L545), `#issuesSeverityFilter` (L557), `#issuesUrgencyFilter` (L566), `#issuesReporterTypeFilter` (L576), `#issuesCategoryFilter` (L583), `#issuesVendorFilter` (L602), `#issuesDateFrom` (L605), `#issuesDateTo` (L608), `#issuesOverdueOnly` (L611), `#issuesSearchInput` (L615), `#issuesListState` (L622), `#issuesList` (L623), `#issuesPager` (L624), `#issuesDetailPane` (L626), `#sec-readiness` (L633), `#heading-readiness` (L637), `#refreshReadinessBtn` (L642), `#readinessSummaryStrip` (L646), `#rsUnresolvedCritical` (L647), `#rsPendingDecision` (L648), `#rsNeedsReReview` (L649), `#rsLegallyApproved` (L650), `#rsVisibleTotal` (L651), `#readinessFilterForm` (L658), `#readinessCategoryFilter` (L660), `#readinessStatusFilter` (L671), `#readinessCriticalOnly` (L686), `#readinessSearchInput` (L690), `#readinessListState` (L697), `#readinessList` (L698), `#readinessDetailPane` (L700), `#sec-features` (L707), `#heading-features` (L711), `#refreshFeaturesBtn` (L714), `#fcLiveStatus` (L717), `#fcLiveError` (L718), `#fcRoleAndPropagationCard` (L720), `#fcPropagationNote` (L724), `#fcRolePermissionNote` (L725), `#featuresFilterForm` (L734), `#fcStatusFilter` (L736), `#fcImplFilter` (L746), `#fcSearchInput` (L756), `#featuresLoading` (L761), `#featuresList` (L762), `#fcProtectedEssentialsPanel` (L764), `#fcProtectedList` (L767), `#fcHistoryPanel` (L770), `#fcHistoryWrap` (L772), `#sec-audit` (L777), `#heading-audit` (L781), `#refreshAuditBtn` (L784), `#auditFilterForm` (L787), `#auditActionFilter` (L789), `#auditVendorFilter` (L792), `#auditActorFilter` (L795), `#auditListState` (L800), `#auditList` (L801), `#auditPager` (L802), `#sec-diagnostics` (L806), `#heading-diagnostics` (L810), `#diagCreateSyntheticBtn` (L814), `#diagRunCleanupBtn` (L815), `#refreshDiagnosticsBtn` (L816), `#diagReleaseStrip` (L820), `#diagSummaryRow` (L824), `#diagFilterForm` (L826), `#diagSearchInput` (L828), `#diagWindowFilter` (L831), `#diagSeverityFilter` (L840), `#diagComponentFilter` (L849), `#diagFeatureFilter` (L858), `#diagTriageFilter` (L882), `#diagReleaseFilter` (L892), `#diagIncludeSynthetic` (L895), `#diagListState` (L903), `#diagList` (L904), `#diagPager` (L905), `#diagDetailPane` (L907), `#sec-health` (L914), `#heading-health` (L918), `#refreshHealthBtn` (L921), `#healthContent` (L923), `#sec-style-guide` (L929), `#heading-style-guide` (L933), `#refreshStyleGuideBtn` (L936), `#sgWorkspaceLoading` (L939), `#sgWorkspaceError` (L940), `#sgWorkspaceBody` (L942), `#sgProgressSummaryCard` (L943), `#sgCategoryRailList` (L948), `#sgMainColumn` (L951), `#sgStickySaveBar` (L954), `#sgDirtyCountLabel` (L955), `#sgDiscardAllDirtyBtn` (L957), `#sgSaveAllDirtyBtn` (L958), `#sgDecisionRefDatalist` (L963), `#aobModal` (L970), `#aobForm` (L971), `#aobModalTitle` (L973), `#aobVendorDisplay` (L976), `#aobReasonInput` (L979), `#aobError` (L981), `#aobCancelBtn` (L983), `#featureConfirmModal` (L990), `#fcConfirmTitle` (L993), `#fcConfirmLead` (L994), `#fcConfirmTransitionSummary` (L995), `#fcConfirmConsequences` (L998), `#fcConfirmReason` (L1001), `#fcConfirmError` (L1003), `#fcConfirmCancelBtn` (L1005), `#fcConfirmSubmitBtn` (L1006), `#invActionModal` (L1012), `#invActionForm` (L1013), `#invActionKicker` (L1014), `#invActionTitle` (L1015), `#invActionSummary` (L1016), `#invActionReason` (L1018), `#invActionError` (L1020), `#invActionCancelBtn` (L1022), `#invActionSubmitBtn` (L1023), `#invHistoryModal` (L1028), `#invHistoryTitle` (L1031), `#invHistoryBody` (L1032), `#invHistoryCloseBtn` (L1034), `#sgHostedDocModal` (L1040), `#sgHostedDocTitle` (L1043), `#sgHostedDocSelect` (L1046), `#sgHostedDocModeBtn` (L1049), `#sgHostedDocDownloadBtn` (L1050), `#sgHostedDocMeta` (L1053), `#sgHostedDocBody` (L1054), `#sgHostedDocCloseBtn` (L1056), `#sgPushRepoModal` (L1062), `#sgPushRepoForm` (L1063), `#sgPushRepoTitle` (L1065), `#sgPushSummaryCallout` (L1066), `#sgPushBranchSelect` (L1069), `#sgPushCustomBranchWrap` (L1072), `#sgPushCustomBranchInput` (L1074), `#sgPushCommitMessage` (L1079), `#sgPushAuthorName` (L1084), `#sgPushAuthorEmail` (L1087), `#sgPushTokenStatusNote` (L1091), `#sgPushTokenInputWrap` (L1092), `#sgPushTokenInput` (L1094), `#sgPushModalError` (L1098), `#sgPushModalSuccess` (L1099), `#sgPushCancelBtn` (L1102), `#sgPushSubmitBtn` (L1103)

## HTML Document: [public/index.html](../../../public/index.html)

### Screens (10)

| Element ID | Tag | Default Active | Classes | Line |
|---|---|---|---|---:|
| `#discoverScreen` | `<main>` | Yes | `screen active list-mode` | L49 |
| `#communityScreen` | `<main>` | No | `screen page-screen` | L117 |
| `#guidesScreen` | `<main>` | No | `screen page-screen` | L202 |
| `#smartScreen` | `<main>` | No | `screen page-screen` | L214 |
| `#pagerScreen` | `<main>` | No | `screen page-screen` | L216 |
| `#favoritesScreen` | `<main>` | No | `screen page-screen` | L248 |
| `#bookingsScreen` | `<main>` | No | `screen page-screen` | L258 |
| `#ownerScreen` | `<main>` | No | `screen page-screen owner-page` | L264 |
| `#welcomeScreen` | `<main>` | No | `screen page-screen welcome-screen` | L285 |
| `#vendorIntroScreen` | `<main>` | No | `screen page-screen vendor-intro-screen` | L325 |

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
17. `/map-cards.css` (L23)

### Script Load Order (15)

1. `https://unpkg.com/leaflet@1.9.4/dist/leaflet.js` *(external CDN)* (L407)
2. `/diagnostics-client.js` (L408)
3. `/auth-client.js` (L409)
4. `/role-experience.js` (L410)
5. `/map-cards.js` (L411)
6. `/app.js` (L412)
7. `/listing-highlights.js` (L413)
8. `/pager.js` (L414)
9. `/smart.js` (L415)
10. `/characters.js` (L416)
11. `/coffee-club.js` (L417)
12. `/local-guides.js` (L418)
13. `/guide-passport.js` (L419)
14. `/community.js` (L420)
15. `/street-whispers.js` (L421)

### Inline Event Handlers (128)

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
| L81 | `<button>` | `onclick` | `surpriseMe()` | `surpriseMe` |
| L84 | `<button>` | `onclick` | `openCommunity()` | `openCommunity` |
| L86 | `<button>` | `onclick` | `chooseKind('All')` | `chooseKind` |
| L87 | `<button>` | `onclick` | `chooseKind('Pop-ups')` | `chooseKind` |
| L88 | `<button>` | `onclick` | `chooseKind('Markets')` | `chooseKind` |
| L89 | `<button>` | `onclick` | `chooseKind('Food Trucks')` | `chooseKind` |
| L90 | `<button>` | `onclick` | `chooseKind('Coffee')` | `chooseKind` |
| L91 | `<button>` | `onclick` | `chooseKind('Farm Stands')` | `chooseKind` |
| L101 | `<button>` | `onclick` | `chooseKind('Farm Stands')` | `chooseKind` |
| L102 | `<button>` | `onclick` | `chooseKind('All');chooseCuisine('Sweets');setMode('list');document.getElementById('resultsHeading').scrollIntoView({block:'start',behavior:'smooth'})` | `chooseCuisine`, `chooseKind`, `document.getElementById`, `setMode` |
| L103 | `<button>` | `onclick` | `chooseKind('Coffee')` | `chooseKind` |
| L105 | `<button>` | `onclick` | `chooseKind('Coffee')` | `chooseKind` |
| L105 | `<button>` | `onclick` | `openDetail('coffee-crooks')` | `openDetail` |
| L105 | `<button>` | `onclick` | `openDetail('coffee-retrograde')` | `openDetail` |
| L107 | `<button>` | `onclick` | `openDetail('coffee-crooks')` | `openDetail` |
| L108 | `<button>` | `onclick` | `openDetail('coffee-avid-petaluma')` | `openDetail` |
| L109 | `<button>` | `onclick` | `openDetail('farm-oakhill')` | `openDetail` |
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
| L204 | `<button>` | `onclick` | `showGuidesTab('passport')` | `showGuidesTab` |
| L204 | `<button>` | `onclick` | `showGuidesTab('stories')` | `showGuidesTab` |
| L204 | `<button>` | `onclick` | `showGuidesTab('photos')` | `showGuidesTab` |
| L205 | `<button>` | `onclick` | `openCommunity()` | `openCommunity` |
| L209 | `<form>` | `onsubmit` | `saveDishPhoto(event)` | `saveDishPhoto` |
| L214 | `<button>` | `onclick` | `openSmart('finder')` | `openSmart` |
| L214 | `<button>` | `onclick` | `openSmart('trail')` | `openSmart` |
| L214 | `<button>` | `onclick` | `openSmart('marketing')` | `openSmart` |
| L225 | `<button>` | `onclick` | `startPagerDemo()` | `startPagerDemo` |
| L232 | `<form>` | `onsubmit` | `joinPager(event)` | `joinPager` |
| L251 | `<input#nearbyAlertToggle>` | `onchange` | `saveNotificationSettings()` | `saveNotificationSettings` |
| L252 | `<select#nearbyAlertRadius>` | `onchange` | `saveNotificationSettings()` | `saveNotificationSettings` |
| L266 | `<button>` | `onclick` | `showScreen('discover')` | `showScreen` |
| L268 | `<select#ownerTruckSelect>` | `onchange` | `selectOwnerTruck(this.value)` | `selectOwnerTruck` |
| L274 | `<button>` | `onclick` | `openSmart('marketing')` | `openSmart` |
| L275 | `<button>` | `onclick` | `openPager();startPagerDemo()` | `openPager`, `startPagerDemo` |
| L275 | `<button>` | `onclick` | `loadKitchen()` | `loadKitchen` |
| L275 | `<form#pagerCreateForm>` | `onsubmit` | `createPager(event)` | `createPager` |
| L275 | `<button>` | `onclick` | `loadKitchen()` | `loadKitchen` |
| L276 | `<button>` | `onclick` | `communityOpenModeration()` | `communityOpenModeration` |
| L277 | `<button#ownerUpdateLocationBtn>` | `onclick` | `updateOwnerLocation()` | `updateOwnerLocation` |
| L278 | `<input#ownerScheduleDate>` | `onchange` | `syncOwnerScheduleDay()` | `syncOwnerScheduleDay` |
| L278 | `<input#ownerIsOpen>` | `onchange` | `toggleOwnerOpenStatus()` | `toggleOwnerOpenStatus` |
| L278 | `<button#ownerSaveScheduleBtn>` | `onclick` | `saveOwnerSchedule()` | `saveOwnerSchedule` |
| L279 | `<input>` | `onchange` | `previewOwnerPhotos(event)` | `previewOwnerPhotos` |
| L280 | `<button#ownerEditProfileBtn>` | `onclick` | `openOwnerProfileModal()` | `openOwnerProfileModal` |
| L280 | `<button>` | `onclick` | `shareOwnerLocation()` | `shareOwnerLocation` |
| L280 | `<button>` | `onclick` | `openBooking(ownerTruckId)` | `openBooking` |
| L281 | `<button>` | `onclick` | `setOwnerRequestFilter('pending')` | `setOwnerRequestFilter` |
| L281 | `<button>` | `onclick` | `setOwnerRequestFilter('accepted')` | `setOwnerRequestFilter` |
| L281 | `<button>` | `onclick` | `setOwnerRequestFilter('all')` | `setOwnerRequestFilter` |
| L370 | `<button>` | `onclick` | `showScreen('discover')` | `showScreen` |
| L371 | `<button>` | `onclick` | `showScreen('favorites')` | `showScreen` |
| L372 | `<button>` | `onclick` | `openBooking()` | `openBooking` |
| L373 | `<button>` | `onclick` | `openLocalGuides('passport')` | `openLocalGuides` |
| L374 | `<button>` | `onclick` | `showScreen('bookings')` | `showScreen` |
| L375 | `<button>` | `onclick` | `surpriseMe()` | `surpriseMe` |
| L379 | `<div#detailModal>` | `onclick` | `if(event.target===this)closeModal()` | `closeModal` |
| L380 | `<div#bookingModal>` | `onclick` | `if(event.target===this)closeBooking()` | `closeBooking` |
| L380 | `<form>` | `onsubmit` | `submitBooking(event)` | `submitBooking` |
| L381 | `<button>` | `onclick` | `closeBooking()` | `closeBooking` |
| L384 | `<select#bookingTruck>` | `onchange` | `onBookingTruckChange()` | `onBookingTruckChange` |
| L385 | `<fieldset>` | `onchange` | `validateBookingChoice()` | `validateBookingChoice` |
| L390 | `<input#eventDate>` | `onchange` | `checkBookingAvailability()` | `checkBookingAvailability` |
| L390 | `<input#guestCount>` | `oninput` | `validateBookingChoice()` | `validateBookingChoice` |
| L395 | `<div#ownerProfileModal>` | `onclick` | `if(event.target===this)closeOwnerProfileModal()` | `closeOwnerProfileModal` |
| L395 | `<form>` | `onsubmit` | `saveOwnerProfile(event)` | `saveOwnerProfile` |
| L396 | `<button>` | `onclick` | `closeOwnerProfileModal()` | `closeOwnerProfileModal` |
| L404 | `<div#distanceModal>` | `onclick` | `if(event.target===this)closeDistanceModal()` | `closeDistanceModal` |
| L404 | `<button>` | `onclick` | `closeDistanceModal()` | `closeDistanceModal` |
| L404 | `<input#distanceRange>` | `oninput` | `setDistance(this.value)` | `setDistance` |
| L404 | `<button>` | `onclick` | `closeDistanceModal();applyFilters()` | `applyFilters`, `closeDistanceModal` |
| L405 | `<div#areaModal>` | `onclick` | `if(event.target===this)closeAreaModal()` | `closeAreaModal` |
| L405 | `<button>` | `onclick` | `closeAreaModal()` | `closeAreaModal` |
| L405 | `<button#areaUseLocationBtn>` | `onclick` | `closeAreaModal();locateMe()` | `closeAreaModal`, `locateMe` |
| L405 | `<button#areaAllSonomaBtn>` | `onclick` | `selectManualArea('')` | `selectManualArea` |
| L405 | `<button>` | `onclick` | `selectManualArea('Santa Rosa')` | `selectManualArea` |
| L405 | `<button>` | `onclick` | `selectManualArea('Petaluma')` | `selectManualArea` |
| L405 | `<button>` | `onclick` | `selectManualArea('Rohnert Park')` | `selectManualArea` |
| L405 | `<button>` | `onclick` | `selectManualArea('Cotati')` | `selectManualArea` |
| L405 | `<button>` | `onclick` | `selectManualArea('Sonoma')` | `selectManualArea` |
| L405 | `<button>` | `onclick` | `selectManualArea('Sebastopol')` | `selectManualArea` |
| L405 | `<button>` | `onclick` | `selectManualArea('Healdsburg')` | `selectManualArea` |

### Static `data-*` Attributes (14)

`data-area-town`, `data-community-filter`, `data-cuisine`, `data-doodle`, `data-guide-tab`, `data-kind`, `data-max`, `data-name`, `data-price`, `data-req-filter`, `data-screen`, `data-smart-tab`, `data-truck-character`, `data-vi-feature`

### Static HTML Element IDs (192)

`#app` (L26), `#locationPillBtn` (L29), `#locationLabel` (L29), `#profileMenu` (L34), `#profileAvatar` (L35), `#profileHeading` (L37), `#profileSub` (L38), `#authSignInLink` (L42), `#authSignOutBtn` (L43), `#discoverScreen` (L49), `#map` (L51), `#mapFallback` (L52), `#mapFallbackStatus` (L54), `#mapFallbackTitle` (L56), `#mapFallbackCopy` (L57), `#mapFallbackListBtn` (L59), `#mapFallbackRetryBtn` (L60), `#mapFallbackHint` (L62), `#mapMode` (L65), `#listMode` (L65), `#searchInput` (L67), `#searchLocateBtn` (L67), `#filters` (L68), `#extraFilters` (L71), `#openNow` (L71), `#distanceFilterBtn` (L71), `#distanceText` (L71), `#refreshCatalogBtn` (L71), `#nearbyCount` (L72), `#coarseAreaBanner` (L74), `#openHoursNote` (L75), `#catalogOfflineNote` (L76), `#mapEmpty` (L78), `#truckSheet` (L79), `#neighborhoodHeading` (L81), `#characterHeroSlogan` (L82), `#resultsHeading` (L94), `#flavorGuide` (L95), `#flavorGuideText` (L95), `#truckCards` (L96), `#discoverExtras` (L97), `#coffeeHeading` (L105), `#streetHeading` (L106), `#smartInvite` (L111), `#communityScreen` (L117), `#communitySuccess` (L125), `#streetSectionTitle` (L147), `#streetQuiz` (L151), `#streetMysteryResult` (L155), `#streetMissionResult` (L156), `#streetFiles` (L160), `#communityCompose` (L163), `#communityPostForm` (L166), `#communityKind` (L168), `#communityNickname` (L169), `#communityPlace` (L171), `#communityRatingRow` (L172), `#communityRating` (L172), `#communityTitle` (L173), `#communityBody` (L174), `#communitySubmit` (L176), `#communityActionMessage` (L176), `#communityMyPosts` (L179), `#communityCount` (L181), `#communityTownFilter` (L188), `#communitySort` (L189), `#communitySearch` (L190), `#communityFeed` (L192), `#guidesScreen` (L202), `#guidePassportSection` (L206), `#guidePassport` (L206), `#guideStories` (L207), `#guideStoryGrid` (L207), `#guidePhotoSection` (L208), `#dishPhotoVendor` (L209), `#dishPhotoCaption` (L209), `#dishPhotoFile` (L209), `#dishPhotoSave` (L209), `#dishPhotoMessage` (L210), `#dishPhotoGrid` (L210), `#smartScreen` (L214), `#smartBody` (L214), `#smartMessage` (L214), `#pagerScreen` (L216), `#pagerRealEntry` (L229), `#pagerCode` (L232), `#pagerMessage` (L235), `#pagerLiveStatus` (L236), `#pagerDisplay` (L238), `#favoritesScreen` (L248), `#nearbyAlertToggle` (L251), `#nearbyAlertMeta` (L251), `#nearbyAlertRadius` (L252), `#favoritesFeedback` (L254), `#favoriteGrid` (L255), `#bookingsScreen` (L258), `#bookingsFeedback` (L260), `#bookingList` (L261), `#ownerScreen` (L264), `#ownerLogo` (L267), `#ownerTitle` (L267), `#ownerSubtitle` (L267), `#ownerTruckSelect` (L268), `#ownerStatusPill` (L268), `#ownerModeBanner` (L270), `#ownerFeedback` (L271), `#statTotalRequests` (L272), `#statPendingRequests` (L272), `#statAcceptedRequests` (L272), `#kitchenPanel` (L275), `#pagerCreateForm` (L275), `#pagerVendor` (L275), `#pagerTicket` (L275), `#pagerCreateButton` (L275), `#kitchenMessage` (L275), `#kitchenQueue` (L275), `#ownerModerationCard` (L276), `#communityModeration` (L276), `#ownerPinEmoji` (L277), `#ownerLocation` (L277), `#ownerLat` (L277), `#ownerLng` (L277), `#ownerLocationTtl` (L277), `#ownerUpdateLocationBtn` (L277), `#ownerLocationMsg` (L277), `#ownerScheduleDate` (L278), `#ownerScheduleWeekday` (L278), `#ownerOpensAt` (L278), `#ownerClosesAt` (L278), `#ownerIsOpen` (L278), `#ownerSaveScheduleBtn` (L278), `#ownerScheduleMsg` (L278), `#ownerScheduleList` (L278), `#ownerPhotoGrid` (L279), `#ownerPhotoMsg` (L279), `#ownerEditProfileBtn` (L280), `#ownerEditProfileSub` (L280), `#ownerRequestCount` (L281), `#ownerRequests` (L281), `#welcomeScreen` (L285), `#welcomeHeading` (L289), `#welcomeCustomerBtn` (L292), `#welcomeVendorBtn` (L300), `#welcomeRememberChoice` (L310), `#welcomeJustBrowseBtn` (L317), `#welcomeSignInLink` (L318), `#welcomeFeedbackMsg` (L320), `#vendorIntroScreen` (L325), `#viBackToBrowseBtn` (L328), `#viRememberedBadge` (L329), `#viForgetPrefBtn` (L331), `#vendorIntroHeading` (L336), `#viCapabilitiesList` (L338), `#viOnboardingPausedNotice` (L347), `#viListingPickerWrap` (L348), `#viListingSearch` (L351), `#viListingSelect` (L352), `#viClaimBusinessBtn` (L358), `#viAddBusinessBtn` (L359), `#viManageSignInLink` (L362), `#viJustExploreBtn` (L363), `#detailModal` (L379), `#detailContent` (L379), `#bookingModal` (L380), `#bookingModalTitle` (L381), `#bookingTruckLabel` (L381), `#bookingAuthNotice` (L383), `#bookingTruck` (L384), `#eventType` (L389), `#eventDate` (L390), `#guestCount` (L390), `#eventLocation` (L391), `#eventNote` (L391), `#bookingError` (L392), `#bookingSubmitBtn` (L393), `#ownerProfileModal` (L395), `#ownerProfileModalTitle` (L396), `#ownerProfileName` (L397), `#ownerProfileCuisine` (L398), `#ownerProfileBio` (L399), `#ownerAcceptingBookings` (L400), `#ownerProfileError` (L401), `#ownerProfileSaveBtn` (L402), `#distanceModal` (L404), `#distanceModalTitle` (L404), `#distanceRange` (L404), `#rangeValue` (L404), `#areaModal` (L405), `#areaModalTitle` (L405), `#areaUseLocationBtn` (L405), `#areaAllSonomaBtn` (L405), `#toast` (L406)

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
| `localStorage` | `truckly_bookings` | `removeItem` | `public/app.js:L1763`, `public/app.js:L1831`, `public/auth-client.js:L24` |
| `localStorage` | `truckly_catalog` | `removeItem` | `public/app.js:L423` |
| `localStorage` | `truckly_catalog_v2` | `safeJSON, setItem` | `public/app.js:L424`, `public/app.js:L980` |
| `localStorage` | `truckly_favs` | `removeItem, safeJSON, safeStorageSet` | `public/app.js:L1711`, `public/app.js:L1717`, `public/app.js:L1760`, `public/app.js:L1832` |
| `localStorage` | `truckly_favs_scope` | `getItem, removeItem, safeStorageSet` | `public/app.js:L1688`, `public/app.js:L1712`, `public/app.js:L1718`, `public/app.js:L1758` |
| `localStorage` | `truckly_guide_passport_v1` | `getItem, setItem` | `public/guide-passport.js:L10`, `public/guide-passport.js:L5` |
| `localStorage` | `truckly_notify` | `removeItem, safeJSON, safeStorageSet` | `public/app.js:L1834`, `public/app.js:L2084`, `public/app.js:L2106`, `public/app.js:L2140` |
| `localStorage` | `truckly_owner_profile` | `removeItem, safeJSON, safeStorageSet` | `public/app.js:L1836`, `public/app.js:L2926`, `public/app.js:L3706`, `public/auth-client.js:L29` |
| `localStorage` | `truckly_owner_schedule` | `removeItem, safeJSON, safeStorageSet` | `public/app.js:L1837`, `public/app.js:L2934`, `public/app.js:L3602`, `public/auth-client.js:L30` |
| `localStorage` | `truckly_owner_truck_id` | `getItem, removeItem, setItem` | `public/app.js:L1835`, `public/app.js:L2919`, `public/app.js:L3104`, `public/auth-client.js:L28` |
| `localStorage` | `truckly_pager_subs_v1` | `getItem, setItem` | `public/pager.js:L21`, `public/pager.js:L42` |
| `sessionStorage` | `biteshark_admin_viewpoint_v1` | `getItem, removeItem, setItem` | `public/admin.js:L319`, `public/admin.js:L320`, `public/auth-client.js:L23`, `public/role-experience.js:L1108` |
| `sessionStorage` | `biteshark_pending_invite_v1` | `getItem, removeItem, setItem` | `public/admin.js:L4910`, `public/role-experience.js:L100`, `public/role-experience.js:L92`, `public/role-experience.js:L96` |
| `sessionStorage` | `bs_support_draft_v1` | `getItem, removeItem, setItem` | `public/admin.js:L4909`, `public/auth-client.js:L22`, `public/role-experience.js:L106`, `public/role-experience.js:L109` |

## CSS Stylesheets, Custom Properties & Responsive Breakpoints (20)

| Stylesheet | Custom Properties Defined | Media Queries | `!important` Declarations |
|---|---:|---:|---:|
| [public/admin-style-guide.css](../../../public/admin-style-guide.css) | 0 | 2 | 2 |
| [public/admin.css](../../../public/admin.css) | 18 | 5 | 13 |
| [public/characters.css](../../../public/characters.css) | 0 | 3 | 1 |
| [public/coffee-club.css](../../../public/coffee-club.css) | 0 | 2 | 0 |
| [public/color-calm.css](../../../public/color-calm.css) | 18 | 4 | 4 |
| [public/community.css](../../../public/community.css) | 0 | 3 | 1 |
| [public/guide-passport.css](../../../public/guide-passport.css) | 2 | 3 | 0 |
| [public/layout-polish.css](../../../public/layout-polish.css) | 5 | 3 | 0 |
| [public/local-guides.css](../../../public/local-guides.css) | 4 | 3 | 0 |
| [public/map-cards.css](../../../public/map-cards.css) | 0 | 1 | 0 |
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
