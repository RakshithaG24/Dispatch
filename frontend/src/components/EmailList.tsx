import { api } from "../api/client";
import type { EmailGroup, EmailItem } from "../api/types";
import { formatDateTime } from "../lib/format";
import { usePolling } from "../hooks/usePolling";
import { StatusBadge } from "./StatusBadge";
import { Column, DataTable } from "./ui/DataTable";
import { Pagination } from "./ui/Pagination";

const PAGE_SIZE = 25;

const recipientColumn: Column<EmailItem> = {
  header: "Email",
  render: (e) => <span className="font-medium">{e.recipient}</span>,
};
const subjectColumn: Column<EmailItem> = {
  header: "Subject",
  render: (e) => <span className="line-clamp-2 break-words">{e.subject}</span>,
  className: "max-w-xs",
};
const timeCell = (iso: string | null) => <span className="whitespace-nowrap font-mono text-xs">{formatDateTime(iso)}</span>;

const COLUMNS: Record<EmailGroup, Column<EmailItem>[]> = {
  scheduled: [
    recipientColumn,
    subjectColumn,
    { header: "Scheduled time", render: (e) => timeCell(e.scheduledAt) },
    { header: "Status", render: (e) => <StatusBadge email={e} /> },
  ],
  sent: [
    recipientColumn,
    subjectColumn,
    { header: "Sent time", render: (e) => timeCell(e.processedAt) },
    {
      header: "Status",
      render: (e) => (
        <div className="space-y-1">
          <StatusBadge email={e} />
          {e.status === "failed" && e.error && <p className="max-w-[16rem] break-words text-xs text-muted">{e.error}</p>}
        </div>
      ),
    },
    {
      header: "Message",
      render: (e) =>
        e.previewUrl ? (
          <a href={e.previewUrl} target="_blank" rel="noreferrer" className="text-accent underline underline-offset-2 hover:text-accent-dark">
            View in Ethereal
          </a>
        ) : (
          <span className="text-muted">None</span>
        ),
    },
  ],
};

const EMPTY: Record<EmailGroup, { title: string; body: string }> = {
  scheduled: { title: "No scheduled emails", body: "Use Compose New Email to upload a list of recipients and pick a start time." },
  sent: { title: "No sent emails yet", body: "Emails appear here once the worker has sent them, or after a send fails." },
};

interface EmailListProps {
  group: EmailGroup;
  query: string;
  page: number;
  onPageChange: (page: number) => void;
  refreshKey: number;
}

export function EmailList({ group, query, page, onPageChange, refreshKey }: EmailListProps) {
  const { data, loading, error } = usePolling((signal) => api.listEmails({ group, page, pageSize: PAGE_SIZE, q: query }, signal), [group, page, query, refreshKey]);

  const emptyCopy = query ? { title: "No matches", body: `Nothing in this tab matches "${query}".` } : EMPTY[group];

  return (
    <div>
      {error && data && <p className="border-b border-line bg-danger-tint px-4 py-2 text-sm text-danger">Refresh failed: {error}. Showing the last loaded data.</p>}
      <DataTable
        columns={COLUMNS[group]}
        rows={data?.items ?? []}
        rowKey={(e) => e.id}
        loading={loading}
        error={error}
        emptyTitle={emptyCopy.title}
        emptyBody={emptyCopy.body}
      />
      {data && <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onChange={onPageChange} />}
    </div>
  );
}
