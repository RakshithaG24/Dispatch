export type EmailStatus = 'scheduled' | 'processing' | 'sent' | 'failed';
export type DeferReason = 'hourly_limit' | 'sender_spacing';

export interface UserRow {
  id: string;
  google_id: string;
  email: string;
  name: string;
  avatar_url: string | null;
}

export interface SenderRow {
  id: string;
  email: string;
  display_name: string;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_pass: string;
}

export interface EmailRow {
  id: string;
  seq: string; // bigserial arrives as a string from pg
  batch_id: string;
  user_id: string;
  sender_id: string;
  recipient: string;
  subject: string;
  body: string;
  status: EmailStatus;
  scheduled_at: Date;
  processed_at: Date | null;
  attempts: number;
  error: string | null;
  message_id: string | null;
  preview_url: string | null;
  defer_reason: DeferReason | null;
  claimed_at: Date | null;
  hourly_limit: number;
  min_delay_ms: number;
}

/** Shape returned to the frontend and stored in Elasticsearch. */
export interface EmailDto {
  id: string;
  recipient: string;
  subject: string;
  status: EmailStatus;
  scheduledAt: string;
  processedAt: string | null;
  error: string | null;
  previewUrl: string | null;
  deferReason: DeferReason | null;
  senderEmail: string;
}

export type EmailGroup = 'scheduled' | 'sent';

export interface EmailJobData {
  emailId: string;
  /** Epoch ms of the rate-limiter slot reserved for this job. Absent until reserved. */
  slotAt?: number;
}
