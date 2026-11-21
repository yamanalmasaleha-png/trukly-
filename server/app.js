import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  configureStandaloneAdapter,
  bindVerifiedRequestUser,
  runWithRequestContext,
  auth
} from '@biteshark/runtime-adapter';
import { applyPrivateNoStoreHeaders, loadAccessContext } from '../lib/authz.js';
import { SessionEligibilityError } from '../lib/db-tx.js';
import {
  buildAgeAssessmentRequiredPayload,
  isGovernanceRouteExemptFromAgeGate
} from '../lib/age-policy.js';
import {
  matchRouteFeatureRule,
  enforceHttpFeatureGate
} from '../lib/feature-controls.js';
import {
  CLIENT_BUNDLE_VERSION,
  generateCorrelationId,
  normalizeCorrelationId,
  recordDiagnosticEvent,
  recordServerReleaseStartup
} from '../lib/diagnostics.js';
import { verifySameOriginMutation as verifyPagerSubscriptionCsrf } from '../lib/pager-notifications.js';
import { runWithGovernanceContext } from '../lib/request-context.js';
import { isLoopbackIp, stampTrustedClientIp } from '../lib/client-ip.js';
import { readEnvCompat, assertNoSecurityEnvConflicts } from '../lib/env-compat.js';
import {
  startEmailOtpChallenge,
  verifyEmailOtpChallenge,
  resolveSessionFromRequest,
  revokeSessionFromRequest,
  readProtectedStagingMailboxCode,
  submitExistingAccountAgeAssessment,
  cleanupExpiredAuthRecords,
  getPublicAuthDeliveryModeSummary,
  verifySameOriginMutationRequest
} from '../lib/standalone-auth.js';
import { matchDomainApiRoute, REGISTERED_DOMAIN_ROUTE_COUNT } from './routes.js';
import {
  EVIDENCE_UPLOAD_MAX_JSON_BYTES,
  isGovernanceApiPath,
  handleGovernanceApiRequest
} from './admin-routes.js';
import * as stagingGateProbe from '../scripts/staging-runtime-probe.js';

const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PUBLIC_DIR = path.resolve(SERVER_DIR, '..', 'public');

export const DEFAULT_MAX_JSON_BYTES = 64 * 1024; // 64 KiB
export const AUTH_MAX_JSON_BYTES = 8 * 1024; // 8 KiB
export const DIAGNOSTICS_REPORT_MAX_JSON_BYTES = 4 * 1024; // 4 KiB

const ALLOWED_STATIC_MIME = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
});

const NO_CACHE_STATIC_FILES = new Set([
  '/index.html',
  '/login.html',
  '/admin.html',
  '/admin.css',
  '/admin.js',
  '/role-experience.css',
  '/role-experience.js',
  '/diagnostics-client.js',
  '/app.js',
  '/pager.js',
  '/community.js',
  '/local-guides.js',
  '/guide-passport.js',
  '/smart.js',
  '/theme.css',
  '/mobile-scroll-fix.css',
  '/sw.js',
  '/manifest.json',
  '/auth-client.js',
  '/build.json'
]);

function escapeHtml(raw) {
  return String(raw || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderAdminAccessDeniedHtml(userEmail, roleLabels = []) {
  const safeEmail = escapeHtml(userEmail || 'Signed-in account');
  const safeRoles = escapeHtml(roleLabels.length ? roleLabels.join(' · ') : 'Customer');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex,nofollow,noarchive" />
  <title>Administrator Access Required — BiteShark</title>
  <style>
    body { margin:0; font-family: system-ui, -apple-system, sans-serif; background:#fffaf0; color:#1c2520; display:flex; align-items:center; justify-content:center; min-height:100vh; padding:24px; }
    .card { max-width:480px; width:100%; background:#ffffff; border:1px solid #e6dfd1; border-radius:16px; padding:28px; box-shadow:0 12px 30px rgba(33,75,59,0.08); }
    .badge { display:inline-block; background:#fde8e6; color:#b42318; font-weight:700; font-size:12px; padding:4px 10px; border-radius:999px; letter-spacing:0.04em; text-transform:uppercase; }
    h1 { margin:14px 0 8px; font-size:22px; color:#214b3b; }
    p { margin:0 0 14px; font-size:14px; line-height:1.55; color:#4b5563; }
    .acct { background:#f8f5ec; border:1px solid #e6dfd1; border-radius:10px; padding:10px 12px; font-size:13px; margin-bottom:18px; }
    .actions { display:flex; gap:10px; flex-wrap:wrap; }
    a.btn { text-decoration:none; padding:10px 16px; border-radius:10px; font-weight:600; font-size:14px; }
    a.primary { background:#214b3b; color:#fff; }
    a.secondary { background:#f3efe4; color:#214b3b; border:1px solid #d9d0be; }
  </style>
</head>
<body>
  <main class="card" role="main">
    <span class="badge">403 · Access Restricted</span>
    <h1>BiteShark Administration Portal</h1>
    <p>This portal requires an authorized <strong>Admin: Mod</strong> or <strong>Admin: Top</strong> role.</p>
    <div class="acct">
      <div><strong>Signed in as:</strong> ${safeEmail}</div>
      <div><strong>Active permissions:</strong> ${safeRoles}</div>
    </div>
    <div class="actions">
      <a class="btn primary" href="/">Return to BiteShark</a>
      <a class="btn secondary" href="/login.html?next=%2Fadmin">Switch Account</a>
    </div>
  </main>
</body>
</html>`;
}

function parseActOnBehalfHeaders(req) {
  const rawVendor = req.headers?.['x-biteshark-act-on-behalf'];
  if (rawVendor === undefined || rawVendor === null || String(rawVendor).trim() === '') {
    return { present: false, ok: true, value: null };
  }
  const vendorId = String(rawVendor).trim();
  const rawReason = String(req.headers?.['x-biteshark-support-reason'] || '')
    .replace(/[\x00-\x1f\x7f]/g, ' ')
    .trim();
  if (!/^[a-z0-9_-]{1,80}$/i.test(vendorId) || rawReason.length < 8 || rawReason.length > 240) {
    return {
      present: true,
      ok: false,
      status: 400,
      code: 'INVALID_ACT_ON_BEHALF',
      error: 'Act-on-Behalf requires a valid vendor identifier and a support reason (8–240 characters).'
    };
  }
  return {
    present: true,
    ok: true,
    value: { vendorId, reason: rawReason }
  };
}

const MUTATING_HTTP_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function applyBaselineSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
}

function appendSetCookie(res, cookieValue) {
  if (!cookieValue) return;
  const existing = res.getHeader('Set-Cookie');
  if (!existing) {
    res.setHeader('Set-Cookie', cookieValue);
  } else if (Array.isArray(existing)) {
    res.setHeader('Set-Cookie', [...existing, cookieValue]);
  } else {
    res.setHeader('Set-Cookie', [String(existing), cookieValue]);
  }
}

function isIntentionalMaintenanceResponse(statusCode, payload) {
  if (statusCode !== 503 || !payload || typeof payload !== 'object') return false;
  if (payload.feature_disabled === true) return true;
  if (payload.code === 'FEATURE_PAUSED' || payload.code === 'FEATURE_DISABLED') return true;
  const msg = String(payload.error || '');
  return /temporarily paused for maintenance|temporarily disabled by an administrator/i.test(msg);
}

function sendJsonResponse(res, statusCode, payload, extraHeaders = {}) {
  if (res.writableEnded) return;
  if (statusCode >= 500 && res.__bsDiagHook && !res.__bsDiagHandled) {
    res.__bsDiagHandled = true;
    res.__pendingDiagPromise = res.__bsDiagHook(statusCode, payload, extraHeaders);
    return;
  }
  res.statusCode = statusCode;
  if (!res.getHeader('Content-Type')) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
  }
  for (const [k, v] of Object.entries(extraHeaders)) {
    if (v !== undefined && v !== null) {
      res.setHeader(k, v);
    }
  }
  const body = JSON.stringify(payload);
  res.setHeader('Content-Length', Buffer.byteLength(body, 'utf8'));
  res.end(body);
}

function createHandlerResponseAdapter(rawRes, govState = null) {
  return {
    statusCode: 200,
    setHeader(name, value) {
      if (!rawRes.headersSent) {
        rawRes.setHeader(name, value);
      }
      return this;
    },
    getHeader(name) {
      return rawRes.getHeader(name);
    },
    status(code) {
      this.statusCode = Number(code) || 200;
      rawRes.statusCode = this.statusCode;
      return this;
    },
    json(payload) {
      if (govState?.abortedBySessionEligibilityError && this.statusCode >= 500) {
        const abortErr = govState.abortedBySessionEligibilityError;
        applyPrivateNoStoreHeaders(rawRes);
        if (abortErr.status === 403) {
          sendJsonResponse(rawRes, 403, buildAgeAssessmentRequiredPayload('/'));
        } else {
          sendJsonResponse(rawRes, abortErr.status || 401, {
            error: abortErr.message || 'Sign in is required.',
            code: abortErr.code || 'SESSION_REVOKED'
          });
        }
        return this;
      }
      sendJsonResponse(rawRes, this.statusCode, payload);
      return this;
    },
    send(payload) {
      if (rawRes.writableEnded) return this;
      if (govState?.abortedBySessionEligibilityError && this.statusCode >= 500) {
        return this.json({});
      }
      rawRes.statusCode = this.statusCode;
      if (payload === undefined || payload === null) {
        rawRes.end();
        return this;
      }
      if (Buffer.isBuffer(payload) || typeof payload === 'string') {
        if (!rawRes.getHeader('Content-Type')) {
          rawRes.setHeader('Content-Type', 'text/plain; charset=utf-8');
        }
        rawRes.end(payload);
        return this;
      }
      sendJsonResponse(rawRes, this.statusCode, payload);
      return this;
    },
    end(chunk) {
      if (rawRes.writableEnded) return this;
      rawRes.statusCode = this.statusCode;
      rawRes.end(chunk);
      return this;
    }
  };
}

class BodyParseError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function readBoundedJsonBody(req, maxBytes) {
  let totalBytes = 0;
  const chunks = [];

  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buf.length;
    if (totalBytes > maxBytes) {
      // Drain/destroy socket stream cleanly after rejecting oversized payload
      throw new BodyParseError(413, 'PAYLOAD_TOO_LARGE', 'Request body exceeds maximum size limit.');
    }
    chunks.push(buf);
  }

  if (totalBytes === 0) {
    return {};
  }

  const rawText = Buffer.concat(chunks, totalBytes).toString('utf8').trim();
  if (!rawText) {
    return {};
  }

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new BodyParseError(400, 'INVALID_JSON', 'Invalid JSON request body.');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new BodyParseError(400, 'INVALID_JSON_OBJECT', 'JSON request body must be an object.');
  }

  return parsed;
}

function parseQueryObject(searchParams) {
  const out = Object.create(null);
  for (const [k, v] of searchParams.entries()) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    if (Object.prototype.hasOwnProperty.call(out, k)) {
      const prev = out[k];
      out[k] = Array.isArray(prev) ? [...prev, v] : [prev, v];
    } else {
      out[k] = v;
    }
  }
  return out;
}

function resolveSafePublicFile(realPublicRoot, rawPathname) {
  if (!rawPathname || !rawPathname.startsWith('/')) return null;
  if (rawPathname.includes('\0') || rawPathname.includes('\\')) return null;

  let decoded;
  try {
    decoded = decodeURIComponent(rawPathname);
  } catch {
    return null;
  }

  if (decoded.includes('\0') || decoded.includes('\\')) return null;
  if (decoded.startsWith('/__debug') || decoded.startsWith('/api/') || decoded === '/api') return null;

  let relUrl = decoded === '/' ? '/index.html' : decoded;
  if (relUrl === '/policies' || relUrl === '/policies/') {
    relUrl = '/policies/index.html';
  } else if (relUrl.startsWith('/policies/') && !path.extname(relUrl)) {
    const cleanRel = relUrl.endsWith('/') ? relUrl.slice(0, -1) : relUrl;
    relUrl = `${cleanRel}.html`;
  }
  const segments = relUrl.split('/').filter(Boolean);
  if (segments.length === 0) return null;

  // Reject any dotfile, `..`, `.` segment, or internal directory name
  for (const seg of segments) {
    if (seg === '.' || seg === '..' || seg.startsWith('.')) {
      return null;
    }
  }

  const ext = path.extname(segments[segments.length - 1]).toLowerCase();
  const mime = ALLOWED_STATIC_MIME[ext];
  if (!mime) {
    return null;
  }

  const candidatePath = path.resolve(realPublicRoot, ...segments);
  const rootPrefix = realPublicRoot.endsWith(path.sep) ? realPublicRoot : realPublicRoot + path.sep;
  if (!candidatePath.startsWith(rootPrefix)) {
    return null;
  }

  let realCandidate;
  try {
    realCandidate = fs.realpathSync(candidatePath);
  } catch {
    return null;
  }

  if (!realCandidate.startsWith(rootPrefix)) {
    return null;
  }

  let stat;
  try {
    stat = fs.statSync(realCandidate);
  } catch {
    return null;
  }
  if (!stat.isFile()) {
    return null;
  }

  const canonicalUrlPath = '/' + segments.join('/');
  const isPolicyDraftAsset = canonicalUrlPath.startsWith('/policies/');
  return {
    filePath: realCandidate,
    mime,
    size: stat.size,
    noCache: NO_CACHE_STATIC_FILES.has(canonicalUrlPath) || isPolicyDraftAsset,
    noIndex: isPolicyDraftAsset
  };
}

function readSafeSecurityFlag(suffix) {
  try {
    return readEnvCompat(suffix, { securityCritical: true }) === '1';
  } catch {
    return false;
  }
}

export function createStandaloneServer({
  dbAdapter,
  publicDir = DEFAULT_PUBLIC_DIR,
  releaseSha = readEnvCompat('RELEASE_SHA') || process.env.GITHUB_SHA || 'unknown',
  trustProxy = (() => {
    try {
      return readEnvCompat('TRUST_PROXY', { securityCritical: true, defaultValue: 'none' });
    } catch {
      return 'none';
    }
  })(),
  maxJsonBytes = Number(readEnvCompat('MAX_JSON_BYTES') || DEFAULT_MAX_JSON_BYTES),
  logger = console
} = {}) {
  if (!dbAdapter || typeof dbAdapter.query !== 'function' || typeof dbAdapter.connect !== 'function') {
    throw new Error('createStandaloneServer requires a PostgreSQL dbAdapter exposing query() and connect().');
  }

  const realPublicRoot = fs.realpathSync(publicDir);

  configureStandaloneAdapter({
    db: dbAdapter,
    getUser: async req => {
      const s = await resolveSessionFromRequest(dbAdapter, req);
      return s.authenticated && s.user && !s.user.requires_age_assessment ? s.user : null;
    }
  });

  const startupEnvLabel = (() => {
    try {
      return readEnvCompat('ENV', { defaultValue: 'local' }).toLowerCase();
    } catch {
      return 'local';
    }
  })();
  const startupReleasePromise = recordServerReleaseStartup(dbAdapter, {
    releaseSha,
    environment: startupEnvLabel,
    deployMode: 'startup',
    clientBundleVersion: CLIENT_BUNDLE_VERSION,
    logger
  });

  const activeSockets = new Set();
  let shuttingDown = false;

  const server = http.createServer(async (req, res) => {
    applyBaselineSecurityHeaders(res);
    const reqStartedAt = Date.now();

    if (shuttingDown) {
      applyPrivateNoStoreHeaders(res);
      res.setHeader('Connection', 'close');
      return sendJsonResponse(res, 503, { error: 'Server is shutting down.' });
    }

    // Never trust or propagate developer simulator headers on standalone server
    if (req.headers) {
      delete req.headers['x-truckly-debug-role'];
      delete req.headers['X-Truckly-Debug-Role'];
      delete req.headers['x-biteshark-debug-role'];
      delete req.headers['X-BiteShark-Debug-Role'];
    }
    bindVerifiedRequestUser(req, null);
    stampTrustedClientIp(req, { trustProxy });

    const method = String(req.method || 'GET').toUpperCase();
    const rawUrl = String(req.url || '/');
    if (rawUrl.length > 4096) {
      applyPrivateNoStoreHeaders(res);
      return sendJsonResponse(res, 414, { error: 'Request URI too long.' });
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(rawUrl, 'http://biteshark.internal');
    } catch {
      applyPrivateNoStoreHeaders(res);
      return sendJsonResponse(res, 400, { error: 'Malformed request URL.' });
    }

    const pathname = parsedUrl.pathname;
    const reqCorrelationId =
      normalizeCorrelationId(req.headers?.['x-correlation-id']) || generateCorrelationId();
    req.__bsCorrelationId = reqCorrelationId;
    req.__bsServerReleaseSha = releaseSha;

    if (pathname === '/api' || pathname.startsWith('/api/')) {
      res.setHeader('X-BiteShark-Release', String(releaseSha || 'unknown'));
      res.setHeader('X-BiteShark-Client-Bundle', CLIENT_BUNDLE_VERSION);
      if (pathname !== '/api/healthz' && pathname !== '/api/diagnostics/report') {
        res.__bsDiagHook = async (statusCode, payload, extraHeaders = {}) => {
          const corrId = normalizeCorrelationId(payload?.correlation_id) || req.__bsCorrelationId || reqCorrelationId;
          const nextHeaders = { ...extraHeaders, 'X-Correlation-Id': corrId };
          const nextPayload =
            payload && typeof payload === 'object' && !Array.isArray(payload) && !payload.correlation_id
              ? { ...payload, correlation_id: corrId }
              : payload;

          if (!req.__bsDiagnosticRecorded && !isIntentionalMaintenanceResponse(statusCode, payload)) {
            req.__bsDiagnosticRecorded = true;
            await recordDiagnosticEvent(
              dbAdapter,
              {
                component: 'api',
                routeTemplate: req.__bsRouteTemplate || pathname,
                operationName: `${method} ${req.__bsRouteTemplate || pathname}`,
                httpMethod: method,
                httpStatus: statusCode,
                severity: statusCode === 500 ? 'error' : 'warning',
                errorCode: String(payload?.code || `HTTP_${statusCode}`),
                message: String(payload?.error || `Server returned HTTP ${statusCode}.`),
                correlationId: corrId,
                serverReleaseSha: releaseSha,
                clientBuildVersion: String(req.headers?.['x-biteshark-client-build'] || '').slice(0, 48) || null,
                clientLoadedReleaseSha: String(req.headers?.['x-biteshark-loaded-release'] || '').slice(0, 48) || null,
                durationMs: Math.max(0, Date.now() - reqStartedAt),
                retryable: statusCode === 502 || statusCode === 503 || statusCode === 504,
                outcomeState: statusCode === 503 ? 'temporarily_unavailable' : 'failed'
              },
              { fallbackLogger: logger }
            );
          }

          sendJsonResponse(res, statusCode, nextPayload, nextHeaders);
        };
      }
    }

    try {
      // 0. Server-Side Admin Preview Read-Only Enforcement (`X-BiteShark-Viewpoint: preview`)
      const viewpointMode = String(req.headers?.['x-biteshark-viewpoint'] || '')
        .trim()
        .toLowerCase();
      if (viewpointMode === 'preview' && MUTATING_HTTP_METHODS.has(method) && pathname !== '/api/auth/logout') {
        applyPrivateNoStoreHeaders(res);
        return sendJsonResponse(res, 403, {
          error:
            'Admin preview mode is read-only. Return to the Admin Portal or switch to explicit Admin: Top Act-on-Behalf mode for support operations.',
          code: 'ADMIN_PREVIEW_READ_ONLY'
        });
      }

      // 1. Health & Readiness Endpoint (`GET /api/healthz`)
      if (pathname === '/api/healthz') {
        applyPrivateNoStoreHeaders(res);
        if (method !== 'GET') {
          return sendJsonResponse(res, 405, { error: 'Method not allowed.' }, { Allow: 'GET' });
        }
        try {
          assertNoSecurityEnvConflicts();
          const runtimeEnv = readEnvCompat('ENV', { securityCritical: true, defaultValue: 'local' }).toLowerCase();
          await dbAdapter.query('SELECT 1 AS ok');
          return sendJsonResponse(res, 200, {
            status: 'ok',
            db: 'ready',
            env: runtimeEnv,
            release_sha: releaseSha,
            domain_routes: REGISTERED_DOMAIN_ROUTE_COUNT
          });
        } catch (healthErr) {
          const isConflict = healthErr?.code === 'ENV_ALIAS_CONFLICT';
          return sendJsonResponse(res, 503, {
            status: 'degraded',
            db: isConflict ? 'ready_or_unchecked' : 'unavailable',
            ...(isConflict ? { config: 'conflict' } : {}),
            release_sha: releaseSha
          });
        }
      }

      // 2. Standalone Authentication Endpoints (`/api/auth/*`)
      if (pathname === '/api/auth' || pathname.startsWith('/api/auth/')) {
        applyPrivateNoStoreHeaders(res);

        if (pathname === '/api/auth/session') {
          if (method !== 'GET') {
            return sendJsonResponse(res, 405, { error: 'Method not allowed.' }, { Allow: 'GET' });
          }
          const sess = await resolveSessionFromRequest(dbAdapter, req);
          if (sess.refreshedCookieHeader) {
            appendSetCookie(res, sess.refreshedCookieHeader);
          }
          const pubMode = getPublicAuthDeliveryModeSummary();
          return sendJsonResponse(res, 200, {
            authenticated: sess.authenticated,
            user: sess.user,
            requires_age_assessment: Boolean(sess.user?.requires_age_assessment),
            auth_delivery_mode: pubMode.delivery_mode,
            passkeys_supported: false
          });
        }

        if (pathname === '/api/auth/start') {
          if (method !== 'POST') {
            return sendJsonResponse(res, 405, { error: 'Method not allowed.' }, { Allow: 'POST' });
          }
          const csrf = verifySameOriginMutationRequest(req, { requireAuthClientHeader: true });
          if (!csrf.ok) {
            return sendJsonResponse(res, csrf.status, { error: csrf.error, code: csrf.code });
          }
          const body = await readBoundedJsonBody(req, AUTH_MAX_JSON_BYTES);
          const out = await startEmailOtpChallenge(dbAdapter, req, {
            email: body.email,
            intent: body.intent,
            dob: body.dob,
            dob_year: body.dob_year,
            dob_month: body.dob_month,
            dob_day: body.dob_day,
            logger
          });
          if (out.setCookieHeader) {
            appendSetCookie(res, out.setCookieHeader);
          }
          const hdrs = {};
          if (out.correlationId) hdrs['X-Correlation-Id'] = out.correlationId;
          if (out.retryAfterSeconds) hdrs['Retry-After'] = String(out.retryAfterSeconds);
          if (!out.ok) {
            return sendJsonResponse(
              res,
              out.status,
              {
                error: out.error,
                code: out.code || null,
                correlation_id: out.correlationId || null,
                ...(out.retryAfterSeconds ? { retry_after_seconds: out.retryAfterSeconds } : {})
              },
              hdrs
            );
          }
          return sendJsonResponse(res, out.status, out.body, hdrs);
        }

        if (pathname === '/api/auth/age-assessment') {
          if (method !== 'POST') {
            return sendJsonResponse(res, 405, { error: 'Method not allowed.' }, { Allow: 'POST' });
          }
          const csrf = verifySameOriginMutationRequest(req, { requireAuthClientHeader: true });
          if (!csrf.ok) {
            return sendJsonResponse(res, csrf.status, { error: csrf.error, code: csrf.code });
          }
          const body = await readBoundedJsonBody(req, AUTH_MAX_JSON_BYTES);
          const out = await submitExistingAccountAgeAssessment(dbAdapter, req, {
            dob: body.dob,
            dob_year: body.dob_year,
            dob_month: body.dob_month,
            dob_day: body.dob_day
          });
          if (out.refreshedCookieHeader) {
            appendSetCookie(res, out.refreshedCookieHeader);
          }
          if (out.setCookieHeader) {
            appendSetCookie(res, out.setCookieHeader);
          }
          if (Array.isArray(out.setCookieHeaders)) {
            for (const c of out.setCookieHeaders) appendSetCookie(res, c);
          }
          if (!out.ok) {
            return sendJsonResponse(res, out.status, { error: out.error, code: out.code });
          }
          return sendJsonResponse(res, out.status, out.body);
        }

        if (pathname === '/api/auth/verify') {
          if (method !== 'POST') {
            return sendJsonResponse(res, 405, { error: 'Method not allowed.' }, { Allow: 'POST' });
          }
          const csrf = verifySameOriginMutationRequest(req, { requireAuthClientHeader: true });
          if (!csrf.ok) {
            return sendJsonResponse(res, csrf.status, { error: csrf.error, code: csrf.code });
          }
          const body = await readBoundedJsonBody(req, AUTH_MAX_JSON_BYTES);
          const out = await verifyEmailOtpChallenge(dbAdapter, req, {
            email: body.email,
            code: body.code,
            logger
          });
          const hdrs = {};
          if (out.correlationId) hdrs['X-Correlation-Id'] = out.correlationId;
          if (out.retryAfterSeconds) hdrs['Retry-After'] = String(out.retryAfterSeconds);
          if (!out.ok) {
            return sendJsonResponse(
              res,
              out.status,
              {
                error: out.error,
                code: out.code || null,
                correlation_id: out.correlationId || null,
                ...(out.retryAfterSeconds ? { retry_after_seconds: out.retryAfterSeconds } : {})
              },
              hdrs
            );
          }
          if (out.setCookieHeader) {
            appendSetCookie(res, out.setCookieHeader);
          }
          return sendJsonResponse(res, out.status, out.body, hdrs);
        }

        if (pathname === '/api/auth/logout') {
          if (method !== 'POST') {
            return sendJsonResponse(res, 405, { error: 'Method not allowed.' }, { Allow: 'POST' });
          }
          const csrf = verifySameOriginMutationRequest(req, { requireAuthClientHeader: true });
          if (!csrf.ok) {
            return sendJsonResponse(res, csrf.status, { error: csrf.error, code: csrf.code });
          }
          await readBoundedJsonBody(req, AUTH_MAX_JSON_BYTES);
          const out = await revokeSessionFromRequest(dbAdapter, req);
          if (out.setCookieHeader) {
            appendSetCookie(res, out.setCookieHeader);
          }
          return sendJsonResponse(res, out.status, out.body);
        }

        if (pathname === '/api/auth/staging-mailbox') {
          if (method !== 'POST') {
            return sendJsonResponse(res, 404, { error: 'Not found' });
          }
          if (!readSafeSecurityFlag('ALLOW_REMOTE_STAGING_MAILBOX') && !isLoopbackIp(req.socket?.remoteAddress)) {
            return sendJsonResponse(res, 404, { error: 'Not found' });
          }
          const body = await readBoundedJsonBody(req, AUTH_MAX_JSON_BYTES);
          const out = await readProtectedStagingMailboxCode(dbAdapter, req, { email: body.email });
          if (!out.ok) {
            const hdrs = out.retryAfterSeconds ? { 'Retry-After': String(out.retryAfterSeconds) } : {};
            return sendJsonResponse(res, out.status, { error: out.error }, hdrs);
          }
          return sendJsonResponse(res, out.status, out.body);
        }

        return sendJsonResponse(res, 404, { error: 'Not found' });
      }

      // 3. Narrow Staging-Only Runtime Verification Probe (`/api/_staging_gate_probe`)
      if (pathname === '/api/_staging_gate_probe') {
        applyPrivateNoStoreHeaders(res);
        let probeEnabled = false;
        try {
          const env = readEnvCompat('ENV', { securityCritical: true }).toLowerCase();
          probeEnabled = env === 'staging' && readEnvCompat('ENABLE_STAGING_PROBE', { securityCritical: true }) === '1';
        } catch {
          probeEnabled = false;
        }
        if (!probeEnabled) {
          return sendJsonResponse(res, 404, { error: 'Not found' });
        }
        if (method !== 'POST') {
          return sendJsonResponse(res, 405, { error: 'Method not allowed.' }, { Allow: 'POST' });
        }
        const csrf = verifySameOriginMutationRequest(req);
        if (!csrf.ok) {
          return sendJsonResponse(res, csrf.status, { error: csrf.error, code: csrf.code });
        }
        const sess = await resolveSessionFromRequest(dbAdapter, req);
        if (sess.refreshedCookieHeader) appendSetCookie(res, sess.refreshedCookieHeader);
        if (!sess.authenticated || !sess.user) {
          return sendJsonResponse(res, 401, { error: 'Sign in is required.' });
        }
        if (sess.user.requires_age_assessment) {
          return sendJsonResponse(res, 403, buildAgeAssessmentRequiredPayload('/'));
        }
        req.query = parseQueryObject(parsedUrl.searchParams);
        req.params = {};
        req.body = await readBoundedJsonBody(req, AUTH_MAX_JSON_BYTES);
        bindVerifiedRequestUser(req, sess.user);
        const resAdapter = createHandlerResponseAdapter(res);
        await runWithRequestContext({ db: dbAdapter, user: sess.user }, () =>
          runWithGovernanceContext(
            {
              requireEligibleSessionInTx: true,
              verifiedSessionId: sess.sessionId,
              verifiedUserId: sess.user.id
            },
            () => stagingGateProbe.default(req, resAdapter)
          )
        );
        if (!res.writableEnded) res.end();
        return;
      }

      // 3B. Governance, Onboarding, Invitations, Moderation & Admin Portal API Routes
      if (isGovernanceApiPath(pathname)) {
        applyPrivateNoStoreHeaders(res);

        if (MUTATING_HTTP_METHODS.has(method)) {
          const csrf = verifySameOriginMutationRequest(req);
          if (!csrf.ok) {
            return sendJsonResponse(res, csrf.status, { error: csrf.error, code: csrf.code });
          }
        }

        const actOnBehalf = parseActOnBehalfHeaders(req);
        if (!actOnBehalf.ok) {
          return sendJsonResponse(res, actOnBehalf.status, { error: actOnBehalf.error, code: actOnBehalf.code });
        }

        const normGovPath = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
        req.__bsRouteTemplate = normGovPath;
        const isUntrustedDiagReport = normGovPath === '/api/diagnostics/report';
        const bodyLimit =
          normGovPath === '/api/onboarding/evidence' && method === 'POST'
            ? EVIDENCE_UPLOAD_MAX_JSON_BYTES
            : isUntrustedDiagReport
              ? DIAGNOSTICS_REPORT_MAX_JSON_BYTES
              : maxJsonBytes;

        let parsedBody = {};
        if (MUTATING_HTTP_METHODS.has(method)) {
          parsedBody = await readBoundedJsonBody(req, bodyLimit);
        }

        // Browser diagnostic reports are explicitly untrusted: never resolve or refresh session cookies on them.
        const sess = isUntrustedDiagReport
          ? { authenticated: false, user: null, sessionId: null, refreshedCookieHeader: null }
          : await resolveSessionFromRequest(dbAdapter, req);
        if (sess.refreshedCookieHeader) {
          appendSetCookie(res, sess.refreshedCookieHeader);
        }
        const verifiedUser = sess.authenticated ? sess.user : null;

        // Central server-side pending-age-assessment gate across all Governance & Admin API routes
        // except the narrow documented allowlist (`lib/age-policy.js`).
        const isExemptGovRoute =
          !actOnBehalf.present && isGovernanceRouteExemptFromAgeGate(normGovPath, method);
        if (verifiedUser && verifiedUser.requires_age_assessment && !isExemptGovRoute) {
          const nextHint = normGovPath.startsWith('/api/admin/') ? '/admin' : '/';
          return sendJsonResponse(res, 403, buildAgeAssessmentRequiredPayload(nextHint));
        }

        bindVerifiedRequestUser(req, verifiedUser);

        if (actOnBehalf.present) {
          if (!verifiedUser) {
            return sendJsonResponse(res, 401, { error: 'Sign in is required.' });
          }
          const aobCtx = await loadAccessContext(req, auth, dbAdapter);
          if (!aobCtx.isTopAdmin) {
            return sendJsonResponse(res, 403, {
              error: 'Only Admin: Top may use Act-on-Behalf operational mode.',
              code: 'ACT_ON_BEHALF_FORBIDDEN'
            });
          }
        }

        const queryObj = parseQueryObject(parsedUrl.searchParams);
        req.query = queryObj;
        req.params = {};
        req.body = parsedBody;

        // Central server-side feature-control gate on Governance routes (runs after auth & age checks;
        // unauthenticated calls fall through to 401 so feature switches never mask auth requirements).
        if (verifiedUser && matchRouteFeatureRule(normGovPath, method)) {
          const fcGate = await enforceHttpFeatureGate({
            dbAdapter,
            req,
            auth,
            pathname: normGovPath,
            method,
            requireTablePresent: true
          });
          if (!fcGate.allowed) {
            return sendJsonResponse(res, fcGate.status, fcGate.body);
          }
        }

        await runWithRequestContext(
          { db: dbAdapter, user: verifiedUser },
          () =>
            runWithGovernanceContext(
              {
                isStandaloneHttpMutation: MUTATING_HTTP_METHODS.has(method),
                actOnBehalf: actOnBehalf.value,
                requireEligibleSessionInTx: Boolean(verifiedUser && !verifiedUser.requires_age_assessment),
                verifiedSessionId: sess.sessionId || null,
                verifiedUserId: verifiedUser?.id || null
              },
              () =>
                handleGovernanceApiRequest({
                  pathname: normGovPath,
                  method,
                  req,
                  query: queryObj,
                  body: parsedBody,
                  dbAdapter,
                  sendJson: (status, payload, headers) => sendJsonResponse(res, status, payload, headers),
                  rawRes: res
                })
            )
        );
        if (res.__pendingDiagPromise) {
          await res.__pendingDiagPromise;
        }
        if (!res.writableEnded) {
          res.end();
        }
        return;
      }

      // 4. Domain API Routes (`/api/*`)
      if (pathname === '/api' || pathname.startsWith('/api/')) {
        const matched = matchDomainApiRoute(pathname);
        if (!matched) {
          applyPrivateNoStoreHeaders(res);
          return sendJsonResponse(res, 404, { error: 'Not found' });
        }
        if (matched.invalidParam) {
          applyPrivateNoStoreHeaders(res);
          return sendJsonResponse(res, 400, { error: 'Invalid route parameter.' });
        }

        const { route, params } = matched;
        req.__bsRouteTemplate = route.pattern;

        if (!route.methods.includes(method)) {
          applyPrivateNoStoreHeaders(res);
          return sendJsonResponse(
            res,
            405,
            { error: `Method ${method} not allowed.` },
            { Allow: route.methods.join(', ') }
          );
        }

        // Restrict `/api/pager/worker` to loopback supervisor sockets unless explicitly overridden
        if (route.loopbackWorkerOnly && !readSafeSecurityFlag('ALLOW_REMOTE_WORKER')) {
          if (!isLoopbackIp(req.socket?.remoteAddress)) {
            applyPrivateNoStoreHeaders(res);
            return sendJsonResponse(res, 403, { error: 'Worker endpoint is restricted to local supervisor.' });
          }
        }

        // Enforce CSRF / same-origin checks across all non-Bearer state-changing API endpoints
        // BEFORE feature-control checks so paused features never mask 403 CSRF rejections.
        if (MUTATING_HTTP_METHODS.has(method) && !route.exemptFromCookieCsrf) {
          const csrf = verifySameOriginMutationRequest(req);
          if (!csrf.ok) {
            applyPrivateNoStoreHeaders(res);
            return sendJsonResponse(res, csrf.status, { error: csrf.error, code: csrf.code });
          }
          if (route.pattern === '/api/pager/subscriptions') {
            const pagerCsrf = verifyPagerSubscriptionCsrf(req);
            if (!pagerCsrf.ok) {
              applyPrivateNoStoreHeaders(res);
              return sendJsonResponse(res, pagerCsrf.status, { error: pagerCsrf.error });
            }
          }
        }

        const actOnBehalf = parseActOnBehalfHeaders(req);
        if (!actOnBehalf.ok) {
          applyPrivateNoStoreHeaders(res);
          return sendJsonResponse(res, actOnBehalf.status, { error: actOnBehalf.error, code: actOnBehalf.code });
        }

        // Parse JSON body with strict byte cap on mutating requests
        let parsedBody = {};
        if (MUTATING_HTTP_METHODS.has(method)) {
          parsedBody = await readBoundedJsonBody(req, maxJsonBytes);
        }

        // Resolve server-side session cookie ONLY on `access === 'user'` routes (or when Act-on-Behalf is asserted)
        // so public cacheable endpoints (`Cache-Control: public`) never incur session DB queries or emit `Set-Cookie`.
        let verifiedUser = null;
        let verifiedSessionId = null;
        if (route.access === 'user' || actOnBehalf.present) {
          applyPrivateNoStoreHeaders(res);
          const sess = await resolveSessionFromRequest(dbAdapter, req);
          if (sess.refreshedCookieHeader) {
            appendSetCookie(res, sess.refreshedCookieHeader);
          }
          if (!sess.authenticated || !sess.user) {
            return sendJsonResponse(res, 401, {
              error: 'Sign in is required.',
              login_url: '/login.html?next=/'
            });
          }
          // Central server-side pending-age-assessment gate across all authenticated Domain API routes
          if (sess.user.requires_age_assessment) {
            return sendJsonResponse(res, 403, buildAgeAssessmentRequiredPayload('/'));
          }
          verifiedUser = sess.user;
          verifiedSessionId = sess.sessionId || null;
        }

        req.query = parseQueryObject(parsedUrl.searchParams);
        req.params = params;
        req.body = parsedBody;
        bindVerifiedRequestUser(req, verifiedUser);

        if (actOnBehalf.present) {
          const aobCtx = await loadAccessContext(req, auth, dbAdapter);
          if (!aobCtx.isTopAdmin) {
            return sendJsonResponse(res, 403, {
              error: 'Only Admin: Top may use Act-on-Behalf operational mode.',
              code: 'ACT_ON_BEHALF_FORBIDDEN'
            });
          }
        }

        // Central server-side feature-control gate on Domain API routes
        const matchedFeatureRule = matchRouteFeatureRule(route.pattern, method);
        if (matchedFeatureRule) {
          let gateReq = req;
          if (!verifiedUser && req.headers?.cookie) {
            // Read-only session lookup for `staff_beta` evaluation on gated public routes (`community/list`, `trucks/availability`)
            // without emitting `Set-Cookie` or touching cacheable `/api/trucks` catalog routes.
            const pubSess = await resolveSessionFromRequest(dbAdapter, req).catch(() => null);
            if (pubSess?.authenticated && pubSess.user && !pubSess.user.requires_age_assessment) {
              applyPrivateNoStoreHeaders(res);
              gateReq = Object.create(req);
              bindVerifiedRequestUser(gateReq, pubSess.user);
            }
          }
          const fcGate = await enforceHttpFeatureGate({
            dbAdapter,
            req: gateReq,
            auth,
            pathname: route.pattern,
            method,
            requireTablePresent: true
          });
          if (!fcGate.allowed) {
            applyPrivateNoStoreHeaders(res);
            return sendJsonResponse(res, fcGate.status, fcGate.body);
          }
        }

        const govState = {
          isStandaloneHttpMutation: MUTATING_HTTP_METHODS.has(method),
          actOnBehalf: actOnBehalf.value,
          requireEligibleSessionInTx: Boolean(verifiedUser),
          verifiedSessionId,
          verifiedUserId: verifiedUser?.id || null
        };
        const resAdapter = createHandlerResponseAdapter(res, govState);
        await runWithRequestContext(
          { db: dbAdapter, user: verifiedUser },
          () => runWithGovernanceContext(govState, () => route.handler(req, resAdapter))
        );

        if (res.__pendingDiagPromise) {
          await res.__pendingDiagPromise;
        }
        if (!res.writableEnded) {
          res.end();
        }
        return;
      }

      // 4B. Dedicated Administration Portal Entry (`/admin`, `/admin/`, `/admin.html`)
      if (pathname === '/admin' || pathname === '/admin/' || pathname === '/admin.html') {
        applyPrivateNoStoreHeaders(res);
        if (method !== 'GET' && method !== 'HEAD') {
          return sendJsonResponse(res, 405, { error: 'Method not allowed.' }, { Allow: 'GET, HEAD' });
        }

        const sess = await resolveSessionFromRequest(dbAdapter, req);
        if (sess.refreshedCookieHeader) {
          appendSetCookie(res, sess.refreshedCookieHeader);
        }
        if (!sess.authenticated || !sess.user) {
          res.statusCode = 302;
          res.setHeader('Location', '/login.html?next=%2Fadmin');
          res.end();
          return;
        }

        bindVerifiedRequestUser(req, sess.user);
        const adminCtx = await loadAccessContext(req, auth, dbAdapter);
        if (!adminCtx.isModAdmin) {
          const deniedBody = renderAdminAccessDeniedHtml(sess.user.email, adminCtx.roleLabels);
          res.statusCode = 403;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.setHeader('Content-Length', Buffer.byteLength(deniedBody, 'utf8'));
          if (method === 'HEAD') {
            res.end();
            return;
          }
          res.end(deniedBody);
          return;
        }

        // Do not fabricate eligibility for existing administrators: redirect legitimate unassessed
        // admins cleanly to the one-time age assessment step on `/login.html`, which returns to `/admin`
        // after `POST /api/auth/age-assessment` succeeds (zero redirect loop).
        if (sess.user.requires_age_assessment) {
          res.statusCode = 302;
          res.setHeader('Location', '/login.html?assess=1&next=%2Fadmin');
          res.end();
          return;
        }

        const resolvedAdminHtml = resolveSafePublicFile(realPublicRoot, '/admin.html');
        if (!resolvedAdminHtml) {
          return sendJsonResponse(res, 500, { error: 'Admin portal assets are unavailable.' });
        }
        res.statusCode = 200;
        res.setHeader('Content-Type', resolvedAdminHtml.mime);
        res.setHeader('Content-Length', resolvedAdminHtml.size);
        if (method === 'HEAD') {
          res.end();
          return;
        }
        const adminStream = fs.createReadStream(resolvedAdminHtml.filePath);
        adminStream.on('error', () => {
          if (!res.headersSent) {
            sendJsonResponse(res, 500, { error: 'Admin portal read error.' });
          } else {
            res.destroy();
          }
        });
        adminStream.pipe(res);
        return;
      }

      // 5. Restricted Static-File Serving (`public/` ONLY)
      const resolvedStatic = resolveSafePublicFile(realPublicRoot, pathname);
      if (!resolvedStatic) {
        applyPrivateNoStoreHeaders(res);
        return sendJsonResponse(res, 404, { error: 'Not found' });
      }

      if (method !== 'GET' && method !== 'HEAD') {
        return sendJsonResponse(res, 405, { error: 'Method not allowed.' }, { Allow: 'GET, HEAD' });
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', resolvedStatic.mime);
      res.setHeader('Content-Length', resolvedStatic.size);
      if (resolvedStatic.noIndex) {
        res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
      }
      res.setHeader(
        'Cache-Control',
        resolvedStatic.noCache ? 'no-cache, must-revalidate' : 'public, max-age=300'
      );

      if (method === 'HEAD') {
        res.end();
        return;
      }

      const fileStream = fs.createReadStream(resolvedStatic.filePath);
      fileStream.on('error', () => {
        if (!res.headersSent) {
          sendJsonResponse(res, 500, { error: 'Static asset read error.' });
        } else {
          res.destroy();
        }
      });
      fileStream.pipe(res);
    } catch (err) {
      applyPrivateNoStoreHeaders(res);
      if (err instanceof SessionEligibilityError || err?.isSessionEligibilityError) {
        if (err.status === 403) {
          const nextHint = pathname.startsWith('/api/admin/') ? '/admin' : '/';
          return sendJsonResponse(res, 403, buildAgeAssessmentRequiredPayload(nextHint));
        }
        return sendJsonResponse(res, err.status || 401, {
          error: err.message || 'Sign in is required.',
          code: err.code || 'SESSION_REVOKED'
        });
      }
      if (err instanceof BodyParseError) {
        if (err.status === 413) {
          res.setHeader('Connection', 'close');
          req.pause?.();
          res.once('finish', () => {
            try {
              req.socket?.destroy();
            } catch {}
          });
        }
        return sendJsonResponse(res, err.status, { error: err.message, code: err.code });
      }
      if (logger && typeof logger.error === 'function') {
        logger.error(
          JSON.stringify({
            level: 'error',
            event: 'unhandled_request_error',
            method,
            path: pathname,
            code: err?.code || 'INTERNAL_ERROR',
            message: String(err?.message || 'Unexpected error').slice(0, 200)
          })
        );
      }
      sendJsonResponse(res, 500, { error: 'Internal server error.' });
      if (res.__pendingDiagPromise) {
        await res.__pendingDiagPromise;
      }
      return;
    } finally {
      if (res.__pendingDiagPromise) {
        await res.__pendingDiagPromise;
      }
    }
  });

  server.on('connection', socket => {
    activeSockets.add(socket);
    socket.on('close', () => activeSockets.delete(socket));
  });

  // Conservative HTTP server timeouts to protect single-vCPU / 961 MiB VPS against slowloris
  server.headersTimeout = 15000;
  server.requestTimeout = 30000;
  server.keepAliveTimeout = 5000;

  async function closeGracefully(timeoutMs = 8000) {
    if (shuttingDown) return;
    shuttingDown = true;

    await new Promise(resolve => {
      const timer = setTimeout(() => {
        for (const sock of activeSockets) {
          try {
            sock.destroy();
          } catch {}
        }
        resolve();
      }, timeoutMs);
      timer.unref?.();

      server.close(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  return { server, closeGracefully, startupReleasePromise };
}
