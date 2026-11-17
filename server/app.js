import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  configureStandaloneAdapter,
  bindVerifiedRequestUser,
  runWithRequestContext
} from 'hatchable';
import { applyPrivateNoStoreHeaders } from '../lib/authz.js';
import { isLoopbackIp, stampTrustedClientIp } from '../lib/client-ip.js';
import {
  startEmailOtpChallenge,
  verifyEmailOtpChallenge,
  resolveSessionFromRequest,
  revokeSessionFromRequest,
  readProtectedStagingMailboxCode,
  verifySameOriginMutationRequest
} from '../lib/standalone-auth.js';
import { matchDomainApiRoute, REGISTERED_DOMAIN_ROUTE_COUNT } from './routes.js';
import * as stagingGateProbe from '../scripts/staging-runtime-probe.template.js';

const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PUBLIC_DIR = path.resolve(SERVER_DIR, '..', 'public');

export const DEFAULT_MAX_JSON_BYTES = 64 * 1024; // 64 KiB
export const AUTH_MAX_JSON_BYTES = 8 * 1024; // 8 KiB

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
  '/sw.js',
  '/manifest.json',
  '/auth-client.js',
  '/build.json'
]);

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

function sendJsonResponse(res, statusCode, payload, extraHeaders = {}) {
  if (res.writableEnded) return;
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

function createHandlerResponseAdapter(rawRes) {
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
      sendJsonResponse(rawRes, this.statusCode, payload);
      return this;
    },
    send(payload) {
      if (rawRes.writableEnded) return this;
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

  const relUrl = decoded === '/' ? '/index.html' : decoded;
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
  return {
    filePath: realCandidate,
    mime,
    size: stat.size,
    noCache: NO_CACHE_STATIC_FILES.has(canonicalUrlPath)
  };
}

export function createStandaloneServer({
  dbAdapter,
  publicDir = DEFAULT_PUBLIC_DIR,
  releaseSha = process.env.TRUCKLY_RELEASE_SHA || process.env.GITHUB_SHA || 'unknown',
  trustProxy = process.env.TRUCKLY_TRUST_PROXY || 'none',
  maxJsonBytes = Number(process.env.TRUCKLY_MAX_JSON_BYTES || DEFAULT_MAX_JSON_BYTES),
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
      return s.authenticated ? s.user : null;
    }
  });

  const activeSockets = new Set();
  let shuttingDown = false;

  const server = http.createServer(async (req, res) => {
    applyBaselineSecurityHeaders(res);

    if (shuttingDown) {
      applyPrivateNoStoreHeaders(res);
      res.setHeader('Connection', 'close');
      return sendJsonResponse(res, 503, { error: 'Server is shutting down.' });
    }

    // Never trust or propagate developer simulator headers on standalone server
    if (req.headers) {
      delete req.headers['x-truckly-debug-role'];
      delete req.headers['X-Truckly-Debug-Role'];
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
      parsedUrl = new URL(rawUrl, 'http://truckly.internal');
    } catch {
      applyPrivateNoStoreHeaders(res);
      return sendJsonResponse(res, 400, { error: 'Malformed request URL.' });
    }

    const pathname = parsedUrl.pathname;

    try {
      // 1. Health & Readiness Endpoint (`GET /api/healthz`)
      if (pathname === '/api/healthz') {
        applyPrivateNoStoreHeaders(res);
        if (method !== 'GET') {
          return sendJsonResponse(res, 405, { error: 'Method not allowed.' }, { Allow: 'GET' });
        }
        try {
          await dbAdapter.query('SELECT 1 AS ok');
          return sendJsonResponse(res, 200, {
            status: 'ok',
            db: 'ready',
            env: String(process.env.TRUCKLY_ENV || 'local').trim().toLowerCase(),
            release_sha: releaseSha,
            domain_routes: REGISTERED_DOMAIN_ROUTE_COUNT
          });
        } catch {
          return sendJsonResponse(res, 503, {
            status: 'degraded',
            db: 'unavailable',
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
          return sendJsonResponse(res, 200, {
            authenticated: sess.authenticated,
            user: sess.user,
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
          const out = await startEmailOtpChallenge(dbAdapter, req, { email: body.email });
          if (!out.ok) {
            const hdrs = out.retryAfterSeconds ? { 'Retry-After': String(out.retryAfterSeconds) } : {};
            return sendJsonResponse(res, out.status, { error: out.error, code: out.code }, hdrs);
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
            code: body.code
          });
          if (!out.ok) {
            const hdrs = out.retryAfterSeconds ? { 'Retry-After': String(out.retryAfterSeconds) } : {};
            return sendJsonResponse(res, out.status, { error: out.error, code: out.code }, hdrs);
          }
          if (out.setCookieHeader) {
            appendSetCookie(res, out.setCookieHeader);
          }
          return sendJsonResponse(res, out.status, out.body);
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
          const body = await readBoundedJsonBody(req, AUTH_MAX_JSON_BYTES);
          const out = await readProtectedStagingMailboxCode(dbAdapter, req, { email: body.email });
          if (!out.ok) {
            return sendJsonResponse(res, out.status, { error: out.error });
          }
          return sendJsonResponse(res, out.status, out.body);
        }

        return sendJsonResponse(res, 404, { error: 'Not found' });
      }

      // 3. Narrow Staging-Only Runtime Verification Probe (`/api/_staging_gate_probe`)
      if (pathname === '/api/_staging_gate_probe') {
        applyPrivateNoStoreHeaders(res);
        const env = String(process.env.TRUCKLY_ENV || '').trim().toLowerCase();
        const probeEnabled = env === 'staging' && process.env.TRUCKLY_ENABLE_STAGING_PROBE === '1';
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
        req.query = parseQueryObject(parsedUrl.searchParams);
        req.params = {};
        req.body = await readBoundedJsonBody(req, AUTH_MAX_JSON_BYTES);
        bindVerifiedRequestUser(req, sess.user);
        const resAdapter = createHandlerResponseAdapter(res);
        await runWithRequestContext({ db: dbAdapter, user: sess.user }, () =>
          stagingGateProbe.default(req, resAdapter)
        );
        if (!res.writableEnded) res.end();
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
        if (route.loopbackWorkerOnly && process.env.TRUCKLY_ALLOW_REMOTE_WORKER !== '1') {
          if (!isLoopbackIp(req.socket?.remoteAddress)) {
            applyPrivateNoStoreHeaders(res);
            return sendJsonResponse(res, 403, { error: 'Worker endpoint is restricted to local supervisor.' });
          }
        }

        // Enforce CSRF / same-origin checks across all non-Bearer state-changing API endpoints
        if (MUTATING_HTTP_METHODS.has(method) && !route.exemptFromCookieCsrf) {
          const csrf = verifySameOriginMutationRequest(req);
          if (!csrf.ok) {
            applyPrivateNoStoreHeaders(res);
            return sendJsonResponse(res, csrf.status, { error: csrf.error, code: csrf.code });
          }
        }

        // Parse JSON body with strict byte cap on mutating requests
        let parsedBody = {};
        if (MUTATING_HTTP_METHODS.has(method)) {
          parsedBody = await readBoundedJsonBody(req, maxJsonBytes);
        }

        // Resolve server-side session cookie (never trusting client identity fields)
        const sess = await resolveSessionFromRequest(dbAdapter, req);
        if (sess.refreshedCookieHeader) {
          appendSetCookie(res, sess.refreshedCookieHeader);
        }

        if (route.access === 'user') {
          applyPrivateNoStoreHeaders(res);
          if (!sess.authenticated || !sess.user) {
            return sendJsonResponse(res, 401, {
              error: 'Sign in is required.',
              login_url: '/login.html?next=/'
            });
          }
        }

        req.query = parseQueryObject(parsedUrl.searchParams);
        req.params = params;
        req.body = parsedBody;
        bindVerifiedRequestUser(req, sess.authenticated ? sess.user : null);

        const resAdapter = createHandlerResponseAdapter(res);
        await runWithRequestContext(
          { db: dbAdapter, user: sess.authenticated ? sess.user : null },
          () => route.handler(req, resAdapter)
        );
        if (!res.writableEnded) {
          res.end();
        }
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
      if (err instanceof BodyParseError) {
        if (err.status === 413) {
          res.setHeader('Connection', 'close');
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
      return sendJsonResponse(res, 500, { error: 'Internal server error.' });
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

  return { server, closeGracefully };
}
