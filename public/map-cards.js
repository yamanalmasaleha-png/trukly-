/* Screen-space layout: reserve the full selected footprint plus touch/shadow gutters.
 * Re-test after every merge: moving a centroid can collide with a third card.
 * No vendor cap, coordinate jitter, or dependency on a remote clustering service. */
(function (root) {
  'use strict';
  const WIDTH = 84, HEIGHT = 82, SCALE = 1.15, GAP = 8;
  function layout(points, selectedId) {
    let groups = points.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y))
      .slice().sort((a, b) => String(a.vendor.id).localeCompare(String(b.vendor.id)))
      .map(p => ({ x: p.x, y: p.y, members: [p] }));
    let merged = true;
    while (merged) {
      merged = false;
      outer: for (let i = 0; i < groups.length; i++) {
        for (let j = i + 1; j < groups.length; j++) {
          const a = groups[i], b = groups[j];
          if (Math.abs(a.x - b.x) >= WIDTH * SCALE + GAP || Math.abs(a.y - b.y) >= HEIGHT * SCALE + GAP) continue;
          const members = a.members.concat(b.members);
          const selected = members.find(p => p.vendor.id === selectedId);
          groups[i] = {
            members,
            x: selected ? selected.x : members.reduce((s, p) => s + p.x, 0) / members.length,
            y: selected ? selected.y : members.reduce((s, p) => s + p.y, 0) / members.length
          };
          groups.splice(j, 1);
          merged = true;
          break outer;
        }
      }
    }
    return groups;
  }
  function status(t) {
    if (t.schedule_status === 'unavailable_today' || t.schedule_status === 'owner_paused_today' || t.open === false) return { state: 'closed', label: 'Closed' };
    if (t.open === true && (t.verified || t.is_confirmed_service)) return { state: 'open', label: 'Open' };
    return { state: 'unknown', label: t.open === true ? 'Est. open' : 'Check hours' };
  }
  function artwork(t) {
    const text = [t.name, t.cuisine, t.kind, t.listing_kind, t.emoji].join(' ').toLowerCase();
    if (/fries|poutine|🍟/.test(text)) return 'fries';
    if (/ramen|🍜/.test(text)) return 'ramen';
    if (/sushi|poke|🍣/.test(text)) return 'sushi';
    if (/pizza|🍕/.test(text)) return 'pizza';
    if (/coffee|boba|☕/.test(text)) return 'coffee';
    if (/sweet|ice cream|italian ice|paleta|fru-ta|dessert|🍨|🍦/.test(text)) return 'sweet';
    if (/hot dog|sausage|🌭/.test(text)) return 'hotdog';
    if (/burger|sandwich|🍔/.test(text)) return 'burger';
    if (/taco|mexican|mole|🌮|🌯/.test(text)) return 'taco';
    if (/cafe|café/.test(text)) return 'coffee';
    if (/farm|market|produce/.test(text)) return 'market';
    return 'bowl';
  }
  function shortName(name) {
    const words = String(name || '').trim().split(/\s+/);
    let result = words.shift() || 'Local spot';
    while (words.length && (result + ' ' + words[0]).length <= 14) result += ' ' + words.shift();
    return result.replace(/\s+(?:&|and|by|at)$/i, '');
  }
  // Oversized roof signs keep each cuisine readable at map scale.
  function truckIcon(vendor) {
    const key = artwork(vendor);
    const colors = { fries: '#ED4536', ramen: '#7BBEBB', taco: '#EABD58', burger: '#EF9279', sushi: '#79AD9A', sweet: '#BEA5DA', coffee: '#535257', pizza: '#D85D4B', hotdog: '#DFAD48', bowl: '#70B8B2', market: '#9CB873' };
    const food = {
      fries: '<path d="m34 23-4-17 6-1 4 16V3h6v17l3-19 6 1-3 20 7-17 6 2-7 19" fill="#FFC653" stroke="#CC9033" stroke-width="1.3"/><path d="m29 16 5 19q13 5 26-1l6-19q-18 13-37 1Z" fill="#EC352C"/><path d="M41 27q6 6 12-1" stroke="#FFF3C8" fill="none" stroke-width="2.8"/>',
      ramen: '<path d="m48 15 21-13m-15 15L73 7" stroke="#AA7952" stroke-width="3"/><ellipse cx="48" cy="19" rx="22" ry="6" fill="#CE995E"/><path d="M31 18q4-9 9 0t9 0t9-1" fill="none" stroke="#FFD47B" stroke-width="4"/><circle cx="55" cy="16" r="5" fill="#FFF5D9"/><circle cx="55" cy="16" r="2" fill="#EE9DAC"/><path d="M26 19q22 9 44 0-5 18-22 18T26 19Z" fill="#FFF5DC"/>',
      pizza: '<path d="M31 4 65 12 39 34Z" fill="#FFD15A"/><path d="m31 4 34 8" stroke="#B96B32" stroke-width="7"/><circle cx="40" cy="14" r="4" fill="#D84D38"/><circle cx="52" cy="16" r="4" fill="#D84D38"/><circle cx="41" cy="25" r="3.5" fill="#D84D38"/>',
      taco: '<path d="M27 29a21 21 0 0 1 42 0Z" fill="#F6C854"/><path d="M31 22 36 15l6 3 6-7 7 7 7-2 4 9" fill="#5D9F65"/><path d="M30 27c10-9 26-9 37 0" stroke="#B76B37" stroke-width="5"/>',
      burger: '<path d="M29 16c1-17 37-17 38 0Z" fill="#EFA94C"/><path d="M29 21h38" stroke="#53945D" stroke-width="6"/><path d="M29 27h38" stroke="#754936" stroke-width="7"/><path d="M30 30h36v5H30Z" fill="#EFA94C"/><path d="m41 8 3 1m8-2 3 1" stroke="#FFF0BC" stroke-width="3"/>',
      sushi: '<path d="M30 14h35v15c0 9-35 9-35 0Z" fill="#285C4F"/><ellipse cx="47.5" cy="14" rx="17.5" ry="10" fill="#FFFAF0"/><ellipse cx="47.5" cy="14" rx="10" ry="6" fill="#EF8F70"/><path d="m43 14 5-3 5 4-5 3Z" fill="#80AD75"/>',
      sweet: '<path d="m37 21 11 17 11-17" fill="#D69E5D"/><path d="m43 26 9 1m-5 4 5 1" stroke="#B67B43" stroke-width="2"/><path d="M33 20c-4-6 0-12 6-12 0-10 18-10 18 0 7 0 11 6 6 12Z" fill="#D7B6ED"/>',
      coffee: '<path d="M31 10h28v17c0 10-28 10-28 0Z" fill="#FFFAF0"/><path d="M59 14h5c10 0 10 13 0 13h-5" fill="none" stroke="#FFFAF0" stroke-width="5"/><path d="M28 36h38" stroke="#6B5040" stroke-width="4"/><path d="M40 3v3m10-3v3" stroke="#6B5040" stroke-width="3"/>',
      hotdog: '<rect x="26" y="10" width="44" height="22" rx="11" fill="#E9BA72"/><rect x="29" y="15" width="38" height="12" rx="6" fill="#BA6048"/><path d="m34 20 5-3 5 6 5-6 5 6 7-4" fill="none" stroke="#FFDB55" stroke-width="3"/>',
      bowl: '<path d="M27 18h43c-1 13-8 19-21 19S29 31 27 18Z" fill="#FFFAF0"/><path d="M32 16c0-10 11-10 13-3 4-10 15-9 19 3" fill="#74A46A"/><path d="m48 13 5-6 7 8" fill="#EFAA5D"/><path d="m61 6 8-5" stroke="#79583E" stroke-width="3"/>',
      market: '<path d="M28 17h42l-5 19H33Z" fill="#C79961"/><path d="m36 19 2 12m10-12v12m11-12-2 12" stroke="#A57849" stroke-width="2"/><circle cx="38" cy="15" r="8" fill="#E97554"/><circle cx="54" cy="13" r="9" fill="#78A266"/><path d="m58 18 5-13 7 3-5 12" fill="#F4AD54"/>'
    };
    return '<svg class="food-truck-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 76" aria-hidden="true" focusable="false">' +
      '<ellipse cx="50" cy="71" rx="42" ry="3" fill="#234B3A" opacity=".12"/>' +
      '<g stroke-linecap="round" stroke-linejoin="round">' +
      `<path d="M9 40q0-8 9-9l48-3q7 0 11 4l12 12 6 11v8q0 5-6 6l-23 3-52-6q-6-1-6-7Z" fill="${colors[key]}"/>` +
      '<path d="m67 31 10 3 12 12 5 11v8l-25 5Z" fill="#17392F" opacity=".18"/>' +
      '<path d="m13 37 49-4" stroke="#FFF8EA" opacity=".65" stroke-width="2"/>' +
      '<path d="m70 36 7 1 12 14-18 2Z" fill="#D9ECE7"/><path d="m74 38 5 1 4 5-9 5Z" fill="#FFFDF4"/>' +
      '<path d="m17 41 39-2v15l-39 1Z" fill="#354C48"/><path d="m16 41 3-5 37-2 4 5-3 3Z" fill="#FFF2CF"/>' +
      '<path d="m16 55 42-1" stroke="#DDD5BE" stroke-width="3"/><path d="m72 60 5-1m11-1 4-1" stroke="#FFF2B7" stroke-width="3"/>' +
      '<path d="m78 63 8-1" stroke="#374B46" stroke-width="2"/>' +
      '<ellipse cx="21" cy="64" rx="7" ry="9" fill="#303A39"/><ellipse cx="21" cy="64" rx="3" ry="4" fill="#CBC9B9"/>' +
      '<ellipse cx="62" cy="67" rx="7" ry="9" fill="#303A39"/><ellipse cx="62" cy="67" rx="3" ry="4" fill="#CBC9B9"/>' +
      '<g stroke="none">' + food[key] + '</g></g></svg>';
  }
  function representative(group, selectedId) {
    return group.members.find(p => p.vendor.id === selectedId) || group.members.slice().sort((a, b) =>
      Math.hypot(a.x - group.x, a.y - group.y) - Math.hypot(b.x - group.x, b.y - group.y) || String(a.vendor.id).localeCompare(String(b.vendor.id)))[0];
  }
  root.BiteSharkMapCards = { WIDTH, HEIGHT, SCALE, GAP, layout, status, artwork, shortName, truckIcon, representative };
})(globalThis);
