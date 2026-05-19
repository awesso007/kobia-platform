import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

type ActivityItem = {
  id: string;
  kind: string;
  icon: string;
  title: string;
  subtitle: string;
  href: string;
  at: Date;
  tone: keyof typeof TONE;
};

const TONE = {
  slate: "bg-slate-100 text-slate-700",
  emerald: "bg-emerald-100 text-emerald-800",
  sky: "bg-sky-100 text-sky-800",
  amber: "bg-amber-100 text-amber-800",
  indigo: "bg-indigo-100 text-indigo-800",
  rose: "bg-rose-100 text-rose-800",
} as const;

function fmtMoney(cents: bigint | number): string {
  const n = typeof cents === "bigint" ? Number(cents) / 100 : cents / 100;
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function relTime(d: Date): string {
  const ms = Date.now() - new Date(d).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(d).toLocaleDateString();
}

export default async function InboxPage({
  params,
  searchParams,
}: {
  params: { tenant: string };
  searchParams?: { kind?: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const tenantId = auth.tenant.id;
  const kindFilter = searchParams?.kind ?? "ALL";
  const limit = 25;
  // For each source we fetch the last N then merge & sort.

  const [
    invoices,
    payments,
    bills,
    leads,
    deals,
    crmActivities,
    tasks,
    timeEntries,
    letters,
    portalUploads,
  ] = await Promise.all([
    db.invoice.findMany({
      where: { tenantId, status: { not: "DRAFT" } },
      orderBy: { updatedAt: "desc" },
      take: limit,
      include: {
        customer: { select: { name: true } },
      },
    }),
    db.invoicePayment
      .findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        take: limit,
        include: {
          invoice: {
            select: {
              invoiceNumber: true,
              customer: { select: { name: true } },
            },
          },
        },
      })
      .catch(() => []),
    db.bill
      .findMany({
        where: { tenantId, status: { not: "DRAFT" } },
        orderBy: { updatedAt: "desc" },
        take: limit,
        include: { vendor: { select: { name: true } } },
      })
      .catch(() => []),
    db.lead
      .findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        take: limit,
      })
      .catch(() => []),
    db.deal
      .findMany({
        where: { tenantId },
        orderBy: { updatedAt: "desc" },
        take: limit,
        include: { stage: { select: { name: true } } },
      })
      .catch(() => []),
    db.crmActivity
      .findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        take: limit,
      })
      .catch(() => []),
    db.task
      .findMany({
        where: { tenantId, status: "DONE" },
        orderBy: { updatedAt: "desc" },
        take: limit,
        include: {
          engagement: {
            select: { name: true, entity: { select: { name: true } } },
          },
        },
      })
      .catch(() => []),
    db.practiceTimeEntry
      .findMany({
        where: { tenantId, status: { not: "RUNNING" } },
        orderBy: { startedAt: "desc" },
        take: limit,
        include: {
          engagement: {
            select: { name: true, entity: { select: { name: true } } },
          },
        },
      })
      .catch(() => []),
    db.engagementLetter
      .findMany({
        where: { tenantId, status: { in: ["SENT", "SIGNED"] } },
        orderBy: { updatedAt: "desc" },
        take: limit,
        include: {
          engagement: {
            select: { entity: { select: { name: true } } },
          },
        },
      })
      .catch(() => []),
    db.portalUpload
      .findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        take: limit,
      })
      .catch(() => []),
  ]);

  const items: ActivityItem[] = [];

  for (const inv of invoices) {
    items.push({
      id: `inv-${inv.id}`,
      kind: "INVOICE",
      icon: "📄",
      title: `Invoice #${inv.invoiceNumber} · ${inv.customer.name}`,
      subtitle: `${inv.status} · ${fmtMoney(inv.totalCents)}`,
      href: `/${params.tenant}/ar/invoices`,
      at: inv.updatedAt,
      tone: inv.status === "PAID" ? "emerald" : "sky",
    });
  }
  for (const p of payments) {
    items.push({
      id: `pay-${p.id}`,
      kind: "PAYMENT",
      icon: "💵",
      title: `Payment received · ${p.invoice.customer.name}`,
      subtitle: `${fmtMoney(p.amountCents)} on invoice #${p.invoice.invoiceNumber}`,
      href: `/${params.tenant}/ar/invoices`,
      at: p.createdAt,
      tone: "emerald",
    });
  }
  for (const b of bills) {
    items.push({
      id: `bill-${b.id}`,
      kind: "BILL",
      icon: "🧾",
      title: `Bill · ${b.vendor.name}`,
      subtitle: `${b.status} · ${fmtMoney(b.totalCents)}`,
      href: `/${params.tenant}/ap/bills`,
      at: b.updatedAt,
      tone: b.status === "PAID" ? "emerald" : "amber",
    });
  }
  for (const l of leads) {
    items.push({
      id: `lead-${l.id}`,
      kind: "LEAD",
      icon: "🌱",
      title: `New lead · ${l.name}`,
      subtitle: `${l.companyName ?? "—"} · ${l.status}`,
      href: `/${params.tenant}/crm/leads/${l.id}`,
      at: l.createdAt,
      tone: "indigo",
    });
  }
  for (const d of deals) {
    items.push({
      id: `deal-${d.id}`,
      kind: "DEAL",
      icon: "🎯",
      title: `Deal · ${d.name}`,
      subtitle: `${d.stage.name} · ${fmtMoney(d.amountCents)}`,
      href: `/${params.tenant}/crm/deals/${d.id}`,
      at: d.updatedAt,
      tone: d.status === "WON" ? "emerald" : d.status === "LOST" ? "rose" : "indigo",
    });
  }
  for (const a of crmActivities) {
    items.push({
      id: `crm-${a.id}`,
      kind: "CRM_ACTIVITY",
      icon: "🗒",
      title: `${a.type.toLowerCase()} · ${a.subject}`,
      subtitle: a.body ? a.body.slice(0, 80) : "Logged in CRM",
      href: a.dealId
        ? `/${params.tenant}/crm/deals/${a.dealId}`
        : a.leadId
          ? `/${params.tenant}/crm/leads/${a.leadId}`
          : `/${params.tenant}/crm`,
      at: a.createdAt,
      tone: "slate",
    });
  }
  for (const t of tasks) {
    items.push({
      id: `task-${t.id}`,
      kind: "TASK_DONE",
      icon: "✓",
      title: `Task done · ${t.title}`,
      subtitle: `${t.engagement.entity.name} · ${t.engagement.name}`,
      href: `/${params.tenant}/practice/engagements/${t.engagementId}`,
      at: t.updatedAt,
      tone: "emerald",
    });
  }
  for (const e of timeEntries) {
    items.push({
      id: `time-${e.id}`,
      kind: "TIME",
      icon: "⏱",
      title: `${e.durationMinutes}m logged · ${e.description}`,
      subtitle: `${e.engagement.entity.name} · ${e.engagement.name} · ${e.status}`,
      href: `/${params.tenant}/time`,
      at: e.startedAt,
      tone: e.status === "BILLED" ? "emerald" : "amber",
    });
  }
  for (const lt of letters) {
    items.push({
      id: `letter-${lt.id}`,
      kind: "LETTER",
      icon: "📝",
      title: `Engagement letter · ${lt.status}`,
      subtitle: `${lt.engagement.entity.name} · ${lt.subject}`,
      href: `/${params.tenant}/practice/letters/${lt.id}`,
      at: lt.updatedAt,
      tone: lt.status === "SIGNED" ? "emerald" : "sky",
    });
  }
  for (const u of portalUploads) {
    items.push({
      id: `upload-${u.id}`,
      kind: "PORTAL_UPLOAD",
      icon: "📎",
      title: `Client upload · ${u.fileName}`,
      subtitle: u.fileSizeBytes ? `${(Number(u.fileSizeBytes) / 1024).toFixed(0)} KB` : "File",
      href: `/${params.tenant}/practice/clients`,
      at: u.createdAt,
      tone: "sky",
    });
  }

  // Filter
  const filtered =
    kindFilter === "ALL"
      ? items
      : items.filter((i) => i.kind === kindFilter);

  // Sort by time desc, cap to 100
  filtered.sort((a, b) => b.at.getTime() - a.at.getTime());
  const view = filtered.slice(0, 100);

  // Counts for filter pills
  const countByKind = items.reduce<Record<string, number>>((acc, i) => {
    acc[i.kind] = (acc[i.kind] ?? 0) + 1;
    return acc;
  }, {});

  const filterTabs = [
    { value: "ALL", label: "All", count: items.length },
    { value: "INVOICE", label: "Invoices", count: countByKind.INVOICE ?? 0 },
    { value: "PAYMENT", label: "Payments", count: countByKind.PAYMENT ?? 0 },
    { value: "BILL", label: "Bills", count: countByKind.BILL ?? 0 },
    { value: "LEAD", label: "Leads", count: countByKind.LEAD ?? 0 },
    { value: "DEAL", label: "Deals", count: countByKind.DEAL ?? 0 },
    {
      value: "CRM_ACTIVITY",
      label: "CRM notes",
      count: countByKind.CRM_ACTIVITY ?? 0,
    },
    { value: "TIME", label: "Time", count: countByKind.TIME ?? 0 },
    { value: "TASK_DONE", label: "Tasks", count: countByKind.TASK_DONE ?? 0 },
    { value: "LETTER", label: "Letters", count: countByKind.LETTER ?? 0 },
    {
      value: "PORTAL_UPLOAD",
      label: "Client uploads",
      count: countByKind.PORTAL_UPLOAD ?? 0,
    },
  ].filter((t) => t.value === "ALL" || t.count > 0);

  // Group by day
  const groups = new Map<string, ActivityItem[]>();
  for (const item of view) {
    const d = new Date(item.at);
    d.setHours(0, 0, 0, 0);
    const key = d.toISOString();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }
  const sortedGroups = Array.from(groups.entries()).sort(
    (a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime()
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  function groupLabel(key: string): string {
    const d = new Date(key);
    if (d.getTime() === today.getTime()) return "Today";
    if (d.getTime() === yesterday.getTime()) return "Yesterday";
    return d.toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Activity</h1>
        <p className="mt-1 text-sm text-slate-500">
          Everything happening across {auth.tenant.name}, in one feed.
        </p>
      </div>

      <div className="mt-6 flex flex-wrap gap-2 text-xs">
        {filterTabs.map((t) => {
          const active = kindFilter === t.value;
          return (
            <Link
              key={t.value}
              href={`/${params.tenant}/inbox?kind=${t.value}`}
              className={`rounded-full px-3 py-1 ${
                active
                  ? "bg-slate-900 text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {t.label} · {t.count}
            </Link>
          );
        })}
      </div>

      {view.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
          No activity yet. Once you start invoicing, logging time, or tracking
          leads, it&apos;ll show up here.
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {sortedGroups.map(([key, group]) => (
            <div key={key}>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                {groupLabel(key)}
              </div>
              <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-white">
                {group.map((item, i) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    className={`flex items-start gap-3 p-3 hover:bg-slate-50 ${
                      i > 0 ? "border-t border-slate-100" : ""
                    }`}
                  >
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm ${
                        TONE[item.tone]
                      }`}
                    >
                      {item.icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-sm font-medium text-slate-900">
                        {item.title}
                      </div>
                      <div className="truncate text-xs text-slate-500">
                        {item.subtitle}
                      </div>
                    </div>
                    <div className="shrink-0 text-xs text-slate-400">
                      {relTime(item.at)}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
