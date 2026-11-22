import {vendors,catalogMeta} from "../../lib/vendor-catalog.js";
export const access="public";export const methods=["GET"];
export default async function(req,res){res.json({featured_ids:["maker-radical","coffee-craftedcup","truck-adobos","maker-mteitan","market-sebastopol","drip"],catalog_version:catalogMeta.version,updated_for:"Sonoma County market makers and roaming kitchens"});}