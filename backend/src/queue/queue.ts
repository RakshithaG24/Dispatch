import { Queue } from 'bullmq';
import { config } from '../config';
import { redis } from '../redis';
import { EmailJobData } from '../types';

export const EMAIL_QUEUE = 'email-send';

export const emailQueue = new Queue<EmailJobData>(EMAIL_QUEUE, {
  connection: redis,
  defaultJobOptions: {
    attempts: config.MAX_ATTEMPTS,
    backoff: { type: 'exponential', delay: 5000 },
    // Completed jobs are dropped (Postgres is the record of what was sent).
    // Failed jobs stay so they remain visible in the BullMQ dashboard.
    removeOnComplete: { age: 3600, count: 1000 },
    removeOnFail: false,
  },
});

/**
 * Builds the BullMQ job for an email. The job id IS the email id, so adding
 * the same email twice is a no-op. This is the first layer of idempotency.
 */
export function buildJob(emailId: string, scheduledAt: Date) {
  return {
    name: 'send',
    data: { emailId } as EmailJobData,
    opts: { jobId: emailId, delay: Math.max(0, scheduledAt.getTime() - Date.now()) },
  };
}

/** Adds jobs in chunks so a 10,000 recipient batch does not build one giant Redis pipeline. */
export async function enqueueEmails(items: { id: string; scheduledAt: Date }[]): Promise<void> {
  const CHUNK = 500;
  for (let i = 0; i < items.length; i += CHUNK) {
    const jobs = items.slice(i, i + CHUNK).map((e) => buildJob(e.id, e.scheduledAt));
    await emailQueue.addBulk(jobs);
  }
}
