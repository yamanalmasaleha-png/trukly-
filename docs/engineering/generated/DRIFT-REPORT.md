# Code Registry — Automated Drift & Discrepancy Report

> [!NOTE]
> **Machine-Generated Reference Inventory** — Do not hand-edit. Regenerate via `npm run registry:docs` (`node tools/code-registry/cli.mjs generate-docs`).
> - **Repository**: `https://github.com/yamanalmasaleha-png/trukly-`
> - **Provenance Mode**: `committed_source_digest` *(branch/detached-HEAD invariant; commit-bound runs use `npm run registry:scan -- --include-timestamp`)*
> - **Generator**: `biteshark-code-registry@2.0.0` (`biteshark.code-registry.v2`)
> - **Source Analysis Digest**: `972893941bb361039b39c87eca1c660c24adc38bc5397a70775abfd4504f9c9d`
> - **Analysis Scope & Limits**: Static AST, HTML, CSS, and SQL analysis without executing application modules. Relationships distinguish confirmed_static, documented_wrapper, inferred_candidate, and dynamic_unresolved; static analysis does not prove runtime behavioral correctness.

- **Active Findings**: **10** *(compared against audited baseline debt in [drift-baseline.json](../schemas/drift-baseline.json) during `npm run registry:validate`)*
- **Scoped Intentional-Pattern Suppressions**: **2** *(configured in [suppressions.json](../../../tools/code-registry/suppressions.json))*
- **Human-Curated Architectural & Cross-Branch Drift**: See [KNOWN-DRIFT.md](../KNOWN-DRIFT.md)

> [!IMPORTANT]
> **Governance Separation**: Running `npm run registry:docs` updates this report for visibility without modifying `drift-baseline.json`. Any newly introduced high-confidence blocking finding fails `npm run registry:validate` until fixed in code or explicitly accepted with rationale via `npm run registry:accept-drift -- --finding <ID> --reason "..."`.

## 1. Active Findings (10)

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

### `DRIFT:COMPETING_BROWSER_GLOBAL:preselectedVisitVendorId`
- **Category**: `LOAD_ORDER_GLOBAL_WRAPPER` | **Severity**: `medium` | **Confidence**: `high` (`parsed_ast`)
- **Affected Objects**: `public/local-guides.js#preselectedVisitVendorId`, `public/guide-passport.js#preselectedVisitVendorId`
- **Evidence**: Browser global "preselectedVisitVendorId" is defined or reassigned across multiple scripts loaded in public/index.html: public/local-guides.js:L9 (top_level_browser_let), public/local-guides.js:L368 (browser_global_reassignment), public/guide-passport.js:L295 (browser_global_reassignment).
- **Potential Impact**: Execution depends strictly on <script> load order in public/index.html; reordering scripts breaks wrapper chaining on preselectedVisitVendorId.
- **Suggested Verification**: Check script order in public/index.html and callers of preselectedVisitVendorId.
- **Proposed Remediation**: Preserve documented load order or migrate post-render hooks to explicit event/callback registration in future refactors.
- **False-Positive Considerations**: Intentional post-render decorator wrappers (such as openDetail) are load-order-sensitive design patterns rather than accidental bugs.

### `DRIFT:DUPLICATE_HELPER_IMPLEMENTATION:html_escape_helpers`
- **Category**: `DUPLICATE_HELPER_IMPLEMENTATION` | **Severity**: `low` | **Confidence**: `high` (`parsed_ast`)
- **Affected Objects**: `public/admin.js:esc@L104`, `public/app.js:esc@L259`, `public/community.js:communityEscape@L5`, `public/diagnostics-client.js:escapeHtmlSafe@L725`, `public/guide-passport.js:guidePassportHtmlEscape@L21`, `public/listing-highlights.js:esc@L30`, `public/local-guides.js:guidesEscape@L14`, `public/pager.js:pagerEscape@L14`, `public/role-experience.js:rxEsc@L156`, `public/smart.js:smartEscape@L14`, `public/street-whispers.js:streetEscape@L66`, `scripts/dev-workbench/debug-admin.js:dbgEsc@L24`, `server/app.js:escapeHtml@L137`
- **Evidence**: 13 separate HTML-escaping helper functions exist across frontend/backend modules: public/admin.js:esc@L104, public/app.js:esc@L259, public/community.js:communityEscape@L5, public/diagnostics-client.js:escapeHtmlSafe@L725, public/guide-passport.js:guidePassportHtmlEscape@L21, public/listing-highlights.js:esc@L30, public/local-guides.js:guidesEscape@L14, public/pager.js:pagerEscape@L14, public/role-experience.js:rxEsc@L156, public/smart.js:smartEscape@L14, public/street-whispers.js:streetEscape@L66, scripts/dev-workbench/debug-admin.js:dbgEsc@L24, server/app.js:escapeHtml@L137.
- **Potential Impact**: Inconsistent character escaping (e.g., omitting single-quote &#39; or null coercion) can introduce XSS or display bugs if a weaker variant is copied.
- **Suggested Verification**: Inspect each escape helper to confirm all 5 characters (&, <, >, ", ') and nullish inputs are handled.
- **Proposed Remediation**: Retain existing helpers to avoid churn; for new frontend modules, reuse a single canonical 5-entity escape helper.
- **False-Positive Considerations**: IIFE-encapsulated browser scripts intentionally keep tiny local esc() functions to remain zero-build.

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

- **`DRIFT:COMPETING_BROWSER_GLOBAL:applyFilters`** (Suppression `SUPP-GLOBAL-WRAP-APPLY-FILTERS`): Intentional post-render decorator chain: public/characters.js wraps applyFilters defined in public/app.js to refresh mascot state after filtering. Documented in FRONTEND-MAP.md. — *Evidence*: Browser global "applyFilters" is defined or reassigned across multiple scripts loaded in public/index.html: public/app.js:L1306 (top_level_browser_function), public/characters.js:L14 (browser_global_reassignment).
- **`DRIFT:COMPETING_BROWSER_GLOBAL:openDetail`** (Suppression `SUPP-GLOBAL-WRAP-OPEN-DETAIL`): Intentional post-render decorator chain: public/listing-highlights.js and public/smart.js wrap window.openDetail defined in public/app.js. Documented as a load-order invariant in FRONTEND-MAP.md. — *Evidence*: Browser global "openDetail" is defined or reassigned across multiple scripts loaded in public/index.html: public/app.js:L1523 (top_level_browser_function), public/listing-highlights.js:L91 (browser_global_reassignment), public/smart.js:L930 (browser_global_reassignment).
