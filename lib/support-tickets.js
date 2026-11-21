// BiteShark Connected Support & Feedback Domain Policy, Lifecycle, Redaction & Diagnostic Link Helpers
//
// Invariants:
//   1. Builds directly on `support_issues` and `support_issue_notes` (zero competing ticket systems).
//   2. Keeps Support Tickets, Diagnostic Incidents, and Internal Staff Notes strictly separated.
//   3. Preserves immutable `reporter_urgency` separately from staff-managed `severity` (priority).
//   4. Enforces `sharing_scope` (`personal` vs `vendor_service`): customer tickets and `account_access`
//      tickets are ALWAYS `personal` so vendor membership never exposes private account conversations.
//   5. Never exposes staff personal email addresses or internal user IDs to customers or vendors.

import {
  ALLOWED_FEATURE_KEYS,
  normalizeCorrelationId,
  normalizeReleaseSha,
  sanitizeDiagnosticText,
  sanitizeIdentifierCode,
  sanitizeOperationName
} from './diagnostics.js';
import { computeIssueSlaDueAt } from './admin-governance.js';

export const VENDOR_SUPPORT_CATEGORIES = Object.freeze([
  { key: 'account_access', label: 'Account or access', forcePersonal: true, requiresTechnical: false },
  { key: 'listing_hours_location', label: 'Listing, hours or location', forcePersonal: false, requiresTechnical: false },
  { key: 'event_inquiries', label: 'Event inquiries', forcePersonal: false, requiresTechnical: false },
  { key: 'pager_notifications', label: 'Pickup pager or notifications', forcePersonal: false, requiresTechnical: false },
  { key: 'technical_problem', label: 'Technical problem', forcePersonal: false, requiresTechnical: true },
  { key: 'question_help', label: 'Question or help', forcePersonal: false, requiresTechnical: false },
  { key: 'suggestion_feedback', label: 'Suggestion or friendly feedback', forcePersonal: false, requiresTechnical: false },
  { key: 'other', label: 'Other', forcePersonal: false, requiresTechnical: false }
]);

export const CATEGORY_LABELS = Object.freeze({
  account_access: 'Account or access',
  listing_hours_location: 'Listing, hours or location',
  listing_accuracy: 'Listing accuracy',
  event_inquiries: 'Event inquiries',
  booking_dispute: 'Event inquiry / booking issue',
  pager_notifications: 'Pickup pager or notifications',
  pager_issue: 'Pickup pager issue',
  technical_problem: 'Technical problem',
  question_help: 'Question or help',
  suggestion_feedback: 'Suggestion or friendly feedback',
  vendor_conduct: 'Vendor concern',
  abuse_report: 'Safety or abuse report',
  other: 'Other'
});

export const VALID_DB_CATEGORIES = new Set(Object.keys(CATEGORY_LABELS));

export const CATEGORY_ALIASES = Object.freeze({
  booking_issue: 'booking_dispute',
  vendor_dispute: 'vendor_conduct',
  safety_concern: 'vendor_conduct',
  privacy_request: 'account_access',
  accessibility_support: 'account_access'
});

export const REPORTER_URGENCY_LABELS = Object.freeze({
  critical: 'Critical — service cannot continue',
  high: 'High — major disruption',
  normal: 'Normal — something needs attention',
  low: 'Low — minor issue',
  feedback: 'Feedback — idea or suggestion'
});

export const VALID_REPORTER_URGENCIES = new Set(Object.keys(REPORTER_URGENCY_LABELS));

export const STAFF_PRIORITY_LABELS = Object.freeze({
  urgent: 'Urgent (4h internal target)',
  high: 'High (24h internal target)',
  normal: 'Normal (72h internal target)',
  low: 'Low (7d internal target)'
});

export const VALID_STAFF_PRIORITIES = new Set(Object.keys(STAFF_PRIORITY_LABELS));

export const SUPPORT_STATUS_LABELS = Object.freeze({
  open: 'Received',
  in_review: 'In review',
  in_progress: 'In progress',
  waiting: 'Waiting for your reply',
  resolved: 'Resolved',
  closed: 'Closed'
});

export const VALID_SUPPORT_STATUSES = new Set(Object.keys(SUPPORT_STATUS_LABELS));

const COARSE_PLATFORMS = new Set(['Desktop', 'Mobile', 'Tablet']);
const COARSE_BROWSERS = new Set(['Chromium', 'Firefox', 'Safari', 'Mobile WebKit', 'Standard Browser']);
const COARSE_VIEWPORTS = new Set(['Compact (<480px)', 'Medium (480–1023px)', 'Wide (1024px+)']);

export function normalizeSupportStatusInput(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().toLowerCase();
  if (s === 'received') return 'open';
  if (s === 'waiting_for_reply' || s === 'waiting_on_reporter') return 'waiting';
  if (VALID_SUPPORT_STATUSES.has(s)) return s;
  return null;
}

export function normalizeSupportCategoryInput(rawCat, entryKind = 'problem', affectedFeature = null) {
  const trimmed = typeof rawCat === 'string' ? rawCat.trim().toLowerCase() : '';
  if (trimmed) {
    const mapped = CATEGORY_ALIASES[trimmed] || trimmed;
    if (VALID_DB_CATEGORIES.has(mapped)) return mapped;
    return null;
  }
  if (entryKind === 'suggestion') return 'suggestion_feedback';
  if (entryKind === 'question') return 'question_help';
  if (affectedFeature === 'bookings_inquiries') return 'event_inquiries';
  if (affectedFeature === 'pagers' || affectedFeature === 'push_delivery') return 'pager_notifications';
  if (affectedFeature === 'auth_login' || affectedFeature === 'invitations') return 'account_access';
  if (affectedFeature === 'vendor_publishing' || affectedFeature === 'vendor_schedules') return 'listing_hours_location';
  return 'technical_problem';
}

export function resolveInitialUrgencyAndPriority({ rawUrgency, rawSeverity, entryKind, category }) {
  const u = typeof rawUrgency === 'string' ? rawUrgency.trim().toLowerCase() : '';
  const sev = typeof rawSeverity === 'string' ? rawSeverity.trim().toLowerCase() : '';

  let reporterUrgency = 'normal';
  if (u && VALID_REPORTER_URGENCIES.has(u)) {
    reporterUrgency = u;
  } else if (u === 'urgent') {
    reporterUrgency = 'critical';
  } else if (sev && VALID_STAFF_PRIORITIES.has(sev)) {
    reporterUrgency = sev === 'urgent' ? 'critical' : sev;
  } else if (entryKind === 'suggestion' || category === 'suggestion_feedback') {
    reporterUrgency = 'feedback';
  }

  let staffPriority = 'normal';
  if (sev && VALID_STAFF_PRIORITIES.has(sev)) {
    staffPriority = sev;
  } else if (reporterUrgency === 'critical') {
    staffPriority = 'urgent';
  } else if (reporterUrgency === 'high') {
    staffPriority = 'high';
  } else if (reporterUrgency === 'low' || reporterUrgency === 'feedback') {
    staffPriority = 'low';
  }

  const slaDueAt = computeIssueSlaDueAt(staffPriority);
  return { reporterUrgency, staffPriority, slaDueAt };
}

export function buildAutoSubjectFromDescription(entryKind, category, description) {
  const clean = String(description || '')
    .replace(/\s+/g, ' ')
    .trim();
  const prefix =
    entryKind === 'suggestion'
      ? 'Suggestion: '
      : entryKind === 'question'
        ? 'Question: '
        : `${CATEGORY_LABELS[category] || 'Support'}: `;
  const maxRem = Math.max(20, 96 - prefix.length);
  let snippet = clean.slice(0, maxRem).trim();
  if (clean.length > maxRem) {
    const sp = snippet.lastIndexOf(' ');
    if (sp > 18) snippet = snippet.slice(0, sp);
    snippet = `${snippet}…`;
  }
  const combined = `${prefix}${snippet}`.slice(0, 140);
  return combined.length >= 5 ? combined : `${prefix}Support request`.slice(0, 140);
}

export function sanitizeCoarseDeviceContext(rawInput) {
  if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) return null;
  const plat = typeof rawInput.platform === 'string' && COARSE_PLATFORMS.has(rawInput.platform) ? rawInput.platform : null;
  const br = typeof rawInput.browser === 'string' && COARSE_BROWSERS.has(rawInput.browser) ? rawInput.browser : null;
  const vp = typeof rawInput.viewport === 'string' && COARSE_VIEWPORTS.has(rawInput.viewport) ? rawInput.viewport : null;
  const parts = [plat, br, vp].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

export function sanitizeSupportContextFields(body = {}, serverReleaseSha = 'dev') {
  const includeOptional = body.include_technical_context !== false;
  const rawFeat = typeof body.affected_feature === 'string' ? body.affected_feature.trim().toLowerCase() : '';
  const affectedFeature =
    ALLOWED_FEATURE_KEYS.has(rawFeat) && rawFeat !== 'synthetic_verification' ? rawFeat : null;

  const errorCorrelationId = includeOptional ? normalizeCorrelationId(body.error_correlation_id) : null;
  const operationName =
    includeOptional && typeof body.operation_name === 'string' && body.operation_name.trim()
      ? sanitizeOperationName(body.operation_name.trim(), '') || null
      : null;

  let reportedOccurredAt = null;
  if (includeOptional && typeof body.reported_occurred_at === 'string' && body.reported_occurred_at.trim()) {
    const parsed = new Date(body.reported_occurred_at.trim());
    const nowMs = Date.now();
    // Accept plausible timestamps within the past 30 days and +5 minutes clock skew
    if (Number.isFinite(parsed.getTime()) && parsed.getTime() >= nowMs - 30 * 86400_000 && parsed.getTime() <= nowMs + 300_000) {
      reportedOccurredAt = parsed.toISOString();
    }
  }

  const clientBuildVersion =
    includeOptional && typeof body.client_build_version === 'string' && body.client_build_version.trim()
      ? sanitizeIdentifierCode(body.client_build_version.trim(), '', 48) || null
      : null;
  const clientLoadedReleaseSha =
    includeOptional && typeof body.client_loaded_release_sha === 'string' && body.client_loaded_release_sha.trim()
      ? normalizeReleaseSha(body.client_loaded_release_sha.trim())
      : null;
  const coarseDeviceInfo = includeOptional ? sanitizeCoarseDeviceContext(body.coarse_device) : null;

  return {
    affectedFeature,
    operationName,
    errorCorrelationId,
    reportedOccurredAt,
    serverReleaseSha: normalizeReleaseSha(serverReleaseSha),
    clientBuildVersion,
    clientLoadedReleaseSha,
    coarseDeviceInfo
  };
}

export function formatPublicTeamAuthorLabel(role, reporterContext = 'customer') {
  const r = String(role || '').toLowerCase();
  if (r === 'top' || r === 'platform_admin') return 'BiteShark Support · Operations Lead';
  if (r === 'mod' || r === 'moderator') return 'BiteShark Support · Support & Moderation';
  if (r === 'vendor') return 'Vendor Team Member';
  if (r === 'customer') return reporterContext === 'vendor' ? 'Vendor Reporter' : 'Reporter';
  return 'BiteShark Support';
}

export function validateStaffStatusTransition(fromStatus, toStatus, actorRole) {
  if (!toStatus || fromStatus === toStatus) return { ok: true };
  if (!VALID_SUPPORT_STATUSES.has(toStatus)) {
    return { ok: false, status: 400, code: 'INVALID_ISSUE_STATUS', error: 'Unsupported support ticket status.' };
  }
  if (fromStatus === 'closed' && toStatus !== 'closed' && actorRole !== 'top') {
    return {
      ok: false,
      status: 403,
      code: 'CLOSED_REOPEN_REQUIRES_TOP',
      error: 'Closed tickets are archived. Only Admin: Top may reopen a closed ticket (or escalate to Top).'
    };
  }
  return { ok: true };
}

export function evaluateAssignmentMutation({
  curIssue,
  currentAssigneeRole,
  currentAssigneeInactive,
  nextAssigneeProvided,
  nextAssigneeId,
  targetAssigneeRecord,
  actorUserId,
  actorRole,
  nextStatus,
  escalateToTop,
  reasonText
}) {
  const isTop = actorRole === 'top';
  const curAssignee = curIssue.assignee_user_id || null;
  const effAssignee = nextAssigneeProvided ? nextAssigneeId : curAssignee;

  // Validate target assignee is an active Mod or Top
  if (nextAssigneeProvided && effAssignee !== null) {
    if (!targetAssigneeRecord || targetAssigneeRecord.is_disabled || !['mod', 'top'].includes(targetAssigneeRecord.admin_level)) {
      return {
        ok: false,
        status: 400,
        code: 'INVALID_ASSIGNEE',
        error: 'Tickets may only be assigned to an active authorized Admin: Mod or Admin: Top team member.'
      };
    }
  }

  // Mod cannot unassign or take over an active Top-assigned or Top-escalated ticket
  if (!isTop) {
    if (curAssignee && curAssignee !== actorUserId && currentAssigneeRole === 'top' && !currentAssigneeInactive && effAssignee !== curAssignee) {
      return {
        ok: false,
        status: 403,
        code: 'TOP_ASSIGNEE_PROTECTED',
        error: 'Only Admin: Top may reassign or unassign a ticket currently owned by an active Admin: Top.'
      };
    }
    if (curIssue.escalated_to_top && escalateToTop === false) {
      return {
        ok: false,
        status: 403,
        code: 'TOP_ESCALATION_PROTECTED',
        error: 'Only Admin: Top may clear a Top-admin escalation flag.'
      };
    }
  }

  // Reassigning between two different staff members (when not self-claiming unassigned) requires a reason
  const isReassigningOther =
    nextAssigneeProvided &&
    curAssignee !== null &&
    effAssignee !== curAssignee &&
    !(effAssignee === actorUserId && currentAssigneeInactive);
  if (isReassigningOther && (!reasonText || reasonText.length < 4)) {
    return {
      ok: false,
      status: 400,
      code: 'REASSIGNMENT_REASON_REQUIRED',
      error: 'Provide a short reason or internal note (at least 4 characters) when reassigning or unassigning an active ticket.'
    };
  }

  // Prevent closing/resolving a ticket assigned to a disabled/demoted admin without reassigning
  const targetClosing = nextStatus === 'resolved' || nextStatus === 'closed';
  if (targetClosing && curAssignee && currentAssigneeInactive && effAssignee === curAssignee) {
    return {
      ok: false,
      status: 409,
      code: 'INACTIVE_ASSIGNEE_REASSIGN_REQUIRED',
      error: 'Current assignee no longer holds active administrator privileges. Reassign this ticket to an active team member before resolving or closing.'
    };
  }

  return { ok: true, effAssignee };
}

export function serializeSupportTicketForReporter(row, { notes = [], events = [], publicDiagnostics = [], viewerUserId = '' } = {}) {
  const lastPubMs = row.last_public_staff_activity_at ? new Date(row.last_public_staff_activity_at).getTime() : 0;
  const lastReadMs = row.reporter_last_read_at ? new Date(row.reporter_last_read_at).getTime() : 0;
  const unreadForReporter =
    row.reporter_user_id === viewerUserId &&
    Number.isFinite(lastPubMs) &&
    lastPubMs > 0 &&
    (!Number.isFinite(lastReadMs) || lastPubMs > lastReadMs);

  const canReopen =
    row.status === 'resolved' &&
    (!row.resolved_at || Date.now() - new Date(row.resolved_at).getTime() <= 30 * 86400_000);

  const safeNotes = notes.map(n => {
    const resolvedLabel =
      n.author_display_label ||
      (n.author_user_id === row.reporter_user_id
        ? 'You'
        : formatPublicTeamAuthorLabel(n.author_role, row.reporter_context));
    return {
      id: n.id,
      issue_id: n.issue_id,
      author_role: n.author_role,
      author_label: resolvedLabel,
      author_display_label: resolvedLabel,
      is_staff: n.author_role === 'mod' || n.author_role === 'top' || n.author_role === 'platform_admin' || n.author_role === 'moderator',
      body: n.body,
      created_at: n.created_at
    };
  });

  const safeEvents = events.map(ev => ({
    id: ev.id,
    event_type: ev.event_type,
    actor_label: ev.public_actor_label || 'BiteShark Support',
    public_actor_label: ev.public_actor_label || 'BiteShark Support',
    summary: ev.summary,
    created_at: ev.created_at
  }));

  const safeDiagNotices = publicDiagnostics.map(d => ({
    summary: d.public_summary,
    public_summary: d.public_summary,
    verification_status: d.verification_status,
    updated_at: d.updated_at
  }));

  return {
    id: row.id,
    ticket_number: row.ticket_number,
    reporter_context: row.reporter_context,
    is_own_ticket: row.reporter_user_id === viewerUserId,
    sharing_scope: row.sharing_scope || 'personal',
    sharing_scope_label:
      row.sharing_scope === 'vendor_service'
        ? 'Shared with authorized team members on this vendor'
        : 'Personal — visible only to your account and BiteShark Support',
    entry_kind: row.entry_kind || 'problem',
    category: row.category,
    category_label: CATEGORY_LABELS[row.category] || row.category,
    reporter_urgency: row.reporter_urgency || 'normal',
    reporter_urgency_label: REPORTER_URGENCY_LABELS[row.reporter_urgency] || row.reporter_urgency,
    // Keep `severity` for backward compatibility while never implying staff internal SLA promises
    severity: row.severity,
    status: row.status,
    status_label: SUPPORT_STATUS_LABELS[row.status] || row.status,
    is_assigned_to_team: Boolean(row.assignee_user_id),
    vendor_id: row.vendor_id || null,
    related_booking_id: row.related_booking_id || null,
    related_review_id: row.related_review_id || null,
    subject: row.subject,
    description: row.description,
    resolution_reason: row.resolution_reason || null,
    affected_feature: row.affected_feature || null,
    error_correlation_id: row.error_correlation_id || null,
    reported_occurred_at: row.reported_occurred_at || null,
    unread_for_reporter: unreadForReporter,
    has_unread_updates: unreadForReporter,
    can_reopen: canReopen,
    can_reply: row.status !== 'closed',
    reopen_count: Number(row.reopen_count || 0),
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_activity_at: row.last_activity_at || row.updated_at,
    resolved_at: row.resolved_at || null,
    closed_at: row.closed_at || null,
    public_diagnostics: safeDiagNotices,
    timeline_events: safeEvents,
    responses: safeNotes,
    notes: safeNotes
  };
}

export async function autoSuggestDiagnosticLinksInTx(tx, { issueId, errorCorrelationId }) {
  const corr = normalizeCorrelationId(errorCorrelationId);
  if (!corr || !issueId) return [];

  await tx.query('SAVEPOINT sp_auto_diag_suggest');
  try {
    await tx.query("SELECT set_config('app.diagnostics_internal', 'true', true)");
    const { rows: matches } = await tx.query(
      `SELECT DISTINCT g.id, g.fingerprint
       FROM diagnostic_incident_groups g
       LEFT JOIN diagnostic_event_samples s ON s.group_id = g.id
       WHERE g.last_correlation_id = $1 OR s.correlation_id = $1
       LIMIT 3`,
      [corr]
    );
    const created = [];
    for (const m of matches) {
      const reason = sanitizeDiagnosticText(
        `Suggested automatically from error reference ${corr} (reference match only — requires staff review; not proof of causation).`,
        240
      );
      const { rows: ins } = await tx.query(
        `INSERT INTO support_issue_diagnostic_links (
           issue_id, diagnostic_group_id, diagnostic_fingerprint, link_state,
           linked_by, linked_by_role, link_reason, public_summary
         )
         VALUES ($1, $2, $3, 'suggested', 'system:correlation_match', 'system', $4, NULL)
         ON CONFLICT (issue_id, diagnostic_group_id) WHERE unlinked_at IS NULL
         DO NOTHING
         RETURNING id, diagnostic_group_id, link_state`,
        [issueId, m.id, m.fingerprint, reason]
      );
      if (ins.length) {
        created.push(ins[0]);
        await tx.query(
          `INSERT INTO support_issue_events (
             issue_id, event_type, visibility, actor_user_id, actor_role, public_actor_label, summary, metadata
           )
           VALUES ($1, 'diagnostic_suggested', 'internal', 'system:correlation_match', 'system', 'System Correlation Helper', $2, $3::jsonb)`,
          [
            issueId,
            `Auto-suggested diagnostic incident match from reference ${corr} (unverified suggestion).`,
            JSON.stringify({ diagnostic_group_id: m.id, correlation_id: corr })
          ]
        );
      }
    }
    await tx.query("SELECT set_config('app.diagnostics_internal', '', true)");
    await tx.query('RELEASE SAVEPOINT sp_auto_diag_suggest');
    return created;
  } catch {
    await tx.query('ROLLBACK TO SAVEPOINT sp_auto_diag_suggest').catch(() => {});
    return [];
  }
}
