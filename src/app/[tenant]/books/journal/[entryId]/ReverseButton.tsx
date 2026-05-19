"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc-client";

export function ReverseButton({
  entryId,
  tenantSlug,
}: {
  entryId: string;
  tenantSlug: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reverse = trpc.books.reverseJournalEntry.useMutation({
    onSuccess: (data) => {
      // Navigate to the new reversing entry
      router.push(`/${tenantSlug}/books/journal/${data.id}`);
      router.refresh();
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center rounded-md bg-amber-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-amber-700"
      >
        Reverse entry
      </button>
    );
  }

  return (
    <div className="w-80 rounded-lg border border-amber-200 bg-amber-50 p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-amber-900">Reverse this entry?</h3>
      <p className="mt-1 text-xs text-amber-800">
        A new opposite-signed entry will be posted on today&apos;s date. The
        original will be marked REVERSED.
      </p>
      <label className="mt-3 block">
        <span className="text-xs font-medium text-amber-900">Reason (optional)</span>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g., posted in error"
          className="mt-1 block w-full rounded-md border-amber-300 bg-white px-2 py-1.5 text-sm shadow-sm focus:border-amber-500 focus:ring-amber-500"
          maxLength={500}
        />
      </label>
      {error && (
        <p className="mt-2 text-xs text-rose-700">{error}</p>
      )}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={reverse.isPending}
          onClick={() => {
            setError(null);
            reverse.mutate({ entryId, reason: reason || undefined });
          }}
          className="inline-flex items-center rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-amber-700 disabled:opacity-50"
        >
          {reverse.isPending ? "Reversing…" : "Confirm reverse"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setReason("");
            setError(null);
          }}
          disabled={reverse.isPending}
          className="inline-flex items-center rounded-md bg-white px-3 py-1.5 text-xs font-medium text-amber-900 shadow-sm ring-1 ring-inset ring-amber-300 hover:bg-amber-100 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
