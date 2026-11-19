#!/usr/bin/env node
// Bounded & Supervised BiteShark Pager Notification Worker Runner
//
// Modes:
//   1. Loopback / HTTPS Supervisor Mode (recommended for systemd `truckly-staging-worker.service` or cron):
//      BITESHARK_WORKER_URL="http://127.0.0.1:4100/api/pager/worker" \
//      BITESHARK_NOTIFICATION_WORKER_SECRET="<secret>" \
//      node scripts/run-pager-worker.cjs --continuous --interval-ms 10000
//
//   2. Direct PostgreSQL Batch Mode (for one-shot CI / incident recovery):
//      DATABASE_URL="postgres://..." \
//      BITESHARK_PUSH_PROVIDER_MODE="webpush" \
//      node scripts/run-pager-worker.cjs --direct-db

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

function readCliEnvCompat(suffix, { securityCritical = false, defaultValue = '' } = {}) {
  const bsVal = String(process.env[`BITESHARK_${suffix}`] || '').trim();
  const trVal = String(process.env[`TRUCKLY_${suffix}`] || '').trim();
  if (bsVal && trVal && bsVal !== trVal) {
    if (securityCritical) {
      throw new Error(
        `Conflicting values supplied for BITESHARK_${suffix} and legacy alias TRUCKLY_${suffix}; align or remove the duplicate variable.`
      );
    }
    return bsVal;
  }
  return bsVal || trVal || defaultValue;
}

function parseArgs(argv) {
  const out = {
    directDb: false,
    continuous: false,
    batchSize: 15,
    maxTicks: 1,
    intervalMs: 0,
    cleanupEveryTicks: 30,
    url: readCliEnvCompat('WORKER_URL', { securityCritical: true })
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--direct-db') out.directDb = true;
    else if (a === '--continuous') out.continuous = true;
    else if (a === '--url' && argv[i + 1]) out.url = argv[++i];
    else if (a === '--batch-size' && argv[i + 1]) out.batchSize = Math.max(1, Math.min(25, Number(argv[++i]) || 15));
    else if (a === '--max-ticks' && argv[i + 1]) out.maxTicks = Math.max(1, Math.min(360, Number(argv[++i]) || 1));
    else if (a === '--interval-ms' && argv[i + 1]) out.intervalMs = Math.max(0, Number(argv[++i]) || 0);
    else if (a === '--cleanup-every' && argv[i + 1]) out.cleanupEveryTicks = Math.max(1, Number(argv[++i]) || 30);
  }
  if (out.continuous && out.intervalMs <= 0) {
    out.intervalMs = 10000;
  }
  return out;
}

let stopRequested = false;
let sleepAbort = null;

function requestStop(signal) {
  if (stopRequested) return;
  stopRequested = true;
  console.log(JSON.stringify({ event: 'worker_shutdown_signal', signal }));
  if (typeof sleepAbort === 'function') {
    sleepAbort();
  }
}

process.on('SIGTERM', () => requestStop('SIGTERM'));
process.on('SIGINT', () => requestStop('SIGINT'));

function sleepInterruptible(ms) {
  if (ms <= 0 || stopRequested) return Promise.resolve();
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      sleepAbort = null;
      resolve();
    }, ms);
    sleepAbort = () => {
      clearTimeout(timer);
      sleepAbort = null;
      resolve();
    };
  });
}

(async () => {
  const opts = parseArgs(process.argv);
  const releaseSha = readCliEnvCompat('RELEASE_SHA') || process.env.GITHUB_SHA || 'local';
  const releaseDir = (() => {
    try {
      return fs.realpathSync(path.resolve(__dirname, '..'));
    } catch {
      return path.resolve(__dirname, '..');
    }
  })();

  if (!opts.directDb && opts.url) {
    const secret = readCliEnvCompat('NOTIFICATION_WORKER_SECRET', { securityCritical: true });
    if (secret.length < 24) {
      throw new Error(
        'BITESHARK_NOTIFICATION_WORKER_SECRET (or legacy TRUCKLY_NOTIFICATION_WORKER_SECRET, >= 24 chars) is required for remote worker invocation.'
      );
    }

    console.log(
      JSON.stringify({
        level: 'info',
        event: 'worker_supervisor_started',
        mode: 'http_supervisor',
        release_sha: releaseSha,
        release_dir: releaseDir,
        continuous: opts.continuous
      })
    );

    let tick = 0;
    while (!stopRequested && (opts.continuous || tick < opts.maxTicks)) {
      tick++;
      const shouldCleanup = opts.continuous ? tick % opts.cleanupEveryTicks === 0 : tick === opts.maxTicks;
      const startedAt = Date.now();
      try {
        const res = await fetch(opts.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${secret}`
          },
          body: JSON.stringify({ batch_size: opts.batchSize, cleanup: shouldCleanup })
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg = `Worker HTTP ${res.status}: ${payload.error || 'failed'}`;
          if (!opts.continuous) {
            throw new Error(msg);
          }
          console.error(JSON.stringify({ level: 'error', event: 'worker_tick_http_error', tick, release_sha: releaseSha, status: res.status, error: payload.error || 'failed' }));
        } else if (
          !opts.continuous ||
          (payload.claimed || 0) > 0 ||
          (payload.sent || 0) > 0 ||
          (payload.retried || 0) > 0 ||
          (payload.failed || 0) > 0 ||
          tick === 1 ||
          tick % 30 === 0
        ) {
          console.log(JSON.stringify({ tick, release_sha: releaseSha, duration_ms: Date.now() - startedAt, ...payload }));
        }
      } catch (err) {
        if (!opts.continuous) throw err;
        console.error(
          JSON.stringify({
            level: 'error',
            event: 'worker_tick_network_error',
            tick,
            message: String(err?.message || err).slice(0, 160)
          })
        );
      }

      if (!stopRequested && (opts.continuous || tick < opts.maxTicks) && opts.intervalMs > 0) {
        const elapsed = Date.now() - startedAt;
        await sleepInterruptible(Math.max(250, opts.intervalMs - elapsed));
      }
    }
    return;
  }

  if (!process.env.DATABASE_URL) {
    throw new Error(
      'Provide either BITESHARK_WORKER_URL / TRUCKLY_WORKER_URL (for HTTP/HTTPS mode) or DATABASE_URL with --direct-db.'
    );
  }

  const extraNodeModules = readCliEnvCompat('PG_NODE_MODULES');
  const { Pool } = extraNodeModules ? require(path.join(extraNodeModules, 'pg')) : require('pg');

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Math.max(2, Math.min(6, Number(readCliEnvCompat('WORKER_DB_POOL_MAX') || 4))),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    application_name: `truckly-worker-${readCliEnvCompat('ENV', { securityCritical: true, defaultValue: 'local' })}`
  });
  const dbAdapter = {
    query: (text, params) => pool.query(text, params),
    connect: () => pool.connect()
  };

  try {
    const notifMod = await import(pathToFileURL(path.resolve(__dirname, '..', 'lib', 'pager-notifications.js')).href);
    let authMod = null;
    try {
      authMod = await import(pathToFileURL(path.resolve(__dirname, '..', 'lib', 'standalone-auth.js')).href);
    } catch {}

    let tick = 0;
    while (!stopRequested && (opts.continuous || tick < opts.maxTicks)) {
      tick++;
      const shouldCleanup = opts.continuous ? tick % opts.cleanupEveryTicks === 0 : tick === opts.maxTicks;
      const startedAt = Date.now();
      const summary = await notifMod.runNotificationWorkerBatch(dbAdapter, {
        batchSize: opts.batchSize,
        runCleanup: shouldCleanup
      });
      if (shouldCleanup && authMod && typeof authMod.cleanupExpiredAuthRecords === 'function') {
        await authMod.cleanupExpiredAuthRecords(dbAdapter).catch(() => {});
      }
      if (
        !opts.continuous ||
        (summary.claimed || 0) > 0 ||
        (summary.sent || 0) > 0 ||
        (summary.retried || 0) > 0 ||
        (summary.failed || 0) > 0 ||
        tick === 1 ||
        tick % 30 === 0
      ) {
        console.log(JSON.stringify({ tick, duration_ms: Date.now() - startedAt, ...summary }));
      }
      if (!stopRequested && (opts.continuous || tick < opts.maxTicks) && opts.intervalMs > 0) {
        const elapsed = Date.now() - startedAt;
        await sleepInterruptible(Math.max(250, opts.intervalMs - elapsed));
      }
    }
  } finally {
    await pool.end().catch(() => {});
  }
})().catch(err => {
  console.error('WORKER ERROR:', err.message || err);
  process.exitCode = 1;
});
