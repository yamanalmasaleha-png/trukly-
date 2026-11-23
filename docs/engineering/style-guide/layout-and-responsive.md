# Style Guide Questionnaire — Layout, Grids & Responsive Behavior

> [!NOTE]
> **Generated from Structured Source ([decisions.json](decisions.json))** — Do not edit answers directly in Markdown.
> Update `docs/engineering/style-guide/decisions.json` and run `npm run style-guide:generate` (verified by `npm run style-guide:validate`).
> - **Generator**: `biteshark-style-guide@1.0.0` (`biteshark.style-guide-decisions.v1`)
> - **Decisions Source Digest**: `6ca6ad2afe647b1bb681bf8b3167fa105f60151da370936266954f1e8626a121`

- **Navigation**: [Style Guide README](README.md) · [Completion Reminder](COMPLETION-REMINDER.md) · [UI Element Inventory](ui-element-inventory.md)
- **Scope**: Container widths, grids, gutters, breakpoints, mobile safe-area insets, sticky/fixed region budgets, page vs pane scrolling, and 200%-400% zoom reflow.
- **Topic Status**: **0** approved · **0** N/A · **0** draft · **8** applicable unanswered · **0** unconfirmed (**8** total)

> [!IMPORTANT]
> **Mandatory Constraints Preserved**: Blank answers below leave visual/editorial parameters open for Matt and Yaman to decide; they **never** relax the mandatory requirements below:
> - **`INV-A11Y-KEYBOARD-FOCUS-ZOOM` (Keyboard Operability, Visible Focus, Pinch-Zoom & Live Announcements)**: Every interactive control must remain keyboard-reachable with a visible, usable focus indicator; modals must manage focus and Escape dismissal; viewport pinch-zoom must never be disabled; dynamic errors and status changes must be announced accessibly. Unanswered visual parameters are never labeled as accessibility compliance. ([ACCESSIBILITY.md](../ACCESSIBILITY.md), [accessibility.html](../../../public/policies/accessibility.html))

---

## Topic-Level Design Decisions (8)

### Containers, Grids & Breakpoints

| Decision ID & Question | Answer | Expected Type & Constraints | Applicability & Status | Approval (`approved_by` / `approved_at`) | Related |
|---|---|---|---|---|---|
| <a id="dec-lay-max-widths"></a>**`DEC-LAY-MAX-WIDTHS` — Maximum Container Widths by Screen Type**<br>What max-width constraints should apply to #discoverScreen split layout, standard .page-screen views, .login-card, /admin split panes, and /policies long-form reading column? |  | **Type**: `token_map` (unit `px_or_rem`) *(or `ref:DEC-...`)* — Map of screen/container archetypes to max-width CSS values. | `applicable` / **`unanswered`** |  |  |
| <a id="dec-lay-grid-system"></a>**`DEC-LAY-GRID-SYSTEM` — Multi-Column Grid Rules Across Cards, Owner Workspace & Admin**<br>What column counts or auto-fit min-track widths should govern listing grids (#truckCards, #favoriteGrid), #ownerScreen cards, #guideStoryGrid, and #overviewCards? |  | **Type**: `structured_spec` *(or `ref:DEC-...`)* — Grid track specifications per viewport tier for each multi-card container. | `applicable` / **`unanswered`** |  |  |
| <a id="dec-lay-gutters-padding"></a>**`DEC-LAY-GUTTERS-PADDING` — Viewport Edge Padding & Grid Gutters**<br>What outer horizontal page padding and inter-card grid gutters should apply at mobile, tablet, and desktop widths? |  | **Type**: `token_map` (unit `px_or_rem`) *(or `ref:DEC-...`)* — Map of mobile/tablet/desktop outer padding and grid gap tokens. | `applicable` / **`unanswered`** |  | [`DEC-FND-SPACING-SCALE`](foundations.md#dec-fnd-spacing-scale) |
| <a id="dec-lay-breakpoints"></a>**`DEC-LAY-BREAKPOINTS` — Standard Responsive Breakpoint Scale**<br>Which exact viewport breakpoints (consolidating current 359px, 375px, 390px, 420px, 749px, 800px, 900px, 1000px rules) should BiteShark standardize on, and should media queries be mobile-first (min-width) or desktop-first? |  | **Type**: `structured_spec` *(or `ref:DEC-...`)* — Named breakpoint thresholds in px and min-width vs max-width authoring rule. | `applicable` / **`unanswered`** |  |  |

### Safe Areas, Sticky Chrome, Scrolling & Reflow

| Decision ID & Question | Answer | Expected Type & Constraints | Applicability & Status | Approval (`approved_by` / `approved_at`) | Related |
|---|---|---|---|---|---|
| <a id="dec-lay-safe-areas"></a>**`DEC-LAY-SAFE-AREAS` — Mobile Safe-Area Inset Handling (env(safe-area-inset-*))**<br>How should topbar, bottom-nav, full-height modals, and floating toasts pad around iOS/Android notches, home indicators, and virtual keyboards? |  | **Type**: `structured_spec` *(or `ref:DEC-...`)* — Rules for env(safe-area-inset-top/bottom/left/right) and dynamic viewport units (dvh/svh). | `applicable` / **`unanswered`** |  |  |
| <a id="dec-lay-sticky-fixed-budget"></a>**`DEC-LAY-STICKY-FIXED-BUDGET` — Maximum Sticky/Fixed Vertical Chrome Budget**<br>What maximum percentage or pixel height of the viewport may be occupied simultaneously by sticky/fixed chrome (.topbar + #rxRoleBanner + discovery toolbar + .bottom-nav), especially on 320x568-390x844 screens and 200% zoom? |  | **Type**: `structured_spec` *(or `ref:DEC-...`)* — Max height/viewport-share rules and which bars unstick on short viewports or high zoom. | `applicable` / **`unanswered`** |  |  |
| <a id="dec-lay-scroll-overflow"></a>**`DEC-LAY-SCROLL-OVERFLOW` — Document Scroll vs Inner Pane Scroll Architecture**<br>When should BiteShark use natural document scrolling versus locked-viewport inner pane scrolling (e.g. desktop Map + #truckSheet split view and /admin .split-layout)? |  | **Type**: `structured_spec` *(or `ref:DEC-...`)* — Scrolling ownership rules by screen mode and breakpoint, including scroll-position restoration. | `applicable` / **`unanswered`** |  |  |
| <a id="dec-lay-zoom-reflow"></a>**`DEC-LAY-ZOOM-REFLOW` — 200%-400% Zoom & 320 CSS px Reflow Policy**<br>How should multi-column toolbars, split panes, chip rows, and tables reflow at 320 CSS px width and 200%-400% browser zoom so horizontal scrolling is avoided outside true two-dimensional data tables? |  | **Type**: `structured_spec` *(or `ref:DEC-...`)* — Reflow rules for toolbars, split-panes, chip rows, and tables under WCAG 1.4.4 / 1.4.10. | `applicable` / **`unanswered`** |  |  |

