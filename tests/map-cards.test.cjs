const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = vm.createContext({});
vm.runInContext(fs.readFileSync('public/map-cards.js', 'utf8'), context);
const api = context.BiteSharkMapCards;
const point = (id, x, y) => ({ vendor: { id }, x, y });
function verify(points, selected) {
  const groups = api.layout(points, selected);
  assert.deepEqual(Array.from(groups.flatMap(g => g.members.map(p => p.vendor.id))).sort(), points.map(p => p.vendor.id).sort(), 'Every vendor remains reachable exactly once');
  groups.forEach((a, i) => groups.slice(i + 1).forEach(b => {
    assert(Math.abs(a.x - b.x) >= api.WIDTH * api.SCALE + api.GAP || Math.abs(a.y - b.y) >= api.HEIGHT * api.SCALE + api.GAP, 'Selected-size icons and touch gutters must not overlap');
  }));
  const chosen = points.find(p => p.vendor.id === selected);
  if (chosen) {
    const group = groups.find(g => g.members.some(p => p.vendor.id === selected));
    assert.equal(group.x, chosen.x);
    assert.equal(group.y, chosen.y);
  }
  assert.equal(JSON.stringify(groups), JSON.stringify(api.layout(points.slice().reverse(), selected)), 'Stable results regardless of catalog ordering');
  return groups;
}
assert.equal(verify(Array.from({length: 59}, (_, i) => point(String(i), 100, 100)), '1').length, 1, 'Co-located vendors remain clustered at maximum zoom');
assert.equal(verify([point('a', 0, 0), point('b', 400, 400)], 'a').length, 2);
verify([point('a', 0, 0), point('b', 90, 0), point('c', 160, 0)], 'b');
let seed = 1988;
const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
for (const width of [375, 615, 1280]) {
  for (let run = 0; run < 100; run++) {
    verify(Array.from({length: 59}, (_, i) => point(String(i), random() * width, random() * 600)), '13');
  }
}
for (const [vendor, state] of [
  [{open: true, verified: true}, 'open'],
  [{open: true, is_confirmed_service: true}, 'open'],
  [{open: false}, 'closed'],
  [{open: true, verified: true, schedule_status: 'owner_paused_today'}, 'closed'],
  [{open: true}, 'unknown'], [{open: null}, 'unknown'], [{}, 'unknown']
]) assert.equal(api.status(vendor).state, state);
assert.equal(api.artwork({name: 'Xies707 Sushi Rolls', cuisine: 'Global'}), 'sushi');
assert.equal(api.artwork({name: 'Chava’s Pizza', listing_kind: 'market_stall'}), 'pizza');
assert.equal(api.artwork({name: 'Myriad Coffee', cuisine: 'Sweets'}), 'coffee');
assert.equal(api.artwork({name: "Little Rich's Italian Ice", cuisine: 'Sweets'}), 'sweet');
assert.equal(api.artwork({name: 'Sunny Cafe & Tacos', cuisine: 'Mexican'}), 'taco');
assert.equal(api.shortName('Ross Street Food Trucks'), 'Ross Street');
assert.equal(api.shortName('Tacos Iñiguez'), 'Tacos Iñiguez');
assert.equal(api.shortName('Sunny Cafe & Tacos'), 'Sunny Cafe');
const group = { x: 100, y: 100, members: [point('far', 0, 0), point('near', 99, 100)] };
assert.equal(api.representative(group, null).vendor.id, 'near');
assert.equal(api.representative(group, 'far').vendor.id, 'far');
const cuisineIcons = ['Pizza', 'Taco', 'Burger', 'Sushi', 'Ice cream', 'Coffee', 'Hot dog', 'Bowl', 'Farm produce'].map(name => api.truckIcon({name}));
assert.equal(new Set(cuisineIcons).size, 9, 'Each cuisine has a distinct vector silhouette');
for (const icon of cuisineIcons) {
  assert(icon.startsWith('<svg'));
  assert(!/href=|<image|<script/.test(icon), 'Icons are self-contained vectors');
}
const appSource = fs.readFileSync('public/app.js', 'utf8');
assert(!appSource.includes("'Nearby trucks'"), 'Clusters must use a shortened actual vendor name');
assert(appSource.includes('const name = api.shortName(t.name)'));
assert(!appSource.includes('class="food-map-status"'), 'Hours belong in vendor details');
assert(appSource.includes('class="food-map-name">${esc(name)}'), 'Show the vendor name on the truck');
console.log('PASS: 300 dense mobile/desktop layouts, vendor conservation, selected anchoring, stable clustering, truthful status, cuisine artwork, and actual short names');
