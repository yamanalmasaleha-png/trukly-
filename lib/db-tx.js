// Single-connection transaction helper for the repository runtime adapter and node-postgres (pg.Pool).
//
// Security invariants:
//   1. NEVER issue `BEGIN` / `SET LOCAL` / `COMMIT` directly on an unpinned shared pool's
//      `db.query`, which would scatter statements across different backend connections.
//   2. When `getActiveGovernanceContext()?.requireEligibleSessionInTx` is active (set centrally
//      by `server/app.js` on all non-exempt authenticated HTTP routes), acquires a PostgreSQL
//      `FOR SHARE` row lock on `auth_users` -> `auth_sessions` inside the transaction so concurrent
//      session revocations, account suspensions, or `< 14` age-assessment disabling serialize
//      cleanly at row-lock level and abort in-flight protected transactions (`401` / `403`).
//   3. Verification state is strictly bound to `(activeTxToken, sessionId, userId)` for the
//      duration of a single transaction ONLY, set strictly AFTER verification succeeds, and
//      cleared unconditionally on commit, rollback, and verification failure.

import { getActiveGovernanceContext } from './request-context.js';

const ACTIVE_TX_TOKEN = Symbol('bs.activeTxToken');
const VERIFIED_TX_IDENTITY = Symbol('bs.verifiedTxIdentity');

export class SessionEligibilityError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
    this.isSessionEligibilityError = true;
  }
}

export function clearTxVerificationState(tx) {
  if (!tx || typeof tx !== 'object') return;
  delete tx[VERIFIED_TX_IDENTITY];
  delete tx[ACTIVE_TX_TOKEN];
  delete tx.__bsSessionEligibilityVerified;
  delete tx.__bsTxCleanup;
}

export function respondIfSessionEligibilityError(err, res) {
  if (!err || (!(err instanceof SessionEligibilityError) && !err.isSessionEligibilityError)) {
    return false;
  }
  const status = err.status === 403 ? 403 : 401;
  const code = err.code || (status === 403 ? 'AGE_ASSESSMENT_REQUIRED' : 'SESSION_REVOKED');
  if (res && typeof res.status === 'function') {
    res.status(status).json({
      error:
        err.message ||
        (status === 403
          ? 'Complete the one-time minimum account age check (14+) before using account, vendor, or administrative features.'
          : 'Sign in is required.'),
      code,
      ...(status === 403 ? { requires_age_assessment: true } : {})
    });
  }
  return true;
}

async function verifySessionAndEligibilityInTx(tx) {
  const govCtx = getActiveGovernanceContext();
  if (!govCtx || !govCtx.requireEligibleSessionInTx) {
    return;
  }

  const sessionId = govCtx.verifiedSessionId;
  const userId = govCtx.verifiedUserId;
  if (!sessionId || !userId) {
    const err = new SessionEligibilityError(401, 'AUTH_REQUIRED', 'Sign in is required.');
    govCtx.abortedBySessionEligibilityError = err;
    throw err;
  }

  const activeToken = tx[ACTIVE_TX_TOKEN];
  const prior = tx[VERIFIED_TX_IDENTITY];
  if (
    activeToken &&
    prior &&
    prior.txToken === activeToken &&
    prior.sessionId === sessionId &&
    prior.userId === userId
  ) {
    return;
  }

  let prevAuthInternal = '';
  try {
    const prevRes = await tx.query("SELECT COALESCE(current_setting('app.auth_internal', true), '') AS v");
    prevAuthInternal = prevRes.rows[0]?.v || '';
    await tx.query("SELECT set_config('app.auth_internal', 'true', true)");

    // Lock `auth_users` BEFORE `auth_sessions` so readers match the exact lock order of
    // account suspension / age-ineligibility writers (`auth_users FOR UPDATE` -> `UPDATE auth_sessions`),
    // eliminating lock-order deadlocks (`40P01`) under concurrent revocation bursts.
    const { rows: userRows } = await tx.query(
      `SELECT disabled_at, age_eligibility_status
       FROM auth_users
       WHERE id = $1
       FOR SHARE`,
      [userId]
    );
    const { rows: sessRows } = userRows.length
      ? await tx.query(
          `SELECT revoked_at, expires_at, max_expires_at
           FROM auth_sessions
           WHERE id = $1 AND user_id = $2
           FOR SHARE`,
          [sessionId, userId]
        )
      : { rows: [] };

    await tx.query("SELECT set_config('app.auth_internal', $1, true)", [prevAuthInternal]);

    if (!userRows.length || !sessRows.length) {
      const err = new SessionEligibilityError(401, 'SESSION_REVOKED', 'Sign in is required.');
      govCtx.abortedBySessionEligibilityError = err;
      throw err;
    }

    const row = {
      disabled_at: userRows[0].disabled_at,
      age_eligibility_status: userRows[0].age_eligibility_status,
      revoked_at: sessRows[0].revoked_at,
      expires_at: sessRows[0].expires_at,
      max_expires_at: sessRows[0].max_expires_at
    };
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

    if (activeToken) {
      tx[VERIFIED_TX_IDENTITY] = Object.freeze({
        txToken: activeToken,
        sessionId,
        userId
      });
    }
  } catch (err) {
    delete tx[VERIFIED_TX_IDENTITY];
    delete tx.__bsSessionEligibilityVerified;
    if (err instanceof SessionEligibilityError) {
      throw err;
    }
    await tx.query("SELECT set_config('app.auth_internal', $1, true)", [prevAuthInternal]).catch(() => {});
    throw err;
  }
}

export async function withTransaction(db, fn) {
  if (!db) throw new Error('Database adapter is unavailable.');

  // Preserve legitimate nested `withTransaction(tx, fn)` calls inside an already-open transaction
  // without attempting to re-connect an already checked-out `pg.Client` or clearing outer state early.
  if (db[ACTIVE_TX_TOKEN] && typeof db.query === 'function') {
    await verifySessionAndEligibilityInTx(db);
    return fn(db);
  }

  if (typeof db.transaction === 'function') {
    return db.transaction(async tx => {
      if (!tx || typeof tx.query !== 'function') {
        throw new Error('db.transaction callback did not receive a queryable transaction client.');
      }
      clearTxVerificationState(tx);
      const txToken = Symbol('bs.tx');
      tx[ACTIVE_TX_TOKEN] = txToken;
      tx.__bsTxCleanup = () => clearTxVerificationState(tx);
      try {
        await verifySessionAndEligibilityInTx(tx);
        return await fn(tx);
      } finally {
        clearTxVerificationState(tx);
      }
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
    clearTxVerificationState(client);
    const txToken = Symbol('bs.tx');
    client[ACTIVE_TX_TOKEN] = txToken;
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
      clearTxVerificationState(client);
      if (typeof client.release === 'function') client.release();
    }
  }

  throw new Error('Database adapter does not expose a pinned transaction interface (db.transaction or db.connect required).');
}
