import { db, auth } from "hatchable";
import { resolveIdentity } from "../../lib/authz.js";
import { withTransaction } from "../../lib/db-tx.js";

export const access = "user";
export const methods = ["GET"];

export default async function(req, res) {
  const user = await resolveIdentity(req, auth);
  if (!user) {
    return res.status(401).json({ error: "Sign in to see your submissions." });
  }

  try {
    const rows = await withTransaction(db, async tx => {
      await tx.query("SELECT set_config('app.user_id', $1, true)", [user.id]);
      const out = await tx.query(
        `SELECT id, kind, place_id, place_name, town, title, status, created_at
         FROM community_reviews
         WHERE author_id = $1
         ORDER BY created_at DESC
         LIMIT 30`,
        [user.id]
      );
      return out.rows;
    });
    return res.json({ submissions: rows });
  } catch {
    return res.status(503).json({ error: "Your submissions could not be loaded right now." });
  }
}
