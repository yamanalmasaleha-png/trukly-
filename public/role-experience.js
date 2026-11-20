/* BiteShark Role Experience, Viewpoint Switcher, Self-Service Onboarding, Issues & Invitations
 *
 * Integrates Customer, Vendor Staff, Vendor Owner, Admin: Mod, and Admin: Top experiences
 * into the main BiteShark application while keeping all authorization strictly server-enforced.
 */
(function () {
  'use strict';

  var VIEWPOINT_STORAGE_KEY = 'biteshark_admin_viewpoint_v1';
  var FEATURE_BROADCAST_CHANNEL = 'biteshark_feature_controls_v1';

  var rxState = {
    ctx: null,
    viewpoint: null, // { mode: 'customer_preview' | 'vendor_preview' | 'act_on_behalf', vendorId?, reason?, readOnly }
    myApps: [],
    myIssues: [],
    selectedIssueId: null,
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

  async function rxJson(url, opts) {
    var options = Object.assign({ method: 'GET', credentials: 'same-origin', cache: 'no-store', headers: {} }, opts || {});
    if (options.body && typeof options.body === 'object') {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }
    var res = await window.fetch(url, options);
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok) {
      var err = new Error(data.error || 'Request failed (' + res.status + ')');
      err.status = res.status;
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

      // Disable mutating controls on #ownerScreen during read-only preview
      document.querySelectorAll('#ownerScreen button.primary, #ownerScreen #ownerEditProfileBtn, #ownerScreen #pagerCreateButton').forEach(function (b) {
        b.disabled = true;
        b.title = 'Disabled in read-only Admin Preview';
      });
    } catch (_e) {}
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
      supportBtn.textContent = '🛟 Support & issues';
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

    // Inject Owner Team Card & Restriction Notice container on #ownerScreen
    var ownerScreen = document.getElementById('ownerScreen');
    var ownerGrid = ownerScreen ? ownerScreen.querySelector('.owner-grid') : null;
    if (ownerScreen && !document.getElementById('ownerRestrictionNotice')) {
      var rNotice = document.createElement('div');
      rNotice.id = 'ownerRestrictionNotice';
      rNotice.className = 'owner-restriction-alert';
      rNotice.hidden = true;
      var statsBar = ownerScreen.querySelector('.owner-stats');
      if (statsBar) ownerScreen.insertBefore(rNotice, statsBar);
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
        '<div class="rx-modal-head"><div><small>VENDOR ONBOARDING &amp; OWNERSHIP</small><h2 id="vaModalTitle">Claim or Apply for a BiteShark Listing</h2></div><button type="button" class="rx-close" data-rx-close="vendorApplyModal">×</button></div>' +
        '<div class="rx-tabs">' +
        '<button type="button" class="rx-tab active" data-va-tab="status">My Applications</button>' +
        '<button type="button" class="rx-tab" data-va-tab="form">New / Edit Application</button>' +
        '</div>' +
        '<div id="vaStatusPane"></div>' +
        '<form id="vaFormPane" class="rx-form" hidden>' +
        '<input type="hidden" id="vaEditId">' +
        '<div class="rx-row-2">' +
        '<label>Application Type<select id="vaType"><option value="claim_existing">Claim existing curated listing</option><option value="new_listing">Propose new food spot</option></select></label>' +
        '<label id="vaTargetWrap">Curated Listing<select id="vaTargetVendor"><option value="">Select listing…</option></select></label>' +
        '<label id="vaSlugWrap" hidden>Proposed Listing ID (slug)<input type="text" id="vaProposedSlug" maxlength="64" placeholder="e.g. rosa-taco-cart"></label>' +
        '</div>' +
        '<div class="rx-row-2">' +
        '<label>Business Name<input type="text" id="vaBusinessName" required maxlength="120" placeholder="Official truck or stand name"></label>' +
        '<label>Primary Sonoma Town<input type="text" id="vaPrimaryTown" required maxlength="80" placeholder="e.g. Santa Rosa"></label>' +
        '</div>' +
        '<div class="rx-row-2">' +
        '<label>Category<input type="text" id="vaCategory" maxlength="60" value="Food Trucks"></label>' +
        '<label>Cuisine<input type="text" id="vaCuisine" maxlength="80" placeholder="e.g. Mexican, Coffee, Burgers"></label>' +
        '</div>' +
        '<div class="rx-row-2">' +
        '<label>Contact Name<input type="text" id="vaContactName" required maxlength="120" placeholder="Owner / manager name"></label>' +
        '<label>Contact Phone (optional)<input type="text" id="vaContactPhone" maxlength="40" placeholder="(707) 555-0199"></label>' +
        '</div>' +
        '<label>Business Website or Social Link (optional)<input type="url" id="vaWebsite" maxlength="300" placeholder="https://…"></label>' +
        '<label>Public Listing Summary<textarea id="vaSummary" rows="2" maxlength="500" placeholder="Short description of dishes and regular schedule…"></textarea></label>' +
        '<label>Ownership &amp; Permit Verification Statement<textarea id="vaStatement" rows="2" maxlength="1000" placeholder="Describe your business connection (e.g. health permit town, market stall, official website/Instagram)…"></textarea></label>' +
        '<label>Optional Supporting Evidence (PDF, PNG, JPEG, or WebP up to 512 KiB — do NOT upload SSNs or driver licenses)<input type="file" id="vaEvidenceFile" accept="application/pdf,image/png,image/jpeg,image/webp"></label>' +
        '<div id="vaFormMsg" class="rx-msg" hidden></div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
        '<button type="submit" class="primary" data-va-mode="submit">Submit for Admin Review →</button>' +
        '<button type="button" class="secondary" id="vaSaveDraftBtn">Save Draft</button>' +
        '</div>' +
        '</form>' +
        '</div></div>' +

        // 2. Support & Issues Modal
        '<div class="rx-modal-backdrop" id="supportIssuesModal" hidden>' +
        '<div class="rx-modal" role="dialog" aria-modal="true" aria-labelledby="siModalTitle">' +
        '<div class="rx-modal-head"><div><small>PRIVATE SUPPORT &amp; TRUST</small><h2 id="siModalTitle">Support &amp; Issue Tracker</h2></div><button type="button" class="rx-close" data-rx-close="supportIssuesModal">×</button></div>' +
        '<div class="rx-tabs">' +
        '<button type="button" class="rx-tab active" data-si-tab="list">My Issues</button>' +
        '<button type="button" class="rx-tab" data-si-tab="new">Report an Issue</button>' +
        '</div>' +
        '<div id="siListPane"></div>' +
        '<form id="siNewPane" class="rx-form" hidden>' +
        '<div class="rx-row-2">' +
        '<label>Category<select id="siCategory"><option value="booking_issue">Booking Issue</option><option value="pager_issue">Pickup Pager Issue</option><option value="listing_accuracy">Listing Accuracy</option><option value="vendor_dispute">Vendor Dispute</option><option value="safety_concern">Safety Concern</option><option value="abuse_report">Abuse Report</option><option value="account_access">Account / Access</option><option value="other">Other</option></select></label>' +
        '<label>Related Food Spot (optional)<select id="siVendorId"><option value="">None / General</option></select></label>' +
        '</div>' +
        '<label>Subject<input type="text" id="siSubject" required minlength="5" maxlength="160" placeholder="Brief summary of the issue"></label>' +
        '<label>Details<textarea id="siDescription" required minlength="15" maxlength="2500" rows="4" placeholder="Include relevant dates, order/inquiry context, and how we can help. Private issues are never posted publicly."></textarea></label>' +
        '<div id="siFormMsg" class="rx-msg" hidden></div>' +
        '<button type="submit" class="primary">Submit Private Support Issue →</button>' +
        '</form>' +
        '</div></div>' +

        // 3. Community Post Report Modal
        '<div class="rx-modal-backdrop" id="communityReportModal" hidden>' +
        '<div class="rx-modal" role="dialog" aria-modal="true" aria-labelledby="crModalTitle">' +
        '<div class="rx-modal-head"><div><small>COMMUNITY MODERATION</small><h2 id="crModalTitle">Report Community Post</h2></div><button type="button" class="rx-close" data-rx-close="communityReportModal">×</button></div>' +
        '<form id="crReportForm" class="rx-form">' +
        '<input type="hidden" id="crPostId">' +
        '<label>Reason<select id="crReason" required><option value="inaccurate">Inaccurate or misleading</option><option value="spam">Promotional spam</option><option value="harassment">Harassment or personal attack</option><option value="privacy">Private/personal info shared</option><option value="off_topic">Off-topic</option><option value="other">Other</option></select></label>' +
        '<label>Additional Context (optional)<textarea id="crDetails" rows="3" maxlength="800" placeholder="Help moderators review this submission…"></textarea></label>' +
        '<div id="crFormMsg" class="rx-msg" hidden></div>' +
        '<button type="submit" class="primary">Submit Report to Moderators →</button>' +
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
          document.getElementById(btn.dataset.rxClose).hidden = true;
        };
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
      document.getElementById('siNewPane').onsubmit = submitNewSupportIssue;
      document.getElementById('crReportForm').onsubmit = submitCommunityReport;
      document.getElementById('rxAgeModalForm').onsubmit = submitNextSignInAgeAssessment;
      document.getElementById('rxAgeSupportBtn').onclick = function () {
        document.getElementById('rxAgeAssessmentModal').hidden = true;
        openSupportIssuesModal();
        var catSel = document.getElementById('siCategory');
        if (catSel) catSel.value = 'account_access';
        switchSiTab('new');
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

  async function loadOwnerTeamMembers(vendorId) {
    var box = document.getElementById('ownerTeamList');
    if (!box || !vendorId) return;
    try {
      var data = await rxJson('/api/vendor/members?vendor_id=' + encodeURIComponent(vendorId));
      var members = Array.isArray(data.members) ? data.members : [];
      box.innerHTML = members.length
        ? '<strong>Current Members (' + rxEsc(vendorId) + '):</strong><ul style="margin:6px 0 0;padding-left:18px">' +
          members
            .map(function (m) {
              return '<li>' + rxEsc(m.email || m.user_id) + ' — <strong>' + rxEsc(m.role_label) + '</strong></li>';
            })
            .join('') +
          '</ul>'
        : 'No members found.';
    } catch (err) {
      box.textContent = err.message;
    }
  }

  async function submitVendorStaffInvite(e) {
    e.preventDefault();
    var vid = typeof ownerTruckId === 'string' ? ownerTruckId : '';
    var email = document.getElementById('ownerStaffEmail').value.trim();
    var note = document.getElementById('ownerStaffNote').value.trim();
    var msgEl = document.getElementById('ownerStaffInviteResult');
    msgEl.hidden = false;
    msgEl.className = 'rx-msg';
    msgEl.textContent = 'Creating single-use staff invitation…';

    try {
      var data = await rxJson('/api/vendor/staff-invitations', {
        method: 'POST',
        body: { vendor_id: vid, email: email, note: note }
      });
      var fullLink = window.location.origin + data.accept_path;
      msgEl.innerHTML = '✓ Staff invitation created for <strong>' + rxEsc(email) + '</strong>:<br><code>' + rxEsc(fullLink) + '</code>';
      document.getElementById('ownerStaffInviteForm').reset();
    } catch (err) {
      msgEl.className = 'rx-msg error';
      msgEl.textContent = err.message;
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
      b.classList.toggle('active', b.dataset.vaTab === tab);
    });
    document.getElementById('vaStatusPane').hidden = tab !== 'status';
    document.getElementById('vaFormPane').hidden = tab !== 'form';
    if (tab === 'status') loadMyVendorApplications();
  }

  async function openVendorApplyModal() {
    injectRoleNavigationAndModals();
    populateModalVendorSelects();
    document.getElementById('vendorApplyModal').hidden = false;
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
    msgEl.hidden = false;
    msgEl.className = 'rx-msg';
    msgEl.textContent = mode === 'submit' ? 'Submitting application…' : 'Saving draft…';

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

      // Save as draft first if uploading evidence before submitting
      var fileInput = document.getElementById('vaEvidenceFile');
      var file = fileInput && fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;

      if (file && mode === 'submit') {
        var draftOut = await rxJson('/api/onboarding/applications', {
          method: 'POST',
          body: Object.assign({}, payload, { action: 'save_draft' })
        });
        var appId = draftOut.application.id;
        payload.application_id = appId;
        var b64 = await readFileAsBase64(file);
        await rxJson('/api/onboarding/evidence', {
          method: 'POST',
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
        body: payload
      });

      if (file && mode !== 'submit') {
        var b64Draft = await readFileAsBase64(file);
        await rxJson('/api/onboarding/evidence', {
          method: 'POST',
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
      switchVaTab('status');
    } catch (err) {
      msgEl.className = 'rx-msg error';
      msgEl.textContent = err.message;
    }
  }

  // =========================================================================
  // 5. Private Customer & Vendor Support Issues
  // =========================================================================
  function switchSiTab(tab) {
    document.querySelectorAll('[data-si-tab]').forEach(function (b) {
      b.classList.toggle('active', b.dataset.siTab === tab);
    });
    document.getElementById('siListPane').hidden = tab !== 'list';
    document.getElementById('siNewPane').hidden = tab !== 'new';
    if (tab === 'list') loadMySupportIssues();
  }

  async function openSupportIssuesModal() {
    injectRoleNavigationAndModals();
    populateModalVendorSelects();
    document.getElementById('supportIssuesModal').hidden = false;
    if (!rxState.ctx || !rxState.ctx.authenticated) {
      document.getElementById('siListPane').innerHTML =
        '<div class="rx-card"><h3>Sign in required</h3><p>Sign in so our support team can respond privately to your account.</p><a class="primary" style="display:inline-block;text-decoration:none;padding:8px 14px;border-radius:9px" href="/login.html?next=/">Sign in →</a></div>';
      return;
    }
    switchSiTab('list');
  }

  async function loadMySupportIssues() {
    var pane = document.getElementById('siListPane');
    pane.innerHTML = '<p>Loading your support issues…</p>';
    try {
      var data = await rxJson('/api/issues');
      rxState.myIssues = Array.isArray(data.issues) ? data.issues : [];
      if (!rxState.myIssues.length) {
        pane.innerHTML =
          '<div class="rx-card"><h3>No open issues</h3><p>Need help with a booking inquiry, pickup pager, or listing question? Submit a private support ticket.</p><button type="button" class="primary" id="siOpenNewBtn">Report an Issue →</button></div>';
        document.getElementById('siOpenNewBtn').onclick = function () { switchSiTab('new'); };
        return;
      }
      pane.innerHTML = rxState.myIssues
        .map(function (iss) {
          return (
            '<div class="rx-card">' +
            '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center">' +
            '<h3>' + rxEsc(iss.subject) + '</h3>' +
            '<span class="rx-badge">' + rxEsc(iss.status) + '</span>' +
            '</div>' +
            '<small>' + rxEsc(iss.category) + ' · Submitted ' + rxDate(iss.created_at) + '</small>' +
            '<p style="margin:6px 0">' + rxEsc(iss.description) + '</p>' +
            (iss.resolution_reason ? '<div class="rx-msg"><strong>Resolution:</strong> ' + rxEsc(iss.resolution_reason) + '</div>' : '') +
            '<button type="button" class="secondary" data-si-thread="' + rxEsc(iss.id) + '" style="margin-top:6px">View Responses / Reply</button>' +
            '<div id="siThread-' + rxEsc(iss.id) + '" hidden style="margin-top:8px"></div>' +
            '</div>'
          );
        })
        .join('');

      pane.querySelectorAll('[data-si-thread]').forEach(function (btn) {
        btn.onclick = function () { loadSupportIssueThread(btn.dataset.siThread); };
      });
    } catch (err) {
      pane.innerHTML = '<div class="rx-msg error">' + rxEsc(err.message) + '</div>';
    }
  }

  async function loadSupportIssueThread(issueId) {
    var box = document.getElementById('siThread-' + issueId);
    if (!box) return;
    box.hidden = false;
    box.innerHTML = '<small>Loading responses…</small>';
    try {
      var data = await rxJson('/api/issues?issue_id=' + encodeURIComponent(issueId));
      var notes = Array.isArray(data.notes) ? data.notes : [];
      box.innerHTML =
        (notes.length
          ? notes
              .map(function (n) {
                return '<div class="rx-card" style="background:#f8f5ec"><small><strong>' + rxEsc(n.author_role) + '</strong> · ' + rxDate(n.created_at) + '</small><div>' + rxEsc(n.body) + '</div></div>';
              })
              .join('')
          : '<p><small>No responses yet.</small></p>') +
        '<form class="rx-form" data-si-reply="' + rxEsc(issueId) + '">' +
        '<input type="text" required minlength="2" maxlength="2000" placeholder="Write a reply…">' +
        '<button type="submit" class="secondary">Send Reply</button>' +
        '</form>';
      var form = box.querySelector('[data-si-reply]');
      form.onsubmit = async function (e) {
        e.preventDefault();
        var inp = form.querySelector('input');
        await rxJson('/api/issues/reply', { method: 'POST', body: { issue_id: issueId, message: inp.value.trim() } });
        loadSupportIssueThread(issueId);
      };
    } catch (err) {
      box.innerHTML = '<div class="rx-msg error">' + rxEsc(err.message) + '</div>';
    }
  }

  async function submitNewSupportIssue(e) {
    e.preventDefault();
    var msgEl = document.getElementById('siFormMsg');
    msgEl.hidden = false;
    msgEl.className = 'rx-msg';
    msgEl.textContent = 'Submitting issue…';
    try {
      await rxJson('/api/issues', {
        method: 'POST',
        body: {
          category: document.getElementById('siCategory').value,
          vendor_id: document.getElementById('siVendorId').value || null,
          subject: document.getElementById('siSubject').value.trim(),
          description: document.getElementById('siDescription').value.trim()
        }
      });
      document.getElementById('siNewPane').reset();
      msgEl.hidden = true;
      switchSiTab('list');
    } catch (err) {
      msgEl.className = 'rx-msg error';
      msgEl.textContent = err.message;
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
    document.getElementById('communityReportModal').hidden = false;
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
  // 7. Single-Use Invitation Redemption (`/#accept-invite=<token>`)
  // =========================================================================
  async function checkInviteRedemptionHash() {
    var h = String(window.location.hash || '');
    if (h.indexOf('#accept-invite=') !== 0) return;
    var token = decodeURIComponent(h.slice('#accept-invite='.length)).trim();
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
        vendor_name: data.vendor_name
      };
      if (!rxState.ctx || !rxState.ctx.authenticated) {
        var nextParam = encodeURIComponent('/#accept-invite=' + token);
        body.innerHTML =
          '<div class="rx-card">' +
          '<h3>Invited Role: ' + rxEsc(inv.role_label) + '</h3>' +
          '<p>Target Email: <strong>' + rxEsc(inv.masked_email) + '</strong>' +
          (inv.vendor_name ? ' · Vendor: <strong>' + rxEsc(inv.vendor_name) + '</strong>' : '') +
          '</p>' +
          '<p>Verify email ownership and minimum account age eligibility (<strong>14+</strong>) for <strong>' + rxEsc(inv.masked_email) + '</strong> before redeeming this invitation.</p>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">' +
          '<a class="primary" style="display:inline-block;text-decoration:none;padding:9px 15px;border-radius:9px" href="/login.html?mode=signup&amp;next=' + nextParam + '">Create Account (14+) &amp; Verify →</a>' +
          '<a class="secondary" style="display:inline-block;text-decoration:none;padding:9px 15px;border-radius:9px" href="/login.html?next=' + nextParam + '">Existing Account Sign In →</a>' +
          '</div>' +
          '</div>';
        return;
      }

      if (rxState.ctx.requires_age_assessment) {
        body.innerHTML =
          '<div class="rx-card">' +
          '<h3>Invited Role: ' + rxEsc(inv.role_label) + '</h3>' +
          '<p>Signed in as: <strong>' + rxEsc(rxState.ctx.user.email) + '</strong></p>' +
          '<p>Complete the one-time minimum account age check (<strong>14+</strong>) before accepting this invitation.</p>' +
          '<button type="button" class="primary" id="iaOpenAgeCheckBtn">Complete 14+ Age Check →</button>' +
          '</div>';
        document.getElementById('iaOpenAgeCheckBtn').onclick = function () {
          modal.hidden = true;
          var ageModal = document.getElementById('rxAgeAssessmentModal');
          if (ageModal) {
            document.getElementById('rxAgeModalEmail').textContent = rxState.ctx.user.email || '';
            ageModal.hidden = false;
            document.getElementById('rxAgeMonth').focus();
          }
        };
        return;
      }

      body.innerHTML =
        '<div class="rx-card">' +
        '<h3>Invited Role: ' + rxEsc(inv.role_label) + '</h3>' +
        '<p>Signed in as: <strong>' + rxEsc(rxState.ctx.user.email) + '</strong></p>' +
        (inv.vendor_name ? '<p>Vendor: <strong>' + rxEsc(inv.vendor_name) + '</strong></p>' : '') +
        '<div id="iaAcceptMsg" class="rx-msg" hidden style="margin-bottom:8px"></div>' +
        '<button type="button" class="primary" id="iaConfirmBtn">Accept Invitation →</button>' +
        '</div>';

      document.getElementById('iaConfirmBtn').onclick = async function () {
        var msg = document.getElementById('iaAcceptMsg');
        msg.hidden = false;
        msg.className = 'rx-msg';
        msg.textContent = 'Redeeming invitation…';
        try {
          await rxJson('/api/invitations/accept', { method: 'POST', body: { token: token } });
          window.location.hash = '';
          await refreshAccountRoleContext();
          msg.textContent = 'Invitation accepted! Your permissions are now active.';
          setTimeout(function () {
            modal.hidden = true;
            if (inv.requested_role === 'mod' || inv.requested_role === 'top') {
              window.location.href = '/admin';
            }
          }, 800);
        } catch (err) {
          msg.className = 'rx-msg error';
          msg.textContent = err.message;
        }
      };
    } catch (err) {
      body.innerHTML = '<div class="rx-msg error">' + rxEsc(err.message) + '</div>';
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
