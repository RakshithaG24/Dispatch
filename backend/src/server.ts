import { config } from './config';
import { migrate } from './db/migrate';
import { errorMessage, log } from './logger';
import { createApp } from './app';
import { reconcileQueue } from './services/emails';
import { ensureIndex } from './services/search';
import { ensureSendersSafe } from './services/senders';

async function main() {
  await migrate();
  await ensureSendersSafe();
  await ensureIndex().catch((err) => log.warn('elasticsearch unavailable at boot; search will use postgres', { error: errorMessage(err) }));
  await reconcileQueue();

  const app = createApp();
  app.listen(config.PORT, () => log.info('api listening', { port: config.PORT, bullBoard: `${config.API_URL}/admin/queues` }));
}

main().catch((err) => {
  log.error('fatal startup error', { error: errorMessage(err) });
  process.exit(1);
});
