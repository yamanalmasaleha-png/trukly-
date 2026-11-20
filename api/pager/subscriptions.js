import crypto from "node:crypto";
import { db } from "@biteshark/runtime-adapter";
import { UUID_RE, recordAuditLog, applyPrivateNoStoreHeaders } from "../../lib/authz.js";
import { withTransaction } from "../../lib/db-tx.js";
import {
  MAX_ACTIVE_SUBSCRIPTIONS_PER_PAGER,
  sha256Hex,
  toBase64Url,
  enablePagerInternalContext,
  isSubscriptionsDisabled,
  getPushProviderConfig,
  validateSubscriptionPayload,
  verifySameOriginMutation,
  extractClientRateKey,
  consumePagerRateLimit,
  enqueueReadyCatchupInTx
} from "../../lib/pager-notifications.js";

export const access = "public";
export const methods = ["GET", "POST", "DELETE"];

function timingSafeHexEqual(hexA, hexB) {
  if (typeof hexA !== "string" || typeof hexB !== "string" || hexA.length !== 64 || hexB.length !== 64) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(hexA, "hex"), Buffer.from(hexB, "hex"));
}

export default async function(req, res) {
  applyPrivateNoStoreHeaders(res);
  const now = req._testNow instanceof Date ? req._testNow : new Date();
  const nowIso = now.toISOString();

  try {
    // =========================================================================
    // GET: Public Web Push capability config & optional redacted subscription check
    // =========================================================================
    if (req.method === "GET") {
      const providerCfg = getPushProviderConfig();
      const subDisabled = isSubscriptionsDisabled();
      const enabled = providerCfg.enabled && !subDisabled;

      const subId = typeof req.query?.subscription_id === "string" ? req.query.subscription_id.trim() : "";
      const unsubToken = typeof req.query?.unsubscribe_token === "string" ? req.query.unsubscribe_token.trim() : "";

      let subscription = null;
      if (UUID_RE.test(subId) && unsubToken.length >= 16 && unsubToken.length <= 128) {
        const suppliedHash = sha256Hex(unsubToken);
        subscription = await withTransaction(db, async tx => {
          await enablePagerInternalContext(tx);
          const { rows } = await tx.query(
            `SELECT s.id, s.channel, s.status, s.expires_at, s.unsubscribe_token_hash, p.status AS pager_status, p.expires_at AS pager_expires_at
             FROM pager_notification_subscriptions s
             JOIN pickup_pagers p ON p.id = s.pager_id
             WHERE s.id = $1`,
            [subId]
          );
          if (!rows.length) return null;
          const row = rows[0];
          if (!timingSafeHexEqual(row.unsubscribe_token_hash, suppliedHash)) return null;
          const effectiveStatus =
            row.status === "active" &&
            (new Date(row.expires_at).getTime() <= now.getTime() ||
              new Date(row.pager_expires_at).getTime() <= now.getTime() ||
              ["collected", "cancelled"].includes(row.pager_status))
              ? "expired"
              : row.status;
          return {
            id: row.id,
            channel: row.channel,
            status: effectiveStatus,
            expires_at: row.expires_at
          };
        });
      }

      return res.json({
        enabled,
        subscriptions_paused: subDisabled,
        vapid_public_key: enabled ? providerCfg.vapidPublicKey : null,
        ios_pwa_requirement:
          "On iPhone/iPad (iOS/iPadOS 16.4+), add BiteShark to your Home Screen and open it from the Home Screen icon to enable background Web Push alerts.",
        subscription
      });
    }

    // =========================================================================
    // CSRF guard on browser POST / DELETE mutations
    // =========================================================================
    const csrf = verifySameOriginMutation(req);
    if (!csrf.ok) {
      return res.status(csrf.status).json({ error: csrf.error });
    }

    const b = req.body && typeof req.body === "object" ? req.body : {};

    // =========================================================================
    // DELETE: Unsubscribe, scrub endpoint/key material & suppress un-dispatched work
    // =========================================================================
    if (req.method === "DELETE") {
      const subId = typeof (b.subscription_id || req.query?.subscription_id) === "string"
        ? String(b.subscription_id || req.query?.subscription_id).trim()
        : "";
      const unsubToken = typeof b.unsubscribe_token === "string" ? b.unsubscribe_token.trim() : "";
      const pagerCode = typeof b.code === "string" ? b.code.trim() : "";

      if (!UUID_RE.test(subId) || (!unsubToken && !UUID_RE.test(pagerCode))) {
        return res.status(400).json({ error: "subscription_id and unsubscribe_token (or private pager code) are required." });
      }

      const outcome = await withTransaction(db, async tx => {
        await enablePagerInternalContext(tx);
        const { rows } = await tx.query(
          `SELECT s.id, s.pager_id, s.channel, s.status, s.unsubscribe_token_hash, p.vendor_id
           FROM pager_notification_subscriptions s
           JOIN pickup_pagers p ON p.id = s.pager_id
           WHERE s.id = $1
           FOR UPDATE OF s`,
          [subId]
        );
        if (!rows.length) {
          return { status: 404, body: { error: "Subscription not found." } };
        }

        const sub = rows[0];
        const authorizedByToken =
          unsubToken.length >= 16 &&
          unsubToken.length <= 128 &&
          timingSafeHexEqual(sub.unsubscribe_token_hash, sha256Hex(unsubToken));
        const authorizedByPagerCapability = UUID_RE.test(pagerCode) && sub.pager_id.toLowerCase() === pagerCode.toLowerCase();

        if (!authorizedByToken && !authorizedByPagerCapability) {
          return { status: 403, body: { error: "Not authorized to modify this notification subscription." } };
        }

        await tx.query(
          `UPDATE pager_notification_subscriptions
           SET status = 'unsubscribed',
               invalidated_reason = 'user_unsubscribed',
               endpoint_url = NULL,
               p256dh_key = NULL,
               auth_secret = NULL,
               device_token = NULL,
               updated_at = $2
           WHERE id = $1`,
          [subId, nowIso]
        );

        await tx.query(
          `UPDATE pager_notification_deliveries
           SET status = 'suppressed',
               last_error_code = 'user_unsubscribed',
               lease_owner = NULL,
               claim_token = NULL,
               claimed_at = NULL,
               dispatched_at = NULL,
               lease_expires_at = NULL,
               updated_at = $2
           WHERE subscription_id = $1
             AND (
               status IN ('queued', 'retry_scheduled')
               OR (status = 'processing' AND dispatched_at IS NULL)
             )`,
          [subId, nowIso]
        );

        await recordAuditLog(tx, {
          actorId: "pager_subscriber",
          actorRole: "customer_capability",
          vendorId: sub.vendor_id || null,
          targetType: "pager_subscription",
          targetId: subId,
          action: "pager.subscription_delete",
          metadata: { channel: sub.channel }
        });

        return {
          status: 200,
          body: {
            ok: true,
            subscription_id: subId,
            status: "unsubscribed"
          }
        };
      });

      return res.status(outcome.status).json(outcome.body);
    }

    // =========================================================================
    // POST: Create or refresh capability-scoped notification subscription
    // =========================================================================
    if (isSubscriptionsDisabled()) {
      return res.status(503).json({
        error: "Background pager alert subscriptions are temporarily paused. Keep this page open for live status updates.",
        code: "SUBSCRIPTIONS_PAUSED"
      });
    }

    const providerCfg = getPushProviderConfig();
    if (!providerCfg.enabled) {
      return res.status(503).json({
        error: "Background push alerts are not enabled in this environment. Keep this page open for live updates.",
        code: "PUSH_NOT_CONFIGURED"
      });
    }

    const pagerCode = typeof b.code === "string" ? b.code.trim() : "";
    if (!UUID_RE.test(pagerCode)) {
      return res.status(400).json({ error: "A valid private pickup pager code is required to subscribe." });
    }

    const rawReplaceId = typeof b.replaces_subscription_id === "string" ? b.replaces_subscription_id.trim() : "";
    if (rawReplaceId && !UUID_RE.test(rawReplaceId)) {
      return res.status(400).json({ error: "replaces_subscription_id must be a valid UUID when provided." });
    }

    // Rate-limit both by client hash and by target pager hash
    const clientRl = await consumePagerRateLimit(db, {
      scope: "pager_sub_client",
      subjectKey: extractClientRateKey(req),
      maxHits: 12,
      windowSeconds: 300,
      now
    });
    if (!clientRl.allowed) {
      res.setHeader("Retry-After", String(clientRl.retryAfterSeconds));
      return res.status(429).json({ error: "Too many subscription attempts. Please wait a few minutes and try again." });
    }

    const pagerRl = await consumePagerRateLimit(db, {
      scope: "pager_sub_ticket",
      subjectKey: sha256Hex(pagerCode),
      maxHits: 10,
      windowSeconds: 300,
      now
    });
    if (!pagerRl.allowed) {
      res.setHeader("Retry-After", String(pagerRl.retryAfterSeconds));
      return res.status(429).json({ error: "Too many alert registrations for this pickup ticket." });
    }

    const validated = validateSubscriptionPayload(b);
    if (!validated.ok) {
      const payload = { error: validated.error };
      if (validated.code) payload.code = validated.code;
      return res.status(validated.status).json(payload);
    }

    const platformHint = typeof b.platform_hint === "string"
      ? b.platform_hint.replace(/[^a-z0-9_-]/gi, "").slice(0, 24) || null
      : null;

    const unsubscribeToken = toBase64Url(crypto.randomBytes(24));
    const unsubscribeTokenHash = sha256Hex(unsubscribeToken);

    const outcome = await withTransaction(db, async tx => {
      await enablePagerInternalContext(tx);

      // Lock pickup_pagers FOR NO KEY UPDATE so concurrent ready transitions (`FOR UPDATE` in
      // `POST /api/pager/update`) and concurrent device registrations strictly serialize on this ticket.
      const { rows: pagerRows } = await tx.query(
        `SELECT id, vendor_id, vendor, ticket, status, expires_at, ready_notified_at, ready_notify_count
         FROM pickup_pagers
         WHERE id = $1
         FOR NO KEY UPDATE`,
        [pagerCode]
      );

      if (
        !pagerRows.length ||
        new Date(pagerRows[0].expires_at).getTime() <= now.getTime() ||
        ["collected", "cancelled"].includes(pagerRows[0].status)
      ) {
        return {
          status: 404,
          body: { error: "Pager ticket not found, already completed, or expired." }
        };
      }

      const pager = pagerRows[0];

      // Inspect existing subscription row for `(pager.id, destinationHash)` before upsert
      const { rows: existingDestRows } = await tx.query(
        `SELECT id, status
         FROM pager_notification_subscriptions
         WHERE pager_id = $1 AND destination_hash = $2
         FOR UPDATE`,
        [pager.id, validated.destinationHash]
      );
      const priorDestRow = existingDestRows[0] || null;

      // Optional endpoint/token rotation on the same pager capability
      let replacedSubscriptionId = null;
      if (rawReplaceId && (!priorDestRow || priorDestRow.id !== rawReplaceId)) {
        const { rows: replaceRows } = await tx.query(
          `SELECT id
           FROM pager_notification_subscriptions
           WHERE id = $1 AND pager_id = $2
           FOR UPDATE`,
          [rawReplaceId, pager.id]
        );
        if (replaceRows.length > 0) {
          replacedSubscriptionId = replaceRows[0].id;
          await tx.query(
            `UPDATE pager_notification_subscriptions
             SET status = 'unsubscribed',
                 invalidated_reason = 'token_rotated',
                 endpoint_url = NULL,
                 p256dh_key = NULL,
                 auth_secret = NULL,
                 device_token = NULL,
                 updated_at = $2
             WHERE id = $1`,
            [replacedSubscriptionId, nowIso]
          );
          await tx.query(
            `UPDATE pager_notification_deliveries
             SET status = 'suppressed',
                 last_error_code = 'token_rotated',
                 lease_owner = NULL,
                 claim_token = NULL,
                 claimed_at = NULL,
                 dispatched_at = NULL,
                 lease_expires_at = NULL,
                 updated_at = $2
             WHERE subscription_id = $1
               AND (
                 status IN ('queued', 'retry_scheduled')
                 OR (status = 'processing' AND dispatched_at IS NULL)
               )`,
            [replacedSubscriptionId, nowIso]
          );
        }
      }

      const { rows: activeCountRows } = await tx.query(
        `SELECT count(*)::int AS active_count
         FROM pager_notification_subscriptions
         WHERE pager_id = $1
           AND status = 'active'
           AND expires_at > $2
           AND destination_hash <> $3`,
        [pager.id, nowIso, validated.destinationHash]
      );
      if (Number(activeCountRows[0]?.active_count || 0) >= MAX_ACTIVE_SUBSCRIPTIONS_PER_PAGER) {
        return {
          status: 409,
          body: { error: `At most ${MAX_ACTIVE_SUBSCRIPTIONS_PER_PAGER} active devices can follow one pickup ticket.` }
        };
      }

      const subExpiresIso = new Date(pager.expires_at).toISOString();
      const { rows: upserted } = await tx.query(
        `INSERT INTO pager_notification_subscriptions (
           pager_id, channel, destination_hash, endpoint_url, p256dh_key, auth_secret, device_token,
           unsubscribe_token_hash, status, platform_hint, invalidated_reason, created_at, updated_at, expires_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', $9, NULL, $10, $10, $11)
         ON CONFLICT (pager_id, destination_hash) DO UPDATE
           SET channel = EXCLUDED.channel,
               endpoint_url = EXCLUDED.endpoint_url,
               p256dh_key = EXCLUDED.p256dh_key,
               auth_secret = EXCLUDED.auth_secret,
               device_token = EXCLUDED.device_token,
               unsubscribe_token_hash = EXCLUDED.unsubscribe_token_hash,
               status = 'active',
               platform_hint = EXCLUDED.platform_hint,
               invalidated_reason = NULL,
               updated_at = EXCLUDED.updated_at,
               expires_at = EXCLUDED.expires_at
         RETURNING id, channel, status, expires_at`,
        [
          pager.id,
          validated.channel,
          validated.destinationHash,
          validated.endpointUrl,
          validated.p256dhKey,
          validated.authSecret,
          validated.deviceToken,
          unsubscribeTokenHash,
          platformHint,
          nowIso,
          subExpiresIso
        ]
      );

      const sub = upserted[0];

      // Atomically enqueue ready-state catch-up when subscribing to an already-ready, non-expired ticket
      const catchupMeta =
        pager.status === "ready"
          ? await enqueueReadyCatchupInTx(tx, {
              pager,
              subscriptionId: sub.id,
              priorStatus: priorDestRow ? priorDestRow.status : null,
              replacedSubscriptionId,
              now
            })
          : { queued: false, reason: "pager_not_ready" };

      await recordAuditLog(tx, {
        actorId: "pager_subscriber",
        actorRole: "customer_capability",
        vendorId: pager.vendor_id || null,
        targetType: "pager_subscription",
        targetId: sub.id,
        action: "pager.subscription_upsert",
        metadata: {
          channel: sub.channel,
          platform_hint: platformHint,
          catchup_queued: Boolean(catchupMeta.queued),
          catchup_reason: catchupMeta.reason
        }
      });

      if (req._testForceRollbackAfterCatchup === true) {
        throw new Error("Simulated mid-transaction failure after catch-up enqueue");
      }

      return {
        status: 201,
        body: {
          subscription: {
            id: sub.id,
            channel: sub.channel,
            status: sub.status,
            expires_at: sub.expires_at
          },
          unsubscribe_token: unsubscribeToken,
          pager_status: pager.status,
          catchup: {
            queued: Boolean(catchupMeta.queued),
            reason: catchupMeta.reason
          }
        }
      };
    });

    return res.status(outcome.status).json(outcome.body);
  } catch {
    return res.status(503).json({ error: "Pager notification subscription service is temporarily unavailable." });
  }
}
