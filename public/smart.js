/* BiteShark Suggested Trails, Flavor Finder & Owner Promo Card Generator (`public/smart.js`)
 *
 * Separates customer discovery tools (`Suggested trails` under `suggested_trails` and `Flavor finder`
 * under `flavor_lab_tools`) from the vendor-only Marketing Kit inside `#ownerScreen`.
 */
let smartMode = 'trail';
let currentTrailPreview = null;
let currentTrailTheme = 'mix';
let currentTrailTown = '';
let currentTrailOffset = 0;
let finderRotationOffset = 0;
let pendingDeleteTrailId = '';

const smartEscape = v =>
  String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function spotUrl(id) {
  return location.origin + '/#spot=' + encodeURIComponent(id);
}

function getSmartFeatureApi() {
  return typeof window !== 'undefined' && window.bitesharkFeatures ? window.bitesharkFeatures : null;
}

function normalizedTownOptions(selectedTown = '') {
  const seen = new Set();
  const list = (typeof trucks !== 'undefined' && Array.isArray(trucks) ? trucks : [])
    .map(t => String(t.city || '').trim())
    .filter(c => c && c.toLowerCase() !== 'sonoma county' && !/county/i.test(c))
    .filter(c => {
      const k = c.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => a.localeCompare(b));

  return (
    '<option value="">Any Sonoma County town</option>' +
    list
      .map(
        c =>
          '<option value="' +
          smartEscape(c) +
          '"' +
          (c === selectedTown ? ' selected' : '') +
          '>' +
          smartEscape(c) +
          '</option>'
      )
      .join('')
  );
}

function smartStatus(msg) {
  const el = document.getElementById('smartMessage');
  if (el) el.textContent = msg || '';
}

function resolveSmartTabAvailability(requestedMode) {
  const fc = getSmartFeatureApi();
  const trailsHidden = Boolean(fc && fc.isHidden('suggested_trails'));
  const finderHidden = Boolean(fc && fc.isHidden('flavor_lab_tools'));

  if (requestedMode === 'trail') {
    if (!trailsHidden) return 'trail';
    return null;
  }
  if (requestedMode === 'finder') {
    if (!finderHidden) return 'finder';
    return null;
  }
  if (!trailsHidden) return 'trail';
  if (!finderHidden) return 'finder';
  return null;
}

async function openSmart(mode = 'trail') {
  if (mode === 'marketing') {
    openOwnerMarketingKit();
    return false;
  }

  const fc = getSmartFeatureApi();
  if (fc && fc.isLoaded && !fc.isLoaded() && typeof fc.waitUntilReady === 'function') {
    try {
      await fc.waitUntilReady();
    } catch {}
  }

  const resolved = resolveSmartTabAvailability(mode);
  if (!resolved) {
    const key = mode === 'trail' ? 'suggested_trails' : 'flavor_lab_tools';
    const msg = (fc && fc.getMessage(key)) || 'This discovery tool is currently unavailable.';
    if (typeof toast === 'function') toast(msg);
    if (typeof showScreen === 'function') showScreen('discover');
    return false;
  }

  showScreen('smart');
  smartMode = resolved;
  smartStatus('Loading local directory…');

  try {
    await (window.bitesharkReady || Promise.resolve());
  } catch {
    smartStatus('Some listings could not load. Please refresh and try again.');
    return false;
  }

  document.querySelectorAll('[data-smart-tab]').forEach(b => {
    const tabMode = b.dataset.smartTab;
    const hidden =
      tabMode === 'trail'
        ? Boolean(fc && fc.isHidden('suggested_trails'))
        : Boolean(fc && fc.isHidden('flavor_lab_tools'));
    b.hidden = hidden;
    const isActive = !hidden && tabMode === resolved;
    b.classList.toggle('active', isActive);
    b.setAttribute('aria-selected', String(isActive));
  });

  smartStatus('');
  if (resolved === 'trail') {
    renderSuggestedTrailsView();
    await buildFoodTrail(null, { preserveOffset: true });
    await renderSavedTrailsList();
  } else {
    renderFlavorFinderView();
  }
  return true;
}

function renderSuggestedTrailsView() {
  const body = document.getElementById('smartBody');
  if (!body) return;
  body.innerHTML =
    '<section class="smart-panel" aria-labelledby="suggestedTrailsHeading">' +
    '<div class="smart-panel-head">' +
    '<h2 id="suggestedTrailsHeading">Suggested trails</h2>' +
    '<p>Generate a 2–3 stop Sonoma County food idea matched by category and town, with clear reasons for every stop. Save trails to your account to track visits over time.</p>' +
    '</div>' +
    '<form id="suggestedTrailForm">' +
    '<div class="smart-controls">' +
    '<label for="smartCity">Town<select id="smartCity">' +
    normalizedTownOptions(currentTrailTown) +
    '</select></label>' +
    '<label for="smartCraving">Trail theme<select id="smartCraving">' +
    '<option value="mix"' +
    (currentTrailTheme === 'mix' ? ' selected' : '') +
    '>Local mix (market/café + savory + sweet)</option>' +
    '<option value="sweet"' +
    (currentTrailTheme === 'sweet' ? ' selected' : '') +
    '>Something sweet (desserts &amp; sweet specialties)</option>' +
    '<option value="farm"' +
    (currentTrailTheme === 'farm' ? ' selected' : '') +
    '>Farm &amp; market stops</option>' +
    '</select></label>' +
    '</div>' +
    '<div class="smart-form-actions">' +
    '<button class="primary" id="buildTrailSubmitBtn" type="submit">Generate suggested trail →</button>' +
    '<button class="secondary" id="rotateTrailBtn" type="button">Try another combination ↻</button>' +
    '</div>' +
    '</form>' +
    '<ul class="trail-disclaimers" aria-label="Important trail notes">' +
    '<li>Hours and mobile locations must be confirmed directly with each vendor before heading out.</li>' +
    '<li>Suggested stops may not operate on the same day.</li>' +
    '<li>This list is an idea from the directory, not a route-optimized navigation itinerary.</li>' +
    '</ul>' +
    '</section>' +
    '<div id="smartResults" class="smart-results" aria-live="polite"></div>' +
    '<section id="mySavedTrailsSection" class="smart-saved-trails" aria-labelledby="savedTrailsHeading"></section>';

  const form = document.getElementById('suggestedTrailForm');
  if (form) {
    form.addEventListener('submit', ev => {
      currentTrailOffset = 0;
      buildFoodTrail(ev, { preserveOffset: true });
    });
  }
  const rotBtn = document.getElementById('rotateTrailBtn');
  if (rotBtn) {
    rotBtn.addEventListener('click', () => {
      currentTrailOffset += 1;
      buildFoodTrail(null, { preserveOffset: true });
    });
  }
}

function renderFlavorFinderView() {
  const body = document.getElementById('smartBody');
  if (!body) return;
  body.innerHTML =
    '<section class="smart-panel" aria-labelledby="flavorFinderHeading">' +
    '<h2 id="flavorFinderHeading">Flavor finder</h2>' +
    '<p>Match a craving and Sonoma County town to listings in our directory.</p>' +
    '<form id="flavorFinderForm">' +
    '<div class="smart-controls">' +
    '<label for="smartCity">Town<select id="smartCity">' +
    normalizedTownOptions('') +
    '</select></label>' +
    '<label for="smartCraving">Your craving<select id="smartCraving">' +
    '<option value="">Surprise my taste buds</option>' +
    '<option value="Mexican">Tacos &amp; Mexican flavors</option>' +
    '<option value="Burgers">Burgers &amp; sandwiches</option>' +
    '<option value="Hot Dogs">Hot dogs &amp; sausages</option>' +
    '<option value="Global">Global street food</option>' +
    '<option value="Sweets">Sweets &amp; frozen treats</option>' +
    '<option value="Coffee">Coffee &amp; cafés</option>' +
    '<option value="Farm Stands">Farm stands</option>' +
    '<option value="Markets">Farmers markets &amp; stalls</option>' +
    '</select></label>' +
    '</div>' +
    '<button class="primary" type="submit">Find matching spots →</button>' +
    '</form>' +
    '<p class="smart-note">Suggestions use directory categories and town—confirm current hours and mobile locations before visiting.</p>' +
    '</section>' +
    '<div id="smartResults" class="smart-results" aria-live="polite"></div>';

  const form = document.getElementById('flavorFinderForm');
  if (form) {
    form.addEventListener('submit', findFlavor);
  }
}

function inSmartTown(t, city) {
  if (!city) return true;
  return String(t.city || '').trim().toLowerCase() === String(city).trim().toLowerCase();
}

function matchesFinderCraving(t, q) {
  if (!q) return true;
  if (q === 'Sweets') {
    const id = String(t.id || '');
    if (['heritage', 'andrew', 'momolicious', 'market-myriad'].includes(id)) return false;
    if (['fruta', 'rich', 'market-boba', 'coffee-crooks'].includes(id)) return true;
    return String(t.cuisine || '').toLowerCase() === 'sweets';
  }
  if (q === 'Coffee') {
    return t.kind === 'Coffee' || t.id === 'market-myriad' || /coffee|caf/i.test(String(t.cuisine || ''));
  }
  if (q === 'Farm Stands') {
    return t.kind === 'Farm Stands' || (t.tags || []).includes('Farm Stands');
  }
  if (q === 'Markets') {
    return t.kind === 'Markets' || (t.tags || []).includes('Markets');
  }
  return t.kind === q || t.cuisine === q || (t.tags || []).includes(q);
}

function findFlavor(e) {
  if (e) e.preventDefault();
  const city = document.getElementById('smartCity')?.value || '';
  const q = document.getElementById('smartCraving')?.value || '';
  const choices = (typeof trucks !== 'undefined' && Array.isArray(trucks) ? trucks : []).filter(
    t => inSmartTown(t, city) && matchesFinderCraving(t, q)
  );
  const resEl = document.getElementById('smartResults');
  if (!resEl) return;

  if (!choices.length) {
    resEl.innerHTML =
      '<p class="smart-notice">No directory matches for that combination yet. Try Any Sonoma County town or another craving.</p>';
    smartStatus('');
    return;
  }

  const start = choices.length > 4 ? (finderRotationOffset * 4) % choices.length : 0;
  finderRotationOffset += 1;
  const rotated = [...choices.slice(start), ...choices.slice(0, start)].slice(0, 4);

  resEl.innerHTML =
    '<p class="smart-notice"><strong>' +
    choices.length +
    '</strong> ' +
    (choices.length === 1 ? 'match' : 'matches') +
    ' for ' +
    smartEscape(q || 'an open appetite') +
    (city ? ' in ' + smartEscape(city) : ' across Sonoma County') +
    '.</p>' +
    rotated
      .map(
        t =>
          '<article class="smart-result">' +
          '<h3>' +
          smartEscape(t.name) +
          '</h3>' +
          '<p>' +
          smartEscape(t.cuisine) +
          ' · ' +
          smartEscape(t.city || 'Sonoma County') +
          '</p>' +
          '<p class="meta">' +
          smartEscape(t.location || 'Confirm current location with vendor') +
          '</p>' +
          '<div class="smart-result-actions">' +
          '<button type="button" data-finder-detail="' +
          smartEscape(t.id) +
          '">View details →</button>' +
          '<button type="button" class="secondary" data-finder-share="' +
          smartEscape(t.id) +
          '">Share spot ↗</button>' +
          '</div></article>'
      )
      .join('');

  resEl.querySelectorAll('[data-finder-detail]').forEach(btn => {
    btn.addEventListener('click', () => openDetail(btn.dataset.finderDetail, btn));
  });
  resEl.querySelectorAll('[data-finder-share]').forEach(btn => {
    btn.addEventListener('click', () => shareSpot(btn.dataset.finderShare));
  });
  smartStatus('');
}

async function buildFoodTrail(e, opts = {}) {
  if (e) e.preventDefault();
  const resEl = document.getElementById('smartResults');
  if (!resEl || !window.bitesharkExploration) return;

  const cityEl = document.getElementById('smartCity');
  const moodEl = document.getElementById('smartCraving');
  if (cityEl) currentTrailTown = cityEl.value;
  if (moodEl) currentTrailTheme = moodEl.value;
  if (!opts.preserveOffset) currentTrailOffset = 0;

  resEl.innerHTML = '<p class="guide-loading-state" role="status">Building suggested trail…</p>';

  try {
    const payload = opts.explicitIds
      ? await window.bitesharkExploration.fetchSuggestedTrail({ ids: opts.explicitIds })
      : await window.bitesharkExploration.fetchSuggestedTrail({
          theme: currentTrailTheme,
          town: currentTrailTown,
          offset: currentTrailOffset
        });

    currentTrailPreview = payload;
    renderTrailPreview(payload);
  } catch (err) {
    const refText = err && err.correlationId ? ' (Ref: ' + smartEscape(err.correlationId) + ')' : '';
    resEl.innerHTML =
      '<div class="dish-empty" role="alert"><h3>Could not build trail right now</h3><p>' +
      smartEscape((err && err.message) || 'Please check your connection and try again.') +
      refText +
      '</p><button type="button" class="secondary" id="retryBuildTrailBtn">Retry</button></div>';
    document.getElementById('retryBuildTrailBtn')?.addEventListener('click', () => buildFoodTrail(null, opts));
  }
}

function renderTrailPreview(payload) {
  const resEl = document.getElementById('smartResults');
  if (!resEl) return;

  const stops = Array.isArray(payload?.stops) ? payload.stops : [];
  if (!stops.length) {
    resEl.innerHTML =
      '<div class="smart-notice">' +
      '<strong>No matching trail stops found</strong>' +
      '<p>' +
      smartEscape(payload?.insufficient_note || 'Try choosing Any Sonoma County town or another trail theme.') +
      '</p>' +
      '</div>';
    return;
  }

  const fc = getSmartFeatureApi();
  const visitHidden = Boolean(
    fc && (fc.isHidden('local_guides_passport') || fc.isHidden('visit_journal'))
  );
  const savePaused = Boolean(fc && !fc.isAvailable('suggested_trails'));
  const activeStops = stops.filter(s => s.available !== false);
  const signedInNow = typeof isSignedIn !== 'undefined' && Boolean(isSignedIn && currentUser);

  const shareQueryPath =
    payload.share_query_path ||
    (activeStops.length ? '/?trail=' + activeStops.map(s => encodeURIComponent(s.vendor_id)).join(',') : '');

  const headingLabel =
    payload.mode === 'shared'
      ? 'Shared suggested trail (' + stops.length + (stops.length === 1 ? ' stop' : ' stops') + ')'
      : 'Suggested ' + stops.length + '-stop trail';

  resEl.innerHTML =
    '<div class="smart-notice trail-preview-header">' +
    '<div>' +
    '<strong>' +
    smartEscape(headingLabel) +
    '</strong>' +
    (payload.insufficient_note
      ? '<p class="smart-note">' + smartEscape(payload.insufficient_note) + '</p>'
      : '') +
    '</div>' +
    '<div class="trail-preview-actions">' +
    (activeStops.length
      ? '<button type="button" class="secondary" id="sharePreviewTrailBtn">Share public link ↗</button>'
      : '') +
    (activeStops.length
      ? signedInNow
        ? !savePaused
          ? '<input id="saveTrailTitleInput" class="trail-title-input" maxlength="100" aria-label="Optional saved trail name" placeholder="Optional custom trail name…">' +
            '<button type="button" class="primary" id="saveTrailToAccountBtn">Save trail to my account</button>'
          : '<span class="guide-unavailable-pill">' +
            smartEscape((fc && fc.getMessage('suggested_trails')) || 'Saving trails is temporarily paused') +
            '</span>'
        : '<a class="primary guide-signin-btn" href="/login.html?next=' +
          encodeURIComponent(shareQueryPath || '/#trails') +
          '">Sign in to save this trail →</a>'
      : '') +
    '</div>' +
    '</div>' +
    '<div class="trail-stops-list">' +
    stops
      .map(
        s =>
          '<article class="smart-result trail-stop-card ' +
          (s.available === false ? 'is-unavailable' : '') +
          '" data-stop-vendor="' +
          smartEscape(s.vendor_id) +
          '">' +
          '<div class="trail-stop-head">' +
          '<span class="trail-number" aria-label="Stop ' +
          Number(s.position) +
          '">' +
          Number(s.position) +
          '</span>' +
          '<div>' +
          '<h3>' +
          smartEscape(s.business_name) +
          '</h3>' +
          (s.available !== false
            ? '<p class="meta">' +
              smartEscape(s.cuisine_label || '') +
              ' · ' +
              smartEscape(s.town || 'Sonoma County') +
              '</p>'
            : '<p class="meta"><span class="guide-unavailable-pill">Unavailable in directory</span></p>') +
          '</div>' +
          '</div>' +
          '<p class="trail-match-reason"><strong>Why it matched:</strong> ' +
          smartEscape(s.match_reason) +
          '</p>' +
          (s.location_note
            ? '<p class="meta">⌖ ' +
              smartEscape(s.location_note) +
              (s.hours_note ? ' · ' + smartEscape(s.hours_note) : '') +
              '</p>'
            : '') +
          (s.available !== false
            ? '<div class="smart-result-actions">' +
              '<button type="button" data-trail-open-detail="' +
              smartEscape(s.vendor_id) +
              '">View details →</button>' +
              (!visitHidden
                ? '<button type="button" class="secondary" data-trail-log-visit="' +
                  smartEscape(s.vendor_id) +
                  '">✓ Log a visit</button>'
                : '') +
              '</div>'
            : '') +
          '</article>'
      )
      .join('') +
    '</div>';

  resEl.querySelectorAll('[data-trail-open-detail]').forEach(btn => {
    btn.addEventListener('click', () => openDetail(btn.dataset.trailOpenDetail, btn));
  });
  resEl.querySelectorAll('[data-trail-log-visit]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (typeof openVisitJournalForBusiness === 'function') {
        openVisitJournalForBusiness(btn.dataset.trailLogVisit);
      }
    });
  });

  document.getElementById('sharePreviewTrailBtn')?.addEventListener('click', () => {
    shareTrailByStopIds(activeStops.map(s => s.vendor_id));
  });

  const saveBtn = document.getElementById('saveTrailToAccountBtn');
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      saveBtn.disabled = true;
      saveBtn.setAttribute('aria-busy', 'true');
      const customTitle = (document.getElementById('saveTrailTitleInput')?.value || '').trim();
      try {
        await window.bitesharkExploration.saveTrail({
          title: customTitle,
          themeKey: payload.mode === 'shared' ? 'shared' : payload.theme || currentTrailTheme,
          townFilter: payload.town || currentTrailTown || null,
          stops: activeStops.map(s => ({
            vendor_id: s.vendor_id,
            match_reason: s.match_reason
          }))
        });
        smartStatus('Saved trail to your BiteShark account.');
        if (typeof toast === 'function') toast('Saved trail to your account!');
        const titleInput = document.getElementById('saveTrailTitleInput');
        if (titleInput) titleInput.value = '';
        await renderSavedTrailsList();
      } catch (err) {
        const refText = err && err.correlationId ? ' (Ref: ' + err.correlationId + ')' : '';
        smartStatus(((err && err.message) || 'Could not save trail right now.') + refText);
      } finally {
        saveBtn.disabled = false;
        saveBtn.removeAttribute('aria-busy');
      }
    });
  }
}

async function renderSavedTrailsList() {
  const host = document.getElementById('mySavedTrailsSection');
  if (!host || !window.bitesharkExploration) return;

  const signedInNow = typeof isSignedIn !== 'undefined' && Boolean(isSignedIn && currentUser);
  if (!signedInNow) {
    host.innerHTML = '';
    return;
  }

  host.innerHTML = '<p class="guide-loading-state" role="status">Loading your saved trails…</p>';

  try {
    const out = await window.bitesharkExploration.listSavedTrails({ limit: 20 });
    const trails = Array.isArray(out.trails) ? out.trails : [];
    const fc = getSmartFeatureApi();
    const visitHidden = Boolean(
      fc && (fc.isHidden('local_guides_passport') || fc.isHidden('visit_journal'))
    );

    if (!trails.length) {
      host.innerHTML =
        '<div class="smart-panel saved-trails-empty">' +
        '<h3 id="savedTrailsHeading">Your saved trails (0)</h3>' +
        '<p class="meta">Save any suggested trail above to keep its ordered stops across devices and track your visits.</p>' +
        '</div>';
      return;
    }

    host.innerHTML =
      '<div class="smart-panel">' +
      '<div class="passport-title">' +
      '<h3 id="savedTrailsHeading">Your saved trails (' +
      trails.length +
      ')</h3>' +
      '<p>Stops count as visited for a trail when you log a self-reported visit on or after the date the trail was saved. Viewing or sharing a trail never auto-logs a visit.</p>' +
      '</div>' +
      '<div class="saved-trails-grid">' +
      trails
        .map(tr => {
          const confirming = pendingDeleteTrailId === tr.trail_id;
          const shareIds = (tr.stops || []).filter(s => s.can_open_detail).map(s => s.vendor_id);
          return (
            '<article class="saved-trail-card" data-saved-trail-id="' +
            smartEscape(tr.trail_id) +
            '">' +
            '<div class="saved-trail-head">' +
            '<div>' +
            '<small>SAVED ' +
            smartEscape(tr.saved_local_date) +
            (tr.town_filter ? ' · ' + smartEscape(tr.town_filter) : '') +
            '</small>' +
            '<h4>' +
            smartEscape(tr.title) +
            '</h4>' +
            '</div>' +
            '<span class="saved-trail-progress ' +
            (tr.progress.completed ? 'is-complete' : '') +
            '">' +
            tr.progress.completed_stops +
            ' / ' +
            tr.progress.total_stops +
            (tr.progress.completed ? ' ✓ Completed' : ' visited') +
            '</span>' +
            '</div>' +
            '<ol class="saved-trail-stops">' +
            (tr.stops || [])
              .map(
                st =>
                  '<li>' +
                  '<div class="saved-stop-copy">' +
                  (st.can_open_detail
                    ? '<button type="button" class="visit-place-link" data-saved-stop-detail="' +
                      smartEscape(st.vendor_id) +
                      '">' +
                      smartEscape(st.business_name) +
                      ' →</button>'
                    : '<span>' +
                      smartEscape(st.business_name) +
                      ' <span class="guide-unavailable-pill">(Unavailable)</span></span>') +
                  '<small>' +
                  smartEscape(st.match_reason) +
                  '</small>' +
                  '</div>' +
                  '<div class="saved-stop-status">' +
                  (st.visited_since_save
                    ? '<span class="stop-visited-badge">✓ Visited ' +
                      smartEscape(st.qualifying_visit_date || '') +
                      '</span>'
                    : !visitHidden && st.can_open_detail
                      ? '<button type="button" class="secondary small-btn" data-saved-stop-log="' +
                        smartEscape(st.vendor_id) +
                        '">Log a visit</button>'
                      : '<span class="meta">Not yet logged</span>') +
                  '</div>' +
                  '</li>'
              )
              .join('') +
            '</ol>' +
            '<div class="saved-trail-footer">' +
            (shareIds.length
              ? '<button type="button" class="secondary small-btn" data-share-saved-stops="' +
                smartEscape(shareIds.join(',')) +
                '">Share public stops ↗</button>'
              : '') +
            (!confirming
              ? '<button type="button" class="danger-link" data-ask-delete-trail="' +
                smartEscape(tr.trail_id) +
                '">Remove trail</button>'
              : '<div class="guide-confirm-box" role="group" aria-label="Confirm removing saved trail">' +
                '<small>Remove this saved trail? Your Visit journal entries will not be affected.</small>' +
                '<div class="guide-confirm-btns">' +
                '<button type="button" class="danger-btn" data-confirm-delete-trail="' +
                smartEscape(tr.trail_id) +
                '">Confirm remove</button>' +
                '<button type="button" class="secondary" data-cancel-delete-trail="1">Cancel</button>' +
                '</div></div>') +
            '</div>' +
            '</article>'
          );
        })
        .join('') +
      '</div></div>';

    host.querySelectorAll('[data-saved-stop-detail]').forEach(btn => {
      btn.addEventListener('click', () => openDetail(btn.dataset.savedStopDetail, btn));
    });
    host.querySelectorAll('[data-saved-stop-log]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (typeof openVisitJournalForBusiness === 'function') {
          openVisitJournalForBusiness(btn.dataset.savedStopLog);
        }
      });
    });
    host.querySelectorAll('[data-share-saved-stops]').forEach(btn => {
      btn.addEventListener('click', () => {
        const ids = String(btn.dataset.shareSavedStops || '').split(',').filter(Boolean);
        shareTrailByStopIds(ids);
      });
    });
    host.querySelectorAll('[data-ask-delete-trail]').forEach(btn => {
      btn.addEventListener('click', () => {
        pendingDeleteTrailId = btn.dataset.askDeleteTrail;
        renderSavedTrailsList();
      });
    });
    host.querySelectorAll('[data-cancel-delete-trail]').forEach(btn => {
      btn.addEventListener('click', () => {
        pendingDeleteTrailId = '';
        renderSavedTrailsList();
      });
    });
    host.querySelectorAll('[data-confirm-delete-trail]').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          await window.bitesharkExploration.deleteSavedTrail({ trailId: btn.dataset.confirmDeleteTrail });
          pendingDeleteTrailId = '';
          smartStatus('Removed saved trail.');
          await renderSavedTrailsList();
        } catch (err) {
          btn.disabled = false;
          smartStatus((err && err.message) || 'Could not remove saved trail.');
        }
      });
    });
  } catch (err) {
    host.innerHTML =
      '<div class="dish-empty" role="alert"><p>' +
      smartEscape((err && err.message) || 'Saved trails could not be loaded right now.') +
      '</p><button type="button" class="secondary" id="retrySavedTrailsBtn">Retry</button></div>';
    document.getElementById('retrySavedTrailsBtn')?.addEventListener('click', () => renderSavedTrailsList());
  }
}

async function shareText(title, text, url) {
  try {
    if (navigator.share) {
      await navigator.share({ title, text, url });
      return 'Shared';
    }
    await navigator.clipboard.writeText(text + '\n' + url);
    return 'Link copied to clipboard';
  } catch (e) {
    if (e && e.name === 'AbortError') return 'Sharing cancelled';
    try {
      await navigator.clipboard.writeText(text + '\n' + url);
      return 'Link copied to clipboard';
    } catch {
      return 'Share link: ' + url;
    }
  }
}

async function shareSpot(id) {
  const t = (typeof trucks !== 'undefined' && Array.isArray(trucks) ? trucks : []).find(x => x.id === id);
  if (!t) return;
  const result = await shareText(
    'A good find on BiteShark',
    'Local Sonoma County spot: ' + t.name + ' · ' + (t.city || 'Sonoma County') + '. Confirm hours & location before visiting.',
    spotUrl(id)
  );
  if (typeof toast === 'function') toast(result);
}

async function shareTrailByStopIds(stopIds) {
  if (!Array.isArray(stopIds) || !stopIds.length) return;
  // Share URL carries ONLY public vendor slugs — never private trail titles, notes, or user IDs!
  const url = location.origin + '/?trail=' + stopIds.map(encodeURIComponent).join(',');
  const msg = await shareText(
    'Suggested Sonoma County trail on BiteShark',
    'Suggested local stops on BiteShark. Check each vendor’s current hours and location before heading out.',
    url
  );
  smartStatus(msg);
  if (typeof toast === 'function') toast(msg);
}

// =========================================================================
// Vendor-Only Marketing Kit inside `#ownerScreen` (`Section 10`)
// =========================================================================
function getAuthorizedOwnerPromoListings() {
  const all = typeof trucks !== 'undefined' && Array.isArray(trucks) ? trucks : [];
  if (
    typeof ownerAccess !== 'undefined' &&
    ownerAccess &&
    !ownerAccess.isPlatformAdmin &&
    !ownerAccess.isModerator &&
    Array.isArray(ownerAccess.vendors) &&
    ownerAccess.vendors.length > 0
  ) {
    const allowedSet = new Set(ownerAccess.vendors);
    const scoped = all.filter(t => allowedSet.has(t.id));
    if (scoped.length > 0) return scoped;
  }
  return all;
}

function openOwnerMarketingKit() {
  if (typeof showScreen === 'function') showScreen('owner');
  const panel = document.getElementById('ownerMarketingPanel');
  if (!panel) return;
  panel.hidden = false;
  const list = getAuthorizedOwnerPromoListings();
  const preferredId = typeof ownerTruckId === 'string' && ownerTruckId ? ownerTruckId : list[0]?.id || '';

  panel.innerHTML =
    '<label for="promoSpot">Managed listing' +
    '<select id="promoSpot">' +
    list
      .map(
        t =>
          '<option value="' +
          smartEscape(t.id) +
          '"' +
          (t.id === preferredId ? ' selected' : '') +
          '>' +
          smartEscape(t.name) +
          '</option>'
      )
      .join('') +
    '</select></label>' +
    '<div id="promoBody"></div>' +
    '<p id="ownerPromoStatus" class="meta" role="status" aria-live="polite"></p>';

  document.getElementById('promoSpot')?.addEventListener('change', renderOwnerPromo);
  renderOwnerPromo();
  panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function renderOwnerPromo() {
  const sel = document.getElementById('promoSpot');
  const body = document.getElementById('promoBody');
  if (!sel || !body) return;
  const t = (typeof trucks !== 'undefined' && Array.isArray(trucks) ? trucks : []).find(x => x.id === sel.value);
  if (!t) return;

  const caption =
    'Good food. Word gets around.\n\nFind ' +
    t.name +
    ' on BiteShark.\n' +
    (t.city || 'Sonoma County') +
    ' · ' +
    t.cuisine +
    '\n\nCheck our listing for current hours and location details before heading over:\n' +
    spotUrl(t.id) +
    '\n\n#BiteShark #EatLocal #SonomaCountyFood';

  body.innerHTML =
    '<div class="promo-preview"><small>BITESHARK · EAT LOCAL</small><h3>' +
    smartEscape(t.name) +
    '</h3><p>' +
    smartEscape(t.city || 'Sonoma County') +
    ' · ' +
    smartEscape(t.cuisine) +
    '</p><b>Good food. Word gets around.</b></div>' +
    '<label for="promoCaption">Social caption — edit before posting<textarea id="promoCaption">' +
    smartEscape(caption) +
    '</textarea></label>' +
    '<div class="promo-actions">' +
    '<button type="button" class="secondary" id="copyOwnerPromoBtn">Copy caption</button>' +
    '<button type="button" class="secondary" id="downloadOwnerPromoBtn">Download SVG card ↓</button>' +
    '<button type="button" class="secondary" id="shareOwnerPromoBtn">Share listing link ↗</button>' +
    '</div>' +
    '<p class="smart-note">Downloads a vector SVG card locally. Nothing is posted automatically.</p>';

  document.getElementById('copyOwnerPromoBtn')?.addEventListener('click', copyOwnerPromo);
  document.getElementById('downloadOwnerPromoBtn')?.addEventListener('click', downloadOwnerPromo);
  document.getElementById('shareOwnerPromoBtn')?.addEventListener('click', () => shareSpot(t.id));
}

async function copyOwnerPromo() {
  const statusEl = document.getElementById('ownerPromoStatus');
  const capEl = document.getElementById('promoCaption');
  if (!capEl) return;
  try {
    await navigator.clipboard.writeText(capEl.value);
    if (statusEl) statusEl.textContent = 'Caption copied to clipboard.';
  } catch {
    capEl.select();
    if (statusEl) statusEl.textContent = 'Selected caption above — press copy.';
  }
}

function downloadOwnerPromo() {
  const sel = document.getElementById('promoSpot');
  const statusEl = document.getElementById('ownerPromoStatus');
  const t = (typeof trucks !== 'undefined' && Array.isArray(trucks) ? trucks : []).find(
    x => x.id === (sel ? sel.value : '')
  );
  if (!t) return;
  const words = String(t.name || '').split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > 23 && line) {
      lines.push(line);
      line = w;
    } else {
      line = (line + ' ' + w).trim();
    }
  }
  if (line) lines.push(line);

  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">' +
    '<rect width="1080" height="1080" fill="#f3c35c"/>' +
    '<rect x="30" y="30" width="1020" height="1020" rx="24" fill="#214b3b"/>' +
    '<text x="95" y="150" font-family="sans-serif" font-weight="bold" font-size="28" fill="#fff3d6" letter-spacing="5">BITESHARK · EAT LOCAL</text>' +
    lines
      .slice(0, 5)
      .map(
        (l, i) =>
          '<text x="90" y="' +
          (310 + i * 92) +
          '" font-family="sans-serif" font-size="74" font-weight="bold" fill="#f3c35c">' +
          smartEscape(l) +
          '</text>'
      )
      .join('') +
    '<text x="95" y="820" font-family="sans-serif" font-size="30" fill="#fff3d6">' +
    smartEscape(t.city || 'Sonoma County') +
    '</text>' +
    '<text x="95" y="900" font-family="sans-serif" font-size="36" font-weight="bold" fill="#fff3d6">Good food. Word gets around.</text>' +
    '<text x="95" y="970" font-family="sans-serif" font-size="23" fill="#fff3d6">' +
    smartEscape(location.hostname) +
    '</text></svg>';

  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'biteshark-' + t.id + '-promo.svg';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  if (statusEl) statusEl.textContent = 'Downloaded SVG promo card.';
}

// =========================================================================
// Detail Share Button + `#spot=` / `#trail=` / `?trail=` / `#trails` Deep Links
// =========================================================================
const originalBiteSharkDetail = typeof openDetail === 'function' ? openDetail : null;
if (originalBiteSharkDetail) {
  openDetail = function (id, triggerEl) {
    originalBiteSharkDetail(id, triggerEl);
    const t = (typeof trucks !== 'undefined' && Array.isArray(trucks) ? trucks : []).find(x => x.id === id);
    if (!t) return;
    const body = document.querySelector('#detailContent .detail-body');
    if (body && !body.querySelector('.smart-share')) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'smart-share';
      btn.textContent = 'Share this listing ↗';
      btn.onclick = () => shareSpot(id);
      body.appendChild(btn);
    }
  };
}

async function openSmartDeepLink() {
  const hashRaw = String(location.hash || '').slice(1);
  const hashParams = new URLSearchParams(hashRaw);
  const searchParams = new URLSearchParams(location.search || '');

  const spot = hashParams.get('spot');
  const trailRaw = hashParams.get('trail') || searchParams.get('trail');
  const lowerHash = hashRaw.trim().toLowerCase();

  if (lowerHash === 'trails' || lowerHash === 'suggested-trails') {
    await openSmart('trail');
    return;
  }
  if (lowerHash === 'finder') {
    await openSmart('finder');
    return;
  }
  if (!spot && !trailRaw) return;

  try {
    await (window.bitesharkReady || Promise.resolve());
  } catch {
    return;
  }

  if (spot) {
    const t = (typeof trucks !== 'undefined' && Array.isArray(trucks) ? trucks : []).find(x => x.id === spot);
    if (t) openDetail(t.id);
    else if (typeof toast === 'function') toast('This listing is not currently in the active directory.');
    return;
  }

  if (trailRaw) {
    const ids = trailRaw
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .slice(0, 6);
    if (!ids.length) return;
    const opened = await openSmart('trail');
    if (!opened) return;
    await buildFoodTrail(null, { explicitIds: ids, preserveOffset: true });
    await renderSavedTrailsList();
  }
}

window.addEventListener('hashchange', openSmartDeepLink);
openSmartDeepLink();
