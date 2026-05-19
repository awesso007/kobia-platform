import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/accounting/ledger";
import { BankWorkspace } from "./BankWorkspace";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<string, string> = {
  CHECKING: "Checking",
  SAVINGS: "Savings",
  CREDIT_CARD: "Credit Card",
  MONEY_MARKET: "Money Market",
  LOAN: "Loan",
  OTHER: "Other",
};

export default async function BankAccountDetailPage({
  params,
  searchParams,
}: {
  params: { tenant: string; bankAccountId: string };
  searchParams: { status?: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const bank = await db.bankAccount.findFirst({
    where: { id: params.bankAccountId, tenantId: auth.tenant.id },
    include: {
      glAccount: { select: { id: true, code: true, name: true, balanceCents: true, type: true } },
      entity: { select: { id: true, name: true } },
    },
  });
  if (!bank) notFound();

  // Counts per status
  const [unmatchedCount, matchedCount, categorizedCount, clearedCount, ignoredCount] =
    await Promise.all([
      db.bankTransaction.count({ where: { bankAccountId: bank.id, status: "UNMATCHED" } }),
      db.bankTransaction.count({ where: { bankAccountId: bank.id, status: "MATCHED" } }),
      db.bankTransaction.count({ where: { bankAccountId: bank.id, status: "CATEGORIZED" } }),
      db.bankTransaction.count({ where: { bankAccountId: bank.id, status: "CLEARED" } }),
      db.bankTransaction.count({ where: { bankAccountId: bank.id, status: "IGNORED" } }),
    ]);

  // Eligible offset accounts (any non-bank-cash GL account: expense, revenue, asset, liability, equity)
  const offsetAccounts = await db.account.findMany({
    where: {
      tenantId: auth.tenant.id,
      entityId: bank.entityId,
      isActive: true,
      // Exclude the linked GL itself (can't categorize bank txn to its own bank GL)
      id: { not: bank.glAccountId },
    },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true, type: true },
  });

  // In-progress reconciliation, if any
  const activeRecon = await db.reconciliationSession.findFirst({
    where: { bankAccountId: bank.id, status: "IN_PROGRESS" },
    select: { id: true, statementStartDate: true, statementEndDate: true },
  });

  const statusFilter = (searchParams.status?.toUpperCase() ?? "UNMATCHED") as
    | "UNMATCHED"
    | "MATCHED"
    | "CATEGORIZED"
    | "CLEARED"
    | "IGNORED";

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-4 text-sm text-slate-500">
        <Link href={`/${params.tenant}/bank`} className="hover:text-slate-700">
          ← Back to bank accounts
        </Link>
      </div>

      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{bank.name}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {bank.entity.name} · {TYPE_LABELS[bank.accountType] ?? bank.accountType}
            {bank.institution && <> · {bank.institution}</>}
            {bank.accountLast4 && <> ····{bank.accountLast4}</>}
            {" · GL "}
            <span className="font-mono">{bank.glAccount.code}</span> {bank.glAccount.name}
            {" · Balance "}
            <span className="font-medium text-slate-900">
              {formatCents(bank.glAccount.balanceCents)}
            </span>
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/${params.tenant}/bank/${bank.id}/rules`}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Rules
          </Link>
          <Link
            href={`/${params.tenant}/bank/${bank.id}/import`}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Import CSV
          </Link>
          {activeRecon ? (
            <Link
              href={`/${params.tenant}/bank/${bank.id}/reconcile/${activeRecon.id}`}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              Resume Reconciliation
            </Link>
          ) : (
            <Link
              href={`/${params.tenant}/bank/${bank.id}/reconcile/new`}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Start Reconciliation
            </Link>
          )}
        </div>
      </div>

      {/* Status tabs */}
      <div className="mb-4 flex gap-1 border-b border-slate-200">
        {[
          { key: "UNMATCHED", label: "Unmatched", count: unmatchedCount, accent: "amber" },
          { key: "MATCHED", label: "Matched", count: matchedCount, accent: "blue" },
          { key: "CATEGORIZED", label: "Categorized", count: categorizedCount, accent: "indigo" },
          { key: "CLEARED", label: "Cleared", count: clearedCount, accent: "emerald" },
          { key: "IGNORED", label: "Ignored", count: ignoredCount, accent: "slate" },
        ].map((tab) => {
          const active = tab.key === statusFilter;
          return (
            <Link
              key={tab.key}
              href={`/${params.tenant}/bank/${bank.id}?status=${tab.key}`}
              className={`relative -mb-px border-b-2 px-4 py-2 text-sm font-medium ${
                active
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {tab.label}
              <span
                className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  active ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-600"
                }`}
              >
                {tab.count}
              </span>
            </Link>
          );
        })}
      </div>

      <BankWorkspace
        tenantSlug={params.tenant}
        bankAccountId={bank.id}
        status={statusFilter}
        offsetAccounts={offsetAccounts}
      />
    </div>
  );
}
