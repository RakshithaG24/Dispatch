import 'dotenv/config';
import { z } from 'zod';

/**
 * All runtime configuration lives here. Nothing else in the codebase reads
 * process.env directly, so every tunable (concurrency, delays, hourly limits)
 * is validated once at boot and typed everywhere else.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  APP_URL: z.string().url().default('http://localhost:5173'),
  API_URL: z.string().url().default('http://localhost:4000'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  ELASTICSEARCH_URL: z.string().url().default('http://localhost:9200'),

  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  SLACK_CLIENT_ID: z.string().default(''),
  SLACK_CLIENT_SECRET: z.string().default(''),

  WORKER_CONCURRENCY: z.coerce.number().int().min(1).default(5),
  MIN_DELAY_BETWEEN_EMAILS_MS: z.coerce.number().int().min(0).default(2000),
  MAX_EMAILS_PER_HOUR_PER_SENDER: z.coerce.number().int().min(1).default(200),
  MAX_ATTEMPTS: z.coerce.number().int().min(1).default(3),
  ETHEREAL_ACCOUNTS: z.coerce.number().int().min(1).default(3),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const details = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
  console.error(`Invalid environment configuration:\n${details}`);
  process.exit(1);
}

export const config = parsed.data;
export const isProd = config.NODE_ENV === 'production';
export const googleRedirectUri = `${config.API_URL}/api/auth/google/callback`;
export const slackRedirectUri = `${config.API_URL}/api/slack/callback`;
