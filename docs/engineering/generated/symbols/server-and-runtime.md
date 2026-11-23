# Symbol Catalog — Server & Runtime Adapter (`server/`, `packages/`)

> [!NOTE]
> **Machine-Generated Reference Inventory** — Do not hand-edit. Regenerate via `npm run registry:docs` (`node tools/code-registry/cli.mjs generate-docs`).
> - **Repository**: `https://github.com/yamanalmasaleha-png/trukly-`
> - **Provenance Mode**: `committed_source_digest` *(branch/detached-HEAD invariant; commit-bound runs use `npm run registry:scan -- --include-timestamp`)*
> - **Generator**: `biteshark-code-registry@2.0.0` (`biteshark.code-registry.v2`)
> - **Source Analysis Digest**: `0c5a573f94b12f309155ebe3b55b4d209581e87bff6c937910fc952c9c64d592`
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
| `isGovernanceApiPath` | `function` | Yes | `(pathname: unknown)` | `sync_value` | `server/app.js:createStandaloneServer>anon@L546C35` | — | [server/admin-routes.js:L183](../../../../server/admin-routes.js#L183) |
| `maskEmail` | `function` | No | `(email: unknown)` | `sync_value` | `server/admin-routes.js:handleGovernanceApiRequest>anon@L1011C49`, `server/admin-routes.js:handleGovernanceApiRequest>anon@L4224C49>anon@L4295C27`, `server/admin-routes.js:handleGovernanceApiRequest>anon@L5554C49>anon@L5569C45`, `server/admin-routes.js:handleGovernanceApiRequest>anon@L5554C49>formatAdminIssueRow` (+2) | — | [server/admin-routes.js:L192](../../../../server/admin-routes.js#L192) |
| `validateIsoCalendarDate` | `function` | No | `(raw: unknown, { allowFuture }: object)` | `sync_value` | `server/admin-routes.js:handleGovernanceApiRequest` | — | [server/admin-routes.js:L220](../../../../server/admin-routes.js#L220) |
| `serializeReadinessItemForActor` | `function` | No | `(row: unknown, actorRole: unknown, historyRows: array)` | `sync_value` | `server/admin-routes.js:handleGovernanceApiRequest>anon@L6621C49>anon@L6717C24`, `server/admin-routes.js:handleGovernanceApiRequest>anon@L6767C53`, `server/admin-routes.js:handleGovernanceApiRequest>anon@L6904C53` | — | [server/admin-routes.js:L245](../../../../server/admin-routes.js#L245) |
| `enableAdminTxGuards` | `function` | No | `(tx: unknown, ctx: unknown)` | `async -> promise` | `server/admin-routes.js:deliverAndFinalizeIssuedInvitation>anon@L367C53`, `server/admin-routes.js:handleGovernanceApiRequest>anon@L1129C53`, `server/admin-routes.js:handleGovernanceApiRequest>anon@L1994C55`, `server/admin-routes.js:handleGovernanceApiRequest>anon@L2947C49` (+28) | — | [server/admin-routes.js:L288](../../../../server/admin-routes.js#L288) |
| `getRuntimeReleaseSha` | `function` | No | `()` | `sync_value` | `server/admin-routes.js:deliverAndFinalizeIssuedInvitation`, `server/admin-routes.js:handleGovernanceApiRequest` | — | [server/admin-routes.js:L300](../../../../server/admin-routes.js#L300) |
| `loadInvitationEventsMapInTx` | `function` | No | `(tx: unknown, invitationIds: unknown)` | `async -> promise (throws: thrown_value)` | `server/admin-routes.js:deliverAndFinalizeIssuedInvitation>anon@L367C53`, `server/admin-routes.js:handleGovernanceApiRequest>anon@L4604C49`, `server/admin-routes.js:handleGovernanceApiRequest>anon@L4687C53` | — | [server/admin-routes.js:L309](../../../../server/admin-routes.js#L309) |
| `deliverAndFinalizeIssuedInvitation` | `function` | No | `({ dbAdapter, ctx, invitationId, tokenVersion, rawToken, recipientEmail, requestedRole, vendorId, vendorName, expiresAt, actorId, actorRole }: object)` | `async -> promise` | `server/admin-routes.js:handleGovernanceApiRequest` | — | [server/admin-routes.js:L336](../../../../server/admin-routes.js#L336) |
| `deliverAndFinalizeIssuedInvitation>anon@L367C53` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L367](../../../../server/admin-routes.js#L367) |
| `recordAndDispatchSupportNotification` | `function` | No | `({ dbAdapter, issueId, ticketNumber, recipientUserId, recipientEmail, eventKind, dedupeKey, statusLabel, isCritical }: object)` | `async -> promise (throws: thrown_value)` | `server/admin-routes.js:handleGovernanceApiRequest` | — | [server/admin-routes.js:L480](../../../../server/admin-routes.js#L480) |
| `recordAndDispatchSupportNotification>anon@L502C37` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L502](../../../../server/admin-routes.js#L502) |
| `recordAndDispatchSupportNotification>anon@L556C37` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L556](../../../../server/admin-routes.js#L556) |
| `handleGovernanceApiRequest` | `function` | Yes | `({ pathname, method, req, query, body, dbAdapter, sendJson, rawRes }: object)` | `async -> promise` | `server/app.js:createStandaloneServer>anon@L546C35>anon@L982C10>anon@L991C14` | [CTR-SUPPORT-TICKETS](../CONTRACTS-CATALOG.md) | [server/admin-routes.js:L604](../../../../server/admin-routes.js#L604) |
| `handleGovernanceApiRequest>anon@L660C50` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L660](../../../../server/admin-routes.js#L660) |
| `handleGovernanceApiRequest>anon@L727C24` | `anonymous_function` | No | `()` | `sync_value` | — | — | [server/admin-routes.js:L727](../../../../server/admin-routes.js#L727) |
| `handleGovernanceApiRequest>anon@L805C39` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise (throws: thrown_value)` | — | — | [server/admin-routes.js:L805](../../../../server/admin-routes.js#L805) |
| `handleGovernanceApiRequest>anon@L1011C49` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L1011](../../../../server/admin-routes.js#L1011) |
| `handleGovernanceApiRequest>anon@L1129C53` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L1129](../../../../server/admin-routes.js#L1129) |
| `handleGovernanceApiRequest>anon@L1362C51` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L1362](../../../../server/admin-routes.js#L1362) |
| `handleGovernanceApiRequest>anon@L1362C51>anon@L1377C28` | `anonymous_function` | No | `(r: unknown)` | `sync_value` | — | — | [server/admin-routes.js:L1377](../../../../server/admin-routes.js#L1377) |
| `handleGovernanceApiRequest>anon@L1398C55` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L1398](../../../../server/admin-routes.js#L1398) |
| `handleGovernanceApiRequest>anon@L1448C53` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L1448](../../../../server/admin-routes.js#L1448) |
| `handleGovernanceApiRequest>anon@L1579C51` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L1579](../../../../server/admin-routes.js#L1579) |
| `handleGovernanceApiRequest>anon@L1706C55` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L1706](../../../../server/admin-routes.js#L1706) |
| `handleGovernanceApiRequest>anon@L1865C51` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L1865](../../../../server/admin-routes.js#L1865) |
| `handleGovernanceApiRequest>anon@L1929C55` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L1929](../../../../server/admin-routes.js#L1929) |
| `handleGovernanceApiRequest>anon@L1994C55` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L1994](../../../../server/admin-routes.js#L1994) |
| `handleGovernanceApiRequest>anon@L2088C53` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L2088](../../../../server/admin-routes.js#L2088) |
| `handleGovernanceApiRequest>anon@L2164C51` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L2164](../../../../server/admin-routes.js#L2164) |
| `handleGovernanceApiRequest>anon@L2164C51>anon@L2278C36` | `anonymous_function` | No | `(i: unknown)` | `sync_value` | — | — | [server/admin-routes.js:L2278](../../../../server/admin-routes.js#L2278) |
| `handleGovernanceApiRequest>anon@L2362C55` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L2362](../../../../server/admin-routes.js#L2362) |
| `handleGovernanceApiRequest>anon@L2658C53` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L2658](../../../../server/admin-routes.js#L2658) |
| `handleGovernanceApiRequest>anon@L2777C53` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L2777](../../../../server/admin-routes.js#L2777) |
| `handleGovernanceApiRequest>anon@L2918C37` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L2918](../../../../server/admin-routes.js#L2918) |
| `handleGovernanceApiRequest>anon@L2947C49` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L2947](../../../../server/admin-routes.js#L2947) |
| `handleGovernanceApiRequest>anon@L3131C57` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L3131](../../../../server/admin-routes.js#L3131) |
| `handleGovernanceApiRequest>anon@L3154C49` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L3154](../../../../server/admin-routes.js#L3154) |
| `handleGovernanceApiRequest>anon@L3288C49` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L3288](../../../../server/admin-routes.js#L3288) |
| `handleGovernanceApiRequest>anon@L3288C49>anon@L3371C31` | `anonymous_function` | No | `(r: unknown)` | `sync_value` | — | — | [server/admin-routes.js:L3371](../../../../server/admin-routes.js#L3371) |
| `handleGovernanceApiRequest>anon@L3435C53` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L3435](../../../../server/admin-routes.js#L3435) |
| `handleGovernanceApiRequest>anon@L3801C49` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L3801](../../../../server/admin-routes.js#L3801) |
| `handleGovernanceApiRequest>anon@L3801C49>anon@L3906C26` | `anonymous_function` | No | `(r: unknown)` | `sync_value` | — | — | [server/admin-routes.js:L3906](../../../../server/admin-routes.js#L3906) |
| `handleGovernanceApiRequest>anon@L3933C53` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L3933](../../../../server/admin-routes.js#L3933) |
| `handleGovernanceApiRequest>anon@L3933C53>pickBool` | `arrow_function` | No | `(a: unknown, b: unknown, fallback: unknown)` | `sync_value` | `server/admin-routes.js:handleGovernanceApiRequest>anon@L3933C53` | — | [server/admin-routes.js:L4062](../../../../server/admin-routes.js#L4062) |
| `handleGovernanceApiRequest>anon@L4224C49` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L4224](../../../../server/admin-routes.js#L4224) |
| `handleGovernanceApiRequest>anon@L4224C49>anon@L4295C27` | `anonymous_function` | No | `(r: unknown)` | `sync_value` | — | — | [server/admin-routes.js:L4295](../../../../server/admin-routes.js#L4295) |
| `handleGovernanceApiRequest>anon@L4341C53` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L4341](../../../../server/admin-routes.js#L4341) |
| `handleGovernanceApiRequest>anon@L4341C53>anon@L4384C10` | `anonymous_function` | No | `(r: unknown)` | `sync_value` | — | — | [server/admin-routes.js:L4384](../../../../server/admin-routes.js#L4384) |
| `handleGovernanceApiRequest>anon@L4469C13` | `anonymous_function` | No | `(err: unknown)` | `sync_value (throws: thrown_value)` | — | — | [server/admin-routes.js:L4469](../../../../server/admin-routes.js#L4469) |
| `handleGovernanceApiRequest>anon@L4505C53` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L4505](../../../../server/admin-routes.js#L4505) |
| `handleGovernanceApiRequest>anon@L4573C13` | `anonymous_function` | No | `(err: unknown)` | `sync_value (throws: thrown_value)` | — | — | [server/admin-routes.js:L4573](../../../../server/admin-routes.js#L4573) |
| `handleGovernanceApiRequest>anon@L4604C49` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L4604](../../../../server/admin-routes.js#L4604) |
| `handleGovernanceApiRequest>anon@L4687C53` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L4687](../../../../server/admin-routes.js#L4687) |
| `handleGovernanceApiRequest>anon@L4941C53` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L4941](../../../../server/admin-routes.js#L4941) |
| `handleGovernanceApiRequest>anon@L5305C49` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L5305](../../../../server/admin-routes.js#L5305) |
| `handleGovernanceApiRequest>anon@L5429C53` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L5429](../../../../server/admin-routes.js#L5429) |
| `handleGovernanceApiRequest>anon@L5554C49` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L5554](../../../../server/admin-routes.js#L5554) |
| `handleGovernanceApiRequest>anon@L5554C49>anon@L5569C45` | `anonymous_function` | No | `(r: unknown)` | `sync_value` | — | — | [server/admin-routes.js:L5569](../../../../server/admin-routes.js#L5569) |
| `handleGovernanceApiRequest>anon@L5554C49>formatAdminIssueRow` | `arrow_function` | No | `(r: unknown)` | `sync_value` | `server/admin-routes.js:handleGovernanceApiRequest>anon@L5554C49`, `server/admin-routes.js:handleGovernanceApiRequest>anon@L5554C49>anon@L5931C25` | — | [server/admin-routes.js:L5608](../../../../server/admin-routes.js#L5608) |
| `handleGovernanceApiRequest>anon@L5554C49>anon@L5718C45` | `anonymous_function` | No | `(l: unknown)` | `sync_value` | — | — | [server/admin-routes.js:L5718](../../../../server/admin-routes.js#L5718) |
| `handleGovernanceApiRequest>anon@L5554C49>anon@L5931C25` | `anonymous_function` | No | `(r: unknown)` | `sync_value` | — | — | [server/admin-routes.js:L5931](../../../../server/admin-routes.js#L5931) |
| `handleGovernanceApiRequest>anon@L5998C53` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L5998](../../../../server/admin-routes.js#L5998) |
| `handleGovernanceApiRequest>anon@L6400C49` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L6400](../../../../server/admin-routes.js#L6400) |
| `handleGovernanceApiRequest>anon@L6621C49` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L6621](../../../../server/admin-routes.js#L6621) |
| `handleGovernanceApiRequest>anon@L6767C53` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L6767](../../../../server/admin-routes.js#L6767) |
| `handleGovernanceApiRequest>anon@L6904C53` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L6904](../../../../server/admin-routes.js#L6904) |
| `handleGovernanceApiRequest>anon@L6904C53>cleanOptStr` | `arrow_function` | No | `(val: unknown, maxLen: unknown)` | `sync_value` | `server/admin-routes.js:handleGovernanceApiRequest>anon@L6904C53` | — | [server/admin-routes.js:L6938](../../../../server/admin-routes.js#L6938) |
| `handleGovernanceApiRequest>anon@L7233C49` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L7233](../../../../server/admin-routes.js#L7233) |
| `handleGovernanceApiRequest>anon@L7285C57` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L7285](../../../../server/admin-routes.js#L7285) |
| `handleGovernanceApiRequest>anon@L7344C53` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L7344](../../../../server/admin-routes.js#L7344) |
| `handleGovernanceApiRequest>anon@L7453C49` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L7453](../../../../server/admin-routes.js#L7453) |
| `handleGovernanceApiRequest>anon@L7453C49>anon@L7596C32` | `anonymous_function` | No | `(g: unknown)` | `sync_value` | — | — | [server/admin-routes.js:L7596](../../../../server/admin-routes.js#L7596) |
| `handleGovernanceApiRequest>anon@L7617C49` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L7617](../../../../server/admin-routes.js#L7617) |
| `handleGovernanceApiRequest>anon@L7739C49` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L7739](../../../../server/admin-routes.js#L7739) |
| `handleGovernanceApiRequest>anon@L7847C49` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L7847](../../../../server/admin-routes.js#L7847) |
| `handleGovernanceApiRequest>anon@L7908C57` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L7908](../../../../server/admin-routes.js#L7908) |
| `handleGovernanceApiRequest>anon@L7949C39` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L7949](../../../../server/admin-routes.js#L7949) |
| `handleGovernanceApiRequest>anon@L7972C57` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L7972](../../../../server/admin-routes.js#L7972) |
| `handleGovernanceApiRequest>anon@L7983C37` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L7983](../../../../server/admin-routes.js#L7983) |
| `handleGovernanceApiRequest>anon@L8037C51` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [server/admin-routes.js:L8037](../../../../server/admin-routes.js#L8037) |
| `handleGovernanceApiRequest>anon@L8037C51>anon@L8089C47` | `anonymous_function` | No | `(r: unknown)` | `sync_value` | — | — | [server/admin-routes.js:L8089](../../../../server/admin-routes.js#L8089) |
| `handleGovernanceApiRequest>appendRawCookie` | `arrow_function` | No | `(cookieStr: unknown)` | `void_or_implicit` | `server/admin-routes.js:handleGovernanceApiRequest` | — | [server/admin-routes.js:L8233](../../../../server/admin-routes.js#L8233) |

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
