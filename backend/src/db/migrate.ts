import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pool } from './pool';
import { log } from '../logger';

const LOCK_ID = 727274;

/**
 * Applies schema.sql. Every statement is idempotent (IF NOT EXISTS), and an
 * advisory lock stops the API and worker from racing when both boot together.
 */
export async function migrate(): Promise<void> {
  const sql = readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_ID]);
    await client.query(sql);
    log.info('database schema is up to date');
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]).catch(() => undefined);
    client.release();
  }
}

if (require.main === module) {
  migrate()
    .then(() => pool.end())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
