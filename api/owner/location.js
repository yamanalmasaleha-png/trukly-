import { db, auth } from "hatchable";
import {
  loadAccessContext,
  authorizeVendorTarget,
  reverifyVendorMembershipInTx,
  recordAuditLog,
  isWritePaused,
  applyPrivateNoStoreHeaders
} from "../../lib/authz.js";
import { isValidTimeValue } from "../../lib/dates.js";
import { validateCoordinates, findForbiddenSelfElevationField } from "../../lib/discovery.js";
import { withTransaction } from "../../lib/db-tx.js";

export const access = "user";
export const methods = ["GET", "POST"];

const DEFAULT_LOCATION_TTL_MINUTES = 480; // 8 hours
const MIN_LOCATION_TTL_MINUTES = 5;
const MAX_LOCATION_TTL_MINUTES = 1440; // 24 hours

function resolveLocationExpiry(body, now = new Date()) {
  if (body.expires_at !== undefined && body.expires_at !== null && body.expires_at !== "") {
    if (typeof body.expires_at !== "string") {
      return { ok: false, error: "expires_at must be an ISO-8601 timestamp string." };
    }
    const parsed = new Date(body.expires_at);
    if (Number.isNaN(parsed.getTime())) {
      return { ok: false, error: "expires_at must be a valid ISO-8601 timestamp." };
    }
    const deltaMs = parsed.getTime() - now.getTime();
    if (deltaMs <= 60 * 1000) {
      return { ok: false, error: "expires_at must be in the future (at least 1 minute from now)." };
    }
    if (deltaMs > MAX_LOCATION_TTL_MINUTES * 60 * 1000) {
      return { ok: false, error: "expires_at cannot exceed 24 hours from now." };
    }
    return { ok: true, expiresAtIso: parsed.toISOString() };
  }

  if (body.ttl_minutes !== undefined && body.ttl_minutes !== null && body.ttl_minutes !== "") {
    const ttl = Number(body.ttl_minutes);
    if (!Number.isInteger(ttl) || ttl < MIN_LOCATION_TTL_MINUTES || ttl > MAX_LOCATION_TTL_MINUTES) {
      return {
        ok: false,
        error: `ttl_minutes must be an integer between ${MIN_LOCATION_TTL_MINUTES} and ${MAX_LOCATION_TTL_MINUTES}.`
      };
    }
    return { ok: true, expiresAtIso: new Date(now.getTime() + ttl * 60 * 1000).toISOString() };
  }

  return {
    ok: true,
    expiresAtIso: new Date(now.getTime() + DEFAULT_LOCATION_TTL_MINUTES * 60 * 1000).toISOString()
  };
}

export default async function(req, res) {
  applyPrivateNoStoreHeaders(res);
  try {
    const ctx = await loadAccessContext(req, auth, db);

    if (req.method === "POST") {
      if (isWritePaused("owner")) {
        return res.status(503).json({ error: "Owner location updates are temporarily paused for maintenance." });
      }

      const b = req.body && typeof req.body === "object" ? req.body : {};
      const authz = await authorizeVendorTarget(ctx, b.truck_id || req.query?.truck_id, "staff", db);
      if (!authz.ok) return res.status(authz.status).json({ error: authz.error });

      const forbiddenField = findForbiddenSelfElevationField(b);
      if (forbiddenField) {
        return res.status(403).json({
          error: "Verification status and photo rights are controlled by platform review and cannot be modified by vendors.",
          field: forbiddenField
        });
      }

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

      const coords = validateCoordinates(b.lat, b.lng);
      if (!coords.ok) {
        return res.status(400).json({ error: coords.error });
      }

      const now = new Date();
      const expiry = resolveLocationExpiry(b, now);
      if (!expiry.ok) {
        return res.status(400).json({ error: expiry.error });
      }

      const location = b.location.trim();
      const hasOpenFlag = typeof b.is_open === "boolean";
      const locationAccuracy = coords.hasCoords ? "owner_reported_coords" : "owner_text_only";
      const observedAtIso = now.toISOString();

      const outcome = await withTransaction(db, async tx => {
        const verifiedAuthz = await reverifyVendorMembershipInTx(tx, ctx, authz.vendorId, "staff");
        if (!verifiedAuthz.ok) {
          return { status: verifiedAuthz.status, body: { error: verifiedAuthz.error } };
        }

        const { rows } = await tx.query(
          `INSERT INTO truck_settings (
             truck_id, location, lat, lng, location_source, location_accuracy,
             is_open, opens_at, closes_at, observed_at, expires_at, updated_at
           )
           VALUES ($1, $2, $3, $4, 'owner_reported', $5, $6, $7, $8, $9, $10, now())
           ON CONFLICT (truck_id) DO UPDATE
             SET location = EXCLUDED.location,
                 lat = EXCLUDED.lat,
                 lng = EXCLUDED.lng,
                 location_source = 'owner_reported',
                 location_accuracy = EXCLUDED.location_accuracy,
                 is_open = COALESCE($11, truck_settings.is_open),
                 opens_at = CASE WHEN $12::boolean THEN NULL ELSE COALESCE(EXCLUDED.opens_at, truck_settings.opens_at) END,
                 closes_at = CASE WHEN $13::boolean THEN NULL ELSE COALESCE(EXCLUDED.closes_at, truck_settings.closes_at) END,
                 observed_at = EXCLUDED.observed_at,
                 expires_at = EXCLUDED.expires_at,
                 updated_at = now()
           RETURNING *`,
          [
            authz.vendorId,
            location,
            coords.lat,
            coords.lng,
            locationAccuracy,
            hasOpenFlag ? b.is_open : true,
            rawOpens,
            rawCloses,
            observedAtIso,
            expiry.expiresAtIso,
            hasOpenFlag ? b.is_open : null,
            b.opens_at === "" || b.opens_at === null,
            b.closes_at === "" || b.closes_at === null
          ]
        );

        await recordAuditLog(tx, {
          actorId: ctx.user.id,
          actorRole: verifiedAuthz.actorRole,
          vendorId: authz.vendorId,
          targetType: "truck_settings",
          targetId: authz.vendorId,
          action: "location.update",
          metadata: {
            is_open: rows[0].is_open,
            location_accuracy: locationAccuracy,
            expires_at: expiry.expiresAtIso
          }
        });
        return { status: 200, body: rows[0] };
      });

      return res.status(outcome.status).json(outcome.body);
    }

    const authz = await authorizeVendorTarget(ctx, req.query?.truck_id, "staff", db);
    if (!authz.ok) return res.status(authz.status).json({ error: authz.error });

    const { rows } = await db.query("SELECT * FROM truck_settings WHERE truck_id = $1", [authz.vendorId]);
    return res.json(
      rows[0] || {
        truck_id: authz.vendorId,
        location: "Sonoma County · update live location",
        lat: null,
        lng: null,
        location_source: "owner_reported",
        location_accuracy: "owner_text_only",
        is_open: false,
        opens_at: null,
        closes_at: null,
        observed_at: null,
        expires_at: null
      }
    );
  } catch {
    return res.status(503).json({ error: "Owner location service is temporarily unavailable." });
  }
}
