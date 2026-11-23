/* BiteShark Admin Portal — Design Style Guide Questionnaire, Persistent Overwrite Guard,
 * Live Hosted Markdown Section Preview & Branch-Aware GitHub Uploader (`public/admin-style-guide.js`)
 *
 * Strictly enforces:
 *   - 5-entity HTML escaping (`&`, `<`, `>`, `"`, `'`) on all interpolated strings.
 *   - Type-tailored input controls (`enum_choice` dropdown, `boolean` segmented selector,
 *     `number`/`integer` numeric box, `string` color/text/textarea, `string_list` ordered list,
 *     `token_map` key-value + color swatch table, `structured_spec` multi-aspect or concise-rule builder,
 *     and `ref:DEC-...` upstream decision reference picker).
 *   - Optional notes on every decision (`notes`, never required).
 *   - Real-time change recognition (New vs Overwrite of saved values) + Confirm / Deny Overwrite modal.
 *   - Persistent host storage telemetry + respective Git branch upload with written/rewritten/left feedback.
 */
(function () {
  'use strict';

  function sgEsc(val) {
    return String(val == null ? '' : val).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function cloneVal(v) {
    return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  }

  function portalBridge() {
    return window.bitesharkAdminPortal || null;
  }

  async function sgApiJson(url, opts) {
    var bridge = portalBridge();
    if (bridge && typeof bridge.apiJson === 'function') {
      return bridge.apiJson(url, opts);
    }
    var method = (opts && opts.method) || 'GET';
    var headers = { 'X-BiteShark-Admin-Portal': '1' };
    var payload;
    if (opts && opts.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(opts.body);
    }
    var res = await fetch(url, {
      method: method,
      credentials: 'same-origin',
      headers: headers,
      body: payload
    });
    var json = await res.json().catch(function () { return null; });
    if (!res.ok) {
      var err = new Error((json && json.error) || 'Request failed (' + res.status + ')');
      err.status = res.status;
      err.code = (json && json.code) || null;
      err.payload = json || {};
      throw err;
    }
    return json;
  }

  function showToast(msg, isError) {
    var bridge = portalBridge();
    if (bridge && typeof bridge.showBanner === 'function') {
      bridge.showBanner(msg, Boolean(isError));
    }
  }

  function openModal(id, opts) {
    var bridge = portalBridge();
    if (bridge && typeof bridge.openModal === 'function') {
      bridge.openModal(id, opts);
      return;
    }
    var el = document.getElementById(id);
    if (el) el.hidden = false;
  }

  function closeModal(id) {
    var bridge = portalBridge();
    if (bridge && typeof bridge.closeModal === 'function') {
      bridge.closeModal(id);
      return;
    }
    var el = document.getElementById(id);
    if (el) el.hidden = true;
  }

  var sgState = {
    loaded: false,
    loading: false,
    saving: false,
    pushing: false,
    revision: 1,
    hasUnpushedChanges: false,
    persistence: null,
    repoDiff: null,
    activeUploadReport: null,
    pendingOverwriteCtx: null,
    permissions: {
      can_save_draft_and_notes: true,
      can_approve: false,
      can_reset: false,
      can_push_repo: false
    },
    githubPush: null,
    stats: null,
    hostedFiles: [],
    invariants: [],
    topics: [],
    dimensionsCatalog: [],
    components: [],
    decisions: [],
    decisionsById: {},
    dirtyById: {},
    noteOpenById: {},
    specConciseModeById: {},
    refModeById: {},
    activeTopicSlug: 'foundations',
    statusFilter: 'all',
    componentFilter: 'all',
    searchQuery: '',
    docViewer: {
      file: 'COMPLETION-REMINDER.md',
      mode: 'preview',
      content: '',
      repoPath: '',
      digest: ''
    }
  };

  function hasSavedDecisionContentClient(dec) {
    if (!dec) return false;
    if (dec.status && dec.status !== 'unanswered') return true;
    if (dec.value !== null && dec.value !== undefined) return true;
    if (dec.not_applicable_reason && String(dec.not_applicable_reason).trim().length > 0) return true;
    if (dec.notes && String(dec.notes).trim().length > 0) return true;
    return false;
  }

  function formatDecisionPreviewClient(dec) {
    if (!dec) return 'Unanswered (blank)';
    if (dec.status === 'not_applicable') {
      return 'N/A (' + String(dec.not_applicable_reason || '').slice(0, 80) + ')';
    }
    var v = dec.value;
    if (v === null || v === undefined) {
      if (dec.notes && String(dec.notes).trim()) {
        return 'Unanswered [Note: ' + String(dec.notes).trim().slice(0, 65) + ']';
      }
      return 'Unanswered (blank)';
    }
    if (typeof v === 'boolean' || typeof v === 'number') return String(v);
    if (typeof v === 'string') return v.length > 90 ? v.slice(0, 87) + '…' : v;
    if (Array.isArray(v)) {
      return '[' + v.length + ' item(s): ' + v.join(', ').slice(0, 75) + ']';
    }
    if (typeof v === 'object') {
      var entries = Object.entries(v);
      var pairs = entries
        .slice(0, 3)
        .map(function (kv) {
          return kv[0] + ': ' + (typeof kv[1] === 'string' ? kv[1] : JSON.stringify(kv[1]));
        })
        .join('; ');
      return '{' + entries.length + ' field(s): ' + pairs.slice(0, 80) + '}';
    }
    return String(v);
  }

  function classifyDirtyEditAgainstSaved(origDec, draftDec) {
    if (!origDec || !draftDec) return 'none';
    var sameCore =
      (origDec.status || 'unanswered') === (draftDec.status || 'unanswered') &&
      (origDec.applicability || 'applicable') === (draftDec.applicability || 'applicable') &&
      JSON.stringify(origDec.value === undefined ? null : origDec.value) ===
        JSON.stringify(draftDec.value === undefined ? null : draftDec.value) &&
      (origDec.not_applicable_reason || null) === (draftDec.not_applicable_reason || null);
    var origNote = origDec.notes ? String(origDec.notes).trim() : '';
    var draftNote = draftDec.notes ? String(draftDec.notes).trim() : '';
    var sameNote = origNote === draftNote;
    var origAppBy = (origDec.approval && origDec.approval.approved_by) || null;
    var draftAppBy = (draftDec.approval && draftDec.approval.approved_by) || null;
    var origAppAt = (origDec.approval && origDec.approval.approved_at) || null;
    var draftAppAt = (draftDec.approval && draftDec.approval.approved_at) || null;
    if (sameCore && sameNote && origAppBy === draftAppBy && origAppAt === draftAppAt) {
      return 'unchanged';
    }
    if (hasSavedDecisionContentClient(origDec)) {
      if (!hasSavedDecisionContentClient(draftDec)) return 'cleared';
      var origHadAns =
        (origDec.status && origDec.status !== 'unanswered') ||
        (origDec.value !== null && origDec.value !== undefined) ||
        Boolean(origDec.not_applicable_reason);
      if (!origHadAns && sameNote) return 'newly_written';
      return 'overwrite';
    }
    return 'newly_written';
  }

  function isRefString(val) {
    return typeof val === 'string' && /^ref:DEC-[A-Z0-9-]+$/.test(val.trim());
  }

  function isColorRelatedDecision(dec) {
    var hay = (
      (dec.title || '') +
      ' ' +
      (dec.question || '') +
      ' ' +
      ((dec.expected_answer && dec.expected_answer.constraints) || '') +
      ' ' +
      (dec.dimension || '')
    ).toLowerCase();
    return /\b(color|colors|palette|hex|rgb|hsl|ink|background|canvas|tint|shade|contrast|swatch|visual_tokens)\b/.test(
      hay
    );
  }

  function normalizeHexForSwatch(val) {
    var s = String(val || '').trim();
    if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
    if (/^#[0-9a-fA-F]{3}$/.test(s)) {
      return (
        '#' +
        s[1] +
        s[1] +
        s[2] +
        s[2] +
        s[3] +
        s[3]
      ).toLowerCase();
    }
    return '#214b3b';
  }

  function suggestKeysForDecision(dec) {
    var t = dec.expected_answer && dec.expected_answer.type;
    var dim = dec.dimension || '';
    var id = dec.decision_id || '';
    if (t === 'token_map') {
      if (id.indexOf('SURFACE-INK') !== -1) {
        return ['canvas_bg', 'card_surface', 'inset_surface', 'ink_primary', 'ink_muted', 'border'];
      }
      if (id.indexOf('SEMANTIC-STATUS') !== -1) {
        return ['brand_primary', 'brand_accent', 'success', 'warning', 'danger', 'info'];
      }
      if (id.indexOf('SPACING') !== -1) {
        return ['space_1', 'space_2', 'space_3', 'space_4', 'space_6', 'space_8'];
      }
      if (id.indexOf('RADIUS') !== -1 || id.indexOf('ELEVATION') !== -1) {
        return ['radius_sm', 'radius_md', 'radius_lg', 'radius_pill', 'shadow_card', 'shadow_modal'];
      }
      if (id.indexOf('Z-INDEX') !== -1) {
        return ['z_base', 'z_sticky_bar', 'z_dropdown', 'z_sheet', 'z_modal', 'z_toast'];
      }
      if (dim === 'visual_tokens') {
        return ['background', 'foreground_text', 'border_color', 'accent_color'];
      }
      return ['primary_token', 'secondary_token'];
    }
    if (t === 'structured_spec') {
      if (dim === 'states') {
        return ['default', 'hover', 'active', 'focus_visible', 'disabled'];
      }
      if (dim === 'responsive_behavior') {
        return ['mobile_390px', 'tablet_768px', 'desktop_1024px'];
      }
      if (dim === 'spacing_and_sizing') {
        return ['padding', 'gap', 'min_height', 'max_width'];
      }
      if (dim === 'typography') {
        return ['heading', 'body', 'meta_caption'];
      }
      if (dim === 'borders_radius_and_elevation') {
        return ['border', 'border_radius', 'shadow'];
      }
      if (dim === 'keyboard_and_focus_behavior') {
        return ['tab_order', 'focus_indicator', 'escape_and_shortcuts'];
      }
      if (dim === 'screen_reader_and_live_announcements') {
        return ['accessible_name_role', 'live_announcement'];
      }
      if (dim === 'loading_empty_and_error_behavior') {
        return ['loading', 'empty', 'error_and_retry'];
      }
      if (dim === 'motion_and_reduced_motion') {
        return ['standard_transition', 'prefers_reduced_motion'];
      }
      if (id.indexOf('SURFACE-PERSONALITY') !== -1) {
        return ['customer_surfaces', 'vendor_owner_mode', 'admin_portal', 'legal_policies'];
      }
      return ['primary_rule', 'edge_cases'];
    }
    return [];
  }

  function getWorkingDecision(decId) {
    if (sgState.dirtyById[decId]) {
      return sgState.dirtyById[decId];
    }
    return sgState.decisionsById[decId] || null;
  }

  function ensureDirtyDraft(decId) {
    if (!sgState.dirtyById[decId]) {
      var orig = sgState.decisionsById[decId];
      if (!orig) return null;
      sgState.dirtyById[decId] = {
        decision_id: orig.decision_id,
        topic: orig.topic,
        component_id: orig.component_id,
        section: orig.section,
        dimension: orig.dimension,
        title: orig.title,
        question: orig.question,
        expected_answer: orig.expected_answer,
        applicability: orig.applicability,
        applicability_note: orig.applicability_note,
        status: orig.status,
        value: cloneVal(orig.value),
        not_applicable_reason: orig.not_applicable_reason,
        approval: cloneVal(orig.approval || { approved_by: null, approved_at: null }),
        notes: orig.notes || '',
        related_decisions: orig.related_decisions || [],
        mandatory_invariant_ids: orig.mandatory_invariant_ids || []
      };
    }
    return sgState.dirtyById[decId];
  }

  function isNonEmptyAnswerValue(val, expectedType) {
    if (val === null || val === undefined) return false;
    if (isRefString(val)) return true;
    if (expectedType === 'boolean') return typeof val === 'boolean';
    if (expectedType === 'number' || expectedType === 'integer') {
      return typeof val === 'number' && Number.isFinite(val);
    }
    if (expectedType === 'string' || expectedType === 'enum_choice') {
      return typeof val === 'string' && val.trim().length > 0;
    }
    if (expectedType === 'string_list') {
      return (
        Array.isArray(val) &&
        val.length > 0 &&
        val.every(function (s) {
          return typeof s === 'string' && s.trim().length > 0;
        })
      );
    }
    if (expectedType === 'token_map' || expectedType === 'structured_spec') {
      if (!val || typeof val !== 'object' || Array.isArray(val)) return false;
      var keys = Object.keys(val);
      if (!keys.length) return false;
      return keys.every(function (k) {
        return k.trim().length > 0 && String(val[k] == null ? '' : val[k]).trim().length > 0;
      });
    }
    return false;
  }

  function autoSyncStatusOnValueChange(draft) {
    var hasAns = isNonEmptyAnswerValue(draft.value, draft.expected_answer.type);
    if (hasAns && draft.status === 'unanswered') {
      draft.status = 'draft';
      draft.applicability = 'applicable';
    } else if (!hasAns && (draft.status === 'draft' || draft.status === 'approved')) {
      draft.status = 'unanswered';
      draft.value = null;
      draft.approval = { approved_by: null, approved_at: null };
    }
  }

  function computeLiveClientCounts() {
    var dirtyNew = 0;
    var dirtyOverwrite = 0;
    Object.keys(sgState.dirtyById).forEach(function (decId) {
      var kind = classifyDirtyEditAgainstSaved(sgState.decisionsById[decId], sgState.dirtyById[decId]);
      if (kind === 'overwrite' || kind === 'cleared') dirtyOverwrite += 1;
      else if (kind === 'newly_written') dirtyNew += 1;
    });

    var totals = {
      total: 0,
      done: 0,
      approved: 0,
      not_applicable: 0,
      draft: 0,
      unanswered: 0,
      unconfirmed: 0,
      notes: 0,
      dirty: Object.keys(sgState.dirtyById).length,
      dirtyNew: dirtyNew,
      dirtyOverwrite: dirtyOverwrite,
      elementsTotal: sgState.components.length,
      elementsCompleted: 0,
      elementsLeft: 0
    };
    var byTopic = {};
    sgState.topics.forEach(function (t) {
      byTopic[t.slug] = { total: 0, done: 0, draft: 0, unanswered: 0 };
    });

    sgState.decisions.forEach(function (orig) {
      var d = getWorkingDecision(orig.decision_id);
      totals.total += 1;
      var tb = byTopic[d.topic];
      if (tb) tb.total += 1;
      if (d.notes && String(d.notes).trim().length > 0) totals.notes += 1;

      if (d.status === 'approved') {
        totals.approved += 1;
        totals.done += 1;
        if (tb) tb.done += 1;
      } else if (d.status === 'not_applicable') {
        totals.not_applicable += 1;
        totals.done += 1;
        if (tb) tb.done += 1;
      } else if (d.status === 'draft') {
        totals.draft += 1;
        if (tb) tb.draft += 1;
      } else {
        totals.unanswered += 1;
        if (d.applicability === 'unconfirmed') totals.unconfirmed += 1;
        if (tb) tb.unanswered += 1;
      }
    });

    sgState.components.forEach(function (cmp) {
      var cmpDecs = sgState.decisions.filter(function (orig) {
        return orig.component_id === cmp.component_id;
      });
      if (!cmpDecs.length) {
        totals.elementsCompleted += 1;
        return;
      }
      var allDone = cmpDecs.every(function (orig) {
        var wd = getWorkingDecision(orig.decision_id);
        return wd.status === 'approved' || wd.status === 'not_applicable';
      });
      if (allDone) totals.elementsCompleted += 1;
    });
    totals.elementsLeft = Math.max(0, totals.elementsTotal - totals.elementsCompleted);

    return { totals: totals, byTopic: byTopic };
  }

  function updateSidebarNavBadge(unansweredCount) {
    var badge = document.getElementById('badgeStyleGuide');
    if (!badge) return;
    if (unansweredCount > 0) {
      badge.hidden = false;
      badge.textContent = String(unansweredCount);
    } else {
      badge.hidden = true;
    }
  }

  function renderTopSummaryAndSaveBar() {
    var counts = computeLiveClientCounts();
    var tot = counts.totals;
    updateSidebarNavBadge(tot.unanswered + tot.draft);

    var pctDone = tot.total > 0 ? Math.round((tot.done / tot.total) * 1000) / 10 : 0;
    var pctDraft = tot.total > 0 ? Math.round((tot.draft / tot.total) * 1000) / 10 : 0;

    var gh = sgState.githubPush || {};
    var defaultBranch = gh.default_branch || 'working/biteshark-vps';
    var repoChangedCount =
      sgState.repoDiff && sgState.repoDiff.counts
        ? sgState.repoDiff.counts.total_changed_decisions
        : 0;

    // Header button in `#sec-style-guide .sec-head`
    var hdrUploadBtn = document.getElementById('sgHeaderUploadGitBtn');
    if (hdrUploadBtn) {
      hdrUploadBtn.hidden = false;
      hdrUploadBtn.disabled = !sgState.permissions.can_push_repo;
      var deltaTag = repoChangedCount > 0 ? ' · ' + repoChangedCount + ' changed' : '';
      hdrUploadBtn.textContent =
        '⬆️ Upload Current Version to Git (' + defaultBranch + deltaTag + ')';
      hdrUploadBtn.title = sgState.permissions.can_push_repo
        ? 'Upload current saved Style Guide version to ' + defaultBranch + ' on GitHub'
        : 'Admin: Top is required to upload Style Guide commits to GitHub';
      hdrUploadBtn.onclick = openPushToRepoModal;
    }

    var summaryEl = document.getElementById('sgProgressSummaryCard');
    if (summaryEl) {
      var pers = sgState.persistence || {};
      var persistPillHtml =
        pers.durable && pers.writable
          ? '<span class="pill pill-ok" title="Saved answers persist across server deploys and restarts">💾 Persistent Storage Active (Rev #' +
            sgEsc(sgState.revision) +
            ')</span>'
          : pers.writable
            ? '<span class="pill pill-info">💾 Local Workspace Storage (Rev #' +
              sgEsc(sgState.revision) +
              ')</span>'
            : '<span class="pill pill-danger">⚠️ Storage Not Writable</span>';

      var syncBadgeHtml = sgState.hasUnpushedChanges
        ? '<span class="pill pill-warn">● ' +
          sgEsc(repoChangedCount) +
          ' Unpushed Change' +
          (repoChangedCount === 1 ? '' : 's') +
          ' vs Git</span>'
        : '<span class="pill pill-ok">✓ Synced with Git (' + sgEsc(defaultBranch) + ')</span>';

      var lastPushHtml = '';
      if (gh.last_pushed_commit_sha) {
        var shortSha = String(gh.last_pushed_commit_sha).slice(0, 10);
        lastPushHtml =
          ' · Last Git upload: <a href="' +
          sgEsc(gh.last_pushed_commit_url || '#') +
          '" target="_blank" rel="noopener"><code>' +
          sgEsc(shortSha) +
          '</code></a> (' +
          sgEsc(gh.last_pushed_branch || defaultBranch) +
          ')';
      }

      summaryEl.innerHTML =
        '<div class="sg-progress-top">' +
        '<div>' +
        '<strong>Completion Progress: ' +
        tot.done +
        ' / ' +
        tot.total +
        ' Done (' +
        pctDone +
        '%) · ' +
        tot.unanswered +
        ' Left Unanswered</strong>' +
        '<div style="font-size:12px;color:var(--muted)">Saved answers persist on the server, prompt Confirm/Deny before overwriting existing entries, and immediately populate the hosted Style Guide.' +
        lastPushHtml +
        '</div>' +
        '</div>' +
        '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
        persistPillHtml +
        syncBadgeHtml +
        '<button type="button" class="admin-btn admin-btn-secondary admin-btn-sm" id="sgOpenReminderBtn">📋 Gap Report</button>' +
        '<button type="button" class="admin-btn admin-btn-secondary admin-btn-sm" id="sgOpenHostedDocTopBtn">📄 Hosted Style Guide Viewer</button>' +
        (sgState.permissions.can_push_repo
          ? '<button type="button" class="admin-btn admin-btn-primary admin-btn-sm" id="sgPushToRepoTopBtn">⬆️ Upload to Git (' +
            sgEsc(defaultBranch) +
            ')</button>'
          : '') +
        '</div>' +
        '</div>' +
        '<div class="sg-progress-bar-track" role="progressbar" aria-valuemin="0" aria-valuemax="' +
        tot.total +
        '" aria-valuenow="' +
        tot.done +
        '">' +
        '<div class="sg-progress-seg-done" style="width:' +
        pctDone +
        '%"></div>' +
        '<div class="sg-progress-seg-draft" style="width:' +
        pctDraft +
        '%"></div>' +
        '</div>' +
        '<div class="sg-stats-strip">' +
        '<div class="sg-stat-box"><strong>' +
        tot.done +
        '</strong><span>Done (' +
        tot.approved +
        ' Approved · ' +
        tot.not_applicable +
        ' N/A)</span></div>' +
        '<div class="sg-stat-box"><strong>' +
        tot.unanswered +
        '</strong><span>Questions Left (' +
        tot.unconfirmed +
        ' Unconfirmed)</span></div>' +
        '<div class="sg-stat-box"><strong>' +
        tot.elementsCompleted +
        ' / ' +
        tot.elementsTotal +
        '</strong><span>UI Elements Done (' +
        tot.elementsLeft +
        ' Left)</span></div>' +
        '<div class="sg-stat-box"><strong>' +
        tot.draft +
        '</strong><span>Draft (Filled · Awaiting Approval)</span></div>' +
        '<div class="sg-stat-box"><strong>' +
        tot.notes +
        '</strong><span>Items with Notes (Optional)</span></div>' +
        '<div class="sg-stat-box"><strong>' +
        tot.dirty +
        '</strong><span>Unsaved Edits (' +
        tot.dirtyNew +
        ' new · ' +
        tot.dirtyOverwrite +
        ' overwrite)</span></div>' +
        '</div>';

      var remBtn = document.getElementById('sgOpenReminderBtn');
      if (remBtn) {
        remBtn.onclick = function () {
          openHostedDocModal('COMPLETION-REMINDER.md');
        };
      }
      var docBtn = document.getElementById('sgOpenHostedDocTopBtn');
      if (docBtn) {
        docBtn.onclick = function () {
          var activeTopic = sgState.topics.find(function (t) {
            return t.slug === sgState.activeTopicSlug;
          });
          openHostedDocModal(activeTopic ? activeTopic.file : 'README.md');
        };
      }
      var pushBtn = document.getElementById('sgPushToRepoTopBtn');
      if (pushBtn) {
        pushBtn.onclick = openPushToRepoModal;
      }
    }

    var saveBar = document.getElementById('sgStickySaveBar');
    if (saveBar) {
      if (tot.dirty > 0) {
        saveBar.hidden = false;
        var saveCountEl = document.getElementById('sgDirtyCountLabel');
        if (saveCountEl) {
          var owNote =
            tot.dirtyOverwrite > 0
              ? ' (' +
                tot.dirtyNew +
                ' newly written, ' +
                tot.dirtyOverwrite +
                ' rewriting saved — will ask Confirm/Deny)'
              : ' (' + tot.dirtyNew + ' newly written)';
          saveCountEl.textContent =
            tot.dirty +
            ' unsaved change' +
            (tot.dirty === 1 ? '' : 's') +
            owNote;
        }
      } else {
        saveBar.hidden = true;
      }
    }

    renderCategoryRail(counts.byTopic);
  }

  function renderCategoryRail(byTopicCounts) {
    var railEl = document.getElementById('sgCategoryRailList');
    if (!railEl) return;
    var countsMap = byTopicCounts || computeLiveClientCounts().byTopic;

    railEl.innerHTML = sgState.topics
      .map(function (t) {
        var c = countsMap[t.slug] || { total: 0, done: 0, draft: 0 };
        var isSel = t.slug === sgState.activeTopicSlug;
        var badgeCls = 'sg-cat-count';
        if (c.total > 0 && c.done === c.total) badgeCls += ' done';
        else if (c.done > 0 || c.draft > 0) badgeCls += ' partial';
        return (
          '<button type="button" class="sg-cat-btn' +
          (isSel ? ' active' : '') +
          '" data-sg-topic="' +
          sgEsc(t.slug) +
          '">' +
          '<span>' +
          sgEsc(t.order + '. ' + t.title) +
          '</span>' +
          '<span class="' +
          badgeCls +
          '">' +
          (c.done === c.total && c.total > 0 ? '✓ ' : '') +
          c.done +
          '/' +
          c.total +
          '</span>' +
          '</button>'
        );
      })
      .join('');

    railEl.querySelectorAll('[data-sg-topic]').forEach(function (btn) {
      btn.onclick = function () {
        sgState.activeTopicSlug = btn.getAttribute('data-sg-topic');
        sgState.componentFilter = 'all';
        renderTopSummaryAndSaveBar();
        renderActiveCategoryWorkspace();
      };
    });
  }

  function buildDecisionDatalistOnce() {
    var dl = document.getElementById('sgDecisionRefDatalist');
    if (!dl) return;
    dl.innerHTML = sgState.decisions
      .map(function (d) {
        return (
          '<option value="ref:' +
          sgEsc(d.decision_id) +
          '">' +
          sgEsc(d.title + ' (' + d.topic + ')') +
          '</option>'
        );
      })
      .join('');
  }

  function matchesFilters(dec) {
    if (sgState.componentFilter !== 'all') {
      if (sgState.componentFilter === '__TOPIC__') {
        if (dec.component_id !== null) return false;
      } else if (dec.component_id !== sgState.componentFilter) {
        return false;
      }
    }

    var st = sgState.statusFilter;
    if (st === 'unanswered') {
      if (dec.status !== 'unanswered') return false;
    } else if (st === 'done') {
      if (dec.status !== 'approved' && dec.status !== 'not_applicable') return false;
    } else if (st === 'draft') {
      if (dec.status !== 'draft') return false;
    } else if (st === 'unconfirmed') {
      if (dec.applicability !== 'unconfirmed' || dec.status === 'not_applicable') return false;
    } else if (st === 'notes') {
      if (!dec.notes || String(dec.notes).trim().length === 0) return false;
    } else if (st === 'dirty') {
      if (!sgState.dirtyById[dec.decision_id]) return false;
    }

    if (sgState.searchQuery) {
      var q = sgState.searchQuery.toLowerCase();
      var cmp = dec.component_id
        ? sgState.components.find(function (c) {
            return c.component_id === dec.component_id;
          })
        : null;
      var hay = [
        dec.decision_id,
        dec.title,
        dec.question,
        dec.section,
        dec.dimension || '',
        dec.notes || '',
        cmp ? cmp.implementation_name : '',
        cmp ? (cmp.selectors || []).join(' ') : ''
      ]
        .join(' ')
        .toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }

    return true;
  }

  function renderInputWidgetHtml(dec) {
    var decId = dec.decision_id;
    var exp = dec.expected_answer || { type: 'string', constraints: '' };
    var val = dec.value;

    if (dec.status === 'not_applicable') {
      return (
        '<div class="sg-control-box">' +
        '<label style="font-size:12px;font-weight:600;color:var(--ink)">Reason Marked Not Applicable (required, ≥ 8 chars)' +
        '<input type="text" class="sg-input-text" data-sg-na-reason="' +
        sgEsc(decId) +
        '" value="' +
        sgEsc(dec.not_applicable_reason || '') +
        '" placeholder="Explain why this element or parameter does not apply to BiteShark…">' +
        '</label>' +
        '</div>'
      );
    }

    var inRefMode = Boolean(sgState.refModeById[decId]) || isRefString(val);
    var allowsRef = exp.allows_decision_ref !== false;

    var refToggleHtml = allowsRef
      ? '<label style="display:inline-flex;align-items:center;gap:5px;cursor:pointer;font-weight:600">' +
        '<input type="checkbox" data-sg-ref-toggle="' +
        sgEsc(decId) +
        '"' +
        (inRefMode ? ' checked' : '') +
        '> 🔗 Reference upstream decision (<code>ref:DEC-…</code>)</label>'
      : '<span></span>';

    if (inRefMode) {
      return (
        '<div class="sg-control-box">' +
        '<div class="sg-control-toolbar">' +
        '<span>Upstream Reference Mode</span>' +
        refToggleHtml +
        '</div>' +
        '<input type="text" class="sg-input-text" list="sgDecisionRefDatalist" data-sg-ref-input="' +
        sgEsc(decId) +
        '" value="' +
        sgEsc(typeof val === 'string' ? val : '') +
        '" placeholder="Type or pick e.g. ref:DEC-FND-THEME-POLICY">' +
        '</div>'
      );
    }

    // 1. enum_choice -> Dropdown <select>
    if (exp.type === 'enum_choice') {
      var choices = Array.isArray(exp.allowed_choices) ? exp.allowed_choices : [];
      return (
        '<div class="sg-control-box">' +
        '<div class="sg-control-toolbar"><span>Select Approved Option</span>' +
        refToggleHtml +
        '</div>' +
        '<select class="sg-input-select" data-sg-enum="' +
        sgEsc(decId) +
        '" aria-label="' +
        sgEsc(dec.title) +
        '">' +
        '<option value="">— Unanswered (choose an option) —</option>' +
        choices
          .map(function (ch) {
            return (
              '<option value="' +
              sgEsc(ch) +
              '"' +
              (val === ch ? ' selected' : '') +
              '>' +
              sgEsc(ch) +
              '</option>'
            );
          })
          .join('') +
        '</select>' +
        '</div>'
      );
    }

    // 2. boolean -> 3-way segmented selector (Unanswered / Yes / No)
    if (exp.type === 'boolean') {
      var curBool = val === true ? 'true' : val === false ? 'false' : 'null';
      return (
        '<div class="sg-control-box">' +
        '<div class="sg-control-toolbar"><span>Boolean Selector</span>' +
        refToggleHtml +
        '</div>' +
        '<div class="sg-bool-group" role="group" aria-label="' +
        sgEsc(dec.title) +
        '">' +
        '<button type="button" class="sg-bool-btn' +
        (curBool === 'null' ? ' active' : '') +
        '" data-sg-bool="' +
        sgEsc(decId) +
        '" data-val="null">— Unanswered</button>' +
        '<button type="button" class="sg-bool-btn' +
        (curBool === 'true' ? ' active' : '') +
        '" data-sg-bool="' +
        sgEsc(decId) +
        '" data-val="true">✓ Yes (true)</button>' +
        '<button type="button" class="sg-bool-btn' +
        (curBool === 'false' ? ' active' : '') +
        '" data-sg-bool="' +
        sgEsc(decId) +
        '" data-val="false">✕ No (false)</button>' +
        '</div>' +
        '</div>'
      );
    }

    // 3. number / integer -> Numeric input with bounds & unit
    if (exp.type === 'number' || exp.type === 'integer') {
      var numStr = typeof val === 'number' && Number.isFinite(val) ? String(val) : '';
      var stepAttr = exp.type === 'integer' ? '1' : 'any';
      var minAttr = typeof exp.minimum === 'number' ? ' min="' + sgEsc(exp.minimum) + '"' : '';
      var maxAttr = typeof exp.maximum === 'number' ? ' max="' + sgEsc(exp.maximum) + '"' : '';
      var unitBadge = exp.unit ? '<span class="pill">' + sgEsc(exp.unit) + '</span>' : '';
      return (
        '<div class="sg-control-box">' +
        '<div class="sg-control-toolbar"><span>Numeric Input (' +
        sgEsc(exp.type) +
        ')</span>' +
        refToggleHtml +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:8px;max-width:280px">' +
        '<input type="number" class="sg-input-text" step="' +
        stepAttr +
        '"' +
        minAttr +
        maxAttr +
        ' data-sg-num="' +
        sgEsc(decId) +
        '" data-num-kind="' +
        sgEsc(exp.type) +
        '" value="' +
        sgEsc(numStr) +
        '" placeholder="Enter number…">' +
        unitBadge +
        '</div>' +
        '</div>'
      );
    }

    // 4. string -> Color picker + text box OR single-line text OR multi-line textarea
    if (exp.type === 'string') {
      var strVal = typeof val === 'string' ? val : '';
      if (isColorRelatedDecision(dec)) {
        return (
          '<div class="sg-control-box">' +
          '<div class="sg-control-toolbar"><span>Color Swatch &amp; CSS Value</span>' +
          refToggleHtml +
          '</div>' +
          '<div class="sg-color-row">' +
          '<input type="color" class="sg-color-swatch" data-sg-color-pick="' +
          sgEsc(decId) +
          '" value="' +
          sgEsc(normalizeHexForSwatch(strVal)) +
          '" aria-label="Color picker">' +
          '<input type="text" class="sg-input-text" data-sg-str="' +
          sgEsc(decId) +
          '" value="' +
          sgEsc(strVal) +
          '" placeholder="e.g. #234B3A or var(--trk-green)">' +
          '</div>' +
          '</div>'
        );
      }
      var isLongCopy =
        (dec.topic === 'content-and-language' || /copy|message|wording|rule|policy|behavior/i.test(dec.title)) &&
        !/font|family|stack|token|selector/i.test(dec.title);
      if (isLongCopy) {
        return (
          '<div class="sg-control-box">' +
          '<div class="sg-control-toolbar"><span>Text Specification</span>' +
          refToggleHtml +
          '</div>' +
          '<textarea class="sg-input-textarea" rows="2" data-sg-str="' +
          sgEsc(decId) +
          '" placeholder="Enter approved specification…">' +
          sgEsc(strVal) +
          '</textarea>' +
          '</div>'
        );
      }
      return (
        '<div class="sg-control-box">' +
        '<div class="sg-control-toolbar"><span>Value / Token / Font Stack</span>' +
        refToggleHtml +
        '</div>' +
        '<input type="text" class="sg-input-text" data-sg-str="' +
        sgEsc(decId) +
        '" value="' +
        sgEsc(strVal) +
        '" placeholder="Enter value (avoid TBD/TODO placeholders)…">' +
        '</div>'
      );
    }

    // 5. string_list -> Ordered interactive list items
    if (exp.type === 'string_list') {
      var listItems = Array.isArray(val) ? val : [];
      var rowsHtml = listItems
        .map(function (item, idx) {
          return (
            '<div class="sg-str-row">' +
            '<span style="font-size:11.5px;color:var(--muted);min-width:20px">' +
            (idx + 1) +
            '.</span>' +
            '<input type="text" class="sg-input-text" data-sg-list-item="' +
            sgEsc(decId) +
            '" data-idx="' +
            idx +
            '" value="' +
            sgEsc(item) +
            '" placeholder="List item…">' +
            '<button type="button" class="sg-mini-btn" data-sg-list-up="' +
            sgEsc(decId) +
            '" data-idx="' +
            idx +
            '" title="Move up"' +
            (idx === 0 ? ' disabled' : '') +
            '>↑</button>' +
            '<button type="button" class="sg-mini-btn danger" data-sg-list-del="' +
            sgEsc(decId) +
            '" data-idx="' +
            idx +
            '" title="Remove item">×</button>' +
            '</div>'
          );
        })
        .join('');

      return (
        '<div class="sg-control-box">' +
        '<div class="sg-control-toolbar"><span>Ordered List Builder (' +
        listItems.length +
        ' item' +
        (listItems.length === 1 ? '' : 's') +
        ')</span>' +
        refToggleHtml +
        '</div>' +
        (rowsHtml ? '<div class="sg-str-list">' + rowsHtml + '</div>' : '') +
        '<div><button type="button" class="sg-mini-btn" data-sg-list-add="' +
        sgEsc(decId) +
        '">+ Add list item</button></div>' +
        '</div>'
      );
    }

    // 6. token_map & structured_spec -> Interactive Key -> Value / Aspect Builder
    var objVal = val && typeof val === 'object' && !Array.isArray(val) ? val : null;
    var objEntries = objVal ? Object.entries(objVal) : [];
    var isColorMap = exp.type === 'token_map' && isColorRelatedDecision(dec);
    var isSingleSummaryObj =
      exp.type === 'structured_spec' &&
      objEntries.length === 1 &&
      objEntries[0][0] === 'specification' &&
      typeof objEntries[0][1] === 'string';
    var useConciseMode =
      exp.type === 'structured_spec' &&
      (sgState.specConciseModeById[decId] === true ||
        (sgState.specConciseModeById[decId] === undefined && isSingleSummaryObj));

    var modeSwitchHtml =
      exp.type === 'structured_spec'
        ? '<button type="button" class="sg-mini-btn" data-sg-spec-mode="' +
          sgEsc(decId) +
          '">' +
          (useConciseMode ? '⇄ Switch to Multi-Aspect Rows' : '⇄ Switch to Concise Single Box') +
          '</button>'
        : '';

    if (useConciseMode) {
      var singleSpecText =
        objVal && typeof objVal.specification === 'string'
          ? objVal.specification
          : objEntries.length > 0
            ? objEntries
                .map(function (kv) {
                  return kv[0] + ': ' + (typeof kv[1] === 'string' ? kv[1] : JSON.stringify(kv[1]));
                })
                .join('\n')
            : '';
      return (
        '<div class="sg-control-box">' +
        '<div class="sg-control-toolbar">' +
        '<span>Concise Specification Rule ' +
        modeSwitchHtml +
        '</span>' +
        refToggleHtml +
        '</div>' +
        '<textarea class="sg-input-textarea" rows="2" data-sg-spec-single="' +
        sgEsc(decId) +
        '" placeholder="Write the approved design rule or specification for this element…">' +
        sgEsc(singleSpecText) +
        '</textarea>' +
        '</div>'
      );
    }

    var kvRowsHtml = objEntries
      .map(function (pair, idx) {
        var k = pair[0];
        var v = typeof pair[1] === 'string' ? pair[1] : JSON.stringify(pair[1]);
        var showSwatch = isColorMap || /^#[0-9a-fA-F]{3,6}$/.test(String(v).trim());
        return (
          '<div class="sg-kv-row">' +
          '<input type="text" class="sg-input-text sg-kv-key" data-sg-kv-key="' +
          sgEsc(decId) +
          '" data-idx="' +
          idx +
          '" value="' +
          sgEsc(k) +
          '" placeholder="' +
          (exp.type === 'token_map' ? 'token_name' : 'aspect / state') +
          '">' +
          (showSwatch
            ? '<input type="color" class="sg-color-swatch" data-sg-kv-swatch="' +
              sgEsc(decId) +
              '" data-idx="' +
              idx +
              '" value="' +
              sgEsc(normalizeHexForSwatch(v)) +
              '" aria-label="Token color">'
            : '') +
          '<input type="text" class="sg-input-text sg-kv-val" data-sg-kv-val="' +
          sgEsc(decId) +
          '" data-idx="' +
          idx +
          '" value="' +
          sgEsc(v) +
          '" placeholder="' +
          (exp.type === 'token_map' ? 'e.g. #234B3A or 12px' : 'Approved specification…') +
          '">' +
          '<button type="button" class="sg-mini-btn danger" data-sg-kv-del="' +
          sgEsc(decId) +
          '" data-idx="' +
          idx +
          '" title="Remove row">×</button>' +
          '</div>'
        );
      })
      .join('');

    var suggestedKeys = suggestKeysForDecision(dec);
    var seedBtnHtml =
      objEntries.length === 0 && suggestedKeys.length > 0
        ? '<button type="button" class="sg-mini-btn" data-sg-kv-seed="' +
          sgEsc(decId) +
          '">✨ Pre-fill suggested fields (' +
          sgEsc(suggestedKeys.slice(0, 4).join(', ')) +
          (suggestedKeys.length > 4 ? '…' : '') +
          ')</button>'
        : '';

    return (
      '<div class="sg-control-box">' +
      '<div class="sg-control-toolbar">' +
      '<span>' +
      (exp.type === 'token_map' ? 'Token Map Builder' : 'Structured Aspect Builder') +
      ' ' +
      modeSwitchHtml +
      '</span>' +
      refToggleHtml +
      '</div>' +
      (kvRowsHtml ? '<div class="sg-kv-list">' + kvRowsHtml + '</div>' : '') +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      '<button type="button" class="sg-mini-btn" data-sg-kv-add="' +
      sgEsc(decId) +
      '">+ Add ' +
      (exp.type === 'token_map' ? 'token' : 'aspect') +
      ' row</button>' +
      seedBtnHtml +
      '</div>' +
      '</div>'
    );
  }

  function renderDecisionCardHtml(origDec) {
    var dec = getWorkingDecision(origDec.decision_id);
    var decId = dec.decision_id;
    var isDirty = Boolean(sgState.dirtyById[decId]);
    var editKind = isDirty ? classifyDirtyEditAgainstSaved(origDec, dec) : 'none';
    var isOverwritingSaved = editKind === 'overwrite' || editKind === 'cleared';

    var cardCls = 'sg-dec-card';
    if (isOverwritingSaved) cardCls += ' is-overwrite';
    else if (isDirty) cardCls += ' is-dirty';
    else if (dec.status === 'approved') cardCls += ' is-approved';
    else if (dec.status === 'not_applicable') cardCls += ' is-na';

    var statusPillCls = 'pill';
    if (dec.status === 'approved') statusPillCls += ' pill-ok';
    else if (dec.status === 'draft') statusPillCls += ' pill-warn';
    else if (dec.status === 'not_applicable') statusPillCls += ' pill-info';

    var canApprove = sgState.permissions.can_approve;
    var noteText = dec.notes || '';
    var noteExpanded = Boolean(sgState.noteOpenById[decId]) || noteText.trim().length > 0;

    var dirtyPillHtml = '';
    if (isOverwritingSaved) {
      dirtyPillHtml =
        '<span class="pill pill-warn">⚠️ ' +
        (editKind === 'cleared' ? 'Clears Saved Entry' : 'Overwrites Saved Entry') +
        '</span>';
    } else if (isDirty && editKind === 'newly_written') {
      dirtyPillHtml = '<span class="pill pill-ok">✨ New Answer (Unsaved)</span>';
    } else if (isDirty) {
      dirtyPillHtml = '<span class="pill pill-warn">Unsaved edit</span>';
    }

    var prevSavedCalloutHtml = '';
    if (isOverwritingSaved) {
      prevSavedCalloutHtml =
        '<div class="sg-prev-saved-callout">' +
        '<span><strong>Currently Saved (' +
        sgEsc((origDec.status || 'unanswered').toUpperCase()) +
        '):</strong> <code>' +
        sgEsc(formatDecisionPreviewClient(origDec)) +
        '</code>' +
        (origDec.notes ? ' · Note: <em>' + sgEsc(String(origDec.notes).slice(0, 70)) + '</em>' : '') +
        '</span>' +
        '<span style="font-size:11px;font-weight:700">Saving will prompt Confirm / Deny</span>' +
        '</div>';
    }

    var approvalRowHtml = '';
    if (dec.status === 'approved') {
      var appBy = (dec.approval && dec.approval.approved_by) || '';
      var appAt = (dec.approval && dec.approval.approved_at) || new Date().toISOString().slice(0, 10);
      approvalRowHtml =
        '<div class="sg-approval-row">' +
        '<span>✓ Approved by:</span>' +
        '<input type="text" data-sg-app-by="' +
        sgEsc(decId) +
        '" value="' +
        sgEsc(appBy) +
        '" placeholder="Matt Callaway / Yaman">' +
        '<span>Date:</span>' +
        '<input type="date" data-sg-app-at="' +
        sgEsc(decId) +
        '" value="' +
        sgEsc(String(appAt).slice(0, 10)) +
        '">' +
        '</div>';
    }

    var unconfCalloutHtml =
      dec.applicability === 'unconfirmed' && dec.status === 'unanswered'
        ? '<div style="font-size:12px;background:var(--gold-soft);border:1px solid var(--gold);padding:7px 10px;border-radius:7px;color:#5c3d00">' +
          '<strong>Unconfirmed Applicability:</strong> ' +
          sgEsc(dec.applicability_note || 'Confirm whether this item applies to BiteShark.') +
          '</div>'
        : '';

    return (
      '<article class="' +
      cardCls +
      '" id="sg-card-' +
      sgEsc(decId) +
      '" data-sg-card="' +
      sgEsc(decId) +
      '">' +
      '<div class="sg-dec-top">' +
      '<div class="sg-dec-title-wrap">' +
      '<div class="sg-dec-id-row">' +
      '<span class="sg-dec-id">' +
      sgEsc(decId) +
      '</span>' +
      (dec.dimension ? '<span class="sg-dim-pill">' + sgEsc(dec.dimension) + '</span>' : '') +
      '<span class="' +
      statusPillCls +
      '">' +
      sgEsc(dec.status.toUpperCase()) +
      '</span>' +
      (noteText.trim() ? '<span class="pill pill-info">📝 Note</span>' : '') +
      dirtyPillHtml +
      '</div>' +
      '<div class="sg-dec-title">' +
      sgEsc(dec.title) +
      '</div>' +
      '<p class="sg-dec-question">' +
      sgEsc(dec.question) +
      '</p>' +
      '<div class="sg-dec-constraint">Expected: <code>' +
      sgEsc(dec.expected_answer.type) +
      '</code> — ' +
      sgEsc(dec.expected_answer.constraints) +
      '</div>' +
      '</div>' +
      '<div class="sg-dec-status-controls">' +
      '<label style="font-size:11.5px;font-weight:600;color:var(--muted)">Status ' +
      '<select class="sg-status-select" data-sg-status="' +
      sgEsc(decId) +
      '">' +
      '<option value="unanswered"' +
      (dec.status === 'unanswered' ? ' selected' : '') +
      '>○ Unanswered</option>' +
      '<option value="draft"' +
      (dec.status === 'draft' ? ' selected' : '') +
      '>◐ Draft (In Progress)</option>' +
      '<option value="approved"' +
      (dec.status === 'approved' ? ' selected' : '') +
      (!canApprove && dec.status !== 'approved' ? ' disabled' : '') +
      '>✓ Approved (Done)' +
      (!canApprove ? ' [Top]' : '') +
      '</option>' +
      '<option value="not_applicable"' +
      (dec.status === 'not_applicable' ? ' selected' : '') +
      (!canApprove && dec.status !== 'not_applicable' ? ' disabled' : '') +
      '>⊘ Not Applicable' +
      (!canApprove ? ' [Top]' : '') +
      '</option>' +
      '</select>' +
      '</label>' +
      '</div>' +
      '</div>' +
      prevSavedCalloutHtml +
      unconfCalloutHtml +
      renderInputWidgetHtml(dec) +
      approvalRowHtml +
      '<div class="sg-card-foot">' +
      '<div class="sg-note-box" style="flex:1 1 320px">' +
      '<button type="button" class="sg-note-toggle" data-sg-note-toggle="' +
      sgEsc(decId) +
      '">' +
      (noteExpanded ? '▾ Hide optional note' : '+ Add optional note / rationale (not required)') +
      '</button>' +
      (noteExpanded
        ? '<textarea class="sg-input-textarea" rows="2" data-sg-note-input="' +
          sgEsc(decId) +
          '" placeholder="Optional note, team comment, or implementation caveat (never required)…">' +
          sgEsc(noteText) +
          '</textarea>'
        : '') +
      '</div>' +
      '<div style="display:flex;gap:6px;align-items:center">' +
      (isDirty
        ? '<button type="button" class="sg-mini-btn" data-sg-discard-one="' +
          sgEsc(decId) +
          '">Undo</button>' +
          '<button type="button" class="admin-btn admin-btn-primary admin-btn-sm" data-sg-save-one="' +
          sgEsc(decId) +
          '">' +
          (isOverwritingSaved ? 'Save / Overwrite…' : 'Save Item') +
          '</button>'
        : '') +
      '</div>' +
      '</div>' +
      '</article>'
    );
  }

  function rerenderSingleCard(decId) {
    var existing = document.getElementById('sg-card-' + decId);
    var orig = sgState.decisionsById[decId];
    if (!existing || !orig) {
      renderActiveCategoryWorkspace();
      return;
    }
    var temp = document.createElement('div');
    temp.innerHTML = renderDecisionCardHtml(orig);
    var nextEl = temp.firstElementChild;
    existing.replaceWith(nextEl);
    bindDecisionCardEvents(nextEl);
    renderTopSummaryAndSaveBar();
  }

  function bindDecisionCardEvents(scopeEl) {
    scopeEl.querySelectorAll('[data-sg-status]').forEach(function (sel) {
      sel.onchange = function () {
        var id = sel.getAttribute('data-sg-status');
        var d = ensureDirtyDraft(id);
        if (!d) return;
        d.status = sel.value;
        if (d.status === 'unanswered') {
          d.value = null;
          d.not_applicable_reason = null;
          d.approval = { approved_by: null, approved_at: null };
        } else if (d.status === 'not_applicable') {
          d.applicability = 'not_applicable';
          d.value = null;
          d.approval = { approved_by: null, approved_at: null };
        } else if (d.status === 'draft') {
          d.applicability = 'applicable';
          d.not_applicable_reason = null;
          d.approval = { approved_by: null, approved_at: null };
        } else if (d.status === 'approved') {
          d.applicability = 'applicable';
          d.not_applicable_reason = null;
          var emailEl = document.getElementById('adminUserEmail');
          var defaultName = emailEl ? emailEl.textContent.split('@')[0] : 'Admin: Top';
          d.approval = {
            approved_by: (d.approval && d.approval.approved_by) || defaultName || 'Matt Callaway',
            approved_at: (d.approval && d.approval.approved_at) || new Date().toISOString().slice(0, 10)
          };
        }
        rerenderSingleCard(id);
      };
    });

    scopeEl.querySelectorAll('[data-sg-ref-toggle]').forEach(function (chk) {
      chk.onchange = function () {
        var id = chk.getAttribute('data-sg-ref-toggle');
        var d = ensureDirtyDraft(id);
        sgState.refModeById[id] = chk.checked;
        if (d) {
          d.value = chk.checked ? 'ref:' : null;
          if (!chk.checked && d.status !== 'not_applicable') d.status = 'unanswered';
        }
        rerenderSingleCard(id);
      };
    });

    scopeEl.querySelectorAll('[data-sg-ref-input]').forEach(function (inp) {
      inp.oninput = function () {
        var id = inp.getAttribute('data-sg-ref-input');
        var d = ensureDirtyDraft(id);
        if (!d) return;
        var v = inp.value.trim();
        d.value = v || null;
        if (isRefString(v) && d.status === 'unanswered') {
          d.status = 'draft';
          d.applicability = 'applicable';
        }
        renderTopSummaryAndSaveBar();
      };
      inp.onchange = function () {
        rerenderSingleCard(inp.getAttribute('data-sg-ref-input'));
      };
    });

    scopeEl.querySelectorAll('[data-sg-na-reason]').forEach(function (inp) {
      inp.oninput = function () {
        var id = inp.getAttribute('data-sg-na-reason');
        var d = ensureDirtyDraft(id);
        if (!d) return;
        d.not_applicable_reason = inp.value;
        renderTopSummaryAndSaveBar();
      };
    });

    scopeEl.querySelectorAll('[data-sg-enum]').forEach(function (sel) {
      sel.onchange = function () {
        var id = sel.getAttribute('data-sg-enum');
        var d = ensureDirtyDraft(id);
        if (!d) return;
        d.value = sel.value ? sel.value : null;
        autoSyncStatusOnValueChange(d);
        rerenderSingleCard(id);
      };
    });

    scopeEl.querySelectorAll('[data-sg-bool]').forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.getAttribute('data-sg-bool');
        var raw = btn.getAttribute('data-val');
        var d = ensureDirtyDraft(id);
        if (!d) return;
        d.value = raw === 'true' ? true : raw === 'false' ? false : null;
        autoSyncStatusOnValueChange(d);
        rerenderSingleCard(id);
      };
    });

    scopeEl.querySelectorAll('[data-sg-num]').forEach(function (inp) {
      inp.oninput = function () {
        var id = inp.getAttribute('data-sg-num');
        var kind = inp.getAttribute('data-num-kind');
        var d = ensureDirtyDraft(id);
        if (!d) return;
        if (inp.value.trim() === '') {
          d.value = null;
        } else {
          var n = kind === 'integer' ? parseInt(inp.value, 10) : parseFloat(inp.value);
          d.value = Number.isFinite(n) ? n : null;
        }
        autoSyncStatusOnValueChange(d);
        renderTopSummaryAndSaveBar();
      };
      inp.onchange = function () {
        rerenderSingleCard(inp.getAttribute('data-sg-num'));
      };
    });

    scopeEl.querySelectorAll('[data-sg-color-pick]').forEach(function (pick) {
      pick.oninput = function () {
        var id = pick.getAttribute('data-sg-color-pick');
        var d = ensureDirtyDraft(id);
        if (!d) return;
        d.value = pick.value.toUpperCase();
        autoSyncStatusOnValueChange(d);
        var txt = scopeEl.querySelector('[data-sg-str="' + id + '"]');
        if (txt) txt.value = d.value;
        renderTopSummaryAndSaveBar();
      };
      pick.onchange = function () {
        rerenderSingleCard(pick.getAttribute('data-sg-color-pick'));
      };
    });

    scopeEl.querySelectorAll('[data-sg-str]').forEach(function (inp) {
      inp.oninput = function () {
        var id = inp.getAttribute('data-sg-str');
        var d = ensureDirtyDraft(id);
        if (!d) return;
        d.value = inp.value.trim() ? inp.value : null;
        autoSyncStatusOnValueChange(d);
        var sw = scopeEl.querySelector('[data-sg-color-pick="' + id + '"]');
        if (sw && /^#[0-9a-fA-F]{3,6}$/.test(inp.value.trim())) {
          sw.value = normalizeHexForSwatch(inp.value.trim());
        }
        renderTopSummaryAndSaveBar();
      };
      inp.onchange = function () {
        rerenderSingleCard(inp.getAttribute('data-sg-str'));
      };
    });

    scopeEl.querySelectorAll('[data-sg-list-add]').forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.getAttribute('data-sg-list-add');
        var d = ensureDirtyDraft(id);
        if (!d) return;
        if (!Array.isArray(d.value)) d.value = [];
        d.value.push('');
        rerenderSingleCard(id);
      };
    });

    scopeEl.querySelectorAll('[data-sg-list-item]').forEach(function (inp) {
      inp.oninput = function () {
        var id = inp.getAttribute('data-sg-list-item');
        var idx = parseInt(inp.getAttribute('data-idx'), 10);
        var d = ensureDirtyDraft(id);
        if (!d || !Array.isArray(d.value)) return;
        d.value[idx] = inp.value;
        autoSyncStatusOnValueChange(d);
        renderTopSummaryAndSaveBar();
      };
      inp.onchange = function () {
        rerenderSingleCard(inp.getAttribute('data-sg-list-item'));
      };
    });

    scopeEl.querySelectorAll('[data-sg-list-up]').forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.getAttribute('data-sg-list-up');
        var idx = parseInt(btn.getAttribute('data-idx'), 10);
        var d = ensureDirtyDraft(id);
        if (!d || !Array.isArray(d.value) || idx <= 0) return;
        var tmp = d.value[idx - 1];
        d.value[idx - 1] = d.value[idx];
        d.value[idx] = tmp;
        rerenderSingleCard(id);
      };
    });

    scopeEl.querySelectorAll('[data-sg-list-del]').forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.getAttribute('data-sg-list-del');
        var idx = parseInt(btn.getAttribute('data-idx'), 10);
        var d = ensureDirtyDraft(id);
        if (!d || !Array.isArray(d.value)) return;
        d.value.splice(idx, 1);
        if (d.value.length === 0) d.value = null;
        autoSyncStatusOnValueChange(d);
        rerenderSingleCard(id);
      };
    });

    scopeEl.querySelectorAll('[data-sg-spec-mode]').forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.getAttribute('data-sg-spec-mode');
        var d = getWorkingDecision(id);
        var curEntries =
          d && d.value && typeof d.value === 'object' && !Array.isArray(d.value)
            ? Object.entries(d.value)
            : [];
        var wasSingle =
          sgState.specConciseModeById[id] === true ||
          (sgState.specConciseModeById[id] === undefined &&
            curEntries.length === 1 &&
            curEntries[0][0] === 'specification');
        sgState.specConciseModeById[id] = !wasSingle;
        rerenderSingleCard(id);
      };
    });

    scopeEl.querySelectorAll('[data-sg-spec-single]').forEach(function (ta) {
      ta.oninput = function () {
        var id = ta.getAttribute('data-sg-spec-single');
        var d = ensureDirtyDraft(id);
        if (!d) return;
        var trimmed = ta.value.trim();
        d.value = trimmed ? { specification: ta.value } : null;
        autoSyncStatusOnValueChange(d);
        renderTopSummaryAndSaveBar();
      };
      ta.onchange = function () {
        rerenderSingleCard(ta.getAttribute('data-sg-spec-single'));
      };
    });

    scopeEl.querySelectorAll('[data-sg-kv-add]').forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.getAttribute('data-sg-kv-add');
        var d = ensureDirtyDraft(id);
        if (!d) return;
        if (!d.value || typeof d.value !== 'object' || Array.isArray(d.value)) d.value = {};
        var n = Object.keys(d.value).length + 1;
        var keyName = d.expected_answer.type === 'token_map' ? 'token_' + n : 'aspect_' + n;
        while (Object.prototype.hasOwnProperty.call(d.value, keyName)) {
          n += 1;
          keyName = (d.expected_answer.type === 'token_map' ? 'token_' : 'aspect_') + n;
        }
        d.value[keyName] = '';
        sgState.specConciseModeById[id] = false;
        rerenderSingleCard(id);
      };
    });

    scopeEl.querySelectorAll('[data-sg-kv-seed]').forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.getAttribute('data-sg-kv-seed');
        var d = ensureDirtyDraft(id);
        if (!d) return;
        var keys = suggestKeysForDecision(d);
        var nextObj = {};
        keys.forEach(function (k) {
          nextObj[k] = '';
        });
        d.value = nextObj;
        sgState.specConciseModeById[id] = false;
        rerenderSingleCard(id);
      };
    });

    function syncKvDomToDraft(id, cardRoot) {
      var d = ensureDirtyDraft(id);
      if (!d) return;
      var keyInputs = cardRoot.querySelectorAll('[data-sg-kv-key="' + id + '"]');
      var valInputs = cardRoot.querySelectorAll('[data-sg-kv-val="' + id + '"]');
      var nextObj = {};
      for (var i = 0; i < keyInputs.length; i++) {
        var k = keyInputs[i].value.trim() || 'key_' + (i + 1);
        var v = valInputs[i] ? valInputs[i].value : '';
        nextObj[k] = v;
      }
      d.value = Object.keys(nextObj).length > 0 ? nextObj : null;
      autoSyncStatusOnValueChange(d);
      renderTopSummaryAndSaveBar();
    }

    scopeEl.querySelectorAll('[data-sg-kv-key], [data-sg-kv-val]').forEach(function (inp) {
      inp.oninput = function () {
        var id = inp.getAttribute('data-sg-kv-key') || inp.getAttribute('data-sg-kv-val');
        var card = document.getElementById('sg-card-' + id) || scopeEl;
        syncKvDomToDraft(id, card);
      };
    });

    scopeEl.querySelectorAll('[data-sg-kv-swatch]').forEach(function (sw) {
      sw.oninput = function () {
        var id = sw.getAttribute('data-sg-kv-swatch');
        var idx = sw.getAttribute('data-idx');
        var card = document.getElementById('sg-card-' + id) || scopeEl;
        var valInput = card.querySelector('[data-sg-kv-val="' + id + '"][data-idx="' + idx + '"]');
        if (valInput) valInput.value = sw.value.toUpperCase();
        syncKvDomToDraft(id, card);
      };
      sw.onchange = function () {
        rerenderSingleCard(sw.getAttribute('data-sg-kv-swatch'));
      };
    });

    scopeEl.querySelectorAll('[data-sg-kv-del]').forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.getAttribute('data-sg-kv-del');
        var idx = parseInt(btn.getAttribute('data-idx'), 10);
        var d = ensureDirtyDraft(id);
        if (!d || !d.value || typeof d.value !== 'object') return;
        var entries = Object.entries(d.value);
        entries.splice(idx, 1);
        d.value = entries.length > 0 ? Object.fromEntries(entries) : null;
        autoSyncStatusOnValueChange(d);
        rerenderSingleCard(id);
      };
    });

    scopeEl.querySelectorAll('[data-sg-app-by]').forEach(function (inp) {
      inp.oninput = function () {
        var id = inp.getAttribute('data-sg-app-by');
        var d = ensureDirtyDraft(id);
        if (!d) return;
        if (!d.approval) d.approval = { approved_by: null, approved_at: null };
        d.approval.approved_by = inp.value;
      };
    });

    scopeEl.querySelectorAll('[data-sg-app-at]').forEach(function (inp) {
      inp.onchange = function () {
        var id = inp.getAttribute('data-sg-app-at');
        var d = ensureDirtyDraft(id);
        if (!d) return;
        if (!d.approval) d.approval = { approved_by: null, approved_at: null };
        d.approval.approved_at = inp.value;
      };
    });

    scopeEl.querySelectorAll('[data-sg-note-toggle]').forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.getAttribute('data-sg-note-toggle');
        sgState.noteOpenById[id] = !sgState.noteOpenById[id];
        rerenderSingleCard(id);
      };
    });

    scopeEl.querySelectorAll('[data-sg-note-input]').forEach(function (ta) {
      ta.oninput = function () {
        var id = ta.getAttribute('data-sg-note-input');
        var d = ensureDirtyDraft(id);
        if (!d) return;
        d.notes = ta.value;
        renderTopSummaryAndSaveBar();
      };
    });

    scopeEl.querySelectorAll('[data-sg-discard-one]').forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.getAttribute('data-sg-discard-one');
        delete sgState.dirtyById[id];
        delete sgState.refModeById[id];
        rerenderSingleCard(id);
      };
    });

    scopeEl.querySelectorAll('[data-sg-save-one]').forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.getAttribute('data-sg-save-one');
        saveDecisionIds([id], btn, { confirmOverwrite: false });
      };
    });
  }

  function renderActiveCategoryWorkspace() {
    var colEl = document.getElementById('sgMainColumn');
    if (!colEl) return;

    var topic =
      sgState.topics.find(function (t) {
        return t.slug === sgState.activeTopicSlug;
      }) || sgState.topics[0];
    if (!topic) return;

    var topicComponents = sgState.components.filter(function (c) {
      return c.topic === topic.slug;
    });
    var topicOrigDecisions = sgState.decisions.filter(function (d) {
      return d.topic === topic.slug;
    });
    var visibleDecisions = topicOrigDecisions.filter(function (orig) {
      return matchesFilters(getWorkingDecision(orig.decision_id));
    });

    var topicCounts = computeLiveClientCounts().byTopic[topic.slug] || {
      total: 0,
      done: 0,
      draft: 0,
      unanswered: 0
    };

    var componentOptionsHtml =
      '<option value="all">All Elements in Category (' +
      topicOrigDecisions.length +
      ')</option>' +
      '<option value="__TOPIC__"' +
      (sgState.componentFilter === '__TOPIC__' ? ' selected' : '') +
      '>Topic-Level Decisions</option>' +
      topicComponents
        .map(function (c) {
          return (
            '<option value="' +
            sgEsc(c.component_id) +
            '"' +
            (sgState.componentFilter === c.component_id ? ' selected' : '') +
            '>' +
            sgEsc(c.component_id + ' — ' + c.implementation_name) +
            '</option>'
          );
        })
        .join('');

    var sysDecs = visibleDecisions.filter(function (d) {
      return d.component_id === null;
    });
    var groupsHtml = '';

    if (sysDecs.length > 0) {
      var bySec = {};
      var secOrder = [];
      sysDecs.forEach(function (d) {
        if (!bySec[d.section]) {
          bySec[d.section] = [];
          secOrder.push(d.section);
        }
        bySec[d.section].push(d);
      });

      secOrder.forEach(function (secName) {
        var list = bySec[secName];
        groupsHtml +=
          '<div class="sg-group-block">' +
          '<div class="sg-group-head">' +
          '<h3>Topic-Level · ' +
          sgEsc(secName) +
          '</h3>' +
          '<span class="pill">' +
          list.length +
          ' question' +
          (list.length === 1 ? '' : 's') +
          '</span>' +
          '</div>' +
          '<div class="sg-decisions-stack">' +
          list.map(renderDecisionCardHtml).join('') +
          '</div>' +
          '</div>';
      });
    }

    topicComponents.forEach(function (cmp) {
      var cmpDecs = visibleDecisions.filter(function (d) {
        return d.component_id === cmp.component_id;
      });
      if (!cmpDecs.length) return;

      groupsHtml +=
        '<div class="sg-group-block">' +
        '<div class="sg-group-head">' +
        '<div>' +
        '<h3><code>' +
        sgEsc(cmp.component_id) +
        '</code> — ' +
        sgEsc(cmp.implementation_name) +
        '</h3>' +
        '<small style="color:var(--muted)">Screens: ' +
        sgEsc((cmp.screens || []).join(', ')) +
        ' · Roles: ' +
        sgEsc((cmp.user_roles || []).join(', ')) +
        '</small>' +
        '</div>' +
        '<span class="pill">' +
        cmpDecs.length +
        ' question' +
        (cmpDecs.length === 1 ? '' : 's') +
        '</span>' +
        '</div>' +
        '<details class="sg-cmp-context">' +
        '<summary>Observed Implementation Context (Selectors, Files &amp; States — Not Approved Design Specs)</summary>' +
        '<div class="sg-cmp-meta-grid">' +
        '<div><strong>Selectors:</strong> <code>' +
        sgEsc((cmp.selectors || []).join(', ') || 'none') +
        '</code></div>' +
        '<div><strong>DOM IDs:</strong> <code>' +
        sgEsc((cmp.dom_ids || []).join(', ') || 'dynamic/none') +
        '</code></div>' +
        '<div><strong>Files:</strong> <code>' +
        sgEsc((cmp.definition_files || []).join(', ') || 'unconfirmed') +
        '</code></div>' +
        '<div><strong>Observed States:</strong> ' +
        sgEsc((cmp.existing_states || []).join('; ') || 'none') +
        '</div>' +
        '</div>' +
        '</details>' +
        '<div class="sg-decisions-stack">' +
        cmpDecs.map(renderDecisionCardHtml).join('') +
        '</div>' +
        '</div>';
    });

    if (!groupsHtml) {
      groupsHtml =
        '<div class="state-box">No style-guide questions in <strong>' +
        sgEsc(topic.title) +
        '</strong> match the current filter.</div>';
    }

    colEl.innerHTML =
      '<div class="sg-topic-banner">' +
      '<div class="sg-topic-banner-top">' +
      '<div style="flex:1 1 360px">' +
      '<span class="sec-kicker">CATEGORY ' +
      topic.order +
      ' OF ' +
      sgState.topics.length +
      ' · ' +
      sgEsc(topic.file) +
      '</span>' +
      '<h2>' +
      sgEsc(topic.title) +
      '</h2>' +
      '<p>' +
      sgEsc(topic.scope_summary) +
      '</p>' +
      '</div>' +
      '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">' +
      '<div>' +
      '<span class="pill pill-ok">' +
      topicCounts.done +
      ' Done</span> ' +
      '<span class="pill pill-warn">' +
      topicCounts.draft +
      ' Draft</span> ' +
      '<span class="pill">' +
      topicCounts.unanswered +
      ' Left</span>' +
      '</div>' +
      '<button type="button" class="admin-btn admin-btn-secondary admin-btn-sm" id="sgPreviewTopicMdBtn">📄 View Populated <code>' +
      sgEsc(topic.file) +
      '</code></button>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '<div class="sg-filter-bar">' +
      '<label class="sg-filter-field">Completion Filter' +
      '<select id="sgStatusFilterSelect">' +
      '<option value="all"' +
      (sgState.statusFilter === 'all' ? ' selected' : '') +
      '>All (' +
      topicOrigDecisions.length +
      ')</option>' +
      '<option value="unanswered"' +
      (sgState.statusFilter === 'unanswered' ? ' selected' : '') +
      '>Unanswered Only</option>' +
      '<option value="done"' +
      (sgState.statusFilter === 'done' ? ' selected' : '') +
      '>Done (Approved + N/A)</option>' +
      '<option value="draft"' +
      (sgState.statusFilter === 'draft' ? ' selected' : '') +
      '>Drafts Only</option>' +
      '<option value="unconfirmed"' +
      (sgState.statusFilter === 'unconfirmed' ? ' selected' : '') +
      '>Unconfirmed Applicability</option>' +
      '<option value="notes"' +
      (sgState.statusFilter === 'notes' ? ' selected' : '') +
      '>With Notes (📝)</option>' +
      '<option value="dirty"' +
      (sgState.statusFilter === 'dirty' ? ' selected' : '') +
      '>Unsaved Edits</option>' +
      '</select>' +
      '</label>' +
      '<label class="sg-filter-field">UI Element / Sub-Section' +
      '<select id="sgComponentFilterSelect">' +
      componentOptionsHtml +
      '</select>' +
      '</label>' +
      '<label class="sg-filter-field grow">Search Questions, Selectors or Notes' +
      '<input type="search" id="sgSearchInput" value="' +
      sgEsc(sgState.searchQuery) +
      '" placeholder="Filter by DEC-ID, component, selector, or keyword…">' +
      '</label>' +
      '</div>' +
      groupsHtml;

    var prevBtn = document.getElementById('sgPreviewTopicMdBtn');
    if (prevBtn) {
      prevBtn.onclick = function () {
        openHostedDocModal(topic.file);
      };
    }

    var stSel = document.getElementById('sgStatusFilterSelect');
    if (stSel) {
      stSel.onchange = function () {
        sgState.statusFilter = stSel.value;
        renderActiveCategoryWorkspace();
      };
    }

    var cmpSel = document.getElementById('sgComponentFilterSelect');
    if (cmpSel) {
      cmpSel.onchange = function () {
        sgState.componentFilter = cmpSel.value;
        renderActiveCategoryWorkspace();
      };
    }

    var searchInp = document.getElementById('sgSearchInput');
    if (searchInp) {
      searchInp.oninput = function () {
        sgState.searchQuery = searchInp.value;
        var pos = searchInp.selectionStart;
        renderActiveCategoryWorkspace();
        var nextInp = document.getElementById('sgSearchInput');
        if (nextInp) {
          nextInp.focus();
          try {
            nextInp.setSelectionRange(pos, pos);
          } catch {}
        }
      };
    }

    bindDecisionCardEvents(colEl);
  }

  function renderChangedItemsTableHtml(items, emptyText) {
    if (!items || !items.length) {
      return '<div style="padding:10px 12px;color:var(--muted);font-size:12.5px">' + sgEsc(emptyText || 'No differences detected.') + '</div>';
    }
    var rows = items
      .map(function (it) {
        var badge = 'pill';
        var label = 'CHANGED';
        if (it.change_type === 'newly_written') {
          badge = 'pill pill-ok';
          label = 'NEWLY WRITTEN';
        } else if (it.change_type === 'rewritten') {
          badge = 'pill pill-warn';
          label = 'REWRITTEN';
        } else if (it.change_type === 'cleared') {
          badge = 'pill pill-danger';
          label = 'CLEARED';
        } else if (it.change_type === 'notes_updated') {
          badge = 'pill pill-info';
          label = 'NOTE UPDATED';
        }
        return (
          '<tr>' +
          '<td><code>' +
          sgEsc(it.decision_id) +
          '</code><br><small style="color:var(--muted)">' +
          sgEsc(it.component_id || it.topic) +
          '</small></td>' +
          '<td><span class="' +
          badge +
          '">' +
          label +
          '</span><div style="font-weight:600;margin-top:2px">' +
          sgEsc(it.title) +
          '</div></td>' +
          '<td><small style="color:var(--muted)">' +
          sgEsc((it.previous_status || 'unanswered').toUpperCase()) +
          '</small><br><code>' +
          sgEsc(it.previous_preview || 'Unanswered') +
          '</code></td>' +
          '<td><small style="color:var(--forest-dark);font-weight:700">' +
          sgEsc((it.next_status || 'unanswered').toUpperCase()) +
          '</small><br><code>' +
          sgEsc(it.next_preview || 'Unanswered') +
          '</code></td>' +
          '</tr>'
        );
      })
      .join('');

    return (
      '<table class="sg-diff-table">' +
      '<thead><tr><th>ID / Element</th><th>Change Type</th><th>Previous Saved</th><th>New / Current</th></tr></thead>' +
      '<tbody>' +
      rows +
      '</tbody></table>'
    );
  }

  function openOverwriteConfirmationModal(idsToSave, conflictPayload) {
    var saveDiff = (conflictPayload && conflictPayload.save_diff) || {};
    var c = saveDiff.counts || {};
    var q = saveDiff.questions || {};
    var isConcurrent = conflictPayload && conflictPayload.conflict_kind === 'concurrent_revision';

    sgState.pendingOverwriteCtx = {
      idsToSave: idsToSave.slice(),
      conflictKind: conflictPayload ? conflictPayload.conflict_kind : 'existing_answers',
      overwrittenIds: (saveDiff.overwritten_items || []).map(function (x) {
        return x.decision_id;
      })
    };

    var titleEl = document.getElementById('sgOverwriteModalTitle');
    var leadEl = document.getElementById('sgOverwriteModalLead');
    var gridEl = document.getElementById('sgOverwriteSummaryGrid');
    var diffEl = document.getElementById('sgOverwriteDiffBox');
    var errEl = document.getElementById('sgOverwriteModalError');
    if (errEl) {
      errEl.hidden = true;
      errEl.textContent = '';
    }

    if (titleEl) {
      titleEl.textContent = isConcurrent
        ? 'Concurrent Update Detected — Confirm or Deny Overwrite?'
        : 'Confirm Overwrite of ' +
          (c.overwrite_total_count || 1) +
          ' Saved Style Guide Entr' +
          ((c.overwrite_total_count || 1) === 1 ? 'y?' : 'ies?');
    }
    if (leadEl) {
      leadEl.textContent =
        (conflictPayload && conflictPayload.error) ||
        'Review the recognized changes below. Confirm to overwrite in persistent storage (an automatic revision backup will be saved), or Deny to keep existing saved values.';
    }

    if (gridEl) {
      gridEl.innerHTML =
        '<div class="sg-upload-metric-card is-accent"><strong>' +
        Number(c.newly_written_count || 0) +
        '</strong><span>Newly Written</span></div>' +
        '<div class="sg-upload-metric-card is-warn"><strong>' +
        Number(c.rewritten_count || 0) +
        '</strong><span>Rewritten / Overwritten</span></div>' +
        '<div class="sg-upload-metric-card"><strong>' +
        Number(c.cleared_count || 0) +
        '</strong><span>Cleared to Blank</span></div>' +
        '<div class="sg-upload-metric-card"><strong>' +
        Number(q.left_unanswered != null ? q.left_unanswered : 0) +
        ' / ' +
        Number(q.total || 773) +
        '</strong><span>Left Unanswered After Save</span></div>';
    }

    if (diffEl) {
      var listToShow =
        (saveDiff.overwritten_items && saveDiff.overwritten_items.length
          ? saveDiff.overwritten_items
          : saveDiff.changed_items) || [];
      diffEl.innerHTML = renderChangedItemsTableHtml(
        listToShow,
        'Reviewing concurrent revision differences.'
      );
    }

    openModal('sgOverwriteConfirmModal');
  }

  async function saveDecisionIds(idsToSave, triggerBtn, opts) {
    var confirmOverwrite = Boolean(opts && opts.confirmOverwrite);
    if (sgState.saving || !idsToSave || !idsToSave.length) return;

    var updates = idsToSave
      .map(function (id) {
        var d = sgState.dirtyById[id];
        if (!d) return null;
        return {
          decision_id: d.decision_id,
          applicability: d.applicability,
          status: d.status,
          value: d.value,
          not_applicable_reason: d.not_applicable_reason,
          approved_by: d.approval ? d.approval.approved_by : null,
          approved_at: d.approval ? d.approval.approved_at : null,
          notes: d.notes || null
        };
      })
      .filter(Boolean);

    if (!updates.length) return;
    sgState.saving = true;
    var origLabel = triggerBtn ? triggerBtn.textContent : '';
    if (triggerBtn) {
      triggerBtn.disabled = true;
      triggerBtn.textContent = 'Saving…';
    }

    try {
      var res = await sgApiJson('/api/admin/style-guide/save', {
        method: 'POST',
        body: {
          expected_revision: sgState.revision,
          confirm_overwrite: confirmOverwrite,
          updates: updates
        }
      });

      sgState.revision = res.revision;
      sgState.hasUnpushedChanges = Boolean(res.has_unpushed_changes);
      sgState.persistence = res.persistence || sgState.persistence;
      sgState.repoDiff = res.repo_diff || sgState.repoDiff;
      sgState.stats = res.stats;

      (res.updated_decisions || []).forEach(function (updated) {
        sgState.decisionsById[updated.decision_id] = updated;
        var idx = sgState.decisions.findIndex(function (x) {
          return x.decision_id === updated.decision_id;
        });
        if (idx !== -1) sgState.decisions[idx] = updated;
        delete sgState.dirtyById[updated.decision_id];
      });

      closeModal('sgOverwriteConfirmModal');
      sgState.pendingOverwriteCtx = null;

      var sd = (res.save_diff && res.save_diff.counts) || {};
      var sq = (res.save_diff && res.save_diff.questions) || {};
      showToast(
        'Saved to persistent storage: ' +
          Number(sd.newly_written_count || 0) +
          ' newly written, ' +
          Number(sd.rewritten_count || 0) +
          ' rewritten, ' +
          Number(sq.left_unanswered != null ? sq.left_unanswered : 0) +
          ' questions left unanswered.',
        false
      );
      renderTopSummaryAndSaveBar();
      renderActiveCategoryWorkspace();
    } catch (err) {
      if (err && err.status === 409 && err.payload && err.payload.requires_confirmation) {
        openOverwriteConfirmationModal(idsToSave, err.payload);
      } else {
        showToast((err && err.message) || 'Could not save Style Guide changes.', true);
      }
    } finally {
      sgState.saving = false;
      if (triggerBtn) {
        triggerBtn.disabled = false;
        triggerBtn.textContent = origLabel;
      }
    }
  }

  function renderSafeMarkdownPreview(mdText) {
    var lines = String(mdText || '').replace(/\r\n/g, '\n').split('\n');
    var html = [];
    var i = 0;

    function inlineFmt(raw) {
      var cleaned = raw.replace(/<a id="[a-z0-9-]+"><\/a>/gi, '');
      var parts = cleaned.split(/(`[^`]+`)/g);
      return parts
        .map(function (seg, idx) {
          if (idx % 2 === 1) {
            return '<code>' + sgEsc(seg.slice(1, -1)) + '</code>';
          }
          return sgEsc(seg)
            .replace(/&lt;br&gt;/gi, '<br>')
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            .replace(/\*([^*]+)\*/g, '<em>$1</em>');
        })
        .join('');
    }

    while (i < lines.length) {
      var line = lines[i];
      if (/^#{1,4}\s+/.test(line)) {
        var lvl = line.match(/^(#{1,4})/)[1].length;
        html.push('<h' + lvl + ' style="margin:14px 0 6px;color:var(--forest-dark)">' + inlineFmt(line.replace(/^#{1,4}\s+/, '')) + '</h' + lvl + '>');
        i += 1;
        continue;
      }
      if (line.startsWith('|') && i + 1 < lines.length && /^\|[\s:|-]+\|/.test(lines[i + 1])) {
        var headCells = line
          .slice(1, -1)
          .split(/(?<!\\)\|/)
          .map(function (c) {
            return '<th>' + inlineFmt(c.trim().replace(/\\\|/g, '|')) + '</th>';
          });
        i += 2;
        var bodyRows = [];
        while (i < lines.length && lines[i].startsWith('|')) {
          var rowCells = lines[i]
            .slice(1, -1)
            .split(/(?<!\\)\|/)
            .map(function (c) {
              return '<td>' + inlineFmt(c.trim().replace(/\\\|/g, '|')) + '</td>';
            });
          bodyRows.push('<tr>' + rowCells.join('') + '</tr>');
          i += 1;
        }
        html.push('<table><thead><tr>' + headCells.join('') + '</tr></thead><tbody>' + bodyRows.join('') + '</tbody></table>');
        continue;
      }
      if (line.startsWith('>')) {
        var quoteLines = [];
        while (i < lines.length && lines[i].startsWith('>')) {
          quoteLines.push(inlineFmt(lines[i].replace(/^>\s?/, '')));
          i += 1;
        }
        html.push('<div style="background:var(--bg-subtle);border-left:4px solid var(--forest);padding:8px 12px;margin:8px 0;border-radius:6px">' + quoteLines.join('<br>') + '</div>');
        continue;
      }
      if (line.trim() === '---') {
        html.push('<hr style="border:none;border-top:1px solid var(--border);margin:14px 0">');
        i += 1;
        continue;
      }
      if (line.startsWith('- ') || line.startsWith('  - ')) {
        var ulItems = [];
        while (i < lines.length && (lines[i].startsWith('- ') || lines[i].startsWith('  - '))) {
          ulItems.push('<li>' + inlineFmt(lines[i].replace(/^\s*-\s+/, '')) + '</li>');
          i += 1;
        }
        html.push('<ul style="margin:6px 0 10px;padding-left:20px">' + ulItems.join('') + '</ul>');
        continue;
      }
      if (line.trim().length > 0) {
        html.push('<p style="margin:6px 0">' + inlineFmt(line) + '</p>');
      }
      i += 1;
    }
    return html.join('');
  }

  async function loadAndRenderHostedDoc(fileName) {
    sgState.docViewer.file = fileName;
    var bodyEl = document.getElementById('sgHostedDocBody');
    var metaEl = document.getElementById('sgHostedDocMeta');
    if (bodyEl) bodyEl.innerHTML = '<div class="state-box">Loading live hosted section…</div>';

    try {
      var res = await sgApiJson('/api/admin/style-guide/doc?file=' + encodeURIComponent(fileName));
      sgState.docViewer.content = res.content || '';
      sgState.docViewer.repoPath = res.repo_path || 'docs/engineering/style-guide/' + fileName;
      sgState.docViewer.digest = res.decisions_digest_sha256 || '';

      if (metaEl) {
        metaEl.innerHTML =
          'Hosted path: <code>' +
          sgEsc(sgState.docViewer.repoPath) +
          '</code> · Digest: <code>' +
          sgEsc(String(sgState.docViewer.digest).slice(0, 12)) +
          '</code>';
      }
      renderDocViewerContent();
    } catch (err) {
      if (bodyEl) {
        bodyEl.innerHTML = '<div class="state-box state-error">' + sgEsc(err.message) + '</div>';
      }
    }
  }

  function renderDocViewerContent() {
    var bodyEl = document.getElementById('sgHostedDocBody');
    if (!bodyEl) return;
    var isJson = sgState.docViewer.file.endsWith('.json');
    if (sgState.docViewer.mode === 'raw' || isJson) {
      bodyEl.innerHTML = '<pre>' + sgEsc(sgState.docViewer.content) + '</pre>';
    } else {
      bodyEl.innerHTML = renderSafeMarkdownPreview(sgState.docViewer.content);
    }
  }

  function openHostedDocModal(initialFile) {
    var fileSel = document.getElementById('sgHostedDocSelect');
    if (fileSel) {
      fileSel.innerHTML = sgState.hostedFiles
        .map(function (f) {
          return (
            '<option value="' +
            sgEsc(f) +
            '"' +
            (f === initialFile ? ' selected' : '') +
            '>' +
            sgEsc(f) +
            '</option>'
          );
        })
        .join('');
    }
    openModal('sgHostedDocModal');
    loadAndRenderHostedDoc(initialFile || 'COMPLETION-REMINDER.md');
  }

  function renderUploadReportIntoModal(report, targetBranchLabel) {
    sgState.activeUploadReport = report;
    var gh = sgState.githubPush || {};
    var c = (report && report.counts) || {};
    var q = (report && report.questions) || {};
    var el = (report && report.elements) || {};
    var cat = (report && report.categories) || {};
    var fl = (report && report.files) || {};

    var summaryEl = document.getElementById('sgPushSummaryCallout');
    if (summaryEl) {
      summaryEl.innerHTML =
        '<strong>Repository:</strong> <code>' +
        sgEsc(gh.repo || 'yamanalmasaleha-png/trukly-') +
        '</code> · <strong>Target Branch:</strong> <code>' +
        sgEsc(targetBranchLabel || gh.default_branch || 'working/biteshark-vps') +
        '</code> · <strong>Compared Against:</strong> ' +
        sgEsc((report && report.reference_label) || 'deployed repo baseline');
    }

    var gridEl = document.getElementById('sgPushMetricsGrid');
    if (gridEl) {
      gridEl.innerHTML =
        '<div class="sg-upload-metric-card is-accent"><strong>' +
        Number(c.newly_written_count || 0) +
        '</strong><span>Newly Written Questions</span></div>' +
        '<div class="sg-upload-metric-card' +
        (Number(c.rewritten_count || 0) > 0 ? ' is-warn' : '') +
        '"><strong>' +
        Number(c.rewritten_count || 0) +
        '</strong><span>Rewritten / Modified (' +
        Number(c.cleared_count || 0) +
        ' cleared · ' +
        Number(c.notes_changed_total_count || 0) +
        ' notes)</span></div>' +
        '<div class="sg-upload-metric-card"><strong>' +
        Number(el.touched_count || 0) +
        ' / ' +
        Number(el.total || 29) +
        '</strong><span>UI Elements Touched (' +
        Number(el.completed_count || 0) +
        ' done · ' +
        Number(el.left_count != null ? el.left_count : 29) +
        ' left)</span></div>' +
        '<div class="sg-upload-metric-card"><strong>' +
        Number(q.done || 0) +
        ' / ' +
        Number(q.total || 773) +
        ' (' +
        Number(q.completion_percent || 0) +
        '%)</strong><span>Done (' +
        Number(q.draft || 0) +
        ' Draft · ' +
        Number(q.with_notes || 0) +
        ' Notes)</span></div>' +
        '<div class="sg-upload-metric-card is-warn"><strong>' +
        Number(q.left_unanswered != null ? q.left_unanswered : 773) +
        ' / ' +
        Number(q.total || 773) +
        '</strong><span>Questions Left Unanswered (' +
        Number(cat.left_count != null ? cat.left_count : 15) +
        '/' +
        Number(cat.total || 15) +
        ' categories left)</span></div>' +
        '<div class="sg-upload-metric-card"><strong>' +
        Number(fl.changed_count || 0) +
        ' / ' +
        Number(fl.bundle_total || 19) +
        '</strong><span>Repo Style-Guide Files Modified</span></div>';
    }

    var changedWrap = document.getElementById('sgPushChangedItemsWrap');
    if (changedWrap) {
      var items = (report && report.changed_items) || [];
      changedWrap.hidden = false;
      changedWrap.innerHTML = renderChangedItemsTableHtml(
        items,
        '0 Style Guide decisions differ from the compared baseline yet (uploading will re-sync all 19 Style Guide files on the target branch).'
      );
    }

    var msgInput = document.getElementById('sgPushCommitMessage');
    if (msgInput) {
      msgInput.value =
        'docs(style-guide): sync style guide (' +
        Number(c.newly_written_count || 0) +
        ' written, ' +
        Number(c.rewritten_count || 0) +
        ' rewritten, ' +
        Number(q.left_unanswered != null ? q.left_unanswered : 773) +
        ' left)';
    }
  }

  function getSelectedUploadBranchInfo() {
    var branchSel = document.getElementById('sgPushBranchSelect');
    var customInp = document.getElementById('sgPushCustomBranchInput');
    var isCustom = branchSel && branchSel.value === '__custom__';
    var targetBranch = isCustom
      ? customInp
        ? customInp.value.trim()
        : ''
      : branchSel
        ? branchSel.value
        : '';
    return { isCustom: Boolean(isCustom), targetBranch: targetBranch };
  }

  function openPushToRepoModal() {
    var dirtyCount = Object.keys(sgState.dirtyById).length;
    if (dirtyCount > 0) {
      showToast('Save your ' + dirtyCount + ' unsaved edit(s) first before uploading to Git.', true);
      return;
    }

    var gh = sgState.githubPush || {};
    var defaultBranch = gh.default_branch || 'working/biteshark-vps';

    var branchSel = document.getElementById('sgPushBranchSelect');
    if (branchSel) {
      var branches = gh.suggested_branches || [
        'working/biteshark-vps',
        'testing/yaman-staging2',
        'antigravity/staging2-latest'
      ];
      branchSel.innerHTML =
        branches
          .map(function (b) {
            return (
              '<option value="' +
              sgEsc(b) +
              '"' +
              (b === defaultBranch ? ' selected' : '') +
              '>' +
              sgEsc(b) +
              (b === defaultBranch ? ' (respective branch for this server)' : '') +
              '</option>'
            );
          })
          .join('') + '<option value="__custom__">+ Create new branch…</option>';
    }

    var customWrap = document.getElementById('sgPushCustomBranchWrap');
    if (customWrap) customWrap.hidden = true;

    var remBanner = document.getElementById('sgPushRemoteOverwriteBanner');
    if (remBanner) remBanner.hidden = true;

    renderUploadReportIntoModal(sgState.repoDiff || null, defaultBranch);

    var tokenNote = document.getElementById('sgPushTokenStatusNote');
    var tokenInputWrap = document.getElementById('sgPushTokenInputWrap');
    var tokenInput = document.getElementById('sgPushTokenInput');
    if (tokenInput) tokenInput.value = '';
    if (gh.server_token_configured) {
      if (tokenNote) {
        tokenNote.innerHTML =
          '✓ <strong>Server GitHub token is configured</strong> (<code>BITESHARK_STYLE_GUIDE_GITHUB_TOKEN</code>). Ready for 1-click upload to <code>' +
          sgEsc(defaultBranch) +
          '</code>.';
      }
      if (tokenInputWrap) tokenInputWrap.hidden = true;
    } else {
      if (tokenNote) {
        tokenNote.innerHTML =
          'Enter a fine-grained GitHub Personal Access Token with <code>Contents: Read &amp; Write</code> on <code>' +
          sgEsc(gh.repo || 'yamanalmasaleha-png/trukly-') +
          '</code> (used once in memory for this HTTPS upload and never stored), or configure <code>BITESHARK_STYLE_GUIDE_GITHUB_TOKEN</code> in <code>staging.env</code>.';
      }
      if (tokenInputWrap) tokenInputWrap.hidden = false;
    }

    var errEl = document.getElementById('sgPushModalError');
    if (errEl) {
      errEl.hidden = true;
      errEl.textContent = '';
    }
    var okEl = document.getElementById('sgPushModalSuccess');
    if (okEl) {
      okEl.hidden = true;
      okEl.innerHTML = '';
    }

    var portalApi = window.bitesharkAdminPortal;
    var ctxObj = portalApi && typeof portalApi.getAccessContext === 'function' ? portalApi.getAccessContext() : null;
    var ctxEmail = ctxObj && ctxObj.user && ctxObj.user.email ? String(ctxObj.user.email) : '';
    var authorNameEl = document.getElementById('sgPushAuthorName');
    var authorEmailEl = document.getElementById('sgPushAuthorEmail');
    if (authorEmailEl && !authorEmailEl.value && ctxEmail) {
      authorEmailEl.value = ctxEmail;
    }
    if (authorNameEl && !authorNameEl.value && ctxEmail) {
      authorNameEl.value = ctxEmail.split('@')[0] || 'BiteShark Top Admin';
    }

    openModal('sgPushRepoModal');
    if (gh.server_token_configured) {
      inspectLiveRemoteDiff(true);
    }
  }

  async function inspectLiveRemoteDiff(silentIfMissingToken) {
    var bInfo = getSelectedUploadBranchInfo();
    if (!bInfo.targetBranch) return;
    var gh = sgState.githubPush || {};
    var tokenInp = document.getElementById('sgPushTokenInput');
    var tokenVal = tokenInp ? tokenInp.value.trim() : '';
    if (!gh.server_token_configured && !tokenVal) {
      if (!silentIfMissingToken) {
        var errEl = document.getElementById('sgPushModalError');
        if (errEl) {
          errEl.hidden = false;
          errEl.textContent = 'Enter a GitHub token first to inspect the live remote branch diff.';
        }
      }
      return;
    }

    var btn = document.getElementById('sgPushInspectRemoteBtn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Checking remote branch…';
    }
    try {
      var res = await sgApiJson('/api/admin/style-guide/push', {
        method: 'POST',
        body: {
          dry_run: true,
          branch: bInfo.targetBranch,
          create_branch: bInfo.isCustom,
          base_branch: gh.default_branch || 'working/biteshark-vps',
          github_token: tokenVal
        }
      });
      if (res && res.upload_report) {
        renderUploadReportIntoModal(res.upload_report, bInfo.targetBranch);
      }
    } catch (err) {
      if (!silentIfMissingToken) {
        var errEl2 = document.getElementById('sgPushModalError');
        if (errEl2) {
          errEl2.hidden = false;
          errEl2.textContent = err.message || 'Remote branch diff check failed.';
        }
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '🔍 Check Live Remote Diff';
      }
    }
  }

  async function executePushToRepo(confirmRemoteOverwrite) {
    if (sgState.pushing) return;

    var errEl = document.getElementById('sgPushModalError');
    var okEl = document.getElementById('sgPushModalSuccess');
    var remBanner = document.getElementById('sgPushRemoteOverwriteBanner');
    var submitBtn = document.getElementById('sgPushSubmitBtn');
    if (errEl) errEl.hidden = true;
    if (okEl) okEl.hidden = true;
    if (remBanner && confirmRemoteOverwrite) remBanner.hidden = true;

    var bInfo = getSelectedUploadBranchInfo();
    if (!bInfo.targetBranch) {
      if (errEl) {
        errEl.hidden = false;
        errEl.textContent = 'Enter a valid target branch name.';
      }
      return;
    }

    var msgInput = document.getElementById('sgPushCommitMessage');
    var authorNameInp = document.getElementById('sgPushAuthorName');
    var authorEmailInp = document.getElementById('sgPushAuthorEmail');
    var tokenInp = document.getElementById('sgPushTokenInput');

    sgState.pushing = true;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Uploading Style Guide to ' + bInfo.targetBranch + '…';
    }

    try {
      var gh = sgState.githubPush || {};
      var res = await sgApiJson('/api/admin/style-guide/push', {
        method: 'POST',
        body: {
          branch: bInfo.targetBranch,
          create_branch: bInfo.isCustom,
          base_branch: gh.default_branch || 'working/biteshark-vps',
          confirm_overwrite: Boolean(confirmRemoteOverwrite),
          commit_message: msgInput ? msgInput.value.trim() : '',
          author_name: authorNameInp ? authorNameInp.value.trim() : '',
          author_email: authorEmailInp ? authorEmailInp.value.trim() : '',
          github_token: tokenInp ? tokenInp.value.trim() : ''
        }
      });

      if (tokenInp) tokenInp.value = '';
      sgState.hasUnpushedChanges = false;
      if (res.repo_diff) {
        sgState.repoDiff = res.repo_diff;
      }
      if (sgState.githubPush) {
        sgState.githubPush.last_pushed_commit_sha = res.commit_sha;
        sgState.githubPush.last_pushed_commit_url = res.commit_url;
        sgState.githubPush.last_pushed_branch = res.branch;
        sgState.githubPush.last_pushed_at = res.pushed_at;
      }
      if (remBanner) remBanner.hidden = true;

      var rep = res.upload_report || sgState.activeUploadReport || {};
      var rc = rep.counts || {};
      var rq = rep.questions || {};
      var rel = rep.elements || {};
      var rfl = rep.files || {};

      if (okEl) {
        okEl.hidden = false;
        okEl.innerHTML =
          '<div><strong>✓ Uploaded Current Version to <code>' +
          sgEsc(res.branch) +
          '</code></strong> — Commit <a href="' +
          sgEsc(res.commit_url) +
          '" target="_blank" rel="noopener"><code>' +
          sgEsc(String(res.commit_sha).slice(0, 12)) +
          '</code> ↗</a></div>' +
          '<div style="margin-top:6px;font-size:12.5px">' +
          '<strong>Written / Rewritten Summary:</strong> ' +
          Number(rc.newly_written_count || 0) +
          ' newly written · ' +
          Number(rc.rewritten_count || 0) +
          ' rewritten · ' +
          Number(rc.cleared_count || 0) +
          ' cleared · ' +
          Number(rel.touched_count || 0) +
          '/' +
          Number(rel.total || 29) +
          ' UI elements touched · ' +
          Number(rfl.changed_count != null ? rfl.changed_count : res.files_changed_count || 0) +
          '/' +
          Number(res.files_committed_count || 19) +
          ' repo files modified.<br>' +
          '<strong>Remaining Work:</strong> <strong>' +
          Number(rq.left_unanswered != null ? rq.left_unanswered : 0) +
          ' / ' +
          Number(rq.total || 773) +
          '</strong> questions left unanswered (' +
          Number(rq.done || 0) +
          ' done · ' +
          Number(rq.draft || 0) +
          ' draft · <strong>' +
          Number(rel.left_count != null ? rel.left_count : 0) +
          ' / ' +
          Number(rel.total || 29) +
          '</strong> UI elements still have open questions).' +
          '</div>';
      }
      renderTopSummaryAndSaveBar();
    } catch (err) {
      if (
        err &&
        err.status === 409 &&
        err.payload &&
        err.payload.code === 'REMOTE_OVERWRITE_CONFIRMATION_REQUIRED'
      ) {
        if (err.payload.upload_report) {
          renderUploadReportIntoModal(err.payload.upload_report, bInfo.targetBranch);
        }
        var rbBody = document.getElementById('sgPushRemoteOverwriteBody');
        if (rbBody) {
          rbBody.textContent =
            err.payload.error ||
            'Remote branch contains saved Style Guide entries that would be rewritten by this upload.';
        }
        if (remBanner) remBanner.hidden = false;
      } else if (errEl) {
        errEl.hidden = false;
        errEl.textContent = (err && err.message) || 'Upload to GitHub failed.';
      }
    } finally {
      sgState.pushing = false;
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = '⬆️ Upload Current Version to Git';
      }
    }
  }

  function submitPushToRepo(e) {
    e.preventDefault();
    executePushToRepo(false);
  }

  async function loadStyleGuideWorkspace(forceReload) {
    if (sgState.loading) return;
    if (sgState.loaded && !forceReload) {
      renderTopSummaryAndSaveBar();
      renderActiveCategoryWorkspace();
      return;
    }

    sgState.loading = true;
    var loadingEl = document.getElementById('sgWorkspaceLoading');
    var errEl = document.getElementById('sgWorkspaceError');
    var bodyEl = document.getElementById('sgWorkspaceBody');
    if (loadingEl) loadingEl.hidden = false;
    if (errEl) errEl.hidden = true;
    if (bodyEl) bodyEl.hidden = true;

    try {
      var data = await sgApiJson('/api/admin/style-guide');
      sgState.revision = data.revision || 1;
      sgState.hasUnpushedChanges = Boolean(data.has_unpushed_changes);
      sgState.persistence = data.persistence || null;
      sgState.repoDiff = data.repo_diff || null;
      sgState.permissions = data.permissions || sgState.permissions;
      sgState.githubPush = data.github_push || {};
      sgState.stats = data.stats || {};
      sgState.hostedFiles = data.hosted_files || [];
      sgState.invariants = data.mandatory_invariants || [];
      sgState.topics = (data.topics || []).slice().sort(function (a, b) {
        return a.order - b.order;
      });
      sgState.dimensionsCatalog = data.component_dimensions_catalog || [];
      sgState.components = data.components || [];
      sgState.decisions = data.decisions || [];
      sgState.decisionsById = {};
      sgState.decisions.forEach(function (d) {
        sgState.decisionsById[d.decision_id] = d;
      });
      sgState.dirtyById = {};

      if (
        !sgState.activeTopicSlug ||
        !sgState.topics.some(function (t) {
          return t.slug === sgState.activeTopicSlug;
        })
      ) {
        sgState.activeTopicSlug = sgState.topics[0] ? sgState.topics[0].slug : 'foundations';
      }

      buildDecisionDatalistOnce();
      sgState.loaded = true;
      if (loadingEl) loadingEl.hidden = true;
      if (bodyEl) bodyEl.hidden = false;

      renderTopSummaryAndSaveBar();
      renderActiveCategoryWorkspace();
    } catch (err) {
      if (loadingEl) loadingEl.hidden = true;
      if (errEl) {
        errEl.hidden = false;
        errEl.textContent = err.message || 'Could not load Style Guide workspace.';
      }
    } finally {
      sgState.loading = false;
    }
  }

  function wireStaticControlsOnce() {
    var refreshBtn = document.getElementById('refreshStyleGuideBtn');
    if (refreshBtn) {
      refreshBtn.onclick = function () {
        loadStyleGuideWorkspace(true);
      };
    }

    var saveAllBtn = document.getElementById('sgSaveAllDirtyBtn');
    if (saveAllBtn) {
      saveAllBtn.onclick = function () {
        saveDecisionIds(Object.keys(sgState.dirtyById), saveAllBtn, { confirmOverwrite: false });
      };
    }

    var discardAllBtn = document.getElementById('sgDiscardAllDirtyBtn');
    if (discardAllBtn) {
      discardAllBtn.onclick = function () {
        sgState.dirtyById = {};
        sgState.refModeById = {};
        renderTopSummaryAndSaveBar();
        renderActiveCategoryWorkspace();
      };
    }

    // Overwrite Confirm / Deny modal controls
    var owConfirmBtn = document.getElementById('sgOverwriteConfirmBtn');
    if (owConfirmBtn) {
      owConfirmBtn.onclick = function () {
        var ctx = sgState.pendingOverwriteCtx;
        if (!ctx || !ctx.idsToSave || !ctx.idsToSave.length) {
          closeModal('sgOverwriteConfirmModal');
          return;
        }
        saveDecisionIds(ctx.idsToSave, owConfirmBtn, { confirmOverwrite: true });
      };
    }

    var owDenyBtn = document.getElementById('sgOverwriteDenyBtn');
    if (owDenyBtn) {
      owDenyBtn.onclick = function () {
        var ctx = sgState.pendingOverwriteCtx;
        closeModal('sgOverwriteConfirmModal');
        sgState.pendingOverwriteCtx = null;
        if (!ctx) return;

        if (ctx.conflictKind === 'concurrent_revision') {
          showToast('Denied overwrite — reloading latest Style Guide state saved on server.', false);
          loadStyleGuideWorkspace(true);
          return;
        }

        var owSet = new Set(ctx.overwrittenIds || []);
        var revertedCount = 0;
        var keptNewIds = [];
        (ctx.idsToSave || []).forEach(function (id) {
          if (owSet.has(id)) {
            delete sgState.dirtyById[id];
            delete sgState.refModeById[id];
            revertedCount += 1;
          } else if (sgState.dirtyById[id]) {
            keptNewIds.push(id);
          }
        });
        renderTopSummaryAndSaveBar();
        renderActiveCategoryWorkspace();

        if (keptNewIds.length > 0) {
          showToast(
            'Denied overwrite of ' +
              revertedCount +
              ' saved item(s) — saving ' +
              keptNewIds.length +
              ' brand-new item(s) only.',
            false
          );
          saveDecisionIds(keptNewIds, null, { confirmOverwrite: false });
        } else {
          showToast(
            'Denied overwrite — kept existing saved values for ' + revertedCount + ' item(s).',
            false
          );
        }
      };
    }

    var owCancelBtn = document.getElementById('sgOverwriteCancelBtn');
    if (owCancelBtn) {
      owCancelBtn.onclick = function () {
        closeModal('sgOverwriteConfirmModal');
      };
    }

    var docSel = document.getElementById('sgHostedDocSelect');
    if (docSel) {
      docSel.onchange = function () {
        loadAndRenderHostedDoc(docSel.value);
      };
    }

    var docModeBtn = document.getElementById('sgHostedDocModeBtn');
    if (docModeBtn) {
      docModeBtn.onclick = function () {
        sgState.docViewer.mode = sgState.docViewer.mode === 'preview' ? 'raw' : 'preview';
        docModeBtn.textContent =
          sgState.docViewer.mode === 'preview' ? 'View Raw Markdown' : 'View Formatted Preview';
        renderDocViewerContent();
      };
    }

    var docDownloadBtn = document.getElementById('sgHostedDocDownloadBtn');
    if (docDownloadBtn) {
      docDownloadBtn.onclick = function () {
        var blob = new Blob([sgState.docViewer.content || ''], {
          type: sgState.docViewer.file.endsWith('.json')
            ? 'application/json;charset=utf-8'
            : 'text/markdown;charset=utf-8'
        });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = sgState.docViewer.file || 'style-guide.md';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      };
    }

    var docCloseBtn = document.getElementById('sgHostedDocCloseBtn');
    if (docCloseBtn) {
      docCloseBtn.onclick = function () {
        closeModal('sgHostedDocModal');
      };
    }

    var pushBranchSel = document.getElementById('sgPushBranchSelect');
    if (pushBranchSel) {
      pushBranchSel.onchange = function () {
        var wrap = document.getElementById('sgPushCustomBranchWrap');
        if (wrap) wrap.hidden = pushBranchSel.value !== '__custom__';
        var bInfo = getSelectedUploadBranchInfo();
        renderUploadReportIntoModal(sgState.repoDiff || null, bInfo.targetBranch);
        var remBanner = document.getElementById('sgPushRemoteOverwriteBanner');
        if (remBanner) remBanner.hidden = true;
      };
    }

    var inspectBtn = document.getElementById('sgPushInspectRemoteBtn');
    if (inspectBtn) {
      inspectBtn.onclick = function () {
        inspectLiveRemoteDiff(false);
      };
    }

    var remConfirmBtn = document.getElementById('sgPushRemoteConfirmBtn');
    if (remConfirmBtn) {
      remConfirmBtn.onclick = function () {
        executePushToRepo(true);
      };
    }

    var remDenyBtn = document.getElementById('sgPushRemoteDenyBtn');
    if (remDenyBtn) {
      remDenyBtn.onclick = function () {
        var remBanner = document.getElementById('sgPushRemoteOverwriteBanner');
        if (remBanner) remBanner.hidden = true;
        closeModal('sgPushRepoModal');
        showToast('Denied remote branch overwrite — GitHub branch left untouched.', false);
      };
    }

    var pushForm = document.getElementById('sgPushRepoForm');
    if (pushForm) {
      pushForm.onsubmit = submitPushToRepo;
    }

    var pushCancelBtn = document.getElementById('sgPushCancelBtn');
    if (pushCancelBtn) {
      pushCancelBtn.onclick = function () {
        closeModal('sgPushRepoModal');
      };
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireStaticControlsOnce);
  } else {
    wireStaticControlsOnce();
  }

  window.bitesharkAdminStyleGuide = {
    activate: function () {
      loadStyleGuideWorkspace(false);
    },
    reload: function () {
      return loadStyleGuideWorkspace(true);
    }
  };
})();
