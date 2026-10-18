export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}

export type EmailStatus = "scheduled" | "processing" | "sent" | "failed";
export type DeferReason = "hourly_limit" | "sender_spacing";
export type EmailGroup = "scheduled" | "sent";

export interface EmailItem {
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

export interface EmailPage {
  items: EmailItem[];
  total: number;
  page: number;
  pageSize: number;
  searchEngine: "postgres" | "elasticsearch";
}

export interface EmailCounts {
  scheduled: number;
  sent: number;
}

export interface ScheduleInput {
  subject: string;
  body: string;
  recipients: string[];
  startTime: string;
  delaySeconds: number;
  hourlyLimit: number;
}

export interface ScheduleResult {
  batchId: string;
  scheduled: number;
  duplicate: boolean;
  effectiveHourlyLimit: number;
  effectiveDelaySeconds: number;
}

export interface SlackStatus {
  configured: boolean;
  connected: boolean;
  channel: string | null;
  team: string | null;
}
