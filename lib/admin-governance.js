// Shared Validation, Evidence Magic-Byte Inspection, Rate-Limit & Notification Helpers
// for BiteShark Administration, Vendor Onboarding, Invitations, Moderation & Support Issues.

import crypto from 'node:crypto';
import { ROLE_LABELS } from './authz.js';
import { withTransaction } from './db-tx.js';

export const INVITATION_TTL_MS = 72 * 60 * 60 * 1000; // 72 hours
export const MAX_EVIDENCE_BYTES = 512 * 1024; // 512 KiB per attachment
export const MAX_EVIDENCE_PER_APPLICATION = 3;
export const MAX_MOD_TEMP_RESTRICTION_HOURS = 72;

export const INVITATION_ROLE_LABELS = Object.freeze({
  customer: ROLE_LABELS.customer,
  vendor_owner: ROLE_LABELS.owner,
  vendor_staff: ROLE_LABELS.staff,
  mod: ROLE_LABELS.mod,
  top: ROLE_LABELS.top
});

const EMAIL_SIMPLE_RE = /^[^\s@<>,"';:\\]+@[^\s@<>,"';:\\]+\.[^\s@<>,"';:\\]{2,}$/;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,62}$/;
const SAFE_IDEMPOTENCY_RE = /^[A-Za-z0-9._:-]{6,128}$/;

export function sha256Hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function escapeSqlLike(raw) {
  return String(raw || '').replace(/[\\%_]/g, '\\$&');
}

export function maskEmailForModerator(email) {
  const s = String(email || '').trim();
  const at = s.indexOf('@');
  if (at <= 0) return '***';
  const local = s.slice(0, at);
  const dom = s.slice(at + 1);
  return `${local.slice(0, Math.min(2, local.length))}***@${dom}`;
}

export function generateOpaqueToken(byteLen = 32) {
  const raw = crypto.randomBytes(byteLen).toString('base64url');
  return {
    rawToken: raw,
    tokenSha256: sha256Hex(raw)
  };
}

export function normalizeEmailStrict(rawEmail) {
  if (typeof rawEmail !== 'string') return null;
  const trimmed = rawEmail.trim().toLowerCase();
  if (trimmed.length < 3 || trimmed.length > 254) return null;
  const at = trimmed.indexOf('@');
  if (at < 1 || at !== trimmed.lastIndexOf('@')) return null;
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  if (local.length < 1 || local.length > 64 || domain.length < 3 || domain.length > 253) return null;
  if (!EMAIL_SIMPLE_RE.test(trimmed)) return null;
  return trimmed;
}

export function normalizeOptionalIdempotencyKey(raw) {
  if (raw === undefined || raw === null || raw === '') return { ok: true, value: null };
  if (typeof raw !== 'string') return { ok: false, error: 'idempotency_key must be a string.' };
  const trimmed = raw.trim();
  if (!SAFE_IDEMPOTENCY_RE.test(trimmed)) {
    return { ok: false, error: 'idempotency_key must be 6–128 ASCII token characters.' };
  }
  return { ok: true, value: trimmed };
}

export function parseBoundedPagination(query = {}, defaultSize = 20, maxSize = 50) {
  const rawPage = Number(query.page);
  const rawSize = Number(query.page_size || query.limit);
  const page = Number.isInteger(rawPage) && rawPage >= 1 ? Math.min(rawPage, 10000) : 1;
  const pageSize =
    Number.isInteger(rawSize) && rawSize >= 1 ? Math.min(rawSize, maxSize) : defaultSize;
  const offset = (page - 1) * pageSize;
  return { page, pageSize, offset };
}

export function sanitizeFilename(rawName) {
  const base = String(rawName || 'evidence')
    .replace(/\\/g, '/')
    .split('/')
    .pop()
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 80);
  return base || 'evidence.bin';
}

/**
 * Verifies binary magic bytes match an allowlisted non-executable document/image type
 * (`application/pdf`, `image/png`, `image/jpeg`, `image/webp`).
 * Explicitly rejects HTML, SVG, scripts, archives, or polyglot headers.
 */
export function verifyEvidenceBufferAndMime(buf, declaredMime) {
  if (!Buffer.isBuffer(buf) || buf.length < 16) {
    return { ok: false, error: 'Evidence file is empty or smaller than minimum valid header size (16 bytes).' };
  }
  if (buf.length > MAX_EVIDENCE_BYTES) {
    return { ok: false, error: `Evidence file exceeds maximum allowed size (${MAX_EVIDENCE_BYTES / 1024} KiB).` };
  }

  const mime = typeof declaredMime === 'string' ? declaredMime.trim().toLowerCase() : '';

  // Detect actual magic bytes
  const isPdf = buf.subarray(0, 5).toString('ascii') === '%PDF-';
  const isPng = buf.subarray(0, 8).toString('hex') === '89504e470d0a1a0a';
  const isJpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const isWebp =
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP';

  let detectedMime = null;
  if (isPdf) detectedMime = 'application/pdf';
  else if (isPng) detectedMime = 'image/png';
  else if (isJpeg) detectedMime = 'image/jpeg';
  else if (isWebp) detectedMime = 'image/webp';

  if (!detectedMime) {
    return {
      ok: false,
      error: 'Unsupported or executable file format rejected. Upload only PDF, PNG, JPEG, or WebP files.'
    };
  }
  if (mime && mime !== detectedMime) {
    return {
      ok: false,
      error: `Declared MIME type (${mime}) does not match file header (${detectedMime}).`
    };
  }

  return {
    ok: true,
    mimeType: detectedMime,
    byteSize: buf.length,
    sha256Hex: sha256Hex(buf)
  };
}

export function validateOptionalHttpUrl(rawUrl) {
  if (rawUrl === undefined || rawUrl === null || String(rawUrl).trim() === '') {
    return { ok: true, value: null };
  }
  const s = String(rawUrl).trim();
  if (s.length > 300) {
    return { ok: false, error: 'URL cannot exceed 300 characters.' };
  }
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') {
      return { ok: false, error: 'URL must use http:// or https://.' };
    }
    return { ok: true, value: u.toString() };
  } catch {
    return { ok: false, error: 'Enter a valid http:// or https:// URL.' };
  }
}

export function validateProposedSlug(rawSlug) {
  if (typeof rawSlug !== 'string') return null;
  const s = rawSlug.trim().toLowerCase();
  if (!SLUG_RE.test(s)) return null;
  return s;
}

export function computeIssueSlaDueAt(severity, now = new Date()) {
  const hoursBySeverity = {
    urgent: 4,
    high: 12,
    normal: 48,
    low: 96
  };
  const hrs = hoursBySeverity[severity] || 48;
  return new Date(now.getTime() + hrs * 60 * 60 * 1000).toISOString();
}

export async function recordTestSafeNotificationInTx(
  tx,
  { recipientUserId = null, recipientEmail = null, eventKind, subject, summary }
) {
  await tx.query("SELECT set_config('app.admin_portal', 'true', true)");
  await tx.query(
    `INSERT INTO admin_notification_outbox (
       recipient_user_id, recipient_email, event_kind, subject, summary, delivery_status
     )
     VALUES ($1, $2, $3, $4, $5, 'recorded_test_safe')`,
    [
      recipientUserId || null,
      recipientEmail ? String(recipientEmail).trim().toLowerCase() : null,
      String(eventKind).slice(0, 80),
      String(subject).slice(0, 160),
      String(summary).slice(0, 800)
    ]
  );
}

export async function cleanupExpiredGovernanceRecords(db, { now = new Date() } = {}) {
  const nowIso = now.toISOString();
  const outboxCutoffIso = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
  return withTransaction(db, async tx => {
    await tx.query("SELECT set_config('app.admin_portal', 'true', true)");
    let deletedEvidence = 0;
    let deletedOutbox = 0;
    await tx.query('SAVEPOINT sp_gov_ev_cleanup');
    try {
      const evDel = await tx.query(
        `DELETE FROM vendor_application_evidence
         WHERE retention_expires_at <= $1
            OR (deleted_at IS NOT NULL AND deleted_at < $2)`,
        [nowIso, outboxCutoffIso]
      );
      await tx.query('RELEASE SAVEPOINT sp_gov_ev_cleanup');
      deletedEvidence = Number(evDel.rowCount || 0);
    } catch (err) {
      await tx.query('ROLLBACK TO SAVEPOINT sp_gov_ev_cleanup').catch(() => {});
      if (err?.code !== '42P01') throw err;
    }

    await tx.query('SAVEPOINT sp_gov_outbox_cleanup');
    try {
      const obDel = await tx.query(
        `DELETE FROM admin_notification_outbox WHERE created_at < $1`,
        [outboxCutoffIso]
      );
      await tx.query('RELEASE SAVEPOINT sp_gov_outbox_cleanup');
      deletedOutbox = Number(obDel.rowCount || 0);
    } catch (err) {
      await tx.query('ROLLBACK TO SAVEPOINT sp_gov_outbox_cleanup').catch(() => {});
      if (err?.code !== '42P01') throw err;
    }

    return {
      ok: true,
      purged_expired_evidence: deletedEvidence,
      purged_aged_outbox: deletedOutbox
    };
  });
}

export async function consumeGovernanceRateLimit(
  tx,
  { scope, subjectKey, maxHits, windowSeconds = 900, now = new Date() }
) {
  await tx.query("SELECT set_config('app.auth_internal', 'true', true)");
  const bucketMs = windowSeconds * 1000;
  const windowStartIso = new Date(Math.floor(now.getTime() / bucketMs) * bucketMs).toISOString();
  const rlCutoffIso = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const bucketKey = `gov:${scope}:${sha256Hex(String(subjectKey)).slice(0, 40)}`;
  await tx.query('DELETE FROM auth_rate_limits WHERE window_start < $1', [rlCutoffIso]);
  const { rows } = await tx.query(
    `INSERT INTO auth_rate_limits (bucket_key, window_start, hit_count)
     VALUES ($1, $2, 1)
     ON CONFLICT (bucket_key, window_start) DO UPDATE
       SET hit_count = auth_rate_limits.hit_count + 1
     RETURNING hit_count`,
    [bucketKey, windowStartIso]
  );
  const hits = Number(rows[0]?.hit_count || 1);
  if (hits > maxHits) {
    const elapsedSec = Math.floor((now.getTime() % bucketMs) / 1000);
    return { allowed: false, retryAfterSeconds: Math.max(1, windowSeconds - elapsedSec) };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

export const INVITATION_DELIVERY_LABELS = Object.freeze({
  pending_approval: 'Pending approval',
  queued: 'Queued',
  provider_accepted: 'Accepted by provider',
  delivery_failed: 'Delivery failed',
  delivery_uncertain: 'Delivery uncertain (provider timeout)',
  staging_mailbox_only: 'Staging mailbox (test mode)',
  not_requested: 'Historical (not emailed)',
  superseded: 'Superseded'
});

export async function recordInvitationEventInTx(
  tx,
  {
    invitationId,
    eventType,
    actorId = null,
    actorRole = null,
    deliveryMode = null,
    providerStatus = null,
    providerMessageId = null,
    errorCode = null,
    correlationId = null,
    releaseSha = null,
    note = null
  }
) {
  await tx.query("SELECT set_config('app.admin_portal', 'true', true)");
  await tx.query('SAVEPOINT inv_event_write');
  try {
    await tx.query(
      `INSERT INTO account_invitation_events (
         invitation_id, event_type, actor_id, actor_role, delivery_mode,
         provider_status, provider_message_id, error_code, correlation_id, release_sha, note
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        invitationId,
        String(eventType),
        actorId ? String(actorId).slice(0, 128) : null,
        actorRole ? String(actorRole).slice(0, 40) : null,
        deliveryMode ? String(deliveryMode).slice(0, 32) : null,
        providerStatus !== null && providerStatus !== undefined ? Number(providerStatus) : null,
        providerMessageId ? String(providerMessageId).slice(0, 128) : null,
        errorCode ? String(errorCode).replace(/[^A-Za-z0-9_.:-]/g, '_').slice(0, 80) : null,
        correlationId && /^corr_[0-9a-f]{12,32}$/.test(String(correlationId)) ? String(correlationId) : null,
        releaseSha ? String(releaseSha).slice(0, 64) : null,
        note ? String(note).slice(0, 500) : null
      ]
    );
    await tx.query('RELEASE SAVEPOINT inv_event_write');
  } catch (err) {
    await tx.query('ROLLBACK TO SAVEPOINT inv_event_write').catch(() => {});
    if (err?.code !== '42P01') throw err;
  }
}

export function formatInvitationRowForAdmin(row, { events = [], nowMs = Date.now(), actorRole = 'top' } = {}) {
  const isTop = actorRole === 'top';
  const isCustomerInvite = row.requested_role === 'customer' || row.requested_role === 'customer_access';
  const safeEmail =
    isTop || !isCustomerInvite ? row.email_normalized : maskEmailForModerator(row.email_normalized);
  const isExpired =
    row.status === 'expired' ||
    (row.status === 'issued' && row.expires_at && new Date(row.expires_at).getTime() <= nowMs);
  const effectiveStatus = isExpired && row.status === 'issued' ? 'expired' : row.status;
  const roleLabel = INVITATION_ROLE_LABELS[row.requested_role] || row.requested_role;
  const deliveryStatus = row.delivery_status || (row.status === 'pending_top_approval' ? 'pending_approval' : 'not_requested');
  const acceptedByRecipient = row.status === 'consumed' || Boolean(row.consumed_at);

  let approvalStateLabel = 'Authorized at issuance';
  if (row.status === 'pending_top_approval') {
    approvalStateLabel = 'Pending Admin: Top approval';
  } else if (row.status === 'rejected') {
    approvalStateLabel = 'Rejected by Admin: Top';
  } else if (row.approved_by) {
    approvalStateLabel = 'Approved by Admin: Top';
  }

  let acceptanceLabel = 'Awaiting recipient acceptance';
  if (acceptedByRecipient) {
    acceptanceLabel = 'Accepted by recipient';
  } else if (row.status === 'pending_top_approval') {
    acceptanceLabel = 'Pending Admin: Top approval';
  } else if (row.status === 'revoked') {
    acceptanceLabel = deliveryStatus === 'superseded' ? 'Superseded by newer invitation' : 'Revoked before acceptance';
  } else if (row.status === 'rejected') {
    acceptanceLabel = 'Rejected';
  } else if (isExpired) {
    acceptanceLabel = 'Expired before acceptance';
  }

  return {
    id: row.id,
    email: safeEmail,
    email_normalized: safeEmail,
    requested_role: row.requested_role,
    role_label: roleLabel,
    requested_role_label: roleLabel,
    vendor_id: row.vendor_id || null,
    vendor_name: row.vendor_name || null,
    status: effectiveStatus,
    persisted_status: row.status,
    is_expired: Boolean(isExpired),
    approval_required: row.status === 'pending_top_approval',
    approval_state_label: approvalStateLabel,
    delivery_status: deliveryStatus,
    delivery_status_label: INVITATION_DELIVERY_LABELS[deliveryStatus] || deliveryStatus,
    delivery_mode: row.delivery_mode || null,
    token_version: Number(row.token_version || 1),
    send_attempt_count: Number(row.send_attempt_count || 0),
    last_sent_at: row.last_sent_at || null,
    last_sent_by: row.last_sent_by || null,
    last_attempt_at: row.last_attempt_at || null,
    provider_status: isTop ? (row.provider_status ?? null) : null,
    provider_message_id: isTop ? (row.provider_message_id || null) : null,
    last_error_code: row.last_error_code || null,
    last_correlation_id: row.last_correlation_id || null,
    accepted_by_recipient: acceptedByRecipient,
    acceptance_label: acceptanceLabel,
    initiated_by: row.initiated_by,
    initiator_role: row.initiator_role,
    approved_by: row.approved_by || null,
    approved_at: row.approved_at || null,
    approval_reason: row.approval_reason || null,
    rejected_by: row.rejected_by || null,
    rejected_at: row.rejected_at || null,
    rejection_reason: row.rejection_reason || null,
    consumed_by_user_id: row.consumed_by_user_id || null,
    consumed_at: row.consumed_at || null,
    revoked_by: row.revoked_by || null,
    revoked_at: row.revoked_at || null,
    revoke_reason: row.revoke_reason || null,
    replaced_by_invitation_id: row.replaced_by_invitation_id || null,
    note: row.invite_note || null,
    invite_note: row.invite_note || null,
    expires_at: row.expires_at || null,
    created_at: row.created_at,
    updated_at: row.updated_at || row.created_at,
    events: Array.isArray(events)
      ? events.map(ev => ({
          id: Number(ev.id),
          event_type: ev.event_type,
          actor_id: ev.actor_id || null,
          actor_role: ev.actor_role || null,
          delivery_mode: ev.delivery_mode || null,
          provider_status: isTop ? (ev.provider_status ?? null) : null,
          provider_message_id: isTop ? (ev.provider_message_id || null) : null,
          error_code: ev.error_code || null,
          correlation_id: ev.correlation_id || null,
          release_sha: ev.release_sha || null,
          note: ev.note || null,
          created_at: ev.created_at
        }))
      : []
  };
}
