"use client";

/*
 * Public knowledge-base client widgets (Sprint 15). Only the feedback voter is
 * interactive; everything else on the public KB renders server-side. Tenant is
 * passed in from the page (resolved server-side from `?t=`).
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useState } from "react";

export function ArticleFeedback({ tenant, articleId }: { tenant: string; articleId: string }) {
  const [done, setDone] = useState<null | boolean>(null);
  const [busy, setBusy] = useState(false);

  async function vote(helpful: boolean) {
    if (busy || done !== null) return;
    setBusy(true);
    try {
      await fetch(`/api/kb/${articleId}/feedback?t=${encodeURIComponent(tenant)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ helpful }),
      });
      setDone(helpful);
    } finally {
      setBusy(false);
    }
  }

  if (done !== null) {
    return <p className="text-sm text-slate-500">Thanks for your feedback.</p>;
  }
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-slate-600">Was this helpful?</span>
      <button
        disabled={busy}
        onClick={() => vote(true)}
        className="rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50 disabled:opacity-50"
      >
        Yes
      </button>
      <button
        disabled={busy}
        onClick={() => vote(false)}
        className="rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50 disabled:opacity-50"
      >
        No
      </button>
    </div>
  );
}
