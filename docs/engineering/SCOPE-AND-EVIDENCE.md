# Scope, Provenance & Static Analysis Evidence

This document defines what the BiteShark Code Registry (`tools/code-registry/`) scans, what it explicitly excludes, how provenance is recorded, and where static analysis is intentionally bounded.

---

## 1. Scanned First-Party Scope

`collectWorkspaceFiles()` in [schema-versions.mjs](../../tools/code-registry/schema-versions.mjs#L16-L32) scans the following repository roots:

| Root / File | Analysis Method | Purpose |
|---|---|---|
| `server/`, `lib/`, `packages/`, `api/` | `acorn@8.14.1` AST (`sourceType: 'module'`) + route/SQL/env/feature extractors | Standalone HTTP server, runtime adapter, shared backend services, and 30 domain handlers. |
| `public/*.js`, `public/sw.js` | `acorn@8.14.1` AST (`script` / `module` fallback) | Browser globals, `window.*` exports, DOM queries, dynamic `innerHTML` IDs, storage/cookie accesses, and `fetch` callers. |
| `public/*.html`, `public/policies/*.html`, `deploy/holding/index.html` | Comment-masked stateful HTML5 tag/attribute scanner + `acorn` inline-handler & `<script>` parser | Screens, static IDs, duplicate-ID checks, form fields, `data-*` attributes, script/stylesheet order, and inline `on*` handlers. |
| `public/*.css`, `public/policies/*.css`, `scripts/dev-workbench/*.css` | Comment-masked CSS3 token/selector/media-query scanner | `:root` custom properties, `@media` breakpoints, `!important` overrides, class/ID/behavioral selectors. |
| `migrations/*.sql` | Comment- & dollar-quote-aware PostgreSQL DDL/RLS reconstructor + optional disposable PostgreSQL cross-check | Ordered migrations, SHA-256 checksums, tables, columns, FKs, indexes, `FORCE ROW LEVEL SECURITY` policies, `app.*` GUCs, views, SQL functions, triggers. |
| `scripts/*.cjs`, `scripts/*.js`, `tests/*.cjs` | `acorn@8.14.1` AST | Operator CLIs, build scripts, simulator, and test-to-route cross-referencing. |
| `README.md`, `TECH_MAP.md`, `AGENTS.md`, `docs/**/*.md` | Fenced-block-aware Markdown link & claim verifier | Broken internal documentation links and migration-count drift. |
| `deploy/**`, `.github/**`, `package.json` | Text/JSON structural metadata | Systemd/Nginx/backup templates, CI workflow coverage, runtime package inventory. |

---

## 2. Explicit Exclusion Rules

Every scan outputs `scope.exclusion_rules` and `scope.excluded_paths` (`EXCL_*` in [schema-versions.mjs](../../tools/code-registry/schema-versions.mjs#L34-L70)):

| Rule ID | Pattern | Reason |
|---|---|---|
| `EXCL_GIT_INTERNAL` | `.git/**` | Git object database and reflogs. |
| `EXCL_NODE_MODULES` | `**/node_modules/**` | Installed third-party npm packages (inventoried via `package.json` and `package-lock.json` in [DEPENDENCIES-AND-LICENSES.md](DEPENDENCIES-AND-LICENSES.md)). |
| `EXCL_SECRET_AND_ENV_FILES` | `**/.env*` *(except `.example`/`.template`)*, `**/*.pem`, `**/*.key`, `**/*.passphrase`, `**/id_ed25519*`, `**/id_rsa*` | **Hard security boundary**: never ingest credentials, `.env` files, or private keys. |
| `EXCL_HISTORICAL_ARCHIVES` | `docs/archive/**`, `truckly-v63.zip`, `truckly-data.sql.gz` | Retired pre-VPS Hatchable snapshots retained in Git for historical audit only (`export-ignore`d from releases). |
| `EXCL_VENDORED_TOOLING` | `tools/code-registry/vendor/**` | Vendored `acorn@8.14.1` parser (`MIT`), documented in [DEPENDENCIES-AND-LICENSES.md](DEPENDENCIES-AND-LICENSES.md). |
| `EXCL_GENERATED_REGISTRY_OUTPUTS` | `docs/engineering/generated/**`, `docs/engineering/schemas/drift-baseline.json` | Self-ingestion exclusion so `npm run registry:docs` is 100% idempotent. |
| `EXCL_BINARY_MEDIA` | `*.png`, `*.jpg`, `*.jpeg`, `*.webp`, `*.ico`, `*.woff2`, `*.gz`, `*.zip`, `*.gpg` | Cataloged in `binary_assets` by path, byte size, and SHA-256 without text parsing. |

---

## 3. Provenance & Determinism Rules

1. **Full JSON Snapshots (`cli.mjs scan --include-timestamp`)**:
   - Record `repository`, `branch_or_ref`, exact 40-char `commit_sha`, `working_tree_clean`, `dirty_file_count`, `generated_at_utc`, `generator.version` (`1.0.0`), `schema_version` (`biteshark.code-registry.v1`), `scope`, `parse_failures`, `coverage_counts`, and `deterministic_digest_sha256`.
2. **Committed Generated Reference Catalogs (`docs/engineering/generated/*`)**:
   - Omit volatile `generated_at_utc` timestamps and validate against `deterministic_digest_sha256` so two consecutive runs on the same source tree produce byte-identical outputs and committing generated docs never invalidates their own digest ([ADR 002](decisions/002-branch-specific-generated-inventories.md)).
3. **Commit-Pinned Source Links**:
   - Human-maintained architectural findings cite commit-pinned GitHub blob URLs (for base commit [`a4e9f532223f88486610a3c8a1babaa58c6e4ee6`](https://github.com/yamanalmasaleha-png/trukly-/tree/a4e9f532223f88486610a3c8a1babaa58c6e4ee6), [`83181ba0fea67183e21781896447f19f1a8f4860`](https://github.com/yamanalmasaleha-png/trukly-/tree/83181ba0fea67183e21781896447f19f1a8f4860), and [`a2f0135c29f2cbdcfb74a8961f52905e0441ceba`](https://github.com/yamanalmasaleha-png/trukly-/tree/a2f0135c29f2cbdcfb74a8961f52905e0441ceba)) alongside symbol names so reorganizing line numbers does not orphan provenance.

---

## 4. Honest Limitations of Static Analysis

This registry **never** executes application modules to discover exports and **never** claims static AST analysis is a complete runtime call graph:

| Construct | How Registry Handles It | Limitation / Effect on Coverage |
|---|---|---|
| Dynamic URL templates (``fetch(`/api/trucks/${id}`)``) | Extracted as `url_pattern: '/api/trucks/:expr'`, `dynamic: true` | Dynamic query parameters or runtime-constructed base paths are marked `dynamic: true`. |
| Computed property dispatch (`obj[action]()`, `window[fnName]()`) | Recorded as `<computed_or_iife>` or omitted from static identifier edges | Callers invoking functions via dynamic map keys require runtime/grep confirmation. |
| Imperative DOM creation (`document.createElement` + `el.id = '...'` or template strings) | Static `id="..."` literals and `el.id = '...'` prefixes (`>= 2` chars) are indexed in `dynamic_dom_definitions` | Fully computed IDs (`el.id = someVar`) cannot be matched statically against `getElementById`. |
| CSS behavioral & JS-toggled classes (`.show`, `.active`, `.food-map-card`) | Indexed in `css_stylesheets[*].class_selectors` without claiming unused status | Selector usage is **never** judged solely from static `.html` markup because `public/*.js` constructs class lists dynamically. |
| SQL schema reconstruction (`migrations/*.sql`) | Reconstructed via comment/dollar-quote-safe DDL parser (`schema_basis: 'reconstructed_from_repository_migrations'`) | Complex procedural PL/pgSQL `DO $$ ... $$` blocks are verified via `node tools/code-registry/cli.mjs validate --verify-db` against a disposable PostgreSQL instance. |
