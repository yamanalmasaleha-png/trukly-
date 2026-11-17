import { db } from "hatchable";

export const access = "public";
export const methods = ["GET"];

export default async function(req, res) {
  const now = new Date();
  const localToday = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);

  const requested = String(req.query?.date || "").trim();
  if (requested && !/^\d{4}-\d{2}-\d{2}$/.test(requested)) {
    return res.status(400).json({ error: "date must use YYYY-MM-DD format" });
  }
  const date = requested || localToday;

  let events = [];
  try {
    const { rows } = await db.query(
      "SELECT s.truck_id, COALESCE(p.display_name, s.truck_id) AS vendor, s.location, s.opens_at, s.closes_at, s.status FROM owner_schedule s LEFT JOIN owner_profiles p ON p.truck_id = s.truck_id WHERE s.service_date = $1 AND s.status <> 'unavailable' ORDER BY s.opens_at ASC NULLS LAST, s.truck_id ASC LIMIT 50",
      [date]
    );
    events = rows.map(r => ({
      truck_id: r.truck_id,
      vendor: r.vendor,
      location: r.location || "Sonoma County · check vendor listing",
      opens: r.opens_at ? String(r.opens_at).slice(0, 5) : null,
      closes: r.closes_at ? String(r.closes_at).slice(0, 5) : null,
      status: r.status
    }));
  } catch {
    events = [];
  }

  res.json({
    local_date: date,
    timezone: "America/Los_Angeles",
    source: "owner_schedule",
    events
  });
}
