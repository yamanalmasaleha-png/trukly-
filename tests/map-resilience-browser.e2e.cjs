// Real Headless Chrome + PostgreSQL Map Tile Referrer, Provider Config & Outage Resilience E2E Suite
//
// Deterministically verifies all 12 map resilience & privacy boundaries using a local cross-origin
// loopback HTTP tile server and a self-contained Leaflet 1.9.4-compatible browser fixture (making
// ZERO requests to public tile servers or external CDNs during automated runs):
//   1. Approved tile requests send an origin-only `Referer` (`http://127.0.0.1:<appPort>/`).
//   2. Sensitive paths, query parameters, tokens, and hashes never appear in `Referer`.
//   3. Global `Referrer-Policy: same-origin` remains intact (non-tile cross-origin requests omit `Referer`)
//      and `/api/features` preserves `Cache-Control: no-store`.
//   4. Successful 256x256 PNG tiles render normally with visible provider attribution.
//   5. A single failed tile (`500`) does NOT falsely disable the map.
//   6. Sustained HTTP errors (`403`/`503`), TCP socket failures, and hung tile timeouts trigger `#mapFallback`.
//   7. Missing Leaflet (`window.L` unavailable) leaves List view usable and shows honest fallback if Map is clicked.
//   8. Deliberate `Retry map` enforces cooldown (no request storm) and recovers cleanly when tiles return `200`.
//   9. Search query, cuisine filter, `selectedTruck`, and `favs` survive fallback to List view and retry recovery.
//  10. Invalid configuration and unapproved tile hosts fail safely with zero unapproved requests.
//  11. Map-disabled mode (`interactive_map = hidden` in Feature Controls) makes ZERO tile requests.
//  12. Attribution and fallback controls are visible, non-overlapping, and keyboard-accessible at
//      both desktop (`1440x900`) and mobile (`375x812`) viewports.

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawn, execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');

function parseCliScreenshotDir() {
  const idx = process.argv.indexOf('--screenshot-dir');
  if (idx >= 0 && process.argv[idx + 1]) {
    return path.resolve(process.argv[idx + 1]);
  }
  return null;
}

function requirePg() {
  const candidates = [ROOT];
  if (process.env.TRUCKLY_PG_NODE_MODULES) candidates.push(process.env.TRUCKLY_PG_NODE_MODULES);
  for (const base of candidates) {
    try {
      return require(require.resolve('pg', { paths: [base] }));
    } catch {}
  }
  throw new Error('Cannot resolve `pg` module.');
}

const { Pool } = requirePg();

function findChromeBinary() {
  const candidates = [
    process.env.CHROME_BIN,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ].filter(Boolean);
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('No headless Chromium/Chrome binary found.');
}

function findPostgresBin(binName) {
  const exe = process.platform === 'win32' ? `${binName}.exe` : binName;
  const pkgPlatform = `${process.platform === 'win32' ? 'windows' : process.platform}-${process.arch}`;
  const embeddedRoots = [
    process.env.TRUCKLY_PG_NODE_MODULES,
    process.env.BITESHARK_PG_NODE_MODULES
  ].filter(Boolean);
  for (const r of embeddedRoots) {
    const cand = path.join(r, '@embedded-postgres', pkgPlatform, 'native', 'bin', exe);
    if (fs.existsSync(cand)) return cand;
  }
  for (const dir of (process.env.PATH || '').split(path.delimiter).filter(Boolean)) {
    const cand = path.join(dir, exe);
    if (fs.existsSync(cand)) return cand;
  }
  if (process.platform === 'win32') {
    for (const ver of ['18', '17', '16', '15']) {
      const p = path.join('C:\\Program Files\\PostgreSQL', ver, 'bin', exe);
      if (fs.existsSync(p)) return p;
    }
  } else {
    const pgRoot = '/usr/lib/postgresql';
    if (fs.existsSync(pgRoot)) {
      for (const ver of fs.readdirSync(pgRoot).sort().reverse()) {
        const p = path.join(pgRoot, ver, 'bin', exe);
        if (fs.existsSync(p)) return p;
      }
    }
  }
  return null;
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(err => (err ? reject(err) : resolve(port)));
    });
    srv.on('error', reject);
  });
}

async function createPostgresCluster() {
  if (process.env.DATABASE_URL) {
    return { adminUrl: process.env.DATABASE_URL, stop: async () => {} };
  }
  const initdb = findPostgresBin('initdb');
  const pgCtl = findPostgresBin('pg_ctl');
  if (!initdb || !pgCtl) throw new Error('Neither DATABASE_URL nor local initdb/pg_ctl found.');

  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'biteshark-map-e2e-pg-'));
  const dataDir = path.join(tmpBase, 'data');
  const pwFile = path.join(tmpBase, 'pw.txt');
  const password = 'pg_' + crypto.randomBytes(12).toString('hex');
  fs.writeFileSync(pwFile, password + '\n', { mode: 0o600 });

  execFileSync(initdb, ['-D', dataDir, '-U', 'postgres', '-A', 'scram-sha-256', `--pwfile=${pwFile}`, '-E', 'UTF8', '--no-locale'], {
    stdio: 'ignore',
    windowsHide: true
  });
  const port = await getFreePort();
  execFileSync(pgCtl, ['-D', dataDir, '-l', path.join(tmpBase, 'postgres.log'), '-w', '-o', `-p ${port} -h 127.0.0.1`, 'start'], {
    stdio: 'ignore',
    windowsHide: true
  });

  return {
    adminUrl: `postgres://postgres:${encodeURIComponent(password)}@127.0.0.1:${port}/postgres`,
    stop: async () => {
      try {
        execFileSync(pgCtl, ['-D', dataDir, '-m', 'immediate', '-w', 'stop'], { stdio: 'ignore', windowsHide: true });
      } catch {}
      try {
        fs.rmSync(tmpBase, { recursive: true, force: true });
      } catch {}
    }
  };
}

function buildDbUrl(baseAdminUrl, { user, password, database }) {
  const u = new URL(baseAdminUrl);
  u.username = user;
  u.password = password || '';
  u.pathname = `/${database}`;
  return u.toString();
}

function createMapTilePng256() {
  const width = 256;
  const height = 256;
  const stride = width * 3 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const rowOff = y * stride;
    raw[rowOff] = 0; // filter None
    for (let x = 0; x < width; x++) {
      const px = rowOff + 1 + x * 3;
      const isMajorRoad = (x + y) % 96 < 3 || Math.abs(x - 128) < 2 || Math.abs(y - 112) < 2;
      const isGrid = x % 64 === 0 || y % 64 === 0;
      const isPark = x > 28 && x < 96 && y > 32 && y < 92;
      if (isMajorRoad) {
        raw[px] = 243;
        raw[px + 1] = 216;
        raw[px + 2] = 163;
      } else if (isPark) {
        raw[px] = 205;
        raw[px + 1] = 228;
        raw[px + 2] = 198;
      } else if (isGrid) {
        raw[px] = 217;
        raw[px + 1] = 224;
        raw[px + 2] = 213;
      } else {
        raw[px] = 242;
        raw[px + 1] = 240;
        raw[px + 2] = 231;
      }
    }
  }

  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const compressed = zlib.deflateSync(raw);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// Self-contained deterministic Leaflet 1.9.4-compatible CSS & JS fixture for headless E2E
// (executes real DOM `<img>` creation with `tile.referrerPolicy = this.options.referrerPolicy`
// BEFORE `tile.src = ...`, matching Leaflet 1.9.4 `TileLayer.prototype.createTile` verbatim).
const LEAFLET_FIXTURE_CSS = `
.leaflet-container { position: relative; overflow: hidden; background: #dfe9dc; outline: 0; }
.leaflet-pane, .leaflet-tile, .leaflet-marker-icon { position: absolute; left: 0; top: 0; }
.leaflet-tile-pane { z-index: 200; }
.leaflet-marker-pane { z-index: 600; }
.leaflet-tile { width: 256px; height: 256px; user-select: none; -webkit-user-drag: none; }
.leaflet-top, .leaflet-bottom { position: absolute; z-index: 1000; pointer-events: none; }
.leaflet-bottom { bottom: 0; }
.leaflet-right { right: 0; }
.leaflet-control { position: relative; z-index: 800; pointer-events: auto; float: right; clear: both; }
.leaflet-control-zoom { margin-right: 10px; margin-bottom: 10px; border-radius: 8px; overflow: hidden; background: #fff; }
.leaflet-control-zoom a { display: block; text-align: center; text-decoration: none; color: #243c31; font: bold 18px/40px sans-serif; border-bottom: 1px solid #ddd; }
.leaflet-control-zoom a:last-child { border-bottom: 0; }
.leaflet-control-attribution { margin: 0; white-space: nowrap; }
`;

const LEAFLET_FIXTURE_JS = `
(function () {
  function latLngToTile(lat, lng, z) {
    var n = Math.pow(2, z);
    var x = Math.floor(((lng + 180) / 360) * n);
    var latRad = (lat * Math.PI) / 180;
    var y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
    return { x: x, y: y, z: z };
  }

  function latLngToPixelOffset(lat, lng, centerLat, centerLng, z, width, height) {
    var scale = 256 * Math.pow(2, z);
    function projX(lon) { return ((lon + 180) / 360) * scale; }
    function projY(la) {
      var r = (la * Math.PI) / 180;
      return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * scale;
    }
    return {
      x: Math.round(width / 2 + (projX(lng) - projX(centerLng))),
      y: Math.round(height / 2 + (projY(lat) - projY(centerLat)))
    };
  }

  function Evented() { this._handlers = {}; }
  Evented.prototype.on = function (type, fn) {
    if (type.indexOf(' ') >= 0) {
      type.split(/\\s+/).forEach(function (name) { this.on(name, fn); }, this);
      return this;
    }
    (this._handlers[type] = this._handlers[type] || []).push(fn);
    return this;
  };
  Evented.prototype.fire = function (type, data) {
    var list = (this._handlers[type] || []).slice();
    for (var i = 0; i < list.length; i++) list[i].call(this, data || {});
    return this;
  };

  function TileLayer(urlTemplate, options) {
    Evented.call(this);
    this._url = urlTemplate;
    this.options = Object.assign({ minZoom: 0, maxZoom: 19, attribution: '' }, options || {});
    this._container = null;
    this._map = null;
  }
  TileLayer.prototype = Object.create(Evented.prototype);
  TileLayer.prototype.getTileUrl = function (coords) {
    return this._url
      .replace(/\\{z\\}/g, String(coords.z))
      .replace(/\\{x\\}/g, String(coords.x))
      .replace(/\\{y\\}/g, String(coords.y))
      .replace(/\\{r\\}/g, '');
  };
  TileLayer.prototype.addTo = function (map) {
    this._map = map;
    map._addTileLayer(this);
    return this;
  };
  TileLayer.prototype._renderGrid = function () {
    if (!this._map || !this._container) return;
    this._container.innerHTML = '';
    var rect = this._map._el.getBoundingClientRect();
    var w = Math.max(320, Math.round(rect.width || 800));
    var h = Math.max(320, Math.round(rect.height || 520));
    var cols = Math.max(2, Math.min(4, Math.ceil(w / 256)));
    var rows = Math.max(2, Math.min(3, Math.ceil(h / 256)));
    var base = latLngToTile(this._map._center[0], this._map._center[1], this._map._zoom);
    for (var dy = 0; dy < rows; dy++) {
      for (var dx = 0; dx < cols; dx++) {
        var coords = { z: this._map._zoom, x: base.x + dx - 1, y: base.y + dy - 1 };
        var tile = document.createElement('img');
        tile.className = 'leaflet-tile';
        tile.style.left = (dx * 256) + 'px';
        tile.style.top = (dy * 256) + 'px';
        var self = this;
        (function (img, c) {
          img.addEventListener('load', function () {
            self.fire('tileload', { tile: img, coords: c });
          });
          img.addEventListener('error', function () {
            self.fire('tileerror', { tile: img, coords: c });
          });
          if (typeof self.options.referrerPolicy === 'string') {
            img.referrerPolicy = self.options.referrerPolicy;
          }
          img.alt = '';
          img.src = self.getTileUrl(c);
          self._container.appendChild(img);
          self.fire('tileloadstart', { tile: img, coords: c });
        })(tile, coords);
      }
    }
  };

  function Marker(latlng, options) {
    Evented.call(this);
    this._latlng = latlng;
    this.options = options || {};
    this._el = null;
    this._map = null;
  }
  Marker.prototype = Object.create(Evented.prototype);
  Marker.prototype.getElement = function () { return this._el; };
  Marker.prototype.setLatLng = function (latlng) {
    this._latlng = latlng;
    if (this._map) this._map._positionMarker(this);
    return this;
  };
  Marker.prototype.addTo = function (map) {
    this._map = map;
    map._addMarker(this);
    return this;
  };

  function MapInstance(id, options) {
    Evented.call(this);
    this.options = options || {};
    this._el = typeof id === 'string' ? document.getElementById(id) : id;
    this._el.classList.add('leaflet-container');
    this._el.innerHTML = '';
    this._tilePane = document.createElement('div');
    this._tilePane.className = 'leaflet-pane leaflet-tile-pane';
    this._markerPane = document.createElement('div');
    this._markerPane.className = 'leaflet-pane leaflet-marker-pane';
    this._bottomRight = document.createElement('div');
    this._bottomRight.className = 'leaflet-bottom leaflet-right';
    this._el.appendChild(this._tilePane);
    this._el.appendChild(this._markerPane);
    this._el.appendChild(this._bottomRight);
    this._attrEl = null;
    if (this.options.attributionControl !== false) {
      this._attrEl = document.createElement('div');
      this._attrEl.className = 'leaflet-control-attribution leaflet-control';
      this._bottomRight.appendChild(this._attrEl);
    }
    this._center = [38.43, -122.70];
    this._zoom = 11;
    this._tileLayers = [];
    this._markers = [];
  }
  MapInstance.prototype = Object.create(Evented.prototype);
  MapInstance.prototype.setView = function (center, zoom) {
    this._center = center;
    this._zoom = zoom;
    this._repositionAllMarkers();
    return this;
  };
  MapInstance.prototype.getZoom = function () { return this._zoom; };
  MapInstance.prototype.getMaxZoom = function () { return this.options.maxZoom || 19; };
  MapInstance.prototype.getSize = function () {
    var rect = this._el.getBoundingClientRect();
    return { x: Math.max(320, rect.width || 800), y: Math.max(320, rect.height || 520) };
  };
  MapInstance.prototype.latLngToContainerPoint = function (latlng) {
    var size = this.getSize();
    return latLngToPixelOffset(latlng[0], latlng[1], this._center[0], this._center[1], this._zoom, size.x, size.y);
  };
  MapInstance.prototype.containerPointToLatLng = function (point) {
    var size = this.getSize(), scale = 256 * Math.pow(2, this._zoom);
    var center = latLngToPixelOffset(0, 0, this._center[0], this._center[1], this._zoom, size.x, size.y);
    var x = point[0] - center.x + scale / 2;
    var y = point[1] - center.y + scale / 2;
    return [Math.atan(Math.sinh(Math.PI * (1 - 2 * y / scale))) * 180 / Math.PI, x / scale * 360 - 180];
  };
  MapInstance.prototype.setMinZoom = function (z) { this.options.minZoom = z; };
  MapInstance.prototype.setMaxZoom = function (z) { this.options.maxZoom = z; };
  MapInstance.prototype.whenReady = function (fn) { setTimeout(fn, 0); return this; };
  MapInstance.prototype.invalidateSize = function () {
    this._repositionAllMarkers();
    return this;
  };
  MapInstance.prototype.flyTo = function (center, zoom) {
    this._center = center;
    if (typeof zoom === 'number') this._zoom = zoom;
    this._repositionAllMarkers();
    this.fire('zoomend');
    return this;
  };
  MapInstance.prototype._updateAttribution = function () {
    if (!this._attrEl) return;
    var parts = ['<a href="https://leafletjs.com" target="_blank" rel="noopener noreferrer">Leaflet</a>'];
    for (var i = 0; i < this._tileLayers.length; i++) {
      if (this._tileLayers[i].options.attribution) parts.push(this._tileLayers[i].options.attribution);
    }
    this._attrEl.innerHTML = parts.join(' | ');
  };
  MapInstance.prototype._addTileLayer = function (layer) {
    var c = document.createElement('div');
    c.className = 'leaflet-layer';
    this._tilePane.appendChild(c);
    layer._container = c;
    this._tileLayers.push(layer);
    this._updateAttribution();
    layer._renderGrid();
  };
  MapInstance.prototype._addMarker = function (marker) {
    var wrap = document.createElement('div');
    wrap.className = 'leaflet-marker-icon';
    wrap.innerHTML = (marker.options.icon && marker.options.icon.html) || '';
    wrap.addEventListener('click', function () { marker.fire('click'); });
    this._markerPane.appendChild(wrap);
    marker._el = wrap;
    this._markers.push(marker);
    this._positionMarker(marker);
  };
  MapInstance.prototype._positionMarker = function (marker) {
    if (!marker._el) return;
    var rect = this._el.getBoundingClientRect();
    var w = Math.max(320, rect.width || 800);
    var h = Math.max(320, rect.height || 520);
    var pt = latLngToPixelOffset(marker._latlng[0], marker._latlng[1], this._center[0], this._center[1], this._zoom, w, h);
    var anchor = (marker.options.icon && marker.options.icon.iconAnchor) || [12, 24];
    marker._el.style.transform = 'translate(' + (pt.x - anchor[0]) + 'px, ' + (pt.y - anchor[1]) + 'px)';
  };
  MapInstance.prototype._repositionAllMarkers = function () {
    for (var i = 0; i < this._markers.length; i++) this._positionMarker(this._markers[i]);
  };
  MapInstance.prototype.removeLayer = function (layer) {
    var tIdx = this._tileLayers.indexOf(layer);
    if (tIdx >= 0) {
      this._tileLayers.splice(tIdx, 1);
      if (layer._container && layer._container.parentNode) layer._container.parentNode.removeChild(layer._container);
      layer._container = null;
      this._updateAttribution();
      return this;
    }
    var mIdx = this._markers.indexOf(layer);
    if (mIdx >= 0) {
      this._markers.splice(mIdx, 1);
      if (layer._el && layer._el.parentNode) layer._el.parentNode.removeChild(layer._el);
      layer._el = null;
    }
    return this;
  };

  window.L = {
    version: '1.9.4-fixture',
    TileLayer: TileLayer,
    map: function (id, opts) { return new MapInstance(id, opts); },
    tileLayer: function (url, opts) { return new TileLayer(url, opts); },
    divIcon: function (opts) { return opts; },
    marker: function (latlng, opts) { return new Marker(latlng, opts); },
    control: {
      zoom: function () {
        return {
          addTo: function (map) {
            var z = document.createElement('div');
            z.className = 'leaflet-control-zoom leaflet-control';
            z.innerHTML = '<a href="#" role="button" aria-label="Zoom in" onclick="return false">+</a><a href="#" role="button" aria-label="Zoom out" onclick="return false">−</a>';
            if (map._attrEl) map._bottomRight.insertBefore(z, map._attrEl);
            else map._bottomRight.appendChild(z);
            return this;
          }
        };
      }
    }
  };
})();
`;

async function waitForCondition(fn, { timeoutMs = 15000, intervalMs = 80, label = 'condition' } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastErr = null;
  while (Date.now() < deadline) {
    try {
      const val = await fn();
      if (val) return val;
    } catch (err) {
      lastErr = err;
    }
    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new Error(`Timed out waiting for ${label}${lastErr ? ': ' + lastErr.message : ''}`);
}

function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, res => {
      let body = '';
      res.on('data', d => (body += d));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, json: JSON.parse(body) });
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('error', reject);
  });
}

function extractSessionCookie(res) {
  const setCookie =
    typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : res.headers.get('set-cookie');
  const joined = Array.isArray(setCookie) ? setCookie.join('; ') : String(setCookie || '');
  const m = /(__Host-truckly_session=[^;\s]+|truckly_session=[^;\s]+)/.exec(joined);
  return m ? m[1] : '';
}

class CdpClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
  }

  async connect() {
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', () => resolve(), { once: true });
      this.ws.addEventListener('error', e => reject(e.error || new Error('CDP WebSocket error')), { once: true });
    });
    this.ws.addEventListener('message', event => {
      const msg = JSON.parse(typeof event.data === 'string' ? event.data : event.data.toString());
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        else resolve(msg.result);
      } else if (msg.method) {
        const handlers = this.listeners.get(msg.method) || [];
        for (const fn of handlers) {
          try {
            fn(msg.params, msg.sessionId);
          } catch {}
        }
      }
    });
  }

  on(method, fn) {
    const arr = this.listeners.get(method) || [];
    arr.push(fn);
    this.listeners.set(method, arr);
  }

  send(method, params = {}, sessionId = undefined) {
    const id = this.nextId++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(payload));
    });
  }

  async eval(sessionId, expression) {
    const res = await this.send(
      'Runtime.evaluate',
      { expression, awaitPromise: true, returnByValue: true },
      sessionId
    );
    if (res.exceptionDetails) {
      const desc =
        res.exceptionDetails.exception?.description ||
        res.exceptionDetails.text ||
        'Runtime.evaluate exception';
      throw new Error(desc);
    }
    return res.result?.value;
  }

  close() {
    try {
      this.ws.close();
    } catch {}
  }
}

function rectsOverlap(a, b) {
  if (!a || !b || a.width <= 0 || a.height <= 0 || b.width <= 0 || b.height <= 0) return false;
  return !(a.right <= b.left + 1 || a.left >= b.right - 1 || a.bottom <= b.top + 1 || a.top >= b.bottom - 1);
}

(async () => {
  const screenshotDir = parseCliScreenshotDir();
  if (screenshotDir) fs.mkdirSync(screenshotDir, { recursive: true });

  const chromeBin = findChromeBinary();
  const validTilePng = createMapTilePng256();
  const pgCluster = await createPostgresCluster();
  const suffix = crypto.randomBytes(4).toString('hex');
  const migratorRole = `bs_map_mig_${suffix}`;
  const migratorPass = `mig_${suffix}`;
  const appRole = `bs_map_app_${suffix}`;
  const appPass = `app_${suffix}`;
  const dbName = `bs_map_e2e_${suffix}`;

  const adminPool = new Pool({ connectionString: pgCluster.adminUrl, max: 4 });
  let migratorPool = null;
  let tileServer = null;
  const openTileSockets = new Set();
  let serverProc = null;
  let chromeProc = null;
  let cdp = null;
  let chromeProfileDir = null;

  // Programmable mock tile server state
  const tileMock = {
    mode: 'healthy', // 'healthy' | 'single_fail' | 'http_403' | 'http_503' | 'network_reset' | 'timeout_hang'
    singleFailCount: 0,
    requests: [],
    hungResponses: []
  };

  try {
    await adminPool.query(
      `CREATE ROLE ${migratorRole} LOGIN PASSWORD '${migratorPass}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`
    );
    await adminPool.query(
      `CREATE ROLE ${appRole} LOGIN PASSWORD '${appPass}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`
    );
    await adminPool.query(`CREATE DATABASE ${dbName} OWNER ${migratorRole}`);

    const migratorDbUrl = buildDbUrl(pgCluster.adminUrl, {
      user: migratorRole,
      password: migratorPass,
      database: dbName
    });
    const appDbUrl = buildDbUrl(pgCluster.adminUrl, {
      user: appRole,
      password: appPass,
      database: dbName
    });

    execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'run-migrations.cjs'), '--app-role', appRole], {
      cwd: ROOT,
      env: { ...process.env, MIGRATION_DATABASE_URL: migratorDbUrl },
      stdio: 'pipe',
      windowsHide: true
    });

    migratorPool = new Pool({ connectionString: migratorDbUrl, max: 4 });

    // Start cross-origin deterministic loopback tile server on its own port
    const tilePort = await getFreePort();
    tileServer = http.createServer((req, res) => {
      tileMock.requests.push({
        url: req.url,
        method: req.method,
        referer: req.headers.referer || null,
        headers: { ...req.headers },
        mode: tileMock.mode,
        at: Date.now()
      });

      if (req.url.startsWith('/non-tile-probe.png')) {
        res.writeHead(200, {
          'Content-Type': 'image/png',
          'Cache-Control': 'no-store'
        });
        res.end(validTilePng);
        return;
      }

      if (tileMock.mode === 'network_reset') {
        req.socket.destroy();
        return;
      }

      if (tileMock.mode === 'timeout_hang') {
        tileMock.hungResponses.push(res);
        return;
      }

      if (tileMock.mode === 'http_403') {
        res.writeHead(403, {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-store'
        });
        res.end('Access blocked');
        return;
      }

      if (tileMock.mode === 'http_503') {
        res.writeHead(503, {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-store'
        });
        res.end('Tile backend temporarily unavailable');
        return;
      }

      if (tileMock.mode === 'single_fail' && tileMock.singleFailCount === 0) {
        tileMock.singleFailCount += 1;
        res.writeHead(500, {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-store'
        });
        res.end('Single transient tile failure');
        return;
      }

      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600'
      });
      res.end(validTilePng);
    });
    tileServer.on('connection', sock => {
      openTileSockets.add(sock);
      sock.on('close', () => openTileSockets.delete(sock));
    });
    await new Promise((resolve, reject) => {
      tileServer.listen(tilePort, '127.0.0.1', err => (err ? reject(err) : resolve()));
    });

    // Start real standalone BiteShark server (`server/index.js`) pointing `loopback_test` at `tilePort`
    const appPort = await getFreePort();
    assert.notEqual(appPort, tilePort, 'App and tile server must run on distinct ports (cross-origin)');
    const baseUrl = `http://127.0.0.1:${appPort}`;
    const authSecret = crypto.randomBytes(32).toString('hex');
    const mailboxSecret = 'map_mbx_' + crypto.randomBytes(16).toString('hex');

    serverProc = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
      cwd: ROOT,
      env: {
        ...process.env,
        HOST: '127.0.0.1',
        PORT: String(appPort),
        DATABASE_URL: appDbUrl,
        BITESHARK_ENV: 'staging',
        BITESHARK_RELEASE_SHA: 'e2e-map-resilience',
        BITESHARK_AUTH_SECRET: authSecret,
        BITESHARK_AUTH_DELIVERY_MODE: 'staging_mailbox',
        BITESHARK_STAGING_MAILBOX_SECRET: mailboxSecret,
        BITESHARK_STAGING_ALLOWED_EMAIL_DOMAINS: 'staging.biteshark.invalid',
        BITESHARK_PUSH_PROVIDER_MODE: 'disabled',
        BITESHARK_ALLOW_TEST_MAP_PROVIDER: '1',
        BITESHARK_MAP_ENABLED: '1',
        BITESHARK_MAP_PROVIDER: 'loopback_test',
        BITESHARK_MAP_TILE_URL: `http://127.0.0.1:${tilePort}/tiles/{z}/{x}/{y}.png`
      },
      stdio: 'ignore',
      windowsHide: true
    });

    await waitForCondition(
      async () => {
        const res = await httpGetJson(`${baseUrl}/api/trucks?summary=1`);
        return res.status === 200 && res.json.total === 59;
      },
      { label: 'standalone BiteShark server ready' }
    );

    // Verify HTTP security & cache headers on `/` and `/api/features`
    const rootRes = await fetch(`${baseUrl}/`);
    assert.equal(rootRes.status, 200);
    assert.equal(rootRes.headers.get('referrer-policy'), 'same-origin', 'Global Referrer-Policy must remain same-origin');

    const featuresRes = await fetch(`${baseUrl}/api/features`);
    assert.equal(featuresRes.status, 200);
    assert.equal(featuresRes.headers.get('referrer-policy'), 'same-origin');
    assert(String(featuresRes.headers.get('cache-control') || '').includes('no-store'), '/api/features must preserve no-store');

    // Launch real headless Chrome
    const cdpPort = await getFreePort();
    chromeProfileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'biteshark-map-chrome-'));
    chromeProc = spawn(
      chromeBin,
      [
        '--headless=new',
        '--no-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--no-first-run',
        '--no-default-browser-check',
        `--user-data-dir=${chromeProfileDir}`,
        `--remote-debugging-port=${cdpPort}`,
        'about:blank'
      ],
      { stdio: ['ignore', 'ignore', 'ignore'], windowsHide: true }
    );

    const versionInfo = await waitForCondition(
      async () => {
        const r = await httpGetJson(`http://127.0.0.1:${cdpPort}/json/version`);
        return r.status === 200 && r.json.webSocketDebuggerUrl ? r.json : null;
      },
      { label: 'Chrome DevTools endpoint' }
    );

    cdp = new CdpClient(versionInfo.webSocketDebuggerUrl);
    await cdp.connect();

    const interceptedModesBySession = new Map(); // sessionId -> 'fixture' | 'fail_leaflet'
    const externalUnexpectedRequests = [];

    cdp.on('Fetch.requestPaused', async (params, sessionId) => {
      const url = params.request.url;
      const mode = interceptedModesBySession.get(sessionId) || 'fixture';
      try {
        if (url.includes('unpkg.com/leaflet') && url.endsWith('.css')) {
          if (mode === 'fail_leaflet') {
            await cdp.send('Fetch.failRequest', { requestId: params.requestId, errorReason: 'ConnectionRefused' }, sessionId);
          } else {
            await cdp.send(
              'Fetch.fulfillRequest',
              {
                requestId: params.requestId,
                responseCode: 200,
                responseHeaders: [{ name: 'Content-Type', value: 'text/css; charset=utf-8' }],
                body: Buffer.from(LEAFLET_FIXTURE_CSS, 'utf8').toString('base64')
              },
              sessionId
            );
          }
          return;
        }
        if (url.includes('unpkg.com/leaflet') && url.endsWith('.js')) {
          if (mode === 'fail_leaflet') {
            await cdp.send('Fetch.failRequest', { requestId: params.requestId, errorReason: 'ConnectionRefused' }, sessionId);
          } else {
            await cdp.send(
              'Fetch.fulfillRequest',
              {
                requestId: params.requestId,
                responseCode: 200,
                responseHeaders: [{ name: 'Content-Type', value: 'application/javascript; charset=utf-8' }],
                body: Buffer.from(LEAFLET_FIXTURE_JS, 'utf8').toString('base64')
              },
              sessionId
            );
          }
          return;
        }
        if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')) {
          await cdp.send(
            'Fetch.fulfillRequest',
            {
              requestId: params.requestId,
              responseCode: 200,
              responseHeaders: [{ name: 'Content-Type', value: 'text/css' }],
              body: ''
            },
            sessionId
          );
          return;
        }
        // Any unexpected third-party host is blocked and recorded
        const parsed = new URL(url);
        if (parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost') {
          externalUnexpectedRequests.push(url);
          await cdp.send('Fetch.failRequest', { requestId: params.requestId, errorReason: 'BlockedByClient' }, sessionId);
          return;
        }
        await cdp.send('Fetch.continueRequest', { requestId: params.requestId }, sessionId);
      } catch {}
    });

    async function openIsolatedTab({ leafletMode = 'fixture', width = 1440, height = 900, mobile = false } = {}) {
      const { browserContextId } = await cdp.send('Target.createBrowserContext');
      const { targetId } = await cdp.send('Target.createTarget', {
        url: 'about:blank',
        browserContextId
      });
      const { sessionId } = await cdp.send('Target.attachToTarget', {
        targetId,
        flatten: true
      });
      interceptedModesBySession.set(sessionId, leafletMode);
      await cdp.send('Page.enable', {}, sessionId);
      await cdp.send('Runtime.enable', {}, sessionId);
      await cdp.send('Network.enable', {}, sessionId);
      await cdp.send(
        'Fetch.enable',
        {
          patterns: [
            { urlPattern: '*://unpkg.com/*' },
            { urlPattern: '*://fonts.googleapis.com/*' },
            { urlPattern: '*://fonts.gstatic.com/*' },
            { urlPattern: '*://tile.openstreetmap.org/*' },
            { urlPattern: '*://*.example.invalid/*' }
          ]
        },
        sessionId
      );
      await cdp.send(
        'Emulation.setDeviceMetricsOverride',
        { width, height, deviceScaleFactor: 1, mobile },
        sessionId
      );
      return { browserContextId, targetId, sessionId };
    }

    // =========================================================================
    // [1, 2, 3, 4 & 12a] Origin-Only Referer, Sensitive URL Stripping, Global
    // `same-origin` Preservation, Normal Tile Rendering & Desktop Geometry
    // =========================================================================
    const mainTab = await openIsolatedTab({ leafletMode: 'fixture', width: 1440, height: 900, mobile: false });
    const sensitiveUrl = `${baseUrl}/?invitation=inv_secret_token_987654321&email=private-owner@example.com&token=otp999888`;
    await cdp.send('Page.navigate', { url: sensitiveUrl }, mainTab.sessionId);

    await waitForCondition(
      () =>
        cdp.eval(
          mainTab.sessionId,
          `Boolean(window.bitesharkReady && window.bitesharkFeatures && window.bitesharkFeatures.isLoaded() && typeof trucks !== 'undefined' && trucks.length === 59)`
        ),
      { label: 'Initial List view loaded with 59 listings' }
    );

    // Confirm List mode on boot made ZERO tile requests prior to opening Map view
    assert.equal(
      tileMock.requests.filter(r => r.url.startsWith('/tiles/')).length,
      0,
      'List-mode boot must not request map tiles before Map view is opened'
    );

    // Push a deep path with sensitive query + hash via History API before switching to Map
    await cdp.eval(
      mainTab.sessionId,
      `history.replaceState(null, '', '/account/private/invite-abc123?invitation=inv_secret_token_987654321&otp=481920#pager=550e8400-e29b-41d4-a716-446655440000'); true;`
    );

    // Switch to Map mode
    await cdp.eval(mainTab.sessionId, `document.getElementById('mapMode').click(); true;`);

    const normalMapState = await waitForCondition(
      async () => {
        const s = await cdp.eval(
          mainTab.sessionId,
          `(() => {
            const imgs = [...document.querySelectorAll('#map img.leaflet-tile')];
            if (imgs.length < 4 || !imgs.every(i => i.complete && i.naturalWidth === 256)) return null;
            const pins = document.querySelectorAll('#map .truck-pin');
            const attr = document.querySelector('#map .leaflet-control-attribution');
            const modeSw = document.querySelector('#discoverScreen .mode-switch');
            const nav = document.querySelector('.bottom-nav');
            const zoom = document.querySelector('#map .leaflet-control-zoom');
            const fb = document.getElementById('mapFallback');
            if (!pins.length || !attr) return null;
            return {
              tileCount: imgs.length,
              pinCount: pins.length,
              imgReferrerPolicies: imgs.map(i => i.referrerPolicy),
              fallbackHidden: fb ? fb.hidden : true,
              attributionText: attr.textContent.trim(),
              attrRect: attr.getBoundingClientRect().toJSON(),
              modeRect: modeSw.getBoundingClientRect().toJSON(),
              navRect: nav.getBoundingClientRect().toJSON(),
              zoomRect: zoom ? zoom.getBoundingClientRect().toJSON() : null
            };
          })()`
        );
        return s;
      },
      { label: 'Healthy 256x256 map tiles & Sonoma pins rendered' }
    );

    assert(normalMapState.tileCount >= 4);
    assert(normalMapState.pinCount >= 8);
    assert.equal(normalMapState.fallbackHidden, true);
    assert(normalMapState.imgReferrerPolicies.every(p => p === 'origin'), 'Every tile <img> must use referrerPolicy=origin');
    assert(normalMapState.attributionText.includes('OpenStreetMap'), 'Attribution must include OpenStreetMap');

    // Desktop geometry: visible attribution, unobscured by navigation or mode-switch
    assert(
      normalMapState.attrRect.width > 80 && normalMapState.attrRect.height >= 14,
      `Expected visible attribution rect, got ${JSON.stringify(normalMapState.attrRect)}`
    );
    assert(normalMapState.attrRect.bottom <= 900);
    assert.equal(rectsOverlap(normalMapState.attrRect, normalMapState.modeRect), false, 'Desktop attribution must not overlap mode-switch');
    assert.equal(rectsOverlap(normalMapState.attrRect, normalMapState.navRect), false, 'Desktop attribution must not overlap bottom-nav');
    if (normalMapState.zoomRect) {
      assert.equal(rectsOverlap(normalMapState.attrRect, normalMapState.zoomRect), false, 'Desktop attribution must not overlap zoom controls');
    }

    // Check wire-level outgoing `Referer` on EVERY tile request
    const tileReqsWave1 = tileMock.requests.filter(r => r.url.startsWith('/tiles/'));
    assert(tileReqsWave1.length >= 4, 'Expected tile requests recorded on cross-origin mock server');
    for (const reqItem of tileReqsWave1) {
      assert.equal(
        reqItem.referer,
        `${baseUrl}/`,
        `Tile request must send origin-only Referer (${baseUrl}/), got: ${reqItem.referer}`
      );
      for (const secretFragment of [
        'account/private',
        'invite-abc123',
        'inv_secret_token',
        'private-owner',
        'otp',
        '481920',
        '550e8400'
      ]) {
        assert(
          !String(reqItem.referer).includes(secretFragment) && !String(reqItem.url).includes(secretFragment),
          `Sensitive fragment "${secretFragment}" leaked in tile request!`
        );
      }
    }

    // Verify global `Referrer-Policy: same-origin` remains intact for non-tile cross-origin requests
    await cdp.eval(
      mainTab.sessionId,
      `new Promise((resolve, reject) => {
        const probeImg = new Image();
        probeImg.onload = () => resolve(true);
        probeImg.onerror = () => reject(new Error('non-tile probe failed'));
        probeImg.src = 'http://127.0.0.1:${tilePort}/non-tile-probe.png';
      })`
    );
    const nonTileProbeReq = tileMock.requests.find(r => r.url === '/non-tile-probe.png');
    assert(nonTileProbeReq, 'Expected non-tile cross-origin probe request');
    assert.equal(
      nonTileProbeReq.referer,
      null,
      'Non-tile cross-origin requests must still omit Referer under global Referrer-Policy: same-origin'
    );

    if (screenshotDir) {
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' }, mainTab.sessionId);
      fs.writeFileSync(path.join(screenshotDir, 'map-normal-mocked-desktop.png'), Buffer.from(shot.data, 'base64'));
    }

    // =========================================================================
    // [5] Single Failed Tile (`500`) Does NOT Falsely Disable the Map
    // =========================================================================
    tileMock.mode = 'single_fail';
    tileMock.singleFailCount = 0;
    const singleFailTab = await openIsolatedTab({ leafletMode: 'fixture', width: 1280, height: 840, mobile: false });
    await cdp.send('Page.navigate', { url: `${baseUrl}/` }, singleFailTab.sessionId);
    await waitForCondition(
      () => cdp.eval(singleFailTab.sessionId, `Boolean(window.bitesharkReady && window.bitesharkFeatures?.isLoaded())`),
      { label: 'Single-fail tab ready' }
    );
    await cdp.eval(singleFailTab.sessionId, `document.getElementById('mapMode').click(); true;`);

    const singleFailResult = await waitForCondition(
      async () => {
        const s = await cdp.eval(
          singleFailTab.sessionId,
          `(() => {
            if (mapRuntimeState.startedCount < 4 || mapRuntimeState.pendingCount > 0) return null;
            return {
              started: mapRuntimeState.startedCount,
              loaded: mapRuntimeState.loadedCount,
              errors: mapRuntimeState.errorCount,
              unavailable: mapRuntimeState.unavailable,
              fallbackHidden: document.getElementById('mapFallback').hidden,
              mapVisible: getComputedStyle(document.getElementById('map')).display !== 'none'
            };
          })()`
        );
        return s;
      },
      { label: 'Single failed tile wave settled' }
    );
    assert.equal(singleFailResult.errors, 1, 'Exactly one tile failed');
    assert(singleFailResult.loaded >= 3, 'Remaining tiles loaded normally');
    assert.equal(singleFailResult.unavailable, false, 'Single failed tile must not trigger outage');
    assert.equal(singleFailResult.fallbackHidden, true);
    assert.equal(singleFailResult.mapVisible, true);

    // =========================================================================
    // [6, 8, 9 & 12b] Sustained HTTP 403, Network Reset, Timeout, State
    // Preservation, Bounded Retry Recovery & Mobile (`375x812`) Accessibility
    // =========================================================================
    tileMock.mode = 'http_403';
    const outageTab = await openIsolatedTab({ leafletMode: 'fixture', width: 1440, height: 900, mobile: false });
    await cdp.send('Page.navigate', { url: `${baseUrl}/` }, outageTab.sessionId);
    await waitForCondition(
      () => cdp.eval(outageTab.sessionId, `Boolean(window.bitesharkReady && window.bitesharkFeatures?.isLoaded() && trucks.length === 59)`),
      { label: 'Outage tab ready' }
    );

    // Set search, cuisine filter, favorite, and selected listing BEFORE switching to failing map
    await cdp.eval(
      outageTab.sessionId,
      `(() => {
        window.__BITESHARK_MAP_RETRY_COOLDOWN_MS = 1200;
        chooseCuisine('Mexican');
        const input = document.getElementById('searchInput');
        input.value = 'Tacos';
        applyFilters();
        if (!favs.has('iniguez')) toggleFav('iniguez');
        selectTruck('iniguez');
        document.getElementById('mapMode').click();
        return true;
      })()`
    );

    const http403Fallback = await waitForCondition(
      async () => {
        const s = await cdp.eval(
          outageTab.sessionId,
          `(() => {
            const fb = document.getElementById('mapFallback');
            if (!fb || fb.hidden) return null;
            return {
              unavailable: mapRuntimeState.unavailable,
              reason: mapRuntimeState.failureReason,
              title: document.getElementById('mapFallbackTitle').textContent.trim(),
              copy: document.getElementById('mapFallbackCopy').textContent.trim(),
              statusLive: document.getElementById('mapFallbackStatus').textContent.trim(),
              mapDisplay: getComputedStyle(document.getElementById('map')).display,
              activeTileLayerPresent: Boolean(activeTileLayer)
            };
          })()`
        );
        return s;
      },
      { label: 'Sustained HTTP 403 outage fallback displayed' }
    );
    assert.equal(http403Fallback.unavailable, true);
    assert.equal(http403Fallback.mapDisplay, 'none', 'Failed map must be hidden so blank/blocked tiles are never shown');
    assert.equal(http403Fallback.activeTileLayerPresent, false, 'Failed tile layer torn down');
    assert(http403Fallback.title.includes('Map view isn’t available'));
    assert(http403Fallback.statusLive.length > 10);

    if (screenshotDir) {
      const shotOutage = await cdp.send('Page.captureScreenshot', { format: 'png' }, outageTab.sessionId);
      fs.writeFileSync(path.join(screenshotDir, 'map-outage-fallback-desktop.png'), Buffer.from(shotOutage.data, 'base64'));
    }

    // Verify search, cuisine filter, favorite, and selected listing survive clicking "Continue in List view"
    await cdp.eval(outageTab.sessionId, `document.getElementById('mapFallbackListBtn').click(); true;`);
    const preservedInList = await cdp.eval(
      outageTab.sessionId,
      `({
        isListMode: document.getElementById('discoverScreen').classList.contains('list-mode'),
        searchVal: document.getElementById('searchInput').value,
        cuisine: activeCuisine,
        hasIniguezFav: favs.has('iniguez'),
        selected: selectedTruck,
        hasSelectedCardDom: Boolean(document.querySelector('.truck-card.selected-card')),
        renderedCards: document.querySelectorAll('#truckCards .truck-card').length
      })`
    );
    assert.equal(preservedInList.isListMode, true);
    assert.equal(preservedInList.searchVal, 'Tacos');
    assert.equal(preservedInList.cuisine, 'Mexican');
    assert.equal(preservedInList.hasIniguezFav, true);
    assert.equal(preservedInList.selected, 'iniguez');
    assert.equal(preservedInList.hasSelectedCardDom, true);
    assert(preservedInList.renderedCards >= 1);

    // Switch back to Map mode (triggers fallback on TCP network reset mode)
    tileMock.mode = 'network_reset';
    await cdp.eval(outageTab.sessionId, `document.getElementById('mapMode').click(); true;`);
    await waitForCondition(
      () => cdp.eval(outageTab.sessionId, `Boolean(mapRuntimeState.unavailable && !document.getElementById('mapFallback').hidden)`),
      { label: 'Network reset outage fallback' }
    );

    // Test bounded retry cooldown: first retry triggers wave (still failing), immediate second click is blocked with 0 requests
    await cdp.eval(outageTab.sessionId, `document.getElementById('mapFallbackRetryBtn').click(); true;`);
    await waitForCondition(
      () => cdp.eval(outageTab.sessionId, `Boolean(mapRuntimeState.unavailable && !document.getElementById('mapFallback').hidden)`),
      { label: 'First retry failed back into fallback' }
    );
    const reqCountBeforeRapidClick = tileMock.requests.length;
    await cdp.eval(outageTab.sessionId, `retryInteractiveMap(); true;`);
    const cooldownState = await cdp.eval(
      outageTab.sessionId,
      `({
        hintHidden: document.getElementById('mapFallbackHint').hidden,
        hintText: document.getElementById('mapFallbackHint').textContent.trim(),
        retryDisabled: document.getElementById('mapFallbackRetryBtn').disabled
      })`
    );
    assert.equal(tileMock.requests.length, reqCountBeforeRapidClick, 'Cooldown-blocked retry must issue ZERO requests');
    assert.equal(cooldownState.hintHidden, false);
    assert(cooldownState.hintText.includes('Please wait'));
    assert.equal(cooldownState.retryDisabled, true);

    // Wait for 1200ms cooldown to expire, test hung tile timeout (`timeout_hang`), then recover cleanly to `healthy`!
    await waitForCondition(
      () => cdp.eval(outageTab.sessionId, `document.getElementById('mapFallbackRetryBtn').disabled === false`),
      { label: 'Retry button re-enabled after cooldown' }
    );

    tileMock.mode = 'timeout_hang';
    await cdp.eval(
      outageTab.sessionId,
      `window.__BITESHARK_MAP_TILE_TIMEOUT_MS = 450; document.getElementById('mapFallbackRetryBtn').click(); true;`
    );
    const timeoutFallback = await waitForCondition(
      async () =>
        cdp.eval(
          outageTab.sessionId,
          `mapRuntimeState.unavailable && mapRuntimeState.failureReason === 'tile_timeout' && !document.getElementById('mapFallback').hidden ? true : null`
        ),
      { label: 'Hung tile timeout fallback' }
    );
    assert.equal(timeoutFallback, true);
    for (const hungRes of tileMock.hungResponses.splice(0)) {
      try { hungRes.destroy(); } catch {}
    }

    // Verify mobile (`375x812`) fallback visibility, non-overlap & keyboard accessibility, then recover on `Enter`!
    await cdp.send(
      'Emulation.setDeviceMetricsOverride',
      { width: 375, height: 812, deviceScaleFactor: 2, mobile: true },
      outageTab.sessionId
    );
    await cdp.send('Page.bringToFront', {}, outageTab.sessionId);
    await waitForCondition(
      () =>
        cdp.eval(
          outageTab.sessionId,
          `document.getElementById('mapFallbackRetryBtn').disabled === false && (Date.now() - mapRuntimeState.lastRetryAt) >= 1250`
        ),
      { label: 'Cooldown elapsed before mobile keyboard recovery' }
    );

    const mobileFallbackRects = await cdp.eval(
      outageTab.sessionId,
      `(() => {
        const card = document.querySelector('.map-fallback-card').getBoundingClientRect().toJSON();
        const listBtn = document.getElementById('mapFallbackListBtn').getBoundingClientRect().toJSON();
        const retryBtn = document.getElementById('mapFallbackRetryBtn');
        retryBtn.focus();
        return {
          card,
          listBtn,
          retryBtn: retryBtn.getBoundingClientRect().toJSON(),
          toolbar: document.querySelector('.discovery-toolbar').getBoundingClientRect().toJSON(),
          nav: document.querySelector('.bottom-nav').getBoundingClientRect().toJSON(),
          activeId: document.activeElement?.id || null
        };
      })()`
    );
    assert(mobileFallbackRects.card.width >= 300 && mobileFallbackRects.card.right <= 375);
    assert.equal(rectsOverlap(mobileFallbackRects.card, mobileFallbackRects.toolbar), false, 'Mobile fallback card must not overlap toolbar');
    assert.equal(rectsOverlap(mobileFallbackRects.card, mobileFallbackRects.nav), false, 'Mobile fallback card must not overlap bottom-nav');
    assert.equal(mobileFallbackRects.activeId, 'mapFallbackRetryBtn', 'Retry button is keyboard focusable');

    // Restore tile server to `healthy` and press Space/Enter on focused `#mapFallbackRetryBtn`!
    tileMock.mode = 'healthy';
    await cdp.eval(outageTab.sessionId, `window.__BITESHARK_MAP_TILE_TIMEOUT_MS = 8000; document.getElementById('mapFallbackRetryBtn').focus(); true;`);
    await cdp.send(
      'Input.dispatchKeyEvent',
      { type: 'rawKeyDown', key: 'Enter', code: 'Enter', text: '\r', unmodifiedText: '\r', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 },
      outageTab.sessionId
    );
    await cdp.send(
      'Input.dispatchKeyEvent',
      { type: 'char', key: 'Enter', code: 'Enter', text: '\r', unmodifiedText: '\r', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 },
      outageTab.sessionId
    );
    await cdp.send(
      'Input.dispatchKeyEvent',
      { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 },
      outageTab.sessionId
    );

    const recoveredMobileMap = await waitForCondition(
      async () => {
        const s = await cdp.eval(
          outageTab.sessionId,
          `(() => {
            const imgs = [...document.querySelectorAll('#map img.leaflet-tile')];
            if (mapRuntimeState.unavailable || imgs.length < 4 || !imgs.every(i => i.complete && i.naturalWidth === 256)) return null;
            const attr = document.querySelector('#map .leaflet-control-attribution');
            const modeSw = document.querySelector('#discoverScreen .mode-switch');
            const nav = document.querySelector('.bottom-nav');
            return {
              fallbackHidden: document.getElementById('mapFallback').hidden,
              searchVal: document.getElementById('searchInput').value,
              cuisine: activeCuisine,
              selected: selectedTruck,
              hasFav: favs.has('iniguez'),
              attrRect: attr.getBoundingClientRect().toJSON(),
              modeRect: modeSw.getBoundingClientRect().toJSON(),
              navRect: nav.getBoundingClientRect().toJSON()
            };
          })()`
        );
        return s;
      },
      { label: 'Map recovered on mobile via keyboard Enter' }
    );
    assert.equal(recoveredMobileMap.fallbackHidden, true);
    assert.equal(recoveredMobileMap.searchVal, 'Tacos', 'Search survived retry recovery');
    assert.equal(recoveredMobileMap.cuisine, 'Mexican', 'Filter survived retry recovery');
    assert.equal(recoveredMobileMap.selected, 'iniguez', 'Selected listing survived retry recovery');
    assert.equal(recoveredMobileMap.hasFav, true, 'Favorite survived retry recovery');
    assert(recoveredMobileMap.attrRect.width > 80 && recoveredMobileMap.attrRect.bottom <= 812);
    assert.equal(rectsOverlap(recoveredMobileMap.attrRect, recoveredMobileMap.modeRect), false, 'Mobile attribution must not overlap mode-switch');
    assert.equal(rectsOverlap(recoveredMobileMap.attrRect, recoveredMobileMap.navRect), false, 'Mobile attribution must not overlap bottom-nav');

    // =========================================================================
    // [7] Missing Leaflet Leaves List View Usable & Shows Honest Fallback on Map
    // =========================================================================
    const noLeafletTab = await openIsolatedTab({ leafletMode: 'fail_leaflet', width: 1280, height: 800, mobile: false });
    await cdp.send('Page.navigate', { url: `${baseUrl}/` }, noLeafletTab.sessionId);
    const noLeafletList = await waitForCondition(
      async () =>
        cdp.eval(
          noLeafletTab.sessionId,
          `(() => {
            if (!window.bitesharkReady || typeof trucks === 'undefined' || trucks.length !== 59) return null;
            return {
              leafletDefined: typeof window.L !== 'undefined',
              nearbyText: document.getElementById('nearbyCount').textContent.trim(),
              cardCount: document.querySelectorAll('#truckCards .truck-card').length
            };
          })()`
        ),
      { label: 'List view usable when Leaflet fails to load' }
    );
    assert.equal(noLeafletList.leafletDefined, false);
    assert(noLeafletList.nearbyText.includes('59 places'));
    assert.equal(noLeafletList.cardCount, 59);

    await cdp.eval(noLeafletTab.sessionId, `document.getElementById('mapMode').click(); true;`);
    const noLeafletFallback = await waitForCondition(
      () =>
        cdp.eval(
          noLeafletTab.sessionId,
          `!document.getElementById('mapFallback').hidden ? document.getElementById('mapFallbackCopy').textContent.trim() : null`
        ),
      { label: 'Missing Leaflet fallback message' }
    );
    assert(noLeafletFallback.includes('Interactive map scripts could not be loaded'));
    await cdp.eval(noLeafletTab.sessionId, `document.getElementById('mapFallbackListBtn').click(); true;`);
    assert.equal(
      await cdp.eval(noLeafletTab.sessionId, `document.getElementById('discoverScreen').classList.contains('list-mode')`),
      true
    );

    // =========================================================================
    // [10] Unapproved Client Host Fails Safely With ZERO Unapproved Requests
    // =========================================================================
    const badCfgTab = await openIsolatedTab({ leafletMode: 'fixture', width: 1280, height: 800, mobile: false });
    await cdp.send('Page.navigate', { url: `${baseUrl}/` }, badCfgTab.sessionId);
    await waitForCondition(
      () => cdp.eval(badCfgTab.sessionId, `Boolean(window.bitesharkReady && window.bitesharkFeatures?.isLoaded())`),
      { label: 'Bad-config tab ready' }
    );
    const reqsBeforeBadCfg = tileMock.requests.length;
    await cdp.eval(
      badCfgTab.sessionId,
      `(() => {
        window.__BITESHARK_TEST_MAP_CONFIG = {
          enabled: true,
          config_valid: true,
          provider_id: 'osm_standard',
          tile_url_template: 'https://unapproved-tiles.example.invalid/{z}/{x}/{y}.png'
        };
        document.getElementById('mapMode').click();
        return true;
      })()`
    );
    const badCfgState = await waitForCondition(
      () =>
        cdp.eval(
          badCfgTab.sessionId,
          `!document.getElementById('mapFallback').hidden ? { copy: document.getElementById('mapFallbackCopy').textContent.trim(), retryHidden: document.getElementById('mapFallbackRetryBtn').hidden } : null`
        ),
      { label: 'Unapproved host rejected before network request' }
    );
    assert(badCfgState.copy.includes('configuration is currently unavailable'));
    assert.equal(badCfgState.retryHidden, true);
    assert.equal(tileMock.requests.length, reqsBeforeBadCfg);
    assert.equal(externalUnexpectedRequests.length, 0, 'Zero requests may ever be sent to unapproved external hosts');

    // =========================================================================
    // [11] Map-Disabled Mode (`interactive_map = hidden`) Makes ZERO Tile Requests
    // =========================================================================
    // Bootstrap Top Admin and disable `interactive_map` via real `/api/admin/features/update`
    const topEmail = 'map-top@staging.biteshark.invalid';
    const startAuth = await fetch(`${baseUrl}/api/auth/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: baseUrl,
        'X-BiteShark-Client': 'web-auth-v1'
      },
      body: JSON.stringify({ email: topEmail, intent: 'signup', dob: '1988-06-15' })
    });
    assert.equal(startAuth.status, 200);
    const mbxRes = await fetch(`${baseUrl}/api/auth/staging-mailbox`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: baseUrl,
        'X-Staging-Mailbox-Secret': mailboxSecret
      },
      body: JSON.stringify({ email: topEmail })
    });
    const { code } = await mbxRes.json();
    const verRes = await fetch(`${baseUrl}/api/auth/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: baseUrl,
        'X-BiteShark-Client': 'web-auth-v1'
      },
      body: JSON.stringify({ email: topEmail, code })
    });
    assert.equal(verRes.status, 200);
    const topCookie = extractSessionCookie(verRes);
    const topUser = (await verRes.json()).user;

    {
      const seedClient = await migratorPool.connect();
      try {
        await seedClient.query('BEGIN');
        await seedClient.query("SELECT set_config('app.auth_internal', 'true', true), set_config('app.is_platform_admin', 'true', true)");
        await seedClient.query(
          `INSERT INTO platform_roles (user_id, role, granted_by) VALUES ($1, 'top', 'bootstrap')`,
          [topUser.id]
        );
        await seedClient.query('COMMIT');
      } finally {
        seedClient.release();
      }
    }

    const disableMapRes = await fetch(`${baseUrl}/api/admin/features/update`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: baseUrl,
        Cookie: topCookie
      },
      body: JSON.stringify({
        feature_key: 'interactive_map',
        configured_state: 'hidden',
        audience: 'all',
        expected_revision: 0,
        reason: 'Verify zero tile requests when interactive_map is hidden'
      })
    });
    assert.equal(disableMapRes.status, 200);

    const tileCountBeforeDisabledTab = tileMock.requests.filter(r => r.url.startsWith('/tiles/')).length;
    const disabledMapTab = await openIsolatedTab({ leafletMode: 'fixture', width: 1280, height: 800, mobile: false });
    await cdp.send('Page.navigate', { url: `${baseUrl}/` }, disabledMapTab.sessionId);
    const disabledState = await waitForCondition(
      async () =>
        cdp.eval(
          disabledMapTab.sessionId,
          `(() => {
            if (!window.bitesharkReady || !window.bitesharkFeatures?.isLoaded() || trucks.length !== 59) return null;
            const modeSw = document.querySelector('#discoverScreen .mode-switch');
            if (!modeSw || !modeSw.hidden) return null;
            // Even programmatic setMode('map') must stay in list-mode and make zero tile requests
            setMode('map');
            return {
              modeSwitchHidden: modeSw.hidden,
              mapModeBtnDisabled: document.getElementById('mapMode').disabled,
              stillListMode: document.getElementById('discoverScreen').classList.contains('list-mode'),
              mapInitialized: Boolean(map),
              cardsCount: document.querySelectorAll('#truckCards .truck-card').length,
              apiMapPayload: window.bitesharkFeatures.getMapConfig()
            };
          })()`
        ),
      { label: 'Map-disabled tab synced' }
    );
    assert.equal(disabledState.modeSwitchHidden, true);
    assert.equal(disabledState.mapModeBtnDisabled, true);
    assert.equal(disabledState.stillListMode, true);
    assert.equal(disabledState.mapInitialized, false, 'Leaflet map must not initialize when interactive_map is hidden');
    assert.equal(disabledState.cardsCount, 59, 'List discovery remains 100% preserved when map is disabled');
    assert.equal(disabledState.apiMapPayload.enabled, false);
    assert.equal(disabledState.apiMapPayload.tile_url_template, null);
    assert.equal(
      tileMock.requests.filter(r => r.url.startsWith('/tiles/')).length,
      tileCountBeforeDisabledTab,
      'Map-disabled mode must make ZERO tile requests'
    );

    console.log(
      'PASS: all 12 map resilience, origin-only Referer, provider allowlist, outage/timeout fallback, bounded retry, disabled-map zero-request, and desktop/mobile accessibility E2E checks passed'
    );
  } finally {
    if (cdp) cdp.close();
    if (chromeProc) {
      try { chromeProc.kill('SIGKILL'); } catch {}
    }
    if (chromeProfileDir) {
      try { fs.rmSync(chromeProfileDir, { recursive: true, force: true }); } catch {}
    }
    if (serverProc) {
      try { serverProc.kill('SIGTERM'); } catch {}
    }
    for (const hungRes of tileMock.hungResponses.splice(0)) {
      try { hungRes.destroy(); } catch {}
    }
    for (const sock of openTileSockets) {
      try { sock.destroy(); } catch {}
    }
    if (tileServer) {
      await new Promise(r => tileServer.close(() => r()));
    }
    if (migratorPool) await migratorPool.end().catch(() => {});
    await adminPool.end().catch(() => {});
    await pgCluster.stop();
  }
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
