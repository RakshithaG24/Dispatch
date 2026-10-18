import IORedis from 'ioredis';
import { config } from './config';

/**
 * BullMQ requires maxRetriesPerRequest to be null on connections used by
 * workers, otherwise blocking commands throw after a few retries.
 */
export function createRedis(): IORedis {
  return new IORedis(config.REDIS_URL, { maxRetriesPerRequest: null });
}

/** Shared connection for the queue, rate limiter and Slack notification dedupe. */
export const redis = createRedis();
