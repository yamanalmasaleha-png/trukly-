# BiteShark Shared Engineering Handbook & Code Registry

This handbook provides **code-grounded engineering documentation and static analysis inventories** for BiteShark (`https://github.com/yamanalmasaleha-png/trukly-/`), indexed against the active branch's committed source tree. Its purpose is to prevent duplicate implementations, incompatible HTTP/database contracts, CSS/DOM collisions, naming drift, and orphaned code across parallel development by Matt and Yaman.

> [!IMPORTANT]
> **Separated Layers & Source-of-Truth Boundaries**:
> 1. **Human-Maintained Contracts & Maps** (`docs/engineering/*.md`, `domains/*.md`, `contracts/*`, `decisions/*`) document architecture, shared contracts ([contracts/shared-contracts.json](contracts/shared-contracts.json)), canonical helpers ([contracts/canonical-components.json](contracts/canonical-components.json)), and branch-aware invariants.
> 2. **Machine-Generated Inventories** (`docs/engineering/generated/*`) are deterministically generated from offline AST/HTML/CSS/SQL analysis via `npm run registry:docs` (which **never** auto-accepts drift debt) and verified via `npm run registry:validate`. Static inventories reflect the checked-out commit only and do not prove runtime behavioral or live-host state.
> 3. **Operational Runbooks** (`docs/*.md`) remain in place and are linked rather than duplicated; verified doc-vs-code discrepancies are tracked in [KNOWN-DRIFT.md](KNOWN-DRIFT.md).

---

## 1. Quick Navigation Index

### Start Here & Standing Rules
- **[Start Here — Quickstart & Task Lookup (`START-HERE.md`)](START-HERE.md)** — **Read first**: 2-step pre-edit lookup, 4-step pre-review check, and "I need to..." task table.
- [Root Standing Rules (`AGENTS.md`)](../../AGENTS.md) — Mandatory workflow rules before touching code.
- [Assistant Instructions (`ASSISTANT-INSTRUCTIONS.md`)](ASSISTANT-INSTRUCTIONS.md) — Copyable prompts & rules for Antigravity and GPT assistants.
- [Scope, Provenance & Evidence (`SCOPE-AND-EVIDENCE.md`)](SCOPE-AND-EVIDENCE.md) — Scanned roots, exclusions, digest definitions, relationship confidence states, and static analysis limits.
- [Branch & Environment Map (`BRANCH-AND-ENVIRONMENT-MAP.md`)](BRANCH-AND-ENVIRONMENT-MAP.md) — Stable environment isolation rules + dated Git/deployment snapshot (`working/biteshark-vps`, `staging2` branches, `staging.biteshark.live`, `staging2.biteshark.live`).
- [Glossary (`GLOSSARY.md`)](GLOSSARY.md) — Exact product and codebase terminology (`Vendor` vs `Truck`, `Top` vs `Mod`, `Inquiry` vs `Booking`).
- [Naming Conventions & Canonical Components (`NAMING-CONVENTIONS.md`)](NAMING-CONVENTIONS.md) — Canonical helpers vs competing legacy copies ([canonical-components.json](contracts/canonical-components.json)).

### Architecture, Code Maps & Maintained Contracts
- [High-Value Shared Contracts (`contracts/shared-contracts.json`)](contracts/shared-contracts.json) & [Rendered Contracts Catalog (`generated/CONTRACTS-CATALOG.md`)](generated/CONTRACTS-CATALOG.md) — Single maintained specification for `CTR-DB-TX-SESSION`, `CTR-AUTH-SESSION-OTP`, `CTR-AGE-ELIGIBILITY`, `CTR-AUTHZ-RBAC-VENDOR`, `CTR-FEATURE-CONTROLS`, `CTR-DIAGNOSTICS-PIPELINE`, `CTR-DISCOVERY-CATALOG`, `CTR-CUSTOMER-EXPLORATION`, `CTR-PRIVATE-PHOTO-STORAGE`, `CTR-SUPPORT-TICKETS`, `CTR-PAGER-WEBPUSH`, and `CTR-RELEASE-MIGRATION-DEPLOY`.
- [System Architecture (`ARCHITECTURE.md`)](ARCHITECTURE.md) — Request lifecycle, process boundaries, security invariants, and Mermaid flow diagrams.
- [Repository Map (`REPOSITORY-MAP.md`)](REPOSITORY-MAP.md) — Directory ownership and release-tarball inclusion rules.
- [Frontend Map (`FRONTEND-MAP.md`)](FRONTEND-MAP.md) — HTML entrypoints, `<script>` load order, `window.*` namespaces, modal controllers, storage, SW, and CSS cascade.
- [Backend Map (`BACKEND-MAP.md`)](BACKEND-MAP.md) — `server/index.js`, `server/app.js` pipeline, `server/routes.js` (30 domain handlers), `server/admin-routes.js`, `server/customer-exploration-routes.js`, and `lib/db-tx.js`.
- [Data Model (`DATA-MODEL.md`)](DATA-MODEL.md) — Reconstructed PostgreSQL tables (cross-verifiable against live PostgreSQL `pg_catalog` via `validate --verify-db`), `FORCE ROW LEVEL SECURITY` `app.*` GUCs, triggers, and roles.
- [API Contracts (`API-CONTRACTS.md`)](API-CONTRACTS.md) & [Shared API Envelopes (`contracts/shared-api-envelopes.md`)](contracts/shared-api-envelopes.md) — Route groups, request/response envelopes, headers, status/error codes, and idempotency rules.
- [Authentication, Roles & Ownership (`AUTH-AND-PERMISSIONS.md`)](AUTH-AND-PERMISSIONS.md) — Email OTP, session cookies, 14+ age policy, RBAC matrix, Act-on-Behalf, and UI-vs-backend boundaries.

### Platform Controls, Operations & Quality
- [Feature Controls (`FEATURE-CONTROLS.md`)](FEATURE-CONTROLS.md) — Declarative registry, dependency DAG, DB + CLI management, and per-method HTTP gates.
- [Diagnostics & Errors (`DIAGNOSTICS-AND-ERRORS.md`)](DIAGNOSTICS-AND-ERRORS.md) — Fingerprinting, PII redaction, `X-Correlation-Id`, retention, and support-ticket linking.
- [Configuration (`CONFIGURATION.md`)](CONFIGURATION.md) & [Configuration Keys Contract (`contracts/configuration-keys.json`)](contracts/configuration-keys.json) — `BITESHARK_*` / `TRUCKLY_*` variable names, defaults, fail-closed rules, and secret classes (zero secret values).
- [Storage & Files (`STORAGE-AND-FILES.md`)](STORAGE-AND-FILES.md) — Browser storage, DB `BYTEA` evidence, private customer photo derivatives, persistent VPS paths, and encrypted backups.
- [Dependencies & Licenses (`DEPENDENCIES-AND-LICENSES.md`)](DEPENDENCIES-AND-LICENSES.md) — Direct npm packages, CDN assets, vendored `acorn@8.14.1`, and historical archives.
- [UI & Content Guide (`UI-AND-CONTENT-GUIDE.md`)](UI-AND-CONTENT-GUIDE.md) — Current observed visual conventions, `.truck-card` compact card rules, cascade traps, and mandatory truthful copy rules.
- **[Unfilled Design Style Guide & Decision Questionnaire (`style-guide/README.md`)](style-guide/README.md)**, **[Completion Reminder (`style-guide/COMPLETION-REMINDER.md`)](style-guide/COMPLETION-REMINDER.md)** & **[UI Element Inventory (`style-guide/ui-element-inventory.md`)](style-guide/ui-element-inventory.md)** — Intentionally blank structured design questionnaire (`style-guide/decisions.json`) separating observed UI elements from unanswered team decisions.
- [Accessibility (`ACCESSIBILITY.md`)](ACCESSIBILITY.md) — Skip links, `openModalDialog` focus traps, touch targets, and reduced motion.
- [Testing (`TESTING.md`)](TESTING.md) — Unit, disposable-PostgreSQL integration, headless Chrome E2E, installer, and registry suites + execution reporting standards.
- [Migrations (`MIGRATIONS.md`)](MIGRATIONS.md) — `scripts/run-migrations.cjs` checksum enforcement, role grants/revokes, and cross-branch numbering rules.
- [Release & Rollback (`RELEASE-AND-ROLLBACK.md`)](RELEASE-AND-ROLLBACK.md) — Tarball build, `install-staging-release.sh`, `biteshark-staging2-ctl`, health gates, and forward-only DB rollback caveats.
- [Compatibility & Deprecation (`COMPATIBILITY-AND-DEPRECATION.md`)](COMPATIBILITY-AND-DEPRECATION.md) — Honest change-impact classifications, dual-prefix deprecation rules, and frozen contracts.
- [Known Drift & Discrepancies (`KNOWN-DRIFT.md`)](KNOWN-DRIFT.md) — Verified doc-vs-code mismatches, latent runtime defects (`KD-001`), duplicate helpers, and cross-branch divergence.
- [Handbook Maintenance (`MAINTENANCE.md`)](MAINTENANCE.md) — Routine vs occasional CLI operations, drift-baseline governance, and CI behavior.

---

## 2. Domain-Level Technical Maps (`docs/engineering/domains/`)

1. [Discovery & Catalog](domains/discovery-catalog.md) (`CTR-DISCOVERY-CATALOG`)
2. [Maps & Location](domains/maps-and-location.md)
3. [Vendor Onboarding & Administration](domains/vendor-onboarding-and-admin.md) (`CTR-AUTHZ-RBAC-VENDOR`)
4. [Customer Onboarding & Welcome](domains/customer-onboarding.md)
5. [Authentication & Email Delivery](domains/auth-and-email.md) (`CTR-AUTH-SESSION-OTP`, `CTR-AGE-ELIGIBILITY`)
6. [Event Inquiries & Bookings](domains/bookings.md)
7. [Community Hub & Moderation](domains/community-and-moderation.md)
8. [Support Tickets & Feedback](domains/support-and-feedback.md) (`CTR-SUPPORT-TICKETS`)
9. [Feature Controls](domains/feature-controls.md) (`CTR-FEATURE-CONTROLS`)
10. [Error & Operational Diagnostics](domains/diagnostics.md) (`CTR-DIAGNOSTICS-PIPELINE`)
11. [Local Guides & Editorial Stories](domains/local-guides-and-stories.md) (`CTR-CUSTOMER-EXPLORATION`)
12. [Visit Journal & Food Passport](domains/visits-and-passport.md) (`CTR-CUSTOMER-EXPLORATION`)
13. [Customer & Listing Photos](domains/photos.md) (`CTR-PRIVATE-PHOTO-STORAGE`)
14. [Badges, Points & Weekly Challenges](domains/badges-points-and-challenges.md) (`CTR-CUSTOMER-EXPLORATION`)
15. [Suggested Trails](domains/suggested-trails.md) (`CTR-CUSTOMER-EXPLORATION`)
16. [Pickup Pagers & Web Push Notifications](domains/pager-and-notifications.md) (`CTR-PAGER-WEBPUSH`)
17. [Legal Disclosures & Launch Readiness](domains/legal-and-readiness.md) (`CTR-AGE-ELIGIBILITY`)

---

## 3. Machine-Generated Reference Catalogs (`docs/engineering/generated/`)

- [CONTRACTS-CATALOG.md](generated/CONTRACTS-CATALOG.md) — Rendered reference of all 12 high-value shared contracts (`CTR-*`).
- [SYMBOL-INDEX.md](generated/SYMBOL-INDEX.md) — Module directory + links to the 5 complete, **non-truncated** area symbol catalogs:
  - [symbols/server-and-runtime.md](generated/symbols/server-and-runtime.md) (`server/`, `packages/`)
  - [symbols/shared-libraries.md](generated/symbols/shared-libraries.md) (`lib/`)
  - [symbols/domain-api-handlers.md](generated/symbols/domain-api-handlers.md) (`api/`)
  - [symbols/frontend-scripts.md](generated/symbols/frontend-scripts.md) (`public/`)
  - [symbols/scripts-and-tooling.md](generated/symbols/scripts-and-tooling.md) (`scripts/`, `tools/`)
- [ROUTE-INVENTORY.md](generated/ROUTE-INVENTORY.md) — AST-extracted HTTP endpoint inventory with method basis, dispatchers, auth/authz evidence, per-method feature gates, confirmed frontend callers, and 3-tier test references.
- [FRONTEND-INVENTORY.md](generated/FRONTEND-INVENTORY.md) — Screens, script/stylesheet orders, HTML IDs, inline handlers, storage keys, and CSS metrics.
- [SCHEMA-INVENTORY.md](generated/SCHEMA-INVENTORY.md) — Ordered SQL migrations, reconstructed tables/columns/constraints/indexes/RLS policies, and Mermaid `erDiagram`.
- [DRIFT-REPORT.md](generated/DRIFT-REPORT.md) — Automated drift findings and audited scoped suppressions.
- [registry-summary.json](generated/registry-summary.json) — Deterministic JSON summary verified against [schemas/registry-summary.schema.json](schemas/registry-summary.schema.json).

---

## 4. Architecture Decision Records & JSON Schemas

- [ADR 001: Offline Vendored AST Registry](decisions/001-offline-vendored-ast-registry.md)
- [ADR 002: Branch-Specific Generated Inventories & Digest Provenance](decisions/002-branch-specific-generated-inventories.md)
- [Code Registry Snapshot Schema](schemas/code-registry.schema.json)
- [Registry Summary Schema](schemas/registry-summary.schema.json)
- [Change-Impact Schema](schemas/change-impact.schema.json)
- [Drift Baseline Debt Ledger](schemas/drift-baseline.json) & [Schema](schemas/drift-baseline.schema.json)
- [Suppressions Schema](schemas/drift-suppressions.schema.json) & [Shared Contracts Schema](schemas/shared-contracts.schema.json)
- [Style Guide Decisions Schema](schemas/style-guide-decisions.schema.json)
