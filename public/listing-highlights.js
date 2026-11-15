/* Truckly listing photo + menu spotlights — review-only patch.
 * Based on v77 catalog audit; apply to live v77 ONLY after rebase and QA.
 * No externally hosted photo is claimed to depict a named business.
 */
(function () {
  "use strict";
  var PICKS = Object.freeze({
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
    return String(value == null ? "" : value).replace(/[&<>"']/g,function(ch){
      return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch];
    });
  }
  function removeGenericStockPhoto(t) {
    if (!t) return;
    if (t.verification_status !== "business_confirmed") t.verified = false;
    if (t.photo_rights_verified !== true) t.photo = null;
    if (typeof t.photo === "string" && /^https:\/\/images\.unsplash\.com\//i.test(t.photo)) {
      t.photo = null; // generic stock ≠ a business's actual dish or venue
    }
  }
  function getPick(t) { return t && PICKS[t.id] || null; }
  function noteMarkup(t, forDetail) {
    if (!t) return "";
    var pick=getPick(t);
    var category=esc(t.kind || t.cuisine || "Local food");
    var represent=esc(t.emoji || "🍽️");
    var heading=pick ? pick.heading : "Dish and photo research pending";
    var label=pick ? pick.title : category + " to explore";
    var sub=pick ? pick.note : "Illustrative icon only. We have not confirmed this vendor's best dish or permission to display a vendor-specific food photo.";
    var source=forDetail && pick && pick.source ? '<a href="'+esc(pick.source)+'" target="_blank" rel="noopener noreferrer">Check published source ↗</a>' : "";
    return '<section class="truckly-spotlight" aria-label="Restaurant spotlight">'+
      '<span class="truckly-spotlight-icon" aria-hidden="true">'+represent+'</span>'+
      '<span class="truckly-spotlight-body"><small>'+esc(heading)+'</small><strong>'+esc(label)+'</strong>'+
      (forDetail ? '<span class="truckly-spotlight-explainer">'+esc(sub)+'</span>'+source : '')+
      '</span></section>';
  }
  function addToCard(html,t) {
    if (typeof html !== "string" || !html.includes("</article>")) return html;
    return html.replace(/<\/article>\s*$/i,noteMarkup(t,false)+"</article>");
  }
  if (typeof trucks !== "undefined" && Array.isArray(trucks)) trucks.forEach(removeGenericStockPhoto);
  if (typeof cardHTML === "function") {
    var baseCardHTML=cardHTML;
    cardHTML=function(t){removeGenericStockPhoto(t);if(t && t.extra)return baseCardHTML(t);return addToCard(baseCardHTML(t),t);};
  }
  if (typeof extraCard === "function") {
    var baseExtraCard=extraCard;
    extraCard=function(t){removeGenericStockPhoto(t); return addToCard(baseExtraCard(t),t);};
  }
  if (typeof openDetail === "function") {
    var baseOpenDetail=openDetail;
    openDetail=function(id){
      var t=typeof trucks !== "undefined" && Array.isArray(trucks) ? trucks.find(function(x){return x.id===id;}) : null;
      removeGenericStockPhoto(t);
      var result=baseOpenDetail(id);
      var body=document.querySelector("#detailContent .detail-body");
      if(body && t && !body.querySelector(".truckly-spotlight"))body.insertAdjacentHTML("beforeend",noteMarkup(t,true));
      return result;
    };
  }
  if (!document.getElementById("truckly-spotlight-style")) {
    var css=document.createElement("style");
    css.id="truckly-spotlight-style";
    css.textContent=".truck-card{overflow:hidden;transition:box-shadow .18s ease,transform .18s ease}.truck-card:hover{transform:translateY(-2px);box-shadow:0 12px 28px rgba(27,51,36,.10)}.truck-photo.icon-photo,.detail-hero.icon-photo{position:relative;isolation:isolate;background-image:radial-gradient(circle at 25% 15%,rgba(255,255,255,.83) 0 8%,transparent 32%),radial-gradient(circle at 75% 85%,rgba(38,71,54,.22) 0 5%,transparent 48%),linear-gradient(130deg,#f1ca86 0%,#efd8ae 53%,#d1dfb8 100%) !important}.truck-photo.icon-photo:before,.detail-hero.icon-photo:before{content:' ';position:absolute;inset:12%;border:2px dashed rgba(37,74,51,.15);border-radius:30px;transform:rotate(-12deg);z-index:-1}.truck-photo.icon-photo .photo-emoji,.detail-hero.icon-photo .photo-emoji{display:block;font-size:clamp(54px,9vw,110px);text-shadow:0 9px 1px rgba(26,49,29,.11);transform:rotate(-7deg);filter:drop-shadow(0 8px 9px rgba(47,49,38,.15))}.truckly-spotlight{display:flex;align-items:flex-start;gap:10px;margin:12px 0 4px;padding:11px 12px;border:1px solid rgba(32,77,56,.15);border-radius:12px;background:#fbf6e9;color:#214b3b;text-align:left}.truckly-spotlight-icon{font-size:23px;line-height:1.35;flex:none}.truckly-spotlight-body{display:flex;flex-direction:column;gap:3px;min-width:0}.truckly-spotlight-body small{font-size:10px;letter-spacing:.06em;font-weight:700;text-transform:uppercase;color:#68745a}.truckly-spotlight-body strong{font-size:13px;line-height:1.3}.truckly-spotlight-explainer{font-size:12px;line-height:1.5;color:#435b4a}.truckly-spotlight a{font-size:12px;color:#1c664e;text-decoration:underline;text-underline-offset:2px}";
    document.head.appendChild(css);
  }
})();