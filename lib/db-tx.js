// Single-connection transaction helper for Hatchable's db SDK and node-postgres (pg.Pool).
//
// Security invariant: NEVER issue `BEGIN` / `SET LOCAL` / `COMMIT` directly on an unpinned
// shared pool's `db.query`, which would scatter statements across different backend connections.

export async function withTransaction(db, fn) {
  if (!db) throw new Error('Database adapter is unavailable.');

  if (typeof db.transaction === 'function') {
    return db.transaction(async tx => {
      if (!tx || typeof tx.query !== 'function') {
        throw new Error('db.transaction callback did not receive a queryable transaction client.');
      }
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
