export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <span
      role="status"
      aria-label={label}
      className="inline-block h-4 w-4 rounded-full border-2 border-current border-t-transparent"
      style={{ animation: "spin 0.8s linear infinite" }}
    />
  );
}
