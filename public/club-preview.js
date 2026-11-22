/* Fictional previews only. Never writes visits, points, purchases, or rewards. */
let clubSampleStamps=6;
function renderClubPreview(){
 const grid=document.getElementById('clubStampGrid'),state=document.getElementById('clubRewardState'),button=document.getElementById('clubStampButton');
 if(!grid||!state||!button)return;
 grid.innerHTML=Array.from({length:6},(_,i)=>'<span class="club-stamp '+(i<clubSampleStamps?'is-stamped':'')+'" aria-label="Stamp '+(i+1)+(i<clubSampleStamps?' collected':' empty')+'">'+(i<clubSampleStamps?'<span aria-hidden="true">✦</span>':'<span aria-hidden="true">'+(i+1)+'</span>')+'</span>').join('');
 grid.setAttribute('aria-label',clubSampleStamps+' of 6 sample coffee stamps collected');
 const unlocked=clubSampleStamps===6;
 state.classList.toggle('is-unlocked',unlocked);
 state.innerHTML=unlocked?'<span class="club-unlocked-label">✓ SAMPLE REWARD UNLOCKED</span><strong>One free coffee</strong><span>Six stamps, one delicious little thank-you.</span>':'<span class="club-unlocked-label">SAMPLE LOYALTY CARD</span><strong>'+clubSampleStamps+' / 6 stamps</strong><span>'+(6-clubSampleStamps)+' more to unlock the sample free coffee.</span>';
 button.textContent=unlocked?'Preview free coffee →':'Add a sample stamp +';
 button.setAttribute('aria-label',unlocked?'Preview sample free coffee reward':'Add one sample loyalty stamp');
 document.querySelectorAll('#guideClubPreview [data-doodle]').forEach(el=>{el.innerHTML=flavorDoodle(el.dataset.doodle)});
}
function clubAddStamp(){
 const message=document.getElementById('clubRewardMessage');
 if(clubSampleStamps===6){message.textContent='Sample reward: one regular coffee. This is a preview, not a voucher, and cannot be redeemed.';return}
 clubSampleStamps++;renderClubPreview();
 message.textContent=clubSampleStamps===6?'Sample free coffee unlocked! Your real passport and purchases have not changed.':'Sample stamp added. '+(6-clubSampleStamps)+' to go.';
}
function clubReplay(){
 clubSampleStamps=0;renderClubPreview();
 document.getElementById('clubRewardMessage').textContent='Sample reset. Add six stamps to preview the reward again.';
}