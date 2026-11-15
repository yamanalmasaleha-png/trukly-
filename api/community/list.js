import { db } from "hatchable";
export const access = "public";
export const methods = ["GET"];
export default async function(req,res) {
  const { rows } = await db.query(
    "SELECT id, nickname, kind, place_id, place_name, town, title, body, rating, created_at FROM community_reviews WHERE status='approved' ORDER BY created_at DESC LIMIT 60"
  );
  return res.json({posts:rows,moderation:"All public posts are reviewed before appearing."});
}