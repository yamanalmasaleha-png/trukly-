import { db } from "hatchable";
export const access = "user";
export const methods = ["POST"];
export default async function(req,res) {
  const u = req.user;
  if (!u?.id) return res.status(401).json({error:"Sign in to contribute to the community."});
  const x=req.body||{};
  const kind=String(x.kind||"").trim();
  const placeId=String(x.place_id||"").trim().slice(0,120);
  const placeName=String(x.place_name||"").trim().slice(0,120);
  const town=String(x.town||"").trim().slice(0,80);
  const title=String(x.title||"").trim().slice(0,90);
  const body=String(x.body||"").trim().slice(0,700);
  const nickname=String(x.nickname||"").replace(/[<>\r\n]/g,"").trim().slice(0,28)||"Local food fan";
  const rating=kind==="review"?Number(x.rating):null;
  if(!["review","tip","question","whisper"].includes(kind))return res.status(400).json({error:"Choose Review, Tip, Question, or Street Whisper."});
  if(!placeId||!placeName||!town||title.length<5||body.length<20)
    return res.status(400).json({error:"Choose a local spot and add a title and at least 20 characters."});
  if(kind==="review"&&(!Number.isInteger(rating)||rating<1||rating>5))
    return res.status(400).json({error:"Choose a rating from one to five stars."});
  const {rows:limits}=await db.query(
    "SELECT COUNT(*)::int AS total FROM community_reviews WHERE author_id=$1 AND created_at>NOW()-INTERVAL '24 hours'",[u.id]
  );
  if(Number(limits[0]?.total||0)>=5)return res.status(429).json({error:"You can contribute up to five times in 24 hours."});
  const {rows}=await db.query(
    "INSERT INTO community_reviews(author_id,nickname,kind,place_id,place_name,town,title,body,rating) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,status,created_at",
    [u.id,nickname,kind,placeId,placeName,town,title,body,kind==="review"?rating:null]
  );
  return res.status(201).json({submission:rows[0],message:"Submitted for review. It will appear publicly only if approved."});
}