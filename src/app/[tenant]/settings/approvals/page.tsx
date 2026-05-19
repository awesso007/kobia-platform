import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { getActiveEntity } from "@/lib/active-entity";
import { saveApprovalRuleAction } from "@/app/actions/approval-actions";

export const dynamic = "force-dynamic";

function centsToDollarString(c: bigint): string {
  const negative = c < 0n;
  const abs = negative ? -c : c;
  const whole = abs / 100n;
  const frac = abs % 100n;
  return `${negative ? "-" : ""}${whole.toString()}.${frac
    .toString()
    .padStart(2, "0")}`;
}

export default async function ApprovalSettingsPage({
  params,
}: {
  params: { tenant: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);
  if (!["OWNER", "ADMIN"].includes(auth.role))
    redirect(`/${params.tenant}/dashboard`);

  const entity = await getActiveEntity({
    tenantId: auth.tenant.id,
    tenantSlug: params.tenant,
  });
  if (!entity) redirect(`/${params.tenant}/books`);

  const rule = await db.approvalRule.findUnique({
    where: { entityId: entity.id },
  });

  const thresholdDollars = rule
    ? centsToDollarString(rule.thresholdCents)
    : "0.00";
  const isEnabled = rule?.isEnabled ?? false;

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="mb-4 text-sm text-slate-500">
        <Link href={`/${params.tenant}/settings`} className="hover:text-slate-700">
          ← Back to settings
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-slate-900">Bill approvals</h1>
      <p className="mt-1 text-sm text-slate-500">
        {entity.name} · Require approval for bills above a dollar threshold
        before they post to the ledger.
      </p>

      <form
        action={saveApprovalRuleAction}
        className="mt-6 space-y-5 rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
      >
        <input type="hidden" name="tenantSlug" value={params.tenant} />

        <div className="flex items-center gap-3">
          <input
            id="isEnabled"
            name="isEnabled"
            type="checkbox"
            defaultChecked={isEnabled}
            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          <label htmlFor="isEnabled" className="text-sm text-slate-900">
            Enable bill approval workflow
          </label>
        </div>

        <div>
          <label
            htmlFor="thresholdDollars"
            className="block text-sm font-medium text-slate-900"
          >
            Approval threshold (USD)
          </label>
          <p className="mt-1 text-xs text-slate-500">
            Bills totaling more than this amount require approval. Bills at or
            below this amount post directly. Set to 0 to require approval for
            every bill.
          </p>
          <div className="mt-2 flex items-center">
            <span className="rounded-l-md border border-r-0 border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-500">
              $
            </span>
            <input
              id="thresholdDollars"
              name="thresholdDollars"
              type="text"
              inputMode="decimal"
              defaultValue={thresholdDollars}
              placeholder="500.00"
              className="block w-40 rounded-r-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
          Only Owner and Admin roles can approve or reject bills. Submitters
          can edit and resubmit rejected bills.
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Save approval rule
          </button>
        </div>
      </form>
    </div>
  );
}
