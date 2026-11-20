import { db, auth } from "@biteshark/runtime-adapter";
import {
  UUID_RE,
  loadAccessContext,
  authorizeVendorScope,
  reverifyVendorMembershipInTx,
  recordAuditLog,
  isWritePaused,
  applyPrivateNoStoreHeaders
} from "../../lib/authz.js";
import { normalizeCalendarDate } from "../../lib/dates.js";
import { withTransaction } from "../../lib/db-tx.js";

export const access = "user";
export const methods = ["GET", "POST"];

export default async function(req, res) {
  applyPrivateNoStoreHeaders(res);
  try {
    const ctx = await loadAccessContext(req, auth, db);
    if (!ctx.authenticated) {
      return res.status(401).json({ error: "Sign in is required." });
    }

    if (req.method === "POST") {
      if (isWritePaused("owner") || isWritePaused("bookings")) {
        return res.status(503).json({ error: "Booking status updates are temporarily paused for maintenance." });
      }

      if (!ctx.isPlatformAdmin && ctx.memberships.size === 0) {
        return res.status(403).json({ error: "Vendor owner permission is required." });
      }

      const b = req.body && typeof req.body === "object" ? req.body : {};
      const cleanId = typeof b.id === "string" ? b.id.trim() : "";
      const targetStatus = typeof b.status === "string" ? b.status.trim().toLowerCase() : "";

      if (!UUID_RE.test(cleanId) || !["accepted", "declined"].includes(targetStatus)) {
        return res.status(400).json({ error: "Valid booking UUID and status ('accepted' or 'declined') are required." });
      }

      const outcome = await withTransaction(db, async tx => {
        const { rows: locked } = await tx.query(
          "SELECT id, truck_id, to_char(event_date, 'YYYY-MM-DD') AS event_date, status FROM bookings WHERE id = $1 FOR UPDATE",
          [cleanId]
        );
        if (!locked.length) {
          return { status: 404, body: { error: "Booking request not found." } };
        }
        const booking = locked[0];
        const canonicalEventDate = normalizeCalendarDate(booking.event_date);

        let actorRole = "platform_admin";
        if (!booking.truck_id) {
          const verifiedAdmin = await reverifyVendorMembershipInTx(tx, ctx, null, "owner");
          if (!verifiedAdmin.ok || verifiedAdmin.actorRole !== "platform_admin") {
            return { status: 403, body: { error: "Unassigned legacy bookings require platform administrator access." } };
          }
          actorRole = "platform_admin";
        } else {
          const authz = await reverifyVendorMembershipInTx(tx, ctx, booking.truck_id, "owner", {
            allowInactiveForAdmin: true
          });
          if (!authz.ok) {
            return { status: authz.status, body: { error: authz.error } };
          }
          actorRole = authz.actorRole;
        }

        if (booking.status !== "pending") {
          return {
            status: 409,
            body: { error: `Booking has already been ${booking.status} and cannot transition to ${targetStatus}.` }
          };
        }

        if (targetStatus === "accepted" && booking.truck_id) {
          // Lock vendor row FOR SHARE to serialize against concurrent schedule unavailability inserts (`FOR NO KEY UPDATE`).
          await tx.query("SELECT id FROM vendors WHERE id = $1 FOR SHARE", [booking.truck_id]);
          const { rows: schedRows } = await tx.query(
            "SELECT status FROM owner_schedule WHERE truck_id = $1 AND service_date = $2 FOR SHARE",
            [booking.truck_id, canonicalEventDate]
          );
          if (schedRows[0]?.status === "unavailable") {
            return {
              status: 409,
              body: { error: "Cannot accept a booking on a date marked unavailable in the service schedule." }
            };
          }
        }

        const { rows: updated } = await tx.query(
          `UPDATE bookings
           SET status = $1, decided_by = $2, decided_at = now(), updated_at = now()
           WHERE id = $3 AND status = 'pending'
           RETURNING id, truck_id, status, decided_by, decided_at`,
          [targetStatus, ctx.user.id, cleanId]
        );

        await recordAuditLog(tx, {
          actorId: ctx.user.id,
          actorRole,
          vendorId: booking.truck_id || null,
          targetType: "booking",
          targetId: booking.id,
          action: targetStatus === "accepted" ? "booking.accept" : "booking.decline",
          metadata: {
            from_status: "pending",
            to_status: targetStatus,
            event_date: canonicalEventDate
          }
        });

        return { status: 200, body: updated[0] };
      });

      return res.status(outcome.status).json(outcome.body);
    }

    const scope = await authorizeVendorScope(ctx, req.query?.truck_id, db);
    if (!scope.ok) return res.status(scope.status).json({ error: scope.error });

    const selectCols = `
      id, truck_id, truck_name, event_type,
      to_char(event_date, 'YYYY-MM-DD') AS event_date,
      guest_count, location,
      COALESCE(requester_email, requester) AS requester,
      package_id, package_name, package_price, status, created_at
    `;

    const { rows } = scope.global
      ? await db.query(
          `SELECT ${selectCols} FROM bookings WHERE status = 'pending' ORDER BY event_date ASC, created_at ASC LIMIT 25`
        )
      : await db.query(
          `SELECT ${selectCols} FROM bookings WHERE status = 'pending' AND truck_id = ANY($1::text[]) ORDER BY event_date ASC, created_at ASC LIMIT 25`,
          [scope.vendorIds]
        );

    return res.json({
      requests: rows.map(r => ({
        ...r,
        event_date: r.event_date == null ? null : normalizeCalendarDate(r.event_date)
      }))
    });
  } catch {
    return res.status(503).json({ error: "Owner booking requests are temporarily unavailable." });
  }
}
