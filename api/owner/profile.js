import { db, auth } from "hatchable";
import { loadAccessContext, authorizeVendorTarget, recordAuditLog } from "../../lib/authz.js";
import { withTransaction } from "../../lib/db-tx.js";

export const access = "user";
export const methods = ["GET", "POST"];

export default async function(req, res) {
  try {
    const ctx = await loadAccessContext(req, auth, db);

    if (req.method === "POST") {
      const b = req.body && typeof req.body === "object" ? req.body : {};
      const authz = await authorizeVendorTarget(ctx, b.truck_id || req.query?.truck_id, "owner", db);
      if (!authz.ok) return res.status(authz.status).json({ error: authz.error });

      if (typeof b.display_name !== "string" || b.display_name.trim().length < 2 || b.display_name.trim().length > 120) {
        return res.status(400).json({ error: "display_name must be between 2 and 120 characters." });
      }
      if (b.description != null && (typeof b.description !== "string" || b.description.trim().length > 500)) {
        return res.status(400).json({ error: "description cannot exceed 500 characters." });
      }
      if (b.cuisine != null && (typeof b.cuisine !== "string" || b.cuisine.trim().length > 60)) {
        return res.status(400).json({ error: "cuisine cannot exceed 60 characters." });
      }
      if (b.accepting_bookings !== undefined && typeof b.accepting_bookings !== "boolean") {
        return res.status(400).json({ error: "accepting_bookings must be a boolean." });
      }

      const displayName = b.display_name.trim();
      const description = typeof b.description === "string" && b.description.trim() ? b.description.trim() : null;
      const cuisine = typeof b.cuisine === "string" && b.cuisine.trim() ? b.cuisine.trim() : null;
      const accepting = b.accepting_bookings !== false;

      const saved = await withTransaction(db, async tx => {
        const { rows } = await tx.query(
          `INSERT INTO owner_profiles (truck_id, display_name, description, cuisine, accepting_bookings, updated_at)
           VALUES ($1, $2, $3, $4, $5, now())
           ON CONFLICT (truck_id) DO UPDATE
             SET display_name = EXCLUDED.display_name,
                 description = EXCLUDED.description,
                 cuisine = EXCLUDED.cuisine,
                 accepting_bookings = EXCLUDED.accepting_bookings,
                 updated_at = now()
           RETURNING *`,
          [authz.vendorId, displayName, description, cuisine, accepting]
        );
        await recordAuditLog(tx, {
          actorId: ctx.user.id,
          actorRole: authz.actorRole,
          vendorId: authz.vendorId,
          targetType: "owner_profile",
          targetId: authz.vendorId,
          action: "profile.update",
          metadata: { accepting_bookings: accepting }
        });
        return rows[0];
      });

      return res.json(saved);
    }

    const authz = await authorizeVendorTarget(ctx, req.query?.truck_id, "staff", db);
    if (!authz.ok) return res.status(authz.status).json({ error: authz.error });

    const { rows } = await db.query(
      `SELECT
         v.id AS truck_id,
         COALESCE(op.display_name, v.canonical_name) AS display_name,
         op.description,
         COALESCE(op.cuisine, v.cuisine) AS cuisine,
         COALESCE(op.accepting_bookings, true) AS accepting_bookings,
         op.updated_at
       FROM vendors v
       LEFT JOIN owner_profiles op ON op.truck_id = v.id
       WHERE v.id = $1`,
      [authz.vendorId]
    );

    if (!rows.length) return res.status(404).json({ error: "Vendor not found." });
    return res.json(rows[0]);
  } catch {
    return res.status(503).json({ error: "Owner profile service is temporarily unavailable." });
  }
}
