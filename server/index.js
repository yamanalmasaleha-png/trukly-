#!/usr/bin/env node
// BiteShark Production-Suitable Standalone HTTP & PostgreSQL Server Entrypoint
//
// Security invariants:
//   - Binds to loopback (`127.0.0.1:4100`) by default so external traffic enters only via TLS Nginx.
//   - Fails closed on startup in `staging` / `production` if `DATABASE_URL`, `BITESHARK_AUTH_SECRET`
//     (or `TRUCKLY_AUTH_SECRET`), a valid `BITESHARK_AUTH_DELIVERY_MODE`, or conflicting security-critical
//     `BITESHARK_*` / `TRUCKLY_*` aliases are supplied.
//   - Configures `pg.types` OID 1082 (`DATE`) to preserve exact `YYYY-MM-DD` calendar strings
//     without timezone shifting.
//   - Drains in-flight HTTP requests and closes the PostgreSQL connection pool cleanly on SIGTERM/SIGINT.

import pg from 'pg';
import { createStandaloneServer } from './app.js';
import { getAuthSecret, inspectAuthDeliveryConfig } from '../lib/standalone-auth.js';
import { readEnvCompat, assertNoSecurityEnvConflicts } from '../lib/env-compat.js';

const { Pool, types } = pg;

// Preserve exact PostgreSQL `DATE` (`YYYY-MM-DD`) calendar strings without timezone shifts
types.setTypeParser(1082, val => String(val));

function validateStartupEnvironment() {
  assertNoSecurityEnvConflicts();

  const env = readEnvCompat('ENV', { securityCritical: true, defaultValue: 'local' }).toLowerCase();
  const dbUrl = String(process.env.DATABASE_URL || '').trim();
  if (!dbUrl) {
    throw new Error('DATABASE_URL is required to start BiteShark standalone server.');
  }

  if (String(process.env.HATCHABLE_PROJECT_ID || '').trim() === 'proj_MEO518rmLLl0') {
    throw new Error('Refusing to start standalone server with Hatchable production project identifier.');
  }

  // Validates `BITESHARK_AUTH_SECRET` / `TRUCKLY_AUTH_SECRET` (>= 32 chars mandatory in staging/production)
  getAuthSecret();

  const authDelivery = inspectAuthDeliveryConfig();
  if (!authDelivery.valid) {
    throw new Error(`Invalid authentication delivery configuration: ${authDelivery.reason}`);
  }

  const host = String(process.env.HOST || '127.0.0.1').trim();
  const port = Number(process.env.PORT || 4100);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT: ${process.env.PORT}`);
  }

  const poolMax = Math.max(2, Math.min(20, Number(readEnvCompat('DB_POOL_MAX') || 8)));
  const releaseSha = String(readEnvCompat('RELEASE_SHA') || process.env.GITHUB_SHA || 'local').trim();

  return { env, dbUrl, host, port, poolMax, releaseSha };
}

async function main() {
  const cfg = validateStartupEnvironment();

  const pool = new Pool({
    connectionString: cfg.dbUrl,
    max: cfg.poolMax,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    statement_timeout: 15000,
    application_name: `truckly-api-${cfg.env}`
  });

  pool.on('error', err => {
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'pg_pool_idle_error',
        code: err?.code || 'PG_IDLE_ERROR',
        message: String(err?.message || '').slice(0, 160)
      })
    );
  });

  // Verify database connectivity & non-superuser posture at startup in staging/production
  const startupCheck = await pool.query(
    `SELECT
       current_user AS db_user,
       u.usesuper AS is_superuser,
       u.usebypassrls AS has_bypassrls
     FROM pg_user u
     WHERE u.usename = current_user`
  );
  const roleInfo = startupCheck.rows[0] || {};
  if (
    (cfg.env === 'staging' || cfg.env === 'production') &&
    (roleInfo.is_superuser === true || roleInfo.has_bypassrls === true)
  ) {
    await pool.end().catch(() => {});
    throw new Error(
      `Refusing to start in ${cfg.env}: database role "${roleInfo.db_user}" must be NOSUPERUSER and NOBYPASSRLS so FORCE ROW LEVEL SECURITY holds.`
    );
  }

  const dbAdapter = {
    query: (text, params) => pool.query(text, params),
    connect: () => pool.connect(),
    pool
  };

  const { server, closeGracefully } = createStandaloneServer({
    dbAdapter,
    releaseSha: cfg.releaseSha
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(cfg.port, cfg.host, resolve);
  });

  const addr = server.address();
  const boundPort = typeof addr === 'object' && addr ? addr.port : cfg.port;
  console.log(
    JSON.stringify({
      level: 'info',
      event: 'truckly_server_listening',
      host: cfg.host,
      port: boundPort,
      env: cfg.env,
      release_sha: cfg.releaseSha,
      node: process.version,
      pool_max: cfg.poolMax
    })
  );

  let exiting = false;
  async function handleSignal(signal) {
    if (exiting) return;
    exiting = true;
    console.log(JSON.stringify({ level: 'info', event: 'truckly_server_shutdown_start', signal }));
    try {
      await closeGracefully(8000);
      await pool.end();
      console.log(JSON.stringify({ level: 'info', event: 'truckly_server_shutdown_complete', signal }));
      process.exit(0);
    } catch (err) {
      console.error(
        JSON.stringify({
          level: 'error',
          event: 'truckly_server_shutdown_error',
          message: String(err?.message || err).slice(0, 160)
        })
      );
      process.exit(1);
    }
  }

  process.on('SIGTERM', () => handleSignal('SIGTERM'));
  process.on('SIGINT', () => handleSignal('SIGINT'));
  if (typeof process.send === 'function') {
    process.on('message', msg => {
      if (msg === 'biteshark:graceful-shutdown' || msg === 'truckly:graceful-shutdown') {
        handleSignal('IPC_SHUTDOWN');
      }
    });
  }
}

main().catch(err => {
  console.error(
    JSON.stringify({
      level: 'fatal',
      event: 'truckly_server_startup_failed',
      code: err?.code || 'STARTUP_ERROR',
      message: String(err?.message || err)
    })
  );
  process.exit(1);
});
