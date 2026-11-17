import { db, auth } from "hatchable";
import { loadAccessContext, authorizeVendorScope, applyPrivateNoStoreHeaders } from "../../lib/authz.js";
import { normalizeCalendarDate } from "../../lib/dates.js";

export const access = "user";
export const methods = ["GET"];

const ALLOWED_STATUSES = new Set(["pending", "accepted", "declined", "cancelled"]);

export default async function(req, res) {
  applyPrivateNoStoreHeaders(res);
  try {
    const ctx = await loadAccessContext(req, auth, db);
    const scope = await authorizeVendorScope(ctx, req.query?.truck_id, db);
    if (!scope.ok) return res.status(scope.status).json({ error: scope.error });

    const status = String(req.query?.status || "").trim().toLowerCase();
    if (status && !ALLOWED_STATUSES.has(status)) {
      return res.status(400).json({ error: "Invalid booking status filter." });
    }

    const selectCols = `
      id, truck_id, truck_name, event_type,
      to_char(event_date, 'YYYY-MM-DD') AS event_date,
      guest_count, location, note,
      COALESCE(requester_email, requester) AS requester,
      package_id, package_name, package_price, status, decided_by, decided_at, created_at
    `;

    let rows;
    if (scope.global) {
      rows = status
        ? (await db.query(`SELECT ${selectCols} FROM bookings WHERE status = $1 ORDER BY event_date DESC, created_at DESC LIMIT 100`, [status])).rows
        : (await db.query(`SELECT ${selectCols} FROM bookings ORDER BY event_date DESC, created_at DESC LIMIT 100`)).rows;
    } else {
      rows = status
        ? (await db.query(
            `SELECT ${selectCols} FROM bookings WHERE truck_id = ANY($1::text[]) AND status = $2 ORDER BY event_date DESC, created_at DESC LIMIT 100`,
            [scope.vendorIds, status]
          )).rows
        : (await db.query(
            `SELECT ${selectCols} FROM bookings WHERE truck_id = ANY($1::text[]) ORDER BY event_date DESC, created_at DESC LIMIT 100`,
            [scope.vendorIds]
          )).rows;
    }

    return res.json({
      bookings: rows.map(r => ({
        ...r,
        event_date: r.event_date == null ? null : normalizeCalendarDate(r.event_date)
      }))
    });
  } catch {
    return res.status(503).json({ error: "Owner bookings service is temporarily unavailable." });
  }
}
