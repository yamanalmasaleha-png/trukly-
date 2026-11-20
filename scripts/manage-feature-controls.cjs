#!/usr/bin/env node
// BiteShark Operator Feature-Controls Recovery & Inspection CLI (SSH / Local Only)
//
// Security Guarantees:
//   - Never mounted as an HTTP endpoint and never copied into `public/`.
//   - Verifies `--actor-email` against an active, non-disabled `Admin: Top` account in
//     `auth_users` + `platform_roles` before applying any change.
//   - Restores known-good code registry defaults (`--reset-defaults`) or updates a single
//     reviewed feature (`--set <key>=<state>[:<audience>]`) with full optimistic revision
//     tracking, `feature_control_history` (`change_source = 'operator_recovery_cli'`), and
//     `audit_logs` (`action = 'feature_control.recover'`).
//   - Authoritative environment emergency controls (`PAUSE_WRITES`, `PUSH_PROVIDER_MODE`,
//     `DISABLE_SUBSCRIPTIONS`, `DISABLE_NOTIFICATION_DELIVERY`) remain enforced.

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

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

function requirePg(fileEnv = {}) {
  try {
    return require('pg');
  } catch {
    const extra =
      process.env.BITESHARK_PG_NODE_MODULES ||
      process.env.TRUCKLY_PG_NODE_MODULES ||
      fileEnv.BITESHARK_PG_NODE_MODULES ||
      fileEnv.TRUCKLY_PG_NODE_MODULES ||
      '';
    if (extra) return require(path.join(extra, 'pg'));
    throw new Error('Missing `pg` package. Run from an installed BiteShark release directory.');
  }
}

function maskEmail(email) {
  if (!email || !email.includes('@')) return null;
  const [local, dom] = email.split('@');
  return `${local.slice(0, Math.min(2, local.length))}***@${dom}`;
}

function parseArgs(argv) {
  const opts = {
    mode: '',
    setSpec: '',
    actorEmail: '',
    reason: '',
    envFile: '/etc/truckly-staging/staging.env'
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--status') {
      opts.mode = 'status';
    } else if (a === '--reset-defaults') {
      opts.mode = 'reset';
    } else if (a === '--set' && argv[i + 1]) {
      opts.mode = 'set';
      opts.setSpec = argv[++i];
    } else if (a.startsWith('--set=')) {
      opts.mode = 'set';
      opts.setSpec = a.slice('--set='.length);
    } else if (a === '--actor-email' && argv[i + 1]) {
      opts.actorEmail = argv[++i];
    } else if (a.startsWith('--actor-email=')) {
      opts.actorEmail = a.slice('--actor-email='.length);
    } else if (a === '--reason' && argv[i + 1]) {
      opts.reason = argv[++i];
    } else if (a.startsWith('--reason=')) {
      opts.reason = a.slice('--reason='.length);
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

(async () => {
  const opts = parseArgs(process.argv);
  if (!opts.mode) {
    throw new Error(
      'Usage: node scripts/manage-feature-controls.cjs (--status | --reset-defaults | --set <key>=<state>[:<audience>]) [--actor-email <top-admin-email> --reason "<4..500 chars>"] [--env-file /etc/truckly-staging/staging.env]'
    );
  }

  const fileEnv = parseEnvFile(opts.envFile);
  for (const [k, v] of Object.entries(fileEnv)) {
    if (process.env[k] === undefined) {
      process.env[k] = v;
    }
  }

  const dbUrl =
    process.env.DATABASE_URL ||
    process.env.MIGRATION_DATABASE_URL ||
    fileEnv.DATABASE_URL ||
    fileEnv.MIGRATION_DATABASE_URL ||
    '';
  if (!dbUrl) {
    throw new Error('DATABASE_URL (or --env-file containing DATABASE_URL) is required.');
  }

  const { Pool } = requirePg(fileEnv);
  const pool = new Pool({ connectionString: dbUrl, max: 2 });

  try {
    const fcMod = await import(pathToFileURL(path.resolve(__dirname, '..', 'lib', 'feature-controls.js')).href);

    if (opts.mode === 'status') {
      const persisted = await fcMod.loadPersistedFeatureControls(pool, { requireTablePresent: true });
      const evaluated = fcMod.evaluateFeatureControlsSnapshot({ persistedResult: persisted });
      const summary = [];
      for (const item of evaluated.entries.values()) {
        summary.push({
          key: item.key,
          read_only: item.read_only,
          configured_state: item.configured_state,
          configured_audience: item.configured_audience,
          effective_state: item.system_effective_state,
          env_override_active: item.env_override.active,
          env_override_source: item.env_override.source,
          dependency_blocked_by: item.dependency_block.parent_key,
          revision: item.revision
        });
      }
      process.stdout.write(
        JSON.stringify({ ok: true, config_trusted: evaluated.config_trusted, controls: summary }, null, 2) + '\n'
      );
      return;
    }

    const emailNorm = String(opts.actorEmail || '').trim().toLowerCase();
    const cleanReason = String(opts.reason || '').trim();
    if (!emailNorm || !emailNorm.includes('@')) {
      throw new Error('--actor-email <verified-top-admin-email> is required for recovery mutations.');
    }
    if (cleanReason.length < 4 || cleanReason.length > 500) {
      throw new Error('--reason "<4..500 chars>" is required for recovery mutations.');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.auth_internal', 'true', true)");
      await client.query("SELECT set_config('app.admin_portal', 'true', true)");
      await client.query("SELECT set_config('app.is_platform_admin', 'true', true)");
      await client.query("SELECT set_config('app.can_moderate', 'true', true)");
      await client.query("SELECT set_config('app.feature_controls_read', 'true', true)");

      const { rows: topRows } = await client.query(
        `SELECT u.id, u.email_normalized, u.disabled_at
         FROM auth_users u
         JOIN platform_roles pr ON pr.user_id = u.id
         WHERE u.email_normalized = $1
           AND pr.role IN ('top', 'platform_admin')
         FOR SHARE OF u, pr`,
        [emailNorm]
      );
      if (!topRows.length || topRows[0].disabled_at) {
        throw new Error('Unauthorized: --actor-email must belong to an active, non-disabled Admin: Top account.');
      }
      const actor = topRows[0];
      const actorMasked = maskEmail(actor.email_normalized);

      const applied = [];

      if (opts.mode === 'set') {
        const eq = opts.setSpec.indexOf('=');
        if (eq <= 0) {
          throw new Error('Invalid --set syntax. Expected --set <feature_key>=<state>[:<audience>].');
        }
        const key = opts.setSpec.slice(0, eq).trim();
        const rhs = opts.setSpec.slice(eq + 1).trim();
        const [statePart, audPart] = rhs.split(':');
        const res = await fcMod.updateFeatureControlInTx(client, {
          actorId: actor.id,
          actorEmailMasked: actorMasked,
          actorRole: 'top',
          changeSource: 'operator_recovery_cli',
          featureKey: key,
          nextState: statePart,
          nextAudience: audPart || undefined,
          expectedRevision: null,
          reason: cleanReason,
          confirmedImpact: true
        });
        if (!res.ok) {
          throw new Error(`${res.code}: ${res.error}`);
        }
        applied.push(res);
      } else if (opts.mode === 'reset') {
        // Order parents (`depends_on.length === 0`) before dependents so restoring defaults never violates dependencies
        const switchable = fcMod.FEATURE_CONTROLS_REGISTRY.filter(item => !item.read_only).sort(
          (a, b) => a.depends_on.length - b.depends_on.length
        );
        const { rows: curRows } = await client.query(
          'SELECT feature_key, configured_state, audience FROM feature_controls FOR UPDATE'
        );
        const curMap = new Map(curRows.map(r => [r.feature_key, r]));

        for (const spec of switchable) {
          const cur = curMap.get(spec.key);
          if (!cur || cur.configured_state !== spec.default_state || cur.audience !== spec.default_audience) {
            const res = await fcMod.updateFeatureControlInTx(client, {
              actorId: actor.id,
              actorEmailMasked: actorMasked,
              actorRole: 'top',
              changeSource: 'operator_recovery_cli',
              featureKey: spec.key,
              nextState: spec.default_state,
              nextAudience: spec.default_audience,
              expectedRevision: null,
              reason: cleanReason,
              confirmedImpact: true
            });
            if (!res.ok) {
              throw new Error(`${res.code}: ${res.error}`);
            }
            applied.push(res);
          }
        }
      }

      await client.query('COMMIT');
      process.stdout.write(
        JSON.stringify(
          {
            ok: true,
            mode: opts.mode,
            actor_id: actor.id,
            updated_count: applied.length,
            updated: applied
          },
          null,
          2
        ) + '\n'
      );
    } catch (txErr) {
      await client.query('ROLLBACK').catch(() => {});
      throw txErr;
    } finally {
      client.release();
    }
  } finally {
    await pool.end().catch(() => {});
  }
})().catch(err => {
  process.stderr.write(JSON.stringify({ ok: false, error: err.message || String(err) }) + '\n');
  process.exit(1);
});
