/* Small interaction refinements; no order or account data changes. */
function whereTheyAt(id){
 const place=trucks.find(t=>t.id===id);if(!place)return;
 openDetail(id);
 const section=document.querySelector('#detailContent .detail-location');
 if(!section)return;
 const label=document.createElement('span');label.className='where-label';label.textContent='WHERE THEY AT?';section.prepend(label);
 const note=document.createElement('p');note.className='where-note';
 note.textContent=place.popup||/rotating|varies|mobile schedule|service area/i.test(place.location||'')?'Rotating stop · check the vendor’s current schedule before heading out. This is not live GPS.':'Published location · confirm hours before visiting.';
 section.append(note);section.classList.add('where-highlight');
 const map=document.querySelector('#detailContent a.map-link');
 if(map)map.textContent='Get directions on Google Maps ↗';
 section.scrollIntoView({block:'center',behavior:'auto'});
}
(function(){
 const filters=document.getElementById('extraFilters');
 document.addEventListener('click',e=>{if(filters?.open&&!filters.contains(e.target))filters.open=false});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&filters?.open){filters.open=false;filters.querySelector('summary').focus()}});
 const app=document.getElementById('app');
 let focusedModal=null,returnFocus=null;
 function updateModal(){
  const modal=[...document.querySelectorAll('.modal-backdrop.show')].pop()||null;
  if(modal===focusedModal)return;
  if(modal){
   if(!focusedModal)returnFocus=document.activeElement;
   focusedModal=modal;if(app)app.inert=true;
   const target=modal.querySelector('.modal-close')||modal.querySelector('button,input,select,textarea,a[href],[tabindex]');
   const close=modal.querySelector('.modal-close');if(close&&!close.hasAttribute('aria-label'))close.setAttribute('aria-label','Close dialog');
   if(target)target.focus({preventScroll:true});
  }else{
   focusedModal=null;if(app)app.inert=false;
   if(returnFocus?.isConnected&&!returnFocus.closest('[hidden]'))returnFocus.focus({preventScroll:true});
   returnFocus=null;
  }
 }
 document.querySelectorAll('.modal-backdrop').forEach(el=>new MutationObserver(updateModal).observe(el,{attributes:true,attributeFilter:['class']}));
 document.addEventListener('keydown',e=>{
  if(e.key!=='Tab'||!focusedModal)return;
  const items=[...focusedModal.querySelectorAll('button,a[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter(el=>!el.disabled&&el.getClientRects().length);
  if(!items.length)return;
  const first=items[0],last=items[items.length-1];
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
 });
 function updateNavigation(){
  const active=document.querySelector('.screen.active')?.id;
  document.querySelectorAll('.bottom-nav [data-screen],.pager-launch,.home-button,.guides-launch').forEach(el=>{
   const name=el.dataset.screen||(el.classList.contains('pager-launch')?'pager':el.classList.contains('guides-launch')?'guides':'discover');
   if(active===name+'Screen')el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');
  });
 }
 document.querySelectorAll('.screen').forEach(el=>new MutationObserver(updateNavigation).observe(el,{attributes:true,attributeFilter:['class']}));
 updateNavigation();
})();