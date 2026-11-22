/* BiteShark Street Whispers Clues, Quiz & Side Missions (`public/street-whispers.js`)
 *
 * Derives editorial clues directly from the single canonical `window.bitesharkExploration.CANONICAL_STORIES`
 * registry (zero duplicated hardcoded editorial copy) and honors Feature Controls (`street_whispers`,
 * `visit_journal`, `private_photos`, `community_submissions`).
 */
function getStreetClueFiles() {
  const stories =
    typeof window !== 'undefined' &&
    window.bitesharkExploration &&
    Array.isArray(window.bitesharkExploration.CANONICAL_STORIES)
      ? window.bitesharkExploration.CANONICAL_STORIES
      : [];
  return stories
    .filter(s => s && s.clue)
    .map(s => ({
      icon: s.clue.icon || '☕',
      city: s.town,
      kind: s.clue.kicker || s.tag,
      title: s.clue.headline || s.title,
      clue: s.clue.question,
      name: s.vendor_name,
      id: s.vendor_id,
      fact: s.clue.fact || s.summary,
      source: s.corroborating_url || s.source_url
    }));
}

const streetMissions = [
  {
    icon: '🥐',
    title: 'Breakfast detective',
    desc: 'Look up a coffee or breakfast spot you have not tried yet, confirm its published hours, and log a self-reported visit in your Visit journal.',
    kind: 'passport'
  },
  {
    icon: '🌮',
    title: 'One more neighborhood',
    desc: 'Explore a different Sonoma County town in the directory and shortlist a spot for your next outing.',
    kind: 'discover'
  },
  {
    icon: '🧺',
    title: 'Market whisper hunter',
    desc: 'Find a local farmers market and check the organizer’s current schedule before heading out.',
    kind: 'discover'
  },
  {
    icon: '📸',
    title: 'Private tasting memory',
    desc: 'Photograph a dish you tried and save a private caption to your account photo notebook.',
    kind: 'photos'
  },
  {
    icon: '🕵️',
    title: 'The tip worth passing',
    desc: 'Know a menu detail more locals would enjoy? Submit a food-only community tip for moderator review.',
    kind: 'whisper'
  }
];

let streetQuizIndex = -1;
let streetMissionIndex = -1;
let streetCurrentPick = null;

function streetEscape(s) {
  return typeof communityEscape === 'function'
    ? communityEscape(s)
    : String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function streetRandomIndex(length, previous) {
  if (length <= 1) return 0;
  const n = Math.floor(Math.random() * (length - 1));
  return n >= previous ? n + 1 : n;
}

function getEligibleMissions() {
  const fc = typeof window !== 'undefined' && window.bitesharkFeatures ? window.bitesharkFeatures : null;
  if (!fc) return streetMissions;
  return streetMissions.filter(m => {
    if (m.kind === 'passport') {
      return !fc.isHidden('local_guides_passport') && !fc.isHidden('visit_journal');
    }
    if (m.kind === 'photos') {
      return !fc.isHidden('local_guides_passport') && !fc.isHidden('private_photos');
    }
    if (m.kind === 'whisper') {
      return fc.isAvailable('community_submissions');
    }
    return true;
  });
}

function streetNextClue() {
  const streetFiles = getStreetClueFiles();
  const slot = document.getElementById('streetQuiz');
  if (!slot || !streetFiles.length) return;
  streetQuizIndex = streetRandomIndex(streetFiles.length, streetQuizIndex);
  const file = streetFiles[streetQuizIndex];

  const poolIndices = [streetQuizIndex];
  for (let offset = 1; offset < streetFiles.length && poolIndices.length < 3; offset++) {
    poolIndices.push((streetQuizIndex + offset) % streetFiles.length);
  }
  // Fisher-Yates shuffle for genuinely varied answer positions
  for (let i = poolIndices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = poolIndices[i];
    poolIndices[i] = poolIndices[j];
    poolIndices[j] = tmp;
  }

  slot.innerHTML =
    '<span class="street-card-kicker">🕵️ GUESS THE LOCAL SPOT</span>' +
    '<h3>' +
    streetEscape(file.clue) +
    '</h3><div class="street-answers">' +
    poolIndices
      .map(
        i =>
          '<button type="button" data-street-answer="' +
          i +
          '">' +
          streetEscape(streetFiles[i].name) +
          '</button>'
      )
      .join('') +
    '</div><div id="streetQuizAnswer" role="status" aria-live="polite"></div>';

  slot.querySelectorAll('[data-street-answer]').forEach(b => {
    b.addEventListener('click', () => streetAnswerClue(Number(b.dataset.streetAnswer)));
  });
}

function streetAnswerClue(choice) {
  const streetFiles = getStreetClueFiles();
  const slot = document.getElementById('streetQuizAnswer');
  const file = streetFiles[streetQuizIndex];
  if (!slot || !file) return;
  const correct = choice === streetQuizIndex;
  document.querySelectorAll('[data-street-answer]').forEach(b => {
    b.disabled = true;
    b.classList.toggle('correct', Number(b.dataset.streetAnswer) === streetQuizIndex);
  });
  slot.innerHTML =
    '<p><b>' +
    (correct ? 'Case cracked!' : 'Good guess — here is the answer:') +
    '</b> ' +
    streetEscape(file.fact) +
    '</p>' +
    '<div class="street-quiz-footer">' +
    (file.source
      ? '<a href="' + streetEscape(file.source) + '" target="_blank" rel="noopener noreferrer">Check published source ↗</a>'
      : '') +
    '<button type="button" id="streetNextClueBtn">Next clue →</button></div>';
  document.getElementById('streetNextClueBtn')?.addEventListener('click', streetNextClue);
}

function streetRenderFiles() {
  const streetFiles = getStreetClueFiles();
  const row = document.getElementById('streetFiles');
  if (!row || !streetFiles.length) return;
  row.innerHTML = streetFiles
    .map(
      (f, i) =>
        '<article class="street-file">' +
        '<div class="street-file-mark"><span aria-hidden="true">' +
        f.icon +
        '</span><small>' +
        streetEscape(f.city) +
        '</small></div>' +
        '<small>' +
        streetEscape(f.kind) +
        '</small><h3>' +
        streetEscape(f.title) +
        '</h3>' +
        '<p>' +
        streetEscape(f.fact) +
        '</p><div class="street-file-links">' +
        (f.source
          ? '<a href="' + streetEscape(f.source) + '" target="_blank" rel="noopener noreferrer">Published source ↗</a>'
          : '') +
        '<button type="button" data-street-detail="' +
        i +
        '">View listing →</button></div>' +
        '</article>'
    )
    .join('');
  row.querySelectorAll('[data-street-detail]').forEach(b => {
    b.addEventListener('click', () => streetOpenPlace(streetFiles[Number(b.dataset.streetDetail)].id, b));
  });
}

function streetOpenPlace(id, triggerEl) {
  const found =
    typeof trucks !== 'undefined' && Array.isArray(trucks) ? trucks.find(t => t.id === id) : null;
  if (!found) {
    if (typeof toast === 'function') {
      toast('That listing is unavailable while browsing in offline snapshot mode.');
    }
    return;
  }
  if (typeof showScreen === 'function') showScreen('discover');
  if (typeof openDetail === 'function') openDetail(id, triggerEl);
}

function streetMysteryPick() {
  const streetFiles = getStreetClueFiles();
  const box = document.getElementById('streetMysteryResult');
  if (!box || !streetFiles.length) return;
  const options = streetFiles.filter(f => f.id !== streetCurrentPick);
  const file = options[Math.floor(Math.random() * options.length)] || streetFiles[0];
  streetCurrentPick = file.id;
  box.hidden = false;
  box.innerHTML =
    '<div class="street-mystery-reveal"><span aria-hidden="true">' +
    file.icon +
    '</span><div><small>MYSTERY PICK · ' +
    streetEscape(file.city) +
    '</small><h3>' +
    streetEscape(file.name) +
    '</h3><p>' +
    streetEscape(file.fact) +
    '</p></div></div>' +
    '<div class="street-mystery-actions">' +
    '<button type="button" id="streetMysteryOpenBtn">View listing →</button>' +
    (file.source
      ? '<a href="' + streetEscape(file.source) + '" target="_blank" rel="noopener noreferrer">Check source ↗</a>'
      : '') +
    '</div>';
  const openBtn = document.getElementById('streetMysteryOpenBtn');
  if (openBtn) openBtn.addEventListener('click', () => streetOpenPlace(file.id, openBtn));
}

function streetNextMission() {
  const eligible = getEligibleMissions();
  const box = document.getElementById('streetMissionResult');
  if (!box || !eligible.length) return;
  streetMissionIndex = streetRandomIndex(eligible.length, streetMissionIndex);
  const m = eligible[streetMissionIndex];
  box.hidden = false;
  box.innerHTML =
    '<span class="street-card-kicker">FOOD EXPLORATION PROMPT</span><h3>' +
    m.icon +
    ' ' +
    streetEscape(m.title) +
    '</h3><p>' +
    streetEscape(m.desc) +
    '</p><button type="button" id="streetActMissionBtn">' +
    (m.kind === 'passport'
      ? 'Open Visit journal →'
      : m.kind === 'photos'
        ? 'Open private photos →'
        : m.kind === 'whisper'
          ? 'Share a whisper →'
          : 'Browse directory →') +
    '</button>';
  document.getElementById('streetActMissionBtn')?.addEventListener('click', () => {
    if (m.kind === 'passport' && typeof openLocalGuides === 'function') openLocalGuides('passport');
    else if (m.kind === 'photos' && typeof openLocalGuides === 'function') openLocalGuides('photos');
    else if (m.kind === 'whisper' && typeof communityStartPost === 'function') {
      communityStartPost('whisper', 'A food rumor worth checking');
    } else if (typeof showScreen === 'function') {
      showScreen('discover');
    }
  });
}

function streetOpenWhisper() {
  const section = document.getElementById('communityCompose');
  if (section && typeof communityStartPost === 'function') {
    communityStartPost('whisper', 'A food rumor worth checking');
  }
}

function streetInit() {
  if (!document.getElementById('streetFiles')) return;
  streetRenderFiles();
  streetNextClue();
}

streetInit();
