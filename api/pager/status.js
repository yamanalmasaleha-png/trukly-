import { db } from 'hatchable';
export const access='public';
export const methods=['GET'];
export default async function(req,res){
 res.setHeader('Cache-Control','no-store');
 const id=String(req.query?.code||'');
 if(!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))return res.status(400).json({error:'Paste the private pager link or code from your vendor.'});
 const r=await db.query('SELECT vendor,ticket,status,updated_at,expires_at FROM pickup_pagers WHERE id=$1 AND expires_at>now()',[id]);
 if(!r.rows.length)return res.status(404).json({error:'Pager not found or expired. Ask the counter for your link.'});
 return res.json({pager:r.rows[0]});
}