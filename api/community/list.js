import { db } from "@biteshark/runtime-adapter";

export const access = "public";
export const methods = ["GET"];

export default async function (req, res) {
  try {
    const { rows } = await db.query(
      `SELECT p.id, p.nickname, p.kind, p.place_id, p.place_name, p.town, p.title, p.body, p.rating, p.created_at
       FROM community_public_posts p
       LEFT JOIN vendors v ON v.id = p.place_id
       WHERE p.place_id IS NULL
          OR (
            v.is_active = true
            AND (
              COALESCE(v.hidden_from_discovery, false) = false
              OR (v.restriction_authority = 'mod' AND v.temp_restriction_expires_at IS NOT NULL AND v.temp_restriction_expires_at <= now())
            )
          )
       ORDER BY p.created_at DESC
       LIMIT 60`
    );
    return res.json({
      posts: rows,
      moderation: "All public posts are reviewed before appearing."
    });
  } catch {
    return res.status(503).json({ error: "Community posts are temporarily unavailable." });
  }
}
