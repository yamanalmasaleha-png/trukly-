// BiteShark Centralized, Allowlisted Map Tile Provider Configuration & Validator
//
// Security, Privacy & Provider-Policy Invariants:
//   1. Fixed Allowlisted Registry: Only reviewed map providers (`osm_standard`,
//      `stadia_osm_bright`, `mapbox_streets`, `maptiler_streets`, plus non-production
//      `loopback_test` when `ALLOW_TEST_MAP_PROVIDER=1`) are permitted. Arbitrary hosts
//      and arbitrary attribution HTML from environment, admin, or public input are rejected.
//   2. Origin-Only Referrer (`referrer_policy: 'origin'`): Approved tile `<img>` requests
//      send only the scheme + host (+ non-default port) as `Referer`, satisfying the
//      OpenStreetMap Foundation Tile Usage Policy without disclosing page paths, query
//      strings, invitation tokens, pager capabilities, or account data, while preserving
//      the global `Referrer-Policy: same-origin` header for all other requests.
//   3. Public Browser Tokens Only: Providers that require a browser key (`mapbox_streets`,
//      `maptiler_streets`, optional `stadia_osm_bright`) must use domain/URL-restricted
//      public tokens. Obvious server/secret keys (`sk.*`, `sk_live_*`, `re_*`, `whsec_*`,
//      etc.) are rejected fail-closed and never exposed to browsers.
//   4. Isolated Fail-Safe: Invalid map configuration disables ONLY the interactive map
//      (`enabled: false, config_valid: false, tile_url_template: null`) without blocking
//      server startup, Sonoma County List discovery, authentication, or admin operations.

import { EnvAliasConflictError, readEnvCompat } from './env-compat.js';

export const ALLOWLISTED_MAP_PROVIDERS = Object.freeze({
  osm_standard: Object.freeze({
    id: 'osm_standard',
    label: 'OpenStreetMap Standard',
    defaultTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    tokenTemplate: null,
    allowedHosts: Object.freeze(['tile.openstreetmap.org']),
    attributionHtml:
      '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
    defaultMinZoom: 3,
    defaultMaxZoom: 19,
    hardMaxZoom: 19,
    tokenMode: 'none'
  }),
  stadia_osm_bright: Object.freeze({
    id: 'stadia_osm_bright',
    label: 'Stadia Maps OSM Bright',
    defaultTemplate: 'https://tiles.stadiamaps.com/tiles/osm_bright/{z}/{x}/{y}.png',
    tokenTemplate: 'https://tiles.stadiamaps.com/tiles/osm_bright/{z}/{x}/{y}.png?api_key={token}',
    allowedHosts: Object.freeze(['tiles.stadiamaps.com', 'tiles-eu.stadiamaps.com']),
    attributionHtml:
      '&copy; <a href="https://stadiamaps.com/" target="_blank" rel="noopener noreferrer">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/" target="_blank" rel="noopener noreferrer">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
    defaultMinZoom: 3,
    defaultMaxZoom: 20,
    hardMaxZoom: 20,
    tokenMode: 'optional'
  }),
  mapbox_streets: Object.freeze({
    id: 'mapbox_streets',
    label: 'Mapbox Streets',
    defaultTemplate:
      'https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/256/{z}/{x}/{y}?access_token={token}',
    tokenTemplate:
      'https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/256/{z}/{x}/{y}?access_token={token}',
    allowedHosts: Object.freeze(['api.mapbox.com']),
    attributionHtml:
      '&copy; <a href="https://www.mapbox.com/about/maps/" target="_blank" rel="noopener noreferrer">Mapbox</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
    defaultMinZoom: 3,
    defaultMaxZoom: 19,
    hardMaxZoom: 22,
    tokenMode: 'required_mapbox_pk'
  }),
  maptiler_streets: Object.freeze({
    id: 'maptiler_streets',
    label: 'MapTiler Streets',
    defaultTemplate: 'https://api.maptiler.com/maps/streets-v2/256/{z}/{x}/{y}.png?key={token}',
    tokenTemplate: 'https://api.maptiler.com/maps/streets-v2/256/{z}/{x}/{y}.png?key={token}',
    allowedHosts: Object.freeze(['api.maptiler.com']),
    attributionHtml:
      '&copy; <a href="https://www.maptiler.com/copyright/" target="_blank" rel="noopener noreferrer">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
    defaultMinZoom: 3,
    defaultMaxZoom: 19,
    hardMaxZoom: 22,
    tokenMode: 'required'
  }),
  loopback_test: Object.freeze({
    id: 'loopback_test',
    label: 'Deterministic Loopback Test Tile Fixture',
    defaultTemplate: null,
    tokenTemplate: null,
    allowedHosts: Object.freeze(['127.0.0.1', 'localhost']),
    attributionHtml:
      '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
    defaultMinZoom: 3,
    defaultMaxZoom: 19,
    hardMaxZoom: 20,
    tokenMode: 'optional',
    testOnly: true
  })
});

const FORBIDDEN_SECRET_TOKEN_PREFIXES = Object.freeze([
  'sk.',
  'sk_live_',
  'sk_test_',
  'rk_live_',
  'rk_test_',
  're_',
  'whsec_',
  'ghp_',
  'github_pat_',
  'xoxb-',
  'xoxp-',
  'bearer '
]);

function buildDisabledMapResult({ configValid, providerId = null, providerLabel = null, statusReason, errorCode = null }) {
  return Object.freeze({
    enabled: false,
    config_valid: Boolean(configValid),
    provider_id: providerId,
    provider_label: providerLabel,
    tile_url_template: null,
    allowed_hosts: Object.freeze([]),
    attribution_html: null,
    min_zoom: null,
    max_zoom: null,
    referrer_policy: 'origin',
    status_reason: statusReason,
    error_code: errorCode
  });
}

function isProductionRuntime(envObj) {
  let rawEnv = '';
  try {
    rawEnv = readEnvCompat('ENV', { securityCritical: true, envObj }).toLowerCase();
  } catch {
    return true;
  }
  return (
    rawEnv === 'production' ||
    String(envObj?.NODE_ENV || '').trim().toLowerCase() === 'production' ||
    String(envObj?.HATCHABLE_PROJECT_ID || envObj?.PROJECT_ID || '').trim() === 'proj_MEO518rmLLl0'
  );
}

function validatePublicBrowserToken(rawToken, tokenMode) {
  if (!rawToken) {
    if (tokenMode === 'required' || tokenMode === 'required_mapbox_pk') {
      return { ok: false, errorCode: 'MAP_PUBLIC_TOKEN_REQUIRED' };
    }
    return { ok: true, value: '' };
  }

  if (tokenMode === 'none') {
    // Do not attach tokens to tokenless providers such as tile.openstreetmap.org
    return { ok: false, errorCode: 'MAP_TOKEN_NOT_SUPPORTED_FOR_PROVIDER' };
  }

  if (rawToken.length > 256 || /[\s<>"'`\\]/.test(rawToken)) {
    return { ok: false, errorCode: 'INVALID_MAP_PUBLIC_TOKEN_FORMAT' };
  }

  const lower = rawToken.toLowerCase();
  for (const prefix of FORBIDDEN_SECRET_TOKEN_PREFIXES) {
    if (lower.startsWith(prefix)) {
      return { ok: false, errorCode: 'MAP_SECRET_KEY_REJECTED' };
    }
  }

  if (tokenMode === 'required_mapbox_pk') {
    if (!rawToken.startsWith('pk.') || rawToken.length < 16) {
      return { ok: false, errorCode: 'MAPBOX_PUBLIC_PK_TOKEN_REQUIRED' };
    }
  }

  return { ok: true, value: rawToken };
}

function validateAndBuildTileTemplate(provider, customTemplate, publicToken) {
  let baseTemplate = customTemplate;
  if (!baseTemplate) {
    if (publicToken && provider.tokenTemplate) {
      baseTemplate = provider.tokenTemplate;
    } else {
      baseTemplate = provider.defaultTemplate;
    }
  }

  if (!baseTemplate || typeof baseTemplate !== 'string') {
    return { ok: false, errorCode: 'MAP_TILE_URL_REQUIRED' };
  }

  if (baseTemplate.length > 512 || /[\s<>"'`]/.test(baseTemplate)) {
    return { ok: false, errorCode: 'INVALID_MAP_TILE_URL_FORMAT' };
  }

  // Require standard {z}, {x}, {y} tile coordinate placeholders
  if (!baseTemplate.includes('{z}') || !baseTemplate.includes('{x}') || !baseTemplate.includes('{y}')) {
    return { ok: false, errorCode: 'MAP_TILE_URL_MISSING_ZXY_PLACEHOLDERS' };
  }

  // Inspect all brace placeholders so unapproved template variables (including host rotation `{s}`) are rejected
  const placeholders = [...baseTemplate.matchAll(/\{([^}]+)\}/g)].map(m => m[1]);
  const allowedPlaceholders = new Set(['z', 'x', 'y', 'r']);
  if (provider.tokenMode !== 'none') {
    allowedPlaceholders.add('token');
  }
  for (const ph of placeholders) {
    if (!allowedPlaceholders.has(ph)) {
      return { ok: false, errorCode: 'UNSUPPORTED_MAP_TILE_PLACEHOLDER' };
    }
  }

  let resolvedTemplate = baseTemplate;
  if (resolvedTemplate.includes('{token}')) {
    if (!publicToken) {
      return { ok: false, errorCode: 'MAP_PUBLIC_TOKEN_REQUIRED' };
    }
    resolvedTemplate = resolvedTemplate.replaceAll('{token}', encodeURIComponent(publicToken));
  }

  // Parse concrete probe URL after substituting valid numeric tile coordinates
  const probeUrlStr = resolvedTemplate
    .replaceAll('{z}', '11')
    .replaceAll('{x}', '326')
    .replaceAll('{y}', '791')
    .replaceAll('{r}', '');

  let parsed;
  try {
    parsed = new URL(probeUrlStr);
  } catch {
    return { ok: false, errorCode: 'INVALID_MAP_TILE_URL' };
  }

  if (parsed.username || parsed.password || parsed.hash) {
    return { ok: false, errorCode: 'INVALID_MAP_TILE_URL_CREDENTIALS_OR_HASH' };
  }

  const hostLower = parsed.hostname.toLowerCase();
  if (!provider.allowedHosts.includes(hostLower)) {
    return { ok: false, errorCode: 'UNAPPROVED_MAP_TILE_HOST' };
  }

  if (provider.testOnly) {
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { ok: false, errorCode: 'INVALID_TEST_MAP_PROTOCOL' };
    }
    if (!parsed.port) {
      return { ok: false, errorCode: 'TEST_MAP_PORT_REQUIRED' };
    }
  } else {
    if (parsed.protocol !== 'https:') {
      return { ok: false, errorCode: 'INSECURE_MAP_TILE_PROTOCOL' };
    }
    if (parsed.port !== '') {
      return { ok: false, errorCode: 'NON_STANDARD_MAP_TILE_PORT' };
    }
  }

  return { ok: true, template: resolvedTemplate };
}

export function resolveMapRuntimeConfig(envObj = process.env) {
  let rawEnabled = '';
  let rawProvider = '';
  let rawTileUrl = '';
  let rawPublicToken = '';
  let rawMinZoom = '';
  let rawMaxZoom = '';

  try {
    rawEnabled = readEnvCompat('MAP_ENABLED', { securityCritical: true, envObj }).toLowerCase();
    rawProvider = readEnvCompat('MAP_PROVIDER', { securityCritical: true, envObj }).toLowerCase();
    rawTileUrl = readEnvCompat('MAP_TILE_URL', { securityCritical: true, envObj });
    rawPublicToken = readEnvCompat('MAP_PUBLIC_TOKEN', { securityCritical: true, envObj });
    rawMinZoom = readEnvCompat('MAP_MIN_ZOOM', { securityCritical: true, envObj });
    rawMaxZoom = readEnvCompat('MAP_MAX_ZOOM', { securityCritical: true, envObj });
  } catch (err) {
    const code = err instanceof EnvAliasConflictError ? `MAP_ENV_ALIAS_CONFLICT_${err.suffix}` : 'MAP_ENV_READ_ERROR';
    return buildDisabledMapResult({
      configValid: false,
      statusReason: 'MAP_CONFIG_INVALID',
      errorCode: code
    });
  }

  if (rawEnabled !== '') {
    if (['0', 'false', 'no', 'off', 'disabled'].includes(rawEnabled)) {
      return buildDisabledMapResult({
        configValid: true,
        statusReason: 'MAP_DISABLED_BY_ENV',
        errorCode: null
      });
    }
    if (!['1', 'true', 'yes', 'on', 'enabled'].includes(rawEnabled)) {
      return buildDisabledMapResult({
        configValid: false,
        statusReason: 'MAP_CONFIG_INVALID',
        errorCode: 'INVALID_MAP_ENABLED_FLAG'
      });
    }
  }

  const providerId = rawProvider || 'osm_standard';
  const provider = Object.prototype.hasOwnProperty.call(ALLOWLISTED_MAP_PROVIDERS, providerId)
    ? ALLOWLISTED_MAP_PROVIDERS[providerId]
    : null;

  if (!provider) {
    return buildDisabledMapResult({
      configValid: false,
      statusReason: 'MAP_CONFIG_INVALID',
      errorCode: 'UNAPPROVED_MAP_PROVIDER'
    });
  }

  if (provider.testOnly) {
    let allowTest = false;
    try {
      allowTest = readEnvCompat('ALLOW_TEST_MAP_PROVIDER', { securityCritical: true, envObj }) === '1';
    } catch {
      allowTest = false;
    }
    if (isProductionRuntime(envObj) || !allowTest) {
      return buildDisabledMapResult({
        configValid: false,
        statusReason: 'MAP_CONFIG_INVALID',
        errorCode: 'TEST_MAP_PROVIDER_NOT_PERMITTED'
      });
    }
  }

  const tokenCheck = validatePublicBrowserToken(rawPublicToken, provider.tokenMode);
  if (!tokenCheck.ok) {
    return buildDisabledMapResult({
      configValid: false,
      statusReason: 'MAP_CONFIG_INVALID',
      errorCode: tokenCheck.errorCode
    });
  }

  const templateCheck = validateAndBuildTileTemplate(provider, rawTileUrl, tokenCheck.value);
  if (!templateCheck.ok) {
    return buildDisabledMapResult({
      configValid: false,
      statusReason: 'MAP_CONFIG_INVALID',
      errorCode: templateCheck.errorCode
    });
  }

  const minZoom = rawMinZoom === '' ? provider.defaultMinZoom : Number(rawMinZoom);
  const maxZoom = rawMaxZoom === '' ? provider.defaultMaxZoom : Number(rawMaxZoom);
  if (
    !Number.isInteger(minZoom) ||
    !Number.isInteger(maxZoom) ||
    minZoom < 0 ||
    minZoom > 18 ||
    maxZoom < 1 ||
    maxZoom > provider.hardMaxZoom ||
    minZoom > maxZoom
  ) {
    return buildDisabledMapResult({
      configValid: false,
      statusReason: 'MAP_CONFIG_INVALID',
      errorCode: 'INVALID_MAP_ZOOM_LIMITS'
    });
  }

  return Object.freeze({
    enabled: true,
    config_valid: true,
    provider_id: provider.id,
    provider_label: provider.label,
    tile_url_template: templateCheck.template,
    allowed_hosts: provider.allowedHosts,
    attribution_html: provider.attributionHtml,
    min_zoom: minZoom,
    max_zoom: maxZoom,
    referrer_policy: 'origin',
    status_reason: 'enabled',
    error_code: null
  });
}
