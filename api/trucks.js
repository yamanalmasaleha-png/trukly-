import {vendors,catalogMeta} from "../lib/vendor-catalog.js";
export const access="public";
export const methods=["GET"];
export default async function(req,res){res.json({...catalogMeta,trucks:vendors});}