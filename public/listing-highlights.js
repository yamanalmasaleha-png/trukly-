/* BiteShark listing menu highlights & photo-rights provenance.
 *
 * Keeps sourced menu/venue notes and data-quality disclosures available in the
 * listing detail modal while exposing concise, optional 1-line card highlights
 * ONLY for listings with a researched pick (never rendering a disconnected
 * spotlight box or "Dish and photo research pending" banner on discovery cards).
 */
(function () {
  "use strict";
  var PICKS = Object.freeze({
    "iniguez": {heading:"Top-liked menu item",title:"Tacos",icon:"🌮",note:"Uber Eats lists tacos as the #1 most liked item for the Mission Boulevard location. Platform rating is not an independently audited sales ranking.",source:"https://guava.failover.uber.com/store/tacos-los-iniguez-mission-blvd/AI7JR89vUeCeAMyoM-KgmQ"},
    "elenita": {heading:"Customer favorite",title:"Tacos al Pastor",icon:"🌮",note:"Listed among customer favorites by Restaurantji, not labeled the owner's official bestseller.",source:"https://www.restaurantji.com/ca/santa-rosa/delicias-elenita-/"},
    "momo": {heading:"Featured delivery item",title:"Stix MoMo · fried dumplings",icon:"🥟",note:"Featured on Momo Man's DoorDash menu; menu or service availability may change.",source:"https://www.doordash.com/store/momo-man-petaluma-32786989/"},
    "dogaday": {heading:"Featured menu item",title:"Giant Dog · quarter-pound",icon:"🌭",note:"Shown among A Dog A Day's featured delivery items, not a verified overall bestseller.",source:"https://www.doordash.com/store/a-dog-a-day-hotdogs-%26-more-santa-rosa-926436/"},
    "api-hot": {heading:"Known food specialty",title:"Mexican-spiced hot chicken",icon:"🍗",note:"NorCal Food Truck Association describes Nashville hot chicken with Mexican dried chilies; no ranked dish is claimed.",source:"https://www.norcalfoodtrucks.org/the-trucks/api-hot-chicken"},
    "magos": {heading:"Previously reviewed dish",title:"Birria-loaded fries",icon:"🍟",note:"Eater described birria fries in 2023 at the former Mitote location; confirm the current menu and vendor location.",source:"https://sf.eater.com/2023/6/5/23746661/mitote-food-truck-park-santa-rosa"},
    "elroys": {heading:"Food-truck menu",title:"Mexican street eats",note:"The operator publishes a distinct food-truck menu. Confirm items at 1569 Sebastopol Road.",source:"https://elroys.com/locations/"},
    "elroys-pet-1": {heading:"Food-truck menu",title:"El Roy's street eats",note:"The operator confirms the Downtown Petaluma truck at 401 E Washington St. Best sellers not ranked.",source:"https://elroys.com/locations/"},
    "elroys-pet-2": {heading:"Food-truck menu",title:"El Roy's street eats",note:"The operator confirms the Fairgrounds truck at 175 Fairgrounds Dr. Best sellers not ranked.",source:"https://elroys.com/locations/"},
    "holy-chile": {heading:"Operator's menu concept",title:"BBQ-meat tacos & melts",note:"The operator describes pulled pork, brisket and chicken tacos and melts, but its online menu says coming soon. Confirm offerings.",source:"https://holychilemole.com/"},
    "mitote": {heading:"Venue spotlight",title:"Rotating Mexican food trucks",note:"This is a food park, not one restaurant with a single best dish. New site: 100 Sebastopol Rd.",source:"https://www.sonomamag.com/mitote-food-park-soft-opens-at-new-location/"},
    "xies": {heading:"Menu best-seller selection",title:"Golden Tray",note:"The published menu calls this an assortment of four best-selling rolls; not a ranked single best dish.",source:"https://toast.app/r/xies-sushi-rolls-llc-xies707/order"},
    "dinos": {heading:"Menu pick",title:"Lamb Gyro",note:"Listed on Dino's official menu. No sales ranking has been verified.",source:"https://www.dinosgreekfoodtruck.com/"},
    "fruta": {heading:"Featured menu item",title:"Bionico fruit bowl",note:"Listed as a featured item on the truck's ordering menu.",source:"https://toast.app/r/fru-ta-food-truck-2970-santa-rosa-ave/order"},
    "kolobok": {heading:"Signature menu item",title:"Loaded Baked Potato",note:"Named a signature dish on the published truck menu; check current availability.",source:"https://www.bestfoodtrucks.com/truck/kolobok-russian-soul-food-truck/menu"},
    "lucha": {heading:"Previously documented dish",title:"Mushroom Tacos",note:"Documented at Mitote in earlier reporting; confirm the present-day menu before visiting.",source:"https://www.sonomamag.com/mitote-food-park-soft-opens-at-new-location/"},
    "coffee-crooks": {heading:"Signature drink",title:"Crème Brûlée Latte",note:"The menu also lists Mexican mocha and café con miele; none is confirmed as the top seller.",source:"https://shadyraveninc.com/menu"}
  });

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch];
    });
  }

  function removeGenericStockPhoto(t) {
    if (!t) return;
    if (t.verification_status !== "business_confirmed") t.verified = false;
    if (t.photo_rights_verified !== true) t.photo = null;
    if (typeof t.photo === "string" && /^https:\/\/images\.unsplash\.com\//i.test(t.photo)) {
      t.photo = null; // generic stock != a business's actual dish or venue
    }
  }

  function getPick(t) {
    return (t && PICKS[t.id]) || null;
  }

  function detailSpotlightMarkup(t) {
    if (!t) return "";
    var pick = getPick(t);
    var category = esc(t.kind || t.cuisine || "Local food");
    var represent = esc((pick && pick.icon) || t.emoji || "🍽️");
    var iconStyle = pick && pick.icon === "🍟" ? " is-fries" : "";
    var heading = pick ? pick.heading : "Dish and photo research pending";
    var label = pick ? pick.title : category + " to explore";
    var sub = pick
      ? pick.note
      : "Illustrative icon only. We have not confirmed this vendor's best dish or permission to display a vendor-specific food photo.";
    var source =
      pick && pick.source
        ? '<a href="' + esc(pick.source) + '" target="_blank" rel="noopener noreferrer">Check published source ↗</a>'
        : "";
    return (
      '<section class="truckly-spotlight" aria-label="Listing research and photo provenance">' +
      '<span class="truckly-spotlight-icon' + iconStyle + '" aria-hidden="true">' + represent + "</span>" +
      '<span class="truckly-spotlight-body"><small>' + esc(heading) + "</small><strong>" + esc(label) + "</strong>" +
      '<span class="truckly-spotlight-explainer">' + esc(sub) + "</span>" + source +
      "</span></section>"
    );
  }

  var api = Object.freeze({
    getPick: getPick,
    sanitizeListingMedia: removeGenericStockPhoto,
    renderDetailSpotlight: detailSpotlightMarkup
  });

  if (typeof window !== "undefined") {
    window.bitesharkListingHighlights = api;
  }
  if (typeof globalThis !== "undefined") {
    globalThis.bitesharkListingHighlights = api;
  }

  if (typeof trucks !== "undefined" && Array.isArray(trucks)) {
    trucks.forEach(removeGenericStockPhoto);
  }

  if (typeof openDetail === "function") {
    var baseOpenDetail = openDetail;
    openDetail = function (id, triggerEl) {
      var t =
        typeof trucks !== "undefined" && Array.isArray(trucks)
          ? trucks.find(function (x) { return x.id === id; })
          : null;
      removeGenericStockPhoto(t);
      var result = baseOpenDetail(id, triggerEl);
      var body = document.querySelector("#detailContent .detail-body");
      if (body && t && !body.querySelector(".truckly-spotlight")) {
        body.insertAdjacentHTML("beforeend", detailSpotlightMarkup(t));
      }
      return result;
    };
  }

  if (typeof applyFilters === "function" && typeof document !== "undefined" && document.getElementById("truckCards")) {
    applyFilters();
  }
})();
