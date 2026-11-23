import { AsyncLocalStorage } from 'node:async_hooks';

const requestAls = new AsyncLocalStorage();
const verifiedRequestUsers = new WeakMap();

let configuredDb = null;
let configuredAuthResolver = null;

/**
 * Configures the process-wide PostgreSQL adapter and optional fallback auth resolver
 * for Truckly's standalone Node runtime (`server/index.js` and `scripts/run-pager-worker.cjs`).
 */
export function configureStandaloneAdapter({ db: nextDb = null, getUser = null } = {}) {
  configuredDb = nextDb || null;
  configuredAuthResolver = typeof getUser === 'function' ? getUser : null;
}

/**
 * Binds the server-verified identity (`{ id, email }` or `null`) to a specific
 * `http.IncomingMessage` instance using an unforgeable `WeakMap` + read-only property.
 * Never trusts client headers, query params, request bodies, or debug cookies.
 */
export function bindVerifiedRequestUser(req, user) {
  if (!req || typeof req !== 'object') return null;
  const normalized =
    user && typeof user.id === 'string' && user.id.trim()
      ? Object.freeze({
          id: user.id.trim(),
          email: typeof user.email === 'string' && user.email.trim() ? user.email.trim() : null
        })
      : null;

  verifiedRequestUsers.set(req, normalized);
  try {
    Object.defineProperty(req, 'user', {
      value: normalized,
      writable: false,
      configurable: true,
      enumerable: true
    });
  } catch {
    req.user = normalized;
  }
  return normalized;
}

export function runWithRequestContext(context, fn) {
  return requestAls.run(context, fn);
}

export function getActiveRequestContext() {
  return requestAls.getStore() || null;
}

function resolveActiveDb() {
  const store = requestAls.getStore();
  const active = (store && store.db) || configuredDb;
  if (!active) {
    const err = new Error('Database adapter is not configured in standalone runtime.');
    err.code = 'STANDALONE_DB_UNCONFIGURED';
    throw err;
  }
  return active;
}

export const db = {
  query(text, params) {
    return resolveActiveDb().query(text, params);
  },

  connect() {
    const active = resolveActiveDb();
    if (typeof active.connect === 'function') {
      return active.connect();
    }
    if (active.pool && typeof active.pool.connect === 'function') {
      return active.pool.connect();
    }
    throw new Error('Configured database adapter does not support pinned client connect().');
  },

  async transaction(fn) {
    const active = resolveActiveDb();
    if (typeof active.transaction === 'function') {
      return active.transaction(fn);
    }
    const client = await this.connect();
    let releaseErr = false;
    try {
      delete client.__bsSessionEligibilityVerified;
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch (rbErr) {
        releaseErr = rbErr || true;
      }
      throw err;
    } finally {
      try {
        if (typeof client.__bsTxCleanup === 'function') {
          client.__bsTxCleanup();
        }
      } catch {}
      delete client.__bsSessionEligibilityVerified;
      delete client.__bsTxCleanup;
      if (typeof client.release === 'function') {
        client.release(releaseErr);
      }
    }
  },

  get pool() {
    const store = requestAls.getStore();
    const active = (store && store.db) || configuredDb;
    if (!active) return null;
    return active.pool || (typeof active.connect === 'function' ? active : null);
  }
};

export const auth = {
  async getUser(req) {
    if (req && typeof req === 'object' && verifiedRequestUsers.has(req)) {
      return verifiedRequestUsers.get(req);
    }
    const store = requestAls.getStore();
    if (store && Object.prototype.hasOwnProperty.call(store, 'user')) {
      return store.user || null;
    }
    if (configuredAuthResolver && req) {
      return configuredAuthResolver(req);
    }
    return null;
  }
};
