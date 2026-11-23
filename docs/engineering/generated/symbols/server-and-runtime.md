# Symbol Catalog — Server & Runtime Adapter (`server/`, `packages/`)

> [!NOTE]
> **Machine-Generated Reference Inventory** — Do not hand-edit. Regenerate via `npm run registry:docs` (`node tools/code-registry/cli.mjs generate-docs`).
> - **Repository**: `https://github.com/yamanalmasaleha-png/trukly-`
> - **Provenance Mode**: `committed_source_digest` *(branch/detached-HEAD invariant; commit-bound runs use `npm run registry:scan -- --include-timestamp`)*
> - **Generator**: `biteshark-code-registry@2.0.0` (`biteshark.code-registry.v2`)
> - **Source Analysis Digest**: `a902f78074bed0c1c5024b6a85c270377212440769b0ddcfd2ac3c07c0c5b489`
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
| `bindVerifiedRequestUser` | `function` | Yes | `(req: unknown, user: unknown)` | `sync_value` | `server/app.js:createStandaloneServer>anon@L546C35` | — | [packages/runtime-adapter/index.js:L23](../../../../packages/runtime-adapter/index.js#L23) |
| `runWithRequestContext` | `function` | Yes | `(context: unknown, fn: unknown)` | `sync_value` | `server/app.js:createStandaloneServer>anon@L546C35` | — | [packages/runtime-adapter/index.js:L47](../../../../packages/runtime-adapter/index.js#L47) |
| `getActiveRequestContext` | `function` | Yes | `()` | `sync_value` | — | — | [packages/runtime-adapter/index.js:L51](../../../../packages/runtime-adapter/index.js#L51) |
| `resolveActiveDb` | `function` | No | `()` | `sync_value (throws: thrown_value)` | `packages/runtime-adapter/index.js:db.connect`, `packages/runtime-adapter/index.js:db.query`, `packages/runtime-adapter/index.js:db.transaction` | — | [packages/runtime-adapter/index.js:L55](../../../../packages/runtime-adapter/index.js#L55) |
| `db.query` | `object_method` | No | `(text: unknown, params: unknown)` | `sync_value` | — | — | [packages/runtime-adapter/index.js:L67](../../../../packages/runtime-adapter/index.js#L67) |
| `db.connect` | `object_method` | No | `()` | `sync_value (throws: Error)` | — | — | [packages/runtime-adapter/index.js:L71](../../../../packages/runtime-adapter/index.js#L71) |
| `db.transaction` | `object_method` | No | `(fn: unknown)` | `async -> promise (throws: thrown_value)` | — | — | [packages/runtime-adapter/index.js:L82](../../../../packages/runtime-adapter/index.js#L82) |
| `db.pool` | `object_method` | No | `()` | `sync_value` | — | — | [packages/runtime-adapter/index.js:L113](../../../../packages/runtime-adapter/index.js#L113) |
| `auth.getUser` | `object_method` | No | `(req: unknown)` | `async -> promise` | — | — | [packages/runtime-adapter/index.js:L122](../../../../packages/runtime-adapter/index.js#L122) |

## [server/admin-routes.js](../../../../server/admin-routes.js) (`module`)
- **Imports / Dependencies**: `../lib/admin-governance.js`, `../lib/admin-test-customer.js`, `../lib/age-policy.js`, `../lib/authz.js`, `../lib/client-ip.js`, `../lib/customer-exploration.js`, `../lib/db-tx.js`, `../lib/diagnostics.js`, `../lib/env-compat.js`, `../lib/feature-controls.js`, `../lib/pager-notifications.js`, `../lib/standalone-auth.js`, `../lib/style-guide-admin.js`, `../lib/support-tickets.js`, `./customer-exploration-routes.js`, `./customer-profile-routes.js`, `@biteshark/runtime-adapter`
- **Exports**: `EVIDENCE_UPLOAD_MAX_JSON_BYTES`, `isGovernanceApiPath`, `handleGovernanceApiRequest`
- **Top-Level Constants (6)**: `EVIDENCE_UPLOAD_MAX_JSON_BYTES` *(exported)*, `GOVERNANCE_PATHS`, `READINESS_STATUS_CATALOG`, `VALID_READINESS_STATUSES`, `LAUNCH_INCOMPLETE_REMINDER_TEXT`, `DEPLOYMENT_PORTAL_REMINDER_NOTE`

| Symbol | Kind | Exported | Parameters (Observed Basis) | Returns / Throws | Confirmed Callers (Inferred in italics) | Contracts | Lines |
|---|---|---|---|---|---|---|---|
| `isGovernanceApiPath` | `function` | Yes | `(pathname: unknown)` | `sync_value` | `server/app.js:createStandaloneServer>anon@L546C35` | — | [server/admin-routes.js:L182](../../../../server/admin-routes.js#L182) |
| `maskEmail` | `function` | No | `(email: unknown)` | `sync_value` | `server/admin-routes.js:handleGovernanceApiRequest>anon@L1007C49`, `server/admin-routes.js:handleGovernanceApiRequest>anon@L4220C49>anon@L4291C27`, `server/admin-routes.js:handleGovernanceApiRequest>anon@L5550C49>anon@L5565C45`, `server/admin-routes.js:handleGovernanceApiRequest>anon@L5550C49>formatAdminIssueRow` (+2) | — | [server/admin-routes.js:L191](../../../../server/admin-routes.js#L191) |
| `validateIsoCalendarDate` | `function` | No | `(raw: unknown, { allowFuture }: object)` | `sync_value` | `server/admin-routes.js:handleGovernanceApiRequest` | — | [server/admin-routes.js:L219](../../../../server/admin-routes.js#L219) |
| `serializeReadinessItemForActor` | `function` | No | `(row: unknown, actorRole: unknown, historyRows: array)` | `sync_value` | `server/admin-routes.js:handleGovernanceApiRequest>anon@L6617C49>anon@L6713C24`, `server/admin-routes.js:handleGovernanceApiRequest>anon@L6763C53`, `server/admin-routes.js:handleGovernanceApiRequest>anon@L6900C53` | — | [server/admin-routes.js:L244](../../../../server/admin-routes.js#L244) |
| `enableAdminTxGuards` | `function` | No | `(tx: unknown, ctx: unknown)` | `async -> promise` | `server/admin-routes.js:deliverAndFinalizeIssuedInvitation>anon@L366C53`, `server/admin-routes.js:handleGovernanceApiRequest>anon@L1125C53`, `server/admin-routes.js:handleGovernanceApiRequest>anon@L1990C55`, `server/admin-routes.js:handleGovernanceApiRequest>anon@L2943C49` (+28) | — | [server/admin-routes.js:L287](../../../../server/admin-routes.js#L287) |
| `getRuntimeReleaseSha` | `function` | No | `()` | `sync_value` | `server/admin-routes.js:deliverAndFinalizeIssuedInvitation`, `server/admin-routes.js:handleGovernanceApiRequest` | — | [server/admin-routes.js:L299](../../../../server/admin-routes.js#L299) |
| `loadInvitationEventsMapInTx` | `function` | No | `(tx: unknown, invitationIds: unknown)` | `async -> promise (throws: thrown_value)` | `server/admin-routes.js:deliverAndFinalizeIssuedInvitation>anon@L366C53`, `server/admin-routes.js:handleGovernanceApiRequest>anon@L4600C49`, `server/admin-routes.js:handleGovernanceApiRequest>anon@L4683C53` | — | [server/admin-routes.js:L308](../../../../server/admin-routes.js#L308) |
| `deliverAndFinalizeIssuedInvitation` | `function` | No | `({ dbAdapter, ctx, invitationId, tokenVersion, rawToken, recipientEmail, requestedRole, vendorId, vendorName, expiresAt, actorId, actorRole }: object)` | `async -> promise` | `server/admin-routes.js:handleGovernanceApiRequest` | — | [server/admin-routes.js:L335](../../../../server/admin-routes.js#L335) |
| `deliverAndFinalizeIssuedInvitation>anon@L366C53` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L366](../../../../server/admin-routes.js#L366) |
| `recordAndDispatchSupportNotification` | `function` | No | `({ dbAdapter, issueId, ticketNumber, recipientUserId, recipientEmail, eventKind, dedupeKey, statusLabel, isCritical }: object)` | `async -> promise (throws: thrown_value)` | `server/admin-routes.js:handleGovernanceApiRequest` | — | [server/admin-routes.js:L479](../../../../server/admin-routes.js#L479) |
| `recordAndDispatchSupportNotification>anon@L501C37` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L501](../../../../server/admin-routes.js#L501) |
| `recordAndDispatchSupportNotification>anon@L555C37` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L555](../../../../server/admin-routes.js#L555) |
| `handleGovernanceApiRequest` | `function` | Yes | `({ pathname, method, req, query, body, dbAdapter, sendJson, rawRes }: object)` | `async -> promise` | `server/app.js:createStandaloneServer>anon@L546C35>anon@L982C10>anon@L991C14` | [CTR-SUPPORT-TICKETS](../CONTRACTS-CATALOG.md) | [server/admin-routes.js:L603](../../../../server/admin-routes.js#L603) |
| `handleGovernanceApiRequest>anon@L659C50` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L659](../../../../server/admin-routes.js#L659) |
| `handleGovernanceApiRequest>anon@L726C24` | `anonymous_function` | No | `()` | `sync_value` | — | — | [server/admin-routes.js:L726](../../../../server/admin-routes.js#L726) |
| `handleGovernanceApiRequest>anon@L804C39` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise (throws: thrown_value)` | — | — | [server/admin-routes.js:L804](../../../../server/admin-routes.js#L804) |
| `handleGovernanceApiRequest>anon@L1007C49` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L1007](../../../../server/admin-routes.js#L1007) |
| `handleGovernanceApiRequest>anon@L1125C53` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L1125](../../../../server/admin-routes.js#L1125) |
| `handleGovernanceApiRequest>anon@L1358C51` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L1358](../../../../server/admin-routes.js#L1358) |
| `handleGovernanceApiRequest>anon@L1358C51>anon@L1373C28` | `anonymous_function` | No | `(r: unknown)` | `sync_value` | — | — | [server/admin-routes.js:L1373](../../../../server/admin-routes.js#L1373) |
| `handleGovernanceApiRequest>anon@L1394C55` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L1394](../../../../server/admin-routes.js#L1394) |
| `handleGovernanceApiRequest>anon@L1444C53` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L1444](../../../../server/admin-routes.js#L1444) |
| `handleGovernanceApiRequest>anon@L1575C51` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L1575](../../../../server/admin-routes.js#L1575) |
| `handleGovernanceApiRequest>anon@L1702C55` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L1702](../../../../server/admin-routes.js#L1702) |
| `handleGovernanceApiRequest>anon@L1861C51` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L1861](../../../../server/admin-routes.js#L1861) |
| `handleGovernanceApiRequest>anon@L1925C55` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L1925](../../../../server/admin-routes.js#L1925) |
| `handleGovernanceApiRequest>anon@L1990C55` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L1990](../../../../server/admin-routes.js#L1990) |
| `handleGovernanceApiRequest>anon@L2084C53` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L2084](../../../../server/admin-routes.js#L2084) |
| `handleGovernanceApiRequest>anon@L2160C51` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L2160](../../../../server/admin-routes.js#L2160) |
| `handleGovernanceApiRequest>anon@L2160C51>anon@L2274C36` | `anonymous_function` | No | `(i: unknown)` | `sync_value` | — | — | [server/admin-routes.js:L2274](../../../../server/admin-routes.js#L2274) |
| `handleGovernanceApiRequest>anon@L2358C55` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L2358](../../../../server/admin-routes.js#L2358) |
| `handleGovernanceApiRequest>anon@L2654C53` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L2654](../../../../server/admin-routes.js#L2654) |
| `handleGovernanceApiRequest>anon@L2773C53` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L2773](../../../../server/admin-routes.js#L2773) |
| `handleGovernanceApiRequest>anon@L2914C37` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L2914](../../../../server/admin-routes.js#L2914) |
| `handleGovernanceApiRequest>anon@L2943C49` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L2943](../../../../server/admin-routes.js#L2943) |
| `handleGovernanceApiRequest>anon@L3127C57` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L3127](../../../../server/admin-routes.js#L3127) |
| `handleGovernanceApiRequest>anon@L3150C49` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L3150](../../../../server/admin-routes.js#L3150) |
| `handleGovernanceApiRequest>anon@L3284C49` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L3284](../../../../server/admin-routes.js#L3284) |
| `handleGovernanceApiRequest>anon@L3284C49>anon@L3367C31` | `anonymous_function` | No | `(r: unknown)` | `sync_value` | — | — | [server/admin-routes.js:L3367](../../../../server/admin-routes.js#L3367) |
| `handleGovernanceApiRequest>anon@L3431C53` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L3431](../../../../server/admin-routes.js#L3431) |
| `handleGovernanceApiRequest>anon@L3797C49` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L3797](../../../../server/admin-routes.js#L3797) |
| `handleGovernanceApiRequest>anon@L3797C49>anon@L3902C26` | `anonymous_function` | No | `(r: unknown)` | `sync_value` | — | — | [server/admin-routes.js:L3902](../../../../server/admin-routes.js#L3902) |
| `handleGovernanceApiRequest>anon@L3929C53` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L3929](../../../../server/admin-routes.js#L3929) |
| `handleGovernanceApiRequest>anon@L3929C53>pickBool` | `arrow_function` | No | `(a: unknown, b: unknown, fallback: unknown)` | `sync_value` | `server/admin-routes.js:handleGovernanceApiRequest>anon@L3929C53` | — | [server/admin-routes.js:L4058](../../../../server/admin-routes.js#L4058) |
| `handleGovernanceApiRequest>anon@L4220C49` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L4220](../../../../server/admin-routes.js#L4220) |
| `handleGovernanceApiRequest>anon@L4220C49>anon@L4291C27` | `anonymous_function` | No | `(r: unknown)` | `sync_value` | — | — | [server/admin-routes.js:L4291](../../../../server/admin-routes.js#L4291) |
| `handleGovernanceApiRequest>anon@L4337C53` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L4337](../../../../server/admin-routes.js#L4337) |
| `handleGovernanceApiRequest>anon@L4337C53>anon@L4380C10` | `anonymous_function` | No | `(r: unknown)` | `sync_value` | — | — | [server/admin-routes.js:L4380](../../../../server/admin-routes.js#L4380) |
| `handleGovernanceApiRequest>anon@L4465C13` | `anonymous_function` | No | `(err: unknown)` | `sync_value (throws: thrown_value)` | — | — | [server/admin-routes.js:L4465](../../../../server/admin-routes.js#L4465) |
| `handleGovernanceApiRequest>anon@L4501C53` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L4501](../../../../server/admin-routes.js#L4501) |
| `handleGovernanceApiRequest>anon@L4569C13` | `anonymous_function` | No | `(err: unknown)` | `sync_value (throws: thrown_value)` | — | — | [server/admin-routes.js:L4569](../../../../server/admin-routes.js#L4569) |
| `handleGovernanceApiRequest>anon@L4600C49` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L4600](../../../../server/admin-routes.js#L4600) |
| `handleGovernanceApiRequest>anon@L4683C53` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L4683](../../../../server/admin-routes.js#L4683) |
| `handleGovernanceApiRequest>anon@L4937C53` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L4937](../../../../server/admin-routes.js#L4937) |
| `handleGovernanceApiRequest>anon@L5301C49` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L5301](../../../../server/admin-routes.js#L5301) |
| `handleGovernanceApiRequest>anon@L5425C53` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L5425](../../../../server/admin-routes.js#L5425) |
| `handleGovernanceApiRequest>anon@L5550C49` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L5550](../../../../server/admin-routes.js#L5550) |
| `handleGovernanceApiRequest>anon@L5550C49>anon@L5565C45` | `anonymous_function` | No | `(r: unknown)` | `sync_value` | — | — | [server/admin-routes.js:L5565](../../../../server/admin-routes.js#L5565) |
| `handleGovernanceApiRequest>anon@L5550C49>formatAdminIssueRow` | `arrow_function` | No | `(r: unknown)` | `sync_value` | `server/admin-routes.js:handleGovernanceApiRequest>anon@L5550C49`, `server/admin-routes.js:handleGovernanceApiRequest>anon@L5550C49>anon@L5927C25` | — | [server/admin-routes.js:L5604](../../../../server/admin-routes.js#L5604) |
| `handleGovernanceApiRequest>anon@L5550C49>anon@L5714C45` | `anonymous_function` | No | `(l: unknown)` | `sync_value` | — | — | [server/admin-routes.js:L5714](../../../../server/admin-routes.js#L5714) |
| `handleGovernanceApiRequest>anon@L5550C49>anon@L5927C25` | `anonymous_function` | No | `(r: unknown)` | `sync_value` | — | — | [server/admin-routes.js:L5927](../../../../server/admin-routes.js#L5927) |
| `handleGovernanceApiRequest>anon@L5994C53` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L5994](../../../../server/admin-routes.js#L5994) |
| `handleGovernanceApiRequest>anon@L6396C49` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L6396](../../../../server/admin-routes.js#L6396) |
| `handleGovernanceApiRequest>anon@L6617C49` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L6617](../../../../server/admin-routes.js#L6617) |
| `handleGovernanceApiRequest>anon@L6763C53` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L6763](../../../../server/admin-routes.js#L6763) |
| `handleGovernanceApiRequest>anon@L6900C53` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L6900](../../../../server/admin-routes.js#L6900) |
| `handleGovernanceApiRequest>anon@L6900C53>cleanOptStr` | `arrow_function` | No | `(val: unknown, maxLen: unknown)` | `sync_value` | `server/admin-routes.js:handleGovernanceApiRequest>anon@L6900C53` | — | [server/admin-routes.js:L6934](../../../../server/admin-routes.js#L6934) |
| `handleGovernanceApiRequest>anon@L7229C49` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L7229](../../../../server/admin-routes.js#L7229) |
| `handleGovernanceApiRequest>anon@L7281C57` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L7281](../../../../server/admin-routes.js#L7281) |
| `handleGovernanceApiRequest>anon@L7340C53` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L7340](../../../../server/admin-routes.js#L7340) |
| `handleGovernanceApiRequest>anon@L7449C49` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L7449](../../../../server/admin-routes.js#L7449) |
| `handleGovernanceApiRequest>anon@L7449C49>anon@L7592C32` | `anonymous_function` | No | `(g: unknown)` | `sync_value` | — | — | [server/admin-routes.js:L7592](../../../../server/admin-routes.js#L7592) |
| `handleGovernanceApiRequest>anon@L7613C49` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L7613](../../../../server/admin-routes.js#L7613) |
| `handleGovernanceApiRequest>anon@L7735C49` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L7735](../../../../server/admin-routes.js#L7735) |
| `handleGovernanceApiRequest>anon@L7843C49` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L7843](../../../../server/admin-routes.js#L7843) |
| `handleGovernanceApiRequest>anon@L7904C57` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L7904](../../../../server/admin-routes.js#L7904) |
| `handleGovernanceApiRequest>anon@L7945C39` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L7945](../../../../server/admin-routes.js#L7945) |
| `handleGovernanceApiRequest>anon@L7968C57` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L7968](../../../../server/admin-routes.js#L7968) |
| `handleGovernanceApiRequest>anon@L7979C37` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L7979](../../../../server/admin-routes.js#L7979) |
| `handleGovernanceApiRequest>anon@L8033C51` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L8033](../../../../server/admin-routes.js#L8033) |
| `handleGovernanceApiRequest>anon@L8033C51>anon@L8085C47` | `anonymous_function` | No | `(r: unknown)` | `sync_value` | — | — | [server/admin-routes.js:L8085](../../../../server/admin-routes.js#L8085) |
| `handleGovernanceApiRequest>appendRawCookie` | `arrow_function` | No | `(cookieStr: unknown)` | `void_or_implicit` | `server/admin-routes.js:handleGovernanceApiRequest` | — | [server/admin-routes.js:L8229](../../../../server/admin-routes.js#L8229) |

## [server/app.js](../../../../server/app.js) (`module`)
- **Imports / Dependencies**: `../lib/age-policy.js`, `../lib/authz.js`, `../lib/client-ip.js`, `../lib/db-tx.js`, `../lib/diagnostics.js`, `../lib/env-compat.js`, `../lib/feature-controls.js`, `../lib/pager-notifications.js`, `../lib/photo-storage.js`, `../lib/request-context.js`, `../lib/standalone-auth.js`, `../scripts/staging-runtime-probe.js`, `./admin-routes.js`, `./customer-profile-routes.js`, `./routes.js`, `@biteshark/runtime-adapter`, `node:fs`, `node:http`, `node:path`, `node:url`
- **Exports**: `DEFAULT_MAX_JSON_BYTES`, `AUTH_MAX_JSON_BYTES`, `DIAGNOSTICS_REPORT_MAX_JSON_BYTES`, `createStandaloneServer`
- **Top-Level Constants (8)**: `SERVER_DIR`, `DEFAULT_PUBLIC_DIR`, `DEFAULT_MAX_JSON_BYTES` *(exported)*, `AUTH_MAX_JSON_BYTES` *(exported)*, `DIAGNOSTICS_REPORT_MAX_JSON_BYTES` *(exported)*, `ALLOWED_STATIC_MIME`, `NO_CACHE_STATIC_FILES`, `MUTATING_HTTP_METHODS`

| Symbol | Kind | Exported | Parameters (Observed Basis) | Returns / Throws | Confirmed Callers (Inferred in italics) | Contracts | Lines |
|---|---|---|---|---|---|---|---|
| `escapeHtml` | `function` | No | `(raw: unknown)` | `sync_value` | `server/app.js:renderAdminAccessDeniedHtml` | — | [server/app.js:L126](../../../../server/app.js#L126) |
| `sanitizeLoggedRequestPath` | `function` | No | `(pathname: unknown)` | `sync_value` | `server/app.js:createStandaloneServer>anon@L546C35` | — | [server/app.js:L135](../../../../server/app.js#L135) |
| `renderProfileFeatureDisabledHtml` | `function` | No | `()` | `sync_value` | `server/app.js:createStandaloneServer>anon@L546C35` | — | [server/app.js:L147](../../../../server/app.js#L147) |
| `renderAdminAccessDeniedHtml` | `function` | No | `(userEmail: unknown, roleLabels: array)` | `sync_value` | `server/app.js:createStandaloneServer>anon@L546C35` | — | [server/app.js:L180](../../../../server/app.js#L180) |
| `parseActOnBehalfHeaders` | `function` | No | `(req: unknown)` | `sync_value` | `server/app.js:createStandaloneServer>anon@L546C35` | — | [server/app.js:L221](../../../../server/app.js#L221) |
| `applyBaselineSecurityHeaders` | `function` | No | `(res: unknown)` | `void_or_implicit` | `server/app.js:createStandaloneServer>anon@L546C35` | — | [server/app.js:L248](../../../../server/app.js#L248) |
| `appendSetCookie` | `function` | No | `(res: unknown, cookieValue: unknown)` | `void_or_implicit` | `server/app.js:createStandaloneServer>anon@L546C35` | — | [server/app.js:L254](../../../../server/app.js#L254) |
| `isIntentionalMaintenanceResponse` | `function` | No | `(statusCode: unknown, payload: unknown)` | `sync_value` | `server/app.js:createStandaloneServer>anon@L546C35>res.__bsDiagHook` | — | [server/app.js:L266](../../../../server/app.js#L266) |
| `sendJsonResponse` | `function` | No | `(res: unknown, statusCode: unknown, payload: unknown, extraHeaders: object)` | `void_or_implicit` | `server/app.js:createHandlerResponseAdapter>json`, `server/app.js:createHandlerResponseAdapter>send`, `server/app.js:createStandaloneServer>anon@L546C35`, `server/app.js:createStandaloneServer>anon@L546C35>anon@L1221C32` (+4) | — | [server/app.js:L274](../../../../server/app.js#L274) |
| `createHandlerResponseAdapter` | `function` | No | `(rawRes: unknown, govState: null_or_object)` | `sync_value` | `server/app.js:createStandaloneServer>anon@L546C35` | — | [server/app.js:L295](../../../../server/app.js#L295) |
| `createHandlerResponseAdapter>setHeader` | `object_method` | No | `(name: unknown, value: unknown)` | `sync_value` | — | — | [server/app.js:L298](../../../../server/app.js#L298) |
| `createHandlerResponseAdapter>getHeader` | `object_method` | No | `(name: unknown)` | `sync_value` | — | — | [server/app.js:L304](../../../../server/app.js#L304) |
| `createHandlerResponseAdapter>status` | `object_method` | No | `(code: unknown)` | `sync_value` | — | — | [server/app.js:L307](../../../../server/app.js#L307) |
| `createHandlerResponseAdapter>json` | `object_method` | No | `(payload: unknown)` | `sync_value` | — | — | [server/app.js:L312](../../../../server/app.js#L312) |
| `createHandlerResponseAdapter>send` | `object_method` | No | `(payload: unknown)` | `sync_value` | — | — | [server/app.js:L329](../../../../server/app.js#L329) |
| `createHandlerResponseAdapter>end` | `object_method` | No | `(chunk: unknown)` | `sync_value` | — | — | [server/app.js:L349](../../../../server/app.js#L349) |
| `BodyParseError.constructor` | `constructor` | No | `(status: unknown, code: unknown, message: unknown)` | `void_or_implicit` | — | — | [server/app.js:L359](../../../../server/app.js#L359) |
| `readBoundedJsonBody` | `function` | No | `(req: unknown, maxBytes: unknown)` | `async -> promise (throws: BodyParseError)` | `server/app.js:createStandaloneServer>anon@L546C35` | — | [server/app.js:L366](../../../../server/app.js#L366) |
| `parseQueryObject` | `function` | No | `(searchParams: unknown)` | `sync_value` | `server/app.js:createStandaloneServer>anon@L546C35` | — | [server/app.js:L403](../../../../server/app.js#L403) |
| `resolveSafePublicFile` | `function` | No | `(realPublicRoot: unknown, rawPathname: unknown)` | `sync_value` | `server/app.js:createStandaloneServer>anon@L546C35` | — | [server/app.js:L417](../../../../server/app.js#L417) |
| `readSafeSecurityFlag` | `function` | No | `(suffix: unknown)` | `sync_value` | `server/app.js:createStandaloneServer>anon@L546C35` | — | [server/app.js:L492](../../../../server/app.js#L492) |
| `createStandaloneServer` | `function` | Yes | `({ dbAdapter, publicDir, releaseSha, trustProxy, maxJsonBytes, logger }: object)` | `sync_value (throws: Error)` | `server/index.js:main` | — | [server/app.js:L500](../../../../server/app.js#L500) |
| `createStandaloneServer>anon@L504C16` | `anonymous_function` | No | `()` | `sync_value` | — | — | [server/app.js:L504](../../../../server/app.js#L504) |
| `createStandaloneServer>getUser` | `object_method` | No | `(req: unknown)` | `async -> promise` | — | — | [server/app.js:L522](../../../../server/app.js#L522) |
| `createStandaloneServer>anon@L528C27` | `anonymous_function` | No | `()` | `sync_value` | — | — | [server/app.js:L528](../../../../server/app.js#L528) |
| `createStandaloneServer>anon@L546C35` | `anonymous_function` | No | `(req: unknown, res: unknown)` | `async -> promise` | — | — | [server/app.js:L546](../../../../server/app.js#L546) |
| `createStandaloneServer>anon@L546C35>res.__bsDiagHook` | `arrow_function` | No | `(statusCode: unknown, payload: unknown, extraHeaders: object)` | `async -> promise` | — | — | [server/app.js:L591](../../../../server/app.js#L591) |
| `createStandaloneServer>anon@L546C35>anon@L982C10` | `anonymous_function` | No | `()` | `sync_value` | — | — | [server/app.js:L982](../../../../server/app.js#L982) |
| `createStandaloneServer>anon@L546C35>anon@L982C10>anon@L991C14` | `anonymous_function` | No | `()` | `sync_value` | — | — | [server/app.js:L991](../../../../server/app.js#L991) |
| `createStandaloneServer>anon@L546C35>anon@L982C10>anon@L991C14>sendJson` | `object_method` | No | `(status: unknown, payload: unknown, headers: unknown)` | `sync_value` | — | — | [server/app.js:L999](../../../../server/app.js#L999) |
| `createStandaloneServer>anon@L546C35>anon@L1221C32` | `anonymous_function` | No | `()` | `void_or_implicit` | — | — | [server/app.js:L1221](../../../../server/app.js#L1221) |
| `createStandaloneServer>anon@L546C35>anon@L1316C32` | `anonymous_function` | No | `()` | `void_or_implicit` | — | — | [server/app.js:L1316](../../../../server/app.js#L1316) |
| `createStandaloneServer>anon@L546C35>anon@L1401C29` | `anonymous_function` | No | `()` | `void_or_implicit` | — | — | [server/app.js:L1401](../../../../server/app.js#L1401) |
| `createStandaloneServer>anon@L546C35>anon@L1425C29` | `anonymous_function` | No | `()` | `void_or_implicit` | — | — | [server/app.js:L1425](../../../../server/app.js#L1425) |
| `createStandaloneServer>closeGracefully` | `function` | No | `(timeoutMs: number)` | `async -> promise` | — | — | [server/app.js:L1467](../../../../server/app.js#L1467) |
| `createStandaloneServer>closeGracefully>anon@L1471C22` | `anonymous_function` | No | `(resolve: unknown)` | `void_or_implicit` | — | — | [server/app.js:L1471](../../../../server/app.js#L1471) |
| `createStandaloneServer>closeGracefully>anon@L1471C22>anon@L1472C31` | `anonymous_function` | No | `()` | `void_or_implicit` | — | — | [server/app.js:L1472](../../../../server/app.js#L1472) |

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

## [server/customer-profile-routes.js](../../../../server/customer-profile-routes.js) (`module`)
- **Imports / Dependencies**: `../lib/authz.js`, `../lib/customer-profile.js`, `../lib/diagnostics.js`, `../lib/env-compat.js`, `../lib/feature-controls.js`, `../lib/pager-notifications.js`, `../lib/photo-storage.js`, `@biteshark/runtime-adapter`
- **Exports**: `CUSTOMER_PROFILE_PATHS`, `resolveCallerProfileFeatureFlags`, `recordProfileDiagnostic`, `handleCustomerProfileRoute`, `applyUnlistedSharedSecurityHeaders`, `handlePublicSharedPageRequest`, `handlePublicSharedPhotoRequest`
- **Top-Level Constants (1)**: `CUSTOMER_PROFILE_PATHS` *(exported)*

| Symbol | Kind | Exported | Parameters (Observed Basis) | Returns / Throws | Confirmed Callers (Inferred in italics) | Contracts | Lines |
|---|---|---|---|---|---|---|---|
| `shortInternalActorTag` | `function` | No | `(userId: unknown)` | `sync_value` | `server/customer-profile-routes.js:recordProfileDiagnostic` | — | [server/customer-profile-routes.js:L74](../../../../server/customer-profile-routes.js#L74) |
| `resolveCallerProfileFeatureFlags` | `function` | Yes | `(dbAdapter: unknown, req: unknown, verifiedUser: unknown)` | `async -> promise` | `server/customer-profile-routes.js:handleCustomerProfileRoute`, `server/customer-profile-routes.js:handlePublicSharedPageRequest`, `server/customer-profile-routes.js:handlePublicSharedPhotoRequest` | — | [server/customer-profile-routes.js:L80](../../../../server/customer-profile-routes.js#L80) |
| `recordProfileDiagnostic` | `function` | Yes | `(dbAdapter: unknown, req: unknown, { featureKey, operationName, routeTemplate, httpMethod, httpStatus, severity, errorCode, message, retryable, outcomeState, actorId, safeContext }: object)` | `async -> promise` | `server/customer-profile-routes.js:handleCustomerProfileRoute`, `server/customer-profile-routes.js:handlePublicSharedPageRequest`, `server/customer-profile-routes.js:handlePublicSharedPhotoRequest` | — | [server/customer-profile-routes.js:L125](../../../../server/customer-profile-routes.js#L125) |
| `sendProfileError` | `function` | No | `(sendJson: unknown, req: unknown, err: unknown)` | `sync_value` | `server/customer-profile-routes.js:handleCustomerProfileRoute` | — | [server/customer-profile-routes.js:L169](../../../../server/customer-profile-routes.js#L169) |
| `handleCustomerProfileRoute` | `function` | Yes | `({ pathname, method, req, query, body, verifiedUser, dbAdapter, sendJson, rawRes }: object)` | `async -> promise (throws: CustomerProfileDomainError)` | `server/admin-routes.js:handleGovernanceApiRequest` | — | [server/customer-profile-routes.js:L190](../../../../server/customer-profile-routes.js#L190) |
| `applyUnlistedSharedSecurityHeaders` | `function` | Yes | `(res: unknown)` | `void_or_implicit` | `server/customer-profile-routes.js:handlePublicSharedPageRequest` | — | [server/customer-profile-routes.js:L689](../../../../server/customer-profile-routes.js#L689) |
| `handlePublicSharedPageRequest` | `function` | Yes | `({ rawToken, method, req, res, dbAdapter, viewerAuthenticated }: object)` | `async -> promise` | `server/app.js:createStandaloneServer>anon@L546C35` | — | [server/customer-profile-routes.js:L707](../../../../server/customer-profile-routes.js#L707) |
| `handlePublicSharedPhotoRequest` | `function` | Yes | `({ rawToken, attachmentId, method, req, res, dbAdapter }: object)` | `async -> promise` | `server/app.js:createStandaloneServer>anon@L546C35` | — | [server/customer-profile-routes.js:L779](../../../../server/customer-profile-routes.js#L779) |

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
| `matchDomainApiRoute` | `function` | Yes | `(pathname: unknown)` | `sync_value` | `server/app.js:createStandaloneServer>anon@L546C35` | — | [server/routes.js:L103](../../../../server/routes.js#L103) |
