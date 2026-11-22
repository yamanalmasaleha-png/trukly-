import { db } from "hatchable";
import { vendors } from "../../lib/vendor-catalog.js";
export const access="user";
export const methods=["POST","DELETE"];
export default async function(req,res){
 const b=req.body||{},id=String(b.place_id||"");
 if(!vendors.some(v=>v.id===id))return res.status(400).json({error:"Choose a current local listing."});
 if(req.method==="DELETE"){await db.query("DELETE FROM customer_visits WHERE user_id=$1 AND place_id=$2",[req.user.id,id]);return res.json({ok:true,place_id:id,visited:false});}
 const note=String(b.note||"").trim().slice(0,140);
 const result=await db.query("INSERT INTO customer_visits(user_id,place_id,note) VALUES($1,$2,$3) ON CONFLICT(user_id,place_id) DO NOTHING RETURNING place_id,note,visited_at",[req.user.id,id,note]);
 res.json({ok:true,place_id:id,visited:true,added:result.rowCount>0});
}