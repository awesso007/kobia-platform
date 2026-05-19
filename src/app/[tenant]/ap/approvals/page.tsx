import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { getActiveEntity } from "@/lib/active-entity";
import { formatCents } from "@/lib/accounting/ledger";
import {
  approveBillAction,
  rejectBillAction,
} from "@/app/actions/approval-actions";

export const dynamic = "force-dynamic";

export default async function ApprovalsInboxPage({
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

  const canDecide = ["OWNER", "ADMIN"].includes(auth.role);

  const pending = await db.bill.findMany({
    where: {
      tenantId: auth.tenant.id,
      entityId: entity.id,
      status: "PENDING_APPROVAL",
    },
    include: {
      vendor: { select: { name: true } },
      lines: {
        select: { description: true, amountCents: true },
        orderBy: { lineNumber: "asc" },
      },
      approvals: {
        where: { decision: null },
        orderBy: { submittedAt: "desc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-4 text-sm text-slate-500">
        <Link href={`/${params.tenant}/ap/bills`} className="hover:text-slate-700">
          ← Back to bills
        </Link>
      </div>

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Bill approvals</h1>
          <p className="mt-1 text-sm text-slate-500">
            {entity.name} · {pending.length} pending
          </p>
        </div>
        <Link
          href={`/${params.tenant}/settings/approvals`}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Approval settings
        </Link>
      </div>

      {pending.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-12 text-center shadow-sm">
          <p className="text-slate-500">Inbox zero.</p>
          <p className="mt-2 text-xs text-slate-400">
            Bills exceeding the approval threshold will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {pending.map((b) => {
            const subtotal = b.lines.reduce(
              (s, l) => s + l.amountCents,
              0n
            );
            return (
              <div
                key={b.id}
                className="rounded-lg border border-amber-200 bg-amber-50/50 p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-semibold text-slate-900">
                        {b.vendor.name}
                      </h3>
                      <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                        Pending approval
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      Bill dated {b.billDate.toLocaleDateString()} · Due{" "}
                      {b.dueDate.toLocaleDateString()}
                      {b.vendorBillNumber
                        ? ` · Vendor ref ${b.vendorBillNumber}`
                        : ""}
                    </div>
                    {b.approvals[0] && (
                      <div className="mt-1 text-xs text-slate-500">
                        Submitted{" "}
                        {b.approvals[0].submittedAt.toLocaleDateString()}
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-xs uppercase tracking-wide text-slate-500">
                      Total
                    </div>
                    <div className="text-2xl font-bold tabular-nums text-slate-900">
                      {formatCents(subtotal)}
                    </div>
                  </div>
                </div>

                <ul className="mt-4 divide-y divide-amber-200/60 text-sm">
                  {b.lines.slice(0, 5).map((l, i) => (
                    <li
                      key={i}
                      className="flex items-center justify-between py-1.5"
                    >
                      <span className="text-slate-700">{l.description}</span>
                      <span className="font-mono tabular-nums text-slate-700">
                        {formatCents(l.amountCents)}
                      </span>
                    </li>
                  ))}
                  {b.lines.length > 5 && (
                    <li className="py-1.5 text-xs text-slate-500">
                      +{b.lines.length - 5} more line
                      {b.lines.length - 5 === 1 ? "" : "s"}
                    </li>
                  )}
                </ul>

                {b.memo && (
                  <div className="mt-3 rounded-md border border-amber-200 bg-white p-3 text-sm text-slate-700">
                    <div className="text-xs uppercase tracking-wide text-slate-500">
                      Memo
                    </div>
                    <div className="mt-1 whitespace-pre-wrap">{b.memo}</div>
                  </div>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Link
                    href={`/${params.tenant}/ap/bills/${b.id}`}
                    className="text-sm font-medium text-blue-700 hover:underline"
                  >
                    View full bill →
                  </Link>

                  {canDecide && (
                    <div className="ml-auto flex flex-wrap items-center gap-2">
                      <form action={rejectBillAction}>
                        <input
                          type="hidden"
                          name="tenantSlug"
                          value={params.tenant}
                        />
                        <input type="hidden" name="billId" value={b.id} />
                        <button
                          type="submit"
                          className="rounded-md border border-rose-300 bg-white px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50"
                        >
                          Reject
                        </button>
                      </form>
                      <form action={approveBillAction}>
                        <input
                          type="hidden"
                          name="tenantSlug"
                          value={params.tenant}
                        />
                        <input type="hidden" name="billId" value={b.id} />
                        <button
                          type="submit"
                          className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                        >
                          Approve &amp; post
                        </button>
                      </form>
                    </div>
                  )}
                  {!canDecide && (
                    <span className="ml-auto text-xs text-slate-500">
                      Only owners and admins can approve bills.
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
