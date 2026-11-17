// EPHEMERAL STAGING-ONLY RUNTIME PROBE TEMPLATE (DO NOT PLACE IN `api/` IN GIT)
//
// Purpose:
//   Proves Gates 1, 2, 3, and 5 from inside the live Hatchable serverless function runtime
//   on an ISOLATED STAGING project:
//     - Gate 1: Verifies shared `lib/*.js` imports, `node:crypto`, and RFC 8291/8292
//       Web Push encryption/signing (`lib/webpush-crypto.js`) inside the hosted runtime.
//     - Gate 2: Inspects `db` adapter methods, verifies `withTransaction` pins multiple
//       statements to a single `pg_backend_pid()`, and proves a multi-statement
//       transaction rolls back completely when a later statement throws.
//     - Gate 3: Verifies transaction-local `app.user_id`, `app.can_moderate`, and
//       `app.pager_internal` GUCs do not leak after either `COMMIT` or `ROLLBACK`.
//     - Gate 5: Reports `usesuper`, `usebypassrls`, table ownership (`relowner`),
//       `relrowsecurity`, and `relforcerowsecurity` across `community_reviews` and all
//       four `pager_notification_*` tables, confirming bare `SELECT`s return 0 private rows.
//
// Staging lifecycle:
//   1. On the isolated staging project ONLY, upload this file as `api/_staging_gate_probe.js`
//      (temporarily making the deployed staging route count 31: 30 permanent + 1 probe)
//      and set secret `TRUCKLY_STAGING_PROBE_TOKEN` (minimum 24 random characters).
//   2. Run `node --env-file=.env.staging tests/staging-hatchable-gates.cjs --require-live`
//      with `STAGING_PROBE_TOKEN` and `STAGING_COOKIE_PLATFORM_ADMIN`.
//   3. Delete `api/_staging_gate_probe.js` and `TRUCKLY_STAGING_PROBE_TOKEN` from staging
//      and re-deploy staging so the final build matches the exact 30-route repository tree.

import crypto from "node:crypto";
import { db, auth } from "hatchable";
import { loadAccessContext, applyPrivateNoStoreHeaders } from "../lib/authz.js";
import { withTransaction } from "../lib/db-tx.js";
import {
  toBase64Url,
  generateVapidKeys,
  createVapidHeaders,
  verifyVapidJwt,
  encryptWebPushPayload,
  decryptWebPushPayload
} from "../lib/webpush-crypto.js";

export const access = "user";
export const methods = ["POST"];

function timingSafeMatch(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length < 24 || a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

function runWebPushCryptoSelfTest() {
  const vapid = generateVapidKeys();
  const hdrs = createVapidHeaders({
    endpointUrl: "https://fcm.googleapis.com/fcm/send/stg-probe",
    subject: "mailto:probe@staging.invalid",
    publicKey: vapid.publicKey,
    privateKey: vapid.privateKey
  });
  const jwtMatch = /^vapid\s+t=([^,\s]+),\s*k=([^\s]+)$/i.exec(hdrs.Authorization || "");
  const jwtCheck = jwtMatch ? verifyVapidJwt(jwtMatch[1], vapid.publicKey) : { valid: false };

  const subEcdh = crypto.createECDH("prime256v1");
  const subPub = toBase64Url(subEcdh.generateKeys());
  const subAuthBuf = crypto.randomBytes(16);
  const subAuth = toBase64Url(subAuthBuf);
  const plaintext = JSON.stringify({ probe: "rfc8291", ts: Date.now() });
  const ciphertext = encryptWebPushPayload(plaintext, subPub, subAuth);
  const decrypted = decryptWebPushPayload(ciphertext, subEcdh, subAuthBuf);

  return {
    ok: Boolean(jwtCheck.valid && decrypted === plaintext),
    vapid_es256_valid: Boolean(jwtCheck.valid),
    aes128gcm_roundtrip_valid: decrypted === plaintext,
    ciphertext_bytes: ciphertext.length
  };
}

export default async function(req, res) {
  applyPrivateNoStoreHeaders(res);

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

  const cryptoSelfTest = runWebPushCryptoSelfTest();
  const markerId = "stg-rb-" + crypto.randomUUID();

  // Gate 2a & Gate 3a: Single-connection pinning + GUC scoping inside committed transaction
  const txPin = await withTransaction(db, async tx => {
    const r1 = await tx.query("SELECT pg_backend_pid() AS pid, txid_current()::text AS xid");
    await tx.query(
      "SELECT set_config('app.user_id', $1, true), set_config('app.pager_internal', 'true', true)",
      [ctx.user.id]
    );
    const r2 = await tx.query(
      `SELECT
         pg_backend_pid() AS pid,
         txid_current()::text AS xid,
         current_setting('app.user_id', true) AS uid,
         current_setting('app.pager_internal', true) AS p_int`
    );
    return {
      same_pid: r1.rows[0].pid === r2.rows[0].pid,
      same_xid: r1.rows[0].xid === r2.rows[0].xid,
      in_tx_uid_matches: r2.rows[0].uid === ctx.user.id,
      in_tx_pager_internal_matches: r2.rows[0].p_int === "true"
    };
  });

  // Gate 2b & Gate 3b: Multi-statement rollback + GUC reset on ROLLBACK
  let rollbackCaught = false;
  try {
    await withTransaction(db, async tx => {
      await tx.query(
        `SELECT
           set_config('app.can_moderate', 'true', true),
           set_config('app.pager_internal', 'true', true),
           set_config('app.user_id', $1, true)`,
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

  // Gate 3c: Verify all four GUCs are empty outside transactions
  const { rows: gucRows } = await db.query(
    `SELECT
       COALESCE(current_setting('app.user_id', true), '') AS leaked_user_id,
       COALESCE(current_setting('app.can_moderate', true), '') AS leaked_can_moderate,
       COALESCE(current_setting('app.pager_internal', true), '') AS leaked_pager_internal,
       COALESCE(current_setting('app.auth_internal', true), '') AS leaked_auth_internal`
  );

  // Gate 5: Role privilege, ownership & FORCE RLS inspection across all protected tables
  const { rows: roleRows } = await db.query(
    `SELECT
       current_user AS db_current_user,
       session_user AS db_session_user,
       u.usesuper AS is_superuser,
       u.usebypassrls AS has_bypassrls,
       c.relowner::regrole::text AS community_table_owner,
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
       c.relname AS table_name,
       c.relowner::regrole::text AS table_owner,
       c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS rls_forced
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
     WHERE c.relname IN (
       'pager_notification_subscriptions',
       'pager_notification_events',
       'pager_notification_deliveries',
       'pager_rate_limits'
     )
     ORDER BY c.relname ASC`
  );

  const allNotifRlsForced =
    notifRlsRows.length === 4 &&
    notifRlsRows.every(r => r.rls_enabled === true && r.rls_forced === true);

  const { rows: notifLeakRows } = await db.query(
    `SELECT
       (SELECT count(*)::int FROM pager_notification_subscriptions) AS subs_visible,
       (SELECT count(*)::int FROM pager_notification_events) AS events_visible,
       (SELECT count(*)::int FROM pager_notification_deliveries) AS deliveries_visible`
  );

  // Standalone auth RLS inspection (when migration 017 is present)
  const { rows: authRlsRows } = await db.query(
    `SELECT
       c.relname AS table_name,
       c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS rls_forced
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
     WHERE c.relname IN (
       'auth_users',
       'auth_otp_challenges',
       'auth_sessions',
       'auth_rate_limits',
       'auth_staging_mailbox'
     )
     ORDER BY c.relname ASC`
  );

  let authLeakSummary = null;
  if (authRlsRows.length === 5) {
    const allAuthForced = authRlsRows.every(r => r.rls_enabled === true && r.rls_forced === true);
    const { rows: authLeak } = await db.query(
      `SELECT
         (SELECT count(*)::int FROM auth_users) AS users_visible,
         (SELECT count(*)::int FROM auth_otp_challenges) AS challenges_visible,
         (SELECT count(*)::int FROM auth_sessions) AS sessions_visible,
         (SELECT count(*)::int FROM auth_staging_mailbox) AS mailbox_visible`
    );
    authLeakSummary = {
      auth_tables_checked: authRlsRows.length,
      all_auth_tables_rls_forced: allAuthForced,
      auth_users_visible_without_guc: authLeak[0].users_visible,
      auth_challenges_visible_without_guc: authLeak[0].challenges_visible,
      auth_sessions_visible_without_guc: authLeak[0].sessions_visible,
      auth_mailbox_visible_without_guc: authLeak[0].mailbox_visible
    };
  }

  return res.json({
    environment_identity: {
      is_staging_confirmed: runtimeEnv === "staging",
      is_production_project: runtimeProjectId === "proj_MEO518rmLLl0",
      project_id_hash: runtimeProjectId
        ? "sha256:" + crypto.createHash("sha256").update(runtimeProjectId).digest("hex").slice(0, 12)
        : "unset",
      release_sha: process.env.TRUCKLY_RELEASE_SHA || process.env.GITHUB_SHA || "unset",
      node_version: process.version
    },
    adapter: {
      has_transaction_fn: typeof db.transaction === "function",
      has_connect_fn: typeof db.connect === "function",
      has_pool_connect_fn: Boolean(db.pool && typeof db.pool.connect === "function")
    },
    gate1_crypto_self_test: cryptoSelfTest,
    gate2_transactions: {
      ...txPin,
      rollback_caught: rollbackCaught,
      persisted_after_rollback: rbRows[0].c
    },
    gate3_guc_isolation: {
      leaked_user_id: gucRows[0].leaked_user_id,
      leaked_can_moderate: gucRows[0].leaked_can_moderate,
      leaked_pager_internal: gucRows[0].leaked_pager_internal,
      leaked_auth_internal: gucRows[0].leaked_auth_internal
    },
    gate5_db_role: {
      ...roleRows[0],
      unapproved_visible_without_guc: leakCheck[0].unapproved_visible,
      notif_rls_enabled: allNotifRlsForced,
      notif_rls_forced: allNotifRlsForced,
      all_notif_tables_rls_forced: allNotifRlsForced,
      notif_tables_checked: notifRlsRows.length,
      notif_subs_visible_without_guc: notifLeakRows[0].subs_visible,
      notif_events_visible_without_guc: notifLeakRows[0].events_visible,
      notif_deliveries_visible_without_guc: notifLeakRows[0].deliveries_visible,
      ...(authLeakSummary || {})
    }
  });
}
