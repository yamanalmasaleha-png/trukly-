// BiteShark Greatest Hits Curated Collections Editor & Manager (`public/greatest-hits.js`)
//
// Invariants:
//   - Recommendations are personal friend lists (not verified reviews, zero star ratings).
//   - Private visit notes and photo captions are NEVER automatically copied into recommendations;
//     copying from a visit note requires an explicit preview + deliberate confirmation click.
//   - Keyboard-accessible `↑` / `↓` reordering with focus preservation and `aria-live` announcements.

(function () {
  'use strict';

  var ghState = {
    mode: 'list', // 'list' | 'edit'
    collections: null,
    loadingList: false,
    listError: null,
    activeCollection: null,
    draftTitle: '',
    draftIntro: '',
    draftEntries: [],
    dirty: false,
    saving: false,
    requireSharedUpdateConfirm: false,
    sharedUpdateConfirmed: false,
    catalogFilter: '',
    visitNotesByVendor: {},
    pendingNoteCopyVendorId: null,
    confirmDeleteColId: null,
    editorMsg: null,
    sharingHookRenderer: null,
    photoSlotHookRenderer: null,
    lastHelpers: null
  };

  function ghEsc(val) {
    return String(val === null || val === undefined ? '' : val)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getCanonicalCatalogItems() {
    if (typeof trucks !== 'undefined' && Array.isArray(trucks)) {
      return trucks.slice();
    }
    if (typeof window !== 'undefined' && Array.isArray(window.trucks)) {
      return window.trucks.slice();
    }
    return [];
  }

  function triggerRerender() {
    var root = document.getElementById('ghCollectionsHost');
    if (root && ghState.lastHelpers) {
      root.innerHTML = renderInnerContent(ghState.lastHelpers.profileData);
      bindGreatestHitsEvents(root, ghState.lastHelpers);
    }
  }

  async function ensureCollectionsLoaded(force) {
    if (!window.bitesharkProfile) return;
    if (!force && Array.isArray(ghState.collections)) return;
    ghState.loadingList = true;
    ghState.listError = null;
    triggerRerender();
    try {
      var res = await window.bitesharkProfile.listCollections();
      ghState.collections = res.collections || [];
      ghState.loadingList = false;
      triggerRerender();
    } catch (err) {
      ghState.loadingList = false;
      ghState.listError = err;
      triggerRerender();
    }
  }

  async function hydrateVisitNotesForHelper() {
    if (!window.bitesharkExploration || typeof window.bitesharkExploration.listVisits !== 'function') {
      return;
    }
    try {
      var out = await window.bitesharkExploration.listVisits({ limit: 30, offset: 0 });
      var map = {};
      (out.visits || []).forEach(function (v) {
        if (v && v.vendor_id && v.private_note && !map[v.vendor_id]) {
          map[v.vendor_id] = String(v.private_note);
        }
      });
      ghState.visitNotesByVendor = map;
      triggerRerender();
    } catch (_e) {}
  }

  async function openCollectionEditor(collectionId) {
    ghState.editorMsg = null;
    ghState.requireSharedUpdateConfirm = false;
    ghState.sharedUpdateConfirmed = false;
    ghState.pendingNoteCopyVendorId = null;
    try {
      var res = await window.bitesharkProfile.getCollectionDetail(collectionId);
      var col = res.collection;
      ghState.activeCollection = col;
      ghState.draftTitle = col.title || '';
      ghState.draftIntro = col.intro || '';
      ghState.draftEntries = (col.entries || []).map(function (e) {
        return {
          vendor_id: e.vendor_id,
          display_name: e.display_name,
          cuisine: e.cuisine,
          town: e.town,
          catalog_status: e.catalog_status,
          service_status_label: e.service_status_label,
          can_open_detail: e.can_open_detail,
          recommendation: e.recommendation || '',
          photo_attachment: e.photo_attachment || null,
          photo_attachment_id: e.photo_attachment ? e.photo_attachment.attachment_id : null
        };
      });
      ghState.dirty = false;
      ghState.mode = 'edit';
      triggerRerender();
      hydrateVisitNotesForHelper();
    } catch (err) {
      ghState.editorMsg = { text: err.message || 'Could not load collection.', isError: true };
      triggerRerender();
    }
  }

  function renderListView(profileData) {
    var fs = (profileData && profileData.feature_states && profileData.feature_states.greatest_hits_collections) || {
      state: 'enabled'
    };
    if (fs.state === 'hidden') {
      return (
        '<section class="cp-panel">' +
        '<h2>Greatest Hits collections unavailable</h2>' +
        '<p class="cp-panel-lead">' + ghEsc(fs.message || 'Greatest Hits collections are currently hidden.') + '</p>' +
        '<div class="cp-note-box">Your existing collections remain preserved in your account and can be exported or cleared in Privacy &amp; tools.</div>' +
        '</section>'
      );
    }

    var paused = fs.state === 'paused';
    var list = ghState.collections || [];
    var atLimit = list.length >= 5;

    var itemsHtml = '';
    if (ghState.loadingList && !ghState.collections) {
      itemsHtml = '<p class="cp-panel-lead" role="status">Loading your Greatest Hits collections…</p>';
    } else if (ghState.listError) {
      itemsHtml =
        '<div class="cp-status-msg is-error" role="alert">' +
        ghEsc(ghState.listError.message || 'Could not load collections.') +
        ' <button type="button" class="cp-inline-btn" id="ghRetryListBtn">Retry</button></div>';
    } else if (list.length === 0) {
      itemsHtml =
        '<div class="cp-note-box">No Greatest Hits collections yet. Create a list (for example, “Saturday Taco Run” or “Favorite Coffee &amp; Pastries”) to keep for yourself or share via a revocable unlisted link.</div>';
    } else {
      itemsHtml =
        '<ul class="cp-list">' +
        list
          .map(function (c) {
            var activeShareCount = (c.active_shares || []).length;
            var badge =
              c.moderation_status === 'suppressed'
                ? '<span class="cp-private-tag" style="background:#FFF1EF;color:#8A2417">Sharing suppressed by moderation</span>'
                : activeShareCount > 0
                  ? '<span class="cp-private-tag" style="background:#E6EEE3;color:#234B3A">' + activeShareCount + ' unlisted link' + (activeShareCount === 1 ? '' : 's') + '</span>'
                  : '<span class="cp-private-tag">Private</span>';
            var confirmDelHtml =
              ghState.confirmDeleteColId === c.collection_id
                ? '<div class="cp-btn-row" style="margin-top:6px">' +
                  '<span class="cp-help" style="margin:0">Delete this collection and revoke any links?</span>' +
                  '<button type="button" class="cp-inline-btn is-danger" data-gh-confirm-delete="' + ghEsc(c.collection_id) + '">Yes, delete</button>' +
                  '<button type="button" class="cp-inline-btn" data-gh-cancel-delete="1">Cancel</button>' +
                  '</div>'
                : '';

            return (
              '<li class="cp-list-item">' +
              '<div class="cp-list-item-body">' +
              '<strong>' + ghEsc(c.title) + badge + '</strong>' +
              (c.intro ? '<span class="cp-list-item-meta">' + ghEsc(c.intro) + '</span>' : '') +
              '<span class="cp-list-item-meta">' + Number(c.entry_count || 0) + ' / 20 spots · Revision ' + Number(c.revision || 1) + '</span>' +
              confirmDelHtml +
              '</div>' +
              '<div class="cp-btn-row" style="margin-top:0">' +
              '<button type="button" class="cp-inline-btn is-primary" data-gh-open-col="' + ghEsc(c.collection_id) + '">Open &amp; curate</button>' +
              '<button type="button" class="cp-inline-btn is-danger" data-gh-ask-delete="' + ghEsc(c.collection_id) + '">Delete</button>' +
              '</div>' +
              '</li>'
            );
          })
          .join('') +
        '</ul>';
    }

    var createFormHtml = paused
      ? '<div class="cp-note-box is-warn" role="status">' + ghEsc(fs.message || 'Creating or editing collections is temporarily paused.') + '</div>'
      : '<section class="cp-panel">' +
        '<h3>Create a new Greatest Hits collection (' + list.length + ' / 5 used)</h3>' +
        '<p class="cp-panel-lead">Collections start private. Recommendations are personal suggestions for friends — never public ratings or verified reviews.</p>' +
        (ghState.editorMsg
          ? '<div class="cp-status-msg' + (ghState.editorMsg.isError ? ' is-error' : '') + '" role="alert">' + ghEsc(ghState.editorMsg.text) + '</div>'
          : '') +
        '<form id="ghCreateColForm" novalidate>' +
        '<div class="cp-form-field">' +
        '<label for="ghNewTitleInput">Collection title (required, up to 100 chars)</label>' +
        '<input id="ghNewTitleInput" type="text" maxlength="100" required' + (atLimit ? ' disabled' : '') + ' placeholder="e.g. Sonoma County Weekend Favorites">' +
        '</div>' +
        '<div class="cp-form-field">' +
        '<label for="ghNewIntroInput">Short introduction (optional, up to 500 chars)</label>' +
        '<textarea id="ghNewIntroInput" maxlength="500"' + (atLimit ? ' disabled' : '') + ' placeholder="What makes this list useful for a friend visiting town?"></textarea>' +
        '</div>' +
        '<div class="cp-btn-row">' +
        '<button type="submit" class="cp-inline-btn is-primary" id="ghCreateColBtn"' + (atLimit ? ' disabled' : '') + '>' +
        (atLimit ? 'Maximum 5 collections reached' : 'Create private collection →') +
        '</button>' +
        '</div>' +
        '</form>' +
        '</section>';

    return (
      '<section class="cp-panel">' +
      '<h2>Greatest Hits collections (' + list.length + ' / 5)</h2>' +
      '<p class="cp-panel-lead">Organize up to 5 curated lists (up to 20 Sonoma County businesses each). Private until you explicitly create an unlisted share link.</p>' +
      itemsHtml +
      '</section>' +
      createFormHtml
    );
  }

  function renderEditorView(profileData) {
    var col = ghState.activeCollection;
    if (!col) return renderListView(profileData);

    var fs = (profileData && profileData.feature_states && profileData.feature_states.greatest_hits_collections) || {
      state: 'enabled'
    };
    var paused = fs.state !== 'enabled';
    var existingVendorSet = new Set(
      ghState.draftEntries.map(function (e) { return e.vendor_id; })
    );

    var catalog = getCanonicalCatalogItems();
    var filterLower = String(ghState.catalogFilter || '').trim().toLowerCase();
    var availableCatalog = catalog.filter(function (item) {
      if (!item || !item.id || existingVendorSet.has(item.id)) return false;
      if (!filterLower) return true;
      var hay = ((item.name || '') + ' ' + (item.city || '') + ' ' + (item.cuisine || '')).toLowerCase();
      return hay.indexOf(filterLower) !== -1;
    });

    var favPreview = (profileData && profileData.activity_preview && profileData.activity_preview.favorites) || [];
    var recentVisits = (profileData && profileData.activity_preview && profileData.activity_preview.recent_visits) || [];

    var quickAddChips = [];
    favPreview.forEach(function (f) {
      if (f && f.vendor_id && !existingVendorSet.has(f.vendor_id)) {
        quickAddChips.push({ id: f.vendor_id, label: '💛 ' + f.name });
      }
    });
    recentVisits.forEach(function (v) {
      if (
        v &&
        v.vendor_id &&
        v.can_open_detail &&
        !existingVendorSet.has(v.vendor_id) &&
        !quickAddChips.some(function (q) { return q.id === v.vendor_id; })
      ) {
        quickAddChips.push({ id: v.vendor_id, label: '📍 ' + v.business_name });
      }
    });

    var modBannerHtml = '';
    if (col.moderation_notice && col.moderation_notice.suppressed) {
      modBannerHtml =
        '<div class="cp-note-box is-danger" role="alert">' +
        '<strong>Shared access suppressed by moderation:</strong> ' +
        ghEsc(col.moderation_notice.reason) +
        ' ' +
        ghEsc(col.moderation_notice.appeal_hint || '') +
        '</div>';
    }

    var entriesHtml = '';
    if (ghState.draftEntries.length === 0) {
      entriesHtml = '<div class="cp-note-box">No spots in this collection yet. Add businesses from the Sonoma County directory, your Saved Places, or your Visit Journal below.</div>';
    } else {
      entriesHtml = ghState.draftEntries
        .map(function (ent, idx) {
          var privateNote = ghState.visitNotesByVendor[ent.vendor_id] || '';
          var showCopyConfirm = ghState.pendingNoteCopyVendorId === ent.vendor_id && privateNote;
          var photoSlotHtml =
            typeof ghState.photoSlotHookRenderer === 'function'
              ? ghState.photoSlotHookRenderer(ent, idx, col, profileData, { ghEsc: ghEsc, reloadEditor: function () { return openCollectionEditor(col.collection_id); } })
              : '';

          return (
            '<div class="cp-entry-editor-card" data-gh-entry-idx="' + idx + '">' +
            '<div class="cp-entry-editor-head">' +
            '<div>' +
            '<strong>#' + (idx + 1) + ' · ' + ghEsc(ent.display_name) + '</strong>' +
            '<span class="cp-list-item-meta">' +
            ghEsc(ent.cuisine || 'Food spot') +
            ' · ' +
            ghEsc(ent.town || 'Sonoma County') +
            ' · ' +
            ghEsc(ent.service_status_label || '') +
            '</span>' +
            (ent.catalog_status === 'unavailable_publicly'
              ? '<span class="cp-private-tag" style="margin-left:0;margin-top:4px">Historical owner record — hidden from shared pages while unavailable in public catalog</span>'
              : '') +
            '</div>' +
            '<div class="cp-order-controls" role="group" aria-label="Reorder or remove ' + ghEsc(ent.display_name) + '">' +
            '<button type="button" class="cp-icon-btn" data-gh-move-up="' + idx + '"' + (idx === 0 || paused ? ' disabled' : '') + ' aria-label="Move ' + ghEsc(ent.display_name) + ' up">↑ Up</button>' +
            '<button type="button" class="cp-icon-btn" data-gh-move-down="' + idx + '"' + (idx === ghState.draftEntries.length - 1 || paused ? ' disabled' : '') + ' aria-label="Move ' + ghEsc(ent.display_name) + ' down">↓ Down</button>' +
            (ent.can_open_detail
              ? '<button type="button" class="cp-icon-btn" data-gh-spot-detail="' + ghEsc(ent.vendor_id) + '">Details</button>'
              : '') +
            '<button type="button" class="cp-icon-btn" data-gh-remove-idx="' + idx + '"' + (paused ? ' disabled' : '') + ' aria-label="Remove ' + ghEsc(ent.display_name) + '">✕ Remove</button>' +
            '</div>' +
            '</div>' +
            '<div class="cp-form-field" style="margin-bottom:8px">' +
            '<label for="ghRecInput-' + idx + '">Recommendation written for sharing (optional, up to 500 chars)</label>' +
            '<textarea id="ghRecInput-' + idx + '" data-gh-rec-idx="' + idx + '" maxlength="500"' + (paused ? ' disabled' : '') + ' placeholder="What would you tell a friend to order or know before going? (Private visit notes are never copied automatically.)">' + ghEsc(ent.recommendation || '') + '</textarea>' +
            '</div>' +
            (privateNote && !paused
              ? showCopyConfirm
                ? '<div class="cp-note-box is-warn" role="region" aria-label="Confirm copying private note">' +
                  '<strong>Review private Visit Journal note before copying:</strong><br>“' +
                  ghEsc(privateNote) +
                  '”<br><small>Confirming copies this text into this collection’s shareable recommendation field.</small>' +
                  '<div class="cp-btn-row">' +
                  '<button type="button" class="cp-inline-btn is-primary" data-gh-confirm-note-copy="' + idx + '">Confirm copy into recommendation</button>' +
                  '<button type="button" class="cp-inline-btn" data-gh-cancel-note-copy="1">Cancel</button>' +
                  '</div></div>'
                : '<button type="button" class="cp-inline-btn" data-gh-ask-note-copy="' + ghEsc(ent.vendor_id) + '">Review &amp; copy from my private visit note…</button>'
              : '') +
            photoSlotHtml +
            '</div>'
          );
        })
        .join('');
    }

    var hasActiveShares = Array.isArray(col.active_shares) && col.active_shares.length > 0;
    var sharedConfirmBox =
      hasActiveShares || ghState.requireSharedUpdateConfirm
        ? '<div class="cp-note-box is-warn">' +
          '<strong>Active unlisted link notice:</strong> Saving edits to this collection updates what viewers of its active unlisted link see. ' +
          '<label class="cp-check-tile" style="margin-top:8px">' +
          '<input type="checkbox" id="ghConfirmSharedUpdateCheck"' + (ghState.sharedUpdateConfirmed ? ' checked' : '') + '>' +
          '<span><strong>Update shared view:</strong> I confirm publishing any newly added spots or attachments to active unlisted links for this collection</span>' +
          '</label></div>'
        : '';

    var sharingPanelHtml =
      typeof ghState.sharingHookRenderer === 'function'
        ? ghState.sharingHookRenderer(col, profileData, {
            ghEsc: ghEsc,
            reloadEditor: function () { return openCollectionEditor(col.collection_id); }
          })
        : '';

    return (
      '<section class="cp-panel">' +
      '<div class="cp-btn-row" style="margin-top:0;margin-bottom:12px;justify-content:space-between">' +
      '<button type="button" class="cp-inline-btn" id="ghBackToListBtn">← All Greatest Hits collections</button>' +
      '<span class="cp-privacy-pill">' +
      ((col.active_shares || []).length > 0 ? '🔗 Unlisted link active' : '🔒 Private collection') +
      ' · Rev ' + Number(col.revision || 1) +
      '</span>' +
      '</div>' +
      modBannerHtml +
      (ghState.editorMsg
        ? '<div class="cp-status-msg' + (ghState.editorMsg.isError ? ' is-error' : '') + '" role="' + (ghState.editorMsg.isError ? 'alert' : 'status') + '">' + ghEsc(ghState.editorMsg.text) + '</div>'
        : '') +
      '<div class="cp-form-field">' +
      '<label for="ghEditTitleInput">Collection title (1 to 100 chars)</label>' +
      '<input id="ghEditTitleInput" type="text" maxlength="100" value="' + ghEsc(ghState.draftTitle) + '"' + (paused ? ' disabled' : '') + '>' +
      '</div>' +
      '<div class="cp-form-field">' +
      '<label for="ghEditIntroInput">Introduction (optional, up to 500 chars)</label>' +
      '<textarea id="ghEditIntroInput" maxlength="500"' + (paused ? ' disabled' : '') + '>' + ghEsc(ghState.draftIntro) + '</textarea>' +
      '</div>' +
      '<h3>Recommended spots (' + ghState.draftEntries.length + ' / 20)</h3>' +
      '<p class="cp-panel-lead">Use ↑ Up / ↓ Down buttons to reorder with keyboard or touch (no drag-and-drop required). No logged visit is required to include a spot.</p>' +
      entriesHtml +
      (!paused && ghState.draftEntries.length < 20
        ? '<div class="cp-panel" style="background:var(--trk-soft,#F0F0E5);margin-top:14px">' +
          '<h3>Add a Sonoma County spot</h3>' +
          '<div class="cp-grid-2">' +
          '<div class="cp-form-field" style="margin-bottom:8px">' +
          '<label for="ghCatalogFilterInput">Filter directory by name, town, or cuisine</label>' +
          '<input id="ghCatalogFilterInput" type="search" value="' + ghEsc(ghState.catalogFilter) + '" placeholder="Search 59 Sonoma County spots…">' +
          '</div>' +
          '<div class="cp-form-field" style="margin-bottom:8px">' +
          '<label for="ghCatalogSelect">Choose spot to add</label>' +
          '<select id="ghCatalogSelect">' +
          '<option value="">Select a spot (' + availableCatalog.length + ' matching)…</option>' +
          availableCatalog
            .slice(0, 60)
            .map(function (it) {
              return '<option value="' + ghEsc(it.id) + '">' + ghEsc(it.name + ' · ' + (it.city || 'Sonoma County') + ' (' + (it.cuisine || 'Food') + ')') + '</option>';
            })
            .join('') +
          '</select>' +
          '</div>' +
          '</div>' +
          '<div class="cp-btn-row">' +
          '<button type="button" class="cp-inline-btn" id="ghAddSelectedCatalogBtn">+ Add selected spot</button>' +
          quickAddChips
            .slice(0, 5)
            .map(function (ch) {
              return '<button type="button" class="cp-inline-btn" data-gh-quick-add="' + ghEsc(ch.id) + '">+ ' + ghEsc(ch.label) + '</button>';
            })
            .join('') +
          '</div>' +
          '</div>'
        : '') +
      sharedConfirmBox +
      '<div class="cp-btn-row">' +
      '<button type="button" class="cp-inline-btn is-primary" id="ghSaveCollectionBtn"' + (paused || ghState.saving ? ' disabled' : '') + '>' +
      (ghState.saving ? 'Saving…' : 'Save Greatest Hits changes') +
      '</button>' +
      '</div>' +
      '</section>' +
      sharingPanelHtml
    );
  }

  function renderInnerContent(profileData) {
    if (ghState.mode === 'edit' && ghState.activeCollection) {
      return renderEditorView(profileData);
    }
    return renderListView(profileData);
  }

  function addSpotToDraft(vendorId) {
    if (!vendorId || ghState.draftEntries.length >= 20) return;
    if (ghState.draftEntries.some(function (e) { return e.vendor_id === vendorId; })) {
      ghState.editorMsg = { text: 'That spot is already in this collection.', isError: true };
      triggerRerender();
      return;
    }
    var catalog = getCanonicalCatalogItems();
    var found = catalog.find(function (c) { return c.id === vendorId; });
    if (!found) {
      ghState.editorMsg = { text: 'Could not find that spot in the active directory.', isError: true };
      triggerRerender();
      return;
    }
    ghState.draftEntries.push({
      vendor_id: found.id,
      display_name: found.name,
      cuisine: found.cuisine || 'Food spot',
      town: found.city || 'Sonoma County',
      catalog_status: 'available',
      service_status_label: found.isOpen ? 'Open / Est. open' : 'Check hours',
      can_open_detail: true,
      recommendation: '',
      photo_attachment: null,
      photo_attachment_id: null
    });
    ghState.dirty = true;
    ghState.editorMsg = { text: 'Added ' + found.name + ' to draft. Click Save Greatest Hits changes to persist.', isError: false };
    triggerRerender();
  }

  function syncDraftFieldsFromDom(root) {
    var titleEl = root.querySelector('#ghEditTitleInput');
    var introEl = root.querySelector('#ghEditIntroInput');
    if (titleEl) ghState.draftTitle = titleEl.value;
    if (introEl) ghState.draftIntro = introEl.value;
    root.querySelectorAll('[data-gh-rec-idx]').forEach(function (ta) {
      var i = Number(ta.dataset.ghRecIdx);
      if (ghState.draftEntries[i]) {
        ghState.draftEntries[i].recommendation = ta.value;
      }
    });
    var chk = root.querySelector('#ghConfirmSharedUpdateCheck');
    if (chk) {
      ghState.sharedUpdateConfirmed = Boolean(chk.checked);
    }
  }

  function bindGreatestHitsEvents(root, helpers) {
    var retryBtn = root.querySelector('#ghRetryListBtn');
    if (retryBtn) {
      retryBtn.onclick = function () {
        ensureCollectionsLoaded(true);
      };
    }

    var createForm = root.querySelector('#ghCreateColForm');
    if (createForm) {
      createForm.onsubmit = async function (ev) {
        ev.preventDefault();
        var titleEl = root.querySelector('#ghNewTitleInput');
        var introEl = root.querySelector('#ghNewIntroInput');
        var btn = root.querySelector('#ghCreateColBtn');
        var titleVal = (titleEl && titleEl.value ? titleEl.value : '').trim();
        var introVal = introEl && introEl.value ? introEl.value : '';
        if (!titleVal) {
          ghState.editorMsg = { text: 'Enter a collection title (1 to 100 characters).', isError: true };
          triggerRerender();
          return;
        }
        if (btn) btn.disabled = true;
        try {
          var created = await window.bitesharkProfile.createCollection({
            title: titleVal,
            intro: introVal
          });
          ghState.collections = null;
          ghState.editorMsg = { text: 'Created "' + created.collection.title + '". Add spots below!', isError: false };
          await openCollectionEditor(created.collection.collection_id);
        } catch (err) {
          ghState.editorMsg = { text: err.message || 'Could not create collection.', isError: true };
          triggerRerender();
        }
      };
    }

    root.querySelectorAll('[data-gh-open-col]').forEach(function (btn) {
      btn.onclick = function () {
        openCollectionEditor(btn.dataset.ghOpenCol);
      };
    });

    root.querySelectorAll('[data-gh-ask-delete]').forEach(function (btn) {
      btn.onclick = function () {
        ghState.confirmDeleteColId = btn.dataset.ghAskDelete;
        triggerRerender();
      };
    });

    root.querySelectorAll('[data-gh-cancel-delete]').forEach(function (btn) {
      btn.onclick = function () {
        ghState.confirmDeleteColId = null;
        triggerRerender();
      };
    });

    root.querySelectorAll('[data-gh-confirm-delete]').forEach(function (btn) {
      btn.onclick = async function () {
        var cid = btn.dataset.ghConfirmDelete;
        btn.disabled = true;
        try {
          await window.bitesharkProfile.deleteCollection(cid);
          ghState.confirmDeleteColId = null;
          ghState.editorMsg = { text: 'Collection deleted and any active unlisted links revoked.', isError: false };
          await ensureCollectionsLoaded(true);
          if (helpers && typeof helpers.reloadProfile === 'function') {
            helpers.reloadProfile({ force: true, tab: 'collections' });
          }
        } catch (err) {
          ghState.editorMsg = { text: err.message || 'Could not delete collection.', isError: true };
          triggerRerender();
        }
      };
    });

    var backBtn = root.querySelector('#ghBackToListBtn');
    if (backBtn) {
      backBtn.onclick = function () {
        ghState.mode = 'list';
        ghState.activeCollection = null;
        ghState.editorMsg = null;
        ensureCollectionsLoaded(true);
      };
    }

    var filterInput = root.querySelector('#ghCatalogFilterInput');
    if (filterInput) {
      filterInput.oninput = function () {
        syncDraftFieldsFromDom(root);
        ghState.catalogFilter = filterInput.value;
        var pos = filterInput.selectionStart || 0;
        triggerRerender();
        var nextInput = document.getElementById('ghCatalogFilterInput');
        if (nextInput) {
          nextInput.focus();
          try { nextInput.setSelectionRange(pos, pos); } catch (_e) {}
        }
      };
    }

    var addCatBtn = root.querySelector('#ghAddSelectedCatalogBtn');
    if (addCatBtn) {
      addCatBtn.onclick = function () {
        syncDraftFieldsFromDom(root);
        var sel = root.querySelector('#ghCatalogSelect');
        if (sel && sel.value) {
          addSpotToDraft(sel.value);
        }
      };
    }

    root.querySelectorAll('[data-gh-quick-add]').forEach(function (btn) {
      btn.onclick = function () {
        syncDraftFieldsFromDom(root);
        addSpotToDraft(btn.dataset.ghQuickAdd);
      };
    });

    // Keyboard-accessible Up / Down reordering with focus restoration & polite announcement
    root.querySelectorAll('[data-gh-move-up]').forEach(function (btn) {
      btn.onclick = function () {
        syncDraftFieldsFromDom(root);
        var idx = Number(btn.dataset.ghMoveUp);
        if (idx > 0 && idx < ghState.draftEntries.length) {
          var moved = ghState.draftEntries[idx];
          ghState.draftEntries[idx] = ghState.draftEntries[idx - 1];
          ghState.draftEntries[idx - 1] = moved;
          ghState.dirty = true;
          triggerRerender();
          if (helpers && helpers.announcePolite) {
            helpers.announcePolite('Moved ' + moved.display_name + ' to position ' + idx + ' of ' + ghState.draftEntries.length);
          }
          var targetFocus = document.querySelector('[data-gh-move-up="' + (idx - 1) + '"]') ||
            document.querySelector('[data-gh-move-down="' + (idx - 1) + '"]');
          if (targetFocus && !targetFocus.disabled) targetFocus.focus();
        }
      };
    });

    root.querySelectorAll('[data-gh-move-down]').forEach(function (btn) {
      btn.onclick = function () {
        syncDraftFieldsFromDom(root);
        var idx = Number(btn.dataset.ghMoveDown);
        if (idx >= 0 && idx < ghState.draftEntries.length - 1) {
          var moved = ghState.draftEntries[idx];
          ghState.draftEntries[idx] = ghState.draftEntries[idx + 1];
          ghState.draftEntries[idx + 1] = moved;
          ghState.dirty = true;
          triggerRerender();
          if (helpers && helpers.announcePolite) {
            helpers.announcePolite('Moved ' + moved.display_name + ' to position ' + (idx + 2) + ' of ' + ghState.draftEntries.length);
          }
          var targetFocus = document.querySelector('[data-gh-move-down="' + (idx + 1) + '"]') ||
            document.querySelector('[data-gh-move-up="' + (idx + 1) + '"]');
          if (targetFocus && !targetFocus.disabled) targetFocus.focus();
        }
      };
    });

    root.querySelectorAll('[data-gh-remove-idx]').forEach(function (btn) {
      btn.onclick = function () {
        syncDraftFieldsFromDom(root);
        var idx = Number(btn.dataset.ghRemoveIdx);
        var removed = ghState.draftEntries.splice(idx, 1)[0];
        ghState.dirty = true;
        triggerRerender();
        if (removed && helpers && helpers.announcePolite) {
          helpers.announcePolite('Removed ' + removed.display_name + ' from draft.');
        }
      };
    });

    root.querySelectorAll('[data-gh-spot-detail]').forEach(function (btn) {
      btn.onclick = function () {
        if (typeof openDetail === 'function') openDetail(btn.dataset.ghSpotDetail, btn);
      };
    });

    root.querySelectorAll('[data-gh-ask-note-copy]').forEach(function (btn) {
      btn.onclick = function () {
        syncDraftFieldsFromDom(root);
        ghState.pendingNoteCopyVendorId = btn.dataset.ghAskNoteCopy;
        triggerRerender();
      };
    });

    root.querySelectorAll('[data-gh-cancel-note-copy]').forEach(function (btn) {
      btn.onclick = function () {
        syncDraftFieldsFromDom(root);
        ghState.pendingNoteCopyVendorId = null;
        triggerRerender();
      };
    });

    root.querySelectorAll('[data-gh-confirm-note-copy]').forEach(function (btn) {
      btn.onclick = function () {
        syncDraftFieldsFromDom(root);
        var idx = Number(btn.dataset.ghConfirmNoteCopy);
        var ent = ghState.draftEntries[idx];
        if (ent && ghState.visitNotesByVendor[ent.vendor_id]) {
          ent.recommendation = String(ghState.visitNotesByVendor[ent.vendor_id]).slice(0, 500);
          ghState.dirty = true;
        }
        ghState.pendingNoteCopyVendorId = null;
        triggerRerender();
      };
    });

    var saveBtn = root.querySelector('#ghSaveCollectionBtn');
    if (saveBtn) {
      saveBtn.onclick = async function () {
        syncDraftFieldsFromDom(root);
        if (!ghState.activeCollection) return;
        ghState.saving = true;
        ghState.editorMsg = null;
        triggerRerender();
        try {
          var out = await window.bitesharkProfile.updateCollection({
            collection_id: ghState.activeCollection.collection_id,
            expected_revision: ghState.activeCollection.revision,
            title: ghState.draftTitle,
            intro: ghState.draftIntro,
            entries: ghState.draftEntries.map(function (e) {
              return {
                vendor_id: e.vendor_id,
                recommendation: e.recommendation || '',
                photo_attachment_id: e.photo_attachment_id || null
              };
            }),
            confirm_shared_view_update: Boolean(ghState.sharedUpdateConfirmed)
          });
          ghState.saving = false;
          ghState.collections = null;
          ghState.activeCollection = out.collection;
          ghState.draftTitle = out.collection.title;
          ghState.draftIntro = out.collection.intro;
          ghState.draftEntries = (out.collection.entries || []).map(function (e) {
            return {
              vendor_id: e.vendor_id,
              display_name: e.display_name,
              cuisine: e.cuisine,
              town: e.town,
              catalog_status: e.catalog_status,
              service_status_label: e.service_status_label,
              can_open_detail: e.can_open_detail,
              recommendation: e.recommendation || '',
              photo_attachment: e.photo_attachment || null,
              photo_attachment_id: e.photo_attachment ? e.photo_attachment.attachment_id : null
            };
          });
          ghState.dirty = false;
          ghState.requireSharedUpdateConfirm = false;
          ghState.sharedUpdateConfirmed = false;
          ghState.editorMsg = { text: 'Saved "' + out.collection.title + '" (revision ' + out.collection.revision + ').', isError: false };
          triggerRerender();
          if (helpers && helpers.announcePolite) {
            helpers.announcePolite('Saved Greatest Hits collection.');
          }
        } catch (err) {
          ghState.saving = false;
          if (err && err.code === 'SHARED_VIEW_CONFIRMATION_REQUIRED') {
            ghState.requireSharedUpdateConfirm = true;
          }
          ghState.editorMsg = { text: err.message || 'Could not save collection.', isError: true };
          triggerRerender();
        }
      };
    }

    if (typeof ghState.bindSharingEventsHook === 'function') {
      ghState.bindSharingEventsHook(root, ghState.activeCollection, ghState.lastHelpers && ghState.lastHelpers.profileData, {
        ghEsc: ghEsc,
        reloadEditor: function () {
          if (ghState.activeCollection) return openCollectionEditor(ghState.activeCollection.collection_id);
        },
        reloadProfile: helpers && helpers.reloadProfile
      });
    }
  }

  function renderGreatestHitsTabRoot(profileData, helpers) {
    ghState.lastHelpers = {
      profileData: profileData,
      announcePolite: helpers && helpers.announcePolite,
      reloadProfile: helpers && helpers.reloadProfile
    };
    setTimeout(function () {
      var host = document.getElementById('ghCollectionsHost');
      if (host) {
        bindGreatestHitsEvents(host, ghState.lastHelpers);
        if (ghState.mode === 'list' && ghState.collections === null && !ghState.loadingList) {
          ensureCollectionsLoaded(false);
        }
      }
    }, 0);
    return '<div id="ghCollectionsHost">' + renderInnerContent(profileData) + '</div>';
  }

  function resetGreatestHitsOnAuthChange() {
    ghState.mode = 'list';
    ghState.collections = null;
    ghState.loadingList = false;
    ghState.listError = null;
    ghState.activeCollection = null;
    ghState.draftTitle = '';
    ghState.draftIntro = '';
    ghState.draftEntries = [];
    ghState.visitNotesByVendor = {};
    ghState.editorMsg = null;
  }

  if (typeof window !== 'undefined') {
    if (typeof window.bitesharkRegisterCollectionsRenderer === 'function') {
      window.bitesharkRegisterCollectionsRenderer(renderGreatestHitsTabRoot);
    }
    var prevReset = window.bitesharkResetProfileUiOnAuthChange;
    window.bitesharkResetProfileUiOnAuthChange = function () {
      resetGreatestHitsOnAuthChange();
      if (typeof prevReset === 'function') prevReset();
    };
    window.bitesharkGreatestHitsHooks = {
      setSharingHooks: function (renderFn, bindFn) {
        ghState.sharingHookRenderer = renderFn;
        ghState.bindSharingEventsHook = bindFn;
      },
      setPhotoSlotHook: function (renderSlotFn) {
        ghState.photoSlotHookRenderer = renderSlotFn;
      },
      rerender: triggerRerender
    };
  }
})();
