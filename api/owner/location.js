import { db } from "hatchable";
export const access = "admin";
export const methods = ["GET","POST"];
export default async function(req,res){
 if(req.method==="POST"){const location=String(req.body?.location||"").trim();if(!location)return res.status(400).json({error:"Location is required"});const {rows}=await db.query("INSERT INTO truck_settings (truck_id,location) VALUES ('estrella',$1) ON CONFLICT (truck_id) DO UPDATE SET location=EXCLUDED.location, updated_at=now() RETURNING *",[location]);return res.json(rows[0]);}
 const {rows}=await db.query("SELECT * FROM truck_settings WHERE truck_id='estrella'");res.json(rows[0]||{truck_id:"estrella",location:"Mueller Lake Park · by the pavilion",is_open:true});
}