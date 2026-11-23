# Code Registry — First-Party Symbol & Module Index

> [!NOTE]
> **Machine-Generated Reference Inventory** — Do not hand-edit. Regenerate via `npm run registry:docs` (`node tools/code-registry/cli.mjs generate-docs`).
> - **Repository**: `https://github.com/yamanalmasaleha-png/trukly-`
> - **Provenance Mode**: `committed_source_digest` *(branch/detached-HEAD invariant; commit-bound runs use `npm run registry:scan -- --include-timestamp`)*
> - **Generator**: `biteshark-code-registry@2.0.0` (`biteshark.code-registry.v2`)
> - **Source Analysis Digest**: `0c5a573f94b12f309155ebe3b55b4d209581e87bff6c937910fc952c9c64d592`
> - **Analysis Scope & Limits**: Static AST, HTML, CSS, and SQL analysis without executing application modules. Relationships distinguish confirmed_static, documented_wrapper, inferred_candidate, and dynamic_unresolved; static analysis does not prove runtime behavioral correctness.

## Coverage Summary

| Metric | Count |
|---|---:|
| JavaScript / CJS / ESM Files Scanned | 148 |
| Parse Failures | 0 |
| Functions, Methods & Handlers | 3322 |
| Classes | 22 |
| Top-Level Constants | 744 |
| Browser Globals & Window Registrations | 671 |
| Confirmed Static Call Edges | 8392 |
| Inferred Candidate Call Edges | 60 |

> **Navigation & Exact Lookup**: Every module and symbol is listed **without truncation** in the 5 area catalogs below. For connected terminal/assistant lookups (showing callers, callees, contracts, routes, tables, and test evidence), run `npm run registry:locate -- <identifier>`.

## Complete Non-Truncated Symbol Catalogs by Area

| Area Catalog | Modules | Indexed Symbols | Exports |
|---|---:|---:|---:|
| [Server & Runtime Adapter (`server/`, `packages/`)](symbols/server-and-runtime.md) | 7 | 153 | 26 |
| [Shared Backend Libraries (`lib/`)](symbols/shared-libraries.md) | 25 | 546 | 417 |
| [Domain API Handlers (`api/`)](symbols/domain-api-handlers.md) | 30 | 61 | 91 |
| [Browser Frontend Scripts (`public/`)](symbols/frontend-scripts.md) | 22 | 1211 | 0 |
| [Operator Scripts & Code Registry Tooling (`scripts/`, `tools/`)](symbols/scripts-and-tooling.md) | 23 | 254 | 81 |

## Module Directory

| Module | Area Catalog | Symbols | Exported / Window Globals |
|---|---|---:|---|
| [packages/runtime-adapter/index.js](../../../packages/runtime-adapter/index.js) | [server-and-runtime.md](symbols/server-and-runtime.md) | 10 | `configureStandaloneAdapter`, `bindVerifiedRequestUser`, `runWithRequestContext`, `getActiveRequestContext`, `db`, `auth` |
| [server/admin-routes.js](../../../server/admin-routes.js) | [server-and-runtime.md](symbols/server-and-runtime.md) | 82 | `EVIDENCE_UPLOAD_MAX_JSON_BYTES`, `isGovernanceApiPath`, `handleGovernanceApiRequest` |
| [server/app.js](../../../server/app.js) | [server-and-runtime.md](symbols/server-and-runtime.md) | 37 | `DEFAULT_MAX_JSON_BYTES`, `AUTH_MAX_JSON_BYTES`, `DIAGNOSTICS_REPORT_MAX_JSON_BYTES`, `createStandaloneServer` |
| [server/customer-exploration-routes.js](../../../server/customer-exploration-routes.js) | [server-and-runtime.md](symbols/server-and-runtime.md) | 6 | `CUSTOMER_EXPLORATION_PATHS`, `handleCustomerExplorationRoute` |
| [server/customer-profile-routes.js](../../../server/customer-profile-routes.js) | [server-and-runtime.md](symbols/server-and-runtime.md) | 8 | `CUSTOMER_PROFILE_PATHS`, `resolveCallerProfileFeatureFlags`, `recordProfileDiagnostic`, `handleCustomerProfileRoute`, `applyUnlistedSharedSecurityHeaders`, `handlePublicSharedPageRequest`, `handlePublicSharedPhotoRequest` |
| [server/index.js](../../../server/index.js) | [server-and-runtime.md](symbols/server-and-runtime.md) | 8 | — |
| [server/routes.js](../../../server/routes.js) | [server-and-runtime.md](symbols/server-and-runtime.md) | 2 | `STATIC_API_ROUTES`, `DYNAMIC_TRUCK_BY_ID_ROUTE`, `REGISTERED_DOMAIN_ROUTE_COUNT`, `matchDomainApiRoute` |
| [lib/admin-governance.js](../../../lib/admin-governance.js) | [shared-libraries.md](symbols/shared-libraries.md) | 15 | `INVITATION_TTL_MS`, `MAX_EVIDENCE_BYTES`, `MAX_EVIDENCE_PER_APPLICATION`, `MAX_MOD_TEMP_RESTRICTION_HOURS`, `INVITATION_ROLE_LABELS`, `sha256Hex`, `generateOpaqueToken`, `normalizeEmailStrict` |
| [lib/admin-test-customer.js](../../../lib/admin-test-customer.js) | [shared-libraries.md](symbols/shared-libraries.md) | 23 | `ADMIN_TEST_CUSTOMER_USER_ID`, `ADMIN_TEST_CUSTOMER_EMAIL`, `ADMIN_TEST_CUSTOMER_COOKIE_NAME`, `ADMIN_TEST_CUSTOMER_TTL_SECONDS`, `hasCustomerProfileSurface`, `isAdminTestCustomerAllowed`, `buildAdminTestCustomerCookieHeader`, `buildClearedAdminTestCustomerCookieHeader` |
| [lib/age-policy.js](../../../lib/age-policy.js) | [shared-libraries.md](symbols/shared-libraries.md) | 9 | `PROPOSED_MIN_ACCOUNT_AGE`, `AGE_POLICY_VERSION`, `SHARING_MIN_ADULT_AGE`, `SHARING_ELIGIBILITY_POLICY_VERSION`, `AGE_BOUNDARY_TIMEZONE`, `MIN_PLAUSIBLE_BIRTH_YEAR`, `isGregorianLeapYear`, `daysInGregorianMonth` |
| [lib/authz.js](../../../lib/authz.js) | [shared-libraries.md](symbols/shared-libraries.md) | 20 | `UUID_RE`, `ROLE_LABELS`, `normalizeAdminLevel`, `isTempRestrictionActive`, `evaluateEffectiveVendorRestrictions`, `applyPrivateNoStoreHeaders`, `VALID_WRITE_PAUSE_SCOPES`, `inspectWritePauseConfig` |
| [lib/catalog.js](../../../lib/catalog.js) | [shared-libraries.md](symbols/shared-libraries.md) | 1 | `BOOKING_PACKAGES`, `CANONICAL_VENDORS`, `VENDORS_BY_ID`, `getCanonicalVendor` |
| [lib/client-ip.js](../../../lib/client-ip.js) | [shared-libraries.md](symbols/shared-libraries.md) | 5 | `TRUSTED_CLIENT_IP_SYMBOL`, `normalizeIpAddress`, `isLoopbackIp`, `resolveTrustedClientIp`, `stampTrustedClientIp` |
| [lib/customer-exploration.js](../../../lib/customer-exploration.js) | [shared-libraries.md](symbols/shared-libraries.md) | 58 | `EXPLORATION_TIMEZONE`, `POINTS_PER_VISIT`, `POINTS_PER_PHOTO`, `MAX_VISIT_NOTE_LENGTH`, `MAX_PHOTO_CAPTION_LENGTH`, `MAX_SAVED_TRAILS_PER_USER`, `WEEKLY_CHALLENGE_TARGET`, `NON_MONETARY_DISCLOSURE` |
| [lib/customer-profile.js](../../../lib/customer-profile.js) | [shared-libraries.md](symbols/shared-libraries.md) | 92 | `MAX_COLLECTIONS_PER_USER`, `MAX_ENTRIES_PER_COLLECTION`, `MAX_COLLECTION_TITLE_LENGTH`, `MAX_COLLECTION_INTRO_LENGTH`, `MAX_ENTRY_RECOMMENDATION_LENGTH`, `MAX_ACTIVE_SHARES_PER_COLLECTION`, `MAX_DISPLAY_NAME_LENGTH`, `MAX_BIO_LENGTH` |
| [lib/dates.js](../../../lib/dates.js) | [shared-libraries.md](symbols/shared-libraries.md) | 7 | `MAX_BOOKING_DAYS_AHEAD`, `isValidCalendarDate`, `normalizeCalendarDate`, `getPacificToday`, `validateFuturePacificDate`, `isValidTimeValue` |
| [lib/db-tx.js](../../../lib/db-tx.js) | [shared-libraries.md](symbols/shared-libraries.md) | 7 | `SessionEligibilityError`, `clearTxVerificationState`, `respondIfSessionEligibilityError`, `withTransaction` |
| [lib/diagnostics.js](../../../lib/diagnostics.js) | [shared-libraries.md](symbols/shared-libraries.md) | 30 | `CLIENT_BUNDLE_VERSION`, `REPOSITORY_COMMIT_BASE_URL`, `ALLOWED_COMPONENTS`, `ALLOWED_SEVERITIES`, `ALLOWED_OUTCOMES`, `ALLOWED_TRIAGE_STATUSES`, `ALLOWED_FEATURE_KEYS`, `TOP_ONLY_FEATURE_KEYS` |
| [lib/discovery.js](../../../lib/discovery.js) | [shared-libraries.md](symbols/shared-libraries.md) | 27 | `isVendorPubliclyDiscoverable`, `CATALOG_SECTIONS`, `MEASURED_LOCATION_ACCURACIES`, `FORBIDDEN_SELF_ELEVATION_FIELDS`, `findForbiddenSelfElevationField`, `validateCoordinates`, `milesBetween`, `shiftCalendarDate` |
| [lib/editorial-stories.js](../../../lib/editorial-stories.js) | [shared-libraries.md](symbols/shared-libraries.md) | 2 | `EDITORIAL_STORIES`, `EDITORIAL_STORIES_BY_ID`, `EDITORIAL_STORIES_BY_VENDOR_ID`, `buildPublicStoriesPayload` |
| [lib/env-compat.js](../../../lib/env-compat.js) | [shared-libraries.md](symbols/shared-libraries.md) | 4 | `EnvAliasConflictError`, `SECURITY_CRITICAL_ENV_SUFFIXES`, `readEnvCompat`, `findSecurityEnvConflicts`, `assertNoSecurityEnvConflicts` |
| [lib/feature-controls.js](../../../lib/feature-controls.js) | [shared-libraries.md](symbols/shared-libraries.md) | 24 | `VALID_FEATURE_STATES`, `VALID_FEATURE_AUDIENCES`, `PROTECTED_ESSENTIAL_CAPABILITIES`, `FEATURE_CONTROLS_REGISTRY`, `FEATURE_CONTROLS_BY_KEY`, `assertCycleFreeFeatureRegistry`, `ROUTE_FEATURE_ENFORCEMENT_RULES`, `setSimulatedFeatureConfigFailureForTests` |
| [lib/json-schema-lite.js](../../../lib/json-schema-lite.js) | [shared-libraries.md](symbols/shared-libraries.md) | 6 | `validateAgainstJsonSchema`, `validateJsonWithSchemaFile` |
| [lib/map-config.js](../../../lib/map-config.js) | [shared-libraries.md](symbols/shared-libraries.md) | 5 | `ALLOWLISTED_MAP_PROVIDERS`, `resolveMapRuntimeConfig` |
| [lib/pager-notifications.js](../../../lib/pager-notifications.js) | [shared-libraries.md](symbols/shared-libraries.md) | 35 | `MAX_ACTIVE_SUBSCRIPTIONS_PER_PAGER`, `MAX_CATCHUP_DELIVERIES_PER_EVENT`, `READY_FLAP_COOLDOWN_MS`, `WORKER_LEASE_SECONDS`, `DEFAULT_WORKER_CONCURRENCY`, `DEFAULT_PROVIDER_TIMEOUT_MS`, `DEFAULT_WORKER_EXECUTION_BUDGET_MS`, `RETRY_BACKOFF_SECONDS` |
| [lib/photo-storage.js](../../../lib/photo-storage.js) | [shared-libraries.md](symbols/shared-libraries.md) | 15 | `MAX_PHOTO_UPLOAD_BYTES`, `MAX_PHOTO_JSON_BODY_BYTES`, `MAX_ACTIVE_PHOTOS_PER_USER`, `MAX_PHOTO_DIMENSION_PX`, `MAX_PHOTO_INPUT_PIXELS`, `DEFAULT_MIN_FREE_DISK_BYTES`, `SUPPORTED_PHOTO_MIMES`, `PhotoStorageError` |
| [lib/request-context.js](../../../lib/request-context.js) | [shared-libraries.md](symbols/shared-libraries.md) | 2 | `runWithGovernanceContext`, `getActiveGovernanceContext` |
| [lib/standalone-auth.js](../../../lib/standalone-auth.js) | [shared-libraries.md](symbols/shared-libraries.md) | 75 | `SESSION_COOKIE_NAME`, `ADMIN_TEST_CUSTOMER_COOKIE_NAME`, `ADMIN_TEST_CUSTOMER_USER_ID`, `ADMIN_TEST_CUSTOMER_EMAIL`, `AGE_GATE_COOKIE_NAME`, `DEFAULT_AGE_GATE_COOLDOWN_SECONDS`, `AUTH_RATE_LIMIT_RETENTION_MS`, `AUTH_TELEMETRY_RETENTION_MS` |
| [lib/style-guide-admin.js](../../../lib/style-guide-admin.js) | [shared-libraries.md](symbols/shared-libraries.md) | 30 | `resolveStyleGuideReleaseRoot`, `resolveStyleGuideStorageDir`, `inspectPersistenceHealth`, `resolveGitHubPushConfig`, `hasSavedDecisionContent`, `summarizeDecisionValuePreview`, `computeStyleGuideChangeReport`, `loadCurrentWorkspaceSnapshot` |
| [lib/style-guide-core.js](../../../lib/style-guide-core.js) | [shared-libraries.md](symbols/shared-libraries.md) | 31 | `STYLE_GUIDE_GENERATOR_VERSION`, `STYLE_GUIDE_SCHEMA_REL_PATH`, `STYLE_GUIDE_DECISIONS_REL_PATH`, `STYLE_GUIDE_DIR_REL_PATH`, `normalizePlaceholderCandidate`, `isPlaceholderString`, `containsPlaceholderOrBlankLeaf`, `anchorSlug` |
| [lib/support-tickets.js](../../../lib/support-tickets.js) | [shared-libraries.md](symbols/shared-libraries.md) | 14 | `VENDOR_SUPPORT_CATEGORIES`, `CATEGORY_LABELS`, `VALID_DB_CATEGORIES`, `CATEGORY_ALIASES`, `REPORTER_URGENCY_LABELS`, `VALID_REPORTER_URGENCIES`, `STAFF_PRIORITY_LABELS`, `VALID_STAFF_PRIORITIES` |
| [lib/webpush-crypto.js](../../../lib/webpush-crypto.js) | [shared-libraries.md](symbols/shared-libraries.md) | 9 | `toBase64Url`, `fromBase64Url`, `generateVapidKeys`, `validateVapidKeyPair`, `createVapidHeaders`, `verifyVapidJwt`, `validateSubscriberKeys`, `encryptWebPushPayload` |
| [api/bookings/create.js](../../../api/bookings/create.js) | [domain-api-handlers.md](symbols/domain-api-handlers.md) | 6 | `access`, `methods`, `formatBookingResponse`, `default` |
| [api/bookings/list.js](../../../api/bookings/list.js) | [domain-api-handlers.md](symbols/domain-api-handlers.md) | 1 | `access`, `methods`, `default` |
| [api/catalog/cities.js](../../../api/catalog/cities.js) | [domain-api-handlers.md](symbols/domain-api-handlers.md) | 1 | `access`, `methods`, `default` |
| [api/catalog/cuisines.js](../../../api/catalog/cuisines.js) | [domain-api-handlers.md](symbols/domain-api-handlers.md) | 1 | `access`, `methods`, `default` |
| [api/catalog/featured.js](../../../api/catalog/featured.js) | [domain-api-handlers.md](symbols/domain-api-handlers.md) | 2 | `access`, `methods`, `default` |
| [api/community/list.js](../../../api/community/list.js) | [domain-api-handlers.md](symbols/domain-api-handlers.md) | 1 | `access`, `methods`, `default` |
| [api/community/mine.js](../../../api/community/mine.js) | [domain-api-handlers.md](symbols/domain-api-handlers.md) | 2 | `access`, `methods`, `default` |
| [api/community/moderate.js](../../../api/community/moderate.js) | [domain-api-handlers.md](symbols/domain-api-handlers.md) | 3 | `access`, `methods`, `default` |
| [api/community/post.js](../../../api/community/post.js) | [domain-api-handlers.md](symbols/domain-api-handlers.md) | 2 | `access`, `methods`, `default` |
| [api/favorites/list.js](../../../api/favorites/list.js) | [domain-api-handlers.md](symbols/domain-api-handlers.md) | 1 | `access`, `methods`, `default` |
| [api/favorites/toggle.js](../../../api/favorites/toggle.js) | [domain-api-handlers.md](symbols/domain-api-handlers.md) | 2 | `access`, `methods`, `default` |
| [api/notifications/settings.js](../../../api/notifications/settings.js) | [domain-api-handlers.md](symbols/domain-api-handlers.md) | 2 | `access`, `methods`, `default` |
| [api/owner/bookings.js](../../../api/owner/bookings.js) | [domain-api-handlers.md](symbols/domain-api-handlers.md) | 1 | `access`, `methods`, `default` |
| [api/owner/location.js](../../../api/owner/location.js) | [domain-api-handlers.md](symbols/domain-api-handlers.md) | 3 | `access`, `methods`, `default` |
| [api/owner/profile.js](../../../api/owner/profile.js) | [domain-api-handlers.md](symbols/domain-api-handlers.md) | 2 | `access`, `methods`, `default` |
| [api/owner/requests.js](../../../api/owner/requests.js) | [domain-api-handlers.md](symbols/domain-api-handlers.md) | 2 | `access`, `methods`, `default` |
| [api/owner/schedule.js](../../../api/owner/schedule.js) | [domain-api-handlers.md](symbols/domain-api-handlers.md) | 2 | `access`, `methods`, `default` |
| [api/owner/stats.js](../../../api/owner/stats.js) | [domain-api-handlers.md](symbols/domain-api-handlers.md) | 1 | `access`, `methods`, `default` |
| [api/pager/staff.js](../../../api/pager/staff.js) | [domain-api-handlers.md](symbols/domain-api-handlers.md) | 2 | `access`, `methods`, `default` |
| [api/pager/status.js](../../../api/pager/status.js) | [domain-api-handlers.md](symbols/domain-api-handlers.md) | 1 | `access`, `methods`, `default` |
| [api/pager/subscriptions.js](../../../api/pager/subscriptions.js) | [domain-api-handlers.md](symbols/domain-api-handlers.md) | 5 | `access`, `methods`, `default` |
| [api/pager/telemetry.js](../../../api/pager/telemetry.js) | [domain-api-handlers.md](symbols/domain-api-handlers.md) | 2 | `access`, `methods`, `default` |
| [api/pager/update.js](../../../api/pager/update.js) | [domain-api-handlers.md](symbols/domain-api-handlers.md) | 2 | `access`, `methods`, `default` |
| [api/pager/worker.js](../../../api/pager/worker.js) | [domain-api-handlers.md](symbols/domain-api-handlers.md) | 4 | `access`, `methods`, `default` |
| [api/schedule/today.js](../../../api/schedule/today.js) | [domain-api-handlers.md](symbols/domain-api-handlers.md) | 2 | `access`, `methods`, `default` |
| [api/trucks.js](../../../api/trucks.js) | [domain-api-handlers.md](symbols/domain-api-handlers.md) | 1 | `access`, `methods`, `default` |
| [api/trucks/[id].js](../../../api/trucks/[id].js) | [domain-api-handlers.md](symbols/domain-api-handlers.md) | 1 | `access`, `methods`, `default` |
| [api/trucks/availability.js](../../../api/trucks/availability.js) | [domain-api-handlers.md](symbols/domain-api-handlers.md) | 1 | `access`, `methods`, `default` |
| [api/trucks/nearby.js](../../../api/trucks/nearby.js) | [domain-api-handlers.md](symbols/domain-api-handlers.md) | 2 | `access`, `methods`, `default` |
| [api/trucks/search.js](../../../api/trucks/search.js) | [domain-api-handlers.md](symbols/domain-api-handlers.md) | 3 | `access`, `methods`, `default` |
| [public/admin-style-guide.js](../../../public/admin-style-guide.js) | [frontend-scripts.md](symbols/frontend-scripts.md) | 149 | `window.bitesharkAdminStyleGuide` |
| [public/admin.js](../../../public/admin.js) | [frontend-scripts.md](symbols/frontend-scripts.md) | 216 | `window.location.href`, `window.location.href`, `window.location.href`, `window.location.href`, `window.location.href`, `window.location.href`, `window.inviteDraftKey`, `window.inviteDraftSig` |
| [public/app.js](../../../public/app.js) | [frontend-scripts.md](symbols/frontend-scripts.md) | 179 | `window.activeKind`, `window.activeCuisine`, `window.activeCuisine`, `window.activeKind`, `window.trucks`, `window.catalogVersion`, `window.selectedTruck`, `window.activeTileLayer` |
| [public/auth-client.js](../../../public/auth-client.js) | [frontend-scripts.md](symbols/frontend-scripts.md) | 12 | `window.bitesharkAuth`, `window.trucklyAuth`, `window.biteshark` |
| [public/characters.js](../../../public/characters.js) | [frontend-scripts.md](symbols/frontend-scripts.md) | 3 | `window.applyFilters` |
| [public/coffee-club.js](../../../public/coffee-club.js) | [frontend-scripts.md](symbols/frontend-scripts.md) | 2 | — |
| [public/community.js](../../../public/community.js) | [frontend-scripts.md](symbols/frontend-scripts.md) | 21 | `window.communityDraftKey`, `window.communityDraftSig`, `window.communityDraftKey`, `window.communityDraftSig`, `window.communityDraftKey`, `window.communityDraftSig` |
| [public/customer-profile.js](../../../public/customer-profile.js) | [frontend-scripts.md](symbols/frontend-scripts.md) | 52 | `window.openCustomerProfile`, `window.bitesharkOpenCustomerProfile`, `window.bitesharkResetProfileUiOnAuthChange`, `window.bitesharkRegisterProfileAuthResetListener`, `window.bitesharkRegisterCollectionsRenderer` |
| [public/diagnostics-client.js](../../../public/diagnostics-client.js) | [frontend-scripts.md](symbols/frontend-scripts.md) | 28 | `window.loadedServerReleaseSha`, `window.latestServerReleaseSha`, `window.reportsSentCount`, `window.activeReportInFlight`, `window.activeReportInFlight` |
| [public/exploration-client.js](../../../public/exploration-client.js) | [frontend-scripts.md](symbols/frontend-scripts.md) | 55 | `window.bitesharkExploration`, `window.bitesharkExploration` |
| [public/greatest-hits-sharing.js](../../../public/greatest-hits-sharing.js) | [frontend-scripts.md](symbols/frontend-scripts.md) | 32 | — |
| [public/greatest-hits.js](../../../public/greatest-hits.js) | [frontend-scripts.md](symbols/frontend-scripts.md) | 60 | `window.bitesharkGreatestHitsHooks` |
| [public/guide-passport.js](../../../public/guide-passport.js) | [frontend-scripts.md](symbols/frontend-scripts.md) | 33 | `window.preselectedVisitVendorId`, `window.journalState`, `window.bitesharkResetExplorationUiOnAuthChange` |
| [public/listing-highlights.js](../../../public/listing-highlights.js) | [frontend-scripts.md](symbols/frontend-scripts.md) | 5 | `window.bitesharkListingHighlights`, `window.bitesharkListingHighlights`, `window.openDetail` |
| [public/local-guides.js](../../../public/local-guides.js) | [frontend-scripts.md](symbols/frontend-scripts.md) | 38 | `window.activeGuidesTab`, `window.preselectedVisitVendorId`, `window.preselectedPhotoVendorId`, `window.preselectedPhotoVendorId`, `window.pendingDeletePhotoId`, `window.pendingDeletePhotoId`, `window.pendingDeletePhotoId` |
| [public/pager.js](../../../public/pager.js) | [frontend-scripts.md](symbols/frontend-scripts.md) | 43 | `window.pagerDemoAuto`, `window.pagerToken`, `window.pagerDemo`, `window.pagerStatus`, `window.pagerPushError`, `window.pagerDemoTimer`, `window.pagerDemoTimer`, `window.pagerDemoTimer` |
| [public/profile-client.js](../../../public/profile-client.js) | [frontend-scripts.md](symbols/frontend-scripts.md) | 23 | `window.bitesharkProfile`, `window.bitesharkProfile` |
| [public/role-experience.js](../../../public/role-experience.js) | [frontend-scripts.md](symbols/frontend-scripts.md) | 189 | `window.resolveInitialFeatures`, `window.fetch`, `window.location.href`, `window.location.href`, `window.location.href`, `window.rxAuthEpoch`, `window.epLatestExportPayload`, `window.epConfirmTarget` |
| [public/shared-collection-page.js](../../../public/shared-collection-page.js) | [frontend-scripts.md](symbols/frontend-scripts.md) | 6 | — |
| [public/smart.js](../../../public/smart.js) | [frontend-scripts.md](symbols/frontend-scripts.md) | 45 | `window.smartMode`, `window.currentTrailOffset`, `window.currentTrailOffset`, `window.finderRotationOffset`, `window.currentTrailTown`, `window.currentTrailTheme`, `window.currentTrailOffset`, `window.currentTrailPreview` |
| [public/street-whispers.js](../../../public/street-whispers.js) | [frontend-scripts.md](symbols/frontend-scripts.md) | 17 | `window.streetQuizIndex`, `window.streetCurrentPick`, `window.streetMissionIndex` |
| [public/sw.js](../../../public/sw.js) | [frontend-scripts.md](symbols/frontend-scripts.md) | 3 | — |
| [scripts/bootstrap-top-admin.cjs](../../../scripts/bootstrap-top-admin.cjs) | [scripts-and-tooling.md](symbols/scripts-and-tooling.md) | 6 | — |
| [scripts/build-linux-release-tarball.cjs](../../../scripts/build-linux-release-tarball.cjs) | [scripts-and-tooling.md](symbols/scripts-and-tooling.md) | 2 | — |
| [scripts/dev-server.cjs](../../../scripts/dev-server.cjs) | [scripts-and-tooling.md](symbols/scripts-and-tooling.md) | 23 | `window.__BITESHARK_RUNTIME__` |
| [scripts/dev-workbench/debug-admin.js](../../../scripts/dev-workbench/debug-admin.js) | [scripts-and-tooling.md](symbols/scripts-and-tooling.md) | 31 | `window.__BITESHARK__`, `window.__BITESHARK__.user`, `window.__trucklyFetchWrapped`, `window.fetch`, `window.trucklyDebug` |
| [scripts/manage-feature-controls.cjs](../../../scripts/manage-feature-controls.cjs) | [scripts-and-tooling.md](symbols/scripts-and-tooling.md) | 4 | — |
| [scripts/operator-read-my-otp.cjs](../../../scripts/operator-read-my-otp.cjs) | [scripts-and-tooling.md](symbols/scripts-and-tooling.md) | 3 | — |
| [scripts/run-migrations.cjs](../../../scripts/run-migrations.cjs) | [scripts-and-tooling.md](symbols/scripts-and-tooling.md) | 4 | — |
| [scripts/run-pager-worker.cjs](../../../scripts/run-pager-worker.cjs) | [scripts-and-tooling.md](symbols/scripts-and-tooling.md) | 9 | — |
| [scripts/seed-sql-reader.cjs](../../../scripts/seed-sql-reader.cjs) | [scripts-and-tooling.md](symbols/scripts-and-tooling.md) | 3 | `loadSeedVendorsFromMigration014` |
| [scripts/staging-runtime-probe.js](../../../scripts/staging-runtime-probe.js) | [scripts-and-tooling.md](symbols/scripts-and-tooling.md) | 5 | `access`, `methods`, `default` |
| [tools/code-registry/backend-db-analyzer.mjs](../../../tools/code-registry/backend-db-analyzer.mjs) | [scripts-and-tooling.md](symbols/scripts-and-tooling.md) | 39 | `extractFeatureControlsContract`, `extractDiagnosticsContract`, `extractAgePolicyAllowlist`, `extractBackendRoutes`, `analyzeMigrationsAndSchema`, `generateMermaidErDiagram` |
| [tools/code-registry/cli.mjs](../../../tools/code-registry/cli.mjs) | [scripts-and-tooling.md](symbols/scripts-and-tooling.md) | 15 | — |
| [tools/code-registry/compare-impact.mjs](../../../tools/code-registry/compare-impact.mjs) | [scripts-and-tooling.md](symbols/scripts-and-tooling.md) | 15 | `scanGitRefSnapshot`, `resolveMergeBaseSha`, `loadGovernanceFilesFromRef`, `diffGovernanceState`, `compareRegistrySnapshots`, `formatImpactReportMarkdown` |
| [tools/code-registry/doc-generator.mjs](../../../tools/code-registry/doc-generator.mjs) | [scripts-and-tooling.md](symbols/scripts-and-tooling.md) | 22 | `buildCompactRegistrySummary`, `renderSymbolIndexOverviewMarkdown`, `renderSymbolAreaCatalogMarkdown`, `renderContractsCatalogMarkdown`, `renderRouteInventoryMarkdown`, `renderFrontendInventoryMarkdown`, `renderSchemaInventoryMarkdown`, `renderDriftReportMarkdown` |
| [tools/code-registry/drift-detector.mjs](../../../tools/code-registry/drift-detector.mjs) | [scripts-and-tooling.md](symbols/scripts-and-tooling.md) | 8 | `makeStableFindingId`, `applyScopedSuppressions`, `validateMarkdownLinks`, `detectRepositoryDrift` |
| [tools/code-registry/html-css-analyzer.mjs](../../../tools/code-registry/html-css-analyzer.mjs) | [scripts-and-tooling.md](symbols/scripts-and-tooling.md) | 7 | `analyzeHtmlFile`, `analyzeCssFile` |
| [tools/code-registry/js-analyzer.mjs](../../../tools/code-registry/js-analyzer.mjs) | [scripts-and-tooling.md](symbols/scripts-and-tooling.md) | 32 | `parseJavaScriptSource`, `computeAstNodeFingerprint`, `analyzeJavaScriptFile`, `extractCalledIdentifiersInInlineHandler` |
| [tools/code-registry/relationship-resolver.mjs](../../../tools/code-registry/relationship-resolver.mjs) | [scripts-and-tooling.md](symbols/scripts-and-tooling.md) | 5 | `resolveSymbolRelationships` |
| [tools/code-registry/scanner.mjs](../../../tools/code-registry/scanner.mjs) | [scripts-and-tooling.md](symbols/scripts-and-tooling.md) | 3 | `CANONICAL_GENERATED_DOC_PATHS`, `scanRepositorySnapshot` |
| [tools/code-registry/schema-validator.mjs](../../../tools/code-registry/schema-validator.mjs) | [scripts-and-tooling.md](symbols/scripts-and-tooling.md) | 0 | `validateAgainstJsonSchema`, `validateJsonWithSchemaFile` |
| [tools/code-registry/schema-versions.mjs](../../../tools/code-registry/schema-versions.mjs) | [scripts-and-tooling.md](symbols/scripts-and-tooling.md) | 15 | `GENERATOR_NAME`, `GENERATOR_VERSION`, `REGISTRY_SCHEMA_VERSION`, `SUMMARY_SCHEMA_VERSION`, `IMPACT_SCHEMA_VERSION`, `DRIFT_BASELINE_SCHEMA_VERSION`, `SUPPRESSIONS_SCHEMA_VERSION`, `CONTRACTS_SCHEMA_VERSION` |
| [tools/style-guide/cli.mjs](../../../tools/style-guide/cli.mjs) | [scripts-and-tooling.md](symbols/scripts-and-tooling.md) | 3 | — |
| [tools/style-guide/lib.mjs](../../../tools/style-guide/lib.mjs) | [scripts-and-tooling.md](symbols/scripts-and-tooling.md) | 0 | `STYLE_GUIDE_GENERATOR_VERSION`, `STYLE_GUIDE_SCHEMA_REL_PATH`, `STYLE_GUIDE_DECISIONS_REL_PATH`, `STYLE_GUIDE_DIR_REL_PATH`, `normalizePlaceholderCandidate`, `isPlaceholderString`, `containsPlaceholderOrBlankLeaf`, `anchorSlug` |
