# Symbol Catalog — Domain API Handlers (`api/`)

> [!NOTE]
> **Machine-Generated Reference Inventory** — Do not hand-edit. Regenerate via `npm run registry:docs` (`node tools/code-registry/cli.mjs generate-docs`).
> - **Repository**: `https://github.com/yamanalmasaleha-png/trukly-`
> - **Provenance Mode**: `committed_source_digest` *(branch/detached-HEAD invariant; commit-bound runs use `npm run registry:scan -- --include-timestamp`)*
> - **Generator**: `biteshark-code-registry@2.0.0` (`biteshark.code-registry.v2`)
> - **Source Analysis Digest**: `f351b1839a541309ff92af2238561630479a3c834950d41044168088bcc5e313`
> - **Analysis Scope & Limits**: Static AST, HTML, CSS, and SQL analysis without executing application modules. Relationships distinguish confirmed_static, documented_wrapper, inferred_candidate, and dynamic_unresolved; static analysis does not prove runtime behavioral correctness.

- [← Back to Symbol & Module Index](../SYMBOL-INDEX.md)
- **Relationship Labels**: `confirmed` = resolved via lexical scope, explicit ESM/CJS import/alias, unique `window.*` namespace, or page-level script binding. `candidate` = ambiguous multi-script or unverified member call (never conflated as confirmed).

## [api/bookings/create.js](../../../../api/bookings/create.js) (`module`)
- **Imports / Dependencies**: `../../lib/authz.js`, `../../lib/catalog.js`, `../../lib/dates.js`, `../../lib/db-tx.js`, `@biteshark/runtime-adapter`, `node:crypto`
- **Exports**: `access`, `methods`, `formatBookingResponse`, `default`
- **Top-Level Constants (3)**: `access` *(exported)*, `methods` *(exported)*, `IDEMPOTENCY_KEY_RE`

| Symbol | Kind | Exported | Parameters (Observed Basis) | Returns / Throws | Confirmed Callers (Inferred in italics) | Contracts | Lines |
|---|---|---|---|---|---|---|---|
| `parseStrictGuestCount` | `function` | No | `(raw: unknown)` | `sync_value` | `api/bookings/create.js:default` | — | [api/bookings/create.js:L18](../../../../api/bookings/create.js#L18) |
| `extractIdempotencyKey` | `function` | No | `(req: unknown, body: unknown)` | `sync_value` | `api/bookings/create.js:default` | — | [api/bookings/create.js:L29](../../../../api/bookings/create.js#L29) |
| `computeBookingHash` | `function` | No | `(payload: unknown)` | `sync_value` | `api/bookings/create.js:default` | — | [api/bookings/create.js:L47](../../../../api/bookings/create.js#L47) |
| `formatBookingResponse` | `function` | Yes | `(row: unknown, replay: boolean)` | `sync_value` | `api/bookings/create.js:default>anon@L147C46` | — | [api/bookings/create.js:L54](../../../../api/bookings/create.js#L54) |
| `default` | `function` | Yes | `(req: unknown, res: unknown)` | `async -> promise` | — | — | [api/bookings/create.js:L73](../../../../api/bookings/create.js#L73) |
| `default>anon@L147C46` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise (throws: Error, thrown_value)` | — | — | [api/bookings/create.js:L147](../../../../api/bookings/create.js#L147) |

## [api/bookings/list.js](../../../../api/bookings/list.js) (`module`)
- **Imports / Dependencies**: `../../lib/authz.js`, `../../lib/dates.js`, `@biteshark/runtime-adapter`
- **Exports**: `access`, `methods`, `default`
- **Top-Level Constants (2)**: `access` *(exported)*, `methods` *(exported)*

| Symbol | Kind | Exported | Parameters (Observed Basis) | Returns / Throws | Confirmed Callers (Inferred in italics) | Contracts | Lines |
|---|---|---|---|---|---|---|---|
| `default` | `function` | Yes | `(req: unknown, res: unknown)` | `async -> promise` | — | — | [api/bookings/list.js:L8](../../../../api/bookings/list.js#L8) |

## [api/catalog/cities.js](../../../../api/catalog/cities.js) (`module`)
- **Exports**: `access`, `methods`, `default`
- **Top-Level Constants (2)**: `access` *(exported)*, `methods` *(exported)*

| Symbol | Kind | Exported | Parameters (Observed Basis) | Returns / Throws | Confirmed Callers (Inferred in italics) | Contracts | Lines |
|---|---|---|---|---|---|---|---|
| `default` | `function` | Yes | `(req: unknown, res: unknown)` | `async -> promise` | — | — | [api/catalog/cities.js:L1](../../../../api/catalog/cities.js#L1) |

## [api/catalog/cuisines.js](../../../../api/catalog/cuisines.js) (`module`)
- **Exports**: `access`, `methods`, `default`
- **Top-Level Constants (2)**: `access` *(exported)*, `methods` *(exported)*

| Symbol | Kind | Exported | Parameters (Observed Basis) | Returns / Throws | Confirmed Callers (Inferred in italics) | Contracts | Lines |
|---|---|---|---|---|---|---|---|
| `default` | `function` | Yes | `(req: unknown, res: unknown)` | `async -> promise` | — | — | [api/catalog/cuisines.js:L4](../../../../api/catalog/cuisines.js#L4) |

## [api/catalog/featured.js](../../../../api/catalog/featured.js) (`module`)
- **Imports / Dependencies**: `../../lib/discovery.js`, `@biteshark/runtime-adapter`
- **Exports**: `access`, `methods`, `default`
- **Top-Level Constants (2)**: `access` *(exported)*, `methods` *(exported)*

| Symbol | Kind | Exported | Parameters (Observed Basis) | Returns / Throws | Confirmed Callers (Inferred in italics) | Contracts | Lines |
|---|---|---|---|---|---|---|---|
| `default` | `function` | Yes | `(req: unknown, res: unknown)` | `async -> promise` | — | — | [api/catalog/featured.js:L7](../../../../api/catalog/featured.js#L7) |
| `default>anon@L26C29` | `anonymous_function` | No | `(item: unknown)` | `sync_value` | — | — | [api/catalog/featured.js:L26](../../../../api/catalog/featured.js#L26) |

## [api/community/list.js](../../../../api/community/list.js) (`module`)
- **Imports / Dependencies**: `@biteshark/runtime-adapter`
- **Exports**: `access`, `methods`, `default`
- **Top-Level Constants (2)**: `access` *(exported)*, `methods` *(exported)*

| Symbol | Kind | Exported | Parameters (Observed Basis) | Returns / Throws | Confirmed Callers (Inferred in italics) | Contracts | Lines |
|---|---|---|---|---|---|---|---|
| `default` | `function` | Yes | `(req: unknown, res: unknown)` | `async -> promise` | — | — | [api/community/list.js:L6](../../../../api/community/list.js#L6) |

## [api/community/mine.js](../../../../api/community/mine.js) (`module`)
- **Imports / Dependencies**: `../../lib/authz.js`, `../../lib/db-tx.js`, `@biteshark/runtime-adapter`
- **Exports**: `access`, `methods`, `default`
- **Top-Level Constants (2)**: `access` *(exported)*, `methods` *(exported)*

| Symbol | Kind | Exported | Parameters (Observed Basis) | Returns / Throws | Confirmed Callers (Inferred in italics) | Contracts | Lines |
|---|---|---|---|---|---|---|---|
| `default` | `function` | Yes | `(req: unknown, res: unknown)` | `async -> promise` | — | — | [api/community/mine.js:L8](../../../../api/community/mine.js#L8) |
| `default>anon@L16C43` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [api/community/mine.js:L16](../../../../api/community/mine.js#L16) |

## [api/community/moderate.js](../../../../api/community/moderate.js) (`module`)
- **Imports / Dependencies**: `../../lib/authz.js`, `../../lib/db-tx.js`, `@biteshark/runtime-adapter`
- **Exports**: `access`, `methods`, `default`
- **Top-Level Constants (2)**: `access` *(exported)*, `methods` *(exported)*

| Symbol | Kind | Exported | Parameters (Observed Basis) | Returns / Throws | Confirmed Callers (Inferred in italics) | Contracts | Lines |
|---|---|---|---|---|---|---|---|
| `default` | `function` | Yes | `(req: unknown, res: unknown)` | `async -> promise` | — | — | [api/community/moderate.js:L15](../../../../api/community/moderate.js#L15) |
| `default>anon@L27C44` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [api/community/moderate.js:L27](../../../../api/community/moderate.js#L27) |
| `default>anon@L67C46` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise (throws: thrown_value)` | — | — | [api/community/moderate.js:L67](../../../../api/community/moderate.js#L67) |

## [api/community/post.js](../../../../api/community/post.js) (`module`)
- **Imports / Dependencies**: `../../lib/authz.js`, `../../lib/db-tx.js`, `@biteshark/runtime-adapter`
- **Exports**: `access`, `methods`, `default`
- **Top-Level Constants (3)**: `access` *(exported)*, `methods` *(exported)*, `ALLOWED_KINDS`

| Symbol | Kind | Exported | Parameters (Observed Basis) | Returns / Throws | Confirmed Callers (Inferred in italics) | Contracts | Lines |
|---|---|---|---|---|---|---|---|
| `default` | `function` | Yes | `(req: unknown, res: unknown)` | `async -> promise` | — | — | [api/community/post.js:L10](../../../../api/community/post.js#L10) |
| `default>anon@L72C46` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [api/community/post.js:L72](../../../../api/community/post.js#L72) |

## [api/favorites/list.js](../../../../api/favorites/list.js) (`module`)
- **Imports / Dependencies**: `../../lib/authz.js`, `@biteshark/runtime-adapter`
- **Exports**: `access`, `methods`, `default`
- **Top-Level Constants (2)**: `access` *(exported)*, `methods` *(exported)*

| Symbol | Kind | Exported | Parameters (Observed Basis) | Returns / Throws | Confirmed Callers (Inferred in italics) | Contracts | Lines |
|---|---|---|---|---|---|---|---|
| `default` | `function` | Yes | `(req: unknown, res: unknown)` | `async -> promise` | — | — | [api/favorites/list.js:L7](../../../../api/favorites/list.js#L7) |

## [api/favorites/toggle.js](../../../../api/favorites/toggle.js) (`module`)
- **Imports / Dependencies**: `../../lib/authz.js`, `../../lib/db-tx.js`, `@biteshark/runtime-adapter`
- **Exports**: `access`, `methods`, `default`
- **Top-Level Constants (2)**: `access` *(exported)*, `methods` *(exported)*

| Symbol | Kind | Exported | Parameters (Observed Basis) | Returns / Throws | Confirmed Callers (Inferred in italics) | Contracts | Lines |
|---|---|---|---|---|---|---|---|
| `default` | `function` | Yes | `(req: unknown, res: unknown)` | `async -> promise` | — | — | [api/favorites/toggle.js:L8](../../../../api/favorites/toggle.js#L8) |
| `default>anon@L22C46` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [api/favorites/toggle.js:L22](../../../../api/favorites/toggle.js#L22) |

## [api/notifications/settings.js](../../../../api/notifications/settings.js) (`module`)
- **Imports / Dependencies**: `../../lib/authz.js`, `../../lib/db-tx.js`, `@biteshark/runtime-adapter`
- **Exports**: `access`, `methods`, `default`
- **Top-Level Constants (2)**: `access` *(exported)*, `methods` *(exported)*

| Symbol | Kind | Exported | Parameters (Observed Basis) | Returns / Throws | Confirmed Callers (Inferred in italics) | Contracts | Lines |
|---|---|---|---|---|---|---|---|
| `default` | `function` | Yes | `(req: unknown, res: unknown)` | `async -> promise` | — | — | [api/notifications/settings.js:L8](../../../../api/notifications/settings.js#L8) |
| `default>anon@L20C44` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [api/notifications/settings.js:L20](../../../../api/notifications/settings.js#L20) |

## [api/owner/bookings.js](../../../../api/owner/bookings.js) (`module`)
- **Imports / Dependencies**: `../../lib/authz.js`, `../../lib/dates.js`, `@biteshark/runtime-adapter`
- **Exports**: `access`, `methods`, `default`
- **Top-Level Constants (3)**: `access` *(exported)*, `methods` *(exported)*, `ALLOWED_STATUSES`

| Symbol | Kind | Exported | Parameters (Observed Basis) | Returns / Throws | Confirmed Callers (Inferred in italics) | Contracts | Lines |
|---|---|---|---|---|---|---|---|
| `default` | `function` | Yes | `(req: unknown, res: unknown)` | `async -> promise` | — | — | [api/owner/bookings.js:L10](../../../../api/owner/bookings.js#L10) |

## [api/owner/location.js](../../../../api/owner/location.js) (`module`)
- **Imports / Dependencies**: `../../lib/authz.js`, `../../lib/dates.js`, `../../lib/db-tx.js`, `../../lib/discovery.js`, `@biteshark/runtime-adapter`
- **Exports**: `access`, `methods`, `default`
- **Top-Level Constants (5)**: `access` *(exported)*, `methods` *(exported)*, `DEFAULT_LOCATION_TTL_MINUTES`, `MIN_LOCATION_TTL_MINUTES`, `MAX_LOCATION_TTL_MINUTES`

| Symbol | Kind | Exported | Parameters (Observed Basis) | Returns / Throws | Confirmed Callers (Inferred in italics) | Contracts | Lines |
|---|---|---|---|---|---|---|---|
| `resolveLocationExpiry` | `function` | No | `(body: unknown, now: Date)` | `sync_value` | `api/owner/location.js:default` | — | [api/owner/location.js:L21](../../../../api/owner/location.js#L21) |
| `default` | `function` | Yes | `(req: unknown, res: unknown)` | `async -> promise` | — | — | [api/owner/location.js:L57](../../../../api/owner/location.js#L57) |
| `default>anon@L110C48` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [api/owner/location.js:L110](../../../../api/owner/location.js#L110) |

## [api/owner/profile.js](../../../../api/owner/profile.js) (`module`)
- **Imports / Dependencies**: `../../lib/authz.js`, `../../lib/db-tx.js`, `../../lib/discovery.js`, `@biteshark/runtime-adapter`
- **Exports**: `access`, `methods`, `default`
- **Top-Level Constants (2)**: `access` *(exported)*, `methods` *(exported)*

| Symbol | Kind | Exported | Parameters (Observed Basis) | Returns / Throws | Confirmed Callers (Inferred in italics) | Contracts | Lines |
|---|---|---|---|---|---|---|---|
| `default` | `function` | Yes | `(req: unknown, res: unknown)` | `async -> promise` | — | — | [api/owner/profile.js:L16](../../../../api/owner/profile.js#L16) |
| `default>anon@L58C48` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [api/owner/profile.js:L58](../../../../api/owner/profile.js#L58) |

## [api/owner/requests.js](../../../../api/owner/requests.js) (`module`)
- **Imports / Dependencies**: `../../lib/authz.js`, `../../lib/dates.js`, `../../lib/db-tx.js`, `@biteshark/runtime-adapter`
- **Exports**: `access`, `methods`, `default`
- **Top-Level Constants (2)**: `access` *(exported)*, `methods` *(exported)*

| Symbol | Kind | Exported | Parameters (Observed Basis) | Returns / Throws | Confirmed Callers (Inferred in italics) | Contracts | Lines |
|---|---|---|---|---|---|---|---|
| `default` | `function` | Yes | `(req: unknown, res: unknown)` | `async -> promise` | — | — | [api/owner/requests.js:L17](../../../../api/owner/requests.js#L17) |
| `default>anon@L42C48` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [api/owner/requests.js:L42](../../../../api/owner/requests.js#L42) |

## [api/owner/schedule.js](../../../../api/owner/schedule.js) (`module`)
- **Imports / Dependencies**: `../../lib/authz.js`, `../../lib/dates.js`, `../../lib/db-tx.js`, `../../lib/discovery.js`, `@biteshark/runtime-adapter`
- **Exports**: `access`, `methods`, `default`
- **Top-Level Constants (2)**: `access` *(exported)*, `methods` *(exported)*

| Symbol | Kind | Exported | Parameters (Observed Basis) | Returns / Throws | Confirmed Callers (Inferred in italics) | Contracts | Lines |
|---|---|---|---|---|---|---|---|
| `default` | `function` | Yes | `(req: unknown, res: unknown)` | `async -> promise` | — | — | [api/owner/schedule.js:L18](../../../../api/owner/schedule.js#L18) |
| `default>anon@L64C48` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [api/owner/schedule.js:L64](../../../../api/owner/schedule.js#L64) |

## [api/owner/stats.js](../../../../api/owner/stats.js) (`module`)
- **Imports / Dependencies**: `../../lib/authz.js`, `@biteshark/runtime-adapter`
- **Exports**: `access`, `methods`, `default`
- **Top-Level Constants (2)**: `access` *(exported)*, `methods` *(exported)*

| Symbol | Kind | Exported | Parameters (Observed Basis) | Returns / Throws | Confirmed Callers (Inferred in italics) | Contracts | Lines |
|---|---|---|---|---|---|---|---|
| `default` | `function` | Yes | `(req: unknown, res: unknown)` | `async -> promise` | — | — | [api/owner/stats.js:L7](../../../../api/owner/stats.js#L7) |

## [api/pager/staff.js](../../../../api/pager/staff.js) (`module`)
- **Imports / Dependencies**: `../../lib/authz.js`, `../../lib/db-tx.js`, `@biteshark/runtime-adapter`
- **Exports**: `access`, `methods`, `default`
- **Top-Level Constants (2)**: `access` *(exported)*, `methods` *(exported)*

| Symbol | Kind | Exported | Parameters (Observed Basis) | Returns / Throws | Confirmed Callers (Inferred in italics) | Contracts | Lines |
|---|---|---|---|---|---|---|---|
| `default` | `function` | Yes | `(req: unknown, res: unknown)` | `async -> promise` | — | — | [api/pager/staff.js:L19](../../../../api/pager/staff.js#L19) |
| `default>anon@L71C46` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise (throws: Error, thrown_value)` | — | — | [api/pager/staff.js:L71](../../../../api/pager/staff.js#L71) |

## [api/pager/status.js](../../../../api/pager/status.js) (`module`)
- **Imports / Dependencies**: `../../lib/authz.js`, `../../lib/feature-controls.js`, `../../lib/pager-notifications.js`, `@biteshark/runtime-adapter`
- **Exports**: `access`, `methods`, `default`
- **Top-Level Constants (2)**: `access` *(exported)*, `methods` *(exported)*

| Symbol | Kind | Exported | Parameters (Observed Basis) | Returns / Throws | Confirmed Callers (Inferred in italics) | Contracts | Lines |
|---|---|---|---|---|---|---|---|
| `default` | `function` | Yes | `(req: unknown, res: unknown)` | `async -> promise` | — | — | [api/pager/status.js:L14](../../../../api/pager/status.js#L14) |

## [api/pager/subscriptions.js](../../../../api/pager/subscriptions.js) (`module`)
- **Imports / Dependencies**: `../../lib/authz.js`, `../../lib/db-tx.js`, `../../lib/feature-controls.js`, `../../lib/pager-notifications.js`, `@biteshark/runtime-adapter`, `node:crypto`
- **Exports**: `access`, `methods`, `default`
- **Top-Level Constants (2)**: `access` *(exported)*, `methods` *(exported)*

| Symbol | Kind | Exported | Parameters (Observed Basis) | Returns / Throws | Confirmed Callers (Inferred in italics) | Contracts | Lines |
|---|---|---|---|---|---|---|---|
| `timingSafeHexEqual` | `function` | No | `(hexA: unknown, hexB: unknown)` | `sync_value` | `api/pager/subscriptions.js:default>anon@L120C48`, `api/pager/subscriptions.js:default>anon@L58C49` | — | [api/pager/subscriptions.js:L26](../../../../api/pager/subscriptions.js#L26) |
| `default` | `function` | Yes | `(req: unknown, res: unknown)` | `async -> promise` | — | — | [api/pager/subscriptions.js:L33](../../../../api/pager/subscriptions.js#L33) |
| `default>anon@L58C49` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [api/pager/subscriptions.js:L58](../../../../api/pager/subscriptions.js#L58) |
| `default>anon@L120C48` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [api/pager/subscriptions.js:L120](../../../../api/pager/subscriptions.js#L120) |
| `default>anon@L266C46` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise (throws: Error)` | — | — | [api/pager/subscriptions.js:L266](../../../../api/pager/subscriptions.js#L266) |

## [api/pager/telemetry.js](../../../../api/pager/telemetry.js) (`module`)
- **Imports / Dependencies**: `../../lib/authz.js`, `../../lib/db-tx.js`, `../../lib/env-compat.js`, `../../lib/pager-notifications.js`, `@biteshark/runtime-adapter`
- **Exports**: `access`, `methods`, `default`
- **Top-Level Constants (2)**: `access` *(exported)*, `methods` *(exported)*

| Symbol | Kind | Exported | Parameters (Observed Basis) | Returns / Throws | Confirmed Callers (Inferred in italics) | Contracts | Lines |
|---|---|---|---|---|---|---|---|
| `default` | `function` | Yes | `(req: unknown, res: unknown)` | `async -> promise` | — | — | [api/pager/telemetry.js:L17](../../../../api/pager/telemetry.js#L17) |
| `default>anon@L33C44` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [api/pager/telemetry.js:L33](../../../../api/pager/telemetry.js#L33) |

## [api/pager/update.js](../../../../api/pager/update.js) (`module`)
- **Imports / Dependencies**: `../../lib/authz.js`, `../../lib/db-tx.js`, `../../lib/pager-notifications.js`, `@biteshark/runtime-adapter`
- **Exports**: `access`, `methods`, `default`
- **Top-Level Constants (3)**: `access` *(exported)*, `methods` *(exported)*, `ALLOWED_PAGER_STATUSES`

| Symbol | Kind | Exported | Parameters (Observed Basis) | Returns / Throws | Confirmed Callers (Inferred in italics) | Contracts | Lines |
|---|---|---|---|---|---|---|---|
| `default` | `function` | Yes | `(req: unknown, res: unknown)` | `async -> promise` | — | — | [api/pager/update.js:L19](../../../../api/pager/update.js#L19) |
| `default>anon@L45C46` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise (throws: Error)` | — | — | [api/pager/update.js:L45](../../../../api/pager/update.js#L45) |

## [api/pager/worker.js](../../../../api/pager/worker.js) (`module`)
- **Imports / Dependencies**: `../../lib/authz.js`, `../../lib/customer-exploration.js`, `../../lib/diagnostics.js`, `../../lib/env-compat.js`, `../../lib/pager-notifications.js`, `../../lib/standalone-auth.js`, `@biteshark/runtime-adapter`, `node:crypto`
- **Exports**: `access`, `methods`, `default`
- **Top-Level Constants (2)**: `access` *(exported)*, `methods` *(exported)*

| Symbol | Kind | Exported | Parameters (Observed Basis) | Returns / Throws | Confirmed Callers (Inferred in italics) | Contracts | Lines |
|---|---|---|---|---|---|---|---|
| `extractWorkerToken` | `function` | No | `(req: unknown)` | `sync_value` | `api/pager/worker.js:default` | — | [api/pager/worker.js:L23](../../../../api/pager/worker.js#L23) |
| `timingSafeSecretEqual` | `function` | No | `(expected: unknown, supplied: unknown)` | `sync_value` | `api/pager/worker.js:default` | — | [api/pager/worker.js:L32](../../../../api/pager/worker.js#L32) |
| `default` | `function` | Yes | `(req: unknown, res: unknown)` | `async -> promise (throws: thrown_value)` | — | — | [api/pager/worker.js:L38](../../../../api/pager/worker.js#L38) |
| `default>anon@L108C90` | `anonymous_function` | No | `(err: unknown)` | `async -> promise` | — | — | [api/pager/worker.js:L108](../../../../api/pager/worker.js#L108) |

## [api/schedule/today.js](../../../../api/schedule/today.js) (`module`)
- **Imports / Dependencies**: `../../lib/dates.js`, `../../lib/discovery.js`, `@biteshark/runtime-adapter`, `node:crypto`
- **Exports**: `access`, `methods`, `default`
- **Top-Level Constants (2)**: `access` *(exported)*, `methods` *(exported)*

| Symbol | Kind | Exported | Parameters (Observed Basis) | Returns / Throws | Confirmed Callers (Inferred in italics) | Contracts | Lines |
|---|---|---|---|---|---|---|---|
| `default` | `function` | Yes | `(req: unknown, res: unknown)` | `async -> promise (throws: thrown_value)` | — | — | [api/schedule/today.js:L9](../../../../api/schedule/today.js#L9) |
| `default>anon@L67C35` | `anonymous_function` | No | `(r: unknown)` | `sync_value` | — | — | [api/schedule/today.js:L67](../../../../api/schedule/today.js#L67) |

## [api/trucks.js](../../../../api/trucks.js) (`module`)
- **Imports / Dependencies**: `../lib/discovery.js`, `@biteshark/runtime-adapter`
- **Exports**: `access`, `methods`, `default`
- **Top-Level Constants (2)**: `access` *(exported)*, `methods` *(exported)*

| Symbol | Kind | Exported | Parameters (Observed Basis) | Returns / Throws | Confirmed Callers (Inferred in italics) | Contracts | Lines |
|---|---|---|---|---|---|---|---|
| `default` | `function` | Yes | `(req: unknown, res: unknown)` | `async -> promise` | — | — | [api/trucks.js:L13](../../../../api/trucks.js#L13) |

## [api/trucks/[id].js](../../../../api/trucks/[id].js) (`module`)
- **Imports / Dependencies**: `../../lib/discovery.js`, `@biteshark/runtime-adapter`
- **Exports**: `access`, `methods`, `default`
- **Top-Level Constants (2)**: `access` *(exported)*, `methods` *(exported)*

| Symbol | Kind | Exported | Parameters (Observed Basis) | Returns / Throws | Confirmed Callers (Inferred in italics) | Contracts | Lines |
|---|---|---|---|---|---|---|---|
| `default` | `function` | Yes | `(req: unknown, res: unknown)` | `async -> promise` | — | — | [api/trucks/[id].js:L11](../../../../api/trucks/[id].js#L11) |

## [api/trucks/availability.js](../../../../api/trucks/availability.js) (`module`)
- **Imports / Dependencies**: `../../lib/authz.js`, `../../lib/dates.js`, `../../lib/discovery.js`, `@biteshark/runtime-adapter`
- **Exports**: `access`, `methods`, `default`
- **Top-Level Constants (2)**: `access` *(exported)*, `methods` *(exported)*

| Symbol | Kind | Exported | Parameters (Observed Basis) | Returns / Throws | Confirmed Callers (Inferred in italics) | Contracts | Lines |
|---|---|---|---|---|---|---|---|
| `default` | `function` | Yes | `(req: unknown, res: unknown)` | `async -> promise (throws: thrown_value)` | — | — | [api/trucks/availability.js:L9](../../../../api/trucks/availability.js#L9) |

## [api/trucks/nearby.js](../../../../api/trucks/nearby.js) (`module`)
- **Imports / Dependencies**: `../../lib/authz.js`, `../../lib/discovery.js`
- **Exports**: `access`, `methods`, `default`
- **Top-Level Constants (3)**: `access` *(exported)*, `methods` *(exported)*, `hubs`

| Symbol | Kind | Exported | Parameters (Observed Basis) | Returns / Throws | Confirmed Callers (Inferred in italics) | Contracts | Lines |
|---|---|---|---|---|---|---|---|
| `miles` | `function` | No | `(a: unknown, b: unknown, c: unknown, d: unknown)` | `sync_value` | `api/trucks/nearby.js:default>anon@L35C11` | — | [api/trucks/nearby.js:L15](../../../../api/trucks/nearby.js#L15) |
| `default` | `function` | Yes | `(req: unknown, res: unknown)` | `async -> promise` | — | — | [api/trucks/nearby.js:L23](../../../../api/trucks/nearby.js#L23) |

## [api/trucks/search.js](../../../../api/trucks/search.js) (`module`)
- **Imports / Dependencies**: `../../lib/discovery.js`, `@biteshark/runtime-adapter`
- **Exports**: `access`, `methods`, `default`
- **Top-Level Constants (2)**: `access` *(exported)*, `methods` *(exported)*

| Symbol | Kind | Exported | Parameters (Observed Basis) | Returns / Throws | Confirmed Callers (Inferred in italics) | Contracts | Lines |
|---|---|---|---|---|---|---|---|
| `default` | `function` | Yes | `(req: unknown, res: unknown)` | `async -> promise` | — | — | [api/trucks/search.js:L12](../../../../api/trucks/search.js#L12) |
| `default>anon@L33C20` | `anonymous_function` | No | `(item: unknown)` | `sync_value` | — | — | [api/trucks/search.js:L33](../../../../api/trucks/search.js#L33) |
| `default>anon@L71C43` | `anonymous_function` | No | `(item: unknown)` | `sync_value` | — | — | [api/trucks/search.js:L71](../../../../api/trucks/search.js#L71) |
