"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc-client";

type Props = {
  tenantSlug: string;
  bankAccountId: string;
};

const EXAMPLE_CSV = `Date,Description,Amount
2026-05-01,Opening Deposit,5000.00
2026-05-03,Adobe Creative Cloud,-89.99
2026-05-10,ACME Inc Payment,1500.00
2026-05-15,Office Rent,-2500.00`;

export function ImportCsvForm({ tenantSlug, bankAccountId }: Props) {
  const router = useRouter();
  const [csv, setCsv] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    imported: number;
    skipped: number;
    autoCategorized: number;
  } | null>(null);

  const importMut = trpc.bank.importCsv.useMutation({
    onSuccess: (r) => {
      setError(null);
      setResult({
        imported: r.imported,
        skipped: r.skipped,
        autoCategorized: r.autoCategorized,
      });
      setCsv("");
      router.refresh();
    },
    onError: (e) => {
      setError(e.message);
      setResult(null);
    },
  });

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      setCsv(text);
    };
    reader.readAsText(file);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!csv.trim()) {
      setError("Paste or upload a CSV first.");
      return;
    }
    importMut.mutate({ bankAccountId, csv });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-4 space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
    >
      <label className="block">
        <span className="text-sm font-medium text-slate-700">Upload CSV file</span>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={handleFile}
          className="mt-1 block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100"
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">Or paste CSV</span>
        <textarea
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          rows={12}
          placeholder={EXAMPLE_CSV}
          className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 font-mono text-xs shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
        />
      </label>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {result && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          <p className="font-medium">Import complete.</p>
          <ul className="mt-1 list-inside list-disc text-xs">
            <li>{result.imported} new transactions added</li>
            {result.skipped > 0 && <li>{result.skipped} duplicates skipped</li>}
            {result.autoCategorized > 0 && (
              <li>{result.autoCategorized} auto-categorized by rules</li>
            )}
          </ul>
          <a
            href={`/${tenantSlug}/bank/${bankAccountId}`}
            className="mt-2 inline-block text-xs font-medium text-emerald-800 underline"
          >
            Go to workspace →
          </a>
        </div>
      )}

      <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
        <a
          href={`/${tenantSlug}/bank/${bankAccountId}`}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </a>
        <button
          type="submit"
          disabled={importMut.isPending}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {importMut.isPending ? "Importing..." : "Import transactions"}
        </button>
      </div>
    </form>
  );
}
