import { db, auth } from "hatchable";
export const access = "public";
export const methods = ["POST"];
const packages={dropin:{name:"Neighborhood Drop-in",price:750,max:50},party:{name:"Party Favorite",price:1500,max:100},festival:{name:"Full Festival",price:2900,max:250}};
export default async function(req,res){
 const b=req.body||{},user=await auth.getUser(req),pkg=packages[b.package_id];
 if(!b.event_type||!b.event_date||!b.location||!Number.isInteger(Number(b.guest_count))||Number(b.guest_count)<10)return res.status(400).json({error:"Please include an event type, date, location, and at least 10 guests."});
 if(!pkg)return res.status(400).json({error:"Choose a booking package."});
 if(Number(b.guest_count)>pkg.max)return res.status(400).json({error:"Guest count exceeds this package. Choose a larger package."});
 const{rows}=await db.query("INSERT INTO bookings (truck_id,truck_name,event_type,event_date,guest_count,location,note,requester,package_id,package_name,package_price) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id,status,package_name,package_price,created_at",[b.truck_id||null,String(b.truck_name||"Best available match").slice(0,120),String(b.event_type).slice(0,80),b.event_date,Number(b.guest_count),String(b.location).slice(0,240),String(b.note||"").slice(0,1000),user?.email||null,b.package_id,pkg.name,pkg.price]);
 res.status(201).json(rows[0]);
}