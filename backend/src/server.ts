import { config } from './config';
import { migrate } from './db/migrate';
import { errorMessage, log } from './logger';
import { createApp } from './app';
import { reconcileQueue } from './services/emails';
import { ensureIndex } from './services/search';
import { ensureSendersSafe } from './services/senders';

import { startEmailWorker } from './workers/emailWorker';

async function main() {
  await migrate();
  await ensureSendersSafe();
  await ensureIndex().catch((err) => log.warn('elasticsearch unavailable at boot; search will use postgres', { error: errorMessage(err) }));
  await reconcileQueue();

  let worker: ReturnType<typeof startEmailWorker> | undefined;
  if (process.env.RUN_WORKER !== 'false') {
    worker = startEmailWorker();
  }

  const app = createApp();
  const server = app.listen(config.PORT, '0.0.0.0', () =>
    log.info('api listening', { port: config.PORT, bullBoard: `${config.API_URL}/admin/queues` })
  );

  const shutdown = async (signal: string) => {
    log.info('shutting down server', { signal });
    if (worker) await worker.close();
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  log.error('fatal startup error', { error: errorMessage(err) });
  process.exit(1);
});
