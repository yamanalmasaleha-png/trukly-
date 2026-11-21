import { db } from "@biteshark/runtime-adapter";
import { isValidCalendarDate, validateFuturePacificDate, normalizeCalendarDate } from "../../lib/dates.js";
import { evaluateEffectiveVendorRestrictions } from "../../lib/authz.js";
import { isVendorPubliclyDiscoverable } from "../../lib/discovery.js";

export const access = "public";
export const methods = ["GET"];

export default async function(req, res) {
  if (typeof res?.setHeader === "function") {
    res.setHeader("Cache-Control", "no-store, max-age=0");
  }
  const id = typeof req.query?.truck_id === "string" ? req.query.truck_id.trim() : "";
  const date = typeof req.query?.date === "string" ? req.query.date.trim() : "";

  if (!id || id.length > 80 || !isValidCalendarDate(date)) {
    return res.status(400).json({ error: "Valid truck_id and real calendar date (YYYY-MM-DD) are required." });
  }

  try {
    const now = req._now instanceof Date ? req._now : new Date();
    let vendorRows;
    try {
      ({ rows: vendorRows } = await db.query(
        `SELECT
           v.id,
           v.is_active,
           v.event_bookable,
           v.hidden_from_discovery,
           v.bookings_restricted,
           v.vendor_access_suspended,
           v.restriction_authority,
           v.temp_restriction_expires_at,
           COALESCE(op.accepting_bookings, true) AS accepting_bookings
         FROM vendors v
         LEFT JOIN owner_profiles op ON op.truck_id = v.id
         WHERE v.id = $1`,
        [id]
      ));
    } catch (colErr) {
      if (colErr?.code !== "42703") throw colErr;
      ({ rows: vendorRows } = await db.query(
        `SELECT
           v.id,
           v.is_active,
           v.event_bookable,
           COALESCE(op.accepting_bookings, true) AS accepting_bookings
         FROM vendors v
         LEFT JOIN owner_profiles op ON op.truck_id = v.id
         WHERE v.id = $1`,
        [id]
      ));
    }

    if (!vendorRows.length) {
      return res.status(404).json({ error: "Vendor not found." });
    }

    const vendor = vendorRows[0];
    if (!isVendorPubliclyDiscoverable({ ...vendor, is_active: true }, now.getTime())) {
      return res.status(404).json({ error: "Vendor not found." });
    }
    const effRestr = evaluateEffectiveVendorRestrictions(vendor, now.getTime());
    if (!vendor.is_active || !vendor.event_bookable) {
      return res.json({
        truck_id: id,
        date,
        schedule: null,
        requestable: false,
        reason: "vendor_not_bookable"
      });
    }

    const dateCheck = validateFuturePacificDate(date, now);
    if (!dateCheck.ok) {
      return res.json({
        truck_id: id,
        date,
        schedule: null,
        requestable: false,
        reason: "past_or_same_day_pacific"
      });
    }

    const { rows: schedRows } = await db.query(
      `SELECT to_char(service_date, 'YYYY-MM-DD') AS service_date, opens_at, closes_at, location, status
       FROM owner_schedule
       WHERE truck_id = $1 AND service_date = $2`,
      [id, date]
    );
    const schedule = schedRows[0]
      ? { ...schedRows[0], service_date: normalizeCalendarDate(schedRows[0].service_date) }
      : null;

    if (!vendor.accepting_bookings || effRestr.bookings_restricted || effRestr.vendor_access_suspended) {
      return res.json({
        truck_id: id,
        date,
        schedule,
        requestable: false,
        reason: "bookings_paused"
      });
    }

    if (schedule && schedule.status === "unavailable") {
      return res.json({
        truck_id: id,
        date,
        schedule,
        requestable: false,
        reason: "date_unavailable"
      });
    }

    return res.json({
      truck_id: id,
      date,
      schedule,
      requestable: true
    });
  } catch {
    return res.status(503).json({ error: "Vendor availability cannot be verified right now." });
  }
}
