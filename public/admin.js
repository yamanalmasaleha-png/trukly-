/* BiteShark Administration Portal Client (`public/admin.js`)
 *
 * Server-enforced RBAC (`Admin: Mod` vs `Admin: Top`):
 *   - All data and mutations flow through authenticated `/api/admin/*` routes.
 *   - Hidden or disabled UI controls are convenience affordances only; authorization is re-verified server-side.
 *   - Never reads, stores, or displays session tokens, OTPs, mailbox secrets, or passwords.
 */
(function () {
  'use strict';

  var VIEWPOINT_STORAGE_KEY = 'biteshark_admin_viewpoint_v1';

  var state = {
    ctx: null,
    isTop: false,
    isMod: false,
    activeSection: 'overview',
    catalogVendors: [],
    overview: null,
    apps: { page: 1, total: 0, pageSize: 15, items: [], selectedId: null },
    vendors: { page: 1, total: 0, pageSize: 15, items: [], selectedId: null, selectedDetail: null },
    invitations: { page: 1, total: 0, pageSize: 15, items: [] },
    accounts: { page: 1, total: 0, pageSize: 15, items: [], selectedId: null },
    acctTab: 'invitations',
    mod: { queue: 'pending', page: 1, total: 0, pageSize: 15, items: [], selectedId: null },
    issues: { page: 1, total: 0, pageSize: 15, items: [], selectedId: null, selectedDetail: null },
    readiness: { items: [], selectedKey: null, summary: null, statusesCatalog: [] },
    audit: { page: 1, total: 0, pageSize: 25, items: [] }
  };

  function esc(val) {
    return String(val == null ? '' : val).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fmtDate(val) {
    if (!val) return '—';
    var d = new Date(val);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function showBanner(msg, isError) {
    var el = document.getElementById('adminGlobalBanner');
    if (!el) return;
    if (!msg) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    el.hidden = false;
    el.textContent = msg;
    el.classList.toggle('is-error', Boolean(isError));
  }

  async function apiJson(url, opts) {
    var options = Object.assign(
      {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {}
      },
      opts || {}
    );
    if (options.body && typeof options.body === 'object') {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }
    var res = await fetch(url, options);
    var data = await res.json().catch(function () {
      return {};
    });
    if (res.status === 401) {
      window.location.href = '/login.html?next=%2Fadmin';
      throw new Error('Your session expired. Redirecting to sign in…');
    }
    if (res.status === 403 && data && data.code === 'AGE_ASSESSMENT_REQUIRED') {
      var targetNext = encodeURIComponent((window.location.pathname || '/admin') + (window.location.hash || ''));
      window.location.href = '/login.html?assess=1&next=' + targetNext;
      throw new Error('One-time minimum account age check (14+) is required before accessing the Admin Portal.');
    }
    if (!res.ok) {
      var err = new Error(data.error || 'Request failed (' + res.status + ')');
      err.status = res.status;
      err.code = data.code || null;
      throw err;
    }
    return data;
  }

  function renderPager(containerId, page, pageSize, total, onPage) {
    var el = document.getElementById(containerId);
    if (!el) return;
    var totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (total === 0) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.innerHTML =
      '<span>Showing page <strong>' +
      page +
      '</strong> of <strong>' +
      totalPages +
      '</strong> (' +
      total +
      ' total)</span>' +
      '<div class="action-row">' +
      '<button type="button" class="admin-btn admin-btn-secondary admin-btn-sm" data-pg="prev" ' +
      (page <= 1 ? 'disabled' : '') +
      '>← Prev</button>' +
      '<button type="button" class="admin-btn admin-btn-secondary admin-btn-sm" data-pg="next" ' +
      (page >= totalPages ? 'disabled' : '') +
      '>Next →</button>' +
      '</div>';
    var prevBtn = el.querySelector('[data-pg="prev"]');
    var nextBtn = el.querySelector('[data-pg="next"]');
    if (prevBtn) prevBtn.onclick = function () { if (page > 1) onPage(page - 1); };
    if (nextBtn) nextBtn.onclick = function () { if (page < totalPages) onPage(page + 1); };
  }

  function statusPill(status) {
    var s = String(status || '').toLowerCase();
    var cls = 'pill';
    if (['approved', 'approved_owner', 'active', 'issued', 'accepted', 'resolved', 'ok'].indexOf(s) >= 0) cls += ' pill-ok';
    else if (['submitted', 'needs_info', 'pending', 'pending_review', 'pending_top_approval', 'in_progress', 'waiting'].indexOf(s) >= 0) cls += ' pill-warn';
    else if (['rejected', 'suspended', 'hidden', 'revoked', 'overdue', 'urgent'].indexOf(s) >= 0) cls += ' pill-danger';
    else cls += ' pill-info';
    return '<span class="' + cls + '">' + esc(status) + '</span>';
  }

  // =========================================================================
  // Initialization & Viewpoint Switcher
  // =========================================================================
  async function loadVendorSelectorCatalog() {
    try {
      var data = await apiJson('/api/admin/vendors?page=1&page_size=50');
      state.catalogVendors = Array.isArray(data.vendors) ? data.vendors : [];
      var vpSel = document.getElementById('vpVendorSelect');
      var invSel = document.getElementById('invVendorId');
      var optsHtml =
        '<option value="">Select vendor…</option>' +
        state.catalogVendors
          .map(function (v) {
            return '<option value="' + esc(v.id) + '">' + esc(v.display_name) + ' (' + esc(v.town || v.id) + ')</option>';
          })
          .join('');
      if (vpSel) vpSel.innerHTML = optsHtml;
      if (invSel) invSel.innerHTML = optsHtml;
    } catch (_e) {
      // Non-fatal selector warmup
    }
  }

  function saveViewpointSession(payload) {
    try {
      if (!payload) sessionStorage.removeItem(VIEWPOINT_STORAGE_KEY);
      else sessionStorage.setItem(VIEWPOINT_STORAGE_KEY, JSON.stringify(payload));
    } catch (_e) {}
  }

  function launchCustomerPreview() {
    saveViewpointSession({
      mode: 'customer_preview',
      readOnly: true,
      startedAt: new Date().toISOString()
    });
    window.location.href = '/?viewpoint=customer';
  }

  function launchVendorPreview(vendorId) {
    var vid = vendorId || document.getElementById('vpVendorSelect').value;
    if (!vid) {
      showBanner('Choose a vendor in the Viewpoint selector before opening Vendor Preview.', true);
      return;
    }
    saveViewpointSession({
      mode: 'vendor_preview',
      vendorId: vid,
      readOnly: true,
      startedAt: new Date().toISOString()
    });
    window.location.href = '/?viewpoint=vendor&vendor_id=' + encodeURIComponent(vid);
  }

  function openActOnBehalfModal(vendorId) {
    if (!state.isTop) {
      showBanner('Only Admin: Top may enter Act-on-Behalf operational support mode.', true);
      return;
    }
    var vid = vendorId || document.getElementById('vpVendorSelect').value;
    if (!vid) {
      showBanner('Select a target vendor first before starting Act-on-Behalf mode.', true);
      return;
    }
    var vendorObj = state.catalogVendors.find(function (v) { return v.id === vid; });
    var modal = document.getElementById('aobModal');
    modal.dataset.vendorId = vid;
    document.getElementById('aobVendorDisplay').value = vendorObj ? vendorObj.display_name + ' (' + vid + ')' : vid;
    document.getElementById('aobReasonInput').value = '';
    document.getElementById('aobError').hidden = true;
    modal.hidden = false;
  }

  function switchSection(sectionName, subfilter) {
    state.activeSection = sectionName;
    showBanner('', false);
    document.querySelectorAll('.admin-nav-item').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.section === sectionName);
    });
    document.querySelectorAll('.admin-section').forEach(function (sec) {
      var match = sec.id === 'sec-' + sectionName;
      sec.hidden = !match;
      sec.classList.toggle('active', match);
    });

    if (sectionName === 'overview') loadOverview();
    else if (sectionName === 'applications') loadApplications(1);
    else if (sectionName === 'vendors') {
      if (subfilter === 'restricted') document.getElementById('vendorsStatusFilter').value = 'restricted';
      loadVendors(1);
    } else if (sectionName === 'accounts') {
      if (subfilter === 'pending_top_approval') {
        switchAccountsSubtab('invitations');
        document.getElementById('invStatusFilter').value = 'pending_top_approval';
      }
      if (state.acctTab === 'invitations') loadInvitations(1);
      else loadAccounts(1);
    } else if (sectionName === 'moderation') loadModeration(1);
    else if (sectionName === 'issues') loadIssues(1);
    else if (sectionName === 'readiness') loadReadiness();
    else if (sectionName === 'audit') loadAudit(1);
    else if (sectionName === 'health') loadHealth();
  }

  // =========================================================================
  // 1. Overview
  // =========================================================================
  async function loadOverview() {
    var loadingEl = document.getElementById('overviewLoading');
    var errEl = document.getElementById('overviewError');
    var cardsEl = document.getElementById('overviewCards');
    loadingEl.hidden = false;
    errEl.hidden = true;

    try {
      var data = await apiJson('/api/admin/overview');
      state.overview = data;
      var c = data.counts || {};
      var h = data.operational_health || {};
      var q = h.outbox_queue || {};

      document.getElementById('ovPendingApps').textContent = String(c.pending_applications || 0);
      document.getElementById('ovModRecApps').textContent = (c.mod_recommended_applications || 0) + ' with Mod recommendation';
      document.getElementById('ovPendingInvites').textContent = String(c.pending_privileged_invitations || 0);
      document.getElementById('ovFlaggedComments').textContent = String((c.pending_comments || 0) + (c.reported_comments || 0));
      document.getElementById('ovCommentsBreakdown').textContent =
        (c.pending_comments || 0) + ' pending · ' + (c.reported_comments || 0) + ' user-reported';
      document.getElementById('ovOpenIssues').textContent = String(c.open_issues || 0);
      document.getElementById('ovOverdueIssues').textContent = (c.overdue_issues || 0) + ' overdue SLA';
      document.getElementById('ovRestrictedVendors').textContent = String(c.restricted_vendors || 0);
      document.getElementById('ovVendorsBreakdown').textContent =
        (c.suspended_vendors || 0) + ' suspended · ' + (c.restricted_vendors || 0) + ' restricted';

      var healthHeadline = h.write_pause && h.write_pause.active ? 'Writes Paused' : 'Healthy · Push ' + (h.push_provider_mode || 'disabled');
      document.getElementById('ovHealthStatus').textContent = healthHeadline;
      document.getElementById('ovHealthSub').textContent =
        (q.pending || 0) + ' queued · ' + (q.retrying || 0) + ' retrying · ' + (q.dead_letter || 0) + ' dead-letter';

      var lr = data.launch_readiness || {};
      var unresCrit = Number(c.unresolved_launch_critical != null ? c.unresolved_launch_critical : lr.unresolved_launch_critical) || 0;
      var needsReRev = Number(c.needs_re_review_items != null ? c.needs_re_review_items : lr.needs_re_review_count) || 0;
      var ovUnresEl = document.getElementById('ovUnresolvedReadiness');
      var ovReadSubEl = document.getElementById('ovReadinessSub');
      if (ovUnresEl) ovUnresEl.textContent = String(unresCrit);
      if (ovReadSubEl) {
        ovReadSubEl.textContent =
          needsReRev > 0
            ? needsReRev + ' needs re-review · ' + (lr.legally_approved_count || 0) + ' approved'
            : (lr.legally_approved_count || 0) + ' scoped approvals · Drafts pending';
      }

      var remBanner = document.getElementById('adminLaunchReminderBanner');
      if (remBanner) {
        // Prominent Top-admin governance reminder while launch readiness remains incomplete
        var showReminder = state.isTop && lr.launch_ready !== true;
        remBanner.hidden = !showReminder;
        if (showReminder && lr.reminder_banner) {
          document.getElementById('launchReminderHeadline').textContent = lr.reminder_banner;
        }
      }

      setNavBadge('badgeApplications', c.pending_applications || 0);
      setNavBadge('badgeVendors', c.restricted_vendors || 0);
      setNavBadge('badgeInvitations', c.pending_privileged_invitations || 0);
      setNavBadge('badgeModeration', (c.pending_comments || 0) + (c.reported_comments || 0));
      setNavBadge('badgeIssues', c.open_issues || 0);
      setNavBadge('badgeReadiness', unresCrit);

      loadingEl.hidden = true;
      cardsEl.hidden = false;
    } catch (err) {
      loadingEl.hidden = true;
      errEl.hidden = false;
      errEl.textContent = err.message;
    }
  }

  function setNavBadge(id, count) {
    var el = document.getElementById(id);
    if (!el) return;
    if (count > 0) {
      el.hidden = false;
      el.textContent = String(count);
    } else {
      el.hidden = true;
    }
  }

  // =========================================================================
  // 2. Vendor Applications
  // =========================================================================
  async function loadApplications(page) {
    state.apps.page = page || 1;
    var listState = document.getElementById('appsListState');
    var listEl = document.getElementById('appsList');
    listState.hidden = false;
    listState.className = 'state-box';
    listState.textContent = 'Loading vendor applications…';
    listEl.hidden = true;

    var statusVal = document.getElementById('appsStatusFilter').value;
    var recVal = document.getElementById('appsRecFilter').value;
    var qVal = document.getElementById('appsSearchInput').value.trim();

    var qs = new URLSearchParams({
      page: String(state.apps.page),
      page_size: String(state.apps.pageSize),
      status: statusVal
    });
    if (recVal) qs.set('recommendation', recVal);
    if (qVal) qs.set('q', qVal);

    try {
      var data = await apiJson('/api/admin/applications?' + qs.toString());
      state.apps.items = Array.isArray(data.applications) ? data.applications : [];
      state.apps.total = Number(data.total) || 0;

      if (!state.apps.items.length) {
        listState.textContent = 'No vendor applications match the current filters.';
        renderPager('appsPager', 1, state.apps.pageSize, 0, loadApplications);
        return;
      }

      listState.hidden = true;
      listEl.hidden = false;
      listEl.innerHTML = state.apps.items
        .map(function (app) {
          var isSel = state.apps.selectedId === app.id;
          var conflictBadge =
            Number(app.open_conflict_claims) > 0
              ? ' <span class="pill pill-danger">⚠ ' + Number(app.open_conflict_claims) + ' conflict(s)</span>'
              : '';
          var recBadge = app.mod_recommendation
            ? ' <span class="pill pill-mod">Mod: ' + esc(app.mod_recommendation) + '</span>'
            : '';
          return (
            '<button type="button" class="record-card' +
            (isSel ? ' selected' : '') +
            '" data-app-id="' +
            esc(app.id) +
            '">' +
            '<div class="record-card-top"><span class="record-title">' +
            esc(app.business_name) +
            '</span><span>' +
            statusPill(app.status) +
            recBadge +
            conflictBadge +
            '</span></div>' +
            '<div class="record-meta">' +
            (app.application_type === 'claim_existing'
              ? 'Claiming listing: <strong>' + esc(app.existing_vendor_name || app.target_vendor_id) + '</strong>'
              : 'New listing proposal: <code>' + esc(app.proposed_slug || 'auto') + '</code>') +
            ' · ' +
            esc(app.primary_town) +
            '</div>' +
            '<div class="record-meta">Applicant: ' +
            esc(app.applicant_email) +
            ' · Updated ' +
            fmtDate(app.updated_at) +
            '</div>' +
            '</button>'
          );
        })
        .join('');

      listEl.querySelectorAll('[data-app-id]').forEach(function (btn) {
        btn.onclick = function () {
          state.apps.selectedId = btn.dataset.appId;
          loadApplications(state.apps.page);
          renderApplicationDetail();
        };
      });

      renderPager('appsPager', state.apps.page, state.apps.pageSize, state.apps.total, loadApplications);
      if (state.apps.selectedId) renderApplicationDetail();
    } catch (err) {
      listState.className = 'state-box state-error';
      listState.textContent = err.message;
    }
  }

  function renderApplicationDetail() {
    var pane = document.getElementById('appsDetailPane');
    var app = state.apps.items.find(function (a) { return a.id === state.apps.selectedId; });
    if (!app) {
      pane.innerHTML = '<div class="empty-detail">Select a vendor application from the queue to review details.</div>';
      return;
    }

    var evidenceList = Array.isArray(app.evidence) ? app.evidence : [];
    var conflictHtml = '';
    if (Number(app.open_conflict_claims) > 0 || app.existing_ownership_status === 'approved_owner') {
      conflictHtml =
        '<div class="conflict-callout">⚠ Ownership Conflict Alert: ' +
        (app.existing_ownership_status === 'approved_owner' && app.status !== 'approved'
          ? 'Target listing "' + esc(app.target_vendor_id) + '" already has an approved owner! '
          : '') +
        (Number(app.open_conflict_claims) > 0
          ? Number(app.open_conflict_claims) + ' competing active ownership claim(s) exist for this canonical vendor ID.'
          : '') +
        '</div>';
    }

    var evidenceHtml = evidenceList.length
      ? '<div class="thread-list">' +
        evidenceList
          .map(function (ev) {
            return (
              '<div class="thread-item">' +
              '<strong>📎 ' +
              esc(ev.original_filename) +
              '</strong> <span class="pill">' +
              esc(ev.evidence_kind) +
              '</span> <small>(' +
              Math.ceil((Number(ev.byte_length) || 0) / 1024) +
              ' KiB · Retain until ' +
              fmtDate(ev.retention_expires_at) +
              ')</small>' +
              '<div><a class="admin-btn admin-btn-secondary admin-btn-sm" href="/api/onboarding/evidence?id=' +
              encodeURIComponent(ev.id) +
              '" target="_blank" rel="noopener">Inspect Evidence ↗</a></div>' +
              '</div>'
            );
          })
          .join('') +
        '</div>'
      : '<p class="record-meta">No supporting evidence files uploaded yet.</p>';

    var topButtons = state.isTop
      ? '<button type="button" class="admin-btn admin-btn-primary" data-app-act="approve">✓ Approve Ownership (Top)</button>' +
        '<button type="button" class="admin-btn admin-btn-danger" data-app-act="reject">✕ Reject Application (Top)</button>' +
        '<button type="button" class="admin-btn admin-btn-danger" data-app-act="suspend">⏸ Suspend Claim (Top)</button>'
      : '<div class="policy-callout"><strong>Admin: Mod Review Scope:</strong> You can request applicant corrections or record an approval/rejection recommendation. Final vendor ownership approval is performed by <strong>Admin: Top</strong>.</div>';

    pane.innerHTML =
      '<div class="detail-head">' +
      '<div>' +
      statusPill(app.status) +
      (app.mod_recommendation ? ' <span class="pill pill-mod">Mod Rec: ' + esc(app.mod_recommendation) + '</span>' : '') +
      '</div>' +
      '<h2>' +
      esc(app.business_name) +
      '</h2>' +
      '<div class="record-meta">Application ID: <code>' +
      esc(app.id) +
      '</code> · Submitted ' +
      fmtDate(app.submitted_at || app.created_at) +
      '</div>' +
      '</div>' +
      conflictHtml +
      '<div class="kv-grid">' +
      '<div><strong>Type</strong>' +
      esc(app.application_type) +
      '</div>' +
      '<div><strong>Target / Proposed ID</strong><code>' +
      esc(app.target_vendor_id || app.proposed_slug || '—') +
      '</code></div>' +
      '<div><strong>Applicant Email</strong>' +
      esc(app.applicant_email) +
      '</div>' +
      '<div><strong>Contact Name &amp; Phone</strong>' +
      esc(app.contact_name) +
      (app.contact_phone ? ' · ' + esc(app.contact_phone) : '') +
      '</div>' +
      '<div><strong>Category &amp; Cuisine</strong>' +
      esc(app.category) +
      ' · ' +
      esc(app.cuisine) +
      '</div>' +
      '<div><strong>Primary Town &amp; Service Area</strong>' +
      esc(app.primary_town) +
      (Array.isArray(app.service_towns) && app.service_towns.length ? ' (' + esc(app.service_towns.join(', ')) + ')' : '') +
      '</div>' +
      '<div><strong>Website</strong>' +
      (app.website_url ? '<a href="' + esc(app.website_url) + '" target="_blank" rel="noopener">' + esc(app.website_url) + '</a>' : '—') +
      '</div>' +
      '<div><strong>Last Decision</strong>' +
      (app.decision_reason ? esc(app.decision_reason) + ' (' + fmtDate(app.decided_at) + ')' : 'Pending') +
      '</div>' +
      '</div>' +
      (app.Ownership_summary || app.public_summary
        ? '<p><strong>Summary:</strong> ' + esc(app.public_summary) + '</p>'
        : '') +
      (app.ownership_statement
        ? '<p><strong>Ownership Statement:</strong> ' + esc(app.ownership_statement) + '</p>'
        : '') +
      '<h3>Supporting Evidence (' +
      evidenceList.length +
      ')</h3>' +
      evidenceHtml +
      '<div class="admin-form">' +
      '<label>🔒 Internal Admin Notes (Confidential — never shown to applicant)' +
      '<textarea id="appInternalNotes" rows="2" maxlength="2000" placeholder="Internal verification notes for Mod/Top reviewers…">' +
      esc(app.internal_notes || '') +
      '</textarea></label>' +
      '<label>💬 Applicant-Visible Feedback (Shown to applicant on status page)' +
      '<textarea id="appApplicantFeedback" rows="2" maxlength="1200" placeholder="Clear instructions if requesting info or explaining decision…">' +
      esc(app.applicant_feedback || '') +
      '</textarea></label>' +
      '<label>Decision / Recommendation Reason (required, 4–800 characters)' +
      '<input type="text" id="appDecisionReason" maxlength="800" placeholder="Document verification basis or reason…">' +
      '</label>' +
      '<div class="action-row">' +
      '<button type="button" class="admin-btn admin-btn-warn" data-app-act="request_info">↩ Request More Information</button>' +
      '<button type="button" class="admin-btn admin-btn-secondary" data-app-act="recommend_approve">👍 Recommend Approval</button>' +
      '<button type="button" class="admin-btn admin-btn-secondary" data-app-act="recommend_reject">👎 Recommend Reject</button>' +
      '<button type="button" class="admin-btn admin-btn-secondary" data-app-act="save_internal_note">💾 Save Internal Note</button>' +
      '</div>' +
      '<div class="action-row">' +
      topButtons +
      '</div>' +
      '</div>';

    pane.querySelectorAll('[data-app-act]').forEach(function (btn) {
      btn.onclick = function () {
        submitApplicationDecision(app, btn.dataset.appAct);
      };
    });
  }

  async function submitApplicationDecision(app, action) {
    var reason = document.getElementById('appDecisionReason').value.trim();
    var internalNotes = document.getElementById('appInternalNotes').value.trim();
    var applicantFeedback = document.getElementById('appApplicantFeedback').value.trim();

    if (action !== 'save_internal_note' && reason.length < 4) {
      showBanner('Enter a decision or recommendation reason (at least 4 characters).', true);
      return;
    }

    try {
      await apiJson('/api/admin/applications/decision', {
        method: 'POST',
        body: {
          application_id: app.id,
          action: action,
          reason: reason || 'Internal note updated',
          internal_notes: internalNotes,
          applicant_feedback: applicantFeedback,
          expected_updated_at: app.updated_at
        }
      });
      showBanner('Application "' + app.business_name + '" updated (' + action + ').', false);
      await loadApplications(state.apps.page);
      loadOverview();
      loadVendorSelectorCatalog();
    } catch (err) {
      showBanner(err.message, true);
    }
  }

  // =========================================================================
  // 3. Vendor Directory & Restrictions
  // =========================================================================
  async function loadVendors(page) {
    state.vendors.page = page || 1;
    var listState = document.getElementById('vendorsListState');
    var listEl = document.getElementById('vendorsList');
    listState.hidden = false;
    listState.className = 'state-box';
    listState.textContent = 'Loading vendor directory…';
    listEl.hidden = true;

    var qs = new URLSearchParams({
      page: String(state.vendors.page),
      page_size: String(state.vendors.pageSize),
      status: document.getElementById('vendorsStatusFilter').value,
      ownership: document.getElementById('vendorsOwnershipFilter').value,
      verified: document.getElementById('vendorsVerifiedFilter').value
    });
    var town = document.getElementById('vendorsTownFilter').value.trim();
    var q = document.getElementById('vendorsSearchInput').value.trim();
    if (town) qs.set('town', town);
    if (q) qs.set('q', q);

    try {
      var data = await apiJson('/api/admin/vendors?' + qs.toString());
      state.vendors.items = Array.isArray(data.vendors) ? data.vendors : [];
      state.vendors.total = Number(data.total) || 0;

      if (!state.vendors.items.length) {
        listState.textContent = 'No vendors match the selected filters.';
        renderPager('vendorsPager', 1, state.vendors.pageSize, 0, loadVendors);
        return;
      }

      listState.hidden = true;
      listEl.hidden = false;
      listEl.innerHTML = state.vendors.items
        .map(function (v) {
          var eff = v.effective_restrictions || {};
          var anyRestr =
            eff.hidden_from_discovery ||
            eff.bookings_restricted ||
            eff.vendor_access_suspended ||
            eff.pager_restricted ||
            !v.is_active;
          var isSel = state.vendors.selectedId === v.id;
          return (
            '<button type="button" class="record-card' +
            (isSel ? ' selected' : '') +
            '" data-vid="' +
            esc(v.id) +
            '">' +
            '<div class="record-card-top"><span class="record-title">' +
            esc(v.display_name) +
            '</span><span>' +
            statusPill(v.ownership_status) +
            (v.verified_status ? ' <span class="pill pill-ok">✓ Verified</span>' : '') +
            (anyRestr ? ' <span class="pill pill-danger">Restricted</span>' : '') +
            '</span></div>' +
            '<div class="record-meta"><code>' +
            esc(v.id) +
            '</code> · ' +
            esc(v.town || 'Sonoma County') +
            ' · ' +
            esc(v.category || '') +
            '</div>' +
            '<div class="record-meta">Open bookings: <strong>' +
            Number(v.open_bookings_count || 0) +
            '</strong> · Active pagers: <strong>' +
            Number(v.active_pagers_count || 0) +
            '</strong></div>' +
            '</button>'
          );
        })
        .join('');

      listEl.querySelectorAll('[data-vid]').forEach(function (btn) {
        btn.onclick = function () {
          selectVendorForDetail(btn.dataset.vid);
        };
      });

      renderPager('vendorsPager', state.vendors.page, state.vendors.pageSize, state.vendors.total, loadVendors);
      if (state.vendors.selectedId) selectVendorForDetail(state.vendors.selectedId);
    } catch (err) {
      listState.className = 'state-box state-error';
      listState.textContent = err.message;
    }
  }

  async function selectVendorForDetail(vendorId) {
    state.vendors.selectedId = vendorId;
    document.querySelectorAll('#vendorsList [data-vid]').forEach(function (b) {
      b.classList.toggle('selected', b.dataset.vid === vendorId);
    });
    var pane = document.getElementById('vendorsDetailPane');
    pane.innerHTML = '<div class="state-box">Loading vendor details &amp; customer impact…</div>';

    try {
      var detail = await apiJson('/api/admin/vendor-preview?vendor_id=' + encodeURIComponent(vendorId));
      state.vendors.selectedDetail = detail;
      renderVendorDetail(detail);
    } catch (err) {
      pane.innerHTML = '<div class="state-box state-error">' + esc(err.message) + '</div>';
    }
  }

  function renderVendorDetail(detail) {
    var pane = document.getElementById('vendorsDetailPane');
    var v = detail.vendor || {};
    var eff = v.effective_restrictions || {};
    var impact = detail.customer_impact || { open_bookings: 0, active_pagers: 0 };
    var history = Array.isArray(detail.status_history) ? detail.status_history : [];
    var members = Array.isArray(detail.members) ? detail.members : [];

    var memberText = members.length
      ? members.map(function (m) { return esc(m.email || m.user_id) + ' (' + esc(m.role) + ')'; }).join(', ')
      : 'None (Unclaimed curated directory listing)';

    var historyHtml = history.length
      ? '<div class="thread-list">' +
        history
          .slice(0, 8)
          .map(function (h) {
            return (
              '<div class="thread-item">' +
              '<strong>' +
              esc(h.action) +
              '</strong> <span class="pill">' +
              esc(h.actor_role) +
              '</span> · <small>' +
              fmtDate(h.created_at) +
              '</small>' +
              '<div>Reason: ' +
              esc(h.reason) +
              '</div></div>'
            );
          })
          .join('') +
        '</div>'
      : '<p class="record-meta">No administrative status changes recorded yet.</p>';

    var topManageHtml = state.isTop
      ? '<form class="admin-form" id="topVendorEditForm">' +
        '<h3>Admin: Top — Profile, Eligibility &amp; Permanent Restriction Controls</h3>' +
        '<div class="form-row-2">' +
        '<label>Display Name<input type="text" id="veDisplayName" value="' + esc(v.display_name) + '" required maxlength="120"></label>' +
        '<label>Town<input type="text" id="veTown" value="' + esc(v.town || '') + '" maxlength="80"></label>' +
        '</div>' +
        '<div class="form-row-2">' +
        '<label>Category<input type="text" id="veCategory" value="' + esc(v.category || '') + '" maxlength="60"></label>' +
        '<label>Cuisine<input type="text" id="veCuisine" value="' + esc(v.cuisine || '') + '" maxlength="80"></label>' +
        '</div>' +
        '<div class="form-row-2">' +
        '<label>Hours Summary<input type="text" id="veHours" value="' + esc(v.hours_summary || '') + '" maxlength="200"></label>' +
        '<label>Website URL<input type="url" id="veWebsite" value="' + esc(v.website_url || '') + '" maxlength="300"></label>' +
        '</div>' +
        '<label>Listing Bio / Summary<textarea id="veSummary" rows="2" maxlength="500">' + esc(v.summary || '') + '</textarea></label>' +
        '<h4>Feature Eligibility &amp; Verification</h4>' +
        '<div class="check-grid">' +
        '<label class="check-item"><input type="checkbox" id="veIsActive" ' + (v.is_active ? 'checked' : '') + '><span><strong>Listing Active</strong><br><small>Master catalog visibility</small></span></label>' +
        '<label class="check-item"><input type="checkbox" id="veBookingEnabled" ' + (v.booking_enabled ? 'checked' : '') + '><span><strong>Booking Feature Eligible</strong><br><small>Platform catering eligibility</small></span></label>' +
        '<label class="check-item"><input type="checkbox" id="veAcceptingBookings" ' + (v.accepting_bookings ? 'checked' : '') + '><span><strong>Accepting Bookings</strong><br><small>Owner booking toggle</small></span></label>' +
        '<label class="check-item"><input type="checkbox" id="veVerified" ' + (v.verified_status ? 'checked' : '') + '><span><strong>Field Verified</strong><br><small>Independent BiteShark verification</small></span></label>' +
        '<label class="check-item"><input type="checkbox" id="vePhotoRights" ' + (v.photo_rights_confirmed ? 'checked' : '') + '><span><strong>Photo Rights Confirmed</strong><br><small>Verified image license</small></span></label>' +
        '</div>' +
        '<h4>Granular Restrictions (Customer-Safe Policy)</h4>' +
        '<div class="check-grid">' +
        '<label class="check-item"><input type="checkbox" id="veHiddenDiscovery" ' + (eff.hidden_from_discovery ? 'checked' : '') + '><span><strong>1. Hidden from Discovery</strong><br><small>Removes from public map/list; keeps existing customer bookings &amp; active pagers accessible</small></span></label>' +
        '<label class="check-item"><input type="checkbox" id="veBookingsRestr" ' + (eff.bookings_restricted ? 'checked' : '') + '><span><strong>2. Not Accepting New Bookings</strong><br><small>Blocks new inquiries; preserves existing pending/accepted customer bookings</small></span></label>' +
        '<label class="check-item"><input type="checkbox" id="veAccessSusp" ' + (eff.vendor_access_suspended ? 'checked' : '') + '><span><strong>3. Vendor Account Access Suspended</strong><br><small>Blocks owner/staff dashboard mutations; existing customer records stay visible</small></span></label>' +
        '<label class="check-item"><input type="checkbox" id="vePagerRestr" ' + (eff.pager_restricted ? 'checked' : '') + '><span><strong>4. Pager Creation Restricted</strong><br><small>Blocks new pickup pagers; active tickets can still be marked ready/completed</small></span></label>' +
        '<label class="check-item"><input type="checkbox" id="veNeedsCorrection" ' + (eff.needs_info_correction ? 'checked' : '') + '><span><strong>5. Listing Needs Correction</strong><br><small>Flags listing accuracy notice for owner</small></span></label>' +
        '</div>' +
        '<label>Correction Note (optional)<input type="text" id="veCorrectionNote" value="' + esc(eff.correction_note || '') + '" maxlength="500"></label>' +
        '<label>Audit Reason (required, 4–600 characters)<input type="text" id="veTopReason" required minlength="4" maxlength="600" placeholder="Required reason for profile, eligibility, or restriction update"></label>' +
        '<div class="action-row">' +
        '<button type="submit" class="admin-btn admin-btn-primary">Save Vendor Changes (Top)</button>' +
        '<button type="button" class="admin-btn admin-btn-secondary" id="veClearRestrBtn">✓ Clear All Restrictions &amp; Reactivate</button>' +
        '</div>' +
        '</form>'
      : '';

    pane.innerHTML =
      '<div class="detail-head">' +
      '<div class="record-card-top">' +
      '<span>' +
      statusPill(v.ownership_status) +
      (v.verified_status ? ' <span class="pill pill-ok">✓ Verified</span>' : ' <span class="pill">Unverified</span>') +
      '</span>' +
      '<div class="action-row">' +
      '<button type="button" class="admin-btn admin-btn-secondary admin-btn-sm" id="detailPreviewVendorBtn">🚚 Preview Vendor View</button>' +
      (state.isTop
        ? '<button type="button" class="admin-btn admin-btn-danger admin-btn-sm" id="detailActVendorBtn">🔧 Act on Behalf</button>'
        : '') +
      '</div></div>' +
      '<h2>' +
      esc(v.display_name) +
      '</h2>' +
      '<div class="record-meta">Canonical ID: <code>' +
      esc(v.id) +
      '</code> · Members: ' +
      memberText +
      '</div>' +
      '</div>' +
      '<div class="impact-callout">' +
      '<strong>Customer Impact Check:</strong> <strong>' +
      Number(impact.open_bookings || 0) +
      '</strong> open customer booking(s) · <strong>' +
      Number(impact.active_pagers || 0) +
      '</strong> active pickup pager(s).<br>' +
      '<small>Restrictions never erase customer booking history or strand active pickup tickets.</small>' +
      '</div>' +
      '<form class="admin-form" id="modTempRestrForm">' +
      '<h3>Temporary Safety Restriction (Admin: Mod &amp; Top · Max 72h)</h3>' +
      '<div class="check-grid">' +
      '<label class="check-item"><input type="checkbox" id="mtHidden" ' + (eff.hidden_from_discovery ? 'checked' : '') + '><span>Hide from discovery</span></label>' +
      '<label class="check-item"><input type="checkbox" id="mtBookings" ' + (eff.bookings_restricted ? 'checked' : '') + '><span>Pause new bookings</span></label>' +
      '<label class="check-item"><input type="checkbox" id="mtPagers" ' + (eff.pager_restricted ? 'checked' : '') + '><span>Pause new pagers</span></label>' +
      '<label class="check-item"><input type="checkbox" id="mtCorrection" ' + (eff.needs_info_correction ? 'checked' : '') + '><span>Flag needs info correction</span></label>' +
      '</div>' +
      '<div class="form-row-2">' +
      '<label>Duration (Hours, 1–72)<input type="number" id="mtDurationHours" min="1" max="72" value="24" required></label>' +
      '<label>Correction Note<input type="text" id="mtCorrectionNote" maxlength="500" placeholder="What needs verification or correction?"></label>' +
      '</div>' +
      '<label>Safety Restriction Reason (required)<input type="text" id="mtReason" required minlength="4" maxlength="600" placeholder="Document urgent safety or accuracy issue…"></label>' +
      '<div class="action-row"><button type="submit" class="admin-btn admin-btn-warn">⏱ Apply Temporary Safety Hold</button></div>' +
      '</form>' +
      topManageHtml +
      '<div class="admin-form"><h3>Vendor Status &amp; Restriction History</h3>' +
      historyHtml +
      '</div>';

    document.getElementById('detailPreviewVendorBtn').onclick = function () {
      launchVendorPreview(v.id);
    };
    var actBtn = document.getElementById('detailActVendorBtn');
    if (actBtn) {
      actBtn.onclick = function () {
        openActOnBehalfModal(v.id);
      };
    }

    document.getElementById('modTempRestrForm').onsubmit = async function (e) {
      e.preventDefault();
      try {
        await apiJson('/api/admin/vendors/update', {
          method: 'POST',
          body: {
            vendor_id: v.id,
            operation: 'mod_temp_restriction',
            hidden_from_discovery: document.getElementById('mtHidden').checked,
            bookings_restricted: document.getElementById('mtBookings').checked,
            pager_restricted: document.getElementById('mtPagers').checked,
            needs_info_correction: document.getElementById('mtCorrection').checked,
            duration_hours: Number(document.getElementById('mtDurationHours').value) || 24,
            correction_note: document.getElementById('mtCorrectionNote').value.trim(),
            reason: document.getElementById('mtReason').value.trim()
          }
        });
        showBanner('Temporary safety restriction applied to "' + v.display_name + '".', false);
        await loadVendors(state.vendors.page);
        loadOverview();
      } catch (err) {
        showBanner(err.message, true);
      }
    };

    if (state.isTop) {
      document.getElementById('topVendorEditForm').onsubmit = async function (e) {
        e.preventDefault();
        try {
          await apiJson('/api/admin/vendors/update', {
            method: 'POST',
            body: {
              vendor_id: v.id,
              operation: 'top_manage',
              profile: {
                display_name: document.getElementById('veDisplayName').value.trim(),
                town: document.getElementById('veTown').value.trim(),
                category: document.getElementById('veCategory').value.trim(),
                cuisine: document.getElementById('veCuisine').value.trim(),
                hours_summary: document.getElementById('veHours').value.trim(),
                website_url: document.getElementById('veWebsite').value.trim(),
                summary: document.getElementById('veSummary').value.trim()
              },
              eligibility: {
                is_active: document.getElementById('veIsActive').checked,
                booking_enabled: document.getElementById('veBookingEnabled').checked,
                accepting_bookings: document.getElementById('veAcceptingBookings').checked,
                verified_status: document.getElementById('veVerified').checked,
                photo_rights_confirmed: document.getElementById('vePhotoRights').checked
              },
              restrictions: {
                hidden_from_discovery: document.getElementById('veHiddenDiscovery').checked,
                bookings_restricted: document.getElementById('veBookingsRestr').checked,
                vendor_access_suspended: document.getElementById('veAccessSusp').checked,
                pager_restricted: document.getElementById('vePagerRestr').checked,
                needs_info_correction: document.getElementById('veNeedsCorrection').checked,
                correction_note: document.getElementById('veCorrectionNote').value.trim()
              },
              reason: document.getElementById('veTopReason').value.trim()
            }
          });
          showBanner('Vendor "' + v.display_name + '" updated.', false);
          await loadVendors(state.vendors.page);
          loadOverview();
        } catch (err) {
          showBanner(err.message, true);
        }
      };

      document.getElementById('veClearRestrBtn').onclick = async function () {
        var reason = document.getElementById('veTopReason').value.trim();
        if (reason.length < 4) {
          showBanner('Enter an audit reason (at least 4 characters) before clearing restrictions.', true);
          return;
        }
        try {
          await apiJson('/api/admin/vendors/update', {
            method: 'POST',
            body: {
              vendor_id: v.id,
              operation: 'top_manage',
              eligibility: { is_active: true },
              restrictions: { clear_restrictions: true },
              reason: reason
            }
          });
          showBanner('All restrictions cleared and "' + v.display_name + '" reactivated.', false);
          await loadVendors(state.vendors.page);
          loadOverview();
        } catch (err) {
          showBanner(err.message, true);
        }
      };
    }
  }

  // =========================================================================
  // 4. Accounts & Invitations
  // =========================================================================
  function switchAccountsSubtab(tab) {
    state.acctTab = tab;
    document.querySelectorAll('[data-acct-tab]').forEach(function (b) {
      b.classList.toggle('active', b.dataset.acctTab === tab);
    });
    document.getElementById('acctInvitationsView').hidden = tab !== 'invitations';
    document.getElementById('acctDirectoryView').hidden = tab !== 'directory';
    if (tab === 'invitations') loadInvitations(1);
    else loadAccounts(1);
  }

  function updateInviteFormHints() {
    var role = document.getElementById('invRole').value;
    var needsVendor = role === 'vendor_owner' || role === 'vendor_staff';
    document.getElementById('invVendorWrap').hidden = !needsVendor;
    document.getElementById('invVendorId').required = needsVendor;

    var isPriv = role === 'mod' || role === 'top';
    document.getElementById('invModElevationNotice').hidden = !(!state.isTop && isPriv);
  }

  async function submitCreateInvitation(e) {
    e.preventDefault();
    var role = document.getElementById('invRole').value;
    var email = document.getElementById('invEmail').value.trim();
    var vendorId = document.getElementById('invVendorId').value;
    var note = document.getElementById('invNote').value.trim();
    var resBox = document.getElementById('invResultBox');
    resBox.hidden = true;

    try {
      var data = await apiJson('/api/admin/invitations/create', {
        method: 'POST',
        body: {
          email: email,
          requested_role: role,
          vendor_id: role === 'vendor_owner' || role === 'vendor_staff' ? vendorId : null,
          note: note
        }
      });
      resBox.hidden = false;
      if (data.requires_top_approval) {
        resBox.innerHTML =
          '<strong>⏳ Pending Admin: Top Approval:</strong> Invitation for <strong>' +
          esc(email) +
          '</strong> (' +
          esc(data.invitation.role_label) +
          ') was recorded and placed in the Admin: Top approval queue. No active token is issued until approved.';
      } else {
        var fullLink = window.location.origin + data.accept_path;
        resBox.innerHTML =
          '<strong>✓ Single-Use Invitation Issued:</strong> Share this expiring link with <strong>' +
          esc(email) +
          '</strong> (' +
          esc(data.invitation.role_label) +
          '). Recipient must verify email ownership via 6-digit OTP to redeem:<br>' +
          '<code>' +
          esc(fullLink) +
          '</code>';
      }
      document.getElementById('inviteCreateForm').reset();
      updateInviteFormHints();
      loadInvitations(1);
      loadOverview();
    } catch (err) {
      showBanner(err.message, true);
    }
  }

  async function loadInvitations(page) {
    state.invitations.page = page || 1;
    var stateEl = document.getElementById('invListState');
    var wrapEl = document.getElementById('invList');
    stateEl.hidden = false;
    stateEl.className = 'state-box';
    stateEl.textContent = 'Loading invitations…';
    wrapEl.hidden = true;

    var qs = new URLSearchParams({
      page: String(state.invitations.page),
      page_size: String(state.invitations.pageSize),
      status: document.getElementById('invStatusFilter').value,
      role: document.getElementById('invRoleFilter').value
    });

    try {
      var data = await apiJson('/api/admin/invitations?' + qs.toString());
      state.invitations.items = Array.isArray(data.invitations) ? data.invitations : [];
      state.invitations.total = Number(data.total) || 0;

      if (!state.invitations.items.length) {
        stateEl.textContent = 'No invitations match the current filters.';
        renderPager('invPager', 1, state.invitations.pageSize, 0, loadInvitations);
        return;
      }

      stateEl.hidden = true;
      wrapEl.hidden = false;
      wrapEl.innerHTML =
        '<table class="admin-table"><thead><tr>' +
        '<th>Recipient Email</th><th>Requested Role</th><th>Vendor</th><th>Status</th><th>Initiated By</th><th>Created / Expires</th><th>Actions</th>' +
        '</tr></thead><tbody>' +
        state.invitations.items
          .map(function (inv) {
            var actions = '';
            if (inv.status === 'pending_top_approval' && state.isTop) {
              actions +=
                '<button type="button" class="admin-btn admin-btn-primary admin-btn-sm" data-inv-act="approve" data-id="' +
                esc(inv.id) +
                '">Approve &amp; Issue</button> ' +
                '<button type="button" class="admin-btn admin-btn-danger admin-btn-sm" data-inv-act="reject" data-id="' +
                esc(inv.id) +
                '">Reject</button> ';
            }
            if ((inv.status === 'pending_top_approval' || inv.status === 'issued') && (state.isTop || inv.initiated_by === state.ctx.user.id)) {
              actions +=
                '<button type="button" class="admin-btn admin-btn-secondary admin-btn-sm" data-inv-act="revoke" data-id="' +
                esc(inv.id) +
                '">Revoke</button>';
            }
            return (
              '<tr>' +
              '<td><strong>' + esc(inv.email) + '</strong><br><small>' + esc(inv.note || '') + '</small></td>' +
              '<td>' + esc(inv.role_label) + '</td>' +
              '<td>' + esc(inv.vendor_id || '—') + '</td>' +
              '<td>' + statusPill(inv.status) + '</td>' +
              '<td><span class="pill">' + esc(inv.initiator_role) + '</span><br><small>' + esc(inv.initiated_by) + '</small></td>' +
              '<td>' + fmtDate(inv.created_at) + '<br><small>Exp: ' + fmtDate(inv.expires_at) + '</small></td>' +
              '<td>' + (actions || '<small>—</small>') + '</td>' +
              '</tr>'
            );
          })
          .join('') +
        '</tbody></table>';

      wrapEl.querySelectorAll('[data-inv-act]').forEach(function (btn) {
        btn.onclick = function () {
          decideInvitation(btn.dataset.id, btn.dataset.invAct);
        };
      });

      renderPager('invPager', state.invitations.page, state.invitations.pageSize, state.invitations.total, loadInvitations);
    } catch (err) {
      stateEl.className = 'state-box state-error';
      stateEl.textContent = err.message;
    }
  }

  async function decideInvitation(invitationId, action) {
    var reason = window.prompt('Enter audit reason for invitation ' + action + ' (min 3 chars):', 'Reviewed by administrator');
    if (!reason || reason.trim().length < 3) return;
    try {
      var out = await apiJson('/api/admin/invitations/decision', {
        method: 'POST',
        body: { invitation_id: invitationId, action: action, reason: reason.trim() }
      });
      if (out.accept_path) {
        var resBox = document.getElementById('invResultBox');
        resBox.hidden = false;
        resBox.innerHTML =
          '<strong>✓ Privileged Invitation Approved &amp; Issued:</strong> Share one-time link:<br><code>' +
          esc(window.location.origin + out.accept_path) +
          '</code>';
      }
      showBanner('Invitation ' + action + ' completed.', false);
      loadInvitations(state.invitations.page);
      loadOverview();
    } catch (err) {
      showBanner(err.message, true);
    }
  }

  async function loadAccounts(page) {
    state.accounts.page = page || 1;
    var stateEl = document.getElementById('acctListState');
    var listEl = document.getElementById('acctList');
    stateEl.hidden = false;
    stateEl.className = 'state-box';
    stateEl.textContent = 'Loading accounts…';
    listEl.hidden = true;

    var qs = new URLSearchParams({
      page: String(state.accounts.page),
      page_size: String(state.accounts.pageSize),
      role: document.getElementById('acctRoleFilter').value,
      status: document.getElementById('acctStatusFilter').value
    });
    var q = document.getElementById('acctSearchInput').value.trim();
    if (q) qs.set('q', q);

    try {
      var data = await apiJson('/api/admin/accounts?' + qs.toString());
      state.accounts.items = Array.isArray(data.accounts) ? data.accounts : [];
      state.accounts.total = Number(data.total) || 0;

      if (!state.accounts.items.length) {
        stateEl.textContent = 'No accounts match the current search.';
        renderPager('acctPager', 1, state.accounts.pageSize, 0, loadAccounts);
        return;
      }

      stateEl.hidden = true;
      listEl.hidden = false;
      listEl.innerHTML = state.accounts.items
        .map(function (acc) {
          var isSel = state.accounts.selectedId === acc.id;
          var pBadge = acc.platform_role_label
            ? ' <span class="pill ' + (acc.platform_role === 'top' ? 'pill-top' : 'pill-mod') + '">' + esc(acc.platform_role_label) + '</span>'
            : '';
          var mCount = Array.isArray(acc.vendor_memberships) ? acc.vendor_memberships.length : 0;
          return (
            '<button type="button" class="record-card' +
            (isSel ? ' selected' : '') +
            '" data-acc-id="' +
            esc(acc.id) +
            '">' +
            '<div class="record-card-top"><span class="record-title">' +
            esc(acc.email) +
            '</span><span>' +
            statusPill(acc.account_status) +
            pBadge +
            '</span></div>' +
            '<div class="record-meta">ID: <code>' +
            esc(acc.id) +
            '</code> · Vendor memberships: ' +
            mCount +
            ' · Last login: ' +
            fmtDate(acc.last_login_at) +
            '</div>' +
            '</button>'
          );
        })
        .join('');

      listEl.querySelectorAll('[data-acc-id]').forEach(function (btn) {
        btn.onclick = function () {
          state.accounts.selectedId = btn.dataset.accId;
          loadAccounts(state.accounts.page);
          renderAccountDetail();
        };
      });

      renderPager('acctPager', state.accounts.page, state.accounts.pageSize, state.accounts.total, loadAccounts);
      if (state.accounts.selectedId) renderAccountDetail();
    } catch (err) {
      stateEl.className = 'state-box state-error';
      stateEl.textContent = err.message;
    }
  }

  function renderAccountDetail() {
    var pane = document.getElementById('acctDetailPane');
    var acc = state.accounts.items.find(function (a) { return a.id === state.accounts.selectedId; });
    if (!acc) {
      pane.innerHTML = '<div class="empty-detail">Select an account to view memberships and role controls.</div>';
      return;
    }

    var isSelf = state.ctx && state.ctx.user && acc.id === state.ctx.user.id;
    var mems = Array.isArray(acc.vendor_memberships) ? acc.vendor_memberships : [];
    var memHtml = mems.length
      ? '<ul>' +
        mems
          .map(function (m) {
            return '<li><code>' + esc(m.vendor_id) + '</code> — <strong>' + esc(m.role === 'owner' ? 'Vendor Owner' : 'Vendor Staff') + '</strong></li>';
          })
          .join('') +
        '</ul>'
      : '<p class="record-meta">No vendor memberships (Customer scope).</p>';

    var topControls = '';
    if (!state.isTop) {
      topControls =
        '<div class="policy-callout"><strong>Admin: Mod Scope:</strong> Account role changes and account suspension require <strong>Admin: Top</strong>. Use the Invitations tab above to initiate role invitations for Admin: Top review.</div>';
    } else if (isSelf) {
      topControls =
        '<div class="policy-callout"><strong>Self-Modification Guard:</strong> Administrators cannot modify their own platform role or suspend their own account.</div>';
    } else {
      topControls =
        '<form class="admin-form" id="acctRoleForm">' +
        '<h3>Platform Role Assignment (Admin: Top)</h3>' +
        '<label>Administrative Tier' +
        '<select id="acctNewRole">' +
        '<option value="none" ' + (!acc.platform_role ? 'selected' : '') + '>None (Customer / Vendor only)</option>' +
        '<option value="mod" ' + (acc.platform_role === 'mod' ? 'selected' : '') + '>Admin: Mod</option>' +
        '<option value="top" ' + (acc.platform_role === 'top' ? 'selected' : '') + '>Admin: Top</option>' +
        '</select></label>' +
        '<label>Audit Reason (required, revokes active sessions)<input type="text" id="acctRoleReason" required minlength="4" maxlength="500" placeholder="Reason for granting, demoting, or revoking admin role"></label>' +
        '<button type="submit" class="admin-btn admin-btn-primary">Update Platform Role</button>' +
        '</form>' +
        '<form class="admin-form" id="acctStatusForm">' +
        '<h3>Account Access Status</h3>' +
        '<label>Status' +
        '<select id="acctNewStatus">' +
        '<option value="active" ' + (acc.account_status === 'active' ? 'selected' : '') + '>Active</option>' +
        '<option value="suspended" ' + (acc.account_status === 'suspended' ? 'selected' : '') + '>Suspended (revokes sessions)</option>' +
        '</select></label>' +
        '<label>Reason (required)<input type="text" id="acctStatusReason" required minlength="4" maxlength="500" placeholder="Reason for status change"></label>' +
        '<button type="submit" class="admin-btn admin-btn-danger">Update Account Status</button>' +
        '</form>';
    }

    pane.innerHTML =
      '<div class="detail-head">' +
      statusPill(acc.account_status) +
      (acc.platform_role_label ? ' <span class="pill pill-top">' + esc(acc.platform_role_label) + '</span>' : ' <span class="pill">Customer</span>') +
      '<h2>' +
      esc(acc.email) +
      '</h2>' +
      '<div class="record-meta">User ID: <code>' +
      esc(acc.id) +
      '</code> · Created ' +
      fmtDate(acc.created_at) +
      '</div></div>' +
      '<h3>Vendor Memberships</h3>' +
      memHtml +
      topControls;

    var roleForm = document.getElementById('acctRoleForm');
    if (roleForm) {
      roleForm.onsubmit = async function (e) {
        e.preventDefault();
        try {
          await apiJson('/api/admin/accounts/role', {
            method: 'POST',
            body: {
              user_id: acc.id,
              role: document.getElementById('acctNewRole').value,
              reason: document.getElementById('acctRoleReason').value.trim(),
              expected_updated_at: acc.updated_at
            }
          });
          showBanner('Platform role updated for ' + acc.email + ' (sessions refreshed).', false);
          loadAccounts(state.accounts.page);
        } catch (err) {
          showBanner(err.message, true);
        }
      };
    }

    var statusForm = document.getElementById('acctStatusForm');
    if (statusForm) {
      statusForm.onsubmit = async function (e) {
        e.preventDefault();
        try {
          await apiJson('/api/admin/accounts/status', {
            method: 'POST',
            body: {
              user_id: acc.id,
              account_status: document.getElementById('acctNewStatus').value,
              reason: document.getElementById('acctStatusReason').value.trim(),
              expected_updated_at: acc.updated_at
            }
          });
          showBanner('Account status updated for ' + acc.email + '.', false);
          loadAccounts(state.accounts.page);
        } catch (err) {
          showBanner(err.message, true);
        }
      };
    }
  }

  // =========================================================================
  // 5. Comments & Moderation
  // =========================================================================
  async function loadModeration(page) {
    state.mod.page = page || 1;
    var stateEl = document.getElementById('modListState');
    var listEl = document.getElementById('modList');
    stateEl.hidden = false;
    stateEl.className = 'state-box';
    stateEl.textContent = 'Loading moderation queue…';
    listEl.hidden = true;

    var qs = new URLSearchParams({
      queue: state.mod.queue,
      page: String(state.mod.page),
      page_size: String(state.mod.pageSize)
    });
    var st = document.getElementById('modStatusFilter').value;
    var vf = document.getElementById('modVendorFilter').value.trim();
    var af = document.getElementById('modAuthorFilter').value.trim();
    var rf = document.getElementById('modReasonFilter').value.trim();
    var df = document.getElementById('modDateFrom').value;
    var dt = document.getElementById('modDateTo').value;
    var q = document.getElementById('modSearchInput').value.trim();
    if (st) qs.set('status', st);
    if (vf) qs.set('vendor_id', vf);
    if (af) qs.set('author_id', af);
    if (rf) qs.set('reason_category', rf);
    if (df) qs.set('date_from', df);
    if (dt) qs.set('date_to', dt);
    if (q) qs.set('q', q);

    try {
      var data = await apiJson('/api/admin/moderation?' + qs.toString());
      state.mod.items = Array.isArray(data.posts) ? data.posts : [];
      state.mod.total = Number(data.total) || 0;

      if (!state.mod.items.length) {
        stateEl.textContent = 'No community submissions in this queue.';
        renderPager('modPager', 1, state.mod.pageSize, 0, loadModeration);
        return;
      }

      stateEl.hidden = true;
      listEl.hidden = false;
      listEl.innerHTML = state.mod.items
        .map(function (p) {
          var isSel = state.mod.selectedId === p.id;
          var repBadge = Number(p.report_count) > 0 ? ' <span class="pill pill-danger">🚩 ' + Number(p.report_count) + ' report(s)</span>' : '';
          return (
            '<button type="button" class="record-card' +
            (isSel ? ' selected' : '') +
            '" data-post-id="' +
            esc(p.id) +
            '">' +
            '<div class="record-card-top"><span class="record-title">' +
            esc(p.title) +
            '</span><span>' +
            statusPill(p.status) +
            repBadge +
            '</span></div>' +
            '<div class="record-meta">' +
            esc(p.kind) +
            ' · <strong>' +
            esc(p.place_name) +
            '</strong> (' +
            esc(p.town) +
            ') · By ' +
            esc(p.nickname) +
            ' · ' +
            fmtDate(p.created_at) +
            '</div>' +
            '</button>'
          );
        })
        .join('');

      listEl.querySelectorAll('[data-post-id]').forEach(function (btn) {
        btn.onclick = function () {
          state.mod.selectedId = btn.dataset.postId;
          loadModeration(state.mod.page);
          renderModerationDetail();
        };
      });

      renderPager('modPager', state.mod.page, state.mod.pageSize, state.mod.total, loadModeration);
      if (state.mod.selectedId) renderModerationDetail();
    } catch (err) {
      stateEl.className = 'state-box state-error';
      stateEl.textContent = err.message;
    }
  }

  function renderModerationDetail() {
    var pane = document.getElementById('modDetailPane');
    var p = state.mod.items.find(function (x) { return x.id === state.mod.selectedId; });
    if (!p) {
      pane.innerHTML = '<div class="empty-detail">Select a community submission to inspect content and moderation history.</div>';
      return;
    }

    var reports = Array.isArray(p.reports) ? p.reports : [];
    var history = Array.isArray(p.moderation_history) ? p.moderation_history : [];

    var reportsHtml = reports.length
      ? '<div class="thread-list">' +
        reports
          .map(function (r) {
            return (
              '<div class="thread-item note-internal"><strong>🚩 ' +
              esc(r.reason_category) +
              '</strong> ' +
              statusPill(r.status) +
              ' · <small>' +
              fmtDate(r.created_at) +
              '</small><div>' +
              esc(r.details || 'No extra details.') +
              '</div></div>'
            );
          })
          .join('') +
        '</div>'
      : '<p class="record-meta">No user reports filed against this post.</p>';

    var histHtml = history.length
      ? '<div class="thread-list">' +
        history
          .map(function (h) {
            return (
              '<div class="thread-item"><strong>' +
              esc(h.action) +
              '</strong> (' +
              esc(h.from_status || '—') +
              ' → ' +
              esc(h.to_status || '—') +
              ') · <span class="pill">' +
              esc(h.actor_role) +
              '</span> · <small>' +
              fmtDate(h.created_at) +
              '</small><div>Reason: ' +
              esc(h.reason || '—') +
              '</div></div>'
            );
          })
          .join('') +
        '</div>'
      : '<p class="record-meta">No prior moderation decisions.</p>';

    var btns = '';
    if (p.status === 'pending') {
      btns += '<button type="button" class="admin-btn admin-btn-primary" data-mod-act="approve">✓ Approve Post</button>';
      btns += '<button type="button" class="admin-btn admin-btn-danger" data-mod-act="reject">✕ Reject Post</button>';
    }
    if (p.status === 'approved') {
      btns += '<button type="button" class="admin-btn admin-btn-warn" data-mod-act="hide">🙈 Hide Approved Post</button>';
    }
    if (p.status === 'hidden' || p.status === 'rejected') {
      btns += '<button type="button" class="admin-btn admin-btn-primary" data-mod-act="restore">↺ Restore to Public</button>';
    }
    if (reports.some(function (r) { return r.status === 'open'; })) {
      btns += '<button type="button" class="admin-btn admin-btn-secondary" data-mod-act="dismiss_reports">✓ Dismiss Open Reports</button>';
    }

    pane.innerHTML =
      '<div class="detail-head">' +
      statusPill(p.status) +
      ' <span class="pill">' +
      esc(p.kind) +
      '</span>' +
      '<h2>' +
      esc(p.title) +
      '</h2>' +
      '<div class="record-meta">Place: <strong>' +
      esc(p.place_name) +
      '</strong> (<code>' +
      esc(p.place_id) +
      '</code>) · Author ID: <code>' +
      esc(p.author_id) +
      '</code> (' +
      esc(p.nickname) +
      ') · Submitted ' +
      fmtDate(p.created_at) +
      '</div></div>' +
      '<div class="thread-item"><strong>Immutable Original Submission' +
      (p.rating ? ' (' + Number(p.rating) + '/5 ★)' : '') +
      ':</strong><p>' +
      esc(p.body) +
      '</p></div>' +
      (p.moderation_internal_note
        ? '<div class="thread-item note-internal"><strong>🔒 Internal Moderator Note (Private):</strong> ' + esc(p.moderation_internal_note) + '</div>'
        : '') +
      '<h3>User Reports (' +
      reports.length +
      ')</h3>' +
      reportsHtml +
      '<div class="admin-form">' +
      '<label>Moderation Reason (required for reject / hide / restore)' +
      '<input type="text" id="modDecisionReason" maxlength="600" placeholder="Document policy basis for moderation action…" value="' +
      esc(p.moderation_reason || '') +
      '"></label>' +
      '<label>🔒 Internal Moderator Annotation (never exposed publicly)' +
      '<input type="text" id="modInternalNote" maxlength="1000" placeholder="Optional private moderator context…"></label>' +
      '<div class="action-row">' +
      btns +
      '</div></div>' +
      '<div class="admin-form"><h3>Moderation History</h3>' +
      histHtml +
      '</div>';

    pane.querySelectorAll('[data-mod-act]').forEach(function (btn) {
      btn.onclick = async function () {
        var act = btn.dataset.modAct;
        var reason = document.getElementById('modDecisionReason').value.trim();
        var internalNote = document.getElementById('modInternalNote').value.trim();
        try {
          await apiJson('/api/admin/moderation/decision', {
            method: 'POST',
            body: {
              post_id: p.id,
              action: act,
              reason: reason || 'Approved after review',
              internal_note: internalNote
            }
          });
          showBanner('Moderation decision "' + act + '" recorded.', false);
          loadModeration(state.mod.page);
          loadOverview();
        } catch (err) {
          showBanner(err.message, true);
        }
      };
    });
  }

  // =========================================================================
  // 6. Customer & Vendor Issues
  // =========================================================================
  async function loadIssues(page) {
    state.issues.page = page || 1;
    var stateEl = document.getElementById('issuesListState');
    var listEl = document.getElementById('issuesList');
    stateEl.hidden = false;
    stateEl.className = 'state-box';
    stateEl.textContent = 'Loading support issues…';
    listEl.hidden = true;

    var qs = new URLSearchParams({
      page: String(state.issues.page),
      page_size: String(state.issues.pageSize),
      status: document.getElementById('issuesStatusFilter').value,
      severity: document.getElementById('issuesSeverityFilter').value,
      category: document.getElementById('issuesCategoryFilter').value
    });
    if (document.getElementById('issuesOverdueOnly').checked) qs.set('overdue', '1');
    var q = document.getElementById('issuesSearchInput').value.trim();
    if (q) qs.set('q', q);

    try {
      var data = await apiJson('/api/admin/issues?' + qs.toString());
      state.issues.items = Array.isArray(data.issues) ? data.issues : [];
      state.issues.total = Number(data.total) || 0;

      if (!state.issues.items.length) {
        stateEl.textContent = 'No support issues match the selected filters.';
        renderPager('issuesPager', 1, state.issues.pageSize, 0, loadIssues);
        return;
      }

      stateEl.hidden = true;
      listEl.hidden = false;
      listEl.innerHTML = state.issues.items
        .map(function (iss) {
          var isSel = state.issues.selectedId === iss.id;
          var overdueBadge = iss.is_overdue ? ' <span class="pill pill-danger">⏰ OVERDUE SLA</span>' : '';
          var dupBadge = Number(iss.duplicate_count) > 0 ? ' <span class="pill pill-warn">×' + (Number(iss.duplicate_count) + 1) + ' repeated</span>' : '';
          return (
            '<button type="button" class="record-card' +
            (isSel ? ' selected' : '') +
            '" data-iss-id="' +
            esc(iss.id) +
            '">' +
            '<div class="record-card-top"><span class="record-title">' +
            esc(iss.subject) +
            '</span><span>' +
            statusPill(iss.status) +
            ' ' +
            statusPill(iss.severity) +
            overdueBadge +
            dupBadge +
            '</span></div>' +
            '<div class="record-meta">' +
            esc(iss.category) +
            ' · Reporter: ' +
            esc(iss.reporter_email) +
            ' (' +
            esc(iss.reporter_role) +
            ')' +
            (iss.vendor_id ? ' · Vendor: <code>' + esc(iss.vendor_id) + '</code>' : '') +
            '</div>' +
            '<div class="record-meta">SLA Due: ' +
            fmtDate(iss.sla_due_at) +
            ' · Assigned: ' +
            esc(iss.assigned_to || 'Unassigned') +
            '</div>' +
            '</button>'
          );
        })
        .join('');

      listEl.querySelectorAll('[data-iss-id]').forEach(function (btn) {
        btn.onclick = function () {
          selectIssueDetail(btn.dataset.issId);
        };
      });

      renderPager('issuesPager', state.issues.page, state.issues.pageSize, state.issues.total, loadIssues);
      if (state.issues.selectedId) selectIssueDetail(state.issues.selectedId);
    } catch (err) {
      stateEl.className = 'state-box state-error';
      stateEl.textContent = err.message;
    }
  }

  async function selectIssueDetail(issueId) {
    state.issues.selectedId = issueId;
    document.querySelectorAll('#issuesList [data-iss-id]').forEach(function (b) {
      b.classList.toggle('selected', b.dataset.issId === issueId);
    });
    var pane = document.getElementById('issuesDetailPane');
    pane.innerHTML = '<div class="state-box">Loading issue thread…</div>';

    try {
      var data = await apiJson('/api/admin/issues?issue_id=' + encodeURIComponent(issueId));
      renderIssueDetail(data.issue, data.notes || []);
    } catch (err) {
      pane.innerHTML = '<div class="state-box state-error">' + esc(err.message) + '</div>';
    }
  }

  function renderIssueDetail(iss, notes) {
    var pane = document.getElementById('issuesDetailPane');
    if (!iss) return;

    var threadHtml = notes.length
      ? '<div class="thread-list">' +
        notes
          .map(function (n) {
            var isInternal = n.visibility === 'internal';
            return (
              '<div class="thread-item ' +
              (isInternal ? 'note-internal' : 'note-visible') +
              '">' +
              '<strong>' +
              (isInternal ? '🔒 Internal Note (Admins Only)' : '💬 Reporter-Visible Message') +
              '</strong> · <span class="pill">' +
              esc(n.author_role) +
              '</span> · <small>' +
              fmtDate(n.created_at) +
              '</small>' +
              '<div>' +
              esc(n.body) +
              '</div></div>'
            );
          })
          .join('') +
        '</div>'
      : '<p class="record-meta">No replies or internal notes yet.</p>';

    pane.innerHTML =
      '<div class="detail-head">' +
      statusPill(iss.status) +
      ' ' +
      statusPill(iss.severity) +
      (iss.is_overdue ? ' <span class="pill pill-danger">⏰ OVERDUE SLA</span>' : '') +
      '<h2>' +
      esc(iss.subject) +
      '</h2>' +
      '<div class="record-meta">Issue ID: <code>' +
      esc(iss.id) +
      '</code> · Reporter: <strong>' +
      esc(iss.reporter_email) +
      '</strong> (' +
      esc(iss.reporter_role) +
      ')</div></div>' +
      '<div class="kv-grid">' +
      '<div><strong>Category</strong>' + esc(iss.category) + '</div>' +
      '<div><strong>Linked Vendor</strong><code>' + esc(iss.vendor_id || '—') + '</code></div>' +
      '<div><strong>Linked Booking / Post</strong><code>' + esc(iss.booking_id || iss.community_post_id || '—') + '</code></div>' +
      '<div><strong>Repeated Submissions</strong>' + Number(iss.duplicate_count || 0) + '</div>' +
      '</div>' +
      '<div class="thread-item"><strong>Original Report (' + fmtDate(iss.created_at) + '):</strong><p>' + esc(iss.description) + '</p></div>' +
      '<h3>Conversation &amp; Internal Notes</h3>' +
      threadHtml +
      '<form class="admin-form" id="issueUpdateForm">' +
      '<div class="form-row-2">' +
      '<label>Status<select id="issEditStatus">' +
      ['open', 'in_progress', 'waiting', 'resolved', 'closed']
        .map(function (s) { return '<option value="' + s + '" ' + (iss.status === s ? 'selected' : '') + '>' + s + '</option>'; })
        .join('') +
      '</select></label>' +
      '<label>Severity<select id="issEditSeverity">' +
      ['low', 'normal', 'high', 'urgent']
        .map(function (s) { return '<option value="' + s + '" ' + (iss.severity === s ? 'selected' : '') + '>' + s + '</option>'; })
        .join('') +
      '</select></label>' +
      '</div>' +
      '<div class="form-row-2">' +
      '<label>Assignee<select id="issEditAssignee">' +
      '<option value="" ' + (!iss.assigned_to ? 'selected' : '') + '>Unassigned</option>' +
      '<option value="' + esc(state.ctx.user.id) + '" ' + (iss.assigned_to === state.ctx.user.id ? 'selected' : '') + '>Assign to me (' + esc(state.ctx.user.email) + ')</option>' +
      '</select></label>' +
      '<label>Resolution Reason (required to resolve/close)<input type="text" id="issEditResolution" value="' + esc(iss.resolution_reason || '') + '" maxlength="600" placeholder="Outcome summary…"></label>' +
      '</div>' +
      '<label>Note Visibility' +
      '<select id="issNoteVis">' +
      '<option value="internal">🔒 Internal Note (Confidential — Admins only)</option>' +
      '<option value="reporter_visible">💬 User-Visible Response (Shown to reporter)</option>' +
      '</select></label>' +
      '<label>Add Note or Response (optional)<textarea id="issNoteBody" rows="3" maxlength="2500" placeholder="Write an internal triage note or a response to the reporter…"></textarea></label>' +
      '<button type="submit" class="admin-btn admin-btn-primary">Save Issue Update</button>' +
      '</form>';

    document.getElementById('issueUpdateForm').onsubmit = async function (e) {
      e.preventDefault();
      try {
        await apiJson('/api/admin/issues/update', {
          method: 'POST',
          body: {
            issue_id: iss.id,
            status: document.getElementById('issEditStatus').value,
            severity: document.getElementById('issEditSeverity').value,
            assigned_to: document.getElementById('issEditAssignee').value || null,
            resolution_reason: document.getElementById('issEditResolution').value.trim(),
            note_visibility: document.getElementById('issNoteVis').value,
            note_body: document.getElementById('issNoteBody').value.trim(),
            expected_updated_at: iss.updated_at
          }
        });
        showBanner('Issue updated.', false);
        await loadIssues(state.issues.page);
        loadOverview();
      } catch (err) {
        showBanner(err.message, true);
      }
    };
  }

  // =========================================================================
  // 6B. Business & Compliance Readiness Checklist
  // =========================================================================
  var READINESS_STATUS_LABELS = {
    not_assessed: 'Not assessed',
    decision_pending: 'Decision pending',
    proposed: 'Proposed',
    implemented_verification_pending: 'Implemented — verification pending',
    verified_internally: 'Verified internally',
    submitted_for_legal_review: 'Submitted for legal review',
    changes_requested: 'Changes requested',
    legally_approved: 'Legally approved (scoped)',
    not_applicable: 'Not applicable (explained)',
    needs_re_review: 'Needs re-review'
  };

  function readinessStatusPill(status) {
    var s = String(status || '').toLowerCase();
    var label = READINESS_STATUS_LABELS[s] || status;
    var cls = 'pill';
    if (s === 'legally_approved') cls += ' pill-ok';
    else if (s === 'not_applicable') cls += ' pill-info';
    else if (s === 'needs_re_review' || s === 'changes_requested' || s === 'not_assessed') cls += ' pill-danger';
    else cls += ' pill-warn';
    return '<span class="' + cls + '">' + esc(label) + '</span>';
  }

  function renderStageChips(item) {
    var st = item.stages || {};
    var chip = function (done, text) {
      return '<span class="stage-chip' + (done ? ' done' : '') + '">' + (done ? '✓ ' : '○ ') + esc(text) + '</span>';
    };
    return (
      '<div class="stage-track" aria-label="Readiness stage progression">' +
      chip(st.decision_recorded, 'Decision') +
      chip(st.implemented_recorded, 'Implemented') +
      chip(st.tested_recorded, 'Tested') +
      chip(st.legally_reviewed, 'Legally reviewed') +
      '</div>'
    );
  }

  async function loadReadiness() {
    var stateEl = document.getElementById('readinessListState');
    var listEl = document.getElementById('readinessList');
    stateEl.hidden = false;
    stateEl.className = 'state-box';
    stateEl.textContent = 'Loading Business & Compliance Readiness register…';
    listEl.hidden = true;

    var qs = new URLSearchParams();
    var cat = document.getElementById('readinessCategoryFilter').value;
    var st = document.getElementById('readinessStatusFilter').value;
    var crit = document.getElementById('readinessCriticalOnly').checked;
    var q = document.getElementById('readinessSearchInput').value.trim();
    if (cat && cat !== 'all') qs.set('category', cat);
    if (st && st !== 'all') qs.set('status', st);
    if (crit) qs.set('critical_only', '1');
    if (q) qs.set('q', q);

    try {
      var data = await apiJson('/api/admin/readiness' + (qs.toString() ? '?' + qs.toString() : ''));
      state.readiness.items = Array.isArray(data.items) ? data.items : [];
      state.readiness.summary = data.summary || {};
      state.readiness.statusesCatalog = Array.isArray(data.statuses_catalog) ? data.statuses_catalog : [];

      var sum = state.readiness.summary;
      document.getElementById('rsUnresolvedCritical').textContent = String(sum.unresolved_launch_critical || 0);
      document.getElementById('rsPendingDecision').textContent = String(sum.unassessed_or_pending_count || 0);
      document.getElementById('rsNeedsReReview').textContent = String(sum.needs_re_review_count || 0);
      document.getElementById('rsLegallyApproved').textContent = String(sum.legally_approved_count || 0);
      document.getElementById('rsVisibleTotal').textContent = String(sum.visible_items || 0);

      setNavBadge('badgeReadiness', sum.unresolved_launch_critical || 0);

      if (!state.readiness.items.length) {
        stateEl.textContent = 'No readiness items match the selected filters.';
        return;
      }

      if (!state.readiness.selectedKey || !state.readiness.items.some(function (i) { return i.item_key === state.readiness.selectedKey; })) {
        state.readiness.selectedKey = state.readiness.items[0].item_key;
      }

      stateEl.hidden = true;
      listEl.hidden = false;
      listEl.innerHTML = state.readiness.items
        .map(function (item) {
          var isSel = state.readiness.selectedKey === item.item_key;
          var critTag = item.is_launch_critical
            ? '<span class="pill pill-danger">Launch-Critical</span>'
            : '<span class="pill">Pre-Activation</span>';
          return (
            '<button type="button" class="record-card' +
            (isSel ? ' selected' : '') +
            '" data-readiness-key="' +
            esc(item.item_key) +
            '">' +
            '<div class="record-card-top"><span class="record-title">' +
            esc(item.topic) +
            '</span><span>' +
            critTag +
            ' ' +
            readinessStatusPill(item.status) +
            '</span></div>' +
            renderStageChips(item) +
            '<div class="record-meta">Owner: <strong>' +
            esc(item.owner_label) +
            '</strong>' +
            (item.policy_version ? ' · Version: <code>' + esc(item.policy_version) + '</code>' : ' · Version: <em>Unset</em>') +
            (item.target_review_date ? ' · Target: ' + esc(String(item.target_review_date).slice(0, 10)) : '') +
            '</div>' +
            '</button>'
          );
        })
        .join('');

      listEl.querySelectorAll('[data-readiness-key]').forEach(function (btn) {
        btn.onclick = function () {
          state.readiness.selectedKey = btn.dataset.readinessKey;
          listEl.querySelectorAll('[data-readiness-key]').forEach(function (b) {
            b.classList.toggle('selected', b === btn);
          });
          renderReadinessDetail();
        };
      });

      renderReadinessDetail();
    } catch (err) {
      stateEl.className = 'state-box state-error';
      stateEl.textContent = err.message;
    }
  }

  function renderReadinessDetail() {
    var pane = document.getElementById('readinessDetailPane');
    var item = state.readiness.items.find(function (i) {
      return i.item_key === state.readiness.selectedKey;
    });
    if (!item) {
      pane.innerHTML = '<div class="empty-detail">Select a readiness item to view details and governance controls.</div>';
      return;
    }

    var depsHtml = item.dependencies && item.dependencies.length
      ? item.dependencies.map(function (d) { return '<code>' + esc(d) + '</code>'; }).join(', ')
      : 'None';

    var legalApprovalSummary = item.approved_doc_version
      ? '<div class="card-panel" style="margin:10px 0;background:#f4f9f6">' +
        '<h3 style="margin:0 0 6px;font-size:14px">Recorded Legal Review Evidence ' +
        (item.status === 'needs_re_review' ? '<span class="pill pill-danger">NEEDS RE-REVIEW</span>' : '') +
        '</h3>' +
        '<div class="kv-grid">' +
        '<div><strong>Reviewed Version</strong><code>' + esc(item.approved_doc_version) + '</code></div>' +
        '<div><strong>Jurisdiction / Scope</strong>' + esc(item.approved_jurisdiction_scope || '—') + '</div>' +
        '<div><strong>Legal Reviewer</strong>' + esc(item.legal_reviewer_name || '—') + '</div>' +
        '<div><strong>Review Date</strong>' + esc(item.legal_reviewed_at ? String(item.legal_reviewed_at).slice(0, 10) : '—') + '</div>' +
        '</div></div>'
      : '<p class="record-meta"><strong>Legal Review Evidence:</strong> None recorded yet (Legal review pending).</p>';

    var counselDisplay = '';
    if (state.isTop || item.mod_counsel_access_granted) {
      counselDisplay =
        '<div class="detail-section"><h3>Confidential Counsel Material</h3><p>' +
        (item.confidential_counsel_notes ? esc(item.confidential_counsel_notes) : '<em>No confidential counsel notes recorded.</em>') +
        '</p></div>';
    } else {
      counselDisplay =
        '<div class="detail-section"><h3>Confidential Counsel Material</h3><p class="record-meta">' +
        (item.confidential_counsel_redacted
          ? '🔒 Confidential counsel notes exist on this item and are restricted to <strong>Admin: Top</strong> unless explicit Mod access is granted.'
          : '🔒 Restricted to <strong>Admin: Top</strong> unless explicit Mod permission is granted.') +
        '</p></div>';
    }

    var formHtml = '';
    if (!state.isTop) {
      formHtml =
        '<div class="policy-callout" style="margin:12px 0">' +
        '<strong>Admin: Mod Scope:</strong> You may record operational notes and supporting evidence links below. Declaring legal approval, modifying governing age/business policies, accessing confidential counsel notes without explicit permission, or completing final launch authorization requires <strong>Admin: Top</strong>.' +
        '</div>' +
        '<form class="admin-form" id="readinessModNoteForm">' +
        '<h3>Add Operational Note / Evidence (Admin: Mod)</h3>' +
        '<label for="rmSupportingEvidence">Supporting Evidence / File or Test Reference' +
        '<input type="text" id="rmSupportingEvidence" maxlength="1000" value="' + esc(item.supporting_evidence || '') + '" placeholder="e.g. Manual NVDA walkthrough log or policy draft section">' +
        '</label>' +
        '<label for="rmOperationalNote">Operational Note (3–800 characters)' +
        '<textarea id="rmOperationalNote" rows="3" minlength="3" maxlength="800" required placeholder="Add operational findings, verification notes, or open items for Admin: Top…"></textarea>' +
        '</label>' +
        '<button type="submit" class="admin-btn admin-btn-primary">Save Operational Note</button>' +
        '</form>';
    } else {
      var statusOptions = (state.readiness.statusesCatalog.length
        ? state.readiness.statusesCatalog
        : Object.keys(READINESS_STATUS_LABELS).map(function (k) { return { code: k, label: READINESS_STATUS_LABELS[k] }; })
      )
        .map(function (s) {
          return '<option value="' + esc(s.code) + '" ' + (item.status === s.code ? 'selected' : '') + '>' + esc(s.label) + '</option>';
        })
        .join('');

      var targetIso = item.target_review_date ? String(item.target_review_date).slice(0, 10) : '';
      var reviewedIso = item.legal_reviewed_at ? String(item.legal_reviewed_at).slice(0, 10) : '';

      formHtml =
        '<form class="admin-form" id="readinessTopUpdateForm">' +
        '<h3>Manage Readiness &amp; Legal Review Record (Admin: Top)</h3>' +
        '<div class="form-row-2">' +
        '<label for="rtStatus">Readiness Status<select id="rtStatus">' + statusOptions + '</select></label>' +
        '<label for="rtPolicyVersion">Policy / Document Version<input type="text" id="rtPolicyVersion" maxlength="80" value="' + esc(item.policy_version || '') + '" placeholder="e.g. draft-14plus-v0.1"></label>' +
        '</div>' +
        '<fieldset class="legal-approval-fieldset">' +
        '<legend>Independent Stage Progression (Decision → Implemented → Tested)</legend>' +
        '<div class="check-grid">' +
        '<label class="checkbox-inline" for="rtStageDecision"><input type="checkbox" id="rtStageDecision" ' + (item.decision_recorded ? 'checked' : '') + '><span>1. Policy decision made</span></label>' +
        '<label class="checkbox-inline" for="rtStageImplemented"><input type="checkbox" id="rtStageImplemented" ' + (item.implemented_recorded ? 'checked' : '') + '><span>2. Implemented in system/process</span></label>' +
        '<label class="checkbox-inline" for="rtStageTested"><input type="checkbox" id="rtStageTested" ' + (item.tested_recorded ? 'checked' : '') + '><span>3. Verified / tested internally</span></label>' +
        '</div>' +
        '</fieldset>' +
        '<label id="rtNaWrap" for="rtNaExplanation" ' + (item.status === 'not_applicable' ? '' : 'hidden') + '>Not Applicable Explanation (required when status is Not applicable)' +
        '<input type="text" id="rtNaExplanation" maxlength="600" value="' + esc(item.not_applicable_explanation || '') + '" placeholder="Explain why this requirement does not apply to the specified launch scope">' +
        '</label>' +
        '<label for="rtCurrentPractice">Current Setting or Documented Practice (editing an approved item marks it Needs re-review)' +
        '<textarea id="rtCurrentPractice" rows="3" required minlength="4" maxlength="2000">' + esc(item.current_practice || '') + '</textarea>' +
        '</label>' +
        '<label for="rtUnresolved">Unresolved Questions / Facts Requiring Confirmation' +
        '<textarea id="rtUnresolved" rows="2" maxlength="2000">' + esc(item.unresolved_questions || '') + '</textarea>' +
        '</label>' +
        '<div class="form-row-2">' +
        '<label for="rtOwner">Responsible Owner<input type="text" id="rtOwner" required minlength="2" maxlength="120" value="' + esc(item.owner_label || '') + '"></label>' +
        '<label for="rtTargetDate">Target / Review Date (YYYY-MM-DD)<input type="date" id="rtTargetDate" value="' + esc(targetIso) + '"></label>' +
        '</div>' +
        '<label for="rtNextAction">Next Action<input type="text" id="rtNextAction" required minlength="4" maxlength="600" value="' + esc(item.next_action || '') + '"></label>' +
        '<label for="rtEvidence">Supporting Evidence / Artifact Reference<input type="text" id="rtEvidence" maxlength="1000" value="' + esc(item.supporting_evidence || '') + '"></label>' +
        '<label for="rtOpNotes">Operational Notes<textarea id="rtOpNotes" rows="2" maxlength="2000">' + esc(item.operational_notes || '') + '</textarea></label>' +
        '<fieldset class="legal-approval-fieldset">' +
        '<legend>4. Structured Legal Review Sign-Off (all 4 fields required for Legally approved)</legend>' +
        '<div class="form-row-2">' +
        '<label for="rtApprovedVersion">Reviewed Document Version<input type="text" id="rtApprovedVersion" maxlength="80" value="' + esc(item.approved_doc_version || '') + '" placeholder="e.g. terms-v1.0-ca"></label>' +
        '<label for="rtApprovedScope">Approved Jurisdiction / Scope<input type="text" id="rtApprovedScope" maxlength="240" value="' + esc(item.approved_jurisdiction_scope || '') + '" placeholder="e.g. California, USA initial launch"></label>' +
        '</div>' +
        '<div class="form-row-2">' +
        '<label for="rtReviewerName">Legal Reviewer (Name &amp; Firm/Role)<input type="text" id="rtReviewerName" maxlength="160" value="' + esc(item.legal_reviewer_name || '') + '" placeholder="e.g. Jane Doe, Esq., Outside Counsel"></label>' +
        '<label for="rtReviewedAt">Legal Review Date (YYYY-MM-DD)<input type="date" id="rtReviewedAt" value="' + esc(reviewedIso) + '"></label>' +
        '</div>' +
        '</fieldset>' +
        '<fieldset class="legal-approval-fieldset">' +
        '<legend>Confidential Counsel Notes (Admin: Top Controlled)</legend>' +
        '<label for="rtCounselNotes">Confidential Counsel Summary (never expose raw user DOB or secrets)<textarea id="rtCounselNotes" rows="2" maxlength="2000">' + esc(item.confidential_counsel_notes || '') + '</textarea></label>' +
        '<label class="checkbox-inline" for="rtModCounselAccess"><input type="checkbox" id="rtModCounselAccess" ' + (item.mod_counsel_access_granted ? 'checked' : '') + '><span>Explicitly allow Admin: Mod to view confidential counsel notes on this item</span></label>' +
        '</fieldset>' +
        '<label for="rtChangeSummary">Audit Change Summary (optional)<input type="text" id="rtChangeSummary" maxlength="400" placeholder="Brief summary for append-only readiness history"></label>' +
        '<button type="submit" class="admin-btn admin-btn-primary">Save Readiness Governance Record</button>' +
        '</form>';
    }

    var historyList = Array.isArray(item.history) ? item.history : [];
    var historyHtml = historyList.length
      ? '<ul class="history-list">' +
        historyList
          .map(function (h) {
            return (
              '<li class="history-entry">' +
              '<div><strong>' + esc(h.change_kind) + '</strong> · ' +
              (h.from_status ? '<code>' + esc(h.from_status) + '</code> → ' : '') +
              '<code>' + esc(h.to_status) + '</code> · <small>' + fmtDate(h.created_at) + ' by ' + esc(h.actor_role) + ' (<code>' + esc(h.actor_id) + '</code>)</small></div>' +
              '<div>' + esc(h.summary) + '</div>' +
              '</li>'
            );
          })
          .join('') +
        '</ul>'
      : '<p class="record-meta">No history entries recorded.</p>';

    pane.innerHTML =
      '<div class="detail-head">' +
      '<span class="sec-kicker">ITEM KEY: <code>' + esc(item.item_key) + '</code> · CATEGORY: ' + esc(item.category) + '</span>' +
      '<h2>' + esc(item.topic) + '</h2>' +
      '<div>' +
      (item.is_launch_critical ? '<span class="pill pill-danger">Launch-Critical</span> ' : '<span class="pill">Pre-Activation</span> ') +
      readinessStatusPill(item.status) +
      '</div>' +
      renderStageChips(item) +
      '</div>' +
      '<div class="detail-section"><h3>Current Setting / Documented Practice</h3><p>' + esc(item.current_practice) + '</p></div>' +
      (item.unresolved_questions
        ? '<div class="unresolved-callout"><strong>[UNRESOLVED — CONFIRMATION REQUIRED]:</strong> ' + esc(item.unresolved_questions) + '</div>'
        : '') +
      '<div class="kv-grid" style="margin:10px 0">' +
      '<div><strong>Responsible Owner</strong>' + esc(item.owner_label) + '</div>' +
      '<div><strong>Policy / Doc Version</strong>' + (item.policy_version ? '<code>' + esc(item.policy_version) + '</code>' : '<em>Unset</em>') + '</div>' +
      '<div><strong>Target / Review Date</strong>' + esc(item.target_review_date ? String(item.target_review_date).slice(0, 10) : 'Not scheduled') + '</div>' +
      '<div><strong>Dependencies</strong>' + depsHtml + '</div>' +
      '</div>' +
      '<div class="detail-section"><h3>Next Action</h3><p>' + esc(item.next_action) + '</p></div>' +
      (item.operational_notes
        ? '<div class="detail-section"><h3>Operational Notes</h3><pre style="white-space:pre-wrap;font-family:inherit;background:#f8f5ec;padding:10px;border-radius:8px;font-size:12.5px">' + esc(item.operational_notes) + '</pre></div>'
        : '') +
      legalApprovalSummary +
      counselDisplay +
      formHtml +
      '<div class="detail-section" style="margin-top:16px"><h3>Append-Only Readiness Change History</h3>' + historyHtml + '</div>';

    var modForm = document.getElementById('readinessModNoteForm');
    if (modForm) {
      modForm.onsubmit = async function (e) {
        e.preventDefault();
        try {
          await apiJson('/api/admin/readiness/note', {
            method: 'POST',
            body: {
              item_key: item.item_key,
              supporting_evidence: document.getElementById('rmSupportingEvidence').value.trim() || null,
              note: document.getElementById('rmOperationalNote').value.trim()
            }
          });
          showBanner('Operational note recorded on ' + item.topic + '.', false);
          await loadReadiness();
        } catch (err) {
          showBanner(err.message, true);
        }
      };
    }

    var topForm = document.getElementById('readinessTopUpdateForm');
    if (topForm) {
      var stSel = document.getElementById('rtStatus');
      stSel.onchange = function () {
        document.getElementById('rtNaWrap').hidden = stSel.value !== 'not_applicable';
      };
      topForm.onsubmit = async function (e) {
        e.preventDefault();
        try {
          var out = await apiJson('/api/admin/readiness/update', {
            method: 'POST',
            body: {
              item_key: item.item_key,
              expected_updated_at: item.updated_at,
              status: document.getElementById('rtStatus').value,
              policy_version: document.getElementById('rtPolicyVersion').value.trim() || null,
              decision_recorded: document.getElementById('rtStageDecision').checked,
              implemented_recorded: document.getElementById('rtStageImplemented').checked,
              tested_recorded: document.getElementById('rtStageTested').checked,
              not_applicable_explanation: document.getElementById('rtNaExplanation').value.trim() || null,
              current_practice: document.getElementById('rtCurrentPractice').value.trim(),
              unresolved_questions: document.getElementById('rtUnresolved').value.trim() || null,
              owner_label: document.getElementById('rtOwner').value.trim(),
              target_review_date: document.getElementById('rtTargetDate').value || null,
              next_action: document.getElementById('rtNextAction').value.trim(),
              supporting_evidence: document.getElementById('rtEvidence').value.trim() || null,
              operational_notes: document.getElementById('rtOpNotes').value.trim() || null,
              approved_doc_version: document.getElementById('rtApprovedVersion').value.trim() || null,
              approved_jurisdiction_scope: document.getElementById('rtApprovedScope').value.trim() || null,
              legal_reviewer_name: document.getElementById('rtReviewerName').value.trim() || null,
              legal_reviewed_at: document.getElementById('rtReviewedAt').value || null,
              confidential_counsel_notes: document.getElementById('rtCounselNotes').value.trim() || null,
              mod_counsel_access_granted: document.getElementById('rtModCounselAccess').checked,
              change_summary: document.getElementById('rtChangeSummary').value.trim() || undefined
            }
          });
          if (out.auto_needs_re_review) {
            showBanner('Material policy/practice update saved — prior legal approval was automatically marked "Needs re-review" with history preserved.', false);
          } else {
            showBanner('Readiness item "' + item.topic + '" updated.', false);
          }
          await Promise.all([loadReadiness(), loadOverview()]);
        } catch (err) {
          showBanner(err.message, true);
        }
      };
    }
  }

  // =========================================================================
  // 7. Audit & Activity History
  // =========================================================================
  async function loadAudit(page) {
    state.audit.page = page || 1;
    var stateEl = document.getElementById('auditListState');
    var wrapEl = document.getElementById('auditList');
    stateEl.hidden = false;
    stateEl.className = 'state-box';
    stateEl.textContent = 'Loading audit history…';
    wrapEl.hidden = true;

    var qs = new URLSearchParams({
      page: String(state.audit.page),
      page_size: String(state.audit.pageSize)
    });
    var act = document.getElementById('auditActionFilter').value.trim();
    var vf = document.getElementById('auditVendorFilter').value.trim();
    var af = document.getElementById('auditActorFilter').value.trim();
    if (act) qs.set('action', act);
    if (vf) qs.set('vendor_id', vf);
    if (af) qs.set('actor_id', af);

    try {
      var data = await apiJson('/api/admin/audit?' + qs.toString());
      state.audit.items = Array.isArray(data.entries) ? data.entries : [];
      state.audit.total = Number(data.total) || 0;

      if (!state.audit.items.length) {
        stateEl.textContent = 'No audit log entries match the current filters.';
        renderPager('auditPager', 1, state.audit.pageSize, 0, loadAudit);
        return;
      }

      stateEl.hidden = true;
      wrapEl.hidden = false;
      wrapEl.innerHTML =
        '<table class="admin-table"><thead><tr>' +
        '<th>Timestamp</th><th>Action</th><th>Actor</th><th>Vendor</th><th>Target</th><th>Redacted Metadata</th>' +
        '</tr></thead><tbody>' +
        state.audit.items
          .map(function (row) {
            var meta = row.metadata || {};
            var aobBadge = meta.acting_on_behalf
              ? '<span class="pill pill-danger">ACTING ON BEHALF · ' + esc(meta.effective_vendor_id || row.vendor_id || '') + '</span> ' +
                (meta.support_reason ? '<small>Reason: ' + esc(meta.support_reason) + '</small><br>' : '')
              : '';
            return (
              '<tr>' +
              '<td>' + fmtDate(row.created_at) + '</td>' +
              '<td><code>' + esc(row.action) + '</code></td>' +
              '<td><code>' + esc(row.actor_id || '—') + '</code><br><span class="pill">' + esc(row.actor_role || '—') + '</span></td>' +
              '<td><code>' + esc(row.vendor_id || '—') + '</code></td>' +
              '<td>' + esc(row.target_type) + '<br><small><code>' + esc(row.target_id || '—') + '</code></small></td>' +
              '<td>' + aobBadge + '<code>' + esc(JSON.stringify(meta)) + '</code></td>' +
              '</tr>'
            );
          })
          .join('') +
        '</tbody></table>';

      renderPager('auditPager', state.audit.page, state.audit.pageSize, state.audit.total, loadAudit);
    } catch (err) {
      stateEl.className = 'state-box state-error';
      stateEl.textContent = err.message;
    }
  }

  // =========================================================================
  // 8. Operational Health
  // =========================================================================
  async function loadHealth() {
    var container = document.getElementById('healthContent');
    container.innerHTML = '<div class="state-box">Loading runtime &amp; worker diagnostics…</div>';

    try {
      var ov = await apiJson('/api/admin/overview');
      var healthz = await apiJson('/api/healthz');
      var telemetry = null;
      if (state.isTop) {
        try {
          telemetry = await apiJson('/api/pager/telemetry');
        } catch (_e) {}
      }

      var h = ov.operational_health || {};
      var q = h.outbox_queue || {};
      var wp = h.write_pause || {};

      var telemetryCard = state.isTop && telemetry
        ? '<div class="card-panel"><h2>Pager &amp; Outbox Telemetry (Admin: Top)</h2>' +
          '<div class="kv-grid">' +
          '<div><strong>Push Provider Mode</strong>' + esc(telemetry.runtime_config && telemetry.runtime_config.mode) + '</div>' +
          '<div><strong>Config Valid</strong>' + esc(String(telemetry.runtime_config && telemetry.runtime_config.valid)) + '</div>' +
          '<div><strong>Active Subscriptions</strong>' + Number((telemetry.subscriptions && telemetry.subscriptions.active) || 0) + '</div>' +
          '<div><strong>Sent (24h)</strong>' + Number((telemetry.deliveries_24h && telemetry.deliveries_24h.sent) || 0) + '</div>' +
          '</div></div>'
        : '<div class="card-panel"><h2>Extended Pager Telemetry</h2><p class="record-meta">Detailed delivery telemetry is scoped to <strong>Admin: Top</strong>.</p></div>';

      container.innerHTML =
        '<div class="card-panel"><h2>API &amp; Database Readiness</h2>' +
        '<div class="kv-grid">' +
        '<div><strong>Status</strong>' + statusPill(healthz.status) + '</div>' +
        '<div><strong>Database</strong>' + esc(healthz.db) + '</div>' +
        '<div><strong>Environment</strong>' + esc(healthz.env) + '</div>' +
        '<div><strong>Release SHA</strong><code>' + esc(healthz.release_sha) + '</code></div>' +
        '</div></div>' +
        '<div class="card-panel"><h2>Notification Worker &amp; Write-Pause Posture</h2>' +
        '<div class="kv-grid">' +
        '<div><strong>Push Delivery Mode</strong><code>' + esc(h.push_provider_mode) + '</code></div>' +
        '<div><strong>Write Pause Active</strong>' + (wp.active ? '<span class="pill pill-danger">ACTIVE (' + esc((wp.scopes || []).join(',')) + ')</span>' : '<span class="pill pill-ok">Normal (Unpaused)</span>') + '</div>' +
        '<div><strong>Outbox Pending / Retrying</strong>' + Number(q.pending || 0) + ' / ' + Number(q.retrying || 0) + '</div>' +
        '<div><strong>Dead-Letter / Oldest Age (s)</strong>' + Number(q.dead_letter || 0) + ' / ' + Number(q.oldest_pending_age_sec || 0) + 's</div>' +
        '</div></div>' +
        telemetryCard;
    } catch (err) {
      container.innerHTML = '<div class="state-box state-error">' + esc(err.message) + '</div>';
    }
  }

  // =========================================================================
  // Boot
  // =========================================================================
  async function bootAdminPortal() {
    try {
      var ctx = await apiJson('/api/account/context');
      if (!ctx.authenticated || !ctx.capabilities || !ctx.capabilities.can_access_admin_portal) {
        window.location.href = '/login.html?next=%2Fadmin';
        return;
      }
      state.ctx = ctx;
      state.isTop = Boolean(ctx.admin_level === 'top');
      state.isMod = Boolean(ctx.admin_level === 'mod' || ctx.admin_level === 'top');

      document.getElementById('adminUserEmail').textContent = ctx.user.email;
      document.getElementById('adminUserSub').textContent = (ctx.role_labels || []).join(' · ');

      var badge = document.getElementById('adminRoleBadge');
      badge.textContent = ctx.admin_label || (state.isTop ? 'Admin: Top' : 'Admin: Mod');
      badge.classList.toggle('role-mod', !state.isTop);

      document.getElementById('vpActOnBehalfBtn').hidden = !state.isTop;
      document.getElementById('overviewRoleDescription').textContent = state.isTop
        ? 'Signed in with full Admin: Top governance authority. All operations remain explicit, bounded, and audited.'
        : 'Signed in as Admin: Mod. You have full access to review queues, moderation, issue triage, temporary safety holds, and invitation initiation; final vendor approvals and administrative elevations require Admin: Top.';

      updateInviteFormHints();
      await Promise.all([loadVendorSelectorCatalog(), loadOverview()]);

      var initialHash = String(window.location.hash || '').replace(/^#/, '').trim();
      var initialQuerySec = new URLSearchParams(window.location.search || '').get('section') || '';
      var targetInitialSection = initialHash || initialQuerySec;
      if (['overview', 'applications', 'vendors', 'accounts', 'moderation', 'issues', 'readiness', 'audit', 'health'].indexOf(targetInitialSection) >= 0 && targetInitialSection !== 'overview') {
        switchSection(targetInitialSection);
      }
    } catch (err) {
      showBanner(err.message, true);
    }
  }

  // Wire UI Events
  document.querySelectorAll('.admin-nav-item').forEach(function (btn) {
    btn.addEventListener('click', function () {
      switchSection(btn.dataset.section);
    });
  });

  document.querySelectorAll('.metric-card[data-goto]').forEach(function (card) {
    card.addEventListener('click', function () {
      switchSection(card.dataset.goto, card.dataset.subfilter);
    });
  });

  document.getElementById('vpCustomerPreviewBtn').onclick = launchCustomerPreview;
  document.getElementById('vpVendorPreviewBtn').onclick = function () { launchVendorPreview(); };
  document.getElementById('vpActOnBehalfBtn').onclick = function () { openActOnBehalfModal(); };

  document.getElementById('aobCancelBtn').onclick = function () {
    document.getElementById('aobModal').hidden = true;
  };

  document.getElementById('aobForm').onsubmit = function (e) {
    e.preventDefault();
    var modal = document.getElementById('aobModal');
    var vid = modal.dataset.vendorId;
    var reason = document.getElementById('aobReasonInput').value.trim();
    var errEl = document.getElementById('aobError');
    if (reason.length < 8 || reason.length > 240) {
      errEl.hidden = false;
      errEl.textContent = 'Enter a specific support reason between 8 and 240 characters.';
      return;
    }
    saveViewpointSession({
      mode: 'act_on_behalf',
      vendorId: vid,
      reason: reason,
      readOnly: false,
      startedAt: new Date().toISOString()
    });
    window.location.href = '/?viewpoint=act&vendor_id=' + encodeURIComponent(vid);
  };

  document.getElementById('adminSignOutBtn').onclick = async function () {
    saveViewpointSession(null);
    if (window.bitesharkAuth && typeof window.bitesharkAuth.signOut === 'function') {
      await window.bitesharkAuth.signOut().catch(function () {});
    }
    window.location.href = '/login.html?next=%2Fadmin';
  };

  document.getElementById('refreshOverviewBtn').onclick = loadOverview;
  document.getElementById('refreshAppsBtn').onclick = function () { loadApplications(state.apps.page); };
  document.getElementById('appsFilterForm').onsubmit = function (e) { e.preventDefault(); loadApplications(1); };

  document.getElementById('refreshVendorsBtn').onclick = function () { loadVendors(state.vendors.page); };
  document.getElementById('vendorsFilterForm').onsubmit = function (e) { e.preventDefault(); loadVendors(1); };

  document.getElementById('invRole').onchange = updateInviteFormHints;
  document.getElementById('inviteCreateForm').onsubmit = submitCreateInvitation;
  document.getElementById('refreshAccountsBtn').onclick = function () {
    if (state.acctTab === 'invitations') loadInvitations(state.invitations.page);
    else loadAccounts(state.accounts.page);
  };
  document.querySelectorAll('[data-acct-tab]').forEach(function (btn) {
    btn.onclick = function () { switchAccountsSubtab(btn.dataset.acctTab); };
  });
  document.getElementById('invFilterForm').onsubmit = function (e) { e.preventDefault(); loadInvitations(1); };
  document.getElementById('accountsFilterForm').onsubmit = function (e) { e.preventDefault(); loadAccounts(1); };

  document.querySelectorAll('[data-mod-queue]').forEach(function (btn) {
    btn.onclick = function () {
      state.mod.queue = btn.dataset.modQueue;
      document.querySelectorAll('[data-mod-queue]').forEach(function (b) {
        b.classList.toggle('active', b === btn);
      });
      loadModeration(1);
    };
  });
  document.getElementById('refreshModBtn').onclick = function () { loadModeration(state.mod.page); };
  document.getElementById('modFilterForm').onsubmit = function (e) { e.preventDefault(); loadModeration(1); };

  document.getElementById('refreshIssuesBtn').onclick = function () { loadIssues(state.issues.page); };
  document.getElementById('issuesFilterForm').onsubmit = function (e) { e.preventDefault(); loadIssues(1); };

  document.getElementById('refreshReadinessBtn').onclick = loadReadiness;
  document.getElementById('readinessFilterForm').onsubmit = function (e) { e.preventDefault(); loadReadiness(); };
  document.getElementById('launchReminderOpenReadinessBtn').onclick = function () {
    window.location.hash = 'readiness';
    switchSection('readiness');
  };

  document.getElementById('refreshAuditBtn').onclick = function () { loadAudit(state.audit.page); };
  document.getElementById('auditFilterForm').onsubmit = function (e) { e.preventDefault(); loadAudit(1); };

  document.getElementById('refreshHealthBtn').onclick = loadHealth;

  bootAdminPortal();
})();
