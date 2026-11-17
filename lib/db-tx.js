// Transaction helper compatible with both Hatchable's db.transaction(fn) SDK
// and standard node-postgres (pg.Pool / pg.Client) connections.

export async function withTransaction(db, fn) {
  if (!db) throw new Error('Database adapter is unavailable.');

  if (typeof db.transaction === 'function') {
    return db.transaction(fn);
  }

  if (typeof db.connect === 'function') {
    const client = await db.connect();
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

  throw new Error('Database adapter does not support atomic transactions (db.transaction or db.connect required).');
}
