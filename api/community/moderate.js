import { db, auth } from "@biteshark/runtime-adapter";
import {
  UUID_RE,
  loadAccessContext,
  reverifyModeratorInTx,
  recordAuditLog,
  isWritePaused,
  applyPrivateNoStoreHeaders
} from "../../lib/authz.js";
import { withTransaction, respondIfSessionEligibilityError } from "../../lib/db-tx.js";

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

    if (req.method === "GET") {
      const out = await withTransaction(db, async tx => {
        const verifiedMod = await reverifyModeratorInTx(tx, ctx);
        if (!verifiedMod.ok) {
          return { denied: verifiedMod };
        }
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
        return { rows };
      });
      if (out.denied) {
        return res.status(out.denied.status).json({ error: out.denied.error });
      }
      return res.json({ pending: out.rows });
    }

    if (isWritePaused("community")) {
      return res.status(503).json({ error: "Community moderation writes are temporarily paused for maintenance." });
    }

    const b = req.body && typeof req.body === "object" ? req.body : {};
    const id = typeof b.id === "string" ? b.id.trim() : "";
    const status = typeof b.status === "string" ? b.status.trim().toLowerCase() : "";
    const reason = typeof b.reason === "string" ? b.reason.trim() : "";

    if (!UUID_RE.test(id) || !["approved", "rejected"].includes(status)) {
      return res.status(400).json({ error: "Choose an existing pending post UUID and a valid moderation decision." });
    }
    if (status === "rejected" && (reason.length < 3 || reason.length > 600)) {
      return res.status(400).json({ error: "A clear moderation reason (3–600 characters) is required when rejecting a submission." });
    }

    const outcome = await withTransaction(db, async tx => {
      const verifiedMod = await reverifyModeratorInTx(tx, ctx);
      if (!verifiedMod.ok) {
        return { status: verifiedMod.status, body: { error: verifiedMod.error } };
      }

      await tx.query(
        `SELECT
           set_config('app.can_moderate', 'true', true),
           set_config('app.admin_portal', 'true', true),
           set_config('app.user_id', $1, true)`,
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

      let updated;
      try {
        ({ rows: updated } = await tx.query(
          `UPDATE community_reviews
           SET status = $1,
               moderated_at = NOW(),
               moderated_by = $2,
               moderation_reason = $4
           WHERE id = $3 AND status = 'pending'
           RETURNING id, status, moderated_at`,
          [status, ctx.user.id, id, reason || null]
        ));
      } catch (colErr) {
        if (colErr?.code !== "42703") throw colErr;
        ({ rows: updated } = await tx.query(
          `UPDATE community_reviews
           SET status = $1, moderated_at = NOW(), moderated_by = $2
           WHERE id = $3 AND status = 'pending'
           RETURNING id, status, moderated_at`,
          [status, ctx.user.id, id]
        ));
      }

      try {
        await tx.query(
          `UPDATE community_reports
           SET status = 'reviewed', reviewed_by = $2, reviewed_at = now()
           WHERE post_id = $1 AND status = 'open'`,
          [id, ctx.user.id]
        );
      } catch (repErr) {
        if (repErr?.code !== "42P01") throw repErr;
      }

      try {
        await tx.query(
          `INSERT INTO community_moderation_history (post_id, actor_id, actor_role, action, from_status, to_status, reason)
           VALUES ($1, $2, $3, $4, 'pending', $5, $6)`,
          [id, ctx.user.id, verifiedMod.actorRole, status === "approved" ? "approve" : "reject", status, reason || null]
        );
      } catch (histErr) {
        if (histErr?.code !== "42P01") throw histErr;
      }

      const validVendorRes = locked[0].place_id
        ? await tx.query("SELECT id FROM vendors WHERE id = $1 LIMIT 1", [locked[0].place_id])
        : { rows: [] };

      await recordAuditLog(tx, {
        actorId: ctx.user.id,
        actorRole: verifiedMod.actorRole,
        vendorId: validVendorRes.rows[0]?.id || null,
        targetType: "community_review",
        targetId: id,
        action: status === "approved" ? "community.approve" : "community.reject",
        metadata: {
          from_status: "pending",
          to_status: status,
          ...(reason ? { reason } : {})
        }
      });

      return { status: 200, body: { post: updated[0] } };
    });

    return res.status(outcome.status).json(outcome.body);
  } catch (err) {
    if (respondIfSessionEligibilityError(err, res)) return;
    return res.status(503).json({ error: "Community moderation is temporarily unavailable." });
  }
}
