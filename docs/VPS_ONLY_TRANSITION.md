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

### Checks executed during this transition

Local Windows Node 24.19 / disposable PostgreSQL 18.7 / headless Chrome 157:

| Check | Result |
| --- | --- |
| Locked dependency install and new adapter resolution | PASS |
| JavaScript syntax, pager demo, 59-listing parity, VPS platform contract | PASS |
| OTP/email diagnostics and standalone runtime/auth | PASS (8/8 each) |
| Backend security / discovery | PASS (8/8 each) |
| Pager notification database suite | PASS (12/12, simulated provider) |
| Admin governance / legal readiness | PASS (7/7 and 10/10) |
| Discovery / pager / admin / legal browser suites | PASS (3/3, 4/4, 5/5, 5/5) |
| VPS preflight after shared-module import correction | PASS (11 gates + 6 E2E flows) |
| Release archive hygiene and Bash syntax | PASS |
| Windows installer harness | PARTIAL: scenarios 1–6 passed; worker-crash expected-phase assertion failed under Git Bash |

Linux Node 22 / PostgreSQL 16 verification is provided by GitHub Actions. The installer step passed on `d08133393dbdeb8137a7164900ef9263e88e6f3d` in run [44721459713](https://github.com/yamanalmasaleha-png/trukly-/actions/runs/44721459713); that overall run failed later in VPS preflight because the shared gate module needed its `node:vm` import restored. That import was restored and the local VPS preflight rerun successfully. Review the final commit's own complete CI run before deployment; do not treat the earlier failed overall run as green.

The tests caught and corrected an editing-time UTF-8 issue in test source and updated historical rollback fixtures for the new import name. No applied migration or database data was rewritten.
