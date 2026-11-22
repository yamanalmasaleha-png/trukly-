# Symbol Catalog — Server & Runtime Adapter (`server/`, `packages/`)

> [!NOTE]
> **Machine-Generated Reference Inventory** — Do not hand-edit. Regenerate via `npm run registry:docs` (`node tools/code-registry/cli.mjs generate-docs`).
> - **Repository**: `https://github.com/yamanalmasaleha-png/trukly-`
> - **Provenance Mode**: `committed_source_digest` *(branch/detached-HEAD invariant; commit-bound runs use `npm run registry:scan -- --include-timestamp`)*
> - **Generator**: `biteshark-code-registry@2.0.0` (`biteshark.code-registry.v2`)
> - **Source Analysis Digest**: `f351b1839a541309ff92af2238561630479a3c834950d41044168088bcc5e313`
> - **Analysis Scope & Limits**: Static AST, HTML, CSS, and SQL analysis without executing application modules. Relationships distinguish confirmed_static, documented_wrapper, inferred_candidate, and dynamic_unresolved; static analysis does not prove runtime behavioral correctness.

- [← Back to Symbol & Module Index](../SYMBOL-INDEX.md)
- **Relationship Labels**: `confirmed` = resolved via lexical scope, explicit ESM/CJS import/alias, unique `window.*` namespace, or page-level script binding. `candidate` = ambiguous multi-script or unverified member call (never conflated as confirmed).

## [packages/runtime-adapter/index.js](../../../../packages/runtime-adapter/index.js) (`module`)
- **Imports / Dependencies**: `node:async_hooks`
- **Exports**: `configureStandaloneAdapter`, `bindVerifiedRequestUser`, `runWithRequestContext`, `getActiveRequestContext`, `db`, `auth`
- **Top-Level Constants (4)**: `requestAls`, `verifiedRequestUsers`, `db` *(exported)*, `auth` *(exported)*

| Symbol | Kind | Exported | Parameters (Observed Basis) | Returns / Throws | Confirmed Callers (Inferred in italics) | Contracts | Lines |
|---|---|---|---|---|---|---|---|
| `configureStandaloneAdapter` | `function` | Yes | `({ db, getUser }: object)` | `void_or_implicit` | `server/app.js:createStandaloneServer` | — | [packages/runtime-adapter/index.js:L13](../../../../packages/runtime-adapter/index.js#L13) |
| `bindVerifiedRequestUser` | `function` | Yes | `(req: unknown, user: unknown)` | `sync_value` | `server/app.js:createStandaloneServer>anon@L489C35` | — | [packages/runtime-adapter/index.js:L23](../../../../packages/runtime-adapter/index.js#L23) |
| `runWithRequestContext` | `function` | Yes | `(context: unknown, fn: unknown)` | `sync_value` | `server/app.js:createStandaloneServer>anon@L489C35` | — | [packages/runtime-adapter/index.js:L47](../../../../packages/runtime-adapter/index.js#L47) |
| `getActiveRequestContext` | `function` | Yes | `()` | `sync_value` | — | — | [packages/runtime-adapter/index.js:L51](../../../../packages/runtime-adapter/index.js#L51) |
| `resolveActiveDb` | `function` | No | `()` | `sync_value (throws: thrown_value)` | `packages/runtime-adapter/index.js:db.connect`, `packages/runtime-adapter/index.js:db.query`, `packages/runtime-adapter/index.js:db.transaction` | — | [packages/runtime-adapter/index.js:L55](../../../../packages/runtime-adapter/index.js#L55) |
| `db.query` | `object_method` | No | `(text: unknown, params: unknown)` | `sync_value` | — | — | [packages/runtime-adapter/index.js:L67](../../../../packages/runtime-adapter/index.js#L67) |
| `db.connect` | `object_method` | No | `()` | `sync_value (throws: Error)` | — | — | [packages/runtime-adapter/index.js:L71](../../../../packages/runtime-adapter/index.js#L71) |
| `db.transaction` | `object_method` | No | `(fn: unknown)` | `async -> promise (throws: thrown_value)` | — | — | [packages/runtime-adapter/index.js:L82](../../../../packages/runtime-adapter/index.js#L82) |
| `db.pool` | `object_method` | No | `()` | `sync_value` | — | — | [packages/runtime-adapter/index.js:L113](../../../../packages/runtime-adapter/index.js#L113) |
| `auth.getUser` | `object_method` | No | `(req: unknown)` | `async -> promise` | — | — | [packages/runtime-adapter/index.js:L122](../../../../packages/runtime-adapter/index.js#L122) |

## [server/admin-routes.js](../../../../server/admin-routes.js) (`module`)
- **Imports / Dependencies**: `../lib/admin-governance.js`, `../lib/age-policy.js`, `../lib/authz.js`, `../lib/client-ip.js`, `../lib/customer-exploration.js`, `../lib/db-tx.js`, `../lib/diagnostics.js`, `../lib/env-compat.js`, `../lib/feature-controls.js`, `../lib/pager-notifications.js`, `../lib/standalone-auth.js`, `../lib/support-tickets.js`, `./customer-exploration-routes.js`, `@biteshark/runtime-adapter`
- **Exports**: `EVIDENCE_UPLOAD_MAX_JSON_BYTES`, `isGovernanceApiPath`, `handleGovernanceApiRequest`
- **Top-Level Constants (6)**: `EVIDENCE_UPLOAD_MAX_JSON_BYTES` *(exported)*, `GOVERNANCE_PATHS`, `READINESS_STATUS_CATALOG`, `VALID_READINESS_STATUSES`, `LAUNCH_INCOMPLETE_REMINDER_TEXT`, `DEPLOYMENT_PORTAL_REMINDER_NOTE`

| Symbol | Kind | Exported | Parameters (Observed Basis) | Returns / Throws | Confirmed Callers (Inferred in italics) | Contracts | Lines |
|---|---|---|---|---|---|---|---|
| `isGovernanceApiPath` | `function` | Yes | `(pathname: unknown)` | `sync_value` | `server/app.js:createStandaloneServer>anon@L489C35` | — | [server/admin-routes.js:L161](../../../../server/admin-routes.js#L161) |
| `maskEmail` | `function` | No | `(email: unknown)` | `sync_value` | `server/admin-routes.js:handleGovernanceApiRequest>anon@L4169C49>anon@L4240C27`, `server/admin-routes.js:handleGovernanceApiRequest>anon@L5499C49>anon@L5514C45`, `server/admin-routes.js:handleGovernanceApiRequest>anon@L5499C49>formatAdminIssueRow`, `server/admin-routes.js:handleGovernanceApiRequest>anon@L7289C53` (+2) | — | [server/admin-routes.js:L166](../../../../server/admin-routes.js#L166) |
| `validateIsoCalendarDate` | `function` | No | `(raw: unknown, { allowFuture }: object)` | `sync_value` | `server/admin-routes.js:handleGovernanceApiRequest` | — | [server/admin-routes.js:L194](../../../../server/admin-routes.js#L194) |
| `serializeReadinessItemForActor` | `function` | No | `(row: unknown, actorRole: unknown, historyRows: array)` | `sync_value` | `server/admin-routes.js:handleGovernanceApiRequest>anon@L6566C49>anon@L6662C24`, `server/admin-routes.js:handleGovernanceApiRequest>anon@L6712C53`, `server/admin-routes.js:handleGovernanceApiRequest>anon@L6849C53` | — | [server/admin-routes.js:L219](../../../../server/admin-routes.js#L219) |
| `enableAdminTxGuards` | `function` | No | `(tx: unknown, ctx: unknown)` | `async -> promise` | `server/admin-routes.js:deliverAndFinalizeIssuedInvitation>anon@L341C53`, `server/admin-routes.js:handleGovernanceApiRequest>anon@L1074C53`, `server/admin-routes.js:handleGovernanceApiRequest>anon@L1939C55`, `server/admin-routes.js:handleGovernanceApiRequest>anon@L2892C49` (+28) | — | [server/admin-routes.js:L262](../../../../server/admin-routes.js#L262) |
| `getRuntimeReleaseSha` | `function` | No | `()` | `sync_value` | `server/admin-routes.js:deliverAndFinalizeIssuedInvitation`, `server/admin-routes.js:handleGovernanceApiRequest` | — | [server/admin-routes.js:L274](../../../../server/admin-routes.js#L274) |
| `loadInvitationEventsMapInTx` | `function` | No | `(tx: unknown, invitationIds: unknown)` | `async -> promise (throws: thrown_value)` | `server/admin-routes.js:deliverAndFinalizeIssuedInvitation>anon@L341C53`, `server/admin-routes.js:handleGovernanceApiRequest>anon@L4549C49`, `server/admin-routes.js:handleGovernanceApiRequest>anon@L4632C53` | — | [server/admin-routes.js:L283](../../../../server/admin-routes.js#L283) |
| `deliverAndFinalizeIssuedInvitation` | `function` | No | `({ dbAdapter, ctx, invitationId, tokenVersion, rawToken, recipientEmail, requestedRole, vendorId, vendorName, expiresAt, actorId, actorRole }: object)` | `async -> promise` | `server/admin-routes.js:handleGovernanceApiRequest` | — | [server/admin-routes.js:L310](../../../../server/admin-routes.js#L310) |
| `deliverAndFinalizeIssuedInvitation>anon@L341C53` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L341](../../../../server/admin-routes.js#L341) |
| `recordAndDispatchSupportNotification` | `function` | No | `({ dbAdapter, issueId, ticketNumber, recipientUserId, recipientEmail, eventKind, dedupeKey, statusLabel, isCritical }: object)` | `async -> promise (throws: thrown_value)` | `server/admin-routes.js:handleGovernanceApiRequest` | — | [server/admin-routes.js:L454](../../../../server/admin-routes.js#L454) |
| `recordAndDispatchSupportNotification>anon@L476C37` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L476](../../../../server/admin-routes.js#L476) |
| `recordAndDispatchSupportNotification>anon@L530C37` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L530](../../../../server/admin-routes.js#L530) |
| `handleGovernanceApiRequest` | `function` | Yes | `({ pathname, method, req, query, body, dbAdapter, sendJson, rawRes }: object)` | `async -> promise` | `server/app.js:createStandaloneServer>anon@L489C35>anon@L915C10>anon@L924C14` | [CTR-SUPPORT-TICKETS](../CONTRACTS-CATALOG.md) | [server/admin-routes.js:L578](../../../../server/admin-routes.js#L578) |
| `handleGovernanceApiRequest>anon@L634C50` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L634](../../../../server/admin-routes.js#L634) |
| `handleGovernanceApiRequest>anon@L701C24` | `anonymous_function` | No | `()` | `sync_value` | — | — | [server/admin-routes.js:L701](../../../../server/admin-routes.js#L701) |
| `handleGovernanceApiRequest>anon@L779C39` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise (throws: thrown_value)` | — | — | [server/admin-routes.js:L779](../../../../server/admin-routes.js#L779) |
| `handleGovernanceApiRequest>anon@L956C49` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L956](../../../../server/admin-routes.js#L956) |
| `handleGovernanceApiRequest>anon@L1074C53` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L1074](../../../../server/admin-routes.js#L1074) |
| `handleGovernanceApiRequest>anon@L1307C51` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L1307](../../../../server/admin-routes.js#L1307) |
| `handleGovernanceApiRequest>anon@L1307C51>anon@L1322C28` | `anonymous_function` | No | `(r: unknown)` | `sync_value` | — | — | [server/admin-routes.js:L1322](../../../../server/admin-routes.js#L1322) |
| `handleGovernanceApiRequest>anon@L1343C55` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L1343](../../../../server/admin-routes.js#L1343) |
| `handleGovernanceApiRequest>anon@L1393C53` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L1393](../../../../server/admin-routes.js#L1393) |
| `handleGovernanceApiRequest>anon@L1524C51` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L1524](../../../../server/admin-routes.js#L1524) |
| `handleGovernanceApiRequest>anon@L1651C55` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L1651](../../../../server/admin-routes.js#L1651) |
| `handleGovernanceApiRequest>anon@L1810C51` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L1810](../../../../server/admin-routes.js#L1810) |
| `handleGovernanceApiRequest>anon@L1874C55` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L1874](../../../../server/admin-routes.js#L1874) |
| `handleGovernanceApiRequest>anon@L1939C55` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L1939](../../../../server/admin-routes.js#L1939) |
| `handleGovernanceApiRequest>anon@L2033C53` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L2033](../../../../server/admin-routes.js#L2033) |
| `handleGovernanceApiRequest>anon@L2109C51` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L2109](../../../../server/admin-routes.js#L2109) |
| `handleGovernanceApiRequest>anon@L2109C51>anon@L2223C36` | `anonymous_function` | No | `(i: unknown)` | `sync_value` | — | — | [server/admin-routes.js:L2223](../../../../server/admin-routes.js#L2223) |
| `handleGovernanceApiRequest>anon@L2307C55` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L2307](../../../../server/admin-routes.js#L2307) |
| `handleGovernanceApiRequest>anon@L2603C53` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L2603](../../../../server/admin-routes.js#L2603) |
| `handleGovernanceApiRequest>anon@L2722C53` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L2722](../../../../server/admin-routes.js#L2722) |
| `handleGovernanceApiRequest>anon@L2863C37` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L2863](../../../../server/admin-routes.js#L2863) |
| `handleGovernanceApiRequest>anon@L2892C49` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L2892](../../../../server/admin-routes.js#L2892) |
| `handleGovernanceApiRequest>anon@L3076C57` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L3076](../../../../server/admin-routes.js#L3076) |
| `handleGovernanceApiRequest>anon@L3099C49` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L3099](../../../../server/admin-routes.js#L3099) |
| `handleGovernanceApiRequest>anon@L3233C49` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L3233](../../../../server/admin-routes.js#L3233) |
| `handleGovernanceApiRequest>anon@L3233C49>anon@L3316C31` | `anonymous_function` | No | `(r: unknown)` | `sync_value` | — | — | [server/admin-routes.js:L3316](../../../../server/admin-routes.js#L3316) |
| `handleGovernanceApiRequest>anon@L3380C53` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L3380](../../../../server/admin-routes.js#L3380) |
| `handleGovernanceApiRequest>anon@L3746C49` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L3746](../../../../server/admin-routes.js#L3746) |
| `handleGovernanceApiRequest>anon@L3746C49>anon@L3851C26` | `anonymous_function` | No | `(r: unknown)` | `sync_value` | — | — | [server/admin-routes.js:L3851](../../../../server/admin-routes.js#L3851) |
| `handleGovernanceApiRequest>anon@L3878C53` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L3878](../../../../server/admin-routes.js#L3878) |
| `handleGovernanceApiRequest>anon@L3878C53>pickBool` | `arrow_function` | No | `(a: unknown, b: unknown, fallback: unknown)` | `sync_value` | `server/admin-routes.js:handleGovernanceApiRequest>anon@L3878C53` | — | [server/admin-routes.js:L4007](../../../../server/admin-routes.js#L4007) |
| `handleGovernanceApiRequest>anon@L4169C49` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L4169](../../../../server/admin-routes.js#L4169) |
| `handleGovernanceApiRequest>anon@L4169C49>anon@L4240C27` | `anonymous_function` | No | `(r: unknown)` | `sync_value` | — | — | [server/admin-routes.js:L4240](../../../../server/admin-routes.js#L4240) |
| `handleGovernanceApiRequest>anon@L4286C53` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L4286](../../../../server/admin-routes.js#L4286) |
| `handleGovernanceApiRequest>anon@L4286C53>anon@L4329C10` | `anonymous_function` | No | `(r: unknown)` | `sync_value` | — | — | [server/admin-routes.js:L4329](../../../../server/admin-routes.js#L4329) |
| `handleGovernanceApiRequest>anon@L4414C13` | `anonymous_function` | No | `(err: unknown)` | `sync_value (throws: thrown_value)` | — | — | [server/admin-routes.js:L4414](../../../../server/admin-routes.js#L4414) |
| `handleGovernanceApiRequest>anon@L4450C53` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L4450](../../../../server/admin-routes.js#L4450) |
| `handleGovernanceApiRequest>anon@L4518C13` | `anonymous_function` | No | `(err: unknown)` | `sync_value (throws: thrown_value)` | — | — | [server/admin-routes.js:L4518](../../../../server/admin-routes.js#L4518) |
| `handleGovernanceApiRequest>anon@L4549C49` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L4549](../../../../server/admin-routes.js#L4549) |
| `handleGovernanceApiRequest>anon@L4632C53` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L4632](../../../../server/admin-routes.js#L4632) |
| `handleGovernanceApiRequest>anon@L4886C53` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L4886](../../../../server/admin-routes.js#L4886) |
| `handleGovernanceApiRequest>anon@L5250C49` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L5250](../../../../server/admin-routes.js#L5250) |
| `handleGovernanceApiRequest>anon@L5374C53` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L5374](../../../../server/admin-routes.js#L5374) |
| `handleGovernanceApiRequest>anon@L5499C49` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L5499](../../../../server/admin-routes.js#L5499) |
| `handleGovernanceApiRequest>anon@L5499C49>anon@L5514C45` | `anonymous_function` | No | `(r: unknown)` | `sync_value` | — | — | [server/admin-routes.js:L5514](../../../../server/admin-routes.js#L5514) |
| `handleGovernanceApiRequest>anon@L5499C49>formatAdminIssueRow` | `arrow_function` | No | `(r: unknown)` | `sync_value` | `server/admin-routes.js:handleGovernanceApiRequest>anon@L5499C49`, `server/admin-routes.js:handleGovernanceApiRequest>anon@L5499C49>anon@L5876C25` | — | [server/admin-routes.js:L5553](../../../../server/admin-routes.js#L5553) |
| `handleGovernanceApiRequest>anon@L5499C49>anon@L5663C45` | `anonymous_function` | No | `(l: unknown)` | `sync_value` | — | — | [server/admin-routes.js:L5663](../../../../server/admin-routes.js#L5663) |
| `handleGovernanceApiRequest>anon@L5499C49>anon@L5876C25` | `anonymous_function` | No | `(r: unknown)` | `sync_value` | — | — | [server/admin-routes.js:L5876](../../../../server/admin-routes.js#L5876) |
| `handleGovernanceApiRequest>anon@L5943C53` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L5943](../../../../server/admin-routes.js#L5943) |
| `handleGovernanceApiRequest>anon@L6345C49` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L6345](../../../../server/admin-routes.js#L6345) |
| `handleGovernanceApiRequest>anon@L6566C49` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L6566](../../../../server/admin-routes.js#L6566) |
| `handleGovernanceApiRequest>anon@L6712C53` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L6712](../../../../server/admin-routes.js#L6712) |
| `handleGovernanceApiRequest>anon@L6849C53` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L6849](../../../../server/admin-routes.js#L6849) |
| `handleGovernanceApiRequest>anon@L6849C53>cleanOptStr` | `arrow_function` | No | `(val: unknown, maxLen: unknown)` | `sync_value` | `server/admin-routes.js:handleGovernanceApiRequest>anon@L6849C53` | — | [server/admin-routes.js:L6883](../../../../server/admin-routes.js#L6883) |
| `handleGovernanceApiRequest>anon@L7178C49` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L7178](../../../../server/admin-routes.js#L7178) |
| `handleGovernanceApiRequest>anon@L7230C57` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L7230](../../../../server/admin-routes.js#L7230) |
| `handleGovernanceApiRequest>anon@L7289C53` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L7289](../../../../server/admin-routes.js#L7289) |
| `handleGovernanceApiRequest>anon@L7398C49` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L7398](../../../../server/admin-routes.js#L7398) |
| `handleGovernanceApiRequest>anon@L7398C49>anon@L7541C32` | `anonymous_function` | No | `(g: unknown)` | `sync_value` | — | — | [server/admin-routes.js:L7541](../../../../server/admin-routes.js#L7541) |
| `handleGovernanceApiRequest>anon@L7562C49` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L7562](../../../../server/admin-routes.js#L7562) |
| `handleGovernanceApiRequest>anon@L7684C49` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L7684](../../../../server/admin-routes.js#L7684) |
| `handleGovernanceApiRequest>anon@L7792C49` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L7792](../../../../server/admin-routes.js#L7792) |
| `handleGovernanceApiRequest>anon@L7853C57` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L7853](../../../../server/admin-routes.js#L7853) |
| `handleGovernanceApiRequest>anon@L7894C39` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L7894](../../../../server/admin-routes.js#L7894) |
| `handleGovernanceApiRequest>anon@L7917C57` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L7917](../../../../server/admin-routes.js#L7917) |
| `handleGovernanceApiRequest>anon@L7928C37` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L7928](../../../../server/admin-routes.js#L7928) |
| `handleGovernanceApiRequest>anon@L7982C51` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L7982](../../../../server/admin-routes.js#L7982) |
| `handleGovernanceApiRequest>anon@L7982C51>anon@L8034C47` | `anonymous_function` | No | `(r: unknown)` | `sync_value` | — | — | [server/admin-routes.js:L8034](../../../../server/admin-routes.js#L8034) |

## [server/app.js](../../../../server/app.js) (`module`)
- **Imports / Dependencies**: `../lib/age-policy.js`, `../lib/authz.js`, `../lib/client-ip.js`, `../lib/db-tx.js`, `../lib/diagnostics.js`, `../lib/env-compat.js`, `../lib/feature-controls.js`, `../lib/pager-notifications.js`, `../lib/photo-storage.js`, `../lib/request-context.js`, `../lib/standalone-auth.js`, `../scripts/staging-runtime-probe.js`, `./admin-routes.js`, `./routes.js`, `@biteshark/runtime-adapter`, `node:fs`, `node:http`, `node:path`, `node:url`
- **Exports**: `DEFAULT_MAX_JSON_BYTES`, `AUTH_MAX_JSON_BYTES`, `DIAGNOSTICS_REPORT_MAX_JSON_BYTES`, `createStandaloneServer`
- **Top-Level Constants (8)**: `SERVER_DIR`, `DEFAULT_PUBLIC_DIR`, `DEFAULT_MAX_JSON_BYTES` *(exported)*, `AUTH_MAX_JSON_BYTES` *(exported)*, `DIAGNOSTICS_REPORT_MAX_JSON_BYTES` *(exported)*, `ALLOWED_STATIC_MIME`, `NO_CACHE_STATIC_FILES`, `MUTATING_HTTP_METHODS`

| Symbol | Kind | Exported | Parameters (Observed Basis) | Returns / Throws | Confirmed Callers (Inferred in italics) | Contracts | Lines |
|---|---|---|---|---|---|---|---|
| `escapeHtml` | `function` | No | `(raw: unknown)` | `sync_value` | `server/app.js:renderAdminAccessDeniedHtml` | — | [server/app.js:L114](../../../../server/app.js#L114) |
| `renderAdminAccessDeniedHtml` | `function` | No | `(userEmail: unknown, roleLabels: array)` | `sync_value` | `server/app.js:createStandaloneServer>anon@L489C35` | — | [server/app.js:L123](../../../../server/app.js#L123) |
| `parseActOnBehalfHeaders` | `function` | No | `(req: unknown)` | `sync_value` | `server/app.js:createStandaloneServer>anon@L489C35` | — | [server/app.js:L164](../../../../server/app.js#L164) |
| `applyBaselineSecurityHeaders` | `function` | No | `(res: unknown)` | `void_or_implicit` | `server/app.js:createStandaloneServer>anon@L489C35` | — | [server/app.js:L191](../../../../server/app.js#L191) |
| `appendSetCookie` | `function` | No | `(res: unknown, cookieValue: unknown)` | `void_or_implicit` | `server/app.js:createStandaloneServer>anon@L489C35` | — | [server/app.js:L197](../../../../server/app.js#L197) |
| `isIntentionalMaintenanceResponse` | `function` | No | `(statusCode: unknown, payload: unknown)` | `sync_value` | `server/app.js:createStandaloneServer>anon@L489C35>res.__bsDiagHook` | — | [server/app.js:L209](../../../../server/app.js#L209) |
| `sendJsonResponse` | `function` | No | `(res: unknown, statusCode: unknown, payload: unknown, extraHeaders: object)` | `void_or_implicit` | `server/app.js:createHandlerResponseAdapter>json`, `server/app.js:createHandlerResponseAdapter>send`, `server/app.js:createStandaloneServer>anon@L489C35`, `server/app.js:createStandaloneServer>anon@L489C35>anon@L1152C32` (+3) | — | [server/app.js:L217](../../../../server/app.js#L217) |
| `createHandlerResponseAdapter` | `function` | No | `(rawRes: unknown, govState: null_or_object)` | `sync_value` | `server/app.js:createStandaloneServer>anon@L489C35` | — | [server/app.js:L238](../../../../server/app.js#L238) |
| `createHandlerResponseAdapter>setHeader` | `object_method` | No | `(name: unknown, value: unknown)` | `sync_value` | — | — | [server/app.js:L241](../../../../server/app.js#L241) |
| `createHandlerResponseAdapter>getHeader` | `object_method` | No | `(name: unknown)` | `sync_value` | — | — | [server/app.js:L247](../../../../server/app.js#L247) |
| `createHandlerResponseAdapter>status` | `object_method` | No | `(code: unknown)` | `sync_value` | — | — | [server/app.js:L250](../../../../server/app.js#L250) |
| `createHandlerResponseAdapter>json` | `object_method` | No | `(payload: unknown)` | `sync_value` | — | — | [server/app.js:L255](../../../../server/app.js#L255) |
| `createHandlerResponseAdapter>send` | `object_method` | No | `(payload: unknown)` | `sync_value` | — | — | [server/app.js:L272](../../../../server/app.js#L272) |
| `createHandlerResponseAdapter>end` | `object_method` | No | `(chunk: unknown)` | `sync_value` | — | — | [server/app.js:L292](../../../../server/app.js#L292) |
| `BodyParseError.constructor` | `constructor` | No | `(status: unknown, code: unknown, message: unknown)` | `void_or_implicit` | — | — | [server/app.js:L302](../../../../server/app.js#L302) |
| `readBoundedJsonBody` | `function` | No | `(req: unknown, maxBytes: unknown)` | `async -> promise (throws: BodyParseError)` | `server/app.js:createStandaloneServer>anon@L489C35` | — | [server/app.js:L309](../../../../server/app.js#L309) |
| `parseQueryObject` | `function` | No | `(searchParams: unknown)` | `sync_value` | `server/app.js:createStandaloneServer>anon@L489C35` | — | [server/app.js:L346](../../../../server/app.js#L346) |
| `resolveSafePublicFile` | `function` | No | `(realPublicRoot: unknown, rawPathname: unknown)` | `sync_value` | `server/app.js:createStandaloneServer>anon@L489C35` | — | [server/app.js:L360](../../../../server/app.js#L360) |
| `readSafeSecurityFlag` | `function` | No | `(suffix: unknown)` | `sync_value` | `server/app.js:createStandaloneServer>anon@L489C35` | — | [server/app.js:L435](../../../../server/app.js#L435) |
| `createStandaloneServer` | `function` | Yes | `({ dbAdapter, publicDir, releaseSha, trustProxy, maxJsonBytes, logger }: object)` | `sync_value (throws: Error)` | `server/index.js:main` | — | [server/app.js:L443](../../../../server/app.js#L443) |
| `createStandaloneServer>anon@L447C16` | `anonymous_function` | No | `()` | `sync_value` | — | — | [server/app.js:L447](../../../../server/app.js#L447) |
| `createStandaloneServer>getUser` | `object_method` | No | `(req: unknown)` | `async -> promise` | — | — | [server/app.js:L465](../../../../server/app.js#L465) |
| `createStandaloneServer>anon@L471C27` | `anonymous_function` | No | `()` | `sync_value` | — | — | [server/app.js:L471](../../../../server/app.js#L471) |
| `createStandaloneServer>anon@L489C35` | `anonymous_function` | No | `(req: unknown, res: unknown)` | `async -> promise` | — | — | [server/app.js:L489](../../../../server/app.js#L489) |
| `createStandaloneServer>anon@L489C35>res.__bsDiagHook` | `arrow_function` | No | `(statusCode: unknown, payload: unknown, extraHeaders: object)` | `async -> promise` | — | — | [server/app.js:L534](../../../../server/app.js#L534) |
| `createStandaloneServer>anon@L489C35>anon@L915C10` | `anonymous_function` | No | `()` | `sync_value` | — | — | [server/app.js:L915](../../../../server/app.js#L915) |
| `createStandaloneServer>anon@L489C35>anon@L915C10>anon@L924C14` | `anonymous_function` | No | `()` | `sync_value` | — | — | [server/app.js:L924](../../../../server/app.js#L924) |
| `createStandaloneServer>anon@L489C35>anon@L915C10>anon@L924C14>sendJson` | `object_method` | No | `(status: unknown, payload: unknown, headers: unknown)` | `sync_value` | — | — | [server/app.js:L932](../../../../server/app.js#L932) |
| `createStandaloneServer>anon@L489C35>anon@L1152C32` | `anonymous_function` | No | `()` | `void_or_implicit` | — | — | [server/app.js:L1152](../../../../server/app.js#L1152) |
| `createStandaloneServer>anon@L489C35>anon@L1191C29` | `anonymous_function` | No | `()` | `void_or_implicit` | — | — | [server/app.js:L1191](../../../../server/app.js#L1191) |
| `createStandaloneServer>anon@L489C35>anon@L1215C29` | `anonymous_function` | No | `()` | `void_or_implicit` | — | — | [server/app.js:L1215](../../../../server/app.js#L1215) |
| `createStandaloneServer>closeGracefully` | `function` | No | `(timeoutMs: number)` | `async -> promise` | — | — | [server/app.js:L1257](../../../../server/app.js#L1257) |
| `createStandaloneServer>closeGracefully>anon@L1261C22` | `anonymous_function` | No | `(resolve: unknown)` | `void_or_implicit` | — | — | [server/app.js:L1261](../../../../server/app.js#L1261) |
| `createStandaloneServer>closeGracefully>anon@L1261C22>anon@L1262C31` | `anonymous_function` | No | `()` | `void_or_implicit` | — | — | [server/app.js:L1262](../../../../server/app.js#L1262) |

## [server/customer-exploration-routes.js](../../../../server/customer-exploration-routes.js) (`module`)
- **Imports / Dependencies**: `../lib/authz.js`, `../lib/customer-exploration.js`, `../lib/diagnostics.js`, `../lib/discovery.js`, `../lib/editorial-stories.js`, `../lib/feature-controls.js`, `../lib/photo-storage.js`, `@biteshark/runtime-adapter`
- **Exports**: `CUSTOMER_EXPLORATION_PATHS`, `handleCustomerExplorationRoute`
- **Top-Level Constants (1)**: `CUSTOMER_EXPLORATION_PATHS` *(exported)*

| Symbol | Kind | Exported | Parameters (Observed Basis) | Returns / Throws | Confirmed Callers (Inferred in italics) | Contracts | Lines |
|---|---|---|---|---|---|---|---|
| `shortInternalActorTag` | `function` | No | `(userId: unknown)` | `sync_value` | `server/customer-exploration-routes.js:recordExplorationDiagnostic` | — | [server/customer-exploration-routes.js:L55](../../../../server/customer-exploration-routes.js#L55) |
| `resolveCallerExplorationFeatureFlags` | `function` | No | `(dbAdapter: unknown, req: unknown, verifiedUser: unknown)` | `async -> promise` | `server/customer-exploration-routes.js:handleCustomerExplorationRoute` | — | [server/customer-exploration-routes.js:L61](../../../../server/customer-exploration-routes.js#L61) |
| `recordExplorationDiagnostic` | `function` | No | `(dbAdapter: unknown, req: unknown, { featureKey, operationName, routeTemplate, httpMethod, httpStatus, severity, errorCode, message, retryable, outcomeState, actorId, safeContext }: object)` | `async -> promise` | `server/customer-exploration-routes.js:handleCustomerExplorationRoute`, `server/customer-exploration-routes.js:sendExplorationError` | — | [server/customer-exploration-routes.js:L106](../../../../server/customer-exploration-routes.js#L106) |
| `sendExplorationError` | `function` | No | `(dbAdapter: unknown, req: unknown, sendJson: unknown, err: unknown, { featureKey, operationName, routeTemplate, method, userId }: object)` | `sync_value (throws: thrown_value)` | `server/customer-exploration-routes.js:handleCustomerExplorationRoute` | — | [server/customer-exploration-routes.js:L150](../../../../server/customer-exploration-routes.js#L150) |
| `sendExplorationError>anon@L173C17` | `anonymous_function` | No | `()` | `void_or_implicit` | — | — | [server/customer-exploration-routes.js:L173](../../../../server/customer-exploration-routes.js#L173) |
| `handleCustomerExplorationRoute` | `function` | Yes | `({ pathname, method, req, query, body, verifiedUser, dbAdapter, sendJson, rawRes }: object)` | `async -> promise` | `server/admin-routes.js:handleGovernanceApiRequest` | [CTR-CUSTOMER-EXPLORATION](../CONTRACTS-CATALOG.md) | [server/customer-exploration-routes.js:L203](../../../../server/customer-exploration-routes.js#L203) |

## [server/index.js](../../../../server/index.js) (`module`)
- **Imports / Dependencies**: `../lib/env-compat.js`, `../lib/standalone-auth.js`, `./app.js`, `pg`

| Symbol | Kind | Exported | Parameters (Observed Basis) | Returns / Throws | Confirmed Callers (Inferred in italics) | Contracts | Lines |
|---|---|---|---|---|---|---|---|
| `validateStartupEnvironment` | `function` | No | `()` | `sync_value (throws: Error)` | `server/index.js:main` | — | [server/index.js:L23](../../../../server/index.js#L23) |
| `main` | `function` | No | `()` | `async -> promise (throws: Error)` | `server/index.js:<top_level>` | — | [server/index.js:L56](../../../../server/index.js#L56) |
| `main>anon@L68C19` | `anonymous_function` | No | `(err: unknown)` | `void_or_implicit` | — | — | [server/index.js:L68](../../../../server/index.js#L68) |
| `dbAdapter.query` | `object_method` | No | `(text: unknown, params: unknown)` | `sync_value` | — | — | [server/index.js:L100](../../../../server/index.js#L100) |
| `dbAdapter.connect` | `object_method` | No | `()` | `sync_value` | — | — | [server/index.js:L101](../../../../server/index.js#L101) |
| `main>handleSignal` | `function` | No | `(signal: unknown)` | `async -> promise` | `server/index.js:main>anon@L152C24`, `server/index.js:main>anon@L153C23`, `server/index.js:main>anon@L155C26` | — | [server/index.js:L131](../../../../server/index.js#L131) |
| `main>anon@L155C26` | `anonymous_function` | No | `(msg: unknown)` | `void_or_implicit` | — | — | [server/index.js:L155](../../../../server/index.js#L155) |
| `top>anon@L163C13` | `anonymous_function` | No | `(err: unknown)` | `void_or_implicit` | — | — | [server/index.js:L163](../../../../server/index.js#L163) |

## [server/routes.js](../../../../server/routes.js) (`module`)
- **Imports / Dependencies**: `../api/bookings/create.js`, `../api/bookings/list.js`, `../api/catalog/cities.js`, `../api/catalog/cuisines.js`, `../api/catalog/featured.js`, `../api/community/list.js`, `../api/community/mine.js`, `../api/community/moderate.js`, `../api/community/post.js`, `../api/favorites/list.js`, `../api/favorites/toggle.js`, `../api/notifications/settings.js`, `../api/owner/bookings.js`, `../api/owner/location.js`, `../api/owner/profile.js`, `../api/owner/requests.js`, `../api/owner/schedule.js`, `../api/owner/stats.js`, `../api/pager/staff.js`, `../api/pager/status.js`, `../api/pager/subscriptions.js`, `../api/pager/telemetry.js`, `../api/pager/update.js`, `../api/pager/worker.js`, `../api/schedule/today.js`, `../api/trucks.js`, `../api/trucks/[id].js`, `../api/trucks/availability.js`, `../api/trucks/nearby.js`, `../api/trucks/search.js`
- **Exports**: `STATIC_API_ROUTES`, `DYNAMIC_TRUCK_BY_ID_ROUTE`, `REGISTERED_DOMAIN_ROUTE_COUNT`, `matchDomainApiRoute`
- **Top-Level Constants (3)**: `STATIC_API_ROUTES` *(exported)*, `DYNAMIC_TRUCK_BY_ID_ROUTE` *(exported)*, `REGISTERED_DOMAIN_ROUTE_COUNT` *(exported)*

| Symbol | Kind | Exported | Parameters (Observed Basis) | Returns / Throws | Confirmed Callers (Inferred in italics) | Contracts | Lines |
|---|---|---|---|---|---|---|---|
| `defineRoute` | `function` | No | `(pattern: unknown, mod: unknown, extra: object)` | `sync_value (throws: Error)` | `server/routes.js:<top_level>` | — | [server/routes.js:L35](../../../../server/routes.js#L35) |
| `matchDomainApiRoute` | `function` | Yes | `(pathname: unknown)` | `sync_value` | `server/app.js:createStandaloneServer>anon@L489C35` | — | [server/routes.js:L103](../../../../server/routes.js#L103) |
