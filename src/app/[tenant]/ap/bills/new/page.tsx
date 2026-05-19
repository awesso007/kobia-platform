import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { getActiveEntity } from "@/lib/active-entity";
import { NewBillForm } from "./NewBillForm";

export const dynamic = "force-dynamic";

export default async function NewBillPage({
  params,
  searchParams,
}: {
  params: { tenant: string };
  searchParams: { vendorId?: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);
  if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(auth.role)) {
    redirect(`/${params.tenant}/ap/bills`);
  }

  const entity = await getActiveEntity({ tenantId: auth.tenant.id, tenantSlug: params.tenant });
  if (!entity) redirect(`/${params.tenant}/books`);

  const [vendors, expenseAccounts] = await Promise.all([
    db.vendor.findMany({
      where: { tenantId: auth.tenant.id, entityId: entity.id, isActive: true },
      select: { id: true, name: true, defaultTermsDays: true },
      orderBy: { name: "asc" },
    }),
    // Bill lines may debit any expense, asset, or COGS account (most common: EXPENSE)
    db.account.findMany({
      where: {
        tenantId: auth.tenant.id,
        entityId: entity.id,
        type: { in: ["EXPENSE", "ASSET"] },
        isActive: true,
      },
      select: { id: true, code: true, name: true, type: true },
      orderBy: [{ type: "asc" }, { code: "asc" }],
    }),
  ]);

  if (vendors.length === 0) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <div className="mb-4 text-sm text-slate-500">
          <Link href={`/${params.tenant}/ap/bills`} className="hover:text-slate-700">
            ← Back to bills
          </Link>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-amber-900">No vendors yet</h1>
          <p className="mt-2 text-sm text-amber-800">
            Add a vendor before you can enter a bill.
          </p>
          <Link
            href={`/${params.tenant}/ap/vendors/new`}
            className="mt-4 inline-block rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            New Vendor
          </Link>
        </div>
      </div>
    );
  }

  if (expenseAccounts.length === 0) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-rose-900">No expense accounts</h1>
          <p className="mt-2 text-sm text-rose-800">
            This entity has no active expense or asset accounts. Add at least one before entering a
            bill.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-4 text-sm text-slate-500">
        <Link href={`/${params.tenant}/ap/bills`} className="hover:text-slate-700">
          ← Back to bills
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-slate-900">New Bill</h1>
      <p className="mt-1 text-sm text-slate-500">
        Posting a bill creates a journal entry:{" "}
        <span className="font-mono">Dr Expense / Cr AP</span>.
      </p>

      <NewBillForm
        tenantSlug={params.tenant}
        entityId={entity.id}
        vendors={vendors}
        expenseAccounts={expenseAccounts}
        preselectedVendorId={searchParams.vendorId ?? null}
      />
    </div>
  );
}
