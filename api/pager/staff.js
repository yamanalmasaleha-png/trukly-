import { db, auth } from "@biteshark/runtime-adapter";
import {
  UUID_RE,
  loadAccessContext,
  authorizeVendorScope,
  authorizeVendorTarget,
  reverifyVendorMembershipInTx,
  recordAuditLog,
  redactPagerTargetId,
  isWritePaused,
  applyPrivateNoStoreHeaders,
  evaluateEffectiveVendorRestrictions
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

    if (req.method === "GET") {
      const scope = await authorizeVendorScope(ctx, req.query?.vendor_id || req.query?.truck_id, db);
      if (!scope.ok) return res.status(scope.status).json({ error: scope.error });

      const { rows } = scope.global
        ? await db.query(
            `SELECT id, vendor_id, vendor, ticket, status, updated_at, expires_at
             FROM pickup_pagers
             WHERE expires_at > now() AND status NOT IN ('collected', 'cancelled')
             ORDER BY created_at DESC LIMIT 100`
          )
        : await db.query(
            `SELECT id, vendor_id, vendor, ticket, status, updated_at, expires_at
             FROM pickup_pagers
             WHERE vendor_id = ANY($1::text[])
               AND expires_at > now()
               AND status NOT IN ('collected', 'cancelled')
             ORDER BY created_at DESC LIMIT 100`,
            [scope.vendorIds]
          );

      return res.json({ pagers: rows });
    }

    if (isWritePaused("pagers")) {
      return res.status(503).json({ error: "Pickup pager creation is temporarily paused for maintenance." });
    }

    const b = req.body && typeof req.body === "object" ? req.body : {};
    const requestedVendorId = typeof b.vendor_id === "string"
      ? b.vendor_id
      : (typeof b.truck_id === "string" ? b.truck_id : "");

    const authz = await authorizeVendorTarget(ctx, requestedVendorId, "staff", db);
    if (!authz.ok) return res.status(authz.status).json({ error: authz.error });

    const ticket = typeof b.ticket === "string" ? b.ticket.trim() : "";
    const key = typeof b.request_key === "string" ? b.request_key.trim() : "";

    if (!ticket || ticket.length > 40 || !UUID_RE.test(key)) {
      return res.status(400).json({ error: "Enter a valid pickup number (1–40 chars) and UUID request_key." });
    }

    const outcome = await withTransaction(db, async tx => {
      const verifiedAuthz = await reverifyVendorMembershipInTx(tx, ctx, authz.vendorId, "staff");
      if (!verifiedAuthz.ok) {
        return { status: verifiedAuthz.status, body: { error: verifiedAuthz.error } };
      }

      let vendorRows;
      try {
        ({ rows: vendorRows } = await tx.query(
          `SELECT
             v.id,
             v.is_active,
             v.pager_restricted,
             v.vendor_access_suspended,
             v.restriction_authority,
             v.temp_restriction_expires_at,
             COALESCE(op.display_name, v.canonical_name) AS display_name
           FROM vendors v
           LEFT JOIN owner_profiles op ON op.truck_id = v.id
           WHERE v.id = $1
           FOR SHARE OF v`,
          [authz.vendorId]
        ));
      } catch (colErr) {
        if (colErr?.code !== "42703") throw colErr;
        ({ rows: vendorRows } = await tx.query(
          `SELECT v.id, v.is_active, COALESCE(op.display_name, v.canonical_name) AS display_name
           FROM vendors v
           LEFT JOIN owner_profiles op ON op.truck_id = v.id
           WHERE v.id = $1
           FOR SHARE OF v`,
          [authz.vendorId]
        ));
      }
      if (!vendorRows.length || !vendorRows[0].is_active) {
        return { status: 400, body: { error: "Selected vendor is inactive or invalid." } };
      }
      const effRestr = evaluateEffectiveVendorRestrictions(vendorRows[0]);
      if (effRestr.pager_restricted || effRestr.vendor_access_suspended) {
        return {
          status: 403,
          body: {
            error: "New pickup pager creation is currently restricted for this vendor. Existing active tickets can still be completed.",
            code: "PAGER_RESTRICTED"
          }
        };
      }
      const canonicalVendorName = String(vendorRows[0].display_name).slice(0, 80);

      // Atomic insert with ON CONFLICT (request_key) DO NOTHING serializes concurrent retries
      // on the unique index without failing with 23505 -> 503.
      const { rows: created } = await tx.query(
        `INSERT INTO pickup_pagers (vendor_id, vendor, ticket, request_key, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $5)
         ON CONFLICT (request_key) DO NOTHING
         RETURNING id, vendor_id, vendor, ticket, status, updated_at, expires_at`,
        [authz.vendorId, canonicalVendorName, ticket, key, ctx.user.id]
      );

      if (created.length) {
        await recordAuditLog(tx, {
          actorId: ctx.user.id,
          actorRole: verifiedAuthz.actorRole,
          vendorId: authz.vendorId,
          targetType: "pickup_pager",
          targetId: redactPagerTargetId(created[0].id),
          action: "pager.create",
          metadata: { ticket }
        });

        return { status: 201, body: { pager: created[0] } };
      }

      // Conflict occurred: inspect committed row in READ COMMITTED snapshot.
      // Never expose another vendor's pager UUID, vendor name, or ticket on a mismatch.
      const { rows: existing } = await tx.query(
        `SELECT id, vendor_id, vendor, ticket, status, updated_at, expires_at
         FROM pickup_pagers
         WHERE request_key = $1`,
        [key]
      );
      if (!existing.length) {
        throw new Error("Pager request_key conflict did not resolve.");
      }

      const prev = existing[0];
      if (prev.vendor_id !== authz.vendorId || prev.ticket !== ticket) {
        return {
          status: 409,
          body: { error: "request_key was already used with different pager parameters." }
        };
      }

      return { status: 200, body: { pager: prev, idempotent_replay: true } };
    });

    return res.status(outcome.status).json(outcome.body);
  } catch (err) {
    if (respondIfSessionEligibilityError(err, res)) return;
    return res.status(503).json({ error: "Pickup pager staff queue is temporarily unavailable." });
  }
}
