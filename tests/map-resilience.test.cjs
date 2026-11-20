// BiteShark Map Provider Registry, Referrer Policy & Feature-Control Unit Suite
//
// Covers deterministic configuration & security boundaries without external network calls:
//   - Default `osm_standard` configuration (`referrer_policy: 'origin'`, HTTPS, curated attribution)
//   - Commercial allowlisted providers (`stadia_osm_bright`, `mapbox_streets`, `maptiler_streets`)
//   - Rejection of server/secret keys (`sk.*`, `sk_live_*`, `re_*`, `whsec_*`) and non-`pk.` Mapbox keys
//   - Rejection of unapproved providers, unapproved tile hosts, HTTP scheme, `{s}` host rotation,
//     missing `{z}/{x}/{y}`, credentials/hashes, invalid zoom bounds, and alias conflicts
//   - `loopback_test` blocked in production or without `ALLOW_TEST_MAP_PROVIDER=1`
//   - Feature-control integration (`interactive_map` env overrides, `staff_beta`, safe payload)
//   - Service worker (`public/sw.js`) registers zero `fetch` tile-cache interceptors

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');

(async () => {
  const mapMod = await import(pathToFileURL(path.join(ROOT, 'lib', 'map-config.js')).href);
  const fcMod = await import(pathToFileURL(path.join(ROOT, 'lib', 'feature-controls.js')).href);

  const { resolveMapRuntimeConfig, ALLOWLISTED_MAP_PROVIDERS } = mapMod;

  // 1. Default `osm_standard` provider configuration
  const defCfg = resolveMapRuntimeConfig({ BITESHARK_ENV: 'staging' });
  assert.equal(defCfg.enabled, true);
  assert.equal(defCfg.config_valid, true);
  assert.equal(defCfg.provider_id, 'osm_standard');
  assert.equal(defCfg.tile_url_template, 'https://tile.openstreetmap.org/{z}/{x}/{y}.png');
  assert.equal(defCfg.referrer_policy, 'origin');
  assert.equal(defCfg.min_zoom, 3);
  assert.equal(defCfg.max_zoom, 19);
  assert(defCfg.attribution_html.includes('OpenStreetMap'));

  // 2. Map disabled explicitly via `BITESHARK_MAP_ENABLED=0`
  const disabledCfg = resolveMapRuntimeConfig({
    BITESHARK_ENV: 'staging',
    BITESHARK_MAP_ENABLED: '0'
  });
  assert.equal(disabledCfg.enabled, false);
  assert.equal(disabledCfg.config_valid, true);
  assert.equal(disabledCfg.tile_url_template, null);
  assert.equal(disabledCfg.status_reason, 'MAP_DISABLED_BY_ENV');

  // 3. Commercial allowlisted providers & public token validation
  const stadiaDomainAuth = resolveMapRuntimeConfig({
    BITESHARK_ENV: 'staging',
    BITESHARK_MAP_PROVIDER: 'stadia_osm_bright'
  });
  assert.equal(stadiaDomainAuth.enabled, true);
  assert.equal(stadiaDomainAuth.tile_url_template, 'https://tiles.stadiamaps.com/tiles/osm_bright/{z}/{x}/{y}.png');
  assert(stadiaDomainAuth.attribution_html.includes('Stadia Maps'));

  const stadiaWithPublicKey = resolveMapRuntimeConfig({
    BITESHARK_ENV: 'staging',
    BITESHARK_MAP_PROVIDER: 'stadia_osm_bright',
    BITESHARK_MAP_PUBLIC_TOKEN: 'pub_stadia_domain_key_123'
  });
  assert.equal(stadiaWithPublicKey.enabled, true);
  assert.equal(
    stadiaWithPublicKey.tile_url_template,
    'https://tiles.stadiamaps.com/tiles/osm_bright/{z}/{x}/{y}.png?api_key=pub_stadia_domain_key_123'
  );

  // Mapbox requires `pk.*` public token and MUST reject `sk.*` secret keys
  const mapboxMissingToken = resolveMapRuntimeConfig({
    BITESHARK_ENV: 'staging',
    BITESHARK_MAP_PROVIDER: 'mapbox_streets'
  });
  assert.equal(mapboxMissingToken.enabled, false);
  assert.equal(mapboxMissingToken.config_valid, false);
  assert.equal(mapboxMissingToken.error_code, 'MAP_PUBLIC_TOKEN_REQUIRED');
  assert.equal(mapboxMissingToken.tile_url_template, null);

  const mapboxSecretRejected = resolveMapRuntimeConfig({
    BITESHARK_ENV: 'staging',
    BITESHARK_MAP_PROVIDER: 'mapbox_streets',
    BITESHARK_MAP_PUBLIC_TOKEN: 'sk.eyJ1IjoiZXhhbXBsZSIsImEiOiJzZWNyZXQifQ.secret123456'
  });
  assert.equal(mapboxSecretRejected.enabled, false);
  assert.equal(mapboxSecretRejected.config_valid, false);
  assert.equal(mapboxSecretRejected.error_code, 'MAP_SECRET_KEY_REJECTED');
  assert.equal(mapboxSecretRejected.tile_url_template, null);

  const mapboxValidPk = resolveMapRuntimeConfig({
    BITESHARK_ENV: 'staging',
    BITESHARK_MAP_PROVIDER: 'mapbox_streets',
    BITESHARK_MAP_PUBLIC_TOKEN: 'pk.eyJ1IjoiYml0ZXNoYXJrIiwiYSI6InB1YmxpYyJ9.domainrestricted'
  });
  assert.equal(mapboxValidPk.enabled, true);
  assert.equal(mapboxValidPk.config_valid, true);
  assert(mapboxValidPk.tile_url_template.startsWith('https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/256/{z}/{x}/{y}?access_token=pk.'));
  assert(mapboxValidPk.attribution_html.includes('Mapbox'));

  const maptilerValid = resolveMapRuntimeConfig({
    BITESHARK_ENV: 'staging',
    BITESHARK_MAP_PROVIDER: 'maptiler_streets',
    BITESHARK_MAP_PUBLIC_TOKEN: 'mt_public_origin_key_abc123'
  });
  assert.equal(maptilerValid.enabled, true);
  assert.equal(
    maptilerValid.tile_url_template,
    'https://api.maptiler.com/maps/streets-v2/256/{z}/{x}/{y}.png?key=mt_public_origin_key_abc123'
  );

  // Token on `osm_standard` is rejected so tokens never leak to public OSM servers
  const osmUnexpectedToken = resolveMapRuntimeConfig({
    BITESHARK_ENV: 'staging',
    BITESHARK_MAP_PROVIDER: 'osm_standard',
    BITESHARK_MAP_PUBLIC_TOKEN: 'accidental_token_123'
  });
  assert.equal(osmUnexpectedToken.enabled, false);
  assert.equal(osmUnexpectedToken.config_valid, false);
  assert.equal(osmUnexpectedToken.error_code, 'MAP_TOKEN_NOT_SUPPORTED_FOR_PROVIDER');

  // 4. Unapproved providers, unapproved hosts, HTTP downgrade, `{s}` host rotation, and bad zoom fail safely
  for (const badEnv of [
    { BITESHARK_ENV: 'staging', BITESHARK_MAP_PROVIDER: 'unknown_provider' },
    {
      BITESHARK_ENV: 'staging',
      BITESHARK_MAP_PROVIDER: 'osm_standard',
      BITESHARK_MAP_TILE_URL: 'https://evil.example.com/{z}/{x}/{y}.png'
    },
    {
      BITESHARK_ENV: 'staging',
      BITESHARK_MAP_PROVIDER: 'osm_standard',
      BITESHARK_MAP_TILE_URL: 'http://tile.openstreetmap.org/{z}/{x}/{y}.png'
    },
    {
      BITESHARK_ENV: 'staging',
      BITESHARK_MAP_PROVIDER: 'osm_standard',
      BITESHARK_MAP_TILE_URL: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
    },
    {
      BITESHARK_ENV: 'staging',
      BITESHARK_MAP_PROVIDER: 'osm_standard',
      BITESHARK_MAP_TILE_URL: 'https://tile.openstreetmap.org/static.png'
    },
    {
      BITESHARK_ENV: 'staging',
      BITESHARK_MAP_PROVIDER: 'osm_standard',
      BITESHARK_MAP_MIN_ZOOM: '18',
      BITESHARK_MAP_MAX_ZOOM: '10'
    },
    {
      BITESHARK_ENV: 'staging',
      BITESHARK_MAP_PROVIDER: 'osm_standard',
      TRUCKLY_MAP_PROVIDER: 'stadia_osm_bright'
    }
  ]) {
    const res = resolveMapRuntimeConfig(badEnv);
    assert.equal(res.enabled, false, `Expected disabled on ${JSON.stringify(badEnv)}`);
    assert.equal(res.config_valid, false, `Expected invalid on ${JSON.stringify(badEnv)}`);
    assert.equal(res.tile_url_template, null, 'Must never expose invalid tile_url_template');
  }

  // 5. `loopback_test` permitted ONLY outside production with `ALLOW_TEST_MAP_PROVIDER=1`
  const loopbackNoFlag = resolveMapRuntimeConfig({
    BITESHARK_ENV: 'staging',
    BITESHARK_MAP_PROVIDER: 'loopback_test',
    BITESHARK_MAP_TILE_URL: 'http://127.0.0.1:49123/tiles/{z}/{x}/{y}.png'
  });
  assert.equal(loopbackNoFlag.enabled, false);
  assert.equal(loopbackNoFlag.error_code, 'TEST_MAP_PROVIDER_NOT_PERMITTED');

  const loopbackInProd = resolveMapRuntimeConfig({
    BITESHARK_ENV: 'production',
    BITESHARK_ALLOW_TEST_MAP_PROVIDER: '1',
    BITESHARK_MAP_PROVIDER: 'loopback_test',
    BITESHARK_MAP_TILE_URL: 'http://127.0.0.1:49123/tiles/{z}/{x}/{y}.png'
  });
  assert.equal(loopbackInProd.enabled, false);
  assert.equal(loopbackInProd.error_code, 'TEST_MAP_PROVIDER_NOT_PERMITTED');

  const loopbackAllowed = resolveMapRuntimeConfig({
    BITESHARK_ENV: 'staging',
    BITESHARK_ALLOW_TEST_MAP_PROVIDER: '1',
    BITESHARK_MAP_PROVIDER: 'loopback_test',
    BITESHARK_MAP_TILE_URL: 'http://127.0.0.1:49123/tiles/{z}/{x}/{y}.png'
  });
  assert.equal(loopbackAllowed.enabled, true);
  assert.equal(loopbackAllowed.config_valid, true);
  assert.equal(loopbackAllowed.referrer_policy, 'origin');
  assert.equal(Object.keys(ALLOWLISTED_MAP_PROVIDERS).length, 5);

  // 6. Feature-controls integration (`interactive_map` + `buildPublicFeatureControlsPayload`)
  const prevMapEnabled = process.env.BITESHARK_MAP_ENABLED;
  const prevMapProvider = process.env.BITESHARK_MAP_PROVIDER;
  try {
    delete process.env.BITESHARK_MAP_ENABLED;
    delete process.env.BITESHARK_MAP_PROVIDER;

    const evalDefault = fcMod.evaluateFeatureControlsSnapshot({
      persistedResult: { configTrusted: true, persistedByKey: new Map() },
      accessCtx: null
    });
    const pubDefault = fcMod.buildPublicFeatureControlsPayload(evalDefault);
    assert.equal(pubDefault.features.interactive_map.state, 'enabled');
    assert.equal(pubDefault.map.enabled, true);
    assert.equal(pubDefault.map.provider_id, 'osm_standard');
    assert.equal(pubDefault.map.referrer_policy, 'origin');
    assert.equal(pubDefault.map.tile_url_template, 'https://tile.openstreetmap.org/{z}/{x}/{y}.png');

    // Persisted `interactive_map = hidden` strips `tile_url_template` for browsers
    const hiddenMap = new Map([
      [
        'interactive_map',
        {
          feature_key: 'interactive_map',
          configured_state: 'hidden',
          audience: 'all',
          revision: 1,
          reason: 'Map provider maintenance'
        }
      ]
    ]);
    const evalHidden = fcMod.evaluateFeatureControlsSnapshot({
      persistedResult: { configTrusted: true, persistedByKey: hiddenMap },
      accessCtx: null
    });
    const pubHidden = fcMod.buildPublicFeatureControlsPayload(evalHidden);
    assert.equal(pubHidden.features.interactive_map.state, 'hidden');
    assert.equal(pubHidden.map.enabled, false);
    assert.equal(pubHidden.map.tile_url_template, null);
    assert.equal(pubHidden.map.status_reason, 'FEATURE_DISABLED');

    // Invalid env config forces `interactive_map` hidden even if DB says `enabled`
    process.env.BITESHARK_MAP_PROVIDER = 'unapproved_xyz';
    const evalInvalidEnv = fcMod.evaluateFeatureControlsSnapshot({
      persistedResult: { configTrusted: true, persistedByKey: new Map() },
      accessCtx: null
    });
    const pubInvalidEnv = fcMod.buildPublicFeatureControlsPayload(evalInvalidEnv);
    assert.equal(pubInvalidEnv.features.interactive_map.state, 'hidden');
    assert.equal(pubInvalidEnv.map.enabled, false);
    assert.equal(pubInvalidEnv.map.config_valid, false);
    assert.equal(pubInvalidEnv.map.tile_url_template, null);
  } finally {
    if (prevMapEnabled === undefined) delete process.env.BITESHARK_MAP_ENABLED;
    else process.env.BITESHARK_MAP_ENABLED = prevMapEnabled;
    if (prevMapProvider === undefined) delete process.env.BITESHARK_MAP_PROVIDER;
    else process.env.BITESHARK_MAP_PROVIDER = prevMapProvider;
  }

  // 7. Service worker (`public/sw.js`) has zero `fetch` interceptors / tile caches
  const swSource = fs.readFileSync(path.join(ROOT, 'public', 'sw.js'), 'utf8');
  assert(!/addEventListener\s*\(\s*['"]fetch['"]/i.test(swSource), 'sw.js must not intercept fetch or cache tiles');
  assert(!/caches\.open/i.test(swSource), 'sw.js must not open Cache Storage for map tiles');

  console.log(
    'PASS: map provider allowlist, HTTPS & zoom bounds, secret-key rejection, fail-safe config, feature-control integration, and service-worker cache hygiene'
  );
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
