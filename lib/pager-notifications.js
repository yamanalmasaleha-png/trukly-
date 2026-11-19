// Durable, provider-neutral pickup-pager notification service, SSRF/CSRF guards,
// serverless rate-limiter, outbox + ready-state catch-up enqueueing, and
// wave-claimed, claim-token-fenced, live-rechecked delivery worker.
// Placed in lib/ (outside api/) so Hatchable does not expose helper modules as routes.

import crypto from 'node:crypto';
import net from 'node:net';
import { UUID_RE, isWritePaused, inspectWritePauseConfig } from './authz.js';
import { withTransaction } from './db-tx.js';
import { resolveTrustedClientIp } from './client-ip.js';
import { EnvAliasConflictError, readEnvCompat } from './env-compat.js';
import {
  toBase64Url,
  generateVapidKeys,
  validateVapidKeyPair,
  validateSubscriberKeys,
  createVapidHeaders,
  encryptWebPushPayload
} from './webpush-crypto.js';

export const MAX_ACTIVE_SUBSCRIPTIONS_PER_PAGER = 5;
export const MAX_CATCHUP_DELIVERIES_PER_EVENT = 5;
export const READY_FLAP_COOLDOWN_MS = 60 * 1000;
export const WORKER_LEASE_SECONDS = 45;
export const DEFAULT_WORKER_CONCURRENCY = 3;
export const DEFAULT_PROVIDER_TIMEOUT_MS = 5000;
export const DEFAULT_WORKER_EXECUTION_BUDGET_MS = 20000;
export const RETRY_BACKOFF_SECONDS = Object.freeze([15, 45, 120, 300, 600]);
export const RETENTION_HOURS = 24;

const VALID_RUNTIME_ENVS = new Set(['', 'local', 'development', 'test', 'staging', 'production']);

const DEFAULT_ALLOWED_PUSH_HOST_SUFFIXES = Object.freeze([
  'fcm.googleapis.com',
  'push.services.mozilla.com',
  'push.apple.com',
  'notify.windows.com'
]);

const EPHEMERAL_TEST_VAPID = Object.freeze(generateVapidKeys());

let customFakeProviderHandler = null;

export function setFakePushProviderForTests(fn) {
  customFakeProviderHandler = typeof fn === 'function' ? fn : null;
}

export function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

export async function enablePagerInternalContext(tx) {
  await tx.query("SELECT set_config('app.pager_internal', 'true', true)");
}

export function isProductionEnvironment() {
  let appEnv = '';
  try {
    appEnv = readEnvCompat('ENV', { securityCritical: true }).toLowerCase();
  } catch (err) {
    if (err instanceof EnvAliasConflictError) return true; // Fail closed on conflict
    throw err;
  }
  const nodeEnv = String(process.env.NODE_ENV || '').trim().toLowerCase();
  const projectId = String(process.env.HATCHABLE_PROJECT_ID || process.env.PROJECT_ID || '').trim();
  return (
    appEnv === 'production' ||
    nodeEnv === 'production' ||
    projectId === 'proj_MEO518rmLLl0'
  );
}

/**
 * Parses operational pause flags with fail-closed behavior:
 *   '' / '0' / 'false' -> { enabled: false, valid: true }
 *   '1' / 'true'       -> { enabled: true,  valid: true }
 *   any other value    -> { enabled: true,  valid: false } (pauses operation rather than ignoring typos)
 */
export function parseFailClosedBooleanFlag(rawVal) {
  const v = String(rawVal || '').trim().toLowerCase();
  if (v === '' || v === '0' || v === 'false') {
    return { enabled: false, valid: true, error: null };
  }
  if (v === '1' || v === 'true') {
    return { enabled: true, valid: true, error: null };
  }
  return {
    enabled: true,
    valid: false,
    error: "Invalid boolean control value; expected '0', '1', 'false', or 'true' (failing closed)."
  };
}

export function isSubscriptionsDisabled() {
  try {
    const flag = parseFailClosedBooleanFlag(readEnvCompat('DISABLE_SUBSCRIPTIONS', { securityCritical: true }));
    if (flag.enabled) return true;
  } catch (err) {
    if (err instanceof EnvAliasConflictError) return true;
    throw err;
  }
  return isWritePaused('notifications') || isWritePaused('pagers');
}

export function isNotificationDeliveryDisabled() {
  try {
    const flag = parseFailClosedBooleanFlag(readEnvCompat('DISABLE_NOTIFICATION_DELIVERY', { securityCritical: true }));
    if (flag.enabled) return true;
  } catch (err) {
    if (err instanceof EnvAliasConflictError) return true;
    throw err;
  }
  return isWritePaused('notifications');
}

export function getPushProviderConfig() {
  let rawEnv = '';
  let rawMode = '';
  try {
    rawEnv = readEnvCompat('ENV', { securityCritical: true }).toLowerCase();
    rawMode = readEnvCompat('PUSH_PROVIDER_MODE', { securityCritical: true }).toLowerCase();
  } catch (err) {
    if (err instanceof EnvAliasConflictError) {
      return {
        mode: 'invalid_config',
        configuredMode: 'conflict',
        enabled: false,
        configValid: false,
        configError: err.message,
        vapidPublicKey: null,
        vapidPrivateKey: null,
        vapidSubject: null
      };
    }
    throw err;
  }

  if (!VALID_RUNTIME_ENVS.has(rawEnv)) {
    return {
      mode: 'invalid_config',
      configuredMode: rawMode || 'disabled',
      enabled: false,
      configValid: false,
      configError: 'Invalid BITESHARK_ENV / TRUCKLY_ENV value; failing closed.',
      vapidPublicKey: null,
      vapidPrivateKey: null,
      vapidSubject: null
    };
  }

  const effectiveMode = rawMode === '' ? 'disabled' : rawMode;
  if (!['disabled', 'fake', 'loopback_test', 'webpush'].includes(effectiveMode)) {
    return {
      mode: 'invalid_config',
      configuredMode: effectiveMode,
      enabled: false,
      configValid: false,
      configError: "Invalid PUSH_PROVIDER_MODE; expected 'disabled' or 'webpush'.",
      vapidPublicKey: null,
      vapidPrivateKey: null,
      vapidSubject: null
    };
  }

  if (effectiveMode === 'disabled') {
    return {
      mode: 'disabled',
      configuredMode: 'disabled',
      enabled: false,
      configValid: true,
      configError: null,
      vapidPublicKey: null,
      vapidPrivateKey: null,
      vapidSubject: null
    };
  }

  if (effectiveMode === 'fake' || effectiveMode === 'loopback_test') {
    let allowTestModes = false;
    let pub = '';
    let priv = '';
    let sub = '';
    try {
      allowTestModes = readEnvCompat('ALLOW_TEST_PUSH_MODES', { securityCritical: true }) === '1';
      pub = readEnvCompat('VAPID_PUBLIC_KEY', { securityCritical: true }) || EPHEMERAL_TEST_VAPID.publicKey;
      priv = readEnvCompat('VAPID_PRIVATE_KEY', { securityCritical: true }) || EPHEMERAL_TEST_VAPID.privateKey;
      sub = readEnvCompat('VAPID_SUBJECT', { securityCritical: true }) || 'mailto:pager-test@biteshark.local';
    } catch (err) {
      if (err instanceof EnvAliasConflictError) {
        return {
          mode: 'invalid_config',
          configuredMode: effectiveMode,
          enabled: false,
          configValid: false,
          configError: err.message,
          vapidPublicKey: null,
          vapidPrivateKey: null,
          vapidSubject: null
        };
      }
      throw err;
    }
    if (isProductionEnvironment() || !allowTestModes) {
      return {
        mode: 'invalid_config',
        configuredMode: effectiveMode,
        enabled: false,
        configValid: false,
        configError: isProductionEnvironment()
          ? 'Simulated push provider modes (fake, loopback_test) are forbidden in production.'
          : 'Simulated push provider modes require ALLOW_TEST_PUSH_MODES=1 in non-production test environments.',
        vapidPublicKey: null,
        vapidPrivateKey: null,
        vapidSubject: null
      };
    }

    try {
      validateVapidKeyPair(pub, priv);
      if (!/^(mailto:[^@\s]+@[^@\s]+|https:\/\/[^\s]+)$/i.test(sub)) {
        throw new Error('Invalid VAPID subject');
      }
      return {
        mode: effectiveMode,
        configuredMode: effectiveMode,
        enabled: !isNotificationDeliveryDisabled(),
        configValid: true,
        configError: null,
        vapidPublicKey: pub,
        vapidPrivateKey: priv,
        vapidSubject: sub
      };
    } catch {
      return {
        mode: 'invalid_config',
        configuredMode: effectiveMode,
        enabled: false,
        configValid: false,
        configError: 'Invalid VAPID key pair or subject in simulated push mode.',
        vapidPublicKey: null,
        vapidPrivateKey: null,
        vapidSubject: null
      };
    }
  }

  // Real `webpush` mode requires explicit valid VAPID credentials
  let pub = '';
  let priv = '';
  let sub = '';
  try {
    pub = readEnvCompat('VAPID_PUBLIC_KEY', { securityCritical: true });
    priv = readEnvCompat('VAPID_PRIVATE_KEY', { securityCritical: true });
    sub = readEnvCompat('VAPID_SUBJECT', { securityCritical: true });
  } catch (err) {
    if (err instanceof EnvAliasConflictError) {
      return {
        mode: 'invalid_config',
        configuredMode: 'webpush',
        enabled: false,
        configValid: false,
        configError: err.message,
        vapidPublicKey: null,
        vapidPrivateKey: null,
        vapidSubject: null
      };
    }
    throw err;
  }
  if (!pub || !priv || !sub) {
    return {
      mode: 'webpush',
      configuredMode: 'webpush',
      enabled: false,
      configValid: false,
      configError: 'webpush mode requires VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT.',
      vapidPublicKey: null,
      vapidPrivateKey: null,
      vapidSubject: null
    };
  }
  try {
    validateVapidKeyPair(pub, priv);
    if (!/^(mailto:[^@\s]+@[^@\s]+|https:\/\/[^\s]+)$/i.test(sub)) {
      throw new Error('Invalid subject');
    }
    return {
      mode: 'webpush',
      configuredMode: 'webpush',
      enabled: !isNotificationDeliveryDisabled(),
      configValid: true,
      configError: null,
      vapidPublicKey: pub,
      vapidPrivateKey: priv,
      vapidSubject: sub
    };
  } catch {
    return {
      mode: 'webpush',
      configuredMode: 'webpush',
      enabled: false,
      configValid: false,
      configError: 'Invalid VAPID key pair or VAPID_SUBJECT format.',
      vapidPublicKey: null,
      vapidPrivateKey: null,
      vapidSubject: null
    };
  }
}

export function inspectNotificationRuntimeConfig() {
  const providerCfg = getPushProviderConfig();
  let subFlag;
  let delivFlag;
  let rawWorkerSecret = '';
  let workerSecretConflict = null;
  try {
    subFlag = parseFailClosedBooleanFlag(readEnvCompat('DISABLE_SUBSCRIPTIONS', { securityCritical: true }));
  } catch (err) {
    subFlag = { enabled: true, valid: false, error: err.message };
  }
  try {
    delivFlag = parseFailClosedBooleanFlag(readEnvCompat('DISABLE_NOTIFICATION_DELIVERY', { securityCritical: true }));
  } catch (err) {
    delivFlag = { enabled: true, valid: false, error: err.message };
  }
  try {
    rawWorkerSecret = readEnvCompat('NOTIFICATION_WORKER_SECRET', { securityCritical: true });
  } catch (err) {
    workerSecretConflict = err.message;
  }
  const writePause = inspectWritePauseConfig();
  const workerSecretConfigured = !workerSecretConflict && rawWorkerSecret.length >= 24;
  const workerSecretMalformed = rawWorkerSecret.length > 0 && rawWorkerSecret.length < 24;

  const configErrors = [];
  if (!providerCfg.configValid && providerCfg.configError) {
    configErrors.push(providerCfg.configError);
  }
  if (!subFlag.valid && subFlag.error) {
    configErrors.push(`DISABLE_SUBSCRIPTIONS: ${subFlag.error}`);
  }
  if (!delivFlag.valid && delivFlag.error) {
    configErrors.push(`DISABLE_NOTIFICATION_DELIVERY: ${delivFlag.error}`);
  }
  if (!writePause.valid) {
    configErrors.push(`PAUSE_WRITES contains unrecognized scope(s): ${writePause.invalidScopes.join(', ')}`);
  }
  if (workerSecretConflict) {
    configErrors.push(workerSecretConflict);
  } else if (workerSecretMalformed) {
    configErrors.push('NOTIFICATION_WORKER_SECRET must be at least 24 characters.');
  }

  return {
    provider_mode: providerCfg.mode,
    configured_provider_mode: providerCfg.configuredMode,
    provider_enabled: providerCfg.enabled,
    subscriptions_paused: isSubscriptionsDisabled(),
    delivery_paused: isNotificationDeliveryDisabled(),
    worker_secret_configured: workerSecretConfigured,
    config_valid: configErrors.length === 0,
    config_errors: configErrors
  };
}

function extraAllowedPushHosts() {
  let raw = '';
  try {
    raw = readEnvCompat('PUSH_ALLOWED_HOSTS', { securityCritical: true });
  } catch (err) {
    if (err instanceof EnvAliasConflictError) return new Set();
    throw err;
  }
  if (!raw) return new Set();
  return new Set(
    raw
      .split(',')
      .map(h => h.trim().toLowerCase())
      .filter(Boolean)
  );
}

function isAllowedWebPushHostname(hostname) {
  const host = String(hostname || '').toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) {
    return false;
  }
  if (net.isIP(host) !== 0 || host.startsWith('[')) {
    return false;
  }
  if (extraAllowedPushHosts().has(host)) return true;
  return DEFAULT_ALLOWED_PUSH_HOST_SUFFIXES.some(
    suffix => host === suffix || host.endsWith('.' + suffix)
  );
}

/**
 * Validates subscription destination & cryptographic material while blocking SSRF vectors
 * (non-HTTPS schemes, IP literals, localhost, custom ports, embedded credentials, unapproved hosts).
 */
export function validateSubscriptionPayload(body) {
  const b = body && typeof body === 'object' ? body : {};
  const channel = b.channel === undefined ? 'web_push' : String(b.channel).trim().toLowerCase();

  if (!['web_push', 'apns', 'fcm'].includes(channel)) {
    return { ok: false, status: 400, error: "Unsupported notification channel; expected 'web_push', 'apns', or 'fcm'." };
  }

  if (channel === 'apns' || channel === 'fcm') {
    const token = typeof b.device_token === 'string' ? b.device_token.trim() : '';
    if (!/^[A-Za-z0-9._:-]{32,512}$/.test(token)) {
      return { ok: false, status: 400, error: 'Invalid native push device_token format.' };
    }
    let nativeEnabled = false;
    try {
      nativeEnabled = readEnvCompat('ENABLE_NATIVE_PUSH', { securityCritical: true }) === '1';
    } catch (err) {
      if (!(err instanceof EnvAliasConflictError)) throw err;
    }
    if (!nativeEnabled) {
      return {
        ok: false,
        status: 501,
        code: 'NATIVE_PUSH_NOT_CONFIGURED',
        error: 'Native APNs/FCM push requires a packaged mobile app and server provider configuration.'
      };
    }
    return {
      ok: true,
      channel,
      destinationHash: sha256Hex(`${channel}:${token}`),
      endpointUrl: null,
      p256dhKey: null,
      authSecret: null,
      deviceToken: token
    };
  }

  const subObj = b.subscription && typeof b.subscription === 'object' ? b.subscription : b;
  const rawEndpoint = typeof subObj.endpoint === 'string' ? subObj.endpoint.trim() : '';
  if (!rawEndpoint || rawEndpoint.length > 1024) {
    return { ok: false, status: 400, error: 'A valid Web Push subscription endpoint URL is required.' };
  }

  let parsed;
  try {
    parsed = new URL(rawEndpoint);
  } catch {
    return { ok: false, status: 400, error: 'Malformed Web Push subscription endpoint URL.' };
  }

  if (parsed.username || parsed.password || parsed.hash) {
    return { ok: false, status: 400, error: 'Subscription endpoint URL must not include credentials or fragments.' };
  }
  if (!parsed.pathname || parsed.pathname === '/' || parsed.pathname.includes('..')) {
    return { ok: false, status: 400, error: 'Subscription endpoint URL must include a valid push capability path.' };
  }

  const providerCfg = getPushProviderConfig();
  const isLoopbackTestAllowed =
    providerCfg.enabled &&
    providerCfg.mode === 'loopback_test' &&
    !isProductionEnvironment() &&
    parsed.protocol === 'http:' &&
    parsed.hostname === '127.0.0.1' &&
    parsed.port !== '';

  if (!isLoopbackTestAllowed) {
    if (parsed.protocol !== 'https:') {
      return { ok: false, status: 400, error: 'Web Push endpoint must use HTTPS.' };
    }
    if (parsed.port !== '') {
      return { ok: false, status: 400, error: 'Web Push endpoint must use standard HTTPS port 443.' };
    }
    if (!isAllowedWebPushHostname(parsed.hostname)) {
      return { ok: false, status: 400, error: 'Web Push endpoint host is not a recognized push service provider.' };
    }
  }

  const keys = subObj.keys && typeof subObj.keys === 'object' ? subObj.keys : {};
  const keyValidation = validateSubscriberKeys(keys.p256dh, keys.auth);
  if (!keyValidation.ok) {
    return { ok: false, status: 400, error: keyValidation.error };
  }

  const normalizedEndpoint = parsed.toString();
  return {
    ok: true,
    channel: 'web_push',
    destinationHash: sha256Hex(`web_push:${normalizedEndpoint}`),
    endpointUrl: normalizedEndpoint,
    p256dhKey: keyValidation.p256dhNormalized,
    authSecret: keyValidation.authNormalized,
    deviceToken: null
  };
}

/**
 * Protects browser subscription mutations against cross-site request forgery (CSRF).
 */
export function verifySameOriginMutation(req) {
  const headers = req?.headers || {};
  const clientHeader = String(
    headers['x-biteshark-client'] ||
      headers['X-BiteShark-Client'] ||
      headers['x-truckly-client'] ||
      headers['X-Truckly-Client'] ||
      ''
  ).trim();
  if (clientHeader !== 'web-pager-v1') {
    return { ok: false, status: 403, error: 'Missing required X-BiteShark-Client request header.' };
  }

  const secFetchSite = String(headers['sec-fetch-site'] || headers['Sec-Fetch-Site'] || '').trim().toLowerCase();
  if (secFetchSite && !['same-origin', 'none'].includes(secFetchSite)) {
    return { ok: false, status: 403, error: 'Cross-site subscription requests are forbidden.' };
  }

  const origin = String(headers.origin || headers.Origin || '').trim();
  const host = String(headers.host || headers.Host || '').trim();
  if (origin && host) {
    try {
      const originHost = new URL(origin).host.toLowerCase();
      if (originHost !== host.toLowerCase()) {
        return { ok: false, status: 403, error: 'Cross-origin subscription requests are forbidden.' };
      }
    } catch {
      return { ok: false, status: 403, error: 'Invalid Origin header.' };
    }
  }

  return { ok: true };
}

export function extractClientRateKey(req) {
  const clientIp = resolveTrustedClientIp(req);
  return sha256Hex(clientIp || 'anon').slice(0, 24);
}

export async function consumePagerRateLimit(
  db,
  { scope, subjectKey, maxHits, windowSeconds, now = new Date() }
) {
  const bucketHash = 'rl:' + sha256Hex(`${scope}|${subjectKey}`).slice(0, 28);
  const windowMs = windowSeconds * 1000;
  const windowStartMs = Math.floor(now.getTime() / windowMs) * windowMs;
  const windowStartIso = new Date(windowStartMs).toISOString();

  return withTransaction(db, async tx => {
    await enablePagerInternalContext(tx);
    const { rows } = await tx.query(
      `INSERT INTO pager_rate_limits (bucket_key, window_start, hit_count)
       VALUES ($1, $2, 1)
       ON CONFLICT (bucket_key, window_start) DO UPDATE
         SET hit_count = pager_rate_limits.hit_count + 1
       RETURNING hit_count`,
      [bucketHash, windowStartIso]
    );
    const hits = Number(rows[0]?.hit_count || 1);
    return {
      allowed: hits <= maxHits,
      hits,
      retryAfterSeconds: Math.max(1, Math.ceil((windowStartMs + windowMs - now.getTime()) / 1000))
    };
  });
}

export function redactProviderError(rawError) {
  const msg = String(rawError?.message || rawError || 'provider_error');
  return msg
    .replace(/https?:\/\/[^\s"'<>]+/gi, '[REDACTED_URL]')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '[REDACTED_UUID]')
    .replace(/vapid\s+t=[^\s,]+/gi, 'vapid t=[REDACTED]')
    .slice(0, 180);
}

function buildPagerReadyEventSpec(pager, seq) {
  const pagerHashPrefix = sha256Hex(pager.id).slice(0, 16);
  const collapseKey = `pager-ready:${pagerHashPrefix}`;
  const dedupeKey = `pager:${pagerHashPrefix}:ready:${seq}`;
  const expiresIso = new Date(pager.expires_at).toISOString();

  // Minimal lock-screen-safe payload — NEVER includes the raw private pager bearer UUID!
  const safePayload = {
    version: 1,
    event_type: 'pager.ready',
    vendor: String(pager.vendor || 'Food Truck').slice(0, 80),
    ticket: String(pager.ticket || '').slice(0, 40),
    title: 'BiteShark · Order Ready for Pickup',
    body: `Ticket #${String(pager.ticket || '').slice(0, 40)} at ${String(pager.vendor || 'the counter').slice(0, 80)} is ready for pickup.`,
    collapse_key: collapseKey
  };

  return {
    collapseKey,
    dedupeKey,
    expiresIso,
    safePayload
  };
}

/**
 * Ensures the canonical `pager_notification_events` row exists for `(pager.id, seq)`
 * and returns its `eventId`. Safe under concurrent callers via `ON CONFLICT (dedupe_key) DO NOTHING`.
 */
async function ensureReadyEventInTx(tx, { pager, seq, nowIso }) {
  const spec = buildPagerReadyEventSpec(pager, seq);
  const { rows: inserted } = await tx.query(
    `INSERT INTO pager_notification_events (
       pager_id, vendor_id, event_type, transition_seq, dedupe_key, collapse_key, payload, created_at, expires_at
     )
     VALUES ($1, $2, 'pager.ready', $3, $4, $5, $6::jsonb, $7, $8)
     ON CONFLICT (dedupe_key) DO NOTHING
     RETURNING id`,
    [
      pager.id,
      pager.vendor_id || null,
      seq,
      spec.dedupeKey,
      spec.collapseKey,
      JSON.stringify(spec.safePayload),
      nowIso,
      spec.expiresIso
    ]
  );

  if (inserted.length > 0) {
    return { eventId: inserted[0].id, newlyInserted: true };
  }

  const { rows: existing } = await tx.query(
    'SELECT id FROM pager_notification_events WHERE dedupe_key = $1',
    [spec.dedupeKey]
  );
  return { eventId: existing[0]?.id || null, newlyInserted: false };
}

/**
 * Atomically handles outbox event creation or terminal/revert suppression inside
 * `POST /api/pager/update`'s existing database transaction (`tx`).
 * Suppresses both queued/retry rows and claimed-but-not-yet-dispatched (`dispatched_at IS NULL`) rows.
 */
export async function handlePagerTransitionNotificationsInTx(
  tx,
  { pager, nextStatus, now = new Date() }
) {
  await enablePagerInternalContext(tx);
  const nowIso = now.toISOString();

  // Terminal ticket transition (`collected` or `cancelled`): suppress un-dispatched alerts & scrub subscriptions
  if (nextStatus === 'collected' || nextStatus === 'cancelled') {
    await tx.query(
      `UPDATE pager_notification_deliveries
       SET status = 'suppressed',
           last_error_code = 'ticket_terminal',
           lease_owner = NULL,
           claim_token = NULL,
           claimed_at = NULL,
           dispatched_at = NULL,
           lease_expires_at = NULL,
           updated_at = $2
       WHERE pager_id = $1
         AND (
           status IN ('queued', 'retry_scheduled')
           OR (status = 'processing' AND dispatched_at IS NULL)
         )`,
      [pager.id, nowIso]
    );
    await tx.query(
      `UPDATE pager_notification_subscriptions
       SET status = 'expired',
           invalidated_reason = $2,
           endpoint_url = NULL,
           p256dh_key = NULL,
           auth_secret = NULL,
           device_token = NULL,
           updated_at = $3
       WHERE pager_id = $1 AND status = 'active'`,
      [pager.id, `ticket_${nextStatus}`, nowIso]
    );
    return { eventCreated: false, reason: `ticket_${nextStatus}` };
  }

  // Non-ready transition (`cooking` or `almost`): suppress any un-dispatched ready deliveries if kitchen stepped back
  if (nextStatus !== 'ready') {
    await tx.query(
      `UPDATE pager_notification_deliveries
       SET status = 'suppressed',
           last_error_code = 'status_reverted',
           lease_owner = NULL,
           claim_token = NULL,
           claimed_at = NULL,
           dispatched_at = NULL,
           lease_expires_at = NULL,
           updated_at = $2
       WHERE pager_id = $1
         AND (
           status IN ('queued', 'retry_scheduled')
           OR (status = 'processing' AND dispatched_at IS NULL)
         )`,
      [pager.id, nowIso]
    );
    return { eventCreated: false, reason: 'not_ready_transition' };
  }

  // Duplicate `ready -> ready` update does not emit a second event
  if (pager.status === 'ready') {
    return { eventCreated: false, reason: 'already_ready' };
  }

  // Anti-flap cooldown: prevent rapid ready -> almost -> ready button mashing from spamming subscribers
  if (pager.ready_notified_at) {
    const elapsedMs = now.getTime() - new Date(pager.ready_notified_at).getTime();
    if (elapsedMs >= 0 && elapsedMs < READY_FLAP_COOLDOWN_MS) {
      return { eventCreated: false, reason: 'flap_cooldown' };
    }
  }

  const nextSeq = Number(pager.ready_notify_count || 0) + 1;
  await tx.query(
    `UPDATE pickup_pagers
     SET ready_notified_at = $2,
         ready_notify_count = $3
     WHERE id = $1`,
    [pager.id, nowIso, nextSeq]
  );

  const { eventId, newlyInserted } = await ensureReadyEventInTx(tx, {
    pager,
    seq: nextSeq,
    nowIso
  });

  if (!eventId || !newlyInserted) {
    return { eventCreated: false, reason: 'deduplicated' };
  }

  const { rowCount } = await tx.query(
    `INSERT INTO pager_notification_deliveries (
       event_id, subscription_id, pager_id, status, delivery_origin, next_attempt_at, created_at, updated_at
     )
     SELECT $1, s.id, s.pager_id, 'queued', 'transition', $3, $3, $3
     FROM pager_notification_subscriptions s
     WHERE s.pager_id = $2
       AND s.status = 'active'
       AND s.expires_at > $3
     ON CONFLICT (event_id, subscription_id) DO NOTHING`,
    [eventId, pager.id, nowIso]
  );

  return {
    eventCreated: true,
    eventId,
    queuedDeliveries: Number(rowCount || 0)
  };
}

/**
 * Atomically enqueues a ready-state catch-up delivery inside `POST /api/pager/subscriptions`'s
 * `FOR NO KEY UPDATE` transaction when a customer subscribes to an active, non-expired ticket
 * that is already in `status = 'ready'`.
 */
export async function enqueueReadyCatchupInTx(
  tx,
  {
    pager,
    subscriptionId,
    priorStatus = null,
    replacedSubscriptionId = null,
    now = new Date()
  }
) {
  await enablePagerInternalContext(tx);
  const nowIso = now.toISOString();

  if (
    !pager ||
    pager.status !== 'ready' ||
    new Date(pager.expires_at).getTime() <= now.getTime()
  ) {
    return { queued: false, reason: 'pager_not_ready' };
  }

  let effectiveSeq = Number(pager.ready_notify_count || 0);
  if (effectiveSeq < 1) {
    effectiveSeq = 1;
    await tx.query(
      `UPDATE pickup_pagers
       SET ready_notify_count = 1,
           ready_notified_at = COALESCE(ready_notified_at, $2)
       WHERE id = $1`,
      [pager.id, nowIso]
    );
  }

  const { eventId } = await ensureReadyEventInTx(tx, {
    pager,
    seq: effectiveSeq,
    nowIso
  });
  if (!eventId) {
    return { queued: false, reason: 'event_unavailable' };
  }

  // If rotating from a prior subscription on the same pager that ALREADY received this ready event,
  // suppress duplicate catch-up so endpoint rotation does not re-buzz the customer.
  if (replacedSubscriptionId && replacedSubscriptionId !== subscriptionId) {
    const { rows: priorDeliv } = await tx.query(
      `SELECT id
       FROM pager_notification_deliveries
       WHERE event_id = $1
         AND subscription_id = $2
         AND (status = 'delivered' OR delivered_at IS NOT NULL)
       LIMIT 1`,
      [eventId, replacedSubscriptionId]
    );
    if (priorDeliv.length > 0) {
      return { queued: false, reason: 'already_delivered_prior_token', eventId };
    }
  }

  // Inspect existing delivery for `(eventId, subscriptionId)`
  const { rows: existingRows } = await tx.query(
    `SELECT id, status, attempt_count, max_attempts, delivered_at
     FROM pager_notification_deliveries
     WHERE event_id = $1 AND subscription_id = $2
     FOR UPDATE`,
    [eventId, subscriptionId]
  );

  if (existingRows.length > 0) {
    const existing = existingRows[0];
    if (existing.status === 'delivered' || existing.delivered_at !== null) {
      return { queued: false, reason: 'already_delivered_for_cycle', eventId };
    }
    if (['queued', 'processing', 'retry_scheduled'].includes(existing.status)) {
      return { queued: false, reason: 'already_enqueued_for_cycle', eventId };
    }
    // Reactivation of a previously unsubscribed/invalidated subscription that had NOT yet received
    // the ready push: re-queue that single row if within max_attempts and per-event catch-up cap.
    if (
      existing.status === 'suppressed' &&
      priorStatus &&
      priorStatus !== 'active' &&
      existing.attempt_count < existing.max_attempts
    ) {
      const { rows: capRows } = await tx.query(
        `SELECT count(*)::int AS c
         FROM pager_notification_deliveries
         WHERE event_id = $1 AND delivery_origin = 'catchup' AND id <> $2`,
        [eventId, existing.id]
      );
      if (Number(capRows[0]?.c || 0) >= MAX_CATCHUP_DELIVERIES_PER_EVENT) {
        return { queued: false, reason: 'catchup_cap_reached', eventId };
      }
      await tx.query(
        `UPDATE pager_notification_deliveries
         SET status = 'queued',
             delivery_origin = 'catchup',
             next_attempt_at = $2,
             last_error_code = NULL,
             last_error_redacted = NULL,
             lease_owner = NULL,
             claim_token = NULL,
             claimed_at = NULL,
             dispatched_at = NULL,
             lease_expires_at = NULL,
             updated_at = $2
         WHERE id = $1`,
        [existing.id, nowIso]
      );
      return {
        queued: true,
        reason: 'reactivated_undelivered',
        eventId,
        deliveryId: existing.id
      };
    }

    return { queued: false, reason: `existing_${existing.status}`, eventId };
  }

  // Enforce per-event catch-up ceiling so repeated DELETE + new-endpoint loops cannot storm a ticket
  const { rows: capRows } = await tx.query(
    `SELECT count(*)::int AS c
     FROM pager_notification_deliveries
     WHERE event_id = $1 AND delivery_origin = 'catchup'`,
    [eventId]
  );
  if (Number(capRows[0]?.c || 0) >= MAX_CATCHUP_DELIVERIES_PER_EVENT) {
    return { queued: false, reason: 'catchup_cap_reached', eventId };
  }

  const { rows: insertedDeliv } = await tx.query(
    `INSERT INTO pager_notification_deliveries (
       event_id, subscription_id, pager_id, status, delivery_origin, next_attempt_at, created_at, updated_at
     )
     VALUES ($1, $2, $3, 'queued', 'catchup', $4, $4, $4)
     ON CONFLICT (event_id, subscription_id) DO NOTHING
     RETURNING id`,
    [eventId, subscriptionId, pager.id, nowIso]
  );

  if (!insertedDeliv.length) {
    return { queued: false, reason: 'already_enqueued_for_cycle', eventId };
  }

  return {
    queued: true,
    reason: 'ready_ticket_catchup',
    eventId,
    deliveryId: insertedDeliv[0].id
  };
}

async function dispatchToProvider(
  freshTarget,
  providerCfg,
  { now = new Date(), timeoutMs = DEFAULT_PROVIDER_TIMEOUT_MS } = {}
) {
  const wirePayload = JSON.stringify({
    ...freshTarget.payload,
    event_id: freshTarget.event_id,
    subscription_id: freshTarget.subscription_id,
    open_url: `/#pager-ref=${freshTarget.subscription_id}`
  });

  const encryptedBody = encryptWebPushPayload(
    wirePayload,
    freshTarget.p256dh_key,
    freshTarget.auth_secret
  );
  const ttlSeconds = Math.max(
    60,
    Math.min(14400, Math.floor((new Date(freshTarget.pager_expires_at).getTime() - now.getTime()) / 1000))
  );

  const vapid = createVapidHeaders({
    endpointUrl: freshTarget.endpoint_url,
    subject: providerCfg.vapidSubject,
    publicKey: providerCfg.vapidPublicKey,
    privateKey: providerCfg.vapidPrivateKey,
    nowSec: Math.floor(now.getTime() / 1000)
  });

  const headers = {
    'Content-Type': 'application/octet-stream',
    'Content-Encoding': 'aes128gcm',
    'Content-Length': String(encryptedBody.length),
    TTL: String(ttlSeconds),
    Urgency: 'high',
    Topic: freshTarget.collapse_key.slice(0, 32),
    Authorization: vapid.Authorization
  };

  if (providerCfg.mode === 'fake') {
    if (customFakeProviderHandler) {
      return customFakeProviderHandler({
        deliveryId: freshTarget.delivery_id,
        eventId: freshTarget.event_id,
        subscriptionId: freshTarget.subscription_id,
        claimToken: freshTarget.claim_token,
        endpointUrl: freshTarget.endpoint_url,
        headers,
        encryptedBody,
        attemptCount: freshTarget.attempt_count
      });
    }
    return { status: 201, provider: 'fake_webpush' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(freshTarget.endpoint_url, {
      method: 'POST',
      headers,
      body: encryptedBody,
      redirect: 'error',
      signal: controller.signal
    });
    return {
      status: resp.status,
      provider: providerCfg.mode === 'loopback_test' ? 'loopback_webpush' : 'webpush'
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function purgeExpiredNotificationRecords(db, { now = new Date() } = {}) {
  const nowIso = now.toISOString();
  const retentionCutoffIso = new Date(now.getTime() - RETENTION_HOURS * 3600 * 1000).toISOString();
  const rateLimitCutoffIso = new Date(now.getTime() - 2 * 3600 * 1000).toISOString();

  return withTransaction(db, async tx => {
    await enablePagerInternalContext(tx);

    const expiredSubs = await tx.query(
      `UPDATE pager_notification_subscriptions s
       SET status = 'expired',
           invalidated_reason = COALESCE(s.invalidated_reason, 'ttl_expired'),
           endpoint_url = NULL,
           p256dh_key = NULL,
           auth_secret = NULL,
           device_token = NULL,
           updated_at = $1
       FROM pickup_pagers p
       WHERE p.id = s.pager_id
         AND s.status = 'active'
         AND (s.expires_at <= $1 OR p.expires_at <= $1 OR p.status IN ('collected', 'cancelled'))`,
      [nowIso]
    );

    const expiredDeliveries = await tx.query(
      `UPDATE pager_notification_deliveries d
       SET status = 'expired',
           last_error_code = 'event_expired',
           lease_owner = NULL,
           claim_token = NULL,
           claimed_at = NULL,
           dispatched_at = NULL,
           lease_expires_at = NULL,
           updated_at = $1
       FROM pager_notification_events e
       WHERE e.id = d.event_id
         AND (
           d.status IN ('queued', 'retry_scheduled')
           OR (d.status = 'processing' AND d.lease_expires_at <= $1)
         )
         AND e.expires_at <= $1`,
      [nowIso]
    );

    const deletedDeliveries = await tx.query(
      `DELETE FROM pager_notification_deliveries
       WHERE status IN ('delivered', 'failed_permanent', 'expired', 'suppressed')
         AND updated_at < $1`,
      [retentionCutoffIso]
    );

    const deletedEvents = await tx.query(
      `DELETE FROM pager_notification_events e
       WHERE e.expires_at < $1
         AND NOT EXISTS (
           SELECT 1 FROM pager_notification_deliveries d
           WHERE d.event_id = e.id AND d.status IN ('queued', 'processing', 'retry_scheduled')
         )`,
      [retentionCutoffIso]
    );

    const deletedSubs = await tx.query(
      `DELETE FROM pager_notification_subscriptions s
       WHERE s.status IN ('unsubscribed', 'invalidated', 'expired')
         AND s.updated_at < $1`,
      [retentionCutoffIso]
    );

    const deletedRateBuckets = await tx.query(
      `DELETE FROM pager_rate_limits WHERE window_start < $1`,
      [rateLimitCutoffIso]
    );

    return {
      scrubbed_expired_subscriptions: Number(expiredSubs.rowCount || 0),
      expired_deliveries: Number(expiredDeliveries.rowCount || 0),
      purged_deliveries: Number(deletedDeliveries.rowCount || 0),
      purged_events: Number(deletedEvents.rowCount || 0),
      purged_subscriptions: Number(deletedSubs.rowCount || 0),
      purged_rate_buckets: Number(deletedRateBuckets.rowCount || 0)
    };
  });
}

async function claimDueDeliveryWave(db, { limit, workerId, leaseSeconds, now }) {
  const nowIso = now.toISOString();
  const leaseUntilIso = new Date(now.getTime() + leaseSeconds * 1000).toISOString();

  return withTransaction(db, async tx => {
    await enablePagerInternalContext(tx);
    const { rows } = await tx.query(
      `WITH due AS (
         SELECT d.id
         FROM pager_notification_deliveries d
         WHERE (
           (d.status IN ('queued', 'retry_scheduled') AND d.next_attempt_at <= $1)
           OR
           (d.status = 'processing' AND d.lease_expires_at <= $1)
         )
         ORDER BY d.next_attempt_at ASC, d.created_at ASC
         LIMIT $2
         FOR UPDATE SKIP LOCKED
       )
       UPDATE pager_notification_deliveries d
       SET status = 'processing',
           lease_owner = $3,
           claim_token = 'ct_' || gen_random_uuid()::text,
           claimed_at = $1,
           dispatched_at = NULL,
           lease_expires_at = $4,
           updated_at = $1
       FROM due
       WHERE d.id = due.id
       RETURNING
         d.id AS delivery_id,
         d.event_id,
         d.subscription_id,
         d.pager_id,
         d.claim_token,
         d.lease_expires_at,
         d.attempt_count`,
      [nowIso, limit, workerId, leaseUntilIso]
    );
    return rows;
  });
}

async function releaseClaimedDeliveryBeforeSend(
  db,
  { deliveryId, workerId, claimToken, now }
) {
  const nowIso = now.toISOString();
  return withTransaction(db, async tx => {
    await enablePagerInternalContext(tx);
    const { rowCount } = await tx.query(
      `UPDATE pager_notification_deliveries
       SET status = CASE WHEN attempt_count > 0 THEN 'retry_scheduled' ELSE 'queued' END,
           lease_owner = NULL,
           claim_token = NULL,
           claimed_at = NULL,
           dispatched_at = NULL,
           lease_expires_at = NULL,
           updated_at = $4
       WHERE id = $1
         AND status = 'processing'
         AND dispatched_at IS NULL
         AND lease_owner = $2
         AND claim_token = $3
         AND lease_expires_at > $4`,
      [deliveryId, workerId, claimToken, nowIso]
    );
    return Number(rowCount || 0) > 0;
  });
}

/**
 * Re-verifies current lease ownership (`workerId` + `claimToken` + unexpired `lease_expires_at`)
 * and refreshes live delivery, subscription, event, and pager state immediately before network dispatch.
 * Never holds a transaction open across network I/O, and never trusts earlier copied endpoint/key fields.
 */
async function prepareClaimForDispatch(
  db,
  { claimed, workerId, leaseSeconds, now }
) {
  const nowMs = now.getTime();
  const nowIso = now.toISOString();
  const renewedLeaseIso = new Date(nowMs + leaseSeconds * 1000).toISOString();

  return withTransaction(db, async tx => {
    await enablePagerInternalContext(tx);
    const { rows } = await tx.query(
      `SELECT
         d.id AS delivery_id,
         d.status AS delivery_status,
         d.lease_owner,
         d.claim_token,
         d.lease_expires_at,
         d.attempt_count,
         d.max_attempts,
         e.id AS event_id,
         e.collapse_key,
         e.payload,
         e.expires_at AS event_expires_at,
         s.id AS subscription_id,
         s.channel,
         s.status AS sub_status,
         s.endpoint_url,
         s.p256dh_key,
         s.auth_secret,
         s.device_token,
         s.expires_at AS sub_expires_at,
         p.id AS pager_id,
         p.status AS pager_status,
         p.expires_at AS pager_expires_at
       FROM pager_notification_deliveries d
       JOIN pager_notification_events e ON e.id = d.event_id
       JOIN pager_notification_subscriptions s ON s.id = d.subscription_id
       JOIN pickup_pagers p ON p.id = d.pager_id
       WHERE d.id = $1
       FOR UPDATE OF d
       FOR SHARE OF s, p`,
      [claimed.delivery_id]
    );

    if (!rows.length) {
      return { proceed: false, outcome: 'missing' };
    }

    const row = rows[0];

    // 1. Confirm current claim ownership & active `processing` state
    if (
      row.delivery_status !== 'processing' ||
      row.lease_owner !== workerId ||
      row.claim_token !== claimed.claim_token
    ) {
      if (row.delivery_status === 'suppressed' || row.delivery_status === 'expired') {
        return { proceed: false, outcome: 'already_suppressed' };
      }
      return { proceed: false, outcome: 'lease_superseded' };
    }

    // 2. Refuse to dispatch on an expired lease (never renew an already-expired lease)
    if (new Date(row.lease_expires_at).getTime() <= nowMs) {
      return { proceed: false, outcome: 'lease_expired' };
    }

    // 3. Re-evaluate live event/pager/subscription freshness & eligibility
    const eventExpired = new Date(row.event_expires_at).getTime() <= nowMs;
    const pagerExpired = new Date(row.pager_expires_at).getTime() <= nowMs;
    const subExpired = new Date(row.sub_expires_at).getTime() <= nowMs;
    const missingChannelMaterial =
      row.channel === 'web_push'
        ? !row.endpoint_url || !row.p256dh_key || !row.auth_secret
        : !row.device_token;
    const subInactive = row.sub_status !== 'active' || subExpired || missingChannelMaterial;
    const pagerNotReady = row.pager_status !== 'ready';

    if (eventExpired || pagerExpired || subInactive || pagerNotReady) {
      const targetStatus = eventExpired || pagerExpired ? 'expired' : 'suppressed';
      const reasonCode = eventExpired || pagerExpired
        ? 'expired_before_send'
        : subInactive
          ? row.sub_status === 'unsubscribed'
            ? 'user_unsubscribed'
            : 'subscription_inactive'
          : ['collected', 'cancelled'].includes(row.pager_status)
            ? 'ticket_terminal'
            : 'status_reverted';

      await tx.query(
        `UPDATE pager_notification_deliveries
         SET status = $2,
             last_error_code = $3,
             lease_owner = NULL,
             claim_token = NULL,
             claimed_at = NULL,
             dispatched_at = NULL,
             lease_expires_at = NULL,
             updated_at = $4
         WHERE id = $1
           AND status = 'processing'
           AND lease_owner = $5
           AND claim_token = $6`,
        [row.delivery_id, targetStatus, reasonCode, nowIso, workerId, claimed.claim_token]
      );
      return { proceed: false, outcome: 'suppressed_before_send' };
    }

    // 4. Enforce max_attempts ceiling (including crashed in-flight attempts recovered after lease expiry)
    if (row.attempt_count >= row.max_attempts) {
      await tx.query(
        `UPDATE pager_notification_deliveries
         SET status = 'failed_permanent',
             last_error_code = 'max_attempts_exceeded',
             lease_owner = NULL,
             claim_token = NULL,
             claimed_at = NULL,
             dispatched_at = NULL,
             lease_expires_at = NULL,
             updated_at = $2
         WHERE id = $1
           AND status = 'processing'
           AND lease_owner = $3
           AND claim_token = $4`,
        [row.delivery_id, nowIso, workerId, claimed.claim_token]
      );
      return { proceed: false, outcome: 'max_attempts_exceeded' };
    }

    // 5. Mark delivery in-flight (`dispatched_at`), increment `attempt_count`, and refresh lease window
    //    for the bounded network request.
    const { rows: updatedRows } = await tx.query(
      `UPDATE pager_notification_deliveries
       SET attempt_count = attempt_count + 1,
           dispatched_at = $2,
           lease_expires_at = $3,
           updated_at = $2
       WHERE id = $1
         AND status = 'processing'
         AND lease_owner = $4
         AND claim_token = $5
         AND lease_expires_at > $2
       RETURNING attempt_count`,
      [row.delivery_id, nowIso, renewedLeaseIso, workerId, claimed.claim_token]
    );

    if (!updatedRows.length) {
      return { proceed: false, outcome: 'lease_expired' };
    }

    return {
      proceed: true,
      freshTarget: {
        delivery_id: row.delivery_id,
        event_id: row.event_id,
        subscription_id: row.subscription_id,
        claim_token: claimed.claim_token,
        attempt_count: updatedRows[0].attempt_count,
        max_attempts: row.max_attempts,
        collapse_key: row.collapse_key,
        payload: row.payload,
        channel: row.channel,
        endpoint_url: row.endpoint_url,
        p256dh_key: row.p256dh_key,
        auth_secret: row.auth_secret,
        device_token: row.device_token,
        pager_expires_at: row.pager_expires_at
      }
    };
  });
}

/**
 * Fences post-send acknowledgments, retries, and `404`/`410` subscription invalidation
 * strictly to the active `(delivery_id, status='processing', lease_owner, claim_token)`.
 */
async function acknowledgeClaimedDelivery(
  db,
  { freshTarget, workerId, providerMode, providerResult, sendError, now }
) {
  const nowMs = now.getTime();
  const nowIso = now.toISOString();
  const httpStatus = providerResult ? Number(providerResult.status || 0) : 0;
  const providerName = providerResult?.provider || providerMode;

  return withTransaction(db, async tx => {
    await enablePagerInternalContext(tx);

    const { rows } = await tx.query(
      `SELECT
         d.id,
         d.status,
         d.lease_owner,
         d.claim_token,
         d.attempt_count,
         d.max_attempts,
         s.status AS sub_status,
         s.expires_at AS sub_expires_at,
         p.status AS pager_status,
         p.expires_at AS pager_expires_at
       FROM pager_notification_deliveries d
       JOIN pager_notification_subscriptions s ON s.id = d.subscription_id
       JOIN pickup_pagers p ON p.id = d.pager_id
       WHERE d.id = $1
       FOR UPDATE OF d
       FOR SHARE OF s, p`,
      [freshTarget.delivery_id]
    );

    if (
      !rows.length ||
      rows[0].status !== 'processing' ||
      rows[0].lease_owner !== workerId ||
      rows[0].claim_token !== freshTarget.claim_token
    ) {
      return { outcome: 'fenced_stale_ack' };
    }

    const row = rows[0];

    // Successful HTTP 2xx delivery
    if (!sendError && httpStatus >= 200 && httpStatus < 300) {
      await tx.query(
        `UPDATE pager_notification_deliveries
         SET status = 'delivered',
             provider_name = $2,
             provider_status = $3,
             delivered_at = $4,
             last_error_code = NULL,
             last_error_redacted = NULL,
             lease_owner = NULL,
             claim_token = NULL,
             lease_expires_at = NULL,
             updated_at = $4
         WHERE id = $1 AND lease_owner = $5 AND claim_token = $6`,
        [freshTarget.delivery_id, providerName, httpStatus, nowIso, workerId, freshTarget.claim_token]
      );
      return { outcome: 'delivered' };
    }

    // Permanent subscription invalidation (`404 Not Found` or `410 Gone` from push service)
    if (!sendError && (httpStatus === 404 || httpStatus === 410)) {
      await tx.query(
        `UPDATE pager_notification_deliveries
         SET status = 'failed_permanent',
             provider_name = $2,
             provider_status = $3,
             last_error_code = $4,
             last_error_redacted = 'Push subscription expired or unsubscribed at provider',
             lease_owner = NULL,
             claim_token = NULL,
             lease_expires_at = NULL,
             updated_at = $5
         WHERE id = $1 AND lease_owner = $6 AND claim_token = $7`,
        [
          freshTarget.delivery_id,
          providerName,
          httpStatus,
          `provider_${httpStatus}`,
          nowIso,
          workerId,
          freshTarget.claim_token
        ]
      );
      const subUpd = await tx.query(
        `UPDATE pager_notification_subscriptions
         SET status = 'invalidated',
             invalidated_reason = $2,
             endpoint_url = NULL,
             p256dh_key = NULL,
             auth_secret = NULL,
             device_token = NULL,
             updated_at = $3
         WHERE id = $1 AND status = 'active'`,
        [freshTarget.subscription_id, `provider_${httpStatus}`, nowIso]
      );
      return {
        outcome: 'failed_permanent',
        invalidatedSubscription: Number(subUpd.rowCount || 0) > 0
      };
    }

    // If subscription or pager became inactive/terminal/expired while the failed request was in flight,
    // suppress/expire instead of scheduling pointless retries.
    const pagerExpired = new Date(row.pager_expires_at).getTime() <= nowMs;
    const subExpired = new Date(row.sub_expires_at).getTime() <= nowMs;
    if (pagerExpired || row.pager_status !== 'ready' || row.sub_status !== 'active' || subExpired) {
      const targetStatus = pagerExpired ? 'expired' : 'suppressed';
      const reasonCode = pagerExpired
        ? 'expired_during_send'
        : row.sub_status !== 'active' || subExpired
          ? 'subscription_inactive'
          : ['collected', 'cancelled'].includes(row.pager_status)
            ? 'ticket_terminal'
            : 'status_reverted';

      await tx.query(
        `UPDATE pager_notification_deliveries
         SET status = $2,
             provider_name = $3,
             provider_status = $4,
             last_error_code = $5,
             lease_owner = NULL,
             claim_token = NULL,
             claimed_at = NULL,
             dispatched_at = NULL,
             lease_expires_at = NULL,
             updated_at = $6
         WHERE id = $1 AND lease_owner = $7 AND claim_token = $8`,
        [
          freshTarget.delivery_id,
          targetStatus,
          providerName,
          httpStatus || null,
          reasonCode,
          nowIso,
          workerId,
          freshTarget.claim_token
        ]
      );
      return { outcome: 'suppressed' };
    }

    const isRetryable =
      Boolean(sendError) ||
      httpStatus === 408 ||
      httpStatus === 429 ||
      httpStatus >= 500 ||
      httpStatus === 0;

    const redactedErr = sendError
      ? redactProviderError(sendError)
      : `Push provider returned HTTP ${httpStatus}`;
    const errCode = sendError ? 'network_or_timeout' : `http_${httpStatus}`;

    if (!isRetryable || row.attempt_count >= row.max_attempts) {
      await tx.query(
        `UPDATE pager_notification_deliveries
         SET status = 'failed_permanent',
             provider_name = $2,
             provider_status = $3,
             last_error_code = $4,
             last_error_redacted = $5,
             lease_owner = NULL,
             claim_token = NULL,
             lease_expires_at = NULL,
             updated_at = $6
         WHERE id = $1 AND lease_owner = $7 AND claim_token = $8`,
        [
          freshTarget.delivery_id,
          providerName,
          httpStatus || null,
          row.attempt_count >= row.max_attempts ? 'max_attempts_reached' : errCode,
          redactedErr,
          nowIso,
          workerId,
          freshTarget.claim_token
        ]
      );
      return { outcome: 'failed_permanent' };
    }

    const backoffSec =
      RETRY_BACKOFF_SECONDS[Math.min(row.attempt_count - 1, RETRY_BACKOFF_SECONDS.length - 1)];
    const nextAttemptIso = new Date(nowMs + backoffSec * 1000).toISOString();

    await tx.query(
      `UPDATE pager_notification_deliveries
       SET status = 'retry_scheduled',
           provider_name = $2,
           provider_status = $3,
           last_error_code = $4,
           last_error_redacted = $5,
           next_attempt_at = $6,
           lease_owner = NULL,
           claim_token = NULL,
           claimed_at = NULL,
           dispatched_at = NULL,
           lease_expires_at = NULL,
           updated_at = $7
       WHERE id = $1 AND lease_owner = $8 AND claim_token = $9`,
      [
        freshTarget.delivery_id,
        providerName,
        httpStatus || null,
        errCode,
        redactedErr,
        nextAttemptIso,
        nowIso,
        workerId,
        freshTarget.claim_token
      ]
    );
    return { outcome: 'retried' };
  });
}

async function processSingleClaimedDelivery(
  db,
  {
    claimed,
    workerId,
    leaseSeconds,
    providerTimeoutMs,
    startedAtMs,
    executionBudgetMs,
    getNow,
    hooks,
    summary
  }
) {
  const preCheckNow = getNow();
  const providerCfg = getPushProviderConfig();
  const budgetExceeded = preCheckNow.getTime() - startedAtMs >= executionBudgetMs;

  if (isNotificationDeliveryDisabled() || !providerCfg.enabled || budgetExceeded) {
    if (budgetExceeded) summary.budget_exhausted = true;
    const released = await releaseClaimedDeliveryBeforeSend(db, {
      deliveryId: claimed.delivery_id,
      workerId,
      claimToken: claimed.claim_token,
      now: preCheckNow
    });
    if (released) summary.released_unprocessed++;
    else summary.aborted_lease_lost++;
    return;
  }

  const prep = await prepareClaimForDispatch(db, {
    claimed,
    workerId,
    leaseSeconds,
    now: getNow()
  });

  if (!prep.proceed) {
    if (prep.outcome === 'suppressed_before_send' || prep.outcome === 'already_suppressed') {
      summary.suppressed++;
    } else if (prep.outcome === 'max_attempts_exceeded') {
      summary.failed_permanent++;
    } else if (prep.outcome === 'lease_expired') {
      summary.aborted_lease_expired++;
    } else {
      summary.aborted_lease_lost++;
    }
    return;
  }

  let providerResult = null;
  let sendError = null;
  try {
    providerResult = await dispatchToProvider(prep.freshTarget, providerCfg, {
      now: getNow(),
      timeoutMs: providerTimeoutMs
    });
  } catch (err) {
    sendError = err;
  }

  if (typeof hooks?.onBeforeAck === 'function') {
    await hooks.onBeforeAck({
      deliveryId: prep.freshTarget.delivery_id,
      claimToken: prep.freshTarget.claim_token,
      workerId,
      providerResult,
      sendError
    });
  }

  // Deterministic crash-after-send hook for testing at-least-once lease recovery:
  // leaves the row in `processing` until `lease_expires_at` passes.
  if (providerResult && providerResult.simulateCrashBeforeAck === true) {
    return;
  }

  const ack = await acknowledgeClaimedDelivery(db, {
    freshTarget: prep.freshTarget,
    workerId,
    providerMode: providerCfg.mode,
    providerResult,
    sendError,
    now: getNow()
  });

  if (ack.outcome === 'delivered') {
    summary.delivered++;
  } else if (ack.outcome === 'retried') {
    summary.retried++;
  } else if (ack.outcome === 'suppressed') {
    summary.suppressed++;
  } else if (ack.outcome === 'failed_permanent') {
    summary.failed_permanent++;
    if (ack.invalidatedSubscription) {
      summary.invalidated_subscriptions++;
    }
  } else if (ack.outcome === 'fenced_stale_ack') {
    summary.fenced_stale_acks++;
  }
}

/**
 * Claims due or lease-expired deliveries in small bounded waves (`concurrency <= 5`) close to dispatch,
 * enforces a serverless execution time budget (`executionBudgetMs`), re-verifies claim ownership and
 * live pager/subscription eligibility immediately before each network request, and fences all
 * post-send acknowledgments to the unique per-claim `claim_token`.
 */
export async function runNotificationWorkerBatch(
  db,
  {
    batchSize = 15,
    concurrency = DEFAULT_WORKER_CONCURRENCY,
    leaseSeconds = WORKER_LEASE_SECONDS,
    providerTimeoutMs = DEFAULT_PROVIDER_TIMEOUT_MS,
    executionBudgetMs = DEFAULT_WORKER_EXECUTION_BUDGET_MS,
    workerId = `worker-${crypto.randomUUID().slice(0, 8)}`,
    now = null,
    clock = null,
    hooks = null,
    runCleanup = true
  } = {}
) {
  if (isNotificationDeliveryDisabled()) {
    return {
      paused: true,
      reason: 'delivery_disabled',
      claimed: 0,
      delivered: 0,
      retried: 0,
      failed_permanent: 0,
      suppressed: 0,
      aborted_lease_expired: 0,
      aborted_lease_lost: 0,
      fenced_stale_acks: 0,
      released_unprocessed: 0
    };
  }

  const initialProviderCfg = getPushProviderConfig();
  if (!initialProviderCfg.enabled) {
    return {
      paused: true,
      reason: `provider_${initialProviderCfg.mode}_not_enabled`,
      config_error: initialProviderCfg.configError || null,
      claimed: 0,
      delivered: 0,
      retried: 0,
      failed_permanent: 0,
      suppressed: 0,
      aborted_lease_expired: 0,
      aborted_lease_lost: 0,
      fenced_stale_acks: 0,
      released_unprocessed: 0
    };
  }

  const baseWallMs = Date.now();
  const baseSimMs = now instanceof Date ? now.getTime() : baseWallMs;
  const getNow =
    typeof clock === 'function'
      ? () => {
          const val = clock();
          return val instanceof Date ? val : new Date(val);
        }
      : () => new Date(baseSimMs + Math.max(0, Date.now() - baseWallMs));

  const clampedBatch = Math.max(1, Math.min(25, Number(batchSize) || 15));
  const clampedConcurrency = Math.max(1, Math.min(5, Number(concurrency) || DEFAULT_WORKER_CONCURRENCY));
  const clampedLeaseSeconds = Math.max(1, Math.min(120, Number(leaseSeconds) || WORKER_LEASE_SECONDS));
  const clampedProviderTimeoutMs = Math.max(
    100,
    Math.min(8000, Number(providerTimeoutMs) || DEFAULT_PROVIDER_TIMEOUT_MS)
  );
  const clampedExecutionBudgetMs = Math.max(
    500,
    Math.min(25000, Number(executionBudgetMs) || DEFAULT_WORKER_EXECUTION_BUDGET_MS)
  );

  const effectiveLeaseSeconds = clampedLeaseSeconds;

  const startedAtMs = getNow().getTime();
  const summary = {
    paused: false,
    provider_mode: initialProviderCfg.mode,
    worker_id: workerId,
    claimed: 0,
    delivered: 0,
    retried: 0,
    failed_permanent: 0,
    suppressed: 0,
    invalidated_subscriptions: 0,
    aborted_lease_expired: 0,
    aborted_lease_lost: 0,
    fenced_stale_acks: 0,
    released_unprocessed: 0,
    budget_exhausted: false,
    stopped_reason: 'queue_drained'
  };

  let remainingSlots = clampedBatch;

  while (remainingSlots > 0) {
    if (isNotificationDeliveryDisabled()) {
      summary.stopped_reason = 'delivery_disabled';
      break;
    }
    const liveProviderCfg = getPushProviderConfig();
    if (!liveProviderCfg.enabled) {
      summary.stopped_reason = `provider_${liveProviderCfg.mode}_not_enabled`;
      break;
    }

    const waveNow = getNow();
    const elapsedMs = waveNow.getTime() - startedAtMs;
    const minWaveBudgetMs = Math.min(clampedExecutionBudgetMs, clampedProviderTimeoutMs + 1000);
    if (summary.claimed > 0 && elapsedMs + minWaveBudgetMs > clampedExecutionBudgetMs) {
      summary.budget_exhausted = true;
      summary.stopped_reason = 'execution_budget_reached';
      break;
    }

    const waveSize = Math.min(clampedConcurrency, remainingSlots);
    const claimedWave = await claimDueDeliveryWave(db, {
      limit: waveSize,
      workerId,
      leaseSeconds: effectiveLeaseSeconds,
      now: waveNow
    });

    if (claimedWave.length === 0) {
      summary.stopped_reason = 'queue_drained';
      break;
    }

    remainingSlots -= claimedWave.length;
    summary.claimed += claimedWave.length;

    if (typeof hooks?.onAfterClaim === 'function') {
      await hooks.onAfterClaim(claimedWave);
    }

    await Promise.all(
      claimedWave.map(claimed =>
        processSingleClaimedDelivery(db, {
          claimed,
          workerId,
          leaseSeconds: effectiveLeaseSeconds,
          providerTimeoutMs: clampedProviderTimeoutMs,
          startedAtMs,
          executionBudgetMs: clampedExecutionBudgetMs,
          getNow,
          hooks,
          summary
        })
      )
    );
  }

  if (runCleanup) {
    summary.cleanup = await purgeExpiredNotificationRecords(db, { now: getNow() });
  }

  return summary;
}

export { UUID_RE, toBase64Url };
