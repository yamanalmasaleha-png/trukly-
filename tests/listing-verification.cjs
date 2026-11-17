// Run from the repository root: node tests/listing-verification.cjs
// Node built-ins only; no runtime dependencies and no writes to the app.
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const {join}=require('node:path');

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
  // 1. Primary API & static source checks
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
  const debugAdmin=fs.readFileSync(join('public','debug-admin.js'),'utf8');
  const html=fs.readFileSync(join('public','index.html'),'utf8');
  const loginHtml=fs.readFileSync(join('public','login.html'),'utf8');
  new Function(app);new Function(highlight);new Function(debugAdmin);
  assert(html.includes('/listing-highlights.js'),'listing visual enhancement is actually loaded');
  assert(html.includes('/debug-admin.js')&&html.includes('/debug-admin.css'),'admin/debug workbench assets wired');
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
    nearbyCount:makeEl('nearbyCount'),
    openHoursNote:makeEl('openHoursNote',{hidden:true}),
    mapEmpty:makeEl('mapEmpty',{hidden:true}),
    truckSheet:makeEl('truckSheet'),
    truckCards:makeEl('truckCards'),
    favoriteGrid:makeEl('favoriteGrid'),
    bookingList:makeEl('bookingList'),
    ownerLocation:makeEl('ownerLocation',{value:'Ross Street'}),
    ownerPhotoGrid:makeEl('ownerPhotoGrid'),
    ownerRequests:makeEl('ownerRequests'),
    ownerRequestCount:makeEl('ownerRequestCount'),
    detailModal:makeEl('detailModal'),
    detailContent:makeEl('detailContent'),
    bookingModal:makeEl('bookingModal'),
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
    ownerTruckSelect:makeEl('ownerTruckSelect',{value:'owner-truck'}),
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
    if(url==='/api/trucks')return {ok:true,status:200,json:async()=>({trucks:catalogSample})};
    if(url.startsWith('/api/trucks/nearby'))return {ok:true,status:200,json:async()=>({nearest_hubs:[{city:'Petaluma',distance_miles:0.1}]})};
    return {ok:false,status:401,json:async()=>({error:'Unauthorized'})};
  };

  const sandbox={
    window:{innerWidth:390,addEventListener(){}},
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
  sandbox.window.__HATCHABLE__=undefined;
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
  assert(elements.truckCards.innerHTML.includes('truckly-spotlight'),'listing-highlights wrapped cardHTML before render');

  // When 0 trucks are open, Map mode displays visible empty banner
  vm.runInContext('trucks.forEach(t => { t.open = false; }); applyFilters();',sandbox);
  assert.equal(elements.mapEmpty.hidden,false,'map empty banner visible when 0 places open');
  assert(elements.mapEmpty.innerHTML.includes('Turn off Open now'),'map empty banner offers one-tap reset');
  sandbox.toggleOpen(); // turn Open Now back off
  assert.equal(elements.mapEmpty.hidden,true);

  // Test Fix 3: Geolocation recalculates real distances and sorts nearest first
  sandbox.locateMe();
  await new Promise(r=>setImmediate(r));
  const nearestFirst=vm.runInContext('filtered()[0]',sandbox);
  assert.equal(nearestFirst.id,'elroys-pet-1','Petaluma truck is nearest when located in Petaluma');
  assert.equal(nearestFirst.distance,0,'Haversine distance recalculated to 0.0 mi');
  assert.equal(elements.locationLabel.textContent,'Near Petaluma','location pill updated to nearest Sonoma hub');
  assert.deepEqual([...mapFlownTo],[38.2437,-122.6269],'map flew to user coordinates');

  // Test Fix 1: Booking client-side package limit validation & server 400 error handling
  let createCalls=0;
  fetchHandler=async(url)=>{
    if(url==='/api/bookings/create'){
      createCalls++;
      return {ok:false,status:400,json:async()=>({error:'Server rejected booking'})};
    }
    return {ok:false,status:401,json:async()=>({})};
  };
  elements.guestCount.value='80'; // exceeds dropin max 50
  sandbox.openBooking('mitote');
  await sandbox.submitBooking({preventDefault(){},target:{reset(){}}});
  assert.equal(createCalls,0,'invalid package guest count blocked before network call');
  assert.equal(elements.bookingError.hidden,false,'inline booking error shown');
  assert(elements.bookingError.textContent.includes('up to 50 guests'));
  assert.equal(vm.runInContext('bookings.length',sandbox),0,'rejected booking not saved');

  // Switch to party (max 100), test server 400 error is NOT swallowed
  activePackageRadio={value:'party',dataset:{price:'1500',max:'100',name:'Party Favorite'}};
  await sandbox.submitBooking({preventDefault(){},target:{reset(){}}});
  assert.equal(createCalls,1,'valid client payload sent to server');
  assert.equal(elements.bookingError.textContent,'Server rejected booking','server 400 error surfaced in modal');
  assert.equal(vm.runInContext('bookings.length',sandbox),0,'server-rejected booking not saved to localStorage');
  assert.equal(elements.bookingModal.classList.contains('show'),true,'modal stays open on server error so user can fix input');

  // Server 201 success path
  fetchHandler=async(url)=>{
    if(url==='/api/bookings/create'){
      return {ok:true,status:201,json:async()=>({id:'uuid-booking-1',status:'pending',package_name:'Party Favorite',package_price:1500,created_at:'2026-11-16T18:00:00Z'})};
    }
    return {ok:false,status:401,json:async()=>({})};
  };
  await sandbox.submitBooking({preventDefault(){},target:{reset(){elements.eventDate.value='';}}});
  assert.equal(vm.runInContext('bookings.length',sandbox),1,'confirmed booking saved');
  assert.equal(elements.bookingModal.classList.contains('show'),false,'modal closed on 201');
  assert(/^\d{4}-\d{2}-\d{2}$/.test(elements.eventDate.value),'default event date restored after form reset');

  // Test Fix 4: Hybrid signed-in sync (favorites, ISO-timestamp bookings, notification settings, XSS escaping)
  sandbox.window.__HATCHABLE__={user:{email:'maya@sonoma.example'}};
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
  function loadHandler(relPath,mockDb=null){
    const raw=fs.readFileSync(relPath,'utf8');
    const body=raw
      .replace(/import\s+\{[^}]*\}\s+from\s+['"]hatchable['"];?/g,'')
      .replace(/export\s+const\s+(?:access|methods)\s*=\s*[^;]+;?/g,'')
      .replace(/export\s+default\s+async\s+function\s*\(/,'return async function(');
    return new Function('db',body)(mockDb);
  }
  async function invoke(fn,req={}){
    let code=200,payload=null;
    const res={
      setHeader(){},
      status(c){code=c;return this;},
      json(p){payload=p;return this;}
    };
    await fn({query:{},params:{},body:{},method:'GET',...req},res);
    return {status:code,body:payload};
  }

  // Ensure exact 27 Hatchable server function files (20 base + 3 pager + 4 community) and no legacy Austin strings
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
  assert.equal(apiFiles.length,27,'preserves all 27 v77 Hatchable function routes');
  for(const f of apiFiles){
    const txt=fs.readFileSync(f,'utf8');
    assert(!txt.includes('Mueller Lake Park')&&!txt.includes("'estrella'"),'no legacy Austin defaults in '+f);
    assert(!txt.includes('665 Sebastopol Rd'),'no outdated Mitote address in '+f);
    assert(!txt.includes('"2026-09-07"'),'no expired hardcoded Sep 2026 Ross schedule in '+f);
  }

  // 3a. api/trucks/[id].js parity with all 47 listings in api/trucks.js
  const detailFn=loadHandler(join('api','trucks','[id].js'));
  for(const t of result.trucks){
    const r=await invoke(detailFn,{params:{id:t.id}});
    assert.equal(r.status,200,'detail found for '+t.id);
    assert.equal(r.body.name,t.name,'detail name matches for '+t.id);
    assert.equal(r.body.location,t.location,'detail location matches for '+t.id);
    assert.equal(r.body.city,t.city,'detail city matches for '+t.id);
    assert.equal(r.body.cuisine,t.cuisine,'detail cuisine matches for '+t.id);
    assert.equal(r.body.type,t.listing_type,'detail type matches for '+t.id);
    assert.equal(r.body.verified,false,'detail verified flag matches audit baseline');
  }
  const missingDetail=await invoke(detailFn,{params:{id:'nonexistent-truck'}});
  assert.equal(missingDetail.status,404,'unknown truck returns 404');

  // 3b. api/trucks/search.js parity + accent-insensitive search
  const searchFn=loadHandler(join('api','trucks','search.js'));
  const allSearch=await invoke(searchFn,{query:{limit:'50'}});
  assert.equal(allSearch.body.total,47,'search indexes all 47 primary listings');
  assert.equal(allSearch.body.results.length,47,'search limit=50 returns all 47 listings');
  assert.deepEqual(allSearch.body.results.map(x=>x.id),result.trucks.map(x=>x.id),'search order & IDs match catalog');
  const accentSearch=await invoke(searchFn,{query:{q:'iniguez'}});
  assert.equal(accentSearch.body.results[0]?.id,'iniguez','accent-folded search finds Tacos Iñiguez');
  const marketSearch=await invoke(searchFn,{query:{q:'markets',limit:'50'}});
  assert.equal(marketSearch.body.total,10,'tag search finds all 10 market stalls');

  // 3c. api/catalog/cuisines.js, featured.js, cities.js & nearby.js parity
  const cuisinesRes=await invoke(loadHandler(join('api','catalog','cuisines.js')));
  assert.deepEqual(cuisinesRes.body.cuisines.map(c=>c.id),result.sections,'cuisines metadata includes all 6 catalog sections including Markets');
  const featuredRes=await invoke(loadHandler(join('api','catalog','featured.js')));
  assert(featuredRes.body.featured_ids.every(id=>byId[id]),'all featured IDs exist in primary catalog');
  const citiesRes=await invoke(loadHandler(join('api','catalog','cities.js')));
  const nearbyRes=await invoke(loadHandler(join('api','trucks','nearby.js')),{query:{lat:'38.4405',lng:'-122.7144'}});
  assert.deepEqual(new Set(citiesRes.body.cities.map(c=>c.name)),new Set(nearbyRes.body.nearest_hubs.map(h=>h.city)),'cities and nearby hubs match');

  // 3d. api/schedule/today.js reads owner_schedule and validates date param
  const scheduleFn=loadHandler(join('api','schedule','today.js'),{
    async query(sql,params){
      assert(sql.includes('FROM owner_schedule'));
      return {rows:[{truck_id:'dinos',vendor:"Dino's Greek Food",location:'Courthouse Square, Santa Rosa',opens_at:'11:00:00',closes_at:'14:30:00',status:'scheduled'}]};
    }
  });
  const badDate=await invoke(scheduleFn,{query:{date:'09/17/2026'}});
  assert.equal(badDate.status,400,'invalid date rejected on schedule/today');
  const goodSchedule=await invoke(scheduleFn,{query:{date:'2026-11-16'}});
  assert.equal(goodSchedule.status,200);
  assert.equal(goodSchedule.body.events.length,1);
  assert.equal(goodSchedule.body.events[0].opens,'11:00');
  assert.equal(goodSchedule.body.events[0].closes,'14:30');

  // 3e. api/owner/location.js Sonoma defaults & api/owner/requests.js UUID validation
  let capturedTruckId=null;
  const ownerLocFn=loadHandler(join('api','owner','location.js'),{
    async query(sql,params){
      capturedTruckId=params[0];
      if(sql.startsWith('SELECT'))return {rows:[]};
      return {rows:[{truck_id:params[0],location:params[1],is_open:true}]};
    }
  });
  const defaultLoc=await invoke(ownerLocFn,{method:'GET',query:{truck_id:'estrella'}});
  assert.equal(capturedTruckId,'owner-truck','legacy estrella normalized to owner-truck');
  assert.equal(defaultLoc.body.location,'Ross Street, Downtown Santa Rosa','Sonoma fallback location returned');
  assert.equal(defaultLoc.body.is_open,false,'unconfigured owner truck defaults to is_open: false');

  let dbUpdated=false;
  const ownerReqFn=loadHandler(join('api','owner','requests.js'),{
    async query(){dbUpdated=true;return {rows:[{id:'00000000-0000-4000-8000-000000000001',status:'accepted'}]};}
  });
  const demoIdRes=await invoke(ownerReqFn,{method:'POST',body:{id:'1',status:'accepted'}});
  assert.equal(demoIdRes.status,400,'non-UUID booking ID rejected cleanly before SQL cast');
  assert.equal(dbUpdated,false);
  const validUuidRes=await invoke(ownerReqFn,{method:'POST',body:{id:'00000000-0000-4000-8000-000000000001',status:'accepted'}});
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

  // 4c. Owner Mode — Live Admin Mode (real stats, empty pending inbox without fake rows, schedule & profile save)
  let savedSchedulePayload=null,savedProfilePayload=null;
  fetchHandler=async(url,opts={})=>{
    if(url==='/api/owner/stats')return {ok:true,status:200,json:async()=>({total_requests:14,pending:0,accepted:11})};
    if(url.startsWith('/api/owner/profile')&&(!opts.method||opts.method==='GET'))return {ok:true,status:200,json:async()=>({truck_id:'owner-truck',display_name:'Sonoma Fuego',cuisine:'Mexican',description:'Wood-fired tacos',accepting_bookings:true})};
    if(url==='/api/owner/profile'&&opts.method==='POST'){savedProfilePayload=JSON.parse(opts.body);return {ok:true,status:200,json:async()=>savedProfilePayload};}
    if(url.startsWith('/api/owner/location'))return {ok:true,status:200,json:async()=>({truck_id:'owner-truck',location:'Courthouse Square, Santa Rosa',is_open:true,opens_at:'11:30:00',closes_at:'19:30:00'})};
    if(url.startsWith('/api/owner/schedule')&&(!opts.method||opts.method==='GET'))return {ok:true,status:200,json:async()=>({schedule:[]})};
    if(url==='/api/owner/schedule'&&opts.method==='POST'){savedSchedulePayload=JSON.parse(opts.body);return {ok:true,status:200,json:async()=>savedSchedulePayload};}
    if(url==='/api/owner/requests')return {ok:true,status:200,json:async()=>({requests:[]})};
    return {ok:true,status:200,json:async()=>({})};
  };
  await vm.runInContext('loadOwnerDashboard()',sandbox);
  assert.equal(elements.ownerModeBanner.hidden,true,'Preview Mode banner hidden for authenticated admin');
  assert.equal(elements.statTotalRequests.textContent,'14');
  assert.equal(elements.statAcceptedRequests.textContent,'11');
  assert.equal(elements.ownerTitle.textContent,'Sonoma Fuego');
  assert(elements.ownerRequests.innerHTML.includes('No pending booking requests right now.'),'real admin empty inbox does not inject fake demo rows');

  elements.ownerScheduleDate.value='2026-11-20';
  elements.ownerOpensAt.value='11:30';
  elements.ownerClosesAt.value='19:30';
  elements.ownerIsOpen.checked=false;
  await sandbox.saveOwnerSchedule();
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
  const ownerSchedApi=loadHandler(join('api','owner','schedule.js'),{
    async query(sql,params){return {rows:[{truck_id:params[0]||'dinos',service_date:params[1]||'2026-11-20',status:'scheduled'}]};}
  });
  const badSchedRes=await invoke(ownerSchedApi,{method:'POST',body:{truck_id:'dinos',service_date:'bad-date'}});
  assert.equal(badSchedRes.status,400,'owner/schedule rejects malformed date');
  const goodSchedRes=await invoke(ownerSchedApi,{method:'POST',body:{truck_id:'dinos',service_date:'2026-11-20',opens_at:'11:00',closes_at:'15:00'}});
  assert.equal(goodSchedRes.status,200);

  const ownerBookingsApi=loadHandler(join('api','owner','bookings.js'),{
    async query(sql,params){assert(sql.includes('LIMIT 100'));return {rows:[{id:'b1',status:params?.[0]||'accepted'}]};}
  });
  const filteredBookingsRes=await invoke(ownerBookingsApi,{query:{status:'accepted'}});
  assert.equal(filteredBookingsRes.body.bookings[0].status,'accepted');

  console.log('PASS: 47 primary listings, addresses, category matching, safe photo defaults, JS syntax, UI flows, cross-API parity, and Owner Mode wiring');
})().catch(e=>{console.error(e);process.exitCode=1;});
