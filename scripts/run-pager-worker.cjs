#!/usr/bin/env node
// Bounded Pager Notification Worker Runner
//
// Modes:
//   1. Remote HTTPS Trigger Mode (recommended for external cron / Cloud Scheduler / GitHub Actions):
//      TRUCKLY_WORKER_URL="https://<host>/api/pager/worker" \
//      TRUCKLY_NOTIFICATION_WORKER_SECRET="<secret>" \
//      node scripts/run-pager-worker.cjs
//
//   2. Direct PostgreSQL Batch Mode (for self-hosted / CI / incident recovery):
//      DATABASE_URL="postgres://..." \
//      TRUCKLY_PUSH_PROVIDER_MODE="webpush" \
//      node scripts/run-pager-worker.cjs --direct-db

const path = require('node:path');
const { pathToFileURL } = require('node:url');

function parseArgs(argv) {
  const out = { directDb: false, batchSize: 15, maxTicks: 1, intervalMs: 0, url: process.env.TRUCKLY_WORKER_URL || '' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--direct-db') out.directDb = true;
    else if (a === '--url' && argv[i + 1]) out.url = argv[++i];
    else if (a === '--batch-size' && argv[i + 1]) out.batchSize = Number(argv[++i]) || 15;
    else if (a === '--max-ticks' && argv[i + 1]) out.maxTicks = Math.max(1, Math.min(60, Number(argv[++i]) || 1));
    else if (a === '--interval-ms' && argv[i + 1]) out.intervalMs = Math.max(0, Number(argv[++i]) || 0);
  }
  return out;
}

(async () => {
  const opts = parseArgs(process.argv);

  if (!opts.directDb && opts.url) {
    const secret = String(process.env.TRUCKLY_NOTIFICATION_WORKER_SECRET || '').trim();
    if (secret.length < 24) {
      throw new Error('TRUCKLY_NOTIFICATION_WORKER_SECRET (>= 24 chars) is required for remote worker invocation.');
    }

    for (let tick = 0; tick < opts.maxTicks; tick++) {
      const res = await fetch(opts.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${secret}`
        },
        body: JSON.stringify({ batch_size: opts.batchSize, cleanup: tick === opts.maxTicks - 1 })
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(`Worker HTTP ${res.status}: ${payload.error || 'failed'}`);
      }
      console.log(JSON.stringify({ tick: tick + 1, ...payload }));
      if (opts.intervalMs > 0 && tick + 1 < opts.maxTicks) {
        await new Promise(r => setTimeout(r, opts.intervalMs));
      }
    }
    return;
  }

  if (!process.env.DATABASE_URL) {
    throw new Error('Provide either TRUCKLY_WORKER_URL (for HTTPS mode) or DATABASE_URL with --direct-db.');
  }

  const extraNodeModules = process.env.TRUCKLY_PG_NODE_MODULES;
  const { Pool } = extraNodeModules
    ? require(path.join(extraNodeModules, 'pg'))
    : require('pg');

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
  const dbAdapter = {
    query: (text, params) => pool.query(text, params),
    connect: () => pool.connect()
  };

  try {
    const notifMod = await import(pathToFileURL(path.resolve(__dirname, '..', 'lib', 'pager-notifications.js')).href);
    for (let tick = 0; tick < opts.maxTicks; tick++) {
      const summary = await notifMod.runNotificationWorkerBatch(dbAdapter, {
        batchSize: opts.batchSize,
        runCleanup: tick === opts.maxTicks - 1
      });
      console.log(JSON.stringify({ tick: tick + 1, ...summary }));
      if (opts.intervalMs > 0 && tick + 1 < opts.maxTicks) {
        await new Promise(r => setTimeout(r, opts.intervalMs));
      }
    }
  } finally {
    await pool.end().catch(() => {});
  }
})().catch(err => {
  console.error('WORKER ERROR:', err.message || err);
  process.exitCode = 1;
});
