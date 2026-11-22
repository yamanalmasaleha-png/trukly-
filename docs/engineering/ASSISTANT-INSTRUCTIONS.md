# Coding Assistant Instructions (Antigravity & GPT Assistants)

This guide defines how AI coding assistants (Google Antigravity, ChatGPT / Codex / GPT-based agents, and CLI coding agents) must work inside the BiteShark repository (`https://github.com/yamanalmasaleha-png/trukly-/`).

---

## 1. Required Assistant Workflow on Every Task

1. **Orient via `AGENTS.md` and `docs/engineering/START-HERE.md` First**:
   - Read [AGENTS.md](../../AGENTS.md) and [START-HERE.md](START-HERE.md).
   - Check `git status`, current branch, `git rev-parse HEAD`, and [BRANCH-AND-ENVIRONMENT-MAP.md](BRANCH-AND-ENVIRONMENT-MAP.md) before making assumptions about `staging.biteshark.live` (`4100`) vs `staging2.biteshark.live` (`4102`).
2. **Locate Connected Records Instead of Guessing**:
   - Run `node tools/code-registry/cli.mjs locate <identifier>` (add `--exact`, `--full`, or `--json` when needed) to inspect exact symbol locations, confirmed vs candidate callers, linked `CTR-*` contracts, HTTP routes, SQL tables, feature flags, and test mappings.
   - Read the actual implementation file before proposing or applying edits. When older prose in `docs/*.md` conflicts with code, check [KNOWN-DRIFT.md](KNOWN-DRIFT.md) and treat verified code as current behavior while flagging policy ambiguities to the user.
3. **Reuse Canonical Components ([NAMING-CONVENTIONS.md](NAMING-CONVENTIONS.md) & [canonical-components.json](contracts/canonical-components.json))**:
   - DB transactions & session locks: `withTransaction` (`lib/db-tx.js`, `CTR-DB-TX-SESSION`).
   - Env vars: `readEnvCompat` (`lib/env-compat.js`) + register variable names (never values) in `docs/engineering/contracts/configuration-keys.json`.
   - Browser HTTP JSON calls: `window.bitesharkDiagnostics.fetchJsonBounded` (`public/diagnostics-client.js`, `CTR-DIAGNOSTICS-PIPELINE`).
   - HTML escaping: 5-entity pattern matching `escapeHtmlSafe` (`public/diagnostics-client.js`) on browser / `escapeHtml` (`server/app.js`) on server.
   - Modals: `openAppModal` / `rxOpenModal` / `adminOpenModal` delegating to `openModalDialog` (never raw `.hidden = false` without focus management).
   - CSS cards & buttons: inspect `public/app.js#cardHTML`, `public/color-calm.css`, and `public/theme.css:20` before adding styles; avoid `!important` override sheets.
4. **Preserve Shared Contracts, Baseline Governance & Branch Isolation**:
   - Preserve response envelopes ([contracts/shared-api-envelopes.md](contracts/shared-api-envelopes.md)) and shared contracts ([contracts/shared-contracts.json](contracts/shared-contracts.json)).
   - Never delete any of the 30 `api/*.js` routes (`REGISTERED_DOMAIN_ROUTE_COUNT === 30`), never edit applied `migrations/*.sql`, and never perform unrequested cleanup or cross-branch feature merges.
   - Never edit `docs/engineering/schemas/drift-baseline.json` or `tools/code-registry/suppressions.json` to hide a newly introduced violation without explicit user review.
   - Never read into commits/output or expose `.env` files, `/etc/*/staging.env`, SSH keys, OTPs, session cookies, or customer data.
5. **Respect the Intentionally Unfinished Design Style Guide ([style-guide/README.md](style-guide/README.md) & [style-guide/COMPLETION-REMINDER.md](style-guide/COMPLETION-REMINDER.md))**:
   - The design style guide is intentionally unfinished. **Never** invent approved style decisions, copy existing CSS values into blank fields, or infer approval from existing code, mockups, or assistant suggestions.
   - Before UI, layout, stylesheet, or copy work affected by the guide, inspect [style-guide/COMPLETION-REMINDER.md](style-guide/COMPLETION-REMINDER.md) and identify only the unanswered, draft, or unconfirmed items materially relevant to your task.
   - Ask Matt or Yaman when the work materially depends on an unanswered choice; continue independent backend, security, database, or orthogonal work without blocking; preserve existing UI conventions ([UI-AND-CONTENT-GUIDE.md](UI-AND-CONTENT-GUIDE.md)) for routine fixes while labeling any temporary UI choice clearly.
   - Record only answers explicitly supplied or approved by the team in `docs/engineering/style-guide/decisions.json`, then run `npm run style-guide:generate && npm run style-guide:validate` (or report if `COMPLETION-REMINDER.md` is stale when running read-only).
6. **Update Docs, Regenerate Registry & Report Verification Truthfully**:
   - Update affected `docs/engineering/**` pages when contracts/routes/tables/flags/configs change (cosmetic or internal-body-only fixes do not require contract JSON edits).
   - Run `npm run registry:docs`, `npm run registry:validate`, `npm run test:registry`, `npm run registry:compare -- --base origin/working/biteshark-vps --head WORKTREE --merge-base`, and the relevant domain tests ([TESTING.md](TESTING.md)).
   - Never claim unrun tests, skipped `--verify-db` checks, unexecuted deployments, or physical-device checks passed. Report exact commands, exit statuses, environment, and any remaining uncertainty.

---

## 2. Copyable Standing Instruction Block (For Antigravity & GPT Prompts)

Copy and paste the block below into custom instructions or task prompts for Antigravity or GPT assistants working on BiteShark:

```markdown
You are working in the BiteShark repository (`https://github.com/yamanalmasaleha-png/trukly-/`).
Before changing any code, SQL migration, route, stylesheet, feature control, or configuration:
1. Read `AGENTS.md` and `docs/engineering/START-HERE.md`, then inspect the relevant domain map in `docs/engineering/domains/` and shared contract in `docs/engineering/generated/CONTRACTS-CATALOG.md` (`docs/engineering/contracts/shared-contracts.json`).
2. Check your active Git branch, HEAD SHA, and `docs/engineering/BRANCH-AND-ENVIRONMENT-MAP.md` (`staging.biteshark.live` and `staging2.biteshark.live` are isolated environments; `biteshark.live` is a static holding page). Never deploy, force-push, rewrite history, delete branches, merge unrelated branches, or delete suspected unused code (`REGISTERED_DOMAIN_ROUTE_COUNT === 30`) unless explicitly authorized.
3. Run `npm run registry:locate -- <identifier>` (`node tools/code-registry/cli.mjs locate <identifier>`) and read the actual source files and confirmed consumers before editing. Reuse canonical helpers from `docs/engineering/contracts/canonical-components.json` (`withTransaction`, `readEnvCompat`, `window.bitesharkDiagnostics.fetchJsonBounded`, `openModalDialog`, `cardHTML` + `public/color-calm.css`).
4. Preserve backend security invariants (live row-locked RBAC via `reverifyPlatformAdminInTx` / `reverifyModeratorInTx` / `reverifyVendorMembershipInTx`, 14+ Pacific age gate, CSRF, rate limits, `FORCE ROW LEVEL SECURITY` `app.*` GUCs, immutable SQL migrations, and response envelopes in `docs/engineering/contracts/shared-api-envelopes.md`). Never expose or commit secrets, `.env` values, session cookies, or customer data.
5. Before UI, stylesheet, layout, or copy work, inspect `docs/engineering/style-guide/COMPLETION-REMINDER.md` (`docs/engineering/style-guide/README.md`). Never invent approved style decisions or copy existing CSS into blank fields; concisely surface only unanswered/draft items relevant to the task, continue independent work unblocked, record only explicit team answers in `decisions.json`, and refresh via `npm run style-guide:generate && npm run style-guide:validate`.
6. Before review, update maintained docs/contracts if shared interfaces changed, then run `npm run registry:docs` (which never auto-accepts drift), `npm run registry:validate`, `npm run test:registry`, and `npm run registry:compare -- --base origin/working/biteshark-vps --head WORKTREE --merge-base`, plus the relevant suites in `docs/engineering/TESTING.md`. Never edit `drift-baseline.json` or `suppressions.json` to silence new violations without explicit review, and never fabricate test, DB-verification, or deployment results.
```
