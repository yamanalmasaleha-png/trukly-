/* Truckly original: rumor game and pager navigation refinements, 2026-11.
   Additive UI only: real pickup API remains in public/pager.js and source-backed clues in public/street-whispers.js. */
(function(){
 'use strict';
 const $=id=>document.getElementById(id);
 const scoreKey='truckly_rumor_score_v1';
 function getProgress(){
   try{
     const data=JSON.parse(localStorage.getItem(scoreKey)||'{}');
     return {points:Math.max(0,Number(data.points)||0),played:Math.max(0,Number(data.played)||0),solved:Math.max(0,Number(data.solved)||0)};
   }catch{return {points:0,played:0,solved:0};}
 }
 function updateProgress(){
   const p=getProgress();
   if($('rumorScoreText'))$('rumorScoreText').textContent=p.points+' points · '+p.solved+' solved / '+p.played+' clues';
   if($('rumorLevelText'))$('rumorLevelText').textContent=p.solved>=8?'🏆 Local legend':p.solved>=4?'🕵️ Neighborhood sleuth':'🔎 Rookie food detective';
 }
 function buildPlaybar(){
   const section=document.querySelector('.street-section'),games=section?.querySelector('.street-games');
   if(!section||!games||$('rumorPlaybar'))return;
   const nav=document.createElement('div');
   nav.id='rumorPlaybar';nav.className='rumor-playbar';
   nav.innerHTML='<div class="rumor-playbar-copy"><small>🎮 JUST FOR FUN · LOCAL-ONLY SCORE</small><strong id="rumorLevelText">🔎 Rookie food detective</strong><span id="rumorScoreText">0 points</span></div><div class="rumor-play-actions"><button type="button" id="rumorClueShortcut">🕵️ New clue</button><button type="button" id="rumorMysteryShortcut">🎲 Secret pick</button><button type="button" id="rumorPagerShortcut">📟 Food pager</button></div>';
   section.insertBefore(nav,games);
   $('rumorClueShortcut').addEventListener('click',()=>{
     if(typeof streetNextClue==='function')streetNextClue();
     $('streetQuiz')?.scrollIntoView({block:'nearest',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
   });
   $('rumorMysteryShortcut').addEventListener('click',()=>{
     if(typeof streetMysteryPick==='function')streetMysteryPick();
     $('streetMysteryResult')?.scrollIntoView({block:'nearest',behavior:'smooth'});
   });
   $('rumorPagerShortcut').addEventListener('click',()=>{
     if(typeof openPager==='function')openPager();
   });
   updateProgress();
 }
 const quiz=$('streetQuiz');
 quiz?.addEventListener('click',e=>{
   const button=e.target.closest('button[data-street-answer]');
   if(!button||button.disabled||typeof streetQuizIndex==='undefined')return;
   const progress=getProgress();
   const correct=Number(button.dataset.streetAnswer)===streetQuizIndex;
   progress.played++;if(correct){progress.solved++;progress.points+=10;}
   try{localStorage.setItem(scoreKey,JSON.stringify(progress));}catch{}
   updateProgress();
 },true);
 window.openWhisperFiles=async function(){
   if(typeof openCommunity==='function')await openCommunity();
   else if(typeof showScreen==='function')showScreen('community');
   const section=document.querySelector('.street-section');
   if(!section)return;
   section.scrollIntoView({block:'start',behavior:'smooth'});
   section.classList.remove('rumor-arrival');void section.offsetWidth;section.classList.add('rumor-arrival');
 };
 function selectPagerMode(mode){
   const demo=mode!=='real',demoButton=$('pagerChoiceDemo'),realButton=$('pagerChoiceReal');
   $('pagerScreen')?.classList.toggle('pager-view-demo',demo);
   $('pagerScreen')?.classList.toggle('pager-view-real',!demo);
   if(demoButton){demoButton.classList.toggle('is-active',demo);demoButton.setAttribute('aria-pressed',String(demo));}
   if(realButton){realButton.classList.toggle('is-active',!demo);realButton.setAttribute('aria-pressed',String(!demo));}
   $('pagerScreen')?.classList.toggle('pager-real-selected',!demo);
 }
 window.trucklyPagerChoice=function(mode){
   const demo=mode!=='real';selectPagerMode(mode);
   const realEntry=$('pagerRealEntry');
   if(demo){
     if(realEntry)realEntry.open=false;
     if(typeof startPagerDemo==='function')startPagerDemo();
     $('pagerDisplay')?.scrollIntoView({block:'nearest',behavior:'smooth'});
   }else{
     // Exiting the simulation must never change a real pickup ticket on the server.
     if(typeof pagerDemo!=='undefined'&&pagerDemo&&typeof pagerLeaveDemo==='function')pagerLeaveDemo();
     if(realEntry)realEntry.open=true;
     realEntry?.scrollIntoView({block:'nearest',behavior:'smooth'});
     $('pagerCode')?.focus({preventScroll:true});
   }
 };
 // Keep source-backed real code links and API tracking in place. Do not start a demo on incoming pickup links.
 const hasPickupHash=!!new URLSearchParams(location.hash.slice(1)).get('pager');
 selectPagerMode(hasPickupHash?'real':'demo');
 window.addEventListener('hashchange',()=>{
   const hasCode=!!new URLSearchParams(location.hash.slice(1)).get('pager');
   if(hasCode)selectPagerMode('real');
 });
 buildPlaybar();
})();