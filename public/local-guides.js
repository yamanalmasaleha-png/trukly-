const localGuideNotes=[
{id:'coffee-retrograde',title:'Follow the roast, not the rush.',tag:'THE COFFEE CRAFT',town:'Sebastopol',image:'/assets/retrograde-roasting.jpg',alt:'Coffee roasting equipment at Retrograde Coffee Roasters',credit:'Photo from Retrograde Coffee Roasters’ website',source:'https://retrograderoasters.com/',text:'Retrograde roasts its coffee in-house. Its Main Street café pairs specialty drinks with prepared food and indoor or outdoor seating.',detail:'Look beyond the cup: the roasting process is part of this place’s identity.',cue:'Explore the roast & café'},
{id:'farm-oakhill',title:'A grocery run with barn character.',tag:'FIELD TO TOTE',town:'Glen Ellen',image:'/assets/oak-hill-guide.jpg',alt:'A photograph from Oak Hill Farm’s Red Barn Store page',credit:'Photo: Miller Oberlin / Oak Hill Farm website',source:'https://www.oakhillfarm.net/the-red-barn-store',text:'The Red Barn Store sits in a century-old barn at Oak Hill Farm. Seasonal harvests share the shelves with pantry goods from regional producers.',detail:'What makes it different: the farm, the barn, and the produce belong to the same story.',cue:'Explore the farm stand'},
{id:'mitote',title:'One stop. A whole food-park mood.',tag:'THE GATHERING SPOT',town:'Santa Rosa',image:'/assets/mitote.jpg',alt:'An overhead view of Mitote Food Park, with food trucks and communal seating',credit:'Existing venue archive photo · Mitote Food Park',source:null,text:'A food park makes room for more than one food stop. Explore the venue listing and check the current vendor lineup before visiting.',detail:'Look for the shared tables and the setting around the food—not just the plate.',cue:'Explore Mitote'},
{id:'coffee-crooks',title:'A latte with a dessert plot twist.',tag:'THE MENU DETAIL',town:'Santa Rosa',image:null,credit:'BiteShark illustration · not a photograph of the dish',source:'https://shadyraveninc.com/menu',text:'Crooks’ menu includes a crème brûlée latte, Mexican mocha, and café con miele. It is a reminder that a small menu detail can give a coffee stop its personality.',detail:'Try a drink that catches your eye, then save your own photo and tasting note.',cue:'Explore the menu highlight'}
];
let dishDbPromise=null,dishPhotoUrls=[],dishPhotoRenderVersion=0;
function guidesEscape(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
async function openLocalGuides(tab='passport'){
 const fc=typeof window!=='undefined'&&window.bitesharkFeatures?window.bitesharkFeatures:null;
 if(fc&&fc.isHidden('local_guides_passport')){if(typeof toast==='function')toast(fc.getMessage('local_guides_passport'));return}
 showScreen('guides');document.getElementById('guidesScreen').scrollTop=0;
 try{await (window.bitesharkReady||window.trucklyReady)}catch{}
 document.getElementById('dishPhotoVendor').innerHTML=trucks.map(t=>'<option value="'+guidesEscape(t.id)+'">'+guidesEscape(t.name)+'</option>').join('');
 document.getElementById('guideStoryGrid').innerHTML=localGuideNotes.map(g=>'<article class="guide-story"><figure>'+(g.image?'<img src="'+g.image+'" alt="'+guidesEscape(g.alt)+'" loading="lazy" onerror="this.hidden=true;this.parentElement.querySelector(\'.guide-image-error\').hidden=false"><p class="guide-image-error" hidden>Photo unavailable. The guide and source are still available below.</p>':'<div class="guide-illustration">'+flavorDoodle('coffee')+'</div>')+'<figcaption>'+guidesEscape(g.credit)+'</figcaption></figure><div class="guide-story-copy"><small>'+g.tag+' · '+g.town+'</small><h2>'+g.title+'</h2><p>'+g.text+'</p><aside>'+g.detail+'</aside><div class="guide-card-actions"><button onclick="openDetail(\''+g.id+'\')">'+g.cue+' ↗</button><button onclick="openPhotoNotebook(\''+g.id+'\')">Add my dish photo</button>'+(g.source?'<a href="'+g.source+'" target="_blank" rel="noopener">Story source ↗</a>':'')+'</div></div></article>').join('');
 showGuidesTab(tab);
 if(fc)fc.syncDom();
}
function showGuidesTab(tab){
 const requested=['passport','stories','photos'].includes(tab)?tab:'passport';
 document.getElementById('guidePassportSection').hidden=requested!=='passport';document.getElementById('guideStories').hidden=requested!=='stories';document.getElementById('guidePhotoSection').hidden=requested!=='photos';
 document.querySelectorAll('[data-guide-tab]').forEach(b=>{b.classList.toggle('active',b.dataset.guideTab===requested);b.setAttribute('aria-pressed',String(b.dataset.guideTab===requested))});
 if(requested==='photos')renderDishPhotos();if(requested==='passport')renderGuidePassport();
}
async function openPhotoNotebook(id){await openLocalGuides();showGuidesTab('photos');if(id)document.getElementById('dishPhotoVendor').value=id;document.getElementById('dishPhotoCaption').focus()}
function dishDb(){
 if(!dishDbPromise)dishDbPromise=new Promise((resolve,reject)=>{if(!window.indexedDB){reject(new Error('Photo storage is unavailable in this browser.'));return}const r=indexedDB.open('truckly-dish-notebook-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('photos',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(new Error('Photo storage could not open. Check this browser’s storage settings.'))});
 return dishDbPromise;
}
async function dishRead(){const db=await dishDb();return new Promise((resolve,reject)=>{const r=db.transaction('photos','readonly').objectStore('photos').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(new Error('Could not read your saved photos.'))})}
async function dishWrite(action,value){const db=await dishDb();return new Promise((resolve,reject)=>{const tx=db.transaction('photos','readwrite');const s=tx.objectStore('photos');action==='add'?s.add(value):s.delete(value);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(new Error('Could not save this change. Browser storage may be full.'));tx.onabort=()=>reject(new Error('The photo change did not save. Please try again.'))})}
async function saveDishPhoto(e){
 e.preventDefault();const fc=typeof window!=='undefined'&&window.bitesharkFeatures?window.bitesharkFeatures:null;
 if(fc&&!fc.isAvailable('local_guides_passport')){document.getElementById('dishPhotoMessage').textContent=fc.getMessage('local_guides_passport');fc.syncDom();return}
 const button=document.getElementById('dishPhotoSave'),message=document.getElementById('dishPhotoMessage');button.disabled=true;message.textContent='Saving your food memory…';
 try{const file=document.getElementById('dishPhotoFile').files[0],caption=document.getElementById('dishPhotoCaption').value.trim(),id=document.getElementById('dishPhotoVendor').value;const vendor=trucks.find(t=>t.id===id);
 if(!vendor||!caption)throw new Error('Choose a place and add a short dish note.');if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Choose a JPEG, PNG, or WebP photo.');if(file.size>5*1024*1024)throw new Error('Choose a photo smaller than 5 MB.');if((await dishRead()).length>=12)throw new Error('Your notebook has 12 photos. Remove one before adding another.');
 const probeUrl=URL.createObjectURL(file);try{const image=new Image();image.src=probeUrl;await image.decode()}catch{throw new Error('That file could not be read as a photo. Please choose another.')}finally{URL.revokeObjectURL(probeUrl)}
 await dishWrite('add',{id:crypto.randomUUID(),vendorId:id,vendorName:vendor.name,caption:caption.slice(0,160),file,created:new Date().toISOString()});
 e.target.reset();await renderDishPhotos();message.textContent='Saved on this device. A delicious memory for later.';
 }catch(err){message.textContent=err.message||'Your photo did not save. Please try again.'}finally{button.disabled=false}
}
async function renderDishPhotos(){
 const version=++dishPhotoRenderVersion,grid=document.getElementById('dishPhotoGrid');
 try{const rows=await dishRead();if(version!==dishPhotoRenderVersion)return;dishPhotoUrls.forEach(URL.revokeObjectURL);dishPhotoUrls=[];
 grid.innerHTML=rows.length?rows.sort((a,b)=>b.created.localeCompare(a.created)).map(p=>{const url=URL.createObjectURL(p.file);dishPhotoUrls.push(url);return '<article class="dish-photo"><img src="'+url+'" alt="'+guidesEscape(p.caption)+'"><div><small>MY PHOTO · SAVED ON THIS DEVICE</small><h3>'+guidesEscape(p.vendorName)+'</h3><p>'+guidesEscape(p.caption)+'</p><button onclick="openDetail(\''+guidesEscape(p.vendorId)+'\')">View place</button><button onclick="removeDishPhoto(\''+p.id+'\')">Remove photo</button></div></article>'}).join(''):'<div class="dish-empty"><span>'+flavorDoodle('spark')+'</span><h3>Your next favorite bite goes here.</h3><p>No photos saved yet. Add your own dish photo and a little note above.</p></div>';
 }catch(e){grid.innerHTML='';document.getElementById('dishPhotoMessage').textContent=e.message}
}
async function removeDishPhoto(id){try{await dishWrite('delete',id);await renderDishPhotos();document.getElementById('dishPhotoMessage').textContent='Photo removed from this device.'}catch(e){document.getElementById('dishPhotoMessage').textContent=e.message}}
document.querySelectorAll('#guidesScreen [data-truck-character]').forEach(el=>el.innerHTML=truckCharacter(el.dataset.truckCharacter));
document.querySelectorAll('.guides-launch [data-doodle],.guides-sticker [data-doodle]').forEach(el=>el.innerHTML=flavorDoodle(el.dataset.doodle));