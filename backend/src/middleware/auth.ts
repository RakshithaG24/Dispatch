import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config, isProd } from '../config';
import { query } from '../db/pool';
import { UserRow } from '../types';

export const SESSION_COOKIE = 'session';
const SESSION_DAYS = 7;

declare global {
  namespace Express {
    interface Request {
      user?: UserRow;
    }
  }
}

export function setSessionCookie(res: Response, userId: string): void {
  const token = jwt.sign({ sub: userId }, config.JWT_SECRET, { expiresIn: `${SESSION_DAYS}d` });
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    maxAge: SESSION_DAYS * 24 * 3600 * 1000,
  });
}

export async function loadUser(req: Request): Promise<UserRow | undefined> {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return undefined;
  try {
    const payload = jwt.verify(token, config.JWT_SECRET) as { sub: string };
    const rows = await query<UserRow>('SELECT id, google_id, email, name, avatar_url FROM users WHERE id = $1', [payload.sub]);
    return rows[0];
  } catch {
    return undefined;
  }
}

/** Rejects the request with 401 unless a valid session cookie is present. */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await loadUser(req);
    if (!user) {
      res.status(401).json({ error: 'You are not signed in.' });
      return;
    }
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}
