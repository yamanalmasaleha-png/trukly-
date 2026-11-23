# 09 — Prioritized Repair Plan (`REP-001` – `REP-032`)

- **Repository**: `https://github.com/yamanalmasaleha-png/trukly-.git`
- **Target Branch**: `working/biteshark-vps` (Base Commit: `f0e5e5deedc7636f448e1b0d629ceb1787d79944`)
- **Machine-Readable Companion**: [repair_tasks.json](repair_tasks.json)
- **Operating Constraint**: **Preserve working functionality.** Prefer minimal, testable, root-cause fixes; never edit applied SQL migrations (`001`–`029`); never alter `REGISTERED_DOMAIN_ROUTE_COUNT === 30` without explicit authorization; and run `npm run registry:docs && npm run registry:validate` after symbol/schema updates.

## Quick Wins (High-Value, Small-Scope `S` Repairs)

These **14** self-contained tasks (`Effort: S`) deliver immediate security, availability, or correctness improvements with minimal blast radius:

| Task ID | Priority | Related Findings | Summary | Target Files |
|---|---|---|---|---|
| [REP-002](#rep-002) | **P0** | [AUD-0002](03_COMPLETE_FINDINGS.md#aud-0002) | Block synthetic test customer from platform_roles grants, make GET /api/admin/test-customer read-only, and harden last-Top DB invariant | `server/admin-routes.js`, `lib/admin-test-customer.js`, … |
| [REP-004](#rep-004) | **P0** | [AUD-0004](03_COMPLETE_FINDINGS.md#aud-0004) | Register "favorites" and missing domain scopes in VALID_PAUSE_SCOPES to eliminate global write-pause self-DoS | `lib/authz.js`, `docs/VPS_OPERATIONS.md`, … |
| [REP-006](#rep-006) | **P1** | [AUD-0006](03_COMPLETE_FINDINGS.md#aud-0006) | Commit non-retryable ineligibility on under-14 POST /api/me/sharing-eligibility submissions | `lib/customer-profile.js`, `tests/customer-profile-sharing.integration.cjs` |
| [REP-011](#rep-011) | **P1** | [AUD-0010](03_COMPLETE_FINDINGS.md#aud-0010) | Add Subresource Integrity (SRI) and non-blocking load to Leaflet CDN assets (or vendor locally) and add HTML Content-Security-Policy headers | `public/index.html`, `server/app.js`, … |
| [REP-012](#rep-012) | **P1** | [AUD-0011](03_COMPLETE_FINDINGS.md#aud-0011) | Enforce vendor hidden_from_discovery and is_active governance filters on /api/community/list and /api/community/post | `api/community/list.js`, `api/community/post.js`, … |
| [REP-016](#rep-016) | **P1** | [AUD-0017](03_COMPLETE_FINDINGS.md#aud-0017) | Re-throw SessionEligibilityError in profile & account-context routes, map PhotoStorageError, and validate related_review_id in POST /api/issues | `server/customer-profile-routes.js`, `server/admin-routes.js`, … |
| [REP-017](#rep-017) | **P1** | [AUD-0018](03_COMPLETE_FINDINGS.md#aud-0018) | Fix pager worker summary key mismatch (failed_permanent/delivered) to restore PUSH_DELIVERY_BATCH_FAILURE diagnostics and degraded heartbeats | `api/pager/worker.js`, `scripts/run-pager-worker.cjs`, … |
| [REP-018](#rep-018) | **P1** | [AUD-0019](03_COMPLETE_FINDINGS.md#aud-0019) | Destroy poisoned PoolClients on ROLLBACK failure in packages/runtime-adapter and lib/db-tx.js | `packages/runtime-adapter/index.js`, `lib/db-tx.js`, … |
| [REP-019](#rep-019) | **P1** | [AUD-0020](03_COMPLETE_FINDINGS.md#aud-0020), [AUD-0037](03_COMPLETE_FINDINGS.md#aud-0037) | Fix staging2 systemd ReadWritePaths, commit backup-staging2.sh, tighten CI push RUNTIME_DIFF, and sync Nginx/worker/tarball templates | `deploy/systemd/biteshark-staging2-api.service`, `deploy/backup/backup-staging2.sh`, … |
| [REP-023](#rep-023) | **P2** | [AUD-0025](03_COMPLETE_FINDINGS.md#aud-0025) | Decouple read-only session lookup from sliding-window DB renewal when Set-Cookie is not emitted | `lib/standalone-auth.js`, `server/app.js`, … |
| [REP-024](#rep-024) | **P2** | [AUD-0026](03_COMPLETE_FINDINGS.md#aud-0026) | Prevent soft-deleted idempotency_key collisions (23505 HTTP 500) across visits, photos, trails, and collections | `lib/customer-exploration.js`, `lib/customer-profile.js`, … |
| [REP-027](#rep-027) | **P2** | [AUD-0030](03_COMPLETE_FINDINGS.md#aud-0030), [AUD-0038](03_COMPLETE_FINDINGS.md#aud-0038), [AUD-0039](03_COMPLETE_FINDINGS.md#aud-0039) | Fix pager.js off-by-one step announcements, /s/%... URIError handling, sw.js URL guard, and Admin Portal CSS/modal polish | `public/pager.js`, `server/app.js`, … |
| [REP-031](#rep-031) | **P3** | [AUD-0041](03_COMPLETE_FINDINGS.md#aud-0041), [AUD-0042](03_COMPLETE_FINDINGS.md#aud-0042) | Fix code-registry SQL index regex, add test:unit & missing package.json scripts, and update TESTING.md & dev-server.cjs notices | `tools/code-registry/backend-db-analyzer.mjs`, `package.json`, … |
| [REP-032](#rep-032) | **P4** | [AUD-0043](03_COMPLETE_FINDINGS.md#aud-0043) | Remove verified legacy Hatchable archives & unused internal symbols, wire style-guide --decisions flag, and refresh README/TECH_MAP | `truckly-v63.zip`, `truckly-data.sql.gz`, … |

---

<a id="decisions-required"></a>
## Decisions Required (Product / Legal / Operations)

The following **4** items have safe default engineering fixes ready, but require an explicit team decision from Matt & Yaman for full policy alignment:

1. **Under-14 Self-Attestation on Adult Sharing Gate ([AUD-0006](03_COMPLETE_FINDINGS.md#aud-0006) / [REP-006](#rep-006))**: Committing `ineligible_under_18` in `customer_sharing_eligibility` is mandatory so a `< 14` submission cannot retry with a fake 18+ DOB. **Decision needed**: Should submitting a `< 14` birth date on `POST /api/me/sharing-eligibility` *also* disable the account (`auth_users.disabled_at = now()`, `age_eligibility_status = 'ineligible'`) and revoke active `auth_sessions` identically to `POST /api/auth/age-assessment`?
2. **`staff_beta` Audience Semantics on Live `/s/<token>` Shares ([AUD-0007](03_COMPLETE_FINDINGS.md#aud-0007) / [REP-007](#rep-007))**: **Decision needed**: When `unlisted_collection_sharing` or `shared_collection_photos` is set to `audience: 'staff_beta'`, should `GET /s/<token>` require the *recipient* to be signed in as staff (strict beta containment), or allow external anonymous viewing of links created by staff (requiring explicit Admin UI disclosure)?
3. **Retiring `BITESHARK_PLATFORM_ADMIN_IDS` vs Syncing with `platform_roles` ([AUD-0024](03_COMPLETE_FINDINGS.md#aud-0024) / [REP-022](#rep-022))**: **Decision needed**: Now that `scripts/bootstrap-top-admin.cjs` and Migration `026` manage `platform_roles` in PostgreSQL, can env-based `BITESHARK_PLATFORM_ADMIN_IDS` be formally deprecated/removed from staging configs, or should it remain an active fallback synced with ticket assignment?
4. **Disconnected `admin_notification_outbox`, Unwired Admin Endpoints & 6 Legacy Domain Routes ([AUD-0035](03_COMPLETE_FINDINGS.md#aud-0035) / [REP-025](#rep-025))**: **Decision needed**: (a) Should `admin_notification_outbox` be wired to applicant email/UI notifications or pruned? (b) Should `POST /api/admin/invitations/resend` and `POST /api/admin/style-guide/reset` get UI buttons in `/admin`? (c) Should the 6 superseded `api/*` routes (`/api/trucks/list`, `/api/pager/list`, `/api/community/moderate`, etc.) remain preserved under `REGISTERED_DOMAIN_ROUTE_COUNT === 30` or undergo a formal contract deprecation?

---

## Phase A — Critical Stabilization (13 Tasks)

Address exploitable privilege/moderation/kill-switch bypasses, permanent admin-lockout vectors, fail-open feature controls, diagnostic log/eviction hazards, third-party CDN SRI/CSP gaps, user-table RLS gaps, and poisoned DB pool connections.

<a id="rep-001"></a>
### REP-001 — Fix Admin: Mod -> Top Style Guide escalation, serialize workspace-state.json writes, and quarantine corrupt state files

- **Task ID**: `REP-001`
- **Related Audit Finding IDs**: [AUD-0001](03_COMPLETE_FINDINGS.md#aud-0001), [AUD-0013](03_COMPLETE_FINDINGS.md#aud-0013)
- **Priority / Estimated Effort**: **P0** · Effort `M`
- **Exact Target Files**: `lib/style-guide-admin.js`, `tests/style-guide-admin.integration.cjs`
- **Objective**: Prevent Admin: Mod from approving, overwriting, or clearing Admin: Top Style Guide decisions, eliminate lost updates during concurrent GitHub pushes, and stop silent resets on corrupt state JSON.
- **Proposed Changes**: Trim and validate status strings prior to role checks, require `minRole: "top"` whenever `prevDec.status` OR `nextStatus` is `approved` / `not_applicable`, derive `approved_by` from verified Top Admin identity, serialize `workspace-state.json` writes with an async lock, re-read fresh `workspace-state.json` after GitHub API calls in `push`, and throw `500 STYLE_GUIDE_STATE_CORRUPT` instead of returning `emptyState()` on JSON parse errors.
- **Step-by-Step Instructions**:
  1. In `lib/style-guide-admin.js:329-349`, return `emptyState()` strictly on `err.code === "ENOENT"`; throw `StyleGuideAdminError("Workspace state file is unreadable or corrupt.", { status: 500, code: "STYLE_GUIDE_STATE_CORRUPT" })` on parse/read errors.
  2. Add an in-process promise queue `withWorkspaceLock(storageDir, fn)` wrapping `saveStyleGuideAdminUpdates`, `resetStyleGuideAdminDecisions`, and the final state write in `pushStyleGuideWorkspaceToGithub`.
  3. In `saveStyleGuideAdminUpdates` (`lines 955-1052`), normalize `nextStatus = typeof item.status === "string" ? item.status.trim() : prevDec.status` against `VALID_STATUSES` first, then check if ANY item has `prevDec.status` OR `nextStatus` in `["approved", "not_applicable"]`; if true, require `await reverifyPlatformAdminInTx(tx, { userId: actorUserId, sessionId: actorSessionId, minRole: "top" })` and bind `nextDec.approved_by` to the verified Top Admin email/handle.
  4. In `pushStyleGuideWorkspaceToGithub` (`lines 1650-1668`), re-read current `wsState` inside `withWorkspaceLock` after GitHub API commit creation and merge `last_github_push` (`pushed_at_revision: snap.wsState.revision`) without overwriting newer `overrides_by_id`.
- **Dependencies**: None
- **Potential Side Effects**: Corrupt `workspace-state.json` files will fail loudly (`500`) for safe operator inspection instead of silently wiping overrides; `Admin: Mod` can still save `draft` edits on `unanswered` and `draft` items.
- **Acceptance Criteria**:
  - `Admin: Mod` receives `403` when sending `"status": "approved "`, omitting `status` on an `approved` item, or setting an `approved` item to `draft`/`unanswered`.
  - Concurrent `POST /api/admin/style-guide/save` completed while `POST /api/admin/style-guide/push` is awaiting GitHub API responses survives in `workspace-state.json` with `unpushed_changes_since_last_push: true`.
- **Tests Required**: Extend `tests/style-guide-admin.integration.cjs` with Mod privilege-escalation negative tests, concurrent push+save test, and corrupt JSON test.
- **Verification Commands**: `node tests/style-guide.test.cjs` · `node tests/style-guide-admin.integration.cjs`

---

<a id="rep-002"></a>
### REP-002 — Block synthetic test customer from platform_roles grants, make GET /api/admin/test-customer read-only, and harden last-Top DB invariant

- **Task ID**: `REP-002`
- **Related Audit Finding IDs**: [AUD-0002](03_COMPLETE_FINDINGS.md#aud-0002)
- **Priority / Estimated Effort**: **P0** · Effort `S` · ⚡ **Quick Win**
- **Exact Target Files**: `server/admin-routes.js`, `lib/admin-test-customer.js`, `migrations/030_harden_synthetic_sandbox_and_rls.sql`, `tests/admin-test-customer.integration.cjs`
- **Objective**: Prevent `usr_sa_top_admin_test_customer` from ever holding `Admin: Top` / `Mod` roles, counting as a human Top Admin in `protect_last_top_admin()`, or mutating database state on `GET`.
- **Proposed Changes**: Reject `SYNTHETIC_TEST_CUSTOMER_USER_ID` on role/status/vendor-owner mutations, refactor `getAdminTestCustomerStatus` (`GET`) to read-only SQL, and add an additive migration excluding synthetic `.invalid` sandbox accounts from `platform_roles` and `count_eligible_active_top_admins()`.
- **Step-by-Step Instructions**:
  1. In `server/admin-routes.js:4349-4560`, reject `targetUserId === SYNTHETIC_TEST_CUSTOMER_USER_ID` (`400 SYNTHETIC_TEST_ACCOUNT_IMMUTABLE`) in `/api/admin/accounts/role` and `/api/admin/accounts/status`.
  2. In `lib/admin-test-customer.js:185-255`, make `getAdminTestCustomerStatus` strictly read-only (`SELECT`), running `ensureSyntheticTestCustomerInTx` only on `POST` actions (`enter`, `seed`, `reset`).
  3. Add additive migration `030_harden_synthetic_sandbox_and_rls.sql` adding `ALTER TABLE platform_roles ADD CONSTRAINT platform_roles_no_synthetic_test_user_chk CHECK (user_id <> 'usr_sa_top_admin_test_customer')` and updating `count_eligible_active_top_admins()` to exclude `usr_sa_top_admin_test_customer`.
- **Dependencies**: None
- **Potential Side Effects**: Coordinate migration number `030` across active branches before merging (`AGENTS.md` Section 3.1).
- **Acceptance Criteria**:
  - `POST /api/admin/accounts/role` targeting `usr_sa_top_admin_test_customer` returns `400`.
  - `GET /api/admin/test-customer` executes zero `INSERT`/`UPDATE`/`DELETE` statements.
  - PostgreSQL `platform_roles` rejects `INSERT` of `usr_sa_top_admin_test_customer` at the constraint layer.
- **Tests Required**: Add role-grant rejection and read-only `GET` checks to `tests/admin-test-customer.integration.cjs`.
- **Verification Commands**: `node tests/admin-test-customer.integration.cjs` · `npm run registry:docs` · `npm run registry:validate`

---

<a id="rep-003"></a>
### REP-003 — Prevent feature_controls unknown-key rollbacks and DB errors from failing OPEN on hidden/staff_beta/sharing surfaces

- **Task ID**: `REP-003`
- **Related Audit Finding IDs**: [AUD-0003](03_COMPLETE_FINDINGS.md#aud-0003)
- **Priority / Estimated Effort**: **P0** · Effort `M`
- **Exact Target Files**: `lib/feature-controls.js`, `lib/customer-profile.js`, `tests/feature-controls.integration.cjs`
- **Objective**: Ensure additive forward-migration keys in `feature_controls` do not invalidate known feature states during rollbacks, and ensure genuine `stateUntrusted` DB failures fail CLOSED on gated read/sharing endpoints.
- **Proposed Changes**: Treat unrecognized `feature_key` rows as logged warnings without setting `stateUntrusted = true`, and fail closed (`hidden` / `503` / neutral `404`) on optional/beta/sharing surfaces when `stateUntrusted === true`.
- **Step-by-Step Instructions**:
  1. In `lib/feature-controls.js:1235-1312`, record a rate-limited diagnostic warning when `unknownKeys.length > 0`, but keep `stateUntrusted = false` as long as known feature rows parse cleanly.
  2. In `lib/feature-controls.js:1418-1438` and `1876-1928`, when `stateUntrusted === true` (actual DB query error or corrupt row on a known key), fail closed (`503 FEATURE_CONTROLS_UNAVAILABLE` / effective `hidden`) for `customer_profile`, `greatest_hits_collections`, `unlisted_collection_sharing`, `shared_collection_photos`, `admin_style_guide_workspace`, and `staff_beta`-configured features while preserving core `/api/trucks` catalog resilience.
  3. In `lib/customer-profile.js:3014-3019, 4291-4297`, return the neutral unavailable response if `systemFeatureStates?.stateUntrusted === true`.
- **Dependencies**: None
- **Potential Side Effects**: Update any test in `tests/feature-controls.integration.cjs` that previously expected an unknown `feature_key` row to force `stateUntrusted = true`.
- **Acceptance Criteria**:
  - Inserting an unknown `feature_key` row into `feature_controls` leaves `hidden` and `staff_beta` enforcement intact across all 14 registered features.
  - When `feature_controls` query fails (`stateUntrusted === true`), `/s/<token>` returns neutral `404` and `/api/me/profile` returns `503` rather than exposing hidden data.
- **Tests Required**: Update and expand `tests/feature-controls.integration.cjs` and `tests/customer-profile-sharing.integration.cjs`.
- **Verification Commands**: `node tests/feature-controls.integration.cjs` · `node tests/customer-profile-sharing.integration.cjs`

---

<a id="rep-004"></a>
### REP-004 — Register "favorites" and missing domain scopes in VALID_PAUSE_SCOPES to eliminate global write-pause self-DoS

- **Task ID**: `REP-004`
- **Related Audit Finding IDs**: [AUD-0004](03_COMPLETE_FINDINGS.md#aud-0004)
- **Priority / Estimated Effort**: **P0** · Effort `S` · ⚡ **Quick Win**
- **Exact Target Files**: `lib/authz.js`, `docs/VPS_OPERATIONS.md`, `tests/backend-hardening.integration.cjs`
- **Objective**: Allow `BITESHARK_PAUSE_WRITES=favorites` to pause favorites writes cleanly without triggering `failClosedAll` across unrelated subsystems.
- **Proposed Changes**: Add `"favorites"` (plus `"exploration"`, `"issues"`, `"onboarding"`, `"style_guide"`) to `VALID_PAUSE_SCOPES` in `lib/authz.js`.
- **Step-by-Step Instructions**:
  1. Update `VALID_PAUSE_SCOPES` in `lib/authz.js:120-127` to include `"favorites"`, `"exploration"`, `"issues"`, `"onboarding"`, and `"style_guide"`.
  2. Document the complete `BITESHARK_PAUSE_WRITES` scope list in `docs/VPS_OPERATIONS.md`.
- **Dependencies**: None
- **Potential Side Effects**: None; genuinely unknown misspelled tokens still fail closed safely.
- **Acceptance Criteria**:
  - Setting `BITESHARK_PAUSE_WRITES=favorites` causes `POST /api/favorites/toggle` to return `503` while `POST /api/bookings/create` and `POST /api/pager/create` succeed.
- **Tests Required**: Add granular `BITESHARK_PAUSE_WRITES=favorites` test in `tests/backend-hardening.integration.cjs`.
- **Verification Commands**: `node tests/backend-hardening.integration.cjs`

---

<a id="rep-005"></a>
### REP-005 — Close shared-collection moderation suppression bypasses on photo re-attachment, collection updates, and multi-share previews

- **Task ID**: `REP-005`
- **Related Audit Finding IDs**: [AUD-0005](03_COMPLETE_FINDINGS.md#aud-0005)
- **Priority / Estimated Effort**: **P1** · Effort `M`
- **Exact Target Files**: `lib/customer-profile.js`, `tests/customer-profile-sharing.integration.cjs`
- **Objective**: Ensure moderator/Top-Admin photo and content suppressions cannot be bypassed by re-attaching the same photo, editing an already-shared collection, or creating a second low-disclosure share link.
- **Proposed Changes**: Block suppressed `recorded_source_photo_id` / `sha256_hex` in `attachPhotoToCollectionEntry`, preserve suppressed `sha_*` evidence files for moderator inspection, enforce `suppressed_content_sha256` (including photo attachments) in `updateOwnerCollection`, and `BOOL_OR` disclosures across active/reported shares in `listAdminSharedModerationQueue`.
- **Step-by-Step Instructions**:
  1. In `attachPhotoToCollectionEntry` (`lib/customer-profile.js:4013-4150`), reject with `403 PHOTO_SUPPRESSED_BY_MODERATION` if `customer_collection_photo_attachments` contains a `moderation_status = "suppressed"` row for `(user_id, recorded_source_photo_id)` or matching `sha256_hex`, and retain suppressed derivative files on disk (`readAdminReportedSharedPhoto` at `line 4461` should allow inspecting `moderation_status = "suppressed"` attachments).
  2. Include sorted `photo_attachment_id` / `sha256_hex` values in `computeCollectionContentDigest` (`line 1478`) and enforce `suppressed_content_sha256` inside `updateOwnerCollection` (`lines 1950-2020`) when shares exist.
  3. In `listAdminSharedModerationQueue` (`lines 3567-3621`), aggregate `include_display_name`, `include_bio`, `include_preferred_area`, and `include_shared_photos` across all active or reported shares on the collection.
- **Dependencies**: None
- **Potential Side Effects**: None for un-moderated collections.
- **Acceptance Criteria**:
  - Re-attaching a `suppress_attachment` photo returns `403` until `Admin: Top` runs `reinstate_attachment`.
  - Updating a shared collection to match `suppressed_content_sha256` returns `403 SUPPRESSED_CONTENT_BYPASS_BLOCKED`.
  - Moderator queue displays curator `display_name`/`bio` whenever ANY active or reported share on the collection enables those disclosures.
- **Tests Required**: Add 3 regression tests to `tests/customer-profile-sharing.integration.cjs`.
- **Verification Commands**: `node tests/customer-profile-sharing.integration.cjs`

---

<a id="rep-006"></a>
### REP-006 — Commit non-retryable ineligibility on under-14 POST /api/me/sharing-eligibility submissions

- **Task ID**: `REP-006`
- **Related Audit Finding IDs**: [AUD-0006](03_COMPLETE_FINDINGS.md#aud-0006)
- **Priority / Estimated Effort**: **P1** · Effort `S` · ⚡ **Quick Win** · ⚖️ **See Decisions Required**
- **Exact Target Files**: `lib/customer-profile.js`, `tests/customer-profile-sharing.integration.cjs`
- **Objective**: Prevent under-14 DOB submissions on `/api/me/sharing-eligibility` from rolling back to `"unknown"` and allowing immediate adult-DOB retries.
- **Proposed Changes**: Commit `ineligible_under_18` inside `withTransaction` using the `{ deniedError }` return pattern before throwing `403 AGE_INELIGIBLE` (and optionally suspend account / revoke active sessions per product/legal decision).
- **Step-by-Step Instructions**:
  1. In `lib/customer-profile.js:2263-2295`, persist `ineligible_under_18` into `customer_sharing_eligibility` when `evalRes.under_14` is true and return `{ deniedError }` so `withTransaction` commits before throwing `403 AGE_INELIGIBLE`.
  2. Apply product/legal decision (`Decisions Required`) on whether `< 14` input on `/api/me/sharing-eligibility` also sets `auth_users.age_eligibility_status = "ineligible"` + `disabled_at = now()` and revokes `auth_sessions`.
- **Dependencies**: None
- **Potential Side Effects**: Zero raw birth-date values are stored in any column or log.
- **Acceptance Criteria**:
  - Submitting a 12-year-old DOB to `POST /api/me/sharing-eligibility` returns `403` AND persists `ineligible_under_18` so an immediate retry with an adult DOB is also rejected (`403`).
- **Tests Required**: Add under-14 retry-block test to `tests/customer-profile-sharing.integration.cjs`.
- **Verification Commands**: `node tests/customer-profile-sharing.integration.cjs`

---

<a id="rep-007"></a>
### REP-007 — Align /s/<token> staff_beta audience enforcement and complete central ROUTE_FEATURE_ENFORCEMENT_RULES

- **Task ID**: `REP-007`
- **Related Audit Finding IDs**: [AUD-0007](03_COMPLETE_FINDINGS.md#aud-0007)
- **Priority / Estimated Effort**: **P1** · Effort `S` · ⚖️ **See Decisions Required**
- **Exact Target Files**: `server/app.js`, `server/customer-profile-routes.js`, `lib/customer-profile.js`, `lib/feature-controls.js`, `tests/customer-profile-sharing.integration.cjs`
- **Objective**: Ensure `audience = "staff_beta"` behaves predictably on `/s/<token>` and `/s/<token>/photo/<attachment>`, and register explicit feature-gate policies for `/api/me/exploration` and `/api/shared/report`.
- **Proposed Changes**: Pass read-only viewer session (`allowRenewal: false`) into `resolveCallerProfileFeatureFlags` on `/s/<token>` and `/s/<token>/photo/<attachment>` to enforce `.state === "hidden"` (or update Admin UI descriptions if anonymous recipient access during `staff_beta` is desired), and add missing route entries to `ROUTE_FEATURE_ENFORCEMENT_RULES`.
- **Step-by-Step Instructions**:
  1. Resolve product decision (`Decisions Required`) on viewer-gated vs creator-only `staff_beta` semantics for `/s/<token>`.
  2. Pass `viewerUser` (resolved via `auth.resolveSessionFromRequest(req, { allowRenewal: false })`) into `handlePublicSharedPageRequest` and `handlePublicSharedPhotoRequest`, checking `.state === "hidden"` in `resolveLiveSharedCollectionByToken` and `readSharedCollectionPhotoByToken`.
  3. Add explicit entries for `/api/me/exploration` and `/api/shared/report` in `ROUTE_FEATURE_ENFORCEMENT_RULES` (`lib/feature-controls.js:1876-1928`).
- **Dependencies**: [REP-023](#rep-023)
- **Potential Side Effects**: If viewer-gated, anonymous visitors hitting a `staff_beta` share link receive the standard neutral `404` page.
- **Acceptance Criteria**:
  - `staff_beta` behavior on `/s/<token>` and `/s/<token>/photo/<attachment>` matches documented Feature Controls contract and passes automated tests.
- **Tests Required**: Add `staff_beta` `/s/<token>` test in `tests/customer-profile-sharing.integration.cjs`.
- **Verification Commands**: `node tests/customer-profile-sharing.integration.cjs` · `node tests/feature-controls.integration.cjs`

---

<a id="rep-008"></a>
### REP-008 — Eliminate Admin: Mod customer-email ILIKE oracle, mask customer invitation PII, and scrub Top-only diagnostic metadata in /api/admin/audit

- **Task ID**: `REP-008`
- **Related Audit Finding IDs**: [AUD-0008](03_COMPLETE_FINDINGS.md#aud-0008)
- **Priority / Estimated Effort**: **P1** · Effort `M`
- **Exact Target Files**: `server/admin-routes.js`, `lib/admin-governance.js`, `tests/admin-governance.integration.cjs`
- **Objective**: Enforce strict `Admin: Mod` PII masking and Top-only diagnostic/provider redaction across `/api/admin/accounts`, `/api/admin/invitations`, and `/api/admin/audit`.
- **Proposed Changes**: Escape SQL `ILIKE` wildcards across all admin search endpoints, block `Admin: Mod` substring searches against non-staff customer emails, mask `customer_access` emails + provider error telemetry in `/api/admin/invitations`, and strip `diagnostic_group_id` / `fixing_release_sha` for `Mod` in `/api/admin/audit`.
- **Step-by-Step Instructions**:
  1. Export `escapeSqlLike(value)` from `lib/admin-governance.js` and apply `ESCAPE '\\'` to all 6 unescaped admin `ILIKE` queries in `server/admin-routes.js`.
  2. In `server/admin-routes.js:4247-4252`, when `!ctx.isTopAdmin`, match `u.email_normalized ILIKE ...` ONLY when the account holds a `platform_roles` or `vendor_memberships` row (allowing `u.id` lookup for customer accounts).
  3. In `lib/admin-governance.js:301-326` / `server/admin-routes.js:4660`, mask `recipient_email` on `customer_access` invites and redact `last_provider_message_id` / `last_delivery_error_code` when `!ctx.isTopAdmin`.
  4. In `server/admin-routes.js:7240-7244`, strip `diagnostic_group_id` and `fixing_release_sha` from `audit_logs.metadata` when `!ctx.isTopAdmin`.
- **Dependencies**: None
- **Potential Side Effects**: `Admin: Mod` looks up customer accounts by `usr_*` ID rather than partial email substrings.
- **Acceptance Criteria**:
  - `Admin: Mod` `GET /api/admin/accounts?q=cust-prefix` returns `0` customer matches while `GET /api/admin/accounts?q=usr_...` finds the masked customer.
  - `Admin: Mod` `GET /api/admin/invitations` masks `customer_access` emails and omits provider message IDs.
  - `Admin: Mod` `GET /api/admin/audit` omits `diagnostic_group_id` and `fixing_release_sha`.
- **Tests Required**: Add `Admin: Mod` PII/telemetry isolation tests to `tests/admin-governance.integration.cjs`.
- **Verification Commands**: `node tests/admin-governance.integration.cjs`

---

<a id="rep-009"></a>
### REP-009 — Complete BITESHARK_PAUSE_WRITES=all coverage across customer/governance writes and enforce X-BiteShark-Viewpoint: preview centrally

- **Task ID**: `REP-009`
- **Related Audit Finding IDs**: [AUD-0014](03_COMPLETE_FINDINGS.md#aud-0014)
- **Priority / Estimated Effort**: **P1** · Effort `M`
- **Exact Target Files**: `lib/feature-controls.js`, `server/admin-routes.js`, `server/customer-exploration-routes.js`, `tests/feature-controls.integration.cjs`, `tests/admin-governance.integration.cjs`
- **Objective**: Make `BITESHARK_PAUSE_WRITES=all` halt all non-emergency disk/DB writes (including 5 MiB photo uploads and onboarding evidence) and block all mutating requests sent from read-only Admin Preview.
- **Proposed Changes**: Map `visit_journal`, `private_photos`, `suggested_trails`, and `admin_style_guide_workspace` in `PAUSE_SCOPE_BY_FEATURE_KEY`, add `enforceWritePause` to remaining mutating routes in `server/admin-routes.js` (preserving `/api/admin/features` and `/api/me/shares/revoke`), and enforce `isPreviewViewpoint` once at the entry of `handleGovernanceApiRequest`.
- **Step-by-Step Instructions**:
  1. Map `visit_journal`, `private_photos`, `suggested_trails` -> `"exploration"` and `admin_style_guide_workspace` -> `"style_guide"` in `lib/feature-controls.js:1161-1167`.
  2. Add `enforceWritePause` checks to mutating `/api/community/report`, `/api/vendor/*`, `/api/onboarding/*`, and `/api/issues*` routes in `server/admin-routes.js` (keeping `/api/admin/features` and `/api/me/shares/revoke` exempt).
  3. At the top of `handleGovernanceApiRequest` (`server/admin-routes.js:625`), reject any `method !== "GET" && method !== "HEAD"` with `403 { error: "Preview mode is read-only.", code: "PREVIEW_READ_ONLY" }` when `isPreviewViewpoint` is true and `normPath` is neither `"/api/admin/viewpoint"` nor `"/api/diagnostics/report"`.
- **Dependencies**: [REP-004](#rep-004)
- **Potential Side Effects**: Read-only preview sessions (`X-BiteShark-Viewpoint: preview`) are strictly blocked at the API boundary across all 52+ governance/exploration/profile routes.
- **Acceptance Criteria**:
  - `BITESHARK_PAUSE_WRITES=all` returns `503` on `POST /api/me/photos`, `POST /api/me/visits`, `POST /api/onboarding/evidence`, and `POST /api/issues`, while allowing `POST /api/me/shares/revoke` and `POST /api/admin/features`.
  - Any mutating request carrying `X-BiteShark-Viewpoint: preview` (except `/api/admin/viewpoint` and `/api/diagnostics/report`) returns `403 PREVIEW_READ_ONLY`.
- **Tests Required**: Extend `tests/feature-controls.integration.cjs` and `tests/admin-governance.integration.cjs`.
- **Verification Commands**: `node tests/feature-controls.integration.cjs` · `node tests/admin-governance.integration.cjs`

---

<a id="rep-010"></a>
### REP-010 — Isolate browser_untrusted diagnostic eviction pool, prevent actor_id spoofing, and harden secret/cookie regex redaction

- **Task ID**: `REP-010`
- **Related Audit Finding IDs**: [AUD-0009](03_COMPLETE_FINDINGS.md#aud-0009)
- **Priority / Estimated Effort**: **P1** · Effort `M`
- **Exact Target Files**: `lib/diagnostics.js`, `public/diagnostics-client.js`, `server/admin-routes.js`, `deploy/bin/biteshark-staging2-ctl`, `deploy/install-staging-release.sh`, `tests/diagnostics-and-reliability.integration.cjs`, `tests/staging2-ctl-security.test.cjs`
- **Objective**: Prevent unauthenticated browser telemetry from evicting `server_verified` or issue-linked incidents, block `actor_id` spoofing, and close underscore word-boundary and sandbox-cookie redaction gaps.
- **Proposed Changes**: Cap `browser_untrusted` groups separately (never evicting `server_verified` or `support_issue_diagnostic_links` targets), strip untrusted `actor_id`, replace `\b` with underscore-aware boundaries + 22-char secret scrubbing, and redact `__Host-bs_admin_test_session` in deploy scripts.
- **Step-by-Step Instructions**:
  1. In `lib/diagnostics.js:1008-1025`, cap `browser_untrusted` incident groups at `150` and restrict untrusted eviction strictly to `trust_source = 'browser_untrusted' AND NOT EXISTS (SELECT 1 FROM support_issue_diagnostic_links l WHERE l.diagnostic_group_id = diagnostic_incident_groups.id)`; also exclude linked groups from `server_verified` eviction when unlinked groups exist.
  2. In `server/admin-routes.js:695-712`, delete `actor_id`, `actor_role`, and `session_id` from incoming `body.safe_context` before merging verified `req.user?.id`.
  3. In `lib/diagnostics.js:85-190` and `public/diagnostics-client.js:69-82`, replace `\b` before `password|secret|token|cookie|session` with `(?:^|[^A-Za-z0-9]|_)`, scrub `__Host-bs_admin_test_session`, and catch 22+ char base64url secrets.
  4. Update `deploy/bin/biteshark-staging2-ctl:144` and `deploy/install-staging-release.sh:737` to redact `(__Host-(?:truckly_session|bs_admin_test_session)=)[^;\s"']+`.
- **Dependencies**: None
- **Potential Side Effects**: None.
- **Acceptance Criteria**:
  - 200 distinct unauthenticated `POST /api/diagnostics/report` fingerprints cannot evict a single `server_verified` group or unlink `support_issue_diagnostic_links`.
  - `sanitizeDiagnosticText("auth_secret=abcdefghijklmnopqrstuv12")` and `unsubscribe_token=...` redact 100% of secret values, and `staging2-ctl` redacts `__Host-bs_admin_test_session`.
- **Tests Required**: Extend `tests/diagnostics-and-reliability.integration.cjs` and `tests/staging2-ctl-security.test.cjs`.
- **Verification Commands**: `node tests/diagnostics-and-reliability.integration.cjs` · `node tests/staging2-ctl-security.test.cjs`

---

<a id="rep-011"></a>
### REP-011 — Add Subresource Integrity (SRI) and non-blocking load to Leaflet CDN assets (or vendor locally) and add HTML Content-Security-Policy headers

- **Task ID**: `REP-011`
- **Related Audit Finding IDs**: [AUD-0010](03_COMPLETE_FINDINGS.md#aud-0010)
- **Priority / Estimated Effort**: **P1** · Effort `S` · ⚡ **Quick Win**
- **Exact Target Files**: `public/index.html`, `server/app.js`, `tests/map-resilience.test.cjs`
- **Objective**: Eliminate unverified third-party CDN script execution on BiteShark's origin, prevent `unpkg.com` stalls from blocking first-party scripts, and add CSP protection to `/admin`, `/login.html`, and `/`.
- **Proposed Changes**: Add SHA-384 `integrity` + `crossorigin="anonymous"` + `defer` (or local vendoring under `public/vendor/leaflet/`) for Leaflet 1.9.4, and set strict `Content-Security-Policy` on `/admin` and `/login.html` plus baseline `frame-ancestors 'none'; object-src 'none'; base-uri 'self'` on `/`.
- **Step-by-Step Instructions**:
  1. Compute exact SHA-384 digests for `leaflet@1.9.4/dist/leaflet.css` and `leaflet@1.9.4/dist/leaflet.js` and add `integrity="sha384-..." crossorigin="anonymous"` (plus non-blocking load or local `public/vendor/leaflet/` copy) in `public/index.html:7, 459`.
  2. In `server/app.js:248-252` (and `/admin` HTML handler), add strict `Content-Security-Policy` (`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'`) on `/admin` and `/login.html`, and `object-src 'none'; base-uri 'self'; frame-ancestors 'none'` baseline CSP on `/`.
- **Dependencies**: None
- **Potential Side Effects**: Verify zero inline `onclick` attributes exist in `public/admin.html`, `public/admin.js`, `public/admin-style-guide.js`, and `public/login.html` before enabling `script-src 'self'` on those two pages!
- **Acceptance Criteria**:
  - No external `<script>` or `<link rel="stylesheet">` in `public/*.html` loads without `integrity` + `crossorigin="anonymous"`.
  - `GET /admin` and `GET /login.html` emit strict `Content-Security-Policy` with zero browser console CSP errors.
- **Tests Required**: Assert SRI & CSP headers in `tests/map-resilience.test.cjs` and run `tests/admin-portal-browser.e2e.cjs`.
- **Verification Commands**: `node tests/map-resilience.test.cjs` · `node tests/admin-portal-browser.e2e.cjs`

---

<a id="rep-013"></a>
### REP-013 — Validate & cap favorites/toggle writes and enable FORCE ROW LEVEL SECURITY on user-scoped favorites and notification_settings tables

- **Task ID**: `REP-013`
- **Related Audit Finding IDs**: [AUD-0012](03_COMPLETE_FINDINGS.md#aud-0012)
- **Priority / Estimated Effort**: **P1** · Effort `M`
- **Exact Target Files**: `api/favorites/toggle.js`, `api/notifications/settings.js`, `lib/admin-test-customer.js`, `migrations/030_harden_synthetic_sandbox_and_rls.sql`, `docs/engineering/DATA-MODEL.md`, `tests/backend-hardening.integration.cjs`
- **Objective**: Enforce real PostgreSQL `FORCE ROW LEVEL SECURITY` where `app.user_id` GUCs are already set (`favorites`, `notification_settings`) and block arbitrary/unbounded `truck_id` stuffing in `favorites`.
- **Proposed Changes**: Validate `truck_id` against `TRUCKS`/`vendors`, cap `favorites` at 200 rows per user with rate limiting, ensure `lib/admin-test-customer.js` sets `app.user_id` to `SYNTHETIC_TEST_CUSTOMER_USER_ID` when seeding/resetting sandbox `favorites`, and add `FORCE ROW LEVEL SECURITY` on `favorites` and `notification_settings` in Migration `030`.
- **Step-by-Step Instructions**:
  1. In `api/favorites/toggle.js`, verify `truckId` exists in `TRUCKS` or active `vendors`, enforce a 200-row per-user cap on `INSERT`, and execute inside `withTransaction` (`app.user_id` GUC).
  2. Verify every SQL touchpoint of `favorites` and `notification_settings` (`npm run registry:locate -- favorites` and `notification_settings`), ensuring `lib/admin-test-customer.js` sets `set_config('app.user_id', SYNTHETIC_TEST_CUSTOMER_USER_ID, true)` around sandbox `favorites` seed/reset.
  3. In `migrations/030_harden_synthetic_sandbox_and_rls.sql`, enable + `FORCE ROW LEVEL SECURITY` on `favorites` and `notification_settings` keyed on `user_id = current_setting('app.user_id', true)`, and document remaining governance-table access models in `docs/engineering/DATA-MODEL.md`.
- **Dependencies**: [REP-002](#rep-002)
- **Potential Side Effects**: High-care database migration: test `admin-test-customer`, `customer-profile-sharing`, and `backend-hardening` against PostgreSQL before merging.
- **Acceptance Criteria**:
  - `POST /api/favorites/toggle` rejects unknown `truck_id` values (`400`/`404`) and enforces `FORCE ROW LEVEL SECURITY` in PostgreSQL (`SCHEMA-INVENTORY.md` reflects updated count).
- **Tests Required**: Run `backend-hardening`, `customer-profile-sharing`, `admin-test-customer`, and `code-registry --verify-db`.
- **Verification Commands**: `node tests/backend-hardening.integration.cjs` · `node tests/customer-profile-sharing.integration.cjs` · `node tests/admin-test-customer.integration.cjs` · `npm run registry:docs` · `npm run registry:validate`

---

<a id="rep-018"></a>
### REP-018 — Destroy poisoned PoolClients on ROLLBACK failure in packages/runtime-adapter and lib/db-tx.js

- **Task ID**: `REP-018`
- **Related Audit Finding IDs**: [AUD-0019](03_COMPLETE_FINDINGS.md#aud-0019)
- **Priority / Estimated Effort**: **P1** · Effort `S` · ⚡ **Quick Win**
- **Exact Target Files**: `packages/runtime-adapter/index.js`, `lib/db-tx.js`, `tests/backend-hardening.integration.cjs`
- **Objective**: Prevent broken or aborted PostgreSQL connections from returning to the 8-connection `pg.Pool` when `ROLLBACK` throws.
- **Proposed Changes**: Capture `ROLLBACK` errors in `releaseErr` and pass `client.release(releaseErr)` in `finally`.
- **Step-by-Step Instructions**:
  1. In `lib/db-tx.js:214-224` and `packages/runtime-adapter/index.js:94-112`, track `let releaseErr = false;`, set `releaseErr = rbErr || true` if `client.query("ROLLBACK")` rejects, and call `client.release(releaseErr)` in `finally`.
- **Dependencies**: None
- **Potential Side Effects**: None on healthy connections (`client.release(false)`).
- **Acceptance Criteria**:
  - When `ROLLBACK` throws on a checked-out client, `client.release` is invoked with a truthy error argument so `pg.Pool` destroys the socket.
- **Tests Required**: Add mock `ROLLBACK`-failure unit check in `tests/backend-hardening.integration.cjs`.
- **Verification Commands**: `node tests/backend-hardening.integration.cjs`

---

## Phase B — Broken Functionality (14 Tasks)

Restore broken privacy share-revocation fallback UX, 90-day evidence retention, worker batch-failure heartbeats, SessionEligibilityError mapping, staging2 systemd/CI parity, sandbox `/profile` wiring & skipped CI assertions, booking rate limits, and governance workflow state machines.

<a id="rep-012"></a>
### REP-012 — Enforce vendor hidden_from_discovery and is_active governance filters on /api/community/list and /api/community/post

- **Task ID**: `REP-012`
- **Related Audit Finding IDs**: [AUD-0011](03_COMPLETE_FINDINGS.md#aud-0011)
- **Priority / Estimated Effort**: **P1** · Effort `S` · ⚡ **Quick Win**
- **Exact Target Files**: `api/community/list.js`, `api/community/post.js`, `tests/p1-unified-discovery.integration.cjs`
- **Objective**: Prevent deactivated or hidden vendors from appearing in public community feeds or accepting new community posts.
- **Proposed Changes**: Join `vendors` in `api/community/list.js` (`COALESCE(v.is_active, true) = true AND COALESCE(v.hidden_from_discovery, false) = false`) and check `hidden_from_discovery` in `api/community/post.js`.
- **Step-by-Step Instructions**:
  1. Update `api/community/list.js:8-15` SQL query to `LEFT JOIN vendors v ON v.id = community_reviews.place_id` and filter `COALESCE(v.is_active, true) = true AND COALESCE(v.hidden_from_discovery, false) = false`.
  2. Update `api/community/post.js:95-105` to select `hidden_from_discovery` and return `403`/`404` when `vRow.hidden_from_discovery === true` (and verify unseeded `place_id`s exist in `TRUCKS`).
- **Dependencies**: None
- **Potential Side Effects**: Hidden/deactivated vendor reviews stay preserved in `community_reviews` and reappear automatically if the vendor is later unhidden.
- **Acceptance Criteria**:
  - Hiding or deactivating a vendor via `/api/admin/vendors/status` immediately removes its posts from `GET /api/community/list` and blocks `POST /api/community/post`.
- **Tests Required**: Add vendor-suppression community checks to `tests/p1-unified-discovery.integration.cjs`.
- **Verification Commands**: `node tests/p1-unified-discovery.integration.cjs`

---

<a id="rep-014"></a>
### REP-014 — Restore active share revocation in hidden customer_profile fallback UI, preserve Greatest Hits drafts/confirmations, and purge cross-account profile caches

- **Task ID**: `REP-014`
- **Related Audit Finding IDs**: [AUD-0015](03_COMPLETE_FINDINGS.md#aud-0015), [AUD-0027](03_COMPLETE_FINDINGS.md#aud-0027), [AUD-0034](03_COMPLETE_FINDINGS.md#aud-0034)
- **Priority / Estimated Effort**: **P1** · Effort `M`
- **Exact Target Files**: `public/customer-profile.js`, `public/greatest-hits.js`, `public/greatest-hits-sharing.js`, `public/profile-client.js`, `public/role-experience.js`, `public/app.js`, `tests/customer-profile-browser.e2e.cjs`
- **Objective**: Ensure users can always see and revoke live `/s/<token>` share links when `customer_profile` is hidden, never lose unsaved Greatest Hits drafts or skip live-update consent, and never retain cached profile/share state across account switches.
- **Proposed Changes**: Call `window.bitesharkProfile.listShares()` in `renderFeatureDisabledWithPrivacyFallback`, keep a Privacy/Shared-Links entry point visible in `role-experience.js`, sync DOM drafts + require explicit `confirm_shared_view_update` + refresh `ownerPhotosCache` in `greatest-hits*.js`, and sync `bitesharkProfile` across all `syncAuthAndUserData` branches in `public/app.js`.
- **Step-by-Step Instructions**:
  1. In `public/customer-profile.js:131-165, 686-690`, call `await window.bitesharkProfile.listShares()` when `customer_profile` is disabled and pass `{ active_shares_summary: { items } }` to `renderStandalonePrivacyToolsCard` (rendering an explicit error banner if `listShares` fails); keep a `"Privacy & shared links"` item visible in `public/role-experience.js:1385-1400`.
  2. In `public/greatest-hits.js` and `public/greatest-hits-sharing.js`, call `syncDraftFieldsFromDom` inside `rerender`, refresh `listPhotos` whenever opening the photo picker, hide photo-attach on unsaved spots, and prompt for `confirm_shared_view_update` instead of hardcoding `true` at `line 601`.
  3. In `public/app.js:1685-1713` and `public/profile-client.js:93-105`, invoke `window.bitesharkProfile.syncActiveUserScope` and `window.bitesharkResetProfileUiOnAuthChange()` on `403` and degraded auth transitions.
- **Dependencies**: None
- **Potential Side Effects**: Update `tests/customer-profile-browser.e2e.cjs` if any test step attaches a photo onto an already-live photo-enabled share without confirming.
- **Acceptance Criteria**:
  - With `customer_profile = hidden`, `/#profile-privacy` lists active `bs_…` links and revokes them cleanly.
  - Opening Preview or Photo Picker preserves unsaved `#ghEditIntroInput` text.
  - Switching into an unassessed (`403`) account clears `window.bitesharkProfile` memory state.
- **Tests Required**: Extend `tests/customer-profile-browser.e2e.cjs`.
- **Verification Commands**: `node tests/customer-profile-browser.e2e.cjs`

---

<a id="rep-015"></a>
### REP-015 — Enforce 90-day vendor_application_evidence retention and run notification/rate-limit scrubbing even when Web Push is disabled

- **Task ID**: `REP-015`
- **Related Audit Finding IDs**: [AUD-0016](03_COMPLETE_FINDINGS.md#aud-0016)
- **Priority / Estimated Effort**: **P1** · Effort `M`
- **Exact Target Files**: `server/admin-routes.js`, `lib/pager-notifications.js`, `api/pager/worker.js`, `scripts/run-pager-worker.cjs`, `deploy/systemd/biteshark-staging2-worker.service`, `tests/legal-readiness.integration.cjs`, `tests/pager-notifications.integration.cjs`
- **Objective**: Fulfill BiteShark's published 90-day onboarding evidence retention policy and ensure expired push keys and rate-limit buckets are scrubbed even when `BITESHARK_PUSH_PROVIDER_MODE=disabled`.
- **Proposed Changes**: Block expired downloads (`retention_expires_at <= now()`) in `GET /api/onboarding/evidence`, purge expired `vendor_application_evidence` rows in periodic worker maintenance, run `purgeExpiredNotificationRecords` before `provider.mode === "disabled"` early returns, and commit `biteshark-staging2-worker.service`.
- **Step-by-Step Instructions**:
  1. In `server/admin-routes.js:7981-8000`, reject downloads where `e.retention_expires_at <= now()` with `410 { error: "Supporting evidence retention period (90 days) has expired." }`.
  2. In `lib/pager-notifications.js:1715-1755`, run `await purgeExpiredNotificationRecords(dbAdapter, { now })` BEFORE returning early on `provider.mode === "disabled"` or paused/hidden feature flags.
  3. Add bounded `DELETE FROM vendor_application_evidence WHERE retention_expires_at <= now()` maintenance inside `api/pager/worker.js` and `scripts/run-pager-worker.cjs`, and add `deploy/systemd/biteshark-staging2-worker.service`.
- **Dependencies**: None
- **Potential Side Effects**: Confirm `app_role` has `DELETE` grant on `vendor_application_evidence` (`migrations/018` / `030`).
- **Acceptance Criteria**:
  - Expired `vendor_application_evidence` rows return `410` on download and are deleted by worker maintenance.
  - Running a worker tick with `BITESHARK_PUSH_PROVIDER_MODE=disabled` purges expired push keys and stale `pager_rate_limits` rows.
- **Tests Required**: Add retention/scrubbing assertions to `tests/legal-readiness.integration.cjs` and `tests/pager-notifications.integration.cjs`.
- **Verification Commands**: `node tests/legal-readiness.integration.cjs` · `node tests/pager-notifications.integration.cjs`

---

<a id="rep-016"></a>
### REP-016 — Re-throw SessionEligibilityError in profile & account-context routes, map PhotoStorageError, and validate related_review_id in POST /api/issues

- **Task ID**: `REP-016`
- **Related Audit Finding IDs**: [AUD-0017](03_COMPLETE_FINDINGS.md#aud-0017)
- **Priority / Estimated Effort**: **P1** · Effort `S` · ⚡ **Quick Win**
- **Exact Target Files**: `server/customer-profile-routes.js`, `server/admin-routes.js`, `tests/customer-profile-sharing.integration.cjs`, `tests/support-feedback.integration.cjs`
- **Objective**: Stop turning normal `401`/`403` session revocations and missing photo files into `500`/`503` server incidents, and eliminate the `23503` `500` crash + private-review oracle on `POST /api/issues`.
- **Proposed Changes**: Re-throw `SessionEligibilityError` in `server/customer-profile-routes.js` and `GET /api/account/context`, map `PhotoStorageError` in `sendProfileError`, and check `community_reviews` existence + visibility before inserting `support_issues`.
- **Step-by-Step Instructions**:
  1. In `server/customer-profile-routes.js:665` and `server/admin-routes.js:854`, add `if (err instanceof SessionEligibilityError || err?.isSessionEligibilityError) throw err;`, and map `PhotoStorageError` in `sendProfileError` (`lines 169-188`).
  2. In `server/admin-routes.js:2440-2525` (`POST /api/issues`), verify `relatedReviewId` exists in `community_reviews` with `(status = 'approved' OR author_id = $2 OR $3 = true)` (where `$3` is `ctx.canAccessAdminPortal`), returning uniform `400` otherwise.
- **Dependencies**: None
- **Potential Side Effects**: None.
- **Acceptance Criteria**:
  - Revoking a session mid-flight on `/api/me/profile` or `/api/account/context` returns `401 SESSION_REVOKED` with zero `5xx` diagnostics.
  - `POST /api/issues` with a nonexistent `related_review_id` or another user's `pending` post returns `400` (never `500` or `201`).
- **Tests Required**: Add tests to `tests/customer-profile-sharing.integration.cjs` and `tests/support-feedback.integration.cjs`.
- **Verification Commands**: `node tests/customer-profile-sharing.integration.cjs` · `node tests/support-feedback.integration.cjs`

---

<a id="rep-017"></a>
### REP-017 — Fix pager worker summary key mismatch (failed_permanent/delivered) to restore PUSH_DELIVERY_BATCH_FAILURE diagnostics and degraded heartbeats

- **Task ID**: `REP-017`
- **Related Audit Finding IDs**: [AUD-0018](03_COMPLETE_FINDINGS.md#aud-0018)
- **Priority / Estimated Effort**: **P1** · Effort `S` · ⚡ **Quick Win**
- **Exact Target Files**: `api/pager/worker.js`, `scripts/run-pager-worker.cjs`, `tests/pager-notifications.integration.cjs`
- **Objective**: Restore dead failure-detection branches in `api/pager/worker.js` and `scripts/run-pager-worker.cjs` when Web Push batches fail.
- **Proposed Changes**: Read `out.failed_permanent` (and `out.retried`) and `out.delivered` instead of nonexistent `out.failed` and `out.sent`.
- **Step-by-Step Instructions**:
  1. In `api/pager/worker.js:126-152` and `scripts/run-pager-worker.cjs:145-150, 242-260`, read `const failedCount = Number(out?.failed_permanent ?? 0); const retriedCount = Number(out?.retried ?? 0); const sentCount = Number(out?.delivered ?? 0);` and record `degraded` heartbeat + `PUSH_DELIVERY_BATCH_FAILURE` when `failedCount > 0 && sentCount === 0`.
- **Dependencies**: None
- **Potential Side Effects**: Permanent push failures will now surface accurately in `/admin` Diagnostics & Readiness.
- **Acceptance Criteria**:
  - A batch where all push deliveries fail permanently records `PUSH_DELIVERY_BATCH_FAILURE` and sets `worker_heartbeats.worker_status = "degraded"`.
- **Tests Required**: Add permanent batch-failure heartbeat assertion in `tests/pager-notifications.integration.cjs`.
- **Verification Commands**: `node tests/pager-notifications.integration.cjs`

---

<a id="rep-019"></a>
### REP-019 — Fix staging2 systemd ReadWritePaths, commit backup-staging2.sh, tighten CI push RUNTIME_DIFF, and sync Nginx/worker/tarball templates

- **Task ID**: `REP-019`
- **Related Audit Finding IDs**: [AUD-0020](03_COMPLETE_FINDINGS.md#aud-0020), [AUD-0037](03_COMPLETE_FINDINGS.md#aud-0037)
- **Priority / Estimated Effort**: **P1** · Effort `S` · ⚡ **Quick Win**
- **Exact Target Files**: `deploy/systemd/biteshark-staging2-api.service`, `deploy/backup/backup-staging2.sh`, `deploy/nginx/truckly-staging.conf.template`, `deploy/systemd/truckly-staging-worker.service`, `scripts/build-linux-release-tarball.cjs`, `.github/workflows/truckly-source-review.yml`, `tests/vps-platform-contract.test.cjs`
- **Objective**: Eliminate `EROFS` deployment drift on `staging2`, track `backup-staging2.sh` in Git, prevent follow-up docs commits from bypassing failed CI runtime suites, and align Nginx/worker/tarball configs.
- **Proposed Changes**: Add `-/var/lib/biteshark-staging2/style-guide` to `biteshark-staging2-api.service`, commit `deploy/backup/backup-staging2.sh`, force full runtime CI on pushes to `working/biteshark-vps`/`main` + include `.github/workflows` & `package.json` in `RUNTIME_DIFF`, sync `truckly-staging.conf.template`, raise worker `TimeoutStopSec=35`, and dynamically verify all `migrations/*.sql` in `build-linux-release-tarball.cjs`.
- **Step-by-Step Instructions**:
  1. Update `deploy/systemd/biteshark-staging2-api.service:39` to include `-/var/lib/biteshark-staging2/style-guide` and `deploy/systemd/truckly-staging-worker.service:15` to `TimeoutStopSec=35`.
  2. Create `deploy/backup/backup-staging2.sh` setting staging2 defaults and delegating to `truckly-staging-backup.sh` (or shared backup logic), and sync `/api/onboarding/evidence` (`1m`) + `/debug-admin.*` blocks into `deploy/nginx/truckly-staging.conf.template`.
  3. Update `scripts/build-linux-release-tarball.cjs` to dynamically require all `migrations/*.sql` files + `lib/customer-profile.js` + `public/customer-profile.js`.
  4. In `.github/workflows/truckly-source-review.yml:195-209`, include `.github/workflows package.json` in `RUNTIME_DIFF` and run full runtime gates unconditionally on `push` to `working/biteshark-vps` or `main`.
- **Dependencies**: None
- **Potential Side Effects**: Pushes directly to `working/biteshark-vps` always run full verification suites.
- **Acceptance Criteria**:
  - `node tests/vps-platform-contract.test.cjs` verifies `style-guide` `ReadWritePaths` on both API units, `backup-staging2.sh` existence, and `TimeoutStopSec >= 30` on worker.
- **Tests Required**: Extend `tests/vps-platform-contract.test.cjs`.
- **Verification Commands**: `node tests/vps-platform-contract.test.cjs`

---

<a id="rep-020"></a>
### REP-020 — Fix hasCustomerProfileSurface(), un-skip CI sandbox profile isolation assertions, and resolve sandbox overlay /admin & reset edge cases

- **Task ID**: `REP-020`
- **Related Audit Finding IDs**: [AUD-0021](03_COMPLETE_FINDINGS.md#aud-0021), [AUD-0022](03_COMPLETE_FINDINGS.md#aud-0022)
- **Priority / Estimated Effort**: **P1** · Effort `M`
- **Exact Target Files**: `lib/admin-test-customer.js`, `lib/standalone-auth.js`, `server/app.js`, `server/admin-routes.js`, `public/admin.js`, `tests/admin-test-customer.integration.cjs`
- **Objective**: Restore `/profile` navigation in Test Customer Sandbox, activate all skipped profile/visit isolation assertions in CI, keep `/admin` evidence & telemetry working while sandboxed, clear stale overlay cookies on OTP login, and complete sandbox `reset` cleanup.
- **Proposed Changes**: Check `public/customer-profile.js` in `hasCustomerProfileSurface()`, remove `if (hasProfile)` skips in `tests/admin-test-customer.integration.cjs`, bypass overlay on `/api/onboarding/evidence?...&admin_portal=1` + use `apiFetch` for `/api/pager/telemetry` in `admin.js`, clear `__Host-bs_admin_test_session` on `/api/auth/verify`, fix `available_for_top_admin` at `server/admin-routes.js:944`, and clean `vendor_applications`/`community_reports`/`community_reviews`/`support_issues` on sandbox reset.
- **Step-by-Step Instructions**:
  1. Update `hasCustomerProfileSurface()` (`lib/admin-test-customer.js:37-39`) to check `public/customer-profile.js` and `lib/customer-profile.js`.
  2. In `server/app.js:500-516` and `public/admin.js:625, 3610`, bypass the sandbox overlay when `admin_portal=1` query param is present on `/api/onboarding/evidence` and ensure `/api/pager/telemetry` sends `X-BiteShark-Admin-Portal: 1`; clear `__Host-bs_admin_test_session` on `POST /api/auth/verify`.
  3. Fix `server/admin-routes.js:944` (`ctx.canAccessAdminPortal`) and delete sandbox-authored rows from `community_reports`, `support_issues`, `community_reviews`, and `vendor_applications` in `resetAdminTestCustomerData` (`lib/admin-test-customer.js:564-585`).
  4. Remove dead `public/profile.html` checks in `tests/admin-test-customer.integration.cjs:278` so all profile/visit/collection isolation assertions run unconditionally.
- **Dependencies**: [REP-002](#rep-002)
- **Potential Side Effects**: None.
- **Acceptance Criteria**:
  - `GET /api/admin/test-customer` returns `has_profile_page: true`.
  - `tests/admin-test-customer.integration.cjs` executes all `visits`, `collections`, `/api/me/profile`, and real-customer visit-isolation assertions.
  - Evidence downloads and pager telemetry in `/admin` succeed while `__Host-bs_admin_test_session` is active.
- **Tests Required**: Run and expand `tests/admin-test-customer.integration.cjs`.
- **Verification Commands**: `node tests/admin-test-customer.integration.cjs`

---

<a id="rep-021"></a>
### REP-021 — Rate-limit POST /api/bookings/create and add status filtering & pagination to GET /api/owner/requests

- **Task ID**: `REP-021`
- **Related Audit Finding IDs**: [AUD-0023](03_COMPLETE_FINDINGS.md#aud-0023)
- **Priority / Estimated Effort**: **P2** · Effort `S`
- **Exact Target Files**: `api/bookings/create.js`, `api/owner/requests.js`, `public/app.js`, `tests/backend-hardening.integration.cjs`
- **Objective**: Prevent unthrottled booking submissions from pushing legitimate vendor event inquiries out of the `LIMIT 25` owner dashboard.
- **Proposed Changes**: Add per-IP/per-user rate limiting and a pending-per-(user, vendor) cap on `api/bookings/create.js`, and add `?status=` + `?limit=`/`?offset=` support to `api/owner/requests.js`.
- **Step-by-Step Instructions**:
  1. Enforce bounded rate limits (max 5/15m per IP/user) and max 3 `pending` bookings per `(user_id, truck_id)` in `api/bookings/create.js`.
  2. Support optional `status`, `limit` (`<= 50`), and `offset` query params in `api/owner/requests.js:135-145` and raise/paginate `.slice(0, 15)` in `public/app.js:3348`.
- **Dependencies**: None
- **Potential Side Effects**: Preserve default array response shape on `GET /api/owner/requests` when no pagination envelope is requested.
- **Acceptance Criteria**:
  - Burst booking spam triggers `429` before reaching 25 rows, and owners can filter `status=pending` beyond 25 historical inquiries.
- **Tests Required**: Add booking rate-limit and owner pagination tests in `tests/backend-hardening.integration.cjs`.
- **Verification Commands**: `node tests/backend-hardening.integration.cjs`

---

<a id="rep-023"></a>
### REP-023 — Decouple read-only session lookup from sliding-window DB renewal when Set-Cookie is not emitted

- **Task ID**: `REP-023`
- **Related Audit Finding IDs**: [AUD-0025](03_COMPLETE_FINDINGS.md#aud-0025)
- **Priority / Estimated Effort**: **P2** · Effort `S` · ⚡ **Quick Win**
- **Exact Target Files**: `lib/standalone-auth.js`, `server/app.js`, `tests/standalone-runtime-auth.integration.cjs`
- **Objective**: Keep `auth_sessions.expires_at` synchronized with browser cookie `Max-Age` by extending DB expiry only on responses that actually emit `Set-Cookie`.
- **Proposed Changes**: Add `{ allowRenewal: false }` option to `resolveSessionFromRequest` for `/s/<token>` routes, and emit `appendSetCookie(res, sess.refreshedCookie)` on first-party HTML routes (`/admin`, `/profile`).
- **Step-by-Step Instructions**:
  1. Update `resolveSessionFromRequest(req, options = {})` (`lib/standalone-auth.js:2560-2615`) to skip `maybeExtendSessionIfNeeded` when `options.allowRenewal === false`.
  2. Pass `{ allowRenewal: false }` on `/s/<token>` (`server/app.js:1345`) and append `sess.refreshedCookie` when present on `/admin` (`line 1121`) and `/profile` (`line 1268`).
- **Dependencies**: None
- **Potential Side Effects**: Never emit `Set-Cookie` on `/s/<token>` unlisted shared responses.
- **Acceptance Criteria**:
  - Visiting `/s/<token>` past session half-life does not mutate `auth_sessions.expires_at`, and the next `/api/auth/session` request emits a refreshed `Set-Cookie`.
- **Tests Required**: Add half-life cookie-sync test in `tests/standalone-runtime-auth.integration.cjs`.
- **Verification Commands**: `node tests/standalone-runtime-auth.integration.cjs`

---

<a id="rep-024"></a>
### REP-024 — Prevent soft-deleted idempotency_key collisions (23505 HTTP 500) across visits, photos, trails, and collections

- **Task ID**: `REP-024`
- **Related Audit Finding IDs**: [AUD-0026](03_COMPLETE_FINDINGS.md#aud-0026)
- **Priority / Estimated Effort**: **P2** · Effort `S` · ⚡ **Quick Win**
- **Exact Target Files**: `lib/customer-exploration.js`, `lib/customer-profile.js`, `tests/customer-exploration.integration.cjs`, `tests/customer-profile-sharing.integration.cjs`
- **Objective**: Allow re-creating or re-importing (`legp_idx_0`) visits, photos, saved trails, and collections after soft-deletion without hitting PostgreSQL `23505` unique index errors.
- **Proposed Changes**: Clear `idempotency_key = NULL` when soft-deleting rows AND pass `null` for `idempotency_key` on `INSERT` if a prior soft-deleted row holds the same key.
- **Step-by-Step Instructions**:
  1. In `logUserVisit`, `createUserPhoto`, `saveUserTrail` (`lib/customer-exploration.js`), and `createOwnerCollection` (`lib/customer-profile.js`), substitute `null` for `idempotency_key` when `idempRes.rows[0]?.deleted_at` is non-null.
  2. Set `idempotency_key = NULL` in `deleteUserVisit`, `deleteUserPhoto`, `deleteUserSavedTrail`, `deleteOwnerCollection`, and `clearCustomerProfileAndCollectionsData`.
- **Dependencies**: None
- **Potential Side Effects**: Zero schema changes required; preserves immutable Migration `027`/`029` checksums.
- **Acceptance Criteria**:
  - Creating, deleting, and re-creating a visit, photo, saved trail, and collection with the same `idempotency_key` returns `201` on all four resources.
- **Tests Required**: Add delete-then-recreate idempotency tests in `tests/customer-exploration.integration.cjs` and `tests/customer-profile-sharing.integration.cjs`.
- **Verification Commands**: `node tests/customer-exploration.integration.cjs` · `node tests/customer-profile-sharing.integration.cjs`

---

<a id="rep-025"></a>
### REP-025 — Wire /api/me/shares/update-settings UI, enforce lazy share expiry on rotate/update, and resolve disconnected outbox & admin endpoints

- **Task ID**: `REP-025`
- **Related Audit Finding IDs**: [AUD-0028](03_COMPLETE_FINDINGS.md#aud-0028), [AUD-0035](03_COMPLETE_FINDINGS.md#aud-0035)
- **Priority / Estimated Effort**: **P2** · Effort `M` · ⚖️ **See Decisions Required**
- **Exact Target Files**: `lib/customer-profile.js`, `public/greatest-hits-sharing.js`, `server/admin-routes.js`, `tests/customer-profile-sharing.integration.cjs`, `tests/invitation-workflow.integration.cjs`
- **Objective**: Connect in-place share settings editing to the UI, block rotating/updating time-expired links without a future expiry, add tests for `/api/admin/invitations/resend`, and resolve the write-only `admin_notification_outbox` sink.
- **Proposed Changes**: Check `cur.expires_at <= now` in `updateCollectionShareSettings` and `rotateCollectionShareLink`, wire `updateShareSettings` UI controls in `public/greatest-hits-sharing.js`, test `/api/admin/invitations/resend`, and apply product decision on `admin_notification_outbox` & legacy routes.
- **Step-by-Step Instructions**:
  1. In `lib/customer-profile.js:2724, 2862`, reject `cur.expires_at <= now` (`409 SHARE_EXPIRED`) unless explicitly renewed with a future expiry.
  2. Add an inline `"Edit shared details / expiry"` panel on active share rows in `public/greatest-hits-sharing.js` calling `window.bitesharkProfile.updateShareSettings`.
  3. Add integration test coverage for `POST /api/admin/invitations/resend` in `tests/invitation-workflow.integration.cjs` and surface/prune `admin_notification_outbox` per product decision (`Decisions Required`), keeping `REGISTERED_DOMAIN_ROUTE_COUNT === 30` intact unless explicitly authorized.
- **Dependencies**: None
- **Potential Side Effects**: Never delete any of the 30 domain routes in `server/routes.js` without explicit team approval and contract updates.
- **Acceptance Criteria**:
  - Rotating or updating an expired share without a new future expiry returns `409 SHARE_EXPIRED`.
  - Users can toggle disclosures on an active share link in the Greatest Hits UI without revoking the URL.
- **Tests Required**: Extend `tests/customer-profile-sharing.integration.cjs` and `tests/invitation-workflow.integration.cjs`.
- **Verification Commands**: `node tests/customer-profile-sharing.integration.cjs` · `node tests/invitation-workflow.integration.cjs`

---

<a id="rep-026"></a>
### REP-026 — Repair moderation dismiss_reports queue clearing, support-ticket re-resolution & >50 lookup, and onboarding status transitions

- **Task ID**: `REP-026`
- **Related Audit Finding IDs**: [AUD-0029](03_COMPLETE_FINDINGS.md#aud-0029)
- **Priority / Estimated Effort**: **P2** · Effort `M`
- **Exact Target Files**: `server/admin-routes.js`, `lib/support-tickets.js`, `tests/admin-governance.integration.cjs`, `tests/support-feedback.integration.cjs`
- **Objective**: Fix all four governance workflow state-machine bugs in community report dismissal, ticket reopen/lookup/SLA, and vendor onboarding.
- **Proposed Changes**: Reset `report_count = 0` on `dismiss_reports` + filter `reported` queue by `open_reports > 0`, refresh `resolved_at = now()` on re-resolution + align SLA copy, push `?id=`/`?ticket=` into SQL `WHERE` before `LIMIT 50` in `GET /api/issues`, and preserve `needs_info_correction` on Mod recommendations + allow Top reinstatement of suspended `ownership_status`.
- **Step-by-Step Instructions**:
  1. In `server/admin-routes.js:5320, 5438`, filter `reported` on `COALESCE(rep.open_reports, 0) > 0` and execute `UPDATE community_reviews SET report_count = 0 WHERE id = $1` on `dismiss_reports`.
  2. In `server/admin-routes.js:6153`, update `resolved_at = now()` on every transition into `resolved`/`closed`, clear `resolved_at = NULL` on reopen, and align SLA target hours vs copy in `lib/support-tickets.js:48, 260`.
  3. In `server/admin-routes.js:2202-2295`, apply `singleId` / `singleTicket` in the SQL `WHERE` clause before `LIMIT 50`.
  4. In `server/admin-routes.js:3450`, preserve `needs_info_correction` when `Admin: Mod` saves a recommendation, and allow `Admin: Top` to restore `ownership_status` in `/api/admin/vendors/status`.
- **Dependencies**: None
- **Potential Side Effects**: None.
- **Acceptance Criteria**:
  - Dismissing all open reports on a community post removes it from `GET /api/admin/moderation?queue=reported`.
  - Re-resolving a reopened ticket grants a fresh 30-day customer reopen window, and `GET /api/issues?ticket=...` succeeds on ticket #55.
- **Tests Required**: Add regression cases to `tests/admin-governance.integration.cjs` and `tests/support-feedback.integration.cjs`.
- **Verification Commands**: `node tests/admin-governance.integration.cjs` · `node tests/support-feedback.integration.cjs`

---

<a id="rep-027"></a>
### REP-027 — Fix pager.js off-by-one step announcements, /s/%... URIError handling, sw.js URL guard, and Admin Portal CSS/modal polish

- **Task ID**: `REP-027`
- **Related Audit Finding IDs**: [AUD-0030](03_COMPLETE_FINDINGS.md#aud-0030), [AUD-0038](03_COMPLETE_FINDINGS.md#aud-0038), [AUD-0039](03_COMPLETE_FINDINGS.md#aud-0039)
- **Priority / Estimated Effort**: **P2** · Effort `S` · ⚡ **Quick Win**
- **Exact Target Files**: `public/pager.js`, `server/app.js`, `public/sw.js`, `public/admin.html`, `public/admin.js`, `public/admin.css`, `tests/pager-demo.test.cjs`
- **Objective**: Fix customer pickup-pager step accuracy (`aria-current="step"`), return clean neutral `404` on malformed `/s/%...` URLs, harden `public/sw.js` `open_url` checks, and fix unstyled Admin Portal classes and modal focus traps.
- **Proposed Changes**: Align `state.step` with 0-based `steps` indices in `public/pager.js`, wrap `decodeURIComponent` on `/s/*` in `server/app.js`, reject `//` in `public/sw.js`, add matching class selectors/aliases in `public/admin.css` + `adminOpenModal` focus traps in `public/admin.js`.
- **Step-by-Step Instructions**:
  1. In `public/pager.js:230-234`, mark zero steps `current` when `cancelled`, all 4 `complete` when `collected`, and otherwise compare `i` against `state.step - 1`.
  2. In `server/app.js:1328-1360`, decode `/s/...` path segments via `safeDecodeSegment` (`""` on `URIError`), and in `public/sw.js:39, 64`, require `!open_url.startsWith("//")`.
  3. In `public/admin.css` / `public/admin.js` / `public/admin.html`, align `.subtab-bar`/`.subtabs`, `.pagination-bar`/`.pager-bar`, `.pill-err`/`.pill-danger`, `.form-grid-2`/`.form-row-2`, fix `app.Ownership_summary` (`admin.js:685`), avoid duplicate `loadApplications()` GET on click, and open `#featureConfirmModal`, `#invActionModal`, and `#invHistoryModal` via `adminOpenModal`.
- **Dependencies**: None
- **Potential Side Effects**: Update `tests/pager-demo.test.cjs` if it asserts `.pager-roadmap` classes.
- **Acceptance Criteria**:
  - `status === "ready"` marks `"Ready!"` (`3rd` step) as `current` (`aria-current="step"`), and `cancelled` marks zero steps `current`.
  - `GET /s/%E0%A4%A` returns `404` with `Referrer-Policy: no-referrer`.
  - All modals in `/admin` trap keyboard Tab focus and restore focus on Escape.
- **Tests Required**: Update `tests/pager-demo.test.cjs` and verify in `tests/customer-profile-sharing.integration.cjs` + `tests/admin-portal-browser.e2e.cjs`.
- **Verification Commands**: `node tests/pager-demo.test.cjs` · `node tests/admin-portal-browser.e2e.cjs`

---

<a id="rep-028"></a>
### REP-028 — Fix Style Guide category completion counter, validate /reset, memoize Markdown renders, add no-cache headers, and remove hardcoded personal email

- **Task ID**: `REP-028`
- **Related Audit Finding IDs**: [AUD-0031](03_COMPLETE_FINDINGS.md#aud-0031), [AUD-0032](03_COMPLETE_FINDINGS.md#aud-0032)
- **Priority / Estimated Effort**: **P2** · Effort `M`
- **Exact Target Files**: `lib/style-guide-admin.js`, `public/admin-style-guide.js`, `public/admin.html`, `public/admin.js`, `server/app.js`, `docs/engineering/contracts/configuration-keys.json`, `tests/style-guide-admin.integration.cjs`
- **Objective**: Report accurate completed category counts (`X/15`), validate `/reset`, prevent >200 batch failures and stale JS/CSS caching, harden GitHub API env/redirect bounds, remove personal Gmail PII from static assets, and memoize expensive 18-file Markdown generation.
- **Proposed Changes**: Fix `t.remaining` -> `(t.unanswered + t.draft) === 0`, call `validateStyleGuideData` in `/reset`, memoize `generateStyleGuideOutputs` by revision, add `/admin-style-guide.{js,css}` to `NO_CACHE_STATIC_FILES`, chunk `#sgSaveAllDirtyBtn`, preserve types in `syncKvDomToDraft`, enforce `securityCritical: true` + `redirect: "error"` + host allowlist on GitHub API calls, and populate Git author defaults from `ctx.user.email`.
- **Step-by-Step Instructions**:
  1. In `lib/style-guide-admin.js:568`, compute `completedTopics` using `(t.unanswered + t.draft) === 0`, run `validateStyleGuideData` inside `resetStyleGuideAdminDecisions` (`line 1255`), and cache generated Markdown outputs keyed on `(repoHeadSha, wsState.revision)`.
  2. In `lib/style-guide-admin.js:64-95, 1396-1435`, set `securityCritical: true`, restrict `STYLE_GUIDE_GITHUB_API_URL` to `https://api.github.com` (allowing `http://127.0.0.1` only when `env === "test"`), pass `redirect: "error"`, and register `BITESHARK_STYLE_GUIDE_*` keys in `configuration-keys.json`.
  3. Remove hardcoded personal email defaults from `public/admin.html:1127`, `public/admin-style-guide.js:2601`, and `lib/style-guide-admin.js:1512` (defaulting from authenticated `state.user.email`), add `/admin-style-guide.{js,css}` to `NO_CACHE_STATIC_FILES` in `server/app.js:79-125`, chunk `#sgSaveAllDirtyBtn` into `<= 150` items, and hide `#navStyleGuideBtn` when `admin_style_guide_workspace` is `hidden`.
- **Dependencies**: [REP-001](#rep-001)
- **Potential Side Effects**: Ensure `tests/style-guide-admin.integration.cjs` sets `BITESHARK_ENV=test` for its loopback GitHub mock server.
- **Acceptance Criteria**:
  - Completing all items in a topic increments `categories_completed` from `0` to `1`.
  - `GET /admin-style-guide.js` returns `Cache-Control: no-store`.
  - Zero personal `@gmail.com` addresses appear in `public/` or `lib/`.
- **Tests Required**: Extend `tests/style-guide-admin.integration.cjs` and `tests/style-guide-admin-browser.e2e.cjs`.
- **Verification Commands**: `node tests/style-guide-admin.integration.cjs` · `node tests/style-guide-admin-browser.e2e.cjs`

---

## Phase C — Dead Code and Redundancy (1 Tasks)

Safely remove obsolete Hatchable archives (`truckly-v63.zip`, `truckly-data.sql.gz`, stale `public/build.json`) and confirmed unused internal constants while preserving enforced route contracts (`REGISTERED_DOMAIN_ROUTE_COUNT === 30`).

<a id="rep-032"></a>
### REP-032 — Remove verified legacy Hatchable archives & unused internal symbols, wire style-guide --decisions flag, and refresh README/TECH_MAP

- **Task ID**: `REP-032`
- **Related Audit Finding IDs**: [AUD-0043](03_COMPLETE_FINDINGS.md#aud-0043)
- **Priority / Estimated Effort**: **P4** · Effort `S` · ⚡ **Quick Win**
- **Exact Target Files**: `truckly-v63.zip`, `truckly-data.sql.gz`, `public/build.json`, `server/app.js`, `lib/support-tickets.js`, `lib/editorial-stories.js`, `public/local-guides.js`, `tools/style-guide/cli.mjs`, `README.md`, `TECH_MAP.md`
- **Objective**: Clean up 235 KB of obsolete Hatchable binary archives, stale `/build.json` metadata, confirmed unused constants, unwired CLI flags, and outdated migration counts in top-level docs.
- **Proposed Changes**: Delete `truckly-v63.zip`, `truckly-data.sql.gz`, and `public/build.json` (after verifying zero test/monitor consumers), remove 4 confirmed unused constants, pass `--decisions` in `tools/style-guide/cli.mjs`, and update `README.md` + `TECH_MAP.md`.
- **Step-by-Step Instructions**:
  1. Run `npm run registry:locate -- build.json` and check `tests/listing-verification.cjs` to confirm zero test consumers before removing `public/build.json` (and `/build.json` at `server/app.js:123`), `truckly-v63.zip`, and `truckly-data.sql.gz`.
  2. Remove `VENDOR_SUPPORT_CATEGORIES` (`lib/support-tickets.js:21`), `EDITORIAL_STORIES_BY_ID` & `EDITORIAL_STORIES_BY_VENDOR_ID` (`lib/editorial-stories.js:148-154`), and `LEGACY_DISH_NOTEBOOK_KEY` (`public/local-guides.js:6`), and wire `--decisions` in `tools/style-guide/cli.mjs`.
  3. Update migration range references in `README.md:29` and `TECH_MAP.md:35` and regenerate `npm run registry:docs`.
- **Dependencies**: None
- **Potential Side Effects**: If `tests/listing-verification.cjs` checks `public/build.json`, update that assertion in the same commit.
- **Acceptance Criteria**:
  - `npm run registry:validate`, `node tests/listing-verification.cjs`, and `node tests/style-guide.test.cjs` all pass with `0` errors.
- **Tests Required**: Run `node tests/listing-verification.cjs`, `node tests/style-guide.test.cjs`, and `npm run test:registry`.
- **Verification Commands**: `node tests/listing-verification.cjs` · `node tests/style-guide.test.cjs` · `npm run registry:validate`

---

## Phase D — Architecture and Maintainability (2 Tasks)

Reconcile `BITESHARK_PLATFORM_ADMIN_IDS` split-brain, consolidate 5x duplicated helpers and drifted Sonoma town/story constants, and modularize the 8,331-line `server/admin-routes.js` router behind a declarative route manifest.

<a id="rep-022"></a>
### REP-022 — Reconcile BITESHARK_PLATFORM_ADMIN_IDS with platform_roles DB authority across ticket assignment and operator CLIs

- **Task ID**: `REP-022`
- **Related Audit Finding IDs**: [AUD-0024](03_COMPLETE_FINDINGS.md#aud-0024)
- **Priority / Estimated Effort**: **P2** · Effort `S` · ⚖️ **See Decisions Required**
- **Exact Target Files**: `lib/authz.js`, `server/admin-routes.js`, `scripts/manage-feature-controls.cjs`, `tests/admin-governance.integration.cjs`
- **Objective**: Eliminate split-brain behavior where env-listed Top Admins fail ticket assignment (`400 INVALID_ASSIGNEE`) and account/CLI checks.
- **Proposed Changes**: Confirm deprecation of env-only admin IDs in favor of `scripts/bootstrap-top-admin.cjs` (`platform_roles`), and honor `parsePlatformAdminIds()` in `/api/admin/issues` assignee checks while `BITESHARK_PLATFORM_ADMIN_IDS` remains supported.
- **Step-by-Step Instructions**:
  1. Decide with ops whether `BITESHARK_PLATFORM_ADMIN_IDS` should be deprecated or synced into `platform_roles` at startup.
  2. In `server/admin-routes.js:6080`, allow `assigned_to_user_id` when present in `platform_roles` OR `parsePlatformAdminIds()`.
- **Dependencies**: None
- **Potential Side Effects**: Verify test fixtures in `tests/admin-governance.integration.cjs` and `tests/backend-hardening.integration.cjs`.
- **Acceptance Criteria**:
  - Every recognized `Admin: Top` can be assigned support tickets without `400 INVALID_ASSIGNEE`.
- **Tests Required**: Add assignee check in `tests/admin-governance.integration.cjs`.
- **Verification Commands**: `node tests/admin-governance.integration.cjs`

---

<a id="rep-030"></a>
### REP-030 — Consolidate duplicate helpers/constants (sha256Hex, Sonoma towns, Editorial Stories) and modularize server/admin-routes.js behind a declarative manifest

- **Task ID**: `REP-030`
- **Related Audit Finding IDs**: [AUD-0036](03_COMPLETE_FINDINGS.md#aud-0036), [AUD-0040](03_COMPLETE_FINDINGS.md#aud-0040)
- **Priority / Estimated Effort**: **P3** · Effort `L`
- **Exact Target Files**: `lib/admin-governance.js`, `lib/editorial-stories.js`, `lib/customer-exploration.js`, `lib/customer-profile.js`, `public/exploration-client.js`, `public/local-guides.js`, `public/customer-profile.js`, `server/admin-routes.js`
- **Objective**: Eliminate drifted duplicate constants/utilities across server and client and replace manual 52-branch `if` boilerplate in `server/admin-routes.js` with a declarative governance route manifest and focused domain modules.
- **Proposed Changes**: Share Sonoma County town allowlists (`Geyserville`, `Penngrove`, `Graton`), align `CANONICAL_STORIES` + Discover strip vendor availability + `AbortController` timeouts in `exploration-client.js`, centralize `sha256Hex`/`maskEmail`/`escapeSqlLike`, and incrementally extract domain modules behind `server/admin-routes.js`.
- **Step-by-Step Instructions**:
  1. Extract canonical Sonoma County town constants shared by `lib/customer-exploration.js` and `lib/customer-profile.js`, align `CANONICAL_STORIES` in `public/exploration-client.js` with `lib/editorial-stories.js`, filter `renderDiscoverStoriesStrip` (`public/local-guides.js:228`) by active `trucks`, add `AbortController` timeouts in `exploration-client.js`, and fix copy at `public/customer-profile.js:390`.
  2. Import `sha256Hex`, `maskEmail`, and `escapeSqlLike` from `lib/admin-governance.js` across `lib/*` and `server/admin-routes.js`.
  3. Introduce `GOVERNANCE_ROUTE_MANIFEST` in `server/admin-routes.js` and extract domain sub-modules (`server/admin/*.js`) while keeping `server/admin-routes.js` public exports unchanged, regenerating `npm run registry:docs`.
- **Dependencies**: [REP-008](#rep-008), [REP-009](#rep-009), [REP-016](#rep-016), [REP-026](#rep-026), [REP-029](#rep-029)
- **Potential Side Effects**: Run `npm run registry:docs && npm run registry:validate` after moving internal functions across files.
- **Acceptance Criteria**:
  - `POST /api/me/preferences` accepts `"Geyserville"`, `"Penngrove"`, and `"Graton"`.
  - `npm run registry:validate` and all admin/exploration/profile suites pass with zero new drift items.
- **Tests Required**: Run `npm run test:registry`, `npm run test:admin`, `node tests/customer-exploration.integration.cjs`, and `npm run test:profile`.
- **Verification Commands**: `npm run registry:docs` · `npm run registry:validate` · `npm run test:registry`

---

## Phase E — Performance and Dependency Health (1 Tasks)

Eliminate 4-connection `pg.Pool` fan-outs in `getPrivateOwnerProfile`, bound lifetime `customer_visits` scans in `hydrateSavedTrailsInTx`, and remove 2 wasted RBAC queries per customer API call on the 961 MiB VPS.

<a id="rep-029"></a>
### REP-029 — Eliminate 4x DB pool checkout fan-out in getPrivateOwnerProfile, bound hydrateSavedTrailsInTx scans, and skip loadAccessContext on customer routes

- **Task ID**: `REP-029`
- **Related Audit Finding IDs**: [AUD-0033](03_COMPLETE_FINDINGS.md#aud-0033)
- **Priority / Estimated Effort**: **P2** · Effort `M`
- **Exact Target Files**: `server/admin-routes.js`, `lib/customer-profile.js`, `lib/customer-exploration.js`, `tests/customer-profile-sharing.integration.cjs`
- **Objective**: Cut `/api/me/profile` DB pool checkouts from 4 concurrent connections to 1 sequential transaction, eliminate 2 wasted RBAC queries per customer API call, and scope saved-trail progress queries to stop vendors.
- **Proposed Changes**: Delegate `CUSTOMER_EXPLORATION_PATHS` and `CUSTOMER_PROFILE_PATHS` before `loadAccessContext` in `server/admin-routes.js`, pass `tx` sequentially inside `getPrivateOwnerProfile`, and add `AND recorded_vendor_id = ANY($2::text[])` in `hydrateSavedTrailsInTx`.
- **Step-by-Step Instructions**:
  1. In `server/admin-routes.js`, move `CUSTOMER_EXPLORATION_PATHS` and `CUSTOMER_PROFILE_PATHS` delegation (`lines 971-997`) above `loadAccessContext` (`line 719`), keeping it below the central `isPreviewViewpoint` guard.
  2. In `lib/customer-profile.js:842-960`, await `listUserVisits(tx, ...)`, `listUserPhotos(tx, ...)`, and `listUserSavedTrails(tx, ...)` **sequentially** inside `coreTx` instead of `Promise.all` with `dbAdapter`.
  3. In `lib/customer-exploration.js:2170-2182`, filter `customer_visits` by `AND recorded_vendor_id = ANY($2::text[])`.
- **Dependencies**: [REP-009](#rep-009)
- **Potential Side Effects**: Must use sequential `await` (never `Promise.all`) when sharing a single `pg` `PoolClient` (`tx`).
- **Acceptance Criteria**:
  - `GET /api/me/profile` checks out exactly `1` `pg.Pool` connection and executes `0` `platform_roles` queries.
  - `hydrateSavedTrailsInTx` queries only visits matching the user's saved trail stop vendor IDs.
- **Tests Required**: Assert connection count = 1 in `tests/customer-profile-sharing.integration.cjs` and run `tests/customer-exploration.integration.cjs`.
- **Verification Commands**: `node tests/customer-profile-sharing.integration.cjs` · `node tests/customer-exploration.integration.cjs`

---

## Phase F — Testing and Long-Term Prevention (1 Tasks)

Fix the code-registry SQL `CREATE INDEX` parser regex, expose all 41 test suites cleanly via `package.json` (`npm run test:unit`, etc.) and `TESTING.md`, and add CI contract guards.

<a id="rep-031"></a>
### REP-031 — Fix code-registry SQL index regex, add test:unit & missing package.json scripts, and update TESTING.md & dev-server.cjs notices

- **Task ID**: `REP-031`
- **Related Audit Finding IDs**: [AUD-0041](03_COMPLETE_FINDINGS.md#aud-0041), [AUD-0042](03_COMPLETE_FINDINGS.md#aud-0042)
- **Priority / Estimated Effort**: **P3** · Effort `S` · ⚡ **Quick Win**
- **Exact Target Files**: `tools/code-registry/backend-db-analyzer.mjs`, `package.json`, `docs/engineering/TESTING.md`, `scripts/dev-server.cjs`, `tests/admin-test-customer.integration.cjs`
- **Objective**: Ensure `SCHEMA-INVENTORY.md` captures all 5 previously missed SQL indexes, expose all 41 test suites cleanly via `package.json` and `TESTING.md`, and prevent confusion from legacy `dev-server.cjs` and stale test headers.
- **Proposed Changes**: Relax whitespace requirement before `(` in `backend-db-analyzer.mjs:1773`, regenerate registry docs, add `test:unit` + domain test scripts to `package.json`, document all active suites in `TESTING.md`, and update `dev-server.cjs` + `admin-test-customer.integration.cjs` header comments.
- **Step-by-Step Instructions**:
  1. Change `\s+([^;]+);` to `(?:\s+|(?=\())([^;]+);` at `tools/code-registry/backend-db-analyzer.mjs:1773` and run `npm run registry:docs`.
  2. Add `test:unit` (running all 7 DB-free unit/contract tests) and missing `test:*` scripts in `package.json`, update `docs/engineering/TESTING.md`, and archive or document `tests/staging-http-gates.cjs`.
  3. Add a clear legacy-mock startup warning to `scripts/dev-server.cjs` and update lines `5-6` of `tests/admin-test-customer.integration.cjs`.
- **Dependencies**: None
- **Potential Side Effects**: `SCHEMA-INVENTORY.md` will list the 5 previously omitted indexes (`community_reviews_published_idx`, `community_reviews_author_idx`, `vendor_memberships_user_idx`, `audit_logs_vendor_idx`, `audit_logs_actor_idx`).
- **Acceptance Criteria**:
  - `SCHEMA-INVENTORY.md` includes `vendor_memberships_user_idx` and `npm run registry:validate` exits `0`.
  - `npm run test:unit` executes all 7 DB-free suites cleanly.
- **Tests Required**: Add a `CREATE INDEX idx ON tbl(col);` unit test case in `tests/code-registry.test.cjs`.
- **Verification Commands**: `npm run registry:docs` · `npm run registry:validate` · `node tests/code-registry.test.cjs`

---

