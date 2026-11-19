// Isolated pager demonstration smoke test. No real API calls or orders.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('public/pager.js', 'utf8');
const html = fs.readFileSync('public/index.html', 'utf8');
const css = fs.readFileSync('public/pager-experience.css', 'utf8');
const nodes = new Map();
const timers = new Map();
let sequence = 1;
let networkCalls = 0;
function element(id) {
  if(!nodes.has(id))nodes.set(id, {
    id, innerHTML:'', textContent:'', className:'', value:'', open:false,
    classList: {contains(v){return id==='pagerScreen'&&v==='active';}},
    replaceChildren(){},
  });
  return nodes.get(id);
}
const document = {
  hidden: false, getElementById: element, addEventListener(){},
  querySelector(){return {textContent:'', replaceChildren(){}};},
};
const context = vm.createContext({
  document,
  window: {addEventListener(){}},
  location: {hash:'',origin:'https://example.test'},
  URL, URLSearchParams,
  navigator: {},
  console,
  setInterval(){return 0;},
  setTimeout(fn,ms){assert.equal(ms,4700);const id=sequence++;timers.set(id,fn);return id;},
  clearTimeout(id){timers.delete(id);},
  fetch(){networkCalls++;throw new Error('Demo must never send a real request');},
});
vm.runInContext(source,context,{filename:'public/pager.js'});
const run = code => vm.runInContext(code,context);
assert(html.includes('onclick="startPagerDemo()"'), 'a one-tap sample button is present');
assert(html.includes('id="pagerRealEntry"'), 'real pickup link remains available');
assert(html.includes('/pager-experience.css'), 'new stylesheet linked');
assert(css.includes('.pager-roadmap'), 'visible status roadmap styled');

run('startPagerDemo()');
assert.equal(run('pagerDemo'),true);
assert.equal(run('pagerStatus'),'cooking');
assert.match(element('pagerDisplay').innerHTML,/PLAY MODE · NOT A REAL ORDER/);
assert.match(element('pagerDisplay').innerHTML,/BiteShark Test Kitchen/);
assert(!element('pagerDisplay').innerHTML.includes('Truckly Test Kitchen'), 'demo uses BiteShark Test Kitchen branding');
assert.match(element('pagerDisplay').innerHTML,/2 smash burgers \+ crispy fries/);
assert.equal(timers.size,1,'automatic preview schedules its next step');

run('pagerToggleAutoplay()');
assert.equal(run('pagerDemoAuto'),false,'demo pauses');
assert.equal(timers.size,0,'paused demo clears scheduled timer');
run('pagerAdvanceDemo()');
assert.equal(run('pagerStatus'),'almost');
run('pagerAdvanceDemo()');
assert.equal(run('pagerStatus'),'ready');
assert.match(element('pagerDisplay').innerHTML,/Come get the good stuff/);
run('pagerAdvanceDemo()');
assert.equal(run('pagerStatus'),'collected');
assert.match(element('pagerDisplay').innerHTML,/Enjoy every bite/);
run('startPagerDemo()');
assert.equal(run('pagerStatus'),'cooking','demo can replay');
run('pagerLeaveDemo()');
assert.equal(run('pagerDemo'),false);
assert.equal(timers.size,0);
assert.equal(networkCalls,0,'demo did not call a backend endpoint');
console.log('PASS: one-tap pager demo, guided progress, pause, replay, and real-order isolation');
