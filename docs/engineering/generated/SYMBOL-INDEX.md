# Code Registry — First-Party Symbol & Module Index

> [!NOTE]
> **Machine-Generated Reference Inventory** — Do not hand-edit. Regenerate via `npm run registry:docs` (`node tools/code-registry/cli.mjs generate-docs`).
> - **Repository**: `https://github.com/yamanalmasaleha-png/trukly-`
> - **Branch / Ref at Generation**: `feature/private-profiles-greatest-hits`
> - **Generator**: `biteshark-code-registry@1.0.0` (`biteshark.code-registry.v1`)
> - **Deterministic Source Digest**: `92550b00fa6f82baa76cb64e2ceec7d8554424ae7b8d600819352b703d3c195b`
> - **Analysis Basis**: Static AST, HTML, CSS, and SQL analysis without executing application modules. Dynamic string concatenation, computed property lookups, and runtime reflection are labeled as dynamic/unresolved rather than assumed complete.

## Coverage Summary

| Metric | Count |
|---|---:|
| JavaScript / CJS / ESM Files Scanned | 126 |
| Parse Failures | 0 |
| Named Functions, Methods & Handlers | 2882 |
| Classes | 21 |
| Top-Level Constants | 624 |
| Browser Globals & Assignments | 630 |

> **Type Notation**: BiteShark is plain JavaScript without TypeScript annotations. Parameter types below distinguish `inferred_from_default`, `inferred_from_destructuring`, `inferred_from_rest`, and `undeclared` (`unknown`). Signatures are never invented.

## 1. Server & Runtime Adapter (`server/`, `packages/`)

### [packages/runtime-adapter/index.js](../../../packages/runtime-adapter/index.js) (`module`)
- **Imports / Dependencies**: `node:async_hooks`
- **Exports**: `configureStandaloneAdapter`, `bindVerifiedRequestUser`, `runWithRequestContext`, `getActiveRequestContext`, `db`, `auth`
- **Significant Constants**: `requestAls`, `verifiedRequestUsers`, `db` *(exported)*, `auth` *(exported)*

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `configureStandaloneAdapter` | `function` | Yes | `({ db, getUser }: object)` | `void_or_implicit` | `server/app.js:createStandaloneServer` | L13 |
| `bindVerifiedRequestUser` | `function` | Yes | `(req: unknown, user: unknown)` | `sync_value` | `server/app.js:createStandaloneServer$anon_L546_3` | L23 |
| `runWithRequestContext` | `function` | Yes | `(context: unknown, fn: unknown)` | `sync_value` | `server/app.js:createStandaloneServer$anon_L546_3` | L47 |
| `getActiveRequestContext` | `function` | Yes | `()` | `sync_value` | — | L51 |
| `resolveActiveDb` | `function` | No | `()` | `sync_value (throws: thrown_value)` | `packages/runtime-adapter/index.js:query`, `packages/runtime-adapter/index.js:connect`, `packages/runtime-adapter/index.js:transaction` | L55 |
| `query` | `object_method` | No | `(text: unknown, params: unknown)` | `sync_value` | `api/bookings/create.js:default$anon_L147_1`, `api/bookings/list.js:default`, `api/community/list.js:default`, `api/community/mine.js:default$anon_L16_1` | L67 |
| `connect` | `object_method` | No | `()` | `sync_value (throws: Error)` | `lib/db-tx.js:withTransaction$anon_L199_3`, `lib/db-tx.js:withTransaction$anon_L201_4`, `lib/diagnostics.js:withDiagnosticsDb$anon_L420_4`, `lib/diagnostics.js:withDiagnosticsDb$anon_L422_5` | L71 |
| `transaction` | `object_method` | No | `(fn: unknown)` | `async -> promise (throws: thrown_value)` | `lib/db-tx.js:withTransaction`, `public/exploration-client.js:req.onsuccess`, `scripts/dev-server.cjs:transaction` | L82 |
| `pool` | `object_method` | No | `()` | `sync_value` | — | L113 |
| `getUser` | `object_method` | No | `(req: unknown)` | `async -> promise` | `lib/authz.js:resolveIdentity`, `public/app.js:syncAuthAndUserData` | L122 |

### [server/admin-routes.js](../../../server/admin-routes.js) (`module`)
- **Imports / Dependencies**: `../lib/admin-governance.js`, `../lib/age-policy.js`, `../lib/authz.js`, `../lib/client-ip.js`, `../lib/customer-exploration.js`, `../lib/db-tx.js`, `../lib/diagnostics.js`, `../lib/env-compat.js`, `../lib/feature-controls.js`, `../lib/pager-notifications.js`, `../lib/standalone-auth.js`, `../lib/support-tickets.js`, `./customer-exploration-routes.js`, `./customer-profile-routes.js`, `@biteshark/runtime-adapter`
- **Exports**: `EVIDENCE_UPLOAD_MAX_JSON_BYTES`, `isGovernanceApiPath`, `handleGovernanceApiRequest`
- **Significant Constants**: `EVIDENCE_UPLOAD_MAX_JSON_BYTES` *(exported)*, `GOVERNANCE_PATHS`, `READINESS_STATUS_CATALOG`, `VALID_READINESS_STATUSES`, `LAUNCH_INCOMPLETE_REMINDER_TEXT`, `DEPLOYMENT_PORTAL_REMINDER_NOTE`

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `isGovernanceApiPath` | `function` | Yes | `(pathname: unknown)` | `sync_value` | `server/app.js:createStandaloneServer$anon_L546_3` | L165 |
| `maskEmail` | `function` | No | `(email: unknown)` | `sync_value` | `scripts/manage-feature-controls.cjs:<top_level>$anon_L98_1`, `server/admin-routes.js:handleGovernanceApiRequest$anon_L978_11`, `server/admin-routes.js:handleGovernanceApiRequest$anon_L4191_50$anon_L4262_51`, `server/admin-routes.js:handleGovernanceApiRequest$anon_L5521_70$anon_L5536_71` | L174 |
| `validateIsoCalendarDate` | `function` | No | `(raw: unknown, { allowFuture }: object)` | `sync_value` | `server/admin-routes.js:handleGovernanceApiRequest` | L202 |
| `serializeReadinessItemForActor` | `function` | No | `(row: unknown, actorRole: unknown, historyRows: array)` | `sync_value` | `server/admin-routes.js:handleGovernanceApiRequest$anon_L6588_78$anon_L6684_80`, `server/admin-routes.js:handleGovernanceApiRequest$anon_L6734_81`, `server/admin-routes.js:handleGovernanceApiRequest$anon_L6871_82` | L227 |
| `enableAdminTxGuards` | `function` | No | `(tx: unknown, ctx: unknown)` | `async -> promise` | `server/admin-routes.js:deliverAndFinalizeIssuedInvitation$anon_L349_3`, `server/admin-routes.js:handleGovernanceApiRequest$anon_L1096_12`, `server/admin-routes.js:handleGovernanceApiRequest$anon_L1961_23`, `server/admin-routes.js:handleGovernanceApiRequest$anon_L2914_37` | L270 |
| `getRuntimeReleaseSha` | `function` | No | `()` | `sync_value` | `server/admin-routes.js:deliverAndFinalizeIssuedInvitation`, `server/admin-routes.js:handleGovernanceApiRequest` | L282 |
| `loadInvitationEventsMapInTx` | `function` | No | `(tx: unknown, invitationIds: unknown)` | `async -> promise (throws: thrown_value)` | `server/admin-routes.js:deliverAndFinalizeIssuedInvitation$anon_L349_3`, `server/admin-routes.js:handleGovernanceApiRequest$anon_L4571_62`, `server/admin-routes.js:handleGovernanceApiRequest$anon_L4654_65` | L291 |
| `deliverAndFinalizeIssuedInvitation` | `function` | No | `({ dbAdapter, ctx, invitationId, tokenVersion, rawToken, recipientEmail, requestedRole, vendorId, vendorName, expiresAt, actorId, actorRole }: object)` | `async -> promise` | `server/admin-routes.js:handleGovernanceApiRequest` | L318 |
| `recordAndDispatchSupportNotification` | `function` | No | `({ dbAdapter, issueId, ticketNumber, recipientUserId, recipientEmail, eventKind, dedupeKey, statusLabel, isCritical }: object)` | `async -> promise (throws: thrown_value)` | `server/admin-routes.js:handleGovernanceApiRequest` | L462 |
| `handleGovernanceApiRequest` | `function` | Yes | `({ pathname, method, req, query, body, dbAdapter, sendJson, rawRes }: object)` | `async -> promise` | `server/app.js:createStandaloneServer$anon_L546_3$anon_L972_6$anon_L981_7` | L586 |

### [server/app.js](../../../server/app.js) (`module`)
- **Imports / Dependencies**: `../lib/age-policy.js`, `../lib/authz.js`, `../lib/client-ip.js`, `../lib/db-tx.js`, `../lib/diagnostics.js`, `../lib/env-compat.js`, `../lib/feature-controls.js`, `../lib/pager-notifications.js`, `../lib/photo-storage.js`, `../lib/request-context.js`, `../lib/standalone-auth.js`, `../scripts/staging-runtime-probe.js`, `./admin-routes.js`, `./customer-profile-routes.js`, `./routes.js`, `@biteshark/runtime-adapter`, `node:fs`, `node:http`, `node:path`, `node:url`
- **Exports**: `DEFAULT_MAX_JSON_BYTES`, `AUTH_MAX_JSON_BYTES`, `DIAGNOSTICS_REPORT_MAX_JSON_BYTES`, `createStandaloneServer`
- **Significant Constants**: `SERVER_DIR`, `DEFAULT_PUBLIC_DIR`, `DEFAULT_MAX_JSON_BYTES` *(exported)*, `AUTH_MAX_JSON_BYTES` *(exported)*, `DIAGNOSTICS_REPORT_MAX_JSON_BYTES` *(exported)*, `ALLOWED_STATIC_MIME`, `NO_CACHE_STATIC_FILES`, `MUTATING_HTTP_METHODS`

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `escapeHtml` | `function` | No | `(raw: unknown)` | `sync_value` | `server/app.js:renderAdminAccessDeniedHtml` | L126 |
| `sanitizeLoggedRequestPath` | `function` | No | `(pathname: unknown)` | `sync_value` | `server/app.js:createStandaloneServer$anon_L546_3` | L135 |
| `renderProfileFeatureDisabledHtml` | `function` | No | `()` | `sync_value` | `server/app.js:createStandaloneServer$anon_L546_3` | L147 |
| `renderAdminAccessDeniedHtml` | `function` | No | `(userEmail: unknown, roleLabels: array)` | `sync_value` | `server/app.js:createStandaloneServer$anon_L546_3` | L180 |
| `parseActOnBehalfHeaders` | `function` | No | `(req: unknown)` | `sync_value` | `server/app.js:createStandaloneServer$anon_L546_3` | L221 |
| `applyBaselineSecurityHeaders` | `function` | No | `(res: unknown)` | `void_or_implicit` | `server/app.js:createStandaloneServer$anon_L546_3` | L248 |
| `appendSetCookie` | `function` | No | `(res: unknown, cookieValue: unknown)` | `void_or_implicit` | `server/app.js:createStandaloneServer$anon_L546_3` | L254 |
| `isIntentionalMaintenanceResponse` | `function` | No | `(statusCode: unknown, payload: unknown)` | `sync_value` | `server/app.js:res.__bsDiagHook` | L266 |
| `sendJsonResponse` | `function` | No | `(res: unknown, statusCode: unknown, payload: unknown, extraHeaders: object)` | `void_or_implicit` | `server/app.js:json`, `server/app.js:send`, `server/app.js:createStandaloneServer$anon_L546_3`, `server/app.js:res.__bsDiagHook` | L274 |
| `createHandlerResponseAdapter` | `function` | No | `(rawRes: unknown, govState: null_or_object)` | `sync_value` | `server/app.js:createStandaloneServer$anon_L546_3` | L295 |
| `BodyParseError.constructor` | `constructor` | No | `(status: unknown, code: unknown, message: unknown)` | `void_or_implicit` | — | L359 |
| `readBoundedJsonBody` | `function` | No | `(req: unknown, maxBytes: unknown)` | `async -> promise (throws: BodyParseError)` | `server/app.js:createStandaloneServer$anon_L546_3` | L366 |
| `parseQueryObject` | `function` | No | `(searchParams: unknown)` | `sync_value` | `server/app.js:createStandaloneServer$anon_L546_3` | L403 |
| `resolveSafePublicFile` | `function` | No | `(realPublicRoot: unknown, rawPathname: unknown)` | `sync_value` | `server/app.js:createStandaloneServer$anon_L546_3` | L417 |
| `readSafeSecurityFlag` | `function` | No | `(suffix: unknown)` | `sync_value` | `server/app.js:createStandaloneServer$anon_L546_3` | L492 |
| `createStandaloneServer` | `function` | Yes | `({ dbAdapter, publicDir, releaseSha, trustProxy, maxJsonBytes, logger }: object)` | `sync_value (throws: Error)` | `server/index.js:main` | L500 |

### [server/customer-exploration-routes.js](../../../server/customer-exploration-routes.js) (`module`)
- **Imports / Dependencies**: `../lib/authz.js`, `../lib/customer-exploration.js`, `../lib/diagnostics.js`, `../lib/discovery.js`, `../lib/editorial-stories.js`, `../lib/feature-controls.js`, `../lib/photo-storage.js`, `@biteshark/runtime-adapter`
- **Exports**: `CUSTOMER_EXPLORATION_PATHS`, `handleCustomerExplorationRoute`
- **Significant Constants**: `CUSTOMER_EXPLORATION_PATHS` *(exported)*

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `shortInternalActorTag` | `function` | No | `(userId: unknown)` | `sync_value` | `server/customer-exploration-routes.js:recordExplorationDiagnostic`, `server/customer-profile-routes.js:recordProfileDiagnostic` | L55 |
| `resolveCallerExplorationFeatureFlags` | `function` | No | `(dbAdapter: unknown, req: unknown, verifiedUser: unknown)` | `async -> promise` | `server/customer-exploration-routes.js:handleCustomerExplorationRoute` | L61 |
| `recordExplorationDiagnostic` | `function` | No | `(dbAdapter: unknown, req: unknown, { featureKey, operationName, routeTemplate, httpMethod, httpStatus, severity, errorCode, message, retryable, outcomeState, actorId, safeContext }: object)` | `async -> promise` | `server/customer-exploration-routes.js:sendExplorationError`, `server/customer-exploration-routes.js:handleCustomerExplorationRoute` | L106 |
| `sendExplorationError` | `function` | No | `(dbAdapter: unknown, req: unknown, sendJson: unknown, err: unknown, { featureKey, operationName, routeTemplate, method, userId }: object)` | `sync_value (throws: thrown_value)` | `server/customer-exploration-routes.js:handleCustomerExplorationRoute` | L150 |
| `handleCustomerExplorationRoute` | `function` | Yes | `({ pathname, method, req, query, body, verifiedUser, dbAdapter, sendJson, rawRes }: object)` | `async -> promise` | `server/admin-routes.js:handleGovernanceApiRequest` | L203 |

### [server/customer-profile-routes.js](../../../server/customer-profile-routes.js) (`module`)
- **Imports / Dependencies**: `../lib/authz.js`, `../lib/customer-profile.js`, `../lib/diagnostics.js`, `../lib/env-compat.js`, `../lib/feature-controls.js`, `../lib/pager-notifications.js`, `../lib/photo-storage.js`, `@biteshark/runtime-adapter`
- **Exports**: `CUSTOMER_PROFILE_PATHS`, `resolveCallerProfileFeatureFlags`, `recordProfileDiagnostic`, `handleCustomerProfileRoute`, `applyUnlistedSharedSecurityHeaders`, `handlePublicSharedPageRequest`, `handlePublicSharedPhotoRequest`
- **Significant Constants**: `CUSTOMER_PROFILE_PATHS` *(exported)*

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `shortInternalActorTag` | `function` | No | `(userId: unknown)` | `sync_value` | `server/customer-exploration-routes.js:recordExplorationDiagnostic`, `server/customer-profile-routes.js:recordProfileDiagnostic` | L74 |
| `resolveCallerProfileFeatureFlags` | `function` | Yes | `(dbAdapter: unknown, req: unknown, verifiedUser: unknown)` | `async -> promise` | `server/customer-profile-routes.js:handleCustomerProfileRoute`, `server/customer-profile-routes.js:handlePublicSharedPageRequest`, `server/customer-profile-routes.js:handlePublicSharedPhotoRequest` | L80 |
| `recordProfileDiagnostic` | `function` | Yes | `(dbAdapter: unknown, req: unknown, { featureKey, operationName, routeTemplate, httpMethod, httpStatus, severity, errorCode, message, retryable, outcomeState, actorId, safeContext }: object)` | `async -> promise` | `server/customer-profile-routes.js:handleCustomerProfileRoute`, `server/customer-profile-routes.js:handlePublicSharedPageRequest`, `server/customer-profile-routes.js:handlePublicSharedPhotoRequest` | L125 |
| `sendProfileError` | `function` | No | `(sendJson: unknown, req: unknown, err: unknown)` | `sync_value` | `server/customer-profile-routes.js:handleCustomerProfileRoute` | L169 |
| `handleCustomerProfileRoute` | `function` | Yes | `({ pathname, method, req, query, body, verifiedUser, dbAdapter, sendJson, rawRes }: object)` | `async -> promise (throws: CustomerProfileDomainError)` | `server/admin-routes.js:handleGovernanceApiRequest` | L190 |
| `applyUnlistedSharedSecurityHeaders` | `function` | Yes | `(res: unknown)` | `void_or_implicit` | `server/customer-profile-routes.js:handlePublicSharedPageRequest` | L689 |
| `handlePublicSharedPageRequest` | `function` | Yes | `({ rawToken, method, req, res, dbAdapter, viewerAuthenticated }: object)` | `async -> promise` | `server/app.js:createStandaloneServer$anon_L546_3` | L707 |
| `handlePublicSharedPhotoRequest` | `function` | Yes | `({ rawToken, attachmentId, method, req, res, dbAdapter }: object)` | `async -> promise` | `server/app.js:createStandaloneServer$anon_L546_3` | L779 |

### [server/index.js](../../../server/index.js) (`module`)
- **Imports / Dependencies**: `../lib/env-compat.js`, `../lib/standalone-auth.js`, `./app.js`, `pg`

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `validateStartupEnvironment` | `function` | No | `()` | `sync_value (throws: Error)` | `server/index.js:main` | L23 |
| `main` | `function` | No | `()` | `async -> promise (throws: Error)` | `scripts/bootstrap-top-admin.cjs:<top_level>`, `scripts/operator-read-my-otp.cjs:<top_level>`, `server/index.js:<top_level>` | L56 |
| `<top_level>$anon_L163_8` | `anonymous_function` | No | `(err: unknown)` | `void_or_implicit` | — | L163 |

### [server/routes.js](../../../server/routes.js) (`module`)
- **Imports / Dependencies**: `../api/bookings/create.js`, `../api/bookings/list.js`, `../api/catalog/cities.js`, `../api/catalog/cuisines.js`, `../api/catalog/featured.js`, `../api/community/list.js`, `../api/community/mine.js`, `../api/community/moderate.js`, `../api/community/post.js`, `../api/favorites/list.js`, `../api/favorites/toggle.js`, `../api/notifications/settings.js`, `../api/owner/bookings.js`, `../api/owner/location.js`, `../api/owner/profile.js`, `../api/owner/requests.js`, `../api/owner/schedule.js`, `../api/owner/stats.js`, `../api/pager/staff.js`, `../api/pager/status.js`, `../api/pager/subscriptions.js`, `../api/pager/telemetry.js`, `../api/pager/update.js`, `../api/pager/worker.js`, `../api/schedule/today.js`, `../api/trucks.js`, `../api/trucks/[id].js`, `../api/trucks/availability.js`, `../api/trucks/nearby.js`, `../api/trucks/search.js`
- **Exports**: `STATIC_API_ROUTES`, `DYNAMIC_TRUCK_BY_ID_ROUTE`, `REGISTERED_DOMAIN_ROUTE_COUNT`, `matchDomainApiRoute`
- **Significant Constants**: `STATIC_API_ROUTES` *(exported)*, `DYNAMIC_TRUCK_BY_ID_ROUTE` *(exported)*, `REGISTERED_DOMAIN_ROUTE_COUNT` *(exported)*

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `defineRoute` | `function` | No | `(pattern: unknown, mod: unknown, extra: object)` | `sync_value (throws: Error)` | `server/routes.js:<top_level>` | L35 |
| `matchDomainApiRoute` | `function` | Yes | `(pathname: unknown)` | `sync_value` | `server/app.js:createStandaloneServer$anon_L546_3` | L103 |

## 2. Shared Backend Libraries (`lib/`)

### [lib/admin-governance.js](../../../lib/admin-governance.js) (`module`)
- **Imports / Dependencies**: `./authz.js`, `node:crypto`
- **Exports**: `INVITATION_TTL_MS`, `MAX_EVIDENCE_BYTES`, `MAX_EVIDENCE_PER_APPLICATION`, `MAX_MOD_TEMP_RESTRICTION_HOURS`, `INVITATION_ROLE_LABELS`, `sha256Hex`, `generateOpaqueToken`, `normalizeEmailStrict`, `normalizeOptionalIdempotencyKey`, `parseBoundedPagination`, `sanitizeFilename`, `verifyEvidenceBufferAndMime`, `validateOptionalHttpUrl`, `validateProposedSlug`, `computeIssueSlaDueAt`, `recordTestSafeNotificationInTx`, `consumeGovernanceRateLimit`, `INVITATION_DELIVERY_LABELS`, `recordInvitationEventInTx`, `formatInvitationRowForAdmin`
- **Significant Constants**: `INVITATION_TTL_MS` *(exported)*, `MAX_EVIDENCE_BYTES` *(exported)*, `MAX_EVIDENCE_PER_APPLICATION` *(exported)*, `MAX_MOD_TEMP_RESTRICTION_HOURS` *(exported)*, `INVITATION_ROLE_LABELS` *(exported)*, `EMAIL_SIMPLE_RE`, `SLUG_RE`, `SAFE_IDEMPOTENCY_RE`, `INVITATION_DELIVERY_LABELS` *(exported)*

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `sha256Hex` | `function` | Yes | `(value: unknown)` | `sync_value` | `api/pager/subscriptions.js:default`, `api/pager/subscriptions.js:default$anon_L120_2`, `lib/admin-governance.js:generateOpaqueToken`, `lib/admin-governance.js:verifyEvidenceBufferAndMime` | L24 |
| `generateOpaqueToken` | `function` | Yes | `(byteLen: number)` | `sync_value` | `server/admin-routes.js:handleGovernanceApiRequest$anon_L1415_16`, `server/admin-routes.js:handleGovernanceApiRequest$anon_L4654_65`, `server/admin-routes.js:handleGovernanceApiRequest$anon_L4908_66` | L28 |
| `normalizeEmailStrict` | `function` | Yes | `(rawEmail: unknown)` | `sync_value` | `scripts/bootstrap-top-admin.cjs:main`, `server/admin-routes.js:handleGovernanceApiRequest$anon_L978_11`, `server/admin-routes.js:handleGovernanceApiRequest`, `server/admin-routes.js:handleGovernanceApiRequest$anon_L4654_65` | L36 |
| `normalizeOptionalIdempotencyKey` | `function` | Yes | `(raw: unknown)` | `sync_value` | `lib/customer-profile.js:createOwnerCollection`, `lib/customer-profile.js:createCollectionShareLink`, `server/admin-routes.js:handleGovernanceApiRequest` | L49 |
| `parseBoundedPagination` | `function` | Yes | `(query: object, defaultSize: number, maxSize: number)` | `sync_value` | `server/admin-routes.js:handleGovernanceApiRequest` | L59 |
| `sanitizeFilename` | `function` | Yes | `(rawName: unknown)` | `sync_value` | `server/admin-routes.js:handleGovernanceApiRequest` | L69 |
| `verifyEvidenceBufferAndMime` | `function` | Yes | `(buf: unknown, declaredMime: unknown)` | `sync_value` | `server/admin-routes.js:handleGovernanceApiRequest` | L85 |
| `validateOptionalHttpUrl` | `function` | Yes | `(rawUrl: unknown)` | `sync_value` | `server/admin-routes.js:handleGovernanceApiRequest` | L130 |
| `validateProposedSlug` | `function` | Yes | `(rawSlug: unknown)` | `sync_value` | `server/admin-routes.js:handleGovernanceApiRequest` | L149 |
| `computeIssueSlaDueAt` | `function` | Yes | `(severity: unknown, now: Date)` | `sync_value` | `lib/support-tickets.js:resolveInitialUrgencyAndPriority`, `server/admin-routes.js:handleGovernanceApiRequest$anon_L5965_76` | L156 |
| `recordTestSafeNotificationInTx` | `function` | Yes | `(tx: unknown, { recipientUserId, recipientEmail, eventKind, subject, summary }: object)` | `async -> promise` | `lib/customer-profile.js:applyAdminSharedModerationDecision$anon_L3755_58`, `server/admin-routes.js:handleGovernanceApiRequest$anon_L3402_45`, `server/admin-routes.js:handleGovernanceApiRequest$anon_L3900_49`, `server/admin-routes.js:handleGovernanceApiRequest$anon_L5965_76` | L167 |
| `consumeGovernanceRateLimit` | `function` | Yes | `(tx: unknown, { scope, subjectKey, maxHits, windowSeconds, now }: object)` | `async -> promise` | `lib/customer-profile.js:submitPublicSharedPageReport$anon_L3418_54`, `server/admin-routes.js:handleGovernanceApiRequest$anon_L642_6`, `server/admin-routes.js:handleGovernanceApiRequest$anon_L1096_12`, `server/admin-routes.js:handleGovernanceApiRequest$anon_L1415_16` | L187 |
| `recordInvitationEventInTx` | `function` | Yes | `(tx: unknown, { invitationId, eventType, actorId, actorRole, deliveryMode, providerStatus, providerMessageId, errorCode, correlationId, releaseSha, note }: object)` | `async -> promise (throws: thrown_value)` | `server/admin-routes.js:deliverAndFinalizeIssuedInvitation$anon_L349_3`, `server/admin-routes.js:handleGovernanceApiRequest$anon_L1096_12`, `server/admin-routes.js:handleGovernanceApiRequest$anon_L1415_16`, `server/admin-routes.js:handleGovernanceApiRequest$anon_L4654_65` | L224 |
| `formatInvitationRowForAdmin` | `function` | Yes | `(row: unknown, { events, nowMs }: object)` | `sync_value` | `server/admin-routes.js:deliverAndFinalizeIssuedInvitation$anon_L349_3`, `server/admin-routes.js:handleGovernanceApiRequest$anon_L1415_16`, `server/admin-routes.js:handleGovernanceApiRequest$anon_L4571_62$anon_L4627_64`, `server/admin-routes.js:handleGovernanceApiRequest$anon_L4654_65` | L270 |

### [lib/age-policy.js](../../../lib/age-policy.js) (`module`)
- **Exports**: `PROPOSED_MIN_ACCOUNT_AGE`, `AGE_POLICY_VERSION`, `SHARING_MIN_ADULT_AGE`, `SHARING_ELIGIBILITY_POLICY_VERSION`, `AGE_BOUNDARY_TIMEZONE`, `MIN_PLAUSIBLE_BIRTH_YEAR`, `isGregorianLeapYear`, `daysInGregorianMonth`, `resolvePacificCalendarDateParts`, `parseAndValidateDobInput`, `computeCompletedYearsOfAge`, `evaluateMinimumAgeEligibility`, `evaluateAdultSharingEligibility`, `AGE_ASSESSMENT_ALLOWLIST_SPEC`, `isGovernanceRouteExemptFromAgeGate`, `buildAgeAssessmentRequiredPayload`
- **Significant Constants**: `PROPOSED_MIN_ACCOUNT_AGE` *(exported)*, `AGE_POLICY_VERSION` *(exported)*, `SHARING_MIN_ADULT_AGE` *(exported)*, `SHARING_ELIGIBILITY_POLICY_VERSION` *(exported)*, `AGE_BOUNDARY_TIMEZONE` *(exported)*, `MIN_PLAUSIBLE_BIRTH_YEAR` *(exported)*, `AGE_ASSESSMENT_ALLOWLIST_SPEC` *(exported)*, `EXEMPT_GOVERNANCE_METHODS_BY_PATH`

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `isGregorianLeapYear` | `function` | Yes | `(year: unknown)` | `sync_value` | `lib/age-policy.js:daysInGregorianMonth` | L32 |
| `daysInGregorianMonth` | `function` | Yes | `(year: unknown, month: unknown)` | `sync_value` | `lib/age-policy.js:parseAndValidateDobInput`, `server/admin-routes.js:validateIsoCalendarDate` | L36 |
| `resolvePacificCalendarDateParts` | `function` | Yes | `(now: Date)` | `sync_value (throws: Error)` | `lib/age-policy.js:parseAndValidateDobInput`, `server/admin-routes.js:validateIsoCalendarDate` | L46 |
| `parseAndValidateDobInput` | `function` | Yes | `(input: object, now: Date)` | `sync_value` | `lib/age-policy.js:evaluateMinimumAgeEligibility`, `lib/age-policy.js:evaluateAdultSharingEligibility` | L70 |
| `computeCompletedYearsOfAge` | `function` | Yes | `(birthParts: unknown, refParts: unknown)` | `sync_value` | `lib/age-policy.js:evaluateMinimumAgeEligibility`, `lib/age-policy.js:evaluateAdultSharingEligibility` | L182 |
| `evaluateMinimumAgeEligibility` | `function` | Yes | `(input: object, now: Date)` | `sync_value` | `lib/standalone-auth.js:startEmailOtpChallenge`, `lib/standalone-auth.js:submitExistingAccountAgeAssessment` | L196 |
| `evaluateAdultSharingEligibility` | `function` | Yes | `(input: object, now: Date)` | `sync_value` | `lib/customer-profile.js:submitAdultSharingEligibility$anon_L2232_40` | L253 |
| `isGovernanceRouteExemptFromAgeGate` | `function` | Yes | `(normPathname: unknown, method: unknown)` | `sync_value` | `server/app.js:createStandaloneServer$anon_L546_3` | L431 |
| `buildAgeAssessmentRequiredPayload` | `function` | Yes | `(nextPath: string)` | `sync_value` | `server/admin-routes.js:handleGovernanceApiRequest$anon_L2329_32`, `server/admin-routes.js:handleGovernanceApiRequest$anon_L2625_34`, `server/admin-routes.js:handleGovernanceApiRequest$anon_L2744_35`, `server/app.js:json` | L437 |

### [lib/authz.js](../../../lib/authz.js) (`module`)
- **Imports / Dependencies**: `./env-compat.js`, `./request-context.js`, `node:crypto`
- **Exports**: `UUID_RE`, `ROLE_LABELS`, `normalizeAdminLevel`, `isTempRestrictionActive`, `evaluateEffectiveVendorRestrictions`, `applyPrivateNoStoreHeaders`, `VALID_WRITE_PAUSE_SCOPES`, `inspectWritePauseConfig`, `isWritePaused`, `resolveIdentity`, `loadAccessContext`, `authorizeVendorTarget`, `reverifyVendorMembershipInTx`, `reverifyModeratorInTx`, `reverifyPlatformAdminInTx`, `authorizeVendorScope`, `redactPagerTargetId`, `recordAuditLog`
- **Significant Constants**: `UUID_RE` *(exported)*, `ROLE_LABELS` *(exported)*, `FORBIDDEN_AUDIT_KEYS`, `VALID_WRITE_PAUSE_SCOPES` *(exported)*, `VALID_WRITE_PAUSE_SET`

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `normalizeAdminLevel` | `function` | Yes | `(rawRole: unknown)` | `sync_value` | `lib/authz.js:loadAccessContext`, `lib/authz.js:reverifyVendorMembershipInTx`, `lib/authz.js:reverifyModeratorInTx`, `lib/authz.js:reverifyPlatformAdminInTx` | L53 |
| `isTempRestrictionActive` | `function` | Yes | `(vendorRow: unknown, nowMs: unknown)` | `sync_value` | `lib/authz.js:evaluateEffectiveVendorRestrictions` | L60 |
| `evaluateEffectiveVendorRestrictions` | `function` | Yes | `(vendorRow: unknown, nowMs: unknown)` | `sync_value` | `api/bookings/create.js:default$anon_L147_1`, `api/pager/staff.js:default$anon_L71_1`, `api/trucks/availability.js:default`, `lib/authz.js:loadAccessContext` | L71 |
| `configuredAdminIds` | `function` | No | `()` | `sync_value (throws: thrown_value)` | `lib/authz.js:resolveIdentity`, `lib/authz.js:queryRoleAndRevocation`, `lib/authz.js:reverifyVendorMembershipInTx`, `lib/authz.js:reverifyModeratorInTx` | L95 |
| `applyPrivateNoStoreHeaders` | `function` | Yes | `(res: unknown)` | `void_or_implicit` | `api/bookings/create.js:default`, `api/bookings/list.js:default`, `api/community/mine.js:default`, `api/community/moderate.js:default` | L114 |
| `inspectWritePauseConfig` | `function` | Yes | `()` | `sync_value (throws: thrown_value)` | `lib/authz.js:isWritePaused`, `lib/feature-controls.js:inspectEnvironmentFeatureOverrides`, `lib/pager-notifications.js:inspectNotificationRuntimeConfig`, `server/admin-routes.js:handleGovernanceApiRequest$anon_L2914_37` | L131 |
| `isWritePaused` | `function` | Yes | `(scope: unknown)` | `sync_value` | `api/bookings/create.js:default`, `api/community/moderate.js:default`, `api/community/post.js:default`, `api/favorites/toggle.js:default` | L175 |
| `resolveIdentity` | `function` | Yes | `(req: unknown, auth: unknown)` | `async -> promise` | `api/bookings/create.js:default`, `api/bookings/list.js:default`, `api/community/mine.js:default`, `api/community/post.js:default` | L182 |
| `queryRoleAndRevocation` | `function` | No | `(dbClient: unknown, userId: unknown, lockClause: string)` | `async -> promise (throws: thrown_value)` | `lib/authz.js:loadAccessContext`, `lib/authz.js:reverifyVendorMembershipInTx`, `lib/authz.js:reverifyModeratorInTx`, `lib/authz.js:reverifyPlatformAdminInTx` | L210 |
| `queryUserVendorMemberships` | `function` | No | `(dbClient: unknown, userId: unknown)` | `async -> promise (throws: thrown_value)` | `lib/authz.js:loadAccessContext` | L234 |
| `loadAccessContext` | `function` | Yes | `(req: unknown, auth: unknown, db: unknown)` | `async -> promise` | `api/community/moderate.js:default`, `api/owner/bookings.js:default`, `api/owner/location.js:default`, `api/owner/profile.js:default` | L274 |
| `checkStandaloneHttpActOnBehalfRequirement` | `function` | No | `(targetVendorId: unknown)` | `sync_value` | `lib/authz.js:authorizeVendorTarget`, `lib/authz.js:reverifyVendorMembershipInTx` | L344 |
| `authorizeVendorTarget` | `function` | Yes | `(ctx: unknown, requestedVendorId: unknown, requiredRole: string, dbClient: null_or_object)` | `async -> promise` | `api/owner/location.js:default`, `api/owner/profile.js:default`, `api/owner/schedule.js:default`, `api/pager/staff.js:default` | L362 |
| `reverifyVendorMembershipInTx` | `function` | Yes | `(tx: unknown, ctx: unknown, vendorId: unknown, requiredRole: string, options: object)` | `async -> promise (throws: thrown_value)` | `api/owner/location.js:default$anon_L110_1`, `api/owner/profile.js:default$anon_L58_1`, `api/owner/requests.js:default$anon_L42_1`, `api/owner/schedule.js:default$anon_L64_1` | L504 |
| `reverifyModeratorInTx` | `function` | Yes | `(tx: unknown, ctx: unknown)` | `async -> promise` | `api/community/moderate.js:default$anon_L27_1`, `api/community/moderate.js:default$anon_L67_2`, `lib/customer-profile.js:listAdminSharedModerationQueue$anon_L3527_56`, `lib/customer-profile.js:applyAdminSharedModerationDecision$anon_L3755_58` | L647 |
| `reverifyPlatformAdminInTx` | `function` | Yes | `(tx: unknown, ctx: unknown)` | `async -> promise` | `api/pager/telemetry.js:default$anon_L33_1`, `lib/customer-profile.js:applyAdminSharedModerationDecision$anon_L3755_58`, `server/admin-routes.js:handleGovernanceApiRequest$anon_L1961_23`, `server/admin-routes.js:handleGovernanceApiRequest$anon_L3098_39` | L663 |
| `authorizeVendorScope` | `function` | Yes | `(ctx: unknown, requestedVendorId: unknown, dbClient: null_or_object)` | `async -> promise` | `api/owner/bookings.js:default`, `api/owner/requests.js:default`, `api/owner/schedule.js:default`, `api/owner/stats.js:default` | L675 |
| `redactPagerTargetId` | `function` | Yes | `(pagerUuid: unknown)` | `sync_value` | `api/pager/staff.js:default$anon_L71_1`, `api/pager/update.js:default$anon_L45_1` | L724 |
| `sanitizeMetadata` | `function` | No | `(meta: unknown)` | `sync_value` | `lib/authz.js:recordAuditLog` | L729 |
| `recordAuditLog` | `function` | Yes | `(dbClient: unknown, { actorId, actorRole, vendorId, targetType, targetId, action, metadata }: object)` | `async -> promise` | `api/community/moderate.js:default$anon_L67_2`, `api/owner/location.js:default$anon_L110_1`, `api/owner/profile.js:default$anon_L58_1`, `api/owner/requests.js:default$anon_L42_1` | L742 |

### [lib/catalog.js](../../../lib/catalog.js) (`module`)
- **Exports**: `BOOKING_PACKAGES`, `CANONICAL_VENDORS`, `VENDORS_BY_ID`, `getCanonicalVendor`
- **Significant Constants**: `BOOKING_PACKAGES` *(exported)*, `CANONICAL_VENDORS` *(exported)*, `VENDORS_BY_ID` *(exported)*

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `getCanonicalVendor` | `function` | Yes | `(vendorId: unknown)` | `sync_value` | — | L78 |

### [lib/client-ip.js](../../../lib/client-ip.js) (`module`)
- **Imports / Dependencies**: `./env-compat.js`, `node:net`
- **Exports**: `TRUSTED_CLIENT_IP_SYMBOL`, `normalizeIpAddress`, `isLoopbackIp`, `resolveTrustedClientIp`, `stampTrustedClientIp`
- **Significant Constants**: `TRUSTED_CLIENT_IP_SYMBOL` *(exported)*

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `normalizeIpAddress` | `function` | Yes | `(raw: unknown)` | `sync_value` | `lib/client-ip.js:isLoopbackIp`, `lib/client-ip.js:extractRightmostForwardedIp`, `lib/client-ip.js:resolveTrustedClientIp` | L6 |
| `isLoopbackIp` | `function` | Yes | `(raw: unknown)` | `sync_value` | `lib/client-ip.js:resolveTrustedClientIp`, `server/admin-routes.js:handleGovernanceApiRequest$anon_L709_7`, `server/app.js:createStandaloneServer$anon_L546_3` | L30 |
| `extractRightmostForwardedIp` | `function` | No | `(xffHeader: unknown)` | `sync_value` | `lib/client-ip.js:resolveTrustedClientIp` | L35 |
| `resolveTrustedClientIp` | `function` | Yes | `(req: unknown, options: object)` | `sync_value (throws: thrown_value)` | `lib/client-ip.js:stampTrustedClientIp`, `lib/pager-notifications.js:extractClientRateKey`, `lib/standalone-auth.js:startEmailOtpChallenge`, `lib/standalone-auth.js:verifyEmailOtpChallenge` | L57 |
| `stampTrustedClientIp` | `function` | Yes | `(req: unknown, options: object)` | `sync_value` | `server/app.js:createStandaloneServer$anon_L546_3` | L104 |

### [lib/customer-exploration.js](../../../lib/customer-exploration.js) (`module`)
- **Imports / Dependencies**: `./dates.js`, `./db-tx.js`, `./discovery.js`, `./photo-storage.js`, `node:crypto`
- **Exports**: `EXPLORATION_TIMEZONE`, `POINTS_PER_VISIT`, `POINTS_PER_PHOTO`, `MAX_VISIT_NOTE_LENGTH`, `MAX_PHOTO_CAPTION_LENGTH`, `MAX_SAVED_TRAILS_PER_USER`, `WEEKLY_CHALLENGE_TARGET`, `NON_MONETARY_DISCLOSURE`, `REVERSIBLE_PROGRESS_DISCLOSURE`, `TRAIL_DISCLAIMERS`, `EXPLORATION_LEVELS`, `EXPLORATION_BADGE_DEFINITIONS`, `SEED_014_TAXONOMY_CORRECTIONS`, `ExplorationDomainError`, `normalizeCanonicalTown`, `classifyVendorTaxonomy`, `getMondayWeekBounds`, `mapHistoricalTimestampToPacificDate`, `computeExplorationSummaryInTx`, `getExplorationSummary`, `listUserVisits`, `logUserVisit`, `deleteUserVisit`, `listUserPhotos`, `createUserPhoto`, `readUserPhotoFile`, `deleteUserPhoto`, `reconcilePhotoStorage`, `buildSuggestedTrail`, `listUserSavedTrails`, `saveUserTrail`, `deleteUserSavedTrail`, `importLegacyDeviceVisits`, `exportUserExplorationData`
- **Significant Constants**: `EXPLORATION_TIMEZONE` *(exported)*, `POINTS_PER_VISIT` *(exported)*, `POINTS_PER_PHOTO` *(exported)*, `MAX_VISIT_NOTE_LENGTH` *(exported)*, `MAX_PHOTO_CAPTION_LENGTH` *(exported)*, `MAX_SAVED_TRAILS_PER_USER` *(exported)*, `WEEKLY_CHALLENGE_TARGET` *(exported)*, `NON_MONETARY_DISCLOSURE` *(exported)*, `REVERSIBLE_PROGRESS_DISCLOSURE` *(exported)*, `TRAIL_DISCLAIMERS` *(exported)*, `EXPLORATION_LEVELS` *(exported)*, `EXPLORATION_BADGE_DEFINITIONS` *(exported)*, `CANONICAL_TOWNS_MAP`, `SEED_014_TAXONOMY_CORRECTIONS` *(exported)*, `PRIMARY_SWEET_VENDOR_IDS`, `SOURCED_SWEET_SPECIALTY_NOTES`, `HISTORICAL_SAVORY_DESPITE_SWEETS_SECTION`, `HISTORICAL_COFFEE_DESPITE_SWEETS_SECTION`, `SOURCED_DISH_NOTES`, `VALID_VISIT_SOURCES` (+2 more)

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `ExplorationDomainError.constructor` | `constructor` | No | `(message: unknown, { status, code, retryable }: object)` | `void_or_implicit` | — | L177 |
| `normalizeCanonicalTown` | `function` | Yes | `(rawCity: unknown)` | `sync_value` | `lib/customer-exploration.js:classifyVendorTaxonomy`, `lib/customer-exploration.js:buildSuggestedTrail`, `lib/customer-exploration.js:hydrateSavedTrailsInTx$anon_L2204_42$anon_L2209_43`, `lib/customer-exploration.js:saveUserTrail` | L186 |
| `classifyVendorTaxonomy` | `function` | Yes | `(vendorRow: unknown)` | `sync_value` | `lib/customer-exploration.js:loadVendorForUserActionInTx`, `lib/customer-exploration.js:buildSuggestedTrail` | L215 |
| `getMondayWeekBounds` | `function` | Yes | `(localIsoDate: unknown)` | `sync_value (throws: ExplorationDomainError)` | `lib/customer-exploration.js:computeExplorationSummaryInTx` | L337 |
| `startOfPacificDateIso` | `function` | No | `(localIsoDate: unknown)` | `sync_value` | `lib/customer-exploration.js:mapHistoricalTimestampToPacificDate` | L361 |
| `mapHistoricalTimestampToPacificDate` | `function` | Yes | `(rawTimestamp: unknown, now: Date)` | `sync_value` | `lib/customer-exploration.js:createUserPhoto`, `lib/customer-exploration.js:importLegacyDeviceVisits$anon_L2521_52` | L380 |
| `sanitizeNoteText` | `function` | No | `(raw: unknown, maxLen: unknown)` | `sync_value (throws: ExplorationDomainError)` | `lib/customer-exploration.js:logUserVisit`, `lib/customer-exploration.js:createUserPhoto`, `lib/customer-exploration.js:saveUserTrail` | L423 |
| `sanitizeOptionalIdempotencyKey` | `function` | No | `(raw: unknown)` | `sync_value (throws: ExplorationDomainError)` | `lib/customer-exploration.js:logUserVisit`, `lib/customer-exploration.js:createUserPhoto`, `lib/customer-exploration.js:saveUserTrail` | L441 |
| `sanitizeVendorIdInput` | `function` | No | `(raw: unknown, { allowEmpty }: object)` | `sync_value (throws: ExplorationDomainError)` | `lib/customer-exploration.js:listUserVisits`, `lib/customer-exploration.js:logUserVisit`, `lib/customer-exploration.js:listUserPhotos`, `lib/customer-exploration.js:createUserPhoto` | L459 |
| `generatePrefixedId` | `function` | No | `(prefix: unknown)` | `sync_value` | `lib/customer-exploration.js:logUserVisit$anon_L862_8`, `lib/customer-exploration.js:createUserPhoto`, `lib/customer-exploration.js:saveUserTrail$anon_L2362_50`, `lib/customer-exploration.js:importLegacyDeviceVisits$anon_L2521_52` | L477 |
| `setUserRlsContextInTx` | `function` | No | `(tx: unknown, userId: unknown)` | `async -> promise (throws: ExplorationDomainError)` | `lib/customer-exploration.js:computeExplorationSummaryInTx`, `lib/customer-exploration.js:listUserVisits$anon_L774_6`, `lib/customer-exploration.js:logUserVisit$anon_L862_8`, `lib/customer-exploration.js:deleteUserVisit$anon_L1064_9` | L481 |
| `loadVendorForUserActionInTx` | `function` | No | `(tx: unknown, vendorSlug: unknown, nowMs: unknown)` | `async -> promise` | `lib/customer-exploration.js:logUserVisit$anon_L862_8`, `lib/customer-exploration.js:createUserPhoto$anon_L1238_12`, `lib/customer-exploration.js:saveUserTrail$anon_L2362_50`, `lib/customer-exploration.js:importLegacyDeviceVisits$anon_L2521_52` | L492 |
| `computeLevelProgress` | `function` | No | `(totalPoints: unknown)` | `sync_value` | `lib/customer-exploration.js:computeExplorationSummaryInTx` | L539 |
| `computeExplorationSummaryInTx` | `function` | Yes | `(tx: unknown, { userId, now, showAchievements, showWeeklyChallenge, featureStates }: object)` | `async -> promise` | `lib/customer-exploration.js:getExplorationSummary$anon_L741_5`, `lib/customer-exploration.js:logUserVisit$anon_L862_8`, `lib/customer-exploration.js:deleteUserVisit$anon_L1064_9`, `lib/customer-exploration.js:createUserPhoto$anon_L1238_12` | L571 |
| `getExplorationSummary` | `function` | Yes | `(dbAdapter: unknown, opts: unknown)` | `async -> promise` | `server/customer-exploration-routes.js:handleCustomerExplorationRoute` | L740 |
| `formatVisitDto` | `function` | No | `(row: unknown, nowMs: unknown)` | `sync_value` | `lib/customer-exploration.js:listUserVisits$anon_L774_6$anon_L825_7`, `lib/customer-exploration.js:logUserVisit$anon_L862_8` | L744 |
| `listUserVisits` | `function` | Yes | `(dbAdapter: unknown, { userId, limit, offset, vendorId, now }: object)` | `async -> promise` | `lib/customer-profile.js:getPrivateOwnerProfile`, `server/customer-exploration-routes.js:handleCustomerExplorationRoute` | L766 |
| `logUserVisit` | `function` | Yes | `(dbAdapter: unknown, { userId, vendorId, privateNote, entrySource, idempotencyKey, now, showAchievements, showWeeklyChallenge, featureStates }: object)` | `async -> promise` | `server/customer-exploration-routes.js:handleCustomerExplorationRoute` | L842 |
| `deleteUserVisit` | `function` | Yes | `(dbAdapter: unknown, { userId, visitId, now, showAchievements, showWeeklyChallenge, featureStates }: object)` | `async -> promise (throws: ExplorationDomainError)` | `server/customer-exploration-routes.js:handleCustomerExplorationRoute` | L1045 |
| `formatPhotoDto` | `function` | No | `(row: unknown, nowMs: unknown)` | `sync_value` | `lib/customer-exploration.js:listUserPhotos$anon_L1138_10$anon_L1188_11`, `lib/customer-exploration.js:createUserPhoto$anon_L1238_12`, `lib/customer-exploration.js:createUserPhoto$anon_L1337_13` | L1104 |
| `listUserPhotos` | `function` | Yes | `(dbAdapter: unknown, { userId, limit, offset, vendorId, now }: object)` | `async -> promise` | `lib/customer-profile.js:getPrivateOwnerProfile`, `server/customer-exploration-routes.js:handleCustomerExplorationRoute` | L1130 |
| `createUserPhoto` | `function` | Yes | `(dbAdapter: unknown, { userId, vendorId, caption, entrySource, idempotencyKey, takenAtIso, dataBase64, declaredMimeType, storageRoot, minFreeBytes, now, showAchievements }: object)` | `async -> promise (throws: thrown_value)` | `server/customer-exploration-routes.js:handleCustomerExplorationRoute` | L1205 |
| `readUserPhotoFile` | `function` | Yes | `(dbAdapter: unknown, { userId, photoId, variant, storageRoot }: object)` | `async -> promise (throws: ExplorationDomainError)` | `server/customer-exploration-routes.js:handleCustomerExplorationRoute` | L1468 |
| `deleteUserPhoto` | `function` | Yes | `(dbAdapter: unknown, { userId, photoId, storageRoot, now, showAchievements, showWeeklyChallenge, featureStates }: object)` | `async -> promise (throws: ExplorationDomainError)` | `server/customer-exploration-routes.js:handleCustomerExplorationRoute` | L1513 |
| `reconcilePhotoStorage` | `function` | Yes | `(dbAdapter: unknown, { storageRoot, orphanMinAgeMs, batchLimit, now }: object)` | `async -> promise` | `api/pager/worker.js:default`, `scripts/run-pager-worker.cjs:<top_level>$anon_L89_5`, `server/admin-routes.js:handleGovernanceApiRequest` | L1633 |
| `buildStopMatchReason` | `function` | No | `(vendor: unknown, themeKey: unknown)` | `sync_value` | `lib/customer-exploration.js:buildSuggestedTrail$anon_L1979_19`, `lib/customer-exploration.js:buildSuggestedTrail$anon_L2098_39` | L1786 |
| `scoreTrailCandidate` | `function` | No | `(vendor: unknown, themeKey: unknown)` | `sync_value` | `lib/customer-exploration.js:buildSuggestedTrail$anon_L2038_24`, `lib/customer-exploration.js:buildSuggestedTrail$anon_L2046_28`, `lib/customer-exploration.js:buildSuggestedTrail$anon_L2056_32`, `lib/customer-exploration.js:buildSuggestedTrail$anon_L2064_34` | L1836 |
| `selectDeduplicatedStops` | `function` | No | `(sortedCandidates: unknown, maxCount: number, rotationOffset: number)` | `sync_value` | `lib/customer-exploration.js:buildSuggestedTrail` | L1872 |
| `buildSuggestedTrail` | `function` | Yes | `(dbAdapter: unknown, { theme, town, offset, explicitIds, now }: object)` | `async -> promise (throws: ExplorationDomainError)` | `server/customer-exploration-routes.js:handleCustomerExplorationRoute` | L1894 |
| `hydrateSavedTrailsInTx` | `function` | No | `(tx: unknown, { userId, trailRows, now }: object)` | `async -> promise` | `lib/customer-exploration.js:listUserSavedTrails$anon_L2273_49`, `lib/customer-exploration.js:saveUserTrail$anon_L2362_50`, `lib/customer-exploration.js:exportUserExplorationData$anon_L2688_53` | L2142 |
| `listUserSavedTrails` | `function` | Yes | `(dbAdapter: unknown, { userId, limit, offset, now }: object)` | `async -> promise` | `lib/customer-profile.js:getPrivateOwnerProfile`, `server/customer-exploration-routes.js:handleCustomerExplorationRoute` | L2266 |
| `saveUserTrail` | `function` | Yes | `(dbAdapter: unknown, { userId, title, themeKey, townFilter, stops, idempotencyKey, now }: object)` | `async -> promise (throws: ExplorationDomainError)` | `server/customer-exploration-routes.js:handleCustomerExplorationRoute` | L2313 |
| `deleteUserSavedTrail` | `function` | Yes | `(dbAdapter: unknown, { userId, trailId }: object)` | `async -> promise (throws: ExplorationDomainError)` | `server/customer-exploration-routes.js:handleCustomerExplorationRoute` | L2462 |
| `importLegacyDeviceVisits` | `function` | Yes | `(dbAdapter: unknown, { userId, visits, now, showAchievements, showWeeklyChallenge, featureStates }: object)` | `async -> promise (throws: ExplorationDomainError)` | `server/customer-exploration-routes.js:handleCustomerExplorationRoute` | L2497 |
| `exportUserExplorationData` | `function` | Yes | `(dbAdapter: unknown, { userId, now }: object)` | `async -> promise` | `lib/customer-profile.js:exportCustomerProfileAndExplorationArchive`, `server/customer-exploration-routes.js:handleCustomerExplorationRoute` | L2687 |

### [lib/customer-profile.js](../../../lib/customer-profile.js) (`module`)
- **Imports / Dependencies**: `./admin-governance.js`, `./age-policy.js`, `./authz.js`, `./customer-exploration.js`, `./db-tx.js`, `./diagnostics.js`, `./discovery.js`, `./photo-storage.js`, `node:crypto`
- **Exports**: `MAX_COLLECTIONS_PER_USER`, `MAX_ENTRIES_PER_COLLECTION`, `MAX_COLLECTION_TITLE_LENGTH`, `MAX_COLLECTION_INTRO_LENGTH`, `MAX_ENTRY_RECOMMENDATION_LENGTH`, `MAX_ACTIVE_SHARES_PER_COLLECTION`, `MAX_DISPLAY_NAME_LENGTH`, `MAX_BIO_LENGTH`, `MAX_FOOD_INTERESTS`, `ALLOWED_AVATAR_STYLES`, `SUPPORTED_SONOMA_TOWNS`, `SUPPORTED_FOOD_INTERESTS`, `FORBIDDEN_CLIENT_PROFILE_WRITE_FIELDS`, `ALLOWED_SHARE_REPORT_REASONS`, `CustomerProfileDomainError`, `generateOpaqueId`, `assertNoForbiddenClientWriteFields`, `sanitizePlainText`, `computeSafeInitials`, `validatePreferredTown`, `validateFoodInterests`, `validateAvatarStyle`, `setOwnerProfileRlsInTx`, `ensureOrLoadCustomerProfileRowInTx`, `loadCustomerSharingEligibilityInTx`, `buildPrivateOwnerProfileDto`, `buildPrivateOwnerCollectionDto`, `buildSharedCollectionPublicDto`, `buildAdminShareModerationDto`, `getPrivateOwnerProfile`, `exportCustomerProfileAndExplorationArchive`, `clearCustomerProfileAndCollectionsData`, `updatePrivateOwnerProfile`, `updateCustomerPreferences`, `computeCollectionContentDigest`, `loadCollectionHydratedInTx`, `listOwnerCollections`, `getOwnerCollectionDetail`, `createOwnerCollection`, `updateOwnerCollection`, `deleteOwnerCollection`, `generateShareTokenMaterial`, `hashRawShareToken`, `submitAdultSharingEligibility`, `previewOwnerSharedCollection`, `listOwnerShares`, `createCollectionShareLink`, `updateCollectionShareSettings`, `rotateCollectionShareLink`, `revokeCollectionShareLink`, `resolveLiveSharedCollectionByToken`, `renderSharedUnavailableHtmlPage`, `renderSharedCollectionHtmlPage`, `submitPublicSharedPageReport`, `listAdminSharedModerationQueue`, `applyAdminSharedModerationDecision`, `attachPhotoToCollectionEntry`, `removePhotoFromCollectionEntry`, `readSharedCollectionPhotoByToken`, `readAdminReportedSharedPhoto`
- **Significant Constants**: `MAX_COLLECTIONS_PER_USER` *(exported)*, `MAX_ENTRIES_PER_COLLECTION` *(exported)*, `MAX_COLLECTION_TITLE_LENGTH` *(exported)*, `MAX_COLLECTION_INTRO_LENGTH` *(exported)*, `MAX_ENTRY_RECOMMENDATION_LENGTH` *(exported)*, `MAX_ACTIVE_SHARES_PER_COLLECTION` *(exported)*, `MAX_DISPLAY_NAME_LENGTH` *(exported)*, `MAX_BIO_LENGTH` *(exported)*, `MAX_FOOD_INTERESTS` *(exported)*, `ALLOWED_AVATAR_STYLES` *(exported)*, `SUPPORTED_SONOMA_TOWNS` *(exported)*, `SUPPORTED_FOOD_INTERESTS` *(exported)*, `FORBIDDEN_CLIENT_PROFILE_WRITE_FIELDS` *(exported)*, `ALLOWED_SHARE_REPORT_REASONS` *(exported)*, `AVATAR_STYLE_SET`, `SONOMA_TOWN_MAP`, `FOOD_INTEREST_SET`, `SHARE_REPORT_REASON_SET`

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `CustomerProfileDomainError.constructor` | `constructor` | No | `(message: unknown, { status, code, retryable, details }: object)` | `void_or_implicit` | — | L143 |
| `generateOpaqueId` | `function` | Yes | `(prefix: unknown)` | `sync_value` | `lib/customer-profile.js:ensureOrLoadCustomerProfileRowInTx`, `lib/customer-profile.js:createOwnerCollection$anon_L1757_31`, `lib/customer-profile.js:updateOwnerCollection$anon_L1866_33`, `lib/customer-profile.js:createCollectionShareLink$anon_L2517_46` | L153 |
| `assertNoForbiddenClientWriteFields` | `function` | Yes | `(body: unknown, extraForbidden: array)` | `void_or_implicit (throws: CustomerProfileDomainError)` | `lib/customer-profile.js:updatePrivateOwnerProfile`, `lib/customer-profile.js:updateCustomerPreferences`, `lib/customer-profile.js:validateAndResolveRequestedEntries`, `lib/customer-profile.js:createOwnerCollection` | L157 |
| `sanitizePlainText` | `function` | Yes | `(raw: unknown, { maxLen, allowNewlines, fieldLabel }: object)` | `sync_value (throws: CustomerProfileDomainError)` | `lib/customer-profile.js:validatePreferredTown`, `lib/customer-profile.js:updatePrivateOwnerProfile`, `lib/customer-profile.js:validateAndResolveRequestedEntries`, `lib/customer-profile.js:createOwnerCollection` | L206 |
| `computeSafeInitials` | `function` | Yes | `(displayName: unknown)` | `sync_value` | `lib/customer-profile.js:buildPrivateOwnerProfileDto`, `lib/customer-profile.js:buildSharedCollectionPublicDto` | L233 |
| `validatePreferredTown` | `function` | Yes | `(rawTown: unknown)` | `sync_value (throws: CustomerProfileDomainError)` | `lib/customer-profile.js:updatePrivateOwnerProfile`, `lib/customer-profile.js:updateCustomerPreferences` | L245 |
| `validateFoodInterests` | `function` | Yes | `(rawList: unknown)` | `sync_value (throws: CustomerProfileDomainError)` | `lib/customer-profile.js:updateCustomerPreferences` | L273 |
| `validateAvatarStyle` | `function` | Yes | `(rawStyle: unknown)` | `sync_value (throws: CustomerProfileDomainError)` | `lib/customer-profile.js:updatePrivateOwnerProfile` | L309 |
| `setOwnerProfileRlsInTx` | `function` | Yes | `(tx: unknown, userId: unknown)` | `async -> promise (throws: CustomerProfileDomainError)` | `lib/customer-profile.js:ensureOrLoadCustomerProfileRowInTx`, `lib/customer-profile.js:loadCustomerSharingEligibilityInTx`, `lib/customer-profile.js:getPrivateOwnerProfile$anon_L842_13`, `lib/customer-profile.js:exportCustomerProfileAndExplorationArchive$anon_L1032_16` | L329 |
| `ensureOrLoadCustomerProfileRowInTx` | `function` | Yes | `(tx: unknown, userId: unknown)` | `async -> promise` | `lib/customer-profile.js:getPrivateOwnerProfile$anon_L842_13`, `lib/customer-profile.js:updatePrivateOwnerProfile$anon_L1292_22`, `lib/customer-profile.js:updateCustomerPreferences$anon_L1411_23`, `lib/customer-profile.js:previewOwnerSharedCollection$anon_L2359_42` | L339 |
| `loadCustomerSharingEligibilityInTx` | `function` | Yes | `(tx: unknown, userId: unknown)` | `async -> promise` | `lib/customer-profile.js:getPrivateOwnerProfile$anon_L842_13`, `lib/customer-profile.js:exportCustomerProfileAndExplorationArchive$anon_L1032_16`, `lib/customer-profile.js:submitAdultSharingEligibility$anon_L2232_40`, `lib/customer-profile.js:assertOwnerEligibleForSharingInTx` | L388 |
| `buildPrivateOwnerProfileDto` | `function` | Yes | `({ profileRow, sharingEligibility, notificationSettings, explorationSummary, activityPreview, collectionsSummary, activeSharesSummary, featureStates }: object)` | `sync_value` | `lib/customer-profile.js:getPrivateOwnerProfile` | L423 |
| `buildPrivateOwnerCollectionDto` | `function` | Yes | `({ collectionRow, entryRows, catalogById, activeShareRows, attachmentById }: object)` | `sync_value` | `lib/customer-profile.js:loadCollectionHydratedInTx` | L532 |
| `buildSharedCollectionPublicDto` | `function` | Yes | `({ shareId, rawTokenForPhotoUrl, previewOwnerPhotoFallback, collectionRow, entryRows, catalogById, attachmentById, profileRow, achievementsSummary, disclosureFlags, featureStates }: object)` | `sync_value` | `lib/customer-profile.js:previewOwnerSharedCollection$anon_L2359_42`, `lib/customer-profile.js:resolveLiveSharedCollectionByToken$anon_L3031_51`, `lib/customer-profile.js:listAdminSharedModerationQueue$anon_L3527_56` | L632 |
| `buildAdminShareModerationDto` | `function` | Yes | `({ collectionRow, shareRow, sharedProjection, reports, moderationEvents }: object)` | `sync_value` | `lib/customer-profile.js:listAdminSharedModerationQueue$anon_L3527_56` | L772 |
| `getPrivateOwnerProfile` | `function` | Yes | `(dbAdapter: unknown, { userId, featureStates, now }: object)` | `async -> promise (throws: CustomerProfileDomainError)` | `lib/customer-profile.js:updatePrivateOwnerProfile`, `lib/customer-profile.js:updateCustomerPreferences`, `server/customer-profile-routes.js:handleCustomerProfileRoute` | L817 |
| `exportCustomerProfileAndExplorationArchive` | `function` | Yes | `(dbAdapter: unknown, { userId, now }: object)` | `async -> promise (throws: CustomerProfileDomainError)` | `server/customer-profile-routes.js:handleCustomerProfileRoute` | L1019 |
| `clearCustomerProfileAndCollectionsData` | `function` | Yes | `(dbAdapter: unknown, { userId, storageRoot, includeExplorationData }: object)` | `async -> promise (throws: CustomerProfileDomainError)` | `server/customer-profile-routes.js:handleCustomerProfileRoute` | L1146 |
| `parseOptionalExpectedRevision` | `function` | No | `(raw: unknown)` | `sync_value (throws: CustomerProfileDomainError)` | `lib/customer-profile.js:updatePrivateOwnerProfile`, `lib/customer-profile.js:updateCustomerPreferences`, `lib/customer-profile.js:updateOwnerCollection` | L1253 |
| `updatePrivateOwnerProfile` | `function` | Yes | `(dbAdapter: unknown, { userId, body, featureStates, now }: object)` | `async -> promise (throws: CustomerProfileDomainError)` | `server/customer-profile-routes.js:handleCustomerProfileRoute` | L1265 |
| `updateCustomerPreferences` | `function` | Yes | `(dbAdapter: unknown, { userId, body, featureStates, now }: object)` | `async -> promise (throws: CustomerProfileDomainError)` | `server/customer-profile-routes.js:handleCustomerProfileRoute` | L1330 |
| `normalizeOptionalIdempotencyKey` | `function` | No | `(raw: unknown)` | `sync_value (throws: CustomerProfileDomainError)` | `lib/customer-profile.js:createOwnerCollection`, `lib/customer-profile.js:createCollectionShareLink`, `server/admin-routes.js:handleGovernanceApiRequest` | L1466 |
| `computeCollectionContentDigest` | `function` | Yes | `({ title, intro, entries }: object)` | `sync_value` | `lib/customer-profile.js:createCollectionShareLink$anon_L2517_46`, `lib/customer-profile.js:applyAdminSharedModerationDecision$anon_L3755_58` | L1478 |
| `loadCollectionHydratedInTx` | `function` | Yes | `(tx: unknown, { userId, collectionId, catalogById, now }: object)` | `async -> promise (throws: CustomerProfileDomainError)` | `lib/customer-profile.js:listOwnerCollections$anon_L1567_27`, `lib/customer-profile.js:getOwnerCollectionDetail$anon_L1616_29`, `lib/customer-profile.js:createOwnerCollection$anon_L1757_31`, `lib/customer-profile.js:updateOwnerCollection$anon_L1866_33` | L1490 |
| `listOwnerCollections` | `function` | Yes | `(dbAdapter: unknown, { userId, now }: object)` | `async -> promise (throws: CustomerProfileDomainError)` | `server/customer-profile-routes.js:handleCustomerProfileRoute` | L1557 |
| `getOwnerCollectionDetail` | `function` | Yes | `(dbAdapter: unknown, { userId, collectionId, now }: object)` | `async -> promise (throws: CustomerProfileDomainError)` | `server/customer-profile-routes.js:handleCustomerProfileRoute` | L1596 |
| `validateAndResolveRequestedEntries` | `function` | No | `(rawEntries: unknown, { catalogById, existingByVendorId }: object)` | `sync_value (throws: CustomerProfileDomainError)` | `lib/customer-profile.js:createOwnerCollection`, `lib/customer-profile.js:updateOwnerCollection$anon_L1866_33` | L1622 |
| `createOwnerCollection` | `function` | Yes | `(dbAdapter: unknown, { userId, body, now }: object)` | `async -> promise (throws: CustomerProfileDomainError)` | `server/customer-profile-routes.js:handleCustomerProfileRoute` | L1721 |
| `updateOwnerCollection` | `function` | Yes | `(dbAdapter: unknown, { userId, body, now }: object)` | `async -> promise (throws: CustomerProfileDomainError)` | `server/customer-profile-routes.js:handleCustomerProfileRoute` | L1836 |
| `deleteOwnerCollection` | `function` | Yes | `(dbAdapter: unknown, { userId, collectionId, storageRoot, now }: object)` | `async -> promise (throws: CustomerProfileDomainError)` | `server/customer-profile-routes.js:handleCustomerProfileRoute` | L2037 |
| `generateShareTokenMaterial` | `function` | Yes | `()` | `sync_value` | `lib/customer-profile.js:createCollectionShareLink$anon_L2517_46`, `lib/customer-profile.js:rotateCollectionShareLink$anon_L2830_48` | L2118 |
| `hashRawShareToken` | `function` | Yes | `(rawToken: unknown)` | `sync_value` | `lib/customer-profile.js:resolveLiveSharedCollectionByToken`, `lib/customer-profile.js:readSharedCollectionPhotoByToken` | L2126 |
| `parseDisclosureFlagsInput` | `function` | No | `(rawDisclosures: object, defaults: boolean)` | `sync_value (throws: CustomerProfileDomainError)` | `lib/customer-profile.js:previewOwnerSharedCollection`, `lib/customer-profile.js:createCollectionShareLink`, `lib/customer-profile.js:updateCollectionShareSettings$anon_L2701_47` | L2130 |
| `parseOptionalShareExpiry` | `function` | No | `(body: object, now: Date)` | `sync_value (throws: CustomerProfileDomainError)` | `lib/customer-profile.js:createCollectionShareLink`, `lib/customer-profile.js:updateCollectionShareSettings$anon_L2701_47`, `lib/customer-profile.js:rotateCollectionShareLink$anon_L2830_48` | L2174 |
| `submitAdultSharingEligibility` | `function` | Yes | `(dbAdapter: unknown, { userId, body, now }: object)` | `async -> promise (throws: CustomerProfileDomainError, thrown_value)` | `server/customer-profile-routes.js:handleCustomerProfileRoute` | L2211 |
| `assertOwnerEligibleForSharingInTx` | `function` | No | `(tx: unknown, userId: unknown)` | `async -> promise (throws: CustomerProfileDomainError)` | `lib/customer-profile.js:createCollectionShareLink$anon_L2517_46`, `lib/customer-profile.js:updateCollectionShareSettings$anon_L2701_47`, `lib/customer-profile.js:rotateCollectionShareLink$anon_L2830_48` | L2310 |
| `previewOwnerSharedCollection` | `function` | Yes | `(dbAdapter: unknown, { userId, body, featureStates, now }: object)` | `async -> promise (throws: CustomerProfileDomainError)` | `server/customer-profile-routes.js:handleCustomerProfileRoute` | L2337 |
| `listOwnerShares` | `function` | Yes | `(dbAdapter: unknown, { userId, collectionId, now }: object)` | `async -> promise (throws: CustomerProfileDomainError)` | `server/customer-profile-routes.js:handleCustomerProfileRoute` | L2427 |
| `createCollectionShareLink` | `function` | Yes | `(dbAdapter: unknown, { userId, body, publicOrigin, now }: object)` | `async -> promise (throws: CustomerProfileDomainError)` | `server/customer-profile-routes.js:handleCustomerProfileRoute` | L2493 |
| `updateCollectionShareSettings` | `function` | Yes | `(dbAdapter: unknown, { userId, body, now }: object)` | `async -> promise (throws: CustomerProfileDomainError)` | `server/customer-profile-routes.js:handleCustomerProfileRoute` | L2682 |
| `rotateCollectionShareLink` | `function` | Yes | `(dbAdapter: unknown, { userId, body, publicOrigin, now }: object)` | `async -> promise (throws: CustomerProfileDomainError)` | `server/customer-profile-routes.js:handleCustomerProfileRoute` | L2811 |
| `revokeCollectionShareLink` | `function` | Yes | `(dbAdapter: unknown, { userId, shareId, reason, now }: object)` | `async -> promise (throws: CustomerProfileDomainError)` | `server/customer-profile-routes.js:handleCustomerProfileRoute` | L2943 |
| `resolveLiveSharedCollectionByToken` | `function` | Yes | `(dbAdapter: unknown, { rawToken, systemFeatureStates, now }: object)` | `async -> promise` | `server/customer-profile-routes.js:handlePublicSharedPageRequest` | L3009 |
| `htmlEsc` | `function` | No | `(raw: unknown)` | `sync_value` | `lib/customer-profile.js:renderSharedCollectionHtmlPage`, `lib/customer-profile.js:renderSharedCollectionHtmlPage$anon_L3242_53` | L3181 |
| `renderSharedUnavailableHtmlPage` | `function` | Yes | `()` | `sync_value` | `server/customer-profile-routes.js:handlePublicSharedPageRequest` | L3190 |
| `renderSharedCollectionHtmlPage` | `function` | Yes | `(dto: unknown, { viewerAuthenticated }: object)` | `sync_value` | `server/customer-profile-routes.js:handlePublicSharedPageRequest` | L3220 |
| `submitPublicSharedPageReport` | `function` | Yes | `(dbAdapter: unknown, { reporterUserId, clientRateKey, body, now }: object)` | `async -> promise (throws: CustomerProfileDomainError)` | `server/customer-profile-routes.js:handleCustomerProfileRoute` | L3355 |
| `enableShareModerationGuardsInTx` | `function` | No | `(tx: unknown, accessCtx: unknown)` | `async -> promise` | `lib/customer-profile.js:listAdminSharedModerationQueue$anon_L3527_56`, `lib/customer-profile.js:applyAdminSharedModerationDecision$anon_L3755_58`, `lib/customer-profile.js:readAdminReportedSharedPhoto$anon_L4432_66` | L3499 |
| `listAdminSharedModerationQueue` | `function` | Yes | `(dbAdapter: unknown, { accessCtx, statusFilter, page, pageSize, now }: object)` | `async -> promise` | `server/customer-profile-routes.js:handleCustomerProfileRoute` | L3516 |
| `applyAdminSharedModerationDecision` | `function` | Yes | `(dbAdapter: unknown, { accessCtx, body, now }: object)` | `async -> promise (throws: CustomerProfileDomainError)` | `server/customer-profile-routes.js:handleCustomerProfileRoute` | L3696 |
| `attachPhotoToCollectionEntry` | `function` | Yes | `(dbAdapter: unknown, { userId, body, storageRoot, now }: object)` | `async -> promise (throws: CustomerProfileDomainError, thrown_value)` | `server/customer-profile-routes.js:handleCustomerProfileRoute` | L3965 |
| `removePhotoFromCollectionEntry` | `function` | Yes | `(dbAdapter: unknown, { userId, body, storageRoot, now }: object)` | `async -> promise (throws: CustomerProfileDomainError)` | `server/customer-profile-routes.js:handleCustomerProfileRoute` | L4189 |
| `readSharedCollectionPhotoByToken` | `function` | Yes | `(dbAdapter: unknown, { rawToken, attachmentId, systemFeatureStates, storageRoot, now }: object)` | `async -> promise` | `server/customer-profile-routes.js:handlePublicSharedPhotoRequest` | L4281 |
| `readAdminReportedSharedPhoto` | `function` | Yes | `(dbAdapter: unknown, { accessCtx, attachmentId, storageRoot }: object)` | `async -> promise (throws: CustomerProfileDomainError)` | `server/customer-profile-routes.js:handleCustomerProfileRoute` | L4420 |

### [lib/dates.js](../../../lib/dates.js) (`module`)
- **Exports**: `MAX_BOOKING_DAYS_AHEAD`, `isValidCalendarDate`, `normalizeCalendarDate`, `getPacificToday`, `validateFuturePacificDate`, `isValidTimeValue`
- **Significant Constants**: `ISO_DATE_RE`, `TIME_RE`, `MAX_BOOKING_DAYS_AHEAD` *(exported)*

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `pad2` | `function` | No | `(n: unknown)` | `sync_value` | `lib/dates.js:normalizeCalendarDate` | L17 |
| `isValidCalendarDate` | `function` | Yes | `(value: unknown)` | `sync_value` | `api/owner/schedule.js:default`, `api/schedule/today.js:default`, `api/trucks/availability.js:default`, `lib/customer-exploration.js:getMondayWeekBounds` | L21 |
| `normalizeCalendarDate` | `function` | Yes | `(value: unknown)` | `sync_value (throws: TypeError)` | `api/bookings/create.js:formatBookingResponse`, `api/bookings/list.js:default$anon_L29_1`, `api/owner/bookings.js:default$anon_L48_1`, `api/owner/requests.js:default$anon_L42_1` | L41 |
| `getPacificToday` | `function` | Yes | `(now: Date)` | `sync_value` | `api/owner/schedule.js:default`, `api/schedule/today.js:default`, `lib/customer-exploration.js:startOfPacificDateIso`, `lib/customer-exploration.js:mapHistoricalTimestampToPacificDate` | L77 |
| `daysBetweenISO` | `function` | No | `(startIso: unknown, endIso: unknown)` | `sync_value` | `lib/dates.js:validateFuturePacificDate` | L90 |
| `validateFuturePacificDate` | `function` | Yes | `(dateStr: unknown, now: Date)` | `sync_value` | `api/bookings/create.js:default`, `api/trucks/availability.js:default` | L102 |
| `isValidTimeValue` | `function` | Yes | `(value: unknown)` | `sync_value` | `api/owner/location.js:default`, `api/owner/schedule.js:default` | L126 |

### [lib/db-tx.js](../../../lib/db-tx.js) (`module`)
- **Imports / Dependencies**: `./request-context.js`
- **Exports**: `SessionEligibilityError`, `clearTxVerificationState`, `respondIfSessionEligibilityError`, `withTransaction`
- **Significant Constants**: `ACTIVE_TX_TOKEN`, `VERIFIED_TX_IDENTITY`

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `SessionEligibilityError.constructor` | `constructor` | No | `(status: unknown, code: unknown, message: unknown)` | `void_or_implicit` | — | L21 |
| `clearTxVerificationState` | `function` | Yes | `(tx: unknown)` | `void_or_implicit` | `lib/db-tx.js:withTransaction$anon_L180_2`, `lib/db-tx.js:tx.__bsTxCleanup`, `lib/db-tx.js:withTransaction` | L29 |
| `respondIfSessionEligibilityError` | `function` | Yes | `(err: unknown, res: unknown)` | `sync_value` | `api/bookings/create.js:default`, `api/community/mine.js:default`, `api/community/moderate.js:default`, `api/community/post.js:default` | L37 |
| `verifySessionAndEligibilityInTx` | `function` | No | `(tx: unknown)` | `async -> promise (throws: thrown_value)` | `lib/db-tx.js:withTransaction`, `lib/db-tx.js:withTransaction$anon_L180_2` | L57 |
| `withTransaction` | `function` | Yes | `(db: unknown, fn: unknown)` | `async -> promise (throws: Error, thrown_value)` | `api/bookings/create.js:default`, `api/community/mine.js:default`, `api/community/moderate.js:default`, `api/community/post.js:default` | L169 |

### [lib/diagnostics.js](../../../lib/diagnostics.js) (`module`)
- **Imports / Dependencies**: `node:crypto`
- **Exports**: `CLIENT_BUNDLE_VERSION`, `REPOSITORY_COMMIT_BASE_URL`, `ALLOWED_COMPONENTS`, `ALLOWED_SEVERITIES`, `ALLOWED_OUTCOMES`, `ALLOWED_TRIAGE_STATUSES`, `ALLOWED_FEATURE_KEYS`, `TOP_ONLY_FEATURE_KEYS`, `__setDiagnosticsFaultInjectionForTests`, `getDiagnosticsRetentionPolicy`, `generateCorrelationId`, `normalizeCorrelationId`, `normalizeReleaseSha`, `sanitizeDiagnosticText`, `sanitizeRouteTemplate`, `sanitizeIdentifierCode`, `sanitizeOperationName`, `sanitizeSafeContext`, `inferFeatureFromRoute`, `buildDefaultUserImpact`, `buildDefaultNextSteps`, `computeIncidentFingerprint`, `recordServerReleaseStartup`, `recordWorkerHeartbeat`, `recordDiagnosticEvent`, `reportDomainRouteFailure`, `computeReleaseRelationship`, `cleanupExpiredDiagnostics`
- **Significant Constants**: `CLIENT_BUNDLE_VERSION` *(exported)*, `REPOSITORY_COMMIT_BASE_URL` *(exported)*, `ALLOWED_COMPONENTS` *(exported)*, `ALLOWED_SEVERITIES` *(exported)*, `ALLOWED_OUTCOMES` *(exported)*, `ALLOWED_TRIAGE_STATUSES` *(exported)*, `ALLOWED_FEATURE_KEYS` *(exported)*, `TOP_ONLY_FEATURE_KEYS` *(exported)*, `SAFE_CONTEXT_KEYS`

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `__setDiagnosticsFaultInjectionForTests` | `function` | Yes | `(fnOrNull: unknown)` | `void_or_implicit` | — | L97 |
| `readIntEnv` | `function` | No | `(env: unknown, suffix: unknown, fallback: unknown, min: unknown, max: unknown)` | `sync_value` | `lib/diagnostics.js:getDiagnosticsRetentionPolicy` | L101 |
| `getDiagnosticsRetentionPolicy` | `function` | Yes | `(env: unknown)` | `sync_value` | `lib/diagnostics.js:recordDiagnosticEvent`, `lib/diagnostics.js:cleanupExpiredDiagnostics`, `server/admin-routes.js:handleGovernanceApiRequest$anon_L7420_88` | L110 |
| `generateCorrelationId` | `function` | Yes | `()` | `sync_value` | `lib/diagnostics.js:recordDiagnosticEvent`, `lib/diagnostics.js:reportDomainRouteFailure`, `server/app.js:createStandaloneServer$anon_L546_3` | L122 |
| `normalizeCorrelationId` | `function` | Yes | `(value: unknown)` | `sync_value` | `lib/diagnostics.js:recordWorkerHeartbeat`, `lib/diagnostics.js:recordDiagnosticEvent`, `lib/diagnostics.js:reportDomainRouteFailure`, `lib/support-tickets.js:sanitizeSupportContextFields` | L126 |
| `normalizeReleaseSha` | `function` | Yes | `(value: unknown)` | `sync_value` | `lib/diagnostics.js:recordServerReleaseStartup`, `lib/diagnostics.js:recordWorkerHeartbeat`, `lib/diagnostics.js:recordDiagnosticEvent`, `lib/diagnostics.js:computeReleaseRelationship` | L132 |
| `sanitizeDiagnosticText` | `function` | Yes | `(input: unknown, maxLen: number, fallback: string)` | `sync_value` | `lib/customer-profile.js:submitPublicSharedPageReport`, `lib/diagnostics.js:sanitizeSafeContext`, `lib/diagnostics.js:recordServerReleaseStartup`, `lib/diagnostics.js:recordDiagnosticEvent` | L140 |
| `sanitizeRouteTemplate` | `function` | Yes | `(rawInput: unknown)` | `sync_value` | `lib/diagnostics.js:recordDiagnosticEvent`, `server/admin-routes.js:handleGovernanceApiRequest` | L193 |
| `sanitizeIdentifierCode` | `function` | Yes | `(rawInput: unknown, fallback: string, maxLen: number)` | `sync_value` | `lib/diagnostics.js:recordServerReleaseStartup`, `lib/diagnostics.js:recordWorkerHeartbeat`, `lib/diagnostics.js:recordDiagnosticEvent`, `lib/diagnostics.js:reportDomainRouteFailure` | L228 |
| `sanitizeOperationName` | `function` | Yes | `(rawInput: unknown, fallback: string)` | `sync_value` | `lib/diagnostics.js:recordDiagnosticEvent`, `lib/support-tickets.js:sanitizeSupportContextFields`, `server/admin-routes.js:handleGovernanceApiRequest` | L238 |
| `sanitizeSafeContext` | `function` | Yes | `(rawCtx: unknown)` | `sync_value` | `lib/diagnostics.js:recordWorkerHeartbeat`, `lib/diagnostics.js:recordDiagnosticEvent`, `server/admin-routes.js:handleGovernanceApiRequest` | L249 |
| `inferFeatureFromRoute` | `function` | Yes | `(routeTemplate: unknown)` | `sync_value` | `lib/diagnostics.js:recordDiagnosticEvent` | L270 |
| `buildDefaultUserImpact` | `function` | Yes | `(featureKey: unknown, outcomeState: unknown)` | `sync_value` | `lib/diagnostics.js:recordDiagnosticEvent` | L310 |
| `buildDefaultNextSteps` | `function` | Yes | `(featureKey: unknown, component: unknown)` | `sync_value` | `lib/diagnostics.js:recordDiagnosticEvent` | L377 |
| `computeIncidentFingerprint` | `function` | Yes | `({ component, featureKey, routeOrOp, errorCode, isSyntheticTest }: object)` | `sync_value` | `lib/diagnostics.js:recordDiagnosticEvent` | L402 |
| `withDiagnosticsDb` | `function` | No | `(db: unknown, fn: unknown)` | `async -> promise (throws: thrown_value)` | `lib/diagnostics.js:recordServerReleaseStartup`, `lib/diagnostics.js:recordWorkerHeartbeat`, `lib/diagnostics.js:recordDiagnosticEvent`, `lib/diagnostics.js:cleanupExpiredDiagnostics` | L413 |
| `recordServerReleaseStartup` | `function` | Yes | `(db: unknown, { releaseSha, environment, deployMode, clientBundleVersion, logger }: object)` | `async -> promise` | `scripts/run-pager-worker.cjs:<top_level>$anon_L89_5`, `server/app.js:createStandaloneServer` | L446 |
| `recordWorkerHeartbeat` | `function` | Yes | `(db: unknown, { workerName, status, releaseSha, correlationId, summary }: object)` | `async -> promise` | `api/pager/worker.js:default`, `scripts/run-pager-worker.cjs:<top_level>$anon_L89_5` | L502 |
| `appendBoundedUnique` | `function` | No | `(existingList: unknown, nextVal: unknown, maxItems: number)` | `sync_value` | `lib/diagnostics.js:recordDiagnosticEvent$anon_L659_9` | L537 |
| `shaMatchesCandidate` | `function` | No | `(actualSha: unknown, candidateFixSha: unknown)` | `sync_value` | `lib/diagnostics.js:recordDiagnosticEvent`, `lib/diagnostics.js:recordDiagnosticEvent$anon_L659_9`, `lib/diagnostics.js:computeReleaseRelationship$anon_L964_12`, `lib/diagnostics.js:computeReleaseRelationship` | L545 |
| `recordDiagnosticEvent` | `function` | Yes | `(db: unknown, rawEvent: object, { env, fallbackLogger }: object)` | `async -> promise` | `api/pager/worker.js:default$anon_L108_1`, `api/pager/worker.js:default`, `lib/diagnostics.js:reportDomainRouteFailure`, `lib/standalone-auth.js:recordAuthTelemetry` | L552 |
| `reportDomainRouteFailure` | `function` | Yes | `(db: unknown, req: unknown, err: unknown, { featureKey, operationName, routeTemplate, severity, errorCode }: object)` | `async -> promise` | — | L896 |
| `computeReleaseRelationship` | `function` | Yes | `(group: unknown, releases: array, activeServerSha: string)` | `sync_value` | `server/admin-routes.js:handleGovernanceApiRequest$anon_L7420_88$anon_L7563_89`, `server/admin-routes.js:handleGovernanceApiRequest$anon_L7584_90` | L925 |
| `cleanupExpiredDiagnostics` | `function` | Yes | `(db: unknown, { env }: object)` | `async -> promise` | `api/pager/worker.js:default`, `scripts/run-pager-worker.cjs:<top_level>$anon_L89_5`, `server/admin-routes.js:handleGovernanceApiRequest` | L994 |

### [lib/discovery.js](../../../lib/discovery.js) (`module`)
- **Imports / Dependencies**: `./authz.js`, `node:crypto`
- **Exports**: `isVendorPubliclyDiscoverable`, `CATALOG_SECTIONS`, `MEASURED_LOCATION_ACCURACIES`, `FORBIDDEN_SELF_ELEVATION_FIELDS`, `findForbiddenSelfElevationField`, `validateCoordinates`, `milesBetween`, `shiftCalendarDate`, `weekdayForCalendarDate`, `getPacificClock`, `parseTimeMinutes`, `evaluateSchedulePrecedence`, `evaluateVendorDiscoveryRow`, `computeEvaluatedCatalogVersion`, `buildDiscoveryEtag`, `loadDiscoveryCatalog`, `computeSectionCounts`, `applyDiscoveryCacheHeaders`, `foldSearchText`
- **Significant Constants**: `CATALOG_SECTIONS` *(exported)*, `MEASURED_LOCATION_ACCURACIES` *(exported)*, `FORBIDDEN_SELF_ELEVATION_FIELDS` *(exported)*, `MEASURED_ACCURACY_SET`, `SECTION_SET`, `WEEKDAY_NAMES`, `LEGACY_LIVE_TTL_MS`, `DISCOVERY_SQL_BASE`

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `isVendorPubliclyDiscoverable` | `function` | Yes | `(vendorRow: unknown, nowMs: unknown)` | `sync_value` | `api/schedule/today.js:default$anon_L65_1`, `api/trucks/availability.js:default`, `lib/customer-exploration.js:loadVendorForUserActionInTx`, `lib/customer-exploration.js:computeExplorationSummaryInTx$anon_L674_3` | L8 |
| `findForbiddenSelfElevationField` | `function` | Yes | `(body: unknown)` | `sync_value` | `api/owner/location.js:default`, `api/owner/profile.js:default`, `api/owner/schedule.js:default` | L41 |
| `validateCoordinates` | `function` | Yes | `(rawLat: unknown, rawLng: unknown)` | `sync_value` | `api/owner/location.js:default`, `api/trucks.js:default`, `api/trucks/[id].js:default`, `api/trucks/nearby.js:default` | L51 |
| `milesBetween` | `function` | Yes | `(lat1: unknown, lng1: unknown, lat2: unknown, lng2: unknown)` | `sync_value` | `lib/discovery.js:evaluateVendorDiscoveryRow`, `public/app.js:recomputeDistances$anon_L350_11`, `public/app.js:locateMe$anon_L2403_62$anon_L2407_63` | L85 |
| `shiftCalendarDate` | `function` | Yes | `(isoDate: unknown, deltaDays: unknown)` | `sync_value` | `lib/discovery.js:getPacificClock` | L95 |
| `weekdayForCalendarDate` | `function` | Yes | `(isoDate: unknown)` | `sync_value` | `lib/discovery.js:getPacificClock` | L104 |
| `getPacificClock` | `function` | Yes | `(now: Date)` | `sync_value` | `lib/discovery.js:evaluateVendorDiscoveryRow`, `lib/discovery.js:loadDiscoveryCatalog` | L110 |
| `parseTimeMinutes` | `function` | Yes | `(value: unknown)` | `sync_value` | `lib/discovery.js:format12Hour`, `lib/discovery.js:formatWindowHours`, `lib/discovery.js:evaluateSameDayOrStartWindow`, `lib/discovery.js:evaluateLiveWindow` | L142 |
| `format12Hour` | `function` | No | `(hhmm: unknown)` | `sync_value` | `lib/discovery.js:formatWindowHours` | L149 |
| `formatWindowHours` | `function` | No | `(opensRaw: unknown, closesRaw: unknown, fallbackPrefix: unknown)` | `sync_value` | `lib/discovery.js:evaluateSchedulePrecedence` | L159 |
| `evaluateSameDayOrStartWindow` | `function` | No | `(opensRaw: unknown, closesRaw: unknown, currentMinutes: unknown)` | `sync_value` | `lib/discovery.js:evaluateSchedulePrecedence` | L173 |
| `evaluateLiveWindow` | `function` | No | `(opensRaw: unknown, closesRaw: unknown, currentMinutes: unknown)` | `sync_value` | `lib/discovery.js:evaluateSchedulePrecedence` | L187 |
| `toIsoOrNull` | `function` | No | `(val: unknown)` | `sync_value` | `lib/discovery.js:evaluateVendorDiscoveryRow` | L201 |
| `epochMsOf` | `function` | No | `(val: unknown)` | `sync_value` | `lib/discovery.js:evaluateSchedulePrecedence`, `lib/discovery.js:evaluateVendorDiscoveryRow`, `lib/discovery.js:computeEvaluatedCatalogVersion` | L207 |
| `sameLocationText` | `function` | No | `(a: unknown, b: unknown)` | `sync_value` | `lib/discovery.js:evaluateVendorDiscoveryRow` | L213 |
| `normalizePhotoUrl` | `function` | No | `(photo: unknown, photoRightsVerified: unknown)` | `sync_value` | `lib/discovery.js:evaluateVendorDiscoveryRow` | L221 |
| `parseRecurringSchedule` | `function` | No | `(raw: unknown)` | `sync_value` | `lib/discovery.js:evaluateSchedulePrecedence` | L228 |
| `evaluateSchedulePrecedence` | `function` | Yes | `(row: unknown, clock: unknown)` | `sync_value` | `lib/discovery.js:evaluateVendorDiscoveryRow` | L241 |
| `evaluateVendorDiscoveryRow` | `function` | Yes | `(row: unknown, { clock, userCoords }: object)` | `sync_value` | `lib/discovery.js:loadDiscoveryCatalog$anon_L726_3` | L359 |
| `computeEvaluatedCatalogVersion` | `function` | Yes | `(listings: unknown, rows: unknown, localDate: unknown)` | `sync_value` | `lib/discovery.js:loadDiscoveryCatalog` | L646 |
| `buildDiscoveryEtag` | `function` | Yes | `(catalogVersion: unknown, variantKey: string)` | `sync_value` | `lib/discovery.js:applyDiscoveryCacheHeaders` | L693 |
| `loadDiscoveryCatalog` | `function` | Yes | `(db: unknown, { now, userCoords, vendorId }: object)` | `async -> promise (throws: thrown_value)` | `api/catalog/featured.js:default`, `api/trucks.js:default`, `api/trucks/[id].js:default`, `api/trucks/search.js:default` | L702 |
| `computeSectionCounts` | `function` | Yes | `(listings: unknown)` | `sync_value` | `api/trucks.js:default` | L738 |
| `applyDiscoveryCacheHeaders` | `function` | Yes | `(res: unknown, catalogVersion: unknown, { freshRequested, personalized, variantKey }: object)` | `sync_value` | `api/catalog/featured.js:default`, `api/schedule/today.js:default`, `api/trucks.js:default`, `api/trucks/[id].js:default` | L747 |
| `foldSearchText` | `function` | Yes | `(value: unknown)` | `sync_value` | `api/trucks/search.js:default`, `api/trucks/search.js:default$anon_L33_2` | L777 |

### [lib/editorial-stories.js](../../../lib/editorial-stories.js) (`module`)
- **Exports**: `EDITORIAL_STORIES`, `EDITORIAL_STORIES_BY_ID`, `EDITORIAL_STORIES_BY_VENDOR_ID`, `buildPublicStoriesPayload`
- **Significant Constants**: `EDITORIAL_STORIES` *(exported)*, `EDITORIAL_STORIES_BY_ID` *(exported)*, `EDITORIAL_STORIES_BY_VENDOR_ID` *(exported)*

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `buildPublicStoriesPayload` | `function` | Yes | `(discoverableVendorIds: null_or_object)` | `sync_value` | `server/customer-exploration-routes.js:handleCustomerExplorationRoute` | L156 |

### [lib/env-compat.js](../../../lib/env-compat.js) (`module`)
- **Exports**: `EnvAliasConflictError`, `SECURITY_CRITICAL_ENV_SUFFIXES`, `readEnvCompat`, `findSecurityEnvConflicts`, `assertNoSecurityEnvConflicts`
- **Significant Constants**: `SECURITY_CRITICAL_ENV_SUFFIXES` *(exported)*

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `EnvAliasConflictError.constructor` | `constructor` | No | `(suffix: unknown)` | `void_or_implicit` | — | L12 |
| `readEnvCompat` | `function` | Yes | `(suffix: unknown, { securityCritical, defaultValue, envObj }: object)` | `sync_value (throws: EnvAliasConflictError)` | `api/pager/telemetry.js:default`, `api/pager/worker.js:default`, `lib/authz.js:configuredAdminIds`, `lib/authz.js:inspectWritePauseConfig` | L53 |
| `findSecurityEnvConflicts` | `function` | Yes | `(envObj: unknown)` | `sync_value (throws: thrown_value)` | `lib/env-compat.js:assertNoSecurityEnvConflicts`, `lib/standalone-auth.js:inspectAdminEmailReadiness` | L73 |
| `assertNoSecurityEnvConflicts` | `function` | Yes | `(envObj: unknown)` | `void_or_implicit (throws: thrown_value)` | `server/app.js:createStandaloneServer$anon_L546_3`, `server/index.js:validateStartupEnvironment` | L89 |

### [lib/feature-controls.js](../../../lib/feature-controls.js) (`module`)
- **Imports / Dependencies**: `./authz.js`, `./db-tx.js`, `./env-compat.js`, `./map-config.js`
- **Exports**: `VALID_FEATURE_STATES`, `VALID_FEATURE_AUDIENCES`, `PROTECTED_ESSENTIAL_CAPABILITIES`, `FEATURE_CONTROLS_REGISTRY`, `FEATURE_CONTROLS_BY_KEY`, `assertCycleFreeFeatureRegistry`, `ROUTE_FEATURE_ENFORCEMENT_RULES`, `setSimulatedFeatureConfigFailureForTests`, `inspectEnvironmentFeatureOverrides`, `loadPersistedFeatureControls`, `isCallerEligibleForStaffBeta`, `evaluateFeatureControlsSnapshot`, `buildPublicFeatureControlsPayload`, `buildAdminFeatureControlsPayload`, `requiresInterruptConfirmation`, `updateFeatureControlInTx`, `matchRouteFeatureRule`, `enforceHttpFeatureGate`, `isPagerPushSubscriptionFeatureEnabled`, `isPagerPushDeliveryFeatureAllowed`, `checkPagerPushDeliveryInTx`
- **Significant Constants**: `VALID_FEATURE_STATES` *(exported)*, `VALID_FEATURE_AUDIENCES` *(exported)*, `PROTECTED_ESSENTIAL_CAPABILITIES` *(exported)*, `FEATURE_CONTROLS_REGISTRY` *(exported)*, `FEATURE_CONTROLS_BY_KEY` *(exported)*, `ROUTE_FEATURE_ENFORCEMENT_RULES` *(exported)*

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `assertCycleFreeFeatureRegistry` | `function` | Yes | `(registry: unknown)` | `sync_value` | `lib/feature-controls.js:<top_level>` | L774 |
| `setSimulatedFeatureConfigFailureForTests` | `function` | Yes | `(mode: unknown)` | `void_or_implicit` | — | L1004 |
| `parseBoolDisableFlag` | `function` | No | `(suffix: unknown)` | `sync_value (throws: thrown_value)` | `lib/feature-controls.js:inspectEnvironmentFeatureOverrides` | L1008 |
| `inspectPushEnvironmentStatus` | `function` | No | `()` | `sync_value (throws: thrown_value)` | `lib/feature-controls.js:inspectEnvironmentFeatureOverrides` | L1022 |
| `inspectEnvironmentFeatureOverrides` | `function` | Yes | `()` | `sync_value` | `lib/feature-controls.js:evaluateFeatureControlsSnapshot`, `lib/feature-controls.js:checkPagerPushDeliveryInTx` | L1072 |
| `validatePersistedRows` | `function` | No | `(rows: unknown)` | `sync_value` | `lib/feature-controls.js:loadPersistedFeatureControls`, `lib/feature-controls.js:checkPagerPushDeliveryInTx` | L1174 |
| `loadPersistedFeatureControls` | `function` | Yes | `(db: unknown, { requireTablePresent }: object)` | `async -> promise` | `lib/feature-controls.js:enforceHttpFeatureGate`, `lib/feature-controls.js:isPagerPushSubscriptionFeatureEnabled`, `lib/feature-controls.js:isPagerPushDeliveryFeatureAllowed`, `scripts/manage-feature-controls.cjs:<top_level>$anon_L98_1` | L1207 |
| `isCallerEligibleForStaffBeta` | `function` | Yes | `(accessCtx: unknown, viewpointMode: null_or_object)` | `sync_value` | `lib/feature-controls.js:evaluateFeatureControlsSnapshot` | L1278 |
| `combineStateSeverity` | `function` | No | `(stateA: unknown, stateB: unknown)` | `sync_value` | `lib/feature-controls.js:evaluateKey` | L1292 |
| `evaluateFeatureControlsSnapshot` | `function` | Yes | `({ persistedResult, accessCtx, viewpointMode, envOverrides }: object)` | `sync_value` | `lib/feature-controls.js:enforceHttpFeatureGate`, `lib/feature-controls.js:isPagerPushSubscriptionFeatureEnabled`, `lib/feature-controls.js:isPagerPushDeliveryFeatureAllowed`, `scripts/manage-feature-controls.cjs:<top_level>$anon_L98_1` | L1299 |
| `buildPublicFeatureControlsPayload` | `function` | Yes | `(evaluated: unknown)` | `sync_value` | `server/admin-routes.js:handleGovernanceApiRequest` | L1462 |
| `buildAdminFeatureControlsPayload` | `function` | Yes | `(evaluated: unknown, historyRows: array, { actorLevel }: object)` | `sync_value` | `server/admin-routes.js:handleGovernanceApiRequest` | L1518 |
| `requiresInterruptConfirmation` | `function` | Yes | `(spec: unknown, prevState: unknown, prevAudience: unknown, nextState: unknown, nextAudience: unknown)` | `sync_value` | `lib/feature-controls.js:updateFeatureControlInTx` | L1586 |
| `updateFeatureControlInTx` | `function` | Yes | `(tx: unknown, { actorId, actorEmailMasked, actorRole, changeSource, featureKey, nextState, nextAudience, expectedRevision, reason, confirmedImpact }: object)` | `async -> promise` | `scripts/manage-feature-controls.cjs:<top_level>$anon_L98_1`, `server/admin-routes.js:handleGovernanceApiRequest$anon_L7311_86` | L1597 |
| `matchRouteFeatureRule` | `function` | Yes | `(pathname: unknown, method: unknown)` | `sync_value` | `lib/feature-controls.js:enforceHttpFeatureGate`, `server/app.js:createStandaloneServer$anon_L546_3` | L1794 |
| `enforceHttpFeatureGate` | `function` | Yes | `({ dbAdapter, req, auth, pathname, method, requireTablePresent }: object)` | `async -> promise` | `server/app.js:createStandaloneServer$anon_L546_3` | L1805 |
| `isPagerPushSubscriptionFeatureEnabled` | `function` | Yes | `(db: unknown)` | `async -> promise` | `api/pager/status.js:default`, `api/pager/subscriptions.js:default` | L1903 |
| `isPagerPushDeliveryFeatureAllowed` | `function` | Yes | `(db: unknown)` | `async -> promise` | `api/pager/subscriptions.js:default`, `lib/pager-notifications.js:runNotificationWorkerBatch` | L1911 |
| `checkPagerPushDeliveryInTx` | `function` | Yes | `(tx: unknown)` | `async -> promise` | `lib/pager-notifications.js:prepareClaimForDispatch$anon_L1164_8` | L1924 |

### [lib/map-config.js](../../../lib/map-config.js) (`module`)
- **Imports / Dependencies**: `./env-compat.js`
- **Exports**: `ALLOWLISTED_MAP_PROVIDERS`, `resolveMapRuntimeConfig`
- **Significant Constants**: `ALLOWLISTED_MAP_PROVIDERS` *(exported)*, `FORBIDDEN_SECRET_TOKEN_PREFIXES`

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `buildDisabledMapResult` | `function` | No | `({ configValid, providerId, providerLabel, statusReason, errorCode }: object)` | `sync_value` | `lib/map-config.js:resolveMapRuntimeConfig` | L109 |
| `isProductionRuntime` | `function` | No | `(envObj: unknown)` | `sync_value` | `lib/map-config.js:resolveMapRuntimeConfig` | L126 |
| `validatePublicBrowserToken` | `function` | No | `(rawToken: unknown, tokenMode: unknown)` | `sync_value` | `lib/map-config.js:resolveMapRuntimeConfig` | L140 |
| `validateAndBuildTileTemplate` | `function` | No | `(provider: unknown, customTemplate: unknown, publicToken: unknown)` | `sync_value` | `lib/map-config.js:resolveMapRuntimeConfig` | L173 |
| `resolveMapRuntimeConfig` | `function` | Yes | `(envObj: unknown)` | `sync_value` | `lib/feature-controls.js:inspectEnvironmentFeatureOverrides`, `lib/feature-controls.js:buildPublicFeatureControlsPayload` | L258 |

### [lib/pager-notifications.js](../../../lib/pager-notifications.js) (`module`)
- **Imports / Dependencies**: `./authz.js`, `./client-ip.js`, `./db-tx.js`, `./env-compat.js`, `./feature-controls.js`, `./webpush-crypto.js`, `node:crypto`, `node:net`
- **Exports**: `MAX_ACTIVE_SUBSCRIPTIONS_PER_PAGER`, `MAX_CATCHUP_DELIVERIES_PER_EVENT`, `READY_FLAP_COOLDOWN_MS`, `WORKER_LEASE_SECONDS`, `DEFAULT_WORKER_CONCURRENCY`, `DEFAULT_PROVIDER_TIMEOUT_MS`, `DEFAULT_WORKER_EXECUTION_BUDGET_MS`, `RETRY_BACKOFF_SECONDS`, `RETENTION_HOURS`, `setFakePushProviderForTests`, `sha256Hex`, `enablePagerInternalContext`, `isProductionEnvironment`, `parseFailClosedBooleanFlag`, `isSubscriptionsDisabled`, `isNotificationDeliveryDisabled`, `getPushProviderConfig`, `inspectNotificationRuntimeConfig`, `validateSubscriptionPayload`, `verifySameOriginMutation`, `extractClientRateKey`, `consumePagerRateLimit`, `redactProviderError`, `handlePagerTransitionNotificationsInTx`, `enqueueReadyCatchupInTx`, `purgeExpiredNotificationRecords`, `runNotificationWorkerBatch`, `UUID_RE`, `toBase64Url`
- **Significant Constants**: `MAX_ACTIVE_SUBSCRIPTIONS_PER_PAGER` *(exported)*, `MAX_CATCHUP_DELIVERIES_PER_EVENT` *(exported)*, `READY_FLAP_COOLDOWN_MS` *(exported)*, `WORKER_LEASE_SECONDS` *(exported)*, `DEFAULT_WORKER_CONCURRENCY` *(exported)*, `DEFAULT_PROVIDER_TIMEOUT_MS` *(exported)*, `DEFAULT_WORKER_EXECUTION_BUDGET_MS` *(exported)*, `RETRY_BACKOFF_SECONDS` *(exported)*, `RETENTION_HOURS` *(exported)*, `VALID_RUNTIME_ENVS`, `DEFAULT_ALLOWED_PUSH_HOST_SUFFIXES`, `EPHEMERAL_TEST_VAPID`

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `setFakePushProviderForTests` | `function` | Yes | `(fn: unknown)` | `void_or_implicit` | — | L48 |
| `sha256Hex` | `function` | Yes | `(value: unknown)` | `sync_value` | `api/pager/subscriptions.js:default`, `api/pager/subscriptions.js:default$anon_L120_2`, `lib/admin-governance.js:generateOpaqueToken`, `lib/admin-governance.js:verifyEvidenceBufferAndMime` | L52 |
| `enablePagerInternalContext` | `function` | Yes | `(tx: unknown)` | `async -> promise` | `api/pager/subscriptions.js:default$anon_L58_1`, `api/pager/subscriptions.js:default$anon_L120_2`, `api/pager/subscriptions.js:default$anon_L266_3`, `api/pager/telemetry.js:default$anon_L33_1` | L56 |
| `isProductionEnvironment` | `function` | Yes | `()` | `sync_value (throws: thrown_value)` | `lib/pager-notifications.js:getPushProviderConfig`, `lib/pager-notifications.js:validateSubscriptionPayload` | L60 |
| `parseFailClosedBooleanFlag` | `function` | Yes | `(rawVal: unknown)` | `sync_value` | `lib/pager-notifications.js:isSubscriptionsDisabled`, `lib/pager-notifications.js:isNotificationDeliveryDisabled`, `lib/pager-notifications.js:inspectNotificationRuntimeConfig` | L83 |
| `isSubscriptionsDisabled` | `function` | Yes | `()` | `sync_value (throws: thrown_value)` | `api/pager/status.js:default`, `api/pager/subscriptions.js:default`, `lib/pager-notifications.js:inspectNotificationRuntimeConfig` | L98 |
| `isNotificationDeliveryDisabled` | `function` | Yes | `()` | `sync_value (throws: thrown_value)` | `lib/pager-notifications.js:getPushProviderConfig`, `lib/pager-notifications.js:inspectNotificationRuntimeConfig`, `lib/pager-notifications.js:processSingleClaimedDelivery`, `lib/pager-notifications.js:runNotificationWorkerBatch` | L109 |
| `getPushProviderConfig` | `function` | Yes | `()` | `sync_value (throws: Error, thrown_value)` | `api/pager/status.js:default`, `api/pager/subscriptions.js:default`, `lib/pager-notifications.js:inspectNotificationRuntimeConfig`, `lib/pager-notifications.js:validateSubscriptionPayload` | L120 |
| `inspectNotificationRuntimeConfig` | `function` | Yes | `()` | `sync_value` | `api/pager/telemetry.js:default`, `server/admin-routes.js:handleGovernanceApiRequest$anon_L2914_37` | L315 |
| `extraAllowedPushHosts` | `function` | No | `()` | `sync_value (throws: thrown_value)` | `lib/pager-notifications.js:isAllowedWebPushHostname` | L371 |
| `isAllowedWebPushHostname` | `function` | No | `(hostname: unknown)` | `sync_value` | `lib/pager-notifications.js:validateSubscriptionPayload` | L388 |
| `validateSubscriptionPayload` | `function` | Yes | `(body: unknown)` | `sync_value (throws: thrown_value)` | `api/pager/subscriptions.js:default` | L406 |
| `verifySameOriginMutation` | `function` | Yes | `(req: unknown)` | `sync_value` | `api/pager/subscriptions.js:default` | L506 |
| `extractClientRateKey` | `function` | Yes | `(req: unknown)` | `sync_value` | `api/pager/status.js:default`, `api/pager/subscriptions.js:default`, `server/admin-routes.js:handleGovernanceApiRequest$anon_L642_6`, `server/customer-profile-routes.js:handleCustomerProfileRoute` | L540 |
| `consumePagerRateLimit` | `function` | Yes | `(db: unknown, { scope, subjectKey, maxHits, windowSeconds, now }: object)` | `async -> promise` | `api/pager/status.js:default`, `api/pager/subscriptions.js:default` | L545 |
| `redactProviderError` | `function` | Yes | `(rawError: unknown)` | `sync_value` | `lib/pager-notifications.js:acknowledgeClaimedDelivery$anon_L1367_9` | L573 |
| `buildPagerReadyEventSpec` | `function` | No | `(pager: unknown, seq: unknown)` | `sync_value` | `lib/pager-notifications.js:ensureReadyEventInTx` | L582 |
| `ensureReadyEventInTx` | `function` | No | `(tx: unknown, { pager, seq, nowIso }: object)` | `async -> promise` | `lib/pager-notifications.js:handlePagerTransitionNotificationsInTx`, `lib/pager-notifications.js:enqueueReadyCatchupInTx` | L611 |
| `handlePagerTransitionNotificationsInTx` | `function` | Yes | `(tx: unknown, { pager, nextStatus, now }: object)` | `async -> promise` | `api/pager/update.js:default$anon_L45_1` | L648 |
| `enqueueReadyCatchupInTx` | `function` | Yes | `(tx: unknown, { pager, subscriptionId, priorStatus, replacedSubscriptionId, now }: object)` | `async -> promise` | `api/pager/subscriptions.js:default$anon_L266_3` | L768 |
| `dispatchToProvider` | `function` | No | `(freshTarget: unknown, providerCfg: unknown, { now, timeoutMs }: object)` | `async -> promise` | `lib/pager-notifications.js:processSingleClaimedDelivery` | L921 |
| `purgeExpiredNotificationRecords` | `function` | Yes | `(db: unknown, { now }: object)` | `async -> promise` | `lib/pager-notifications.js:runNotificationWorkerBatch` | L996 |
| `claimDueDeliveryWave` | `function` | No | `(db: unknown, { limit, workerId, leaseSeconds, now }: object)` | `async -> promise` | `lib/pager-notifications.js:runNotificationWorkerBatch` | L1080 |
| `releaseClaimedDeliveryBeforeSend` | `function` | No | `(db: unknown, { deliveryId, workerId, claimToken, now }: object)` | `async -> promise` | `lib/pager-notifications.js:processSingleClaimedDelivery` | L1123 |
| `prepareClaimForDispatch` | `function` | No | `(db: unknown, { claimed, workerId, leaseSeconds, now }: object)` | `async -> promise` | `lib/pager-notifications.js:processSingleClaimedDelivery` | L1156 |
| `acknowledgeClaimedDelivery` | `function` | No | `(db: unknown, { freshTarget, workerId, providerMode, providerResult, sendError, now }: object)` | `async -> promise` | `lib/pager-notifications.js:processSingleClaimedDelivery` | L1358 |
| `processSingleClaimedDelivery` | `function` | No | `(db: unknown, { claimed, workerId, leaseSeconds, providerTimeoutMs, startedAtMs, executionBudgetMs, getNow, hooks, summary }: object)` | `async -> promise` | `lib/pager-notifications.js:runNotificationWorkerBatch$anon_L1847_12` | L1579 |
| `runNotificationWorkerBatch` | `function` | Yes | `(db: unknown, { batchSize, concurrency, leaseSeconds, providerTimeoutMs, executionBudgetMs, workerId, now, clock, hooks, runCleanup }: object)` | `async -> promise` | `api/pager/worker.js:default`, `scripts/run-pager-worker.cjs:<top_level>$anon_L89_5` | L1690 |

### [lib/photo-storage.js](../../../lib/photo-storage.js) (`module`)
- **Imports / Dependencies**: `./env-compat.js`, `node:crypto`, `node:fs`, `node:os`, `node:path`, `sharp`
- **Exports**: `MAX_PHOTO_UPLOAD_BYTES`, `MAX_PHOTO_JSON_BODY_BYTES`, `MAX_ACTIVE_PHOTOS_PER_USER`, `MAX_PHOTO_DIMENSION_PX`, `MAX_PHOTO_INPUT_PIXELS`, `DEFAULT_MIN_FREE_DISK_BYTES`, `SUPPORTED_PHOTO_MIMES`, `PhotoStorageError`, `resolvePhotoStorageRoot`, `resolvePhotoMinFreeBytes`, `detectImageSignature`, `decodeBase64PhotoPayload`, `verifyAndNormalizeUploadedPhoto`, `writePhotoDerivativesAtomically`, `deletePhotoFilesSafely`, `readPhotoDerivativeSafely`, `scanPhotoStorageFiles`, `unlinkConfinedPhotoArtifact`, `createSharedPhotoDerivative`
- **Significant Constants**: `MAX_PHOTO_UPLOAD_BYTES` *(exported)*, `MAX_PHOTO_JSON_BODY_BYTES` *(exported)*, `MAX_ACTIVE_PHOTOS_PER_USER` *(exported)*, `MAX_PHOTO_DIMENSION_PX` *(exported)*, `MAX_PHOTO_INPUT_PIXELS` *(exported)*, `DEFAULT_MIN_FREE_DISK_BYTES` *(exported)*, `SUPPORTED_PHOTO_MIMES` *(exported)*

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `PhotoStorageError.constructor` | `constructor` | No | `(message: unknown, { status, code, retryable }: object)` | `void_or_implicit` | — | L39 |
| `resolvePhotoStorageRoot` | `function` | Yes | `(envObj: unknown)` | `sync_value` | `lib/customer-exploration.js:createUserPhoto`, `lib/customer-exploration.js:readUserPhotoFile`, `lib/customer-exploration.js:deleteUserPhoto`, `lib/customer-exploration.js:reconcilePhotoStorage` | L48 |
| `resolvePhotoMinFreeBytes` | `function` | Yes | `(envObj: unknown)` | `sync_value` | `lib/customer-exploration.js:createUserPhoto`, `lib/photo-storage.js:writePhotoDerivativesAtomically`, `lib/photo-storage.js:createSharedPhotoDerivative`, `server/customer-exploration-routes.js:handleCustomerExplorationRoute` | L67 |
| `detectImageSignature` | `function` | Yes | `(buf: unknown)` | `sync_value` | `lib/photo-storage.js:verifyAndNormalizeUploadedPhoto` | L79 |
| `decodeBase64PhotoPayload` | `function` | Yes | `(rawBase64: unknown)` | `sync_value (throws: PhotoStorageError)` | `lib/photo-storage.js:verifyAndNormalizeUploadedPhoto` | L118 |
| `verifyAndNormalizeUploadedPhoto` | `function` | Yes | `({ dataBase64, declaredMimeType }: object)` | `async -> promise (throws: PhotoStorageError, thrown_value)` | `lib/customer-exploration.js:createUserPhoto` | L182 |
| `ensureAndResolveStorageRoot` | `function` | No | `(storageRoot: unknown, { createIfDev }: object)` | `sync_value (throws: Error, PhotoStorageError)` | `lib/photo-storage.js:writePhotoDerivativesAtomically`, `lib/photo-storage.js:deletePhotoFilesSafely`, `lib/photo-storage.js:readPhotoDerivativeSafely`, `lib/photo-storage.js:scanPhotoStorageFiles` | L320 |
| `resolveConfinedPath` | `function` | No | `(realRoot: unknown, relPath: unknown)` | `sync_value (throws: PhotoStorageError)` | `lib/photo-storage.js:writePhotoDerivativesAtomically`, `lib/photo-storage.js:deletePhotoFilesSafely`, `lib/photo-storage.js:readPhotoDerivativeSafely`, `lib/photo-storage.js:createSharedPhotoDerivative` | L366 |
| `writeAtomicFile` | `function` | No | `(filePath: unknown, dataBuffer: unknown)` | `void_or_implicit (throws: PhotoStorageError)` | `lib/photo-storage.js:writePhotoDerivativesAtomically`, `lib/photo-storage.js:createSharedPhotoDerivative` | L388 |
| `writePhotoDerivativesAtomically` | `function` | Yes | `({ storageRoot, photoId, ext, mainBuffer, thumbBuffer, minFreeBytes }: object)` | `sync_value (throws: PhotoStorageError, thrown_value)` | `lib/customer-exploration.js:createUserPhoto` | L423 |
| `deletePhotoFilesSafely` | `function` | Yes | `({ storageRoot, storageRelPath, thumbRelPath }: object)` | `sync_value` | `lib/customer-exploration.js:createUserPhoto$anon_L1337_13`, `lib/customer-exploration.js:createUserPhoto`, `lib/customer-exploration.js:deleteUserPhoto`, `lib/customer-exploration.js:reconcilePhotoStorage$anon_L1644_18` | L491 |
| `readPhotoDerivativeSafely` | `function` | Yes | `({ storageRoot, relPath }: object)` | `sync_value (throws: PhotoStorageError)` | `lib/customer-exploration.js:readUserPhotoFile`, `lib/customer-profile.js:readSharedCollectionPhotoByToken`, `lib/customer-profile.js:readAdminReportedSharedPhoto`, `lib/photo-storage.js:createSharedPhotoDerivative` | L523 |
| `scanPhotoStorageFiles` | `function` | Yes | `({ storageRoot, nowMs, orphanMinAgeMs }: object)` | `sync_value` | `lib/customer-exploration.js:reconcilePhotoStorage$anon_L1644_18` | L553 |
| `unlinkConfinedPhotoArtifact` | `function` | Yes | `({ storageRoot, relPath }: object)` | `sync_value` | `lib/customer-exploration.js:deleteUserPhoto`, `lib/customer-exploration.js:reconcilePhotoStorage$anon_L1644_18`, `lib/customer-profile.js:clearCustomerProfileAndCollectionsData`, `lib/customer-profile.js:deleteOwnerCollection` | L619 |
| `createSharedPhotoDerivative` | `function` | Yes | `({ storageRoot, sourceRelPath, attachmentId, minFreeBytes }: object)` | `async -> promise (throws: PhotoStorageError, thrown_value)` | `lib/customer-profile.js:attachPhotoToCollectionEntry` | L654 |

### [lib/request-context.js](../../../lib/request-context.js) (`module`)
- **Imports / Dependencies**: `node:async_hooks`
- **Exports**: `runWithGovernanceContext`, `getActiveGovernanceContext`
- **Significant Constants**: `governanceContextStorage`

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `runWithGovernanceContext` | `function` | Yes | `(ctx: unknown, fn: unknown)` | `sync_value` | `server/app.js:createStandaloneServer$anon_L546_3$anon_L872_4`, `server/app.js:createStandaloneServer$anon_L546_3$anon_L972_6`, `server/app.js:createStandaloneServer$anon_L546_3$anon_L1142_9` | L5 |
| `getActiveGovernanceContext` | `function` | Yes | `()` | `sync_value` | `lib/authz.js:checkStandaloneHttpActOnBehalfRequirement`, `lib/authz.js:authorizeVendorTarget`, `lib/authz.js:reverifyVendorMembershipInTx`, `lib/authz.js:recordAuditLog` | L9 |

### [lib/standalone-auth.js](../../../lib/standalone-auth.js) (`module`)
- **Imports / Dependencies**: `./age-policy.js`, `./authz.js`, `./client-ip.js`, `./db-tx.js`, `./diagnostics.js`, `./env-compat.js`, `cookie`, `node:crypto`, `node:dns/promises`, `otplib`
- **Exports**: `SESSION_COOKIE_NAME`, `AGE_GATE_COOKIE_NAME`, `DEFAULT_AGE_GATE_COOLDOWN_SECONDS`, `AUTH_RATE_LIMIT_RETENTION_MS`, `AUTH_TELEMETRY_RETENTION_MS`, `DEFAULT_OTP_TTL_SECONDS`, `DEFAULT_OTP_MAX_ATTEMPTS`, `DEFAULT_SESSION_TTL_SECONDS`, `MAX_SESSION_LIFETIME_SECONDS`, `MAX_ACTIVE_SESSIONS_PER_USER`, `setCustomAuthEmailSenderForTests`, `setCustomDnsResolverForTests`, `parseConfiguredSenderAddress`, `getAuthSecret`, `inspectAuthDeliveryConfig`, `getPublicAuthDeliveryModeSummary`, `hasConfiguredStagingAllowlist`, `isEmailAllowedInStagingMailbox`, `normalizeEmail`, `buildSessionCookieHeader`, `buildClearedSessionCookieHeader`, `buildAgeGateCooldownCookieHeader`, `hasAgeGateCooldownCookie`, `extractRawSessionToken`, `verifySameOriginMutationRequest`, `consumeAuthRateLimit`, `createAuthCorrelationId`, `sanitizeDiagnosticCodeSafe`, `buildVerificationEmailPlainText`, `STAGING_INVITATION_REQUIRED_MESSAGE`, `resolveTrustedInvitationOrigin`, `evaluateStagingRecipientEligibilityInTx`, `evaluateStagingRecipientEligibility`, `buildInvitationEmailPlainText`, `dispatchInvitationEmail`, `dispatchSupportNotificationEmail`, `startEmailOtpChallenge`, `verifyEmailOtpChallenge`, `resolveSessionFromRequest`, `submitExistingAccountAgeAssessment`, `revokeSessionFromRequest`, `readProtectedStagingMailboxCode`, `cleanupExpiredAuthRecords`, `inspectSenderDomainDns`, `inspectAdminEmailReadiness`
- **Significant Constants**: `SESSION_COOKIE_NAME` *(exported)*, `AGE_GATE_COOKIE_NAME` *(exported)*, `DEFAULT_AGE_GATE_COOLDOWN_SECONDS` *(exported)*, `AUTH_RATE_LIMIT_RETENTION_MS` *(exported)*, `AUTH_TELEMETRY_RETENTION_MS` *(exported)*, `DEFAULT_OTP_TTL_SECONDS` *(exported)*, `DEFAULT_OTP_MAX_ATTEMPTS` *(exported)*, `DEFAULT_SESSION_TTL_SECONDS` *(exported)*, `MAX_SESSION_LIFETIME_SECONDS` *(exported)*, `MAX_ACTIVE_SESSIONS_PER_USER` *(exported)*, `EPHEMERAL_DEV_SECRET`, `DUMMY_CHALLENGE_ID`, `STAGING_INVITATION_REQUIRED_MESSAGE` *(exported)*

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `setCustomAuthEmailSenderForTests` | `function` | Yes | `(fn: unknown)` | `void_or_implicit` | — | L29 |
| `setCustomDnsResolverForTests` | `function` | Yes | `(resolver: unknown)` | `void_or_implicit` | — | L33 |
| `parseConfiguredSenderAddress` | `function` | Yes | `(rawFrom: unknown)` | `sync_value` | `lib/standalone-auth.js:inspectAuthDeliveryConfig`, `lib/standalone-auth.js:inspectAdminEmailReadiness` | L37 |
| `sha256Hex` | `function` | No | `(input: unknown)` | `sync_value` | `api/pager/subscriptions.js:default`, `api/pager/subscriptions.js:default$anon_L120_2`, `lib/admin-governance.js:generateOpaqueToken`, `lib/admin-governance.js:verifyEvidenceBufferAndMime` | L75 |
| `timingSafeStringMatch` | `function` | No | `(a: unknown, b: unknown)` | `sync_value` | `lib/standalone-auth.js:readProtectedStagingMailboxCode` | L79 |
| `getRuntimeEnv` | `function` | No | `()` | `sync_value` | `lib/standalone-auth.js:isHostedEnvironment`, `lib/standalone-auth.js:inspectAuthDeliveryConfig`, `lib/standalone-auth.js:verifySameOriginMutationRequest`, `lib/standalone-auth.js:resolveTrustedInvitationOrigin` | L87 |
| `isHostedEnvironment` | `function` | No | `()` | `sync_value (throws: thrown_value)` | `lib/standalone-auth.js:getAuthSecret`, `lib/standalone-auth.js:verifySameOriginMutationRequest` | L91 |
| `getAuthSecret` | `function` | Yes | `()` | `sync_value (throws: thrown_value)` | `lib/standalone-auth.js:deriveStagingMailboxKey`, `lib/standalone-auth.js:startEmailOtpChallenge`, `lib/standalone-auth.js:verifyEmailOtpChallenge`, `server/index.js:validateStartupEnvironment` | L102 |
| `inspectAuthDeliveryConfig` | `function` | Yes | `()` | `sync_value (throws: thrown_value)` | `lib/standalone-auth.js:getPublicAuthDeliveryModeSummary`, `lib/standalone-auth.js:dispatchInvitationEmail`, `lib/standalone-auth.js:dispatchSupportNotificationEmail`, `lib/standalone-auth.js:startEmailOtpChallenge` | L115 |
| `getPublicAuthDeliveryModeSummary` | `function` | Yes | `()` | `sync_value` | `server/admin-routes.js:handleGovernanceApiRequest$anon_L4571_62`, `server/app.js:createStandaloneServer$anon_L546_3` | L248 |
| `parseAllowlistedDomains` | `function` | No | `()` | `sync_value` | `lib/standalone-auth.js:inspectAuthDeliveryConfig`, `lib/standalone-auth.js:hasConfiguredStagingAllowlist`, `lib/standalone-auth.js:isEmailAllowedInStagingMailbox`, `lib/standalone-auth.js:inspectAdminEmailReadiness` | L259 |
| `parseAllowlistedEmails` | `function` | No | `()` | `sync_value` | `lib/standalone-auth.js:inspectAuthDeliveryConfig`, `lib/standalone-auth.js:hasConfiguredStagingAllowlist`, `lib/standalone-auth.js:isEmailAllowedInStagingMailbox`, `lib/standalone-auth.js:inspectAdminEmailReadiness` | L271 |
| `hasConfiguredStagingAllowlist` | `function` | Yes | `()` | `sync_value` | `lib/standalone-auth.js:dispatchInvitationEmail`, `lib/standalone-auth.js:dispatchSupportNotificationEmail`, `lib/standalone-auth.js:startEmailOtpChallenge`, `lib/standalone-auth.js:verifyEmailOtpChallenge$anon_L2231_15` | L282 |
| `isEmailAllowedInStagingMailbox` | `function` | Yes | `(emailNormalized: unknown)` | `sync_value` | `lib/standalone-auth.js:evaluateStagingRecipientEligibilityInTx`, `lib/standalone-auth.js:evaluateStagingRecipientEligibility`, `lib/standalone-auth.js:readProtectedStagingMailboxCode` | L290 |
| `normalizeEmail` | `function` | Yes | `(raw: unknown)` | `sync_value` | `lib/standalone-auth.js:parseConfiguredSenderAddress`, `lib/standalone-auth.js:parseAllowlistedEmails`, `lib/standalone-auth.js:dispatchInvitationEmail`, `lib/standalone-auth.js:dispatchSupportNotificationEmail` | L299 |
| `computeOtpHmac` | `function` | No | `(secret: unknown, emailNormalized: unknown, challengeId: unknown, code: unknown)` | `sync_value` | `lib/standalone-auth.js:startEmailOtpChallenge`, `lib/standalone-auth.js:verifyEmailOtpChallenge$anon_L2231_15` | L321 |
| `deriveStagingMailboxKey` | `function` | No | `()` | `sync_value` | `lib/standalone-auth.js:encryptStagingMailboxCode`, `lib/standalone-auth.js:decryptStagingMailboxCode` | L328 |
| `encryptStagingMailboxCode` | `function` | No | `(code: unknown, emailNormalized: unknown, challengeId: unknown)` | `sync_value` | `lib/standalone-auth.js:startEmailOtpChallenge$anon_L1944_11` | L342 |
| `decryptStagingMailboxCode` | `function` | No | `({ ciphertextB64, ivB64, authTagB64 }: object, emailNormalized: unknown, challengeId: unknown)` | `sync_value` | `lib/standalone-auth.js:readProtectedStagingMailboxCode$anon_L2800_20` | L356 |
| `enableAuthInternalContext` | `function` | No | `(tx: unknown)` | `async -> promise` | `lib/standalone-auth.js:consumeAuthRateLimit$anon_L618_1`, `lib/standalone-auth.js:recordAuthTelemetry$anon_L704_2`, `lib/standalone-auth.js:evaluateStagingRecipientEligibilityInTx`, `lib/standalone-auth.js:startEmailOtpChallenge$anon_L1944_11` | L365 |
| `buildSessionCookieHeader` | `function` | Yes | `(rawToken: unknown, maxAgeSeconds: unknown)` | `sync_value` | `lib/standalone-auth.js:verifyEmailOtpChallenge$anon_L2231_15`, `lib/standalone-auth.js:resolveSessionFromRequest$anon_L2507_17` | L369 |
| `buildClearedSessionCookieHeader` | `function` | Yes | `()` | `sync_value` | `lib/standalone-auth.js:submitExistingAccountAgeAssessment$anon_L2637_18`, `lib/standalone-auth.js:revokeSessionFromRequest` | L379 |
| `buildAgeGateCooldownCookieHeader` | `function` | Yes | `(maxAgeSeconds: unknown)` | `sync_value` | `lib/standalone-auth.js:startEmailOtpChallenge`, `lib/standalone-auth.js:submitExistingAccountAgeAssessment$anon_L2637_18` | L390 |
| `hasAgeGateCooldownCookie` | `function` | Yes | `(req: unknown)` | `sync_value` | `lib/standalone-auth.js:startEmailOtpChallenge`, `lib/standalone-auth.js:submitExistingAccountAgeAssessment` | L400 |
| `extractRawSessionToken` | `function` | Yes | `(req: unknown)` | `sync_value` | `lib/standalone-auth.js:verifyEmailOtpChallenge`, `lib/standalone-auth.js:resolveSessionFromRequest`, `lib/standalone-auth.js:revokeSessionFromRequest` | L407 |
| `verifySameOriginMutationRequest` | `function` | Yes | `(req: unknown, options: object)` | `sync_value (throws: thrown_value)` | `server/app.js:createStandaloneServer$anon_L546_3` | L424 |
| `consumeAuthRateLimit` | `function` | Yes | `(db: unknown, { scope, subjectKey, maxHits, windowSeconds, now }: object)` | `async -> promise` | `lib/standalone-auth.js:startEmailOtpChallenge`, `lib/standalone-auth.js:verifyEmailOtpChallenge`, `lib/standalone-auth.js:readProtectedStagingMailboxCode` | L606 |
| `createAuthCorrelationId` | `function` | Yes | `()` | `sync_value` | `lib/standalone-auth.js:dispatchInvitationEmail`, `lib/standalone-auth.js:dispatchSupportNotificationEmail`, `lib/standalone-auth.js:startEmailOtpChallenge`, `lib/standalone-auth.js:verifyEmailOtpChallenge` | L638 |
| `sanitizeDiagnosticCodeSafe` | `function` | Yes | `(raw: unknown, maxLen: number)` | `sync_value` | — | L642 |
| `sanitizeDiagnosticCode` | `function` | No | `(raw: unknown, maxLen: number)` | `sync_value` | `lib/standalone-auth.js:recordAuthTelemetry`, `lib/standalone-auth.js:sendOtpEmailHttps`, `lib/standalone-auth.js:sendSingleInvitationEmailAttempt`, `lib/standalone-auth.js:dispatchInvitationEmail` | L646 |
| `sanitizeProviderMessageId` | `function` | No | `(raw: unknown)` | `sync_value` | `lib/standalone-auth.js:recordAuthTelemetry`, `lib/standalone-auth.js:sendOtpEmailHttps`, `lib/standalone-auth.js:sendSingleInvitationEmailAttempt` | L652 |
| `recordAuthTelemetry` | `function` | No | `(db: unknown, { correlationId, flow, deliveryMode, outcomeStage, httpStatus, providerStatus, providerMessageId, errorCode, isDesignatedTest, now, logger }: object)` | `async -> promise` | `lib/standalone-auth.js:dispatchInvitationEmail`, `lib/standalone-auth.js:dispatchSupportNotificationEmail`, `lib/standalone-auth.js:startEmailOtpChallenge`, `lib/standalone-auth.js:verifyEmailOtpChallenge` | L658 |
| `buildVerificationEmailPlainText` | `function` | Yes | `({ code, ttlMinutes }: object)` | `sync_value` | `lib/standalone-auth.js:sendOtpEmailHttps` | L762 |
| `sendOtpEmailHttps` | `function` | No | `(deliveryCfg: unknown, { email, code, ttlMinutes }: object)` | `async -> promise (throws: thrown_value)` | `lib/standalone-auth.js:startEmailOtpChallenge` | L772 |
| `resolveTrustedInvitationOrigin` | `function` | Yes | `()` | `sync_value (throws: thrown_value)` | `lib/standalone-auth.js:dispatchInvitationEmail`, `lib/standalone-auth.js:dispatchSupportNotificationEmail` | L878 |
| `evaluateStagingRecipientEligibilityInTx` | `function` | Yes | `(tx: unknown, emailNormalized: unknown, now: Date)` | `async -> promise (throws: thrown_value)` | `lib/standalone-auth.js:evaluateStagingRecipientEligibility$anon_L1033_6`, `lib/standalone-auth.js:startEmailOtpChallenge$anon_L1944_11`, `lib/standalone-auth.js:verifyEmailOtpChallenge$anon_L2231_15` | L948 |
| `evaluateStagingRecipientEligibility` | `function` | Yes | `(db: unknown, emailNormalized: unknown, { now }: object)` | `async -> promise` | `lib/standalone-auth.js:dispatchInvitationEmail`, `lib/standalone-auth.js:dispatchSupportNotificationEmail`, `lib/standalone-auth.js:startEmailOtpChallenge` | L1016 |
| `formatExpirationForInvitationEmail` | `function` | No | `(expiresAtIso: unknown)` | `sync_value` | `lib/standalone-auth.js:buildInvitationEmailPlainText` | L1039 |
| `buildInvitationEmailPlainText` | `function` | Yes | `({ recipientEmail, roleKey, roleLabel, vendorName, vendorId, acceptUrl, expiresAtIso, isStaging }: object)` | `sync_value` | `lib/standalone-auth.js:dispatchInvitationEmail` | L1059 |
| `sendSingleInvitationEmailAttempt` | `function` | No | `(deliveryCfg: unknown, { email, subject, text, idempotencyKey, attempt }: object)` | `async -> promise (throws: thrown_value)` | `lib/standalone-auth.js:dispatchInvitationEmail`, `lib/standalone-auth.js:dispatchSupportNotificationEmail` | L1110 |
| `dispatchInvitationEmail` | `function` | Yes | `(db: unknown, { invitationId, tokenVersion, rawToken, recipientEmail, roleKey, roleLabel, vendorId, vendorName, expiresAtIso, flow, correlationId, now }: object)` | `async -> promise` | `server/admin-routes.js:deliverAndFinalizeIssuedInvitation` | L1222 |
| `buildSupportEmailPlainText` | `function` | No | `({ ticketNumber, eventKind, statusLabel, isCritical, viewUrl, isStaging }: object)` | `sync_value` | `lib/standalone-auth.js:dispatchSupportNotificationEmail` | L1443 |
| `dispatchSupportNotificationEmail` | `function` | Yes | `(db: unknown, { notificationId, recipientEmail, ticketNumber, eventKind, statusLabel, isCritical, correlationId, now, logger }: object)` | `async -> promise` | `server/admin-routes.js:recordAndDispatchSupportNotification` | L1470 |
| `startEmailOtpChallenge` | `function` | Yes | `(db: unknown, req: unknown, { email, intent, dob, dob_year, dob_month, dob_day, now, logger }: object)` | `async -> promise` | `server/app.js:createStandaloneServer$anon_L546_3` | L1660 |
| `verifyEmailOtpChallenge` | `function` | Yes | `(db: unknown, req: unknown, { email, code, now, logger }: object)` | `async -> promise` | `server/app.js:createStandaloneServer$anon_L546_3` | L2139 |
| `resolveSessionFromRequest` | `function` | Yes | `(db: unknown, req: unknown, { now }: object)` | `async -> promise` | `lib/standalone-auth.js:submitExistingAccountAgeAssessment`, `server/app.js:getUser`, `server/app.js:createStandaloneServer$anon_L546_3` | L2490 |
| `submitExistingAccountAgeAssessment` | `function` | Yes | `(db: unknown, req: unknown, { dob, dob_year, dob_month, dob_day, now }: object)` | `async -> promise` | `server/app.js:createStandaloneServer$anon_L546_3` | L2592 |
| `revokeSessionFromRequest` | `function` | Yes | `(db: unknown, req: unknown, { now }: object)` | `async -> promise` | `server/app.js:createStandaloneServer$anon_L546_3` | L2728 |
| `readProtectedStagingMailboxCode` | `function` | Yes | `(db: unknown, req: unknown, { email, now }: object)` | `async -> promise (throws: thrown_value)` | `server/app.js:createStandaloneServer$anon_L546_3` | L2754 |
| `cleanupExpiredAuthRecords` | `function` | Yes | `(db: unknown, { now }: object)` | `async -> promise (throws: thrown_value)` | `api/pager/worker.js:default`, `scripts/run-pager-worker.cjs:<top_level>$anon_L89_5` | L2844 |
| `resolveTxtSafe` | `function` | No | `(resolver: unknown, host: unknown, timeoutMs: number)` | `async -> promise` | `lib/standalone-auth.js:inspectSenderDomainDns` | L2907 |
| `resolveMxSafe` | `function` | No | `(resolver: unknown, host: unknown, timeoutMs: number)` | `async -> promise` | `lib/standalone-auth.js:inspectSenderDomainDns` | L2938 |
| `inspectSenderDomainDns` | `function` | Yes | `(domain: unknown, resolverOverride: null_or_object)` | `async -> promise` | `lib/standalone-auth.js:inspectAdminEmailReadiness` | L2969 |
| `inspectAdminEmailReadiness` | `function` | Yes | `(db: unknown, { dnsResolver }: object)` | `async -> promise` | `server/admin-routes.js:handleGovernanceApiRequest` | L3045 |

### [lib/support-tickets.js](../../../lib/support-tickets.js) (`module`)
- **Imports / Dependencies**: `./admin-governance.js`, `./diagnostics.js`
- **Exports**: `VENDOR_SUPPORT_CATEGORIES`, `CATEGORY_LABELS`, `VALID_DB_CATEGORIES`, `CATEGORY_ALIASES`, `REPORTER_URGENCY_LABELS`, `VALID_REPORTER_URGENCIES`, `STAFF_PRIORITY_LABELS`, `VALID_STAFF_PRIORITIES`, `SUPPORT_STATUS_LABELS`, `VALID_SUPPORT_STATUSES`, `normalizeSupportStatusInput`, `normalizeSupportCategoryInput`, `resolveInitialUrgencyAndPriority`, `buildAutoSubjectFromDescription`, `sanitizeCoarseDeviceContext`, `sanitizeSupportContextFields`, `formatPublicTeamAuthorLabel`, `validateStaffStatusTransition`, `evaluateAssignmentMutation`, `serializeSupportTicketForReporter`, `autoSuggestDiagnosticLinksInTx`
- **Significant Constants**: `VENDOR_SUPPORT_CATEGORIES` *(exported)*, `CATEGORY_LABELS` *(exported)*, `VALID_DB_CATEGORIES` *(exported)*, `CATEGORY_ALIASES` *(exported)*, `REPORTER_URGENCY_LABELS` *(exported)*, `VALID_REPORTER_URGENCIES` *(exported)*, `STAFF_PRIORITY_LABELS` *(exported)*, `VALID_STAFF_PRIORITIES` *(exported)*, `SUPPORT_STATUS_LABELS` *(exported)*, `VALID_SUPPORT_STATUSES` *(exported)*, `COARSE_PLATFORMS`, `COARSE_BROWSERS`, `COARSE_VIEWPORTS`

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `normalizeSupportStatusInput` | `function` | Yes | `(raw: unknown)` | `sync_value` | `server/admin-routes.js:handleGovernanceApiRequest` | L92 |
| `normalizeSupportCategoryInput` | `function` | Yes | `(rawCat: unknown, entryKind: string, affectedFeature: null_or_object)` | `sync_value` | `server/admin-routes.js:handleGovernanceApiRequest`, `server/admin-routes.js:handleGovernanceApiRequest$anon_L5521_70` | L101 |
| `resolveInitialUrgencyAndPriority` | `function` | Yes | `({ rawUrgency, rawSeverity, entryKind, category }: object)` | `sync_value` | `server/admin-routes.js:handleGovernanceApiRequest` | L117 |
| `buildAutoSubjectFromDescription` | `function` | Yes | `(entryKind: unknown, category: unknown, description: unknown)` | `sync_value` | `server/admin-routes.js:handleGovernanceApiRequest` | L147 |
| `sanitizeCoarseDeviceContext` | `function` | Yes | `(rawInput: unknown)` | `sync_value` | `lib/support-tickets.js:sanitizeSupportContextFields` | L168 |
| `sanitizeSupportContextFields` | `function` | Yes | `(body: object, serverReleaseSha: string)` | `sync_value` | `server/admin-routes.js:handleGovernanceApiRequest` | L177 |
| `formatPublicTeamAuthorLabel` | `function` | Yes | `(role: unknown, reporterContext: string)` | `sync_value` | `lib/support-tickets.js:serializeSupportTicketForReporter$anon_L337_1`, `server/admin-routes.js:handleGovernanceApiRequest$anon_L5965_76`, `server/admin-routes.js:handleGovernanceApiRequest$anon_L6367_77`, `server/admin-routes.js:handleGovernanceApiRequest$anon_L8004_99` | L221 |
| `validateStaffStatusTransition` | `function` | Yes | `(fromStatus: unknown, toStatus: unknown, actorRole: unknown)` | `sync_value` | `server/admin-routes.js:handleGovernanceApiRequest$anon_L5965_76` | L230 |
| `evaluateAssignmentMutation` | `function` | Yes | `({ curIssue, currentAssigneeRole, currentAssigneeInactive, nextAssigneeProvided, nextAssigneeId, targetAssigneeRecord, actorUserId, actorRole, nextStatus, escalateToTop, reasonText }: object)` | `sync_value` | `server/admin-routes.js:handleGovernanceApiRequest$anon_L5965_76` | L246 |
| `serializeSupportTicketForReporter` | `function` | Yes | `(row: unknown, { notes, events, publicDiagnostics, viewerUserId }: object)` | `sync_value` | `server/admin-routes.js:handleGovernanceApiRequest$anon_L2131_25$anon_L2245_29`, `server/admin-routes.js:handleGovernanceApiRequest$anon_L2329_32`, `server/admin-routes.js:handleGovernanceApiRequest`, `server/admin-routes.js:handleGovernanceApiRequest$anon_L2744_35` | L324 |
| `autoSuggestDiagnosticLinksInTx` | `function` | Yes | `(tx: unknown, { issueId, errorCorrelationId }: object)` | `async -> promise` | `server/admin-routes.js:handleGovernanceApiRequest$anon_L2329_32` | L417 |

### [lib/webpush-crypto.js](../../../lib/webpush-crypto.js) (`module`)
- **Imports / Dependencies**: `node:crypto`
- **Exports**: `toBase64Url`, `fromBase64Url`, `generateVapidKeys`, `validateVapidKeyPair`, `createVapidHeaders`, `verifyVapidJwt`, `validateSubscriberKeys`, `encryptWebPushPayload`, `decryptWebPushPayload`
- **Significant Constants**: `RECORD_SIZE`, `MAX_PLAINTEXT_BYTES`

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `toBase64Url` | `function` | Yes | `(buf: unknown)` | `sync_value` | `api/pager/subscriptions.js:default`, `lib/webpush-crypto.js:generateVapidKeys`, `lib/webpush-crypto.js:validateVapidKeyPair`, `lib/webpush-crypto.js:createVapidHeaders` | L10 |
| `fromBase64Url` | `function` | Yes | `(str: unknown)` | `sync_value (throws: Error)` | `lib/webpush-crypto.js:generateVapidKeys`, `lib/webpush-crypto.js:validateVapidKeyPair`, `lib/webpush-crypto.js:createVapidHeaders`, `lib/webpush-crypto.js:verifyVapidJwt` | L18 |
| `generateVapidKeys` | `function` | Yes | `()` | `sync_value` | `lib/pager-notifications.js:<top_level>`, `scripts/staging-runtime-probe.js:runWebPushCryptoSelfTest` | L27 |
| `validateVapidKeyPair` | `function` | Yes | `(publicKeyB64Url: unknown, privateKeyB64Url: unknown)` | `sync_value (throws: Error)` | `lib/pager-notifications.js:getPushProviderConfig`, `lib/webpush-crypto.js:createVapidHeaders` | L42 |
| `createVapidHeaders` | `function` | Yes | `({ endpointUrl, subject, publicKey, privateKey, nowSec, ttlSec }: object)` | `sync_value (throws: Error)` | `lib/pager-notifications.js:dispatchToProvider`, `scripts/staging-runtime-probe.js:runWebPushCryptoSelfTest` | L65 |
| `verifyVapidJwt` | `function` | Yes | `(jwt: unknown, publicKeyB64Url: unknown)` | `sync_value` | `scripts/staging-runtime-probe.js:runWebPushCryptoSelfTest` | L108 |
| `validateSubscriberKeys` | `function` | Yes | `(p256dhB64Url: unknown, authB64Url: unknown)` | `sync_value` | `lib/pager-notifications.js:validateSubscriptionPayload`, `lib/webpush-crypto.js:encryptWebPushPayload` | L130 |
| `encryptWebPushPayload` | `function` | Yes | `(plaintext: unknown, p256dhB64Url: unknown, authB64Url: unknown, saltOverride: null_or_object)` | `sync_value (throws: Error)` | `lib/pager-notifications.js:dispatchToProvider`, `scripts/staging-runtime-probe.js:runWebPushCryptoSelfTest` | L165 |
| `decryptWebPushPayload` | `function` | Yes | `(bodyBuffer: unknown, uaEcdh: unknown, authSecretBuf: unknown)` | `sync_value (throws: Error)` | `scripts/staging-runtime-probe.js:runWebPushCryptoSelfTest` | L211 |

## 3. Domain API Handlers (`api/`)

### [api/bookings/create.js](../../../api/bookings/create.js) (`module`)
- **Imports / Dependencies**: `../../lib/authz.js`, `../../lib/catalog.js`, `../../lib/dates.js`, `../../lib/db-tx.js`, `@biteshark/runtime-adapter`, `node:crypto`
- **Exports**: `access`, `methods`, `formatBookingResponse`, `default`
- **Significant Constants**: `access` *(exported)*, `methods` *(exported)*, `IDEMPOTENCY_KEY_RE`

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `parseStrictGuestCount` | `function` | No | `(raw: unknown)` | `sync_value` | `api/bookings/create.js:default` | L18 |
| `extractIdempotencyKey` | `function` | No | `(req: unknown, body: unknown)` | `sync_value` | `api/bookings/create.js:default` | L29 |
| `computeBookingHash` | `function` | No | `(payload: unknown)` | `sync_value` | `api/bookings/create.js:default` | L47 |
| `formatBookingResponse` | `function` | Yes | `(row: unknown, replay: boolean)` | `sync_value` | `api/bookings/create.js:default$anon_L147_1` | L54 |
| `default` | `function` | Yes | `(req: unknown, res: unknown)` | `async -> promise` | `server/app.js:createStandaloneServer$anon_L546_3$anon_L872_4$anon_L873_5` | L73 |

### [api/bookings/list.js](../../../api/bookings/list.js) (`module`)
- **Imports / Dependencies**: `../../lib/authz.js`, `../../lib/dates.js`, `@biteshark/runtime-adapter`
- **Exports**: `access`, `methods`, `default`
- **Significant Constants**: `access` *(exported)*, `methods` *(exported)*

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `default` | `function` | Yes | `(req: unknown, res: unknown)` | `async -> promise` | `server/app.js:createStandaloneServer$anon_L546_3$anon_L872_4$anon_L873_5` | L8 |

### [api/catalog/cities.js](../../../api/catalog/cities.js) (`module`)
- **Exports**: `access`, `methods`, `default`
- **Significant Constants**: `access` *(exported)*, `methods` *(exported)*

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `default` | `function` | Yes | `(req: unknown, res: unknown)` | `async -> promise` | `server/app.js:createStandaloneServer$anon_L546_3$anon_L872_4$anon_L873_5` | L1 |

### [api/catalog/cuisines.js](../../../api/catalog/cuisines.js) (`module`)
- **Exports**: `access`, `methods`, `default`
- **Significant Constants**: `access` *(exported)*, `methods` *(exported)*

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `default` | `function` | Yes | `(req: unknown, res: unknown)` | `async -> promise` | `server/app.js:createStandaloneServer$anon_L546_3$anon_L872_4$anon_L873_5` | L4 |

### [api/catalog/featured.js](../../../api/catalog/featured.js) (`module`)
- **Imports / Dependencies**: `../../lib/discovery.js`, `@biteshark/runtime-adapter`
- **Exports**: `access`, `methods`, `default`
- **Significant Constants**: `access` *(exported)*, `methods` *(exported)*

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `default` | `function` | Yes | `(req: unknown, res: unknown)` | `async -> promise` | `server/app.js:createStandaloneServer$anon_L546_3$anon_L872_4$anon_L873_5` | L7 |

### [api/community/list.js](../../../api/community/list.js) (`module`)
- **Imports / Dependencies**: `@biteshark/runtime-adapter`
- **Exports**: `access`, `methods`, `default`
- **Significant Constants**: `access` *(exported)*, `methods` *(exported)*

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `default` | `function` | Yes | `(req: unknown, res: unknown)` | `async -> promise` | `server/app.js:createStandaloneServer$anon_L546_3$anon_L872_4$anon_L873_5` | L6 |

### [api/community/mine.js](../../../api/community/mine.js) (`module`)
- **Imports / Dependencies**: `../../lib/authz.js`, `../../lib/db-tx.js`, `@biteshark/runtime-adapter`
- **Exports**: `access`, `methods`, `default`
- **Significant Constants**: `access` *(exported)*, `methods` *(exported)*

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `default` | `function` | Yes | `(req: unknown, res: unknown)` | `async -> promise` | `server/app.js:createStandaloneServer$anon_L546_3$anon_L872_4$anon_L873_5` | L8 |

### [api/community/moderate.js](../../../api/community/moderate.js) (`module`)
- **Imports / Dependencies**: `../../lib/authz.js`, `../../lib/db-tx.js`, `@biteshark/runtime-adapter`
- **Exports**: `access`, `methods`, `default`
- **Significant Constants**: `access` *(exported)*, `methods` *(exported)*

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `default` | `function` | Yes | `(req: unknown, res: unknown)` | `async -> promise` | `server/app.js:createStandaloneServer$anon_L546_3$anon_L872_4$anon_L873_5` | L15 |

### [api/community/post.js](../../../api/community/post.js) (`module`)
- **Imports / Dependencies**: `../../lib/authz.js`, `../../lib/db-tx.js`, `@biteshark/runtime-adapter`
- **Exports**: `access`, `methods`, `default`
- **Significant Constants**: `access` *(exported)*, `methods` *(exported)*, `ALLOWED_KINDS`

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `default` | `function` | Yes | `(req: unknown, res: unknown)` | `async -> promise` | `server/app.js:createStandaloneServer$anon_L546_3$anon_L872_4$anon_L873_5` | L10 |

### [api/favorites/list.js](../../../api/favorites/list.js) (`module`)
- **Imports / Dependencies**: `../../lib/authz.js`, `@biteshark/runtime-adapter`
- **Exports**: `access`, `methods`, `default`
- **Significant Constants**: `access` *(exported)*, `methods` *(exported)*

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `default` | `function` | Yes | `(req: unknown, res: unknown)` | `async -> promise` | `server/app.js:createStandaloneServer$anon_L546_3$anon_L872_4$anon_L873_5` | L7 |

### [api/favorites/toggle.js](../../../api/favorites/toggle.js) (`module`)
- **Imports / Dependencies**: `../../lib/authz.js`, `../../lib/db-tx.js`, `@biteshark/runtime-adapter`
- **Exports**: `access`, `methods`, `default`
- **Significant Constants**: `access` *(exported)*, `methods` *(exported)*

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `default` | `function` | Yes | `(req: unknown, res: unknown)` | `async -> promise` | `server/app.js:createStandaloneServer$anon_L546_3$anon_L872_4$anon_L873_5` | L8 |

### [api/notifications/settings.js](../../../api/notifications/settings.js) (`module`)
- **Imports / Dependencies**: `../../lib/authz.js`, `../../lib/db-tx.js`, `@biteshark/runtime-adapter`
- **Exports**: `access`, `methods`, `default`
- **Significant Constants**: `access` *(exported)*, `methods` *(exported)*

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `default` | `function` | Yes | `(req: unknown, res: unknown)` | `async -> promise` | `server/app.js:createStandaloneServer$anon_L546_3$anon_L872_4$anon_L873_5` | L8 |

### [api/owner/bookings.js](../../../api/owner/bookings.js) (`module`)
- **Imports / Dependencies**: `../../lib/authz.js`, `../../lib/dates.js`, `@biteshark/runtime-adapter`
- **Exports**: `access`, `methods`, `default`
- **Significant Constants**: `access` *(exported)*, `methods` *(exported)*, `ALLOWED_STATUSES`

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `default` | `function` | Yes | `(req: unknown, res: unknown)` | `async -> promise` | `server/app.js:createStandaloneServer$anon_L546_3$anon_L872_4$anon_L873_5` | L10 |

### [api/owner/location.js](../../../api/owner/location.js) (`module`)
- **Imports / Dependencies**: `../../lib/authz.js`, `../../lib/dates.js`, `../../lib/db-tx.js`, `../../lib/discovery.js`, `@biteshark/runtime-adapter`
- **Exports**: `access`, `methods`, `default`
- **Significant Constants**: `access` *(exported)*, `methods` *(exported)*, `DEFAULT_LOCATION_TTL_MINUTES`, `MIN_LOCATION_TTL_MINUTES`, `MAX_LOCATION_TTL_MINUTES`

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `resolveLocationExpiry` | `function` | No | `(body: unknown, now: Date)` | `sync_value` | `api/owner/location.js:default` | L21 |
| `default` | `function` | Yes | `(req: unknown, res: unknown)` | `async -> promise` | `server/app.js:createStandaloneServer$anon_L546_3$anon_L872_4$anon_L873_5` | L57 |

### [api/owner/profile.js](../../../api/owner/profile.js) (`module`)
- **Imports / Dependencies**: `../../lib/authz.js`, `../../lib/db-tx.js`, `../../lib/discovery.js`, `@biteshark/runtime-adapter`
- **Exports**: `access`, `methods`, `default`
- **Significant Constants**: `access` *(exported)*, `methods` *(exported)*

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `default` | `function` | Yes | `(req: unknown, res: unknown)` | `async -> promise` | `server/app.js:createStandaloneServer$anon_L546_3$anon_L872_4$anon_L873_5` | L16 |

### [api/owner/requests.js](../../../api/owner/requests.js) (`module`)
- **Imports / Dependencies**: `../../lib/authz.js`, `../../lib/dates.js`, `../../lib/db-tx.js`, `@biteshark/runtime-adapter`
- **Exports**: `access`, `methods`, `default`
- **Significant Constants**: `access` *(exported)*, `methods` *(exported)*

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `default` | `function` | Yes | `(req: unknown, res: unknown)` | `async -> promise` | `server/app.js:createStandaloneServer$anon_L546_3$anon_L872_4$anon_L873_5` | L17 |

### [api/owner/schedule.js](../../../api/owner/schedule.js) (`module`)
- **Imports / Dependencies**: `../../lib/authz.js`, `../../lib/dates.js`, `../../lib/db-tx.js`, `../../lib/discovery.js`, `@biteshark/runtime-adapter`
- **Exports**: `access`, `methods`, `default`
- **Significant Constants**: `access` *(exported)*, `methods` *(exported)*

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `default` | `function` | Yes | `(req: unknown, res: unknown)` | `async -> promise` | `server/app.js:createStandaloneServer$anon_L546_3$anon_L872_4$anon_L873_5` | L18 |

### [api/owner/stats.js](../../../api/owner/stats.js) (`module`)
- **Imports / Dependencies**: `../../lib/authz.js`, `@biteshark/runtime-adapter`
- **Exports**: `access`, `methods`, `default`
- **Significant Constants**: `access` *(exported)*, `methods` *(exported)*

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `default` | `function` | Yes | `(req: unknown, res: unknown)` | `async -> promise` | `server/app.js:createStandaloneServer$anon_L546_3$anon_L872_4$anon_L873_5` | L7 |

### [api/pager/staff.js](../../../api/pager/staff.js) (`module`)
- **Imports / Dependencies**: `../../lib/authz.js`, `../../lib/db-tx.js`, `@biteshark/runtime-adapter`
- **Exports**: `access`, `methods`, `default`
- **Significant Constants**: `access` *(exported)*, `methods` *(exported)*

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `default` | `function` | Yes | `(req: unknown, res: unknown)` | `async -> promise` | `server/app.js:createStandaloneServer$anon_L546_3$anon_L872_4$anon_L873_5` | L19 |

### [api/pager/status.js](../../../api/pager/status.js) (`module`)
- **Imports / Dependencies**: `../../lib/authz.js`, `../../lib/feature-controls.js`, `../../lib/pager-notifications.js`, `@biteshark/runtime-adapter`
- **Exports**: `access`, `methods`, `default`
- **Significant Constants**: `access` *(exported)*, `methods` *(exported)*

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `default` | `function` | Yes | `(req: unknown, res: unknown)` | `async -> promise` | `server/app.js:createStandaloneServer$anon_L546_3$anon_L872_4$anon_L873_5` | L14 |

### [api/pager/subscriptions.js](../../../api/pager/subscriptions.js) (`module`)
- **Imports / Dependencies**: `../../lib/authz.js`, `../../lib/db-tx.js`, `../../lib/feature-controls.js`, `../../lib/pager-notifications.js`, `@biteshark/runtime-adapter`, `node:crypto`
- **Exports**: `access`, `methods`, `default`
- **Significant Constants**: `access` *(exported)*, `methods` *(exported)*

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `timingSafeHexEqual` | `function` | No | `(hexA: unknown, hexB: unknown)` | `sync_value` | `api/pager/subscriptions.js:default$anon_L58_1`, `api/pager/subscriptions.js:default$anon_L120_2` | L26 |
| `default` | `function` | Yes | `(req: unknown, res: unknown)` | `async -> promise` | `server/app.js:createStandaloneServer$anon_L546_3$anon_L872_4$anon_L873_5` | L33 |

### [api/pager/telemetry.js](../../../api/pager/telemetry.js) (`module`)
- **Imports / Dependencies**: `../../lib/authz.js`, `../../lib/db-tx.js`, `../../lib/env-compat.js`, `../../lib/pager-notifications.js`, `@biteshark/runtime-adapter`
- **Exports**: `access`, `methods`, `default`
- **Significant Constants**: `access` *(exported)*, `methods` *(exported)*

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `default` | `function` | Yes | `(req: unknown, res: unknown)` | `async -> promise` | `server/app.js:createStandaloneServer$anon_L546_3$anon_L872_4$anon_L873_5` | L17 |

### [api/pager/update.js](../../../api/pager/update.js) (`module`)
- **Imports / Dependencies**: `../../lib/authz.js`, `../../lib/db-tx.js`, `../../lib/pager-notifications.js`, `@biteshark/runtime-adapter`
- **Exports**: `access`, `methods`, `default`
- **Significant Constants**: `access` *(exported)*, `methods` *(exported)*, `ALLOWED_PAGER_STATUSES`

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `default` | `function` | Yes | `(req: unknown, res: unknown)` | `async -> promise` | `server/app.js:createStandaloneServer$anon_L546_3$anon_L872_4$anon_L873_5` | L19 |

### [api/pager/worker.js](../../../api/pager/worker.js) (`module`)
- **Imports / Dependencies**: `../../lib/authz.js`, `../../lib/customer-exploration.js`, `../../lib/diagnostics.js`, `../../lib/env-compat.js`, `../../lib/pager-notifications.js`, `../../lib/standalone-auth.js`, `@biteshark/runtime-adapter`, `node:crypto`
- **Exports**: `access`, `methods`, `default`
- **Significant Constants**: `access` *(exported)*, `methods` *(exported)*

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `extractWorkerToken` | `function` | No | `(req: unknown)` | `sync_value` | `api/pager/worker.js:default` | L23 |
| `timingSafeSecretEqual` | `function` | No | `(expected: unknown, supplied: unknown)` | `sync_value` | `api/pager/worker.js:default` | L32 |
| `default` | `function` | Yes | `(req: unknown, res: unknown)` | `async -> promise (throws: thrown_value)` | `server/app.js:createStandaloneServer$anon_L546_3$anon_L872_4$anon_L873_5` | L38 |

### [api/schedule/today.js](../../../api/schedule/today.js) (`module`)
- **Imports / Dependencies**: `../../lib/dates.js`, `../../lib/discovery.js`, `@biteshark/runtime-adapter`, `node:crypto`
- **Exports**: `access`, `methods`, `default`
- **Significant Constants**: `access` *(exported)*, `methods` *(exported)*

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `default` | `function` | Yes | `(req: unknown, res: unknown)` | `async -> promise (throws: thrown_value)` | `server/app.js:createStandaloneServer$anon_L546_3$anon_L872_4$anon_L873_5` | L9 |

### [api/trucks.js](../../../api/trucks.js) (`module`)
- **Imports / Dependencies**: `../lib/discovery.js`, `@biteshark/runtime-adapter`
- **Exports**: `access`, `methods`, `default`
- **Significant Constants**: `access` *(exported)*, `methods` *(exported)*

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `default` | `function` | Yes | `(req: unknown, res: unknown)` | `async -> promise` | `server/app.js:createStandaloneServer$anon_L546_3$anon_L872_4$anon_L873_5` | L13 |

### [api/trucks/[id].js](../../../api/trucks/[id].js) (`module`)
- **Imports / Dependencies**: `../../lib/discovery.js`, `@biteshark/runtime-adapter`
- **Exports**: `access`, `methods`, `default`
- **Significant Constants**: `access` *(exported)*, `methods` *(exported)*

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `default` | `function` | Yes | `(req: unknown, res: unknown)` | `async -> promise` | `server/app.js:createStandaloneServer$anon_L546_3$anon_L872_4$anon_L873_5` | L11 |

### [api/trucks/availability.js](../../../api/trucks/availability.js) (`module`)
- **Imports / Dependencies**: `../../lib/authz.js`, `../../lib/dates.js`, `../../lib/discovery.js`, `@biteshark/runtime-adapter`
- **Exports**: `access`, `methods`, `default`
- **Significant Constants**: `access` *(exported)*, `methods` *(exported)*

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `default` | `function` | Yes | `(req: unknown, res: unknown)` | `async -> promise (throws: thrown_value)` | `server/app.js:createStandaloneServer$anon_L546_3$anon_L872_4$anon_L873_5` | L9 |

### [api/trucks/nearby.js](../../../api/trucks/nearby.js) (`module`)
- **Imports / Dependencies**: `../../lib/authz.js`, `../../lib/discovery.js`
- **Exports**: `access`, `methods`, `default`
- **Significant Constants**: `access` *(exported)*, `methods` *(exported)*, `hubs`

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `miles` | `function` | No | `(a: unknown, b: unknown, c: unknown, d: unknown)` | `sync_value` | `api/trucks/nearby.js:default$anon_L35_1` | L15 |
| `default` | `function` | Yes | `(req: unknown, res: unknown)` | `async -> promise` | `server/app.js:createStandaloneServer$anon_L546_3$anon_L872_4$anon_L873_5` | L23 |

### [api/trucks/search.js](../../../api/trucks/search.js) (`module`)
- **Imports / Dependencies**: `../../lib/discovery.js`, `@biteshark/runtime-adapter`
- **Exports**: `access`, `methods`, `default`
- **Significant Constants**: `access` *(exported)*, `methods` *(exported)*

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `default` | `function` | Yes | `(req: unknown, res: unknown)` | `async -> promise` | `server/app.js:createStandaloneServer$anon_L546_3$anon_L872_4$anon_L873_5` | L12 |

## 4. Browser Frontend Scripts (`public/`)

### [public/admin.js](../../../public/admin.js) (`script`)
- **Explicit Window / Reassigned Globals**: `location.href` (explicit_window_property @ L193), `location.href` (explicit_window_property @ L198), `location.href` (explicit_window_property @ L226), `location.href` (explicit_window_property @ L231), `location.href` (explicit_window_property @ L329), `location.href` (explicit_window_property @ L344), `location.href` (explicit_window_property @ L4883), `location.href` (explicit_window_property @ L4959), `location.href` (explicit_window_property @ L4981), `location.href` (explicit_window_property @ L4994), `location.hash` (explicit_window_property @ L5048)

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `<top_level>$anon_L8_1` | `anonymous_function` | No | `()` | `void_or_implicit` | — | L8 |

### [public/app.js](../../../public/app.js) (`script`)
- **Explicit Window / Reassigned Globals**: `activeKind` (browser_global_reassignment @ L51), `activeCuisine` (browser_global_reassignment @ L52), `activeCuisine` (browser_global_reassignment @ L75), `activeKind` (browser_global_reassignment @ L76), `trucks` (browser_global_reassignment @ L420), `catalogVersion` (browser_global_reassignment @ L421), `selectedTruck` (browser_global_reassignment @ L436), `activeTileLayer` (browser_global_reassignment @ L534), `activeMapTileTemplate` (browser_global_reassignment @ L535), `userMarker` (browser_global_reassignment @ L753), `activeTileLayer` (browser_global_reassignment @ L843), `activeMapTileTemplate` (browser_global_reassignment @ L844), `mapLifecycleBound` (browser_global_reassignment @ L850), `map` (browser_global_reassignment @ L903), `map` (browser_global_reassignment @ L916), `map` (browser_global_reassignment @ L927), `bitesharkSyncInteractiveMapControl` (explicit_window_property @ L950), `trucks` (browser_global_reassignment @ L988), `catalogVersion` (browser_global_reassignment @ L991), `selectedTruck` (browser_global_reassignment @ L993), `handleListingImageError` (explicit_window_property @ L1183), `markers` (browser_global_reassignment @ L1317), `activeCuisine` (browser_global_reassignment @ L1368), `activeKind` (browser_global_reassignment @ L1369), `openOnly` (browser_global_reassignment @ L1370), `maxDistance` (browser_global_reassignment @ L1371), `manualAreaTown` (browser_global_reassignment @ L1372), `selectedTruck` (browser_global_reassignment @ L1510), `selectedTruck` (browser_global_reassignment @ L1532), `currentUser` (browser_global_reassignment @ L1608), `currentUser` (browser_global_reassignment @ L1612), `isSignedIn` (browser_global_reassignment @ L1626), `accountSyncState` (browser_global_reassignment @ L1627), `accountSyncState` (browser_global_reassignment @ L1653), `isSignedIn` (browser_global_reassignment @ L1686), `accountSyncState` (browser_global_reassignment @ L1687), `isSignedIn` (browser_global_reassignment @ L1697), `accountSyncState` (browser_global_reassignment @ L1698), `isSignedIn` (browser_global_reassignment @ L1715), `currentUser` (browser_global_reassignment @ L1716), `accountSyncState` (browser_global_reassignment @ L1717), `notifySyncState` (browser_global_reassignment @ L1718), `bookings` (browser_global_reassignment @ L1719), `appAuthEpoch` (browser_global_reassignment @ L1778), `isSignedIn` (browser_global_reassignment @ L1781), `currentUser` (browser_global_reassignment @ L1782), `accountSyncState` (browser_global_reassignment @ L1783), `notifySyncState` (browser_global_reassignment @ L1784), `bookings` (browser_global_reassignment @ L1785), `bookingsLoadState` (browser_global_reassignment @ L1786), `bookingsLoadCorr` (browser_global_reassignment @ L1787), `notifyPrefs` (browser_global_reassignment @ L1790), `isOwnerAdmin` (browser_global_reassignment @ L1792), `ownerAccess` (browser_global_reassignment @ L1793), `ownerTruckId` (browser_global_reassignment @ L1794), `ownerProfile` (browser_global_reassignment @ L1795), `ownerSchedule` (browser_global_reassignment @ L1802), `ownerLastKnownLocationHours` (browser_global_reassignment @ L1803), `bitesharkApplyAppSignOutCleanup` (explicit_window_property @ L1856), `accountSyncState` (browser_global_reassignment @ L1936), `accountSyncState` (browser_global_reassignment @ L1945), `isSignedIn` (browser_global_reassignment @ L1947), `accountSyncState` (browser_global_reassignment @ L1948), `accountSyncState` (browser_global_reassignment @ L2008), `notifyPrefs` (browser_global_reassignment @ L2071), `notifySyncState` (browser_global_reassignment @ L2075), `notifySyncState` (browser_global_reassignment @ L2078), `notifyPrefs` (browser_global_reassignment @ L2094), `notifySyncState` (browser_global_reassignment @ L2101), `notifySyncState` (browser_global_reassignment @ L2113), `notifyPrefs` (browser_global_reassignment @ L2128), `notifySyncState` (browser_global_reassignment @ L2133), `isSignedIn` (browser_global_reassignment @ L2145), `accountSyncState` (browser_global_reassignment @ L2146), `notifySyncState` (browser_global_reassignment @ L2147), `notifySyncState` (browser_global_reassignment @ L2161), `openOnly` (browser_global_reassignment @ L2176), `maxDistance` (browser_global_reassignment @ L2197), `manualAreaTown` (browser_global_reassignment @ L2218), `manualAreaOverridden` (browser_global_reassignment @ L2219), `userCoords` (browser_global_reassignment @ L2220), `userMarker` (browser_global_reassignment @ L2223), `bitesharkHasManualOrPreciseLocation` (explicit_window_property @ L2259), `bitesharkSelectManualArea` (explicit_window_property @ L2260), `bitesharkOpenAreaPicker` (explicit_window_property @ L2261), `mode` (browser_global_reassignment @ L2267), `manualAreaOverridden` (browser_global_reassignment @ L2401), `userCoords` (browser_global_reassignment @ L2413), `manualAreaTown` (browser_global_reassignment @ L2414), `manualAreaTown` (browser_global_reassignment @ L2433), `userCoords` (browser_global_reassignment @ L2434), `userMarker` (browser_global_reassignment @ L2451), `bookingDateBlocked` (browser_global_reassignment @ L2568), `bookingDateBlocked` (browser_global_reassignment @ L2582), `bookingDateBlocked` (browser_global_reassignment @ L2595), `bookingDateBlocked` (browser_global_reassignment @ L2633), `bookingDateBlocked` (browser_global_reassignment @ L2644), `bookingDraftKey` (browser_global_reassignment @ L2695), `bookingDraftSignature` (browser_global_reassignment @ L2696), `isSignedIn` (browser_global_reassignment @ L2734), `bookingDraftKey` (browser_global_reassignment @ L2751), `bookingDraftSignature` (browser_global_reassignment @ L2752), `bookingDraftKey` (browser_global_reassignment @ L2780), `bookingDraftSignature` (browser_global_reassignment @ L2781), `bookings` (browser_global_reassignment @ L2797), `bookingsLoadState` (browser_global_reassignment @ L2798), `bookingsLoadState` (browser_global_reassignment @ L2825), `isSignedIn` (browser_global_reassignment @ L2836), `accountSyncState` (browser_global_reassignment @ L2837), `bookings` (browser_global_reassignment @ L2838), `bookingsLoadState` (browser_global_reassignment @ L2839), `bookingsLoadState` (browser_global_reassignment @ L2847), `bookingsLoadCorr` (browser_global_reassignment @ L2848), `bookings` (browser_global_reassignment @ L2863), `bookingsLoadState` (browser_global_reassignment @ L2868), `bookingsLoadCorr` (browser_global_reassignment @ L2869), `previewOwnerRows` (browser_global_reassignment @ L2964), `ownerTruckId` (browser_global_reassignment @ L2995), `ownerTruckId` (browser_global_reassignment @ L3095), `ownerDashboardUnavailable` (browser_global_reassignment @ L3114), `isOwnerAdmin` (browser_global_reassignment @ L3124), `ownerAccess` (browser_global_reassignment @ L3128), `ownerAccess` (browser_global_reassignment @ L3134), `ownerProfile` (browser_global_reassignment @ L3179), `ownerLastKnownLocationHours` (browser_global_reassignment @ L3203), `ownerSchedule` (browser_global_reassignment @ L3216), `ownerDashboardUnavailable` (browser_global_reassignment @ L3245), `isOwnerAdmin` (browser_global_reassignment @ L3264), `ownerAccess` (browser_global_reassignment @ L3265), `ownerProfile` (browser_global_reassignment @ L3271), `ownerRequestFilter` (browser_global_reassignment @ L3288), `ownerSchedule` (browser_global_reassignment @ L3578), `ownerSchedule` (browser_global_reassignment @ L3592), `ownerProfile` (browser_global_reassignment @ L3688), `ownerProfile` (browser_global_reassignment @ L3697), `lastSurpriseId` (browser_global_reassignment @ L3763), `toastTimer` (explicit_window_property @ L3774), `bitesharkReady` (explicit_window_property @ L3796), `trucklyReady` (explicit_window_property @ L3796)
- **Significant Constants**: `API`, `OFFLINE_FALLBACK_TRUCKS`, `CATALOG_CACHE_KEY`, `CATALOG_CACHE_MAX_AGE_MS`, `MEASURED_ACCURACIES`, `cuisineSections`, `PACKAGES`, `HUBS`, `FAVS_SCOPE_STORAGE_KEY`, `favs`, `CLIENT_ALLOWLISTED_TILE_HOSTS`, `DEFAULT_BROWSER_MAP_CONFIG`, `activeTileTimers`, `mapRuntimeState`

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `kindMatches` | `function` | No | `(t: unknown)` | `sync_value` | `public/app.js:filtered$anon_L1022_28` | L22 |
| `ensureDiscoverScreenActive` | `function` | No | `()` | `void_or_implicit` | `public/app.js:chooseKind`, `public/app.js:chooseCuisine`, `public/app.js:openDetail`, `public/app.js:applyConfirmedClientSignOutCleanup` | L31 |
| `chooseKind` | `function` | No | `(kind: unknown)` | `void_or_implicit` | — | L49 |
| `chooseCuisine` | `function` | No | `(s: unknown)` | `void_or_implicit` | `public/app.js:b.onclick` | L73 |
| `safeJSON` | `function` | No | `(key: unknown, fallback: unknown)` | `sync_value` | `public/app.js:<top_level>$anon_L276_9`, `public/app.js:<top_level>$anon_L283_10`, `public/app.js:init`, `public/app.js:<top_level>` | L106 |
| `bsDiag` | `function` | No | `()` | `sync_value` | `public/app.js:isReducedMotion`, `public/app.js:safeStorageSet`, `public/app.js:appFetchJson`, `public/app.js:renderSectionFeedback` | L117 |
| `isReducedMotion` | `function` | No | `()` | `sync_value` | `public/app.js:chooseKind`, `public/app.js:selectTruck`, `public/app.js:selectManualArea`, `public/app.js:locateMe$anon_L2403_62` | L121 |
| `safeStorageSet` | `function` | No | `(key: unknown, value: unknown, featureKey: string)` | `sync_value` | `public/app.js:syncAuthAndUserData`, `public/app.js:toggleFav`, `public/app.js:toggleFavRetry`, `public/app.js:loadNotificationSettings` | L126 |
| `appFetchJson` | `function` | No | `(url: unknown, opts: object)` | `async -> promise` | `public/app.js:syncAuthAndUserData`, `public/app.js:syncAuthAndUserData$anon_L1639_45`, `public/app.js:signOutUser`, `public/app.js:toggleFav` | L148 |
| `renderSectionFeedback` | `function` | No | `(containerId: unknown, opts: unknown)` | `void_or_implicit` | `public/app.js:syncAuthAndUserData`, `public/app.js:toggleFav`, `public/app.js:toggleFavRetry`, `public/app.js:saveNotificationSettings` | L209 |
| `setInlineStatus` | `function` | No | `(elId: unknown, tone: unknown, text: unknown)` | `void_or_implicit` | `public/app.js:updateOwnerLocation`, `public/app.js:toggleOwnerOpenStatus`, `public/app.js:saveOwnerSchedule`, `public/app.js:reader.onload` | L226 |
| `openAppModal` | `function` | No | `(modalId: unknown, opts: object)` | `void_or_implicit` | `public/app.js:extraDetail`, `public/app.js:openDetail`, `public/app.js:openDistance`, `public/app.js:openAreaPicker` | L239 |
| `closeAppModal` | `function` | No | `(modalId: unknown)` | `void_or_implicit` | `public/app.js:closeModal`, `public/app.js:closeDistanceModal`, `public/app.js:closeAreaModal`, `public/app.js:closeBooking` | L249 |
| `esc` | `function` | No | `(value: unknown)` | `sync_value` | `public/admin.js:fmtUtcAndLocalHtml`, `public/admin.js:statusPill`, `public/admin.js:loadVendorSelectorCatalog$anon_L304_4`, `public/admin.js:loadApplications$anon_L527_8` | L259 |
| `<top_level>$anon_L283_10` | `anonymous_function` | No | `()` | `sync_value` | — | L283 |
| `formatUTCDateISO` | `function` | No | `(dt: unknown)` | `sync_value` | `public/app.js:addDaysISO`, `public/app.js:toCalendarDateISO` | L290 |
| `addDaysISO` | `function` | No | `(isoDate: unknown, days: unknown)` | `sync_value` | `public/app.js:defaultEventDate`, `public/app.js:openBooking`, `public/app.js:futureDateISO` | L300 |
| `toCalendarDateISO` | `function` | No | `(raw: unknown)` | `sync_value` | `public/app.js:parseEventDate`, `public/app.js:submitBooking$anon_L2748_74`, `public/app.js:submitBooking`, `public/app.js:loadUserBookings$anon_L2863_76` | L305 |
| `defaultEventDate` | `function` | No | `()` | `sync_value` | `public/app.js:init`, `public/app.js:openBooking`, `public/app.js:submitBooking` | L323 |
| `parseEventDate` | `function` | No | `(raw: unknown)` | `sync_value` | `public/app.js:renderBookings$anon_L2897_77`, `public/app.js:syncOwnerScheduleDay`, `public/app.js:renderOwnerScheduleList$anon_L3082_89`, `public/app.js:loadOwnerRequests$anon_L3348_96` | L327 |
| `milesBetween` | `function` | No | `(lat1: unknown, lng1: unknown, lat2: unknown, lng2: unknown)` | `sync_value` | `lib/discovery.js:evaluateVendorDiscoveryRow`, `public/app.js:recomputeDistances$anon_L350_11`, `public/app.js:locateMe$anon_L2403_62$anon_L2407_63` | L333 |
| `hasCoords` | `function` | No | `(t: unknown)` | `sync_value` | `public/app.js:hasMeasuredCoords`, `public/app.js:selectTruck` | L341 |
| `hasMeasuredCoords` | `function` | No | `(t: unknown)` | `sync_value` | `public/app.js:recomputeDistances$anon_L350_11` | L345 |
| `recomputeDistances` | `function` | No | `()` | `void_or_implicit` | `public/app.js:refreshDiscoveryCatalog`, `public/app.js:init`, `public/app.js:selectManualArea`, `public/app.js:locateMe$anon_L2403_62` | L349 |
| `distanceLabel` | `function` | No | `(t: unknown, mode: unknown)` | `sync_value` | `public/app.js:cardHTML`, `public/app.js:extraDetail`, `public/app.js:openDetail` | L359 |
| `sanitizeCatalogItem` | `function` | No | `(t: unknown)` | `sync_value` | — | L386 |
| `setCatalogOfflineNotice` | `function` | No | `(visible: unknown, text: unknown)` | `void_or_implicit` | `public/app.js:refreshDiscoveryCatalog` | L398 |
| `refreshDiscoveryCatalog` | `function` | No | `({ fresh, announce }: object)` | `async -> promise` | `public/app.js:init`, `public/app.js:showScreen`, `public/app.js:updateOwnerLocation`, `public/app.js:saveOwnerSchedule` | L405 |
| `clearActiveTileTimers` | `function` | No | `()` | `void_or_implicit` | `public/app.js:teardownActiveTileLayer` | L507 |
| `teardownActiveTileLayer` | `function` | No | `({ abortPendingImages }: object)` | `void_or_implicit` | `public/app.js:enterMapTileOutage`, `public/app.js:attachApprovedTileLayer`, `public/app.js:ensureMapInitialized`, `public/app.js:window.bitesharkSyncInteractiveMapControl` | L512 |
| `isLocalLoopbackPage` | `function` | No | `()` | `sync_value` | `public/app.js:validateClientMapConfig`, `public/app.js:getValidatedBrowserMapConfig` | L539 |
| `validateClientMapConfig` | `function` | No | `(rawCfg: unknown)` | `sync_value` | `public/app.js:getValidatedBrowserMapConfig` | L547 |
| `isInteractiveMapDisabledByControl` | `function` | No | `()` | `sync_value` | `public/app.js:ensureMapInitialized`, `public/app.js:window.bitesharkSyncInteractiveMapControl`, `public/app.js:init`, `public/app.js:setMode` | L635 |
| `getValidatedBrowserMapConfig` | `function` | No | `()` | `sync_value` | `public/app.js:ensureMapInitialized` | L648 |
| `showMapFallbackUI` | `function` | No | `({ title, copy, statusText, showRetry, hint }: object)` | `void_or_implicit` | `public/app.js:enterMapTileOutage`, `public/app.js:ensureMapInitialized` | L666 |
| `hideMapFallbackUI` | `function` | No | `()` | `void_or_implicit` | `public/app.js:ensureMapInitialized`, `public/app.js:window.bitesharkSyncInteractiveMapControl` | L690 |
| `shouldTriggerMapTileOutage` | `function` | No | `()` | `sync_value` | `public/app.js:recordTileFailure` | L705 |
| `enterMapTileOutage` | `function` | No | `(reason: unknown)` | `void_or_implicit` | `public/app.js:recordTileFailure` | L718 |
| `syncUserMarkerOnMap` | `function` | No | `()` | `void_or_implicit` | `public/app.js:attachApprovedTileLayer` | L742 |
| `attachApprovedTileLayer` | `function` | No | `(cfg: unknown)` | `void_or_implicit` | `public/app.js:ensureMapInitialized` | L757 |
| `bindMapResizeAndZoomListeners` | `function` | No | `()` | `void_or_implicit` | `public/app.js:ensureMapInitialized` | L848 |
| `ensureMapInitialized` | `function` | No | `({ forceRetry }: object)` | `sync_value` | `public/app.js:init`, `public/app.js:setMode$anon_L2293_54`, `public/app.js:setMode`, `public/app.js:retryInteractiveMap` | L883 |
| `window.bitesharkSyncInteractiveMapControl` | `function` | No | `()` | `void_or_implicit` | `public/role-experience.js:applyFeatureControlsToDom` | L950 |
| `init` | `function` | No | `()` | `async -> promise` | — | L962 |
| `foldText` | `function` | No | `(s: unknown)` | `sync_value` | `public/app.js:filtered`, `public/app.js:filtered$anon_L1022_28` | L1015 |
| `filtered` | `function` | No | `()` | `sync_value` | `public/app.js:applyFilters`, `public/app.js:surpriseMe`, `scripts/dev-workbench/debug-admin.js:renderLogsAndStats` | L1019 |
| `pinStatusBadge` | `function` | No | `(t: unknown)` | `sync_value` | `public/app.js:applyFilters$anon_L1319_33` | L1036 |
| `cardStatusInfo` | `function` | No | `(t: unknown)` | `sync_value` | `public/app.js:cardOpenBadge`, `public/app.js:cardHTML` | L1044 |
| `cardOpenBadge` | `function` | No | `(t: unknown)` | `sync_value` | — | L1066 |
| `normalizeFocalPoint` | `function` | No | `(raw: unknown)` | `sync_value` | `public/app.js:resolveApprovedVendorImage` | L1070 |
| `resolveApprovedVendorImage` | `function` | No | `(t: unknown)` | `sync_value` | `public/app.js:renderListingMediaSlot` | L1099 |
| `safeThumbTint` | `function` | No | `(rawColor: unknown)` | `sync_value` | `public/app.js:renderListingMediaSlot` | L1118 |
| `cleanDisplayText` | `function` | No | `(val: unknown)` | `sync_value` | `public/app.js:resolveApprovedVendorImage`, `public/app.js:cardCategoryTownLine`, `public/app.js:cardHighlightLine`, `public/app.js:cardHTML` | L1123 |
| `pickCardIllustrationKey` | `function` | No | `(t: unknown)` | `sync_value` | `public/app.js:renderRestrainedCardIllustration` | L1130 |
| `renderRestrainedCardIllustration` | `function` | No | `(t: unknown)` | `sync_value` | `public/app.js:renderListingMediaSlot` | L1146 |
| `handleListingImageError` | `function` | No | `(imgEl: unknown)` | `void_or_implicit` | — | L1168 |
| `renderListingMediaSlot` | `function` | No | `(t: unknown, { variant, index }: object)` | `sync_value` | `public/app.js:cardHTML`, `public/app.js:extraDetail`, `public/app.js:openDetail` | L1186 |
| `cardCategoryTownLine` | `function` | No | `(t: unknown)` | `sync_value` | `public/app.js:cardHTML` | L1209 |
| `cardHighlightLine` | `function` | No | `(t: unknown)` | `sync_value` | `public/app.js:cardHTML` | L1231 |
| `captureActiveCardControlFocus` | `function` | No | `(containerId: unknown)` | `sync_value` | `public/app.js:applyFilters`, `public/app.js:renderFavorites` | L1244 |
| `restoreActiveCardControlFocus` | `function` | No | `(snapshot: unknown)` | `void_or_implicit` | `public/app.js:applyFilters`, `public/app.js:renderFavorites` | L1258 |
| `detailStatusPrefix` | `function` | No | `(t: unknown)` | `sync_value` | `public/app.js:extraDetail`, `public/app.js:openDetail` | L1281 |
| `detailHoursNote` | `function` | No | `(t: unknown)` | `sync_value` | `public/app.js:extraDetail`, `public/app.js:openDetail` | L1293 |
| `applyFilters` | `function` | No | `()` | `void_or_implicit` | `public/app.js:chooseCuisine`, `public/app.js:refreshDiscoveryCatalog`, `public/app.js:bindMapResizeAndZoomListeners$anon_L862_22`, `public/app.js:init` | L1306 |
| `resetFilters` | `function` | No | `()` | `void_or_implicit` | — | L1367 |
| `openTruck` | `function` | No | `(id: unknown, triggerEl: unknown)` | `void_or_implicit` | `public/app.js:handleCardSurfaceClick` | L1409 |
| `handleCardSurfaceClick` | `function` | No | `(event: unknown, id: unknown)` | `void_or_implicit` | — | L1418 |
| `cardHTML` | `function` | No | `(t: unknown, index: number)` | `sync_value` | `public/app.js:applyFilters$anon_L1360_36`, `public/app.js:extraCard`, `public/app.js:renderFavorites$anon_L2025_49` | L1429 |
| `extraCard` | `function` | No | `(t: unknown)` | `sync_value` | — | L1470 |
| `resolveDetailRestoreTrigger` | `function` | No | `(id: unknown, explicitTrigger: unknown)` | `sync_value` | `public/app.js:openDetail` | L1474 |
| `extraDetail` | `function` | No | `(t: unknown, triggerEl: unknown)` | `void_or_implicit` | `public/app.js:openDetail` | L1495 |
| `selectTruck` | `function` | No | `(id: unknown)` | `void_or_implicit` | `public/app.js:applyFilters$anon_L1319_33$anon_L1329_34`, `public/app.js:openTruck` | L1509 |
| `openDetail` | `function` | No | `(id: unknown, triggerEl: unknown)` | `void_or_implicit` | `public/app.js:applyFilters$anon_L1319_33$anon_L1329_34`, `public/app.js:openTruck`, `public/app.js:surpriseMe`, `public/community.js:communityViewPlace` | L1523 |
| `closeModal` | `function` | No | `()` | `void_or_implicit` | `public/community.js:communityReviewPlace`, `public/customer-profile.js:openCustomerProfile`, `public/local-guides.js:openVisitJournalForBusiness`, `public/local-guides.js:openPhotoNotebook` | L1550 |
| `initialsFromUser` | `function` | No | `(user: unknown)` | `sync_value` | `public/app.js:updateAuthUI` | L1554 |
| `updateAuthUI` | `function` | No | `()` | `void_or_implicit` | `public/app.js:init`, `public/app.js:syncAuthAndUserData`, `public/app.js:applyConfirmedClientSignOutCleanup`, `public/app.js:toggleFav` | L1566 |
| `syncAuthAndUserData` | `function` | No | `()` | `async -> promise` | `public/app.js:init`, `public/app.js:onRetry`, `scripts/dev-workbench/debug-admin.js:setRole` | L1600 |
| `renderSignOutFailureNotice` | `function` | No | `(message: unknown)` | `void_or_implicit` | `public/app.js:applyConfirmedClientSignOutCleanup`, `public/app.js:signOutUser` | L1747 |
| `applyConfirmedClientSignOutCleanup` | `function` | No | `(opts: object)` | `void_or_implicit` | `public/app.js:signOutUser` | L1777 |
| `signOutUser` | `function` | No | `(opts: object)` | `async -> promise` | `public/app.js:retryBtn.onclick`, `public/role-experience.js:swBtn.onclick` | L1859 |

*Showing first 80 of 139 symbols in `public/app.js`; query `npm run registry:locate -- <name>` for full list.*

### [public/auth-client.js](../../../public/auth-client.js) (`script`)
- **Explicit Window / Reassigned Globals**: `bitesharkAuth` (explicit_window_property @ L184), `trucklyAuth` (explicit_window_property @ L185), `biteshark` (explicit_window_property @ L186)

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `<top_level>$anon_L12_1` | `anonymous_function` | No | `()` | `void_or_implicit` | — | L12 |

### [public/characters.js](../../../public/characters.js) (`script`)
- **Explicit Window / Reassigned Globals**: `applyFilters` (browser_global_reassignment @ L14)
- **Significant Constants**: `flavorLines`, `applyFiltersWithCharacters`

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `truckCharacter` | `function` | No | `(kind: string)` | `sync_value` | `public/characters.js:<top_level>$anon_L6_1`, `public/characters.js:updateFlavorCharacters`, `public/coffee-club.js:flavorDoodle` | L1 |
| `updateFlavorCharacters` | `function` | No | `()` | `void_or_implicit` | `public/characters.js:applyFilters`, `public/characters.js:<top_level>` | L8 |
| `applyFilters` | `function` | No | `()` | `void_or_implicit` | `public/app.js:chooseCuisine`, `public/app.js:refreshDiscoveryCatalog`, `public/app.js:bindMapResizeAndZoomListeners$anon_L862_22`, `public/app.js:init` | L14 |

### [public/coffee-club.js](../../../public/coffee-club.js) (`script`)

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `flavorDoodle` | `function` | No | `(name: unknown)` | `sync_value` | `public/coffee-club.js:paintFlavorIcons$anon_L24_1`, `public/coffee-club.js:paintFlavorIcons$anon_L26_2`, `public/coffee-club.js:paintFlavorIcons$anon_L28_3`, `public/coffee-club.js:paintFlavorIcons$anon_L30_4` | L1 |
| `paintFlavorIcons` | `function` | No | `()` | `void_or_implicit` | `public/coffee-club.js:<top_level>` | L23 |

### [public/community.js](../../../public/community.js) (`script`)
- **Explicit Window / Reassigned Globals**: `communityDraftKey` (browser_global_reassignment @ L160), `communityDraftSig` (browser_global_reassignment @ L161), `communityDraftKey` (browser_global_reassignment @ L194), `communityDraftSig` (browser_global_reassignment @ L194), `communityDraftKey` (browser_global_reassignment @ L215), `communityDraftSig` (browser_global_reassignment @ L215)
- **Significant Constants**: `communityState`

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `communityDiag` | `function` | No | `()` | `sync_value` | `public/community.js:communityLoad`, `public/community.js:communityStartPost`, `public/community.js:communitySubmitPost`, `public/community.js:communityLoadMy` | L4 |
| `communityEscape` | `function` | No | `(value: unknown)` | `sync_value` | `public/community.js:openCommunity$anon_L29_4`, `public/community.js:communityLoad`, `public/community.js:communityRender$anon_L75_9`, `public/community.js:communityRender$anon_L93_12` | L5 |
| `communityDate` | `function` | No | `(value: unknown)` | `sync_value` | `public/community.js:communityRender$anon_L93_12`, `public/community.js:communityLoadMy$anon_L259_22` | L6 |
| `communityGetPlaces` | `function` | No | `()` | `sync_value` | `public/community.js:openCommunity`, `public/community.js:communityViewPlace`, `public/community.js:communitySubmitPost` | L10 |
| `openCommunity` | `function` | No | `()` | `async -> promise` | `public/community.js:communityReviewPlace`, `scripts/dev-workbench/debug-admin.js:jumpCustomer`, `scripts/dev-workbench/debug-admin.js:seedWhisper` | L14 |
| `communityLoad` | `function` | No | `()` | `async -> promise (throws: Error)` | `public/community.js:openCommunity`, `scripts/dev-workbench/debug-admin.js:setRole` | L33 |
| `communitySetFilter` | `function` | No | `(kind: unknown)` | `void_or_implicit` | — | L62 |
| `communityRender` | `function` | No | `()` | `void_or_implicit` | `public/community.js:communityLoad`, `public/community.js:communitySetFilter` | L70 |
| `communityViewPlace` | `function` | No | `(id: unknown)` | `void_or_implicit` | `public/community.js:communityRender$anon_L103_13$anon_L103_14` | L106 |
| `communityStartPost` | `function` | No | `(kind: string, title: string)` | `void_or_implicit` | `public/community.js:communityReviewPlace`, `public/street-whispers.js:streetNextMission$anon_L259_15`, `public/street-whispers.js:streetOpenWhisper`, `scripts/dev-workbench/debug-admin.js:seedWhisper` | L111 |
| `communityClosePost` | `function` | No | `()` | `void_or_implicit` | `public/community.js:communitySubmitPost` | L128 |
| `communityKindChange` | `function` | No | `()` | `void_or_implicit` | `public/community.js:communityStartPost`, `public/community.js:communitySubmitPost` | L132 |
| `communitySubmitPost` | `function` | No | `(e: unknown)` | `async -> promise` | — | L140 |
| `communityLoadMy` | `function` | No | `()` | `async -> promise` | `public/community.js:communitySubmitPost`, `public/community.js:communityToggleMy` | L231 |
| `communityToggleMy` | `function` | No | `()` | `void_or_implicit` | — | L269 |
| `communityReviewPlace` | `function` | No | `(id: unknown)` | `async -> promise` | — | L274 |
| `communityOpenModeration` | `function` | No | `()` | `async -> promise (throws: Error)` | `public/community.js:communityModerate`, `scripts/dev-workbench/debug-admin.js:jumpProvider` | L281 |
| `communityModerate` | `function` | No | `(id: unknown, status: unknown, reason: unknown)` | `async -> promise (throws: Error)` | `public/community.js:communityOpenModeration$anon_L297_26$anon_L298_27$anon_L298_28` | L305 |

### [public/customer-profile.js](../../../public/customer-profile.js) (`script`)
- **Explicit Window / Reassigned Globals**: `openCustomerProfile` (explicit_window_property @ L1096), `bitesharkOpenCustomerProfile` (explicit_window_property @ L1097), `bitesharkResetProfileUiOnAuthChange` (explicit_window_property @ L1098), `bitesharkRegisterProfileAuthResetListener` (explicit_window_property @ L1099), `bitesharkRegisterCollectionsRenderer` (explicit_window_property @ L1100)

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `<top_level>$anon_L8_1` | `anonymous_function` | No | `()` | `void_or_implicit` | — | L8 |

### [public/diagnostics-client.js](../../../public/diagnostics-client.js) (`script`)

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `initBiteSharkDiagnostics` | `function` | No | `(globalScope: unknown)` | `void_or_implicit` | — | L15 |

### [public/exploration-client.js](../../../public/exploration-client.js) (`script`)
- **Explicit Window / Reassigned Globals**: `bitesharkExploration` (explicit_window_property @ L1031), `bitesharkExploration` (explicit_window_property @ L1034)

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `<top_level>$anon_L8_1` | `anonymous_function` | No | `()` | `void_or_implicit` | — | L8 |

### [public/greatest-hits-sharing.js](../../../public/greatest-hits-sharing.js) (`script`)

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `<top_level>$anon_L9_1` | `anonymous_function` | No | `()` | `void_or_implicit` | — | L9 |

### [public/greatest-hits.js](../../../public/greatest-hits.js) (`script`)
- **Explicit Window / Reassigned Globals**: `bitesharkGreatestHitsHooks` (explicit_window_property @ L822)

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `<top_level>$anon_L9_1` | `anonymous_function` | No | `()` | `void_or_implicit` | — | L9 |

### [public/guide-passport.js](../../../public/guide-passport.js) (`script`)
- **Explicit Window / Reassigned Globals**: `preselectedVisitVendorId` (browser_global_reassignment @ L295), `journalState` (browser_global_reassignment @ L779), `bitesharkResetExplorationUiOnAuthChange` (explicit_window_property @ L814)

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `guidePassportHtmlEscape` | `function` | No | `(s: unknown)` | `sync_value` | `public/guide-passport.js:renderLegacyMigrationBannerHtml$anon_L54_5`, `public/guide-passport.js:renderLegacyMigrationBannerHtml$anon_L55_6`, `public/guide-passport.js:renderLegacyMigrationBannerHtml`, `public/guide-passport.js:renderAchievementsSectionHtml$anon_L166_7` | L21 |
| `guidePlaces` | `function` | No | `()` | `sync_value` | `public/community.js:communityGetPlaces`, `public/guide-passport.js:guidePlace`, `public/guide-passport.js:getFilteredPlaceOptions` | L29 |
| `guidePlace` | `function` | No | `(id: unknown)` | `sync_value` | `public/guide-passport.js:renderGuidePassport`, `public/guide-passport.js:bindVisitJournalHandlers$anon_L547_19` | L40 |
| `getJournalFeatureApi` | `function` | No | `()` | `sync_value` | `public/guide-passport.js:renderSignedOutVisitJournalHtml`, `public/guide-passport.js:renderGuidePassport`, `public/guide-passport.js:guideLogVisit` | L44 |
| `renderLegacyMigrationBannerHtml` | `function` | No | `(legacySnap: unknown, userEmail: unknown)` | `sync_value` | `public/guide-passport.js:renderGuidePassport` | L48 |
| `renderSignedOutVisitJournalHtml` | `function` | No | `()` | `sync_value` | `public/guide-passport.js:renderGuidePassport` | L131 |
| `renderAchievementsSectionHtml` | `function` | No | `(summary: unknown)` | `sync_value` | `public/guide-passport.js:renderGuidePassport` | L155 |
| `renderWeeklyChallengeHtml` | `function` | No | `(summary: unknown)` | `sync_value` | `public/guide-passport.js:renderGuidePassport` | L238 |
| `getFilteredPlaceOptions` | `function` | No | `(queryText: unknown, selectedId: unknown)` | `sync_value` | `public/guide-passport.js:renderGuidePassport`, `public/guide-passport.js:bindVisitJournalHandlers$anon_L521_17` | L269 |
| `renderGuidePassport` | `function` | No | `(opts: object)` | `async -> promise` | `public/guide-passport.js:bindVisitJournalHandlers$anon_L579_23$anon_L580_24`, `public/guide-passport.js:bindVisitJournalHandlers$anon_L586_25$anon_L587_26`, `public/guide-passport.js:bindVisitJournalHandlers$anon_L593_27$anon_L594_28`, `public/guide-passport.js:bindVisitJournalHandlers$anon_L616_29` | L288 |
| `bindVisitJournalHandlers` | `function` | No | `(host: unknown)` | `void_or_implicit` | `public/guide-passport.js:renderGuidePassport` | L504 |
| `guideLogVisit` | `function` | No | `(e: unknown)` | `async -> promise` | — | L709 |
| `resetVisitJournalStateOnAuthChange` | `function` | No | `()` | `void_or_implicit` | — | L778 |

### [public/listing-highlights.js](../../../public/listing-highlights.js) (`script`)
- **Explicit Window / Reassigned Globals**: `bitesharkListingHighlights` (explicit_window_property @ L79), `bitesharkListingHighlights` (explicit_window_property @ L82), `openDetail` (browser_global_reassignment @ L91)

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `<top_level>$anon_L8_1` | `anonymous_function` | No | `()` | `void_or_implicit` | — | L8 |

### [public/local-guides.js](../../../public/local-guides.js) (`script`)
- **Explicit Window / Reassigned Globals**: `activeGuidesTab` (browser_global_reassignment @ L311), `preselectedVisitVendorId` (browser_global_reassignment @ L357), `preselectedPhotoVendorId` (browser_global_reassignment @ L382), `preselectedPhotoVendorId` (browser_global_reassignment @ L462), `pendingDeletePhotoId` (browser_global_reassignment @ L666), `pendingDeletePhotoId` (browser_global_reassignment @ L672), `pendingDeletePhotoId` (browser_global_reassignment @ L682)
- **Significant Constants**: `LEGACY_DISH_NOTEBOOK_KEY`, `tablist`

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `guidesEscape` | `function` | No | `(v: unknown)` | `sync_value` | `public/guide-passport.js:guidePassportHtmlEscape`, `public/local-guides.js:populateDishPhotoVendorOptions$anon_L57_3`, `public/local-guides.js:renderStoryCardHtml`, `public/local-guides.js:renderEditorialStories` | L14 |
| `getGuidesFeatureApi` | `function` | No | `()` | `sync_value` | `public/local-guides.js:isGuidesSubfeatureHidden`, `public/local-guides.js:renderEditorialStories`, `public/local-guides.js:openLocalGuides`, `public/local-guides.js:showGuidesTab` | L20 |
| `isGuidesSubfeatureHidden` | `function` | No | `(key: unknown)` | `sync_value` | `public/local-guides.js:getAvailableGuidesTabs`, `public/local-guides.js:renderStoryCardHtml`, `public/local-guides.js:renderEditorialStories`, `public/local-guides.js:renderDiscoverStoriesStrip` | L24 |
| `getAvailableGuidesTabs` | `function` | No | `()` | `sync_value` | `public/local-guides.js:resolveBestGuidesTab` | L31 |
| `resolveBestGuidesTab` | `function` | No | `(requested: unknown)` | `sync_value` | `public/local-guides.js:openLocalGuides`, `public/local-guides.js:showGuidesTab` | L39 |
| `populateDishPhotoVendorOptions` | `function` | No | `(selectedId: unknown)` | `void_or_implicit` | `public/local-guides.js:openLocalGuides`, `public/local-guides.js:openPhotoNotebook`, `public/local-guides.js:saveDishPhoto`, `public/local-guides.js:renderDishPhotos` | L46 |
| `renderStoryCardHtml` | `function` | No | `(story: unknown)` | `sync_value` | — | L71 |
| `renderEditorialStories` | `function` | No | `()` | `async -> promise` | `public/local-guides.js:showGuidesTab` | L150 |
| `renderDiscoverStoriesStrip` | `function` | No | `()` | `void_or_implicit` | `public/local-guides.js:<top_level>`, `public/role-experience.js:applyFeatureControlsToDom` | L220 |
| `openLocalGuides` | `function` | No | `(tab: string)` | `async -> promise` | `public/customer-profile.js:btn.onclick`, `public/local-guides.js:renderDiscoverStoriesStrip$anon_L259_15`, `public/local-guides.js:openVisitJournalForBusiness`, `public/local-guides.js:openPhotoNotebook` | L273 |
| `showGuidesTab` | `function` | No | `(tab: unknown)` | `void_or_implicit` | `public/guide-passport.js:renderGuidePassport$anon_L302_11`, `public/local-guides.js:openLocalGuides`, `public/local-guides.js:<top_level>$anon_L730_37`, `public/role-experience.js:applyFeatureControlsToDom` | L305 |
| `openVisitJournalForBusiness` | `function` | No | `(vendorId: unknown)` | `async -> promise` | `public/local-guides.js:renderEditorialStories$anon_L208_10$anon_L209_11`, `public/smart.js:renderTrailPreview$anon_L500_22$anon_L501_23`, `public/smart.js:renderSavedTrailsList$anon_L673_34$anon_L674_35` | L348 |
| `openPhotoNotebook` | `function` | No | `(vendorId: unknown)` | `async -> promise` | `public/local-guides.js:renderEditorialStories$anon_L213_12$anon_L214_13` | L373 |
| `saveDishPhoto` | `function` | No | `(e: unknown)` | `async -> promise` | — | L397 |
| `openPrivatePhotoViewer` | `function` | No | `(photo: unknown)` | `void_or_implicit` | `public/local-guides.js:renderDishPhotos$anon_L653_25$anon_L654_26` | L493 |
| `closePrivatePhotoViewer` | `function` | No | `()` | `void_or_implicit` | `public/local-guides.js:openPrivatePhotoViewer$anon_L499_22` | L531 |
| `renderDishPhotos` | `function` | No | `()` | `async -> promise` | `public/guide-passport.js:resetVisitJournalStateOnAuthChange`, `public/local-guides.js:showGuidesTab`, `public/local-guides.js:saveDishPhoto` | L540 |
| `handleGuidesHashRoutes` | `function` | No | `()` | `void_or_implicit` | — | L708 |
| `<top_level>$anon_L730_37` | `anonymous_function` | No | `(ev: unknown)` | `void_or_implicit` | — | L730 |

### [public/pager.js](../../../public/pager.js) (`script`)
- **Explicit Window / Reassigned Globals**: `pagerDemoAuto` (browser_global_reassignment @ L174), `pagerToken` (browser_global_reassignment @ L175), `pagerDemo` (browser_global_reassignment @ L176), `pagerStatus` (browser_global_reassignment @ L177), `pagerPushError` (browser_global_reassignment @ L178), `pagerDemoTimer` (browser_global_reassignment @ L191), `pagerDemoTimer` (browser_global_reassignment @ L197), `pagerDemoTimer` (browser_global_reassignment @ L198), `pagerStatus` (browser_global_reassignment @ L207), `pagerCurrentRendered` (browser_global_reassignment @ L208), `lastPagerRenderSignature` (browser_global_reassignment @ L225), `pagerPushError` (browser_global_reassignment @ L262), `pagerPushBusy` (browser_global_reassignment @ L267), `pagerPushBusy` (browser_global_reassignment @ L273), `pagerPushError` (browser_global_reassignment @ L340), `pagerPushError` (browser_global_reassignment @ L342), `pagerPushBusy` (browser_global_reassignment @ L344), `pagerPushBusy` (browser_global_reassignment @ L352), `pagerPushError` (browser_global_reassignment @ L353), `pagerPushError` (browser_global_reassignment @ L409), `pagerPushError` (browser_global_reassignment @ L415), `pagerPushBusy` (browser_global_reassignment @ L417), `pagerBusy` (browser_global_reassignment @ L424), `pagerPushServer` (browser_global_reassignment @ L449), `pagerBusy` (browser_global_reassignment @ L461), `pagerSound` (browser_global_reassignment @ L467), `pagerAudio` (browser_global_reassignment @ L474), `pagerSound` (browser_global_reassignment @ L476), `pagerDemo` (browser_global_reassignment @ L510), `pagerDemoAuto` (browser_global_reassignment @ L512), `pagerToken` (browser_global_reassignment @ L513), `pagerStatus` (browser_global_reassignment @ L514), `lastPagerRenderSignature` (browser_global_reassignment @ L515), `pagerPushError` (browser_global_reassignment @ L516), `pagerDemoAuto` (browser_global_reassignment @ L529), `pagerDemo` (browser_global_reassignment @ L537), `pagerDemoAuto` (browser_global_reassignment @ L538), `pagerStatus` (browser_global_reassignment @ L539), `pagerToken` (browser_global_reassignment @ L540), `pagerCurrentRendered` (browser_global_reassignment @ L541), `kitchenRequestKey` (browser_global_reassignment @ L669), `kitchenRequestSig` (browser_global_reassignment @ L670), `kitchenRequestKey` (browser_global_reassignment @ L674), `kitchenRequestSig` (browser_global_reassignment @ L675), `pagerDemo` (browser_global_reassignment @ L744), `pagerDemoAuto` (browser_global_reassignment @ L745), `pagerToken` (browser_global_reassignment @ L746)
- **Significant Constants**: `PAGER_SUBS_STORAGE_KEY`, `pagerStates`, `pagerDemoStages`

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `pagerEscape` | `function` | No | `(v: unknown)` | `sync_value` | `public/pager.js:buildPagerPushSectionHtml`, `public/pager.js:renderPager`, `public/pager.js:renderKitchen$anon_L638_12` | L14 |
| `readStoredPagerSubs` | `function` | No | `()` | `sync_value` | `public/pager.js:getLocalPagerSub`, `public/pager.js:saveLocalPagerSub`, `public/pager.js:removeLocalPagerSub`, `public/pager.js:resolveTokenBySubscriptionRef` | L18 |
| `writeStoredPagerSubs` | `function` | No | `(mapObj: unknown)` | `void_or_implicit` | `public/pager.js:saveLocalPagerSub`, `public/pager.js:removeLocalPagerSub` | L38 |
| `getLocalPagerSub` | `function` | No | `(token: unknown)` | `sync_value` | `public/pager.js:buildPagerPushSectionHtml`, `public/pager.js:renderPager`, `public/pager.js:subscribePagerPush`, `public/pager.js:unsubscribePagerPush` | L46 |
| `saveLocalPagerSub` | `function` | No | `(token: unknown, record: unknown)` | `void_or_implicit` | `public/pager.js:subscribePagerPush` | L52 |
| `removeLocalPagerSub` | `function` | No | `(token: unknown)` | `void_or_implicit` | `public/pager.js:renderPager`, `public/pager.js:unsubscribePagerPush` | L59 |
| `resolveTokenBySubscriptionRef` | `function` | No | `(subId: unknown)` | `sync_value` | `public/pager.js:<top_level>$anon_L738_17`, `public/pager.js:loadPagerHash` | L68 |
| `scrubPagerHashFromUrl` | `function` | No | `()` | `void_or_implicit` | `public/pager.js:loadPagerHash` | L77 |
| `urlBase64ToUint8Array` | `function` | No | `(base64String: unknown)` | `sync_value` | `public/pager.js:subscribePagerPush` | L85 |
| `isIosNeedsHomeScreen` | `function` | No | `()` | `sync_value` | `public/pager.js:buildPagerPushSectionHtml`, `public/pager.js:subscribePagerPush` | L96 |
| `hasBrowserPushSupport` | `function` | No | `()` | `sync_value` | `public/pager.js:buildPagerPushSectionHtml`, `public/pager.js:subscribePagerPush`, `public/pager.js:unsubscribePagerPush` | L108 |
| `buildPagerPushSectionHtml` | `function` | No | `(p: unknown)` | `sync_value` | `public/pager.js:renderPager` | L118 |
| `openPager` | `function` | No | `()` | `void_or_implicit` | `public/pager.js:<top_level>$anon_L738_17`, `public/pager.js:loadPagerHash`, `scripts/dev-workbench/debug-admin.js:jumpCustomer`, `scripts/dev-workbench/debug-admin.js:spawnLivePager` | L150 |
| `pagerCodeFrom` | `function` | No | `(value: unknown)` | `sync_value` | `public/pager.js:joinPager` | L156 |
| `joinPager` | `function` | No | `(e: unknown)` | `async -> promise` | `public/pager.js:loadPagerHash`, `scripts/dev-workbench/debug-admin.js:spawnLivePager` | L166 |
| `pagerDiag` | `function` | No | `()` | `sync_value` | `public/pager.js:subscribePagerPush`, `public/pager.js:unsubscribePagerPush`, `public/pager.js:refreshPager`, `public/pager.js:startPagerDemo` | L186 |
| `pagerClearDemoTimer` | `function` | No | `()` | `void_or_implicit` | `public/pager.js:joinPager`, `public/pager.js:pagerScheduleDemo`, `public/pager.js:startPagerDemo`, `public/pager.js:pagerToggleAutoplay` | L190 |
| `pagerScheduleDemo` | `function` | No | `()` | `void_or_implicit` | `public/pager.js:openPager`, `public/pager.js:pagerToggleAutoplay`, `public/pager.js:demoPagerStep`, `public/pager.js:<top_level>$anon_L722_15` | L194 |
| `renderPager` | `function` | No | `(p: unknown)` | `void_or_implicit (throws: Error)` | `public/admin.js:loadApplications`, `public/admin.js:loadVendors`, `public/admin.js:loadInvitations`, `public/admin.js:loadAccounts` | L203 |
| `subscribePagerPush` | `function` | No | `()` | `async -> promise (throws: Error)` | — | L260 |
| `unsubscribePagerPush` | `function` | No | `()` | `async -> promise (throws: Error)` | — | L349 |
| `refreshPager` | `function` | No | `()` | `async -> promise (throws: Error)` | `public/pager.js:openPager`, `public/pager.js:joinPager`, `public/pager.js:<top_level>$anon_L718_14`, `public/pager.js:<top_level>$anon_L722_15` | L422 |
| `enablePagerSound` | `function` | No | `()` | `async -> promise (throws: Error)` | — | L465 |
| `ringPager` | `function` | No | `()` | `void_or_implicit` | `public/pager.js:renderPager`, `public/pager.js:enablePagerSound` | L484 |
| `startPagerDemo` | `function` | No | `()` | `void_or_implicit` | `public/pager.js:pagerAdvanceDemo`, `scripts/dev-workbench/debug-admin.js:spawnLivePager` | L501 |
| `pagerAdvanceDemo` | `function` | No | `()` | `void_or_implicit` | `public/pager.js:pagerScheduleDemo$anon_L197_2` | L521 |
| `pagerToggleAutoplay` | `function` | No | `()` | `void_or_implicit` | — | L527 |
| `pagerLeaveDemo` | `function` | No | `()` | `void_or_implicit` | `public/role-experience.js:applyFeatureControlsToDom` | L535 |
| `demoPagerStep` | `function` | No | `(status: unknown)` | `void_or_implicit` | `public/pager.js:startPagerDemo`, `public/pager.js:pagerAdvanceDemo` | L548 |
| `currentKitchenVendorId` | `function` | No | `()` | `sync_value` | `public/pager.js:loadKitchen`, `public/pager.js:createPager` | L555 |
| `kitchenFetch` | `function` | No | `(path: unknown, options: object)` | `async -> promise (throws: Error, thrown_value)` | `public/pager.js:loadKitchen`, `public/pager.js:createPager`, `public/pager.js:updatePagerStatus` | L562 |
| `kitchenError` | `function` | No | `(e: unknown)` | `void_or_implicit` | `public/pager.js:loadKitchen`, `public/pager.js:createPager`, `public/pager.js:updatePagerStatus` | L623 |
| `pagerLink` | `function` | No | `(id: unknown)` | `sync_value` | `public/pager.js:renderKitchen$anon_L638_12`, `public/pager.js:copyPagerLink` | L635 |
| `renderKitchen` | `function` | No | `(rows: unknown)` | `void_or_implicit` | `public/pager.js:loadKitchen` | L637 |
| `loadKitchen` | `function` | No | `()` | `async -> promise` | `public/app.js:selectOwnerTruck`, `public/pager.js:createPager`, `public/pager.js:updatePagerStatus`, `scripts/dev-workbench/debug-admin.js:jumpProvider` | L641 |
| `createPager` | `function` | No | `(e: unknown)` | `async -> promise` | — | L657 |
| `updatePagerStatus` | `function` | No | `(id: unknown, status: unknown, button: unknown)` | `async -> promise` | — | L692 |
| `copyPagerLink` | `function` | No | `(id: unknown)` | `async -> promise` | — | L709 |
| `<top_level>$anon_L722_15` | `anonymous_function` | No | `()` | `void_or_implicit` | — | L722 |
| `<top_level>$anon_L738_17` | `anonymous_function` | No | `(event: unknown)` | `void_or_implicit` | — | L738 |
| `loadPagerHash` | `function` | No | `()` | `void_or_implicit` | `public/pager.js:<top_level>` | L754 |

### [public/profile-client.js](../../../public/profile-client.js) (`script`)
- **Explicit Window / Reassigned Globals**: `bitesharkProfile` (explicit_window_property @ L333), `bitesharkProfile` (explicit_window_property @ L336)

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `<top_level>$anon_L10_1` | `anonymous_function` | No | `()` | `void_or_implicit` | — | L10 |

### [public/role-experience.js](../../../public/role-experience.js) (`script`)
- **Explicit Window / Reassigned Globals**: `fetch` (explicit_window_property @ L200), `location.href` (explicit_window_property @ L334), `location.href` (explicit_window_property @ L336), `openExplorationPrivacyModal` (explicit_window_property @ L1420), `bitesharkOnSignedOut` (explicit_window_property @ L1421), `location.href` (explicit_window_property @ L2527), `bitesharkOpenSupport` (explicit_window_property @ L2634), `bitesharkSyncOwnerVendorContext` (explicit_window_property @ L2635), `bitesharkOpenCommunityReport` (explicit_window_property @ L3127), `location.href` (explicit_window_property @ L3290), `location.hash` (explicit_window_property @ L3349), `location.href` (explicit_window_property @ L3356), `bitesharkFeatures` (explicit_window_property @ L3865), `location.href` (explicit_window_property @ L4092), `bitesharkMarkDiscoveryInteraction` (explicit_window_property @ L4418), `bitesharkOnScreenChange` (explicit_window_property @ L4421), `bitesharkWelcome` (explicit_window_property @ L4424)

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `<top_level>$anon_L6_1` | `anonymous_function` | No | `()` | `void_or_implicit` | — | L6 |

### [public/shared-collection-page.js](../../../public/shared-collection-page.js) (`script`)

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `<top_level>$anon_L9_1` | `anonymous_function` | No | `()` | `void_or_implicit` | — | L9 |

### [public/smart.js](../../../public/smart.js) (`script`)
- **Explicit Window / Reassigned Globals**: `smartMode` (browser_global_reassignment @ L101), `currentTrailOffset` (browser_global_reassignment @ L177), `currentTrailOffset` (browser_global_reassignment @ L184), `finderRotationOffset` (browser_global_reassignment @ L300), `currentTrailTown` (browser_global_reassignment @ L354), `currentTrailTheme` (browser_global_reassignment @ L355), `currentTrailOffset` (browser_global_reassignment @ L356), `currentTrailPreview` (browser_global_reassignment @ L369), `pendingDeleteTrailId` (browser_global_reassignment @ L688), `pendingDeleteTrailId` (browser_global_reassignment @ L694), `pendingDeleteTrailId` (browser_global_reassignment @ L703), `openDetail` (browser_global_reassignment @ L930)
- **Significant Constants**: `originalBiteSharkDetail`

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `smartEscape` | `arrow_function` | No | `(v: unknown)` | `sync_value` | `public/smart.js:normalizedTownOptions$anon_L42_6`, `public/smart.js:findFlavor`, `public/smart.js:findFlavor$anon_L314_11`, `public/smart.js:buildFoodTrail` | L14 |
| `spotUrl` | `function` | No | `(id: unknown)` | `sync_value` | `public/smart.js:shareSpot`, `public/smart.js:renderOwnerPromo` | L17 |
| `getSmartFeatureApi` | `function` | No | `()` | `sync_value` | `public/smart.js:resolveSmartTabAvailability`, `public/smart.js:openSmart`, `public/smart.js:renderTrailPreview`, `public/smart.js:renderSavedTrailsList` | L21 |
| `normalizedTownOptions` | `function` | No | `(selectedTown: string)` | `sync_value` | `public/smart.js:renderSuggestedTrailsView`, `public/smart.js:renderFlavorFinderView` | L25 |
| `smartStatus` | `function` | No | `(msg: unknown)` | `void_or_implicit` | `public/smart.js:openSmart`, `public/smart.js:findFlavor`, `public/smart.js:renderTrailPreview$anon_L514_26`, `public/smart.js:renderSavedTrailsList$anon_L698_42$anon_L699_43` | L55 |
| `resolveSmartTabAvailability` | `function` | No | `(requestedMode: unknown)` | `sync_value` | `public/smart.js:openSmart` | L60 |
| `openSmart` | `function` | No | `(mode: string)` | `async -> promise` | `public/customer-profile.js:btn.onclick`, `public/guide-passport.js:renderGuidePassport$anon_L304_12`, `public/role-experience.js:applyFeatureControlsToDom`, `scripts/dev-workbench/debug-admin.js:jumpProvider` | L78 |
| `renderSuggestedTrailsView` | `function` | No | `()` | `void_or_implicit` | `public/smart.js:openSmart` | L134 |
| `renderFlavorFinderView` | `function` | No | `()` | `void_or_implicit` | `public/smart.js:openSmart` | L190 |
| `inSmartTown` | `function` | No | `(t: unknown, city: unknown)` | `sync_value` | `public/smart.js:findFlavor$anon_L287_10` | L226 |
| `matchesFinderCraving` | `function` | No | `(t: unknown, q: unknown)` | `sync_value` | `public/smart.js:findFlavor$anon_L287_10` | L231 |
| `findFlavor` | `function` | No | `(e: unknown)` | `void_or_implicit` | — | L282 |
| `buildFoodTrail` | `function` | No | `(e: unknown, opts: object)` | `async -> promise` | `public/smart.js:openSmart`, `public/smart.js:renderSuggestedTrailsView$anon_L176_8`, `public/smart.js:renderSuggestedTrailsView$anon_L183_9`, `public/smart.js:openSmartDeepLink` | L347 |
| `renderTrailPreview` | `function` | No | `(payload: unknown)` | `void_or_implicit` | `public/guide-passport.js:resetVisitJournalStateOnAuthChange`, `public/smart.js:buildFoodTrail` | L382 |
| `renderSavedTrailsList` | `function` | No | `()` | `async -> promise` | `public/guide-passport.js:resetVisitJournalStateOnAuthChange`, `public/smart.js:openSmart`, `public/smart.js:renderTrailPreview$anon_L514_26`, `public/smart.js:openSmartDeepLink` | L544 |
| `shareText` | `function` | No | `(title: unknown, text: unknown, url: unknown)` | `async -> promise` | `public/smart.js:shareSpot`, `public/smart.js:shareTrailByStopIds` | L721 |
| `shareSpot` | `function` | No | `(id: unknown)` | `async -> promise` | `public/smart.js:findFlavor$anon_L341_14$anon_L342_15`, `public/smart.js:renderOwnerPromo$anon_L854_49`, `public/smart.js:btn.onclick` | L740 |
| `shareTrailByStopIds` | `function` | No | `(stopIds: unknown)` | `async -> promise` | `public/smart.js:renderTrailPreview$anon_L508_24`, `public/smart.js:renderSavedTrailsList$anon_L680_36$anon_L681_37` | L751 |
| `getAuthorizedOwnerPromoListings` | `function` | No | `()` | `sync_value` | `public/smart.js:openOwnerMarketingKit` | L767 |
| `openOwnerMarketingKit` | `function` | No | `()` | `void_or_implicit` | `public/smart.js:openSmart` | L784 |
| `renderOwnerPromo` | `function` | No | `()` | `void_or_implicit` | `public/smart.js:openOwnerMarketingKit` | L816 |
| `copyOwnerPromo` | `function` | No | `()` | `async -> promise` | — | L857 |
| `downloadOwnerPromo` | `function` | No | `()` | `void_or_implicit` | — | L870 |
| `openDetail` | `function` | No | `(id: unknown, triggerEl: unknown)` | `void_or_implicit` | `public/app.js:applyFilters$anon_L1319_33$anon_L1329_34`, `public/app.js:openTruck`, `public/app.js:surpriseMe`, `public/community.js:communityViewPlace` | L930 |
| `openSmartDeepLink` | `function` | No | `()` | `async -> promise` | `public/smart.js:<top_level>` | L946 |

### [public/street-whispers.js](../../../public/street-whispers.js) (`script`)
- **Explicit Window / Reassigned Globals**: `streetQuizIndex` (browser_global_reassignment @ L99), `streetCurrentPick` (browser_global_reassignment @ L214), `streetMissionIndex` (browser_global_reassignment @ L240)
- **Significant Constants**: `streetMissions`

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `getStreetClueFiles` | `function` | No | `()` | `sync_value` | `public/street-whispers.js:streetNextClue`, `public/street-whispers.js:streetAnswerClue`, `public/street-whispers.js:streetRenderFiles`, `public/street-whispers.js:streetMysteryPick` | L7 |
| `streetEscape` | `function` | No | `(s: unknown)` | `sync_value` | `public/street-whispers.js:streetNextClue`, `public/street-whispers.js:streetNextClue$anon_L121_5`, `public/street-whispers.js:streetAnswerClue`, `public/street-whispers.js:streetRenderFiles$anon_L166_9` | L66 |
| `streetRandomIndex` | `function` | No | `(length: unknown, previous: unknown)` | `sync_value` | `public/street-whispers.js:streetNextClue`, `public/street-whispers.js:streetNextMission` | L72 |
| `getEligibleMissions` | `function` | No | `()` | `sync_value` | `public/street-whispers.js:streetNextMission` | L78 |
| `streetNextClue` | `function` | No | `()` | `void_or_implicit` | `public/street-whispers.js:streetInit` | L95 |
| `streetAnswerClue` | `function` | No | `(choice: unknown)` | `void_or_implicit` | `public/street-whispers.js:streetNextClue$anon_L131_6$anon_L132_7` | L136 |
| `streetRenderFiles` | `function` | No | `()` | `void_or_implicit` | `public/street-whispers.js:streetInit` | L160 |
| `streetOpenPlace` | `function` | No | `(id: unknown, triggerEl: unknown)` | `void_or_implicit` | `public/street-whispers.js:streetRenderFiles$anon_L190_10$anon_L191_11`, `public/street-whispers.js:streetMysteryPick$anon_L233_14` | L195 |
| `streetMysteryPick` | `function` | No | `()` | `void_or_implicit` | — | L208 |
| `streetNextMission` | `function` | No | `()` | `void_or_implicit` | — | L236 |
| `streetOpenWhisper` | `function` | No | `()` | `void_or_implicit` | — | L270 |
| `streetInit` | `function` | No | `()` | `void_or_implicit` | `public/street-whispers.js:<top_level>` | L277 |

### [public/sw.js](../../../public/sw.js) (`module`)

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `<top_level>$anon_L20_3` | `anonymous_function` | No | `(event: unknown)` | `void_or_implicit` | — | L20 |
| `<top_level>$anon_L60_4` | `anonymous_function` | No | `(event: unknown)` | `void_or_implicit` | — | L60 |

## 5. Operator & Build Scripts (`scripts/`)

### [scripts/bootstrap-top-admin.cjs](../../../scripts/bootstrap-top-admin.cjs) (`script`)
- **Imports / Dependencies**: `<dynamic_require>`, `node:crypto`, `node:fs`, `node:path`, `pg`
- **Significant Constants**: `fs`, `path`, `crypto`

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `parseEnvFile` | `function` | No | `(filePath: unknown)` | `sync_value` | `scripts/bootstrap-top-admin.cjs:main`, `scripts/manage-feature-controls.cjs:<top_level>$anon_L98_1`, `scripts/operator-read-my-otp.cjs:main` | L16 |
| `readCliEnvCompat` | `function` | No | `(suffix: unknown, fileEnv: object)` | `sync_value (throws: Error)` | `scripts/bootstrap-top-admin.cjs:requirePg`, `scripts/run-migrations.cjs:requirePg`, `scripts/run-migrations.cjs:parseArgs`, `scripts/run-pager-worker.cjs:parseArgs` | L35 |
| `requirePg` | `function` | No | `(fileEnv: unknown)` | `sync_value (throws: Error)` | `scripts/bootstrap-top-admin.cjs:main`, `scripts/manage-feature-controls.cjs:<top_level>$anon_L98_1`, `scripts/run-migrations.cjs:<top_level>$anon_L60_1` | L44 |
| `normalizeEmailStrict` | `function` | No | `(raw: unknown)` | `sync_value` | `scripts/bootstrap-top-admin.cjs:main`, `server/admin-routes.js:handleGovernanceApiRequest$anon_L978_11`, `server/admin-routes.js:handleGovernanceApiRequest`, `server/admin-routes.js:handleGovernanceApiRequest$anon_L4654_65` | L56 |
| `parseArgs` | `function` | No | `(argv: unknown)` | `sync_value (throws: Error)` | `scripts/bootstrap-top-admin.cjs:main`, `scripts/build-linux-release-tarball.cjs:<top_level>`, `scripts/manage-feature-controls.cjs:<top_level>$anon_L98_1`, `scripts/operator-read-my-otp.cjs:main` | L64 |
| `main` | `function` | No | `()` | `async -> promise (throws: Error, thrown_value)` | `scripts/bootstrap-top-admin.cjs:<top_level>`, `scripts/operator-read-my-otp.cjs:<top_level>`, `server/index.js:<top_level>` | L91 |

### [scripts/build-linux-release-tarball.cjs](../../../scripts/build-linux-release-tarball.cjs) (`script`)
- **Imports / Dependencies**: `node:child_process`, `node:crypto`, `node:fs`, `node:os`, `node:path`
- **Significant Constants**: `fs`, `os`, `path`, `crypto`, `ROOT`, `opts`, `fullSha`, `shortSha`, `baseName`, `tarballPath`, `sha256Path`, `archivedEntries`, `forbiddenMatches`, `requiredEntry`, `bytes`, `sha256`

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `parseArgs` | `function` | No | `(argv: unknown)` | `sync_value` | `scripts/bootstrap-top-admin.cjs:main`, `scripts/build-linux-release-tarball.cjs:<top_level>`, `scripts/manage-feature-controls.cjs:<top_level>$anon_L98_1`, `scripts/operator-read-my-otp.cjs:main` | L17 |
| `<top_level>$anon_L59_1` | `anonymous_function` | No | `(entry: unknown)` | `sync_value` | — | L59 |

### [scripts/dev-server.cjs](../../../scripts/dev-server.cjs) (`script`)
- **Imports / Dependencies**: `./seed-sql-reader.cjs`, `<dynamic_expr>`, `<dynamic_require>`, `node:async_hooks`, `node:crypto`, `node:fs`, `node:http`, `node:module`, `node:path`, `node:url`, `pg`
- **Explicit Window / Reassigned Globals**: `__BITESHARK_RUNTIME__` (explicit_window_property @ L647)
- **Significant Constants**: `http`, `fs`, `path`, `crypto`, `ROOT`, `PUBLIC_DIR`, `API_DIR`, `PORT`, `MIME`, `ROLE_USERS`, `requestAls`, `mockDb`, `mockAuth`, `extraNodeModules`, `loaderCode`, `routeCache`

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `createInitialStore` | `function` | No | `()` | `sync_value` | `scripts/dev-server.cjs:<top_level>$anon_L693_61`, `scripts/dev-server.cjs:<top_level>$anon_L693_61$anon_L698_62` | L46 |
| `parseCookies` | `function` | No | `(cookieHeader: unknown)` | `sync_value` | `scripts/dev-server.cjs:getRequestRole` | L82 |
| `getRequestRole` | `function` | No | `(req: unknown)` | `sync_value` | `scripts/dev-server.cjs:<top_level>$anon_L693_61$anon_L698_62` | L94 |
| `vendorDisplayName` | `function` | No | `(vendorId: unknown)` | `sync_value` | `scripts/dev-server.cjs:query$anon_L145_3`, `scripts/dev-server.cjs:query`, `scripts/dev-server.cjs:query$anon_L462_41` | L103 |
| `transaction` | `object_method` | No | `(fn: unknown)` | `async -> promise` | `lib/db-tx.js:withTransaction`, `packages/runtime-adapter/index.js:transaction`, `public/exploration-client.js:req.onsuccess` | L110 |
| `query` | `object_method` | No | `(sql: unknown, params: array)` | `async -> promise` | `api/bookings/create.js:default$anon_L147_1`, `api/bookings/list.js:default`, `api/community/list.js:default`, `api/community/mine.js:default$anon_L16_1` | L113 |
| `getUser` | `object_method` | No | `()` | `async -> promise` | `lib/authz.js:resolveIdentity`, `public/app.js:syncAuthAndUserData` | L615 |
| `query` | `object_method` | No | `(text: unknown, params: unknown)` | `sync_value` | `api/bookings/create.js:default$anon_L147_1`, `api/bookings/list.js:default`, `api/community/list.js:default`, `api/community/mine.js:default$anon_L16_1` | L629 |
| `transaction` | `object_method` | No | `(fn: unknown)` | `async -> promise (throws: thrown_value)` | `lib/db-tx.js:withTransaction`, `packages/runtime-adapter/index.js:transaction`, `public/exploration-client.js:req.onsuccess` | L630 |
| `query` | `object_method` | No | `(...args: array)` | `sync_value` | `api/bookings/create.js:default$anon_L147_1`, `api/bookings/list.js:default`, `api/community/list.js:default`, `api/community/mine.js:default$anon_L16_1` | L649 |
| `transaction` | `object_method` | No | `(fn: unknown)` | `sync_value` | `lib/db-tx.js:withTransaction`, `packages/runtime-adapter/index.js:transaction`, `public/exploration-client.js:req.onsuccess` | L650 |
| `loadRoute` | `function` | No | `(filePath: unknown)` | `async -> promise` | `scripts/dev-server.cjs:<top_level>$anon_L693_61$anon_L698_62` | L668 |
| `resolveApiRoute` | `function` | No | `(pathname: unknown)` | `sync_value` | `scripts/dev-server.cjs:<top_level>$anon_L693_61$anon_L698_62` | L680 |
| `<top_level>$anon_L693_61` | `anonymous_function` | No | `()` | `async -> promise` | — | L693 |

### [scripts/dev-workbench/debug-admin.js](../../../scripts/dev-workbench/debug-admin.js) (`module`)
- **Explicit Window / Reassigned Globals**: `__BITESHARK__` (explicit_window_property @ L125), `__BITESHARK__.user` (explicit_window_property @ L126), `__trucklyFetchWrapped` (explicit_window_property @ L132), `fetch` (explicit_window_property @ L134), `trucklyDebug` (explicit_window_property @ L716)

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `<top_level>$anon_L5_1` | `anonymous_function` | No | `()` | `void_or_implicit` | — | L5 |

### [scripts/manage-feature-controls.cjs](../../../scripts/manage-feature-controls.cjs) (`script`)
- **Imports / Dependencies**: `<dynamic_expr>`, `<dynamic_require>`, `node:fs`, `node:path`, `node:url`, `pg`
- **Significant Constants**: `fs`, `path`

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `parseEnvFile` | `function` | No | `(filePath: unknown)` | `sync_value` | `scripts/bootstrap-top-admin.cjs:main`, `scripts/manage-feature-controls.cjs:<top_level>$anon_L98_1`, `scripts/operator-read-my-otp.cjs:main` | L19 |
| `requirePg` | `function` | No | `(fileEnv: object)` | `sync_value (throws: Error)` | `scripts/bootstrap-top-admin.cjs:main`, `scripts/manage-feature-controls.cjs:<top_level>$anon_L98_1`, `scripts/run-migrations.cjs:<top_level>$anon_L60_1` | L38 |
| `maskEmail` | `function` | No | `(email: unknown)` | `sync_value` | `scripts/manage-feature-controls.cjs:<top_level>$anon_L98_1`, `server/admin-routes.js:handleGovernanceApiRequest$anon_L978_11`, `server/admin-routes.js:handleGovernanceApiRequest$anon_L4191_50$anon_L4262_51`, `server/admin-routes.js:handleGovernanceApiRequest$anon_L5521_70$anon_L5536_71` | L53 |
| `parseArgs` | `function` | No | `(argv: unknown)` | `sync_value (throws: Error)` | `scripts/bootstrap-top-admin.cjs:main`, `scripts/build-linux-release-tarball.cjs:<top_level>`, `scripts/manage-feature-controls.cjs:<top_level>$anon_L98_1`, `scripts/operator-read-my-otp.cjs:main` | L59 |
| `<top_level>$anon_L98_1` | `anonymous_function` | No | `()` | `async -> promise (throws: Error, thrown_value)` | — | L98 |

### [scripts/operator-read-my-otp.cjs](../../../scripts/operator-read-my-otp.cjs) (`script`)
- **Imports / Dependencies**: `node:fs`
- **Significant Constants**: `fs`

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `parseEnvFile` | `function` | No | `(filePath: unknown)` | `sync_value` | `scripts/bootstrap-top-admin.cjs:main`, `scripts/manage-feature-controls.cjs:<top_level>$anon_L98_1`, `scripts/operator-read-my-otp.cjs:main` | L13 |
| `parseArgs` | `function` | No | `(argv: unknown)` | `sync_value (throws: Error)` | `scripts/bootstrap-top-admin.cjs:main`, `scripts/build-linux-release-tarball.cjs:<top_level>`, `scripts/manage-feature-controls.cjs:<top_level>$anon_L98_1`, `scripts/operator-read-my-otp.cjs:main` | L32 |
| `main` | `function` | No | `()` | `async -> promise (throws: Error)` | `scripts/bootstrap-top-admin.cjs:<top_level>`, `scripts/operator-read-my-otp.cjs:<top_level>`, `server/index.js:<top_level>` | L59 |

### [scripts/run-migrations.cjs](../../../scripts/run-migrations.cjs) (`script`)
- **Imports / Dependencies**: `<dynamic_require>`, `node:crypto`, `node:fs`, `node:path`, `pg`
- **Significant Constants**: `fs`, `path`, `crypto`, `ROOT`, `MIGRATIONS_DIR`

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `readCliEnvCompat` | `function` | No | `(suffix: unknown, { securityCritical }: object)` | `sync_value (throws: Error)` | `scripts/bootstrap-top-admin.cjs:requirePg`, `scripts/run-migrations.cjs:requirePg`, `scripts/run-migrations.cjs:parseArgs`, `scripts/run-pager-worker.cjs:parseArgs` | L15 |
| `requirePg` | `function` | No | `()` | `sync_value (throws: Error)` | `scripts/bootstrap-top-admin.cjs:main`, `scripts/manage-feature-controls.cjs:<top_level>$anon_L98_1`, `scripts/run-migrations.cjs:<top_level>$anon_L60_1` | L29 |
| `parseArgs` | `function` | No | `(argv: unknown)` | `sync_value` | `scripts/bootstrap-top-admin.cjs:main`, `scripts/build-linux-release-tarball.cjs:<top_level>`, `scripts/manage-feature-controls.cjs:<top_level>$anon_L98_1`, `scripts/operator-read-my-otp.cjs:main` | L41 |
| `assertSafeIdentifier` | `function` | No | `(ident: unknown, label: unknown)` | `sync_value (throws: Error)` | `scripts/run-migrations.cjs:<top_level>$anon_L60_1` | L53 |
| `<top_level>$anon_L60_1` | `anonymous_function` | No | `()` | `async -> promise (throws: Error, thrown_value)` | — | L60 |

### [scripts/run-pager-worker.cjs](../../../scripts/run-pager-worker.cjs) (`script`)
- **Imports / Dependencies**: `<dynamic_expr>`, `<dynamic_require>`, `node:fs`, `node:path`, `node:url`, `pg`
- **Significant Constants**: `fs`, `path`

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `readCliEnvCompat` | `function` | No | `(suffix: unknown, { securityCritical, defaultValue }: object)` | `sync_value (throws: Error)` | `scripts/bootstrap-top-admin.cjs:requirePg`, `scripts/run-migrations.cjs:requirePg`, `scripts/run-migrations.cjs:parseArgs`, `scripts/run-pager-worker.cjs:parseArgs` | L19 |
| `parseArgs` | `function` | No | `(argv: unknown)` | `sync_value` | `scripts/bootstrap-top-admin.cjs:main`, `scripts/build-linux-release-tarball.cjs:<top_level>`, `scripts/manage-feature-controls.cjs:<top_level>$anon_L98_1`, `scripts/operator-read-my-otp.cjs:main` | L33 |
| `requestStop` | `function` | No | `(signal: unknown)` | `void_or_implicit` | `scripts/run-pager-worker.cjs:<top_level>$anon_L71_1`, `scripts/run-pager-worker.cjs:<top_level>$anon_L72_2` | L62 |
| `sleepInterruptible` | `function` | No | `(ms: unknown)` | `promise` | `scripts/run-pager-worker.cjs:<top_level>$anon_L89_5` | L74 |
| `<top_level>$anon_L89_5` | `anonymous_function` | No | `()` | `async -> promise (throws: Error, thrown_value)` | — | L89 |

### [scripts/seed-sql-reader.cjs](../../../scripts/seed-sql-reader.cjs) (`script`)
- **Imports / Dependencies**: `node:fs`, `node:path`
- **Exports**: `module.exports`
- **Significant Constants**: `fs`, `path`, `COLUMNS`

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `parseSqlValue` | `function` | No | `(token: unknown)` | `sync_value (throws: Error)` | `scripts/seed-sql-reader.cjs:loadSeedVendorsFromMigration014` | L48 |
| `splitTupleTokens` | `function` | No | `(tupleBody: unknown)` | `sync_value` | `scripts/seed-sql-reader.cjs:loadSeedVendorsFromMigration014` | L99 |
| `loadSeedVendorsFromMigration014` | `function` | No | `(rootDir: unknown)` | `sync_value (throws: Error)` | `scripts/dev-server.cjs:createInitialStore` | L145 |

### [scripts/staging-runtime-probe.js](../../../scripts/staging-runtime-probe.js) (`module`)
- **Imports / Dependencies**: `../lib/authz.js`, `../lib/db-tx.js`, `../lib/env-compat.js`, `../lib/webpush-crypto.js`, `@biteshark/runtime-adapter`, `node:crypto`
- **Exports**: `access`, `methods`, `default`
- **Significant Constants**: `access` *(exported)*, `methods` *(exported)*

| Symbol | Kind | Exported | Parameters (Observed Type) | Returns / Throws | Observed Callers (Sample) | Line |
|---|---|---|---|---|---|---:|
| `timingSafeMatch` | `function` | No | `(a: unknown, b: unknown)` | `sync_value` | `scripts/staging-runtime-probe.js:default` | L22 |
| `runWebPushCryptoSelfTest` | `function` | No | `()` | `sync_value` | `scripts/staging-runtime-probe.js:default` | L29 |
| `default` | `function` | Yes | `(req: unknown, res: unknown)` | `async -> promise (throws: thrown_value)` | `server/app.js:createStandaloneServer$anon_L546_3$anon_L872_4$anon_L873_5` | L56 |
