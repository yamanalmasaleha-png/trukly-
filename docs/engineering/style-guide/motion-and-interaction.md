# Style Guide Questionnaire — Motion, Micro-Interactions & Reduced Motion

> [!NOTE]
> **Generated from Structured Source ([decisions.json](decisions.json))** — Do not edit answers directly in Markdown.
> Update `docs/engineering/style-guide/decisions.json` and run `npm run style-guide:generate` (verified by `npm run style-guide:validate`).
> - **Generator**: `biteshark-style-guide@1.0.0` (`biteshark.style-guide-decisions.v1`)
> - **Decisions Source Digest**: `6ca6ad2afe647b1bb681bf8b3167fa105f60151da370936266954f1e8626a121`

- **Navigation**: [Style Guide README](README.md) · [Completion Reminder](COMPLETION-REMINDER.md) · [UI Element Inventory](ui-element-inventory.md)
- **Scope**: Permitted motion roles, duration and easing scales, screen/modal/sheet transitions, favorite/pager micro-interactions, prefers-reduced-motion behavior, and programmatic scroll behavior.
- **Topic Status**: **0** approved · **0** N/A · **0** draft · **7** applicable unanswered · **0** unconfirmed (**7** total)

> [!IMPORTANT]
> **Mandatory Constraints Preserved**: Blank answers below leave visual/editorial parameters open for Matt and Yaman to decide; they **never** relax the mandatory requirements below:
> - **`INV-A11Y-KEYBOARD-FOCUS-ZOOM` (Keyboard Operability, Visible Focus, Pinch-Zoom & Live Announcements)**: Every interactive control must remain keyboard-reachable with a visible, usable focus indicator; modals must manage focus and Escape dismissal; viewport pinch-zoom must never be disabled; dynamic errors and status changes must be announced accessibly. Unanswered visual parameters are never labeled as accessibility compliance. ([ACCESSIBILITY.md](../ACCESSIBILITY.md), [accessibility.html](../../../public/policies/accessibility.html))

---

## Topic-Level Design Decisions (7)

### Motion Scales, Transitions & Reduced Motion

| Decision ID & Question | Answer | Expected Type & Constraints | Applicability & Status | Approval (`approved_by` / `approved_at`) | Related |
|---|---|---|---|---|---|
| <a id="dec-mot-philosophy"></a>**`DEC-MOT-PHILOSOPHY` — Motion Purpose & Restraint Policy**<br>Which motion categories are approved in BiteShark (state feedback, spatial sheet/modal continuity) versus discouraged (looping ambient motion, parallax, layout-shifting bounce)? |  | **Type**: `structured_spec` *(or `ref:DEC-...`)* — Permitted vs prohibited animation categories across Customer, Vendor, and Admin views. | `applicable` / **`unanswered`** |  |  |
| <a id="dec-mot-duration-scale"></a>**`DEC-MOT-DURATION-SCALE` — Animation & Transition Duration Scale**<br>What discrete duration tokens (in ms — 0ms allowed) should govern instant/micro states, hover/focus fades, modal/drawer entrances, and exits? |  | **Type**: `token_map` (unit `ms`) *(or `ref:DEC-...`)* — Map of duration tokens (e.g. instant, fast, normal, slow) to millisecond values. | `applicable` / **`unanswered`** |  |  |
| <a id="dec-mot-easing-curves"></a>**`DEC-MOT-EASING-CURVES` — Approved CSS Easing Curves**<br>What cubic-bezier or standard CSS easing functions should be used for entering overlays, exiting overlays, and in-place property transitions? |  | **Type**: `token_map` *(or `ref:DEC-...`)* — Map of easing token names to CSS timing-function strings (spring/overshoot explicitly allowed or disallowed). | `applicable` / **`unanswered`** |  |  |
| <a id="dec-mot-view-overlay-transitions"></a>**`DEC-MOT-VIEW-OVERLAY-TRANSITIONS` — Screen, Tab, Modal & Sheet Transition Behavior**<br>Should screen/tab switches be instant swaps or crossfades, and how should modals and #truckSheet animate on open and close? |  | **Type**: `structured_spec` *(or `ref:DEC-...`)* — Transition behavior per navigation/overlay archetype. | `applicable` / **`unanswered`** |  | [`DEC-MOT-DURATION-SCALE`](#dec-mot-duration-scale), [`DEC-MOT-EASING-CURVES`](#dec-mot-easing-curves) |
| <a id="dec-mot-microinteractions"></a>**`DEC-MOT-MICROINTERACTIONS` — Favorite Heart, Filter Chip & Pickup Pager Ready Micro-Interactions**<br>What visual feedback should accompany toggling a saved spot, activating a filter chip, copying a link, or a pickup pager reaching Ready? |  | **Type**: `structured_spec` *(or `ref:DEC-...`)* — Micro-interaction rules per control, including whether optional sound/vibration in pager remains user-opt-in. | `applicable` / **`unanswered`** |  |  |
| <a id="dec-mot-reduced-motion-fallback"></a>**`DEC-MOT-REDUCED-MOTION-FALLBACK` — prefers-reduced-motion: reduce Replacement Behavior**<br>When prefers-reduced-motion: reduce is active, should all transitions become 0ms instant state changes or retain short non-spatial opacity fades, and how are pulsing map/pager indicators stilled? |  | **Type**: `structured_spec` *(or `ref:DEC-...`)* — Exact reduced-motion replacement rules across CSS transitions, keyframe animations, and smooth scrolling. | `applicable` / **`unanswered`** |  |  |
| <a id="dec-mot-scroll-behavior"></a>**`DEC-MOT-SCROLL-BEHAVIOR` — Programmatic Scroll & Map-to-Card Sync Scroll Behavior**<br>When selecting a map marker, jumping to #resultsHeading, or opening an error summary, when is smooth scrolling allowed versus instant scroll positioning? |  | **Type**: `structured_spec` *(or `ref:DEC-...`)* — Rules for scrollIntoView / window.scrollTo behavior and reduced-motion override. | `applicable` / **`unanswered`** |  | [`DEC-MOT-REDUCED-MOTION-FALLBACK`](#dec-mot-reduced-motion-fallback) |

