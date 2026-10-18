import { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes, useId } from "react";

interface FieldShellProps {
  label: string;
  hint?: string;
  error?: string;
  htmlFor: string;
  children: ReactNode;
}

function FieldShell({ label, hint, error, htmlFor, children }: FieldShellProps) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-msg`} className="mt-1 text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-msg`} className="mt-1 text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

const CONTROL = "w-full rounded border bg-surface px-3 py-2 text-sm placeholder:text-muted/70";
const border = (error?: string) => (error ? "border-danger" : "border-line");

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
}

export function Input({ label, hint, error, className = "", ...rest }: InputProps) {
  const id = useId();
  return (
    <FieldShell label={label} hint={hint} error={error} htmlFor={id}>
      <input id={id} aria-invalid={Boolean(error)} aria-describedby={`${id}-msg`} className={`${CONTROL} ${border(error)} ${className}`} {...rest} />
    </FieldShell>
  );
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  hint?: string;
  error?: string;
}

export function Textarea({ label, hint, error, className = "", ...rest }: TextareaProps) {
  const id = useId();
  return (
    <FieldShell label={label} hint={hint} error={error} htmlFor={id}>
      <textarea id={id} aria-invalid={Boolean(error)} aria-describedby={`${id}-msg`} className={`${CONTROL} ${border(error)} ${className}`} {...rest} />
    </FieldShell>
  );
}
