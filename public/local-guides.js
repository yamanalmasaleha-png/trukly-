/* BiteShark Local Guides Hub, Editorial Stories & Private Account-Backed Photos (`public/local-guides.js`)
 *
 * Legacy device store constant `'truckly-dish-notebook-v1'` is retained solely for explicit,
 * user-confirmed migration into account-backed storage (`window.bitesharkExploration`).
 */
const LEGACY_DISH_NOTEBOOK_KEY = 'truckly-dish-notebook-v1';

let activeGuidesTab = 'passport';
let preselectedVisitVendorId = '';
let preselectedPhotoVendorId = '';
let pendingDeletePhotoId = '';
let photoRenderSeq = 0;

function guidesEscape(v) {
  return String(v ?? '').replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function getGuidesFeatureApi() {
  return typeof window !== 'undefined' && window.bitesharkFeatures ? window.bitesharkFeatures : null;
}

function isGuidesSubfeatureHidden(key) {
  const fc = getGuidesFeatureApi();
  if (!fc) return false;
  if (fc.isHidden('local_guides_passport')) return true;
  return fc.isHidden(key);
}

function getAvailableGuidesTabs() {
  const tabs = [];
  if (!isGuidesSubfeatureHidden('visit_journal')) tabs.push('passport');
  if (!isGuidesSubfeatureHidden('editorial_stories')) tabs.push('stories');
  if (!isGuidesSubfeatureHidden('private_photos')) tabs.push('photos');
  return tabs;
}

function resolveBestGuidesTab(requested) {
  const available = getAvailableGuidesTabs();
  if (available.length === 0) return null;
  if (requested && available.includes(requested)) return requested;
  return available[0];
}

function populateDishPhotoVendorOptions(selectedId) {
  const sel = document.getElementById('dishPhotoVendor');
  if (!sel) return;
  const list = (typeof trucks !== 'undefined' && Array.isArray(trucks) ? trucks : [])
    .slice()
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  const current = selectedId !== undefined ? selectedId : sel.value;
  sel.innerHTML =
    '<option value="">Optional — link to a listed business</option>' +
    list
      .map(
        t =>
          '<option value="' +
          guidesEscape(t.id) +
          '">' +
          guidesEscape(t.name) +
          (t.city && t.city !== 'Sonoma County' ? ' · ' + guidesEscape(t.city) : '') +
          '</option>'
      )
      .join('');
  if (current && list.some(t => t.id === current)) {
    sel.value = current;
  }
}

function renderStoryCardHtml(story) {
  const exp = window.bitesharkExploration;
  const artHtml =
    story.media_kind === 'photo' && story.photo_url
      ? '<img class="guide-story-photo" src="' +
        guidesEscape(story.photo_url) +
        '" width="640" height="360" alt="' +
        guidesEscape(story.alt_text) +
        '" loading="lazy" data-story-id="' +
        guidesEscape(story.story_id) +
        '" data-illustration-key="' +
        guidesEscape(story.illustration_key) +
        '">'
      : exp.renderEditorialIllustrationSvg(story.illustration_key, story.alt_text);

  const visitHidden = isGuidesSubfeatureHidden('visit_journal');
  const photosHidden = isGuidesSubfeatureHidden('private_photos');
  const detailAvailable =
    story.business_available !== false &&
    typeof trucks !== 'undefined' &&
    Array.isArray(trucks) &&
    trucks.some(t => t.id === story.vendor_id);

  return (
    '<article class="guide-story" data-story-id="' +
    guidesEscape(story.story_id) +
    '">' +
    '<figure class="guide-story-media">' +
    '<div class="guide-story-frame">' +
    artHtml +
    '</div>' +
    '<figcaption><span class="guide-badge-editorial">EDITORIAL STORY</span> ' +
    guidesEscape(story.attribution) +
    '</figcaption>' +
    '</figure>' +
    '<div class="guide-story-copy">' +
    '<small>' +
    guidesEscape(story.tag) +
    ' · ' +
    guidesEscape(story.town) +
    '</small>' +
    '<h2>' +
    guidesEscape(story.title) +
    '</h2>' +
    '<p>' +
    guidesEscape(story.summary) +
    '</p>' +
    (story.detail_cue ? '<aside>' + guidesEscape(story.detail_cue) + '</aside>' : '') +
    '<div class="guide-card-actions">' +
    (detailAvailable
      ? '<button type="button" data-story-open-detail="' +
        guidesEscape(story.vendor_id) +
        '">' +
        guidesEscape(story.cta_label || 'View details') +
        ' →</button>'
      : '<span class="guide-unavailable-pill">Listing unavailable in current snapshot</span>') +
    (!visitHidden && detailAvailable
      ? '<button type="button" class="secondary" data-story-log-visit="' +
        guidesEscape(story.vendor_id) +
        '">✓ Log a visit</button>'
      : '') +
    (!photosHidden
      ? '<button type="button" class="secondary" data-story-add-photo="' +
        guidesEscape(story.vendor_id) +
        '">📷 Save private photo</button>'
      : '') +
    (story.source_url
      ? '<a href="' +
        guidesEscape(story.source_url) +
        '" target="_blank" rel="noopener noreferrer">' +
        guidesEscape(story.source_label || 'Published source') +
        ' ↗</a>'
      : '') +
    '</div>' +
    '</div>' +
    '</article>'
  );
}

async function renderEditorialStories() {
  const grid = document.getElementById('guideStoryGrid');
  if (!grid || !window.bitesharkExploration) return;

  if (isGuidesSubfeatureHidden('editorial_stories')) {
    grid.innerHTML = '';
    return;
  }

  grid.innerHTML = '<p class="guide-loading-state" role="status">Loading editorial stories…</p>';
  let stories = [];
  try {
    stories = await window.bitesharkExploration.fetchStories();
  } catch (err) {
    const fc = getGuidesFeatureApi();
    grid.innerHTML =
      '<div class="dish-empty" role="alert"><h3>Editorial stories are unavailable</h3><p>' +
      guidesEscape((err && err.message) || (fc && fc.getMessage('editorial_stories')) || 'Please try again shortly.') +
      '</p></div>';
    return;
  }

  if (!stories.length) {
    grid.innerHTML = '<div class="dish-empty"><p>No editorial stories are published right now.</p></div>';
    return;
  }

  grid.innerHTML = stories.map(renderStoryCardHtml).join('');

  grid.querySelectorAll('img.guide-story-photo').forEach(img => {
    img.addEventListener('error', () => {
      const storyId = img.dataset.storyId || 'unknown';
      const illKey = img.dataset.illustrationKey || 'roaster_coffee';
      const d = window.bitesharkDiagnostics;
      if (d && typeof d.reportClientDiagnostic === 'function') {
        d.reportClientDiagnostic({
          featureKey: 'editorial_stories',
          operationName: 'story.assetLoad',
          routeTemplate: '/api/stories',
          errorCode: 'STORY_ASSET_LOAD_FAILED',
          severity: 'warning',
          message: 'Story photograph failed to load (' + storyId + '); rendered editorial illustration fallback.',
          retryable: false,
          outcomeState: 'degraded'
        });
      }
      const frame = img.closest('.guide-story-frame');
      if (frame && window.bitesharkExploration) {
        frame.innerHTML = window.bitesharkExploration.renderEditorialIllustrationSvg(illKey, img.alt);
      }
    });
  });

  grid.querySelectorAll('[data-story-open-detail]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (typeof openDetail === 'function') openDetail(btn.dataset.storyOpenDetail, btn);
    });
  });
  grid.querySelectorAll('[data-story-log-visit]').forEach(btn => {
    btn.addEventListener('click', () => {
      openVisitJournalForBusiness(btn.dataset.storyLogVisit);
    });
  });
  grid.querySelectorAll('[data-story-add-photo]').forEach(btn => {
    btn.addEventListener('click', () => {
      openPhotoNotebook(btn.dataset.storyAddPhoto);
    });
  });
}

function renderDiscoverStoriesStrip() {
  const host = document.getElementById('discoverStoriesStrip');
  if (!host || !window.bitesharkExploration) return;
  if (isGuidesSubfeatureHidden('editorial_stories')) {
    host.hidden = true;
    host.innerHTML = '';
    return;
  }
  const activeVendorSet =
    typeof trucks !== 'undefined' && Array.isArray(trucks) && trucks.length > 0
      ? new Set(trucks.map(t => String(t.id || '')))
      : null;
  const stories = window.bitesharkExploration.CANONICAL_STORIES.filter(
    s => !activeVendorSet || activeVendorSet.has(String(s.vendor_id || ''))
  ).slice(0, 3);
  if (!stories.length) {
    host.hidden = true;
    host.innerHTML = '';
    return;
  }
  host.hidden = false;
  host.innerHTML =
    '<div class="street-paper-head"><span data-doodle="paper" aria-hidden="true"></span><div><small>EDITORIAL FIELD NOTES</small><h2 id="streetHeading">Sourced Sonoma stories</h2></div>' +
    '<button type="button" class="secondary" id="discoverOpenStoriesBtn">All stories →</button></div>' +
    '<p class="paper-intro">Curated BiteShark editorial notes linked to published business sources—distinct from community reviews and your private journal.</p>' +
    '<div class="street-stories">' +
    stories
      .map(
        s =>
          '<article><small>' +
          guidesEscape(s.tag) +
          ' · ' +
          guidesEscape(s.town) +
          '</small><h3>' +
          guidesEscape(s.title) +
          '</h3><p>' +
          guidesEscape(s.summary) +
          '</p><div class="street-story-actions"><button type="button" data-disc-story-vendor="' +
          guidesEscape(s.vendor_id) +
          '">' +
          guidesEscape(s.cta_label) +
          ' →</button><a href="' +
          guidesEscape(s.source_url) +
          '" target="_blank" rel="noopener noreferrer">Source ↗</a></div></article>'
      )
      .join('') +
    '</div>';

  const allBtn = document.getElementById('discoverOpenStoriesBtn');
  if (allBtn) {
    allBtn.addEventListener('click', () => openLocalGuides('stories'));
  }
  host.querySelectorAll('[data-disc-story-vendor]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (typeof openDetail === 'function') openDetail(btn.dataset.discStoryVendor, btn);
    });
  });
  if (typeof flavorDoodle === 'function') {
    host.querySelectorAll('[data-doodle]').forEach(el => {
      el.innerHTML = flavorDoodle(el.dataset.doodle);
    });
  }
}

async function openLocalGuides(tab = 'passport') {
  const fc = getGuidesFeatureApi();
  if (fc && fc.isLoaded && !fc.isLoaded() && typeof fc.waitUntilReady === 'function') {
    try {
      await fc.waitUntilReady();
    } catch {}
  }

  const resolvedTab = resolveBestGuidesTab(tab);
  if (!resolvedTab) {
    const msg =
      (fc && fc.getMessage('local_guides_passport')) ||
      'Local Guides is currently unavailable.';
    if (typeof toast === 'function') toast(msg);
    if (typeof showScreen === 'function') showScreen('discover');
    return false;
  }

  showScreen('guides');
  const screenEl = document.getElementById('guidesScreen');
  if (screenEl) screenEl.scrollTop = 0;

  try {
    await (window.bitesharkReady || Promise.resolve());
  } catch {}

  populateDishPhotoVendorOptions(preselectedPhotoVendorId || undefined);
  showGuidesTab(resolvedTab);
  if (fc && typeof fc.syncDom === 'function') fc.syncDom();
  return true;
}

function showGuidesTab(tab) {
  const resolved = resolveBestGuidesTab(tab);
  if (!resolved) {
    if (typeof showScreen === 'function') showScreen('discover');
    return;
  }
  activeGuidesTab = resolved;

  const passportSec = document.getElementById('guidePassportSection');
  const storiesSec = document.getElementById('guideStories');
  const photoSec = document.getElementById('guidePhotoSection');

  if (passportSec) passportSec.hidden = resolved !== 'passport';
  if (storiesSec) storiesSec.hidden = resolved !== 'stories';
  if (photoSec) photoSec.hidden = resolved !== 'photos';

  document.querySelectorAll('[data-guide-tab]').forEach(b => {
    const tKey = b.dataset.guideTab;
    const fcKey =
      tKey === 'passport' ? 'visit_journal' : tKey === 'stories' ? 'editorial_stories' : 'private_photos';
    const hiddenByFc = isGuidesSubfeatureHidden(fcKey);
    b.hidden = hiddenByFc;
    const isActive = !hiddenByFc && tKey === resolved;
    b.classList.toggle('active', isActive);
    b.setAttribute('aria-selected', String(isActive));
    b.setAttribute('tabindex', isActive ? '0' : '-1');
  });

  const trailsBtn = document.getElementById('guidesOpenTrailsBtn');
  if (trailsBtn) {
    const fc = getGuidesFeatureApi();
    trailsBtn.hidden = Boolean(fc && fc.isHidden('suggested_trails'));
  }

  if (resolved === 'stories') {
    renderEditorialStories();
  } else if (resolved === 'photos') {
    renderDishPhotos();
  } else if (resolved === 'passport' && typeof renderGuidePassport === 'function') {
    renderGuidePassport();
  }
}

async function openVisitJournalForBusiness(vendorId) {
  const fc = getGuidesFeatureApi();
  if (fc && (fc.isHidden('local_guides_passport') || fc.isHidden('visit_journal'))) {
    if (typeof toast === 'function') {
      toast(fc.getMessage('visit_journal') || fc.getMessage('local_guides_passport'));
    }
    return;
  }
  if (typeof closeModal === 'function') closeModal();
  preselectedVisitVendorId = String(vendorId || '');
  const opened = await openLocalGuides('passport');
  if (!opened) return;
  setTimeout(() => {
    const sel = document.getElementById('guideSpotSelect');
    if (sel && preselectedVisitVendorId) {
      sel.value = preselectedVisitVendorId;
      sel.dispatchEvent(new Event('change'));
      sel.focus();
    } else {
      const signInBtn = document.getElementById('journalSignInLink');
      if (signInBtn) signInBtn.focus();
    }
  }, 60);
}

async function openPhotoNotebook(vendorId) {
  const fc = getGuidesFeatureApi();
  if (fc && (fc.isHidden('local_guides_passport') || fc.isHidden('private_photos'))) {
    if (typeof toast === 'function') {
      toast(fc.getMessage('private_photos') || fc.getMessage('local_guides_passport'));
    }
    return;
  }
  if (typeof closeModal === 'function') closeModal();
  preselectedPhotoVendorId = String(vendorId || '');
  const opened = await openLocalGuides('photos');
  if (!opened) return;
  populateDishPhotoVendorOptions(preselectedPhotoVendorId);
  setTimeout(() => {
    const cap = document.getElementById('dishPhotoCaption');
    const signInBtn = document.getElementById('photosSignInLink');
    if (cap && !cap.closest('[hidden]')) cap.focus();
    else if (signInBtn) signInBtn.focus();
  }, 60);
}

// =========================================================================
// Private Account-Backed Photos UI (`#guidePhotoSection`)
// =========================================================================
async function saveDishPhoto(e) {
  e.preventDefault();
  const fc = getGuidesFeatureApi();
  const msgEl = document.getElementById('dishPhotoMessage');
  const progEl = document.getElementById('dishPhotoProgress');
  const button = document.getElementById('dishPhotoSave');

  if (fc && (!fc.isAvailable('local_guides_passport') || !fc.isAvailable('private_photos'))) {
    const reason =
      (!fc.isAvailable('private_photos') && fc.getMessage('private_photos')) ||
      fc.getMessage('local_guides_passport') ||
      'Uploading new private photos is currently unavailable.';
    if (msgEl) msgEl.textContent = reason;
    fc.syncDom();
    return;
  }

  if (typeof isSignedIn === 'undefined' || !isSignedIn) {
    if (msgEl) msgEl.textContent = 'Sign in to save private photos to your BiteShark account.';
    return;
  }

  const fileInput = document.getElementById('dishPhotoFile');
  const captionInput = document.getElementById('dishPhotoCaption');
  const vendorSelect = document.getElementById('dishPhotoVendor');

  const file = fileInput && fileInput.files ? fileInput.files[0] : null;
  const caption = captionInput ? captionInput.value.trim() : '';
  const vendorId = vendorSelect ? vendorSelect.value.trim() : '';

  if (!file) {
    if (msgEl) msgEl.textContent = 'Choose a JPEG, PNG, or WebP photo to upload.';
    return;
  }
  if (file.type && !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    if (msgEl) msgEl.textContent = 'Only JPEG, PNG, and WebP photos are supported.';
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    if (msgEl) msgEl.textContent = 'Choose a photo smaller than 5 MB.';
    return;
  }
  if (caption.length > 160) {
    if (msgEl) msgEl.textContent = 'Caption must be 160 characters or fewer.';
    return;
  }

  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  if (progEl) {
    progEl.hidden = false;
    progEl.value = 5;
  }
  if (msgEl) msgEl.textContent = 'Verifying and uploading private photo…';

  try {
    await window.bitesharkExploration.uploadPhoto({
      vendorId: vendorId || null,
      caption,
      file,
      entrySource: preselectedPhotoVendorId && preselectedPhotoVendorId === vendorId ? 'detail_modal' : 'manual',
      onProgress: pct => {
        if (progEl) progEl.value = pct;
      }
    });
    preselectedPhotoVendorId = '';
    e.target.reset();
    populateDishPhotoVendorOptions('');
    if (msgEl) {
      msgEl.textContent = 'Saved privately to your BiteShark account (+10 exploration points).';
    }
    await renderDishPhotos();
    if (typeof renderGuidePassport === 'function' && activeGuidesTab === 'passport') {
      renderGuidePassport();
    }
  } catch (err) {
    if (err && err.status === 401) {
      if (msgEl) {
        msgEl.innerHTML =
          'Your session expired before the photo could be saved. <a href="/login.html?next=%2F%23photos">Sign in again →</a>';
      }
    } else {
      const refSuffix = err && err.correlationId ? ' (Ref: ' + guidesEscape(err.correlationId) + ')' : '';
      if (msgEl) {
        msgEl.textContent =
          (err && err.message ? err.message : 'Your photo could not be saved. Your caption is still in the form above — please try again.') +
          refSuffix;
      }
    }
  } finally {
    button.disabled = false;
    button.removeAttribute('aria-busy');
    if (progEl) progEl.hidden = true;
  }
}

function openPrivatePhotoViewer(photo) {
  let modal = document.getElementById('privatePhotoViewerModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'privatePhotoViewerModal';
    modal.className = 'modal-backdrop';
    modal.addEventListener('click', ev => {
      if (ev.target === modal) closePrivatePhotoViewer();
    });
    document.body.appendChild(modal);
  }
  modal.innerHTML =
    '<div class="detail-modal private-photo-modal" role="dialog" aria-modal="true" aria-labelledby="privatePhotoDialogTitle">' +
    '<button type="button" class="modal-close" aria-label="Close private photo viewer" id="closePrivatePhotoModalBtn">×</button>' +
    '<div class="private-photo-modal-media"><img src="' +
    guidesEscape(photo.main_url) +
    '" alt="' +
    guidesEscape(photo.caption || photo.business_name || 'Saved private dish photo') +
    '"></div>' +
    '<div class="detail-body">' +
    '<small>PRIVATE ACCOUNT PHOTO · VISIBLE ONLY TO YOU</small>' +
    '<h2 id="privatePhotoDialogTitle">' +
    guidesEscape(photo.business_name || 'Personal food note') +
    '</h2>' +
    (photo.caption ? '<p>' + guidesEscape(photo.caption) + '</p>' : '') +
    '<p class="meta">Saved ' +
    guidesEscape(photo.taken_local_date || '') +
    ' · Metadata &amp; location tags removed on upload</p>' +
    '</div></div>';

  modal.querySelector('#closePrivatePhotoModalBtn').addEventListener('click', closePrivatePhotoViewer);
  if (typeof openAppModal === 'function') {
    openAppModal('privatePhotoViewerModal', { onClose: closePrivatePhotoViewer });
  } else {
    modal.classList.add('show');
  }
}

function closePrivatePhotoViewer() {
  if (typeof closeAppModal === 'function') {
    closeAppModal('privatePhotoViewerModal');
  } else {
    const modal = document.getElementById('privatePhotoViewerModal');
    if (modal) modal.classList.remove('show');
  }
}

async function renderDishPhotos() {
  const version = ++photoRenderSeq;
  const grid = document.getElementById('dishPhotoGrid');
  const formWrap = document.getElementById('guidePhotoFormWrap');
  const authGate = document.getElementById('guidePhotoAuthGate');
  const countBadge = document.getElementById('dishPhotoCountBadge');
  const msgEl = document.getElementById('dishPhotoMessage');
  if (!grid || !window.bitesharkExploration) return;

  populateDishPhotoVendorOptions(preselectedPhotoVendorId || undefined);

  const signedInNow = typeof isSignedIn !== 'undefined' && Boolean(isSignedIn && currentUser);
  if (!signedInNow) {
    if (formWrap) formWrap.hidden = true;
    if (authGate) authGate.hidden = false;
    if (countBadge) countBadge.textContent = 'Sign in required';
    grid.innerHTML =
      '<div class="dish-empty">' +
      '<h3>Save private dish photos to your account</h3>' +
      '<p>Photos and captions are stored privately on your BiteShark account (up to 12 photos, JPEG/PNG/WebP up to 5 MB) so they follow you across sessions without ever being published publicly.</p>' +
      '<a id="photosSignInLink" class="primary guide-signin-btn" href="/login.html?next=%2F%23photos">Sign in to save private photos →</a>' +
      '</div>';
    return;
  }

  const fc = getGuidesFeatureApi();
  const uploadsPaused = Boolean(
    fc && (!fc.isAvailable('local_guides_passport') || !fc.isAvailable('private_photos'))
  );
  if (authGate) authGate.hidden = true;
  if (formWrap) formWrap.hidden = uploadsPaused;

  grid.innerHTML = '<p class="guide-loading-state" role="status">Loading your private photos…</p>';

  try {
    const res = await window.bitesharkExploration.listPhotos({ limit: 20 });
    if (version !== photoRenderSeq) return;

    const rows = Array.isArray(res.photos) ? res.photos : [];
    const capLimit = Number(res.limit_per_account || 12);
    if (countBadge) {
      countBadge.textContent = rows.length + ' / ' + capLimit + ' saved';
    }
    const saveBtn = document.getElementById('dishPhotoSave');
    if (saveBtn) {
      saveBtn.disabled = uploadsPaused || rows.length >= capLimit;
    }

    if (!rows.length) {
      grid.innerHTML =
        '<div class="dish-empty">' +
        '<h3>No photos saved yet</h3>' +
        '<p>Add a private dish or visit photo above (+10 exploration points per active photo, up to ' +
        capLimit +
        ' photos). Location metadata is automatically stripped on upload.</p>' +
        '</div>';
      return;
    }

    grid.innerHTML = rows
      .map(p => {
        const confirming = pendingDeletePhotoId === p.photo_id;
        const altLabel = p.caption || (p.business_name ? 'Private photo for ' + p.business_name : 'Private food photo');
        return (
          '<article class="dish-photo" data-photo-id="' +
          guidesEscape(p.photo_id) +
          '">' +
          '<button type="button" class="dish-photo-thumb-btn" data-view-photo="' +
          guidesEscape(p.photo_id) +
          '" aria-label="View full private photo: ' +
          guidesEscape(altLabel) +
          '">' +
          '<img src="' +
          guidesEscape(p.thumb_url) +
          '" width="320" height="320" loading="lazy" alt="' +
          guidesEscape(altLabel) +
          '">' +
          '</button>' +
          '<div class="dish-photo-body">' +
          '<small>PRIVATE PHOTO · ' +
          guidesEscape(p.taken_local_date || '') +
          '</small>' +
          '<h3>' +
          guidesEscape(p.business_name || 'Unlinked personal dish note') +
          (p.business_status === 'unavailable' ? ' <span class="guide-unavailable-pill">(Unavailable)</span>' : '') +
          '</h3>' +
          (p.caption ? '<p>' + guidesEscape(p.caption) + '</p>' : '<p class="meta">No caption added</p>') +
          '<div class="dish-photo-actions">' +
          (p.can_open_detail && p.vendor_id
            ? '<button type="button" data-photo-open-vendor="' +
              guidesEscape(p.vendor_id) +
              '">View details</button>'
            : '') +
          (!confirming
            ? '<button type="button" class="danger-link" data-ask-delete-photo="' +
              guidesEscape(p.photo_id) +
              '">Remove photo</button>'
            : '<div class="guide-confirm-box" role="group" aria-label="Confirm removing private photo">' +
              '<small>Removing this photo deletes its private server file and recalculates your points (-10 pts) and Photo Keeper badge.</small>' +
              '<div class="guide-confirm-btns">' +
              '<button type="button" class="danger-btn" data-confirm-delete-photo="' +
              guidesEscape(p.photo_id) +
              '">Confirm remove</button>' +
              '<button type="button" class="secondary" data-cancel-delete-photo="1">Cancel</button>' +
              '</div></div>') +
          '</div>' +
          '</div>' +
          '</article>'
        );
      })
      .join('');

    const photosById = new Map(rows.map(r => [r.photo_id, r]));
    grid.querySelectorAll('[data-view-photo]').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = photosById.get(btn.dataset.viewPhoto);
        if (p) openPrivatePhotoViewer(p);
      });
    });
    grid.querySelectorAll('[data-photo-open-vendor]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (typeof openDetail === 'function') openDetail(btn.dataset.photoOpenVendor, btn);
      });
    });
    grid.querySelectorAll('[data-ask-delete-photo]').forEach(btn => {
      btn.addEventListener('click', () => {
        pendingDeletePhotoId = btn.dataset.askDeletePhoto;
        renderDishPhotos();
      });
    });
    grid.querySelectorAll('[data-cancel-delete-photo]').forEach(btn => {
      btn.addEventListener('click', () => {
        pendingDeletePhotoId = '';
        renderDishPhotos();
      });
    });
    grid.querySelectorAll('[data-confirm-delete-photo]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.confirmDeletePhoto;
        btn.disabled = true;
        try {
          await window.bitesharkExploration.deletePhoto({ photoId: id });
          pendingDeletePhotoId = '';
          if (msgEl) msgEl.textContent = 'Private photo removed and points/badges recalculated.';
          await renderDishPhotos();
        } catch (delErr) {
          btn.disabled = false;
          if (msgEl) msgEl.textContent = delErr.message || 'Could not remove photo. Please retry.';
        }
      });
    });
  } catch (err) {
    if (version !== photoRenderSeq) return;
    const refNote = err && err.correlationId ? ' (Ref: ' + guidesEscape(err.correlationId) + ')' : '';
    grid.innerHTML =
      '<div class="dish-empty" role="alert">' +
      '<h3>Private photos could not be loaded</h3>' +
      '<p>' +
      guidesEscape((err && err.message) || 'Could not reach private photo storage.') +
      refNote +
      '</p>' +
      '<button type="button" class="secondary" id="retryLoadPhotosBtn">Retry loading photos</button>' +
      '</div>';
    const retryBtn = document.getElementById('retryLoadPhotosBtn');
    if (retryBtn) retryBtn.addEventListener('click', () => renderDishPhotos());
  }
}

function handleGuidesHashRoutes() {
  const rawHash = String(location.hash || '').replace(/^#/, '').trim().toLowerCase();
  if (rawHash === 'guides' || rawHash === 'passport' || rawHash === 'guides-journal') {
    openLocalGuides('passport');
  } else if (rawHash === 'stories' || rawHash === 'guides-stories') {
    openLocalGuides('stories');
  } else if (rawHash === 'photos' || rawHash === 'guides-photos') {
    openLocalGuides('photos');
  }
}

window.addEventListener('hashchange', handleGuidesHashRoutes);

if (typeof document !== 'undefined') {
  if (typeof flavorDoodle === 'function') {
    document.querySelectorAll('.guides-launch [data-doodle]').forEach(el => {
      el.innerHTML = flavorDoodle(el.dataset.doodle);
    });
  }
  // Keyboard arrow navigation across `[role="tablist"]` in `#guidesScreen`
  const tablist = document.querySelector('#guidesScreen .guides-tabs');
  if (tablist) {
    tablist.addEventListener('keydown', ev => {
      if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return;
      const visibleTabs = [...tablist.querySelectorAll('[data-guide-tab]')].filter(b => !b.hidden);
      if (visibleTabs.length < 2) return;
      const idx = visibleTabs.indexOf(document.activeElement);
      if (idx === -1) return;
      ev.preventDefault();
      const nextIdx = ev.key === 'ArrowRight' ? (idx + 1) % visibleTabs.length : (idx - 1 + visibleTabs.length) % visibleTabs.length;
      const nextBtn = visibleTabs[nextIdx];
      nextBtn.focus();
      showGuidesTab(nextBtn.dataset.guideTab);
    });
  }
  renderDiscoverStoriesStrip();
  setTimeout(handleGuidesHashRoutes, 0);
}
