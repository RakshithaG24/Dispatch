import type { EmailItem } from "../api/types";
import { Badge, BadgeTone } from "./ui/Badge";

interface Presentation {
  label: string;
  tone: BadgeTone;
  title?: string;
}

/** Maps backend state to a label a person can act on. Kept in one place so both tables agree. */
export function describeStatus(email: EmailItem): Presentation {
  switch (email.status) {
    case "sent":
      return { label: "Sent", tone: "success" };
    case "failed":
      return { label: "Failed", tone: "danger", title: email.error ?? undefined };
    case "processing":
      return { label: "Sending", tone: "neutral" };
    case "scheduled":
      if (email.error) return { label: "Retrying", tone: "caution", title: email.error };
      if (email.deferReason === "hourly_limit") {
        return { label: "Deferred: hourly limit", tone: "caution", title: "The sender reached its hourly limit. This email moved to the next hour window." };
      }
      if (email.deferReason === "sender_spacing") {
        return { label: "Waiting for sender delay", tone: "neutral", title: "The sender must wait the minimum delay between emails." };
      }
      return { label: "Scheduled", tone: "neutral" };
  }
}

export function StatusBadge({ email }: { email: EmailItem }) {
  const { label, tone, title } = describeStatus(email);
  return (
    <Badge tone={tone} title={title}>
      {label}
    </Badge>
  );
}
