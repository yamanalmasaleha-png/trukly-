/* Truckly Word on the Street. Editorial clues are sourced; visitor whispers are unverified and moderated. */
const streetFiles=[
 {icon:'☕',city:'Santa Rosa',kind:'ON THE MENU',title:'A latte wearing dessert clothes',clue:'A café menu includes a crème brûlée latte and Mexican mocha. Which local stop?',name:'Crooks Coffee',id:'coffee-crooks',fact:'Crooks lists a crème brûlée latte, Mexican mocha, and café con miele on its published menu. Check current availability before visiting.',source:'https://shadyraveninc.com/menu'},
 {icon:'🫘',city:'Petaluma',kind:'LOCAL ORIGIN STORY',title:'The coffee shop with a past life',clue:'This Sonoma coffee brand started in Petaluma in 2011 under a different name. Who is it now?',name:'Avid Coffee',id:'coffee-avid-petaluma',fact:'Avid says it began as Acre Coffee in Petaluma in 2011 and adopted the Avid name in 2021.',source:'https://avidcoffee.com/pages/learn'},
 {icon:'🧺',city:'Glen Ellen',kind:'TUCKED-AWAY FIND',title:'The barn has a pantry secret',clue:'Produce, honey, hot sauce and more, inside a century-old barn. Where is it?',name:'Oak Hill Farm — Red Barn Store',id:'farm-oakhill',fact:'Oak Hill Farm describes a Red Barn Store in a roughly 100-year-old barn, selling produce and locally sourced pantry goods.',source:'https://www.oakhillfarm.net/the-red-barn-store'},
 {icon:'🌌',city:'Sebastopol',kind:'ORIGIN FILE',title:'The café that started on wheels',clue:'This Sebastopol café began with home roasting and a coffee cart at farmers markets. Who is it?',name:'Retrograde Coffee Roasters',id:'coffee-retrograde',fact:'Retrograde says it started in 2014 roasting out of a home kitchen and taking a coffee cart to farmers markets and events.',source:'https://retrograderoasters.com/pages/about'}
];
const streetMissions=[
 {icon:'🥐',title:'Breakfast detective',desc:'Look up a coffee or breakfast spot you have not visited. Check its latest menu, then log a real visit to your passport.',kind:'passport'},
 {icon:'🌮',title:'One more neighborhood',desc:'Explore a different Sonoma County town and shortlist a spot for your next outing.',kind:'discover'},
 {icon:'🧺',title:'Market whisper hunter',desc:'Find a local farmers market and check an organizer’s vendor calendar before heading out.',kind:'discover'},
 {icon:'📸',title:'The photo evidence',desc:'Photograph a dish you actually tried and save a short tasting note in your private notebook.',kind:'photos'},
 {icon:'🕵️',title:'The tip worth passing',desc:'Know a menu detail you think more locals would enjoy? Submit a food-only tip for review.',kind:'whisper'}
];
let streetQuizIndex=-1,streetMissionIndex=-1,streetCurrentPick=null;
function streetRandomIndex(length,previous){
 if(length<=1)return 0;
 const n=Math.floor(Math.random()*(length-1));
 return n>=previous?n+1:n;
}
function streetNextClue(){
 streetQuizIndex=streetRandomIndex(streetFiles.length,streetQuizIndex);
 const file=streetFiles[streetQuizIndex];
 const slot=document.getElementById('streetQuiz');if(!slot)return;
 const choices=[streetQuizIndex,(streetQuizIndex+1)%streetFiles.length,(streetQuizIndex+2)%streetFiles.length]
   .sort((a,b)=>((a*7+streetQuizIndex*3)%11)-((b*7+streetQuizIndex*3)%11));
 slot.innerHTML='<span class="street-card-kicker">🕵️ GUESS THE LOCAL SPOT</span>'+
  '<h3>'+streetEscape(file.clue)+'</h3><div class="street-answers">'+
  choices.map(i=>'<button type="button" data-street-answer="'+i+'">'+streetEscape(streetFiles[i].name)+'</button>').join('')+'</div>'+
  '<div id="streetQuizAnswer" role="status" aria-live="polite"></div>';
 slot.querySelectorAll('[data-street-answer]').forEach(b=>b.addEventListener('click',()=>streetAnswerClue(Number(b.dataset.streetAnswer))));
}
function streetEscape(s){return typeof communityEscape==='function'?communityEscape(s):String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function streetAnswerClue(choice){
 const slot=document.getElementById('streetQuizAnswer'),file=streetFiles[streetQuizIndex];
 if(!slot||!file)return;
 const correct=choice===streetQuizIndex;
 document.querySelectorAll('[data-street-answer]').forEach(b=>{b.disabled=true;b.classList.toggle('correct',Number(b.dataset.streetAnswer)===streetQuizIndex);});
 slot.innerHTML='<p><b>'+(correct?'Case cracked! 🔎':'Good guess — here’s the answer.')+'</b> '+streetEscape(file.fact)+'</p>'+
 '<div class="street-quiz-footer"><a href="'+file.source+'" target="_blank" rel="noopener noreferrer">Check the business source ↗</a>'+
 '<button type="button" onclick="streetNextClue()">Next clue →</button></div>';
}
function streetRenderFiles(){
 const row=document.getElementById('streetFiles');if(!row)return;
 row.innerHTML=streetFiles.map((f,i)=>'<article class="street-file">'+
  '<div class="street-file-mark"><span>'+f.icon+'</span><small>'+streetEscape(f.city)+'</small></div>'+
  '<small>'+streetEscape(f.kind)+'</small><h3>'+streetEscape(f.title)+'</h3>'+
  '<p>'+streetEscape(f.fact)+'</p><div class="street-file-links">'+
  '<a href="'+f.source+'" target="_blank" rel="noopener noreferrer">Published source ↗</a>'+
  '<button type="button" data-street-detail="'+i+'">Find the spot →</button></div>'+
  '</article>').join('');
 row.querySelectorAll('[data-street-detail]').forEach(b=>b.addEventListener('click',()=>streetOpenPlace(streetFiles[Number(b.dataset.streetDetail)].id)));
}
function streetOpenPlace(id){
 if(typeof showScreen==='function')showScreen('discover');
 if(typeof openDetail==='function')openDetail(id);
}
function streetMysteryPick(){
 const options=streetFiles.filter(f=>f.id!==streetCurrentPick);
 const file=options[Math.floor(Math.random()*options.length)]||streetFiles[0];
 streetCurrentPick=file.id;
 const box=document.getElementById('streetMysteryResult');if(!box)return;
 box.hidden=false;
 box.innerHTML='<div class="street-mystery-reveal"><span>'+file.icon+'</span><div><small>YOUR MYSTERY PICK · '+streetEscape(file.city)+'</small><h3>'+streetEscape(file.name)+'</h3>'+
 '<p>'+streetEscape(file.fact)+'</p></div></div>'+
 '<div class="street-mystery-actions"><button type="button" onclick="streetOpenPlace('+JSON.stringify(file.id).replace(/"/g,'&quot;')+')">Explore this spot →</button>'+
 '<a href="'+file.source+'" target="_blank" rel="noopener noreferrer">Check the source ↗</a></div>';
}
function streetNextMission(){
 streetMissionIndex=streetRandomIndex(streetMissions.length,streetMissionIndex);
 const m=streetMissions[streetMissionIndex];
 const box=document.getElementById('streetMissionResult');if(!box)return;
 box.hidden=false;
 box.innerHTML='<span class="street-card-kicker">YOUR LITTLE FOOD MISSION</span><h3>'+m.icon+' '+streetEscape(m.title)+'</h3><p>'+streetEscape(m.desc)+'</p>'+
 '<button type="button" onclick="streetActMission('+streetMissionIndex+')">'+(m.kind==='passport'?'Open Food Passport →':m.kind==='photos'?'Open my photo notebook →':m.kind==='whisper'?'Share a whisper →':'Find local spots →')+'</button>';
}
function streetActMission(index){
 const m=streetMissions[index];if(!m)return;
 if(m.kind==='passport'&&typeof openLocalGuides==='function')openLocalGuides('passport');
 else if(m.kind==='photos'&&typeof openLocalGuides==='function')openLocalGuides('photos');
 else if(m.kind==='whisper'&&typeof communityStartPost==='function')communityStartPost('whisper','A food rumor worth checking');
 else if(typeof showScreen==='function')showScreen('discover');
}
function streetOpenWhisper(){
 const section=document.getElementById('communityCompose');
 if(section&&typeof communityStartPost==='function')communityStartPost('whisper','A food rumor worth checking');
}
function streetInit(){
 if(!document.getElementById('streetFiles'))return;
 streetRenderFiles();streetNextClue();
}
streetInit();