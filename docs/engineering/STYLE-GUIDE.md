# BiteShark staging2 style guide

BiteShark helps people find nearby food and contact vendors. Give the vendor name, location and next action the clearest place on each screen. Use the playful side of the brand for discovery. Keep booking, availability and pickup messages precise.

## Color and type

| Role | CSS token | Color | Use |
| --- | --- | --- | --- |
| Canvas | `--cream` | `#F7F5ED` | Page, toolbar and bottom navigation |
| Paper | `--trk-paper` | `#FFFDF7` | Search fields and listing surfaces |
| Primary | `--trk-green` | `#234B3A` | Main action and selected cuisine chips, with light text |
| Secondary | `--trk-sage` | `#E6EEE3` | Quiet actions with forest-green text |
| Body / supporting text | `--ink` / `--muted` | `#243C31` / `#5D6D63` | Names and descriptions / supporting details |
| Border | `--trk-border` | `#D7DED3` | Dividers and card edges |
| Accent | `--trk-rust` | `#A9543F` | A small brand or editorial highlight |

Use Fredoka for a short display title and DM Sans for controls, vendor names, prices and hours. Let long names wrap in lists. Keep the full name available in details when a map label uses a short name. [Palette and component rules](../../public/color-calm.css) · [Typography](../../public/theme.css)

## Applying the style

| Surface | Design direction for staging2 |
| --- | --- |
| Discovery | Keep search above the map. Give cuisine chips one horizontally scrollable row and keep the Map/List control visible as filters change. |
| Map markers | Pair a recognizable cuisine illustration with a short vendor name. Give the selected marker a clear outline. Group crowded markers with a count and reveal individual vendors on zoom. Keep the illustration disclosure visible. |
| Listing card | Use a horizontal card with the approved thumbnail on the left and the name, cuisine, town and availability on the right. Use the cuisine badge when photo rights are unverified. Keep the favorite control separately tappable. |
| Catering inquiry | Label the action “Send catering inquiry.” Show what was submitted and who responds next. Reserve confirmation language for a confirmed booking. |
| Pickup pager | Lead with the pickup state. Use “Ready for pickup” only after the vendor signals readiness. Put the vendor name beside the state so the customer knows where to go. |
| Owner tools | Lead with today’s status and the most frequent action. After a save, identify what changed, for example “Today’s hours updated.” |

Use the shared listing component and existing map styles when implementing these patterns. [Listing implementation](../../public/app.js) · [Map styles](../../public/map-cards.css) · [Pager styles](../../public/pager.css)

## Voice and availability

Use a local, conversational voice for discovery. “Heard about this taco spot?” works as an editorial invitation. For operational messages, describe what the app knows. Use “Check hours” when hours are unknown and “General area” when the location is approximate. For an empty filtered list, give a specific recovery action such as “No matches. Clear cuisine filters.” [UI and content rules](UI-AND-CONTENT-GUIDE.md)

## Review a mobile screen

- At 390 px portrait width, try a long vendor name and enlarged text. Check that search, the selected filter and the next action stay reachable.
- Tap a crowded group of markers and select a vendor. Confirm the name matches the detail card and that the selected state is visible without relying on color alone.
- Navigate with a keyboard. Check visible focus, accessible names on icon buttons and focus return after closing details.
- Check status and error messages with reduced motion enabled. Keep the status readable after any animation ends. [Accessibility guidance](ACCESSIBILITY.md)

## Cuisine illustrations

Give each miniature truck one oversized roof sign, a rounded cab and a few details that read at map size. Use coral for burgers, tomato for pizza, lavender for ice cream, charcoal for coffee and soft teal for ramen. Fries use a bright red carton with golden fries. Carry the red accent into the fries dish badge on vendor details. Keep the surrounding card paper, headings forest green and supporting text muted. The badge identifies the dish. The source and description explain why it is highlighted.
