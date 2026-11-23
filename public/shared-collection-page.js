// BiteShark Progressive Recipient Interactions on `/s/<token>` (`public/shared-collection-page.js`)
//
// Invariants:
//   - Never reads, logs, or transmits `window.location.pathname` or any raw share token.
//   - Never automatically mutates recipient favorites on page load.
//   - Signed-in recipients may save individual eligible businesses via `/api/favorites/toggle`.
//   - Signed-out and signed-in viewers may submit abuse reports using non-secret `data-share-id` (`shr_...`).

(function () {
  'use strict';

  var shareId = (document.body && document.body.getAttribute('data-share-id')) || '';
  var saveStatusEl = document.querySelector('[data-sp-el="save-status"]');
  var openReportBtn = document.querySelector('[data-sp-el="open-report"]');
  var reportPanel = document.querySelector('[data-sp-el="report-panel"]');
  var cancelReportBtn = document.querySelector('[data-sp-el="cancel-report"]');
  var reportForm = document.querySelector('[data-sp-el="report-form"]');
  var reportAttachmentInput = document.querySelector('[data-sp-el="report-attachment-id"]');
  var reportMsgEl = document.querySelector('[data-sp-el="report-msg"]');

  function showStatus(el, msg, isErr) {
    if (!el) return;
    el.hidden = false;
    el.className = 'sp-status' + (isErr ? ' is-error' : '');
    el.textContent = msg;
  }

  document.querySelectorAll('[data-sp-save-vendor]').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      var vendorId = btn.getAttribute('data-sp-save-vendor');
      if (!vendorId) return;
      btn.disabled = true;
      try {
        var res = await window.fetch('/api/favorites/toggle', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ truck_id: vendorId, desired_saved: true })
        });
        var data = await res.json().catch(function () { return null; });
        if (res.ok && data && data.saved) {
          btn.textContent = '♥ Saved in your BiteShark places';
          showStatus(saveStatusEl, 'Saved that spot to your BiteShark Saved Places.', false);
        } else {
          btn.disabled = false;
          showStatus(
            saveStatusEl,
            (data && data.error) || 'Sign in on BiteShark to save spots to your account.',
            true
          );
        }
      } catch (_e) {
        btn.disabled = false;
        showStatus(saveStatusEl, 'Could not save spot right now.', true);
      }
    });
  });

  function openReportForm(attachmentId) {
    if (!reportPanel) return;
    if (reportAttachmentInput) {
      reportAttachmentInput.value = attachmentId || '';
    }
    reportPanel.hidden = false;
    var sel = document.querySelector('[data-sp-el="report-reason"]');
    if (sel) sel.focus();
  }

  if (openReportBtn) {
    openReportBtn.addEventListener('click', function () {
      openReportForm('');
    });
  }

  document.querySelectorAll('[data-sp-report-attachment]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      openReportForm(btn.getAttribute('data-sp-report-attachment') || '');
    });
  });

  if (cancelReportBtn && reportPanel) {
    cancelReportBtn.addEventListener('click', function () {
      reportPanel.hidden = true;
    });
  }

  if (reportForm) {
    reportForm.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var submitBtn = document.querySelector('[data-sp-el="submit-report"]');
      var reasonEl = document.querySelector('[data-sp-el="report-reason"]');
      var detailsEl = document.querySelector('[data-sp-el="report-details"]');
      if (submitBtn) submitBtn.disabled = true;
      try {
        var payload = {
          share_id: shareId,
          reason: (reasonEl && reasonEl.value) || 'other',
          details: (detailsEl && detailsEl.value) || ''
        };
        if (reportAttachmentInput && reportAttachmentInput.value) {
          payload.attachment_id = reportAttachmentInput.value;
        }
        var res = await window.fetch('/api/shared/report', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(payload)
        });
        var data = await res.json().catch(function () { return null; });
        if (res.ok && data && data.ok) {
          if (detailsEl) detailsEl.value = '';
          showStatus(
            reportMsgEl,
            'Thank you. Your report was recorded for BiteShark moderation review.',
            false
          );
        } else {
          if (submitBtn) submitBtn.disabled = false;
          showStatus(
            reportMsgEl,
            (data && data.error) || 'Could not submit report right now.',
            true
          );
        }
      } catch (_e) {
        if (submitBtn) submitBtn.disabled = false;
        showStatus(reportMsgEl, 'Network error while submitting report.', true);
      }
    });
  }
})();
