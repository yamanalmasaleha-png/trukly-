import crypto from 'node:crypto';
import { parseCookie, serialize as serializeCookie } from 'cookie';
import { generateSecret, generate as generateOtpToken } from 'otplib';
import { withTransaction } from './db-tx.js';
import { resolveTrustedClientIp } from './client-ip.js';
import { EnvAliasConflictError, readEnvCompat } from './env-compat.js';
import { recordAuditLog } from './authz.js';
import { AGE_POLICY_VERSION, evaluateMinimumAgeEligibility } from './age-policy.js';

export const SESSION_COOKIE_NAME = '__Host-truckly_session';
export const AGE_GATE_COOKIE_NAME = '__Host-bs_age_gate';
export const DEFAULT_AGE_GATE_COOLDOWN_SECONDS = 900; // 15 minutes (constant '1' browser cooldown flag; contains no identifier)
export const AUTH_RATE_LIMIT_RETENTION_MS = 24 * 60 * 60 * 1000; // 24 hours for minimized/pseudonymous rate-limit buckets
export const DEFAULT_OTP_TTL_SECONDS = 600; // 10 minutes
export const DEFAULT_OTP_MAX_ATTEMPTS = 5;
export const DEFAULT_SESSION_TTL_SECONDS = 14 * 24 * 60 * 60; // 14 days
export const MAX_SESSION_LIFETIME_SECONDS = 30 * 24 * 60 * 60; // 30 days hard cap
export const MAX_ACTIVE_SESSIONS_PER_USER = 10;

const EPHEMERAL_DEV_SECRET = crypto.randomBytes(32).toString('hex');
const DUMMY_CHALLENGE_ID = '00000000-0000-4000-8000-000000000000';

let customEmailSender = null;

export function setCustomAuthEmailSenderForTests(fn) {
  customEmailSender = typeof fn === 'function' ? fn : null;
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

    if (!customEmailSender && (!apiKey || !fromAddr || !endpoint.startsWith('https://'))) {
      return {
        valid: false,
        enabled: false,
        mode,
        reason: 'HTTPS transactional email requires AUTH_EMAIL_API_KEY, AUTH_EMAIL_FROM, and an https:// endpoint.'
      };
    }
    return { valid: true, enabled: true, mode, endpoint, apiKey, fromAddr };
  }

  return {
    valid: false,
    enabled: false,
    mode,
    reason: `Unrecognized AUTH_DELIVERY_MODE: ${mode}`
  };
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

async function sendOtpEmailHttps(deliveryCfg, { email, code, ttlMinutes }) {
  if (customEmailSender) {
    await customEmailSender({ email, code, ttlMinutes, mode: deliveryCfg.mode });
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const body =
      deliveryCfg.mode === 'resend_https'
        ? {
            from: deliveryCfg.fromAddr,
            to: [email],
            subject: 'Your BiteShark verification code',
            text: `Your BiteShark sign-in code is ${code}. It expires in ${ttlMinutes} minutes. If you did not request this code, ignore this email.`
          }
        : {
            to: email,
            from: deliveryCfg.fromAddr,
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
    if (!res.ok) {
      throw new Error(`Email provider responded with HTTP ${res.status}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

export async function startEmailOtpChallenge(
  db,
  req,
  { email, intent, dob, dob_year, dob_month, dob_day, now = new Date() } = {}
) {
  const emailNormalized = normalizeEmail(email);
  if (!emailNormalized) {
    return { ok: false, status: 400, error: 'Enter a valid email address.' };
  }

  const deliveryCfg = inspectAuthDeliveryConfig();
  if (!deliveryCfg.valid || !deliveryCfg.enabled) {
    return {
      ok: false,
      status: 503,
      code: 'AUTH_DELIVERY_UNAVAILABLE',
      error: 'Email sign-in is temporarily unavailable on this environment.'
    };
  }

  if (deliveryCfg.mode === 'staging_mailbox' && !isEmailAllowedInStagingMailbox(emailNormalized)) {
    return {
      ok: false,
      status: 403,
      code: 'STAGING_ACCOUNT_NOT_ALLOWLISTED',
      error: 'Staging sign-in is restricted to designated operator test accounts.'
    };
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
    return {
      ok: false,
      status: 429,
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
      return {
        ok: false,
        status: 403,
        code: 'AGE_INELIGIBLE',
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
        return {
          ok: false,
          status: 429,
          retryAfterSeconds: ageIpRl.retryAfterSeconds,
          code: 'AGE_GATE_RATE_LIMITED',
          error: 'Too many registration attempts from this network. Please wait before trying again.'
        };
      }
      return {
        ok: false,
        status: 403,
        code: 'AGE_INELIGIBLE',
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
    return {
      ok: false,
      status: 429,
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

  await withTransaction(db, async tx => {
    await enableAuthInternalContext(tx);
    // Serialize concurrent OTP issuance per normalized email so at most 1 active challenge exists
    await tx.query("SELECT pg_advisory_xact_lock(hashtext('auth_otp_start:' || $1))", [emailNormalized]);

    const existingUserRes = await tx.query(
      'SELECT id FROM auth_users WHERE email_normalized = $1 LIMIT 1',
      [emailNormalized]
    );
    const hasExistingAccount = existingUserRes.rows.length > 0;

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

  if (shouldDeliverOtp && (deliveryCfg.mode === 'resend_https' || deliveryCfg.mode === 'webhook_https')) {
    try {
      await sendOtpEmailHttps(deliveryCfg, {
        email: emailNormalized,
        code: otpCode,
        ttlMinutes: Math.max(1, Math.round(otpTtlSeconds / 60))
      });
    } catch {
      await withTransaction(db, async tx => {
        await enableAuthInternalContext(tx);
        await tx.query(
          'UPDATE auth_otp_challenges SET invalidated_at = $2 WHERE id = $1',
          [challengeId, new Date().toISOString()]
        );
      }).catch(() => {});

      return {
        ok: false,
        status: 503,
        code: 'AUTH_EMAIL_SEND_FAILED',
        error: 'Could not send a verification code right now. Please try again shortly.'
      };
    }
  }

  // Non-enumerating uniform response regardless of whether `auth_users` already has this email
  return {
    ok: true,
    status: 200,
    body: {
      ok: true,
      expires_in_seconds: otpTtlSeconds,
      has_passkey: false,
      passkeys_supported: false
    }
  };
}

export async function verifyEmailOtpChallenge(db, req, { email, code, now = new Date() } = {}) {
  const emailNormalized = normalizeEmail(email);
  const cleanCode = typeof code === 'string' ? code.trim() : '';
  if (!emailNormalized || !/^\d{6}$/.test(cleanCode)) {
    return { ok: false, status: 400, error: 'Enter your email address and 6-digit verification code.' };
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
    return {
      ok: false,
      status: 429,
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
    return {
      ok: false,
      status: 429,
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
      // was evaluated and recorded before OTP issuance.
      if (!challenge.signup_age_eligible) {
        return {
          ok: false,
          status: 403,
          code: 'AGE_ASSESSMENT_REQUIRED',
          error: 'Complete the minimum account age check (14+) on Create Account before registering.'
        };
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
      setCookieHeader: buildSessionCookieHeader(rawSessionToken, sessionTtlSeconds),
      body: {
        ok: true,
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
      await tx.query(
        'UPDATE auth_users SET disabled_at = $2, updated_at = $2 WHERE id = $1',
        [sess.user.id, nowIso]
      );
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

      return {
        deleted_staging_mailbox: mbDel.rowCount || 0,
        deleted_otp_challenges: otpDel.rowCount || 0,
        deleted_sessions: sessDel.rowCount || 0,
        deleted_rate_limits: rlDel.rowCount || 0
      };
    });
  } catch (err) {
    // Graceful no-op when invoked on pre-017 schemas in legacy notification unit tests
    if (err?.code === '42P01') {
      return {
        deleted_staging_mailbox: 0,
        deleted_otp_challenges: 0,
        deleted_sessions: 0,
        deleted_rate_limits: 0
      };
    }
    throw err;
  }
}
