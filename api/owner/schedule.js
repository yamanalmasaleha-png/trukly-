import { db } from "hatchable";

export const access = "admin";
export const methods = ["GET", "POST"];

export default async function(req, res) {
  if (req.method === "POST") {
    const b = req.body || {};
    const truckId = String(b.truck_id || "").trim().slice(0, 80);
    const serviceDate = String(b.service_date || "").trim();
    if (!truckId || !/^\d{4}-\d{2}-\d{2}$/.test(serviceDate)) {
      return res.status(400).json({ error: "truck_id and YYYY-MM-DD service_date are required" });
    }
    const opensAt = b.opens_at ? String(b.opens_at).slice(0, 8) : null;
    const closesAt = b.closes_at ? String(b.closes_at).slice(0, 8) : null;
    const location = b.location ? String(b.location).trim().slice(0, 240) : null;
    const status = ["scheduled", "unavailable"].includes(b.status) ? b.status : "scheduled";

    const { rows } = await db.query(
      "INSERT INTO owner_schedule(truck_id, service_date, opens_at, closes_at, location, status) VALUES($1, $2, $3, $4, $5, $6) ON CONFLICT(truck_id, service_date) DO UPDATE SET opens_at = EXCLUDED.opens_at, closes_at = EXCLUDED.closes_at, location = EXCLUDED.location, status = EXCLUDED.status RETURNING *",
      [truckId, serviceDate, opensAt, closesAt, location, status]
    );
    return res.json(rows[0]);
  }

  const filterTruck = String(req.query?.truck_id || "").trim();
  const { rows } = filterTruck
    ? await db.query(
        "SELECT * FROM owner_schedule WHERE truck_id = $1 AND service_date >= CURRENT_DATE ORDER BY service_date ASC LIMIT 60",
        [filterTruck]
      )
    : await db.query(
        "SELECT * FROM owner_schedule WHERE service_date >= CURRENT_DATE ORDER BY service_date ASC LIMIT 60"
      );
  res.json({ schedule: rows });
}
