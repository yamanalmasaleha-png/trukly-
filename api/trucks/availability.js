import { db } from "hatchable";
import { isValidCalendarDate, validateFuturePacificDate } from "../../lib/dates.js";

export const access = "public";
export const methods = ["GET"];

export default async function(req, res) {
  const id = typeof req.query?.truck_id === "string" ? req.query.truck_id.trim() : "";
  const date = typeof req.query?.date === "string" ? req.query.date.trim() : "";

  if (!id || id.length > 80 || !isValidCalendarDate(date)) {
    return res.status(400).json({ error: "Valid truck_id and real calendar date (YYYY-MM-DD) are required." });
  }

  try {
    const { rows: vendorRows } = await db.query(
      `SELECT
         v.id,
         v.is_active,
         v.event_bookable,
         COALESCE(op.accepting_bookings, true) AS accepting_bookings
       FROM vendors v
       LEFT JOIN owner_profiles op ON op.truck_id = v.id
       WHERE v.id = $1`,
      [id]
    );

    if (!vendorRows.length) {
      return res.status(404).json({ error: "Vendor not found." });
    }

    const vendor = vendorRows[0];
    if (!vendor.is_active || !vendor.event_bookable) {
      return res.json({
        truck_id: id,
        date,
        schedule: null,
        requestable: false,
        reason: "vendor_not_bookable"
      });
    }

    const dateCheck = validateFuturePacificDate(date, req._now instanceof Date ? req._now : new Date());
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
      "SELECT service_date, opens_at, closes_at, location, status FROM owner_schedule WHERE truck_id = $1 AND service_date = $2",
      [id, date]
    );
    const schedule = schedRows[0] || null;

    if (!vendor.accepting_bookings) {
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
