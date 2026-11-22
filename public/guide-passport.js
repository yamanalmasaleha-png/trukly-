/* BiteShark Account-Backed Visit Journal, Badges, Levels, Weekly Challenge & Legacy Import
 * (`public/guide-passport.js`)
 *
 * Customer-facing primary label: "Visit journal" (secondary branded subtitle: "Food Passport").
 * All durable progress lives on the user's BiteShark account (`/api/me/exploration`, `/api/me/visits`).
 */
let journalState = {
  visits: [],
  pagination: { total: 0, limit: 15, offset: 0, has_more: false },
  spotFilterQuery: '',
  selectedVendorId: '',
  draftNote: '',
  pendingDeleteVisitId: '',
  confirmingLegacyDiscard: false,
  legacyImportReport: null,
  statusMessage: '',
  statusTone: 'info'
};
let journalRenderSeq = 0;

function guidePassportHtmlEscape(s) {
  return typeof guidesEscape === 'function'
    ? guidesEscape(s)
    : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
}

function guidePlaces() {
  const seen = new Set();
  return (typeof trucks !== 'undefined' && Array.isArray(trucks) ? trucks : [])
    .filter(t => {
      if (!t || !t.id || seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    })
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
}

function guidePlace(id) {
  return guidePlaces().find(t => t.id === id) || null;
}

function getJournalFeatureApi() {
  return typeof window !== 'undefined' && window.bitesharkFeatures ? window.bitesharkFeatures : null;
}

function renderLegacyMigrationBannerHtml(legacySnap, userEmail) {
  if (journalState.legacyImportReport) {
    const rep = journalState.legacyImportReport;
    const failedTotal = rep.visits_failed.length + rep.photos_failed.length;
    const toneClass = rep.partial_failure ? 'is-warning' : 'is-success';
    const failureItems = [
      ...rep.visits_failed.map(f => '<li>Visit (' + guidePassportHtmlEscape(f.vendor_id || f.client_ref) + '): ' + guidePassportHtmlEscape(f.message) + '</li>'),
      ...rep.photos_failed.map(f => '<li>Photo (' + guidePassportHtmlEscape(f.label) + '): ' + guidePassportHtmlEscape(f.message) + '</li>')
    ].join('');

    return (
      '<section class="passport-legacy-banner ' +
      toneClass +
      '" role="region" aria-label="Device import summary">' +
      '<h3>' +
      (rep.partial_failure
        ? 'Device import completed with some unimported items'
        : 'Device data imported into your account') +
      '</h3>' +
      '<p>Imported <strong>' +
      rep.visits_imported +
      '</strong> new visit(s) and <strong>' +
      rep.photos_imported +
      '</strong> photo(s)' +
      (rep.visits_already_present + rep.photos_already_present > 0
        ? ' (' + (rep.visits_already_present + rep.photos_already_present) + ' duplicate(s) already on your account were skipped)'
        : '') +
      '.</p>' +
      (failedTotal > 0
        ? '<p><strong>' +
          failedTotal +
          ' item(s) could not be imported</strong> and were kept intact on this device so no data was lost:</p><ul class="legacy-error-list">' +
          failureItems +
          '</ul>'
        : '') +
      '<div class="legacy-banner-actions">' +
      (failedTotal > 0
        ? '<button type="button" class="secondary" id="legacyRetryImportBtn">Retry remaining items</button>' +
          '<button type="button" class="danger-link" id="legacyAskDiscardBtn">Discard unimported device items</button>'
        : '') +
      '<button type="button" class="secondary" id="legacyDismissReportBtn">Dismiss</button>' +
      '</div>' +
      '</section>'
    );
  }

  if (!legacySnap || !legacySnap.has_legacy_data || legacySnap.dismissed_for_session) {
    return '';
  }

  const parts = [];
  if (legacySnap.visit_count > 0) parts.push(legacySnap.visit_count + ' visit' + (legacySnap.visit_count === 1 ? '' : 's'));
  if (legacySnap.photo_count > 0) parts.push(legacySnap.photo_count + ' photo' + (legacySnap.photo_count === 1 ? '' : 's'));

  return (
    '<section class="passport-legacy-banner" id="legacyImportPrompt" role="region" aria-labelledby="legacyImportHeading">' +
    '<small>DEVICE DATA FOUND IN THIS BROWSER</small>' +
    '<h3 id="legacyImportHeading">Import the visits and photos saved on this device into this account?</h3>' +
    '<p>Found <strong>' +
    guidePassportHtmlEscape(parts.join(' and ')) +
    '</strong> saved locally in this browser. Target account: <strong>' +
    guidePassportHtmlEscape(userEmail) +
    '</strong>.</p>' +
    '<p class="legacy-warning-note">Note: Earlier device-only entries were saved without an account and may have been created by another person using this browser. Only import them if they belong to you.</p>' +
    '<p id="legacyImportLiveStatus" class="meta" role="status" aria-live="polite"></p>' +
    (!journalState.confirmingLegacyDiscard
      ? '<div class="legacy-banner-actions">' +
        '<button type="button" class="primary" id="legacyConfirmImportBtn">Import into ' +
        guidePassportHtmlEscape(userEmail) +
        '</button>' +
        '<button type="button" class="secondary" id="legacyNotNowBtn">Not now</button>' +
        '<button type="button" class="danger-link" id="legacyAskDiscardBtn">Discard device data</button>' +
        '</div>'
      : '<div class="guide-confirm-box" role="group" aria-label="Confirm discarding local device data">' +
        '<small>Permanently remove the unimported device-only visits and photos from this browser without adding them to any account?</small>' +
        '<div class="guide-confirm-btns">' +
        '<button type="button" class="danger-btn" id="legacyConfirmDiscardBtn">Confirm discard from browser</button>' +
        '<button type="button" class="secondary" id="legacyCancelDiscardBtn">Cancel</button>' +
        '</div></div>') +
    '</section>'
  );
}

function renderSignedOutVisitJournalHtml() {
  const fc = getJournalFeatureApi();
  const storiesAvail = !fc || !fc.isHidden('editorial_stories');
  const trailsAvail = !fc || !fc.isHidden('suggested_trails');

  return (
    '<section class="passport-panel passport-signin-card">' +
    '<small>VISIT JOURNAL · ACCOUNT-BACKED</small>' +
    '<h2>Keep your personal Sonoma County Visit journal</h2>' +
    '<p>Sign in to log self-reported visits (including repeat visits on new days), add private tasting notes, track the Monday–Sunday weekly challenge, and unlock non-monetary exploration badges across sessions and devices.</p>' +
    '<div class="passport-signin-actions">' +
    '<a id="journalSignInLink" class="primary guide-signin-btn" href="/login.html?next=%2F%23passport">Sign in to use Visit journal →</a>' +
    (storiesAvail
      ? '<button type="button" class="secondary" id="journalBrowseStoriesBtn">Read editorial stories</button>'
      : '') +
    (trailsAvail
      ? '<button type="button" class="secondary" id="journalBrowseTrailsBtn">Explore suggested trails</button>'
      : '') +
    '</div>' +
    '<p class="passport-privacy">Visits are self-reported (not GPS-, purchase-, or vendor-verified). Points and badges have no monetary or redeemable value.</p>' +
    '</section>'
  );
}

function renderAchievementsSectionHtml(summary) {
  if (!summary || summary.achievements_hidden || !summary.achievements) {
    return '';
  }
  const ach = summary.achievements;
  const curLvl = ach.current_level;
  const nextLvl = ach.next_level;
  const pct = Number(ach.progress_percent || 0);

  const badgesHtml = (ach.badges || [])
    .map(
      b =>
        '<article class="passport-badge ' +
        (b.earned ? 'unlocked' : 'locked') +
        '" data-badge-id="' +
        guidePassportHtmlEscape(b.badge_id) +
        '">' +
        '<div class="badge-symbol" aria-hidden="true">' +
        guidePassportHtmlEscape(b.icon) +
        '</div>' +
        '<div><h3>' +
        guidePassportHtmlEscape(b.title) +
        '</h3><p>' +
        guidePassportHtmlEscape(b.rule) +
        '</p><small>' +
        (b.earned ? '✓ Earned' : Math.min(b.current, b.target) + ' / ' + b.target) +
        '</small></div></article>'
    )
    .join('');

  return (
    '<section class="passport-panel" id="journalAchievementsPanel" aria-label="Exploration points, level, and badges">' +
    '<div class="passport-summary-bar">' +
    '<div>' +
    '<small>FOOD PASSPORT · EXPLORATION PROGRESS</small>' +
    '<div class="passport-level">Level ' +
    curLvl.number +
    ' · ' +
    guidePassportHtmlEscape(curLvl.title) +
    '</div>' +
    '<div class="passport-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' +
    pct +
    '" aria-label="Progress to next exploration level"><span style="width:' +
    pct +
    '%"></span></div>' +
    '<small>' +
    ach.total_points +
    ' points (' +
    ach.visit_points +
    ' visit pts · ' +
    ach.photo_points +
    ' photo pts)' +
    (nextLvl
      ? ' · ' + nextLvl.points_needed + ' pts to ' + guidePassportHtmlEscape(nextLvl.title)
      : ' · Top level reached') +
    '</small>' +
    '</div>' +
    '<div class="passport-stats">' +
    '<div><b>' +
    summary.counts.total_visits +
    '</b><span>Total visits</span></div>' +
    '<div><b>' +
    summary.counts.distinct_businesses +
    '</b><span>Distinct spots</span></div>' +
    '<div><b>' +
    ach.earned_badge_count +
    '/' +
    ach.total_badge_count +
    '</b><span>Badges</span></div>' +
    '</div>' +
    '</div>' +
    '<div class="passport-badges">' +
    badgesHtml +
    '</div>' +
    '<p class="passport-disclosure-inline">' +
    guidePassportHtmlEscape(summary.disclosures.non_monetary) +
    ' ' +
    guidePassportHtmlEscape(summary.disclosures.reversible_progress) +
    '</p>' +
    '</section>'
  );
}

function renderWeeklyChallengeHtml(summary) {
  if (!summary || summary.weekly_challenge_hidden || !summary.weekly_challenge) {
    return '';
  }
  const ch = summary.weekly_challenge;
  return (
    '<section class="passport-challenges" id="journalWeeklyChallengePanel" aria-label="Weekly exploration challenge">' +
    '<div>' +
    '<small>WEEKLY CHALLENGE · ' +
    guidePassportHtmlEscape(ch.week_start_date) +
    ' TO ' +
    guidePassportHtmlEscape(ch.week_end_date) +
    ' (PT)</small>' +
    '<h3>' +
    guidePassportHtmlEscape(ch.title) +
    '</h3>' +
    '<p>' +
    guidePassportHtmlEscape(ch.rule_summary) +
    '</p>' +
    '</div>' +
    '<div class="challenge-count" aria-live="polite">' +
    ch.progress_stops +
    ' / ' +
    ch.target_stops +
    ' ' +
    (ch.completed ? '✓ Complete' : 'logged') +
    '</div>' +
    '</section>'
  );
}

function getFilteredPlaceOptions(queryText, selectedId) {
  const all = guidePlaces();
  const q = String(queryText || '').trim().toLowerCase();
  const matched = q
    ? all.filter(p =>
        [p.name, p.city, p.cuisine, p.kind, p.location]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q)
      )
    : all;
  if (selectedId && !matched.some(p => p.id === selectedId)) {
    const pinned = all.find(p => p.id === selectedId);
    if (pinned) matched.unshift(pinned);
  }
  return matched;
}

async function renderGuidePassport(opts = {}) {
  const host = document.getElementById('guidePassport');
  if (!host || !window.bitesharkExploration) return;
  const seq = ++journalRenderSeq;

  if (typeof preselectedVisitVendorId === 'string' && preselectedVisitVendorId) {
    journalState.selectedVendorId = preselectedVisitVendorId;
    preselectedVisitVendorId = '';
  }

  const signedInNow = typeof isSignedIn !== 'undefined' && Boolean(isSignedIn && currentUser);
  if (!signedInNow) {
    host.innerHTML = renderSignedOutVisitJournalHtml();
    const sBtn = document.getElementById('journalBrowseStoriesBtn');
    if (sBtn) sBtn.addEventListener('click', () => showGuidesTab('stories'));
    const tBtn = document.getElementById('journalBrowseTrailsBtn');
    if (tBtn && typeof openSmart === 'function') tBtn.addEventListener('click', () => openSmart('trail'));
    return;
  }

  if (!opts.keepExistingList) {
    host.innerHTML = '<p class="guide-loading-state" role="status">Loading your Visit journal…</p>';
  }

  try {
    const [summary, visitsPayload, legacySnap] = await Promise.all([
      window.bitesharkExploration.getSummary({ force: Boolean(opts.forceSummary) }),
      opts.keepExistingList
        ? Promise.resolve({ visits: journalState.visits, pagination: journalState.pagination })
        : window.bitesharkExploration.listVisits({ limit: 15, offset: 0 }),
      window.bitesharkExploration.inspectLegacyDeviceData()
    ]);
    if (seq !== journalRenderSeq) return;

    journalState.visits = Array.isArray(visitsPayload.visits) ? visitsPayload.visits : [];
    journalState.pagination = visitsPayload.pagination || {
      total: journalState.visits.length,
      limit: 15,
      offset: 0,
      has_more: false
    };

    const fc = getJournalFeatureApi();
    const loggingPaused = Boolean(
      fc && (!fc.isAvailable('local_guides_passport') || !fc.isAvailable('visit_journal'))
    );
    const pausedMessage =
      loggingPaused && fc
        ? (!fc.isAvailable('visit_journal') && fc.getMessage('visit_journal')) ||
          fc.getMessage('local_guides_passport')
        : '';

    const filteredPlaces = getFilteredPlaceOptions(journalState.spotFilterQuery, journalState.selectedVendorId);
    const selectedPlace = guidePlace(journalState.selectedVendorId);

    const optionsHtml = filteredPlaces
      .map(
        p =>
          '<option value="' +
          guidePassportHtmlEscape(p.id) +
          '"' +
          (p.id === journalState.selectedVendorId ? ' selected' : '') +
          '>' +
          guidePassportHtmlEscape(p.name) +
          ' · ' +
          guidePassportHtmlEscape(p.city || 'Sonoma County') +
          '</option>'
      )
      .join('');

    const visitsHtml = journalState.visits.length
      ? journalState.visits
          .map(v => {
            const confirmingDel = journalState.pendingDeleteVisitId === v.visit_id;
            const titleNode = v.can_open_detail
              ? '<button type="button" class="visit-place-link" data-visit-open-detail="' +
                guidePassportHtmlEscape(v.vendor_id) +
                '">' +
                guidePassportHtmlEscape(v.business_name) +
                ' →</button>'
              : '<strong>' +
                guidePassportHtmlEscape(v.business_name) +
                ' <span class="guide-unavailable-pill">(Unavailable)</span></strong>';

            return (
              '<li class="passport-visit-item" data-visit-id="' +
              guidePassportHtmlEscape(v.visit_id) +
              '">' +
              '<div class="passport-visit-main">' +
              titleNode +
              '<small>' +
              guidePassportHtmlEscape(v.visit_local_date) +
              ' · ' +
              guidePassportHtmlEscape(v.display_town) +
              ' · <span class="private-pill">Self-reported</span></small>' +
              (v.private_note
                ? '<p class="passport-visit-note"><span class="private-note-tag">Private note:</span> ' +
                  guidePassportHtmlEscape(v.private_note) +
                  '</p>'
                : '') +
              '</div>' +
              (!confirmingDel
                ? '<button type="button" class="danger-link" data-ask-delete-visit="' +
                  guidePassportHtmlEscape(v.visit_id) +
                  '" aria-label="Remove visit to ' +
                  guidePassportHtmlEscape(v.business_name) +
                  ' on ' +
                  guidePassportHtmlEscape(v.visit_local_date) +
                  '">Remove</button>'
                : '<div class="guide-confirm-box" role="group" aria-label="Confirm removing visit">' +
                  '<small>Remove this visit? Points (-25 pts), badges, weekly challenge, and saved-trail progress will recalculate.</small>' +
                  '<div class="guide-confirm-btns">' +
                  '<button type="button" class="danger-btn" data-confirm-delete-visit="' +
                  guidePassportHtmlEscape(v.visit_id) +
                  '">Confirm remove</button>' +
                  '<button type="button" class="secondary" data-cancel-delete-visit="1">Cancel</button>' +
                  '</div></div>') +
              '</li>'
            );
          })
          .join('')
      : '<li class="passport-empty">No visits in your journal yet. Log a place you visited above to start your record.</li>';

    host.innerHTML =
      renderLegacyMigrationBannerHtml(legacySnap, currentUser.email || 'your account') +
      '<section class="passport-panel" id="journalLogPanel" aria-labelledby="journalLogHeading">' +
      '<div class="passport-title">' +
      '<h2 id="journalLogHeading">Log a visit</h2>' +
      '<p>Self-reported check-in for today (' +
      guidePassportHtmlEscape(summary.today_local_date) +
      ' Pacific time) — not GPS-, purchase-, or vendor-verified. Repeat visits on different days are welcome (1 counted visit per business per day).</p>' +
      '</div>' +
      (loggingPaused
        ? '<div class="bs-feedback-banner is-warning" role="status">' +
          guidePassportHtmlEscape(pausedMessage || 'Logging new visits is temporarily paused.') +
          '</div>'
        : '<form id="guideVisitForm" novalidate>' +
          '<div class="form-row">' +
          '<label for="visitSpotSearch">Filter businesses' +
          '<input id="visitSpotSearch" type="search" value="' +
          guidePassportHtmlEscape(journalState.spotFilterQuery) +
          '" placeholder="Type a truck, café, market, or town…" autocomplete="off">' +
          '</label>' +
          '<label for="guideSpotSelect"><span>Business visited *</span>' +
          '<select id="guideSpotSelect" required>' +
          '<option value="">Choose a listed business (' +
          filteredPlaces.length +
          ' shown)</option>' +
          optionsHtml +
          '</select></label>' +
          '</div>' +
          '<div id="journalSelectedPill" class="journal-selected-pill" ' +
          (selectedPlace ? '' : 'hidden') +
          '>' +
          (selectedPlace
            ? 'Selected: <strong>' +
              guidePassportHtmlEscape(selectedPlace.name) +
              '</strong> (' +
              guidePassportHtmlEscape(selectedPlace.city || 'Sonoma County') +
              ')'
            : '') +
          '</div>' +
          '<label for="guideVisitNote">Private note (optional, visible only to you — max 280 chars)' +
          '<input id="guideVisitNote" maxlength="280" value="' +
          guidePassportHtmlEscape(journalState.draftNote) +
          '" placeholder="What you ordered, favorite salsa, or a reminder for next time…">' +
          '</label>' +
          '<button class="primary" id="guideVisitSubmitBtn" type="submit">' +
          (summary.achievements_hidden ? 'Log today’s visit' : 'Log today’s visit (+25 points)') +
          '</button>' +
          '</form>') +
      '<p id="guideActionMessage" class="guide-action-msg tone-' +
      guidePassportHtmlEscape(journalState.statusTone) +
      '" role="status" aria-live="polite">' +
      guidePassportHtmlEscape(journalState.statusMessage) +
      '</p>' +
      '</section>' +
      renderWeeklyChallengeHtml(summary) +
      renderAchievementsSectionHtml(summary) +
      '<section class="passport-panel" id="journalHistoryPanel" aria-labelledby="journalHistoryHeading">' +
      '<div class="passport-title">' +
      '<h2 id="journalHistoryHeading">Visit journal history (' +
      journalState.pagination.total +
      ')</h2>' +
      '<p>Your private account-backed visit history across Sonoma County.</p>' +
      '</div>' +
      '<ul class="passport-visits" id="journalVisitsList">' +
      visitsHtml +
      '</ul>' +
      (journalState.pagination.has_more
        ? '<div class="passport-more-wrap"><button type="button" class="secondary" id="journalLoadMoreBtn">Load older visits</button></div>'
        : '') +
      '</section>';

    bindVisitJournalHandlers(host);
    if (fc && typeof fc.syncDom === 'function') fc.syncDom();
  } catch (err) {
    if (seq !== journalRenderSeq) return;
    const refText = err && err.correlationId ? ' (Ref: ' + guidePassportHtmlEscape(err.correlationId) + ')' : '';
    host.innerHTML =
      '<div class="dish-empty" role="alert">' +
      '<h3>Could not load your Visit journal</h3>' +
      '<p>' +
      guidePassportHtmlEscape((err && err.message) || 'Please check your connection and try again.') +
      refText +
      '</p>' +
      '<button type="button" class="secondary" id="retryVisitJournalBtn">Retry</button>' +
      '</div>';
    const rBtn = document.getElementById('retryVisitJournalBtn');
    if (rBtn) rBtn.addEventListener('click', () => renderGuidePassport({ forceSummary: true }));
  }
}

function bindVisitJournalHandlers(host) {
  const searchInput = document.getElementById('visitSpotSearch');
  const selectEl = document.getElementById('guideSpotSelect');
  const noteInput = document.getElementById('guideVisitNote');
  const pillEl = document.getElementById('journalSelectedPill');
  const form = document.getElementById('guideVisitForm');

  if (searchInput && selectEl) {
    searchInput.addEventListener('input', () => {
      journalState.spotFilterQuery = searchInput.value;
      const filtered = getFilteredPlaceOptions(journalState.spotFilterQuery, selectEl.value);
      const curVal = selectEl.value;
      selectEl.innerHTML =
        '<option value="">Choose a listed business (' +
        filtered.length +
        ' shown)</option>' +
        filtered
          .map(
            p =>
              '<option value="' +
              guidePassportHtmlEscape(p.id) +
              '"' +
              (p.id === curVal ? ' selected' : '') +
              '>' +
              guidePassportHtmlEscape(p.name) +
              ' · ' +
              guidePassportHtmlEscape(p.city || 'Sonoma County') +
              '</option>'
          )
          .join('');
    });
  }

  if (selectEl) {
    selectEl.addEventListener('change', () => {
      journalState.selectedVendorId = selectEl.value;
      const p = guidePlace(selectEl.value);
      if (pillEl) {
        pillEl.hidden = !p;
        pillEl.innerHTML = p
          ? 'Selected: <strong>' +
            guidePassportHtmlEscape(p.name) +
            '</strong> (' +
            guidePassportHtmlEscape(p.city || 'Sonoma County') +
            ')'
          : '';
      }
    });
  }

  if (noteInput) {
    noteInput.addEventListener('input', () => {
      journalState.draftNote = noteInput.value;
    });
  }

  if (form) {
    form.addEventListener('submit', guideLogVisit);
  }

  host.querySelectorAll('[data-visit-open-detail]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (typeof openDetail === 'function') openDetail(btn.dataset.visitOpenDetail, btn);
    });
  });

  host.querySelectorAll('[data-ask-delete-visit]').forEach(btn => {
    btn.addEventListener('click', () => {
      journalState.pendingDeleteVisitId = btn.dataset.askDeleteVisit;
      renderGuidePassport({ keepExistingList: true });
    });
  });

  host.querySelectorAll('[data-cancel-delete-visit]').forEach(btn => {
    btn.addEventListener('click', () => {
      journalState.pendingDeleteVisitId = '';
      renderGuidePassport({ keepExistingList: true });
    });
  });

  host.querySelectorAll('[data-confirm-delete-visit]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.confirmDeleteVisit;
      btn.disabled = true;
      try {
        const res = await window.bitesharkExploration.deleteVisit({ visitId: id });
        journalState.pendingDeleteVisitId = '';
        journalState.statusTone = 'info';
        journalState.statusMessage =
          'Removed visit to ' + (res.business_name || 'business') + ' (' + (res.visit_local_date || '') + '). Progress updated.';
        await renderGuidePassport({ forceSummary: false });
      } catch (err) {
        btn.disabled = false;
        journalState.statusTone = 'error';
        journalState.statusMessage = (err && err.message) || 'Could not remove visit. Please retry.';
        const msgEl = document.getElementById('guideActionMessage');
        if (msgEl) msgEl.textContent = journalState.statusMessage;
      }
    });
  });

  const loadMoreBtn = document.getElementById('journalLoadMoreBtn');
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', async () => {
      loadMoreBtn.disabled = true;
      loadMoreBtn.textContent = 'Loading older visits…';
      try {
        const nextOffset = journalState.pagination.next_offset || journalState.visits.length;
        const more = await window.bitesharkExploration.listVisits({
          limit: journalState.pagination.limit || 15,
          offset: nextOffset
        });
        journalState.visits = journalState.visits.concat(more.visits || []);
        journalState.pagination = more.pagination || journalState.pagination;
        renderGuidePassport({ keepExistingList: true });
      } catch (err) {
        loadMoreBtn.disabled = false;
        loadMoreBtn.textContent = 'Retry loading older visits';
      }
    });
  }

  // Legacy import / discard buttons
  const impBtn = document.getElementById('legacyConfirmImportBtn');
  const retryImpBtn = document.getElementById('legacyRetryImportBtn');
  const runImportHandler = async triggerBtn => {
    triggerBtn.disabled = true;
    const liveSt = document.getElementById('legacyImportLiveStatus');
    try {
      const rep = await window.bitesharkExploration.importLegacyDeviceData({
        onStatus: txt => {
          if (liveSt) liveSt.textContent = txt;
        }
      });
      journalState.legacyImportReport = rep;
      journalState.confirmingLegacyDiscard = false;
      await renderGuidePassport({ forceSummary: true });
    } catch (err) {
      triggerBtn.disabled = false;
      if (liveSt) {
        liveSt.textContent =
          (err && err.message) || 'Import could not complete right now. Your device data was kept untouched.';
      }
    }
  };
  if (impBtn) impBtn.addEventListener('click', () => runImportHandler(impBtn));
  if (retryImpBtn) retryImpBtn.addEventListener('click', () => runImportHandler(retryImpBtn));

  const notNowBtn = document.getElementById('legacyNotNowBtn');
  if (notNowBtn) {
    notNowBtn.addEventListener('click', () => {
      window.bitesharkExploration.dismissLegacyOfferForSession();
      renderGuidePassport({ keepExistingList: true });
    });
  }

  const dismissRepBtn = document.getElementById('legacyDismissReportBtn');
  if (dismissRepBtn) {
    dismissRepBtn.addEventListener('click', () => {
      journalState.legacyImportReport = null;
      window.bitesharkExploration.dismissLegacyOfferForSession();
      renderGuidePassport({ keepExistingList: true });
    });
  }

  const askDiscardBtn = document.getElementById('legacyAskDiscardBtn');
  if (askDiscardBtn) {
    askDiscardBtn.addEventListener('click', () => {
      journalState.legacyImportReport = null;
      journalState.confirmingLegacyDiscard = true;
      renderGuidePassport({ keepExistingList: true });
    });
  }

  const cancelDiscardBtn = document.getElementById('legacyCancelDiscardBtn');
  if (cancelDiscardBtn) {
    cancelDiscardBtn.addEventListener('click', () => {
      journalState.confirmingLegacyDiscard = false;
      renderGuidePassport({ keepExistingList: true });
    });
  }

  const confirmDiscardBtn = document.getElementById('legacyConfirmDiscardBtn');
  if (confirmDiscardBtn) {
    confirmDiscardBtn.addEventListener('click', async () => {
      confirmDiscardBtn.disabled = true;
      await window.bitesharkExploration.discardLegacyDeviceData();
      journalState.confirmingLegacyDiscard = false;
      journalState.legacyImportReport = null;
      journalState.statusTone = 'info';
      journalState.statusMessage = 'Cleared legacy device-saved visits and photos from this browser.';
      renderGuidePassport({ keepExistingList: true });
    });
  }
}

async function guideLogVisit(e) {
  e.preventDefault();
  const fc = getJournalFeatureApi();
  const msgEl = document.getElementById('guideActionMessage');
  const submitBtn = document.getElementById('guideVisitSubmitBtn');

  if (fc && (!fc.isAvailable('local_guides_passport') || !fc.isAvailable('visit_journal'))) {
    const m =
      (!fc.isAvailable('visit_journal') && fc.getMessage('visit_journal')) ||
      fc.getMessage('local_guides_passport');
    if (msgEl) msgEl.textContent = m;
    fc.syncDom();
    return;
  }

  const vendorId = journalState.selectedVendorId || (document.getElementById('guideSpotSelect')?.value || '');
  const note = (document.getElementById('guideVisitNote')?.value || '').trim();
  if (!vendorId) {
    if (msgEl) msgEl.textContent = 'Select a listed local food business to log your visit.';
    document.getElementById('guideSpotSelect')?.focus();
    return;
  }
  if (note.length > 280) {
    if (msgEl) msgEl.textContent = 'Private note must be 280 characters or fewer.';
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.setAttribute('aria-busy', 'true');
  }
  if (msgEl) msgEl.textContent = 'Saving visit to your journal…';

  try {
    const out = await window.bitesharkExploration.logVisit({
      vendorId,
      privateNote: note,
      entrySource: 'manual'
    });

    if (out.already_logged_today) {
      journalState.statusTone = 'info';
      journalState.statusMessage =
        out.message || 'Already logged today for this business. You can log another visit on a future day.';
    } else {
      journalState.selectedVendorId = '';
      journalState.draftNote = '';
      journalState.spotFilterQuery = '';
      journalState.statusTone = 'success';
      journalState.statusMessage = out.message || 'Visit saved to your journal!';
      if (typeof toast === 'function') {
        toast('Visit logged to your journal!');
      }
    }
    await renderGuidePassport({ forceSummary: false });
  } catch (err) {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.removeAttribute('aria-busy');
    }
    const refSuffix = err && err.correlationId ? ' (Ref: ' + guidePassportHtmlEscape(err.correlationId) + ')' : '';
    journalState.statusTone = 'error';
    journalState.statusMessage =
      ((err && err.message) || 'Could not save this visit right now. Your selection and note are still here — please retry.') +
      refSuffix;
    if (msgEl) msgEl.textContent = journalState.statusMessage;
  }
}

function resetVisitJournalStateOnAuthChange() {
  journalState = {
    visits: [],
    pagination: { total: 0, limit: 15, offset: 0, has_more: false },
    spotFilterQuery: '',
    selectedVendorId: '',
    draftNote: '',
    pendingDeleteVisitId: '',
    confirmingLegacyDiscard: false,
    legacyImportReport: null,
    statusMessage: '',
    statusTone: 'info'
  };
  if (window.bitesharkExploration) {
    window.bitesharkExploration.clearMemoryCache({ preserveUserId: true });
  }
  const guidesScreen = document.getElementById('guidesScreen');
  if (guidesScreen && guidesScreen.classList.contains('active')) {
    if (typeof activeGuidesTab !== 'undefined' && activeGuidesTab === 'photos' && typeof renderDishPhotos === 'function') {
      renderDishPhotos();
    } else {
      renderGuidePassport({ forceSummary: true });
    }
  }
  const smartScreen = document.getElementById('smartScreen');
  if (smartScreen && smartScreen.classList.contains('active')) {
    if (typeof currentTrailPreview !== 'undefined' && currentTrailPreview && typeof renderTrailPreview === 'function') {
      renderTrailPreview(currentTrailPreview);
    }
    if (typeof renderSavedTrailsList === 'function') {
      renderSavedTrailsList();
    }
  }
}

if (typeof window !== 'undefined') {
  window.bitesharkResetExplorationUiOnAuthChange = resetVisitJournalStateOnAuthChange;
}
