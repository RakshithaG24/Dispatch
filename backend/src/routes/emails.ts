import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { listSchema, scheduleSchema } from '../schemas';
import { countEmails, listEmails, scheduleBatch } from '../services/emails';

export const emailsRouter = Router();
emailsRouter.use(requireAuth);

/**
 * POST /api/emails/schedule
 * Optional header "Idempotency-Key": repeating a request with the same key
 * returns the original batch instead of scheduling a second set of emails.
 */
emailsRouter.post('/schedule', async (req, res, next) => {
  try {
    const body = scheduleSchema.parse(req.body);
    const key = req.header('Idempotency-Key')?.slice(0, 200) ?? null;
    const result = await scheduleBatch({
      userId: req.user!.id,
      idempotencyKey: key,
      subject: body.subject,
      body: body.body,
      recipients: body.recipients,
      startTime: new Date(body.startTime),
      delaySeconds: body.delaySeconds,
      hourlyLimit: body.hourlyLimit,
    });
    res.status(result.duplicate ? 200 : 202).json(result);
  } catch (err) {
    next(err);
  }
});

emailsRouter.get('/counts', async (req, res, next) => {
  try {
    res.json(await countEmails(req.user!.id));
  } catch (err) {
    next(err);
  }
});

/** GET /api/emails?group=scheduled|sent&page=1&pageSize=25&q=search */
emailsRouter.get('/', async (req, res, next) => {
  try {
    const params = listSchema.parse(req.query);
    const result = await listEmails({ userId: req.user!.id, group: params.group, page: params.page, pageSize: params.pageSize, text: params.q });
    res.json({ ...result, page: params.page, pageSize: params.pageSize });
  } catch (err) {
    next(err);
  }
});
