# Handbook & Code Registry Maintenance Guide

Whenever you add, modify, or deprecate HTTP routes, SQL migrations, JavaScript exports/globals, HTML screens/IDs, feature controls, or `BITESHARK_*` configuration variables, run this exact workflow before opening a pull request or pushing to a staging branch.

---

## 1. Supported Registry CLI Commands

| Task | npm Script | Underlying Command |
|---|---|---|
| **Search any symbol, route, table, flag, config, or DOM ID** | `npm run registry:locate -- <query>` | `node tools/code-registry/cli.mjs locate <query>` |
| **Emit full JSON snapshot (with optional UTC timestamp)** | `npm run registry:scan -- --out /tmp/registry.json --include-timestamp` | `node tools/code-registry/cli.mjs scan ...` |
| **Regenerate `docs/engineering/generated/*` & baseline** | `npm run registry:docs` | `node tools/code-registry/cli.mjs generate-docs` |
| **Validate determinism, schemas, Markdown links & drift** | `npm run registry:validate` | `node tools/code-registry/cli.mjs validate` |
| **Cross-verify reconstructed SQL schema against disposable Postgres** | `node tools/code-registry/cli.mjs validate --verify-db` | Uses `BITESHARK_REGISTRY_VERIFY_PG_URL` or local Postgres |
| **Compare two Git refs / generate PR change-impact report** | `npm run registry:compare -- --base origin/working/biteshark-vps --head HEAD --merge-base` | `node tools/code-registry/cli.mjs compare ...` |
| **Run unit & fixture tests for the registry itself** | `npm run test:registry` | `node tests/code-registry.test.cjs` |

---

## 2. Step-by-Step Update Checklist for Developers

1. **Before Coding**:
   - Run `npm run registry:locate -- <name>` to find existing canonical implementations, callers, feature gates, and tests.
   - Check [BRANCH-AND-ENVIRONMENT-MAP.md](BRANCH-AND-ENVIRONMENT-MAP.md) and `migrations/` on both staging branches to avoid migration number or `<script>` load-order collisions.
2. **After Making Code / Schema / Config Changes**:
   - If you added an environment variable: add its name, alias, default, fail mode, and secret class (never values!) to [contracts/configuration-keys.json](contracts/configuration-keys.json) and [CONFIGURATION.md](CONFIGURATION.md).
   - If you changed domain behavior, routes, auth/RBAC, or feature controls: update the relevant maintained file in `docs/engineering/` or `docs/engineering/domains/`.
   - Regenerate the branch-specific catalogs:
     ```bash
     npm run registry:docs
     ```
   - Validate links, determinism, and structural drift:
     ```bash
     npm run registry:validate
     npm run test:registry
     ```
   - Review your ref comparison before pushing:
     ```bash
     npm run registry:compare -- --base origin/working/biteshark-vps --head WORKTREE
     ```

---

## 3. Scoped Suppression Policy (`tools/code-registry/suppressions.json`)

- Use `tools/code-registry/suppressions.json` **only** for verified, intentional patterns (such as documented post-render decorator wrappers in `public/*.js`), always providing a unique `id`, exact `category`, narrow `target` or `scope_prefix`, and explicit `reason`.
- Never add category-wide wildcard suppressions that hide broken Markdown links, duplicate HTML IDs, unregistered feature keys, invalid write-pause scopes, or migration sequence collisions.

---

## 4. CI Enforcement Behavior (`.github/workflows/truckly-source-review.yml`)

On every push and pull request:
1. Executes `node tests/code-registry.test.cjs` and `node tools/code-registry/cli.mjs validate` (blocking syntax parse failures, stale `registry-summary.json`, broken handbook links, and newly introduced high-confidence structural drift while tolerating recorded baseline debt in `docs/engineering/schemas/drift-baseline.json`).
2. Generates a full timestamped JSON inventory and a merge-base Markdown + JSON change-impact report and uploads them as workflow artifact **`biteshark-code-registry-impact`** (`contents: read` permission only, zero secret access).
