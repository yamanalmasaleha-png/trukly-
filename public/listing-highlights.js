/* Truckly listing photo + menu spotlights — review-only patch.
 * Based on v77 catalog audit; apply to live v77 ONLY after rebase and QA.
 * No externally hosted photo is claimed to depict a named business.
 */
(function () {
  "use strict";
  var PICKS = Object.freeze({
    "mitote": {heading:"Venue spotlight",title:"Rotating Mexican food trucks",note:"This is a food park, not one restaurant with a single best dish. New site: 100 Sebastopol Rd.",source:"https://www.sonomamag.com/mitote-food-park-soft-opens-at-new-location/"},
    "xies": {heading:"Menu best-seller selection",title:"Golden Tray",note:"The published menu calls this an assortment of four best-selling rolls; not a ranked single best dish.",source:"https://toast.app/r/xies-sushi-rolls-llc-xies707/order"},
    "dinos": {heading:"Menu pick",title:"Lamb Gyro",note:"Listed on Dino's official menu. No sales ranking has been verified.",source:"https://www.dinosgreekfoodtruck.com/"},
    "fruta": {heading:"Featured menu item",title:"Bionico fruit bowl",note:"Listed as a featured item on the truck's ordering menu.",source:"https://toast.app/r/fru-ta-food-truck-2970-santa-rosa-ave/order"},
    "kolobok": {heading:"Signature menu item",title:"Loaded Baked Potato",note:"Named a signature dish on the published truck menu; check current availability.",source:"https://www.bestfoodtrucks.com/truck/kolobok-russian-soul-food-truck/menu"},
    "lucha": {heading:"Previously documented dish",title:"Mushroom Tacos",note:"Documented at Mitote in earlier reporting; confirm the present-day menu before visiting.",source:"https://www.sonomamag.com/mitote-food-park-soft-opens-at-new-location/"},
    "coffee-crooks": {heading:"Menu pick",title:"Crème Brûlée Latte",note:"The menu also lists Mexican mocha and café con miele; none is confirmed as the top seller.",source:"https://shadyraveninc.com/menu"}
  });
  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g,function(ch){
      return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch];
    });
  }
  function removeGenericStockPhoto(t) {
    if (t && typeof t.photo === "string" && /^https:\/\/images\.unsplash\.com\//i.test(t.photo)) {
      t.photo = null; // generic stock ≠ a business's actual dish or venue
    }
  }
  function getPick(t) { return t && PICKS[t.id] || null; }
  function noteMarkup(t, forDetail) {
    if (!t) return "";
    var pick=getPick(t);
    var category=esc(t.kind || t.cuisine || "Local food");
    var represent=esc(t.emoji || "🍽️");
    var heading=pick ? pick.heading : "Dish + photo verification pending";
    var label=pick ? pick.title : "Explore " + category;
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
    cardHTML=function(t){removeGenericStockPhoto(t); return addToCard(baseCardHTML(t),t);};
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
    css.textContent=".truckly-spotlight{display:flex;align-items:flex-start;gap:10px;margin:12px 0 4px;padding:11px 12px;border:1px solid rgba(32,77,56,.15);border-radius:12px;background:#fbf6e9;color:#214b3b;text-align:left}.truckly-spotlight-icon{font-size:23px;line-height:1.35;flex:none}.truckly-spotlight-body{display:flex;flex-direction:column;gap:3px;min-width:0}.truckly-spotlight-body small{font-size:10px;letter-spacing:.06em;font-weight:700;text-transform:uppercase;color:#68745a}.truckly-spotlight-body strong{font-size:13px;line-height:1.3}.truckly-spotlight-explainer{font-size:12px;line-height:1.5;color:#435b4a}.truckly-spotlight a{font-size:12px;color:#1c664e;text-decoration:underline;text-underline-offset:2px}";
    document.head.appendChild(css);
  }
})();