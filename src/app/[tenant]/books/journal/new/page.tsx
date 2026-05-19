import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { getActiveEntity } from "@/lib/active-entity";
import { JournalEntryForm } from "./JournalEntryForm";

export default async function NewJournalEntryPage({
  params,
}: {
  params: { tenant: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);
  if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(auth.role)) {
    redirect(`/${params.tenant}/books`);
  }

  const entity = await getActiveEntity({ tenantId: auth.tenant.id, tenantSlug: params.tenant });
  if (!entity) redirect(`/${params.tenant}/books`);

  const accounts = await db.account.findMany({
    where: { entityId: entity.id, isActive: true },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true, type: true },
  });

  // Show a heads-up if any recent period is closed — users can't post in it.
  const latestClosed = await db.accountingPeriod.findFirst({
    where: { entityId: entity.id, status: "CLOSED" },
    orderBy: { endDate: "desc" },
    select: { label: true, endDate: true },
  });

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">New Journal Entry</h1>
      <p className="mt-1 text-sm text-slate-600">
        Posting to <span className="font-medium">{entity.name}</span>
      </p>
      {latestClosed && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Period locked through <span className="font-semibold">{latestClosed.label}</span>. Entries dated on or before that period will be rejected. Reopen the period from <a href={`/${params.tenant}/books/close`} className="underline">Period Close</a> if a correction is needed.
        </div>
      )}

      <JournalEntryForm
        tenantSlug={params.tenant}
        entityId={entity.id}
        accounts={accounts}
      />
    </div>
  );
}
