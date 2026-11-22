# ADR 002 — Branch-Specific Generated Inventories & Digest-Verified Idempotence

- **Status**: Accepted
- **Date**: 2026-11-22
- **Scope**: `docs/engineering/generated/**`, `docs/engineering/schemas/drift-baseline.json`, `.github/workflows/truckly-source-review.yml`

## Context

Two active development streams diverge from merge-base `a4e9f532223f88486610a3c8a1babaa58c6e4ee6`:
- Customer Exploration (`83181ba`: 27 migrations, 51 tables, 21 feature controls, 97 HTTP routes).
- Miniature Truck Map Markers (`a2f0135`: 26 migrations, 47 tables, 14 feature controls, 85 HTTP routes, plus `public/map-cards.js` & `public/map-cards.css`).

Two pitfalls had to be avoided:
1. Flattening branch differences in shared documentation so one branch claims symbols/tables that only exist on the other.
2. Embedding volatile UTC timestamps or self-referential `HEAD` SHAs inside committed generated files, which either causes noisy diffs on every run or creates a Git chicken-and-egg mismatch the moment `git commit` advances `HEAD`.

## Decision

1. **Separate Maintained vs Generated vs Per-Commit Artifacts**:
   - Human-maintained architectural/domain guides (`docs/engineering/*.md`, `docs/engineering/domains/*.md`) explicitly distinguish baseline (`a4e9f53`) contracts from branch-specific additions (`83181ba` vs `a2f0135`).
   - Committed generated reference catalogs (`docs/engineering/generated/*.md`, `registry-summary.json`, `drift-baseline.json`) omit volatile UTC timestamps and validate freshness using `deterministic_digest_sha256` computed over all scanned non-generated repository inputs.
   - Full raw AST snapshots (`registry-full-snapshot.json`, including `generated_at_utc`, exact `commit_sha`, and `working_tree_clean`) and merge-base `change-impact` reports are uploaded as CI workflow artifacts on every push and pull request rather than bloating Git history.
2. **Branch-Specific Regeneration on Integration**:
   - Whenever handbook/tooling updates are integrated into a staging or feature branch, `npm run registry:docs` is executed on that branch so `docs/engineering/generated/*` and `drift-baseline.json` reflect that branch's exact code.

## Consequences

- Running `npm run registry:docs` twice in a row produces byte-for-byte identical files.
- Committing updated generated docs does not invalidate `deterministic_digest_sha256`, so `npm run registry:validate` passes both locally and on detached-`HEAD` CI runners while immediately failing if application code, routes, migrations, or docs links change without regeneration/validation.
