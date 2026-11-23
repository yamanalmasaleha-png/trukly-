# Code Registry — Automated Baseline Drift & Discrepancy Report

> [!NOTE]
> **Machine-Generated Reference Inventory** — Do not hand-edit. Regenerate via `npm run registry:docs` (`node tools/code-registry/cli.mjs generate-docs`).
> - **Repository**: `https://github.com/yamanalmasaleha-png/trukly-`
> - **Branch / Ref at Generation**: `testing/yaman-staging2`
> - **Generator**: `biteshark-code-registry@1.0.0` (`biteshark.code-registry.v1`)
> - **Deterministic Source Digest**: `1280151cb7667601ac2537570b50da7b300e6cd1c8ea15c16666cbd9fabcdedd`
> - **Analysis Basis**: Static AST, HTML, CSS, and SQL analysis without executing application modules. Dynamic string concatenation, computed property lookups, and runtime reflection are labeled as dynamic/unresolved rather than assumed complete.

- **Active Findings**: **12**
- **Scoped Suppressions Applied**: **2** (configured in [suppressions.json](../../../tools/code-registry/suppressions.json))
- **Human-Curated Architectural & Cross-Branch Drift**: See [KNOWN-DRIFT.md](../KNOWN-DRIFT.md)

> [!IMPORTANT]
> **Zero-Deletion Invariant**: Suspected orphan or duplicate findings in this report are diagnostic evidence only. Never delete runtime routes, files, or helpers without explicit product authorization and cross-branch impact verification.

## 1. Active Findings (12)

### `DRIFT:BROKEN_DOC_LINK:docs/VPS_RELEASE_VERIFICATION_REPORT.md_L10-_docs/RELEASE_VERIFICATION_REPORT.md`
- **Category**: `BROKEN_DOC_LINK` | **Severity**: `high` | **Confidence**: `high` (`parsed_markdown`)
- **Affected Objects**: `docs/VPS_RELEASE_VERIFICATION_REPORT.md:L10`, `docs/RELEASE_VERIFICATION_REPORT.md`
- **Evidence**: docs/VPS_RELEASE_VERIFICATION_REPORT.md:L10 links to "./RELEASE_VERIFICATION_REPORT.md#historical-archive--hatchable-candidate-verification-record-fa4e40affb574d3da5a98e4874b301ad5251e17c" (resolved: "docs/RELEASE_VERIFICATION_REPORT.md"), which does not exist in the repository.
- **Potential Impact**: Developers and coding assistants follow dead links to nonexistent contracts or runbooks.
- **Suggested Verification**: Check docs/VPS_RELEASE_VERIFICATION_REPORT.md line 10.
- **Proposed Remediation**: Update the link path to the existing file or create the missing target document.
- **False-Positive Considerations**: None outside fenced example blocks.

### `DRIFT:BROKEN_DOC_LINK:docs/VPS_RELEASE_VERIFICATION_REPORT.md_L185-_docs/RELEASE_VERIFICATION_REPORT.md`
- **Category**: `BROKEN_DOC_LINK` | **Severity**: `high` | **Confidence**: `high` (`parsed_markdown`)
- **Affected Objects**: `docs/VPS_RELEASE_VERIFICATION_REPORT.md:L185`, `docs/RELEASE_VERIFICATION_REPORT.md`
- **Evidence**: docs/VPS_RELEASE_VERIFICATION_REPORT.md:L185 links to "./RELEASE_VERIFICATION_REPORT.md#5-defect-ledger-and-corrections" (resolved: "docs/RELEASE_VERIFICATION_REPORT.md"), which does not exist in the repository.
- **Potential Impact**: Developers and coding assistants follow dead links to nonexistent contracts or runbooks.
- **Suggested Verification**: Check docs/VPS_RELEASE_VERIFICATION_REPORT.md line 185.
- **Proposed Remediation**: Update the link path to the existing file or create the missing target document.
- **False-Positive Considerations**: None outside fenced example blocks.

### `DRIFT:DUPLICATE_HELPER_IMPLEMENTATION:html_escape_helpers`
- **Category**: `DUPLICATE_HELPER_IMPLEMENTATION` | **Severity**: `low` | **Confidence**: `high` (`parsed_ast`)
- **Affected Objects**: `public/admin.js:esc@L104`, `public/app.js:esc@L259`, `public/community.js:communityEscape@L5`, `public/diagnostics-client.js:escapeHtmlSafe@L724`, `public/guide-passport.js:guidePassportHtmlEscape@L28`, `public/listing-highlights.js:esc@L30`, `public/local-guides.js:guidesEscape@L8`, `public/pager.js:pagerEscape@L14`, `public/role-experience.js:rxEsc@L156`, `public/smart.js:smartEscape@L2`, `public/street-whispers.js:streetEscape@L33`, `scripts/dev-workbench/debug-admin.js:dbgEsc@L24`, `server/app.js:escapeHtml@L98`
- **Evidence**: 13 separate HTML-escaping helper functions exist across frontend/backend modules: public/admin.js:esc@L104, public/app.js:esc@L259, public/community.js:communityEscape@L5, public/diagnostics-client.js:escapeHtmlSafe@L724, public/guide-passport.js:guidePassportHtmlEscape@L28, public/listing-highlights.js:esc@L30, public/local-guides.js:guidesEscape@L8, public/pager.js:pagerEscape@L14, public/role-experience.js:rxEsc@L156, public/smart.js:smartEscape@L2, public/street-whispers.js:streetEscape@L33, scripts/dev-workbench/debug-admin.js:dbgEsc@L24, server/app.js:escapeHtml@L98.
- **Potential Impact**: Inconsistent character escaping (e.g., omitting single-quote &#39; or null coercion) can introduce XSS or display bugs if a weaker variant is copied.
- **Suggested Verification**: Inspect each escape helper to confirm all 5 characters (&, <, >, ", ') and nullish inputs are handled.
- **Proposed Remediation**: Retain existing helpers to avoid churn; for new frontend modules, reuse a single canonical 5-entity escape helper.
- **False-Positive Considerations**: IIFE-encapsulated browser scripts intentionally keep tiny local esc() functions to remain zero-build.

### `DRIFT:INVALID_WRITE_PAUSE_SCOPE:api/favorites/toggle.js#favorites`
- **Category**: `INVALID_WRITE_PAUSE_SCOPE` | **Severity**: `high` | **Confidence**: `high` (`parsed_ast`)
- **Affected Objects**: `api/favorites/toggle.js:L10`, `lib/authz.js#VALID_WRITE_PAUSE_SCOPES`
- **Evidence**: api/favorites/toggle.js:L10 calls isWritePaused("favorites"), which is not in VALID_WRITE_PAUSE_SCOPES (bookings, pagers, community, owner, notifications, all).
- **Potential Impact**: Setting BITESHARK_PAUSE_WRITES=favorites triggers inspectWritePauseConfig() failClosedAll=true, halting ALL mutations across every domain.
- **Suggested Verification**: Inspect api/favorites/toggle.js:L10 and lib/authz.js:120-166.
- **Proposed Remediation**: Add "favorites" to VALID_WRITE_PAUSE_SCOPES in lib/authz.js (or map favorites to an approved scope) in a dedicated runtime fix PR.
- **False-Positive Considerations**: None.

### `DRIFT:MISSING_DOM_TARGET:public/role-experience.js#rxViewpointBanner`
- **Category**: `MISSING_DOM_TARGET` | **Severity**: `medium` | **Confidence**: `medium` (`parsed_ast_vs_html`)
- **Affected Objects**: `public/role-experience.js:L1118`, `#rxViewpointBanner`
- **Evidence**: public/role-experience.js:L1118 (resetRoleExperienceSignedOutState) calls getElementById('rxViewpointBanner'), which does not appear in static public/*.html or detected innerHTML templates.
- **Potential Impact**: Null return value; if unguarded, causes TypeError or dead UI wiring.
- **Suggested Verification**: Search public/ for "rxViewpointBanner" and check whether public/role-experience.js guards for null or dynamically creates the element via createElement().
- **Proposed Remediation**: Keep explicit null guard if optional/dynamically created via createElement(), or remove obsolete DOM lookup.
- **False-Positive Considerations**: Elements created imperatively via document.createElement() + el.id = "..." (such as lazy error boxes) are valid runtime targets.

### `DRIFT:SUSPECTED_ORPHAN_ROUTE:/api/catalog/cities`
- **Category**: `SUSPECTED_ORPHAN_ROUTE` | **Severity**: `low` | **Confidence**: `medium` (`parsed_ast_route_callers`)
- **Affected Objects**: `api/catalog/cities.js`, `/api/catalog/cities`
- **Evidence**: Domain route /api/catalog/cities (api/catalog/cities.js) has 0 detected callers in public/*.js or public/*.html.
- **Potential Impact**: Unused HTTP surface retained for REGISTERED_DOMAIN_ROUTE_COUNT === 30 invariant; do not delete without updating server/routes.js and healthz tests.
- **Suggested Verification**: Search public/ and tests/ for "/api/catalog/cities".
- **Proposed Remediation**: Retain while 30-route parity is enforced; document as unreferenced in API-CONTRACTS.md.
- **False-Positive Considerations**: External or operator CLI tools may call public catalog endpoints directly.

### `DRIFT:SUSPECTED_ORPHAN_ROUTE:/api/catalog/cuisines`
- **Category**: `SUSPECTED_ORPHAN_ROUTE` | **Severity**: `low` | **Confidence**: `medium` (`parsed_ast_route_callers`)
- **Affected Objects**: `api/catalog/cuisines.js`, `/api/catalog/cuisines`
- **Evidence**: Domain route /api/catalog/cuisines (api/catalog/cuisines.js) has 0 detected callers in public/*.js or public/*.html.
- **Potential Impact**: Unused HTTP surface retained for REGISTERED_DOMAIN_ROUTE_COUNT === 30 invariant; do not delete without updating server/routes.js and healthz tests.
- **Suggested Verification**: Search public/ and tests/ for "/api/catalog/cuisines".
- **Proposed Remediation**: Retain while 30-route parity is enforced; document as unreferenced in API-CONTRACTS.md.
- **False-Positive Considerations**: External or operator CLI tools may call public catalog endpoints directly.

### `DRIFT:SUSPECTED_ORPHAN_ROUTE:/api/catalog/featured`
- **Category**: `SUSPECTED_ORPHAN_ROUTE` | **Severity**: `low` | **Confidence**: `medium` (`parsed_ast_route_callers`)
- **Affected Objects**: `api/catalog/featured.js`, `/api/catalog/featured`
- **Evidence**: Domain route /api/catalog/featured (api/catalog/featured.js) has 0 detected callers in public/*.js or public/*.html.
- **Potential Impact**: Unused HTTP surface retained for REGISTERED_DOMAIN_ROUTE_COUNT === 30 invariant; do not delete without updating server/routes.js and healthz tests.
- **Suggested Verification**: Search public/ and tests/ for "/api/catalog/featured".
- **Proposed Remediation**: Retain while 30-route parity is enforced; document as unreferenced in API-CONTRACTS.md.
- **False-Positive Considerations**: External or operator CLI tools may call public catalog endpoints directly.

### `DRIFT:SUSPECTED_ORPHAN_ROUTE:/api/owner/bookings`
- **Category**: `SUSPECTED_ORPHAN_ROUTE` | **Severity**: `low` | **Confidence**: `medium` (`parsed_ast_route_callers`)
- **Affected Objects**: `api/owner/bookings.js`, `/api/owner/bookings`
- **Evidence**: Domain route /api/owner/bookings (api/owner/bookings.js) has 0 detected callers in public/*.js or public/*.html.
- **Potential Impact**: Unused HTTP surface retained for REGISTERED_DOMAIN_ROUTE_COUNT === 30 invariant; do not delete without updating server/routes.js and healthz tests.
- **Suggested Verification**: Search public/ and tests/ for "/api/owner/bookings".
- **Proposed Remediation**: Retain while 30-route parity is enforced; document as unreferenced in API-CONTRACTS.md.
- **False-Positive Considerations**: External or operator CLI tools may call public catalog endpoints directly.

### `DRIFT:SUSPECTED_ORPHAN_ROUTE:/api/schedule/today`
- **Category**: `SUSPECTED_ORPHAN_ROUTE` | **Severity**: `low` | **Confidence**: `medium` (`parsed_ast_route_callers`)
- **Affected Objects**: `api/schedule/today.js`, `/api/schedule/today`
- **Evidence**: Domain route /api/schedule/today (api/schedule/today.js) has 0 detected callers in public/*.js or public/*.html.
- **Potential Impact**: Unused HTTP surface retained for REGISTERED_DOMAIN_ROUTE_COUNT === 30 invariant; do not delete without updating server/routes.js and healthz tests.
- **Suggested Verification**: Search public/ and tests/ for "/api/schedule/today".
- **Proposed Remediation**: Retain while 30-route parity is enforced; document as unreferenced in API-CONTRACTS.md.
- **False-Positive Considerations**: External or operator CLI tools may call public catalog endpoints directly.

### `DRIFT:SUSPECTED_ORPHAN_ROUTE:/api/trucks/_id`
- **Category**: `SUSPECTED_ORPHAN_ROUTE` | **Severity**: `low` | **Confidence**: `medium` (`parsed_ast_route_callers`)
- **Affected Objects**: `api/trucks/[id].js`, `/api/trucks/:id`
- **Evidence**: Domain route /api/trucks/:id (api/trucks/[id].js) has 0 detected callers in public/*.js or public/*.html.
- **Potential Impact**: Unused HTTP surface retained for REGISTERED_DOMAIN_ROUTE_COUNT === 30 invariant; do not delete without updating server/routes.js and healthz tests.
- **Suggested Verification**: Search public/ and tests/ for "/api/trucks/:id".
- **Proposed Remediation**: Retain while 30-route parity is enforced; document as unreferenced in API-CONTRACTS.md.
- **False-Positive Considerations**: External or operator CLI tools may call public catalog endpoints directly.

### `DRIFT:SUSPECTED_ORPHAN_ROUTE:/api/trucks/search`
- **Category**: `SUSPECTED_ORPHAN_ROUTE` | **Severity**: `low` | **Confidence**: `medium` (`parsed_ast_route_callers`)
- **Affected Objects**: `api/trucks/search.js`, `/api/trucks/search`
- **Evidence**: Domain route /api/trucks/search (api/trucks/search.js) has 0 detected callers in public/*.js or public/*.html.
- **Potential Impact**: Unused HTTP surface retained for REGISTERED_DOMAIN_ROUTE_COUNT === 30 invariant; do not delete without updating server/routes.js and healthz tests.
- **Suggested Verification**: Search public/ and tests/ for "/api/trucks/search".
- **Proposed Remediation**: Retain while 30-route parity is enforced; document as unreferenced in API-CONTRACTS.md.
- **False-Positive Considerations**: External or operator CLI tools may call public catalog endpoints directly.

## 2. Audited Scoped Suppressions (2)

- **`DRIFT:COMPETING_BROWSER_GLOBAL:applyFilters`** (Suppression `SUPP-GLOBAL-WRAP-APPLY-FILTERS`): Intentional post-render decorator chain: public/characters.js wraps applyFilters defined in public/app.js to refresh mascot state after filtering. Documented in FRONTEND-MAP.md. — *Evidence*: Browser global "applyFilters" is defined or reassigned across multiple scripts loaded in public/index.html: public/app.js:L1391 (top_level_browser_function), public/characters.js:L14 (browser_global_reassignment).
- **`DRIFT:COMPETING_BROWSER_GLOBAL:openDetail`** (Suppression `SUPP-GLOBAL-WRAP-OPEN-DETAIL`): Intentional post-render decorator chain: public/listing-highlights.js and public/smart.js wrap window.openDetail defined in public/app.js. Documented as a load-order invariant in FRONTEND-MAP.md. — *Evidence*: Browser global "openDetail" is defined or reassigned across multiple scripts loaded in public/index.html: public/app.js:L1579 (top_level_browser_function), public/listing-highlights.js:L91 (browser_global_reassignment), public/smart.js:L39 (browser_global_reassignment).
