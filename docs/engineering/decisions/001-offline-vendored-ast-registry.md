# ADR 001 — Offline Syntax-Aware Code Registry Using Vendored `acorn@8.14.1`

- **Status**: Accepted
- **Date**: 2026-11-22
- **Scope**: `tools/code-registry/**`, `package.json`, `.gitattributes`

## Context

BiteShark requires a deterministic, syntax-aware inventory, drift-detection, and change-impact tool across two active developers and multiple branches (`working/biteshark-vps`, `feature/customer-exploration-journal-trails`, `testing/yaman-staging2`, `antigravity/staging2-latest`) without:
1. Executing untrusted or side-effecting application modules (`public/*.js` browser scripts mutate `window`/`document` at top level; `server/index.js` opens sockets and DB pools at import time).
2. Modifying `package.json` runtime `dependencies` or `package-lock.json` in ways that create lockfile merge conflicts with feature branches (such as `83181ba`, which adds `sharp@0.35.5` to `package-lock.json`) or bloat the 961 MiB VPS production `npm ci --omit=dev` install.
3. Requiring network access during local scans or GitHub Actions CI runs.

## Decision

1. Vendor the single-file zero-dependency ECMAScript parser **`acorn@8.14.1`** (`MIT` License, SHA-256 `4c09beddbf61851ae40b86d32bc5b05eb0ce1ac3d0145676c2609d825abedf87`) under `tools/code-registry/vendor/acorn/` alongside its `LICENSE` and `package.json`.
2. Exclude `tools` and `docs/engineering` from deployable Linux release tarballs via `.gitattributes` (`export-ignore`) so production/staging release archives (`scripts/build-linux-release-tarball.cjs`) remain completely unchanged.
3. Exclude `tools/code-registry/vendor/**` (`EXCL_VENDORED_TOOLING`) and `docs/engineering/generated/**` (`EXCL_GENERATED_REGISTRY_OUTPUTS`) from self-ingestion in `tools/code-registry/schema-versions.mjs`, reporting all exclusions explicitly in scan outputs.
4. Pair AST analysis for JS/ESM/CJS/inline-HTML handlers with comment-aware stateful scanners for HTML5, CSS3, and PostgreSQL `migrations/*.sql`, and provide an optional `--verify-db` disposable PostgreSQL cross-check in `tools/code-registry/cli.mjs`.

## Consequences

- `npm run registry:scan`, `npm run registry:docs`, `npm run registry:validate`, and `npm run registry:compare` run 100% offline in ~1.5 seconds on Node >= 22 with zero `package-lock.json` churn.
- Dynamic property dispatch, computed string concatenation, and runtime reflection cannot be resolved statically with 100% completeness; `scanner.mjs` labels those sites `dynamic: true` / `unresolved` rather than fabricating edges.
