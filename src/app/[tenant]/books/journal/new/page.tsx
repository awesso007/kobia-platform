import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
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

  const entity = await db.entity.findFirst({
    where: { tenantId: auth.tenant.id, isActive: true },
    orderBy: { name: "asc" },
  });
  if (!entity) redirect(`/${params.tenant}/books`);

  const accounts = await db.account.findMany({
    where: { entityId: entity.id, isActive: true },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true, type: true },
  });

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">New Journal Entry</h1>
      <p className="mt-1 text-sm text-slate-600">
        Posting to <span className="font-medium">{entity.name}</span>
      </p>

      <JournalEntryForm
        tenantSlug={params.tenant}
        entityId={entity.id}
        accounts={accounts}
      />
    </div>
  );
}
