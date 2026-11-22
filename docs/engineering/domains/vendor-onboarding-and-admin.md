# Domain Map — Vendor Onboarding, Operations & Platform Administration

- **Authoritative Deep Dive**: [ADMIN_GOVERNANCE_AND_ONBOARDING.md](../../ADMIN_GOVERNANCE_AND_ONBOARDING.md) *(check [KNOWN-DRIFT.md](../KNOWN-DRIFT.md) §2.2 for 7 corrected details)*

## 1. Current Behavior
Manages vendor claim/new-listing applications with magic-byte-verified evidence uploads, vendor staff invitations and memberships, `#ownerScreen` vendor operations (profile, live location, schedule, catering request decisions, kitchen pagers), and the server-gated `/admin` portal (`Admin: Mod` vs `Admin: Top`, read-only Viewpoint preview, and audited `Top` Act-on-Behalf).

## 2. Entry Points & Key Symbols
- **Server**: `handleGovernanceApiRequest` ([server/admin-routes.js](../../../server/admin-routes.js)), `authorizeVendorOperation`, `evaluateEffectiveVendorRestrictions`, `recordAuditLog` ([lib/authz.js](../../../lib/authz.js)), `verifyEvidenceBufferAndMime` ([lib/admin-governance.js](../../../lib/admin-governance.js)), `api/owner/{profile,location,schedule,requests,stats,bookings}.js`.
- **Browser**: `#vendorIntroScreen`, `#vendorApplyModal`, `#inviteAcceptModal`, `syncOwnerTeamAndRestrictionUI` ([public/role-experience.js](../../../public/role-experience.js)); `#ownerScreen` ([public/app.js](../../../public/app.js)); `/admin` (`#sec-overview`, `#sec-applications`, `#sec-vendors`, `#sec-accounts`, `#sec-audit` in [public/admin.js](../../../public/admin.js)).

## 3. HTTP APIs & Database Tables
- **APIs**: `GET|POST /api/onboarding/{applications,evidence}`, `GET|DELETE /api/vendor/members`, `POST /api/vendor/staff-invitations`, `GET|POST /api/invitations/inspect`, `POST /api/invitations/accept`, `GET|POST /api/owner/*`, and `/api/admin/{overview,vendors,vendors/update,vendor-preview,applications,applications/decision,accounts,accounts/role,accounts/status,invitations,invitations/create,invitations/decision,invitations/resend,audit}`.
- **Tables**: `vendors`, `vendor_memberships`, `vendor_applications`, `vendor_application_evidence`, `vendor_status_history`, `platform_roles`, `platform_role_revocations`, `account_invitations`, `account_invitation_events`, `admin_bootstrap_grants`, `owner_profiles`, `owner_schedule`, `truck_settings`, `audit_logs`.

## 4. Permissions, Flags & Tests
- **Permissions**: Strict `Mod` vs `Top` split (`Mod` can recommend/request info and set `<= 72h` temp restrictions; `Top` required for final approvals, permanent restrictions, role grants, account status, and Act-on-Behalf). Last `Top` admin protected by `trg_protect_last_top_admin` + `trg_protect_last_top_admin_on_auth_users` (`026`).
- **Feature Flags**: `vendor_onboarding` (`enabled` | `paused` | `hidden`), `owner_menu_photo_upload` (read-only disclosure), `BITESHARK_PAUSE_WRITES=owner`.
- **Tests**: `tests/admin-governance.integration.cjs`, `tests/invitation-workflow.integration.cjs`, `tests/urgent-pilot-security.integration.cjs`, `tests/admin-portal-browser.e2e.cjs`, `tests/invitation-workflow-browser.e2e.cjs`, `tests/urgent-pilot-security-browser.e2e.cjs`.
- **Known Inconsistencies**: Clicking `.brand` opens `#ownerScreen` sample preview for guests (`AUTH-AND-PERMISSIONS.md` §3); `api/owner/bookings.js` is unreferenced (`app.js` uses `/api/owner/requests`); `role-experience.js` sign-out cleanup has stale IDs (`KD-002`).
- **Safe Extension Points**: Add admin tabs/endpoints in `server/admin-routes.js` (`GOVERNANCE_PATHS`) inside `withTransaction` + `reverifyModeratorInTx` / `reverifyPlatformAdminInTx` + `enableAdminTxGuards`.
