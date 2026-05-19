import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { getActiveEntity } from "@/lib/active-entity";
import { cookies } from "next/headers";
import { ageBucket } from "@/lib/accounting/ar";
import { formatCents } from "@/lib/accounting/ledger";
import { sendAllOverdueRemindersAction } from "@/app/actions/reminder-actions";

export const dynamic = "force-dynamic";

export default async function ArAgingPage({
  params,
  searchParams,
}: {
  params: { tenant: string };
  searchParams: { asOf?: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const entity = await getActiveEntity({ tenantId: auth.tenant.id, tenantSlug: params.tenant });
  if (!entity) redirect(`/${params.tenant}/books`);

  const asOf = searchParams.asOf ? new Date(searchParams.asOf) : new Date();

  const invoices = await db.invoice.findMany({
    where: {
      tenantId: auth.tenant.id,
      entityId: entity.id,
      status: { in: ["OPEN", "PARTIAL"] },
    },
    include: {
      customer: { select: { id: true, name: true, email: true } },
    },
    orderBy: { dueDate: "asc" },
  });

  type Buckets = {
    current: bigint;
    d1_30: bigint;
    d31_60: bigint;
    d61_90: bigint;
    over90: bigint;
    total: bigint;
  };
  const zeroBuckets = (): Buckets => ({
    current: 0n,
    d1_30: 0n,
    d31_60: 0n,
    d61_90: 0n,
    over90: 0n,
    total: 0n,
  });

  const byCustomer = new Map<
    string,
    { customerId: string; customerName: string; email: string | null; buckets: Buckets; invoices: typeof invoices }
  >();

  for (const inv of invoices) {
    const bucket = ageBucket(inv.dueDate, asOf);
    const existing = byCustomer.get(inv.customerId) ?? {
      customerId: inv.customerId,
      customerName: inv.customer.name,
      email: inv.customer.email,
      buckets: zeroBuckets(),
      invoices: [] as typeof invoices,
    };
    const b = existing.buckets;
    const amt = inv.balanceCents;
    if (bucket === "CURRENT") b.current += amt;
    else if (bucket === "DAYS_1_30") b.d1_30 += amt;
    else if (bucket === "DAYS_31_60") b.d31_60 += amt;
    else if (bucket === "DAYS_61_90") b.d61_90 += amt;
    else b.over90 += amt;
    b.total += amt;
    existing.invoices.push(inv);
    byCustomer.set(inv.customerId, existing);
  }

  const customers = Array.from(byCustomer.values()).sort((a, b) =>
    a.buckets.total > b.buckets.total ? -1 : 1
  );

  const grand = zeroBuckets();
  for (const c of customers) {
    grand.current += c.buckets.current;
    grand.d1_30 += c.buckets.d1_30;
    grand.d31_60 += c.buckets.d31_60;
    grand.d61_90 += c.buckets.d61_90;
    grand.over90 += c.buckets.over90;
    grand.total += c.buckets.total;
  }

  const asOfStr = asOf.toISOString().slice(0, 10);

  // Read transient reminder-result cookie (cleared by client UI via no-op next view)
  const cookieStore = cookies();
  const resultCookie = cookieStore.get("kobia_reminder_result")?.value;
  let reminderBanner: {
    sent: number;
    failed: number;
    total: number;
    stubbed: boolean;
  } | null = null;
  if (resultCookie) {
    try {
      const parsed = JSON.parse(resultCookie);
      if (Date.now() - parsed.ts < 60_000) reminderBanner = parsed;
    } catch {
      // ignore
    }
  }

  const totalOverdue = invoices.filter(
    (i) => i.dueDate < asOf && i.balanceCents > 0n
  ).length;

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-4 text-sm text-slate-500">
        <Link href={`/${params.tenant}/books`} className="hover:text-slate-700">
          ← Back to books
        </Link>
      </div>

      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Accounts Receivable Aging</h1>
          <p className="mt-1 text-sm text-slate-500">
            {entity.name} · {customers.length} customer
            {customers.length === 1 ? "" : "s"} · {invoices.length} open invoice
            {invoices.length === 1 ? "" : "s"}
          </p>
        </div>
        <form className="flex items-end gap-3" action="">
          <label className="block text-xs">
            <span className="mb-1 block font-medium text-slate-700">As of</span>
            <input
              type="date"
              name="asOf"
              defaultValue={asOfStr}
              className="rounded-md border-slate-300 px-2 py-1.5 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            Update
          </button>
        </form>
      </div>

      {reminderBanner && (
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          Sent {reminderBanner.sent} reminder{reminderBanner.sent === 1 ? "" : "s"}
          {reminderBanner.failed > 0
            ? `, ${reminderBanner.failed} failed (likely missing customer email)`
            : ""}
          {reminderBanner.stubbed
            ? " — Email service not configured; messages were logged only."
            : "."}
        </div>
      )}

      {totalOverdue > 0 && (
        <div className="mb-4 flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <span>
            {totalOverdue} invoice{totalOverdue === 1 ? " is" : "s are"} past due.
            Send a friendly reminder to every customer with an overdue balance.
          </span>
          <form action={sendAllOverdueRemindersAction}>
            <input type="hidden" name="tenantSlug" value={params.tenant} />
            <button
              type="submit"
              className="rounded-md bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-800"
            >
              Send all reminders
            </button>
          </form>
        </div>
      )}

      {invoices.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-12 text-center shadow-sm">
          <p className="text-slate-500">No open invoices.</p>
          <p className="mt-2 text-xs text-slate-400">
            Create customers and post invoices to see aging here.
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr className="text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2.5 text-left font-medium">Customer</th>
                  <th className="px-4 py-2.5 text-right font-medium">Current</th>
                  <th className="px-4 py-2.5 text-right font-medium">1–30</th>
                  <th className="px-4 py-2.5 text-right font-medium">31–60</th>
                  <th className="px-4 py-2.5 text-right font-medium">61–90</th>
                  <th className="px-4 py-2.5 text-right font-medium">90+</th>
                  <th className="px-4 py-2.5 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {customers.map((c) => (
                  <tr key={c.customerId} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 text-sm">
                      <div className="font-medium text-slate-900">{c.customerName}</div>
                      {c.email && <div className="text-xs text-slate-500">{c.email}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-sm tabular-nums text-slate-900">
                      {c.buckets.current > 0n ? formatCents(c.buckets.current) : ""}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-sm tabular-nums text-slate-900">
                      {c.buckets.d1_30 > 0n ? formatCents(c.buckets.d1_30) : ""}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-sm tabular-nums text-slate-900">
                      {c.buckets.d31_60 > 0n ? formatCents(c.buckets.d31_60) : ""}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-sm tabular-nums text-slate-900">
                      {c.buckets.d61_90 > 0n ? formatCents(c.buckets.d61_90) : ""}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-sm tabular-nums text-rose-700">
                      {c.buckets.over90 > 0n ? formatCents(c.buckets.over90) : ""}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-sm font-semibold tabular-nums text-slate-900">
                      {formatCents(c.buckets.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50">
                <tr className="text-sm font-semibold">
                  <td className="px-4 py-3 text-left text-xs uppercase tracking-wide text-slate-500">
                    Grand total
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-900">
                    {formatCents(grand.current)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-900">
                    {formatCents(grand.d1_30)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-900">
                    {formatCents(grand.d31_60)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-900">
                    {formatCents(grand.d61_90)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-rose-700">
                    {formatCents(grand.over90)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-900">
                    {formatCents(grand.total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="mt-8 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-2.5">
              <h2 className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Open invoices
              </h2>
            </div>
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr className="text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2 text-left font-medium">Inv #</th>
                  <th className="px-4 py-2 text-left font-medium">Customer</th>
                  <th className="px-4 py-2 text-left font-medium">Issued</th>
                  <th className="px-4 py-2 text-left font-medium">Due</th>
                  <th className="px-4 py-2 text-right font-medium">Days past</th>
                  <th className="px-4 py-2 text-left font-medium">Bucket</th>
                  <th className="px-4 py-2 text-right font-medium">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {invoices.map((inv) => {
                  const days = Math.max(
                    0,
                    Math.floor((asOf.getTime() - inv.dueDate.getTime()) / 86400_000)
                  );
                  const bucket = ageBucket(inv.dueDate, asOf);
                  const bucketLabel = {
                    CURRENT: "Current",
                    DAYS_1_30: "1–30",
                    DAYS_31_60: "31–60",
                    DAYS_61_90: "61–90",
                    DAYS_OVER_90: "90+",
                  }[bucket];
                  const isOver90 = bucket === "DAYS_OVER_90";
                  return (
                    <tr key={inv.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2 font-mono text-xs text-slate-500">
                        #{inv.invoiceNumber}
                      </td>
                      <td className="px-4 py-2 text-slate-900">{inv.customer.name}</td>
                      <td className="px-4 py-2 font-mono text-xs text-slate-500">
                        {inv.issueDate.toISOString().slice(0, 10)}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-slate-500">
                        {inv.dueDate.toISOString().slice(0, 10)}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-xs text-slate-500">
                        {days}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            isOver90
                              ? "bg-rose-100 text-rose-800"
                              : bucket === "CURRENT"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {bucketLabel}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right font-mono tabular-nums text-slate-900">
                        {formatCents(inv.balanceCents)}
                        {inv.balanceCents !== inv.totalCents && (
                          <span className="ml-1 text-xs text-slate-400">
                            of {formatCents(inv.totalCents)}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p className="mt-6 text-xs text-slate-400">
        Aging buckets are computed against each invoice&apos;s due date. As-of date: {asOfStr}.
      </p>
    </div>
  );
}
