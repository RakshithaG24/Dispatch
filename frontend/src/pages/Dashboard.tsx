import { useCallback, useEffect, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import type { EmailGroup } from "../api/types";
import { ComposeModal } from "../components/ComposeModal";
import { EmailList } from "../components/EmailList";
import { Layout } from "../components/Layout";
import { SlackPanel } from "../components/SlackPanel";
import { Button } from "../components/ui/Button";
import { Spinner } from "../components/ui/Spinner";
import { Tabs } from "../components/ui/Tabs";
import { useAuth } from "../hooks/useAuth";
import { useDebounce } from "../hooks/useDebounce";
import { usePolling } from "../hooks/usePolling";
import { useToast } from "../hooks/useToast";

export default function Dashboard() {
  const { user, loading } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [group, setGroup] = useState<EmailGroup>("scheduled");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [composeOpen, setComposeOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const query = useDebounce(search.trim(), 350);

  const { data: counts } = usePolling((signal) => api.counts(signal), [refreshKey]);

  // Slack redirects back here with ?slack=connected|denied|error.
  useEffect(() => {
    const result = params.get("slack");
    if (!result) return;
    if (result === "connected") toast.success("Slack connected. Rate limit alerts will be posted to your channel.");
    else if (result === "denied") toast.info("Slack connection was cancelled.");
    else toast.error("Slack could not be connected. Please try again.");
    params.delete("slack");
    setParams(params, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeGroup = (next: EmailGroup) => {
    setGroup(next);
    setPage(1);
  };
  const closeCompose = useCallback(() => setComposeOpen(false), []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (!user) return <Navigate to="/" replace />;

  return (
    <Layout>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Emails</h1>
        <Button onClick={() => setComposeOpen(true)}>Compose New Email</Button>
      </div>

      <SlackPanel />

      <div className="rounded-md border border-line bg-surface">
        <div className="flex flex-wrap items-end justify-between gap-4 px-4 pt-1">
          <Tabs
            tabs={[
              { key: "scheduled", label: "Scheduled Emails", count: counts?.scheduled },
              { key: "sent", label: "Sent Emails", count: counts?.sent },
            ]}
            active={group}
            onChange={changeGroup}
          />
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search recipient, subject or body"
            aria-label="Search emails in this tab"
            className="mb-2 w-full rounded border border-line bg-surface px-3 py-2 text-sm placeholder:text-muted/70 sm:w-72"
          />
        </div>
        <EmailList group={group} query={query} page={page} onPageChange={setPage} refreshKey={refreshKey} />
      </div>

      <ComposeModal open={composeOpen} onClose={closeCompose} onScheduled={() => setRefreshKey((k) => k + 1)} />
    </Layout>
  );
}
