import { randomUUID } from 'node:crypto';
import { config } from '../config';
import { pool, query, withTransaction } from '../db/pool';
import { errorMessage, log } from '../logger';
import { enqueueEmails } from '../queue/queue';
import { EmailDto, EmailGroup, EmailRow, EmailStatus } from '../types';
import { listSenders } from './senders';
import { searchEmails, syncBatch, toDto } from './search';
import { HttpError } from '../middleware/errors';

export interface ScheduleInput {
  userId: string;
  idempotencyKey: string | null;
  subject: string;
  body: string;
  recipients: string[];
  startTime: Date;
  delaySeconds: number;
  hourlyLimit: number;
}

export interface ScheduleResult {
  batchId: string;
  scheduled: number;
  duplicate: boolean;
  effectiveHourlyLimit: number;
  effectiveDelaySeconds: number;
}

const GROUP_STATUSES: Record<EmailGroup, EmailStatus[]> = {
  scheduled: ['scheduled', 'processing'],
  sent: ['sent', 'failed'],
};

/**
 * Stores a batch and enqueues one delayed BullMQ job per recipient.
 *
 * Ordering of work:
 *  1. Insert the batch and every email row in ONE transaction. After commit the
 *     emails exist durably, even if Redis is down at this moment.
 *  2. Add the delayed jobs. If this step fails, the rows are still 'scheduled'
 *     and the startup reconciler (or a retry with the same idempotency key)
 *     re-creates the missing jobs.
 *  3. Index into Elasticsearch (best effort).
 */
export async function scheduleBatch(input: ScheduleInput): Promise<ScheduleResult> {
  const effectiveHourlyLimit = Math.min(input.hourlyLimit, config.MAX_EMAILS_PER_HOUR_PER_SENDER);
  const delayMs = Math.max(input.delaySeconds * 1000, config.MIN_DELAY_BETWEEN_EMAILS_MS);

  if (input.idempotencyKey) {
    const existing = await query<{ id: string; total: number; hourly_limit: number; delay_seconds: number }>(
      'SELECT id, total, hourly_limit, delay_seconds FROM batches WHERE user_id = $1 AND idempotency_key = $2',
      [input.userId, input.idempotencyKey],
    );
    if (existing[0]) {
      await reconcileQueue(existing[0].id);
      return {
        batchId: existing[0].id,
        scheduled: existing[0].total,
        duplicate: true,
        effectiveHourlyLimit: existing[0].hourly_limit,
        effectiveDelaySeconds: existing[0].delay_seconds,
      };
    }
  }

  const senders = await listSenders();
  if (senders.length === 0) {
    throw new HttpError(503, 'No sender accounts exist yet. Run "npm run seed:senders" in the backend folder.');
  }

  const recipients = [...new Set(input.recipients.map((r) => r.trim().toLowerCase()))];
  const batchId = randomUUID();
  const startMs = Math.max(input.startTime.getTime(), Date.now());

  const rows = recipients.map((recipient, i) => ({
    id: randomUUID(),
    senderId: senders[i % senders.length].id, // round-robin across senders
    recipient,
    scheduledAt: new Date(startMs + i * delayMs),
  }));

  try {
    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO batches (id, user_id, idempotency_key, subject, body, start_at, delay_seconds, hourly_limit, total)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [batchId, input.userId, input.idempotencyKey, input.subject, input.body, new Date(startMs),
         Math.round(delayMs / 1000), effectiveHourlyLimit, rows.length],
      );
      // One INSERT for the whole batch. Rows get their seq in array order,
      // which is the order the sender expects them to go out.
      await client.query(
        `INSERT INTO emails (id, batch_id, user_id, sender_id, recipient, subject, body, scheduled_at, hourly_limit, min_delay_ms)
         SELECT t.id, $1, $2, t.sender_id, t.recipient, $3, $4, t.scheduled_at, $5, $6
         FROM unnest($7::uuid[], $8::uuid[], $9::text[], $10::timestamptz[]) WITH ORDINALITY
              AS t(id, sender_id, recipient, scheduled_at, ord)
         ORDER BY t.ord`,
        [batchId, input.userId, input.subject, input.body, effectiveHourlyLimit, delayMs,
         rows.map((r) => r.id), rows.map((r) => r.senderId), rows.map((r) => r.recipient), rows.map((r) => r.scheduledAt)],
      );
    });
  } catch (err) {
    // A concurrent request with the same idempotency key won the race on the unique index.
    if ((err as { code?: string }).code === '23505' && input.idempotencyKey) {
      return scheduleBatch(input);
    }
    throw err;
  }

  try {
    await enqueueEmails(rows.map((r) => ({ id: r.id, scheduledAt: r.scheduledAt })));
  } catch (err) {
    log.error('enqueue failed after commit; reconciler will repair', { batchId, error: errorMessage(err) });
  }
  void syncBatch(batchId);

  return {
    batchId,
    scheduled: rows.length,
    duplicate: false,
    effectiveHourlyLimit,
    effectiveDelaySeconds: Math.round(delayMs / 1000),
  };
}

export interface ListParams {
  userId: string;
  group: EmailGroup;
  page: number;
  pageSize: number;
  text: string;
}

/**
 * Lists a user's emails for one tab. A text query goes to Elasticsearch;
 * if the search cluster is unreachable it degrades to a Postgres ILIKE
 * so the dashboard keeps working.
 */
export async function listEmails(p: ListParams): Promise<{ items: EmailDto[]; total: number; searchEngine: 'postgres' | 'elasticsearch' }> {
  const statuses = GROUP_STATUSES[p.group];
  const sortField = p.group === 'scheduled' ? 'scheduledAt' : 'processedAt';
  const sortOrder = p.group === 'scheduled' ? 'asc' : 'desc';

  if (p.text.trim()) {
    try {
      const found = await searchEmails({ ...p, statuses, sortField, sortOrder });
      return { ...found, searchEngine: 'elasticsearch' };
    } catch (err) {
      log.warn('search failed, falling back to postgres', { error: errorMessage(err) });
    }
  }

  const orderBy = p.group === 'scheduled' ? 'e.scheduled_at ASC, e.seq ASC' : 'e.processed_at DESC, e.seq DESC';
  const like = `%${p.text.trim().replace(/[%_\\]/g, '\\$&')}%`;
  const filter = p.text.trim() ? 'AND (e.recipient ILIKE $3 OR e.subject ILIKE $3 OR e.body ILIKE $3)' : '';
  const params: unknown[] = [p.userId, statuses];
  if (p.text.trim()) params.push(like);

  const [rows, count] = await Promise.all([
    query<EmailRow & { sender_email: string }>(
      `SELECT e.*, s.email AS sender_email FROM emails e JOIN senders s ON s.id = e.sender_id
       WHERE e.user_id = $1 AND e.status = ANY($2) ${filter}
       ORDER BY ${orderBy} LIMIT ${p.pageSize} OFFSET ${(p.page - 1) * p.pageSize}`,
      params,
    ),
    query<{ count: string }>(`SELECT count(*) FROM emails e WHERE e.user_id = $1 AND e.status = ANY($2) ${filter}`, params),
  ]);
  return { items: rows.map(toDto), total: Number(count[0].count), searchEngine: 'postgres' };
}

export async function countEmails(userId: string): Promise<{ scheduled: number; sent: number }> {
  const rows = await query<{ status: EmailStatus; count: string }>(
    'SELECT status, count(*) FROM emails WHERE user_id = $1 GROUP BY status',
    [userId],
  );
  const by = Object.fromEntries(rows.map((r) => [r.status, Number(r.count)])) as Partial<Record<EmailStatus, number>>;
  return {
    scheduled: (by.scheduled ?? 0) + (by.processing ?? 0),
    sent: (by.sent ?? 0) + (by.failed ?? 0),
  };
}

// ---------------------------------------------------------------------------
// Worker-side state transitions. Each is a single guarded UPDATE so that the
// database, not application memory, decides who may send an email.
// ---------------------------------------------------------------------------

export async function getEmailForSend(id: string): Promise<EmailRow | undefined> {
  const rows = await query<EmailRow>('SELECT * FROM emails WHERE id = $1', [id]);
  return rows[0];
}

/**
 * Atomically takes ownership of an email. Succeeds only if it is still
 * 'scheduled', or if a previous worker claimed it more than 5 minutes ago
 * and evidently died. Anything already sent or failed returns undefined,
 * which is what makes a re-delivered job harmless.
 */
export async function claimEmail(id: string): Promise<EmailRow | undefined> {
  const rows = await query<EmailRow>(
    `UPDATE emails SET status = 'processing', claimed_at = now()
     WHERE id = $1 AND (status = 'scheduled' OR (status = 'processing' AND claimed_at < now() - interval '5 minutes'))
     RETURNING *`,
    [id],
  );
  return rows[0];
}

export async function markSent(id: string, messageId: string, previewUrl: string | null): Promise<void> {
  await query(
    `UPDATE emails SET status = 'sent', processed_at = now(), attempts = attempts + 1,
       message_id = $2, preview_url = $3, error = NULL, defer_reason = NULL
     WHERE id = $1`,
    [id, messageId, previewUrl],
  );
}

export async function markRetry(id: string, error: string): Promise<void> {
  await query(`UPDATE emails SET status = 'scheduled', attempts = attempts + 1, error = $2 WHERE id = $1`, [id, error]);
}

export async function markFailed(id: string, error: string): Promise<void> {
  await query(
    `UPDATE emails SET status = 'failed', processed_at = now(), attempts = attempts + 1, error = $2 WHERE id = $1`,
    [id, error],
  );
}

/** Records that the rate limiter pushed this email to a later slot, and moves its displayed time. */
export async function markDeferred(id: string, slotAt: Date, reason: 'hourly_limit' | 'sender_spacing'): Promise<void> {
  await query(
    `UPDATE emails SET scheduled_at = $2, defer_reason = $3 WHERE id = $1 AND status = 'scheduled'`,
    [id, slotAt, reason],
  );
}

/**
 * Repairs the gap between Postgres and Redis. Any email still 'scheduled'
 * gets its job (re)added. Adding is a no-op for ids that already have a job,
 * so this is safe to run on every boot and from multiple processes.
 * Also handles Redis having lost its data entirely.
 */
export async function reconcileQueue(batchId?: string): Promise<number> {
  let cursor = '0';
  let total = 0;
  for (;;) {
    const rows: { id: string; seq: string; scheduled_at: Date }[] = (
      await pool.query(
        `SELECT id, seq, scheduled_at FROM emails
         WHERE status = 'scheduled' AND seq > $1 AND ($2::uuid IS NULL OR batch_id = $2)
         ORDER BY seq LIMIT 1000`,
        [cursor, batchId ?? null],
      )
    ).rows;
    if (rows.length === 0) break;
    await enqueueEmails(rows.map((r) => ({ id: r.id, scheduledAt: r.scheduled_at })));
    cursor = rows[rows.length - 1].seq;
    total += rows.length;
  }
  if (total > 0) log.info('reconciled scheduled emails into the queue', { count: total });
  return total;
}

