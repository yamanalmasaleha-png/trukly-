import crypto from "node:crypto";
import { db } from "@biteshark/runtime-adapter";
import { isValidCalendarDate, getPacificToday } from "../../lib/dates.js";
import { applyDiscoveryCacheHeaders, isVendorPubliclyDiscoverable } from "../../lib/discovery.js";

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
    let rows;
    try {
      ({ rows } = await db.query(
        `SELECT
           s.truck_id,
           COALESCE(NULLIF(btrim(p.display_name), ''), v.canonical_name, s.truck_id) AS vendor,
           COALESCE(NULLIF(btrim(s.location), ''), v.curated_location, 'Sonoma County · check vendor listing') AS location,
           s.opens_at,
           s.closes_at,
           s.status,
           v.is_active,
           v.hidden_from_discovery,
           v.restriction_authority,
           v.temp_restriction_expires_at,
           GREATEST(v.updated_at, COALESCE(p.updated_at, 'epoch'::timestamptz), COALESCE(s.updated_at, 'epoch'::timestamptz)) AS row_updated_at
         FROM owner_schedule s
         JOIN vendors v ON v.id = s.truck_id AND v.is_active = true
         LEFT JOIN owner_profiles p ON p.truck_id = s.truck_id
         WHERE s.service_date = $1 AND s.status <> 'unavailable'
         ORDER BY s.opens_at ASC NULLS LAST, s.truck_id ASC`,
        [date]
      ));
    } catch (colErr) {
      if (colErr?.code !== "42703") throw colErr;
      ({ rows } = await db.query(
        `SELECT
           s.truck_id,
           COALESCE(NULLIF(btrim(p.display_name), ''), v.canonical_name, s.truck_id) AS vendor,
           COALESCE(NULLIF(btrim(s.location), ''), v.curated_location, 'Sonoma County · check vendor listing') AS location,
           s.opens_at,
           s.closes_at,
           s.status,
           v.is_active,
           GREATEST(v.updated_at, COALESCE(p.updated_at, 'epoch'::timestamptz), COALESCE(s.updated_at, 'epoch'::timestamptz)) AS row_updated_at
         FROM owner_schedule s
         JOIN vendors v ON v.id = s.truck_id AND v.is_active = true
         LEFT JOIN owner_profiles p ON p.truck_id = s.truck_id
         WHERE s.service_date = $1 AND s.status <> 'unavailable'
         ORDER BY s.opens_at ASC NULLS LAST, s.truck_id ASC`,
        [date]
      ));
    }

    const nowMs = now.getTime();
    const visibleRows = rows.filter(r => isVendorPubliclyDiscoverable(r, nowMs)).slice(0, 50);

    const events = visibleRows.map(r => ({
      truck_id: r.truck_id,
      vendor: r.vendor,
      location: r.location,
      opens: r.opens_at ? String(r.opens_at).slice(0, 5) : null,
      closes: r.closes_at ? String(r.closes_at).slice(0, 5) : null,
      status: r.status
    }));

    const digest = crypto
      .createHash("sha256")
      .update(JSON.stringify({ date, events }))
      .digest("hex")
      .slice(0, 20);
    const scheduleVersion = `s2:${date}:${digest}:${events.length}`;
    const etag = applyDiscoveryCacheHeaders(res, scheduleVersion, {
      freshRequested,
      variantKey: `schedule:date=${date}`
    });

    if (etag && !freshRequested && req.headers?.["if-none-match"] === etag && typeof res.end === "function") {
      return res.status(304).end();
    }

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
