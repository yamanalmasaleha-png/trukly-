import { db, auth } from "@biteshark/runtime-adapter";
import {
  loadAccessContext,
  authorizeVendorTarget,
  authorizeVendorScope,
  reverifyVendorMembershipInTx,
  recordAuditLog,
  isWritePaused,
  applyPrivateNoStoreHeaders
} from "../../lib/authz.js";
import { isValidCalendarDate, isValidTimeValue, getPacificToday, normalizeCalendarDate } from "../../lib/dates.js";
import { findForbiddenSelfElevationField } from "../../lib/discovery.js";
import { withTransaction } from "../../lib/db-tx.js";

export const access = "user";
export const methods = ["GET", "POST"];

export default async function(req, res) {
  applyPrivateNoStoreHeaders(res);
  try {
    const ctx = await loadAccessContext(req, auth, db);
    const pacificToday = getPacificToday();

    if (req.method === "POST") {
      if (isWritePaused("owner")) {
        return res.status(503).json({ error: "Owner schedule updates are temporarily paused for maintenance." });
      }

      const b = req.body && typeof req.body === "object" ? req.body : {};
      const authz = await authorizeVendorTarget(ctx, b.truck_id, "staff", db);
      if (!authz.ok) return res.status(authz.status).json({ error: authz.error });

      const forbiddenField = findForbiddenSelfElevationField(b);
      if (forbiddenField) {
        return res.status(403).json({
          error: "Verification status and photo rights are controlled by platform review and cannot be modified by vendors.",
          field: forbiddenField
        });
      }

      const serviceDate = typeof b.service_date === "string" ? b.service_date.trim() : "";
      if (!isValidCalendarDate(serviceDate) || serviceDate < pacificToday) {
        return res.status(400).json({ error: `Enter a valid current or future service_date (on or after ${pacificToday}).` });
      }

      const status = b.status === undefined ? "scheduled" : String(b.status).trim();
      if (!["scheduled", "unavailable"].includes(status)) {
        return res.status(400).json({ error: "status must be 'scheduled' or 'unavailable'." });
      }

      const opensAt = b.opens_at == null || b.opens_at === "" ? null : String(b.opens_at).trim();
      const closesAt = b.closes_at == null || b.closes_at === "" ? null : String(b.closes_at).trim();
      if ((opensAt && !isValidTimeValue(opensAt)) || (closesAt && !isValidTimeValue(closesAt))) {
        return res.status(400).json({ error: "opens_at and closes_at must use HH:MM format." });
      }

      if (b.location != null && (typeof b.location !== "string" || b.location.trim().length > 240)) {
        return res.status(400).json({ error: "location cannot exceed 240 characters." });
      }
      const location = typeof b.location === "string" && b.location.trim() ? b.location.trim() : null;

      const outcome = await withTransaction(db, async tx => {
        // Acquire FOR NO KEY UPDATE on `vendors` + FOR SHARE on `vendor_memberships`/`platform_roles` in one step
        // to serialize both against permission downgrades/deactivations and against concurrent booking creation/acceptance (`FOR SHARE`).
        const verifiedAuthz = await reverifyVendorMembershipInTx(tx, ctx, authz.vendorId, "staff", {
          vendorLockMode: "NO KEY UPDATE"
        });
        if (!verifiedAuthz.ok) {
          return { status: verifiedAuthz.status, body: { error: verifiedAuthz.error } };
        }

        const { rows } = await tx.query(
          `INSERT INTO owner_schedule (truck_id, service_date, opens_at, closes_at, location, status, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, now())
           ON CONFLICT (truck_id, service_date) DO UPDATE
             SET opens_at = EXCLUDED.opens_at,
                 closes_at = EXCLUDED.closes_at,
                 location = EXCLUDED.location,
                 status = EXCLUDED.status,
                 updated_at = now()
           RETURNING id, truck_id, to_char(service_date, 'YYYY-MM-DD') AS service_date, opens_at, closes_at, location, status, updated_at`,
          [authz.vendorId, serviceDate, opensAt, closesAt, location, status]
        );
        const normalized = {
          ...rows[0],
          service_date: normalizeCalendarDate(rows[0].service_date)
        };
        await recordAuditLog(tx, {
          actorId: ctx.user.id,
          actorRole: verifiedAuthz.actorRole,
          vendorId: authz.vendorId,
          targetType: "owner_schedule",
          targetId: normalized.id,
          action: "schedule.upsert",
          metadata: { service_date: normalized.service_date, status }
        });
        return { status: 200, body: normalized };
      });

      return res.status(outcome.status).json(outcome.body);
    }

    const scope = await authorizeVendorScope(ctx, req.query?.truck_id, db);
    if (!scope.ok) return res.status(scope.status).json({ error: scope.error });

    const selectCols = "id, truck_id, to_char(service_date, 'YYYY-MM-DD') AS service_date, opens_at, closes_at, location, status, updated_at";
    const { rows } = scope.global
      ? await db.query(
          `SELECT ${selectCols} FROM owner_schedule WHERE service_date >= $1 ORDER BY service_date ASC, truck_id ASC LIMIT 60`,
          [pacificToday]
        )
      : await db.query(
          `SELECT ${selectCols} FROM owner_schedule WHERE truck_id = ANY($1::text[]) AND service_date >= $2 ORDER BY service_date ASC, truck_id ASC LIMIT 60`,
          [scope.vendorIds, pacificToday]
        );

    return res.json({
      schedule: rows.map(r => ({
        ...r,
        service_date: normalizeCalendarDate(r.service_date)
      }))
    });
  } catch {
    return res.status(503).json({ error: "Owner schedule service is temporarily unavailable." });
  }
}
