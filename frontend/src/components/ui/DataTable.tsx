import { ReactNode } from "react";
import { Spinner } from "./Spinner";

export interface Column<T> {
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading: boolean;
  error?: string | null;
  emptyTitle: string;
  emptyBody: string;
}

export function DataTable<T>({ columns, rows, rowKey, loading, error, emptyTitle, emptyBody }: DataTableProps<T>) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 px-6 py-16 text-sm text-muted">
        <Spinner /> Loading emails
      </div>
    );
  }
  if (error && rows.length === 0) {
    return (
      <div className="px-6 py-16 text-center">
        <p className="font-medium text-danger">Could not load emails</p>
        <p className="mt-1 text-sm text-muted">{error}</p>
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="px-6 py-16 text-center">
        <p className="font-medium">{emptyTitle}</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted">{emptyBody}</p>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
            {columns.map((c) => (
              <th key={c.header} scope="col" className="px-4 py-3 font-medium">
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="border-b border-line last:border-0 hover:bg-paper/60">
              {columns.map((c) => (
                <td key={c.header} className={`px-4 py-3 align-top ${c.className ?? ""}`}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
