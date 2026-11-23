# Symbol Catalog — Server & Runtime Adapter (`server/`, `packages/`)

> [!NOTE]
> **Machine-Generated Reference Inventory** — Do not hand-edit. Regenerate via `npm run registry:docs` (`node tools/code-registry/cli.mjs generate-docs`).
> - **Repository**: `https://github.com/yamanalmasaleha-png/trukly-`
> - **Provenance Mode**: `committed_source_digest` *(branch/detached-HEAD invariant; commit-bound runs use `npm run registry:scan -- --include-timestamp`)*
> - **Generator**: `biteshark-code-registry@2.0.0` (`biteshark.code-registry.v2`)
> - **Source Analysis Digest**: `972893941bb361039b39c87eca1c660c24adc38bc5397a70775abfd4504f9c9d`
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
| `bindVerifiedRequestUser` | `function` | Yes | `(req: unknown, user: unknown)` | `sync_value` | `server/app.js:createStandaloneServer>anon@L558C35`, `server/customer-profile-routes.js:handlePublicSharedPageRequest`, `server/customer-profile-routes.js:handlePublicSharedPhotoRequest` | — | [packages/runtime-adapter/index.js:L23](../../../../packages/runtime-adapter/index.js#L23) |
| `runWithRequestContext` | `function` | Yes | `(context: unknown, fn: unknown)` | `sync_value` | `server/app.js:createStandaloneServer>anon@L558C35` | — | [packages/runtime-adapter/index.js:L47](../../../../packages/runtime-adapter/index.js#L47) |
| `getActiveRequestContext` | `function` | Yes | `()` | `sync_value` | — | — | [packages/runtime-adapter/index.js:L51](../../../../packages/runtime-adapter/index.js#L51) |
| `resolveActiveDb` | `function` | No | `()` | `sync_value (throws: thrown_value)` | `packages/runtime-adapter/index.js:db.connect`, `packages/runtime-adapter/index.js:db.query`, `packages/runtime-adapter/index.js:db.transaction` | — | [packages/runtime-adapter/index.js:L55](../../../../packages/runtime-adapter/index.js#L55) |
| `db.query` | `object_method` | No | `(text: unknown, params: unknown)` | `sync_value` | — | — | [packages/runtime-adapter/index.js:L67](../../../../packages/runtime-adapter/index.js#L67) |
| `db.connect` | `object_method` | No | `()` | `sync_value (throws: Error)` | — | — | [packages/runtime-adapter/index.js:L71](../../../../packages/runtime-adapter/index.js#L71) |
| `db.transaction` | `object_method` | No | `(fn: unknown)` | `async -> promise (throws: thrown_value)` | — | — | [packages/runtime-adapter/index.js:L82](../../../../packages/runtime-adapter/index.js#L82) |
| `db.pool` | `object_method` | No | `()` | `sync_value` | — | — | [packages/runtime-adapter/index.js:L116](../../../../packages/runtime-adapter/index.js#L116) |
| `auth.getUser` | `object_method` | No | `(req: unknown)` | `async -> promise` | — | — | [packages/runtime-adapter/index.js:L125](../../../../packages/runtime-adapter/index.js#L125) |

## [server/admin-routes.js](../../../../server/admin-routes.js) (`module`)
- **Imports / Dependencies**: `../lib/admin-governance.js`, `../lib/admin-test-customer.js`, `../lib/age-policy.js`, `../lib/authz.js`, `../lib/client-ip.js`, `../lib/customer-exploration.js`, `../lib/db-tx.js`, `../lib/diagnostics.js`, `../lib/env-compat.js`, `../lib/feature-controls.js`, `../lib/pager-notifications.js`, `../lib/standalone-auth.js`, `../lib/style-guide-admin.js`, `../lib/support-tickets.js`, `./customer-exploration-routes.js`, `./customer-profile-routes.js`, `@biteshark/runtime-adapter`
- **Exports**: `EVIDENCE_UPLOAD_MAX_JSON_BYTES`, `isGovernanceApiPath`, `handleGovernanceApiRequest`
- **Top-Level Constants (6)**: `EVIDENCE_UPLOAD_MAX_JSON_BYTES` *(exported)*, `GOVERNANCE_PATHS`, `READINESS_STATUS_CATALOG`, `VALID_READINESS_STATUSES`, `LAUNCH_INCOMPLETE_REMINDER_TEXT`, `DEPLOYMENT_PORTAL_REMINDER_NOTE`

| Symbol | Kind | Exported | Parameters (Observed Basis) | Returns / Throws | Confirmed Callers (Inferred in italics) | Contracts | Lines |
|---|---|---|---|---|---|---|---|
| `isGovernanceApiPath` | `function` | Yes | `(pathname: unknown)` | `sync_value` | `server/app.js:createStandaloneServer>anon@L558C35` | — | [server/admin-routes.js:L186](../../../../server/admin-routes.js#L186) |
| `maskEmail` | `function` | No | `(email: unknown)` | `sync_value` | `server/admin-routes.js:handleGovernanceApiRequest>anon@L1033C49`, `server/admin-routes.js:handleGovernanceApiRequest>anon@L4313C49>anon@L4391C27`, `server/admin-routes.js:handleGovernanceApiRequest>anon@L5683C49>anon@L5698C45`, `server/admin-routes.js:handleGovernanceApiRequest>anon@L5683C49>formatAdminIssueRow` (+2) | — | [server/admin-routes.js:L195](../../../../server/admin-routes.js#L195) |
| `validateIsoCalendarDate` | `function` | No | `(raw: unknown, { allowFuture }: object)` | `sync_value` | `server/admin-routes.js:handleGovernanceApiRequest` | — | [server/admin-routes.js:L223](../../../../server/admin-routes.js#L223) |
| `serializeReadinessItemForActor` | `function` | No | `(row: unknown, actorRole: unknown, historyRows: array)` | `sync_value` | `server/admin-routes.js:handleGovernanceApiRequest>anon@L6763C49>anon@L6859C24`, `server/admin-routes.js:handleGovernanceApiRequest>anon@L6909C53`, `server/admin-routes.js:handleGovernanceApiRequest>anon@L7046C53` | — | [server/admin-routes.js:L248](../../../../server/admin-routes.js#L248) |
| `enableAdminTxGuards` | `function` | No | `(tx: unknown, ctx: unknown)` | `async -> promise` | `server/admin-routes.js:deliverAndFinalizeIssuedInvitation>anon@L370C53`, `server/admin-routes.js:handleGovernanceApiRequest>anon@L1151C53`, `server/admin-routes.js:handleGovernanceApiRequest>anon@L2022C55`, `server/admin-routes.js:handleGovernanceApiRequest>anon@L3015C49` (+28) | — | [server/admin-routes.js:L291](../../../../server/admin-routes.js#L291) |
| `getRuntimeReleaseSha` | `function` | No | `()` | `sync_value` | `server/admin-routes.js:deliverAndFinalizeIssuedInvitation`, `server/admin-routes.js:handleGovernanceApiRequest` | — | [server/admin-routes.js:L303](../../../../server/admin-routes.js#L303) |
| `loadInvitationEventsMapInTx` | `function` | No | `(tx: unknown, invitationIds: unknown)` | `async -> promise (throws: thrown_value)` | `server/admin-routes.js:deliverAndFinalizeIssuedInvitation>anon@L370C53`, `server/admin-routes.js:handleGovernanceApiRequest>anon@L4718C49`, `server/admin-routes.js:handleGovernanceApiRequest>anon@L4806C53` | — | [server/admin-routes.js:L312](../../../../server/admin-routes.js#L312) |
| `deliverAndFinalizeIssuedInvitation` | `function` | No | `({ dbAdapter, ctx, invitationId, tokenVersion, rawToken, recipientEmail, requestedRole, vendorId, vendorName, expiresAt, actorId, actorRole }: object)` | `async -> promise` | `server/admin-routes.js:handleGovernanceApiRequest` | — | [server/admin-routes.js:L339](../../../../server/admin-routes.js#L339) |
| `deliverAndFinalizeIssuedInvitation>anon@L370C53` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L370](../../../../server/admin-routes.js#L370) |
| `recordAndDispatchSupportNotification` | `function` | No | `({ dbAdapter, issueId, ticketNumber, recipientUserId, recipientEmail, eventKind, dedupeKey, statusLabel, isCritical }: object)` | `async -> promise (throws: thrown_value)` | `server/admin-routes.js:handleGovernanceApiRequest` | — | [server/admin-routes.js:L483](../../../../server/admin-routes.js#L483) |
| `recordAndDispatchSupportNotification>anon@L505C37` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L505](../../../../server/admin-routes.js#L505) |
| `recordAndDispatchSupportNotification>anon@L559C37` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L559](../../../../server/admin-routes.js#L559) |
| `handleGovernanceApiRequest` | `function` | Yes | `({ pathname, method, req, query, body, dbAdapter, sendJson, rawRes }: object)` | `async -> promise (throws: thrown_value)` | `server/app.js:createStandaloneServer>anon@L558C35>anon@L997C10>anon@L1006C14` | [CTR-SUPPORT-TICKETS](../CONTRACTS-CATALOG.md) | [server/admin-routes.js:L607](../../../../server/admin-routes.js#L607) |
| `handleGovernanceApiRequest>anon@L677C50` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L677](../../../../server/admin-routes.js#L677) |
| `handleGovernanceApiRequest>anon@L774C24` | `anonymous_function` | No | `()` | `sync_value` | — | — | [server/admin-routes.js:L774](../../../../server/admin-routes.js#L774) |
| `handleGovernanceApiRequest>anon@L852C39` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise (throws: thrown_value)` | — | — | [server/admin-routes.js:L852](../../../../server/admin-routes.js#L852) |
| `handleGovernanceApiRequest>anon@L1033C49` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L1033](../../../../server/admin-routes.js#L1033) |
| `handleGovernanceApiRequest>anon@L1151C53` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L1151](../../../../server/admin-routes.js#L1151) |
| `handleGovernanceApiRequest>anon@L1384C51` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L1384](../../../../server/admin-routes.js#L1384) |
| `handleGovernanceApiRequest>anon@L1384C51>anon@L1399C28` | `anonymous_function` | No | `(r: unknown)` | `sync_value` | — | — | [server/admin-routes.js:L1399](../../../../server/admin-routes.js#L1399) |
| `handleGovernanceApiRequest>anon@L1420C55` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L1420](../../../../server/admin-routes.js#L1420) |
| `handleGovernanceApiRequest>anon@L1470C53` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L1470](../../../../server/admin-routes.js#L1470) |
| `handleGovernanceApiRequest>anon@L1601C51` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L1601](../../../../server/admin-routes.js#L1601) |
| `handleGovernanceApiRequest>anon@L1728C55` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L1728](../../../../server/admin-routes.js#L1728) |
| `handleGovernanceApiRequest>anon@L1887C51` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L1887](../../../../server/admin-routes.js#L1887) |
| `handleGovernanceApiRequest>anon@L1957C55` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L1957](../../../../server/admin-routes.js#L1957) |
| `handleGovernanceApiRequest>anon@L2022C55` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L2022](../../../../server/admin-routes.js#L2022) |
| `handleGovernanceApiRequest>anon@L2116C53` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L2116](../../../../server/admin-routes.js#L2116) |
| `handleGovernanceApiRequest>anon@L2192C51` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L2192](../../../../server/admin-routes.js#L2192) |
| `handleGovernanceApiRequest>anon@L2192C51>anon@L2326C36` | `anonymous_function` | No | `(i: unknown)` | `sync_value` | — | — | [server/admin-routes.js:L2326](../../../../server/admin-routes.js#L2326) |
| `handleGovernanceApiRequest>anon@L2416C55` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L2416](../../../../server/admin-routes.js#L2416) |
| `handleGovernanceApiRequest>anon@L2726C53` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L2726](../../../../server/admin-routes.js#L2726) |
| `handleGovernanceApiRequest>anon@L2845C53` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L2845](../../../../server/admin-routes.js#L2845) |
| `handleGovernanceApiRequest>anon@L2986C37` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L2986](../../../../server/admin-routes.js#L2986) |
| `handleGovernanceApiRequest>anon@L3015C49` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L3015](../../../../server/admin-routes.js#L3015) |
| `handleGovernanceApiRequest>anon@L3199C57` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L3199](../../../../server/admin-routes.js#L3199) |
| `handleGovernanceApiRequest>anon@L3222C49` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L3222](../../../../server/admin-routes.js#L3222) |
| `handleGovernanceApiRequest>anon@L3356C49` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L3356](../../../../server/admin-routes.js#L3356) |
| `handleGovernanceApiRequest>anon@L3356C49>anon@L3439C31` | `anonymous_function` | No | `(r: unknown)` | `sync_value` | — | — | [server/admin-routes.js:L3439](../../../../server/admin-routes.js#L3439) |
| `handleGovernanceApiRequest>anon@L3503C53` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L3503](../../../../server/admin-routes.js#L3503) |
| `handleGovernanceApiRequest>anon@L3869C49` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L3869](../../../../server/admin-routes.js#L3869) |
| `handleGovernanceApiRequest>anon@L3869C49>anon@L3974C26` | `anonymous_function` | No | `(r: unknown)` | `sync_value` | — | — | [server/admin-routes.js:L3974](../../../../server/admin-routes.js#L3974) |
| `handleGovernanceApiRequest>anon@L4001C53` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L4001](../../../../server/admin-routes.js#L4001) |
| `handleGovernanceApiRequest>anon@L4001C53>pickBool` | `arrow_function` | No | `(a: unknown, b: unknown, fallback: unknown)` | `sync_value` | `server/admin-routes.js:handleGovernanceApiRequest>anon@L4001C53` | — | [server/admin-routes.js:L4130](../../../../server/admin-routes.js#L4130) |
| `handleGovernanceApiRequest>anon@L4313C49` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L4313](../../../../server/admin-routes.js#L4313) |
| `handleGovernanceApiRequest>anon@L4313C49>anon@L4391C27` | `anonymous_function` | No | `(r: unknown)` | `sync_value` | — | — | [server/admin-routes.js:L4391](../../../../server/admin-routes.js#L4391) |
| `handleGovernanceApiRequest>anon@L4437C53` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L4437](../../../../server/admin-routes.js#L4437) |
| `handleGovernanceApiRequest>anon@L4437C53>anon@L4489C10` | `anonymous_function` | No | `(r: unknown)` | `sync_value` | — | — | [server/admin-routes.js:L4489](../../../../server/admin-routes.js#L4489) |
| `handleGovernanceApiRequest>anon@L4574C13` | `anonymous_function` | No | `(err: unknown)` | `sync_value (throws: thrown_value)` | — | — | [server/admin-routes.js:L4574](../../../../server/admin-routes.js#L4574) |
| `handleGovernanceApiRequest>anon@L4610C53` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L4610](../../../../server/admin-routes.js#L4610) |
| `handleGovernanceApiRequest>anon@L4687C13` | `anonymous_function` | No | `(err: unknown)` | `sync_value (throws: thrown_value)` | — | — | [server/admin-routes.js:L4687](../../../../server/admin-routes.js#L4687) |
| `handleGovernanceApiRequest>anon@L4718C49` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L4718](../../../../server/admin-routes.js#L4718) |
| `handleGovernanceApiRequest>anon@L4718C49>anon@L4774C30` | `anonymous_function` | No | `(r: unknown)` | `sync_value` | — | — | [server/admin-routes.js:L4774](../../../../server/admin-routes.js#L4774) |
| `handleGovernanceApiRequest>anon@L4806C53` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L4806](../../../../server/admin-routes.js#L4806) |
| `handleGovernanceApiRequest>anon@L5060C53` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L5060](../../../../server/admin-routes.js#L5060) |
| `handleGovernanceApiRequest>anon@L5424C49` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L5424](../../../../server/admin-routes.js#L5424) |
| `handleGovernanceApiRequest>anon@L5548C53` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L5548](../../../../server/admin-routes.js#L5548) |
| `handleGovernanceApiRequest>anon@L5683C49` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L5683](../../../../server/admin-routes.js#L5683) |
| `handleGovernanceApiRequest>anon@L5683C49>anon@L5698C45` | `anonymous_function` | No | `(r: unknown)` | `sync_value` | — | — | [server/admin-routes.js:L5698](../../../../server/admin-routes.js#L5698) |
| `handleGovernanceApiRequest>anon@L5683C49>formatAdminIssueRow` | `arrow_function` | No | `(r: unknown)` | `sync_value` | `server/admin-routes.js:handleGovernanceApiRequest>anon@L5683C49`, `server/admin-routes.js:handleGovernanceApiRequest>anon@L5683C49>anon@L6060C25` | — | [server/admin-routes.js:L5737](../../../../server/admin-routes.js#L5737) |
| `handleGovernanceApiRequest>anon@L5683C49>anon@L5847C45` | `anonymous_function` | No | `(l: unknown)` | `sync_value` | — | — | [server/admin-routes.js:L5847](../../../../server/admin-routes.js#L5847) |
| `handleGovernanceApiRequest>anon@L5683C49>anon@L6060C25` | `anonymous_function` | No | `(r: unknown)` | `sync_value` | — | — | [server/admin-routes.js:L6060](../../../../server/admin-routes.js#L6060) |
| `handleGovernanceApiRequest>anon@L6127C53` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L6127](../../../../server/admin-routes.js#L6127) |
| `handleGovernanceApiRequest>anon@L6127C53>resolveEffectiveAdminLevelInTx` | `arrow_function` | No | `(uid: unknown, dbRole: unknown)` | `async -> promise` | `server/admin-routes.js:handleGovernanceApiRequest>anon@L6127C53` | — | [server/admin-routes.js:L6189](../../../../server/admin-routes.js#L6189) |
| `handleGovernanceApiRequest>anon@L6542C49` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L6542](../../../../server/admin-routes.js#L6542) |
| `handleGovernanceApiRequest>anon@L6763C49` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L6763](../../../../server/admin-routes.js#L6763) |
| `handleGovernanceApiRequest>anon@L6909C53` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L6909](../../../../server/admin-routes.js#L6909) |
| `handleGovernanceApiRequest>anon@L7046C53` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L7046](../../../../server/admin-routes.js#L7046) |
| `handleGovernanceApiRequest>anon@L7046C53>cleanOptStr` | `arrow_function` | No | `(val: unknown, maxLen: unknown)` | `sync_value` | `server/admin-routes.js:handleGovernanceApiRequest>anon@L7046C53` | — | [server/admin-routes.js:L7080](../../../../server/admin-routes.js#L7080) |
| `handleGovernanceApiRequest>anon@L7375C49` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L7375](../../../../server/admin-routes.js#L7375) |
| `handleGovernanceApiRequest>anon@L7375C49>anon@L7418C23` | `anonymous_function` | No | `(r: unknown)` | `sync_value` | — | — | [server/admin-routes.js:L7418](../../../../server/admin-routes.js#L7418) |
| `handleGovernanceApiRequest>anon@L7438C57` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L7438](../../../../server/admin-routes.js#L7438) |
| `handleGovernanceApiRequest>anon@L7497C53` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L7497](../../../../server/admin-routes.js#L7497) |
| `handleGovernanceApiRequest>anon@L7606C49` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L7606](../../../../server/admin-routes.js#L7606) |
| `handleGovernanceApiRequest>anon@L7606C49>anon@L7749C32` | `anonymous_function` | No | `(g: unknown)` | `sync_value` | — | — | [server/admin-routes.js:L7749](../../../../server/admin-routes.js#L7749) |
| `handleGovernanceApiRequest>anon@L7770C49` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L7770](../../../../server/admin-routes.js#L7770) |
| `handleGovernanceApiRequest>anon@L7892C49` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L7892](../../../../server/admin-routes.js#L7892) |
| `handleGovernanceApiRequest>anon@L8000C49` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L8000](../../../../server/admin-routes.js#L8000) |
| `handleGovernanceApiRequest>anon@L8061C57` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L8061](../../../../server/admin-routes.js#L8061) |
| `handleGovernanceApiRequest>anon@L8102C39` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L8102](../../../../server/admin-routes.js#L8102) |
| `handleGovernanceApiRequest>anon@L8125C57` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L8125](../../../../server/admin-routes.js#L8125) |
| `handleGovernanceApiRequest>anon@L8136C37` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L8136](../../../../server/admin-routes.js#L8136) |
| `handleGovernanceApiRequest>anon@L8190C51` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L8190](../../../../server/admin-routes.js#L8190) |
| `handleGovernanceApiRequest>anon@L8190C51>anon@L8242C47` | `anonymous_function` | No | `(r: unknown)` | `sync_value` | — | — | [server/admin-routes.js:L8242](../../../../server/admin-routes.js#L8242) |
| `handleGovernanceApiRequest>appendRawCookie` | `arrow_function` | No | `(cookieStr: unknown)` | `void_or_implicit` | `server/admin-routes.js:handleGovernanceApiRequest` | — | [server/admin-routes.js:L8386](../../../../server/admin-routes.js#L8386) |

## [server/app.js](../../../../server/app.js) (`module`)
- **Imports / Dependencies**: `../lib/admin-test-customer.js`, `../lib/age-policy.js`, `../lib/authz.js`, `../lib/client-ip.js`, `../lib/db-tx.js`, `../lib/diagnostics.js`, `../lib/env-compat.js`, `../lib/feature-controls.js`, `../lib/pager-notifications.js`, `../lib/photo-storage.js`, `../lib/request-context.js`, `../lib/standalone-auth.js`, `../scripts/staging-runtime-probe.js`, `./admin-routes.js`, `./customer-profile-routes.js`, `./routes.js`, `@biteshark/runtime-adapter`, `node:fs`, `node:http`, `node:path`, `node:url`
- **Exports**: `DEFAULT_MAX_JSON_BYTES`, `AUTH_MAX_JSON_BYTES`, `DIAGNOSTICS_REPORT_MAX_JSON_BYTES`, `createStandaloneServer`
- **Top-Level Constants (8)**: `SERVER_DIR`, `DEFAULT_PUBLIC_DIR`, `DEFAULT_MAX_JSON_BYTES` *(exported)*, `AUTH_MAX_JSON_BYTES` *(exported)*, `DIAGNOSTICS_REPORT_MAX_JSON_BYTES` *(exported)*, `ALLOWED_STATIC_MIME`, `NO_CACHE_STATIC_FILES`, `MUTATING_HTTP_METHODS`

| Symbol | Kind | Exported | Parameters (Observed Basis) | Returns / Throws | Confirmed Callers (Inferred in italics) | Contracts | Lines |
|---|---|---|---|---|---|---|---|
| `safeDecodeSegment` | `function` | No | `(raw: unknown)` | `sync_value` | `server/app.js:createStandaloneServer>anon@L558C35` | — | [server/app.js:L129](../../../../server/app.js#L129) |
| `escapeHtml` | `function` | No | `(raw: unknown)` | `sync_value` | `server/app.js:renderAdminAccessDeniedHtml` | — | [server/app.js:L137](../../../../server/app.js#L137) |
| `sanitizeLoggedRequestPath` | `function` | No | `(pathname: unknown)` | `sync_value` | `server/app.js:createStandaloneServer>anon@L558C35` | — | [server/app.js:L146](../../../../server/app.js#L146) |
| `renderProfileFeatureDisabledHtml` | `function` | No | `()` | `sync_value` | `server/app.js:createStandaloneServer>anon@L558C35` | — | [server/app.js:L158](../../../../server/app.js#L158) |
| `renderAdminAccessDeniedHtml` | `function` | No | `(userEmail: unknown, roleLabels: array)` | `sync_value` | `server/app.js:createStandaloneServer>anon@L558C35` | — | [server/app.js:L191](../../../../server/app.js#L191) |
| `parseActOnBehalfHeaders` | `function` | No | `(req: unknown)` | `sync_value` | `server/app.js:createStandaloneServer>anon@L558C35` | — | [server/app.js:L232](../../../../server/app.js#L232) |
| `applyBaselineSecurityHeaders` | `function` | No | `(res: unknown)` | `void_or_implicit` | `server/app.js:createStandaloneServer>anon@L558C35` | — | [server/app.js:L259](../../../../server/app.js#L259) |
| `appendSetCookie` | `function` | No | `(res: unknown, cookieValue: unknown)` | `void_or_implicit` | `server/app.js:createStandaloneServer>anon@L558C35` | — | [server/app.js:L266](../../../../server/app.js#L266) |
| `isIntentionalMaintenanceResponse` | `function` | No | `(statusCode: unknown, payload: unknown)` | `sync_value` | `server/app.js:createStandaloneServer>anon@L558C35>res.__bsDiagHook` | — | [server/app.js:L278](../../../../server/app.js#L278) |
| `sendJsonResponse` | `function` | No | `(res: unknown, statusCode: unknown, payload: unknown, extraHeaders: object)` | `void_or_implicit` | `server/app.js:createHandlerResponseAdapter>json`, `server/app.js:createHandlerResponseAdapter>send`, `server/app.js:createStandaloneServer>anon@L558C35`, `server/app.js:createStandaloneServer>anon@L558C35>anon@L1238C32` (+4) | — | [server/app.js:L286](../../../../server/app.js#L286) |
| `createHandlerResponseAdapter` | `function` | No | `(rawRes: unknown, govState: null_or_object)` | `sync_value` | `server/app.js:createStandaloneServer>anon@L558C35` | — | [server/app.js:L307](../../../../server/app.js#L307) |
| `createHandlerResponseAdapter>setHeader` | `object_method` | No | `(name: unknown, value: unknown)` | `sync_value` | — | — | [server/app.js:L310](../../../../server/app.js#L310) |
| `createHandlerResponseAdapter>getHeader` | `object_method` | No | `(name: unknown)` | `sync_value` | — | — | [server/app.js:L316](../../../../server/app.js#L316) |
| `createHandlerResponseAdapter>status` | `object_method` | No | `(code: unknown)` | `sync_value` | — | — | [server/app.js:L319](../../../../server/app.js#L319) |
| `createHandlerResponseAdapter>json` | `object_method` | No | `(payload: unknown)` | `sync_value` | — | — | [server/app.js:L324](../../../../server/app.js#L324) |
| `createHandlerResponseAdapter>send` | `object_method` | No | `(payload: unknown)` | `sync_value` | — | — | [server/app.js:L341](../../../../server/app.js#L341) |
| `createHandlerResponseAdapter>end` | `object_method` | No | `(chunk: unknown)` | `sync_value` | — | — | [server/app.js:L361](../../../../server/app.js#L361) |
| `BodyParseError.constructor` | `constructor` | No | `(status: unknown, code: unknown, message: unknown)` | `void_or_implicit` | — | — | [server/app.js:L371](../../../../server/app.js#L371) |
| `readBoundedJsonBody` | `function` | No | `(req: unknown, maxBytes: unknown)` | `async -> promise (throws: BodyParseError)` | `server/app.js:createStandaloneServer>anon@L558C35` | — | [server/app.js:L378](../../../../server/app.js#L378) |
| `parseQueryObject` | `function` | No | `(searchParams: unknown)` | `sync_value` | `server/app.js:createStandaloneServer>anon@L558C35` | — | [server/app.js:L415](../../../../server/app.js#L415) |
| `resolveSafePublicFile` | `function` | No | `(realPublicRoot: unknown, rawPathname: unknown)` | `sync_value` | `server/app.js:createStandaloneServer>anon@L558C35` | — | [server/app.js:L429](../../../../server/app.js#L429) |
| `readSafeSecurityFlag` | `function` | No | `(suffix: unknown)` | `sync_value` | `server/app.js:createStandaloneServer>anon@L558C35` | — | [server/app.js:L504](../../../../server/app.js#L504) |
| `createStandaloneServer` | `function` | Yes | `({ dbAdapter, publicDir, releaseSha, trustProxy, maxJsonBytes, logger }: object)` | `sync_value (throws: Error)` | `server/index.js:main` | — | [server/app.js:L512](../../../../server/app.js#L512) |
| `createStandaloneServer>anon@L516C16` | `anonymous_function` | No | `()` | `sync_value` | — | — | [server/app.js:L516](../../../../server/app.js#L516) |
| `createStandaloneServer>getUser` | `object_method` | No | `(req: unknown)` | `async -> promise` | — | — | [server/app.js:L534](../../../../server/app.js#L534) |
| `createStandaloneServer>anon@L540C27` | `anonymous_function` | No | `()` | `sync_value` | — | — | [server/app.js:L540](../../../../server/app.js#L540) |
| `createStandaloneServer>anon@L558C35` | `anonymous_function` | No | `(req: unknown, res: unknown)` | `async -> promise` | — | — | [server/app.js:L558](../../../../server/app.js#L558) |
| `createStandaloneServer>anon@L558C35>res.__bsDiagHook` | `arrow_function` | No | `(statusCode: unknown, payload: unknown, extraHeaders: object)` | `async -> promise` | — | — | [server/app.js:L603](../../../../server/app.js#L603) |
| `createStandaloneServer>anon@L558C35>anon@L997C10` | `anonymous_function` | No | `()` | `sync_value` | — | — | [server/app.js:L997](../../../../server/app.js#L997) |
| `createStandaloneServer>anon@L558C35>anon@L997C10>anon@L1006C14` | `anonymous_function` | No | `()` | `sync_value` | — | — | [server/app.js:L1006](../../../../server/app.js#L1006) |
| `createStandaloneServer>anon@L558C35>anon@L997C10>anon@L1006C14>sendJson` | `object_method` | No | `(status: unknown, payload: unknown, headers: unknown)` | `sync_value` | — | — | [server/app.js:L1014](../../../../server/app.js#L1014) |
| `createStandaloneServer>anon@L558C35>anon@L1238C32` | `anonymous_function` | No | `()` | `void_or_implicit` | — | — | [server/app.js:L1238](../../../../server/app.js#L1238) |
| `createStandaloneServer>anon@L558C35>anon@L1333C32` | `anonymous_function` | No | `()` | `void_or_implicit` | — | — | [server/app.js:L1333](../../../../server/app.js#L1333) |
| `createStandaloneServer>anon@L558C35>anon@L1423C29` | `anonymous_function` | No | `()` | `void_or_implicit` | — | — | [server/app.js:L1423](../../../../server/app.js#L1423) |
| `createStandaloneServer>anon@L558C35>anon@L1447C29` | `anonymous_function` | No | `()` | `void_or_implicit` | — | — | [server/app.js:L1447](../../../../server/app.js#L1447) |
| `createStandaloneServer>closeGracefully` | `function` | No | `(timeoutMs: number)` | `async -> promise` | — | — | [server/app.js:L1489](../../../../server/app.js#L1489) |
| `createStandaloneServer>closeGracefully>anon@L1493C22` | `anonymous_function` | No | `(resolve: unknown)` | `void_or_implicit` | — | — | [server/app.js:L1493](../../../../server/app.js#L1493) |
| `createStandaloneServer>closeGracefully>anon@L1493C22>anon@L1494C31` | `anonymous_function` | No | `()` | `void_or_implicit` | — | — | [server/app.js:L1494](../../../../server/app.js#L1494) |

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
- **Imports / Dependencies**: `../lib/authz.js`, `../lib/customer-profile.js`, `../lib/db-tx.js`, `../lib/diagnostics.js`, `../lib/env-compat.js`, `../lib/feature-controls.js`, `../lib/pager-notifications.js`, `../lib/photo-storage.js`, `@biteshark/runtime-adapter`
- **Exports**: `CUSTOMER_PROFILE_PATHS`, `resolveCallerProfileFeatureFlags`, `recordProfileDiagnostic`, `handleCustomerProfileRoute`, `applyUnlistedSharedSecurityHeaders`, `handlePublicSharedPageRequest`, `handlePublicSharedPhotoRequest`
- **Top-Level Constants (1)**: `CUSTOMER_PROFILE_PATHS` *(exported)*

| Symbol | Kind | Exported | Parameters (Observed Basis) | Returns / Throws | Confirmed Callers (Inferred in italics) | Contracts | Lines |
|---|---|---|---|---|---|---|---|
| `shortInternalActorTag` | `function` | No | `(userId: unknown)` | `sync_value` | `server/customer-profile-routes.js:recordProfileDiagnostic` | — | [server/customer-profile-routes.js:L75](../../../../server/customer-profile-routes.js#L75) |
| `resolveCallerProfileFeatureFlags` | `function` | Yes | `(dbAdapter: unknown, req: unknown, verifiedUser: unknown)` | `async -> promise` | `server/customer-profile-routes.js:handleCustomerProfileRoute`, `server/customer-profile-routes.js:handlePublicSharedPageRequest`, `server/customer-profile-routes.js:handlePublicSharedPhotoRequest` | — | [server/customer-profile-routes.js:L81](../../../../server/customer-profile-routes.js#L81) |
| `recordProfileDiagnostic` | `function` | Yes | `(dbAdapter: unknown, req: unknown, { featureKey, operationName, routeTemplate, httpMethod, httpStatus, severity, errorCode, message, retryable, outcomeState, actorId, safeContext }: object)` | `async -> promise` | `server/customer-profile-routes.js:handleCustomerProfileRoute`, `server/customer-profile-routes.js:handlePublicSharedPageRequest`, `server/customer-profile-routes.js:handlePublicSharedPhotoRequest` | — | [server/customer-profile-routes.js:L126](../../../../server/customer-profile-routes.js#L126) |
| `sendProfileError` | `function` | No | `(sendJson: unknown, req: unknown, err: unknown)` | `sync_value` | `server/customer-profile-routes.js:handleCustomerProfileRoute` | — | [server/customer-profile-routes.js:L170](../../../../server/customer-profile-routes.js#L170) |
| `handleCustomerProfileRoute` | `function` | Yes | `({ pathname, method, req, query, body, verifiedUser, dbAdapter, sendJson, rawRes }: object)` | `async -> promise (throws: CustomerProfileDomainError, thrown_value)` | `server/admin-routes.js:handleGovernanceApiRequest` | — | [server/customer-profile-routes.js:L192](../../../../server/customer-profile-routes.js#L192) |
| `applyUnlistedSharedSecurityHeaders` | `function` | Yes | `(res: unknown)` | `void_or_implicit` | `server/customer-profile-routes.js:handlePublicSharedPageRequest` | — | [server/customer-profile-routes.js:L697](../../../../server/customer-profile-routes.js#L697) |
| `handlePublicSharedPageRequest` | `function` | Yes | `({ rawToken, method, req, res, dbAdapter, viewerAuthenticated, viewerUser }: object)` | `async -> promise` | `server/app.js:createStandaloneServer>anon@L558C35` | — | [server/customer-profile-routes.js:L715](../../../../server/customer-profile-routes.js#L715) |
| `handlePublicSharedPhotoRequest` | `function` | Yes | `({ rawToken, attachmentId, method, req, res, dbAdapter, viewerUser }: object)` | `async -> promise` | `server/app.js:createStandaloneServer>anon@L558C35` | — | [server/customer-profile-routes.js:L793](../../../../server/customer-profile-routes.js#L793) |

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
| `matchDomainApiRoute` | `function` | Yes | `(pathname: unknown)` | `sync_value` | `server/app.js:createStandaloneServer>anon@L558C35` | — | [server/routes.js:L103](../../../../server/routes.js#L103) |
