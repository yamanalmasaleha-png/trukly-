import { db } from "hatchable";
import { isValidCalendarDate, getPacificToday } from "../../lib/dates.js";

export const access = "public";
export const methods = ["GET"];

export default async function(req, res) {
  const localToday = getPacificToday();

  const requested = typeof req.query?.date === "string" ? req.query.date.trim() : "";
  if (requested && !isValidCalendarDate(requested)) {
    return res.status(400).json({ error: "date must be a real YYYY-MM-DD calendar date" });
  }
  const date = requested || localToday;

  let events = [];
  try {
    const { rows } = await db.query(
      "SELECT s.truck_id, COALESCE(p.display_name, v.canonical_name, s.truck_id) AS vendor, s.location, s.opens_at, s.closes_at, s.status FROM owner_schedule s JOIN vendors v ON v.id = s.truck_id AND v.is_active = true LEFT JOIN owner_profiles p ON p.truck_id = s.truck_id WHERE s.service_date = $1 AND s.status <> 'unavailable' ORDER BY s.opens_at ASC NULLS LAST, s.truck_id ASC LIMIT 50",
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
