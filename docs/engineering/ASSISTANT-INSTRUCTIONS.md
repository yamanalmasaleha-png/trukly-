# Coding Assistant Instructions (Antigravity & GPT Assistants)

This guide defines how AI coding assistants (Google Antigravity, ChatGPT / Codex / GPT-based agents, and CLI coding agents) must work inside the BiteShark repository (`https://github.com/yamanalmasaleha-png/trukly-/`).

---

## 1. Required Assistant Workflow on Every Task

1. **Orient via `AGENTS.md` and `docs/engineering/README.md` First**:
   - Read [AGENTS.md](../../AGENTS.md) and [docs/engineering/README.md](README.md).
   - Check `git status`, current branch, `git rev-parse HEAD`, and [BRANCH-AND-ENVIRONMENT-MAP.md](BRANCH-AND-ENVIRONMENT-MAP.md) before making assumptions about `staging.biteshark.live` (`4100`) vs `staging2.biteshark.live` (`4102`).
2. **Query the Code Registry Instead of Guessing**:
   - Run `node tools/code-registry/cli.mjs locate <term>` to find exact symbol definitions, HTTP routes, SQL tables, feature flags, config keys, and HTML IDs.
   - Read the actual implementation file before proposing or applying edits. When older prose in `docs/*.md` conflicts with code, check [KNOWN-DRIFT.md](KNOWN-DRIFT.md) and treat verified code as current behavior while flagging policy ambiguities to the user.
3. **Reuse Canonical Components ([NAMING-CONVENTIONS.md](NAMING-CONVENTIONS.md))**:
   - DB transactions & session locks: `withTransaction` (`lib/db-tx.js`).
   - Env vars: `readEnvCompat` (`lib/env-compat.js`) + register in `docs/engineering/contracts/configuration-keys.json`.
   - Browser HTTP JSON calls: `window.bitesharkDiagnostics.fetchJsonBounded` (`public/diagnostics-client.js`).
   - HTML escaping: `window.bitesharkDiagnostics.escapeHtml` (browser) / `escapeHtml` (`server/app.js`).
   - Modals: `openAppModal` / `rxOpenModal` / `adminOpenModal` (never raw `.hidden = false` without focus management).
   - CSS cards & buttons: inspect `public/color-calm.css` and `public/theme.css:20` (`.primary, .secondary { width: 100% }`) before adding styles; avoid `!important` override sheets.
4. **Preserve Shared Contracts & Branch Isolation**:
   - Preserve response envelopes ([contracts/shared-api-envelopes.md](contracts/shared-api-envelopes.md)): bare payloads on `api/*.js` vs `{ ok: true, ... }` on governance/auth/exploration routes.
   - Never delete any of the 30 `api/*.js` routes (`REGISTERED_DOMAIN_ROUTE_COUNT === 30`), never edit applied `migrations/*.sql`, and never perform unrequested cleanup or cross-branch feature merges.
   - Never read into commits/output or expose `.env` files, `/etc/*/staging.env`, SSH keys, OTPs, session cookies, or customer data.
5. **Update Docs, Regenerate Registry & Report Verification Truthfully**:
   - Update affected `docs/engineering/**` pages, run `npm run registry:docs`, `npm run registry:validate`, `npm run test:registry`, and run the relevant domain integration/E2E tests ([TESTING.md](TESTING.md)).
   - Never claim unrun tests, unexecuted deployments, or physical-device checks passed. Explicitly report what was verified, what was skipped, and any open uncertainty.

---

## 2. Copyable Standing Instruction Block (For Antigravity & GPT Prompts)

Copy and paste the block below into custom instructions or task prompts for Antigravity or GPT assistants working on BiteShark:

```markdown
You are working in the BiteShark repository (`https://github.com/yamanalmasaleha-png/trukly-/`).
Before changing any code, SQL migration, route, stylesheet, feature control, or configuration:
1. Read `AGENTS.md` and `docs/engineering/README.md`, then inspect the relevant domain map in `docs/engineering/domains/` and contracts in `docs/engineering/contracts/`.
2. Check your active Git branch, HEAD SHA, and `docs/engineering/BRANCH-AND-ENVIRONMENT-MAP.md` (`staging.biteshark.live` and `staging2.biteshark.live` are isolated environments; `biteshark.live` is a holding page). Never deploy, force-push, rewrite history, delete branches, merge unrelated branches, or delete suspected unused code unless explicitly authorized.
3. Run `node tools/code-registry/cli.mjs locate <identifier>` and read the actual source files before editing. Use exact existing identifiers and canonical helpers from `docs/engineering/NAMING-CONVENTIONS.md` and `docs/engineering/contracts/canonical-components.json` (`withTransaction`, `readEnvCompat`, `fetchJsonBounded`, `openModalDialog`, `cardHTML` + `public/color-calm.css`).
4. Preserve backend security invariants (server-side RBAC, 14+ age gate, CSRF, rate limits, `FORCE ROW LEVEL SECURITY` `app.*` GUCs, immutable SQL migrations, and response envelopes in `docs/engineering/contracts/shared-api-envelopes.md`). Never expose or commit secrets, `.env` values, session cookies, or customer data.
5. Whenever you change routes, schema, symbols, flags, or config keys, update the corresponding maintained docs in `docs/engineering/`, run `npm run registry:docs`, `npm run registry:validate`, `npm run test:registry`, and `npm run registry:compare -- --base origin/working/biteshark-vps --head WORKTREE`, plus the relevant suites in `docs/engineering/TESTING.md`. Never fabricate test or deployment results; report exact commands run and any remaining uncertainty.
```
