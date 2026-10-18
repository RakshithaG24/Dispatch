import { ButtonHTMLAttributes } from "react";
import { Spinner } from "./Spinner";

type Variant = "primary" | "secondary" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
}

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-white hover:bg-accent-dark disabled:bg-accent/50",
  secondary: "bg-surface text-ink ring-1 ring-inset ring-line hover:bg-paper disabled:text-muted",
  danger: "bg-surface text-danger ring-1 ring-inset ring-danger/40 hover:bg-danger-tint disabled:opacity-60",
};

export function Button({ variant = "primary", loading = false, disabled, className = "", children, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}
