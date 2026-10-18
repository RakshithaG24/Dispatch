import { Link, Navigate, useSearchParams } from "react-router-dom";
import { Layout } from "../components/Layout";
import { Spinner } from "../components/ui/Spinner";
import { useAuth } from "../hooks/useAuth";
import { site } from "../config/site";

const LOGIN_ERRORS: Record<string, string> = {
  google_denied: "Google sign-in was cancelled. You can try again when you are ready.",
  google_not_configured: "Google sign-in is not configured on this server yet.",
};

const STEPS = [
  "Upload a CSV or text file of recipients and write the subject and body.",
  "Choose a start time, the delay between emails and an hourly limit per sender.",
  "Dispatch queues each message. Sends continue on schedule even if the server restarts.",
];

export default function Login() {
  const { user, loading } = useAuth();
  const [params] = useSearchParams();
  const error = LOGIN_ERRORS[params.get("error") ?? ""];

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (user) return <Navigate to="/dashboard" replace />;

  return (
    <Layout>
      <div className="grid gap-12 py-8 md:grid-cols-2 md:py-16">
        <div>
          <h1 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">Schedule bulk email and control how fast it goes out.</h1>
          <p className="mt-5 max-w-prose text-base leading-relaxed text-muted">
            {site.product} sends each message at its scheduled time, spaces sends per sender account, and holds back anything over your hourly limit until the next hour instead of dropping it.
          </p>
          <div className="mt-8">
            <a
              href="/api/auth/google"
              className="inline-flex items-center rounded bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-dark"
            >
              Continue with Google
            </a>
            {error && (
              <p role="alert" className="mt-4 text-sm text-danger">
                {error}
              </p>
            )}
            <p className="mt-4 text-sm text-muted">
              By signing in you agree to the{" "}
              <Link to="/terms" className="underline underline-offset-2 hover:text-ink">
                Terms and Conditions
              </Link>{" "}
              and the{" "}
              <Link to="/privacy" className="underline underline-offset-2 hover:text-ink">
                Privacy Policy
              </Link>
              .
            </p>
          </div>
        </div>

        <section aria-labelledby="how" className="rounded-md border border-line bg-surface p-6">
          <h2 id="how" className="text-sm font-semibold uppercase tracking-wide text-muted">
            How it works
          </h2>
          <ol className="mt-4 space-y-4">
            {STEPS.map((step, i) => (
              <li key={step} className="flex gap-4">
                <span className="font-mono text-sm text-accent">{String(i + 1).padStart(2, "0")}</span>
                <span className="text-sm leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
          <p className="mt-6 border-t border-line pt-4 text-sm text-muted">
            Messages are delivered through Ethereal test mailboxes, so nothing reaches real inboxes. Each sent message links to a preview.
          </p>
        </section>
      </div>
    </Layout>
  );
}
