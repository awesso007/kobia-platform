import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { getActiveEntity } from "@/lib/active-entity";
import { createBudget } from "@/app/actions/budget-actions";

export const dynamic = "force-dynamic";

export default async function BudgetIndexPage({
  params,
}: {
  params: { tenant: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const entity = await getActiveEntity({
    tenantId: auth.tenant.id,
    tenantSlug: params.tenant,
  });
  if (!entity) redirect(`/${params.tenant}/books`);

  const budgets = await db.budget.findMany({
    where: { tenantId: auth.tenant.id, entityId: entity.id },
    include: { _count: { select: { lines: true } } },
    orderBy: [{ fiscalYear: "desc" }, { name: "asc" }],
  });

  const currentYear = new Date().getUTCFullYear();

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-4 text-sm text-slate-500">
        <Link href={`/${params.tenant}/books`} className="hover:text-slate-700">
          ← Back to books
        </Link>
      </div>

      <h1 className="text-2xl font-bold tracking-tight text-slate-900">
        Budgets
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        Set monthly targets per account. KOBIA compares them to actuals from
        your posted ledger.
      </p>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">
            Existing budgets
          </h2>
          {budgets.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No budgets yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {budgets.map((b) => (
                <li key={b.id} className="flex items-center justify-between py-2">
                  <div>
                    <Link
                      href={`/${params.tenant}/books/budget/${b.id}`}
                      className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
                    >
                      {b.name}
                    </Link>
                    <div className="text-xs text-slate-500">
                      FY{b.fiscalYear} · {b.currency} · {b._count.lines}{" "}
                      accounts
                    </div>
                  </div>
                  <Link
                    href={`/${params.tenant}/books/reports/budget-vs-actual?budgetId=${b.id}`}
                    className="text-xs font-medium text-emerald-700 hover:text-emerald-800"
                  >
                    Run report →
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">
            Create new budget
          </h2>
          <form action={createBudget} className="mt-3 space-y-3">
            <input type="hidden" name="tenantSlug" value={params.tenant} />
            <label className="block">
              <span className="text-xs font-medium text-slate-600">Name</span>
              <input
                name="name"
                type="text"
                required
                placeholder="FY2026 Operating Budget"
                className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">
                Fiscal year
              </span>
              <input
                name="fiscalYear"
                type="number"
                min="2020"
                max="2099"
                defaultValue={currentYear}
                className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">Currency</span>
              <input
                name="currency"
                type="text"
                defaultValue={entity.baseCurrency ?? "USD"}
                maxLength={3}
                className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              />
            </label>
            <button
              type="submit"
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Create budget
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
