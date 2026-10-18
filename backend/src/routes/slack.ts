import { Router } from 'express';
import { config } from '../config';
import { errorMessage, log } from '../logger';
import { HttpError } from '../middleware/errors';
import { requireAuth } from '../middleware/auth';
import * as slack from '../services/slack';

export const slackRouter = Router();

/** The callback is hit by Slack's redirect, so it authenticates through the signed state, not the cookie. */
slackRouter.get('/callback', async (req, res) => {
  const { code, state, error } = req.query as Record<string, string | undefined>;
  const back = (result: string) => res.redirect(`${config.APP_URL}/dashboard?slack=${result}`);
  if (error || !code || !state) return back('denied');
  try {
    await slack.completeOAuth(slack.userIdFromState(state), code);
    back('connected');
  } catch (err) {
    log.warn('slack oauth failed', { error: errorMessage(err) });
    back('error');
  }
});

slackRouter.use(requireAuth);

slackRouter.get('/status', async (req, res, next) => {
  try {
    const conn = await slack.getConnection(req.user!.id);
    res.json({
      configured: slack.slackConfigured(),
      connected: Boolean(conn),
      channel: conn?.channel ?? null,
      team: conn?.team_name ?? null,
    });
  } catch (err) {
    next(err);
  }
});

slackRouter.get('/connect', (req, res, next) => {
  try {
    if (!slack.slackConfigured()) throw new HttpError(503, 'Slack is not configured on this server.');
    res.redirect(slack.buildAuthorizeUrl(req.user!.id));
  } catch (err) {
    next(err);
  }
});

slackRouter.delete('/', async (req, res, next) => {
  try {
    await slack.disconnect(req.user!.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

slackRouter.post('/test', async (req, res, next) => {
  try {
    const delivered = await slack.sendTestMessage(req.user!.id);
    if (!delivered) throw new HttpError(502, 'Slack did not accept the message. Reconnect Slack and try again.');
    res.json({ delivered: true });
  } catch (err) {
    next(err);
  }
});
