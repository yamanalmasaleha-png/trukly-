// Single Canonical BiteShark Editorial Story & Clue Source (`lib/editorial-stories.js`)
//
// Image-Rights & Provenance Note (`docs/PHOTO_MENU_VERIFICATION.md:11,49,147,165,211`):
//   Earlier prototypes referenced `/assets/retrograde-roasting.jpg`, `/assets/oak-hill-guide.jpg`,
//   and `/assets/mitote.jpg`, which were intentionally omitted because third-party venue/dish
//   image reuse rights were not cleared. Every editorial story below therefore uses an intentional,
//   accessible BiteShark editorial illustration (`media_kind: 'illustration'`, `photo_url: null`)
//   with explicit dimensions (16:9 `640x360`) and verified published business/news sources.

export const EDITORIAL_STORIES = Object.freeze([
  Object.freeze({
    story_id: 'story_retrograde_roast',
    vendor_id: 'coffee-retrograde',
    vendor_name: 'Retrograde Coffee Roasters',
    town: 'Sebastopol',
    tag: 'THE COFFEE CRAFT',
    title: 'Follow the roast, not the rush.',
    summary:
      'Retrograde began in 2014 with home roasting and a farmers-market coffee cart before opening its Sebastopol café, pairing in-house roasts with prepared food and patio seating.',
    detail_cue: 'Look beyond the cup: small-batch roasting is part of this stop’s everyday rhythm.',
    cta_label: 'View Retrograde details',
    source_url: 'https://retrograderoasters.com/pages/visit',
    source_label: 'Retrograde Coffee Roasters visit page',
    corroborating_url: 'https://retrograderoasters.com/pages/about',
    media_kind: 'illustration',
    photo_url: null,
    photo_rights_verified: false,
    illustration_key: 'roaster_coffee',
    alt_text: 'Editorial illustration of a small-batch coffee roaster drum and pour-over cup in warm Sebastopol tones',
    attribution: 'BiteShark editorial illustration · not a photograph of the café or drinks',
    clue: Object.freeze({
      kicker: 'ORIGIN FILE',
      headline: 'The café that started on wheels',
      question: 'This Sebastopol café began in 2014 with home roasting and a farmers-market coffee cart. Which local stop?',
      fact: 'Retrograde describes starting in 2014 roasting out of a home kitchen and taking a coffee cart to farmers markets before opening in Sebastopol.'
    })
  }),
  Object.freeze({
    story_id: 'story_oakhill_red_barn',
    vendor_id: 'farm-oakhill',
    vendor_name: 'Oak Hill Farm — Red Barn Store',
    town: 'Glen Ellen',
    tag: 'FIELD TO TOTE',
    title: 'A grocery run with barn character.',
    summary:
      'The Red Barn Store sits inside a roughly century-old barn at Oak Hill Farm in Glen Ellen, where seasonal farm harvests share shelves with honey, pantry staples, and goods from regional makers.',
    detail_cue: 'Check seasonal barn hours before heading up Sonoma Valley.',
    cta_label: 'View Red Barn Store details',
    source_url: 'https://www.oakhillfarm.net/the-red-barn-store',
    source_label: 'Oak Hill Farm Red Barn Store page',
    corroborating_url: null,
    media_kind: 'illustration',
    photo_url: null,
    photo_rights_verified: false,
    illustration_key: 'red_barn_harvest',
    alt_text: 'Editorial illustration of a red timber barn beside harvest crates of Sonoma Valley produce and honey jars',
    attribution: 'BiteShark editorial illustration · not a photograph of the barn or farm stand',
    clue: Object.freeze({
      kicker: 'TUCKED-AWAY FIND',
      headline: 'The barn with a pantry shelf',
      question: 'Seasonal farm produce, honey, and regional pantry goods inside a century-old Glen Ellen barn. Where is it?',
      fact: 'Oak Hill Farm describes its Red Barn Store inside a roughly 100-year-old barn stocking seasonal produce and locally sourced pantry items.'
    })
  }),
  Object.freeze({
    story_id: 'story_mitote_food_park',
    vendor_id: 'mitote',
    vendor_name: 'Mitote Food Park',
    town: 'Santa Rosa',
    tag: 'THE GATHERING SPOT',
    title: 'One stop. A whole food-park mood.',
    summary:
      'Mitote Food Park brings multiple rotating food trucks together around shared outdoor tables at 100 Sebastopol Rd in Roseland—making it easy for a group to order from different kitchens.',
    detail_cue: 'Individual truck lineups and hours vary; confirm current vendors before visiting.',
    cta_label: 'View Mitote Food Park details',
    source_url: 'https://www.mitotefoodpark.com/',
    source_label: 'Mitote Food Park official site',
    corroborating_url: 'https://www.sonomamag.com/mitote-food-park-soft-opens-at-new-location/',
    media_kind: 'illustration',
    photo_url: null,
    photo_rights_verified: false,
    illustration_key: 'food_park_gathering',
    alt_text: 'Editorial illustration of colorful food trucks gathered around string lights and communal picnic tables',
    attribution: 'BiteShark editorial illustration · not a photograph of the food park',
    clue: Object.freeze({
      kicker: 'ROSES & ROTATING TRUCKS',
      headline: 'Shared tables, multiple kitchens',
      question: 'This Santa Rosa food park reopened at 100 Sebastopol Rd with rotating trucks and communal outdoor seating. Which venue?',
      fact: 'Mitote Food Park relocated to 100 Sebastopol Rd in Santa Rosa with rotating food trucks and shared outdoor seating.'
    })
  }),
  Object.freeze({
    story_id: 'story_crooks_creme_brulee',
    vendor_id: 'coffee-crooks',
    vendor_name: 'Crooks Coffee',
    town: 'Santa Rosa',
    tag: 'THE MENU DETAIL',
    title: 'A latte with a dessert plot twist.',
    summary:
      'Crooks Coffee’s published menu highlights specialty drinks including a crème brûlée latte, Mexican mocha, and café con miele—proof that one distinctive menu detail can define a neighborhood stop.',
    detail_cue: 'Menu offerings can change seasonally; check current drink availability.',
    cta_label: 'View Crooks Coffee details',
    source_url: 'https://shadyraveninc.com/menu',
    source_label: 'Crooks Coffee published menu',
    corroborating_url: null,
    media_kind: 'illustration',
    photo_url: null,
    photo_rights_verified: false,
    illustration_key: 'creme_brulee_latte',
    alt_text: 'Editorial illustration of a caramelized espresso latte cup with cinnamon and cocoa accents',
    attribution: 'BiteShark editorial illustration · not a photograph of the drink',
    clue: Object.freeze({
      kicker: 'ON THE MENU',
      headline: 'A latte wearing dessert clothes',
      question: 'Which Santa Rosa café menu lists a crème brûlée latte, Mexican mocha, and café con miele?',
      fact: 'Crooks Coffee lists a crème brûlée latte, Mexican mocha, and café con miele on its published menu.'
    })
  }),
  Object.freeze({
    story_id: 'story_avid_petaluma_roots',
    vendor_id: 'coffee-avid-petaluma',
    vendor_name: 'Avid Coffee — Downtown Petaluma',
    town: 'Petaluma',
    tag: 'LOCAL COFFEE ROOTS',
    title: 'A downtown coffee stop with Sonoma roots.',
    summary:
      'Founded in Petaluma in 2011 (originally as Acre Coffee before adopting the Avid name in 2021), Avid anchors a walkable downtown Petaluma stop for espresso and pastries.',
    detail_cue: 'Pair a morning coffee stop with nearby Petaluma market or riverfront browsing.',
    cta_label: 'View Avid Petaluma details',
    source_url: 'https://avidcoffee.com/pages/locations',
    source_label: 'Avid Coffee locations & history',
    corroborating_url: 'https://avidcoffee.com/pages/learn',
    media_kind: 'illustration',
    photo_url: null,
    photo_rights_verified: false,
    illustration_key: 'neighborhood_espresso',
    alt_text: 'Editorial illustration of an espresso portafilter, coffee beans, and historic downtown Petaluma storefront awning',
    attribution: 'BiteShark editorial illustration · not a photograph of the café',
    clue: Object.freeze({
      kicker: 'LOCAL ORIGIN STORY',
      headline: 'The coffee shop with a past name',
      question: 'This Sonoma County coffee roaster began in Petaluma in 2011 under a different name before becoming Avid in 2021. Which stop?',
      fact: 'Avid states it began as Acre Coffee in Petaluma in 2011 and adopted the Avid Coffee name in 2021.'
    })
  })
]);

export const EDITORIAL_STORIES_BY_ID = Object.freeze(
  Object.fromEntries(EDITORIAL_STORIES.map(story => [story.story_id, story]))
);

export const EDITORIAL_STORIES_BY_VENDOR_ID = Object.freeze(
  Object.fromEntries(EDITORIAL_STORIES.map(story => [story.vendor_id, story]))
);

export function buildPublicStoriesPayload(discoverableVendorIds = null) {
  const hasDiscoverableSet = discoverableVendorIds instanceof Set;
  return {
    stories: EDITORIAL_STORIES.map(s => ({
      story_id: s.story_id,
      vendor_id: s.vendor_id,
      vendor_name: s.vendor_name,
      town: s.town,
      tag: s.tag,
      title: s.title,
      summary: s.summary,
      detail_cue: s.detail_cue,
      cta_label: s.cta_label,
      source_url: s.source_url,
      source_label: s.source_label,
      corroborating_url: s.corroborating_url,
      media_kind: s.photo_url && s.photo_rights_verified ? 'photo' : 'illustration',
      photo_url: s.photo_url && s.photo_rights_verified ? s.photo_url : null,
      illustration_key: s.illustration_key,
      aspect_ratio: '16 / 9',
      width: 640,
      height: 360,
      alt_text: s.alt_text,
      attribution: s.attribution,
      business_available: hasDiscoverableSet ? discoverableVendorIds.has(s.vendor_id) : true,
      clue: s.clue
    }))
  };
}
