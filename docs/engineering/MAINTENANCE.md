# Handbook & Code Registry Maintenance Guide

This guide documents the routine developer workflow, occasional governance commands, drift-baseline rules, and CI checks for BiteShark's Shared Engineering Handbook and Code Registry (`tools/code-registry/`).

---

## 1. Routine Developer Workflow (`4` Commands)

### Before changing shared code
1. **Locate the symbol, contract, route, table, or flag**:
   ```bash
   npm run registry:locate -- <query>
   ```
   *(Add `--exact` for exact-identifier matches only, `--full` for unclipped caller lists, `--json` for machine output, or `--offset <M> --limit <N>` for pagination.)*
2. **Read the source file and check its `Confirmed Callers` and `Contracts`** (`CTR-*` in [generated/CONTRACTS-CATALOG.md](generated/CONTRACTS-CATALOG.md)).

### Before opening a PR or requesting review
1. **Regenerate reference inventories** *(updates `docs/engineering/generated/**` only — **never** modifies `drift-baseline.json`)*:
   ```bash
   npm run registry:docs
   ```
2. **Validate determinism, recursive JSON Schemas, contract targets, freshness, links & drift**:
   ```bash
   npm run registry:validate
   ```
3. **Run relevant domain tests** ([TESTING.md](TESTING.md)) and registry tests:
   ```bash
   npm run test:registry
   ```
4. **Review change impact** (including body-only edits, API/SQL attribute diffs, and affected consumers):
   ```bash
   npm run registry:compare -- --base origin/working/biteshark-vps --head WORKTREE --merge-base
   ```

### When maintained contract / prose updates are NOT needed
- **No maintained doc edit needed**: Cosmetic UI/CSS adjustments, internal implementation-body bug fixes that preserve existing inputs/outputs/permissions/tables, and test-only additions only require `npm run registry:docs && npm run registry:validate`.
- **Update maintained files only when changing shared facts**:
  - New/changed `BITESHARK_*` env var -> [contracts/configuration-keys.json](contracts/configuration-keys.json) + [CONFIGURATION.md](CONFIGURATION.md).
  - Changed high-value shared interface (`CTR-*` inputs, outputs, permissions, tables, routes, or test files) -> [contracts/shared-contracts.json](contracts/shared-contracts.json) (the single maintained contract source; `generated/CONTRACTS-CATALOG.md` updates automatically on `npm run registry:docs`).
  - Changed architectural invariant or domain workflow -> relevant page in `docs/engineering/` or `docs/engineering/domains/`.

---

## 2. Occasional Governance & Verification Operations

| Operation | Command | Purpose & Rules |
|---|---|---|
| **Explicitly accept reviewed baseline debt** | `npm run registry:accept-drift -- --finding <DRIFT:...> --reason "<why >= 12 chars>" --ref "<issue/PR/doc>"` | Records an auditable entry in `docs/engineering/schemas/drift-baseline.json`. Never run routinely to silence fixable bugs; broken links in `docs/engineering/**`, `AGENTS.md`, or `README.md` are never eligible for baseline acceptance. |
| **Prune resolved baseline debt** | `npm run registry:prune-drift` *(or `-- --dry-run`)* | Cleanly removes entries from `drift-baseline.json` whose underlying findings have been resolved in code/docs. |
| **Add an intentional-pattern suppression** | Edit `tools/code-registry/suppressions.json` | Reserved strictly for verified intentional design patterns (such as documented `<script>` load-order wrappers `openDetail` and `applyFilters`), never for backlog debt or category-wide wildcards. |
| **Cross-verify reconstructed SQL schema against PostgreSQL** | `node tools/code-registry/cli.mjs validate --verify-db` *(or `--verify-db=optional` locally)* | Migrates a disposable UTF-8 temporary database and compares tables, columns, normalized types, nullability, default presence, PK/FK constraints, explicit indexes, and `FORCE ROW LEVEL SECURITY` policies against `pg_catalog`. Fails hard (`exit 1`) if `--verify-db` (`required`) cannot reach PostgreSQL. |
| **Validate against trusted PR target baseline** | `node tools/code-registry/cli.mjs validate --trusted-baseline-ref origin/working/biteshark-vps` | Compares findings against the target branch's `drift-baseline.json` and `suppressions.json`, exposes governance edits prominently, and blocks PRs from hiding new high-confidence violations via unreviewed baseline/suppression edits. |
| **Export commit-bound full JSON snapshot** | `npm run registry:scan -- --out /tmp/registry.json --include-timestamp` | Produces the full `biteshark.code-registry.v2` artifact with exact `commit_sha`, `branch_or_ref`, and UTC timestamp. |

### Behavior When a Rule or Stable Finding ID Changes
- Finding IDs follow deterministic `DRIFT:<CATEGORY>:<NORMALIZED_PRIMARY_KEY>` (`drift-detector.mjs#makeStableFindingId`).
- Old baseline IDs are **never** silently reinterpreted to match different targets: if a rule or target path changes, the old ID appears in `validate`'s `stale_resolved_baseline_ids` list (removable via `npm run registry:prune-drift`) and any newly detected high-confidence finding must be either fixed in code or explicitly reviewed and accepted under its new ID.

---

## 3. CI Behavior (`.github/workflows/truckly-source-review.yml`)

1. **`code-registry-and-handbook` job** (`contents: read` only):
   - Runs `node tests/code-registry.test.cjs`.
   - Runs `node tools/code-registry/cli.mjs validate --trusted-baseline-ref <BASE_REF>` (where `<BASE_REF>` is `origin/${GITHUB_BASE_REF}` on `pull_request` and `github.event.before` on `push`).
   - Generates a commit-bound full snapshot and meaningful ref comparison (`--merge-base` on PRs; `event.before -> HEAD` on pushes — never comparing `HEAD` to itself).
   - Uploads `biteshark-code-registry-impact` diagnostic artifacts with `if: always()` so validation/drift/impact evidence is inspectable even when a check fails.
2. **`postgres-backend-hardening` / DB schema verification**:
   - Executes required `node tools/code-registry/cli.mjs validate --verify-db` against PostgreSQL 16 (failing if PostgreSQL is unreachable or any catalog check mismatches).
   - Documentation/registry-only changes run syntax/contract checks, `code-registry-and-handbook`, and required PostgreSQL `--verify-db` schema verification without running unrelated 12-minute headless Chrome E2E suites unless runtime, migration, deployment, script, or application test files changed.
