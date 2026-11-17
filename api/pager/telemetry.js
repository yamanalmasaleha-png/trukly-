import { db, auth } from "hatchable";
import { loadAccessContext, applyPrivateNoStoreHeaders } from "../../lib/authz.js";
import { withTransaction } from "../../lib/db-tx.js";
import {
  enablePagerInternalContext,
  getPushProviderConfig,
  isSubscriptionsDisabled,
  isNotificationDeliveryDisabled
} from "../../lib/pager-notifications.js";

export const access = "user";
export const methods = ["GET"];

export default async function(req, res) {
  applyPrivateNoStoreHeaders(res);

  try {
    const ctx = await loadAccessContext(req, auth, db);
    if (!ctx.authenticated) {
      return res.status(401).json({ error: "Sign in is required." });
    }
    if (!ctx.isPlatformAdmin) {
      return res.status(403).json({ error: "Platform administrator access is required." });
    }

    const now = req._testNow instanceof Date ? req._testNow : new Date();
    const nowIso = now.toISOString();
    const providerCfg = getPushProviderConfig();

    const stats = await withTransaction(db, async tx => {
      await enablePagerInternalContext(tx);

      const [delivRes, subRes, eventRes, errRes] = await Promise.all([
        tx.query(
          `SELECT
             count(*) FILTER (WHERE status = 'queued')::int AS queued,
             count(*) FILTER (WHERE status = 'processing')::int AS processing,
             count(*) FILTER (WHERE status = 'processing' AND lease_expires_at <= $1)::int AS expired_leases,
             count(*) FILTER (WHERE status = 'retry_scheduled')::int AS retry_scheduled,
             count(*) FILTER (WHERE status = 'delivered')::int AS delivered,
             count(*) FILTER (WHERE status = 'failed_permanent')::int AS failed_permanent,
             count(*) FILTER (WHERE status = 'expired')::int AS expired,
             count(*) FILTER (WHERE status = 'suppressed')::int AS suppressed
           FROM pager_notification_deliveries`,
          [nowIso]
        ),
        tx.query(
          `SELECT
             count(*) FILTER (WHERE status = 'active' AND expires_at > $1)::int AS active,
             count(*) FILTER (WHERE status = 'unsubscribed')::int AS unsubscribed,
             count(*) FILTER (WHERE status = 'invalidated')::int AS invalidated,
             count(*) FILTER (WHERE status = 'expired' OR (status = 'active' AND expires_at <= $1))::int AS expired
           FROM pager_notification_subscriptions`,
          [nowIso]
        ),
        tx.query(
          `SELECT count(*)::int AS total_events_24h
           FROM pager_notification_events
           WHERE created_at > ($1::timestamptz - interval '24 hours')`,
          [nowIso]
        ),
        tx.query(
          `SELECT status, last_error_code, last_error_redacted, provider_status, attempt_count, updated_at
           FROM pager_notification_deliveries
           WHERE status IN ('retry_scheduled', 'failed_permanent')
             AND last_error_code IS NOT NULL
           ORDER BY updated_at DESC
           LIMIT 10`
        )
      ]);

      return {
        deliveries: delivRes.rows[0],
        subscriptions: subRes.rows[0],
        events_last_24h: eventRes.rows[0]?.total_events_24h || 0,
        recent_redacted_errors: errRes.rows
      };
    });

    return res.json({
      ok: true,
      observed_at: nowIso,
      release_sha: process.env.TRUCKLY_RELEASE_SHA || process.env.GITHUB_SHA || "local-dev",
      controls: {
        provider_mode: providerCfg.mode,
        provider_enabled: providerCfg.enabled,
        subscriptions_paused: isSubscriptionsDisabled(),
        delivery_paused: isNotificationDeliveryDisabled(),
        worker_secret_configured: String(process.env.TRUCKLY_NOTIFICATION_WORKER_SECRET || "").trim().length >= 24
      },
      ...stats
    });
  } catch {
    return res.status(503).json({
      error: "Pager notification telemetry is temporarily unavailable.",
      code: "TELEMETRY_DB_UNAVAILABLE"
    });
  }
}
