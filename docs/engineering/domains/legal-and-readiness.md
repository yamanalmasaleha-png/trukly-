# Domain Map — Legal Disclosures, 14+ Age Policy & Launch Readiness Register

## 1. Current Behavior
Serves 8 static draft policy & accessibility pages under `/policies/*.html` (`noindex, nofollow, noarchive`), enforces the proposed `14+` minimum account age policy (`lib/age-policy.js`, `2026-11-draft-14plus-v1`) without storing raw dates of birth, and tracks 18 launch-blocking legal, privacy, security, email, push, and backup items in `/admin#readiness` (`compliance_readiness_items` + append-only `compliance_readiness_history`).

## 2. Entry Points, APIs, Data & Governance Rules
- **Code**: [lib/age-policy.js](../../../lib/age-policy.js), `GET /api/admin/readiness`, `POST /api/admin/readiness/{update,note}` ([server/admin-routes.js](../../../server/admin-routes.js)), `#sec-readiness` ([public/admin.js](../../../public/admin.js)), `public/policies/{index,terms,privacy,cookies-storage,community-guidelines,vendor-terms,accessibility,security-contact}.html` + `policies.css`.
- **Tables** (`FORCE RLS`): `compliance_readiness_items` (18 seeded rows in `migrations/021`), `compliance_readiness_history` (append-only).
- **Key Invariant (Auto-Downgrade on Practice Change)**: In `POST /api/admin/readiness/update` (`Admin: Top` only), modifying `current_practice` or `policy_version` on an item whose status was `legally_approved` automatically downgrades its status to **`needs_re_review`** so stale legal sign-off is never silently carried forward!
- **Permissions & Flags**: Protected essential capabilities (`age_eligibility_and_restrictions` & `policy_accessibility_and_privacy_support` — never switchable). `Mod` can add operational notes (`/api/admin/readiness/note`); only `Admin: Top` can update readiness status/scope.
- **Tests**: `tests/legal-readiness.integration.cjs`, `tests/legal-readiness-browser.e2e.cjs`.
- **Known Inconsistencies**: `public/policies/privacy.html:101` says Dish Notebook uses `localStorage` (whereas `cookies-storage.html:99` accurately states `IndexedDB` at `a4e9f53`, and `83181ba` moves customer photos to private account storage).
