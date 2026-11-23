# Authentication, Roles, Ownership & Permission Matrix

Authoritative operational details also appear in [STANDALONE_VPS_RUNTIME_AND_AUTH.md](../STANDALONE_VPS_RUNTIME_AND_AUTH.md) and [ADMIN_GOVERNANCE_AND_ONBOARDING.md](../ADMIN_GOVERNANCE_AND_ONBOARDING.md) *(see [KNOWN-DRIFT.md](KNOWN-DRIFT.md) for 7 stale claims in the latter)*.

---

## 1. Session, OTP & CSRF Mechanics (`lib/standalone-auth.js`)

1. **Email OTP Challenge (`POST /api/auth/start` -> `POST /api/auth/verify`)**:
   - Generates a 6-digit RFC 4226 HOTP code (`otplib@13.6.0`), stores only `HMAC-SHA256(AUTH_SECRET, challenge_id + ':' + email + ':' + code)` in `auth_otp_challenges` (`10m` default TTL, max `5` verification attempts).
   - **Delivery Modes (`BITESHARK_AUTH_DELIVERY_MODE`)**:
     - `resend_https` / `webhook_https`: Sends via HTTPS provider API (`6s` default timeout). **Never silently falls back to `staging_mailbox` on provider error.**
     - `staging_mailbox`: Allowed only in non-production with `STAGING_MAILBOX_SECRET >= 24` chars and non-empty `STAGING_ALLOWED_EMAIL_DOMAINS` / `STAGING_ALLOWED_EMAILS`; encrypts code with `AES-256-GCM` (`HKDF-SHA256` key from `STAGING_MAILBOX_SECRET` + `AUTH_SECRET`).
   - **Staging Recipient Guard**: When `BITESHARK_ENV=staging`, uninvited/new emails outside `STAGING_ALLOWED_EMAIL_DOMAINS` and `STAGING_ALLOWED_EMAILS` are blocked before account creation or outbound send, unless the exact email already holds an active account or issued `account_invitations` row.
2. **Session Cookie (`__Host-truckly_session`)**:
   - `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=1209600` (14 days).
   - Raw 32-byte random token is hashed with `SHA-256` into `auth_sessions.token_sha256`.
   - **Sliding Renewal & Caps**: Renews `expires_at` once past its 7-day half-life up to a hard 30-day `max_expires_at` ceiling; caps active sessions at `10` per user (revoking oldest).
   - **Immediate Revocation**: Role changes (`/api/admin/accounts/role`), account suspension (`/api/admin/accounts/status`), and `< 14` age-assessment blocks immediately revoke all active `auth_sessions` rows inside the same PostgreSQL transaction (`FOR SHARE` lock in `lib/db-tx.js` aborts concurrent in-flight requests).
3. **14+ Minimum-Age Gate & Separate 18+ External Sharing Eligibility (`lib/age-policy.js`)**:
   - Proposed rule (`2026-11-draft-14plus-v1`, evaluated in `America/Los_Angeles`, Feb 29 -> Mar 1 on non-leap years): users `< 14` cannot create accounts (`403 AGE_INELIGIBLE` + 15m HttpOnly `__Host-bs_age_gate=1` cooldown cookie; zero raw DOB persisted).
   - Pre-existing `not_assessed` accounts receive `403 AGE_ASSESSMENT_REQUIRED` on all non-exempt authenticated routes until verified via `POST /api/auth/age-assessment`. (`GET /api/stories`, `GET /api/trails/suggest`, and `POST /api/shared/report` are age-gate exempt.)
   - **18+ Unlisted Sharing Policy (`evaluateAdultSharingEligibility`, `2026-11-draft-18plus-sharing-v1`)**: `eligible_14_plus` authorizes private profile & private Greatest Hits collections, **not** external sharing. Creating, updating, or rotating `/s/<token>` links requires `customer_sharing_eligibility.eligibility_status = 'eligible_18_plus'` via a one-time self-attested server-side Pacific Time check (`POST /api/me/sharing-eligibility`). Raw DOB is never stored or logged; under-18 outcomes commit `ineligible_under_18` before returning `403 SHARING_UNDER_18_RESTRICTED` to prevent DOB retry coaching while preserving full private profile, export, deletion, and link-revocation access.
4. **CSRF & Origin Protection (`verifySameOriginMutationRequest`)**:
   - Enforced on all `POST`/`PUT`/`PATCH`/`DELETE` cookie-authenticated routes: validates `Sec-Fetch-Site` (`same-origin` / `none`), `Host`, and `Origin` / `Referer` against `BITESHARK_PUBLIC_ORIGIN` (failing closed `503 INVALID_PUBLIC_ORIGIN_CONFIG` if `PUBLIC_ORIGIN` is malformed).

---

## 2. Grounded Permission Matrix (Enforcement Points)

| Capability / Action | Anonymous | Customer (`14+`) | Vendor Staff | Vendor Owner | Admin: Mod | Admin: Top | Server Enforcement Point |
|---|---|---|---|---|---|---|---|
| Public catalog, stories, trail generator, `/policies/*`, `/api/healthz` | Allow | Allow | Allow | Allow | Allow | Allow | `server/app.js`, `server/routes.js` |
| Favorites, event inquiries, community posts/reports, visits/photos/saved trails (`83181ba`) | Deny (`401`) | Own rows | Own rows | Own rows | Own rows | Own rows | `server/app.js` + `withTransaction` + RLS `app.user_id` |
| Submit/reply/reopen support tickets (`/api/issues*`) | Deny (`401`) | Own *(even if age unassessed)* | Own + shared `vendor_service` | Own + shared `vendor_service` | Staff triage via `/api/admin/issues*` | Full staff + assign/escalate | `server/admin-routes.js` + `migrations/024,026` |
| Live location, schedule, create/update pickup pagers (`/api/owner/{location,schedule}`, `/api/pager/{staff,update}`) | Deny (`401`) | Deny (`403`) | Assigned vendor *(blocked if `vendor_access_suspended`; `create_pager` blocked if `pager_restricted`)* | Assigned vendor | Deny (`403`) | **Only** via audited Act-on-Behalf | `authorizeVendorOperation` (`lib/authz.js`) |
| Edit vendor profile, accept/decline catering inquiries, manage staff & staff invites (`/api/owner/{profile,requests}`, `/api/vendor/*`) | Deny (`401`) | Deny (`403`) | Deny (`403`) *(read-only on `GET`)* | Assigned vendor | Deny (`403`) | **Only** via audited Act-on-Behalf | `authorizeVendorOperation` / `server/admin-routes.js` |
| Access `/admin` HTML & `/api/admin/{overview,vendors,applications,moderation,issues,readiness,features,audit}` | `302 /login.html` | `403` | `403` | `403` | Allow (read + scoped actions) | Allow (full) | `server/app.js` Step 4B + `reverifyModeratorInTx` |
| Community moderation decisions (`/api/admin/moderation/decision`), scoped shared-page suppression (`/api/admin/shared-moderation*`), & temp vendor restrictions (`<= 72h`) | Deny *(may submit `POST /api/shared/report`)* | Deny | Deny | Deny | Allow *(cannot reinstate `Top` suppressions; zero access to private journals/unshared photos)* | Allow | `server/admin-routes.js` & `lib/customer-profile.js` |
| Approve/reject/suspend vendor applications; permanent vendor restrictions | Deny | Deny | Deny | Deny | Recommend / request info only (`403` on final decision) | Allow | `server/admin-routes.js` (`reverifyPlatformAdminInTx`) |
| Grant/revoke `Mod`/`Top` roles, suspend accounts, approve `Mod`/`Top` invites | Deny | Deny | Deny | Deny | Initiate invite (`pending_top_approval`) only | Allow *(self-role-change & last-Top removal blocked)* | `server/admin-routes.js` + `trg_protect_last_top_admin*` |
| Update `feature_controls`, approve `compliance_readiness_items`, view `email-readiness`, view `mod_visible=false` diagnostics, use Act-on-Behalf | Deny | Deny | Deny | Deny | Read-only (`403` on write / hidden on restricted diag) | Allow | `server/admin-routes.js` + `feature_controls_top_write` RLS |

---

## 3. Verified UI Visibility vs Backend Authorization Divergences (Recorded for Review)

1. **Topbar `.brand` Logo Opens `#ownerScreen` Sample Preview for Any Visitor**:
   - `public/index.html:27` binds `onclick="showScreen('owner')"`. Guests and customers can view `#ownerScreen` with synthetic sample requests (`Maya R.`, `Alex T.`, `Sonoma PTA` in `public/app.js:3216-3237`) and local-only `localStorage` edits, while all `/api/owner/*` endpoints strictly enforce `401`/`403` on the server.
2. **Marketing Promo Card Generator (`openSmart('marketing')`) Has No Ownership Gate**:
   - On `a4e9f53`/`a2f0135`, any visitor can open Flavor Lab's Marketing Kit and render client-side promo cards for any catalog vendor *(on `83181ba`, the Marketing Kit card is relocated onto `#ownerScreen` `#ownerMarketingCard`, though client-side rendering still uses public catalog metadata)*.
3. **Legacy `#ownerScreen` Moderation Panel (`public/community.js` -> `/api/community/moderate`)**:
   - Visible when `canModerateCommunity` is true, calling legacy `api/community/moderate.js` (pending-only approve/reject) alongside the richer `/admin#moderation` portal (`/api/admin/moderation*`).
4. **Public Exploration Endpoints & Self-Service Privacy Access**:
   - `GET /api/stories` and `GET /api/trails/suggest` are explicitly listed in `isGovernanceRouteExemptFromAgeGate` (`lib/age-policy.js`) so both anonymous visitors and signed-in `not_assessed` sessions receive `200`, while all `/api/me/*` routes require `eligible_14_plus`.
   - Self-service privacy endpoints (`GET /api/me/exploration/export`, `GET /api/me/photos/file`, `POST /api/me/{visits,photos,trails}/delete`) remain accessible to the authenticated 14+ owner even when exploration UI feature flags are `hidden`, while strictly enforcing `FORCE ROW LEVEL SECURITY` + `user_id` ownership (`404` for other users, `401` for anonymous callers).
   - **Top-Admin Testing Customer Sandbox (`lib/admin-test-customer.js` / `/api/admin/test-customer`)**: Available strictly to verified `Admin: Top` sessions (`reverifyPlatformAdminInTx`) in non-production (`staging`/`test`/`local`) environments. Provisions an isolated synthetic customer account (`usr_sa_top_admin_test_customer` / `test-customer@sandbox.biteshark.invalid` with enforced zero `platform_roles` and zero `vendor_memberships`) via a separate `HttpOnly; Secure; SameSite=Lax` overlay cookie (`__Host-bs_admin_test_session`) that is honored only while the browser's primary `__Host-truckly_session` remains an active `Admin: Top` session. Never impersonates or touches real customer accounts; every `enter`, `seed`, `reset`, and `exit` action is audited in `audit_logs`.
