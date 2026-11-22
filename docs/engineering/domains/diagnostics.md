# Domain Map — Operational Error & Diagnostics System

- **Full Specification**: [DIAGNOSTICS-AND-ERRORS.md](../DIAGNOSTICS-AND-ERRORS.md)

## 1. Summary
Captures sanitized, fingerprinted browser (`trust_level = 'browser_untrusted'`), API, worker, and external-provider failures in bounded PostgreSQL tables, tracks server/client release skew (`X-BiteShark-Release` vs `X-BiteShark-Client-Bundle`), scopes sensitive security/email categories (`TOP_ONLY_FEATURE_KEYS`) exclusively to `Admin: Top`, and connects confirmed incidents to open customer support tickets.

## 2. Entry Points, APIs, Data & Tests
- **Code**: `recordDiagnosticEvent`, `sanitizeDiagnosticText`, `generateCorrelationId`, `recordServerReleaseStartup`, `recordWorkerHeartbeat`, `cleanupExpiredDiagnostics` ([lib/diagnostics.js](../../../lib/diagnostics.js)); `window.bitesharkDiagnostics` ([public/diagnostics-client.js](../../../public/diagnostics-client.js)); `#sec-diagnostics` & `#sec-health` ([public/admin.js](../../../public/admin.js)).
- **APIs**: `POST /api/diagnostics/report` (unauthenticated, 4 KiB cap, IP rate-limited), `GET /api/admin/diagnostics`, `GET /api/admin/diagnostics/detail`, `POST /api/admin/diagnostics/{triage,note,notify-tickets,synthetic-test,cleanup}`.
- **Tables** (`FORCE RLS` via `app.diagnostics_internal` / `app.admin_internal`): `diagnostic_releases`, `diagnostic_incident_groups`, `diagnostic_event_samples`, `diagnostic_incident_notes` (append-only), `worker_runtime_heartbeats`, `support_issue_diagnostic_links`.
- **Tests**: `tests/diagnostics-and-reliability.integration.cjs`, `tests/reliability-accessibility-browser.e2e.cjs`.
- **Known Inconsistencies**: `lib/diagnostics.js#reportDomainRouteFailure` is unreferenced (`server/app.js` uses `res.__bsDiagHook`); `migrations/024` includes unused GUC `app.worker_internal`.
- **Safe Extension Points**: Register new scalar context fields in `SAFE_CONTEXT_KEYS` and feature keys in `ALLOWED_FEATURE_KEYS` (`lib/diagnostics.js`) before emitting custom events.
