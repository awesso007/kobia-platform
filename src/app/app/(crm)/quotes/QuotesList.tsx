"use client";

/*
 * Quotes list: status filter, search box, paginated table linking to the
 * builder. Status filter + search push into the URL query so the server page
 * re-queries.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { StatusBadge } from "@/components/crm/ui";
import type { QuoteListResult } from "./queries";

const STATUSES = ["DRAFT", "SENT", "VIEWED", "ACCEPTED", "DECLINED", "EXPIRED"];

function money(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format(cents / 100);
}

export function QuotesList({ result, status, q }: { result: QuoteListResult; status: string; q: string }) {
  const router = useRouter();
  const [search, setSearch] = useState(q);

  function applyStatus(s: string) {
    const params = new URLSearchParams();
    if (s) params.set("status", s);
    if (search) params.set("q", search);
    router.push(`/app/quotes${params.toString() ? `?${params}` : ""}`);
  }

  function applySearch() {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (search.trim()) params.set("q", search.trim());
    router.push(`/app/quotes${params.toString() ? `?${params}` : ""}`);
  }

  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));

  function gotoPage(p: number) {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (q) params.set("q", q);
    params.set("page", String(p));
    router.push(`/app/quotes?${params}`);
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select value={status} onChange={(e) => applyStatus(e.target.value)} className="rounded px-2 py-1.5 text-sm outline-none" style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)" }}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") applySearch(); }}
          placeholder="Search number or title..."
          className="rounded px-3 py-1.5 text-sm outline-none"
          style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)", minWidth: 240 }}
        />
      </div>

      <div style={{ backgroundColor: "var(--kb-surface)", border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius)", boxShadow: "var(--kb-shadow-card)", overflow: "hidden" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ color: "var(--kb-text-secondary)", borderBottom: "1px solid var(--kb-border)" }}>
              <th className="px-3 py-2 text-left font-medium" style={{ width: 130 }}>Number</th>
              <th className="px-3 py-2 text-left font-medium">Title</th>
              <th className="px-3 py-2 text-left font-medium" style={{ width: 160 }}>Contact</th>
              <th className="px-3 py-2 text-left font-medium" style={{ width: 110 }}>Status</th>
              <th className="px-3 py-2 text-right font-medium" style={{ width: 120 }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.length === 0 ? (
              <tr><td colSpan={5} className="p-8 text-center" style={{ color: "var(--kb-text-secondary)" }}>No quotes found.</td></tr>
            ) : (
              result.rows.map((row) => (
                <tr key={row.id} className="cursor-pointer hover:bg-[var(--kb-surface-grey)]" onClick={() => router.push(`/app/quotes/${row.id}`)} style={{ borderTop: "1px solid var(--kb-border)" }}>
                  <td className="px-3 py-2" style={{ fontFamily: "monospace", color: "var(--kb-text-secondary)" }}>{row.number}</td>
                  <td className="px-3 py-2" style={{ color: "var(--kb-text-primary)" }}>{row.title}</td>
                  <td className="px-3 py-2" style={{ color: "var(--kb-text-secondary)" }}>{row.contactName ?? "-"}</td>
                  <td className="px-3 py-2"><StatusBadge value={row.status} /></td>
                  <td className="px-3 py-2 text-right" style={{ color: "var(--kb-primary)", fontWeight: 500 }}>{money(row.totalCents, row.currency)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 ? (
        <div className="mt-3 flex items-center justify-end gap-2 text-sm">
          <button type="button" disabled={result.page <= 1} onClick={() => gotoPage(result.page - 1)} style={{ color: result.page <= 1 ? "var(--kb-border)" : "var(--kb-text-secondary)" }}>Previous</button>
          <span style={{ color: "var(--kb-text-secondary)" }}>Page {result.page} of {totalPages}</span>
          <button type="button" disabled={result.page >= totalPages} onClick={() => gotoPage(result.page + 1)} style={{ color: result.page >= totalPages ? "var(--kb-border)" : "var(--kb-text-secondary)" }}>Next</button>
        </div>
      ) : null}

      <Link href="/app/quotes" className="sr-only">Quotes</Link>
    </div>
  );
}
