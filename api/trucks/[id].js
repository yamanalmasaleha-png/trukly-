import {vendors,catalogMeta} from "../../lib/vendor-catalog.js";
export const access="public";export const methods=["GET"];
export default async function(req,res){const item=vendors.find(x=>x.id===req.params.id);return item?res.json({...item,catalog_version:catalogMeta.version}):res.status(404).json({error:"Listing not found or awaiting source review",catalog_route:"/api/trucks"});}