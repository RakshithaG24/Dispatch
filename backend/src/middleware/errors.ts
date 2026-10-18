import { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { log, errorMessage } from '../logger';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    const message = err.issues.map((i) => `${i.path.join('.') || 'request'}: ${i.message}`).join('; ');
    res.status(400).json({ error: message });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  log.error('unhandled request error', { error: errorMessage(err) });
  res.status(500).json({ error: 'Something went wrong on the server.' });
};
