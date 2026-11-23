# Style Guide Questionnaire — Typography & Text Hierarchy

> [!NOTE]
> **Generated from Structured Source ([decisions.json](decisions.json))** — Do not edit answers directly in Markdown.
> Update `docs/engineering/style-guide/decisions.json` and run `npm run style-guide:generate` (verified by `npm run style-guide:validate`).
> - **Generator**: `biteshark-style-guide@1.0.0` (`biteshark.style-guide-decisions.v1`)
> - **Decisions Source Digest**: `6ca6ad2afe647b1bb681bf8b3167fa105f60151da370936266954f1e8626a121`

- **Navigation**: [Style Guide README](README.md) · [Completion Reminder](COMPLETION-REMINDER.md) · [UI Element Inventory](ui-element-inventory.md)
- **Scope**: Font families and fallbacks across customer, vendor, admin, and policy surfaces, weights, semantic text roles, type scale/line-height/tracking, link and emphasis treatments, and long-name wrapping.
- **Topic Status**: **0** approved · **0** N/A · **0** draft · **12** applicable unanswered · **0** unconfirmed (**12** total)

> [!IMPORTANT]
> **Mandatory Constraints Preserved**: Blank answers below leave visual/editorial parameters open for Matt and Yaman to decide; they **never** relax the mandatory requirements below:
> - **`INV-A11Y-KEYBOARD-FOCUS-ZOOM` (Keyboard Operability, Visible Focus, Pinch-Zoom & Live Announcements)**: Every interactive control must remain keyboard-reachable with a visible, usable focus indicator; modals must manage focus and Escape dismissal; viewport pinch-zoom must never be disabled; dynamic errors and status changes must be announced accessibly. Unanswered visual parameters are never labeled as accessibility compliance. ([ACCESSIBILITY.md](../ACCESSIBILITY.md), [accessibility.html](../../../public/policies/accessibility.html))
> - **`INV-TRUTH-SONOMA-DISCLOSURES` (Sonoma County Truthfulness, Non-Fabricated Status & Draft Policy Honesty)**: Never fabricate star ratings, review counts, verified statuses, live locations, stock photos, instant reservations, or legal sign-off. Distinguish verified vendor data from unclaimed/estimated directory info, label illustrations honestly, and retain draft legal notices until approved in Readiness. ([UI-AND-CONTENT-GUIDE.md](../UI-AND-CONTENT-GUIDE.md), [legal-and-readiness.md](../domains/legal-and-readiness.md), [index.html](../../../public/policies/index.html))

---

## Topic-Level Design Decisions (12)

### Font Families, Delivery & Fallbacks

| Decision ID & Question | Answer | Expected Type & Constraints | Applicability & Status | Approval (`approved_by` / `approved_at`) | Related |
|---|---|---|---|---|---|
| <a id="dec-typ-display-family"></a>**`DEC-TYP-DISPLAY-FAMILY` — Display & Heading Font Family Stack**<br>What font family and fallback stack should be used for display titles and section headings? |  | **Type**: `string` *(or `ref:DEC-...`)* — Valid CSS font-family stack including generic fallback. | `applicable` / **`unanswered`** |  |  |
| <a id="dec-typ-body-family"></a>**`DEC-TYP-BODY-FAMILY` — Body, Form & UI Control Font Family Stack**<br>What font family and fallback stack should be used for body copy, buttons, inputs, labels, and tables? |  | **Type**: `string` *(or `ref:DEC-...`)* — Valid CSS font-family stack including generic fallback. | `applicable` / **`unanswered`** |  |  |
| <a id="dec-typ-mono-family"></a>**`DEC-TYP-MONO-FAMILY` — Monospace Font Family Stack for Codes, Ticket IDs & Correlation IDs**<br>What monospace font stack should render 6-digit OTPs, BS-XXXXXX support IDs, correlation IDs, and diagnostic fingerprints? |  | **Type**: `string` *(or `ref:DEC-...`)* — Valid CSS monospace font-family stack. | `applicable` / **`unanswered`** |  |  |
| <a id="dec-typ-font-delivery-policy"></a>**`DEC-TYP-FONT-DELIVERY-POLICY` — Webfont Self-Hosting vs System Font Policy**<br>Should BiteShark self-host WOFF2 webfonts in public/, rely on system font stacks only, or use another privacy-safe font loading strategy? |  | **Type**: `enum_choice` **Allowed**: `self_hosted_woff2`, `system_fonts_only`, `hybrid_self_hosted_customer_system_admin` *(or `ref:DEC-...`)* — Select one webfont hosting/privacy policy (no third-party tracking font CDNs). | `applicable` / **`unanswered`** |  |  |
| <a id="dec-typ-surface-font-parity"></a>**`DEC-TYP-SURFACE-FONT-PARITY` — Typography Parity Across Customer App, Login, Admin & Policy Pages**<br>Should Login, Admin Portal, and Legal Policy pages share the customer display/body fonts or intentionally use neutral system sans-serif? |  | **Type**: `structured_spec` *(or `ref:DEC-...`)* — Object mapping index.html, login.html, admin.html, and policies/*.html to their heading/body font role tokens. | `applicable` / **`unanswered`** |  | [`DEC-TYP-DISPLAY-FAMILY`](#dec-typ-display-family), [`DEC-TYP-BODY-FAMILY`](#dec-typ-body-family) |

### Weights, Scale & Semantic Roles

| Decision ID & Question | Answer | Expected Type & Constraints | Applicability & Status | Approval (`approved_by` / `approved_at`) | Related |
|---|---|---|---|---|---|
| <a id="dec-typ-weights"></a>**`DEC-TYP-WEIGHTS` — Approved Font Weights**<br>Which numeric font weights are permitted for regular body, medium UI labels, semibold subheadings/buttons, and bold display headings? |  | **Type**: `token_map` *(or `ref:DEC-...`)* — Map of weight role names to numeric CSS font-weight values (100-900). | `applicable` / **`unanswered`** |  |  |
| <a id="dec-typ-role-hierarchy"></a>**`DEC-TYP-ROLE-HIERARCHY` — Semantic Type Role Catalog**<br>What named typographic roles (hero, h1, h2, h3, card-title, body, body-sm, label, kicker/eyebrow, caption, badge) make up BiteShark’s type hierarchy? |  | **Type**: `structured_spec` *(or `ref:DEC-...`)* — Definition of each semantic type role and its intended usage. | `applicable` / **`unanswered`** |  |  |
| <a id="dec-typ-size-scale"></a>**`DEC-TYP-SIZE-SCALE` — Font Size, Line-Height & Letter-Spacing Scale (Mobile & Desktop)**<br>What font-size (rem/px), line-height, and letter-spacing values apply to each semantic type role across mobile and desktop viewports (including minimum &gt;=16px input font-size on iOS to prevent forced zoom if desired)? |  | **Type**: `structured_spec` *(or `ref:DEC-...`)* — Table/map of semantic type roles to mobile/desktop size, line-height, and tracking. | `applicable` / **`unanswered`** |  | [`DEC-TYP-ROLE-HIERARCHY`](#dec-typ-role-hierarchy) |
| <a id="dec-typ-numeric-alignment"></a>**`DEC-TYP-NUMERIC-ALIGNMENT` — Tabular vs Proportional Numerals Policy**<br>Where should font-variant-numeric: tabular-nums be enforced (distances, hours, KPI counts, OTP digits, timestamps, pagination)? |  | **Type**: `string_list` *(or `ref:DEC-...`)* — List of numeric UI contexts requiring tabular numerals. | `applicable` / **`unanswered`** |  |  |

### Links, Emphasis & Wrapping

| Decision ID & Question | Answer | Expected Type & Constraints | Applicability & Status | Approval (`approved_by` / `approved_at`) | Related |
|---|---|---|---|---|---|
| <a id="dec-typ-inline-links"></a>**`DEC-TYP-INLINE-LINKS` — Inline Text Link Styling & Underline Policy**<br>How should inline links inside paragraphs, banners, and legal disclosures be distinguished without relying on color alone (default underline, underline offset/thickness, hover/visited states)? |  | **Type**: `structured_spec` *(or `ref:DEC-...`)* — Specification of underline behavior, color role, and hover/focus/visited treatments. | `applicable` / **`unanswered`** |  |  |
| <a id="dec-typ-emphasis-treatment"></a>**`DEC-TYP-EMPHASIS-TREATMENT` — Editorial Accent Span & Handwritten Callout Policy**<br>Should decorative accent spans (.brand-pop, .handwritten) remain part of customer hero headers, and if so, under what restraint rules? |  | **Type**: `structured_spec` *(or `ref:DEC-...`)* — Policy on whether/where decorative display emphasis is permitted and maximum occurrences per screen. | `applicable` / **`unanswered`** |  |  |
| <a id="dec-typ-long-names-wrapping"></a>**`DEC-TYP-LONG-NAMES-WRAPPING` — Text Wrapping, Line-Clamping & Long Sonoma Business Name Rules**<br>How should long Sonoma County business names, bilingual dish titles, URLs, and town combinations wrap or clamp across cards, headers, selects, and detail modals? |  | **Type**: `structured_spec` *(or `ref:DEC-...`)* — Rules for wrapping vs clamping (max lines) and overflow-wrap behavior by surface. | `applicable` / **`unanswered`** |  |  |

