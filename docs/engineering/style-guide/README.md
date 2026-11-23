# BiteShark Design Style Guide & Decision Questionnaire

> [!WARNING]
> **Persistent Assistant & Developer Reminder**:
> The design style guide is intentionally unfinished. Do not invent approved style decisions or fill blank fields from existing CSS. Before work affected by this guide, inspect its completion report ([COMPLETION-REMINDER.md](COMPLETION-REMINDER.md)). Remind Matt and Yaman of the unanswered decisions relevant to the current task. After explicit answers are recorded, refresh the reminder so it lists the remaining unanswered or unapproved items.

> [!NOTE]
> **Generated from Structured Source ([decisions.json](decisions.json))** — Do not edit answers directly in Markdown.
> Update `docs/engineering/style-guide/decisions.json` and run `npm run style-guide:generate` (verified by `npm run style-guide:validate`).
> - **Generator**: `biteshark-style-guide@1.0.0` (`biteshark.style-guide-decisions.v1`)
> - **Decisions Source Digest**: `6ca6ad2afe647b1bb681bf8b3167fa105f60151da370936266954f1e8626a121`

---

## 1. Purpose & Two-Layer Architecture

This directory is a **structured design decision questionnaire and UI inventory** for Matt and Yaman to complete incrementally alongside the [Shared Engineering Handbook](../README.md). Its initial blank state (`null` machine-readable values and empty answer cells) is **intentional**:

1. **Layer 1 — Observed UI Inventory ([ui-element-inventory.md](ui-element-inventory.md))**:
   - Records BiteShark's actual UI components, selectors, DOM IDs, source files/symbols, screens, user roles (`Anonymous Visitor`, `Customer`, `Vendor Staff`, `Vendor Owner`, `Admin: Mod`, `Admin: Top`), existing variants/states, feature keys, handbook links, evidence levels, and unresolved CSS/DOM issues.
   - Observed implementation facts describe what current code on `working/biteshark-vps (via handbook baseline)` does today — they are **not** approved design specifications.
   - Capabilities that exist only on unmerged branches or represent potential future scope are marked `unconfirmed` rather than implied as active.
2. **Layer 2 — Blank / Tracked Design Decisions ([decisions.json](decisions.json) & Topic Questionnaires)**:
   - Single structured source of truth in [decisions.json](decisions.json) validated against [style-guide-decisions.schema.json](../schemas/style-guide-decisions.schema.json).
   - Every unanswered value is `null` in JSON and rendered as an empty **Answer** cell in Markdown.
   - Shared tokens or upstream choices can be referenced with `ref:<DECISION_ID>` instead of duplicating values.

---

## 2. Mandatory Requirements That Remain Active At All Times

> [!IMPORTANT]
> **Blank design choices never suspend mandatory security, privacy, accessibility, or truthful-content rules.**
> Do not treat unanswered style-guide fields as permission to weaken existing obligations, and never label unanswered accessibility fields as accessibility compliance.

| Invariant ID | Category | Non-Optional Requirement | Authoritative Docs |
|---|---|---|---|
| `INV-SEC-RBAC-RLS` | `security_and_permissions` | **Server-Enforced RBAC, Vendor Ownership, CSRF & Row-Level Security** — UI role switches, hidden buttons, and viewpoint previews are convenience affordances only; backend routes must enforce live row-locked RBAC (Customer, Vendor Staff, Vendor Owner, Admin: Mod, Admin: Top), CSRF checks, and PostgreSQL FORCE ROW LEVEL SECURITY GUCs. | [AUTH-AND-PERMISSIONS.md](../AUTH-AND-PERMISSIONS.md), [DATA-MODEL.md](../DATA-MODEL.md), [API-CONTRACTS.md](../API-CONTRACTS.md) |
| `INV-PRIV-AGE-MINIMIZATION` | `privacy_and_age_policy` | **14+ Age Eligibility, Derived-Only DOB Storage & Private Data Isolation** — Accounts require 14+ Pacific-time eligibility without storing raw birthdates; customer visit notes and private photos remain private to the owning account with EXIF stripped; diagnostics and logs never expose secrets, OTPs, cookies, or raw PII. | [AUTH-AND-PERMISSIONS.md](../AUTH-AND-PERMISSIONS.md), [STORAGE-AND-FILES.md](../STORAGE-AND-FILES.md), [DIAGNOSTICS-AND-ERRORS.md](../DIAGNOSTICS-AND-ERRORS.md), [privacy.html](../../../public/policies/privacy.html) |
| `INV-A11Y-KEYBOARD-FOCUS-ZOOM` | `accessibility_floor` | **Keyboard Operability, Visible Focus, Pinch-Zoom & Live Announcements** — Every interactive control must remain keyboard-reachable with a visible, usable focus indicator; modals must manage focus and Escape dismissal; viewport pinch-zoom must never be disabled; dynamic errors and status changes must be announced accessibly. Unanswered visual parameters are never labeled as accessibility compliance. | [ACCESSIBILITY.md](../ACCESSIBILITY.md), [accessibility.html](../../../public/policies/accessibility.html) |
| `INV-TRUTH-SONOMA-DISCLOSURES` | `truthful_content_and_legal` | **Sonoma County Truthfulness, Non-Fabricated Status & Draft Policy Honesty** — Never fabricate star ratings, review counts, verified statuses, live locations, stock photos, instant reservations, or legal sign-off. Distinguish verified vendor data from unclaimed/estimated directory info, label illustrations honestly, and retain draft legal notices until approved in Readiness. | [UI-AND-CONTENT-GUIDE.md](../UI-AND-CONTENT-GUIDE.md), [legal-and-readiness.md](../domains/legal-and-readiness.md), [index.html](../../../public/policies/index.html) |

---

## 3. Coding Assistant Protocol (Before, During & After Partial Completion)

Any coding assistant (Antigravity, GPT / Codex, or CLI agent) working on UI, frontend markup, styles, copy, or UX flows **must**:

1. **Inspect actual decision state**: Check [COMPLETION-REMINDER.md](COMPLETION-REMINDER.md) and the relevant topic file(s) before proposing or implementing UI changes.
2. **Identify task-relevant gaps only**: Note unanswered (`unanswered`), unapproved (`draft`), or `unconfirmed` decisions that directly affect the current task. Keep reminders concise; never dump the entire unfinished guide into routine responses or block backend/security fixes over unrelated style questions.
3. **Ask when work materially depends on an unanswered choice**: Request an explicit decision from Matt or Yaman when layout, visual treatment, copy, or interaction materially depends on a blank field.
4. **Continue independent work**: Proceed with backend, database, security, test, or orthogonal UI work that does not depend on the unanswered design choice. Preserve existing UI conventions ([UI-AND-CONTENT-GUIDE.md](../UI-AND-CONTENT-GUIDE.md)) for routine maintenance until new decisions are approved, and clearly label any temporary UI choice as unapproved.
5. **Record only explicit team answers**: Write answers to [decisions.json](decisions.json) **only** when explicitly supplied or approved by Matt or Yaman (`status: "draft"` when proposed/recorded without final sign-off; `status: "approved"` with `approved_by` and `approved_at` only when explicitly approved; `status: "not_applicable"` only with an explicit `not_applicable_reason`).
6. **Refresh generated files after authorized edits**: Run `npm run style-guide:generate && npm run style-guide:validate` (and `npm run registry:docs && npm run registry:validate` when handbook indexes change) so [COMPLETION-REMINDER.md](COMPLETION-REMINDER.md) reflects the exact remaining gaps.
7. **Read-only sessions**: If operating in a read-only sandbox where files cannot be updated, report clearly if [COMPLETION-REMINDER.md](COMPLETION-REMINDER.md) is stale instead of silently editing files.
8. **Never infer approval**: Never infer an approved design decision from existing CSS declarations, mockups, screenshots, or assistant-generated suggestions.

---

## 4. Questionnaires & Live Completion Snapshot

- **Current Lifecycle State**: `initial_unstarted` (**0** approved · **0** explicitly not applicable · **0** draft awaiting approval · **759** applicable unanswered · **14** unconfirmed applicability · **773** total)
- **[Completion Reminder & Outstanding Gaps (`COMPLETION-REMINDER.md`)](COMPLETION-REMINDER.md)**
- **[Observed UI Element Inventory (`ui-element-inventory.md`)](ui-element-inventory.md)**

| # | Questionnaire | Scope | Applicable Unanswered | Unconfirmed | Draft | Approved | N/A | Total |
|---:|---|---|---:|---:|---:|---:|---:|---:|
| 1 | [Foundations & Design Tokens](foundations.md) | Brand attributes, semantic and surface color roles, light/dark theme policy, CSS token naming and consolidation, spacing/sizing scales, borders/radii/elevation, z-index layering, and density. | 15 | 2 | 0 | 0 | 0 | 17 |
| 2 | [Typography & Text Hierarchy](typography.md) | Font families and fallbacks across customer, vendor, admin, and policy surfaces, weights, semantic text roles, type scale/line-height/tracking, link and emphasis treatments, and long-name wrapping. | 12 | 0 | 0 | 0 | 0 | 12 |
| 3 | [Layout, Grids & Responsive Behavior](layout-and-responsive.md) | Container widths, grids, gutters, breakpoints, mobile safe-area insets, sticky/fixed region budgets, page vs pane scrolling, and 200%-400% zoom reflow. | 8 | 0 | 0 | 0 | 0 | 8 |
| 4 | [Navigation, Wayfinding & Role Switching](navigation.md) | Top header, mobile bottom navigation, segmented switches and tabs, account/overflow dropdowns, back/history behavior, active states, role/viewpoint switching, and feature-hidden navigation. | 113 | 0 | 0 | 0 | 0 | 113 |
| 5 | [Forms, Inputs & Validation](forms-and-inputs.md) | Text inputs, search fields, textareas, selects, searchable pickers, checkboxes/radios/switches, date/time/range inputs, file uploads, 14+ DOB & OTP inputs, labels, help text, validation, and submission/retry states. | 58 | 1 | 0 | 0 | 0 | 59 |
| 6 | [Buttons, Links & Destructive Actions](buttons-and-actions.md) | Primary/secondary/ghost/danger/icon buttons, width behavior across layouts, button-vs-link rules, loading/disabled states, and destructive confirmation patterns. | 30 | 0 | 0 | 0 | 0 | 30 |
| 7 | [Cards, Listings, Badges, Tables & Pagination](cards-and-listings.md) | Unified horizontal listing cards and compact variants, business detail views, favorites, chips/tags/status/role badges, admin data tables, search/filter/sort bars, and pagination/incremental loading. | 111 | 0 | 0 | 0 | 0 | 111 |
| 8 | [Dialogs, Sheets, Popovers & Disclosures](dialogs-and-overlays.md) | Modal dialogs across main app, role-experience, and admin portal, map/list sheet, inline &lt;details&gt; disclosures, dropdown popovers, stacking rules, and unconfirmed tooltip policy. | 57 | 1 | 0 | 0 | 0 | 58 |
| 9 | [Feedback, Banners, Loading & Recovery States](feedback-and-status.md) | Toasts, banners, inline notices, skeletons/spinners, empty/error/offline states, sign-in/session-expiry prompts, and feature-paused or disabled messaging. | 31 | 0 | 0 | 0 | 0 | 31 |
| 10 | [Imagery, Fallbacks, Illustrations & Icons](imagery-and-icons.md) | Approved vendor photos, unverified-listing fallback badges, editorial illustrations, private customer photos, mascot characters, and icon system consolidation. | 30 | 0 | 0 | 0 | 0 | 30 |
| 11 | [Maps, Markers, Area Selection & Location Confidence](maps-and-location.md) | Interactive Leaflet map, pin states, overlap/clustering, legends and illustration disclosures, live vs estimated vs coarse town location confidence, manual area picker, and map-unavailable fallback. | 30 | 2 | 0 | 0 | 0 | 32 |
| 12 | [Domain & Specialized Role Interfaces](domain-components.md) | Onboarding, event inquiries, pickup pagers, community & moderation, stories/visit journal/private photos/badges/trails, vendor operations, support threads, admin portal/Feature Controls/diagnostics/readiness, legal policy drafts, and unconfirmed candidate features. | 241 | 8 | 0 | 0 | 0 | 249 |
| 13 | [Accessibility Presentation Decisions](accessibility-decisions.md) | Visual focus ring parameters, contrast targets at or above WCAG AA, target sizing/spacing above 44px floor, skip-link appearance, non-color cues, and announcement verbosity (while preserving mandatory accessibility invariants). | 8 | 0 | 0 | 0 | 0 | 8 |
| 14 | [Content, Voice, Formatting & Truthful Disclosures](content-and-language.md) | Voice and tone by surface, capitalization and action labels, Pacific date/time formatting, Imperial distance/unit formatting, privacy disclosures, verified vs self-reported labeling, and error honesty. | 8 | 0 | 0 | 0 | 0 | 8 |
| 15 | [Motion, Micro-Interactions & Reduced Motion](motion-and-interaction.md) | Permitted motion roles, duration and easing scales, screen/modal/sheet transitions, favorite/pager micro-interactions, prefers-reduced-motion behavior, and programmatic scroll behavior. | 7 | 0 | 0 | 0 | 0 | 7 |

---

## 5. How to Record Answers & Refresh the Guide

1. Use the **Admin Portal -> 🎨 Style Guide** workspace (`/admin#style-guide`) to fill in answers, add optional notes, view populated hosted Markdown sections, and push directly to the repository — or edit `docs/engineering/style-guide/decisions.json` for the target `DEC-*` entry:
   - **Draft answer (awaiting sign-off)**: set `"applicability": "applicable"`, `"status": "draft"`, and `"value": <answer or "ref:DEC-...">`.
   - **Approved answer**: set `"applicability": "applicable"`, `"status": "approved"`, `"value": <answer or "ref:DEC-...">`, and `"approval": { "approved_by": "<Name>", "approved_at": "YYYY-MM-DD" }`.
   - **Explicitly not applicable**: set `"applicability": "not_applicable"`, `"status": "not_applicable"`, `"value": null`, and `"not_applicable_reason": "<clear explanation>"`.
   - Placeholder strings (`"TBD"`, `"later"`, `"TODO"`, `"N/A"`) are rejected by validation; `0` and `false` are valid where numeric/boolean types apply.
2. Regenerate Markdown questionnaires and `COMPLETION-REMINDER.md`:
   ```bash
   npm run style-guide:generate
   npm run style-guide:validate
   ```
3. If also updating shared handbook pages or before opening a PR, refresh and validate the full handbook:
   ```bash
   npm run registry:docs
   npm run registry:validate
   ```
