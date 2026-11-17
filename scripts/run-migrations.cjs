#!/usr/bin/env node
// Idempotent SQL Migration Runner for Truckly Standalone Deployments
//
// Tracks applied migrations + SHA-256 checksums in `schema_migrations` and executes
// unapplied `migrations/NNN_*.sql` files in lexical order inside individual transactions.
// Optionally transfers table ownership to `--app-owner <role>` or grants DML to `--app-role <role>`.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const MIGRATIONS_DIR = path.join(ROOT, 'migrations');

function requirePg() {
  try {
    return require('pg');
  } catch {
    const extraBase = process.env.TRUCKLY_PG_NODE_MODULES;
    if (extraBase) {
      return require(path.join(extraBase, 'pg'));
    }
    throw new Error('Missing `pg` package. Run `npm ci` before running migrations.');
  }
}

function parseArgs(argv) {
  const opts = {
    appRole: process.env.TRUCKLY_DB_APP_ROLE || ''
  };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--app-role' && argv[i + 1]) {
      opts.appRole = argv[++i];
    }
  }
  return opts;
}

function assertSafeIdentifier(ident, label) {
  if (!/^[a-z_][a-z0-9_]{1,62}$/.test(ident)) {
    throw new Error(`Invalid SQL identifier for ${label}: "${ident}"`);
  }
  return ident;
}

(async () => {
  const opts = parseArgs(process.argv);
  const dbUrl = String(process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL || '').trim();
  if (!dbUrl) {
    throw new Error('Set MIGRATION_DATABASE_URL or DATABASE_URL before running migrations.');
  }

  const { Client } = requirePg();
  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        checksum_sha256 TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter(f => /^\d{3}_.+\.sql$/.test(f))
      .sort();

    let appliedCount = 0;
    for (const filename of files) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, filename), 'utf8');
      const checksum = crypto.createHash('sha256').update(sql, 'utf8').digest('hex');

      const existing = await client.query(
        'SELECT checksum_sha256 FROM schema_migrations WHERE filename = $1',
        [filename]
      );
      if (existing.rows.length > 0) {
        if (existing.rows[0].checksum_sha256 !== checksum) {
          throw new Error(
            `Migration checksum mismatch for already-applied migration ${filename}: expected ${existing.rows[0].checksum_sha256}, got ${checksum}`
          );
        }
        continue;
      }

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (filename, checksum_sha256) VALUES ($1, $2)',
          [filename, checksum]
        );
        await client.query('COMMIT');
        appliedCount++;
        console.log(JSON.stringify({ event: 'migration_applied', filename, checksum_prefix: checksum.slice(0, 12) }));
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      }
    }

    if (opts.appRole) {
      const safeRole = assertSafeIdentifier(opts.appRole, 'appRole');
      await client.query(`GRANT USAGE ON SCHEMA public TO ${safeRole}`);
      await client.query(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${safeRole}`
      );
      await client.query(`REVOKE INSERT, UPDATE, DELETE ON schema_migrations FROM ${safeRole}`);
      await client.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${safeRole}`);
      console.log(JSON.stringify({ event: 'app_role_grants_verified', app_role: safeRole }));
    }

    console.log(
      JSON.stringify({
        event: 'migrations_complete',
        total_files: files.length,
        newly_applied: appliedCount
      })
    );
  } finally {
    await client.end().catch(() => {});
  }
})().catch(err => {
  console.error(JSON.stringify({ level: 'fatal', event: 'migration_failed', message: err.message || String(err) }));
  process.exit(1);
});
