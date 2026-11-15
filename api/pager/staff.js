import { db } from 'hatchable';
export const access='admin';
export const methods=['GET','POST'];
export default async function(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method==='GET'){
  const r=await db.query("SELECT id,vendor,ticket,status,updated_at,expires_at FROM pickup_pagers WHERE expires_at>now() AND status NOT IN ('collected','cancelled') ORDER BY created_at DESC LIMIT 100");
  return res.json({pagers:r.rows});
 }
 const vendor=String(req.body?.vendor||'').trim(),ticket=String(req.body?.ticket||'').trim(),key=String(req.body?.request_key||'');
 if(!vendor||vendor.length>80||!ticket||ticket.length>40||! /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(key))return res.status(400).json({error:'Enter a vendor and pickup number.'});
 const r=await db.query("INSERT INTO pickup_pagers(vendor,ticket,request_key) VALUES($1,$2,$3) ON CONFLICT(request_key) DO UPDATE SET request_key=EXCLUDED.request_key RETURNING id,vendor,ticket,status,updated_at,expires_at",[vendor,ticket,key]);
 return res.status(201).json({pager:r.rows[0]});
}