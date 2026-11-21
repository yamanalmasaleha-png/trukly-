import { db, auth } from "@biteshark/runtime-adapter";
import { resolveIdentity, isWritePaused, applyPrivateNoStoreHeaders } from "../../lib/authz.js";
import { withTransaction, respondIfSessionEligibilityError } from "../../lib/db-tx.js";

export const access = "user";
export const methods = ["POST"];

export default async function(req, res) {
  applyPrivateNoStoreHeaders(res);
  if (isWritePaused("favorites")) {
    return res.status(503).json({ error: "Favorites updates are temporarily paused for maintenance." });
  }

  const user = await resolveIdentity(req, auth);
  if (!user) return res.status(401).json({ error: "Sign in is required." });

  const id = typeof req.body?.truck_id === "string" ? req.body.truck_id.trim() : "";
  if (!id || id.length > 80) return res.status(400).json({ error: "truck_id required" });
  const desiredSaved = typeof req.body?.desired_saved === "boolean" ? req.body.desired_saved : null;

  try {
    const outcome = await withTransaction(db, async tx => {
      await tx.query("SELECT set_config('app.user_id', $1, true)", [user.id]);

      if (desiredSaved === true) {
        await tx.query(
          "INSERT INTO favorites(user_id, truck_id) VALUES($1, $2) ON CONFLICT (user_id, truck_id) DO NOTHING",
          [user.id, id]
        );
        return { truck_id: id, saved: true };
      }
      if (desiredSaved === false) {
        await tx.query("DELETE FROM favorites WHERE user_id = $1 AND truck_id = $2", [user.id, id]);
        return { truck_id: id, saved: false };
      }

      const found = await tx.query(
        "SELECT 1 FROM favorites WHERE user_id = $1 AND truck_id = $2 FOR UPDATE",
        [user.id, id]
      );
      if (found.rowCount) {
        await tx.query("DELETE FROM favorites WHERE user_id = $1 AND truck_id = $2", [user.id, id]);
        return { truck_id: id, saved: false };
      }
      await tx.query(
        "INSERT INTO favorites(user_id, truck_id) VALUES($1, $2) ON CONFLICT (user_id, truck_id) DO NOTHING",
        [user.id, id]
      );
      return { truck_id: id, saved: true };
    });
    return res.json(outcome);
  } catch (err) {
    if (respondIfSessionEligibilityError(err, res)) return;
    return res.status(503).json({ error: "Favorites could not be updated right now." });
  }
}
