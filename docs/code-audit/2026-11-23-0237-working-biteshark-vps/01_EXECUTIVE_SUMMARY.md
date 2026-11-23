# 01 — Executive Summary

- **Repository**: `https://github.com/yamanalmasaleha-png/trukly-.git` (BiteShark — Sonoma County Mobile Food Discovery, Pickup Pager, Exploration & Governance Platform)
- **Audited Branch**: `working/biteshark-vps` *(user-confirmed target after Phase 0 verified that a literal branch named `working-` does not exist locally or on `origin`)*
- **Audited Commit SHA**: `f0e5e5deedc7636f448e1b0d629ceb1787d79944` (`2026-11-23`)
- **Audit Mode**: **Strict Read-Only Audit** — zero application, schema, configuration, or deployment files were modified.
- **Audit Completion Status**: **Complete** across all 11 subsystems (`S1`–`S11`) and all `361` tracked files (`232` first-party non-doc/non-vendor code files totaling `125,575` lines).

---

## Overall Repository Health Assessment

BiteShark (`working/biteshark-vps`) has evolved from an early serverless prototype into a substantive, self-hosted Node.js 22 + PostgreSQL 16 + Nginx + systemd platform with unusually strong engineering foundations in several core areas:

- **Strong Architectural Pillars**: Zero-framework Node HTTP server with strict payload caps (`64 KiB` JSON default, `8 MiB` photo envelope), `__Host-` session cookies, same-origin CSRF enforcement, deterministic `auth_users -> auth_sessions` `FOR SHARE` transaction locking (`lib/db-tx.js`), 256-bit SHA-256 token hashing for sessions/invitations/shares, `sharp` full-decode + EXIF/GPS stripping + `0600` confined photo storage (`lib/photo-storage.js`), `0` `npm audit` dependency vulnerabilities across minimal production packages (`pg`, `sharp`, `cookie`, `otplib`), and an AST-backed code/schema registry (`tools/code-registry/`).
- **Primary Vulnerability & Debt Pattern**: Rapid vertical feature expansion across Migrations `018`–`029` (Admin Governance, Feature Controls, Diagnostics, Support Tickets, Test Customer Sandbox, Customer Exploration, Private Profile & Unlisted Sharing, and the Style Guide Admin Workspace) accumulated inside large imperative modules—most notably `server/admin-routes.js` (`8,331` lines), `public/admin.js` (`5,274` lines), and `lib/customer-profile.js` (`4,475` lines). Because cross-cutting invariants (role re-verification, `feature_controls` fallback state, `BITESHARK_PAUSE_WRITES`, `X-BiteShark-Viewpoint: preview`, moderation suppression, and retention cleanup) were wired handler-by-handler rather than declaratively, **targeted authorization bypasses, fail-open fallback paths, silent CI assertion skips, and state-machine edge cases** emerged at subsystem seams.

The codebase does **not** require a rewrite. Addressing the **4 `CRITICAL`** and **16 `HIGH`** findings via small, surgical, regression-tested patches (`Phase A` and `Phase B` in [09_PRIORITIZED_REPAIR_PLAN.md](09_PRIORITIZED_REPAIR_PLAN.md)) will bring security, operational resilience, and feature integrity into alignment prior to any public apex (`biteshark.live`) launch.

---

## Findings Summary by Severity

| Severity | Count | Confidence Breakdown | Typical Impact in BiteShark |
|---|---:|---|---|
| **CRITICAL** | **4** | `4` Confirmed | `Admin: Mod` -> `Admin: Top` privilege escalation; permanent human `Admin: Top` lockout vector; fail-open `feature_controls` exposing `hidden`/`staff_beta`/`/s/<token>` surfaces; global write-outage self-DoS on `PAUSE_WRITES=favorites`. |
| **HIGH** | **16** | `16` Confirmed | Shared-collection moderation suppression bypasses; `< 14` sharing-gate rollback retry; broken hidden-profile share revocation UI; `Admin: Mod` customer-email `ILIKE` oracle & PII leaks; untrusted diagnostic eviction wiping security links + regex scrubber gaps; unpinned external CDN Leaflet script without SRI/CSP; 14 non-RLS tables; concurrent Style Guide `push` data loss; unenforced 90-day evidence retention; dead worker batch-failure alerts; poisoned `pg.Pool` clients on failed `ROLLBACK`; `staging2` systemd `EROFS` & CI `push` diff bypass. |
| **MEDIUM** | **16** | `16` Confirmed | `hasCustomerProfileSurface()` checking nonexistent `public/profile.html` (hiding UI + silently skipping CI profile isolation assertions); sandbox overlay `/admin` `403`/`404` collisions; unrate-limited bookings starving `LIMIT 25` owner queue; sliding-window cookie/DB desync; soft-deleted `idempotency_key` `23505` `500`s; disconnected `/api/me/shares/update-settings` & `admin_notification_outbox`; `pager.js` off-by-one step announcements; 4x DB connection fan-out in `getPrivateOwnerProfile`; `8,331`-LOC god-router complexity. |
| **LOW** | **7** | `7` Confirmed | Legacy Nginx/worker/tarball config drift; `/s/%...` `URIError` `500`; `/admin` CSS class mismatches & 3 modals bypassing focus traps; drifted Sonoma town & story lists; SQL index parser regex missing 5 indexes; 19 test suites missing `package.json` scripts; `235 KB` legacy Hatchable archives & stale `/build.json`. |
| **INFO** | **1** | `1` Confirmed | Single-node 1-vCPU / 961 MiB VPS co-tenancy constraints, per-process rate-limit maps, and intentionally unfinished 103-decision Style Guide governance. |
| **Total** | **44** | **44 Confirmed** | Full evidence in [03_COMPLETE_FINDINGS.md](03_COMPLETE_FINDINGS.md) and [findings.json](findings.json). |

---

## Most Consequential Findings & Risks

1. **Privilege Escalation in Style Guide Governance ([AUD-0001](03_COMPLETE_FINDINGS.md#aud-0001), `CRITICAL`)**: `POST /api/admin/style-guide/save` checks `u.status === 'approved'` *before* `.trim()` (`"approved "` bypasses `reverifyPlatformAdminInTx(minRole: 'top')`), inherits `prevDec.status` (`'approved'`) when `status` is omitted, and allows `Admin: Mod` to overwrite or clear Top-approved decisions—while `POST /api/admin/style-guide/push` ([AUD-0013](03_COMPLETE_FINDINGS.md#aud-0013), `HIGH`) overwrites `workspace-state.json` across 7–10 slow GitHub API calls, losing concurrent saves.
2. **Synthetic Sandbox Account Can Break Last-Human-Top Protection ([AUD-0002](03_COMPLETE_FINDINGS.md#aud-0002), `CRITICAL`)**: Promoting `usr_sa_top_admin_test_customer` (`*.invalid`) via `/api/admin/accounts/role` satisfies `protect_last_top_admin()`, permitting the last real human `Admin: Top` to be demoted/disabled (permanent human lockout) and crashing `GET /api/admin/test-customer` (`500 LAST_TOP_ADMIN_PROTECTED`).
3. **Fail-Open `feature_controls` Fallback ([AUD-0003](03_COMPLETE_FINDINGS.md#aud-0003), `CRITICAL`)**: Any DB read error OR a single unrecognized `feature_key` row after an application rollback sets `stateUntrusted = true`, discarding all `hidden` and `staff_beta` controls and failing **OPEN** across all `read_when_not_hidden` endpoints and live `/s/<token>` shares.
4. **Global Write-Pause Self-DoS & Incomplete Emergency Freeze ([AUD-0004](03_COMPLETE_FINDINGS.md#aud-0004), `CRITICAL` & [AUD-0014](03_COMPLETE_FINDINGS.md#aud-0014), `HIGH`)**: `api/favorites/toggle.js` uses unregistered scope `'favorites'`, causing `BITESHARK_PAUSE_WRITES=favorites` to trigger `failClosedAll` (`503` platform-wide), while `BITESHARK_PAUSE_WRITES=all` fails to pause 5 MiB photo uploads, exploration writes, onboarding evidence, or support issues, and 33 of 34 mutating routes in `server/admin-routes.js` ignore `X-BiteShark-Viewpoint: preview`.
5. **Moderation, Age-Gate & Hidden-Profile Privacy Gaps on Unlisted Sharing ([AUD-0005](03_COMPLETE_FINDINGS.md#aud-0005), [AUD-0006](03_COMPLETE_FINDINGS.md#aud-0006), [AUD-0007](03_COMPLETE_FINDINGS.md#aud-0007), [AUD-0015](03_COMPLETE_FINDINGS.md#aud-0015), `HIGH`)**: Owners can bypass `suppress_attachment` by re-attaching the same `source_photo_id` or updating shared collections; `< 14` birth-date submissions roll back without locking `ineligible_under_18`; `/s/<token>` ignores `staff_beta`; and hiding `customer_profile` renders `"0 active unlisted share links"` with zero revocation buttons while `/s/<token>` links remain live.

---

## Broken, Disconnected, or Disabled Functionality Highlights

- **Silently Skipped Sandbox Profile UI & CI Assertions ([AUD-0021](03_COMPLETE_FINDINGS.md#aud-0021))**: `hasCustomerProfileSurface()` checks nonexistent `public/profile.html` (`false`), hiding `/profile` sandbox buttons and causing `tests/admin-test-customer.integration.cjs` to silently skip all visit/collection/profile isolation assertions in CI.
- **Dead Push Failure Alerting ([AUD-0018](03_COMPLETE_FINDINGS.md#aud-0018))**: `api/pager/worker.js` and `scripts/run-pager-worker.cjs` check `out.failed` / `out.sent` instead of `out.failed_permanent` / `out.delivered`, permanently reporting `worker_status: "ok"` during 100% push failure.
- **Unenforced 90-Day Evidence Retention ([AUD-0016](03_COMPLETE_FINDINGS.md#aud-0016))**: `vendor_application_evidence.retention_expires_at` is never checked on download or purged by any worker, and `BITESHARK_PUSH_PROVIDER_MODE=disabled` skips outbox/rate-limit cleanup.
- **Disconnected Features ([AUD-0028](03_COMPLETE_FINDINGS.md#aud-0028), [AUD-0035](03_COMPLETE_FINDINGS.md#aud-0035))**: `POST /api/me/shares/update-settings` (`updateShareSettings`), `POST /api/admin/invitations/resend`, and `POST /api/admin/style-guide/reset` have zero UI callers; `admin_notification_outbox` is a write-only SQL table with zero readers; and 6 legacy `api/*` routes are preserved solely by `REGISTERED_DOMAIN_ROUTE_COUNT === 30`.

---

## Top 10 Recommended Actions (Immediate Priority Order)

1. **`REP-001` (`P0`, `M`)**: Fix `Admin: Mod` -> `Admin: Top` escalation in `lib/style-guide-admin.js`, serialize `workspace-state.json` writes across GitHub pushes, and stop resetting corrupt JSON to `emptyState` ([AUD-0001](03_COMPLETE_FINDINGS.md#aud-0001), [AUD-0013](03_COMPLETE_FINDINGS.md#aud-0013)).
2. **`REP-002` (`P0`, `S` ⚡)**: Block `usr_sa_top_admin_test_customer` from `platform_roles` in API + Migration `030` and make `GET /api/admin/test-customer` strictly read-only ([AUD-0002](03_COMPLETE_FINDINGS.md#aud-0002)).
3. **`REP-003` (`P0`, `M`)**: Ignore forward-compatible unknown `feature_key` rows without poisoning `feature_controls`, and fail **CLOSED** on gated/sharing surfaces when `stateUntrusted === true` ([AUD-0003](03_COMPLETE_FINDINGS.md#aud-0003)).
4. **`REP-004` + `REP-009` (`P0`/`P1`, `S`+`M`)**: Register `'favorites'` and missing scopes in `VALID_PAUSE_SCOPES`, wire `BITESHARK_PAUSE_WRITES=all` across photo/exploration/onboarding/issue writes, and enforce `X-BiteShark-Viewpoint: preview` once at the top of `server/admin-routes.js` ([AUD-0004](03_COMPLETE_FINDINGS.md#aud-0004), [AUD-0014](03_COMPLETE_FINDINGS.md#aud-0014)).
5. **`REP-005` + `REP-006` + `REP-014` (`P1`, `M`)**: Close shared-photo/content moderation bypasses, commit `ineligible_under_18` on `< 14` sharing-gate input, and call `listShares()` in the hidden `customer_profile` fallback UI so live links remain revocable ([AUD-0005](03_COMPLETE_FINDINGS.md#aud-0005), [AUD-0006](03_COMPLETE_FINDINGS.md#aud-0006), [AUD-0015](03_COMPLETE_FINDINGS.md#aud-0015)).
6. **`REP-008` + `REP-010` (`P1`, `M`)**: Close the `Admin: Mod` customer-email `ILIKE` oracle & invitation/audit telemetry leaks, isolate `browser_untrusted` diagnostic eviction from `server_verified` incidents, and fix underscore/cookie redaction regexes ([AUD-0008](03_COMPLETE_FINDINGS.md#aud-0008), [AUD-0009](03_COMPLETE_FINDINGS.md#aud-0009)).
7. **`REP-011` + `REP-012` (`P1`, `S` ⚡)**: Add SHA-384 SRI + non-blocking load (or local vendoring) to Leaflet CDN tags + HTML CSP headers, and filter hidden/deactivated vendors in `/api/community/list` and `/api/community/post` ([AUD-0010](03_COMPLETE_FINDINGS.md#aud-0010), [AUD-0011](03_COMPLETE_FINDINGS.md#aud-0011)).
8. **`REP-016` + `REP-017` + `REP-018` (`P1`, `S` ⚡)**: Re-throw `SessionEligibilityError` in profile/context routes + validate `related_review_id` in `POST /api/issues`, fix `failed_permanent`/`delivered` worker heartbeat keys, and pass `releaseErr` to `client.release(releaseErr)` on `ROLLBACK` failures ([AUD-0017](03_COMPLETE_FINDINGS.md#aud-0017), [AUD-0018](03_COMPLETE_FINDINGS.md#aud-0018), [AUD-0019](03_COMPLETE_FINDINGS.md#aud-0019)).
9. **`REP-015` + `REP-019` (`P1`, `M`)**: Enforce 90-day `vendor_application_evidence` retention + disabled-mode push cleanup, add `style-guide` `ReadWritePaths` to `biteshark-staging2-api.service`, commit `backup-staging2.sh`, and fix the CI `push` `RUNTIME_DIFF` bypass ([AUD-0016](03_COMPLETE_FINDINGS.md#aud-0016), [AUD-0020](03_COMPLETE_FINDINGS.md#aud-0020)).
10. **`REP-020` + `REP-029` (`P1`/`P2`, `M`)**: Fix `hasCustomerProfileSurface()` to un-skip CI sandbox profile assertions, and collapse `getPrivateOwnerProfile` from 4 parallel DB checkouts to 1 sequential transaction while delegating customer routes ahead of `loadAccessContext` ([AUD-0021](03_COMPLETE_FINDINGS.md#aud-0021), [AUD-0033](03_COMPLETE_FINDINGS.md#aud-0033)).

---

## Important Audit Limitations

- **No Live PostgreSQL or Headless Browser Execution on Local Windows Host**: Local Windows environment lacked a running `DATABASE_URL` or `@embedded-postgres` binary (`tests/install-staging-release.test.cjs` exited `1` for that exact environmental reason). Consequently, `7` DB-free unit/registry/security contract suites, `148`-file `node --check` syntax validation, `npm ls`, and `npm audit` were executed directly (`PASS`), while PostgreSQL integration and Playwright/CDP browser behaviors were evaluated via exhaustive static code/SQL/test inspection (with feature statuses conservatively labeled `Implemented (unverified)` where live DB/browser execution was not run in this audit turn). See [07_BUILD_TEST_AND_DEPENDENCY_REPORT.md](07_BUILD_TEST_AND_DEPENDENCY_REPORT.md) and [11_AUDIT_COVERAGE_AND_LIMITATIONS.md](11_AUDIT_COVERAGE_AND_LIMITATIONS.md).
