let pagerToken=null,pagerDemo=false,pagerStatus=null,pagerSound=false,pagerAudio=null,pagerBusy=false,kitchenRequestKey=null,kitchenRequestSig='';
const pagerStates={cooking:{icon:'🍳',title:'Good things are cooking.',copy:'The kitchen is working on your order.',step:1},almost:{icon:'🥙',title:'The finishing touches.',copy:'Almost ready. Your next stop is delicious.',step:2},ready:{icon:'🔔',title:'Come get the good stuff!',copy:'Your food is ready. Head to the pickup counter.',step:3},collected:{icon:'🙌',title:'Enjoy every bite.',copy:'Picked up. Thanks for eating local!',step:4},cancelled:{icon:'🧾',title:'Check with the counter.',copy:'This ticket has been cancelled. Ask the vendor for help.',step:0}};
function pagerEscape(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function openPager(){showScreen('pager');if(pagerToken&&!pagerDemo)refreshPager();else if(pagerDemo)pagerScheduleDemo()}
function pagerCodeFrom(value){let v=value.trim();try{if(v.includes('://'))v=new URLSearchParams(new URL(v).hash.slice(1)).get('pager')||''}catch{return ''}return /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v)?v:''}
async function joinPager(e){e?.preventDefault();const token=pagerCodeFrom(document.getElementById('pagerCode').value);if(!token){document.getElementById('pagerMessage').textContent='Paste the private link or full pager code from the counter.';return}pagerClearDemoTimer();pagerDemoAuto=false;pagerToken=token;pagerDemo=false;pagerStatus=null;document.getElementById('pagerRealEntry').open=true;await refreshPager()}
let pagerDemoTimer=null,pagerDemoAuto=false;
const pagerDemoStages=['cooking','almost','ready','collected'];
function pagerClearDemoTimer(){if(pagerDemoTimer){clearTimeout(pagerDemoTimer);pagerDemoTimer=null}}
function pagerScheduleDemo(){
 pagerClearDemoTimer();
 if(!pagerDemo||!pagerDemoAuto||pagerStatus==='collected'||document.hidden||!document.getElementById('pagerScreen').classList.contains('active'))return;
 pagerDemoTimer=setTimeout(function(){
  pagerDemoTimer=null;
  if(pagerDemo&&pagerDemoAuto&&!document.hidden&&document.getElementById('pagerScreen').classList.contains('active'))pagerAdvanceDemo();
 },4700);
}
function renderPager(p){
 const state=pagerStates[p.status];if(!state)throw new Error('Unknown status. Please ask the counter.');
 const changed=pagerStatus!==p.status;pagerStatus=p.status;
 const panel=document.getElementById('pagerDisplay');
 panel.className='food-pager pager-stage-'+p.status+(p.status==='ready'?' ready':'')+(pagerDemo?' pager-demo-active':'');
 const steps=['Cooking','Almost there','Ready!','Picked up'];
 const icons=['🍳','🥙','🔔','🙌'];
 const tracker='<ol class="pager-roadmap" aria-label="Pickup progress">'+steps.map(function(label,i){
  const cls=i<state.step?'complete':i===state.step?'current':'waiting';
  return '<li class="'+cls+'"><span class="pager-roadmap-dot" aria-hidden="true">'+icons[i]+'</span><span>'+label+'</span></li>';
 }).join('')+'</ol>';
 const meal=pagerDemo?'<div class="pager-demo-ticket"><span>🍔 SAMPLE ORDER · NO CHARGE</span><b>2 smash burgers + crispy fries</b></div>':'';
 const next=pagerDemoStages[pagerDemoStages.indexOf(p.status)+1];
 const kitchen=pagerDemo?'<div class="pager-demo-workbench"><div class="pager-workbench-label"><span>👩‍🍳</span><div><strong>Now you are the kitchen!</strong><small>Change the fake order status like a food-truck owner.</small></div></div>'+
  (next?'<button type="button" class="pager-next-step" onclick="pagerAdvanceDemo()">Move to '+pagerEscape(steps[pagerDemoStages.indexOf(next)])+' <span aria-hidden="true">→</span></button>':'<button type="button" class="pager-next-step" onclick="startPagerDemo()">🔁 Replay this food adventure</button>')+
  '<div class="pager-demo-utility">'+(next?'<button type="button" onclick="pagerToggleAutoplay()">'+(pagerDemoAuto?'⏸ Pause auto-demo':'▶ Resume auto-demo')+'</button>':'')+
  '<button type="button" onclick="pagerLeaveDemo()">End demo</button></div></div>':'';
 const spark=pagerDemo&&p.status==='ready'?'<div class="pager-celebrate" aria-hidden="true">✦ 🎉 ✦</div>':'';
 panel.innerHTML='<span class="pager-stamp">'+(pagerDemo?'🎮 PLAY MODE · NOT A REAL ORDER':'🔔 YOUR REAL PICKUP')+'</span>'+
  meal+spark+'<div class="pager-food" aria-hidden="true">'+state.icon+'</div>'+
  '<small>'+pagerEscape(p.vendor)+' · Ticket #'+pagerEscape(p.ticket)+'</small>'+
  '<h2>'+state.title+'</h2><p>'+state.copy+'</p>'+tracker+
  '<button type="button" class="pager-sound" onclick="enablePagerSound()">'+(pagerSound?'♫ Sound on · tap to mute':'♫ Try the ready sound')+'</button>'+
  '<p class="pager-live-note">'+(pagerDemo?'A sample only — the buttons do not contact a real kitchen.':'Last checked '+new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})+' · Keep this page open')+'</p>'+kitchen;
 if(changed&&p.status==='ready'&&pagerSound)ringPager();
}
async function refreshPager(){
 if(!pagerToken||pagerDemo||pagerBusy)return;pagerBusy=true;const requestedToken=pagerToken;
 try{const r=await fetch('/api/pager/status?code='+encodeURIComponent(pagerToken),{cache:'no-store'});const out=await r.json();if(!r.ok)throw new Error(out.error||'Unable to check this pager.');if(pagerDemo||pagerToken!==requestedToken)return;renderPager(out.pager);document.getElementById('pagerMessage').textContent='';}
 catch(e){document.getElementById('pagerMessage').textContent=e.message||'Connection lost. Your displayed status may be out of date. Try again.';document.querySelector('#pagerDisplay .pager-live-note')?.replaceChildren(document.createTextNode('Not connected — status may be out of date.'))}
 finally{pagerBusy=false}
}
async function enablePagerSound(){if(pagerSound){pagerSound=false;document.querySelector('.pager-sound').textContent='♫ Enable ready sound';return}try{const AC=window.AudioContext||window.webkitAudioContext;if(!AC)throw new Error();pagerAudio=pagerAudio||new AC();await pagerAudio.resume();pagerSound=true;document.querySelector('.pager-sound').textContent='♫ Sound on · tap to mute';ringPager()}catch{document.getElementById('pagerMessage').textContent='Sound is unavailable here. Watch for the big green ready card.'}}
function ringPager(){if(!pagerAudio)return;[0,.25,.5].forEach((delay,i)=>{const osc=pagerAudio.createOscillator(),gain=pagerAudio.createGain();osc.connect(gain);gain.connect(pagerAudio.destination);osc.frequency.value=[660,880,1046][i];const t=pagerAudio.currentTime+delay;gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(.12,t+.02);gain.gain.exponentialRampToValueAtTime(.001,t+.2);osc.start(t);osc.stop(t+.22)});if(navigator.vibrate)navigator.vibrate([160,100,160])}
function startPagerDemo(){
 if(!document.getElementById('pagerScreen').classList.contains('active'))showScreen('pager');
 pagerClearDemoTimer();pagerDemo=true;pagerDemoAuto=true;pagerToken=null;pagerStatus=null;
 document.getElementById('pagerMessage').textContent='🎮 Demo running: this is not a real order and no one is being notified.';
 demoPagerStep('cooking');
}
function pagerAdvanceDemo(){
 if(!pagerDemo)return;
 const idx=pagerDemoStages.indexOf(pagerStatus),next=pagerDemoStages[idx+1];
 if(next)demoPagerStep(next);else startPagerDemo();
}
function pagerToggleAutoplay(){
 if(!pagerDemo)return;
 pagerDemoAuto=!pagerDemoAuto;
 pagerClearDemoTimer();
 renderPager({vendor:'Truckly Test Kitchen',ticket:'24',status:pagerStatus||'cooking'});
 if(pagerDemoAuto)pagerScheduleDemo();
}
function pagerLeaveDemo(){
 pagerClearDemoTimer();pagerDemo=false;pagerDemoAuto=false;pagerStatus=null;pagerToken=null;
 document.getElementById('pagerMessage').textContent='';
 const panel=document.getElementById('pagerDisplay');
 panel.className='food-pager pager-idle';
 panel.innerHTML='<span class="pager-stamp">YOUR MINI PICKUP ADVENTURE</span><div class="pager-food" aria-hidden="true">🍟</div><h2>Nice test run!</h2><p>Your example is complete. Play again, or enter a real private pickup link.</p><button class="pager-next-step" type="button" onclick="startPagerDemo()">🔁 Try the sample again</button>';
}
function demoPagerStep(status){
 if(!pagerDemo||!pagerDemoStages.includes(status))return;
 pagerClearDemoTimer();
 renderPager({vendor:'Truckly Test Kitchen',ticket:'24',status:status});
 if(status!=='collected')pagerScheduleDemo();
}
function currentKitchenVendorId(){const sel=document.getElementById('ownerTruckSelect');if(sel&&sel.value&&sel.value!=='owner-truck')return sel.value.trim();if(typeof ownerTruckId==='string'&&ownerTruckId&&ownerTruckId!=='owner-truck')return ownerTruckId.trim();return ''}
async function kitchenFetch(path,options={}){
 const r=await fetch('/api/pager/'+path,{...options,credentials:'same-origin',redirect:'manual',cache:'no-store',headers:{'Content-Type':'application/json',...(options.headers||{})}});
 if(r.type==='opaqueredirect'||r.status===401){let out={};try{out=await r.json()}catch{}const err=new Error('Sign in with an authorized vendor or admin account to manage pickup tickets.');try{const url=new URL(out.login_url||'/login.html?next=/',location.origin);if(url.origin===location.origin||url.hostname==='hatchable.com')err.login=url.href}catch{}throw err}
 const out=await r.json().catch(()=>({}));if(!r.ok)throw new Error(out.error||(r.status===403?'You do not have permission for this vendor kitchen queue.':'The update did not save. Please retry.'));return out;
}
function kitchenError(e){const el=document.getElementById('kitchenMessage');el.textContent=(e.message||'Could not connect. Please try again.')+' ';if(e.login){const a=document.createElement('a');a.href=e.login;a.className='pager-login';a.textContent='Sign in →';el.appendChild(a)}}
function pagerLink(id){return location.origin+'/#pager='+id}
function renderKitchen(rows){document.getElementById('kitchenQueue').innerHTML=rows.length?rows.map(p=>'<article class="kitchen-ticket"><h3>'+pagerEscape(p.vendor)+' · #'+pagerEscape(p.ticket)+'</h3><p>'+pagerStates[p.status].title+'</p><label>Private customer link<input readonly aria-label="Private customer pager link" value="'+pagerLink(p.id)+'" onclick="this.select()"></label><button class="detail-link" onclick="copyPagerLink(\''+p.id+'\')">Copy pickup link</button><div class="kitchen-actions">'+['cooking','almost','ready','collected','cancelled'].map(s=>'<button data-status="'+s+'" '+(s===p.status?'disabled':'')+' onclick="updatePagerStatus(\''+p.id+'\',\''+s+'\',this)">'+({cooking:'🍳 Cooking',almost:'🥙 Almost ready',ready:'🔔 Ready!',collected:'🙌 Picked up',cancelled:'Cancel ticket'})[s]+'</button>').join('')+'</div></article>').join(''):'<p>No active pickup tickets for this vendor. Create one above when a customer orders.</p>'}
async function loadKitchen(){document.getElementById('kitchenPanel').hidden=false;document.getElementById('kitchenMessage').textContent='Loading kitchen…';const vid=currentKitchenVendorId();try{const out=await kitchenFetch(vid?'staff?vendor_id='+encodeURIComponent(vid):'staff');renderKitchen(out.pagers||[]);document.getElementById('kitchenMessage').textContent=''}catch(e){kitchenError(e)}}
async function createPager(e){e.preventDefault();const button=document.getElementById('pagerCreateButton');const vid=currentKitchenVendorId();const ticket=(document.getElementById('pagerTicket').value||'').trim();if(!vid){kitchenError(new Error('Select an authorized vendor before creating a pickup pager.'));return}button.disabled=true;const sig=vid+'::'+ticket;if(!kitchenRequestKey||kitchenRequestSig!==sig){kitchenRequestKey=crypto.randomUUID();kitchenRequestSig=sig}try{await kitchenFetch('staff',{method:'POST',body:JSON.stringify({vendor_id:vid,ticket,request_key:kitchenRequestKey})});kitchenRequestKey=null;kitchenRequestSig='';document.getElementById('pagerTicket').value='';await loadKitchen();document.getElementById('kitchenMessage').textContent='Pager created. Share its private link with the customer.'}catch(err){kitchenError(err)}finally{button.disabled=false}}
async function updatePagerStatus(id,status,button){button.disabled=true;try{await kitchenFetch('update',{method:'POST',body:JSON.stringify({id,status})});await loadKitchen();document.getElementById('kitchenMessage').textContent='Ticket updated.'}catch(e){button.disabled=false;kitchenError(e)}}
async function copyPagerLink(id){try{await navigator.clipboard.writeText(pagerLink(id));document.getElementById('kitchenMessage').textContent='Pickup link copied.'}catch{document.getElementById('kitchenMessage').textContent='Select and copy the private link shown on the ticket.'}}
setInterval(()=>{if(document.getElementById('pagerScreen').classList.contains('active')&&!document.hidden&&!pagerDemo)refreshPager()},8000);
document.addEventListener('visibilitychange',()=>{if(document.hidden){pagerClearDemoTimer();return}if(document.getElementById('pagerScreen').classList.contains('active')){if(pagerDemo)pagerScheduleDemo();else refreshPager()}});
function loadPagerHash(){const code=new URLSearchParams(location.hash.slice(1)).get('pager');if(code){if(typeof history!=='undefined'&&typeof history.replaceState==='function'){try{history.replaceState(null,'',location.pathname+location.search)}catch{}}document.getElementById('pagerCode').value=code;openPager();joinPager()}}
window.addEventListener('hashchange',loadPagerHash);loadPagerHash();