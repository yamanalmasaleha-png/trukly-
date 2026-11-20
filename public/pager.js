let pagerToken=null,pagerDemo=false,pagerStatus=null,pagerSound=false,pagerAudio=null,pagerBusy=false,kitchenRequestKey=null,kitchenRequestSig='';
let pagerPushServer={enabled:false,vapid_public_key:null};
let pagerPushBusy=false,pagerPushError='',pagerCurrentRendered=null;
const PAGER_SUBS_STORAGE_KEY='truckly_pager_subs_v1';

const pagerStates={
  cooking:{icon:'🍳',title:'Good things are cooking.',copy:'The kitchen is working on your order.',step:1},
  almost:{icon:'🥙',title:'The finishing touches.',copy:'Almost ready. Your next stop is delicious.',step:2},
  ready:{icon:'🔔',title:'Come get the good stuff!',copy:'Your food is ready. Head to the pickup counter.',step:3},
  collected:{icon:'🙌',title:'Enjoy every bite.',copy:'Picked up. Thanks for eating local!',step:4},
  cancelled:{icon:'🧾',title:'Check with the counter.',copy:'This ticket has been cancelled. Ask the vendor for help.',step:0}
};

function pagerEscape(v){
  return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function readStoredPagerSubs(){
  if(typeof localStorage==='undefined')return {};
  try{
    const raw=localStorage.getItem(PAGER_SUBS_STORAGE_KEY);
    if(!raw)return {};
    const parsed=JSON.parse(raw);
    if(!parsed||typeof parsed!=='object')return {};
    const now=Date.now();
    const cleaned={};
    for(const [tok,entry] of Object.entries(parsed)){
      if(entry&&typeof entry==='object'&&entry.subscription_id&&(!entry.expires_at||new Date(entry.expires_at).getTime()>now)){
        cleaned[tok]=entry;
      }
    }
    return cleaned;
  }catch{
    return {};
  }
}

function writeStoredPagerSubs(mapObj){
  if(typeof localStorage==='undefined')return;
  try{
    const entries=Object.entries(mapObj||{}).slice(-8);
    localStorage.setItem(PAGER_SUBS_STORAGE_KEY,JSON.stringify(Object.fromEntries(entries)));
  }catch{}
}

function getLocalPagerSub(token){
  if(!token)return null;
  const all=readStoredPagerSubs();
  return all[token]||null;
}

function saveLocalPagerSub(token,record){
  if(!token||!record)return;
  const all=readStoredPagerSubs();
  all[token]=record;
  writeStoredPagerSubs(all);
}

function removeLocalPagerSub(token){
  if(!token)return;
  const all=readStoredPagerSubs();
  if(Object.prototype.hasOwnProperty.call(all,token)){
    delete all[token];
    writeStoredPagerSubs(all);
  }
}

function resolveTokenBySubscriptionRef(subId){
  if(!subId)return '';
  const all=readStoredPagerSubs();
  for(const [tok,entry] of Object.entries(all)){
    if(entry&&entry.subscription_id===subId)return tok;
  }
  return '';
}

function scrubPagerHashFromUrl(){
  if(typeof history!=='undefined'&&typeof history.replaceState==='function'&&typeof location!=='undefined'){
    try{
      history.replaceState(null,'',(location.pathname||'/')+(location.search||''));
    }catch{}
  }
}

function urlBase64ToUint8Array(base64String){
  const padding='='.repeat((4-(base64String.length%4))%4);
  const base64=(base64String+padding).replace(/-/g,'+').replace(/_/g,'/');
  const rawData=typeof atob==='function'?atob(base64):Buffer.from(base64,'base64').toString('binary');
  const outputArray=new Uint8Array(rawData.length);
  for(let i=0;i<rawData.length;++i){
    outputArray[i]=rawData.charCodeAt(i);
  }
  return outputArray;
}

function isIosNeedsHomeScreen(){
  if(typeof navigator==='undefined'||typeof window==='undefined')return false;
  const ua=String(navigator.userAgent||'');
  const isIos=/iPad|iPhone|iPod/.test(ua)||(navigator.platform==='MacIntel'&&Number(navigator.maxTouchPoints||0)>1);
  if(!isIos)return false;
  const isStandalone=Boolean(
    (window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches)||
    navigator.standalone===true
  );
  return !isStandalone;
}

function hasBrowserPushSupport(){
  return (
    typeof window!=='undefined'&&
    typeof navigator!=='undefined'&&
    typeof Notification!=='undefined'&&
    'serviceWorker' in navigator&&
    'PushManager' in window
  );
}

function buildPagerPushSectionHtml(p){
  if(pagerDemo||!pagerToken)return '';
  if(p.status==='collected'||p.status==='cancelled'){
    return '<div class="pager-push-box" id="pagerPushPanel" data-push-state="ended"><strong>Order complete</strong><small>Background pickup alerts for this ticket have ended.</small></div>';
  }
  if(isIosNeedsHomeScreen()){
    return '<div class="pager-push-box" id="pagerPushPanel" data-push-state="ios-install-required"><strong>📱 Want a lock-screen alert on iPhone?</strong><small>Tap Share → <b>Add to Home Screen</b>, then open BiteShark from your Home Screen icon. Otherwise keep this page open for live updates.</small></div>';
  }
  if(!hasBrowserPushSupport()){
    return '<div class="pager-push-box" id="pagerPushPanel" data-push-state="unsupported"><strong>Live page updates active</strong><small>Background notifications aren’t supported in this browser. Keep this page open (updates every ~8s) or use the ready sound above.</small></div>';
  }
  if(Notification.permission==='denied'){
    return '<div class="pager-push-box" id="pagerPushPanel" data-push-state="denied"><strong>Notifications blocked in browser settings</strong><small>Allow notifications for this site if you want background alerts, or keep this page open with ready sound enabled.</small></div>';
  }
  const sub=getLocalPagerSub(pagerToken);
  const fc=typeof window!=='undefined'&&window.bitesharkFeatures?window.bitesharkFeatures:null;
  const pushFeatureBlocked=Boolean(fc&&(!fc.isAvailable('pager_push_delivery')||!fc.isAvailable('pager_push_subscriptions')));
  const errHtml=pagerPushError?'<small class="pager-push-error">'+pagerEscape(pagerPushError)+'</small>':'';
  if(sub&&sub.status==='active'){
    const pausedNote=(!pagerPushServer.enabled||pushFeatureBlocked)
      ?'<small>Background push delivery is currently paused on this server, so keep this page open (~8s live check). You can still turn off saved alerts on this device below.</small>'
      :'<small>You’ll receive a notification when Ticket #'+pagerEscape(p.ticket)+' is marked Ready. Using a shared device? Turn alerts off when done.</small>';
    return '<div class="pager-push-box" id="pagerPushPanel" data-push-state="subscribed"><strong>'+(pagerPushServer.enabled&&!pushFeatureBlocked?'🔔 Background ready alert is ON':'🔕 Saved background alert (delivery paused)')+'</strong>'+pausedNote+errHtml+'<button type="button" id="pagerUnsubscribeBtn" class="pager-push-btn secondary-push" '+(pagerPushBusy?'disabled ':'')+'onclick="unsubscribePagerPush()">'+(pagerPushBusy?'Updating…':'Turn off background alerts')+'</button></div>';
  }
  if(!pagerPushServer.enabled||!pagerPushServer.vapid_public_key||pushFeatureBlocked){
    const serverMsg=fc&&!fc.isAvailable('pager_push_subscriptions')?fc.getMessage('pager_push_subscriptions','Background push delivery isn’t enabled on this server right now. Keep this page open — we check your ticket every ~8 seconds.'):'Background push delivery isn’t enabled on this server right now. Keep this page open — we check your ticket every ~8 seconds.';
    return '<div class="pager-push-box" id="pagerPushPanel" data-push-state="server-disabled"><strong>Live page updates active</strong><small>'+pagerEscape(serverMsg)+'</small></div>';
  }

  return '<div class="pager-push-box" id="pagerPushPanel" data-push-state="'+(pagerPushError?'error':'prompt')+'"><strong>Want an alert if you switch apps?</strong><small>Get a one-time notification when Ticket #'+pagerEscape(p.ticket)+' is ready at the counter.</small>'+errHtml+'<button type="button" id="pagerSubscribeBtn" class="pager-push-btn" '+(pagerPushBusy?'disabled ':'')+'onclick="subscribePagerPush()">'+(pagerPushBusy?'Enabling alert…':'🔔 Notify me when ready')+'</button></div>';
}

function openPager(){
  showScreen('pager');
  if(pagerToken&&!pagerDemo)refreshPager();
  else if(pagerDemo)pagerScheduleDemo();
}

function pagerCodeFrom(value){
  let v=String(value||'').trim();
  try{
    if(v.includes('://'))v=new URLSearchParams(new URL(v).hash.slice(1)).get('pager')||'';
  }catch{
    return '';
  }
  return /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v)?v:'';
}

async function joinPager(e){
  e?.preventDefault();
  const token=pagerCodeFrom(document.getElementById('pagerCode').value);
  if(!token){
    document.getElementById('pagerMessage').textContent='Paste the private link or full pager code from the counter.';
    return;
  }
  pagerClearDemoTimer();
  pagerDemoAuto=false;
  pagerToken=token;
  pagerDemo=false;
  pagerStatus=null;
  pagerPushError='';
  document.getElementById('pagerRealEntry').open=true;
  await refreshPager();
}

let pagerDemoTimer=null,pagerDemoAuto=false;
const pagerDemoStages=['cooking','almost','ready','collected'];

function pagerClearDemoTimer(){
  if(pagerDemoTimer){clearTimeout(pagerDemoTimer);pagerDemoTimer=null;}
}

function pagerScheduleDemo(){
  pagerClearDemoTimer();
  if(!pagerDemo||!pagerDemoAuto||pagerStatus==='collected'||document.hidden||!document.getElementById('pagerScreen').classList.contains('active'))return;
  pagerDemoTimer=setTimeout(function(){
    pagerDemoTimer=null;
    if(pagerDemo&&pagerDemoAuto&&!document.hidden&&document.getElementById('pagerScreen').classList.contains('active'))pagerAdvanceDemo();
  },4700);
}

function renderPager(p){
  const state=pagerStates[p.status];
  if(!state)throw new Error('Unknown status. Please ask the counter.');
  const changed=pagerStatus!==p.status;
  pagerStatus=p.status;
  pagerCurrentRendered=p;
  if(!pagerDemo&&pagerToken&&(p.status==='collected'||p.status==='cancelled')){
    removeLocalPagerSub(pagerToken);
  }
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
  const pushSection=buildPagerPushSectionHtml(p);
  panel.innerHTML='<span class="pager-stamp">'+(pagerDemo?'🎮 PLAY MODE · NOT A REAL ORDER':'🔔 YOUR REAL PICKUP')+'</span>'+
    meal+spark+'<div class="pager-food" aria-hidden="true">'+state.icon+'</div>'+
    '<small>'+pagerEscape(p.vendor)+' · Ticket #'+pagerEscape(p.ticket)+'</small>'+
    '<h2>'+state.title+'</h2><p>'+state.copy+'</p>'+tracker+
    '<button type="button" class="pager-sound" onclick="enablePagerSound()">'+(pagerSound?'♫ Sound on · tap to mute':'♫ Try the ready sound')+'</button>'+
    pushSection+
    '<p class="pager-live-note">'+(pagerDemo?'A sample only — the buttons do not contact a real kitchen.':'Last checked '+new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})+' · Live check every ~8s while open')+'</p>'+kitchen;
  if(changed&&p.status==='ready'&&pagerSound)ringPager();
}

async function subscribePagerPush(){
  if(pagerDemo||!pagerToken||pagerPushBusy)return;
  pagerPushError='';
  if(!hasBrowserPushSupport()||!pagerPushServer.enabled||!pagerPushServer.vapid_public_key){
    if(pagerCurrentRendered)renderPager(pagerCurrentRendered);
    return;
  }
  pagerPushBusy=true;
  if(pagerCurrentRendered)renderPager(pagerCurrentRendered);

  try{
    const permission=await Notification.requestPermission();
    if(permission!=='granted'){
      pagerPushBusy=false;
      if(pagerCurrentRendered)renderPager(pagerCurrentRendered);
      return;
    }

    const reg=await navigator.serviceWorker.register('/sw.js',{scope:'/'});
    const readyReg=navigator.serviceWorker.ready?await navigator.serviceWorker.ready:reg;
    let pushSub=await readyReg.pushManager.getSubscription();
    if(!pushSub){
      pushSub=await readyReg.pushManager.subscribe({
        userVisibleOnly:true,
        applicationServerKey:urlBase64ToUint8Array(pagerPushServer.vapid_public_key)
      });
    }
    const subJson=typeof pushSub.toJSON==='function'?pushSub.toJSON():pushSub;
    const priorSaved=getLocalPagerSub(pagerToken);
    const reqPayload={
      code:pagerToken,
      channel:'web_push',
      subscription:subJson,
      platform_hint:isIosNeedsHomeScreen()?'ios-tab':'web'
    };
    if(priorSaved&&typeof priorSaved.subscription_id==='string'&&priorSaved.subscription_id){
      reqPayload.replaces_subscription_id=priorSaved.subscription_id;
    }
    const resp=await fetch('/api/pager/subscriptions',{
      method:'POST',
      credentials:'same-origin',
      cache:'no-store',
      headers:{
        'Content-Type':'application/json',
        'X-BiteShark-Client':'web-pager-v1'
      },
      body:JSON.stringify(reqPayload)
    });
    const out=await resp.json().catch(()=>({}));
    if(!resp.ok||!out.subscription){
      throw new Error(out.error||'Could not activate background ready alerts.');
    }
    saveLocalPagerSub(pagerToken,{
      subscription_id:out.subscription.id,
      unsubscribe_token:out.unsubscribe_token,
      status:'active',
      expires_at:out.subscription.expires_at
    });
    pagerPushError='';
  }catch(err){
    pagerPushError=err?.message||'Could not enable background alerts. Keep this page open for live updates.';
  }finally{
    pagerPushBusy=false;
    if(pagerCurrentRendered)renderPager(pagerCurrentRendered);
  }
}

async function unsubscribePagerPush(){
  if(pagerDemo||!pagerToken||pagerPushBusy)return;
  const saved=getLocalPagerSub(pagerToken);
  pagerPushBusy=true;
  pagerPushError='';
  if(pagerCurrentRendered)renderPager(pagerCurrentRendered);

  try{
    if(saved&&saved.subscription_id){
      const resp=await fetch('/api/pager/subscriptions',{
        method:'DELETE',
        credentials:'same-origin',
        cache:'no-store',
        headers:{
          'Content-Type':'application/json',
          'X-BiteShark-Client':'web-pager-v1'
        },
        body:JSON.stringify({
          subscription_id:saved.subscription_id,
          unsubscribe_token:saved.unsubscribe_token||'',
          code:pagerToken
        })
      });
      if(!resp.ok&&resp.status!==404){
        const out=await resp.json().catch(()=>({}));
        throw new Error(out.error||'Could not turn off background alerts.');
      }
    }
    removeLocalPagerSub(pagerToken);
    if(hasBrowserPushSupport()){
      const allRemaining=Object.keys(readStoredPagerSubs());
      if(allRemaining.length===0&&navigator.serviceWorker.getRegistration){
        const reg=await navigator.serviceWorker.getRegistration('/').catch(()=>null);
        const browserSub=reg?await reg.pushManager.getSubscription().catch(()=>null):null;
        if(browserSub&&typeof browserSub.unsubscribe==='function'){
          await browserSub.unsubscribe().catch(()=>false);
        }
      }
    }
  }catch(err){
    pagerPushError=err?.message||'Could not turn off alerts right now.';
  }finally{
    pagerPushBusy=false;
    if(pagerCurrentRendered)renderPager(pagerCurrentRendered);
  }
}

async function refreshPager(){
  if(!pagerToken||pagerDemo||pagerBusy)return;
  pagerBusy=true;
  const requestedToken=pagerToken;
  try{
    const r=await fetch('/api/pager/status?code='+encodeURIComponent(pagerToken),{cache:'no-store'});
    const out=await r.json();
    if(!r.ok)throw new Error(out.error||'Unable to check this pager.');
    if(pagerDemo||pagerToken!==requestedToken)return;
    if(out.notifications&&typeof out.notifications==='object'){
      pagerPushServer={
        enabled:out.notifications.enabled===true,
        vapid_public_key:out.notifications.vapid_public_key||null
      };
    }
    renderPager(out.pager);
    document.getElementById('pagerMessage').textContent='';
  }catch(e){
    document.getElementById('pagerMessage').textContent=e.message||'Connection lost. Your displayed status may be out of date. Try again.';
    document.querySelector('#pagerDisplay .pager-live-note')?.replaceChildren(document.createTextNode('Not connected — status may be out of date.'));
  }finally{
    pagerBusy=false;
  }
}

async function enablePagerSound(){
  if(pagerSound){
    pagerSound=false;
    document.querySelector('.pager-sound').textContent='♫ Enable ready sound';
    return;
  }
  try{
    const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC)throw new Error();
    pagerAudio=pagerAudio||new AC();
    await pagerAudio.resume();
    pagerSound=true;
    document.querySelector('.pager-sound').textContent='♫ Sound on · tap to mute';
    ringPager();
  }catch{
    document.getElementById('pagerMessage').textContent='Sound is unavailable here. Watch for the big green ready card.';
  }
}

function ringPager(){
  if(!pagerAudio)return;
  [0,.25,.5].forEach((delay,i)=>{
    const osc=pagerAudio.createOscillator(),gain=pagerAudio.createGain();
    osc.connect(gain);
    gain.connect(pagerAudio.destination);
    osc.frequency.value=[660,880,1046][i];
    const t=pagerAudio.currentTime+delay;
    gain.gain.setValueAtTime(0,t);
    gain.gain.linearRampToValueAtTime(.12,t+.02);
    gain.gain.exponentialRampToValueAtTime(.001,t+.2);
    osc.start(t);
    osc.stop(t+.22);
  });
  if(navigator.vibrate)navigator.vibrate([160,100,160]);
}

function startPagerDemo(){
  const fc=typeof window!=='undefined'&&window.bitesharkFeatures?window.bitesharkFeatures:null;
  if(fc&&fc.isHidden('pickup_pager_demo')){
    if(typeof toast==='function')toast(fc.getMessage('pickup_pager_demo'));
    document.getElementById('pagerRealEntry').open=true;
    return;
  }
  if(!document.getElementById('pagerScreen').classList.contains('active'))showScreen('pager');
  pagerClearDemoTimer();
  pagerDemo=true;
  pagerDemoAuto=true;
  pagerToken=null;
  pagerStatus=null;
  pagerPushError='';
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
  renderPager({vendor:'BiteShark Test Kitchen',ticket:'24',status:pagerStatus||'cooking'});
  if(pagerDemoAuto)pagerScheduleDemo();
}

function pagerLeaveDemo(){
  pagerClearDemoTimer();
  pagerDemo=false;
  pagerDemoAuto=false;
  pagerStatus=null;
  pagerToken=null;
  pagerCurrentRendered=null;
  document.getElementById('pagerMessage').textContent='';
  const panel=document.getElementById('pagerDisplay');
  panel.className='food-pager pager-idle';
  panel.innerHTML='<span class="pager-stamp">YOUR MINI PICKUP ADVENTURE</span><div class="pager-food" aria-hidden="true">🍟</div><h2>Nice test run!</h2><p>Your example is complete. Play again, or enter a real private pickup link.</p><button class="pager-next-step" type="button" onclick="startPagerDemo()">🔁 Try the sample again</button>';
}

function demoPagerStep(status){
  if(!pagerDemo||!pagerDemoStages.includes(status))return;
  pagerClearDemoTimer();
  renderPager({vendor:'BiteShark Test Kitchen',ticket:'24',status:status});
  if(status!=='collected')pagerScheduleDemo();
}

function currentKitchenVendorId(){
  const sel=document.getElementById('ownerTruckSelect');
  if(sel&&sel.value&&sel.value!=='owner-truck')return sel.value.trim();
  if(typeof ownerTruckId==='string'&&ownerTruckId&&ownerTruckId!=='owner-truck')return ownerTruckId.trim();
  return '';
}

async function kitchenFetch(path,options={}){
  const r=await fetch('/api/pager/'+path,{
    ...options,
    credentials:'same-origin',
    redirect:'manual',
    cache:'no-store',
    headers:{'Content-Type':'application/json',...(options.headers||{})}
  });
  if(r.type==='opaqueredirect'||r.status===401){
    let out={};
    try{out=await r.json();}catch{}
    const err=new Error('Sign in with an authorized vendor or admin account to manage pickup tickets.');
    try{
      const url=new URL(out.login_url||'/login.html?next=/',location.origin);
      if(url.origin===location.origin)err.login=url.href;
    }catch{}
    throw err;
  }
  const out=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(out.error||(r.status===403?'You do not have permission for this vendor kitchen queue.':'The update did not save. Please retry.'));
  return out;
}

function kitchenError(e){
  const el=document.getElementById('kitchenMessage');
  el.textContent=(e.message||'Could not connect. Please try again.')+' ';
  if(e.login){
    const a=document.createElement('a');
    a.href=e.login;
    a.className='pager-login';
    a.textContent='Sign in →';
    el.appendChild(a);
  }
}

function pagerLink(id){return location.origin+'/#pager='+id;}

function renderKitchen(rows){
  document.getElementById('kitchenQueue').innerHTML=rows.length?rows.map(p=>'<article class="kitchen-ticket"><h3>'+pagerEscape(p.vendor)+' · #'+pagerEscape(p.ticket)+'</h3><p>'+pagerStates[p.status].title+'</p><label>Private customer link<input readonly aria-label="Private customer pager link" value="'+pagerLink(p.id)+'" onclick="this.select()"></label><button class="detail-link" onclick="copyPagerLink(\''+p.id+'\')">Copy pickup link</button><div class="kitchen-actions">'+['cooking','almost','ready','collected','cancelled'].map(s=>'<button data-status="'+s+'" '+(s===p.status?'disabled':'')+' onclick="updatePagerStatus(\''+p.id+'\',\''+s+'\',this)">'+({cooking:'🍳 Cooking',almost:'🥙 Almost ready',ready:'🔔 Ready!',collected:'🙌 Picked up',cancelled:'Cancel ticket'})[s]+'</button>').join('')+'</div></article>').join(''):'<p>No active pickup tickets for this vendor. Create one above when a customer orders.</p>';
}

async function loadKitchen(){
  document.getElementById('kitchenPanel').hidden=false;
  if(typeof window!=='undefined'&&window.bitesharkFeatures&&typeof window.bitesharkFeatures.syncDom==='function'){
    window.bitesharkFeatures.syncDom();
  }
  document.getElementById('kitchenMessage').textContent='Loading kitchen…';
  const vid=currentKitchenVendorId();
  try{
    const out=await kitchenFetch(vid?'staff?vendor_id='+encodeURIComponent(vid):'staff');
    renderKitchen(out.pagers||[]);
    document.getElementById('kitchenMessage').textContent='';
  }catch(e){
    kitchenError(e);
  }
}

async function createPager(e){
  e.preventDefault();
  const button=document.getElementById('pagerCreateButton');
  const vid=currentKitchenVendorId();
  const ticket=(document.getElementById('pagerTicket').value||'').trim();
  if(!vid){
    kitchenError(new Error('Select an authorized vendor before creating a pickup pager.'));
    return;
  }
  button.disabled=true;
  const sig=vid+'::'+ticket;
  if(!kitchenRequestKey||kitchenRequestSig!==sig){
    kitchenRequestKey=crypto.randomUUID();
    kitchenRequestSig=sig;
  }
  try{
    await kitchenFetch('staff',{method:'POST',body:JSON.stringify({vendor_id:vid,ticket,request_key:kitchenRequestKey})});
    kitchenRequestKey=null;
    kitchenRequestSig='';
    document.getElementById('pagerTicket').value='';
    await loadKitchen();
    document.getElementById('kitchenMessage').textContent='Pager created. Share its private link with the customer.';
  }catch(err){
    kitchenError(err);
  }finally{
    const fc=typeof window!=='undefined'&&window.bitesharkFeatures?window.bitesharkFeatures:null;
    button.disabled=Boolean(fc&&!fc.isAvailable('pickup_pager_creation'));
  }
}

async function updatePagerStatus(id,status,button){
  button.disabled=true;
  try{
    await kitchenFetch('update',{method:'POST',body:JSON.stringify({id,status})});
    await loadKitchen();
    document.getElementById('kitchenMessage').textContent='Ticket updated.';
  }catch(e){
    button.disabled=false;
    kitchenError(e);
  }
}

async function copyPagerLink(id){
  try{
    await navigator.clipboard.writeText(pagerLink(id));
    document.getElementById('kitchenMessage').textContent='Pickup link copied.';
  }catch{
    document.getElementById('kitchenMessage').textContent='Select and copy the private link shown on the ticket.';
  }
}

setInterval(()=>{
  if(document.getElementById('pagerScreen').classList.contains('active')&&!document.hidden&&!pagerDemo)refreshPager();
},8000);

document.addEventListener('visibilitychange',()=>{
  if(document.hidden){
    pagerClearDemoTimer();
    return;
  }
  if(document.getElementById('pagerScreen').classList.contains('active')){
    if(pagerDemo)pagerScheduleDemo();
    else refreshPager();
  }
});

window.addEventListener('online',()=>{
  if(pagerToken&&!pagerDemo)refreshPager();
});

if(typeof navigator!=='undefined'&&navigator.serviceWorker&&typeof navigator.serviceWorker.addEventListener==='function'){
  navigator.serviceWorker.addEventListener('message',event=>{
    const msg=event?.data;
    if(!msg||(msg.type!=='BITESHARK_OPEN_PAGER_REF'&&msg.type!=='TRUCKLY_OPEN_PAGER_REF'))return;
    const resolved=resolveTokenBySubscriptionRef(msg.subscription_id);
    if(resolved){
      pagerClearDemoTimer();
      pagerDemo=false;
      pagerDemoAuto=false;
      pagerToken=resolved;
      openPager();
    }else if(pagerToken&&!pagerDemo){
      openPager();
    }
  });
}

function loadPagerHash(){
  const rawHash=(typeof location!=='undefined'&&location.hash)?location.hash.slice(1):'';
  if(!rawHash)return;
  const params=new URLSearchParams(rawHash);
  const code=params.get('pager');
  if(code){
    scrubPagerHashFromUrl();
    document.getElementById('pagerCode').value=code;
    openPager();
    joinPager();
    return;
  }
  const refId=params.get('pager-ref');
  if(refId){
    scrubPagerHashFromUrl();
    const resolved=resolveTokenBySubscriptionRef(refId);
    if(resolved){
      document.getElementById('pagerCode').value=resolved;
      openPager();
      joinPager();
    }else{
      openPager();
      document.getElementById('pagerRealEntry').open=true;
      document.getElementById('pagerMessage').textContent='Your order is ready! Paste your pickup link if you opened this alert in a new browser.';
    }
  }
}

window.addEventListener('hashchange',loadPagerHash);
loadPagerHash();
