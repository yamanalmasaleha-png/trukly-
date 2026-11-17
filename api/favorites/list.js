import { db, auth } from "hatchable";
import { resolveIdentity, applyPrivateNoStoreHeaders } from "../../lib/authz.js";

export const access = "user";
export const methods = ["GET"];

export default async function(req, res) {
  applyPrivateNoStoreHeaders(res);
  const user = await resolveIdentity(req, auth);
  if (!user) return res.status(401).json({ error: "Sign in is required." });

  try {
    const { rows } = await db.query(
      "SELECT truck_id, created_at FROM favorites WHERE user_id = $1 ORDER BY created_at DESC",
      [user.id]
    );
    return res.json({ favorites: rows });
  } catch {
    return res.status(503).json({ error: "Favorites are temporarily unavailable." });
  }
}
