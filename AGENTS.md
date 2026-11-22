# BiteShark Standing Instructions for Developers & Coding Assistants (`AGENTS.md`)

Read [docs/engineering/START-HERE.md](docs/engineering/START-HERE.md) and the [Shared Engineering Handbook](docs/engineering/README.md) before modifying code, schema, styles, configuration, or deployment files in `https://github.com/yamanalmasaleha-png/trukly-/`.

For detailed Antigravity and GPT assistant workflows, see [docs/engineering/ASSISTANT-INSTRUCTIONS.md](docs/engineering/ASSISTANT-INSTRUCTIONS.md).

---

## 1. Mandatory Pre-Change Inspection Rules

1. **Inspect Actual Implementation First**: Never rely on memory, screenshots alone, or older prose docs when existing docs disagree with code. Locate connected definitions, callers, contracts, and tests first:
   ```bash
   npm run registry:locate -- <identifier|route|table|flag|dom-id|CTR-ID>
   ```
2. **Use Exact Existing Identifiers & Canonical Helpers**: Reuse exact symbol names, database table/column names, feature keys (`lib/feature-controls.js`), diagnostic keys (`lib/diagnostics.js`), DOM IDs, and `BITESHARK_*` configuration names. Check [NAMING-CONVENTIONS.md](docs/engineering/NAMING-CONVENTIONS.md), [canonical-components.json](docs/engineering/contracts/canonical-components.json), and [shared-contracts.json](docs/engineering/contracts/shared-contracts.json) before introducing any helper, route, or global.
3. **Consult Shared Contracts & Cascades Before Editing**:
   - High-value shared interfaces (`CTR-*`): [generated/CONTRACTS-CATALOG.md](docs/engineering/generated/CONTRACTS-CATALOG.md).
   - HTTP APIs & response shapes (bare payloads on `api/*.js` vs `{ ok: true, ... }` on governance/auth/exploration routes): [API-CONTRACTS.md](docs/engineering/API-CONTRACTS.md) & [shared-api-envelopes.md](docs/engineering/contracts/shared-api-envelopes.md).
   - Frontend `<script>` load-order wrappers (`openDetail`, `applyFilters`), DOM ownership, and CSS cascade: [FRONTEND-MAP.md](docs/engineering/FRONTEND-MAP.md) & [UI-AND-CONTENT-GUIDE.md](docs/engineering/UI-AND-CONTENT-GUIDE.md).
   - **Intentionally Unfinished Design Style Guide**: [style-guide/README.md](docs/engineering/style-guide/README.md) & [style-guide/COMPLETION-REMINDER.md](docs/engineering/style-guide/COMPLETION-REMINDER.md) — **Never invent approved style decisions or fill blank fields from existing CSS.** Before UI/style/copy work affected by this guide, inspect `COMPLETION-REMINDER.md`, concisely remind Matt and Yaman only of unanswered decisions relevant to the current task without blocking unrelated backend/security work, record only explicit team answers in `decisions.json`, and run `npm run style-guide:generate && npm run style-guide:validate`.
   - PostgreSQL migrations, `FORCE ROW LEVEL SECURITY` `app.*` GUCs, and `withTransaction` session locking: [DATA-MODEL.md](docs/engineering/DATA-MODEL.md) & [MIGRATIONS.md](docs/engineering/MIGRATIONS.md).
   - Roles (`Admin: Top`, `Admin: Mod`, `Vendor Owner`, `Vendor Staff`, `Customer`), 14+ age policy, and CSRF: [AUTH-AND-PERMISSIONS.md](docs/engineering/AUTH-AND-PERMISSIONS.md).

---

## 2. Branch, Worktree & Deployment Boundaries

1. **Know Which Branch & Environment You Are Targeting** ([BRANCH-AND-ENVIRONMENT-MAP.md](docs/engineering/BRANCH-AND-ENVIRONMENT-MAP.md)):
   - Primary staging (`https://staging.biteshark.live`, port `4100`, `/srv/truckly-staging`) and secondary staging (`https://staging2.biteshark.live`, port `4102`, `/srv/biteshark-staging2`) are isolated environments with distinct branches, databases, secrets, and service units.
   - `https://biteshark.live` is a static holding page — never deploy application services to the apex domain without explicit launch authorization.
2. **Respect Worktree & Scope Hygiene**:
   - Never discard uncommitted work, force-push, rewrite remote history, delete branches, or merge unrelated feature branches together unless explicitly instructed.
   - Verify `git config user.name` and `git config user.email` match the authenticated developer before committing or pushing; never substitute generic `noreply` placeholders or another developer's identity.
   - Do **not** perform drive-by refactors, broad renames, or deletion of suspected unused/orphan code (`REGISTERED_DOMAIN_ROUTE_COUNT === 30` in `server/routes.js` is an enforced contract).
3. **Zero Secret / Customer Data Exposure**:
   - Never read into prompts/commits, print, or commit `.env` files, `/etc/*/staging.env`, `/etc/*/migrator.env`, SSH keys, OTPs, session cookies, or real customer records. Document configuration variable **names** only in [configuration-keys.json](docs/engineering/contracts/configuration-keys.json).

---

## 3. Compatibility, Verification & Registry Maintenance

1. **Plan Compatibility for Shared Interfaces**:
   - SQL migrations in `migrations/` are **immutable and additive-only** once committed/applied (`scripts/run-migrations.cjs` verifies SHA-256 checksums). Coordinate migration sequence numbers across active branches before merging ([COMPATIBILITY-AND-DEPRECATION.md](docs/engineering/COMPATIBILITY-AND-DEPRECATION.md)).
   - Run a merge-base impact report before opening or merging cross-cutting changes:
     ```bash
     npm run registry:compare -- --base origin/working/biteshark-vps --head HEAD --merge-base
     ```
2. **Regenerate Reference Inventories Without Auto-Accepting Drift**:
   - `npm run registry:docs` updates `docs/engineering/generated/*` **without** altering `docs/engineering/schemas/drift-baseline.json`. Never edit `drift-baseline.json` or `suppressions.json` to silence a newly introduced violation without explicit review rationale.
   - Before review, run:
     ```bash
     npm run registry:docs
     npm run registry:validate
     npm run test:registry
     ```
3. **Honest Verification Reporting**:
   - Run the actual integration/browser/unit suites covering your change ([TESTING.md](docs/engineering/TESTING.md)). Static registry checks never prove runtime behavioral or security correctness.
   - **Never fabricate or extrapolate test, database-verification, hosted-staging, or physical-device results.** Report exact commands run, exact exit statuses, and any unverified or uncertain areas explicitly.
