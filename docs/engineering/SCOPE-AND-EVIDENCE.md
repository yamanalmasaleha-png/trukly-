# Scope, Provenance, Digests & Static Analysis Evidence

This document defines what the BiteShark Code Registry (`tools/code-registry/`, `v2.0.0`) scans, what each SHA-256 digest covers, how committed vs CI provenance works, and where static analysis is intentionally bounded.

---

## 1. Scanned First-Party Scope

`collectWorkspaceFiles()` in [schema-versions.mjs](../../tools/code-registry/schema-versions.mjs) scans `api/`, `lib/`, `server/`, `packages/`, `public/`, `migrations/`, `scripts/`, `deploy/`, `tools/`, `tests/`, `docs/`, `.github/`, `package.json`, `README.md`, `TECH_MAP.md`, and `AGENTS.md`:

| Root / File | Analysis Method | Extracted Evidence |
|---|---|---|
| `server/`, `lib/`, `packages/`, `api/`, `tools/*.mjs` | `acorn@8.14.1` AST + lexical/import resolver + AST-bounded route extractor | Symbols, scoped nested/anonymous IDs, normalized AST `body_fingerprint_sha256`, `literals_fingerprint_sha256`, ESM/CJS imports/exports, `confirmed_static` vs `inferred_candidate` call edges, AST-bounded HTTP routes, per-method RBAC & feature gates. |
| `public/*.js`, `public/sw.js` | `acorn@8.14.1` AST + IIFE/window-namespace & page-script global resolver | Browser globals, `window.biteshark*` namespace method bindings, `documented_wrapper` chains (`openDetail`, `applyFilters`), DOM queries, dynamic `innerHTML` IDs, storage/cookie accesses, and exact-path `fetch` consumers. |
| `public/*.html`, `public/policies/*.html`, `deploy/holding/index.html` | Comment-masked HTML5 scanner + `acorn` inline-handler & `<script>` parser | Screens, static IDs, duplicate-ID checks, form fields, `data-*` attributes, script/stylesheet load order, and page-scoped inline `on*` handler resolution. |
| `public/*.css`, `public/policies/*.css`, `scripts/dev-workbench/*.css` | Comment-masked CSS3 token/selector/media-query scanner | `:root` custom properties, `@media` breakpoints, `!important` counts, class/ID/behavioral selectors. |
| `migrations/*.sql`, `scripts/run-migrations.cjs` | Comment- & dollar-quote-aware DDL/RLS reconstructor + `validate --verify-db` `pg_catalog` cross-check | Ordered migrations, SHA-256 checksums, `CREATE TABLE` & comma-split `ALTER TABLE` (`ADD/DROP/ALTER COLUMN`, `ADD/DROP CONSTRAINT`, `ENABLE/FORCE RLS`), `DROP/CREATE POLICY`, `DROP/CREATE INDEX`, views, functions, triggers, and manual-review flags on dynamic PL/pgSQL. |
| `scripts/*.cjs`, `tests/*.cjs` | `acorn@8.14.1` AST | Operator CLIs, build scripts, static test HTTP calls (`static_http_call`), and route string mentions (`candidate_string_mention`). |
| `docs/**/*.md`, `README.md`, `TECH_MAP.md`, `AGENTS.md` | Fenced-block-aware Markdown link & migration-range verifier | Broken internal documentation links and migration-count drift. |
| `docs/engineering/contracts/*.json` | Recursive JSON Schema validator + live referential integrity check | Verifies every symbol, route, table, feature flag, config key, and test file referenced in `shared-contracts.json` and `route-overrides.json` exists. |

---

## 2. Explicit Exclusion Rules (`EXCL_*`)

| Rule ID | Pattern | Reason |
|---|---|---|
| `EXCL_GIT_INTERNAL` | `.git/**` | Git object database and reflogs. |
| `EXCL_NODE_MODULES` | `**/node_modules/**` | Installed third-party npm packages (tracked via `package.json` / `package-lock.json`). |
| `EXCL_SECRET_AND_ENV_FILES` | `**/.env*` *(except `.example`/`.template`)*, `**/*.pem`, `**/*.key`, `**/*.passphrase`, `**/id_ed25519*`, `**/id_rsa*` | **Hard security boundary**: never read or ingest credentials, `.env` files, or private keys. |
| `EXCL_HISTORICAL_ARCHIVES` | `docs/archive/**`, `truckly-v63.zip`, `truckly-data.sql.gz` | Retired pre-VPS snapshots retained in Git for historical audit only. |
| `EXCL_VENDORED_TOOLING` | `tools/code-registry/vendor/**` | Vendored `acorn@8.14.1` parser (`MIT`). |
| `EXCL_GENERATED_REGISTRY_OUTPUTS` | `docs/engineering/generated/**`, `docs/engineering/schemas/drift-baseline.json` | Prevents generated-output self-ingestion so `npm run registry:docs` is 100% idempotent; `drift-baseline.json` is governed separately via `governance_digest_sha256`. |
| `EXCL_BINARY_MEDIA` | `*.png`, `*.jpg`, `*.jpeg`, `*.webp`, `*.ico`, `*.woff2`, `*.gz`, `*.zip`, `*.gpg`, `*.pdf` | Cataloged in `binary_assets` by path, byte size, and SHA-256 without text parsing. |

---

## 3. Exact Digest Definitions & Provenance Convention

1. **`source_analysis_digest_sha256` (`deterministic_digest_sha256`)**:
   - Covers `scope.included_files_manifest_sha256` (CRLF->LF normalized content hashes of every included source, migration, contract, handbook doc, CI workflow, test, and `tools/code-registry/` file + binary asset SHA-256s) **and** all deterministically sorted extracted AST/HTML/CSS/SQL/route/contract/drift structures (using locale-independent ASCII codepoint ordering).
   - **Excludes**: Git `commit_sha`, `branch_or_ref`, `working_tree_clean`, `generated_at_utc`, `docs/engineering/generated/**`, `drift-baseline.json`, and untracked local `node_modules/` / `.env*` presence.
   - **Guarantee**: Identical source content produces the exact same 64-hex digest on branch checkouts, detached HEAD checkouts, Windows (CRLF), and Linux (LF), while any relevant source/doc/tooling edit makes `docs/engineering/generated/*` stale until `npm run registry:docs` is run.
2. **`governance_digest_sha256`**:
   - Covers canonical `docs/engineering/schemas/drift-baseline.json` entries and `tools/code-registry/suppressions.json` rules.
3. **Committed vs CI Artifact Provenance**:
   - Committed files in `docs/engineering/generated/*` use `provenance_mode: "committed_source_digest"` (no volatile branch name or self-referential final commit SHA).
   - Commit-bound CI/audit snapshots (`npm run registry:scan -- --include-timestamp`) record exact 40-char `commit_sha`, `branch_or_ref`, working-tree cleanliness, and `generated_at_utc`.

---

## 4. Honest Analysis & Verification Boundaries

| Mechanism | What It Verifies | What It Does NOT Prove |
|---|---|---|
| **AST Route Extractor** (`backend-db-analyzer.mjs`) | Bounded AST branches/exports in `server/routes.js`, `server/app.js`, `server/admin-routes.js`, `server/customer-exploration-routes.js`; sequential router guards; 1-hop intra-module permission helpers; per-method `ROUTE_FEATURE_ENFORCEMENT_RULES`. | Does not execute HTTP requests or verify business-logic branches inside arbitrary external libraries; unresolved dynamic routes are marked `UNRESOLVED` rather than guessed. |
| **Relationship Resolver** (`relationship-resolver.mjs`) | Distinguishes `confirmed_static`, `documented_wrapper`, `inferred_candidate`, and `dynamic_unresolved`. Never conflates same-named functions (`esc`, `load`, `render`, `getSummary`) across modules. | Cannot resolve runtime reflection, `eval`, or arbitrary callback arguments (`fn(tx)` is labeled `dynamic_unresolved`). |
| **Test Reference Extractor** | Separates `maintained_contract_mapping`, `static_http_call`, and `candidate_string_mention`. | Source presence of a test never proves the test was executed or that assertions are exhaustive; run the suite and check exit status. |
| **Recursive JSON Schema Validator** (`schema-validator.mjs`) | Enforces Draft 2020-12 types, `$defs`/`$ref`, enums, patterns, and nested object/array structures across all registry/impact/baseline/suppression/contract JSON files. | Validates structural contract conformance, not runtime application correctness. |
| **Database Verification** (`validate --verify-db`) | When executed (`status: "VERIFIED"`), migrates an isolated UTF-8 disposable database and compares tables, columns, normalized types, nullability, default presence, PK/FK constraints, explicit indexes, and RLS policies against `pg_catalog`. | When omitted, reports `status: "NOT_RUN"`. Does not compare SQL CHECK expression ASTs or trigger procedural bodies (verified by `tests/*.integration.cjs`). |
