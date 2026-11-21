// BiteShark Standalone Administration, Onboarding, Invitations, Moderation & Issues Router
//
// Enforces server-side authentication, row-locked transactional RBAC (`Customer`, `Vendor Staff`,
// `Vendor Owner`, `Admin: Mod`, `Admin: Top`), CSRF verification, rate limits, magic-byte evidence
// validation, last-Top protection, session revocation on role/status changes, and redacted audit logs.

import { auth } from '@biteshark/runtime-adapter';
import {
  UUID_RE,
  ROLE_LABELS,
  loadAccessContext,
  reverifyModeratorInTx,
  reverifyPlatformAdminInTx,
  reverifyVendorMembershipInTx,
  recordAuditLog,
  inspectWritePauseConfig,
  evaluateEffectiveVendorRestrictions,
  normalizeAdminLevel
} from '../lib/authz.js';
import { withTransaction } from '../lib/db-tx.js';
import { isLoopbackIp } from '../lib/client-ip.js';
import { readEnvCompat } from '../lib/env-compat.js';
import { extractClientRateKey } from '../lib/pager-notifications.js';
import { inspectNotificationRuntimeConfig } from '../lib/pager-notifications.js';
import {
  inspectAdminEmailReadiness,
  getPublicAuthDeliveryModeSummary,
  createAuthCorrelationId,
  dispatchInvitationEmail,
  dispatchSupportNotificationEmail
} from '../lib/standalone-auth.js';
import {
  CATEGORY_LABELS,
  REPORTER_URGENCY_LABELS,
  STAFF_PRIORITY_LABELS,
  SUPPORT_STATUS_LABELS,
  VALID_REPORTER_URGENCIES,
  VALID_STAFF_PRIORITIES,
  normalizeSupportStatusInput,
  normalizeSupportCategoryInput,
  resolveInitialUrgencyAndPriority,
  buildAutoSubjectFromDescription,
  sanitizeSupportContextFields,
  formatPublicTeamAuthorLabel,
  validateStaffStatusTransition,
  evaluateAssignmentMutation,
  serializeSupportTicketForReporter,
  autoSuggestDiagnosticLinksInTx
} from '../lib/support-tickets.js';
import {
  loadPersistedFeatureControls,
  evaluateFeatureControlsSnapshot,
  buildPublicFeatureControlsPayload,
  buildAdminFeatureControlsPayload,
  updateFeatureControlInTx
} from '../lib/feature-controls.js';
import {
  CLIENT_BUNDLE_VERSION,
  REPOSITORY_COMMIT_BASE_URL,
  ALLOWED_COMPONENTS,
  ALLOWED_SEVERITIES,
  ALLOWED_OUTCOMES,
  ALLOWED_TRIAGE_STATUSES,
  ALLOWED_FEATURE_KEYS,
  getDiagnosticsRetentionPolicy,
  sanitizeDiagnosticText,
  sanitizeIdentifierCode,
  sanitizeOperationName,
  sanitizeRouteTemplate,
  sanitizeSafeContext,
  normalizeCorrelationId,
  normalizeReleaseSha,
  recordDiagnosticEvent,
  computeReleaseRelationship,
  cleanupExpiredDiagnostics
} from '../lib/diagnostics.js';
import {
  buildAgeAssessmentRequiredPayload,
  daysInGregorianMonth,
  resolvePacificCalendarDateParts
} from '../lib/age-policy.js';
import {
  INVITATION_TTL_MS,
  MAX_EVIDENCE_BYTES,
  MAX_EVIDENCE_PER_APPLICATION,
  MAX_MOD_TEMP_RESTRICTION_HOURS,
  INVITATION_ROLE_LABELS,
  INVITATION_DELIVERY_LABELS,
  sha256Hex,
  generateOpaqueToken,
  normalizeEmailStrict,
  normalizeOptionalIdempotencyKey,
  parseBoundedPagination,
  sanitizeFilename,
  verifyEvidenceBufferAndMime,
  validateOptionalHttpUrl,
  validateProposedSlug,
  computeIssueSlaDueAt,
  recordTestSafeNotificationInTx,
  recordInvitationEventInTx,
  formatInvitationRowForAdmin,
  consumeGovernanceRateLimit
} from '../lib/admin-governance.js';

export const EVIDENCE_UPLOAD_MAX_JSON_BYTES = 900 * 1024; // 900 KiB JSON envelope for <= 512 KiB base64 file

const GOVERNANCE_PATHS = new Set([
  '/api/account/context',
  '/api/features',
  '/api/invitations/inspect',
  '/api/invitations/accept',
  '/api/vendor/members',
  '/api/vendor/staff-invitations',
  '/api/onboarding/applications',
  '/api/onboarding/evidence',
  '/api/community/report',
  '/api/issues',
  '/api/issues/reply',
  '/api/issues/reopen',
  '/api/issues/read',
  '/api/admin/overview',
  '/api/admin/email-readiness',
  '/api/admin/vendor-preview',
  '/api/admin/applications',
  '/api/admin/applications/decision',
  '/api/admin/vendors',
  '/api/admin/vendors/update',
  '/api/admin/accounts',
  '/api/admin/accounts/role',
  '/api/admin/accounts/status',
  '/api/admin/invitations',
  '/api/admin/invitations/create',
  '/api/admin/invitations/decision',
  '/api/admin/invitations/resend',
  '/api/admin/moderation',
  '/api/admin/moderation/decision',
  '/api/admin/issues',
  '/api/admin/issues/update',
  '/api/admin/issues/diagnostics',
  '/api/admin/readiness',
  '/api/admin/readiness/note',
  '/api/admin/readiness/update',
  '/api/admin/features',
  '/api/admin/features/update',
  '/api/diagnostics/report',
  '/api/admin/diagnostics',
  '/api/admin/diagnostics/detail',
  '/api/admin/diagnostics/triage',
  '/api/admin/diagnostics/note',
  '/api/admin/diagnostics/synthetic-test',
  '/api/admin/diagnostics/cleanup',
  '/api/admin/diagnostics/notify-tickets',
  '/api/admin/audit'
]);

export function isGovernanceApiPath(pathname) {
  const norm = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  return GOVERNANCE_PATHS.has(norm);
}

function maskEmail(email) {
  if (!email || !email.includes('@')) return '';
  const [local, dom] = email.split('@');
  const head = local.slice(0, Math.min(2, local.length));
  return `${head}***@${dom}`;
}

const READINESS_STATUS_CATALOG = Object.freeze([
  { code: 'not_assessed', label: 'Not assessed' },
  { code: 'decision_pending', label: 'Decision pending' },
  { code: 'proposed', label: 'Proposed' },
  { code: 'implemented_verification_pending', label: 'Implemented — verification pending' },
  { code: 'verified_internally', label: 'Verified internally' },
  { code: 'submitted_for_legal_review', label: 'Submitted for legal review' },
  { code: 'changes_requested', label: 'Changes requested' },
  { code: 'legally_approved', label: 'Legally approved for specified scope/version' },
  { code: 'not_applicable', label: 'Not applicable — with explanation' },
  { code: 'needs_re_review', label: 'Needs re-review' }
]);

const VALID_READINESS_STATUSES = new Set(READINESS_STATUS_CATALOG.map(s => s.code));

const LAUNCH_INCOMPLETE_REMINDER_TEXT =
  'Legal review and launch readiness remain incomplete. Draft policies are not approved for public rollout.';

const DEPLOYMENT_PORTAL_REMINDER_NOTE =
  'Governance reminder only: deployment automation (deploy/install-staging-release.sh) runs via operator SSH/CLI and is not technically blocked by this dashboard flag.';

function validateIsoCalendarDate(raw, { allowFuture = true } = {}) {
  if (raw === null || raw === undefined || String(raw).trim() === '') {
    return { ok: true, value: null };
  }
  const s = String(raw).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) {
    return { ok: false, error: 'Date must use YYYY-MM-DD format.' };
  }
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const maxD = daysInGregorianMonth(year, month);
  if (year < 2020 || year > 2100 || month < 1 || month > 12 || day < 1 || day > maxD) {
    return { ok: false, error: 'Enter an actual Gregorian calendar date (YYYY-MM-DD).' };
  }
  if (!allowFuture) {
    const today = resolvePacificCalendarDateParts();
    if (s > today.iso) {
      return { ok: false, error: 'Legal review date cannot be in the future.' };
    }
  }
  return { ok: true, value: s };
}

function serializeReadinessItemForActor(row, actorRole, historyRows = []) {
  const canViewCounsel = actorRole === 'top' || row.mod_counsel_access_granted === true;
  return {
    item_key: row.item_key,
    sort_order: row.sort_order,
    category: row.category,
    topic: row.topic,
    is_launch_critical: Boolean(row.is_launch_critical),
    mod_visible: Boolean(row.mod_visible),
    mod_counsel_access_granted: Boolean(row.mod_counsel_access_granted),
    current_practice: row.current_practice,
    unresolved_questions: row.unresolved_questions || null,
    status: row.status,
    not_applicable_explanation: row.not_applicable_explanation || null,
    stages: {
      decision_recorded: Boolean(row.decision_recorded),
      implemented_recorded: Boolean(row.implemented_recorded),
      tested_recorded: Boolean(row.tested_recorded),
      legally_reviewed: row.status === 'legally_approved'
    },
    decision_recorded: Boolean(row.decision_recorded),
    implemented_recorded: Boolean(row.implemented_recorded),
    tested_recorded: Boolean(row.tested_recorded),
    owner_label: row.owner_label,
    next_action: row.next_action,
    target_review_date: row.target_review_date || null,
    policy_version: row.policy_version || null,
    supporting_evidence: row.supporting_evidence || null,
    operational_notes: row.operational_notes || null,
    confidential_counsel_notes: canViewCounsel ? row.confidential_counsel_notes || null : null,
    confidential_counsel_redacted: !canViewCounsel && Boolean(row.confidential_counsel_notes),
    approved_doc_version: row.approved_doc_version || null,
    approved_jurisdiction_scope: row.approved_jurisdiction_scope || null,
    legal_reviewer_name: row.legal_reviewer_name || null,
    legal_reviewed_at: row.legal_reviewed_at || null,
    dependencies: Array.isArray(row.dependencies) ? row.dependencies : [],
    updated_by: row.updated_by || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    history: historyRows
  };
}

async function enableAdminTxGuards(tx, ctx) {
  await tx.query(
    `SELECT
       set_config('app.admin_portal', 'true', true),
       set_config('app.can_moderate', 'true', true),
       set_config('app.auth_internal', 'true', true),
       set_config('app.user_id', $1, true),
       set_config('app.user_email', $2, true)`,
    [ctx?.user?.id || '', ctx?.user?.email || '']
  );
}

function getRuntimeReleaseSha() {
  try {
    const val = String(readEnvCompat('RELEASE_SHA') || process.env.GITHUB_SHA || 'local').trim();
    return val.slice(0, 64) || 'local';
  } catch {
    return 'local';
  }
}

async function loadInvitationEventsMapInTx(tx, invitationIds) {
  const byId = new Map();
  if (!Array.isArray(invitationIds) || invitationIds.length === 0) return byId;
  await tx.query('SAVEPOINT inv_events_read');
  try {
    const { rows } = await tx.query(
      `SELECT
         id, invitation_id, event_type, actor_id, actor_role, delivery_mode,
         provider_status, provider_message_id, error_code, correlation_id, release_sha, note, created_at
       FROM account_invitation_events
       WHERE invitation_id = ANY($1::uuid[])
       ORDER BY created_at ASC, id ASC`,
      [invitationIds]
    );
    await tx.query('RELEASE SAVEPOINT inv_events_read');
    for (const r of rows) {
      const list = byId.get(r.invitation_id) || [];
      list.push(r);
      byId.set(r.invitation_id, list);
    }
  } catch (err) {
    await tx.query('ROLLBACK TO SAVEPOINT inv_events_read').catch(() => {});
    if (err?.code !== '42P01') throw err;
  }
  return byId;
}

async function deliverAndFinalizeIssuedInvitation({
  dbAdapter,
  ctx,
  invitationId,
  tokenVersion,
  rawToken,
  recipientEmail,
  requestedRole,
  vendorId = null,
  vendorName = null,
  expiresAt,
  actorId,
  actorRole,
  flow = 'invite_send',
  correlationId = createAuthCorrelationId()
}) {
  const releaseSha = getRuntimeReleaseSha();
  const sendRes = await dispatchInvitationEmail(dbAdapter, {
    invitationId,
    tokenVersion,
    rawToken,
    recipientEmail,
    roleKey: requestedRole,
    roleLabel: INVITATION_ROLE_LABELS[requestedRole] || requestedRole,
    vendorId,
    vendorName,
    expiresAtIso: expiresAt,
    flow,
    correlationId
  });

  const finalized = await withTransaction(dbAdapter, async tx => {
    await enableAdminTxGuards(tx, ctx);
    const { rows: curRows } = await tx.query(
      `SELECT ai.*, v.canonical_name AS vendor_name
       FROM account_invitations ai
       LEFT JOIN vendors v ON v.id = ai.vendor_id
       WHERE ai.id = $1
       FOR UPDATE OF ai`,
      [invitationId]
    );
    if (!curRows.length) return null;

    let updatedRow = curRows[0];
    if (updatedRow.status === 'issued' && Number(updatedRow.token_version || 1) === Number(tokenVersion)) {
      const sentNow =
        sendRes.ok && (sendRes.deliveryStatus === 'provider_accepted' || sendRes.deliveryStatus === 'staging_mailbox_only');
      const { rows: updRows } = await tx.query(
        `UPDATE account_invitations
         SET delivery_status = $2,
             delivery_mode = $3,
             send_attempt_count = send_attempt_count + $4,
             last_sent_at = CASE WHEN $5 THEN now() ELSE last_sent_at END,
             last_sent_by = $6,
             last_attempt_at = now(),
             provider_status = $7,
             provider_message_id = $8,
             last_error_code = $9,
             last_correlation_id = $10,
             updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [
          invitationId,
          sendRes.deliveryStatus,
          sendRes.deliveryMode || null,
          Number(sendRes.attemptsUsed || 0),
          sentNow,
          actorId,
          sendRes.providerStatus ?? null,
          sendRes.providerMessageId || null,
          sendRes.errorCode || null,
          sendRes.correlationId || null
        ]
      );
      if (updRows[0]) {
        updatedRow = { ...updRows[0], vendor_name: curRows[0].vendor_name || vendorName || null };
      }
    }

    const eventType =
      sendRes.deliveryStatus === 'provider_accepted'
        ? 'provider_accepted'
        : sendRes.deliveryStatus === 'staging_mailbox_only'
          ? 'staging_mailbox_recorded'
          : sendRes.deliveryStatus === 'delivery_uncertain'
            ? 'delivery_uncertain'
            : 'delivery_failed';

    await recordInvitationEventInTx(tx, {
      invitationId,
      eventType,
      actorId,
      actorRole,
      deliveryMode: sendRes.deliveryMode,
      providerStatus: sendRes.providerStatus,
      providerMessageId: sendRes.providerMessageId,
      errorCode: sendRes.errorCode,
      correlationId: sendRes.correlationId,
      releaseSha
    });

    await recordAuditLog(tx, {
      actorId,
      actorRole,
      vendorId: vendorId || null,
      targetType: 'account_invitation',
      targetId: invitationId,
      action: `invitation.${eventType}`,
      metadata: {
        requested_role: requestedRole,
        delivery_status: sendRes.deliveryStatus,
        delivery_mode: sendRes.deliveryMode,
        provider_status: sendRes.providerStatus ?? null,
        provider_message_id: sendRes.providerMessageId || null,
        error_code: sendRes.errorCode || null,
        correlation_id: sendRes.correlationId || null
      }
    });

    const eventsMap = await loadInvitationEventsMapInTx(tx, [invitationId]);
    return formatInvitationRowForAdmin(updatedRow, { events: eventsMap.get(invitationId) || [] });
  });

  const deliverySummary = {
    ok: Boolean(sendRes.ok),
    status: sendRes.deliveryStatus,
    status_label: INVITATION_DELIVERY_LABELS[sendRes.deliveryStatus] || sendRes.deliveryStatus,
    mode: sendRes.deliveryMode,
    provider_status: sendRes.providerStatus ?? null,
    provider_message_id: sendRes.providerMessageId || null,
    error_code: sendRes.errorCode || null,
    correlation_id: sendRes.correlationId || null
  };

  return {
    invitation: finalized,
    delivery: deliverySummary,
    // Expose `accept_path` ONLY in offline `staging_mailbox` test mode; NEVER expose raw tokens
    // in API responses when real transactional email delivery (`resend_https` / `webhook_https`) is configured.
    exposeTestAcceptPath: sendRes.deliveryMode === 'staging_mailbox' ? `/#accept-invite=${rawToken}` : undefined
  };
}

async function recordAndDispatchSupportNotification({
  dbAdapter,
  issueId,
  ticketNumber,
  recipientUserId,
  recipientEmail,
  eventKind,
  dedupeKey,
  statusLabel = '',
  isCritical = false
}) {
  if (!issueId || !recipientUserId || !dedupeKey) {
    return {
      notification_delivery: 'recorded_in_app_only',
      delivery_status: 'in_app_only',
      skipped_duplicate: false
    };
  }

  let notifId = null;
  let throttledRecent = false;
  try {
    await withTransaction(dbAdapter, async tx => {
      await tx.query(
        "SELECT set_config('app.auth_internal', 'true', true), set_config('app.admin_portal', 'true', true), set_config('app.user_id', $1, true)",
        [recipientUserId]
      );
      // Anti-loop cooldown: do not emit repeated external emails of the same event_kind on the same ticket within 5 minutes
      const recentCheck = await tx.query(
        `SELECT id FROM support_issue_notifications
         WHERE issue_id = $1 AND event_kind = $2 AND delivery_status = 'provider_accepted'
           AND created_at >= now() - interval '5 minutes'
         LIMIT 1`,
        [issueId, eventKind]
      );
      if (recentCheck.rows.length > 0) {
        throttledRecent = true;
      }
      const { rows } = await tx.query(
        `INSERT INTO support_issue_notifications (
           issue_id, recipient_user_id, event_kind, dedupe_key, delivery_status, delivery_mode
         )
         VALUES ($1, $2, $3, $4, $5, 'pending')
         ON CONFLICT (issue_id, dedupe_key) DO NOTHING
         RETURNING id`,
        [issueId, recipientUserId, eventKind, dedupeKey, throttledRecent ? 'in_app_only' : 'queued']
      );
      notifId = rows[0]?.id || null;
    });
  } catch (err) {
    // Graceful fallback if table not yet migrated in legacy rollback test
    if (err?.code === '42P01') {
      return { notification_delivery: 'recorded_in_app_only', delivery_status: 'in_app_only' };
    }
    throw err;
  }

  if (!notifId || throttledRecent) {
    return {
      notification_delivery: 'recorded_in_app_only',
      delivery_status: 'in_app_only',
      skipped_duplicate: !notifId,
      throttled_cooldown: throttledRecent
    };
  }

  const sendOut = await dispatchSupportNotificationEmail(dbAdapter, {
    notificationId: notifId,
    recipientEmail,
    ticketNumber,
    eventKind,
    statusLabel,
    isCritical
  });

  try {
    await withTransaction(dbAdapter, async tx => {
      await tx.query(
        "SELECT set_config('app.auth_internal', 'true', true), set_config('app.admin_portal', 'true', true), set_config('app.user_id', $1, true)",
        [recipientUserId]
      );
      await tx.query(
        `UPDATE support_issue_notifications
         SET delivery_status = $2,
             delivery_mode = $3,
             attempt_count = $4,
             provider_status = $5,
             provider_message_id = $6,
             error_code = $7,
             correlation_id = $8,
             updated_at = now()
         WHERE id = $1`,
        [
          notifId,
          sendOut.deliveryStatus,
          sendOut.deliveryMode || 'disabled',
          sendOut.attemptsUsed || 0,
          sendOut.providerStatus ?? null,
          sendOut.providerMessageId || null,
          sendOut.errorCode || null,
          sendOut.correlationId || null
        ]
      );
    });
  } catch {}

  const legacySummary =
    sendOut.deliveryStatus === 'provider_accepted'
      ? 'provider_accepted'
      : sendOut.deliveryStatus === 'delivery_failed' || sendOut.deliveryStatus === 'delivery_uncertain'
        ? sendOut.deliveryStatus
        : 'recorded_in_app_only';

  return {
    notification_delivery: legacySummary,
    delivery_status: sendOut.deliveryStatus,
    delivery_mode: sendOut.deliveryMode,
    provider_status: sendOut.providerStatus ?? null,
    provider_message_id: sendOut.providerMessageId || null,
    error_code: sendOut.errorCode || null,
    correlation_id: sendOut.correlationId || null
  };
}

export async function handleGovernanceApiRequest({
  pathname,
  method,
  req,
  query,
  body,
  dbAdapter,
  sendJson,
  rawRes
}) {
  const normPath = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;

  // =========================================================================
  // 0. Untrusted Browser Operational Failure Report (`POST /api/diagnostics/report`)
  // =========================================================================
  if (normPath === '/api/diagnostics/report') {
    if (method !== 'POST') return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'POST' });

    const rawFeature = typeof body?.feature_key === 'string' ? body.feature_key.trim().toLowerCase() : '';
    const featureKey =
      ALLOWED_FEATURE_KEYS.has(rawFeature) && rawFeature !== 'synthetic_verification' ? rawFeature : null;
    const rawCode = typeof body?.error_code === 'string' ? body.error_code.trim() : '';
    const rawOp = typeof body?.operation_name === 'string' ? body.operation_name.trim() : '';
    const rawMsg = typeof body?.message === 'string' ? body.message.trim() : '';

    if (!featureKey || rawCode.length < 2 || rawOp.length < 2 || rawMsg.length < 2) {
      return sendJson(400, {
        error: 'Valid feature_key, operation_name, error_code, and message are required.',
        code: 'INVALID_DIAGNOSTIC_REPORT'
      });
    }

    // Ignore normal expected client validation / auth / 404 statuses so dashboards are not flooded by typos.
    const reportedStatus = Number.isInteger(body?.http_status) ? body.http_status : null;
    if (
      reportedStatus !== null &&
      [400, 401, 403, 404, 405, 409, 422, 429].includes(reportedStatus) &&
      !/MALFORMED|STORAGE|TILE|STALE|UNCERTAIN/i.test(rawCode)
    ) {
      return sendJson(202, { ok: true, accepted: false, ignored: 'expected_http_status' });
    }

    const maxReportsPerWindow = Math.max(
      3,
      Math.min(120, Number.parseInt(readEnvCompat('DIAGNOSTICS_REPORT_MAX_PER_WINDOW') || '25', 10) || 25)
    );
    const windowSeconds = Math.max(
      60,
      Math.min(3600, Number.parseInt(readEnvCompat('DIAGNOSTICS_REPORT_WINDOW_SEC') || '600', 10) || 600)
    );

    try {
      const rl = await withTransaction(dbAdapter, async tx =>
        consumeGovernanceRateLimit(tx, {
          scope: 'diag_report',
          subjectKey: extractClientRateKey(req),
          maxHits: maxReportsPerWindow,
          windowSeconds
        })
      );
      if (!rl.allowed) {
        return sendJson(
          429,
          {
            error: 'Diagnostic report rate limit reached. Please wait before sending additional browser reports.',
            code: 'DIAGNOSTIC_RATE_LIMITED',
            retry_after_seconds: rl.retryAfterSeconds
          },
          { 'Retry-After': String(rl.retryAfterSeconds) }
        );
      }
    } catch {
      // Never break or recurse if rate-limit table is degraded; continue with bounded fallback guard.
    }

    const rawSev = typeof body?.severity === 'string' ? body.severity.trim().toLowerCase() : 'error';
    const clampedSeverity =
      rawSev === 'info' || rawSev === 'warning' || rawSev === 'error' ? rawSev : 'error';

    const rec = await recordDiagnosticEvent(dbAdapter, {
      component: 'browser',
      trustLevel: 'browser_untrusted',
      featureKey,
      operationName: sanitizeOperationName(rawOp),
      routeTemplate: sanitizeRouteTemplate(typeof body?.route_template === 'string' ? body.route_template : ''),
      httpMethod: typeof body?.http_method === 'string' ? body.http_method : null,
      httpStatus: reportedStatus,
      severity: clampedSeverity,
      errorCode: sanitizeIdentifierCode(rawCode, 'CLIENT_OPERATION_FAILED').toUpperCase(),
      message: rawMsg,
      userImpact: typeof body?.user_impact === 'string' ? body.user_impact : undefined,
      correlationId:
        normalizeCorrelationId(body?.correlation_id) || req?.__bsCorrelationId || undefined,
      serverReleaseSha: req?.__bsServerReleaseSha || readEnvCompat('RELEASE_SHA') || 'dev',
      clientBuildVersion:
        typeof body?.client_build_version === 'string' ? body.client_build_version.slice(0, 48) : null,
      clientLoadedReleaseSha:
        typeof body?.client_loaded_release_sha === 'string' ? body.client_loaded_release_sha.slice(0, 48) : null,
      durationMs: Number.isFinite(body?.duration_ms) ? body.duration_ms : null,
      retryable: typeof body?.retryable === 'boolean' ? body.retryable : null,
      outcomeState: ALLOWED_OUTCOMES.has(body?.outcome_state) ? body.outcome_state : 'failed',
      safeContext: sanitizeSafeContext(body?.safe_context)
    });

    return sendJson(202, {
      ok: true,
      accepted: Boolean(rec?.recorded),
      correlation_id: rec?.correlation_id || req?.__bsCorrelationId || null
    });
  }

  const ctx = await loadAccessContext(req, auth, dbAdapter);

  // =========================================================================
  // 1. Account & Role Context (`GET /api/account/context`)
  // =========================================================================
  if (normPath === '/api/account/context') {
    if (method !== 'GET') return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'GET' });

    const coarseArea = (() => {
      const enabled = String(readEnvCompat('ENABLE_PROXY_COARSE_GEO', { defaultValue: '0' }) || '').trim() === '1';
      if (!enabled) {
        return { status: 'deferred', suggested_town: null, supported_region: 'Sonoma County' };
      }
      const peerAddr = req?.socket?.remoteAddress;
      if (peerAddr && !isLoopbackIp(peerAddr)) {
        return { status: 'deferred', suggested_town: null, supported_region: 'Sonoma County' };
      }
      const rawCity = String(req?.headers?.['x-geo-city'] || '')
        .replace(/[\x00-\x1f\x7f]/g, ' ')
        .trim()
        .slice(0, 64);
      const rawRegion = String(req?.headers?.['x-geo-region'] || '')
        .replace(/[\x00-\x1f\x7f]/g, ' ')
        .trim()
        .toUpperCase()
        .slice(0, 16);
      const rawCountry = String(req?.headers?.['x-geo-country'] || '')
        .replace(/[\x00-\x1f\x7f]/g, ' ')
        .trim()
        .toUpperCase()
        .slice(0, 8);
      if (!rawCity && !rawRegion && !rawCountry) {
        return { status: 'deferred', suggested_town: null, supported_region: 'Sonoma County' };
      }
      const supportedTowns = [
        'Santa Rosa',
        'Petaluma',
        'Rohnert Park',
        'Cotati',
        'Sonoma',
        'Sebastopol',
        'Healdsburg',
        'Windsor',
        'Cloverdale',
        'Glen Ellen',
        'Guerneville',
        'Bodega Bay'
      ];
      if ((!rawCountry || rawCountry === 'US') && (!rawRegion || rawRegion === 'CA' || rawRegion === 'US-CA')) {
        const lowerCity = rawCity.toLowerCase();
        const match = supportedTowns.find(t => t.toLowerCase() === lowerCity);
        if (match) {
          return { status: 'suggested', suggested_town: match, supported_region: 'Sonoma County' };
        }
      }
      return { status: 'outside_supported_area', suggested_town: null, supported_region: 'Sonoma County' };
    })();

    if (!ctx.authenticated || !ctx.user) {
      return sendJson(200, {
        authenticated: false,
        user: null,
        role_labels: [],
        admin: null,
        admin_level: null,
        admin_label: null,
        capabilities: {
          can_access_admin_portal: false,
          can_act_on_behalf: false,
          is_top_admin: false
        },
        memberships: [],
        vendor_memberships: [],
        my_applications_count: 0,
        my_open_issues_count: 0,
        unread_support_count: 0,
        coarse_area: coarseArea
      });
    }

    let myAppsCount = 0;
    let myIssuesCount = 0;
    let unreadSupportCount = 0;
    let ageEligibilityStatus = 'not_assessed';
    let agePolicyVersion = null;
    try {
      await withTransaction(dbAdapter, async tx => {
        await tx.query(
          "SELECT set_config('app.user_id', $1, true), set_config('app.auth_internal', 'true', true)",
          [ctx.user.id]
        );
        const ageRes = await tx.query(
          'SELECT age_eligibility_status, age_policy_version FROM auth_users WHERE id = $1',
          [ctx.user.id]
        );
        if (ageRes.rows[0]) {
          ageEligibilityStatus = ageRes.rows[0].age_eligibility_status || 'not_assessed';
          agePolicyVersion = ageRes.rows[0].age_policy_version || null;
        }
        if (ageEligibilityStatus === 'eligible_14_plus') {
          const appsRes = await tx.query(
            'SELECT count(*)::int AS c FROM vendor_applications WHERE applicant_user_id = $1',
            [ctx.user.id]
          );
          await tx.query('SAVEPOINT ctx_support_counts');
          try {
            const issRes = await tx.query(
              `SELECT
                 count(*) FILTER (WHERE status IN ('open', 'in_review', 'in_progress', 'waiting'))::int AS open_c,
                 count(*) FILTER (
                   WHERE last_public_staff_activity_at IS NOT NULL
                     AND last_public_staff_activity_at > reporter_last_read_at
                 )::int AS unread_c
               FROM support_issues
               WHERE reporter_user_id = $1`,
              [ctx.user.id]
            );
            await tx.query('RELEASE SAVEPOINT ctx_support_counts');
            myIssuesCount = issRes.rows[0]?.open_c || 0;
            unreadSupportCount = issRes.rows[0]?.unread_c || 0;
          } catch (cntErr) {
            await tx.query('ROLLBACK TO SAVEPOINT ctx_support_counts').catch(() => {});
            if (cntErr?.code === '42703') {
              const fallbackIss = await tx.query(
                "SELECT count(*)::int AS c FROM support_issues WHERE reporter_user_id = $1 AND status IN ('open', 'in_progress', 'waiting')",
                [ctx.user.id]
              );
              myIssuesCount = fallbackIss.rows[0]?.c || 0;
            } else {
              throw cntErr;
            }
          }
          myAppsCount = appsRes.rows[0]?.c || 0;
        }
      });
    } catch (ctxErr) {
      if (ctxErr?.code !== '42P01') {
        return sendJson(503, {
          error: 'Account context is temporarily unavailable. Please try again in a moment.',
          code: 'ACCOUNT_CONTEXT_UNAVAILABLE'
        });
      }
    }

    const requiresAgeAssessment = ageEligibilityStatus !== 'eligible_14_plus';
    if (requiresAgeAssessment) {
      // Data minimization on exempt bootstrap endpoint: expose ONLY minimum session info needed
      // to render the one-time age assessment; withhold memberships, roles, admin flags, and counts.
      return sendJson(200, {
        authenticated: true,
        user: {
          id: ctx.user.id,
          email: ctx.user.email,
          age_eligibility_status: ageEligibilityStatus,
          requires_age_assessment: true
        },
        age_eligibility_status: ageEligibilityStatus,
        age_policy_version: agePolicyVersion,
        requires_age_assessment: true,
        assessment_url: '/login.html?assess=1',
        role_labels: [],
        admin_level: null,
        admin_label: null,
        capabilities: {
          can_access_admin_portal: false,
          can_act_on_behalf: false,
          is_top_admin: false
        },
        admin: null,
        memberships: [],
        vendor_memberships: [],
        my_applications_count: 0,
        my_open_issues_count: 0,
        unread_support_count: 0,
        coarse_area: coarseArea
      });
    }

    const memList = Array.from(ctx.memberships.values());
    return sendJson(200, {
      authenticated: true,
      user: {
        id: ctx.user.id,
        email: ctx.user.email,
        age_eligibility_status: ageEligibilityStatus,
        requires_age_assessment: requiresAgeAssessment
      },
      age_eligibility_status: ageEligibilityStatus,
      age_policy_version: agePolicyVersion,
      requires_age_assessment: requiresAgeAssessment,
      role_labels: ctx.roleLabels,
      admin_level: ctx.adminLevel,
      admin_label: ctx.adminLabel,
      capabilities: {
        can_access_admin_portal: ctx.isModAdmin,
        can_act_on_behalf: ctx.isTopAdmin,
        is_top_admin: ctx.isTopAdmin
      },
      admin: ctx.isModAdmin
        ? {
            is_admin: true,
            level: ctx.adminLevel,
            label: ctx.adminLabel,
            can_act_on_behalf: ctx.isTopAdmin,
            portal_url: '/admin'
          }
        : null,
      memberships: memList,
      vendor_memberships: memList,
      my_applications_count: myAppsCount,
      my_open_issues_count: myIssuesCount,
      unread_support_count: unreadSupportCount,
      coarse_area: coarseArea
    });
  }

  // =========================================================================
  // 1B. Public Safe Feature-Controls Snapshot (`GET /api/features`)
  // =========================================================================
  if (normPath === '/api/features') {
    if (method !== 'GET') {
      return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'GET' });
    }
    const persisted = await loadPersistedFeatureControls(dbAdapter, { requireTablePresent: true });
    // Unassessed accounts do not receive `staff_beta` audience privileges before completing 14+ check
    const eligibleCtx = ctx.authenticated && !req.user?.requires_age_assessment ? ctx : null;
    const rawVp = typeof query.viewpoint === 'string' ? query.viewpoint.trim().toLowerCase() : '';
    const viewpointMode =
      eligibleCtx && eligibleCtx.isModAdmin && rawVp === 'customer' ? 'customer_preview' : null;
    const evaluated = evaluateFeatureControlsSnapshot({
      persistedResult: persisted,
      accessCtx: eligibleCtx,
      viewpointMode
    });
    return sendJson(200, buildPublicFeatureControlsPayload(evaluated));
  }

  // =========================================================================
  // 2. Invitation Inspection & Verified Acceptance (`/api/invitations/*`)
  // =========================================================================
  if (normPath === '/api/invitations/inspect') {
    if (method !== 'GET' && method !== 'POST') {
      return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'GET, POST' });
    }
    const rawToken = typeof (body?.token || query.token) === 'string' ? String(body?.token || query.token).trim() : '';
    if (rawToken.length < 24 || rawToken.length > 128) {
      return sendJson(404, { valid: false, code: 'INVITATION_NOT_FOUND', error: 'Invitation not found or invalid.' });
    }
    const tokenHash = sha256Hex(rawToken);
    const out = await withTransaction(dbAdapter, async tx => {
      await tx.query("SELECT set_config('app.admin_portal', 'true', true)");
      const { rows } = await tx.query(
        `SELECT
           id, email_normalized, requested_role, vendor_id, status, delivery_status,
           expires_at, consumed_at, revoked_at
         FROM account_invitations
         WHERE token_sha256 = $1`,
        [tokenHash]
      );
      if (!rows.length) return null;
      const inv = rows[0];
      const expired = inv.expires_at && new Date(inv.expires_at).getTime() <= Date.now();
      if (inv.status === 'consumed' || inv.consumed_at) {
        return {
          valid: false,
          httpStatus: 409,
          code: 'INVITATION_ALREADY_USED',
          status: 'consumed',
          error: 'This invitation has already been accepted and cannot be used again. Sign in normally with your BiteShark account.'
        };
      }
      if (inv.status === 'revoked' || inv.revoked_at) {
        return {
          valid: false,
          httpStatus: 409,
          code: 'INVITATION_REVOKED',
          status: 'revoked',
          error:
            inv.delivery_status === 'superseded'
              ? 'This invitation link was replaced by a newer invitation. Open the most recent BiteShark invitation email.'
              : 'This invitation was revoked by an administrator and is no longer active.'
        };
      }
      if (expired || inv.status === 'expired') {
        return {
          valid: false,
          httpStatus: 410,
          code: 'INVITATION_EXPIRED',
          status: 'expired',
          expires_at: inv.expires_at,
          error: 'This invitation has expired. Ask a BiteShark administrator to send a fresh invitation.'
        };
      }
      if (inv.status !== 'issued') {
        return {
          valid: false,
          httpStatus: 409,
          code: 'INVITATION_INACTIVE',
          status: inv.status,
          error: 'This invitation is not yet active.'
        };
      }
      let vendorName = null;
      if (inv.vendor_id) {
        const vr = await tx.query('SELECT canonical_name FROM vendors WHERE id = $1', [inv.vendor_id]);
        vendorName = vr.rows[0]?.canonical_name || null;
      }
      const masked = maskEmail(inv.email_normalized);
      const roleLabel = INVITATION_ROLE_LABELS[inv.requested_role] || inv.requested_role;
      const sessionEmailNorm = ctx.authenticated && ctx.user?.email ? normalizeEmailStrict(ctx.user.email) : null;
      const emailMatchesSession = sessionEmailNorm ? sessionEmailNorm === inv.email_normalized : null;

      return {
        valid: true,
        invitation_id: inv.id,
        email_hint: masked,
        requested_role: inv.requested_role,
        requested_role_label: roleLabel,
        vendor_id: inv.vendor_id,
        vendor_name: vendorName,
        expires_at: inv.expires_at,
        full_authority_warning: inv.requested_role === 'top',
        email_matches_session: emailMatchesSession,
        invitation: {
          id: inv.id,
          masked_email: masked,
          requested_role: inv.requested_role,
          role_label: roleLabel,
          vendor_id: inv.vendor_id,
          vendor_name: vendorName,
          expires_at: inv.expires_at,
          full_authority_warning: inv.requested_role === 'top',
          email_matches_session: emailMatchesSession
        }
      };
    });
    if (!out) {
      return sendJson(404, { valid: false, code: 'INVITATION_NOT_FOUND', error: 'Invitation is invalid or not found.' });
    }
    if (!out.valid) {
      return sendJson(out.httpStatus || 409, {
        valid: false,
        code: out.code || 'INVITATION_INACTIVE',
        status: out.status || null,
        expires_at: out.expires_at || null,
        error: out.error || 'Invitation is invalid, already used, or expired.'
      });
    }
    return sendJson(200, out);
  }

  if (normPath === '/api/invitations/accept') {
    if (method !== 'POST') return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'POST' });
    if (!ctx.authenticated || !ctx.user?.id || !ctx.user?.email) {
      return sendJson(401, {
        error: 'Sign in and verify ownership of the invited email address before accepting an invitation.',
        code: 'EMAIL_VERIFICATION_REQUIRED'
      });
    }
    const rawToken = typeof body.token === 'string' ? body.token.trim() : '';
    if (rawToken.length < 24 || rawToken.length > 128) {
      return sendJson(400, { error: 'A valid invitation token is required.' });
    }
    const tokenHash = sha256Hex(rawToken);
    const userEmailNorm = normalizeEmailStrict(ctx.user.email);
    const releaseSha = getRuntimeReleaseSha();

    const outcome = await withTransaction(dbAdapter, async tx => {
      // Serialize concurrent platform-role mutations in deterministic lock order
      await tx.query("SELECT pg_advisory_xact_lock(hashtext('biteshark_platform_roles_mutation'))");
      await enableAdminTxGuards(tx, ctx);
      const rl = await consumeGovernanceRateLimit(tx, {
        scope: 'invite_accept',
        subjectKey: ctx.user.id,
        maxHits: 12,
        windowSeconds: 900
      });
      if (!rl.allowed) {
        return { status: 429, body: { error: 'Too many invitation attempts. Try again shortly.' } };
      }

      // Lock `auth_users` (`FOR SHARE`) to verify active status (`disabled_at IS NULL`) and 14+ age eligibility
      // without deadlocking against `verifySessionAndEligibilityInTx` (`FOR SHARE`) under concurrent accepts.
      const userCheckRes = await tx.query(
        'SELECT id, disabled_at, age_eligibility_status FROM auth_users WHERE id = $1 FOR SHARE',
        [ctx.user.id]
      );
      if (!userCheckRes.rows.length || userCheckRes.rows[0].disabled_at) {
        return {
          status: 403,
          body: {
            error: 'This account is suspended and cannot redeem invitations.',
            code: 'ACCOUNT_SUSPENDED'
          }
        };
      }
      if (userCheckRes.rows[0].age_eligibility_status !== 'eligible_14_plus') {
        return {
          status: 403,
          body: {
            error:
              'Complete the minimum account age check (14+) on your BiteShark account before accepting an invitation.',
            code: 'AGE_ASSESSMENT_REQUIRED'
          }
        };
      }

      const { rows } = await tx.query(
        `SELECT *
         FROM account_invitations
         WHERE token_sha256 = $1
         FOR UPDATE`,
        [tokenHash]
      );
      if (!rows.length) {
        return { status: 404, body: { error: 'Invitation not found or expired.', code: 'INVITATION_NOT_FOUND' } };
      }
      const inv = rows[0];
      if (inv.status === 'consumed' || inv.consumed_at) {
        return {
          status: 409,
          body: { error: 'This invitation has already been accepted.', code: 'INVITATION_ALREADY_USED' }
        };
      }
      if (inv.status === 'revoked' || inv.revoked_at) {
        return {
          status: 409,
          body: { error: 'This invitation was revoked or replaced and is no longer active.', code: 'INVITATION_REVOKED' }
        };
      }
      if (inv.status !== 'issued') {
        return { status: 409, body: { error: 'This invitation is no longer active.', code: 'INVITATION_INACTIVE' } };
      }
      if (!inv.expires_at || new Date(inv.expires_at).getTime() <= Date.now()) {
        await tx.query("UPDATE account_invitations SET status = 'expired', updated_at = now() WHERE id = $1", [inv.id]);
        await recordInvitationEventInTx(tx, {
          invitationId: inv.id,
          eventType: 'expired',
          actorId: ctx.user.id,
          actorRole: 'invite_recipient',
          releaseSha,
          note: 'Invitation expired prior to redemption attempt'
        });
        return { status: 410, body: { error: 'This invitation has expired.', code: 'INVITATION_EXPIRED' } };
      }
      if (!userEmailNorm || inv.email_normalized !== userEmailNorm) {
        return {
          status: 403,
          body: {
            error: `Signed-in account (${ctx.user.email}) does not match the invited email address. Sign out and verify the invited address.`,
            code: 'INVITATION_EMAIL_MISMATCH'
          }
        };
      }

      // Enforce privilege provenance check before granting Mod/Top
      if (inv.requested_role === 'mod' || inv.requested_role === 'top') {
        if (inv.initiator_role === 'mod' && (!inv.approved_by || inv.approved_by === inv.initiated_by)) {
          return { status: 403, body: { error: 'Privileged invitation lacks Admin: Top approval.' } };
        }
        await tx.query(
          `INSERT INTO platform_roles (user_id, role, granted_by, notes, updated_at)
           VALUES ($1, $2, $3, $4, now())
           ON CONFLICT (user_id) DO UPDATE
             SET role = CASE
               WHEN platform_roles.role IN ('top', 'platform_admin') AND EXCLUDED.role = 'mod' THEN platform_roles.role
               ELSE EXCLUDED.role
             END,
             granted_by = EXCLUDED.granted_by,
             updated_at = now()`,
          [ctx.user.id, inv.requested_role, inv.approved_by || inv.initiated_by, 'Accepted verified invitation']
        );
        if (inv.requested_role === 'top') {
          await tx.query('DELETE FROM platform_role_revocations WHERE user_id = $1', [ctx.user.id]);
        }
      } else if (inv.requested_role === 'vendor_staff') {
        if (!inv.vendor_id) {
          return { status: 400, body: { error: 'Staff invitation is missing target vendor.' } };
        }
        await tx.query("SELECT set_config('app.is_platform_admin', 'true', true)");
        await tx.query(
          `INSERT INTO vendor_memberships (vendor_id, user_id, role, granted_by)
           VALUES ($1, $2, 'staff', $3)
           ON CONFLICT (vendor_id, user_id) DO NOTHING`,
          [inv.vendor_id, ctx.user.id, inv.initiated_by]
        );
      } else if (inv.requested_role === 'vendor_owner') {
        // Vendor owner invitations NEVER bypass vendor onboarding review & Top approval!
        let prefillName = 'Prospective Sonoma Vendor';
        let prefillCity = 'Santa Rosa';
        let prefillCuisine = 'Mexican';
        let prefillKind = 'food_truck';
        if (inv.vendor_id) {
          const vr = await tx.query('SELECT canonical_name, city, cuisine, listing_kind FROM vendors WHERE id = $1', [
            inv.vendor_id
          ]);
          if (vr.rows[0]) {
            prefillName = vr.rows[0].canonical_name;
            prefillCity = vr.rows[0].city;
            prefillCuisine = vr.rows[0].cuisine;
            prefillKind = vr.rows[0].listing_kind;
          }
        }
        const existingApp = await tx.query(
          `SELECT id FROM vendor_applications
           WHERE applicant_user_id = $1 AND status IN ('draft', 'submitted', 'needs_info')
           LIMIT 1`,
          [ctx.user.id]
        );
        if (!existingApp.rows.length) {
          const genSlug = inv.vendor_id ? null : `vendor-${ctx.user.id.slice(-8).toLowerCase()}`;
          await tx.query(
            `INSERT INTO vendor_applications (
               applicant_user_id, applicant_email, claim_type, target_vendor_id, proposed_slug,
               business_name, city, cuisine, listing_kind, service_area,
               contact_name, contact_email, permit_or_license_summary, ownership_statement, status
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'Sonoma County', 'Invited Applicant', $2,
                     'Pending applicant permit details', 'Invited vendor claim — complete details and submit for Admin: Top review.', 'draft')`,
            [
              ctx.user.id,
              userEmailNorm,
              inv.vendor_id ? 'existing_listing' : 'new_listing',
              inv.vendor_id || null,
              genSlug,
              prefillName,
              prefillCity,
              prefillCuisine,
              prefillKind
            ]
          );
        }
      }

      const consumeUpd = await tx.query(
        `UPDATE account_invitations
         SET status = 'consumed',
             consumed_by_user_id = $2,
             consumed_at = now(),
             updated_at = now()
         WHERE id = $1
           AND status = 'issued'
           AND consumed_at IS NULL
           AND revoked_at IS NULL
         RETURNING id`,
        [inv.id, ctx.user.id]
      );
      if (consumeUpd.rowCount !== 1) {
        return {
          status: 409,
          body: { error: 'This invitation has already been accepted.', code: 'INVITATION_ALREADY_USED' }
        };
      }

      await recordInvitationEventInTx(tx, {
        invitationId: inv.id,
        eventType: 'accepted',
        actorId: ctx.user.id,
        actorRole: 'invite_recipient',
        releaseSha,
        note: `Accepted ${inv.requested_role} invitation`
      });

      await recordAuditLog(tx, {
        actorId: ctx.user.id,
        actorRole: 'invite_recipient',
        vendorId: inv.vendor_id || null,
        targetType: 'account_invitation',
        targetId: inv.id,
        action: 'invitation.accept',
        metadata: {
          requested_role: inv.requested_role,
          initiated_by: inv.initiated_by
        }
      });

      return {
        status: 200,
        body: {
          ok: true,
          accepted_role: inv.requested_role,
          accepted_role_label: INVITATION_ROLE_LABELS[inv.requested_role],
          vendor_id: inv.vendor_id,
          requires_vendor_application_review: inv.requested_role === 'vendor_owner'
        }
      };
    });

    return sendJson(outcome.status, outcome.body);
  }

  // =========================================================================
  // 3. Approved Vendor Owner Team Management (`/api/vendor/*`)
  // =========================================================================
  if (normPath === '/api/vendor/members') {
    if (!ctx.authenticated) return sendJson(401, { error: 'Sign in is required.' });
    const vendorId = String(query.vendor_id || body?.vendor_id || '').trim();
    if (!vendorId) return sendJson(400, { error: 'vendor_id is required.' });

    if (method === 'GET') {
      const mem = ctx.memberships.get(vendorId);
      if ((!mem || mem.role !== 'owner' || mem.restrictions?.vendor_access_suspended) && !ctx.isTopAdmin) {
        return sendJson(403, { error: 'Approved Vendor Owner permission is required.' });
      }
      const out = await withTransaction(dbAdapter, async tx => {
        await tx.query("SELECT set_config('app.auth_internal', 'true', true), set_config('app.admin_portal', 'true', true)");
        const { rows } = await tx.query(
          `SELECT m.user_id, m.role, m.created_at, au.email_normalized
           FROM vendor_memberships m
           LEFT JOIN auth_users au ON au.id = m.user_id
           WHERE m.vendor_id = $1
           ORDER BY m.role ASC, m.created_at ASC`,
          [vendorId]
        );
        return rows.map(r => ({
          user_id: r.user_id,
          email: r.email_normalized || null,
          role: r.role,
          role_label: r.role === 'owner' ? ROLE_LABELS.owner : ROLE_LABELS.staff,
          created_at: r.created_at
        }));
      });
      return sendJson(200, { vendor_id: vendorId, members: out });
    }

    if (method === 'DELETE') {
      const targetUserId = String(body?.user_id || query.user_id || '').trim();
      if (!targetUserId) return sendJson(400, { error: 'user_id is required.' });
      const outcome = await withTransaction(dbAdapter, async tx => {
        const verified = await reverifyVendorMembershipInTx(tx, ctx, vendorId, 'owner');
        if (!verified.ok) return { status: verified.status, body: { error: verified.error } };
        const { rows } = await tx.query(
          'SELECT role FROM vendor_memberships WHERE vendor_id = $1 AND user_id = $2 FOR UPDATE',
          [vendorId, targetUserId]
        );
        if (!rows.length) return { status: 404, body: { error: 'Member not found on this vendor.' } };
        if (rows[0].role === 'owner' && !ctx.isTopAdmin) {
          return { status: 403, body: { error: 'Only Admin: Top can remove a Vendor Owner membership.' } };
        }
        await tx.query('DELETE FROM vendor_memberships WHERE vendor_id = $1 AND user_id = $2', [
          vendorId,
          targetUserId
        ]);
        await recordAuditLog(tx, {
          actorId: ctx.user.id,
          actorRole: verified.actorRole,
          vendorId,
          targetType: 'vendor_membership',
          targetId: `${vendorId}:${targetUserId}`,
          action: 'vendor.member_remove',
          metadata: { removed_role: rows[0].role }
        });
        return { status: 200, body: { ok: true } };
      });
      return sendJson(outcome.status, outcome.body);
    }

    return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'GET, DELETE' });
  }

  if (normPath === '/api/vendor/staff-invitations') {
    if (method !== 'POST') return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'POST' });
    if (!ctx.authenticated) return sendJson(401, { error: 'Sign in is required.' });
    const vendorId = String(body.vendor_id || '').trim();
    const emailNorm = normalizeEmailStrict(body.email);
    const idem = normalizeOptionalIdempotencyKey(body.idempotency_key);
    if (!vendorId || !emailNorm) {
      return sendJson(400, { error: 'Valid vendor_id and staff email address are required.' });
    }
    if (!idem.ok) return sendJson(400, { error: idem.error });
    const releaseSha = getRuntimeReleaseSha();
    const correlationId = createAuthCorrelationId();

    const outcome = await withTransaction(dbAdapter, async tx => {
      const verified = await reverifyVendorMembershipInTx(tx, ctx, vendorId, 'owner');
      if (!verified.ok) return { status: verified.status, body: { error: verified.error } };
      await tx.query(
        "SELECT set_config('app.admin_portal', 'true', true), set_config('app.auth_internal', 'true', true), set_config('app.user_id', $1, true)",
        [ctx.user.id]
      );
      const rl = await consumeGovernanceRateLimit(tx, {
        scope: 'vendor_staff_invite',
        subjectKey: ctx.user.id,
        maxHits: 10,
        windowSeconds: 3600
      });
      if (!rl.allowed) return { status: 429, body: { error: 'Too many invitations sent recently.' } };

      const suspCheck = await tx.query('SELECT disabled_at FROM auth_users WHERE email_normalized = $1 LIMIT 1', [emailNorm]);
      if (suspCheck.rows[0]?.disabled_at) {
        return {
          status: 409,
          body: {
            error: 'This email belongs to a suspended account and cannot receive new invitations.',
            code: 'RECIPIENT_ACCOUNT_SUSPENDED'
          }
        };
      }

      const vr = await tx.query('SELECT canonical_name FROM vendors WHERE id = $1', [vendorId]);
      const vendorName = vr.rows[0]?.canonical_name || null;

      const { rawToken, tokenSha256 } = generateOpaqueToken(32);
      const expiresAt = new Date(Date.now() + INVITATION_TTL_MS).toISOString();
      const { rows } = await tx.query(
        `INSERT INTO account_invitations (
           email_normalized, requested_role, vendor_id, status, delivery_status,
           token_sha256, token_version, initiated_by, initiator_role, idempotency_key,
           last_correlation_id, expires_at
         )
         VALUES ($1, 'vendor_staff', $2, 'issued', 'queued', $3, 1, $4, 'vendor_owner', $5, $6, $7)
         ON CONFLICT (initiated_by, idempotency_key) WHERE idempotency_key IS NOT NULL
         DO NOTHING
         RETURNING *`,
        [emailNorm, vendorId, tokenSha256, ctx.user.id, idem.value, correlationId, expiresAt]
      );
      if (!rows.length && idem.value) {
        const existing = await tx.query(
          `SELECT *
           FROM account_invitations
           WHERE initiated_by = $1 AND idempotency_key = $2`,
          [ctx.user.id, idem.value]
        );
        return { status: 200, body: { invitation: formatInvitationRowForAdmin(existing.rows[0]), idempotent_replay: true } };
      }

      await recordInvitationEventInTx(tx, {
        invitationId: rows[0].id,
        eventType: 'created',
        actorId: ctx.user.id,
        actorRole: 'vendor_owner',
        correlationId,
        releaseSha,
        note: `Vendor staff invitation for ${vendorId}`
      });
      await recordInvitationEventInTx(tx, {
        invitationId: rows[0].id,
        eventType: 'delivery_queued',
        actorId: ctx.user.id,
        actorRole: 'vendor_owner',
        correlationId,
        releaseSha
      });

      await recordAuditLog(tx, {
        actorId: ctx.user.id,
        actorRole: 'owner',
        vendorId,
        targetType: 'account_invitation',
        targetId: rows[0].id,
        action: 'invitation.create_vendor_staff',
        metadata: { requested_role: 'vendor_staff', correlation_id: correlationId }
      });

      return {
        status: 201,
        pendingDispatch: {
          invitationId: rows[0].id,
          tokenVersion: 1,
          rawToken,
          recipientEmail: emailNorm,
          requestedRole: 'vendor_staff',
          vendorId,
          vendorName,
          expiresAt,
          actorId: ctx.user.id,
          actorRole: 'vendor_owner',
          correlationId
        }
      };
    });

    if (!outcome.pendingDispatch) {
      return sendJson(outcome.status, outcome.body);
    }

    const dispatched = await deliverAndFinalizeIssuedInvitation({
      dbAdapter,
      ctx,
      ...outcome.pendingDispatch,
      flow: 'invite_send'
    });

    return sendJson(201, {
      invitation: dispatched.invitation,
      delivery: dispatched.delivery,
      ...(dispatched.exposeTestAcceptPath ? { accept_path: dispatched.exposeTestAcceptPath } : {})
    });
  }

  // =========================================================================
  // 4. Vendor Onboarding & Sensitive Evidence (`/api/onboarding/*`)
  // =========================================================================
  if (normPath === '/api/onboarding/applications') {
    if (!ctx.authenticated || !ctx.user?.id) {
      return sendJson(401, { error: 'Sign in to submit or track a vendor ownership application.' });
    }

    if (method === 'GET') {
      const out = await withTransaction(dbAdapter, async tx => {
        await tx.query("SELECT set_config('app.user_id', $1, true)", [ctx.user.id]);
        const { rows: apps } = await tx.query(
          `SELECT
             id, claim_type, target_vendor_id, proposed_slug, business_name, city, cuisine,
             listing_kind, service_area, contact_name, contact_email, contact_phone,
             website_or_menu_url, permit_or_license_summary, ownership_statement,
             status, applicant_feedback, decided_at, decision_reason, approved_vendor_id,
             revision_count, submitted_at, created_at, updated_at
           FROM vendor_applications
           WHERE applicant_user_id = $1
           ORDER BY updated_at DESC
           LIMIT 20`,
          [ctx.user.id]
        );
        const appIds = apps.map(a => a.id);
        let evMap = new Map();
        if (appIds.length) {
          const { rows: evs } = await tx.query(
            `SELECT id, application_id, original_filename, mime_type, byte_size, evidence_kind, retention_expires_at, created_at
             FROM vendor_application_evidence
             WHERE application_id = ANY($1::uuid[]) AND deleted_at IS NULL
             ORDER BY created_at ASC`,
            [appIds]
          );
          for (const ev of evs) {
            if (!evMap.has(ev.application_id)) evMap.set(ev.application_id, []);
            evMap.get(ev.application_id).push(ev);
          }
        }
        const { rows: unclaimed } = await tx.query(
          `SELECT id, canonical_name, city, cuisine, listing_kind
           FROM vendors
           WHERE is_active = true AND ownership_status = 'unclaimed'
           ORDER BY canonical_name ASC`
        );
        return {
          applications: apps.map(a => ({ ...a, evidence: evMap.get(a.id) || [] })),
          unclaimed_listings: unclaimed
        };
      });
      return sendJson(200, out);
    }

    if (method === 'POST') {
      const rawAppId = body.id || body.application_id;
      const appId = typeof rawAppId === 'string' && rawAppId.trim() ? rawAppId.trim() : null;
      if (appId && !UUID_RE.test(appId)) {
        return sendJson(400, { error: 'Invalid application UUID.' });
      }
      const action = body.submit === true || body.action === 'submit' ? 'submit' : 'save_draft';
      const rawClaimType = body.claim_type || body.application_type;
      const claimType = rawClaimType === 'new_listing' ? 'new_listing' : 'existing_listing';
      const targetVendorId =
        claimType === 'existing_listing' && typeof body.target_vendor_id === 'string'
          ? body.target_vendor_id.trim()
          : null;
      const proposedSlug = claimType === 'new_listing' ? validateProposedSlug(body.proposed_slug) : null;

      if (claimType === 'existing_listing' && (!targetVendorId || targetVendorId.length > 80)) {
        return sendJson(400, { error: 'Select the existing Sonoma County directory listing you are claiming.' });
      }
      if (claimType === 'new_listing' && !proposedSlug) {
        return sendJson(400, {
          error: 'Provide a lowercase proposed_slug (2–63 alphanumeric/hyphen characters) for a new listing.'
        });
      }

      const businessName = typeof body.business_name === 'string' ? body.business_name.trim() : '';
      const rawCity = body.city || body.primary_town;
      const city = typeof rawCity === 'string' && rawCity.trim() ? rawCity.trim() : 'Santa Rosa';
      const cuisine = typeof body.cuisine === 'string' && body.cuisine.trim() ? body.cuisine.trim() : 'Mexican';
      const rawKind = typeof (body.listing_kind || body.category) === 'string' ? String(body.listing_kind || body.category).trim().toLowerCase() : 'food_truck';
      const listingKind = ['food_truck', 'venue', 'market_stall', 'farm_stand', 'cafe', 'popup'].includes(rawKind)
        ? rawKind
        : rawKind.includes('coffee') || rawKind.includes('cafe')
          ? 'cafe'
          : rawKind.includes('market')
            ? 'market_stall'
            : rawKind.includes('farm')
              ? 'farm_stand'
              : rawKind.includes('pop')
                ? 'popup'
                : 'food_truck';
      const rawServiceArea = body.service_area || body.public_summary || city;
      const serviceArea = typeof rawServiceArea === 'string' ? rawServiceArea.trim() : '';
      const contactName = typeof body.contact_name === 'string' ? body.contact_name.trim() : '';
      const contactEmail = normalizeEmailStrict(body.contact_email || ctx.user.email);
      const contactPhone = typeof body.contact_phone === 'string' && body.contact_phone.trim() ? body.contact_phone.trim().slice(0, 40) : null;
      const urlCheck = validateOptionalHttpUrl(body.website_or_menu_url || body.website_url);
      const rawPermit = body.permit_or_license_summary || body.ownership_statement;
      const permitSummary = typeof rawPermit === 'string' ? rawPermit.trim().slice(0, 400) : '';
      const ownershipStatement = typeof body.ownership_statement === 'string' ? body.ownership_statement.trim() : '';

      if (!urlCheck.ok) return sendJson(400, { error: urlCheck.error });
      if (
        businessName.length < 2 ||
        businessName.length > 120 ||
        serviceArea.length < 2 ||
        serviceArea.length > 160 ||
        contactName.length < 2 ||
        contactName.length > 100 ||
        !contactEmail ||
        permitSummary.length < 4 ||
        permitSummary.length > 400 ||
        ownershipStatement.length < 10 ||
        ownershipStatement.length > 800
      ) {
        return sendJson(400, {
          error:
            'Complete business_name (2–120), service_area (2–160), contact_name (2–100), valid contact_email, permit_or_license_summary (4–400), and ownership_statement (10–800).'
        });
      }
      if (!['food_truck', 'venue', 'market_stall', 'farm_stand', 'cafe', 'popup'].includes(listingKind)) {
        return sendJson(400, { error: 'Invalid listing_kind.' });
      }

      // Reject client self-approval / moderation field tampering
      for (const forbidden of ['status', 'verified', 'mod_recommendation', 'decided_by', 'internal_notes']) {
        if (
          Object.prototype.hasOwnProperty.call(body, forbidden) &&
          !(forbidden === 'status' && ['draft', 'submitted'].includes(body.status))
        ) {
          return sendJson(403, { error: `Field "${forbidden}" cannot be set by the applicant.` });
        }
      }

      const outcome = await withTransaction(dbAdapter, async tx => {
        await tx.query(
          "SELECT set_config('app.user_id', $1, true), set_config('app.auth_internal', 'true', true)",
          [ctx.user.id]
        );
        const rl = await consumeGovernanceRateLimit(tx, {
          scope: 'vendor_app_write',
          subjectKey: ctx.user.id,
          maxHits: 12,
          windowSeconds: 3600
        });
        if (!rl.allowed) return { status: 429, body: { error: 'Too many application updates. Please wait and retry.' } };

        if (claimType === 'existing_listing') {
          const vr = await tx.query('SELECT id, is_active FROM vendors WHERE id = $1', [targetVendorId]);
          if (!vr.rows.length || !vr.rows[0].is_active) {
            return { status: 400, body: { error: 'Target directory listing does not exist or is inactive.' } };
          }
        }

        const nextStatus = action === 'submit' ? 'submitted' : 'draft';

        if (appId) {
          const { rows: existing } = await tx.query(
            'SELECT * FROM vendor_applications WHERE id = $1 AND applicant_user_id = $2 FOR UPDATE',
            [appId, ctx.user.id]
          );
          if (!existing.length) {
            return { status: 404, body: { error: 'Application not found.' } };
          }
          const cur = existing[0];
          if (!['draft', 'needs_info'].includes(cur.status)) {
            return {
              status: 409,
              body: {
                error: `Application in "${cur.status}" state cannot be edited. Wait for review or request follow-up.`
              }
            };
          }
          const isResubmit = cur.status === 'needs_info' && nextStatus === 'submitted';
          const { rows: updated } = await tx.query(
            `UPDATE vendor_applications
             SET claim_type = $2,
                 target_vendor_id = $3,
                 proposed_slug = $4,
                 business_name = $5,
                 city = $6,
                 cuisine = $7,
                 listing_kind = $8,
                 service_area = $9,
                 contact_name = $10,
                 contact_email = $11,
                 contact_phone = $12,
                 website_or_menu_url = $13,
                 permit_or_license_summary = $14,
                 ownership_statement = $15,
                 status = $16,
                 revision_count = revision_count + $17,
                 submitted_at = CASE WHEN $16 = 'submitted' THEN now() ELSE submitted_at END,
                 updated_at = now()
             WHERE id = $1
             RETURNING id, claim_type, target_vendor_id, proposed_slug, business_name, status, revision_count, submitted_at, updated_at`,
            [
              appId,
              claimType,
              targetVendorId,
              proposedSlug,
              businessName,
              city,
              cuisine,
              listingKind,
              serviceArea,
              contactName,
              contactEmail,
              contactPhone,
              urlCheck.value,
              permitSummary,
              ownershipStatement,
              nextStatus,
              isResubmit ? 1 : 0
            ]
          );
          await recordAuditLog(tx, {
            actorId: ctx.user.id,
            actorRole: 'customer',
            vendorId: targetVendorId,
            targetType: 'vendor_application',
            targetId: appId,
            action: isResubmit ? 'vendor_application.resubmit' : `vendor_application.${nextStatus}`,
            metadata: { claim_type: claimType, revision_count: updated[0].revision_count }
          });
          return { status: 200, body: { application: updated[0] } };
        }

        const { rows: recentCount } = await tx.query(
          "SELECT count(*)::int AS c FROM vendor_applications WHERE applicant_user_id = $1 AND created_at > now() - interval '24 hours'",
          [ctx.user.id]
        );
        if ((recentCount[0]?.c || 0) >= 5) {
          return { status: 429, body: { error: 'Maximum of 5 new vendor applications per 24 hours.' } };
        }

        const { rows: created } = await tx.query(
          `INSERT INTO vendor_applications (
             applicant_user_id, applicant_email, claim_type, target_vendor_id, proposed_slug,
             business_name, city, cuisine, listing_kind, service_area,
             contact_name, contact_email, contact_phone, website_or_menu_url,
             permit_or_license_summary, ownership_statement, status, submitted_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
                   CASE WHEN $17 = 'submitted' THEN now() ELSE NULL END)
           RETURNING id, claim_type, target_vendor_id, proposed_slug, business_name, status, revision_count, submitted_at, created_at`,
          [
            ctx.user.id,
            ctx.user.email || contactEmail,
            claimType,
            targetVendorId,
            proposedSlug,
            businessName,
            city,
            cuisine,
            listingKind,
            serviceArea,
            contactName,
            contactEmail,
            contactPhone,
            urlCheck.value,
            permitSummary,
            ownershipStatement,
            nextStatus
          ]
        );
        await recordAuditLog(tx, {
          actorId: ctx.user.id,
          actorRole: 'customer',
          vendorId: targetVendorId,
          targetType: 'vendor_application',
          targetId: created[0].id,
          action: `vendor_application.create_${nextStatus}`,
          metadata: { claim_type: claimType }
        });
        return { status: 201, body: { application: created[0] } };
      });

      return sendJson(outcome.status, outcome.body);
    }

    return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'GET, POST' });
  }

  if (normPath === '/api/onboarding/evidence') {
    if (!ctx.authenticated || !ctx.user?.id) {
      return sendJson(401, { error: 'Sign in is required.' });
    }

    if (method === 'GET') {
      const evId = typeof query.id === 'string' ? query.id.trim() : '';
      if (!UUID_RE.test(evId)) return sendJson(400, { error: 'Valid evidence UUID is required.' });

      const out = await withTransaction(dbAdapter, async tx => {
        if (ctx.isModAdmin) {
          const verifiedMod = await reverifyModeratorInTx(tx, ctx);
          if (!verifiedMod.ok) return { status: verifiedMod.status, error: verifiedMod.error };
          await tx.query("SELECT set_config('app.admin_portal', 'true', true)");
        } else {
          await tx.query("SELECT set_config('app.user_id', $1, true)", [ctx.user.id]);
        }
        const { rows } = await tx.query(
          `SELECT e.id, e.uploaded_by, e.original_filename, e.mime_type, e.byte_size, e.file_bytes, e.deleted_at, a.applicant_user_id
           FROM vendor_application_evidence e
           JOIN vendor_applications a ON a.id = e.application_id
           WHERE e.id = $1`,
          [evId]
        );
        if (!rows.length || rows[0].deleted_at) {
          return { status: 404, error: 'Evidence file not found.' };
        }
        const ev = rows[0];
        if (!ctx.isModAdmin && ev.applicant_user_id !== ctx.user.id) {
          return { status: 403, error: 'Not authorized to access this evidence file.' };
        }
        return { status: 200, ev };
      });

      if (out.status !== 200) {
        return sendJson(out.status, { error: out.error });
      }
      const safeName = sanitizeFilename(out.ev.original_filename);
      rawRes.statusCode = 200;
      rawRes.setHeader('Content-Type', out.ev.mime_type);
      rawRes.setHeader('Content-Length', out.ev.file_bytes.length);
      rawRes.setHeader('Content-Disposition', `attachment; filename="evidence-${safeName}"`);
      rawRes.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      rawRes.setHeader('X-Content-Type-Options', 'nosniff');
      rawRes.setHeader('Cache-Control', 'private, no-store, max-age=0');
      rawRes.end(out.ev.file_bytes);
      return;
    }

    if (method === 'POST') {
      const appId = typeof body.application_id === 'string' ? body.application_id.trim() : '';
      const rawEvKind = typeof body.evidence_kind === 'string' ? body.evidence_kind.trim() : 'other';
      const evidenceKind = rawEvKind === 'ownership_proof' ? 'business_license' : rawEvKind;
      const rawFilename = sanitizeFilename(body.filename || 'document.pdf');
      const rawB64 = typeof body.data_base64 === 'string' ? body.data_base64.trim() : '';

      if (!UUID_RE.test(appId)) return sendJson(400, { error: 'Valid application_id is required.' });
      if (!['health_permit', 'business_license', 'menu_or_signage', 'venue_authorization', 'other'].includes(evidenceKind)) {
        return sendJson(400, { error: 'Invalid evidence_kind.' });
      }
      if (!rawB64 || rawB64.length > Math.ceil((MAX_EVIDENCE_BYTES * 4) / 3) + 128) {
        return sendJson(413, { error: 'Evidence file must be non-empty and at most 512 KiB.' });
      }
      if (!/^[A-Za-z0-9+/=\r\n]+$/.test(rawB64)) {
        return sendJson(400, { error: 'data_base64 must be valid standard base64.' });
      }

      const fileBuf = Buffer.from(rawB64, 'base64');
      const verifiedFile = verifyEvidenceBufferAndMime(fileBuf, body.mime_type);
      if (!verifiedFile.ok) {
        return sendJson(400, { error: verifiedFile.error, code: 'UNSAFE_EVIDENCE_FILE' });
      }

      const outcome = await withTransaction(dbAdapter, async tx => {
        await tx.query("SELECT set_config('app.user_id', $1, true)", [ctx.user.id]);
        const { rows: appRows } = await tx.query(
          'SELECT id, status FROM vendor_applications WHERE id = $1 AND applicant_user_id = $2 FOR UPDATE',
          [appId, ctx.user.id]
        );
        if (!appRows.length) return { status: 404, body: { error: 'Application not found.' } };
        if (!['draft', 'submitted', 'needs_info'].includes(appRows[0].status)) {
          return { status: 409, body: { error: 'Cannot upload evidence to a finalized application.' } };
        }
        const { rows: countRows } = await tx.query(
          'SELECT count(*)::int AS c FROM vendor_application_evidence WHERE application_id = $1 AND deleted_at IS NULL',
          [appId]
        );
        if ((countRows[0]?.c || 0) >= MAX_EVIDENCE_PER_APPLICATION) {
          return {
            status: 409,
            body: { error: `At most ${MAX_EVIDENCE_PER_APPLICATION} evidence attachments are permitted per application.` }
          };
        }

        const { rows: inserted } = await tx.query(
          `INSERT INTO vendor_application_evidence (
             application_id, uploaded_by, original_filename, mime_type, byte_size, sha256_hex, evidence_kind, file_bytes
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id, application_id, original_filename, mime_type, byte_size, sha256_hex, evidence_kind, retention_expires_at, created_at`,
          [
            appId,
            ctx.user.id,
            rawFilename,
            verifiedFile.mimeType,
            verifiedFile.byteSize,
            verifiedFile.sha256Hex,
            evidenceKind,
            fileBuf
          ]
        );
        await recordAuditLog(tx, {
          actorId: ctx.user.id,
          actorRole: 'customer',
          targetType: 'vendor_application_evidence',
          targetId: inserted[0].id,
          action: 'onboarding.evidence_upload',
          metadata: {
            application_id: appId,
            mime_type: verifiedFile.mimeType,
            byte_size: verifiedFile.byteSize,
            evidence_kind: evidenceKind
          }
        });
        return { status: 201, body: { evidence: inserted[0] } };
      });
      return sendJson(outcome.status, outcome.body);
    }

    if (method === 'DELETE') {
      const evId = typeof (body?.id || query.id) === 'string' ? String(body?.id || query.id).trim() : '';
      if (!UUID_RE.test(evId)) return sendJson(400, { error: 'Valid evidence UUID is required.' });

      const outcome = await withTransaction(dbAdapter, async tx => {
        if (ctx.isTopAdmin) {
          await enableAdminTxGuards(tx, ctx);
        } else {
          await tx.query("SELECT set_config('app.user_id', $1, true)", [ctx.user.id]);
        }
        const { rows } = await tx.query(
          `SELECT e.id, e.uploaded_by, e.deleted_at, a.status
           FROM vendor_application_evidence e
           JOIN vendor_applications a ON a.id = e.application_id
           WHERE e.id = $1
           FOR UPDATE OF e`,
          [evId]
        );
        if (!rows.length || rows[0].deleted_at) {
          return { status: 404, body: { error: 'Evidence file not found.' } };
        }
        if (!ctx.isTopAdmin && rows[0].uploaded_by !== ctx.user.id) {
          return { status: 403, body: { error: 'Not authorized to delete this evidence file.' } };
        }
        // Scrub raw bytes on deletion per retention/deletion policy
        await tx.query(
          `UPDATE vendor_application_evidence
           SET deleted_at = now(),
               deleted_by = $2,
               file_bytes = ''::bytea
           WHERE id = $1`,
          [evId, ctx.user.id]
        );
        await recordAuditLog(tx, {
          actorId: ctx.user.id,
          actorRole: ctx.isTopAdmin ? 'top' : 'customer',
          targetType: 'vendor_application_evidence',
          targetId: evId,
          action: 'onboarding.evidence_delete'
        });
        return { status: 200, body: { ok: true } };
      });
      return sendJson(outcome.status, outcome.body);
    }

    return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'GET, POST, DELETE' });
  }

  // =========================================================================
  // 5. Community Content Reporting & Customer/Vendor Support Issues
  // =========================================================================
  if (normPath === '/api/community/report') {
    if (method !== 'POST') return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'POST' });
    if (!ctx.authenticated || !ctx.user?.id) {
      return sendJson(401, { error: 'Sign in to report a community post.' });
    }
    const postId = typeof body.post_id === 'string' ? body.post_id.trim() : '';
    const rawReasonCat = typeof body.reason_category === 'string' ? body.reason_category.trim() : '';
    const reasonCategory = rawReasonCat === 'privacy' ? 'harassment' : rawReasonCat;
    const details = typeof body.details === 'string' && body.details.trim() ? body.details.trim().slice(0, 500) : null;

    if (!UUID_RE.test(postId) || !['spam', 'inaccurate', 'harassment', 'off_topic', 'other'].includes(reasonCategory)) {
      return sendJson(400, { error: 'Valid post_id and reason_category are required.' });
    }

    const outcome = await withTransaction(dbAdapter, async tx => {
      await tx.query(
        `SELECT
           set_config('app.user_id', $1, true),
           set_config('app.auth_internal', 'true', true),
           set_config('app.community_report', 'true', true)`,
        [ctx.user.id]
      );
      const rl = await consumeGovernanceRateLimit(tx, {
        scope: 'community_report',
        subjectKey: ctx.user.id,
        maxHits: 10,
        windowSeconds: 3600
      });
      if (!rl.allowed) return { status: 429, body: { error: 'Too many reports submitted recently.' } };

      const { rows: postRows } = await tx.query(
        "SELECT id, place_id, status FROM community_reviews WHERE id = $1 AND status = 'approved' FOR UPDATE",
        [postId]
      );
      if (!postRows.length) {
        return { status: 404, body: { error: 'Published community post not found.' } };
      }

      const { rows: ins } = await tx.query(
        `INSERT INTO community_reports (post_id, reporter_user_id, reason_category, details)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (post_id, reporter_user_id) DO NOTHING
         RETURNING id, status, created_at`,
        [postId, ctx.user.id, reasonCategory, details]
      );
      if (!ins.length) {
        return {
          status: 200,
          body: { ok: true, already_reported: true, message: 'Your report for this post is already in the moderation queue.' }
        };
      }

      await tx.query(
        `UPDATE community_reviews
         SET report_count = report_count + 1,
             last_reported_at = now()
         WHERE id = $1`,
        [postId]
      );

      await recordAuditLog(tx, {
        actorId: ctx.user.id,
        actorRole: 'customer',
        vendorId: postRows[0].place_id || null,
        targetType: 'community_review',
        targetId: postId,
        action: 'community.report',
        metadata: { reason_category: reasonCategory }
      });

      return {
        status: 201,
        body: { ok: true, report_id: ins[0].id, message: 'Report submitted for moderator review.' }
      };
    });
    return sendJson(outcome.status, outcome.body);
  }

  if (normPath === '/api/issues') {
    if (!ctx.authenticated || !ctx.user?.id) {
      return sendJson(401, { error: 'Sign in to view or submit support requests.' });
    }

    if (method === 'GET') {
      const singleId = typeof query.issue_id === 'string' && UUID_RE.test(query.issue_id.trim()) ? query.issue_id.trim() : '';
      const singleTicketNo =
        typeof query.ticket_number === 'string' && /^BS-[0-9]{6,10}$/i.test(query.ticket_number.trim())
          ? query.ticket_number.trim().toUpperCase()
          : '';

      const out = await withTransaction(dbAdapter, async tx => {
        await tx.query(
          "SELECT set_config('app.user_id', $1, true), set_config('app.auth_internal', 'true', true)",
          [ctx.user.id]
        );
        const ageRes = await tx.query(
          'SELECT age_eligibility_status FROM auth_users WHERE id = $1',
          [ctx.user.id]
        );
        const isEligible = ageRes.rows[0]?.age_eligibility_status === 'eligible_14_plus';

        let verifiedVendorIds = [];
        if (isEligible) {
          const vmRes = await tx.query(
            'SELECT vendor_id FROM vendor_memberships WHERE user_id = $1',
            [ctx.user.id]
          );
          verifiedVendorIds = vmRes.rows.map(r => r.vendor_id).filter(Boolean);
        }

        // Unassessed accounts may view ONLY narrow privacy/accessibility/account-access support tickets,
        // never historical operational/booking/vendor dispute records or shared vendor tickets.
        let issuesQuerySql;
        let issuesParams;
        if (!isEligible) {
          issuesQuerySql = `
            SELECT *
            FROM support_issues
            WHERE reporter_user_id = $1
              AND category = 'account_access'
              AND vendor_id IS NULL
              AND related_booking_id IS NULL
              AND related_review_id IS NULL
            ORDER BY last_activity_at DESC, updated_at DESC
            LIMIT 40
          `;
          issuesParams = [ctx.user.id];
        } else {
          issuesQuerySql = `
            SELECT *
            FROM support_issues
            WHERE reporter_user_id = $1
               OR (
                 sharing_scope = 'vendor_service'
                 AND reporter_context = 'vendor'
                 AND category <> 'account_access'
                 AND vendor_id = ANY($2::text[])
               )
            ORDER BY last_activity_at DESC, updated_at DESC
            LIMIT 50
          `;
          issuesParams = [ctx.user.id, verifiedVendorIds];
        }

        const { rows: issues } = await tx.query(issuesQuerySql, issuesParams);

        // If viewing a single ticket owned by the reporter, mark it read
        if (singleId || singleTicketNo) {
          const target = issues.find(i => (singleId ? i.id === singleId : i.ticket_number === singleTicketNo));
          if (target && target.reporter_user_id === ctx.user.id) {
            await tx.query(
              'UPDATE support_issues SET reporter_last_read_at = now() WHERE id = $1',
              [target.id]
            );
            target.reporter_last_read_at = new Date().toISOString();
          }
        }

        const ids = issues.map(i => i.id);
        const notesMap = new Map();
        const eventsMap = new Map();
        const pubDiagMap = new Map();

        if (ids.length) {
          const { rows: notes } = await tx.query(
            `SELECT id, issue_id, author_user_id, author_role, author_display_label, body, created_at
             FROM support_issue_notes
             WHERE issue_id = ANY($1::uuid[]) AND visibility = 'reporter_visible'
             ORDER BY created_at ASC, id ASC`,
            [ids]
          );
          for (const n of notes) {
            if (!notesMap.has(n.issue_id)) notesMap.set(n.issue_id, []);
            notesMap.get(n.issue_id).push(n);
          }

          const { rows: events } = await tx.query(
            `SELECT id, issue_id, event_type, public_actor_label, summary, created_at
             FROM support_issue_events
             WHERE issue_id = ANY($1::uuid[]) AND visibility = 'reporter_visible'
             ORDER BY created_at ASC, id ASC`,
            [ids]
          );
          for (const ev of events) {
            if (!eventsMap.has(ev.issue_id)) eventsMap.set(ev.issue_id, []);
            eventsMap.get(ev.issue_id).push(ev);
          }

          const { rows: pubDiags } = await tx.query(
            `SELECT issue_id, public_summary, verification_status, updated_at
             FROM support_issue_diagnostic_links
             WHERE issue_id = ANY($1::uuid[])
               AND unlinked_at IS NULL
               AND link_state = 'confirmed'
               AND public_summary IS NOT NULL
             ORDER BY updated_at DESC`,
            [ids]
          );
          for (const pd of pubDiags) {
            if (!pubDiagMap.has(pd.issue_id)) pubDiagMap.set(pd.issue_id, []);
            pubDiagMap.get(pd.issue_id).push(pd);
          }
        }

        const enriched = issues.map(i =>
          serializeSupportTicketForReporter(i, {
            notes: notesMap.get(i.id) || [],
            events: eventsMap.get(i.id) || [],
            publicDiagnostics: pubDiagMap.get(i.id) || [],
            viewerUserId: ctx.user.id
          })
        );

        if (singleId || singleTicketNo) {
          const match = enriched.find(i => (singleId ? i.id === singleId : i.ticket_number === singleTicketNo));
          return { single: match || null };
        }
        return { list: enriched };
      });

      if (singleId || singleTicketNo) {
        if (!out.single) return sendJson(404, { error: 'Support request not found.' });
        return sendJson(200, {
          issue: out.single,
          notes: out.single.notes,
          timeline_events: out.single.timeline_events,
          public_diagnostics: out.single.public_diagnostics
        });
      }
      const unreadCount = (out.list || []).filter(i => i.unread_for_reporter).length;
      return sendJson(200, { issues: out.list, unread_count: unreadCount });
    }

    if (method === 'POST') {
      const rawEntryKind = typeof body.entry_kind === 'string' ? body.entry_kind.trim().toLowerCase() : '';
      const entryKind = ['problem', 'question', 'suggestion'].includes(rawEntryKind) ? rawEntryKind : 'problem';
      const rawCat = typeof body.category === 'string' ? body.category.trim().toLowerCase() : '';
      const isNarrowSupportCategory = ['account_access', 'privacy_request', 'accessibility_support'].includes(rawCat);

      const serverSha = getRuntimeReleaseSha();
      const safeCtx = sanitizeSupportContextFields(body, serverSha);
      const category = normalizeSupportCategoryInput(rawCat, entryKind, safeCtx.affectedFeature);
      if (!category) {
        return sendJson(400, { error: 'Select a valid support or feedback category.' });
      }

      if (body.urgency !== undefined && !VALID_REPORTER_URGENCIES.has(String(body.urgency).trim().toLowerCase()) && String(body.urgency).trim().toLowerCase() !== 'urgent') {
        return sendJson(400, { error: 'Select a valid impact/urgency level.' });
      }
      if (body.severity !== undefined && !VALID_STAFF_PRIORITIES.has(String(body.severity).trim().toLowerCase())) {
        return sendJson(400, { error: 'Select a valid severity level.' });
      }

      const effectiveEntryKind = category === 'suggestion_feedback' ? 'suggestion' : category === 'question_help' ? 'question' : entryKind;
      const { reporterUrgency, staffPriority, slaDueAt } = resolveInitialUrgencyAndPriority({
        rawUrgency: body.urgency ?? body.reporter_urgency,
        rawSeverity: body.severity,
        entryKind: effectiveEntryKind,
        category
      });

      const requestedContext = body.reporter_context === 'vendor' ? 'vendor' : 'customer';
      const rawVendorId = typeof body.vendor_id === 'string' && body.vendor_id.trim() ? body.vendor_id.trim() : null;
      const bookingId = typeof body.related_booking_id === 'string' && body.related_booking_id.trim() ? body.related_booking_id.trim() : null;
      const reviewId = typeof body.related_review_id === 'string' && body.related_review_id.trim() ? body.related_review_id.trim() : null;
      const rawSubject = typeof body.subject === 'string' ? body.subject.trim() : '';
      const description = typeof body.description === 'string' ? body.description.trim() : '';
      const idem = normalizeOptionalIdempotencyKey(body.idempotency_key);

      if (!idem.ok) return sendJson(400, { error: idem.error });
      if (description.length < 15 || description.length > 1500) {
        return sendJson(400, { error: 'Please include a description between 15 and 1500 characters.' });
      }
      // Customer lighter form may omit `subject`; explicit `subject` when provided must be 5–140 chars
      const subject =
        rawSubject.length > 0
          ? rawSubject
          : requestedContext === 'customer'
            ? buildAutoSubjectFromDescription(effectiveEntryKind, category, description)
            : '';
      if (subject.length < 5 || subject.length > 140) {
        return sendJson(400, {
          error: 'Provide a short title between 5 and 140 characters and a description between 15 and 1500 characters.'
        });
      }
      if (bookingId && !UUID_RE.test(bookingId)) return sendJson(400, { error: 'Invalid related_booking_id.' });
      if (reviewId && !UUID_RE.test(reviewId)) return sendJson(400, { error: 'Invalid related_review_id.' });

      const outcome = await withTransaction(dbAdapter, async tx => {
        await tx.query(
          "SELECT set_config('app.user_id', $1, true), set_config('app.auth_internal', 'true', true)",
          [ctx.user.id]
        );
        const ageRes = await tx.query(
          'SELECT age_eligibility_status FROM auth_users WHERE id = $1 FOR SHARE',
          [ctx.user.id]
        );
        const isEligible = ageRes.rows[0]?.age_eligibility_status === 'eligible_14_plus';
        if (!isEligible) {
          if (!isNarrowSupportCategory || rawVendorId || bookingId || reviewId || requestedContext === 'vendor') {
            return {
              status: 403,
              body: buildAgeAssessmentRequiredPayload('/')
            };
          }
        }

        // Verify vendor memberships server-side under transaction; a selected vendor_id NEVER grants access!
        const memRes = isEligible
          ? await tx.query('SELECT vendor_id, role FROM vendor_memberships WHERE user_id = $1 FOR SHARE', [ctx.user.id])
          : { rows: [] };
        const memberVendorSet = new Set(memRes.rows.map(r => r.vendor_id));
        if (isEligible && requestedContext === 'vendor' && rawVendorId && !memberVendorSet.has(rawVendorId) && ctx.isTopAdmin) {
          const aobCheck = await reverifyVendorMembershipInTx(tx, ctx, rawVendorId, 'staff');
          if (aobCheck.ok && aobCheck.vendorId) {
            memberVendorSet.add(aobCheck.vendorId);
          }
        }

        let effectiveReporterContext = 'customer';
        let effectiveVendorId = rawVendorId;

        if (requestedContext === 'vendor') {
          if (memberVendorSet.size === 0) {
            return {
              status: 403,
              body: {
                error: 'Vendor support submissions require an active authorized vendor membership.',
                code: 'VENDOR_MEMBERSHIP_REQUIRED'
              }
            };
          }
          effectiveReporterContext = 'vendor';
          if (effectiveVendorId) {
            if (!memberVendorSet.has(effectiveVendorId)) {
              return {
                status: 403,
                body: {
                  error: 'You are not an authorized member of the selected vendor listing.',
                  code: 'VENDOR_SCOPE_FORBIDDEN'
                }
              };
            }
          } else if (memberVendorSet.size === 1 && category !== 'account_access') {
            effectiveVendorId = Array.from(memberVendorSet)[0];
          } else if (
            memberVendorSet.size > 1 &&
            ['listing_hours_location', 'listing_accuracy', 'event_inquiries', 'booking_dispute', 'pager_notifications', 'pager_issue'].includes(category)
          ) {
            return {
              status: 400,
              body: {
                error: 'Select which of your managed vendor listings is affected.',
                code: 'VENDOR_SELECTION_REQUIRED'
              }
            };
          }
        } else if (effectiveVendorId) {
          const vr = await tx.query('SELECT id FROM vendors WHERE id = $1', [effectiveVendorId]);
          if (!vr.rows.length) return { status: 400, body: { error: 'Unknown vendor_id.' } };
        }

        // Enforce sharing_scope policy: customer tickets & account_access tickets are ALWAYS personal!
        const requestedScope = body.sharing_scope === 'personal' ? 'personal' : body.sharing_scope === 'vendor_service' ? 'vendor_service' : null;
        let sharingScope = 'personal';
        if (effectiveReporterContext === 'vendor' && effectiveVendorId && category !== 'account_access') {
          sharingScope = requestedScope === 'personal' ? 'personal' : 'vendor_service';
        }

        // Check idempotency BEFORE consuming rate-limit quota so network retries never exhaust limits!
        if (idem.value) {
          const prev = await tx.query(
            `SELECT *
             FROM support_issues
             WHERE reporter_user_id = $1 AND idempotency_key = $2`,
            [ctx.user.id, idem.value]
          );
          if (prev.rows.length) {
            return {
              status: 200,
              body: {
                issue: serializeSupportTicketForReporter(prev.rows[0], { viewerUserId: ctx.user.id }),
                idempotent_replay: true,
                deduplicated: true
              }
            };
          }
        }

        const rl = await consumeGovernanceRateLimit(tx, {
          scope: 'issue_create',
          subjectKey: ctx.user.id,
          maxHits: 12,
          windowSeconds: 86400
        });
        if (!rl.allowed) {
          return {
            status: 429,
            body: {
              error: 'Support submission limit reached (max 12 requests per 24 hours). You can still reply to existing open tickets.'
            }
          };
        }

        if (bookingId) {
          const br = await tx.query('SELECT id, requester_user_id, truck_id FROM bookings WHERE id = $1', [bookingId]);
          if (!br.rows.length) return { status: 400, body: { error: 'Related booking not found.' } };
          const ownsBooking =
            br.rows[0].requester_user_id === ctx.user.id ||
            (br.rows[0].truck_id && memberVendorSet.has(br.rows[0].truck_id));
          if (!ownsBooking && !ctx.isModAdmin) {
            return { status: 403, body: { error: 'Not authorized to link this booking.' } };
          }
        }

        const { rows } = await tx.query(
          `INSERT INTO support_issues (
             reporter_user_id, reporter_email, reporter_context, entry_kind, sharing_scope,
             category, reporter_urgency, severity,
             vendor_id, related_booking_id, related_review_id, subject, description,
             sla_due_at, idempotency_key, waiting_for_team,
             affected_feature, operation_name, error_correlation_id, reported_occurred_at,
             server_release_sha, client_build_version, client_loaded_release_sha, coarse_device_info
           )
           VALUES (
             $1, $2, $3, $4, $5,
             $6, $7, $8,
             $9, $10, $11, $12, $13,
             $14, $15, true,
             $16, $17, $18, $19,
             $20, $21, $22, $23
           )
           ON CONFLICT (reporter_user_id, idempotency_key) WHERE idempotency_key IS NOT NULL
           DO NOTHING
           RETURNING *`,
          [
            ctx.user.id,
            ctx.user.email || null,
            effectiveReporterContext,
            effectiveEntryKind,
            sharingScope,
            category,
            reporterUrgency,
            staffPriority,
            effectiveVendorId,
            bookingId,
            reviewId,
            subject,
            description,
            slaDueAt,
            idem.value,
            safeCtx.affectedFeature,
            safeCtx.operationName,
            safeCtx.errorCorrelationId,
            safeCtx.reportedOccurredAt,
            safeCtx.serverReleaseSha,
            safeCtx.clientBuildVersion,
            safeCtx.clientLoadedReleaseSha,
            safeCtx.coarseDeviceInfo
          ]
        );

        if (!rows.length && idem.value) {
          const prev = await tx.query(
            'SELECT * FROM support_issues WHERE reporter_user_id = $1 AND idempotency_key = $2',
            [ctx.user.id, idem.value]
          );
          return {
            status: 200,
            body: {
              issue: serializeSupportTicketForReporter(prev.rows[0], { viewerUserId: ctx.user.id }),
              idempotent_replay: true
            }
          };
        }

        const created = rows[0];
        const createdSummary =
          reporterUrgency === 'critical'
            ? `Ticket ${created.ticket_number} received with Critical urgency and placed at the top of the team triage queue (awaiting staff review).`
            : reporterUrgency === 'feedback'
              ? `Feedback ${created.ticket_number} received and logged for the BiteShark product & operations team.`
              : `Ticket ${created.ticket_number} received and queued for BiteShark Support review.`;

        await tx.query(
          `INSERT INTO support_issue_events (
             issue_id, event_type, visibility, actor_user_id, actor_role, public_actor_label, summary, metadata
           )
           VALUES ($1, 'ticket_created', 'reporter_visible', $2, $3, $4, $5, $6::jsonb)`,
          [
            created.id,
            ctx.user.id,
            effectiveReporterContext,
            'You',
            createdSummary,
            JSON.stringify({
              ticket_number: created.ticket_number,
              category,
              reporter_urgency: reporterUrgency,
              sharing_scope: sharingScope
            })
          ]
        );

        await autoSuggestDiagnosticLinksInTx(tx, {
          issueId: created.id,
          errorCorrelationId: safeCtx.errorCorrelationId
        });

        await recordAuditLog(tx, {
          actorId: ctx.user.id,
          actorRole: effectiveReporterContext,
          vendorId: effectiveVendorId,
          targetType: 'support_issue',
          targetId: created.id,
          action: 'issue.create',
          metadata: {
            ticket_number: created.ticket_number,
            category,
            reporter_urgency: reporterUrgency,
            sharing_scope: sharingScope
          }
        });

        return {
          status: 201,
          createdRow: created
        };
      });

      if (outcome.status !== 201 || !outcome.createdRow) {
        return sendJson(outcome.status, outcome.body);
      }

      const created = outcome.createdRow;
      let ackNotif = { notification_delivery: 'recorded_in_app_only', delivery_status: 'in_app_only' };
      // Immediate acknowledgement notification on Critical/High reports (or any report when email provider is active)
      if (created.reporter_urgency === 'critical' || created.reporter_urgency === 'high') {
        ackNotif = await recordAndDispatchSupportNotification({
          dbAdapter,
          issueId: created.id,
          ticketNumber: created.ticket_number,
          recipientUserId: ctx.user.id,
          recipientEmail: ctx.user.email,
          eventKind: 'ticket_acknowledged',
          dedupeKey: `ack:${created.id}`,
          statusLabel: 'Received',
          isCritical: created.reporter_urgency === 'critical'
        });
      }

      return sendJson(201, {
        issue: serializeSupportTicketForReporter(created, { viewerUserId: ctx.user.id }),
        acknowledgement_delivery: ackNotif.delivery_status,
        acknowledgement: {
          ticket_number: created.ticket_number,
          status: created.status,
          status_label: SUPPORT_STATUS_LABELS[created.status] || 'Received',
          read_by_team_yet: false,
          what_happens_next:
            created.reporter_urgency === 'critical'
              ? 'Your Critical report is flagged at the top of our support queue. Automated receipt confirms your ticket was saved — a team member has not read it yet. Updates appear in My Support Requests.'
              : created.reporter_urgency === 'feedback'
                ? 'Thank you for sharing an idea with BiteShark! Our team reviews suggestions alongside product planning; if we have follow-up questions, they will appear in My Support Requests.'
                : 'Your request is recorded in our support queue (not yet read by a team member). Replies and status changes will appear in My Support Requests.',
          notification: ackNotif
        }
      });
    }

    return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'GET, POST' });
  }

  if (normPath === '/api/issues/reply') {
    if (method !== 'POST') return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'POST' });
    if (!ctx.authenticated || !ctx.user?.id) return sendJson(401, { error: 'Sign in is required.' });
    const issueId = typeof body.issue_id === 'string' ? body.issue_id.trim() : '';
    const replyBody = typeof (body.body ?? body.message) === 'string' ? String(body.body ?? body.message).trim() : '';
    const idem = normalizeOptionalIdempotencyKey(body.idempotency_key);
    if (!idem.ok) return sendJson(400, { error: idem.error });
    if (!UUID_RE.test(issueId) || replyBody.length < 2 || replyBody.length > 1500) {
      return sendJson(400, { error: 'Valid issue_id and message (2–1500 chars) are required.' });
    }

    const outcome = await withTransaction(dbAdapter, async tx => {
      await tx.query(
        "SELECT set_config('app.user_id', $1, true), set_config('app.auth_internal', 'true', true)",
        [ctx.user.id]
      );
      const ageRes = await tx.query(
        'SELECT age_eligibility_status FROM auth_users WHERE id = $1 FOR SHARE',
        [ctx.user.id]
      );
      const isEligible = ageRes.rows[0]?.age_eligibility_status === 'eligible_14_plus';

      const { rows } = await tx.query(
        `SELECT id, ticket_number, reporter_user_id, status, assignee_user_id,
                reporter_context, sharing_scope, category, vendor_id, related_booking_id
         FROM support_issues
         WHERE id = $1
         FOR UPDATE`,
        [issueId]
      );
      if (!rows.length) return { status: 404, body: { error: 'Support request not found.' } };
      const cur = rows[0];

      const isDirectReporter = cur.reporter_user_id === ctx.user.id;
      let isAuthorizedVendorCoMember = false;
      if (!isDirectReporter && isEligible && cur.sharing_scope === 'vendor_service' && cur.vendor_id && cur.category !== 'account_access') {
        const vm = await tx.query(
          'SELECT 1 FROM vendor_memberships WHERE vendor_id = $1 AND user_id = $2 LIMIT 1',
          [cur.vendor_id, ctx.user.id]
        );
        isAuthorizedVendorCoMember = vm.rows.length > 0;
      }

      if (!isDirectReporter && !isAuthorizedVendorCoMember) {
        return { status: 404, body: { error: 'Support request not found.' } };
      }

      if (!isEligible && (!isDirectReporter || cur.category !== 'account_access' || cur.vendor_id || cur.related_booking_id)) {
        return { status: 403, body: buildAgeAssessmentRequiredPayload('/') };
      }
      if (cur.status === 'closed') {
        return {
          status: 409,
          body: {
            error: 'Closed tickets cannot receive new replies. Open a new support request referencing this ticket number if needed.',
            code: 'ISSUE_CLOSED'
          }
        };
      }

      const authorRole = isDirectReporter ? cur.reporter_context : 'vendor';
      const displayLabel = isDirectReporter ? 'Reporter' : 'Vendor Team Member';

      const { rows: insNotes } = await tx.query(
        `INSERT INTO support_issue_notes (
           issue_id, author_user_id, author_role, author_display_label, visibility, body, idempotency_key
         )
         VALUES ($1, $2, $3, $4, 'reporter_visible', $5, $6)
         ON CONFLICT (issue_id, author_user_id, idempotency_key) WHERE idempotency_key IS NOT NULL
         DO NOTHING
         RETURNING id, created_at`,
        [issueId, ctx.user.id, authorRole, displayLabel, replyBody, idem.value]
      );

      if (!insNotes.length && idem.value) {
        return { status: 200, body: { ok: true, deduplicated: true } };
      }

      const nextStatus =
        cur.status === 'waiting'
          ? cur.assignee_user_id
            ? 'in_progress'
            : 'open'
          : cur.status;

      await tx.query(
        `UPDATE support_issues
         SET status = $2,
             waiting_for_team = true,
             reporter_last_read_at = CASE WHEN reporter_user_id = $3 THEN now() ELSE reporter_last_read_at END,
             last_activity_at = now(),
             updated_at = now()
         WHERE id = $1`,
        [issueId, nextStatus, ctx.user.id]
      );

      if (nextStatus !== cur.status) {
        await tx.query(
          `INSERT INTO support_issue_events (
             issue_id, event_type, visibility, actor_user_id, actor_role, public_actor_label, summary
           )
           VALUES ($1, 'status_changed', 'reporter_visible', $2, $3, $4, $5)`,
          [
            issueId,
            ctx.user.id,
            authorRole,
            isDirectReporter ? 'You' : 'Vendor Team Member',
            `Reply received — status moved from "${SUPPORT_STATUS_LABELS[cur.status] || cur.status}" to "${SUPPORT_STATUS_LABELS[nextStatus] || nextStatus}".`
          ]
        );
      }

      return { status: 201, body: { ok: true, status: nextStatus, status_label: SUPPORT_STATUS_LABELS[nextStatus] || nextStatus } };
    });
    return sendJson(outcome.status, outcome.body);
  }

  if (normPath === '/api/issues/reopen') {
    if (method !== 'POST') return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'POST' });
    if (!ctx.authenticated || !ctx.user?.id) return sendJson(401, { error: 'Sign in is required.' });
    const issueId = typeof body.issue_id === 'string' ? body.issue_id.trim() : '';
    const reasonBody = typeof (body.reason ?? body.body ?? body.message) === 'string'
      ? String(body.reason ?? body.body ?? body.message).trim()
      : '';
    const idem = normalizeOptionalIdempotencyKey(body.idempotency_key);
    if (!idem.ok) return sendJson(400, { error: idem.error });
    if (!UUID_RE.test(issueId) || reasonBody.length < 4 || reasonBody.length > 1500) {
      return sendJson(400, { error: 'Provide a valid issue_id and a brief note (4–1500 chars) explaining what is still happening.' });
    }

    const outcome = await withTransaction(dbAdapter, async tx => {
      await tx.query(
        "SELECT set_config('app.user_id', $1, true), set_config('app.auth_internal', 'true', true)",
        [ctx.user.id]
      );
      const ageRes = await tx.query('SELECT age_eligibility_status FROM auth_users WHERE id = $1 FOR SHARE', [ctx.user.id]);
      const isEligible = ageRes.rows[0]?.age_eligibility_status === 'eligible_14_plus';

      const { rows } = await tx.query('SELECT * FROM support_issues WHERE id = $1 FOR UPDATE', [issueId]);
      if (!rows.length) return { status: 404, body: { error: 'Support request not found.' } };
      const cur = rows[0];

      const isDirectReporter = cur.reporter_user_id === ctx.user.id;
      let isAuthorizedVendorCoMember = false;
      if (!isDirectReporter && isEligible && cur.sharing_scope === 'vendor_service' && cur.vendor_id && cur.category !== 'account_access') {
        const vm = await tx.query('SELECT 1 FROM vendor_memberships WHERE vendor_id = $1 AND user_id = $2 LIMIT 1', [
          cur.vendor_id,
          ctx.user.id
        ]);
        isAuthorizedVendorCoMember = vm.rows.length > 0;
      }
      if (!isDirectReporter && !isAuthorizedVendorCoMember) {
        return { status: 404, body: { error: 'Support request not found.' } };
      }
      if (!isEligible && (!isDirectReporter || cur.category !== 'account_access' || cur.vendor_id || cur.related_booking_id)) {
        return { status: 403, body: buildAgeAssessmentRequiredPayload('/') };
      }

      if (cur.status === 'closed') {
        return {
          status: 409,
          body: {
            error: 'Closed tickets cannot be reopened. Submit a new request and mention ticket ' + cur.ticket_number + '.',
            code: 'ISSUE_CLOSED'
          }
        };
      }

      // Check idempotent replay if already reopened with same key
      if (idem.value) {
        const dupNote = await tx.query(
          'SELECT id FROM support_issue_notes WHERE issue_id = $1 AND author_user_id = $2 AND idempotency_key = $3 LIMIT 1',
          [issueId, ctx.user.id, idem.value]
        );
        if (dupNote.rows.length) {
          return {
            status: 200,
            body: {
              ok: true,
              deduplicated: true,
              issue: serializeSupportTicketForReporter(cur, { viewerUserId: ctx.user.id })
            }
          };
        }
      }

      if (cur.status !== 'resolved') {
        return {
          status: 409,
          body: {
            error: `Only Resolved tickets can be reopened (this ticket is currently "${SUPPORT_STATUS_LABELS[cur.status] || cur.status}"). Add a reply instead.`,
            code: 'REOPEN_NOT_ELIGIBLE'
          }
        };
      }
      if (cur.resolved_at && Date.now() - new Date(cur.resolved_at).getTime() > 30 * 86400_000) {
        return {
          status: 409,
          body: {
            error: 'Tickets resolved more than 30 days ago cannot be reopened. Please open a new request referencing ' + cur.ticket_number + '.',
            code: 'REOPEN_WINDOW_EXPIRED'
          }
        };
      }

      const nextStatus = cur.assignee_user_id ? 'in_progress' : 'open';
      const authorRole = isDirectReporter ? cur.reporter_context : 'vendor';

      await tx.query(
        `INSERT INTO support_issue_notes (
           issue_id, author_user_id, author_role, author_display_label, visibility, body, idempotency_key
         )
         VALUES ($1, $2, $3, $4, 'reporter_visible', $5, $6)`,
        [issueId, ctx.user.id, authorRole, isDirectReporter ? 'Reporter' : 'Vendor Team Member', `[Still happening] ${reasonBody}`, idem.value]
      );

      const { rows: updRows } = await tx.query(
        `UPDATE support_issues
         SET status = $2,
             reopen_count = reopen_count + 1,
             reopened_at = now(),
             waiting_for_team = true,
             reporter_last_read_at = CASE WHEN reporter_user_id = $3 THEN now() ELSE reporter_last_read_at END,
             last_activity_at = now(),
             updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [issueId, nextStatus, ctx.user.id]
      );

      await tx.query(
        `INSERT INTO support_issue_events (
           issue_id, event_type, visibility, actor_user_id, actor_role, public_actor_label, summary, metadata
         )
         VALUES ($1, 'reopened', 'reporter_visible', $2, $3, $4, $5, $6::jsonb)`,
        [
          issueId,
          ctx.user.id,
          authorRole,
          isDirectReporter ? 'You' : 'Vendor Team Member',
          `Reporter marked "This is still happening" — ticket reopened to "${SUPPORT_STATUS_LABELS[nextStatus]}". Previous resolution history preserved.`,
          JSON.stringify({ previous_resolution_reason: cur.resolution_reason || null, reopen_count: updRows[0].reopen_count })
        ]
      );

      await recordAuditLog(tx, {
        actorId: ctx.user.id,
        actorRole: authorRole,
        vendorId: cur.vendor_id || null,
        targetType: 'support_issue',
        targetId: issueId,
        action: 'issue.reopen',
        metadata: { ticket_number: cur.ticket_number, to_status: nextStatus }
      });

      return {
        status: 200,
        body: {
          ok: true,
          issue: serializeSupportTicketForReporter(updRows[0], { viewerUserId: ctx.user.id })
        }
      };
    });
    return sendJson(outcome.status, outcome.body);
  }

  if (normPath === '/api/issues/read') {
    if (method !== 'POST') return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'POST' });
    if (!ctx.authenticated || !ctx.user?.id) return sendJson(401, { error: 'Sign in is required.' });
    const issueId = typeof body.issue_id === 'string' ? body.issue_id.trim() : '';
    if (!UUID_RE.test(issueId)) return sendJson(400, { error: 'Valid issue_id is required.' });
    await withTransaction(dbAdapter, async tx => {
      await tx.query("SELECT set_config('app.user_id', $1, true)", [ctx.user.id]);
      await tx.query(
        'UPDATE support_issues SET reporter_last_read_at = now() WHERE id = $1 AND reporter_user_id = $2',
        [issueId, ctx.user.id]
      );
    });
    return sendJson(200, { ok: true });
  }

  // =========================================================================
  // 6. Administration Portal Endpoints (`/api/admin/*`) — `Admin: Mod` & `Admin: Top`
  // =========================================================================
  if (!normPath.startsWith('/api/admin/')) {
    return sendJson(404, { error: 'Not found' });
  }

  if (!ctx.authenticated || !ctx.user?.id) {
    return sendJson(401, { error: 'Sign in is required.', login_url: '/login.html?next=/admin' });
  }
  if (!ctx.isModAdmin) {
    return sendJson(403, { error: 'Administrator access (Admin: Mod or Admin: Top) is required.' });
  }

  // -------------------------------------------------------------------------
  // 6A. Overview & Safe Operational Health (`GET /api/admin/overview`)
  // -------------------------------------------------------------------------
  if (normPath === '/api/admin/overview') {
    if (method !== 'GET') return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'GET' });
    const out = await withTransaction(dbAdapter, async tx => {
      const verified = await reverifyModeratorInTx(tx, ctx);
      if (!verified.ok) return { denied: verified };
      await enableAdminTxGuards(tx, ctx);
      await tx.query("SELECT set_config('app.pager_internal', 'true', true)");

      const appsQ = await tx.query(`
          SELECT
            count(*) FILTER (WHERE status = 'submitted')::int AS pending_submitted,
            count(*) FILTER (WHERE status = 'needs_info')::int AS needs_info,
            count(*) FILTER (WHERE status = 'submitted' AND mod_recommendation <> 'none')::int AS awaiting_top_decision
          FROM vendor_applications
        `);
      const invQ = await tx.query(`
          SELECT
            count(*) FILTER (WHERE status = 'pending_top_approval')::int AS pending_privileged,
            count(*) FILTER (WHERE status = 'issued' AND expires_at > now())::int AS active_issued
          FROM account_invitations
        `);
      const commQ = await tx.query(`
          SELECT
            count(*) FILTER (WHERE status = 'pending')::int AS pending_comments,
            count(*) FILTER (WHERE status = 'approved' AND report_count > 0)::int AS flagged_approved_comments,
            count(*) FILTER (WHERE status = 'hidden')::int AS hidden_comments
          FROM community_reviews
        `);
      const repQ = await tx.query(`SELECT count(*) FILTER (WHERE status = 'open')::int AS open_reports FROM community_reports`);
      const issQ = await tx.query(`
          SELECT
            count(*) FILTER (WHERE status IN ('open', 'in_review', 'in_progress', 'waiting'))::int AS open_issues,
            count(*) FILTER (WHERE status IN ('open', 'in_review', 'in_progress', 'waiting') AND sla_due_at < now())::int AS overdue_issues,
            count(*) FILTER (WHERE status IN ('open', 'in_review', 'in_progress', 'waiting') AND severity IN ('high', 'urgent'))::int AS high_priority_issues,
            count(*) FILTER (WHERE status IN ('open', 'in_review', 'in_progress', 'waiting') AND waiting_for_team = true)::int AS waiting_for_team_issues,
            count(*) FILTER (WHERE status IN ('open', 'in_review', 'in_progress', 'waiting') AND reporter_urgency = 'critical')::int AS critical_reported_issues
          FROM support_issues
        `);
      const vendQ = await tx.query(`
          SELECT
            count(*) FILTER (WHERE is_active = true)::int AS active_vendors,
            count(*) FILTER (WHERE ownership_status = 'approved_owner')::int AS claimed_vendors,
            count(*) FILTER (
              WHERE is_active = false
                 OR vendor_access_suspended = true
                 OR hidden_from_discovery = true
                 OR bookings_restricted = true
                 OR pager_restricted = true
                 OR needs_info_correction = true
            )::int AS restricted_or_suspended_vendors
          FROM vendors
          WHERE id NOT LIKE 'estrella%' AND id <> 'owner-truck'
        `);
      const delivQ = await tx.query(`
          SELECT
            count(*) FILTER (WHERE status = 'queued')::int AS outbox_queued,
            count(*) FILTER (WHERE status = 'retry_scheduled')::int AS outbox_retrying,
            count(*) FILTER (WHERE status = 'failed_permanent')::int AS outbox_failed_permanent,
            COALESCE(
              EXTRACT(EPOCH FROM (now() - min(created_at) FILTER (WHERE status IN ('queued', 'retry_scheduled'))))::int,
              0
            ) AS oldest_pending_age_sec
          FROM pager_notification_deliveries
        `);
      const readinessQ = await tx.query(`
          SELECT
            count(*) FILTER (WHERE is_launch_critical = true AND status NOT IN ('legally_approved', 'not_applicable'))::int AS unresolved_launch_critical,
            count(*) FILTER (WHERE status = 'legally_approved')::int AS legally_approved_count,
            count(*) FILTER (WHERE status = 'needs_re_review')::int AS needs_re_review_count,
            count(*)::int AS total_items,
            COALESCE(bool_or(item_key = 'final_legal_launch_gate' AND status = 'legally_approved'), false) AS final_launch_approved
          FROM compliance_readiness_items
        `);

      let openDiagnosticsCount = 0;
      let workerHeartbeat = null;
      await tx.query('SAVEPOINT ov_diag_meta');
      try {
        const diagQ = await tx.query(
          `SELECT count(*)::int AS c
           FROM diagnostic_incident_groups
           WHERE triage_status <> 'resolved'
             AND is_synthetic_test = false
             AND ($1::boolean OR mod_visible = true)`,
          [verified.actorRole === 'top']
        );
        openDiagnosticsCount = diagQ.rows[0]?.c || 0;
        const hbQ = await tx.query(
          `SELECT worker_name, last_run_at, last_status, release_sha
           FROM worker_runtime_heartbeats
           WHERE worker_name = 'pager_notifications'
           LIMIT 1`
        );
        workerHeartbeat = hbQ.rows[0] || null;
        await tx.query('RELEASE SAVEPOINT ov_diag_meta');
      } catch {
        await tx.query('ROLLBACK TO SAVEPOINT ov_diag_meta').catch(() => {});
      }

      const notifCfg = inspectNotificationRuntimeConfig();
      const writePause = inspectWritePauseConfig();

      const appsRow = appsQ.rows[0] || {};
      const invRow = invQ.rows[0] || {};
      const commRow = commQ.rows[0] || {};
      const repCount = repQ.rows[0]?.open_reports || 0;
      const issRow = issQ.rows[0] || {};
      const vendRow = vendQ.rows[0] || {};
      const delivRow = delivQ.rows[0] || {};
      const readinessRow = readinessQ.rows[0] || {};
      const unresolvedCritical = readinessRow.unresolved_launch_critical || 0;
      const launchReady = Boolean(readinessRow.final_launch_approved) && unresolvedCritical === 0;

      return {
        actor: {
          id: ctx.user.id,
          email: ctx.user.email,
          level: verified.actorRole,
          label: verified.actorRole === 'top' ? ROLE_LABELS.top : ROLE_LABELS.mod
        },
        counts: {
          pending_applications: (appsRow.pending_submitted || 0) + (appsRow.needs_info || 0),
          mod_recommended_applications: appsRow.awaiting_top_decision || 0,
          pending_privileged_invitations: invRow.pending_privileged || 0,
          pending_comments: commRow.pending_comments || 0,
          reported_comments: Math.max(commRow.flagged_approved_comments || 0, repCount),
          open_issues: issRow.open_issues || 0,
          overdue_issues: issRow.overdue_issues || 0,
          suspended_vendors: vendRow.restricted_or_suspended_vendors || 0,
          restricted_vendors: vendRow.restricted_or_suspended_vendors || 0,
          unresolved_launch_critical: unresolvedCritical,
          needs_re_review_items: readinessRow.needs_re_review_count || 0,
          open_diagnostics: openDiagnosticsCount
        },
        launch_readiness: {
          launch_ready: launchReady,
          launch_readiness_incomplete: !launchReady,
          unresolved_launch_critical: unresolvedCritical,
          legally_approved_count: readinessRow.legally_approved_count || 0,
          needs_re_review_count: readinessRow.needs_re_review_count || 0,
          total_items: readinessRow.total_items || 0,
          reminder_banner: LAUNCH_INCOMPLETE_REMINDER_TEXT,
          deployment_portal_notice: DEPLOYMENT_PORTAL_REMINDER_NOTE
        },
        queues: {
          vendor_applications: appsRow,
          invitations: invRow,
          moderation: {
            ...commRow,
            open_reports: repCount
          },
          issues: issRow,
          vendors: vendRow
        },
        operational_health: {
          push_delivery_enabled: Boolean(notifCfg.provider_enabled ?? notifCfg.push_enabled),
          push_provider_mode: notifCfg.provider_mode,
          subscriptions_paused: Boolean(notifCfg.subscriptions_paused),
          delivery_paused: Boolean(notifCfg.delivery_paused),
          write_pause_active: writePause.active,
          write_pause_scopes: writePause.scopes,
          write_pause: { active: writePause.active, scopes: writePause.scopes },
          last_worker_run_at: workerHeartbeat?.last_run_at
            ? new Date(workerHeartbeat.last_run_at).toISOString()
            : null,
          worker_status: workerHeartbeat?.last_status || null,
          outbox: delivRow,
          outbox_queue: {
            pending: delivRow.outbox_queued || 0,
            retrying: delivRow.outbox_retrying || 0,
            dead_letter: delivRow.outbox_failed_permanent || 0,
            oldest_pending_age_sec: Math.max(0, Number(delivRow.oldest_pending_age_sec || 0))
          }
        },
        observed_at: new Date().toISOString()
      };
    });
    if (out.denied) return sendJson(out.denied.status, { error: out.denied.error });
    return sendJson(200, out);
  }

  // -------------------------------------------------------------------------
  // 6A-Email. Authentication Email Delivery & Domain Readiness (`GET /api/admin/email-readiness`) — `Admin: Top` ONLY
  // -------------------------------------------------------------------------
  if (normPath === '/api/admin/email-readiness') {
    if (method !== 'GET') return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'GET' });
    const accessCheck = await withTransaction(dbAdapter, async tx => {
      const verifiedTop = await reverifyPlatformAdminInTx(tx, ctx);
      if (!verifiedTop.ok) return { denied: verifiedTop };
      return { ok: true };
    });
    if (accessCheck.denied) {
      return sendJson(accessCheck.denied.status, {
        error: accessCheck.denied.error || 'Only Admin: Top may inspect authentication email readiness.',
        code: 'TOP_ADMIN_REQUIRED'
      });
    }
    const report = await inspectAdminEmailReadiness(dbAdapter);
    return sendJson(200, report);
  }

  // -------------------------------------------------------------------------
  // 6B. Read-Only Vendor Viewpoint Projection (`GET /api/admin/vendor-preview`)
  // -------------------------------------------------------------------------
  if (normPath === '/api/admin/vendor-preview') {
    if (method !== 'GET') return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'GET' });
    const vendorId = typeof query.vendor_id === 'string' ? query.vendor_id.trim() : '';
    if (!vendorId || vendorId.length > 80) return sendJson(400, { error: 'vendor_id is required.' });

    const out = await withTransaction(dbAdapter, async tx => {
      const verified = await reverifyModeratorInTx(tx, ctx);
      if (!verified.ok) return { denied: verified };
      const { rows: vRows } = await tx.query(
        `SELECT
           v.id, v.canonical_name, v.city, v.cuisine, v.listing_kind, v.event_bookable, v.is_active,
           v.ownership_status, v.verified, v.photo_rights_verified,
           v.hidden_from_discovery, v.bookings_restricted, v.vendor_access_suspended,
           v.pager_restricted, v.needs_info_correction, v.correction_note, v.restriction_reason,
           v.restriction_authority, v.temp_restriction_expires_at,
           op.display_name, op.description, op.cuisine AS op_cuisine, op.accepting_bookings,
           ts.location AS live_location, ts.lat AS live_lat, ts.lng AS live_lng, ts.is_open AS live_is_open
         FROM vendors v
         LEFT JOIN owner_profiles op ON op.truck_id = v.id
         LEFT JOIN truck_settings ts ON ts.truck_id = v.id
         WHERE v.id = $1`,
        [vendorId]
      );
      if (!vRows.length) return { notFound: true };
      const v = vRows[0];
      await enableAdminTxGuards(tx, ctx);
      const statsRes = await tx.query(
        `SELECT
           count(*)::int AS total_requests,
           count(*) FILTER (WHERE status = 'pending')::int AS pending,
           count(*) FILTER (WHERE status = 'accepted')::int AS accepted
         FROM bookings
         WHERE truck_id = $1`,
        [vendorId]
      );
      const schedRes = await tx.query(
        `SELECT to_char(service_date, 'YYYY-MM-DD') AS service_date, opens_at, closes_at, location, status
         FROM owner_schedule
         WHERE truck_id = $1 AND service_date >= CURRENT_DATE - 1
         ORDER BY service_date ASC
         LIMIT 10`,
        [vendorId]
      );
      const pagersRes = await tx.query(
        `SELECT count(*)::int AS active_pagers
         FROM pickup_pagers
         WHERE vendor_id = $1 AND expires_at > now() AND status NOT IN ('collected', 'cancelled')`,
        [vendorId]
      );
      const memRes = await tx.query(
        `SELECT vm.user_id, vm.role, au.email_normalized AS email
         FROM vendor_memberships vm
         LEFT JOIN auth_users au ON au.id = vm.user_id
         WHERE vm.vendor_id = $1
         ORDER BY vm.role ASC`,
        [vendorId]
      );
      const histRes = await tx.query(
        `SELECT id, vendor_id, actor_id, actor_role, action, reason, before_state, after_state, created_at
         FROM vendor_status_history
         WHERE vendor_id = $1
         ORDER BY created_at DESC
         LIMIT 20`,
        [vendorId]
      );

      const effRestr = evaluateEffectiveVendorRestrictions(v);
      const statsRow = statsRes.rows[0] || { total_requests: 0, pending: 0, accepted: 0 };
      const activePagersCount = pagersRes.rows[0]?.active_pagers || 0;

      return {
        preview_read_only: true,
        admin_actor: {
          id: ctx.user.id,
          email: ctx.user.email,
          level: verified.actorRole,
          label: verified.actorRole === 'top' ? ROLE_LABELS.top : ROLE_LABELS.mod,
          can_act_on_behalf: verified.actorRole === 'top'
        },
        vendor: {
          id: v.id,
          canonical_name: v.canonical_name,
          display_name: v.display_name || v.canonical_name,
          city: v.city,
          town: v.city,
          cuisine: v.op_cuisine || v.cuisine,
          description: v.description || null,
          summary: v.description || null,
          listing_kind: v.listing_kind,
          category: v.listing_kind,
          event_bookable: v.event_bookable,
          booking_enabled: v.event_bookable,
          accepting_bookings: v.accepting_bookings !== false,
          is_active: v.is_active,
          ownership_status: v.ownership_status,
          verified: v.verified,
          verified_status: v.verified,
          photo_rights_verified: v.photo_rights_verified,
          photo_rights_confirmed: v.photo_rights_verified,
          restrictions: effRestr,
          effective_restrictions: effRestr,
          live_location: v.live_location || null,
          live_lat: v.live_lat,
          live_lng: v.live_lng,
          live_is_open: v.live_is_open
        },
        customer_impact: {
          open_bookings: (statsRow.pending || 0) + (statsRow.accepted || 0),
          active_pagers: activePagersCount
        },
        members: memRes.rows,
        status_history: histRes.rows,
        stats: statsRow,
        schedule: schedRes.rows,
        active_pagers_count: activePagersCount
      };
    });
    if (out.denied) return sendJson(out.denied.status, { error: out.denied.error });
    if (out.notFound) return sendJson(404, { error: 'Vendor not found.' });
    return sendJson(200, out);
  }

  // -------------------------------------------------------------------------
  // 6C. Vendor Applications Review Queue (`/api/admin/applications*`)
  // -------------------------------------------------------------------------
  if (normPath === '/api/admin/applications') {
    if (method !== 'GET') return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'GET' });
    const { page, pageSize, offset } = parseBoundedPagination(query, 20, 50);
    const statusFilter = typeof query.status === 'string' && query.status.trim() ? query.status.trim() : '';
    const rawRec = query.mod_recommendation || query.recommendation || '';
    const recFilter =
      typeof rawRec === 'string' && rawRec.trim()
        ? rawRec.trim() === 'unreviewed'
          ? 'none'
          : rawRec.trim()
        : '';
    const conflictsOnly = query.conflicts_only === '1' || query.conflicts_only === 'true';
    const qText = typeof query.q === 'string' && query.q.trim() ? `%${query.q.trim().slice(0, 80)}%` : null;

    const out = await withTransaction(dbAdapter, async tx => {
      const verified = await reverifyModeratorInTx(tx, ctx);
      if (!verified.ok) return { denied: verified };
      await enableAdminTxGuards(tx, ctx);

      const conds = ['1=1'];
      const params = [];
      if (statusFilter && statusFilter !== 'all') {
        params.push(statusFilter);
        conds.push(`a.status = $${params.length}`);
      }
      if (recFilter && recFilter !== 'all') {
        params.push(recFilter);
        conds.push(`a.mod_recommendation = $${params.length}`);
      }
      if (qText) {
        params.push(qText);
        conds.push(
          `(a.business_name ILIKE $${params.length} OR a.applicant_email ILIKE $${params.length} OR COALESCE(a.target_vendor_id, a.proposed_slug, '') ILIKE $${params.length} OR a.city ILIKE $${params.length})`
        );
      }
      if (conflictsOnly) {
        conds.push(`(
          (a.target_vendor_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM vendor_memberships vm WHERE vm.vendor_id = a.target_vendor_id AND vm.role = 'owner'
          ))
          OR (a.target_vendor_id IS NOT NULL AND (
            SELECT count(*) FROM vendor_applications a2
            WHERE a2.target_vendor_id = a.target_vendor_id AND a2.status IN ('submitted', 'needs_info')
          ) > 1)
        )`);
      }

      const whereSql = conds.join(' AND ');
      const totalRes = await tx.query(`SELECT count(*)::int AS total FROM vendor_applications a WHERE ${whereSql}`, params);

      params.push(pageSize, offset);
      const { rows } = await tx.query(
        `SELECT
           a.*,
           v.canonical_name AS target_canonical_name,
           v.ownership_status AS target_ownership_status,
           EXISTS (
             SELECT 1 FROM vendor_memberships vm
             WHERE vm.vendor_id = a.target_vendor_id AND vm.role = 'owner'
           ) AS target_already_has_owner,
           (
             SELECT count(*)::int FROM vendor_applications a2
             WHERE a2.target_vendor_id IS NOT NULL
               AND a2.target_vendor_id = a.target_vendor_id
               AND a2.id <> a.id
               AND a2.status IN ('submitted', 'needs_info')
           ) AS competing_open_claims
         FROM vendor_applications a
         LEFT JOIN vendors v ON v.id = a.target_vendor_id
         WHERE ${whereSql}
         ORDER BY
           CASE a.status WHEN 'submitted' THEN 0 WHEN 'needs_info' THEN 1 ELSE 2 END ASC,
           a.updated_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );

      const appIds = rows.map(r => r.id);
      const evMap = new Map();
      if (appIds.length) {
        const { rows: evs } = await tx.query(
          `SELECT id, application_id, original_filename, mime_type, byte_size, evidence_kind, retention_expires_at, created_at
           FROM vendor_application_evidence
           WHERE application_id = ANY($1::uuid[]) AND deleted_at IS NULL
           ORDER BY created_at ASC`,
          [appIds]
        );
        for (const ev of evs) {
          if (!evMap.has(ev.application_id)) evMap.set(ev.application_id, []);
          evMap.get(ev.application_id).push(ev);
        }
      }

      return {
        page,
        page_size: pageSize,
        total: totalRes.rows[0]?.total || 0,
        applications: rows.map(r => {
          const evList = (evMap.get(r.id) || []).map(ev => ({ ...ev, byte_length: ev.byte_size }));
          const conflictCount = Number(r.competing_open_claims || 0) + (r.target_already_has_owner && r.status !== 'approved' ? 1 : 0);
          return {
            ...r,
            application_type: r.claim_type === 'new_listing' ? 'new_listing' : 'claim_existing',
            existing_vendor_name: r.target_canonical_name || null,
            existing_ownership_status: r.target_ownership_status || null,
            primary_town: r.city,
            category: r.listing_kind,
            public_summary: r.service_area,
            website_url: r.website_or_menu_url,
            open_conflict_claims: conflictCount,
            has_ownership_conflict: conflictCount > 0,
            evidence: evList
          };
        })
      };
    });
    if (out.denied) return sendJson(out.denied.status, { error: out.denied.error });
    return sendJson(200, out);
  }

  if (normPath === '/api/admin/applications/decision') {
    if (method !== 'POST') return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'POST' });
    const appId = typeof body.application_id === 'string' ? body.application_id.trim() : '';
    const rawAction = typeof body.action === 'string' ? body.action.trim() : '';
    const action = rawAction === 'save_internal_note' ? 'add_internal_note' : rawAction;
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    const applicantFeedback =
      typeof body.applicant_feedback === 'string' && body.applicant_feedback.trim()
        ? body.applicant_feedback.trim().slice(0, 600)
        : null;
    const internalNote =
      typeof (body.internal_note ?? body.internal_notes) === 'string'
        ? String(body.internal_note ?? body.internal_notes).trim()
        : '';
    const expectedStatus = typeof body.expected_status === 'string' && body.expected_status.trim() ? body.expected_status.trim() : null;
    const expectedUpdatedAt =
      typeof body.expected_updated_at === 'string' && body.expected_updated_at.trim()
        ? body.expected_updated_at.trim()
        : null;

    if (!UUID_RE.test(appId)) return sendJson(400, { error: 'Valid application_id is required.' });
    if (
      ![
        'add_internal_note',
        'request_info',
        'recommend_approve',
        'recommend_reject',
        'approve',
        'reject',
        'suspend'
      ].includes(action)
    ) {
      return sendJson(400, { error: 'Invalid application decision action.' });
    }
    if (action !== 'add_internal_note' && (reason.length < 4 || reason.length > 600)) {
      return sendJson(400, { error: 'A clear reason (4–600 characters) is required for this decision.' });
    }
    if (action === 'add_internal_note' && (internalNote.length < 2 || internalNote.length > 1800)) {
      return sendJson(400, { error: 'Internal note must be between 2 and 1800 characters.' });
    }

    const outcome = await withTransaction(dbAdapter, async tx => {
      const verified = await reverifyModeratorInTx(tx, ctx);
      if (!verified.ok) return { status: verified.status, body: { error: verified.error } };
      await enableAdminTxGuards(tx, ctx);

      const isTop = verified.actorRole === 'top';
      if (['approve', 'reject', 'suspend'].includes(action) && !isTop) {
        return {
          status: 403,
          body: {
            error: 'Admin: Top authorization is required for final vendor approval, rejection, or suspension. Admin: Mod may request corrections or record a recommendation.',
            code: 'TOP_APPROVAL_REQUIRED'
          }
        };
      }

      const { rows } = await tx.query('SELECT * FROM vendor_applications WHERE id = $1 FOR UPDATE', [appId]);
      if (!rows.length) return { status: 404, body: { error: 'Application not found.' } };
      const app = rows[0];

      if (expectedStatus && app.status !== expectedStatus) {
        return {
          status: 409,
          body: {
            error: `Application state changed concurrently (currently "${app.status}", expected "${expectedStatus}"). Refresh before deciding.`,
            code: 'STALE_APPLICATION_STATE'
          }
        };
      }
      if (expectedUpdatedAt && app.updated_at) {
        const expMs = new Date(expectedUpdatedAt).getTime();
        const curMs = new Date(app.updated_at).getTime();
        if (Number.isFinite(expMs) && Number.isFinite(curMs) && Math.abs(expMs - curMs) > 5) {
          return {
            status: 409,
            body: {
              error: 'Application was modified concurrently by another actor. Refresh and review the latest state.',
              code: 'STALE_APPLICATION_STATE'
            }
          };
        }
      }

      if (app.applicant_user_id === ctx.user.id && action !== 'add_internal_note') {
        return {
          status: 403,
          body: { error: 'Administrators cannot recommend or decide their own vendor application.', code: 'SELF_DECISION_FORBIDDEN' }
        };
      }

      if (action === 'add_internal_note') {
        const existingNotes = String(app.internal_notes || '').trim();
        let deltaNote = internalNote;
        if (existingNotes && deltaNote.startsWith(existingNotes)) {
          deltaNote = deltaNote.slice(existingNotes.length).trim();
        }
        if (!deltaNote) {
          return { status: 400, body: { error: 'Enter a new internal note to append.' } };
        }
        const stamped = `[${new Date().toISOString()} · ${ctx.user.email || ctx.user.id} (${verified.actorRole.toUpperCase()})] ${deltaNote}`;
        const combined = existingNotes ? `${existingNotes}\n${stamped}`.slice(-2000) : stamped.slice(0, 2000);
        const { rows: u } = await tx.query(
          'UPDATE vendor_applications SET internal_notes = $2, updated_at = now() WHERE id = $1 RETURNING *',
          [appId, combined]
        );
        await recordAuditLog(tx, {
          actorId: ctx.user.id,
          actorRole: verified.actorRole,
          vendorId: app.target_vendor_id || app.approved_vendor_id || null,
          targetType: 'vendor_application',
          targetId: appId,
          action: 'vendor_application.internal_note'
        });
        return { status: 200, body: { application: u[0] } };
      }

      if (action === 'request_info') {
        if (!['submitted', 'needs_info'].includes(app.status)) {
          return { status: 409, body: { error: `Cannot request info on an application in "${app.status}" status.` } };
        }
        const effApplicantMsg = applicantFeedback || reason;
        const { rows: u } = await tx.query(
          `UPDATE vendor_applications
           SET status = 'needs_info',
               applicant_feedback = $2,
               updated_at = now()
           WHERE id = $1
           RETURNING *`,
          [appId, effApplicantMsg]
        );
        await recordTestSafeNotificationInTx(tx, {
          recipientUserId: app.applicant_user_id,
          recipientEmail: app.applicant_email,
          eventKind: 'vendor_application.needs_info',
          subject: 'BiteShark Vendor Application — Additional Information Needed',
          summary: effApplicantMsg
        });
        await recordAuditLog(tx, {
          actorId: ctx.user.id,
          actorRole: verified.actorRole,
          vendorId: app.target_vendor_id || null,
          targetType: 'vendor_application',
          targetId: appId,
          action: 'vendor_application.request_info'
        });
        return {
          status: 200,
          body: {
            application: u[0],
            notification_delivery: 'recorded_in_app_only'
          }
        };
      }

      if (action === 'recommend_approve' || action === 'recommend_reject') {
        if (app.status !== 'submitted') {
          return { status: 409, body: { error: 'Recommendations can only be recorded on submitted applications.' } };
        }
        const recVal = action === 'recommend_approve' ? 'recommend_approve' : 'recommend_reject';
        const { rows: u } = await tx.query(
          `UPDATE vendor_applications
           SET mod_recommendation = $2,
               mod_recommended_by = $3,
               mod_recommended_at = now(),
               mod_recommendation_reason = $4,
               updated_at = now()
           WHERE id = $1
           RETURNING *`,
          [appId, recVal, ctx.user.id, reason]
        );
        await recordAuditLog(tx, {
          actorId: ctx.user.id,
          actorRole: verified.actorRole,
          vendorId: app.target_vendor_id || null,
          targetType: 'vendor_application',
          targetId: appId,
          action: `vendor_application.${action}`,
          metadata: { recommendation: recVal }
        });
        return { status: 200, body: { application: u[0] } };
      }

      if (action === 'reject') {
        if (!['submitted', 'needs_info'].includes(app.status)) {
          return { status: 409, body: { error: `Application is already "${app.status}".` } };
        }
        const effRejectFeedback = applicantFeedback || reason;
        const { rows: u } = await tx.query(
          `UPDATE vendor_applications
           SET status = 'rejected',
               decided_by = $2,
               decided_role = 'top',
               decided_at = now(),
               decision_reason = $3,
               applicant_feedback = $4,
               updated_at = now()
           WHERE id = $1
           RETURNING *`,
          [appId, ctx.user.id, reason, effRejectFeedback]
        );
        await recordTestSafeNotificationInTx(tx, {
          recipientUserId: app.applicant_user_id,
          recipientEmail: app.applicant_email,
          eventKind: 'vendor_application.rejected',
          subject: 'BiteShark Vendor Application Decision',
          summary: effRejectFeedback
        });
        await recordAuditLog(tx, {
          actorId: ctx.user.id,
          actorRole: 'top',
          vendorId: app.target_vendor_id || null,
          targetType: 'vendor_application',
          targetId: appId,
          action: 'vendor_application.reject'
        });
        return {
          status: 200,
          body: {
            application: u[0],
            notification_delivery: 'recorded_in_app_only'
          }
        };
      }

      if (action === 'approve') {
        if (app.status !== 'submitted') {
          return { status: 409, body: { error: `Only "submitted" applications can be approved (currently "${app.status}").` } };
        }

        let resolvedVendorId = app.target_vendor_id;
        if (app.claim_type === 'existing_listing') {
          const { rows: vRows } = await tx.query('SELECT * FROM vendors WHERE id = $1 FOR UPDATE', [resolvedVendorId]);
          if (!vRows.length) return { status: 400, body: { error: 'Target vendor listing no longer exists.' } };
          const { rows: existingOwners } = await tx.query(
            "SELECT user_id FROM vendor_memberships WHERE vendor_id = $1 AND role = 'owner' FOR UPDATE",
            [resolvedVendorId]
          );
          if (existingOwners.some(o => o.user_id !== app.applicant_user_id)) {
            return {
              status: 409,
              body: {
                error:
                  'Ownership conflict: this listing already has an active approved Vendor Owner. Resolve or revoke existing ownership before approving a competing claim.',
                code: 'OWNERSHIP_CONFLICT_ALREADY_CLAIMED'
              }
            };
          }
          await tx.query(
            `UPDATE vendors
             SET ownership_status = 'approved_owner',
                 updated_at = now()
             WHERE id = $1`,
            [resolvedVendorId]
          );
        } else {
          resolvedVendorId = app.proposed_slug;
          const { rows: slugCollision } = await tx.query('SELECT id FROM vendors WHERE id = $1 FOR UPDATE', [
            resolvedVendorId
          ]);
          if (slugCollision.length) {
            return {
              status: 409,
              body: {
                error: `Vendor slug "${resolvedVendorId}" already exists in the catalog.`,
                code: 'VENDOR_SLUG_CONFLICT'
              }
            };
          }
          // Create new vendor listing with conservative defaults: `verified = false`, `photo_rights_verified = false`
          await tx.query(
            `INSERT INTO vendors (
               id, canonical_name, city, cuisine, listing_kind, event_bookable, is_active,
               ownership_status, verified, verification_status, photo_rights_verified,
               curated_location, curated_location_source, curated_location_accuracy, blurb
             )
             VALUES ($1, $2, $3, $4, $5, $6, true, 'approved_owner', false, 'needs_review', false,
                     $7, 'curated_illustrative', 'illustrative_pin', $8)`,
            [
              resolvedVendorId,
              app.business_name,
              app.city,
              app.cuisine,
              app.listing_kind,
              app.listing_kind === 'food_truck' || app.listing_kind === 'venue',
              `${app.service_area}, ${app.city}`,
              `Local ${app.cuisine} vendor in ${app.city}. Confirm current hours and menu directly.`
            ]
          );
        }

        await tx.query("SELECT set_config('app.is_platform_admin', 'true', true)");
        await tx.query(
          `INSERT INTO vendor_memberships (vendor_id, user_id, role, granted_by)
           VALUES ($1, $2, 'owner', $3)
           ON CONFLICT (vendor_id, user_id) DO UPDATE SET role = 'owner', granted_by = EXCLUDED.granted_by`,
          [resolvedVendorId, app.applicant_user_id, ctx.user.id]
        );

        const effApproveFeedback = applicantFeedback || reason;
        const { rows: u } = await tx.query(
          `UPDATE vendor_applications
           SET status = 'approved',
               approved_vendor_id = $2,
               decided_by = $3,
               decided_role = 'top',
               decided_at = now(),
               decision_reason = $4,
               applicant_feedback = $5,
               updated_at = now()
           WHERE id = $1
           RETURNING *`,
          [appId, resolvedVendorId, ctx.user.id, reason, effApproveFeedback]
        );

        await tx.query(
          `INSERT INTO vendor_status_history (vendor_id, actor_id, actor_role, action, reason, before_state, after_state)
           VALUES ($1, $2, 'top', 'vendor.ownership_approved', $3, $4::jsonb, $5::jsonb)`,
          [
            resolvedVendorId,
            ctx.user.id,
            reason,
            JSON.stringify({ application_id: appId, claim_type: app.claim_type }),
            JSON.stringify({ approved_owner_user_id: app.applicant_user_id, verified: false })
          ]
        );

        await recordTestSafeNotificationInTx(tx, {
          recipientUserId: app.applicant_user_id,
          recipientEmail: app.applicant_email,
          eventKind: 'vendor_application.approved',
          subject: 'BiteShark Vendor Ownership Approved',
          summary: `Approved to manage listing "${app.business_name}" (${resolvedVendorId}).`
        });

        await recordAuditLog(tx, {
          actorId: ctx.user.id,
          actorRole: 'top',
          vendorId: resolvedVendorId,
          targetType: 'vendor_application',
          targetId: appId,
          action: 'vendor_application.approve',
          metadata: { applicant_user_id: app.applicant_user_id, claim_type: app.claim_type }
        });

        return { status: 200, body: { application: u[0], approved_vendor_id: resolvedVendorId } };
      }

      if (action === 'suspend') {
        if (app.status !== 'approved') {
          return { status: 409, body: { error: 'Only approved applications can be suspended.' } };
        }
        const vid = app.approved_vendor_id || app.target_vendor_id;
        if (vid) {
          await tx.query(
            `UPDATE vendors
             SET vendor_access_suspended = true,
                 ownership_status = 'suspended',
                 restriction_reason = $2,
                 restricted_by = $3,
                 restriction_authority = 'top',
                 restricted_at = now(),
                 updated_at = now()
             WHERE id = $1`,
            [vid, reason, ctx.user.id]
          );
        }
        const { rows: u } = await tx.query(
          `UPDATE vendor_applications
           SET status = 'suspended',
               decided_by = $2,
               decided_role = 'top',
               decided_at = now(),
               decision_reason = $3,
               applicant_feedback = $3,
               updated_at = now()
           WHERE id = $1
           RETURNING *`,
          [appId, ctx.user.id, reason]
        );
        await recordAuditLog(tx, {
          actorId: ctx.user.id,
          actorRole: 'top',
          vendorId: vid || null,
          targetType: 'vendor_application',
          targetId: appId,
          action: 'vendor_application.suspend'
        });
        return { status: 200, body: { application: u[0] } };
      }
    });

    return sendJson(outcome.status, outcome.body);
  }

  // -------------------------------------------------------------------------
  // 6D. Vendor Directory Governance & Granular Restrictions (`/api/admin/vendors*`)
  // -------------------------------------------------------------------------
  if (normPath === '/api/admin/vendors') {
    if (method !== 'GET') return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'GET' });
    const { page, pageSize, offset } = parseBoundedPagination(query, 25, 60);
    const statusFilter = typeof query.status === 'string' ? query.status.trim() : '';
    const townFilter = typeof query.town === 'string' ? query.town.trim() : '';
    const ownerFilter = typeof query.ownership === 'string' ? query.ownership.trim() : '';
    const verifFilter = typeof (query.verification || query.verified) === 'string' ? String(query.verification || query.verified).trim() : '';
    const qText = typeof query.q === 'string' && query.q.trim() ? `%${query.q.trim().slice(0, 80)}%` : null;

    const out = await withTransaction(dbAdapter, async tx => {
      const verified = await reverifyModeratorInTx(tx, ctx);
      if (!verified.ok) return { denied: verified };
      await enableAdminTxGuards(tx, ctx);

      const conds = ["v.id NOT LIKE 'estrella%'", "v.id <> 'owner-truck'"];
      const params = [];

      if (statusFilter === 'active') {
        conds.push(
          'v.is_active = true AND v.hidden_from_discovery = false AND v.vendor_access_suspended = false AND v.bookings_restricted = false AND v.pager_restricted = false'
        );
      } else if (statusFilter === 'restricted') {
        conds.push(
          '(v.is_active = false OR v.hidden_from_discovery = true OR v.vendor_access_suspended = true OR v.bookings_restricted = true OR v.pager_restricted = true)'
        );
      } else if (statusFilter === 'suspended' || statusFilter === 'access_suspended') {
        conds.push('v.vendor_access_suspended = true');
      } else if (statusFilter === 'hidden') conds.push('v.hidden_from_discovery = true');
      else if (statusFilter === 'bookings_restricted') conds.push('v.bookings_restricted = true');
      else if (statusFilter === 'pager_restricted') conds.push('v.pager_restricted = true');
      else if (statusFilter === 'needs_correction') conds.push('v.needs_info_correction = true');
      else if (statusFilter === 'inactive') conds.push('v.is_active = false');

      if (townFilter && townFilter !== 'all') {
        params.push(townFilter);
        conds.push(`v.city ILIKE $${params.length}`);
      }
      if (ownerFilter && ownerFilter !== 'all') {
        params.push(ownerFilter);
        conds.push(`v.ownership_status = $${params.length}`);
      }
      if (verifFilter === 'verified') conds.push('v.verified = true');
      else if (verifFilter === 'needs_review' || verifFilter === 'unverified') conds.push('v.verified = false');
      else if (verifFilter === 'photo_rights') conds.push('v.photo_rights_verified = true');

      if (qText) {
        params.push(qText);
        conds.push(
          `(v.id ILIKE $${params.length} OR v.canonical_name ILIKE $${params.length} OR COALESCE(op.display_name, '') ILIKE $${params.length} OR v.city ILIKE $${params.length})`
        );
      }

      const whereSql = conds.join(' AND ');
      const totalRes = await tx.query(
        `SELECT count(*)::int AS total
         FROM vendors v
         LEFT JOIN owner_profiles op ON op.truck_id = v.id
         WHERE ${whereSql}`,
        params
      );

      params.push(pageSize, offset);
      const { rows } = await tx.query(
        `SELECT
           v.id, v.canonical_name, v.city, v.cuisine, v.listing_kind, v.event_bookable, v.is_active,
           v.ownership_status, v.verified, v.verification_status, v.photo_rights_verified,
           v.hidden_from_discovery, v.bookings_restricted, v.vendor_access_suspended,
           v.pager_restricted, v.needs_info_correction, v.correction_note, v.restriction_reason,
           v.restricted_by, v.restriction_authority, v.restricted_at, v.temp_restriction_expires_at,
           v.updated_at,
           op.display_name, op.description, op.accepting_bookings AS owner_accepting_bookings,
           (
             SELECT count(*)::int FROM bookings b
             WHERE b.truck_id = v.id AND b.status IN ('pending', 'accepted')
           ) AS open_bookings_count,
           (
             SELECT count(*)::int FROM pickup_pagers p
             WHERE p.vendor_id = v.id AND p.expires_at > now() AND p.status NOT IN ('collected', 'cancelled')
           ) AS active_pagers_count,
           COALESCE(
             (
               SELECT json_agg(json_build_object('user_id', vm.user_id, 'role', vm.role, 'email', au.email_normalized))
               FROM vendor_memberships vm
               LEFT JOIN auth_users au ON au.id = vm.user_id
               WHERE vm.vendor_id = v.id
             ),
             '[]'::json
           ) AS members
         FROM vendors v
         LEFT JOIN owner_profiles op ON op.truck_id = v.id
         WHERE ${whereSql}
         ORDER BY v.sort_order ASC NULLS LAST, v.id ASC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );

      const historyVendorId = typeof query.history_vendor_id === 'string' ? query.history_vendor_id.trim() : '';
      let history = [];
      if (historyVendorId) {
        const hr = await tx.query(
          `SELECT id, vendor_id, actor_id, actor_role, action, reason, before_state, after_state, created_at
           FROM vendor_status_history
           WHERE vendor_id = $1
           ORDER BY created_at DESC
           LIMIT 25`,
          [historyVendorId]
        );
        history = hr.rows;
      }

      return {
        page,
        page_size: pageSize,
        total: totalRes.rows[0]?.total || 0,
        vendors: rows.map(r => ({
          ...r,
          display_name: r.display_name || r.canonical_name,
          town: r.city,
          category: r.listing_kind,
          verified_status: r.verified,
          photo_rights_confirmed: r.photo_rights_verified,
          effective_restrictions: evaluateEffectiveVendorRestrictions(r)
        })),
        selected_vendor_history: history
      };
    });
    if (out.denied) return sendJson(out.denied.status, { error: out.denied.error });
    return sendJson(200, out);
  }

  if (normPath === '/api/admin/vendors/update') {
    if (method !== 'POST') return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'POST' });
    const vendorId = typeof body.vendor_id === 'string' ? body.vendor_id.trim() : '';
    const action = typeof (body.action || body.operation) === 'string' ? String(body.action || body.operation).trim() : '';
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';

    if (!vendorId || vendorId.length > 80) return sendJson(400, { error: 'vendor_id is required.' });
    if (reason.length < 4 || reason.length > 600) {
      return sendJson(400, { error: 'A clear audit reason (4–600 characters) is required for vendor changes.' });
    }

    const outcome = await withTransaction(dbAdapter, async tx => {
      const verified = await reverifyModeratorInTx(tx, ctx);
      if (!verified.ok) return { status: verified.status, body: { error: verified.error } };
      await enableAdminTxGuards(tx, ctx);

      const isTop = verified.actorRole === 'top';
      const { rows } = await tx.query('SELECT * FROM vendors WHERE id = $1 FOR UPDATE', [vendorId]);
      if (!rows.length) return { status: 404, body: { error: 'Vendor not found.' } };
      const cur = rows[0];

      const beforeSnap = {
        is_active: cur.is_active,
        event_bookable: cur.event_bookable,
        verified: cur.verified,
        photo_rights_verified: cur.photo_rights_verified,
        hidden_from_discovery: cur.hidden_from_discovery,
        bookings_restricted: cur.bookings_restricted,
        vendor_access_suspended: cur.vendor_access_suspended,
        pager_restricted: cur.pager_restricted,
        needs_info_correction: cur.needs_info_correction
      };

      // Admin: Mod is strictly limited to temporary safety restrictions (<= 72h) & correction flags
      if (!isTop) {
        if (action !== 'mod_temp_restriction') {
          return {
            status: 403,
            body: {
              error:
                'Admin: Mod may apply only temporary safety restrictions (up to 72h) or listing correction flags. Permanent suspension, profile edits, and verification require Admin: Top.',
              code: 'TOP_REQUIRED_FOR_VENDOR_ACTION'
            }
          };
        }
        if (
          cur.restriction_authority === 'top' &&
          (cur.vendor_access_suspended || cur.hidden_from_discovery || cur.bookings_restricted || cur.pager_restricted)
        ) {
          return {
            status: 403,
            body: { error: 'Admin: Mod cannot override an active Admin: Top vendor restriction.' }
          };
        }
        if (body.vendor_access_suspended !== undefined || body.is_active !== undefined || body.verified !== undefined) {
          return {
            status: 403,
            body: { error: 'Admin: Mod cannot suspend vendor account access or modify verification flags.' }
          };
        }

        const durationHours = Math.max(
          1,
          Math.min(MAX_MOD_TEMP_RESTRICTION_HOURS, Number(body.duration_hours) || 24)
        );
        const expiresAt = new Date(Date.now() + durationHours * 3600 * 1000).toISOString();
        const nextHidden = body.hidden_from_discovery === true;
        const nextBookingsRestr = body.bookings_restricted === true;
        const nextPagerRestr = body.pager_restricted === true;
        const nextNeedsCorr = body.needs_info_correction === true;
        const corrNote =
          typeof body.correction_note === 'string' && body.correction_note.trim()
            ? body.correction_note.trim().slice(0, 500)
            : null;

        const { rows: u } = await tx.query(
          `UPDATE vendors
           SET hidden_from_discovery = $2,
               bookings_restricted = $3,
               pager_restricted = $4,
               needs_info_correction = $5,
               correction_note = $6,
               restriction_reason = $7,
               restricted_by = $8,
               restriction_authority = 'mod',
               restricted_at = now(),
               temp_restriction_expires_at = $9,
               updated_at = now()
           WHERE id = $1
           RETURNING *`,
          [
            vendorId,
            nextHidden,
            nextBookingsRestr,
            nextPagerRestr,
            nextNeedsCorr,
            corrNote,
            reason,
            ctx.user.id,
            nextHidden || nextBookingsRestr || nextPagerRestr ? expiresAt : null
          ]
        );

        await tx.query(
          `INSERT INTO vendor_status_history (vendor_id, actor_id, actor_role, action, reason, before_state, after_state)
           VALUES ($1, $2, 'mod', 'vendor.mod_temp_restriction', $3, $4::jsonb, $5::jsonb)`,
          [
            vendorId,
            ctx.user.id,
            reason,
            JSON.stringify(beforeSnap),
            JSON.stringify({
              hidden_from_discovery: nextHidden,
              bookings_restricted: nextBookingsRestr,
              pager_restricted: nextPagerRestr,
              needs_info_correction: nextNeedsCorr,
              temp_restriction_expires_at: expiresAt
            })
          ]
        );

        await recordAuditLog(tx, {
          actorId: ctx.user.id,
          actorRole: 'mod',
          vendorId,
          targetType: 'vendor',
          targetId: vendorId,
          action: 'vendor.mod_temp_restriction',
          metadata: { duration_hours: durationHours }
        });

        return { status: 200, body: { vendor: u[0] } };
      }

      // Admin: Top comprehensive governance & profile update (supports flat or nested profile/eligibility/restrictions)
      const profObj = body.profile && typeof body.profile === 'object' ? body.profile : {};
      const eligObj = body.eligibility && typeof body.eligibility === 'object' ? body.eligibility : {};
      const restrObj = body.restrictions && typeof body.restrictions === 'object' ? body.restrictions : {};
      const clearAll = restrObj.clear_restrictions === true || body.clear_restrictions === true;

      const pickBool = (a, b, fallback) => (typeof a === 'boolean' ? a : typeof b === 'boolean' ? b : fallback);

      const nextIsActive = pickBool(body.is_active, eligObj.is_active, cur.is_active);
      const nextBookable = pickBool(
        body.event_bookable,
        eligObj.booking_enabled ?? eligObj.event_bookable,
        cur.event_bookable
      );
      const nextVerified = pickBool(body.verified, eligObj.verified_status ?? eligObj.verified, cur.verified);
      const nextPhotoRights = pickBool(
        body.photo_rights_verified,
        eligObj.photo_rights_confirmed ?? eligObj.photo_rights_verified,
        cur.photo_rights_verified
      );
      const nextHidden = clearAll ? false : pickBool(body.hidden_from_discovery, restrObj.hidden_from_discovery, cur.hidden_from_discovery);
      const nextBookingsRestr = clearAll ? false : pickBool(body.bookings_restricted, restrObj.bookings_restricted, cur.bookings_restricted);
      const nextAccessSusp = clearAll ? false : pickBool(body.vendor_access_suspended, restrObj.vendor_access_suspended, cur.vendor_access_suspended);
      const nextPagerRestr = clearAll ? false : pickBool(body.pager_restricted, restrObj.pager_restricted, cur.pager_restricted);
      const nextNeedsCorr = clearAll ? false : pickBool(body.needs_info_correction, restrObj.needs_info_correction, cur.needs_info_correction);
      const rawCorrIn = body.correction_note !== undefined ? body.correction_note : restrObj.correction_note;
      const corrNote = clearAll
        ? null
        : rawCorrIn !== undefined
          ? rawCorrIn
            ? String(rawCorrIn).trim().slice(0, 500)
            : null
          : cur.correction_note;

      const anyRestriction =
        !nextIsActive || nextHidden || nextBookingsRestr || nextAccessSusp || nextPagerRestr || nextNeedsCorr;

      const { rows: u } = await tx.query(
        `UPDATE vendors
         SET is_active = $2,
             event_bookable = $3,
             verified = $4,
             verification_status = CASE WHEN $4 = true THEN 'business_confirmed' ELSE 'needs_review' END,
             photo_rights_verified = $5,
             hidden_from_discovery = $6,
             bookings_restricted = $7,
             vendor_access_suspended = $8,
             pager_restricted = $9,
             needs_info_correction = $10,
             correction_note = $11,
             restriction_reason = CASE WHEN $12 = true THEN $13 ELSE NULL END,
             restricted_by = CASE WHEN $12 = true THEN $14 ELSE NULL END,
             restriction_authority = CASE WHEN $12 = true THEN 'top' ELSE NULL END,
             restricted_at = CASE WHEN $12 = true THEN now() ELSE NULL END,
             temp_restriction_expires_at = NULL,
             updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [
          vendorId,
          nextIsActive,
          nextBookable,
          nextVerified,
          nextPhotoRights,
          nextHidden,
          nextBookingsRestr,
          nextAccessSusp,
          nextPagerRestr,
          nextNeedsCorr,
          corrNote,
          anyRestriction,
          reason,
          ctx.user.id
        ]
      );

      const inDispName = body.display_name ?? profObj.display_name;
      const inDesc = body.description ?? profObj.summary ?? profObj.description;
      const inCuisine = body.cuisine ?? profObj.cuisine;
      const inAccepting = eligObj.accepting_bookings;
      if (inDispName !== undefined || inDesc !== undefined || inCuisine !== undefined || typeof inAccepting === 'boolean') {
        const dName =
          typeof inDispName === 'string' && inDispName.trim().length >= 2
            ? inDispName.trim().slice(0, 120)
            : cur.canonical_name;
        const dDesc =
          typeof inDesc === 'string' && inDesc.trim()
            ? inDesc.trim().slice(0, 500)
            : null;
        const dCuis =
          typeof inCuisine === 'string' && inCuisine.trim()
            ? inCuisine.trim().slice(0, 60)
            : cur.cuisine;
        await tx.query(
          `INSERT INTO owner_profiles (truck_id, display_name, description, cuisine, accepting_bookings, updated_at)
           VALUES ($1, $2, $3, $4, COALESCE($5::boolean, true), now())
           ON CONFLICT (truck_id) DO UPDATE
             SET display_name = EXCLUDED.display_name,
                 description = COALESCE(EXCLUDED.description, owner_profiles.description),
                 cuisine = EXCLUDED.cuisine,
                 accepting_bookings = COALESCE($5::boolean, owner_profiles.accepting_bookings),
                 updated_at = now()`,
          [vendorId, dName, dDesc, dCuis, typeof inAccepting === 'boolean' ? inAccepting : null]
        );
      }

      // Notify vendor owners via test-safe outbox when restrictions change
      const { rows: owners } = await tx.query(
        `SELECT vm.user_id, au.email_normalized
         FROM vendor_memberships vm
         LEFT JOIN auth_users au ON au.id = vm.user_id
         WHERE vm.vendor_id = $1 AND vm.role = 'owner'`,
        [vendorId]
      );
      for (const o of owners) {
        await recordTestSafeNotificationInTx(tx, {
          recipientUserId: o.user_id,
          recipientEmail: o.email_normalized,
          eventKind: 'vendor.governance_updated',
          subject: `BiteShark Listing Status Updated (${cur.canonical_name})`,
          summary: reason
        });
      }

      const afterSnap = {
        is_active: u[0].is_active,
        event_bookable: u[0].event_bookable,
        verified: u[0].verified,
        photo_rights_verified: u[0].photo_rights_verified,
        hidden_from_discovery: u[0].hidden_from_discovery,
        bookings_restricted: u[0].bookings_restricted,
        vendor_access_suspended: u[0].vendor_access_suspended,
        pager_restricted: u[0].pager_restricted,
        needs_info_correction: u[0].needs_info_correction
      };

      await tx.query(
        `INSERT INTO vendor_status_history (vendor_id, actor_id, actor_role, action, reason, before_state, after_state)
         VALUES ($1, $2, 'top', $3, $4, $5::jsonb, $6::jsonb)`,
        [vendorId, ctx.user.id, action || 'vendor.admin_update', reason, JSON.stringify(beforeSnap), JSON.stringify(afterSnap)]
      );

      await recordAuditLog(tx, {
        actorId: ctx.user.id,
        actorRole: 'top',
        vendorId,
        targetType: 'vendor',
        targetId: vendorId,
        action: action || 'vendor.admin_update',
        metadata: afterSnap
      });

      return { status: 200, body: { vendor: u[0] } };
    });

    return sendJson(outcome.status, outcome.body);
  }

  // -------------------------------------------------------------------------
  // 6E. Accounts, Role Management & Privileged Invitations (`/api/admin/accounts*`, `/api/admin/invitations*`)
  // -------------------------------------------------------------------------
  if (normPath === '/api/admin/accounts') {
    if (method !== 'GET') return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'GET' });
    const { page, pageSize, offset } = parseBoundedPagination(query, 20, 50);
    const roleFilter = typeof query.role === 'string' ? query.role.trim() : '';
    const statusFilter = typeof query.status === 'string' ? query.status.trim() : '';
    const qText = typeof query.q === 'string' && query.q.trim() ? `%${query.q.trim().slice(0, 80)}%` : null;

    const out = await withTransaction(dbAdapter, async tx => {
      const verified = await reverifyModeratorInTx(tx, ctx);
      if (!verified.ok) return { denied: verified };
      await enableAdminTxGuards(tx, ctx);

      const conds = ['1=1'];
      const params = [];
      if (roleFilter === 'top') conds.push("pr.role IN ('top', 'platform_admin')");
      else if (roleFilter === 'mod') conds.push("pr.role IN ('mod', 'moderator')");
      else if (roleFilter === 'vendor' || roleFilter === 'vendor_owner' || roleFilter === 'vendor_staff') {
        if (roleFilter === 'vendor') {
          conds.push('EXISTS (SELECT 1 FROM vendor_memberships vm WHERE vm.user_id = au.id)');
        } else {
          const mRole = roleFilter === 'vendor_owner' ? 'owner' : 'staff';
          params.push(mRole);
          conds.push(`EXISTS (SELECT 1 FROM vendor_memberships vm WHERE vm.user_id = au.id AND vm.role = $${params.length})`);
        }
      } else if (roleFilter === 'suspended') {
        conds.push('au.disabled_at IS NOT NULL');
      }
      if (statusFilter === 'suspended') conds.push('au.disabled_at IS NOT NULL');
      else if (statusFilter === 'active') conds.push('au.disabled_at IS NULL');

      if (qText) {
        params.push(qText);
        conds.push(`(au.email_normalized ILIKE $${params.length} OR au.id ILIKE $${params.length})`);
      }

      const whereSql = conds.join(' AND ');
      const totalRes = await tx.query(
        `SELECT count(*)::int AS total
         FROM auth_users au
         LEFT JOIN platform_roles pr ON pr.user_id = au.id
         WHERE ${whereSql}`,
        params
      );

      params.push(pageSize, offset);
      // Strictly project ONLY safe identity & role fields — NEVER secrets, hashes, tokens, or IP digests
      const { rows } = await tx.query(
        `SELECT
           au.id,
           au.email_normalized,
           au.disabled_at IS NOT NULL AS is_disabled,
           au.disabled_at,
           au.last_login_at,
           au.created_at,
           pr.role AS raw_platform_role,
           COALESCE(
             (
               SELECT json_agg(json_build_object('vendor_id', vm.vendor_id, 'role', vm.role))
               FROM vendor_memberships vm
               WHERE vm.user_id = au.id
             ),
             '[]'::json
           ) AS vendor_memberships
         FROM auth_users au
         LEFT JOIN platform_roles pr ON pr.user_id = au.id
         WHERE ${whereSql}
         ORDER BY
           CASE WHEN pr.role IN ('top', 'platform_admin') THEN 0 WHEN pr.role IN ('mod', 'moderator') THEN 1 ELSE 2 END ASC,
           au.created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );

      return {
        page,
        page_size: pageSize,
        total: totalRes.rows[0]?.total || 0,
        can_manage_roles: verified.actorRole === 'top',
        accounts: rows.map(r => {
          const lvl = normalizeAdminLevel(r.raw_platform_role);
          const labels = [ROLE_LABELS.customer];
          if (Array.isArray(r.vendor_memberships)) {
            if (r.vendor_memberships.some(m => m.role === 'owner')) labels.push(ROLE_LABELS.owner);
            if (r.vendor_memberships.some(m => m.role === 'staff')) labels.push(ROLE_LABELS.staff);
          }
          if (lvl === 'mod') labels.push(ROLE_LABELS.mod);
          if (lvl === 'top') labels.push(ROLE_LABELS.top);
          return {
            id: r.id,
            // Mods see masked customer emails unless viewing admin/vendor members or exact lookup; Top sees full email
            email: verified.actorRole === 'top' || lvl || (r.vendor_memberships || []).length > 0
              ? r.email_normalized
              : maskEmail(r.email_normalized),
            account_status: r.is_disabled ? 'suspended' : 'active',
            is_disabled: r.is_disabled,
            disabled_at: r.disabled_at,
            last_login_at: r.last_login_at,
            created_at: r.created_at,
            updated_at: r.created_at,
            admin_level: lvl,
            admin_label: lvl ? ROLE_LABELS[lvl] : null,
            platform_role: lvl,
            platform_role_label: lvl ? ROLE_LABELS[lvl] : null,
            role_labels: labels,
            vendor_memberships: r.vendor_memberships
          };
        })
      };
    });
    if (out.denied) return sendJson(out.denied.status, { error: out.denied.error });
    return sendJson(200, out);
  }

  if (normPath === '/api/admin/accounts/role') {
    if (method !== 'POST') return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'POST' });
    const targetUserId = typeof body.user_id === 'string' ? body.user_id.trim() : '';
    const nextRole = typeof body.role === 'string' ? body.role.trim().toLowerCase() : '';
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    const expectedRole = body.expected_role !== undefined ? (body.expected_role ? String(body.expected_role).toLowerCase() : null) : undefined;

    if (!targetUserId || !['none', 'mod', 'top'].includes(nextRole) || reason.length < 4 || reason.length > 500) {
      return sendJson(400, { error: 'Valid user_id, role ("none" | "mod" | "top"), and reason (4–500 chars) are required.' });
    }

    const outcome = await withTransaction(dbAdapter, async tx => {
      // Serialize concurrent platform-role mutations before acquiring `FOR SHARE` on `platform_roles`
      // so `FOR UPDATE OF pr` below can never deadlock (`40P01`) across concurrent Top admins.
      await tx.query("SELECT pg_advisory_xact_lock(hashtext('biteshark_platform_roles_mutation'))");
      const verifiedTop = await reverifyPlatformAdminInTx(tx, ctx);
      if (!verifiedTop.ok) return { status: verifiedTop.status, body: { error: verifiedTop.error } };
      await enableAdminTxGuards(tx, ctx);

      if (targetUserId === ctx.user.id) {
        return {
          status: 403,
          body: { error: 'Administrators cannot modify their own platform role.', code: 'SELF_ROLE_CHANGE_FORBIDDEN' }
        };
      }

      const { rows: userRows } = await tx.query('SELECT id, email_normalized, disabled_at FROM auth_users WHERE id = $1 FOR UPDATE', [
        targetUserId
      ]);
      if (!userRows.length) return { status: 404, body: { error: 'Target account not found.' } };

      // Lock `platform_roles` and inspect joined active, age-eligible `auth_users` rows so orphaned,
      // suspended, or unassessed rows never satisfy last-Top protection.
      const { rows: allRoleRows } = await tx.query(
        `SELECT pr.user_id, pr.role, au.id AS auth_user_id, au.disabled_at, au.age_eligibility_status
         FROM platform_roles pr
         LEFT JOIN auth_users au ON au.id = pr.user_id
         FOR UPDATE OF pr`
      );
      const curRow = allRoleRows.find(r => r.user_id === targetUserId);
      const curLevel = normalizeAdminLevel(curRow?.role || null);

      if (expectedRole !== undefined && curLevel !== expectedRole) {
        return {
          status: 409,
          body: {
            error: `Account role changed concurrently (currently "${curLevel || 'none'}"). Refresh and retry.`,
            code: 'STALE_ROLE_STATE'
          }
        };
      }

      if (curLevel === 'top' && nextRole !== 'top') {
        const otherActiveEligibleTops = allRoleRows.filter(
          r =>
            r.user_id !== targetUserId &&
            Boolean(r.auth_user_id) &&
            normalizeAdminLevel(r.role) === 'top' &&
            !r.disabled_at &&
            r.age_eligibility_status === 'eligible_14_plus'
        );
        if (otherActiveEligibleTops.length < 1) {
          return {
            status: 409,
            body: {
              error: 'Cannot remove or demote the last active Admin: Top account.',
              code: 'LAST_TOP_ADMIN_PROTECTED'
            }
          };
        }
      }

      if (nextRole === 'none') {
        await tx.query('DELETE FROM platform_roles WHERE user_id = $1', [targetUserId]);
        await tx.query(
          `INSERT INTO platform_role_revocations (user_id, revoked_by, reason, revoked_at)
           VALUES ($1, $2, $3, now())
           ON CONFLICT (user_id) DO UPDATE
             SET revoked_by = EXCLUDED.revoked_by, reason = EXCLUDED.reason, revoked_at = now()`,
          [targetUserId, ctx.user.id, reason]
        );
        // Preserve assignee_user_id history on open support tickets while recording that reassignment is now required
        await tx.query(
          `INSERT INTO support_issue_events (
             issue_id, event_type, visibility, actor_user_id, actor_role, public_actor_label, summary, metadata
           )
           SELECT id, 'unassigned', 'internal', $1::text, 'top', 'BiteShark Support · Operations Lead',
                  'Assignee administrative privileges were removed — ticket flagged for active team reassignment.',
                  jsonb_build_object('inactive_assignee_user_id', $2::text)
           FROM support_issues
           WHERE assignee_user_id = $2::text AND status NOT IN ('resolved', 'closed')`,
          [ctx.user.id, targetUserId]
        );
      } else {
        await tx.query(
          `INSERT INTO platform_roles (user_id, role, granted_by, notes, updated_at)
           VALUES ($1, $2, $3, $4, now())
           ON CONFLICT (user_id) DO UPDATE
             SET role = EXCLUDED.role, granted_by = EXCLUDED.granted_by, notes = EXCLUDED.notes, updated_at = now()`,
          [targetUserId, nextRole, ctx.user.id, reason]
        );
        if (nextRole === 'top') {
          await tx.query('DELETE FROM platform_role_revocations WHERE user_id = $1', [targetUserId]);
        } else {
          // Demoting to `mod` also suppresses any static `PLATFORM_ADMIN_IDS` env override
          await tx.query(
            `INSERT INTO platform_role_revocations (user_id, revoked_by, reason, revoked_at)
             VALUES ($1, $2, $3, now())
             ON CONFLICT (user_id) DO UPDATE
               SET revoked_by = EXCLUDED.revoked_by, reason = EXCLUDED.reason, revoked_at = now()`,
            [targetUserId, ctx.user.id, reason]
          );
        }
      }

      // Immediately revoke active sessions so role transitions take effect cleanly without stale cookie expectations
      await tx.query(
        'UPDATE auth_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
        [targetUserId]
      );

      await recordAuditLog(tx, {
        actorId: ctx.user.id,
        actorRole: 'top',
        targetType: 'platform_role',
        targetId: targetUserId,
        action: `account.role_${nextRole}`,
        metadata: { from_role: curLevel || 'none', to_role: nextRole, reason }
      });

      return {
        status: 200,
        body: {
          ok: true,
          user_id: targetUserId,
          admin_level: nextRole === 'none' ? null : nextRole,
          admin_label: nextRole === 'none' ? null : ROLE_LABELS[nextRole]
        }
      };
    }).catch(err => {
      if (String(err?.message || '').includes('LAST_TOP_ADMIN_PROTECTED')) {
        return {
          status: 409,
          body: {
            error: 'Cannot remove or demote the last active Admin: Top account.',
            code: 'LAST_TOP_ADMIN_PROTECTED'
          }
        };
      }
      if (err?.code === '40P01' || err?.code === '40001') {
        return {
          status: 409,
          body: {
            error: 'Another administrative privilege update ran concurrently. Refresh and retry.',
            code: 'CONCURRENT_PRIVILEGE_CHANGE'
          }
        };
      }
      throw err;
    });

    return sendJson(outcome.status, outcome.body);
  }

  if (normPath === '/api/admin/accounts/status') {
    if (method !== 'POST') return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'POST' });
    const targetUserId = typeof body.user_id === 'string' ? body.user_id.trim() : '';
    const rawStatusOrAction = typeof (body.action || body.account_status) === 'string' ? String(body.action || body.account_status).trim() : '';
    const action = rawStatusOrAction === 'suspended' ? 'suspend' : rawStatusOrAction === 'active' ? 'reactivate' : rawStatusOrAction;
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';

    if (!targetUserId || !['suspend', 'reactivate'].includes(action) || reason.length < 4 || reason.length > 500) {
      return sendJson(400, { error: 'Valid user_id, action ("suspend" | "reactivate"), and reason (4–500 chars) are required.' });
    }

    const outcome = await withTransaction(dbAdapter, async tx => {
      await tx.query("SELECT pg_advisory_xact_lock(hashtext('biteshark_platform_roles_mutation'))");
      const verifiedTop = await reverifyPlatformAdminInTx(tx, ctx);
      if (!verifiedTop.ok) return { status: verifiedTop.status, body: { error: verifiedTop.error } };
      await enableAdminTxGuards(tx, ctx);

      if (targetUserId === ctx.user.id) {
        return { status: 403, body: { error: 'Administrators cannot suspend their own account.' } };
      }

      const { rows: targetRows } = await tx.query('SELECT id, disabled_at FROM auth_users WHERE id = $1 FOR UPDATE', [
        targetUserId
      ]);
      if (!targetRows.length) return { status: 404, body: { error: 'Account not found.' } };

      if (action === 'suspend') {
        const { rows: allTops } = await tx.query(
          `SELECT pr.user_id, au.disabled_at, au.age_eligibility_status
           FROM platform_roles pr
           JOIN auth_users au ON au.id = pr.user_id
           WHERE pr.role IN ('top', 'platform_admin')
           FOR UPDATE OF pr, au`
        );
        const targetIsTop = allTops.some(r => r.user_id === targetUserId);
        if (targetIsTop) {
          const remainingActiveTops = allTops.filter(
            r => r.user_id !== targetUserId && !r.disabled_at && r.age_eligibility_status === 'eligible_14_plus'
          );
          if (remainingActiveTops.length < 1) {
            return {
              status: 409,
              body: {
                error: 'Cannot suspend the last active Admin: Top account.',
                code: 'LAST_TOP_ADMIN_PROTECTED'
              }
            };
          }
        }

        await tx.query('UPDATE auth_users SET disabled_at = now(), updated_at = now() WHERE id = $1', [targetUserId]);
        await tx.query('UPDATE auth_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [
          targetUserId
        ]);
        await tx.query(
          `INSERT INTO support_issue_events (
             issue_id, event_type, visibility, actor_user_id, actor_role, public_actor_label, summary, metadata
           )
           SELECT id, 'unassigned', 'internal', $1::text, 'top', 'BiteShark Support · Operations Lead',
                  'Assignee account was suspended — ticket flagged for active team reassignment.',
                  jsonb_build_object('suspended_assignee_user_id', $2::text)
           FROM support_issues
           WHERE assignee_user_id = $2::text AND status NOT IN ('resolved', 'closed')`,
          [ctx.user.id, targetUserId]
        );
      } else {
        await tx.query('UPDATE auth_users SET disabled_at = NULL, updated_at = now() WHERE id = $1', [targetUserId]);
      }

      await recordAuditLog(tx, {
        actorId: ctx.user.id,
        actorRole: 'top',
        targetType: 'auth_user',
        targetId: targetUserId,
        action: `account.${action}`,
        metadata: { reason }
      });

      return { status: 200, body: { ok: true, user_id: targetUserId, is_disabled: action === 'suspend' } };
    }).catch(err => {
      if (String(err?.message || '').includes('LAST_TOP_ADMIN_PROTECTED')) {
        return {
          status: 409,
          body: {
            error: 'Cannot suspend the last active Admin: Top account.',
            code: 'LAST_TOP_ADMIN_PROTECTED'
          }
        };
      }
      if (err?.code === '40P01' || err?.code === '40001') {
        return {
          status: 409,
          body: {
            error: 'Another administrative account status update ran concurrently. Refresh and retry.',
            code: 'CONCURRENT_PRIVILEGE_CHANGE'
          }
        };
      }
      throw err;
    });

    return sendJson(outcome.status, outcome.body);
  }

  if (normPath === '/api/admin/invitations') {
    if (method !== 'GET') return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'GET' });
    const { page, pageSize, offset } = parseBoundedPagination(query, 20, 50);
    const statusFilter = typeof query.status === 'string' ? query.status.trim() : '';
    const roleFilter = typeof (query.requested_role || query.role) === 'string' ? String(query.requested_role || query.role).trim() : '';

    const out = await withTransaction(dbAdapter, async tx => {
      const verified = await reverifyModeratorInTx(tx, ctx);
      if (!verified.ok) return { denied: verified };
      await enableAdminTxGuards(tx, ctx);

      const conds = ['1=1'];
      const params = [];
      if (statusFilter && statusFilter !== 'all') {
        if (statusFilter === 'accepted' || statusFilter === 'consumed') {
          conds.push("ai.status = 'consumed'");
        } else if (statusFilter === 'expired') {
          conds.push("(ai.status = 'expired' OR (ai.status = 'issued' AND ai.expires_at IS NOT NULL AND ai.expires_at <= now()))");
        } else if (statusFilter === 'issued') {
          conds.push("(ai.status = 'issued' AND (ai.expires_at IS NULL OR ai.expires_at > now()))");
        } else if (statusFilter === 'delivery_failed') {
          conds.push("ai.delivery_status IN ('delivery_failed', 'delivery_uncertain')");
        } else {
          params.push(statusFilter);
          conds.push(`ai.status = $${params.length}`);
        }
      }
      if (roleFilter && roleFilter !== 'all') {
        params.push(roleFilter);
        conds.push(`ai.requested_role = $${params.length}`);
      }

      const whereSql = conds.join(' AND ');
      const totalRes = await tx.query(`SELECT count(*)::int AS total FROM account_invitations ai WHERE ${whereSql}`, params);
      params.push(pageSize, offset);
      const { rows } = await tx.query(
        `SELECT
           ai.*,
           v.canonical_name AS vendor_name
         FROM account_invitations ai
         LEFT JOIN vendors v ON v.id = ai.vendor_id
         WHERE ${whereSql}
         ORDER BY
           CASE
             WHEN ai.status = 'pending_top_approval' THEN 0
             WHEN ai.status = 'issued' AND ai.delivery_status IN ('delivery_failed', 'delivery_uncertain') THEN 1
             WHEN ai.status = 'issued' THEN 2
             ELSE 3
           END ASC,
           ai.created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );
      const eventsByInv = await loadInvitationEventsMapInTx(
        tx,
        rows.map(r => r.id)
      );
      return {
        page,
        page_size: pageSize,
        total: totalRes.rows[0]?.total || 0,
        email_delivery: getPublicAuthDeliveryModeSummary(),
        invitations: rows.map(r => formatInvitationRowForAdmin(r, { events: eventsByInv.get(r.id) || [] }))
      };
    });
    if (out.denied) return sendJson(out.denied.status, { error: out.denied.error });
    return sendJson(200, out);
  }

  if (normPath === '/api/admin/invitations/create') {
    if (method !== 'POST') return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'POST' });
    const emailNorm = normalizeEmailStrict(body.email);
    const requestedRole = typeof body.requested_role === 'string' ? body.requested_role.trim() : '';
    const vendorId = typeof body.vendor_id === 'string' && body.vendor_id.trim() ? body.vendor_id.trim() : null;
    const inviteNote = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 500) : null;
    const idem = normalizeOptionalIdempotencyKey(body.idempotency_key);

    if (!idem.ok) return sendJson(400, { error: idem.error });
    if (!emailNorm || !['customer', 'vendor_owner', 'vendor_staff', 'mod', 'top'].includes(requestedRole)) {
      return sendJson(400, {
        error: 'Valid email and requested_role ("customer" | "vendor_owner" | "vendor_staff" | "mod" | "top") are required.'
      });
    }
    if (requestedRole === 'vendor_staff' && !vendorId) {
      return sendJson(400, { error: 'vendor_id is required when inviting Vendor Staff.' });
    }
    const releaseSha = getRuntimeReleaseSha();
    const correlationId = createAuthCorrelationId();

    const outcome = await withTransaction(dbAdapter, async tx => {
      const verified = await reverifyModeratorInTx(tx, ctx);
      if (!verified.ok) return { status: verified.status, body: { error: verified.error } };
      await enableAdminTxGuards(tx, ctx);

      const rl = await consumeGovernanceRateLimit(tx, {
        scope: 'admin_invite_create',
        subjectKey: ctx.user.id,
        maxHits: 25,
        windowSeconds: 3600
      });
      if (!rl.allowed) return { status: 429, body: { error: 'Invitation rate limit reached.' } };

      const actorEmailNorm = normalizeEmailStrict(ctx.user.email || '');
      if (actorEmailNorm && actorEmailNorm === emailNorm && ['mod', 'top'].includes(requestedRole)) {
        return {
          status: 403,
          body: { error: 'Administrators cannot invite their own email address to a privileged role.', code: 'SELF_ELEVATION_FORBIDDEN' }
        };
      }

      const suspCheck = await tx.query('SELECT id, disabled_at FROM auth_users WHERE email_normalized = $1 LIMIT 1', [emailNorm]);
      if (suspCheck.rows[0]?.disabled_at) {
        return {
          status: 409,
          body: {
            error: 'This email address belongs to a suspended BiteShark account. Reactivate the account before issuing a new invitation.',
            code: 'RECIPIENT_ACCOUNT_SUSPENDED'
          }
        };
      }

      let vendorName = null;
      if (vendorId) {
        const vr = await tx.query('SELECT id, canonical_name FROM vendors WHERE id = $1', [vendorId]);
        if (!vr.rows.length) return { status: 400, body: { error: 'Selected vendor_id was not found.' } };
        vendorName = vr.rows[0].canonical_name || null;
      }

      const initiatorRole = verified.actorRole; // 'mod' | 'top'
      const requiresTopApproval = initiatorRole === 'mod' && (requestedRole === 'mod' || requestedRole === 'top');

      let rawToken = null;
      let tokenSha256 = null;
      let expiresAt = null;
      let initialStatus = 'pending_top_approval';
      let initialDeliveryStatus = 'pending_approval';
      let approvedBy = null;

      if (!requiresTopApproval) {
        const generated = generateOpaqueToken(32);
        rawToken = generated.rawToken;
        tokenSha256 = generated.tokenSha256;
        expiresAt = new Date(Date.now() + INVITATION_TTL_MS).toISOString();
        initialStatus = 'issued';
        initialDeliveryStatus = 'queued';
        if (initiatorRole === 'top') approvedBy = ctx.user.id;
      }

      const { rows } = await tx.query(
        `INSERT INTO account_invitations (
           email_normalized, requested_role, vendor_id, status, delivery_status,
           token_sha256, token_version, initiated_by, initiator_role, approved_by, approved_at,
           idempotency_key, invite_note, last_correlation_id, expires_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, 1, $7, $8, $9,
                 CASE WHEN $9::text IS NOT NULL THEN now() ELSE NULL END,
                 $10, $11, $12, $13)
         ON CONFLICT (initiated_by, idempotency_key) WHERE idempotency_key IS NOT NULL
         DO NOTHING
         RETURNING *`,
        [
          emailNorm,
          requestedRole,
          vendorId,
          initialStatus,
          initialDeliveryStatus,
          tokenSha256,
          ctx.user.id,
          initiatorRole,
          approvedBy,
          idem.value,
          inviteNote,
          correlationId,
          expiresAt
        ]
      );

      if (!rows.length && idem.value) {
        const prev = await tx.query(
          `SELECT ai.*, v.canonical_name AS vendor_name
           FROM account_invitations ai
           LEFT JOIN vendors v ON v.id = ai.vendor_id
           WHERE ai.initiated_by = $1 AND ai.idempotency_key = $2`,
          [ctx.user.id, idem.value]
        );
        const evMap = prev.rows[0] ? await loadInvitationEventsMapInTx(tx, [prev.rows[0].id]) : new Map();
        return {
          status: 200,
          body: {
            invitation: prev.rows[0]
              ? formatInvitationRowForAdmin(prev.rows[0], { events: evMap.get(prev.rows[0].id) || [] })
              : null,
            idempotent_replay: true
          }
        };
      }

      const createdInv = rows[0];

      // Supersede earlier unaccepted invitations for the exact same (email, role, vendor) when authorized
      if (initialStatus === 'issued') {
        const { rows: priorActive } = await tx.query(
          `SELECT id
           FROM account_invitations
           WHERE email_normalized = $1
             AND requested_role = $2
             AND COALESCE(vendor_id, '') = COALESCE($3, '')
             AND id <> $4
             AND status IN ('pending_top_approval', 'issued')
             AND ($5 = 'top' OR initiated_by = $6)
           FOR UPDATE`,
          [emailNorm, requestedRole, vendorId || '', createdInv.id, initiatorRole, ctx.user.id]
        );
        for (const prior of priorActive) {
          await tx.query(
            `UPDATE account_invitations
             SET status = 'revoked',
                 delivery_status = 'superseded',
                 revoked_by = $2,
                 revoked_at = now(),
                 revoke_reason = 'Superseded by newer invitation',
                 replaced_by_invitation_id = $3,
                 updated_at = now()
             WHERE id = $1`,
            [prior.id, ctx.user.id, createdInv.id]
          );
          await recordInvitationEventInTx(tx, {
            invitationId: prior.id,
            eventType: 'superseded',
            actorId: ctx.user.id,
            actorRole: initiatorRole,
            correlationId,
            releaseSha,
            note: `Superseded by invitation ${createdInv.id}`
          });
        }
      }

      await recordInvitationEventInTx(tx, {
        invitationId: createdInv.id,
        eventType: 'created',
        actorId: ctx.user.id,
        actorRole: initiatorRole,
        correlationId,
        releaseSha,
        note: inviteNote
      });
      await recordInvitationEventInTx(tx, {
        invitationId: createdInv.id,
        eventType: requiresTopApproval ? 'pending_approval' : 'delivery_queued',
        actorId: ctx.user.id,
        actorRole: initiatorRole,
        correlationId,
        releaseSha
      });

      await recordAuditLog(tx, {
        actorId: ctx.user.id,
        actorRole: initiatorRole,
        vendorId,
        targetType: 'account_invitation',
        targetId: createdInv.id,
        action: requiresTopApproval ? 'invitation.initiate_pending_top' : 'invitation.issue',
        metadata: { requested_role: requestedRole, status: initialStatus, correlation_id: correlationId }
      });

      if (requiresTopApproval) {
        const evMap = await loadInvitationEventsMapInTx(tx, [createdInv.id]);
        return {
          status: 201,
          body: {
            invitation: formatInvitationRowForAdmin(
              { ...createdInv, vendor_name: vendorName },
              { events: evMap.get(createdInv.id) || [] }
            ),
            pending_top_approval: true,
            requires_top_approval: true
          }
        };
      }

      return {
        status: 201,
        pendingDispatch: {
          invitationId: createdInv.id,
          tokenVersion: 1,
          rawToken,
          recipientEmail: emailNorm,
          requestedRole,
          vendorId,
          vendorName,
          expiresAt,
          actorId: ctx.user.id,
          actorRole: initiatorRole,
          correlationId
        }
      };
    });

    if (!outcome.pendingDispatch) {
      return sendJson(outcome.status, outcome.body);
    }

    const dispatched = await deliverAndFinalizeIssuedInvitation({
      dbAdapter,
      ctx,
      ...outcome.pendingDispatch,
      flow: 'invite_send'
    });

    return sendJson(201, {
      invitation: dispatched.invitation,
      delivery: dispatched.delivery,
      pending_top_approval: false,
      requires_top_approval: false,
      ...(dispatched.exposeTestAcceptPath ? { accept_path: dispatched.exposeTestAcceptPath } : {})
    });
  }

  if (normPath === '/api/admin/invitations/decision' || normPath === '/api/admin/invitations/resend') {
    if (method !== 'POST') return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'POST' });
    const invId = typeof body.invitation_id === 'string' ? body.invitation_id.trim() : '';
    const action =
      normPath === '/api/admin/invitations/resend'
        ? 'resend'
        : typeof body.action === 'string'
          ? body.action.trim()
          : '';
    const rawReason = typeof body.reason === 'string' ? body.reason.trim() : '';
    const reason =
      action === 'resend' && !rawReason ? 'Operator requested invitation resend' : rawReason;

    if (!UUID_RE.test(invId) || !['approve', 'reject', 'revoke', 'resend'].includes(action)) {
      return sendJson(400, {
        error: 'Valid invitation_id and action ("approve" | "reject" | "revoke" | "resend") are required.'
      });
    }
    if (reason.length < 3 || reason.length > 500) {
      return sendJson(400, { error: 'Reason (3–500 characters) is required.' });
    }
    const releaseSha = getRuntimeReleaseSha();
    const correlationId = createAuthCorrelationId();

    const outcome = await withTransaction(dbAdapter, async tx => {
      const verified = await reverifyModeratorInTx(tx, ctx);
      if (!verified.ok) return { status: verified.status, body: { error: verified.error } };
      await enableAdminTxGuards(tx, ctx);

      const isTop = verified.actorRole === 'top';
      if ((action === 'approve' || action === 'reject') && !isTop) {
        return {
          status: 403,
          body: { error: 'Only Admin: Top can approve or reject privileged invitations.', code: 'TOP_APPROVAL_REQUIRED' }
        };
      }

      const rl = await consumeGovernanceRateLimit(tx, {
        scope: `admin_invite_${action}`,
        subjectKey: ctx.user.id,
        maxHits: 30,
        windowSeconds: 3600
      });
      if (!rl.allowed) return { status: 429, body: { error: 'Too many invitation actions recently. Please wait.' } };

      const { rows } = await tx.query(
        `SELECT ai.*, v.canonical_name AS vendor_name
         FROM account_invitations ai
         LEFT JOIN vendors v ON v.id = ai.vendor_id
         WHERE ai.id = $1
         FOR UPDATE OF ai`,
        [invId]
      );
      if (!rows.length) return { status: 404, body: { error: 'Invitation not found.' } };
      const inv = rows[0];

      if (action === 'revoke') {
        if (!isTop && inv.initiated_by !== ctx.user.id) {
          return { status: 403, body: { error: 'Admin: Mod may revoke only invitations they initiated.' } };
        }
        if (!['pending_top_approval', 'issued'].includes(inv.status)) {
          return { status: 409, body: { error: `Invitation is already "${inv.status}".` } };
        }
        await tx.query(
          `UPDATE account_invitations
           SET status = 'revoked',
               revoked_by = $2,
               revoked_at = now(),
               revoke_reason = $3,
               updated_at = now()
           WHERE id = $1`,
          [invId, ctx.user.id, reason]
        );
        await recordInvitationEventInTx(tx, {
          invitationId: invId,
          eventType: 'revoked',
          actorId: ctx.user.id,
          actorRole: verified.actorRole,
          correlationId,
          releaseSha,
          note: reason
        });
        await recordAuditLog(tx, {
          actorId: ctx.user.id,
          actorRole: verified.actorRole,
          targetType: 'account_invitation',
          targetId: invId,
          action: 'invitation.revoke',
          metadata: { reason, correlation_id: correlationId }
        });
        return { status: 200, body: { ok: true, status: 'revoked' } };
      }

      if (action === 'resend') {
        const isPrivRole = inv.requested_role === 'mod' || inv.requested_role === 'top';
        if (!isTop && (isPrivRole || inv.initiated_by !== ctx.user.id)) {
          return {
            status: 403,
            body: {
              error: 'Only Admin: Top may resend privileged invitations or invitations created by another administrator.',
              code: 'TOP_ADMIN_REQUIRED'
            }
          };
        }
        // Never reactivate revoked, rejected, consumed, or unapproved invitations
        if (inv.status !== 'issued' || inv.revoked_at || inv.consumed_at) {
          return {
            status: 409,
            body: {
              error: `Cannot resend an invitation whose status is "${inv.status}". Create a new invitation if appropriate.`,
              code: 'INVITATION_CANNOT_RESEND'
            }
          };
        }
        const actorEmailNorm = normalizeEmailStrict(ctx.user.email || '');
        if (actorEmailNorm && inv.email_normalized === actorEmailNorm && isPrivRole) {
          return {
            status: 403,
            body: { error: 'Administrators cannot resend a privileged invitation to their own email.', code: 'SELF_ELEVATION_FORBIDDEN' }
          };
        }

        const suspCheck = await tx.query('SELECT disabled_at FROM auth_users WHERE email_normalized = $1 LIMIT 1', [
          inv.email_normalized
        ]);
        if (suspCheck.rows[0]?.disabled_at) {
          return {
            status: 409,
            body: {
              error: 'Target account is currently suspended and cannot receive resent invitations.',
              code: 'RECIPIENT_ACCOUNT_SUSPENDED'
            }
          };
        }

        const cooldownSec = Math.max(
          0,
          Math.min(600, Number(readEnvCompat('INVITATION_RESEND_COOLDOWN_SECONDS', { defaultValue: '45' }) || 45))
        );
        if (
          cooldownSec > 0 &&
          inv.delivery_status === 'provider_accepted' &&
          inv.last_sent_at &&
          Date.now() - new Date(inv.last_sent_at).getTime() < cooldownSec * 1000
        ) {
          const waitSec = Math.max(
            1,
            Math.ceil((cooldownSec * 1000 - (Date.now() - new Date(inv.last_sent_at).getTime())) / 1000)
          );
          return {
            status: 429,
            body: {
              error: `An invitation email was just sent. Wait ${waitSec}s before resending.`,
              code: 'INVITATION_RESEND_COOLDOWN'
            }
          };
        }

        // Rotate single-use token (`token_version + 1`), invalidating any previous raw link
        const { rawToken, tokenSha256 } = generateOpaqueToken(32);
        const nextTokenVersion = Number(inv.token_version || 1) + 1;
        const expiresAt = new Date(Date.now() + INVITATION_TTL_MS).toISOString();

        await tx.query(
          `UPDATE account_invitations
           SET token_sha256 = $2,
               token_version = $3,
               delivery_status = 'queued',
               expires_at = $4,
               last_correlation_id = $5,
               updated_at = now()
           WHERE id = $1`,
          [invId, tokenSha256, nextTokenVersion, expiresAt, correlationId]
        );

        await recordInvitationEventInTx(tx, {
          invitationId: invId,
          eventType: 'resent',
          actorId: ctx.user.id,
          actorRole: verified.actorRole,
          correlationId,
          releaseSha,
          note: `${reason} (rotated to token generation #${nextTokenVersion})`
        });
        await recordInvitationEventInTx(tx, {
          invitationId: invId,
          eventType: 'delivery_queued',
          actorId: ctx.user.id,
          actorRole: verified.actorRole,
          correlationId,
          releaseSha
        });

        await recordAuditLog(tx, {
          actorId: ctx.user.id,
          actorRole: verified.actorRole,
          vendorId: inv.vendor_id || null,
          targetType: 'account_invitation',
          targetId: invId,
          action: 'invitation.resend',
          metadata: {
            requested_role: inv.requested_role,
            token_version: nextTokenVersion,
            reason,
            correlation_id: correlationId
          }
        });

        return {
          status: 200,
          pendingDispatch: {
            invitationId: invId,
            tokenVersion: nextTokenVersion,
            rawToken,
            recipientEmail: inv.email_normalized,
            requestedRole: inv.requested_role,
            vendorId: inv.vendor_id || null,
            vendorName: inv.vendor_name || null,
            expiresAt,
            actorId: ctx.user.id,
            actorRole: verified.actorRole,
            correlationId
          }
        };
      }

      if (inv.status !== 'pending_top_approval') {
        return { status: 409, body: { error: `Invitation is already "${inv.status}".` } };
      }

      const actorEmailNorm = normalizeEmailStrict(ctx.user.email || '');
      if (
        (inv.initiator_role === 'mod' && inv.initiated_by === ctx.user.id) ||
        (actorEmailNorm && inv.email_normalized === actorEmailNorm)
      ) {
        return {
          status: 403,
          body: { error: 'Administrators cannot approve their own elevation invitation.', code: 'SELF_ELEVATION_FORBIDDEN' }
        };
      }

      if (action === 'reject') {
        await tx.query(
          `UPDATE account_invitations
           SET status = 'rejected',
               delivery_status = 'not_requested',
               rejected_by = $2,
               rejected_at = now(),
               rejection_reason = $3,
               updated_at = now()
           WHERE id = $1`,
          [invId, ctx.user.id, reason]
        );
        await recordInvitationEventInTx(tx, {
          invitationId: invId,
          eventType: 'rejected',
          actorId: ctx.user.id,
          actorRole: 'top',
          correlationId,
          releaseSha,
          note: reason
        });
        await recordAuditLog(tx, {
          actorId: ctx.user.id,
          actorRole: 'top',
          targetType: 'account_invitation',
          targetId: invId,
          action: 'invitation.reject',
          metadata: { requested_role: inv.requested_role, reason, correlation_id: correlationId }
        });
        return { status: 200, body: { ok: true, status: 'rejected' } };
      }

      // action === 'approve'
      const suspCheck = await tx.query('SELECT disabled_at FROM auth_users WHERE email_normalized = $1 LIMIT 1', [
        inv.email_normalized
      ]);
      if (suspCheck.rows[0]?.disabled_at) {
        return {
          status: 409,
          body: {
            error: 'Target account is currently suspended and cannot be approved for an active invitation.',
            code: 'RECIPIENT_ACCOUNT_SUSPENDED'
          }
        };
      }

      const { rawToken, tokenSha256 } = generateOpaqueToken(32);
      const expiresAt = new Date(Date.now() + INVITATION_TTL_MS).toISOString();
      await tx.query(
        `UPDATE account_invitations
         SET status = 'issued',
             delivery_status = 'queued',
             token_sha256 = $2,
             token_version = 1,
             approved_by = $3,
             approved_at = now(),
             approval_reason = $4,
             last_correlation_id = $5,
             expires_at = $6,
             updated_at = now()
         WHERE id = $1`,
        [invId, tokenSha256, ctx.user.id, reason, correlationId, expiresAt]
      );

      await recordInvitationEventInTx(tx, {
        invitationId: invId,
        eventType: 'approved',
        actorId: ctx.user.id,
        actorRole: 'top',
        correlationId,
        releaseSha,
        note: reason
      });
      await recordInvitationEventInTx(tx, {
        invitationId: invId,
        eventType: 'delivery_queued',
        actorId: ctx.user.id,
        actorRole: 'top',
        correlationId,
        releaseSha
      });

      await recordAuditLog(tx, {
        actorId: ctx.user.id,
        actorRole: 'top',
        targetType: 'account_invitation',
        targetId: invId,
        action: 'invitation.approve',
        metadata: { requested_role: inv.requested_role, initiated_by: inv.initiated_by, reason, correlation_id: correlationId }
      });

      return {
        status: 200,
        pendingDispatch: {
          invitationId: invId,
          tokenVersion: 1,
          rawToken,
          recipientEmail: inv.email_normalized,
          requestedRole: inv.requested_role,
          vendorId: inv.vendor_id || null,
          vendorName: inv.vendor_name || null,
          expiresAt,
          actorId: ctx.user.id,
          actorRole: 'top',
          correlationId
        }
      };
    });

    if (!outcome.pendingDispatch) {
      return sendJson(outcome.status, outcome.body);
    }

    const dispatched = await deliverAndFinalizeIssuedInvitation({
      dbAdapter,
      ctx,
      ...outcome.pendingDispatch,
      flow: action === 'resend' ? 'invite_resend' : 'invite_send'
    });

    return sendJson(200, {
      ok: true,
      invitation: dispatched.invitation,
      delivery: dispatched.delivery,
      ...(dispatched.exposeTestAcceptPath ? { accept_path: dispatched.exposeTestAcceptPath } : {})
    });
  }

  // -------------------------------------------------------------------------
  // 6F. Extended Community Moderation (`/api/admin/moderation*`)
  // -------------------------------------------------------------------------
  if (normPath === '/api/admin/moderation') {
    if (method !== 'GET') return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'GET' });
    const { page, pageSize, offset } = parseBoundedPagination(query, 20, 50);
    const queue = typeof query.queue === 'string' ? query.queue.trim() : 'pending';
    const statusFilter = typeof query.status === 'string' ? query.status.trim() : '';
    const vendorFilter = typeof query.vendor_id === 'string' ? query.vendor_id.trim() : '';
    const authorFilter = typeof query.author_id === 'string' ? query.author_id.trim() : '';
    const reasonFilter = typeof query.reason_category === 'string' ? query.reason_category.trim() : '';
    const dateFrom = typeof query.date_from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(query.date_from.trim())
      ? query.date_from.trim()
      : '';
    const dateTo = typeof query.date_to === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(query.date_to.trim())
      ? query.date_to.trim()
      : '';
    const qText = typeof query.q === 'string' && query.q.trim() ? `%${query.q.trim().slice(0, 80)}%` : null;

    const out = await withTransaction(dbAdapter, async tx => {
      const verified = await reverifyModeratorInTx(tx, ctx);
      if (!verified.ok) return { denied: verified };
      await enableAdminTxGuards(tx, ctx);

      const conds = ['1=1'];
      const params = [];

      if (statusFilter && statusFilter !== 'all') {
        params.push(statusFilter);
        conds.push(`cr.status = $${params.length}`);
      } else if (queue === 'pending') {
        conds.push("cr.status = 'pending'");
      } else if (queue === 'reported') {
        conds.push(
          "(cr.report_count > 0 OR EXISTS (SELECT 1 FROM community_reports rp WHERE rp.post_id = cr.id AND rp.status = 'open'))"
        );
      } else if (queue === 'history') {
        conds.push("cr.status IN ('approved', 'rejected', 'hidden')");
      }

      if (vendorFilter) {
        params.push(vendorFilter);
        conds.push(`cr.place_id = $${params.length}`);
      }
      if (authorFilter) {
        params.push(authorFilter);
        conds.push(`cr.author_id = $${params.length}`);
      }
      if (reasonFilter) {
        params.push(reasonFilter, `%${reasonFilter.slice(0, 60)}%`);
        conds.push(
          `(EXISTS (SELECT 1 FROM community_reports rp WHERE rp.post_id = cr.id AND rp.reason_category = $${params.length - 1}) OR cr.moderation_reason ILIKE $${params.length})`
        );
      }
      if (dateFrom) {
        params.push(`${dateFrom}T00:00:00.000Z`);
        conds.push(`cr.created_at >= $${params.length}::timestamptz`);
      }
      if (dateTo) {
        params.push(`${dateTo}T23:59:59.999Z`);
        conds.push(`cr.created_at <= $${params.length}::timestamptz`);
      }
      if (qText) {
        params.push(qText);
        conds.push(`(cr.title ILIKE $${params.length} OR cr.body ILIKE $${params.length} OR cr.place_name ILIKE $${params.length})`);
      }

      const whereSql = conds.join(' AND ');
      const totalRes = await tx.query(`SELECT count(*)::int AS total FROM community_reviews cr WHERE ${whereSql}`, params);

      params.push(pageSize, offset);
      const { rows } = await tx.query(
        `SELECT
           cr.*,
           COALESCE(
             (
               SELECT json_agg(json_build_object(
                 'id', rp.id,
                 'reason_category', rp.reason_category,
                 'details', rp.details,
                 'status', rp.status,
                 'created_at', rp.created_at
               ) ORDER BY rp.created_at DESC)
               FROM community_reports rp
               WHERE rp.post_id = cr.id
             ),
             '[]'::json
           ) AS reports,
           COALESCE(
             (
               SELECT json_agg(json_build_object(
                 'action', mh.action,
                 'actor_id', mh.actor_id,
                 'actor_role', mh.actor_role,
                 'from_status', mh.from_status,
                 'to_status', mh.to_status,
                 'reason', mh.reason,
                 'created_at', mh.created_at
               ) ORDER BY mh.created_at DESC)
               FROM community_moderation_history mh
               WHERE mh.post_id = cr.id
             ),
             '[]'::json
           ) AS moderation_history
         FROM community_reviews cr
         WHERE ${whereSql}
         ORDER BY
           CASE WHEN cr.status = 'pending' THEN 0 WHEN cr.report_count > 0 THEN 1 ELSE 2 END ASC,
           COALESCE(cr.moderated_at, cr.created_at) DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );

      return {
        page,
        page_size: pageSize,
        total: totalRes.rows[0]?.total || 0,
        posts: rows
      };
    });
    if (out.denied) return sendJson(out.denied.status, { error: out.denied.error });
    return sendJson(200, out);
  }

  if (normPath === '/api/admin/moderation/decision') {
    if (method !== 'POST') return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'POST' });
    const postId = typeof body.post_id === 'string' ? body.post_id.trim() : '';
    const action = typeof body.action === 'string' ? body.action.trim() : '';
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    const internalNote =
      typeof body.internal_note === 'string' && body.internal_note.trim()
        ? body.internal_note.trim().slice(0, 1000)
        : null;

    if (!UUID_RE.test(postId) || !['approve', 'reject', 'hide', 'restore', 'dismiss_reports'].includes(action)) {
      return sendJson(400, {
        error: 'Valid post_id and action ("approve" | "reject" | "hide" | "restore" | "dismiss_reports") are required.'
      });
    }
    if (['reject', 'hide', 'restore'].includes(action) && (reason.length < 3 || reason.length > 600)) {
      return sendJson(400, { error: 'A clear moderation reason (3–600 characters) is required.' });
    }

    const outcome = await withTransaction(dbAdapter, async tx => {
      const verified = await reverifyModeratorInTx(tx, ctx);
      if (!verified.ok) return { status: verified.status, body: { error: verified.error } };
      await enableAdminTxGuards(tx, ctx);

      const { rows } = await tx.query('SELECT * FROM community_reviews WHERE id = $1 FOR UPDATE', [postId]);
      if (!rows.length) return { status: 404, body: { error: 'Community submission not found.' } };
      const post = rows[0];

      if (action === 'dismiss_reports') {
        await tx.query(
          `UPDATE community_reports
           SET status = 'dismissed', reviewed_by = $2, reviewed_at = now()
           WHERE post_id = $1 AND status = 'open'`,
          [postId, ctx.user.id]
        );
        await tx.query(
          `INSERT INTO community_moderation_history (post_id, actor_id, actor_role, action, from_status, to_status, reason, internal_note)
           VALUES ($1, $2, $3, 'dismiss_reports', $4, $4, $5, $6)`,
          [postId, ctx.user.id, verified.actorRole, post.status, reason || 'Reports reviewed and dismissed', internalNote]
        );
        await recordAuditLog(tx, {
          actorId: ctx.user.id,
          actorRole: verified.actorRole,
          vendorId: post.place_id || null,
          targetType: 'community_review',
          targetId: postId,
          action: 'community.dismiss_reports'
        });
        return { status: 200, body: { ok: true, status: post.status } };
      }

      let nextStatus = post.status;
      if (action === 'approve') {
        if (post.status !== 'pending') {
          return { status: 409, body: { error: `Post is already "${post.status}". Use "restore" if hidden/rejected.` } };
        }
        nextStatus = 'approved';
      } else if (action === 'reject') {
        if (post.status !== 'pending') {
          return { status: 409, body: { error: `Only pending posts can be rejected (use "hide" on approved posts).` } };
        }
        nextStatus = 'rejected';
      } else if (action === 'hide') {
        if (post.status !== 'approved') {
          return { status: 409, body: { error: 'Only approved public posts can be hidden.' } };
        }
        nextStatus = 'hidden';
      } else if (action === 'restore') {
        if (!['hidden', 'rejected'].includes(post.status)) {
          return { status: 409, body: { error: 'Only hidden or rejected posts can be restored.' } };
        }
        nextStatus = 'approved';
      }

      const { rows: u } = await tx.query(
        `UPDATE community_reviews
         SET status = $2,
             moderated_at = now(),
             moderated_by = $3,
             moderation_reason = COALESCE($4, moderation_reason),
             moderation_internal_note = COALESCE($5, moderation_internal_note),
             hidden_at = CASE WHEN $2 = 'hidden' THEN now() ELSE hidden_at END,
             hidden_by = CASE WHEN $2 = 'hidden' THEN $3 ELSE hidden_by END,
             restored_at = CASE WHEN $6 = 'restore' THEN now() ELSE restored_at END,
             restored_by = CASE WHEN $6 = 'restore' THEN $3 ELSE restored_by END
         WHERE id = $1
         RETURNING id, status, moderated_at, moderated_by, moderation_reason`,
        [postId, nextStatus, ctx.user.id, reason || null, internalNote, action]
      );

      await tx.query(
        `UPDATE community_reports
         SET status = 'reviewed', reviewed_by = $2, reviewed_at = now()
         WHERE post_id = $1 AND status = 'open'`,
        [postId, ctx.user.id]
      );

      await tx.query(
        `INSERT INTO community_moderation_history (post_id, actor_id, actor_role, action, from_status, to_status, reason, internal_note)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [postId, ctx.user.id, verified.actorRole, action, post.status, nextStatus, reason || null, internalNote]
      );

      await recordAuditLog(tx, {
        actorId: ctx.user.id,
        actorRole: verified.actorRole,
        vendorId: post.place_id || null,
        targetType: 'community_review',
        targetId: postId,
        action: `community.${action}`,
        metadata: { from_status: post.status, to_status: nextStatus, reason: reason || undefined }
      });

      return { status: 200, body: { post: u[0] } };
    });

    return sendJson(outcome.status, outcome.body);
  }

  // -------------------------------------------------------------------------
  // 6G. Admin Support & Feedback Queue, Assignment & Diagnostic Linking (`/api/admin/issues*`)
  // -------------------------------------------------------------------------
  if (normPath === '/api/admin/issues') {
    if (method !== 'GET') return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'GET' });
    const { page, pageSize, offset } = parseBoundedPagination(query, 20, 50);
    const queueView = typeof query.queue_view === 'string' ? query.queue_view.trim().toLowerCase() : 'all';
    const rawStatus = typeof query.status === 'string' ? query.status.trim().toLowerCase() : '';
    const statusFilter = rawStatus === 'all' || rawStatus === 'open_all' || !rawStatus ? rawStatus : normalizeSupportStatusInput(rawStatus) || rawStatus;
    const severityFilter = typeof query.severity === 'string' ? query.severity.trim().toLowerCase() : '';
    const urgencyFilter = typeof query.reporter_urgency === 'string' ? query.reporter_urgency.trim().toLowerCase() : '';
    const categoryFilter = typeof query.category === 'string' ? query.category.trim().toLowerCase() : '';
    const reporterTypeFilter = typeof query.reporter_type === 'string' ? query.reporter_type.trim().toLowerCase() : '';
    const vendorFilter = typeof query.vendor_id === 'string' ? query.vendor_id.trim() : '';
    const dateFrom = typeof query.date_from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(query.date_from.trim()) ? query.date_from.trim() : '';
    const dateTo = typeof query.date_to === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(query.date_to.trim()) ? query.date_to.trim() : '';
    const singleIssueId = typeof query.issue_id === 'string' && UUID_RE.test(query.issue_id.trim()) ? query.issue_id.trim() : '';
    const singleTicketNo =
      typeof query.ticket_number === 'string' && /^BS-[0-9]{6,10}$/i.test(query.ticket_number.trim())
        ? query.ticket_number.trim().toUpperCase()
        : '';
    const overdueOnly = query.overdue_only === '1' || query.overdue_only === 'true' || query.overdue === '1';
    const rawSearch = typeof query.q === 'string' ? query.q.trim().slice(0, 80) : '';
    const qText = rawSearch ? `%${rawSearch.replace(/[\\%_]/g, m => `\\${m}`)}%` : null;

    const out = await withTransaction(dbAdapter, async tx => {
      const verified = await reverifyModeratorInTx(tx, ctx);
      if (!verified.ok) return { denied: verified };
      await enableAdminTxGuards(tx, ctx);
      const isTop = verified.actorRole === 'top';

      // Load active authorized team roster for assignment controls
      const rosterRes = await tx.query(`
        SELECT au.id, au.email_normalized, pr.role
        FROM platform_roles pr
        JOIN auth_users au ON au.id = pr.user_id
        WHERE au.disabled_at IS NULL
          AND pr.role IN ('mod', 'moderator', 'top', 'platform_admin')
        ORDER BY CASE WHEN pr.role IN ('top', 'platform_admin') THEN 0 ELSE 1 END ASC, au.email_normalized ASC
      `);
      const staffRoster = rosterRes.rows.map(r => {
        const lvl = normalizeAdminLevel(r.role) || 'mod';
        return {
          user_id: r.id,
          admin_level: lvl,
          role_label: lvl === 'top' ? 'Admin: Top' : 'Admin: Mod',
          display_label: isTop ? `${r.email_normalized} (${lvl === 'top' ? 'Admin: Top' : 'Admin: Mod'})` : `${maskEmail(r.email_normalized)} (${lvl === 'top' ? 'Admin: Top' : 'Admin: Mod'})`
        };
      });

      const assigneeSelectExpr = `
        (
          si.assignee_user_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM platform_roles pr_a
            JOIN auth_users au_a ON au_a.id = pr_a.user_id
            WHERE pr_a.user_id = si.assignee_user_id
              AND au_a.disabled_at IS NULL
              AND pr_a.role IN ('mod', 'moderator', 'top', 'platform_admin')
          )
        ) AS assignee_inactive,
        (
          SELECT CASE WHEN pr_a.role IN ('top', 'platform_admin') THEN 'top'
                      WHEN pr_a.role IN ('mod', 'moderator') THEN 'mod'
                      ELSE NULL END
          FROM platform_roles pr_a
          JOIN auth_users au_a ON au_a.id = pr_a.user_id
          WHERE pr_a.user_id = si.assignee_user_id AND au_a.disabled_at IS NULL
          LIMIT 1
        ) AS assignee_active_role,
        (
          SELECT au_a.email_normalized
          FROM auth_users au_a
          WHERE au_a.id = si.assignee_user_id
          LIMIT 1
        ) AS assignee_raw_email
      `;

      const formatAdminIssueRow = r => {
        const assigneeDisplay = !r.assignee_user_id
          ? null
          : isTop && r.assignee_raw_email
            ? r.assignee_raw_email
            : r.assignee_raw_email
              ? maskEmail(r.assignee_raw_email)
              : r.assignee_user_id;
        return {
          ...r,
          status_label: SUPPORT_STATUS_LABELS[r.status] || r.status,
          category_label: CATEGORY_LABELS[r.category] || r.category,
          reporter_urgency_label: REPORTER_URGENCY_LABELS[r.reporter_urgency] || r.reporter_urgency,
          staff_priority_label: STAFF_PRIORITY_LABELS[r.severity] || r.severity,
          reporter_email: isTop ? r.reporter_email : maskEmail(r.reporter_email || ''),
          reporter_role: r.reporter_context,
          assigned_to: r.assignee_user_id,
          assignee_display: assigneeDisplay,
          needs_reassignment: Boolean(r.assignee_inactive && !['resolved', 'closed'].includes(r.status)),
          booking_id: r.related_booking_id,
          community_post_id: r.related_review_id
        };
      };

      if (singleIssueId || singleTicketNo) {
        const { rows: sRows } = await tx.query(
          `SELECT
             si.*,
             (si.status IN ('open', 'in_review', 'in_progress', 'waiting') AND si.sla_due_at < now()) AS is_overdue,
             ${assigneeSelectExpr}
           FROM support_issues si
           WHERE ${singleIssueId ? 'si.id = $1' : 'si.ticket_number = $1'}`,
          [singleIssueId || singleTicketNo]
        );
        if (!sRows.length) return { notFound: true };
        const target = sRows[0];

        await tx.query('UPDATE support_issues SET staff_last_read_at = now() WHERE id = $1', [target.id]);

        const { rows: sNotes } = await tx.query(
          `SELECT id, issue_id, author_user_id, author_role, author_display_label, visibility, body, created_at
           FROM support_issue_notes
           WHERE issue_id = $1
           ORDER BY created_at ASC, id ASC`,
          [target.id]
        );
        const { rows: sEvents } = await tx.query(
          `SELECT id, issue_id, event_type, visibility, actor_user_id, actor_role, public_actor_label, summary, metadata, created_at
           FROM support_issue_events
           WHERE issue_id = $1
           ORDER BY created_at ASC, id ASC`,
          [target.id]
        );
        const { rows: rawLinks } = await tx.query(
          `SELECT
             l.*,
             g.title AS diag_title,
             g.emitting_component AS diag_component,
             g.feature_key AS diag_feature_key,
             g.error_code AS diag_error_code,
             g.severity AS diag_severity,
             g.triage_status AS diag_triage_status,
             g.mod_visible AS diag_mod_visible,
             g.suspected_fix_sha AS diag_suspected_fix_sha,
             g.observed_server_releases AS diag_observed_releases,
             g.occurrence_count AS diag_occurrence_count,
             g.last_seen_at AS diag_last_seen_at
           FROM support_issue_diagnostic_links l
           LEFT JOIN diagnostic_incident_groups g ON g.id = l.diagnostic_group_id
           WHERE l.issue_id = $1 AND l.unlinked_at IS NULL
           ORDER BY CASE WHEN l.link_state = 'confirmed' THEN 0 ELSE 1 END ASC, l.created_at DESC`,
          [target.id]
        );

        // Fetch co-linked tickets on the same diagnostic incidents (ticket_number + status ONLY — zero cross-reporter PII!)
        const groupIds = rawLinks.map(l => l.diagnostic_group_id).filter(Boolean);
        const coTicketsByGroup = new Map();
        if (groupIds.length) {
          const { rows: coRows } = await tx.query(
            `SELECT
               l.diagnostic_group_id,
               si.id AS issue_id,
               si.ticket_number,
               si.status,
               si.reporter_context,
               si.reporter_urgency
             FROM support_issue_diagnostic_links l
             JOIN support_issues si ON si.id = l.issue_id
             WHERE l.diagnostic_group_id = ANY($1::uuid[])
               AND l.unlinked_at IS NULL
               AND l.issue_id <> $2
             ORDER BY si.created_at DESC
             LIMIT 40`,
            [groupIds, target.id]
          );
          for (const cr of coRows) {
            if (!coTicketsByGroup.has(cr.diagnostic_group_id)) coTicketsByGroup.set(cr.diagnostic_group_id, []);
            coTicketsByGroup.get(cr.diagnostic_group_id).push({
              issue_id: cr.issue_id,
              ticket_number: cr.ticket_number,
              status: cr.status,
              status_label: SUPPORT_STATUS_LABELS[cr.status] || cr.status,
              reporter_context: cr.reporter_context,
              reporter_urgency: cr.reporter_urgency
            });
          }
        }

        const diagnosticLinks = rawLinks.map(l => {
          const restrictedForMod = !isTop && l.diag_mod_visible === false;
          return {
            id: l.id,
            issue_id: l.issue_id,
            diagnostic_group_id: restrictedForMod ? null : l.diagnostic_group_id,
            link_state: l.link_state,
            linked_by: l.linked_by,
            linked_by_role: l.linked_by_role,
            link_reason: restrictedForMod ? 'Linked by Admin: Top (restricted security/provider scope).' : l.link_reason,
            public_summary: l.public_summary,
            fixing_release_sha: l.fixing_release_sha,
            verification_status: l.verification_status,
            verification_note: restrictedForMod ? null : l.verification_note,
            created_at: l.created_at,
            updated_at: l.updated_at,
            restricted_scope: restrictedForMod,
            incident: restrictedForMod
              ? {
                  restricted: true,
                  title: 'Restricted Top-Admin Diagnostic Incident',
                  triage_status: l.diag_triage_status || 'investigating'
                }
              : {
                  id: l.diagnostic_group_id,
                  title: l.diag_title || 'Archived diagnostic incident',
                  emitting_component: l.diag_component,
                  feature_key: l.diag_feature_key,
                  error_code: l.diag_error_code,
                  severity: l.diag_severity,
                  triage_status: l.diag_triage_status,
                  suspected_fix_sha: l.diag_suspected_fix_sha,
                  observed_server_releases: l.diag_observed_releases || [],
                  occurrence_count: Number(l.diag_occurrence_count || 1),
                  last_seen_at: l.diag_last_seen_at
                },
            other_linked_tickets: restrictedForMod ? [] : coTicketsByGroup.get(l.diagnostic_group_id) || []
          };
        });

        const formatted = formatAdminIssueRow(target);
        delete formatted.assignee_raw_email;

        return {
          issue: formatted,
          notes: sNotes,
          events: sEvents,
          diagnostic_links: diagnosticLinks,
          staff_roster: staffRoster,
          permissions: {
            actor_role: verified.actorRole,
            can_reopen_closed: isTop,
            can_record_fix_sha: isTop,
            can_clear_escalation: isTop
          },
          repository_commit_base_url: REPOSITORY_COMMIT_BASE_URL
        };
      }

      // Queue summary counts
      const queueSummaryRes = await tx.query(
        `SELECT
           count(*) FILTER (WHERE status NOT IN ('resolved', 'closed'))::int AS active_total,
           count(*) FILTER (WHERE status NOT IN ('resolved', 'closed') AND assignee_user_id IS NULL)::int AS unassigned_count,
           count(*) FILTER (WHERE status NOT IN ('resolved', 'closed') AND assignee_user_id = $1)::int AS assigned_to_me_count,
           count(*) FILTER (WHERE status NOT IN ('resolved', 'closed') AND waiting_for_team = true)::int AS waiting_for_team_count,
           count(*) FILTER (WHERE status NOT IN ('resolved', 'closed') AND escalated_to_top = true)::int AS escalated_count,
           count(*) FILTER (
             WHERE status NOT IN ('resolved', 'closed')
               AND assignee_user_id IS NOT NULL
               AND NOT EXISTS (
                 SELECT 1 FROM platform_roles pr_s
                 JOIN auth_users au_s ON au_s.id = pr_s.user_id
                 WHERE pr_s.user_id = support_issues.assignee_user_id
                   AND au_s.disabled_at IS NULL
                   AND pr_s.role IN ('mod', 'moderator', 'top', 'platform_admin')
               )
           )::int AS needs_reassignment_count
         FROM support_issues`,
        [ctx.user.id]
      );

      const conds = ['1=1'];
      const params = [];

      if (queueView === 'unassigned') {
        conds.push("si.status NOT IN ('resolved', 'closed') AND si.assignee_user_id IS NULL");
      } else if (queueView === 'assigned_to_me') {
        params.push(ctx.user.id);
        conds.push(`si.status NOT IN ('resolved', 'closed') AND si.assignee_user_id = $${params.length}`);
      } else if (queueView === 'waiting_for_team') {
        conds.push("si.status NOT IN ('resolved', 'closed') AND si.waiting_for_team = true");
      } else if (queueView === 'escalated') {
        conds.push("si.status NOT IN ('resolved', 'closed') AND si.escalated_to_top = true");
      } else if (queueView === 'needs_reassignment') {
        conds.push(`
          si.status NOT IN ('resolved', 'closed')
          AND si.assignee_user_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM platform_roles pr_q
            JOIN auth_users au_q ON au_q.id = pr_q.user_id
            WHERE pr_q.user_id = si.assignee_user_id
              AND au_q.disabled_at IS NULL
              AND pr_q.role IN ('mod', 'moderator', 'top', 'platform_admin')
          )
        `);
      }

      if (statusFilter === 'open_all') {
        conds.push("si.status NOT IN ('resolved', 'closed')");
      } else if (statusFilter && statusFilter !== 'all') {
        params.push(statusFilter);
        conds.push(`si.status = $${params.length}`);
      }
      if (severityFilter && severityFilter !== 'all') {
        params.push(severityFilter);
        conds.push(`si.severity = $${params.length}`);
      }
      if (urgencyFilter && urgencyFilter !== 'all') {
        params.push(urgencyFilter);
        conds.push(`si.reporter_urgency = $${params.length}`);
      }
      if (categoryFilter && categoryFilter !== 'all') {
        const mappedCat = normalizeSupportCategoryInput(categoryFilter) || categoryFilter;
        params.push(mappedCat);
        conds.push(`si.category = $${params.length}`);
      }
      if (reporterTypeFilter === 'customer' || reporterTypeFilter === 'vendor') {
        params.push(reporterTypeFilter);
        conds.push(`si.reporter_context = $${params.length}`);
      }
      if (vendorFilter) {
        params.push(vendorFilter);
        conds.push(`si.vendor_id = $${params.length}`);
      }
      if (dateFrom) {
        params.push(dateFrom);
        conds.push(`si.created_at >= ($${params.length}::date)::timestamptz`);
      }
      if (dateTo) {
        params.push(dateTo);
        conds.push(`si.created_at < (($${params.length}::date + interval '1 day'))::timestamptz`);
      }
      if (overdueOnly) {
        conds.push("si.status IN ('open', 'in_review', 'in_progress', 'waiting') AND si.sla_due_at < now()");
      }
      if (qText) {
        params.push(qText);
        const qi = params.length;
        conds.push(
          `(
            si.ticket_number ILIKE $${qi} ESCAPE '\\'
            OR si.subject ILIKE $${qi} ESCAPE '\\'
            OR si.description ILIKE $${qi} ESCAPE '\\'
            OR COALESCE(si.vendor_id, '') ILIKE $${qi} ESCAPE '\\'
            OR COALESCE(si.error_correlation_id, '') ILIKE $${qi} ESCAPE '\\'
          )`
        );
      }

      const whereSql = conds.join(' AND ');
      const totalRes = await tx.query(`SELECT count(*)::int AS total FROM support_issues si WHERE ${whereSql}`, params);

      params.push(pageSize, offset);
      const { rows } = await tx.query(
        `SELECT
           si.*,
           (si.status IN ('open', 'in_review', 'in_progress', 'waiting') AND si.sla_due_at < now()) AS is_overdue,
           (
             SELECT count(*)::int
             FROM support_issue_diagnostic_links dl
             WHERE dl.issue_id = si.id AND dl.unlinked_at IS NULL
           ) AS linked_diagnostics_count,
           ${assigneeSelectExpr}
         FROM support_issues si
         WHERE ${whereSql}
         ORDER BY
           CASE
             WHEN si.status NOT IN ('resolved', 'closed') AND si.reporter_urgency = 'critical' THEN 0
             WHEN si.status NOT IN ('resolved', 'closed') AND si.escalated_to_top = true THEN 1
             WHEN si.status IN ('open', 'in_review', 'in_progress', 'waiting') AND si.sla_due_at < now() THEN 2
             WHEN si.status NOT IN ('resolved', 'closed') AND si.waiting_for_team = true THEN 3
             WHEN si.status NOT IN ('resolved', 'closed') THEN 4
             ELSE 5
           END ASC,
           si.last_activity_at DESC,
           si.created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );

      const ids = rows.map(r => r.id);
      const notesMap = new Map();
      if (ids.length) {
        const { rows: notes } = await tx.query(
          `SELECT id, issue_id, author_user_id, author_role, author_display_label, visibility, body, created_at
           FROM support_issue_notes
           WHERE issue_id = ANY($1::uuid[])
           ORDER BY created_at ASC`,
          [ids]
        );
        for (const n of notes) {
          if (!notesMap.has(n.issue_id)) notesMap.set(n.issue_id, []);
          notesMap.get(n.issue_id).push(n);
        }
      }

      return {
        page,
        page_size: pageSize,
        total: totalRes.rows[0]?.total || 0,
        summary: queueSummaryRes.rows[0] || {},
        staff_roster: staffRoster,
        issues: rows.map(r => {
          const fmt = formatAdminIssueRow(r);
          delete fmt.assignee_raw_email;
          return {
            ...fmt,
            notes: notesMap.get(r.id) || []
          };
        })
      };
    });
    if (out.denied) return sendJson(out.denied.status, { error: out.denied.error });
    if (out.notFound) return sendJson(404, { error: 'Issue not found.' });
    return sendJson(200, out);
  }

  if (normPath === '/api/admin/issues/update') {
    if (method !== 'POST') return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'POST' });
    const issueId = typeof body.issue_id === 'string' ? body.issue_id.trim() : '';
    const rawNextStatus = typeof body.status === 'string' && body.status.trim() ? body.status.trim() : null;
    const nextStatus = rawNextStatus ? normalizeSupportStatusInput(rawNextStatus) : null;
    const nextSeverity = typeof body.severity === 'string' && body.severity.trim() ? body.severity.trim().toLowerCase() : null;
    const priorityChangeReason =
      typeof body.priority_change_reason === 'string' && body.priority_change_reason.trim()
        ? body.priority_change_reason.trim().slice(0, 500)
        : null;
    const rawAssignee = body.assignee_user_id !== undefined ? body.assignee_user_id : body.assigned_to;
    const nextAssigneeProvided = rawAssignee !== undefined;
    const assigneeId = nextAssigneeProvided ? (rawAssignee ? String(rawAssignee).trim().slice(0, 128) : null) : undefined;
    const assignmentReason =
      typeof body.assignment_reason === 'string' && body.assignment_reason.trim()
        ? body.assignment_reason.trim().slice(0, 500)
        : null;
    const escalateToTop = typeof body.escalated_to_top === 'boolean' ? body.escalated_to_top : undefined;
    const escalationReason =
      typeof body.escalation_reason === 'string' && body.escalation_reason.trim()
        ? body.escalation_reason.trim().slice(0, 500)
        : null;
    const resolutionReason =
      typeof body.resolution_reason === 'string' && body.resolution_reason.trim()
        ? body.resolution_reason.trim().slice(0, 800)
        : null;
    const noteBody = typeof body.note_body === 'string' && body.note_body.trim() ? body.note_body.trim() : null;
    const noteVisibility = body.note_visibility === 'reporter_visible' ? 'reporter_visible' : 'internal';
    const expectedUpdatedAt =
      typeof body.expected_updated_at === 'string' && body.expected_updated_at.trim()
        ? body.expected_updated_at.trim()
        : null;
    const idem = normalizeOptionalIdempotencyKey(body.idempotency_key);

    if (!idem.ok) return sendJson(400, { error: idem.error });
    if (!UUID_RE.test(issueId)) return sendJson(400, { error: 'Valid issue_id is required.' });
    if (rawNextStatus && !nextStatus) {
      return sendJson(400, { error: 'Invalid issue status.' });
    }
    if (nextSeverity && !VALID_STAFF_PRIORITIES.has(nextSeverity)) {
      return sendJson(400, { error: 'Invalid staff priority / severity.' });
    }
    if ((nextStatus === 'resolved' || nextStatus === 'closed') && (!resolutionReason || resolutionReason.length < 4)) {
      return sendJson(400, { error: 'A resolution_reason (at least 4 characters) is required when resolving or closing a ticket.' });
    }
    if (noteBody && (noteBody.length < 2 || noteBody.length > 1500)) {
      return sendJson(400, { error: 'Message body must be 2–1500 characters.' });
    }
    if (escalateToTop === true && (!escalationReason || escalationReason.length < 4) && (!noteBody || noteBody.length < 4)) {
      return sendJson(400, { error: 'Provide an escalation_reason (at least 4 characters) when escalating a ticket to Admin: Top.' });
    }

    const outcome = await withTransaction(dbAdapter, async tx => {
      const verified = await reverifyModeratorInTx(tx, ctx);
      if (!verified.ok) return { status: verified.status, body: { error: verified.error } };
      await enableAdminTxGuards(tx, ctx);

      const { rows } = await tx.query('SELECT * FROM support_issues WHERE id = $1 FOR UPDATE', [issueId]);
      if (!rows.length) return { status: 404, body: { error: 'Issue not found.' } };
      const cur = rows[0];

      // Check idempotent note replay BEFORE conflict check so network retries succeed cleanly
      if (idem.value) {
        const prevNote = await tx.query(
          'SELECT id FROM support_issue_notes WHERE issue_id = $1 AND author_user_id = $2 AND idempotency_key = $3 LIMIT 1',
          [issueId, ctx.user.id, idem.value]
        );
        if (prevNote.rows.length) {
          return {
            status: 200,
            body: {
              issue: cur,
              deduplicated: true,
              notification_delivery: 'recorded_in_app_only'
            }
          };
        }
      }

      if (expectedUpdatedAt && cur.updated_at) {
        const expMs = new Date(expectedUpdatedAt).getTime();
        const curMs = new Date(cur.updated_at).getTime();
        if (Number.isFinite(expMs) && Number.isFinite(curMs) && Math.abs(expMs - curMs) > 5) {
          return {
            status: 409,
            body: {
              error: 'Support ticket was modified concurrently by another team member or the reporter. Refresh the ticket before saving.',
              code: 'STALE_ISSUE_STATE'
            }
          };
        }
      }

      const effStatus = nextStatus || cur.status;
      const transCheck = validateStaffStatusTransition(cur.status, effStatus, verified.actorRole);
      if (!transCheck.ok) {
        return { status: transCheck.status, body: { error: transCheck.error, code: transCheck.code } };
      }

      const effSeverity = nextSeverity || cur.severity;
      const priorityChanged = effSeverity !== cur.severity;
      const effPrioReason = priorityChangeReason || (noteVisibility === 'internal' ? noteBody : null);
      if (priorityChanged && (!effPrioReason || effPrioReason.length < 4)) {
        return {
          status: 400,
          body: {
            error: 'Changing staff priority requires a reason (at least 4 characters). Original reporter urgency remains unchanged.',
            code: 'PRIORITY_REASON_REQUIRED'
          }
        };
      }

      // Inspect current assignee status + target assignee validity
      let currentAssigneeRole = null;
      let currentAssigneeInactive = false;
      if (cur.assignee_user_id) {
        const curAssRes = await tx.query(
          `SELECT au.disabled_at, pr.role
           FROM auth_users au
           LEFT JOIN platform_roles pr ON pr.user_id = au.id
           WHERE au.id = $1`,
          [cur.assignee_user_id]
        );
        const r = curAssRes.rows[0];
        const lvl = normalizeAdminLevel(r?.role || null);
        if (!r || r.disabled_at || !lvl) {
          currentAssigneeInactive = true;
        } else {
          currentAssigneeRole = lvl;
        }
      }

      let targetAssigneeRecord = null;
      if (nextAssigneeProvided && assigneeId) {
        const targRes = await tx.query(
          `SELECT au.id, au.disabled_at IS NOT NULL AS is_disabled, pr.role
           FROM auth_users au
           LEFT JOIN platform_roles pr ON pr.user_id = au.id
           WHERE au.id = $1`,
          [assigneeId]
        );
        if (targRes.rows[0]) {
          targetAssigneeRecord = {
            id: targRes.rows[0].id,
            is_disabled: targRes.rows[0].is_disabled,
            admin_level: normalizeAdminLevel(targRes.rows[0].role)
          };
        }
      }

      const assignEval = evaluateAssignmentMutation({
        curIssue: cur,
        currentAssigneeRole,
        currentAssigneeInactive,
        nextAssigneeProvided,
        nextAssigneeId: assigneeId,
        targetAssigneeRecord,
        actorUserId: ctx.user.id,
        actorRole: verified.actorRole,
        nextStatus: effStatus,
        escalateToTop,
        reasonText: assignmentReason || escalationReason || (noteVisibility === 'internal' ? noteBody : null)
      });
      if (!assignEval.ok) {
        return { status: assignEval.status, body: { error: assignEval.error, code: assignEval.code } };
      }

      const effAssignee = assignEval.effAssignee;
      const assigneeChanged = effAssignee !== (cur.assignee_user_id || null);
      const effEscalated = escalateToTop !== undefined ? escalateToTop : Boolean(cur.escalated_to_top);
      const effEscReason = effEscalated ? escalationReason || cur.escalation_reason || noteBody || null : null;
      const effResReason = resolutionReason || cur.resolution_reason;

      // Recompute internal target if priority changed while open
      const nextSlaDueAt =
        priorityChanged && !['resolved', 'closed'].includes(effStatus)
          ? computeIssueSlaDueAt(effSeverity)
          : cur.sla_due_at;

      const publicReplyAdded = Boolean(noteBody && noteVisibility === 'reporter_visible');
      const statusChanged = effStatus !== cur.status;
      const publicActivityOccurred = publicReplyAdded || statusChanged;
      const nextWaitingForTeam =
        publicReplyAdded || ['waiting', 'resolved', 'closed'].includes(effStatus)
          ? false
          : effEscalated && !cur.escalated_to_top
            ? true
            : cur.waiting_for_team;

      const { rows: u } = await tx.query(
        `UPDATE support_issues
         SET status = $2,
             severity = $3,
             priority_updated_by = CASE WHEN $4::boolean THEN $5 ELSE priority_updated_by END,
             priority_updated_at = CASE WHEN $4::boolean THEN now() ELSE priority_updated_at END,
             priority_change_reason = CASE WHEN $4::boolean THEN $6 ELSE priority_change_reason END,
             sla_due_at = $7,
             assignee_user_id = $8,
             assigned_at = CASE WHEN $9::boolean THEN (CASE WHEN $8::text IS NULL THEN NULL ELSE now() END) ELSE assigned_at END,
             assigned_by = CASE WHEN $9::boolean THEN (CASE WHEN $8::text IS NULL THEN NULL ELSE $5 END) ELSE assigned_by END,
             escalated_to_top = $10,
             escalation_reason = $11,
             resolution_reason = $12,
             waiting_for_team = $13,
             staff_last_read_at = now(),
             last_public_staff_activity_at = CASE WHEN $14::boolean THEN now() ELSE last_public_staff_activity_at END,
             last_activity_at = now(),
             resolved_at = CASE
               WHEN $2 = 'resolved' THEN COALESCE(resolved_at, now())
               WHEN $2 IN ('open', 'in_review', 'in_progress', 'waiting') THEN resolved_at
               ELSE resolved_at
             END,
             closed_at = CASE WHEN $2 = 'closed' THEN COALESCE(closed_at, now()) ELSE closed_at END,
             updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [
          issueId,
          effStatus,
          effSeverity,
          priorityChanged,
          ctx.user.id,
          effPrioReason,
          nextSlaDueAt,
          effAssignee,
          assigneeChanged,
          effEscalated,
          effEscReason,
          effResReason,
          nextWaitingForTeam,
          publicActivityOccurred
        ]
      );

      const publicTeamLabel = formatPublicTeamAuthorLabel(verified.actorRole);
      let insertedNoteId = null;

      if (noteBody) {
        const { rows: nIns } = await tx.query(
          `INSERT INTO support_issue_notes (
             issue_id, author_user_id, author_role, author_display_label, visibility, body, idempotency_key
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id`,
          [issueId, ctx.user.id, verified.actorRole, publicTeamLabel, noteVisibility, noteBody, idem.value]
        );
        insertedNoteId = nIns[0]?.id || null;

        if (noteVisibility === 'reporter_visible') {
          await recordTestSafeNotificationInTx(tx, {
            recipientUserId: cur.reporter_user_id,
            recipientEmail: cur.reporter_email,
            eventKind: 'issue.response',
            subject: `BiteShark Support Update (${cur.ticket_number})`,
            summary: 'New response available in your BiteShark Support thread.'
          });
        }
      }

      if (priorityChanged) {
        await tx.query(
          `INSERT INTO support_issue_events (
             issue_id, event_type, visibility, actor_user_id, actor_role, public_actor_label, summary, metadata
           )
           VALUES ($1, 'priority_changed', 'internal', $2, $3, $4, $5, $6::jsonb)`,
          [
            issueId,
            ctx.user.id,
            verified.actorRole,
            publicTeamLabel,
            `Staff priority changed from "${cur.severity}" to "${effSeverity}" (original reporter urgency "${cur.reporter_urgency}" preserved). Reason: ${effPrioReason}`,
            JSON.stringify({ from_priority: cur.severity, to_priority: effSeverity, reason: effPrioReason })
          ]
        );
      }

      if (assigneeChanged) {
        const evType = !effAssignee ? 'unassigned' : !cur.assignee_user_id ? 'assigned' : 'reassigned';
        const reasonSuffix = assignmentReason ? ` Reason: ${assignmentReason}` : '';
        await tx.query(
          `INSERT INTO support_issue_events (
             issue_id, event_type, visibility, actor_user_id, actor_role, public_actor_label, summary, metadata
           )
           VALUES ($1, $2, 'internal', $3, $4, $5, $6, $7::jsonb)`,
          [
            issueId,
            evType,
            ctx.user.id,
            verified.actorRole,
            publicTeamLabel,
            !effAssignee
              ? `Ticket unassigned by staff.${reasonSuffix}`
              : !cur.assignee_user_id
                ? `Ticket assigned to team member (${effAssignee}).`
                : `Ticket reassigned from ${cur.assignee_user_id} to ${effAssignee}.${reasonSuffix}`,
            JSON.stringify({ from_assignee: cur.assignee_user_id || null, to_assignee: effAssignee })
          ]
        );
      }

      if (effEscalated && !cur.escalated_to_top) {
        await tx.query(
          `INSERT INTO support_issue_events (
             issue_id, event_type, visibility, actor_user_id, actor_role, public_actor_label, summary, metadata
           )
           VALUES ($1, 'escalated', 'internal', $2, $3, $4, $5, $6::jsonb)`,
          [
            issueId,
            ctx.user.id,
            verified.actorRole,
            publicTeamLabel,
            `Escalated to Admin: Top review: ${effEscReason || 'Requires Top oversight'}`,
            JSON.stringify({ reason: effEscReason || null })
          ]
        );
      }

      if (statusChanged) {
        const evType = effStatus === 'resolved' ? 'resolved' : effStatus === 'closed' ? 'closed' : 'status_changed';
        const pubSummary =
          effStatus === 'resolved'
            ? `Marked Resolved by ${publicTeamLabel}: ${effResReason}`
            : effStatus === 'closed'
              ? `Ticket Closed by ${publicTeamLabel}: ${effResReason}`
              : `Status updated from "${SUPPORT_STATUS_LABELS[cur.status] || cur.status}" to "${SUPPORT_STATUS_LABELS[effStatus] || effStatus}".`;
        await tx.query(
          `INSERT INTO support_issue_events (
             issue_id, event_type, visibility, actor_user_id, actor_role, public_actor_label, summary, metadata
           )
           VALUES ($1, $2, 'reporter_visible', $3, $4, $5, $6, $7::jsonb)`,
          [
            issueId,
            evType,
            ctx.user.id,
            verified.actorRole,
            publicTeamLabel,
            pubSummary,
            JSON.stringify({ from_status: cur.status, to_status: effStatus })
          ]
        );
      }

      await recordAuditLog(tx, {
        actorId: ctx.user.id,
        actorRole: verified.actorRole,
        vendorId: cur.vendor_id || null,
        targetType: 'support_issue',
        targetId: issueId,
        action: 'issue.admin_update',
        metadata: {
          ticket_number: cur.ticket_number,
          from_status: cur.status,
          to_status: effStatus,
          priority_changed: priorityChanged || undefined,
          assignee_changed: assigneeChanged || undefined,
          escalated_to_top: effEscalated || undefined,
          note_added: Boolean(noteBody),
          note_visibility: noteBody ? noteVisibility : undefined
        }
      });

      return {
        status: 200,
        updatedRow: u[0],
        publicReplyAdded,
        insertedNoteId,
        resolvedNow: statusChanged && effStatus === 'resolved',
        reporterUserId: cur.reporter_user_id,
        reporterEmail: cur.reporter_email
      };
    });

    if (outcome.status !== 200 || !outcome.updatedRow) {
      return sendJson(outcome.status, outcome.body);
    }

    let notifOut = null;
    if (outcome.publicReplyAdded || outcome.resolvedNow) {
      const evKind = outcome.resolvedNow ? 'ticket_resolved' : 'staff_public_reply';
      const dedupeKey = outcome.insertedNoteId
        ? `note:${outcome.insertedNoteId}`
        : `status:${outcome.updatedRow.id}:resolved:${outcome.updatedRow.updated_at}`;
      notifOut = await recordAndDispatchSupportNotification({
        dbAdapter,
        issueId: outcome.updatedRow.id,
        ticketNumber: outcome.updatedRow.ticket_number,
        recipientUserId: outcome.reporterUserId,
        recipientEmail: outcome.reporterEmail,
        eventKind: evKind,
        dedupeKey,
        statusLabel: SUPPORT_STATUS_LABELS[outcome.updatedRow.status] || outcome.updatedRow.status
      });
    }

    return sendJson(200, {
      issue: {
        ...outcome.updatedRow,
        status_label: SUPPORT_STATUS_LABELS[outcome.updatedRow.status] || outcome.updatedRow.status
      },
      ...(notifOut
        ? {
            notification_delivery: notifOut.notification_delivery,
            notification: notifOut
          }
        : {})
    });
  }

  if (normPath === '/api/admin/issues/diagnostics') {
    if (method !== 'POST') return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'POST' });
    const action = typeof body?.action === 'string' ? body.action.trim().toLowerCase() : 'link';
    const issueId = typeof body?.issue_id === 'string' ? body.issue_id.trim() : '';
    const diagGroupId = typeof body?.diagnostic_group_id === 'string' ? body.diagnostic_group_id.trim() : '';
    const rawReason = typeof body?.reason === 'string' ? body.reason.trim() : '';
    const rawPublicSummary =
      body?.public_summary !== undefined
        ? typeof body.public_summary === 'string' && body.public_summary.trim()
          ? sanitizeDiagnosticText(body.public_summary.trim(), 235, '')
          : null
        : undefined;
    const rawFixSha =
      body?.fixing_release_sha !== undefined
        ? typeof body.fixing_release_sha === 'string' && body.fixing_release_sha.trim()
          ? body.fixing_release_sha.trim().toLowerCase()
          : null
        : undefined;
    const rawVerifStatus =
      typeof body?.verification_status === 'string' && body.verification_status.trim()
        ? body.verification_status.trim().toLowerCase()
        : undefined;
    const rawVerifNote =
      typeof body?.verification_note === 'string' && body.verification_note.trim()
        ? sanitizeDiagnosticText(body.verification_note.trim(), 480, '')
        : undefined;

    if (!['link', 'confirm', 'update', 'unlink'].includes(action)) {
      return sendJson(400, { error: 'action must be "link", "confirm", "update", or "unlink".' });
    }
    if (!UUID_RE.test(issueId) || !UUID_RE.test(diagGroupId)) {
      return sendJson(400, { error: 'Valid issue_id and diagnostic_group_id UUIDs are required.' });
    }
    if (['link', 'confirm', 'unlink'].includes(action) && (rawReason.length < 3 || rawReason.length > 500)) {
      return sendJson(400, { error: 'A reason (3–500 characters) is required when linking, confirming, or unlinking a diagnostic incident.' });
    }
    if (rawPublicSummary !== undefined && rawPublicSummary !== null && rawPublicSummary.length < 4) {
      return sendJson(400, { error: 'Optional public_summary must be at least 4 characters (or empty).' });
    }
    if (rawFixSha && !/^[0-9a-f]{7,40}$/.test(rawFixSha)) {
      return sendJson(400, { error: 'fixing_release_sha must be a 7–40 character hexadecimal commit SHA.' });
    }
    if (rawVerifStatus && !['unverified', 'pending_release', 'verified_fixed', 'still_reproducing'].includes(rawVerifStatus)) {
      return sendJson(400, { error: 'Invalid verification_status.' });
    }

    const out = await withTransaction(dbAdapter, async tx => {
      const verified = await reverifyModeratorInTx(tx, ctx);
      if (!verified.ok) return { status: verified.status, body: { error: verified.error } };
      await enableAdminTxGuards(tx, ctx);
      const isTop = verified.actorRole === 'top';

      if ((rawFixSha !== undefined || rawVerifStatus === 'verified_fixed') && !isTop) {
        return {
          status: 403,
          body: {
            error: 'Only Admin: Top may record fixing release SHAs or mark diagnostic verification as verified_fixed.',
            code: 'TOP_REQUIRED'
          }
        };
      }

      const { rows: issRows } = await tx.query('SELECT * FROM support_issues WHERE id = $1 FOR UPDATE', [issueId]);
      if (!issRows.length) return { status: 404, body: { error: 'Support ticket not found.' } };
      const curIssue = issRows[0];

      const { rows: gRows } = await tx.query(
        'SELECT id, fingerprint, title, mod_visible, triage_status FROM diagnostic_incident_groups WHERE id = $1 FOR SHARE',
        [diagGroupId]
      );
      if (!gRows.length) return { status: 404, body: { error: 'Diagnostic incident not found.' } };
      const diagGroup = gRows[0];

      // Enforce BOTH ticket access and diagnostic scope: Mod cannot link/inspect/unlink Top-only incidents!
      if (!isTop && !diagGroup.mod_visible) {
        return {
          status: 403,
          body: {
            error: 'Admin: Top authorization is required to link or modify restricted authentication/invitation/provider diagnostic incidents.',
            code: 'TOP_DIAGNOSTIC_SCOPE_REQUIRED'
          }
        };
      }

      const safeReason = sanitizeDiagnosticText(rawReason || 'Updated link metadata', 480, 'Updated diagnostic link');
      const publicTeamLabel = formatPublicTeamAuthorLabel(verified.actorRole);

      if (action === 'unlink') {
        const { rows: unlinked } = await tx.query(
          `UPDATE support_issue_diagnostic_links
           SET unlinked_at = now(),
               unlinked_by = $3,
               unlink_reason = $4,
               updated_at = now()
           WHERE issue_id = $1 AND diagnostic_group_id = $2 AND unlinked_at IS NULL
           RETURNING *`,
          [issueId, diagGroupId, ctx.user.id, safeReason]
        );
        if (!unlinked.length) {
          return { status: 404, body: { error: 'Active diagnostic link not found on this ticket.' } };
        }
        await tx.query(
          `INSERT INTO support_issue_events (
             issue_id, event_type, visibility, actor_user_id, actor_role, public_actor_label, summary, metadata
           )
           VALUES ($1, 'diagnostic_unlinked', 'internal', $2, $3, $4, $5, $6::jsonb)`,
          [
            issueId,
            ctx.user.id,
            verified.actorRole,
            publicTeamLabel,
            `Unlinked diagnostic incident "${diagGroup.title}". Reason: ${safeReason}`,
            JSON.stringify({ diagnostic_group_id: diagGroupId })
          ]
        );
        await recordAuditLog(tx, {
          actorId: ctx.user.id,
          actorRole: verified.actorRole,
          targetType: 'support_issue',
          targetId: issueId,
          action: 'issue.diagnostic_unlink',
          metadata: { diagnostic_group_id: diagGroupId, reason: safeReason }
        });
        return { status: 200, body: { ok: true, unlinked: unlinked[0] } };
      }

      // `link`, `confirm`, or `update`
      const { rows: existing } = await tx.query(
        `SELECT * FROM support_issue_diagnostic_links
         WHERE issue_id = $1 AND diagnostic_group_id = $2 AND unlinked_at IS NULL
         FOR UPDATE`,
        [issueId, diagGroupId]
      );

      let linkRow;
      let publicSummaryNewlyPublished = false;

      if (!existing.length) {
        if (action === 'update') {
          return { status: 404, body: { error: 'Active diagnostic link not found on this ticket.' } };
        }
        const pubSum = rawPublicSummary || null;
        const { rows: ins } = await tx.query(
          `INSERT INTO support_issue_diagnostic_links (
             issue_id, diagnostic_group_id, diagnostic_fingerprint, link_state,
             linked_by, linked_by_role, link_reason, public_summary,
             fixing_release_sha, verification_status, verification_note
           )
           VALUES ($1, $2, $3, 'confirmed', $4, $5, $6, $7, $8, $9, $10)
           RETURNING *`,
          [
            issueId,
            diagGroupId,
            diagGroup.fingerprint,
            ctx.user.id,
            verified.actorRole,
            safeReason,
            pubSum,
            rawFixSha || null,
            rawVerifStatus || 'unverified',
            rawVerifNote || null
          ]
        );
        linkRow = ins[0];
        publicSummaryNewlyPublished = Boolean(pubSum);
      } else {
        const curLink = existing[0];
        const nextPubSum = rawPublicSummary !== undefined ? rawPublicSummary : curLink.public_summary;
        const nextFixSha = rawFixSha !== undefined ? rawFixSha : curLink.fixing_release_sha;
        const nextVerifSt = rawVerifStatus || curLink.verification_status;
        const nextVerifNote = rawVerifNote !== undefined ? rawVerifNote : curLink.verification_note;
        const nextReason = rawReason ? safeReason : curLink.link_reason;

        const { rows: upd } = await tx.query(
          `UPDATE support_issue_diagnostic_links
           SET link_state = 'confirmed',
               linked_by = $3,
               linked_by_role = $4,
               link_reason = $5,
               public_summary = $6,
               fixing_release_sha = $7,
               verification_status = $8,
               verification_note = $9,
               updated_at = now()
           WHERE id = $1 AND issue_id = $2
           RETURNING *`,
          [
            curLink.id,
            issueId,
            ctx.user.id,
            verified.actorRole,
            nextReason,
            nextPubSum,
            nextFixSha,
            nextVerifSt,
            nextVerifNote
          ]
        );
        linkRow = upd[0];
        publicSummaryNewlyPublished = Boolean(nextPubSum && nextPubSum !== curLink.public_summary);
      }

      await tx.query(
        `INSERT INTO support_issue_events (
           issue_id, event_type, visibility, actor_user_id, actor_role, public_actor_label, summary, metadata
         )
         VALUES ($1, $2, 'internal', $3, $4, $5, $6, $7::jsonb)`,
        [
          issueId,
          action === 'update' ? 'diagnostic_updated' : 'diagnostic_linked',
          ctx.user.id,
          verified.actorRole,
          publicTeamLabel,
          `${action === 'confirm' ? 'Confirmed suggested' : action === 'update' ? 'Updated' : 'Linked'} diagnostic incident "${diagGroup.title}". Reason: ${safeReason}`,
          JSON.stringify({
            diagnostic_group_id: diagGroupId,
            fixing_release_sha: linkRow.fixing_release_sha || null,
            verification_status: linkRow.verification_status
          })
        ]
      );

      if (publicSummaryNewlyPublished && linkRow.public_summary) {
        await tx.query(
          `INSERT INTO support_issue_events (
             issue_id, event_type, visibility, actor_user_id, actor_role, public_actor_label, summary
           )
           VALUES ($1, 'diagnostic_linked', 'reporter_visible', $2, $3, $4, $5)`,
          [issueId, ctx.user.id, verified.actorRole, publicTeamLabel, linkRow.public_summary]
        );
        await tx.query(
          'UPDATE support_issues SET last_public_staff_activity_at = now(), last_activity_at = now(), updated_at = now() WHERE id = $1',
          [issueId]
        );
      }

      await recordAuditLog(tx, {
        actorId: ctx.user.id,
        actorRole: verified.actorRole,
        targetType: 'support_issue',
        targetId: issueId,
        action: `issue.diagnostic_${action}`,
        metadata: {
          ticket_number: curIssue.ticket_number,
          diagnostic_group_id: diagGroupId,
          fixing_release_sha: linkRow.fixing_release_sha || null,
          verification_status: linkRow.verification_status
        }
      });

      return { status: 200, body: { ok: true, link: linkRow } };
    });

    return sendJson(out.status, out.body);
  }

  // -------------------------------------------------------------------------
  // 6G-Readiness. Business & Compliance Readiness Checklist (`/api/admin/readiness*`)
  // -------------------------------------------------------------------------
  if (normPath === '/api/admin/readiness') {
    if (method !== 'GET') return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'GET' });
    const categoryFilter = typeof query.category === 'string' && query.category.trim() ? query.category.trim() : '';
    const statusFilter = typeof query.status === 'string' && query.status.trim() ? query.status.trim() : '';
    const criticalOnly = query.critical_only === '1' || query.critical_only === 'true';
    const itemKeyFilter = typeof query.item_key === 'string' && query.item_key.trim() ? query.item_key.trim() : '';
    const qText = typeof query.q === 'string' && query.q.trim() ? `%${query.q.trim().slice(0, 80)}%` : null;

    const out = await withTransaction(dbAdapter, async tx => {
      const verified = await reverifyModeratorInTx(tx, ctx);
      if (!verified.ok) return { denied: verified };
      await enableAdminTxGuards(tx, ctx);

      const summaryRes = await tx.query(`
        SELECT
          count(*)::int AS total_items,
          count(*) FILTER (WHERE is_launch_critical = true)::int AS total_launch_critical,
          count(*) FILTER (WHERE is_launch_critical = true AND status NOT IN ('legally_approved', 'not_applicable'))::int AS unresolved_launch_critical,
          count(*) FILTER (WHERE status = 'legally_approved')::int AS legally_approved_count,
          count(*) FILTER (WHERE status = 'needs_re_review')::int AS needs_re_review_count,
          count(*) FILTER (WHERE status IN ('not_assessed', 'decision_pending'))::int AS unassessed_or_pending_count,
          COALESCE(bool_or(item_key = 'final_legal_launch_gate' AND status = 'legally_approved'), false) AS final_launch_approved
        FROM compliance_readiness_items
      `);

      const conds = ['1=1'];
      const params = [];
      if (verified.actorRole !== 'top') {
        conds.push('i.mod_visible = true');
      }
      if (categoryFilter && categoryFilter !== 'all') {
        params.push(categoryFilter);
        conds.push(`i.category = $${params.length}`);
      }
      if (statusFilter && statusFilter !== 'all') {
        params.push(statusFilter);
        conds.push(`i.status = $${params.length}`);
      }
      if (criticalOnly) {
        conds.push('i.is_launch_critical = true');
      }
      if (itemKeyFilter) {
        params.push(itemKeyFilter);
        conds.push(`i.item_key = $${params.length}`);
      }
      if (qText) {
        params.push(qText);
        conds.push(
          `(i.topic ILIKE $${params.length} OR i.current_practice ILIKE $${params.length} OR COALESCE(i.unresolved_questions, '') ILIKE $${params.length} OR i.owner_label ILIKE $${params.length})`
        );
      }

      const whereSql = conds.join(' AND ');
      const { rows } = await tx.query(
        `SELECT i.*
         FROM compliance_readiness_items i
         WHERE ${whereSql}
         ORDER BY i.sort_order ASC, i.item_key ASC`,
        params
      );

      const itemKeys = rows.map(r => r.item_key);
      const historyByItem = new Map();
      if (itemKeys.length) {
        const { rows: histRows } = await tx.query(
          `SELECT id, item_key, actor_id, actor_role, change_kind, from_status, to_status, summary, metadata, created_at
           FROM compliance_readiness_history
           WHERE item_key = ANY($1::text[])
           ORDER BY created_at DESC`,
          [itemKeys]
        );
        for (const h of histRows) {
          if (!historyByItem.has(h.item_key)) historyByItem.set(h.item_key, []);
          const arr = historyByItem.get(h.item_key);
          if (arr.length < 25) {
            arr.push(h);
          }
        }
      }

      const sum = summaryRes.rows[0] || {};
      const launchReady = Boolean(sum.final_launch_approved) && (sum.unresolved_launch_critical || 0) === 0;

      return {
        actor: {
          id: ctx.user.id,
          email: ctx.user.email,
          level: verified.actorRole,
          label: verified.actorRole === 'top' ? ROLE_LABELS.top : ROLE_LABELS.mod
        },
        launch_ready: launchReady,
        launch_readiness_incomplete: !launchReady,
        reminder_banner: LAUNCH_INCOMPLETE_REMINDER_TEXT,
        deployment_portal_notice: DEPLOYMENT_PORTAL_REMINDER_NOTE,
        summary: {
          total_items: sum.total_items || 0,
          visible_items: rows.length,
          total_launch_critical: sum.total_launch_critical || 0,
          unresolved_launch_critical: sum.unresolved_launch_critical || 0,
          legally_approved_count: sum.legally_approved_count || 0,
          needs_re_review_count: sum.needs_re_review_count || 0,
          unassessed_or_pending_count: sum.unassessed_or_pending_count || 0
        },
        statuses_catalog: READINESS_STATUS_CATALOG,
        items: rows.map(r => serializeReadinessItemForActor(r, verified.actorRole, historyByItem.get(r.item_key) || []))
      };
    });
    if (out.denied) return sendJson(out.denied.status, { error: out.denied.error });
    return sendJson(200, out);
  }

  if (normPath === '/api/admin/readiness/note') {
    if (method !== 'POST') return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'POST' });
    const itemKey = typeof body.item_key === 'string' ? body.item_key.trim() : '';
    if (!/^[a-z0-9_]{3,64}$/.test(itemKey)) {
      return sendJson(400, { error: 'Valid item_key is required.' });
    }

    const forbiddenModKeys = [
      'status',
      'decision_recorded',
      'implemented_recorded',
      'tested_recorded',
      'policy_version',
      'current_practice',
      'unresolved_questions',
      'owner_label',
      'next_action',
      'target_review_date',
      'approved_doc_version',
      'approved_jurisdiction_scope',
      'legal_reviewer_name',
      'legal_reviewed_at',
      'confidential_counsel_notes',
      'mod_counsel_access_granted',
      'not_applicable_explanation'
    ];

    const noteText = typeof body.note === 'string' ? body.note.trim() : '';
    const hasEvidenceUpdate = body.supporting_evidence !== undefined;
    const nextEvidence =
      hasEvidenceUpdate && body.supporting_evidence !== null && String(body.supporting_evidence).trim()
        ? String(body.supporting_evidence).trim().slice(0, 1000)
        : hasEvidenceUpdate
          ? null
          : undefined;

    if (!noteText && !hasEvidenceUpdate) {
      return sendJson(400, { error: 'Provide an operational note or supporting_evidence reference.' });
    }
    if (noteText && (noteText.length < 3 || noteText.length > 800)) {
      return sendJson(400, { error: 'Operational note must be 3–800 characters.' });
    }

    const outcome = await withTransaction(dbAdapter, async tx => {
      const verified = await reverifyModeratorInTx(tx, ctx);
      if (!verified.ok) return { status: verified.status, body: { error: verified.error } };

      if (verified.actorRole !== 'top') {
        for (const k of forbiddenModKeys) {
          if (body[k] !== undefined) {
            return {
              status: 403,
              body: {
                error:
                  'Admin: Mod may add operational notes and supporting evidence only; readiness status, governing policies, counsel notes, and legal approvals require Admin: Top.',
                code: 'MOD_READINESS_FORBIDDEN'
              }
            };
          }
        }
      }

      await enableAdminTxGuards(tx, ctx);
      const { rows } = await tx.query('SELECT * FROM compliance_readiness_items WHERE item_key = $1 FOR UPDATE', [
        itemKey
      ]);
      if (!rows.length) return { status: 404, body: { error: 'Readiness item not found.' } };
      const cur = rows[0];

      if (verified.actorRole !== 'top' && (!cur.mod_visible || cur.item_key === 'final_legal_launch_gate')) {
        return {
          status: 403,
          body: {
            error: 'Admin: Mod does not have access to modify this governance item.',
            code: 'MOD_READINESS_FORBIDDEN'
          }
        };
      }

      const stamp = new Date().toISOString().slice(0, 19).replace('T', ' ') + 'Z';
      const appendedNotes = noteText
        ? [cur.operational_notes, `[${stamp} · ${verified.actorRole.toUpperCase()}] ${noteText}`]
            .filter(Boolean)
            .join('\n')
            .slice(-2000)
        : cur.operational_notes;
      const effEvidence = nextEvidence !== undefined ? nextEvidence : cur.supporting_evidence;

      const { rows: updatedRows } = await tx.query(
        `UPDATE compliance_readiness_items
         SET operational_notes = $2,
             supporting_evidence = $3,
             updated_by = $4,
             updated_at = now()
         WHERE item_key = $1
         RETURNING *`,
        [itemKey, appendedNotes, effEvidence, ctx.user.id]
      );

      const summary = noteText
        ? `Operational note added: ${noteText.slice(0, 180)}`
        : 'Supporting evidence reference updated';

      await tx.query(
        `INSERT INTO compliance_readiness_history
           (item_key, actor_id, actor_role, change_kind, from_status, to_status, summary, metadata)
         VALUES ($1, $2, $3, 'mod_operational_note', $4, $4, $5, $6::jsonb)`,
        [
          itemKey,
          ctx.user.id,
          verified.actorRole,
          cur.status,
          summary,
          JSON.stringify({
            note_added: Boolean(noteText),
            evidence_updated: hasEvidenceUpdate
          })
        ]
      );

      await recordAuditLog(tx, {
        actorId: ctx.user.id,
        actorRole: verified.actorRole,
        targetType: 'compliance_readiness_item',
        targetId: itemKey,
        action: 'readiness.note_added',
        metadata: {
          status: cur.status,
          note_added: Boolean(noteText),
          evidence_updated: hasEvidenceUpdate
        }
      });

      const { rows: histRows } = await tx.query(
        `SELECT id, item_key, actor_id, actor_role, change_kind, from_status, to_status, summary, metadata, created_at
         FROM compliance_readiness_history
         WHERE item_key = $1
         ORDER BY created_at DESC
         LIMIT 25`,
        [itemKey]
      );

      return {
        status: 200,
        body: {
          item: serializeReadinessItemForActor(updatedRows[0], verified.actorRole, histRows)
        }
      };
    });

    return sendJson(outcome.status, outcome.body);
  }

  if (normPath === '/api/admin/readiness/update') {
    if (method !== 'POST') return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'POST' });
    const itemKey = typeof body.item_key === 'string' ? body.item_key.trim() : '';
    if (!/^[a-z0-9_]{3,64}$/.test(itemKey)) {
      return sendJson(400, { error: 'Valid item_key is required.' });
    }

    if (body.status !== undefined && !VALID_READINESS_STATUSES.has(String(body.status).trim())) {
      return sendJson(400, { error: 'Unrecognized readiness status value.' });
    }

    const targetDateCheck =
      body.target_review_date !== undefined
        ? validateIsoCalendarDate(body.target_review_date, { allowFuture: true })
        : { ok: true, value: undefined };
    if (!targetDateCheck.ok) {
      return sendJson(400, { error: `target_review_date: ${targetDateCheck.error}` });
    }

    const legalDateCheck =
      body.legal_reviewed_at !== undefined
        ? validateIsoCalendarDate(body.legal_reviewed_at, { allowFuture: false })
        : { ok: true, value: undefined };
    if (!legalDateCheck.ok) {
      return sendJson(400, { error: `legal_reviewed_at: ${legalDateCheck.error}` });
    }

    const outcome = await withTransaction(dbAdapter, async tx => {
      const verified = await reverifyPlatformAdminInTx(tx, ctx);
      if (!verified.ok) {
        return {
          status: verified.status,
          body: {
            error:
              'Only Admin: Top may modify readiness statuses, governing policies, confidential counsel notes, or legal-review approvals.',
            code: 'TOP_ADMIN_REQUIRED'
          }
        };
      }

      await enableAdminTxGuards(tx, ctx);
      const { rows } = await tx.query('SELECT * FROM compliance_readiness_items WHERE item_key = $1 FOR UPDATE', [
        itemKey
      ]);
      if (!rows.length) return { status: 404, body: { error: 'Readiness item not found.' } };
      const cur = rows[0];

      if (body.expected_updated_at) {
        const expMs = new Date(body.expected_updated_at).getTime();
        const curMs = new Date(cur.updated_at).getTime();
        if (Number.isFinite(expMs) && Math.abs(expMs - curMs) > 5) {
          return {
            status: 409,
            body: {
              error: 'This readiness item was modified concurrently. Refresh before saving.',
              code: 'CONCURRENT_UPDATE_CONFLICT'
            }
          };
        }
      }

      const cleanOptStr = (val, maxLen) => {
        if (val === undefined) return undefined;
        if (val === null) return null;
        const s = String(val).trim();
        return s ? s.slice(0, maxLen) : null;
      };

      const effPractice =
        body.current_practice !== undefined ? String(body.current_practice || '').trim() : cur.current_practice;
      if (effPractice.length < 4 || effPractice.length > 2000) {
        return { status: 400, body: { error: 'current_practice must be 4–2000 characters.' } };
      }

      const effOwner = body.owner_label !== undefined ? String(body.owner_label || '').trim() : cur.owner_label;
      if (effOwner.length < 2 || effOwner.length > 120) {
        return { status: 400, body: { error: 'owner_label must be 2–120 characters.' } };
      }

      const effNextAction = body.next_action !== undefined ? String(body.next_action || '').trim() : cur.next_action;
      if (effNextAction.length < 4 || effNextAction.length > 600) {
        return { status: 400, body: { error: 'next_action must be 4–600 characters.' } };
      }

      const effUnresolved =
        body.unresolved_questions !== undefined
          ? cleanOptStr(body.unresolved_questions, 2000)
          : cur.unresolved_questions;
      const effPolicyVersion =
        body.policy_version !== undefined ? cleanOptStr(body.policy_version, 80) : cur.policy_version;
      const effEvidence =
        body.supporting_evidence !== undefined ? cleanOptStr(body.supporting_evidence, 1000) : cur.supporting_evidence;
      const effOpNotes =
        body.operational_notes !== undefined ? cleanOptStr(body.operational_notes, 2000) : cur.operational_notes;
      const effCounselNotes =
        body.confidential_counsel_notes !== undefined
          ? cleanOptStr(body.confidential_counsel_notes, 2000)
          : cur.confidential_counsel_notes;
      const effModCounselAccess =
        body.mod_counsel_access_granted !== undefined
          ? Boolean(body.mod_counsel_access_granted)
          : Boolean(cur.mod_counsel_access_granted);
      const effTargetDate =
        targetDateCheck.value !== undefined ? targetDateCheck.value : cur.target_review_date;

      // Stage flags remain independent — selecting a policy decision never auto-marks implemented/tested/approved
      const effDecision =
        body.decision_recorded !== undefined ? Boolean(body.decision_recorded) : Boolean(cur.decision_recorded);
      const effImplemented =
        body.implemented_recorded !== undefined
          ? Boolean(body.implemented_recorded)
          : Boolean(cur.implemented_recorded);
      const effTested =
        body.tested_recorded !== undefined ? Boolean(body.tested_recorded) : Boolean(cur.tested_recorded);

      let requestedStatus = body.status !== undefined ? String(body.status).trim() : cur.status;
      const effNaExplanation =
        body.not_applicable_explanation !== undefined
          ? cleanOptStr(body.not_applicable_explanation, 600)
          : cur.not_applicable_explanation;

      let effApprovedDocVersion =
        body.approved_doc_version !== undefined
          ? cleanOptStr(body.approved_doc_version, 80)
          : cur.approved_doc_version;
      let effApprovedScope =
        body.approved_jurisdiction_scope !== undefined
          ? cleanOptStr(body.approved_jurisdiction_scope, 240)
          : cur.approved_jurisdiction_scope;
      let effReviewerName =
        body.legal_reviewer_name !== undefined
          ? cleanOptStr(body.legal_reviewer_name, 160)
          : cur.legal_reviewer_name;
      let effReviewedAt =
        legalDateCheck.value !== undefined ? legalDateCheck.value : cur.legal_reviewed_at;

      const policyVersionChanged = (effPolicyVersion || null) !== (cur.policy_version || null);
      const practiceChanged = effPractice !== cur.current_practice;
      const materialPolicyChanged = policyVersionChanged || practiceChanged;

      // Determine whether caller supplied a brand-new legal sign-off alongside a material change
      const freshApprovalProvided =
        body.status === 'legally_approved' &&
        Boolean(body.approved_doc_version && String(body.approved_doc_version).trim() !== (cur.approved_doc_version || '')) &&
        Boolean(body.legal_reviewer_name) &&
        Boolean(body.legal_reviewed_at);

      let autoTransitionedToReReview = false;
      if (cur.status === 'legally_approved' && materialPolicyChanged && !freshApprovalProvided) {
        requestedStatus = 'needs_re_review';
        autoTransitionedToReReview = true;
      }

      if (requestedStatus === 'not_applicable') {
        if (!effNaExplanation || effNaExplanation.length < 8) {
          return {
            status: 400,
            body: {
              error: 'Marking an item "not_applicable" requires a clear explanation (at least 8 characters).',
              code: 'NA_EXPLANATION_REQUIRED'
            }
          };
        }
      }

      if (requestedStatus === 'legally_approved') {
        if (
          !effApprovedDocVersion ||
          effApprovedDocVersion.length < 2 ||
          !effApprovedScope ||
          effApprovedScope.length < 3 ||
          !effReviewerName ||
          effReviewerName.length < 3 ||
          !effReviewedAt
        ) {
          return {
            status: 400,
            body: {
              error:
                'Legal approval requires approved_doc_version, approved_jurisdiction_scope, legal_reviewer_name, and legal_reviewed_at (YYYY-MM-DD). Generic checkbox approval is forbidden.',
              code: 'LEGAL_APPROVAL_EVIDENCE_REQUIRED'
            }
          };
        }
      }

      if (
        itemKey === 'final_legal_launch_gate' &&
        (requestedStatus === 'legally_approved' || requestedStatus === 'not_applicable')
      ) {
        const depRes = await tx.query(
          `SELECT count(*)::int AS unresolved_count
           FROM compliance_readiness_items
           WHERE item_key <> 'final_legal_launch_gate'
             AND is_launch_critical = true
             AND status NOT IN ('legally_approved', 'not_applicable')`
        );
        const unresolvedDeps = depRes.rows[0]?.unresolved_count || 0;
        if (unresolvedDeps > 0) {
          return {
            status: 409,
            body: {
              error: `Cannot mark final_legal_launch_gate complete while ${unresolvedDeps} launch-critical readiness item(s) remain unresolved.`,
              code: 'UNRESOLVED_LAUNCH_DEPENDENCIES',
              unresolved_launch_critical: unresolvedDeps
            }
          };
        }
      }

      const { rows: updatedRows } = await tx.query(
        `UPDATE compliance_readiness_items
         SET current_practice = $2,
             unresolved_questions = $3,
             status = $4,
             not_applicable_explanation = $5,
             decision_recorded = $6,
             implemented_recorded = $7,
             tested_recorded = $8,
             owner_label = $9,
             next_action = $10,
             target_review_date = $11,
             policy_version = $12,
             supporting_evidence = $13,
             operational_notes = $14,
             confidential_counsel_notes = $15,
             mod_counsel_access_granted = $16,
             approved_doc_version = $17,
             approved_jurisdiction_scope = $18,
             legal_reviewer_name = $19,
             legal_reviewed_at = $20,
             updated_by = $21,
             updated_at = now()
         WHERE item_key = $1
         RETURNING *`,
        [
          itemKey,
          effPractice,
          effUnresolved,
          requestedStatus,
          effNaExplanation,
          effDecision,
          effImplemented,
          effTested,
          effOwner,
          effNextAction,
          effTargetDate,
          effPolicyVersion,
          effEvidence,
          effOpNotes,
          effCounselNotes,
          effModCounselAccess,
          effApprovedDocVersion,
          effApprovedScope,
          effReviewerName,
          effReviewedAt,
          ctx.user.id
        ]
      );

      let changeKind = 'top_update';
      let summaryText =
        typeof body.change_summary === 'string' && body.change_summary.trim()
          ? body.change_summary.trim().slice(0, 400)
          : `Updated readiness item (${cur.status} -> ${requestedStatus})`;

      const histMeta = {
        decision_recorded: effDecision,
        implemented_recorded: effImplemented,
        tested_recorded: effTested,
        policy_version: effPolicyVersion
      };

      if (autoTransitionedToReReview) {
        changeKind = 'auto_needs_re_review';
        summaryText = `Material policy/practice update automatically marked prior approval (${cur.approved_doc_version || 'unspecified'}) as Needs re-review.`;
        histMeta.changed_fields = [
          ...(policyVersionChanged ? ['policy_version'] : []),
          ...(practiceChanged ? ['current_practice'] : [])
        ];
        histMeta.prior_approval = {
          approved_doc_version: cur.approved_doc_version,
          approved_jurisdiction_scope: cur.approved_jurisdiction_scope,
          legal_reviewer_name: cur.legal_reviewer_name,
          legal_reviewed_at: cur.legal_reviewed_at
        };
      } else if (requestedStatus === 'legally_approved') {
        changeKind = 'legal_approval_recorded';
        summaryText = `Legal review recorded for ${effApprovedDocVersion} (${effApprovedScope}) by ${effReviewerName} on ${effReviewedAt}.`;
        histMeta.approval = {
          approved_doc_version: effApprovedDocVersion,
          approved_jurisdiction_scope: effApprovedScope,
          legal_reviewer_name: effReviewerName,
          legal_reviewed_at: effReviewedAt
        };
      }

      await tx.query(
        `INSERT INTO compliance_readiness_history
           (item_key, actor_id, actor_role, change_kind, from_status, to_status, summary, metadata)
         VALUES ($1, $2, 'top', $3, $4, $5, $6, $7::jsonb)`,
        [itemKey, ctx.user.id, changeKind, cur.status, requestedStatus, summaryText, JSON.stringify(histMeta)]
      );

      await recordAuditLog(tx, {
        actorId: ctx.user.id,
        actorRole: 'top',
        targetType: 'compliance_readiness_item',
        targetId: itemKey,
        action: autoTransitionedToReReview
          ? 'readiness.auto_needs_re_review'
          : requestedStatus === 'legally_approved'
            ? 'readiness.legal_approval_recorded'
            : 'readiness.update',
        metadata: {
          from_status: cur.status,
          to_status: requestedStatus,
          policy_version: effPolicyVersion,
          approved_doc_version: requestedStatus === 'legally_approved' ? effApprovedDocVersion : undefined,
          approved_jurisdiction_scope: requestedStatus === 'legally_approved' ? effApprovedScope : undefined,
          legal_reviewer_name: requestedStatus === 'legally_approved' ? effReviewerName : undefined,
          legal_reviewed_at: requestedStatus === 'legally_approved' ? effReviewedAt : undefined
        }
      });

      const { rows: histRows } = await tx.query(
        `SELECT id, item_key, actor_id, actor_role, change_kind, from_status, to_status, summary, metadata, created_at
         FROM compliance_readiness_history
         WHERE item_key = $1
         ORDER BY created_at DESC
         LIMIT 25`,
        [itemKey]
      );

      return {
        status: 200,
        body: {
          auto_needs_re_review: autoTransitionedToReReview,
          item: serializeReadinessItemForActor(updatedRows[0], 'top', histRows)
        }
      };
    });

    return sendJson(outcome.status, outcome.body);
  }

  // -------------------------------------------------------------------------
  // 6H. Redacted Audit & Activity History (`GET /api/admin/audit`)
  // -------------------------------------------------------------------------
  if (normPath === '/api/admin/audit') {
    if (method !== 'GET') return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'GET' });
    const { page, pageSize, offset } = parseBoundedPagination(query, 30, 60);
    const actionFilter = typeof query.action === 'string' && query.action.trim() ? `${query.action.trim().slice(0, 40)}%` : null;
    const vendorFilter = typeof query.vendor_id === 'string' && query.vendor_id.trim() ? query.vendor_id.trim() : null;
    const actorFilter = typeof query.actor_id === 'string' && query.actor_id.trim() ? query.actor_id.trim() : null;

    const out = await withTransaction(dbAdapter, async tx => {
      const verified = await reverifyModeratorInTx(tx, ctx);
      if (!verified.ok) return { denied: verified };

      const conds = ['1=1'];
      const params = [];
      // Scope `Admin: Mod` audit view to moderation, vendor review, issue, invitation, and Mod readiness-note actions
      if (verified.actorRole !== 'top') {
        conds.push(
          "(action LIKE 'community.%' OR action LIKE 'vendor_application.%' OR action LIKE 'vendor.%' OR action LIKE 'issue.%' OR action LIKE 'invitation.%' OR action LIKE 'onboarding.%' OR action = 'readiness.note_added')"
        );
      }
      if (actionFilter) {
        params.push(actionFilter);
        conds.push(`action ILIKE $${params.length}`);
      }
      if (vendorFilter) {
        params.push(vendorFilter);
        conds.push(`vendor_id = $${params.length}`);
      }
      if (actorFilter) {
        params.push(actorFilter);
        conds.push(`actor_id = $${params.length}`);
      }

      const whereSql = conds.join(' AND ');
      const totalRes = await tx.query(`SELECT count(*)::int AS total FROM audit_logs WHERE ${whereSql}`, params);
      params.push(pageSize, offset);
      const { rows } = await tx.query(
        `SELECT id, actor_id, actor_role, vendor_id, target_type, target_id, action, metadata, created_at
         FROM audit_logs
         WHERE ${whereSql}
         ORDER BY created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );
      return {
        page,
        page_size: pageSize,
        total: totalRes.rows[0]?.total || 0,
        entries: rows
      };
    });
    if (out.denied) return sendJson(out.denied.status, { error: out.denied.error });
    return sendJson(200, out);
  }

  // -------------------------------------------------------------------------
  // 6I. Controlled Feature Management (`/api/admin/features`, `/api/admin/features/update`)
  // -------------------------------------------------------------------------
  if (normPath === '/api/admin/features') {
    if (method !== 'GET') return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'GET' });
    const accessCheck = await withTransaction(dbAdapter, async tx => {
      const verified = await reverifyModeratorInTx(tx, ctx);
      if (!verified.ok) return { denied: verified };
      await enableAdminTxGuards(tx, ctx);
      const histRes = await tx
        .query(
          `SELECT id, feature_key, previous_state, new_state, previous_audience, new_audience,
                  revision, actor_id, actor_role, change_source, reason, created_at
           FROM feature_control_history
           ORDER BY created_at DESC
           LIMIT 40`
        )
        .catch(() => ({ rows: [] }));
      return { ok: true, actorRole: verified.actorRole, historyRows: histRes.rows };
    });
    if (accessCheck.denied) {
      return sendJson(accessCheck.denied.status, { error: accessCheck.denied.error });
    }
    const persisted = await loadPersistedFeatureControls(dbAdapter, { requireTablePresent: true });
    const evaluated = evaluateFeatureControlsSnapshot({
      persistedResult: persisted,
      accessCtx: ctx
    });
    return sendJson(
      200,
      buildAdminFeatureControlsPayload(evaluated, accessCheck.historyRows, {
        actorLevel: accessCheck.actorRole
      })
    );
  }

  if (normPath === '/api/admin/features/update') {
    if (method !== 'POST') return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'POST' });
    const isReadOnlyPreview =
      String(req.headers?.['x-biteshark-viewpoint'] || '')
        .trim()
        .toLowerCase() === 'preview';
    if (isReadOnlyPreview) {
      return sendJson(403, {
        error: 'Feature controls cannot be modified while in read-only Viewpoint Preview.',
        code: 'ADMIN_PREVIEW_READ_ONLY'
      });
    }

    const rawExpectedRev = body?.expected_revision;
    const expectedRevision =
      typeof rawExpectedRev === 'number' && Number.isInteger(rawExpectedRev)
        ? rawExpectedRev
        : typeof rawExpectedRev === 'string' && /^\d+$/.test(rawExpectedRev.trim())
          ? Number(rawExpectedRev.trim())
          : NaN;

    if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
      return sendJson(400, {
        error: 'expected_revision (non-negative integer) is required for optimistic concurrency protection.',
        code: 'INVALID_EXPECTED_REVISION'
      });
    }

    const outcome = await withTransaction(dbAdapter, async tx => {
      const verifiedTop = await reverifyPlatformAdminInTx(tx, ctx);
      if (!verifiedTop.ok) {
        return {
          status: verifiedTop.status,
          body: {
            error: verifiedTop.error || 'Only Admin: Top may modify feature controls.',
            code: 'TOP_ADMIN_REQUIRED'
          }
        };
      }
      await enableAdminTxGuards(tx, ctx);
      await tx.query("SELECT set_config('app.is_platform_admin', 'true', true)");
      await tx.query("SELECT set_config('app.feature_controls_read', 'true', true)");

      const res = await updateFeatureControlInTx(tx, {
        actorId: ctx.user.id,
        actorEmailMasked: maskEmail(ctx.user.email || ''),
        actorRole: 'top',
        changeSource: 'admin_portal',
        featureKey: body?.feature_key,
        nextState: body?.configured_state ?? body?.state,
        nextAudience: body?.audience,
        expectedRevision,
        reason: body?.reason,
        confirmedImpact: body?.confirmed_impact === true
      });

      if (!res.ok) {
        return { status: res.status, body: res };
      }

      const histRes = await tx.query(
        `SELECT id, feature_key, previous_state, new_state, previous_audience, new_audience,
                revision, actor_id, actor_role, change_source, reason, created_at
         FROM feature_control_history
         ORDER BY created_at DESC
         LIMIT 40`
      );
      const allRows = await tx.query(
        `SELECT feature_key, configured_state, audience, revision, reason,
                updated_by, updated_by_email_masked, updated_at
         FROM feature_controls`
      );
      return {
        status: 200,
        allRows: allRows.rows,
        historyRows: histRes.rows,
        updatedResult: res
      };
    });

    if (outcome.status !== 200) {
      return sendJson(outcome.status, outcome.body);
    }

    const persisted = await loadPersistedFeatureControls(dbAdapter, { requireTablePresent: true });
    const evaluated = evaluateFeatureControlsSnapshot({
      persistedResult: persisted,
      accessCtx: ctx
    });
    const adminPayload = buildAdminFeatureControlsPayload(evaluated, outcome.historyRows, {
      actorLevel: 'top'
    });
    return sendJson(200, {
      ok: true,
      updated: outcome.updatedResult,
      ...adminPayload
    });
  }

  // -------------------------------------------------------------------------
  // 6I-Diagnostics. Bounded Release-Aware Error & Diagnostics Portal (`/api/admin/diagnostics*`)
  //   - Explicit Role Policy:
  //     * `Admin: Top`: Full sanitized incident scope (including `mod_visible = false` auth/invite/provider
  //       items), triage state management, suspected cause & fixing SHA links, synthetic verification
  //       probes, and bounded retention cleanup.
  //     * `Admin: Mod`: Sanitized operational subset (`mod_visible = true` ONLY) + append-only operational
  //       notes (`POST /api/admin/diagnostics/note`). Cannot modify triage state, record fix SHAs, run
  //       cleanup, or emit synthetic probes (`403`).
  //     * Neither role can execute SQL/shell/eval, dump env vars, download raw logs, or read secrets.
  // -------------------------------------------------------------------------
  if (normPath === '/api/admin/diagnostics') {
    if (method !== 'GET') return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'GET' });

    const { page, pageSize, offset } = parseBoundedPagination(query, 15, 25);
    const rawWindow = typeof query.window === 'string' ? query.window.trim().toLowerCase() : '7d';
    const timeWindow = ['1h', '24h', '7d', '30d', 'all'].includes(rawWindow) ? rawWindow : '7d';
    const rawSev = typeof query.severity === 'string' ? query.severity.trim().toLowerCase() : '';
    const sevFilter = ALLOWED_SEVERITIES.has(rawSev) ? rawSev : '';
    const rawFeature = typeof query.feature_key === 'string' ? query.feature_key.trim().toLowerCase() : '';
    const featureFilter = ALLOWED_FEATURE_KEYS.has(rawFeature) ? rawFeature : '';
    const rawComp = typeof query.component === 'string' ? query.component.trim().toLowerCase() : '';
    const compFilter = ALLOWED_COMPONENTS.has(rawComp) ? rawComp : '';
    const rawTriage = typeof query.triage_status === 'string' ? query.triage_status.trim().toLowerCase() : '';
    const triageFilter =
      ALLOWED_TRIAGE_STATUSES.has(rawTriage) || rawTriage === 'open' ? rawTriage : '';
    const rawRelease = typeof query.release_sha === 'string' ? query.release_sha.trim().toLowerCase() : '';
    const releaseFilter = /^[a-z0-9._-]{3,64}$/i.test(rawRelease) ? rawRelease : '';
    const includeSynthetic = query.include_synthetic !== '0' && query.include_synthetic !== 'false';
    const rawSearch = typeof query.q === 'string' ? query.q.trim().slice(0, 80) : '';
    const escapedLike = rawSearch
      ? `%${rawSearch.replace(/[\\%_]/g, m => `\\${m}`)}%`
      : null;

    const activeServerSha = normalizeReleaseSha(
      req?.__bsServerReleaseSha || readEnvCompat('RELEASE_SHA') || process.env.GITHUB_SHA || 'dev'
    );

    const out = await withTransaction(dbAdapter, async tx => {
      const verified = await reverifyModeratorInTx(tx, ctx);
      if (!verified.ok) return { denied: verified };
      await enableAdminTxGuards(tx, ctx);
      const isTop = verified.actorRole === 'top';

      const relRes = await tx.query(
        `SELECT release_sha, environment, previous_release_sha, deploy_mode,
                client_bundle_version, first_seen_at, last_seen_at, startup_count
         FROM diagnostic_releases
         ORDER BY first_seen_at DESC
         LIMIT 15`
      );
      const releases = relRes.rows;

      const summaryRes = await tx.query(
        `SELECT
           count(*) FILTER (WHERE triage_status <> 'resolved' AND is_synthetic_test = false)::int AS open_count,
           count(*) FILTER (WHERE triage_status = 'new' AND is_synthetic_test = false)::int AS new_count,
           count(*) FILTER (WHERE triage_status <> 'resolved' AND severity IN ('error', 'critical') AND is_synthetic_test = false)::int AS critical_or_error_open,
           count(*) FILTER (WHERE stale_client_observed = true)::int AS stale_client_groups,
           count(*) FILTER (WHERE continued_after_suspected_fix = true)::int AS continued_after_fix_groups
         FROM diagnostic_incident_groups
         WHERE ($1::boolean OR mod_visible = true)`,
        [isTop]
      );

      const conds = ['1=1'];
      const params = [];
      if (!isTop) {
        conds.push('g.mod_visible = true');
      }
      if (!includeSynthetic) {
        conds.push('g.is_synthetic_test = false');
      }
      if (timeWindow === '1h') conds.push("g.last_seen_at >= now() - interval '1 hour'");
      else if (timeWindow === '24h') conds.push("g.last_seen_at >= now() - interval '24 hours'");
      else if (timeWindow === '7d') conds.push("g.last_seen_at >= now() - interval '7 days'");
      else if (timeWindow === '30d') conds.push("g.last_seen_at >= now() - interval '30 days'");

      if (sevFilter) {
        params.push(sevFilter);
        conds.push(`g.severity = $${params.length}`);
      }
      if (featureFilter) {
        params.push(featureFilter);
        conds.push(`g.feature_key = $${params.length}`);
      }
      if (compFilter) {
        params.push(compFilter);
        conds.push(`g.emitting_component = $${params.length}`);
      }
      if (triageFilter === 'open') {
        conds.push(`g.triage_status <> 'resolved'`);
      } else if (triageFilter) {
        params.push(triageFilter);
        conds.push(`g.triage_status = $${params.length}`);
      }
      if (releaseFilter) {
        params.push(`${releaseFilter}%`);
        const pIdx = params.length;
        conds.push(
          `(g.first_server_release_sha ILIKE $${pIdx} OR g.last_server_release_sha ILIKE $${pIdx} OR EXISTS (SELECT 1 FROM unnest(g.observed_server_releases) rel WHERE rel ILIKE $${pIdx}))`
        );
      }
      if (escapedLike) {
        params.push(escapedLike);
        const qIdx = params.length;
        conds.push(
          `(
            g.title ILIKE $${qIdx} ESCAPE '\\'
            OR g.sanitized_summary ILIKE $${qIdx} ESCAPE '\\'
            OR g.error_code ILIKE $${qIdx} ESCAPE '\\'
            OR g.feature_key ILIKE $${qIdx} ESCAPE '\\'
            OR g.operation_name ILIKE $${qIdx} ESCAPE '\\'
            OR COALESCE(g.route_template, '') ILIKE $${qIdx} ESCAPE '\\'
            OR COALESCE(g.last_correlation_id, '') ILIKE $${qIdx} ESCAPE '\\'
            OR EXISTS (
              SELECT 1
              FROM diagnostic_event_samples s
              WHERE s.group_id = g.id
                AND COALESCE(s.correlation_id, '') ILIKE $${qIdx} ESCAPE '\\'
            )
          )`
        );
      }

      const whereSql = conds.join(' AND ');
      const countRes = await tx.query(
        `SELECT count(*)::int AS total
         FROM diagnostic_incident_groups g
         WHERE ${whereSql}`,
        params
      );
      const total = countRes.rows[0]?.total || 0;

      const listParams = [...params, pageSize, offset];
      const listRes = await tx.query(
        `SELECT g.*,
                (
                  SELECT count(*)::int
                  FROM diagnostic_incident_notes n
                  WHERE (n.group_id = g.id OR n.group_fingerprint = g.fingerprint)
                    AND ($${listParams.length + 1}::boolean OR n.mod_visible = true)
                ) AS notes_count
         FROM diagnostic_incident_groups g
         WHERE ${whereSql}
         ORDER BY
           CASE WHEN g.triage_status = 'resolved' THEN 1 ELSE 0 END ASC,
           g.last_seen_at DESC,
           g.id DESC
         LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
        [...listParams, isTop]
      );

      return {
        active_server_release_sha: activeServerSha,
        active_commit_url: /^[0-9a-f]{7,40}$/i.test(activeServerSha)
          ? `${REPOSITORY_COMMIT_BASE_URL}${activeServerSha}`
          : null,
        client_bundle_version: CLIENT_BUNDLE_VERSION,
        repository_commit_base_url: REPOSITORY_COMMIT_BASE_URL,
        actor_role: verified.actorRole,
        permissions: {
          scope: isTop ? 'full_sanitized' : 'operational_subset',
          can_triage: isTop,
          can_record_fix_sha: isTop,
          can_run_cleanup: isTop,
          can_create_synthetic: isTop,
          can_add_note: true
        },
        retention_policy: getDiagnosticsRetentionPolicy(),
        releases,
        summary: {
          ...(summaryRes.rows[0] || {}),
          total_matching: total
        },
        pagination: {
          page,
          page_size: pageSize,
          total,
          total_pages: Math.max(1, Math.ceil(total / pageSize))
        },
        items: listRes.rows.map(g => ({
          ...g,
          occurrence_count: Number(g.occurrence_count || 1),
          release_relationship: computeReleaseRelationship(g, releases, activeServerSha)
        }))
      };
    });

    if (out.denied) return sendJson(out.denied.status, { error: out.denied.error });
    return sendJson(200, out);
  }

  if (normPath === '/api/admin/diagnostics/detail') {
    if (method !== 'GET') return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'GET' });
    const groupId = typeof query.id === 'string' ? query.id.trim() : '';
    if (!UUID_RE.test(groupId)) return sendJson(400, { error: 'Valid diagnostic incident id is required.' });

    const activeServerSha = normalizeReleaseSha(
      req?.__bsServerReleaseSha || readEnvCompat('RELEASE_SHA') || process.env.GITHUB_SHA || 'dev'
    );

    const out = await withTransaction(dbAdapter, async tx => {
      const verified = await reverifyModeratorInTx(tx, ctx);
      if (!verified.ok) return { status: verified.status, body: { error: verified.error } };
      await enableAdminTxGuards(tx, ctx);
      const isTop = verified.actorRole === 'top';

      const { rows: gRows } = await tx.query(
        'SELECT * FROM diagnostic_incident_groups WHERE id = $1 LIMIT 1',
        [groupId]
      );
      if (!gRows.length) return { status: 404, body: { error: 'Diagnostic incident not found.' } };
      const group = gRows[0];
      if (!isTop && !group.mod_visible) {
        return {
          status: 403,
          body: {
            error:
              'Admin: Top authorization is required to view authentication, invitation, or provider configuration diagnostics.',
            code: 'TOP_DIAGNOSTIC_SCOPE_REQUIRED'
          }
        };
      }

      const relRes = await tx.query(
        `SELECT release_sha, environment, previous_release_sha, deploy_mode,
                client_bundle_version, first_seen_at, last_seen_at, startup_count
         FROM diagnostic_releases
         ORDER BY first_seen_at DESC
         LIMIT 15`
      );
      const samplesRes = await tx.query(
        `SELECT id, occurred_at, received_at, emitting_component, trust_level,
                server_release_sha, client_build_version, client_loaded_release_sha, is_stale_client,
                feature_key, operation_name, route_template, http_method, http_status,
                severity, error_code, sanitized_message, user_impact, correlation_id,
                duration_ms, retryable, outcome_state, safe_context
         FROM diagnostic_event_samples
         WHERE group_id = $1
         ORDER BY received_at DESC, id DESC
         LIMIT 15`,
        [groupId]
      );
      const notesRes = await tx.query(
        `SELECT id, group_id, group_fingerprint, group_title, actor_id, actor_role,
                action_type, previous_triage_status, new_triage_status,
                suspected_cause, suspected_fix_sha, note_body, correlation_id, created_at
         FROM diagnostic_incident_notes
         WHERE (group_id = $1 OR group_fingerprint = $2)
           AND ($3::boolean OR mod_visible = true)
         ORDER BY created_at ASC, id ASC
         LIMIT 100`,
        [groupId, group.fingerprint, isTop]
      );
      const linkedTicketsRes = await tx.query(
        `SELECT dl.id AS link_id, dl.issue_id, dl.link_state, dl.link_reason, dl.public_summary,
                dl.fixing_release_sha, dl.verification_status, dl.created_at AS linked_at,
                si.ticket_number, si.subject, si.status, si.reporter_context, si.reporter_urgency,
                si.severity, si.waiting_for_team, si.created_at
         FROM support_issue_diagnostic_links dl
         JOIN support_issues si ON si.id = dl.issue_id
         WHERE dl.diagnostic_group_id = $1
           AND dl.unlinked_at IS NULL
         ORDER BY
           CASE WHEN dl.link_state = 'confirmed' THEN 0 ELSE 1 END,
           si.created_at DESC
         LIMIT 50`,
        [groupId]
      );

      return {
        status: 200,
        body: {
          incident: {
            ...group,
            occurrence_count: Number(group.occurrence_count || 1),
            release_relationship: computeReleaseRelationship(group, relRes.rows, activeServerSha)
          },
          samples: samplesRes.rows,
          notes: notesRes.rows,
          linked_tickets: linkedTicketsRes.rows.map(r => ({
            ...r,
            status_label: SUPPORT_STATUS_LABELS[r.status] || r.status
          })),
          permissions: {
            can_triage: isTop,
            can_record_fix_sha: isTop,
            can_add_note: true,
            can_notify_linked_tickets: true
          },
          repository_commit_base_url: REPOSITORY_COMMIT_BASE_URL
        }
      };
    });

    return sendJson(out.status, out.body);
  }

  if (normPath === '/api/admin/diagnostics/triage') {
    if (method !== 'POST') return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'POST' });
    const groupId = typeof body?.group_id === 'string' ? body.group_id.trim() : '';
    const nextStatus = typeof body?.triage_status === 'string' ? body.triage_status.trim().toLowerCase() : '';
    const rawCause = typeof body?.suspected_cause === 'string' ? body.suspected_cause.trim() : '';
    const rawFixSha = typeof body?.suspected_fix_sha === 'string' ? body.suspected_fix_sha.trim().toLowerCase() : '';
    const rawNote = typeof body?.note_body === 'string' ? body.note_body.trim() : '';

    if (!UUID_RE.test(groupId)) return sendJson(400, { error: 'Valid group_id is required.' });
    if (!ALLOWED_TRIAGE_STATUSES.has(nextStatus)) {
      return sendJson(400, { error: 'triage_status must be new, investigating, monitoring, or resolved.' });
    }
    if (rawFixSha && !/^[0-9a-f]{7,40}$/.test(rawFixSha)) {
      return sendJson(400, { error: 'suspected_fix_sha must be a 7–40 character hexadecimal commit SHA (or empty).' });
    }
    if (rawNote.length < 4 || rawNote.length > 1500) {
      return sendJson(400, { error: 'An operator note (4–1500 characters) is required when updating triage.' });
    }

    const sanitizedCause = rawCause ? sanitizeDiagnosticText(rawCause, 550, '') : null;
    const sanitizedNote = sanitizeDiagnosticText(rawNote, 1400, '');
    if (sanitizedNote.length < 2) {
      return sendJson(400, { error: 'Enter a descriptive operator note without secrets or credentials.' });
    }

    const out = await withTransaction(dbAdapter, async tx => {
      const verifiedTop = await reverifyPlatformAdminInTx(tx, ctx);
      if (!verifiedTop.ok) return { status: verifiedTop.status, body: { error: verifiedTop.error, code: 'TOP_REQUIRED' } };
      await enableAdminTxGuards(tx, ctx);

      const { rows } = await tx.query(
        'SELECT * FROM diagnostic_incident_groups WHERE id = $1 FOR UPDATE',
        [groupId]
      );
      if (!rows.length) return { status: 404, body: { error: 'Diagnostic incident not found.' } };
      const cur = rows[0];

      const effCause = body?.suspected_cause !== undefined ? sanitizedCause : cur.suspected_cause;
      const effFixSha = body?.suspected_fix_sha !== undefined ? (rawFixSha || null) : cur.suspected_fix_sha;
      const fixChanged = effFixSha !== (cur.suspected_fix_sha || null);

      const { rows: updatedRows } = await tx.query(
        `UPDATE diagnostic_incident_groups
         SET triage_status = $2,
             suspected_cause = $3,
             suspected_fix_sha = $4,
             fix_recorded_at = CASE
               WHEN $4::text IS NULL THEN NULL
               WHEN $5::boolean THEN now()
               ELSE COALESCE(fix_recorded_at, now())
             END,
             fix_recorded_by = CASE
               WHEN $4::text IS NULL THEN NULL
               WHEN $5::boolean THEN $6
               ELSE COALESCE(fix_recorded_by, $6)
             END,
             continued_after_suspected_fix = CASE
               WHEN $4::text IS NULL OR $5::boolean THEN false
               ELSE continued_after_suspected_fix
             END,
             updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [groupId, nextStatus, effCause, effFixSha, fixChanged, ctx.user.id]
      );

      const actionType = fixChanged && effFixSha ? 'fix_reference' : 'triage_update';
      const { rows: noteRows } = await tx.query(
        `INSERT INTO diagnostic_incident_notes (
           group_id, group_fingerprint, group_title, mod_visible, actor_id, actor_role,
           action_type, previous_triage_status, new_triage_status,
           suspected_cause, suspected_fix_sha, note_body, correlation_id
         )
         VALUES ($1, $2, $3, $4, $5, 'top', $6, $7, $8, $9, $10, $11, $12)
         RETURNING *`,
        [
          groupId,
          cur.fingerprint,
          cur.title,
          cur.mod_visible,
          ctx.user.id,
          actionType,
          cur.triage_status,
          nextStatus,
          effCause,
          effFixSha,
          sanitizedNote,
          req?.__bsCorrelationId || null
        ]
      );

      await recordAuditLog(tx, {
        actorId: ctx.user.id,
        actorRole: 'top',
        targetType: 'diagnostic_incident',
        targetId: groupId,
        action: 'diagnostics.triage_update',
        metadata: {
          from_status: cur.triage_status,
          to_status: nextStatus,
          suspected_fix_sha: effFixSha || null
        }
      });

      return {
        status: 200,
        body: {
          ok: true,
          incident: updatedRows[0],
          note: noteRows[0],
          verification_disclaimer:
            'Resolving an incident or recording a suspected fixing commit preserves diagnostic evidence and does not by itself prove the underlying defect is fixed.'
        }
      };
    });

    return sendJson(out.status, out.body);
  }

  if (normPath === '/api/admin/diagnostics/note') {
    if (method !== 'POST') return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'POST' });
    const groupId = typeof body?.group_id === 'string' ? body.group_id.trim() : '';
    const rawNote = typeof body?.note_body === 'string' ? body.note_body.trim() : '';

    if (!UUID_RE.test(groupId)) return sendJson(400, { error: 'Valid group_id is required.' });
    if (rawNote.length < 4 || rawNote.length > 1500) {
      return sendJson(400, { error: 'Operator note must be 4–1500 characters.' });
    }
    const sanitizedNote = sanitizeDiagnosticText(rawNote, 1400, '');
    if (sanitizedNote.length < 2) {
      return sendJson(400, { error: 'Enter a descriptive operator note without secrets or credentials.' });
    }

    const out = await withTransaction(dbAdapter, async tx => {
      const verified = await reverifyModeratorInTx(tx, ctx);
      if (!verified.ok) return { status: verified.status, body: { error: verified.error } };
      await enableAdminTxGuards(tx, ctx);
      const isTop = verified.actorRole === 'top';

      const { rows } = await tx.query(
        'SELECT * FROM diagnostic_incident_groups WHERE id = $1 LIMIT 1',
        [groupId]
      );
      if (!rows.length) return { status: 404, body: { error: 'Diagnostic incident not found.' } };
      const cur = rows[0];
      if (!isTop && !cur.mod_visible) {
        return {
          status: 403,
          body: {
            error: 'Admin: Top authorization is required to annotate restricted security/provider incidents.',
            code: 'TOP_DIAGNOSTIC_SCOPE_REQUIRED'
          }
        };
      }

      const { rows: noteRows } = await tx.query(
        `INSERT INTO diagnostic_incident_notes (
           group_id, group_fingerprint, group_title, mod_visible, actor_id, actor_role,
           action_type, previous_triage_status, new_triage_status,
           suspected_cause, suspected_fix_sha, note_body, correlation_id
         )
         VALUES ($1, $2, $3, $4, $5, $6, 'note', $7, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          groupId,
          cur.fingerprint,
          cur.title,
          cur.mod_visible,
          ctx.user.id,
          verified.actorRole,
          cur.triage_status,
          cur.suspected_cause,
          cur.suspected_fix_sha,
          sanitizedNote,
          req?.__bsCorrelationId || null
        ]
      );

      await recordAuditLog(tx, {
        actorId: ctx.user.id,
        actorRole: verified.actorRole,
        targetType: 'diagnostic_incident',
        targetId: groupId,
        action: 'diagnostics.note_added'
      });

      return { status: 201, body: { ok: true, note: noteRows[0] } };
    });

    return sendJson(out.status, out.body);
  }

  if (normPath === '/api/admin/diagnostics/synthetic-test') {
    if (method !== 'POST') return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'POST' });
    const accessCheck = await withTransaction(dbAdapter, async tx => {
      const verifiedTop = await reverifyPlatformAdminInTx(tx, ctx);
      if (!verifiedTop.ok) return { denied: verifiedTop };
      return { ok: true };
    });
    if (accessCheck.denied) {
      return sendJson(accessCheck.denied.status, { error: accessCheck.denied.error, code: 'TOP_REQUIRED' });
    }

    const customLabel =
      typeof body?.label === 'string' && body.label.trim()
        ? sanitizeDiagnosticText(body.label.trim(), 90, 'Portal verification')
        : 'Portal verification';

    const rec = await recordDiagnosticEvent(dbAdapter, {
      component: 'api',
      trustLevel: 'server_verified',
      featureKey: 'synthetic_verification',
      operationName: 'admin.synthetic_diagnostic_probe',
      routeTemplate: '/api/admin/diagnostics/synthetic-test',
      httpMethod: 'POST',
      httpStatus: 200,
      severity: 'warning',
      errorCode: 'SYNTHETIC_TEST_PROBE',
      title: `[SYNTHETIC TEST] Diagnostic portal verification (${customLabel})`,
      message: `[SYNTHETIC TEST] Operator-triggered verification event (${customLabel}). Not a real customer error.`,
      userImpact: 'None — clearly labeled synthetic verification probe triggered by Admin: Top.',
      safeNextSteps: 'Verify search, incident detail, release attribution, and operator notes, then mark Resolved.',
      correlationId: req?.__bsCorrelationId,
      serverReleaseSha: req?.__bsServerReleaseSha || readEnvCompat('RELEASE_SHA') || 'dev',
      retryable: false,
      outcomeState: 'degraded',
      isSyntheticTest: true,
      modVisible: true,
      safeContext: {
        synthetic_label: customLabel.slice(0, 48),
        phase: 'operator_verification'
      }
    });

    if (rec?.group_id) {
      await withTransaction(dbAdapter, async tx => {
        await enableAdminTxGuards(tx, ctx);
        await recordAuditLog(tx, {
          actorId: ctx.user.id,
          actorRole: 'top',
          targetType: 'diagnostic_incident',
          targetId: rec.group_id,
          action: 'diagnostics.synthetic_probe_recorded'
        });
      });
    }

    return sendJson(201, {
      ok: true,
      synthetic_test: true,
      group_id: rec?.group_id || null,
      correlation_id: rec?.correlation_id || req?.__bsCorrelationId || null,
      occurrence_count: rec?.occurrence_count || 1
    });
  }

  if (normPath === '/api/admin/diagnostics/cleanup') {
    if (method !== 'POST') return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'POST' });
    const accessCheck = await withTransaction(dbAdapter, async tx => {
      const verifiedTop = await reverifyPlatformAdminInTx(tx, ctx);
      if (!verifiedTop.ok) return { denied: verifiedTop };
      return { ok: true };
    });
    if (accessCheck.denied) {
      return sendJson(accessCheck.denied.status, { error: accessCheck.denied.error, code: 'TOP_REQUIRED' });
    }

    const cleanupRes = await cleanupExpiredDiagnostics(dbAdapter);
    await withTransaction(dbAdapter, async tx => {
      await enableAdminTxGuards(tx, ctx);
      await recordAuditLog(tx, {
        actorId: ctx.user.id,
        actorRole: 'top',
        targetType: 'diagnostics_retention',
        targetId: 'global',
        action: 'diagnostics.retention_cleanup',
        metadata: {
          deleted_samples: cleanupRes.deleted_samples,
          deleted_aged_groups: cleanupRes.deleted_aged_groups,
          deleted_overflow_groups: cleanupRes.deleted_overflow_groups,
          notes_deleted: 0
        }
      });
    });

    return sendJson(200, cleanupRes);
  }

  if (normPath === '/api/admin/diagnostics/notify-tickets') {
    if (method !== 'POST') return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'POST' });
    const groupId = typeof body?.group_id === 'string' ? body.group_id.trim() : '';
    const mode = typeof body?.mode === 'string' ? body.mode.trim().toLowerCase() : 'preview';
    const rawMessage = typeof body?.message === 'string' ? body.message.trim() : '';
    const confirmed = body?.confirmed === true;

    if (!UUID_RE.test(groupId)) {
      return sendJson(400, { error: 'Valid diagnostic incident group_id is required.' });
    }
    if (mode !== 'preview' && mode !== 'send') {
      return sendJson(400, { error: 'mode must be preview or send.' });
    }
    if (rawMessage.length < 10 || rawMessage.length > 800) {
      return sendJson(400, { error: 'Reviewed public update message must be 10–800 characters.' });
    }
    const sanitizedMessage = sanitizeDiagnosticText(rawMessage, 800, '');
    if (sanitizedMessage.length < 8) {
      return sendJson(400, { error: 'Enter a clear plain-language public update without secrets or raw tokens.' });
    }
    if (mode === 'send' && !confirmed) {
      return sendJson(400, {
        error: 'Preview recipients first and pass confirmed: true to post the public update to linked open tickets.',
        code: 'CONFIRMATION_REQUIRED'
      });
    }

    const dedupeKey = `diag_upd:${groupId}:${sha256Hex(sanitizedMessage).slice(0, 16)}`;

    const txRes = await withTransaction(dbAdapter, async tx => {
      const verified = await reverifyModeratorInTx(tx, ctx);
      if (!verified.ok) return { status: verified.status, body: { error: verified.error } };
      await enableAdminTxGuards(tx, ctx);
      const isTop = verified.actorRole === 'top';

      const { rows: gRows } = await tx.query(
        'SELECT id, title, mod_visible, triage_status FROM diagnostic_incident_groups WHERE id = $1 LIMIT 1',
        [groupId]
      );
      if (!gRows.length) return { status: 404, body: { error: 'Diagnostic incident not found.' } };
      const group = gRows[0];
      if (!isTop && !group.mod_visible) {
        return {
          status: 403,
          body: {
            error: 'Admin: Top authorization is required to notify tickets on restricted security/provider incidents.',
            code: 'TOP_DIAGNOSTIC_SCOPE_REQUIRED'
          }
        };
      }

      const { rows: allLinked } = await tx.query(
        `SELECT dl.issue_id,
                si.ticket_number,
                si.subject,
                si.status,
                si.reporter_context,
                si.reporter_user_id,
                COALESCE(si.reporter_email, au.email_normalized) AS reporter_email,
                EXISTS (
                  SELECT 1
                  FROM support_issue_notes n
                  WHERE n.issue_id = si.id
                    AND n.idempotency_key = $2
                ) AS already_sent
         FROM support_issue_diagnostic_links dl
         JOIN support_issues si ON si.id = dl.issue_id
         LEFT JOIN auth_users au ON au.id = si.reporter_user_id
         WHERE dl.diagnostic_group_id = $1
           AND dl.unlinked_at IS NULL
           AND dl.link_state = 'confirmed'
         ORDER BY si.created_at ASC
         LIMIT 50`,
        [groupId, dedupeKey]
      );

      const openActive = allLinked.filter(r =>
        r.status === 'open' || r.status === 'in_review' || r.status === 'in_progress' || r.status === 'waiting'
      );
      const excludedInactiveCount = allLinked.length - openActive.length;
      const cappedOpen = openActive.slice(0, 25);
      const recipientsPreview = cappedOpen.map(r => ({
        issue_id: r.issue_id,
        ticket_number: r.ticket_number,
        subject: r.subject,
        status: r.status,
        status_label: SUPPORT_STATUS_LABELS[r.status] || r.status,
        reporter_context: r.reporter_context,
        recipient_masked: maskEmail(r.reporter_email || ''),
        already_sent: Boolean(r.already_sent)
      }));
      const pendingTargets = cappedOpen.filter(r => !r.already_sent);

      if (mode === 'preview') {
        return {
          status: 200,
          body: {
            ok: true,
            mode: 'preview',
            group_id: groupId,
            dedupe_key: dedupeKey,
            sanitized_message: sanitizedMessage,
            recipient_count: pendingTargets.length,
            already_sent_count: cappedOpen.length - pendingTargets.length,
            excluded_inactive_count: excludedInactiveCount,
            recipients: recipientsPreview
          }
        };
      }

      const publicTeamLabel = formatPublicTeamAuthorLabel(verified.actorRole);
      const postedTargets = [];

      for (const target of pendingTargets) {
        const insNote = await tx.query(
          `INSERT INTO support_issue_notes (
             issue_id, author_user_id, author_role, author_display_label, visibility, body, idempotency_key
           )
           VALUES ($1, $2, $3, $4, 'reporter_visible', $5, $6)
           ON CONFLICT (issue_id, author_user_id, idempotency_key) WHERE idempotency_key IS NOT NULL
           DO NOTHING
           RETURNING id`,
          [target.issue_id, ctx.user.id, verified.actorRole, publicTeamLabel, sanitizedMessage, dedupeKey]
        );
        if (!insNote.rows.length) continue;

        await tx.query(
          `INSERT INTO support_issue_events (
             issue_id, event_type, visibility, actor_user_id, actor_role, public_actor_label, summary, metadata
           )
           VALUES ($1, 'public_incident_update', 'reporter_visible', $2, $3, $4, $5, $6::jsonb)`,
          [
            target.issue_id,
            ctx.user.id,
            verified.actorRole,
            publicTeamLabel,
            `${publicTeamLabel} posted a status update on a linked service issue.`,
            JSON.stringify({ diagnostic_group_id: groupId })
          ]
        );

        await tx.query(
          `UPDATE support_issues
           SET last_public_staff_activity_at = now(),
               last_activity_at = now(),
               staff_last_read_at = now(),
               waiting_for_team = false,
               updated_at = now()
           WHERE id = $1`,
          [target.issue_id]
        );

        postedTargets.push(target);
      }

      await recordAuditLog(tx, {
        actorId: ctx.user.id,
        actorRole: verified.actorRole,
        targetType: 'diagnostic_incident',
        targetId: groupId,
        action: 'diagnostics.notify_linked_tickets',
        metadata: {
          posted_count: postedTargets.length,
          already_sent_count: cappedOpen.length - pendingTargets.length,
          excluded_inactive_count: excludedInactiveCount,
          tickets: postedTargets.map(t => t.ticket_number)
        }
      });

      return {
        status: 200,
        postedTargets,
        alreadySentCount: cappedOpen.length - pendingTargets.length,
        excludedInactiveCount,
        recipientsPreview
      };
    });

    if (txRes.body) {
      return sendJson(txRes.status, txRes.body);
    }

    const deliverySummaries = [];
    for (const target of txRes.postedTargets || []) {
      const notifRes = await recordAndDispatchSupportNotification({
        dbAdapter,
        issueId: target.issue_id,
        ticketNumber: target.ticket_number,
        recipientUserId: target.reporter_user_id,
        recipientEmail: target.reporter_email || '',
        eventKind: 'linked_incident_update',
        dedupeKey,
        statusLabel: SUPPORT_STATUS_LABELS[target.status] || target.status
      });
      deliverySummaries.push({
        issue_id: target.issue_id,
        ticket_number: target.ticket_number,
        notification_delivery: notifRes.notification_delivery,
        delivery_status: notifRes.delivery_status
      });
    }

    return sendJson(200, {
      ok: true,
      mode: 'send',
      group_id: groupId,
      dedupe_key: dedupeKey,
      posted_count: (txRes.postedTargets || []).length,
      already_sent_count: txRes.alreadySentCount || 0,
      excluded_inactive_count: txRes.excludedInactiveCount || 0,
      deliveries: deliverySummaries
    });
  }

  return sendJson(404, { error: 'Not found' });
}
