import { useCallback, useEffect, useRef, useState } from "react";

interface PollingState<T> {
  data: T | null;
  /** True only while the first response for the current inputs is pending. */
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Fetches immediately, then every `intervalMs`. Changing `deps` resets to the
 * loading state; background refreshes keep the previous data on screen so
 * tables do not flash. In-flight requests are aborted on change or unmount.
 */
export function usePolling<T>(fetcher: (signal: AbortSignal) => Promise<T>, deps: unknown[], intervalMs = 5000): PollingState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    let controller = new AbortController();
    let cancelled = false;

    const run = async (initial: boolean) => {
      controller.abort();
      controller = new AbortController();
      try {
        const result = await fetcherRef.current(controller.signal);
        if (cancelled) return;
        setData(result);
        setError(null);
      } catch (err) {
        if (cancelled || (err instanceof DOMException && err.name === "AbortError")) return;
        setError(err instanceof Error ? err.message : "Could not load data.");
      } finally {
        if (!cancelled && initial) setLoading(false);
      }
    };

    setLoading(true);
    void run(true);
    const id = window.setInterval(() => void run(false), intervalMs);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, intervalMs]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, error, reload };
}
