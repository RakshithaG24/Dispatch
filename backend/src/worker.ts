import { migrate } from './db/migrate';
import { errorMessage, log } from './logger';
import { reconcileQueue } from './services/emails';
import { ensureIndex } from './services/search';
import { startEmailWorker } from './workers/emailWorker';

async function main() {
  await migrate();
  await ensureIndex().catch((err) => log.warn('elasticsearch unavailable at boot', { error: errorMessage(err) }));
  // After a restart or a Redis wipe, re-create any job that Postgres says is still owed.
  await reconcileQueue();

  const worker = startEmailWorker();
  const shutdown = async (signal: string) => {
    log.info('shutting down worker', { signal });
    await worker.close(); // lets in-flight sends finish; unfinished jobs are picked up again on restart
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  log.error('fatal worker startup error', { error: errorMessage(err) });
  process.exit(1);
});
