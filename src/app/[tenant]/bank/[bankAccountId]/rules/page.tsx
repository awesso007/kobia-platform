import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { RulesManager } from "./RulesManager";

export const dynamic = "force-dynamic";

export default async function RulesPage({
  params,
}: {
  params: { tenant: string; bankAccountId: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const bank = await db.bankAccount.findFirst({
    where: { id: params.bankAccountId, tenantId: auth.tenant.id },
    select: { id: true, name: true, entityId: true, glAccountId: true },
  });
  if (!bank) notFound();

  const offsetAccounts = await db.account.findMany({
    where: {
      tenantId: auth.tenant.id,
      entityId: bank.entityId,
      isActive: true,
      id: { not: bank.glAccountId },
    },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true, type: true },
  });

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-4 text-sm text-slate-500">
        <Link href={`/${params.tenant}/bank/${bank.id}`} className="hover:text-slate-700">
          ← Back to {bank.name}
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-slate-900">Auto-categorization rules</h1>
      <p className="mt-1 text-sm text-slate-500">
        When a new transaction description contains the keyword, KOBIA auto-creates a journal
        entry posting to the offset account. Lower priority numbers run first.
      </p>

      <RulesManager
        bankAccountId={bank.id}
        offsetAccounts={offsetAccounts}
      />
    </div>
  );
}
