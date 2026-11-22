/* Passwordless customer login through the platform's managed auth client. */
(function(){
 document.getElementById('loginTruck').innerHTML=truckCharacter('taco');
 const A=window.hatchable?.auth,el=id=>document.getElementById(id),email=el('loginEmail'),code=el('loginCode'),submit=el('loginSubmit'),back=el('loginBack');
 let step='email',hasPasskey=false;
 function safeNext(){const n=new URLSearchParams(location.search).get('next')||'/#mytruckly';if(n[0]!=='/'||n[1]==='/')return '/#mytruckly';for(let i=0;i<n.length;i++){const c=n.charCodeAt(i);if(c<32||c===92||c===127)return '/#mytruckly'}return n}
 function message(text,error=false){el('loginMessage').textContent=text;el('loginMessage').className='msg'+(error?' err':'')}
 function done(){location.replace(safeNext())}
 function declined(){try{return localStorage.getItem('truckly_passkey_declined')==='1'}catch{return false}}
 function decline(){try{localStorage.setItem('truckly_passkey_declined','1')}catch{}}
 function finish(){if(hasPasskey||declined()||!A.supportsPasskeys?.()||!A.registerPasskey){done();return}step='passkey';el('loginForm').hidden=true;el('loginPasskey').hidden=false;el('loginTitle').textContent='Welcome to My Truckly.';el('loginSubtitle').textContent='Your food story starts here.';message('');el('loginAddPasskey').focus()}
 if(!A){message('Sign-in is temporarily unavailable. Please refresh or browse Truckly for now.',true);submit.disabled=true;return}
 A.getSession().then(s=>{if(s?.user)done()}).catch(()=>{});
 if(A.attachPasskeyAutofill)try{A.attachPasskeyAutofill(email).then(r=>{if(r?.user)done()}).catch(()=>{})}catch{}
 back.onclick=()=>{step='email';el('loginEmailRow').hidden=false;el('loginCodeRow').hidden=true;code.required=false;email.required=true;back.hidden=true;submit.textContent='Email me a code →';el('loginSubtitle').textContent='Sign in or join with your email. We’ll send a code—no password to remember.';message('');email.focus()};
 el('loginForm').onsubmit=async e=>{
 e.preventDefault();if(step==='passkey')return;submit.disabled=true;message('');
 try{
 if(step==='email'){
 const r=await A.startLogin({email:email.value.trim()});hasPasskey=!!r?.has_passkey;
 if(hasPasskey&&A.supportsPasskeys?.()){try{const result=await A.signInWithPasskey({email:email.value.trim()});if(result?.user){done();return}}catch{}}
 step='code';el('loginEmailRow').hidden=true;el('loginCodeRow').hidden=false;email.required=false;code.required=true;back.hidden=false;submit.textContent='Sign in →';el('loginSubtitle').textContent='Enter the code sent to '+email.value.trim()+'.';message('Code sent. Check your inbox and spam folder.');code.focus();
 }else{
 if(!/^[0-9]{6}$/.test(code.value.trim()))throw Error('Enter the six-digit code from your email.');
 const result=await A.verifyCode({email:email.value.trim(),code:code.value.trim()});if(!result?.user)throw Error('That code did not work. Please try again.');finish();
 }
 }catch(err){message(err.status===429?'Too many attempts. Please wait a moment and try again.':err.message||'Could not sign in. Please try again.',true)}finally{submit.disabled=false}
 };
 el('loginAddPasskey').onclick=async()=>{el('loginAddPasskey').disabled=true;el('loginSkipPasskey').disabled=true;try{const saved=await A.registerPasskey({name:'My Truckly'});if(!saved)decline();done()}catch(e){message(e.message||'Could not add a passkey. You can continue without one.',true);el('loginAddPasskey').disabled=false;el('loginSkipPasskey').disabled=false}};
 el('loginSkipPasskey').onclick=()=>{decline();done()};
})();