/* Truckly Local Guides passport: self-reported, on-device beta. */
const guidePassportStorageKey = 'truckly_guide_passport_v1';
function guideVisitsRead(){
  try {
    const raw=JSON.parse(localStorage.getItem(guidePassportStorageKey)||'[]');
    return Array.isArray(raw)?raw.filter(x=>x&&typeof x.id==='string'&&typeof x.at==='string').slice(0,300):[];
  }catch(e){return [];}
}
function guideVisitsWrite(rows){
  try{localStorage.setItem(guidePassportStorageKey,JSON.stringify(rows));return true;}
  catch(e){return false;}
}
function guidePlaces(){
  const seen=new Set();
  return (typeof trucks!=='undefined'?trucks:[]).filter(t=>{
    if(!t||!t.id||seen.has(t.id))return false;
    seen.add(t.id);
    return !!t.city;
  }).sort((a,b)=>String(a.name).localeCompare(String(b.name)));
}
function guidePlace(id){return guidePlaces().find(t=>t.id===id)}
function guidePassportHtmlEscape(s){
  return typeof guidesEscape==='function'?guidesEscape(s):String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]});
}
function guideWeekStart(){
  const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-((d.getDay()+6)%7));return d;
}
async function renderGuidePassport(){
  const host=document.getElementById('guidePassport');if(!host)return;
  const visits=guideVisitsRead(),photos=await (typeof dishRead==='function'?dishRead().catch(()=>[]):Promise.resolve([]));
  const towns=new Set(visits.map(v=>v.city).filter(Boolean));
  const flavors=new Set(visits.map(v=>v.cuisine).filter(Boolean));
  const xp=visits.length*25+photos.length*10;
  const levels=[
    {min:0,name:'Flavor Scout'},{min:50,name:'Neighborhood Regular'},
    {min:125,name:'Local Insider'},{min:250,name:'Flavor Legend'}
  ];
  let level=0;for(let i=0;i<levels.length;i++)if(xp>=levels[i].min)level=i;
  const next=levels[level+1],from=levels[level].min,to=next?next.min:xp||1;
  const pct=next?Math.max(0,Math.min(100,Math.round((xp-from)/(to-from)*100))):100;
  const weekly=visits.filter(v=>new Date(v.at)>=guideWeekStart()).length;
  const badges=[
    {icon:'🍴',name:'First Bite',need:'Log one local food stop',value:visits.length,target:1},
    {icon:'🧭',name:'Neighborhood Scout',need:'Discover three different places',value:visits.length,target:3},
    {icon:'🌮',name:'Flavor Hopper',need:'Try three food categories',value:flavors.size,target:3},
    {icon:'📍',name:'Town Hopper',need:'Visit places in two towns',value:towns.size,target:2},
    {icon:'📸',name:'Photo Keeper',need:'Save a photo in your dish notebook',value:photos.length,target:1}
  ];
  const earned=badges.filter(b=>b.value>=b.target).length;
  const options=guidePlaces().filter(p=>!visits.some(v=>v.id===p.id)).map(p=>
    '<option value="'+guidePassportHtmlEscape(p.id)+'">'+guidePassportHtmlEscape(p.name)+' · '+guidePassportHtmlEscape(p.city)+'</option>'
  ).join('');
  const badgesMarkup=badges.map(b=>
    '<article class="passport-badge '+(b.value>=b.target?'unlocked':'locked')+'">'+
    '<div class="badge-symbol" aria-hidden="true">'+b.icon+'</div>'+
    '<div><h3>'+guidePassportHtmlEscape(b.name)+'</h3><p>'+guidePassportHtmlEscape(b.need)+'</p>'+
    '<small>'+(b.value>=b.target?'✓ Earned':Math.min(b.value,b.target)+' / '+b.target)+'</small></div></article>'
  ).join('');
  const visitsMarkup=visits.length?visits.slice().reverse().map(v=>
    '<li><div><strong>'+guidePassportHtmlEscape(v.name)+'</strong><small>'+
    guidePassportHtmlEscape(v.city||'Sonoma County')+' · '+guidePassportHtmlEscape(new Date(v.at).toLocaleDateString(undefined,{month:'short',day:'numeric'}))+
    (v.note?' · '+guidePassportHtmlEscape(v.note):'')+'</small></div>'+
    '<button type="button" data-remove-visit="'+guidePassportHtmlEscape(v.id)+'" aria-label="Remove '+guidePassportHtmlEscape(v.name)+' from passport">Undo</button></li>'
  ).join(''):'<li class="passport-empty">Your passport is ready. Log a place you actually visited to earn your first badge.</li>';
  host.innerHTML=
    '<div class="passport-hero"><div><small>YOUR SONOMA FOOD PASSPORT · BETA</small><h2>Explore more. Earn your stripes.</h2>'+
    '<p>Share your love for neighborhood food with your own collection of places, memories and badges.</p>'+
    '<div class="passport-level">Level '+(level+1)+' · '+guidePassportHtmlEscape(levels[level].name)+'</div>'+
    '<div class="passport-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+pct+'" aria-label="Progress to next Local Guides level"><span style="width:'+pct+'%"></span></div>'+
    '<small>'+xp+' points'+(next?' · '+(next.min-xp)+' to '+guidePassportHtmlEscape(next.name):' · Top level reached')+'</small></div>'+
    '<div class="passport-stats"><div><b>'+visits.length+'</b><span>Places logged</span></div><div><b>'+earned+'/'+badges.length+'</b><span>Badges earned</span></div><div><b>'+photos.length+'</b><span>Dish photos</span></div></div></div>'+
    '<section class="passport-challenges"><div><small>THIS WEEK’S CHALLENGE</small><h3>Two-stop taste trail</h3><p>Visit and log two different local food spots this week.</p></div>'+
    '<div class="challenge-count">'+Math.min(weekly,2)+' / 2 '+(weekly>=2?'✓ Complete':'to go')+'</div></section>'+
    '<section class="passport-panel"><div class="passport-title"><h3>Stamp your passport</h3><p>Only log a real visit. Check-ins are self-reported, not location-verified.</p></div>'+
    '<form id="guideVisitForm"><label for="guideSpotSelect">Food spot</label><select id="guideSpotSelect" required '+(!options?'disabled':'')+'><option value="">Choose a place you visited</option>'+options+'</select>'+
    '<label for="guideVisitNote">Your insider tip (optional)</label><input id="guideVisitNote" maxlength="140" placeholder="The dish, the vibe, or your favorite detail…">'+
    '<button class="primary" type="submit" '+(!options?'disabled':'')+'>'+(options?'Log this visit +25 points':'All listed stops logged')+'</button></form>'+
    '<p id="guideActionMessage" role="status" aria-live="polite"></p></section>'+
    '<section class="passport-panel"><div class="passport-title"><h3>Achievement shelf</h3><p>Badges unlock from your activity—no purchases or payments required.</p></div><div class="passport-badges">'+badgesMarkup+'</div></section>'+
    '<section class="passport-panel"><div class="passport-title"><h3>My food trail</h3><p>A personal record of your neighborhood finds.</p></div><ul class="passport-visits">'+visitsMarkup+'</ul>'+
    '<div class="passport-links"><button type="button" onclick="showGuidesTab(\'stories\')">Explore field notes ↗</button>'+
    '<button type="button" onclick="showGuidesTab(\'photos\')">Open photo notebook ↗</button></div></section>'+
    '<p class="passport-privacy">Private beta: visits, tips and points are saved in this browser on this device, not synced to an account or shown on a public leaderboard. Badges are for fun, not verified visits or redeemable rewards. Clearing browser data removes progress.</p>';
  const form=document.getElementById('guideVisitForm');
  if(form)form.addEventListener('submit',guideLogVisit);
  host.querySelectorAll('[data-remove-visit]').forEach(btn=>btn.addEventListener('click',()=>guideUndoVisit(btn.dataset.removeVisit)));
  if(typeof window!=='undefined'&&window.bitesharkFeatures&&typeof window.bitesharkFeatures.syncDom==='function')window.bitesharkFeatures.syncDom();
}
function guideLogVisit(e){
  e.preventDefault();
  const fc=typeof window!=='undefined'&&window.bitesharkFeatures?window.bitesharkFeatures:null;
  if(fc&&!fc.isAvailable('local_guides_passport')){
    const msg=document.getElementById('guideActionMessage');
    if(msg)msg.textContent=fc.getMessage('local_guides_passport');
    fc.syncDom();
    return;
  }
  const spot=document.getElementById('guideSpotSelect'),msg=document.getElementById('guideActionMessage');
  const p=guidePlace(spot.value),rows=guideVisitsRead();
  if(!p){msg.textContent='Choose a listed local food spot.';return}
  if(rows.some(v=>v.id===p.id)){msg.textContent='That spot is already stamped in your passport.';return}
  const note=document.getElementById('guideVisitNote').value.trim().slice(0,140);
  const next=rows.concat([{id:p.id,name:p.name,city:p.city||'',cuisine:p.cuisine||p.kind||'',note:note,at:new Date().toISOString()}]);
  if(!guideVisitsWrite(next)){msg.textContent='Could not save this visit on your device.';return}
  renderGuidePassport();
  if(typeof toast==='function')toast('Visit stamped! +25 points.');
}
function guideUndoVisit(id){
  if(!guideVisitsWrite(guideVisitsRead().filter(v=>v.id!==id))){
    const msg=document.getElementById('guideActionMessage');if(msg)msg.textContent='Could not update your food passport.';return;
  }
  renderGuidePassport();
}