import { db } from "hatchable";

export const access = "admin";
export const methods = ["GET", "POST"];

function resolveTruckId(req) {
  const raw = String(req.query?.truck_id || req.body?.truck_id || "owner-truck").trim().slice(0, 80);
  return !raw || raw === "estrella" ? "owner-truck" : raw;
}

export default async function(req, res) {
  const id = resolveTruckId(req);

  if (req.method === "POST") {
    const b = req.body || {};
    const location = String(b.location || "").trim().slice(0, 240);
    if (!location) return res.status(400).json({ error: "Location is required" });

    const hasOpenFlag = typeof b.is_open === "boolean";
    const opensAt = b.opens_at ? String(b.opens_at).slice(0, 8) : null;
    const closesAt = b.closes_at ? String(b.closes_at).slice(0, 8) : null;

    const { rows } = hasOpenFlag || opensAt || closesAt
      ? await db.query(
          "INSERT INTO truck_settings (truck_id, location, is_open, opens_at, closes_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (truck_id) DO UPDATE SET location = EXCLUDED.location, is_open = COALESCE($6, truck_settings.is_open), opens_at = COALESCE(EXCLUDED.opens_at, truck_settings.opens_at), closes_at = COALESCE(EXCLUDED.closes_at, truck_settings.closes_at), updated_at = now() RETURNING *",
          [id, location, hasOpenFlag ? b.is_open : true, opensAt, closesAt, hasOpenFlag ? b.is_open : null]
        )
      : await db.query(
          "INSERT INTO truck_settings (truck_id, location) VALUES ($1, $2) ON CONFLICT (truck_id) DO UPDATE SET location = EXCLUDED.location, updated_at = now() RETURNING *",
          [id, location]
        );
    return res.json(rows[0]);
  }

  const { rows } = await db.query("SELECT * FROM truck_settings WHERE truck_id = $1", [id]);
  res.json(rows[0] || {
    truck_id: id,
    location: "Ross Street, Downtown Santa Rosa",
    is_open: false,
    opens_at: null,
    closes_at: null
  });
}
