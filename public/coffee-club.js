function flavorDoodle(name){
 const shapes={hotdog:'<path d="M7 31 29 9q10-5 13 6L20 39Q8 45 7 31" fill="#efca86"/><path d="m13 31 19-20q9-1 7 7L20 38q-9 2-7-7" fill="#c96a4a"/><path d="m17 30 3-7 7-1 1-7 5-1" fill="none" stroke="#f4d36b" stroke-width="3"/>',
 coffee:'<path d="M10 18h24v13q-1 10-12 10T10 31z" fill="#f9e5b7"/><path d="M34 21h4q10 9-4 13" fill="#e7b987"/><path d="M16 12q-4-4 0-8m10 8q-4-4 0-8M8 43h30" fill="none"/><circle cx="18" cy="28" r="1.5" fill="#214b3b"/><circle cx="26" cy="28" r="1.5" fill="#214b3b"/><path d="M19 33q3 3 6 0" fill="none"/>',
 basket:'<path d="m6 23 5 19h27l5-19z" fill="#edcc82"/><path d="m13 23 9-16m13 16L26 7M16 28v8m8-8v8m8-8v8" fill="none"/><path d="m7 21 8-8 6 8m7 0 6-10 7 10" fill="#b8d09b"/>',
 carrot:'<path d="M18 17c15-8 22 2 14 12L10 43z" fill="#e89a67"/><path d="m27 14 1-10q12 0 9 11l8-6q5 10-9 13M19 25l5 4m-10 3 4 3" fill="#b8d09b"/>',
 tent:'<path d="M5 23 24 5l19 18v19H5z" fill="#efd49b"/><path d="m24 5 8 18H16z" fill="#d86f50"/><path d="M4 23h40M17 42l7-16 7 16M24 5V1" fill="none"/>',
 bowl:'<path d="M5 24h38q-2 17-19 17T5 24" fill="#eeb29c"/><path d="M9 19q8-16 16 0m-3 0q7-15 16 0M18 9V4m9 5V3" fill="#c3d5a4"/><path d="M12 44h24" fill="none"/>',
 taco:'<path d="M5 36q0-35 37-10l1 10z" fill="#b6cb93"/><path d="M5 36q7-31 38 0z" fill="#efc76b"/><path d="m14 27 3-3m6 4 3-2m6 6 3-1" fill="none"/>',
 burger:'<path d="M5 20q0-17 19-17t19 17z" fill="#ecc471"/><path d="M6 26h36M8 31h32" stroke-width="5"/><path d="M5 36h38q0 9-19 9T5 36" fill="#ecc471"/><path d="m10 23 8 6 7-6 8 6 7-6" fill="#b5cb8b"/>',
 sweet:'<path d="m15 27 9 18 10-18" fill="#e3b47d"/><path d="M10 25q-6-11 4-14 0-13 11-9 9 0 9 10 11 4 4 13z" fill="#efbed0"/><circle cx="24" cy="4" r="3" fill="#bb5743"/>',
 heart:'<path d="M24 41 7 25C-6 8 15-2 24 13 34-2 54 9 41 25z" fill="#e6a69c"/>',
 pin:'<path d="M39 19c0 12-15 25-15 25S9 31 9 19a15 15 0 0 1 30 0" fill="#bdd2ac"/><circle cx="24" cy="19" r="6" fill="#fff6e1"/>',
 calendar:'<rect x="5" y="10" width="38" height="34" rx="7" fill="#c9d9cf"/><path d="M5 21h38M15 5v10m18-10v10m-20 13h6m8 0h6m-20 8h6" fill="none"/><path d="m28 36 3 3 6-7" fill="none"/>',
 dice:'<rect x="6" y="6" width="36" height="36" rx="9" fill="#e3c5a0"/><g fill="#214b3b"><circle cx="16" cy="16" r="2"/><circle cx="32" cy="16" r="2"/><circle cx="24" cy="24" r="2"/><circle cx="16" cy="32" r="2"/><circle cx="32" cy="32" r="2"/></g>',
 paper:'<path d="M7 5h31v32q0 7-7 7H11q-7 0-7-7V15h3z" fill="#f3dfad"/><path d="M14 13h17M14 20h17M14 28h7m6 0h4m-17 7h17M38 15h6v22q0 7-7 7" fill="none"/>',
 spark:'<path d="m24 3 6 15 15 6-15 6-6 15-6-15-15-6 15-6z" fill="#f3d28c"/>',
 trail:'<path d="m3 10 14-5 15 5 13-5v33l-13 5-15-5-14 5z" fill="#d6dfbb"/><path d="M17 5v33m15-28v33M10 23q9-14 15 1t13-4" fill="none" stroke-dasharray="3 4"/>',
 party:'<path d="m7 43 8-29 21 20z" fill="#e7aa8c"/><path d="m14 20 14 14m-18-3 9 8M26 5q-7 8 3 12m11-8-6 9m9 5-7 2" fill="none"/><circle cx="17" cy="6" r="2" fill="#214b3b"/>'
 };
 if(name==='truck')return truckCharacter('taco');
 return '<svg class="flavor-doodle" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><g stroke="#214b3b" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">'+(shapes[name]||shapes.spark)+'</g></svg>';
}
function paintFlavorIcons(){
 document.querySelectorAll('[data-doodle]').forEach(el=>el.innerHTML=flavorDoodle(el.dataset.doodle));
 const kinds={All:'bowl','Pop-ups':'tent',Markets:'basket','Food Trucks':'truck','Farm Stands':'carrot',Coffee:'coffee'};
 document.querySelectorAll('.explore-kinds [data-kind]').forEach(b=>{const span=b.querySelector('span');if(span)span.innerHTML=flavorDoodle(kinds[b.dataset.kind])});
 const cuisines={All:['bowl','All'],Mexican:['taco','Mexican'],Burgers:['burger','Smash burgers'],'Hot Dogs':['hotdog','Hot dogs'],Global:['bowl','Global'],Sweets:['sweet','Sweets'],Markets:['basket','Market vendors'],Coffee:['coffee','Coffee']};
 document.querySelectorAll('.filters [data-cuisine]').forEach(b=>{const d=cuisines[b.dataset.cuisine];if(d)b.innerHTML='<span class="filter-doodle">'+flavorDoodle(d[0])+'</span><span>'+d[1]+'</span>'});
 const nav={discover:'pin',favorites:'heart',bookings:'calendar'};
 document.querySelectorAll('.bottom-nav button').forEach(b=>{const span=b.querySelector('span');if(span)span.innerHTML=flavorDoodle(nav[b.dataset.screen]||(b.classList.contains('surprise-nav')?'dice':'party'))});
 const buttons=[['.local-surprise span:first-child','dice'],['.pager-launch span:first-child','bowl']];
 for(const [selector,name]of buttons){const el=document.querySelector(selector);if(el)el.innerHTML=flavorDoodle(name)}
 const tabNames={finder:['spark','Flavor finder'],trail:['trail','Food trail'],marketing:['party','Marketing kit']};
 document.querySelectorAll('[data-smart-tab]').forEach(b=>{const d=tabNames[b.dataset.smartTab];b.innerHTML='<span class="inline-doodle">'+flavorDoodle(d[0])+'</span>'+d[1]});
 document.querySelectorAll('.smart-invite-actions button').forEach((b,i)=>b.innerHTML='<span class="inline-doodle">'+flavorDoodle(i?'trail':'spark')+'</span>'+(i?'Build a food trail':'Find my flavor'));
}
paintFlavorIcons();