import { db, auth } from "hatchable";
import { loadAccessContext, authorizeVendorScope, applyPrivateNoStoreHeaders } from "../../lib/authz.js";

export const access = "user";
export const methods = ["GET"];

export default async function(req, res) {
  applyPrivateNoStoreHeaders(res);
  try {
    const ctx = await loadAccessContext(req, auth, db);
    const scope = await authorizeVendorScope(ctx, req.query?.truck_id, db);
    if (!scope.ok) return res.status(scope.status).json({ error: scope.error });

    const { rows } = scope.global
      ? await db.query(
          `SELECT
             count(*)::int AS total_requests,
             count(*) FILTER (WHERE status = 'pending')::int AS pending,
             count(*) FILTER (WHERE status = 'accepted')::int AS accepted
           FROM bookings`
        )
      : await db.query(
          `SELECT
             count(*)::int AS total_requests,
             count(*) FILTER (WHERE status = 'pending')::int AS pending,
             count(*) FILTER (WHERE status = 'accepted')::int AS accepted
           FROM bookings
           WHERE truck_id = ANY($1::text[])`,
          [scope.vendorIds]
        );

    return res.json({
      ...(rows[0] || { total_requests: 0, pending: 0, accepted: 0 }),
      actor: {
        user_id: ctx.user.id,
        is_platform_admin: ctx.isPlatformAdmin,
        is_moderator: ctx.isModerator,
        admin_level: ctx.adminLevel,
        admin_label: ctx.adminLabel,
        role_labels: ctx.roleLabels,
        vendors: Array.from(ctx.memberships.values())
      }
    });
  } catch {
    return res.status(503).json({ error: "Owner statistics are temporarily unavailable." });
  }
}
