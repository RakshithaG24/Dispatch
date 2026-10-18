import nodemailer from 'nodemailer';
import { config } from '../config';
import { query } from '../db/pool';
import { log, errorMessage } from '../logger';
import { SenderRow } from '../types';

export function listSenders(): Promise<SenderRow[]> {
  return query<SenderRow>('SELECT * FROM senders ORDER BY created_at, id');
}

export async function getSender(id: string): Promise<SenderRow | undefined> {
  const rows = await query<SenderRow>('SELECT * FROM senders WHERE id = $1', [id]);
  return rows[0];
}

/**
 * Creates Ethereal test accounts until `count` sender rows exist.
 * Ethereal accounts are free, disposable and need no signup; messages sent
 * through them are captured and viewable through a preview URL.
 */
export async function ensureSenders(count = config.ETHEREAL_ACCOUNTS): Promise<number> {
  const existing = await listSenders();
  let created = 0;
  for (let i = existing.length; i < count; i++) {
    const account = await nodemailer.createTestAccount();
    await query(
      `INSERT INTO senders (email, display_name, smtp_host, smtp_port, smtp_user, smtp_pass)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (email) DO NOTHING`,
      [account.user, `Sender ${i + 1}`, account.smtp.host, account.smtp.port, account.user, account.pass],
    );
    created++;
    log.info('created ethereal sender', { email: account.user });
  }
  return created;
}

/** Boot-time helper: never lets a network failure to Ethereal stop the server from starting. */
export async function ensureSendersSafe(): Promise<void> {
  try {
    await ensureSenders();
  } catch (err) {
    log.warn('could not create ethereal senders; run "npm run seed:senders" once you are online', {
      error: errorMessage(err),
    });
  }
}
