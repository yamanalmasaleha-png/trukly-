import { db } from "hatchable";
export const access = "user";
export const methods = ["GET"];
export default async function(req,res) {
  if(!req.user?.id)return res.status(401).json({error:"Sign in to see your submissions."});
  const {rows}=await db.query(
    "SELECT id,kind,place_name,town,title,status,created_at FROM community_reviews WHERE author_id=$1 ORDER BY created_at DESC LIMIT 30",
    [req.user.id]
  );
  return res.json({submissions:rows});
}