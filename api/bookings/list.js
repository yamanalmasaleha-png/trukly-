import { db, auth } from "hatchable";
import { resolveIdentity } from "../../lib/authz.js";

export const access = "user";
export const methods = ["GET"];

export default async function(req, res) {
  const user = await resolveIdentity(req, auth);
  if (!user) {
    return res.status(401).json({ error: "Sign in to view your bookings." });
  }

  try {
    const { rows } = await db.query(
      `SELECT
         id, truck_id, truck_name, event_type, event_date, guest_count, location,
         package_id, package_name, package_price, status, decided_at, created_at
       FROM bookings
       WHERE requester_user_id = $1
       ORDER BY event_date DESC, created_at DESC
       LIMIT 50`,
      [user.id]
    );
    return res.json({ bookings: rows });
  } catch {
    return res.status(503).json({ error: "Bookings could not be loaded right now." });
  }
}
