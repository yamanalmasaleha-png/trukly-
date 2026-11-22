import { db } from "hatchable";
import { vendors } from "../../lib/vendor-catalog.js";
export const access="user";
export const methods=["GET"];
export default async function(req,res){
 const uid=req.user.id;
 const [visits,favorites,bookings]=await Promise.all([
 db.query("SELECT place_id,note,visited_at FROM customer_visits WHERE user_id=$1 ORDER BY visited_at DESC LIMIT 300",[uid]),
 db.query("SELECT truck_id,created_at FROM favorites WHERE user_id=$1 ORDER BY created_at DESC",[uid]),
 db.query("SELECT id,truck_id,truck_name,event_type,event_date,guest_count,location,package_name,package_price,status,created_at FROM bookings WHERE user_id=$1 OR (user_id IS NULL AND lower(requester)=lower($2)) ORDER BY created_at DESC LIMIT 50",[uid,req.user.email])
 ]);
 const byId=new Map(vendors.map(v=>[v.id,v]));
 res.setHeader("Cache-Control","private, no-store");
 res.json({user:{name:req.user.name||null,email:req.user.email},visits:visits.rows.map(v=>({...v,name:byId.get(v.place_id)?.name||"Previous local find",city:byId.get(v.place_id)?.city||"Sonoma County",kind:byId.get(v.place_id)?.kind||"",cuisine:byId.get(v.place_id)?.cuisine||""})),favorites:favorites.rows,bookings:bookings.rows});
}