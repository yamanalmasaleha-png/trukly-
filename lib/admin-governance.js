// Shared Validation, Evidence Magic-Byte Inspection, Rate-Limit & Notification Helpers
// for BiteShark Administration, Vendor Onboarding, Invitations, Moderation & Support Issues.

import crypto from 'node:crypto';
import { ROLE_LABELS } from './authz.js';

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

export async function consumeGovernanceRateLimit(
  tx,
  { scope, subjectKey, maxHits, windowSeconds = 900, now = new Date() }
) {
  await tx.query("SELECT set_config('app.auth_internal', 'true', true)");
  const bucketMs = windowSeconds * 1000;
  const windowStartIso = new Date(Math.floor(now.getTime() / bucketMs) * bucketMs).toISOString();
  const bucketKey = `gov:${scope}:${sha256Hex(String(subjectKey)).slice(0, 40)}`;
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
