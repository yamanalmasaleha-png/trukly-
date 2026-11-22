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

  var FEATURE_BROADCAST_CHANNEL = 'biteshark_feature_controls_v1';

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
    issues: {
      queue: 'all_active',
      page: 1,
      total: 0,
      pageSize: 15,
      items: [],
      selectedId: null,
      selectedDetail: null,
      staffRoster: [],
      summary: {},
      draftByIssueId: {}
    },
    readiness: { items: [], selectedKey: null, summary: null, statusesCatalog: [] },
    features: {
      canEdit: false,
      configTrusted: true,
      trustError: null,
      controls: [],
      protectedEssentials: [],
      history: [],
      pendingConfirm: null,
      lastTriggerEl: null
    },
    diagnostics: {
      page: 1,
      pageSize: 15,
      total: 0,
      items: [],
      selectedId: null,
      selectedDetail: null,
      permissions: null,
      releases: [],
      retentionPolicy: null,
      activeServerSha: 'dev',
      repoCommitBaseUrl: null
    },
    audit: { page: 1, total: 0, pageSize: 25, items: [] }
  };

  var inviteDraftKey = null;
  var inviteDraftSig = '';

  function adminDiag() {
    return typeof window !== 'undefined' && window.bitesharkDiagnostics ? window.bitesharkDiagnostics : null;
  }

  function adminOpenModal(modalId, opts) {
    var el = document.getElementById(modalId);
    if (!el) return;
    el.hidden = false;
    var d = adminDiag();
    if (d && typeof d.openModalDialog === 'function') {
      d.openModalDialog(
        el,
        Object.assign(
          {
            onClose: function () {
              adminCloseModal(modalId);
            }
          },
          opts || {}
        )
      );
    }
  }

  function adminCloseModal(modalId) {
    var el = document.getElementById(modalId);
    if (!el) return;
    el.hidden = true;
    var d = adminDiag();
    if (d && typeof d.closeModalDialog === 'function') {
      d.closeModalDialog(el);
    }
  }

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

  function fmtUtcIso(val) {
    if (!val) return '—';
    var d = new Date(val);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  }

  function fmtUtcAndLocalHtml(val) {
    if (!val) return '—';
    var d = new Date(val);
    if (Number.isNaN(d.getTime())) return '—';
    var utcStr = d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
    var localStr = d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    return '<code>' + esc(utcStr) + '</code> <span class="diag-ts">(Local: ' + esc(localStr) + ')</span>';
  }

  function safeCommitUrl(baseUrl, sha) {
    if (!baseUrl || !sha) return null;
    var cleanBase = String(baseUrl).trim();
    var cleanSha = String(sha).trim().toLowerCase();
    if (!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/commit\/$/i.test(cleanBase)) return null;
    if (!/^[0-9a-f]{7,40}$/.test(cleanSha)) return null;
    return cleanBase + cleanSha;
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
    var method = String(options.method || 'GET').toUpperCase();
    var isWrite = method !== 'GET' && method !== 'HEAD';
    var d = adminDiag();
    if (d && typeof d.fetchJsonBounded === 'function') {
      var bRes = await d.fetchJsonBounded(url, {
        method: method,
        isWrite: isWrite,
        idempotentWrite: Boolean(options.idempotentWrite),
        credentials: 'same-origin',
        cache: 'no-store',
        headers: options.headers || {},
        body: options.body,
        featureKey: options.featureKey || 'admin_portal',
        operationName: options.operationName || undefined
      });
      if (bRes.status === 401) {
        window.location.href = '/login.html?next=%2Fadmin';
        throw new Error('Your session expired. Redirecting to sign in…');
      }
      if (bRes.status === 403 && bRes.data && bRes.data.code === 'AGE_ASSESSMENT_REQUIRED') {
        var targetNextB = encodeURIComponent((window.location.pathname || '/admin') + (window.location.hash || ''));
        window.location.href = '/login.html?assess=1&next=' + targetNextB;
        throw new Error('One-time minimum account age check (14+) is required before accessing the Admin Portal.');
      }
      if (!bRes.ok) {
        var errMsg =
          (bRes.data && bRes.data.error) || bRes.errorMessage || 'Request failed (' + (bRes.status || 'network') + ')';
        if (bRes.correlationId) {
          errMsg += ' (Support ref: ' + bRes.correlationId + ')';
        }
        var bErr = new Error(errMsg);
        bErr.status = bRes.status;
        bErr.code = (bRes.data && bRes.data.code) || null;
        bErr.correlationId = bRes.correlationId || null;
        bErr.payload = bRes.data || {};
        throw bErr;
      }
      return bRes.data;
    }

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
      err.payload = data;
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
      var p1 = await apiJson('/api/admin/vendors?page=1&page_size=50');
      var allVendors = Array.isArray(p1.vendors) ? p1.vendors.slice() : [];
      if (Number(p1.total) > allVendors.length) {
        var p2 = await apiJson('/api/admin/vendors?page=2&page_size=50');
        if (Array.isArray(p2.vendors)) {
          allVendors = allVendors.concat(p2.vendors);
        }
      }
      state.catalogVendors = allVendors;
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
      updateInviteFormHints();
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
    adminOpenModal('aobModal', { initialFocusSelector: '#aobReasonInput' });
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
    else if (sectionName === 'features') loadFeatures();
    else if (sectionName === 'diagnostics') loadDiagnostics(1);
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
      var ovIssParts = [];
      if (c.critical_open_issues) ovIssParts.push(c.critical_open_issues + ' critical');
      if (c.waiting_for_team_issues) ovIssParts.push(c.waiting_for_team_issues + ' waiting');
      if (c.needs_reassignment_issues) ovIssParts.push(c.needs_reassignment_issues + ' reassign');
      ovIssParts.push((c.overdue_issues || 0) + ' overdue');
      document.getElementById('ovOverdueIssues').textContent = ovIssParts.join(' · ');
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
      setNavBadge('badgeDiagnostics', c.open_diagnostics || 0);

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
      (app.internal_notes
        ? '<div class="diag-callout"><strong>🔒 Existing Internal Notes:</strong><pre style="white-space:pre-wrap;margin:6px 0 0;font-family:inherit;font-size:12px">' +
          esc(app.internal_notes) +
          '</pre></div>'
        : '') +
      '<label>🔒 Append New Internal Note (Confidential — never shown to applicant)' +
      '<textarea id="appInternalNotes" rows="2" maxlength="1800" placeholder="Add a new internal verification note for Mod/Top reviewers…"></textarea></label>' +
      '<label>💬 Applicant-Visible Feedback (Shown to applicant on their status page — not emailed externally)' +
      '<textarea id="appApplicantFeedback" rows="2" maxlength="600" placeholder="Clear instructions if requesting info or explaining decision…">' +
      esc(app.applicant_feedback || '') +
      '</textarea></label>' +
      '<label>Decision / Recommendation Reason (required, 4–600 characters)' +
      '<input type="text" id="appDecisionReason" maxlength="600" placeholder="Document verification basis or reason…">' +
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
      var out = await apiJson('/api/admin/applications/decision', {
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
      var inAppNotice =
        out && out.notification_delivery === 'recorded_in_app_only'
          ? ' Applicant notice recorded on their in-app application status page (not emailed externally).'
          : '';
      showBanner('✓ Saved to server — application "' + app.business_name + '" updated (' + action + ').' + inAppNotice, false);
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

  var pendingInviteAction = null;
  var lastInviteTriggerEl = null;

  function deliveryPillHtml(inv) {
    var ds = inv.delivery_status || 'not_requested';
    var lbl = inv.delivery_status_label || ds;
    var cls = 'pill';
    if (ds === 'provider_accepted') cls = 'pill pill-ok';
    else if (ds === 'delivery_failed' || ds === 'delivery_uncertain') cls = 'pill pill-err';
    else if (ds === 'pending_approval' || ds === 'queued' || ds === 'staging_mailbox_only') cls = 'pill pill-warn';
    return '<span class="' + cls + '">' + esc(lbl) + '</span>';
  }

  function acceptancePillHtml(inv) {
    if (inv.accepted_by_recipient) {
      return '<span class="pill pill-ok">Accepted by recipient</span>';
    }
    if (inv.status === 'pending_top_approval') {
      return '<span class="pill pill-warn">Pending approval</span>';
    }
    if (inv.status === 'revoked' || inv.status === 'rejected' || inv.is_expired) {
      return '<span class="pill">' + esc(inv.acceptance_label || inv.status) + '</span>';
    }
    return '<span class="pill pill-warn">Awaiting recipient acceptance</span>';
  }

  function renderInvitationOutcomeBanner(data, fallbackEmail) {
    var resBox = document.getElementById('invResultBox');
    if (!resBox) return;
    resBox.hidden = false;
    var inv = data.invitation || {};
    var targetEmail = inv.email || fallbackEmail || '';
    var roleLbl = inv.role_label || inv.requested_role_label || inv.requested_role || 'Account';

    if (data.requires_top_approval) {
      resBox.innerHTML =
        '<strong>⏳ Pending Admin: Top Approval:</strong> Invitation for <strong>' +
        esc(targetEmail) +
        '</strong> (' +
        esc(roleLbl) +
        ') was recorded and placed in the Admin: Top approval queue. No active token is issued and no email is sent until approved.';
      return;
    }

    var del = data.delivery || {};
    if (del.status === 'provider_accepted') {
      resBox.innerHTML =
        '<strong>✓ Accepted by Email Provider:</strong> Invitation email for <strong>' +
        esc(targetEmail) +
        '</strong> (<strong>' +
        esc(roleLbl) +
        '</strong> · expires ' +
        fmtDate(inv.expires_at) +
        ') was accepted by the configured mail provider' +
        (del.provider_message_id ? ' (Message ID: <code>' + esc(del.provider_message_id) + '</code>)' : '') +
        '.<br><small>Provider acceptance confirms handoff to the mail service (not inbox receipt). The recipient does <strong>not</strong> hold this role until they verify email ownership via OTP, complete the 14+ age check, and explicitly accept.</small>';
      return;
    }

    if (del.status === 'delivery_failed' || del.status === 'delivery_uncertain') {
      resBox.innerHTML =
        '<strong>⚠ Invitation Saved — ' +
        esc(del.status_label || 'Email Delivery Failed') +
        ':</strong> The invitation record for <strong>' +
        esc(targetEmail) +
        '</strong> (' +
        esc(roleLbl) +
        ') was preserved, but email delivery did not succeed' +
        (del.error_code ? ' (code: <code>' + esc(del.error_code) + '</code>)' : '') +
        (del.correlation_id ? ' [Ref: <code>' + esc(del.correlation_id) + '</code>]' : '') +
        '.<br><small>Use <strong>Resend Email</strong> in the Invitations Queue below after checking Email Readiness, or revoke the invitation if no longer needed.</small>';
      return;
    }

    if (data.accept_path) {
      var fullLink = window.location.origin + data.accept_path;
      resBox.innerHTML =
        '<strong>✓ Staging Mailbox Test Mode (No External Email Sent):</strong> Single-use test link for <strong>' +
        esc(targetEmail) +
        '</strong> (' +
        esc(roleLbl) +
        '):<br><code>' +
        esc(fullLink) +
        '</code>';
      return;
    }

    resBox.innerHTML =
      '<strong>✓ Invitation Updated:</strong> Invitation for <strong>' +
      esc(targetEmail) +
      '</strong> (' +
      esc(roleLbl) +
      ') is now <strong>' +
      esc(del.status_label || inv.status || 'issued') +
      '</strong>.';
  }

  function updateInviteFormHints() {
    var role = document.getElementById('invRole').value;
    var showVendor = role === 'vendor_owner' || role === 'vendor_staff';
    var vendorWrap = document.getElementById('invVendorWrap');
    var vendorSel = document.getElementById('invVendorId');
    if (vendorWrap) vendorWrap.hidden = !showVendor;
    if (vendorSel) {
      vendorSel.required = role === 'vendor_staff';
      var firstOpt = vendorSel.querySelector('option[value=""]');
      if (firstOpt) {
        firstOpt.textContent =
          role === 'vendor_owner'
            ? 'New vendor listing application (or select existing vendor)…'
            : 'Select vendor (required for Vendor Staff)…';
      }
    }

    var isPriv = role === 'mod' || role === 'top';
    var modNotice = document.getElementById('invModElevationNotice');
    var topNotice = document.getElementById('invTopAuthorityNotice');
    var submitBtn = document.getElementById('invSubmitBtn');
    if (modNotice) modNotice.hidden = !(!state.isTop && isPriv);
    if (topNotice) topNotice.hidden = !(state.isTop && role === 'top');
    if (submitBtn) {
      submitBtn.textContent = !state.isTop && isPriv ? 'Submit for Top Approval' : 'Create & Send Invitation';
    }
  }

  async function submitCreateInvitation(e) {
    e.preventDefault();
    var role = document.getElementById('invRole').value;
    var email = document.getElementById('invEmail').value.trim();
    var vendorId = document.getElementById('invVendorId').value;
    var note = document.getElementById('invNote').value.trim();
    var submitBtn = document.getElementById('invSubmitBtn');
    var resBox = document.getElementById('invResultBox');
    resBox.hidden = true;
    if (submitBtn) submitBtn.disabled = true;

    var d = adminDiag();
    var invSig = [email.toLowerCase(), role, vendorId || '', note].join('|');
    if (!inviteDraftKey || inviteDraftSig !== invSig) {
      inviteDraftKey =
        d && typeof d.createIdempotencyKey === 'function'
          ? d.createIdempotencyKey('adinv')
          : 'adinv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
      inviteDraftSig = invSig;
    }

    try {
      var data = await apiJson('/api/admin/invitations/create', {
        method: 'POST',
        idempotentWrite: true,
        featureKey: 'invitations',
        operationName: 'admin.create_invitation',
        body: {
          email: email,
          requested_role: role,
          vendor_id: (role === 'vendor_owner' || role === 'vendor_staff') && vendorId ? vendorId : null,
          note: note,
          idempotency_key: inviteDraftKey
        }
      });
      inviteDraftKey = null;
      inviteDraftSig = '';
      renderInvitationOutcomeBanner(data, email);
      if (data.delivery && (data.delivery.status === 'delivery_failed' || data.delivery.status === 'delivery_uncertain')) {
        showBanner('Invitation created, but email delivery reported "' + (data.delivery.status_label || data.delivery.status) + '". Use Resend Email below to retry.', true);
      } else {
        showBanner('', false);
      }
      document.getElementById('inviteCreateForm').reset();
      updateInviteFormHints();
      loadInvitations(1);
      loadOverview();
    } catch (err) {
      showBanner(err.message, true);
    } finally {
      if (submitBtn) submitBtn.disabled = false;
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
        '<th>Recipient</th><th>Role &amp; Scope</th><th>Approval</th><th>Email Delivery</th><th>Acceptance &amp; Expiry</th><th>Actions</th>' +
        '</tr></thead><tbody>' +
        state.invitations.items
          .map(function (inv) {
            var persistedSt = inv.persisted_status || inv.status;
            var isPriv = inv.requested_role === 'mod' || inv.requested_role === 'top';
            var canManageOwn = state.isTop || inv.initiated_by === state.ctx.user.id;
            var canResend = persistedSt === 'issued' && !inv.accepted_by_recipient && (state.isTop || (!isPriv && canManageOwn));

            var actions = '';
            if (persistedSt === 'pending_top_approval' && state.isTop) {
              actions +=
                '<button type="button" class="admin-btn admin-btn-primary admin-btn-sm" data-inv-act="approve" data-id="' +
                esc(inv.id) +
                '">Approve &amp; Send</button> ' +
                '<button type="button" class="admin-btn admin-btn-danger admin-btn-sm" data-inv-act="reject" data-id="' +
                esc(inv.id) +
                '">Reject</button> ';
            }
            if (canResend) {
              actions +=
                '<button type="button" class="admin-btn admin-btn-primary admin-btn-sm" data-inv-act="resend" data-id="' +
                esc(inv.id) +
                '">Resend Email</button> ';
            }
            if ((persistedSt === 'pending_top_approval' || persistedSt === 'issued') && !inv.accepted_by_recipient && canManageOwn) {
              actions +=
                '<button type="button" class="admin-btn admin-btn-secondary admin-btn-sm" data-inv-act="revoke" data-id="' +
                esc(inv.id) +
                '">Revoke</button> ';
            }
            actions +=
              '<button type="button" class="admin-btn admin-btn-secondary admin-btn-sm" data-inv-history="' +
              esc(inv.id) +
              '">History</button>';

            var scopeHtml = inv.vendor_id
              ? '<div><small>Vendor: <strong>' + esc(inv.vendor_name || inv.vendor_id) + '</strong> (<code>' + esc(inv.vendor_id) + '</code>)</small></div>'
              : inv.requested_role === 'vendor_owner'
                ? '<div><small>New vendor listing application</small></div>'
                : '';

            var approvalHtml =
              '<div>' +
              (inv.approval_required
                ? '<span class="pill pill-warn">Pending Top approval</span>'
                : '<span class="pill pill-ok">' + esc(inv.approval_state_label || 'Approved') + '</span>') +
              '</div><small>Initiator: ' +
              esc(inv.initiator_role) +
              '</small>';

            var deliveryMeta = '';
            if (inv.provider_message_id) {
              deliveryMeta += '<br><small>Msg: <code>' + esc(inv.provider_message_id) + '</code></small>';
            }
            if (inv.last_error_code) {
              deliveryMeta += '<br><small style="color:#8c1d18">Err: <code>' + esc(inv.last_error_code) + '</code></small>';
            }
            if (inv.last_sent_at) {
              deliveryMeta += '<br><small>Sent: ' + fmtDate(inv.last_sent_at) + ' (v' + Number(inv.token_version || 1) + ')</small>';
            }

            var acceptMeta = inv.accepted_by_recipient
              ? '<br><small>Accepted: ' + fmtDate(inv.consumed_at) + '</small>'
              : inv.expires_at
                ? '<br><small>Exp: ' + fmtDate(inv.expires_at) + '</small>'
                : '';

            return (
              '<tr>' +
              '<td><strong>' + esc(inv.email) + '</strong>' + (inv.note ? '<br><small>' + esc(inv.note) + '</small>' : '') + '</td>' +
              '<td><strong>' + esc(inv.role_label) + '</strong>' + scopeHtml + '</td>' +
              '<td>' + approvalHtml + '</td>' +
              '<td>' + deliveryPillHtml(inv) + deliveryMeta + '</td>' +
              '<td>' + acceptancePillHtml(inv) + '<br><small>Created: ' + fmtDate(inv.created_at) + '</small>' + acceptMeta + '</td>' +
              '<td><div class="action-row" style="gap:6px;flex-wrap:wrap">' + actions + '</div></td>' +
              '</tr>'
            );
          })
          .join('') +
        '</tbody></table>';

      wrapEl.querySelectorAll('[data-inv-act]').forEach(function (btn) {
        btn.onclick = function () {
          openInvitationActionModal(btn.dataset.id, btn.dataset.invAct, btn);
        };
      });
      wrapEl.querySelectorAll('[data-inv-history]').forEach(function (btn) {
        btn.onclick = function () {
          openInvitationHistoryModal(btn.dataset.invHistory, btn);
        };
      });

      renderPager('invPager', state.invitations.page, state.invitations.pageSize, state.invitations.total, loadInvitations);
    } catch (err) {
      stateEl.className = 'state-box state-error';
      stateEl.textContent = err.message;
    }
  }

  function openInvitationActionModal(invitationId, action, triggerEl) {
    var inv = (state.invitations.items || []).find(function (x) { return x.id === invitationId; });
    if (!inv) return;
    pendingInviteAction = { invitationId: invitationId, action: action, inv: inv };
    lastInviteTriggerEl = triggerEl || null;

    var modal = document.getElementById('invActionModal');
    var titleEl = document.getElementById('invActionTitle');
    var sumEl = document.getElementById('invActionSummary');
    var reasonEl = document.getElementById('invActionReason');
    var errEl = document.getElementById('invActionError');
    var submitBtn = document.getElementById('invActionSubmitBtn');

    errEl.hidden = true;
    errEl.textContent = '';

    if (action === 'approve') {
      titleEl.textContent = 'Approve & Send Privileged Invitation';
      sumEl.textContent =
        'Approving issues a single-use token and emails ' +
        inv.email +
        ' (' +
        inv.role_label +
        '). The recipient still must verify email ownership and complete the 14+ check before accepting.';
      reasonEl.value = 'Approved after administrator verification';
      submitBtn.textContent = 'Approve & Send Email';
      submitBtn.className = 'admin-btn admin-btn-primary';
    } else if (action === 'resend') {
      titleEl.textContent = 'Resend Invitation Email (Rotate Link)';
      sumEl.textContent =
        'Generates a fresh single-use link for ' +
        inv.email +
        ' (' +
        inv.role_label +
        '), invalidates any earlier unredeemed link, extends expiration to 72 hours, and sends one new email.';
      reasonEl.value =
        inv.delivery_status === 'delivery_failed' || inv.delivery_status === 'delivery_uncertain' || inv.delivery_status === 'not_requested'
          ? 'Sending active invitation email after prior non-delivery'
          : 'Recipient requested fresh invitation email';
      submitBtn.textContent = 'Rotate Link & Send Email';
      submitBtn.className = 'admin-btn admin-btn-primary';
    } else if (action === 'reject') {
      titleEl.textContent = 'Reject Pending Invitation';
      sumEl.textContent = 'Rejects pending invitation for ' + inv.email + ' (' + inv.role_label + '). No token or email will be issued.';
      reasonEl.value = '';
      submitBtn.textContent = 'Reject Invitation';
      submitBtn.className = 'admin-btn admin-btn-danger';
    } else {
      titleEl.textContent = 'Revoke Invitation';
      sumEl.textContent =
        'Immediately invalidates the invitation for ' +
        inv.email +
        ' (' +
        inv.role_label +
        ') so the link can no longer authorize staging registration or role acceptance.';
      reasonEl.value = '';
      submitBtn.textContent = 'Revoke Invitation';
      submitBtn.className = 'admin-btn admin-btn-danger';
    }

    modal.hidden = false;
    reasonEl.focus();
  }

  function closeInvitationActionModal() {
    var modal = document.getElementById('invActionModal');
    if (modal) modal.hidden = true;
    pendingInviteAction = null;
    if (lastInviteTriggerEl && typeof lastInviteTriggerEl.focus === 'function') {
      lastInviteTriggerEl.focus();
    }
    lastInviteTriggerEl = null;
  }

  async function submitInvitationActionModal(e) {
    e.preventDefault();
    if (!pendingInviteAction) return;
    var reasonEl = document.getElementById('invActionReason');
    var errEl = document.getElementById('invActionError');
    var submitBtn = document.getElementById('invActionSubmitBtn');
    var reason = reasonEl.value.trim();
    if (reason.length < 3 || reason.length > 500) {
      errEl.hidden = false;
      errEl.textContent = 'Enter an audit reason between 3 and 500 characters.';
      reasonEl.focus();
      return;
    }

    var targetId = pendingInviteAction.invitationId;
    var act = pendingInviteAction.action;
    var targetEmail = pendingInviteAction.inv ? pendingInviteAction.inv.email : '';
    submitBtn.disabled = true;
    errEl.hidden = true;
    try {
      var out = await apiJson('/api/admin/invitations/decision', {
        method: 'POST',
        body: { invitation_id: targetId, action: act, reason: reason }
      });
      closeInvitationActionModal();
      if (act === 'approve' || act === 'resend') {
        renderInvitationOutcomeBanner(out, targetEmail);
      }
      if (out.delivery && (out.delivery.status === 'delivery_failed' || out.delivery.status === 'delivery_uncertain')) {
        showBanner('Invitation updated, but email delivery reported "' + (out.delivery.status_label || out.delivery.status) + '".', true);
      } else {
        showBanner('Invitation ' + act + ' completed.', false);
      }
      loadInvitations(state.invitations.page);
      loadOverview();
    } catch (err) {
      errEl.hidden = false;
      errEl.textContent = err.message;
    } finally {
      submitBtn.disabled = false;
    }
  }

  function openInvitationHistoryModal(invitationId, triggerEl) {
    var inv = (state.invitations.items || []).find(function (x) { return x.id === invitationId; });
    if (!inv) return;
    lastInviteTriggerEl = triggerEl || null;
    var modal = document.getElementById('invHistoryModal');
    var titleEl = document.getElementById('invHistoryTitle');
    var bodyEl = document.getElementById('invHistoryBody');
    titleEl.textContent = 'Invitation Audit Timeline · ' + inv.email;

    var evs = Array.isArray(inv.events) ? inv.events : [];
    var summaryHtml =
      '<div class="record-meta" style="margin-bottom:12px">' +
      'Role: <strong>' + esc(inv.role_label) + '</strong>' +
      (inv.vendor_id ? ' · Vendor: <code>' + esc(inv.vendor_id) + '</code>' : '') +
      ' · Delivery: <strong>' + esc(inv.delivery_status_label || inv.delivery_status) + '</strong>' +
      ' · Acceptance: <strong>' + esc(inv.acceptance_label || inv.status) + '</strong>' +
      '</div>';

    var listHtml = evs.length
      ? '<div class="thread-list">' +
        evs
          .map(function (ev) {
            return (
              '<div class="thread-item">' +
              '<strong>' + esc(ev.event_type) + '</strong>' +
              (ev.actor_role ? ' <span class="pill">' + esc(ev.actor_role) + '</span>' : '') +
              (ev.actor_id ? ' <small>by <code>' + esc(ev.actor_id) + '</code></small>' : '') +
              ' · <small>' + fmtDate(ev.created_at) + '</small>' +
              (ev.provider_message_id ? '<div><small>Provider Message ID: <code>' + esc(ev.provider_message_id) + '</code></small></div>' : '') +
              (ev.error_code ? '<div><small style="color:#8c1d18">Error Code: <code>' + esc(ev.error_code) + '</code></small></div>' : '') +
              (ev.correlation_id || ev.release_sha
                ? '<div><small>' +
                  (ev.correlation_id ? 'Ref: <code>' + esc(ev.correlation_id) + '</code> ' : '') +
                  (ev.release_sha ? 'Release: <code>' + esc(String(ev.release_sha).slice(0, 12)) + '</code>' : '') +
                  '</small></div>'
                : '') +
              (ev.note ? '<div>' + esc(ev.note) + '</div>' : '') +
              '</div>'
            );
          })
          .join('') +
        '</div>'
      : '<p class="record-meta">Historical invitation created prior to detailed event timeline logging.</p>';

    bodyEl.innerHTML = summaryHtml + listHtml;
    modal.hidden = false;
    document.getElementById('invHistoryCloseBtn').focus();
  }

  function closeInvitationHistoryModal() {
    var modal = document.getElementById('invHistoryModal');
    if (modal) modal.hidden = true;
    if (lastInviteTriggerEl && typeof lastInviteTriggerEl.focus === 'function') {
      lastInviteTriggerEl.focus();
    }
    lastInviteTriggerEl = null;
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
  async function loadSharedPagesModeration(page) {
    state.mod.page = page || 1;
    var stateEl = document.getElementById('modListState');
    var listEl = document.getElementById('modList');
    stateEl.hidden = false;
    stateEl.className = 'state-box';
    stateEl.textContent = 'Loading reported shared pages…';
    listEl.hidden = true;

    try {
      var data = await apiJson(
        '/api/admin/shared-moderation?page=' +
          encodeURIComponent(String(state.mod.page)) +
          '&page_size=' +
          encodeURIComponent(String(state.mod.pageSize))
      );
      state.mod.sharedItems = Array.isArray(data.items) ? data.items : [];
      state.mod.total = Number(data.total) || 0;

      if (!state.mod.sharedItems.length) {
        stateEl.textContent = 'No reported or suppressed shared pages in queue.';
        document.getElementById('modDetailPane').innerHTML =
          '<div class="empty-detail">Select a reported shared page to inspect its allowlisted shared projection and moderation actions.</div>';
        renderPager('modPager', 1, state.mod.pageSize, 0, loadModeration);
        return;
      }

      stateEl.hidden = true;
      listEl.hidden = false;
      listEl.innerHTML = state.mod.sharedItems
        .map(function (it) {
          var isSel = state.mod.selectedSharedId === it.collection_id;
          var colTitle = (it.shared_projection && it.shared_projection.collection && it.shared_projection.collection.title) || it.collection_id;
          return (
            '<button type="button" class="record-card' +
            (isSel ? ' selected' : '') +
            '" data-shared-col-id="' +
            esc(it.collection_id) +
            '">' +
            '<div class="record-card-top"><span class="record-title">' +
            esc(colTitle) +
            '</span><span>' +
            statusPill(it.moderation_status) +
            (it.open_report_count > 0 ? ' <span class="pill pill-danger">🚩 ' + Number(it.open_report_count) + ' open</span>' : '') +
            '</span></div>' +
            '<div class="record-meta">Collection <code>' +
            esc(it.collection_id) +
            '</code> · Share <code>' +
            esc(it.share_id || 'none') +
            '</code> (' +
            esc(it.masked_token_hint || 'revoked') +
            ')</div></button>'
          );
        })
        .join('');

      listEl.querySelectorAll('[data-shared-col-id]').forEach(function (btn) {
        btn.onclick = function () {
          state.mod.selectedSharedId = btn.dataset.sharedColId;
          loadSharedPagesModeration(state.mod.page);
          renderSharedModerationDetail();
        };
      });
      renderPager('modPager', state.mod.page, state.mod.pageSize, state.mod.total, loadModeration);
      if (state.mod.selectedSharedId) renderSharedModerationDetail();
    } catch (err) {
      stateEl.className = 'state-box state-error';
      stateEl.textContent = err.message;
    }
  }

  function renderSharedModerationDetail() {
    var pane = document.getElementById('modDetailPane');
    var items = state.mod.sharedItems || [];
    var it = items.find(function (x) { return x.collection_id === state.mod.selectedSharedId; });
    if (!it) {
      pane.innerHTML = '<div class="empty-detail">Select a reported shared page to review its allowlisted shared content.</div>';
      return;
    }
    var sp = it.shared_projection || {};
    var col = sp.collection || {};
    var cur = sp.curator || {};
    var entries = col.entries || [];
    var reports = it.reports || [];
    var events = it.moderation_events || [];

    var entriesHtml = entries
      .map(function (e) {
        return (
          '<div class="thread-item"><strong>#' +
          Number(e.position) +
          ' · ' +
          esc(e.display_name) +
          '</strong>' +
          (e.recommendation ? '<p>' + esc(e.recommendation) + '</p>' : '') +
          (e.shared_photo
            ? '<div style="margin-top:6px"><img src="' +
              esc(e.shared_photo.image_url) +
              '" alt="Reported shared photo" style="max-width:160px;border-radius:8px;display:block;margin-bottom:6px">' +
              (e.shared_photo.moderation_status === 'suppressed'
                ? '<button type="button" class="admin-btn admin-btn-secondary" data-shmod-act="reinstate_attachment" data-shmod-att="' + esc(e.shared_photo.attachment_id) + '">↺ Reinstate Photo</button>'
                : '<button type="button" class="admin-btn admin-btn-danger" data-shmod-act="suppress_attachment" data-shmod-att="' + esc(e.shared_photo.attachment_id) + '">✕ Suppress Photo</button>') +
              '</div>'
            : '') +
          '</div>'
        );
      })
      .join('');

    var repHtml = reports.length
      ? reports
          .map(function (r) {
            return (
              '<div class="thread-item note-internal"><strong>🚩 ' +
              esc(r.reason) +
              '</strong> ' +
              statusPill(r.status) +
              ' · <small>' +
              fmtDate(r.created_at) +
              '</small><div>' +
              esc(r.details || 'No extra details.') +
              '</div></div>'
            );
          })
          .join('')
      : '<p class="record-meta">No reports filed.</p>';

    var evHtml = events.length
      ? events
          .map(function (ev) {
            return (
              '<div class="thread-item"><strong>' +
              esc(ev.action) +
              '</strong> · <span class="pill">' +
              esc(ev.actor_authority) +
              '</span> · <small>' +
              fmtDate(ev.created_at) +
              '</small><div>Reason: ' +
              esc(ev.reason) +
              '</div></div>'
            );
          })
          .join('')
      : '<p class="record-meta">No moderation actions yet.</p>';

    pane.innerHTML =
      '<div class="detail-head">' +
      statusPill(it.moderation_status) +
      '<h2>' +
      esc(col.title || it.collection_id) +
      '</h2>' +
      '<div class="record-meta">Scoped shared projection only — private journals, notes, and unshared photos are never exposed to moderators.</div></div>' +
      (col.intro ? '<div class="thread-item"><strong>Shared Intro:</strong><p>' + esc(col.intro) + '</p></div>' : '') +
      (cur.included
        ? '<div class="thread-item"><strong>Opted-in Curator Card:</strong> ' +
          esc([cur.display_name, cur.preferred_town, cur.bio].filter(Boolean).join(' · ')) +
          '</div>'
        : '') +
      '<h3>Shared Entries (' + entries.length + ')</h3>' +
      entriesHtml +
      '<h3>Abuse Reports (' + reports.length + ')</h3>' +
      repHtml +
      '<div class="admin-form">' +
      '<label>Moderation Reason (required, 4–400 chars)<input type="text" id="shModReasonInput" maxlength="400" placeholder="Policy basis for suppression, dismissal, or reinstatement…"></label>' +
      '<div class="action-row">' +
      (it.moderation_status === 'active'
        ? '<button type="button" class="admin-btn admin-btn-danger" data-shmod-act="suppress_collection">✕ Suppress Shared Collection</button>'
        : '<button type="button" class="admin-btn admin-btn-primary" data-shmod-act="reinstate_collection">↺ Reinstate Collection</button>') +
      (it.open_report_count > 0
        ? '<button type="button" class="admin-btn admin-btn-secondary" data-shmod-act="dismiss_reports">✓ Dismiss Open Reports</button>'
        : '') +
      '</div></div>' +
      '<div class="admin-form"><h3>Shared Moderation Audit</h3>' +
      evHtml +
      '</div>';

    pane.querySelectorAll('[data-shmod-act]').forEach(function (btn) {
      btn.onclick = async function () {
        var act = btn.dataset.shmodAct;
        var attId = btn.dataset.shmodAtt || null;
        var rVal = (document.getElementById('shModReasonInput') || {}).value || '';
        try {
          await apiJson('/api/admin/shared-moderation/decision', {
            method: 'POST',
            body: {
              collection_id: it.collection_id,
              action: act,
              attachment_id: attId,
              reason: rVal.trim() || 'Reviewed reported shared page'
            }
          });
          showBanner('Shared moderation action "' + act + '" recorded.', false);
          loadSharedPagesModeration(state.mod.page);
        } catch (err) {
          showBanner(err.message, true);
        }
      };
    });
  }

  async function loadModeration(page) {
    if (state.mod.queue === 'shared_pages') {
      return loadSharedPagesModeration(page);
    }
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
  // 6. Support & Feedback Queue + Connected Diagnostics
  // =========================================================================
  function fmtRelativeAge(iso) {
    if (!iso) return '—';
    var ms = Date.now() - new Date(iso).getTime();
    if (!Number.isFinite(ms) || ms < 0) return 'just now';
    var mins = Math.floor(ms / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    var hrs = Math.floor(mins / 60);
    if (hrs < 48) return hrs + 'h ago';
    return Math.floor(hrs / 24) + 'd ago';
  }

  function reporterUrgencyBadge(urg) {
    var u = String(urg || 'normal').toLowerCase();
    if (u === 'critical') return '<span class="pill pill-danger">🔴 Critical reported</span>';
    if (u === 'high') return '<span class="pill pill-warn">High impact</span>';
    if (u === 'feedback') return '<span class="pill pill-info">💡 Feedback</span>';
    if (u === 'low') return '<span class="pill">Low urgency</span>';
    return '<span class="pill">Normal urgency</span>';
  }

  function updateIssueQueueTabBadges(sum) {
    var s = sum || {};
    var labelMap = {
      all_active: 'All Active' + (s.active_total != null ? ' (' + Number(s.active_total) + ')' : ''),
      unassigned: 'Unassigned' + (s.unassigned_count ? ' (' + Number(s.unassigned_count) + ')' : ''),
      mine: 'Assigned to Me' + (s.assigned_to_me_count ? ' (' + Number(s.assigned_to_me_count) + ')' : ''),
      waiting_team: 'Waiting on Team' + (s.waiting_for_team_count ? ' (' + Number(s.waiting_for_team_count) + ')' : ''),
      needs_reassignment: 'Needs Reassignment' + (s.needs_reassignment_count ? ' (' + Number(s.needs_reassignment_count) + ')' : ''),
      escalated: 'Escalated to Top' + (s.escalated_count ? ' (' + Number(s.escalated_count) + ')' : ''),
      all: 'All / History'
    };
    document.querySelectorAll('#issuesQueueTabs [data-iss-queue]').forEach(function (btn) {
      var k = btn.dataset.issQueue;
      if (labelMap[k]) btn.textContent = labelMap[k];
      btn.classList.toggle('active', k === state.issues.queue);
    });
  }

  async function jumpToSupportTicket(issueIdOrTicketNo) {
    if (!issueIdOrTicketNo) return;
    var pane = document.getElementById('issuesDetailPane');
    if (pane) pane.innerHTML = '<div class="state-box">Loading ticket…</div>';
    var resolvedId = issueIdOrTicketNo;
    if (/^BS-[0-9]{6,10}$/i.test(issueIdOrTicketNo)) {
      try {
        var d = await apiJson('/api/admin/issues?ticket_number=' + encodeURIComponent(issueIdOrTicketNo));
        if (d && d.issue && d.issue.id) {
          resolvedId = d.issue.id;
        }
      } catch (_e) {}
    }
    state.issues.queue = 'all';
    state.issues.selectedId = resolvedId;
    var stSel = document.getElementById('issuesStatusFilter');
    if (stSel) stSel.value = 'all';
    switchSection('issues');
  }

  async function jumpToDiagnosticIncident(groupId, corrId) {
    if (groupId) {
      state.diagnostics.selectedId = groupId;
    } else if (corrId) {
      var sInp = document.getElementById('diagSearchInput');
      var wSel = document.getElementById('diagWindowFilter');
      if (sInp) sInp.value = corrId;
      if (wSel) wSel.value = '30d';
    }
    switchSection('diagnostics');
    if (groupId) {
      await selectDiagnosticIncident(groupId);
    }
  }

  async function loadIssues(page) {
    state.issues.page = page || 1;
    var stateEl = document.getElementById('issuesListState');
    var listEl = document.getElementById('issuesList');
    stateEl.hidden = false;
    stateEl.className = 'state-box';
    stateEl.textContent = 'Loading support queue…';
    listEl.hidden = true;

    var rawStatus = document.getElementById('issuesStatusFilter').value;
    var qViewMap = {
      all_active: 'all',
      unassigned: 'unassigned',
      mine: 'assigned_to_me',
      waiting_team: 'waiting_for_team',
      needs_reassignment: 'needs_reassignment',
      escalated: 'escalated',
      all: 'all'
    };
    var effectiveStatus = rawStatus || (state.issues.queue === 'all' ? 'all' : 'open_all');

    var qs = new URLSearchParams({
      page: String(state.issues.page),
      page_size: String(state.issues.pageSize),
      queue_view: qViewMap[state.issues.queue] || 'all',
      status: effectiveStatus,
      severity: document.getElementById('issuesSeverityFilter').value,
      category: document.getElementById('issuesCategoryFilter').value
    });

    var urgEl = document.getElementById('issuesUrgencyFilter');
    if (urgEl && urgEl.value && urgEl.value !== 'all') qs.set('reporter_urgency', urgEl.value);
    var rTypeEl = document.getElementById('issuesReporterTypeFilter');
    if (rTypeEl && rTypeEl.value && rTypeEl.value !== 'all') qs.set('reporter_type', rTypeEl.value);
    var vInp = document.getElementById('issuesVendorFilter');
    if (vInp && vInp.value.trim()) qs.set('vendor_id', vInp.value.trim());
    var dfInp = document.getElementById('issuesDateFrom');
    if (dfInp && dfInp.value) qs.set('date_from', dfInp.value);
    var dtInp = document.getElementById('issuesDateTo');
    if (dtInp && dtInp.value) qs.set('date_to', dtInp.value);
    if (document.getElementById('issuesOverdueOnly').checked) qs.set('overdue_only', '1');
    var q = document.getElementById('issuesSearchInput').value.trim();
    if (q) qs.set('q', q);

    try {
      var data = await apiJson('/api/admin/issues?' + qs.toString());
      state.issues.items = Array.isArray(data.issues) ? data.issues : [];
      state.issues.total = Number(data.total) || 0;
      state.issues.summary = data.summary || {};
      if (Array.isArray(data.staff_roster)) state.issues.staffRoster = data.staff_roster;
      updateIssueQueueTabBadges(state.issues.summary);

      if (!state.issues.items.length) {
        stateEl.textContent = 'No support tickets match the selected queue view and filters.';
        renderPager('issuesPager', 1, state.issues.pageSize, 0, loadIssues);
        return;
      }

      stateEl.hidden = true;
      listEl.hidden = false;
      listEl.innerHTML = state.issues.items
        .map(function (iss) {
          var isSel = state.issues.selectedId === iss.id;
          var tNum = iss.ticket_number || String(iss.id).slice(0, 8);
          var overdueBadge = iss.is_overdue ? ' <span class="pill pill-danger">⏰ Overdue target</span>' : '';
          var waitBadge = iss.waiting_for_team && iss.status !== 'resolved' && iss.status !== 'closed'
            ? ' <span class="pill pill-warn">📬 Waiting on team</span>'
            : '';
          var escBadge = iss.escalated_to_top ? ' <span class="pill pill-top">🔺 Escalated to Top</span>' : '';
          var reassBadge = iss.needs_reassignment ? ' <span class="pill pill-danger">⚠ Inactive assignee</span>' : '';
          var diagBadge = Number(iss.linked_diagnostics_count) > 0
            ? ' <span class="pill pill-info">🔗 ' + Number(iss.linked_diagnostics_count) + ' diag</span>'
            : '';

          return (
            '<button type="button" class="record-card' +
            (isSel ? ' selected' : '') +
            '" data-iss-id="' +
            esc(iss.id) +
            '">' +
            '<div class="record-card-top"><span class="record-title"><code>' +
            esc(tNum) +
            '</code> ' +
            esc(iss.subject) +
            '</span><span>' +
            statusPill(iss.status) +
            ' ' +
            statusPill(iss.severity) +
            ' ' +
            reporterUrgencyBadge(iss.reporter_urgency) +
            overdueBadge +
            waitBadge +
            escBadge +
            reassBadge +
            diagBadge +
            '</span></div>' +
            '<div class="record-meta">' +
            esc(iss.category_label || iss.category) +
            ' · Reporter: <strong>' +
            esc(iss.reporter_email) +
            '</strong> (' +
            esc(iss.reporter_role) +
            (iss.sharing_scope === 'vendor_service' ? ' · shared vendor' : '') +
            ')' +
            (iss.vendor_id ? ' · Vendor: <code>' + esc(iss.vendor_id) + '</code>' : '') +
            '</div>' +
            '<div class="record-meta">Opened ' +
            esc(fmtRelativeAge(iss.created_at)) +
            ' · Activity ' +
            esc(fmtRelativeAge(iss.last_activity_at || iss.updated_at)) +
            ' · Target: ' +
            fmtDate(iss.sla_due_at) +
            ' · Owner: <strong>' +
            esc(iss.assignee_display || 'Unassigned') +
            '</strong></div>' +
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
    pane.innerHTML = '<div class="state-box">Loading ticket details, timeline &amp; diagnostic links…</div>';

    try {
      var data = await apiJson('/api/admin/issues?issue_id=' + encodeURIComponent(issueId));
      state.issues.selectedDetail = data;
      if (Array.isArray(data.staff_roster)) state.issues.staffRoster = data.staff_roster;
      renderIssueDetail(data);
    } catch (err) {
      pane.innerHTML = '<div class="state-box state-error">' + esc(err.message) + '</div>';
    }
  }

  function renderIssueDetail(detailPayload) {
    var pane = document.getElementById('issuesDetailPane');
    var iss = detailPayload && detailPayload.issue ? detailPayload.issue : detailPayload;
    if (!pane || !iss) return;
    var notes = Array.isArray(detailPayload.notes) ? detailPayload.notes : [];
    var events = Array.isArray(detailPayload.events) ? detailPayload.events : [];
    var diagLinks = Array.isArray(detailPayload.diagnostic_links) ? detailPayload.diagnostic_links : [];
    var roster = Array.isArray(detailPayload.staff_roster) ? detailPayload.staff_roster : (state.issues.staffRoster || []);
    var perms = detailPayload.permissions || {};
    var savedDraft = state.issues.draftByIssueId[iss.id] || null;

    // Merge timeline events and notes chronologically for staff inspection
    var combined = [];
    events.forEach(function (ev) {
      combined.push({
        kind: 'event',
        at: ev.created_at,
        visibility: ev.visibility,
        actor: ev.actor_user_id + ' (' + ev.actor_role + ')',
        text: ev.summary
      });
    });
    notes.forEach(function (n) {
      combined.push({
        kind: 'note',
        at: n.created_at,
        visibility: n.visibility,
        role: n.author_role,
        actor: n.author_display_label || n.author_role,
        text: n.body
      });
    });
    combined.sort(function (a, b) {
      return new Date(a.at || 0).getTime() - new Date(b.at || 0).getTime();
    });

    var threadHtml = combined.length
      ? '<div class="thread-list">' +
        combined
          .map(function (item) {
            var isInternal = item.visibility === 'internal';
            if (item.kind === 'event') {
              return (
                '<div class="thread-item ' + (isInternal ? 'note-internal' : '') + '" style="font-size:12px;opacity:0.95">' +
                '<strong>' + (isInternal ? '🔒 Internal Event' : '📌 Public Lifecycle Event') + '</strong> · ' +
                '<small>' + fmtDate(item.at) + ' · ' + esc(item.actor) + '</small>' +
                '<div>' + esc(item.text) + '</div></div>'
              );
            }
            return (
              '<div class="thread-item ' +
              (isInternal ? 'note-internal' : 'note-visible') +
              '">' +
              '<strong>' +
              (isInternal ? '🔒 Internal Staff Note (Never shown to reporter)' : '💬 Public Message (Visible to reporter)') +
              '</strong> · <span class="pill">' +
              esc(item.role) +
              '</span> · <small>' +
              fmtDate(item.at) +
              '</small>' +
              '<div style="margin-top:4px;white-space:pre-wrap">' +
              esc(item.text) +
              '</div></div>'
            );
          })
          .join('') +
        '</div>'
      : '<p class="record-meta">No replies or internal notes yet.</p>';

    // Build assignee dropdown from active roster
    var currentAssigneeInRoster = roster.some(function (r) { return r.user_id === iss.assigned_to; });
    var assigneeOptsHtml =
      '<option value="" ' + (!iss.assigned_to ? 'selected' : '') + '>Unassigned</option>' +
      (iss.assigned_to && !currentAssigneeInRoster
        ? '<option value="' + esc(iss.assigned_to) + '" selected disabled>⚠ Inactive/removed assignee (' + esc(iss.assignee_display || iss.assigned_to) + ') — reassign required</option>'
        : '') +
      roster
        .map(function (r) {
          var isMe = state.ctx && state.ctx.user && r.user_id === state.ctx.user.id;
          var lbl = isMe ? 'Assign to me — ' + r.display_label : r.display_label;
          return '<option value="' + esc(r.user_id) + '" ' + (iss.assigned_to === r.user_id ? 'selected' : '') + '>' + esc(lbl) + '</option>';
        })
        .join('');

    var statusCatalog = [
      { code: 'open', label: 'Received (open)' },
      { code: 'in_review', label: 'In Review' },
      { code: 'in_progress', label: 'In Progress' },
      { code: 'waiting', label: 'Waiting on Reporter' },
      { code: 'resolved', label: 'Resolved' },
      { code: 'closed', label: 'Closed' }
    ];

    var techContextHtml =
      iss.error_correlation_id || iss.affected_feature || iss.server_release_sha || iss.client_build_version || iss.coarse_device_info
        ? '<div class="diag-callout" style="margin:10px 0">' +
          '<strong>Captured Technical Context (Sanitized):</strong>' +
          '<div class="record-meta" style="margin-top:4px">' +
          (iss.error_correlation_id
            ? 'Correlation ID: <code>' + esc(iss.error_correlation_id) + '</code> <button type="button" class="admin-btn admin-btn-secondary admin-btn-sm" id="issJumpCorrBtn" data-corr="' + esc(iss.error_correlation_id) + '">Search in Diagnostics ↗</button> · '
            : '') +
          (iss.affected_feature ? 'Feature: <code>' + esc(iss.affected_feature) + '</code> · ' : '') +
          (iss.operation_name ? 'Op: <code>' + esc(iss.operation_name) + '</code> · ' : '') +
          (iss.server_release_sha ? 'Server SHA: <code>' + esc(String(iss.server_release_sha).slice(0, 12)) + '</code> · ' : '') +
          (iss.client_build_version ? 'Client build: <code>' + esc(iss.client_build_version) + '</code> · ' : '') +
          (iss.coarse_device_info ? 'Device: <code>' + esc(iss.coarse_device_info) + '</code>' : '') +
          '</div></div>'
        : '';

    var diagLinksHtml = diagLinks.length
      ? diagLinks
          .map(function (dl) {
            var inc = dl.incident || {};
            var isSuggested = dl.link_state === 'suggested';
            var coTickets = Array.isArray(dl.other_linked_tickets) ? dl.other_linked_tickets : [];
            return (
              '<div class="iss-diag-link-card' + (isSuggested ? ' is-suggested' : '') + '">' +
              '<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center">' +
              '<div>' +
              '<span class="pill ' + (isSuggested ? 'pill-info' : 'pill-ok') + '">' + (isSuggested ? '💡 Suggested Link (Unconfirmed)' : '🔗 Confirmed Link') + '</span> ' +
              '<strong>' + esc(inc.title || 'Diagnostic Incident') + '</strong>' +
              '</div>' +
              (dl.diagnostic_group_id && !dl.restricted_scope
                ? '<button type="button" class="admin-btn admin-btn-secondary admin-btn-sm" data-open-diag="' + esc(dl.diagnostic_group_id) + '">Open Incident ↗</button>'
                : '') +
              '</div>' +
              (!dl.restricted_scope
                ? '<div class="record-meta" style="margin-top:4px">' +
                  (inc.emitting_component ? '<code>' + esc(inc.emitting_component) + '</code> · ' : '') +
                  (inc.feature_key ? '<code>' + esc(inc.feature_key) + '</code> · ' : '') +
                  (inc.error_code ? '<code>' + esc(inc.error_code) + '</code> · ' : '') +
                  'Triage: <strong>' + esc(inc.triage_status || '—') + '</strong> · ' +
                  'Verification: <strong>' + esc(dl.verification_status || 'unverified') + '</strong>' +
                  (dl.fixing_release_sha ? ' · Fix SHA: <code>' + esc(String(dl.fixing_release_sha).slice(0, 12)) + '</code>' : '') +
                  '</div>'
                : '') +
              '<div class="record-meta" style="margin-top:4px"><strong>Reason:</strong> ' + esc(dl.link_reason) + '</div>' +
              (dl.public_summary
                ? '<div class="record-meta" style="margin-top:4px;color:#14532d"><strong>Public reporter summary:</strong> ' + esc(dl.public_summary) + '</div>'
                : '<div class="record-meta" style="margin-top:4px"><em>Internal link only (no public known-issue summary shown to reporter).</em></div>') +
              (coTickets.length
                ? '<div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;align-items:center"><small style="font-weight:700">Also linked to:</small>' +
                  coTickets
                    .map(function (ct) {
                      return (
                        '<button type="button" class="iss-ticket-chip" data-jump-ticket="' + esc(ct.issue_id) + '">' +
                        '<code>' + esc(ct.ticket_number) + '</code> · ' + esc(ct.status_label || ct.status) +
                        '</button>'
                      );
                    })
                    .join('') +
                  '</div>'
                : '') +
              (!dl.restricted_scope && dl.diagnostic_group_id
                ? '<div class="action-row" style="margin-top:8px">' +
                  (isSuggested
                    ? '<button type="button" class="admin-btn admin-btn-primary admin-btn-sm" data-confirm-diag="' + esc(dl.diagnostic_group_id) + '">✓ Confirm Link</button>'
                    : '') +
                  '<button type="button" class="admin-btn admin-btn-secondary admin-btn-sm" data-edit-diag="' + esc(dl.diagnostic_group_id) + '" data-cur-pub="' + esc(dl.public_summary || '') + '" data-cur-verif="' + esc(dl.verification_status || 'unverified') + '" data-cur-sha="' + esc(dl.fixing_release_sha || '') + '">✎ Public Summary / Verification</button>' +
                  '<button type="button" class="admin-btn admin-btn-secondary admin-btn-sm" data-unlink-diag="' + esc(dl.diagnostic_group_id) + '">Unlink</button>' +
                  '</div>'
                : '') +
              '</div>'
            );
          })
          .join('')
      : '<p class="record-meta">No diagnostic incidents linked to this ticket yet.</p>';

    pane.innerHTML =
      '<div class="detail-head">' +
      '<div>' +
      statusPill(iss.status) + ' ' +
      statusPill(iss.severity) + ' ' +
      reporterUrgencyBadge(iss.reporter_urgency) +
      (iss.is_overdue ? ' <span class="pill pill-danger">⏰ OVERDUE TARGET</span>' : '') +
      (iss.waiting_for_team && iss.status !== 'resolved' && iss.status !== 'closed' ? ' <span class="pill pill-warn">📬 Waiting on team</span>' : '') +
      (iss.escalated_to_top ? ' <span class="pill pill-top">🔺 Escalated to Top</span>' : '') +
      (iss.needs_reassignment ? ' <span class="pill pill-danger">⚠ Inactive assignee</span>' : '') +
      '</div>' +
      '<h2><code>' + esc(iss.ticket_number || '') + '</code> ' + esc(iss.subject) + '</h2>' +
      '<div class="record-meta">UUID: <code>' + esc(iss.id) + '</code> · Reporter: <strong>' + esc(iss.reporter_email) + '</strong> (' + esc(iss.reporter_role) + ' · ' + (iss.sharing_scope === 'vendor_service' ? 'Shared vendor service' : 'Personal') + ')</div>' +
      '</div>' +
      '<div class="kv-grid">' +
      '<div><strong>Category</strong>' + esc(iss.category_label || iss.category) + '</div>' +
      '<div><strong>Reporter Urgency (Immutable)</strong>' + esc(iss.reporter_urgency_label || iss.reporter_urgency) + '</div>' +
      '<div><strong>Staff Priority</strong>' + esc(iss.staff_priority_label || iss.severity) + '</div>' +
      '<div><strong>Linked Vendor</strong><code>' + esc(iss.vendor_id || '—') + '</code></div>' +
      '<div><strong>Current Owner</strong>' + esc(iss.assignee_display || 'Unassigned') + '</div>' +
      '<div><strong>Reopen Count</strong>' + Number(iss.reopen_count || 0) + '</div>' +
      '</div>' +
      techContextHtml +
      '<div class="thread-item"><strong>Original Report (' + fmtDate(iss.created_at) + '):</strong><p style="margin:6px 0 0;white-space:pre-wrap">' + esc(iss.description) + '</p></div>' +
      '<h3>Conversation, Internal Notes &amp; Audit Timeline</h3>' +
      threadHtml +

      '<form class="admin-form" id="issueUpdateForm" style="margin-top:14px;border-top:1px solid var(--border);padding-top:12px">' +
      '<h3>Update Ticket, Ownership &amp; Reply</h3>' +
      '<div class="form-row-2">' +
      '<label>Workflow Status<select id="issEditStatus">' +
      statusCatalog
        .map(function (s) {
          var dis = iss.status === 'closed' && s.code !== 'closed' && !perms.can_reopen_closed ? ' disabled' : '';
          return '<option value="' + s.code + '"' + (iss.status === s.code ? ' selected' : '') + dis + '>' + esc(s.label) + '</option>';
        })
        .join('') +
      '</select></label>' +
      '<label>Staff Priority (Editable)<select id="issEditSeverity">' +
      ['low', 'normal', 'high', 'urgent']
        .map(function (s) { return '<option value="' + s + '" ' + (iss.severity === s ? 'selected' : '') + '>' + s.toUpperCase() + '</option>'; })
        .join('') +
      '</select></label>' +
      '</div>' +
      '<label id="issPriorityReasonWrap" hidden>Reason for Changing Staff Priority (required, 4–500 chars)' +
      '<input type="text" id="issEditPriorityReason" maxlength="500" placeholder="Explain why staff priority differs from previous level…">' +
      '</label>' +
      '<div class="form-row-2">' +
      '<label>Assigned Team Owner<select id="issEditAssignee">' + assigneeOptsHtml + '</select></label>' +
      '<label>Resolution Summary (required to Resolve/Close)<input type="text" id="issEditResolution" value="' + esc((savedDraft && savedDraft.resolution) || iss.resolution_reason || '') + '" maxlength="600" placeholder="Plain-language outcome summary…"></label>' +
      '</div>' +
      '<label id="issAssignReasonWrap" hidden>Assignment / Reassignment Note (optional, required if reassigning another active owner)' +
      '<input type="text" id="issEditAssignReason" maxlength="500" placeholder="Reason for taking over or reassigning ticket…">' +
      '</label>' +
      '<div class="form-row-2" style="align-items:center">' +
      '<label class="checkbox-inline" style="margin:4px 0"><input type="checkbox" id="issEscalateCheck" ' + (iss.escalated_to_top ? 'checked' : '') + (iss.escalated_to_top && !perms.can_clear_escalation ? ' disabled' : '') + '><span>🔺 Escalate to <strong>Admin: Top</strong></span></label>' +
      '<label id="issEscalateReasonWrap" ' + (iss.escalated_to_top ? '' : 'hidden') + '>Escalation Reason<input type="text" id="issEditEscalateReason" value="' + esc(iss.escalation_reason || '') + '" maxlength="500" placeholder="Why Top review is needed…"></label>' +
      '</div>' +
      '<label>Message Visibility' +
      '<select id="issNoteVis">' +
      '<option value="internal"' + (!savedDraft || savedDraft.vis !== 'reporter_visible' ? ' selected' : '') + '>🔒 Internal Staff Note (Confidential — Staff Only)</option>' +
      '<option value="reporter_visible"' + (savedDraft && savedDraft.vis === 'reporter_visible' ? ' selected' : '') + '>💬 Public Reply to Reporter (Shown in user timeline)</option>' +
      '</select></label>' +
      '<div id="issNoteVisCallout" class="iss-vis-callout">🔒 <strong>Internal Staff Note:</strong> Visible only to Admin: Mod and Admin: Top. Never shown or emailed to the reporter.</div>' +
      '<label>Message / Note Body (optional, up to 1500 chars)<textarea id="issNoteBody" rows="3" maxlength="1500" placeholder="Write an internal investigation note or a helpful public reply to the reporter…">' + esc((savedDraft && savedDraft.body) || '') + '</textarea></label>' +
      '<div id="issFormErrBox" class="state-box state-error" hidden style="padding:10px 12px;text-align:left"></div>' +
      '<div class="action-row">' +
      '<button type="submit" class="admin-btn admin-btn-primary" id="issSaveUpdateBtn">Save Ticket Update</button>' +
      '<button type="button" class="admin-btn admin-btn-secondary" id="issAssignMeQuickBtn" ' + (state.ctx && state.ctx.user && iss.assigned_to === state.ctx.user.id ? 'hidden' : '') + '>Assign to Me</button>' +
      '</div>' +
      '</form>' +

      '<section id="issDiagnosticsPanel" style="margin-top:18px;border-top:1px solid var(--border);padding-top:14px">' +
      '<h3>Connected Diagnostic Incidents (' + diagLinks.length + ')</h3>' +
      '<p class="record-meta" style="margin-bottom:8px">Link technical incidents without merging tickets or exposing raw telemetry, stack traces, or other reporters.</p>' +
      diagLinksHtml +
      '<div id="issDiagActionBox" class="card-panel" hidden style="margin:10px 0;padding:12px"></div>' +
      '<div class="card-panel" style="margin-top:10px;padding:12px">' +
      '<strong style="font-size:13px;display:block;margin-bottom:6px">Link Existing Diagnostic Incident</strong>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      '<input type="search" id="issDiagSearchInput" value="' + esc(iss.error_correlation_id || iss.affected_feature || '') + '" placeholder="Search incident title, error code, feature, or corr_…" style="flex:1;min-width:180px;padding:7px 10px;border:1px solid var(--border);border-radius:8px">' +
      '<button type="button" class="admin-btn admin-btn-secondary admin-btn-sm" id="issDiagSearchBtn">Search Incidents</button>' +
      '</div>' +
      '<div id="issDiagSearchResults" style="margin-top:8px"></div>' +
      '</div>' +
      '</section>';

    function syncNoteVisCallout() {
      var v = document.getElementById('issNoteVis').value;
      var box = document.getElementById('issNoteVisCallout');
      if (!box) return;
      if (v === 'reporter_visible') {
        box.className = 'iss-vis-callout is-public';
        box.innerHTML = '💬 <strong>Public Reply to Reporter:</strong> Will appear in the reporter’s BiteShark support timeline as <em>BiteShark Support</em> (your personal staff email is never shown) and trigger an update notification when eligible.';
      } else {
        box.className = 'iss-vis-callout';
        box.innerHTML = '🔒 <strong>Internal Staff Note:</strong> Visible only to Admin: Mod and Admin: Top. Never shown or emailed to the reporter.';
      }
    }
    syncNoteVisCallout();

    document.getElementById('issNoteVis').onchange = syncNoteVisCallout;
    document.getElementById('issEditSeverity').onchange = function () {
      document.getElementById('issPriorityReasonWrap').hidden = document.getElementById('issEditSeverity').value === iss.severity;
    };
    document.getElementById('issEditAssignee').onchange = function () {
      var nextAss = document.getElementById('issEditAssignee').value || null;
      document.getElementById('issAssignReasonWrap').hidden = nextAss === (iss.assigned_to || null);
    };
    document.getElementById('issEscalateCheck').onchange = function () {
      document.getElementById('issEscalateReasonWrap').hidden = !document.getElementById('issEscalateCheck').checked;
    };

    var jumpCorrBtn = document.getElementById('issJumpCorrBtn');
    if (jumpCorrBtn) {
      jumpCorrBtn.onclick = function () {
        jumpToDiagnosticIncident(null, jumpCorrBtn.dataset.corr);
      };
    }

    pane.querySelectorAll('[data-open-diag]').forEach(function (btn) {
      btn.onclick = function () {
        jumpToDiagnosticIncident(btn.dataset.openDiag, null);
      };
    });
    pane.querySelectorAll('[data-jump-ticket]').forEach(function (btn) {
      btn.onclick = function () {
        selectIssueDetail(btn.dataset.jumpTicket);
      };
    });

    var assignMeBtn = document.getElementById('issAssignMeQuickBtn');
    if (assignMeBtn && state.ctx && state.ctx.user) {
      assignMeBtn.onclick = function () {
        var sel = document.getElementById('issEditAssignee');
        if (sel) {
          sel.value = state.ctx.user.id;
          sel.onchange();
        }
      };
    }

    var updDraftKey = null;
    var updDraftSig = '';
    document.getElementById('issueUpdateForm').onsubmit = async function (e) {
      e.preventDefault();
      var saveBtn = document.getElementById('issSaveUpdateBtn');
      var errBox = document.getElementById('issFormErrBox');
      if (errBox) errBox.hidden = true;

      var nextStatus = document.getElementById('issEditStatus').value;
      var nextSev = document.getElementById('issEditSeverity').value;
      var prioReason = document.getElementById('issEditPriorityReason').value.trim();
      var nextAss = document.getElementById('issEditAssignee').value || null;
      var assReason = document.getElementById('issEditAssignReason').value.trim();
      var resReason = document.getElementById('issEditResolution').value.trim();
      var escChecked = document.getElementById('issEscalateCheck').checked;
      var escReason = document.getElementById('issEditEscalateReason').value.trim();
      var noteVis = document.getElementById('issNoteVis').value;
      var noteBody = document.getElementById('issNoteBody').value.trim();

      // Save draft in memory so concurrent 409 or network errors never lose typed staff text
      state.issues.draftByIssueId[iss.id] = {
        vis: noteVis,
        body: noteBody,
        resolution: resReason
      };

      var d = adminDiag();
      var sig = [iss.id, nextStatus, nextSev, nextAss || '', noteVis, noteBody, resReason].join('|');
      if (!updDraftKey || updDraftSig !== sig) {
        updDraftKey =
          d && typeof d.createIdempotencyKey === 'function'
            ? d.createIdempotencyKey('admupd')
            : 'admupd_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
        updDraftSig = sig;
      }

      if (saveBtn) saveBtn.disabled = true;
      try {
        var reqBody = {
          issue_id: iss.id,
          status: nextStatus,
          severity: nextSev,
          assigned_to: nextAss,
          resolution_reason: resReason || undefined,
          note_visibility: noteVis,
          note_body: noteBody || undefined,
          expected_updated_at: iss.updated_at,
          idempotency_key: noteBody ? updDraftKey : undefined
        };
        if (prioReason) reqBody.priority_change_reason = prioReason;
        if (assReason) reqBody.assignment_reason = assReason;
        if (escChecked !== Boolean(iss.escalated_to_top)) {
          reqBody.escalated_to_top = escChecked;
          if (escReason) reqBody.escalation_reason = escReason;
        }

        var out = await apiJson('/api/admin/issues/update', {
          method: 'POST',
          idempotentWrite: Boolean(noteBody),
          featureKey: 'support_issues',
          operationName: 'admin.update_issue',
          body: reqBody
        });
        delete state.issues.draftByIssueId[iss.id];
        updDraftKey = null;
        updDraftSig = '';
        var repNotice =
          out && out.notification_delivery === 'recorded_in_app_only'
            ? ' Recorded in reporter’s in-app timeline (not emailed externally).'
            : out && out.notification_delivery === 'provider_accepted'
              ? ' Update notification accepted by mail provider.'
              : '';
        showBanner('✓ Saved to server — ticket ' + (iss.ticket_number || '') + ' updated.' + repNotice, false);
        await loadIssues(state.issues.page);
        loadOverview();
      } catch (err) {
        showBanner(err.message, true);
        if (errBox) {
          errBox.hidden = false;
          errBox.innerHTML =
            '<div><strong>✕ Could not save update:</strong> ' + esc(err.message) + '</div>' +
            (err.status === 409
              ? '<div style="margin-top:6px"><button type="button" class="admin-btn admin-btn-secondary admin-btn-sm" id="issReloadKeepDraftBtn">↻ Reload latest ticket state (keep my draft)</button></div>'
              : '');
          var relBtn = document.getElementById('issReloadKeepDraftBtn');
          if (relBtn) {
            relBtn.onclick = function () { selectIssueDetail(iss.id); };
          }
        }
        if (saveBtn) saveBtn.disabled = false;
      }
    };

    // Diagnostic link action handlers (confirm, update, unlink, search & link)
    var actionBox = document.getElementById('issDiagActionBox');
    function openDiagLinkEditor(opts) {
      if (!actionBox) return;
      actionBox.hidden = false;
      actionBox.innerHTML =
        '<strong>' + esc(opts.heading) + '</strong>' +
        (opts.needReason
          ? '<label style="display:block;margin-top:8px;font-size:12px;font-weight:600">Reason (required, 3–500 chars)<input type="text" id="issDiagActReason" value="' + esc(opts.defaultReason || '') + '" maxlength="500" style="width:100%;margin-top:3px;padding:6px 9px;border:1px solid var(--border);border-radius:7px"></label>'
          : '') +
        (opts.allowPublicSummary
          ? '<label style="display:block;margin-top:8px;font-size:12px;font-weight:600">Optional Plain-Language Known-Issue Summary for Reporter (leave blank to keep internal-only)<input type="text" id="issDiagActPubSum" value="' + esc(opts.curPub || '') + '" maxlength="235" placeholder="e.g. Our team is investigating intermittent map tile delays." style="width:100%;margin-top:3px;padding:6px 9px;border:1px solid var(--border);border-radius:7px"></label>'
          : '') +
        (opts.allowVerif
          ? '<div class="form-row-2" style="margin-top:8px">' +
            '<label style="font-size:12px;font-weight:600">Verification Status<select id="issDiagActVerif" style="width:100%;margin-top:3px;padding:6px 9px;border:1px solid var(--border);border-radius:7px">' +
            ['unverified', 'pending_release', 'still_reproducing'].concat(perms.can_record_fix_sha ? ['verified_fixed'] : [])
              .map(function (v) { return '<option value="' + v + '"' + (opts.curVerif === v ? ' selected' : '') + '>' + v + '</option>'; })
              .join('') +
            '</select></label>' +
            (perms.can_record_fix_sha
              ? '<label style="font-size:12px;font-weight:600">Fixing Release SHA (Top, optional)<input type="text" id="issDiagActSha" value="' + esc(opts.curSha || '') + '" maxlength="40" placeholder="7–40 hex SHA" style="width:100%;margin-top:3px;padding:6px 9px;border:1px solid var(--border);border-radius:7px"></label>'
              : '') +
            '</div>'
          : '') +
        '<div class="action-row" style="margin-top:10px">' +
        '<button type="button" class="admin-btn admin-btn-primary admin-btn-sm" id="issDiagActSubmitBtn">' + esc(opts.submitLabel) + '</button>' +
        '<button type="button" class="admin-btn admin-btn-secondary admin-btn-sm" id="issDiagActCancelBtn">Cancel</button>' +
        '</div>';

      document.getElementById('issDiagActCancelBtn').onclick = function () {
        actionBox.hidden = true;
        actionBox.innerHTML = '';
      };
      document.getElementById('issDiagActSubmitBtn').onclick = async function () {
        var sBtn = document.getElementById('issDiagActSubmitBtn');
        sBtn.disabled = true;
        try {
          var payload = {
            action: opts.action,
            issue_id: iss.id,
            diagnostic_group_id: opts.groupId
          };
          if (opts.needReason) {
            payload.reason = document.getElementById('issDiagActReason').value.trim();
          }
          if (opts.allowPublicSummary) {
            payload.public_summary = document.getElementById('issDiagActPubSum').value.trim();
          }
          if (opts.allowVerif) {
            payload.verification_status = document.getElementById('issDiagActVerif').value;
            var shaEl = document.getElementById('issDiagActSha');
            if (shaEl) payload.fixing_release_sha = shaEl.value.trim();
          }
          await apiJson('/api/admin/issues/diagnostics', {
            method: 'POST',
            featureKey: 'support_issues',
            operationName: 'admin.link_issue_diagnostic',
            body: payload
          });
          showBanner('✓ Diagnostic incident link updated.', false);
          await selectIssueDetail(iss.id);
          loadIssues(state.issues.page);
        } catch (err) {
          showBanner(err.message, true);
          sBtn.disabled = false;
        }
      };
    }

    pane.querySelectorAll('[data-confirm-diag]').forEach(function (btn) {
      btn.onclick = function () {
        openDiagLinkEditor({
          action: 'confirm',
          groupId: btn.dataset.confirmDiag,
          heading: 'Confirm Suggested Diagnostic Incident Link',
          needReason: true,
          defaultReason: 'Confirmed matching correlation / feature symptom during triage',
          allowPublicSummary: true,
          submitLabel: 'Confirm Link'
        });
      };
    });

    pane.querySelectorAll('[data-edit-diag]').forEach(function (btn) {
      btn.onclick = function () {
        openDiagLinkEditor({
          action: 'update',
          groupId: btn.dataset.editDiag,
          heading: 'Update Known-Issue Summary & Verification',
          needReason: false,
          allowPublicSummary: true,
          allowVerif: true,
          curPub: btn.dataset.curPub || '',
          curVerif: btn.dataset.curVerif || 'unverified',
          curSha: btn.dataset.curSha || '',
          submitLabel: 'Save Link Metadata'
        });
      };
    });

    pane.querySelectorAll('[data-unlink-diag]').forEach(function (btn) {
      btn.onclick = function () {
        openDiagLinkEditor({
          action: 'unlink',
          groupId: btn.dataset.unlinkDiag,
          heading: 'Unlink Diagnostic Incident (Preserves Audit History)',
          needReason: true,
          defaultReason: '',
          allowPublicSummary: false,
          submitLabel: 'Unlink Incident'
        });
      };
    });

    var diagSearchBtn = document.getElementById('issDiagSearchBtn');
    if (diagSearchBtn) {
      diagSearchBtn.onclick = async function () {
        var qVal = document.getElementById('issDiagSearchInput').value.trim();
        var resDiv = document.getElementById('issDiagSearchResults');
        resDiv.innerHTML = '<small>Searching eligible diagnostic incidents…</small>';
        try {
          var qsD = new URLSearchParams({ window: '30d', page_size: '8', include_synthetic: '1' });
          if (qVal) qsD.set('q', qVal);
          var dOut = await apiJson('/api/admin/diagnostics?' + qsD.toString());
          var items = Array.isArray(dOut.items) ? dOut.items : [];
          if (!items.length) {
            resDiv.innerHTML = '<small class="record-meta">No matching diagnostic incidents found in the last 30 days.</small>';
            return;
          }
          resDiv.innerHTML = items
            .map(function (g) {
              return (
                '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:6px 8px;border:1px solid var(--border);border-radius:8px;margin-top:5px;background:#fff;font-size:12px">' +
                '<div><strong>' + esc(g.title) + '</strong><br><code>' + esc(g.feature_key) + '</code> · <code>' + esc(g.error_code) + '</code> · ' + esc(g.triage_status) + ' (×' + Number(g.occurrence_count || 1) + ')</div>' +
                '<button type="button" class="admin-btn admin-btn-secondary admin-btn-sm" data-pick-diag="' + esc(g.id) + '" data-pick-title="' + esc(g.title) + '">Link →</button>' +
                '</div>'
              );
            })
            .join('');
          resDiv.querySelectorAll('[data-pick-diag]').forEach(function (pBtn) {
            pBtn.onclick = function () {
              openDiagLinkEditor({
                action: 'link',
                groupId: pBtn.dataset.pickDiag,
                heading: 'Link Incident: ' + pBtn.dataset.pickTitle,
                needReason: true,
                defaultReason: 'Related symptom reported on ticket ' + (iss.ticket_number || ''),
                allowPublicSummary: true,
                submitLabel: 'Confirm & Link Incident'
              });
            };
          });
        } catch (sErr) {
          resDiv.innerHTML = '<small style="color:#8c1d18">' + esc(sErr.message) + '</small>';
        }
      };
    }
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
  // 7B. Bounded Release-Aware Error & Diagnostics Portal
  // =========================================================================
  function diagSeverityBadge(sev) {
    var s = String(sev || 'error').toLowerCase();
    if (s === 'critical') return '<span class="pill pill-danger">🛑 CRITICAL</span>';
    if (s === 'error') return '<span class="pill pill-danger">✕ ERROR</span>';
    if (s === 'warning') return '<span class="pill pill-warn">⚠ WARNING</span>';
    return '<span class="pill pill-info">ℹ INFO</span>';
  }

  function diagTriageBadge(st) {
    var s = String(st || 'new').toLowerCase();
    if (s === 'resolved') return '<span class="pill pill-ok">✓ Resolved</span>';
    if (s === 'monitoring') return '<span class="pill pill-info">👁 Monitoring</span>';
    if (s === 'investigating') return '<span class="pill pill-warn">🔍 Investigating</span>';
    return '<span class="pill pill-danger">● New</span>';
  }

  async function loadDiagnostics(page, keepSelection) {
    state.diagnostics.page = page || 1;
    var listState = document.getElementById('diagListState');
    var listEl = document.getElementById('diagList');
    if (listState) {
      listState.hidden = false;
      listState.className = 'state-box';
      listState.textContent = 'Loading operational diagnostic incidents…';
    }
    if (listEl) listEl.hidden = true;

    var qs = new URLSearchParams({
      page: String(state.diagnostics.page),
      page_size: String(state.diagnostics.pageSize),
      window: document.getElementById('diagWindowFilter').value || '7d',
      include_synthetic: document.getElementById('diagIncludeSynthetic').checked ? '1' : '0'
    });
    var qVal = document.getElementById('diagSearchInput').value.trim();
    var sevVal = document.getElementById('diagSeverityFilter').value;
    var compVal = document.getElementById('diagComponentFilter').value;
    var featVal = document.getElementById('diagFeatureFilter').value;
    var triVal = document.getElementById('diagTriageFilter').value;
    var relVal = document.getElementById('diagReleaseFilter').value.trim();
    if (qVal) qs.set('q', qVal);
    if (sevVal) qs.set('severity', sevVal);
    if (compVal) qs.set('component', compVal);
    if (featVal) qs.set('feature_key', featVal);
    if (triVal) qs.set('triage_status', triVal);
    if (relVal) qs.set('release_sha', relVal);

    try {
      var data = await apiJson('/api/admin/diagnostics?' + qs.toString());
      state.diagnostics.items = Array.isArray(data.items) ? data.items : [];
      state.diagnostics.total = Number((data.pagination && data.pagination.total) || 0);
      state.diagnostics.permissions = data.permissions || {};
      state.diagnostics.releases = Array.isArray(data.releases) ? data.releases : [];
      state.diagnostics.retentionPolicy = data.retention_policy || null;
      state.diagnostics.activeServerSha = data.active_server_release_sha || 'dev';
      state.diagnostics.repoCommitBaseUrl = data.repository_commit_base_url || null;

      var synthBtn = document.getElementById('diagCreateSyntheticBtn');
      var cleanBtn = document.getElementById('diagRunCleanupBtn');
      if (synthBtn) synthBtn.hidden = !state.diagnostics.permissions.can_create_synthetic;
      if (cleanBtn) cleanBtn.hidden = !state.diagnostics.permissions.can_run_cleanup;

      renderDiagnosticsHeaderStrip(data);
      renderDiagnosticsList();

      var stillExists = Boolean(
        state.diagnostics.selectedId &&
          state.diagnostics.items.some(function (it) {
            return it.id === state.diagnostics.selectedId;
          })
      );
      if (keepSelection && stillExists) {
        await selectDiagnosticIncident(state.diagnostics.selectedId);
        return;
      }
      if (state.diagnostics.items.length > 0) {
        await selectDiagnosticIncident(stillExists ? state.diagnostics.selectedId : state.diagnostics.items[0].id);
      } else {
        state.diagnostics.selectedId = null;
        var emptyPane = document.getElementById('diagDetailPane');
        if (emptyPane) {
          emptyPane.innerHTML = '<div class="state-box">No diagnostic incidents match the current filters.</div>';
        }
      }
    } catch (err) {
      if (listState) {
        listState.hidden = false;
        listState.className = 'state-box state-error';
        listState.textContent = err.message;
      }
    }
  }

  function renderDiagnosticsHeaderStrip(data) {
    var strip = document.getElementById('diagReleaseStrip');
    var kpiRow = document.getElementById('diagSummaryRow');
    var activeSha = data.active_server_release_sha || 'dev';
    var activeCommitLink = safeCommitUrl(data.repository_commit_base_url, activeSha);
    var pol = data.retention_policy || {};
    var perms = data.permissions || {};
    var recentRels = Array.isArray(data.releases) ? data.releases.slice(0, 4) : [];

    var relHistoryHtml = recentRels.length
      ? recentRels
          .map(function (r) {
            var shortSha = String(r.release_sha || '').slice(0, 10);
            var url = safeCommitUrl(data.repository_commit_base_url, r.release_sha);
            var linkHtml = url
              ? '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer"><code>' + esc(shortSha) + '</code></a>'
              : '<code>' + esc(shortSha) + '</code>';
            return linkHtml + ' <span class="diag-ts">(' + esc(fmtUtcIso(r.first_seen_at)) + ')</span>';
          })
          .join(' · ')
      : 'None recorded yet';

    if (strip) {
      strip.innerHTML =
        '<div class="diag-release-row">' +
        '<div><strong>Active Server Release:</strong> ' +
        (activeCommitLink
          ? '<a href="' + esc(activeCommitLink) + '" target="_blank" rel="noopener noreferrer"><code>' + esc(activeSha) + '</code> ↗</a>'
          : '<code>' + esc(activeSha) + '</code>') +
        ' · <strong>Client Bundle:</strong> <code>' +
        esc(data.client_bundle_version || 'unknown') +
        '</code> · <strong>Access Scope:</strong> ' +
        (perms.scope === 'full_sanitized'
          ? '<span class="pill pill-top">Admin: Top · Full Sanitized Scope</span>'
          : '<span class="pill pill-mod">Admin: Mod · Operational Subset</span>') +
        '</div>' +
        '<div><strong>Retention:</strong> Samples ' +
        Number(pol.sample_retention_days || 14) +
        'd · Resolved groups ' +
        Number(pol.resolved_group_retention_days || 30) +
        'd · Open ' +
        Number(pol.open_group_retention_days || 60) +
        'd · Operator notes preserved append-only</div>' +
        '</div>' +
        '<div style="margin-top:6px"><strong>Observed Release Timeline:</strong> ' +
        relHistoryHtml +
        '</div>';
    }

    var sum = data.summary || {};
    if (kpiRow) {
      kpiRow.innerHTML =
        '<div class="diag-kpi-card"><b>' + Number(sum.open_count || 0) + '</b><span>Open live incidents</span></div>' +
        '<div class="diag-kpi-card"><b>' + Number(sum.new_count || 0) + '</b><span>New (untriaged)</span></div>' +
        '<div class="diag-kpi-card"><b>' + Number(sum.critical_or_error_open || 0) + '</b><span>Open Error / Critical</span></div>' +
        '<div class="diag-kpi-card"><b>' + Number(sum.stale_client_groups || 0) + '</b><span>Stale browser tab observed</span></div>' +
        '<div class="diag-kpi-card"><b>' + Number(sum.continued_after_fix_groups || 0) + '</b><span>Continued after suspected fix</span></div>';
    }
  }

  function renderDiagnosticsList() {
    var listState = document.getElementById('diagListState');
    var listEl = document.getElementById('diagList');
    var items = state.diagnostics.items;

    if (!items.length) {
      listState.hidden = false;
      listState.className = 'state-box';
      listState.textContent = 'No diagnostic incidents match the current filters.';
      listEl.hidden = true;
      renderPager('diagPager', 1, state.diagnostics.pageSize, 0, loadDiagnostics);
      return;
    }

    listState.hidden = true;
    listEl.hidden = false;
    listEl.innerHTML = items
      .map(function (g) {
        var rel = g.release_relationship || {};
        var isSelected = g.id === state.diagnostics.selectedId;
        return (
          '<button type="button" class="record-card' +
          (isSelected ? ' selected' : '') +
          '" data-diag-id="' +
          esc(g.id) +
          '">' +
          '<div class="record-card-top">' +
          '<span>' +
          diagSeverityBadge(g.severity) +
          ' ' +
          diagTriageBadge(g.triage_status) +
          (g.is_synthetic_test ? ' <span class="pill pill-info">🧪 SYNTHETIC TEST</span>' : '') +
          '</span>' +
          '<span class="pill">×' +
          Number(g.occurrence_count || 1) +
          '</span>' +
          '</div>' +
          '<div class="record-title">' +
          esc(g.title) +
          '</div>' +
          '<div class="record-meta"><code>' +
          esc(g.emitting_component) +
          '</code> · <code>' +
          esc(g.feature_key) +
          '</code> · <code>' +
          esc(g.error_code) +
          '</code>' +
          (g.notes_count > 0 ? ' · 💬 ' + Number(g.notes_count) + ' note(s)' : '') +
          '</div>' +
          '<div class="record-meta">' +
          esc(g.sanitized_summary) +
          '</div>' +
          '<div class="diag-ts">Last seen: ' +
          esc(fmtUtcIso(g.last_seen_at)) +
          (g.stale_client_observed ? ' · ⚠ Stale client asset observed' : '') +
          (g.continued_after_suspected_fix ? ' · ⚠ Continued after suspected fix' : '') +
          '</div>' +
          (rel.first_observed_code === 'first_observed_after_deployment'
            ? '<div class="diag-ts"><strong>Timing:</strong> ' + esc(rel.first_observed_label) + '</div>'
            : '') +
          '</button>'
        );
      })
      .join('');

    listEl.querySelectorAll('[data-diag-id]').forEach(function (card) {
      card.onclick = function () {
        selectDiagnosticIncident(card.dataset.diagId);
      };
    });

    renderPager(
      'diagPager',
      state.diagnostics.page,
      state.diagnostics.pageSize,
      state.diagnostics.total,
      loadDiagnostics
    );
  }

  async function selectDiagnosticIncident(groupId) {
    state.diagnostics.selectedId = groupId;
    renderDiagnosticsList();
    var pane = document.getElementById('diagDetailPane');
    if (pane) pane.innerHTML = '<div class="state-box">Loading incident details, samples, and operator notes…</div>';

    try {
      var data = await apiJson('/api/admin/diagnostics/detail?id=' + encodeURIComponent(groupId));
      state.diagnostics.selectedDetail = data;
      renderDiagnosticDetail(data);
    } catch (err) {
      if (pane) pane.innerHTML = '<div class="state-box state-error">' + esc(err.message) + '</div>';
    }
  }

  function renderDiagnosticDetail(data) {
    var pane = document.getElementById('diagDetailPane');
    if (!pane || !data || !data.incident) return;
    var g = data.incident;
    var rel = g.release_relationship || {};
    var samples = Array.isArray(data.samples) ? data.samples : [];
    var notes = Array.isArray(data.notes) ? data.notes : [];
    var perms = data.permissions || {};
    var baseUrl = data.repository_commit_base_url || state.diagnostics.repoCommitBaseUrl;

    var observedServerLinks = (Array.isArray(g.observed_server_releases) ? g.observed_server_releases : [])
      .map(function (sha) {
        var u = safeCommitUrl(baseUrl, sha);
        return u
          ? '<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer"><code>' + esc(String(sha).slice(0, 12)) + '</code> ↗</a>'
          : '<code>' + esc(sha) + '</code>';
      })
      .join(', ') || '—';

    var observedClientBuilds = (Array.isArray(g.observed_client_builds) && g.observed_client_builds.length
      ? g.observed_client_builds.map(function (b) { return '<code>' + esc(b) + '</code>'; }).join(', ')
      : 'Server-emitted (no browser asset tag)');

    var fixLinkHtml = g.suspected_fix_sha
      ? (function () {
          var u = safeCommitUrl(baseUrl, g.suspected_fix_sha);
          return u
            ? '<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer"><code>' + esc(g.suspected_fix_sha) + '</code> ↗</a>'
            : '<code>' + esc(g.suspected_fix_sha) + '</code>';
        })()
      : 'None recorded';

    var samplesHtml = samples.length
      ? samples
          .map(function (s) {
            var ctxKeys = s.safe_context && typeof s.safe_context === 'object' ? Object.keys(s.safe_context) : [];
            var ctxStr = ctxKeys.length
              ? ctxKeys
                  .map(function (k) {
                    return esc(k) + '=' + esc(String(s.safe_context[k]));
                  })
                  .join(', ')
              : '';
            return (
              '<div class="diag-sample-card">' +
              '<div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px">' +
              '<span><strong>Occurred:</strong> ' + fmtUtcAndLocalHtml(s.occurred_at) + '</span>' +
              '<span><code>' + esc(s.trust_level) + '</code>' +
              (s.is_stale_client ? ' · <span class="pill pill-warn">Stale Client Tab</span>' : '') +
              '</span>' +
              '</div>' +
              '<div style="margin:4px 0">' + esc(s.sanitized_message) + '</div>' +
              '<div class="diag-ts">' +
              'Server SHA: <code>' + esc(String(s.server_release_sha || '').slice(0, 12)) + '</code>' +
              (s.client_build_version ? ' · Client: <code>' + esc(s.client_build_version) + '</code>' : '') +
              (s.client_loaded_release_sha ? ' (loaded SHA <code>' + esc(String(s.client_loaded_release_sha).slice(0, 12)) + '</code>)' : '') +
              (s.http_status ? ' · HTTP ' + Number(s.http_status) : '') +
              (s.duration_ms != null ? ' · ' + Number(s.duration_ms) + 'ms' : '') +
              (s.correlation_id ? ' · Ref: <code>' + esc(s.correlation_id) + '</code>' : '') +
              (ctxStr ? ' · Context: <code>' + ctxStr + '</code>' : '') +
              '</div>' +
              '</div>'
            );
          })
          .join('')
      : '<p class="record-meta">Representative event samples have aged out under sample retention; grouped incident summary and operator notes remain preserved.</p>';

    var notesHtml = notes.length
      ? notes
          .map(function (n) {
            var transitionText =
              n.action_type !== 'note' && n.new_triage_status
                ? ' · Triage: <code>' + esc(n.previous_triage_status || '—') + ' → ' + esc(n.new_triage_status) + '</code>'
                : '';
            var fixNoteUrl = n.suspected_fix_sha ? safeCommitUrl(baseUrl, n.suspected_fix_sha) : null;
            return (
              '<div class="diag-note-card">' +
              '<div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px">' +
              '<span><strong>' + esc(n.actor_id) + '</strong> (' + esc(String(n.actor_role || '').toUpperCase()) + ')' + transitionText + '</span>' +
              '<span>' + fmtUtcAndLocalHtml(n.created_at) + '</span>' +
              '</div>' +
              (n.suspected_cause ? '<div style="margin-top:4px"><strong>Suspected cause:</strong> ' + esc(n.suspected_cause) + '</div>' : '') +
              (n.suspected_fix_sha
                ? '<div style="margin-top:2px"><strong>Referenced fix SHA:</strong> ' +
                  (fixNoteUrl
                    ? '<a href="' + esc(fixNoteUrl) + '" target="_blank" rel="noopener noreferrer"><code>' + esc(n.suspected_fix_sha) + '</code> ↗</a>'
                    : '<code>' + esc(n.suspected_fix_sha) + '</code>') +
                  '</div>'
                : '') +
              '<p style="margin:6px 0 0;white-space:pre-wrap">' + esc(n.note_body) + '</p>' +
              '</div>'
            );
          })
          .join('')
      : '<p class="record-meta">No operator notes recorded for this incident yet.</p>';

    var triageFormHtml = perms.can_triage
      ? '<form id="diagTriageForm" class="admin-form" style="margin-top:14px;border-top:1px solid var(--border);padding-top:12px">' +
        '<h3>Update Triage &amp; Release Reference (Admin: Top)</h3>' +
        '<p class="record-meta">Resolving an incident or linking a fixing commit SHA preserves all evidence and does <strong>not</strong> by itself prove the defect is resolved.</p>' +
        '<div class="form-grid-2">' +
        '<label>Triage Status' +
        '<select id="diagEditTriage">' +
        ['new', 'investigating', 'monitoring', 'resolved']
          .map(function (st) {
            return '<option value="' + st + '"' + (g.triage_status === st ? ' selected' : '') + '>' + st.charAt(0).toUpperCase() + st.slice(1) + '</option>';
          })
          .join('') +
        '</select></label>' +
        '<label>Suspected Fixing Commit SHA (optional, 7–40 hex)' +
        '<input type="text" id="diagEditFixSha" maxlength="40" value="' + esc(g.suspected_fix_sha || '') + '" placeholder="e.g. 95f2e473668b">' +
        '</label>' +
        '</div>' +
        '<label>Suspected Cause Hypothesis (optional, distinct from deployment timing)' +
        '<input type="text" id="diagEditCause" maxlength="500" value="' + esc(g.suspected_cause || '') + '" placeholder="Document confirmed or suspected root cause…">' +
        '</label>' +
        '<label>Operator Triage Note (required, 4–1500 chars)' +
        '<textarea id="diagTriageNote" rows="2" required minlength="4" maxlength="1500" placeholder="Explain investigation findings, mitigation, or why status changed…"></textarea>' +
        '</label>' +
        '<button type="submit" class="admin-btn admin-btn-primary" id="diagSaveTriageBtn">Save Triage &amp; Append History</button>' +
        '</form>'
      : '<div class="diag-callout">Triage state transitions and fixing commit links require <strong>Admin: Top</strong>. As <strong>Admin: Mod</strong>, you can add timestamped operational notes below.</div>';

    var addNoteFormHtml =
      '<form id="diagNoteForm" class="admin-form" style="margin-top:14px;border-top:1px solid var(--border);padding-top:12px">' +
      '<h3>Add Timestamped Operator Note (' + (state.isTop ? 'Admin: Top' : 'Admin: Mod') + ')</h3>' +
      '<label>Operational Note (required, 4–1500 chars — never paste secrets or customer PII)' +
      '<textarea id="diagNewNoteBody" rows="2" required minlength="4" maxlength="1500" placeholder="Add context, customer ticket cross-reference, or observation…"></textarea>' +
      '</label>' +
      '<button type="submit" class="admin-btn admin-btn-secondary" id="diagSaveNoteBtn">Append Operator Note</button>' +
      '</form>';

    pane.innerHTML =
      '<div class="detail-head">' +
      '<div>' +
      diagSeverityBadge(g.severity) +
      ' ' +
      diagTriageBadge(g.triage_status) +
      (g.is_synthetic_test ? ' <span class="pill pill-info">🧪 SYNTHETIC TEST DATA</span>' : '') +
      (!g.mod_visible ? ' <span class="pill pill-top">🔒 Top-Only Scope</span>' : '') +
      '</div>' +
      '<h2>' + esc(g.title) + '</h2>' +
      '<div class="record-meta">Fingerprint: <code>' + esc(g.fingerprint) + '</code> · Occurrences: <strong>' + Number(g.occurrence_count || 1) + '</strong></div>' +
      '</div>' +

      (g.is_synthetic_test
        ? '<div class="diag-callout is-synthetic"><strong>🧪 Synthetic Verification Incident:</strong> Explicitly generated by an authorized operator to verify diagnostic reporting, search, and notes. No customer workflow was impacted.</div>'
        : '') +

      '<div class="diag-callout' + (g.continued_after_suspected_fix ? ' is-warn' : '') + '">' +
      '<div><strong>Release Timing (Not Causation):</strong> ' + esc(rel.first_observed_label || '—') + '</div>' +
      '<div style="margin-top:4px"><strong>Recorded Hypothesis:</strong> ' + (g.suspected_cause ? esc(g.suspected_cause) : '<em>Unconfirmed — timing after a deployment does not by itself prove that change introduced the issue.</em>') + '</div>' +
      '<div style="margin-top:4px"><strong>Fix Tracking:</strong> ' + esc(rel.fix_state_label || '—') + ' (' + fixLinkHtml + ')</div>' +
      (rel.stale_client_note ? '<div style="margin-top:4px"><strong>⚠ Browser vs Server Build:</strong> ' + esc(rel.stale_client_note) + '</div>' : '') +
      '</div>' +

      '<div class="kv-grid">' +
      '<div><strong>First Seen</strong>' + fmtUtcAndLocalHtml(g.first_seen_at) + '</div>' +
      '<div><strong>Last Seen</strong>' + fmtUtcAndLocalHtml(g.last_seen_at) + '</div>' +
      '<div><strong>Emitting Component</strong><code>' + esc(g.emitting_component) + '</code> (<code>' + esc(g.trust_level) + '</code>)</div>' +
      '<div><strong>Feature / Operation</strong><code>' + esc(g.feature_key) + '</code> · <code>' + esc(g.operation_name) + '</code></div>' +
      '<div><strong>Route Template</strong><code>' + esc(g.route_template || 'n/a') + '</code></div>' +
      '<div><strong>Error Code / Outcome</strong><code>' + esc(g.error_code) + '</code> · <code>' + esc(g.outcome_state || 'failed') + '</code>' + (g.retryable === true ? ' (retryable)' : g.retryable === false ? ' (non-retryable)' : '') + '</div>' +
      '<div><strong>Observed Server Releases</strong>' + observedServerLinks + '</div>' +
      '<div><strong>Observed Browser Builds</strong>' + observedClientBuilds + '</div>' +
      '<div><strong>Latest Correlation ID</strong>' +
      (g.last_correlation_id
        ? '<code class="diag-code-inline">' + esc(g.last_correlation_id) + '</code> <button type="button" class="admin-btn admin-btn-secondary admin-btn-sm" id="diagCopyCorrBtn" data-corr="' + esc(g.last_correlation_id) + '">Copy</button>'
        : '—') +
      '</div>' +
      '</div>' +

      '<div style="margin-top:12px"><strong>Sanitized Explanation:</strong><p style="margin:4px 0">' + esc(g.sanitized_summary) + '</p></div>' +
      '<div style="margin-top:8px"><strong>User-Visible Impact:</strong><p style="margin:4px 0">' + esc(g.user_impact) + '</p></div>' +
      '<div style="margin-top:8px"><strong>Safe Operator Next Steps:</strong><p style="margin:4px 0">' + esc(g.safe_next_steps) + '</p></div>' +

      (function () {
        var linkedTickets = Array.isArray(data.linked_tickets) ? data.linked_tickets : [];
        var confirmedOpenCount = linkedTickets.filter(function (lt) {
          return lt.link_state === 'confirmed' && lt.status !== 'resolved' && lt.status !== 'closed';
        }).length;
        var ltListHtml = linkedTickets.length
          ? '<div style="display:flex;flex-wrap:wrap;gap:6px;margin:8px 0">' +
            linkedTickets
              .map(function (lt) {
                return (
                  '<button type="button" class="iss-ticket-chip" data-diag-jump-ticket="' + esc(lt.issue_id) + '">' +
                  (lt.link_state === 'suggested' ? '💡 ' : '🔗 ') +
                  '<code>' + esc(lt.ticket_number) + '</code> · ' +
                  esc(lt.status_label || lt.status) + ' (' + esc(lt.reporter_context) + ')' +
                  '</button>'
                );
              })
              .join('') +
            '</div>'
          : '<p class="record-meta">No support tickets are currently linked to this incident.</p>';

        var notifyBoxHtml = confirmedOpenCount > 0
          ? '<div class="card-panel" style="margin-top:10px;padding:12px">' +
            '<strong style="font-size:13px;display:block;margin-bottom:4px">Reviewed Public Update to Linked Open Tickets (' + confirmedOpenCount + ' eligible)</strong>' +
            '<p class="record-meta" style="margin-bottom:8px">Posts a reviewed plain-language status note onto confirmed open tickets without merging or auto-closing any ticket. Always preview recipients first.</p>' +
            '<textarea id="diagNotifyTicketsMsg" rows="2" maxlength="800" placeholder="Plain-language update for reporters (10–800 chars, no raw logs or secrets)…" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:8px;font-family:inherit;font-size:13px"></textarea>' +
            '<div class="action-row" style="margin-top:8px">' +
            '<button type="button" class="admin-btn admin-btn-secondary admin-btn-sm" id="diagPreviewNotifyBtn">1. Preview Recipients</button>' +
            '<button type="button" class="admin-btn admin-btn-primary admin-btn-sm" id="diagConfirmNotifyBtn" hidden>2. Confirm &amp; Post Public Update</button>' +
            '</div>' +
            '<div id="diagNotifyPreviewResult" style="margin-top:8px" hidden></div>' +
            '</div>'
          : '';

        return (
          '<h3 style="margin-top:16px">Connected Support Tickets (' + linkedTickets.length + ')</h3>' +
          ltListHtml +
          notifyBoxHtml
        );
      })() +

      '<h3 style="margin-top:16px">Representative Sanitized Event Samples (' + samples.length + ')</h3>' +
      samplesHtml +

      '<h3 style="margin-top:16px">Operator Notes &amp; Triage History (' + notes.length + ')</h3>' +
      notesHtml +
      triageFormHtml +
      addNoteFormHtml;

    pane.querySelectorAll('[data-diag-jump-ticket]').forEach(function (btn) {
      btn.onclick = function () {
        jumpToSupportTicket(btn.dataset.diagJumpTicket);
      };
    });

    var prevNotifBtn = document.getElementById('diagPreviewNotifyBtn');
    var confNotifBtn = document.getElementById('diagConfirmNotifyBtn');
    var prevResBox = document.getElementById('diagNotifyPreviewResult');
    if (prevNotifBtn && confNotifBtn && prevResBox) {
      var msgInput = document.getElementById('diagNotifyTicketsMsg');
      msgInput.oninput = function () {
        confNotifBtn.hidden = true;
        prevResBox.hidden = true;
      };
      prevNotifBtn.onclick = async function () {
        var msgVal = msgInput.value.trim();
        prevNotifBtn.disabled = true;
        try {
          var pOut = await apiJson('/api/admin/diagnostics/notify-tickets', {
            method: 'POST',
            body: { group_id: g.id, mode: 'preview', message: msgVal }
          });
          var recs = Array.isArray(pOut.recipients) ? pOut.recipients : [];
          prevResBox.hidden = false;
          prevResBox.innerHTML =
            '<div class="diag-callout">' +
            '<strong>Recipient Preview (' + Number(pOut.recipient_count || 0) + ' open ticket(s) will receive this update' +
            (pOut.already_sent_count ? ', ' + Number(pOut.already_sent_count) + ' already sent' : '') +
            (pOut.excluded_inactive_count ? ', ' + Number(pOut.excluded_inactive_count) + ' resolved/closed skipped' : '') +
            '):</strong>' +
            '<ul style="margin:6px 0 0 18px;font-size:12px">' +
            recs
              .map(function (r) {
                return (
                  '<li><code>' + esc(r.ticket_number) + '</code> — ' + esc(r.subject) +
                  ' (' + esc(r.status_label) + ' · ' + esc(r.recipient_masked || r.reporter_context) + ')' +
                  (r.already_sent ? ' <em>[Already sent]</em>' : '') +
                  '</li>'
                );
              })
              .join('') +
            '</ul></div>';
          confNotifBtn.hidden = Number(pOut.recipient_count || 0) <= 0;
        } catch (pErr) {
          showBanner(pErr.message, true);
        } finally {
          prevNotifBtn.disabled = false;
        }
      };

      confNotifBtn.onclick = async function () {
        var msgVal = msgInput.value.trim();
        confNotifBtn.disabled = true;
        try {
          var sOut = await apiJson('/api/admin/diagnostics/notify-tickets', {
            method: 'POST',
            idempotentWrite: true,
            body: { group_id: g.id, mode: 'send', confirmed: true, message: msgVal }
          });
          showBanner('✓ Posted reviewed public update to ' + Number(sOut.posted_count || 0) + ' linked open ticket(s).', false);
          await selectDiagnosticIncident(g.id);
        } catch (sErr) {
          showBanner(sErr.message, true);
          confNotifBtn.disabled = false;
        }
      };
    }

    var copyBtn = document.getElementById('diagCopyCorrBtn');
    if (copyBtn) {
      copyBtn.onclick = function () {
        var c = copyBtn.getAttribute('data-corr') || '';
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(c).then(function () {
            copyBtn.textContent = 'Copied ✓';
          });
        }
      };
    }

    var triageForm = document.getElementById('diagTriageForm');
    if (triageForm) {
      triageForm.onsubmit = function (e) {
        e.preventDefault();
        submitDiagnosticTriage(g.id);
      };
    }

    var noteForm = document.getElementById('diagNoteForm');
    if (noteForm) {
      noteForm.onsubmit = function (e) {
        e.preventDefault();
        submitDiagnosticNote(g.id);
      };
    }
  }

  async function submitDiagnosticTriage(groupId) {
    var btn = document.getElementById('diagSaveTriageBtn');
    if (btn) btn.disabled = true;
    try {
      await apiJson('/api/admin/diagnostics/triage', {
        method: 'POST',
        body: {
          group_id: groupId,
          triage_status: document.getElementById('diagEditTriage').value,
          suspected_fix_sha: document.getElementById('diagEditFixSha').value.trim(),
          suspected_cause: document.getElementById('diagEditCause').value.trim(),
          note_body: document.getElementById('diagTriageNote').value.trim()
        }
      });
      showBanner('✓ Saved to server — triage status and operator history updated (evidence preserved).', false);
      await loadDiagnostics(state.diagnostics.page, true);
      loadOverview();
    } catch (err) {
      showBanner(err.message, true);
      if (btn) btn.disabled = false;
    }
  }

  async function submitDiagnosticNote(groupId) {
    var btn = document.getElementById('diagSaveNoteBtn');
    if (btn) btn.disabled = true;
    try {
      await apiJson('/api/admin/diagnostics/note', {
        method: 'POST',
        body: {
          group_id: groupId,
          note_body: document.getElementById('diagNewNoteBody').value.trim()
        }
      });
      showBanner('✓ Operator note appended to incident history.', false);
      await selectDiagnosticIncident(groupId);
      loadDiagnostics(state.diagnostics.page, true);
    } catch (err) {
      showBanner(err.message, true);
      if (btn) btn.disabled = false;
    }
  }

  async function createSyntheticDiagnosticProbe() {
    var btn = document.getElementById('diagCreateSyntheticBtn');
    if (btn) btn.disabled = true;
    try {
      var out = await apiJson('/api/admin/diagnostics/synthetic-test', {
        method: 'POST',
        body: { label: 'Admin portal verification' }
      });
      document.getElementById('diagIncludeSynthetic').checked = true;
      state.diagnostics.selectedId = out.group_id || null;
      showBanner('🧪 Recorded clearly labeled [SYNTHETIC TEST] verification incident (Ref: ' + (out.correlation_id || 'n/a') + ').', false);
      await loadDiagnostics(1, true);
    } catch (err) {
      showBanner(err.message, true);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function runDiagnosticsRetentionCleanup() {
    var btn = document.getElementById('diagRunCleanupBtn');
    if (btn) btn.disabled = true;
    try {
      var out = await apiJson('/api/admin/diagnostics/cleanup', {
        method: 'POST',
        body: {}
      });
      showBanner(
        '🧹 Retention cleanup completed: ' +
          Number(out.deleted_samples || 0) +
          ' expired sample(s) and ' +
          Number((out.deleted_aged_groups || 0) + (out.deleted_overflow_groups || 0)) +
          ' aged/overflow group(s) removed; 0 operator notes deleted.',
        false
      );
      await loadDiagnostics(1, true);
    } catch (err) {
      showBanner(err.message, true);
    } finally {
      if (btn) btn.disabled = false;
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
      var telemetryErr = null;
      var emailReadiness = null;
      var emailReadinessErr = null;
      if (state.isTop) {
        try {
          telemetry = await apiJson('/api/pager/telemetry');
        } catch (tErr) {
          telemetryErr = tErr;
        }
        try {
          emailReadiness = await apiJson('/api/admin/email-readiness');
        } catch (eErr) {
          emailReadinessErr = eErr;
        }
      }

      var h = ov.operational_health || {};
      var q = h.outbox_queue || {};
      var wp = h.write_pause || {};

      var telemetryCard = !state.isTop
        ? '<div class="card-panel"><h2>Extended Pager Telemetry</h2><p class="record-meta">Detailed delivery telemetry is scoped to <strong>Admin: Top</strong>.</p></div>'
        : telemetryErr
          ? '<div class="card-panel"><h2>Pager &amp; Outbox Telemetry (Admin: Top)</h2><div class="state-box state-error">⏸ Could not load pager telemetry: ' + esc(telemetryErr.message) + '</div></div>'
          : '<div class="card-panel"><h2>Pager &amp; Outbox Telemetry (Admin: Top)</h2>' +
            '<div class="kv-grid">' +
            '<div><strong>Push Provider Mode</strong><code>' + esc((telemetry.runtime_config && (telemetry.runtime_config.provider_mode || telemetry.runtime_config.mode)) || 'disabled') + '</code></div>' +
            '<div><strong>Config Valid</strong>' + esc(String(Boolean(telemetry.runtime_config && (telemetry.runtime_config.config_valid ?? telemetry.runtime_config.valid)))) + '</div>' +
            '<div><strong>Active Subscriptions</strong>' + Number((telemetry.subscriptions && telemetry.subscriptions.active) || 0) + '</div>' +
            '<div><strong>Delivered (24h)</strong>' + Number((telemetry.deliveries_24h && (telemetry.deliveries_24h.delivered ?? telemetry.deliveries_24h.sent)) || 0) + '</div>' +
            '</div></div>';

      var emailCard = '';
      if (!state.isTop) {
        emailCard = '<div class="card-panel"><h2>Authentication Email Readiness</h2><p class="record-meta">Email delivery &amp; sender-domain diagnostics are scoped to <strong>Admin: Top</strong>.</p></div>';
      } else if (emailReadinessErr) {
        emailCard = '<div class="card-panel"><h2>Authentication Email Readiness (Admin: Top)</h2><div class="state-box state-error">⏸ Could not load email readiness: ' + esc(emailReadinessErr.message) + '</div></div>';
      } else if (emailReadiness) {
        var eCfg = emailReadiness.configuration || {};
        var eDns = emailReadiness.sender_domain_dns || null;
        var lastTest = emailReadiness.last_successful_designated_test;
        var failures = Array.isArray(emailReadiness.recent_failures) ? emailReadiness.recent_failures : [];
        var steps = Array.isArray(emailReadiness.required_next_steps) ? emailReadiness.required_next_steps : [];

        var dnsHtml = eDns
          ? '<div class="kv-grid" style="margin-top:10px">' +
            '<div><strong>Inspected Domain</strong><code>' + esc(eDns.domain) + '</code></div>' +
            '<div><strong>SPF Status</strong><code>' + esc(eDns.spf && eDns.spf.status) + '</code></div>' +
            '<div><strong>DMARC Status</strong><code>' + esc((eDns.dmarc && eDns.dmarc.status) + (eDns.dmarc && eDns.dmarc.policy ? ' (p=' + eDns.dmarc.policy + ')' : '')) + '</code></div>' +
            '<div><strong>DKIM / Return-Path</strong><code>' + esc((eDns.resend_dkim && eDns.resend_dkim.status) + ' / ' + (eDns.return_path_send && eDns.return_path_send.status)) + '</code></div>' +
            '</div>'
          : '<p class="record-meta" style="margin-top:8px">Sender domain DNS check unavailable until a domain or public origin is configured.</p>';

        var failHtml = failures.length
          ? '<div style="margin-top:10px"><strong>Sanitized Recent Delivery Failures (' + failures.length + ')</strong><ul style="margin:6px 0 0 18px;font-size:12.5px">' +
            failures.slice(0, 5).map(function (f) {
              return '<li><code>' + esc(f.correlation_id) + '</code> · ' + esc(f.outcome_stage) +
                (f.provider_status ? ' (provider HTTP ' + Number(f.provider_status) + ')' : '') +
                (f.error_code ? ' · <code>' + esc(f.error_code) + '</code>' : '') +
                ' · ' + esc(f.created_at) + '</li>';
            }).join('') +
            '</ul></div>'
          : '<p class="record-meta" style="margin-top:8px">No recent provider delivery failures recorded.</p>';

        var stepsHtml = steps.length
          ? '<div style="margin-top:10px"><strong>Required Next Steps</strong><ul style="margin:6px 0 0 18px;font-size:12.5px">' +
            steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') +
            '</ul></div>'
          : '';

        emailCard =
          '<div class="card-panel" id="emailReadinessCard"><h2>Authentication Email Readiness (Admin: Top)</h2>' +
          '<div class="kv-grid">' +
          '<div><strong>Effective Mode</strong><code>' + esc(emailReadiness.effective_mode) + '</code></div>' +
          '<div><strong>Real Email Enabled</strong>' + (emailReadiness.real_email_enabled ? '<span class="pill pill-ok">Yes</span>' : '<span class="pill pill-warn">No (Protected Staging / Disabled)</span>') + '</div>' +
          '<div><strong>Config Valid</strong>' + (emailReadiness.config_valid ? '<span class="pill pill-ok">Valid</span>' : '<span class="pill pill-danger">Invalid</span>') + '</div>' +
          '<div><strong>API Key / Sender</strong>' + (eCfg.api_key_present ? 'Key set' : 'Key unset') + ' · ' + (eCfg.sender_domain ? esc(eCfg.sender_domain) : 'Sender unset') + '</div>' +
          '</div>' +
          dnsHtml +
          '<p class="record-meta" style="margin-top:8px"><strong>Last Designated Provider Acceptance:</strong> ' +
          (lastTest ? ('<code>' + esc(lastTest.correlation_id) + '</code>' + (lastTest.provider_message_id ? ' (msg <code>' + esc(lastTest.provider_message_id) + '</code>)' : '') + ' at ' + esc(lastTest.created_at)) : 'None recorded') +
          '</p>' +
          failHtml +
          stepsHtml +
          '</div>';
      }

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
        '<div><strong>Last Worker Heartbeat</strong>' + (h.last_worker_run_at ? fmtUtcAndLocalHtml(h.last_worker_run_at) + ' (' + esc(h.worker_status || 'ok') + ')' : 'No worker heartbeat recorded yet') + '</div>' +
        '<div><strong>Outbox Pending / Retrying / Dead-Letter</strong>' + Number(q.pending || 0) + ' / ' + Number(q.retrying || 0) + ' / ' + Number(q.dead_letter || 0) + ' (oldest ' + Number(q.oldest_pending_age_sec || 0) + 's)</div>' +
        '</div></div>' +
        telemetryCard +
        emailCard;
    } catch (err) {
      container.innerHTML = '<div class="state-box state-error">' + esc(err.message) + '</div>';
    }
  }

  // =========================================================================
  // 8B. Controlled Feature Management (`#sec-features`)
  // =========================================================================
  function implStatusBadge(impl) {
    var s = String(impl || '').toLowerCase();
    var labelMap = {
      implemented: 'Implemented',
      beta: 'Beta',
      demonstrative: 'Demonstrative',
      placeholder: 'Placeholder',
      deferred: 'Deferred'
    };
    var cls = 'pill';
    if (s === 'implemented') cls += ' pill-ok';
    else if (s === 'beta') cls += ' pill-info';
    else if (s === 'demonstrative' || s === 'placeholder') cls += ' pill-warn';
    else cls += ' pill-mod';
    return '<span class="' + cls + '">Status: ' + esc(labelMap[s] || impl) + '</span>';
  }

  function effectiveStateBadge(eff) {
    var s = String(eff || '').toLowerCase();
    var cls = 'pill ';
    if (s === 'enabled') cls += 'pill-ok';
    else if (s === 'paused') cls += 'pill-warn';
    else if (s === 'hidden') cls += 'pill-danger';
    else cls += 'pill-info';
    return '<span class="' + cls + '">Effective: ' + esc(s) + '</span>';
  }

  function audienceBadge(aud, isReadOnly) {
    if (isReadOnly) return '<span class="pill">Read-only disclosure</span>';
    if (aud === 'staff_beta') return '<span class="pill pill-top">Audience: Staff &amp; Admins (staff_beta)</span>';
    return '<span class="pill">Audience: All eligible users</span>';
  }

  function setFeatureAlerts(statusMsg, errMsg) {
    var okEl = document.getElementById('fcLiveStatus');
    var errEl = document.getElementById('fcLiveError');
    if (okEl) {
      okEl.hidden = !statusMsg;
      okEl.textContent = statusMsg || '';
    }
    if (errEl) {
      errEl.hidden = !errMsg;
      errEl.textContent = errMsg || '';
    }
  }

  function broadcastFeatureControlsChange(detail) {
    try {
      if (typeof BroadcastChannel === 'function') {
        var ch = new BroadcastChannel(FEATURE_BROADCAST_CHANNEL);
        ch.postMessage(Object.assign({ type: 'feature_controls_updated', at: Date.now() }, detail || {}));
        ch.close();
      }
    } catch (_e) {}
  }

  function updateFeaturesNavBadge() {
    var badge = document.getElementById('badgeFeatures');
    if (!badge) return;
    var nonEnabledCount = (state.features.controls || []).filter(function (c) {
      return !c.read_only && c.effective_state !== 'enabled' && !(c.env_override && c.env_override.active && !c.customized);
    }).length;
    badge.hidden = nonEnabledCount === 0;
    badge.textContent = String(nonEnabledCount);
  }

  function applyFeatureControlsPayloadToState(data) {
    state.features.canEdit = Boolean(data.can_edit && state.isTop);
    state.features.configTrusted = data.config_trusted !== false;
    state.features.trustError = data.trust_error || null;
    state.features.controls = Array.isArray(data.controls) ? data.controls : [];
    state.features.protectedEssentials = Array.isArray(data.protected_essentials) ? data.protected_essentials : [];
    state.features.history = Array.isArray(data.recent_history) ? data.recent_history : [];
    if (data.propagation_policy && data.propagation_policy.note) {
      var propEl = document.getElementById('fcPropagationNote');
      if (propEl) propEl.textContent = data.propagation_policy.note;
    }
    var permNote = document.getElementById('fcRolePermissionNote');
    if (permNote) {
      permNote.textContent = state.features.canEdit
        ? 'Signed in as Admin: Top — you may update switchable feature states and audiences. Changes require an operator reason and are recorded in audit_logs and feature_control_history.'
        : 'Signed in as Admin: Mod (read-only view) — you can inspect effective states, implementation statuses, dependencies, and explanations. Modifying feature states requires Admin: Top.';
    }
    updateFeaturesNavBadge();
  }

  function clientRequiresInterruptConfirm(control, nextState, nextAudience) {
    if (!control || !control.high_impact_interrupt) return false;
    if (control.configured_state === 'enabled' && (nextState === 'paused' || nextState === 'hidden')) {
      return true;
    }
    if (nextState === 'enabled' && control.configured_audience === 'all' && nextAudience === 'staff_beta') {
      return true;
    }
    return false;
  }

  function renderFeaturesSection() {
    var listEl = document.getElementById('featuresList');
    var protPanel = document.getElementById('fcProtectedEssentialsPanel');
    var protList = document.getElementById('fcProtectedList');
    var histPanel = document.getElementById('fcHistoryPanel');
    var histWrap = document.getElementById('fcHistoryWrap');
    if (!listEl) return;

    var statusFilter = (document.getElementById('fcStatusFilter') && document.getElementById('fcStatusFilter').value) || 'all';
    var implFilter = (document.getElementById('fcImplFilter') && document.getElementById('fcImplFilter').value) || 'all';
    var q = String((document.getElementById('fcSearchInput') && document.getElementById('fcSearchInput').value) || '')
      .trim()
      .toLowerCase();

    var allControls = state.features.controls || [];
    var byKey = {};
    allControls.forEach(function (c) { byKey[c.key] = c; });

    var filtered = allControls.filter(function (c) {
      if (statusFilter === 'enabled' && c.effective_state !== 'enabled') return false;
      if (statusFilter === 'paused' && c.effective_state !== 'paused') return false;
      if (statusFilter === 'hidden' && c.effective_state !== 'hidden') return false;
      if (statusFilter === 'overridden' && !(c.env_override && c.env_override.active)) return false;
      if (statusFilter === 'customized' && !c.customized) return false;
      if (implFilter !== 'all' && c.implementation_status !== implFilter) return false;
      if (q) {
        var hay = [
          c.key,
          c.title,
          c.category,
          c.description,
          c.state_exceptions_note,
          (c.affected_workflows || []).join(' ')
        ]
          .join(' ')
          .toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });

    var canEdit = state.features.canEdit && state.features.configTrusted;

    if (!filtered.length) {
      listEl.hidden = false;
      listEl.innerHTML = '<div class="state-box" style="grid-column:1/-1">No feature controls match the selected filters.</div>';
    } else {
      listEl.hidden = false;
      listEl.innerHTML = filtered
        .map(function (c) {
          var cardCls = 'fc-card';
          if (c.read_only) cardCls += ' is-readonly';
          else if (c.effective_state === 'paused') cardCls += ' is-paused';
          else if (c.effective_state === 'hidden') cardCls += ' is-hidden';

          var envHtml = '';
          if (c.env_override && c.env_override.active) {
            envHtml =
              '<div class="fc-override-alert"><strong>⚡ Authoritative Environment Override Active (<code>' +
              esc(c.env_override.source) +
              '</code>):</strong> ' +
              esc(c.env_override.explanation) +
              ' Database <code>enabled</code> settings cannot bypass active environment emergency/provider stops.</div>';
          }

          var depHtml = '';
          if (c.dependency_block && c.dependency_block.blocked) {
            depHtml =
              '<div class="fc-dep-alert"><strong>🔗 Parent Dependency Active:</strong> ' +
              esc(c.dependency_block.reason) +
              ' Saved child configuration (<code>' +
              esc(c.configured_state) +
              '</code>) is preserved and will resume when the parent feature is re-enabled.</div>';
          } else if (Array.isArray(c.depends_on) && c.depends_on.length > 0) {
            var parentNames = c.depends_on
              .map(function (pk) {
                return byKey[pk] ? byKey[pk].title + ' (' + pk + ')' : pk;
              })
              .join(', ');
            depHtml = '<div class="record-meta"><strong>Depends on:</strong> ' + esc(parentNames) + '</div>';
          }

          var workflowsHtml =
            Array.isArray(c.affected_workflows) && c.affected_workflows.length
              ? '<div><strong style="font-size:12px;color:var(--ink)">Affected Surfaces &amp; Routes:</strong><ul class="fc-meta-list">' +
                c.affected_workflows
                  .map(function (w) {
                    return '<li>' + esc(w) + '</li>';
                  })
                  .join('') +
                '</ul></div>'
              : '';

          var exceptionsHtml = c.state_exceptions_note
            ? '<div class="record-meta"><strong>Preserved Workflows:</strong> ' + esc(c.state_exceptions_note) + '</div>'
            : '';

          var lastChangeHtml = c.last_change
            ? '<div class="fc-last-change"><strong>Last Change (Rev ' +
              Number(c.revision) +
              '):</strong> ' +
              esc(fmtDate(c.last_change.updated_at)) +
              ' · Actor: <strong>' +
              esc(c.last_change.actor_email_masked || c.last_change.actor_id || 'Admin: Top') +
              '</strong>' +
              (c.last_change.reason ? '<br>Reason: <em>"' + esc(c.last_change.reason) + '"</em>' : '') +
              '</div>'
            : '<div class="fc-last-change">Default configuration (Revision 0 — no runtime overrides saved).</div>';

          var formHtml = '';
          if (c.read_only) {
            formHtml =
              '<div class="fc-form"><div class="record-meta"><strong>Read-Only Architectural Disclosure:</strong> This entry documents non-toggleable or deferred functionality so operators have an accurate system inventory without fake switches.</div></div>';
          } else {
            var stateOpts = (c.allowed_states || [])
              .map(function (st) {
                var lbl =
                  st === 'enabled'
                    ? 'enabled — Active for eligible audience'
                    : st === 'paused'
                      ? 'paused — Halt new writes; preserve in-flight workflows'
                      : 'hidden — Hide UI & reject public/non-admin access';
                return (
                  '<option value="' +
                  esc(st) +
                  '"' +
                  (c.configured_state === st ? ' selected' : '') +
                  '>' +
                  esc(lbl) +
                  '</option>'
                );
              })
              .join('');

            var audOpts = (c.allowed_audiences || ['all'])
              .map(function (aud) {
                var lbl = aud === 'staff_beta' ? 'staff_beta — Verified Vendor Staff/Owners & Admins only' : 'all — All eligible accounts / visitors';
                return (
                  '<option value="' +
                  esc(aud) +
                  '"' +
                  (c.configured_audience === aud ? ' selected' : '') +
                  '>' +
                  esc(lbl) +
                  '</option>'
                );
              })
              .join('');

            formHtml =
              '<form class="fc-form" data-fc-form="' +
              esc(c.key) +
              '">' +
              '<div class="form-row-2">' +
              '<label for="fc-state-' +
              esc(c.key) +
              '">Configured State' +
              '<select id="fc-state-' +
              esc(c.key) +
              '" name="configured_state" ' +
              (!canEdit ? 'disabled' : '') +
              '>' +
              stateOpts +
              '</select></label>' +
              '<label for="fc-aud-' +
              esc(c.key) +
              '">Audience' +
              '<select id="fc-aud-' +
              esc(c.key) +
              '" name="audience" ' +
              (!canEdit || (c.allowed_audiences || []).length <= 1 ? 'disabled' : '') +
              '>' +
              audOpts +
              '</select></label>' +
              '</div>' +
              '<label for="fc-reason-' +
              esc(c.key) +
              '">Operator Reason (required to save, 4–500 chars)' +
              '<input type="text" id="fc-reason-' +
              esc(c.key) +
              '" name="reason" minlength="4" maxlength="500" placeholder="Explain why you are updating ' +
              esc(c.title) +
              '…" ' +
              (!canEdit ? 'disabled' : '') +
              '>' +
              '</label>' +
              '<p id="fc-err-' +
              esc(c.key) +
              '" class="form-err" role="alert" hidden style="margin:0;font-size:12.5px"></p>' +
              '<div class="action-row" style="justify-content:space-between;align-items:center">' +
              '<span class="record-meta">Configured: <code>' +
              esc(c.configured_state) +
              '</code> · Rev ' +
              Number(c.revision) +
              (c.high_impact_interrupt ? ' · High-impact confirmation on disable' : ' · Low-impact (direct save)') +
              '</span>' +
              '<button type="submit" class="admin-btn admin-btn-primary" id="fc-save-' +
              esc(c.key) +
              '" ' +
              (!canEdit ? 'disabled' : '') +
              '>' +
              (state.isTop ? 'Save Control' : 'Admin: Top Only') +
              '</button>' +
              '</div>' +
              '</form>';
          }

          return (
            '<article class="' +
            cardCls +
            '" id="fc-card-' +
            esc(c.key) +
            '" data-feature-key="' +
            esc(c.key) +
            '">' +
            '<div class="fc-card-top">' +
            '<div><span class="fc-category">' +
            esc(c.category) +
            ' · <code>' +
            esc(c.key) +
            '</code></span><h2 class="fc-card-title">' +
            esc(c.title) +
            '</h2></div>' +
            '<div class="fc-badges">' +
            implStatusBadge(c.implementation_status) +
            effectiveStateBadge(c.effective_state) +
            audienceBadge(c.configured_audience, c.read_only) +
            '</div>' +
            '</div>' +
            '<p class="fc-desc">' +
            esc(c.description) +
            '</p>' +
            envHtml +
            depHtml +
            workflowsHtml +
            exceptionsHtml +
            lastChangeHtml +
            formHtml +
            '</article>'
          );
        })
        .join('');

      listEl.querySelectorAll('[data-fc-form]').forEach(function (formEl) {
        formEl.addEventListener('submit', function (e) {
          e.preventDefault();
          onFeatureControlFormSubmit(formEl.getAttribute('data-fc-form'));
        });
      });
    }

    if (protPanel && protList) {
      var essentials = state.features.protectedEssentials || [];
      protPanel.hidden = essentials.length === 0;
      protList.innerHTML = essentials
        .map(function (item) {
          return (
            '<div class="fc-protected-item"><strong>🛡️ ' +
            esc(item.title) +
            '</strong><span>' +
            esc(item.reason || item.summary) +
            '</span></div>'
          );
        })
        .join('');
    }

    if (histPanel && histWrap) {
      var hist = state.features.history || [];
      histPanel.hidden = false;
      if (!hist.length) {
        histWrap.innerHTML = '<div class="state-box" style="border:none">No feature control modifications recorded yet.</div>';
      } else {
        histWrap.innerHTML =
          '<table class="admin-table"><thead><tr><th>When</th><th>Feature</th><th>Transition</th><th>Audience</th><th>Rev</th><th>Actor / Source</th><th>Reason</th></tr></thead><tbody>' +
          hist
            .map(function (h) {
              return (
                '<tr>' +
                '<td>' +
                esc(fmtDate(h.created_at)) +
                '</td>' +
                '<td><code>' +
                esc(h.feature_key) +
                '</code></td>' +
                '<td><code>' +
                esc(h.previous_state) +
                '</code> → <strong><code>' +
                esc(h.new_state) +
                '</code></strong></td>' +
                '<td><code>' +
                esc(h.previous_audience) +
                '</code> → <code>' +
                esc(h.new_audience) +
                '</code></td>' +
                '<td>' +
                Number(h.revision) +
                '</td>' +
                '<td>' +
                esc(h.actor_id ? h.actor_role + ' (' + h.actor_id + ')' : h.actor_role) +
                ' · <small>' +
                esc(h.change_source) +
                '</small></td>' +
                '<td>' +
                esc(h.reason) +
                '</td>' +
                '</tr>'
              );
            })
            .join('') +
          '</tbody></table>';
      }
    }
  }

  async function loadFeatures() {
    var loadingEl = document.getElementById('featuresLoading');
    var listEl = document.getElementById('featuresList');
    if (loadingEl) loadingEl.hidden = false;
    if (listEl) listEl.hidden = true;
    setFeatureAlerts('', '');

    try {
      var data = await apiJson('/api/admin/features');
      applyFeatureControlsPayloadToState(data);
      if (loadingEl) loadingEl.hidden = true;
      if (!state.features.configTrusted) {
        setFeatureAlerts(
          '',
          'Feature configuration store could not be verified (' +
            (state.features.trustError || 'untrusted state') +
            '). Optional server mutations are failing closed until resolved.'
        );
      }
      renderFeaturesSection();
    } catch (err) {
      if (loadingEl) loadingEl.hidden = true;
      setFeatureAlerts('', err.message || 'Failed to load feature controls.');
    }
  }

  function onFeatureControlFormSubmit(featureKey) {
    if (!state.features.canEdit) {
      setFeatureAlerts('', 'Only Admin: Top may modify feature controls.');
      return;
    }
    var control = (state.features.controls || []).find(function (c) {
      return c.key === featureKey;
    });
    if (!control || control.read_only) return;

    var stateSel = document.getElementById('fc-state-' + featureKey);
    var audSel = document.getElementById('fc-aud-' + featureKey);
    var reasonInput = document.getElementById('fc-reason-' + featureKey);
    var errEl = document.getElementById('fc-err-' + featureKey);
    var saveBtn = document.getElementById('fc-save-' + featureKey);

    var nextState = stateSel ? stateSel.value : control.configured_state;
    var nextAudience = audSel ? audSel.value : control.configured_audience;
    var typedReason = reasonInput ? reasonInput.value.trim() : '';

    if (errEl) {
      errEl.hidden = true;
      errEl.textContent = '';
    }

    if (clientRequiresInterruptConfirm(control, nextState, nextAudience)) {
      openFeatureConfirmModal(control, nextState, nextAudience, typedReason, saveBtn);
      return;
    }

    if (typedReason.length < 4 || typedReason.length > 500) {
      if (errEl) {
        errEl.hidden = false;
        errEl.textContent = 'Enter an operator reason (4–500 characters) before saving.';
      }
      if (reasonInput) reasonInput.focus();
      return;
    }

    executeFeatureControlSave({
      control: control,
      nextState: nextState,
      nextAudience: nextAudience,
      reason: typedReason,
      confirmedImpact: false,
      triggerBtn: saveBtn,
      inlineErrEl: errEl
    });
  }

  function openFeatureConfirmModal(control, nextState, nextAudience, prefillReason, triggerEl) {
    state.features.pendingConfirm = {
      control: control,
      nextState: nextState,
      nextAudience: nextAudience
    };
    state.features.lastTriggerEl = triggerEl || null;

    var modal = document.getElementById('featureConfirmModal');
    var titleEl = document.getElementById('fcConfirmTitle');
    var sumEl = document.getElementById('fcConfirmTransitionSummary');
    var listEl = document.getElementById('fcConfirmConsequences');
    var reasonEl = document.getElementById('fcConfirmReason');
    var errEl = document.getElementById('fcConfirmError');
    var submitBtn = document.getElementById('fcConfirmSubmitBtn');

    titleEl.textContent = 'Confirm Impact: ' + control.title;
    sumEl.innerHTML =
      'Changing <strong>' +
      esc(control.title) +
      '</strong> (<code>' +
      esc(control.key) +
      '</code>) from <code>' +
      esc(control.configured_state) +
      '</code> (' +
      esc(control.configured_audience) +
      ') → <strong><code>' +
      esc(nextState) +
      '</code> (' +
      esc(nextAudience) +
      ')</strong> · Expected revision ' +
      Number(control.revision);

    var consequences = Array.isArray(control.interrupt_consequences) && control.interrupt_consequences.length
      ? control.interrupt_consequences
      : [control.state_exceptions_note || 'New public requests for this feature will be blocked until re-enabled.'];

    listEl.innerHTML = consequences
      .map(function (line) {
        return '<li>' + esc(line) + '</li>';
      })
      .join('');

    reasonEl.value = prefillReason || '';
    errEl.hidden = true;
    errEl.textContent = '';
    submitBtn.disabled = false;
    submitBtn.textContent = 'Confirm & Apply Server Change';
    modal.hidden = false;
    if (reasonEl.value.trim().length >= 4) submitBtn.focus();
    else reasonEl.focus();
  }

  function closeFeatureConfirmModal(restoreFocus) {
    var modal = document.getElementById('featureConfirmModal');
    if (modal) modal.hidden = true;
    var trigger = state.features.lastTriggerEl;
    state.features.pendingConfirm = null;
    state.features.lastTriggerEl = null;
    if (restoreFocus && trigger && typeof trigger.focus === 'function') {
      trigger.focus();
    }
  }

  async function executeFeatureControlSave(opts) {
    var control = opts.control;
    var btn = opts.triggerBtn;
    var inlineErrEl = opts.inlineErrEl;
    var origBtnLabel = btn ? btn.textContent : '';

    setFeatureAlerts('', '');
    if (inlineErrEl) {
      inlineErrEl.hidden = true;
      inlineErrEl.textContent = '';
    }
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Saving to server…';
    }

    try {
      var res = await apiJson('/api/admin/features/update', {
        method: 'POST',
        body: {
          feature_key: control.key,
          configured_state: opts.nextState,
          audience: opts.nextAudience,
          expected_revision: control.revision,
          reason: opts.reason,
          confirmed_impact: Boolean(opts.confirmedImpact)
        }
      });

      // Only update UI state after verified HTTP 200 server response
      applyFeatureControlsPayloadToState(res);
      closeFeatureConfirmModal(false);
      renderFeaturesSection();

      var updatedEntry = (state.features.controls || []).find(function (c) {
        return c.key === control.key;
      });
      var effAfter = updatedEntry ? updatedEntry.effective_state : opts.nextState;
      var revAfter = updatedEntry ? updatedEntry.revision : control.revision + 1;

      setFeatureAlerts(
        'Server confirmed: "' +
          control.title +
          '" saved as ' +
          opts.nextState +
          ' (audience: ' +
          opts.nextAudience +
          ', effective state: ' +
          effAfter +
          ', revision ' +
          revAfter +
          ').',
        ''
      );

      broadcastFeatureControlsChange({
        feature_key: control.key,
        configured_state: opts.nextState,
        effective_state: effAfter,
        revision: revAfter
      });

      var savedBtnAfter = document.getElementById('fc-save-' + control.key);
      if (savedBtnAfter) savedBtnAfter.focus();
    } catch (err) {
      if (btn) {
        btn.disabled = false;
        btn.textContent = origBtnLabel;
      }
      var errMsg = err.message || 'Feature control update failed.';
      if (inlineErrEl) {
        inlineErrEl.hidden = false;
        inlineErrEl.textContent = errMsg;
      } else {
        setFeatureAlerts('', errMsg);
      }
      if (err.status === 409 && err.code === 'FEATURE_REVISION_CONFLICT') {
        setFeatureAlerts('', errMsg);
      }
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
      await Promise.all([
        loadVendorSelectorCatalog(),
        loadOverview(),
        apiJson('/api/admin/features').then(applyFeatureControlsPayloadToState).catch(function () {})
      ]);

      var initialHash = String(window.location.hash || '').replace(/^#/, '').trim();
      var initialQuerySec = new URLSearchParams(window.location.search || '').get('section') || '';
      var targetInitialSection = initialHash || initialQuerySec;
      if (['overview', 'applications', 'vendors', 'accounts', 'moderation', 'issues', 'readiness', 'features', 'diagnostics', 'audit', 'health'].indexOf(targetInitialSection) >= 0 && targetInitialSection !== 'overview') {
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
    adminCloseModal('aobModal');
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
    var btn = document.getElementById('adminSignOutBtn');
    if (btn) btn.disabled = true;
    try {
      if (window.bitesharkAuth && typeof window.bitesharkAuth.signOut === 'function') {
        await window.bitesharkAuth.signOut();
      }
      saveViewpointSession(null);
      try {
        sessionStorage.removeItem('bs_support_draft_v1');
        sessionStorage.removeItem('biteshark_pending_invite_v1');
      } catch (_e) {}
      try {
        if (typeof BroadcastChannel === 'function') {
          var chOut = new BroadcastChannel(FEATURE_BROADCAST_CHANNEL);
          chOut.postMessage({ type: 'auth_signed_out', at: Date.now() });
          chOut.close();
        }
      } catch (_e) {}
      window.location.href = '/login.html?next=%2Fadmin';
    } catch (soErr) {
      if (btn) btn.disabled = false;
      showBanner('✕ Sign-out failed — your server session may still be active: ' + (soErr.message || 'Retry signing out.'), true);
    }
  };

  try {
    if (typeof BroadcastChannel === 'function') {
      var adminAuthSync = new BroadcastChannel(FEATURE_BROADCAST_CHANNEL);
      adminAuthSync.onmessage = function (ev) {
        if (ev && ev.data && ev.data.type === 'auth_signed_out') {
          saveViewpointSession(null);
          window.location.href = '/login.html?next=%2Fadmin';
        }
      };
    }
  } catch (_e) {}

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

  document.querySelectorAll('#issuesQueueTabs [data-iss-queue]').forEach(function (btn) {
    btn.onclick = function () {
      state.issues.queue = btn.dataset.issQueue;
      var stSel = document.getElementById('issuesStatusFilter');
      if (stSel) stSel.value = '';
      document.querySelectorAll('#issuesQueueTabs [data-iss-queue]').forEach(function (b) {
        b.classList.toggle('active', b === btn);
      });
      loadIssues(1);
    };
  });
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

  document.getElementById('refreshDiagnosticsBtn').onclick = function () { loadDiagnostics(state.diagnostics.page, true); };
  document.getElementById('diagFilterForm').onsubmit = function (e) { e.preventDefault(); loadDiagnostics(1, false); };
  document.getElementById('diagIncludeSynthetic').onchange = function () { loadDiagnostics(1, false); };
  document.getElementById('diagCreateSyntheticBtn').onclick = createSyntheticDiagnosticProbe;
  document.getElementById('diagRunCleanupBtn').onclick = runDiagnosticsRetentionCleanup;

  document.getElementById('refreshFeaturesBtn').onclick = loadFeatures;
  document.getElementById('featuresFilterForm').onsubmit = function (e) { e.preventDefault(); renderFeaturesSection(); };
  document.getElementById('fcStatusFilter').onchange = renderFeaturesSection;
  document.getElementById('fcImplFilter').onchange = renderFeaturesSection;
  document.getElementById('fcSearchInput').oninput = renderFeaturesSection;

  document.getElementById('fcConfirmCancelBtn').onclick = function () {
    closeFeatureConfirmModal(true);
  };
  document.getElementById('fcConfirmSubmitBtn').onclick = function () {
    var pending = state.features.pendingConfirm;
    if (!pending) return;
    var reasonEl = document.getElementById('fcConfirmReason');
    var errEl = document.getElementById('fcConfirmError');
    var submitBtn = document.getElementById('fcConfirmSubmitBtn');
    var reason = reasonEl ? reasonEl.value.trim() : '';
    if (reason.length < 4 || reason.length > 500) {
      errEl.hidden = false;
      errEl.textContent = 'Enter a specific operator reason between 4 and 500 characters.';
      if (reasonEl) reasonEl.focus();
      return;
    }
    executeFeatureControlSave({
      control: pending.control,
      nextState: pending.nextState,
      nextAudience: pending.nextAudience,
      reason: reason,
      confirmedImpact: true,
      triggerBtn: submitBtn,
      inlineErrEl: errEl
    });
  };
  document.getElementById('invActionForm').onsubmit = submitInvitationActionModal;
  document.getElementById('invActionCancelBtn').onclick = closeInvitationActionModal;
  document.getElementById('invHistoryCloseBtn').onclick = closeInvitationHistoryModal;

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      var fcModal = document.getElementById('featureConfirmModal');
      if (fcModal && !fcModal.hidden) {
        e.preventDefault();
        closeFeatureConfirmModal(true);
        return;
      }
      var invActModal = document.getElementById('invActionModal');
      if (invActModal && !invActModal.hidden) {
        e.preventDefault();
        closeInvitationActionModal();
        return;
      }
      var invHistModal = document.getElementById('invHistoryModal');
      if (invHistModal && !invHistModal.hidden) {
        e.preventDefault();
        closeInvitationHistoryModal();
      }
    }
  });

  document.getElementById('refreshHealthBtn').onclick = loadHealth;

  bootAdminPortal();
})();
