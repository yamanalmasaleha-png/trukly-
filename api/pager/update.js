import { db, auth } from "hatchable";
import {
  UUID_RE,
  loadAccessContext,
  reverifyVendorMembershipInTx,
  recordAuditLog,
  redactPagerTargetId,
  isWritePaused,
  applyPrivateNoStoreHeaders
} from "../../lib/authz.js";
import { withTransaction } from "../../lib/db-tx.js";

export const access = "user";
export const methods = ["POST"];

const ALLOWED_PAGER_STATUSES = new Set(["cooking", "almost", "ready", "collected", "cancelled"]);

export default async function(req, res) {
  applyPrivateNoStoreHeaders(res);

  if (isWritePaused("pagers")) {
    return res.status(503).json({ error: "Pickup pager updates are temporarily paused for maintenance." });
  }

  try {
    const ctx = await loadAccessContext(req, auth, db);
    if (!ctx.authenticated) {
      return res.status(401).json({ error: "Sign in is required." });
    }
    if (!ctx.isPlatformAdmin && ctx.memberships.size === 0) {
      return res.status(403).json({ error: "Vendor staff or owner membership is required." });
    }

    const b = req.body && typeof req.body === "object" ? req.body : {};
    const id = typeof b.id === "string" ? b.id.trim() : "";
    const status = typeof b.status === "string" ? b.status.trim().toLowerCase() : "";

    if (!UUID_RE.test(id) || !ALLOWED_PAGER_STATUSES.has(status)) {
      return res.status(400).json({ error: "Choose a valid ticket and status." });
    }

    const outcome = await withTransaction(db, async tx => {
      const { rows } = await tx.query(
        `SELECT id, vendor_id, vendor, ticket, status, expires_at
         FROM pickup_pagers
         WHERE id = $1
         FOR UPDATE`,
        [id]
      );
      if (!rows.length) {
        return { status: 404, body: { error: "Pager ticket not found." } };
      }

      const pager = rows[0];
      let actorRole = "platform_admin";
      if (!pager.vendor_id) {
        const verifiedAdmin = await reverifyVendorMembershipInTx(tx, ctx, null, "staff");
        if (!verifiedAdmin.ok || verifiedAdmin.actorRole !== "platform_admin") {
          return { status: 403, body: { error: "You do not have permission for this pager ticket." } };
        }
        actorRole = "platform_admin";
      } else {
        const verifiedAuthz = await reverifyVendorMembershipInTx(tx, ctx, pager.vendor_id, "staff");
        if (!verifiedAuthz.ok) {
          return { status: 403, body: { error: "You do not have permission for this pager ticket." } };
        }
        actorRole = verifiedAuthz.actorRole;
      }

      if (new Date(pager.expires_at) <= new Date() || ["collected", "cancelled"].includes(pager.status)) {
        return { status: 404, body: { error: "This pager has ended or expired." } };
      }

      const { rows: updated } = await tx.query(
        `UPDATE pickup_pagers
         SET status = $2, updated_by = $3, updated_at = now()
         WHERE id = $1
         RETURNING id, vendor_id, vendor, ticket, status, updated_at, expires_at`,
        [id, status, ctx.user.id]
      );

      await recordAuditLog(tx, {
        actorId: ctx.user.id,
        actorRole,
        vendorId: pager.vendor_id || null,
        targetType: "pickup_pager",
        targetId: redactPagerTargetId(pager.id),
        action: "pager.status_transition",
        metadata: {
          ticket: pager.ticket,
          from_status: pager.status,
          to_status: status
        }
      });

      return { status: 200, body: { pager: updated[0] } };
    });

    return res.status(outcome.status).json(outcome.body);
  } catch {
    return res.status(503).json({ error: "Pager update service is temporarily unavailable." });
  }
}
