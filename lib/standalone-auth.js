import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import { parseCookie, serialize as serializeCookie } from 'cookie';
import { generateSecret, generate as generateOtpToken } from 'otplib';
import { withTransaction } from './db-tx.js';
import { resolveTrustedClientIp } from './client-ip.js';
import { EnvAliasConflictError, findSecurityEnvConflicts, readEnvCompat } from './env-compat.js';
import { recordAuditLog } from './authz.js';
import { AGE_POLICY_VERSION, evaluateMinimumAgeEligibility } from './age-policy.js';
import { recordDiagnosticEvent } from './diagnostics.js';

export const SESSION_COOKIE_NAME = '__Host-truckly_session';
export const AGE_GATE_COOKIE_NAME = '__Host-bs_age_gate';
export const DEFAULT_AGE_GATE_COOLDOWN_SECONDS = 900; // 15 minutes (constant '1' browser cooldown flag; contains no identifier)
export const AUTH_RATE_LIMIT_RETENTION_MS = 24 * 60 * 60 * 1000; // 24 hours for minimized/pseudonymous rate-limit buckets
export const AUTH_TELEMETRY_RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days for sanitized stage telemetry
export const DEFAULT_OTP_TTL_SECONDS = 600; // 10 minutes
export const DEFAULT_OTP_MAX_ATTEMPTS = 5;
export const DEFAULT_SESSION_TTL_SECONDS = 14 * 24 * 60 * 60; // 14 days
export const MAX_SESSION_LIFETIME_SECONDS = 30 * 24 * 60 * 60; // 30 days hard cap
export const MAX_ACTIVE_SESSIONS_PER_USER = 10;

const EPHEMERAL_DEV_SECRET = crypto.randomBytes(32).toString('hex');
const DUMMY_CHALLENGE_ID = '00000000-0000-4000-8000-000000000000';

let customEmailSender = null;
let customDnsResolver = null;

export function setCustomAuthEmailSenderForTests(fn) {
  customEmailSender = typeof fn === 'function' ? fn : null;
}

export function setCustomDnsResolverForTests(resolver) {
  customDnsResolver = resolver && typeof resolver === 'object' ? resolver : null;
}

export function parseConfiguredSenderAddress(rawFrom) {
  if (typeof rawFrom !== 'string') {
    return { valid: false, reason: 'AUTH_EMAIL_FROM must be a non-empty sender address.' };
  }
  const trimmed = rawFrom.trim();
  if (!trimmed || trimmed.length > 320 || /[\r\n\x00-\x1f\x7f]/.test(trimmed)) {
    return { valid: false, reason: 'AUTH_EMAIL_FROM is empty or contains invalid control characters.' };
  }

  let displayName = 'BiteShark';
  let addrCandidate = trimmed;

  const angleMatch = /^([^<>]*)<([^<>]+)>$/.exec(trimmed);
  if (angleMatch) {
    const rawName = angleMatch[1].trim().replace(/^"(.*)"$/, '$1').trim();
    if (rawName) {
      displayName = rawName;
    }
    addrCandidate = angleMatch[2].trim();
  } else if (trimmed.includes('<') || trimmed.includes('>')) {
    return { valid: false, reason: 'AUTH_EMAIL_FROM must be `addr@domain` or `Display Name <addr@domain>`.' };
  }

  const normalizedAddr = normalizeEmail(addrCandidate);
  if (!normalizedAddr) {
    return { valid: false, reason: 'AUTH_EMAIL_FROM does not contain a valid sender email address.' };
  }
  const senderDomain = normalizedAddr.slice(normalizedAddr.indexOf('@') + 1);
  const safeDisplay = displayName.replace(/["\\<>]/g, '').trim() || 'BiteShark';
  return {
    valid: true,
    formattedFrom: `${safeDisplay} <${normalizedAddr}>`,
    senderEmail: normalizedAddr,
    senderDomain,
    displayName: safeDisplay
  };
}

function sha256Hex(input) {
  return crypto.createHash('sha256').update(String(input)).digest('hex');
}

function timingSafeStringMatch(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length < 24 || bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function getRuntimeEnv() {
  return readEnvCompat('ENV', { securityCritical: true }).toLowerCase();
}

function isHostedEnvironment() {
  let env = '';
  try {
    env = getRuntimeEnv();
  } catch (err) {
    if (err instanceof EnvAliasConflictError) return true;
    throw err;
  }
  return env === 'staging' || env === 'production' || process.env.NODE_ENV === 'production';
}

export function getAuthSecret() {
  const raw = readEnvCompat('AUTH_SECRET', { securityCritical: true });
  if (raw.length >= 32) {
    return raw;
  }
  if (isHostedEnvironment()) {
    const err = new Error('BITESHARK_AUTH_SECRET / TRUCKLY_AUTH_SECRET (>= 32 characters) is required in staging and production.');
    err.code = 'AUTH_SECRET_MISSING';
    throw err;
  }
  return EPHEMERAL_DEV_SECRET;
}

export function inspectAuthDeliveryConfig() {
  let env = '';
  let mode = 'disabled';
  try {
    env = getRuntimeEnv();
    mode = readEnvCompat('AUTH_DELIVERY_MODE', { securityCritical: true, defaultValue: 'disabled' }).toLowerCase();
  } catch (err) {
    if (err instanceof EnvAliasConflictError) {
      return { valid: false, enabled: false, mode: 'conflict', reason: err.message };
    }
    throw err;
  }
  const projectId = String(process.env.HATCHABLE_PROJECT_ID || process.env.PROJECT_ID || '').trim();

  if (mode === 'disabled' || mode === '') {
    return { valid: true, enabled: false, mode: 'disabled' };
  }

  if (mode === 'staging_mailbox') {
    let testAllowed = false;
    let mailboxSecret = '';
    let domains;
    let emails;
    try {
      testAllowed = env === 'test' && readEnvCompat('ALLOW_TEST_MAILBOX_IN_TESTS', { securityCritical: true }) === '1';
      mailboxSecret = readEnvCompat('STAGING_MAILBOX_SECRET', { securityCritical: true });
      domains = parseAllowlistedDomains();
      emails = parseAllowlistedEmails();
    } catch (err) {
      if (err instanceof EnvAliasConflictError) {
        return { valid: false, enabled: false, mode, reason: err.message };
      }
      throw err;
    }
    if (projectId === 'proj_MEO518rmLLl0' || env === 'production' || (env !== 'staging' && !testAllowed)) {
      return {
        valid: false,
        enabled: false,
        mode,
        reason: 'staging_mailbox is strictly forbidden outside confirmed isolated staging.'
      };
    }
    if (mailboxSecret.length < 24) {
      return {
        valid: false,
        enabled: false,
        mode,
        reason: 'BITESHARK_STAGING_MAILBOX_SECRET / TRUCKLY_STAGING_MAILBOX_SECRET (>= 24 chars) is required for staging_mailbox.'
      };
    }
    if (domains.size === 0 && emails.size === 0) {
      return {
        valid: false,
        enabled: false,
        mode,
        reason: 'BITESHARK_STAGING_ALLOWED_EMAIL_DOMAINS / TRUCKLY_STAGING_ALLOWED_EMAIL_DOMAINS or ALLOWED_EMAILS must be set for staging_mailbox.'
      };
    }
    return { valid: true, enabled: true, mode: 'staging_mailbox' };
  }

  if (mode === 'resend_https' || mode === 'webhook_https') {
    let apiKey = '';
    let fromAddr = '';
    let endpoint = '';
    try {
      apiKey = readEnvCompat('AUTH_EMAIL_API_KEY', { securityCritical: true });
      fromAddr = readEnvCompat('AUTH_EMAIL_FROM', { securityCritical: true });
      endpoint = readEnvCompat('AUTH_EMAIL_API_URL', {
        securityCritical: true,
        defaultValue: mode === 'resend_https' ? 'https://api.resend.com/emails' : ''
      });
    } catch (err) {
      if (err instanceof EnvAliasConflictError) {
        return { valid: false, enabled: false, mode, reason: err.message };
      }
      throw err;
    }

    let endpointUrl = null;
    if (endpoint && endpoint.startsWith('https://')) {
      try {
        endpointUrl = new URL(endpoint);
      } catch {
        endpointUrl = null;
      }
    }

    const parsedSender = fromAddr
      ? parseConfiguredSenderAddress(fromAddr)
      : customEmailSender
        ? parseConfiguredSenderAddress('BiteShark <login@biteshark.live>')
        : { valid: false, reason: 'AUTH_EMAIL_FROM is required for HTTPS transactional email.' };

    if (!parsedSender.valid) {
      return {
        valid: false,
        enabled: false,
        mode,
        reason: parsedSender.reason
      };
    }

    if (!customEmailSender && (!apiKey || !endpointUrl || endpointUrl.protocol !== 'https:')) {
      return {
        valid: false,
        enabled: false,
        mode,
        reason: 'HTTPS transactional email requires AUTH_EMAIL_API_KEY, AUTH_EMAIL_FROM, and a valid https:// endpoint.'
      };
    }
    return {
      valid: true,
      enabled: true,
      mode,
      endpoint,
      endpointHost: endpointUrl ? endpointUrl.host.toLowerCase() : null,
      apiKey,
      fromAddr: parsedSender.formattedFrom,
      senderEmail: parsedSender.senderEmail,
      senderDomain: parsedSender.senderDomain,
      senderDisplayName: parsedSender.displayName
    };
  }

  return {
    valid: false,
    enabled: false,
    mode,
    reason: `Unrecognized AUTH_DELIVERY_MODE: ${mode}`
  };
}

export function getPublicAuthDeliveryModeSummary() {
  const cfg = inspectAuthDeliveryConfig();
  if (!cfg.valid || !cfg.enabled) {
    return { delivery_mode: 'unavailable', real_email_enabled: false };
  }
  if (cfg.mode === 'staging_mailbox') {
    return { delivery_mode: 'staging_mailbox', real_email_enabled: false };
  }
  return { delivery_mode: 'email', real_email_enabled: true };
}

function parseAllowlistedDomains() {
  const raw = readEnvCompat('STAGING_ALLOWED_EMAIL_DOMAINS', { securityCritical: true });
  const out = new Set();
  if (!raw) return out;
  for (const part of raw.split(',')) {
    const d = part.trim().toLowerCase();
    if (!d || d === '*' || d.includes('*') || !d.includes('.')) continue;
    out.add(d);
  }
  return out;
}

function parseAllowlistedEmails() {
  const raw = readEnvCompat('STAGING_ALLOWED_EMAILS', { securityCritical: true });
  const out = new Set();
  if (!raw) return out;
  for (const part of raw.split(',')) {
    const norm = normalizeEmail(part);
    if (norm) out.add(norm);
  }
  return out;
}

export function hasConfiguredStagingAllowlist() {
  try {
    return parseAllowlistedEmails().size > 0 || parseAllowlistedDomains().size > 0;
  } catch {
    return false;
  }
}

export function isEmailAllowedInStagingMailbox(emailNormalized) {
  const emails = parseAllowlistedEmails();
  if (emails.has(emailNormalized)) return true;
  const atIdx = emailNormalized.lastIndexOf('@');
  if (atIdx <= 0) return false;
  const domain = emailNormalized.slice(atIdx + 1);
  return parseAllowlistedDomains().has(domain);
}

export function normalizeEmail(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().toLowerCase();
  if (trimmed.length < 3 || trimmed.length > 254) return null;
  if (/[\s\x00-\x1f\x7f]/.test(trimmed)) return null;

  const firstAt = trimmed.indexOf('@');
  const lastAt = trimmed.lastIndexOf('@');
  if (firstAt <= 0 || firstAt !== lastAt) return null;

  const local = trimmed.slice(0, firstAt);
  const domain = trimmed.slice(firstAt + 1);
  if (local.length < 1 || local.length > 64 || domain.length < 3 || domain.length > 253) return null;
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) return null;
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)) return null;
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(domain)) {
    return null;
  }

  return trimmed;
}

function computeOtpHmac(secret, emailNormalized, challengeId, code) {
  return crypto
    .createHmac('sha256', Buffer.from(secret, 'utf8'))
    .update(`truckly-otp-v1|${emailNormalized}|${challengeId}|${code}`, 'utf8')
    .digest('hex');
}

function deriveStagingMailboxKey() {
  const authSecret = getAuthSecret();
  const mailboxSecret = readEnvCompat('STAGING_MAILBOX_SECRET', { securityCritical: true });
  return Buffer.from(
    crypto.hkdfSync(
      'sha256',
      Buffer.from(mailboxSecret, 'utf8'),
      Buffer.from(authSecret, 'utf8'),
      Buffer.from('truckly-staging-mailbox-aes256gcm-v1', 'utf8'),
      32
    )
  );
}

function encryptStagingMailboxCode(code, emailNormalized, challengeId) {
  const key = deriveStagingMailboxKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(`${emailNormalized}|${challengeId}`, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(String(code), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertextB64: ciphertext.toString('base64'),
    ivB64: iv.toString('base64'),
    authTagB64: authTag.toString('base64')
  };
}

function decryptStagingMailboxCode({ ciphertextB64, ivB64, authTagB64 }, emailNormalized, challengeId) {
  const key = deriveStagingMailboxKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAAD(Buffer.from(`${emailNormalized}|${challengeId}`, 'utf8'));
  decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));
  const plain = Buffer.concat([decipher.update(Buffer.from(ciphertextB64, 'base64')), decipher.final()]);
  return plain.toString('utf8');
}

async function enableAuthInternalContext(tx) {
  await tx.query("SELECT set_config('app.auth_internal', 'true', true)");
}

export function buildSessionCookieHeader(rawToken, maxAgeSeconds) {
  return serializeCookie(SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: Math.max(0, Math.floor(maxAgeSeconds))
  });
}

export function buildClearedSessionCookieHeader() {
  return serializeCookie(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
    expires: new Date(0)
  });
}

export function buildAgeGateCooldownCookieHeader(maxAgeSeconds = DEFAULT_AGE_GATE_COOLDOWN_SECONDS) {
  return serializeCookie(AGE_GATE_COOKIE_NAME, '1', {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: Math.max(0, Math.floor(maxAgeSeconds))
  });
}

export function hasAgeGateCooldownCookie(req) {
  const cookieHeader = String(req?.headers?.cookie || req?.headers?.Cookie || '');
  if (!cookieHeader) return false;
  const parsed = parseCookie(cookieHeader);
  return parsed[AGE_GATE_COOKIE_NAME] === '1';
}

export function extractRawSessionToken(req) {
  const cookieHeader = String(req?.headers?.cookie || req?.headers?.Cookie || '');
  if (!cookieHeader) return null;
  const parsed = parseCookie(cookieHeader);
  const val = parsed[SESSION_COOKIE_NAME];
  if (typeof val !== 'string') return null;
  const clean = val.trim();
  if (clean.length < 24 || clean.length > 256 || !/^[A-Za-z0-9_-]+$/.test(clean)) {
    return null;
  }
  return clean;
}

/**
 * Protects cookie-authenticated and auth endpoints against Cross-Site Request Forgery (CSRF)
 * and cross-origin mutations.
 */
export function verifySameOriginMutationRequest(req, options = {}) {
  const headers = req?.headers || {};
  const requireAuthClientHeader = Boolean(options.requireAuthClientHeader);

  if (requireAuthClientHeader) {
    const clientHdr = String(
      headers['x-biteshark-client'] ||
        headers['X-BiteShark-Client'] ||
        headers['x-truckly-client'] ||
        headers['X-Truckly-Client'] ||
        ''
    ).trim();
    if (clientHdr !== 'web-auth-v1') {
      return {
        ok: false,
        status: 403,
        code: 'CSRF_CLIENT_HEADER_REQUIRED',
        error: 'Missing required X-BiteShark-Client header.'
      };
    }
  }

  const secFetchSite = String(headers['sec-fetch-site'] || headers['Sec-Fetch-Site'] || '')
    .trim()
    .toLowerCase();
  if (secFetchSite && secFetchSite !== 'same-origin' && secFetchSite !== 'none') {
    return {
      ok: false,
      status: 403,
      code: 'CSRF_CROSS_SITE_BLOCKED',
      error: 'Cross-site state-changing requests are forbidden.'
    };
  }

  const host = String(headers.host || headers.Host || '').trim().toLowerCase();
  let configuredPublicOriginRaw = '';
  let runtimeEnv = '';
  try {
    configuredPublicOriginRaw = readEnvCompat('PUBLIC_ORIGIN', { securityCritical: true });
    runtimeEnv = getRuntimeEnv();
  } catch (err) {
    if (err instanceof EnvAliasConflictError) {
      return {
        ok: false,
        status: 503,
        code: 'INVALID_PUBLIC_ORIGIN_CONFIG',
        error: 'Server environment configuration conflict detected.'
      };
    }
    throw err;
  }
  let configuredPublicUrl = null;
  if (configuredPublicOriginRaw) {
    try {
      configuredPublicUrl = new URL(configuredPublicOriginRaw);
    } catch {
      return {
        ok: false,
        status: 503,
        code: 'INVALID_PUBLIC_ORIGIN_CONFIG',
        error: 'Server public origin configuration is invalid.'
      };
    }
    if (host && host !== configuredPublicUrl.host.toLowerCase()) {
      return {
        ok: false,
        status: 403,
        code: 'CSRF_HOST_MISMATCH',
        error: 'Request Host does not match configured public origin.'
      };
    }
  }

  const expectedHost = configuredPublicUrl ? configuredPublicUrl.host.toLowerCase() : host;

  const isAllowedLoopbackUrl = parsed =>
    (parsed.hostname === '127.0.0.1' ||
      parsed.hostname === 'localhost' ||
      parsed.hostname === '[::1]') &&
    runtimeEnv !== 'production' &&
    !configuredPublicUrl;

  const origin = String(headers.origin || headers.Origin || '').trim();
  if (origin) {
    if (origin === 'null') {
      return {
        ok: false,
        status: 403,
        code: 'CSRF_NULL_ORIGIN_BLOCKED',
        error: 'Opaque null-origin state-changing requests are forbidden.'
      };
    }
    try {
      const parsedOrigin = new URL(origin);
      if (expectedHost && parsedOrigin.host.toLowerCase() !== expectedHost) {
        return {
          ok: false,
          status: 403,
          code: 'CSRF_ORIGIN_MISMATCH',
          error: 'Cross-origin state-changing requests are forbidden.'
        };
      }
      if (configuredPublicUrl && parsedOrigin.origin.toLowerCase() !== configuredPublicUrl.origin.toLowerCase()) {
        return {
          ok: false,
          status: 403,
          code: 'CSRF_ORIGIN_MISMATCH',
          error: 'Request Origin does not match configured public origin.'
        };
      }
      if (isHostedEnvironment() && parsedOrigin.protocol !== 'https:' && !isAllowedLoopbackUrl(parsedOrigin)) {
        return {
          ok: false,
          status: 403,
          code: 'CSRF_INSECURE_ORIGIN',
          error: 'HTTPS origin is required.'
        };
      }
    } catch {
      return {
        ok: false,
        status: 403,
        code: 'CSRF_INVALID_ORIGIN',
        error: 'Malformed Origin header.'
      };
    }
  } else {
    const referer = String(headers.referer || headers.Referer || '').trim();
    if (referer) {
      try {
        const parsedRef = new URL(referer);
        if (expectedHost && parsedRef.host.toLowerCase() !== expectedHost) {
          return {
            ok: false,
            status: 403,
            code: 'CSRF_REFERER_MISMATCH',
            error: 'Cross-origin Referer is forbidden.'
          };
        }
        if (configuredPublicUrl && parsedRef.origin.toLowerCase() !== configuredPublicUrl.origin.toLowerCase()) {
          return {
            ok: false,
            status: 403,
            code: 'CSRF_REFERER_MISMATCH',
            error: 'Request Referer does not match configured public origin.'
          };
        }
        if (isHostedEnvironment() && parsedRef.protocol !== 'https:' && !isAllowedLoopbackUrl(parsedRef)) {
          return {
            ok: false,
            status: 403,
            code: 'CSRF_INSECURE_REFERER',
            error: 'HTTPS Referer is required.'
          };
        }
      } catch {
        return {
          ok: false,
          status: 403,
          code: 'CSRF_INVALID_REFERER',
          error: 'Malformed Referer header.'
        };
      }
    }
  }

  const contentType = String(headers['content-type'] || headers['Content-Type'] || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  if (contentType !== 'application/json') {
    return {
      ok: false,
      status: 403,
      code: 'CSRF_UNSAFE_CONTENT_TYPE',
      error: 'State-changing API requests require Content-Type: application/json.'
    };
  }

  return { ok: true };
}

export async function consumeAuthRateLimit(
  db,
  { scope, subjectKey, maxHits, windowSeconds, now = new Date() }
) {
  // `bucketKey` stores a truncated SHA-256 digest of `scope|subjectKey` — treated as a minimized,
  // pseudonymous security/rate-limit identifier (not anonymous) and bounded to 24h retention.
  const bucketKey = 'arl:' + sha256Hex(`${scope}|${subjectKey}`).slice(0, 32);
  const windowMs = windowSeconds * 1000;
  const windowStartMs = Math.floor(now.getTime() / windowMs) * windowMs;
  const windowStartIso = new Date(windowStartMs).toISOString();
  const rlCutoffIso = new Date(now.getTime() - AUTH_RATE_LIMIT_RETENTION_MS).toISOString();

  return withTransaction(db, async tx => {
    await enableAuthInternalContext(tx);
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
    return {
      allowed: hits <= maxHits,
      hits,
      retryAfterSeconds: Math.max(1, Math.ceil((windowStartMs + windowMs - now.getTime()) / 1000))
    };
  });
}

export function createAuthCorrelationId() {
  return 'corr_' + crypto.randomBytes(8).toString('hex');
}

export function sanitizeDiagnosticCodeSafe(raw, maxLen = 80) {
  return sanitizeDiagnosticCode(raw, maxLen);
}

function sanitizeDiagnosticCode(raw, maxLen = 80) {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.trim().replace(/[^A-Za-z0-9_.:-]/g, '_').slice(0, maxLen);
  return cleaned.length > 0 ? cleaned : null;
}

function sanitizeProviderMessageId(raw) {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const cleaned = String(raw).trim().replace(/[^A-Za-z0-9._:@/-]/g, '').slice(0, 128);
  return cleaned.length > 0 ? cleaned : null;
}

async function recordAuthTelemetry(
  db,
  {
    correlationId,
    flow,
    deliveryMode,
    outcomeStage,
    httpStatus,
    providerStatus = null,
    providerMessageId = null,
    errorCode = null,
    isDesignatedTest = false,
    now = new Date(),
    logger = null
  }
) {
  const safeMode = String(deliveryMode || 'unknown').slice(0, 32);
  const safeCode = sanitizeDiagnosticCode(errorCode, 80);
  const safeMsgId = sanitizeProviderMessageId(providerMessageId);

  if (logger && typeof logger.info === 'function') {
    const eventName =
      flow === 'verify'
        ? 'auth_otp_verify'
        : flow === 'invite_send' || flow === 'invite_resend'
          ? 'auth_invite_email'
          : 'auth_otp_start';
    const logPayload = {
      level: httpStatus >= 500 ? 'error' : 'info',
      event: eventName,
      correlation_id: correlationId,
      mode: safeMode,
      outcome_stage: outcomeStage,
      http_status: httpStatus
    };
    if (providerStatus !== null && providerStatus !== undefined) logPayload.provider_status = providerStatus;
    if (safeMsgId) logPayload.provider_message_id = safeMsgId;
    if (safeCode) logPayload.error_code = safeCode;
    const fn = httpStatus >= 500 && typeof logger.error === 'function' ? logger.error.bind(logger) : logger.info.bind(logger);
    try {
      fn(JSON.stringify(logPayload));
    } catch {}
  }

  if (!db) return;
  try {
    await withTransaction(db, async tx => {
      await enableAuthInternalContext(tx);
      await tx.query(
        `INSERT INTO auth_delivery_telemetry (
           correlation_id, flow, delivery_mode, outcome_stage, http_status,
           provider_status, provider_message_id, error_code, is_designated_test, created_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          correlationId,
          flow,
          safeMode,
          outcomeStage,
          httpStatus,
          providerStatus,
          safeMsgId,
          safeCode,
          Boolean(isDesignatedTest),
          now.toISOString()
        ]
      );
    });
  } catch {
    // Graceful no-op on pre-021 test schemas or transient telemetry errors
  }

  if (
    outcomeStage === 'delivery_unavailable' ||
    outcomeStage === 'provider_rejected' ||
    outcomeStage === 'provider_timeout'
  ) {
    await recordDiagnosticEvent(
      db,
      {
        component: 'external_provider',
        featureKey: 'email_delivery',
        operationName: `email_delivery.${flow}`,
        routeTemplate:
          flow === 'invite_send' || flow === 'invite_resend' ? '/api/admin/invitations' : '/api/auth/start',
        httpStatus: providerStatus || httpStatus || 503,
        severity: outcomeStage === 'delivery_unavailable' ? 'error' : 'warning',
        errorCode: safeCode || outcomeStage.toUpperCase(),
        message: `Email delivery (${flow} via ${safeMode}) reported ${outcomeStage}${providerStatus ? ` (provider HTTP ${providerStatus})` : ''}.`,
        correlationId,
        retryable: outcomeStage === 'provider_timeout',
        outcomeState: outcomeStage === 'provider_timeout' ? 'outcome_uncertain' : 'failed',
        modVisible: false,
        safeContext: {
          delivery_mode: safeMode,
          phase: flow,
          ...(providerStatus ? { http_status: providerStatus } : {})
        }
      },
      { fallbackLogger: logger }
    );
  }
}

export function buildVerificationEmailPlainText({ code, ttlMinutes }) {
  return [
    `Your BiteShark verification code is: ${code}`,
    '',
    `This single-use code expires in ${ttlMinutes} minutes. Requesting a new code immediately invalidates earlier codes.`,
    '',
    'BiteShark will never ask you to share this code. If you did not request a sign-in or registration code, ignore this email and your account will remain unchanged.'
  ].join('\n');
}

async function sendOtpEmailHttps(deliveryCfg, { email, code, ttlMinutes }) {
  const subject = 'Your BiteShark verification code';
  const text = buildVerificationEmailPlainText({ code, ttlMinutes });

  if (customEmailSender) {
    const out = await customEmailSender({
      email,
      from: deliveryCfg.fromAddr,
      subject,
      text,
      code,
      ttlMinutes,
      mode: deliveryCfg.mode
    });
    return {
      providerStatus: Number(out?.status) || 200,
      providerMessageId: sanitizeProviderMessageId(out?.id || out?.message_id || null)
    };
  }

  const controller = new AbortController();
  const timeoutMs = Math.max(
    500,
    Math.min(15000, Number(readEnvCompat('AUTH_EMAIL_TIMEOUT_MS', { defaultValue: '6000' }) || 6000))
  );
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const body =
      deliveryCfg.mode === 'resend_https'
        ? {
            from: deliveryCfg.fromAddr,
            to: [email],
            subject,
            text
          }
        : {
            to: email,
            from: deliveryCfg.fromAddr,
            subject,
            text,
            template: 'biteshark_login_otp',
            code,
            expires_in_minutes: ttlMinutes
          };

    const res = await fetch(deliveryCfg.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${deliveryCfg.apiKey}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    const rawRespText = await res.text().catch(() => '');
    let parsedJson = null;
    if (rawRespText && rawRespText.length <= 4096) {
      try {
        parsedJson = JSON.parse(rawRespText);
      } catch {
        parsedJson = null;
      }
    }

    if (!res.ok) {
      const providerErrName = sanitizeDiagnosticCode(
        parsedJson?.name || parsedJson?.code || parsedJson?.type || `HTTP_${res.status}`,
        64
      );
      const err = new Error(`Email provider responded with HTTP ${res.status}`);
      err.stage = 'provider_rejected';
      err.providerStatus = res.status;
      err.errorCode = providerErrName || `HTTP_${res.status}`;
      throw err;
    }

    return {
      providerStatus: res.status,
      providerMessageId: sanitizeProviderMessageId(parsedJson?.id || parsedJson?.message_id || null)
    };
  } catch (err) {
    if (controller.signal.aborted || err?.name === 'AbortError') {
      const timeoutErr = new Error('Email provider request timed out.');
      timeoutErr.stage = 'provider_timeout';
      timeoutErr.providerStatus = null;
      timeoutErr.errorCode = 'PROVIDER_TIMEOUT';
      throw timeoutErr;
    }
    if (!err.stage) {
      err.stage = 'provider_rejected';
      err.errorCode = sanitizeDiagnosticCode(err?.code || 'NETWORK_ERROR', 64) || 'NETWORK_ERROR';
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export const STAGING_INVITATION_REQUIRED_MESSAGE =
  'Staging access requires an active, approved BiteShark invitation for this exact email address (or a designated operator account). Request an invitation from a BiteShark administrator, then sign up or sign in with that exact invited email.';

/**
 * Resolves the trusted canonical origin for invitation acceptance links from `BITESHARK_PUBLIC_ORIGIN`
 * (or legacy `TRUCKLY_PUBLIC_ORIGIN`). Never reads untrusted `Host` or `X-Forwarded-Host` headers.
 */
export function resolveTrustedInvitationOrigin() {
  let rawOrigin = '';
  let runtimeEnv = '';
  try {
    rawOrigin = readEnvCompat('PUBLIC_ORIGIN', { securityCritical: true });
    runtimeEnv = getRuntimeEnv();
  } catch (err) {
    if (err instanceof EnvAliasConflictError) {
      return { ok: false, errorCode: 'ENV_ALIAS_CONFLICT', reason: err.message };
    }
    throw err;
  }

  if (!rawOrigin) {
    return {
      ok: false,
      errorCode: 'INVITATION_ORIGIN_UNCONFIGURED',
      reason: 'BITESHARK_PUBLIC_ORIGIN must be configured to construct trusted invitation links.'
    };
  }

  let parsed;
  try {
    parsed = new URL(rawOrigin);
  } catch {
    return {
      ok: false,
      errorCode: 'INVITATION_ORIGIN_INVALID',
      reason: 'BITESHARK_PUBLIC_ORIGIN is not a valid origin URL.'
    };
  }

  if (parsed.username || parsed.password || parsed.search || parsed.hash || (parsed.pathname && parsed.pathname !== '/')) {
    return {
      ok: false,
      errorCode: 'INVITATION_ORIGIN_INVALID',
      reason: 'BITESHARK_PUBLIC_ORIGIN must be a bare origin (scheme + host) without path, query, credentials, or hash.'
    };
  }

  const hostLower = parsed.hostname.toLowerCase();
  const isLoopbackTestOrigin =
    Boolean(customEmailSender) && (hostLower === '127.0.0.1' || hostLower === 'localhost') && runtimeEnv !== 'production';

  if (parsed.protocol !== 'https:' && !isLoopbackTestOrigin) {
    return {
      ok: false,
      errorCode: 'INVITATION_ORIGIN_HTTPS_REQUIRED',
      reason: 'BITESHARK_PUBLIC_ORIGIN must use https:// for external transactional invitation emails.'
    };
  }

  return { ok: true, origin: parsed.origin };
}

/**
 * Centrally evaluates whether an exact normalized email address is permitted to initiate or
 * verify OTP authentication on isolated staging when staging recipient restrictions are active.
 *
 * Eligibility lifecycle:
 *   1. Static allowlist (`STAGING_ALLOWED_EMAILS` / `STAGING_ALLOWED_EMAIL_DOMAINS`) -> allowed.
 *   2. Continuing account access: an existing `auth_users` account for `emailNormalized` whose
 *      `disabled_at IS NULL` -> allowed (suspended `disabled_at IS NOT NULL` is immediately denied,
 *      even if an unconsumed invitation exists).
 *   3. Initial approved invitation access: no `auth_users` row yet, and at least one row in
 *      `account_invitations` for `emailNormalized` with `status = 'issued'`, `revoked_at IS NULL`,
 *      `consumed_at IS NULL`, `token_sha256 IS NOT NULL`, `expires_at > now`, and valid privilege
 *      provenance (Mod-initiated Mod/Top invitations require independent Top approval) -> allowed.
 *   4. Otherwise -> denied (`STAGING_ACCOUNT_NOT_ALLOWLISTED`). Database errors fail closed.
 */
export async function evaluateStagingRecipientEligibilityInTx(tx, emailNormalized, now = new Date()) {
  if (!emailNormalized) {
    return { ok: true, allowed: false, reason: 'invalid_email' };
  }
  if (isEmailAllowedInStagingMailbox(emailNormalized)) {
    return { ok: true, allowed: true, source: 'static_allowlist' };
  }

  await enableAuthInternalContext(tx);
  const nowIso = (now instanceof Date ? now : new Date(now)).toISOString();

  const userRes = await tx.query(
    'SELECT id, disabled_at FROM auth_users WHERE email_normalized = $1 LIMIT 1',
    [emailNormalized]
  );
  if (userRes.rows.length > 0) {
    if (userRes.rows[0].disabled_at) {
      return { ok: true, allowed: false, reason: 'account_suspended' };
    }
    return {
      ok: true,
      allowed: true,
      source: 'active_existing_account',
      userId: userRes.rows[0].id
    };
  }

  await tx.query('SAVEPOINT staging_invite_elig_chk');
  try {
    const invRes = await tx.query(
      `SELECT id, requested_role
       FROM account_invitations
       WHERE email_normalized = $1
         AND status = 'issued'
         AND revoked_at IS NULL
         AND consumed_at IS NULL
         AND token_sha256 IS NOT NULL
         AND expires_at IS NOT NULL
         AND expires_at > $2
         AND NOT (
           initiator_role = 'mod'
           AND requested_role IN ('mod', 'top')
           AND (approved_by IS NULL OR approved_by = initiated_by)
         )
       LIMIT 1`,
      [emailNormalized, nowIso]
    );
    await tx.query('RELEASE SAVEPOINT staging_invite_elig_chk');
    if (invRes.rows.length > 0) {
      return {
        ok: true,
        allowed: true,
        source: 'approved_invitation',
        invitationId: invRes.rows[0].id,
        requestedRole: invRes.rows[0].requested_role
      };
    }
    return { ok: true, allowed: false, reason: 'not_invited_or_allowlisted' };
  } catch (err) {
    await tx.query('ROLLBACK TO SAVEPOINT staging_invite_elig_chk').catch(() => {});
    if (err?.code === '42P01') {
      // Pre-018 schema in legacy unit tests: no invitations table, fail closed for non-allowlisted emails
      return { ok: true, allowed: false, reason: 'not_invited_or_allowlisted' };
    }
    throw err;
  }
}

export async function evaluateStagingRecipientEligibility(db, emailNormalized, { now = new Date() } = {}) {
  if (!emailNormalized) {
    return { ok: true, allowed: false, reason: 'invalid_email' };
  }
  try {
    if (isEmailAllowedInStagingMailbox(emailNormalized)) {
      return { ok: true, allowed: true, source: 'static_allowlist' };
    }
  } catch {
    return { ok: false, allowed: false, errorCode: 'ALLOWLIST_CONFIG_ERROR' };
  }

  if (!db) {
    return { ok: false, allowed: false, errorCode: 'DB_UNAVAILABLE' };
  }

  try {
    return await withTransaction(db, async tx => evaluateStagingRecipientEligibilityInTx(tx, emailNormalized, now));
  } catch {
    return { ok: false, allowed: false, errorCode: 'DB_ELIGIBILITY_QUERY_FAILED' };
  }
}

function formatExpirationForInvitationEmail(expiresAtIso) {
  const d = new Date(expiresAtIso);
  if (Number.isNaN(d.getTime())) return String(expiresAtIso || '');
  const utcStr = d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  try {
    const ptStr = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short'
    }).format(d);
    return `${ptStr} (${utcStr})`;
  } catch {
    return utcStr;
  }
}

export function buildInvitationEmailPlainText({
  recipientEmail,
  roleKey,
  roleLabel,
  vendorName = null,
  vendorId = null,
  acceptUrl,
  expiresAtIso,
  isStaging = true
}) {
  const envTitle = isStaging ? 'BiteShark Staging' : 'BiteShark';
  const lines = [
    `You have been invited to join ${envTitle}.`,
    ''
  ];
  if (isStaging) {
    lines.push('Environment: BiteShark Staging (pre-release verification environment — not public production)');
  }
  lines.push(`Invited email address: ${recipientEmail}`);
  lines.push(`Proposed role: ${roleLabel}`);
  if (vendorName || vendorId) {
    lines.push(`Target vendor scope: ${vendorName ? `${vendorName} (${vendorId})` : vendorId}`);
  }
  lines.push(`Invitation expires: ${formatExpirationForInvitationEmail(expiresAtIso)}`);
  lines.push('');

  if (roleKey === 'top') {
    lines.push(
      'IMPORTANT — FULL ADMINISTRATIVE AUTHORITY: Accepting this Admin: Top invitation grants full administrative authority over this BiteShark environment, including account and role governance, feature controls, vendor onboarding approvals, community moderation, and launch-readiness administration. No administrative permissions are granted until you verify ownership of this email address and explicitly accept the invitation.'
    );
    lines.push('');
  } else if (roleKey === 'vendor_owner') {
    lines.push(
      'Note: Accepting a Vendor Owner invitation links your verified account and opens a vendor onboarding draft; live public vendor publishing still requires ownership verification and Admin: Top approval.'
    );
    lines.push('');
  }

  lines.push('To review and accept this single-use invitation:');
  lines.push(`1. Open your secure invitation link: ${acceptUrl}`);
  lines.push(
    `2. Create a BiteShark account (minimum age 14) or sign in using this exact invited email address (${recipientEmail}), and verify email ownership with a 6-digit verification code.`
  );
  lines.push('3. Review the proposed role details and select "Accept Invitation".');
  lines.push('');
  lines.push(
    'If you were not expecting this invitation, ignore and delete this email. No account is created and no permissions are granted unless you verify ownership of this email address and explicitly accept the invitation.'
  );
  return lines.join('\n');
}

async function sendSingleInvitationEmailAttempt(
  deliveryCfg,
  { email, subject, text, idempotencyKey, attempt }
) {
  if (customEmailSender) {
    const out = await customEmailSender({
      kind: 'invitation',
      email,
      from: deliveryCfg.fromAddr,
      subject,
      text,
      idempotencyKey,
      attempt,
      mode: deliveryCfg.mode
    });
    return {
      providerStatus: Number(out?.status) || 200,
      providerMessageId: sanitizeProviderMessageId(out?.id || out?.message_id || null)
    };
  }

  const controller = new AbortController();
  const timeoutMs = Math.max(
    500,
    Math.min(15000, Number(readEnvCompat('AUTH_EMAIL_TIMEOUT_MS', { defaultValue: '6000' }) || 6000))
  );
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${deliveryCfg.apiKey}`
    };
    if (idempotencyKey) {
      headers['Idempotency-Key'] = idempotencyKey;
    }

    const body =
      deliveryCfg.mode === 'resend_https'
        ? {
            from: deliveryCfg.fromAddr,
            to: [email],
            subject,
            text
          }
        : {
            to: email,
            from: deliveryCfg.fromAddr,
            subject,
            text,
            template: 'biteshark_account_invitation',
            idempotency_key: idempotencyKey || undefined
          };

    const res = await fetch(deliveryCfg.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal
    });

    const rawRespText = await res.text().catch(() => '');
    let parsedJson = null;
    if (rawRespText && rawRespText.length <= 4096) {
      try {
        parsedJson = JSON.parse(rawRespText);
      } catch {
        parsedJson = null;
      }
    }

    if (!res.ok) {
      const providerErrName = sanitizeDiagnosticCode(
        parsedJson?.name || parsedJson?.code || parsedJson?.type || `HTTP_${res.status}`,
        64
      );
      const err = new Error(`Email provider responded with HTTP ${res.status}`);
      err.stage = 'provider_rejected';
      err.providerStatus = res.status;
      err.errorCode = providerErrName || `HTTP_${res.status}`;
      err.retryable = res.status === 502 || res.status === 503 || res.status === 504;
      throw err;
    }

    return {
      providerStatus: res.status,
      providerMessageId: sanitizeProviderMessageId(parsedJson?.id || parsedJson?.message_id || null)
    };
  } catch (err) {
    if (controller.signal.aborted || err?.name === 'AbortError') {
      const timeoutErr = new Error('Email provider request timed out.');
      timeoutErr.stage = 'provider_timeout';
      timeoutErr.providerStatus = null;
      timeoutErr.errorCode = 'PROVIDER_TIMEOUT';
      timeoutErr.retryable = true;
      throw timeoutErr;
    }
    if (!err.stage) {
      err.stage = 'provider_rejected';
      err.errorCode = sanitizeDiagnosticCode(err?.code || 'NETWORK_ERROR', 64) || 'NETWORK_ERROR';
      err.retryable = true;
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Sends a single-use account invitation email through the configured HTTPS provider (`resend_https`
 * or `webhook_https`) with Resend `Idempotency-Key` deduplication and at most 1 bounded retry on
 * transient network/5xx/timeout errors. Never logs raw tokens, links, emails, or API keys.
 */
export async function dispatchInvitationEmail(
  db,
  {
    invitationId,
    tokenVersion = 1,
    rawToken,
    recipientEmail,
    roleKey,
    roleLabel,
    vendorId = null,
    vendorName = null,
    expiresAtIso,
    flow = 'invite_send',
    correlationId = createAuthCorrelationId(),
    now = new Date(),
    logger = null
  }
) {
  const deliveryCfg = inspectAuthDeliveryConfig();
  const modeLabel = deliveryCfg.mode || 'unknown';
  let runtimeEnv = '';
  try {
    runtimeEnv = getRuntimeEnv();
  } catch {
    runtimeEnv = '';
  }

  if (!deliveryCfg.valid || !deliveryCfg.enabled) {
    const errCode = deliveryCfg.mode === 'conflict' ? 'ENV_ALIAS_CONFLICT' : 'AUTH_DELIVERY_UNAVAILABLE';
    await recordAuthTelemetry(db, {
      correlationId,
      flow,
      deliveryMode: modeLabel,
      outcomeStage: 'delivery_unavailable',
      httpStatus: 503,
      errorCode: errCode,
      isDesignatedTest: roleKey === 'top' || runtimeEnv === 'staging',
      now,
      logger
    });
    return {
      ok: false,
      deliveryStatus: 'delivery_failed',
      deliveryMode: modeLabel,
      correlationId,
      attemptsUsed: 0,
      providerStatus: null,
      providerMessageId: null,
      errorCode: errCode
    };
  }

  if (deliveryCfg.mode === 'staging_mailbox') {
    await recordAuthTelemetry(db, {
      correlationId,
      flow,
      deliveryMode: 'staging_mailbox',
      outcomeStage: 'staging_mailbox_stored',
      httpStatus: 200,
      isDesignatedTest: roleKey === 'top',
      now,
      logger
    });
    return {
      ok: true,
      deliveryStatus: 'staging_mailbox_only',
      deliveryMode: 'staging_mailbox',
      correlationId,
      attemptsUsed: 0,
      providerStatus: null,
      providerMessageId: null,
      errorCode: null
    };
  }

  const originCheck = resolveTrustedInvitationOrigin();
  if (!originCheck.ok) {
    await recordAuthTelemetry(db, {
      correlationId,
      flow,
      deliveryMode: deliveryCfg.mode,
      outcomeStage: 'delivery_unavailable',
      httpStatus: 503,
      errorCode: originCheck.errorCode,
      isDesignatedTest: roleKey === 'top' || runtimeEnv === 'staging',
      now,
      logger
    });
    return {
      ok: false,
      deliveryStatus: 'delivery_failed',
      deliveryMode: deliveryCfg.mode,
      correlationId,
      attemptsUsed: 0,
      providerStatus: null,
      providerMessageId: null,
      errorCode: originCheck.errorCode
    };
  }

  const emailNormalized = normalizeEmail(recipientEmail);
  const enforceStagingAllowlist = runtimeEnv === 'staging' && hasConfiguredStagingAllowlist();
  if (enforceStagingAllowlist) {
    const elig = await evaluateStagingRecipientEligibility(db, emailNormalized, { now });
    if (!elig.ok || !elig.allowed) {
      const code = !elig.ok ? elig.errorCode || 'DB_ELIGIBILITY_QUERY_FAILED' : 'STAGING_ACCOUNT_NOT_ALLOWLISTED';
      await recordAuthTelemetry(db, {
        correlationId,
        flow,
        deliveryMode: deliveryCfg.mode,
        outcomeStage: !elig.ok ? 'delivery_unavailable' : 'allowlist_denied',
        httpStatus: !elig.ok ? 503 : 403,
        errorCode: code,
        isDesignatedTest: roleKey === 'top' || runtimeEnv === 'staging',
        now,
        logger
      });
      return {
        ok: false,
        deliveryStatus: 'delivery_failed',
        deliveryMode: deliveryCfg.mode,
        correlationId,
        attemptsUsed: 0,
        providerStatus: null,
        providerMessageId: null,
        errorCode: code
      };
    }
  }

  const isStaging = runtimeEnv !== 'production';
  const subject = isStaging
    ? `BiteShark Staging Invitation — ${roleLabel}`
    : `BiteShark Invitation — ${roleLabel}`;
  const acceptUrl = `${originCheck.origin}/#accept-invite=${rawToken}`;
  const text = buildInvitationEmailPlainText({
    recipientEmail: emailNormalized,
    roleKey,
    roleLabel,
    vendorName,
    vendorId,
    acceptUrl,
    expiresAtIso,
    isStaging
  });
  const idempotencyKey = `biteshark-invite-${invitationId}-gen${tokenVersion}`;

  let attemptsUsed = 0;
  let lastErr = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    attemptsUsed = attempt;
    try {
      const out = await sendSingleInvitationEmailAttempt(deliveryCfg, {
        email: emailNormalized,
        subject,
        text,
        idempotencyKey,
        attempt
      });
      await recordAuthTelemetry(db, {
        correlationId,
        flow,
        deliveryMode: deliveryCfg.mode,
        outcomeStage: 'provider_accepted',
        httpStatus: 200,
        providerStatus: out.providerStatus || 200,
        providerMessageId: out.providerMessageId || null,
        isDesignatedTest: roleKey === 'top' || runtimeEnv === 'staging',
        now,
        logger
      });
      return {
        ok: true,
        deliveryStatus: 'provider_accepted',
        deliveryMode: deliveryCfg.mode,
        correlationId,
        attemptsUsed,
        providerStatus: out.providerStatus || 200,
        providerMessageId: out.providerMessageId || null,
        errorCode: null
      };
    } catch (err) {
      lastErr = err;
      if (!err?.retryable || attempt >= 2) {
        break;
      }
      await new Promise(r => setTimeout(r, 250));
    }
  }

  const isTimeout = lastErr?.stage === 'provider_timeout';
  const stage = isTimeout ? 'provider_timeout' : 'provider_rejected';
  const errCode =
    sanitizeDiagnosticCode(lastErr?.errorCode || (isTimeout ? 'PROVIDER_TIMEOUT' : 'PROVIDER_REJECTED'), 64) ||
    'PROVIDER_REJECTED';

  await recordAuthTelemetry(db, {
    correlationId,
    flow,
    deliveryMode: deliveryCfg.mode,
    outcomeStage: stage,
    httpStatus: 503,
    providerStatus: lastErr?.providerStatus ?? null,
    errorCode: errCode,
    isDesignatedTest: roleKey === 'top' || runtimeEnv === 'staging',
    now,
    logger
  });

  return {
    ok: false,
    deliveryStatus: isTimeout ? 'delivery_uncertain' : 'delivery_failed',
    deliveryMode: deliveryCfg.mode,
    correlationId,
    attemptsUsed,
    providerStatus: lastErr?.providerStatus ?? null,
    providerMessageId: null,
    errorCode: errCode
  };
}

function buildSupportEmailPlainText({ ticketNumber, eventKind, statusLabel, isCritical, viewUrl, isStaging }) {
  const envHeader = isStaging ? 'BiteShark Staging Support Update' : 'BiteShark Support Update';
  let summaryLine = `Your BiteShark support request (${ticketNumber}) has an update in your account.`;
  if (eventKind === 'ticket_acknowledged') {
    summaryLine = isCritical
      ? `We received your support request (${ticketNumber}) marked with Critical urgency and placed it at the top of our team triage queue. Note: automated receipt confirmation does not mean a team member has read your message yet.`
      : `We received your BiteShark support request (${ticketNumber}) and recorded it in our team queue.`;
  } else if (eventKind === 'staff_public_reply') {
    summaryLine = `BiteShark Support posted a new reply on your request (${ticketNumber}). Current status: ${statusLabel || 'Updated'}.`;
  } else if (eventKind === 'ticket_resolved') {
    summaryLine = `Your BiteShark support request (${ticketNumber}) has been marked Resolved. If the problem is still happening, you can reopen it directly from your account.`;
  } else if (eventKind === 'linked_incident_update') {
    summaryLine = `BiteShark Support posted a status update regarding a known operational issue linked to your request (${ticketNumber}).`;
  }

  return [
    envHeader,
    '',
    summaryLine,
    '',
    'For your privacy, message contents are not included in email notifications.',
    `Sign in to view your full thread or reply: ${viewUrl}`,
    '',
    'Please note: BiteShark support is reviewed asynchronously and is not monitored 24/7 for emergencies.'
  ].join('\n');
}

export async function dispatchSupportNotificationEmail(
  db,
  {
    notificationId,
    recipientEmail,
    ticketNumber,
    eventKind = 'staff_public_reply',
    statusLabel = '',
    isCritical = false,
    correlationId = createAuthCorrelationId(),
    now = new Date(),
    logger = null
  } = {}
) {
  const deliveryCfg = inspectAuthDeliveryConfig();
  let runtimeEnv = '';
  try {
    runtimeEnv = getRuntimeEnv();
  } catch {
    runtimeEnv = 'staging';
  }

  if (!deliveryCfg.valid || !deliveryCfg.enabled || deliveryCfg.mode === 'disabled') {
    return {
      ok: true,
      deliveryStatus: 'in_app_only',
      deliveryMode: deliveryCfg.mode || 'disabled',
      correlationId,
      attemptsUsed: 0,
      providerStatus: null,
      providerMessageId: null,
      errorCode: null
    };
  }

  if (deliveryCfg.mode === 'staging_mailbox') {
    return {
      ok: true,
      deliveryStatus: 'staging_mailbox_only',
      deliveryMode: 'staging_mailbox',
      correlationId,
      attemptsUsed: 0,
      providerStatus: null,
      providerMessageId: null,
      errorCode: null
    };
  }

  const emailNormalized = normalizeEmail(recipientEmail);
  if (!emailNormalized) {
    return {
      ok: false,
      deliveryStatus: 'in_app_only',
      deliveryMode: deliveryCfg.mode,
      correlationId,
      attemptsUsed: 0,
      providerStatus: null,
      providerMessageId: null,
      errorCode: 'MISSING_RECIPIENT_EMAIL'
    };
  }

  const enforceStagingAllowlist = runtimeEnv === 'staging' && hasConfiguredStagingAllowlist();
  if (enforceStagingAllowlist) {
    const elig = await evaluateStagingRecipientEligibility(db, emailNormalized, { now });
    if (!elig.ok || !elig.allowed) {
      return {
        ok: true,
        deliveryStatus: 'staging_restricted_in_app_only',
        deliveryMode: deliveryCfg.mode,
        correlationId,
        attemptsUsed: 0,
        providerStatus: null,
        providerMessageId: null,
        errorCode: !elig.ok ? elig.errorCode || 'DB_ELIGIBILITY_QUERY_FAILED' : 'STAGING_ACCOUNT_NOT_ALLOWLISTED'
      };
    }
  }

  const originCheck = resolveTrustedInvitationOrigin();
  const baseOrigin = originCheck.ok
    ? originCheck.origin
    : customEmailSender
      ? 'https://staging.biteshark.live'
      : null;
  if (!baseOrigin) {
    return {
      ok: true,
      deliveryStatus: 'in_app_only',
      deliveryMode: deliveryCfg.mode,
      correlationId,
      attemptsUsed: 0,
      providerStatus: null,
      providerMessageId: null,
      errorCode: originCheck.errorCode || 'PUBLIC_ORIGIN_UNCONFIGURED'
    };
  }

  const isStaging = runtimeEnv !== 'production';
  const safeTicket = String(ticketNumber || 'Support').replace(/[^A-Za-z0-9-]/g, '').slice(0, 20) || 'Support';
  const subjectPrefix = isStaging ? 'BiteShark Staging Support' : 'BiteShark Support';
  const subject =
    eventKind === 'ticket_acknowledged'
      ? `${subjectPrefix} [${safeTicket}] — Request received`
      : eventKind === 'ticket_resolved'
        ? `${subjectPrefix} [${safeTicket}] — Marked Resolved`
        : `${subjectPrefix} [${safeTicket}] — New update in your account`;
  const viewUrl = `${baseOrigin}/#support=${encodeURIComponent(safeTicket)}`;
  const text = buildSupportEmailPlainText({
    ticketNumber: safeTicket,
    eventKind,
    statusLabel,
    isCritical,
    viewUrl,
    isStaging
  });
  const idempotencyKey = `biteshark-support-notif-${notificationId || safeTicket}`;

  let attemptsUsed = 0;
  let lastErr = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    attemptsUsed = attempt;
    try {
      const out = await sendSingleInvitationEmailAttempt(deliveryCfg, {
        email: emailNormalized,
        subject,
        text,
        idempotencyKey,
        attempt
      });
      await recordAuthTelemetry(db, {
        correlationId,
        flow: 'support_notify',
        deliveryMode: deliveryCfg.mode,
        outcomeStage: 'provider_accepted',
        httpStatus: 200,
        providerStatus: out.providerStatus || 200,
        providerMessageId: out.providerMessageId || null,
        isDesignatedTest: runtimeEnv === 'staging',
        now,
        logger
      });
      return {
        ok: true,
        deliveryStatus: 'provider_accepted',
        deliveryMode: deliveryCfg.mode,
        correlationId,
        attemptsUsed,
        providerStatus: out.providerStatus || 200,
        providerMessageId: out.providerMessageId || null,
        errorCode: null
      };
    } catch (err) {
      lastErr = err;
      if (!err?.retryable || attempt >= 2) break;
      await new Promise(r => setTimeout(r, 200));
    }
  }

  const isTimeout = lastErr?.stage === 'provider_timeout';
  const stage = isTimeout ? 'provider_timeout' : 'provider_rejected';
  const errCode =
    sanitizeDiagnosticCode(lastErr?.errorCode || (isTimeout ? 'PROVIDER_TIMEOUT' : 'PROVIDER_REJECTED'), 64) ||
    'PROVIDER_REJECTED';

  await recordAuthTelemetry(db, {
    correlationId,
    flow: 'support_notify',
    deliveryMode: deliveryCfg.mode,
    outcomeStage: stage,
    httpStatus: 503,
    providerStatus: lastErr?.providerStatus ?? null,
    errorCode: errCode,
    isDesignatedTest: runtimeEnv === 'staging',
    now,
    logger
  });

  return {
    ok: false,
    deliveryStatus: isTimeout ? 'delivery_uncertain' : 'delivery_failed',
    deliveryMode: deliveryCfg.mode,
    correlationId,
    attemptsUsed,
    providerStatus: lastErr?.providerStatus ?? null,
    providerMessageId: null,
    errorCode: errCode
  };
}

export async function startEmailOtpChallenge(
  db,
  req,
  { email, intent, dob, dob_year, dob_month, dob_day, now = new Date(), logger = null } = {}
) {
  const correlationId = createAuthCorrelationId();
  const deliveryCfg = inspectAuthDeliveryConfig();
  const modeLabel = deliveryCfg.mode || 'unknown';

  const emailNormalized = normalizeEmail(email);
  if (!emailNormalized) {
    await recordAuthTelemetry(db, {
      correlationId,
      flow: 'start',
      deliveryMode: modeLabel,
      outcomeStage: 'invalid_email',
      httpStatus: 400,
      errorCode: 'INVALID_EMAIL',
      now,
      logger
    });
    return { ok: false, status: 400, code: 'INVALID_EMAIL', correlationId, error: 'Enter a valid email address.' };
  }

  if (!deliveryCfg.valid || !deliveryCfg.enabled) {
    const unavailableCode = deliveryCfg.mode === 'conflict' ? 'ENV_ALIAS_CONFLICT' : 'AUTH_DELIVERY_UNAVAILABLE';
    await recordAuthTelemetry(db, {
      correlationId,
      flow: 'start',
      deliveryMode: modeLabel,
      outcomeStage: 'delivery_unavailable',
      httpStatus: 503,
      errorCode: unavailableCode,
      now,
      logger
    });
    return {
      ok: false,
      status: 503,
      code: 'AUTH_DELIVERY_UNAVAILABLE',
      correlationId,
      error: 'Email sign-in is temporarily unavailable on this environment.'
    };
  }

  let runtimeEnv = '';
  try {
    runtimeEnv = getRuntimeEnv();
  } catch {
    runtimeEnv = '';
  }
  const enforceStagingAllowlist =
    deliveryCfg.mode === 'staging_mailbox' || (runtimeEnv === 'staging' && hasConfiguredStagingAllowlist());

  if (enforceStagingAllowlist) {
    const elig = await evaluateStagingRecipientEligibility(db, emailNormalized, { now });
    if (!elig.ok) {
      await recordAuthTelemetry(db, {
        correlationId,
        flow: 'start',
        deliveryMode: deliveryCfg.mode,
        outcomeStage: 'delivery_unavailable',
        httpStatus: 503,
        errorCode: elig.errorCode || 'DB_ELIGIBILITY_QUERY_FAILED',
        now,
        logger
      });
      return {
        ok: false,
        status: 503,
        code: 'AUTH_DELIVERY_UNAVAILABLE',
        correlationId,
        error: 'Email sign-in is temporarily unavailable on this environment.'
      };
    }
    if (!elig.allowed) {
      await recordAuthTelemetry(db, {
        correlationId,
        flow: 'start',
        deliveryMode: deliveryCfg.mode,
        outcomeStage: 'allowlist_denied',
        httpStatus: 403,
        errorCode: 'STAGING_ACCOUNT_NOT_ALLOWLISTED',
        now,
        logger
      });
      return {
        ok: false,
        status: 403,
        code: 'STAGING_ACCOUNT_NOT_ALLOWLISTED',
        correlationId,
        error: STAGING_INVITATION_REQUIRED_MESSAGE
      };
    }
  }

  const authSecret = getAuthSecret();
  const clientIp = resolveTrustedClientIp(req);
  const ipHash = sha256Hex(`ip:${clientIp}`).slice(0, 32);

  const ipLimitMax = Math.max(3, Number(readEnvCompat('AUTH_START_IP_MAX', { defaultValue: '15' }) || 15));
  const emailLimitMax = Math.max(2, Number(readEnvCompat('AUTH_START_EMAIL_MAX', { defaultValue: '5' }) || 5));
  const ageGateIpMax = Math.max(2, Number(readEnvCompat('AUTH_AGE_GATE_IP_MAX', { defaultValue: '5' }) || 5));
  const rateWindowSeconds = Math.max(60, Number(readEnvCompat('AUTH_RATE_WINDOW_SECONDS', { defaultValue: '900' }) || 900));

  const ipRl = await consumeAuthRateLimit(db, {
    scope: 'auth_start_ip',
    subjectKey: ipHash,
    maxHits: ipLimitMax,
    windowSeconds: rateWindowSeconds,
    now
  });
  if (!ipRl.allowed) {
    await recordAuthTelemetry(db, {
      correlationId,
      flow: 'start',
      deliveryMode: deliveryCfg.mode,
      outcomeStage: 'rate_limited',
      httpStatus: 429,
      errorCode: 'AUTH_START_IP_RATE_LIMITED',
      now,
      logger
    });
    return {
      ok: false,
      status: 429,
      code: 'AUTH_RATE_LIMITED',
      correlationId,
      retryAfterSeconds: ipRl.retryAfterSeconds,
      error: 'Too many sign-in requests from this network. Please wait before trying again.'
    };
  }

  // Evaluate proposed 14+ minimum-age eligibility BEFORE recording per-email rate limits,
  // issuing OTP challenges, or creating any account/mailbox record.
  const isSignupIntent = String(intent || '').trim().toLowerCase() === 'signup';
  const hasDobFields =
    dob !== undefined || dob_year !== undefined || dob_month !== undefined || dob_day !== undefined;

  let ageEval = null;
  if (isSignupIntent || hasDobFields) {
    if (hasAgeGateCooldownCookie(req)) {
      await recordAuthTelemetry(db, {
        correlationId,
        flow: 'start',
        deliveryMode: deliveryCfg.mode,
        outcomeStage: 'age_ineligible',
        httpStatus: 403,
        errorCode: 'AGE_INELIGIBLE',
        now,
        logger
      });
      return {
        ok: false,
        status: 403,
        code: 'AGE_INELIGIBLE',
        correlationId,
        error:
          'Accounts on BiteShark require users to be at least 14 years old under our proposed account policy. Registration cannot be completed.'
      };
    }

    ageEval = evaluateMinimumAgeEligibility({ dob, dob_year, dob_month, dob_day }, now);
    if (!ageEval.valid) {
      return {
        ok: false,
        status: 400,
        code: ageEval.code,
        correlationId,
        error: ageEval.error
      };
    }

    if (!ageEval.eligible) {
      // Minimal security/abuse record: truncated SHA-256 IP rate-limit bucket (`age_ineligible_ip`),
      // treated as a minimized/pseudonymous abuse-prevention identifier and purged after 24h by
      // `consumeAuthRateLimit` and `cleanupExpiredAuthRecords`. Stores ZERO DOB, ZERO email, ZERO user, ZERO OTP challenge.
      const ageIpRl = await consumeAuthRateLimit(db, {
        scope: 'age_ineligible_ip',
        subjectKey: ipHash,
        maxHits: ageGateIpMax,
        windowSeconds: rateWindowSeconds,
        now
      });
      if (!ageIpRl.allowed) {
        await recordAuthTelemetry(db, {
          correlationId,
          flow: 'start',
          deliveryMode: deliveryCfg.mode,
          outcomeStage: 'rate_limited',
          httpStatus: 429,
          errorCode: 'AGE_GATE_RATE_LIMITED',
          now,
          logger
        });
        return {
          ok: false,
          status: 429,
          retryAfterSeconds: ageIpRl.retryAfterSeconds,
          code: 'AGE_GATE_RATE_LIMITED',
          correlationId,
          error: 'Too many registration attempts from this network. Please wait before trying again.'
        };
      }
      await recordAuthTelemetry(db, {
        correlationId,
        flow: 'start',
        deliveryMode: deliveryCfg.mode,
        outcomeStage: 'age_ineligible',
        httpStatus: 403,
        errorCode: 'AGE_INELIGIBLE',
        now,
        logger
      });
      return {
        ok: false,
        status: 403,
        code: 'AGE_INELIGIBLE',
        correlationId,
        error: ageEval.error,
        setCookieHeader: buildAgeGateCooldownCookieHeader(DEFAULT_AGE_GATE_COOLDOWN_SECONDS)
      };
    }
  }

  const emailHash = sha256Hex(`email:${emailNormalized}`).slice(0, 32);
  const emailRl = await consumeAuthRateLimit(db, {
    scope: 'auth_start_email',
    subjectKey: emailHash,
    maxHits: emailLimitMax,
    windowSeconds: rateWindowSeconds,
    now
  });
  if (!emailRl.allowed) {
    await recordAuthTelemetry(db, {
      correlationId,
      flow: 'start',
      deliveryMode: deliveryCfg.mode,
      outcomeStage: 'rate_limited',
      httpStatus: 429,
      errorCode: 'AUTH_START_EMAIL_RATE_LIMITED',
      now,
      logger
    });
    return {
      ok: false,
      status: 429,
      code: 'AUTH_RATE_LIMITED',
      correlationId,
      retryAfterSeconds: emailRl.retryAfterSeconds,
      error: 'Too many verification codes requested for this address. Please wait before trying again.'
    };
  }

  const otpTtlSeconds = Math.max(
    30,
    Math.min(900, Number(readEnvCompat('AUTH_OTP_TTL_SECONDS', { defaultValue: String(DEFAULT_OTP_TTL_SECONDS) }) || DEFAULT_OTP_TTL_SECONDS))
  );
  const maxAttempts = Math.max(
    1,
    Math.min(10, Number(readEnvCompat('AUTH_OTP_MAX_ATTEMPTS', { defaultValue: String(DEFAULT_OTP_MAX_ATTEMPTS) }) || DEFAULT_OTP_MAX_ATTEMPTS))
  );

  // Generate 6-digit RFC 4226 HOTP verification code using maintained `otplib`
  const otpSecret = generateSecret();
  const otpCode = await generateOtpToken({
    strategy: 'hotp',
    secret: otpSecret,
    counter: 0,
    digits: 6
  });

  const challengeId = crypto.randomUUID();
  const codeHmac = computeOtpHmac(authSecret, emailNormalized, challengeId, otpCode);
  const nowIso = now.toISOString();
  const expiresAtIso = new Date(now.getTime() + otpTtlSeconds * 1000).toISOString();
  const signupAgeEligible = Boolean(ageEval?.eligible);
  const signupAgePolicyVersion = signupAgeEligible ? ageEval.eligibilityMetadata.age_policy_version : null;
  const signupAgeAssessedAt = signupAgeEligible ? ageEval.eligibilityMetadata.age_assessed_at : null;

  let shouldDeliverOtp = true;
  let isTopAdminRecipient = false;
  let deniedInsideTx = false;

  await withTransaction(db, async tx => {
    await enableAuthInternalContext(tx);
    // Serialize concurrent OTP issuance per normalized email so at most 1 active challenge exists
    await tx.query("SELECT pg_advisory_xact_lock(hashtext('auth_otp_start:' || $1))", [emailNormalized]);

    if (enforceStagingAllowlist) {
      const txElig = await evaluateStagingRecipientEligibilityInTx(tx, emailNormalized, now);
      if (!txElig.ok || !txElig.allowed) {
        deniedInsideTx = true;
        shouldDeliverOtp = false;
        return;
      }
    }

    const existingUserRes = await tx.query(
      'SELECT id FROM auth_users WHERE email_normalized = $1 LIMIT 1',
      [emailNormalized]
    );
    const hasExistingAccount = existingUserRes.rows.length > 0;
    if (hasExistingAccount) {
      const topRoleRes = await tx
        .query("SELECT 1 FROM platform_roles WHERE user_id = $1 AND role IN ('top', 'platform_admin') LIMIT 1", [
          existingUserRes.rows[0].id
        ])
        .catch(() => ({ rows: [] }));
      isTopAdminRecipient = topRoleRes.rows.length > 0;
    }

    // Never issue signup verification codes for a brand-new email unless 14+ age eligibility
    // has already been evaluated. Return the identical 200 payload to prevent account enumeration.
    if (!hasExistingAccount && !signupAgeEligible) {
      shouldDeliverOtp = false;
      return;
    }

    // Invalidate any previous unconsumed challenges and purge their staging mailbox entries
    await tx.query(
      `DELETE FROM auth_staging_mailbox
       WHERE email_normalized = $1 OR expires_at <= $2`,
      [emailNormalized, nowIso]
    );
    await tx.query(
      `UPDATE auth_otp_challenges
       SET invalidated_at = $2
       WHERE email_normalized = $1
         AND consumed_at IS NULL
         AND invalidated_at IS NULL`,
      [emailNormalized, nowIso]
    );

    await tx.query(
      `INSERT INTO auth_otp_challenges (
         id, email_normalized, code_hmac, attempts, max_attempts, requester_ip_hash,
         expires_at, created_at, signup_age_eligible, signup_age_policy_version, signup_age_assessed_at
       )
       VALUES ($1, $2, $3, 0, $4, $5, $6, $7, $8, $9, $10)`,
      [
        challengeId,
        emailNormalized,
        codeHmac,
        maxAttempts,
        ipHash,
        expiresAtIso,
        nowIso,
        signupAgeEligible,
        signupAgePolicyVersion,
        signupAgeAssessedAt
      ]
    );

    if (deliveryCfg.mode === 'staging_mailbox') {
      const enc = encryptStagingMailboxCode(otpCode, emailNormalized, challengeId);
      await tx.query(
        `INSERT INTO auth_staging_mailbox
           (challenge_id, email_normalized, ciphertext_b64, iv_b64, auth_tag_b64, expires_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [challengeId, emailNormalized, enc.ciphertextB64, enc.ivB64, enc.authTagB64, expiresAtIso, nowIso]
      );
    }
  });

  if (deniedInsideTx) {
    await recordAuthTelemetry(db, {
      correlationId,
      flow: 'start',
      deliveryMode: deliveryCfg.mode,
      outcomeStage: 'allowlist_denied',
      httpStatus: 403,
      errorCode: 'STAGING_ACCOUNT_NOT_ALLOWLISTED',
      now,
      logger
    });
    return {
      ok: false,
      status: 403,
      code: 'STAGING_ACCOUNT_NOT_ALLOWLISTED',
      correlationId,
      error: STAGING_INVITATION_REQUIRED_MESSAGE
    };
  }

  if (!shouldDeliverOtp) {
    await recordAuthTelemetry(db, {
      correlationId,
      flow: 'start',
      deliveryMode: deliveryCfg.mode,
      outcomeStage: 'unknown_signin_noop',
      httpStatus: 200,
      now,
      logger
    });
  } else if (deliveryCfg.mode === 'staging_mailbox') {
    await recordAuthTelemetry(db, {
      correlationId,
      flow: 'start',
      deliveryMode: 'staging_mailbox',
      outcomeStage: 'staging_mailbox_stored',
      httpStatus: 200,
      isDesignatedTest: isTopAdminRecipient,
      now,
      logger
    });
  } else if (deliveryCfg.mode === 'resend_https' || deliveryCfg.mode === 'webhook_https') {
    try {
      const providerOut = await sendOtpEmailHttps(deliveryCfg, {
        email: emailNormalized,
        code: otpCode,
        ttlMinutes: Math.max(1, Math.round(otpTtlSeconds / 60))
      });
      await recordAuthTelemetry(db, {
        correlationId,
        flow: 'start',
        deliveryMode: deliveryCfg.mode,
        outcomeStage: 'provider_accepted',
        httpStatus: 200,
        providerStatus: providerOut?.providerStatus || 200,
        providerMessageId: providerOut?.providerMessageId || null,
        isDesignatedTest: isTopAdminRecipient || runtimeEnv === 'staging',
        now,
        logger
      });
    } catch (sendErr) {
      await withTransaction(db, async tx => {
        await enableAuthInternalContext(tx);
        await tx.query(
          'UPDATE auth_otp_challenges SET invalidated_at = $2 WHERE id = $1',
          [challengeId, new Date().toISOString()]
        );
      }).catch(() => {});

      const failStage = sendErr?.stage === 'provider_timeout' ? 'provider_timeout' : 'provider_rejected';
      const failCode =
        failStage === 'provider_timeout' ? 'AUTH_EMAIL_PROVIDER_TIMEOUT' : 'AUTH_EMAIL_SEND_FAILED';

      await recordAuthTelemetry(db, {
        correlationId,
        flow: 'start',
        deliveryMode: deliveryCfg.mode,
        outcomeStage: failStage,
        httpStatus: 503,
        providerStatus: sendErr?.providerStatus ?? null,
        errorCode: sendErr?.errorCode || failCode,
        isDesignatedTest: isTopAdminRecipient || runtimeEnv === 'staging',
        now,
        logger
      });

      return {
        ok: false,
        status: 503,
        code: failCode,
        correlationId,
        error: 'Could not send a verification code right now. Please try again shortly.'
      };
    }
  }

  const publicMode = deliveryCfg.mode === 'staging_mailbox' ? 'staging_mailbox' : 'email';

  // Non-enumerating byte-for-byte uniform JSON response regardless of whether `auth_users` already has this email;
  // per-request correlation ID is emitted via the `X-Correlation-Id` HTTP header.
  return {
    ok: true,
    status: 200,
    correlationId,
    body: {
      ok: true,
      delivery_mode: publicMode,
      expires_in_seconds: otpTtlSeconds,
      has_passkey: false,
      passkeys_supported: false
    }
  };
}

export async function verifyEmailOtpChallenge(db, req, { email, code, now = new Date(), logger = null } = {}) {
  const correlationId = createAuthCorrelationId();
  const modeLabel = inspectAuthDeliveryConfig().mode || 'unknown';
  const emailNormalized = normalizeEmail(email);
  const cleanCode = typeof code === 'string' ? code.trim() : '';
  if (!emailNormalized || !/^\d{6}$/.test(cleanCode)) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_OTP_FORMAT',
      correlationId,
      error: 'Enter your email address and 6-digit verification code.'
    };
  }

  const authSecret = getAuthSecret();
  const clientIp = resolveTrustedClientIp(req);
  const ipHash = sha256Hex(`ip:${clientIp}`).slice(0, 32);
  const emailHash = sha256Hex(`email:${emailNormalized}`).slice(0, 32);
  const uaHash = sha256Hex(`ua:${String(req?.headers?.['user-agent'] || '').slice(0, 256)}`).slice(0, 32);

  const ipVerifyMax = Math.max(5, Number(readEnvCompat('AUTH_VERIFY_IP_MAX', { defaultValue: '25' }) || 25));
  const emailVerifyMax = Math.max(5, Number(readEnvCompat('AUTH_VERIFY_EMAIL_MAX', { defaultValue: '10' }) || 10));
  const rateWindowSeconds = Math.max(60, Number(readEnvCompat('AUTH_RATE_WINDOW_SECONDS', { defaultValue: '900' }) || 900));

  const ipRl = await consumeAuthRateLimit(db, {
    scope: 'auth_verify_ip',
    subjectKey: ipHash,
    maxHits: ipVerifyMax,
    windowSeconds: rateWindowSeconds,
    now
  });
  if (!ipRl.allowed) {
    await recordAuthTelemetry(db, {
      correlationId,
      flow: 'verify',
      deliveryMode: modeLabel,
      outcomeStage: 'rate_limited',
      httpStatus: 429,
      errorCode: 'AUTH_VERIFY_IP_RATE_LIMITED',
      now,
      logger
    });
    return {
      ok: false,
      status: 429,
      code: 'AUTH_RATE_LIMITED',
      correlationId,
      retryAfterSeconds: ipRl.retryAfterSeconds,
      error: 'Too many verification attempts. Please wait before trying again.'
    };
  }

  const emailRl = await consumeAuthRateLimit(db, {
    scope: 'auth_verify_email',
    subjectKey: emailHash,
    maxHits: emailVerifyMax,
    windowSeconds: rateWindowSeconds,
    now
  });
  if (!emailRl.allowed) {
    await recordAuthTelemetry(db, {
      correlationId,
      flow: 'verify',
      deliveryMode: modeLabel,
      outcomeStage: 'rate_limited',
      httpStatus: 429,
      errorCode: 'AUTH_VERIFY_EMAIL_RATE_LIMITED',
      now,
      logger
    });
    return {
      ok: false,
      status: 429,
      code: 'AUTH_RATE_LIMITED',
      correlationId,
      retryAfterSeconds: emailRl.retryAfterSeconds,
      error: 'Too many verification attempts for this email. Request a new code later.'
    };
  }

  const nowMs = now.getTime();
  const nowIso = now.toISOString();
  const sessionTtlSeconds = Math.max(
    60,
    Math.min(
      MAX_SESSION_LIFETIME_SECONDS,
      Number(readEnvCompat('AUTH_SESSION_TTL_SECONDS', { defaultValue: String(DEFAULT_SESSION_TTL_SECONDS) }) || DEFAULT_SESSION_TTL_SECONDS)
    )
  );
  const priorRawToken = extractRawSessionToken(req);

  return withTransaction(db, async tx => {
    await enableAuthInternalContext(tx);

    // Row-lock active challenge (`FOR UPDATE`) so concurrent verifications serialize strictly
    const { rows } = await tx.query(
      `SELECT
         id, code_hmac, attempts, max_attempts, expires_at,
         signup_age_eligible, signup_age_policy_version, signup_age_assessed_at
       FROM auth_otp_challenges
       WHERE email_normalized = $1
         AND consumed_at IS NULL
         AND invalidated_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1
       FOR UPDATE`,
      [emailNormalized]
    );

    if (!rows.length) {
      // Constant-work dummy HMAC to avoid timing side-channels across missing vs active challenges
      computeOtpHmac(authSecret, emailNormalized, DUMMY_CHALLENGE_ID, cleanCode);
      return { ok: false, status: 401, error: 'Invalid or expired verification code.' };
    }

    const challenge = rows[0];
    const expiresMs = new Date(challenge.expires_at).getTime();
    if (!Number.isFinite(expiresMs) || expiresMs <= nowMs || challenge.attempts >= challenge.max_attempts) {
      await tx.query(
        'UPDATE auth_otp_challenges SET invalidated_at = $2 WHERE id = $1',
        [challenge.id, nowIso]
      );
      await tx.query('DELETE FROM auth_staging_mailbox WHERE challenge_id = $1', [challenge.id]);
      return { ok: false, status: 401, error: 'Invalid or expired verification code.' };
    }

    const expectedBuf = Buffer.from(
      computeOtpHmac(authSecret, emailNormalized, challenge.id, cleanCode),
      'hex'
    );
    const storedBuf = Buffer.from(String(challenge.code_hmac || ''), 'hex');
    const hmacMatches =
      expectedBuf.length === 32 &&
      storedBuf.length === 32 &&
      crypto.timingSafeEqual(expectedBuf, storedBuf);

    if (!hmacMatches) {
      const nextAttempts = challenge.attempts + 1;
      const exhausted = nextAttempts >= challenge.max_attempts;
      await tx.query(
        `UPDATE auth_otp_challenges
         SET attempts = $2,
             invalidated_at = CASE WHEN $3 THEN $4::timestamptz ELSE invalidated_at END
         WHERE id = $1`,
        [challenge.id, nextAttempts, exhausted, nowIso]
      );
      if (exhausted) {
        await tx.query('DELETE FROM auth_staging_mailbox WHERE challenge_id = $1', [challenge.id]);
      }
      return { ok: false, status: 401, error: 'Invalid or expired verification code.' };
    }

    // Atomic single-use consumption guarded by `consumed_at IS NULL`
    const consumeRes = await tx.query(
      `UPDATE auth_otp_challenges
       SET consumed_at = $2,
           attempts = attempts + 1
       WHERE id = $1
         AND consumed_at IS NULL
         AND invalidated_at IS NULL
         AND expires_at > $2
         AND attempts < max_attempts
       RETURNING id`,
      [challenge.id, nowIso]
    );
    await tx.query('DELETE FROM auth_staging_mailbox WHERE challenge_id = $1', [challenge.id]);

    if (consumeRes.rowCount !== 1) {
      return { ok: false, status: 401, error: 'Invalid or expired verification code.' };
    }

    // Check if an existing standalone account is disabled BEFORE updating `last_login_at`
    const existingUserRes = await tx.query(
      `SELECT id, email_normalized, disabled_at, age_eligibility_status, age_policy_version, age_assessed_at
       FROM auth_users
       WHERE email_normalized = $1
       FOR UPDATE`,
      [emailNormalized]
    );
    let userRow;
    if (existingUserRes.rows.length > 0) {
      if (existingUserRes.rows[0].disabled_at) {
        await tx.query(
          'UPDATE auth_sessions SET revoked_at = $2 WHERE user_id = $1 AND revoked_at IS NULL',
          [existingUserRes.rows[0].id, nowIso]
        );
        return { ok: false, status: 403, error: 'This account has been disabled.' };
      }

      if (existingUserRes.rows[0].age_eligibility_status === 'not_assessed' && challenge.signup_age_eligible) {
        const updRes = await tx.query(
          `UPDATE auth_users
           SET last_login_at = $2,
               updated_at = $2,
               age_eligibility_status = 'eligible_14_plus',
               age_policy_version = $3,
               age_assessed_at = $4,
               age_assessment_basis = 'self_reported_dob_at_signup'
           WHERE id = $1
           RETURNING id, email_normalized, disabled_at, age_eligibility_status`,
          [
            existingUserRes.rows[0].id,
            nowIso,
            challenge.signup_age_policy_version || AGE_POLICY_VERSION,
            challenge.signup_age_assessed_at || nowIso
          ]
        );
        userRow = updRes.rows[0];
      } else {
        const updRes = await tx.query(
          `UPDATE auth_users
           SET last_login_at = $2,
               updated_at = $2
           WHERE id = $1
           RETURNING id, email_normalized, disabled_at, age_eligibility_status`,
          [existingUserRes.rows[0].id, nowIso]
        );
        userRow = updRes.rows[0];
      }
    } else {
      // Defense in depth: never create a brand-new `auth_users` account unless 14+ age eligibility
      // was evaluated and recorded before OTP issuance, AND staging eligibility still holds at verify time.
      if (!challenge.signup_age_eligible) {
        return {
          ok: false,
          status: 403,
          code: 'AGE_ASSESSMENT_REQUIRED',
          error: 'Complete the minimum account age check (14+) on Create Account before registering.'
        };
      }

      let verifyEnv = '';
      try {
        verifyEnv = getRuntimeEnv();
      } catch {
        verifyEnv = '';
      }
      const verifyEnforceAllowlist =
        modeLabel === 'staging_mailbox' || (verifyEnv === 'staging' && hasConfiguredStagingAllowlist());
      if (verifyEnforceAllowlist) {
        const verifyElig = await evaluateStagingRecipientEligibilityInTx(tx, emailNormalized, now);
        if (!verifyElig.ok || !verifyElig.allowed) {
          return {
            ok: false,
            status: 403,
            code: 'STAGING_ACCOUNT_NOT_ALLOWLISTED',
            error: STAGING_INVITATION_REQUIRED_MESSAGE
          };
        }
      }

      // Create standalone `auth_users` record with a fresh opaque ID (`usr_sa_<hex>`) and derived-only
      // eligibility metadata (`eligible_14_plus`, policy version, timestamp, self-reported basis).
      // Never queries or adopts legacy Hatchable IDs by email, and NEVER stores raw DOB.
      const candidateUserId = 'usr_sa_' + crypto.randomBytes(16).toString('hex');
      const insRes = await tx.query(
        `INSERT INTO auth_users (
           id, email_normalized, last_login_at, created_at, updated_at,
           age_eligibility_status, age_policy_version, age_assessed_at, age_assessment_basis
         )
         VALUES ($1, $2, $3, $3, $3, 'eligible_14_plus', $4, $5, 'self_reported_dob_at_signup')
         RETURNING id, email_normalized, disabled_at, age_eligibility_status`,
        [
          candidateUserId,
          emailNormalized,
          nowIso,
          challenge.signup_age_policy_version || AGE_POLICY_VERSION,
          challenge.signup_age_assessed_at || nowIso
        ]
      );
      userRow = insRes.rows[0];
    }

    // Session rotation on login: revoke any prior session presented by the browser
    if (priorRawToken) {
      const priorSha = sha256Hex(priorRawToken);
      await tx.query(
        'UPDATE auth_sessions SET revoked_at = $2 WHERE token_sha256 = $1 AND revoked_at IS NULL',
        [priorSha, nowIso]
      );
    }

    // Bound concurrent active sessions per user (`MAX_ACTIVE_SESSIONS_PER_USER`)
    await tx.query(
      `UPDATE auth_sessions
       SET revoked_at = $2
       WHERE id IN (
         SELECT id FROM auth_sessions
         WHERE user_id = $1
           AND revoked_at IS NULL
           AND expires_at > $2
         ORDER BY created_at DESC
         OFFSET $3
       )`,
      [userRow.id, nowIso, MAX_ACTIVE_SESSIONS_PER_USER - 1]
    );

    const rawSessionToken = crypto.randomBytes(32).toString('base64url');
    const tokenSha256 = sha256Hex(rawSessionToken);
    const expiresAtIso = new Date(nowMs + sessionTtlSeconds * 1000).toISOString();
    const maxExpiresAtIso = new Date(nowMs + MAX_SESSION_LIFETIME_SECONDS * 1000).toISOString();

    await tx.query(
      `INSERT INTO auth_sessions
         (token_sha256, user_id, ip_hash, ua_hash, created_at, last_seen_at, expires_at, max_expires_at)
       VALUES ($1, $2, $3, $4, $5, $5, $6, $7)`,
      [tokenSha256, userRow.id, ipHash, uaHash, nowIso, expiresAtIso, maxExpiresAtIso]
    );

    const ageStatus = userRow.age_eligibility_status || 'not_assessed';
    const requiresAgeAssessment = ageStatus !== 'eligible_14_plus';

    return {
      ok: true,
      status: 200,
      correlationId,
      setCookieHeader: buildSessionCookieHeader(rawSessionToken, sessionTtlSeconds),
      body: {
        ok: true,
        correlation_id: correlationId,
        user: {
          id: userRow.id,
          email: userRow.email_normalized,
          age_eligibility_status: ageStatus,
          requires_age_assessment: requiresAgeAssessment
        },
        requires_age_assessment: requiresAgeAssessment,
        passkeys_supported: false
      }
    };
  }).then(async result => {
    const stage = result.ok
      ? 'verify_succeeded'
      : result.status === 403
        ? 'account_disabled'
        : 'verify_failed';
    await recordAuthTelemetry(db, {
      correlationId,
      flow: 'verify',
      deliveryMode: modeLabel,
      outcomeStage: stage,
      httpStatus: result.status,
      errorCode: result.ok ? null : result.code || (result.status === 401 ? 'INVALID_OR_EXPIRED_OTP' : 'VERIFY_DENIED'),
      now,
      logger
    });
    return { ...result, correlationId };
  });
}

export async function resolveSessionFromRequest(db, req, { now = new Date() } = {}) {
  const rawToken = extractRawSessionToken(req);
  if (!rawToken) {
    return { authenticated: false, user: null, refreshedCookieHeader: null };
  }

  const tokenSha256 = sha256Hex(rawToken);
  const nowMs = now.getTime();
  const nowIso = now.toISOString();
  const sessionTtlSeconds = Math.max(
    60,
    Math.min(
      MAX_SESSION_LIFETIME_SECONDS,
      Number(readEnvCompat('AUTH_SESSION_TTL_SECONDS', { defaultValue: String(DEFAULT_SESSION_TTL_SECONDS) }) || DEFAULT_SESSION_TTL_SECONDS)
    )
  );

  return withTransaction(db, async tx => {
    await enableAuthInternalContext(tx);
    const { rows } = await tx.query(
      `SELECT
         s.id AS session_id,
         s.user_id,
         s.expires_at,
         s.max_expires_at,
         s.revoked_at,
         u.email_normalized,
         u.disabled_at,
         u.age_eligibility_status
       FROM auth_sessions s
       JOIN auth_users u ON u.id = s.user_id
       WHERE s.token_sha256 = $1
       LIMIT 1`,
      [tokenSha256]
    );

    if (!rows.length) {
      return { authenticated: false, user: null, refreshedCookieHeader: null };
    }

    const row = rows[0];
    const expMs = new Date(row.expires_at).getTime();
    const maxExpMs = new Date(row.max_expires_at).getTime();

    if (
      row.revoked_at ||
      row.disabled_at ||
      !Number.isFinite(expMs) ||
      expMs <= nowMs ||
      !Number.isFinite(maxExpMs) ||
      maxExpMs <= nowMs
    ) {
      return { authenticated: false, user: null, refreshedCookieHeader: null };
    }

    // Sliding window renewal when past half-life (bounded by `max_expires_at`)
    let refreshedCookieHeader = null;
    const remainingMs = expMs - nowMs;
    const halfLifeMs = (sessionTtlSeconds * 1000) / 2;
    if (remainingMs < halfLifeMs) {
      const nextExpMs = Math.min(maxExpMs, nowMs + sessionTtlSeconds * 1000);
      if (nextExpMs > expMs) {
        const nextExpIso = new Date(nextExpMs).toISOString();
        await tx.query(
          'UPDATE auth_sessions SET expires_at = $2, last_seen_at = $3 WHERE id = $1',
          [row.session_id, nextExpIso, nowIso]
        );
        refreshedCookieHeader = buildSessionCookieHeader(
          rawToken,
          Math.floor((nextExpMs - nowMs) / 1000)
        );
      }
    }

    const ageStatus = row.age_eligibility_status || 'not_assessed';
    return {
      authenticated: true,
      sessionId: row.session_id,
      user: {
        id: row.user_id,
        email: row.email_normalized,
        age_eligibility_status: ageStatus,
        requires_age_assessment: ageStatus !== 'eligible_14_plus'
      },
      refreshedCookieHeader
    };
  });
}

/**
 * Completes the documented next-sign-in minimum-age assessment (`POST /api/auth/age-assessment`)
 * for pre-existing accounts whose `age_eligibility_status` is `'not_assessed'`.
 *
 * - Never stores raw date of birth.
 * - If eligible (14+), records `eligible_14_plus`, `AGE_POLICY_VERSION`, timestamp, and
 *   `self_reported_dob_next_signin`.
 * - If under 14, disables the account (`disabled_at`), revokes active sessions immediately, sets
 *   the cooldown cookie, and records a redacted audit entry without retaining any DOB fields.
 *   Historical non-auth records (bookings, favorites, reviews, support tickets) are NOT deleted
 *   automatically; retention/deletion handling for disabled under-14 pre-existing accounts is
 *   tracked as an explicit open legal-review item.
 */
export async function submitExistingAccountAgeAssessment(
  db,
  req,
  { dob, dob_year, dob_month, dob_day, now = new Date() } = {}
) {
  const sess = await resolveSessionFromRequest(db, req, { now });
  if (!sess.authenticated || !sess.user?.id) {
    return { ok: false, status: 401, code: 'AUTH_REQUIRED', error: 'Sign in is required.' };
  }

  if (sess.user.age_eligibility_status === 'eligible_14_plus') {
    return {
      ok: true,
      status: 200,
      refreshedCookieHeader: sess.refreshedCookieHeader,
      body: {
        ok: true,
        age_eligibility_status: 'eligible_14_plus',
        requires_age_assessment: false
      }
    };
  }

  if (hasAgeGateCooldownCookie(req)) {
    return {
      ok: false,
      status: 403,
      code: 'AGE_INELIGIBLE',
      error:
        'Accounts on BiteShark require users to be at least 14 years old under our proposed account policy.'
    };
  }

  const ageEval = evaluateMinimumAgeEligibility({ dob, dob_year, dob_month, dob_day }, now);
  if (!ageEval.valid) {
    return {
      ok: false,
      status: 400,
      code: ageEval.code,
      error: ageEval.error
    };
  }

  const nowIso = now.toISOString();

  return withTransaction(db, async tx => {
    await enableAuthInternalContext(tx);
    const { rows } = await tx.query(
      'SELECT id, disabled_at, age_eligibility_status FROM auth_users WHERE id = $1 FOR UPDATE',
      [sess.user.id]
    );
    if (!rows.length || rows[0].disabled_at) {
      return { ok: false, status: 403, error: 'Account is unavailable.' };
    }

    if (!ageEval.eligible) {
      try {
        await tx.query(
          'UPDATE auth_users SET disabled_at = $2, updated_at = $2 WHERE id = $1',
          [sess.user.id, nowIso]
        );
      } catch (err) {
        if (String(err?.message || '').includes('LAST_TOP_ADMIN_PROTECTED')) {
          return {
            ok: false,
            status: 409,
            code: 'LAST_TOP_ADMIN_PROTECTED',
            error: 'Cannot disable the last active Admin: Top account. Assign another eligible Admin: Top first.'
          };
        }
        throw err;
      }
      await tx.query(
        'UPDATE auth_sessions SET revoked_at = $2 WHERE user_id = $1 AND revoked_at IS NULL',
        [sess.user.id, nowIso]
      );
      await recordAuditLog(tx, {
        actorId: sess.user.id,
        actorRole: 'customer',
        targetType: 'auth_user',
        targetId: sess.user.id,
        action: 'account.age_assessment_ineligible',
        metadata: {
          policy_version: AGE_POLICY_VERSION,
          outcome: 'disabled_under_minimum_age'
        }
      });
      return {
        ok: false,
        status: 403,
        code: 'AGE_INELIGIBLE',
        error:
          'Accounts on BiteShark require users to be at least 14 years old under our proposed account policy. This account has been disabled and signed out.',
        setCookieHeaders: [
          buildClearedSessionCookieHeader(),
          buildAgeGateCooldownCookieHeader(DEFAULT_AGE_GATE_COOLDOWN_SECONDS)
        ]
      };
    }

    await tx.query(
      `UPDATE auth_users
       SET age_eligibility_status = 'eligible_14_plus',
           age_policy_version = $2,
           age_assessed_at = $3,
           age_assessment_basis = 'self_reported_dob_next_signin',
           updated_at = $3
       WHERE id = $1`,
      [sess.user.id, AGE_POLICY_VERSION, nowIso]
    );

    await recordAuditLog(tx, {
      actorId: sess.user.id,
      actorRole: 'customer',
      targetType: 'auth_user',
      targetId: sess.user.id,
      action: 'account.age_assessment_completed',
      metadata: {
        policy_version: AGE_POLICY_VERSION,
        basis: 'self_reported_dob_next_signin'
      }
    });

    return {
      ok: true,
      status: 200,
      refreshedCookieHeader: sess.refreshedCookieHeader,
      body: {
        ok: true,
        age_eligibility_status: 'eligible_14_plus',
        requires_age_assessment: false
      }
    };
  });
}

export async function revokeSessionFromRequest(db, req, { now = new Date() } = {}) {
  const rawToken = extractRawSessionToken(req);
  if (rawToken) {
    const tokenSha256 = sha256Hex(rawToken);
    await withTransaction(db, async tx => {
      await enableAuthInternalContext(tx);
      await tx.query(
        'UPDATE auth_sessions SET revoked_at = $2 WHERE token_sha256 = $1 AND revoked_at IS NULL',
        [tokenSha256, now.toISOString()]
      );
    });
  }

  return {
    ok: true,
    status: 200,
    setCookieHeader: buildClearedSessionCookieHeader(),
    body: { ok: true }
  };
}

/**
 * Operator-only staging test mailbox reader (`POST /api/auth/staging-mailbox`).
 * Returns 404 when disabled, in production, or when `X-Staging-Mailbox-Secret` does not match,
 * so ordinary public visitors cannot discover or query staging verification codes.
 */
export async function readProtectedStagingMailboxCode(db, req, { email, now = new Date() } = {}) {
  const deliveryCfg = inspectAuthDeliveryConfig();
  if (!deliveryCfg.valid || deliveryCfg.mode !== 'staging_mailbox') {
    return { ok: false, status: 404, error: 'Not found' };
  }

  const clientIp = resolveTrustedClientIp(req);
  const ipHash = sha256Hex(`mbx_ip:${clientIp}`).slice(0, 32);
  const mbxRl = await consumeAuthRateLimit(db, {
    scope: 'staging_mailbox_ip',
    subjectKey: ipHash,
    maxHits: Math.max(10, Number(readEnvCompat('STAGING_MAILBOX_IP_MAX', { defaultValue: '60' }) || 60)),
    windowSeconds: 900,
    now
  });
  if (!mbxRl.allowed) {
    return {
      ok: false,
      status: 429,
      retryAfterSeconds: mbxRl.retryAfterSeconds,
      error: 'Too many staging mailbox requests.'
    };
  }

  let expectedSecret = '';
  try {
    expectedSecret = readEnvCompat('STAGING_MAILBOX_SECRET', { securityCritical: true });
  } catch (err) {
    if (err instanceof EnvAliasConflictError) {
      return { ok: false, status: 404, error: 'Not found' };
    }
    throw err;
  }
  const providedSecret = String(
    req?.headers?.['x-staging-mailbox-secret'] || req?.headers?.['X-Staging-Mailbox-Secret'] || ''
  );
  if (!timingSafeStringMatch(expectedSecret, providedSecret)) {
    return { ok: false, status: 404, error: 'Not found' };
  }

  const emailNormalized = normalizeEmail(email);
  if (!emailNormalized || !isEmailAllowedInStagingMailbox(emailNormalized)) {
    return { ok: false, status: 403, error: 'Email is not an allowlisted staging test account.' };
  }

  const nowIso = now.toISOString();
  return withTransaction(db, async tx => {
    await enableAuthInternalContext(tx);
    await tx.query('DELETE FROM auth_staging_mailbox WHERE expires_at <= $1', [nowIso]);

    const { rows } = await tx.query(
      `SELECT m.challenge_id, m.ciphertext_b64, m.iv_b64, m.auth_tag_b64, m.expires_at
       FROM auth_staging_mailbox m
       JOIN auth_otp_challenges c ON c.id = m.challenge_id
       WHERE m.email_normalized = $1
         AND m.expires_at > $2
         AND c.consumed_at IS NULL
         AND c.invalidated_at IS NULL
       ORDER BY m.created_at DESC
       LIMIT 1`,
      [emailNormalized, nowIso]
    );

    if (!rows.length) {
      return { ok: false, status: 404, error: 'No active verification code for this test account.' };
    }

    const row = rows[0];
    const code = decryptStagingMailboxCode(
      {
        ciphertextB64: row.ciphertext_b64,
        ivB64: row.iv_b64,
        authTagB64: row.auth_tag_b64
      },
      emailNormalized,
      row.challenge_id
    );

    return {
      ok: true,
      status: 200,
      body: {
        email: emailNormalized,
        code,
        expires_at: new Date(row.expires_at).toISOString()
      }
    };
  });
}

export async function cleanupExpiredAuthRecords(db, { now = new Date() } = {}) {
  const nowMs = now.getTime();
  const nowIso = now.toISOString();
  const otpCutoffIso = new Date(nowMs - 24 * 60 * 60 * 1000).toISOString();
  const sessionCutoffIso = new Date(nowMs - 7 * 24 * 60 * 60 * 1000).toISOString();
  const rlCutoffIso = new Date(nowMs - AUTH_RATE_LIMIT_RETENTION_MS).toISOString();
  const telemetryCutoffIso = new Date(nowMs - AUTH_TELEMETRY_RETENTION_MS).toISOString();

  try {
    return await withTransaction(db, async tx => {
      await enableAuthInternalContext(tx);
      const mbDel = await tx.query('DELETE FROM auth_staging_mailbox WHERE expires_at <= $1', [nowIso]);
      const otpDel = await tx.query(
        `DELETE FROM auth_otp_challenges
         WHERE expires_at < $1
            OR (consumed_at IS NOT NULL AND consumed_at < $1)
            OR (invalidated_at IS NOT NULL AND invalidated_at < $1)`,
        [otpCutoffIso]
      );
      const sessDel = await tx.query(
        `DELETE FROM auth_sessions
         WHERE expires_at < $1
            OR max_expires_at < $1
            OR (revoked_at IS NOT NULL AND revoked_at < $1)`,
        [sessionCutoffIso]
      );
      const rlDel = await tx.query('DELETE FROM auth_rate_limits WHERE window_start < $1', [rlCutoffIso]);
      let telRowCount = 0;
      await tx.query('SAVEPOINT auth_tel_cleanup');
      try {
        const telDel = await tx.query('DELETE FROM auth_delivery_telemetry WHERE created_at < $1', [
          telemetryCutoffIso
        ]);
        telRowCount = telDel.rowCount || 0;
        await tx.query('RELEASE SAVEPOINT auth_tel_cleanup');
      } catch (telErr) {
        await tx.query('ROLLBACK TO SAVEPOINT auth_tel_cleanup');
        if (telErr?.code !== '42P01') throw telErr;
      }

      return {
        deleted_staging_mailbox: mbDel.rowCount || 0,
        deleted_otp_challenges: otpDel.rowCount || 0,
        deleted_sessions: sessDel.rowCount || 0,
        deleted_rate_limits: rlDel.rowCount || 0,
        deleted_auth_telemetry: telRowCount
      };
    });
  } catch (err) {
    // Graceful no-op when invoked on pre-017 schemas in legacy notification unit tests
    if (err?.code === '42P01') {
      return {
        deleted_staging_mailbox: 0,
        deleted_otp_challenges: 0,
        deleted_sessions: 0,
        deleted_rate_limits: 0,
        deleted_auth_telemetry: 0
      };
    }
    throw err;
  }
}

async function resolveTxtSafe(resolver, host, timeoutMs = 2500) {
  const fn = resolver && typeof resolver.resolveTxt === 'function' ? resolver.resolveTxt.bind(resolver) : dns.resolveTxt;
  let timer = null;
  try {
    const records = await Promise.race([
      fn(host),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const e = new Error('DNS_TIMEOUT');
          e.code = 'ETIMEOUT';
          reject(e);
        }, timeoutMs);
      })
    ]);
    return {
      ok: true,
      records: Array.isArray(records)
        ? records.map(chunks => (Array.isArray(chunks) ? chunks.join('') : String(chunks))).filter(Boolean)
        : []
    };
  } catch (err) {
    const code = String(err?.code || '');
    if (code === 'ENODATA' || code === 'ENOTFOUND' || code === 'NXDOMAIN') {
      return { ok: true, records: [] };
    }
    return { ok: false, errorCode: sanitizeDiagnosticCode(code || 'DNS_ERROR', 32) || 'DNS_ERROR', records: [] };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function resolveMxSafe(resolver, host, timeoutMs = 2500) {
  const fn = resolver && typeof resolver.resolveMx === 'function' ? resolver.resolveMx.bind(resolver) : dns.resolveMx;
  let timer = null;
  try {
    const records = await Promise.race([
      fn(host),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const e = new Error('DNS_TIMEOUT');
          e.code = 'ETIMEOUT';
          reject(e);
        }, timeoutMs);
      })
    ]);
    return {
      ok: true,
      records: Array.isArray(records)
        ? records.map(r => String(r?.exchange || '').toLowerCase()).filter(Boolean)
        : []
    };
  } catch (err) {
    const code = String(err?.code || '');
    if (code === 'ENODATA' || code === 'ENOTFOUND' || code === 'NXDOMAIN') {
      return { ok: true, records: [] };
    }
    return { ok: false, errorCode: sanitizeDiagnosticCode(code || 'DNS_ERROR', 32) || 'DNS_ERROR', records: [] };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function inspectSenderDomainDns(domain, resolverOverride = null) {
  const cleanDomain = typeof domain === 'string' ? domain.trim().toLowerCase() : '';
  if (!cleanDomain || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(cleanDomain)) {
    return null;
  }
  const resolver = resolverOverride || customDnsResolver || dns;

  const [rootTxt, dmarcTxt, dkimTxt, sendTxt, sendMx] = await Promise.all([
    resolveTxtSafe(resolver, cleanDomain),
    resolveTxtSafe(resolver, `_dmarc.${cleanDomain}`),
    resolveTxtSafe(resolver, `resend._domainkey.${cleanDomain}`),
    resolveTxtSafe(resolver, `send.${cleanDomain}`),
    resolveMxSafe(resolver, `send.${cleanDomain}`)
  ]);

  const spfRecords = rootTxt.records.filter(r => /^v=spf1(\s|$)/i.test(r.trim()));
  const spfFirst = spfRecords[0] || null;
  const blocksAllMail = Boolean(spfFirst && /^v=spf1\s+-all$/i.test(spfFirst.trim()));
  const hasMultipleSpf = spfRecords.length > 1;
  const authorizesRootSenders = Boolean(
    spfFirst && !blocksAllMail && /\b(include:|ip4:|ip6:|a\b|mx\b)/i.test(spfFirst)
  );

  const dmarcRecords = dmarcTxt.records.filter(r => /^v=DMARC1\s*;/i.test(r.trim()));
  const dmarcFirst = dmarcRecords[0] || null;
  const dmarcPolicyMatch = dmarcFirst ? /\bp=([a-z]+)/i.exec(dmarcFirst) : null;
  const dmarcPolicy = dmarcPolicyMatch ? dmarcPolicyMatch[1].toLowerCase() : null;

  const dkimPresent = dkimTxt.records.some(r => /\bp=[A-Za-z0-9+/=]{16,}/.test(r) || /dkim/i.test(r));
  const sendSpfRecords = sendTxt.records.filter(r => /^v=spf1(\s|$)/i.test(r.trim()));
  const sendSpfPresent = sendSpfRecords.length === 1 && !/^v=spf1\s+-all$/i.test(sendSpfRecords[0].trim());
  const sendMxPresent = sendMx.records.length > 0;

  return {
    domain: cleanDomain,
    spf: {
      lookup_ok: rootTxt.ok,
      present: spfRecords.length > 0,
      record_count: spfRecords.length,
      multiple_records_invalid: hasMultipleSpf,
      blocks_all_mail: blocksAllMail,
      authorizes_senders: authorizesRootSenders,
      status: !rootTxt.ok
        ? 'lookup_failed'
        : hasMultipleSpf
          ? 'invalid_multiple_spf'
          : blocksAllMail
            ? 'blocks_all_mail'
            : authorizesRootSenders
              ? 'configured'
              : 'missing'
    },
    dmarc: {
      lookup_ok: dmarcTxt.ok,
      present: dmarcRecords.length > 0,
      policy: dmarcPolicy,
      status: !dmarcTxt.ok ? 'lookup_failed' : dmarcRecords.length > 0 ? 'configured' : 'missing'
    },
    resend_dkim: {
      selector_host: `resend._domainkey.${cleanDomain}`,
      lookup_ok: dkimTxt.ok,
      present: dkimPresent,
      status: !dkimTxt.ok ? 'lookup_failed' : dkimPresent ? 'configured' : 'missing'
    },
    return_path_send: {
      subdomain: `send.${cleanDomain}`,
      spf_present: sendSpfPresent,
      mx_present: sendMxPresent,
      status: sendSpfPresent && sendMxPresent ? 'configured' : 'missing'
    },
    ready_for_authenticated_sending: Boolean(
      dkimPresent && dmarcRecords.length > 0 && !hasMultipleSpf && (sendSpfPresent || authorizesRootSenders)
    )
  };
}

export async function inspectAdminEmailReadiness(db, { dnsResolver = null } = {}) {
  const aliasConflicts = findSecurityEnvConflicts();
  const deliveryCfg = inspectAuthDeliveryConfig();

  let runtimeEnv = 'unknown';
  let publicOrigin = null;
  let apiKeyPresent = false;
  let fromConfigured = false;
  let senderDomain = null;
  let senderDisplayName = null;
  let endpointHost = null;
  let mailboxSecretPresent = false;
  let allowlistedDomainsCount = 0;
  let allowlistedEmailsCount = 0;

  try {
    runtimeEnv = getRuntimeEnv() || 'unset';
  } catch {
    runtimeEnv = 'conflict';
  }
  try {
    publicOrigin = readEnvCompat('PUBLIC_ORIGIN', { securityCritical: true }) || null;
  } catch {
    publicOrigin = null;
  }
  try {
    apiKeyPresent = readEnvCompat('AUTH_EMAIL_API_KEY', { securityCritical: true }).length > 0;
  } catch {
    apiKeyPresent = false;
  }
  try {
    const rawFrom = readEnvCompat('AUTH_EMAIL_FROM', { securityCritical: true });
    if (rawFrom) {
      fromConfigured = true;
      const parsed = parseConfiguredSenderAddress(rawFrom);
      if (parsed.valid) {
        senderDomain = parsed.senderDomain;
        senderDisplayName = parsed.displayName;
      }
    }
  } catch {
    fromConfigured = false;
  }
  try {
    const rawEndpoint = readEnvCompat('AUTH_EMAIL_API_URL', {
      securityCritical: true,
      defaultValue: deliveryCfg.mode === 'resend_https' ? 'https://api.resend.com/emails' : ''
    });
    if (rawEndpoint) {
      const u = new URL(rawEndpoint);
      endpointHost = u.host.toLowerCase();
    }
  } catch {
    endpointHost = null;
  }
  try {
    mailboxSecretPresent = readEnvCompat('STAGING_MAILBOX_SECRET', { securityCritical: true }).length >= 24;
  } catch {
    mailboxSecretPresent = false;
  }
  try {
    allowlistedDomainsCount = parseAllowlistedDomains().size;
    allowlistedEmailsCount = parseAllowlistedEmails().size;
  } catch {
    allowlistedDomainsCount = 0;
    allowlistedEmailsCount = 0;
  }

  let domainToInspect = senderDomain;
  if (!domainToInspect && publicOrigin) {
    try {
      const h = new URL(publicOrigin).hostname.toLowerCase();
      domainToInspect = h.startsWith('staging.') ? h.slice('staging.'.length) : h;
    } catch {
      domainToInspect = null;
    }
  }

  const senderDomainDns = domainToInspect ? await inspectSenderDomainDns(domainToInspect, dnsResolver) : null;

  let recentFailures = [];
  let lastSuccessfulDesignatedTest = null;

  if (db) {
    try {
      await withTransaction(db, async tx => {
        await enableAuthInternalContext(tx);
        const failQ = await tx.query(
          `SELECT correlation_id, delivery_mode, outcome_stage, http_status, provider_status, error_code, created_at
           FROM auth_delivery_telemetry
           WHERE outcome_stage IN ('delivery_unavailable', 'provider_rejected', 'provider_timeout')
           ORDER BY created_at DESC
           LIMIT 10`
        );
        recentFailures = failQ.rows.map(r => ({
          correlation_id: r.correlation_id,
          delivery_mode: r.delivery_mode,
          outcome_stage: r.outcome_stage,
          http_status: r.http_status,
          provider_status: r.provider_status,
          error_code: r.error_code,
          created_at: new Date(r.created_at).toISOString()
        }));

        const okQ = await tx.query(
          `SELECT correlation_id, delivery_mode, provider_status, provider_message_id, created_at
           FROM auth_delivery_telemetry
           WHERE outcome_stage = 'provider_accepted' AND is_designated_test = true
           ORDER BY created_at DESC
           LIMIT 1`
        );
        if (okQ.rows.length > 0) {
          const row = okQ.rows[0];
          lastSuccessfulDesignatedTest = {
            correlation_id: row.correlation_id,
            delivery_mode: row.delivery_mode,
            provider_status: row.provider_status,
            provider_message_id: row.provider_message_id,
            created_at: new Date(row.created_at).toISOString()
          };
        }
      });
    } catch {
      recentFailures = [];
      lastSuccessfulDesignatedTest = null;
    }
  }

  const nextSteps = [];
  if (aliasConflicts.length > 0) {
    nextSteps.push(
      `Resolve conflicting BITESHARK_* / TRUCKLY_* environment variables: ${aliasConflicts.join(', ')}.`
    );
  }
  if (deliveryCfg.mode === 'staging_mailbox') {
    nextSteps.push(
      'Real external email delivery is currently disabled (`staging_mailbox` mode). Codes are stored only in the loopback-protected operator staging mailbox.'
    );
  }
  if (!apiKeyPresent || !fromConfigured) {
    nextSteps.push(
      'Provision a transactional HTTPS email provider (e.g. Resend), verify the sender domain, and configure BITESHARK_AUTH_EMAIL_API_KEY and BITESHARK_AUTH_EMAIL_FROM in /etc/truckly-staging/staging.env.'
    );
  }
  if (senderDomainDns) {
    if (senderDomainDns.spf.multiple_records_invalid) {
      nextSteps.push(
        `Consolidate multiple v=spf1 TXT records on ${senderDomainDns.domain} into a single SPF TXT record.`
      );
    }
    if (!senderDomainDns.resend_dkim.present || !senderDomainDns.return_path_send.mx_present || !senderDomainDns.return_path_send.spf_present) {
      nextSteps.push(
        `Publish the exact DKIM (e.g. ${senderDomainDns.resend_dkim.selector_host}) and custom return-path (${senderDomainDns.return_path_send.subdomain} MX + SPF TXT) DNS records issued by your email provider, preserving existing root SPF without adding a second v=spf1 record.`
      );
    }
  }
  if (deliveryCfg.mode !== 'resend_https' && deliveryCfg.mode !== 'webhook_https') {
    nextSteps.push(
      'After domain verification and secret configuration, switch BITESHARK_AUTH_DELIVERY_MODE=resend_https (updating any legacy TRUCKLY_AUTH_DELIVERY_MODE alias identically or removing it), restart truckly-staging-api, and verify inbox receipt on an allowlisted operator address.'
    );
  }

  return {
    effective_mode: deliveryCfg.mode,
    real_email_enabled: Boolean(deliveryCfg.valid && deliveryCfg.enabled && deliveryCfg.mode !== 'staging_mailbox'),
    config_valid: Boolean(deliveryCfg.valid),
    config_enabled: Boolean(deliveryCfg.enabled),
    config_reason: deliveryCfg.reason || null,
    configuration: {
      runtime_env: runtimeEnv,
      public_origin: publicOrigin,
      alias_conflicts: aliasConflicts,
      api_key_present: apiKeyPresent,
      sender_configured: fromConfigured,
      sender_display_name: senderDisplayName,
      sender_domain: senderDomain,
      provider_endpoint_host: endpointHost,
      staging_mailbox_secret_present: mailboxSecretPresent,
      staging_allowlist: {
        allowed_domains_count: allowlistedDomainsCount,
        allowed_emails_count: allowlistedEmailsCount,
        enforced_in_staging: runtimeEnv === 'staging' && (deliveryCfg.mode === 'staging_mailbox' || allowlistedDomainsCount > 0 || allowlistedEmailsCount > 0)
      }
    },
    sender_domain_dns: senderDomainDns,
    recent_failures: recentFailures,
    last_successful_designated_test: lastSuccessfulDesignatedTest,
    required_next_steps: nextSteps,
    observed_at: new Date().toISOString()
  };
}
