import { Client } from '@elastic/elasticsearch';
import { config } from '../config';
import { query } from '../db/pool';
import { errorMessage, log } from '../logger';
import { EmailDto, EmailRow, EmailStatus } from '../types';

const INDEX = 'dispatch-emails';
const es = new Client({ node: config.ELASTICSEARCH_URL, maxRetries: 1, requestTimeout: 4000 });

type IndexedEmail = EmailDto & { userId: string; body: string };

/** Creates the index with explicit mappings if it does not exist yet. */
export async function ensureIndex(): Promise<void> {
  const exists = await es.indices.exists({ index: INDEX });
  if (exists) return;
  await es.indices.create({
    index: INDEX,
    mappings: {
      properties: {
        userId: { type: 'keyword' },
        status: { type: 'keyword' },
        recipient: { type: 'text', fields: { keyword: { type: 'keyword' } } },
        subject: { type: 'text' },
        body: { type: 'text' },
        senderEmail: { type: 'keyword' },
        scheduledAt: { type: 'date' },
        processedAt: { type: 'date' },
        error: { type: 'text' },
        previewUrl: { type: 'keyword', index: false },
        deferReason: { type: 'keyword' },
      },
    },
  });
  log.info('created elasticsearch index', { index: INDEX });
}

export function toDto(row: EmailRow & { sender_email: string }): EmailDto {
  return {
    id: row.id,
    recipient: row.recipient,
    subject: row.subject,
    status: row.status,
    scheduledAt: row.scheduled_at.toISOString(),
    processedAt: row.processed_at ? row.processed_at.toISOString() : null,
    error: row.error,
    previewUrl: row.preview_url,
    deferReason: row.defer_reason,
    senderEmail: row.sender_email,
  };
}

function toDocument(row: EmailRow & { sender_email: string }): IndexedEmail {
  return { ...toDto(row), userId: row.user_id, body: row.body };
}

const SELECT_WITH_SENDER = `SELECT e.*, s.email AS sender_email FROM emails e JOIN senders s ON s.id = e.sender_id`;

/** Bulk-indexes rows. Failures are logged, never thrown: Postgres stays authoritative. */
export async function indexEmails(rows: (EmailRow & { sender_email: string })[]): Promise<void> {
  if (rows.length === 0) return;
  try {
    const CHUNK = 1000;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const operations = rows.slice(i, i + CHUNK).flatMap((row) => [
        { index: { _index: INDEX, _id: row.id } },
        toDocument(row),
      ]);
      const result = await es.bulk({ operations });
      if (result.errors) log.warn('some documents failed to index');
    }
  } catch (err) {
    log.warn('elasticsearch indexing failed', { error: errorMessage(err) });
  }
}

/** Re-reads one email from Postgres and pushes its current state into the index. */
export async function syncEmail(id: string): Promise<void> {
  try {
    const rows = await query<EmailRow & { sender_email: string }>(`${SELECT_WITH_SENDER} WHERE e.id = $1`, [id]);
    if (rows[0]) await indexEmails(rows);
  } catch (err) {
    log.warn('elasticsearch sync failed', { id, error: errorMessage(err) });
  }
}

/** Re-indexes every email of a batch; used right after a batch is scheduled. */
export async function syncBatch(batchId: string): Promise<void> {
  try {
    const rows = await query<EmailRow & { sender_email: string }>(`${SELECT_WITH_SENDER} WHERE e.batch_id = $1`, [batchId]);
    await indexEmails(rows);
  } catch (err) {
    log.warn('elasticsearch batch sync failed', { batchId, error: errorMessage(err) });
  }
}

export interface SearchParams {
  userId: string;
  statuses: EmailStatus[];
  text: string;
  page: number;
  pageSize: number;
  sortField: 'scheduledAt' | 'processedAt';
  sortOrder: 'asc' | 'desc';
}

export async function searchEmails(p: SearchParams): Promise<{ items: EmailDto[]; total: number }> {
  const needle = p.text.trim().toLowerCase();
  const result = await es.search<IndexedEmail>({
    index: INDEX,
    from: (p.page - 1) * p.pageSize,
    size: p.pageSize,
    track_total_hits: true,
    sort: [{ [p.sortField]: { order: p.sortOrder, unmapped_type: 'date' } }],
    query: {
      bool: {
        filter: [{ term: { userId: p.userId } }, { terms: { status: p.statuses } }],
        must: [
          {
            bool: {
              minimum_should_match: 1,
              should: [
                { multi_match: { query: needle, fields: ['recipient^3', 'subject^2', 'body'], fuzziness: 'AUTO' } },
                { wildcard: { 'recipient.keyword': { value: `*${needle}*`, case_insensitive: true } } },
              ],
            },
          },
        ],
      },
    },
  });
  const total = typeof result.hits.total === 'number' ? result.hits.total : result.hits.total?.value ?? 0;
  const items = result.hits.hits.flatMap((hit) => {
    if (!hit._source) return [];
    const { userId: _userId, body: _body, ...dto } = hit._source;
    return [dto as EmailDto];
  });
  return { items, total };
}

export async function elasticsearchHealthy(): Promise<boolean> {
  try {
    await es.ping();
    return true;
  } catch {
    return false;
  }
}
