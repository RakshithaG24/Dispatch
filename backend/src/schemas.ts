import { z } from 'zod';

export const scheduleSchema = z.object({
  subject: z.string().trim().min(1, 'Subject is required').max(250),
  body: z.string().trim().min(1, 'Body is required').max(100_000),
  recipients: z.array(z.string().trim().email('Contains an invalid email address')).min(1, 'Add at least one recipient').max(10_000),
  startTime: z.string().datetime({ offset: true, message: 'startTime must be an ISO 8601 timestamp' }),
  delaySeconds: z.number().int().min(0).max(86_400),
  hourlyLimit: z.number().int().min(1).max(100_000),
});

export const listSchema = z.object({
  group: z.enum(['scheduled', 'sent']),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().max(200).default(''),
});
