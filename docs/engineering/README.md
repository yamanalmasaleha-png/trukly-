# BiteShark Shared Engineering Handbook & Code Registry

This handbook is the **single, code-grounded engineering reference** for BiteShark (`https://github.com/yamanalmasaleha-png/trukly-/`). Its purpose is to prevent duplicate implementations, incompatible HTTP/database contracts, CSS/DOM collisions, naming drift, and orphaned code across parallel development by Matt and Yaman.

> [!IMPORTANT]
> **Separated Layers**:
> 1. **Human-Maintained Contracts & Maps** (`docs/engineering/*.md`, `domains/*.md`, `contracts/*`, `decisions/*`) explain architecture, invariants, canonical helpers, and branch-aware contracts.
> 2. **Machine-Generated Inventories** (`docs/engineering/generated/*`) are deterministically generated from AST/HTML/CSS/SQL source analysis via `npm run registry:docs` and validated in CI via `npm run registry:validate`.
> 3. **Authoritative Operational Runbooks** (`docs/*.md`) remain in place and are linked rather than duplicated; verified doc-vs-code discrepancies are tracked in [KNOWN-DRIFT.md](KNOWN-DRIFT.md).

---

## 1. Quick Navigation Index

### Start Here & Standing Rules
- [Root Standing Rules (`AGENTS.md`)](../../AGENTS.md) — Mandatory workflow rules before touching code.
- [Assistant Instructions (`ASSISTANT-INSTRUCTIONS.md`)](ASSISTANT-INSTRUCTIONS.md) — Copyable prompts & rules for Antigravity and GPT assistants.
- [Scope, Provenance & Evidence (`SCOPE-AND-EVIDENCE.md`)](SCOPE-AND-EVIDENCE.md) — Scanned roots, explicit exclusions, parser limits, and coverage counts.
- [Branch & Environment Map (`BRANCH-AND-ENVIRONMENT-MAP.md`)](BRANCH-AND-ENVIRONMENT-MAP.md) — Evidence-backed topology of `working/biteshark-vps`, `feature/customer-exploration-journal-trails`, `testing/yaman-staging2`, `antigravity/staging2-latest`, `staging.biteshark.live`, and `staging2.biteshark.live`.
- [Glossary (`GLOSSARY.md`)](GLOSSARY.md) — Exact product and codebase terminology (`Vendor` vs `Truck`, `Top` vs `Mod`, `Inquiry` vs `Booking`, etc.).
- [Naming Conventions & Canonical Components (`NAMING-CONVENTIONS.md`)](NAMING-CONVENTIONS.md) — Canonical helpers vs competing legacy copies + naming rules for new code ([canonical-components.json](contracts/canonical-components.json)).

### Architecture, Code Maps & Contracts
- [System Architecture (`ARCHITECTURE.md`)](ARCHITECTURE.md) — Request lifecycle, process boundaries, security invariants, and Mermaid flow diagrams.
- [Repository Map (`REPOSITORY-MAP.md`)](REPOSITORY-MAP.md) — Directory-by-directory ownership and release-tarball inclusion rules.
- [Frontend Map (`FRONTEND-MAP.md`)](FRONTEND-MAP.md) — HTML entrypoints, 14-script load order, `window.*` globals, DOM/modal controllers, hash routes, storage, SW, and 16-stylesheet CSS cascade.
- [Backend Map (`BACKEND-MAP.md`)](BACKEND-MAP.md) — `server/index.js`, `server/app.js` 10-stage pipeline, `server/routes.js` (30 domain handlers), `server/admin-routes.js`, `@biteshark/runtime-adapter`, and `lib/db-tx.js`.
- [Data Model (`DATA-MODEL.md`)](DATA-MODEL.md) — Reconstructed & disposable-DB-verified PostgreSQL tables, `FORCE ROW LEVEL SECURITY` `app.*` GUCs, triggers, roles, and seed vs runtime data.
- [API Contracts (`API-CONTRACTS.md`)](API-CONTRACTS.md) & [Shared API Envelopes (`contracts/shared-api-envelopes.md`)](contracts/shared-api-envelopes.md) — Route groups, request/response envelopes, headers, status/error codes, and idempotency rules.
- [Authentication, Roles & Ownership (`AUTH-AND-PERMISSIONS.md`)](AUTH-AND-PERMISSIONS.md) — Email HOTP OTP, `__Host-truckly_session`, 14+ age policy, RBAC permission matrix, Act-on-Behalf, and UI-vs-backend gaps.

### Platform Controls, Operations & Quality
- [Feature Controls (`FEATURE-CONTROLS.md`)](FEATURE-CONTROLS.md) — Declarative registry, precedence hierarchy, DB + CLI management, and UI/API gates.
- [Diagnostics & Errors (`DIAGNOSTICS-AND-ERRORS.md`)](DIAGNOSTICS-AND-ERRORS.md) — Fingerprinting, PII redaction, `X-Correlation-Id`, retention, and support-ticket linking.
- [Configuration (`CONFIGURATION.md`)](CONFIGURATION.md) & [Configuration Keys Contract (`contracts/configuration-keys.json`)](contracts/configuration-keys.json) — Complete `BITESHARK_*` / `TRUCKLY_*` matrix (names, defaults, fail-closed rules, secret classes — zero secret values).
- [Storage & Files (`STORAGE-AND-FILES.md`)](STORAGE-AND-FILES.md) — Browser storage, DB `BYTEA` evidence, customer photo storage (`83181ba`), persistent VPS paths, and encrypted backups.
- [Dependencies & Licenses (`DEPENDENCIES-AND-LICENSES.md`)](DEPENDENCIES-AND-LICENSES.md) — Direct/transitive npm packages, Leaflet/Google Fonts/OSM CDN provenance, vendored `acorn`, first-party icons, and historical archives.
- [BiteShark staging2 style guide](STYLE-GUIDE.md) — Palette, typography, component patterns, product voice and mobile review.
- **[Design Style Guide & Decision Questionnaire (`style-guide/README.md`)](style-guide/README.md)**, **[Completion Reminder (`style-guide/COMPLETION-REMINDER.md`)](style-guide/COMPLETION-REMINDER.md)** & **[UI Element Inventory (`style-guide/ui-element-inventory.md`)](style-guide/ui-element-inventory.md)** — Structured 15-category / 29-element questionnaire (`style-guide/decisions.json`) editable in `/admin#style-guide`.
- [UI & Content Guide (`UI-AND-CONTENT-GUIDE.md`)](UI-AND-CONTENT-GUIDE.md) — Cream/forest-green visual identity, `.truck-card` compact card architecture, cascade traps, and truthful copy rules.
- [Accessibility (`ACCESSIBILITY.md`)](ACCESSIBILITY.md) — Skip links, `openModalDialog` focus traps, touch targets, reduced motion, and known modal bypasses.
- [Testing (`TESTING.md`)](TESTING.md) — Unit, embedded-PostgreSQL integration, headless Chrome E2E, installer, and registry test suites.
- [Migrations (`MIGRATIONS.md`)](MIGRATIONS.md) — `scripts/run-migrations.cjs` checksum enforcement, role grants/revokes, and two-developer numbering rules.
- [Release & Rollback (`RELEASE-AND-ROLLBACK.md`)](RELEASE-AND-ROLLBACK.md) — Tarball build, `install-staging-release.sh`, `biteshark-staging2-ctl`, health gates, and forward-only DB rollback caveats.
- [Compatibility & Deprecation (`COMPATIBILITY-AND-DEPRECATION.md`)](COMPATIBILITY-AND-DEPRECATION.md) — Change-impact classifications, dual-prefix deprecation rules, and frozen contracts.
- [Known Drift & Discrepancies (`KNOWN-DRIFT.md`)](KNOWN-DRIFT.md) — Verified doc-vs-code mismatches, latent bugs, duplicate helpers, and cross-branch divergence.
- [Handbook Maintenance (`MAINTENANCE.md`)](MAINTENANCE.md) — Exact CLI commands and workflow for keeping maintained docs and generated inventories synchronized.

---

## 2. Domain-Level Technical Maps (`docs/engineering/domains/`)

1. [Discovery & Catalog](domains/discovery-catalog.md)
2. [Maps & Location](domains/maps-and-location.md)
3. [Vendor Onboarding & Administration](domains/vendor-onboarding-and-admin.md)
4. [Customer Onboarding & Welcome](domains/customer-onboarding.md)
5. [Authentication & Email Delivery](domains/auth-and-email.md)
6. [Event Inquiries & Bookings](domains/bookings.md)
7. [Community Hub & Moderation](domains/community-and-moderation.md)
8. [Support Tickets & Feedback](domains/support-and-feedback.md)
9. [Feature Controls](domains/feature-controls.md)
10. [Error & Operational Diagnostics](domains/diagnostics.md)
11. [Local Guides & Editorial Stories](domains/local-guides-and-stories.md)
12. [Visit Journal & Food Passport](domains/visits-and-passport.md)
13. [Customer & Listing Photos](domains/photos.md)
14. [Badges, Points & Weekly Challenges](domains/badges-points-and-challenges.md)
15. [Suggested Trails](domains/suggested-trails.md)
16. [Pickup Pagers & Web Push Notifications](domains/pager-and-notifications.md)
17. [Legal Disclosures & Launch Readiness](domains/legal-and-readiness.md)

---

## 3. Machine-Generated Reference Catalogs (`docs/engineering/generated/`)

- [SYMBOL-INDEX.md](generated/SYMBOL-INDEX.md) — All first-party modules, exports, classes, constants, functions, parameters, and callers.
- [ROUTE-INVENTORY.md](generated/ROUTE-INVENTORY.md) — Complete HTTP endpoint catalog with methods, dispatchers, auth/authz, feature gates, callers, and tests.
- [FRONTEND-INVENTORY.md](generated/FRONTEND-INVENTORY.md) — Screens, script/stylesheet orders, HTML IDs, inline handlers, storage keys, and CSS metrics.
- [SCHEMA-INVENTORY.md](generated/SCHEMA-INVENTORY.md) — Ordered SQL migrations, reconstructed tables/columns/FKs/RLS policies, and Mermaid `erDiagram`.
- [DRIFT-REPORT.md](generated/DRIFT-REPORT.md) — Automated drift findings and audited scoped suppressions.
- [registry-summary.json](generated/registry-summary.json) — Deterministic JSON index verified by `npm run registry:validate`.

---

## 4. Architecture Decision Records & Schemas

- [ADR 001: Offline Vendored AST Registry](decisions/001-offline-vendored-ast-registry.md)
- [ADR 002: Branch-Specific Generated Inventories](decisions/002-branch-specific-generated-inventories.md)
- [Code Registry JSON Schema](schemas/code-registry.schema.json)
- [Change-Impact JSON Schema](schemas/change-impact.schema.json)
- [Drift Baseline](schemas/drift-baseline.json)
