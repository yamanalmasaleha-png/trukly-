# Style Guide Questionnaire — Accessibility Presentation Decisions

> [!NOTE]
> **Generated from Structured Source ([decisions.json](decisions.json))** — Do not edit answers directly in Markdown.
> Update `docs/engineering/style-guide/decisions.json` and run `npm run style-guide:generate` (verified by `npm run style-guide:validate`).
> - **Generator**: `biteshark-style-guide@1.0.0` (`biteshark.style-guide-decisions.v1`)
> - **Decisions Source Digest**: `6ca6ad2afe647b1bb681bf8b3167fa105f60151da370936266954f1e8626a121`

- **Navigation**: [Style Guide README](README.md) · [Completion Reminder](COMPLETION-REMINDER.md) · [UI Element Inventory](ui-element-inventory.md)
- **Scope**: Visual focus ring parameters, contrast targets at or above WCAG AA, target sizing/spacing above 44px floor, skip-link appearance, non-color cues, and announcement verbosity (while preserving mandatory accessibility invariants).
- **Topic Status**: **0** approved · **0** N/A · **0** draft · **8** applicable unanswered · **0** unconfirmed (**8** total)

> [!IMPORTANT]
> **Mandatory Constraints Preserved**: Blank answers below leave visual/editorial parameters open for Matt and Yaman to decide; they **never** relax the mandatory requirements below:
> - **`INV-A11Y-KEYBOARD-FOCUS-ZOOM` (Keyboard Operability, Visible Focus, Pinch-Zoom & Live Announcements)**: Every interactive control must remain keyboard-reachable with a visible, usable focus indicator; modals must manage focus and Escape dismissal; viewport pinch-zoom must never be disabled; dynamic errors and status changes must be announced accessibly. Unanswered visual parameters are never labeled as accessibility compliance. ([ACCESSIBILITY.md](../ACCESSIBILITY.md), [accessibility.html](../../../public/policies/accessibility.html))

---

## Topic-Level Design Decisions (8)

### Visual Focus, Contrast & Target Parameters (Above Mandatory Floor)

| Decision ID & Question | Answer | Expected Type & Constraints | Applicability & Status | Approval (`approved_by` / `approved_at`) | Related |
|---|---|---|---|---|---|
| <a id="dec-a11y-focus-ring-spec"></a>**`DEC-A11Y-FOCUS-RING-SPEC` — Standard :focus-visible Indicator Visual Specification**<br>While visible keyboard focus is mandatory across all surfaces, what exact outline width, offset, color token, and dual-ring/halo treatment (for dark vs light backgrounds) should BiteShark standardize on? |  | **Type**: `structured_spec` *(or `ref:DEC-...`)* — Outline width (px), outline-offset (px), color role(s), and high-contrast halo rule meeting &gt;=3:1 non-text contrast. | `applicable` / **`unanswered`** |  |  |
| <a id="dec-a11y-contrast-target"></a>**`DEC-A11Y-CONTRAST-TARGET` — Target Text & UI Component Contrast Level (WCAG AA Minimum vs AAA)**<br>Should BiteShark target the mandatory WCAG 2.1 AA contrast ratios (4.5:1 normal text, 3:1 large text and UI components) or enforce higher contrast thresholds (e.g. AAA 7:1 for outdoor phone legibility at food trucks)? |  | **Type**: `structured_spec` *(or `ref:DEC-...`)* — Minimum contrast ratios for body text, small metadata/pills, headings, and interactive borders in outdoor daylight. | `applicable` / **`unanswered`** |  |  |
| <a id="dec-a11y-target-size-gap"></a>**`DEC-A11Y-TARGET-SIZE-GAP` — Minimum Interactive Target Size & Adjacent Target Spacing**<br>At or above the 44x44 CSS px touch-target baseline, what minimum dimensions and minimum gap between adjacent interactive controls (chips, pagination buttons, icon actions) should be enforced? |  | **Type**: `structured_spec` (min `44`, unit `px`) *(or `ref:DEC-...`)* — Target min-width/min-height (&gt;=44px) and minimum inter-control spacing (px). | `applicable` / **`unanswered`** |  |  |

### Landmarks, Non-Color Cues & Screen-Reader Announcements

| Decision ID & Question | Answer | Expected Type & Constraints | Applicability & Status | Approval (`approved_by` / `approved_at`) | Related |
|---|---|---|---|---|---|
| <a id="dec-a11y-skip-link-style"></a>**`DEC-A11Y-SKIP-LINK-STYLE` — Skip-to-Main-Content Link Visual Appearance on Focus**<br>Should public/index.html add the same first-tab skip-link pattern used on login.html, admin.html, and policies/*.html, and what focused position, surface color, and elevation should all skip links share? |  | **Type**: `structured_spec` *(or `ref:DEC-...`)* — Placement, typography, color tokens, and elevation when .skip-link receives keyboard focus. | `applicable` / **`unanswered`** |  |  |
| <a id="dec-a11y-non-color-cues"></a>**`DEC-A11Y-NON-COLOR-CUES` — Color-Independent Status & Availability Signifiers**<br>Which secondary non-color signifiers (distinct shapes/symbols, explicit text prefixes, border styles) should accompany open/estimated/closed, unlocked/locked, and ok/warn/danger states? |  | **Type**: `structured_spec` *(or `ref:DEC-...`)* — Mapping of status categories to required text/symbol/border cues alongside color. | `applicable` / **`unanswered`** |  |  |
| <a id="dec-a11y-live-region-cadence"></a>**`DEC-A11Y-LIVE-REGION-CADENCE` — ARIA Live-Region Politeness, Debounce & Announcement Conciseness**<br>How verbose should polite vs assertive live-region announcements be during live search filtering (#nearbyCount), pickup pager polling (#pagerLiveStatus), and form errors? |  | **Type**: `structured_spec` *(or `ref:DEC-...`)* — Debounce timing (ms), polite vs assertive assignment, and concise announcement templates. | `applicable` / **`unanswered`** |  |  |
| <a id="dec-a11y-modal-tab-focus-target"></a>**`DEC-A11Y-MODAL-TAB-FOCUS-TARGET` — Initial Focus Target When Opening Modals & Switching Screens**<br>When opening a modal dialog or switching a &lt;main.screen&gt;, should focus land on the dialog/screen heading (tabindex="-1"), the close button, or the first primary form input? |  | **Type**: `structured_spec` *(or `ref:DEC-...`)* — Initial focus target rule for read-only detail modals, form modals, confirmation modals, and screen switches. | `applicable` / **`unanswered`** |  |  |
| <a id="dec-a11y-accessible-naming"></a>**`DEC-A11Y-ACCESSIBLE-NAMING` — Accessible Naming Pattern for Decorative Icons & Repeated Card Actions**<br>How should repeated buttons on listing/queue cards (e.g. Favorite heart, View details, Delete visit) include item-specific accessible names while hiding decorative icons (aria-hidden="true")? |  | **Type**: `structured_spec` *(or `ref:DEC-...`)* — Naming pattern (e.g. aria-label with business/item name vs aria-labelledby) across repeated list items. | `applicable` / **`unanswered`** |  |  |

