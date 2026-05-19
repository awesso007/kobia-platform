import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { BudgetEditor } from "./BudgetEditor";

export const dynamic = "force-dynamic";

export default async function BudgetDetailPage({
  params,
}: {
  params: { tenant: string; budgetId: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const budget = await db.budget.findFirst({
    where: { id: params.budgetId, tenantId: auth.tenant.id },
    include: { lines: true },
  });
  if (!budget) redirect(`/${params.tenant}/books/budget`);

  const accounts = await db.account.findMany({
    where: {
      tenantId: auth.tenant.id,
      entityId: budget!.entityId,
      isActive: true,
      type: { in: ["REVENUE", "EXPENSE", "COGS", "OTHER_INCOME", "OTHER_EXPENSE"] },
    },
    select: { id: true, code: true, name: true, type: true },
    orderBy: { code: "asc" },
  });

  const linesByAccount = new Map(budget!.lines.map((l) => [l.accountId, l]));

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-4 text-sm text-slate-500">
        <Link href={`/${params.tenant}/books/budget`} className="hover:text-slate-700">
          ← Back to budgets
        </Link>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {budget!.name}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            FY{budget!.fiscalYear} · {budget!.currency} · {accounts.length}{" "}
            P&amp;L accounts
          </p>
        </div>
        <Link
          href={`/${params.tenant}/books/reports/budget-vs-actual?budgetId=${budget!.id}`}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          Run vs Actual
        </Link>
      </div>

      <BudgetEditor
        tenantSlug={params.tenant}
        budgetId={budget!.id}
        accounts={accounts}
        existingLines={Object.fromEntries(
          Array.from(linesByAccount.entries()).map(([accId, l]) => [
            accId,
            {
              jan: l.jan.toString(),
              feb: l.feb.toString(),
              mar: l.mar.toString(),
              apr: l.apr.toString(),
              may: l.may.toString(),
              jun: l.jun.toString(),
              jul: l.jul.toString(),
              aug: l.aug.toString(),
              sep: l.sep.toString(),
              oct: l.oct.toString(),
              nov: l.nov.toString(),
              dec: l.dec.toString(),
            },
          ])
        )}
      />
    </div>
  );
}
