# VPS-only platform transition

Date: 2026-11-20. Base: `a4f732dbaa2608db4541233413c91b4503e12d1a`. Branch: `working/biteshark-vps`.

## Decision and changes

Only Node 22/PostgreSQL/Nginx/systemd VPS deployment is supported. Removed the former platform deployment configuration and hosted-only gate runner/CLI. The VPS runner retains the same shared HTTP gate assertions in `tests/staging-http-gates.cjs`; protected diagnostics remain explicitly mounted by the real server and disabled by default.

Renamed the repository-owned adapter to `@biteshark/runtime-adapter`, with updated imports, lockfile, simulator/test mocks, release installer and browser bridge. The adapter implementation, database privileges, migrations and authentication semantics remain unchanged. Login requests use the same origin. Pager login redirects accept only the same origin.

Replaced the root deployment/code map with current VPS guidance. Archived older platform instructions and reports rather than claiming their missing hosted checks passed. Historical archives and binary source/data snapshots are excluded from deployable release archives. The builder rejects their accidental inclusion.

CI retains the PostgreSQL security, concurrency, admin, legal, notification and browser suites plus the Linux installer/clean-release checks. Removed only the redundant platform-specific preflight. Added a VPS contract check for the runtime package, same-origin bridge, explicit handler inventory, isolated request identities and staging runner refusal of production hostnames.

## Deliberate compatibility

Existing Linux paths/users/systemd names, database names, cookies/storage, `TRUCKLY_*` aliases and immutable migrations are preserved. The installer recognizes the former local adapter name solely when checking older immutable VPS rollback releases. Old-origin/production-ID denial guards remain defense in depth; they are not an alternate deployment path. Historical rollback tests translate the old fixture import to the current test adapter.

No historical hosted project, DNS, VPS service, deployed code, credentials, database or branch cleanup was changed by this source transition. The live VPS remains on its previous release until this candidate is installed separately.

## Verification

Local execution results and exact-head Linux CI must be reviewed before deployment. Local checks use disposable PostgreSQL and simulated push delivery; they do not prove physical-device push. Production approval, legal sign-off, offsite backup/restore evidence and physical-device gates remain open independently.
