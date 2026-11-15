// Run from the repository root: node tests/listing-verification.cjs
// Node built-ins only; no runtime dependencies and no writes to the app.
const fs=require('node:fs');
const assert=require('node:assert/strict');
const {join}=require('node:path');
(async()=>{
 const src=fs.readFileSync(join('api','trucks.js'),'utf8');
 const transformed=src.replace(/^export const [^\n]*\n/gm,'').replace('export default async function(req,res){','return async function(req,res){');
 const handler=new Function(transformed)();
 let result;
 await handler({query:{}},{setHeader(){},json(payload){result=payload;}});
 assert(result && Array.isArray(result.trucks),'API returns listings');
 assert.equal(result.trucks.length,47,'expected audit baseline of 47 primary records');
 const byId=Object.fromEntries(result.trucks.map(t=>[t.id,t]));
 assert.equal(byId.mitote.location,'100 Sebastopol Rd, Santa Rosa');
 assert.equal(byId.elroys.location,'1569 Sebastopol Rd, Santa Rosa');
 assert.equal(byId.kolobok.cuisine,'Global');
 assert.equal(byId.hefty.cuisine,'Global');
 assert(result.trucks.every(t=>t.verified===false),'no blanket verified true');
 assert(result.trucks.every(t=>t.photo_rights_verified===false),'no unlicensed photos marked verified');
 assert(result.trucks.every(t=>t.id && t.name),'all listings have identity');
 assert(result.trucks.every(t=>!t.photo || !t.photo.includes('images.unsplash.com')),'no stock photos presented as named vendors');
 const app=fs.readFileSync(join('public','app.js'),'utf8');
 const highlight=fs.readFileSync(join('public','listing-highlights.js'),'utf8');
 const html=fs.readFileSync(join('public','index.html'),'utf8');
 new Function(app);new Function(highlight);
 assert(html.includes('/listing-highlights.js'),'listing visual enhancement is actually loaded');
 assert(!app.includes('Mueller Lake Park')&&!app.includes('La Estrella Tacos'),'no unrelated Austin fallback data');
 for(const id of ['mitote','xies','dinos','fruta','kolobok','lucha','coffee-crooks','holy-chile','elroys','iniguez','elenita','momo','dogaday','api-hot','magos']){
   assert(highlight.includes('"'+id+'": {'),'spotlight exists for '+id);
 }
 console.log('PASS: 47 primary listings, addresses, category matching, safe photo defaults, JS syntax and UI script wiring');
})().catch(e=>{console.error(e);process.exitCode=1;});
