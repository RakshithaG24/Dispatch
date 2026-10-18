export type BadgeTone = "neutral" | "success" | "danger" | "caution";

const TONES: Record<BadgeTone, string> = {
  neutral: "bg-paper text-muted border-line",
  success: "bg-accent-tint text-accent-dark border-accent/30",
  danger: "bg-danger-tint text-danger border-danger/30",
  caution: "bg-caution-tint text-caution border-caution/30",
};

export function Badge({ tone = "neutral", children, title }: { tone?: BadgeTone; children: string; title?: string }) {
  return (
    <span title={title} className={`inline-block rounded-sm border px-2 py-0.5 text-xs font-medium ${TONES[tone]}`}>
      {children}
    </span>
  );
}
