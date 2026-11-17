import { db, auth } from "hatchable";
import { loadAccessContext, authorizeVendorTarget, recordAuditLog, isWritePaused } from "../../lib/authz.js";
import { isValidTimeValue } from "../../lib/dates.js";
import { withTransaction } from "../../lib/db-tx.js";

export const access = "user";
export const methods = ["GET", "POST"];

export default async function(req, res) {
  try {
    const ctx = await loadAccessContext(req, auth, db);

    if (req.method === "POST") {
      if (isWritePaused("owner")) {
        return res.status(503).json({ error: "Owner location updates are temporarily paused for maintenance." });
      }

      const b = req.body && typeof req.body === "object" ? req.body : {};
      const authz = await authorizeVendorTarget(ctx, b.truck_id || req.query?.truck_id, "staff", db);
      if (!authz.ok) return res.status(authz.status).json({ error: authz.error });

      if (typeof b.location !== "string" || b.location.trim().length < 2 || b.location.trim().length > 240) {
        return res.status(400).json({ error: "Location must be between 2 and 240 characters." });
      }
      if (b.is_open !== undefined && typeof b.is_open !== "boolean") {
        return res.status(400).json({ error: "is_open must be a boolean." });
      }

      const rawOpens = b.opens_at == null || b.opens_at === "" ? null : String(b.opens_at).trim();
      const rawCloses = b.closes_at == null || b.closes_at === "" ? null : String(b.closes_at).trim();
      if ((rawOpens && !isValidTimeValue(rawOpens)) || (rawCloses && !isValidTimeValue(rawCloses))) {
        return res.status(400).json({ error: "opens_at and closes_at must use HH:MM format." });
      }

      const location = b.location.trim();
      const hasOpenFlag = typeof b.is_open === "boolean";

      const saved = await withTransaction(db, async tx => {
        const { rows } = hasOpenFlag || rawOpens || rawCloses
          ? await tx.query(
              `INSERT INTO truck_settings (truck_id, location, is_open, opens_at, closes_at, updated_at)
               VALUES ($1, $2, $3, $4, $5, now())
               ON CONFLICT (truck_id) DO UPDATE
                 SET location = EXCLUDED.location,
                     is_open = COALESCE($6, truck_settings.is_open),
                     opens_at = COALESCE(EXCLUDED.opens_at, truck_settings.opens_at),
                     closes_at = COALESCE(EXCLUDED.closes_at, truck_settings.closes_at),
                     updated_at = now()
               RETURNING *`,
              [authz.vendorId, location, hasOpenFlag ? b.is_open : true, rawOpens, rawCloses, hasOpenFlag ? b.is_open : null]
            )
          : await tx.query(
              `INSERT INTO truck_settings (truck_id, location, updated_at)
               VALUES ($1, $2, now())
               ON CONFLICT (truck_id) DO UPDATE
                 SET location = EXCLUDED.location,
                     updated_at = now()
               RETURNING *`,
              [authz.vendorId, location]
            );

        await recordAuditLog(tx, {
          actorId: ctx.user.id,
          actorRole: authz.actorRole,
          vendorId: authz.vendorId,
          targetType: "truck_settings",
          targetId: authz.vendorId,
          action: "location.update",
          metadata: { is_open: rows[0].is_open }
        });
        return rows[0];
      });

      return res.json(saved);
    }

    const authz = await authorizeVendorTarget(ctx, req.query?.truck_id, "staff", db);
    if (!authz.ok) return res.status(authz.status).json({ error: authz.error });

    const { rows } = await db.query("SELECT * FROM truck_settings WHERE truck_id = $1", [authz.vendorId]);
    return res.json(
      rows[0] || {
        truck_id: authz.vendorId,
        location: "Sonoma County · update live location",
        is_open: false,
        opens_at: null,
        closes_at: null
      }
    );
  } catch {
    return res.status(503).json({ error: "Owner location service is temporarily unavailable." });
  }
}
