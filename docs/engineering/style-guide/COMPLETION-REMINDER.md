# Design Style Guide — Completion Reminder & Gap Report

> [!NOTE]
> **Generated from Structured Source ([decisions.json](decisions.json))** — Do not edit answers directly in Markdown.
> Update `docs/engineering/style-guide/decisions.json` and run `npm run style-guide:generate` (verified by `npm run style-guide:validate`).
> - **Generator**: `biteshark-style-guide@1.0.0` (`biteshark.style-guide-decisions.v1`)
> - **Decisions Source Digest**: `6ca6ad2afe647b1bb681bf8b3167fa105f60151da370936266954f1e8626a121`

> [!WARNING]
> **Unfinished Style Guide — Zero Design Parameters Approved (`0 / 773`)**
> **No design parameters, colors, dimensions, fonts, wording rules, or interaction behaviors in this style guide have been approved yet.**
> Every field in [decisions.json](decisions.json) is intentionally `null` for Matt and Yaman to answer and approve.
> - **Do not** invent approved values or copy existing CSS values into blank decision fields.
> - Before starting UI-related work, check the relevant topic below and remind Matt and Yaman only of the unanswered choices that materially affect the current task.
> - Preserve mandatory security, privacy, accessibility, and Sonoma truthfulness invariants ([README.md](README.md#2-mandatory-requirements-that-remain-active-at-all-times)) at all times.

## 1. Initial Unanswered Summary by Topic

| Topic Questionnaire | Applicable Unanswered | Unconfirmed Applicability | Draft (Unapproved) | Approved | Explicitly N/A | Total |
|---|---:|---:|---:|---:|---:|---:|
| [Foundations & Design Tokens](foundations.md) | **15** | **2** | 0 | 0 | 0 | 17 |
| [Typography & Text Hierarchy](typography.md) | **12** | **0** | 0 | 0 | 0 | 12 |
| [Layout, Grids & Responsive Behavior](layout-and-responsive.md) | **8** | **0** | 0 | 0 | 0 | 8 |
| [Navigation, Wayfinding & Role Switching](navigation.md) | **113** | **0** | 0 | 0 | 0 | 113 |
| [Forms, Inputs & Validation](forms-and-inputs.md) | **58** | **1** | 0 | 0 | 0 | 59 |
| [Buttons, Links & Destructive Actions](buttons-and-actions.md) | **30** | **0** | 0 | 0 | 0 | 30 |
| [Cards, Listings, Badges, Tables & Pagination](cards-and-listings.md) | **111** | **0** | 0 | 0 | 0 | 111 |
| [Dialogs, Sheets, Popovers & Disclosures](dialogs-and-overlays.md) | **57** | **1** | 0 | 0 | 0 | 58 |
| [Feedback, Banners, Loading & Recovery States](feedback-and-status.md) | **31** | **0** | 0 | 0 | 0 | 31 |
| [Imagery, Fallbacks, Illustrations & Icons](imagery-and-icons.md) | **30** | **0** | 0 | 0 | 0 | 30 |
| [Maps, Markers, Area Selection & Location Confidence](maps-and-location.md) | **30** | **2** | 0 | 0 | 0 | 32 |
| [Domain & Specialized Role Interfaces](domain-components.md) | **241** | **8** | 0 | 0 | 0 | 249 |
| [Accessibility Presentation Decisions](accessibility-decisions.md) | **8** | **0** | 0 | 0 | 0 | 8 |
| [Content, Voice, Formatting & Truthful Disclosures](content-and-language.md) | **8** | **0** | 0 | 0 | 0 | 8 |
| [Motion, Micro-Interactions & Reduced Motion](motion-and-interaction.md) | **7** | **0** | 0 | 0 | 0 | 7 |
| **Total** | **759** | **14** | **0** | **0** | **0** | **773** |

---

## 2. Unconfirmed Applicability Decisions (14)

Confirm whether each item below applies to BiteShark (set `applicability: "applicable"` to answer, or set `status: "not_applicable"` + `applicability: "not_applicable"` with an explicit `not_applicable_reason`):

### [Foundations & Design Tokens](foundations.md) (2)

- **`CMP-UNCONF-DARK-COLOR-SCHEME` — [Dark Theme / Automatic prefers-color-scheme Surface Mode (Unconfirmed)](foundations.md#cmp-unconf-dark-color-scheme) (2)**:
  - [`DEC-UNCONF-DARK-THEME-APPLICABILITY`](foundations.md#dec-unconf-dark-theme-applicability) — **Confirm Whether Dark Color Scheme Applies to BiteShark** — *Confirm applicability*: Dark mode is not implemented on working/biteshark-vps.
  - [`DEC-UNCONF-DARK-THEME-TOKENS`](foundations.md#dec-unconf-dark-theme-tokens) — **Dark Mode Surface, Ink, Map Tile & Elevation Mapping (If Applicable)** — *Confirm applicability*: Depends on confirming DEC-UNCONF-DARK-THEME-APPLICABILITY.

### [Forms, Inputs & Validation](forms-and-inputs.md) (1)

- **Topic-Level Decisions (1)**:
  - [`DEC-FRM-PASSKEY-CONTROL-SCOPE`](forms-and-inputs.md#dec-frm-passkey-control-scope) — **Passkey / WebAuthn Sign-In UI Presence While Feature Is Disabled** — *Confirm applicability*: Feature control passkey_webauthn is currently disabled by default in lib/feature-controls.js.

### [Dialogs, Sheets, Popovers & Disclosures](dialogs-and-overlays.md) (1)

- **Topic-Level Decisions (1)**:
  - [`DEC-OVL-TOOLTIP-COMPONENT-SCOPE`](dialogs-and-overlays.md#dec-ovl-tooltip-component-scope) — **Custom Tooltip Component Applicability** — *Confirm applicability*: No custom tooltip component exists in current HTML/CSS/JS; touch-first mobile surfaces cannot hover.

### [Maps, Markers, Area Selection & Location Confidence](maps-and-location.md) (2)

- **`CMP-UNCONF-MINIATURE-TRUCK-MARKERS` — [Illustrated Cuisine SVG Truck Map Markers & Cluster Menus (Branch Candidate)](maps-and-location.md#cmp-unconf-miniature-truck-markers) (2)**:
  - [`DEC-UNCONF-TRUCK-MARKERS-APPLICABILITY`](maps-and-location.md#dec-unconf-truck-markers-applicability) — **Confirm Whether Illustrated Cuisine SVG Map Markers Apply** — *Confirm applicability*: Exists on antigravity/staging2-latest (map-cards.js), not merged to working/biteshark-vps.
  - [`DEC-UNCONF-TRUCK-MARKERS-STYLE-DISCLOSURE`](maps-and-location.md#dec-unconf-truck-markers-style-disclosure) — **Illustrated Map Marker Sizing, Selection State & Disclosure Placement (If Applicable)** — *Confirm applicability*: Depends on confirming DEC-UNCONF-TRUCK-MARKERS-APPLICABILITY.

### [Domain & Specialized Role Interfaces](domain-components.md) (8)

- **`CMP-UNCONF-CUSTOMER-PROFILE-SHARING` — [Private Customer Profile Dashboard, Curated "Greatest Hits" & Unlisted /s/&lt;token&gt; Share Page (Branch Candidate)](domain-components.md#cmp-unconf-customer-profile-sharing) (2)**:
  - [`DEC-UNCONF-PROFILE-SHARING-APPLICABILITY`](domain-components.md#dec-unconf-profile-sharing-applicability) — **Confirm Applicability of Customer Profile, Greatest Hits & Unlisted Sharing** — *Confirm applicability*: Implemented on candidate branch feature/private-profiles-greatest-hits (PR #4), not yet merged to working/biteshark-vps.
  - [`DEC-UNCONF-PROFILE-SHARING-VISUAL-SPEC`](domain-components.md#dec-unconf-profile-sharing-visual-spec) — **Private Dashboard vs Unlisted Shared Collection Visual Differentiation (If Applicable)** — *Confirm applicability*: Depends on confirming DEC-UNCONF-PROFILE-SHARING-APPLICABILITY.
- **`CMP-UNCONF-PUBLIC-PHOTO-MODERATION` — [Public Vendor Menu/Listing Photo Upload & Rights Verification UI (Disabled Flag)](domain-components.md#cmp-unconf-public-photo-moderation) (2)**:
  - [`DEC-UNCONF-PUBLIC-PHOTOS-APPLICABILITY`](domain-components.md#dec-unconf-public-photos-applicability) — **Confirm Applicability of Public Vendor Menu/Listing Photo Upload UI** — *Confirm applicability*: owner_menu_photo_upload is disabled by default; #ownerScreen only previews local files in-tab.
  - [`DEC-UNCONF-PUBLIC-PHOTOS-RIGHTS-UX`](domain-components.md#dec-unconf-public-photos-rights-ux) — **Vendor Photo Rights Attestation & Pending-Approval State UX (If Applicable)** — *Confirm applicability*: Depends on confirming DEC-UNCONF-PUBLIC-PHOTOS-APPLICABILITY.
- **`CMP-DOM-LEGAL-POLICIES` — [Preliminary Legal & Policy Pages, Draft Banners & Unresolved Callouts (/policies/*.html)](domain-components.md#cmp-dom-legal-policies) (4)**:
  - [`DEC-LEGAL-LOAD`](domain-components.md#dec-legal-load) — **CMP-DOM-LEGAL-POLICIES: Loading & Pending Behavior** — *Confirm applicability*: /policies/*.html currently runs zero client JavaScript; confirm whether interactive search/acknowledgment states will ever exist here or mark not_applicable with a reason.
  - [`DEC-LEGAL-ERR`](domain-components.md#dec-legal-err) — **CMP-DOM-LEGAL-POLICIES: Validation & Error Presentation** — *Confirm applicability*: /policies/*.html currently runs zero client JavaScript; confirm whether interactive search/acknowledgment states will ever exist here or mark not_applicable with a reason.
  - [`DEC-LEGAL-DISAB`](domain-components.md#dec-legal-disab) — **CMP-DOM-LEGAL-POLICIES: Disabled, Paused & Unavailable Presentation** — *Confirm applicability*: /policies/*.html currently runs zero client JavaScript; confirm whether interactive search/acknowledgment states will ever exist here or mark not_applicable with a reason.
  - [`DEC-LEGAL-OK`](domain-components.md#dec-legal-ok) — **CMP-DOM-LEGAL-POLICIES: Success & Confirmation Feedback** — *Confirm applicability*: /policies/*.html currently runs zero client JavaScript; confirm whether interactive search/acknowledgment states will ever exist here or mark not_applicable with a reason.

---

## 3. Grouped Unanswered Questionnaires

All **759** applicable decisions currently have `status: "unanswered"` and `value: null`. Open the relevant questionnaire directly:

- **[Foundations & Design Tokens (`foundations.md`)](foundations.md)** — **15** applicable unanswered, **2** unconfirmed
- **[Typography & Text Hierarchy (`typography.md`)](typography.md)** — **12** applicable unanswered
- **[Layout, Grids & Responsive Behavior (`layout-and-responsive.md`)](layout-and-responsive.md)** — **8** applicable unanswered
- **[Navigation, Wayfinding & Role Switching (`navigation.md`)](navigation.md)** — **113** applicable unanswered · Components: [`CMP-NAV-TOPBAR`](navigation.md#cmp-nav-topbar), [`CMP-NAV-BOTTOM-BAR`](navigation.md#cmp-nav-bottom-bar), [`CMP-NAV-TABS-SWITCHES`](navigation.md#cmp-nav-tabs-switches), [`CMP-NAV-ROLE-BANNER`](navigation.md#cmp-nav-role-banner)
- **[Forms, Inputs & Validation (`forms-and-inputs.md`)](forms-and-inputs.md)** — **58** applicable unanswered, **1** unconfirmed · Components: [`CMP-FORM-CONTROLS`](forms-and-inputs.md#cmp-form-controls), [`CMP-FORM-UPLOAD-OTP`](forms-and-inputs.md#cmp-form-upload-otp)
- **[Buttons, Links & Destructive Actions (`buttons-and-actions.md`)](buttons-and-actions.md)** — **30** applicable unanswered · Components: [`CMP-BTN-ACTIONS`](buttons-and-actions.md#cmp-btn-actions)
- **[Cards, Listings, Badges, Tables & Pagination (`cards-and-listings.md`)](cards-and-listings.md)** — **111** applicable unanswered · Components: [`CMP-CARD-DISCOVERY`](cards-and-listings.md#cmp-card-discovery), [`CMP-CARD-DETAIL`](cards-and-listings.md#cmp-card-detail), [`CMP-CHIPS-BADGES`](cards-and-listings.md#cmp-chips-badges), [`CMP-DATA-TABLES-PAGERS`](cards-and-listings.md#cmp-data-tables-pagers)
- **[Dialogs, Sheets, Popovers & Disclosures (`dialogs-and-overlays.md`)](dialogs-and-overlays.md)** — **57** applicable unanswered, **1** unconfirmed · Components: [`CMP-DIALOG-MODAL`](dialogs-and-overlays.md#cmp-dialog-modal), [`CMP-DRAWER-DISCLOSURE`](dialogs-and-overlays.md#cmp-drawer-disclosure)
- **[Feedback, Banners, Loading & Recovery States (`feedback-and-status.md`)](feedback-and-status.md)** — **31** applicable unanswered · Components: [`CMP-FEEDBACK-NOTICES`](feedback-and-status.md#cmp-feedback-notices)
- **[Imagery, Fallbacks, Illustrations & Icons (`imagery-and-icons.md`)](imagery-and-icons.md)** — **30** applicable unanswered · Components: [`CMP-MEDIA-VISUALS`](imagery-and-icons.md#cmp-media-visuals)
- **[Maps, Markers, Area Selection & Location Confidence (`maps-and-location.md`)](maps-and-location.md)** — **30** applicable unanswered, **2** unconfirmed · Components: [`CMP-MAP-SURFACE`](maps-and-location.md#cmp-map-surface)
- **[Domain & Specialized Role Interfaces (`domain-components.md`)](domain-components.md)** — **241** applicable unanswered, **8** unconfirmed · Components: [`CMP-DOM-ONBOARDING`](domain-components.md#cmp-dom-onboarding), [`CMP-DOM-BOOKINGS`](domain-components.md#cmp-dom-bookings), [`CMP-DOM-PAGER`](domain-components.md#cmp-dom-pager), [`CMP-DOM-COMMUNITY`](domain-components.md#cmp-dom-community), [`CMP-DOM-EXPLORATION`](domain-components.md#cmp-dom-exploration), [`CMP-DOM-VENDOR-OPS`](domain-components.md#cmp-dom-vendor-ops), [`CMP-DOM-SUPPORT`](domain-components.md#cmp-dom-support), [`CMP-DOM-ADMIN-PORTAL`](domain-components.md#cmp-dom-admin-portal), [`CMP-DOM-LEGAL-POLICIES`](domain-components.md#cmp-dom-legal-policies)
- **[Accessibility Presentation Decisions (`accessibility-decisions.md`)](accessibility-decisions.md)** — **8** applicable unanswered
- **[Content, Voice, Formatting & Truthful Disclosures (`content-and-language.md`)](content-and-language.md)** — **8** applicable unanswered
- **[Motion, Micro-Interactions & Reduced Motion (`motion-and-interaction.md`)](motion-and-interaction.md)** — **7** applicable unanswered

Refresh command after recording explicit answers in [decisions.json](decisions.json):
```bash
npm run style-guide:generate && npm run style-guide:validate
```
