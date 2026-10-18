import { existsSync } from 'node:fs';
import path from 'node:path';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { requireAuth } from './middleware/auth';
import { errorHandler } from './middleware/errors';
import { emailQueue } from './queue/queue';
import { authRouter } from './routes/auth';
import { emailsRouter } from './routes/emails';
import { slackRouter } from './routes/slack';
import { query } from './db/pool';
import { redis } from './redis';
import { elasticsearchHealthy } from './services/search';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  // CSP is relaxed only because the Bull Board UI ships inline scripts; the API returns JSON.
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());

  app.get('/api/health', async (_req, res) => {
    const [db, redisOk, search] = await Promise.all([
      query('SELECT 1').then(() => true, () => false),
      redis.ping().then(() => true, () => false),
      elasticsearchHealthy(),
    ]);
    res.status(db && redisOk ? 200 : 503).json({ postgres: db, redis: redisOk, elasticsearch: search });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/emails', emailsRouter);
  app.use('/api/slack', slackRouter);

  // Live queue dashboard, restricted to signed-in users.
  const board = new ExpressAdapter();
  board.setBasePath('/admin/queues');
  createBullBoard({ queues: [new BullMQAdapter(emailQueue)], serverAdapter: board });
  app.use('/admin/queues', requireAuth, board.getRouter());

  // When the frontend has been built, serve it from the same origin as the API.
  const dist = path.resolve(__dirname, '../../frontend/dist');
  if (existsSync(dist)) {
    app.use(express.static(dist));
    app.get(/^\/(?!api|admin).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
