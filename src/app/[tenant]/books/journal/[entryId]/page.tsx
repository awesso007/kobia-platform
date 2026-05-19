import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/accounting/ledger";
import { getActiveEntity } from "@/lib/active-entity";
import { ReverseButton } from "./ReverseButton";

export const dynamic = "force-dynamic";

export default async function JournalEntryDetailPage({
  params,
}: {
  params: { tenant: string; entryId: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const entity = await getActiveEntity({ tenantId: auth.tenant.id, tenantSlug: params.tenant });
  if (!entity) redirect(`/${params.tenant}/books`);

  const entry = await db.journalEntry.findFirst({
    where: {
      id: params.entryId,
      tenantId: auth.tenant.id,
      entityId: entity.id,
    },
    include: {
      lines: {
        include: {
          account: {
            select: { id: true, code: true, name: true, type: true },
          },
        },
        orderBy: { createdAt: "asc" },
      },
      reversedBy: {
        select: { id: true, entryNumber: true, entryDate: true, status: true },
      },
      reversalOf: {
        select: { id: true, entryNumber: true, entryDate: true, status: true },
      },
    },
  });

  if (!entry) notFound();

  const totalDebits = entry.lines.reduce((sum, l) => sum + l.debitCents, 0n);
  const totalCredits = entry.lines.reduce((sum, l) => sum + l.creditCents, 0n);
  const isBalanced = totalDebits === totalCredits;

  const statusBadge = (() => {
    switch (entry.status) {
      case "POSTED":
        return "bg-emerald-100 text-emerald-800 ring-emerald-600/20";
      case "REVERSED":
        return "bg-amber-100 text-amber-800 ring-amber-600/20";
      default:
        return "bg-slate-100 text-slate-800 ring-slate-600/20";
    }
  })();

  const canReverse = entry.status === "POSTED" && !entry.periodLocked;
  const canReversePerRole = ["OWNER", "ADMIN", "ACCOUNTANT"].includes(auth.role);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-4">
        <Link
          href={`/${params.tenant}/books/journal`}
          className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
        >
          ← Back to all journal entries
        </Link>
      </div>

      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-mono text-2xl font-semibold text-slate-900">
              JE #{entry.entryNumber}
            </h1>
            <span
              className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${statusBadge}`}
            >
              {entry.status}
            </span>
            {entry.periodLocked && (
              <span className="inline-flex items-center rounded-md bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700 ring-1 ring-inset ring-rose-600/20">
                Period locked
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {new Date(entry.entryDate).toLocaleDateString("en-US", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
            {" · "}
            <span className="capitalize">{entry.source.toLowerCase()}</span>
          </p>
        </div>

        {canReverse && canReversePerRole && (
          <ReverseButton entryId={entry.id} tenantSlug={params.tenant} />
        )}
      </div>

      <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <dl className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Description
            </dt>
            <dd className="mt-1 text-slate-900">{entry.description || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Memo
            </dt>
            <dd className="mt-1 text-slate-900">{entry.memo || "—"}</dd>
          </div>
          {entry.postedAt && (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Posted at
              </dt>
              <dd className="mt-1 text-slate-900">
                {new Date(entry.postedAt).toLocaleString()}
              </dd>
            </div>
          )}
          {entry.sourceRefId && (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Source reference
              </dt>
              <dd className="mt-1 font-mono text-xs text-slate-700">
                {entry.sourceRefId}
              </dd>
            </div>
          )}
        </dl>

        {(entry.reversedBy || entry.reversalOf) && (
          <div className="mt-4 border-t border-slate-100 pt-4 text-sm">
            {entry.reversedBy && (
              <p className="text-amber-700">
                This entry was reversed by{" "}
                <Link
                  href={`/${params.tenant}/books/journal/${entry.reversedBy.id}`}
                  className="font-mono font-medium underline hover:text-amber-900"
                >
                  JE #{entry.reversedBy.entryNumber}
                </Link>{" "}
                on{" "}
                {new Date(entry.reversedBy.entryDate).toLocaleDateString()}.
              </p>
            )}
            {entry.reversalOf && (
              <p className="text-slate-600">
                This is a reversal of{" "}
                <Link
                  href={`/${params.tenant}/books/journal/${entry.reversalOf.id}`}
                  className="font-mono font-medium underline hover:text-slate-900"
                >
                  JE #{entry.reversalOf.entryNumber}
                </Link>{" "}
                from{" "}
                {new Date(entry.reversalOf.entryDate).toLocaleDateString()}.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                Account
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                Memo
              </th>
              <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-slate-500">
                Debit
              </th>
              <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-slate-500">
                Credit
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {entry.lines.map((line) => (
              <tr key={line.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-sm">
                  <Link
                    href={`/${params.tenant}/books/accounts/${line.account.id}`}
                    className="font-medium text-indigo-600 hover:text-indigo-700"
                  >
                    <span className="font-mono text-xs text-slate-500">
                      {line.account.code}
                    </span>{" "}
                    {line.account.name}
                  </Link>
                  <p className="text-xs text-slate-400">{line.account.type}</p>
                </td>
                <td className="px-4 py-3 text-sm text-slate-600">
                  {line.memo || "—"}
                </td>
                <td className="px-4 py-3 text-right font-mono text-sm tabular-nums text-slate-900">
                  {line.debitCents > 0n ? formatCents(line.debitCents) : ""}
                </td>
                <td className="px-4 py-3 text-right font-mono text-sm tabular-nums text-slate-900">
                  {line.creditCents > 0n ? formatCents(line.creditCents) : ""}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-slate-50">
            <tr>
              <td colSpan={2} className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-slate-500">
                Totals
              </td>
              <td className="px-4 py-2.5 text-right font-mono text-sm font-semibold tabular-nums text-slate-900">
                {formatCents(totalDebits)}
              </td>
              <td className="px-4 py-2.5 text-right font-mono text-sm font-semibold tabular-nums text-slate-900">
                {formatCents(totalCredits)}
              </td>
            </tr>
            <tr>
              <td colSpan={4} className="px-4 py-2.5 text-right text-xs">
                {isBalanced ? (
                  <span className="text-emerald-700">✓ Balanced</span>
                ) : (
                  <span className="text-rose-700">
                    Out of balance by {formatCents(totalDebits - totalCredits)}
                  </span>
                )}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="mt-6 text-xs text-slate-400">
        Entry ID <code className="font-mono">{entry.id}</code>
      </div>
    </div>
  );
}
