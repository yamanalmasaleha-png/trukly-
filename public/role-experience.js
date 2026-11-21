/* BiteShark Role Experience, Viewpoint Switcher, Self-Service Onboarding, Issues & Invitations
 *
 * Integrates Customer, Vendor Staff, Vendor Owner, Admin: Mod, and Admin: Top experiences
 * into the main BiteShark application while keeping all authorization strictly server-enforced.
 */
(function () {
  'use strict';

  var VIEWPOINT_STORAGE_KEY = 'biteshark_admin_viewpoint_v1';
  var FEATURE_BROADCAST_CHANNEL = 'biteshark_feature_controls_v1';
  var PENDING_INVITE_STORAGE_KEY = 'biteshark_pending_invite_v1';
  var SUPPORT_DRAFT_STORAGE_KEY = 'bs_support_draft_v1';

  function savePendingInviteToken(token) {
    if (!token) return;
    try { sessionStorage.setItem(PENDING_INVITE_STORAGE_KEY, String(token)); } catch (_e) {}
  }

  function readPendingInviteToken() {
    try { return String(sessionStorage.getItem(PENDING_INVITE_STORAGE_KEY) || '').trim(); } catch (_e) { return ''; }
  }

  function clearPendingInviteToken() {
    try { sessionStorage.removeItem(PENDING_INVITE_STORAGE_KEY); } catch (_e) {}
  }

  function saveSupportDraft(draftObj) {
    try {
      if (!draftObj) {
        sessionStorage.removeItem(SUPPORT_DRAFT_STORAGE_KEY);
        return;
      }
      sessionStorage.setItem(SUPPORT_DRAFT_STORAGE_KEY, JSON.stringify(draftObj));
    } catch (_e) {}
  }

  function readSupportDraft() {
    try {
      var raw = sessionStorage.getItem(SUPPORT_DRAFT_STORAGE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_e) {
      return null;
    }
  }

  function clearSupportDraft() {
    try { sessionStorage.removeItem(SUPPORT_DRAFT_STORAGE_KEY); } catch (_e) {}
  }

  var rxState = {
    ctx: null,
    viewpoint: null, // { mode: 'customer_preview' | 'vendor_preview' | 'act_on_behalf', vendorId?, reason?, readOnly }
    myApps: [],
    myIssues: [],
    selectedIssueId: null,
    unreadSupportCount: 0,
    supportReporterMode: 'customer', // 'vendor' | 'customer'
    supportCustomerKind: 'problem', // 'problem' | 'question' | 'suggestion'
    supportContextPrefill: null,
    features: {},
    mapConfig: null,
    featuresLoaded: false,
    featuresTrusted: true,
    featuresPollSeconds: 60
  };

  var resolveInitialFeatures = null;
  var initialFeaturesReadyPromise = new Promise(function (resolve) {
    resolveInitialFeatures = resolve;
  });

  function rxEsc(val) {
    return String(val == null ? '' : val).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function rxDate(val) {
    if (!val) return '—';
    var d = new Date(val);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // =========================================================================
  // 1. Viewpoint State & Same-Origin Fetch Header Interceptor
  // =========================================================================
  function readInitialViewpoint() {
    var params = new URLSearchParams(window.location.search || '');
    var urlVp = params.get('viewpoint');
    var urlVendor = params.get('vendor_id') || '';

    var stored = null;
    try {
      var raw = sessionStorage.getItem(VIEWPOINT_STORAGE_KEY);
      if (raw) stored = JSON.parse(raw);
    } catch (_e) {}

    if (urlVp === 'customer') {
      stored = { mode: 'customer_preview', readOnly: true };
      try { sessionStorage.setItem(VIEWPOINT_STORAGE_KEY, JSON.stringify(stored)); } catch (_e) {}
    } else if (urlVp === 'vendor' && urlVendor) {
      stored = { mode: 'vendor_preview', vendorId: urlVendor, readOnly: true };
      try { sessionStorage.setItem(VIEWPOINT_STORAGE_KEY, JSON.stringify(stored)); } catch (_e) {}
    } else if (urlVp === 'act' && urlVendor && stored && stored.mode === 'act_on_behalf' && stored.vendorId === urlVendor) {
      // Keep explicit reason from Admin Portal sessionStorage
    } else if (urlVp === 'clear') {
      stored = null;
      try { sessionStorage.removeItem(VIEWPOINT_STORAGE_KEY); } catch (_e) {}
    }
    rxState.viewpoint = stored;
  }

  readInitialViewpoint();

  var nativeFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    var vp = rxState.viewpoint;
    var urlStr = typeof input === 'string' ? input : input && input.url ? input.url : '';
    var isSameOriginApi = false;
    var apiPathname = '';
    try {
      var parsed = new URL(urlStr, window.location.origin);
      isSameOriginApi = parsed.origin === window.location.origin && parsed.pathname.indexOf('/api/') === 0;
      apiPathname = parsed.pathname;
    } catch (_e) {}

    var fetchPromise;
    if (!vp || !isSameOriginApi || apiPathname === '/api/auth/logout') {
      fetchPromise = nativeFetch(input, init);
    } else {
      var nextInit = Object.assign({}, init || {});
      var headers = new Headers(nextInit.headers || (typeof input !== 'string' && input && input.headers ? input.headers : undefined));

      if (vp.mode === 'customer_preview' || vp.mode === 'vendor_preview' || vp.readOnly) {
        headers.set('X-BiteShark-Viewpoint', 'preview');
      } else if (vp.mode === 'act_on_behalf' && vp.vendorId && vp.reason) {
        var method = String(nextInit.method || (typeof input !== 'string' && input && input.method) || 'GET').toUpperCase();
        if (['POST', 'PUT', 'PATCH', 'DELETE'].indexOf(method) >= 0) {
          headers.set('X-BiteShark-Act-On-Behalf', vp.vendorId);
          headers.set('X-BiteShark-Support-Reason', vp.reason);
        }
      }
      nextInit.headers = headers;
      fetchPromise = nativeFetch(input, nextInit);
    }

    if (isSameOriginApi && apiPathname !== '/api/features') {
      fetchPromise
        .then(function (res) {
          if (res && (res.status === 403 || res.status === 503) && typeof res.clone === 'function') {
            res
              .clone()
              .json()
              .then(function (data) {
                if (
                  data &&
                  (data.code === 'FEATURE_PAUSED' ||
                    data.code === 'FEATURE_DISABLED' ||
                    data.code === 'FEATURE_CONFIG_UNAVAILABLE')
                ) {
                  refreshFeatureControls({ reason: 'api_rejection' });
                }
              })
              .catch(function () {});
          }
        })
        .catch(function () {});
    }

    return fetchPromise;
  };

  function rxDiag() {
    return typeof window !== 'undefined' && window.bitesharkDiagnostics ? window.bitesharkDiagnostics : null;
  }

  function rxOpenModal(modalId, opts) {
    var el = document.getElementById(modalId);
    if (!el) return;
    el.hidden = false;
    var d = rxDiag();
    if (d && typeof d.openModalDialog === 'function') {
      d.openModalDialog(el, Object.assign({
        onClose: function () { rxCloseModal(modalId); }
      }, opts || {}));
    }
  }

  function rxCloseModal(modalId) {
    var el = document.getElementById(modalId);
    if (!el) return;
    el.hidden = true;
    var d = rxDiag();
    if (d && typeof d.closeModalDialog === 'function') {
      d.closeModalDialog(el);
    }
  }

  async function rxJson(url, opts) {
    var options = Object.assign({ method: 'GET', credentials: 'same-origin', cache: 'no-store', headers: {} }, opts || {});
    var method = String(options.method || 'GET').toUpperCase();
    var isWrite = method !== 'GET' && method !== 'HEAD';
    var d = rxDiag();
    if (d && typeof d.fetchJsonBounded === 'function') {
      var res = await d.fetchJsonBounded(url, {
        method: method,
        isWrite: isWrite,
        idempotentWrite: Boolean(options.idempotentWrite),
        credentials: options.credentials || 'same-origin',
        cache: options.cache || 'no-store',
        headers: options.headers || {},
        body: options.body,
        featureKey: options.featureKey || undefined,
        operationName: options.operationName || undefined
      });
      if (!res.ok) {
        var msg = (res.data && res.data.error) || res.errorMessage || ('Request failed (' + (res.status || 'network') + ')');
        if (res.correlationId) {
          msg += ' (Support ref: ' + res.correlationId + ')';
        }
        var errBounded = new Error(msg);
        errBounded.status = res.status;
        errBounded.code = (res.data && res.data.code) || null;
        errBounded.correlationId = res.correlationId || null;
        errBounded.uncertainWrite = Boolean(res.uncertainWrite || res.timedOut);
        throw errBounded;
      }
      return res.data;
    }

    if (options.body && typeof options.body === 'object') {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }
    var rawRes = await window.fetch(url, options);
    var data = await rawRes.json().catch(function () { return {}; });
    if (!rawRes.ok) {
      var err = new Error(data.error || 'Request failed (' + rawRes.status + ')');
      err.status = rawRes.status;
      err.code = data.code || null;
      throw err;
    }
    return data;
  }

  function clearViewpointAndReturn(toAdmin) {
    rxState.viewpoint = null;
    try { sessionStorage.removeItem(VIEWPOINT_STORAGE_KEY); } catch (_e) {}
    if (toAdmin) {
      window.location.href = '/admin';
    } else {
      window.location.href = '/';
    }
  }

  // =========================================================================
  // 2. Viewpoint Banner & Read-Only / Act-on-Behalf Owner View Sync
  // =========================================================================
  async function applyActiveViewpointExperience() {
    var existing = document.getElementById('bitesharkViewpointBanner');
    if (existing) existing.remove();

    var vp = rxState.viewpoint;
    var ctx = rxState.ctx;
    if (!vp) return;

    // Non-admins never retain admin viewpoint state
    if (!ctx || !ctx.authenticated || !ctx.capabilities || !ctx.capabilities.can_access_admin_portal) {
      rxState.viewpoint = null;
      try { sessionStorage.removeItem(VIEWPOINT_STORAGE_KEY); } catch (_e) {}
      return;
    }

    if (vp.mode === 'act_on_behalf' && ctx.admin_level !== 'top') {
      // Downgrade safely to read-only preview if non-Top
      vp.mode = 'vendor_preview';
      vp.readOnly = true;
    }

    var banner = document.createElement('div');
    banner.id = 'bitesharkViewpointBanner';
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-label', 'Administrator viewpoint banner');
    banner.className = 'biteshark-viewpoint-banner' + (vp.mode === 'act_on_behalf' ? ' is-act-on-behalf' : '');

    var adminIdent = rxEsc(ctx.user.email) + ' (' + rxEsc(ctx.admin_label || 'Administrator') + ')';

    if (vp.mode === 'customer_preview') {
      banner.innerHTML =
        '<div><strong>🔍 Admin preview · Customer View (Read-Only)</strong> — Signed in as ' +
        adminIdent +
        '. Bookings, community posts, and mutations are blocked in preview.</div>' +
        '<div class="vp-banner-actions">' +
        '<a class="vp-banner-btn" href="/admin">← Return to Admin Portal</a>' +
        '<button type="button" class="vp-banner-btn secondary" id="vpExitBtn">Exit Preview</button>' +
        '</div>';
      document.body.insertBefore(banner, document.body.firstChild);
      document.getElementById('vpExitBtn').onclick = function () { clearViewpointAndReturn(false); };
      if (typeof showScreen === 'function') showScreen('discover');
    } else if (vp.mode === 'vendor_preview' && vp.vendorId) {
      banner.innerHTML =
        '<div><strong>🔍 Admin preview · Vendor View (Read-Only)</strong> — Signed in as ' +
        adminIdent +
        ' · Inspecting vendor <code>' +
        rxEsc(vp.vendorId) +
        '</code>. Operational edits, pagers, and publishing are disabled.</div>' +
        '<div class="vp-banner-actions">' +
        '<a class="vp-banner-btn" href="/admin">← Return to Admin Portal</a>' +
        '<button type="button" class="vp-banner-btn secondary" id="vpExitBtn">Exit Preview</button>' +
        '</div>';
      document.body.insertBefore(banner, document.body.firstChild);
      document.getElementById('vpExitBtn').onclick = function () { clearViewpointAndReturn(false); };
      await hydrateReadOnlyVendorPreview(vp.vendorId);
    } else if (vp.mode === 'act_on_behalf' && vp.vendorId) {
      banner.innerHTML =
        '<div><strong>🔧 ACTING ON BEHALF OF VENDOR <code>' +
        rxEsc(vp.vendorId) +
        '</code> (AUDITED)</strong> — ' +
        adminIdent +
        ' · Support reason: <em>"' +
        rxEsc(vp.reason) +
        '"</em></div>' +
        '<div class="vp-banner-actions">' +
        '<button type="button" class="vp-banner-btn" id="vpEndSupportBtn">End Support Session &amp; Return to Admin Portal →</button>' +
        '</div>';
      document.body.insertBefore(banner, document.body.firstChild);
      document.getElementById('vpEndSupportBtn').onclick = function () { clearViewpointAndReturn(true); };
      if (typeof showScreen === 'function') showScreen('owner');
      if (typeof selectOwnerTruck === 'function') {
        await selectOwnerTruck(vp.vendorId);
      }
    }
  }

  async function hydrateReadOnlyVendorPreview(vendorId) {
    try {
      var data = await rxJson('/api/admin/vendor-preview?vendor_id=' + encodeURIComponent(vendorId));
      var v = data.vendor || {};
      if (typeof showScreen === 'function') showScreen('owner');

      var titleEl = document.getElementById('ownerTitle');
      var subEl = document.getElementById('ownerSubtitle');
      var pillEl = document.getElementById('ownerStatusPill');
      var selEl = document.getElementById('ownerTruckSelect');
      var modeBanner = document.getElementById('ownerModeBanner');

      if (titleEl) titleEl.textContent = v.display_name || vendorId;
      if (subEl) subEl.textContent = v.summary || 'Read-only administrator vendor preview.';
      if (pillEl) pillEl.textContent = v.accepting_bookings ? '● Accepting bookings (Preview)' : '○ Bookings paused (Preview)';
      if (selEl) {
        selEl.innerHTML = '<option value="' + rxEsc(v.id) + '">' + rxEsc(v.display_name || v.id) + ' (Read-Only Preview)</option>';
        selEl.disabled = true;
      }
      if (modeBanner) {
        modeBanner.hidden = false;
        modeBanner.innerHTML =
          '<span><b>Admin preview (read-only)</b> — Viewing <strong>' +
          rxEsc(v.display_name || v.id) +
          '</strong> (' +
          Number((data.customer_impact && data.customer_impact.open_bookings) || 0) +
          ' open bookings · ' +
          Number((data.customer_impact && data.customer_impact.active_pagers) || 0) +
          ' active pagers).</span><a href="/admin">Back to Admin Portal →</a>';
      }

      var totalEl = document.getElementById('statTotalRequests');
      var pendingEl = document.getElementById('statPendingRequests');
      if (totalEl) totalEl.textContent = String((data.customer_impact && data.customer_impact.open_bookings) || 0);
      if (pendingEl) pendingEl.textContent = String((data.customer_impact && data.customer_impact.open_bookings) || 0);

      // Disable all mutating controls on #ownerScreen during read-only preview
      document
        .querySelectorAll(
          '#ownerScreen button.primary, #ownerScreen button.secondary, #ownerScreen #ownerEditProfileBtn, #ownerScreen #pagerCreateButton, #ownerScreen input:not([readonly]), #ownerScreen select:not(#ownerTruckSelect), #ownerRequests button'
        )
        .forEach(function (b) {
          b.disabled = true;
          b.title = 'Disabled in read-only Admin Preview';
        });
    } catch (previewErr) {
      var modeBannerErr = document.getElementById('ownerModeBanner');
      if (modeBannerErr) {
        modeBannerErr.hidden = false;
        modeBannerErr.textContent = '⚠ Read-only vendor preview could not be loaded: ' + (previewErr.message || 'Temporarily unavailable.');
      }
    }
  }

  // =========================================================================
  // 3. Profile Menu, Role Labels & Owner Hub Enhancements
  // =========================================================================
  function injectRoleNavigationAndModals() {
    var dropdown = document.querySelector('#profileMenu .profile-dropdown');
    if (dropdown && !document.getElementById('rxProfileRoleBox')) {
      var roleBox = document.createElement('div');
      roleBox.id = 'rxProfileRoleBox';
      roleBox.className = 'profile-role-pills';
      roleBox.hidden = true;
      var sub = document.getElementById('profileSub');
      if (sub && sub.parentNode) sub.parentNode.insertBefore(roleBox, sub.nextSibling);

      var signOutBtn = document.getElementById('authSignOutBtn');
      var adminLink = document.createElement('a');
      adminLink.id = 'navAdminPortalLink';
      adminLink.className = 'profile-admin-entry';
      adminLink.href = '/admin';
      adminLink.hidden = true;
      adminLink.innerHTML = '<span>🛡️ Admin Portal</span><span>→</span>';

      var vendorHubBtn = document.createElement('button');
      vendorHubBtn.type = 'button';
      vendorHubBtn.id = 'rxVendorHubBtn';
      vendorHubBtn.hidden = true;
      vendorHubBtn.textContent = '🚚 Vendor operations hub';
      vendorHubBtn.onclick = function () {
        document.getElementById('profileMenu').open = false;
        if (typeof showScreen === 'function') showScreen('owner');
      };

      var applyVendorBtn = document.createElement('button');
      applyVendorBtn.type = 'button';
      applyVendorBtn.id = 'rxVendorApplyBtn';
      applyVendorBtn.textContent = '🏪 Claim or apply as vendor';
      applyVendorBtn.onclick = function () {
        document.getElementById('profileMenu').open = false;
        openVendorApplyModal();
      };

      var supportBtn = document.createElement('button');
      supportBtn.type = 'button';
      supportBtn.id = 'rxSupportIssuesBtn';
      supportBtn.innerHTML = '<span>🛟 Help &amp; feedback</span><span id="rxSupportUnreadBadge" class="rx-unread-badge" hidden>0</span>';
      supportBtn.onclick = function () {
        document.getElementById('profileMenu').open = false;
        openSupportIssuesModal();
      };

      var policiesLink = document.createElement('a');
      policiesLink.id = 'rxPolicyDraftsLink';
      policiesLink.href = '/policies/index.html';
      policiesLink.style.cssText = 'display:block;padding:8px 10px;border-radius:10px;text-decoration:none;color:inherit;font-size:14px;font-weight:600';
      policiesLink.textContent = '📄 Policy & legal drafts';

      dropdown.insertBefore(adminLink, signOutBtn);
      dropdown.insertBefore(vendorHubBtn, signOutBtn);
      dropdown.insertBefore(applyVendorBtn, signOutBtn);
      dropdown.insertBefore(supportBtn, signOutBtn);
      dropdown.insertBefore(policiesLink, signOutBtn);
    }

    // Inject Customer Help & Feedback bar at bottom of Discover sheet, Bookings & Favorites
    [
      { hostId: 'truckSheet', barId: 'rxDiscoverHelpBar' },
      { hostId: 'favoritesScreen', barId: 'rxFavoritesHelpBar' },
      { hostId: 'bookingsScreen', barId: 'rxBookingsHelpBar' }
    ].forEach(function (cfg) {
      var host = document.getElementById(cfg.hostId);
      if (host && !document.getElementById(cfg.barId)) {
        var bar = document.createElement('aside');
        bar.id = cfg.barId;
        bar.className = 'rx-discover-help-bar';
        bar.setAttribute('aria-label', 'Help and feedback');
        bar.innerHTML =
          '<span><strong>🛟 Need help or have an idea?</strong> Report a problem, ask a question, or share feedback privately with BiteShark.</span>' +
          '<button type="button" data-rx-open-help="customer">Help &amp; feedback</button>';
        host.appendChild(bar);
        bar.querySelector('[data-rx-open-help]').onclick = function () {
          openSupportIssuesModal({ reporterContext: 'customer' });
        };
      }
    });

    // Inject Owner Hero Support button, Support Card, Team Card & Restriction Notice on #ownerScreen
    var ownerScreen = document.getElementById('ownerScreen');
    var ownerHeroControls = ownerScreen ? ownerScreen.querySelector('.owner-hero-controls') : null;
    if (ownerHeroControls && !document.getElementById('ownerSupportBtn')) {
      var ownerSupBtn = document.createElement('button');
      ownerSupBtn.type = 'button';
      ownerSupBtn.id = 'ownerSupportBtn';
      ownerSupBtn.className = 'owner-support-btn';
      ownerSupBtn.innerHTML = '<span>🛟 Help &amp; feedback</span><span id="ownerSupportUnreadBadge" class="rx-unread-badge" hidden>0</span>';
      ownerSupBtn.onclick = function () {
        openSupportIssuesModal({ reporterContext: 'vendor' });
      };
      ownerHeroControls.appendChild(ownerSupBtn);
    }

    var ownerGrid = ownerScreen ? ownerScreen.querySelector('.owner-grid') : null;
    if (ownerScreen && !document.getElementById('ownerRestrictionNotice')) {
      var rNotice = document.createElement('div');
      rNotice.id = 'ownerRestrictionNotice';
      rNotice.className = 'owner-restriction-alert';
      rNotice.hidden = true;
      var statsBar = ownerScreen.querySelector('.owner-stats');
      if (statsBar) ownerScreen.insertBefore(rNotice, statsBar);
    }
    if (ownerGrid && !document.getElementById('ownerSupportCard')) {
      var supCard = document.createElement('article');
      supCard.id = 'ownerSupportCard';
      supCard.className = 'owner-card requests-card';
      supCard.innerHTML =
        '<div class="card-label">VENDOR HELP &amp; FEEDBACK</div>' +
        '<h2>Need help during service?</h2>' +
        '<p>Report a technical, listing, inquiry, or pickup-pager problem, ask a question, or suggest an improvement. Private tickets stay off public pages.</p>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
        '<button type="button" class="primary" id="ownerReportProblemBtn">Report service problem →</button>' +
        '<button type="button" class="secondary" id="ownerShareFeedbackBtn">Question or suggestion</button>' +
        '<button type="button" class="secondary" id="ownerMyTicketsBtn">My support requests</button>' +
        '</div>';
      ownerGrid.insertBefore(supCard, ownerGrid.firstChild);
      document.getElementById('ownerReportProblemBtn').onclick = function () {
        openSupportIssuesModal({ reporterContext: 'vendor', tab: 'new', category: 'technical_problem' });
      };
      document.getElementById('ownerShareFeedbackBtn').onclick = function () {
        openSupportIssuesModal({ reporterContext: 'vendor', tab: 'new', category: 'suggestion_feedback' });
      };
      document.getElementById('ownerMyTicketsBtn').onclick = function () {
        openSupportIssuesModal({ reporterContext: 'vendor', tab: 'list' });
      };
    }
    if (ownerGrid && !document.getElementById('ownerTeamCard')) {
      var teamCard = document.createElement('article');
      teamCard.id = 'ownerTeamCard';
      teamCard.className = 'owner-card requests-card';
      teamCard.hidden = true;
      teamCard.innerHTML =
        '<div class="card-label">VENDOR TEAM &amp; ACCESS</div>' +
        '<h2>Manage staff memberships</h2>' +
        '<p>Invite trusted kitchen or counter staff via verified email invitation. Only approved Vendor Owners can manage team access.</p>' +
        '<div id="ownerTeamList" class="rx-card" style="margin:8px 0">Loading team…</div>' +
        '<form id="ownerStaffInviteForm" class="rx-form">' +
        '<div class="rx-row-2">' +
        '<label>Staff Email<input type="email" id="ownerStaffEmail" required placeholder="staff@example.org"></label>' +
        '<label>Note<input type="text" id="ownerStaffNote" maxlength="200" placeholder="Weekend pickup window staff"></label>' +
        '</div>' +
        '<button type="submit" class="secondary">Send Vendor Staff Invitation</button>' +
        '</form>' +
        '<div id="ownerStaffInviteResult" class="rx-msg" hidden style="margin-top:8px"></div>';
      ownerGrid.appendChild(teamCard);
      document.getElementById('ownerStaffInviteForm').onsubmit = submitVendorStaffInvite;
    }

    // Inject Modals container
    if (!document.getElementById('rxModalsRoot')) {
      var root = document.createElement('div');
      root.id = 'rxModalsRoot';
      root.innerHTML =
        // 1. Vendor Onboarding Modal
        '<div class="rx-modal-backdrop" id="vendorApplyModal" hidden>' +
        '<div class="rx-modal" role="dialog" aria-modal="true" aria-labelledby="vaModalTitle">' +
        '<div class="rx-modal-head"><div><small>VENDOR ONBOARDING &amp; OWNERSHIP</small><h2 id="vaModalTitle">Claim or Apply for a BiteShark Listing</h2></div><button type="button" class="rx-close" data-rx-close="vendorApplyModal" aria-label="Close vendor application dialog">×</button></div>' +
        '<div class="rx-tabs" role="tablist" aria-label="Vendor application views">' +
        '<button type="button" role="tab" aria-selected="true" class="rx-tab active" data-va-tab="status">My Applications</button>' +
        '<button type="button" role="tab" aria-selected="false" class="rx-tab" data-va-tab="form">New / Edit Application</button>' +
        '</div>' +
        '<div id="vaSubmitNotice" class="rx-msg" role="status" hidden style="margin-bottom:8px"></div>' +
        '<div id="vaStatusPane"></div>' +
        '<form id="vaFormPane" class="rx-form" hidden>' +
        '<input type="hidden" id="vaEditId">' +
        '<div class="rx-row-2">' +
        '<label>Application Type<select id="vaType"><option value="claim_existing">Claim existing curated listing</option><option value="new_listing">Propose new food spot</option></select></label>' +
        '<label id="vaTargetWrap">Curated Listing<select id="vaTargetVendor"><option value="">Select listing…</option></select></label>' +
        '<label id="vaSlugWrap" hidden>Proposed Listing ID (slug)<input type="text" id="vaProposedSlug" maxlength="64" placeholder="e.g. rosa-taco-cart"></label>' +
        '</div>' +
        '<div class="rx-row-2">' +
        '<label>Business Name *<input type="text" id="vaBusinessName" required maxlength="120" placeholder="Official truck or stand name"></label>' +
        '<label>Primary Sonoma Town *<input type="text" id="vaPrimaryTown" required maxlength="80" placeholder="e.g. Santa Rosa"></label>' +
        '</div>' +
        '<div class="rx-row-2">' +
        '<label>Category<input type="text" id="vaCategory" maxlength="60" value="Food Trucks"></label>' +
        '<label>Cuisine<input type="text" id="vaCuisine" maxlength="80" placeholder="e.g. Mexican, Coffee, Burgers"></label>' +
        '</div>' +
        '<div class="rx-row-2">' +
        '<label>Contact Name *<input type="text" id="vaContactName" required maxlength="120" placeholder="Owner / manager name"></label>' +
        '<label>Contact Phone (optional)<input type="text" id="vaContactPhone" maxlength="40" placeholder="(707) 555-0199"></label>' +
        '</div>' +
        '<label>Business Website or Social Link (optional)<input type="url" id="vaWebsite" maxlength="300" placeholder="https://…"></label>' +
        '<label>Public Listing Summary (up to 160 chars)<textarea id="vaSummary" rows="2" maxlength="160" placeholder="Short description of dishes and regular schedule…"></textarea></label>' +
        '<label>Ownership &amp; Permit Verification Statement<textarea id="vaStatement" rows="2" maxlength="1000" placeholder="Describe your business connection (e.g. health permit town, market stall, official website/Instagram)…"></textarea></label>' +
        '<label>Optional Supporting Evidence (PDF, PNG, JPEG, or WebP up to 512 KiB — do NOT upload SSNs or driver licenses)<input type="file" id="vaEvidenceFile" accept="application/pdf,image/png,image/jpeg,image/webp"></label>' +
        '<div id="vaFormMsg" class="rx-msg" role="alert" hidden></div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
        '<button type="submit" class="primary" id="vaSubmitAppBtn" data-va-mode="submit">Submit for Admin Review →</button>' +
        '<button type="button" class="secondary" id="vaSaveDraftBtn">Save Draft</button>' +
        '</div>' +
        '</form>' +
        '</div></div>' +

        // 2. Support & Feedback Modal
        '<div class="rx-modal-backdrop" id="supportIssuesModal" hidden>' +
        '<div class="rx-modal" role="dialog" aria-modal="true" aria-labelledby="siModalTitle">' +
        '<div class="rx-modal-head"><div><small>PRIVATE SUPPORT &amp; FEEDBACK</small><h2 id="siModalTitle">Help &amp; Feedback</h2></div><button type="button" class="rx-close" data-rx-close="supportIssuesModal" aria-label="Close help and feedback dialog">×</button></div>' +
        '<div class="rx-tabs" id="siTabsBar" role="tablist" aria-label="Support and feedback views">' +
        '<button type="button" role="tab" aria-selected="true" class="rx-tab active" data-si-tab="list">My support requests <span id="siTabUnreadBadge" class="rx-unread-badge" hidden>0</span></button>' +
        '<button type="button" role="tab" aria-selected="false" class="rx-tab" data-si-tab="new">New request / feedback</button>' +
        '</div>' +
        '<div id="siAckBanner" role="status" hidden></div>' +
        '<div id="siSubmitNotice" class="rx-msg" role="status" hidden style="margin-bottom:8px"></div>' +
        '<div id="siGuestPane" hidden></div>' +
        '<div id="siListPane"></div>' +
        '<form id="siNewPane" class="rx-form" hidden novalidate>' +
        '<div id="siModeSwitchWrap" hidden>' +
        '<span style="display:block;font-size:12px;font-weight:700;color:#3d4a44;margin-bottom:4px">Submitting as</span>' +
        '<div class="si-mode-switch" role="group" aria-label="Choose vendor or customer support context">' +
        '<button type="button" class="si-pill-btn" data-si-mode="vendor" aria-pressed="false">🚚 Vendor support</button>' +
        '<button type="button" class="si-pill-btn active" data-si-mode="customer" aria-pressed="true">🙋 Customer / general</button>' +
        '</div>' +
        '</div>' +
        '<div id="siCustomerKindWrap">' +
        '<span style="display:block;font-size:12px;font-weight:700;color:#3d4a44;margin-bottom:4px">What would you like to send? *</span>' +
        '<div class="si-kind-pills" role="group" aria-label="Choose problem, question, or suggestion">' +
        '<button type="button" class="si-pill-btn active" data-si-kind="problem" aria-pressed="true">⚠️ Report a problem</button>' +
        '<button type="button" class="si-pill-btn" data-si-kind="question" aria-pressed="false">❓ Ask a question</button>' +
        '<button type="button" class="si-pill-btn" data-si-kind="suggestion" aria-pressed="false">💡 Share a suggestion</button>' +
        '</div>' +
        '</div>' +
        '<div class="rx-row-2">' +
        '<label id="siCategoryWrap"><span id="siCategoryLabel">Topic *</span><select id="siCategory">' +
        '<option value="technical_problem">Technical / App Problem</option>' +
        '<option value="listing_hours_location">Listing, Hours, or Location</option>' +
        '<option value="event_inquiries">Event Inquiries / Bookings</option>' +
        '<option value="pager_notifications">Pickup Pager / Notifications</option>' +
        '<option value="account_access">Account, Login, or Invitation</option>' +
        '<option value="question_help">Question / How Something Works</option>' +
        '<option value="suggestion_feedback">Suggestion / Product Feedback</option>' +
        '<option value="booking_issue">Booking Issue</option>' +
        '<option value="pager_issue">Pickup Pager Issue</option>' +
        '<option value="listing_accuracy">Listing Accuracy</option>' +
        '<option value="vendor_dispute">Vendor Dispute</option>' +
        '<option value="safety_concern">Safety Concern</option>' +
        '<option value="abuse_report">Abuse Report</option>' +
        '<option value="other">Other</option>' +
        '</select></label>' +
        '<label id="siVendorWrap"><span id="siVendorLabel">Related Food Spot (optional)</span><select id="siVendorId"><option value="">None / General</option></select></label>' +
        '</div>' +
        '<label id="siSubjectWrap"><span id="siSubjectLabel">Short title (optional — or auto-filled)</span><input type="text" id="siSubject" maxlength="140" placeholder="Brief summary of what happened or your idea"></label>' +
        '<label><span id="siDescriptionLabel">What happened or how can we help? (15–1500 chars) *</span><textarea id="siDescription" required minlength="15" maxlength="1500" rows="4" placeholder="Describe what happened, what you expected, or what would improve BiteShark."></textarea></label>' +
        '<div class="rx-row-2" id="siUrgencyScopeRow">' +
        '<label id="siUrgencyWrap">Impact / Urgency<select id="siReporterUrgency">' +
        '<option value="normal" selected>Normal — Standard support request</option>' +
        '<option value="critical">Critical — Blocking active food service right now</option>' +
        '<option value="high">High — Important operational or account issue</option>' +
        '<option value="low">Low — Minor issue or question</option>' +
        '<option value="feedback">Feedback — Non-urgent suggestion</option>' +
        '</select></label>' +
        '<label id="siSharingScopeWrap" hidden>Ticket Visibility<select id="siSharingScope">' +
        '<option value="personal">Personal — Only me &amp; BiteShark support</option>' +
        '<option value="vendor_service">Shared vendor service — Co-owners &amp; staff of this vendor</option>' +
        '</select></label>' +
        '</div>' +
        '<div id="siCriticalNotice" class="si-safety-note is-critical" role="note" hidden>' +
        '<strong>Critical impact note:</strong> Your request will be highlighted at the top of the BiteShark support queue, and an operator alert is triggered when email delivery is configured. BiteShark support is reviewed asynchronously and is <strong>not</strong> a 24/7 live dispatch or emergency service.' +
        '</div>' +
        '<details id="siExtraDetailsBox" style="border:1px solid #e2dac8;border-radius:10px;padding:8px 11px;background:#fcfaf4">' +
        '<summary style="cursor:pointer;font-size:12.5px;font-weight:700;color:#2f3b35">Optional details (affected feature &amp; approximate time)</summary>' +
        '<div class="rx-row-2" style="margin-top:8px">' +
        '<label>Affected Area (optional)<select id="siAffectedFeature">' +
        '<option value="">Not specified</option>' +
        '<option value="discovery">Discovery &amp; Search</option>' +
        '<option value="interactive_map">Interactive Map</option>' +
        '<option value="bookings">Event Bookings / Inquiries</option>' +
        '<option value="pickup_pager">Pickup Pager</option>' +
        '<option value="vendor_publishing">Vendor Profile, Hours &amp; Live Location</option>' +
        '<option value="community">Local Community</option>' +
        '<option value="auth">Sign-In &amp; Verification</option>' +
        '<option value="invitations">Invitations &amp; Team Access</option>' +
        '<option value="onboarding_uploads">Vendor Claim / Onboarding</option>' +
        '<option value="other">Other</option>' +
        '</select></label>' +
        '<label>When did this happen? (optional)<input type="datetime-local" id="siOccurredAt"></label>' +
        '</div>' +
        '</details>' +
        '<div id="siContextReviewBox" class="si-context-box">' +
        '<label class="si-inline-check"><input type="checkbox" id="siAttachTechContext" checked><span>Include safe technical context to help troubleshoot (<span id="siContextSummaryText">app build &amp; coarse device type</span>)</span></label>' +
        '</div>' +
        '<div class="si-safety-note" id="siPrivacySafetyNote">' +
        '🔒 <strong>Private &amp; safe:</strong> Tickets are never posted publicly. Do <strong>not</strong> enter passwords, 6-digit login codes, payment card numbers, birth dates, or private customer data. Support replies appear in your BiteShark account (not 24/7 live chat; image attachments are not included yet).' +
        '</div>' +
        '<div id="siFormMsg" class="rx-msg" role="alert" hidden></div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">' +
        '<button type="submit" class="primary" id="siSubmitIssueBtn">Submit Support Request →</button>' +
        '<button type="button" class="secondary" id="siClearDraftBtn" hidden>Clear saved draft</button>' +
        '</div>' +
        '</form>' +
        '</div></div>' +

        // 3. Community Post Report Modal
        '<div class="rx-modal-backdrop" id="communityReportModal" hidden>' +
        '<div class="rx-modal" role="dialog" aria-modal="true" aria-labelledby="crModalTitle">' +
        '<div class="rx-modal-head"><div><small>COMMUNITY MODERATION</small><h2 id="crModalTitle">Report Community Post</h2></div><button type="button" class="rx-close" data-rx-close="communityReportModal" aria-label="Close report dialog">×</button></div>' +
        '<form id="crReportForm" class="rx-form">' +
        '<input type="hidden" id="crPostId">' +
        '<label>Reason<select id="crReason" required><option value="inaccurate">Inaccurate or misleading</option><option value="spam">Promotional spam</option><option value="harassment">Harassment or personal attack</option><option value="privacy">Private/personal info shared</option><option value="off_topic">Off-topic</option><option value="other">Other</option></select></label>' +
        '<label>Additional Context (optional)<textarea id="crDetails" rows="3" maxlength="800" placeholder="Help moderators review this submission…"></textarea></label>' +
        '<div id="crFormMsg" class="rx-msg" role="alert" hidden></div>' +
        '<button type="submit" class="primary" id="crSubmitReportBtn">Submit Report to Moderators →</button>' +
        '</form></div></div>' +

        // 4. Invitation Acceptance Modal
        '<div class="rx-modal-backdrop" id="inviteAcceptModal" hidden>' +
        '<div class="rx-modal" role="dialog" aria-modal="true" aria-labelledby="iaModalTitle">' +
        '<div class="rx-modal-head"><div><small>BITESHARK ACCOUNT INVITATION</small><h2 id="iaModalTitle">Verify &amp; Redeem Invitation</h2></div><button type="button" class="rx-close" data-rx-close="inviteAcceptModal" aria-label="Close invitation dialog">×</button></div>' +
        '<div id="iaBody"></div>' +
        '</div></div>' +

        // 5. Existing-Account One-Time Minimum Age Assessment Modal (14+)
        '<div class="rx-modal-backdrop" id="rxAgeAssessmentModal" hidden>' +
        '<div class="rx-modal" role="dialog" aria-modal="true" aria-labelledby="rxAgeModalTitle">' +
        '<div class="rx-modal-head"><div><small>ONE-TIME ELIGIBILITY CHECK</small><h2 id="rxAgeModalTitle">Confirm Minimum Account Age (14+)</h2></div></div>' +
        '<p style="margin:6px 0 12px;font-size:14px;line-height:1.5">Your pre-existing BiteShark account (<strong id="rxAgeModalEmail"></strong>) has not yet completed the minimum-age check. Under our proposed account policy (pending legal review), users aged 13 and younger cannot hold accounts; minimum account age is <strong>14</strong>.</p>' +
        '<form id="rxAgeModalForm" class="rx-form" novalidate>' +
        '<fieldset style="border:1px solid #dfd6c4;border-radius:12px;padding:10px 12px;margin:0 0 10px" aria-describedby="rxAgeModalPurpose">' +
        '<legend style="font-weight:700;font-size:13.5px;padding:0 5px">Date of birth (required — minimum age 14)</legend>' +
        '<div class="rx-row-2" style="grid-template-columns:1.4fr 0.8fr 1fr;gap:8px">' +
        '<label for="rxAgeMonth">Birth month<select id="rxAgeMonth" required>' +
        '<option value="">Select month…</option>' +
        '<option value="01">01 — January</option><option value="02">02 — February</option><option value="03">03 — March</option>' +
        '<option value="04">04 — April</option><option value="05">05 — May</option><option value="06">06 — June</option>' +
        '<option value="07">07 — July</option><option value="08">08 — August</option><option value="09">09 — September</option>' +
        '<option value="10">10 — October</option><option value="11">11 — November</option><option value="12">12 — December</option>' +
        '</select></label>' +
        '<label for="rxAgeDay">Day<input type="text" id="rxAgeDay" inputmode="numeric" maxlength="2" placeholder="DD" required></label>' +
        '<label for="rxAgeYear">Year<input type="text" id="rxAgeYear" inputmode="numeric" maxlength="4" placeholder="YYYY" required></label>' +
        '</div>' +
        '<p id="rxAgeModalPurpose" style="margin:8px 0 0;font-size:12px;color:#4a544f;line-height:1.45">Evaluated server-side (<code>America/Los_Angeles</code> calendar). Your full birth date is <strong>never stored</strong>; only derived 14+ eligibility, policy version, and timestamp are saved.</p>' +
        '</fieldset>' +
        '<div id="rxAgeModalMsg" class="rx-msg" role="alert" hidden></div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
        '<button type="submit" class="primary" id="rxAgeSubmitBtn">Confirm 14+ Eligibility →</button>' +
        '<button type="button" class="secondary" id="rxAgeSupportBtn">Privacy / Accessibility Help</button>' +
        '<button type="button" class="secondary" id="rxAgeSignOutBtn">Sign Out</button>' +
        '</div>' +
        '</form></div></div>';

      document.body.appendChild(root);

      root.querySelectorAll('[data-rx-close]').forEach(function (btn) {
        btn.onclick = function () {
          rxCloseModal(btn.dataset.rxClose);
        };
      });

      document.addEventListener('keydown', function (ev) {
        if (ev.key !== 'Escape') return;
        if (rxDiag()) return;
        var closeableIds = ['inviteAcceptModal', 'communityReportModal', 'supportIssuesModal', 'vendorApplyModal'];
        for (var i = 0; i < closeableIds.length; i++) {
          var el = document.getElementById(closeableIds[i]);
          if (el && !el.hidden) {
            rxCloseModal(closeableIds[i]);
            ev.preventDefault();
            break;
          }
        }
      });

      root.querySelectorAll('[data-va-tab]').forEach(function (btn) {
        btn.onclick = function () { switchVaTab(btn.dataset.vaTab); };
      });
      document.getElementById('vaType').onchange = function () {
        var isClaim = document.getElementById('vaType').value === 'claim_existing';
        document.getElementById('vaTargetWrap').hidden = !isClaim;
        document.getElementById('vaSlugWrap').hidden = isClaim;
      };
      document.getElementById('vaFormPane').onsubmit = function (e) {
        e.preventDefault();
        saveOrSubmitVendorApp('submit');
      };
      document.getElementById('vaSaveDraftBtn').onclick = function () {
        saveOrSubmitVendorApp('draft');
      };

      root.querySelectorAll('[data-si-tab]').forEach(function (btn) {
        btn.onclick = function () { switchSiTab(btn.dataset.siTab); };
      });
      bindSupportFormProgressiveDisclosure();
      document.getElementById('siNewPane').onsubmit = submitNewSupportIssue;
      document.getElementById('crReportForm').onsubmit = submitCommunityReport;
      document.getElementById('rxAgeModalForm').onsubmit = submitNextSignInAgeAssessment;
      document.getElementById('rxAgeSupportBtn').onclick = function () {
        document.getElementById('rxAgeAssessmentModal').hidden = true;
        openSupportIssuesModal({ tab: 'new', category: 'account_access', reporterContext: 'customer' });
      };
      document.getElementById('rxAgeSignOutBtn').onclick = async function () {
        try {
          if (window.bitesharkAuth && window.bitesharkAuth.signOut) {
            await window.bitesharkAuth.signOut();
          }
        } catch (_e) {}
        window.location.reload();
      };
    }
  }

  async function submitNextSignInAgeAssessment(e) {
    e.preventDefault();
    var msgEl = document.getElementById('rxAgeModalMsg');
    var btn = document.getElementById('rxAgeSubmitBtn');
    var mVal = String(document.getElementById('rxAgeMonth').value || '').trim();
    var dVal = String(document.getElementById('rxAgeDay').value || '').trim();
    var yVal = String(document.getElementById('rxAgeYear').value || '').trim();
    msgEl.hidden = true;

    if (!mVal || !dVal || !yVal) {
      msgEl.hidden = false;
      msgEl.className = 'rx-msg error';
      msgEl.textContent = 'Select your birth month and enter both day and 4-digit birth year.';
      return;
    }

    btn.disabled = true;
    try {
      if (!window.bitesharkAuth || !window.bitesharkAuth.submitAgeAssessment) {
        throw new Error('Authentication client is unavailable.');
      }
      await window.bitesharkAuth.submitAgeAssessment({
        dob_month: mVal,
        dob_day: dVal,
        dob_year: yVal
      });
      ['rxAgeMonth', 'rxAgeDay', 'rxAgeYear'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.value = '';
      });
      document.getElementById('rxAgeAssessmentModal').hidden = true;
      await refreshAccountRoleContext();
      await checkInviteRedemptionHash();
    } catch (err) {
      ['rxAgeMonth', 'rxAgeDay', 'rxAgeYear'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.value = '';
      });
      msgEl.hidden = false;
      msgEl.className = 'rx-msg error';
      msgEl.textContent = err.message || 'Could not complete age eligibility check.';
      if (err && err.code === 'AGE_INELIGIBLE') {
        btn.disabled = true;
      } else {
        btn.disabled = false;
      }
    }
  }

  function syncSupportUnreadBadges(count) {
    var n = Math.max(0, Number(count) || 0);
    rxState.unreadSupportCount = n;
    ['rxSupportUnreadBadge', 'ownerSupportUnreadBadge', 'siTabUnreadBadge'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.hidden = n <= 0;
      el.textContent = n > 99 ? '99+' : String(n);
    });
    var avatar = document.getElementById('profileAvatar');
    if (avatar) {
      avatar.classList.toggle('has-support-unread', n > 0);
    }
  }

  async function refreshAccountRoleContext() {
    injectRoleNavigationAndModals();
    try {
      var ctx = await rxJson('/api/account/context');
      rxState.ctx = ctx;

      var roleBox = document.getElementById('rxProfileRoleBox');
      var adminLink = document.getElementById('navAdminPortalLink');
      var vendorHubBtn = document.getElementById('rxVendorHubBtn');
      var profileSub = document.getElementById('profileSub');

      if (ctx.authenticated) {
        syncSupportUnreadBadges(ctx.unread_support_count || 0);
        var labels = Array.isArray(ctx.role_labels) ? ctx.role_labels : ['Customer'];
        if (roleBox) {
          roleBox.hidden = false;
          roleBox.innerHTML = labels
            .map(function (lbl) {
              var isAdmin = lbl.indexOf('Admin:') === 0;
              return '<span class="profile-role-pill' + (isAdmin ? ' is-admin' : '') + '">' + rxEsc(lbl) + '</span>';
            })
            .join('');
        }
        if (profileSub) {
          profileSub.textContent = labels.join(' · ');
        }
        if (adminLink) {
          adminLink.hidden = !(ctx.capabilities && ctx.capabilities.can_access_admin_portal);
        }
        if (vendorHubBtn) {
          vendorHubBtn.hidden = !(Array.isArray(ctx.memberships) && ctx.memberships.length > 0);
        }
        var ageModal = document.getElementById('rxAgeAssessmentModal');
        if (ageModal) {
          if (ctx.requires_age_assessment) {
            document.getElementById('rxAgeModalEmail').textContent = (ctx.user && ctx.user.email) || 'Signed-in account';
            ageModal.hidden = false;
          } else {
            ageModal.hidden = true;
          }
        }
      } else {
        syncSupportUnreadBadges(0);
        if (roleBox) roleBox.hidden = true;
        if (adminLink) adminLink.hidden = true;
        if (vendorHubBtn) vendorHubBtn.hidden = true;
        var ageModalGuest = document.getElementById('rxAgeAssessmentModal');
        if (ageModalGuest) ageModalGuest.hidden = true;
      }

      syncOwnerTeamAndRestrictionUI();
      await applyActiveViewpointExperience();
      await refreshFeatureControls({ reason: 'account_context' });
    } catch (_e) {
      await refreshFeatureControls({ reason: 'account_context_fallback' });
    }
  }

  async function syncOwnerTeamAndRestrictionUI() {
    var ctx = rxState.ctx;
    var teamCard = document.getElementById('ownerTeamCard');
    var rNotice = document.getElementById('ownerRestrictionNotice');
    if (!ctx || !ctx.authenticated) {
      if (teamCard) teamCard.hidden = true;
      if (rNotice) rNotice.hidden = true;
      return;
    }

    var activeVid = typeof ownerTruckId === 'string' && ownerTruckId ? ownerTruckId : null;
    var memberships = Array.isArray(ctx.memberships) ? ctx.memberships : [];
    var mem = memberships.find(function (m) { return m.vendor_id === activeVid; }) || memberships[0] || null;

    if (rNotice) {
      var restr = mem && mem.restrictions ? mem.restrictions : null;
      var notes = [];
      if (restr) {
        if (restr.vendor_access_suspended) notes.push('Operational access is currently suspended.');
        if (restr.hidden_from_discovery) notes.push('Listing is temporarily hidden from public discovery.');
        if (restr.bookings_restricted) notes.push('New booking inquiries are paused (existing bookings remain accessible).');
        if (restr.pager_restricted) notes.push('New pickup pagers are paused (active tickets remain completable).');
        if (restr.needs_info_correction) notes.push('Listing correction requested: ' + (restr.correction_note || 'Review listing details.'));
      }
      if (notes.length) {
        rNotice.hidden = false;
        rNotice.innerHTML = '<strong>⚠ Vendor Status Notice:</strong> ' + rxEsc(notes.join(' ')) + (restr.restriction_reason ? ' <em>(' + rxEsc(restr.restriction_reason) + ')</em>' : '');
      } else {
        rNotice.hidden = true;
      }
    }

    var isActOnBehalfTop = rxState.viewpoint && rxState.viewpoint.mode === 'act_on_behalf' && ctx.admin_level === 'top';
    var canManageTeam = Boolean((mem && mem.role === 'owner' && !(mem.restrictions && mem.restrictions.vendor_access_suspended)) || isActOnBehalfTop);
    if (teamCard) {
      teamCard.hidden = !canManageTeam || (rxState.viewpoint && rxState.viewpoint.readOnly);
      if (!teamCard.hidden && (activeVid || (mem && mem.vendor_id))) {
        loadOwnerTeamMembers(activeVid || mem.vendor_id);
      }
    }
  }

  var staffInviteDraftKey = null;
  var staffInviteDraftSig = '';
  var supportIssueDraftKey = null;
  var supportIssueDraftSig = '';

  async function loadOwnerTeamMembers(vendorId) {
    var box = document.getElementById('ownerTeamList');
    if (!box || !vendorId) return;
    try {
      var data = await rxJson('/api/vendor/members?vendor_id=' + encodeURIComponent(vendorId), {
        featureKey: 'invitations',
        operationName: 'vendor.load_members'
      });
      var members = Array.isArray(data.members) ? data.members : [];
      box.innerHTML = members.length
        ? '<strong>Current Members (' + rxEsc(vendorId) + '):</strong><ul style="margin:6px 0 0;padding-left:18px">' +
          members
            .map(function (m) {
              var canRemove = m.role === 'staff';
              return (
                '<li style="margin:4px 0;display:flex;align-items:center;justify-content:space-between;gap:8px">' +
                '<span>' + rxEsc(m.email || m.user_id) + ' — <strong>' + rxEsc(m.role_label) + '</strong></span>' +
                (canRemove
                  ? '<button type="button" class="secondary" style="padding:3px 8px;font-size:12px" data-remove-staff="' +
                    rxEsc(m.user_id) +
                    '">Remove staff</button>'
                  : '') +
                '</li>'
              );
            })
            .join('') +
          '</ul>'
        : 'No members found.';
      box.querySelectorAll('[data-remove-staff]').forEach(function (btn) {
        btn.onclick = async function () {
          var targetUid = btn.dataset.removeStaff;
          btn.disabled = true;
          try {
            await rxJson('/api/vendor/members', {
              method: 'DELETE',
              idempotentWrite: true,
              featureKey: 'invitations',
              operationName: 'vendor.remove_member',
              body: { vendor_id: vendorId, user_id: targetUid }
            });
            await loadOwnerTeamMembers(vendorId);
          } catch (remErr) {
            btn.disabled = false;
            var msgEl = document.getElementById('ownerStaffInviteResult');
            if (msgEl) {
              msgEl.hidden = false;
              msgEl.className = 'rx-msg error';
              msgEl.textContent = '✕ ' + (remErr.message || 'Could not remove staff member.');
            }
          }
        };
      });
    } catch (err) {
      box.textContent = '⏸ ' + err.message;
    }
  }

  async function submitVendorStaffInvite(e) {
    e.preventDefault();
    var vid = typeof ownerTruckId === 'string' ? ownerTruckId : '';
    var email = document.getElementById('ownerStaffEmail').value.trim();
    var note = document.getElementById('ownerStaffNote').value.trim();
    var msgEl = document.getElementById('ownerStaffInviteResult');
    var formEl = document.getElementById('ownerStaffInviteForm');
    var submitBtn = formEl ? formEl.querySelector('button[type="submit"]') : null;

    var d = rxDiag();
    var sig = vid + '|' + email.toLowerCase() + '|' + note;
    if (!staffInviteDraftKey || staffInviteDraftSig !== sig) {
      staffInviteDraftKey =
        d && typeof d.createIdempotencyKey === 'function'
          ? d.createIdempotencyKey('staffinv')
          : 'staffinv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
      staffInviteDraftSig = sig;
    }

    msgEl.hidden = false;
    msgEl.className = 'rx-msg';
    msgEl.textContent = '⏳ Working — creating staff invitation…';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.setAttribute('aria-busy', 'true');
    }

    try {
      var data = await rxJson('/api/vendor/staff-invitations', {
        method: 'POST',
        idempotentWrite: true,
        featureKey: 'invitations',
        operationName: 'vendor.create_staff_invitation',
        body: { vendor_id: vid, email: email, note: note, idempotency_key: staffInviteDraftKey }
      });
      staffInviteDraftKey = null;
      staffInviteDraftSig = '';

      var deliv = data.delivery || {};
      var dStatus = deliv.delivery_status || (data.accept_path ? 'staging_mailbox_only' : 'provider_accepted');

      if (dStatus === 'provider_accepted') {
        msgEl.className = 'rx-msg';
        msgEl.innerHTML =
          '📤 <strong>Accepted by email provider</strong> for <strong>' +
          rxEsc(email) +
          '</strong>' +
          (deliv.provider_message_id ? ' (Ref: <code>' + rxEsc(deliv.provider_message_id) + '</code>)' : '') +
          '. Provider acceptance confirms handoff, not inbox arrival — ask them to check spam if delayed.';
        formEl.reset();
      } else if (dStatus === 'staging_mailbox_only' && typeof data.accept_path === 'string' && data.accept_path.indexOf('/') === 0) {
        var fullLink = window.location.origin + data.accept_path;
        msgEl.className = 'rx-msg';
        msgEl.innerHTML =
          '🧪 <strong>Staging mailbox mode (not emailed externally)</strong> — share single-use link with <strong>' +
          rxEsc(email) +
          '</strong>:<br><code>' +
          rxEsc(fullLink) +
          '</code>';
        formEl.reset();
      } else if (dStatus === 'delivery_uncertain') {
        msgEl.className = 'rx-msg error';
        msgEl.innerHTML =
          '⚠ <strong>Invitation recorded, but email delivery is uncertain</strong> (provider timed out' +
          (deliv.correlation_id ? ' · Ref: <code>' + rxEsc(deliv.correlation_id) + '</code>' : '') +
          '). Confirm with <strong>' +
          rxEsc(email) +
          '</strong> before resending.';
      } else if (dStatus === 'delivery_failed') {
        msgEl.className = 'rx-msg error';
        msgEl.innerHTML =
          '✕ <strong>Invitation saved, but email delivery failed</strong>' +
          (deliv.error_code ? ' (<code>' + rxEsc(deliv.error_code) + '</code>)' : '') +
          (deliv.correlation_id ? ' · Support ref: <code>' + rxEsc(deliv.correlation_id) + '</code>' : '') +
          '. An administrator can resend it from Accounts &amp; Invitations.';
      } else {
        msgEl.className = 'rx-msg';
        msgEl.innerHTML =
          '✓ Staff invitation recorded for <strong>' +
          rxEsc(email) +
          '</strong> (status: <code>' +
          rxEsc(dStatus) +
          '</code>).';
        formEl.reset();
      }
    } catch (err) {
      msgEl.className = 'rx-msg error';
      msgEl.textContent = '✕ ' + err.message;
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.removeAttribute('aria-busy');
      }
    }
  }

  // =========================================================================
  // 4. Self-Service Vendor Onboarding & Evidence Upload
  // =========================================================================
  function populateModalVendorSelects() {
    var list = Array.isArray(window.trucks) ? window.trucks : typeof trucks !== 'undefined' && Array.isArray(trucks) ? trucks : [];
    var vaSel = document.getElementById('vaTargetVendor');
    var siSel = document.getElementById('siVendorId');
    var opts = list
      .slice()
      .sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); })
      .map(function (t) {
        return '<option value="' + rxEsc(t.id) + '">' + rxEsc(t.name) + ' (' + rxEsc(t.city || 'Sonoma') + ')</option>';
      })
      .join('');
    if (vaSel) vaSel.innerHTML = '<option value="">Select listing…</option>' + opts;
    if (siSel) siSel.innerHTML = '<option value="">None / General</option>' + opts;
  }

  function switchVaTab(tab) {
    document.querySelectorAll('[data-va-tab]').forEach(function (b) {
      var active = b.dataset.vaTab === tab;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', String(active));
    });
    document.getElementById('vaStatusPane').hidden = tab !== 'status';
    document.getElementById('vaFormPane').hidden = tab !== 'form';
    if (tab === 'status') loadMyVendorApplications();
  }

  async function openVendorApplyModal() {
    injectRoleNavigationAndModals();
    populateModalVendorSelects();
    rxOpenModal('vendorApplyModal');
    applyFeatureControlsToDom();
    if (!rxState.ctx || !rxState.ctx.authenticated) {
      document.getElementById('vaStatusPane').innerHTML =
        '<div class="rx-card"><h3>Sign in required</h3><p>Sign in with your email verification code to submit or track a vendor ownership application.</p><a class="primary" style="display:inline-block;text-decoration:none;padding:8px 14px;border-radius:9px" href="/login.html?next=/">Sign in →</a></div>';
      return;
    }
    switchVaTab('status');
  }

  async function loadMyVendorApplications() {
    var pane = document.getElementById('vaStatusPane');
    pane.innerHTML = '<p>Loading your vendor applications…</p>';
    try {
      var data = await rxJson('/api/onboarding/applications');
      rxState.myApps = Array.isArray(data.applications) ? data.applications : [];
      if (!rxState.myApps.length) {
        pane.innerHTML =
          '<div class="rx-card"><h3>No vendor applications yet</h3><p>Own or manage a Sonoma County food truck, coffee cart, or market stand? Claim an unclaimed listing or submit a new spot for BiteShark review.</p><button type="button" class="primary" id="vaStartNewBtn">Start Application →</button></div>';
        document.getElementById('vaStartNewBtn').onclick = function () { switchVaTab('form'); };
        applyFeatureControlsToDom();
        return;
      }
      pane.innerHTML = rxState.myApps
        .map(function (a) {
          var canEdit = a.status === 'draft' || a.status === 'needs_info';
          return (
            '<div class="rx-card">' +
            '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center">' +
            '<h3>' + rxEsc(a.business_name) + '</h3>' +
            '<span class="rx-badge' + (a.status === 'needs_info' ? ' warn' : a.status === 'rejected' ? ' danger' : '') + '">' + rxEsc(a.status) + '</span>' +
            '</div>' +
            '<small>Type: ' + rxEsc(a.application_type) + ' · Target: <code>' + rxEsc(a.target_vendor_id || a.proposed_slug || '—') + '</code> · Updated ' + rxDate(a.updated_at) + '</small>' +
            (a.applicant_feedback
              ? '<div class="rx-msg" style="margin-top:8px"><strong>Reviewer Feedback:</strong> ' + rxEsc(a.applicant_feedback) + '</div>'
              : '') +
            (canEdit
              ? '<div style="margin-top:8px"><button type="button" class="secondary" data-va-edit="' + rxEsc(a.id) + '">✎ Update &amp; Resubmit</button></div>'
              : '') +
            '</div>'
          );
        })
        .join('');

      pane.querySelectorAll('[data-va-edit]').forEach(function (btn) {
        btn.onclick = function () {
          var app = rxState.myApps.find(function (x) { return x.id === btn.dataset.vaEdit; });
          if (!app) return;
          document.getElementById('vaEditId').value = app.id;
          document.getElementById('vaType').value = app.application_type;
          document.getElementById('vaType').onchange();
          document.getElementById('vaTargetVendor').value = app.target_vendor_id || '';
          document.getElementById('vaProposedSlug').value = app.proposed_slug || '';
          document.getElementById('vaBusinessName').value = app.business_name || '';
          document.getElementById('vaPrimaryTown').value = app.primary_town || '';
          document.getElementById('vaCategory').value = app.category || 'Food Trucks';
          document.getElementById('vaCuisine').value = app.cuisine || '';
          document.getElementById('vaContactName').value = app.contact_name || '';
          document.getElementById('vaContactPhone').value = app.contact_phone || '';
          document.getElementById('vaWebsite').value = app.website_url || '';
          document.getElementById('vaSummary').value = app.public_summary || '';
          document.getElementById('vaStatement').value = app.ownership_statement || '';
          switchVaTab('form');
        };
      });
      applyFeatureControlsToDom();
    } catch (err) {
      pane.innerHTML = '<div class="rx-msg error">' + rxEsc(err.message) + '</div>';
    }
  }

  function readFileAsBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var res = String(reader.result || '');
        var idx = res.indexOf(',');
        resolve(idx >= 0 ? res.slice(idx + 1) : res);
      };
      reader.onerror = function () { reject(new Error('Could not read evidence file.')); };
      reader.readAsDataURL(file);
    });
  }

  async function saveOrSubmitVendorApp(mode) {
    var msgEl = document.getElementById('vaFormMsg');
    var submitNotice = document.getElementById('vaSubmitNotice');
    var submitBtn = document.getElementById('vaSubmitAppBtn');
    var draftBtn = document.getElementById('vaSaveDraftBtn');
    if (submitNotice) submitNotice.hidden = true;

    var fileInput = document.getElementById('vaEvidenceFile');
    var file = fileInput && fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
    if (file) {
      var allowedMime = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
      if (allowedMime.indexOf(file.type) === -1) {
        msgEl.hidden = false;
        msgEl.className = 'rx-msg error';
        msgEl.textContent = '✕ Unsupported file format. Choose a PDF, PNG, JPEG, or WebP file (up to 512 KiB). Your form text is preserved.';
        return;
      }
      if (file.size > 512 * 1024) {
        msgEl.hidden = false;
        msgEl.className = 'rx-msg error';
        msgEl.textContent = '✕ Evidence file exceeds 512 KiB (' + Math.ceil(file.size / 1024) + ' KiB). Choose a smaller file or submit without an attachment — your form text is preserved.';
        return;
      }
    }

    msgEl.hidden = false;
    msgEl.className = 'rx-msg';
    msgEl.textContent = mode === 'submit' ? '⏳ Working — submitting application for review…' : '⏳ Working — saving draft…';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.setAttribute('aria-busy', 'true');
    }
    if (draftBtn) draftBtn.disabled = true;

    var draftSavedFirst = false;

    try {
      var appType = document.getElementById('vaType').value;
      var payload = {
        application_id: document.getElementById('vaEditId').value || undefined,
        action: mode === 'submit' ? 'submit' : 'save_draft',
        application_type: appType,
        target_vendor_id: appType === 'claim_existing' ? document.getElementById('vaTargetVendor').value : null,
        proposed_slug: appType === 'new_listing' ? document.getElementById('vaProposedSlug').value.trim() : null,
        business_name: document.getElementById('vaBusinessName').value.trim(),
        primary_town: document.getElementById('vaPrimaryTown').value.trim(),
        category: document.getElementById('vaCategory').value.trim(),
        cuisine: document.getElementById('vaCuisine').value.trim(),
        contact_name: document.getElementById('vaContactName').value.trim(),
        contact_phone: document.getElementById('vaContactPhone').value.trim(),
        website_url: document.getElementById('vaWebsite').value.trim(),
        public_summary: document.getElementById('vaSummary').value.trim(),
        ownership_statement: document.getElementById('vaStatement').value.trim()
      };

      if (file && mode === 'submit') {
        var draftOut = await rxJson('/api/onboarding/applications', {
          method: 'POST',
          idempotentWrite: true,
          featureKey: 'onboarding_uploads',
          operationName: 'onboarding.save_draft_before_upload',
          body: Object.assign({}, payload, { action: 'save_draft' })
        });
        var appId = draftOut.application.id;
        // Persist the saved draft ID immediately so any subsequent upload/network error updates this draft instead of duplicating!
        document.getElementById('vaEditId').value = appId;
        payload.application_id = appId;
        draftSavedFirst = true;

        var b64 = await readFileAsBase64(file);
        await rxJson('/api/onboarding/evidence', {
          method: 'POST',
          featureKey: 'onboarding_uploads',
          operationName: 'onboarding.upload_evidence',
          body: {
            application_id: appId,
            filename: file.name,
            mime_type: file.type,
            evidence_kind: 'ownership_proof',
            data_base64: b64
          }
        });
      }

      var finalOut = await rxJson('/api/onboarding/applications', {
        method: 'POST',
        idempotentWrite: Boolean(payload.application_id),
        featureKey: 'onboarding_uploads',
        operationName: mode === 'submit' ? 'onboarding.submit_application' : 'onboarding.save_draft',
        body: payload
      });

      if (file && mode !== 'submit') {
        document.getElementById('vaEditId').value = finalOut.application.id;
        draftSavedFirst = true;
        var b64Draft = await readFileAsBase64(file);
        await rxJson('/api/onboarding/evidence', {
          method: 'POST',
          featureKey: 'onboarding_uploads',
          operationName: 'onboarding.upload_draft_evidence',
          body: {
            application_id: finalOut.application.id,
            filename: file.name,
            mime_type: file.type,
            evidence_kind: 'ownership_proof',
            data_base64: b64Draft
          }
        });
      }

      document.getElementById('vaFormPane').reset();
      document.getElementById('vaEditId').value = '';
      msgEl.hidden = true;
      if (submitNotice) {
        submitNotice.hidden = false;
        submitNotice.className = 'rx-msg';
        submitNotice.textContent =
          mode === 'submit'
            ? '📨 Submitted for review — your vendor application is queued for administrator review and is not yet approved or live.'
            : '✓ Draft saved to your account. You can return here anytime to complete and submit it.';
      }
      switchVaTab('status');
    } catch (err) {
      msgEl.className = 'rx-msg error';
      if (draftSavedFirst) {
        msgEl.textContent =
          '⚠ Partial completion: your application draft text was saved to your account, but the file upload or final submit step failed (' +
          err.message +
          '). Your form text is preserved above — replace or clear the file and click Submit again (no duplicate draft will be created).';
      } else {
        msgEl.textContent = '✕ ' + err.message + ' Your form entries remain above so you can fix and retry.';
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.removeAttribute('aria-busy');
      }
      if (draftBtn) draftBtn.disabled = false;
    }
  }

  // =========================================================================
  // 5. Private Customer & Vendor Support & Feedback
  // =========================================================================
  var VENDOR_CATEGORY_OPTIONS = [
    { value: 'technical_problem', label: 'Technical / App Problem' },
    { value: 'listing_hours_location', label: 'Listing, Hours, or Live Location' },
    { value: 'event_inquiries', label: 'Event Inquiries / Bookings' },
    { value: 'pager_notifications', label: 'Pickup Pager / Notifications' },
    { value: 'account_access', label: 'Account, Login, or Invitation' },
    { value: 'question_help', label: 'Question / How Something Works' },
    { value: 'suggestion_feedback', label: 'Suggestion / Product Feedback' },
    { value: 'other', label: 'Other' }
  ];

  var CUSTOMER_CATEGORY_OPTIONS = [
    { value: 'technical_problem', label: 'Technical / App Problem' },
    { value: 'booking_issue', label: 'Event Inquiry / Booking' },
    { value: 'pager_issue', label: 'Pickup Pager' },
    { value: 'listing_accuracy', label: 'Listing or Hours Question' },
    { value: 'question_help', label: 'Question / How Something Works' },
    { value: 'suggestion_feedback', label: 'Suggestion / Product Feedback' },
    { value: 'safety_concern', label: 'Safety Concern' },
    { value: 'abuse_report', label: 'Abuse / Harassment Report' },
    { value: 'account_access', label: 'Account, Login, or Invitation' },
    { value: 'other', label: 'Other' }
  ];

  function hasVendorMembership() {
    var ctx = rxState.ctx;
    if (!ctx || !ctx.authenticated) return false;
    if (Array.isArray(ctx.memberships) && ctx.memberships.length > 0) return true;
    if (rxState.viewpoint && rxState.viewpoint.mode === 'act_on_behalf' && rxState.viewpoint.vendorId) return true;
    return false;
  }

  function populateSupportVendorSelector() {
    var siSel = document.getElementById('siVendorId');
    var siLabel = document.getElementById('siVendorLabel');
    if (!siSel) return;

    var prevVal = siSel.value || '';
    if (rxState.supportReporterMode === 'vendor' && hasVendorMembership()) {
      var memberships = Array.isArray(rxState.ctx.memberships) ? rxState.ctx.memberships.slice() : [];
      if (
        rxState.viewpoint &&
        rxState.viewpoint.mode === 'act_on_behalf' &&
        rxState.viewpoint.vendorId &&
        !memberships.some(function (m) { return m.vendor_id === rxState.viewpoint.vendorId; })
      ) {
        memberships.push({ vendor_id: rxState.viewpoint.vendorId, vendor_name: rxState.viewpoint.vendorId, role: 'owner' });
      }
      if (siLabel) siLabel.textContent = 'Managed Vendor *';
      siSel.innerHTML = memberships
        .map(function (m) {
          return '<option value="' + rxEsc(m.vendor_id) + '">' + rxEsc(m.vendor_name || m.vendor_id) + ' (' + rxEsc(m.vendor_id) + ')</option>';
        })
        .join('');
      var activeOwnerVid = typeof ownerTruckId === 'string' ? ownerTruckId : '';
      if (prevVal && memberships.some(function (m) { return m.vendor_id === prevVal; })) {
        siSel.value = prevVal;
      } else if (activeOwnerVid && memberships.some(function (m) { return m.vendor_id === activeOwnerVid; })) {
        siSel.value = activeOwnerVid;
      } else if (memberships.length >= 1) {
        siSel.value = memberships[0].vendor_id;
      }
      return;
    }

    if (siLabel) siLabel.textContent = 'Related Food Spot (optional)';
    var list = Array.isArray(window.trucks) ? window.trucks : typeof trucks !== 'undefined' && Array.isArray(trucks) ? trucks : [];
    var opts = list
      .slice()
      .sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); })
      .map(function (t) {
        return '<option value="' + rxEsc(t.id) + '">' + rxEsc(t.name) + ' (' + rxEsc(t.city || 'Sonoma') + ')</option>';
      })
      .join('');
    siSel.innerHTML = '<option value="">None / General</option>' + opts;
    if (prevVal) siSel.value = prevVal;
  }

  function syncSupportContextSummary() {
    var txtEl = document.getElementById('siContextSummaryText');
    if (!txtEl) return;
    var d = rxDiag();
    var parts = [];
    var pre = rxState.supportContextPrefill || {};
    if (pre.correlationId) parts.push('ref ' + pre.correlationId);
    if (pre.featureKey) parts.push('feature ' + pre.featureKey);
    if (d && d.CLIENT_BUNDLE_VERSION) parts.push('build ' + d.CLIENT_BUNDLE_VERSION);
    if (d && typeof d.getCoarseDeviceContext === 'function') {
      var dev = d.getCoarseDeviceContext();
      parts.push(dev.viewport + ' · ' + dev.browser + ' · ' + dev.platform);
    }
    txtEl.textContent = parts.length ? parts.join(', ') : 'app build & coarse device bucket';
  }

  function syncSupportFormUI() {
    var isVendor = rxState.supportReporterMode === 'vendor' && hasVendorMembership();
    var modeWrap = document.getElementById('siModeSwitchWrap');
    var kindWrap = document.getElementById('siCustomerKindWrap');
    var catSel = document.getElementById('siCategory');
    var subjLabel = document.getElementById('siSubjectLabel');
    var descLabel = document.getElementById('siDescriptionLabel');
    var urgWrap = document.getElementById('siUrgencyWrap');
    var urgSel = document.getElementById('siReporterUrgency');
    var scopeWrap = document.getElementById('siSharingScopeWrap');
    var scopeSel = document.getElementById('siSharingScope');
    var critNote = document.getElementById('siCriticalNotice');
    var clearBtn = document.getElementById('siClearDraftBtn');

    if (modeWrap) {
      modeWrap.hidden = !hasVendorMembership();
      modeWrap.querySelectorAll('[data-si-mode]').forEach(function (btn) {
        var active = (btn.dataset.siMode === 'vendor') === isVendor;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', String(active));
      });
    }

    if (kindWrap) {
      kindWrap.hidden = isVendor;
      kindWrap.querySelectorAll('[data-si-kind]').forEach(function (btn) {
        var active = btn.dataset.siKind === rxState.supportCustomerKind;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', String(active));
      });
    }

    if (catSel) {
      var curCat = catSel.value;
      var srcOpts = isVendor ? VENDOR_CATEGORY_OPTIONS : CUSTOMER_CATEGORY_OPTIONS;
      // Preserve any valid legacy value if programmatically selected
      var existsInList = srcOpts.some(function (o) { return o.value === curCat; });
      var htmlOpts = srcOpts
        .map(function (o) {
          return '<option value="' + rxEsc(o.value) + '">' + rxEsc(o.label) + '</option>';
        })
        .join('');
      if (curCat && !existsInList) {
        htmlOpts += '<option value="' + rxEsc(curCat) + '">' + rxEsc(curCat) + '</option>';
      }
      catSel.innerHTML = htmlOpts;
      if (curCat) catSel.value = curCat;
    }

    populateSupportVendorSelector();

    var catVal = catSel ? catSel.value : 'other';
    var isSuggestion =
      catVal === 'suggestion_feedback' || (!isVendor && rxState.supportCustomerKind === 'suggestion');

    if (subjLabel) {
      subjLabel.textContent = isVendor ? 'Short title (5–140 chars) *' : 'Short title (optional — auto-filled if blank)';
    }
    if (descLabel) {
      descLabel.textContent = isSuggestion
        ? 'Your suggestion or feedback (15–1500 chars) *'
        : !isVendor && rxState.supportCustomerKind === 'question'
          ? 'Your question (15–1500 chars) *'
          : 'What happened or how can we help? (15–1500 chars) *';
    }

    if (urgWrap && urgSel) {
      urgWrap.hidden = isSuggestion;
      if (isSuggestion) {
        urgSel.value = 'feedback';
      } else if (urgSel.value === 'feedback') {
        urgSel.value = 'normal';
      }
      if (critNote) {
        critNote.hidden = isSuggestion || urgSel.value !== 'critical';
      }
    }

    if (scopeWrap && scopeSel) {
      scopeWrap.hidden = !isVendor;
      if (isVendor) {
        if (catVal === 'account_access') {
          scopeSel.value = 'personal';
          scopeSel.disabled = true;
          scopeSel.title = 'Account, login, and invitation issues are always kept personal to your account.';
        } else {
          scopeSel.disabled = false;
          scopeSel.title = '';
        }
      }
    }

    if (clearBtn) {
      clearBtn.hidden = !readSupportDraft();
    }
    syncSupportContextSummary();
  }

  function persistCurrentFormDraft() {
    var descEl = document.getElementById('siDescription');
    var subjEl = document.getElementById('siSubject');
    if (!descEl || !subjEl) return;
    var desc = descEl.value || '';
    var subj = subjEl.value || '';
    if (!desc.trim() && !subj.trim()) {
      clearSupportDraft();
      var cb = document.getElementById('siClearDraftBtn');
      if (cb) cb.hidden = true;
      return;
    }
    saveSupportDraft({
      reporterMode: rxState.supportReporterMode,
      customerKind: rxState.supportCustomerKind,
      category: (document.getElementById('siCategory') && document.getElementById('siCategory').value) || '',
      vendorId: (document.getElementById('siVendorId') && document.getElementById('siVendorId').value) || '',
      subject: subj,
      description: desc,
      urgency: (document.getElementById('siReporterUrgency') && document.getElementById('siReporterUrgency').value) || 'normal',
      sharingScope: (document.getElementById('siSharingScope') && document.getElementById('siSharingScope').value) || 'personal',
      affectedFeature: (document.getElementById('siAffectedFeature') && document.getElementById('siAffectedFeature').value) || '',
      contextPrefill: rxState.supportContextPrefill || null,
      savedAt: new Date().toISOString()
    });
    var clearBtn = document.getElementById('siClearDraftBtn');
    if (clearBtn) clearBtn.hidden = false;
  }

  function restoreSavedDraftIntoForm() {
    var draft = readSupportDraft();
    if (!draft) return false;
    if (draft.reporterMode === 'vendor' && hasVendorMembership()) {
      rxState.supportReporterMode = 'vendor';
    } else if (draft.reporterMode === 'customer') {
      rxState.supportReporterMode = 'customer';
    }
    if (draft.customerKind) rxState.supportCustomerKind = draft.customerKind;
    if (draft.contextPrefill && !rxState.supportContextPrefill) {
      rxState.supportContextPrefill = draft.contextPrefill;
    }
    syncSupportFormUI();
    if (draft.category && document.getElementById('siCategory')) {
      document.getElementById('siCategory').value = draft.category;
    }
    if (draft.vendorId && document.getElementById('siVendorId')) {
      document.getElementById('siVendorId').value = draft.vendorId;
    }
    if (typeof draft.subject === 'string' && document.getElementById('siSubject')) {
      document.getElementById('siSubject').value = draft.subject;
    }
    if (typeof draft.description === 'string' && document.getElementById('siDescription')) {
      document.getElementById('siDescription').value = draft.description;
    }
    if (draft.urgency && document.getElementById('siReporterUrgency')) {
      document.getElementById('siReporterUrgency').value = draft.urgency;
    }
    if (draft.sharingScope && document.getElementById('siSharingScope')) {
      document.getElementById('siSharingScope').value = draft.sharingScope;
    }
    if (draft.affectedFeature && document.getElementById('siAffectedFeature')) {
      document.getElementById('siAffectedFeature').value = draft.affectedFeature;
    }
    syncSupportFormUI();
    return true;
  }

  function bindSupportFormProgressiveDisclosure() {
    var form = document.getElementById('siNewPane');
    if (!form || form.dataset.siBound === '1') return;
    form.dataset.siBound = '1';

    form.querySelectorAll('[data-si-mode]').forEach(function (btn) {
      btn.onclick = function () {
        rxState.supportReporterMode = btn.dataset.siMode === 'vendor' ? 'vendor' : 'customer';
        syncSupportFormUI();
        persistCurrentFormDraft();
      };
    });

    form.querySelectorAll('[data-si-kind]').forEach(function (btn) {
      btn.onclick = function () {
        var k = btn.dataset.siKind;
        rxState.supportCustomerKind = k;
        var catSel = document.getElementById('siCategory');
        if (catSel) {
          if (k === 'suggestion') catSel.value = 'suggestion_feedback';
          else if (k === 'question') catSel.value = 'question_help';
          else if (catSel.value === 'suggestion_feedback' || catSel.value === 'question_help') {
            catSel.value = 'technical_problem';
          }
        }
        syncSupportFormUI();
        persistCurrentFormDraft();
      };
    });

    var catEl = document.getElementById('siCategory');
    if (catEl) {
      catEl.onchange = function () {
        if (catEl.value === 'suggestion_feedback') rxState.supportCustomerKind = 'suggestion';
        else if (catEl.value === 'question_help') rxState.supportCustomerKind = 'question';
        syncSupportFormUI();
        persistCurrentFormDraft();
      };
    }

    var urgEl = document.getElementById('siReporterUrgency');
    if (urgEl) {
      urgEl.onchange = function () {
        syncSupportFormUI();
        persistCurrentFormDraft();
      };
    }

    ['siSubject', 'siDescription', 'siVendorId', 'siSharingScope', 'siAffectedFeature'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', persistCurrentFormDraft);
        el.addEventListener('change', persistCurrentFormDraft);
      }
    });

    var clearBtn = document.getElementById('siClearDraftBtn');
    if (clearBtn) {
      clearBtn.onclick = function () {
        clearSupportDraft();
        form.reset();
        rxState.supportContextPrefill = null;
        syncSupportFormUI();
      };
    }
  }

  function renderGuestSupportPane(targetTicketRef) {
    var guestPane = document.getElementById('siGuestPane');
    var tabsBar = document.getElementById('siTabsBar');
    var listPane = document.getElementById('siListPane');
    var newPane = document.getElementById('siNewPane');
    if (!guestPane) return;

    if (tabsBar) tabsBar.hidden = true;
    if (listPane) listPane.hidden = true;
    if (newPane) newPane.hidden = true;
    guestPane.hidden = false;

    var existingDraft = readSupportDraft();
    var pre = rxState.supportContextPrefill || {};
    var nextDest = targetTicketRef
      ? '/login.html?next=' + encodeURIComponent('/#support=' + targetTicketRef)
      : '/login.html?next=' + encodeURIComponent('/#support-resume');

    guestPane.innerHTML =
      '<div class="rx-card">' +
      '<h3>Sign in required before submitting a support request</h3>' +
      '<p style="margin:6px 0;font-size:13.5px;line-height:1.5">To keep support conversations private without insecure email bearer links, BiteShark links every ticket and team reply to your verified <strong>14+</strong> account.</p>' +
      (targetTicketRef
        ? '<p style="margin:6px 0;font-size:13px;color:#214b3b"><strong>Ticket reference:</strong> <code>' + rxEsc(targetTicketRef) + '</code> — sign in with the account that submitted this request to read updates.</p>'
        : '') +
      (pre.correlationId
        ? '<div class="si-context-box" style="margin:8px 0">Captured error reference <code>' + rxEsc(pre.correlationId) + '</code> — we will carry this into your support draft in this browser tab when you sign in.</div>'
        : '') +
      '<label style="display:block;font-size:12.5px;font-weight:700;color:#3d4a44;margin:10px 0 4px" for="siGuestDraftInput">Optional: jot down a quick note in this tab before signing in</label>' +
      '<textarea id="siGuestDraftInput" rows="3" maxlength="1500" style="width:100%;border:1px solid #cfc6b4;border-radius:9px;padding:8px 10px;font-family:inherit;font-size:13.5px" placeholder="Optional note saved only in this browser tab (cleared when the tab closes)…">' +
      rxEsc((existingDraft && existingDraft.description) || '') +
      '</textarea>' +
      '<p style="margin:6px 0 10px;font-size:12px;color:#4a544f">Do not enter passwords, 6-digit login codes, payment card numbers, or birth dates. Support is reviewed asynchronously (not 24/7 emergency dispatch).</p>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      '<button type="button" class="primary" id="siGuestSaveAndSignInBtn">Save draft &amp; Sign in →</button>' +
      (existingDraft ? '<button type="button" class="secondary" id="siGuestClearDraftBtn">Clear draft</button>' : '') +
      '</div>' +
      '</div>';

    var goBtn = document.getElementById('siGuestSaveAndSignInBtn');
    if (goBtn) {
      goBtn.onclick = function () {
        var noteVal = (document.getElementById('siGuestDraftInput') && document.getElementById('siGuestDraftInput').value) || '';
        if (noteVal.trim() || pre.correlationId) {
          saveSupportDraft({
            reporterMode: 'customer',
            customerKind: 'problem',
            description: noteVal,
            contextPrefill: rxState.supportContextPrefill || null,
            savedAt: new Date().toISOString()
          });
        }
        window.location.href = nextDest;
      };
    }
    var clrBtn = document.getElementById('siGuestClearDraftBtn');
    if (clrBtn) {
      clrBtn.onclick = function () {
        clearSupportDraft();
        renderGuestSupportPane(targetTicketRef);
      };
    }
  }

  function switchSiTab(tab) {
    var tabsBar = document.getElementById('siTabsBar');
    var guestPane = document.getElementById('siGuestPane');
    if (tabsBar) tabsBar.hidden = false;
    if (guestPane) guestPane.hidden = true;

    document.querySelectorAll('[data-si-tab]').forEach(function (b) {
      var active = b.dataset.siTab === tab;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', String(active));
    });
    document.getElementById('siListPane').hidden = tab !== 'list';
    document.getElementById('siNewPane').hidden = tab !== 'new';
    if (tab === 'list') {
      loadMySupportIssues();
    } else {
      syncSupportFormUI();
    }
  }

  async function openSupportIssuesModal(opts) {
    var options = opts && typeof opts === 'object' ? opts : {};
    injectRoleNavigationAndModals();
    if (!rxState.ctx) {
      await refreshAccountRoleContext();
    }
    populateModalVendorSelects();

    var ackEl = document.getElementById('siAckBanner');
    if (ackEl && !options.keepAck) ackEl.hidden = true;

    // Determine context: explicit option, or active #ownerScreen -> vendor mode
    var ownerScreen = document.getElementById('ownerScreen');
    var onOwnerScreen = Boolean(ownerScreen && ownerScreen.classList.contains('active'));
    if (options.reporterContext === 'vendor' && hasVendorMembership()) {
      rxState.supportReporterMode = 'vendor';
    } else if (options.reporterContext === 'customer') {
      rxState.supportReporterMode = 'customer';
    } else if (onOwnerScreen && hasVendorMembership()) {
      rxState.supportReporterMode = 'vendor';
    } else if (!hasVendorMembership()) {
      rxState.supportReporterMode = 'customer';
    }

    if (options.mode === 'contextual_error') {
      rxState.supportContextPrefill = {
        featureKey: options.featureKey || '',
        operationName: options.operationName || '',
        correlationId: options.correlationId || '',
        occurredAt: options.occurredAt || new Date().toISOString()
      };
      rxState.supportCustomerKind = 'problem';
    }

    rxOpenModal('supportIssuesModal');

    if (!rxState.ctx || !rxState.ctx.authenticated) {
      renderGuestSupportPane(options.ticketNumber || '');
      return;
    }

    restoreSavedDraftIntoForm();

    if (options.category && document.getElementById('siCategory')) {
      syncSupportFormUI();
      document.getElementById('siCategory').value = options.category;
      if (options.category === 'suggestion_feedback') rxState.supportCustomerKind = 'suggestion';
      else if (options.category === 'question_help') rxState.supportCustomerKind = 'question';
      syncSupportFormUI();
    }
    if (options.featureKey && document.getElementById('siAffectedFeature')) {
      document.getElementById('siAffectedFeature').value = options.featureKey;
      var detailsBox = document.getElementById('siExtraDetailsBox');
      if (detailsBox) detailsBox.open = true;
    }

    if (options.ticketNumber) {
      rxState.selectedIssueId = options.ticketNumber;
      switchSiTab('list');
      return;
    }

    var targetTab = options.tab || (options.mode === 'contextual_error' || options.resumeDraft ? 'new' : 'list');
    switchSiTab(targetTab);
  }

  window.bitesharkOpenSupport = openSupportIssuesModal;

  function statusBadgeToneClass(status) {
    if (status === 'waiting') return ' warn';
    if (status === 'closed') return '';
    return '';
  }

  async function loadMySupportIssues() {
    var pane = document.getElementById('siListPane');
    if (!pane) return;
    pane.innerHTML = '<p>Loading your support requests…</p>';
    try {
      var data = await rxJson('/api/issues', {
        featureKey: 'support_issues',
        operationName: 'issues.list_mine'
      });
      rxState.myIssues = Array.isArray(data.issues) ? data.issues : [];
      if (typeof data.unread_count === 'number') {
        syncSupportUnreadBadges(data.unread_count);
      }

      if (!rxState.myIssues.length) {
        pane.innerHTML =
          '<div class="rx-card"><h3>No support requests yet</h3><p>Need help with an event inquiry, pickup pager, listing detail, or want to suggest an improvement? Submit a private ticket anytime.</p><button type="button" class="primary" id="siOpenNewBtn">New request / feedback →</button></div>';
        document.getElementById('siOpenNewBtn').onclick = function () { switchSiTab('new'); };
        return;
      }

      pane.innerHTML = rxState.myIssues
        .map(function (iss) {
          var tNum = iss.ticket_number || ('#' + String(iss.id).slice(0, 8));
          var statusLbl = iss.status_label || iss.status;
          var catLbl = iss.category_label || iss.category;
          var hasUnread = Boolean(iss.has_unread_updates);
          var isSharedVendor = iss.sharing_scope === 'vendor_service';
          return (
            '<div class="si-ticket-card' + (hasUnread ? ' has-unread' : '') + '" data-ticket-number="' + rxEsc(tNum) + '">' +
            '<div class="si-ticket-head">' +
            '<div><span class="si-ticket-num">' + rxEsc(tNum) + '</span> ' +
            (hasUnread ? '<span class="rx-unread-badge" style="margin-left:4px">New update</span> ' : '') +
            '<strong style="font-size:15px">' + rxEsc(iss.subject) + '</strong></div>' +
            '<span class="rx-badge' + statusBadgeToneClass(iss.status) + '">' + rxEsc(statusLbl) + '</span>' +
            '</div>' +
            '<div style="margin-top:4px;font-size:12px;color:#4a544f">' +
            rxEsc(catLbl) +
            (iss.vendor_id ? ' · Spot: <code>' + rxEsc(iss.vendor_id) + '</code>' : '') +
            ' · ' + (isSharedVendor ? '👥 Shared vendor service' : '🔒 Personal') +
            ' · Submitted ' + rxDate(iss.created_at) +
            '</div>' +
            '<p style="margin:7px 0;font-size:13.5px;line-height:1.45">' + rxEsc(iss.description) + '</p>' +
            (iss.resolution_reason
              ? '<div class="rx-msg" style="margin:6px 0"><strong>Resolution summary:</strong> ' + rxEsc(iss.resolution_reason) + '</div>'
              : '') +
            '<button type="button" class="secondary" data-si-thread="' + rxEsc(iss.id) + '" style="margin-top:4px">' +
            (hasUnread ? 'Read New Reply &amp; Timeline' : 'View Timeline / Reply') +
            '</button>' +
            '<div id="siThread-' + rxEsc(iss.id) + '" hidden style="margin-top:8px"></div>' +
            '</div>'
          );
        })
        .join('');

      pane.querySelectorAll('[data-si-thread]').forEach(function (btn) {
        btn.onclick = function () { loadSupportIssueThread(btn.dataset.siThread); };
      });

      if (rxState.selectedIssueId) {
        var targetRef = String(rxState.selectedIssueId).toUpperCase();
        var match = rxState.myIssues.find(function (x) {
          return x.id === rxState.selectedIssueId || String(x.ticket_number || '').toUpperCase() === targetRef;
        });
        rxState.selectedIssueId = null;
        if (match) {
          loadSupportIssueThread(match.id);
        }
      }
    } catch (err) {
      pane.innerHTML = '<div class="rx-msg error">' + rxEsc(err.message) + '</div>';
    }
  }

  async function loadSupportIssueThread(issueId) {
    var box = document.getElementById('siThread-' + issueId);
    if (!box) return;
    box.hidden = false;
    box.innerHTML = '<small>Loading conversation &amp; timeline…</small>';
    try {
      var data = await rxJson('/api/issues?issue_id=' + encodeURIComponent(issueId), {
        featureKey: 'support_issues',
        operationName: 'issues.load_detail'
      });
      var iss = data.issue || {};
      var notes = Array.isArray(data.notes) ? data.notes : [];
      var events = Array.isArray(data.timeline_events) ? data.timeline_events : [];
      var pubDiags = Array.isArray(data.public_diagnostics) ? data.public_diagnostics : [];

      if (iss.has_unread_updates) {
        rxJson('/api/issues/read', {
          method: 'POST',
          idempotentWrite: true,
          featureKey: 'support_issues',
          operationName: 'issues.mark_read',
          body: { issue_id: issueId }
        })
          .then(function () {
            syncSupportUnreadBadges(Math.max(0, rxState.unreadSupportCount - 1));
          })
          .catch(function () {});
      }

      // Build chronological timeline merging public events & public replies
      var merged = [];
      events.forEach(function (ev) {
        merged.push({
          kind: 'event',
          at: ev.created_at,
          label: ev.public_actor_label || 'BiteShark Support',
          text: ev.summary || ev.event_type
        });
      });
      notes.forEach(function (n) {
        var isTeam = n.author_role === 'mod' || n.author_role === 'top';
        var authorLabel = n.author_display_label || (isTeam ? 'BiteShark Support' : 'You');
        merged.push({
          kind: isTeam ? 'team_note' : 'user_note',
          at: n.created_at,
          label: authorLabel,
          text: n.body
        });
      });
      merged.sort(function (a, b) {
        return new Date(a.at || 0).getTime() - new Date(b.at || 0).getTime();
      });

      var knownIssueHtml = pubDiags
        .map(function (d) {
          var vTag =
            d.verification_status === 'verified_fixed'
              ? ' · Fix verified'
              : d.verification_status === 'pending_release'
                ? ' · Fix queued for upcoming update'
                : ' · Under investigation';
          return (
            '<div class="si-known-issue-banner">' +
            '<strong>🔗 Connected to a known service issue' + rxEsc(vTag) + ':</strong> ' +
            rxEsc(d.public_summary || 'Our team linked your report to a known technical issue we are tracking.') +
            '</div>'
          );
        })
        .join('');

      var timelineHtml = merged.length
        ? '<div class="si-timeline">' +
          merged
            .map(function (item) {
              if (item.kind === 'event') {
                return (
                  '<div class="si-tl-item is-event">' +
                  '<strong>' + rxEsc(item.label) + '</strong> · ' + rxDate(item.at) + ' — ' + rxEsc(item.text) +
                  '</div>'
                );
              }
              return (
                '<div class="si-tl-item' + (item.kind === 'team_note' ? ' is-team' : '') + '">' +
                '<div style="font-size:11.5px;color:#46524c;margin-bottom:3px"><strong>' + rxEsc(item.label) + '</strong> · ' + rxDate(item.at) + '</div>' +
                '<div>' + rxEsc(item.text) + '</div>' +
                '</div>'
              );
            })
            .join('') +
          '</div>'
        : '<p><small>No updates yet — your request is in the BiteShark support queue.</small></p>';

      var canReply = iss.status !== 'closed' && iss.status !== 'resolved';
      var canReopen = Boolean(iss.can_reopen || iss.status === 'resolved');

      var replyHtml = canReply
        ? '<form class="rx-form" data-si-reply="' + rxEsc(issueId) + '">' +
          '<label for="siReplyInput-' + rxEsc(issueId) + '">Add a reply or extra detail</label>' +
          '<input id="siReplyInput-' + rxEsc(issueId) + '" type="text" required minlength="2" maxlength="1500" placeholder="Write a reply (do not include codes or passwords)…">' +
          '<div class="rx-msg error" data-si-reply-err hidden role="alert"></div>' +
          '<button type="submit" class="secondary">Send Reply</button>' +
          '</form>'
        : iss.status === 'closed'
          ? '<p style="font-size:12.5px;color:#4a544f;margin-top:6px">This ticket is closed. If a new issue comes up, open a new support request above.</p>'
          : '';

      var reopenHtml = canReopen
        ? '<div class="si-reopen-box">' +
          '<strong style="font-size:13px;display:block;margin-bottom:4px">Still experiencing this problem?</strong>' +
          '<form class="rx-form" data-si-reopen="' + rxEsc(issueId) + '">' +
          '<label for="siReopenInput-' + rxEsc(issueId) + '">Tell us what is still happening (required to reopen)</label>' +
          '<input id="siReopenInput-' + rxEsc(issueId) + '" type="text" required minlength="5" maxlength="1000" placeholder="Describe what is still happening…">' +
          '<div class="rx-msg error" data-si-reopen-err hidden role="alert"></div>' +
          '<button type="submit" class="secondary">Reopen Support Request</button>' +
          '</form>' +
          '</div>'
        : '';

      box.innerHTML = knownIssueHtml + timelineHtml + replyHtml + reopenHtml;

      var form = box.querySelector('[data-si-reply]');
      if (form) {
        var replyDraftKey = null;
        var replyDraftSig = '';
        form.onsubmit = async function (e) {
          e.preventDefault();
          var inp = form.querySelector('input');
          var btn = form.querySelector('button[type="submit"]');
          var errBox = form.querySelector('[data-si-reply-err]');
          var msgVal = inp.value.trim();
          if (errBox) errBox.hidden = true;

          var d = rxDiag();
          if (!replyDraftKey || replyDraftSig !== msgVal) {
            replyDraftKey =
              d && typeof d.createIdempotencyKey === 'function'
                ? d.createIdempotencyKey('sireply')
                : 'sireply_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
            replyDraftSig = msgVal;
          }

          if (btn) {
            btn.disabled = true;
            btn.setAttribute('aria-busy', 'true');
          }
          try {
            await rxJson('/api/issues/reply', {
              method: 'POST',
              idempotentWrite: true,
              featureKey: 'support_issues',
              operationName: 'issues.reply',
              body: { issue_id: issueId, message: msgVal, idempotency_key: replyDraftKey }
            });
            replyDraftKey = null;
            replyDraftSig = '';
            await loadSupportIssueThread(issueId);
          } catch (repErr) {
            if (errBox) {
              errBox.hidden = false;
              errBox.textContent = '✕ ' + (repErr.message || 'Could not send reply. Your message is preserved above.');
            }
            if (btn) {
              btn.disabled = false;
              btn.removeAttribute('aria-busy');
            }
          }
        };
      }

      var reopenForm = box.querySelector('[data-si-reopen]');
      if (reopenForm) {
        var reopenKey = null;
        var reopenSig = '';
        reopenForm.onsubmit = async function (e) {
          e.preventDefault();
          var rInp = reopenForm.querySelector('input');
          var rBtn = reopenForm.querySelector('button[type="submit"]');
          var rErr = reopenForm.querySelector('[data-si-reopen-err]');
          var reasonVal = rInp.value.trim();
          if (rErr) rErr.hidden = true;

          var d = rxDiag();
          if (!reopenKey || reopenSig !== reasonVal) {
            reopenKey =
              d && typeof d.createIdempotencyKey === 'function'
                ? d.createIdempotencyKey('sireopen')
                : 'sireopen_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
            reopenSig = reasonVal;
          }

          if (rBtn) {
            rBtn.disabled = true;
            rBtn.setAttribute('aria-busy', 'true');
          }
          try {
            await rxJson('/api/issues/reopen', {
              method: 'POST',
              idempotentWrite: true,
              featureKey: 'support_issues',
              operationName: 'issues.reopen',
              body: { issue_id: issueId, reason: reasonVal, idempotency_key: reopenKey }
            });
            reopenKey = null;
            reopenSig = '';
            rxState.selectedIssueId = issueId;
            await loadMySupportIssues();
          } catch (reErr) {
            if (rErr) {
              rErr.hidden = false;
              rErr.textContent = '✕ ' + (reErr.message || 'Could not reopen ticket. Your note is preserved above.');
            }
            if (rBtn) {
              rBtn.disabled = false;
              rBtn.removeAttribute('aria-busy');
            }
          }
        };
      }
    } catch (err) {
      box.innerHTML = '<div class="rx-msg error">⏸ ' + rxEsc(err.message) + '</div>';
    }
  }

  function renderSubmissionAcknowledgement(issue, notificationStatus) {
    var ackEl = document.getElementById('siAckBanner');
    if (!ackEl || !issue) return;
    var isCritical = issue.reporter_urgency === 'critical';
    var isFeedback = issue.reporter_urgency === 'feedback' || issue.category === 'suggestion_feedback';
    var scopeLabel =
      issue.sharing_scope === 'vendor_service'
        ? 'Shared with authorized owners & staff of ' + (issue.vendor_id || 'this vendor') + ' + BiteShark support'
        : 'Private to your account + BiteShark support';

    var notifNote =
      notificationStatus === 'provider_accepted'
        ? 'Email confirmation accepted by mail provider (check inbox/spam) + tracked in-app below.'
        : 'Saved to your in-app support timeline below (external email confirmation not sent for this address/mode).';

    var nextStepNote = isCritical
      ? 'Highlighted as Critical in the BiteShark support queue. Note: this ticket has just been received and has not yet been read by a team member (BiteShark does not staff 24/7 live emergency dispatch).'
      : isFeedback
        ? 'Logged for product & operations review. You can check status or add thoughts anytime under My support requests.'
        : 'Queued for BiteShark support review. Replies appear in My support requests (with an unread badge when our team responds).';

    ackEl.hidden = false;
    ackEl.innerHTML =
      '<div class="si-ack-card">' +
      '<h3>✓ Received — Ticket <code>' + rxEsc(issue.ticket_number || 'Recorded') + '</code></h3>' +
      '<div class="si-ack-meta">' +
      '<span class="rx-badge">Status: ' + rxEsc(issue.status_label || 'Received') + '</span>' +
      '<span class="rx-badge">' + rxEsc(issue.category_label || issue.category) + '</span>' +
      (isCritical ? '<span class="rx-badge danger">Critical reported</span>' : '') +
      '</div>' +
      '<p style="margin:6px 0;font-size:13px;line-height:1.45"><strong>Visibility:</strong> ' + rxEsc(scopeLabel) + '</p>' +
      '<p style="margin:4px 0;font-size:13px;line-height:1.45"><strong>Notifications:</strong> ' + rxEsc(notifNote) + '</p>' +
      '<p style="margin:4px 0 0;font-size:13px;line-height:1.45"><strong>What happens next:</strong> ' + rxEsc(nextStepNote) + '</p>' +
      '</div>';
  }

  async function submitNewSupportIssue(e) {
    e.preventDefault();
    var msgEl = document.getElementById('siFormMsg');
    var noticeEl = document.getElementById('siSubmitNotice');
    var ackEl = document.getElementById('siAckBanner');
    var submitBtn = document.getElementById('siSubmitIssueBtn');
    if (noticeEl) noticeEl.hidden = true;
    if (ackEl) ackEl.hidden = true;

    var isVendor = rxState.supportReporterMode === 'vendor' && hasVendorMembership();
    var cat = document.getElementById('siCategory').value;
    var vend = document.getElementById('siVendorId').value || null;
    var subj = document.getElementById('siSubject').value.trim();
    var desc = document.getElementById('siDescription').value.trim();
    var urg = document.getElementById('siReporterUrgency') ? document.getElementById('siReporterUrgency').value : 'normal';
    var scope =
      isVendor && cat !== 'account_access' && document.getElementById('siSharingScope')
        ? document.getElementById('siSharingScope').value
        : 'personal';
    var affFeature =
      (document.getElementById('siAffectedFeature') && document.getElementById('siAffectedFeature').value) ||
      (rxState.supportContextPrefill && rxState.supportContextPrefill.featureKey) ||
      '';
    var occRaw = document.getElementById('siOccurredAt') ? document.getElementById('siOccurredAt').value : '';
    var attachCtx = document.getElementById('siAttachTechContext')
      ? document.getElementById('siAttachTechContext').checked
      : true;

    if (isVendor && subj.length < 5) {
      msgEl.hidden = false;
      msgEl.className = 'rx-msg error';
      msgEl.textContent = '✕ Enter a short title (at least 5 characters) for your vendor support request.';
      document.getElementById('siSubject').focus();
      return;
    }
    if (!isVendor && subj.length > 0 && subj.length < 5) {
      msgEl.hidden = false;
      msgEl.className = 'rx-msg error';
      msgEl.textContent = '✕ Short title must be at least 5 characters (or leave it blank to auto-fill).';
      document.getElementById('siSubject').focus();
      return;
    }
    if (desc.length < 15) {
      msgEl.hidden = false;
      msgEl.className = 'rx-msg error';
      msgEl.textContent = '✕ Please include at least 15 characters describing what happened or your feedback.';
      document.getElementById('siDescription').focus();
      return;
    }

    persistCurrentFormDraft();

    var d = rxDiag();
    var sig = [isVendor ? 'vendor' : 'customer', cat, vend || '', subj, desc, urg, scope].join('|');
    if (!supportIssueDraftKey || supportIssueDraftSig !== sig) {
      supportIssueDraftKey =
        d && typeof d.createIdempotencyKey === 'function'
          ? d.createIdempotencyKey('issue')
          : 'issue_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
      supportIssueDraftSig = sig;
    }

    var bodyPayload = {
      reporter_context: isVendor ? 'vendor' : 'customer',
      entry_kind: isVendor
        ? (cat === 'suggestion_feedback' ? 'suggestion' : cat === 'question_help' ? 'question' : 'problem')
        : rxState.supportCustomerKind,
      category: cat,
      vendor_id: vend,
      subject: subj || undefined,
      description: desc,
      reporter_urgency: cat === 'suggestion_feedback' ? 'feedback' : urg,
      sharing_scope: scope,
      idempotency_key: supportIssueDraftKey
    };

    if (affFeature) bodyPayload.affected_feature = affFeature;
    if (occRaw) {
      var occDate = new Date(occRaw);
      if (!Number.isNaN(occDate.getTime())) bodyPayload.reported_occurred_at = occDate.toISOString();
    } else if (attachCtx && rxState.supportContextPrefill && rxState.supportContextPrefill.occurredAt) {
      bodyPayload.reported_occurred_at = rxState.supportContextPrefill.occurredAt;
    }

    if (attachCtx) {
      var pre = rxState.supportContextPrefill || {};
      if (pre.correlationId) bodyPayload.error_correlation_id = pre.correlationId;
      if (pre.operationName) bodyPayload.operation_name = pre.operationName;
      if (d && typeof d.getCoarseDeviceContext === 'function') {
        bodyPayload.coarse_device = d.getCoarseDeviceContext();
      }
      if (d && typeof d.getReleaseSnapshot === 'function') {
        var snap = d.getReleaseSnapshot();
        bodyPayload.client_build_version = snap.clientBundleVersion || null;
        bodyPayload.client_loaded_release_sha = snap.loadedServerReleaseSha || null;
      }
    }

    msgEl.hidden = false;
    msgEl.className = 'rx-msg';
    msgEl.textContent = '⏳ Working — submitting private support request…';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.setAttribute('aria-busy', 'true');
    }
    try {
      var resData = await rxJson('/api/issues', {
        method: 'POST',
        idempotentWrite: true,
        featureKey: 'support_issues',
        operationName: 'issues.create',
        body: bodyPayload
      });
      supportIssueDraftKey = null;
      supportIssueDraftSig = '';
      clearSupportDraft();
      rxState.supportContextPrefill = null;
      document.getElementById('siNewPane').reset();
      msgEl.hidden = true;
      renderSubmissionAcknowledgement(resData.issue, resData.acknowledgement_delivery);
      switchSiTab('list');
    } catch (err) {
      msgEl.className = 'rx-msg error';
      if (err && err.status === 401) {
        msgEl.innerHTML =
          '✕ Your session expired, but your draft was safely preserved in this browser tab. ' +
          '<a href="/login.html?next=' + encodeURIComponent('/#support-resume') + '" style="color:#8c1d18;font-weight:700">Sign in to submit your saved draft →</a>';
      } else {
        msgEl.textContent =
          (err.uncertainWrite
            ? '⚠ Outcome uncertain — timed out waiting for confirmation. Your draft is saved; submitting again safely reuses the same ticket key so no duplicate will be created: '
            : '✕ ') + err.message;
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.removeAttribute('aria-busy');
      }
    }
  }

  // =========================================================================
  // 6. Community Post Report Helper (called from `public/community.js`)
  // =========================================================================
  window.bitesharkOpenCommunityReport = function (postId) {
    injectRoleNavigationAndModals();
    document.getElementById('crPostId').value = postId;
    document.getElementById('crDetails').value = '';
    document.getElementById('crFormMsg').hidden = true;
    rxOpenModal('communityReportModal');
  };

  async function submitCommunityReport(e) {
    e.preventDefault();
    var msgEl = document.getElementById('crFormMsg');
    msgEl.hidden = false;
    msgEl.className = 'rx-msg';
    msgEl.textContent = 'Submitting report…';
    try {
      await rxJson('/api/community/report', {
        method: 'POST',
        body: {
          post_id: document.getElementById('crPostId').value,
          reason_category: document.getElementById('crReason').value,
          details: document.getElementById('crDetails').value.trim()
        }
      });
      msgEl.textContent = 'Thank you — moderators have received your report.';
      setTimeout(function () {
        document.getElementById('communityReportModal').hidden = true;
      }, 900);
    } catch (err) {
      msgEl.className = 'rx-msg error';
      msgEl.textContent = err.message;
    }
  }

  // =========================================================================
  // 7. Single-Use Invitation Redemption & Support Deep Links (`/#accept-invite=...`, `/#support...`)
  // =========================================================================
  async function checkInviteRedemptionHash() {
    var h = String(window.location.hash || '');
    if (h === '#support' || h === '#support-resume' || h.indexOf('#support=') === 0) {
      var ticketTarget = h.indexOf('#support=') === 0 ? decodeURIComponent(h.slice('#support='.length)).trim() : '';
      var isResume = h === '#support-resume';
      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
      if (!rxState.ctx || !rxState.ctx.authenticated) {
        await refreshAccountRoleContext();
      }
      await openSupportIssuesModal({
        ticketNumber: ticketTarget || '',
        resumeDraft: isResume,
        tab: isResume ? 'new' : 'list'
      });
      return;
    }

    var token = '';
    if (h.indexOf('#accept-invite=') === 0) {
      token = decodeURIComponent(h.slice('#accept-invite='.length)).trim();
    } else {
      var qp = new URLSearchParams(window.location.search || '');
      if (qp.get('invite') === '1') {
        token = readPendingInviteToken();
        if (token && window.history && window.history.replaceState) {
          window.history.replaceState(null, '', window.location.pathname + '#accept-invite=' + encodeURIComponent(token));
        }
      }
    }
    if (!token) return;

    injectRoleNavigationAndModals();
    var modal = document.getElementById('inviteAcceptModal');
    var body = document.getElementById('iaBody');
    modal.hidden = false;
    body.innerHTML = '<p>Inspecting invitation…</p>';

    try {
      var data = await rxJson('/api/invitations/inspect', {
        method: 'POST',
        body: { token: token }
      });
      var inv = data.invitation || {
        id: data.invitation_id,
        masked_email: data.email_hint,
        requested_role: data.requested_role,
        role_label: data.requested_role_label,
        vendor_id: data.vendor_id,
        vendor_name: data.vendor_name,
        expires_at: data.expires_at,
        full_authority_warning: data.full_authority_warning,
        email_matches_session: data.email_matches_session
      };

      savePendingInviteToken(token);

      var topAuthorityHtml =
        inv.requested_role === 'top' || inv.full_authority_warning
          ? '<div class="rx-msg" role="note" style="background:#fff4ce;border:1px solid #d9b13b;color:#4b3600;margin:8px 0">' +
            '<strong>⚠ Full Administrative Authority (Admin: Top):</strong> Accepting grants full administrative control over BiteShark accounts, invitations, vendor approvals, moderation, and controlled feature states.' +
            '</div>'
          : '';
      var vendorOwnerNoteHtml =
        inv.requested_role === 'vendor_owner'
          ? '<p style="font-size:12.5px;color:#4a544f;margin:6px 0">Note: Vendor owner membership links your account to this vendor scope; public operational publishing remains subject to onboarding review.</p>'
          : '';
      var expiryHtml = inv.expires_at
        ? '<p style="font-size:12.5px;color:#4a544f;margin:4px 0">Single-use invitation expires: <strong>' + rxEsc(rxDate(inv.expires_at)) + '</strong></p>'
        : '';

      if (!rxState.ctx || !rxState.ctx.authenticated) {
        var encodedHash = '#accept-invite=' + encodeURIComponent(token);
        body.innerHTML =
          '<div class="rx-card">' +
          '<h3>Invited Role: ' + rxEsc(inv.role_label) + '</h3>' +
          '<p>Invited Email: <strong>' + rxEsc(inv.masked_email) + '</strong>' +
          (inv.vendor_name ? ' · Vendor: <strong>' + rxEsc(inv.vendor_name) + '</strong>' : '') +
          '</p>' +
          expiryHtml +
          topAuthorityHtml +
          vendorOwnerNoteHtml +
          '<p>Verify email ownership and minimum account age eligibility (<strong>14+</strong>) for <strong>' + rxEsc(inv.masked_email) + '</strong> before redeeming this invitation.</p>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">' +
          '<a class="primary" id="iaSignupLink" style="display:inline-block;text-decoration:none;padding:9px 15px;border-radius:9px" href="/login.html?mode=signup&amp;invite=1' + encodedHash + '">Create Account (14+) &amp; Verify →</a>' +
          '<a class="secondary" id="iaSigninLink" style="display:inline-block;text-decoration:none;padding:9px 15px;border-radius:9px" href="/login.html?invite=1' + encodedHash + '">Existing Account Sign In →</a>' +
          '</div>' +
          '</div>';
        var suLink = document.getElementById('iaSignupLink');
        if (suLink) suLink.focus();
        return;
      }

      if (inv.email_matches_session === false) {
        var signedInEmail = (rxState.ctx.user && rxState.ctx.user.email) || 'another account';
        body.innerHTML =
          '<div class="rx-card">' +
          '<h3>Wrong Account Signed In</h3>' +
          '<p>Invited Role: <strong>' + rxEsc(inv.role_label) + '</strong> · Invited Email: <strong>' + rxEsc(inv.masked_email) + '</strong></p>' +
          '<div class="rx-msg error" role="alert" style="margin:8px 0">' +
          'You are currently signed in as <strong>' + rxEsc(signedInEmail) + '</strong>, which does not match this invitation’s target email (<strong>' + rxEsc(inv.masked_email) + '</strong>). Invitations can only be redeemed by the exact invited email address.' +
          '</div>' +
          '<button type="button" class="primary" id="iaSwitchAccountBtn">Sign Out &amp; Switch to Invited Email →</button>' +
          '</div>';
        var swBtn = document.getElementById('iaSwitchAccountBtn');
        if (swBtn) {
          swBtn.focus();
          swBtn.onclick = async function () {
            swBtn.disabled = true;
            try {
              if (window.bitesharkAuth && window.bitesharkAuth.signOut) {
                await window.bitesharkAuth.signOut();
              }
            } catch (_e) {}
            savePendingInviteToken(token);
            window.location.href = '/login.html?invite=1#accept-invite=' + encodeURIComponent(token);
          };
        }
        return;
      }

      if (rxState.ctx.requires_age_assessment) {
        body.innerHTML =
          '<div class="rx-card">' +
          '<h3>Invited Role: ' + rxEsc(inv.role_label) + '</h3>' +
          '<p>Signed in as: <strong>' + rxEsc(rxState.ctx.user.email) + '</strong></p>' +
          expiryHtml +
          topAuthorityHtml +
          '<p>Complete the one-time minimum account age check (<strong>14+</strong>) before accepting this invitation.</p>' +
          '<button type="button" class="primary" id="iaOpenAgeCheckBtn">Complete 14+ Age Check →</button>' +
          '</div>';
        var ageBtn = document.getElementById('iaOpenAgeCheckBtn');
        if (ageBtn) {
          ageBtn.focus();
          ageBtn.onclick = function () {
            modal.hidden = true;
            var ageModal = document.getElementById('rxAgeAssessmentModal');
            if (ageModal) {
              document.getElementById('rxAgeModalEmail').textContent = rxState.ctx.user.email || '';
              ageModal.hidden = false;
              document.getElementById('rxAgeMonth').focus();
            }
          };
        }
        return;
      }

      body.innerHTML =
        '<div class="rx-card">' +
        '<h3>Invited Role: ' + rxEsc(inv.role_label) + '</h3>' +
        '<p>Signed in as: <strong>' + rxEsc(rxState.ctx.user.email) + '</strong></p>' +
        (inv.vendor_name ? '<p>Vendor: <strong>' + rxEsc(inv.vendor_name) + '</strong></p>' : '') +
        expiryHtml +
        topAuthorityHtml +
        vendorOwnerNoteHtml +
        '<div id="iaAcceptMsg" class="rx-msg" role="status" hidden style="margin-bottom:8px"></div>' +
        '<button type="button" class="primary" id="iaConfirmBtn">Accept Invitation →</button>' +
        '</div>';

      var confirmBtn = document.getElementById('iaConfirmBtn');
      if (confirmBtn) {
        confirmBtn.focus();
        confirmBtn.onclick = async function () {
          var msg = document.getElementById('iaAcceptMsg');
          confirmBtn.disabled = true;
          msg.hidden = false;
          msg.className = 'rx-msg';
          msg.textContent = 'Redeeming invitation…';
          try {
            await rxJson('/api/invitations/accept', { method: 'POST', body: { token: token } });
            clearPendingInviteToken();
            if (window.history && window.history.replaceState) {
              window.history.replaceState(null, '', window.location.pathname);
            } else {
              window.location.hash = '';
            }
            await refreshAccountRoleContext();
            msg.textContent = 'Invitation accepted! Your permissions are now active.';
            setTimeout(function () {
              modal.hidden = true;
              if (inv.requested_role === 'mod' || inv.requested_role === 'top') {
                window.location.href = '/admin';
              }
            }, 650);
          } catch (err) {
            confirmBtn.disabled = false;
            msg.className = 'rx-msg error';
            msg.textContent = err.message;
          }
        };
      }
    } catch (err) {
      if (
        err &&
        (err.code === 'INVITATION_ALREADY_USED' ||
          err.code === 'INVITATION_REVOKED' ||
          err.code === 'INVITATION_EXPIRED' ||
          err.code === 'INVITATION_NOT_FOUND')
      ) {
        clearPendingInviteToken();
      }
      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, '', window.location.pathname);
      }
      body.innerHTML =
        '<div class="rx-card">' +
        '<h3>Invitation Unavailable</h3>' +
        '<div class="rx-msg error" role="alert" style="margin:8px 0">' + rxEsc(err.message) + '</div>' +
        '<p style="font-size:13px;color:#4a544f">If you already redeemed this invitation, you can sign in normally with your invited email address. Otherwise, ask a BiteShark administrator to resend a fresh invitation.</p>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">' +
        '<a class="secondary" style="display:inline-block;text-decoration:none;padding:8px 14px;border-radius:9px" href="/login.html">Go to Sign In</a>' +
        '</div>' +
        '</div>';
    }
  }

  // =========================================================================
  // 8. Controlled Feature State Synchronization & Open-Tab Propagation
  // =========================================================================
  var featureRefreshInFlight = null;
  var featurePollTimer = null;

  function getFeatureEntry(key) {
    if (rxState.features && Object.prototype.hasOwnProperty.call(rxState.features, key)) {
      return rxState.features[key];
    }
    return { state: 'enabled', available: true, implementation_status: 'implemented', message: null };
  }

  function getFeatureState(key) {
    return getFeatureEntry(key).state || 'enabled';
  }

  function isFeatureAvailable(key) {
    return getFeatureState(key) === 'enabled';
  }

  function isFeatureHidden(key) {
    return getFeatureState(key) === 'hidden';
  }

  function getFeatureMessage(key, fallback) {
    var entry = getFeatureEntry(key);
    return entry.message || fallback || 'This feature is currently unavailable.';
  }

  function ensureInlineBanner(id, parentEl, beforeEl) {
    if (!parentEl) return null;
    var el = document.getElementById(id);
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      el.className = 'owner-banner';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      el.hidden = true;
      if (beforeEl && beforeEl.parentNode === parentEl) {
        parentEl.insertBefore(el, beforeEl);
      } else {
        parentEl.insertBefore(el, parentEl.firstChild);
      }
    }
    return el;
  }

  function applyFeatureControlsToDom() {
    var isAdminOrMod = Boolean(
      rxState.ctx &&
      rxState.ctx.authenticated &&
      rxState.ctx.capabilities &&
      rxState.ctx.capabilities.can_access_admin_portal &&
      !(rxState.viewpoint && rxState.viewpoint.mode === 'customer_preview')
    );

    // 1. Event Booking Inquiries (`event_inquiries`)
    var bookState = getFeatureState('event_inquiries');
    document.querySelectorAll('.book-nav').forEach(function (el) {
      el.hidden = bookState === 'hidden';
    });
    document.querySelectorAll('#ownerScreen button[onclick*="openBooking"]').forEach(function (el) {
      el.hidden = bookState === 'hidden';
    });
    document.querySelectorAll('#detailContent button[onclick*="openBooking"]').forEach(function (el) {
      el.hidden = bookState === 'hidden';
    });
    var bookingForm = document.querySelector('#bookingModal form.booking-modal');
    var bookingSubmitBtn = document.getElementById('bookingSubmitBtn');
    if (bookingForm) {
      var bookBanner = ensureInlineBanner('fcBookingStateBanner', bookingForm, document.getElementById('bookingAuthNotice'));
      if (bookState !== 'enabled') {
        if (bookBanner) {
          bookBanner.hidden = false;
          bookBanner.innerHTML = '<span><b>Notice:</b> ' + rxEsc(getFeatureMessage('event_inquiries')) + '</span>';
        }
        if (bookingSubmitBtn) bookingSubmitBtn.disabled = true;
        if (bookState === 'hidden') {
          var bm = document.getElementById('bookingModal');
          if (bm && bm.classList.contains('show')) {
            bm.classList.remove('show');
            if (typeof toast === 'function') toast(getFeatureMessage('event_inquiries'));
          }
        }
      } else {
        if (bookBanner) bookBanner.hidden = true;
        if (bookingSubmitBtn) bookingSubmitBtn.disabled = false;
      }
    }

    // 2. Community Hub (`community_hub`) & Submissions (`community_submissions`)
    var commHubHidden = isFeatureHidden('community_hub');
    var commSubState = getFeatureState('community_submissions');
    document.querySelectorAll('.community-entry').forEach(function (el) {
      el.hidden = commHubHidden;
    });
    document.querySelectorAll('#profileMenu button[onclick*="openCommunity"]').forEach(function (el) {
      el.hidden = commHubHidden;
    });
    document.querySelectorAll('#detailContent button[onclick*="communityReviewPlace"]').forEach(function (el) {
      el.hidden = commHubHidden || commSubState !== 'enabled';
    });
    var commScreen = document.getElementById('communityScreen');
    if (commScreen) {
      if (commHubHidden && commScreen.classList.contains('active') && !isAdminOrMod) {
        if (typeof showScreen === 'function') showScreen('discover');
        if (typeof toast === 'function') toast(getFeatureMessage('community_hub'));
      }
      var commNewBtn = commScreen.querySelector('.community-new');
      var commIdeas = commScreen.querySelector('.community-ideas');
      var whisperBtn = commScreen.querySelector('button[onclick*="streetOpenWhisper"]');
      var commCompose = document.getElementById('communityCompose');
      var commSubmit = document.getElementById('communitySubmit');
      var commBanner = ensureInlineBanner('fcCommunityStateBanner', commScreen, commIdeas);

      if (commSubState !== 'enabled') {
        if (commNewBtn) commNewBtn.hidden = true;
        if (commIdeas) commIdeas.hidden = true;
        if (whisperBtn) whisperBtn.hidden = true;
        if (commCompose) commCompose.hidden = true;
        if (commSubmit) commSubmit.disabled = true;
        if (commBanner) {
          commBanner.hidden = commSubState === 'hidden';
          commBanner.innerHTML = '<span><b>Community submissions paused:</b> ' + rxEsc(getFeatureMessage('community_submissions')) + '</span>';
        }
      } else {
        if (commNewBtn) commNewBtn.hidden = false;
        if (commIdeas) commIdeas.hidden = false;
        if (whisperBtn) whisperBtn.hidden = false;
        if (commSubmit) commSubmit.disabled = false;
        if (commBanner) commBanner.hidden = true;
      }
    }

    // 3. Local Guides, Food Passport & Dish Notebook (`local_guides_passport`)
    var guidesState = getFeatureState('local_guides_passport');
    document.querySelectorAll('.guides-launch, .guide-nav, .community-footer-links button[onclick*="openLocalGuides"]').forEach(function (el) {
      el.hidden = guidesState === 'hidden';
    });
    var guidesScreen = document.getElementById('guidesScreen');
    if (guidesScreen) {
      if (guidesState === 'hidden' && guidesScreen.classList.contains('active')) {
        if (typeof showScreen === 'function') showScreen('discover');
        if (typeof toast === 'function') toast(getFeatureMessage('local_guides_passport'));
      }
      var guidesBanner = ensureInlineBanner('fcGuidesStateBanner', guidesScreen, guidesScreen.querySelector('.guides-tabs'));
      var dishSaveBtn = document.getElementById('dishPhotoSave');
      var passportSubmitBtn = document.querySelector('#guideVisitForm button[type="submit"]');
      if (guidesState === 'paused') {
        if (guidesBanner) {
          guidesBanner.hidden = false;
          guidesBanner.innerHTML = '<span><b>Paused:</b> ' + rxEsc(getFeatureMessage('local_guides_passport')) + '</span>';
        }
        if (dishSaveBtn) dishSaveBtn.disabled = true;
        if (passportSubmitBtn) passportSubmitBtn.disabled = true;
      } else {
        if (guidesBanner) guidesBanner.hidden = true;
        if (dishSaveBtn && guidesState === 'enabled') dishSaveBtn.disabled = false;
      }
    }

    // 4. Flavor Lab & Promo Card Tools (`flavor_lab_tools`)
    var flavorHidden = isFeatureHidden('flavor_lab_tools');
    document.querySelectorAll('.smart-invite').forEach(function (el) {
      el.hidden = flavorHidden;
    });
    document.querySelectorAll('#ownerScreen button[onclick*="openSmart"]').forEach(function (btn) {
      var card = btn.closest('.owner-card');
      if (card) card.hidden = flavorHidden;
      else btn.hidden = flavorHidden;
    });
    var smartScreen = document.getElementById('smartScreen');
    if (smartScreen && flavorHidden && smartScreen.classList.contains('active')) {
      if (typeof showScreen === 'function') showScreen('discover');
      if (typeof toast === 'function') toast(getFeatureMessage('flavor_lab_tools'));
    }

    // 5. Self-Service Vendor Onboarding (`vendor_onboarding`)
    var onbState = getFeatureState('vendor_onboarding');
    var hasExistingApps = Boolean(
      (rxState.ctx && Number(rxState.ctx.my_applications_count) > 0) ||
      (Array.isArray(rxState.myApps) && rxState.myApps.length > 0)
    );
    var applyBtn = document.getElementById('rxVendorApplyBtn');
    if (applyBtn) {
      if (onbState === 'hidden' && !hasExistingApps) {
        applyBtn.hidden = true;
      } else {
        applyBtn.hidden = false;
        applyBtn.textContent = onbState !== 'enabled' && hasExistingApps
          ? '🏪 My vendor applications'
          : '🏪 Claim or apply as vendor';
      }
    }
    var vaModal = document.getElementById('vendorApplyModal');
    if (vaModal) {
      var vaInner = vaModal.querySelector('.rx-modal');
      var vaTabs = vaModal.querySelector('.rx-tabs');
      var vaFormTab = vaModal.querySelector('[data-va-tab="form"]');
      var vaFormPane = document.getElementById('vaFormPane');
      var vaBanner = ensureInlineBanner('fcOnboardingStateBanner', vaInner, vaTabs);
      if (onbState !== 'enabled') {
        if (vaBanner) {
          vaBanner.hidden = false;
          vaBanner.innerHTML = '<span><b>Notice:</b> ' + rxEsc(getFeatureMessage('vendor_onboarding')) + '</span>';
        }
        if (vaFormTab) vaFormTab.hidden = true;
        if (vaFormPane && !vaFormPane.hidden) {
          switchVaTab('status');
        }
        vaModal.querySelectorAll('#vaStartNewBtn, [data-va-edit], #vaFormPane button[type="submit"], #vaSaveDraftBtn').forEach(function (b) {
          b.disabled = true;
        });
      } else {
        if (vaBanner) vaBanner.hidden = true;
        if (vaFormTab) vaFormTab.hidden = false;
        vaModal.querySelectorAll('#vaStartNewBtn, [data-va-edit], #vaFormPane button[type="submit"], #vaSaveDraftBtn').forEach(function (b) {
          b.disabled = false;
        });
      }
    }

    // 6. Interactive Pickup Demo (`pickup_pager_demo`) & New Pager Creation (`pickup_pager_creation`)
    var demoHidden = isFeatureHidden('pickup_pager_demo');
    document.querySelectorAll('.pager-example-hero, #ownerScreen button[onclick*="startPagerDemo"]').forEach(function (el) {
      el.hidden = demoHidden;
    });
    if (demoHidden) {
      var realEntry = document.getElementById('pagerRealEntry');
      if (realEntry) realEntry.open = true;
      if (typeof pagerDemo !== 'undefined' && pagerDemo && typeof pagerLeaveDemo === 'function') {
        pagerLeaveDemo();
      }
    }

    var pagerCreateState = getFeatureState('pickup_pager_creation');
    var kitchenPanel = document.getElementById('kitchenPanel');
    var pagerCreateForm = document.getElementById('pagerCreateForm');
    var pagerCreateBtn = document.getElementById('pagerCreateButton');
    var pagerTicketInput = document.getElementById('pagerTicket');
    if (kitchenPanel && pagerCreateForm) {
      var pagerBanner = ensureInlineBanner('fcPagerCreateStateBanner', kitchenPanel, pagerCreateForm);
      if (pagerCreateState !== 'enabled') {
        if (pagerBanner) {
          pagerBanner.hidden = false;
          pagerBanner.innerHTML = '<span><b>Notice:</b> ' + rxEsc(getFeatureMessage('pickup_pager_creation')) + '</span>';
        }
        pagerCreateForm.hidden = pagerCreateState === 'hidden';
        if (pagerCreateBtn) pagerCreateBtn.disabled = true;
        if (pagerTicketInput) pagerTicketInput.disabled = true;
      } else {
        if (pagerBanner) pagerBanner.hidden = true;
        pagerCreateForm.hidden = false;
        if (pagerTicketInput) pagerTicketInput.disabled = false;
        if (pagerCreateBtn && !(rxState.viewpoint && rxState.viewpoint.readOnly)) {
          pagerCreateBtn.disabled = false;
        }
      }
    }

    // 7. Nearby Alert Preferences (`nearby_alert_preferences`)
    var nearbyState = getFeatureState('nearby_alert_preferences');
    var alertsBar = document.querySelector('#favoritesScreen .alerts-bar');
    if (alertsBar) {
      alertsBar.hidden = nearbyState === 'hidden';
      var nToggle = document.getElementById('nearbyAlertToggle');
      var nRadius = document.getElementById('nearbyAlertRadius');
      var nMeta = document.getElementById('nearbyAlertMeta');
      if (nearbyState === 'paused') {
        if (nToggle) nToggle.disabled = true;
        if (nRadius) nRadius.disabled = true;
        if (nMeta) nMeta.textContent = getFeatureMessage('nearby_alert_preferences');
      } else if (nearbyState === 'enabled') {
        if (nToggle) nToggle.disabled = false;
        if (typeof renderNotificationUI === 'function') renderNotificationUI();
      }
    }

    // 8. Interactive Discovery Map (`interactive_map`)
    var mapHidden = isFeatureHidden('interactive_map') || Boolean(rxState.featuresLoaded && rxState.mapConfig && rxState.mapConfig.enabled === false);
    var modeSwitch = document.querySelector('#discoverScreen .mode-switch');
    var mapModeBtn = document.getElementById('mapMode');
    if (modeSwitch) {
      modeSwitch.hidden = mapHidden;
    }
    if (mapModeBtn) {
      mapModeBtn.hidden = mapHidden;
      mapModeBtn.disabled = mapHidden;
    }
    if (typeof window.bitesharkSyncInteractiveMapControl === 'function') {
      try { window.bitesharkSyncInteractiveMapControl(); } catch (_e) {}
    }

    // 9. Re-render active real pager push box if open
    if (typeof pagerCurrentRendered !== 'undefined' && pagerCurrentRendered && typeof renderPager === 'function' && typeof pagerToken !== 'undefined' && pagerToken) {
      try { renderPager(pagerCurrentRendered); } catch (_e) {}
    }
  }

  async function refreshFeatureControls() {
    if (featureRefreshInFlight) return featureRefreshInFlight;
    featureRefreshInFlight = (async function () {
      try {
        var url = '/api/features';
        if (rxState.viewpoint && rxState.viewpoint.mode === 'customer_preview') {
          url += '?viewpoint=customer';
        }
        var res = await window.fetch(url, {
          method: 'GET',
          credentials: 'same-origin',
          cache: 'no-store'
        });
        var data = await res.json().catch(function () { return null; });
        if (res.ok && data && data.features && typeof data.features === 'object') {
          rxState.features = data.features;
          if (data.map && typeof data.map === 'object') {
            rxState.mapConfig = data.map;
          }
          rxState.featuresLoaded = true;
          rxState.featuresTrusted = data.config_trusted !== false;
          if (Number(data.propagation_poll_seconds) >= 15) {
            rxState.featuresPollSeconds = Number(data.propagation_poll_seconds);
          }
          applyFeatureControlsToDom();
        }
      } catch (_e) {
        // Keep last known feature map; server enforces authoritative gates on all mutations
      } finally {
        featureRefreshInFlight = null;
        if (resolveInitialFeatures) {
          resolveInitialFeatures(rxState);
          resolveInitialFeatures = null;
        }
      }
    })();
    return featureRefreshInFlight;
  }

  function setupFeaturePropagationListeners() {
    if (featurePollTimer) clearInterval(featurePollTimer);
    featurePollTimer = setInterval(function () {
      if (!document.hidden) {
        refreshFeatureControls({ reason: 'poll' });
      }
    }, 60000);

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) {
        refreshFeatureControls({ reason: 'visibilitychange' });
      }
    });

    window.addEventListener('focus', function () {
      refreshFeatureControls({ reason: 'focus' });
    });

    try {
      if (typeof BroadcastChannel === 'function') {
        var bc = new BroadcastChannel(FEATURE_BROADCAST_CHANNEL);
        bc.onmessage = function (ev) {
          if (ev && ev.data && ev.data.type === 'feature_controls_updated') {
            refreshFeatureControls({ reason: 'broadcast' });
          }
        };
      }
    } catch (_e) {}
  }

  window.bitesharkFeatures = {
    getState: getFeatureState,
    isAvailable: isFeatureAvailable,
    isHidden: isFeatureHidden,
    getMessage: getFeatureMessage,
    getMapConfig: function () { return rxState.mapConfig; },
    isLoaded: function () { return Boolean(rxState.featuresLoaded); },
    waitUntilReady: function () { return initialFeaturesReadyPromise; },
    refresh: refreshFeatureControls,
    syncDom: applyFeatureControlsToDom
  };

  window.addEventListener('hashchange', checkInviteRedemptionHash);

  // Boot after main app settles
  async function bootRoleExperience() {
    setupFeaturePropagationListeners();
    await refreshFeatureControls({ reason: 'boot' });
    try {
      if (window.bitesharkReady) await window.bitesharkReady;
    } catch (_e) {}
    await refreshAccountRoleContext();
    await checkInviteRedemptionHash();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(bootRoleExperience, 0);
    });
  } else {
    setTimeout(bootRoleExperience, 0);
  }
})();
