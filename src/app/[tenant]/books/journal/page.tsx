import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/accounting/ledger";
import { getActiveEntity } from "@/lib/active-entity";
import type { Prisma } from "@prisma/client";

/**
 * Journal entry list / search.
 * Query params: ?q=search, ?status=POSTED|REVERSED|ALL, ?start=YYYY-MM-DD, ?end=...
 * Default: last 90 days, all statuses.
 */
export default async function JournalListPage({
  params,
  searchParams,
}: {
  params: { tenant: string };
  searchParams: { q?: string; status?: string; start?: string; end?: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const entity = await getActiveEntity({ tenantId: auth.tenant.id, tenantSlug: params.tenant });
  if (!entity) redirect(`/${params.tenant}/books`);

  const now = new Date();
  const defaultStart = new Date(now);
  defaultStart.setDate(defaultStart.getDate() - 90);
  const startDate = searchParams.start ? new Date(searchParams.start) : defaultStart;
  const endDate = searchParams.end ? new Date(searchParams.end) : now;
  const q = (searchParams.q ?? "").trim();
  const statusFilter = (searchParams.status ?? "ALL").toUpperCase();

  const where: Prisma.JournalEntryWhereInput = {
    entityId: entity.id,
    tenantId: auth.tenant.id,
    entryDate: { gte: startDate, lte: endDate },
  };
  if (statusFilter === "POSTED" || statusFilter === "REVERSED" || statusFilter === "DRAFT") {
    where.status = statusFilter;
  }
  if (q) {
    where.OR = [
      { description: { contains: q, mode: "insensitive" } },
      { memo: { contains: q, mode: "insensitive" } },
    ];
  }

  const entries = await db.journalEntry.findMany({
    where,
    orderBy: [{ entryDate: "desc" }, { entryNumber: "desc" }],
    take: 200,
    include: {
      _count: { select: { lines: true } },
      lines: {
        select: { debitCents: true, creditCents: true },
      },
    },
  });

  const rows = entries.map((e) => {
    const totalDebit = e.lines.reduce((s, l) => s + l.debitCents, 0n);
    return {
      id: e.id,
      entryNumber: e.entryNumber,
      entryDate: e.entryDate,
      description: e.description,
      memo: e.memo,
      source: e.source,
      status: e.status,
      lineCount: e._count.lines,
      total: totalDebit, // for a balanced JE, total debit = total credit = "size"
    };
  });

  const isoStart = startDate.toISOString().slice(0, 10);
  const isoEnd = endDate.toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Link href={`/${params.tenant}/books`} className="hover:text-slate-700">
              Books
            </Link>
            <span>›</span>
            <span>Journal</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Journal Entries</h1>
          <p className="mt-1 text-sm text-slate-600">
            {entity.name} · {isoStart} to {isoEnd}
          </p>
        </div>
        <Link
          href={`/${params.tenant}/books/journal/new`}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          New Journal Entry
        </Link>
      </div>

      <form className="mt-6 grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_auto_auto_auto_auto]">
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider text-slate-500">Search</label>
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Description or memo..."
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider text-slate-500">Status</label>
          <select
            name="status"
            defaultValue={statusFilter}
            className="mt-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm"
          >
            <option value="ALL">All</option>
            <option value="POSTED">Posted</option>
            <option value="REVERSED">Reversed</option>
            <option value="DRAFT">Draft</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider text-slate-500">Start</label>
          <input
            type="date"
            name="start"
            defaultValue={isoStart}
            className="mt-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider text-slate-500">End</label>
          <input
            type="date"
            name="end"
            defaultValue={isoEnd}
            className="mt-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm"
          />
        </div>
        <div className="flex items-end">
          <button
            type="submit"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Filter
          </button>
        </div>
      </form>

      <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
              <th className="px-4 py-2 font-medium">JE #</th>
              <th className="px-4 py-2 font-medium">Date</th>
              <th className="px-4 py-2 font-medium">Description</th>
              <th className="px-4 py-2 font-medium">Source</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 text-right font-medium">Lines</th>
              <th className="px-4 py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-400">
                  No journal entries match these filters.
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const href = `/${params.tenant}/books/journal/${r.id}`;
              return (
                <tr
                  key={r.id}
                  className={`cursor-pointer hover:bg-blue-50 ${r.status === "REVERSED" ? "bg-amber-50/40" : ""}`}
                >
                  <td className="px-4 py-2 font-mono text-xs text-slate-500">
                    <Link href={href} className="block">#{r.entryNumber}</Link>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-slate-500">
                    <Link href={href} className="block">{r.entryDate.toISOString().slice(0, 10)}</Link>
                  </td>
                  <td className="px-4 py-2 text-slate-900">
                    <Link href={href} className="block">
                      {r.description}
                      {r.memo && <span className="ml-2 text-xs text-slate-500">— {r.memo}</span>}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-[10px] uppercase tracking-wider text-slate-500">
                    <Link href={href} className="block">{r.source}</Link>
                  </td>
                  <td className="px-4 py-2">
                    <Link href={href} className="block"><StatusBadge status={r.status} /></Link>
                  </td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums text-xs text-slate-500">
                    <Link href={href} className="block">{r.lineCount}</Link>
                  </td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums text-slate-900">
                    <Link href={href} className="block">{formatCents(r.total)}</Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-slate-400">
        Showing up to 200 entries. {rows.length} match{rows.length === 1 ? "" : "es"}.
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    POSTED: "bg-green-50 text-green-700",
    REVERSED: "bg-amber-100 text-amber-800",
    DRAFT: "bg-slate-100 text-slate-600",
  };
  const cls = styles[status] ?? "bg-slate-100 text-slate-600";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${cls}`}>
      {status}
    </span>
  );
}
