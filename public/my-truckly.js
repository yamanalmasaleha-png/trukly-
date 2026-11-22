/* My Truckly: private account data, with an explicit guest path. */
let trucklyCustomer=null,customerData={visits:[],favorites:[],bookings:[]},customerTab='overview',customerError='',customerBusy=false;
const customerEsc=v=>artSafe(v);
function customerVisits(){return trucklyCustomer?customerData.visits:guideVisitsRead().map(v=>({...v,place_id:v.id,visited_at:v.at}))}
function customerProgress(){
 const visits=customerVisits(),towns=new Set(visits.map(v=>v.city).filter(Boolean)),kinds=new Set(visits.map(v=>v.kind||guidePlace(v.place_id)?.kind));
 const badges=[{name:'First bite',goal:'Log your first food stop',value:visits.length,target:1,art:'taco'},{name:'Local scout',goal:'Visit three different places',value:visits.length,target:3,art:'farm'},{name:'Town hopper',goal:'Find food in two towns',value:towns.size,target:2,art:'sweet'},{name:'Market regular',goal:'Visit a market or market maker',value:kinds.has('Markets')?1:0,target:1,art:'farm'},{name:'Coffee detour',goal:'Log a local coffee stop',value:kinds.has('Coffee')?1:0,target:1,art:'coffee'}];
 const xp=visits.length*25,levels=[{min:0,name:'Flavor Scout'},{min:75,name:'Local Insider'},{min:150,name:'Flavor Legend'}];let level=0;levels.forEach((l,i)=>{if(xp>=l.min)level=i});const next=levels[level+1],pct=next?Math.min(100,Math.round((xp-levels[level].min)/(next.min-levels[level].min)*100)):100;
 return {visits,badges,xp,level:levels[level].name,next,pct};
}
async function customerRequest(path,method='GET',body){
 const r=await fetch(API+path,{method,headers:{'Accept':'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store'});
 if(r.status===401){throw Error('Please sign in again to continue.')}
 const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'Could not save your changes. Please try again.');return d;
}
async function customerRefresh(){const d=await customerRequest('/account/overview');customerData=d;favs.clear();d.favorites.forEach(x=>favs.add(x.truck_id));applyFilters();renderFavorites();return d}
async function customerInit(){
 try{const s=await window.hatchable?.auth?.getSession();trucklyCustomer=s?.user||null;if(trucklyCustomer)await customerRefresh()}
 catch(e){customerError='Your account could not load. Please retry.'}
 const avatar=document.querySelector('.profile-menu .avatar');if(avatar){avatar.textContent=trucklyCustomer?(trucklyCustomer.name||trucklyCustomer.email).slice(0,1).toUpperCase():'YOU';avatar.setAttribute('aria-label','My Truckly')}
 renderMyTruckly();
 if(location.hash==='#mytruckly')openMyTruckly();
 if(location.hash==='#secret')openSecret();
}
async function openMyTruckly(tab='overview'){customerTab=tab;showScreen('mytruckly');renderMyTruckly();await customerReady;renderMyTruckly()}
function myTrucklyTab(tab){customerTab=tab;renderMyTruckly()}
function customerSignIn(){location.href='/login?next='+encodeURIComponent('/#mytruckly')}
async function customerSignOut(){
 try{await window.hatchable.auth.signOut();trucklyCustomer=null;customerData={visits:[],favorites:[],bookings:[]};favs.clear();storedArray('truckly_favs').forEach(x=>favs.add(x));customerError='';document.querySelector('.profile-menu .avatar').textContent='YOU';applyFilters();renderFavorites();renderMyTruckly();toast('Signed out. Your account progress is safely saved.')}catch{toast('Could not sign out. Please try again.')}
}
function renderMyTruckly(){
 const host=document.getElementById('myTrucklyContent');if(!host)return;const esc=customerEsc,p=customerProgress(),saved=trucks.filter(t=>favs.has(t.id)),history=p.visits;
 const hello=trucklyCustomer?(trucklyCustomer.name||trucklyCustomer.email.split('@')[0]):'fellow food scout';
 const summary='<div class="my-metrics"><div><b>'+history.length+'</b><span>Stops logged</span></div><div><b>'+p.badges.filter(b=>b.value>=b.target).length+'</b><span>Badges earned</span></div><div><b>'+saved.length+'</b><span>Saved finds</span></div></div>';
 const hero='<header class="my-hero"><div><span class="secret-kicker">MY TRUCKLY · YOUR FOOD STORY</span><h1>Good <span class="bright-word">taste</span>,<br>'+esc(hello)+'.</h1><p>Keep the places, the little victories,<br>and the flavors worth coming back for.</p>'+(trucklyCustomer?'<div class="account-identity">'+esc(trucklyCustomer.email)+' <button onclick="customerSignOut()">Sign out</button></div>':'<button class="primary" onclick="customerSignIn()">Sign in or join →</button><small class="guest-note">Browsing as a guest · progress stays on this device.</small>')+'</div><div class="my-hero-truck">'+truckCharacter('sweet')+'</div></header>';
 const tabs='<nav class="my-tabs" aria-label="My Truckly sections">'+[['overview','My progress'],['visits','Visits'],['saved','Saved'],['bookings','Bookings']].map(([id,label])=>'<button class="'+(customerTab===id?'active':'')+'" aria-pressed="'+(customerTab===id)+'" onclick="myTrucklyTab(\''+id+'\')">'+label+'</button>').join('')+'</nav>';
 let content='';
 if(customerTab==='overview'){
 content=summary+'<section class="my-panel progress-panel"><div><span class="secret-kicker">YOUR NEXT CHAPTER</span><h2>'+esc(p.level)+'</h2><p>'+p.xp+' flavor points'+(p.next?' · '+(p.next.min-p.xp)+' to '+esc(p.next.name):' · You know your way around')+'</p></div><div class="my-progress" role="progressbar" aria-label="Progress to next level" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+p.pct+'"><span style="width:'+p.pct+'%"></span></div><button class="text-button" onclick="myTrucklyTab(\'visits\')">Stamp a real visit +25 points →</button></section><section class="my-panel"><div class="panel-heading"><div><span class="secret-kicker">LITTLE WINS. BIG APPETITE.</span><h2>Your badge shelf</h2></div></div><div class="my-badges">'+p.badges.map(b=>'<article class="my-badge '+(b.value>=b.target?'earned':'locked')+'"><div>'+truckCharacter(b.art)+'</div><h3>'+b.name+'</h3><p>'+b.goal+'</p><small>'+(b.value>=b.target?'Earned ✓':Math.min(b.value,b.target)+' / '+b.target)+'</small></article>').join('')+'</div></section><section class="my-panel reward-panel"><span class="secret-kicker">A LITTLE SOMETHING FOR THE JOURNEY</span><h2>Your insider unlocks</h2><div class="reward-row"><div class="reward-stamp" aria-hidden="true">✦</div><div><h3>Scout’s secret route</h3><p>'+ (history.length>=3?'Unlocked! Three distinctive local finds, chosen for your next food adventure.':'Log three different stops to unlock a curated food route.')+'</p></div>'+(history.length>=3?'<button class="secondary" onclick="openScoutRoute()">Open route →</button>':'<span class="reward-count">'+Math.min(history.length,3)+'/3</span>')+'</div><div class="reward-row"><div class="reward-stamp pink" aria-hidden="true">★</div><div><h3>Your Flavor Legend card</h3><p>'+(history.length>=6?'Unlocked! Download your own Truckly keepsake.':'Log six stops to unlock a downloadable Truckly keepsake.')+'</p></div>'+(history.length>=6?'<button class="secondary" onclick="downloadScoutCard()">Get my card ↓</button>':'<span class="reward-count">'+Math.min(history.length,6)+'/6</span>')+'</div><p class="reward-note">Truckly digital rewards. Vendor discounts and free-food offers will appear here when a participating vendor provides them.</p></section>';
 }else if(customerTab==='visits'){
 const available=trucks.filter(t=>!history.some(v=>v.place_id===t.id));
 content='<section class="my-panel"><span class="secret-kicker">BEEN THERE. ATE THAT.</span><h2>Stamp your food story</h2><p>Log a place you actually visited. One stamp per place; check-ins are self-reported.</p><form class="my-visit-form" onsubmit="customerLogVisit(event)"><label>Where did you eat?<select id="customerVisitPlace" required><option value="">Choose a local find</option>'+available.map(t=>'<option value="'+esc(t.id)+'">'+esc(t.name)+' · '+esc(t.city)+'</option>').join('')+'</select></label><label>A little note <span>(optional)</span><input id="customerVisitNote" maxlength="140" placeholder="The dish you’re still thinking about…"></label><button class="primary" type="submit" '+(customerBusy?'disabled':'')+'>Log my visit +25 →</button></form></section><section class="my-panel"><h2>Your visit history</h2><div class="my-history">'+(history.length?history.map(v=>'<article><div class="visit-stamp" aria-hidden="true">✓</div><div><button class="visit-name" onclick="openDetail(\''+esc(v.place_id)+'\')">'+esc(v.name)+'</button><small>'+esc(v.city)+' · '+esc(new Date(v.visited_at).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}))+'</small>'+(v.note?'<p>'+esc(v.note)+'</p>':'')+'</div><button class="visit-undo" onclick="customerUndoVisit(\''+esc(v.place_id)+'\')" aria-label="Undo visit to '+esc(v.name)+'">Undo</button></article>').join(''):'<p>Your first stamp is waiting. Start with a place you’ve tried.</p>')+'</div></section>';
 }else if(customerTab==='saved'){
 content='<section class="my-panel"><span class="secret-kicker">THE “WE SHOULD GO THERE” LIST</span><h2>Your saved finds</h2><p>'+(trucklyCustomer?'Saved to your account, ready for your next outing.':'Saved in this browser. Sign in to keep your finds across devices.')+'</p></section><div class="my-saved-grid">'+(saved.length?saved.map(extraCard).join(''):'<section class="my-panel"><p>No saved finds yet. Tap a heart on a vendor you’d like to try.</p><button class="secondary" onclick="showScreen(\'discover\')">Find my next bite →</button></section>')+'</div>';
 }else{
 const rows=trucklyCustomer?customerData.bookings:bookings;
 content='<section class="my-panel"><span class="secret-kicker">BRING THE GOOD FOOD TO YOU</span><h2>Your bookings</h2><p>Requests stay pending until the vendor confirms the details.</p><button class="primary" onclick="'+(trucklyCustomer?'openBooking()':'customerSignIn()')+'">'+(trucklyCustomer?'Plan a food-truck gathering →':'Sign in to request a truck →')+'</button></section><div class="my-bookings">'+customerBookingsHTML(rows)+'</div>';
 }
 const importable=trucklyCustomer&&(guideVisitsRead().some(v=>!history.some(x=>x.place_id===v.id))||storedArray('truckly_favs').some(id=>!favs.has(id)));
 host.innerHTML=hero+(customerError?'<div class="customer-error" role="status">'+esc(customerError)+' <button onclick="customerRetry()">Retry</button></div>':'')+tabs+content+(importable?'<section class="my-panel device-import"><h3>Already explored on this device?</h3><p>Choose to copy this browser’s saved places and passport visits into your account.</p><button class="secondary" onclick="customerImportDevice()" '+(customerBusy?'disabled':'')+'>Import my device progress →</button></section>':'');
}
function customerBookingsHTML(rows){const esc=customerEsc;return rows.length?rows.map(b=>'<article class="my-panel my-booking"><span class="booking-status">'+esc(b.status||'pending')+'</span><h3>'+esc(b.truck_name)+'</h3><p>'+esc(b.event_type)+' · '+esc(String(b.event_date).slice(0,10))+'</p><small>'+esc(b.location)+' · '+Number(b.guest_count)+' guests</small>'+(b.package_name?'<p>'+esc(b.package_name)+'</p>':'')+'</article>').join(''):'<section class="my-panel"><p>No requests yet. Your next gathering could use a little truck magic.</p></section>'}
async function customerRetry(){customerError='';try{if(trucklyCustomer)await customerRefresh();else{const s=await window.hatchable?.auth?.getSession();trucklyCustomer=s?.user||null;if(trucklyCustomer)await customerRefresh()}}catch(e){customerError=e.message}renderMyTruckly()}
async function customerLogVisit(e){
 e.preventDefault();if(customerBusy)return;const id=document.getElementById('customerVisitPlace').value,note=document.getElementById('customerVisitNote').value.trim(),place=trucks.find(t=>t.id===id);if(!place)return;
 customerBusy=true;renderMyTruckly();
 try{if(trucklyCustomer){await customerRequest('/account/visits','POST',{place_id:id,note});await customerRefresh()}else{const rows=guideVisitsRead();if(!rows.some(v=>v.id===id)&&!guideVisitsWrite(rows.concat([{id,name:place.name,city:place.city,cuisine:place.cuisine,note,at:new Date().toISOString()}])))throw Error('Could not save this visit on your device.')}
 toast('Stamped! A good bite, a good memory, +25 points.');customerError='';
 }catch(err){customerError=err.message}finally{customerBusy=false;renderMyTruckly()}
}
async function customerUndoVisit(id){if(customerBusy)return;customerBusy=true;try{if(trucklyCustomer){await customerRequest('/account/visits','DELETE',{place_id:id});await customerRefresh()}else if(!guideVisitsWrite(guideVisitsRead().filter(v=>v.id!==id)))throw Error('Could not update device progress.');customerError='';toast('Visit removed. Your badges and points have been updated.')}catch(e){customerError=e.message}finally{customerBusy=false;renderMyTruckly()}}
async function customerImportDevice(){if(customerBusy||!trucklyCustomer)return;customerBusy=true;renderMyTruckly();try{for(const v of guideVisitsRead().filter(v=>trucks.some(t=>t.id===v.id)))await customerRequest('/account/visits','POST',{place_id:v.id,note:v.note||''});for(const id of storedArray('truckly_favs').filter(id=>trucks.some(t=>t.id===id)))await customerRequest('/account/favorite','POST',{truck_id:id,saved:true});await customerRefresh();customerError='';toast('Your device finds and visits are now in your account.')}catch(e){customerError=e.message}finally{customerBusy=false;renderMyTruckly()}}
const customerGuestToggle=toggleFav,customerPendingFavorites=new Set();
toggleFav=async function(id){
 await customerReady;if(!trucklyCustomer){await customerGuestToggle(id);renderMyTruckly();return}
 if(customerPendingFavorites.has(id))return;customerPendingFavorites.add(id);const adding=!favs.has(id);
 try{const d=await customerRequest('/account/favorite','POST',{truck_id:id,saved:adding});d.saved?favs.add(id):favs.delete(id);customerData.favorites=[...favs].map(truck_id=>({truck_id}));applyFilters();renderFavorites();renderMyTruckly();toast(adding?'Saved to My Truckly.':'Removed from your saved finds.')}catch(e){toast(e.message)}finally{customerPendingFavorites.delete(id)}
};
const customerRenderBookings=renderBookings;
renderBookings=function(){if(trucklyCustomer)document.getElementById('bookingList').innerHTML=customerBookingsHTML(customerData.bookings);else customerRenderBookings()};
const customerSubmitBooking=submitBooking;
submitBooking=async function(e){await customerSubmitBooking(e);if(trucklyCustomer){try{await customerRefresh();renderBookings();renderMyTruckly()}catch{toast('Request sent. Refresh My Truckly to see its latest status.')}}};
function openScoutRoute(){
 if(customerProgress().visits.length<3)return;
 const seen=new Set(customerVisits().map(v=>v.place_id)),picks=['maker-radical','truck-adobos','coffee-craftedcup','maker-mteitan','drip','maker-citas'].map(id=>trucks.find(t=>t.id===id)).filter(t=>t&&!seen.has(t.id)).slice(0,3);
 document.getElementById('detailContent').innerHTML='<button class="modal-close" onclick="closeModal()" aria-label="Close reward route">×</button><div class="secret-route"><span class="secret-kicker">UNLOCKED BY YOUR GOOD TASTE</span><h2>The scout’s secret route</h2><p>Three more stories worth finding. Plan each stop with its current schedule; these are suggestions, not a walkable route.</p>'+picks.map(t=>'<button onclick="openDetail(\''+t.id+'\')"><b>'+customerEsc(t.name)+'</b><small>'+customerEsc(t.menu_highlight)+'</small><span>→</span></button>').join('')+'</div>';document.getElementById('detailModal').classList.add('show');
}
function downloadScoutCard(){
 const p=customerProgress();if(p.visits.length<6)return;
 const svg='<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1100" viewBox="0 0 900 1100"><rect width="900" height="1100" rx="45" fill="#fff4d9"/><rect x="28" y="28" width="844" height="1044" rx="32" fill="none" stroke="#214b3b" stroke-width="5"/><circle cx="450" cy="450" r="255" fill="#f6c453"/><g transform="translate(130 200) scale(2.65)">'+truckCharacter('sweet').replace('<svg ','<svg x="0" y="0" width="240" height="180" ')+'</g><g fill="#214b3b" text-anchor="middle" font-family="Georgia,serif"><text x="450" y="140" font-size="42">TRUCKLY FOOD CLUB</text><text x="450" y="800" font-size="72">Flavor Legend</text><text x="450" y="875" font-size="29">'+p.visits.length+' local stops · '+p.xp+' flavor points</text><text x="450" y="1000" font-size="24">Good food. Word gets around.</text></g></svg>';
 const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'})),a=document.createElement('a');a.href=url;a.download='my-truckly-flavor-legend.svg';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
const customerReady=window.trucklyReady.then(customerInit);

const customerOpenBooking=openBooking;
openBooking=async function(id){await customerReady;if(!trucklyCustomer){await openMyTruckly('bookings');toast('Sign in to send a booking request and track its status.');return}customerOpenBooking(id)};