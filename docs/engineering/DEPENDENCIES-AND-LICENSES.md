# Engineering Dependency, Asset & License Provenance Inventory

> [!NOTE]
> **Engineering Inventory Disclaimer**: This document records exact package versions, CDN URLs, vendored files, and license identifiers observed in repository metadata (`package.json`, `package-lock.json`, `LICENSE` files). Presence of a license identifier is an engineering provenance record, **not** legal certification.

---

## 1. Runtime & Package Manager Conventions

- **Node.js Engine**: `>=22.0.0` (`/opt/nodejs/node-v22-lts/bin` on VPS; `actions/setup-node@v4` `node-version: 22` in CI).
- **Package Manager**: `npm` with lockfile `package-lock.json` (`lockfileVersion: 3`). Production/staging installs always run **`npm ci --omit=dev --ignore-scripts`** on Linux (`deploy/install-staging-release.sh`) — never upload Windows `node_modules`.
- **Root Repository License Field**: `package.json` sets `"private": true` with no root `LICENSE` file (first-party proprietary/unlicensed application source).

---

## 2. Direct & Transitive npm Dependencies (`package.json`)

| Package | Version | Scope | Declared License | Provenance & Usage |
|---|---|---|---|---|
| `@biteshark/runtime-adapter` | `1.0.0` (`file:./packages/runtime-adapter`) | Runtime (First-party) | First-party private | Repo-owned ESM `AsyncLocalStorage` + `WeakMap` request/DB adapter (`0` external deps). |
| `cookie` | `1.1.1` | Runtime | `MIT` | HTTP `Cookie` / `Set-Cookie` parsing & serialization (`lib/standalone-auth.js`, `lib/age-policy.js`). |
| `otplib` | `13.6.0` | Runtime | `MIT` | RFC 4226 6-digit HOTP generation (`lib/standalone-auth.js`). Pulls 8 pure-JS `MIT` packages (`@otplib/*@13.6.0`, `@noble/hashes@2.4.0`, `@scure/base@2.4.0`). |
| `pg` | `8.23.1` | Runtime | `MIT` | PostgreSQL client & connection pool (`server/index.js`, `scripts/*.cjs`). Pulls 10 `MIT` packages (`pg-pool`, `pg-protocol`, `pg-types`, `pg-connection-string`, `pgpass`, `pg-cloudflare`, `postgres-*`, `xtend`) and **2 `ISC` packages** (`pg-int8@1.0.1`, `split2@4.2.0`). |
| `sharp` | `0.35.5` | Runtime (`working/biteshark-vps`; not yet merged into `staging2` branches) | `Apache-2.0` *(libvips `LGPL-3.0-or-later`)* | Server-side image decode/EXIF-strip/WebP thumbnail normalization (`lib/photo-storage.js`) with `sharp.cache(false); sharp.concurrency(1)`. |

*(Note: RFC 8291/8292 Web Push encryption in `lib/webpush-crypto.js` uses built-in `node:crypto` with zero third-party push npm dependencies.)*

---

## 3. Vendored Tooling Code (Excluded from Release Tarballs)

| Path | Upstream Package & Version | License | SHA-256 & Scope |
|---|---|---|---|
| `tools/code-registry/vendor/acorn/{acorn.mjs,LICENSE,package.json}` | `acorn@8.14.1` | `MIT` | `acorn.mjs` SHA-256 `4c09beddbf61851ae40b86d32bc5b05eb0ce1ac3d0145676c2609d825abedf87`. Used offline by `tools/code-registry/` AST scanner; excluded from deployable tarballs via `.gitattributes` `tools export-ignore`. |

---

## 4. Browser CDN Libraries, Fonts & Map Tile Providers

| External Resource | Loaded By | License / Terms | Engineering & Operational Notes |
|---|---|---|---|
| `https://unpkg.com/leaflet@1.9.4/dist/leaflet.css` & `leaflet.js` | `public/index.html` | `BSD-2-Clause` | Loaded without SRI `integrity` attribute (tracked in `KNOWN-DRIFT.md`). Unreachable CDN degrades cleanly to List view. |
| `https://fonts.googleapis.com/css2?family=DM+Sans...&family=Fredoka...` | `public/theme.css:1` (`/index.html`, `/login.html`) | SIL Open Font License (`OFL-1.1`) / Google Fonts ToS | `/admin.html` and `/policies/*.html` use local system font stacks only. |
| `https://tile.openstreetmap.org/{z}/{x}/{y}.png` *(default `osm_standard`)* | `lib/map-config.js` -> `public/app.js` | ODbL / OSMF Tile Usage Policy | Requires visible `© OpenStreetMap contributors` attribution, `referrerPolicy: 'origin'`, zero bulk/SW pre-caching. Volunteer tiles are for low-volume pilot/staging only; switch `BITESHARK_MAP_PROVIDER` to `stadia_osm_bright`, `mapbox_streets`, or `maptiler_streets` before commercial scale. |

---

## 5. First-Party Media, SVG Artwork & Historical Archives

- **First-Party Icons & SVGs (`public/`)**: `logo.svg`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`, `badge-96.png`, plus inline SVGs in `characters.js`, `coffee-club.js`, `app.js`, `smart.js`, `admin.html`, `login.html` *(+ `editorial-stories.js` on `83181ba` and `map-cards.js` on `a2f0135`)*.
- **Third-Party Vendor Photos**: **Zero** third-party food/vendor photos are bundled in `public/`. All 59 seeded `vendors` rows default to `photo_rights_verified = false`, and `lib/discovery.js` + `public/app.js` + `public/listing-highlights.js` strip unverified or generic stock (`unsplash.com`) URLs.
- **Historical Root Archives (`export-ignore`d)**: `truckly-v63.zip` and `truckly-data.sql.gz` are pre-VPS historical snapshots retained for git provenance only and blocked from release tarballs.
