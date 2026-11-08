import { db } from "hatchable";
export const access = "admin";
export const methods = ["GET","POST"];
export default async function(req,res){
 if(req.method==="POST"){const {id,status}=req.body||{};if(!id||!["accepted","declined"].includes(status))return res.status(400).json({error:"Invalid request"});const {rows}=await db.query("UPDATE bookings SET status=$1 WHERE id=$2 RETURNING id,status",[status,id]);return rows[0]?res.json(rows[0]):res.status(404).json({error:"Not found"});}
 const {rows}=await db.query("SELECT id, event_type, event_date, guest_count, location, requester, truck_name, package_name, package_price, status, created_at FROM bookings WHERE status='pending' ORDER BY event_date ASC LIMIT 25");res.json({requests:rows});
}