# 03 — Complete Audit Findings Register (`AUD-0001` – `AUD-0044`)

- **Repository**: `https://github.com/yamanalmasaleha-png/trukly-.git`
- **Audited Branch**: `working/biteshark-vps` *(user-confirmed audit target after verifying `working-` does not exist)*
- **Audited Commit SHA**: `f0e5e5deedc7636f448e1b0d629ceb1787d79944`
- **Total Deduplicated Findings**: **44** (`4` CRITICAL · `16` HIGH · `16` MEDIUM · `7` LOW · `1` INFO)
- **Cross-References**: [AUDIT_INDEX.md](AUDIT_INDEX.md) · [08_TECHNICAL_DEBT_REGISTER.md](08_TECHNICAL_DEBT_REGISTER.md) · [09_PRIORITIZED_REPAIR_PLAN.md](09_PRIORITIZED_REPAIR_PLAN.md) · [findings.json](findings.json)

## Quick Index by Severity & Subsystem

| ID | Severity | Category | Confidence | Subsystem | Title | Priority | Effort | Repair Task(s) |
|---|---|---|---|---|---|---|---|---|
| [AUD-0001](#aud-0001) | **CRITICAL** | Security | Confirmed | S6: Feature controls & Style Guide admin workspace | Admin: Mod can approve, overwrite, or clear Admin: Top Style Guide decisions via status normalization bypass | P0 | S | [REP-001](09_PRIORITIZED_REPAIR_PLAN.md#rep-001) |
| [AUD-0002](#aud-0002) | **CRITICAL** | Security | Confirmed | S1: Auth, sessions, age policy & test-customer sandbox | Synthetic Test Customer account can be granted Admin: Top, defeating last-human-Top lockout protection and crashing /api/admin/test-customer | P0 | S | [REP-002](09_PRIORITIZED_REPAIR_PLAN.md#rep-002) |
| [AUD-0003](#aud-0003) | **CRITICAL** | Security | Confirmed | S6: Feature controls & Style Guide admin workspace | feature_controls untrusted DB state fails OPEN on read_when_not_hidden routes, staff_beta gates, and /s/<token> unlisted shares | P0 | M | [REP-003](09_PRIORITIZED_REPAIR_PLAN.md#rep-003) |
| [AUD-0004](#aud-0004) | **CRITICAL** | Reliability / Data Integrity | Confirmed | S2: HTTP server core, routing, api/* handlers & DB adapter | Invalid write-pause scope "favorites" in api/favorites/toggle.js triggers fail-closed global write outage when configured | P0 | S | [REP-004](09_PRIORITIZED_REPAIR_PLAN.md#rep-004) |
| [AUD-0005](#aud-0005) | **HIGH** | Security | Confirmed | S4: Customer profile, Greatest Hits sharing, exploration & photos | Shared-collection moderation suppression can be bypassed via photo re-attachment, collection updates, and multi-share disclosure masking | P1 | M | [REP-005](09_PRIORITIZED_REPAIR_PLAN.md#rep-005) |
| [AUD-0006](#aud-0006) | **HIGH** | Security | Confirmed | S4: Customer profile, Greatest Hits sharing, exploration & photos | Under-14 birth date submission on POST /api/me/sharing-eligibility rolls back without locking eligibility or revoking session | P1 | S | [REP-006](09_PRIORITIZED_REPAIR_PLAN.md#rep-006) |
| [AUD-0007](#aud-0007) | **HIGH** | Security | Confirmed | S4: Customer profile, Greatest Hits sharing, exploration & photos | Unlisted /s/<token> routes ignore staff_beta audience restrictions and two customer/shared endpoints omit central route feature rules | P1 | S | [REP-007](09_PRIORITIZED_REPAIR_PLAN.md#rep-007) |
| [AUD-0008](#aud-0008) | **HIGH** | Security | Confirmed | S3: Admin governance backend | Admin: Mod can enumerate masked customer emails via /api/admin/accounts ILIKE oracle and read unmasked emails and Top-only telemetry on /api/admin/invitations & /api/admin/audit | P1 | M | [REP-008](09_PRIORITIZED_REPAIR_PLAN.md#rep-008) |
| [AUD-0009](#aud-0009) | **HIGH** | Security | Confirmed | S5: Pager notifications, Web Push worker & diagnostics | Unauthenticated /api/diagnostics/report can evict server_verified incidents (cascading issue links), spoof actor_id, and bypass secret/cookie regex scrubbers | P1 | M | [REP-010](09_PRIORITIZED_REPAIR_PLAN.md#rep-010) |
| [AUD-0010](#aud-0010) | **HIGH** | Security | Confirmed | S7: Customer-facing SPA frontend | Third-party CDN Leaflet script & stylesheet load without Subresource Integrity (SRI) and block all first-party scripts, while HTML pages lack baseline CSP | P1 | S | [REP-011](09_PRIORITIZED_REPAIR_PLAN.md#rep-011) |
| [AUD-0011](#aud-0011) | **HIGH** | Security | Confirmed | S2: HTTP server core, routing, api/* handlers & DB adapter | Community feed (/api/community/list) and post creation (/api/community/post) bypass vendor hidden_from_discovery and deactivation governance | P1 | S | [REP-012](09_PRIORITIZED_REPAIR_PLAN.md#rep-012) |
| [AUD-0012](#aud-0012) | **HIGH** | Security | Confirmed | S9: Database migrations, RLS policies, schema & indexes | 14 database tables lack FORCE ROW LEVEL SECURITY, api/favorites & notifications execute no-op GUC calls, and favorites/toggle accepts unbounded arbitrary truck_ids | P1 | M | [REP-013](09_PRIORITIZED_REPAIR_PLAN.md#rep-013) |
| [AUD-0013](#aud-0013) | **HIGH** | Reliability / Data Integrity | Confirmed | S6: Feature controls & Style Guide admin workspace | Concurrent lost-update race in Style Guide push/save overwrites workspace-state.json, and corrupt state JSON silently resets to empty | P1 | M | [REP-001](09_PRIORITIZED_REPAIR_PLAN.md#rep-001) |
| [AUD-0014](#aud-0014) | **HIGH** | Reliability / Data Integrity | Confirmed | S3: Admin governance backend | Emergency BITESHARK_PAUSE_WRITES=all omits newer customer/governance write surfaces, and X-BiteShark-Viewpoint: preview is unenforced on 33 of 34 admin-routes mutations | P1 | M | [REP-009](09_PRIORITIZED_REPAIR_PLAN.md#rep-009) |
| [AUD-0015](#aud-0015) | **HIGH** | Broken Feature | Confirmed | S4: Customer profile, Greatest Hits sharing, exploration & photos | Hidden customer_profile fallback UI falsely reports "0 active unlisted share links" and omits revocation controls while /s/<token> links remain live | P1 | S | [REP-014](09_PRIORITIZED_REPAIR_PLAN.md#rep-014) |
| [AUD-0016](#aud-0016) | **HIGH** | Reliability / Data Integrity | Confirmed | S3: Admin governance backend | 90-day vendor_application_evidence BYTEA retention and disabled-mode pager outbox/rate-limit scrubbing are completely unenforced | P1 | M | [REP-015](09_PRIORITIZED_REPAIR_PLAN.md#rep-015) |
| [AUD-0017](#aud-0017) | **HIGH** | Runtime Error | Confirmed | S3: Admin governance backend | Swallowed SessionEligibilityError turns normal revocations into 500/503 alerts, and unvalidated related_review_id in POST /api/issues causes 500 FK crash & private-post oracle | P1 | S | [REP-016](09_PRIORITIZED_REPAIR_PLAN.md#rep-016) |
| [AUD-0018](#aud-0018) | **HIGH** | Broken Feature | Confirmed | S5: Pager notifications, Web Push worker & diagnostics | Mismatched pager worker summary keys (failed/sent vs failed_permanent/delivered) silently disable batch failure diagnostics and degraded heartbeats | P1 | S | [REP-017](09_PRIORITIZED_REPAIR_PLAN.md#rep-017) |
| [AUD-0019](#aud-0019) | **HIGH** | Reliability / Data Integrity | Confirmed | S2: HTTP server core, routing, api/* handlers & DB adapter | Swallowed ROLLBACK errors in runtime-adapter and lib/db-tx.js call client.release() without error flag, returning poisoned connections to pg.Pool | P1 | S | [REP-018](09_PRIORITIZED_REPAIR_PLAN.md#rep-018) |
| [AUD-0020](#aud-0020) | **HIGH** | Configuration | Confirmed | S10: Deploy, systemd, Nginx, CI/CD, dependencies & code-registry | biteshark-staging2-api.service omits style-guide ReadWritePaths under ProtectSystem=strict, backup-staging2.sh is missing from Git, and push CI diff skips failing runtime suites | P1 | S | [REP-019](09_PRIORITIZED_REPAIR_PLAN.md#rep-019) |
| [AUD-0021](#aud-0021) | **MEDIUM** | Testing | Confirmed | S11: Test suite, tooling & verification gates | hasCustomerProfileSurface() checks nonexistent public/profile.html, permanently hiding sandbox /profile UI and silently skipping CI profile isolation assertions | P1 | S | [REP-020](09_PRIORITIZED_REPAIR_PLAN.md#rep-020) |
| [AUD-0022](#aud-0022) | **MEDIUM** | Broken Feature | Confirmed | S1: Auth, sessions, age policy & test-customer sandbox | Active Test Customer Sandbox overlay breaks /admin pager telemetry & evidence links, survives OTP re-login, misreports available_for_top_admin, and leaves 4 tables uncleaned on reset | P2 | M | [REP-020](09_PRIORITIZED_REPAIR_PLAN.md#rep-020) |
| [AUD-0023](#aud-0023) | **MEDIUM** | Security | Confirmed | S2: HTTP server core, routing, api/* handlers & DB adapter | Unrate-limited POST /api/bookings/create combined with hardcoded LIMIT 25 on GET /api/owner/requests allows spam starvation of vendor booking queues | P2 | S | [REP-021](09_PRIORITIZED_REPAIR_PLAN.md#rep-021) |
| [AUD-0024](#aud-0024) | **MEDIUM** | Architecture | Confirmed | S3: Admin governance backend | Split-brain between BITESHARK_PLATFORM_ADMIN_IDS env grants and platform_roles DB rows breaks ticket assignment, account filters, and CLI checks | P2 | M | [REP-022](09_PRIORITIZED_REPAIR_PLAN.md#rep-022) |
| [AUD-0025](#aud-0025) | **MEDIUM** | Reliability / Data Integrity | Confirmed | S1: Auth, sessions, age policy & test-customer sandbox | Sliding-window DB session extension runs on routes that omit Set-Cookie, desynchronizing auth_sessions.expires_at from browser cookie Max-Age | P2 | S | [REP-023](09_PRIORITIZED_REPAIR_PLAN.md#rep-023) |
| [AUD-0026](#aud-0026) | **MEDIUM** | Runtime Error | Confirmed | S4: Customer profile, Greatest Hits sharing, exploration & photos | Soft-deleted idempotency_key collisions trigger unhandled PostgreSQL 23505 HTTP 500s across visits, photos, trails, and collections | P2 | S | [REP-024](09_PRIORITIZED_REPAIR_PLAN.md#rep-024) |
| [AUD-0027](#aud-0027) | **MEDIUM** | Broken Feature | Confirmed | S8: Role-experience, Admin Portal, Style Guide & Profile UI | Greatest Hits sharing UI hardcodes confirm_shared_view_update: true, wipes unsaved draft edits on share/photo actions, and caches stale photos | P2 | M | [REP-014](09_PRIORITIZED_REPAIR_PLAN.md#rep-014) |
| [AUD-0028](#aud-0028) | **MEDIUM** | Disabled Feature | Confirmed | S4: Customer profile, Greatest Hits sharing, exploration & photos | POST /api/me/shares/update-settings is disconnected from UI, and share rotate/update-settings ignore lazy time expiration | P2 | M | [REP-025](09_PRIORITIZED_REPAIR_PLAN.md#rep-025) |
| [AUD-0029](#aud-0029) | **MEDIUM** | Broken Feature | Confirmed | S3: Admin governance backend | Four governance workflow bugs: dismissed community reports stay stuck in queue, re-resolved tickets break 30-day reopen & mismatch SLA labels, /api/issues truncates at LIMIT 50 before ?id=, and Mod overwrites Top onboarding status | P2 | M | [REP-026](09_PRIORITIZED_REPAIR_PLAN.md#rep-026) |
| [AUD-0030](#aud-0030) | **MEDIUM** | Broken Feature | Confirmed | S7: Customer-facing SPA frontend | Off-by-one 1-based state.step vs 0-based steps array in public/pager.js announces wrong pickup stage and aria-current="step" | P2 | S | [REP-027](09_PRIORITIZED_REPAIR_PLAN.md#rep-027) |
| [AUD-0031](#aud-0031) | **MEDIUM** | Broken Feature | Confirmed | S6: Feature controls & Style Guide admin workspace | Style Guide workspace defects: permanently 0/15 completed categories, unvalidated /reset endpoint, >200 save-all failure, KV editor coercion, missing no-cache headers, and sync FS blocking | P2 | M | [REP-028](09_PRIORITIZED_REPAIR_PLAN.md#rep-028) |
| [AUD-0032](#aud-0032) | **MEDIUM** | Configuration | Confirmed | S6: Feature controls & Style Guide admin workspace | Style Guide GitHub integration reads security-sensitive env vars without conflict detection, lacks outbound redirect/timeout bounds, and hardcodes personal developer email in public UI/code | P2 | S | [REP-028](09_PRIORITIZED_REPAIR_PLAN.md#rep-028) |
| [AUD-0033](#aud-0033) | **MEDIUM** | Performance | Confirmed | S4: Customer profile, Greatest Hits sharing, exploration & photos | Database pool fan-out (4 transactions per profile load), unbounded lifetime visit scan on saved trails, and 2 wasted RBAC queries per customer API call | P2 | M | [REP-029](09_PRIORITIZED_REPAIR_PLAN.md#rep-029) |
| [AUD-0034](#aud-0034) | **MEDIUM** | Security | Confirmed | S7: Customer-facing SPA frontend | Cross-account in-memory profile data and plaintext share URLs remain cached on 403 age-assessment and degraded 5xx auth transitions | P2 | S | [REP-014](09_PRIORITIZED_REPAIR_PLAN.md#rep-014) |
| [AUD-0035](#aud-0035) | **MEDIUM** | Disabled Feature | Confirmed | S2: HTTP server core, routing, api/* handlers & DB adapter | Write-only dead sink admin_notification_outbox, 6 disconnected domain routes pinned by REGISTERED_DOMAIN_ROUTE_COUNT === 30, and 2 zero-UI admin endpoints | P3 | M | [REP-025](09_PRIORITIZED_REPAIR_PLAN.md#rep-025) |
| [AUD-0036](#aud-0036) | **MEDIUM** | Unnecessary Complexity | Confirmed | S3: Admin governance backend | God-file routers/controllers (server/admin-routes.js at 8,331 LOC), 12 load-order browser global collisions, and 5x duplicated security helpers | P3 | L | [REP-030](09_PRIORITIZED_REPAIR_PLAN.md#rep-030) |
| [AUD-0037](#aud-0037) | **LOW** | Configuration | Confirmed | S10: Deploy, systemd, Nginx, CI/CD, dependencies & code-registry | Deployment template & release-tarball drift: legacy truckly-staging.conf.template lacks 1m evidence/debug blocks, worker TimeoutStopSec < 28s fetch timeout, and tarball check omits 029 | P3 | S | [REP-019](09_PRIORITIZED_REPAIR_PLAN.md#rep-019) |
| [AUD-0038](#aud-0038) | **LOW** | Runtime Error | Confirmed | S2: HTTP server core, routing, api/* handlers & DB adapter | Malformed percent-encoding on /s/... throws uncaught URIError (HTTP 500 without no-referrer header), and public/sw.js open_url check allows protocol-relative "//" | P3 | S | [REP-027](09_PRIORITIZED_REPAIR_PLAN.md#rep-027) |
| [AUD-0039](#aud-0039) | **LOW** | Broken Feature | Confirmed | S8: Role-experience, Admin Portal, Style Guide & Profile UI | Admin Portal CSS class mismatches, Ownership_summary typo, unpaginated 100-vendor cap, double GET on application click, and 3 modals bypassing focus trapping | P3 | S | [REP-027](09_PRIORITIZED_REPAIR_PLAN.md#rep-027) |
| [AUD-0040](#aud-0040) | **LOW** | Duplicate Implementation | Confirmed | S4: Customer profile, Greatest Hits sharing, exploration & photos | Duplicate Editorial Stories & Sonoma town lists have drifted across server/client, Discover strip skips vendor availability, and exploration fetch lacks timeouts | P3 | S | [REP-030](09_PRIORITIZED_REPAIR_PLAN.md#rep-030) |
| [AUD-0041](#aud-0041) | **LOW** | Documentation | Confirmed | S10: Deploy, systemd, Nginx, CI/CD, dependencies & code-registry | Code-registry SQL scanner misses 5 CREATE INDEX definitions lacking whitespace before "(", and scripts/dev-server.cjs is an outdated pre-017 mock server | P3 | S | [REP-031](09_PRIORITIZED_REPAIR_PLAN.md#rep-031) |
| [AUD-0042](#aud-0042) | **LOW** | Testing | Confirmed | S11: Test suite, tooling & verification gates | 19 of 41 test suites lack package.json scripts, tests/staging-http-gates.cjs is completely unreferenced, TESTING.md omits 4 suites, and test-customer header comments are stale | P3 | S | [REP-031](09_PRIORITIZED_REPAIR_PLAN.md#rep-031) |
| [AUD-0043](#aud-0043) | **LOW** | Dead Code | Confirmed | S10: Deploy, systemd, Nginx, CI/CD, dependencies & code-registry | Committed legacy Hatchable artifacts (truckly-v63.zip, truckly-data.sql.gz, stale public/build.json), unused JS/CLI symbols, and stale migration counts in README/TECH_MAP | P4 | S | [REP-032](09_PRIORITIZED_REPAIR_PLAN.md#rep-032) |
| [AUD-0044](#aud-0044) | **INFO** | Architecture | Confirmed | S10: Deploy, systemd, Nginx, CI/CD, dependencies & code-registry | Single-node 1-vCPU / 961 MiB VPS co-tenancy constraints, per-process in-memory rate limiters, and intentionally unfinished 103-item Style Guide | P4 | S | Informational |

---

## CRITICAL Findings (4)

<a id="aud-0001"></a>
### AUD-0001 — Admin: Mod can approve, overwrite, or clear Admin: Top Style Guide decisions via status normalization bypass

1. **Finding ID**: `AUD-0001`
2. **Concise Title**: Admin: Mod can approve, overwrite, or clear Admin: Top Style Guide decisions via status normalization bypass
3. **Severity**: **CRITICAL**
4. **Category**: Security
5. **Confidence Level**: **Confirmed**
6. **Affected Subsystem**: S6: Feature controls & Style Guide admin workspace
7. **File Path & Relevant Line Numbers**: `lib/style-guide-admin.js:956-965`, `lib/style-guide-admin.js:1004-1052`, `server/admin-routes.js:8289-8310`
8. **What Is Wrong**: `saveStyleGuideAdminUpdates` (`POST /api/admin/style-guide/save`) enforces `Admin: Top` re-verification using un-trimmed status strings and ignores transitions away from or inheriting an existing `approved` / `not_applicable` status, allowing `Admin: Mod` callers to approve decisions, spoof `approved_by`, overwrite Top-approved values, or wipe Top approvals.
9. **Evidence**: In `lib/style-guide-admin.js:956-965`, `needsTopForApproval` checks `u && (u.status === 'approved' || u.status === 'not_applicable')` BEFORE `.trim()`. At `line 1004`, `const nextStatus = typeof item.status === 'string' ? item.status.trim() : prevDec.status;` trims trailing whitespace (`"approved "` -> `"approved"`) and defaults omitted `item.status` to `prevDec.status` (`"approved"`). At `lines 1037-1049`, `nextDec.approved_by` accepts caller-supplied `item.approved_by` without restricting to `actorEmail`, and overwriting a previously `approved` decision with `status: "draft"` or `"unanswered"` and `confirm_overwrite: true` never requires `minRole: "top"`.
10. **Expected / Intended Behavior**: Only a re-verified `Admin: Top` (`reverifyPlatformAdminInTx(tx, { ..., minRole: "top" })`) may transition any decision into, within, or out of `approved` / `not_applicable` status, and `approved_by` must be server-derived or constrained to verified governance actors.
11. **Actual Behavior / Code Condition**: An authenticated `Admin: Mod` session can send `POST /api/admin/style-guide/save` with `{"updates":[{"decision_id":"DEC-BRAND-001","status":"approved ","value":"...","approved_by":"any-label"}]}` to mint `approved` decisions without triggering `reverifyPlatformAdminInTx(minRole: "top")`, omit `status` (`confirm_overwrite: true`) to mutate an already-`approved` value while preserving `status: "approved"`, or set `status: "unanswered"` (`confirm_overwrite: true`) to erase Top-approved decisions.
12. **User or Operational Impact**: Direct privilege escalation across the documented `Admin: Mod` -> `Admin: Top` RBAC boundary (`docs/engineering/AUTH-AND-PERMISSIONS.md`), integrity compromise of canonical design-system tokens, and spoofed approval attribution.
13. **Root Cause**: Authorization pre-check (`needsTopForApproval`) operated on raw untrimmed request input prior to per-item normalization and failed to inspect `prevDec.status` inside the locked state snapshot.
14. **Recommended Remediation**: Normalize `item.status` up front and evaluate `needsTopForApproval` against BOTH normalized `nextStatus` AND `prevDec.status` (`approved` / `not_applicable`), requiring `reverifyPlatformAdminInTx(..., { minRole: "top" })` whenever either is `approved` or `not_applicable`, and bind `approved_by` to the verified Top Admin identity.
15. **Specific Implementation Steps**:
   - In `lib/style-guide-admin.js:950-1010`, trim and validate every `item.status` against `VALID_STATUSES` before authorization checks.
   - After loading the locked `prevDecisions` snapshot (`lines 975-995`), check whether any update has `prevDec.status` OR `nextStatus` in `["approved", "not_applicable"]`; if so, require `reverifyPlatformAdminInTx(tx, { userId: actorUserId, sessionId: actorSessionId, minRole: "top" })` (throwing `403 TOP_ADMIN_REQUIRED`).
   - Set `nextDec.approved_by` from the verified Top Admin actor identity (`actorEmail` or canonical handle) rather than trusting arbitrary `item.approved_by` strings.
16. **Dependencies / Prerequisites**: None.
17. **Regression Risks**: `Admin: Mod` users editing `unanswered` or `draft` items into `draft` must continue working without `403`; UI tests in `tests/style-guide-admin.integration.cjs` should verify both allowed Mod drafts and blocked Mod approvals/overwrites.
18. **Verification Steps**: Add integration cases to `tests/style-guide-admin.integration.cjs` asserting `Admin: Mod` receives `403` on `"status": "approved "`, on omitting `status` against an `approved` item, and on resetting an `approved` item to `draft`, then run `npm run test:style-guide:integration`.
19. **Estimated Effort**: `S`
20. **Repair Priority**: `P0` (Linked Repair Tasks: [REP-001](09_PRIORITIZED_REPAIR_PLAN.md#rep-001))

---

<a id="aud-0002"></a>
### AUD-0002 — Synthetic Test Customer account can be granted Admin: Top, defeating last-human-Top lockout protection and crashing /api/admin/test-customer

1. **Finding ID**: `AUD-0002`
2. **Concise Title**: Synthetic Test Customer account can be granted Admin: Top, defeating last-human-Top lockout protection and crashing /api/admin/test-customer
3. **Severity**: **CRITICAL**
4. **Category**: Security
5. **Confidence Level**: **Confirmed**
6. **Affected Subsystem**: S1: Auth, sessions, age policy & test-customer sandbox
7. **File Path & Relevant Line Numbers**: `server/admin-routes.js:4349-4391`, `lib/admin-test-customer.js:128-146`, `lib/admin-test-customer.js:205-225`, `migrations/026_urgent_pilot_security_hardening.sql:37-90`
8. **What Is Wrong**: `POST /api/admin/accounts/role` does not block synthetic test account `usr_sa_top_admin_test_customer` (`test-customer@sandbox.biteshark.invalid`) from being granted `top` or `mod` in `platform_roles`, and `GET /api/admin/test-customer` executes mutating SQL (`INSERT`/`UPDATE`/`DELETE FROM platform_roles`) on an idempotent `GET` route.
9. **Evidence**: `server/admin-routes.js:4349-4391` validates `targetUserId` existence in `auth_users` without rejecting `SYNTHETIC_TEST_CUSTOMER_USER_ID`. In `migrations/026_urgent_pilot_security_hardening.sql:37-90`, `protect_last_top_admin()` counts active `platform_roles.role = "top"` rows joined to `auth_users WHERE disabled_at IS NULL`—which `usr_sa_top_admin_test_customer` satisfies! Meanwhile, `lib/admin-test-customer.js:128, 214` runs `DELETE FROM platform_roles WHERE user_id = $1` inside `getAdminTestCustomerStatus` (`GET /api/admin/test-customer`).
10. **Expected / Intended Behavior**: Synthetic sandbox accounts (`usr_sa_top_admin_test_customer` / `*.invalid`) must never be eligible for `platform_roles` or `vendor_memberships` grants, must never count toward `protect_last_top_admin()`, and `GET /api/admin/test-customer` must be strictly read-only.
11. **Actual Behavior / Code Condition**: If `usr_sa_top_admin_test_customer` is granted `Admin: Top`, `protect_last_top_admin()` sees `>= 2` eligible Top Admins, allowing the sole real human `Admin: Top` to be demoted or disabled (`permanent human admin lockout`, as `.invalid` cannot receive OTP emails), after which `GET /api/admin/test-customer` crashes with HTTP `500` (`P0001: LAST_TOP_ADMIN_PROTECTED`).
12. **User or Operational Impact**: Potential complete loss of human `Admin: Top` governance access requiring root PostgreSQL emergency intervention, plus HTTP `500` failure of the Admin Portal sandbox status endpoint.
13. **Root Cause**: Migration `026` predated the synthetic test customer account (`lib/admin-test-customer.js`), and `/api/admin/accounts/role` + `/api/admin/vendors` lacked a guard excluding `SYNTHETIC_TEST_CUSTOMER_USER_ID`.
14. **Recommended Remediation**: Reject `SYNTHETIC_TEST_CUSTOMER_USER_ID` (and `@sandbox.biteshark.invalid`) in `/api/admin/accounts/role`, `/api/admin/accounts/status`, `/api/admin/invitations`, and vendor ownership assignment; make `getAdminTestCustomerStatus` strictly read-only on `GET`; and add an additive migration updating `count_eligible_active_top_admins()` + a `CHECK (user_id <> 'usr_sa_top_admin_test_customer')` constraint on `platform_roles`.
15. **Specific Implementation Steps**:
   - In `server/admin-routes.js:4349-4560`, reject `targetUserId === SYNTHETIC_TEST_CUSTOMER_USER_ID` with `400 SYNTHETIC_TEST_ACCOUNT_IMMUTABLE` on role grants and account status mutations.
   - Refactor `getAdminTestCustomerStatus` (`lib/admin-test-customer.js:185-255`) to perform read-only `SELECT` queries on `GET`, reserving `ensureSyntheticTestCustomerInTx` provisioning writes for `POST` (`enter` / `seed` / `reset`).
   - Author additive migration `030_harden_synthetic_sandbox_and_rls.sql` adding `CHECK (user_id <> 'usr_sa_top_admin_test_customer')` on `platform_roles` and excluding `usr_sa_top_admin_test_customer` inside `count_eligible_active_top_admins()`.
16. **Dependencies / Prerequisites**: Coordinate migration sequence number `030` across active branches per `docs/engineering/MIGRATIONS.md`.
17. **Regression Risks**: `GET /api/admin/test-customer` before first `enter` on a brand-new database must cleanly return `counts: { favorites: 0, visits: 0, photos: 0, trails: 0, collections: 0, active_shares: 0 }` when the synthetic user row does not yet exist.
18. **Verification Steps**: Extend `tests/admin-test-customer.integration.cjs` to assert `POST /api/admin/accounts/role` targeting `usr_sa_top_admin_test_customer` returns `400`, `GET /api/admin/test-customer` executes zero writes on fresh DBs, and the last human Top Admin cannot be demoted.
19. **Estimated Effort**: `S`
20. **Repair Priority**: `P0` (Linked Repair Tasks: [REP-002](09_PRIORITIZED_REPAIR_PLAN.md#rep-002))

---

<a id="aud-0003"></a>
### AUD-0003 — feature_controls untrusted DB state fails OPEN on read_when_not_hidden routes, staff_beta gates, and /s/<token> unlisted shares

1. **Finding ID**: `AUD-0003`
2. **Concise Title**: feature_controls untrusted DB state fails OPEN on read_when_not_hidden routes, staff_beta gates, and /s/<token> unlisted shares
3. **Severity**: **CRITICAL**
4. **Category**: Security
5. **Confidence Level**: **Confirmed**
6. **Affected Subsystem**: S6: Feature controls & Style Guide admin workspace
7. **File Path & Relevant Line Numbers**: `lib/feature-controls.js:1230-1242`, `lib/feature-controls.js:1303-1312`, `lib/feature-controls.js:1418-1438`, `lib/feature-controls.js:1876-1928`, `lib/customer-profile.js:3014-3019`, `lib/customer-profile.js:4291-4297`
8. **What Is Wrong**: When `feature_controls` cannot be read from PostgreSQL OR contains even a single unrecognized `feature_key` row (e.g., after rolling back a newer application release against an additive DB schema), `lib/feature-controls.js` marks `stateUntrusted = true`, discards all persisted `hidden` states and `staff_beta` audience restrictions, substitutes `paused` (or `enabled` for read-only features like `customer_profile`), and allows all `read_when_not_hidden` endpoints and live `/s/<token>` shares to proceed.
9. **Evidence**: `lib/feature-controls.js:1236` sets `unknownKeys.push(key)` when `!FEATURE_REGISTRY_BY_KEY.has(key)` and `lines 1305-1310` set `stateUntrusted = true` if `unknownKeys.length > 0`. At `lines 1422-1425`, `if (stateUntrusted)` sets `systemEffectiveState = def.allowed_states.includes('paused') ? 'paused' : def.safe_default_state` (`'enabled'` for `customer_profile` and `editorial_stories`!) and skips `configuredAudience === 'staff_beta'` (`line 1428`). Because `enforceRouteFeatureGate` (`lines 1876-1928`) blocks `read_when_not_hidden` ONLY when `state === 'hidden'`, and `lib/customer-profile.js:3014-3019, 4291-4297` blocks `/s/<token>` ONLY when `system_state === 'hidden'`, every hidden read surface fails OPEN.
10. **Expected / Intended Behavior**: Unknown `feature_key` rows from newer additive releases must be ignored (logged as a warning) without invalidating known `feature_controls` rows, and true DB read failures (`stateUntrusted`) must fail CLOSED (`503 FEATURE_STATE_UNAVAILABLE` / neutral `404` on `/s/<token>`) for non-core/beta/sharing surfaces rather than exposing `hidden` or `staff_beta` features.
11. **Actual Behavior / Code Condition**: Rolling back one application release after adding a new `feature_controls` key—or experiencing a transient DB query error—instantly exposes every `hidden` and `staff_beta` feature across `/api/me/profile*`, `/api/me/collections*`, `/api/me/visits`, `/api/me/photos*`, `/api/me/trails`, `/api/stories`, `/api/trails/suggest`, `/s/<token>`, and `/s/<token>/photo/<attachment>`.
12. **User or Operational Impact**: Kill-switches (`hidden`) and `staff_beta` access boundaries fail open during rollbacks or transient database errors, exposing emergency-suppressed features and unlisted shared pages/photos.
13. **Root Cause**: Over-strict `unknownKeys` validation poisoned the entire `feature_controls` snapshot, combined with a fallback state (`paused`/`safe_default_state`) that only blocks mutations while leaving `read_when_not_hidden` and `/s/<token>` open.
14. **Recommended Remediation**: Ignore unknown `feature_key` rows for known features (recording a diagnostic warning without setting `stateUntrusted = true`), and when `stateUntrusted === true` due to an actual DB read error or invalid known row, fail closed (`503` on API reads for optional/sharing features and neutral `404` on `/s/<token>`).
15. **Specific Implementation Steps**:
   - In `lib/feature-controls.js:1235-1312`, log/report `unknownKeys` via diagnostics for rollback visibility, but do NOT set `stateUntrusted = true` solely because `unknownKeys.length > 0`; continue honoring validated rows for all known `FEATURE_REGISTRY_BY_KEY` keys.
   - When `stateUntrusted === true` (actual DB read error or corrupted row on a known key), set effective state for non-essential/sharing features (`unlisted_collection_sharing`, `shared_collection_photos`, `greatest_hits_collections`, `customer_profile`, `admin_style_guide_workspace`) to fail closed (`503` / `hidden`) rather than `enabled`/`paused`.
   - Check `featureStates.stateUntrusted` in `resolveLiveSharedCollectionByToken` and `readSharedCollectionPhotoByToken` (`lib/customer-profile.js:3014, 4291`) to return the neutral unavailable response on untrusted state.
16. **Dependencies / Prerequisites**: Review `tests/feature-controls.integration.cjs` assertions on `unknownKeys` / `stateUntrusted` behavior before updating.
17. **Regression Risks**: Core public truck catalog browsing (`public_discovery` / `/api/trucks`) is intentionally resilient during DB degradation; preserve public catalog availability while failing closed on gated account/sharing/beta surfaces.
18. **Verification Steps**: In `tests/feature-controls.integration.cjs`, insert a `feature_controls` row with `feature_key = "future_release_key"` while `unlisted_collection_sharing = "hidden"`, and assert `/s/<token>` and `/api/me/shares/create` remain blocked (`404`/`403`). Also simulate a DB query failure on `feature_controls` and verify `/s/<token>` fails closed.
19. **Estimated Effort**: `M`
20. **Repair Priority**: `P0` (Linked Repair Tasks: [REP-003](09_PRIORITIZED_REPAIR_PLAN.md#rep-003))

---

<a id="aud-0004"></a>
### AUD-0004 — Invalid write-pause scope "favorites" in api/favorites/toggle.js triggers fail-closed global write outage when configured

1. **Finding ID**: `AUD-0004`
2. **Concise Title**: Invalid write-pause scope "favorites" in api/favorites/toggle.js triggers fail-closed global write outage when configured
3. **Severity**: **CRITICAL**
4. **Category**: Reliability / Data Integrity
5. **Confidence Level**: **Confirmed**
6. **Affected Subsystem**: S2: HTTP server core, routing, api/* handlers & DB adapter
7. **File Path & Relevant Line Numbers**: `api/favorites/toggle.js:9-11`, `lib/authz.js:120-127`, `lib/authz.js:155-182`, `docs/engineering/contracts/configuration-keys.json:1-88`
8. **What Is Wrong**: `api/favorites/toggle.js` calls `enforceWritePause(req, "favorites")`, but `"favorites"` is not in `VALID_PAUSE_SCOPES` in `lib/authz.js`. Setting `BITESHARK_PAUSE_WRITES=favorites` causes `parsePauseWritesEnv()` to flag an invalid token and set `failClosedAll = true`, halting ALL writes across the entire application (`503`).
9. **Evidence**: `api/favorites/toggle.js:10`: `const paused = enforceWritePause(req, 'favorites');`. `lib/authz.js:120-127`: `const VALID_PAUSE_SCOPES = new Set(['all', 'bookings', 'owner', 'pager', 'community', 'notifications']);` (`'favorites'` is missing!). `lib/authz.js:169-174`: `if (!VALID_PAUSE_SCOPES.has(part)) { invalidTokens.push(part); } ... failClosedAll: invalidTokens.length > 0` -> every `enforceWritePause` call returns `503 WRITE_PAUSED`.
10. **Expected / Intended Behavior**: `VALID_PAUSE_SCOPES` must include `"favorites"` (and any other domain scope passed to `enforceWritePause`) so operators can granularly pause favorites writes without triggering an accidental sitewide write outage, while `BITESHARK_PAUSE_WRITES=all` continues pausing `favorites`.
11. **Actual Behavior / Code Condition**: Granularly pausing favorites via `BITESHARK_PAUSE_WRITES=favorites` immediately takes down bookings, owner updates, pickup pagers, community posts, notifications, and admin/customer writes that check `enforceWritePause`.
12. **User or Operational Impact**: Severe operational self-DoS trap during incident response when an operator attempts to pause only favorites writes.
13. **Root Cause**: `api/favorites/toggle.js` was wired with scope `"favorites"` without registering `"favorites"` in `VALID_PAUSE_SCOPES` in `lib/authz.js`.
14. **Recommended Remediation**: Add `"favorites"` (plus `"exploration"`, `"profile"`, `"governance"`, `"issues"` when expanding `PAUSE_WRITES` in `AUD-0014`) to `VALID_PAUSE_SCOPES` in `lib/authz.js` and document all supported scopes in `docs/VPS_OPERATIONS.md` and `configuration-keys.json`.
15. **Specific Implementation Steps**:
   - Add `"favorites"` to `VALID_PAUSE_SCOPES` in `lib/authz.js:120-127`.
   - Add a runtime assertion or unit check inside `enforceWritePause(req, scope)` warning in tests if a caller passes a `scope` absent from `VALID_PAUSE_SCOPES`.
   - Update `docs/VPS_OPERATIONS.md` with the exact list of valid `BITESHARK_PAUSE_WRITES` scopes.
16. **Dependencies / Prerequisites**: Coordinate with `REP-009` (`AUD-0014`) so all write-pause scopes are registered in one place.
17. **Regression Risks**: None; preserves fail-closed behavior for genuinely misspelled operator env tokens while making `"favorites"` work as intended.
18. **Verification Steps**: Add a test in `tests/backend-hardening.integration.cjs` setting `BITESHARK_PAUSE_WRITES=favorites` and asserting `POST /api/favorites/toggle` returns `503` while `POST /api/bookings/create` and `POST /api/pager/create` remain `200`/`201`.
19. **Estimated Effort**: `S`
20. **Repair Priority**: `P0` (Linked Repair Tasks: [REP-004](09_PRIORITIZED_REPAIR_PLAN.md#rep-004))

---

## HIGH Findings (16)

<a id="aud-0005"></a>
### AUD-0005 — Shared-collection moderation suppression can be bypassed via photo re-attachment, collection updates, and multi-share disclosure masking

1. **Finding ID**: `AUD-0005`
2. **Concise Title**: Shared-collection moderation suppression can be bypassed via photo re-attachment, collection updates, and multi-share disclosure masking
3. **Severity**: **HIGH**
4. **Category**: Security
5. **Confidence Level**: **Confirmed**
6. **Affected Subsystem**: S4: Customer profile, Greatest Hits sharing, exploration & photos
7. **File Path & Relevant Line Numbers**: `lib/customer-profile.js:1478-1488`, `lib/customer-profile.js:1866-2034`, `lib/customer-profile.js:3567-3621`, `lib/customer-profile.js:3888-3898`, `lib/customer-profile.js:4013-4150`, `lib/customer-profile.js:4461-4472`
8. **What Is Wrong**: Three moderation enforcement bypasses exist in `lib/customer-profile.js`: (1) after `suppress_attachment`, the owner can call `POST /api/me/collections/attach-photo` with the exact same `source_photo_id` to mint a fresh `moderation_status = "active"` `sha_*` derivative (while revoking/deleting the suppressed attachment needed by moderators); (2) `computeCollectionContentDigest` ignores `photo_attachment_id` and `SUPPRESSED_CONTENT_BYPASS_BLOCKED` is never checked in `updateOwnerCollection`; and (3) `listAdminSharedModerationQueue` reads disclosure flags solely from `ORDER BY created_at DESC LIMIT 1` (`latestShare`), hiding curator `display_name`/`bio` still live on an older reported link.
9. **Evidence**: `lib/customer-profile.js:4013-4062, 4121-4150` checks `colRes.rows[0].moderation_status === "suppressed"` but never checks if `previousAttachmentId` or `(user_id, recorded_source_photo_id)` / `sha256_hex` was suppressed, setting `revoked_at` on the prior attachment (which causes `readAdminReportedSharedPhoto` at `line 4461` to reject moderator inspection!). `lines 1478-1488` hash only `{ title, intro, entries: [{ v, r }] }`, and `updateOwnerCollection` (`lines 1866-2034`) performs zero `suppressed_content_sha256` checks. `lines 3567-3621` query `LIMIT 1` for `latestShare` despite `MAX_ACTIVE_SHARES_PER_COLLECTION = 3`.
10. **Expected / Intended Behavior**: Suppressed photos (`recorded_source_photo_id` or `sha256_hex`) must remain blocked from re-attachment until `Admin: Top` executes `reinstate_attachment`; suppressed collection content must not be editable onto an already-shared collection; and moderator previews must union disclosures across all active/reported shares.
11. **Actual Behavior / Code Condition**: Collection owners can immediately republish Moderator- or Top-Admin-suppressed photos and text onto live `/s/<token>` URLs and obscure abusive profile disclosures from moderators.
12. **User or Operational Impact**: Defeats content moderation and `Admin: Top` reinstatement controls on public-reachable unlisted `/s/<token>` pages and destroys moderator evidence files.
13. **Root Cause**: Suppression checks were added to `createCollectionShareLink` and `reinstate_attachment` without guarding `attachPhotoToCollectionEntry`, `updateOwnerCollection`, or multi-link disclosure aggregation.
14. **Recommended Remediation**: Block re-attaching suppressed `recorded_source_photo_id` / `sha256_hex` in `attachPhotoToCollectionEntry` (and retain suppressed `sha_*` files while referenced by moderation actions), enforce `suppressed_content_sha256` (including attachment digests) inside `updateOwnerCollection` when shares exist, and union disclosure booleans across all active/reported shares in `listAdminSharedModerationQueue`.
15. **Specific Implementation Steps**:
   - In `attachPhotoToCollectionEntry` (`lib/customer-profile.js:4013-4150`), query `customer_collection_photo_attachments` for `user_id = $1 AND moderation_status = 'suppressed' AND (recorded_source_photo_id = $2 OR sha256_hex = $3)` and throw `403 PHOTO_SUPPRESSED_BY_MODERATION`; do not unlink a prior `sha_*` file when `moderation_status = 'suppressed'`.
   - Include `photo_attachment_id` / `sha256_hex` in `computeCollectionContentDigest` (`line 1478`) and check `suppressed_content_sha256` inside `updateOwnerCollection` (`lines 1950-2020`) whenever the collection has active shares.
   - In `listAdminSharedModerationQueue` (`lines 3567-3621`), compute `include_display_name`, `include_bio`, `include_preferred_area`, and `include_shared_photos` using `BOOL_OR(...)` across all active or reported shares on the collection.
16. **Dependencies / Prerequisites**: None.
17. **Regression Risks**: Owners should still be permitted to remove a suppressed entry or attach a *different* non-suppressed photo if only the single photo (not the whole collection) was suppressed.
18. **Verification Steps**: Add integration tests in `tests/customer-profile-sharing.integration.cjs` covering all three bypass vectors and run `npm run test:profile`.
19. **Estimated Effort**: `M`
20. **Repair Priority**: `P1` (Linked Repair Tasks: [REP-005](09_PRIORITIZED_REPAIR_PLAN.md#rep-005))

---

<a id="aud-0006"></a>
### AUD-0006 — Under-14 birth date submission on POST /api/me/sharing-eligibility rolls back without locking eligibility or revoking session

1. **Finding ID**: `AUD-0006`
2. **Concise Title**: Under-14 birth date submission on POST /api/me/sharing-eligibility rolls back without locking eligibility or revoking session
3. **Severity**: **HIGH**
4. **Category**: Security
5. **Confidence Level**: **Confirmed**
6. **Affected Subsystem**: S4: Customer profile, Greatest Hits sharing, exploration & photos
7. **File Path & Relevant Line Numbers**: `lib/customer-profile.js:2263-2306`, `lib/age-policy.js:279-304`, `lib/standalone-auth.js:2665-2725`
8. **What Is Wrong**: In `submitAdultSharingEligibility`, ages 14–17 commit `eligibility_status = "ineligible_under_18"` inside `withTransaction` before throwing `403` outside the transaction so the user cannot retry with a fake adult DOB. When `evalRes.under_14` is true (`< 14`), however, `CustomerProfileDomainError` is thrown *inside* `withTransaction`, rolling back the transaction and leaving `customer_sharing_eligibility` at `"unknown"` and the session active.
9. **Evidence**: `lib/customer-profile.js:2263-2268`: `if (evalRes.under_14) { throw new CustomerProfileDomainError(evalRes.error, { status: 403, code: 'AGE_INELIGIBLE' }); }` inside `withTransaction` (triggers `ROLLBACK`), whereas `lines 2271-2292` (`!evalRes.eligible_18_plus` for 14–17) `INSERT INTO customer_sharing_eligibility ... VALUES ($1, 'ineligible_under_18', ...)` and return `{ deniedError }` so `withTransaction` commits before throwing at `line 2305`.
10. **Expected / Intended Behavior**: Submitting an under-14 birth date must commit a durable ineligible state (never leaving `customer_sharing_eligibility` retryable as `"unknown"`) and align with BiteShark's 14+ account age policy (`docs/engineering/AUTH-AND-PERMISSIONS.md`) regarding session revocation / account suspension without storing raw DOB.
11. **Actual Behavior / Code Condition**: A user submitting a 12-year-old birth date receives `403 AGE_INELIGIBLE`, retains an active session and `"unknown"` sharing eligibility, and can immediately submit `1995-01-01` on the very next request to unlock 18+ external link sharing.
12. **User or Operational Impact**: Under-14 age-policy compliance gap on external sharing eligibility.
13. **Root Cause**: Throwing `CustomerProfileDomainError` inside `withTransaction` aborted the transaction instead of using the commit-then-throw `{ deniedError }` pattern used immediately below for ages 14–17.
14. **Recommended Remediation**: Use the commit-then-throw `{ deniedError }` pattern for `evalRes.under_14` so `ineligible_under_18` is always committed in `customer_sharing_eligibility`, and confirm with product/legal whether under-14 self-attestation on `/api/me/sharing-eligibility` should also mark `auth_users.age_eligibility_status = "ineligible"` + disable/revoke active sessions like `/api/auth/age-assessment`. *(**REQUIRES PRODUCT DECISION** — see [09_PRIORITIZED_REPAIR_PLAN.md](09_PRIORITIZED_REPAIR_PLAN.md#decisions-required))*
15. **Specific Implementation Steps**:
   - In `lib/customer-profile.js:2263-2295`, persist `ineligible_under_18` in `customer_sharing_eligibility` inside `withTransaction` and return `{ deniedError: new CustomerProfileDomainError(evalRes.error, { status: 403, code: "AGE_INELIGIBLE" }) }` so the lock commits before throwing `403`.
   - Once product/legal confirms account-wide handling (`Decisions Required`), optionally revoke `auth_sessions` and update `auth_users.age_eligibility_status` in the same committed transaction (storing zero raw DOB fields).
16. **Dependencies / Prerequisites**: Product/legal confirmation on whether under-14 sharing-gate input should also suspend the 14+ account or lock sharing eligibility only.
17. **Regression Risks**: If account-wide session revocation is enabled, ensure `public/greatest-hits-sharing.js` handles `401`/`403 AGE_INELIGIBLE` by clearing client caches and redirecting cleanly.
18. **Verification Steps**: Add a test in `tests/customer-profile-sharing.integration.cjs` posting a 12-year-old DOB (`403`) followed by a 25-year-old DOB and asserting the second request is rejected (`403`) with `eligibility_status = "ineligible_under_18"`.
19. **Estimated Effort**: `S`
20. **Repair Priority**: `P1` (Linked Repair Tasks: [REP-006](09_PRIORITIZED_REPAIR_PLAN.md#rep-006))

---

<a id="aud-0007"></a>
### AUD-0007 — Unlisted /s/<token> routes ignore staff_beta audience restrictions and two customer/shared endpoints omit central route feature rules

1. **Finding ID**: `AUD-0007`
2. **Concise Title**: Unlisted /s/<token> routes ignore staff_beta audience restrictions and two customer/shared endpoints omit central route feature rules
3. **Severity**: **HIGH**
4. **Category**: Security
5. **Confidence Level**: **Confirmed**
6. **Affected Subsystem**: S4: Customer profile, Greatest Hits sharing, exploration & photos
7. **File Path & Relevant Line Numbers**: `server/customer-profile-routes.js:727-731`, `server/customer-profile-routes.js:804-810`, `lib/customer-profile.js:3014-3019`, `lib/customer-profile.js:4291-4297`, `lib/feature-controls.js:1876-1928`, `server/app.js:964-966`
8. **What Is Wrong**: `greatest_hits_collections`, `unlisted_collection_sharing`, and `shared_collection_photos` all advertise `allowed_audiences: ["all", "staff_beta"]`, where `system_effective_state` remains `"enabled"` and only `caller_effective_state` becomes `"hidden"` for non-staff callers. However, `/s/<token>` and `/s/<token>/photo/<attachment>` pass `verifiedUser = null` and inspect `.system_state === "hidden"`, leaving all shared links publicly viewable during `staff_beta`. Additionally, `GET /api/me/exploration` and `POST /api/shared/report` are absent from `ROUTE_FEATURE_ENFORCEMENT_RULES` in `lib/feature-controls.js`.
9. **Evidence**: `server/customer-profile-routes.js:727-731, 804-810` call `resolveCallerProfileFeatureFlags(dbAdapter, req, null)` and pass `systemFeatureStates`. `lib/customer-profile.js:3014-3019, 4291-4297` check `systemFeatureStates?.unlisted_collection_sharing?.system_state === 'hidden'`. Meanwhile, `lib/feature-controls.js:1876-1928` (`ROUTE_FEATURE_ENFORCEMENT_RULES`) has no rule for `/api/me/exploration` or `/api/shared/report`.
10. **Expected / Intended Behavior**: Setting `audience: "staff_beta"` must either restrict `/s/<token>` and `/s/<token>/photo/<attachment>` to authenticated `staff_beta` viewers (resolving the viewer session cookie) OR explicitly state in the Admin Feature Controls UI that `staff_beta` restricts link creation only; and `ROUTE_FEATURE_ENFORCEMENT_RULES` should explicitly declare the policy for every exploration/sharing endpoint.
11. **Actual Behavior / Code Condition**: Operators placing sharing features into `staff_beta` leave existing and staff-created `/s/<token>` pages and photos publicly accessible to unauthenticated internet visitors.
12. **User or Operational Impact**: Unexpected public exposure of beta features and unlisted shared content when operators configure `audience = "staff_beta"`.
13. **Root Cause**: Recipient routes passed `null` user context to `resolveCallerProfileFeatureFlags` and checked `system_state` instead of caller `state`.
14. **Recommended Remediation**: Confirm product intent for `staff_beta` recipient viewing; pass resolved read-only viewer session (`sess?.user || null`) into `resolveCallerProfileFeatureFlags` on both `/s/<token>` and `/s/<token>/photo/<attachment>` to enforce `.state === "hidden"` when `staff_beta` is active, and register explicit entries (or documented exemptions) for `GET /api/me/exploration` and `POST /api/shared/report` in `lib/feature-controls.js`. *(**REQUIRES PRODUCT DECISION** — see [09_PRIORITIZED_REPAIR_PLAN.md](09_PRIORITIZED_REPAIR_PLAN.md#decisions-required))*
15. **Specific Implementation Steps**:
   - In `server/app.js:1330-1360`, resolve read-only viewer session on `/s/<token>/photo/<attachment>` (without sliding-window cookie mutation) just as `/s/<token>` already does at `line 1345`, and forward `viewerUser: sess?.user || null` to both handlers.
   - In `server/customer-profile-routes.js:727, 804` and `lib/customer-profile.js:3014, 4291`, pass `viewerUser` to `resolveCallerProfileFeatureFlags` and gate on `.state === "hidden"` (or document explicit `staff_beta` semantics in `lib/feature-controls.js:419-455` per product decision).
   - Add explicit route metadata in `lib/feature-controls.js:1876-1928` for `/api/me/exploration` and `/api/shared/report`.
16. **Dependencies / Prerequisites**: Product decision on whether `staff_beta` on `unlisted_collection_sharing` should require recipients of `/s/<token>` to be signed-in staff.
17. **Regression Risks**: If `/s/<token>` requires staff sign-in during `staff_beta`, incognito recipient tests under `staff_beta` will receive the neutral `404` page by design.
18. **Verification Steps**: Add a `staff_beta` recipient test in `tests/customer-profile-sharing.integration.cjs` verifying anonymous vs staff `GET /s/<token>` and `GET /s/<token>/photo/<att>`.
19. **Estimated Effort**: `S`
20. **Repair Priority**: `P1` (Linked Repair Tasks: [REP-007](09_PRIORITIZED_REPAIR_PLAN.md#rep-007))

---

<a id="aud-0008"></a>
### AUD-0008 — Admin: Mod can enumerate masked customer emails via /api/admin/accounts ILIKE oracle and read unmasked emails and Top-only telemetry on /api/admin/invitations & /api/admin/audit

1. **Finding ID**: `AUD-0008`
2. **Concise Title**: Admin: Mod can enumerate masked customer emails via /api/admin/accounts ILIKE oracle and read unmasked emails and Top-only telemetry on /api/admin/invitations & /api/admin/audit
3. **Severity**: **HIGH**
4. **Category**: Security
5. **Confidence Level**: **Confirmed**
6. **Affected Subsystem**: S3: Admin governance backend
7. **File Path & Relevant Line Numbers**: `server/admin-routes.js:4220-4252`, `server/admin-routes.js:4305-4315`, `server/admin-routes.js:4655-4670`, `server/admin-routes.js:6595-6605`, `server/admin-routes.js:7225-7250`, `lib/admin-governance.js:301-326`
8. **What Is Wrong**: Per `docs/engineering/AUTH-AND-PERMISSIONS.md`, `Admin: Mod` is restricted from viewing raw customer PII (`maskEmail` on `/api/admin/accounts`) and Top-only diagnostic/provider telemetry. However: (1) `GET /api/admin/accounts?q=...` runs unescaped SQL `u.email_normalized ILIKE $N` *before* applying `maskEmail`, allowing `Admin: Mod` to reconstruct any customer email character-by-character; (2) `GET /api/admin/invitations` returns unmasked `recipient_email` for `customer_access` invites plus Top-only provider error codes/IDs to `Admin: Mod`; and (3) `GET /api/admin/audit` leaks Top-restricted `diagnostic_group_id` and `fixing_release_sha` inside `issue.diagnostic_*` metadata.
9. **Evidence**: `server/admin-routes.js:4222, 4247-4250, 4309`: filters `u.email_normalized ILIKE '%' || q || '%'` (with unescaped `_` and `%` wildcards) and only masks `email: ctx.isTopAdmin ? r.email : maskEmail(r.email)` during serialization. `server/admin-routes.js:4660` & `lib/admin-governance.js:301-326`: `GET /api/admin/invitations` allows `Mod` and returns raw `recipient_email`, `last_provider_message_id`, and `last_delivery_error_code`. `server/admin-routes.js:7240-7244` returns raw `audit_logs.metadata` on `issue.diagnostic_linked` without redacting `diagnostic_group_id` / `fixing_release_sha` (which `/api/admin/issues` explicitly strips for `Mod` at `lines 6595-6601`).
10. **Expected / Intended Behavior**: `Admin: Mod` searches on `/api/admin/accounts` must not match hidden characters of customer emails (search by `user_id`, exact email hash/domain, or staff/vendor emails only, with escaped `ILIKE`), customer emails and provider telemetry on `/api/admin/invitations` must be masked/redacted for `Mod`, and `/api/admin/audit` must strip Top-only diagnostic metadata for `Mod`.
11. **Actual Behavior / Code Condition**: An `Admin: Mod` account can de-anonymize any customer email via prefix/wildcard queries on `/api/admin/accounts?q=` and read raw customer emails and Top-only diagnostic/provider identifiers via `/api/admin/invitations` and `/api/admin/audit`.
12. **User or Operational Impact**: Violates `Admin: Mod` least-privilege PII and diagnostic isolation contracts.
13. **Root Cause**: Masking/redaction was applied inconsistently at individual endpoint serializers without auditing SQL filter side-channels or cross-endpoint projections (`/api/admin/invitations`, `/api/admin/audit`).
14. **Recommended Remediation**: Restrict `Admin: Mod` `q` matching on `/api/admin/accounts` so non-staff customer emails are only matched on `u.id` or masked-safe domain/exact match (and escape `ILIKE` wildcards across all admin search routes), mask `customer_access` `recipient_email` + redact provider telemetry for `Mod` in `/api/admin/invitations`, and scrub Top-only diagnostic keys from `/api/admin/audit` for `Mod`.
15. **Specific Implementation Steps**:
   - Centralize `escapeSqlLike(q)` in `lib/admin-governance.js` and apply `ESCAPE '\\'` across all admin `ILIKE` filters (`server/admin-routes.js:3286, 3799, 4222, 5303, 6619, 7229`).
   - In `server/admin-routes.js:4247-4252`, when `!ctx.isTopAdmin`, restrict email `ILIKE` matching to accounts holding `platform_roles` or `vendor_memberships` (allowing `u.id` lookup or exact-email match for customer accounts).
   - In `lib/admin-governance.js:301-326` / `server/admin-routes.js:4660`, mask `recipient_email` on `customer_access` invitations and omit `last_provider_message_id` / raw provider error details when `!ctx.isTopAdmin`; in `server/admin-routes.js:7240-7244`, strip `diagnostic_group_id` and `fixing_release_sha` from `audit_logs.metadata` when `!ctx.isTopAdmin`.
16. **Dependencies / Prerequisites**: None.
17. **Regression Risks**: Ensure `Admin: Mod` can still look up a customer account by `user_id` (`usr_...`) when triaging a support issue.
18. **Verification Steps**: Add assertions in `tests/admin-governance.integration.cjs` confirming `Admin: Mod` cannot probe substring matches on a customer email via `/api/admin/accounts?q=`, receives masked `customer_access` emails on `/api/admin/invitations`, and sees redacted diagnostic metadata on `/api/admin/audit`.
19. **Estimated Effort**: `M`
20. **Repair Priority**: `P1` (Linked Repair Tasks: [REP-008](09_PRIORITIZED_REPAIR_PLAN.md#rep-008))

---

<a id="aud-0009"></a>
### AUD-0009 — Unauthenticated /api/diagnostics/report can evict server_verified incidents (cascading issue links), spoof actor_id, and bypass secret/cookie regex scrubbers

1. **Finding ID**: `AUD-0009`
2. **Concise Title**: Unauthenticated /api/diagnostics/report can evict server_verified incidents (cascading issue links), spoof actor_id, and bypass secret/cookie regex scrubbers
3. **Severity**: **HIGH**
4. **Category**: Security
5. **Confidence Level**: **Confirmed**
6. **Affected Subsystem**: S5: Pager notifications, Web Push worker & diagnostics
7. **File Path & Relevant Line Numbers**: `lib/diagnostics.js:85-95`, `lib/diagnostics.js:165-190`, `lib/diagnostics.js:1008-1025`, `public/diagnostics-client.js:69-82`, `server/admin-routes.js:629-712`, `migrations/025_support_feedback_and_diagnostic_links.sql:425-435`, `deploy/bin/biteshark-staging2-ctl:142-146`
8. **What Is Wrong**: Multiple security/forensic weaknesses exist in diagnostics & log redaction: (1) `POST /api/diagnostics/report` accepts unauthenticated `browser_untrusted` telemetry into the same `500`-row `diagnostic_incident_groups` eviction pool as `server_verified` incidents (`ON DELETE CASCADE` deleting `support_issue_diagnostic_links`); (2) `POST /api/diagnostics/report` preserves caller-supplied `safe_context.actor_id` on unauthenticated reports; (3) `lib/diagnostics.js` uses `\b` before `secret|token|password` (which fails to match underscore-prefixed keys like `auth_secret=`, `unsubscribe_token=`, `session_token=`, `db_password=` because `_` is a word character!) and `{34,}` misses 22-char `auth_secret` and 32-char `unsubscribe_token`; (4) `public/diagnostics-client.js` omits JWT, UUID, and session-cookie scrubbers; and (5) `deploy/bin/biteshark-staging2-ctl` redacts `__Host-truckly_session=` but omits `__Host-bs_admin_test_session=`.
9. **Evidence**: `lib/diagnostics.js:1010-1021` evicts `WHERE status IN ('resolved', 'ignored')` then falls back to evicting ANY oldest group across the shared 500-group cap, triggering `ON DELETE CASCADE` on `support_issue_diagnostic_links` (`migrations/025:429`). `lib/diagnostics.js:87, 169, 182` uses `\b(?:password|secret|token)` (fails after `_`) and `[A-Za-z0-9_-]{34,}` (misses 22–32 char secrets). `server/admin-routes.js:709` spreads `body.safe_context` before setting `actor_id` only if authenticated. `deploy/bin/biteshark-staging2-ctl:144` matches only `__Host-truckly_session=`.
10. **Expected / Intended Behavior**: Untrusted browser telemetry must be capped in a separate quota that can NEVER evict `server_verified` groups or issue-linked groups; `browser_untrusted` reports must overwrite `actor_id` strictly from verified session state; and all server/client/CLI redactors must scrub underscore-prefixed `*_secret`/`*_token`/`*_password` keys, 22+ char secrets, and `__Host-bs_admin_test_session` cookies.
11. **Actual Behavior / Code Condition**: External scripts rotating `error_code` across IP windows can evict `server_verified` auth/security incidents and unlink open support tickets, forge `actor_id` in untrusted payloads, and leak `auth_secret=`/`unsubscribe_token=` or `__Host-bs_admin_test_session=` in diagnostic/operator logs.
12. **User or Operational Impact**: Loss of server security/incident forensics, broken support-issue diagnostic links, log spoofing, and incomplete secret/session redaction.
13. **Root Cause**: Shared eviction SQL did not partition `trust_source = "browser_untrusted"` from `server_verified` or `EXISTS (SELECT 1 FROM support_issue_diagnostic_links ...)`, and regex `` semantics with `_` (`w`) were overlooked.
14. **Recommended Remediation**: Partition `browser_untrusted` group eviction (e.g., max 150 untrusted groups, never evicting `server_verified` or linked groups), strip caller `actor_id` on `POST /api/diagnostics/report`, replace `\b` with `(?:^|[^A-Za-z0-9])` and lower token-entropy length bounds in `lib/diagnostics.js` + `public/diagnostics-client.js`, and add `__Host-bs_admin_test_session` redaction to `deploy/bin/biteshark-staging2-ctl` and `deploy/install-staging-release.sh`.
15. **Specific Implementation Steps**:
   - In `lib/diagnostics.js:1008-1025`, enforce a dedicated cap (e.g., `150`) for `trust_source = 'browser_untrusted'` and add `AND trust_source = 'browser_untrusted' AND NOT EXISTS (SELECT 1 FROM support_issue_diagnostic_links l WHERE l.diagnostic_group_id = diagnostic_incident_groups.id)` when evicting for untrusted inserts; protect issue-linked `server_verified` groups from eviction as well.
   - In `server/admin-routes.js:695-712`, strip `actor_id`, `actor_role`, and `session_id` from incoming `body.safe_context` and populate `actor_id` exclusively from verified `req.user?.id || null`.
   - In `lib/diagnostics.js:85-190`, replace `\b` before sensitive key names with `(?:^|[^A-Za-z0-9]|_)` and scrub `__Host-bs_admin_test_session` + 22+ char base64url tokens; mirror cookie/JWT/UUID scrubbers in `public/diagnostics-client.js:69-82` and `__Host-bs_admin_test_session=` in `deploy/bin/biteshark-staging2-ctl:144` & `deploy/install-staging-release.sh:737`.
16. **Dependencies / Prerequisites**: None.
17. **Regression Risks**: Ensure lowering high-entropy token redaction thresholds does not redact short normal slugs (`mitote`, `DEC-BRAND-001`) or `corr_*` correlation IDs.
18. **Verification Steps**: Add unit/integration assertions in `tests/diagnostics-and-reliability.integration.cjs` and `tests/staging2-ctl-security.test.cjs` testing `auth_secret=`, `unsubscribe_token=`, `__Host-bs_admin_test_session=`, `actor_id` spoofing, and `browser_untrusted` flood isolation.
19. **Estimated Effort**: `M`
20. **Repair Priority**: `P1` (Linked Repair Tasks: [REP-010](09_PRIORITIZED_REPAIR_PLAN.md#rep-010))

---

<a id="aud-0010"></a>
### AUD-0010 — Third-party CDN Leaflet script & stylesheet load without Subresource Integrity (SRI) and block all first-party scripts, while HTML pages lack baseline CSP

1. **Finding ID**: `AUD-0010`
2. **Concise Title**: Third-party CDN Leaflet script & stylesheet load without Subresource Integrity (SRI) and block all first-party scripts, while HTML pages lack baseline CSP
3. **Severity**: **HIGH**
4. **Category**: Security
5. **Confidence Level**: **Confirmed**
6. **Affected Subsystem**: S7: Customer-facing SPA frontend
7. **File Path & Relevant Line Numbers**: `public/index.html:7-9`, `public/index.html:459-478`, `server/app.js:248-252`
8. **What Is Wrong**: `public/index.html` loads `https://unpkg.com/leaflet@1.9.4/dist/leaflet.css` (`line 7`) and synchronous `<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>` (`line 459`) without `integrity="sha384-..."` or `crossorigin=""` attributes, directly on the same origin that hosts authenticated customer, vendor, and `/admin` sessions (`__Host-truckly_session`), and ahead of all 18 first-party scripts. Furthermore, `applyBaselineSecurityHeaders` (`server/app.js:248-252`) sets no `Content-Security-Policy` on `/`, `/admin`, `/login.html`, or `/policies/*` (unlike `/s/<token>`, which enforces strict CSP).
9. **Evidence**: `public/index.html:7`: `<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">`. `public/index.html:459`: `<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>` (no `integrity`, no `crossorigin`, no `defer`, even when `interactive_map` is `hidden`!). `server/app.js:248-252` sets only `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and `Permissions-Policy`.
10. **Expected / Intended Behavior**: Third-party CDN scripts/stylesheets must either be vendored locally under `public/vendor/leaflet/` (eliminating external runtime dependency and render-blocking stalls) or pinned with SHA-384 Subresource Integrity (`integrity` + `crossorigin="anonymous"`), and `/admin` + `/login.html` + `/` should carry an explicit `Content-Security-Policy` (`object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`).
11. **Actual Behavior / Code Condition**: Compromise of `unpkg.com` grants full JavaScript execution across BiteShark's origin without SRI verification; slow/blackholed TCP connections to `unpkg.com` block execution of all 18 local scripts until browser script timeout; and `/admin` lacks `Content-Security-Policy`.
12. **User or Operational Impact**: Third-party CDN supply-chain XSS exposure across authenticated customer/vendor sessions and single-point-of-failure render blocking when `unpkg.com` hangs.
13. **Root Cause**: Early prototype CDN `<link>`/`<script>` tags in `public/index.html` were retained while map-tile resilience was added inside `public/app.js`.
14. **Recommended Remediation**: Add cryptographic `integrity` + `crossorigin="anonymous"` attributes to Leaflet CSS/JS immediately (or vendor Leaflet 1.9.4 locally in `public/vendor/leaflet/` and lazy-load only when `interactive_map` is not hidden), and add a strict `Content-Security-Policy` header to `/admin` and `/login.html` (where zero inline event handlers exist) plus a compatible `object-src 'none'; base-uri 'self'; frame-ancestors 'none'` baseline CSP on `/`.
15. **Specific Implementation Steps**:
   - Add exact SHA-384 `integrity` and `crossorigin="anonymous"` attributes to `public/index.html:7` and `public/index.html:459` (or vendor `leaflet.js`, `leaflet.css`, and marker PNGs locally under `public/vendor/leaflet/`).
   - Load Leaflet non-blockingly (`defer` or dynamic loader in `public/app.js` gated on `!isFeatureHidden("interactive_map")`) so an unreachable CDN never stalls first-party script execution.
   - In `server/app.js`, attach a strict `Content-Security-Policy` (`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://api.github.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'`) on `/admin` and `/login.html`, and baseline `object-src 'none'; base-uri 'self'; frame-ancestors 'none'` across all HTML responses.
16. **Dependencies / Prerequisites**: Verify `tests/map-resilience.test.cjs` and `tests/map-resilience-browser.e2e.cjs` expectations on Leaflet `<script>` tags before changing URL vs adding SRI.
17. **Regression Risks**: `public/index.html` and `public/app.js` currently use inline `onclick="..."` attributes (`openDetail`, `closeModal`), so `/` cannot set `script-src 'self'` without `'unsafe-inline'` until inline handlers are migrated; `/admin` and `/login.html` use zero inline `on*` handlers (verify before deploying `script-src 'self'`).
18. **Verification Steps**: Run `node tests/map-resilience.test.cjs`, `tests/map-resilience-browser.e2e.cjs`, and `tests/admin-portal-browser.e2e.cjs`, confirming zero CSP console violations on `/`, `/login.html`, and `/admin`.
19. **Estimated Effort**: `S`
20. **Repair Priority**: `P1` (Linked Repair Tasks: [REP-011](09_PRIORITIZED_REPAIR_PLAN.md#rep-011))

---

<a id="aud-0011"></a>
### AUD-0011 — Community feed (/api/community/list) and post creation (/api/community/post) bypass vendor hidden_from_discovery and deactivation governance

1. **Finding ID**: `AUD-0011`
2. **Concise Title**: Community feed (/api/community/list) and post creation (/api/community/post) bypass vendor hidden_from_discovery and deactivation governance
3. **Severity**: **HIGH**
4. **Category**: Security
5. **Confidence Level**: **Confirmed**
6. **Affected Subsystem**: S2: HTTP server core, routing, api/* handlers & DB adapter
7. **File Path & Relevant Line Numbers**: `api/community/list.js:8-15`, `api/community/post.js:95-105`, `lib/discovery.js:195-245`
8. **What Is Wrong**: Admin vendor governance (`POST /api/admin/vendors/status`) allows `Admin: Mod` / `Admin: Top` to hide (`hidden_from_discovery = true`) or deactivate (`is_active = false`, `ownership_status = "suspended"`) a vendor. However, `GET /api/community/list` returns all `approved` posts without joining `vendors`, and `POST /api/community/post` checks only `vendors.is_active`, ignoring `hidden_from_discovery` and `ownership_status`.
9. **Evidence**: `api/community/list.js:8-13`: `SELECT id, place_id, place_name, town, kind, rating, title, body, author_label, created_at FROM community_reviews WHERE status = 'approved' ORDER BY created_at DESC LIMIT 80` (no `JOIN vendors` filter). `api/community/post.js:95-103`: queries `SELECT is_active, canonical_name, city FROM vendors WHERE id = $1` and checks only `vRow.is_active === false`, omitting `hidden_from_discovery === true`.
10. **Expected / Intended Behavior**: Vendors suppressed via `hidden_from_discovery = true` or `is_active = false` must be excluded from public `/api/community/list` feeds and rejected (`404`/`403`) for new community submissions in `/api/community/post`, matching `loadDiscoveryCatalog` (`lib/discovery.js`).
11. **Actual Behavior / Code Condition**: Deactivated or hidden businesses remain publicly visible in the Community tab feed, and hidden businesses continue accepting new customer reviews/tips.
12. **User or Operational Impact**: Bypasses administrative vendor takedown/suppression controls on the public site.
13. **Root Cause**: `api/community/list.js` and `api/community/post.js` predated the `hidden_from_discovery` governance flags introduced in Migration `018` and `lib/discovery.js`.
14. **Recommended Remediation**: Filter `api/community/list.js` against `loadDiscoveryCatalog` (or `LEFT JOIN vendors v ON v.id = community_reviews.place_id WHERE COALESCE(v.is_active, true) = true AND COALESCE(v.hidden_from_discovery, false) = false`) and enforce `!vRow.hidden_from_discovery` (plus catalog existence for unseeded static vendors) in `api/community/post.js`.
15. **Specific Implementation Steps**:
   - In `api/community/list.js:8-15`, add `LEFT JOIN vendors v ON v.id = community_reviews.place_id` with `AND COALESCE(v.is_active, true) = true AND COALESCE(v.hidden_from_discovery, false) = false` (and verify static-only `place_id`s exist in `TRUCKS`).
   - In `api/community/post.js:95-105`, select `hidden_from_discovery` alongside `is_active` and reject with `403`/`404` when `vRow.hidden_from_discovery === true`.
16. **Dependencies / Prerequisites**: None.
17. **Regression Risks**: Static catalog entries that do not yet have a `vendors` DB row rely on `LEFT JOIN` (`COALESCE(..., true/false)`); test both DB-backed and static-only vendor IDs.
18. **Verification Steps**: Extend `tests/p1-unified-discovery.integration.cjs` to hide a vendor with an approved community post via `/api/admin/vendors/status` and assert it disappears from `GET /api/community/list` and rejects `POST /api/community/post`.
19. **Estimated Effort**: `S`
20. **Repair Priority**: `P1` (Linked Repair Tasks: [REP-012](09_PRIORITIZED_REPAIR_PLAN.md#rep-012))

---

<a id="aud-0012"></a>
### AUD-0012 — 14 database tables lack FORCE ROW LEVEL SECURITY, api/favorites & notifications execute no-op GUC calls, and favorites/toggle accepts unbounded arbitrary truck_ids

1. **Finding ID**: `AUD-0012`
2. **Concise Title**: 14 database tables lack FORCE ROW LEVEL SECURITY, api/favorites & notifications execute no-op GUC calls, and favorites/toggle accepts unbounded arbitrary truck_ids
3. **Severity**: **HIGH**
4. **Category**: Security
5. **Confidence Level**: **Confirmed**
6. **Affected Subsystem**: S9: Database migrations, RLS policies, schema & indexes
7. **File Path & Relevant Line Numbers**: `migrations/001_create_bookings.sql:1`, `migrations/003_create_favorites.sql:1`, `migrations/004_create_notification_settings.sql:1`, `migrations/008_pickup_pagers.sql:1-10`, `migrations/011_vendor_authz_and_audit.sql:3-198`, `api/favorites/toggle.js:8-48`, `api/notifications/settings.js:18-32`, `docs/engineering/generated/SCHEMA-INVENTORY.md:1-60`
8. **What Is Wrong**: Although newer BiteShark tables (`migrations/012`–`029`) enforce `ENABLE` + `FORCE ROW LEVEL SECURITY`, 14 SQL tables (`bookings`, `truck_settings`, `favorites`, `notification_settings`, `owner_profiles`, `owner_schedule`, `pickup_pagers`, `vendors`, `platform_roles`, `vendor_memberships`, `audit_logs`, `platform_role_revocations`, `admin_bootstrap_grants`, `vendor_status_history`, plus `schema_migrations`) have **no RLS enabled or forced**. Worse, `api/favorites/toggle.js:23` and `api/notifications/settings.js:21` execute `SELECT set_config('app.user_id', ...)` against tables that have zero RLS policies (giving a false appearance of DB-enforced tenant isolation), and `api/favorites/toggle.js` accepts any arbitrary string `<= 80` chars as `truck_id` with no catalog/vendor validation, no per-user cap, and no dedicated rate limit.
9. **Evidence**: `wave2_verified.json` (`sqlSummary.tablesWithoutForceRls`): `0` `ALTER TABLE ... ENABLE/FORCE ROW LEVEL SECURITY` statements exist for `bookings`, `favorites`, `notification_settings`, `pickup_pagers`, `owner_profiles`, `owner_schedule`, `truck_settings`, `vendors`, `platform_roles`, `vendor_memberships`, `audit_logs`, `platform_role_revocations`, `admin_bootstrap_grants`, or `vendor_status_history`. In `api/favorites/toggle.js:18-44`, `truckId` checks only `truckId.length > 80` and inserts directly into `favorites (user_id, truck_id)` with no catalog check or row cap.
10. **Expected / Intended Behavior**: User-scoped tables (`favorites`, `notification_settings`, `bookings`) must enforce `FORCE ROW LEVEL SECURITY` keyed on `app.user_id` (or documented vendor/admin GUC scopes), `api/favorites/toggle.js` must validate `truck_id` against known discovery/DB vendors with a bounded per-user cap (e.g. `200`) and rate limit, and `DATA-MODEL.md` must accurately distinguish RLS-enforced vs app-mediated governance tables.
11. **Actual Behavior / Code Condition**: Any query bug omitting `WHERE user_id = $1` on `favorites`, `notification_settings`, or `bookings` exposes cross-tenant data, and an authenticated user can stuff unlimited bogus `truck_id` rows into `favorites`.
12. **User or Operational Impact**: Missing database-layer tenant isolation on legacy customer/vendor tables and unbounded table-bloat vector on `favorites`.
13. **Root Cause**: Migrations `001`–`011` and `018` were authored before `FORCE ROW LEVEL SECURITY` became the repository standard in Migrations `019`–`029`.
14. **Recommended Remediation**: Validate `truck_id` against `loadDiscoveryCatalog` / `vendors`, enforce a per-user `favorites` cap (`200`) + rate limit in `api/favorites/toggle.js`, and add an additive migration enabling `FORCE ROW LEVEL SECURITY` on `favorites` and `notification_settings` first (where `app.user_id` GUC is already set in `withTransaction` / `packages/runtime-adapter`), followed by scoped policies for `bookings` and `pickup_pagers` after auditing all query paths.
15. **Specific Implementation Steps**:
   - In `api/favorites/toggle.js`, wrap writes in `withTransaction`, verify `truckId` exists in `TRUCKS` or active `vendors`, enforce `COUNT(*) < 200` on new inserts, and apply a per-user write rate limit.
   - Audit all callers of `favorites` (`api/favorites/list.js`, `api/favorites/toggle.js`, `lib/customer-profile.js`, `lib/admin-test-customer.js`) to confirm `app.user_id` (or explicit sandbox reset GUC) is set in every transaction, then enable + `FORCE ROW LEVEL SECURITY` on `favorites` and `notification_settings` in an additive migration.
   - Document the exact non-RLS governance tables (`platform_roles`, `vendor_memberships`, `audit_logs`) and rationale in `docs/engineering/DATA-MODEL.md`.
16. **Dependencies / Prerequisites**: Run full PostgreSQL integration suite (`backend-hardening`, `p1-unified-discovery`, `customer-profile-sharing`, `admin-test-customer`) before landing RLS on legacy tables—remember `lib/admin-test-customer.js` deletes sandbox `favorites` while `app.user_id` may be the admin unless `app.user_id` is switched or a policy permits sandbox reset!
17. **Regression Risks**: High if RLS is added to `favorites` without updating `lib/admin-test-customer.js` (`seed`/`reset` queries `favorites` for `usr_sa_top_admin_test_customer`)—verify every SQL caller via `npm run registry:locate -- favorites` first!
18. **Verification Steps**: Run `node tools/code-registry/cli.mjs validate --verify-db`, `tests/backend-hardening.integration.cjs`, `tests/customer-profile-sharing.integration.cjs`, and `tests/admin-test-customer.integration.cjs`.
19. **Estimated Effort**: `M`
20. **Repair Priority**: `P1` (Linked Repair Tasks: [REP-013](09_PRIORITIZED_REPAIR_PLAN.md#rep-013))

---

<a id="aud-0013"></a>
### AUD-0013 — Concurrent lost-update race in Style Guide push/save overwrites workspace-state.json, and corrupt state JSON silently resets to empty

1. **Finding ID**: `AUD-0013`
2. **Concise Title**: Concurrent lost-update race in Style Guide push/save overwrites workspace-state.json, and corrupt state JSON silently resets to empty
3. **Severity**: **HIGH**
4. **Category**: Reliability / Data Integrity
5. **Confidence Level**: **Confirmed**
6. **Affected Subsystem**: S6: Feature controls & Style Guide admin workspace
7. **File Path & Relevant Line Numbers**: `lib/style-guide-admin.js:329-349`, `lib/style-guide-admin.js:1098-1114`, `lib/style-guide-admin.js:1350-1370`, `lib/style-guide-admin.js:1654-1668`
8. **What Is Wrong**: `pushStyleGuideWorkspaceToGithub` (`POST /api/admin/style-guide/push`) reads `snap = buildEffectiveDecisionsSnapshot()` (`line 1363`) *before* performing 7–10 sequential outbound HTTPS requests to GitHub (`git/ref`, `commits`, `blobs`, `trees`, `commits`, `PATCH ref`), and afterward writes `{ ...snap.wsState, revision: Number(snap.wsState.revision || 0) + 1, last_github_push: pushRecord }` directly over `workspace-state.json` (`lines 1654-1666`) with no process mutex or PostgreSQL advisory lock. Any `POST /api/admin/style-guide/save` completed during that multi-second GitHub push is silently wiped from disk. Additionally, `readWorkspaceState` (`lines 329-349`) catches JSON parse errors and silently returns `emptyState`, causing the next save/push to permanently overwrite all stored overrides.
9. **Evidence**: `lib/style-guide-admin.js:1363` snapshots `snap.wsState` prior to `githubApiJson` network I/O (`lines 1455-1635`), then calls `writeWorkspaceState(storageDir, nextWsState)` (`line 1666`) using stale `snap.wsState.overrides_by_id`. `lib/style-guide-admin.js:346-348`: `catch { return emptyState(); }` with zero logging or error propagation.
10. **Expected / Intended Behavior**: All `save`, `reset`, and `push` mutations on `workspace-state.json` must serialize critical sections (via an in-process async mutex + PostgreSQL `pg_advisory_xact_lock`), `push` must re-read fresh `workspace-state.json` before recording `last_github_push` so concurrent `overrides_by_id` edits are preserved, and `readWorkspaceState` must quarantine/fail loudly (`500 STYLE_GUIDE_STATE_CORRUPT`) rather than returning `emptyState` when an existing `workspace-state.json` fails JSON parsing.
11. **Actual Behavior / Code Condition**: Concurrent admin saves during a GitHub push are silently lost, and any partial/corrupted `workspace-state.json` resets all 103 workspace overrides to empty without warning.
12. **User or Operational Impact**: Silent permanent loss of administrator Style Guide work on staging/hosted servers.
13. **Root Cause**: File-backed `workspace-state.json` mutations lacked concurrency locking across async network boundaries and treated `ENOENT` identically to `SyntaxError` in `readWorkspaceState`.
14. **Recommended Remediation**: Add an in-process promise mutex around `workspace-state.json` read-modify-write sections, re-load current `workspace-state.json` after GitHub push completes so only `last_github_push` (and monotonic `revision`) is updated without clobbering newer `overrides_by_id`, and distinguish `err.code === "ENOENT"` from corrupt-file errors in `readWorkspaceState`.
15. **Specific Implementation Steps**:
   - In `lib/style-guide-admin.js:329-349`, return `emptyState()` ONLY when `err.code === "ENOENT"`; on JSON parse or I/O failure, throw a `StyleGuideAdminError` (`500`, `STYLE_GUIDE_STATE_CORRUPT`) and preserve the file untouched for operator recovery.
   - Introduce a module-level `withWorkspaceLock(storageDir, fn)` async queue serializing `saveStyleGuideAdminUpdates`, `resetStyleGuideAdminDecisions`, and the state-commit step of `pushStyleGuideWorkspaceToGithub`.
   - At the end of `pushStyleGuideWorkspaceToGithub` (`lines 1650-1668`), acquire `withWorkspaceLock`, re-read the latest `wsState` from disk, and merge `last_github_push: pushRecord` (keeping `pushed_at_revision: snap.wsState.revision` so newly saved edits during the push remain flagged as unpushed!).
16. **Dependencies / Prerequisites**: None.
17. **Regression Risks**: Recording `pushed_at_revision: snap.wsState.revision` when concurrent saves bumped `wsState.revision` ensures `unpushed_changes_since_last_push` accurately stays `true`!
18. **Verification Steps**: Add an integration test in `tests/style-guide-admin.integration.cjs` using a delayed mock GitHub server where Admin B calls `/api/admin/style-guide/save` while Admin A's `/api/admin/style-guide/push` is in flight, asserting Admin B's override survives and `unpushed_changes_since_last_push === true`.
19. **Estimated Effort**: `M`
20. **Repair Priority**: `P1` (Linked Repair Tasks: [REP-001](09_PRIORITIZED_REPAIR_PLAN.md#rep-001))

---

<a id="aud-0014"></a>
### AUD-0014 — Emergency BITESHARK_PAUSE_WRITES=all omits newer customer/governance write surfaces, and X-BiteShark-Viewpoint: preview is unenforced on 33 of 34 admin-routes mutations

1. **Finding ID**: `AUD-0014`
2. **Concise Title**: Emergency BITESHARK_PAUSE_WRITES=all omits newer customer/governance write surfaces, and X-BiteShark-Viewpoint: preview is unenforced on 33 of 34 admin-routes mutations
3. **Severity**: **HIGH**
4. **Category**: Reliability / Data Integrity
5. **Confidence Level**: **Confirmed**
6. **Affected Subsystem**: S3: Admin governance backend
7. **File Path & Relevant Line Numbers**: `lib/feature-controls.js:1161-1167`, `server/admin-routes.js:615-617`, `server/admin-routes.js:2913-2920`, `server/admin-routes.js:7318-7325`, `server/customer-exploration-routes.js:140-170`, `lib/style-guide-admin.js:899-915`
8. **What Is Wrong**: (1) `PAUSE_SCOPE_BY_FEATURE_KEY` in `lib/feature-controls.js:1161-1167` maps only 9 features, omitting `visit_journal`, `private_photos`, `suggested_trails`, and `admin_style_guide_workspace`, while `POST /api/community/report`, `/api/vendor/*`, `/api/invitations/accept`, `/api/onboarding/*`, and `/api/issues*` never call `enforceWritePause`. Consequently, `BITESHARK_PAUSE_WRITES=all` fails to freeze disk/DB writes during maintenance or disk-full incidents (including 5 MiB photo uploads!). (2) `server/admin-routes.js:615` defines `isPreviewViewpoint = String(req.headers['x-biteshark-viewpoint'] || '').trim().toLowerCase() === 'preview'`, yet checks it ONLY on `POST /api/community/report` (`line 2913`), leaving 33 other mutating routes in `server/admin-routes.js` (plus delegated exploration/profile routes) writable from read-only admin preview mode!
9. **Evidence**: `lib/feature-controls.js:1161-1167` lists only `booking_requests`, `vendor_dashboard_writes`, `pickup_pager_creation`, `pager_push_notifications`, `community_submissions`, `customer_profile`, `greatest_hits_collections`, `unlisted_collection_sharing`, and `shared_collection_photos`. In `server/admin-routes.js`, `isPreviewViewpoint` appears at `lines 615` and `2913` (`2` occurrences in `8,331` lines; `/api/admin/viewpoint` at `line 7318` is the viewpoint audit logger itself).
10. **Expected / Intended Behavior**: `BITESHARK_PAUSE_WRITES=all` must halt all non-auth/non-emergency customer and vendor disk/database mutations (especially 5 MiB photo uploads, visits, trails, issues, onboarding uploads, and style-guide writes, while keeping `POST /api/admin/features` and `POST /api/me/shares/revoke` available as documented emergency/privacy controls), and `X-BiteShark-Viewpoint: preview` must centrally reject all `POST`/`PUT`/`PATCH`/`DELETE` mutations except `/api/admin/viewpoint` and `/api/diagnostics/report`.
11. **Actual Behavior / Code Condition**: During `BITESHARK_PAUSE_WRITES=all`, customers can still upload 5 MiB photos, log visits, save trails, submit issues, and upload 1 MiB onboarding evidence; and read-only Admin Preview requests carrying `X-BiteShark-Viewpoint: preview` can mutate customer exploration, profile, vendor, and issue records if invoked.
12. **User or Operational Impact**: Incomplete emergency write freeze during database/disk incidents and missing server-side defense-in-depth for read-only Admin Preview.
13. **Root Cause**: Newer subsystems (`027`–`029` exploration, support issues, style-guide) were added without registering in `PAUSE_SCOPE_BY_FEATURE_KEY` or centralizing `isPreviewViewpoint` at the top of `handleGovernanceApiRequest`.
14. **Recommended Remediation**: Enforce `isPreviewViewpoint` once at the top of `handleGovernanceApiRequest` (`server/admin-routes.js`) for all `method !== "GET" && method !== "HEAD"` routes except `/api/admin/viewpoint` and `/api/diagnostics/report`, and map `visit_journal`, `private_photos`, `suggested_trails`, and `admin_style_guide_workspace` in `PAUSE_SCOPE_BY_FEATURE_KEY` + `enforceWritePause` on `/api/community/report`, `/api/vendor/*`, `/api/onboarding/*`, and `/api/issues*`.
15. **Specific Implementation Steps**:
   - In `lib/authz.js:120-127`, add `"exploration"`, `"issues"`, `"onboarding"`, and `"style_guide"` to `VALID_PAUSE_SCOPES`.
   - In `lib/feature-controls.js:1161-1167`, map `visit_journal`, `private_photos`, and `suggested_trails` to `"exploration"` and `admin_style_guide_workspace` to `"style_guide"`, and call `enforceWritePause` on mutating `/api/community/report` (`"community"`), `/api/vendor/*` (`"owner"`), `/api/onboarding/*` (`"onboarding"`), and `/api/issues*` (`"issues"`), explicitly exempting `/api/admin/features`, `/api/me/shares/revoke`, and `/api/auth/logout`.
   - At the top of `handleGovernanceApiRequest` (`server/admin-routes.js:625`), if `isPreviewViewpoint && method !== "GET" && method !== "HEAD" && normPath !== "/api/admin/viewpoint" && normPath !== "/api/diagnostics/report"`, immediately return `403 PREVIEW_READ_ONLY`.
16. **Dependencies / Prerequisites**: Includes `REP-004` (`VALID_PAUSE_SCOPES`).
17. **Regression Risks**: Preserve `POST /api/me/shares/revoke`, `POST /api/auth/logout`, and `POST /api/admin/features` even when `BITESHARK_PAUSE_WRITES=all` is active so users can revoke live links and admins can toggle feature controls.
18. **Verification Steps**: Add integration tests in `tests/feature-controls.integration.cjs` and `tests/admin-governance.integration.cjs` verifying `BITESHARK_PAUSE_WRITES=all` blocks `/api/me/photos` (`503`) while allowing `/api/me/shares/revoke` (`200`), and `X-BiteShark-Viewpoint: preview` blocks `POST /api/me/visits` and `POST /api/issues` (`403`).
19. **Estimated Effort**: `M`
20. **Repair Priority**: `P1` (Linked Repair Tasks: [REP-009](09_PRIORITIZED_REPAIR_PLAN.md#rep-009))

---

<a id="aud-0015"></a>
### AUD-0015 — Hidden customer_profile fallback UI falsely reports "0 active unlisted share links" and omits revocation controls while /s/<token> links remain live

1. **Finding ID**: `AUD-0015`
2. **Concise Title**: Hidden customer_profile fallback UI falsely reports "0 active unlisted share links" and omits revocation controls while /s/<token> links remain live
3. **Severity**: **HIGH**
4. **Category**: Broken Feature
5. **Confidence Level**: **Confirmed**
6. **Affected Subsystem**: S4: Customer profile, Greatest Hits sharing, exploration & photos
7. **File Path & Relevant Line Numbers**: `public/customer-profile.js:131-165`, `public/customer-profile.js:598-654`, `public/customer-profile.js:686-690`, `public/profile-client.js:247-254`, `public/role-experience.js:1385-1400`
8. **What Is Wrong**: When an admin hides `customer_profile` while `unlisted_collection_sharing` remains enabled, existing `/s/<token>` share links stay live on the internet (`lib/feature-controls.js:422` has no dependency on `customer_profile`). Although `renderFeatureDisabledWithPrivacyFallback` (`public/customer-profile.js:686-690`) promises `"share-link revocation, and Help & feedback remain available below"`, it calls `renderStandalonePrivacyToolsCard(null)`. Because `d` is `null`, `shares` defaults to `[]` (`line 599`) without calling `window.bitesharkProfile.listShares()`, displaying the false statement `"You have 0 active unlisted share links. All your profile and collection records are private."` with zero revoke buttons—and `#rxMyProfileBtn` in the Account menu (`public/role-experience.js:1388`) is hidden.
9. **Evidence**: `public/customer-profile.js:689`: `renderStandalonePrivacyToolsCard(null)`. `public/customer-profile.js:599-603`: `var shares = (d && d.active_shares_summary && d.active_shares_summary.items) || []; if (shares.length === 0) { shareRowsHtml = '<p class="cp-help">You have 0 active unlisted share links. All your profile and collection records are private.</p>'; }`. `public/profile-client.js:247-254` defines `listShares` (`GET /api/me/shares`), which has `0` callers across `public/*.js`.
10. **Expected / Intended Behavior**: When `customer_profile` is hidden, `loadAndRenderProfile` must call `window.bitesharkProfile.listShares()` (`GET /api/me/shares`, intentionally kept open by `lib/feature-controls.js:349, 428`) and pass those active shares into `renderStandalonePrivacyToolsCard`, while keeping a `"Privacy, exports & shared links"` link reachable in the signed-in account menu.
11. **Actual Behavior / Code Condition**: Account owners cannot see or revoke their active `/s/<token>` unlisted links in the UI when `customer_profile` is hidden and are actively misled that they have `0` active links.
12. **User or Operational Impact**: Serious user-privacy and revocation control failure contradicting BiteShark's privacy guarantees.
13. **Root Cause**: `renderFeatureDisabledWithPrivacyFallback` passed `null` instead of fetching `window.bitesharkProfile.listShares()`, and `tests/customer-profile-sharing.integration.cjs` tested hidden-mode revocation via direct HTTP calls rather than the browser UI.
14. **Recommended Remediation**: Fetch `window.bitesharkProfile.listShares()` in the `FEATURE_DISABLED` fallback branch of `loadAndRenderProfile` (`public/customer-profile.js`), render explicit error messaging if `listShares()` fails (never claiming `0` links on error), and keep `"Privacy & shared links"` accessible in `public/role-experience.js` when signed in.
15. **Specific Implementation Steps**:
   - In `public/customer-profile.js:131-165`, when `err.code === "FEATURE_DISABLED"`, call `var sharesOut = await window.bitesharkProfile.listShares()` and pass `{ active_shares_summary: { items: sharesOut.shares || [] } }` to `renderFeatureDisabledWithPrivacyFallback(msg, fallbackData)` (or render an explicit warning if `listShares` fails).
   - In `public/role-experience.js:1385-1400, 1527-1535`, when `isFeatureHidden("customer_profile")`, relabel `#rxMyProfileBtn` (or render a dedicated `#rxPrivacyLinksBtn` navigating to `/#profile-privacy`) so signed-in users can always reach privacy export, deletion, and share revocation.
16. **Dependencies / Prerequisites**: None.
17. **Regression Risks**: Ensure re-binding `[data-cp-revoke-share]` in fallback mode refreshes `listShares()` cleanly after revocation.
18. **Verification Steps**: Add a browser test in `tests/customer-profile-browser.e2e.cjs` that mints a share link, sets `customer_profile = hidden`, opens the account menu -> `/#profile-privacy`, verifies the `bs_…` share row and `Revoke link` button appear, clicks `Revoke link`, and confirms `/s/<token>` returns `404`.
19. **Estimated Effort**: `S`
20. **Repair Priority**: `P1` (Linked Repair Tasks: [REP-014](09_PRIORITIZED_REPAIR_PLAN.md#rep-014))

---

<a id="aud-0016"></a>
### AUD-0016 — 90-day vendor_application_evidence BYTEA retention and disabled-mode pager outbox/rate-limit scrubbing are completely unenforced

1. **Finding ID**: `AUD-0016`
2. **Concise Title**: 90-day vendor_application_evidence BYTEA retention and disabled-mode pager outbox/rate-limit scrubbing are completely unenforced
3. **Severity**: **HIGH**
4. **Category**: Reliability / Data Integrity
5. **Confidence Level**: **Confirmed**
6. **Affected Subsystem**: S3: Admin governance backend
7. **File Path & Relevant Line Numbers**: `server/admin-routes.js:1873-1902`, `server/admin-routes.js:7981-8000`, `lib/pager-notifications.js:1705-1754`, `lib/pager-notifications.js:1860-1871`, `public/policies/privacy.html:1-120`, `deploy/systemd/truckly-staging-worker.service:1-46`
8. **What Is Wrong**: (1) `POST /api/onboarding/evidence` stores sensitive permit/license PDFs and images (`raw_bytes BYTEA`) with `retention_expires_at = now() + interval '90 days'` (`server/admin-routes.js:1873-1902`) and `/policies/privacy.html` promises 90-day retention, yet **zero** code in the entire repository deletes expired `vendor_application_evidence` rows or blocks downloading expired files in `GET /api/onboarding/evidence` (`lines 7981-8000`). (2) In `lib/pager-notifications.js:1705-1754`, when `BITESHARK_PUSH_PROVIDER_MODE=disabled` (the default on hosted staging!) or `pager_push_notifications` is paused/hidden, `processPushOutboxBatch` returns early *before* `purgeExpiredNotificationRecords` (`line 1864`), leaving expired subscription `p256dh`/`auth` keys and `pager_rate_limits` rows unpurged forever—and `biteshark-staging2` has no worker/maintenance systemd unit at all.
9. **Evidence**: Repository-wide search for `vendor_application_evidence` finds `INSERT` (`server/admin-routes.js:1873`), metadata `SELECT` (`lines 1572, 3357`), and download `SELECT ... raw_bytes` (`line 7981`, with no `AND retention_expires_at > now()` filter) — zero `DELETE` or `UPDATE raw_bytes = NULL` statements anywhere! In `lib/pager-notifications.js:1726-1754`, early `return` on `provider.mode === "disabled"` skips `await purgeExpiredNotificationRecords(dbAdapter, { now })` at `line 1864`. `deploy/systemd/` contains `truckly-staging-worker.service` (`primary`) and zero worker unit for `biteshark-staging2`.
10. **Expected / Intended Behavior**: `GET /api/onboarding/evidence` must reject downloads once `retention_expires_at <= now()`, background maintenance must purge expired `vendor_application_evidence` bytes and run `purgeExpiredNotificationRecords` regardless of `BITESHARK_PUSH_PROVIDER_MODE`, and `staging2` should include a maintenance/worker unit.
11. **Actual Behavior / Code Condition**: Uploaded business permits/IDs (`BYTEA`) accumulate indefinitely in PostgreSQL backups and remain downloadable forever past 90 days; push keys and rate-limit buckets are never scrubbed when Web Push is disabled.
12. **User or Operational Impact**: Direct contradiction of published Privacy Policy retention commitments, unnecessary sensitive document retention in PostgreSQL, and unbounded table growth.
13. **Root Cause**: `retention_expires_at` was populated on `INSERT` without implementing read-time expiry checks or adding `vendor_application_evidence` purge SQL to the maintenance worker; `purgeExpiredNotificationRecords` was placed after early provider-mode exits.
14. **Recommended Remediation**: Enforce `retention_expires_at > now()` in `GET /api/onboarding/evidence`, execute `purgeExpiredNotificationRecords` *before* the `provider.mode === "disabled"` early return in `processPushOutboxBatch`, add expired `vendor_application_evidence` purging to the periodic maintenance cycle, and add `deploy/systemd/biteshark-staging2-worker.service`.
15. **Specific Implementation Steps**:
   - In `server/admin-routes.js:7981-8000`, add `AND e.retention_expires_at > now()` (or return `410 EVIDENCE_RETENTION_EXPIRED` when `retention_expires_at <= now()`).
   - In `lib/pager-notifications.js:1715-1755`, invoke `await purgeExpiredNotificationRecords(dbAdapter, { now })` prior to returning early when `provider.mode === "disabled"` or feature state is paused/hidden.
   - Add a bounded cleanup step (`DELETE FROM vendor_application_evidence WHERE retention_expires_at <= now()` on terminal `approved`/`rejected` applications, or scrubbing expired rows) inside `api/pager/worker.js` / `scripts/run-pager-worker.cjs`, and commit `deploy/systemd/biteshark-staging2-worker.service`.
16. **Dependencies / Prerequisites**: Ensure `app_role` has `DELETE` (or scoped `UPDATE`) privileges on `vendor_application_evidence` or add via additive migration `030` (`migrations/018` grants `SELECT, INSERT, DELETE`—verify in `migrations/018_admin_portal_onboarding_moderation_issues.sql`!).
17. **Regression Risks**: Verify whether open/pending applications older than 90 days should retain metadata while purging `raw_bytes` or return `410` asking the applicant to re-upload fresh evidence.
18. **Verification Steps**: Add integration tests in `tests/legal-readiness.integration.cjs` and `tests/pager-notifications.integration.cjs` backdating `retention_expires_at` (`410` on download + purged by worker) and verifying `purgeExpiredNotificationRecords` runs under `BITESHARK_PUSH_PROVIDER_MODE=disabled`.
19. **Estimated Effort**: `M`
20. **Repair Priority**: `P1` (Linked Repair Tasks: [REP-015](09_PRIORITIZED_REPAIR_PLAN.md#rep-015))

---

<a id="aud-0017"></a>
### AUD-0017 — Swallowed SessionEligibilityError turns normal revocations into 500/503 alerts, and unvalidated related_review_id in POST /api/issues causes 500 FK crash & private-post oracle

1. **Finding ID**: `AUD-0017`
2. **Concise Title**: Swallowed SessionEligibilityError turns normal revocations into 500/503 alerts, and unvalidated related_review_id in POST /api/issues causes 500 FK crash & private-post oracle
3. **Severity**: **HIGH**
4. **Category**: Runtime Error
5. **Confidence Level**: **Confirmed**
6. **Affected Subsystem**: S3: Admin governance backend
7. **File Path & Relevant Line Numbers**: `server/customer-profile-routes.js:169-188`, `server/customer-profile-routes.js:665-686`, `server/admin-routes.js:854-861`, `server/admin-routes.js:2355-2365`, `server/admin-routes.js:2515-2530`, `lib/customer-profile.js:4465-4475`
8. **What Is Wrong**: (1) `handleCustomerProfileRoute` (`server/customer-profile-routes.js:665-686`) catches `SessionEligibilityError` (`401` revoked / `403` age gate) and `PhotoStorageError` (`404` missing file in `readAdminReportedSharedPhoto`), returning `500 PROFILE_INTERNAL_ERROR` (`retryable: true`) and logging false `error` incidents. (2) `GET /api/account/context` (`server/admin-routes.js:854-861`) similarly catches `SessionEligibilityError` and returns `503` + logs `ACCOUNT_CONTEXT_DB_FAILURE`. (3) `POST /api/issues` (`server/admin-routes.js:2360, 2520`) checks only `UUID_RE.test(relatedReviewId)` without verifying existence or visibility in `community_reviews`: nonexistent UUIDs crash with unhandled PostgreSQL `23503` FK violation (`500`), while another user's private `pending`/`rejected` post UUID succeeds with `201 Created`!
9. **Evidence**: Compare `server/customer-exploration-routes.js:199-200` (`// Re-throw SessionEligibilityError ... throw err;`) against `server/customer-profile-routes.js:666` (`const status = err instanceof CustomerProfileDomainError ? err.status : 500;`) and `server/admin-routes.js:854-861` (`catch (err) { recordServerDiagnostic(... "ACCOUNT_CONTEXT_DB_FAILURE" ...); return sendJson(503, ...); }`). In `server/admin-routes.js:2360, 2520`, `related_review_id` is inserted directly into `support_issues` (`REFERENCES community_reviews(id)` in `migrations/018:335`).
10. **Expected / Intended Behavior**: `SessionEligibilityError` must propagate to `server/app.js:1411-1420` (returning `401 SESSION_REVOKED` or `403 AGE_ASSESSMENT_REQUIRED` with zero `5xx` diagnostics), `PhotoStorageError` must map to its HTTP status (`404`/`503`/`507`), and `POST /api/issues` must verify `related_review_id` exists in `community_reviews` AND is either `status = "approved"` or authored by `req.user.id` (else `400 INVALID_RELATED_REVIEW`).
11. **Actual Behavior / Code Condition**: Mid-request sign-outs/revocations produce `500`/`503` errors and false incident alerts, and `POST /api/issues` acts as an existence oracle for unpublished community posts while crashing with `500` on invalid UUIDs.
12. **User or Operational Impact**: False-positive production outage alerts, retry storms (`retryable: true` on `401`), `500` crashes, and cross-user private review UUID probing.
13. **Root Cause**: Over-broad `catch (err)` blocks in `customer-profile-routes.js` and `/api/account/context` swallowed typed domain errors, and `POST /api/issues` skipped pre-insert FK/visibility validation on `related_review_id`.
14. **Recommended Remediation**: Re-throw `SessionEligibilityError` in `server/customer-profile-routes.js` and `GET /api/account/context`, map `PhotoStorageError` in `sendProfileError`, and validate `related_review_id` visibility (`status = 'approved' OR author_id = $2`) inside `POST /api/issues` (returning uniform `400` on missing or unauthorized UUIDs).
15. **Specific Implementation Steps**:
   - In `server/customer-profile-routes.js:665` and `server/admin-routes.js:854`, add `if (err instanceof SessionEligibilityError || err?.isSessionEligibilityError) throw err;`, and map `err instanceof PhotoStorageError` in `sendProfileError` (`lines 169-188`).
   - In `server/admin-routes.js:2440-2525` (`POST /api/issues`), if `relatedReviewId` is provided, query `SELECT 1 FROM community_reviews WHERE id = $1 AND (status = 'approved' OR author_id = $2)` inside the transaction and return `400 { error: "Referenced community post was not found." }` when empty.
16. **Dependencies / Prerequisites**: None.
17. **Regression Risks**: Administrators filing internal issues referencing a `pending`/`rejected` post can also be permitted via `OR ctx.canAccessAdminPortal`.
18. **Verification Steps**: Add tests in `tests/customer-profile-sharing.integration.cjs` and `tests/support-feedback.integration.cjs` verifying mid-tx session revocation returns `401` (not `500`/`503`) and `POST /api/issues` with a random UUID or another user's `pending` review returns `400` (not `500` or `201`).
19. **Estimated Effort**: `S`
20. **Repair Priority**: `P1` (Linked Repair Tasks: [REP-016](09_PRIORITIZED_REPAIR_PLAN.md#rep-016))

---

<a id="aud-0018"></a>
### AUD-0018 — Mismatched pager worker summary keys (failed/sent vs failed_permanent/delivered) silently disable batch failure diagnostics and degraded heartbeats

1. **Finding ID**: `AUD-0018`
2. **Concise Title**: Mismatched pager worker summary keys (failed/sent vs failed_permanent/delivered) silently disable batch failure diagnostics and degraded heartbeats
3. **Severity**: **HIGH**
4. **Category**: Broken Feature
5. **Confidence Level**: **Confirmed**
6. **Affected Subsystem**: S5: Pager notifications, Web Push worker & diagnostics
7. **File Path & Relevant Line Numbers**: `lib/pager-notifications.js:1780-1792`, `api/pager/worker.js:125-152`, `scripts/run-pager-worker.cjs:144-150`, `scripts/run-pager-worker.cjs:240-262`
8. **What Is Wrong**: `processPushOutboxBatch` (`lib/pager-notifications.js:1785-1788`) returns `{ processed, delivered, retried, failed_permanent, suppressed, ... }`. However, BOTH `api/pager/worker.js` (`lines 127, 148`) and `scripts/run-pager-worker.cjs` (`lines 146-147, 243`) read `Number(out.failed || 0)` and `Number(out.sent || 0)`—keys that do not exist (`undefined -> 0`)! Consequently, `failedCount > 0 && sentCount === 0` is **permanently false**, `PUSH_DELIVERY_BATCH_FAILURE` diagnostics are never recorded, and worker heartbeats always report `worker_status: "ok"` (`last_error_code: null`) even during 100% permanent push delivery failure.
9. **Evidence**: `lib/pager-notifications.js:1785-1788`: returns `delivered`, `retried`, `failed_permanent`, `suppressed` (no `sent`, no `failed`). `api/pager/worker.js:127, 148`: `const failedCount = Number(out?.failed || 0); const sentCount = Number(out?.sent || 0);` and `workerStatus: failedCount > 0 && sentCount === 0 ? 'degraded' : 'ok'`. `scripts/run-pager-worker.cjs:146-147, 243` repeats the exact same `out.failed` / `out.sent` bug.
10. **Expected / Intended Behavior**: `api/pager/worker.js` and `scripts/run-pager-worker.cjs` must read `out.failed_permanent` (plus `out.retried` when evaluating complete batch failure) and `out.delivered` so total push delivery outages emit `PUSH_DELIVERY_BATCH_FAILURE` and mark the worker heartbeat `degraded`.
11. **Actual Behavior / Code Condition**: Dead code branch on every worker tick: permanent VAPID/FCM/APNs push delivery failures look 100% healthy (`worker_status: "ok"`) in `/admin` Diagnostics & Readiness.
12. **User or Operational Impact**: Complete blind spot in operational alerting and readiness monitoring when Web Push delivery breaks in staging or production.
13. **Root Cause**: Field rename drift between `lib/pager-notifications.js` (`delivered` / `failed_permanent`) and its two callers (`api/pager/worker.js`, `scripts/run-pager-worker.cjs`) without a unit assertion on degraded worker heartbeats.
14. **Recommended Remediation**: Update `api/pager/worker.js` and `scripts/run-pager-worker.cjs` to read `Number(out?.failed_permanent || 0)` (and consider `Number(out?.retried || 0)` when `delivered === 0`) and `Number(out?.delivered || 0)`.
15. **Specific Implementation Steps**:
   - In `api/pager/worker.js:126-152`, compute `const failedCount = Number(out?.failed_permanent ?? out?.failed ?? 0); const retriedCount = Number(out?.retried || 0); const sentCount = Number(out?.delivered ?? out?.sent ?? 0);` and trigger `degraded` / `PUSH_DELIVERY_BATCH_FAILURE` when `(failedCount > 0 || retriedCount > 0) && sentCount === 0` (with `failed_permanent > 0` at `error`/`warn` severity).
   - Update `scripts/run-pager-worker.cjs:145-150, 242-260` identically so `--direct-db` mode matches HTTP loopback mode.
16. **Dependencies / Prerequisites**: None.
17. **Regression Risks**: Ensure transient single-item retries (`retried > 0`) when other items succeed (`sentCount > 0`) remain `ok` so a single flaky browser endpoint does not mark the whole worker degraded.
18. **Verification Steps**: Add an integration test in `tests/pager-notifications.integration.cjs` simulating a `400`/`403` permanent push provider rejection and asserting `PUSH_DELIVERY_BATCH_FAILURE` is recorded and `worker_heartbeats.worker_status === "degraded"`.
19. **Estimated Effort**: `S`
20. **Repair Priority**: `P1` (Linked Repair Tasks: [REP-017](09_PRIORITIZED_REPAIR_PLAN.md#rep-017))

---

<a id="aud-0019"></a>
### AUD-0019 — Swallowed ROLLBACK errors in runtime-adapter and lib/db-tx.js call client.release() without error flag, returning poisoned connections to pg.Pool

1. **Finding ID**: `AUD-0019`
2. **Concise Title**: Swallowed ROLLBACK errors in runtime-adapter and lib/db-tx.js call client.release() without error flag, returning poisoned connections to pg.Pool
3. **Severity**: **HIGH**
4. **Category**: Reliability / Data Integrity
5. **Confidence Level**: **Confirmed**
6. **Affected Subsystem**: S2: HTTP server core, routing, api/* handlers & DB adapter
7. **File Path & Relevant Line Numbers**: `packages/runtime-adapter/index.js:94-112`, `lib/db-tx.js:214-224`
8. **What Is Wrong**: In `node-postgres` (`pg`), when a query or `ROLLBACK` fails on a checked-out `PoolClient` (for example due to `statement_timeout`, socket reset, or broken protocol state), calling `client.release()` with no argument returns the broken/in-aborted-transaction client back to the idle `pg.Pool` instead of destroying it (`client.release(rollbackErr || true)`). Both `packages/runtime-adapter/index.js` and `lib/db-tx.js` swallow `ROLLBACK` failures (`catch {}`) and call bare `client.release()`.
9. **Evidence**: `packages/runtime-adapter/index.js:94-110`: `catch (err) { try { await client.query('ROLLBACK'); } catch {} throw err; } finally { client.release(); }`. `lib/db-tx.js:215-223`: `catch (err) { try { await client.query('ROLLBACK'); } catch { // Ignore rollback error if connection dropped } throw err; } finally { client.release(); }`.
10. **Expected / Intended Behavior**: Track `let destroyClient = false;` inside `try/catch`; if `ROLLBACK` throws (or `COMMIT` throws a transport/protocol error), set `destroyClient = rollbackErr || true` and invoke `client.release(destroyClient)` in `finally` so `pg.Pool` evicts and replaces the broken connection.
11. **Actual Behavior / Code Condition**: If `ROLLBACK` fails on one of the 8 pool connections (`DB_POOL_MAX = 8`), the poisoned connection is returned to the pool and can fail subsequent unrelated requests (`25P02 current transaction is aborted` or stale session state).
12. **User or Operational Impact**: Cascading database request failures and potential connection-state contamination on an 8-connection VPS pool.
13. **Root Cause**: Standard `pg.Pool` pitfall: `client.release()` only destroys a broken client when passed a truthy error argument.
14. **Recommended Remediation**: Pass the rollback error (`client.release(releaseErr)`) to `client.release(...)` in both `packages/runtime-adapter/index.js` and `lib/db-tx.js`.
15. **Specific Implementation Steps**:
   - In `lib/db-tx.js:180-225`, declare `let releaseErr = false;`, set `releaseErr = rbErr || true` inside `catch (rbErr)` around `ROLLBACK`, and call `client.release(releaseErr)` in `finally`.
   - Apply the identical `let releaseErr = false;` -> `client.release(releaseErr)` guard in `packages/runtime-adapter/index.js:85-112`.
16. **Dependencies / Prerequisites**: None.
17. **Regression Risks**: None; healthy transactions and normal SQL errors where `ROLLBACK` succeeds still call `client.release(false)` and reuse the pooled socket.
18. **Verification Steps**: Add a unit test in `tests/backend-hardening.integration.cjs` with a mock `dbAdapter.connect()` whose `ROLLBACK` rejects and assert `client.release` was called with a truthy error argument.
19. **Estimated Effort**: `S`
20. **Repair Priority**: `P1` (Linked Repair Tasks: [REP-018](09_PRIORITIZED_REPAIR_PLAN.md#rep-018))

---

<a id="aud-0020"></a>
### AUD-0020 — biteshark-staging2-api.service omits style-guide ReadWritePaths under ProtectSystem=strict, backup-staging2.sh is missing from Git, and push CI diff skips failing runtime suites

1. **Finding ID**: `AUD-0020`
2. **Concise Title**: biteshark-staging2-api.service omits style-guide ReadWritePaths under ProtectSystem=strict, backup-staging2.sh is missing from Git, and push CI diff skips failing runtime suites
3. **Severity**: **HIGH**
4. **Category**: Configuration
5. **Confidence Level**: **Confirmed**
6. **Affected Subsystem**: S10: Deploy, systemd, Nginx, CI/CD, dependencies & code-registry
7. **File Path & Relevant Line Numbers**: `deploy/systemd/biteshark-staging2-api.service:31-40`, `deploy/systemd/truckly-staging-api.service:31-40`, `deploy/systemd/biteshark-staging2-backup.service:8-11`, `deploy/bin/biteshark-staging2-ctl:54-58`, `.github/workflows/truckly-source-review.yml:189-209`
8. **What Is Wrong**: (1) `deploy/systemd/biteshark-staging2-api.service` sets `ProtectSystem=strict` (`line 31`) and `ReadWritePaths=-/var/lib/biteshark-staging2/customer-photos` (`line 39`), omitting `-/var/lib/biteshark-staging2/style-guide` (which IS present in `deploy/systemd/truckly-staging-api.service:39`!). Installing the committed systemd unit on `staging2` causes `EROFS: read-only file system` on Style Guide saves/pushes. (2) Both `deploy/systemd/biteshark-staging2-backup.service:10` and `deploy/bin/biteshark-staging2-ctl:56` execute `/usr/local/lib/biteshark-staging2/backup-staging2.sh`, which does not exist anywhere in the repository! (3) `.github/workflows/truckly-source-review.yml:195-206` computes `BASE_REF="$PUSH_BEFORE"` on `push` events and omits `.github/workflows` and `package.json` from `RUNTIME_DIFF`: pushing a docs-only commit immediately after a broken runtime commit skips all 33 PostgreSQL/browser suites and marks the branch green.
9. **Evidence**: `deploy/systemd/biteshark-staging2-api.service:39`: `ReadWritePaths=-/var/lib/biteshark-staging2/customer-photos` vs `deploy/systemd/truckly-staging-api.service:39`: `ReadWritePaths=/var/lib/truckly-staging/customer-photos -/var/lib/truckly-staging/style-guide`. `deployFiles` inventory confirms only `deploy/backup/truckly-staging-backup.sh` exists (`backup-staging2.sh` is absent). `.github/workflows/truckly-source-review.yml:195-196, 204`: `BASE_REF="$PUSH_BEFORE"` and `RUNTIME_DIFF="$(git diff --name-only "$BASE_REF" HEAD -- api lib server packages public migrations deploy scripts package-lock.json)"` (missing `.github/workflows` and `package.json`).
10. **Expected / Intended Behavior**: `biteshark-staging2-api.service` must include `-/var/lib/biteshark-staging2/style-guide` in `ReadWritePaths`; `backup-staging2.sh` (or parameterized `truckly-staging-backup.sh` wrapper) must be tracked in `deploy/backup/`; and `.github/workflows/truckly-source-review.yml` must include `.github/workflows` + `package.json` in `RUNTIME_DIFF` and always run full PostgreSQL/browser gates on pushes to integration branches (`working/biteshark-vps`, `main`).
11. **Actual Behavior / Code Condition**: Re-provisioning `staging2` from committed `deploy/` files breaks Style Guide persistence (`EROFS`) and lacks `backup-staging2.sh`, while CI `push` jobs can turn green without re-running failed runtime suites.
12. **User or Operational Impact**: Deployment reproducibility failure on `staging2`, unversioned backup script risk, and CI gate bypass on multi-commit pushes.
13. **Root Cause**: `truckly-staging-api.service` was updated with Style Guide `ReadWritePaths` while `biteshark-staging2-api.service` and `backup-staging2.sh` were patched directly on the host or omitted; CI optimized `push` runtime using `github.event.before` without guarding protected integration branches.
14. **Recommended Remediation**: Add `-/var/lib/biteshark-staging2/style-guide` to `deploy/systemd/biteshark-staging2-api.service`, commit `deploy/backup/backup-staging2.sh` (wrapping or sharing `truckly-staging-backup.sh` with staging2 defaults), and update `.github/workflows/truckly-source-review.yml` + `tests/vps-platform-contract.test.cjs`.
15. **Specific Implementation Steps**:
   - Update `deploy/systemd/biteshark-staging2-api.service:39` to `ReadWritePaths=-/var/lib/biteshark-staging2/customer-photos -/var/lib/biteshark-staging2/style-guide`.
   - Commit `deploy/backup/backup-staging2.sh` (setting `BITESHARK_STYLE_GUIDE_STORAGE_DIR=/var/lib/biteshark-staging2/style-guide`, `PHOTO_STORAGE_DIR=/var/lib/biteshark-staging2/customer-photos`, and `DB_NAME=biteshark_staging2` before delegating to the shared encrypted backup logic).
   - In `.github/workflows/truckly-source-review.yml:195-209`, add `.github/workflows package.json` to `RUNTIME_DIFF` and force `run=true` on `push` events to `working/biteshark-vps` or `main`.
16. **Dependencies / Prerequisites**: None.
17. **Regression Risks**: Running full runtime CI on every push to `working/biteshark-vps` increases GitHub Actions minutes slightly on docs-only pushes to the main integration branch while keeping feature-branch PRs path-filtered.
18. **Verification Steps**: Add assertions in `tests/vps-platform-contract.test.cjs` verifying both `*-api.service` files include `style-guide` in `ReadWritePaths` and `deploy/backup/backup-staging2.sh` exists with valid `bash -n` syntax.
19. **Estimated Effort**: `S`
20. **Repair Priority**: `P1` (Linked Repair Tasks: [REP-019](09_PRIORITIZED_REPAIR_PLAN.md#rep-019))

---

## MEDIUM Findings (16)

<a id="aud-0021"></a>
### AUD-0021 — hasCustomerProfileSurface() checks nonexistent public/profile.html, permanently hiding sandbox /profile UI and silently skipping CI profile isolation assertions

1. **Finding ID**: `AUD-0021`
2. **Concise Title**: hasCustomerProfileSurface() checks nonexistent public/profile.html, permanently hiding sandbox /profile UI and silently skipping CI profile isolation assertions
3. **Severity**: **MEDIUM**
4. **Category**: Testing
5. **Confidence Level**: **Confirmed**
6. **Affected Subsystem**: S11: Test suite, tooling & verification gates
7. **File Path & Relevant Line Numbers**: `lib/admin-test-customer.js:37-39`, `public/admin.js:4955-4958`, `public/role-experience.js:362-365`, `tests/admin-test-customer.integration.cjs:278-363`
8. **What Is Wrong**: `hasCustomerProfileSurface()` in `lib/admin-test-customer.js:37-39` checks `fs.existsSync(path.join(REPO_ROOT, "public", "profile.html"))`. Because `/profile` is served dynamically by `server/app.js:1258-1325` using `public/index.html` + `public/customer-profile.js`, `public/profile.html` does not exist! As a result, `has_profile_page` is **always `false`**, hiding `#tcOpenProfileBtn` in `/admin`, hiding the `🧭 My BiteShark` button in the sandbox banner, AND causing `tests/admin-test-customer.integration.cjs` (`line 278`) to **silently skip** all `visits`, `collections`, `/api/me/profile`, and real-customer visit-isolation assertions (`lines 285-291, 316-319, 340-352, 358-363`) on every CI run!
9. **Evidence**: `lib/admin-test-customer.js:37-39`: `export function hasCustomerProfileSurface() { return fs.existsSync(path.join(REPO_ROOT, 'public', 'profile.html')); }` -> `false`. `tests/admin-test-customer.integration.cjs:278`: `const hasProfile = fs.existsSync(path.join(ROOT, 'public', 'profile.html'));` -> `false`, skipping 4 `if (hasProfile)` assertion blocks.
10. **Expected / Intended Behavior**: `hasCustomerProfileSurface()` must check `public/customer-profile.js` + `lib/customer-profile.js` (`true`), surfacing `/profile` controls in `/admin` and the sandbox banner, and `tests/admin-test-customer.integration.cjs` must unconditionally execute all profile/visit/collection isolation assertions.
11. **Actual Behavior / Code Condition**: Admin sandbox UI hides all `/profile` navigation links, and CI silently skips half of the sandbox data-isolation assertions while reporting `PASS`.
12. **User or Operational Impact**: Broken Admin Sandbox navigation to `/profile` and false sense of CI test coverage on sandbox visit/collection isolation.
13. **Root Cause**: Temporary feature-detection guard written before `public/customer-profile.js` landed assumed a static `public/profile.html` file would be created.
14. **Recommended Remediation**: Check `fs.existsSync(path.join(REPO_ROOT, "public", "customer-profile.js")) && fs.existsSync(path.join(MODULE_DIR, "customer-profile.js"))` in `hasCustomerProfileSurface()`, and remove the dead `if (hasProfile)` guard in `tests/admin-test-customer.integration.cjs` (asserting `enterRes.json.has_profile_page === true`).
15. **Specific Implementation Steps**:
   - Update `hasCustomerProfileSurface()` in `lib/admin-test-customer.js:37-39` to verify `lib/customer-profile.js` and `public/customer-profile.js`.
   - In `tests/admin-test-customer.integration.cjs:278-363`, assert `modStatusCheck.json.has_profile_page === true` and run all `custVisit`, `enterRes.json.counts.visits`, `/api/me/profile`, `topOwnVisits`, and `realCustVisits` assertions unconditionally (also updating the stale header comment at `lines 5-6`).
16. **Dependencies / Prerequisites**: None.
17. **Regression Risks**: Verify `seedAdminTestCustomerSampleData` in `lib/admin-test-customer.js` creates the expected `2` visits and `1` collection when `hasCustomerProfileSurface()` becomes `true`!
18. **Verification Steps**: Run `npm run test:test-customer` against PostgreSQL 16 and verify all previously skipped assertions execute and pass.
19. **Estimated Effort**: `S`
20. **Repair Priority**: `P1` (Linked Repair Tasks: [REP-020](09_PRIORITIZED_REPAIR_PLAN.md#rep-020))

---

<a id="aud-0022"></a>
### AUD-0022 — Active Test Customer Sandbox overlay breaks /admin pager telemetry & evidence links, survives OTP re-login, misreports available_for_top_admin, and leaves 4 tables uncleaned on reset

1. **Finding ID**: `AUD-0022`
2. **Concise Title**: Active Test Customer Sandbox overlay breaks /admin pager telemetry & evidence links, survives OTP re-login, misreports available_for_top_admin, and leaves 4 tables uncleaned on reset
3. **Severity**: **MEDIUM**
4. **Category**: Broken Feature
5. **Confidence Level**: **Confirmed**
6. **Affected Subsystem**: S1: Auth, sessions, age policy & test-customer sandbox
7. **File Path & Relevant Line Numbers**: `lib/standalone-auth.js:2453-2496`, `lib/admin-test-customer.js:556-585`, `server/admin-routes.js:940-948`, `public/admin.js:620-628`, `public/admin.js:3605-3625`, `public/role-experience.js:365-415`
8. **What Is Wrong**: Multiple session-overlay edge cases affect `__Host-bs_admin_test_session`: (1) `public/admin.js` fetches `/api/pager/telemetry` without `X-BiteShark-Admin-Portal: 1` (resolving to `usr_sa_top_admin_test_customer` -> `403`) and opens `/api/onboarding/evidence` in a new browser tab (`<a target="_blank">`, which cannot attach `X-BiteShark-Admin-Portal: 1` -> resolves to sandbox customer -> `404`!); (2) `verifyEmailOtpChallenge` (`lib/standalone-auth.js:2453-2496`) does not clear `__Host-bs_admin_test_session` when an admin signs in fresh via OTP, unexpectedly dropping them straight back into the synthetic customer on `/`; (3) `server/admin-routes.js:944` sets `available_for_top_admin: Boolean(ctx.isModAdmin && ...)` (inverted boolean: `false` for `Admin: Top`!); and (4) `resetAdminTestCustomerData` (`lib/admin-test-customer.js:556-585`) omits `vendor_applications`, `community_reviews`, `community_reports`, and `support_issues` created by the sandbox user.
9. **Evidence**: `server/app.js:500-516` bypasses the test-customer overlay ONLY on `/admin`, `/api/admin/*`, or requests carrying header `X-BiteShark-Admin-Portal: 1`. Top-level navigation `<a href="/api/onboarding/evidence?..." target="_blank">` (`public/admin.js:625`) sends no custom header, resolving `req.user` to `usr_sa_top_admin_test_customer` (`404`). `server/admin-routes.js:944`: `available_for_top_admin: Boolean(ctx.isModAdmin && isAdminTestCustomerAllowedInEnv(env))` (`ctx.isModAdmin` is `false` for Top Admins!). `lib/standalone-auth.js:2496` sets only `__Host-truckly_session` on `/api/auth/verify`.
10. **Expected / Intended Behavior**: Evidence downloads opened from `/admin` (e.g. `?admin_portal=1` or `Sec-Fetch-Site: same-origin` + `Referer: .../admin` or `/api/admin/onboarding/evidence` alias) and `/api/pager/telemetry` (`apiFetch` with `X-BiteShark-Admin-Portal: 1`) must work while the sandbox overlay is active; `/api/auth/verify` must clear any stale `__Host-bs_admin_test_session` cookie; `available_for_top_admin` must check `ctx.canAccessAdminPortal`; and `resetAdminTestCustomerData` must clean all sandbox-authored rows.
11. **Actual Behavior / Code Condition**: While testing in the sandbox, admins get `404` clicking "Inspect Evidence ↗" and `403` on pager telemetry in `/admin`, retain stale overlay cookies across OTP re-logins, and leave orphaned applications/tickets/reviews after clicking "Reset Sandbox Data".
12. **User or Operational Impact**: Broken `/admin` workflows while sandbox mode is active and incomplete sandbox cleanup.
13. **Root Cause**: Header-based overlay bypass (`X-BiteShark-Admin-Portal: 1`) cannot accompany browser `<a target="_blank">` navigations to `/api/onboarding/evidence` (which is outside `/api/admin/*`).
14. **Recommended Remediation**: Clear `__Host-bs_admin_test_session` on `/api/auth/verify`, support `/api/admin/onboarding/evidence` (or `?admin_portal=1` bypass in `shouldBypassTestCustomerOverlay`), route `/api/pager/telemetry` through `apiFetch` in `public/admin.js`, fix `available_for_top_admin` at `server/admin-routes.js:944`, and delete sandbox `vendor_applications`, `community_reports`, `community_reviews`, and `support_issues` inside `resetAdminTestCustomerData`.
15. **Specific Implementation Steps**:
   - In `server/app.js:500-516`, bypass the test-customer overlay on `/api/onboarding/evidence` when `?admin_portal=1` is passed (and append `&admin_portal=1` in `public/admin.js:621-626`), and ensure `public/admin.js` calls `/api/pager/telemetry` via `apiFetch` (which sets `X-BiteShark-Admin-Portal: 1`).
   - In `server/app.js` / `lib/standalone-auth.js:2496`, append `buildClearedAdminTestSessionCookie()` on `POST /api/auth/verify` responses.
   - Fix `server/admin-routes.js:944` to `Boolean(ctx.canAccessAdminPortal && isAdminTestCustomerAllowedInEnv(env))` and add `DELETE` statements for `community_reports`, `support_issues`, `community_reviews`, and `vendor_applications` authored by `SYNTHETIC_TEST_CUSTOMER_USER_ID` in `lib/admin-test-customer.js:564-585`.
16. **Dependencies / Prerequisites**: Ensure `app_role` has `DELETE` permissions on any table added to `resetAdminTestCustomerData` (or soft-delete/anonymize if `audit_logs` or immutable history constraints apply).
17. **Regression Risks**: Check FK constraints (`support_issue_messages`, `vendor_application_evidence` `ON DELETE CASCADE`) before adding `DELETE` statements to `resetAdminTestCustomerData`.
18. **Verification Steps**: Extend `tests/admin-test-customer.integration.cjs` to test `GET /api/onboarding/evidence?...&admin_portal=1` and `GET /api/pager/telemetry` with `X-BiteShark-Admin-Portal: 1` while the sandbox cookie is active, plus OTP `/api/auth/verify` clearing the overlay cookie.
19. **Estimated Effort**: `M`
20. **Repair Priority**: `P2` (Linked Repair Tasks: [REP-020](09_PRIORITIZED_REPAIR_PLAN.md#rep-020))

---

<a id="aud-0023"></a>
### AUD-0023 — Unrate-limited POST /api/bookings/create combined with hardcoded LIMIT 25 on GET /api/owner/requests allows spam starvation of vendor booking queues

1. **Finding ID**: `AUD-0023`
2. **Concise Title**: Unrate-limited POST /api/bookings/create combined with hardcoded LIMIT 25 on GET /api/owner/requests allows spam starvation of vendor booking queues
3. **Severity**: **MEDIUM**
4. **Category**: Security
5. **Confidence Level**: **Confirmed**
6. **Affected Subsystem**: S2: HTTP server core, routing, api/* handlers & DB adapter
7. **File Path & Relevant Line Numbers**: `api/bookings/create.js:73-340`, `api/owner/requests.js:135-145`
8. **What Is Wrong**: `POST /api/bookings/create` enforces no per-IP or per-user rate limit on booking inquiry creation, while `GET /api/owner/requests` executes `ORDER BY created_at DESC LIMIT 25` with zero cursor/offset pagination or status filter.
9. **Evidence**: `api/bookings/create.js:73-340` validates payload fields and idempotency keys without calling any rate-limit bucket (`pager_rate_limits` or in-memory IP/user limiter). `api/owner/requests.js:138-140`: `SELECT ... FROM bookings WHERE truck_id = $1 ORDER BY created_at DESC LIMIT 25` (no `OFFSET`, cursor, or `?status=pending` filter).
10. **Expected / Intended Behavior**: `POST /api/bookings/create` must enforce bounded per-IP and per-user rate limits (e.g., max 5 inquiries / 15 min per user/IP and max 2 pending inquiries per customer+vendor), and `GET /api/owner/requests` should support `?status=` filtering and cursor/offset pagination.
11. **Actual Behavior / Code Condition**: 25 automated `POST /api/bookings/create` submissions for a vendor push all legitimate pending customer event inquiries permanently out of the vendor owner's dashboard view.
12. **User or Operational Impact**: Denial-of-visibility against vendor event booking requests and database spam.
13. **Root Cause**: Legacy `api/bookings/create.js` and `api/owner/requests.js` were migrated from the serverless era without adding rate limits or pagination.
14. **Recommended Remediation**: Add per-user + per-IP rate limiting and a per-(customer, vendor) open-inquiry cap in `api/bookings/create.js`, and add `?status=` + `?limit=`/`?offset=` pagination to `api/owner/requests.js` (and `public/app.js:3348`, which further slices `.slice(0, 15)`!).
15. **Specific Implementation Steps**:
   - In `api/bookings/create.js`, enforce a rate limit (e.g., max 5 requests per 15 minutes per user/IP) and cap pending bookings per `(user_id, truck_id)` to `3`.
   - In `api/owner/requests.js:135-145`, accept optional `status` (`pending`/`confirmed`/`declined`) and `limit` (`<= 50`, default `25`) + `offset`, and remove or raise the `.slice(0, 15)` truncation in `public/app.js:3348`.
16. **Dependencies / Prerequisites**: None.
17. **Regression Risks**: Preserve default bare-array/existing response shape on `GET /api/owner/requests` when pagination parameters are omitted (`docs/engineering/API-CONTRACTS.md`).
18. **Verification Steps**: Add a rate-limit and status-filter test in `tests/backend-hardening.integration.cjs`.
19. **Estimated Effort**: `S`
20. **Repair Priority**: `P2` (Linked Repair Tasks: [REP-021](09_PRIORITIZED_REPAIR_PLAN.md#rep-021))

---

<a id="aud-0024"></a>
### AUD-0024 — Split-brain between BITESHARK_PLATFORM_ADMIN_IDS env grants and platform_roles DB rows breaks ticket assignment, account filters, and CLI checks

1. **Finding ID**: `AUD-0024`
2. **Concise Title**: Split-brain between BITESHARK_PLATFORM_ADMIN_IDS env grants and platform_roles DB rows breaks ticket assignment, account filters, and CLI checks
3. **Severity**: **MEDIUM**
4. **Category**: Architecture
5. **Confidence Level**: **Confirmed**
6. **Affected Subsystem**: S3: Admin governance backend
7. **File Path & Relevant Line Numbers**: `lib/authz.js:295-315`, `server/admin-routes.js:4228-4236`, `server/admin-routes.js:5560-5568`, `server/admin-routes.js:6075-6088`, `scripts/manage-feature-controls.cjs:168-176`
8. **What Is Wrong**: `loadAccessContext` (`lib/authz.js:298`) grants `Admin: Top` in memory if a `user_id` is listed in `BITESHARK_PLATFORM_ADMIN_IDS`, even when that user has no row in `platform_roles`. However, SQL queries in `/api/admin/issues` assignee validation (`server/admin-routes.js:6080`), `/api/admin/accounts?role=top` (`line 4231`), `/api/admin/issues` staff filter (`line 5562`), `count_eligible_active_top_admins()` (`migrations/026`), and `scripts/manage-feature-controls.cjs:170` check `platform_roles` exclusively.
9. **Evidence**: `lib/authz.js:298` checks `envAdminIds.has(userId)` to set `isTopAdmin = true`, whereas `server/admin-routes.js:6080` validates ticket `assigned_to_user_id` via `SELECT role FROM platform_roles WHERE user_id = $1` (returning `400 INVALID_ASSIGNEE` for env-only Top Admins!) and `scripts/manage-feature-controls.cjs:170` rejects `--actor-email` if absent from `platform_roles`.
10. **Expected / Intended Behavior**: `platform_roles` in PostgreSQL (`scripts/bootstrap-top-admin.cjs`, guarded by Migration `026` triggers) should be the single authoritative source of `Admin: Top` / `Admin: Mod` grants, or `BITESHARK_PLATFORM_ADMIN_IDS` should be deprecated/retired now that `bootstrap-top-admin.cjs` is standard.
11. **Actual Behavior / Code Condition**: Admins granted authority via `BITESHARK_PLATFORM_ADMIN_IDS` experience partial broken behavior across ticket assignment, account listing, last-Top invariants, and operator CLIs.
12. **User or Operational Impact**: Inconsistent RBAC enforcement, `400 INVALID_ASSIGNEE` errors in support triage, and confusion during admin offboarding.
13. **Root Cause**: `BITESHARK_PLATFORM_ADMIN_IDS` was an early pre-Migration-018 bootstrap mechanism left active alongside `platform_roles` (`admin_bootstrap_grants`).
14. **Recommended Remediation**: Verify neither hosted environment relies on `BITESHARK_PLATFORM_ADMIN_IDS` without matching `platform_roles` rows, sync/deprecate `BITESHARK_PLATFORM_ADMIN_IDS` in favor of `scripts/bootstrap-top-admin.cjs`, or include `parsePlatformAdminIds()` in assignee/account queries if retained. *(**REQUIRES PRODUCT DECISION** — see [09_PRIORITIZED_REPAIR_PLAN.md](09_PRIORITIZED_REPAIR_PLAN.md#decisions-required))*
15. **Specific Implementation Steps**:
   - Confirm on staging/ops docs whether `BITESHARK_PLATFORM_ADMIN_IDS` can be retired in favor of `scripts/bootstrap-top-admin.cjs` (`platform_roles`).
   - Until retired, include `parsePlatformAdminIds()` in `server/admin-routes.js:6080` (`INVALID_ASSIGNEE` check) and log a startup deprecation warning when `BITESHARK_PLATFORM_ADMIN_IDS` contains IDs missing from `platform_roles`.
16. **Dependencies / Prerequisites**: Operator verification that all active Top Admins exist in `platform_roles`.
17. **Regression Risks**: Check `tests/admin-governance.integration.cjs` and `tests/backend-hardening.integration.cjs` for test fixtures that inject `BITESHARK_PLATFORM_ADMIN_IDS` instead of `platform_roles` rows!
18. **Verification Steps**: Run `npm run test:admin` and `npm run test:hardening` after aligning assignee lookup or deprecating env-only grants.
19. **Estimated Effort**: `M`
20. **Repair Priority**: `P2` (Linked Repair Tasks: [REP-022](09_PRIORITIZED_REPAIR_PLAN.md#rep-022))

---

<a id="aud-0025"></a>
### AUD-0025 — Sliding-window DB session extension runs on routes that omit Set-Cookie, desynchronizing auth_sessions.expires_at from browser cookie Max-Age

1. **Finding ID**: `AUD-0025`
2. **Concise Title**: Sliding-window DB session extension runs on routes that omit Set-Cookie, desynchronizing auth_sessions.expires_at from browser cookie Max-Age
3. **Severity**: **MEDIUM**
4. **Category**: Reliability / Data Integrity
5. **Confidence Level**: **Confirmed**
6. **Affected Subsystem**: S1: Auth, sessions, age policy & test-customer sandbox
7. **File Path & Relevant Line Numbers**: `lib/standalone-auth.js:2596-2615`, `server/app.js:520-530`, `server/app.js:1120-1126`, `server/app.js:1344-1350`
8. **What Is Wrong**: `resolveSessionFromRequest` (`lib/standalone-auth.js:2596-2611`) mutates `auth_sessions.expires_at` in PostgreSQL once the session crosses its half-life and returns `refreshedCookie`, expecting the caller to emit `Set-Cookie`. However, `server/app.js` calls `resolveSessionFromRequest` at `lines 1121` and `1345` (public HTML / `/s/<token>` routes) while completely discarding `sess.refreshedCookie`! Once `auth_sessions.expires_at` is pushed forward in PostgreSQL, subsequent `/api/*` requests see `remaining > halfLife` and **never emit `Set-Cookie` again**, causing the browser to abruptly delete `__Host-truckly_session` at its original `Max-Age` while the DB session looks active.
9. **Evidence**: `server/app.js:523` attaches `sess.refreshedCookie` on `/api/*`, whereas `server/app.js:1121` (`const sess = await auth.resolveSessionFromRequest(req);`) and `server/app.js:1345` (`sess = await auth.resolveSessionFromRequest(req);`) ignore `sess.refreshedCookie` after `maybeExtendSessionIfNeeded` has already updated `auth_sessions.expires_at` in PostgreSQL!
10. **Expected / Intended Behavior**: Read-only session resolution on HTML / `/s/<token>` routes must pass `{ allowRenewal: false }` so DB sliding-window extension occurs ONLY when the HTTP response actually emits `appendSetCookie(res, sess.refreshedCookie)` (and never on `/s/<token>`, where `Set-Cookie` must not vary caching or headers).
11. **Actual Behavior / Code Condition**: Visiting `/` or `/s/<token>` past session half-life extends `auth_sessions.expires_at` in PostgreSQL without updating browser cookie `Max-Age`, preventing subsequent `/api/*` calls from refreshing the cookie and causing premature client logout.
12. **User or Operational Impact**: Unexpected mid-session customer/vendor/admin logouts at initial cookie `Max-Age` despite active usage.
13. **Root Cause**: `resolveSessionFromRequest` coupled read resolution with mutating sliding-window DB updates unconditionally.
14. **Recommended Remediation**: Add `{ allowRenewal = true }` to `resolveSessionFromRequest` (`lib/standalone-auth.js`); pass `{ allowRenewal: false }` on `/s/<token>` (`server/app.js:1345`) and emit `appendSetCookie(res, sess.refreshedCookie)` on first-party HTML routes (`/`, `/profile`, `/admin`) when `refreshedCookie` is returned.
15. **Specific Implementation Steps**:
   - In `lib/standalone-auth.js:2560-2615`, accept `options = { allowRenewal: true }` in `resolveSessionFromRequest` and skip `maybeExtendSessionIfNeeded` when `options.allowRenewal === false`.
   - In `server/app.js:1345` (`/s/<token>`), pass `{ allowRenewal: false }`; in `server/app.js:1121` and `1268` (`/admin`, `/profile`), append `sess.refreshedCookie` via `appendSetCookie` when non-null.
16. **Dependencies / Prerequisites**: None.
17. **Regression Risks**: Never emit `Set-Cookie` on `/s/<token>` or `/s/<token>/photo/<attachment>` responses.
18. **Verification Steps**: Add a test in `tests/standalone-runtime-auth.integration.cjs` advancing past session half-life, requesting `/s/<token>` (asserting DB `expires_at` is unchanged), then requesting `/api/auth/session` and asserting `Set-Cookie` is emitted.
19. **Estimated Effort**: `S`
20. **Repair Priority**: `P2` (Linked Repair Tasks: [REP-023](09_PRIORITIZED_REPAIR_PLAN.md#rep-023))

---

<a id="aud-0026"></a>
### AUD-0026 — Soft-deleted idempotency_key collisions trigger unhandled PostgreSQL 23505 HTTP 500s across visits, photos, trails, and collections

1. **Finding ID**: `AUD-0026`
2. **Concise Title**: Soft-deleted idempotency_key collisions trigger unhandled PostgreSQL 23505 HTTP 500s across visits, photos, trails, and collections
3. **Severity**: **MEDIUM**
4. **Category**: Runtime Error
5. **Confidence Level**: **Confirmed**
6. **Affected Subsystem**: S4: Customer profile, Greatest Hits sharing, exploration & photos
7. **File Path & Relevant Line Numbers**: `lib/customer-exploration.js:894-905`, `lib/customer-exploration.js:1265-1275`, `lib/customer-exploration.js:2375-2385`, `lib/customer-profile.js:1765-1805`, `public/exploration-client.js:972-984`
8. **What Is Wrong**: Unique idempotency indexes in Migrations `027` and `029` (`idx_customer_visits_user_idempotency`, `idx_customer_photos_user_idempotency`, `idx_customer_saved_trails_user_idempotency`, `idx_customer_collections_user_idem`) span soft-deleted rows (`WHERE idempotency_key IS NOT NULL`, without `AND deleted_at IS NULL`). When `logUserVisit`, `createUserPhoto`, `saveUserTrail`, or `createOwnerCollection` finds an existing row with `deleted_at IS NOT NULL`, it skips idempotent replay and `INSERT`s a new row with the same `cleanIdemp`—crashing with PostgreSQL `23505` (`500`). This occurs naturally when re-importing legacy IndexedDB photos (`legp_idx_0` at `public/exploration-client.js:975`) after deleting an earlier imported photo.
9. **Evidence**: Compare `lib/customer-exploration.js:2619-2624` (`importLegacyDeviceVisits`), which explicitly guards `const effectiveIdemp = existingIdemp.rows.length === 0 ? idempKey : null;`, against `lib/customer-exploration.js:896, 1268, 2377` and `lib/customer-profile.js:1768`, which check `if (idempRes.rows.length > 0 && !idempRes.rows[0].deleted_at)` and then pass `cleanIdemp` straight into `INSERT`.
10. **Expected / Intended Behavior**: Reusing an `idempotency_key` that previously belonged to a soft-deleted record must create the new record cleanly (`201`) without hitting `23505` `500`, and soft-deletion should clear `idempotency_key = NULL` on deleted rows.
11. **Actual Behavior / Code Condition**: Re-submitting or re-importing (`legp_idx_0`) after soft-deleting a visit, photo, trail, or collection throws an unhandled `23505` unique constraint violation (`500`).
12. **User or Operational Impact**: HTTP `500` failures on legacy photo re-imports and retried exploration/collection creations after deletion.
13. **Root Cause**: Application insert paths assumed partial unique indexes excluded `deleted_at IS NOT NULL`, whereas `migrations/027` and `029` indexed all non-null `idempotency_key` rows.
14. **Recommended Remediation**: Clear `idempotency_key = NULL` in all soft-delete `UPDATE` queries (`deleteUserVisit`, `deleteUserPhoto`, `deleteUserSavedTrail`, `deleteOwnerCollection`, `clearCustomerProfileAndCollectionsData`) AND pass `null` for `idempotency_key` on `INSERT` if the pre-insert lookup finds a soft-deleted row (requiring zero edits to immutable Migrations `027`/`029`).
15. **Specific Implementation Steps**:
   - In `logUserVisit`, `createUserPhoto`, `saveUserTrail` (`lib/customer-exploration.js`), and `createOwnerCollection` (`lib/customer-profile.js`), set `const effectiveIdemp = idempRes.rows.length > 0 ? null : cleanIdemp;` once `!idempRes.rows[0].deleted_at` replay has been checked.
   - In `deleteUserVisit`, `deleteUserPhoto`, `deleteUserSavedTrail`, `deleteOwnerCollection`, and `clearCustomerProfileAndCollectionsData`, include `, idempotency_key = NULL` in `SET deleted_at = $...`.
16. **Dependencies / Prerequisites**: None (pure application SQL fix; preserves immutable migration checksums).
17. **Regression Risks**: None; active rows (`deleted_at IS NULL`) continue returning idempotent replay responses unchanged.
18. **Verification Steps**: Add tests in `tests/customer-exploration.integration.cjs` and `tests/customer-profile-sharing.integration.cjs` creating, deleting, and re-creating a visit, photo (`legp_idx_0`), trail, and collection with the same `idempotency_key` (`201`).
19. **Estimated Effort**: `S`
20. **Repair Priority**: `P2` (Linked Repair Tasks: [REP-024](09_PRIORITIZED_REPAIR_PLAN.md#rep-024))

---

<a id="aud-0027"></a>
### AUD-0027 — Greatest Hits sharing UI hardcodes confirm_shared_view_update: true, wipes unsaved draft edits on share/photo actions, and caches stale photos

1. **Finding ID**: `AUD-0027`
2. **Concise Title**: Greatest Hits sharing UI hardcodes confirm_shared_view_update: true, wipes unsaved draft edits on share/photo actions, and caches stale photos
3. **Severity**: **MEDIUM**
4. **Category**: Broken Feature
5. **Confidence Level**: **Confirmed**
6. **Affected Subsystem**: S8: Role-experience, Admin Portal, Style Guide & Profile UI
7. **File Path & Relevant Line Numbers**: `public/greatest-hits-sharing.js:356-360`, `public/greatest-hits-sharing.js:547-555`, `public/greatest-hits-sharing.js:596-608`, `public/greatest-hits.js:97-125`, `public/greatest-hits.js:481-496`
8. **What Is Wrong**: (1) `public/greatest-hits-sharing.js:596-602` hardcodes `confirm_shared_view_update: true` on `attachCollectionPhoto`, bypassing the server's `409 SHARED_VIEW_CONFIRMATION_REQUIRED` live-publication warning when an `include_shared_photos: true` link is already active. (2) `rerender()` (`lines 356-360`) re-renders `#ghCollectionsHost.innerHTML` without calling `syncDraftFieldsFromDom`, and share/photo mutations call `ctx.reloadEditor()`, wiping unsaved `ghState` title/intro/recommendation edits and newly added spots. (3) `shState.ownerPhotosCache` (`lines 547-555`) is populated once and never invalidated when photos are uploaded or deleted.
9. **Evidence**: `public/greatest-hits-sharing.js:601`: `confirm_shared_view_update: true`. `lines 356-360`: `rerender` calls `triggerRerender()` without syncing DOM inputs; `lines 463, 514, 533, 606, 627` invoke `ctx.reloadEditor()`. `line 547`: `if (shState.ownerPhotosCache === null && window.bitesharkExploration)`.
10. **Expected / Intended Behavior**: Attaching a photo onto a live photo-sharing collection must require explicit user confirmation (`confirm_shared_view_update`), DOM draft text must be synced/preserved across preview/share/photo UI interactions, unsaved draft spots must prompt to save before attaching photos, and opening the photo picker must refresh the user's current private photos.
11. **Actual Behavior / Code Condition**: Live shared collections update silently on photo attach without confirmation, unsaved text is lost when opening preview or photo picker, and newly uploaded photos do not appear in the Greatest Hits picker until a full page reload.
12. **User or Operational Impact**: Data loss of unsaved customer writing, stale photo picker UX, and weakened live-share consent UX.
13. **Root Cause**: `greatest-hits-sharing.js` bolted onto `greatest-hits.js` via hook callbacks without sharing `syncDraftFieldsFromDom` or invalidating `ownerPhotosCache`.
14. **Recommended Remediation**: Sync DOM fields inside `rerender`, block or prompt before `reloadEditor` when `ghState.dirty` is true, require explicit confirmation when live `include_shared_photos` shares exist, and refresh `listPhotos` whenever opening the picker.
15. **Specific Implementation Steps**:
   - In `public/greatest-hits.js`, call `syncDraftFieldsFromDom(root)` inside `window.bitesharkGreatestHitsHooks.rerender` before rebuilding HTML, and hide `[data-gh-open-photo-picker]` on unsaved draft spots (`!persistedSpotSet.has(vid)`).
   - In `public/greatest-hits-sharing.js:596-605`, pass `confirm_shared_view_update: Boolean(liveUpdateConfirmed)` and surface an explicit confirmation prompt on `409 SHARED_VIEW_CONFIRMATION_REQUIRED` (matching `greatest-hits.js:764-766`).
   - In `public/greatest-hits-sharing.js:547-555`, fetch fresh `window.bitesharkExploration.listPhotos({ limit: 12 })` each time `[data-gh-open-photo-picker]` opens.
16. **Dependencies / Prerequisites**: None.
17. **Regression Risks**: Check `tests/customer-profile-browser.e2e.cjs` photo-attach steps if a share link with `include_shared_photos: true` is already active before photo attachment.
18. **Verification Steps**: Run `npm run test:profile:browser` and add an E2E assertion verifying unsaved `#ghEditIntroInput` text survives opening Preview and Photo Picker.
19. **Estimated Effort**: `M`
20. **Repair Priority**: `P2` (Linked Repair Tasks: [REP-014](09_PRIORITIZED_REPAIR_PLAN.md#rep-014))

---

<a id="aud-0028"></a>
### AUD-0028 — POST /api/me/shares/update-settings is disconnected from UI, and share rotate/update-settings ignore lazy time expiration

1. **Finding ID**: `AUD-0028`
2. **Concise Title**: POST /api/me/shares/update-settings is disconnected from UI, and share rotate/update-settings ignore lazy time expiration
3. **Severity**: **MEDIUM**
4. **Category**: Disabled Feature
5. **Confidence Level**: **Confirmed**
6. **Affected Subsystem**: S4: Customer profile, Greatest Hits sharing, exploration & photos
7. **File Path & Relevant Line Numbers**: `public/profile-client.js:272-281`, `public/greatest-hits-sharing.js:218-246`, `lib/customer-profile.js:2724-2735`, `lib/customer-profile.js:2862-2895`
8. **What Is Wrong**: `POST /api/me/shares/update-settings` and `window.bitesharkProfile.updateShareSettings` are implemented and API-tested, but have **zero UI callers** in `public/*.js` (`public/greatest-hits-sharing.js:218-246` renders only `Replace / rotate link` and `Revoke`). Furthermore, because `customer_collection_shares.status` remains `"active"` in PostgreSQL after `expires_at` passes, both `updateCollectionShareSettings` (`line 2724`) and `rotateCollectionShareLink` (`line 2862`) treat expired shares as active—and `rotateCollectionShareLink` copies the past `cur.expires_at` (`line 2893`) onto the newly minted link!
9. **Evidence**: Search across `public/` for `updateShareSettings` or `/api/me/shares/update-settings` finds only its definition in `public/profile-client.js:272-281, 327`. In `lib/customer-profile.js:2862-2895`, `rotateCollectionShareLink` checks `if (cur.status !== "active")` without checking `cur.expires_at <= now`, and sets `nextExpiresAt = ... cur.expires_at`.
10. **Expected / Intended Behavior**: Active share rows in `public/greatest-hits-sharing.js` should expose an `"Edit disclosures / expiry"` panel wired to `updateShareSettings`, and `rotateCollectionShareLink` / `updateCollectionShareSettings` must reject time-expired links (`cur.expires_at <= now`) with `409 SHARE_EXPIRED` unless explicitly renewed.
11. **Actual Behavior / Code Condition**: Users cannot toggle `include_shared_photos`, `include_display_name`, or expiration on an existing link without revoking the URL, and rotating a time-expired share via API mints a dead link.
12. **User or Operational Impact**: Disconnected backend feature forcing unnecessary link revocations and broken lazy-expiration state transitions.
13. **Root Cause**: UI wiring for `updateShareSettings` was omitted from `greatest-hits-sharing.js`, and lazy `expires_at` evaluation was enforced on `GET` reads but forgotten in `rotate`/`update-settings` mutations.
14. **Recommended Remediation**: Reject `cur.expires_at <= now` in `updateCollectionShareSettings` and `rotateCollectionShareLink`, and wire an inline `"Edit shared details"` toggle panel on active shares in `public/greatest-hits-sharing.js`.
15. **Specific Implementation Steps**:
   - In `lib/customer-profile.js:2724, 2862`, check `if (cur.expires_at && new Date(cur.expires_at).getTime() <= now.getTime())` -> update `status = "expired"` and throw `409 SHARE_EXPIRED`.
   - In `public/greatest-hits-sharing.js:218-246`, add an `"Edit disclosures & expiry"` button/panel on each active share calling `window.bitesharkProfile.updateShareSettings` (prompting for `confirm_shared_view_update` when broadening disclosures).
16. **Dependencies / Prerequisites**: None.
17. **Regression Risks**: Check `tests/customer-profile-sharing.integration.cjs` for any test expectations on `update-settings` error codes.
18. **Verification Steps**: Add expired-share rotation/update assertions in `tests/customer-profile-sharing.integration.cjs` and a disclosure-edit UI check in `tests/customer-profile-browser.e2e.cjs`.
19. **Estimated Effort**: `M`
20. **Repair Priority**: `P2` (Linked Repair Tasks: [REP-025](09_PRIORITIZED_REPAIR_PLAN.md#rep-025))

---

<a id="aud-0029"></a>
### AUD-0029 — Four governance workflow bugs: dismissed community reports stay stuck in queue, re-resolved tickets break 30-day reopen & mismatch SLA labels, /api/issues truncates at LIMIT 50 before ?id=, and Mod overwrites Top onboarding status

1. **Finding ID**: `AUD-0029`
2. **Concise Title**: Four governance workflow bugs: dismissed community reports stay stuck in queue, re-resolved tickets break 30-day reopen & mismatch SLA labels, /api/issues truncates at LIMIT 50 before ?id=, and Mod overwrites Top onboarding status
3. **Severity**: **MEDIUM**
4. **Category**: Broken Feature
5. **Confidence Level**: **Confirmed**
6. **Affected Subsystem**: S3: Admin governance backend
7. **File Path & Relevant Line Numbers**: `server/admin-routes.js:2202-2295`, `server/admin-routes.js:2965-2975`, `server/admin-routes.js:3445-3515`, `server/admin-routes.js:5318-5325`, `server/admin-routes.js:5435-5450`, `server/admin-routes.js:6150-6160`, `lib/support-tickets.js:45-60`, `lib/support-tickets.js:255-275`
8. **What Is Wrong**: (1) `dismiss_reports` (`server/admin-routes.js:5438`) marks `community_reports` dismissed without decrementing/resetting `community_reviews.report_count` (incremented at `line 2969`), while `reported` queue filtering (`line 5320`) checks `r.report_count > 0 OR open_reports > 0`—trapping dismissed posts in the `reported` queue forever! (2) Resolving a reopened support ticket (`line 6153`) uses `resolved_at = COALESCE(resolved_at, now())`, keeping the *first* resolution timestamp so customers lose their 30-day reopen window (`canCustomerReopenTicket`), while `lib/support-tickets.js` displays SLA labels `24h / 72h / 7d` (`line 48`) that contradict `computeIssueSlaDueAt` (`12h / 48h / 96h` at `line 260`). (3) `GET /api/issues` (`lines 2202-2295`) fetches `ORDER BY created_at DESC LIMIT 50` *before* filtering `?id=` or `?ticket=`, returning `404` on single-ticket lookups once a user or vendor exceeds 50 historical tickets. (4) `Admin: Mod` recording an onboarding recommendation (`line 3450`) overwrites `Admin: Top`'s `needs_info_correction` status back to `under_review`, and Top's `suspend` action (`line 3505`) sets `vendors.ownership_status = "suspended"` with no unsuspend action in `/api/admin/vendors/status`.
9. **Evidence**: `server/admin-routes.js:5320`: `(r.report_count > 0 OR COALESCE(rep.open_reports, 0) > 0)` vs `line 5438` (`UPDATE community_reports SET status = 'dismissed'`, `community_reviews.report_count` untouched). `line 6153`: `resolved_at = CASE WHEN $2 IN ('resolved', 'closed') THEN COALESCE(resolved_at, now()) ...`. `lines 2202-2295`: SQL `LIMIT 50` runs before JS `singleId`/`singleTicket` match. `lib/support-tickets.js:48` (`within 24 hours`, `within 3 business days`, `within 7 days`) vs `line 260` (`12`, `48`, `96` hours).
10. **Expected / Intended Behavior**: `dismiss_reports` should reset `report_count = 0` (or filter `reported` strictly on `open_reports > 0`); re-resolving a reopened ticket must stamp fresh `resolved_at = now()` and clear `resolved_at = NULL` on reopen (with aligned SLA hours/labels); `GET /api/issues?id=...` / `?ticket=...` must filter in SQL before `LIMIT 50`; and `Admin: Mod` recommendations must preserve `needs_info_correction` while `/api/admin/vendors/status` can reinstate suspended `ownership_status`.
11. **Actual Behavior / Code Condition**: Dismissed community posts remain permanently stuck in moderation; re-resolved tickets expire prematurely; older tickets `404` on direct lookup; and Mod/Top onboarding states can collide or strand a vendor.
12. **User or Operational Impact**: Degraded moderator queue hygiene, broken customer ticket reopen guarantees, broken ticket deep-links past 50 issues, and stuck vendor onboarding states.
13. **Root Cause**: Denormalized `report_count` and `COALESCE(resolved_at, now())` were written for single-pass workflows without testing dismiss/reopen cycles or >50-ticket accounts.
14. **Recommended Remediation**: Fix all four SQL/state-machine transitions in `server/admin-routes.js` and align SLA copy vs `computeIssueSlaDueAt` in `lib/support-tickets.js`.
15. **Specific Implementation Steps**:
   - In `server/admin-routes.js:5320, 5438`, filter `reported` queue on `COALESCE(rep.open_reports, 0) > 0` and reset `UPDATE community_reviews SET report_count = 0 WHERE id = $1` on `dismiss_reports`.
   - In `server/admin-routes.js:6153` (and customer reopen handler), set `resolved_at = now()` whenever transitioning into `resolved`/`closed`, clear `resolved_at = NULL` on reopen, and reconcile SLA hours/labels in `lib/support-tickets.js:48, 260`.
   - In `server/admin-routes.js:2202-2295`, push `AND i.id = $N` / `AND i.ticket_number = $N` into the SQL `WHERE` clause prior to `LIMIT 50`.
   - In `server/admin-routes.js:3450`, keep `status = CASE WHEN status = 'needs_info_correction' THEN status ELSE 'under_review' END` on Mod recommendation, and allow `Admin: Top` to restore `ownership_status` in `/api/admin/vendors/status`.
16. **Dependencies / Prerequisites**: Check `lib/support-tickets.js` SLA expectations with product if changing `12h/48h/96h` vs `24h/72h/7d` copy.
17. **Regression Risks**: Verify `tests/admin-governance.integration.cjs` and `tests/support-feedback.integration.cjs` assertions on `report_count` and SLA timestamps.
18. **Verification Steps**: Add regression tests in `tests/admin-governance.integration.cjs` (`dismiss_reports` removes item from `reported` queue) and `tests/support-feedback.integration.cjs` (re-resolving a ticket resets 30-day reopen window; `?ticket=` works past 50 rows).
19. **Estimated Effort**: `M`
20. **Repair Priority**: `P2` (Linked Repair Tasks: [REP-026](09_PRIORITIZED_REPAIR_PLAN.md#rep-026))

---

<a id="aud-0030"></a>
### AUD-0030 — Off-by-one 1-based state.step vs 0-based steps array in public/pager.js announces wrong pickup stage and aria-current="step"

1. **Finding ID**: `AUD-0030`
2. **Concise Title**: Off-by-one 1-based state.step vs 0-based steps array in public/pager.js announces wrong pickup stage and aria-current="step"
3. **Severity**: **MEDIUM**
4. **Category**: Broken Feature
5. **Confidence Level**: **Confirmed**
6. **Affected Subsystem**: S7: Customer-facing SPA frontend
7. **File Path & Relevant Line Numbers**: `public/pager.js:6-12`, `public/pager.js:228-235`
8. **What Is Wrong**: In `public/pager.js:7-11`, `pagerStates` defines 1-based `step` numbers (`cooking: 1`, `almost: 2`, `ready: 3`, `collected: 4`, `cancelled: 0`), whereas `steps = ['Cooking', 'Almost there', 'Ready!', 'Picked up']` (`line 228`) uses 0-based `map((label, i) => ...)` (`lines 230-233`: `i < state.step ? "complete" : i === state.step ? "current" : "waiting"`).
9. **Evidence**: `public/pager.js:7-11` (`cooking.step = 1`, `almost.step = 2`, `ready.step = 3`, `cancelled.step = 0`) vs `lines 231-233`: when `status === "cooking"` (`step = 1`), index `0` (`"Cooking"`) gets `complete` and index `1` (`"Almost there"`) gets `aria-current="step"`; when `status === "almost"` (`step = 2`), `"Ready!"` gets `aria-current="step"`; when `status === "ready"` (`step = 3`), `"Picked up"` gets `aria-current="step"`; and when `status === "cancelled"` (`step = 0`), `"Cooking"` gets `aria-current="step"`!
10. **Expected / Intended Behavior**: When `status === "cooking"`, `"Cooking"` (`i === 0`) is `current`; when `"almost"`, `"Almost there"` (`i === 1`) is `current`; when `"ready"`, `"Ready!"` (`i === 2`) is `current`; when `"collected"`, all 4 steps are `complete`; and when `"cancelled"`, zero steps are marked `current` (`aria-current="step"` omitted).
11. **Actual Behavior / Code Condition**: Visual step indicators and screen-reader `aria-current="step"` / `(current step)` announcements are shifted one stage ahead of the actual kitchen status (prematurely telling blind/screen-reader users `"Ready! (current step)"` while food is only `"almost"`!).
12. **User or Operational Impact**: Customer confusion at pickup counters and inaccurate WCAG `aria-current` announcements.
13. **Root Cause**: 1-based `step` integers were compared directly against 0-based `.map((label, i))` array indices.
14. **Recommended Remediation**: Compare `const stepIndex = state.step - 1;` (`cancelled` -> `-1`, `collected` -> `4` so `i < 4` marks all 4 `complete`!) in `public/pager.js:230-234`.
15. **Specific Implementation Steps**:
   - In `public/pager.js:230-234`, handle `p.status === "cancelled"` by marking all steps `"waiting"` with no `aria-current`, handle `p.status === "collected"` by marking all 4 steps `"complete"`, and otherwise compare `i` against `const activeIdx = state.step - 1;`.
16. **Dependencies / Prerequisites**: Check `tests/pager-demo.test.cjs` and `tests/pager-notifications-browser.e2e.cjs` for any snapshot/DOM class assertions on `.pager-roadmap li`.
17. **Regression Risks**: Update `tests/pager-demo.test.cjs` if it asserted the previous off-by-one classes.
18. **Verification Steps**: Run `npm run test:pager` and `npm run test:pager:browser`, asserting `status === "ready"` sets `aria-current="step"` on `"Ready!"` (`li:nth-child(3)`).
19. **Estimated Effort**: `S`
20. **Repair Priority**: `P2` (Linked Repair Tasks: [REP-027](09_PRIORITIZED_REPAIR_PLAN.md#rep-027))

---

<a id="aud-0031"></a>
### AUD-0031 — Style Guide workspace defects: permanently 0/15 completed categories, unvalidated /reset endpoint, >200 save-all failure, KV editor coercion, missing no-cache headers, and sync FS blocking

1. **Finding ID**: `AUD-0031`
2. **Concise Title**: Style Guide workspace defects: permanently 0/15 completed categories, unvalidated /reset endpoint, >200 save-all failure, KV editor coercion, missing no-cache headers, and sync FS blocking
3. **Severity**: **MEDIUM**
4. **Category**: Broken Feature
5. **Confidence Level**: **Confirmed**
6. **Affected Subsystem**: S6: Feature controls & Style Guide admin workspace
7. **File Path & Relevant Line Numbers**: `lib/style-guide-admin.js:560-575`, `lib/style-guide-admin.js:908-915`, `lib/style-guide-admin.js:1220-1290`, `public/admin-style-guide.js:1593-1635`, `public/admin-style-guide.js:2775-2810`, `public/admin.js:4580-4620`, `server/app.js:79-125`
8. **What Is Wrong**: Six functional/operational issues affect `/admin#style-guide`: (1) `computeStyleGuideChangeReport` (`lib/style-guide-admin.js:568`) filters `t.remaining === 0`, a property that does not exist on `summarizeByTopic` rows (`unanswered` + `draft` exist instead), permanently reporting `categories_completed: 0` and `15/15 categories left`; (2) `POST /api/admin/style-guide/reset` (`lines 1220-1290`) skips `validateStyleGuideData`, allowing resets of `ref:DEC-*` targets to leave workspace state invalid and brick subsequent saves/pushes; (3) `#sgSaveAllDirtyBtn` (`public/admin-style-guide.js:2776`) sends all dirty items in one `POST`, which fails if `updates.length > 200` (`lib/style-guide-admin.js:911`, or future schema expansion); (4) `syncKvDomToDraft` (`public/admin-style-guide.js:1593`) drops duplicate in-progress keys and coerces numbers/booleans into strings while typing; (5) `/admin-style-guide.js` and `/admin-style-guide.css` are omitted from `NO_CACHE_STATIC_FILES` (`server/app.js:79-124`), serving `max-age=300` stale bundles after deploy; and (6) `GET /api/admin/style-guide` runs synchronous `fs.*Sync` + dual 18-file Markdown generation on every request without hiding `#navStyleGuideBtn` when `admin_style_guide_workspace` is `hidden`.
9. **Evidence**: `lib/style-guide-admin.js:568`: `const completedTopics = currentTopicSummary.filter(t => t.remaining === 0).length;` (`t.remaining` is `undefined`!). `lines 1220-1290`: `resetStyleGuideAdminDecisions` writes `wsState` without calling `validateStyleGuideData`. `server/app.js:79-124`: includes `"/admin.js"` and `"/admin.css"` in `NO_CACHE_STATIC_FILES` while omitting `"/admin-style-guide.js"` and `"/admin-style-guide.css"`.
10. **Expected / Intended Behavior**: Category completion must compute `(t.unanswered + t.draft) === 0` (or `t.unanswered === 0`); `/reset` must run `validateStyleGuideData` before writing; `#sgSaveAllDirtyBtn` must chunk batches at `<= 200`; `/admin-style-guide.{js,css}` must be in `NO_CACHE_STATIC_FILES`; `#navStyleGuideBtn` must respect `hidden`/`paused` feature controls; and rendered Markdown previews should be cached in memory keyed on `(baseSha, wsState.revision)`.
11. **Actual Behavior / Code Condition**: Admin UI permanently displays `0` completed categories, caches stale Style Guide JS/CSS for 5 minutes across deploys, re-renders 36 Markdown documents synchronously on every GET, and allows `/reset` to break cross-decision `ref:DEC-*` integrity.
12. **User or Operational Impact**: Inaccurate completion telemetry in the GitHub upload modal, stale admin bundles post-deploy, main-thread latency spikes on 1-vCPU VPS, and unvalidated `/reset` state corruption.
13. **Root Cause**: Rapid iteration on the Style Guide workspace left field-name mismatches (`remaining` vs `unanswered`), missed `NO_CACHE_STATIC_FILES` registration, and skipped caching generated Markdown.
14. **Recommended Remediation**: Fix `t.remaining`, validate `/reset`, chunk save batches, add `/admin-style-guide.{js,css}` to `NO_CACHE_STATIC_FILES`, wire `#navStyleGuideBtn` visibility to `admin_style_guide_workspace`, and memoize `generateStyleGuideOutputs` by `(repoHead, wsRevision)`.
15. **Specific Implementation Steps**:
   - In `lib/style-guide-admin.js:568`, compute `const completedTopics = currentTopicSummary.filter(t => (Number(t.unanswered || 0) + Number(t.draft || 0)) === 0 && Number(t.total || 0) > 0).length;`.
   - In `lib/style-guide-admin.js:1255-1280`, validate merged decisions via `validateStyleGuideData` before persisting `resetStyleGuideAdminDecisions`, and cache `generateStyleGuideOutputs` in memory keyed by `wsState.revision`.
   - Add `"/admin-style-guide.js"` and `"/admin-style-guide.css"` to `NO_CACHE_STATIC_FILES` in `server/app.js:79-125`, chunk `#sgSaveAllDirtyBtn` requests into slices of `150`, preserve primitive types in `syncKvDomToDraft`, and hide `#navStyleGuideBtn` in `public/admin.js` when `admin_style_guide_workspace` is `hidden`.
16. **Dependencies / Prerequisites**: Coordinate with `REP-001` (`lib/style-guide-admin.js`).
17. **Regression Risks**: Ensure `tests/style-guide-admin.integration.cjs` and `tests/style-guide-admin-browser.e2e.cjs` pass with updated `categories_completed` counts.
18. **Verification Steps**: Complete all items in one Style Guide topic in `tests/style-guide-admin.integration.cjs` and assert `categories_completed === 1`, and verify `Cache-Control: no-store` on `GET /admin-style-guide.js`.
19. **Estimated Effort**: `M`
20. **Repair Priority**: `P2` (Linked Repair Tasks: [REP-028](09_PRIORITIZED_REPAIR_PLAN.md#rep-028))

---

<a id="aud-0032"></a>
### AUD-0032 — Style Guide GitHub integration reads security-sensitive env vars without conflict detection, lacks outbound redirect/timeout bounds, and hardcodes personal developer email in public UI/code

1. **Finding ID**: `AUD-0032`
2. **Concise Title**: Style Guide GitHub integration reads security-sensitive env vars without conflict detection, lacks outbound redirect/timeout bounds, and hardcodes personal developer email in public UI/code
3. **Severity**: **MEDIUM**
4. **Category**: Configuration
5. **Confidence Level**: **Confirmed**
6. **Affected Subsystem**: S6: Feature controls & Style Guide admin workspace
7. **File Path & Relevant Line Numbers**: `lib/style-guide-admin.js:64-95`, `lib/style-guide-admin.js:1396-1435`, `lib/style-guide-admin.js:1508-1515`, `public/admin-style-guide.js:2598-2605`, `public/admin.html:1124-1130`
8. **What Is Wrong**: (1) `lib/style-guide-admin.js:64-95` reads `STYLE_GUIDE_GITHUB_API_URL`, `STYLE_GUIDE_GITHUB_TOKEN`, and `ENV` with `securityCritical: false` (unlike `lib/env-compat.js` fail-closed conflict detection used for auth/mail/push secrets) and does not enforce an `https://api.github.com` host allowlist when sending the `Bearer` GitHub PAT (`lines 1396-1435`, which also omits `redirect: "error"` and an overall push deadline). (2) `public/admin.html:1127`, `public/admin-style-guide.js:2601`, and `lib/style-guide-admin.js:1512` hardcode a developer's personal name and Gmail (`[REDACTED_PERSONAL_EMAIL]`) directly into served HTML/JS and server defaults instead of populating from the signed-in `Admin: Top` session (`ctx.user.email`).
9. **Evidence**: `lib/style-guide-admin.js:64-95` passes `{ securityCritical: false }` to `readEnvCompat`. `lines 1396-1435` (`githubApiJson`) calls `fetch(url, { headers: { Authorization: "Bearer " + token } })` without `redirect: "error"` or host allowlist validation on `STYLE_GUIDE_GITHUB_API_URL`. `public/admin.html:1127`, `public/admin-style-guide.js:2601`, and `lib/style-guide-admin.js:1512` hardcode personal Gmail defaults.
10. **Expected / Intended Behavior**: `STYLE_GUIDE_GITHUB_TOKEN`, `STYLE_GUIDE_GITHUB_API_URL`, and `ENV` must use `securityCritical: true`; `githubApiJson` must enforce `https:` (allowing `http://127.0.0.1` only in `BITESHARK_ENV=test`), `redirect: "error"`, and bounded response sizes; and Git commit author defaults in `/admin` must derive from the authenticated `Admin: Top` user or neutral configuration rather than hardcoded personal PII.
11. **Actual Behavior / Code Condition**: Conflicting `BITESHARK_*` vs `TRUCKLY_*` GitHub token/URL env vars do not fail closed, HTTP redirects could forward the `Authorization` header if `STYLE_GUIDE_GITHUB_API_URL` is misconfigured, and personal developer email PII is served in `/admin.html` and `/admin-style-guide.js`.
12. **User or Operational Impact**: Bearer-token SSRF/redirect leakage risk on misconfiguration and unnecessary exposure of personal developer email in public static assets.
13. **Root Cause**: Local developer commit-identity defaults were copied into runtime web UI defaults, and `githubApiJson` skipped the outbound HTTPS/redirect guards used in `lib/standalone-auth.js` (Resend) and `lib/pager-notifications.js` (Web Push).
14. **Recommended Remediation**: Enable `securityCritical: true` on Style Guide token/API env reads, enforce `redirect: "error"` + `https://api.github.com` origin check (with loopback override strictly when `BITESHARK_ENV === "test"`), and default `#sgPushAuthorEmail` / `author_email` dynamically from the authenticated `Admin: Top` account (`state.user.email` / `actorEmail`).
15. **Specific Implementation Steps**:
   - In `lib/style-guide-admin.js:64-95, 1396-1435`, set `securityCritical: true`, validate `apiBaseUrl` is `https://api.github.com` (or `http://127.0.0.1:*` only when `env === "test"`), and pass `redirect: "error"` to `fetch`.
   - Remove the hardcoded personal email from `public/admin.html:1127`, `public/admin-style-guide.js:2601`, and `lib/style-guide-admin.js:1512`, defaulting the UI input from the signed-in Top Admin's `actorEmail` (or requiring explicit input).
   - Document `BITESHARK_STYLE_GUIDE_*` keys in `docs/engineering/contracts/configuration-keys.json`.
16. **Dependencies / Prerequisites**: Ensure `tests/style-guide-admin.integration.cjs` sets `BITESHARK_ENV=test` when pointing `BITESHARK_STYLE_GUIDE_GITHUB_API_URL` at its local `127.0.0.1` mock server.
17. **Regression Risks**: Verify `tests/style-guide-admin.integration.cjs` and `tests/style-guide-admin-browser.e2e.cjs` pass with dynamic `actorEmail` defaults.
18. **Verification Steps**: Grep `public/` and `lib/` to confirm zero hardcoded `@gmail.com` literals remain, and run `npm run test:style-guide:integration` + `npm run test:style-guide:browser`.
19. **Estimated Effort**: `S`
20. **Repair Priority**: `P2` (Linked Repair Tasks: [REP-028](09_PRIORITIZED_REPAIR_PLAN.md#rep-028))

---

<a id="aud-0033"></a>
### AUD-0033 — Database pool fan-out (4 transactions per profile load), unbounded lifetime visit scan on saved trails, and 2 wasted RBAC queries per customer API call

1. **Finding ID**: `AUD-0033`
2. **Concise Title**: Database pool fan-out (4 transactions per profile load), unbounded lifetime visit scan on saved trails, and 2 wasted RBAC queries per customer API call
3. **Severity**: **MEDIUM**
4. **Category**: Performance
5. **Confidence Level**: **Confirmed**
6. **Affected Subsystem**: S4: Customer profile, Greatest Hits sharing, exploration & photos
7. **File Path & Relevant Line Numbers**: `lib/customer-profile.js:839-960`, `lib/customer-exploration.js:2170-2182`, `server/admin-routes.js:718-722`, `server/admin-routes.js:971-997`, `server/index.js:48-55`
8. **What Is Wrong**: Three concrete database efficiency bottlenecks compound on the 8-connection (`DB_POOL_MAX = 8`) VPS pool: (1) `getPrivateOwnerProfile` (`lib/customer-profile.js:842, 947-957`) runs `coreTx` and then fans out via `Promise.all([listUserVisits, listUserPhotos, listUserSavedTrails])`—checking out 3 simultaneous pooled connections per `/api/me/profile` request, re-acquiring `FOR SHARE` locks on `auth_users`/`auth_sessions` 4 times, and reading non-atomic snapshots; (2) `hydrateSavedTrailsInTx` (`lib/customer-exploration.js:2170-2179`) fetches EVERY active `customer_visits` row in the user's lifetime without filtering `AND recorded_vendor_id = ANY($2::text[])`; and (3) `handleGovernanceApiRequest` (`server/admin-routes.js:719`) runs `loadAccessContext` (2 SQL queries against `platform_roles` and `vendor_memberships`) BEFORE delegating `CUSTOMER_EXPLORATION_PATHS` and `CUSTOMER_PROFILE_PATHS` (`lines 971-997`), discarding `ctx` immediately!
9. **Evidence**: `server/index.js:50`: `DB_POOL_MAX` defaults to `8`. `lib/customer-profile.js:947-957`: `Promise.all([listUserVisits(dbAdapter, ...), listUserPhotos(dbAdapter, ...), listUserSavedTrails(dbAdapter, ...)])` outside `coreTx`. `lib/customer-exploration.js:2170-2179`: `SELECT ... FROM customer_visits WHERE user_id = $1 AND deleted_at IS NULL` (unbounded). `server/admin-routes.js:719` runs `loadAccessContext` before `if (CUSTOMER_EXPLORATION_PATHS.has(normPath))` at `line 971` (which passes `verifiedUser: req.user`, not `ctx`!).
10. **Expected / Intended Behavior**: Customer exploration/profile delegation must run BEFORE `loadAccessContext` in `server/admin-routes.js`; `getPrivateOwnerProfile` must execute sequentially inside a single `withTransaction` (`tx`) checkout; and `hydrateSavedTrailsInTx` must restrict `customer_visits` to the distinct `recorded_vendor_id`s in `stopsRes`.
11. **Actual Behavior / Code Condition**: Three concurrent `/profile` loads contend for 9 pool connections on an 8-connection pool while running 6 wasted RBAC queries and 3 full-history `customer_visits` scans.
12. **User or Operational Impact**: Connection-pool exhaustion and tail-latency spikes under modest concurrent customer usage on the 961 MiB VPS.
13. **Root Cause**: Composable service functions (`listUserVisits`, etc.) were invoked with `dbAdapter` inside `Promise.all` instead of passing the active `tx` handle sequentially, and customer sub-routers were appended below `loadAccessContext` in `server/admin-routes.js`.
14. **Recommended Remediation**: Move `CUSTOMER_EXPLORATION_PATHS` and `CUSTOMER_PROFILE_PATHS` delegation above `loadAccessContext` in `server/admin-routes.js`, pass `tx` sequentially inside `getPrivateOwnerProfile`, and add `AND recorded_vendor_id = ANY($2::text[])` to `hydrateSavedTrailsInTx`.
15. **Specific Implementation Steps**:
   - In `server/admin-routes.js`, move the `CUSTOMER_EXPLORATION_PATHS` and `CUSTOMER_PROFILE_PATHS` delegation blocks (`lines 971-997`) above `const ctx = await loadAccessContext(...)` (`line 719`)—after enforcing the central `isPreviewViewpoint` guard!
   - In `lib/customer-profile.js:842-960`, run `listUserVisits(tx, ...)`, `listUserPhotos(tx, ...)`, and `listUserSavedTrails(tx, ...)` sequentially inside `coreTx` (which `withTransaction` supports natively via nested-tx passthrough in `lib/db-tx.js:174-177`), and add `LIMIT 10` / `COUNT(*)` bounds on `favorites` (`line 860`).
   - In `lib/customer-exploration.js:2170-2182`, pass the deduplicated array of `recorded_vendor_id`s from `stopsRes` into `AND recorded_vendor_id = ANY($2::text[])`.
16. **Dependencies / Prerequisites**: Keep sequential `await` (never `Promise.all`) when sharing a single `pg` `tx` client!
17. **Regression Risks**: Critical `pg` rule: never run `Promise.all` with multiple queries on the same `tx` (`PoolClient`); await `listUserVisits(tx)`, `listUserPhotos(tx)`, and `listUserSavedTrails(tx)` sequentially!
18. **Verification Steps**: Instrument connection checkout counts in `tests/customer-profile-sharing.integration.cjs` to confirm `GET /api/me/profile` checks out 1 connection instead of 4 and executes 0 `platform_roles` queries.
19. **Estimated Effort**: `M`
20. **Repair Priority**: `P2` (Linked Repair Tasks: [REP-029](09_PRIORITIZED_REPAIR_PLAN.md#rep-029))

---

<a id="aud-0034"></a>
### AUD-0034 — Cross-account in-memory profile data and plaintext share URLs remain cached on 403 age-assessment and degraded 5xx auth transitions

1. **Finding ID**: `AUD-0034`
2. **Concise Title**: Cross-account in-memory profile data and plaintext share URLs remain cached on 403 age-assessment and degraded 5xx auth transitions
3. **Severity**: **MEDIUM**
4. **Category**: Security
5. **Confidence Level**: **Confirmed**
6. **Affected Subsystem**: S7: Customer-facing SPA frontend
7. **File Path & Relevant Line Numbers**: `public/app.js:1685-1713`, `public/profile-client.js:93-105`
8. **What Is Wrong**: In `public/app.js:1685-1713` (`syncAuthAndUserData`), both the `403 requires_age_assessment` early-return branch (`lines 1685-1694`) and the degraded non-`401` branch (`lines 1696-1713`) call `window.bitesharkExploration.syncActiveUserScope(...)` while omitting `window.bitesharkProfile.syncActiveUserScope(...)` and `window.bitesharkResetProfileUiOnAuthChange()`. Meanwhile, `public/profile-client.js:93-105` (`getProfile`) returns cached `memState.profileData` without checking `window.currentUser`.
9. **Evidence**: `public/app.js:1689, 1700` call `window.bitesharkExploration.syncActiveUserScope(...)` only, whereas `lines 1672` (`200`) and `1726` (`401`) sync both `bitesharkExploration` and `bitesharkProfile`. `public/profile-client.js:95`: `if (!options.force && memState.profileData) { return memState.profileData; }` (no `syncActiveUserScope(currentUser)` check, unlike `public/exploration-client.js:386-388`).
10. **Expected / Intended Behavior**: Every auth-scope transition in `syncAuthAndUserData` must synchronize both `bitesharkExploration` and `bitesharkProfile` and reset `#customerProfileRoot` / `shState.latestIssuedShareUrl`, and `getProfile()` must defensively call `syncActiveUserScope(window.currentUser)` before returning cached data.
11. **Actual Behavior / Code Condition**: Switching accounts on a shared browser into an unassessed (`403`) account or during a transient `503` leaves the prior user's cached profile, Greatest Hits drafts, and plaintext `latestIssuedShareUrl` in memory.
12. **User or Operational Impact**: Same-tab shared-device privacy leak of cached profile and share-link state.
13. **Root Cause**: `bitesharkProfile.syncActiveUserScope` was wired into `200` and `401` branches of `syncAuthAndUserData` after `bitesharkExploration` without updating the `403` and `5xx` branches.
14. **Recommended Remediation**: Add `window.bitesharkProfile.syncActiveUserScope` + `bitesharkResetProfileUiOnAuthChange` to `public/app.js:1688-1705` and add a defensive `syncActiveUserScope(window.currentUser)` check at the top of `getProfile()` in `public/profile-client.js:93`.
15. **Specific Implementation Steps**:
   - In `public/app.js:1688-1705`, mirror the `bitesharkProfile.syncActiveUserScope` + `bitesharkResetProfileUiOnAuthChange()` calls from `lines 1671-1676`.
   - In `public/profile-client.js:93-97`, call `if (typeof window !== "undefined" && "currentUser" in window) syncActiveUserScope(window.currentUser);` before returning `memState.profileData`.
16. **Dependencies / Prerequisites**: None.
17. **Regression Risks**: Minimal; `syncActiveUserScope` is a no-op when `activeUserId` matches `currentUser.id`.
18. **Verification Steps**: Add a browser E2E check in `tests/customer-profile-browser.e2e.cjs` switching from a seeded profile account to an unassessed account (`requires_age_assessment`) and asserting `window.bitesharkProfile` cache is cleared.
19. **Estimated Effort**: `S`
20. **Repair Priority**: `P2` (Linked Repair Tasks: [REP-014](09_PRIORITIZED_REPAIR_PLAN.md#rep-014))

---

<a id="aud-0035"></a>
### AUD-0035 — Write-only dead sink admin_notification_outbox, 6 disconnected domain routes pinned by REGISTERED_DOMAIN_ROUTE_COUNT === 30, and 2 zero-UI admin endpoints

1. **Finding ID**: `AUD-0035`
2. **Concise Title**: Write-only dead sink admin_notification_outbox, 6 disconnected domain routes pinned by REGISTERED_DOMAIN_ROUTE_COUNT === 30, and 2 zero-UI admin endpoints
3. **Severity**: **MEDIUM**
4. **Category**: Disabled Feature
5. **Confidence Level**: **Confirmed**
6. **Affected Subsystem**: S2: HTTP server core, routing, api/* handlers & DB adapter
7. **File Path & Relevant Line Numbers**: `migrations/018_admin_portal_onboarding_moderation_issues.sql:300-318`, `server/admin-routes.js:156-180`, `server/admin-routes.js:3540-3550`, `server/admin-routes.js:4917-4980`, `server/admin-routes.js:8312-8328`, `server/routes.js:1-131`
8. **What Is Wrong**: (1) `admin_notification_outbox` (`migrations/018:300`) receives `INSERT`s during onboarding decisions (`server/admin-routes.js:3544, 3614`, returning `notification_delivery: "recorded_in_app_only"`), yet **zero `SELECT`, `UPDATE`, or `DELETE` queries** read, deliver, display, or purge `admin_notification_outbox` anywhere in the codebase! (2) Six domain routes in `server/routes.js` (`/api/trucks/list`, `/api/trucks/detail`, `/api/trucks/nearby` [superseded by `/api/trucks`], `/api/pager/list` [superseded by `/api/vendor/pagers`], `/api/community/moderate` [superseded by `/api/admin/moderation/decision`], and `/api/vendor/bookings` [superseded by `/api/owner/requests`]) have zero active frontend callers (or dead `community.js:286, 309` functions never triggered in UI) while being locked in place by contract `REGISTERED_DOMAIN_ROUTE_COUNT === 30`. (3) Governance endpoints `POST /api/admin/invitations/resend` (`line 4917`) and `POST /api/admin/style-guide/reset` (`line 8312`) have zero UI buttons and zero tests.
9. **Evidence**: Repository-wide search for `admin_notification_outbox` shows `CREATE TABLE` (`migrations/018:300`), `GRANT` (`018`/`025`), and `INSERT` (`server/admin-routes.js:3544, 3614`) — `0` `SELECT`s! `docs/engineering/generated/DRIFT-REPORT.md` confirms the 6 uncalled `api/*` domain routes; `AGENTS.md` enforces `REGISTERED_DOMAIN_ROUTE_COUNT === 30` against accidental deletion.
10. **Expected / Intended Behavior**: Either wire `admin_notification_outbox` to an applicant status/email notification consumer (with retention cleanup) or stop claiming `"recorded_in_app_only"` if applicant status is read directly from `vendor_applications`; wire or explicitly document `/api/admin/invitations/resend` and `/api/admin/style-guide/reset` with tests; and preserve the 6 legacy `server/routes.js` endpoints until an explicit contract-versioned deprecation decision is approved.
11. **Actual Behavior / Code Condition**: Rows accumulate forever in `admin_notification_outbox` with zero readers; 2 admin endpoints sit untested and unwired; and 6 legacy domain handlers increase maintenance/audit surface (`api/community/moderate.js`, `api/pager/list.js`, etc.).
12. **User or Operational Impact**: Silent non-delivery of queued onboarding outbox records, untested attack surface on unwired admin endpoints, and legacy route maintenance overhead.
13. **Root Cause**: `admin_notification_outbox` was scaffolded in Migration `018` for future transactional applicant emails that were later implemented separately for invitations (`account_invitations`) without wiring onboarding outbox delivery.
14. **Recommended Remediation**: Record a product decision on (a) wiring `admin_notification_outbox` into applicant UI/Resend vs retiring writes + adding retention cleanup, (b) wiring `"Resend Invitation"` and `"Reset Decision"` buttons + integration tests vs removing `/api/admin/style-guide/reset`, and (c) preserving `REGISTERED_DOMAIN_ROUTE_COUNT === 30` per `AGENTS.md` unless formally deprecated. *(**REQUIRES PRODUCT DECISION** — see [09_PRIORITIZED_REPAIR_PLAN.md](09_PRIORITIZED_REPAIR_PLAN.md#decisions-required))*
15. **Specific Implementation Steps**:
   - Add integration tests for `POST /api/admin/invitations/resend` (`tests/invitation-workflow.integration.cjs`) and `POST /api/admin/style-guide/reset` (`tests/style-guide-admin.integration.cjs`), and wire `"Resend"` / `"Reset"` UI buttons if desired by product.
   - Surface `admin_notification_outbox` messages in `GET /api/onboarding/applications` (or add bounded retention cleanup) so queued rows are either read by applicants or pruned.
   - Keep the 6 legacy `server/routes.js` endpoints intact unless Matt & Yaman explicitly authorize updating `REGISTERED_DOMAIN_ROUTE_COUNT` and `shared-contracts.json`.
16. **Dependencies / Prerequisites**: Product decision required before removing any HTTP route or altering `REGISTERED_DOMAIN_ROUTE_COUNT === 30`.
17. **Regression Risks**: Deleting any `api/*.js` route without updating `server/routes.js`, `shared-contracts.json`, `drift-baseline.json`, and `tests/backend-hardening.integration.cjs` will break CI immediately (`AGENTS.md` Section 2.2).
18. **Verification Steps**: Run `npm run registry:validate`, `npm run test:registry`, and the corresponding integration suites.
19. **Estimated Effort**: `M`
20. **Repair Priority**: `P3` (Linked Repair Tasks: [REP-025](09_PRIORITIZED_REPAIR_PLAN.md#rep-025))

---

<a id="aud-0036"></a>
### AUD-0036 — God-file routers/controllers (server/admin-routes.js at 8,331 LOC), 12 load-order browser global collisions, and 5x duplicated security helpers

1. **Finding ID**: `AUD-0036`
2. **Concise Title**: God-file routers/controllers (server/admin-routes.js at 8,331 LOC), 12 load-order browser global collisions, and 5x duplicated security helpers
3. **Severity**: **MEDIUM**
4. **Category**: Unnecessary Complexity
5. **Confidence Level**: **Confirmed**
6. **Affected Subsystem**: S3: Admin governance backend
7. **File Path & Relevant Line Numbers**: `server/admin-routes.js:604-8331`, `public/admin.js:1-5274`, `lib/customer-profile.js:1-4475`, `public/role-experience.js:1-3962`, `public/app.js:1-3773`, `docs/engineering/generated/DRIFT-REPORT.md:1-90`
8. **What Is Wrong**: `server/admin-routes.js` has grown to `8,331` lines with a single `7,728`-line function (`handleGovernanceApiRequest`) dispatching 52 governance routes via imperative `if (normPath === ...)` blocks rather than a declarative route table. Across the repository, 60 functions exceed 120 lines, 12 browser globals (`openDetail` 3x, `applyFilters` 2x, etc.) rely on fragile `<script>` load-order monkey-patching in `public/index.html`, and security-relevant helpers are copy-pasted across modules (`sha256Hex` in 5 `lib/*` files, `maskEmail` in 2 files, `appendRawCookie` vs `appendSetCookie`, and `escapeHtml` in 11 frontend files).
9. **Evidence**: `supplement_report.json`: `handleGovernanceApiRequest` (`server/admin-routes.js:604-8331`, `7,728` lines); `public/admin.js` (`5,274` lines); `lib/customer-profile.js` (`4,475` lines). `sha256Hex` is re-declared in `lib/admin-governance.js:24`, `lib/admin-test-customer.js:33`, `lib/style-guide-admin.js:46`, `lib/standalone-auth.js:78`, and `lib/pager-notifications.js:52`. `DRIFT-REPORT.md` documents 12 load-order global collisions.
10. **Expected / Intended Behavior**: `server/admin-routes.js` should preserve its stable public exports (`isGovernanceApiPath`, `handleGovernanceApiRequest`, `EVIDENCE_UPLOAD_MAX_JSON_BYTES`) while dispatching through a declarative governance route manifest (`path`, `methods`, `minRole`, `pauseScope`, `allowInPreview`) backed by domain modules (`server/admin/*.js`), and canonical helpers (`sha256Hex`, `maskEmail`, `escapeSqlLike`, `appendSetCookie`) should live in single shared modules.
11. **Actual Behavior / Code Condition**: Adding a cross-cutting guard (`isPreviewViewpoint`, `PAUSE_WRITES`, `ESCAPE "\\"`) requires editing dozens of sibling `if` branches manually—which directly caused `AUD-0008`, `AUD-0014`, `AUD-0017`, and `AUD-0029`.
12. **User or Operational Impact**: High defect recurrence rate on cross-cutting security/operational controls and elevated review/context cost.
13. **Root Cause**: Rapid feature delivery across Migrations `018`–`029` appended handlers to `server/admin-routes.js` instead of introducing a route manifest like `server/routes.js`.
14. **Recommended Remediation**: Incrementally extract a declarative route metadata table inside `server/admin-routes.js` first (eliminating per-branch boilerplate without changing external contracts), consolidate `sha256Hex` / `maskEmail` / `escapeSqlLike` into `lib/admin-governance.js`, and extract cohesive domain slices (`invitations`, `onboarding`, `issues`, `moderation`) behind `server/admin-routes.js`.
15. **Specific Implementation Steps**:
   - Export canonical `sha256Hex`, `maskEmail`, and `escapeSqlLike` from `lib/admin-governance.js` and replace duplicate local definitions across `lib/*`, `server/admin-routes.js`, and `scripts/manage-feature-controls.cjs`.
   - Introduce a `GOVERNANCE_ROUTE_MANIFEST` table at the top of `server/admin-routes.js` enforcing HTTP method `Allow` headers, `minRole` (`authenticated` / `mod` / `top`), `pauseScope`, and `allowInPreview` centrally before invoking per-domain handler functions.
   - Extract self-contained handler modules (`server/admin/invitations-routes.js`, `server/admin/issues-routes.js`, `server/admin/onboarding-routes.js`) while keeping `server/admin-routes.js` as the public entry facade and running `npm run registry:docs && npm run registry:validate`.
16. **Dependencies / Prerequisites**: Land Phase A/B security and bug fixes (`REP-001`..`REP-020`) BEFORE structural file extraction so git blame and cherry-picks remain clean.
17. **Regression Risks**: Keep `server/admin-routes.js` exports unchanged (`canonical-components.json` / `shared-contracts.json`) and never reorder `<script>` tags in `public/index.html` without running `npm run registry:validate` and browser E2E suites.
18. **Verification Steps**: Run `npm run registry:docs`, `npm run registry:validate`, `npm run test:registry`, and `npm run test:admin`.
19. **Estimated Effort**: `L`
20. **Repair Priority**: `P3` (Linked Repair Tasks: [REP-030](09_PRIORITIZED_REPAIR_PLAN.md#rep-030))

---

## LOW Findings (7)

<a id="aud-0037"></a>
### AUD-0037 — Deployment template & release-tarball drift: legacy truckly-staging.conf.template lacks 1m evidence/debug blocks, worker TimeoutStopSec < 28s fetch timeout, and tarball check omits 029

1. **Finding ID**: `AUD-0037`
2. **Concise Title**: Deployment template & release-tarball drift: legacy truckly-staging.conf.template lacks 1m evidence/debug blocks, worker TimeoutStopSec < 28s fetch timeout, and tarball check omits 029
3. **Severity**: **LOW**
4. **Category**: Configuration
5. **Confidence Level**: **Confirmed**
6. **Affected Subsystem**: S10: Deploy, systemd, Nginx, CI/CD, dependencies & code-registry
7. **File Path & Relevant Line Numbers**: `deploy/nginx/truckly-staging.conf.template:50-95`, `deploy/nginx/staging.biteshark.live.conf.template:75-120`, `deploy/systemd/truckly-staging-worker.service:14-16`, `scripts/run-pager-worker.cjs:155-165`, `scripts/build-linux-release-tarball.cjs:77-140`
8. **What Is Wrong**: (1) `deploy/nginx/truckly-staging.conf.template` sets global `client_max_body_size 64k;` (`line 51`) with an `8m` override for `/api/me/photos` (`line 90`), but omits the `location = /api/onboarding/evidence { client_max_body_size 1m; }` override and `/debug-admin.{js,css}` blocks present in `staging.biteshark.live.conf.template` (`lines 76-105`). (2) `deploy/systemd/truckly-staging-worker.service:15` sets `TimeoutStopSec=15`, which is shorter than `scripts/run-pager-worker.cjs`'s `28,000ms` loopback HTTP timeout (`SIGKILL` mid-batch risk during `systemctl restart`). (3) `scripts/build-linux-release-tarball.cjs:77-138` hardcodes `requiredEntry` checks up through `migrations/028`, omitting `migrations/029` and Customer Profile modules.
9. **Evidence**: `wave2_verified.json` (`systemdChecks`): `staging.biteshark.live.conf.template:76, 103` and `staging2.biteshark.live.conf.template:75, 101` include `/debug-admin.*` and `/api/onboarding/evidence` (`1m`), whereas `truckly-staging.conf.template` lacks both. `truckly-staging-worker.service:15` has `TimeoutStopSec=15`. `build-linux-release-tarball.cjs:130` stops at `028_exploration_photo_reconciliation.sql`.
10. **Expected / Intended Behavior**: Either sync or retire/redirect `deploy/nginx/truckly-staging.conf.template` so operators never apply an outdated Nginx template, raise `truckly-staging-worker.service` `TimeoutStopSec` to `35`, and dynamically verify all `migrations/*.sql` files in `scripts/build-linux-release-tarball.cjs`.
11. **Actual Behavior / Code Condition**: Applying `truckly-staging.conf.template` causes `413 Payload Too Large` on onboarding evidence uploads > 64 KB; worker restarts can `SIGKILL` an in-flight batch after 15s; and `build-linux-release-tarball.cjs` does not assert `029+` migrations.
12. **User or Operational Impact**: Operational template footgun and abrupt worker shutdown hazard.
13. **Root Cause**: Newer Nginx rules and Migration `029` were added without updating legacy `truckly-staging.conf.template` or the static `requiredEntry` list in `build-linux-release-tarball.cjs`.
14. **Recommended Remediation**: Sync `deploy/nginx/truckly-staging.conf.template` with `staging.biteshark.live.conf.template` (or mark deprecated with a header banner), set `TimeoutStopSec=35` in `truckly-staging-worker.service`, and verify all `fs.readdirSync("migrations")` `.sql` files + `lib/customer-profile.js` in `scripts/build-linux-release-tarball.cjs`.
15. **Specific Implementation Steps**:
   - Port `/debug-admin.{js,css}` and `/api/onboarding/evidence` (`client_max_body_size 1m;`) blocks into `deploy/nginx/truckly-staging.conf.template`.
   - Change `TimeoutStopSec=15` to `TimeoutStopSec=35` in `deploy/systemd/truckly-staging-worker.service:15`.
   - In `scripts/build-linux-release-tarball.cjs:77-140`, dynamically include every `migrations/*.sql` file from the target git ref plus `lib/customer-profile.js` and `public/customer-profile.js` in `requiredEntries`.
16. **Dependencies / Prerequisites**: None.
17. **Regression Risks**: Check `tests/vps-platform-contract.test.cjs` and `tests/install-staging-release.test.cjs` for assertions on `deploy/` templates.
18. **Verification Steps**: Run `node tests/vps-platform-contract.test.cjs` and test `npm run build:release -- --ref HEAD --out-dir <scratch>`.
19. **Estimated Effort**: `S`
20. **Repair Priority**: `P3` (Linked Repair Tasks: [REP-019](09_PRIORITIZED_REPAIR_PLAN.md#rep-019))

---

<a id="aud-0038"></a>
### AUD-0038 — Malformed percent-encoding on /s/... throws uncaught URIError (HTTP 500 without no-referrer header), and public/sw.js open_url check allows protocol-relative "//"

1. **Finding ID**: `AUD-0038`
2. **Concise Title**: Malformed percent-encoding on /s/... throws uncaught URIError (HTTP 500 without no-referrer header), and public/sw.js open_url check allows protocol-relative "//"
3. **Severity**: **LOW**
4. **Category**: Runtime Error
5. **Confidence Level**: **Confirmed**
6. **Affected Subsystem**: S2: HTTP server core, routing, api/* handlers & DB adapter
7. **File Path & Relevant Line Numbers**: `server/app.js:1330-1360`, `public/sw.js:39-42`, `public/sw.js:64-71`
8. **What Is Wrong**: (1) `server/app.js:1332-1333, 1352` calls `decodeURIComponent(segs[1])` and `decodeURIComponent(segs[3])` on `/s/...` routes outside `try/catch`. Invalid UTF-8 percent sequences (e.g., `GET /s/%E0%A4%A`) throw `URIError` before `applyUnlistedSharedSecurityHeaders` runs, hitting the global `500` JSON error handler (`Referrer-Policy: same-origin` + `unhandled_request_error` incident noise) instead of the uniform neutral `404` page. (2) `public/sw.js:39, 64` checks `open_url.startsWith("/")` without `&& !open_url.startsWith("//")`, which `new URL("//...", self.location.origin)` resolves as cross-origin.
9. **Evidence**: `server/app.js:1332`: `rawToken: decodeURIComponent(segs[1])` (unwrapped, unlike `resolveSafePublicFile` at `lines 421-425`). `public/sw.js:64-70`: `typeof notifData.open_url === "string" && notifData.open_url.startsWith("/")` -> `new URL(targetRelUrl, self.location.origin).href`.
10. **Expected / Intended Behavior**: Malformed percent-encoded `/s/...` URLs must safely decode to `""` and return the neutral `404` response with `Referrer-Policy: no-referrer`, and `public/sw.js` should require `open_url.startsWith("/") && !open_url.startsWith("//")` (plus `parsed.origin === self.location.origin`).
11. **Actual Behavior / Code Condition**: Scanner requests to `/s/%...` trigger `500` responses without `no-referrer` headers and pollute error diagnostics.
12. **User or Operational Impact**: Scanner-triggered `500` diagnostic noise and minor referrer-header/SW URL-validation defense-in-depth gaps.
13. **Root Cause**: Direct `decodeURIComponent` call on raw `parsedUrl.pathname` segments.
14. **Recommended Remediation**: Add a `safeDecodeUriSegment` helper in `server/app.js:1330-1360` and reject `//` protocol-relative paths in `public/sw.js`.
15. **Specific Implementation Steps**:
   - In `server/app.js:1328-1360`, wrap `decodeURIComponent` in `safeDecodeSegment(s)` returning `""` on `URIError`.
   - In `public/sw.js:39, 64, 70`, require `!open_url.startsWith("//")` and verify `new URL(targetRelUrl, self.location.origin).origin === self.location.origin`.
16. **Dependencies / Prerequisites**: None.
17. **Regression Risks**: None; valid `base64url` share tokens contain no `%` characters.
18. **Verification Steps**: Request `GET /s/%E0%A4%A` in `tests/customer-profile-sharing.integration.cjs` and assert `404` with `Referrer-Policy: no-referrer`.
19. **Estimated Effort**: `S`
20. **Repair Priority**: `P3` (Linked Repair Tasks: [REP-027](09_PRIORITIZED_REPAIR_PLAN.md#rep-027))

---

<a id="aud-0039"></a>
### AUD-0039 — Admin Portal CSS class mismatches, Ownership_summary typo, unpaginated 100-vendor cap, double GET on application click, and 3 modals bypassing focus trapping

1. **Finding ID**: `AUD-0039`
2. **Concise Title**: Admin Portal CSS class mismatches, Ownership_summary typo, unpaginated 100-vendor cap, double GET on application click, and 3 modals bypassing focus trapping
3. **Severity**: **LOW**
4. **Category**: Broken Feature
5. **Confidence Level**: **Confirmed**
6. **Affected Subsystem**: S8: Role-experience, Admin Portal, Style Guide & Profile UI
7. **File Path & Relevant Line Numbers**: `public/admin.html:534-538`, `public/admin.html:910-913`, `public/admin.html:999-1045`, `public/admin.js:685-687`, `public/admin.js:1124-1127`, `public/admin.js:1430-1600`, `public/admin.js:3812-3818`, `public/admin.js:4740-4795`, `public/admin.css:636-830`
8. **What Is Wrong**: (1) `public/admin.html` and `public/admin.js` emit CSS classes `.subtab-bar` (`admin.html:534`), `.pagination-bar` (`admin.html:911`), `.pill-err` (`admin.js:1125`), and `.form-grid-2` (`admin.js:3814`), whereas `public/admin.css` defines `.subtabs` (`line 745`), `.pager-bar` (`line 824`), `.pill-danger` (`line 636`), and `.form-row-2` (`line 680`). (2) `public/admin.js:685` checks `app.Ownership_summary || app.public_summary` (capitalized typo `Ownership_summary`, and omits displaying `app.ownership_statement` / `app.permit_or_license_summary` clearly if `public_summary` is empty). (3) `#featureConfirmModal`, `#invActionModal`, and `#invHistoryModal` toggle `modal.hidden = false` directly instead of calling `adminOpenModal(...)` (`admin.js:74`), bypassing keyboard focus trapping and focus restoration. (4) Vendor catalog in `admin.js` hardcodes `limit=100` without pagination controls, and clicking an onboarding application row re-fetches `loadApplications()` over the network unnecessarily.
9. **Evidence**: `wave2_verified.json` (`adminWebsiteUrl` & `adminCssChecks`): `admin.html:534` (`subtab-bar`), `911` (`pagination-bar`); `admin.js:685` (`app.Ownership_summary`), `1125` (`pill-err`), `3814` (`form-grid-2`), `1433/1548/4742` (`modal.hidden = false` instead of `adminOpenModal`).
10. **Expected / Intended Behavior**: HTML/JS class names in `/admin` must match `public/admin.css`, all `/admin` modals must open/close via `adminOpenModal` / `adminCloseModal` for WCAG 2.1 AA focus management, and vendor list pagination should support >100 vendors.
11. **Actual Behavior / Code Condition**: Support subtabs, diagnostic pagination bars, failed invitation delivery pills, and diagnostic form grids render unstyled, and 3 admin confirmation/history modals lack keyboard focus traps.
12. **User or Operational Impact**: Degraded visual styling and keyboard accessibility in `/admin`.
13. **Root Cause**: Incremental UI additions to `public/admin.html` and `public/admin.js` guessed class names without checking `public/admin.css` or `adminOpenModal`.
14. **Recommended Remediation**: Align class names across `public/admin.html`, `public/admin.js`, and `public/admin.css`, fix `app.Ownership_summary`, route the 3 modals through `adminOpenModal`/`adminCloseModal`, and avoid redundant `loadApplications()` network re-fetches on row selection.
15. **Specific Implementation Steps**:
   - Replace `pill-err` -> `pill-danger` (`public/admin.js:1125`), `form-grid-2` -> `form-row-2` (`admin.js:3814`), `subtab-bar` -> `subtabs` (`admin.html:534`), and `pagination-bar` -> `pager-bar` (`admin.html:911`), and fix `app.Ownership_summary` (`admin.js:685`).
   - Route `#featureConfirmModal`, `#invActionModal`, and `#invHistoryModal` open/close handlers through `adminOpenModal` and `adminCloseModal` (`public/admin.js:1433, 1548, 4742`).
   - Re-render the selected application detail pane in-memory on row click rather than issuing a duplicate `GET /api/admin/applications` request.
16. **Dependencies / Prerequisites**: Check `tests/admin-portal-browser.e2e.cjs` and `tests/feature-controls-browser.e2e.cjs` for any selector references to `.subtab-bar` or `.pagination-bar` (keep alias classes in `admin.css` if E2E selectors target them!).
17. **Regression Risks**: Adding `.subtab-bar` / `.pagination-bar` / `.pill-err` / `.form-grid-2` as selector aliases in `public/admin.css` fixes styling with zero risk to existing E2E DOM queries.
18. **Verification Steps**: Run `npm run test:admin:browser` and `tests/reliability-accessibility-browser.e2e.cjs`.
19. **Estimated Effort**: `S`
20. **Repair Priority**: `P3` (Linked Repair Tasks: [REP-027](09_PRIORITIZED_REPAIR_PLAN.md#rep-027))

---

<a id="aud-0040"></a>
### AUD-0040 — Duplicate Editorial Stories & Sonoma town lists have drifted across server/client, Discover strip skips vendor availability, and exploration fetch lacks timeouts

1. **Finding ID**: `AUD-0040`
2. **Concise Title**: Duplicate Editorial Stories & Sonoma town lists have drifted across server/client, Discover strip skips vendor availability, and exploration fetch lacks timeouts
3. **Severity**: **LOW**
4. **Category**: Duplicate Implementation
5. **Confidence Level**: **Confirmed**
6. **Affected Subsystem**: S4: Customer profile, Greatest Hits sharing, exploration & photos
7. **File Path & Relevant Line Numbers**: `lib/editorial-stories.js:85-92`, `public/exploration-client.js:15-166`, `public/exploration-client.js:278-364`, `public/local-guides.js:220-255`, `lib/customer-profile.js:67-84`, `lib/customer-exploration.js:109-128`, `public/customer-profile.js:388-393`
8. **What Is Wrong**: (1) `public/exploration-client.js:15-166` duplicates all 5 stories from `lib/editorial-stories.js` with drifted `story_mitote_food_park` clue copy (`"SHARED TABLES"` vs `"ROSES & ROTATING TRUCKS"`) and hardcoded `business_available: true`, and `renderDiscoverStoriesStrip` (`public/local-guides.js:220-255`) renders directly from `CANONICAL_STORIES` without checking `/api/stories` or active `trucks` discoverability. (2) `SUPPORTED_SONOMA_TOWNS` (`lib/customer-profile.js:67-84`) includes `"Graton"` but rejects `"Geyserville"` and `"Penngrove"`, whereas `CANONICAL_TOWNS_MAP` (`lib/customer-exploration.js:109-128`) includes `"Geyserville"` and `"Penngrove"` and omits `"Graton"`. (3) `exploration-client.js:278-364` (`apiRequest`) lacks `AbortController` timeouts (unlike `profile-client.js`), and `public/customer-profile.js:390` says `"View all & edit notes in Visit Journal →"` although visit notes have no edit endpoint.
9. **Evidence**: `lib/editorial-stories.js:85-90` vs `public/exploration-client.js:98-104`. `lib/customer-profile.js:67-84` vs `lib/customer-exploration.js:109-128`. `public/customer-profile.js:390`.
10. **Expected / Intended Behavior**: Story copy and Sonoma town allowlists should be consistent across server and client, `#discoverStoriesStrip` must suppress CTAs for hidden/deactivated vendors, `exploration-client.js` requests must enforce bounded timeouts, and UI copy should accurately state `"View all & manage entries in Visit Journal →"`.
11. **Actual Behavior / Code Condition**: Users cannot pick `Geyserville` or `Penngrove` as their profile `preferred_town` despite trailing/exploring them, hidden story businesses keep active detail buttons on the Discover strip, and hung exploration requests wait indefinitely.
12. **User or Operational Impact**: Inconsistent town validation, drifted UI copy, and hung spinner states on network stalls.
13. **Root Cause**: Client/server constants were duplicated across PRs without extracting shared Sonoma town constants or wiring `renderDiscoverStoriesStrip` to `fetchStories()`.
14. **Recommended Remediation**: Unify Sonoma County town constants (`Graton`, `Geyserville`, `Penngrove`, etc.), sync `CANONICAL_STORIES` + filter `renderDiscoverStoriesStrip` against active `trucks`, add `AbortController` timeouts to `public/exploration-client.js`, and update `public/customer-profile.js:390` copy.
15. **Specific Implementation Steps**:
   - Extract shared Sonoma County towns into a single module imported by both `lib/customer-exploration.js` and `lib/customer-profile.js`.
   - Align `CANONICAL_STORIES` in `public/exploration-client.js` with `lib/editorial-stories.js`, filter `renderDiscoverStoriesStrip` (`public/local-guides.js:228`) against `trucks.some(t => t.id === s.vendor_id)`, and add an `AbortController` timeout (`12s` reads / `25s` uploads) in `exploration-client.js:278-364`.
   - Update `public/customer-profile.js:390` copy to `"View all & manage entries in Visit Journal →"`.
16. **Dependencies / Prerequisites**: None.
17. **Regression Risks**: Preserve `clue.icon` on `CANONICAL_STORIES` if `public/street-whispers.js` reads it synchronously at boot.
18. **Verification Steps**: Verify `POST /api/me/preferences` accepts `"Geyserville"` and `"Penngrove"`, and run `tests/customer-exploration-browser.e2e.cjs`.
19. **Estimated Effort**: `S`
20. **Repair Priority**: `P3` (Linked Repair Tasks: [REP-030](09_PRIORITIZED_REPAIR_PLAN.md#rep-030))

---

<a id="aud-0041"></a>
### AUD-0041 — Code-registry SQL scanner misses 5 CREATE INDEX definitions lacking whitespace before "(", and scripts/dev-server.cjs is an outdated pre-017 mock server

1. **Finding ID**: `AUD-0041`
2. **Concise Title**: Code-registry SQL scanner misses 5 CREATE INDEX definitions lacking whitespace before "(", and scripts/dev-server.cjs is an outdated pre-017 mock server
3. **Severity**: **LOW**
4. **Category**: Documentation
5. **Confidence Level**: **Confirmed**
6. **Affected Subsystem**: S10: Deploy, systemd, Nginx, CI/CD, dependencies & code-registry
7. **File Path & Relevant Line Numbers**: `tools/code-registry/backend-db-analyzer.mjs:1771-1780`, `migrations/009_create_community_reviews.sql:19-20`, `migrations/011_vendor_authz_and_audit.sql:131-198`, `scripts/dev-server.cjs:1-120`
8. **What Is Wrong**: (1) `tools/code-registry/backend-db-analyzer.mjs:1773` uses `/...ON\s+(?:public\.)?"?([A-Za-z0-9_]+)"?\s+([^;]+);/gi` (`\s+` after table name), failing to parse 5 real PostgreSQL indexes written as `ON table(col)` without a space (`community_reviews_published_idx`, `community_reviews_author_idx`, `vendor_memberships_user_idx`, `audit_logs_vendor_idx`, `audit_logs_actor_idx`) and omitting them from `docs/engineering/generated/SCHEMA-INVENTORY.md`. (2) `scripts/dev-server.cjs` (`npm run dev:mock`) is a pre-Migration-017 in-memory mock server that lacks OTP `/api/auth/*`, `/api/account/context`, `/api/features`, `/api/me/*`, and `/api/admin/*`, breaking modern frontend flows when started.
9. **Evidence**: `wave2_verified.json` (`indexesMissingFromSchemaInventory`): all 5 missing indexes lack a space between table name and `(`. `scripts/dev-server.cjs` mocks only early `api/trucks`, `api/favorites`, `api/bookings`, `api/pager`, and `api/community`.
10. **Expected / Intended Behavior**: `backend-db-analyzer.mjs:1773` should use `\s*` before `(` / `USING` so `SCHEMA-INVENTORY.md` indexes 100% of SQL indexes, and `scripts/dev-server.cjs` (`package.json` `dev:mock`) should clearly warn at startup that it is a legacy catalog-only preview (pointing developers to `server/index.js` + PostgreSQL per `START-HERE.md`).
11. **Actual Behavior / Code Condition**: `SCHEMA-INVENTORY.md` under-counts indexes on `community_reviews`, `vendor_memberships`, and `audit_logs`, and `npm run dev:mock` serves broken auth/profile/admin UX.
12. **User or Operational Impact**: Incomplete generated schema documentation and confusing local developer simulator behavior.
13. **Root Cause**: Regex required `\s+` before `(` in `CREATE INDEX`, and `scripts/dev-server.cjs` was not updated after standalone VPS runtime `server/index.js` replaced serverless dev workflows.
14. **Recommended Remediation**: Change `\s+([^;]+);` to `(?:\s+|(?=\())([^;]+);` in `tools/code-registry/backend-db-analyzer.mjs:1773`, run `npm run registry:docs`, and add a clear deprecation/scope banner to `scripts/dev-server.cjs`.
15. **Specific Implementation Steps**:
   - Update `tools/code-registry/backend-db-analyzer.mjs:1773` regex to `(?:\s+|(?=\())([^;]+);`, then run `npm run registry:docs && npm run registry:validate && npm run test:registry`.
   - Print an explicit startup notice in `scripts/dev-server.cjs` clarifying it is a legacy static-catalog mock and recommending `node server/index.js` for authenticated/admin/profile testing.
16. **Dependencies / Prerequisites**: Regenerate `docs/engineering/generated/*` via `npm run registry:docs` in the same commit.
17. **Regression Risks**: Verify `node tools/code-registry/cli.mjs validate --verify-db` in CI continues matching `pg_catalog` indexes.
18. **Verification Steps**: Run `npm run registry:docs && npm run registry:validate && npm run test:registry` and verify `vendor_memberships_user_idx` appears in `SCHEMA-INVENTORY.md`.
19. **Estimated Effort**: `S`
20. **Repair Priority**: `P3` (Linked Repair Tasks: [REP-031](09_PRIORITIZED_REPAIR_PLAN.md#rep-031))

---

<a id="aud-0042"></a>
### AUD-0042 — 19 of 41 test suites lack package.json scripts, tests/staging-http-gates.cjs is completely unreferenced, TESTING.md omits 4 suites, and test-customer header comments are stale

1. **Finding ID**: `AUD-0042`
2. **Concise Title**: 19 of 41 test suites lack package.json scripts, tests/staging-http-gates.cjs is completely unreferenced, TESTING.md omits 4 suites, and test-customer header comments are stale
3. **Severity**: **LOW**
4. **Category**: Testing
5. **Confidence Level**: **Confirmed**
6. **Affected Subsystem**: S11: Test suite, tooling & verification gates
7. **File Path & Relevant Line Numbers**: `package.json:6-38`, `tests/staging-http-gates.cjs:1-60`, `docs/engineering/TESTING.md:1-88`, `tests/admin-test-customer.integration.cjs:1-15`
8. **What Is Wrong**: (1) Out of `41` test files in `tests/`, `19` have no `npm run` script in `package.json` (including critical suites `urgent-pilot-security.integration.cjs`, `feature-controls.integration.cjs`, `diagnostics-and-reliability.integration.cjs`, `invitation-workflow.integration.cjs`, `support-feedback.integration.cjs`, and `customer-exploration.integration.cjs`), and `npm test` runs only 2 lightweight non-DB scripts (`test:pager` + `test:listings`). (2) `tests/staging-http-gates.cjs` (`912` lines, superseded by `tests/vps-staging-gates.cjs`) is unreferenced in `package.json`, `.github/workflows/truckly-source-review.yml`, and `docs/engineering/TESTING.md`. (3) `docs/engineering/TESTING.md` omits `style-guide.test.cjs`, `style-guide-admin.integration.cjs`, `style-guide-admin-browser.e2e.cjs`, and `vps-staging-gates.cjs`. (4) `tests/admin-test-customer.integration.cjs:5-6` still states `Admin: Mod` and `BITESHARK_ENV=production` are rejected (`403`), contradicting lines `301-305`.
9. **Evidence**: `wave2_verified.json` (`testInventory`): `19` files have `inPackageJson: false`; `tests/staging-http-gates.cjs` has `inPackageJson: false, inCi: false, inTestingDoc: false`; `4` files have `inTestingDoc: false`.
10. **Expected / Intended Behavior**: `package.json` should expose consistent `test:*` scripts (including `test:unit` for fast DB-free checks and `test:integration` / `test:e2e` runners), `docs/engineering/TESTING.md` should list all active suites, `tests/admin-test-customer.integration.cjs` header comments should match actual behavior, and `tests/staging-http-gates.cjs` should be archived or documented.
11. **Actual Behavior / Code Condition**: Developers running `npm test` execute <5% of the repository's verification suites and must inspect `.github/workflows/truckly-source-review.yml` to discover 19 critical test files.
12. **User or Operational Impact**: Developers can easily miss relevant local integration/security suites before pushing.
13. **Root Cause**: Newer test files were wired directly into `.github/workflows/truckly-source-review.yml` without adding `package.json` scripts or updating `TESTING.md`.
14. **Recommended Remediation**: Add `test:unit` (all fast DB-free tests: `code-registry`, `style-guide`, `pager-demo`, `listing-verification`, `map-resilience`, `vps-platform-contract`, `staging2-ctl-security`) and missing domain `test:*` scripts in `package.json`, update `docs/engineering/TESTING.md` and `tests/admin-test-customer.integration.cjs:1-15`, and archive/document `tests/staging-http-gates.cjs`.
15. **Specific Implementation Steps**:
   - Add `test:unit` and `test:exploration`, `test:feature-controls`, `test:diagnostics`, `test:invitations`, `test:support`, `test:security` scripts in `package.json`.
   - Update `docs/engineering/TESTING.md` with the 4 missing suites and clarify whether `tests/staging-http-gates.cjs` is superseded by `tests/vps-staging-gates.cjs`.
   - Update `tests/admin-test-customer.integration.cjs:1-15` comments to reflect Platform-Admin (`Top` + `Mod`) and production-env availability.
16. **Dependencies / Prerequisites**: None.
17. **Regression Risks**: Keep `npm test` fast and DB-free (or alias `npm test` to `npm run test:unit`) so environments without PostgreSQL do not break.
18. **Verification Steps**: Run `npm run test:unit` and `npm run registry:validate`.
19. **Estimated Effort**: `S`
20. **Repair Priority**: `P3` (Linked Repair Tasks: [REP-031](09_PRIORITIZED_REPAIR_PLAN.md#rep-031))

---

<a id="aud-0043"></a>
### AUD-0043 — Committed legacy Hatchable artifacts (truckly-v63.zip, truckly-data.sql.gz, stale public/build.json), unused JS/CLI symbols, and stale migration counts in README/TECH_MAP

1. **Finding ID**: `AUD-0043`
2. **Concise Title**: Committed legacy Hatchable artifacts (truckly-v63.zip, truckly-data.sql.gz, stale public/build.json), unused JS/CLI symbols, and stale migration counts in README/TECH_MAP
3. **Severity**: **LOW**
4. **Category**: Dead Code
5. **Confidence Level**: **Confirmed**
6. **Affected Subsystem**: S10: Deploy, systemd, Nginx, CI/CD, dependencies & code-registry
7. **File Path & Relevant Line Numbers**: `public/build.json:1-8`, `README.md:28-30`, `TECH_MAP.md:34-36`, `lib/support-tickets.js:20-28`, `lib/editorial-stories.js:148-155`, `public/local-guides.js:5-8`, `tools/style-guide/cli.mjs:15-35`
8. **What Is Wrong**: (1) Historical pre-VPS artifacts remain tracked at the repository root and `public/`: `truckly-v63.zip` (`234,146` bytes), `truckly-data.sql.gz` (`653` bytes), and `public/build.json` (`"base_release": 77, "functions": 27, "migrations": 10`, publicly served at `/build.json` via `server/app.js:123` with zero readers!). (2) Confirmed unused symbols exist in first-party modules: `VENDOR_SUPPORT_CATEGORIES` (`lib/support-tickets.js:21`), `EDITORIAL_STORIES_BY_ID` & `EDITORIAL_STORIES_BY_VENDOR_ID` (`lib/editorial-stories.js:148-154`), `LEGACY_DISH_NOTEBOOK_KEY` (`public/local-guides.js:6`), and the parsed-but-ignored `--decisions` CLI flag in `tools/style-guide/cli.mjs`. (3) `README.md:29` cites migrations `001`–`028` and `TECH_MAP.md:35` cites `migrations/001` through `021` (actual: `001`–`029`).
9. **Evidence**: `public/build.json` reports `"migrations": 10` (`2026-11-16`). Root `git ls-files` includes `truckly-v63.zip` and `truckly-data.sql.gz` (already excluded from release tarballs in `scripts/build-linux-release-tarball.cjs`). `README.md:29` (`001`–`028`); `TECH_MAP.md:35` (`001` through `021`).
10. **Expected / Intended Behavior**: Archive or remove `truckly-v63.zip`, `truckly-data.sql.gz`, and stale `public/build.json` (after checking external monitors), wire `--decisions` in `tools/style-guide/cli.mjs`, clean up confirmed unused internal constants with `npm run registry:docs`, and update `README.md` / `TECH_MAP.md` to reference `docs/engineering/MIGRATIONS.md` (`001`–`029`).
11. **Actual Behavior / Code Condition**: Public `GET /build.json` advertises obsolete pre-VPS build metadata (`10` migrations), repo clones carry a 234 KB legacy zip archive, and `README.md` / `TECH_MAP.md` understate schema migrations.
12. **User or Operational Impact**: Minor repository bloat, misleading public `/build.json` metadata, and documentation drift.
13. **Root Cause**: Legacy Hatchable export files and incremental dead exports accumulated across rapid feature releases.
14. **Recommended Remediation**: Update `README.md` and `TECH_MAP.md`, wire `--decisions` in `tools/style-guide/cli.mjs`, and remove `truckly-v63.zip`, `truckly-data.sql.gz`, `public/build.json` (plus `server/app.js:123` entry), and unused constants in a dedicated Phase C cleanup PR once verified.
15. **Specific Implementation Steps**:
   - Confirm no external uptime probe fetches `/build.json` (probes should use `/api/healthz` and `/api/readyz`), then remove `public/build.json` + its `NO_CACHE_STATIC_FILES` entry in `server/app.js:123`, `truckly-v63.zip`, and `truckly-data.sql.gz`.
   - Pass the parsed `--decisions` path into `loadStyleGuideInputs` in `tools/style-guide/cli.mjs`, and remove `VENDOR_SUPPORT_CATEGORIES`, `EDITORIAL_STORIES_BY_ID`, `EDITORIAL_STORIES_BY_VENDOR_ID`, and `LEGACY_DISH_NOTEBOOK_KEY` followed by `npm run registry:docs && npm run registry:validate`.
   - Update `README.md:29` and `TECH_MAP.md:35` to reflect Migrations `001`–`029` and Customer Exploration/Profile/Style Guide modules.
16. **Dependencies / Prerequisites**: Check `tests/listing-verification.cjs` and `tests/vps-platform-contract.test.cjs` before deleting `public/build.json`!
17. **Regression Risks**: Verify `tests/listing-verification.cjs` does not read `public/build.json` before removing it (`npm run registry:locate -- build.json`).
18. **Verification Steps**: Run `npm run test:unit`, `npm run registry:docs`, and `npm run registry:validate`.
19. **Estimated Effort**: `S`
20. **Repair Priority**: `P4` (Linked Repair Tasks: [REP-032](09_PRIORITIZED_REPAIR_PLAN.md#rep-032))

---

## INFO Findings (1)

<a id="aud-0044"></a>
### AUD-0044 — Single-node 1-vCPU / 961 MiB VPS co-tenancy constraints, per-process in-memory rate limiters, and intentionally unfinished 103-item Style Guide

1. **Finding ID**: `AUD-0044`
2. **Concise Title**: Single-node 1-vCPU / 961 MiB VPS co-tenancy constraints, per-process in-memory rate limiters, and intentionally unfinished 103-item Style Guide
3. **Severity**: **INFO**
4. **Category**: Architecture
5. **Confidence Level**: **Confirmed**
6. **Affected Subsystem**: S10: Deploy, systemd, Nginx, CI/CD, dependencies & code-registry
7. **File Path & Relevant Line Numbers**: `deploy/systemd/truckly-staging-api.service:18-24`, `deploy/systemd/biteshark-staging2-api.service:18-24`, `server/app.js:260-320`, `docs/engineering/style-guide/COMPLETION-REMINDER.md:1-60`
8. **What Is Wrong**: Informational architectural constraints for operators and future agents: (1) Primary staging (`MemoryMax=192M`, `--max-old-space-size=128`), worker (`MemoryMax=128M`), secondary staging2 (`MemoryMax=160M`, `--max-old-space-size=96`), PostgreSQL 16, and Nginx share a single 1-vCPU / 961 MiB VPS—meaning synchronous CPU/memory spikes (like uncached 18-file Style Guide renders or concurrent `sharp` decodes without `sharp.concurrency(1)`) directly contend for scarce RAM; (2) HTTP/diagnostics rate limiters in `server/app.js` are in-memory `Map`s that reset on service restart (acceptable for single-process systemd units, but non-shared if horizontally scaled later); and (3) `docs/engineering/style-guide/decisions.json` is intentionally unfinished (`103` decisions tracked via `/admin#style-guide`) and must never be auto-filled by coding agents (`AGENTS.md`).
9. **Evidence**: `truckly-staging-api.service:12, 20` (`--max-old-space-size=128`, `MemoryMax=192M`), `biteshark-staging2-api.service:12, 20` (`--max-old-space-size=96`, `MemoryMax=160M`), `docs/engineering/style-guide/COMPLETION-REMINDER.md`.
10. **Expected / Intended Behavior**: Preserve `sharp.cache(false)` + `sharp.concurrency(1)`, keep `DB_POOL_MAX <= 8`, avoid adding heavy dependencies or multi-connection `Promise.all` fan-outs (`AUD-0033`), and upscale VPS RAM (`>= 2–4 GiB`) before public production launch.
11. **Actual Behavior / Code Condition**: Well-engineered memory bounds (`MemoryMax`, `TasksMax`, `sharp.cache(false)`) protect the 961 MiB staging host today, but leave tight headroom during concurrent admin/photo operations.
12. **User or Operational Impact**: Operational planning guidance prior to production cutover; no immediate code defect beyond `AUD-0031` and `AUD-0033`.
13. **Root Cause**: Intentional cost-efficient staging consolidation on a single Linode VPS.
14. **Recommended Remediation**: Maintain strict memory/pool discipline in code (`REP-028`, `REP-029`), document VPS sizing prerequisites (`>= 2 GiB` dedicated host + PostgreSQL-backed rate limits if multi-worker) in launch readiness checklists, and continue recording Style Guide decisions only from explicit team input.
15. **Specific Implementation Steps**:
   - No immediate code change required beyond `REP-028` (Style Guide render memoization) and `REP-029` (single-connection profile transactions); evaluate dedicated >= 2 GiB production host sizing prior to apex `biteshark.live` launch.
16. **Dependencies / Prerequisites**: None.
17. **Regression Risks**: None.
18. **Verification Steps**: Monitor `systemctl status truckly-staging-api biteshark-staging2-api` memory high-water marks during staging verification.
19. **Estimated Effort**: `S`
20. **Repair Priority**: `P4` (Linked Repair Tasks: None (informational architectural constraint))

---

