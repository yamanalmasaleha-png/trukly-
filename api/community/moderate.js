import { db, auth } from "@biteshark/runtime-adapter";
import {
  UUID_RE,
  loadAccessContext,
  reverifyModeratorInTx,
  recordAuditLog,
  isWritePaused,
  applyPrivateNoStoreHeaders
} from "../../lib/authz.js";
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
    if (!ctx.isModerator) {
      return res.status(403).json({ error: "Moderator or platform administrator access is required." });
    }

    const actorRole = ctx.isPlatformAdmin ? "platform_admin" : "moderator";

    if (req.method === "GET") {
      const pending = await withTransaction(db, async tx => {
        await tx.query(
          "SELECT set_config('app.can_moderate', 'true', true), set_config('app.user_id', $1, true)",
          [ctx.user.id]
        );
        const { rows } = await tx.query(
          `SELECT id, nickname, kind, place_id, place_name, town, title, body, rating, created_at
           FROM community_reviews
           WHERE status = 'pending'
           ORDER BY created_at ASC
           LIMIT 40`
        );
        return rows;
      });
      return res.json({ pending });
    }

    if (isWritePaused("community")) {
      return res.status(503).json({ error: "Community moderation writes are temporarily paused for maintenance." });
    }

    const b = req.body && typeof req.body === "object" ? req.body : {};
    const id = typeof b.id === "string" ? b.id.trim() : "";
    const status = typeof b.status === "string" ? b.status.trim().toLowerCase() : "";

    if (!UUID_RE.test(id) || !["approved", "rejected"].includes(status)) {
      return res.status(400).json({ error: "Choose an existing pending post UUID and a valid moderation decision." });
    }

    const outcome = await withTransaction(db, async tx => {
      const verifiedMod = await reverifyModeratorInTx(tx, ctx);
      if (!verifiedMod.ok) {
        return { status: verifiedMod.status, body: { error: verifiedMod.error } };
      }

      await tx.query(
        "SELECT set_config('app.can_moderate', 'true', true), set_config('app.user_id', $1, true)",
        [ctx.user.id]
      );

      const { rows: locked } = await tx.query(
        "SELECT id, place_id, status FROM community_reviews WHERE id = $1 FOR UPDATE",
        [id]
      );
      if (!locked.length) {
        return { status: 404, body: { error: "Pending post not found." } };
      }
      if (locked[0].status !== "pending") {
        return { status: 409, body: { error: `Post has already been ${locked[0].status}.` } };
      }

      const { rows: updated } = await tx.query(
        `UPDATE community_reviews
         SET status = $1, moderated_at = NOW(), moderated_by = $2
         WHERE id = $3 AND status = 'pending'
         RETURNING id, status, moderated_at`,
        [status, ctx.user.id, id]
      );

      await recordAuditLog(tx, {
        actorId: ctx.user.id,
        actorRole: verifiedMod.actorRole,
        vendorId: locked[0].place_id || null,
        targetType: "community_review",
        targetId: id,
        action: status === "approved" ? "community.approve" : "community.reject",
        metadata: {
          from_status: "pending",
          to_status: status
        }
      });

      return { status: 200, body: { post: updated[0] } };
    });

    return res.status(outcome.status).json(outcome.body);
  } catch {
    return res.status(503).json({ error: "Community moderation is temporarily unavailable." });
  }
}
