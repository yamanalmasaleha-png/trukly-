// EPHEMERAL STAGING-ONLY RUNTIME PROBE TEMPLATE (DO NOT PLACE IN `api/` IN GIT)
//
// Purpose:
//   Proves Gates 2, 3, and 5 from inside the live Hatchable serverless function runtime
//   on an ISOLATED STAGING project:
//     - Gate 2: Inspects `db` adapter methods, verifies `withTransaction` pins multiple
//       statements to a single `pg_backend_pid()`, and proves a multi-statement
//       transaction rolls back completely when a later statement throws.
//     - Gate 3: Verifies transaction-local `app.user_id` and `app.can_moderate` GUCs
//       do not leak after either `COMMIT` or `ROLLBACK`.
//     - Gate 5: Reports `usesuper`, `usebypassrls`, `relrowsecurity`, `relforcerowsecurity`,
//       and confirms bare `SELECT` on `community_reviews` sees zero unpublished rows.
//
// Staging lifecycle:
//   1. On the isolated staging project ONLY, upload this file as `api/_staging_gate_probe.js`
//      and set secret `TRUCKLY_STAGING_PROBE_TOKEN` (minimum 24 random characters).
//   2. Run `node tests/staging-hatchable-gates.cjs` with `STAGING_PROBE_TOKEN` and
//      `STAGING_COOKIE_PLATFORM_ADMIN`.
//   3. Delete `api/_staging_gate_probe.js` from the staging project and re-deploy staging
//      so the final staging build matches the exact 30-route repository tree.

import crypto from "node:crypto";
import { db, auth } from "hatchable";
import { loadAccessContext } from "../lib/authz.js";
import { withTransaction } from "../lib/db-tx.js";

export const access = "user";
export const methods = ["POST"];

function timingSafeMatch(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length < 24 || a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

export default async function(req, res) {
  res.setHeader("Cache-Control", "no-store");

  const expectedToken = process.env.TRUCKLY_STAGING_PROBE_TOKEN || "";
  const suppliedToken = String(req.headers?.["x-staging-probe-token"] || "");
  if (!timingSafeMatch(expectedToken, suppliedToken)) {
    return res.status(404).json({ error: "Not found" });
  }

  // Fail-closed server-side environment verification: refuse to run on production or unconfirmed environments!
  const runtimeProjectId = String(process.env.HATCHABLE_PROJECT_ID || process.env.PROJECT_ID || "").trim();
  const runtimeEnv = String(process.env.TRUCKLY_ENV || "").trim().toLowerCase();
  if (runtimeProjectId === "proj_MEO518rmLLl0" || runtimeEnv !== "staging") {
    return res.status(403).json({
      error: "Refusing to execute staging runtime probe: server environment is not confirmed isolated staging (TRUCKLY_ENV=staging required; proj_MEO518rmLLl0 forbidden).",
      code: "PRODUCTION_OR_UNCONFIRMED_ENVIRONMENT"
    });
  }

  const ctx = await loadAccessContext(req, auth, db);
  if (!ctx.authenticated || !ctx.isPlatformAdmin) {
    return res.status(403).json({ error: "Platform administrator required." });
  }

  const markerId = "stg-rb-" + crypto.randomUUID();

  // Gate 2a: Single-connection pinning inside withTransaction
  const txPin = await withTransaction(db, async tx => {
    const r1 = await tx.query("SELECT pg_backend_pid() AS pid, txid_current()::text AS xid");
    await tx.query("SELECT set_config('app.user_id', $1, true)", [ctx.user.id]);
    const r2 = await tx.query(
      "SELECT pg_backend_pid() AS pid, txid_current()::text AS xid, current_setting('app.user_id', true) AS uid"
    );
    return {
      same_pid: r1.rows[0].pid === r2.rows[0].pid,
      same_xid: r1.rows[0].xid === r2.rows[0].xid,
      in_tx_uid_matches: r2.rows[0].uid === ctx.user.id
    };
  });

  // Gate 2b & Gate 3b: Multi-statement rollback + GUC reset on ROLLBACK
  let rollbackCaught = false;
  try {
    await withTransaction(db, async tx => {
      await tx.query(
        "SELECT set_config('app.can_moderate', 'true', true), set_config('app.user_id', $1, true)",
        [ctx.user.id]
      );
      await tx.query(
        `INSERT INTO audit_logs (actor_id, actor_role, target_type, target_id, action, metadata)
         VALUES ($1, 'platform_admin', 'staging_probe', $2, 'staging.rollback_probe', '{}'::jsonb)`,
        [ctx.user.id, markerId]
      );
      throw new Error("Intentional staging rollback verification error");
    });
  } catch {
    rollbackCaught = true;
  }

  const { rows: rbRows } = await db.query(
    "SELECT count(*)::int AS c FROM audit_logs WHERE target_id = $1",
    [markerId]
  );

  // Gate 3a: Verify GUCs are empty outside the transaction
  const { rows: gucRows } = await db.query(
    `SELECT
       COALESCE(current_setting('app.user_id', true), '') AS leaked_user_id,
       COALESCE(current_setting('app.can_moderate', true), '') AS leaked_can_moderate`
  );

  // Gate 5: Role privilege & RLS inspection from actual runtime connection
  const { rows: roleRows } = await db.query(
    `SELECT
       current_user AS db_current_user,
       u.usesuper AS is_superuser,
       u.usebypassrls AS has_bypassrls,
       c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS rls_forced
     FROM pg_user u
     CROSS JOIN pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
     WHERE u.usename = current_user
       AND c.relname = 'community_reviews'`
  );

  const { rows: leakCheck } = await db.query(
    "SELECT count(*)::int AS unapproved_visible FROM community_reviews WHERE status <> 'approved'"
  );

  const { rows: notifRlsRows } = await db.query(
    `SELECT
       c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS rls_forced
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
     WHERE c.relname = 'pager_notification_subscriptions'`
  );
  const { rows: notifLeakRows } = await db.query(
    "SELECT count(*)::int AS subs_visible_without_guc FROM pager_notification_subscriptions"
  );

  return res.json({
    environment_identity: {
      is_staging_confirmed: runtimeEnv === "staging",
      is_production_project: runtimeProjectId === "proj_MEO518rmLLl0",
      project_id_hash: runtimeProjectId
        ? "sha256:" + crypto.createHash("sha256").update(runtimeProjectId).digest("hex").slice(0, 12)
        : "unset"
    },
    adapter: {
      has_transaction_fn: typeof db.transaction === "function",
      has_connect_fn: typeof db.connect === "function",
      has_pool_connect_fn: Boolean(db.pool && typeof db.pool.connect === "function")
    },
    gate2_transactions: {
      ...txPin,
      rollback_caught: rollbackCaught,
      persisted_after_rollback: rbRows[0].c
    },
    gate3_guc_isolation: {
      leaked_user_id: gucRows[0].leaked_user_id,
      leaked_can_moderate: gucRows[0].leaked_can_moderate
    },
    gate5_db_role: {
      ...roleRows[0],
      unapproved_visible_without_guc: leakCheck[0].unapproved_visible,
      notif_rls_enabled: Boolean(notifRlsRows[0]?.rls_enabled),
      notif_rls_forced: Boolean(notifRlsRows[0]?.rls_forced),
      notif_subs_visible_without_guc: notifLeakRows[0].subs_visible_without_guc
    }
  });
}
