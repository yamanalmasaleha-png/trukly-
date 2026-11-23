# Code Registry — Frontend Screens, DOM, Storage & CSS Inventory

> [!NOTE]
> **Machine-Generated Reference Inventory** — Do not hand-edit. Regenerate via `npm run registry:docs` (`node tools/code-registry/cli.mjs generate-docs`).
> - **Repository**: `https://github.com/yamanalmasaleha-png/trukly-`
> - **Provenance Mode**: `committed_source_digest` *(branch/detached-HEAD invariant; commit-bound runs use `npm run registry:scan -- --include-timestamp`)*
> - **Generator**: `biteshark-code-registry@2.0.0` (`biteshark.code-registry.v2`)
> - **Source Analysis Digest**: `0c5a573f94b12f309155ebe3b55b4d209581e87bff6c937910fc952c9c64d592`
> - **Analysis Scope & Limits**: Static AST, HTML, CSS, and SQL analysis without executing application modules. Relationships distinguish confirmed_static, documented_wrapper, inferred_candidate, and dynamic_unresolved; static analysis does not prove runtime behavioral correctness.

## HTML Document: [public/admin.html](../../../public/admin.html)

### Stylesheet Load Order (2)

1. `/admin.css` (L12)
2. `/admin-style-guide.css` (L13)

### Script Load Order (4)

1. `/diagnostics-client.js` (L1149)
2. `/auth-client.js` (L1150)
3. `/admin.js` (L1151)
4. `/admin-style-guide.js` (L1152)

### Static `data-*` Attributes (6)

`data-acct-tab`, `data-goto`, `data-iss-queue`, `data-mod-queue`, `data-section`, `data-subfilter`

### Static HTML Element IDs (298)

`#adminShell` (L16), `#adminRoleBadge` (L33), `#vpCustomerPreviewBtn` (L39), `#vpTestCustomerBtn` (L40), `#vpVendorSelect` (L42), `#vpVendorPreviewBtn` (L45), `#vpActOnBehalfBtn` (L46), `#adminUserEmail` (L52), `#adminUserSub` (L53), `#adminSignOutBtn` (L56), `#badgeApplications` (L69), `#badgeVendors` (L74), `#badgeInvitations` (L79), `#badgeModeration` (L84), `#badgeIssues` (L89), `#badgeReadiness` (L94), `#badgeFeatures` (L99), `#navStyleGuideBtn` (L101), `#badgeStyleGuide` (L104), `#badgeDiagnostics` (L113), `#adminMain` (L121), `#adminLaunchReminderBanner` (L122), `#launchReminderHeadline` (L125), `#launchReminderSubnote` (L126), `#launchReminderOpenReadinessBtn` (L129), `#adminGlobalBanner` (L134), `#sec-overview` (L137), `#heading-overview` (L141), `#refreshOverviewBtn` (L144), `#overviewLoading` (L147), `#overviewError` (L148), `#overviewCards` (L150), `#ovPendingApps` (L153), `#ovModRecApps` (L154), `#ovPendingInvites` (L158), `#ovFlaggedComments` (L163), `#ovCommentsBreakdown` (L164), `#ovOpenIssues` (L168), `#ovOverdueIssues` (L169), `#ovRestrictedVendors` (L173), `#ovVendorsBreakdown` (L174), `#ovReadinessCard` (L176), `#ovUnresolvedReadiness` (L178), `#ovReadinessSub` (L179), `#ovHealthStatus` (L183), `#ovHealthSub` (L184), `#overviewRoleNotice` (L188), `#overviewRoleDescription` (L190), `#sec-applications` (L218), `#heading-applications` (L222), `#refreshAppsBtn` (L225), `#appsFilterForm` (L228), `#appsStatusFilter` (L230), `#appsRecFilter` (L241), `#appsSearchInput` (L250), `#appsListState` (L257), `#appsList` (L258), `#appsPager` (L259), `#appsDetailPane` (L261), `#sec-vendors` (L268), `#heading-vendors` (L272), `#refreshVendorsBtn` (L275), `#vendorsFilterForm` (L278), `#vendorsStatusFilter` (L280), `#vendorsOwnershipFilter` (L289), `#vendorsVerifiedFilter` (L298), `#vendorsTownFilter` (L306), `#vendorsSearchInput` (L309), `#vendorsListState` (L316), `#vendorsList` (L317), `#vendorsPager` (L318), `#vendorsDetailPane` (L320), `#sec-accounts` (L327), `#heading-accounts` (L331), `#refreshAccountsBtn` (L334), `#testCustomerSandboxPanel` (L337), `#testCustomerStatusLine` (L342), `#tcOpenProfileBtn` (L346), `#tcOpenDiscoverBtn` (L347), `#tcSeedSampleBtn` (L348), `#tcResetDataBtn` (L349), `#tcExitSessionBtn` (L350), `#inviteCreateForm` (L356), `#invEmail` (L358), `#invRole` (L361), `#invVendorWrap` (L369), `#invVendorId` (L370), `#invNote` (L375), `#invSubmitBtn` (L378), `#invTopAuthorityNotice` (L381), `#invModElevationNotice` (L384), `#invResultBox` (L387), `#acctInvitationsView` (L395), `#invFilterForm` (L396), `#invStatusFilter` (L398), `#invRoleFilter` (L410), `#invListState` (L421), `#invList` (L422), `#invPager` (L423), `#acctDirectoryView` (L426), `#accountsFilterForm` (L427), `#acctRoleFilter` (L429), `#acctStatusFilter` (L438), `#acctSearchInput` (L445), `#acctListState` (L451), `#acctList` (L452), `#acctPager` (L453), `#acctDetailPane` (L455), `#sec-moderation` (L463), `#heading-moderation` (L467), `#refreshModBtn` (L470), `#modFilterForm` (L480), `#modStatusFilter` (L482), `#modVendorFilter` (L491), `#modAuthorFilter` (L494), `#modReasonFilter` (L497), `#modDateFrom` (L500), `#modDateTo` (L503), `#modSearchInput` (L506), `#modListState` (L513), `#modList` (L514), `#modPager` (L515), `#modDetailPane` (L517), `#sec-issues` (L524), `#heading-issues` (L528), `#refreshIssuesBtn` (L531), `#issuesQueueTabs` (L534), `#issuesFilterForm` (L544), `#issuesStatusFilter` (L546), `#issuesSeverityFilter` (L558), `#issuesUrgencyFilter` (L567), `#issuesReporterTypeFilter` (L577), `#issuesCategoryFilter` (L584), `#issuesVendorFilter` (L603), `#issuesDateFrom` (L606), `#issuesDateTo` (L609), `#issuesOverdueOnly` (L612), `#issuesSearchInput` (L616), `#issuesListState` (L623), `#issuesList` (L624), `#issuesPager` (L625), `#issuesDetailPane` (L627), `#sec-readiness` (L634), `#heading-readiness` (L638), `#refreshReadinessBtn` (L643), `#readinessSummaryStrip` (L647), `#rsUnresolvedCritical` (L648), `#rsPendingDecision` (L649), `#rsNeedsReReview` (L650), `#rsLegallyApproved` (L651), `#rsVisibleTotal` (L652), `#readinessFilterForm` (L659), `#readinessCategoryFilter` (L661), `#readinessStatusFilter` (L672), `#readinessCriticalOnly` (L687), `#readinessSearchInput` (L691), `#readinessListState` (L698), `#readinessList` (L699), `#readinessDetailPane` (L701), `#sec-features` (L708), `#heading-features` (L712), `#refreshFeaturesBtn` (L715), `#fcLiveStatus` (L718), `#fcLiveError` (L719), `#fcRoleAndPropagationCard` (L721), `#fcPropagationNote` (L725), `#fcRolePermissionNote` (L726), `#featuresFilterForm` (L735), `#fcStatusFilter` (L737), `#fcImplFilter` (L747), `#fcSearchInput` (L757), `#featuresLoading` (L762), `#featuresList` (L763), `#fcProtectedEssentialsPanel` (L765), `#fcProtectedList` (L768), `#fcHistoryPanel` (L771), `#fcHistoryWrap` (L773), `#sec-audit` (L778), `#heading-audit` (L782), `#refreshAuditBtn` (L785), `#auditFilterForm` (L788), `#auditActionFilter` (L790), `#auditVendorFilter` (L793), `#auditActorFilter` (L796), `#auditListState` (L801), `#auditList` (L802), `#auditPager` (L803), `#sec-diagnostics` (L807), `#heading-diagnostics` (L811), `#diagCreateSyntheticBtn` (L815), `#diagRunCleanupBtn` (L816), `#refreshDiagnosticsBtn` (L817), `#diagReleaseStrip` (L821), `#diagSummaryRow` (L825), `#diagFilterForm` (L827), `#diagSearchInput` (L829), `#diagWindowFilter` (L832), `#diagSeverityFilter` (L841), `#diagComponentFilter` (L850), `#diagFeatureFilter` (L859), `#diagTriageFilter` (L888), `#diagReleaseFilter` (L898), `#diagIncludeSynthetic` (L901), `#diagListState` (L909), `#diagList` (L910), `#diagPager` (L911), `#diagDetailPane` (L913), `#sec-health` (L920), `#heading-health` (L924), `#refreshHealthBtn` (L927), `#healthContent` (L929), `#sec-style-guide` (L935), `#heading-style-guide` (L939), `#sgHeaderUploadGitBtn` (L943), `#refreshStyleGuideBtn` (L944), `#sgWorkspaceLoading` (L948), `#sgWorkspaceError` (L949), `#sgWorkspaceBody` (L951), `#sgProgressSummaryCard` (L952), `#sgCategoryRailList` (L957), `#sgMainColumn` (L960), `#sgStickySaveBar` (L963), `#sgDirtyCountLabel` (L964), `#sgDiscardAllDirtyBtn` (L966), `#sgSaveAllDirtyBtn` (L967), `#sgDecisionRefDatalist` (L972), `#aobModal` (L979), `#aobForm` (L980), `#aobModalTitle` (L982), `#aobVendorDisplay` (L985), `#aobReasonInput` (L988), `#aobError` (L990), `#aobCancelBtn` (L992), `#featureConfirmModal` (L999), `#fcConfirmTitle` (L1002), `#fcConfirmLead` (L1003), `#fcConfirmTransitionSummary` (L1004), `#fcConfirmConsequences` (L1007), `#fcConfirmReason` (L1010), `#fcConfirmError` (L1012), `#fcConfirmCancelBtn` (L1014), `#fcConfirmSubmitBtn` (L1015), `#invActionModal` (L1021), `#invActionForm` (L1022), `#invActionKicker` (L1023), `#invActionTitle` (L1024), `#invActionSummary` (L1025), `#invActionReason` (L1027), `#invActionError` (L1029), `#invActionCancelBtn` (L1031), `#invActionSubmitBtn` (L1032), `#invHistoryModal` (L1037), `#invHistoryTitle` (L1040), `#invHistoryBody` (L1041), `#invHistoryCloseBtn` (L1043), `#sgHostedDocModal` (L1049), `#sgHostedDocTitle` (L1052), `#sgHostedDocSelect` (L1055), `#sgHostedDocModeBtn` (L1058), `#sgHostedDocDownloadBtn` (L1059), `#sgHostedDocMeta` (L1062), `#sgHostedDocBody` (L1063), `#sgHostedDocCloseBtn` (L1065), `#sgOverwriteConfirmModal` (L1071), `#sgOverwriteModalKicker` (L1073), `#sgOverwriteModalTitle` (L1074), `#sgOverwriteModalLead` (L1075), `#sgOverwriteSummaryGrid` (L1076), `#sgOverwriteDiffBox` (L1077), `#sgOverwriteModalError` (L1078), `#sgOverwriteCancelBtn` (L1081), `#sgOverwriteDenyBtn` (L1082), `#sgOverwriteConfirmBtn` (L1084), `#sgPushRepoModal` (L1090), `#sgPushRepoForm` (L1091), `#sgPushRepoTitle` (L1093), `#sgPushSummaryCallout` (L1094), `#sgPushMetricsGrid` (L1095), `#sgPushChangedItemsWrap` (L1096), `#sgPushRemoteOverwriteBanner` (L1098), `#sgPushRemoteOverwriteTitle` (L1099), `#sgPushRemoteOverwriteBody` (L1100), `#sgPushRemoteDenyBtn` (L1102), `#sgPushRemoteConfirmBtn` (L1103), `#sgPushBranchSelect` (L1109), `#sgPushCommitMessage` (L1112), `#sgPushCustomBranchWrap` (L1116), `#sgPushCustomBranchInput` (L1118), `#sgPushAuthorName` (L1124), `#sgPushAuthorEmail` (L1127), `#sgPushTokenStatusNote` (L1131), `#sgPushTokenInputWrap` (L1132), `#sgPushTokenInput` (L1134), `#sgPushModalError` (L1138), `#sgPushModalSuccess` (L1139), `#sgPushCancelBtn` (L1142), `#sgPushInspectRemoteBtn` (L1143), `#sgPushSubmitBtn` (L1144)

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
| `sessionStorage` | `biteshark_admin_viewpoint_v1` | `getItem, removeItem, setItem` | `public/admin.js:L319`, `public/admin.js:L320`, `public/auth-client.js:L23`, `public/role-experience.js:L1165` |
| `sessionStorage` | `biteshark_pending_invite_v1` | `getItem, removeItem, setItem` | `public/admin.js:L5119`, `public/role-experience.js:L100`, `public/role-experience.js:L92`, `public/role-experience.js:L96` |
| `sessionStorage` | `bs_support_draft_v1` | `getItem, removeItem, setItem` | `public/admin.js:L5118`, `public/auth-client.js:L22`, `public/role-experience.js:L106`, `public/role-experience.js:L109` |

## CSS Stylesheets, Custom Properties & Responsive Breakpoints (21)

| Stylesheet | Custom Properties Defined | Media Queries | `!important` Declarations |
|---|---:|---:|---:|
| [public/admin-style-guide.css](../../../public/admin-style-guide.css) | 0 | 2 | 2 |
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
