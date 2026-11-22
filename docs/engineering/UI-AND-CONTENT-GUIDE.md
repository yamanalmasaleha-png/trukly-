# UI Design System, Card Architecture & Truthful Content Guide

> [!IMPORTANT]
> **Observed Conventions vs. Unanswered Style-Guide Decisions**:
> Sections 1–2 below describe **current code-level conventions** on `working/biteshark-vps` so routine maintenance stays consistent. They are **not** final approved design-system answers. Open design decisions for Matt and Yaman live in the intentionally unfilled [Design Style Guide (`style-guide/README.md`)](style-guide/README.md) and [Completion Reminder (`style-guide/COMPLETION-REMINDER.md`)](style-guide/COMPLETION-REMINDER.md). Section 3 below lists **non-negotiable truthfulness rules** that remain mandatory at all times.

---

## 1. Visual Identity & Authoritative Design Tokens (`public/color-calm.css`)

BiteShark uses a **warm cream, forest-green, and restrained terracotta** palette (`public/color-calm.css` overrides earlier high-saturation coral/neon rules from `theme.css`):
- `--trk-paper` / `--cream`: Warm parchment surface & page background.
- `--trk-green`: Primary deep forest green for primary buttons, active pills, and headings.
- `--trk-sage` / `--trk-soft` / `--trk-border`: Calm secondary surfaces and subtle card borders.
- `--trk-rust` / `--brand-pop`: Restrained warm accent for key highlights and brand marks.
- Typography: `Fredoka` (`600`/`700`) for display titles, `DM Sans` (`400`–`700`) for UI/body copy (`public/theme.css`); system sans-serif in `/admin.html` and `/policies/*.html`.

---

## 2. Discovery & Listing Card Architecture (`cardHTML` + `color-calm.css`)

Both primary food trucks and neighborhood spots (`farmers_market`, `farm_stand`, `coffee_shop`, `popup`) render through **one shared horizontal component**: `cardHTML(t)` in [app.js](../../public/app.js) styled by `.truck-card` in [color-calm.css](../../public/color-calm.css):

```text
┌────────────────────────────────────────────┐
│                 Business name          ♡   │
│   Thumbnail     Cuisine · town             │
│   (96–104px)    Location / service status  │
│                 View details →             │
└────────────────────────────────────────────┘
```

### Rules When Modifying Listing Cards
1. **Single Component**: Keep primary and neighborhood cards unified in `cardHTML(t)`. Do not split `extraCard(t)` back into a tall vertical card.
2. **Cascade Discipline**: Modify `.truck-card` rules directly in `public/color-calm.css` after inspecting `theme.css` and `neighborhood.css`. **Never** append another override stylesheet full of `!important` declarations.
3. **Inline Button Width Reset**: Remember `public/theme.css:20` sets `.primary, .secondary { width: 100%; min-height: 48px }`. Any horizontal button row in modals or cards must explicitly set `width: auto`.
4. **Thumbnail Fallback**: When `photo_rights_verified` is `false` (default for unverified listings), render BiteShark's restrained category/cuisine badge thumbnail (`resolveApprovedVendorImage` in `app.js`) — never stock photography.

---

## 3. Non-Negotiable Content & Truthfulness Rules

1. **Sonoma County Truthfulness**: Never render template Austin locations (`Mueller Lake Park`, `South Congress`), `"undefined"` text, fabricated star ratings/review counts (`4.9 (324)`), unverified distances, or generic Unsplash URLs.
2. **Truthful Schedule & Location Labels (`lib/discovery.js`)**: Distinguish verified live vendor locations from `general_area` / `town_centroid` estimates (`◌ Est. open` / `Check hours` vs verified `● Open`). On `a2f0135`, keep the map disclosure `"Trucks are cuisine illustrations, not actual vendor vehicles."` visible whenever miniature SVG truck markers are shown.
3. **Truthful Capability Copy**:
   - Event bookings are **catering inquiries** (`Request event inquiry`), never instant paid reservations (`BOOKABLE` badges on unverified listings are prohibited).
   - Unclaimed listings (`ownership_status = 'unclaimed'`) must display neutral directory language rather than implying the business actively operates on BiteShark.
   - Policy pages under `/policies/*.html` must retain their `DRAFT — PENDING LEGAL REVIEW` banners until approved in `/admin#readiness`.
