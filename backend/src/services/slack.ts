import jwt from 'jsonwebtoken';
import { config, slackRedirectUri } from '../config';
import { query } from '../db/pool';
import { errorMessage, log } from '../logger';
import { redis } from '../redis';
import { HttpError } from '../middleware/errors';

export interface SlackConnection {
  user_id: string;
  team_name: string | null;
  channel: string | null;
  webhook_url: string;
}

export const slackConfigured = () => Boolean(config.SLACK_CLIENT_ID && config.SLACK_CLIENT_SECRET);

/**
 * Builds the Slack authorize URL. The state is a short-lived signed token that
 * carries the user id, so the callback can attach the webhook to the right user
 * and cannot be forged or replayed after ten minutes.
 */
export function buildAuthorizeUrl(userId: string): string {
  const state = jwt.sign({ sub: userId, purpose: 'slack' }, config.JWT_SECRET, { expiresIn: '10m' });
  const params = new URLSearchParams({
    client_id: config.SLACK_CLIENT_ID,
    scope: 'incoming-webhook',
    redirect_uri: slackRedirectUri,
    state,
  });
  return `https://slack.com/oauth/v2/authorize?${params}`;
}

export function userIdFromState(state: string): string {
  try {
    const payload = jwt.verify(state, config.JWT_SECRET) as { sub: string; purpose: string };
    if (payload.purpose !== 'slack') throw new Error('wrong purpose');
    return payload.sub;
  } catch {
    throw new HttpError(400, 'Slack authorization expired or was invalid. Please try again.');
  }
}

/** Exchanges the OAuth code for an incoming webhook bound to the channel the user picked. */
export async function completeOAuth(userId: string, code: string): Promise<void> {
  const res = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.SLACK_CLIENT_ID,
      client_secret: config.SLACK_CLIENT_SECRET,
      code,
      redirect_uri: slackRedirectUri,
    }),
  });
  const data = (await res.json()) as {
    ok: boolean;
    error?: string;
    team?: { name?: string };
    incoming_webhook?: { url: string; channel?: string };
  };
  if (!data.ok || !data.incoming_webhook?.url) {
    throw new HttpError(400, `Slack rejected the authorization (${data.error ?? 'no webhook returned'}).`);
  }
  await query(
    `INSERT INTO slack_connections (user_id, team_name, channel, webhook_url) VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id) DO UPDATE SET team_name = EXCLUDED.team_name, channel = EXCLUDED.channel,
       webhook_url = EXCLUDED.webhook_url, created_at = now()`,
    [userId, data.team?.name ?? null, data.incoming_webhook.channel ?? null, data.incoming_webhook.url],
  );
}

export async function getConnection(userId: string): Promise<SlackConnection | undefined> {
  const rows = await query<SlackConnection>('SELECT * FROM slack_connections WHERE user_id = $1', [userId]);
  return rows[0];
}

export async function disconnect(userId: string): Promise<void> {
  await query('DELETE FROM slack_connections WHERE user_id = $1', [userId]);
}

async function postToWebhook(conn: SlackConnection, text: string): Promise<boolean> {
  const res = await fetch(conn.webhook_url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (res.ok) return true;
  // 404 / 410 mean the user removed the app or the webhook. Forget it so we stop trying.
  if (res.status === 404 || res.status === 410) await disconnect(conn.user_id);
  log.warn('slack webhook returned an error', { status: res.status });
  return false;
}

export async function sendTestMessage(userId: string): Promise<boolean> {
  const conn = await getConnection(userId);
  if (!conn) throw new HttpError(409, 'Slack is not connected.');
  return postToWebhook(conn, 'Dispatch test message: Slack notifications are working.');
}

/**
 * Called by the worker when a sender's hourly limit pushes an email to a later hour.
 * Never throws: with no connection it does nothing, and a Slack outage must not
 * affect sending. A Redis NX key limits it to one message per sender per hour window
 * so a 1000 email batch produces one alert, not hundreds.
 */
export async function notifyRateLimitHit(params: {
  userId: string;
  senderEmail: string;
  senderId: string;
  hourlyLimit: number;
  windowStart: number;
  resumeAt: number;
}): Promise<void> {
  try {
    const conn = await getConnection(params.userId);
    if (!conn) return;
    const firstInWindow = await redis.set(
      `slack:notified:${params.userId}:${params.senderId}:${params.windowStart}`,
      '1', 'EX', 7200, 'NX',
    );
    if (!firstInWindow) return;
    const resume = new Date(params.resumeAt).toISOString().replace('T', ' ').slice(0, 16);
    await postToWebhook(
      conn,
      `Hourly limit reached for ${params.senderEmail}: ${params.hourlyLimit} emails this hour. ` +
        `Remaining emails are queued and will resume at ${resume} UTC. Nothing was dropped.`,
    );
  } catch (err) {
    log.warn('slack notification failed', { error: errorMessage(err) });
  }
}
