import { Pool, PoolClient, QueryResultRow } from 'pg';
import { config, isProd } from '../config';

const isLocalhost = config.DATABASE_URL.includes('localhost') || config.DATABASE_URL.includes('127.0.0.1');

export const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max: 20,
  ssl: !isLocalhost && isProd ? { rejectUnauthorized: false } : undefined,
});

export async function query<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
  const result = await pool.query<T>(text, params);
  return result.rows;
}

/** Runs fn inside a transaction, committing on success and rolling back on any throw. */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
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
