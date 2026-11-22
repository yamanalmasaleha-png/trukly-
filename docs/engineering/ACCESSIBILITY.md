# Accessibility Architecture & Known Remediation Targets

Public accessibility commitments are disclosed in [accessibility.html](../../public/policies/accessibility.html); runtime helpers live in [diagnostics-client.js](../../public/diagnostics-client.js), [mobile-scroll-fix.css](../../public/mobile-scroll-fix.css), and [color-calm.css](../../public/color-calm.css).

---

## 1. Implemented Accessibility Controls

1. **Keyboard Landmarks & Skip Links**:
   - `public/index.html`, `public/login.html`, `public/admin.html`, and `public/policies/*.html` provide `<a class="skip-link" href="#...">Skip to main content</a>` as the first focusable element.
2. **Accessible Modal Controller (`openModalDialog` / `closeModalDialog` in `public/diagnostics-client.js:539-620`)**:
   - Marks background siblings `inert` + `aria-hidden="true"`, traps `Tab` / `Shift+Tab` inside the active dialog, closes on `Escape`, locks background scroll, and restores focus to the triggering element on close.
   - Consumed by `openAppModal`/`closeAppModal` (`app.js`), `rxOpenModal`/`rxCloseModal` (`role-experience.js`), and `adminOpenModal`/`adminCloseModal` (`admin.js`).
3. **Touch Targets & Viewport Zoom**:
   - Interactive controls target `>= 44×44 px` (`48px` `.primary`/`.secondary` buttons; `>= 44px` `.food-cluster-menu` buttons on `a2f0135`).
   - `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">` never disables user pinch-zoom (`maximum-scale=1` / `user-scalable=no` are prohibited).
4. **Reduced Motion & Live Announcements**:
   - `@media (prefers-reduced-motion: reduce)` disables decorative transitions/animations across `color-calm.css`, `characters.css`, `pager-experience.css`, and `map-cards.css` (`a2f0135`).
   - Validation errors, OTP status messages, and pause banners use `role="alert"` / `aria-live="polite"`.

---

## 2. Known Accessibility Gaps Recorded for Future Fixes

1. **Direct `.hidden` Toggles Bypassing `openModalDialog`**:
   - `public/role-experience.js` (`#rxAgeAssessmentModal` line 1130, `#inviteAcceptModal` lines 2856/2968) and `public/admin.js` (`#invActionModal`, `#invHistoryModal`, `#featureConfirmModal`) toggle `.hidden = false` directly instead of calling `rxOpenModal` / `adminOpenModal`, omitting background `inert` locking and `Tab` focus trapping.
2. **Post-Open DOM Injection in `#detailModal`**:
   - `listing-highlights.js` and `smart.js` wrap `openDetail(id)` and append interactive nodes into `#detailContent .detail-body` *after* `openAppModal('detailModal')` computes initial focusable children.
3. **Modal `z-index` Inversion**:
   - `.modal-backdrop` (`z-index: 2000`) sits above `.rx-modal-backdrop` (`z-index: 1400`); always close `#detailModal`/`#bookingModal` before opening an `#rxModalsRoot` modal.

---

## 3. Automated Verification

- Headless Chrome accessibility & modal keyboard checks run in `node tests/reliability-accessibility-browser.e2e.cjs` and `node tests/discovery-cards-ux-browser.e2e.cjs`.
