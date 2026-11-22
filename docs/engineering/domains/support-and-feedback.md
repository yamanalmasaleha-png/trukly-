# Domain Map — Customer & Vendor Support Tickets (`BS-001001`+)

## 1. Current Behavior
Provides an always-reachable Help, Privacy & Issue Reporting workflow (`#supportIssuesModal` in `public/role-experience.js`, `/api/issues*`) with sequential human ticket numbers (`BS-001001`+), reporter/staff reply threads, unread-activity badges, SLA tracking, optional correlation-ID linking to `diagnostic_incident_groups`, and optional transactional email notifications (`lib/standalone-auth.js`).

## 2. Entry Points & Key Symbols
- **Server**: [lib/support-tickets.js](../../../lib/support-tickets.js) (`validateStaffStatusTransition`, `serializeSupportTicketForReporter`, `resolveInitialUrgencyAndPriority`); `/api/issues*` and `/api/admin/issues*` in [server/admin-routes.js](../../../server/admin-routes.js).
- **Browser**: `window.bitesharkOpenSupport`, `#supportIssuesModal` ([public/role-experience.js](../../../public/role-experience.js)); `#sec-issues` ([public/admin.js](../../../public/admin.js)).

## 3. HTTP APIs & Database Tables
- **APIs**: `GET|POST /api/issues`, `POST /api/issues/{reply,reopen,read}`, `GET /api/admin/issues`, `POST /api/admin/issues/{update,diagnostics}`, `POST /api/admin/diagnostics/notify-tickets`.
- **Tables** (`FORCE ROW LEVEL SECURITY`): `support_issues` (sequence `support_ticket_number_seq`, trigger `trg_guard_user_support_issue_bounds` in `026`), `support_issue_notes` (`visibility` in `reporter_visible|internal_staff`), `support_issue_events` (append-only), `support_issue_diagnostic_links`, `support_issue_notifications`.

## 4. Permissions, Flags & Tests
- **Permissions & Flags**: **Protected essential capability** (`policy_accessibility_and_privacy_support` — never disabled by Feature Controls, and **exempt from the 14+ age-assessment lockout** via `isGovernanceRouteExemptFromAgeGate` so locked-out or privacy-requesting users can always reach staff!). Internal staff notes (`internal_staff`) and unconfirmed diagnostic links are strictly stripped at both SQL RLS and `serializeSupportTicketForReporter` layers.
- **Tests**: `tests/support-feedback.integration.cjs`, `tests/support-feedback-browser.e2e.cjs`, `tests/urgent-pilot-security.integration.cjs`.
- **Known Inconsistencies**: Sign-out cleanup in `public/role-experience.js:1060,1069` references stale `#supportModal` and `#siDesc` instead of `#supportIssuesModal` and `#siDescription` (`KD-002`).
- **Safe Extension Points**: Preserve `app.support_user_update = 'true'` GUC discipline whenever adding reporter-initiated mutations on `support_issues`.
