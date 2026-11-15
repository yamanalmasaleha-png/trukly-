import { db } from 'hatchable';
export const access='admin';
export const methods=['POST'];
export default async function(req,res){
 res.setHeader('Cache-Control','no-store');
 const id=String(req.body?.id||''),status=String(req.body?.status||'');
 if(!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)||!['cooking','almost','ready','collected','cancelled'].includes(status))return res.status(400).json({error:'Choose a valid ticket and status.'});
 const r=await db.query("UPDATE pickup_pagers SET status=$2,updated_at=now() WHERE id=$1 AND expires_at>now() AND status NOT IN ('collected','cancelled') RETURNING id,vendor,ticket,status,updated_at,expires_at",[id,status]);
 if(!r.rows.length)return res.status(404).json({error:'This pager has ended or expired.'});
 return res.json({pager:r.rows[0]});
}