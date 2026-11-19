import net from 'node:net';
import { EnvAliasConflictError, readEnvCompat } from './env-compat.js';

export const TRUSTED_CLIENT_IP_SYMBOL = Symbol.for('truckly.trustedClientIp');

export function normalizeIpAddress(raw) {
  if (typeof raw !== 'string') return '';
  let candidate = raw.trim();
  if (!candidate) return '';

  // Strip IPv6 bracket wrapper `[::1]:1234` if present
  if (candidate.startsWith('[')) {
    const closeIdx = candidate.indexOf(']');
    if (closeIdx > 1) {
      candidate = candidate.slice(1, closeIdx);
    }
  }

  // Normalize IPv4-mapped IPv6 (`::ffff:127.0.0.1` -> `127.0.0.1`)
  if (candidate.toLowerCase().startsWith('::ffff:')) {
    const v4Part = candidate.slice(7);
    if (net.isIP(v4Part) === 4) {
      return v4Part;
    }
  }

  return net.isIP(candidate) > 0 ? candidate.toLowerCase() : '';
}

export function isLoopbackIp(raw) {
  const ip = normalizeIpAddress(raw);
  return ip === '127.0.0.1' || ip === '::1';
}

function extractRightmostForwardedIp(xffHeader) {
  if (typeof xffHeader !== 'string' || !xffHeader.trim()) return '';
  const hops = xffHeader.split(',');
  for (let i = hops.length - 1; i >= 0; i--) {
    const clean = normalizeIpAddress(hops[i]);
    if (clean) return clean;
  }
  return '';
}

/**
 * Resolves the verified client IP address for rate-limiting and abuse controls.
 *
 * Security invariants:
 *   - By default (`TRUCKLY_TRUST_PROXY=none`), `X-Forwarded-For` and `X-Real-IP` are
 *     ignored on live TCP socket requests so direct callers cannot spoof their IP.
 *   - When `TRUCKLY_TRUST_PROXY=loopback` (behind a local Nginx reverse proxy that
 *     overwrites `X-Real-IP: $remote_addr` and `X-Forwarded-For: $remote_addr`),
 *     proxy headers are trusted ONLY when the raw TCP peer `req.socket.remoteAddress`
 *     is loopback (`127.0.0.1` / `::1`), and `X-Forwarded-For` is read from the
 *     rightmost proxy-appended hop rather than the attacker-controlled leftmost hop.
 */
export function resolveTrustedClientIp(req, options = {}) {
  if (req && typeof req === 'object' && typeof req[TRUSTED_CLIENT_IP_SYMBOL] === 'string' && req[TRUSTED_CLIENT_IP_SYMBOL]) {
    return req[TRUSTED_CLIENT_IP_SYMBOL];
  }

  const headers = req?.headers || {};
  const hasLiveSocket = Boolean(req && typeof req === 'object' && req.socket && typeof req.socket === 'object');

  if (hasLiveSocket) {
    const peerIp = normalizeIpAddress(req.socket.remoteAddress);
    let envTrustProxy = 'none';
    if (options.trustProxy === undefined) {
      try {
        envTrustProxy = readEnvCompat('TRUST_PROXY', { securityCritical: true, defaultValue: 'none' });
      } catch (err) {
        if (err instanceof EnvAliasConflictError) {
          envTrustProxy = 'none'; // Fail closed: ignore proxy headers on alias conflict
        } else {
          throw err;
        }
      }
    }
    const trustMode = String(options.trustProxy ?? envTrustProxy)
      .trim()
      .toLowerCase();

    if (trustMode === 'loopback' && isLoopbackIp(peerIp)) {
      const realIp = normalizeIpAddress(String(headers['x-real-ip'] || headers['X-Real-IP'] || ''));
      if (realIp) return realIp;
      const rightmostXff = extractRightmostForwardedIp(
        String(headers['x-forwarded-for'] || headers['X-Forwarded-For'] || '')
      );
      if (rightmostXff) return rightmostXff;
    }

    return peerIp || 'anon';
  }

  // Serverless function gateway fallback (no raw TCP socket exposed by platform wrapper)
  const serverlessRealIp = normalizeIpAddress(String(headers['x-real-ip'] || headers['X-Real-IP'] || ''));
  if (serverlessRealIp) return serverlessRealIp;
  const serverlessXff = extractRightmostForwardedIp(
    String(headers['x-forwarded-for'] || headers['X-Forwarded-For'] || '')
  );
  return serverlessXff || 'anon';
}

export function stampTrustedClientIp(req, options = {}) {
  const resolved = resolveTrustedClientIp(req, options);
  if (req && typeof req === 'object') {
    Object.defineProperty(req, TRUSTED_CLIENT_IP_SYMBOL, {
      value: resolved,
      writable: false,
      configurable: true,
      enumerable: false
    });
  }
  return resolved;
}
