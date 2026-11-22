# Domain Map — Feature Controls Governance

- **Full Specification**: [FEATURE-CONTROLS.md](../FEATURE-CONTROLS.md)

## 1. Summary
Provides live 0ms-cache operational control (`enabled`, `paused`, `hidden`; `all`, `staff_beta`) over reviewed optional features without permitting disablement of essential auth, RBAC, age-policy, discovery, policy, or support channels.

## 2. Entry Points, APIs, Data & Tests
- **Code**: `FEATURE_CONTROLS_REGISTRY`, `ROUTE_FEATURE_ENFORCEMENT_RULES`, `evaluateFeatureControls`, `enforceHttpFeatureGate`, `updateFeatureControl` ([lib/feature-controls.js](../../../lib/feature-controls.js)); `window.bitesharkFeatures` ([public/role-experience.js](../../../public/role-experience.js)); `#sec-features` & `#featureConfirmModal` ([public/admin.js](../../../public/admin.js)); CLI [scripts/manage-feature-controls.cjs](../../../scripts/manage-feature-controls.cjs).
- **APIs**: `GET /api/features`, `GET /api/admin/features` (`Mod` + `Top`), `POST /api/admin/features/update` (`Admin: Top` only, optimistic `expected_revision`).
- **Tables**: `feature_controls` (`FORCE RLS`, `feature_controls_top_write` requires `app.is_top_admin = 'true'`), `feature_control_history` (append-only), `audit_logs`.
- **Branch Difference**: `14` total registry items (`12` switchable) on `a4e9f53`/`a2f0135` vs `21` total (`19` switchable) on `83181ba`.
- **Tests**: `tests/feature-controls.integration.cjs`, `tests/feature-controls-browser.e2e.cjs`.
- **Safe Extension Points**: Every new optional feature must be added to `FEATURE_CONTROLS_REGISTRY` (cycle-free `depends_on`), `ROUTE_FEATURE_ENFORCEMENT_RULES` (for server routes), and `data-feature-control` / `window.bitesharkFeatures` on the client.
