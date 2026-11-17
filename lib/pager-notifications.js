// Durable, provider-neutral pickup-pager notification service, SSRF/CSRF guards,
// serverless rate-limiter, outbox enqueueing, and bounded lease worker.
// Placed in lib/ (outside api/) so Hatchable does not expose helper modules as routes.

import crypto from 'node:crypto';
import net from 'node:net';
import { UUID_RE, isWritePaused } from './authz.js';
import { withTransaction } from './db-tx.js';
import {
  toBase64Url,
  generateVapidKeys,
  validateVapidKeyPair,
  validateSubscriberKeys,
  createVapidHeaders,
  encryptWebPushPayload
} from './webpush-crypto.js';

export const MAX_ACTIVE_SUBSCRIPTIONS_PER_PAGER = 5;
export const READY_FLAP_COOLDOWN_MS = 60 * 1000;
export const WORKER_LEASE_SECONDS = 45;
export const RETRY_BACKOFF_SECONDS = Object.freeze([15, 45, 120, 300, 600]);
export const RETENTION_HOURS = 24;

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

export function isSubscriptionsDisabled() {
  const flag = String(process.env.TRUCKLY_DISABLE_SUBSCRIPTIONS || '').trim().toLowerCase();
  if (flag === '1' || flag === 'true') return true;
  return isWritePaused('notifications') || isWritePaused('pagers');
}

export function isNotificationDeliveryDisabled() {
  const flag = String(process.env.TRUCKLY_DISABLE_NOTIFICATION_DELIVERY || '').trim().toLowerCase();
  if (flag === '1' || flag === 'true') return true;
  return isWritePaused('notifications');
}

export function getPushProviderConfig() {
  const rawMode = String(process.env.TRUCKLY_PUSH_PROVIDER_MODE || 'disabled').trim().toLowerCase();
  const mode = ['disabled', 'fake', 'loopback_test', 'webpush'].includes(rawMode) ? rawMode : 'disabled';

  if (mode === 'disabled') {
    return {
      mode: 'disabled',
      enabled: false,
      vapidPublicKey: null,
      vapidPrivateKey: null,
      vapidSubject: null
    };
  }

  if (mode === 'fake' || mode === 'loopback_test') {
    const pub = process.env.TRUCKLY_VAPID_PUBLIC_KEY || EPHEMERAL_TEST_VAPID.publicKey;
    const priv = process.env.TRUCKLY_VAPID_PRIVATE_KEY || EPHEMERAL_TEST_VAPID.privateKey;
    const sub = process.env.TRUCKLY_VAPID_SUBJECT || 'mailto:pager-test@truckly.local';
    try {
      validateVapidKeyPair(pub, priv);
      return {
        mode,
        enabled: !isNotificationDeliveryDisabled(),
        vapidPublicKey: pub,
        vapidPrivateKey: priv,
        vapidSubject: sub
      };
    } catch {
      return { mode, enabled: false, vapidPublicKey: null, vapidPrivateKey: null, vapidSubject: null };
    }
  }

  // Real `webpush` mode requires explicit valid VAPID credentials
  const pub = String(process.env.TRUCKLY_VAPID_PUBLIC_KEY || '').trim();
  const priv = String(process.env.TRUCKLY_VAPID_PRIVATE_KEY || '').trim();
  const sub = String(process.env.TRUCKLY_VAPID_SUBJECT || '').trim();
  if (!pub || !priv || !sub) {
    return { mode: 'webpush', enabled: false, vapidPublicKey: null, vapidPrivateKey: null, vapidSubject: null };
  }
  try {
    validateVapidKeyPair(pub, priv);
    if (!/^(mailto:[^@\s]+@[^@\s]+|https:\/\/[^\s]+)$/i.test(sub)) {
      throw new Error('Invalid subject');
    }
    return {
      mode: 'webpush',
      enabled: !isNotificationDeliveryDisabled(),
      vapidPublicKey: pub,
      vapidPrivateKey: priv,
      vapidSubject: sub
    };
  } catch {
    return { mode: 'webpush', enabled: false, vapidPublicKey: null, vapidPrivateKey: null, vapidSubject: null };
  }
}

function extraAllowedPushHosts() {
  const raw = String(process.env.TRUCKLY_PUSH_ALLOWED_HOSTS || '').trim();
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
    if (process.env.TRUCKLY_ENABLE_NATIVE_PUSH !== '1') {
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

  const providerMode = getPushProviderConfig().mode;
  const isLoopbackTestAllowed =
    providerMode === 'loopback_test' &&
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
  const clientHeader = String(headers['x-truckly-client'] || headers['X-Truckly-Client'] || '').trim();
  if (clientHeader !== 'web-pager-v1') {
    return { ok: false, status: 403, error: 'Missing required X-Truckly-Client request header.' };
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
  const headers = req?.headers || {};
  const xff = String(headers['x-forwarded-for'] || headers['X-Forwarded-For'] || '')
    .split(',')[0]
    .trim();
  const realIp = String(headers['x-real-ip'] || req?.socket?.remoteAddress || 'anon').trim();
  return sha256Hex(xff || realIp || 'anon').slice(0, 24);
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

/**
 * Atomically handles outbox event creation or terminal suppression inside `POST /api/pager/update`'s
 * existing database transaction (`tx`). If the caller's transaction rolls back, zero outbox events survive.
 */
export async function handlePagerTransitionNotificationsInTx(
  tx,
  { pager, nextStatus, now = new Date() }
) {
  await enablePagerInternalContext(tx);
  const nowIso = now.toISOString();

  // Terminal ticket transition (`collected` or `cancelled`): suppress pending alerts & scrub subscriptions
  if (nextStatus === 'collected' || nextStatus === 'cancelled') {
    await tx.query(
      `UPDATE pager_notification_deliveries
       SET status = 'suppressed',
           last_error_code = 'ticket_terminal',
           lease_owner = NULL,
           lease_expires_at = NULL,
           updated_at = $2
       WHERE pager_id = $1 AND status IN ('queued', 'retry_scheduled')`,
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

  // Non-ready transition (`cooking` or `almost`): suppress any un-sent queued ready deliveries if kitchen stepped back
  if (nextStatus !== 'ready') {
    await tx.query(
      `UPDATE pager_notification_deliveries
       SET status = 'suppressed',
           last_error_code = 'status_reverted',
           lease_owner = NULL,
           lease_expires_at = NULL,
           updated_at = $2
       WHERE pager_id = $1 AND status IN ('queued', 'retry_scheduled')`,
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

  const pagerHashPrefix = sha256Hex(pager.id).slice(0, 16);
  const collapseKey = `pager-ready:${pagerHashPrefix}`;
  const dedupeKey = `pager:${pagerHashPrefix}:ready:${nextSeq}`;
  const expiresIso = new Date(pager.expires_at).toISOString();

  // Minimal lock-screen-safe payload — NEVER includes the raw private pager bearer UUID!
  const safePayload = {
    version: 1,
    event_type: 'pager.ready',
    vendor: String(pager.vendor || 'Food Truck').slice(0, 80),
    ticket: String(pager.ticket || '').slice(0, 40),
    title: 'Order Ready for Pickup',
    body: `Ticket #${String(pager.ticket || '').slice(0, 40)} at ${String(pager.vendor || 'the counter').slice(0, 80)} is ready for pickup.`,
    collapse_key: collapseKey
  };

  const { rows: eventRows } = await tx.query(
    `INSERT INTO pager_notification_events (
       pager_id, vendor_id, event_type, transition_seq, dedupe_key, collapse_key, payload, created_at, expires_at
     )
     VALUES ($1, $2, 'pager.ready', $3, $4, $5, $6::jsonb, $7, $8)
     ON CONFLICT (dedupe_key) DO NOTHING
     RETURNING id`,
    [
      pager.id,
      pager.vendor_id || null,
      nextSeq,
      dedupeKey,
      collapseKey,
      JSON.stringify(safePayload),
      nowIso,
      expiresIso
    ]
  );

  if (!eventRows.length) {
    return { eventCreated: false, reason: 'deduplicated' };
  }

  const eventId = eventRows[0].id;
  const { rowCount } = await tx.query(
    `INSERT INTO pager_notification_deliveries (
       event_id, subscription_id, pager_id, status, next_attempt_at, created_at, updated_at
     )
     SELECT $1, s.id, s.pager_id, 'queued', $3, $3, $3
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

async function dispatchToProvider(item, providerCfg, now = new Date()) {
  const wirePayload = JSON.stringify({
    ...item.payload,
    event_id: item.event_id,
    subscription_id: item.subscription_id,
    open_url: `/#pager-ref=${item.subscription_id}`
  });

  const encryptedBody = encryptWebPushPayload(wirePayload, item.p256dh_key, item.auth_secret);
  const ttlSeconds = Math.max(
    60,
    Math.min(14400, Math.floor((new Date(item.pager_expires_at).getTime() - now.getTime()) / 1000))
  );

  const vapid = createVapidHeaders({
    endpointUrl: item.endpoint_url,
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
    Topic: item.collapse_key.slice(0, 32),
    Authorization: vapid.Authorization
  };

  if (providerCfg.mode === 'fake') {
    if (customFakeProviderHandler) {
      return customFakeProviderHandler({
        deliveryId: item.delivery_id,
        eventId: item.event_id,
        subscriptionId: item.subscription_id,
        endpointUrl: item.endpoint_url,
        headers,
        encryptedBody,
        attemptCount: item.attempt_count
      });
    }
    return { status: 201, provider: 'fake_webpush' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const resp = await fetch(item.endpoint_url, {
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
           lease_expires_at = NULL,
           updated_at = $1
       FROM pager_notification_events e
       WHERE e.id = d.event_id
         AND d.status IN ('queued', 'retry_scheduled')
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

/**
 * Claims a bounded batch of due or lease-expired deliveries via `FOR UPDATE SKIP LOCKED`,
 * dispatches via the configured provider, handles retry/permanent-failure/410-cleanup,
 * and returns sanitized telemetry counters.
 */
export async function runNotificationWorkerBatch(
  db,
  { batchSize = 15, workerId = `worker-${crypto.randomUUID().slice(0, 8)}`, now = new Date(), runCleanup = true } = {}
) {
  if (isNotificationDeliveryDisabled()) {
    return {
      paused: true,
      reason: 'delivery_disabled',
      claimed: 0,
      delivered: 0,
      retried: 0,
      failed_permanent: 0,
      suppressed: 0
    };
  }

  const providerCfg = getPushProviderConfig();
  if (!providerCfg.enabled) {
    return {
      paused: true,
      reason: `provider_${providerCfg.mode}_not_enabled`,
      claimed: 0,
      delivered: 0,
      retried: 0,
      failed_permanent: 0,
      suppressed: 0
    };
  }

  const clampedBatch = Math.max(1, Math.min(25, Number(batchSize) || 15));
  const nowIso = now.toISOString();
  const leaseUntilIso = new Date(now.getTime() + WORKER_LEASE_SECONDS * 1000).toISOString();

  // Step 1: Claim due deliveries + recover expired worker leases atomically (`FOR UPDATE SKIP LOCKED`)
  const claimedItems = await withTransaction(db, async tx => {
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
       ),
       claimed AS (
         UPDATE pager_notification_deliveries d
         SET status = 'processing',
             attempt_count = d.attempt_count + 1,
             lease_owner = $3,
             lease_expires_at = $4,
             updated_at = $1
         FROM due
         WHERE d.id = due.id
         RETURNING d.id, d.event_id, d.subscription_id, d.pager_id, d.attempt_count, d.max_attempts
       )
       SELECT
         c.id AS delivery_id,
         c.event_id,
         c.subscription_id,
         c.pager_id,
         c.attempt_count,
         c.max_attempts,
         e.collapse_key,
         e.payload,
         e.expires_at AS event_expires_at,
         s.channel,
         s.status AS sub_status,
         s.endpoint_url,
         s.p256dh_key,
         s.auth_secret,
         s.expires_at AS sub_expires_at,
         p.status AS pager_status,
         p.expires_at AS pager_expires_at
       FROM claimed c
       JOIN pager_notification_events e ON e.id = c.event_id
       JOIN pager_notification_subscriptions s ON s.id = c.subscription_id
       JOIN pickup_pagers p ON p.id = c.pager_id`,
      [nowIso, clampedBatch, workerId, leaseUntilIso]
    );
    return rows;
  });

  const summary = {
    paused: false,
    provider_mode: providerCfg.mode,
    worker_id: workerId,
    claimed: claimedItems.length,
    delivered: 0,
    retried: 0,
    failed_permanent: 0,
    suppressed: 0,
    invalidated_subscriptions: 0
  };

  // Step 2: Process each claimed delivery independently so one failure never aborts the batch
  for (const item of claimedItems) {
    // Re-validate freshness before contacting external push provider
    const eventExpired = new Date(item.event_expires_at).getTime() <= now.getTime();
    const pagerExpired = new Date(item.pager_expires_at).getTime() <= now.getTime();
    const subExpired = new Date(item.sub_expires_at).getTime() <= now.getTime();
    const subInactive = item.sub_status !== 'active' || !item.endpoint_url || !item.p256dh_key || !item.auth_secret;
    const pagerNotReady = item.pager_status !== 'ready';

    if (eventExpired || pagerExpired || subExpired || subInactive || pagerNotReady) {
      const targetStatus = eventExpired || pagerExpired ? 'expired' : 'suppressed';
      const reasonCode = eventExpired || pagerExpired
        ? 'expired_before_send'
        : subInactive || subExpired
          ? 'subscription_inactive'
          : `pager_status_${item.pager_status}`;

      await withTransaction(db, async tx => {
        await enablePagerInternalContext(tx);
        await tx.query(
          `UPDATE pager_notification_deliveries
           SET status = $2,
               last_error_code = $3,
               lease_owner = NULL,
               lease_expires_at = NULL,
               updated_at = $4
           WHERE id = $1 AND lease_owner = $5`,
          [item.delivery_id, targetStatus, reasonCode, nowIso, workerId]
        );
      });
      summary.suppressed++;
      continue;
    }

    if (item.attempt_count > item.max_attempts) {
      await withTransaction(db, async tx => {
        await enablePagerInternalContext(tx);
        await tx.query(
          `UPDATE pager_notification_deliveries
           SET status = 'failed_permanent',
               last_error_code = 'max_attempts_exceeded',
               lease_owner = NULL,
               lease_expires_at = NULL,
               updated_at = $2
           WHERE id = $1 AND lease_owner = $3`,
          [item.delivery_id, nowIso, workerId]
        );
      });
      summary.failed_permanent++;
      continue;
    }

    let providerResult = null;
    let sendError = null;
    try {
      providerResult = await dispatchToProvider(item, providerCfg, now);
    } catch (err) {
      sendError = err;
    }

    // Simulated crash-after-send hook for deterministic testing of at-least-once lease recovery:
    // leaves the row in `processing` until `lease_expires_at` passes!
    if (providerResult && providerResult.simulateCrashBeforeAck === true) {
      continue;
    }

    const httpStatus = providerResult ? Number(providerResult.status || 0) : 0;
    const providerName = providerResult?.provider || providerCfg.mode;

    if (!sendError && httpStatus >= 200 && httpStatus < 300) {
      await withTransaction(db, async tx => {
        await enablePagerInternalContext(tx);
        await tx.query(
          `UPDATE pager_notification_deliveries
           SET status = 'delivered',
               provider_name = $2,
               provider_status = $3,
               delivered_at = $4,
               last_error_code = NULL,
               last_error_redacted = NULL,
               lease_owner = NULL,
               lease_expires_at = NULL,
               updated_at = $4
           WHERE id = $1 AND lease_owner = $5`,
          [item.delivery_id, providerName, httpStatus, nowIso, workerId]
        );
      });
      summary.delivered++;
      continue;
    }

    // Permanent subscription invalidation (`404 Not Found` or `410 Gone` from push service)
    if (!sendError && (httpStatus === 404 || httpStatus === 410)) {
      await withTransaction(db, async tx => {
        await enablePagerInternalContext(tx);
        await tx.query(
          `UPDATE pager_notification_deliveries
           SET status = 'failed_permanent',
               provider_name = $2,
               provider_status = $3,
               last_error_code = $4,
               last_error_redacted = 'Push subscription expired or unsubscribed at provider',
               lease_owner = NULL,
               lease_expires_at = NULL,
               updated_at = $5
           WHERE id = $1 AND lease_owner = $6`,
          [item.delivery_id, providerName, httpStatus, `provider_${httpStatus}`, nowIso, workerId]
        );
        await tx.query(
          `UPDATE pager_notification_subscriptions
           SET status = 'invalidated',
               invalidated_reason = $2,
               endpoint_url = NULL,
               p256dh_key = NULL,
               auth_secret = NULL,
               device_token = NULL,
               updated_at = $3
           WHERE id = $1`,
          [item.subscription_id, `provider_${httpStatus}`, nowIso]
        );
      });
      summary.failed_permanent++;
      summary.invalidated_subscriptions++;
      continue;
    }

    // Non-retryable 4xx (except 408 Request Timeout & 429 Too Many Requests)
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

    if (!isRetryable || item.attempt_count >= item.max_attempts) {
      await withTransaction(db, async tx => {
        await enablePagerInternalContext(tx);
        await tx.query(
          `UPDATE pager_notification_deliveries
           SET status = 'failed_permanent',
               provider_name = $2,
               provider_status = $3,
               last_error_code = $4,
               last_error_redacted = $5,
               lease_owner = NULL,
               lease_expires_at = NULL,
               updated_at = $6
           WHERE id = $1 AND lease_owner = $7`,
          [
            item.delivery_id,
            providerName,
            httpStatus || null,
            item.attempt_count >= item.max_attempts ? 'max_attempts_reached' : errCode,
            redactedErr,
            nowIso,
            workerId
          ]
        );
      });
      summary.failed_permanent++;
      continue;
    }

    const backoffSec =
      RETRY_BACKOFF_SECONDS[Math.min(item.attempt_count - 1, RETRY_BACKOFF_SECONDS.length - 1)];
    const nextAttemptIso = new Date(now.getTime() + backoffSec * 1000).toISOString();

    await withTransaction(db, async tx => {
      await enablePagerInternalContext(tx);
      await tx.query(
        `UPDATE pager_notification_deliveries
         SET status = 'retry_scheduled',
             provider_name = $2,
             provider_status = $3,
             last_error_code = $4,
             last_error_redacted = $5,
             next_attempt_at = $6,
             lease_owner = NULL,
             lease_expires_at = NULL,
             updated_at = $7
         WHERE id = $1 AND lease_owner = $8`,
        [item.delivery_id, providerName, httpStatus || null, errCode, redactedErr, nextAttemptIso, nowIso, workerId]
      );
    });
    summary.retried++;
  }

  if (runCleanup) {
    summary.cleanup = await purgeExpiredNotificationRecords(db, { now });
  }

  return summary;
}

export { UUID_RE, toBase64Url };
