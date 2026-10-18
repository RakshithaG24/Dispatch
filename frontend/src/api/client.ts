import type { EmailCounts, EmailGroup, EmailPage, ScheduleInput, ScheduleResult, SlackStatus, User } from "./types";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      /* response had no JSON body */
    }
    throw new ApiError(res.status, message);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export const api = {
  me: () => request<User>("/api/auth/me"),
  logout: () => request<void>("/api/auth/logout", { method: "POST" }),

  listEmails: (p: { group: EmailGroup; page: number; pageSize: number; q: string }, signal?: AbortSignal) => {
    const qs = new URLSearchParams({ group: p.group, page: String(p.page), pageSize: String(p.pageSize), q: p.q });
    return request<EmailPage>(`/api/emails?${qs}`, { signal });
  },
  counts: (signal?: AbortSignal) => request<EmailCounts>("/api/emails/counts", { signal }),
  schedule: (input: ScheduleInput, idempotencyKey: string) =>
    request<ScheduleResult>("/api/emails/schedule", {
      method: "POST",
      body: JSON.stringify(input),
      headers: { "Idempotency-Key": idempotencyKey },
    }),

  slackStatus: () => request<SlackStatus>("/api/slack/status"),
  slackDisconnect: () => request<void>("/api/slack", { method: "DELETE" }),
  slackTest: () => request<{ delivered: boolean }>("/api/slack/test", { method: "POST" }),
};

export function errorText(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong.";
}
