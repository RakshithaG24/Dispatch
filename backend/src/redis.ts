import IORedis from 'ioredis';
import { config } from './config';

/**
 * BullMQ requires maxRetriesPerRequest to be null on connections used by
 * workers, otherwise blocking commands throw after a few retries.
 */
export function createRedis(): IORedis {
  const isTls = config.REDIS_URL.startsWith('rediss://');
  return new IORedis(config.REDIS_URL, {
    maxRetriesPerRequest: null,
    ...(isTls ? { tls: { rejectUnauthorized: false } } : {}),
  });
}

/** Shared connection for the queue, rate limiter and Slack notification dedupe. */
export const redis = createRedis();
