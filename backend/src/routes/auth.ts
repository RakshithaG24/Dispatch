import { randomBytes, createHmac } from 'node:crypto';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { config, googleRedirectUri, isProd } from '../config';
import { query } from '../db/pool';
import { HttpError } from '../middleware/errors';
import { requireAuth, SESSION_COOKIE, setSessionCookie } from '../middleware/auth';
import { UserRow } from '../types';

export const authRouter = Router();

/**
 * Sign a state string with HMAC so we can verify it on callback
 * without needing cookies (which Chrome's "Dangerous site" warning blocks).
 */
function signState(nonce: string, returnTo: string): string {
  const payload = `${nonce}|${returnTo}`;
  const sig = createHmac('sha256', config.JWT_SECRET).update(payload).digest('hex').slice(0, 16);
  return `${sig}.${Buffer.from(payload).toString('base64url')}`;
}

function verifyState(state: string): { nonce: string; returnTo: string } | null {
  const dot = state.indexOf('.');
  if (dot < 0) return null;
  const sig = state.slice(0, dot);
  const payloadB64 = state.slice(dot + 1);
  let payload: string;
  try {
    payload = Buffer.from(payloadB64, 'base64url').toString();
  } catch {
    return null;
  }
  const expected = createHmac('sha256', config.JWT_SECRET).update(payload).digest('hex').slice(0, 16);
  if (sig !== expected) return null;
  const pipe = payload.indexOf('|');
  if (pipe < 0) return null;
  return { nonce: payload.slice(0, pipe), returnTo: payload.slice(pipe + 1) };
}

/** Step 1: send the browser to Google's consent screen. */
authRouter.get('/google', (req, res) => {
  let clientOrigin = config.APP_URL;
  const paramOrigin = typeof req.query.returnTo === 'string' ? req.query.returnTo : null;
  const candidate = paramOrigin || req.headers.referer;
  if (candidate) {
    try {
      const u = new URL(candidate);
      if (u.protocol === 'http:' || u.protocol === 'https:') {
        clientOrigin = u.origin;
      }
    } catch {}
  }

  if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET) {
    res.redirect(`${clientOrigin}/?error=google_not_configured`);
    return;
  }

  const nonce = randomBytes(24).toString('hex');
  const state = signState(nonce, clientOrigin);

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
    const { code, state: rawState, error } = req.query as Record<string, string | undefined>;

    const verified = rawState ? verifyState(rawState) : null;
    const clientOrigin = verified?.returnTo || config.APP_URL;

    if (error) return res.redirect(`${clientOrigin}/?error=google_denied`);
    if (!code || !verified) {
      throw new HttpError(400, 'Login could not be verified. Please try signing in again.');
    }

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

    // Create a short-lived login token (30 seconds) to set the session cookie
    // through the Vercel proxy so the cookie lands on the frontend domain.
    const loginToken = jwt.sign(
      { sub: rows[0].id, purpose: 'login' },
      config.JWT_SECRET,
      { expiresIn: '30s' },
    );

    // Redirect through the frontend's /api proxy so the cookie is set on the frontend domain
    res.redirect(`${clientOrigin}/api/auth/complete-login?token=${loginToken}`);
  } catch (err) {
    next(err);
  }
});

/**
 * Step 3: Called through the Vercel proxy so the session cookie is set on the
 * frontend domain. The short-lived login token proves the user just authenticated.
 */
authRouter.get('/complete-login', (req, res) => {
  const { token } = req.query as { token?: string };
  if (!token) {
    res.status(400).json({ error: 'Missing token' });
    return;
  }
  try {
    const payload = jwt.verify(token, config.JWT_SECRET) as { sub: string; purpose?: string };
    if (payload.purpose !== 'login') throw new Error('invalid token purpose');
    setSessionCookie(res, payload.sub);
    res.redirect('/dashboard');
  } catch {
    res.status(400).json({ error: 'Invalid or expired login token. Please sign in again.' });
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
