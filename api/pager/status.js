import { db } from "@biteshark/runtime-adapter";
import { UUID_RE, applyPrivateNoStoreHeaders } from "../../lib/authz.js";
import {
  getPushProviderConfig,
  isSubscriptionsDisabled,
  extractClientRateKey,
  consumePagerRateLimit
} from "../../lib/pager-notifications.js";
import { isPagerPushSubscriptionFeatureEnabled } from "../../lib/feature-controls.js";

export const access = "public";
export const methods = ["GET"];

export default async function(req, res) {
  applyPrivateNoStoreHeaders(res);

  const id = String(req.query?.code || "").trim();
  if (!UUID_RE.test(id)) {
    return res.status(400).json({ error: "Paste the private pager link or code from your vendor." });
  }

  const now = req._testNow instanceof Date ? req._testNow : new Date();

  try {
    const rl = await consumePagerRateLimit(db, {
      scope: "pager_status_client",
      subjectKey: extractClientRateKey(req),
      maxHits: 90,
      windowSeconds: 60,
      now
    });
    if (!rl.allowed) {
      res.setHeader("Retry-After", String(rl.retryAfterSeconds));
      return res.status(429).json({ error: "Too many pager checks. Please wait a moment and retry." });
    }

    const r = await db.query(
      "SELECT vendor, ticket, status, updated_at, expires_at FROM pickup_pagers WHERE id = $1 AND expires_at > $2",
      [id, now.toISOString()]
    );
    if (!r.rows.length) {
      return res.status(404).json({ error: "Pager not found or expired. Ask the counter for your link." });
    }

    const providerCfg = getPushProviderConfig();
    const featureAllowed = await isPagerPushSubscriptionFeatureEnabled(db);
    const pushEnabled = providerCfg.enabled && !isSubscriptionsDisabled() && featureAllowed;

    return res.json({
      pager: r.rows[0],
      notifications: {
        enabled: pushEnabled,
        vapid_public_key: pushEnabled ? providerCfg.vapidPublicKey : null
      }
    });
  } catch {
    return res.status(503).json({ error: "Pager status service is temporarily unavailable." });
  }
}
