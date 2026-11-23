import { db, auth } from "@biteshark/runtime-adapter";
import { resolveIdentity, isWritePaused, applyPrivateNoStoreHeaders } from "../../lib/authz.js";
import { withTransaction, respondIfSessionEligibilityError } from "../../lib/db-tx.js";

export const access = "user";
export const methods = ["GET", "POST"];

export default async function(req, res) {
  applyPrivateNoStoreHeaders(res);
  const user = await resolveIdentity(req, auth);
  if (!user) return res.status(401).json({ error: "Sign in is required." });

  try {
    if (req.method === "POST") {
      if (isWritePaused("notifications")) {
        return res.status(503).json({ error: "Notification settings updates are temporarily paused for maintenance." });
      }
      const enabled = req.body?.nearby_enabled !== false;
      const radius = Math.max(1, Math.min(30, +req.body?.radius_miles || 3));
      const row = await withTransaction(db, async tx => {
        await tx.query("SELECT set_config('app.user_id', $1, true)", [user.id]);
        const { rows } = await tx.query(
          "INSERT INTO notification_settings(user_id, nearby_enabled, radius_miles) VALUES($1, $2, $3) ON CONFLICT(user_id) DO UPDATE SET nearby_enabled = EXCLUDED.nearby_enabled, radius_miles = EXCLUDED.radius_miles, updated_at = now() RETURNING nearby_enabled, radius_miles, updated_at",
          [user.id, enabled, radius]
        );
        return rows[0];
      });
      return res.json(row);
    }

    const row = await withTransaction(db, async tx => {
      await tx.query("SELECT set_config('app.user_id', $1, true)", [user.id]);
      const { rows } = await tx.query(
        "SELECT nearby_enabled, radius_miles, updated_at FROM notification_settings WHERE user_id = $1",
        [user.id]
      );
      return rows[0] || { nearby_enabled: true, radius_miles: 3 };
    });
    return res.json(row);
  } catch (err) {
    if (respondIfSessionEligibilityError(err, res)) return;
    return res.status(503).json({ error: "Notification settings are temporarily unavailable." });
  }
}
