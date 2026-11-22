import {vendors,catalogMeta} from "../../lib/vendor-catalog.js";
export const access="public";export const methods=["GET"];
export default async function(req,res){res.json({cities:[...new Set(vendors.map(x=>x.city).filter(Boolean))].sort().map(name=>({name,count:vendors.filter(x=>x.city===name).length}))});}