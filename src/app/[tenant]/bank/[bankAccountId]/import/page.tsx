import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { ImportCsvForm } from "./ImportCsvForm";

export const dynamic = "force-dynamic";

export default async function ImportCsvPage({
  params,
}: {
  params: { tenant: string; bankAccountId: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const bank = await db.bankAccount.findFirst({
    where: { id: params.bankAccountId, tenantId: auth.tenant.id },
    include: {
      glAccount: { select: { code: true, name: true } },
    },
  });
  if (!bank) notFound();

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-4 text-sm text-slate-500">
        <Link
          href={`/${params.tenant}/bank/${bank.id}`}
          className="hover:text-slate-700"
        >
          ← Back to {bank.name}
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-slate-900">Import bank statement</h1>
      <p className="mt-1 text-sm text-slate-500">
        Importing into <span className="font-medium text-slate-700">{bank.name}</span> (GL{" "}
        <span className="font-mono">{bank.glAccount.code}</span> {bank.glAccount.name})
      </p>

      <div className="mt-6 rounded-md border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
        <p className="font-semibold text-slate-700">Supported CSV formats</p>
        <p className="mt-2">
          The importer accepts most US bank exports. We auto-detect these column layouts:
        </p>
        <ul className="mt-1.5 list-inside list-disc space-y-0.5">
          <li>
            <span className="font-mono">date, description, amount</span> (single signed column)
          </li>
          <li>
            <span className="font-mono">date, description, debit, credit</span> (split columns)
          </li>
        </ul>
        <p className="mt-2">
          Dates can be <span className="font-mono">YYYY-MM-DD</span> or{" "}
          <span className="font-mono">MM/DD/YYYY</span>. Amounts may include $, commas, or
          parentheses for negatives. Duplicate rows are skipped automatically.
        </p>
      </div>

      <ImportCsvForm
        tenantSlug={params.tenant}
        bankAccountId={bank.id}
      />
    </div>
  );
}
