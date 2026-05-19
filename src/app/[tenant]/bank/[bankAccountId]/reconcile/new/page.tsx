import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/accounting/ledger";
import { StartReconciliationForm } from "./StartReconciliationForm";

export const dynamic = "force-dynamic";

export default async function NewReconciliationPage({
  params,
}: {
  params: { tenant: string; bankAccountId: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const bank = await db.bankAccount.findFirst({
    where: { id: params.bankAccountId, tenantId: auth.tenant.id },
    include: { glAccount: { select: { code: true, name: true, balanceCents: true } } },
  });
  if (!bank) notFound();

  // Check for existing in-progress
  const inProgress = await db.reconciliationSession.findFirst({
    where: { bankAccountId: bank.id, status: "IN_PROGRESS" },
    select: { id: true, statementEndDate: true },
  });
  if (inProgress) {
    redirect(`/${params.tenant}/bank/${bank.id}/reconcile/${inProgress.id}`);
  }

  // Get last completed session for suggesting start balance
  const lastCompleted = await db.reconciliationSession.findFirst({
    where: { bankAccountId: bank.id, status: "COMPLETED" },
    orderBy: { statementEndDate: "desc" },
    select: { statementEndDate: true, statementEndBalanceCents: true },
  });

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="mb-4 text-sm text-slate-500">
        <Link href={`/${params.tenant}/bank/${bank.id}`} className="hover:text-slate-700">
          ← Back to {bank.name}
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-slate-900">Start reconciliation</h1>
      <p className="mt-1 text-sm text-slate-500">
        For <span className="font-medium text-slate-700">{bank.name}</span> · GL{" "}
        <span className="font-mono">{bank.glAccount.code}</span> {bank.glAccount.name} · current
        GL balance <span className="font-medium">{formatCents(bank.glAccount.balanceCents)}</span>
      </p>

      {lastCompleted && (
        <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          Last reconciliation ended{" "}
          <span className="font-medium">
            {new Date(lastCompleted.statementEndDate).toLocaleDateString()}
          </span>{" "}
          at <span className="font-mono">{formatCents(lastCompleted.statementEndBalanceCents)}</span>.
          Suggested start balance below.
        </div>
      )}

      <StartReconciliationForm
        tenantSlug={params.tenant}
        bankAccountId={bank.id}
        suggestedStartBalanceCents={lastCompleted?.statementEndBalanceCents?.toString() ?? "0"}
        suggestedStartDate={
          lastCompleted ? new Date(lastCompleted.statementEndDate).toISOString().slice(0, 10) : ""
        }
      />
    </div>
  );
}
