import { db } from "hatchable";
import { vendors } from "../../lib/vendor-catalog.js";
export const access="user";
export const methods=["POST"];
export default async function(req,res){
 const id=String(req.body?.truck_id||""),saved=req.body?.saved;
 if(!vendors.some(v=>v.id===id)||typeof saved!=="boolean")return res.status(400).json({error:"Choose a listing and a saved state."});
 if(saved)await db.query("INSERT INTO favorites(user_id,truck_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[req.user.id,id]);
 else await db.query("DELETE FROM favorites WHERE user_id=$1 AND truck_id=$2",[req.user.id,id]);
 res.json({truck_id:id,saved});
}