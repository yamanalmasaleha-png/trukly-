# Truckly v77 — Photo, Menu and Listing Verification Register

Checked November 14, 2026. Read-only inspection of live Hatchable v77 source revealed 47 primary truck/market listings and 12 neighborhood, cafe and farm additions (59 total). This GitHub review branch starts from earlier v64 source, not a complete v77 export.

## Rules and scope

- A menu-listed dish is not automatically the vendor's best dish. Use Menu pick, Featured item or Best-seller assortment only where supported.

- Generic Unsplash images are not photos of named vendors. The proposed UI disables those generic stock images for named listings and uses clear illustration icons until actual vendor photos can be licensed and checked.

- No new business-owned photos have been licensed in this change. Verify image rights for existing local assets too.

- The present API applies blanket verified:true and placeholder positions, distances and hours to numerous records; this is NOT independent fact-checking. The proposed API patch changes the default verified flag to false.

- Business, menu, hours, ratings, address, stock and photo permissions are independent verification fields. Do not collapse them into one unqualified verified badge.

## Menu and venue findings

| ID | Menu or venue focus | Verification scope | Source |

|---|---|---|---|

| mitote | Venue with rotating food vendors | Relocation and venue backed by reporting | https://www.sonomamag.com/mitote-food-park-soft-opens-at-new-location/ |

| xies | Golden Tray (four best sellers) | Menu explicitly says BEST SELLERS; not a single top-ranked dish | https://toast.app/r/xies-sushi-rolls-llc-xies707/order |

| fruta | Bionico fruit bowl | Listed under Featured Items; popularity ranking unknown | https://toast.app/r/fru-ta-food-truck-2970-santa-rosa-ave/order |

| dinos | Lamb gyro | On operator menu; not verified as top seller | https://www.dinosgreekfoodtruck.com/ |

| kolobok | Signature Loaded Baked Potato | Menu label says Signature; current service not confirmed | https://www.bestfoodtrucks.com/truck/kolobok-russian-soul-food-truck/menu |

| lucha | Mushroom tacos | Documented in historical 2022 event coverage, not confirmed current | https://www.sonomamag.com/mitote-food-park-soft-opens-at-new-location/ |

| coffee-crooks | Crème brûlée latte | Menu-linked in v77 source; not ranked top seller | https://shadyraveninc.com/menu |

## Confirmed address error

Mitote Food Park moved from 665 Sebastopol Rd to 100 Sebastopol Rd, Santa Rosa, with reopening reported in April 2025. The operator's page shows the new location at the top but the former address in its footer: https://www.mitotefoodpark.com/ . Independent news: https://www.sonomamag.com/mitote-food-park-soft-opens-at-new-location/ . Do not assume every resident vendor's current schedule or photo from the former site is valid.

## All primary records (47)

| ID | Listed name | Dish evidence | Photo action |

|---|---|---|---|

| ross | Ross Street rotating lunch lineup | Pending official menu and evidence of best seller | Request licensed vendor-specific photo |

| mitote | Mitote Food Park | Venue with rotating food vendors — limited verification | Review local asset provenance/current scene |

| jalapeno | Jalapeño Mexican Grill | Pending official menu and evidence of best seller | Request licensed vendor-specific photo |

| iniguez | Tacos Iñiguez | Pending official menu and evidence of best seller | Request licensed vendor-specific photo |

| elenita | Delicias Elenita | Pending official menu and evidence of best seller | Request licensed vendor-specific photo |

| sunny | Sunny Cafe & Tacos | Pending official menu and evidence of best seller | Request licensed vendor-specific photo |

| magos | Gio y Los Magos | Pending official menu and evidence of best seller | Request licensed vendor-specific photo |

| elroys | El Roy's Express Mex | Pending official menu and evidence of best seller | Request licensed vendor-specific photo |

| lucha | Lucha Sabina | Mushroom tacos — limited verification | Request licensed vendor-specific photo |

| elroys-pet-1 | El Roy's Taco Truck | Pending official menu and evidence of best seller | Request licensed vendor-specific photo |

| elroys-pet-2 | El Roy's Food Truck #2 | Pending official menu and evidence of best seller | Request licensed vendor-specific photo |

| holy-chile | Holy Chile Mole | Pending official menu and evidence of best seller | Request licensed vendor-specific photo |

| block | The Block Petaluma | Pending official menu and evidence of best seller | Request licensed vendor-specific photo |

| faron | Faron's New Orleans BBQ | Pending official menu and evidence of best seller | Request licensed vendor-specific photo |

| gameday | Gameday Grill | Pending official menu and evidence of best seller | Request licensed vendor-specific photo |

| munchiez | Bay Area Munchiez | Pending official menu and evidence of best seller | Request licensed vendor-specific photo |

| char | The Char Market | Pending official menu and evidence of best seller | Request licensed vendor-specific photo |

| onion | The Onion Bomb | Pending official menu and evidence of best seller | Request licensed vendor-specific photo |

| adams | Adam's Grub Truck | Pending official menu and evidence of best seller | Request licensed vendor-specific photo |

| cichy | Cichy Co. | Pending official menu and evidence of best seller | Request licensed vendor-specific photo |

| worldfare | World Fare Food Truck | Pending official menu and evidence of best seller | Request licensed vendor-specific photo |

| dogaday | A Dog A Day | Pending official menu and evidence of best seller | Request licensed vendor-specific photo |

| streetdogz | Streetdogz & Streetburgerz | Pending official menu and evidence of best seller | Request licensed vendor-specific photo |

| sausage | The Sausage Truck | Pending official menu and evidence of best seller | Request licensed vendor-specific photo |

| hefty | Hefty Gyros | Pending official menu and evidence of best seller | Request licensed vendor-specific photo |

| momo | MoMo Man | Pending official menu and evidence of best seller | Request licensed vendor-specific photo |

| xies | Xies707 Sushi Rolls | Golden Tray (four best sellers) — limited verification | Request licensed vendor-specific photo |

| api-hot | API Hot Chicken | Pending official menu and evidence of best seller | Request licensed vendor-specific photo |

| dinos | Dino's Greek Food | Lamb gyro — limited verification | Request licensed vendor-specific photo |

| dang | Dang That's Good | Pending official menu and evidence of best seller | Request licensed vendor-specific photo |

| drip | Drip Sandwiches | Pending official menu and evidence of best seller | Request licensed vendor-specific photo |

| fruta | Fru-ta Ice Cream Truck | Bionico fruit bowl — limited verification | Request licensed vendor-specific photo |

| heritage | Best Food Truck Ever by Heritage Eats | Pending official menu and evidence of best seller | Request licensed vendor-specific photo |

| andrew | Mr. Andrew Food Trailer | Pending official menu and evidence of best seller | Request licensed vendor-specific photo |

| kolobok | Kolobok Russian Soul Food Truck | Signature Loaded Baked Potato — limited verification | Request licensed vendor-specific photo |

| rich | Little Rich's Italian Ice | Pending official menu and evidence of best seller | Request licensed vendor-specific photo |

| momolicious | Momolicious | Pending official menu and evidence of best seller | Request licensed vendor-specific photo |

| market-chavas | Chava's Pizza | Pending official menu and evidence of best seller | Request licensed vendor-specific photo |

| market-myriad | Myriad Coffee | Pending official menu and evidence of best seller | Request licensed vendor-specific photo |

| market-chicken | What A Chicken!? | Pending official menu and evidence of best seller | Request licensed vendor-specific photo |

| market-donpepe | Tacos Don Pepe | Pending official menu and evidence of best seller | Request licensed vendor-specific photo |

| market-sushi | Sushi Shoubu | Pending official menu and evidence of best seller | Request licensed vendor-specific photo |

| market-boba | Bai Chai Boba Tea | Pending official menu and evidence of best seller | Request licensed vendor-specific photo |

| market-urban | Urban Deli | Pending official menu and evidence of best seller | Request licensed vendor-specific photo |

| market-roti | Roti | Pending official menu and evidence of best seller | Request licensed vendor-specific photo |

| market-mifiesta | Mi Fiesta Catering Co. | Pending official menu and evidence of best seller | Request licensed vendor-specific photo |

| market-fusion | Fusion 2 Go | Pending official menu and evidence of best seller | Request licensed vendor-specific photo |

## Neighborhood additions (12)

| ID | Listed name | Existing source in app | Dish/photo follow-up |

|---|---|---|---|

| farm-oakhill | Oak Hill Farm — Red Barn Store | https://www.oakhillfarm.net/the-red-barn-store | Recheck menu and photo permission |

| farm-barn | Farm Barn | https://www.farmtrails.org/business/farm-barn/ | Recheck menu and photo permission |

| market-sr-community | Santa Rosa Community Farmers Market | https://www.ourfarmersmarkets.org/locations-santa-rosa/ | Recheck menu and photo permission |

| market-sr-original | Santa Rosa Original Certified Farmers Market | https://www.ourfarmersmarkets.org/locations-santa-rosa/ | Recheck menu and photo permission |

| truck-galvans | Galvan’s Eatery | https://seadragon-flamingo-rwlk.squarespace.com/backyard-food-and-events | Recheck menu and photo permission |

| truck-flippin | Los Flippin Tacos | https://seadragon-flamingo-rwlk.squarespace.com/backyard-food-and-events | Recheck menu and photo permission |

| truck-casanostra | Casa Nostra NorCal | https://seadragon-flamingo-rwlk.squarespace.com/backyard-food-and-events | Recheck menu and photo permission |

| truck-thespot | The Spot Food Truck | https://seadragon-flamingo-rwlk.squarespace.com/backyard-food-and-events | Recheck menu and photo permission |

| coffee-crooks | Crooks Coffee | https://shadyraveninc.com/menu | Crème brûlée latte |

| coffee-retrograde | Retrograde Coffee Roasters | https://retrograderoasters.com/pages/visit | Recheck menu and photo permission |

| coffee-avid-petaluma | Avid Coffee — Downtown Petaluma | https://avidcoffee.com/pages/locations | Recheck menu and photo permission |

| coffee-avid-sr | Avid Coffee — Montgomery Village | https://avidcoffee.com/pages/locations | Recheck menu and photo permission |

## Image and feature acceptance checks

1. Confirm exact subject and business identity in the photo, photographer/license, permitted reuse, crop and attribution. Do not scrape Instagram, maps or review sites without permission.

2. Link a currently published menu item to an official page; distinguish item listed, featured and ranked best seller.

3. Check image loads and mobile crops in map/list cards, favorites and detail modal. Use explicit illustrative placeholders if unknown.

4. Check real coordinates, current hours and addresses, no false live or verified flags, old data and duplicate images.

5. Ask vendor to approve the representation and provide a correction/removal path.

6. Verify all 59 items separately before saying the full directory is verified.

## Handoff

New script: public/listing-highlights.js. It displays the sourced highlights and honest pending states without claiming invented best dishes. GitHub source is older (v64) than active Hatchable v77. Rebase/reconcile the live source before deploying, and test on a safe clone/preview. Other admin reviewer GitHub handle has not been confirmed; do not invent an @mention.

## Additional sourced spotlights (added in this review)

These are scoped claims, NOT confirmation of a vendor's most sold dish or image-use rights.

| Listing | Highlight | Exact evidence category | Source |
|---|---|---|---|
| `iniguez` | Tacos | #1 most liked item on the Mission Boulevard Uber Eats menu | https://guava.failover.uber.com/store/tacos-los-iniguez-mission-blvd/AI7JR89vUeCeAMyoM-KgmQ |
| `elenita` | Tacos al pastor | User/customer favorite cited by Restaurantji, not owner-assigned bestseller | https://www.restaurantji.com/ca/santa-rosa/delicias-elenita-/ |
| `momo` | Stix MoMo (fried) | DoorDash featured item, current availability to confirm | https://www.doordash.com/store/momo-man-petaluma-32786989/ |
| `dogaday` | Giant Dog (quarter-pound) | DoorDash featured item, availability to confirm | https://www.doordash.com/store/a-dog-a-day-hotdogs-%26-more-santa-rosa-926436/ |
| `api-hot` | Mexican-spiced Nashville hot chicken | Vendor specialty described by NorCal Food Truck Association | https://www.norcalfoodtrucks.org/the-trucks/api-hot-chicken |
| `magos` | Birria-loaded fries | Eater reporting from 2023 at former Mitote location; not a current-menu claim | https://sf.eater.com/2023/6/5/23746661/mitote-food-truck-park-santa-rosa |
| `holy-chile` | BBQ-meat tacos and melts | Operator's concept description; its online menu has placeholder entries | https://holychilemole.com/ |
| `coffee-crooks` | Crème brûlée latte | Business calls it a signature drink | https://shadyraveninc.com/menu |
| `elroys` | Mexican street eats | Operator's food-truck menu and location directory; NOT a claimed bestseller | https://elroys.com/locations/ |

**Address corrections:** The operator's current listing places El Roy's Sebastopol Road truck at **1569 Sebastopol Rd** and its two Petaluma trucks at **401 E Washington St** and **175 Fairgrounds Dr**. Source: https://elroys.com/locations/ . The former **760 Sebastopol Rd** value in Truckly was not supported for this named location. Mitote's venue moved to **100 Sebastopol Rd**; other individual vendor locations are NOT automatically updated unless corroborated.

## Regression QA and deployment safety

- Test source: `tests/listing-verification.cjs`. Run locally from repository root with `node tests/listing-verification.cjs` (requires Node). It checks the 47-record primary API baseline, correct address labels, category corrections, safe photo defaults, source code syntax and that the spotlight file loads in HTML.
- Manual mobile checks **still required**: iPhone-size List and Map, open-now empty state, favorites, local cache fallback, each detail modal, missing photo, slow network and screen-reader text.
- Image usage rights remain unresolved: **zero new third-party venue or dish photographs have been included**. The illustrations are visual fallback only.
- This is a **GitHub v64-based review branch** with learnings from live Hatchable **v77**. It is not a production-ready export of v77. Reconcile different code paths and new v77 features before merge/deploy. Do not overwrite the original live project or claim the app was updated in production.
- The second GitHub administrator's username is not established from the available tools. Add the verified account as reviewer manually once confirmed; do not tag an unknown person.
