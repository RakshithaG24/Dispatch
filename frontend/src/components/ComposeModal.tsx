import { ChangeEvent, useEffect, useRef, useState } from "react";
import { api, errorText } from "../api/client";
import { extractEmails, ParsedRecipients } from "../lib/emails";
import { pluralize, toLocalInputValue } from "../lib/format";
import { useToast } from "../hooks/useToast";
import { Button } from "./ui/Button";
import { Input, Textarea } from "./ui/Field";
import { Modal } from "./ui/Modal";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_RECIPIENTS = 10_000;

interface FormState {
  subject: string;
  body: string;
  startTime: string;
  delaySeconds: string;
  hourlyLimit: string;
}

type Errors = Partial<Record<keyof FormState | "recipients", string>>;

function initialState(): FormState {
  const start = new Date(Date.now() + 10 * 60 * 1000);
  return { subject: "", body: "", startTime: toLocalInputValue(start), delaySeconds: "5", hourlyLimit: "100" };
}

interface ComposeModalProps {
  open: boolean;
  onClose: () => void;
  onScheduled: () => void;
}

export function ComposeModal({ open, onClose, onScheduled }: ComposeModalProps) {
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<FormState>(initialState);
  const [recipients, setRecipients] = useState<ParsedRecipients | null>(null);
  const [fileName, setFileName] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  // One key per open dialog: if the request is retried, the server schedules it only once.
  const idempotencyKey = useRef(crypto.randomUUID());

  useEffect(() => {
    if (open) {
      setForm(initialState());
      setRecipients(null);
      setFileName("");
      setErrors({});
      idempotencyKey.current = crypto.randomUUID();
    }
  }, [open]);

  const set = (key: keyof FormState) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setErrors((prev) => ({ ...prev, recipients: "File is larger than 5 MB." }));
      return;
    }
    const parsed = extractEmails(await file.text());
    setFileName(file.name);
    setRecipients(parsed);
    setErrors((prev) => ({
      ...prev,
      recipients: parsed.emails.length === 0 ? "No email addresses were found in this file." : parsed.emails.length > MAX_RECIPIENTS ? `A batch can hold at most ${MAX_RECIPIENTS.toLocaleString()} recipients.` : undefined,
    }));
  };

  const validate = (): Errors => {
    const next: Errors = {};
    if (!form.subject.trim()) next.subject = "Enter a subject.";
    if (!form.body.trim()) next.body = "Enter the email body.";
    if (!recipients || recipients.emails.length === 0) next.recipients = "Upload a CSV or text file with recipient addresses.";
    else if (recipients.emails.length > MAX_RECIPIENTS) next.recipients = `A batch can hold at most ${MAX_RECIPIENTS.toLocaleString()} recipients.`;
    if (!form.startTime || Number.isNaN(new Date(form.startTime).getTime())) next.startTime = "Choose a start time.";
    const delay = Number(form.delaySeconds);
    if (!Number.isInteger(delay) || delay < 0) next.delaySeconds = "Enter a whole number of seconds, 0 or more.";
    const limit = Number(form.hourlyLimit);
    if (!Number.isInteger(limit) || limit < 1) next.hourlyLimit = "Enter a whole number, 1 or more.";
    return next;
  };

  const submit = async () => {
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0 || !recipients) return;

    setSubmitting(true);
    try {
      const result = await api.schedule(
        {
          subject: form.subject.trim(),
          body: form.body.trim(),
          recipients: recipients.emails,
          startTime: new Date(form.startTime).toISOString(),
          delaySeconds: Number(form.delaySeconds),
          hourlyLimit: Number(form.hourlyLimit),
        },
        idempotencyKey.current,
      );
      toast.success(`${pluralize(result.scheduled, "email")} scheduled.`);
      if (result.effectiveHourlyLimit < Number(form.hourlyLimit)) {
        toast.info(`The server caps each sender at ${result.effectiveHourlyLimit} emails per hour, so that limit was applied.`);
      }
      if (result.effectiveDelaySeconds > Number(form.delaySeconds)) {
        toast.info(`The server minimum delay is ${result.effectiveDelaySeconds} seconds, so that delay was applied.`);
      }
      onScheduled();
      onClose();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Compose new email"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button loading={submitting} onClick={() => void submit()}>
            Schedule
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input label="Subject" value={form.subject} onChange={set("subject")} error={errors.subject} maxLength={250} />
        <Textarea label="Body" rows={6} value={form.body} onChange={set("body")} error={errors.body} />

        <div>
          <p className="mb-1 text-sm font-medium">Recipients</p>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" onClick={() => fileInput.current?.click()}>
              Upload CSV or text file
            </Button>
            <input ref={fileInput} type="file" accept=".csv,.txt,text/csv,text/plain" className="sr-only" aria-label="Recipient file" onChange={(e) => void onFile(e)} />
            {fileName && <span className="font-mono text-xs text-muted">{fileName}</span>}
          </div>
          <p className="mt-2 text-sm" aria-live="polite">
            {errors.recipients ? (
              <span className="text-danger">{errors.recipients}</span>
            ) : recipients ? (
              <span>
                <strong>{pluralize(recipients.emails.length, "email address", "email addresses")}</strong> detected
                {recipients.duplicatesRemoved > 0 && <span className="text-muted">, {pluralize(recipients.duplicatesRemoved, "duplicate")} removed</span>}.
              </span>
            ) : (
              <span className="text-muted">One address per line, or any CSV. Addresses are found automatically.</span>
            )}
          </p>
        </div>

        <Input label="Start time" type="datetime-local" value={form.startTime} onChange={set("startTime")} error={errors.startTime} hint="Your local time. A time in the past starts immediately." />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Delay between emails (seconds)" type="number" min={0} step={1} inputMode="numeric" value={form.delaySeconds} onChange={set("delaySeconds")} error={errors.delaySeconds} />
          <Input label="Hourly limit per sender" type="number" min={1} step={1} inputMode="numeric" value={form.hourlyLimit} onChange={set("hourlyLimit")} error={errors.hourlyLimit} hint="Extra emails move to the next hour." />
        </div>
      </div>
    </Modal>
  );
}
