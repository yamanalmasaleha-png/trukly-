// Centralized Bounded Operational Diagnostics, Redaction & Release-Awareness Engine
//
// Invariants:
//   1. Strictly allowlisted features, components, severities, outcomes, route templates, and
//      safe scalar context keys. Never stores request/response bodies, arbitrary URLs, query
//      strings, fragments, cookies, authorization headers, emails, GPS coordinates, OTPs,
//      raw DOBs, private capability tokens, evidence bytes, or secrets.
//   2. Browser reports (`trust_level = 'browser_untrusted'`) are rate-limited, size-capped,
//      sanitized against log/XSS injection, and never trusted for identity, permissions, or
//      server release attribution.
//   3. Deduplicates repeated failures via stable SHA-256 fingerprint and rate-caps stored
//      samples per group so polling/network storms cannot flood PostgreSQL on a small VPS.
//   4. Non-recursive and non-breaking: diagnostic persistence errors never throw into the
//      caller's HTTP/worker operation and fall back to a single sanitized operational log line.

import crypto from 'node:crypto';

export const CLIENT_BUNDLE_VERSION = 'bs-ui-2026.11.20';
export const REPOSITORY_COMMIT_BASE_URL = 'https://github.com/yamanalmasaleha-png/trukly-/commit/';

export const ALLOWED_COMPONENTS = new Set(['browser', 'api', 'worker', 'external_provider']);
export const ALLOWED_SEVERITIES = new Set(['info', 'warning', 'error', 'critical']);
export const ALLOWED_OUTCOMES = new Set([
  'failed',
  'outcome_uncertain',
  'partial_success',
  'temporarily_unavailable',
  'degraded'
]);
export const ALLOWED_TRIAGE_STATUSES = new Set(['new', 'investigating', 'monitoring', 'resolved']);

export const ALLOWED_FEATURE_KEYS = new Set([
  'discovery',
  'map_tiles',
  'favorites',
  'notification_preferences',
  'auth_login',
  'bookings_inquiries',
  'vendor_publishing',
  'vendor_schedules',
  'pagers',
  'community',
  'onboarding_uploads',
  'invitations',
  'support_issues',
  'local_photo_storage',
  'admin_portal',
  'email_delivery',
  'push_delivery',
  'worker_runtime',
  'ui_runtime',
  'synthetic_verification'
]);

// Security/auth/invitation/provider internals are Top-Admin-only (`mod_visible = false`).
// Moderators receive the sanitized operational subset (`mod_visible = true`).
export const TOP_ONLY_FEATURE_KEYS = new Set([
  'auth_login',
  'invitations',
  'email_delivery',
  'admin_portal'
]);

const SAFE_CONTEXT_KEYS = new Set([
  'http_status',
  'phase',
  'provider',
  'delivery_mode',
  'storage_kind',
  'viewport_bucket',
  'tile_host_id',
  'attempt',
  'queue_depth',
  'is_offline',
  'feature_state',
  'synthetic_label'
]);

let activeRecordingDepth = 0;
let forcedFailureForTesting = null;

export function __setDiagnosticsFaultInjectionForTests(fnOrNull) {
  forcedFailureForTesting = typeof fnOrNull === 'function' ? fnOrNull : null;
}

function readIntEnv(env, suffix, fallback, min, max) {
  const source = env || process.env;
  const raw = String(source[`BITESHARK_${suffix}`] || source[`TRUCKLY_${suffix}`] || '').trim();
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

export function getDiagnosticsRetentionPolicy(env = process.env) {
  return {
    sample_retention_days: readIntEnv(env, 'DIAGNOSTICS_SAMPLE_RETENTION_DAYS', 14, 1, 90),
    resolved_group_retention_days: readIntEnv(env, 'DIAGNOSTICS_RESOLVED_RETENTION_DAYS', 30, 1, 180),
    open_group_retention_days: readIntEnv(env, 'DIAGNOSTICS_OPEN_RETENTION_DAYS', 60, 7, 365),
    max_samples_per_group: readIntEnv(env, 'DIAGNOSTICS_MAX_SAMPLES_PER_GROUP', 15, 3, 50),
    sample_cooldown_seconds: readIntEnv(env, 'DIAGNOSTICS_SAMPLE_COOLDOWN_SEC', 30, 0, 3600),
    max_groups: readIntEnv(env, 'DIAGNOSTICS_MAX_GROUPS', 500, 20, 5000),
    notes_retention: 'preserved_independently_append_only'
  };
}

export function generateCorrelationId() {
  return `corr_${crypto.randomBytes(8).toString('hex')}`;
}

export function normalizeCorrelationId(value) {
  const s = String(value || '').trim();
  if (/^corr_[0-9a-f]{12,32}$/i.test(s)) return s.toLowerCase();
  return null;
}

export function normalizeReleaseSha(value) {
  const s = String(value || '').trim();
  if (!s) return 'dev';
  if (/^[0-9a-f]{7,40}$/i.test(s)) return s.toLowerCase();
  const clean = s.replace(/[^A-Za-z0-9._-]/g, '').slice(0, 48);
  return clean || 'dev';
}

export function sanitizeDiagnosticText(input, maxLen = 280, fallback = 'Unexpected operational error.') {
  if (input === null || input === undefined) return fallback;
  let text = String(input);

  // Strip control characters and newlines to prevent log injection.
  text = text.replace(/[\x00-\x1F\x7F]+/g, ' ');

  // Temporarily protect valid `corr_<hex>` correlation references before hex/token scrubbing.
  const preservedCorrs = [];
  text = text.replace(/\bcorr_[0-9a-f]{12,32}\b/gi, match => {
    const idx = preservedCorrs.length;
    preservedCorrs.push(match.toLowerCase());
    return `__BSCORR${idx}__`;
  });

  // Scrub auth headers, cookies, API keys, JWTs, capability assignments, URLs, emails, DOBs, OTPs, coords, paths.
  text = text
    .replace(/\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]+/gi, '[REDACTED_AUTH]')
    .replace(/(__Host-[A-Za-z0-9_-]+\s*=\s*[^\s;,"']+)/g, '[REDACTED_COOKIE]')
    .replace(
      /\b(cookie|set-cookie|authorization|x-worker-secret|x-csrf-token|resend_api_key|vapid_private_key)\s*[:=]\s*[^\s,;]+/gi,
      '$1=[REDACTED]'
    )
    .replace(
      /\b(re_[A-Za-z0-9_]{6,}|sk_[A-Za-z0-9_]{6,}|pk_[A-Za-z0-9_]{6,}|wk_[A-Za-z0-9_]{6,}|mbx_[A-Za-z0-9_]{6,}|whsec_[A-Za-z0-9_]{6,})\b/g,
      '[REDACTED_SECRET]'
    )
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}\b/g, '[REDACTED_JWT]')
    .replace(
      /\b(token|invite_token|pager_token|otp|passcode|password|secret|api_key|dob|birth_date|date_of_birth|lat|lng|latitude|longitude)\s*[:=]\s*[^\s,&"']+/gi,
      '$1=[REDACTED]'
    )
    .replace(/https?:\/\/[^\s"'<>]+/gi, '[REDACTED_URL]')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[REDACTED_EMAIL]')
    .replace(/\b(19\d{2}|20[0-2]\d)[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])\b/g, '[REDACTED_DATE]')
    .replace(/\b(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])\/(19\d{2}|20[0-2]\d)\b/g, '[REDACTED_DATE]')
    .replace(/([A-Za-z]:\\[\\\w.\s-]+|\/(?:var|etc|home|root|usr|opt|tmp|srv)\/[\w./-]+)/g, '[REDACTED_PATH]')
    .replace(/[-+]?\b\d{1,3}\.\d{3,}\b/g, '[REDACTED_COORD]')
    .replace(/\b\d{6,8}\b/g, '[REDACTED_CODE]')
    .replace(/([/][A-Za-z0-9_./:-]*)[?#][^\s"'<>]*/g, '$1')
    .replace(/\b[A-Fa-f0-9]{28,}\b/g, '[REDACTED_HEX]')
    .replace(/\b[A-Za-z0-9+/_-]{34,}={0,2}\b/g, '[REDACTED_TOKEN]');

  text = text.replace(/__BSCORR(\d+)__/g, (_, i) => preservedCorrs[Number(i)] || '');
  text = text.replace(/\s+/g, ' ').trim();
  if (!text) return fallback;
  if (text.length > maxLen) {
    return `${text.slice(0, Math.max(1, maxLen - 1)).trimEnd()}…`;
  }
  return text;
}

export function sanitizeRouteTemplate(rawInput) {
  if (!rawInput || typeof rawInput !== 'string') return null;
  let cleaned = rawInput.trim();
  if (!cleaned) return null;

  // Strip scheme + authority if a full URL was accidentally supplied, then strip query & fragment.
  cleaned = cleaned.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^/?#]+/, '');
  const qIdx = cleaned.indexOf('?');
  if (qIdx !== -1) cleaned = cleaned.slice(0, qIdx);
  const hIdx = cleaned.indexOf('#');
  if (hIdx !== -1) cleaned = cleaned.slice(0, hIdx);
  cleaned = cleaned.replace(/[\x00-\x1F\x7F]+/g, '').replace(/\/{2,}/g, '/');

  if (!cleaned.startsWith('/')) cleaned = `/${cleaned}`;
  const rawSegments = cleaned.split('/').filter(Boolean).slice(0, 8);
  if (rawSegments.length === 0) return '/';

  const safeSegments = rawSegments.map(seg => {
    if (seg === ':id' || seg === ':uuid' || seg === ':param') return seg;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg)) return ':uuid';
    if (/^\d+$/.test(seg)) return ':id';
    if (seg.length > 28) return ':param';
    if (/[=@%]/.test(seg)) return ':param';
    if (!/^[A-Za-z0-9._-]+$/.test(seg)) return ':param';
    // Scrub high-entropy mixed token segments while preserving known kebab/snake route words.
    if (seg.length >= 18 && /[0-9]/.test(seg) && /[A-Za-z]/.test(seg)) return ':param';
    return seg;
  });

  return `/${safeSegments.join('/')}`.slice(0, 140);
}

export function sanitizeIdentifierCode(rawInput, fallback = 'UNEXPECTED_ERROR', maxLen = 72) {
  const s = String(rawInput || '')
    .trim()
    .replace(/[^A-Za-z0-9_.:-]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^[_.:-]+|[_.:-]+$/g, '')
    .slice(0, maxLen);
  return s.length >= 2 ? s : fallback;
}

export function sanitizeOperationName(rawInput, fallback = 'unknown_operation') {
  const s = String(rawInput || '')
    .trim()
    .replace(/\?.*$/, '')
    .replace(/#.*$/, '')
    .replace(/[^A-Za-z0-9_.:/-]/g, '_')
    .replace(/_{2,}/g, '_')
    .slice(0, 90);
  return s.length >= 2 ? s : fallback;
}

export function sanitizeSafeContext(rawCtx) {
  if (!rawCtx || typeof rawCtx !== 'object' || Array.isArray(rawCtx)) return {};
  const out = {};
  for (const key of Object.keys(rawCtx)) {
    if (!SAFE_CONTEXT_KEYS.has(key)) continue;
    const val = rawCtx[key];
    if (typeof val === 'boolean') {
      out[key] = val;
    } else if (typeof val === 'number' && Number.isFinite(val)) {
      out[key] = Math.trunc(val);
    } else if (typeof val === 'string') {
      out[key] = sanitizeDiagnosticText(val, 64, '');
    }
  }
  const encoded = JSON.stringify(out);
  if (Buffer.byteLength(encoded, 'utf8') > 1536) {
    return {};
  }
  return out;
}

export function inferFeatureFromRoute(routeTemplate) {
  const r = String(routeTemplate || '').toLowerCase();
  if (r.startsWith('/api/favorites')) return 'favorites';
  if (r.startsWith('/api/notifications')) return 'notification_preferences';
  if (r.startsWith('/api/auth')) return 'auth_login';
  if (r.startsWith('/api/bookings') || r.startsWith('/api/owner/requests')) return 'bookings_inquiries';
  if (r.startsWith('/api/owner/schedule')) return 'vendor_schedules';
  if (r.startsWith('/api/owner') || r.startsWith('/api/vendor/settings')) return 'vendor_publishing';
  if (r.startsWith('/api/pager')) return 'pagers';
  if (r.startsWith('/api/community')) return 'community';
  if (r.startsWith('/api/applications')) return 'onboarding_uploads';
  if (r.startsWith('/api/invitations') || r.startsWith('/api/vendor/staff-invitations') || r.startsWith('/api/admin/invitations')) {
    return 'invitations';
  }
  if (r.startsWith('/api/issues') || r.startsWith('/api/admin/issues')) return 'support_issues';
  if (r.startsWith('/api/admin/email-readiness')) return 'email_delivery';
  if (r.startsWith('/api/admin')) return 'admin_portal';
  if (r.startsWith('/api/trucks') || r.startsWith('/api/features')) return 'discovery';
  return 'ui_runtime';
}

export function buildDefaultUserImpact(featureKey, outcomeState) {
  if (outcomeState === 'outcome_uncertain') {
    return 'User request timed out before confirmation; BiteShark showed an uncertain-outcome notice and avoided blind duplicate submission.';
  }
  if (outcomeState === 'partial_success') {
    return 'Part of the operation completed while a follow-up step failed; BiteShark preserved safe input and explained which part succeeded.';
  }
  switch (featureKey) {
    case 'discovery':
      return 'Customers could not refresh live food truck listings and saw a temporary unavailability notice.';
    case 'map_tiles':
      return 'Map background tiles degraded or failed to load; discovery automatically switched to or offered list fallback.';
    case 'favorites':
      return 'Favorite change stayed saved on this device only because saving to the account failed.';
    case 'notification_preferences':
      return 'Nearby alert radius preference could not be saved to the account.';
    case 'auth_login':
      return 'Sign-in, verification, or session check failed before completing.';
    case 'bookings_inquiries':
      return 'Event inquiry lookup or submission could not complete and displayed an actionable error.';
    case 'vendor_publishing':
      return 'Vendor dashboard or profile/location update failed to load or save.';
    case 'vendor_schedules':
      return 'Weekly vendor schedule could not be loaded or saved.';
    case 'pagers':
      return 'Order pager status check or kitchen pager action failed or stalled.';
    case 'community':
      return 'Community feed or review submission could not complete.';
    case 'onboarding_uploads':
      return 'Vendor application or verification document upload failed; draft text was preserved.';
    case 'invitations':
      return 'Account or staff invitation delivery/acceptance encountered an error.';
    case 'support_issues':
      return 'Support ticket submission or thread update failed.';
    case 'local_photo_storage':
      return 'Browser storage (IndexedDB/localStorage) was unavailable for local-only photos or preferences.';
    case 'email_delivery':
      return 'Outbound transactional email provider rejected or timed out on a message.';
    case 'push_delivery':
      return 'Pager push notification worker encountered a delivery or configuration failure.';
    case 'worker_runtime':
      return 'Background maintenance or pager notification worker tick failed.';
    case 'synthetic_verification':
      return 'No real customer impact — synthetic operator verification incident.';
    default:
      return 'User-visible operation encountered an unexpected error and displayed a support reference.';
  }
}

export function buildDefaultNextSteps(featureKey, component) {
  if (featureKey === 'synthetic_verification') {
    return 'Confirm search, detail view, release attribution, and operator notes work as expected, then mark Resolved.';
  }
  if (component === 'external_provider' || featureKey === 'email_delivery' || featureKey === 'map_tiles') {
    return 'Inspect Operational Health provider readiness, verify rate limits/allowlists, and check whether occurrences continue.';
  }
  if (component === 'worker' || featureKey === 'worker_runtime' || featureKey === 'push_delivery') {
    return 'Check worker heartbeat in Operational Health and inspect sanitized systemd journal entries by correlation ID.';
  }
  if (component === 'browser' && featureKey === 'local_photo_storage') {
    return 'Verify whether affected browsers are in private/storage-restricted mode or hitting storage quota limits.';
  }
  return 'Correlate with recent server release or stale browser build, inspect sanitized samples by correlation ID, and verify database/service health.';
}

export function computeIncidentFingerprint({ component, featureKey, routeOrOp, errorCode, isSyntheticTest }) {
  const seed = [
    isSyntheticTest ? 'synthetic' : 'live',
    component,
    featureKey,
    String(routeOrOp || '').toLowerCase(),
    String(errorCode || '').toUpperCase()
  ].join('|');
  return crypto.createHash('sha256').update(seed, 'utf8').digest('hex').slice(0, 40);
}

async function withDiagnosticsDb(db, fn) {
  if (forcedFailureForTesting) {
    forcedFailureForTesting();
  }
  if (!db) return null;
  const connectFn =
    typeof db.connect === 'function'
      ? () => db.connect()
      : db.pool && typeof db.pool.connect === 'function'
        ? () => db.pool.connect()
        : null;

  if (!connectFn) {
    return null;
  }

  const client = await connectFn();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.diagnostics_internal', 'true', true)");
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    throw err;
  } finally {
    if (typeof client.release === 'function') client.release();
  }
}

export async function recordServerReleaseStartup(
  db,
  {
    releaseSha,
    environment = 'development',
    deployMode = 'startup',
    clientBundleVersion = CLIENT_BUNDLE_VERSION,
    logger = console
  } = {}
) {
  const normalizedSha = normalizeReleaseSha(releaseSha);
  const safeEnv = sanitizeIdentifierCode(environment, 'development', 28).toLowerCase();
  const safeMode = ['startup', 'worker_startup', 'manual_record'].includes(deployMode) ? deployMode : 'startup';
  const safeBundle = sanitizeIdentifierCode(clientBundleVersion || CLIENT_BUNDLE_VERSION, CLIENT_BUNDLE_VERSION, 48);

  try {
    await withDiagnosticsDb(db, async tx => {
      const { rows: prevRows } = await tx.query(
        `SELECT release_sha
         FROM diagnostic_releases
         WHERE release_sha <> $1
         ORDER BY first_seen_at DESC
         LIMIT 1`,
        [normalizedSha]
      );
      const prevSha = prevRows[0]?.release_sha || null;

      await tx.query(
        `INSERT INTO diagnostic_releases (
           release_sha, environment, previous_release_sha, deploy_mode, client_bundle_version, first_seen_at, last_seen_at, startup_count
         )
         VALUES ($1, $2, $3, $4, $5, now(), now(), 1)
         ON CONFLICT (release_sha) DO UPDATE SET
           environment = EXCLUDED.environment,
           client_bundle_version = COALESCE(EXCLUDED.client_bundle_version, diagnostic_releases.client_bundle_version),
           last_seen_at = now(),
           startup_count = diagnostic_releases.startup_count + 1`,
        [normalizedSha, safeEnv, prevSha, safeMode, safeBundle]
      );
    });
    return { recorded: true, release_sha: normalizedSha };
  } catch (err) {
    try {
      logger?.warn?.(
        JSON.stringify({
          level: 'warn',
          event: 'diagnostic_release_startup_skipped',
          release_sha: normalizedSha,
          reason: sanitizeDiagnosticText(err?.message || 'db_not_ready', 120)
        })
      );
    } catch {}
    return { recorded: false, release_sha: normalizedSha };
  }
}

export async function recordWorkerHeartbeat(
  db,
  { workerName = 'pager_notifications', status = 'ok', releaseSha = 'dev', correlationId = null, summary = {} } = {}
) {
  const safeWorker = sanitizeIdentifierCode(workerName, 'pager_notifications', 48)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_');
  const safeStatus = ['ok', 'degraded', 'error'].includes(status) ? status : 'error';
  const safeSha = normalizeReleaseSha(releaseSha);
  const safeCorr = normalizeCorrelationId(correlationId);
  const safeSummary = sanitizeSafeContext(summary);

  try {
    await withDiagnosticsDb(db, async tx => {
      await tx.query(
        `INSERT INTO worker_runtime_heartbeats (
           worker_name, last_run_at, last_status, release_sha, last_correlation_id, last_summary, updated_at
         )
         VALUES ($1, now(), $2, $3, $4, $5::jsonb, now())
         ON CONFLICT (worker_name) DO UPDATE SET
           last_run_at = now(),
           last_status = EXCLUDED.last_status,
           release_sha = EXCLUDED.release_sha,
           last_correlation_id = COALESCE(EXCLUDED.last_correlation_id, worker_runtime_heartbeats.last_correlation_id),
           last_summary = EXCLUDED.last_summary,
           updated_at = now()`,
        [safeWorker, safeStatus, safeSha, safeCorr, JSON.stringify(safeSummary)]
      );
    });
    return { recorded: true };
  } catch {
    return { recorded: false };
  }
}

function appendBoundedUnique(existingList, nextVal, maxItems = 12) {
  const arr = Array.isArray(existingList) ? existingList.filter(Boolean) : [];
  if (!nextVal) return arr.slice(0, maxItems);
  const filtered = arr.filter(v => v !== nextVal);
  filtered.unshift(nextVal);
  return filtered.slice(0, maxItems);
}

function shaMatchesCandidate(actualSha, candidateFixSha) {
  if (!actualSha || !candidateFixSha) return false;
  const a = String(actualSha).toLowerCase();
  const b = String(candidateFixSha).toLowerCase();
  return a === b || a.startsWith(b) || b.startsWith(a);
}

export async function recordDiagnosticEvent(
  db,
  rawEvent = {},
  { env = process.env, fallbackLogger = console } = {}
) {
  if (activeRecordingDepth > 0) {
    return { recorded: false, skipped: 'reentrant_guard' };
  }

  activeRecordingDepth += 1;
  try {
    const component = ALLOWED_COMPONENTS.has(rawEvent.component) ? rawEvent.component : 'api';
    const trustLevel = component === 'browser' || rawEvent.trustLevel === 'browser_untrusted'
      ? 'browser_untrusted'
      : 'server_verified';

    const routeTemplate = sanitizeRouteTemplate(rawEvent.routeTemplate || '');
    const inferredFeature = inferFeatureFromRoute(routeTemplate);
    const featureKey = ALLOWED_FEATURE_KEYS.has(rawEvent.featureKey) ? rawEvent.featureKey : inferredFeature;
    const operationName = sanitizeOperationName(rawEvent.operationName || routeTemplate || featureKey);
    const severity = ALLOWED_SEVERITIES.has(rawEvent.severity) ? rawEvent.severity : 'error';
    const errorCode = sanitizeIdentifierCode(rawEvent.errorCode, 'UNEXPECTED_ERROR').toUpperCase();
    const outcomeState = ALLOWED_OUTCOMES.has(rawEvent.outcomeState) ? rawEvent.outcomeState : 'failed';
    const isSyntheticTest = Boolean(rawEvent.isSyntheticTest && trustLevel === 'server_verified');

    const serverReleaseSha = normalizeReleaseSha(
      rawEvent.serverReleaseSha || env?.BITESHARK_RELEASE_SHA || env?.TRUCKLY_RELEASE_SHA || 'dev'
    );
    const clientBuildVersion = rawEvent.clientBuildVersion
      ? sanitizeIdentifierCode(rawEvent.clientBuildVersion, '', 48) || null
      : null;
    const clientLoadedReleaseSha = rawEvent.clientLoadedReleaseSha
      ? normalizeReleaseSha(rawEvent.clientLoadedReleaseSha)
      : null;
    const isStaleClient = Boolean(
      clientLoadedReleaseSha &&
        clientLoadedReleaseSha !== 'dev' &&
        serverReleaseSha !== 'dev' &&
        !shaMatchesCandidate(serverReleaseSha, clientLoadedReleaseSha)
    );

    const correlationId = normalizeCorrelationId(rawEvent.correlationId) || generateCorrelationId();

    let occurredAt = new Date();
    if (rawEvent.occurredAt) {
      const parsed = new Date(rawEvent.occurredAt);
      const nowMs = Date.now();
      // Clamp untrusted browser timestamps within [-24h, +5m] of server receipt so skewed clocks cannot forge history.
      if (Number.isFinite(parsed.getTime()) && parsed.getTime() >= nowMs - 86400_000 && parsed.getTime() <= nowMs + 300_000) {
        occurredAt = parsed;
      }
    }

    const baseTitle = sanitizeDiagnosticText(
      rawEvent.title || `${featureKey.replace(/_/g, ' ')}: ${errorCode}`,
      150,
      `${featureKey}: ${errorCode}`
    );
    const title = isSyntheticTest && !baseTitle.startsWith('[SYNTHETIC TEST]')
      ? `[SYNTHETIC TEST] ${baseTitle}`.slice(0, 175)
      : baseTitle;

    const sanitizedMessage = sanitizeDiagnosticText(
      rawEvent.message || rawEvent.sanitizedSummary || errorCode,
      280,
      'Unexpected operational failure.'
    );
    const userImpact = sanitizeDiagnosticText(
      rawEvent.userImpact || buildDefaultUserImpact(featureKey, outcomeState),
      280,
      buildDefaultUserImpact(featureKey, outcomeState)
    );
    const safeNextSteps = sanitizeDiagnosticText(
      rawEvent.safeNextSteps || buildDefaultNextSteps(featureKey, component),
      320,
      buildDefaultNextSteps(featureKey, component)
    );

    const httpMethod =
      typeof rawEvent.httpMethod === 'string' &&
      ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(rawEvent.httpMethod.toUpperCase())
        ? rawEvent.httpMethod.toUpperCase()
        : null;
    const httpStatus =
      Number.isInteger(rawEvent.httpStatus) && rawEvent.httpStatus >= 100 && rawEvent.httpStatus <= 599
        ? rawEvent.httpStatus
        : null;
    const durationMs =
      Number.isFinite(rawEvent.durationMs) && rawEvent.durationMs >= 0
        ? Math.min(600_000, Math.round(rawEvent.durationMs))
        : null;
    const retryable = typeof rawEvent.retryable === 'boolean' ? rawEvent.retryable : null;
    const modVisible =
      typeof rawEvent.modVisible === 'boolean'
        ? rawEvent.modVisible && !TOP_ONLY_FEATURE_KEYS.has(featureKey)
        : !TOP_ONLY_FEATURE_KEYS.has(featureKey);

    const safeContext = sanitizeSafeContext(rawEvent.safeContext);
    const fingerprint = computeIncidentFingerprint({
      component,
      featureKey,
      routeOrOp: routeTemplate || operationName,
      errorCode,
      isSyntheticTest
    });
    const policy = getDiagnosticsRetentionPolicy(env);

    const dbOut = await withDiagnosticsDb(db, async tx => {
      const { rows: existingRows } = await tx.query(
        `SELECT id, occurrence_count, observed_server_releases, observed_client_builds,
                stale_client_observed, suspected_fix_sha, fix_recorded_at,
                continued_after_suspected_fix, last_sample_at, mod_visible
         FROM diagnostic_incident_groups
         WHERE fingerprint = $1
         FOR UPDATE`,
        [fingerprint]
      );

      let groupId;
      let shouldStoreSample = true;
      let occurrenceCount = 1;

      const clientTag = clientLoadedReleaseSha
        ? `${clientBuildVersion || 'browser'}@${clientLoadedReleaseSha.slice(0, 12)}`
        : clientBuildVersion;

      if (existingRows.length === 0) {
        const nextReleases = appendBoundedUnique([], serverReleaseSha, 12);
        const nextClientBuilds = appendBoundedUnique([], clientTag, 12);

        const { rows: ins } = await tx.query(
          `INSERT INTO diagnostic_incident_groups (
             fingerprint, title, emitting_component, trust_level, feature_key, operation_name,
             route_template, severity, error_code, sanitized_summary, user_impact, safe_next_steps,
             retryable, outcome_state, is_synthetic_test, mod_visible, triage_status,
             occurrence_count, first_seen_at, last_seen_at, first_server_release_sha, last_server_release_sha,
             observed_server_releases, observed_client_builds, stale_client_observed,
             last_correlation_id, last_sample_at, updated_at
           )
           VALUES (
             $1, $2, $3, $4, $5, $6,
             $7, $8, $9, $10, $11, $12,
             $13, $14, $15, $16, 'new',
             1, $17, now(), $18, $18,
             $19::text[], $20::text[], $21,
             $22, now(), now()
           )
           RETURNING id, occurrence_count`,
          [
            fingerprint,
            title,
            component,
            trustLevel,
            featureKey,
            operationName,
            routeTemplate,
            severity,
            errorCode,
            sanitizedMessage,
            userImpact,
            safeNextSteps,
            retryable,
            outcomeState,
            isSyntheticTest,
            modVisible,
            occurredAt.toISOString(),
            serverReleaseSha,
            nextReleases,
            nextClientBuilds,
            isStaleClient,
            correlationId
          ]
        );
        groupId = ins[0].id;
        occurrenceCount = Number(ins[0].occurrence_count || 1);
      } else {
        const g = existingRows[0];
        groupId = g.id;
        occurrenceCount = Number(g.occurrence_count || 1) + 1;
        const nextReleases = appendBoundedUnique(g.observed_server_releases, serverReleaseSha, 12);
        const nextClientBuilds = appendBoundedUnique(g.observed_client_builds, clientTag, 12);
        const nextStale = Boolean(g.stale_client_observed || isStaleClient);
        const nextModVisible = Boolean(g.mod_visible && modVisible);

        const lastSampleMs = g.last_sample_at ? new Date(g.last_sample_at).getTime() : 0;
        if (
          !isSyntheticTest &&
          policy.sample_cooldown_seconds > 0 &&
          Number.isFinite(lastSampleMs) &&
          Date.now() - lastSampleMs < policy.sample_cooldown_seconds * 1000
        ) {
          shouldStoreSample = false;
        }

        // Check whether this new occurrence arrived on the suspected fix SHA or after a deployed suspected fix SHA.
        let continuedAfterFix = Boolean(g.continued_after_suspected_fix);
        if (g.suspected_fix_sha && !continuedAfterFix) {
          if (shaMatchesCandidate(serverReleaseSha, g.suspected_fix_sha)) {
            continuedAfterFix = true;
          } else if (g.fix_recorded_at) {
            const { rows: fixRel } = await tx.query(
              `SELECT first_seen_at
               FROM diagnostic_releases
               WHERE release_sha LIKE ($1 || '%')
               ORDER BY first_seen_at DESC
               LIMIT 1`,
              [g.suspected_fix_sha.toLowerCase()]
            );
            if (fixRel.length > 0 && Date.now() >= new Date(fixRel[0].first_seen_at).getTime()) {
              continuedAfterFix = true;
            }
          }
        }

        await tx.query(
          `UPDATE diagnostic_incident_groups
           SET occurrence_count = $2,
               last_seen_at = now(),
               last_server_release_sha = $3,
               observed_server_releases = $4::text[],
               observed_client_builds = $5::text[],
               stale_client_observed = $6,
               continued_after_suspected_fix = $7,
               sanitized_summary = $8,
               last_correlation_id = $9,
               mod_visible = $10,
               last_sample_at = CASE WHEN $11 THEN now() ELSE last_sample_at END,
               updated_at = now()
           WHERE id = $1`,
          [
            groupId,
            occurrenceCount,
            serverReleaseSha,
            nextReleases,
            nextClientBuilds,
            nextStale,
            continuedAfterFix,
            sanitizedMessage,
            correlationId,
            nextModVisible,
            shouldStoreSample
          ]
        );
      }

      let sampleId = null;
      if (shouldStoreSample) {
        const { rows: sRows } = await tx.query(
          `INSERT INTO diagnostic_event_samples (
             group_id, occurred_at, received_at, emitting_component, trust_level,
             server_release_sha, client_build_version, client_loaded_release_sha, is_stale_client,
             feature_key, operation_name, route_template, http_method, http_status,
             severity, error_code, sanitized_message, user_impact, correlation_id,
             duration_ms, retryable, outcome_state, safe_context
           )
           VALUES (
             $1, $2, now(), $3, $4,
             $5, $6, $7, $8,
             $9, $10, $11, $12, $13,
             $14, $15, $16, $17, $18,
             $19, $20, $21, $22::jsonb
           )
           RETURNING id`,
          [
            groupId,
            occurredAt.toISOString(),
            component,
            trustLevel,
            serverReleaseSha,
            clientBuildVersion,
            clientLoadedReleaseSha,
            isStaleClient,
            featureKey,
            operationName,
            routeTemplate,
            httpMethod,
            httpStatus,
            severity,
            errorCode,
            sanitizedMessage,
            userImpact,
            correlationId,
            durationMs,
            retryable,
            outcomeState,
            JSON.stringify(safeContext)
          ]
        );
        sampleId = sRows[0]?.id || null;

        // Prune older samples for this group beyond `max_samples_per_group` so storage stays bounded.
        await tx.query(
          `DELETE FROM diagnostic_event_samples
           WHERE group_id = $1
             AND id NOT IN (
               SELECT id
               FROM diagnostic_event_samples
               WHERE group_id = $1
               ORDER BY received_at DESC, id DESC
               LIMIT $2
             )`,
          [groupId, policy.max_samples_per_group]
        );
      }

      return {
        recorded: true,
        group_id: groupId,
        sample_id: sampleId,
        sample_stored: shouldStoreSample,
        fingerprint,
        occurrence_count: occurrenceCount,
        correlation_id: correlationId
      };
    });

    if (!dbOut) {
      return { recorded: false, skipped: 'no_db_pool', correlation_id: correlationId };
    }
    return dbOut;
  } catch (err) {
    try {
      fallbackLogger?.error?.(
        JSON.stringify({
          level: 'error',
          event: 'diagnostic_persistence_fallback',
          component: ALLOWED_COMPONENTS.has(rawEvent?.component) ? rawEvent.component : 'api',
          feature_key: ALLOWED_FEATURE_KEYS.has(rawEvent?.featureKey) ? rawEvent.featureKey : 'ui_runtime',
          error_code: sanitizeIdentifierCode(rawEvent?.errorCode, 'UNEXPECTED_ERROR').toUpperCase(),
          correlation_id: normalizeCorrelationId(rawEvent?.correlationId) || null,
          fallback_reason: sanitizeDiagnosticText(err?.message || 'diagnostic_write_failed', 140)
        })
      );
    } catch {}
    return {
      recorded: false,
      fallback_logged: true,
      correlation_id: normalizeCorrelationId(rawEvent?.correlationId) || null
    };
  } finally {
    activeRecordingDepth = Math.max(0, activeRecordingDepth - 1);
  }
}

export async function reportDomainRouteFailure(
  db,
  req,
  err,
  { featureKey, operationName, routeTemplate, severity = 'error', errorCode = 'DOMAIN_ROUTE_FAILURE' } = {}
) {
  const existingCorr = normalizeCorrelationId(req?.__bsCorrelationId || req?.headers?.['x-correlation-id']);
  const correlationId = existingCorr || generateCorrelationId();
  if (req && typeof req === 'object') {
    req.__bsCorrelationId = correlationId;
    req.__bsDiagnosticRecorded = true;
  }
  await recordDiagnosticEvent(db, {
    component: 'api',
    featureKey,
    operationName,
    routeTemplate: routeTemplate || req?.url || '/api/unknown',
    httpMethod: req?.method || null,
    httpStatus: 503,
    severity,
    errorCode: sanitizeIdentifierCode(err?.code || errorCode, errorCode).toUpperCase(),
    message: err?.message || 'Domain route operation failed.',
    correlationId,
    retryable: true,
    outcomeState: 'temporarily_unavailable'
  });
  return correlationId;
}

export function computeReleaseRelationship(group, releases = [], activeServerSha = 'dev') {
  const normActive = normalizeReleaseSha(activeServerSha);
  const activeRel = Array.isArray(releases)
    ? releases.find(r => r.release_sha === normActive) || releases[0] || null
    : null;
  const hasPriorReleases =
    Array.isArray(releases) &&
    (releases.some(r => r.release_sha !== normActive) || Boolean(activeRel?.previous_release_sha));

  const firstSha = group.first_server_release_sha || null;
  const firstShort = firstSha ? firstSha.slice(0, 10) : 'unknown';
  const activeShort = normActive.slice(0, 10);

  let firstObservedCode = 'observed_on_release';
  let firstObservedLabel = `Observed on server release ${firstShort}`;

  if (
    activeRel &&
    hasPriorReleases &&
    firstSha === activeRel.release_sha &&
    new Date(group.first_seen_at).getTime() >= new Date(activeRel.first_seen_at).getTime() - 5000
  ) {
    firstObservedCode = 'first_observed_after_deployment';
    firstObservedLabel = `First observed after deployment ${activeShort} (timing only — not proof this change caused it)`;
  } else if (firstSha && firstSha !== normActive) {
    firstObservedCode = 'first_observed_before_active_deployment';
    firstObservedLabel = `First observed on earlier release ${firstShort} (before active deployment ${activeShort})`;
  }

  let fixStateCode = 'no_fix_recorded';
  let fixStateLabel = 'No suspected fixing commit recorded yet.';
  let fixCommitUrl = null;

  if (group.suspected_fix_sha) {
    const fixShort = group.suspected_fix_sha.slice(0, 10);
    if (/^[0-9a-f]{7,40}$/i.test(group.suspected_fix_sha)) {
      fixCommitUrl = `${REPOSITORY_COMMIT_BASE_URL}${group.suspected_fix_sha.toLowerCase()}`;
    }
    const deployedFix = Array.isArray(releases)
      ? releases.find(r => shaMatchesCandidate(r.release_sha, group.suspected_fix_sha))
      : null;

    if (group.continued_after_suspected_fix) {
      fixStateCode = 'continued_after_suspected_fix';
      fixStateLabel = `Occurrences continued on or after suspected fix ${fixShort}.`;
    } else if (deployedFix || shaMatchesCandidate(normActive, group.suspected_fix_sha)) {
      fixStateCode = 'deployed_no_new_occurrences_yet';
      fixStateLabel = `Suspected fix ${fixShort} is deployed; no occurrences observed after it yet (absence of events alone does not prove the defect is fixed).`;
    } else {
      fixStateCode = 'awaiting_deployment';
      fixStateLabel = `Suspected fix ${fixShort} recorded; deployment of that SHA has not been observed on this environment yet.`;
    }
  }

  return {
    active_server_release_sha: normActive,
    active_commit_url: /^[0-9a-f]{7,40}$/i.test(normActive) ? `${REPOSITORY_COMMIT_BASE_URL}${normActive}` : null,
    first_observed_code: firstObservedCode,
    first_observed_label: firstObservedLabel,
    causation_status: group.suspected_cause ? 'operator_hypothesis_recorded' : 'unconfirmed_timing_only',
    fix_state_code: fixStateCode,
    fix_state_label: fixStateLabel,
    suspected_fix_commit_url: fixCommitUrl,
    stale_client_note: group.stale_client_observed
      ? 'At least one browser report came from an older tab whose loaded release differed from the active server release.'
      : null
  };
}

export async function cleanupExpiredDiagnostics(db, { env = process.env } = {}) {
  const policy = getDiagnosticsRetentionPolicy(env);
  const res = await withDiagnosticsDb(db, async tx => {
    const samplesDel = await tx.query(
      `DELETE FROM diagnostic_event_samples
       WHERE received_at < now() - make_interval(days => $1)`,
      [policy.sample_retention_days]
    );

    const agedGroupsDel = await tx.query(
      `DELETE FROM diagnostic_incident_groups
       WHERE (triage_status = 'resolved' AND last_seen_at < now() - make_interval(days => $1))
          OR (last_seen_at < now() - make_interval(days => $2))`,
      [policy.resolved_group_retention_days, policy.open_group_retention_days]
    );

    const overflowGroupsDel = await tx.query(
      `DELETE FROM diagnostic_incident_groups
       WHERE id IN (
         SELECT id
         FROM diagnostic_incident_groups
         ORDER BY
           CASE WHEN triage_status = 'resolved' THEN 1 ELSE 0 END ASC,
           last_seen_at DESC,
           id DESC
         OFFSET $1
       )`,
      [policy.max_groups]
    );

    return {
      ok: true,
      deleted_samples: samplesDel.rowCount || 0,
      deleted_aged_groups: agedGroupsDel.rowCount || 0,
      deleted_overflow_groups: overflowGroupsDel.rowCount || 0,
      notes_deleted: 0,
      policy
    };
  });

  return (
    res || {
      ok: false,
      deleted_samples: 0,
      deleted_aged_groups: 0,
      deleted_overflow_groups: 0,
      notes_deleted: 0,
      policy
    }
  );
}
