// Single-connection transaction helper for the repository runtime adapter and node-postgres (pg.Pool).
//
// Security invariants:
//   1. NEVER issue `BEGIN` / `SET LOCAL` / `COMMIT` directly on an unpinned shared pool's
//      `db.query`, which would scatter statements across different backend connections.
//   2. When `getActiveGovernanceContext()?.requireEligibleSessionInTx` is active (set centrally
//      by `server/app.js` on all non-exempt authenticated HTTP routes), acquires a PostgreSQL
//      `FOR SHARE` row lock on `auth_sessions` + `auth_users` inside the transaction so concurrent
//      session revocations, account suspensions, or `< 14` age-assessment disabling serialize
//      cleanly at row-lock level and abort in-flight protected transactions (`401` / `403`).

import { getActiveGovernanceContext } from './request-context.js';

export class SessionEligibilityError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
    this.isSessionEligibilityError = true;
  }
}

async function verifySessionAndEligibilityInTx(tx) {
  const govCtx = getActiveGovernanceContext();
  if (!govCtx || !govCtx.requireEligibleSessionInTx || tx.__bsSessionEligibilityVerified) {
    return;
  }
  tx.__bsSessionEligibilityVerified = true;

  const sessionId = govCtx.verifiedSessionId;
  const userId = govCtx.verifiedUserId;
  if (!sessionId || !userId) {
    const err = new SessionEligibilityError(401, 'AUTH_REQUIRED', 'Sign in is required.');
    govCtx.abortedBySessionEligibilityError = err;
    throw err;
  }

  let prevAuthInternal = '';
  try {
    const prevRes = await tx.query("SELECT COALESCE(current_setting('app.auth_internal', true), '') AS v");
    prevAuthInternal = prevRes.rows[0]?.v || '';
    await tx.query("SELECT set_config('app.auth_internal', 'true', true)");

    const { rows } = await tx.query(
      `SELECT
         s.revoked_at,
         s.expires_at,
         s.max_expires_at,
         u.disabled_at,
         u.age_eligibility_status
       FROM auth_sessions s
       JOIN auth_users u ON u.id = s.user_id
       WHERE s.id = $1 AND u.id = $2
       FOR SHARE OF s, u`,
      [sessionId, userId]
    );

    await tx.query("SELECT set_config('app.auth_internal', $1, true)", [prevAuthInternal]);

    if (!rows.length) {
      const err = new SessionEligibilityError(401, 'SESSION_REVOKED', 'Sign in is required.');
      govCtx.abortedBySessionEligibilityError = err;
      throw err;
    }

    const row = rows[0];
    const nowMs = Date.now();
    const expMs = new Date(row.expires_at).getTime();
    const maxExpMs = new Date(row.max_expires_at).getTime();

    if (
      row.revoked_at ||
      row.disabled_at ||
      !Number.isFinite(expMs) ||
      expMs <= nowMs ||
      !Number.isFinite(maxExpMs) ||
      maxExpMs <= nowMs
    ) {
      const err = new SessionEligibilityError(401, 'SESSION_REVOKED', 'Sign in is required.');
      govCtx.abortedBySessionEligibilityError = err;
      throw err;
    }

    if ((row.age_eligibility_status || 'not_assessed') !== 'eligible_14_plus') {
      const err = new SessionEligibilityError(
        403,
        'AGE_ASSESSMENT_REQUIRED',
        'Complete the one-time minimum account age check (14+) before using account, vendor, or administrative features.'
      );
      govCtx.abortedBySessionEligibilityError = err;
      throw err;
    }
  } catch (err) {
    if (err instanceof SessionEligibilityError) {
      throw err;
    }
    // Restore GUC best-effort before propagating unexpected DB error
    await tx.query("SELECT set_config('app.auth_internal', $1, true)", [prevAuthInternal]).catch(() => {});
    throw err;
  }
}

export async function withTransaction(db, fn) {
  if (!db) throw new Error('Database adapter is unavailable.');

  if (typeof db.transaction === 'function') {
    return db.transaction(async tx => {
      if (!tx || typeof tx.query !== 'function') {
        throw new Error('db.transaction callback did not receive a queryable transaction client.');
      }
      await verifySessionAndEligibilityInTx(tx);
      return fn(tx);
    });
  }

  const connectFn =
    typeof db.connect === 'function'
      ? () => db.connect()
      : db.pool && typeof db.pool.connect === 'function'
        ? () => db.pool.connect()
        : null;

  if (connectFn) {
    const client = await connectFn();
    try {
      await client.query('BEGIN');
      await verifySessionAndEligibilityInTx(client);
      const out = await fn(client);
      await client.query('COMMIT');
      return out;
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {}
      throw err;
    } finally {
      if (typeof client.release === 'function') client.release();
    }
  }

  throw new Error('Database adapter does not expose a pinned transaction interface (db.transaction or db.connect required).');
}
