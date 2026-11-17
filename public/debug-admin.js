/* Truckly Developer / Admin Debug Workbench
 * Inspects and bridges both Customer (Guest / Signed-in) and Provider (Owner / Kitchen / Moderator) flows.
 * Full-stack role simulation activates only against the local dev simulator; production server auth is never bypassed.
 */
(function () {
  "use strict";

  var IS_LOCAL = typeof location !== "undefined" && (location.hostname === "localhost" || location.hostname === "127.0.0.1");
  var URL_DEBUG = typeof location !== "undefined" && new URLSearchParams(location.search).get("debug") === "1";

  function safeGet(key, fallback) {
    try {
      var v = localStorage.getItem(key);
      return v == null ? fallback : v;
    } catch (_) {
      return fallback;
    }
  }

  function safeSet(key, value) {
    try { localStorage.setItem(key, value); } catch (_) {}
  }

  function dbgEsc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function redactDebugPath(rawUrl) {
    return String(rawUrl || "")
      .replace(/^https?:\/\/[^/]+/, "")
      .replace(/([?&](?:code|token|unsubscribe_token|secret)=)[^&#]+/gi, "$1[REDACTED]")
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "[UUID]");
  }

  var state = {
    open: false,
    localSimulator: false,
    role: safeGet("truckly_debug_role", "guest"),
    gpsPreset: "none",
    hoursPreset: "live",
    activePager: null,
    serverCounts: null,
    logs: []
  };

  var ALLOWED_ROLES = [
    "guest",
    "customer",
    "customer_b",
    "vendor_a_owner",
    "vendor_a_staff",
    "vendor_b_owner",
    "moderator",
    "admin"
  ];
  if (!ALLOWED_ROLES.includes(state.role)) state.role = "guest";

  var ROLE_META = {
    guest: { short: "Guest", label: "Guest Visitor", sub: "Anonymous · 401 on auth routes", badge: "401 / anon", user: null },
    customer: {
      short: "Cust A",
      label: "Signed-in Customer A",
      sub: "alex@sonoma.local",
      badge: "requester A",
      user: { id: "usr_demo_customer", email: "alex@sonoma.local", name: "Alex Rivera" }
    },
    customer_b: {
      short: "Cust B",
      label: "Signed-in Customer B",
      sub: "jordan@sonoma.local",
      badge: "requester B",
      user: { id: "usr_demo_customer_b", email: "jordan@sonoma.local", name: "Jordan Kim" }
    },
    vendor_a_owner: {
      short: "Owner A",
      label: "Vendor A Owner (Iñiguez)",
      sub: "iniguez-owner@truckly.local",
      badge: "iniguez · owner",
      user: { id: "usr_vendor_a_owner", email: "iniguez-owner@truckly.local", name: "Iñiguez Owner" }
    },
    vendor_a_staff: {
      short: "Staff A",
      label: "Vendor A Staff (Iñiguez)",
      sub: "iniguez-staff@truckly.local",
      badge: "iniguez · staff",
      user: { id: "usr_vendor_a_staff", email: "iniguez-staff@truckly.local", name: "Iñiguez Staff" }
    },
    vendor_b_owner: {
      short: "Owner B",
      label: "Vendor B Owner (Mitote)",
      sub: "mitote-owner@truckly.local",
      badge: "mitote · owner",
      user: { id: "usr_vendor_b_owner", email: "mitote-owner@truckly.local", name: "Mitote Owner" }
    },
    moderator: {
      short: "Mod",
      label: "Community Moderator",
      sub: "moderator@truckly.local",
      badge: "community mod",
      user: { id: "usr_demo_moderator", email: "moderator@truckly.local", name: "Community Moderator" }
    },
    admin: {
      short: "Admin",
      label: "Platform Administrator",
      sub: "admin@truckly.local",
      badge: "global admin",
      user: { id: "usr_platform_admin", email: "admin@truckly.local", name: "Platform Admin" }
    }
  };

  var GPS_PRESETS = {
    "santa-rosa": { label: "Near Santa Rosa", lat: 38.4405, lng: -122.7144 },
    "petaluma": { label: "Near Petaluma", lat: 38.2437, lng: -122.6269 },
    "sebastopol": { label: "Near Sebastopol", lat: 38.4021, lng: -122.8239 },
    "sonoma": { label: "Near Sonoma", lat: 38.2919, lng: -122.4580 }
  };

  function syncRoleCookieAndWindow() {
    if (IS_LOCAL && typeof document !== "undefined") {
      try {
        document.cookie = "truckly_debug_role=" + encodeURIComponent(state.role) + "; path=/; SameSite=Lax";
      } catch (_) {}
      window.__HATCHABLE__ = window.__HATCHABLE__ || {};
      window.__HATCHABLE__.user = (ROLE_META[state.role] || ROLE_META.guest).user;
    }
  }

  // Wrap window.fetch to log /api/* requests and pass local debug role header
  if (typeof window !== "undefined" && typeof window.fetch === "function" && !window.__trucklyFetchWrapped) {
    window.__trucklyFetchWrapped = true;
    var nativeFetch = window.fetch.bind(window);
    window.fetch = async function (input, init) {
      var urlStr = typeof input === "string" ? input : (input && input.url) || "";
      var method = (init && init.method) || (typeof input === "object" && input && input.method) || "GET";
      var isApi = urlStr.startsWith("/api/") || urlStr.includes("/api/");
      var isLocalDebug = urlStr.startsWith("/__debug/");
      var opts = init ? Object.assign({}, init) : {};

      if (IS_LOCAL && (isApi || isLocalDebug)) {
        var hdrs = Object.assign({}, opts.headers || {});
        if (!hdrs["x-truckly-debug-role"]) {
          hdrs["x-truckly-debug-role"] = state.role;
        }
        opts.headers = hdrs;
      }

      var t0 = Date.now();
      try {
        var res = await nativeFetch(input, opts);
        if (isApi) {
          var cleanPath = redactDebugPath(urlStr);
          state.logs.unshift({
            method: String(method).toUpperCase(),
            path: cleanPath,
            status: res.status,
            ms: Date.now() - t0
          });
          if (state.logs.length > 16) state.logs.length = 16;
          if (state.open) renderLogsAndStats();
        }
        return res;
      } catch (err) {
        if (isApi) {
          state.logs.unshift({
            method: String(method).toUpperCase(),
            path: redactDebugPath(urlStr),
            status: 0,
            ms: Date.now() - t0
          });
          if (state.logs.length > 16) state.logs.length = 16;
          if (state.open) renderLogsAndStats();
        }
        throw err;
      }
    };
  }

  async function refreshServerDebugState() {
    if (!IS_LOCAL) return;
    try {
      var r = await fetch("/__debug/state");
      if (r.ok) {
        var d = await r.json();
        state.localSimulator = !!d.local_simulator;
        state.serverCounts = d.counts || null;
        if (Array.isArray(d.pagers) && d.pagers[0]) {
          state.activePager = d.pagers[0];
        }
      }
    } catch (_) {}
  }

  function updateLaunchButton() {
    var btn = document.getElementById("debugMenuBtn");
    if (!btn) return;
    var enabled = IS_LOCAL || URL_DEBUG || safeGet("truckly_debug_enabled", "0") === "1" || state.open;
    btn.hidden = !enabled;
    btn.dataset.role = state.role;
    var meta = ROLE_META[state.role] || ROLE_META.guest;
    btn.innerHTML = '<span class="debug-launch-dot" aria-hidden="true"></span><span>🛠️</span><span class="debug-launch-text">' + dbgEsc(meta.short) + "</span>";
    btn.title = "Admin & Debug Workbench (Alt+D) · Current role: " + meta.label;
  }

  async function setRole(role) {
    if (!ROLE_META[role]) return;
    state.role = role;
    safeSet("truckly_debug_role", role);
    syncRoleCookieAndWindow();
    updateLaunchButton();

    if (role === "guest" && typeof favs !== "undefined") {
      // Reload guest local state cleanly
      isSignedIn = false;
      currentUser = null;
      if (typeof updateAuthUI === "function") updateAuthUI();
      if (typeof renderNotificationUI === "function") renderNotificationUI();
    } else if (typeof syncAuthAndUserData === "function") {
      await syncAuthAndUserData();
    }

    var ownerEl = document.getElementById("ownerScreen");
    if (ownerEl && ownerEl.classList.contains("active") && typeof loadOwnerDashboard === "function") {
      await loadOwnerDashboard();
    }
    var commEl = document.getElementById("communityScreen");
    if (commEl && commEl.classList.contains("active") && typeof communityLoad === "function") {
      await communityLoad();
    }

    await refreshServerDebugState();
    renderDrawer();
    if (typeof toast === "function") {
      toast("Debug role → " + ROLE_META[role].label);
    }
  }

  async function jumpCustomer(target) {
    if (target === "map") {
      showScreen("discover");
      setMode("map");
    } else if (target === "list") {
      showScreen("discover");
      setMode("list");
    } else if (target === "pager") {
      if (typeof openPager === "function") openPager();
    } else if (target === "bookings") {
      showScreen("bookings");
    } else if (target === "favorites") {
      showScreen("favorites");
    } else if (target === "community") {
      if (typeof openCommunity === "function") await openCommunity();
    } else if (target === "guides") {
      if (typeof openLocalGuides === "function") await openLocalGuides("passport");
    }
    renderDrawer();
  }

  async function jumpProvider(target) {
    if (IS_LOCAL) {
      if (target === "moderation" && !["moderator", "admin"].includes(state.role)) {
        await setRole("moderator");
      } else if (target !== "moderation" && !["vendor_a_owner", "vendor_a_staff", "vendor_b_owner", "admin"].includes(state.role)) {
        await setRole("vendor_a_owner");
      }
    }
    if (target === "owner") {
      showScreen("owner");
    } else if (target === "kitchen") {
      showScreen("owner");
      var kp = document.getElementById("kitchenPanel");
      if (kp) kp.hidden = false;
      if (typeof loadKitchen === "function") await loadKitchen();
      kp?.scrollIntoView({ block: "center", behavior: "smooth" });
    } else if (target === "moderation") {
      if (typeof communityOpenModeration === "function") await communityOpenModeration();
      document.getElementById("communityModeration")?.scrollIntoView({ block: "center", behavior: "smooth" });
    } else if (target === "marketing") {
      if (typeof openSmart === "function") await openSmart("marketing");
    }
    renderDrawer();
  }

  async function spawnLivePager() {
    if (!IS_LOCAL) {
      if (typeof openPager === "function") openPager();
      if (typeof startPagerDemo === "function") startPagerDemo();
      return;
    }
    var ticketNum = String(Math.floor(10 + Math.random() * 89));
    try {
      var r = await fetch("/api/pager/staff", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-truckly-debug-role": "vendor_b_owner"
        },
        body: JSON.stringify({
          vendor_id: "mitote",
          ticket: ticketNum,
          request_key: crypto.randomUUID()
        })
      });
      var out = await r.json();
      if (!r.ok || !out.pager) throw new Error(out.error || "Failed to create ticket");
      state.activePager = out.pager;

      // Switch to Customer Pager screen and join this real ticket!
      if (typeof openPager === "function") openPager();
      var codeInput = document.getElementById("pagerCode");
      if (codeInput) codeInput.value = out.pager.id;
      if (typeof joinPager === "function") await joinPager();

      await refreshServerDebugState();
      renderDrawer();
      if (typeof toast === "function") {
        toast("Live Ticket #" + ticketNum + " created — use Kitchen Remote to update status!");
      }
    } catch (e) {
      if (typeof toast === "function") toast(e.message || "Could not create live pager");
    }
  }

  async function setLivePagerStatus(status) {
    if (!state.activePager || !IS_LOCAL) return;
    try {
      var r = await fetch("/api/pager/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-truckly-debug-role": "vendor_b_owner"
        },
        body: JSON.stringify({ id: state.activePager.id, status: status })
      });
      var out = await r.json();
      if (r.ok && out.pager) {
        state.activePager = out.pager;
        if (typeof refreshPager === "function") await refreshPager();
        var kp = document.getElementById("kitchenPanel");
        if (kp && !kp.hidden && typeof loadKitchen === "function") await loadKitchen();
      }
      await refreshServerDebugState();
      renderDrawer();
    } catch (_) {}
  }

  async function seedBooking() {
    if (!IS_LOCAL) {
      if (typeof openBooking === "function") openBooking("mitote");
      return;
    }
    try {
      var iso = typeof futureDateISO === "function"
        ? futureDateISO(9)
        : new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date(Date.now() + 9 * 86400000));
      var r = await fetch("/api/bookings/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-truckly-debug-role": "customer"
        },
        body: JSON.stringify({
          truck_id: "iniguez",
          truck_name: "Tacos Iñiguez",
          package_id: "party",
          event_type: "Office lunch",
          event_date: iso,
          guest_count: 75,
          location: "Courthouse Square, Santa Rosa",
          note: "Seeded from Admin/Debug Workbench"
        })
      });
      if (r.ok) {
        await jumpProvider("owner");
        await refreshServerDebugState();
        renderDrawer();
        if (typeof toast === "function") toast("Seeded 75-guest booking → opened Provider inbox");
      }
    } catch (_) {}
  }

  async function seedWhisper() {
    if (!IS_LOCAL) {
      if (typeof openCommunity === "function") await openCommunity();
      if (typeof communityStartPost === "function") communityStartPost("whisper", "Spotted a weekend tamale special");
      return;
    }
    try {
      var r = await fetch("/api/community/post", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-truckly-debug-role": "customer"
        },
        body: JSON.stringify({
          kind: "whisper",
          place_id: "elroys",
          place_name: "El Roy's Express Mex",
          town: "Santa Rosa",
          nickname: "Sebastopol Foodie",
          title: "Early lunch line moves fast before noon",
          body: "Stopped by Sebastopol Rd around 11:30 AM and got burritos in five minutes flat — confirm current hours first!"
        })
      });
      if (r.ok) {
        await jumpProvider("moderation");
        await refreshServerDebugState();
        renderDrawer();
        if (typeof toast === "function") toast("Seeded pending whisper → opened Moderation Queue");
      }
    } catch (_) {}
  }

  async function simulateGps(preset) {
    state.gpsPreset = preset;
    if (preset === "none") {
      userCoords = null;
      if (userMarker && map) {
        map.removeLayer(userMarker);
        userMarker = null;
      }
      if (typeof refreshDiscoveryCatalog === "function") {
        await refreshDiscoveryCatalog({ fresh: true });
      }
      var lbl = document.getElementById("locationLabel");
      if (lbl) lbl.textContent = "Sonoma County";
      if (map) map.flyTo([38.43, -122.70], 11, { duration: 0.5 });
      applyFilters();
      renderFavorites();
      renderDrawer();
      toast("GPS simulation cleared");
      return;
    }

    var target = GPS_PRESETS[preset];
    if (!target) return;
    userCoords = { lat: target.lat, lng: target.lng };
    recomputeDistances();
    if (map) {
      var userIcon = L.divIcon({
        className: "",
        html: '<div class="user-pin" title="Simulated GPS"></div>',
        iconSize: [18, 18],
        iconAnchor: [9, 9]
      });
      if (userMarker) userMarker.setLatLng([target.lat, target.lng]);
      else userMarker = L.marker([target.lat, target.lng], { icon: userIcon }).addTo(map);
      map.flyTo([target.lat, target.lng], 13, { duration: 0.55 });
    }
    var locEl = document.getElementById("locationLabel");
    if (locEl) locEl.textContent = target.label;
    applyFilters();
    renderFavorites();
    renderDrawer();
    toast("Simulated GPS → " + target.label);
  }

  async function simulateHours(mode) {
    state.hoursPreset = mode;
    if (mode === "live") {
      if (typeof refreshDiscoveryCatalog === "function") {
        await refreshDiscoveryCatalog({ fresh: true });
      }
      applyFilters();
      renderDrawer();
      toast("Restored live Pacific clock hours");
      return;
    }

    trucks.forEach(function (t) {
      if (mode === "tue-lunch") {
        t.open = t.id === "dogaday" || String(t.id).startsWith("market-") ? true : (t.id === "fruta" ? false : null);
      } else if (mode === "afternoon") {
        t.open = t.id === "fruta" ? true : (t.id === "dogaday" || String(t.id).startsWith("market-") ? false : null);
      } else if (mode === "late-night") {
        t.open = t.id === "fruta" || t.id === "dogaday" || String(t.id).startsWith("market-") ? false : null;
      }
    });
    if (!openOnly) toggleOpen();
    else applyFilters();
    renderDrawer();
    toast("Simulated hours → " + mode);
  }

  async function resetAll() {
    try {
      [
        "truckly_favs",
        "truckly_bookings",
        "truckly_catalog",
        "truckly_notify",
        "truckly_owner_truck_id",
        "truckly_owner_profile",
        "truckly_owner_schedule",
        "truckly_guide_passport_v1"
      ].forEach(function (k) { localStorage.removeItem(k); });
    } catch (_) {}

    if (IS_LOCAL) {
      await fetch("/__debug/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset" })
      }).catch(function () {});
    }
    state.activePager = null;
    state.role = "guest";
    safeSet("truckly_debug_role", "guest");
    syncRoleCookieAndWindow();
    location.reload();
  }

  function renderLogsAndStats() {
    var statsBox = document.getElementById("debugStatsGrid");
    if (statsBox) {
      var totalSpots = typeof trucks !== "undefined" ? trucks.length : 0;
      var visibleSpots = typeof filtered === "function" ? filtered().length : 0;
      var savedCount = typeof favs !== "undefined" ? favs.size : 0;
      var sc = state.serverCounts;
      statsBox.innerHTML =
        '<div class="debug-kv"><b>' + totalSpots + '</b><span>Catalog</span></div>' +
        '<div class="debug-kv"><b>' + visibleSpots + '</b><span>Filtered</span></div>' +
        '<div class="debug-kv"><b>' + savedCount + '</b><span>Saved</span></div>' +
        '<div class="debug-kv"><b>' + (sc ? sc.bookings : (typeof bookings !== "undefined" ? bookings.length : 0)) + '</b><span>Bookings</span></div>' +
        '<div class="debug-kv"><b>' + (sc ? sc.active_pagers : "—") + '</b><span>Live Pagers</span></div>' +
        '<div class="debug-kv"><b>' + (sc ? sc.pending_reviews : "—") + '</b><span>Mod Queue</span></div>';
    }

    var logBox = document.getElementById("debugNetworkLog");
    if (logBox) {
      logBox.innerHTML = state.logs.length
        ? state.logs.map(function (l) {
            var cls = l.status >= 200 && l.status < 300
              ? "debug-status-2xx"
              : (l.status >= 400 && l.status < 500 ? "debug-status-4xx" : "debug-status-5xx");
            return '<div class="debug-log-row"><span class="debug-status-pill ' + cls + '">' + (l.status || "ERR") + '</span><span class="debug-log-path">' + dbgEsc(l.method + " " + l.path) + '</span><span class="debug-log-ms">' + l.ms + "ms</span></div>";
          }).join("")
        : '<div class="debug-note">No /api/* requests logged yet.</div>';
    }
  }

  function renderDrawer() {
    var drawer = document.getElementById("debugDrawer");
    if (!drawer) return;
    drawer.hidden = !state.open;
    if (!state.open) return;

    var activePagerHtml = state.activePager && !["collected", "cancelled"].includes(state.activePager.status)
      ? '<div class="debug-pager-remote">' +
        "<strong>🔔 Kitchen Remote · Ticket #" + dbgEsc(state.activePager.ticket) + " (" + dbgEsc(state.activePager.status) + ")</strong>" +
        '<div class="debug-chip-grid">' +
        ["cooking", "almost", "ready", "collected"].map(function (s) {
          var labels = { cooking: "🍳 Cooking", almost: "🥙 Almost", ready: "🔔 Ready!", collected: "🙌 Picked up" };
          return '<button type="button" class="debug-chip ' + (state.activePager.status === s ? "active" : "") + '" onclick="trucklyDebug.setPagerStatus(\'' + s + '\')">' + labels[s] + "</button>";
        }).join("") +
        "</div></div>"
      : "";

    var body = document.getElementById("debugDrawerBody");
    if (!body) return;

    body.innerHTML =
      '<section class="debug-section">' +
      '<div class="debug-section-title"><span>1 · Active Role Simulator</span><span>' + (IS_LOCAL ? "LOCAL FULL-STACK" : "CLIENT INSPECTOR") + "</span></div>" +
      '<div class="debug-role-grid">' +
      ALLOWED_ROLES.map(function (r) {
        var m = ROLE_META[r];
        return '<button type="button" class="debug-role-btn ' + (state.role === r ? "active" : "") + '" onclick="trucklyDebug.setRole(\'' + r + '\')">' +
          dbgEsc(m.short) + "<small>" + dbgEsc(m.badge) + "</small></button>";
      }).join("") +
      "</div>" +
      '<p class="debug-note">' + (IS_LOCAL
        ? "Local dev simulator only (" + dbgEsc((ROLE_META[state.role] || ROLE_META.guest).sub) + "). Debug headers/cookies are ignored in production."
        : "Hosted mode: server APIs enforce real Hatchable auth & vendor RBAC. Debug headers have zero effect.") + "</p>" +
      "</section>" +

      '<section class="debug-section">' +
      '<div class="debug-section-title"><span>2 · Side-by-Side View Jumper</span></div>' +
      '<div class="debug-jump-group"><span class="debug-jump-label">👤 Customer Screens</span><div class="debug-chip-grid">' +
      '<button type="button" class="debug-chip" onclick="trucklyDebug.jumpCustomer(\'list\')">📋 List</button>' +
      '<button type="button" class="debug-chip" onclick="trucklyDebug.jumpCustomer(\'map\')">🗺️ Map</button>' +
      '<button type="button" class="debug-chip" onclick="trucklyDebug.jumpCustomer(\'pager\')">🍽️ Pager</button>' +
      '<button type="button" class="debug-chip" onclick="trucklyDebug.jumpCustomer(\'bookings\')">🗓️ Bookings</button>' +
      '<button type="button" class="debug-chip" onclick="trucklyDebug.jumpCustomer(\'favorites\')">💛 Saved</button>' +
      '<button type="button" class="debug-chip" onclick="trucklyDebug.jumpCustomer(\'community\')">💬 Community</button>' +
      '<button type="button" class="debug-chip" onclick="trucklyDebug.jumpCustomer(\'guides\')">🏅 Passport</button>' +
      "</div></div>" +
      '<div class="debug-jump-group"><span class="debug-jump-label">🚚 Provider / Admin Screens</span><div class="debug-chip-grid">' +
      '<button type="button" class="debug-chip" onclick="trucklyDebug.jumpProvider(\'owner\')">🚚 Owner Hub</button>' +
      '<button type="button" class="debug-chip" onclick="trucklyDebug.jumpProvider(\'kitchen\')">🔔 Kitchen Queue</button>' +
      '<button type="button" class="debug-chip" onclick="trucklyDebug.jumpProvider(\'moderation\')">🛡️ Moderation</button>' +
      '<button type="button" class="debug-chip" onclick="trucklyDebug.jumpProvider(\'marketing\')">📣 Promo Kit</button>' +
      "</div></div>" +
      "</section>" +

      '<section class="debug-section">' +
      '<div class="debug-section-title"><span>3 · Provider ↔ Customer Round-Trips</span></div>' +
      '<div class="debug-action-stack">' +
      '<button type="button" class="debug-action-btn" onclick="trucklyDebug.spawnLivePager()"><span>🔔 Spawn Live Pager &amp; Watch as Customer</span><span>→</span></button>' +
      activePagerHtml +
      '<button type="button" class="debug-action-btn" onclick="trucklyDebug.seedBooking()"><span>🎉 Seed 75-Guest Booking → Provider Inbox</span><span>→</span></button>' +
      '<button type="button" class="debug-action-btn" onclick="trucklyDebug.seedWhisper()"><span>🕵️ Seed Whisper → Moderation Queue</span><span>→</span></button>' +
      "</div>" +
      "</section>" +

      '<section class="debug-section">' +
      '<div class="debug-section-title"><span>4 · GPS &amp; Open-Hours Simulators</span></div>' +
      '<div class="debug-jump-group"><span class="debug-jump-label">⌖ Simulate GPS Coordinates</span><div class="debug-chip-grid">' +
      '<button type="button" class="debug-chip ' + (state.gpsPreset === "santa-rosa" ? "active" : "") + '" onclick="trucklyDebug.simulateGps(\'santa-rosa\')">Santa Rosa</button>' +
      '<button type="button" class="debug-chip ' + (state.gpsPreset === "petaluma" ? "active" : "") + '" onclick="trucklyDebug.simulateGps(\'petaluma\')">Petaluma</button>' +
      '<button type="button" class="debug-chip ' + (state.gpsPreset === "sebastopol" ? "active" : "") + '" onclick="trucklyDebug.simulateGps(\'sebastopol\')">Sebastopol</button>' +
      '<button type="button" class="debug-chip ' + (state.gpsPreset === "sonoma" ? "active" : "") + '" onclick="trucklyDebug.simulateGps(\'sonoma\')">Sonoma</button>' +
      '<button type="button" class="debug-chip" onclick="trucklyDebug.simulateGps(\'none\')">Clear GPS</button>' +
      "</div></div>" +
      '<div class="debug-jump-group"><span class="debug-jump-label">🕒 Simulate Open-Now Schedule Window</span><div class="debug-chip-grid">' +
      '<button type="button" class="debug-chip ' + (state.hoursPreset === "live" ? "active" : "") + '" onclick="trucklyDebug.simulateHours(\'live\')">Live Clock</button>' +
      '<button type="button" class="debug-chip ' + (state.hoursPreset === "tue-lunch" ? "active" : "") + '" onclick="trucklyDebug.simulateHours(\'tue-lunch\')">Tue 11 AM (Markets)</button>' +
      '<button type="button" class="debug-chip ' + (state.hoursPreset === "afternoon" ? "active" : "") + '" onclick="trucklyDebug.simulateHours(\'afternoon\')">3 PM (Fru-ta)</button>' +
      '<button type="button" class="debug-chip ' + (state.hoursPreset === "late-night" ? "active" : "") + '" onclick="trucklyDebug.simulateHours(\'late-night\')">11:30 PM (0 Open)</button>' +
      "</div></div>" +
      "</section>" +

      '<section class="debug-section">' +
      '<div class="debug-section-title"><span>5 · Live State &amp; API Log</span><button type="button" class="debug-chip" onclick="trucklyDebug.refresh()">↻</button></div>' +
      '<div id="debugStatsGrid" class="debug-kv-grid"></div>' +
      '<div class="debug-jump-group"><span class="debug-jump-label">Recent /api/* Calls</span><div id="debugNetworkLog" class="debug-log"></div></div>' +
      '<div style="margin-top:10px"><button type="button" class="debug-action-btn danger" onclick="trucklyDebug.resetAll()"><span>🧹 Reset Local Storage &amp; Debug DB</span><span>↺</span></button></div>' +
      "</section>";

    renderLogsAndStats();
  }

  async function openDrawer() {
    safeSet("truckly_debug_enabled", "1");
    state.open = true;
    updateLaunchButton();
    await refreshServerDebugState();
    renderDrawer();
  }

  function closeDrawer() {
    state.open = false;
    renderDrawer();
  }

  function toggleDrawer() {
    if (state.open) closeDrawer();
    else openDrawer();
  }

  function mountUI() {
    if (typeof document === "undefined" || !document.body) return;
    syncRoleCookieAndWindow();

    var actions = document.querySelector(".topbar .header-actions");
    if (actions && !document.getElementById("debugMenuBtn")) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.id = "debugMenuBtn";
      btn.className = "debug-launch-btn";
      btn.onclick = toggleDrawer;
      actions.insertBefore(btn, actions.firstChild);
    }

    var dropdown = document.querySelector(".profile-dropdown");
    if (dropdown && !document.getElementById("debugProfileItem")) {
      var item = document.createElement("button");
      item.type = "button";
      item.id = "debugProfileItem";
      item.textContent = "🛠️ Admin & Debug menu";
      item.onclick = function () {
        var menu = document.getElementById("profileMenu");
        if (menu) menu.open = false;
        openDrawer();
      };
      dropdown.appendChild(item);
    }

    if (!document.getElementById("debugDrawer")) {
      var aside = document.createElement("aside");
      aside.id = "debugDrawer";
      aside.className = "debug-drawer";
      aside.setAttribute("aria-label", "Admin and Debug Workbench");
      aside.hidden = true;
      aside.innerHTML =
        '<div class="debug-drawer-head">' +
        '<div><h2>🛠️ Admin &amp; Debug</h2><small>Customer ↔ Provider Workbench (Alt+D)</small></div>' +
        '<button type="button" class="debug-close-btn" aria-label="Close debug menu" onclick="trucklyDebug.close()">×</button>' +
        "</div>" +
        '<div id="debugDrawerBody" class="debug-drawer-body"></div>';
      document.body.appendChild(aside);
    }

    updateLaunchButton();

    if (IS_LOCAL && state.role !== "guest" && window.trucklyReady) {
      window.trucklyReady.then(function () {
        setRole(state.role);
      }).catch(function () {});
    }

    document.addEventListener("keydown", function (e) {
      if (e.altKey && (e.key === "d" || e.key === "D")) {
        e.preventDefault();
        toggleDrawer();
      }
    });
  }

  window.trucklyDebug = {
    open: openDrawer,
    close: closeDrawer,
    toggle: toggleDrawer,
    refresh: async function () {
      await refreshServerDebugState();
      renderDrawer();
    },
    setRole: setRole,
    jumpCustomer: jumpCustomer,
    jumpProvider: jumpProvider,
    spawnLivePager: spawnLivePager,
    setPagerStatus: setLivePagerStatus,
    seedBooking: seedBooking,
    seedWhisper: seedWhisper,
    simulateGps: simulateGps,
    simulateHours: simulateHours,
    resetAll: resetAll
  };

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", mountUI, { once: true });
    } else {
      mountUI();
    }
  }
})();
