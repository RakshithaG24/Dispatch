import { DelayedError, Job, Worker } from 'bullmq';
import { config } from '../config';
import { errorMessage, log } from '../logger';
import { createRedis } from '../redis';
import { EMAIL_QUEUE } from '../queue/queue';
import { hourWindowStart, reserveSendSlot } from '../queue/rateLimiter';
import { claimEmail, getEmailForSend, markDeferred, markFailed, markRetry, markSent } from '../services/emails';
import { sendEmail } from '../services/mailer';
import { getSender } from '../services/senders';
import { syncEmail } from '../services/search';
import { notifyRateLimitHit } from '../services/slack';
import { EmailJobData } from '../types';

/** Slots closer than this are treated as "now" so we do not bounce jobs for a few milliseconds. */
const SLOT_TOLERANCE_MS = 50;

/**
 * Processes one email job. Three guards stand between a job and an SMTP send:
 *
 *  1. Terminal check: an email already 'sent' or 'failed' is skipped. This makes
 *     a re-delivered or duplicated job harmless.
 *  2. Slot reservation: Redis hands out a send time that respects the sender's
 *     minimum gap and hourly limit. If the slot is in the future the job is
 *     moved back to the delayed set; it is never dropped or failed.
 *  3. Claim: a guarded UPDATE flips scheduled to processing. Only one worker
 *     can win it, so two workers can never send the same email.
 */
export async function processEmail(job: Job<EmailJobData>, token?: string): Promise<void> {
  const email = await getEmailForSend(job.data.emailId);
  if (!email || email.status === 'sent' || email.status === 'failed') return;

  const sender = await getSender(email.sender_id);
  if (!sender) throw new Error(`sender ${email.sender_id} no longer exists`);

  let slotAt = job.data.slotAt;
  if (slotAt === undefined) {
    const now = Date.now();
    const reservation = await reserveSendSlot({
      senderId: sender.id,
      now,
      gapMs: email.min_delay_ms,
      hourlyLimit: email.hourly_limit,
    });
    slotAt = reservation.slotAt;

    if (reservation.hitHourlyLimit) {
      void notifyRateLimitHit({
        userId: email.user_id,
        senderId: sender.id,
        senderEmail: sender.email,
        hourlyLimit: email.hourly_limit,
        windowStart: hourWindowStart(now),
        resumeAt: slotAt,
      });
    }

    if (slotAt - now > SLOT_TOLERANCE_MS) {
      await markDeferred(email.id, new Date(slotAt), reservation.hitHourlyLimit ? 'hourly_limit' : 'sender_spacing');
      void syncEmail(email.id);
    }
  }

  const wait = slotAt - Date.now();
  if (wait > SLOT_TOLERANCE_MS) {
    // Remember the reserved slot on the job so waking up does not reserve a second one.
    await job.updateData({ emailId: email.id, slotAt });
    await job.moveToDelayed(slotAt, token);
    throw new DelayedError();
  }

  const claimed = await claimEmail(email.id);
  if (!claimed) return; // another worker owns it, or it already finished

  try {
    const result = await sendEmail(claimed, sender);
    await markSent(claimed.id, result.messageId, result.previewUrl);
    log.info('email sent', { id: claimed.id, to: claimed.recipient, sender: sender.email });
  } catch (err) {
    const message = errorMessage(err);
    const attemptsAllowed = job.opts.attempts ?? config.MAX_ATTEMPTS;
    const isFinal = job.attemptsMade + 1 >= attemptsAllowed;
    if (isFinal) {
      await markFailed(claimed.id, message);
    } else {
      await markRetry(claimed.id, message);
      await job.updateData({ emailId: claimed.id }); // drop the used slot; the retry reserves a fresh one
    }
    throw err;
  } finally {
    void syncEmail(claimed.id);
  }
}

export function startEmailWorker(): Worker<EmailJobData> {
  const worker = new Worker<EmailJobData>(EMAIL_QUEUE, processEmail, {
    connection: createRedis(),
    concurrency: config.WORKER_CONCURRENCY,
  });
  worker.on('failed', (job, err) => log.warn('email job failed', { jobId: job?.id, error: err.message }));
  worker.on('error', (err) => log.error('worker error', { error: err.message }));
  log.info('email worker started', { concurrency: config.WORKER_CONCURRENCY });
  return worker;
}
