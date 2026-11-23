# Code Registry — High-Value Shared Contracts Catalog

> [!NOTE]
> **Machine-Generated Reference Inventory** — Do not hand-edit. Regenerate via `npm run registry:docs` (`node tools/code-registry/cli.mjs generate-docs`).
> - **Repository**: `https://github.com/yamanalmasaleha-png/trukly-`
> - **Provenance Mode**: `committed_source_digest` *(branch/detached-HEAD invariant; commit-bound runs use `npm run registry:scan -- --include-timestamp`)*
> - **Generator**: `biteshark-code-registry@2.0.0` (`biteshark.code-registry.v2`)
> - **Source Analysis Digest**: `c7326f45a26b8a8d55f356372108471d7be2d6b3ff831e3f1c1b164340723c08`
> - **Analysis Scope & Limits**: Static AST, HTML, CSS, and SQL analysis without executing application modules. Relationships distinguish confirmed_static, documented_wrapper, inferred_candidate, and dynamic_unresolved; static analysis does not prove runtime behavioral correctness.

Generated from the single maintained contract specification [shared-contracts.json](../contracts/shared-contracts.json) (**13** shared contracts). Do not duplicate these signatures, route lists, or field definitions in prose docs — link here or query `npm run registry:locate -- <CONTRACT_ID>`.

| Contract ID | Domain | Title | Primary Implementation Symbols | HTTP Routes |
|---|---|---|---|---|
| `CTR-DB-TX-SESSION` | `backend-foundation` | Pinned PostgreSQL Transaction, Session Row-Locking & Local GUC Context | `lib/db-tx.js#withTransaction`, `lib/db-tx.js#verifySessionAndEligibilityInTx`, `lib/db-tx.js#respondIfSessionEligibilityError` | — |
| `CTR-AUTH-SESSION-OTP` | `auth-and-email` | Standalone Email OTP Sign-In, HttpOnly Session Cookie & CSRF Origin Verification | `lib/standalone-auth.js#startEmailOtpChallenge`, `lib/standalone-auth.js#verifyEmailOtpChallenge`, `lib/standalone-auth.js#resolveSessionFromRequest` | `/api/auth/start`, `/api/auth/verify`, `/api/auth/session`, `/api/auth/logout` |
| `CTR-AGE-ELIGIBILITY` | `legal-and-readiness` | Minimum Account Age (14+ Pacific Civil Date) & Pending-Assessment Allowlist | `lib/age-policy.js#evaluateMinimumAgeEligibility`, `lib/age-policy.js#parseAndValidateDobInput`, `lib/age-policy.js#isGovernanceRouteExemptFromAgeGate` | `/api/auth/age-assessment`, `/api/account/context` |
| `CTR-AUTHZ-RBAC-VENDOR` | `vendor-onboarding-and-admin` | Five-Role RBAC, Row-Locked Tx Re-Verification, Act-on-Behalf & Audit Logging | `lib/authz.js#loadAccessContext`, `lib/authz.js#authorizeVendorTarget`, `lib/authz.js#authorizeVendorScope` | `/api/account/context`, `/api/vendor/members`, `/api/vendor/staff-invitations`, `/api/admin/accounts` |
| `CTR-FEATURE-CONTROLS` | `feature-controls` | Runtime Feature Controls DAG, HTTP Route Gate & Browser Sync | `lib/feature-controls.js#evaluateFeatureControlsSnapshot`, `lib/feature-controls.js#enforceHttpFeatureGate`, `lib/feature-controls.js#updateFeatureControlInTx` | `/api/features`, `/api/admin/features`, `/api/admin/features/update` |
| `CTR-DIAGNOSTICS-PIPELINE` | `diagnostics` | Redacted Operational Diagnostics, Incident Fingerprinting & Bounded Client Fetch | `lib/diagnostics.js#recordDiagnosticEvent`, `lib/diagnostics.js#computeIncidentFingerprint`, `lib/diagnostics.js#cleanupExpiredDiagnostics` | `/api/diagnostics/report`, `/api/admin/diagnostics`, `/api/admin/diagnostics/detail`, `/api/admin/diagnostics/triage` |
| `CTR-DISCOVERY-CATALOG` | `discovery-catalog` | Unified Sonoma Discovery Catalog, Pacific Live/Schedule Precedence & Card Rendering | `lib/discovery.js#loadDiscoveryCatalog`, `lib/discovery.js#isVendorPubliclyDiscoverable`, `lib/discovery.js#evaluateSchedulePrecedence` | `/api/trucks`, `/api/trucks/:id`, `/api/trucks/nearby`, `/api/trucks/search` |
| `CTR-CUSTOMER-EXPLORATION` | `visits-and-passport` | Account-Backed Customer Exploration: Stories, Visit Journal, Badges, Challenges, Trails & Legacy Import | `lib/customer-exploration.js#getExplorationSummary`, `lib/customer-exploration.js#logUserVisit`, `lib/customer-exploration.js#buildSuggestedTrail` | `/api/stories`, `/api/trails/suggest`, `/api/me/exploration`, `/api/me/exploration/import` |
| `CTR-PRIVATE-PHOTO-STORAGE` | `photos` | Private Confined Photo Derivatives, EXIF Stripping & Orphan Reconciliation | `lib/photo-storage.js#verifyAndNormalizeUploadedPhoto`, `lib/photo-storage.js#writePhotoDerivativesAtomically`, `lib/photo-storage.js#readPhotoDerivativeSafely` | `/api/me/photos`, `/api/me/photos/file`, `/api/me/photos/delete` |
| `CTR-SUPPORT-TICKETS` | `support-and-feedback` | Support & Feedback Tickets, Sharing Scope & Connected Incident Links | `lib/support-tickets.js#serializeSupportTicketForReporter`, `lib/support-tickets.js#validateStaffStatusTransition`, `lib/support-tickets.js#autoSuggestDiagnosticLinksInTx` | `/api/issues`, `/api/issues/reply`, `/api/issues/reopen`, `/api/issues/read` |
| `CTR-PAGER-WEBPUSH` | `pager-and-notifications` | Pickup Pagers, Web Push Subscriptions & Lease-Fenced Outbox Worker | `lib/pager-notifications.js#handlePagerTransitionNotificationsInTx`, `lib/pager-notifications.js#runNotificationWorkerBatch`, `lib/pager-notifications.js#verifySameOriginMutation` | `/api/pager/staff`, `/api/pager/status`, `/api/pager/subscriptions`, `/api/pager/update` |
| `CTR-RELEASE-MIGRATION-DEPLOY` | `release-and-deploy` | Immutable SQL Migration Checksums, Release Tarball Packaging & Atomic Staging Installer | `scripts/run-migrations.cjs#parseArgs`, `scripts/build-linux-release-tarball.cjs#parseArgs` | `/api/healthz` |
| `CTR-CUSTOMER-PROFILE-SHARING` | `customer-profile-and-sharing` | Private Customer Profile Dashboard, Greatest Hits Collections & Revocable Unlisted Sharing | `lib/customer-profile.js#getPrivateOwnerProfile`, `lib/customer-profile.js#updatePrivateOwnerProfile`, `lib/customer-profile.js#createOwnerCollection` | `/api/me/profile`, `/api/me/preferences`, `/api/me/profile/privacy`, `/api/me/profile/delete-data` |

## `CTR-DB-TX-SESSION` — Pinned PostgreSQL Transaction, Session Row-Locking & Local GUC Context
- **Domain**: `backend-foundation` | **Shape Basis**: `declared_exports_and_runtime_guards`
- **Purpose**: Pins a single pg.Client connection per transaction, enforces deterministic FOR SHARE locking on auth_users -> auth_sessions when governance session verification is active, scopes SET LOCAL app.* RLS GUCs, and clears verification state on commit/rollback.
- **Implementation Symbols**: [lib/db-tx.js](../../../lib/db-tx.js) (`#withTransaction`), [lib/db-tx.js](../../../lib/db-tx.js) (`#verifySessionAndEligibilityInTx`), [lib/db-tx.js](../../../lib/db-tx.js) (`#respondIfSessionEligibilityError`), [packages/runtime-adapter/index.js](../../../packages/runtime-adapter/index.js) (`#default`)
- **Database Tables / Storage**: `auth_users`, `auth_sessions`
- **Permissions & Ownership**: Mandatory foundation for all FORCE ROW LEVEL SECURITY mutations and live RBAC re-verification.
- **Inputs & Validation**: (dbAdapter, async fn(tx)) — acquires dedicated client via db.connect(), starts BEGIN, and if governance context sets requireEligibleSessionInTx, verifies active non-disabled 14+-eligible user and non-revoked session before executing fn(tx).
- **Outputs**: Promise resolving to the return value of fn(tx) after COMMIT (inferred per caller; plain JS).
- **Error Contract**: Throws SessionEligibilityError (401 SESSION_REVOKED / ACCOUNT_DISABLED or 403 AGE_ASSESSMENT_REQUIRED) after ROLLBACK when session/account state changed mid-flight; rethrows domain or pg errors after ROLLBACK.
- **Side Effects**: Executes BEGIN/COMMIT/ROLLBACK on a dedicated pg.Client; scopes all SET LOCAL / set_config(..., true) GUC mutations strictly to the transaction.
- **Idempotency & Concurrency**: Prevents deadlocks by acquiring FOR SHARE locks in canonical order (auth_users before auth_sessions, before platform_roles / vendor_memberships / domain rows).
- **Known Consumers**: `server/admin-routes.js`, `lib/customer-exploration.js`, `api/bookings/create.js`, `api/owner/profile.js`, `api/pager/staff.js`
- **Compatibility Expectations**: Signature withTransaction(db, fn) and SessionEligibilityError properties (.status, .code) are stable cross-cutting invariants.
- **Known Limitations**: Read-only public catalog queries that do not set app.* GUCs may use pooled db.query directly; never call set_config(..., false) on an unpinned pool query.
- **Maintained Test Mappings** *(source mapping only — run suite to verify execution)*:
  - [tests/backend-hardening.integration.cjs](../../../tests/backend-hardening.integration.cjs) — protects: `authentication`, `ownership_rls`, `concurrency_locking`
  - [tests/urgent-pilot-security.integration.cjs](../../../tests/urgent-pilot-security.integration.cjs) — protects: `authentication`, `role_restrictions`, `concurrency_locking`

## `CTR-AUTH-SESSION-OTP` — Standalone Email OTP Sign-In, HttpOnly Session Cookie & CSRF Origin Verification
- **Domain**: `auth-and-email` | **Shape Basis**: `validated_runtime_checks_and_sql_schema`
- **Purpose**: Manages passwordless 6-digit email OTP challenges (HMAC-SHA256), Resend HTTPS delivery, sliding HttpOnly session cookies (bs_session / __Host-bs_session), same-origin mutation CSRF checks, and sign-out cleanup.
- **Implementation Symbols**: [lib/standalone-auth.js](../../../lib/standalone-auth.js) (`#startEmailOtpChallenge`), [lib/standalone-auth.js](../../../lib/standalone-auth.js) (`#verifyEmailOtpChallenge`), [lib/standalone-auth.js](../../../lib/standalone-auth.js) (`#resolveSessionFromRequest`), [lib/standalone-auth.js](../../../lib/standalone-auth.js) (`#revokeSessionFromRequest`), [lib/standalone-auth.js](../../../lib/standalone-auth.js) (`#verifySameOriginMutationRequest`), [public/auth-client.js](../../../public/auth-client.js) (`#default`)
- **HTTP Routes**: `/api/auth/start`, `/api/auth/verify`, `/api/auth/session`, `/api/auth/logout`, `/api/auth/staging-mailbox`, `/api/admin/email-readiness`
- **Database Tables / Storage**: `auth_users`, `auth_otp_challenges`, `auth_sessions`, `auth_rate_limits`, `auth_delivery_telemetry`
- **Permissions & Ownership**: Session cookies are HttpOnly, SameSite=Lax, Secure on HTTPS; /api/auth/staging-mailbox requires loopback/flag + operator mailbox secret; /api/admin/email-readiness is Admin: Top only.
- **Inputs & Validation**: POST /api/auth/start validates normalized email, X-BiteShark-Auth-Client header, rate limits, staging recipient allowlist (when staging), and 14+ DOB on new-account signup without persisting raw DOB. POST /api/auth/verify validates 6-digit OTP and challenge attempt cap.
- **Outputs**: Validated JSON envelopes ({ ok, status, delivery_mode } on start; { ok, authenticated, user, requires_age_assessment } on verify/session) plus Set-Cookie headers.
- **Error Contract**: 400 validation errors, 403 CSRF_ORIGIN_DENIED / UNDER_MINIMUM_AGE / STAGING_RECIPIENT_RESTRICTED, 429 rate-limit responses with Retry-After, 503 delivery unavailability.
- **Side Effects**: Writes hashed OTP/session rows, records redacted auth_delivery_telemetry, dispatches Resend HTTPS email when BITESHARK_AUTH_DELIVERY_MODE=resend, and clears client-scoped caches on sign-out via biteshark:auth-signed-out.
- **Idempotency & Concurrency**: OTP consumption locks challenge row FOR UPDATE so a code can succeed at most once; logout revokes server session idempotently.
- **Known Consumers**: `server/app.js`, `public/login.html`, `public/auth-client.js`, `public/app.js`, `public/role-experience.js`
- **Compatibility Expectations**: Cookie names, CSRF header/Origin semantics, and /api/auth/session user projection are shared across /, /login.html, and /admin.
- **Known Limitations**: Staging Resend mode intentionally restricts recipients to allowlisted emails/domains unless existing eligible staff/vendor account.
- **Maintained Test Mappings** *(source mapping only — run suite to verify execution)*:
  - [tests/standalone-runtime-auth.integration.cjs](../../../tests/standalone-runtime-auth.integration.cjs) — protects: `authentication`, `input_validation`, `response_shape`, `concurrency_locking`
  - [tests/auth-email-delivery.integration.cjs](../../../tests/auth-email-delivery.integration.cjs) — protects: `authentication`, `role_restrictions`, `input_validation`, `response_shape`
  - [tests/urgent-pilot-security-browser.e2e.cjs](../../../tests/urgent-pilot-security-browser.e2e.cjs) — protects: `authentication`, `ownership_rls`

## `CTR-AGE-ELIGIBILITY` — Minimum Account Age (14+ Pacific Civil Date) & Pending-Assessment Allowlist
- **Domain**: `legal-and-readiness` | **Shape Basis**: `validated_runtime_checks_and_sql_schema`
- **Purpose**: Evaluates 14+ minimum account age in America/Los_Angeles civil calendar dates (with Feb 29 -> Mar 1 non-leap birthday rule), stores zero raw DOB fields, and blocks unassessed accounts outside the narrow governance allowlist.
- **Implementation Symbols**: [lib/age-policy.js](../../../lib/age-policy.js) (`#evaluateMinimumAgeEligibility`), [lib/age-policy.js](../../../lib/age-policy.js) (`#parseAndValidateDobInput`), [lib/age-policy.js](../../../lib/age-policy.js) (`#isGovernanceRouteExemptFromAgeGate`), [lib/standalone-auth.js](../../../lib/standalone-auth.js) (`#submitExistingAccountAgeAssessment`)
- **HTTP Routes**: `/api/auth/age-assessment`, `/api/account/context`
- **Database Tables / Storage**: `auth_users`
- **Permissions & Ownership**: Enforced centrally in server/app.js and inside withTransaction(verifySessionAndEligibilityInTx).
- **Inputs & Validation**: Accepts { dob: 'YYYY-MM-DD' } or { dob_year, dob_month, dob_day }; validates real Gregorian date >= 1900 and not in the future in America/Los_Angeles.
- **Outputs**: Derived eligibility status ('eligible_14_plus' or 'ineligible_under_14') and AGE_POLICY_VERSION without echoing DOB.
- **Error Contract**: 403 AGE_ASSESSMENT_REQUIRED on gated endpoints while not_assessed; 403 UNDER_MINIMUM_AGE (disabling existing account and revoking sessions + setting cooldown cookie) when < 14.
- **Side Effects**: Persists only age_eligibility_status, age_assessed_at, and age_policy_version on auth_users; never logs or stores raw DOB.
- **Idempotency & Concurrency**: Already-eligible accounts bypass reassessment; under-14 submission atomically disables account and revokes all active sessions.
- **Known Consumers**: `server/app.js`, `lib/standalone-auth.js`, `lib/db-tx.js`, `public/login.html`
- **Compatibility Expectations**: EXEMPT_GOVERNANCE_METHODS_BY_PATH must remain minimal (auth bootstrap, public stories/trails/features, invitation preview, and privacy/accessibility/account-access support tickets).
- **Known Limitations**: Proposed 14+ policy is marked pending formal legal counsel sign-off in compliance_readiness_items.
- **Maintained Test Mappings** *(source mapping only — run suite to verify execution)*:
  - [tests/legal-readiness.integration.cjs](../../../tests/legal-readiness.integration.cjs) — protects: `authentication`, `role_restrictions`, `input_validation`, `response_shape`
  - [tests/legal-readiness-browser.e2e.cjs](../../../tests/legal-readiness-browser.e2e.cjs) — protects: `authentication`, `input_validation`

## `CTR-AUTHZ-RBAC-VENDOR` — Five-Role RBAC, Row-Locked Tx Re-Verification, Act-on-Behalf & Audit Logging
- **Domain**: `vendor-onboarding-and-admin` | **Shape Basis**: `validated_runtime_checks_and_sql_schema`
- **Purpose**: Enforces Customer, Vendor Staff, Vendor Owner, Admin: Mod, and Admin: Top permissions, live row-locked re-verification inside transactions, Top-only Act-on-Behalf support reasons, and redacted audit_logs entries.
- **Implementation Symbols**: [lib/authz.js](../../../lib/authz.js) (`#loadAccessContext`), [lib/authz.js](../../../lib/authz.js) (`#authorizeVendorTarget`), [lib/authz.js](../../../lib/authz.js) (`#authorizeVendorScope`), [lib/authz.js](../../../lib/authz.js) (`#reverifyVendorMembershipInTx`), [lib/authz.js](../../../lib/authz.js) (`#reverifyModeratorInTx`), [lib/authz.js](../../../lib/authz.js) (`#reverifyPlatformAdminInTx`), [lib/authz.js](../../../lib/authz.js) (`#recordAuditLog`)
- **HTTP Routes**: `/api/account/context`, `/api/vendor/members`, `/api/vendor/staff-invitations`, `/api/admin/accounts`, `/api/admin/accounts/role`, `/api/admin/accounts/status`, `/api/admin/vendors/update`, `/api/admin/test-customer`, `/api/admin/style-guide`, `/api/admin/style-guide/doc`, `/api/admin/style-guide/save`, `/api/admin/style-guide/reset`, `/api/admin/style-guide/push`
- **Database Tables / Storage**: `platform_roles`, `vendor_memberships`, `vendors`, `account_invitations`, `audit_logs`
- **Feature Controls**: `vendor_onboarding`
- **Permissions & Ownership**: Admin: Mod can triage/recommend but cannot grant roles, approve vendor onboarding finalization, or mutate feature controls; last eligible Admin: Top cannot be removed or suspended.
- **Inputs & Validation**: reverify*InTx locks auth_users / platform_roles / vendor_memberships FOR SHARE (and vendors FOR NO KEY UPDATE when required); Act-on-Behalf requires X-BiteShark-Act-On-Behalf + 8-240 char X-BiteShark-Support-Reason from Admin: Top.
- **Outputs**: Structured { ok, actorRole, vendorId } or { ok: false, status, code, error } decision objects.
- **Error Contract**: 401 unauthenticated/revoked, 403 TOP_ADMIN_REQUIRED / ACT_ON_BEHALF_FORBIDDEN / SELF_ROLE_CHANGE_FORBIDDEN / LAST_TOP_ADMIN_REQUIRED / vendor restriction errors.
- **Side Effects**: Appends immutable audit_logs rows (REVOKE UPDATE, DELETE enforced on runtime app role).
- **Idempotency & Concurrency**: Uses pg_advisory_xact_lock('biteshark_platform_roles_mutation') and row locks to prevent concurrent last-Top removal races.
- **Known Consumers**: `server/admin-routes.js`, `api/owner/profile.js`, `api/owner/location.js`, `api/owner/schedule.js`, `api/owner/requests.js`, `api/pager/staff.js`, `api/pager/update.js`, `api/community/moderate.js`
- **Compatibility Expectations**: Role labels ('Admin: Top', 'Admin: Mod', 'Vendor Owner', 'Vendor Staff', 'Customer') and audit_logs immutability must be preserved.
- **Known Limitations**: api/favorites/toggle.js currently passes 'favorites' to isWritePaused (tracked in KNOWN-DRIFT.md).
- **Maintained Test Mappings** *(source mapping only — run suite to verify execution)*:
  - [tests/admin-governance.integration.cjs](../../../tests/admin-governance.integration.cjs) — protects: `authentication`, `role_restrictions`, `ownership_rls`, `concurrency_locking`
  - [tests/invitation-workflow.integration.cjs](../../../tests/invitation-workflow.integration.cjs) — protects: `authentication`, `role_restrictions`, `idempotency`, `input_validation`
  - [tests/admin-test-customer.integration.cjs](../../../tests/admin-test-customer.integration.cjs) — protects: `authentication`, `role_restrictions`, `ownership_rls`, `response_shape`
  - [tests/style-guide-admin.integration.cjs](../../../tests/style-guide-admin.integration.cjs) — protects: `authentication`, `role_restrictions`, `input_validation`, `response_shape`

## `CTR-FEATURE-CONTROLS` — Runtime Feature Controls DAG, HTTP Route Gate & Browser Sync
- **Domain**: `feature-controls` | **Shape Basis**: `validated_runtime_checks_and_sql_schema`
- **Purpose**: Governs runtime feature availability (enabled, paused, hidden) and audience (all, staff_beta) with cycle-free parent-child dependency propagation, optimistic revision concurrency, CLI break-glass recovery, and Cross-Tab BroadcastChannel sync.
- **Implementation Symbols**: [lib/feature-controls.js](../../../lib/feature-controls.js) (`#evaluateFeatureControlsSnapshot`), [lib/feature-controls.js](../../../lib/feature-controls.js) (`#enforceHttpFeatureGate`), [lib/feature-controls.js](../../../lib/feature-controls.js) (`#updateFeatureControlInTx`), [public/role-experience.js](../../../public/role-experience.js) (`#isFeatureAvailable`), [public/role-experience.js](../../../public/role-experience.js) (`#isFeatureHidden`)
- **HTTP Routes**: `/api/features`, `/api/admin/features`, `/api/admin/features/update`
- **Database Tables / Storage**: `feature_controls`, `feature_control_history`
- **Feature Controls**: `event_inquiries`, `community_hub`, `community_submissions`, `local_guides_passport`, `editorial_stories`, `visit_journal`, `private_photos`, `exploration_badges`, `weekly_challenges`, `suggested_trails`, `customer_profile`, `customer_profile_editing`, `greatest_hits_collections`, `unlisted_collection_sharing`, `shared_collection_photos`, `public_profile_discovery`, `admin_style_guide_workspace`
- **Permissions & Ownership**: Public caller projection on GET /api/features; Admin: Mod or Top read on GET /api/admin/features; Admin: Top only on POST /api/admin/features/update (blocked during Viewpoint Preview).
- **Inputs & Validation**: POST /api/admin/features/update requires Admin: Top, expected_revision (non-negative integer), valid allowed_states / allowed_audiences, 4-500 char reason, and confirm_interrupt=true on high-impact interrupts.
- **Outputs**: GET /api/features returns caller-safe effective states { ok: true, features } with zero internal reasons/actors; /api/admin/features adds revision, dependency graph, env overrides, and history.
- **Error Contract**: 503 FEATURE_PAUSED (when paused on mutation routes), 403 FEATURE_DISABLED (when hidden), 409 REVISION_CONFLICT on stale expected_revision, 503 fail-closed on corrupted persisted rows.
- **Side Effects**: Updates feature_controls, appends feature_control_history + audit_logs, and broadcasts biteshark_feature_controls_v1 across open browser tabs.
- **Idempotency & Concurrency**: Optimistic concurrency via expected_revision + FOR UPDATE row lock; 0ms server-side cache ensures immediate enforcement across workers.
- **Known Consumers**: `server/app.js`, `server/admin-routes.js`, `server/customer-exploration-routes.js`, `scripts/feature-controls-cli.cjs`, `public/role-experience.js`, `public/admin.js`
- **Compatibility Expectations**: Disabling or hiding a feature never deletes underlying customer or vendor rows; self-service account export and deletion endpoints remain exempt.
- **Known Limitations**: Client UI checks via window.bitesharkFeatures are presentation-only; server routes must also register in ROUTE_FEATURE_ENFORCEMENT_RULES.
- **Maintained Test Mappings** *(source mapping only — run suite to verify execution)*:
  - [tests/feature-controls.integration.cjs](../../../tests/feature-controls.integration.cjs) — protects: `role_restrictions`, `feature_disabled`, `concurrency_locking`, `response_shape`
  - [tests/feature-controls-browser.e2e.cjs](../../../tests/feature-controls-browser.e2e.cjs) — protects: `feature_disabled`, `role_restrictions`

## `CTR-DIAGNOSTICS-PIPELINE` — Redacted Operational Diagnostics, Incident Fingerprinting & Bounded Client Fetch
- **Domain**: `diagnostics` | **Shape Basis**: `validated_runtime_checks_and_sql_schema`
- **Purpose**: Captures server, worker, and rate-limited untrusted client operational failures with strict PII/token redaction, release SHA attribution, incident-group deduplication, and bounded client fetch timeouts.
- **Implementation Symbols**: [lib/diagnostics.js](../../../lib/diagnostics.js) (`#recordDiagnosticEvent`), [lib/diagnostics.js](../../../lib/diagnostics.js) (`#computeIncidentFingerprint`), [lib/diagnostics.js](../../../lib/diagnostics.js) (`#cleanupExpiredDiagnostics`), [public/diagnostics-client.js](../../../public/diagnostics-client.js) (`#fetchJsonBounded`), [public/diagnostics-client.js](../../../public/diagnostics-client.js) (`#reportClientDiagnostic`)
- **HTTP Routes**: `/api/diagnostics/report`, `/api/admin/diagnostics`, `/api/admin/diagnostics/detail`, `/api/admin/diagnostics/triage`, `/api/admin/diagnostics/note`, `/api/admin/diagnostics/synthetic-test`, `/api/admin/diagnostics/cleanup`
- **Database Tables / Storage**: `diagnostic_event_samples`, `diagnostic_incident_groups`, `diagnostic_incident_notes`, `diagnostic_releases`, `worker_runtime_heartbeats`
- **Permissions & Ownership**: Admin: Mod sees non-Top feature keys with coarse actor state; Admin: Top sees full redacted incident groups and executes triage/synthetic-test/cleanup.
- **Inputs & Validation**: Validates ALLOWED_FEATURE_KEYS, ALLOWED_SEVERITIES, ALLOWED_OUTCOMES, and SAFE_CONTEXT_KEYS; strips emails, phone numbers, bearer tokens, query strings, and file paths.
- **Outputs**: Correlation ID (corr_<hex>) in X-Correlation-Id and error envelopes; grouped incidents with release relationship in /api/admin/diagnostics*.
- **Error Contract**: POST /api/diagnostics/report is non-recursive and rate-limited (429 when exceeded) and never resolves or refreshes session cookies.
- **Side Effects**: Upserts diagnostic_incident_groups and inserts diagnostic_events using isolated error-absorbing DB connection.
- **Idempotency & Concurrency**: fetchJsonBounded marks timed-out mutating requests as uncertainWrite=true so callers do not blindly auto-retry non-idempotent writes.
- **Known Consumers**: `server/app.js`, `server/admin-routes.js`, `server/customer-exploration-routes.js`, `public/diagnostics-client.js`, `public/exploration-client.js`, `public/admin.js`
- **Compatibility Expectations**: Every new feature domain must register its diagnostic featureKey in ALLOWED_FEATURE_KEYS in lib/diagnostics.js.
- **Known Limitations**: Intentional 503 maintenance/paused responses are excluded from server error incident creation to prevent false alert storms.
- **Maintained Test Mappings** *(source mapping only — run suite to verify execution)*:
  - [tests/diagnostics-and-reliability.integration.cjs](../../../tests/diagnostics-and-reliability.integration.cjs) — protects: `role_restrictions`, `input_validation`, `response_shape`
  - [tests/reliability-accessibility-browser.e2e.cjs](../../../tests/reliability-accessibility-browser.e2e.cjs) — protects: `response_shape`, `input_validation`

## `CTR-DISCOVERY-CATALOG` — Unified Sonoma Discovery Catalog, Pacific Live/Schedule Precedence & Card Rendering
- **Domain**: `discovery-catalog` | **Shape Basis**: `declared_exports_and_runtime_guards`
- **Purpose**: Merges PostgreSQL vendors, owner_profiles, truck_settings, and owner_schedule with curated Sonoma baseline metadata, evaluates Pacific Time live/scheduled windows, serves ETag-cached /api/trucks*, and renders compact horizontal cards.
- **Implementation Symbols**: [lib/discovery.js](../../../lib/discovery.js) (`#loadDiscoveryCatalog`), [lib/discovery.js](../../../lib/discovery.js) (`#isVendorPubliclyDiscoverable`), [lib/discovery.js](../../../lib/discovery.js) (`#evaluateSchedulePrecedence`), [public/app.js](../../../public/app.js) (`#cardHTML`)
- **HTTP Routes**: `/api/trucks`, `/api/trucks/:id`, `/api/trucks/nearby`, `/api/trucks/search`, `/api/trucks/availability`
- **Database Tables / Storage**: `vendors`, `owner_profiles`, `truck_settings`, `owner_schedule`
- **Feature Controls**: `event_inquiries`
- **Permissions & Ownership**: Public read for discoverable listings; self-elevation fields (verified, photo_rights_basis) are blocked on vendor profile writes via findForbiddenSelfElevationField.
- **Inputs & Validation**: Filters out inactive, hidden_from_discovery, or active temp-restricted vendors via isVendorPubliclyDiscoverable; enforces photo_rights_basis ('owner_confirmed' | 'admin_verified') before emitting external photo URLs.
- **Outputs**: GET /api/trucks returns { trucks, directoryPlaces, meta, evaluatedCatalogVersion } with public Cache-Control + ETag.
- **Error Contract**: 404 on unknown/hidden truck ID; 403/503 on /api/trucks/availability when event_inquiries is hidden.
- **Side Effects**: Read-only public catalog queries; never reads session cookies or emits Set-Cookie on /api/trucks.
- **Idempotency & Concurrency**: Deterministic Pacific Time window evaluation and ETag computation.
- **Known Consumers**: `api/trucks.js`, `public/app.js`, `public/listing-highlights.js`, `public/smart.js`, `lib/customer-exploration.js`
- **Compatibility Expectations**: Card media slot and badge rules are owned by public/app.js#cardHTML and public/color-calm.css without unverified external food photos.
- **Known Limitations**: Legacy /api/catalog/* and /api/schedule/today endpoints have zero public/ callers but are retained for 30-route parity.
- **Maintained Test Mappings** *(source mapping only — run suite to verify execution)*:
  - [tests/p1-unified-discovery.integration.cjs](../../../tests/p1-unified-discovery.integration.cjs) — protects: `role_restrictions`, `input_validation`, `response_shape`
  - [tests/listing-verification.cjs](../../../tests/listing-verification.cjs) — protects: `response_shape`, `input_validation`
  - [tests/discovery-cards-ux-browser.e2e.cjs](../../../tests/discovery-cards-ux-browser.e2e.cjs) — protects: `response_shape`

## `CTR-CUSTOMER-EXPLORATION` — Account-Backed Customer Exploration: Stories, Visit Journal, Badges, Challenges, Trails & Legacy Import
- **Domain**: `visits-and-passport` | **Shape Basis**: `validated_runtime_checks_and_sql_schema`
- **Purpose**: Provides public sourced editorial stories and suggested trails alongside strictly account-backed (FORCE ROW LEVEL SECURITY) customer visit check-ins, derived points/levels/badges, Monday-Sunday Pacific weekly challenges, saved itineraries, one-time legacy device import, and self-service privacy export/deletion.
- **Implementation Symbols**: [lib/customer-exploration.js](../../../lib/customer-exploration.js) (`#getExplorationSummary`), [lib/customer-exploration.js](../../../lib/customer-exploration.js) (`#logUserVisit`), [lib/customer-exploration.js](../../../lib/customer-exploration.js) (`#buildSuggestedTrail`), [lib/customer-exploration.js](../../../lib/customer-exploration.js) (`#saveUserTrail`), [lib/customer-exploration.js](../../../lib/customer-exploration.js) (`#importLegacyDeviceVisits`), [lib/customer-exploration.js](../../../lib/customer-exploration.js) (`#exportUserExplorationData`), [lib/editorial-stories.js](../../../lib/editorial-stories.js) (`#buildPublicStoriesPayload`), [server/customer-exploration-routes.js](../../../server/customer-exploration-routes.js) (`#handleCustomerExplorationRoute`), [public/exploration-client.js](../../../public/exploration-client.js) (`#getSummary`), [public/exploration-client.js](../../../public/exploration-client.js) (`#importLegacyDeviceData`)
- **HTTP Routes**: `/api/stories`, `/api/trails/suggest`, `/api/me/exploration`, `/api/me/exploration/import`, `/api/me/exploration/export`, `/api/me/visits`, `/api/me/visits/delete`, `/api/me/trails`, `/api/me/trails/delete`
- **Database Tables / Storage**: `customer_visits`, `customer_photos`, `customer_saved_trails`, `customer_saved_trail_stops`, `vendors`
- **Feature Controls**: `local_guides_passport`, `editorial_stories`, `visit_journal`, `private_photos`, `exploration_badges`, `weekly_challenges`, `suggested_trails`
- **Permissions & Ownership**: GET /api/stories and GET /api/trails/suggest are public; all /api/me/* routes require 14+-eligible authenticated session and owner-only RLS; /api/me/exploration/export and /api/me/*/delete remain available even when features are paused/hidden.
- **Inputs & Validation**: Never accepts client user_id; binds verifiedUser.id + setUserRlsContextInTx(app.user_id). Validates discoverable vendor_id on new visits, max 1 visit per (user_id, vendor_id, visited_on_pacific) calendar day, 280-char sanitized private_note, 2-4 deduplicated trail stops, and optional idempotency_key.
- **Outputs**: Structured { ok: true, ... } payloads with Pacific week bounds, derived achievements (5 badge definitions, non-monetary points/levels), saved trail stop progress, and complete JSON export.
- **Error Contract**: 401 AUTH_REQUIRED on anonymous /api/me/*, 409 VISIT_ALREADY_LOGGED_TODAY (with existing_visit), 400 INVALID_VENDOR_ID / TRAIL_STOPS_INVALID, 503 FEATURE_PAUSED, 403 FEATURE_DISABLED.
- **Side Effects**: Persists RLS-isolated rows in PostgreSQL; client clears memory cache on account switch/sign-out and prunes legacy localStorage/IndexedDB entries ONLY after confirmed per-item server persistence.
- **Idempotency & Concurrency**: Unique indexes on (user_id, idempotency_key) and (user_id, vendor_id, visited_on_pacific) prevent duplicate visits or duplicate saved trails under retry/double-submit.
- **Known Consumers**: `public/exploration-client.js`, `public/local-guides.js`, `public/guide-passport.js`, `public/smart.js`, `public/street-whispers.js`, `public/app.js`, `public/role-experience.js`
- **Compatibility Expectations**: Points, levels, badges, and weekly challenges must remain derived projections over customer_visits and customer_photos so disabling presentation never corrupts underlying records.
- **Known Limitations**: Visits are explicitly labeled self-reported check-ins (no background GPS tracking).
- **Maintained Test Mappings** *(source mapping only — run suite to verify execution)*:
  - [tests/customer-exploration.integration.cjs](../../../tests/customer-exploration.integration.cjs) — protects: `authentication`, `ownership_rls`, `input_validation`, `response_shape`, `feature_disabled`, `idempotency`
  - [tests/customer-exploration-browser.e2e.cjs](../../../tests/customer-exploration-browser.e2e.cjs) — protects: `authentication`, `ownership_rls`, `feature_disabled`, `response_shape`

## `CTR-PRIVATE-PHOTO-STORAGE` — Private Confined Photo Derivatives, EXIF Stripping & Orphan Reconciliation
- **Domain**: `photos` | **Shape Basis**: `validated_runtime_checks_and_sql_schema`
- **Purpose**: Validates uploaded JPEG/PNG/WebP magic bytes (<= 5 MB, <= 24 MP), re-encodes display and thumb WebP derivatives via sharp to strip EXIF/GPS metadata, stores files outside public/ under BITESHARK_PHOTO_STORAGE_DIR, serves owner-authenticated downloads with nosniff/no-store headers, and reconciles orphan files/rows.
- **Implementation Symbols**: [lib/photo-storage.js](../../../lib/photo-storage.js) (`#verifyAndNormalizeUploadedPhoto`), [lib/photo-storage.js](../../../lib/photo-storage.js) (`#writePhotoDerivativesAtomically`), [lib/photo-storage.js](../../../lib/photo-storage.js) (`#readPhotoDerivativeSafely`), [lib/photo-storage.js](../../../lib/photo-storage.js) (`#deletePhotoFilesSafely`), [lib/customer-exploration.js](../../../lib/customer-exploration.js) (`#createUserPhoto`), [lib/customer-exploration.js](../../../lib/customer-exploration.js) (`#readUserPhotoFile`), [lib/customer-exploration.js](../../../lib/customer-exploration.js) (`#deleteUserPhoto`), [lib/customer-exploration.js](../../../lib/customer-exploration.js) (`#reconcilePhotoStorage`)
- **HTTP Routes**: `/api/me/photos`, `/api/me/photos/file`, `/api/me/photos/delete`
- **Database Tables / Storage**: `customer_photos`
- **Feature Controls**: `private_photos`
- **Permissions & Ownership**: Strictly private to uploading user (visibility = 'private' CHECK constraint + FORCE ROW LEVEL SECURITY); never served as public static files.
- **Inputs & Validation**: Rejects SVG/GIF/HTML, MIME/magic-byte mismatches, > 5 MiB raw bytes, > 8000px per side or > 24 MP, path traversal, symlinks outside realpath root, and insufficient free disk space (BITESHARK_PHOTO_MIN_FREE_BYTES).
- **Outputs**: Metadata DTOs on /api/me/photos (never exposing host filesystem paths) and binary image/webp stream on GET /api/me/photos/file with Cache-Control: private, no-store, Content-Security-Policy: sandbox, and X-Content-Type-Options: nosniff.
- **Error Contract**: 400 UNSUPPORTED_PHOTO_FORMAT / PHOTO_MIME_MISMATCH / CORRUPT_PHOTO_DATA, 413 PHOTO_TOO_LARGE, 404 PHOTO_NOT_FOUND (for non-owners or deleted photos), 507 PHOTO_STORAGE_LOW_SPACE.
- **Side Effects**: Writes 0600 files inside 0700 user shard directories under BITESHARK_PHOTO_STORAGE_DIR; cleans up newly written files if DB commit fails; reconcilePhotoStorage purges orphan files beyond grace window and marks missing-file rows storage_missing.
- **Idempotency & Concurrency**: Deduplicates retries by (user_id, idempotency_key) before writing duplicate derivatives.
- **Known Consumers**: `server/customer-exploration-routes.js`, `scripts/reconcile-photo-storage.cjs`, `public/exploration-client.js`, `public/guide-passport.js`
- **Compatibility Expectations**: Deployment releases must never place BITESHARK_PHOTO_STORAGE_DIR inside ephemeral release directories (/srv/*/releases/*) or public/.
- **Known Limitations**: Public/community photo sharing is intentionally unsupported in this contract.
- **Maintained Test Mappings** *(source mapping only — run suite to verify execution)*:
  - [tests/customer-exploration.integration.cjs](../../../tests/customer-exploration.integration.cjs) — protects: `authentication`, `ownership_rls`, `input_validation`, `feature_disabled`, `idempotency`, `rollback_and_recovery`

## `CTR-SUPPORT-TICKETS` — Support & Feedback Tickets, Sharing Scope & Connected Incident Links
- **Domain**: `support-and-feedback` | **Shape Basis**: `validated_runtime_checks_and_sql_schema`
- **Purpose**: Manages human-readable BS-001xxx support/feedback tickets, personal vs vendor_service sharing scopes, reporter/staff notes, append-only timeline events, and many-to-many diagnostic_incident_groups links.
- **Implementation Symbols**: [lib/support-tickets.js](../../../lib/support-tickets.js) (`#serializeSupportTicketForReporter`), [lib/support-tickets.js](../../../lib/support-tickets.js) (`#validateStaffStatusTransition`), [lib/support-tickets.js](../../../lib/support-tickets.js) (`#autoSuggestDiagnosticLinksInTx`), [server/admin-routes.js](../../../server/admin-routes.js) (`#handleGovernanceApiRequest`)
- **HTTP Routes**: `/api/issues`, `/api/issues/reply`, `/api/issues/reopen`, `/api/issues/read`, `/api/admin/issues`, `/api/admin/issues/update`, `/api/admin/issues/diagnostics`, `/api/admin/diagnostics/notify-tickets`
- **Database Tables / Storage**: `support_issues`, `support_issue_notes`, `support_issue_events`, `support_issue_diagnostic_links`, `support_issue_notifications`
- **Permissions & Ownership**: Unassessed accounts may use /api/issues* ONLY for privacy, accessibility, or account_access categories; internal notes and suggested diagnostic links are hidden from reporters.
- **Inputs & Validation**: Validates category, reporter_urgency, sharing_scope (forbidding vendor_service on customer or account_access tickets), sanitized correlation/release context, and idempotency_key.
- **Outputs**: Reporter-redacted ticket timelines on /api/issues* (never exposing internal staff notes or raw incident internals); full triage view on /api/admin/issues*.
- **Error Contract**: 401 unauthenticated, 403 unauthorized ticket/vendor scope, 400 invalid state transition or missing resolution note.
- **Side Effects**: Appends support_issue_events (REVOKE UPDATE, DELETE), links incidents, and dispatches bounded Resend notifications when configured.
- **Idempotency & Concurrency**: Deduplicates ticket and reply submissions by idempotency_key and locks support_issues FOR UPDATE on status/assignment transitions.
- **Known Consumers**: `public/role-experience.js`, `public/admin.js`, `public/diagnostics-client.js`
- **Compatibility Expectations**: Internal triage metadata must never leak into serializeSupportTicketForReporter.
- **Known Limitations**: Email notifications degrade gracefully to in-app unread badges when email delivery is disabled.
- **Maintained Test Mappings** *(source mapping only — run suite to verify execution)*:
  - [tests/support-feedback.integration.cjs](../../../tests/support-feedback.integration.cjs) — protects: `authentication`, `ownership_rls`, `role_restrictions`, `input_validation`, `response_shape`, `idempotency`
  - [tests/support-feedback-browser.e2e.cjs](../../../tests/support-feedback-browser.e2e.cjs) — protects: `authentication`, `ownership_rls`, `response_shape`

## `CTR-PAGER-WEBPUSH` — Pickup Pagers, Web Push Subscriptions & Lease-Fenced Outbox Worker
- **Domain**: `pager-and-notifications` | **Shape Basis**: `validated_runtime_checks_and_sql_schema`
- **Purpose**: Creates vendor pickup pagers, manages RFC 8291 encrypted Web Push subscriptions with capability/unsubscribe tokens, and dispatches ready notifications via a lease-fenced background worker with pre-send rechecks.
- **Implementation Symbols**: [lib/pager-notifications.js](../../../lib/pager-notifications.js) (`#handlePagerTransitionNotificationsInTx`), [lib/pager-notifications.js](../../../lib/pager-notifications.js) (`#runNotificationWorkerBatch`), [lib/pager-notifications.js](../../../lib/pager-notifications.js) (`#verifySameOriginMutation`), [lib/webpush-crypto.js](../../../lib/webpush-crypto.js) (`#default`), [public/pager.js](../../../public/pager.js) (`#default`)
- **HTTP Routes**: `/api/pager/staff`, `/api/pager/status`, `/api/pager/subscriptions`, `/api/pager/update`, `/api/pager/worker`, `/api/pager/telemetry`
- **Database Tables / Storage**: `pickup_pagers`, `pager_notification_subscriptions`, `pager_notification_events`, `pager_notification_deliveries`
- **Feature Controls**: `pickup_pager_creation`, `pager_push_subscriptions`, `pager_push_delivery`
- **Permissions & Ownership**: Vendor Staff/Owner/Admin on /api/pager/staff & /update; capability UUID on /status & /subscriptions; loopback supervisor + secret on /worker; Admin: Top only on /telemetry.
- **Inputs & Validation**: Validates HTTPS Web Push endpoint allowlist, ECDH P-256 keys, X-BiteShark-Client: web-pager-v1 CSRF header, UUID request_key idempotency on staff pager creation, and loopback + timing-safe worker bearer secret on /api/pager/worker.
- **Outputs**: Redacted guest pager status on /api/pager/status; vendor queue on /api/pager/staff; Top-admin outbox metrics on /api/pager/telemetry.
- **Error Contract**: 403 loopback/CSRF/feature-disabled rejections, 401 invalid worker secret, 503 write-pause or disabled push provider.
- **Side Effects**: Claims delivery leases with fencing tokens, re-verifies feature control and active pager state immediately before external HTTPS push send, and records worker heartbeats.
- **Idempotency & Concurrency**: FOR UPDATE SKIP LOCKED wave claiming + monotonic lease fencing tokens prevent double-send races across worker restarts.
- **Known Consumers**: `scripts/run-pager-worker.cjs`, `public/pager.js`, `public/sw.js`
- **Compatibility Expectations**: DELETE /api/pager/subscriptions (guest unsubscribe) must remain exempt when pager_push_subscriptions is paused or hidden.
- **Known Limitations**: Real Web Push delivery requires VAPID keys and BITESHARK_PUSH_PROVIDER_MODE=webpush.
- **Maintained Test Mappings** *(source mapping only — run suite to verify execution)*:
  - [tests/pager-notifications.integration.cjs](../../../tests/pager-notifications.integration.cjs) — protects: `authentication`, `role_restrictions`, `feature_disabled`, `idempotency`, `concurrency_locking`
  - [tests/pager-notifications-browser.e2e.cjs](../../../tests/pager-notifications-browser.e2e.cjs) — protects: `response_shape`, `input_validation`

## `CTR-RELEASE-MIGRATION-DEPLOY` — Immutable SQL Migration Checksums, Release Tarball Packaging & Atomic Staging Installer
- **Domain**: `release-and-deploy` | **Shape Basis**: `declared_exports_and_runtime_guards`
- **Purpose**: Verifies SHA-256 checksums of applied migrations/001..NNN.sql, enforces NOBYPASSRLS + table-level REVOKE privileges on the runtime DB role, builds clean Git release tarballs, and atomically switches /srv/*/current with automatic healthz/worker rollback.
- **Implementation Symbols**: [scripts/run-migrations.cjs](../../../scripts/run-migrations.cjs) (`#parseArgs`), [scripts/build-linux-release-tarball.cjs](../../../scripts/build-linux-release-tarball.cjs) (`#parseArgs`)
- **HTTP Routes**: `/api/healthz`
- **Database Tables / Storage**: `schema_migrations`
- **Permissions & Ownership**: Primary staging (/srv/truckly-staging, port 4100) and secondary staging2 (/srv/biteshark-staging2, port 4102) have strictly isolated Linux users, DBs, env files, photo roots, and systemd units.
- **Inputs & Validation**: run-migrations.cjs aborts on any SHA-256 mismatch against schema_migrations; build-linux-release-tarball.cjs honors .gitattributes export-ignore (excluding tests/, dev-server.cjs, .env*); install-staging-release.sh verifies tarball SHA-256, flock lock, and post-switch /api/healthz release_sha.
- **Outputs**: Deterministic release tarball + .sha256 manifest; /api/healthz returns { status: 'ok', release_sha, registered_routes: 30 }.
- **Error Contract**: Nonzero exit and automatic symlink + systemd rollback in deploy/install-staging-release.sh if migration, service restart, healthz SHA check, or worker journal check fails.
- **Side Effects**: Applies forward-only additive SQL migrations, updates /srv/*/current symlink, restarts truckly-staging / truckly-pager-worker (or staging2 units via biteshark-staging2-ctl).
- **Idempotency & Concurrency**: Already-applied migrations with matching SHA-256 are skipped idempotently; concurrent deploys are blocked via flock.
- **Known Consumers**: `deploy/install-staging-release.sh`, `deploy/bin/biteshark-staging2-ctl`, `.github/workflows/truckly-source-review.yml`
- **Compatibility Expectations**: Applied SQL migrations are immutable and additive-only so symlink rollback to the previous release remains compatible with the database schema.
- **Known Limitations**: Symlink rollback reverts code and restarts services; it never runs destructive DOWN SQL against persistent staging/production data.
- **Maintained Test Mappings** *(source mapping only — run suite to verify execution)*:
  - [tests/install-staging-release.test.cjs](../../../tests/install-staging-release.test.cjs) — protects: `input_validation`, `rollback_and_recovery`, `concurrency_locking`
  - [tests/staging2-ctl-security.test.cjs](../../../tests/staging2-ctl-security.test.cjs) — protects: `role_restrictions`, `input_validation`
  - [tests/vps-platform-contract.test.cjs](../../../tests/vps-platform-contract.test.cjs) — protects: `response_shape`, `input_validation`

## `CTR-CUSTOMER-PROFILE-SHARING` — Private Customer Profile Dashboard, Greatest Hits Collections & Revocable Unlisted Sharing
- **Domain**: `customer-profile-and-sharing` | **Shape Basis**: `validated_runtime_checks_and_sql_schema`
- **Purpose**: Provides private account dashboard (/profile), coarse Sonoma preferences, curated Greatest Hits collections (<= 5/user, <= 20 entries/collection), 18+ self-attested sharing eligibility without DOB storage, 256-bit SHA-256 hashed unlisted share links (/s/<token>), consented EXIF-stripped sha_* WebP derivatives, signed-out abuse reporting, and scoped Mod/Top moderation.
- **Implementation Symbols**: [lib/customer-profile.js](../../../lib/customer-profile.js) (`#getPrivateOwnerProfile`), [lib/customer-profile.js](../../../lib/customer-profile.js) (`#updatePrivateOwnerProfile`), [lib/customer-profile.js](../../../lib/customer-profile.js) (`#createOwnerCollection`), [lib/customer-profile.js](../../../lib/customer-profile.js) (`#createCollectionShareLink`), [lib/customer-profile.js](../../../lib/customer-profile.js) (`#revokeCollectionShareLink`), [lib/customer-profile.js](../../../lib/customer-profile.js) (`#resolveLiveSharedCollectionByToken`), [lib/customer-profile.js](../../../lib/customer-profile.js) (`#applyAdminSharedModerationDecision`), [lib/age-policy.js](../../../lib/age-policy.js) (`#evaluateAdultSharingEligibility`), [lib/photo-storage.js](../../../lib/photo-storage.js) (`#createSharedPhotoDerivative`)
- **HTTP Routes**: `/api/me/profile`, `/api/me/preferences`, `/api/me/profile/privacy`, `/api/me/profile/delete-data`, `/api/me/collections`, `/api/me/collections/detail`, `/api/me/collections/update`, `/api/me/collections/delete`, `/api/me/collections/preview`, `/api/me/collections/attach-photo`, `/api/me/collections/remove-photo`, `/api/me/sharing-eligibility`, `/api/me/shares`, `/api/me/shares/create`, `/api/me/shares/update-settings`, `/api/me/shares/rotate`, `/api/me/shares/revoke`, `/api/shared/report`, `/api/admin/shared-moderation`, `/api/admin/shared-moderation/decision`, `/api/admin/shared-moderation/photo`
- **Database Tables / Storage**: `customer_profiles`, `customer_sharing_eligibility`, `customer_collections`, `customer_collection_entries`, `customer_collection_photo_attachments`, `customer_collection_shares`, `customer_share_reports`, `customer_share_moderation_events`
- **Feature Controls**: `customer_profile`, `customer_profile_editing`, `greatest_hits_collections`, `unlisted_collection_sharing`, `shared_collection_photos`, `public_profile_discovery`
- **Permissions & Ownership**: Private owner routes require 14+-eligible session + app.user_id RLS; unlisted share creation requires 18+ attestation; /api/admin/shared-moderation* scopes Mod/Top to reported or shared items only.
- **Inputs & Validation**: Enforces expected_revision optimistic concurrency on profiles/collections, 18+ Pacific civil-date attestation on share creation without storing raw DOB, explicit share_consent_confirmed per attached photo, and Referrer-Policy: no-referrer + X-Robots-Tag: noindex on /s/<token>.
- **Outputs**: Allowlisted DTO envelopes via buildPrivateOwnerProfileDto, buildPrivateOwnerCollectionDto, buildSharedCollectionPublicDto, and buildAdminShareModerationDto.
- **Error Contract**: 401 unauthenticated, 403 ADULT_SHARING_ELIGIBILITY_REQUIRED / FEATURE_UNAVAILABLE, 404 uniform non-enumerable share response for unknown/revoked/expired/suppressed tokens, 409 REVISION_CONFLICT.
- **Side Effects**: Writes FORCE ROW LEVEL SECURITY rows in 029 tables, writes EXIF-stripped sha_* WebP derivatives to persistent photo storage, and purges shared derivatives on revoke/delete/suppress.
- **Idempotency & Concurrency**: Supports client idempotency_key on collection/share creation and expected_revision optimistic concurrency.
- **Known Consumers**: `server/customer-profile-routes.js`, `public/profile-client.js`, `public/customer-profile.js`, `public/greatest-hits.js`, `public/greatest-hits-sharing.js`, `public/shared-collection.html`, `public/admin.js`
- **Compatibility Expectations**: public_collection_sharing remains hidden by default; /api/me/profile-data/export, /api/me/profile-data/clear, and /api/me/shares/:shareId/revoke remain exempt even when feature controls are paused or hidden.
- **Known Limitations**: Public directory/handle discovery is intentionally deferred and non-indexable.
- **Maintained Test Mappings** *(source mapping only — run suite to verify execution)*:
  - [tests/customer-profile-sharing.integration.cjs](../../../tests/customer-profile-sharing.integration.cjs) — protects: `authentication`, `ownership_rls`, `role_restrictions`, `input_validation`, `response_shape`, `feature_disabled`, `idempotency`, `concurrency_locking`
  - [tests/customer-profile-browser.e2e.cjs](../../../tests/customer-profile-browser.e2e.cjs) — protects: `authentication`, `response_shape`, `input_validation`
