import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { getActiveEntity } from "@/lib/active-entity";
import RecurringJEForm from "./RecurringJEForm";

export const dynamic = "force-dynamic";

export default async function NewRecurringJEPage({
  params,
}: {
  params: { tenant: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);
  if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(auth.role)) {
    return (
      <div className="mx-auto max-w-2xl p-6 text-sm text-rose-700">
        You don’t have permission to create recurring entries.
      </div>
    );
  }

  const entity = await getActiveEntity({
    tenantId: auth.tenant.id,
    tenantSlug: params.tenant,
  });
  if (!entity) redirect(`/${params.tenant}/books`);

  const accounts = await db.account.findMany({
    where: { tenantId: auth.tenant.id, entityId: entity.id, isActive: true },
    select: { id: true, code: true, name: true, type: true },
    orderBy: { code: "asc" },
  });

  const today = new Date();
  const defaultRunDate = today.toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="text-xs text-slate-500">
        <Link
          href={`/${params.tenant}/books/recurring-jes`}
          className="hover:text-slate-700"
        >
          ← Recurring entries
        </Link>
      </div>

      <h1 className="mt-2 text-2xl font-bold text-slate-900">New recurring template</h1>
      <p className="mt-1 text-sm text-slate-500">
        Define the lines once. KOBIA posts a balanced journal entry on each run date and
        advances the schedule automatically.
      </p>

      <div className="mt-6">
        <RecurringJEForm
          tenantSlug={params.tenant}
          accounts={accounts}
          defaultRunDate={defaultRunDate}
        />
      </div>
    </div>
  );
}
