import { db } from "hatchable";
import { isValidCalendarDate, getPacificToday } from "../../lib/dates.js";
import { applyDiscoveryCacheHeaders } from "../../lib/discovery.js";

export const access = "public";
export const methods = ["GET"];

export default async function(req, res) {
  const now = req._testNow instanceof Date ? req._testNow : new Date();
  const localToday = getPacificToday(now);

  const requested = typeof req.query?.date === "string" ? req.query.date.trim() : "";
  if (requested && !isValidCalendarDate(requested)) {
    return res.status(400).json({ error: "date must be a real YYYY-MM-DD calendar date" });
  }
  const date = requested || localToday;
  const freshRequested = req.query?.fresh === "1";

  try {
    const { rows } = await db.query(
      `SELECT
         s.truck_id,
         COALESCE(NULLIF(btrim(p.display_name), ''), v.canonical_name, s.truck_id) AS vendor,
         COALESCE(NULLIF(btrim(s.location), ''), v.curated_location, 'Sonoma County · check vendor listing') AS location,
         s.opens_at,
         s.closes_at,
         s.status,
         GREATEST(v.updated_at, COALESCE(p.updated_at, 'epoch'::timestamptz), COALESCE(s.updated_at, 'epoch'::timestamptz)) AS row_updated_at
       FROM owner_schedule s
       JOIN vendors v ON v.id = s.truck_id AND v.is_active = true
       LEFT JOIN owner_profiles p ON p.truck_id = s.truck_id
       WHERE s.service_date = $1 AND s.status <> 'unavailable'
       ORDER BY s.opens_at ASC NULLS LAST, s.truck_id ASC
       LIMIT 50`,
      [date]
    );

    let maxMs = 0;
    for (const r of rows) {
      const ms = r.row_updated_at ? new Date(r.row_updated_at).getTime() : 0;
      if (ms > maxMs) maxMs = ms;
    }
    const scheduleVersion = `s1:${date}:${maxMs}:${rows.length}`;
    applyDiscoveryCacheHeaders(res, scheduleVersion, freshRequested);

    const events = rows.map(r => ({
      truck_id: r.truck_id,
      vendor: r.vendor,
      location: r.location,
      opens: r.opens_at ? String(r.opens_at).slice(0, 5) : null,
      closes: r.closes_at ? String(r.closes_at).slice(0, 5) : null,
      status: r.status
    }));

    return res.json({
      local_date: date,
      timezone: "America/Los_Angeles",
      source: "owner_schedule",
      schedule_version: scheduleVersion,
      events
    });
  } catch {
    return res.status(503).json({
      error: "Today's schedule is temporarily unavailable.",
      code: "DISCOVERY_DB_UNAVAILABLE",
      retryable: true
    });
  }
}
