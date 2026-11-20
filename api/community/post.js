import { db, auth } from "@biteshark/runtime-adapter";
import { resolveIdentity, isWritePaused, applyPrivateNoStoreHeaders } from "../../lib/authz.js";
import { withTransaction } from "../../lib/db-tx.js";

export const access = "user";
export const methods = ["POST"];

const ALLOWED_KINDS = new Set(["review", "tip", "question", "whisper"]);

export default async function(req, res) {
  applyPrivateNoStoreHeaders(res);
  if (isWritePaused("community")) {
    return res.status(503).json({ error: "Community submissions are temporarily paused for maintenance." });
  }

  const user = await resolveIdentity(req, auth);
  if (!user) {
    return res.status(401).json({ error: "Sign in to contribute to the community." });
  }

  const x = req.body && typeof req.body === "object" ? req.body : {};

  // Explicitly reject client attempts to set moderation metadata or spoof another author_id.
  if (
    (x.status !== undefined && x.status !== "pending") ||
    x.moderated_by !== undefined ||
    x.moderated_at !== undefined ||
    (x.author_id !== undefined && String(x.author_id).trim() !== user.id)
  ) {
    return res.status(403).json({ error: "Moderation fields and author identity cannot be set by the submitter." });
  }

  const kind = typeof x.kind === "string" ? x.kind.trim() : "";
  if (!ALLOWED_KINDS.has(kind)) {
    return res.status(400).json({ error: "Choose Review, Tip, Question, or Street Whisper." });
  }

  const placeId = typeof x.place_id === "string" ? x.place_id.trim() : "";
  const title = typeof x.title === "string" ? x.title.trim() : "";
  const body = typeof x.body === "string" ? x.body.trim() : "";
  if (!placeId || placeId.length > 80 || title.length < 5 || title.length > 90 || body.length < 20 || body.length > 700) {
    return res.status(400).json({
      error: "Choose a local spot, a title (5–90 chars), and a post between 20 and 700 characters."
    });
  }

  const nickname =
    (typeof x.nickname === "string" ? x.nickname.replace(/[<>\r\n]/g, "").trim().slice(0, 28) : "") ||
    "Local food fan";

  let rating = null;
  if (kind === "review") {
    const parsed = typeof x.rating === "number" ? x.rating : (typeof x.rating === "string" && /^\d+$/.test(x.rating.trim()) ? Number(x.rating.trim()) : NaN);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5) {
      return res.status(400).json({ error: "Choose a rating from one to five stars." });
    }
    rating = parsed;
  } else if (x.rating !== undefined && x.rating !== null && x.rating !== "") {
    return res.status(400).json({ error: "Ratings are only supported on review posts." });
  }

  try {
    const outcome = await withTransaction(db, async tx => {
      await tx.query("SELECT set_config('app.user_id', $1, true)", [user.id]);

      const { rows: placeRows } = await tx.query(
        `SELECT v.id, COALESCE(op.display_name, v.canonical_name) AS place_name, v.city AS town
         FROM vendors v
         LEFT JOIN owner_profiles op ON op.truck_id = v.id
         WHERE v.id = $1 AND v.is_active = true`,
        [placeId]
      );
      if (!placeRows.length) {
        return { status: 400, body: { error: "Selected local food spot was not found." } };
      }

      const canonicalPlaceName = String(placeRows[0].place_name).slice(0, 120);
      const canonicalTown = String(placeRows[0].town || "Sonoma County").slice(0, 80);

      const { rows: limits } = await tx.query(
        "SELECT COUNT(*)::int AS total FROM community_reviews WHERE author_id = $1 AND created_at > NOW() - INTERVAL '24 hours'",
        [user.id]
      );
      if (Number(limits[0]?.total || 0) >= 5) {
        return { status: 429, body: { error: "You can contribute up to five times in 24 hours." } };
      }

      const { rows } = await tx.query(
        `INSERT INTO community_reviews (
           author_id, nickname, kind, place_id, place_name, town, title, body, rating, status
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
         RETURNING id, status, created_at`,
        [user.id, nickname, kind, placeId, canonicalPlaceName, canonicalTown, title, body, rating]
      );

      return {
        status: 201,
        body: {
          submission: rows[0],
          message: "Submitted for review. It will appear publicly only if approved."
        }
      };
    });

    return res.status(outcome.status).json(outcome.body);
  } catch {
    return res.status(503).json({ error: "Community submission could not be saved right now." });
  }
}
