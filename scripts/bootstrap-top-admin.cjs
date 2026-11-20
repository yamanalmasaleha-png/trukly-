#!/usr/bin/env node
// BiteShark Narrowly Scoped Initial Top-Admin Bootstrap CLI
//
// Security & Idempotency Properties:
//   - Executes locally via SSH / authorized DB role (`MIGRATION_DATABASE_URL` or `DATABASE_URL`)
//     with ZERO temporary web endpoints, reusable passwords, or unauthenticated bootstrap tokens.
//   - Transactional & idempotent: binds `--email <operator_email>` to `auth_users` and
//     `platform_roles (role = 'top')`, clears any `platform_role_revocations`, and writes
//     append-only attribution rows in `admin_bootstrap_grants` and `audit_logs`.
//   - Never outputs session cookies, OTPs, or secrets.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function parseEnvFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return {};
  const out = {};
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

function readCliEnvCompat(suffix, fileEnv = {}) {
  const bs = String(process.env[`BITESHARK_${suffix}`] || fileEnv[`BITESHARK_${suffix}`] || '').trim();
  const tr = String(process.env[`TRUCKLY_${suffix}`] || fileEnv[`TRUCKLY_${suffix}`] || '').trim();
  if (bs && tr && bs !== tr) {
    throw new Error(`Conflicting values for BITESHARK_${suffix} and TRUCKLY_${suffix}.`);
  }
  return bs || tr || '';
}

function requirePg(fileEnv) {
  try {
    return require('pg');
  } catch {
    const extraBase = readCliEnvCompat('PG_NODE_MODULES', fileEnv);
    if (extraBase) {
      return require(path.join(extraBase, 'pg'));
    }
    throw new Error('Missing `pg` package. Run from an installed BiteShark release directory.');
  }
}

function normalizeEmailStrict(raw) {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim().toLowerCase();
  if (trimmed.length < 5 || trimmed.length > 254) return '';
  if (!/^[^\s@<>,"';:\\]+@[^\s@<>,"';:\\]+\.[^\s@<>,"';:\\]{2,}$/.test(trimmed)) return '';
  return trimmed;
}

function parseArgs(argv) {
  const opts = {
    email: '',
    note: 'Initial operator Admin: Top bootstrap grant',
    envFile: ''
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--email' && argv[i + 1]) {
      opts.email = argv[++i];
    } else if (a.startsWith('--email=')) {
      opts.email = a.slice('--email='.length);
    } else if (a === '--note' && argv[i + 1]) {
      opts.note = argv[++i];
    } else if (a.startsWith('--note=')) {
      opts.note = a.slice('--note='.length);
    } else if (a === '--env-file' && argv[i + 1]) {
      opts.envFile = argv[++i];
    } else if (a.startsWith('--env-file=')) {
      opts.envFile = a.slice('--env-file='.length);
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv);
  const emailNorm = normalizeEmailStrict(opts.email);
  if (!emailNorm) {
    throw new Error(
      'Usage: node scripts/bootstrap-top-admin.cjs --email <valid-operator-email> [--env-file <path>] [--note <reason>]'
    );
  }

  const fileEnv = parseEnvFile(opts.envFile);
  const connStr =
    process.env.MIGRATION_DATABASE_URL ||
    fileEnv.MIGRATION_DATABASE_URL ||
    process.env.DATABASE_URL ||
    fileEnv.DATABASE_URL ||
    '';
  if (!connStr) {
    throw new Error('MIGRATION_DATABASE_URL or DATABASE_URL is required.');
  }

  const cleanNote = String(opts.note || 'Initial operator Admin: Top bootstrap grant')
    .replace(/[\x00-\x1f\x7f]/g, ' ')
    .trim()
    .slice(0, 500);

  const { Client } = requirePg(fileEnv);
  const client = new Client({ connectionString: connStr });
  await client.connect();

  try {
    await client.query('BEGIN');
    await client.query(
      `SELECT
         set_config('app.auth_internal', 'true', true),
         set_config('app.admin_portal', 'true', true),
         set_config('app.user_id', 'cli:bootstrap-top-admin', true)`
    );

    const existingUserRes = await client.query(
      'SELECT id, email_normalized, disabled_at FROM auth_users WHERE email_normalized = $1 FOR UPDATE',
      [emailNorm]
    );

    let userId;
    let createdUser = false;
    if (existingUserRes.rows.length > 0) {
      userId = existingUserRes.rows[0].id;
      if (existingUserRes.rows[0].disabled_at) {
        await client.query('UPDATE auth_users SET disabled_at = NULL, updated_at = now() WHERE id = $1', [userId]);
      }
    } else {
      userId = `usr_sa_${crypto.randomBytes(12).toString('hex')}`;
      await client.query(
        'INSERT INTO auth_users (id, email_normalized) VALUES ($1, $2)',
        [userId, emailNorm]
      );
      createdUser = true;
    }

    const existingRoleRes = await client.query(
      'SELECT role FROM platform_roles WHERE user_id = $1 FOR UPDATE',
      [userId]
    );
    const prevRole = existingRoleRes.rows[0]?.role || null;
    const changedRole = prevRole !== 'top';

    await client.query(
      `INSERT INTO platform_roles (user_id, role, granted_by, notes, updated_at)
       VALUES ($1, 'top', 'cli:bootstrap-top-admin', $2, now())
       ON CONFLICT (user_id) DO UPDATE
         SET role = 'top',
             granted_by = CASE WHEN platform_roles.role = 'top' THEN platform_roles.granted_by ELSE 'cli:bootstrap-top-admin' END,
             notes = CASE WHEN platform_roles.role = 'top' THEN platform_roles.notes ELSE EXCLUDED.notes END,
             updated_at = CASE WHEN platform_roles.role = 'top' THEN platform_roles.updated_at ELSE now() END`,
      [userId, cleanNote]
    );

    await client.query('DELETE FROM platform_role_revocations WHERE user_id = $1', [userId]);

    const grantIns = await client.query(
      `INSERT INTO admin_bootstrap_grants (user_id, email_normalized, bootstrap_source)
       VALUES ($1, $2, 'scripts/bootstrap-top-admin.cjs')
       ON CONFLICT (user_id) DO NOTHING
       RETURNING id`,
      [userId, emailNorm]
    );

    const recordedBootstrapGrant = grantIns.rows.length > 0 || changedRole;
    if (changedRole || createdUser) {
      await client.query(
        `INSERT INTO audit_logs (actor_id, actor_role, target_type, target_id, action, metadata)
         VALUES ('cli:bootstrap-top-admin', 'top', 'auth_user', $1, 'admin.bootstrap_top', $2::jsonb)`,
        [
          userId,
          JSON.stringify({
            previous_role: prevRole,
            new_role: 'top',
            created_user: createdUser,
            bootstrap_source: 'scripts/bootstrap-top-admin.cjs',
            reason: cleanNote
          })
        ]
      );
    }

    await client.query('COMMIT');

    process.stdout.write(
      JSON.stringify({
        ok: true,
        user_id: userId,
        email: emailNorm,
        role: 'top',
        role_label: 'Admin: Top',
        created_user: createdUser,
        changed_role: changedRole,
        recorded_bootstrap_grant: recordedBootstrapGrant
      }) + '\n'
    );
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    throw err;
  } finally {
    await client.end();
  }
}

main().catch(err => {
  process.stderr.write(`bootstrap-top-admin failed: ${err.message}\n`);
  process.exit(1);
});
