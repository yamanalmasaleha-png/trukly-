# Compatibility Classification, Deprecation & Frozen Contracts

---

## 1. Change-Impact Compatibility Classes (`npm run registry:compare`)

`compareRegistrySnapshots()` in [compare-impact.mjs](../../tools/code-registry/compare-impact.mjs) classifies ref-to-ref diffs into four deterministic levels:

| Classification | Triggering Structural Evidence | Required Action Before Merge |
|---|---|---|
| `compatible` | Additive symbols, routes, tables, columns, feature flags, or internal body edits with zero parse failures and zero removed contracts. | Run `relevant_tests` (signature stability never guarantees runtime behavioral equivalence!). |
| `potentially_breaking` | Changed symbol parameter signature/export status, removed exported helper with no detected internal callers, or altered route auth/feature-gate metadata. | Inspect all `known_callers` across **both** staging branches and update affected contracts/tests. |
| `breaking` | Removed HTTP route or HTTP method, modified checksum of an existing SQL migration, dropped SQL migration/table/column, removed feature-control key, or removed symbol still referenced by active callers. | **Stop**: coordinate an additive deprecation transition or explicit cross-branch migration plan. |
| `unresolved` | JavaScript syntax parse failure in `head` snapshot preventing reliable AST diffing. | Fix syntax error first (`npm run registry:validate`). |

---

## 2. Frozen & Protected Contracts (Do Not Break Casually)

1. **`REGISTERED_DOMAIN_ROUTE_COUNT === 30` (`server/routes.js:99`)**:
   - Even though 6 catalog/search routes in `api/` and `/api/owner/bookings` have zero callers in `public/`, `server/routes.js` throws at startup and `/api/healthz` fails tests if any of the 30 domain routes are deleted without an explicit architectural change. Add new governance/self-scoped routes in `server/admin-routes.js` or a dedicated sub-router (`server/customer-exploration-routes.js`, `server/customer-profile-routes.js`).
2. **Dual-Prefix `BITESHARK_*` / `TRUCKLY_*` Aliases (`lib/env-compat.js`)**:
   - Existing VPS `staging.env` and `migrator.env` files rely on dual-prefix compatibility. Keep `readEnvCompat` support intact.
3. **Browser Storage & Cookie Keys**:
   - `__Host-truckly_session`, `truckly_catalog_v2`, `truckly_favs`, `truckly_pager_subs_v1`, `biteshark_admin_viewpoint_v1`, and `biteshark_pending_invite_v1` must remain stable across deploys so active customer sessions and open tabs do not corrupt state.
4. **Immutable Applied Migrations (`migrations/001`–`029`)**:
   - Never edit, reorder, or delete an existing `.sql` file in `migrations/`. Write a new additive migration instead.
