/* Community hub: approved posts only, user contributions submitted for moderation. */
const communityState={posts:[],filter:'all',town:'all',sort:'recent',search:'',loaded:false,myOpen:false};
function communityEscape(value){return String(value==null?'':value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function communityDate(value){
  const d=new Date(value);
  return Number.isNaN(d.getTime())?'Recently':d.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
}
function communityGetPlaces(){
  if(typeof guidePlaces==='function')return guidePlaces();
  return Array.isArray(trucks)?trucks.filter(t=>t&&t.id&&t.city).slice().sort((a,b)=>String(a.name).localeCompare(String(b.name))):[];
}
async function openCommunity(){
  const fc=typeof window!=='undefined'&&window.bitesharkFeatures?window.bitesharkFeatures:null;
  if(fc&&fc.isHidden('community_hub')){
    if(typeof toast==='function')toast(fc.getMessage('community_hub'));
    return;
  }
  showScreen('community');
  document.getElementById('communityScreen').scrollTop=0;
  if(fc)fc.syncDom();
  const grid=document.getElementById('communityFeed');
  if(!communityState.loaded)grid.innerHTML='<div class="community-empty">Loading local conversations…</div>';
  try{await (window.bitesharkReady||window.trucklyReady)}catch(e){}
  const places=communityGetPlaces();
  const select=document.getElementById('communityPlace');
  const selected=select.value;
  select.innerHTML='<option value="">Choose a local place</option>'+places.map(t=>'<option value="'+communityEscape(t.id)+'">'+communityEscape(t.name)+' · '+communityEscape(t.city)+'</option>').join('');
  if(places.some(p=>p.id===selected))select.value=selected;
  await communityLoad();
}
async function communityLoad(){
  const feed=document.getElementById('communityFeed');
  try{
    const response=await fetch('/api/community/list',{credentials:'same-origin'});
    if(!response.ok)throw new Error('The community feed is unavailable right now.');
    const data=await response.json();
    communityState.posts=Array.isArray(data.posts)?data.posts:[];
    communityState.loaded=true;
    communityRender();
  }catch(error){feed.innerHTML='<div class="community-empty">'+communityEscape(error.message)+' <button type="button" onclick="communityLoad()">Try again</button></div>';}
}
function communitySetFilter(kind){
  communityState.filter=kind;
  document.querySelectorAll('[data-community-filter]').forEach(b=>{
    const active=b.dataset.communityFilter===kind;
    b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));
  });
  communityRender();
}
function communityRender(){
  const posts=communityState.posts.slice();
  const towns=[...new Set(posts.map(p=>p.town).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  const townSelect=document.getElementById('communityTownFilter');
  const current=communityState.town;
  townSelect.innerHTML='<option value="all">All towns</option>'+towns.map(t=>'<option value="'+communityEscape(t)+'">'+communityEscape(t)+'</option>').join('');
  if(towns.includes(current))townSelect.value=current;else{communityState.town='all';townSelect.value='all';}
  const matching=posts.filter(p=>
    (communityState.filter==='all'||p.kind===communityState.filter)&&
    (communityState.town==='all'||p.town===communityState.town)&&
    (!communityState.search||[p.place_name,p.town,p.title,p.body,p.nickname].join(' ').toLowerCase().includes(communityState.search))
  ).sort((a,b)=>{
    if(communityState.sort==='top')return (Number(b.rating)||0)-(Number(a.rating)||0)||new Date(b.created_at)-new Date(a.created_at);
    return new Date(b.created_at)-new Date(a.created_at);
  });
  document.getElementById('communityCount').textContent=matching.length+' '+(matching.length===1?'post':'posts');
  const feed=document.getElementById('communityFeed');
  if(!matching.length){
    const fc=typeof window!=='undefined'&&window.bitesharkFeatures?window.bitesharkFeatures:null;
    const canWrite=!fc||fc.isAvailable('community_submissions');
    feed.innerHTML='<div class="community-empty"><span aria-hidden="true">📝</span><h3>No public posts here yet.</h3><p>'+(canWrite?'Be among the first to share a real food find. New contributions appear after moderation.':'Approved community submissions appear here once published.')+'</p>'+(canWrite?'<button type="button" onclick="communityStartPost(\'review\')">Write a review</button>':'')+'</div>';
    return;
  }
  feed.innerHTML=matching.map(p=>{
    const kindName={review:'Review',tip:'Local tip',question:'Question',whisper:'Street whisper · Unverified'}[p.kind]||'Post';
    const rating=p.kind==='review'&&Number.isInteger(Number(p.rating))?'<span class="community-stars" aria-label="'+Number(p.rating)+' out of 5 stars">'+('★'.repeat(Math.min(5,Number(p.rating))))+('☆'.repeat(Math.max(0,5-Number(p.rating))))+'</span>':'';
    return '<article class="community-post">'+
      '<div class="community-post-head"><span class="community-kind">'+communityEscape(kindName)+'</span><time datetime="'+communityEscape(p.created_at)+'">'+communityDate(p.created_at)+'</time></div>'+
      '<h3>'+communityEscape(p.title)+'</h3><p class="community-post-about">'+communityEscape(p.place_name)+' · '+communityEscape(p.town)+'</p>'+
      rating+(p.kind==='whisper'?'<p class="community-whisper-note">🕵️ Unverified food tip · Community-submitted, not independently confirmed. Check directly with the business.</p>':'')+'<p class="community-post-body">'+communityEscape(p.body)+'</p>'+
      '<div class="community-post-foot"><span>By '+communityEscape(p.nickname||'Local food fan')+' · Community submission</span>'+
      '<div style="display:flex;gap:8px;align-items:center"><button type="button" class="community-report-btn" data-community-report="'+communityEscape(p.id)+'">🚩 Report</button><button type="button" data-community-place="'+communityEscape(p.place_id)+'">View place ↗</button></div></div></article>';
  }).join('');
  feed.querySelectorAll('[data-community-place]').forEach(b=>b.addEventListener('click',()=>communityViewPlace(b.dataset.communityPlace)));
  feed.querySelectorAll('[data-community-report]').forEach(b=>b.addEventListener('click',()=>{if(typeof window.bitesharkOpenCommunityReport==='function')window.bitesharkOpenCommunityReport(b.dataset.communityReport);}));
}
function communityViewPlace(id){
  const t=communityGetPlaces().find(t=>t.id===id);
  if(!t){document.getElementById('communityActionMessage').textContent='This place is not in the current local catalog.';return;}
  showScreen('discover');openDetail(id);
}
function communityStartPost(kind='review',title=''){
  const fc=typeof window!=='undefined'&&window.bitesharkFeatures?window.bitesharkFeatures:null;
  if(fc&&!fc.isAvailable('community_submissions')){
    if(typeof toast==='function')toast(fc.getMessage('community_submissions'));
    fc.syncDom();
    return;
  }
  const form=document.getElementById('communityCompose');
  form.hidden=false;
  document.getElementById('communitySuccess').hidden=true;
  const select=document.getElementById('communityKind');
  select.value=kind;
  communityKindChange();
  document.getElementById('communityTitle').value=title||'';
  form.scrollIntoView({block:'start',behavior:'smooth'});
}
function communityClosePost(){
  const form=document.getElementById('communityCompose');form.hidden=true;
  document.getElementById('communityActionMessage').textContent='';
}
function communityKindChange(){
  const row=document.getElementById('communityRatingRow');
  const kind=document.getElementById('communityKind').value;
  row.hidden=kind!=='review';
  document.getElementById('communityRating').required=kind==='review';
  const label=document.getElementById('communitySubmit');
  label.textContent=kind==='review'?'Submit review for approval':kind==='tip'?'Submit local tip for approval':kind==='whisper'?'Submit unverified whisper for approval':'Submit question for approval';
}
async function communitySubmitPost(e){
  e.preventDefault();
  const button=document.getElementById('communitySubmit'),status=document.getElementById('communityActionMessage');
  const placeId=document.getElementById('communityPlace').value;
  const place=communityGetPlaces().find(p=>p.id===placeId);
  if(!place){status.textContent='Choose a place from the list.';return}
  const kind=document.getElementById('communityKind').value;
  const post={
    kind:kind,place_id:placeId,place_name:place.name,town:place.city,
    nickname:document.getElementById('communityNickname').value.trim()||'Local food fan',
    title:document.getElementById('communityTitle').value.trim(),
    body:document.getElementById('communityBody').value.trim(),
    rating:kind==='review'?Number(document.getElementById('communityRating').value):null
  };
  if(post.title.length<5||post.body.length<20){status.textContent='Use a title of at least 5 characters and at least 20 characters for your post.';return}
  button.disabled=true;status.textContent='Submitting for review…';
  try{
    const response=await fetch('/api/community/post',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(post)});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||'Could not submit. You may need to sign in first.');
    document.getElementById('communityPostForm').reset();communityKindChange();
    communityClosePost();
    const success=document.getElementById('communitySuccess');
    success.hidden=false;success.textContent='Your post was submitted for moderation. It is not public yet.';
    communityState.myOpen=true;await communityLoadMy();
  }catch(error){status.textContent=error.message}
  finally{button.disabled=false}
}
async function communityLoadMy(){
  const panel=document.getElementById('communityMyPosts');
  panel.hidden=false;
  panel.innerHTML='<p>Loading your contributions…</p>';
  try{
    const response=await fetch('/api/community/mine',{credentials:'same-origin'});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||'Sign in to see your contributions.');
    const items=Array.isArray(data.submissions)?data.submissions:[];
    panel.innerHTML=items.length?'<h3>My contributions</h3><div class="community-my-list">'+items.map(p=>
      '<div><strong>'+communityEscape(p.title)+'</strong><small>'+communityEscape(p.place_name)+' · '+communityDate(p.created_at)+'</small>'+
      '<span class="community-status">'+communityEscape(p.status)+'</span></div>').join('')+'</div>':
      '<p>You have not submitted anything yet.</p>';
  }catch(error){panel.innerHTML='<p>'+communityEscape(error.message)+'</p>';}
}
function communityToggleMy(){
  communityState.myOpen=!communityState.myOpen;
  if(communityState.myOpen)communityLoadMy();
  else document.getElementById('communityMyPosts').hidden=true;
}
async function communityReviewPlace(id){
  if(typeof closeModal==="function")closeModal();
  await openCommunity();
  communityStartPost("review");
  const select=document.getElementById("communityPlace");
  if(Array.from(select.options).some(o=>o.value===id))select.value=id;
}
async function communityOpenModeration(){
  showScreen('owner');
  const panel=document.getElementById('communityModeration');
  panel.hidden=false;panel.innerHTML='<p>Loading the moderation queue…</p>';
  try{
    const response=await fetch('/api/community/moderate',{credentials:'same-origin'});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||'Only the project administrator can moderate posts.');
    const items=Array.isArray(data.pending)?data.pending:[];
    panel.innerHTML=items.length?items.map(p=>'<article class="community-queue-item" data-moderate-id="'+communityEscape(p.id)+'">'+
      '<small>'+communityEscape(p.kind)+' · '+communityEscape(p.place_name)+' · '+communityEscape(p.town)+'</small>'+
      '<h3>'+communityEscape(p.title)+'</h3><p>'+communityEscape(p.body)+'</p><small>By '+communityEscape(p.nickname)+
      (p.rating?' · '+Number(p.rating)+'/5 stars':'')+'</small>'+
      '<div><button type="button" data-decision="approved">Approve</button> <button type="button" data-decision="rejected">Reject</button></div></article>').join(''):
      '<p>Nothing is awaiting review.</p>';
    panel.querySelectorAll('[data-moderate-id]').forEach(row=>{
      row.querySelectorAll('[data-decision]').forEach(b=>b.addEventListener('click',()=>communityModerate(row.dataset.moderateId,b.dataset.decision)));
    });
  }catch(error){panel.innerHTML='<p>'+communityEscape(error.message)+'</p>';}
}
async function communityModerate(id,status){
  const panel=document.getElementById('communityModeration');
  const buttons=panel.querySelectorAll('button');buttons.forEach(b=>b.disabled=true);
  try{
    const response=await fetch('/api/community/moderate',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,status})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||'Could not update the post.');
    await communityOpenModeration();
  }catch(error){
    panel.insertAdjacentHTML('afterbegin','<p role="alert">'+communityEscape(error.message)+'</p>');
    buttons.forEach(b=>b.disabled=false);
  }
}