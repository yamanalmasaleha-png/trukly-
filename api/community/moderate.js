import { db } from "hatchable";
export const access="admin";
export const methods=["GET","POST"];
export default async function(req,res){
  if(req.method==="GET"){
    const {rows}=await db.query(
      "SELECT id,nickname,kind,place_name,town,title,body,rating,created_at FROM community_reviews WHERE status='pending' ORDER BY created_at ASC LIMIT 40"
    );
    return res.json({pending:rows});
  }
  const id=String(req.body?.id||"");
  const status=String(req.body?.status||"");
  if(!/^[0-9a-f-]{36}$/i.test(id)||!["approved","rejected"].includes(status))
    return res.status(400).json({error:"Choose an existing post and a valid moderation decision."});
  const {rows}=await db.query(
    "UPDATE community_reviews SET status=$1,moderated_at=NOW() WHERE id=$2 AND status='pending' RETURNING id,status",
    [status,id]
  );
  return rows.length?res.json({post:rows[0]}):res.status(404).json({error:"This pending post was not found."});
}