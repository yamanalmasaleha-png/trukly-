// BiteShark Private Customer Profile, Activity/Progress Views, Preferences & Privacy UI
// (`public/customer-profile.js`)
//
// Reuses canonical services (`window.bitesharkProfile`, `window.bitesharkExploration`,
// `openLocalGuides`, `openSmart`, `showScreen`, `openDetail`, `window.bitesharkOpenSupport`,
// `window.openExplorationPrivacyModal`) without creating duplicate scoring or activity editors.

(function () {
  'use strict';

  var PROFILE_TABS = [
    { key: 'overview', label: 'Overview' },
    { key: 'activity', label: 'My activity' },
    { key: 'progress', label: 'My progress' },
    { key: 'collections', label: 'Greatest Hits' },
    { key: 'preferences', label: 'Preferences' },
    { key: 'privacy', label: 'Privacy & tools' }
  ];

  var AVATAR_LABELS = {
    initials_fern: 'Forest green initials',
    initials_terracotta: 'Terracotta initials',
    initials_ochre: 'Warm ochre initials',
    initials_slate: 'Coastal slate initials',
    shark_emblem: 'BiteShark fin mark',
    citrus_sprig: 'Sonoma grove mark'
  };

  var uiState = {
    activeTab: 'overview',
    loading: false,
    data: null,
    loadError: null,
    statusBanner: null,
    collectionsHookRenderer: null
  };

  function cpEsc(val) {
    return String(val === null || val === undefined ? '' : val)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function avatarContentHtml(avatarStyle, initials) {
    if (avatarStyle === 'shark_emblem') {
      return '<span aria-hidden="true">🦈</span>';
    }
    if (avatarStyle === 'citrus_sprig') {
      return '<span aria-hidden="true">🌿</span>';
    }
    return '<span>' + cpEsc(initials || 'BS') + '</span>';
  }

  function announcePolite(text) {
    var live = document.getElementById('cpLiveStatus');
    if (live) {
      live.textContent = '';
      setTimeout(function () {
        live.textContent = String(text || '');
      }, 20);
    }
  }

  function syncNearbyPrefsToLegacyAppGlobals(nearbyObj) {
    if (!nearbyObj) return;
    try {
      localStorage.setItem(
        'truckly_notify',
        JSON.stringify({
          nearby_enabled: Boolean(nearbyObj.nearby_enabled),
          radius_miles: Number(nearbyObj.radius_miles || 3)
        })
      );
      if (typeof notifyPrefs === 'object' && notifyPrefs) {
        notifyPrefs.nearby_enabled = Boolean(nearbyObj.nearby_enabled);
        notifyPrefs.radius_miles = Number(nearbyObj.radius_miles || 3);
      }
      if (typeof renderNotificationUI === 'function') {
        renderNotificationUI();
      }
    } catch (_e) {}
  }

  function resetProfileUiState() {
    uiState.loading = false;
    uiState.data = null;
    uiState.loadError = null;
    uiState.statusBanner = null;
    var screen = document.getElementById('profileScreen');
    if (screen && screen.classList.contains('active')) {
      renderProfileScreen();
    }
  }

  async function loadAndRenderProfile(opts) {
    var options = opts || {};
    if (options.tab && PROFILE_TABS.some(function (t) { return t.key === options.tab; })) {
      uiState.activeTab = options.tab;
    }

    var root = document.getElementById('customerProfileRoot');
    if (!root) return;

    if (!window.bitesharkProfile) {
      root.innerHTML = '<div class="cp-panel"><p>Profile client unavailable.</p></div>';
      return;
    }

    uiState.loading = true;
    uiState.loadError = null;
    renderProfileScreen();

    try {
      var data = await window.bitesharkProfile.getProfile({ force: Boolean(options.force) });
      uiState.data = data;
      uiState.loading = false;
      uiState.loadError = null;
      renderProfileScreen();
    } catch (err) {
      uiState.loading = false;
      uiState.loadError = err;
      renderProfileScreen();
    }
  }

  function renderSignedOutOrExpiredState(err) {
    var isExpired = err && err.status === 401;
    var nextHref = '/login.html?next=' + encodeURIComponent('/#profile');
    return (
      '<section class="cp-panel">' +
      '<span class="cp-kicker">PRIVATE ACCOUNT HOME</span>' +
      '<h2>' + (isExpired ? 'Sign in to view My BiteShark' : 'Sign in to organize your BiteShark spots') + '</h2>' +
      '<p class="cp-panel-lead">Your BiteShark profile, food preferences, Visit Journal summary, and curated Greatest Hits collections are private to your account and never require public social sharing.</p>' +
      '<div class="cp-btn-row">' +
      '<a class="cp-inline-btn is-primary" href="' + cpEsc(nextHref) + '" style="text-decoration:none">Sign in with email code →</a>' +
      '<button type="button" class="cp-inline-btn" data-cp-go-discover="1">Continue browsing local food</button>' +
      '</div>' +
      '</section>'
    );
  }

  function renderFeatureDisabledWithPrivacyFallback(err) {
    var msg = (err && err.message) || 'Your private profile dashboard is currently hidden by an administrator.';
    return (
      '<section class="cp-panel">' +
      '<span class="cp-kicker">PROFILE PRESENTATION PAUSED</span>' +
      '<h2>Profile view is temporarily unavailable</h2>' +
      '<p class="cp-panel-lead">' + cpEsc(msg) + '</p>' +
      '<div class="cp-note-box">Your saved records remain intact. Privacy export, private photo downloads, data deletion, share-link revocation, and Help &amp; feedback remain available below.</div>' +
      renderStandalonePrivacyToolsCard(null) +
      '</section>'
    );
  }

  function renderOverviewTab(d) {
    var prof = d.profile || {};
    var prog = d.progress || {};
    var counts = prog.counts || {};
    var ach = prog.achievements || null;
    var wc = prog.weekly_challenge || null;
    var editState = (d.feature_states && d.feature_states.customer_profile_editing) || { state: 'enabled' };
    var editDisabled = editState.state !== 'enabled';
    var avatarStyles =
      (d.preferences && d.preferences.catalog_options && d.preferences.catalog_options.allowed_avatar_styles) ||
      Object.keys(AVATAR_LABELS);
    var towns =
      (d.preferences && d.preferences.catalog_options && d.preferences.catalog_options.supported_towns) || [];

    var statsHtml = '<div class="cp-stat-grid">';
    if (ach) {
      statsHtml +=
        '<div class="cp-stat-card"><strong>Level ' + Number(ach.current_level.number) + ' · ' + cpEsc(ach.current_level.title) + '</strong>' +
        '<span>' + Number(ach.total_points) + ' exploration pts (non-redeemable)</span></div>';
      var unlockedCount = (ach.badges || []).filter(function (b) { return b.unlocked; }).length;
      statsHtml +=
        '<div class="cp-stat-card"><strong>' + unlockedCount + ' / ' + (ach.badges || []).length + '</strong>' +
        '<span>Badges unlocked</span></div>';
    } else if (prog.badges_feature_state === 'hidden' || prog.visits_feature_state === 'hidden') {
      statsHtml +=
        '<div class="cp-stat-card"><strong>Paused</strong><span>Levels &amp; badges display is currently hidden</span></div>';
    }
    if (wc) {
      statsHtml +=
        '<div class="cp-stat-card"><strong>' + Number(wc.progress_count) + ' / ' + Number(wc.target_count) + '</strong>' +
        '<span>Weekly challenge (' + cpEsc(wc.title) + ')</span></div>';
    }
    statsHtml +=
      '<div class="cp-stat-card"><strong>' + Number(counts.favorites_count || 0) + '</strong><span>Saved favorite spots</span></div>' +
      '</div>';

    var editNoticeHtml = '';
    if (editState.state === 'paused') {
      editNoticeHtml = '<div class="cp-note-box is-warn" role="status">' + cpEsc(editState.message || 'Profile editing is temporarily paused.') + '</div>';
    } else if (editState.state === 'hidden') {
      editNoticeHtml = '<div class="cp-note-box" role="status">Profile editing is currently hidden. Your saved details remain intact.</div>';
    }

    var avatarRadiosHtml = avatarStyles
      .map(function (st) {
        var checked = (prof.avatar_style || 'initials_fern') === st ? ' checked' : '';
        var dis = editDisabled ? ' disabled' : '';
        return (
          '<label class="cp-avatar-choice">' +
          '<input type="radio" name="cpAvatarStyle" value="' + cpEsc(st) + '"' + checked + dis + '>' +
          '<span>' + cpEsc(AVATAR_LABELS[st] || st) + '</span>' +
          '</label>'
        );
      })
      .join('');

    var townOptionsHtml =
      '<option value="">No preferred town set</option>' +
      towns
        .map(function (t) {
          var sel = prof.preferred_town === t ? ' selected' : '';
          return '<option value="' + cpEsc(t) + '"' + sel + '>' + cpEsc(t) + '</option>';
        })
        .join('');

    return (
      '<section class="cp-panel" aria-labelledby="cpOverviewTitle">' +
      '<h2 id="cpOverviewTitle">Account overview</h2>' +
      '<p class="cp-panel-lead">Everything here stays private to your account unless you explicitly include specific details on an unlisted Greatest Hits link.</p>' +
      statsHtml +
      '<div class="cp-btn-row">' +
      '<button type="button" class="cp-inline-btn is-primary" data-cp-switch-tab="collections">Curate Greatest Hits →</button>' +
      '<button type="button" class="cp-inline-btn" data-cp-jump="journal">Open Visit Journal</button>' +
      '<button type="button" class="cp-inline-btn" data-cp-jump="photos">Open Dish Photos</button>' +
      '<button type="button" class="cp-inline-btn" data-cp-jump="favorites">Saved Places</button>' +
      '<button type="button" class="cp-inline-btn" data-cp-jump="trails">Suggested Trails</button>' +
      '</div>' +
      '</section>' +
      (editState.state === 'hidden'
        ? editNoticeHtml
        : '<section class="cp-panel" aria-labelledby="cpEditProfileTitle">' +
          '<h2 id="cpEditProfileTitle">Profile card details</h2>' +
          '<p class="cp-panel-lead">Used in your private dashboard. Never shared unless you opt in per unlisted link.</p>' +
          editNoticeHtml +
          '<form id="cpOverviewForm" novalidate>' +
          '<div class="cp-grid-2">' +
          '<div class="cp-form-field">' +
          '<label for="cpDisplayNameInput">Display name (optional, up to 60 chars)</label>' +
          '<input id="cpDisplayNameInput" type="text" maxlength="60" value="' + cpEsc(prof.display_name || '') + '"' + (editDisabled ? ' disabled' : '') + ' placeholder="e.g. Maya or Sonoma Taco Fan">' +
          '<small class="cp-help">Avoid entering your email address or phone number.</small>' +
          '</div>' +
          '<div class="cp-form-field">' +
          '<label for="cpOverviewTownSelect">Preferred Sonoma County town/area (optional)</label>' +
          '<select id="cpOverviewTownSelect"' + (editDisabled ? ' disabled' : '') + '>' + townOptionsHtml + '</select>' +
          '<small class="cp-help">Coarse town only — BiteShark never asks for your home address.</small>' +
          '</div>' +
          '</div>' +
          '<div class="cp-form-field">' +
          '<label for="cpBioInput">Short food bio (optional, up to 240 chars)</label>' +
          '<textarea id="cpBioInput" maxlength="240"' + (editDisabled ? ' disabled' : '') + ' placeholder="Favorite Sonoma County food trucks, markets, or weekend stops…">' + cpEsc(prof.bio || '') + '</textarea>' +
          '</div>' +
          '<fieldset class="cp-form-field" style="border:0;padding:0;margin:0 0 14px">' +
          '<legend style="font-weight:600;font-size:0.92rem;margin-bottom:6px">Built-in avatar style (initials or BiteShark emblem)</legend>' +
          '<div class="cp-avatar-picker">' + avatarRadiosHtml + '</div>' +
          '</fieldset>' +
          '<div id="cpOverviewFormMsg" role="alert" hidden></div>' +
          '<div class="cp-btn-row">' +
          '<button type="submit" class="cp-inline-btn is-primary" id="cpOverviewSaveBtn"' + (editDisabled ? ' disabled' : '') + '>Save profile details</button>' +
          '</div>' +
          '</form>' +
          '</section>')
    );
  }

  function renderActivityTab(d) {
    var act = d.activity_preview || {};
    var fs = d.feature_states || {};
    var visitsState = (fs.visit_journal && fs.visit_journal.state) || 'enabled';
    var photosState = (fs.private_photos && fs.private_photos.state) || 'enabled';
    var trailsState = (fs.suggested_trails && fs.suggested_trails.state) || 'enabled';

    var visitsHtml = '';
    if (visitsState === 'hidden') {
      visitsHtml = '<p class="cp-panel-lead">Visit Journal is currently hidden. Your saved visits remain safe and downloadable in Privacy &amp; tools.</p>';
    } else if (!act.recent_visits || act.recent_visits.length === 0) {
      visitsHtml = '<p class="cp-panel-lead">No visits logged yet. Check in from any spot or open your Visit Journal.</p>';
    } else {
      visitsHtml =
        '<ul class="cp-list">' +
        act.recent_visits
          .map(function (v) {
            return (
              '<li class="cp-list-item">' +
              '<div class="cp-list-item-body">' +
              '<strong>' + cpEsc(v.business_name) + '<span class="cp-private-tag">Private</span></strong>' +
              '<span class="cp-list-item-meta">' + cpEsc(v.visit_local_date) + ' · ' + cpEsc(v.display_town || 'Sonoma County') + '</span>' +
              (v.private_note ? '<span class="cp-list-item-meta">Note: “' + cpEsc(v.private_note) + '”</span>' : '') +
              '</div>' +
              (v.can_open_detail
                ? '<button type="button" class="cp-inline-btn" data-cp-open-spot="' + cpEsc(v.vendor_id) + '">Details</button>'
                : '') +
              '</li>'
            );
          })
          .join('') +
        '</ul>';
    }

    var photosHtml = '';
    if (photosState === 'hidden') {
      photosHtml = '<p class="cp-panel-lead">Private photo notebook is currently hidden. Existing photos remain accessible via Privacy &amp; tools.</p>';
    } else if (!act.recent_photos || act.recent_photos.length === 0) {
      photosHtml = '<p class="cp-panel-lead">No private dish photos saved yet.</p>';
    } else {
      photosHtml =
        '<div class="cp-photo-strip">' +
        act.recent_photos
          .map(function (p) {
            return (
              '<div class="cp-photo-thumb">' +
              '<img src="' + cpEsc(p.thumb_url) + '" alt="' + cpEsc(p.business_name || 'Saved dish photo') + '" loading="lazy">' +
              '<span>' + cpEsc(p.business_name || p.caption || 'Private photo') + '</span>' +
              '</div>'
            );
          })
          .join('') +
        '</div>';
    }

    var favsHtml = '';
    if (!act.favorites || act.favorites.length === 0) {
      favsHtml = '<p class="cp-panel-lead">No saved favorite places yet. Tap the heart on any listing to save it.</p>';
    } else {
      favsHtml =
        '<ul class="cp-list">' +
        act.favorites
          .map(function (f) {
            return (
              '<li class="cp-list-item">' +
              '<div class="cp-list-item-body">' +
              '<strong>' + cpEsc(f.name) + '</strong>' +
              '<span class="cp-list-item-meta">' + cpEsc(f.cuisine) + ' · ' + cpEsc(f.town) + ' · ' + cpEsc(f.service_status_label) + '</span>' +
              '</div>' +
              '<button type="button" class="cp-inline-btn" data-cp-open-spot="' + cpEsc(f.vendor_id) + '">View spot</button>' +
              '</li>'
            );
          })
          .join('') +
        '</ul>';
    }

    var trailsHtml = '';
    if (trailsState === 'hidden') {
      trailsHtml = '<p class="cp-panel-lead">Suggested Trails is currently hidden.</p>';
    } else if (!act.saved_trails || act.saved_trails.length === 0) {
      trailsHtml = '<p class="cp-panel-lead">No saved trails yet. Build a 3-stop Sonoma County route in Suggested Trails.</p>';
    } else {
      trailsHtml =
        '<ul class="cp-list">' +
        act.saved_trails
          .map(function (tr) {
            var comp = tr.progress ? Number(tr.progress.completed_stops || 0) + ' / ' + Number(tr.progress.total_stops || 0) + ' stops visited after save' : '';
            return (
              '<li class="cp-list-item">' +
              '<div class="cp-list-item-body">' +
              '<strong>' + cpEsc(tr.title) + '</strong>' +
              '<span class="cp-list-item-meta">' + cpEsc(comp) + '</span>' +
              '</div>' +
              '</li>'
            );
          })
          .join('') +
        '</ul>';
    }

    return (
      '<section class="cp-panel">' +
      '<h2>Visit Journal (' + (act.visits_total === null ? 'hidden' : Number(act.visits_total)) + ')</h2>' +
      '<p class="cp-panel-lead">Recent self-reported visits and private tasting notes.</p>' +
      visitsHtml +
      (visitsState !== 'hidden'
        ? '<div class="cp-btn-row"><button type="button" class="cp-inline-btn is-primary" data-cp-jump="journal">View all &amp; edit notes in Visit Journal →</button></div>'
        : '') +
      '</section>' +
      '<section class="cp-panel">' +
      '<h2>Private Dish Photos (' + (act.photos_total === null ? 'hidden' : Number(act.photos_total)) + ' / 12)</h2>' +
      photosHtml +
      (photosState !== 'hidden'
        ? '<div class="cp-btn-row"><button type="button" class="cp-inline-btn" data-cp-jump="photos">View all in Dish Photos →</button></div>'
        : '') +
      '</section>' +
      '<section class="cp-panel">' +
      '<h2>Saved Places (' + Number(act.favorites_total || 0) + ')</h2>' +
      favsHtml +
      '<div class="cp-btn-row"><button type="button" class="cp-inline-btn" data-cp-jump="favorites">View all Saved Places →</button></div>' +
      '</section>' +
      '<section class="cp-panel">' +
      '<h2>Saved Trails (' + (act.saved_trails_total === null ? 'hidden' : Number(act.saved_trails_total)) + ')</h2>' +
      trailsHtml +
      (trailsState !== 'hidden'
        ? '<div class="cp-btn-row"><button type="button" class="cp-inline-btn" data-cp-jump="trails">View all Suggested Trails →</button></div>'
        : '') +
      '</section>'
    );
  }

  function renderProgressTab(d) {
    var prog = d.progress || {};
    var ach = prog.achievements || null;
    var wc = prog.weekly_challenge || null;
    var act = d.activity_preview || {};

    var levelHtml = '';
    if (prog.visits_feature_state === 'hidden' || prog.badges_feature_state === 'hidden') {
      levelHtml =
        '<div class="cp-note-box" role="status">Points, levels, and badges presentation is currently disabled. Your underlying visit and photo records remain preserved.</div>';
    } else if (ach) {
      var nextCopy = ach.next_level
        ? Number(ach.next_level.points_needed) + ' pts to Level ' + Number(ach.next_level.number) + ' (' + cpEsc(ach.next_level.title) + ')'
        : 'Top exploration level reached';
      var badgesCards = (ach.badges || [])
        .map(function (b) {
          return (
            '<div class="cp-badge-card' + (b.unlocked ? ' is-unlocked' : '') + '">' +
            '<strong>' + (b.unlocked ? '🏅 ' : '○ ') + cpEsc(b.title) + '</strong>' +
            '<span class="cp-list-item-meta">' + cpEsc(b.requirement || b.description || '') + '</span>' +
            '<span class="cp-list-item-meta">' + Number(b.progress_current || 0) + ' / ' + Number(b.progress_target || 1) + (b.unlocked ? ' · Unlocked' : '') + '</span>' +
            '</div>'
          );
        })
        .join('');
      levelHtml =
        '<div class="cp-stat-grid">' +
        '<div class="cp-stat-card"><strong>Level ' + Number(ach.current_level.number) + '</strong><span>' + cpEsc(ach.current_level.title) + '</span></div>' +
        '<div class="cp-stat-card"><strong>' + Number(ach.total_points || 0) + ' pts</strong><span>' + cpEsc(nextCopy) + '</span></div>' +
        '</div>' +
        '<div class="cp-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Number(ach.progress_percent || 0) + '" aria-label="Progress toward next level">' +
        '<div class="cp-progress-fill" style="width:' + Math.max(0, Math.min(100, Number(ach.progress_percent || 0))) + '%"></div>' +
        '</div>' +
        '<h3 style="margin-top:16px">Exploration badges</h3>' +
        '<div class="cp-badge-grid">' + badgesCards + '</div>';
    }

    var challengeHtml = '';
    if (prog.visits_feature_state === 'hidden' || prog.challenges_feature_state === 'hidden') {
      challengeHtml = '<div class="cp-note-box" role="status">Weekly challenges are currently disabled.</div>';
    } else if (wc) {
      var pct = wc.target_count > 0 ? Math.min(100, Math.round((wc.progress_count / wc.target_count) * 100)) : 0;
      challengeHtml =
        '<p class="cp-panel-lead"><strong>' + cpEsc(wc.title) + '</strong> — ' + cpEsc(wc.description || '') + ' (' + cpEsc(wc.week_start_local || '') + ' to ' + cpEsc(wc.week_end_local || '') + ')</p>' +
        '<div class="cp-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '" aria-label="Weekly challenge progress">' +
        '<div class="cp-progress-fill" style="width:' + pct + '%"></div>' +
        '</div>' +
        '<p class="cp-help">' + Number(wc.progress_count || 0) + ' of ' + Number(wc.target_count || 2) + ' stops logged this week' + (wc.completed ? ' · Completed!' : '') + '</p>';
    }

    var trailProgHtml = '';
    if (prog.trails_feature_state === 'hidden') {
      trailProgHtml = '<div class="cp-note-box" role="status">Suggested Trails progress is currently hidden.</div>';
    } else if (!act.saved_trails || act.saved_trails.length === 0) {
      trailProgHtml = '<p class="cp-panel-lead">Save a Suggested Trail to track post-save stop visits.</p>';
    } else {
      trailProgHtml =
        '<ul class="cp-list">' +
        act.saved_trails
          .map(function (tr) {
            var p = tr.progress || {};
            return (
              '<li class="cp-list-item">' +
              '<div class="cp-list-item-body"><strong>' + cpEsc(tr.title) + '</strong>' +
              '<span class="cp-list-item-meta">' + Number(p.completed_stops || 0) + ' of ' + Number(p.total_stops || 0) + ' stops visited since saving</span></div>' +
              '</li>'
            );
          })
          .join('') +
        '</ul>';
    }

    return (
      '<section class="cp-panel">' +
      '<h2>Exploration progress</h2>' +
      '<div class="cp-note-box">' + cpEsc((prog.disclosures && prog.disclosures.self_reported_note) || 'Visits are self-reported personal check-ins. Points, levels, and badges are non-redeemable.') + '</div>' +
      levelHtml +
      '</section>' +
      '<section class="cp-panel"><h2>Weekly challenge</h2>' + challengeHtml + '</section>' +
      '<section class="cp-panel"><h2>Saved-trail completion</h2>' + trailProgHtml + '</section>'
    );
  }

  function renderPreferencesTab(d) {
    var prefs = d.preferences || {};
    var opts = prefs.catalog_options || {};
    var towns = opts.supported_towns || [];
    var interests = opts.supported_food_interests || [];
    var selectedInterests = new Set(prefs.food_interests || []);
    var editState = (d.feature_states && d.feature_states.customer_profile_editing) || { state: 'enabled' };
    var editDisabled = editState.state !== 'enabled';
    var nearby = prefs.nearby_alerts || null;
    var nearbyState = (nearby && nearby.feature_state) || 'enabled';

    var townSelectHtml =
      '<option value="">All Sonoma County (no specific town)</option>' +
      towns
        .map(function (t) {
          var sel = prefs.preferred_town === t ? ' selected' : '';
          return '<option value="' + cpEsc(t) + '"' + sel + '>' + cpEsc(t) + '</option>';
        })
        .join('');

    var interestChecks = interests
      .map(function (item) {
        var chk = selectedInterests.has(item.key) ? ' checked' : '';
        return (
          '<label class="cp-check-tile">' +
          '<input type="checkbox" name="cpFoodInterest" value="' + cpEsc(item.key) + '"' + chk + (editDisabled ? ' disabled' : '') + '>' +
          '<span>' + cpEsc(item.label) + '</span>' +
          '</label>'
        );
      })
      .join('');

    var nearbySectionHtml = '';
    if (nearby && nearbyState !== 'hidden') {
      var nDis = editDisabled || nearbyState !== 'enabled';
      var radii = [1, 3, 5, 10, 15, 30];
      nearbySectionHtml =
        '<div class="cp-panel">' +
        '<h3>Saved-spot nearby alert preference</h3>' +
        '<div class="cp-note-box is-warn">' + cpEsc(nearby.honest_status_note) + '</div>' +
        '<div class="cp-grid-2">' +
        '<label class="cp-check-tile">' +
        '<input type="checkbox" id="cpNearbyEnabledCheck"' + (nearby.nearby_enabled ? ' checked' : '') + (nDis ? ' disabled' : '') + '>' +
        '<span>Save nearby-spot alert preference when available</span>' +
        '</label>' +
        '<div class="cp-form-field" style="margin-bottom:0">' +
        '<label for="cpNearbyRadiusSelect">Preferred radius (miles)</label>' +
        '<select id="cpNearbyRadiusSelect"' + (nDis ? ' disabled' : '') + '>' +
        radii
          .map(function (r) {
            return '<option value="' + r + '"' + (Number(nearby.radius_miles) === r ? ' selected' : '') + '>' + r + ' miles</option>';
          })
          .join('') +
        '</select>' +
        '</div>' +
        '</div>' +
        '</div>';
    }

    return (
      '<form id="cpPreferencesForm" novalidate>' +
      '<section class="cp-panel">' +
      '<h2>Browsing &amp; food preferences</h2>' +
      '<p class="cp-panel-lead">Saved to your BiteShark account across devices. Vendor ownership and administrator roles are managed separately outside customer preferences.</p>' +
      (editState.state !== 'enabled'
        ? '<div class="cp-note-box is-warn" role="status">' + cpEsc(editState.message || 'Preference editing is currently unavailable.') + '</div>'
        : '') +
      '<div class="cp-form-field">' +
      '<label for="cpPrefTownSelect">Preferred Sonoma County town/area</label>' +
      '<select id="cpPrefTownSelect"' + (editDisabled ? ' disabled' : '') + '>' + townSelectHtml + '</select>' +
      '<small class="cp-help">Coarse town or area only — never enter your street address or sensitive personal details.</small>' +
      '</div>' +
      '<fieldset class="cp-form-field" style="border:0;padding:0;margin:0">' +
      '<legend style="font-weight:600;font-size:0.92rem">Food interests &amp; browsing preferences (choose up to 10)</legend>' +
      '<div class="cp-note-box is-warn">' + cpEsc((prefs.disclosures && prefs.disclosures.dietary_disclaimer) || 'Dietary tags reflect browsing preferences only — never an allergy-safety guarantee.') + '</div>' +
      '<div class="cp-interest-grid">' + interestChecks + '</div>' +
      '</fieldset>' +
      '</section>' +
      nearbySectionHtml +
      '<section class="cp-panel">' +
      '<h3>Optional BiteShark product updates (separate consent)</h3>' +
      '<p class="cp-panel-lead">' + cpEsc((prefs.disclosures && prefs.disclosures.communication_consent_note) || '') + '</p>' +
      '<label class="cp-check-tile">' +
      '<input type="checkbox" id="cpCommOptInCheck"' + (prefs.communication_product_updates_opt_in ? ' checked' : '') + (editDisabled ? ' disabled' : '') + '>' +
      '<span>Allow occasional BiteShark product update emails in the future (optional; separate from food preferences and transactional account security emails)</span>' +
      '</label>' +
      '<div id="cpPrefsFormMsg" role="alert" hidden></div>' +
      '<div class="cp-btn-row">' +
      '<button type="submit" class="cp-inline-btn is-primary" id="cpPrefsSaveBtn"' + (editDisabled ? ' disabled' : '') + '>Save preferences</button>' +
      '</div>' +
      '</section>' +
      '</form>'
    );
  }

  function renderStandalonePrivacyToolsCard(d) {
    var shares = (d && d.active_shares_summary && d.active_shares_summary.items) || [];
    var shareRowsHtml = '';
    if (shares.length === 0) {
      shareRowsHtml = '<p class="cp-help">You have 0 active unlisted share links. All your profile and collection records are private.</p>';
    } else {
      shareRowsHtml =
        '<ul class="cp-list">' +
        shares
          .map(function (s) {
            return (
              '<li class="cp-list-item">' +
              '<div class="cp-list-item-body">' +
              '<strong>' + cpEsc(s.collection_title) + ' (' + cpEsc(s.masked_token_hint) + ')</strong>' +
              '<span class="cp-list-item-meta">Created ' + cpEsc(String(s.created_at || '').slice(0, 10)) +
              (s.expires_at ? ' · Expires ' + cpEsc(String(s.expires_at).slice(0, 10)) : ' · No automatic expiry') +
              '</span></div>' +
              '<button type="button" class="cp-inline-btn is-danger" data-cp-revoke-share="' + cpEsc(s.share_id) + '">Revoke link</button>' +
              '</li>'
            );
          })
          .join('') +
        '</ul>';
    }

    return (
      '<section class="cp-panel">' +
      '<h2>Privacy, export, share links &amp; data tools</h2>' +
      '<p class="cp-panel-lead">Export your account data, retrieve your private dish photos, revoke unlisted share links, or clear optional profile and exploration data at any time.</p>' +
      '<div class="cp-btn-row">' +
      '<button type="button" class="cp-inline-btn is-primary" id="cpDownloadFullArchiveBtn">Download JSON data export</button>' +
      '<button type="button" class="cp-inline-btn" id="cpOpenPhotosExportModalBtn">Private photo files &amp; item-by-item removal</button>' +
      '<button type="button" class="cp-inline-btn" id="cpOpenSupportPrivacyBtn">Help, feedback &amp; account privacy request</button>' +
      '</div>' +
      '<div id="cpPrivacyActionMsg" role="status" aria-live="polite" hidden></div>' +
      '<hr style="border:0;border-top:1px solid var(--trk-border,#D7DED3);margin:18px 0">' +
      '<h3>Active unlisted share links</h3>' +
      shareRowsHtml +
      '<hr style="border:0;border-top:1px solid var(--trk-border,#D7DED3);margin:18px 0">' +
      '<h3>Delete optional profile &amp; Greatest Hits data</h3>' +
      '<div class="cp-note-box is-warn">' +
      '<strong>Important distinction:</strong> Clearing data below deletes your optional profile card, preferences, Greatest Hits collections, and active share links (and optionally your Visit Journal, private photos, and saved trails). It <strong>does not delete your core BiteShark login account</strong>, catering inquiries, vendor memberships, or support tickets. To request full account closure or privacy assistance, use <em>Help, feedback &amp; account privacy request</em> above.' +
      '</div>' +
      '<label class="cp-check-tile" style="margin-bottom:10px">' +
      '<input type="checkbox" id="cpClearIncludeExplorationCheck">' +
      '<span>Also delete all Visit Journal check-ins, private dish photos, and saved trails</span>' +
      '</label>' +
      '<label class="cp-check-tile">' +
      '<input type="checkbox" id="cpConfirmClearDataCheck">' +
      '<span>I understand this immediately revokes active share links and permanently clears the selected optional records</span>' +
      '</label>' +
      '<div class="cp-btn-row">' +
      '<button type="button" class="cp-inline-btn is-danger" id="cpExecuteClearDataBtn">Delete selected optional data</button>' +
      '</div>' +
      '</section>'
    );
  }

  function renderDefaultCollectionsPlaceholder(d) {
    if (typeof uiState.collectionsHookRenderer === 'function') {
      return uiState.collectionsHookRenderer(d, { cpEsc: cpEsc, announcePolite: announcePolite, reloadProfile: loadAndRenderProfile });
    }
    return (
      '<section class="cp-panel">' +
      '<h2>Greatest Hits collections</h2>' +
      '<p class="cp-panel-lead">Curate personal lists of favorite Sonoma County food spots.</p>' +
      '</section>'
    );
  }

  function renderProfileScreen() {
    var root = document.getElementById('customerProfileRoot');
    if (!root) return;

    if (uiState.loading && !uiState.data) {
      root.innerHTML =
        '<div class="cp-shell"><div class="cp-panel" role="status" aria-live="polite">' +
        '<h2>Loading My BiteShark…</h2><p class="cp-panel-lead">Fetching your private account dashboard.</p></div></div>';
      return;
    }

    if (uiState.loadError) {
      var err = uiState.loadError;
      if (err.status === 401) {
        root.innerHTML = '<div class="cp-shell">' + renderSignedOutOrExpiredState(err) + '</div>';
        bindProfileEvents(root);
        return;
      }
      if (err.code === 'FEATURE_DISABLED') {
        root.innerHTML = '<div class="cp-shell">' + renderFeatureDisabledWithPrivacyFallback(err) + '</div>';
        bindProfileEvents(root);
        return;
      }
      root.innerHTML =
        '<div class="cp-shell"><div class="cp-panel" role="alert">' +
        '<h2>Could not load My BiteShark right now</h2>' +
        '<p class="cp-panel-lead">' + cpEsc(err.message || 'Temporary connection problem.') + '</p>' +
        (err.correlationId ? '<p class="cp-help">Reference: <code>' + cpEsc(err.correlationId) + '</code></p>' : '') +
        '<div class="cp-btn-row">' +
        '<button type="button" class="cp-inline-btn is-primary" id="cpRetryLoadBtn">Try again</button>' +
        '<button type="button" class="cp-inline-btn" id="cpOpenSupportOnErrBtn">Help &amp; feedback</button>' +
        '</div></div></div>';
      bindProfileEvents(root);
      return;
    }

    var d = uiState.data;
    if (!d || !d.profile) {
      root.innerHTML = '<div class="cp-shell">' + renderSignedOutOrExpiredState(null) + '</div>';
      bindProfileEvents(root);
      return;
    }

    var prof = d.profile;
    var titleName = prof.display_name || 'My BiteShark';
    var subtitle = prof.preferred_town
      ? 'Preferred area: ' + prof.preferred_town + ' · Private account home'
      : 'Sonoma County · Private account home';

    var tabsHtml = PROFILE_TABS.map(function (t) {
      var selected = uiState.activeTab === t.key;
      return (
        '<button type="button" role="tab" class="cp-tab" id="cpTabBtn-' + t.key + '" ' +
        'aria-selected="' + (selected ? 'true' : 'false') + '" ' +
        'aria-controls="cpTabPanel-' + t.key + '" ' +
        'tabindex="' + (selected ? '0' : '-1') + '" ' +
        'data-cp-tab="' + t.key + '">' +
        cpEsc(t.label) +
        '</button>'
      );
    }).join('');

    var panelBody = '';
    if (uiState.activeTab === 'overview') panelBody = renderOverviewTab(d);
    else if (uiState.activeTab === 'activity') panelBody = renderActivityTab(d);
    else if (uiState.activeTab === 'progress') panelBody = renderProgressTab(d);
    else if (uiState.activeTab === 'collections') panelBody = renderDefaultCollectionsPlaceholder(d);
    else if (uiState.activeTab === 'preferences') panelBody = renderPreferencesTab(d);
    else if (uiState.activeTab === 'privacy') panelBody = renderStandalonePrivacyToolsCard(d);

    var bannerHtml = '';
    if (uiState.statusBanner) {
      bannerHtml =
        '<div class="cp-status-msg' + (uiState.statusBanner.isError ? ' is-error' : '') + '" role="' +
        (uiState.statusBanner.isError ? 'alert' : 'status') + '">' +
        cpEsc(uiState.statusBanner.text) +
        '</div>';
    }

    root.innerHTML =
      '<div class="cp-shell">' +
      '<div id="cpLiveStatus" class="sr-only" role="status" aria-live="polite"></div>' +
      '<header class="cp-header">' +
      '<div class="cp-header-main">' +
      '<div class="cp-avatar" data-avatar-style="' + cpEsc(prof.avatar_style || 'initials_fern') + '">' +
      avatarContentHtml(prof.avatar_style, prof.initials) +
      '</div>' +
      '<div class="cp-header-copy">' +
      '<span class="cp-kicker">MY BITESHARK</span>' +
      '<h1 id="profileScreenHeading">' + cpEsc(titleName) + '</h1>' +
      '<p class="cp-header-sub">' + cpEsc(subtitle) + '</p>' +
      (prof.bio ? '<p class="cp-header-sub">' + cpEsc(prof.bio) + '</p>' : '') +
      '</div>' +
      '</div>' +
      '<span class="cp-privacy-pill">🔒 Private by default</span>' +
      '</header>' +
      bannerHtml +
      '<div class="cp-tabs" role="tablist" aria-label="My BiteShark sections">' + tabsHtml + '</div>' +
      '<div id="cpTabPanel-' + cpEsc(uiState.activeTab) + '" role="tabpanel" aria-labelledby="cpTabBtn-' + cpEsc(uiState.activeTab) + '">' +
      panelBody +
      '</div>' +
      '</div>';

    bindProfileEvents(root);
  }

  function showInlineMessage(elId, text, isError) {
    var el = document.getElementById(elId);
    if (!el) return;
    el.hidden = false;
    el.className = 'cp-status-msg' + (isError ? ' is-error' : '');
    el.textContent = text;
  }

  function bindProfileEvents(root) {
    var retryBtn = root.querySelector('#cpRetryLoadBtn');
    if (retryBtn) {
      retryBtn.onclick = function () {
        loadAndRenderProfile({ force: true });
      };
    }

    var errSupportBtn = root.querySelector('#cpOpenSupportOnErrBtn');
    if (errSupportBtn) {
      errSupportBtn.onclick = function () {
        if (typeof window.bitesharkOpenSupport === 'function') {
          window.bitesharkOpenSupport({
            mode: 'contextual_error',
            featureKey: 'customer_profile',
            operationName: 'load_private_profile',
            correlationId: (uiState.loadError && uiState.loadError.correlationId) || null
          });
        }
      };
    }

    root.querySelectorAll('[data-cp-go-discover]').forEach(function (btn) {
      btn.onclick = function () {
        if (typeof showScreen === 'function') showScreen('discover');
      };
    });

    // Accessible tablist switching + Left/Right/Home/End keyboard navigation
    var tabButtons = Array.prototype.slice.call(root.querySelectorAll('[role="tab"][data-cp-tab]'));
    tabButtons.forEach(function (btn, idx) {
      btn.onclick = function () {
        uiState.statusBanner = null;
        uiState.activeTab = btn.dataset.cpTab;
        renderProfileScreen();
        var nextBtn = document.getElementById('cpTabBtn-' + uiState.activeTab);
        if (nextBtn) nextBtn.focus();
      };
      btn.onkeydown = function (ev) {
        var targetIdx = -1;
        if (ev.key === 'ArrowRight') targetIdx = (idx + 1) % tabButtons.length;
        else if (ev.key === 'ArrowLeft') targetIdx = (idx - 1 + tabButtons.length) % tabButtons.length;
        else if (ev.key === 'Home') targetIdx = 0;
        else if (ev.key === 'End') targetIdx = tabButtons.length - 1;
        if (targetIdx >= 0) {
          ev.preventDefault();
          var targetTab = tabButtons[targetIdx].dataset.cpTab;
          uiState.statusBanner = null;
          uiState.activeTab = targetTab;
          renderProfileScreen();
          var focused = document.getElementById('cpTabBtn-' + targetTab);
          if (focused) focused.focus();
        }
      };
    });

    root.querySelectorAll('[data-cp-switch-tab]').forEach(function (btn) {
      btn.onclick = function () {
        uiState.statusBanner = null;
        uiState.activeTab = btn.dataset.cpSwitchTab;
        renderProfileScreen();
      };
    });

    // Reuse existing screens for "View all" navigation without duplicating editors
    root.querySelectorAll('[data-cp-jump]').forEach(function (btn) {
      btn.onclick = async function () {
        var target = btn.dataset.cpJump;
        if (target === 'journal' && typeof openLocalGuides === 'function') {
          await openLocalGuides('passport');
        } else if (target === 'photos' && typeof openLocalGuides === 'function') {
          await openLocalGuides('photos');
        } else if (target === 'favorites' && typeof showScreen === 'function') {
          showScreen('favorites');
        } else if (target === 'trails' && typeof openSmart === 'function') {
          await openSmart('trail');
          var sec = document.getElementById('mySavedTrailsSection');
          if (sec && typeof sec.scrollIntoView === 'function') {
            sec.scrollIntoView({ block: 'start' });
          }
        }
      };
    });

    root.querySelectorAll('[data-cp-open-spot]').forEach(function (btn) {
      btn.onclick = function () {
        var spotId = btn.dataset.cpOpenSpot;
        if (spotId && typeof openDetail === 'function') {
          openDetail(spotId, btn);
        }
      };
    });

    // Overview profile save form
    var overviewForm = root.querySelector('#cpOverviewForm');
    if (overviewForm) {
      overviewForm.onsubmit = async function (ev) {
        ev.preventDefault();
        var saveBtn = root.querySelector('#cpOverviewSaveBtn');
        if (saveBtn) saveBtn.disabled = true;
        try {
          var nameVal = (root.querySelector('#cpDisplayNameInput') || {}).value || '';
          var townVal = (root.querySelector('#cpOverviewTownSelect') || {}).value || '';
          var bioVal = (root.querySelector('#cpBioInput') || {}).value || '';
          var checkedAvatar = root.querySelector('input[name="cpAvatarStyle"]:checked');
          var avatarVal = checkedAvatar ? checkedAvatar.value : 'initials_fern';
          var rev = uiState.data && uiState.data.profile ? uiState.data.profile.revision : undefined;

          var updated = await window.bitesharkProfile.updateProfile({
            display_name: nameVal,
            preferred_town: townVal || null,
            bio: bioVal,
            avatar_style: avatarVal,
            expected_revision: rev
          });
          uiState.data = updated;
          uiState.statusBanner = { text: 'Saved your private profile details.', isError: false };
          renderProfileScreen();
          announcePolite('Saved profile details.');
        } catch (err) {
          if (err && err.status === 401) {
            uiState.loadError = err;
            renderProfileScreen();
            return;
          }
          showInlineMessage('cpOverviewFormMsg', err.message || 'Could not save profile changes.', true);
          if (saveBtn) saveBtn.disabled = false;
        }
      };
    }

    // Preferences save form
    var prefsForm = root.querySelector('#cpPreferencesForm');
    if (prefsForm) {
      prefsForm.onsubmit = async function (ev) {
        ev.preventDefault();
        var saveBtn = root.querySelector('#cpPrefsSaveBtn');
        if (saveBtn) saveBtn.disabled = true;
        try {
          var townVal = (root.querySelector('#cpPrefTownSelect') || {}).value || '';
          var interests = Array.prototype.slice
            .call(root.querySelectorAll('input[name="cpFoodInterest"]:checked'))
            .map(function (el) { return el.value; });
          var commEl = root.querySelector('#cpCommOptInCheck');
          var nearbyToggleEl = root.querySelector('#cpNearbyEnabledCheck');
          var nearbyRadiusEl = root.querySelector('#cpNearbyRadiusSelect');
          var rev = uiState.data && uiState.data.profile ? uiState.data.profile.revision : undefined;

          var payload = {
            preferred_town: townVal || null,
            food_interests: interests,
            communication_product_updates_opt_in: Boolean(commEl && commEl.checked),
            expected_revision: rev
          };
          if (nearbyToggleEl && nearbyRadiusEl && !nearbyToggleEl.disabled) {
            payload.nearby_alerts = {
              nearby_enabled: Boolean(nearbyToggleEl.checked),
              radius_miles: Number(nearbyRadiusEl.value || 3)
            };
          }

          var updated = await window.bitesharkProfile.updatePreferences(payload);
          uiState.data = updated;
          if (updated.preferences && updated.preferences.nearby_alerts) {
            syncNearbyPrefsToLegacyAppGlobals(updated.preferences.nearby_alerts);
          }
          uiState.statusBanner = { text: 'Saved your account preferences.', isError: false };
          renderProfileScreen();
          announcePolite('Saved account preferences.');
        } catch (err) {
          if (err && err.status === 401) {
            uiState.loadError = err;
            renderProfileScreen();
            return;
          }
          showInlineMessage('cpPrefsFormMsg', err.message || 'Could not save preferences.', true);
          if (saveBtn) saveBtn.disabled = false;
        }
      };
    }

    // Privacy & tools actions
    var dlBtn = root.querySelector('#cpDownloadFullArchiveBtn');
    if (dlBtn) {
      dlBtn.onclick = async function () {
        dlBtn.disabled = true;
        try {
          var archive = await window.bitesharkProfile.exportPrivacyArchive();
          var blob = new Blob([JSON.stringify(archive, null, 2)], { type: 'application/json' });
          var dlUrl = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = dlUrl;
          a.download = 'biteshark-account-data-' + new Date().toISOString().slice(0, 10) + '.json';
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(function () { URL.revokeObjectURL(dlUrl); }, 2000);
          showInlineMessage('cpPrivacyActionMsg', 'Downloaded your BiteShark JSON data archive.', false);
        } catch (err) {
          showInlineMessage('cpPrivacyActionMsg', err.message || 'Could not export archive right now.', true);
        } finally {
          dlBtn.disabled = false;
        }
      };
    }

    var openPhotosExportBtn = root.querySelector('#cpOpenPhotosExportModalBtn');
    if (openPhotosExportBtn) {
      openPhotosExportBtn.onclick = function () {
        if (typeof window.openExplorationPrivacyModal === 'function') {
          window.openExplorationPrivacyModal(openPhotosExportBtn);
        }
      };
    }

    var openSupportPrivacyBtn = root.querySelector('#cpOpenSupportPrivacyBtn');
    if (openSupportPrivacyBtn) {
      openSupportPrivacyBtn.onclick = function () {
        if (typeof window.bitesharkOpenSupport === 'function') {
          window.bitesharkOpenSupport({ tab: 'new', category: 'account_access' });
        }
      };
    }

    root.querySelectorAll('[data-cp-revoke-share]').forEach(function (btn) {
      btn.onclick = async function () {
        var shareId = btn.dataset.cpRevokeShare;
        btn.disabled = true;
        try {
          await window.bitesharkProfile.revokeShare(shareId, 'Revoked from Privacy & tools');
          uiState.statusBanner = { text: 'Unlisted share link revoked immediately.', isError: false };
          await loadAndRenderProfile({ force: true });
        } catch (err) {
          showInlineMessage('cpPrivacyActionMsg', err.message || 'Could not revoke link right now.', true);
          btn.disabled = false;
        }
      };
    });

    var clearBtn = root.querySelector('#cpExecuteClearDataBtn');
    if (clearBtn) {
      clearBtn.onclick = async function () {
        var confirmChk = root.querySelector('#cpConfirmClearDataCheck');
        var includeExpChk = root.querySelector('#cpClearIncludeExplorationCheck');
        if (!confirmChk || !confirmChk.checked) {
          showInlineMessage('cpPrivacyActionMsg', 'Check the confirmation box before deleting your saved profile and collection data.', true);
          return;
        }
        clearBtn.disabled = true;
        try {
          var includeExp = Boolean(includeExpChk && includeExpChk.checked);
          var out = await window.bitesharkProfile.deleteProfileAndCollectionsData({
            confirm_delete: true,
            include_exploration_data: includeExp
          });
          if (includeExp && window.bitesharkExploration) {
            window.bitesharkExploration.clearMemoryCache({ preserveUserId: true });
          }
          uiState.statusBanner = {
            text:
              'Cleared optional profile data (' +
              Number(out.deleted_collections_count || 0) +
              ' collections removed, ' +
              Number(out.revoked_shares_count || 0) +
              ' share links revoked). Your core login account remains active.',
            isError: false
          };
          await loadAndRenderProfile({ force: true });
        } catch (err) {
          showInlineMessage('cpPrivacyActionMsg', err.message || 'Could not delete data right now.', true);
          clearBtn.disabled = false;
        }
      };
    }
  }

  function openCustomerProfile(tabKey) {
    if (tabKey && PROFILE_TABS.some(function (t) { return t.key === tabKey; })) {
      uiState.activeTab = tabKey;
    }
    if (typeof closeModal === 'function') {
      try { closeModal(); } catch (_e) {}
    }
    if (typeof showScreen === 'function') {
      showScreen('profile');
    }
    return loadAndRenderProfile({ force: true, tab: uiState.activeTab });
  }

  function registerCollectionsRenderer(fn) {
    uiState.collectionsHookRenderer = fn;
  }

  function handleProfileRoutes() {
    var h = String(window.location.hash || '').toLowerCase();
    var p = String(window.location.pathname || '').toLowerCase();
    var map = {
      '#profile': 'overview',
      '#my-biteshark': 'overview',
      '#profile-activity': 'activity',
      '#profile-progress': 'progress',
      '#profile-collections': 'collections',
      '#greatest-hits': 'collections',
      '#profile-preferences': 'preferences',
      '#profile-privacy': 'privacy'
    };
    if (map[h]) {
      openCustomerProfile(map[h]);
    } else if (p === '/profile' || p === '/profile/') {
      openCustomerProfile('overview');
    }
  }

  if (typeof window !== 'undefined') {
    window.openCustomerProfile = openCustomerProfile;
    window.bitesharkOpenCustomerProfile = openCustomerProfile;
    window.bitesharkResetProfileUiOnAuthChange = resetProfileUiState;
    window.bitesharkRegisterCollectionsRenderer = registerCollectionsRenderer;
    window.addEventListener('hashchange', handleProfileRoutes);
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        setTimeout(handleProfileRoutes, 40);
      });
    } else {
      setTimeout(handleProfileRoutes, 40);
    }
  }
})();
