# Compatibility Classification, Deprecation & Frozen Contracts

---

## 1. Change-Impact Compatibility Classes (`npm run registry:compare`)

`compareRegistrySnapshots()` in [compare-impact.mjs](../../tools/code-registry/compare-impact.mjs) classifies ref-to-ref diffs into four explicit levels that reflect static analysis boundaries:

| Classification | Triggering Structural Evidence | Required Action Before Merge |
|---|---|---|
| `no_structural_break_detected_behavior_unverified` | Additive symbols/routes/tables/columns/flags, or implementation-body-only / literal edits (`symbols.body_changed`) where no structural removal or signature break fired. | **Never assume runtime safety from static analysis alone**: inspect `symbols.body_changed` consumers and run `relevant_tests`. |
| `potentially_breaking_change` | Changed symbol parameter signature/export status, removed exported symbol with no confirmed internal callers, tightened SQL `NOT NULL` or changed column type/FK/RLS policy, removed CustomEvent/BroadcastChannel producer, or altered route auth/authz/feature-gate/response keys. | Inspect `confirmed_consumers` and `inferred_candidate_consumers` across active staging branches and update affected contracts/tests. |
| `breaking_change_detected` | Removed HTTP route or HTTP method, modified SHA-256 checksum of an existing SQL migration, dropped SQL migration/table/column, disabled `FORCE ROW LEVEL SECURITY` on an RLS table, removed feature-control key, or removed symbol still referenced by confirmed callers. | **Stop**: coordinate an additive deprecation transition or explicit cross-branch migration plan. |
| `analysis_incomplete_or_unresolved` | Unresolved Git ref, JS AST parse failure in `base` or `head`, route with `UNRESOLVED` HTTP methods, or new SQL migration flagged `requires_manual_migration_review` (dynamic PL/pgSQL `EXECUTE`/loops). | Resolve parse/ref errors and manually review flagged procedural SQL before merging. |

---

## 2. Frozen & Protected Contracts (Do Not Break Casually)

1. **`REGISTERED_DOMAIN_ROUTE_COUNT === 30` (`server/routes.js:99`)**:
   - Even though 6 legacy catalog/search routes in `api/` (`api/catalog/{cities,cuisines,featured}.js`, `api/schedule/today.js`, `api/trucks/{search,[id]}.js`) have zero callers in `public/`, `server/routes.js` throws at startup and `/api/healthz` fails tests if any of the 30 domain routes are deleted without an explicit architectural change. Add new governance/self-scoped routes in `server/admin-routes.js` or a dedicated sub-router (`server/customer-exploration-routes.js`).
2. **Dual-Prefix `BITESHARK_*` / `TRUCKLY_*` Aliases (`lib/env-compat.js`)**:
   - Existing VPS `staging.env` and `migrator.env` files rely on dual-prefix compatibility. Keep `readEnvCompat` support intact.
3. **Browser Storage & Cookie Keys**:
   - `__Host-truckly_session` / `bs_session`, `truckly_catalog_v2`, `truckly_favs`, `truckly_pager_subs_v1`, `biteshark_admin_viewpoint_v1`, and `biteshark_pending_invite_v1` must remain stable across deploys so active sessions and open tabs do not corrupt state.
4. **Immutable Applied Migrations (`migrations/001`–`028` on `working/biteshark-vps`)**:
   - Never edit, reorder, or delete an existing `.sql` file in `migrations/` (`CTR-RELEASE-MIGRATION-DEPLOY`). Write a new additive migration instead.
