import { useEffect, useState } from "react";
import { api, errorText } from "../api/client";
import type { SlackStatus } from "../api/types";
import { useToast } from "../hooks/useToast";
import { Button } from "./ui/Button";

export function SlackPanel() {
  const toast = useToast();
  const [status, setStatus] = useState<SlackStatus | null>(null);
  const [busy, setBusy] = useState<"test" | "disconnect" | null>(null);

  useEffect(() => {
    api.slackStatus().then(setStatus).catch((err) => toast.error(errorText(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!status) return null;

  const sendTest = async () => {
    setBusy("test");
    try {
      await api.slackTest();
      toast.success("Test message sent to Slack.");
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async () => {
    setBusy("disconnect");
    try {
      await api.slackDisconnect();
      setStatus({ ...status, connected: false, channel: null, team: null });
      toast.info("Slack disconnected. Rate limit alerts will no longer be sent.");
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section aria-label="Slack notifications" className="mb-6 flex flex-col gap-3 rounded-md border border-line bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm">
        <p className="font-medium">Slack alerts for hourly limits</p>
        <p className="text-muted">
          {status.connected
            ? `Connected to ${status.channel ?? "a channel"}${status.team ? ` in ${status.team}` : ""}. A message is posted when a sender reaches its hourly limit.`
            : status.configured
              ? "Not connected. Hourly limit events will not notify anyone until you connect."
              : "Slack is not configured on this server. Add SLACK_CLIENT_ID and SLACK_CLIENT_SECRET to enable it."}
        </p>
      </div>
      <div className="flex gap-2">
        {status.connected ? (
          <>
            <Button variant="secondary" loading={busy === "test"} onClick={() => void sendTest()}>
              Send test message
            </Button>
            <Button variant="danger" loading={busy === "disconnect"} onClick={() => void disconnect()}>
              Disconnect
            </Button>
          </>
        ) : (
          <Button disabled={!status.configured} onClick={() => window.location.assign("/api/slack/connect")}>
            Connect Slack
          </Button>
        )}
      </div>
    </section>
  );
}
