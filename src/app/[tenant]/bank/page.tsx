import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { getActiveEntity } from "@/lib/active-entity";
import { formatCents } from "@/lib/accounting/ledger";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<string, string> = {
  CHECKING: "Checking",
  SAVINGS: "Savings",
  CREDIT_CARD: "Credit Card",
  MONEY_MARKET: "Money Market",
  LOAN: "Loan",
  OTHER: "Other",
};

export default async function BankAccountsPage({
  params,
}: {
  params: { tenant: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const entity = await getActiveEntity({ tenantId: auth.tenant.id, tenantSlug: params.tenant });
  if (!entity) redirect(`/${params.tenant}/books`);

  const accounts = await db.bankAccount.findMany({
    where: { tenantId: auth.tenant.id, entityId: entity.id },
    include: {
      glAccount: { select: { id: true, code: true, name: true, balanceCents: true } },
      _count: { select: { transactions: true } },
    },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });

  const rows = await Promise.all(
    accounts.map(async (a) => {
      const unmatchedCount = await db.bankTransaction.count({
        where: { bankAccountId: a.id, status: "UNMATCHED" },
      });
      const lastTxn = await db.bankTransaction.findFirst({
        where: { bankAccountId: a.id },
        orderBy: { postedDate: "desc" },
        select: { postedDate: true },
      });
      const lastRecon = await db.reconciliationSession.findFirst({
        where: { bankAccountId: a.id, status: "COMPLETED" },
        orderBy: { statementEndDate: "desc" },
        select: { statementEndDate: true },
      });
      return {
        id: a.id,
        name: a.name,
        institution: a.institution,
        last4: a.accountLast4,
        type: a.accountType,
        isActive: a.isActive,
        glCode: a.glAccount.code,
        glName: a.glAccount.name,
        glBalance: a.glAccount.balanceCents,
        txnCount: a._count.transactions,
        unmatchedCount,
        lastTxnDate: lastTxn?.postedDate ?? null,
        lastReconDate: lastRecon?.statementEndDate ?? null,
      };
    })
  );

  const totalUnmatched = rows.reduce((s, r) => s + r.unmatchedCount, 0);
  const totalBalance = rows.reduce((s, r) => s + r.glBalance, 0n);

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-4 text-sm text-slate-500">
        <Link href={`/${params.tenant}/books`} className="hover:text-slate-700">
          ← Back to books
        </Link>
      </div>

      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Bank & Reconcile</h1>
          <p className="mt-1 text-sm text-slate-500">
            {entity.name} · {rows.length} account{rows.length === 1 ? "" : "s"}
            {totalUnmatched > 0 && (
              <>
                {" · "}
                <span className="font-medium text-amber-700">
                  {totalUnmatched} unmatched txn{totalUnmatched === 1 ? "" : "s"}
                </span>
              </>
            )}
            {" · Total GL balance "}
            <span className="font-medium text-slate-900">{formatCents(totalBalance)}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/${params.tenant}/bank/new`}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            New Bank Account
          </Link>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-12 text-center shadow-sm">
          <p className="text-slate-500">No bank accounts yet.</p>
          <p className="mt-2 text-xs text-slate-400">
            Add a bank or credit card account to import transactions and reconcile.
          </p>
          <Link
            href={`/${params.tenant}/bank/new`}
            className="mt-4 inline-block rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            New Bank Account
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr className="text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2.5 text-left font-medium">Account</th>
                <th className="px-4 py-2.5 text-left font-medium">GL Linked</th>
                <th className="px-4 py-2.5 text-right font-medium">Txns</th>
                <th className="px-4 py-2.5 text-right font-medium">Unmatched</th>
                <th className="px-4 py-2.5 text-right font-medium">Last Recon</th>
                <th className="px-4 py-2.5 text-right font-medium">GL Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {rows.map((r) => {
                const href = `/${params.tenant}/bank/${r.id}`;
                return (
                  <tr
                    key={r.id}
                    className={`hover:bg-blue-50 ${r.isActive ? "" : "opacity-60"}`}
                  >
                    <td className="px-4 py-2.5">
                      <Link href={href} className="block">
                        <span className="font-medium text-slate-900">{r.name}</span>
                        <div className="text-xs text-slate-500">
                          {TYPE_LABELS[r.type] ?? r.type}
                          {r.institution && <> · {r.institution}</>}
                          {r.last4 && <> ····{r.last4}</>}
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">
                      <Link href={href} className="block">
                        <span className="font-mono text-xs text-slate-500">{r.glCode}</span>{" "}
                        <span>{r.glName}</span>
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs text-slate-500">
                      <Link href={href} className="block">
                        {r.txnCount}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs">
                      <Link href={href} className="block">
                        {r.unmatchedCount > 0 ? (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800">
                            {r.unmatchedCount}
                          </span>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs text-slate-500">
                      <Link href={href} className="block">
                        {r.lastReconDate
                          ? new Date(r.lastReconDate).toLocaleDateString()
                          : "—"}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-900">
                      <Link href={href} className="block">
                        {formatCents(r.glBalance)}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
