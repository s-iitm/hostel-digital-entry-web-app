import pg from 'pg';
import { config } from '../config.js';

// Return DATE columns as plain 'YYYY-MM-DD' strings (avoids JS timezone shifting).
pg.types.setTypeParser(1082, (v) => v);

export const pool = new pg.Pool({ connectionString: config.databaseUrl });

export const query = (text, params) => pool.query(text, params);

/** Run fn(client) inside a transaction. */
export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Current local date/time (as strings) in the configured timezone. */
export async function localNow(client = pool) {
  const { rows } = await client.query(
    `SELECT (now() AT TIME ZONE $1)::date::text AS date, to_char((now() AT TIME ZONE $1)::time, 'HH24:MI:SS') AS time`,
    [config.tz]
  );
  return rows[0];
}
