# Symbol Catalog — Operator Scripts & Code Registry Tooling (`scripts/`, `tools/`)

> [!NOTE]
> **Machine-Generated Reference Inventory** — Do not hand-edit. Regenerate via `npm run registry:docs` (`node tools/code-registry/cli.mjs generate-docs`).
> - **Repository**: `https://github.com/yamanalmasaleha-png/trukly-`
> - **Provenance Mode**: `committed_source_digest` *(branch/detached-HEAD invariant; commit-bound runs use `npm run registry:scan -- --include-timestamp`)*
> - **Generator**: `biteshark-code-registry@2.0.0` (`biteshark.code-registry.v2`)
> - **Source Analysis Digest**: `972893941bb361039b39c87eca1c660c24adc38bc5397a70775abfd4504f9c9d`
> - **Analysis Scope & Limits**: Static AST, HTML, CSS, and SQL analysis without executing application modules. Relationships distinguish confirmed_static, documented_wrapper, inferred_candidate, and dynamic_unresolved; static analysis does not prove runtime behavioral correctness.

- [← Back to Symbol & Module Index](../SYMBOL-INDEX.md)
- **Relationship Labels**: `confirmed` = resolved via lexical scope, explicit ESM/CJS import/alias, unique `window.*` namespace, or page-level script binding. `candidate` = ambiguous multi-script or unverified member call (never conflated as confirmed).

## [scripts/bootstrap-top-admin.cjs](../../../../scripts/bootstrap-top-admin.cjs) (`script`)
- **Imports / Dependencies**: `<dynamic_require>`, `node:crypto`, `node:fs`, `node:path`, `pg`
- **Top-Level Constants (3)**: `fs`, `path`, `crypto`

| Symbol | Kind | Exported | Parameters (Observed Basis) | Returns / Throws | Confirmed Callers (Inferred in italics) | Contracts | Lines |
|---|---|---|---|---|---|---|---|
| `parseEnvFile` | `function` | No | `(filePath: unknown)` | `sync_value` | `scripts/bootstrap-top-admin.cjs:main` | — | [scripts/bootstrap-top-admin.cjs:L16](../../../../scripts/bootstrap-top-admin.cjs#L16) |
| `readCliEnvCompat` | `function` | No | `(suffix: unknown, fileEnv: object)` | `sync_value (throws: Error)` | `scripts/bootstrap-top-admin.cjs:requirePg` | — | [scripts/bootstrap-top-admin.cjs:L35](../../../../scripts/bootstrap-top-admin.cjs#L35) |
| `requirePg` | `function` | No | `(fileEnv: unknown)` | `sync_value (throws: Error)` | `scripts/bootstrap-top-admin.cjs:main` | — | [scripts/bootstrap-top-admin.cjs:L44](../../../../scripts/bootstrap-top-admin.cjs#L44) |
| `normalizeEmailStrict` | `function` | No | `(raw: unknown)` | `sync_value` | `scripts/bootstrap-top-admin.cjs:main` | — | [scripts/bootstrap-top-admin.cjs:L56](../../../../scripts/bootstrap-top-admin.cjs#L56) |
| `parseArgs` | `function` | No | `(argv: unknown)` | `sync_value (throws: Error)` | `scripts/bootstrap-top-admin.cjs:main` | — | [scripts/bootstrap-top-admin.cjs:L64](../../../../scripts/bootstrap-top-admin.cjs#L64) |
| `main` | `function` | No | `()` | `async -> promise (throws: Error, thrown_value)` | `scripts/bootstrap-top-admin.cjs:<top_level>` | — | [scripts/bootstrap-top-admin.cjs:L91](../../../../scripts/bootstrap-top-admin.cjs#L91) |

## [scripts/build-linux-release-tarball.cjs](../../../../scripts/build-linux-release-tarball.cjs) (`script`)
- **Imports / Dependencies**: `node:child_process`, `node:crypto`, `node:fs`, `node:os`, `node:path`
- **Top-Level Constants (16)**: `fs`, `os`, `path`, `crypto`, `ROOT`, `opts`, `fullSha`, `shortSha`, `baseName`, `tarballPath`, `sha256Path`, `archivedEntries`, `forbiddenMatches`, `requiredEntry`, `bytes`, `sha256`

| Symbol | Kind | Exported | Parameters (Observed Basis) | Returns / Throws | Confirmed Callers (Inferred in italics) | Contracts | Lines |
|---|---|---|---|---|---|---|---|
| `parseArgs` | `function` | No | `(argv: unknown)` | `sync_value` | `scripts/build-linux-release-tarball.cjs:<top_level>` | [CTR-RELEASE-MIGRATION-DEPLOY](../CONTRACTS-CATALOG.md) | [scripts/build-linux-release-tarball.cjs:L17](../../../../scripts/build-linux-release-tarball.cjs#L17) |
| `top>anon@L59C2` | `anonymous_function` | No | `(entry: unknown)` | `sync_value` | — | — | [scripts/build-linux-release-tarball.cjs:L59](../../../../scripts/build-linux-release-tarball.cjs#L59) |

## [scripts/dev-server.cjs](../../../../scripts/dev-server.cjs) (`script`)
- **Imports / Dependencies**: `./seed-sql-reader.cjs`, `<dynamic_expr>`, `<dynamic_require>`, `node:async_hooks`, `node:crypto`, `node:fs`, `node:http`, `node:module`, `node:path`, `node:url`, `pg`
- **Explicit Window / Wrapper Globals**: `__BITESHARK_RUNTIME__` (explicit_window_property @ L659)
- **Top-Level Constants (16)**: `http`, `fs`, `path`, `crypto`, `ROOT`, `PUBLIC_DIR`, `API_DIR`, `PORT`, `MIME`, `ROLE_USERS`, `requestAls`, `mockDb`, `mockAuth`, `extraNodeModules`, `loaderCode`, `routeCache`

| Symbol | Kind | Exported | Parameters (Observed Basis) | Returns / Throws | Confirmed Callers (Inferred in italics) | Contracts | Lines |
|---|---|---|---|---|---|---|---|
| `createInitialStore` | `function` | No | `()` | `sync_value` | `scripts/dev-server.cjs:<iife_top>`, `scripts/dev-server.cjs:top>anon@L710C35` | — | [scripts/dev-server.cjs:L49](../../../../scripts/dev-server.cjs#L49) |
| `createInitialStore>anon@L52C17` | `anonymous_function` | No | `(v: unknown)` | `sync_value` | — | — | [scripts/dev-server.cjs:L52](../../../../scripts/dev-server.cjs#L52) |
| `parseCookies` | `function` | No | `(cookieHeader: unknown)` | `sync_value` | `scripts/dev-server.cjs:getRequestRole` | — | [scripts/dev-server.cjs:L85](../../../../scripts/dev-server.cjs#L85) |
| `getRequestRole` | `function` | No | `(req: unknown)` | `sync_value` | `scripts/dev-server.cjs:top>anon@L710C35` | — | [scripts/dev-server.cjs:L97](../../../../scripts/dev-server.cjs#L97) |
| `vendorDisplayName` | `function` | No | `(vendorId: unknown)` | `sync_value` | `scripts/dev-server.cjs:mockDb.query`, `scripts/dev-server.cjs:mockDb.query>anon@L148C13`, `scripts/dev-server.cjs:mockDb.query>anon@L474C13` | — | [scripts/dev-server.cjs:L106](../../../../scripts/dev-server.cjs#L106) |
| `mockDb.transaction` | `object_method` | No | `(fn: unknown)` | `async -> promise` | — | — | [scripts/dev-server.cjs:L113](../../../../scripts/dev-server.cjs#L113) |
| `mockDb.query` | `object_method` | No | `(sql: unknown, params: array)` | `async -> promise` | — | — | [scripts/dev-server.cjs:L116](../../../../scripts/dev-server.cjs#L116) |
| `mockDb.query>anon@L148C13` | `anonymous_function` | No | `(m: unknown)` | `sync_value` | — | — | [scripts/dev-server.cjs:L148](../../../../scripts/dev-server.cjs#L148) |
| `mockDb.query>anon@L353C13` | `anonymous_function` | No | `(v: unknown)` | `sync_value` | — | — | [scripts/dev-server.cjs:L353](../../../../scripts/dev-server.cjs#L353) |
| `mockDb.query>anon@L474C13` | `anonymous_function` | No | `(x: unknown)` | `sync_value` | — | — | [scripts/dev-server.cjs:L474](../../../../scripts/dev-server.cjs#L474) |
| `mockAuth.getUser` | `object_method` | No | `()` | `async -> promise` | — | — | [scripts/dev-server.cjs:L627](../../../../scripts/dev-server.cjs#L627) |
| `activeDb.query` | `object_method` | No | `(text: unknown, params: unknown)` | `sync_value` | `scripts/dev-server.cjs:query` | — | [scripts/dev-server.cjs:L641](../../../../scripts/dev-server.cjs#L641) |
| `activeDb.transaction` | `object_method` | No | `(fn: unknown)` | `async -> promise (throws: thrown_value)` | `scripts/dev-server.cjs:transaction` | — | [scripts/dev-server.cjs:L642](../../../../scripts/dev-server.cjs#L642) |
| `query` | `object_method` | No | `(...args: array)` | `sync_value` | — | — | [scripts/dev-server.cjs:L661](../../../../scripts/dev-server.cjs#L661) |
| `transaction` | `object_method` | No | `(fn: unknown)` | `sync_value` | — | — | [scripts/dev-server.cjs:L662](../../../../scripts/dev-server.cjs#L662) |
| `loadRoute` | `function` | No | `(filePath: unknown)` | `async -> promise` | `scripts/dev-server.cjs:top>anon@L710C35` | — | [scripts/dev-server.cjs:L680](../../../../scripts/dev-server.cjs#L680) |
| `resolveApiRoute` | `function` | No | `(pathname: unknown)` | `sync_value` | `scripts/dev-server.cjs:top>anon@L710C35` | — | [scripts/dev-server.cjs:L692](../../../../scripts/dev-server.cjs#L692) |
| `top>anon@L710C35` | `anonymous_function` | No | `(req: unknown, res: unknown)` | `async -> promise` | — | — | [scripts/dev-server.cjs:L710](../../../../scripts/dev-server.cjs#L710) |
| `top>anon@L710C35>anon@L746C50` | `anonymous_function` | No | `(p: unknown)` | `sync_value` | — | — | [scripts/dev-server.cjs:L746](../../../../scripts/dev-server.cjs#L746) |
| `mockRes.setHeader` | `object_method` | No | `(k: unknown, v: unknown)` | `void_or_implicit` | — | — | [scripts/dev-server.cjs:L794](../../../../scripts/dev-server.cjs#L794) |
| `mockRes.status` | `object_method` | No | `(code: unknown)` | `sync_value` | — | — | [scripts/dev-server.cjs:L795](../../../../scripts/dev-server.cjs#L795) |
| `mockRes.end` | `object_method` | No | `(body: string)` | `sync_value` | — | — | [scripts/dev-server.cjs:L796](../../../../scripts/dev-server.cjs#L796) |
| `mockRes.json` | `object_method` | No | `(payload: unknown)` | `sync_value` | — | — | [scripts/dev-server.cjs:L803](../../../../scripts/dev-server.cjs#L803) |

## [scripts/dev-workbench/debug-admin.js](../../../../scripts/dev-workbench/debug-admin.js) (`module`)
- **Explicit Window / Wrapper Globals**: `__BITESHARK__` (explicit_window_property @ L125), `__BITESHARK__.user` (explicit_window_property @ L126), `__trucklyFetchWrapped` (explicit_window_property @ L132), `fetch` (explicit_window_property @ L134), `trucklyDebug` (explicit_window_property @ L716)
- **Top-Level Constants (5)**: `IS_LOCAL`, `URL_DEBUG`, `ALLOWED_ROLES`, `ROLE_META`, `GPS_PRESETS`

| Symbol | Kind | Exported | Parameters (Observed Basis) | Returns / Throws | Confirmed Callers (Inferred in italics) | Contracts | Lines |
|---|---|---|---|---|---|---|---|
| `safeGet` | `function` | No | `(key: unknown, fallback: unknown)` | `sync_value` | `scripts/dev-workbench/debug-admin.js:<iife_top>`, `scripts/dev-workbench/debug-admin.js:updateLaunchButton` | — | [scripts/dev-workbench/debug-admin.js:L11](../../../../scripts/dev-workbench/debug-admin.js#L11) |
| `safeSet` | `function` | No | `(key: unknown, value: unknown)` | `void_or_implicit` | `scripts/dev-workbench/debug-admin.js:openDrawer`, `scripts/dev-workbench/debug-admin.js:resetAll`, `scripts/dev-workbench/debug-admin.js:setRole` | — | [scripts/dev-workbench/debug-admin.js:L20](../../../../scripts/dev-workbench/debug-admin.js#L20) |
| `dbgEsc` | `function` | No | `(v: unknown)` | `sync_value` | `scripts/dev-workbench/debug-admin.js:renderDrawer`, `scripts/dev-workbench/debug-admin.js:renderDrawer>anon@L567C24`, `scripts/dev-workbench/debug-admin.js:renderLogsAndStats>anon@L533C25`, `scripts/dev-workbench/debug-admin.js:updateLaunchButton` | — | [scripts/dev-workbench/debug-admin.js:L24](../../../../scripts/dev-workbench/debug-admin.js#L24) |
| `redactDebugPath` | `function` | No | `(rawUrl: unknown)` | `sync_value` | `scripts/dev-workbench/debug-admin.js:fetch` | — | [scripts/dev-workbench/debug-admin.js:L30](../../../../scripts/dev-workbench/debug-admin.js#L30) |
| `syncRoleCookieAndWindow` | `function` | No | `()` | `void_or_implicit` | `scripts/dev-workbench/debug-admin.js:mountUI`, `scripts/dev-workbench/debug-admin.js:resetAll`, `scripts/dev-workbench/debug-admin.js:setRole` | — | [scripts/dev-workbench/debug-admin.js:L120](../../../../scripts/dev-workbench/debug-admin.js#L120) |
| `fetch` | `function` | No | `(input: unknown, init: unknown)` | `async -> promise (throws: thrown_value)` | *candidate: public/profile-client.js:requestJson, public/role-experience.js:refreshFeatureControls>anon@L3866C30* | — | [scripts/dev-workbench/debug-admin.js:L134](../../../../scripts/dev-workbench/debug-admin.js#L134) |
| `refreshServerDebugState` | `function` | No | `()` | `async -> promise` | `scripts/dev-workbench/debug-admin.js:mountUI`, `scripts/dev-workbench/debug-admin.js:openDrawer`, `scripts/dev-workbench/debug-admin.js:seedBooking`, `scripts/dev-workbench/debug-admin.js:seedWhisper` (+4) | — | [scripts/dev-workbench/debug-admin.js:L180](../../../../scripts/dev-workbench/debug-admin.js#L180) |
| `updateLaunchButton` | `function` | No | `()` | `void_or_implicit` | `scripts/dev-workbench/debug-admin.js:mountUI`, `scripts/dev-workbench/debug-admin.js:mountUI>anon@L698C37`, `scripts/dev-workbench/debug-admin.js:openDrawer`, `scripts/dev-workbench/debug-admin.js:setRole` | — | [scripts/dev-workbench/debug-admin.js:L195](../../../../scripts/dev-workbench/debug-admin.js#L195) |
| `setRole` | `function` | No | `(role: unknown)` | `async -> promise` | `scripts/dev-workbench/debug-admin.js:jumpProvider`, `scripts/dev-workbench/debug-admin.js:mountUI>anon@L698C37>anon@L701C42` | — | [scripts/dev-workbench/debug-admin.js:L206](../../../../scripts/dev-workbench/debug-admin.js#L206) |
| `jumpCustomer` | `function` | No | `(target: unknown)` | `async -> promise` | — | — | [scripts/dev-workbench/debug-admin.js:L239](../../../../scripts/dev-workbench/debug-admin.js#L239) |
| `jumpProvider` | `function` | No | `(target: unknown)` | `async -> promise` | `scripts/dev-workbench/debug-admin.js:seedBooking`, `scripts/dev-workbench/debug-admin.js:seedWhisper` | — | [scripts/dev-workbench/debug-admin.js:L260](../../../../scripts/dev-workbench/debug-admin.js#L260) |
| `spawnLivePager` | `function` | No | `()` | `async -> promise (throws: Error)` | — | — | [scripts/dev-workbench/debug-admin.js:L285](../../../../scripts/dev-workbench/debug-admin.js#L285) |
| `setLivePagerStatus` | `function` | No | `(status: unknown)` | `async -> promise` | — | — | [scripts/dev-workbench/debug-admin.js:L325](../../../../scripts/dev-workbench/debug-admin.js#L325) |
| `seedBooking` | `function` | No | `()` | `async -> promise` | — | — | [scripts/dev-workbench/debug-admin.js:L348](../../../../scripts/dev-workbench/debug-admin.js#L348) |
| `seedWhisper` | `function` | No | `()` | `async -> promise` | — | — | [scripts/dev-workbench/debug-admin.js:L383](../../../../scripts/dev-workbench/debug-admin.js#L383) |
| `simulateGps` | `function` | No | `(preset: unknown)` | `async -> promise` | — | — | [scripts/dev-workbench/debug-admin.js:L415](../../../../scripts/dev-workbench/debug-admin.js#L415) |
| `simulateHours` | `function` | No | `(mode: unknown)` | `async -> promise` | — | — | [scripts/dev-workbench/debug-admin.js:L459](../../../../scripts/dev-workbench/debug-admin.js#L459) |
| `simulateHours>anon@L471C19` | `anonymous_function` | No | `(t: unknown)` | `void_or_implicit` | — | — | [scripts/dev-workbench/debug-admin.js:L471](../../../../scripts/dev-workbench/debug-admin.js#L471) |
| `resetAll` | `function` | No | `()` | `async -> promise` | — | — | [scripts/dev-workbench/debug-admin.js:L486](../../../../scripts/dev-workbench/debug-admin.js#L486) |
| `renderLogsAndStats` | `function` | No | `()` | `void_or_implicit` | `scripts/dev-workbench/debug-admin.js:fetch`, `scripts/dev-workbench/debug-admin.js:renderDrawer` | — | [scripts/dev-workbench/debug-admin.js:L514](../../../../scripts/dev-workbench/debug-admin.js#L514) |
| `renderLogsAndStats>anon@L533C25` | `anonymous_function` | No | `(l: unknown)` | `sync_value` | — | — | [scripts/dev-workbench/debug-admin.js:L533](../../../../scripts/dev-workbench/debug-admin.js#L533) |
| `renderDrawer` | `function` | No | `()` | `void_or_implicit` | `scripts/dev-workbench/debug-admin.js:closeDrawer`, `scripts/dev-workbench/debug-admin.js:jumpCustomer`, `scripts/dev-workbench/debug-admin.js:jumpProvider`, `scripts/dev-workbench/debug-admin.js:openDrawer` (+8) | — | [scripts/dev-workbench/debug-admin.js:L543](../../../../scripts/dev-workbench/debug-admin.js#L543) |
| `renderDrawer>anon@L567C24` | `anonymous_function` | No | `(r: unknown)` | `sync_value` | — | — | [scripts/dev-workbench/debug-admin.js:L567](../../../../scripts/dev-workbench/debug-admin.js#L567) |
| `openDrawer` | `function` | No | `()` | `async -> promise` | `scripts/dev-workbench/debug-admin.js:mountUI>item.onclick`, `scripts/dev-workbench/debug-admin.js:toggleDrawer` | — | [scripts/dev-workbench/debug-admin.js:L634](../../../../scripts/dev-workbench/debug-admin.js#L634) |
| `closeDrawer` | `function` | No | `()` | `void_or_implicit` | `scripts/dev-workbench/debug-admin.js:toggleDrawer` | — | [scripts/dev-workbench/debug-admin.js:L642](../../../../scripts/dev-workbench/debug-admin.js#L642) |
| `toggleDrawer` | `function` | No | `()` | `void_or_implicit` | `scripts/dev-workbench/debug-admin.js:mountUI>anon@L708C41` | — | [scripts/dev-workbench/debug-admin.js:L647](../../../../scripts/dev-workbench/debug-admin.js#L647) |
| `mountUI` | `function` | No | `()` | `void_or_implicit` | `scripts/dev-workbench/debug-admin.js:<iife_top>` | — | [scripts/dev-workbench/debug-admin.js:L652](../../../../scripts/dev-workbench/debug-admin.js#L652) |
| `mountUI>item.onclick` | `function` | No | `()` | `void_or_implicit` | — | — | [scripts/dev-workbench/debug-admin.js:L672](../../../../scripts/dev-workbench/debug-admin.js#L672) |
| `mountUI>anon@L698C37` | `anonymous_function` | No | `()` | `promise` | — | — | [scripts/dev-workbench/debug-admin.js:L698](../../../../scripts/dev-workbench/debug-admin.js#L698) |
| `mountUI>anon@L708C41` | `anonymous_function` | No | `(e: unknown)` | `void_or_implicit` | — | — | [scripts/dev-workbench/debug-admin.js:L708](../../../../scripts/dev-workbench/debug-admin.js#L708) |
| `trucklyDebug.refresh` | `object_method` | No | `()` | `async -> promise` | — | — | [scripts/dev-workbench/debug-admin.js:L720](../../../../scripts/dev-workbench/debug-admin.js#L720) |

## [scripts/manage-feature-controls.cjs](../../../../scripts/manage-feature-controls.cjs) (`script`)
- **Imports / Dependencies**: `<dynamic_expr>`, `<dynamic_require>`, `node:fs`, `node:path`, `node:url`, `pg`
- **Top-Level Constants (2)**: `fs`, `path`

| Symbol | Kind | Exported | Parameters (Observed Basis) | Returns / Throws | Confirmed Callers (Inferred in italics) | Contracts | Lines |
|---|---|---|---|---|---|---|---|
| `parseEnvFile` | `function` | No | `(filePath: unknown)` | `sync_value` | `scripts/manage-feature-controls.cjs:<iife_top>` | — | [scripts/manage-feature-controls.cjs:L19](../../../../scripts/manage-feature-controls.cjs#L19) |
| `requirePg` | `function` | No | `(fileEnv: object)` | `sync_value (throws: Error)` | `scripts/manage-feature-controls.cjs:<iife_top>` | — | [scripts/manage-feature-controls.cjs:L38](../../../../scripts/manage-feature-controls.cjs#L38) |
| `maskEmail` | `function` | No | `(email: unknown)` | `sync_value` | `scripts/manage-feature-controls.cjs:<iife_top>` | — | [scripts/manage-feature-controls.cjs:L53](../../../../scripts/manage-feature-controls.cjs#L53) |
| `parseArgs` | `function` | No | `(argv: unknown)` | `sync_value (throws: Error)` | `scripts/manage-feature-controls.cjs:<iife_top>` | — | [scripts/manage-feature-controls.cjs:L59](../../../../scripts/manage-feature-controls.cjs#L59) |

## [scripts/operator-read-my-otp.cjs](../../../../scripts/operator-read-my-otp.cjs) (`script`)
- **Imports / Dependencies**: `node:fs`
- **Top-Level Constants (1)**: `fs`

| Symbol | Kind | Exported | Parameters (Observed Basis) | Returns / Throws | Confirmed Callers (Inferred in italics) | Contracts | Lines |
|---|---|---|---|---|---|---|---|
| `parseEnvFile` | `function` | No | `(filePath: unknown)` | `sync_value` | `scripts/operator-read-my-otp.cjs:main` | — | [scripts/operator-read-my-otp.cjs:L13](../../../../scripts/operator-read-my-otp.cjs#L13) |
| `parseArgs` | `function` | No | `(argv: unknown)` | `sync_value (throws: Error)` | `scripts/operator-read-my-otp.cjs:main` | — | [scripts/operator-read-my-otp.cjs:L32](../../../../scripts/operator-read-my-otp.cjs#L32) |
| `main` | `function` | No | `()` | `async -> promise (throws: Error)` | `scripts/operator-read-my-otp.cjs:<top_level>` | — | [scripts/operator-read-my-otp.cjs:L59](../../../../scripts/operator-read-my-otp.cjs#L59) |

## [scripts/run-migrations.cjs](../../../../scripts/run-migrations.cjs) (`script`)
- **Imports / Dependencies**: `<dynamic_require>`, `node:crypto`, `node:fs`, `node:path`, `pg`
- **Top-Level Constants (5)**: `fs`, `path`, `crypto`, `ROOT`, `MIGRATIONS_DIR`

| Symbol | Kind | Exported | Parameters (Observed Basis) | Returns / Throws | Confirmed Callers (Inferred in italics) | Contracts | Lines |
|---|---|---|---|---|---|---|---|
| `readCliEnvCompat` | `function` | No | `(suffix: unknown, { securityCritical }: object)` | `sync_value (throws: Error)` | `scripts/run-migrations.cjs:parseArgs`, `scripts/run-migrations.cjs:requirePg` | — | [scripts/run-migrations.cjs:L15](../../../../scripts/run-migrations.cjs#L15) |
| `requirePg` | `function` | No | `()` | `sync_value (throws: Error)` | `scripts/run-migrations.cjs:<iife_top>` | — | [scripts/run-migrations.cjs:L29](../../../../scripts/run-migrations.cjs#L29) |
| `parseArgs` | `function` | No | `(argv: unknown)` | `sync_value` | `scripts/run-migrations.cjs:<iife_top>` | [CTR-RELEASE-MIGRATION-DEPLOY](../CONTRACTS-CATALOG.md) | [scripts/run-migrations.cjs:L41](../../../../scripts/run-migrations.cjs#L41) |
| `assertSafeIdentifier` | `function` | No | `(ident: unknown, label: unknown)` | `sync_value (throws: Error)` | `scripts/run-migrations.cjs:<iife_top>` | — | [scripts/run-migrations.cjs:L53](../../../../scripts/run-migrations.cjs#L53) |

## [scripts/run-pager-worker.cjs](../../../../scripts/run-pager-worker.cjs) (`script`)
- **Imports / Dependencies**: `<dynamic_expr>`, `<dynamic_require>`, `node:fs`, `node:path`, `node:url`, `pg`
- **Top-Level Constants (2)**: `fs`, `path`

| Symbol | Kind | Exported | Parameters (Observed Basis) | Returns / Throws | Confirmed Callers (Inferred in italics) | Contracts | Lines |
|---|---|---|---|---|---|---|---|
| `readCliEnvCompat` | `function` | No | `(suffix: unknown, { securityCritical, defaultValue }: object)` | `sync_value (throws: Error)` | `scripts/run-pager-worker.cjs:<iife_top>`, `scripts/run-pager-worker.cjs:parseArgs` | — | [scripts/run-pager-worker.cjs:L19](../../../../scripts/run-pager-worker.cjs#L19) |
| `parseArgs` | `function` | No | `(argv: unknown)` | `sync_value` | `scripts/run-pager-worker.cjs:<iife_top>` | — | [scripts/run-pager-worker.cjs:L33](../../../../scripts/run-pager-worker.cjs#L33) |
| `requestStop` | `function` | No | `(signal: unknown)` | `void_or_implicit` | `scripts/run-pager-worker.cjs:top>anon@L71C22`, `scripts/run-pager-worker.cjs:top>anon@L72C21` | — | [scripts/run-pager-worker.cjs:L62](../../../../scripts/run-pager-worker.cjs#L62) |
| `sleepInterruptible` | `function` | No | `(ms: unknown)` | `promise` | `scripts/run-pager-worker.cjs:<iife_top>` | — | [scripts/run-pager-worker.cjs:L74](../../../../scripts/run-pager-worker.cjs#L74) |
| `sleepInterruptible>anon@L76C21` | `anonymous_function` | No | `(resolve: unknown)` | `void_or_implicit` | — | — | [scripts/run-pager-worker.cjs:L76](../../../../scripts/run-pager-worker.cjs#L76) |
| `sleepInterruptible>anon@L76C21>sleepAbort` | `arrow_function` | No | `()` | `void_or_implicit` | — | — | [scripts/run-pager-worker.cjs:L81](../../../../scripts/run-pager-worker.cjs#L81) |
| `top>anon@L92C22` | `anonymous_function` | No | `()` | `sync_value` | — | — | [scripts/run-pager-worker.cjs:L92](../../../../scripts/run-pager-worker.cjs#L92) |
| `dbAdapter.query` | `object_method` | No | `(text: unknown, params: unknown)` | `sync_value` | — | — | [scripts/run-pager-worker.cjs:L195](../../../../scripts/run-pager-worker.cjs#L195) |
| `dbAdapter.connect` | `object_method` | No | `()` | `sync_value` | — | — | [scripts/run-pager-worker.cjs:L196](../../../../scripts/run-pager-worker.cjs#L196) |

## [scripts/seed-sql-reader.cjs](../../../../scripts/seed-sql-reader.cjs) (`script`)
- **Imports / Dependencies**: `node:fs`, `node:path`
- **Exports**: `loadSeedVendorsFromMigration014`
- **Top-Level Constants (3)**: `fs`, `path`, `COLUMNS`

| Symbol | Kind | Exported | Parameters (Observed Basis) | Returns / Throws | Confirmed Callers (Inferred in italics) | Contracts | Lines |
|---|---|---|---|---|---|---|---|
| `parseSqlValue` | `function` | No | `(token: unknown)` | `sync_value (throws: Error)` | `scripts/seed-sql-reader.cjs:loadSeedVendorsFromMigration014` | — | [scripts/seed-sql-reader.cjs:L48](../../../../scripts/seed-sql-reader.cjs#L48) |
| `splitTupleTokens` | `function` | No | `(tupleBody: unknown)` | `sync_value` | `scripts/seed-sql-reader.cjs:loadSeedVendorsFromMigration014` | — | [scripts/seed-sql-reader.cjs:L99](../../../../scripts/seed-sql-reader.cjs#L99) |
| `loadSeedVendorsFromMigration014` | `function` | No | `(rootDir: unknown)` | `sync_value (throws: Error)` | `scripts/dev-server.cjs:createInitialStore` | — | [scripts/seed-sql-reader.cjs:L145](../../../../scripts/seed-sql-reader.cjs#L145) |

## [scripts/staging-runtime-probe.js](../../../../scripts/staging-runtime-probe.js) (`module`)
- **Imports / Dependencies**: `../lib/authz.js`, `../lib/db-tx.js`, `../lib/env-compat.js`, `../lib/webpush-crypto.js`, `@biteshark/runtime-adapter`, `node:crypto`
- **Exports**: `access`, `methods`, `default`
- **Top-Level Constants (2)**: `access` *(exported)*, `methods` *(exported)*

| Symbol | Kind | Exported | Parameters (Observed Basis) | Returns / Throws | Confirmed Callers (Inferred in italics) | Contracts | Lines |
|---|---|---|---|---|---|---|---|
| `timingSafeMatch` | `function` | No | `(a: unknown, b: unknown)` | `sync_value` | `scripts/staging-runtime-probe.js:default` | — | [scripts/staging-runtime-probe.js:L22](../../../../scripts/staging-runtime-probe.js#L22) |
| `runWebPushCryptoSelfTest` | `function` | No | `()` | `sync_value` | `scripts/staging-runtime-probe.js:default` | — | [scripts/staging-runtime-probe.js:L29](../../../../scripts/staging-runtime-probe.js#L29) |
| `default` | `function` | Yes | `(req: unknown, res: unknown)` | `async -> promise (throws: thrown_value)` | `server/app.js:createStandaloneServer>anon@L558C35>anon@L889C72>anon@L890C50` | — | [scripts/staging-runtime-probe.js:L56](../../../../scripts/staging-runtime-probe.js#L56) |
| `default>anon@L93C42` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise` | — | — | [scripts/staging-runtime-probe.js:L93](../../../../scripts/staging-runtime-probe.js#L93) |
| `default>anon@L117C30` | `anonymous_function` | No | `(tx: unknown)` | `async -> promise (throws: Error)` | — | — | [scripts/staging-runtime-probe.js:L117](../../../../scripts/staging-runtime-probe.js#L117) |

## [tools/code-registry/backend-db-analyzer.mjs](../../../../tools/code-registry/backend-db-analyzer.mjs) (`module`)
- **Imports / Dependencies**: `./js-analyzer.mjs`, `./schema-versions.mjs`, `node:crypto`
- **Exports**: `extractFeatureControlsContract`, `extractDiagnosticsContract`, `extractAgePolicyAllowlist`, `extractBackendRoutes`, `analyzeMigrationsAndSchema`, `generateMermaidErDiagram`
- **Top-Level Constants (1)**: `SQL_NON_TABLE_KEYWORDS`

| Symbol | Kind | Exported | Parameters (Observed Basis) | Returns / Throws | Confirmed Callers (Inferred in italics) | Contracts | Lines |
|---|---|---|---|---|---|---|---|
| `walkAst` | `function` | No | `(node: unknown, visitor: unknown, ancestors: array)` | `void_or_implicit` | `tools/code-registry/backend-db-analyzer.mjs:collectPermissionSignalsFromAst`, `tools/code-registry/backend-db-analyzer.mjs:extractAgePolicyAllowlist`, `tools/code-registry/backend-db-analyzer.mjs:extractBackendRoutes`, `tools/code-registry/backend-db-analyzer.mjs:extractDiagnosticsContract` (+2) | — | [tools/code-registry/backend-db-analyzer.mjs:L8](../../../../tools/code-registry/backend-db-analyzer.mjs#L8) |
| `unwrapObjectFreeze` | `function` | No | `(node: unknown)` | `sync_value` | `tools/code-registry/backend-db-analyzer.mjs:evalStaticLiteral`, `tools/code-registry/backend-db-analyzer.mjs:extractFeatureControlsContract>anon@L90C22` | — | [tools/code-registry/backend-db-analyzer.mjs:L25](../../../../tools/code-registry/backend-db-analyzer.mjs#L25) |
| `getMemberChain` | `function` | No | `(node: unknown)` | `sync_value` | `tools/code-registry/backend-db-analyzer.mjs:collectPermissionSignalsFromAst>anon@L368C19`, `tools/code-registry/backend-db-analyzer.mjs:extractSubtreeHttpTelemetry>anon@L614C19`, `tools/code-registry/backend-db-analyzer.mjs:isMethodVarNode`, `tools/code-registry/backend-db-analyzer.mjs:isPathVarNode` | — | [tools/code-registry/backend-db-analyzer.mjs:L39](../../../../tools/code-registry/backend-db-analyzer.mjs#L39) |
| `evalStaticLiteral` | `function` | No | `(node: unknown)` | `sync_value` | `tools/code-registry/backend-db-analyzer.mjs:collectPermissionSignalsFromAst>anon@L368C19`, `tools/code-registry/backend-db-analyzer.mjs:extractAgePolicyAllowlist>anon@L174C22`, `tools/code-registry/backend-db-analyzer.mjs:extractBackendRoutes>anon@L884C32`, `tools/code-registry/backend-db-analyzer.mjs:extractDiagnosticsContract>anon@L151C22` (+5) | — | [tools/code-registry/backend-db-analyzer.mjs:L52](../../../../tools/code-registry/backend-db-analyzer.mjs#L52) |
| `extractFeatureControlsContract` | `function` | Yes | `(source: unknown, relPath: string)` | `sync_value` | `tools/code-registry/scanner.mjs:scanRepositorySnapshot` | — | [tools/code-registry/backend-db-analyzer.mjs:L83](../../../../tools/code-registry/backend-db-analyzer.mjs#L83) |
| `extractFeatureControlsContract>anon@L90C22` | `anonymous_function` | No | `(node: unknown)` | `void_or_implicit` | — | — | [tools/code-registry/backend-db-analyzer.mjs:L90](../../../../tools/code-registry/backend-db-analyzer.mjs#L90) |
| `extractDiagnosticsContract` | `function` | Yes | `(source: unknown, relPath: string)` | `sync_value` | `tools/code-registry/scanner.mjs:scanRepositorySnapshot` | — | [tools/code-registry/backend-db-analyzer.mjs:L138](../../../../tools/code-registry/backend-db-analyzer.mjs#L138) |
| `extractDiagnosticsContract>anon@L151C22` | `anonymous_function` | No | `(node: unknown)` | `void_or_implicit` | — | — | [tools/code-registry/backend-db-analyzer.mjs:L151](../../../../tools/code-registry/backend-db-analyzer.mjs#L151) |
| `extractAgePolicyAllowlist` | `function` | Yes | `(source: unknown, relPath: string)` | `sync_value` | `tools/code-registry/backend-db-analyzer.mjs:extractBackendRoutes` | — | [tools/code-registry/backend-db-analyzer.mjs:L169](../../../../tools/code-registry/backend-db-analyzer.mjs#L169) |
| `extractAgePolicyAllowlist>anon@L174C22` | `anonymous_function` | No | `(node: unknown)` | `void_or_implicit` | — | — | [tools/code-registry/backend-db-analyzer.mjs:L174](../../../../tools/code-registry/backend-db-analyzer.mjs#L174) |
| `isMethodVarNode` | `function` | No | `(node: unknown)` | `sync_value` | `tools/code-registry/backend-db-analyzer.mjs:extractNegativeMethodGuardFromTest`, `tools/code-registry/backend-db-analyzer.mjs:extractPositiveMethodFromTest` | — | [tools/code-registry/backend-db-analyzer.mjs:L214](../../../../tools/code-registry/backend-db-analyzer.mjs#L214) |
| `isPathVarNode` | `function` | No | `(node: unknown)` | `sync_value` | `tools/code-registry/backend-db-analyzer.mjs:extractRoutePathsFromTestExpr` | — | [tools/code-registry/backend-db-analyzer.mjs:L224](../../../../tools/code-registry/backend-db-analyzer.mjs#L224) |
| `extractRoutePathsFromTestExpr` | `function` | No | `(testNode: unknown)` | `sync_value` | `tools/code-registry/backend-db-analyzer.mjs:extractBackendRoutes`, `tools/code-registry/backend-db-analyzer.mjs:extractBackendRoutes>anon@L1003C29` | — | [tools/code-registry/backend-db-analyzer.mjs:L233](../../../../tools/code-registry/backend-db-analyzer.mjs#L233) |
| `extractNegativeMethodGuardFromTest` | `function` | No | `(testNode: unknown)` | `sync_value` | `tools/code-registry/backend-db-analyzer.mjs:extractMethodsAndBranchesFromConsequent` | — | [tools/code-registry/backend-db-analyzer.mjs:L254](../../../../tools/code-registry/backend-db-analyzer.mjs#L254) |
| `extractPositiveMethodFromTest` | `function` | No | `(testNode: unknown)` | `sync_value` | `tools/code-registry/backend-db-analyzer.mjs:extractMethodsAndBranchesFromConsequent` | — | [tools/code-registry/backend-db-analyzer.mjs:L291](../../../../tools/code-registry/backend-db-analyzer.mjs#L291) |
| `blockAlwaysReturns` | `function` | No | `(stmt: unknown)` | `sync_value` | `tools/code-registry/backend-db-analyzer.mjs:extractBackendRoutes`, `tools/code-registry/backend-db-analyzer.mjs:extractMethodsAndBranchesFromConsequent` | — | [tools/code-registry/backend-db-analyzer.mjs:L311](../../../../tools/code-registry/backend-db-analyzer.mjs#L311) |
| `buildIntraFileHelperSignals` | `function` | No | `(ast: unknown)` | `sync_value` | `tools/code-registry/backend-db-analyzer.mjs:extractBackendRoutes`, `tools/code-registry/backend-db-analyzer.mjs:extractBackendRoutes>anon@L884C32` | — | [tools/code-registry/backend-db-analyzer.mjs:L320](../../../../tools/code-registry/backend-db-analyzer.mjs#L320) |
| `collectPermissionSignalsFromAst` | `function` | No | `(subtree: unknown, intraFileHelperSignals: unknown)` | `sync_value` | `tools/code-registry/backend-db-analyzer.mjs:buildIntraFileHelperSignals`, `tools/code-registry/backend-db-analyzer.mjs:extractBackendRoutes`, `tools/code-registry/backend-db-analyzer.mjs:extractBackendRoutes>anon@L1003C29`, `tools/code-registry/backend-db-analyzer.mjs:extractBackendRoutes>anon@L884C32` | — | [tools/code-registry/backend-db-analyzer.mjs:L351](../../../../tools/code-registry/backend-db-analyzer.mjs#L351) |
| `collectPermissionSignalsFromAst>anon@L368C19` | `anonymous_function` | No | `(node: unknown)` | `void_or_implicit` | — | — | [tools/code-registry/backend-db-analyzer.mjs:L368](../../../../tools/code-registry/backend-db-analyzer.mjs#L368) |
| `classifyAuthorizationFromSignals` | `function` | No | `(signals: unknown, { routerEntryAuthz, defaultAccess }: object)` | `sync_value` | `tools/code-registry/backend-db-analyzer.mjs:extractBackendRoutes`, `tools/code-registry/backend-db-analyzer.mjs:extractBackendRoutes>anon@L884C32` | — | [tools/code-registry/backend-db-analyzer.mjs:L527](../../../../tools/code-registry/backend-db-analyzer.mjs#L527) |
| `extractSubtreeHttpTelemetry` | `function` | No | `(subtree: unknown, sourceText: unknown)` | `sync_value` | `tools/code-registry/backend-db-analyzer.mjs:extractBackendRoutes`, `tools/code-registry/backend-db-analyzer.mjs:extractBackendRoutes>anon@L1003C29`, `tools/code-registry/backend-db-analyzer.mjs:extractBackendRoutes>anon@L884C32` | — | [tools/code-registry/backend-db-analyzer.mjs:L608](../../../../tools/code-registry/backend-db-analyzer.mjs#L608) |
| `extractSubtreeHttpTelemetry>anon@L614C19` | `anonymous_function` | No | `(node: unknown)` | `void_or_implicit` | — | — | [tools/code-registry/backend-db-analyzer.mjs:L614](../../../../tools/code-registry/backend-db-analyzer.mjs#L614) |
| `extractMethodsAndBranchesFromConsequent` | `function` | No | `(consequentBlock: unknown)` | `sync_value` | `tools/code-registry/backend-db-analyzer.mjs:extractBackendRoutes`, `tools/code-registry/backend-db-analyzer.mjs:extractBackendRoutes>anon@L1003C29`, `tools/code-registry/backend-db-analyzer.mjs:extractBackendRoutes>anon@L884C32` | — | [tools/code-registry/backend-db-analyzer.mjs:L675](../../../../tools/code-registry/backend-db-analyzer.mjs#L675) |
| `normalizeConsumerUrlForRouteMatch` | `function` | No | `(rawPattern: unknown)` | `sync_value` | `tools/code-registry/backend-db-analyzer.mjs:extractBackendRoutes` | — | [tools/code-registry/backend-db-analyzer.mjs:L740](../../../../tools/code-registry/backend-db-analyzer.mjs#L740) |
| `matchesExactRouteStringInTest` | `function` | No | `(testSource: unknown, routePath: unknown)` | `sync_value` | `tools/code-registry/backend-db-analyzer.mjs:extractBackendRoutes` | — | [tools/code-registry/backend-db-analyzer.mjs:L754](../../../../tools/code-registry/backend-db-analyzer.mjs#L754) |
| `extractBackendRoutes` | `function` | Yes | `({ fileContentsByPath, featureRouteRules, jsAnalysesByPath, routeOverrides, sharedContracts }: object)` | `sync_value` | `tools/code-registry/scanner.mjs:scanRepositorySnapshot` | — | [tools/code-registry/backend-db-analyzer.mjs:L765](../../../../tools/code-registry/backend-db-analyzer.mjs#L765) |
| `extractBackendRoutes>computeFeatureEnforcementForRoute` | `function` | No | `(routePath: unknown, methods: unknown)` | `sync_value` | `tools/code-registry/backend-db-analyzer.mjs:extractBackendRoutes>registerRoute` | — | [tools/code-registry/backend-db-analyzer.mjs:L792](../../../../tools/code-registry/backend-db-analyzer.mjs#L792) |
| `extractBackendRoutes>registerRoute` | `function` | No | `(entry: unknown)` | `void_or_implicit` | `tools/code-registry/backend-db-analyzer.mjs:extractBackendRoutes`, `tools/code-registry/backend-db-analyzer.mjs:extractBackendRoutes>anon@L1003C29`, `tools/code-registry/backend-db-analyzer.mjs:extractBackendRoutes>anon@L884C32` | — | [tools/code-registry/backend-db-analyzer.mjs:L820](../../../../tools/code-registry/backend-db-analyzer.mjs#L820) |
| `extractBackendRoutes>anon@L884C32` | `anonymous_function` | No | `(node: unknown)` | `void_or_implicit` | — | — | [tools/code-registry/backend-db-analyzer.mjs:L884](../../../../tools/code-registry/backend-db-analyzer.mjs#L884) |
| `extractBackendRoutes>anon@L1003C29` | `anonymous_function` | No | `(node: unknown)` | `void_or_implicit` | — | — | [tools/code-registry/backend-db-analyzer.mjs:L1003](../../../../tools/code-registry/backend-db-analyzer.mjs#L1003) |
| `stripSqlComments` | `function` | No | `(sql: unknown)` | `sync_value` | `tools/code-registry/backend-db-analyzer.mjs:analyzeMigrationsAndSchema` | — | [tools/code-registry/backend-db-analyzer.mjs:L1335](../../../../tools/code-registry/backend-db-analyzer.mjs#L1335) |
| `splitTopLevelCommas` | `function` | No | `(body: unknown)` | `sync_value` | `tools/code-registry/backend-db-analyzer.mjs:analyzeMigrationsAndSchema` | — | [tools/code-registry/backend-db-analyzer.mjs:L1386](../../../../tools/code-registry/backend-db-analyzer.mjs#L1386) |
| `findBalancedParenBody` | `function` | No | `(str: unknown, openIdx: unknown)` | `sync_value` | `tools/code-registry/backend-db-analyzer.mjs:analyzeMigrationsAndSchema` | — | [tools/code-registry/backend-db-analyzer.mjs:L1417](../../../../tools/code-registry/backend-db-analyzer.mjs#L1417) |
| `recordTableConstraint` | `function` | No | `(normDef: unknown, migrationFile: unknown, tableObj: unknown)` | `void_or_implicit` | `tools/code-registry/backend-db-analyzer.mjs:applyAlterTableClause`, `tools/code-registry/backend-db-analyzer.mjs:parseColumnOrConstraintItem` | — | [tools/code-registry/backend-db-analyzer.mjs:L1440](../../../../tools/code-registry/backend-db-analyzer.mjs#L1440) |
| `parseColumnOrConstraintItem` | `function` | No | `(item: unknown, migrationFile: unknown, tableObj: unknown)` | `void_or_implicit` | `tools/code-registry/backend-db-analyzer.mjs:analyzeMigrationsAndSchema`, `tools/code-registry/backend-db-analyzer.mjs:applyAlterTableClause` | — | [tools/code-registry/backend-db-analyzer.mjs:L1499](../../../../tools/code-registry/backend-db-analyzer.mjs#L1499) |
| `applyAlterTableClause` | `function` | No | `(clause: unknown, migrationFile: unknown, tbl: unknown, manualReviewReasons: unknown)` | `void_or_implicit` | `tools/code-registry/backend-db-analyzer.mjs:analyzeMigrationsAndSchema` | — | [tools/code-registry/backend-db-analyzer.mjs:L1586](../../../../tools/code-registry/backend-db-analyzer.mjs#L1586) |
| `analyzeMigrationsAndSchema` | `function` | Yes | `({ migrationFiles, runMigrationsSource }: object)` | `sync_value` | `tools/code-registry/scanner.mjs:scanRepositorySnapshot` | — | [tools/code-registry/backend-db-analyzer.mjs:L1669](../../../../tools/code-registry/backend-db-analyzer.mjs#L1669) |
| `analyzeMigrationsAndSchema>ensureTable` | `function` | No | `(tableName: unknown, createdByMigration: null_or_object)` | `sync_value` | `tools/code-registry/backend-db-analyzer.mjs:analyzeMigrationsAndSchema` | — | [tools/code-registry/backend-db-analyzer.mjs:L1676](../../../../tools/code-registry/backend-db-analyzer.mjs#L1676) |
| `generateMermaidErDiagram` | `function` | Yes | `(tables: array)` | `sync_value` | `tools/code-registry/scanner.mjs:scanRepositorySnapshot` | — | [tools/code-registry/backend-db-analyzer.mjs:L1956](../../../../tools/code-registry/backend-db-analyzer.mjs#L1956) |

## [tools/code-registry/cli.mjs](../../../../tools/code-registry/cli.mjs) (`module`)
- **Imports / Dependencies**: `../style-guide/lib.mjs`, `./compare-impact.mjs`, `./doc-generator.mjs`, `./scanner.mjs`, `./schema-validator.mjs`, `./schema-versions.mjs`, `node:child_process`, `node:fs`, `node:module`, `node:os`, `node:path`, `node:url`, `pg`
- **Top-Level Constants (6)**: `__filename`, `__dirname`, `DEFAULT_REPO_ROOT`, `PG_DEL_ACTION_MAP`, `PG_POL_CMD_MAP`, `TIER_LABELS`

| Symbol | Kind | Exported | Parameters (Observed Basis) | Returns / Throws | Confirmed Callers (Inferred in italics) | Contracts | Lines |
|---|---|---|---|---|---|---|---|
| `parseCliArgs` | `function` | No | `(argv: unknown)` | `sync_value` | `tools/code-registry/cli.mjs:main` | — | [tools/code-registry/cli.mjs:L47](../../../../tools/code-registry/cli.mjs#L47) |
| `normalizeDeclaredSqlType` | `function` | No | `(rawSqlType: unknown)` | `sync_value` | `tools/code-registry/cli.mjs:verifySchemaWithDisposablePostgres` | — | [tools/code-registry/cli.mjs:L73](../../../../tools/code-registry/cli.mjs#L73) |
| `normalizeLivePgColumnType` | `function` | No | `(dataType: unknown, udtName: unknown)` | `sync_value` | `tools/code-registry/cli.mjs:verifySchemaWithDisposablePostgres` | — | [tools/code-registry/cli.mjs:L109](../../../../tools/code-registry/cli.mjs#L109) |
| `verifySchemaWithDisposablePostgres` | `function` | No | `(repoRoot: unknown, snapshot: unknown, { mode }: object)` | `async -> promise` | `tools/code-registry/cli.mjs:main` | — | [tools/code-registry/cli.mjs:L132](../../../../tools/code-registry/cli.mjs#L132) |
| `readBaselineIdSet` | `function` | No | `(baselineObj: unknown)` | `sync_value` | `tools/code-registry/cli.mjs:main` | — | [tools/code-registry/cli.mjs:L426](../../../../tools/code-registry/cli.mjs#L426) |
| `validateContractsReferentialIntegrity` | `function` | No | `(snapshot: unknown, repoRoot: unknown)` | `sync_value` | `tools/code-registry/cli.mjs:main` | — | [tools/code-registry/cli.mjs:L438](../../../../tools/code-registry/cli.mjs#L438) |
| `validateContractsReferentialIntegrity>anon@L442C28` | `anonymous_function` | No | `(m: unknown)` | `sync_value` | — | — | [tools/code-registry/cli.mjs:L442](../../../../tools/code-registry/cli.mjs#L442) |
| `scoreMatchTier` | `function` | No | `(candidateLower: unknown, queryLower: unknown)` | `sync_value` | `tools/code-registry/cli.mjs:runLocateQuery`, `tools/code-registry/cli.mjs:runLocateQuery>anon@L534C50`, `tools/code-registry/cli.mjs:runLocateQuery>anon@L662C38` | — | [tools/code-registry/cli.mjs:L511](../../../../tools/code-registry/cli.mjs#L511) |
| `runLocateQuery` | `function` | No | `(snapshot: unknown, rawQuery: unknown, { exactOnly, kindFilter, full, limit, offset }: object)` | `sync_value` | `tools/code-registry/cli.mjs:main` | — | [tools/code-registry/cli.mjs:L522](../../../../tools/code-registry/cli.mjs#L522) |
| `runLocateQuery>allowKind` | `arrow_function` | No | `(k: unknown)` | `sync_value` | `tools/code-registry/cli.mjs:runLocateQuery` | — | [tools/code-registry/cli.mjs:L526](../../../../tools/code-registry/cli.mjs#L526) |
| `runLocateQuery>anon@L828C4` | `anonymous_function` | No | `(a: unknown, b: unknown)` | `sync_value` | — | — | [tools/code-registry/cli.mjs:L828](../../../../tools/code-registry/cli.mjs#L828) |
| `formatLocateHumanReadable` | `function` | No | `(res: unknown, { full }: object)` | `sync_value` | `tools/code-registry/cli.mjs:main` | — | [tools/code-registry/cli.mjs:L854](../../../../tools/code-registry/cli.mjs#L854) |
| `main` | `function` | No | `()` | `async -> promise` | `tools/code-registry/cli.mjs:<top_level>` | — | [tools/code-registry/cli.mjs:L935](../../../../tools/code-registry/cli.mjs#L935) |
| `main>anon@L1056C50` | `anonymous_function` | No | `(id: unknown)` | `sync_value` | — | — | [tools/code-registry/cli.mjs:L1056](../../../../tools/code-registry/cli.mjs#L1056) |
| `main>anon@L1098C48` | `anonymous_function` | No | `(id: unknown)` | `sync_value` | — | — | [tools/code-registry/cli.mjs:L1098](../../../../tools/code-registry/cli.mjs#L1098) |

## [tools/code-registry/compare-impact.mjs](../../../../tools/code-registry/compare-impact.mjs) (`module`)
- **Imports / Dependencies**: `./scanner.mjs`, `./schema-versions.mjs`, `node:child_process`, `node:fs`, `node:os`, `node:path`
- **Exports**: `scanGitRefSnapshot`, `resolveMergeBaseSha`, `loadGovernanceFilesFromRef`, `diffGovernanceState`, `compareRegistrySnapshots`, `formatImpactReportMarkdown`

| Symbol | Kind | Exported | Parameters (Observed Basis) | Returns / Throws | Confirmed Callers (Inferred in italics) | Contracts | Lines |
|---|---|---|---|---|---|---|---|
| `scanGitRefSnapshot` | `function` | Yes | `(repoRoot: unknown, gitRef: unknown)` | `sync_value` | `tools/code-registry/cli.mjs:main` | — | [tools/code-registry/compare-impact.mjs:L11](../../../../tools/code-registry/compare-impact.mjs#L11) |
| `resolveMergeBaseSha` | `function` | Yes | `(repoRoot: unknown, refA: unknown, refB: unknown)` | `sync_value` | `tools/code-registry/cli.mjs:main` | — | [tools/code-registry/compare-impact.mjs:L57](../../../../tools/code-registry/compare-impact.mjs#L57) |
| `loadGovernanceFilesFromRef` | `function` | Yes | `(repoRoot: unknown, gitRef: unknown)` | `sync_value` | `tools/code-registry/cli.mjs:main` | — | [tools/code-registry/compare-impact.mjs:L69](../../../../tools/code-registry/compare-impact.mjs#L69) |
| `loadGovernanceFilesFromRef>readGitJson` | `arrow_function` | No | `(relPosix: unknown)` | `sync_value` | `tools/code-registry/compare-impact.mjs:loadGovernanceFilesFromRef` | — | [tools/code-registry/compare-impact.mjs:L71](../../../../tools/code-registry/compare-impact.mjs#L71) |
| `diffGovernanceState` | `function` | Yes | `(baseGov: unknown, headGov: unknown)` | `sync_value` | `tools/code-registry/cli.mjs:main` | — | [tools/code-registry/compare-impact.mjs:L93](../../../../tools/code-registry/compare-impact.mjs#L93) |
| `diffGovernanceState>extractIds` | `arrow_function` | No | `(b: unknown)` | `sync_value` | `tools/code-registry/compare-impact.mjs:diffGovernanceState` | — | [tools/code-registry/compare-impact.mjs:L94](../../../../tools/code-registry/compare-impact.mjs#L94) |
| `buildSymbolIndex` | `function` | No | `(snapshot: unknown)` | `sync_value` | `tools/code-registry/compare-impact.mjs:compareRegistrySnapshots` | — | [tools/code-registry/compare-impact.mjs:L133](../../../../tools/code-registry/compare-impact.mjs#L133) |
| `buildConstantsIndex` | `function` | No | `(snapshot: unknown)` | `sync_value` | `tools/code-registry/compare-impact.mjs:compareRegistrySnapshots` | — | [tools/code-registry/compare-impact.mjs:L147](../../../../tools/code-registry/compare-impact.mjs#L147) |
| `buildUnresolvedShortCallLookup` | `function` | No | `(snapshot: unknown)` | `sync_value` | `tools/code-registry/compare-impact.mjs:compareRegistrySnapshots` | — | [tools/code-registry/compare-impact.mjs:L158](../../../../tools/code-registry/compare-impact.mjs#L158) |
| `normalizeSqlTypeForDiff` | `function` | No | `(raw: unknown)` | `sync_value` | `tools/code-registry/compare-impact.mjs:compareRegistrySnapshots` | — | [tools/code-registry/compare-impact.mjs:L172](../../../../tools/code-registry/compare-impact.mjs#L172) |
| `compareRegistrySnapshots` | `function` | Yes | `(baseSnap: unknown, headSnap: unknown, { mergeBaseSha, comparisonMode, governanceDiff }: object)` | `sync_value` | `tools/code-registry/cli.mjs:main` | — | [tools/code-registry/compare-impact.mjs:L184](../../../../tools/code-registry/compare-impact.mjs#L184) |
| `compareRegistrySnapshots>anon@L356C57` | `anonymous_function` | No | `(site: unknown)` | `sync_value` | — | — | [tools/code-registry/compare-impact.mjs:L356](../../../../tools/code-registry/compare-impact.mjs#L356) |
| `compareRegistrySnapshots>anon@L612C10` | `anonymous_function` | No | `(k: unknown)` | `sync_value` | — | — | [tools/code-registry/compare-impact.mjs:L612](../../../../tools/code-registry/compare-impact.mjs#L612) |
| `compareRegistrySnapshots>collectCustomEvents` | `arrow_function` | No | `(snap: unknown)` | `sync_value` | `tools/code-registry/compare-impact.mjs:compareRegistrySnapshots` | — | [tools/code-registry/compare-impact.mjs:L713](../../../../tools/code-registry/compare-impact.mjs#L713) |
| `formatImpactReportMarkdown` | `function` | Yes | `(impact: unknown)` | `sync_value` | `tools/code-registry/cli.mjs:main` | — | [tools/code-registry/compare-impact.mjs:L966](../../../../tools/code-registry/compare-impact.mjs#L966) |

## [tools/code-registry/doc-generator.mjs](../../../../tools/code-registry/doc-generator.mjs) (`module`)
- **Imports / Dependencies**: `./schema-versions.mjs`, `node:fs`, `node:path`
- **Exports**: `buildCompactRegistrySummary`, `renderSymbolIndexOverviewMarkdown`, `renderSymbolAreaCatalogMarkdown`, `renderContractsCatalogMarkdown`, `renderRouteInventoryMarkdown`, `renderFrontendInventoryMarkdown`, `renderSchemaInventoryMarkdown`, `renderDriftReportMarkdown`, `writeGeneratedDocs`
- **Top-Level Constants (1)**: `SYMBOL_GROUPS`

| Symbol | Kind | Exported | Parameters (Observed Basis) | Returns / Throws | Confirmed Callers (Inferred in italics) | Contracts | Lines |
|---|---|---|---|---|---|---|---|
| `relLinkFromGenerated` | `function` | No | `(repoPath: unknown, line: null_or_object, depthUp: number)` | `sync_value` | `tools/code-registry/doc-generator.mjs:renderContractsCatalogMarkdown`, `tools/code-registry/doc-generator.mjs:renderContractsCatalogMarkdown>anon@L273C76`, `tools/code-registry/doc-generator.mjs:renderFrontendInventoryMarkdown`, `tools/code-registry/doc-generator.mjs:renderRouteInventoryMarkdown` (+3) | — | [tools/code-registry/doc-generator.mjs:L12](../../../../tools/code-registry/doc-generator.mjs#L12) |
| `escapeMdCell` | `function` | No | `(val: unknown)` | `sync_value` | `tools/code-registry/doc-generator.mjs:renderContractsCatalogMarkdown`, `tools/code-registry/doc-generator.mjs:renderContractsCatalogMarkdown>anon@L262C66`, `tools/code-registry/doc-generator.mjs:renderContractsCatalogMarkdown>anon@L263C54`, `tools/code-registry/doc-generator.mjs:renderFrontendInventoryMarkdown` (+7) | — | [tools/code-registry/doc-generator.mjs:L18](../../../../tools/code-registry/doc-generator.mjs#L18) |
| `buildGeneratedBanner` | `function` | No | `(snapshot: unknown, title: unknown)` | `sync_value` | `tools/code-registry/doc-generator.mjs:renderContractsCatalogMarkdown`, `tools/code-registry/doc-generator.mjs:renderDriftReportMarkdown`, `tools/code-registry/doc-generator.mjs:renderFrontendInventoryMarkdown`, `tools/code-registry/doc-generator.mjs:renderRouteInventoryMarkdown` (+3) | — | [tools/code-registry/doc-generator.mjs:L25](../../../../tools/code-registry/doc-generator.mjs#L25) |
| `buildCompactRegistrySummary` | `function` | Yes | `(snapshot: unknown)` | `sync_value` | `tools/code-registry/doc-generator.mjs:writeGeneratedDocs` | — | [tools/code-registry/doc-generator.mjs:L40](../../../../tools/code-registry/doc-generator.mjs#L40) |
| `buildCompactRegistrySummary>anon@L53C37` | `anonymous_function` | No | `(m: unknown)` | `sync_value` | — | — | [tools/code-registry/doc-generator.mjs:L53](../../../../tools/code-registry/doc-generator.mjs#L53) |
| `buildCompactRegistrySummary>anon@L60C40` | `anonymous_function` | No | `(r: unknown)` | `sync_value` | — | — | [tools/code-registry/doc-generator.mjs:L60](../../../../tools/code-registry/doc-generator.mjs#L60) |
| `buildCompactRegistrySummary>anon@L76C60` | `anonymous_function` | No | `(c: unknown)` | `sync_value` | — | — | [tools/code-registry/doc-generator.mjs:L76](../../../../tools/code-registry/doc-generator.mjs#L76) |
| `buildCompactRegistrySummary>anon@L84C50` | `anonymous_function` | No | `(t: unknown)` | `sync_value` | — | — | [tools/code-registry/doc-generator.mjs:L84](../../../../tools/code-registry/doc-generator.mjs#L84) |
| `buildCompactRegistrySummary>anon@L94C61` | `anonymous_function` | No | `(f: unknown)` | `sync_value` | — | — | [tools/code-registry/doc-generator.mjs:L94](../../../../tools/code-registry/doc-generator.mjs#L94) |
| `match` | `object_method` | No | `(f: unknown)` | `sync_value` | — | — | [tools/code-registry/doc-generator.mjs:L113](../../../../tools/code-registry/doc-generator.mjs#L113) |
| `match@L118C11` | `object_method` | No | `(f: unknown)` | `sync_value` | — | — | [tools/code-registry/doc-generator.mjs:L118](../../../../tools/code-registry/doc-generator.mjs#L118) |
| `match@L123C11` | `object_method` | No | `(f: unknown)` | `sync_value` | — | — | [tools/code-registry/doc-generator.mjs:L123](../../../../tools/code-registry/doc-generator.mjs#L123) |
| `match@L128C11` | `object_method` | No | `(f: unknown)` | `sync_value` | — | — | [tools/code-registry/doc-generator.mjs:L128](../../../../tools/code-registry/doc-generator.mjs#L128) |
| `match@L133C11` | `object_method` | No | `(f: unknown)` | `sync_value` | — | — | [tools/code-registry/doc-generator.mjs:L133](../../../../tools/code-registry/doc-generator.mjs#L133) |
| `renderSymbolIndexOverviewMarkdown` | `function` | Yes | `(snapshot: unknown)` | `sync_value` | `tools/code-registry/doc-generator.mjs:writeGeneratedDocs` | — | [tools/code-registry/doc-generator.mjs:L137](../../../../tools/code-registry/doc-generator.mjs#L137) |
| `renderSymbolAreaCatalogMarkdown` | `function` | Yes | `(snapshot: unknown, grp: unknown)` | `sync_value` | `tools/code-registry/doc-generator.mjs:writeGeneratedDocs>anon@L605C25` | — | [tools/code-registry/doc-generator.mjs:L191](../../../../tools/code-registry/doc-generator.mjs#L191) |
| `renderContractsCatalogMarkdown` | `function` | Yes | `(snapshot: unknown)` | `sync_value` | `tools/code-registry/doc-generator.mjs:writeGeneratedDocs` | — | [tools/code-registry/doc-generator.mjs:L251](../../../../tools/code-registry/doc-generator.mjs#L251) |
| `renderRouteInventoryMarkdown` | `function` | Yes | `(snapshot: unknown)` | `sync_value` | `tools/code-registry/doc-generator.mjs:writeGeneratedDocs` | — | [tools/code-registry/doc-generator.mjs:L302](../../../../tools/code-registry/doc-generator.mjs#L302) |
| `renderFrontendInventoryMarkdown` | `function` | Yes | `(snapshot: unknown)` | `sync_value` | `tools/code-registry/doc-generator.mjs:writeGeneratedDocs` | — | [tools/code-registry/doc-generator.mjs:L354](../../../../tools/code-registry/doc-generator.mjs#L354) |
| `renderSchemaInventoryMarkdown` | `function` | Yes | `(snapshot: unknown)` | `sync_value` | `tools/code-registry/doc-generator.mjs:writeGeneratedDocs` | — | [tools/code-registry/doc-generator.mjs:L451](../../../../tools/code-registry/doc-generator.mjs#L451) |
| `renderDriftReportMarkdown` | `function` | Yes | `(snapshot: unknown)` | `sync_value` | `tools/code-registry/doc-generator.mjs:writeGeneratedDocs` | — | [tools/code-registry/doc-generator.mjs:L542](../../../../tools/code-registry/doc-generator.mjs#L542) |
| `writeGeneratedDocs` | `function` | Yes | `(rootDir: unknown, snapshot: unknown)` | `sync_value` | `tools/code-registry/cli.mjs:main` | — | [tools/code-registry/doc-generator.mjs:L586](../../../../tools/code-registry/doc-generator.mjs#L586) |

## [tools/code-registry/drift-detector.mjs](../../../../tools/code-registry/drift-detector.mjs) (`module`)
- **Imports / Dependencies**: `./schema-versions.mjs`, `node:path`
- **Exports**: `makeStableFindingId`, `applyScopedSuppressions`, `validateMarkdownLinks`, `detectRepositoryDrift`
- **Top-Level Constants (2)**: `BUILTIN_BROWSER_OR_DOM_IDENTIFIERS`, `RUNTIME_ONLY_NODE_ENV_ALLOWLIST`

| Symbol | Kind | Exported | Parameters (Observed Basis) | Returns / Throws | Confirmed Callers (Inferred in italics) | Contracts | Lines |
|---|---|---|---|---|---|---|---|
| `makeStableFindingId` | `function` | Yes | `(category: unknown, primaryKey: unknown)` | `sync_value` | `tools/code-registry/drift-detector.mjs:detectRepositoryDrift`, `tools/code-registry/drift-detector.mjs:detectRepositoryDrift>dfs` | — | [tools/code-registry/drift-detector.mjs:L54](../../../../tools/code-registry/drift-detector.mjs#L54) |
| `applyScopedSuppressions` | `function` | Yes | `(findings: unknown, suppressions: array)` | `sync_value` | `tools/code-registry/drift-detector.mjs:detectRepositoryDrift` | — | [tools/code-registry/drift-detector.mjs:L62](../../../../tools/code-registry/drift-detector.mjs#L62) |
| `applyScopedSuppressions>anon@L66C33` | `anonymous_function` | No | `(f: unknown)` | `sync_value` | — | — | [tools/code-registry/drift-detector.mjs:L66](../../../../tools/code-registry/drift-detector.mjs#L66) |
| `applyScopedSuppressions>anon@L66C33>anon@L67C42` | `anonymous_function` | No | `(s: unknown)` | `sync_value` | — | — | [tools/code-registry/drift-detector.mjs:L67](../../../../tools/code-registry/drift-detector.mjs#L67) |
| `validateMarkdownLinks` | `function` | Yes | `({ markdownFilesByPath, allRepoPathsSet }: object)` | `sync_value` | `tools/code-registry/drift-detector.mjs:detectRepositoryDrift` | — | [tools/code-registry/drift-detector.mjs:L90](../../../../tools/code-registry/drift-detector.mjs#L90) |
| `detectRepositoryDrift` | `function` | Yes | `({ commitSha, jsAnalyses, htmlAnalyses, cssAnalyses, routes, featureContract, schemaInfo, documentedConfigKeys, markdownFilesByPath, allRepoPathsSet, suppressions }: object)` | `sync_value` | `tools/code-registry/scanner.mjs:scanRepositorySnapshot` | — | [tools/code-registry/drift-detector.mjs:L138](../../../../tools/code-registry/drift-detector.mjs#L138) |
| `detectRepositoryDrift>anon@L238C11` | `anonymous_function` | No | `(s: unknown)` | `sync_value` | — | — | [tools/code-registry/drift-detector.mjs:L238](../../../../tools/code-registry/drift-detector.mjs#L238) |
| `detectRepositoryDrift>dfs` | `function` | No | `(u: unknown)` | `void_or_implicit` | `tools/code-registry/drift-detector.mjs:detectRepositoryDrift` | — | [tools/code-registry/drift-detector.mjs:L496](../../../../tools/code-registry/drift-detector.mjs#L496) |

## [tools/code-registry/html-css-analyzer.mjs](../../../../tools/code-registry/html-css-analyzer.mjs) (`module`)
- **Imports / Dependencies**: `./js-analyzer.mjs`, `./schema-versions.mjs`
- **Exports**: `analyzeHtmlFile`, `analyzeCssFile`

| Symbol | Kind | Exported | Parameters (Observed Basis) | Returns / Throws | Confirmed Callers (Inferred in italics) | Contracts | Lines |
|---|---|---|---|---|---|---|---|
| `stripCommentsPreservingNewlines` | `function` | No | `(text: unknown, openDelim: unknown, closeDelim: unknown)` | `sync_value` | `tools/code-registry/html-css-analyzer.mjs:analyzeCssFile`, `tools/code-registry/html-css-analyzer.mjs:analyzeHtmlFile` | — | [tools/code-registry/html-css-analyzer.mjs:L7](../../../../tools/code-registry/html-css-analyzer.mjs#L7) |
| `buildLineOffsets` | `function` | No | `(text: unknown)` | `sync_value` | `tools/code-registry/html-css-analyzer.mjs:analyzeCssFile`, `tools/code-registry/html-css-analyzer.mjs:analyzeHtmlFile` | — | [tools/code-registry/html-css-analyzer.mjs:L25](../../../../tools/code-registry/html-css-analyzer.mjs#L25) |
| `lineAtIndex` | `function` | No | `(lineOffsets: unknown, index: unknown)` | `sync_value` | `tools/code-registry/html-css-analyzer.mjs:analyzeCssFile`, `tools/code-registry/html-css-analyzer.mjs:analyzeHtmlFile`, `tools/code-registry/html-css-analyzer.mjs:analyzeHtmlFile>anon@L65C4` | — | [tools/code-registry/html-css-analyzer.mjs:L33](../../../../tools/code-registry/html-css-analyzer.mjs#L33) |
| `parseAttributes` | `function` | No | `(attrText: unknown)` | `sync_value` | `tools/code-registry/html-css-analyzer.mjs:analyzeHtmlFile`, `tools/code-registry/html-css-analyzer.mjs:analyzeHtmlFile>anon@L65C4` | — | [tools/code-registry/html-css-analyzer.mjs:L44](../../../../tools/code-registry/html-css-analyzer.mjs#L44) |
| `analyzeHtmlFile` | `function` | Yes | `(source: unknown, relPath: unknown)` | `sync_value` | `tools/code-registry/scanner.mjs:scanRepositorySnapshot` | — | [tools/code-registry/html-css-analyzer.mjs:L56](../../../../tools/code-registry/html-css-analyzer.mjs#L56) |
| `analyzeHtmlFile>anon@L65C4` | `anonymous_function` | No | `(full: unknown, openTag: unknown, body: unknown, closeTag: unknown, offset: unknown)` | `sync_value` | — | — | [tools/code-registry/html-css-analyzer.mjs:L65](../../../../tools/code-registry/html-css-analyzer.mjs#L65) |
| `analyzeCssFile` | `function` | Yes | `(source: unknown, relPath: unknown)` | `sync_value` | `tools/code-registry/scanner.mjs:scanRepositorySnapshot` | — | [tools/code-registry/html-css-analyzer.mjs:L228](../../../../tools/code-registry/html-css-analyzer.mjs#L228) |

## [tools/code-registry/js-analyzer.mjs](../../../../tools/code-registry/js-analyzer.mjs) (`module`)
- **Imports / Dependencies**: `./schema-versions.mjs`, `./vendor/acorn/acorn.mjs`, `node:crypto`
- **Exports**: `parseJavaScriptSource`, `computeAstNodeFingerprint`, `analyzeJavaScriptFile`, `extractCalledIdentifiersInInlineHandler`

| Symbol | Kind | Exported | Parameters (Observed Basis) | Returns / Throws | Confirmed Callers (Inferred in italics) | Contracts | Lines |
|---|---|---|---|---|---|---|---|
| `stripShebangPreservingLines` | `function` | No | `(source: unknown)` | `sync_value` | `tools/code-registry/js-analyzer.mjs:parseJavaScriptSource` | — | [tools/code-registry/js-analyzer.mjs:L12](../../../../tools/code-registry/js-analyzer.mjs#L12) |
| `parseJavaScriptSource` | `function` | Yes | `(source: unknown, { filePath, preferScript }: object)` | `sync_value` | `tools/code-registry/backend-db-analyzer.mjs:extractAgePolicyAllowlist`, `tools/code-registry/backend-db-analyzer.mjs:extractBackendRoutes`, `tools/code-registry/backend-db-analyzer.mjs:extractBackendRoutes>anon@L884C32`, `tools/code-registry/backend-db-analyzer.mjs:extractDiagnosticsContract` (+3) | — | [tools/code-registry/js-analyzer.mjs:L21](../../../../tools/code-registry/js-analyzer.mjs#L21) |
| `unwrapObjectFreeze` | `function` | No | `(node: unknown)` | `sync_value` | `tools/code-registry/js-analyzer.mjs:analyzeJavaScriptFile>anon@L450C19`, `tools/code-registry/js-analyzer.mjs:analyzeJavaScriptFile>anon@L587C19` | — | [tools/code-registry/js-analyzer.mjs:L54](../../../../tools/code-registry/js-analyzer.mjs#L54) |
| `computeAstNodeFingerprint` | `function` | Yes | `(rootNode: unknown)` | `sync_value` | `tools/code-registry/js-analyzer.mjs:analyzeJavaScriptFile>anon@L450C19`, `tools/code-registry/js-analyzer.mjs:analyzeJavaScriptFile>anon@L587C19` | — | [tools/code-registry/js-analyzer.mjs:L72](../../../../tools/code-registry/js-analyzer.mjs#L72) |
| `computeAstNodeFingerprint>visit` | `function` | No | `(n: unknown)` | `void_or_implicit` | `tools/code-registry/js-analyzer.mjs:computeAstNodeFingerprint` | — | [tools/code-registry/js-analyzer.mjs:L76](../../../../tools/code-registry/js-analyzer.mjs#L76) |
| `computeBodyLiteralsFingerprint` | `function` | No | `(bodyNode: unknown)` | `sync_value` | `tools/code-registry/js-analyzer.mjs:analyzeJavaScriptFile>anon@L587C19` | — | [tools/code-registry/js-analyzer.mjs:L130](../../../../tools/code-registry/js-analyzer.mjs#L130) |
| `computeBodyLiteralsFingerprint>walkNoNestedFn` | `function` | No | `(n: unknown, isRoot: boolean)` | `void_or_implicit` | `tools/code-registry/js-analyzer.mjs:computeBodyLiteralsFingerprint`, `tools/code-registry/js-analyzer.mjs:computeBodyLiteralsFingerprint>walkNoNestedFn>anon@L151C38` | — | [tools/code-registry/js-analyzer.mjs:L133](../../../../tools/code-registry/js-analyzer.mjs#L133) |
| `collectPatternIdentifiers` | `function` | No | `(pat: unknown, out: array)` | `sync_value` | `tools/code-registry/js-analyzer.mjs:analyzeJavaScriptFile>anon@L450C19` | — | [tools/code-registry/js-analyzer.mjs:L159](../../../../tools/code-registry/js-analyzer.mjs#L159) |
| `formatParamNode` | `function` | No | `(param: unknown)` | `sync_value` | — | — | [tools/code-registry/js-analyzer.mjs:L180](../../../../tools/code-registry/js-analyzer.mjs#L180) |
| `getMemberChain` | `function` | No | `(node: unknown)` | `sync_value` | `tools/code-registry/js-analyzer.mjs:analyzeJavaScriptFile>anon@L1507C19`, `tools/code-registry/js-analyzer.mjs:analyzeJavaScriptFile>anon@L587C19`, `tools/code-registry/js-analyzer.mjs:analyzeJavaScriptFile>anon@L587C19>anon@L726C19`, `tools/code-registry/js-analyzer.mjs:analyzeJavaScriptFile>anon@L587C19>anon@L783C33` (+1) | — | [tools/code-registry/js-analyzer.mjs:L237](../../../../tools/code-registry/js-analyzer.mjs#L237) |
| `getStaticStringValue` | `function` | No | `(node: unknown)` | `sync_value` | `tools/code-registry/js-analyzer.mjs:analyzeJavaScriptFile>anon@L1501C19`, `tools/code-registry/js-analyzer.mjs:analyzeJavaScriptFile>anon@L450C19`, `tools/code-registry/js-analyzer.mjs:analyzeJavaScriptFile>anon@L587C19`, `tools/code-registry/js-analyzer.mjs:analyzeJavaScriptFile>anon@L587C19>evalUrlCandidates` (+1) | — | [tools/code-registry/js-analyzer.mjs:L249](../../../../tools/code-registry/js-analyzer.mjs#L249) |
| `getPartialTemplatePrefix` | `function` | No | `(node: unknown)` | `sync_value` | `tools/code-registry/js-analyzer.mjs:analyzeJavaScriptFile>anon@L587C19`, `tools/code-registry/js-analyzer.mjs:analyzeJavaScriptFile>anon@L587C19>evalUrlCandidates` | — | [tools/code-registry/js-analyzer.mjs:L258](../../../../tools/code-registry/js-analyzer.mjs#L258) |
| `extractDynamicMarkupIdsAndAttrs` | `function` | No | `(str: unknown, relPath: unknown, line: unknown)` | `sync_value` | `tools/code-registry/js-analyzer.mjs:analyzeJavaScriptFile>anon@L587C19` | — | [tools/code-registry/js-analyzer.mjs:L278](../../../../tools/code-registry/js-analyzer.mjs#L278) |
| `collectAllStringFragments` | `function` | No | `(node: unknown, out: array)` | `sync_value` | `tools/code-registry/js-analyzer.mjs:analyzeJavaScriptFile>anon@L587C19` | — | [tools/code-registry/js-analyzer.mjs:L293](../../../../tools/code-registry/js-analyzer.mjs#L293) |
| `walkAst` | `function` | No | `(node: unknown, ancestors: unknown, visitor: unknown)` | `void_or_implicit` | `tools/code-registry/js-analyzer.mjs:analyzeJavaScriptFile`, `tools/code-registry/js-analyzer.mjs:analyzeJavaScriptFile>anon@L587C19`, `tools/code-registry/js-analyzer.mjs:extractCalledIdentifiersInInlineHandler` | — | [tools/code-registry/js-analyzer.mjs:L322](../../../../tools/code-registry/js-analyzer.mjs#L322) |
| `isFunctionNode` | `function` | No | `(n: unknown)` | `sync_value` | `tools/code-registry/js-analyzer.mjs:analyzeJavaScriptFile>anon@L450C19`, `tools/code-registry/js-analyzer.mjs:analyzeJavaScriptFile>anon@L587C19`, `tools/code-registry/js-analyzer.mjs:enclosingFunctionInfo` | — | [tools/code-registry/js-analyzer.mjs:L341](../../../../tools/code-registry/js-analyzer.mjs#L341) |
| `isTopLevelIifeNode` | `function` | No | `(fnNode: unknown, ancestors: unknown)` | `sync_value` | `tools/code-registry/js-analyzer.mjs:analyzeJavaScriptFile>anon@L450C19` | — | [tools/code-registry/js-analyzer.mjs:L349](../../../../tools/code-registry/js-analyzer.mjs#L349) |
| `enclosingFunctionInfo` | `function` | No | `(ancestors: unknown, relPath: unknown)` | `sync_value` | `tools/code-registry/js-analyzer.mjs:analyzeJavaScriptFile>anon@L587C19` | — | [tools/code-registry/js-analyzer.mjs:L360](../../../../tools/code-registry/js-analyzer.mjs#L360) |
| `isTopLevelScope` | `function` | No | `(ancestors: unknown)` | `sync_value` | `tools/code-registry/js-analyzer.mjs:analyzeJavaScriptFile>anon@L450C19`, `tools/code-registry/js-analyzer.mjs:analyzeJavaScriptFile>anon@L587C19` | — | [tools/code-registry/js-analyzer.mjs:L378](../../../../tools/code-registry/js-analyzer.mjs#L378) |
| `isDirectTopIifeScope` | `function` | No | `(ancestors: unknown)` | `sync_value` | `tools/code-registry/js-analyzer.mjs:analyzeJavaScriptFile>anon@L587C19` | — | [tools/code-registry/js-analyzer.mjs:L382](../../../../tools/code-registry/js-analyzer.mjs#L382) |
| `analyzeJavaScriptFile` | `function` | Yes | `(source: unknown, relPath: unknown)` | `sync_value` | `tools/code-registry/html-css-analyzer.mjs:analyzeHtmlFile>anon@L208C49`, `tools/code-registry/scanner.mjs:scanRepositorySnapshot` | — | [tools/code-registry/js-analyzer.mjs:L387](../../../../tools/code-registry/js-analyzer.mjs#L387) |
| `analyzeJavaScriptFile>anon@L450C19` | `anonymous_function` | No | `(n: unknown, anc: unknown)` | `void_or_implicit` | — | — | [tools/code-registry/js-analyzer.mjs:L450](../../../../tools/code-registry/js-analyzer.mjs#L450) |
| `analyzeJavaScriptFile>isGlobalRootObject` | `function` | No | `(objName: unknown)` | `sync_value` | `tools/code-registry/js-analyzer.mjs:analyzeJavaScriptFile>anon@L587C19`, `tools/code-registry/js-analyzer.mjs:analyzeJavaScriptFile>anon@L587C19>anon@L726C19` | — | [tools/code-registry/js-analyzer.mjs:L582](../../../../tools/code-registry/js-analyzer.mjs#L582) |
| `analyzeJavaScriptFile>anon@L587C19` | `anonymous_function` | No | `(node: unknown, ancestors: unknown)` | `void_or_implicit` | — | — | [tools/code-registry/js-analyzer.mjs:L587](../../../../tools/code-registry/js-analyzer.mjs#L587) |
| `analyzeJavaScriptFile>anon@L587C19>anon@L597C53` | `anonymous_function` | No | `(s: unknown)` | `sync_value` | — | — | [tools/code-registry/js-analyzer.mjs:L597](../../../../tools/code-registry/js-analyzer.mjs#L597) |
| `analyzeJavaScriptFile>anon@L587C19>anon@L726C19` | `anonymous_function` | No | `()` | `sync_value` | — | — | [tools/code-registry/js-analyzer.mjs:L726](../../../../tools/code-registry/js-analyzer.mjs#L726) |
| `analyzeJavaScriptFile>anon@L587C19>anon@L783C33` | `anonymous_function` | No | `(inner: unknown, innerAnc: unknown)` | `void_or_implicit` | — | — | [tools/code-registry/js-analyzer.mjs:L783](../../../../tools/code-registry/js-analyzer.mjs#L783) |
| `analyzeJavaScriptFile>anon@L587C19>evalUrlCandidates` | `arrow_function` | No | `(uNode: unknown, depth: number)` | `sync_value` | `tools/code-registry/js-analyzer.mjs:analyzeJavaScriptFile>anon@L587C19` | — | [tools/code-registry/js-analyzer.mjs:L1232](../../../../tools/code-registry/js-analyzer.mjs#L1232) |
| `analyzeJavaScriptFile>anon@L1501C19` | `anonymous_function` | No | `(node: unknown)` | `void_or_implicit` | — | — | [tools/code-registry/js-analyzer.mjs:L1501](../../../../tools/code-registry/js-analyzer.mjs#L1501) |
| `analyzeJavaScriptFile>anon@L1507C19` | `anonymous_function` | No | `(node: unknown)` | `void_or_implicit` | — | — | [tools/code-registry/js-analyzer.mjs:L1507](../../../../tools/code-registry/js-analyzer.mjs#L1507) |
| `extractCalledIdentifiersInInlineHandler` | `function` | Yes | `(exprSource: unknown)` | `sync_value` | `tools/code-registry/html-css-analyzer.mjs:analyzeHtmlFile` | — | [tools/code-registry/js-analyzer.mjs:L1566](../../../../tools/code-registry/js-analyzer.mjs#L1566) |
| `extractCalledIdentifiersInInlineHandler>anon@L1572C26` | `anonymous_function` | No | `(node: unknown)` | `void_or_implicit` | — | — | [tools/code-registry/js-analyzer.mjs:L1572](../../../../tools/code-registry/js-analyzer.mjs#L1572) |

## [tools/code-registry/relationship-resolver.mjs](../../../../tools/code-registry/relationship-resolver.mjs) (`module`)
- **Imports / Dependencies**: `./schema-versions.mjs`, `node:path`
- **Exports**: `resolveSymbolRelationships`
- **Top-Level Constants (1)**: `BUILTIN_GLOBALS_AND_METHODS`

| Symbol | Kind | Exported | Parameters (Observed Basis) | Returns / Throws | Confirmed Callers (Inferred in italics) | Contracts | Lines |
|---|---|---|---|---|---|---|---|
| `resolveImportTargetPath` | `function` | No | `(fromFile: unknown, rawSource: unknown, jsByPath: unknown)` | `sync_value` | `tools/code-registry/relationship-resolver.mjs:resolveSymbolRelationships` | — | [tools/code-registry/relationship-resolver.mjs:L91](../../../../tools/code-registry/relationship-resolver.mjs#L91) |
| `resolveSymbolRelationships` | `function` | Yes | `({ jsAnalyses, htmlAnalyses }: object)` | `sync_value` | `tools/code-registry/scanner.mjs:scanRepositorySnapshot` | — | [tools/code-registry/relationship-resolver.mjs:L106](../../../../tools/code-registry/relationship-resolver.mjs#L106) |
| `resolveSymbolRelationships>anon@L171C11` | `anonymous_function` | No | `(s: unknown)` | `sync_value` | — | — | [tools/code-registry/relationship-resolver.mjs:L171](../../../../tools/code-registry/relationship-resolver.mjs#L171) |
| `resolveSymbolRelationships>registerDef` | `arrow_function` | No | `(gName: unknown, symId: unknown, file: unknown, kind: unknown, line: unknown)` | `void_or_implicit` | `tools/code-registry/relationship-resolver.mjs:resolveSymbolRelationships` | — | [tools/code-registry/relationship-resolver.mjs:L179](../../../../tools/code-registry/relationship-resolver.mjs#L179) |
| `resolveSymbolRelationships>addSetEntry` | `arrow_function` | No | `(map: unknown, key: unknown, val: unknown)` | `void_or_implicit` | `tools/code-registry/relationship-resolver.mjs:resolveSymbolRelationships` | — | [tools/code-registry/relationship-resolver.mjs:L297](../../../../tools/code-registry/relationship-resolver.mjs#L297) |

## [tools/code-registry/scanner.mjs](../../../../tools/code-registry/scanner.mjs) (`module`)
- **Imports / Dependencies**: `./backend-db-analyzer.mjs`, `./drift-detector.mjs`, `./html-css-analyzer.mjs`, `./js-analyzer.mjs`, `./relationship-resolver.mjs`, `./schema-versions.mjs`, `node:fs`, `node:path`
- **Exports**: `CANONICAL_GENERATED_DOC_PATHS`, `scanRepositorySnapshot`
- **Top-Level Constants (1)**: `CANONICAL_GENERATED_DOC_PATHS` *(exported)*

| Symbol | Kind | Exported | Parameters (Observed Basis) | Returns / Throws | Confirmed Callers (Inferred in italics) | Contracts | Lines |
|---|---|---|---|---|---|---|---|
| `scanRepositorySnapshot` | `function` | Yes | `(rootDir: unknown, { overrideRef, overrideSha, includeTimestamp, suppressionsPath, configContractPath, sharedContractsPath, routeOverridesPath }: object)` | `sync_value` | `tools/code-registry/cli.mjs:main`, `tools/code-registry/compare-impact.mjs:scanGitRefSnapshot` | — | [tools/code-registry/scanner.mjs:L46](../../../../tools/code-registry/scanner.mjs#L46) |
| `scanRepositorySnapshot>walkAllSafePaths` | `arrow_function` | No | `(dir: unknown, relBase: unknown)` | `void_or_implicit` | `tools/code-registry/scanner.mjs:scanRepositorySnapshot` | — | [tools/code-registry/scanner.mjs:L72](../../../../tools/code-registry/scanner.mjs#L72) |
| `scanRepositorySnapshot>anon@L327C9` | `anonymous_function` | No | `(r: unknown)` | `sync_value` | — | — | [tools/code-registry/scanner.mjs:L327](../../../../tools/code-registry/scanner.mjs#L327) |

## [tools/code-registry/schema-validator.mjs](../../../../tools/code-registry/schema-validator.mjs) (`module`)
- **Exports**: `validateAgainstJsonSchema`, `validateJsonWithSchemaFile`

## [tools/code-registry/schema-versions.mjs](../../../../tools/code-registry/schema-versions.mjs) (`module`)
- **Imports / Dependencies**: `node:child_process`, `node:crypto`, `node:fs`, `node:path`
- **Exports**: `GENERATOR_NAME`, `GENERATOR_VERSION`, `REGISTRY_SCHEMA_VERSION`, `SUMMARY_SCHEMA_VERSION`, `IMPACT_SCHEMA_VERSION`, `DRIFT_BASELINE_SCHEMA_VERSION`, `SUPPRESSIONS_SCHEMA_VERSION`, `CONTRACTS_SCHEMA_VERSION`, `ROUTE_OVERRIDES_SCHEMA_VERSION`, `REPOSITORY_CANONICAL_URL`, `HIGH_CONFIDENCE_BLOCKING_DRIFT_CATEGORIES`, `DEFAULT_INCLUDED_ROOTS`, `EXPLICIT_EXCLUSION_RULES`, `asciiCompare`, `sha256Text`, `toPosixPath`, `classifyPathExclusion`, `isBinaryAssetPath`, `collectWorkspaceFiles`, `resolveGitProvenance`, `sortObjectKeysDeep`, `deterministicStringify`, `computePayloadDigest`, `computeGovernanceDigest`
- **Top-Level Constants (13)**: `GENERATOR_NAME` *(exported)*, `GENERATOR_VERSION` *(exported)*, `REGISTRY_SCHEMA_VERSION` *(exported)*, `SUMMARY_SCHEMA_VERSION` *(exported)*, `IMPACT_SCHEMA_VERSION` *(exported)*, `DRIFT_BASELINE_SCHEMA_VERSION` *(exported)*, `SUPPRESSIONS_SCHEMA_VERSION` *(exported)*, `CONTRACTS_SCHEMA_VERSION` *(exported)*, `ROUTE_OVERRIDES_SCHEMA_VERSION` *(exported)*, `REPOSITORY_CANONICAL_URL` *(exported)*, `HIGH_CONFIDENCE_BLOCKING_DRIFT_CATEGORIES` *(exported)*, `DEFAULT_INCLUDED_ROOTS` *(exported)*, `EXPLICIT_EXCLUSION_RULES` *(exported)*

| Symbol | Kind | Exported | Parameters (Observed Basis) | Returns / Throws | Confirmed Callers (Inferred in italics) | Contracts | Lines |
|---|---|---|---|---|---|---|---|
| `asciiCompare` | `function` | Yes | `(a: unknown, b: unknown)` | `sync_value` | `tools/code-registry/backend-db-analyzer.mjs:analyzeMigrationsAndSchema>anon@L1696C52`, `tools/code-registry/backend-db-analyzer.mjs:analyzeMigrationsAndSchema>anon@L1943C46`, `tools/code-registry/backend-db-analyzer.mjs:analyzeMigrationsAndSchema>anon@L1949C22`, `tools/code-registry/backend-db-analyzer.mjs:analyzeMigrationsAndSchema>anon@L1950C37` (+17) | — | [tools/code-registry/schema-versions.mjs:L87](../../../../tools/code-registry/schema-versions.mjs#L87) |
| `sha256Text` | `function` | Yes | `(text: unknown)` | `sync_value` | `tools/code-registry/scanner.mjs:scanRepositorySnapshot` | — | [tools/code-registry/schema-versions.mjs:L93](../../../../tools/code-registry/schema-versions.mjs#L93) |
| `toPosixPath` | `function` | Yes | `(relPath: unknown)` | `sync_value` | `tools/code-registry/drift-detector.mjs:detectRepositoryDrift`, `tools/code-registry/drift-detector.mjs:detectRepositoryDrift>anon@L197C9`, `tools/code-registry/drift-detector.mjs:detectRepositoryDrift>anon@L238C11`, `tools/code-registry/drift-detector.mjs:validateMarkdownLinks` (+3) | — | [tools/code-registry/schema-versions.mjs:L97](../../../../tools/code-registry/schema-versions.mjs#L97) |
| `classifyPathExclusion` | `function` | Yes | `(relPosix: unknown)` | `sync_value` | `tools/code-registry/schema-versions.mjs:collectWorkspaceFiles`, `tools/code-registry/schema-versions.mjs:collectWorkspaceFiles>walk` | — | [tools/code-registry/schema-versions.mjs:L101](../../../../tools/code-registry/schema-versions.mjs#L101) |
| `isBinaryAssetPath` | `function` | Yes | `(relPosix: unknown)` | `sync_value` | `tools/code-registry/schema-versions.mjs:collectWorkspaceFiles>walk` | — | [tools/code-registry/schema-versions.mjs:L142](../../../../tools/code-registry/schema-versions.mjs#L142) |
| `collectWorkspaceFiles` | `function` | Yes | `(rootDir: unknown, { customRoots }: object)` | `sync_value` | `tools/code-registry/scanner.mjs:scanRepositorySnapshot` | — | [tools/code-registry/schema-versions.mjs:L146](../../../../tools/code-registry/schema-versions.mjs#L146) |
| `collectWorkspaceFiles>walk` | `function` | No | `(absCurrent: unknown, relCurrent: unknown)` | `void_or_implicit` | `tools/code-registry/schema-versions.mjs:collectWorkspaceFiles` | — | [tools/code-registry/schema-versions.mjs:L153](../../../../tools/code-registry/schema-versions.mjs#L153) |
| `resolveGitProvenance` | `function` | Yes | `(rootDir: unknown, { overrideRef, overrideSha }: object)` | `sync_value` | `tools/code-registry/scanner.mjs:scanRepositorySnapshot` | — | [tools/code-registry/schema-versions.mjs:L232](../../../../tools/code-registry/schema-versions.mjs#L232) |
| `sortObjectKeysDeep` | `function` | Yes | `(value: unknown)` | `sync_value` | `tools/code-registry/schema-versions.mjs:deterministicStringify` | — | [tools/code-registry/schema-versions.mjs:L288](../../../../tools/code-registry/schema-versions.mjs#L288) |
| `deterministicStringify` | `function` | Yes | `(payload: unknown, pretty: boolean)` | `sync_value` | `tools/code-registry/cli.mjs:main`, `tools/code-registry/doc-generator.mjs:writeGeneratedDocs`, `tools/code-registry/schema-versions.mjs:computeGovernanceDigest`, `tools/code-registry/schema-versions.mjs:computePayloadDigest` | — | [tools/code-registry/schema-versions.mjs:L304](../../../../tools/code-registry/schema-versions.mjs#L304) |
| `computePayloadDigest` | `function` | Yes | `(payload: unknown)` | `sync_value` | `tools/code-registry/scanner.mjs:scanRepositorySnapshot` | — | [tools/code-registry/schema-versions.mjs:L321](../../../../tools/code-registry/schema-versions.mjs#L321) |
| `computePayloadDigest>anon@L333C8` | `anonymous_function` | No | `(e: unknown)` | `sync_value` | — | — | [tools/code-registry/schema-versions.mjs:L333](../../../../tools/code-registry/schema-versions.mjs#L333) |
| `computePayloadDigest>anon@L347C48` | `anonymous_function` | No | `(f: unknown)` | `sync_value` | — | — | [tools/code-registry/schema-versions.mjs:L347](../../../../tools/code-registry/schema-versions.mjs#L347) |
| `computeGovernanceDigest` | `function` | Yes | `({ baselineObj, suppressionsObj }: object)` | `sync_value` | `tools/code-registry/scanner.mjs:scanRepositorySnapshot` | — | [tools/code-registry/schema-versions.mjs:L359](../../../../tools/code-registry/schema-versions.mjs#L359) |
| `computeGovernanceDigest>anon@L363C34` | `anonymous_function` | No | `(e: unknown)` | `sync_value` | — | — | [tools/code-registry/schema-versions.mjs:L363](../../../../tools/code-registry/schema-versions.mjs#L363) |

## [tools/style-guide/cli.mjs](../../../../tools/style-guide/cli.mjs) (`module`)
- **Imports / Dependencies**: `./lib.mjs`, `node:path`, `node:url`
- **Top-Level Constants (3)**: `__filename`, `__dirname`, `DEFAULT_REPO_ROOT`

| Symbol | Kind | Exported | Parameters (Observed Basis) | Returns / Throws | Confirmed Callers (Inferred in italics) | Contracts | Lines |
|---|---|---|---|---|---|---|---|
| `parseArgs` | `function` | No | `(argv: unknown)` | `sync_value` | `tools/style-guide/cli.mjs:main` | — | [tools/style-guide/cli.mjs:L22](../../../../tools/style-guide/cli.mjs#L22) |
| `main` | `function` | No | `()` | `void_or_implicit` | `tools/style-guide/cli.mjs:<top_level>` | — | [tools/style-guide/cli.mjs:L43](../../../../tools/style-guide/cli.mjs#L43) |
| `main>anon@L92C39` | `anonymous_function` | No | `(r: unknown)` | `sync_value` | — | — | [tools/style-guide/cli.mjs:L92](../../../../tools/style-guide/cli.mjs#L92) |

## [tools/style-guide/lib.mjs](../../../../tools/style-guide/lib.mjs) (`module`)
- **Exports**: `STYLE_GUIDE_GENERATOR_VERSION`, `STYLE_GUIDE_SCHEMA_REL_PATH`, `STYLE_GUIDE_DECISIONS_REL_PATH`, `STYLE_GUIDE_DIR_REL_PATH`, `normalizePlaceholderCandidate`, `isPlaceholderString`, `containsPlaceholderOrBlankLeaf`, `anchorSlug`, `formatDecisionValueCell`, `formatExpectedAnswerSummary`, `validateValueAgainstExpectedSpec`, `validateStyleGuideData`, `computeCompletionStats`, `renderStyleGuideMarkdownFiles`, `loadStyleGuideDecisions`, `generateStyleGuideDocs`, `validateStyleGuideWorkspace`
