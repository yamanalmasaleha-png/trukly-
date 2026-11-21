import { db, auth } from "@biteshark/runtime-adapter";
import { resolveIdentity, applyPrivateNoStoreHeaders } from "../../lib/authz.js";

export const access = "user";
export const methods = ["POST"];

export default async function(req, res) {
  applyPrivateNoStoreHeaders(res);
  const user = await resolveIdentity(req, auth);
  if (!user) return res.status(401).json({ error: "Sign in is required." });

  const id = typeof req.body?.truck_id === "string" ? req.body.truck_id.trim() : "";
  if (!id || id.length > 80) return res.status(400).json({ error: "truck_id required" });
  const desiredSaved = typeof req.body?.desired_saved === "boolean" ? req.body.desired_saved : null;

  try {
    if (desiredSaved === true) {
      await db.query(
        "INSERT INTO favorites(user_id, truck_id) VALUES($1, $2) ON CONFLICT (user_id, truck_id) DO NOTHING",
        [user.id, id]
      );
      return res.json({ truck_id: id, saved: true });
    }
    if (desiredSaved === false) {
      await db.query("DELETE FROM favorites WHERE user_id = $1 AND truck_id = $2", [user.id, id]);
      return res.json({ truck_id: id, saved: false });
    }

    const found = await db.query("SELECT 1 FROM favorites WHERE user_id = $1 AND truck_id = $2", [user.id, id]);
    if (found.rowCount) {
      await db.query("DELETE FROM favorites WHERE user_id = $1 AND truck_id = $2", [user.id, id]);
      return res.json({ truck_id: id, saved: false });
    }
    await db.query("INSERT INTO favorites(user_id, truck_id) VALUES($1, $2) ON CONFLICT (user_id, truck_id) DO NOTHING", [user.id, id]);
    return res.json({ truck_id: id, saved: true });
  } catch {
    return res.status(503).json({ error: "Favorites could not be updated right now." });
  }
}
