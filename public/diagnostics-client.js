// BiteShark Client Reliability, Bounded Fetch, Diagnostics Reporter & Accessible Modal Controller
//
// Guarantees:
//   1. Bounded network requests (`AbortController`) with safe JSON parsing so HTML 502s or hung
//      sockets never throw raw `SyntaxError` or leave buttons/pollers stuck indefinitely.
//   2. Truthful outcome classification (`working`, `saved_locally`, `saved_to_account`,
//      `submitted_for_review`, `queued`, `provider_accepted`, `completed`, `failed`,
//      `outcome_uncertain`, `temporarily_unavailable`).
//   3. Sanitized, rate-capped, non-recursive client diagnostic reporting (`POST /api/diagnostics/report`)
//      that tracks loaded release SHA vs active server release SHA (`stale_client` detection) and
//      never logs emails, URLs, query strings, fragments, tokens, OTPs, DOBs, coordinates, or files.
//   4. Accessible modal focus placement, `Tab` containment, background `inert` locking, `Escape`
//      handling, and focus restoration to the invoking control.

(function initBiteSharkDiagnostics(globalScope) {
  'use strict';

  const CLIENT_BUNDLE_VERSION = 'bs-ui-2026.11.20';
  const DEFAULT_READ_TIMEOUT_MS = 10000;
  const DEFAULT_WRITE_TIMEOUT_MS = 12000;
  const MAX_REPORTS_PER_PAGE = 15;
  const REPORT_DEDUP_WINDOW_MS = 30000;

  let loadedServerReleaseSha = null;
  let latestServerReleaseSha = null;
  let reportsSentCount = 0;
  let activeReportInFlight = false;
  const recentReportByKey = new Map();
  const modalStack = [];

  function generateClientRef() {
    try {
      if (globalScope.crypto && typeof globalScope.crypto.getRandomValues === 'function') {
        const bytes = new Uint8Array(8);
        globalScope.crypto.getRandomValues(bytes);
        let hex = '';
        for (let i = 0; i < bytes.length; i++) {
          hex += bytes[i].toString(16).padStart(2, '0');
        }
        return 'corr_' + hex;
      }
    } catch {}
    return (
      'corr_' +
      Math.floor(Math.random() * 0xffffffff)
        .toString(16)
        .padStart(8, '0') +
      Date.now().toString(16).slice(-8)
    );
  }

  function createIdempotencyKey(prefix) {
    const safePrefix = String(prefix || 'op')
      .replace(/[^a-z0-9_-]/gi, '')
      .slice(0, 20) || 'op';
    return safePrefix + '_' + Date.now().toString(36) + '_' + generateClientRef().slice(5, 17);
  }

  function sanitizeClientText(raw, maxLen) {
    const cap = Number(maxLen) > 0 ? Number(maxLen) : 220;
    if (raw === null || raw === undefined) return '';
    let s = String(raw).replace(/[\x00-\x1F\x7F]+/g, ' ');
    const corrs = [];
    s = s.replace(/\bcorr_[0-9a-f]{12,32}\b/gi, function (m) {
      const i = corrs.length;
      corrs.push(m.toLowerCase());
      return '__BSC' + i + '__';
    });
    s = s
      .replace(/\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]+/gi, '[REDACTED_AUTH]')
      .replace(/https?:\/\/[^\s"'<>]+/gi, '[REDACTED_URL]')
      .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[REDACTED_EMAIL]')
      .replace(/\b(19\d{2}|20[0-2]\d)[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])\b/g, '[REDACTED_DATE]')
      .replace(/[-+]?\b\d{1,3}\.\d{3,}\b/g, '[REDACTED_COORD]')
      .replace(/\b\d{6,8}\b/g, '[REDACTED_CODE]')
      .replace(/([/][A-Za-z0-9_./:-]*)[?#][^\s"'<>]*/g, '$1')
      .replace(/\b[A-Fa-f0-9]{28,}\b/g, '[REDACTED_HEX]');
    s = s.replace(/__BSC(\d+)__/g, function (_, idx) {
      return corrs[Number(idx)] || '';
    });
    s = s.replace(/\s+/g, ' ').trim();
    return s.length > cap ? s.slice(0, cap - 1) + '…' : s;
  }

  function sanitizeClientRouteTemplate(urlOrPath) {
    if (!urlOrPath) return '/unknown';
    let p = String(urlOrPath);
    try {
      if (p.includes('://')) {
        p = new URL(p).pathname;
      }
    } catch {}
    const q = p.indexOf('?');
    if (q !== -1) p = p.slice(0, q);
    const h = p.indexOf('#');
    if (h !== -1) p = p.slice(0, h);
    const parts = p
      .split('/')
      .filter(Boolean)
      .slice(0, 7)
      .map(function (seg) {
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg)) return ':uuid';
        if (/^\d+$/.test(seg)) return ':id';
        if (seg.length > 28 || /[^A-Za-z0-9._:-]/.test(seg)) return ':param';
        return seg;
      });
    return '/' + parts.join('/');
  }

  function observeReleaseHeaders(res) {
    try {
      const serverSha = res && res.headers && typeof res.headers.get === 'function'
        ? res.headers.get('x-biteshark-release')
        : null;
      if (serverSha && serverSha !== 'unknown') {
        if (!loadedServerReleaseSha) {
          loadedServerReleaseSha = serverSha;
        }
        latestServerReleaseSha = serverSha;
      }
    } catch {}
  }

  function isStaleClientBuild() {
    return Boolean(
      loadedServerReleaseSha &&
        latestServerReleaseSha &&
        loadedServerReleaseSha !== latestServerReleaseSha
    );
  }

  function prefersReducedMotion() {
    try {
      return Boolean(
        globalScope.matchMedia &&
          globalScope.matchMedia('(prefers-reduced-motion: reduce)').matches
      );
    } catch {
      return false;
    }
  }

  function reportClientDiagnostic(eventInput) {
    if (!eventInput || typeof eventInput !== 'object') return null;
    if (activeReportInFlight || reportsSentCount >= MAX_REPORTS_PER_PAGE) return null;

    const featureKey = String(eventInput.featureKey || 'ui_runtime').toLowerCase();
    const operationName = String(eventInput.operationName || 'client.operation').slice(0, 80);
    const errorCode = String(eventInput.errorCode || 'CLIENT_ERROR')
      .replace(/[^A-Za-z0-9_.:-]/g, '_')
      .toUpperCase()
      .slice(0, 64);
    const routeTemplate = sanitizeClientRouteTemplate(eventInput.routeTemplate || globalScope.location?.pathname || '/');
    const dedupKey = [featureKey, routeTemplate, errorCode].join('|');
    const nowMs = Date.now();
    const prevMs = recentReportByKey.get(dedupKey) || 0;
    if (nowMs - prevMs < REPORT_DEDUP_WINDOW_MS) {
      return eventInput.correlationId || null;
    }
    recentReportByKey.set(dedupKey, nowMs);

    const correlationId =
      typeof eventInput.correlationId === 'string' && /^corr_[0-9a-f]{12,32}$/i.test(eventInput.correlationId)
        ? eventInput.correlationId.toLowerCase()
        : generateClientRef();

    if (typeof globalScope.fetch !== 'function') return correlationId;

    const bodyPayload = {
      feature_key: featureKey,
      operation_name: operationName,
      route_template: routeTemplate,
      http_method: eventInput.httpMethod || null,
      http_status: Number.isInteger(eventInput.httpStatus) ? eventInput.httpStatus : null,
      severity: eventInput.severity === 'warning' || eventInput.severity === 'info' ? eventInput.severity : 'error',
      error_code: errorCode,
      message: sanitizeClientText(eventInput.message || errorCode, 240) || errorCode,
      user_impact: eventInput.userImpact ? sanitizeClientText(eventInput.userImpact, 220) : undefined,
      correlation_id: correlationId,
      client_build_version: CLIENT_BUNDLE_VERSION,
      client_loaded_release_sha: loadedServerReleaseSha || null,
      duration_ms: Number.isFinite(eventInput.durationMs) ? Math.round(eventInput.durationMs) : null,
      retryable: typeof eventInput.retryable === 'boolean' ? eventInput.retryable : null,
      outcome_state: eventInput.outcomeState || 'failed',
      safe_context:
        eventInput.safeContext && typeof eventInput.safeContext === 'object' ? eventInput.safeContext : {}
    };

    reportsSentCount += 1;
    activeReportInFlight = true;
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 4000) : null;

    Promise.resolve()
      .then(function () {
        return globalScope.fetch('/api/diagnostics/report', {
          method: 'POST',
          credentials: 'omit',
          headers: {
            'Content-Type': 'application/json',
            'X-BiteShark-Diagnostic-Client': '1'
          },
          body: JSON.stringify(bodyPayload),
          ...(ctrl ? { signal: ctrl.signal } : {})
        });
      })
      .catch(function () {
        // Diagnostic reporting must never disrupt or recurse into caller flows.
      })
      .finally(function () {
        if (timer) clearTimeout(timer);
        activeReportInFlight = false;
      });

    return correlationId;
  }

  async function fetchJsonBounded(url, opts) {
    const options = opts && typeof opts === 'object' ? opts : {};
    const method = String(options.method || 'GET').toUpperCase();
    const isWrite = Boolean(options.isWrite || (method !== 'GET' && method !== 'HEAD'));
    const overrideMs = Number(globalScope.__BITESHARK_FETCH_TIMEOUT_MS);
    const timeoutMs =
      Number.isFinite(overrideMs) && overrideMs >= 50
        ? overrideMs
        : Number(options.timeoutMs) > 0
          ? Number(options.timeoutMs)
          : isWrite
            ? DEFAULT_WRITE_TIMEOUT_MS
            : DEFAULT_READ_TIMEOUT_MS;

    const featureKey = options.featureKey || 'ui_runtime';
    const routeTemplate = options.routeTemplate || sanitizeClientRouteTemplate(url);
    const operationName = options.operationName || method + ' ' + routeTemplate;
    const startedAt = Date.now();

    const headers = Object.assign({}, options.headers || {});
    const isSameOriginApi = typeof url === 'string' && url.startsWith('/api/');
    if (isSameOriginApi && (isWrite || !url.startsWith('/api/trucks'))) {
      headers['X-BiteShark-Client-Build'] = CLIENT_BUNDLE_VERSION;
      if (loadedServerReleaseSha) {
        headers['X-BiteShark-Loaded-Release'] = loadedServerReleaseSha;
      }
    }

    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    let timedOut = false;
    const timer = ctrl
      ? setTimeout(function () {
          timedOut = true;
          try {
            ctrl.abort();
          } catch {}
        }, timeoutMs)
      : null;

    try {
      const fetchInit = Object.assign({}, options.fetchInit || {}, {
        method: method,
        headers: headers
      });
      if (options.credentials) fetchInit.credentials = options.credentials;
      if (options.cache) fetchInit.cache = options.cache;
      if (options.body !== undefined) {
        fetchInit.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
        if (!fetchInit.headers['Content-Type'] && !fetchInit.headers['content-type']) {
          fetchInit.headers['Content-Type'] = 'application/json';
        }
      }
      if (ctrl) fetchInit.signal = ctrl.signal;

      const res = await globalScope.fetch(url, fetchInit);
      if (timer) clearTimeout(timer);
      observeReleaseHeaders(res);

      const headerCorr =
        res && res.headers && typeof res.headers.get === 'function'
          ? res.headers.get('x-correlation-id')
          : null;

      let data = null;
      let parseFailed = false;
      try {
        data = await res.json();
      } catch {
        parseFailed = true;
      }

      const durationMs = Math.max(0, Date.now() - startedAt);
      if (parseFailed) {
        const corr =
          headerCorr ||
          reportClientDiagnostic({
            featureKey: featureKey,
            operationName: operationName,
            routeTemplate: routeTemplate,
            httpMethod: method,
            httpStatus: res.status || 502,
            severity: 'error',
            errorCode: 'MALFORMED_SERVER_RESPONSE',
            message: 'Received a non-JSON or incomplete response (HTTP ' + (res.status || 'unknown') + ').',
            durationMs: durationMs,
            retryable: !isWrite || Boolean(options.idempotentWrite),
            outcomeState: isWrite && res.status >= 500 ? 'outcome_uncertain' : 'failed'
          });
        return {
          ok: false,
          status: res.status || 502,
          data: {},
          outcome: isWrite && res.status >= 500 ? 'outcome_uncertain' : 'malformed_response',
          uncertainWrite: Boolean(isWrite && res.status >= 500),
          retryable: !isWrite || Boolean(options.idempotentWrite),
          correlationId: corr,
          errorMessage: isWrite
            ? 'BiteShark returned an unreadable response, so we could not confirm whether your change finished.'
            : 'BiteShark returned an unexpected response right now. Please try again in a moment.'
        };
      }

      const payload = data && typeof data === 'object' ? data : {};
      const corrId = payload.correlation_id || headerCorr || null;

      if (res.ok) {
        return {
          ok: true,
          status: res.status,
          data: payload,
          outcome: 'completed',
          uncertainWrite: false,
          retryable: false,
          correlationId: corrId,
          errorMessage: null
        };
      }

      if (res.status === 401) {
        return {
          ok: false,
          status: 401,
          data: payload,
          outcome: 'session_expired',
          uncertainWrite: false,
          retryable: false,
          correlationId: corrId,
          errorMessage: payload.error || 'Your session has ended. Sign in again to continue.'
        };
      }

      if (res.status === 403) {
        const code = payload.code || 'FORBIDDEN';
        let outcome = 'permission_denied';
        if (code === 'AGE_ASSESSMENT_REQUIRED' || payload.requires_age_assessment) {
          outcome = 'age_assessment_required';
        } else if (code === 'FEATURE_DISABLED' || payload.feature_disabled) {
          outcome = 'temporarily_unavailable';
        } else if (code === 'ADMIN_PREVIEW_READ_ONLY') {
          outcome = 'preview_read_only';
        }
        return {
          ok: false,
          status: 403,
          data: payload,
          outcome: outcome,
          uncertainWrite: false,
          retryable: false,
          correlationId: corrId,
          errorMessage: payload.error || 'You do not have permission for this action.'
        };
      }

      if (
        res.status === 503 &&
        (payload.feature_disabled || payload.code === 'FEATURE_PAUSED' || /paused for maintenance/i.test(String(payload.error || '')))
      ) {
        return {
          ok: false,
          status: 503,
          data: payload,
          outcome: 'temporarily_unavailable',
          featureDisabled: true,
          uncertainWrite: false,
          retryable: false,
          correlationId: corrId,
          errorMessage: payload.error || 'This feature is temporarily unavailable right now.'
        };
      }

      let finalCorr = corrId;
      if (res.status >= 500 && !finalCorr && options.reportServer5xxFallback !== false) {
        finalCorr = reportClientDiagnostic({
          featureKey: featureKey,
          operationName: operationName,
          routeTemplate: routeTemplate,
          httpMethod: method,
          httpStatus: res.status,
          severity: 'error',
          errorCode: payload.code || 'UPSTREAM_HTTP_' + res.status,
          message: payload.error || 'Upstream or server HTTP ' + res.status,
          durationMs: durationMs,
          retryable: !isWrite || Boolean(options.idempotentWrite),
          outcomeState: res.status === 503 ? 'temporarily_unavailable' : 'failed'
        });
      }

      return {
        ok: false,
        status: res.status,
        data: payload,
        outcome: res.status === 503 ? 'temporarily_unavailable' : 'failed',
        uncertainWrite: false,
        retryable: res.status >= 500 && (!isWrite || Boolean(options.idempotentWrite)),
        correlationId: finalCorr,
        errorMessage: payload.error || 'Request could not be completed right now.'
      };
    } catch (err) {
      if (timer) clearTimeout(timer);
      const durationMs = Math.max(0, Date.now() - startedAt);
      const isOffline = globalScope.navigator && globalScope.navigator.onLine === false;
      const isAbort = Boolean(timedOut || (err && err.name === 'AbortError'));

      if (isAbort) {
        const outcome = isWrite ? 'outcome_uncertain' : 'temporarily_unavailable';
        const corr = reportClientDiagnostic({
          featureKey: featureKey,
          operationName: operationName,
          routeTemplate: routeTemplate,
          httpMethod: method,
          severity: 'warning',
          errorCode: isWrite ? 'WRITE_REQUEST_TIMEOUT' : 'READ_REQUEST_TIMEOUT',
          message: (isWrite ? 'Write' : 'Read') + ' request timed out after ' + durationMs + 'ms.',
          durationMs: durationMs,
          retryable: !isWrite || Boolean(options.idempotentWrite),
          outcomeState: outcome,
          safeContext: { is_offline: Boolean(isOffline) }
        });
        return {
          ok: false,
          status: 0,
          data: {},
          timedOut: true,
          outcome: outcome,
          uncertainWrite: isWrite,
          retryable: !isWrite || Boolean(options.idempotentWrite),
          correlationId: corr,
          errorMessage: isWrite
            ? 'Outcome uncertain — BiteShark took too long to respond, so your request may or may not have completed.'
            : 'Could not reach BiteShark right now (connection timed out). Check your connection and try again.'
        };
      }

      const corr = !isOffline
        ? reportClientDiagnostic({
            featureKey: featureKey,
            operationName: operationName,
            routeTemplate: routeTemplate,
            httpMethod: method,
            severity: 'warning',
            errorCode: 'NETWORK_REQUEST_FAILED',
            message: 'Browser network request failed before receiving a server response.',
            durationMs: durationMs,
            retryable: !isWrite || Boolean(options.idempotentWrite),
            outcomeState: 'temporarily_unavailable',
            safeContext: { is_offline: false }
          })
        : null;

      return {
        ok: false,
        status: 0,
        data: {},
        offline: Boolean(isOffline),
        outcome: 'temporarily_unavailable',
        uncertainWrite: false,
        retryable: true,
        correlationId: corr,
        errorMessage: isOffline
          ? 'You appear to be offline. Could not reach BiteShark right now.'
          : 'Could not reach BiteShark right now. Check your connection and try again.'
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Accessible Modal Dialog Focus Placement, Trap, Background `inert` & Restore
  // ---------------------------------------------------------------------------
  const FOCUSABLE_SELECTOR = [
    'a[href]:not([tabindex="-1"])',
    'button:not([disabled]):not([tabindex="-1"])',
    'input:not([disabled]):not([type="hidden"]):not([tabindex="-1"])',
    'select:not([disabled]):not([tabindex="-1"])',
    'textarea:not([disabled]):not([tabindex="-1"])',
    '[tabindex]:not([tabindex="-1"])'
  ].join(',');

  function isVisibleFocusable(el) {
    if (!el || el.disabled || el.hidden) return false;
    if (el.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
    if (typeof globalScope.getComputedStyle === 'function') {
      const st = globalScope.getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden') return false;
    }
    return true;
  }

  function getFocusableWithin(container) {
    if (!container || typeof container.querySelectorAll !== 'function') return [];
    return Array.prototype.slice.call(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter(isVisibleFocusable);
  }

  function syncBackgroundInert() {
    if (typeof document === 'undefined' || !document.body) return;
    const topEntry = modalStack.length > 0 ? modalStack[modalStack.length - 1] : null;
    const children = Array.prototype.slice.call(document.body.children);
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (!child || child.tagName === 'SCRIPT' || child.tagName === 'STYLE' || child.id === 'toast') continue;
      if (topEntry && (child === topEntry.backdrop || child.contains(topEntry.backdrop))) {
        if (child.dataset && child.dataset.bsModalLocked === '1') {
          child.inert = false;
          child.removeAttribute('aria-hidden');
          delete child.dataset.bsModalLocked;
        }
        continue;
      }
      if (topEntry) {
        if (child.dataset && child.dataset.bsModalLocked !== '1') {
          child.dataset.bsModalLocked = '1';
          child.inert = true;
          child.setAttribute('aria-hidden', 'true');
        }
      } else if (child.dataset && child.dataset.bsModalLocked === '1') {
        child.inert = false;
        child.removeAttribute('aria-hidden');
        delete child.dataset.bsModalLocked;
      }
    }
  }

  function openModalDialog(backdropOrId, opts) {
    if (typeof document === 'undefined') return;
    const backdrop =
      typeof backdropOrId === 'string' ? document.getElementById(backdropOrId) : backdropOrId;
    if (!backdrop) return;
    const options = opts && typeof opts === 'object' ? opts : {};
    const triggerEl =
      options.triggerEl ||
      (document.activeElement && document.activeElement !== document.body && !backdrop.contains(document.activeElement)
        ? document.activeElement
        : null);

    // Avoid duplicate stack entries if reopened while active.
    for (let i = modalStack.length - 1; i >= 0; i--) {
      if (modalStack[i].backdrop === backdrop) {
        modalStack.splice(i, 1);
      }
    }

    modalStack.push({
      backdrop: backdrop,
      triggerEl: triggerEl,
      onClose: typeof options.onClose === 'function' ? options.onClose : null,
      nonDismissible: Boolean(options.nonDismissible)
    });

    syncBackgroundInert();

    const focusTarget = (function () {
      if (options.initialFocusSelector) {
        const match = backdrop.querySelector(options.initialFocusSelector);
        if (match && isVisibleFocusable(match)) return match;
      }
      const focusables = getFocusableWithin(backdrop);
      if (focusables.length > 0) return focusables[0];
      const dialogSurface = backdrop.querySelector('[role="dialog"], [role="alertdialog"]') || backdrop;
      if (!dialogSurface.hasAttribute('tabindex')) {
        dialogSurface.setAttribute('tabindex', '-1');
      }
      return dialogSurface;
    })();

    if (focusTarget && typeof focusTarget.focus === 'function') {
      try {
        focusTarget.focus({ preventScroll: true });
      } catch {
        try {
          focusTarget.focus();
        } catch {}
      }
    }
  }

  function closeModalDialog(backdropOrId) {
    if (typeof document === 'undefined') return;
    const backdrop =
      typeof backdropOrId === 'string' ? document.getElementById(backdropOrId) : backdropOrId;
    if (!backdrop) return;

    let removed = null;
    for (let i = modalStack.length - 1; i >= 0; i--) {
      if (modalStack[i].backdrop === backdrop) {
        removed = modalStack.splice(i, 1)[0];
        break;
      }
    }
    syncBackgroundInert();

    const restoreTarget = removed && removed.triggerEl;
    if (
      restoreTarget &&
      document.contains(restoreTarget) &&
      typeof restoreTarget.focus === 'function' &&
      !restoreTarget.closest('[hidden], [inert]')
    ) {
      try {
        restoreTarget.focus({ preventScroll: true });
      } catch {
        try {
          restoreTarget.focus();
        } catch {}
      }
    }
  }

  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('keydown', function (ev) {
      if (modalStack.length === 0) return;
      const top = modalStack[modalStack.length - 1];
      if (!top || !top.backdrop || !document.contains(top.backdrop)) {
        modalStack.pop();
        syncBackgroundInert();
        return;
      }
      const isHidden =
        top.backdrop.hidden ||
        (top.backdrop.classList &&
          top.backdrop.classList.contains('modal-backdrop') &&
          !top.backdrop.classList.contains('show'));
      if (isHidden) {
        modalStack.pop();
        syncBackgroundInert();
        return;
      }

      if (ev.key === 'Escape') {
        if (top.nonDismissible) {
          ev.preventDefault();
          return;
        }
        if (typeof top.onClose === 'function') {
          ev.preventDefault();
          ev.stopPropagation();
          top.onClose();
        }
        return;
      }

      if (ev.key === 'Tab') {
        const focusables = getFocusableWithin(top.backdrop);
        if (focusables.length === 0) {
          ev.preventDefault();
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;
        if (ev.shiftKey) {
          if (!top.backdrop.contains(active) || active === first) {
            ev.preventDefault();
            last.focus();
          }
        } else if (!top.backdrop.contains(active) || active === last) {
          ev.preventDefault();
          first.focus();
        }
      }
    });
  }

  // Global uncaught runtime failure reporting (bounded & sanitized)
  if (typeof globalScope.addEventListener === 'function') {
    globalScope.addEventListener('error', function (ev) {
      if (!ev) return;
      const msg = ev.message ? String(ev.message) : '';
      if (!msg || /ResizeObserver loop/i.test(msg)) return;
      reportClientDiagnostic({
        featureKey: 'ui_runtime',
        operationName: 'window.onerror',
        errorCode: 'UNCAUGHT_CLIENT_ERROR',
        severity: 'error',
        message: msg,
        outcomeState: 'failed'
      });
    });

    globalScope.addEventListener('unhandledrejection', function (ev) {
      const reason = ev && ev.reason;
      const msg = reason && reason.message ? String(reason.message) : String(reason || '');
      if (!msg || /AbortError/i.test(msg)) return;
      reportClientDiagnostic({
        featureKey: 'ui_runtime',
        operationName: 'window.unhandledrejection',
        errorCode: 'UNHANDLED_PROMISE_REJECTION',
        severity: 'error',
        message: msg,
        outcomeState: 'failed'
      });
    });
  }

  const OUTCOME_BADGE_META = {
    working: { icon: '⏳', label: 'Working', tone: 'working' },
    saved_locally: { icon: '💾', label: 'Saved locally', tone: 'local' },
    saved_to_account: { icon: '✓', label: 'Saved to your account', tone: 'ok' },
    submitted_for_review: { icon: '📨', label: 'Submitted for review', tone: 'info' },
    queued: { icon: '🕒', label: 'Queued', tone: 'info' },
    provider_accepted: { icon: '📤', label: 'Accepted by external provider', tone: 'info' },
    completed: { icon: '✓', label: 'Completed', tone: 'ok' },
    partial_success: { icon: '⚠', label: 'Partial completion', tone: 'warn' },
    outcome_uncertain: { icon: '⚠', label: 'Outcome uncertain', tone: 'warn' },
    temporarily_unavailable: { icon: '⏸', label: 'Temporarily unavailable', tone: 'warn' },
    failed: { icon: '✕', label: 'Failed', tone: 'err' }
  };

  function escapeHtmlSafe(raw) {
    return String(raw === null || raw === undefined ? '' : raw)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getCoarseDeviceContext() {
    let platform = 'other';
    let browser = 'other';
    let viewport = 'desktop';
    try {
      const ua = String((globalScope.navigator && globalScope.navigator.userAgent) || '').toLowerCase();
      if (/iphone|ipad|ipod/.test(ua)) platform = 'ios';
      else if (/android/.test(ua)) platform = 'android';
      else if (/macintosh|mac os x/.test(ua)) platform = 'macos';
      else if (/windows/.test(ua)) platform = 'windows';
      else if (/linux/.test(ua)) platform = 'linux';

      if (/edg\//.test(ua)) browser = 'edge';
      else if (/firefox\//.test(ua)) browser = 'firefox';
      else if (/chrome\/|crios\//.test(ua)) browser = 'chrome';
      else if (/safari\//.test(ua)) browser = 'safari';

      const w = Number(globalScope.innerWidth || 0);
      if (w > 0 && w < 640) viewport = 'mobile';
      else if (w >= 640 && w < 1024) viewport = 'tablet';
      else viewport = 'desktop';
    } catch {}
    return { platform: platform, browser: browser, viewport: viewport };
  }

  function renderFeedbackBanner(containerOrId, opts) {
    if (typeof document === 'undefined') return;
    const el = typeof containerOrId === 'string' ? document.getElementById(containerOrId) : containerOrId;
    if (!el) return;
    if (!opts) {
      el.hidden = true;
      el.innerHTML = '';
      return;
    }
    const meta = OUTCOME_BADGE_META[opts.state] || OUTCOME_BADGE_META.failed;
    const corr = opts.correlationId && /^corr_[0-9a-f]{12,32}$/i.test(opts.correlationId)
      ? opts.correlationId
      : null;
    const occurredAtIso = opts.occurredAt || new Date().toISOString();
    const canReportProblem =
      (meta.tone === 'err' || meta.tone === 'warn') &&
      !opts.hideReportButton &&
      typeof globalScope.bitesharkOpenSupport === 'function';

    el.hidden = false;
    el.className = 'bs-feedback-banner bs-tone-' + meta.tone;
    el.setAttribute('role', meta.tone === 'err' || meta.tone === 'warn' ? 'alert' : 'status');

    let html =
      '<div class="bs-fb-head"><strong><span aria-hidden="true">' +
      meta.icon +
      '</span> ' +
      escapeHtmlSafe(opts.title || meta.label) +
      '</strong></div>' +
      '<p class="bs-fb-msg">' +
      escapeHtmlSafe(opts.message || '') +
      '</p>';

    if (opts.nextStep) {
      html += '<p class="bs-fb-next">' + escapeHtmlSafe(opts.nextStep) + '</p>';
    }

    if (corr || typeof opts.onRetry === 'function' || opts.loginHref || canReportProblem) {
      html += '<div class="bs-fb-actions">';
      if (typeof opts.onRetry === 'function') {
        html +=
          '<button type="button" class="ghost small bs-fb-retry">' +
          escapeHtmlSafe(opts.retryLabel || 'Try again') +
          '</button>';
      }
      if (opts.loginHref) {
        html +=
          '<a class="ghost small bs-fb-login" href="' +
          escapeHtmlSafe(opts.loginHref) +
          '">Sign in →</a>';
      }
      if (canReportProblem) {
        html +=
          '<button type="button" class="ghost small bs-fb-report">🛟 ' +
          escapeHtmlSafe(opts.reportLabel || 'Report this problem') +
          '</button>';
      }
      if (corr) {
        html +=
          '<span class="bs-fb-ref">Support ref: <code>' +
          escapeHtmlSafe(corr) +
          '</code> <button type="button" class="ghost small bs-fb-copy" data-corr="' +
          escapeHtmlSafe(corr) +
          '">Copy ref</button></span>';
      }
      html += '</div>';
    }

    el.innerHTML = html;
    const retryBtn = el.querySelector('.bs-fb-retry');
    if (retryBtn && typeof opts.onRetry === 'function') {
      retryBtn.addEventListener('click', function () {
        opts.onRetry();
      });
    }
    const reportBtn = el.querySelector('.bs-fb-report');
    if (reportBtn && typeof globalScope.bitesharkOpenSupport === 'function') {
      reportBtn.addEventListener('click', function () {
        globalScope.bitesharkOpenSupport({
          tab: 'new',
          mode: 'contextual_error',
          featureKey: opts.featureKey || '',
          operationName: opts.operationName || '',
          correlationId: corr || '',
          occurredAt: occurredAtIso
        });
      });
    }
    const copyBtn = el.querySelector('.bs-fb-copy');
    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        const val = copyBtn.getAttribute('data-corr') || '';
        if (globalScope.navigator && globalScope.navigator.clipboard && globalScope.navigator.clipboard.writeText) {
          globalScope.navigator.clipboard.writeText(val).then(
            function () {
              copyBtn.textContent = 'Copied ✓';
            },
            function () {
              copyBtn.textContent = val;
            }
          );
        } else {
          copyBtn.textContent = val;
        }
      });
    }
  }

  globalScope.bitesharkDiagnostics = {
    CLIENT_BUNDLE_VERSION: CLIENT_BUNDLE_VERSION,
    generateClientRef: generateClientRef,
    createIdempotencyKey: createIdempotencyKey,
    sanitizeClientText: sanitizeClientText,
    fetchJsonBounded: fetchJsonBounded,
    reportClientDiagnostic: reportClientDiagnostic,
    openModalDialog: openModalDialog,
    closeModalDialog: closeModalDialog,
    renderFeedbackBanner: renderFeedbackBanner,
    getCoarseDeviceContext: getCoarseDeviceContext,
    prefersReducedMotion: prefersReducedMotion,
    isStaleClientBuild: isStaleClientBuild,
    getReleaseSnapshot: function () {
      return {
        clientBundleVersion: CLIENT_BUNDLE_VERSION,
        loadedServerReleaseSha: loadedServerReleaseSha,
        latestServerReleaseSha: latestServerReleaseSha,
        isStaleClient: isStaleClientBuild()
      };
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
