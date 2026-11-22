# Domain Map — Authentication, Sessions, 14+ Age Gate & Email Delivery

- **Authoritative Deep Dive**: [STANDALONE_VPS_RUNTIME_AND_AUTH.md](../../STANDALONE_VPS_RUNTIME_AND_AUTH.md)

## 1. Current Behavior
Implements passwordless 6-digit HOTP email OTP sign-in/sign-up (`/login.html`, `/api/auth/*`), `14+` Pacific calendar age eligibility (`lib/age-policy.js`), `HttpOnly` `__Host-truckly_session` cookies (14-day sliding to 30-day max, max 10 sessions/user), staging recipient allowlists, Resend/webhook transactional email dispatch (OTP, invitations, support updates) with zero silent mailbox fallback, and live SPF/DKIM/DMARC DNS readiness checks (`/api/admin/email-readiness`).

## 2. Entry Points & Key Symbols
- **Server**: `startEmailOtpChallenge`, `verifyEmailOtpChallenge`, `resolveSessionFromRequest`, `revokeSessionFromRequest`, `submitExistingAccountAgeAssessment`, `readProtectedStagingMailboxCode`, `verifySameOriginMutationRequest`, `dispatchInvitationEmail`, `dispatchSupportNotificationEmail`, `inspectAdminEmailReadiness` ([lib/standalone-auth.js](../../../lib/standalone-auth.js)); `evaluateMinimumAgeEligibility` ([lib/age-policy.js](../../../lib/age-policy.js)).
- **Browser**: `window.bitesharkAuth` ([public/auth-client.js](../../../public/auth-client.js)); `/login.html` inline script; `#rxAgeAssessmentModal` ([public/role-experience.js](../../../public/role-experience.js)); `scripts/operator-read-my-otp.cjs`.

## 3. HTTP APIs & Database Tables
- **APIs**: `GET /api/auth/session`, `POST /api/auth/{start,verify,age-assessment,logout}`, internal `POST /api/auth/staging-mailbox`, `GET /api/admin/email-readiness`.
- **Tables** (all `FORCE ROW LEVEL SECURITY` via `app.auth_internal`): `auth_users`, `auth_otp_challenges`, `auth_sessions`, `auth_rate_limits`, `auth_staging_mailbox`, `auth_delivery_telemetry`.

## 4. Permissions, Flags & Tests
- **Permissions & Flags**: Protected essential capability (`authentication_and_sessions` & `age_eligibility_and_restrictions` — never switchable; `passkey_signin` is a read-only deferred disclosure). Diagnostic key `auth_login` and `email_delivery` are `mod_visible = false` (`Admin: Top` only).
- **Tests**: `tests/standalone-runtime-auth.integration.cjs`, `tests/auth-email-delivery.integration.cjs`, `tests/legal-readiness.integration.cjs`, `tests/urgent-pilot-security.integration.cjs`.
- **Known Inconsistencies**: `public/auth-client.js` uses its own `fetch` + `AbortController` rather than `diagnostics-client.js#fetchJsonBounded`.
- **Safe Extension Points**: Keep all `auth_*` queries inside `withTransaction` with `app.auth_internal = 'true'` and preserve deterministic lock order (`auth_users` -> `auth_sessions`).
