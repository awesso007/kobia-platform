import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

function fmtMoney(cents: bigint | number): string {
  const n = typeof cents === "bigint" ? Number(cents) / 100 : cents / 100;
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function fmtMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay(); // 0 Sun
  const diff = (day + 6) % 7; // Monday as start
  x.setDate(x.getDate() - diff);
  return x;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d;
}

export default async function DashboardPage({
  params,
}: {
  params: { tenant: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const tenantId = auth.tenant.id;
  const now = new Date();
  const weekStart = startOfWeek(now);
  const last30 = daysAgo(30);

  const [
    arOpen,
    arOverdue,
    apOpen,
    cashLast30,
    invoicesThisMonth,
    timeThisWeek,
    runningTimer,
    openDeals,
    newLeads,
    activeEngagements,
    openTasks,
  ] = await Promise.all([
    // Total open AR (open + partial)
    db.invoice.aggregate({
      where: {
        tenantId,
        status: { in: ["OPEN", "PARTIAL"] },
      },
      _sum: { balanceCents: true },
      _count: { _all: true },
    }),
    // Overdue AR — dueDate before today, still open/partial
    db.invoice.aggregate({
      where: {
        tenantId,
        status: { in: ["OPEN", "PARTIAL"] },
        dueDate: { lt: now },
      },
      _sum: { balanceCents: true },
      _count: { _all: true },
    }),
    // Total open AP (open + partial bills)
    db.bill
      .aggregate({
        where: {
          tenantId,
          status: { in: ["OPEN", "PARTIAL"] },
        },
        _sum: { balanceCents: true },
        _count: { _all: true },
      })
      .catch(() => ({ _sum: { balanceCents: null }, _count: { _all: 0 } })),
    // Cash collected last 30 days
    db.invoicePayment
      .aggregate({
        where: {
          tenantId,
          paymentDate: { gte: last30 },
        },
        _sum: { amountCents: true },
        _count: { _all: true },
      })
      .catch(() => ({ _sum: { amountCents: null }, _count: { _all: 0 } })),
    // Invoices this month
    db.invoice.aggregate({
      where: {
        tenantId,
        issueDate: {
          gte: new Date(now.getFullYear(), now.getMonth(), 1),
        },
        status: { not: "DRAFT" },
      },
      _sum: { totalCents: true },
      _count: { _all: true },
    }),
    // Time logged this week
    db.practiceTimeEntry
      .aggregate({
        where: {
          tenantId,
          startedAt: { gte: weekStart },
        },
        _sum: { durationMinutes: true, billableMinutes: true },
        _count: { _all: true },
      })
      .catch(() => ({
        _sum: { durationMinutes: null, billableMinutes: null },
        _count: { _all: 0 },
      })),
    // Running timer for current user
    db.practiceTimeEntry
      .findFirst({
        where: {
          tenantId,
          userId: auth.user.id,
          status: "RUNNING",
        },
        include: {
          engagement: { select: { name: true, id: true } },
        },
      })
      .catch(() => null),
    // Open deals (CRM)
    db.deal
      .aggregate({
        where: { tenantId, status: "OPEN" },
        _sum: { amountCents: true },
        _count: { _all: true },
      })
      .catch(() => ({ _sum: { amountCents: null }, _count: { _all: 0 } })),
    // New leads
    db.lead
      .count({
        where: { tenantId, status: { in: ["NEW", "CONTACTED"] } },
      })
      .catch(() => 0),
    // Active engagements
    db.engagement
      .count({
        where: { tenantId, status: "ACTIVE" },
      })
      .catch(() => 0),
    // Open tasks
    db.task
      .count({
        where: { tenantId, status: { not: "DONE" } },
      })
      .catch(() => 0),
  ]);

  const arOpenCents = Number(arOpen._sum.balanceCents ?? 0n);
  const arOverdueCents = Number(arOverdue._sum.balanceCents ?? 0n);
  const apOpenCents = Number(apOpen._sum.balanceCents ?? 0n);
  const cash30Cents = Number(cashLast30._sum.amountCents ?? 0n);
  const monthInvoicedCents = Number(invoicesThisMonth._sum.totalCents ?? 0n);
  const timeMins = Number(timeThisWeek._sum.durationMinutes ?? 0);
  const billableMins = Number(timeThisWeek._sum.billableMinutes ?? 0);
  const dealAmountCents = Number(openDeals._sum.amountCents ?? 0n);

  // Most-overdue invoices preview
  const overdueList = await db.invoice
    .findMany({
      where: {
        tenantId,
        status: { in: ["OPEN", "PARTIAL"] },
        dueDate: { lt: now },
      },
      orderBy: { dueDate: "asc" },
      take: 5,
      include: {
        customer: { select: { name: true } },
        entity: { select: { name: true } },
      },
    })
    .catch(() => []);

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {auth.tenant.name}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Today is{" "}
            {now.toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        </div>
        {runningTimer && (
          <Link
            href={`/${params.tenant}/time`}
            className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800 hover:bg-amber-100"
          >
            ⏱ Timer running on {runningTimer.engagement.name} →
          </Link>
        )}
      </div>

      {/* Top KPI row — money */}
      <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Open A/R"
          value={fmtMoney(arOpenCents)}
          sub={`${arOpen._count._all} invoice${arOpen._count._all === 1 ? "" : "s"}`}
          href={`/${params.tenant}/ar/invoices`}
          tone="slate"
        />
        <KpiCard
          label="Overdue A/R"
          value={fmtMoney(arOverdueCents)}
          sub={`${arOverdue._count._all} past due`}
          href={`/${params.tenant}/books/reports/ar-aging`}
          tone={arOverdueCents > 0 ? "rose" : "slate"}
        />
        <KpiCard
          label="Open A/P"
          value={fmtMoney(apOpenCents)}
          sub={`${apOpen._count._all} bills to pay`}
          href={`/${params.tenant}/ap/bills`}
          tone="slate"
        />
        <KpiCard
          label="Cash collected · 30d"
          value={fmtMoney(cash30Cents)}
          sub={`${cashLast30._count._all} payments`}
          href={`/${params.tenant}/books/reports/cash-flow`}
          tone="emerald"
        />
      </div>

      {/* Second KPI row — practice */}
      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Invoiced this month"
          value={fmtMoney(monthInvoicedCents)}
          sub={`${invoicesThisMonth._count._all} invoice${invoicesThisMonth._count._all === 1 ? "" : "s"}`}
          href={`/${params.tenant}/ar/invoices`}
          tone="sky"
        />
        <KpiCard
          label="Time this week"
          value={fmtMinutes(timeMins)}
          sub={`${fmtMinutes(billableMins)} billable`}
          href={`/${params.tenant}/time`}
          tone="amber"
        />
        <KpiCard
          label="Open pipeline"
          value={fmtMoney(dealAmountCents)}
          sub={`${openDeals._count._all} deal${openDeals._count._all === 1 ? "" : "s"} · ${newLeads} new lead${newLeads === 1 ? "" : "s"}`}
          href={`/${params.tenant}/crm`}
          tone="indigo"
        />
        <KpiCard
          label="Practice work"
          value={`${activeEngagements} active`}
          sub={`${openTasks} open task${openTasks === 1 ? "" : "s"}`}
          href={`/${params.tenant}/practice`}
          tone="slate"
        />
      </div>

      {/* Overdue invoice list */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">
              Most overdue invoices
            </h2>
            <Link
              href={`/${params.tenant}/books/reports/ar-aging`}
              className="text-xs text-slate-500 hover:underline"
            >
              Full aging →
            </Link>
          </div>
          {overdueList.length === 0 ? (
            <div className="mt-3 rounded-md border border-dashed border-emerald-200 bg-emerald-50 p-4 text-center text-xs text-emerald-700">
              No overdue invoices. Nicely done.
            </div>
          ) : (
            <table className="mt-3 w-full text-sm">
              <thead className="text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-1 font-medium">Customer</th>
                  <th className="py-1 font-medium">Due</th>
                  <th className="py-1 text-right font-medium">Balance</th>
                </tr>
              </thead>
              <tbody>
                {overdueList.map((inv) => {
                  const days = Math.floor(
                    (now.getTime() - new Date(inv.dueDate).getTime()) /
                      (1000 * 60 * 60 * 24)
                  );
                  return (
                    <tr
                      key={inv.id}
                      className="border-t border-slate-100"
                    >
                      <td className="py-1.5">
                        <div className="text-slate-900">
                          {inv.customer.name}
                        </div>
                        <div className="text-xs text-slate-500">
                          {inv.entity.name} · #{inv.invoiceNumber}
                        </div>
                      </td>
                      <td className="py-1.5 text-xs text-rose-700">
                        {days}d overdue
                      </td>
                      <td className="py-1.5 text-right font-mono text-sm">
                        {fmtMoney(inv.balanceCents)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">Quick actions</h2>
          <div className="mt-3 space-y-2">
            <QuickLink
              href={`/${params.tenant}/ar/invoices`}
              label="New invoice"
              hint="Bill a customer"
            />
            <QuickLink
              href={`/${params.tenant}/time`}
              label="Log time"
              hint="Track billable hours"
            />
            <QuickLink
              href={`/${params.tenant}/crm/leads`}
              label="Add a lead"
              hint="Capture a prospect"
            />
            <QuickLink
              href={`/${params.tenant}/ap/bills`}
              label="New bill"
              hint="Record a vendor expense"
            />
            <QuickLink
              href={`/${params.tenant}/practice`}
              label="New engagement"
              hint="Start client work"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

const TONE: Record<string, { border: string; accent: string; sub: string }> = {
  slate: {
    border: "border-slate-200",
    accent: "text-slate-900",
    sub: "text-slate-500",
  },
  emerald: {
    border: "border-emerald-200",
    accent: "text-emerald-700",
    sub: "text-emerald-600",
  },
  rose: {
    border: "border-rose-200",
    accent: "text-rose-700",
    sub: "text-rose-600",
  },
  sky: {
    border: "border-sky-200",
    accent: "text-sky-700",
    sub: "text-sky-600",
  },
  amber: {
    border: "border-amber-200",
    accent: "text-amber-700",
    sub: "text-amber-600",
  },
  indigo: {
    border: "border-indigo-200",
    accent: "text-indigo-700",
    sub: "text-indigo-600",
  },
};

function KpiCard({
  label,
  value,
  sub,
  href,
  tone = "slate",
}: {
  label: string;
  value: string;
  sub: string;
  href: string;
  tone?: keyof typeof TONE;
}) {
  const t = (TONE[tone] ?? TONE.slate) as { border: string; accent: string; sub: string };
  return (
    <Link
      href={href}
      className={`block rounded-lg border ${t.border} bg-white p-4 transition hover:shadow-md`}
    >
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className={`mt-2 text-2xl font-semibold ${t.accent}`}>
        {value}
      </div>
      <div className={`mt-0.5 text-xs ${t.sub}`}>{sub}</div>
    </Link>
  );
}

function QuickLink({
  href,
  label,
  hint,
}: {
  href: string;
  label: string;
  hint: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-md border border-slate-100 px-3 py-2 text-sm hover:border-slate-200 hover:bg-slate-50"
    >
      <div>
        <div className="font-medium text-slate-900">{label}</div>
        <div className="text-xs text-slate-500">{hint}</div>
      </div>
      <span className="text-slate-400">→</span>
    </Link>
  );
}
