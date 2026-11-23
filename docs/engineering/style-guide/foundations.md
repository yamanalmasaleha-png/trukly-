# Style Guide Questionnaire — Foundations & Design Tokens

> [!NOTE]
> **Generated from Structured Source ([decisions.json](decisions.json))** — Do not edit answers directly in Markdown.
> Update `docs/engineering/style-guide/decisions.json` and run `npm run style-guide:generate` (verified by `npm run style-guide:validate`).
> - **Generator**: `biteshark-style-guide@1.0.0` (`biteshark.style-guide-decisions.v1`)
> - **Decisions Source Digest**: `6ca6ad2afe647b1bb681bf8b3167fa105f60151da370936266954f1e8626a121`

- **Navigation**: [Style Guide README](README.md) · [Completion Reminder](COMPLETION-REMINDER.md) · [UI Element Inventory](ui-element-inventory.md)
- **Scope**: Brand attributes, semantic and surface color roles, light/dark theme policy, CSS token naming and consolidation, spacing/sizing scales, borders/radii/elevation, z-index layering, and density.
- **Topic Status**: **0** approved · **0** N/A · **0** draft · **15** applicable unanswered · **2** unconfirmed (**17** total)

> [!IMPORTANT]
> **Mandatory Constraints Preserved**: Blank answers below leave visual/editorial parameters open for Matt and Yaman to decide; they **never** relax the mandatory requirements below:
> - **`INV-A11Y-KEYBOARD-FOCUS-ZOOM` (Keyboard Operability, Visible Focus, Pinch-Zoom & Live Announcements)**: Every interactive control must remain keyboard-reachable with a visible, usable focus indicator; modals must manage focus and Escape dismissal; viewport pinch-zoom must never be disabled; dynamic errors and status changes must be announced accessibly. Unanswered visual parameters are never labeled as accessibility compliance. ([ACCESSIBILITY.md](../ACCESSIBILITY.md), [accessibility.html](../../../public/policies/accessibility.html))
> - **`INV-TRUTH-SONOMA-DISCLOSURES` (Sonoma County Truthfulness, Non-Fabricated Status & Draft Policy Honesty)**: Never fabricate star ratings, review counts, verified statuses, live locations, stock photos, instant reservations, or legal sign-off. Distinguish verified vendor data from unclaimed/estimated directory info, label illustrations honestly, and retain draft legal notices until approved in Readiness. ([UI-AND-CONTENT-GUIDE.md](../UI-AND-CONTENT-GUIDE.md), [legal-and-readiness.md](../domains/legal-and-readiness.md), [index.html](../../../public/policies/index.html))

---

## Topic-Level Design Decisions (15)

### Brand Attributes & Visual Tone

| Decision ID & Question | Answer | Expected Type & Constraints | Applicability & Status | Approval (`approved_by` / `approved_at`) | Related |
|---|---|---|---|---|---|
| <a id="dec-fnd-brand-attributes"></a>**`DEC-FND-BRAND-ATTRIBUTES` — Core Brand Personality Attributes**<br>Which 3-5 brand attributes and visual tone principles should govern BiteShark across Sonoma County discovery, vendor tools, and administrative interfaces? |  | **Type**: `string_list` *(or `ref:DEC-...`)* — Ordered list of concise brand/visual attributes with brief guiding intent for each. | `applicable` / **`unanswered`** |  |  |
| <a id="dec-fnd-surface-personality-split"></a>**`DEC-FND-SURFACE-PERSONALITY-SPLIT` — Visual Expressiveness Balance Across Customer, Vendor & Admin Surfaces**<br>How much editorial/illustrative warmth should appear on Customer discovery versus Vendor operational screens (#ownerScreen) and Admin/Legal pages (/admin, /policies)? |  | **Type**: `structured_spec` *(or `ref:DEC-...`)* — Object mapping customer, vendor, admin, and policy surfaces to their intended visual expressiveness rules. | `applicable` / **`unanswered`** |  | [`DEC-FND-BRAND-ATTRIBUTES`](#dec-fnd-brand-attributes), [`DEC-CNT-VOICE-BY-SURFACE`](content-and-language.md#dec-cnt-voice-by-surface) |

### Color Roles & Semantic Palette

| Decision ID & Question | Answer | Expected Type & Constraints | Applicability & Status | Approval (`approved_by` / `approved_at`) | Related |
|---|---|---|---|---|---|
| <a id="dec-fnd-surface-ink-roles"></a>**`DEC-FND-SURFACE-INK-ROLES` — Page Canvas, Card Surface & Text Ink Color Roles**<br>What exact color values should be assigned to primary page background, elevated card/modal surface, subtle inset surface, primary ink, secondary/muted ink, and border roles? |  | **Type**: `token_map` *(or `ref:DEC-...`)* — Map of semantic surface/text/border token names to approved CSS color values (meeting contrast floor). | `applicable` / **`unanswered`** |  | [`DEC-A11Y-CONTRAST-TARGET`](accessibility-decisions.md#dec-a11y-contrast-target) |
| <a id="dec-fnd-brand-color-roles"></a>**`DEC-FND-BRAND-COLOR-ROLES` — Primary Brand, Secondary Accent & Highlight Color Roles**<br>What exact color values should be approved for primary action/brand fill, primary hover/active states, secondary soft surface, and editorial highlight/accent roles? |  | **Type**: `token_map` *(or `ref:DEC-...`)* — Map of brand/accent token names to approved CSS color values and foreground text pairings. | `applicable` / **`unanswered`** |  | [`DEC-FND-SURFACE-INK-ROLES`](#dec-fnd-surface-ink-roles), [`DEC-A11Y-CONTRAST-TARGET`](accessibility-decisions.md#dec-a11y-contrast-target) |
| <a id="dec-fnd-semantic-color-roles"></a>**`DEC-FND-SEMANTIC-COLOR-ROLES` — Semantic Status Color Roles (Success, Warning, Critical, Info, Governance)**<br>What foreground, background, and border color triplets should represent positive/verified, caution/estimated/paused, error/destructive, informational, and Mod/Top governance states? |  | **Type**: `token_map` *(or `ref:DEC-...`)* — Map of semantic status roles to foreground, background, and border CSS colors. | `applicable` / **`unanswered`** |  | [`DEC-A11Y-CONTRAST-TARGET`](accessibility-decisions.md#dec-a11y-contrast-target), [`DEC-A11Y-NON-COLOR-CUES`](accessibility-decisions.md#dec-a11y-non-color-cues) |

### Light & Dark Theme Policy

| Decision ID & Question | Answer | Expected Type & Constraints | Applicability & Status | Approval (`approved_by` / `approved_at`) | Related |
|---|---|---|---|---|---|
| <a id="dec-fnd-theme-policy"></a>**`DEC-FND-THEME-POLICY` — Color Scheme Policy (Light-Only vs System Dark vs Manual Toggle)**<br>Should BiteShark support a single light color scheme, respect OS prefers-color-scheme, or offer a user-selectable theme preference? |  | **Type**: `enum_choice` **Allowed**: `light_only`, `system_prefers_color_scheme`, `user_toggle_with_system_default` *(or `ref:DEC-...`)* — Select one theme support policy across BiteShark surfaces. | `applicable` / **`unanswered`** |  | [`DEC-UNCONF-DARK-THEME-APPLICABILITY`](#dec-unconf-dark-theme-applicability) |

### Token Naming, Consolidation & Cascade

| Decision ID & Question | Answer | Expected Type & Constraints | Applicability & Status | Approval (`approved_by` / `approved_at`) | Related |
|---|---|---|---|---|---|
| <a id="dec-fnd-token-naming"></a>**`DEC-FND-TOKEN-NAMING` — Canonical CSS Custom Property Prefix & Naming Convention**<br>What single CSS custom-property prefix and naming hierarchy (replacing competing --trk-*, --pol-*, --bg-*, and unprefixed --coral/--cream declarations across 8 stylesheets) should BiteShark standardize on? |  | **Type**: `structured_spec` *(or `ref:DEC-...`)* — Object defining prefix, category segments (color, space, radius, shadow, font, z), and deprecation plan for legacy variable names. | `applicable` / **`unanswered`** |  |  |
| <a id="dec-fnd-cross-surface-token-sharing"></a>**`DEC-FND-CROSS-SURFACE-TOKEN-SHARING` — Shared vs Surface-Scoped Tokens Across App, Login, Admin & Policies**<br>Should public/index.html, public/login.html, public/admin.html, and public/policies/*.html import one shared base token stylesheet or maintain separate surface token layers? |  | **Type**: `enum_choice` **Allowed**: `single_shared_tokens_stylesheet`, `shared_core_plus_surface_overrides`, `isolated_per_entrypoint` *(or `ref:DEC-...`)* — Select the token architecture across the four HTML entrypoints. | `applicable` / **`unanswered`** |  | [`DEC-FND-TOKEN-NAMING`](#dec-fnd-token-naming) |

### Spacing & Sizing Scales

| Decision ID & Question | Answer | Expected Type & Constraints | Applicability & Status | Approval (`approved_by` / `approved_at`) | Related |
|---|---|---|---|---|---|
| <a id="dec-fnd-spacing-scale"></a>**`DEC-FND-SPACING-SCALE` — Approved Spacing Scale**<br>What discrete spacing scale steps (in px or rem) should be approved for component padding, element gaps, and section rhythm? |  | **Type**: `token_map` (unit `px_or_rem`) *(or `ref:DEC-...`)* — Ordered map of spacing token names to CSS length values (0 permitted for zero-gap reset). | `applicable` / **`unanswered`** |  |  |
| <a id="dec-fnd-sizing-scale"></a>**`DEC-FND-SIZING-SCALE` — Interactive Control Height & Icon Sizing Scale**<br>What standard control heights (compact, default, prominent — respecting the &gt;=44px touch target floor where applicable) and icon dimensions should be approved? |  | **Type**: `token_map` (unit `px`) *(or `ref:DEC-...`)* — Map of control-height and icon-size tokens to pixel/rem dimensions. | `applicable` / **`unanswered`** |  | [`DEC-A11Y-TARGET-SIZE-GAP`](accessibility-decisions.md#dec-a11y-target-size-gap) |

### Borders, Radii, Elevation & Z-Index

| Decision ID & Question | Answer | Expected Type & Constraints | Applicability & Status | Approval (`approved_by` / `approved_at`) | Related |
|---|---|---|---|---|---|
| <a id="dec-fnd-border-scale"></a>**`DEC-FND-BORDER-SCALE` — Border Width & Divider Style Policy**<br>What border widths and divider treatments (hairline border vs subtle surface contrast vs dashed/accent borders) should separate cards, inputs, and sections? |  | **Type**: `token_map` *(or `ref:DEC-...`)* — Map of border width/style tokens (0 allowed if borderless cards are chosen). | `applicable` / **`unanswered`** |  |  |
| <a id="dec-fnd-radius-scale"></a>**`DEC-FND-RADIUS-SCALE` — Corner Radius Scale**<br>What corner radius tokens should govern pills/chips, inputs, buttons, cards, modals, and sheets? |  | **Type**: `token_map` (unit `px`) *(or `ref:DEC-...`)* — Map of radius tiers (e.g. xs, sm, md, lg, pill) to CSS length values. | `applicable` / **`unanswered`** |  |  |
| <a id="dec-fnd-elevation-scale"></a>**`DEC-FND-ELEVATION-SCALE` — Shadow & Elevation Scale**<br>What box-shadow tiers (flat/0, resting card, sticky chrome, dropdown popover, modal dialog, toast) should be used? |  | **Type**: `token_map` *(or `ref:DEC-...`)* — Map of elevation token names to CSS box-shadow values ("none" permitted for flat surfaces). | `applicable` / **`unanswered`** |  |  |
| <a id="dec-fnd-zindex-scale"></a>**`DEC-FND-ZINDEX-SCALE` — Canonical Z-Index Stacking Order**<br>What ordered z-index scale should govern map panes, discovery toolbar, sticky header/role banner, dropdowns, bottom nav, all modal families (resolving .modal-backdrop vs .rx-modal-backdrop inversion), and toasts? |  | **Type**: `token_map` *(or `ref:DEC-...`)* — Ordered map of stacking layer names to integer z-index values. | `applicable` / **`unanswered`** |  |  |

### Density

| Decision ID & Question | Answer | Expected Type & Constraints | Applicability & Status | Approval (`approved_by` / `approved_at`) | Related |
|---|---|---|---|---|---|
| <a id="dec-fnd-density-tiers"></a>**`DEC-FND-DENSITY-TIERS` — Information Density Policy by Surface**<br>What density rules should distinguish customer mobile browsing, vendor shift-time controls, and high-density Admin Portal queues/tables? |  | **Type**: `structured_spec` *(or `ref:DEC-...`)* — Specification of target row heights, padding multipliers, and visible metadata limits per surface. | `applicable` / **`unanswered`** |  |  |

---

## Component Design Questionnaires (1)

### <a id="cmp-unconf-dark-color-scheme"></a>`CMP-UNCONF-DARK-COLOR-SCHEME` — Dark Theme / Automatic prefers-color-scheme Surface Mode (Unconfirmed)

> [!NOTE]
> **Unconfirmed Applicability (`unconfirmed`)**: No dark color scheme or prefers-color-scheme: dark stylesheet exists on working/biteshark-vps. Confirm whether BiteShark will remain single warm-light palette or support a dark mode. *(Not implied as active on `working/biteshark-vps`.)*

- **Applicability**: `unconfirmed` · **Evidence Level**: `unconfirmed_future_or_branch`
- **Screens / Surfaces**: `Unconfirmed (all surfaces if adopted)`
- **User Roles**: `Anonymous Visitor`, `Customer`, `Vendor Staff`, `Vendor Owner`, `Admin: Mod`, `Admin: Top`
- **Selectors**: *(none — unconfirmed / not present on active branch)*
- **DOM IDs**: *(dynamic or none)*
- **Definition Files**: *(unconfirmed)*
- **Definition Symbols**: *(declarative HTML/CSS only or unconfirmed)*
- **Observed Existing Variants**: *(none observed)*
- **Observed Existing States**: *(none observed)*
- **Related Feature Keys**: *(always-on / not feature-gated)*
- **Source & Handbook Records**: [UI-AND-CONTENT-GUIDE.md](../UI-AND-CONTENT-GUIDE.md)
- **Unresolved References & Known Cascade/DOM Caveats**: Not implemented on working/biteshark-vps.

#### Blank Design Decisions for `CMP-UNCONF-DARK-COLOR-SCHEME` (2)

| Decision ID & Question | Answer | Expected Type & Constraints | Applicability & Status | Approval (`approved_by` / `approved_at`) | Related |
|---|---|---|---|---|---|
| <a id="dec-unconf-dark-theme-applicability"></a>**`DEC-UNCONF-DARK-THEME-APPLICABILITY` — Confirm Whether Dark Color Scheme Applies to BiteShark**<br>Should BiteShark define and implement a dark color scheme, or mark CMP-UNCONF-DARK-COLOR-SCHEME explicitly not_applicable with a recorded reason?<br>*Applicability note*: Dark mode is not implemented on working/biteshark-vps. |  | **Type**: `boolean` *(or `ref:DEC-...`)* — Boolean (true if dark mode will be designed/supported; or mark status="not_applicable" with reason if BiteShark stays light-only). | `unconfirmed` / **`unanswered`** |  | [`DEC-FND-THEME-POLICY`](#dec-fnd-theme-policy) |
| <a id="dec-unconf-dark-theme-tokens"></a>**`DEC-UNCONF-DARK-THEME-TOKENS` — Dark Mode Surface, Ink, Map Tile & Elevation Mapping (If Applicable)**<br>If dark mode applies, what dark surface, text, semantic status, and map-tile brightness rules should be used?<br>*Applicability note*: Depends on confirming DEC-UNCONF-DARK-THEME-APPLICABILITY. |  | **Type**: `token_map` *(or `ref:DEC-...`)* — Dark-scheme token overrides (or mark not_applicable if light-only). | `unconfirmed` / **`unanswered`** |  | [`DEC-UNCONF-DARK-THEME-APPLICABILITY`](#dec-unconf-dark-theme-applicability) |

