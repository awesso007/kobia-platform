import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { ReconcileWorkspace } from "./ReconcileWorkspace";

export const dynamic = "force-dynamic";

export default async function ReconciliationPage({
  params,
}: {
  params: { tenant: string; bankAccountId: string; sessionId: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const session = await db.reconciliationSession.findFirst({
    where: { id: params.sessionId, tenantId: auth.tenant.id, bankAccountId: params.bankAccountId },
    select: { id: true },
  });
  if (!session) notFound();

  const bank = await db.bankAccount.findFirst({
    where: { id: params.bankAccountId, tenantId: auth.tenant.id },
    select: { id: true, name: true },
  });
  if (!bank) notFound();

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-4 text-sm text-slate-500">
        <Link href={`/${params.tenant}/bank/${bank.id}`} className="hover:text-slate-700">
          ← Back to {bank.name}
        </Link>
      </div>
      <ReconcileWorkspace
        tenantSlug={params.tenant}
        bankAccountId={bank.id}
        sessionId={session.id}
      />
    </div>
  );
}
