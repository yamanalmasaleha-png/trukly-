// Run from the repository root: node tests/listing-verification.cjs
// Node built-ins only; no runtime dependencies and no writes to the app.
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const {join,resolve}=require('node:path');
const {register}=require('node:module');
const {pathToFileURL}=require('node:url');
const {loadSeedVendorsFromMigration014}=require('../scripts/seed-sql-reader.cjs');

let currentMockDb={async query(){return {rows:[]};},async transaction(fn){return fn(currentMockDb);}};
let currentMockAuth={async getUser(){return null;}};
globalThis.__BITESHARK_RUNTIME__={
  db:{
    query:(...args)=>currentMockDb.query(...args),
    transaction:(fn)=>currentMockDb.transaction?currentMockDb.transaction(fn):fn(currentMockDb)
  },
  auth:{
    getUser:(...args)=>currentMockAuth.getUser(...args)
  }
};
register('data:text/javascript,'+encodeURIComponent(`
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "@biteshark/runtime-adapter") {
    return {
      shortCircuit: true,
      url: "data:text/javascript,export const db = globalThis.__BITESHARK_RUNTIME__.db; export const auth = globalThis.__BITESHARK_RUNTIME__.auth;"
    };
  }
  return nextResolve(specifier, context);
}
`));

function makeClassList(initial=[]){
  const set=new Set(initial);
  return {
    add:(...c)=>c.forEach(x=>set.add(x)),
    remove:(...c)=>c.forEach(x=>set.delete(x)),
    toggle:(c,force)=>{if(force===undefined){set.has(c)?set.delete(c):set.add(c);return set.has(c);}force?set.add(c):set.delete(c);return !!force;},
    contains:c=>set.has(c)
  };
}

function makeEl(id,extra={}){
  return {
    id,
    value:'',
    textContent:'',
    innerHTML:'',
    hidden:false,
    checked:false,
    disabled:false,
    open:false,
    dataset:{},
    style:{},
    options:[],
    classList:makeClassList(extra.classes||[]),
    setAttribute(k,v){this[k]=v;},
    getAttribute(k){return this[k];},
    appendChild(ch){this.options.push(ch);},
    contains(){return false;},
    remove(){this.removed=true;},
    ...extra
  };
}

(async()=>{
  async function loadHandler(relPath,mockDb=null){
    const mod=await import(pathToFileURL(resolve(relPath)).href);
    return async function(req,res){
      currentMockDb=mockDb||{async query(){return {rows:[]};},async transaction(fn){return fn(currentMockDb);}};
      if(mockDb&&!mockDb.transaction)mockDb.transaction=async(fn)=>fn(mockDb);
      currentMockAuth={async getUser(){return req.user||null;}};
      return mod.default(req,res);
    };
  }
  async function invoke(fn,req={}){
    let code=200,payload=null;
    const headers={};
    const res={
      setHeader(k,v){headers[k]=v;},
      status(c){code=c;return this;},
      end(){return this;},
      json(p){payload=p;return this;}
    };
    await fn({query:{},params:{},body:{},headers:{},method:'GET',...req},res);
    return {status:code,body:payload,headers};
  }

  const seedVendorRows=loadSeedVendorsFromMigration014(resolve('.'));
  assert.equal(seedVendorRows.length,59,'migration 014 seeds all 59 canonical Sonoma County listings');
  const catalogMockDb={
    async query(sql,params=[]){
      if(/WITH sched_latest AS/i.test(sql)){
        const filterId=params[2]||null;
        const rows=seedVendorRows
          .filter(v=>v.is_active&&(!filterId||v.id===filterId))
          .sort((a,b)=>(a.sort_order-b.sort_order)||a.id.localeCompare(b.id))
          .map(v=>({...v,v_updated_at:v.updated_at}));
        return {rows};
      }
      return {rows:[]};
    }
  };

  // 1. Unified API & static source checks
  const trucksFn=await loadHandler(join('api','trucks.js'),catalogMockDb);
  const trucksInvoke=await invoke(trucksFn);
  assert.equal(trucksInvoke.status,200);
  const result=trucksInvoke.body;
  assert(result && Array.isArray(result.trucks),'API returns unified listings');
  assert.equal(result.trucks.length,59,'expected unified catalog of 59 listings (47 primary + 12 neighborhood)');
  assert.equal(result.primary_total,47,'expected 47 primary event-bookable listings');
  assert.equal(result.trucks.filter(t=>!t.extra).length,47,'47 primary records');
  assert.equal(result.trucks.filter(t=>t.extra).length,12,'12 reconciled v77 neighborhood records');
  assert(typeof result.catalog_version==='string' && result.catalog_version.startsWith('v2:'),'catalog_version emitted');
  const byId=Object.fromEntries(result.trucks.map(t=>[t.id,t]));
  assert.equal(byId.mitote.location,'100 Sebastopol Rd, Santa Rosa');
  assert.equal(byId.elroys.location,'1569 Sebastopol Rd, Santa Rosa');
  assert.equal(byId.kolobok.cuisine,'Global');
  assert.equal(byId.hefty.cuisine,'Global');
  assert.equal(byId['coffee-crooks'].extra,true);
  assert.equal(byId['coffee-crooks'].kind,'Coffee');
  assert(result.trucks.every(t=>t.verified===false),'no blanket verified true');
  assert(result.trucks.every(t=>t.photo_rights_verified===false),'no unlicensed photos marked verified');
  assert(result.trucks.every(t=>t.distance===null),'no fabricated proximity distances without user coordinates');
  assert(result.trucks.every(t=>t.id && t.name),'all listings have identity');
  assert(result.trucks.every(t=>!t.photo || !t.photo.includes('images.unsplash.com')),'no stock photos presented as named vendors');

  const app=fs.readFileSync(join('public','app.js'),'utf8');
  const highlight=fs.readFileSync(join('public','listing-highlights.js'),'utf8');
  const debugAdmin=fs.readFileSync(join('scripts','dev-workbench','debug-admin.js'),'utf8');
  const html=fs.readFileSync(join('public','index.html'),'utf8');
  const loginHtml=fs.readFileSync(join('public','login.html'),'utf8');
  new Function(app);new Function(highlight);new Function(debugAdmin);
  assert(!app.includes('neighborhoodAdditions')&&!app.includes('mergeNeighborhoodAdditions'),'client-side duplicate neighborhoodAdditions catalog removed');
  assert(html.includes('/listing-highlights.js'),'listing visual enhancement is actually loaded');
  assert(!html.includes('/debug-admin.js')&&!html.includes('/debug-admin.css'),'development debug workbench controls excluded from public/index.html');
  assert(!fs.existsSync(join('public','debug-admin.js'))&&!fs.existsSync(join('public','debug-admin.css')),'development debug workbench files absent from public/ release directory');
  assert(!html.includes('>JM</summary>'),'hardcoded JM avatar removed');
  assert(html.includes('id="authSignInLink"')&&html.includes('id="mapEmpty"')&&html.includes('id="bookingError"'),'new UX elements wired in HTML');
  assert(loginHtml.includes('id="returnLink"'),'login page includes back link');
  assert(!app.includes('Mueller Lake Park')&&!app.includes('La Estrella Tacos'),'no unrelated Austin fallback data');
  for(const id of ['mitote','xies','dinos','fruta','kolobok','lucha','coffee-crooks','holy-chile','elroys','iniguez','elenita','momo','dogaday','api-hot','magos']){
    assert(highlight.includes('"'+id+'": {'),'spotlight exists for '+id);
  }

  // 2. Behavioral client-side tests in VM sandbox
  const store=new Map();
  const elements={
    map:makeEl('map'),
    discoverScreen:makeEl('discoverScreen',{classes:['screen','active']}),
    favoritesScreen:makeEl('favoritesScreen',{classes:['screen']}),
    bookingsScreen:makeEl('bookingsScreen',{classes:['screen']}),
    ownerScreen:makeEl('ownerScreen',{classes:['screen']}),
    mapMode:makeEl('mapMode',{classes:['active']}),
    listMode:makeEl('listMode'),
    searchInput:makeEl('searchInput'),
    openNow:makeEl('openNow'),
    distanceText:makeEl('distanceText',{textContent:'30 mi'}),
    distanceRange:makeEl('distanceRange',{value:'30'}),
    rangeValue:makeEl('rangeValue',{textContent:'30 miles'}),
    refreshCatalogBtn:makeEl('refreshCatalogBtn'),
    nearbyCount:makeEl('nearbyCount'),
    openHoursNote:makeEl('openHoursNote',{hidden:true}),
    catalogOfflineNote:makeEl('catalogOfflineNote',{hidden:true}),
    mapEmpty:makeEl('mapEmpty',{hidden:true}),
    truckSheet:makeEl('truckSheet'),
    truckCards:makeEl('truckCards'),
    favoriteGrid:makeEl('favoriteGrid'),
    bookingList:makeEl('bookingList'),
    ownerLocation:makeEl('ownerLocation',{value:'Ross Street'}),
    ownerLat:makeEl('ownerLat',{value:''}),
    ownerLng:makeEl('ownerLng',{value:''}),
    ownerLocationTtl:makeEl('ownerLocationTtl',{value:'480'}),
    ownerPhotoGrid:makeEl('ownerPhotoGrid'),
    ownerRequests:makeEl('ownerRequests'),
    ownerRequestCount:makeEl('ownerRequestCount'),
    detailModal:makeEl('detailModal'),
    detailContent:makeEl('detailContent'),
    bookingModal:makeEl('bookingModal'),
    bookingAuthNotice:makeEl('bookingAuthNotice',{hidden:true}),
    bookingTruck:makeEl('bookingTruck'),
    bookingTruckLabel:makeEl('bookingTruckLabel'),
    eventType:makeEl('eventType',{value:'Birthday party'}),
    eventDate:makeEl('eventDate',{value:''}),
    guestCount:makeEl('guestCount',{value:'50'}),
    eventLocation:makeEl('eventLocation',{value:'123 Fourth St, Santa Rosa'}),
    eventNote:makeEl('eventNote',{value:''}),
    bookingError:makeEl('bookingError',{hidden:true}),
    bookingSubmitBtn:makeEl('bookingSubmitBtn'),
    distanceModal:makeEl('distanceModal'),
    locationLabel:makeEl('locationLabel',{textContent:'Sonoma County'}),
    profileMenu:makeEl('profileMenu'),
    profileAvatar:makeEl('profileAvatar',{textContent:'👤'}),
    profileHeading:makeEl('profileHeading'),
    profileSub:makeEl('profileSub'),
    authSignInLink:makeEl('authSignInLink',{hidden:false}),
    authSignOutBtn:makeEl('authSignOutBtn',{hidden:true}),
    nearbyAlertToggle:makeEl('nearbyAlertToggle',{checked:true}),
    nearbyAlertRadius:makeEl('nearbyAlertRadius',{value:'3',options:[{value:'1'},{value:'3'},{value:'5'},{value:'10'},{value:'15'},{value:'30'}]}),
    nearbyAlertMeta:makeEl('nearbyAlertMeta'),
    ownerModeBanner:makeEl('ownerModeBanner',{hidden:true}),
    ownerTruckSelect:makeEl('ownerTruckSelect',{value:'mitote'}),
    ownerModerationCard:makeEl('ownerModerationCard',{hidden:false}),
    ownerEditProfileBtn:makeEl('ownerEditProfileBtn'),
    ownerEditProfileSub:makeEl('ownerEditProfileSub'),
    pagerVendor:makeEl('pagerVendor'),
    ownerTitle:makeEl('ownerTitle'),
    ownerSubtitle:makeEl('ownerSubtitle'),
    ownerLogo:makeEl('ownerLogo'),
    ownerPinEmoji:makeEl('ownerPinEmoji'),
    ownerStatusPill:makeEl('ownerStatusPill'),
    statTotalRequests:makeEl('statTotalRequests'),
    statPendingRequests:makeEl('statPendingRequests'),
    statAcceptedRequests:makeEl('statAcceptedRequests'),
    ownerScheduleDate:makeEl('ownerScheduleDate',{value:''}),
    ownerScheduleWeekday:makeEl('ownerScheduleWeekday'),
    ownerOpensAt:makeEl('ownerOpensAt',{value:'11:00'}),
    ownerClosesAt:makeEl('ownerClosesAt',{value:'20:00'}),
    ownerIsOpen:makeEl('ownerIsOpen',{checked:true}),
    ownerScheduleList:makeEl('ownerScheduleList'),
    ownerProfileModal:makeEl('ownerProfileModal'),
    ownerProfileName:makeEl('ownerProfileName',{value:''}),
    ownerProfileCuisine:makeEl('ownerProfileCuisine',{value:'Mexican'}),
    ownerProfileBio:makeEl('ownerProfileBio',{value:''}),
    ownerAcceptingBookings:makeEl('ownerAcceptingBookings',{checked:true}),
    toast:makeEl('toast')
  };

  let activePackageRadio={value:'dropin',dataset:{price:'750',max:'50',name:'Neighborhood Drop-in'}};
  let fetchHandler=async(url)=>({ok:false,status:401,json:async()=>({})});
  let geoCoords={latitude:38.2437,longitude:-122.6269};
  let mapFlownTo=null;
  let ownerCallsDuringInit=0;

  const catalogSample=result.trucks.map(t=>({...t}));
  // Force deterministic open state for testing Open Now
  catalogSample.forEach(t=>{t.open=(t.id==='fruta');});

  fetchHandler=async(url,opts={})=>{
    if(url.startsWith('/api/owner/'))ownerCallsDuringInit++;
    if(url==='/api/trucks'||url.startsWith('/api/trucks?'))return {ok:true,status:200,json:async()=>({catalog_version:result.catalog_version,trucks:catalogSample})};
    if(url.startsWith('/api/trucks/nearby'))return {ok:true,status:200,json:async()=>({nearest_hubs:[{city:'Petaluma',distance_miles:0.1}]})};
    return {ok:false,status:401,json:async()=>({error:'Unauthorized'})};
  };

  const sandbox={
    window:{innerWidth:390,addEventListener(){},dispatchEvent(){}},
    URLSearchParams,
    CustomEvent:class CustomEvent{constructor(type,init){this.type=type;this.detail=init?.detail;}},
    localStorage:{
      getItem:k=>store.has(k)?store.get(k):null,
      setItem:(k,v)=>store.set(k,String(v)),
      removeItem:k=>store.delete(k)
    },
    navigator:{
      geolocation:{
        getCurrentPosition:(ok)=>ok({coords:geoCoords})
      }
    },
    document:{
      readyState:'complete',
      head:{appendChild(){}},
      getElementById:id=>elements[id]||null,
      createElement:tag=>makeEl(tag),
      addEventListener(){},
      querySelector:sel=>{
        if(sel==='input[name="bookingPackage"]:checked')return activePackageRadio;
        if(sel==='#detailContent .detail-body')return null;
        return null;
      },
      querySelectorAll:()=>[]
    },
    L:{
      map:()=>({
        setView(){return this;},
        getZoom:()=>12,
        removeLayer(){},
        whenReady(fn){fn();},
        on(){},
        invalidateSize(){},
        flyTo(coords){mapFlownTo=coords;},
        fitBounds(){}
      }),
      tileLayer:()=>({addTo(){}}),
      control:{zoom:()=>({addTo(){}})},
      divIcon:o=>o,
      marker:()=>({addTo(){return this;},on(){return this;},setLatLng(){return this;}}),
      latLngBounds:()=>({})
    },
    fetch:(url,opts)=>fetchHandler(url,opts),
    setTimeout:()=>1,
    clearTimeout(){},
    console,
    Date,Math,JSON,Number,String,Array,Object,Set,Promise,RegExp,encodeURIComponent
  };
  sandbox.window.__BITESHARK__=undefined;
  vm.createContext(sandbox);
  vm.runInContext(app,sandbox);
  vm.runInContext(highlight,sandbox);

  // Wait for deferred init() microtask + async fetches
  await new Promise(r=>setImmediate(r));
  await new Promise(r=>setImmediate(r));

  // Verify guest auth defaults
  assert.equal(elements.profileAvatar.textContent,'👤');
  assert.equal(elements.profileHeading.textContent,'Guest mode');
  assert.equal(elements.authSignInLink.hidden,false);
  assert.equal(elements.authSignOutBtn.hidden,true);

  // Test Fix 2: Open Now matches published schedule (fruta) with unverified hours note, and shows Map empty banner when 0 open
  sandbox.toggleOpen();
  assert.equal(elements.openHoursNote.hidden,false,'unverified hours disclaimer shown when Open Now matches unverified listing');
  assert.equal(elements.mapEmpty.hidden,true,'map empty hidden when 1 listing is open');
  assert(elements.truckCards.innerHTML.includes('◐ EST. OPEN'),'unverified open truck labeled EST. OPEN, not confirmed OPEN');
  assert(elements.truckCards.innerHTML.includes('Bionico fruit bowl'),'sourced menu highlight rendered concisely inside card text column');
  assert(!elements.truckCards.innerHTML.includes('truckly-spotlight') && !elements.truckCards.innerHTML.includes('Dish and photo research pending'),'disconnected spotlight box and research-pending banner omitted from discovery cards');

  // When 0 trucks are open, Map mode displays visible empty banner
  vm.runInContext('trucks.forEach(t => { t.open = false; }); applyFilters();',sandbox);
  assert.equal(elements.mapEmpty.hidden,false,'map empty banner visible when 0 places open');
  assert(elements.mapEmpty.innerHTML.includes('Turn off Open now'),'map empty banner offers one-tap reset');
  sandbox.toggleOpen(); // turn Open Now back off
  assert.equal(elements.mapEmpty.hidden,true);

  // Test Fix 3: Geolocation recalculates real distances ONLY on measured coordinates (never illustrative pins) and sorts nearest first
  sandbox.locateMe();
  await new Promise(r=>setImmediate(r));
  const nearestFirst=vm.runInContext('filtered()[0]',sandbox);
  assert.equal(nearestFirst.id,'elroys-pet-1','Petaluma venue-address truck is nearest when located in Petaluma');
  assert.equal(nearestFirst.distance,0,'Haversine distance recalculated to 0.0 mi for venue_address');
  assert.equal(vm.runInContext('trucks.find(t=>t.id==="holy-chile").distance',sandbox),null,'illustrative_pin never receives fabricated measured mileage');
  assert.equal(elements.locationLabel.textContent,'Near Petaluma','location pill updated to nearest Sonoma hub');
  assert.deepEqual([...mapFlownTo],[38.2437,-122.6269],'map flew to user coordinates');

  // Test Fix 1: Booking client-side sign-in requirement, package limit validation & server 400 error handling
  let createCalls=0;
  let capturedHeaders=null;
  fetchHandler=async(url,opts={})=>{
    if(url==='/api/bookings/create'){
      createCalls++;
      capturedHeaders=opts.headers||{};
      return {ok:false,status:400,json:async()=>({error:'Server rejected booking'})};
    }
    return {ok:false,status:401,json:async()=>({})};
  };
  // Guest (unauthenticated) booking attempt is blocked with explicit sign-in notice
  elements.guestCount.value='40';
  sandbox.openBooking('mitote');
  assert.equal(elements.bookingAuthNotice.hidden,false,'guest sees sign-in required notice in booking modal');
  await sandbox.submitBooking({preventDefault(){},target:{reset(){}}});
  assert.equal(createCalls,0,'unauthenticated booking blocked before network call');
  assert(elements.bookingError.textContent.includes('sign in'),'sign-in guidance surfaced to guest');

  // Sign in user, then verify package guest-count check, 400 handling, and 201 idempotency header
  sandbox.window.__BITESHARK__={user:{id:'usr_maya',email:'maya@sonoma.example'}};
  fetchHandler=async(url,opts={})=>{
    if(url==='/api/favorites/list')return {ok:true,status:200,json:async()=>({favorites:[{truck_id:'mitote'},{truck_id:'fruta'}]})};
    if(url==='/api/bookings/list')return {ok:true,status:200,json:async()=>({bookings:[{id:'srv-1',truck_name:'Mitote <script>alert(1)</script>',event_type:'Wedding',event_date:'2026-12-05T00:00:00.000Z',guest_count:90,location:'Santa Rosa',package_name:'Party Favorite',package_price:1500,status:'accepted'}]})};
    if(url==='/api/notifications/settings')return {ok:true,status:200,json:async()=>({nearby_enabled:true,radius_miles:10})};
    if(url==='/api/favorites/toggle')return {ok:true,status:200,json:async()=>({truck_id:'elroys',saved:true})};
    return {ok:true,status:200,json:async()=>({})};
  };
  await vm.runInContext('syncAuthAndUserData()',sandbox);
  assert.equal(elements.profileHeading.textContent,'maya@sonoma.example','signed-in email displayed');
  assert.equal(elements.authSignInLink.hidden,true);
  assert.equal(elements.authSignOutBtn.hidden,false);
  assert.equal(vm.runInContext('favs.has("mitote") && favs.has("fruta")',sandbox),true,'server favorites synced');
  assert.equal(elements.nearbyAlertRadius.value,'10','server notification radius synced');
  assert(!elements.bookingList.innerHTML.includes('NaN'),'Postgres ISO timestamp parsed cleanly without NaN');
  assert(elements.bookingList.innerHTML.includes('status-accepted'),'accepted booking status styled');
  assert(!elements.bookingList.innerHTML.includes('<script>'),'XSS payload escaped in booking list');

  fetchHandler=async(url,opts={})=>{
    if(url==='/api/bookings/create'){
      createCalls++;
      capturedHeaders=opts.headers||{};
      return {ok:false,status:400,json:async()=>({error:'Server rejected booking'})};
    }
    return {ok:true,status:200,json:async()=>({requestable:true})};
  };
  elements.guestCount.value='80'; // exceeds dropin max 50
  sandbox.openBooking('mitote');
  assert.equal(elements.bookingAuthNotice.hidden,true,'sign-in banner hidden when authenticated');
  await sandbox.submitBooking({preventDefault(){},target:{reset(){}}});
  assert.equal(createCalls,0,'invalid package guest count blocked before network call');
  assert.equal(elements.bookingError.hidden,false,'inline booking error shown');
  assert(elements.bookingError.textContent.includes('up to 50 guests'));

  // Switch to party (max 100), test server 400 error is NOT swallowed and Idempotency-Key is sent
  activePackageRadio={value:'party',dataset:{price:'1500',max:'100',name:'Party Favorite'}};
  await sandbox.submitBooking({preventDefault(){},target:{reset(){}}});
  assert.equal(createCalls,1,'valid client payload sent to server');
  const firstIdemKey=capturedHeaders['Idempotency-Key'];
  assert(firstIdemKey && firstIdemKey.length>=8,'Idempotency-Key header included');
  assert.equal(elements.bookingError.textContent,'Server rejected booking','server 400 error surfaced in modal');
  assert.equal(elements.bookingModal.classList.contains('show'),true,'modal stays open on server error so user can fix input');

  // Retry identical payload reuses same Idempotency-Key, and 201 closes modal
  fetchHandler=async(url,opts={})=>{
    if(url==='/api/bookings/create'){
      capturedHeaders=opts.headers||{};
      return {ok:true,status:201,json:async()=>({id:'uuid-booking-1',truck_id:'mitote',truck_name:'Mitote Food Park',status:'pending',package_name:'Party Favorite',package_price:1500,created_at:'2026-11-16T18:00:00Z'})};
    }
    if(url==='/api/bookings/list'){
      return {ok:true,status:200,json:async()=>({bookings:[{id:'uuid-booking-1',truck_id:'mitote',truck_name:'Mitote Food Park',event_type:'Birthday party',event_date:elements.eventDate.value||'2026-11-25',guest_count:80,location:'123 Fourth St, Santa Rosa',package_name:'Party Favorite',package_price:1500,status:'pending'}]})};
    }
    return {ok:true,status:200,json:async()=>({requestable:true})};
  };
  await sandbox.submitBooking({preventDefault(){},target:{reset(){elements.eventDate.value='';}}});
  assert.equal(capturedHeaders['Idempotency-Key'],firstIdemKey,'retrying identical form draft reuses Idempotency-Key');
  assert.equal(elements.bookingModal.classList.contains('show'),false,'modal closed on 201');
  assert(/^\d{4}-\d{2}-\d{2}$/.test(elements.eventDate.value),'default event date restored after form reset');

  // Test accent-folded client search ("iniguez" matches "Tacos Iñiguez")
  elements.searchInput.value='iniguez';
  assert.equal(vm.runInContext('filtered()[0]?.id',sandbox),'iniguez','client search matches accented vendor names');
  elements.searchInput.value='';

  // Test v77 reconciled 59-listing directory (47 primary + 12 neighborhood additions) & Coffee kind filter
  assert.equal(vm.runInContext('trucks.length',sandbox),59,'47 primary + 12 v77 neighborhood additions merged');
  sandbox.chooseKind('Coffee');
  assert.equal(vm.runInContext('filtered().length',sandbox),5,'4 dedicated coffee cafés + Myriad Coffee match Coffee kind');
  assert(elements.truckCards.innerHTML.includes('Crème Brûlée Latte'),'listing-highlights wraps extraCard with coffee-crooks spotlight');
  sandbox.resetFilters();

  // 3. Cross-endpoint API parity & stale-data regression checks
  // (Full real-PostgreSQL RBAC, RLS, constraint, and concurrency tests live in tests/backend-hardening.integration.cjs and tests/p1-unified-discovery.integration.cjs)

  // Ensure exact 30 VPS domain handler files (20 base + 6 pager + 4 community) and no legacy Austin strings
  function listJs(dir){
    const out=[];
    for(const e of fs.readdirSync(dir,{withFileTypes:true})){
      const full=join(dir,e.name);
      if(e.isDirectory())out.push(...listJs(full));
      else if(e.name.endsWith('.js'))out.push(full);
    }
    return out;
  }
  const apiFiles=listJs('api');
  assert.equal(apiFiles.length,30,'preserves exact 30 VPS domain handler routes (20 base + 6 pager + 4 community)');
  for(const f of apiFiles){
    const txt=fs.readFileSync(f,'utf8');
    assert(!txt.includes('Mueller Lake Park')&&!txt.includes("'estrella'"),'no legacy Austin defaults in '+f);
    assert(!txt.includes('665 Sebastopol Rd'),'no outdated Mitote address in '+f);
    assert(!txt.includes('"2026-09-07"'),'no expired hardcoded Sep 2026 Ross schedule in '+f);
  }

  // 3a. api/trucks/[id].js parity with all 59 unified listings in api/trucks.js
  const detailFn=await loadHandler(join('api','trucks','[id].js'),catalogMockDb);
  for(const t of result.trucks){
    const r=await invoke(detailFn,{params:{id:t.id}});
    assert.equal(r.status,200,'detail found for '+t.id);
    assert.equal(r.body.name,t.name,'detail name matches for '+t.id);
    assert.equal(r.body.location,t.location,'detail location matches for '+t.id);
    assert.equal(r.body.city,t.city,'detail city matches for '+t.id);
    assert.equal(r.body.cuisine,t.cuisine,'detail cuisine matches for '+t.id);
    assert.equal(r.body.type,t.listing_type,'detail type matches for '+t.id);
    assert.equal(r.body.extra,t.extra,'detail extra flag matches for '+t.id);
    assert.equal(r.body.verified,false,'detail verified flag matches audit baseline');
    assert.equal(r.body.catalog_version,result.catalog_version,'detail catalog_version matches list');
  }
  const missingDetail=await invoke(detailFn,{params:{id:'nonexistent-truck'}});
  assert.equal(missingDetail.status,404,'unknown truck returns 404');

  // 3b. api/trucks/search.js parity across all 59 unified listings + accent-insensitive search
  const searchFn=await loadHandler(join('api','trucks','search.js'),catalogMockDb);
  const allSearch=await invoke(searchFn,{query:{limit:'100'}});
  assert.equal(allSearch.body.total,59,'search indexes all 59 unified listings');
  assert.equal(allSearch.body.results.length,59,'search limit=100 returns all 59 listings');
  assert.deepEqual(allSearch.body.results.map(x=>x.id),result.trucks.map(x=>x.id),'search order & IDs match unified catalog');
  const primaryOnlySearch=await invoke(searchFn,{query:{limit:'100',include_extra:'0'}});
  assert.equal(primaryOnlySearch.body.total,47,'include_extra=0 filters to 47 primary listings');
  const accentSearch=await invoke(searchFn,{query:{q:'iniguez'}});
  assert.equal(accentSearch.body.results[0]?.id,'iniguez','accent-folded search finds Tacos Iñiguez');
  const coffeeSearch=await invoke(searchFn,{query:{q:'retrograde'}});
  assert.equal(coffeeSearch.body.results[0]?.id,'coffee-retrograde','unified search finds neighborhood coffee roaster');
  const marketSearch=await invoke(searchFn,{query:{q:'markets',limit:'50'}});
  assert.equal(marketSearch.body.total,12,'tag search finds all 12 market listings (10 stalls + 2 farmers markets)');

  // 3c. api/catalog/cuisines.js, featured.js, cities.js & nearby.js parity + explicit 503 outage handling
  const cuisinesRes=await invoke(await loadHandler(join('api','catalog','cuisines.js')));
  assert.deepEqual(cuisinesRes.body.cuisines.map(c=>c.id),result.sections,'cuisines metadata includes all 6 catalog sections including Markets');
  const featuredRes=await invoke(await loadHandler(join('api','catalog','featured.js'),catalogMockDb));
  assert.equal(featuredRes.status,200);
  assert.equal(featuredRes.body.featured_ids.length,5);
  assert(featuredRes.body.featured_ids.every(id=>byId[id]),'all featured IDs exist in unified catalog');
  const citiesRes=await invoke(await loadHandler(join('api','catalog','cities.js')));
  const nearbyRes=await invoke(await loadHandler(join('api','trucks','nearby.js')),{query:{lat:'38.4405',lng:'-122.7144'}});
  assert.deepEqual(new Set(citiesRes.body.cities.map(c=>c.name)),new Set(nearbyRes.body.nearest_hubs.map(h=>h.city)),'cities and nearby hubs match');

  const brokenDb={async query(){throw new Error('simulated postgres outage');}};
  for(const rel of [join('api','trucks.js'),join('api','trucks','[id].js'),join('api','trucks','search.js'),join('api','catalog','featured.js'),join('api','schedule','today.js')]){
    const outageFn=await loadHandler(rel,brokenDb);
    const outageRes=await invoke(outageFn,{params:{id:'mitote'}});
    assert.equal(outageRes.status,503,`DB outage returns explicit 503 on ${rel}`);
    assert.equal(outageRes.body.code,'DISCOVERY_DB_UNAVAILABLE',`DB outage returns DISCOVERY_DB_UNAVAILABLE on ${rel}`);
  }

  // 3d. api/schedule/today.js reads owner_schedule and validates real calendar date param
  const scheduleFn=await loadHandler(join('api','schedule','today.js'),{
    async query(sql,params){
      assert(sql.includes('FROM owner_schedule'));
      return {rows:[{truck_id:'dinos',vendor:"Dino's Greek Food",location:'Courthouse Square, Santa Rosa',opens_at:'11:00:00',closes_at:'14:30:00',status:'scheduled'}]};
    }
  });
  const badDate=await invoke(scheduleFn,{query:{date:'09/17/2026'}});
  assert.equal(badDate.status,400,'invalid date rejected on schedule/today');
  const impossibleSchedDate=await invoke(scheduleFn,{query:{date:'2026-02-29'}});
  assert.equal(impossibleSchedDate.status,400,'impossible calendar date rejected on schedule/today');
  const goodSchedule=await invoke(scheduleFn,{query:{date:'2026-11-16'}});
  assert.equal(goodSchedule.status,200);
  assert.equal(goodSchedule.body.events.length,1);
  assert.equal(goodSchedule.body.events[0].opens,'11:00');
  assert.equal(goodSchedule.body.events[0].closes,'14:30');

  // 3e. api/owner/location.js vendor-scoped auth & api/owner/requests.js UUID validation
  const ownerLocFn=await loadHandler(join('api','owner','location.js'),{
    async query(sql,params){
      if(sql.includes('FROM platform_roles'))return {rows:[]};
      if(sql.includes('FROM vendor_memberships'))return {rows:[{vendor_id:'iniguez',role:'owner',canonical_name:'Tacos Iñiguez'}]};
      if(sql.includes('FROM truck_settings'))return {rows:[]};
      return {rows:[]};
    }
  });
  const unauthLoc=await invoke(ownerLocFn,{method:'GET',query:{truck_id:'iniguez'}});
  assert.equal(unauthLoc.status,401,'unauthenticated owner location request denied');
  const crossVendorLoc=await invoke(ownerLocFn,{method:'GET',user:{id:'usr_a'},query:{truck_id:'mitote'}});
  assert.equal(crossVendorLoc.status,403,'cross-vendor location read denied');
  const defaultLoc=await invoke(ownerLocFn,{method:'GET',user:{id:'usr_a'},query:{truck_id:'iniguez'}});
  assert.equal(defaultLoc.status,200);
  assert.equal(defaultLoc.body.truck_id,'iniguez');
  assert.equal(defaultLoc.body.is_open,false,'unconfigured vendor defaults to is_open: false');

  let dbUpdated=false;
  const ownerReqFn=await loadHandler(join('api','owner','requests.js'),{
    async query(sql){
      if(sql.includes('FROM platform_roles'))return {rows:[]};
      if(sql.includes('FROM vendor_memberships'))return {rows:[{vendor_id:'iniguez',role:'owner',canonical_name:'Tacos Iñiguez'}]};
      if(sql.includes('FOR UPDATE'))return {rows:[{id:'00000000-0000-4000-8000-000000000001',truck_id:'iniguez',event_date:'2026-12-01',status:'pending'}]};
      if(sql.includes('FROM owner_schedule'))return {rows:[]};
      if(sql.includes('UPDATE bookings')){dbUpdated=true;return {rows:[{id:'00000000-0000-4000-8000-000000000001',truck_id:'iniguez',status:'accepted'}]};}
      return {rows:[]};
    }
  });
  const demoIdRes=await invoke(ownerReqFn,{method:'POST',user:{id:'usr_a'},body:{id:'1',status:'accepted'}});
  assert.equal(demoIdRes.status,400,'non-UUID booking ID rejected cleanly before SQL cast');
  assert.equal(dbUpdated,false);
  const validUuidRes=await invoke(ownerReqFn,{method:'POST',user:{id:'usr_a'},body:{id:'00000000-0000-4000-8000-000000000001',status:'accepted'}});
  assert.equal(validUuidRes.status,200);
  assert.equal(dbUpdated,true);

  // 4. Section C checks: dead-code removal, booking availability check, Owner Mode preview & live admin flows
  assert(!app.includes('function fitVisible')&&!app.includes('function toggleSheet')&&!app.includes('function toggleList'),'dead bottom-sheet helpers removed');
  assert.equal(ownerCallsDuringInit,0,'customer startup does not fire admin /api/owner/* calls');

  // 4a. Booking date availability check (/api/trucks/availability)
  fetchHandler=async(url)=>{
    if(url.startsWith('/api/trucks/availability'))return {ok:true,status:200,json:async()=>({truck_id:'mitote',date:'2026-12-01',requestable:false})};
    return {ok:false,status:401,json:async()=>({})};
  };
  elements.guestCount.value='40';
  activePackageRadio={value:'dropin',dataset:{price:'750',max:'50',name:'Neighborhood Drop-in'}};
  elements.eventDate.value='2026-12-01';
  sandbox.openBooking('mitote');
  await new Promise(r=>setImmediate(r));
  assert.equal(elements.bookingError.hidden,false,'unavailable truck date flagged in booking modal');
  assert(elements.bookingError.textContent.includes('unavailable'));
  sandbox.closeBooking();

  // 4b. Owner Mode — Preview Mode for non-admin visitors
  let previewReqPosts=0;
  fetchHandler=async(url,opts={})=>{
    if(url==='/api/owner/requests'&&opts.method==='POST')previewReqPosts++;
    return {ok:false,status:403,json:async()=>({error:'Forbidden'})};
  };
  await vm.runInContext('loadOwnerDashboard()',sandbox);
  assert.equal(elements.ownerModeBanner.hidden,false,'non-admin sees explicit Preview Mode banner');
  assert.equal(elements.statTotalRequests.textContent,'3');
  assert.equal(elements.statPendingRequests.textContent,'3');
  assert(!elements.ownerRequests.innerHTML.includes('2026-09-17'),'stale Sep 2026 sample dates replaced with dynamic future dates');
  await sandbox.handleRequest('preview-1','accepted');
  assert.equal(previewReqPosts,0,'preview mode handles sample accept locally without hitting admin POST');
  assert.equal(elements.statAcceptedRequests.textContent,'1');
  assert.equal(elements.statPendingRequests.textContent,'2');

  // 4c. Owner Mode — Live Vendor Owner Mode (scoped stats, moderation hidden for non-moderators, schedule & profile save)
  let savedSchedulePayload=null,savedProfilePayload=null;
  const futureSchedDate=vm.runInContext('futureDateISO(4)',sandbox);
  fetchHandler=async(url,opts={})=>{
    if(url.startsWith('/api/owner/stats'))return {ok:true,status:200,json:async()=>({total_requests:14,pending:0,accepted:11,actor:{user_id:'usr_owner_a',is_platform_admin:false,is_moderator:false,vendors:[{vendor_id:'iniguez',role:'owner',canonical_name:'Tacos Iñiguez'}]}} )};
    if(url.startsWith('/api/owner/profile')&&(!opts.method||opts.method==='GET'))return {ok:true,status:200,json:async()=>({truck_id:'iniguez',display_name:'Sonoma Fuego',cuisine:'Mexican',description:'Wood-fired tacos',accepting_bookings:true})};
    if(url==='/api/owner/profile'&&opts.method==='POST'){savedProfilePayload=JSON.parse(opts.body);return {ok:true,status:200,json:async()=>savedProfilePayload};}
    if(url.startsWith('/api/owner/location'))return {ok:true,status:200,json:async()=>({truck_id:'iniguez',location:'Courthouse Square, Santa Rosa',is_open:true,opens_at:'11:30:00',closes_at:'19:30:00'})};
    if(url.startsWith('/api/owner/schedule')&&(!opts.method||opts.method==='GET'))return {ok:true,status:200,json:async()=>({schedule:[]})};
    if(url==='/api/owner/schedule'&&opts.method==='POST'){savedSchedulePayload=JSON.parse(opts.body);return {ok:true,status:200,json:async()=>savedSchedulePayload};}
    if(url.startsWith('/api/owner/requests'))return {ok:true,status:200,json:async()=>({requests:[]})};
    return {ok:true,status:200,json:async()=>({})};
  };
  await vm.runInContext('loadOwnerDashboard()',sandbox);
  assert.equal(elements.ownerModeBanner.hidden,true,'Preview Mode banner hidden for authenticated vendor owner');
  assert.equal(elements.ownerModerationCard.hidden,true,'community moderation card hidden for non-moderator vendor owner');
  assert.equal(elements.statTotalRequests.textContent,'14');
  assert.equal(elements.statAcceptedRequests.textContent,'11');
  assert.equal(elements.ownerTitle.textContent,'Sonoma Fuego');
  assert.equal(elements.pagerVendor.value,'Sonoma Fuego','pager vendor input synced to selected vendor display name');
  assert(elements.ownerRequests.innerHTML.includes('No pending booking requests right now.'),'real vendor empty inbox does not inject fake demo rows');

  elements.ownerScheduleDate.value=futureSchedDate;
  elements.ownerOpensAt.value='11:30';
  elements.ownerClosesAt.value='19:30';
  elements.ownerIsOpen.checked=false;
  await sandbox.saveOwnerSchedule();
  assert.equal(savedSchedulePayload.truck_id,'iniguez');
  assert.equal(savedSchedulePayload.status,'unavailable','unchecked open switch saves status=unavailable');
  assert(elements.ownerScheduleList.innerHTML.includes('Unavailable'),'saved schedule rendered in list');

  sandbox.openOwnerProfileModal();
  elements.ownerProfileName.value='Sonoma Fuego Grill';
  elements.ownerAcceptingBookings.checked=false;
  await sandbox.saveOwnerProfile({preventDefault(){}});
  assert.equal(savedProfilePayload.display_name,'Sonoma Fuego Grill');
  assert.equal(elements.ownerTitle.textContent,'Sonoma Fuego Grill');
  assert(elements.ownerStatusPill.textContent.includes('paused'),'paused booking status reflected in header pill');

  // 4d. Backend api/owner/schedule.js & api/owner/bookings.js validation
  const ownerSchedApi=await loadHandler(join('api','owner','schedule.js'),{
    async query(sql,params){
      if(sql.includes('FROM platform_roles'))return {rows:[]};
      if(sql.includes('FROM vendor_memberships'))return {rows:[{vendor_id:'dinos',role:'staff',canonical_name:"Dino's Greek Food"}]};
      if(sql.includes('INSERT INTO owner_schedule'))return {rows:[{id:'00000000-0000-4000-8000-000000000010',truck_id:params[0]||'dinos',service_date:params[1]||futureSchedDate,status:'scheduled'}]};
      return {rows:[]};
    }
  });
  const badSchedRes=await invoke(ownerSchedApi,{method:'POST',user:{id:'usr_staff_dinos'},body:{truck_id:'dinos',service_date:'bad-date'}});
  assert.equal(badSchedRes.status,400,'owner/schedule rejects malformed date');
  const goodSchedRes=await invoke(ownerSchedApi,{method:'POST',user:{id:'usr_staff_dinos'},body:{truck_id:'dinos',service_date:futureSchedDate,opens_at:'11:00',closes_at:'15:00'}});
  assert.equal(goodSchedRes.status,200);

  const ownerBookingsApi=await loadHandler(join('api','owner','bookings.js'),{
    async query(sql,params){
      if(sql.includes('FROM platform_roles'))return {rows:[]};
      if(sql.includes('FROM vendor_memberships'))return {rows:[{vendor_id:'dinos',role:'owner',canonical_name:"Dino's Greek Food"}]};
      assert(sql.includes('LIMIT 100'));
      assert(sql.includes('ANY($1::text[])'));
      return {rows:[{id:'b1',truck_id:'dinos',status:params?.[1]||'accepted'}]};
    }
  });
  const filteredBookingsRes=await invoke(ownerBookingsApi,{user:{id:'usr_owner_dinos'},query:{status:'accepted'}});
  assert.equal(filteredBookingsRes.body.bookings[0].status,'accepted');

  // 5. BiteShark public branding, PWA manifest/icons, release hygiene & deployment template parity
  const manifestRaw=fs.readFileSync(join('public','manifest.json'),'utf8');
  const manifest=JSON.parse(manifestRaw);
  const swJs=fs.readFileSync(join('public','sw.js'),'utf8');
  const smartJs=fs.readFileSync(join('public','smart.js'),'utf8');
  const pagerJs=fs.readFileSync(join('public','pager.js'),'utf8');
  const localGuidesJs=fs.readFileSync(join('public','local-guides.js'),'utf8');
  const logoSvg=fs.readFileSync(join('public','logo.svg'),'utf8');

  const adminHtml=fs.readFileSync(join('public','admin.html'),'utf8');
  const adminCss=fs.readFileSync(join('public','admin.css'),'utf8');
  const adminJs=fs.readFileSync(join('public','admin.js'),'utf8');
  const roleExpCss=fs.readFileSync(join('public','role-experience.css'),'utf8');
  const roleExpJs=fs.readFileSync(join('public','role-experience.js'),'utf8');
  const policyFiles=fs.readdirSync(join('public','policies')).map(f=>[`public/policies/${f}`,fs.readFileSync(join('public','policies',f),'utf8')]);

  for(const [name,content] of [
    ['public/index.html',html],
    ['public/login.html',loginHtml],
    ['public/admin.html',adminHtml],
    ['public/admin.css',adminCss],
    ['public/admin.js',adminJs],
    ['public/role-experience.css',roleExpCss],
    ['public/role-experience.js',roleExpJs],
    ['public/manifest.json',manifestRaw],
    ['public/sw.js',swJs],
    ['public/smart.js',smartJs],
    ...policyFiles
  ]){
    assert(!/truc?kly/i.test(content),`${name} must contain zero Truckly/Trukly strings`);
  }
  assert(html.includes('<title>BiteShark — Good food. Word gets around.</title>'),'index.html BiteShark title');
  assert(html.includes('aria-label="BiteShark owner mode"')&&html.includes('<span>BiteShark</span>'),'header brand mark shows BiteShark');
  assert(!html.includes('<span class="brand-mark">T</span>'),'old T brand mark replaced');
  assert(loginHtml.includes('<title>Sign in · BiteShark</title>')&&loginHtml.includes('← Back to BiteShark'),'login.html BiteShark branding');
  assert(!loginHtml.includes('<div class="login-logo">T</div>'),'old login T mark replaced');
  assert(swJs.includes('BiteShark · Order Ready for Pickup')&&swJs.includes("icon: '/icon-192.png'")&&swJs.includes("badge: '/badge-96.png'")&&swJs.includes("type: 'BITESHARK_OPEN_PAGER_REF'"),'sw.js BiteShark push branding & raster icons');
  assert(pagerJs.includes('BiteShark Test Kitchen')&&!pagerJs.includes('Truckly Test Kitchen'),'pager demo uses BiteShark Test Kitchen');
  assert(pagerJs.includes("'X-BiteShark-Client':'web-pager-v1'")&&pagerJs.includes("msg.type!=='BITESHARK_OPEN_PAGER_REF'&&msg.type!=='TRUCKLY_OPEN_PAGER_REF'"),'pager.js sends X-BiteShark-Client and accepts both SW message types');
  assert(app.includes('Could not reach BiteShark right now')&&app.includes('find us on BiteShark!'),'app.js BiteShark user-facing messages');
  assert(app.includes("'truckly_favs'")&&app.includes("'truckly_catalog_v2'")&&localGuidesJs.includes("'truckly-dish-notebook-v1'"),'same-origin browser storage keys intentionally preserved');
  assert(logoSvg.includes('<svg')&&!logoSvg.includes('>T<'),'logo.svg is a code-native BiteShark vector mark');

  assert.equal(manifest.short_name,'BiteShark');
  assert(manifest.name.startsWith('BiteShark — '),'manifest name starts with BiteShark');
  assert.equal(manifest.display,'standalone');

  function inspectPng(relFile){
    const buf=fs.readFileSync(join('public',relFile));
    const sig=buf.subarray(0,8).toString('hex');
    assert.equal(sig,'89504e470d0a1a0a',`${relFile} must have valid PNG signature`);
    assert.equal(buf.subarray(12,16).toString('ascii'),'IHDR',`${relFile} must start with IHDR chunk`);
    return {width:buf.readUInt32BE(16),height:buf.readUInt32BE(20),colorType:buf[25],bytes:buf.length};
  }
  const png180=inspectPng('apple-touch-icon.png');
  assert.equal(png180.width,180);assert.equal(png180.height,180);assert.equal(png180.colorType,2,'apple-touch-icon.png opaque RGB');
  const png192=inspectPng('icon-192.png');
  assert.equal(png192.width,192);assert.equal(png192.height,192);
  const png512=inspectPng('icon-512.png');
  assert.equal(png512.width,512);assert.equal(png512.height,512);
  const pngMask=inspectPng('icon-maskable-512.png');
  assert.equal(pngMask.width,512);assert.equal(pngMask.height,512);
  const pngBadge=inspectPng('badge-96.png');
  assert.equal(pngBadge.width,96);assert.equal(pngBadge.height,96);assert.equal(pngBadge.colorType,6,'badge-96.png RGBA alpha');

  const publicFiles=fs.readdirSync(join('public'));
  assert(!publicFiles.some(f=>f.startsWith('.env')||f.includes('debug-admin')||f.includes('dev-server')),'no secrets or development controls in public/');

  const holdingHtml=fs.readFileSync(join('deploy','holding','index.html'),'utf8');
  assert(holdingHtml.includes('BiteShark is coming soon.')&&!/login|staging|truckly/i.test(holdingHtml),'minimal BiteShark holding page');
  const rootNginx=fs.readFileSync(join('deploy','nginx','biteshark.live.conf.template'),'utf8').replace(/^\s*#.*$/gm,'');
  const stgNginx=fs.readFileSync(join('deploy','nginx','staging.biteshark.live.conf.template'),'utf8').replace(/^\s*#.*$/gm,'');
  assert(rootNginx.includes('return 301 https://biteshark.live$request_uri;')&&!rootNginx.includes('includeSubDomains')&&!rootNginx.includes('preload'),'biteshark.live canonical redirect & safe HSTS');
  assert(stgNginx.includes('server_name staging.biteshark.live;')&&stgNginx.includes('proxy_pass http://127.0.0.1:4100;')&&!stgNginx.includes('includeSubDomains')&&!stgNginx.includes('preload'),'staging.biteshark.live loopback proxy & safe HSTS');
  assert(fs.existsSync(join('deploy','install-staging-release.sh')),'single-SHA staging release installer exists');
  const ciYaml=fs.readFileSync(join('.github','workflows','truckly-source-review.yml'),'utf8');
  assert(ciYaml.includes('- working/**'),'GitHub Actions workflow triggers on working/** branches');

  console.log('PASS: 59 unified Sonoma County listings, BiteShark branding & raster icons, release asset hygiene, truthful distances, safe photo defaults, JS syntax, UI flows, cross-API parity, 503 outage guards, and Owner Mode wiring');
})().catch(e=>{console.error(e);process.exitCode=1;});
