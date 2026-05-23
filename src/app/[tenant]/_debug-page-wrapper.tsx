/**
 * Server-side error capture wrapper.
 * Wraps a page render in try/catch so the actual error message is rendered
 * in the page body instead of being hidden by Next's error boundary.
 *
 * DELETE before public launch — this leaks stack traces to clients.
 */
import type { ReactNode } from "react";

export async function withDebugCapture<T>(
  label: string,
  fn: () => Promise<T> | T,
): Promise<{ ok: true; value: T } | { ok: false; node: ReactNode }> {
  try {
    return { ok: true, value: await fn() };
  } catch (err) {
    const e = err as Error;
    return {
      ok: false,
      node: (
        <div className="m-6 max-w-3xl rounded-lg border border-rose-300 bg-rose-50 p-4">
          <h2 className="font-mono text-sm font-bold text-rose-800">
            DEBUG: error in {label}
          </h2>
          <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded bg-slate-900 p-3 text-[11px] text-slate-100">
            {e?.name}: {e?.message}
            {e?.stack ? `\n\n${e.stack}` : ""}
          </pre>
        </div>
      ),
    };
  }
}
