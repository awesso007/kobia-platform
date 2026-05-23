"use client";

import { useEffect } from "react";

export default function TenantError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[tenant-error]", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Something went wrong</h1>
        <p className="mt-2 text-sm text-slate-600">
          We hit an unexpected error loading this page. The team has been notified.
        </p>
        {error.digest && (
          <p className="mt-3 font-mono text-xs text-slate-400">Ref: {error.digest}</p>
        )}
        {/* DEBUG (remove before public launch) — surface error details so we can
            actually fix bugs without needing access to Vercel runtime logs. */}
        <pre className="mt-4 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-slate-900 p-3 text-[11px] text-slate-100">
          {error.name}: {error.message}
          {error.stack ? `\n\n${error.stack}` : ""}
        </pre>
        <div className="mt-6 flex gap-3">
          <button
            onClick={() => reset()}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Try again
          </button>
          <a
            href="/"
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}
