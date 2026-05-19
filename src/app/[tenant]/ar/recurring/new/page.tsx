import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { getActiveEntity } from "@/lib/active-entity";
import { NewRecurringForm } from "./NewRecurringForm";

export const dynamic = "force-dynamic";

export default async function NewRecurringInvoicePage({
  params,
}: {
  params: { tenant: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);
  if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(auth.role)) {
    redirect(`/${params.tenant}/ar/recurring`);
  }

  const entity = await getActiveEntity({
    tenantId: auth.tenant.id,
    tenantSlug: params.tenant,
  });
  if (!entity) redirect(`/${params.tenant}/books`);

  const [customers, revenueAccounts] = await Promise.all([
    db.customer.findMany({
      where: {
        tenantId: auth.tenant.id,
        entityId: entity.id,
        isActive: true,
      },
      select: { id: true, name: true, defaultTermsDays: true },
      orderBy: { name: "asc" },
    }),
    db.account.findMany({
      where: {
        tenantId: auth.tenant.id,
        entityId: entity.id,
        type: "REVENUE",
        isActive: true,
      },
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
    }),
  ]);

  if (customers.length === 0) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-amber-900">
            No customers yet
          </h1>
          <p className="mt-2 text-sm text-amber-800">
            Add a customer before setting up a recurring schedule.
          </p>
          <Link
            href={`/${params.tenant}/ar/customers/new`}
            className="mt-4 inline-block rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            New Customer
          </Link>
        </div>
      </div>
    );
  }

  if (revenueAccounts.length === 0) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-rose-900">
            No revenue accounts
          </h1>
          <p className="mt-2 text-sm text-rose-800">
            Add at least one revenue account before invoicing.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-4 text-sm text-slate-500">
        <Link
          href={`/${params.tenant}/ar/recurring`}
          className="hover:text-slate-700"
        >
          ← Back to schedules
        </Link>
      </div>

      <h1 className="text-2xl font-bold tracking-tight text-slate-900">
        New Recurring Schedule
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        Define a template that auto-generates and posts invoices on schedule.
      </p>

      <NewRecurringForm
        tenantSlug={params.tenant}
        baseCurrency={entity.baseCurrency ?? "USD"}
        customers={customers}
        revenueAccounts={revenueAccounts}
      />
    </div>
  );
}
