import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { config, googleRedirectUri, isProd } from '../config';
import { query } from '../db/pool';
import { HttpError } from '../middleware/errors';
import { requireAuth, SESSION_COOKIE, setSessionCookie } from '../middleware/auth';
import { UserRow } from '../types';

export const authRouter = Router();
const STATE_COOKIE = 'google_oauth_state';

/** Step 1: send the browser to Google's consent screen. */
authRouter.get('/google', (_req, res) => {
  if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET) {
    res.redirect(`${config.APP_URL}/?error=google_not_configured`);
    return;
  }
  const state = randomBytes(24).toString('hex');
  res.cookie(STATE_COOKIE, state, { httpOnly: true, sameSite: isProd ? 'none' : 'lax', secure: isProd, maxAge: 10 * 60 * 1000 });
  const params = new URLSearchParams({
    client_id: config.GOOGLE_CLIENT_ID,
    redirect_uri: googleRedirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

/** Step 2: Google redirects back with a code; exchange it, upsert the user, start a session. */
authRouter.get('/google/callback', async (req, res, next) => {
  try {
    const { code, state, error } = req.query as Record<string, string | undefined>;
    if (error) return res.redirect(`${config.APP_URL}/?error=google_denied`);
    if (!code || !state || state !== req.cookies?.[STATE_COOKIE]) {
      throw new HttpError(400, 'Login could not be verified. Please try signing in again.');
    }
    res.clearCookie(STATE_COOKIE);

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: config.GOOGLE_CLIENT_ID,
        client_secret: config.GOOGLE_CLIENT_SECRET,
        redirect_uri: googleRedirectUri,
        grant_type: 'authorization_code',
      }),
    });
    const tokens = (await tokenRes.json()) as { access_token?: string };
    if (!tokenRes.ok || !tokens.access_token) throw new HttpError(401, 'Google did not accept the login.');

    const profileRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = (await profileRes.json()) as { sub?: string; email?: string; name?: string; picture?: string };
    if (!profile.sub || !profile.email) throw new HttpError(401, 'Google did not return a profile.');

    const rows = await query<UserRow>(
      `INSERT INTO users (google_id, email, name, avatar_url) VALUES ($1, $2, $3, $4)
       ON CONFLICT (google_id) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name, avatar_url = EXCLUDED.avatar_url
       RETURNING id, google_id, email, name, avatar_url`,
      [profile.sub, profile.email, profile.name ?? profile.email, profile.picture ?? null],
    );
    setSessionCookie(res, rows[0].id);
    res.redirect(`${config.APP_URL}/dashboard`);
  } catch (err) {
    next(err);
  }
});

authRouter.get('/me', requireAuth, (req, res) => {
  const u = req.user!;
  res.json({ id: u.id, name: u.name, email: u.email, avatarUrl: u.avatar_url });
});

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(SESSION_COOKIE);
  res.status(204).end();
});
