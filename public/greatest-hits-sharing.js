// BiteShark Unlisted Sharing Manager, Server Preview & 18+ Eligibility UI
// (`public/greatest-hits-sharing.js`)
//
// Invariants:
//   - Preview is rendered directly from the server's `POST /api/me/collections/preview` allowlist DTO.
//   - Plaintext URL is displayed ONLY immediately upon `create` or `rotate` (in-memory only, wiped on auth change).
//   - DOB fields for 18+ self-attested confirmation are scrubbed immediately from the DOM in `finally`.

(function () {
  'use strict';

  var shState = {
    collectionId: null,
    disclosures: {
      include_display_name: false,
      include_bio: false,
      include_preferred_area: false,
      include_achievements: false,
      include_shared_photos: false
    },
    expiresInDays: '',
    previewDto: null,
    previewLoading: false,
    latestIssuedShareUrl: null,
    latestIssuedCollectionId: null,
    msg: null
  };

  function resetSharingUiState() {
    shState.collectionId = null;
    shState.disclosures = {
      include_display_name: false,
      include_bio: false,
      include_preferred_area: false,
      include_achievements: false,
      include_shared_photos: false
    };
    shState.expiresInDays = '';
    shState.previewDto = null;
    shState.previewLoading = false;
    shState.latestIssuedShareUrl = null;
    shState.latestIssuedCollectionId = null;
    shState.msg = null;
  }

  function renderPreviewBox(dto, ghEsc) {
    if (!dto || !dto.collection) return '';
    var col = dto.collection;
    var cur = dto.curator || {};
    var entries = col.entries || [];

    var curHtml = '';
    if (cur.included) {
      curHtml =
        '<div class="cp-list-item" style="margin-bottom:10px">' +
        '<div class="cp-list-item-body">' +
        (cur.display_name ? '<strong>Shared by ' + ghEsc(cur.display_name) + '</strong>' : '') +
        (cur.preferred_town ? '<span class="cp-list-item-meta">Preferred area: ' + ghEsc(cur.preferred_town) + '</span>' : '') +
        (cur.bio ? '<span class="cp-list-item-meta">' + ghEsc(cur.bio) + '</span>' : '') +
        (cur.achievements
          ? '<span class="cp-list-item-meta">Level ' +
            Number(cur.achievements.level_number) +
            ' (' +
            ghEsc(cur.achievements.level_title) +
            ') · ' +
            Number(cur.achievements.total_points) +
            ' pts</span>'
          : '') +
        '</div></div>';
    }

    var entriesHtml =
      entries.length === 0
        ? '<p class="cp-help">No saved spots in this collection yet (remember to click Save Greatest Hits changes above first).</p>'
        : '<ul class="cp-list">' +
          entries
            .map(function (e) {
              if (!e.available) {
                return (
                  '<li class="cp-list-item" style="opacity:0.75">' +
                  '<div class="cp-list-item-body">' +
                  '<strong>#' + Number(e.position) + ' · ' + ghEsc(e.display_name) + '</strong>' +
                  '<span class="cp-list-item-meta">' + ghEsc(e.service_status_label || 'Unavailable') + '</span>' +
                  '</div></li>'
                );
              }
              return (
                '<li class="cp-list-item">' +
                '<div class="cp-list-item-body">' +
                '<strong>#' + Number(e.position) + ' · ' + ghEsc(e.display_name) + '</strong>' +
                '<span class="cp-list-item-meta">' + ghEsc(e.cuisine) + ' · ' + ghEsc(e.town) + ' · ' + ghEsc(e.service_status_label) + '</span>' +
                (e.recommendation ? '<span class="cp-list-item-meta">“' + ghEsc(e.recommendation) + '”</span>' : '') +
                (e.shared_photo
                  ? '<img src="' + ghEsc(e.shared_photo.image_url) + '" alt="' + ghEsc(e.shared_photo.alt_text) + '" style="display:block;margin-top:8px;max-width:160px;border-radius:10px;border:1px solid var(--trk-border,#D7DED3)">'
                  : '') +
                '</div></li>'
              );
            })
            .join('') +
          '</ul>';

    return (
      '<div class="cp-preview-frame" id="ghServerPreviewFrame" role="region" aria-label="Exact shared page preview">' +
      '<span class="cp-kicker">EXACT RECIPIENT PREVIEW (ALLOWLISTED SERVER PROJECTION)</span>' +
      '<h3 style="margin-top:6px">' + ghEsc(col.title) + '</h3>' +
      (col.intro ? '<p class="cp-panel-lead">' + ghEsc(col.intro) + '</p>' : '') +
      curHtml +
      entriesHtml +
      '<p class="cp-help" style="margin-top:10px">' + ghEsc((dto.disclosures && dto.disclosures.recommendation_nature) || '') + '</p>' +
      '</div>'
    );
  }

  function renderSharingSection(col, profileData, ctx) {
    var ghEsc = ctx.ghEsc;
    if (shState.collectionId !== col.collection_id) {
      shState.collectionId = col.collection_id;
      shState.previewDto = null;
      shState.msg = null;
    }

    var fs = (profileData && profileData.feature_states) || {};
    var shareFeat = fs.unlisted_collection_sharing || { state: 'hidden' };
    var photosFeat = fs.shared_collection_photos || { state: 'hidden' };
    var elig = (profileData && profileData.sharing_eligibility) || { status: 'unknown', can_share: false };
    var activeShares = col.active_shares || [];

    var activeSharesHtml = '';
    if (activeShares.length > 0) {
      activeSharesHtml =
        '<div style="margin-bottom:14px">' +
        '<h3>Active unlisted links for this collection (' + activeShares.length + ' / 3)</h3>' +
        '<ul class="cp-list">' +
        activeShares
          .map(function (s) {
            var flags = [];
            if (s.disclosures.include_display_name) flags.push('Name');
            if (s.disclosures.include_bio) flags.push('Bio');
            if (s.disclosures.include_preferred_area) flags.push('Town');
            if (s.disclosures.include_achievements) flags.push('Badges/Level');
            if (s.disclosures.include_shared_photos) flags.push('Shared photos');
            var flagsLabel = flags.length ? 'Includes: ' + flags.join(', ') : 'Collection spots & recommendations only';
            return (
              '<li class="cp-list-item">' +
              '<div class="cp-list-item-body">' +
              '<strong>Link ' + ghEsc(s.masked_token_hint) + '</strong>' +
              '<span class="cp-list-item-meta">' + ghEsc(flagsLabel) + '</span>' +
              '<span class="cp-list-item-meta">' +
              (s.expires_at ? 'Expires ' + ghEsc(String(s.expires_at).slice(0, 10)) : 'No automatic expiry') +
              '</span>' +
              '</div>' +
              '<div class="cp-btn-row" style="margin-top:0">' +
              (shareFeat.state === 'enabled' && elig.can_share && col.moderation_status === 'active'
                ? '<button type="button" class="cp-inline-btn" data-gh-rotate-share="' + ghEsc(s.share_id) + '">Replace / rotate link</button>'
                : '') +
              '<button type="button" class="cp-inline-btn is-danger" data-gh-revoke-share="' + ghEsc(s.share_id) + '">Revoke</button>' +
              '</div>' +
              '</li>'
            );
          })
          .join('') +
        '</ul></div>';
    }

    var issuedUrlBanner = '';
    if (shState.latestIssuedShareUrl && shState.latestIssuedCollectionId === col.collection_id) {
      issuedUrlBanner =
        '<div class="cp-note-box" role="status">' +
        '<strong>New unlisted share link ready (shown once):</strong>' +
        '<div class="cp-share-url-box">' +
        '<input type="text" id="ghIssuedShareUrlInput" readonly value="' + ghEsc(shState.latestIssuedShareUrl) + '" aria-label="Unlisted share URL">' +
        '<button type="button" class="cp-inline-btn is-primary" id="ghCopyShareUrlBtn">Copy link</button>' +
        '<a class="cp-inline-btn" href="' + ghEsc(shState.latestIssuedShareUrl) + '" target="_blank" rel="noreferrer noopener" style="text-decoration:none">Open shared page ↗</a>' +
        '</div>' +
        '<small class="cp-help">BiteShark stores only a cryptographic hash of this link and cannot display the full URL again later.</small>' +
        '</div>';
    }

    var bodyControlsHtml = '';
    if (shareFeat.state === 'hidden') {
      bodyControlsHtml =
        '<div class="cp-note-box" role="status">' +
        ghEsc(shareFeat.message || 'Unlisted sharing is currently disabled. Your collection remains private, and you can still preview it or revoke existing links above.') +
        '</div>' +
        '<div class="cp-btn-row">' +
        '<button type="button" class="cp-inline-btn" id="ghPreviewSharedBtn">' + (shState.previewLoading ? 'Loading preview…' : 'Preview shared layout') + '</button>' +
        '</div>';
    } else if (col.moderation_status === 'suppressed') {
      bodyControlsHtml =
        '<div class="cp-note-box is-danger" role="status">Shared links cannot be created or rotated while this collection is suppressed by moderation.</div>';
    } else if (elig.status === 'ineligible_under_18') {
      bodyControlsHtml =
        '<div class="cp-note-box is-warn" role="status">External link sharing is restricted to members aged 18 and older. Your private Greatest Hits collections remain available for your personal use.</div>';
    } else if (!elig.can_share) {
      var months = [
        ['01', 'January'], ['02', 'February'], ['03', 'March'], ['04', 'April'],
        ['05', 'May'], ['06', 'June'], ['07', 'July'], ['08', 'August'],
        ['09', 'September'], ['10', 'October'], ['11', 'November'], ['12', 'December']
      ];
      bodyControlsHtml =
        '<div class="cp-note-box is-warn">' +
        '<strong>One-time 18+ confirmation required before sharing:</strong> ' +
        ghEsc(elig.self_attested_disclosure || 'Enter your birth date once so the server can confirm 18+ eligibility in Pacific Time. Your date of birth is never stored; this is self-attested, not ID verification.') +
        '<form id="ghAdultEligForm" style="margin-top:10px" novalidate>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px">' +
        '<label class="cp-form-field" style="margin-bottom:0"><span>Birth month</span><select id="ghEligMonth" required><option value="">Month…</option>' +
        months.map(function (m) { return '<option value="' + m[0] + '">' + m[1] + '</option>'; }).join('') +
        '</select></label>' +
        '<label class="cp-form-field" style="margin-bottom:0"><span>Day (DD)</span><input id="ghEligDay" type="number" min="1" max="31" placeholder="DD" required></label>' +
        '<label class="cp-form-field" style="margin-bottom:0"><span>Year (YYYY)</span><input id="ghEligYear" type="number" min="1900" max="2030" placeholder="YYYY" required></label>' +
        '</div>' +
        '<div class="cp-btn-row">' +
        '<button type="submit" class="cp-inline-btn is-primary" id="ghSubmitEligBtn">Confirm 18+ sharing eligibility</button>' +
        '<button type="button" class="cp-inline-btn" id="ghPreviewSharedBtn">Preview without sharing</button>' +
        '</div>' +
        '</form></div>';
    } else {
      var createDisabled = shareFeat.state !== 'enabled' || activeShares.length >= 3;
      bodyControlsHtml =
        (shareFeat.state === 'paused'
          ? '<div class="cp-note-box is-warn" role="status">' + ghEsc(shareFeat.message || 'Creating new share links is temporarily paused.') + '</div>'
          : '') +
        '<div class="cp-note-box">' +
        '<strong>Important:</strong> Anyone with this link can view it. They can forward the link. You can revoke it.' +
        '</div>' +
        '<fieldset style="border:0;padding:0;margin:12px 0">' +
        '<legend style="font-weight:600;font-size:0.92rem;margin-bottom:8px">Choose optional details to include (all off by default — email, visit dates, and private notes are never shared)</legend>' +
        '<div class="cp-interest-grid">' +
        '<label class="cp-check-tile"><input type="checkbox" data-gh-disc="include_display_name"' + (shState.disclosures.include_display_name ? ' checked' : '') + '><span>Include my display name &amp; avatar</span></label>' +
        '<label class="cp-check-tile"><input type="checkbox" data-gh-disc="include_bio"' + (shState.disclosures.include_bio ? ' checked' : '') + '><span>Include my short bio</span></label>' +
        '<label class="cp-check-tile"><input type="checkbox" data-gh-disc="include_preferred_area"' + (shState.disclosures.include_preferred_area ? ' checked' : '') + '><span>Include my preferred Sonoma town</span></label>' +
        '<label class="cp-check-tile"><input type="checkbox" data-gh-disc="include_achievements"' + (shState.disclosures.include_achievements ? ' checked' : '') + '><span>Include my level &amp; unlocked badges</span></label>' +
        (photosFeat.state !== 'hidden'
          ? '<label class="cp-check-tile"><input type="checkbox" data-gh-disc="include_shared_photos"' + (shState.disclosures.include_shared_photos ? ' checked' : '') + '><span>Include consented shared photos attached above</span></label>'
          : '') +
        '</div>' +
        '</fieldset>' +
        '<div class="cp-form-field" style="max-width:300px">' +
        '<label for="ghShareExpirySelect">Optional link expiration</label>' +
        '<select id="ghShareExpirySelect">' +
        '<option value=""' + (shState.expiresInDays === '' ? ' selected' : '') + '>No automatic expiration (until revoked)</option>' +
        '<option value="7"' + (shState.expiresInDays === '7' ? ' selected' : '') + '>Expires in 7 days</option>' +
        '<option value="30"' + (shState.expiresInDays === '30' ? ' selected' : '') + '>Expires in 30 days</option>' +
        '<option value="90"' + (shState.expiresInDays === '90' ? ' selected' : '') + '>Expires in 90 days</option>' +
        '</select>' +
        '</div>' +
        '<div class="cp-btn-row">' +
        '<button type="button" class="cp-inline-btn" id="ghPreviewSharedBtn">' + (shState.previewLoading ? 'Loading preview…' : 'Preview exact shared view') + '</button>' +
        '<button type="button" class="cp-inline-btn is-primary" id="ghCreateShareLinkBtn"' + (createDisabled ? ' disabled' : '') + '>' +
        (activeShares.length >= 3 ? 'Max 3 active links reached' : 'Create unlisted share link') +
        '</button>' +
        '</div>';
    }

    return (
      '<section class="cp-panel" aria-labelledby="ghShareHeading">' +
      '<h2 id="ghShareHeading">Preview &amp; unlisted sharing</h2>' +
      '<p class="cp-panel-lead">Preview exactly what a friend would see, or generate a revocable unlisted link. Changing your private profile never silently adds new categories to existing links.</p>' +
      (shState.msg
        ? '<div class="cp-status-msg' + (shState.msg.isError ? ' is-error' : '') + '" role="' + (shState.msg.isError ? 'alert' : 'status') + '">' + ghEsc(shState.msg.text) + '</div>'
        : '') +
      issuedUrlBanner +
      activeSharesHtml +
      bodyControlsHtml +
      (shState.previewDto ? renderPreviewBox(shState.previewDto, ghEsc) : '') +
      '</section>'
    );
  }

  function bindSharingSectionEvents(root, col, profileData, ctx) {
    if (!col) return;
    var rerender = function () {
      if (window.bitesharkGreatestHitsHooks) {
        window.bitesharkGreatestHitsHooks.rerender();
      }
    };

    root.querySelectorAll('[data-gh-disc]').forEach(function (chk) {
      chk.onchange = function () {
        var key = chk.dataset.ghDisc;
        shState.disclosures[key] = Boolean(chk.checked);
      };
    });

    var expSel = root.querySelector('#ghShareExpirySelect');
    if (expSel) {
      expSel.onchange = function () {
        shState.expiresInDays = expSel.value;
      };
    }

    var previewBtn = root.querySelector('#ghPreviewSharedBtn');
    if (previewBtn) {
      previewBtn.onclick = async function () {
        shState.previewLoading = true;
        shState.msg = null;
        rerender();
        try {
          var out = await window.bitesharkProfile.previewSharedCollection({
            collection_id: col.collection_id,
            disclosures: shState.disclosures
          });
          shState.previewLoading = false;
          shState.previewDto = out.preview;
          rerender();
        } catch (err) {
          shState.previewLoading = false;
          shState.msg = { text: err.message || 'Could not load preview.', isError: true };
          rerender();
        }
      };
    }

    var eligForm = root.querySelector('#ghAdultEligForm');
    if (eligForm) {
      eligForm.onsubmit = async function (ev) {
        ev.preventDefault();
        var mEl = root.querySelector('#ghEligMonth');
        var dEl = root.querySelector('#ghEligDay');
        var yEl = root.querySelector('#ghEligYear');
        var btn = root.querySelector('#ghSubmitEligBtn');
        var mVal = mEl ? mEl.value : '';
        var dVal = dEl ? dEl.value : '';
        var yVal = yEl ? yEl.value : '';
        // Immediately scrub DOM date fields before network call & again in finally
        if (mEl) mEl.value = '';
        if (dEl) dEl.value = '';
        if (yEl) yEl.value = '';
        if (btn) btn.disabled = true;
        try {
          await window.bitesharkProfile.submitSharingEligibility({
            dob_month: mVal,
            dob_day: dVal,
            dob_year: yVal
          });
          shState.msg = { text: '18+ sharing confirmation complete. You can now create an unlisted share link.', isError: false };
          if (ctx && typeof ctx.reloadProfile === 'function') {
            await ctx.reloadProfile({ force: true, tab: 'collections' });
          }
          if (ctx && typeof ctx.reloadEditor === 'function') {
            await ctx.reloadEditor();
          }
        } catch (err) {
          shState.msg = { text: err.message || 'Could not complete 18+ confirmation.', isError: true };
          if (ctx && typeof ctx.reloadProfile === 'function') {
            await ctx.reloadProfile({ force: true, tab: 'collections' });
          }
          rerender();
        } finally {
          if (mEl) mEl.value = '';
          if (dEl) dEl.value = '';
          if (yEl) yEl.value = '';
        }
      };
    }

    var createBtn = root.querySelector('#ghCreateShareLinkBtn');
    if (createBtn) {
      createBtn.onclick = async function () {
        createBtn.disabled = true;
        shState.msg = null;
        try {
          var payload = {
            collection_id: col.collection_id,
            disclosures: Object.assign({}, shState.disclosures)
          };
          if (shState.expiresInDays) {
            payload.expires_in_days = Number(shState.expiresInDays);
          }
          var created = await window.bitesharkProfile.createShare(payload);
          var fullUrl =
            created.share_url && created.share_url.indexOf('http') === 0
              ? created.share_url
              : window.location.origin + (created.share_path || created.share_url);
          shState.latestIssuedShareUrl = fullUrl;
          shState.latestIssuedCollectionId = col.collection_id;
          shState.msg = { text: 'Created unlisted share link. Copy it below!', isError: false };
          if (ctx && typeof ctx.reloadEditor === 'function') {
            await ctx.reloadEditor();
          }
        } catch (err) {
          createBtn.disabled = false;
          shState.msg = { text: err.message || 'Could not create share link.', isError: true };
          rerender();
        }
      };
    }

    var copyBtn = root.querySelector('#ghCopyShareUrlBtn');
    if (copyBtn) {
      copyBtn.onclick = async function () {
        var inp = root.querySelector('#ghIssuedShareUrlInput');
        var urlVal = inp ? inp.value : shState.latestIssuedShareUrl;
        if (!urlVal) return;
        try {
          if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            await navigator.clipboard.writeText(urlVal);
            shState.msg = { text: 'Copied unlisted share link to clipboard.', isError: false };
            rerender();
            return;
          }
        } catch (_e) {}
        // Accessible manual copy fallback
        if (inp) {
          inp.focus();
          inp.select();
        }
        shState.msg = {
          text: 'Clipboard access unavailable — the URL is selected in the box above; press Ctrl+C / Cmd+C to copy.',
          isError: false
        };
        rerender();
      };
    }

    root.querySelectorAll('[data-gh-rotate-share]').forEach(function (btn) {
      btn.onclick = async function () {
        var sid = btn.dataset.ghRotateShare;
        btn.disabled = true;
        try {
          var rotated = await window.bitesharkProfile.rotateShare({ share_id: sid });
          var fullUrl =
            rotated.share_url && rotated.share_url.indexOf('http') === 0
              ? rotated.share_url
              : window.location.origin + (rotated.share_path || rotated.share_url);
          shState.latestIssuedShareUrl = fullUrl;
          shState.latestIssuedCollectionId = col.collection_id;
          shState.msg = { text: 'Previous link revoked and replaced with a new link.', isError: false };
          if (ctx && typeof ctx.reloadEditor === 'function') {
            await ctx.reloadEditor();
          }
        } catch (err) {
          btn.disabled = false;
          shState.msg = { text: err.message || 'Could not rotate share link.', isError: true };
          rerender();
        }
      };
    });

    root.querySelectorAll('[data-gh-revoke-share]').forEach(function (btn) {
      btn.onclick = async function () {
        var sid = btn.dataset.ghRevokeShare;
        btn.disabled = true;
        try {
          await window.bitesharkProfile.revokeShare(sid, 'Revoked from Greatest Hits editor');
          shState.latestIssuedShareUrl = null;
          shState.msg = { text: 'Unlisted link revoked immediately.', isError: false };
          if (ctx && typeof ctx.reloadEditor === 'function') {
            await ctx.reloadEditor();
          }
        } catch (err) {
          btn.disabled = false;
          shState.msg = { text: err.message || 'Could not revoke share link.', isError: true };
          rerender();
        }
      };
    });
  }

  if (typeof window !== 'undefined') {
    if (window.bitesharkGreatestHitsHooks) {
      window.bitesharkGreatestHitsHooks.setSharingHooks(renderSharingSection, bindSharingSectionEvents);
    }
    var prevReset = window.bitesharkResetProfileUiOnAuthChange;
    window.bitesharkResetProfileUiOnAuthChange = function () {
      resetSharingUiState();
      if (typeof prevReset === 'function') prevReset();
    };
  }
})();
