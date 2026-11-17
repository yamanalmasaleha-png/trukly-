import { db } from "hatchable";

export const access = "admin";
export const methods = ["GET", "POST"];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function(req, res) {
  if (req.method === "POST") {
    const { id, status } = req.body || {};
    const cleanId = String(id || "").trim();
    if (!UUID_RE.test(cleanId) || !["accepted", "declined"].includes(status)) {
      return res.status(400).json({ error: "Valid booking UUID and status (accepted or declined) are required" });
    }
    const { rows } = await db.query(
      "UPDATE bookings SET status = $1 WHERE id = $2 RETURNING id, status",
      [status, cleanId]
    );
    return rows[0] ? res.json(rows[0]) : res.status(404).json({ error: "Not found" });
  }

  const { rows } = await db.query(
    "SELECT id, event_type, event_date, guest_count, location, requester, truck_name, package_name, package_price, status, created_at FROM bookings WHERE status = 'pending' ORDER BY event_date ASC LIMIT 25"
  );
  res.json({ requests: rows });
}
