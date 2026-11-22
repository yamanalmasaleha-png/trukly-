# Style Guide Questionnaire — Content, Voice, Formatting & Truthful Disclosures

> [!NOTE]
> **Generated from Structured Source ([decisions.json](decisions.json))** — Do not edit answers directly in Markdown.
> Update `docs/engineering/style-guide/decisions.json` and run `npm run style-guide:generate` (verified by `npm run style-guide:validate`).
> - **Generator**: `biteshark-style-guide@1.0.0` (`biteshark.style-guide-decisions.v1`)
> - **Decisions Source Digest**: `6ca6ad2afe647b1bb681bf8b3167fa105f60151da370936266954f1e8626a121`

- **Navigation**: [Style Guide README](README.md) · [Completion Reminder](COMPLETION-REMINDER.md) · [UI Element Inventory](ui-element-inventory.md)
- **Scope**: Voice and tone by surface, capitalization and action labels, Pacific date/time formatting, Imperial distance/unit formatting, privacy disclosures, verified vs self-reported labeling, and error honesty.
- **Topic Status**: **0** approved · **0** N/A · **0** draft · **8** applicable unanswered · **0** unconfirmed (**8** total)

> [!IMPORTANT]
> **Mandatory Constraints Preserved**: Blank answers below leave visual/editorial parameters open for Matt and Yaman to decide; they **never** relax the mandatory requirements below:
> - **`INV-PRIV-AGE-MINIMIZATION` (14+ Age Eligibility, Derived-Only DOB Storage & Private Data Isolation)**: Accounts require 14+ Pacific-time eligibility without storing raw birthdates; customer visit notes and private photos remain private to the owning account with EXIF stripped; diagnostics and logs never expose secrets, OTPs, cookies, or raw PII. ([AUTH-AND-PERMISSIONS.md](../AUTH-AND-PERMISSIONS.md), [STORAGE-AND-FILES.md](../STORAGE-AND-FILES.md), [DIAGNOSTICS-AND-ERRORS.md](../DIAGNOSTICS-AND-ERRORS.md), [privacy.html](../../../public/policies/privacy.html))
> - **`INV-TRUTH-SONOMA-DISCLOSURES` (Sonoma County Truthfulness, Non-Fabricated Status & Draft Policy Honesty)**: Never fabricate star ratings, review counts, verified statuses, live locations, stock photos, instant reservations, or legal sign-off. Distinguish verified vendor data from unclaimed/estimated directory info, label illustrations honestly, and retain draft legal notices until approved in Readiness. ([UI-AND-CONTENT-GUIDE.md](../UI-AND-CONTENT-GUIDE.md), [legal-and-readiness.md](../domains/legal-and-readiness.md), [index.html](../../../public/policies/index.html))

---

## Topic-Level Design Decisions (8)

### Voice, Labels & Formatting Conventions

| Decision ID & Question | Answer | Expected Type & Constraints | Applicability & Status | Approval (`approved_by` / `approved_at`) | Related |
|---|---|---|---|---|---|
| <a id="dec-cnt-voice-by-surface"></a>**`DEC-CNT-VOICE-BY-SURFACE` — Voice & Tone Register by User Surface**<br>What tone guidelines should govern Customer discovery copy versus Vendor operational prompts, Support/error messages, Admin governance notes, and Legal policy drafts? |  | **Type**: `structured_spec` *(or `ref:DEC-...`)* — Tone attributes, humor/slang boundaries, and reading-level guidelines per surface. | `applicable` / **`unanswered`** |  |  |
| <a id="dec-cnt-capitalization"></a>**`DEC-CNT-CAPITALIZATION` — Capitalization Rules (Sentence Case vs Title Case vs Uppercase Kickers)**<br>Should headings, buttons, navigation tabs, table headers, and status pills use sentence case or title case, and are ALL-CAPS eyebrows/kickers permitted? |  | **Type**: `structured_spec` *(or `ref:DEC-...`)* — Casing rule for headings, buttons, labels, badges, and section eyebrows. | `applicable` / **`unanswered`** |  |  |
| <a id="dec-cnt-cta-verbs"></a>**`DEC-CNT-CTA-VERBS` — Action Verb & Trailing Arrow ("→" / "↗") Conventions**<br>How should button and link labels be phrased (verb-first, first-person "My" vs second-person "Your"), and when (if ever) should trailing arrows ("→" for in-app, "↗" for external) be appended? |  | **Type**: `structured_spec` *(or `ref:DEC-...`)* — Rules for verb phrasing, "My" vs "Your" perspective, and trailing arrow glyphs. | `applicable` / **`unanswered`** |  |  |
| <a id="dec-cnt-datetime-format"></a>**`DEC-CNT-DATETIME-FORMAT` — Date, Pacific Clock Time & Relative Timestamp Formatting**<br>How should service hours, visit dates, event inquiry dates, shift expirations, and admin audit timestamps be formatted (12h vs 24h, explicit PT/Pacific label, relative "2h ago" vs absolute date)? |  | **Type**: `structured_spec` *(or `ref:DEC-...`)* — Formatting patterns for hours, calendar dates, relative durations, and admin ISO/Pacific timestamps. | `applicable` / **`unanswered`** |  |  |
| <a id="dec-cnt-units-distances"></a>**`DEC-CNT-UNITS-DISTANCES` — Distance, Radius, File-Size & Count Precision Rules**<br>How should distances ("0.4 mi" vs "&lt; 0.5 miles"), radius labels, guest counts, and upload limits ("5 MB") be abbreviated and rounded? |  | **Type**: `structured_spec` *(or `ref:DEC-...`)* — Abbreviation, decimal rounding, and singular/plural unit formatting rules. | `applicable` / **`unanswered`** |  |  |

### Privacy, Provenance & Error Honesty

| Decision ID & Question | Answer | Expected Type & Constraints | Applicability & Status | Approval (`approved_by` / `approved_at`) | Related |
|---|---|---|---|---|---|
| <a id="dec-cnt-privacy-disclosures"></a>**`DEC-CNT-PRIVACY-DISCLOSURES` — Inline Privacy & Storage Scope Microcopy Pattern**<br>How concisely and prominently should UI forms state whether data is saved only on this device, saved privately to the user’s account, reviewed by moderators, or visible publicly? |  | **Type**: `structured_spec` *(or `ref:DEC-...`)* — Standard microcopy pattern and placement for storage/visibility disclosures. | `applicable` / **`unanswered`** |  |  |
| <a id="dec-cnt-verification-labels"></a>**`DEC-CNT-VERIFICATION-LABELS` — Canonical Terminology for Unclaimed, Self-Reported, Estimated & Verified Data**<br>What exact user-facing labels should distinguish BiteShark-verified attributes, vendor-self-reported updates, published-source estimates, and unclaimed directory listings? |  | **Type**: `token_map` *(or `ref:DEC-...`)* — Map of provenance/verification states to exact approved user-facing terms. | `applicable` / **`unanswered`** |  |  |
| <a id="dec-cnt-error-uncertainty-copy"></a>**`DEC-CNT-ERROR-UNCERTAINTY-COPY` — Error Message Structure, Next-Step Guidance & Reference ID Display**<br>What structure should user-facing error notices follow (what happened, whether user data was safe/unchanged, next action, and when to show a correlation/support reference)? |  | **Type**: `structured_spec` *(or `ref:DEC-...`)* — Template structure and rules for showing technical/correlation IDs to customers vs admins. | `applicable` / **`unanswered`** |  |  |

