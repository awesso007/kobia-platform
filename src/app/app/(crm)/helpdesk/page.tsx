/*
 * Helpdesk dashboard (Sprint 15). Server component: loads aggregate stats and
 * recent tickets, renders status/priority breakdowns and SLA breach count.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import Link from "next/link";
import { dashboardStats } from "./queries";
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../CrmError";
import { fmtDateTime } from "./helpdesk-utils";
import { HelpdeskTabs, PageHeader, StatusBadge, PriorityChip } from "./HelpdeskUI";

export const dynamic = "force-dynamic";

export default async function HelpdeskDashboardPage() {
  try {
    const stats = await dashboardStats();
    return (
      <div className="p-6">
        <PageHeader
          title="Helpdesk"
          subtitle="Tickets, SLA tracking, and a customer knowledge base."
          action={
            <Link
              href="/app/helpdesk/tickets/new"
              className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
            >
              New ticket
            </Link>
          }
        />
        <HelpdeskTabs active="/app/helpdesk" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Total tickets" value={stats.total} />
          <Stat label="Unassigned (open)" value={stats.unassigned} />
          <Stat label="SLA breaching" value={stats.breaching} danger={stats.breaching > 0} />
          <Stat label="Resolved" value={stats.byStatus.RESOLVED ?? 0} />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="rounded border border-slate-200 p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">By status</h2>
            <ul className="space-y-2">
              {Object.entries(stats.byStatus).map(([k, v]) => (
                <li key={k} className="flex items-center justify-between text-sm">
                  <StatusBadge status={k} />
                  <span className="font-medium text-slate-700">{v}</span>
                </li>
              ))}
              {Object.keys(stats.byStatus).length === 0 ? (
                <li className="text-sm text-slate-500">No tickets yet.</li>
              ) : null}
            </ul>
          </div>
          <div className="rounded border border-slate-200 p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">By priority</h2>
            <ul className="space-y-2">
              {Object.entries(stats.byPriority).map(([k, v]) => (
                <li key={k} className="flex items-center justify-between text-sm">
                  <PriorityChip priority={k} />
                  <span className="font-medium text-slate-700">{v}</span>
                </li>
              ))}
              {Object.keys(stats.byPriority).length === 0 ? (
                <li className="text-sm text-slate-500">No tickets yet.</li>
              ) : null}
            </ul>
          </div>
        </div>

        <div className="mt-6 rounded border border-slate-200">
          <h2 className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">
            Recent tickets
          </h2>
          <ul className="divide-y divide-slate-100">
            {stats.recent.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/app/helpdesk/tickets/${t.id}`}
                  className="flex items-center justify-between px-4 py-3 text-sm hover:bg-slate-50"
                >
                  <span className="flex items-center gap-3">
                    <span className="font-mono text-xs text-slate-400">#{t.number}</span>
                    <span className="font-medium text-slate-800">{t.subject}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <PriorityChip priority={t.priority} />
                    <StatusBadge status={t.status} />
                    <span className="text-xs text-slate-400">{fmtDateTime(t.createdAt)}</span>
                  </span>
                </Link>
              </li>
            ))}
            {stats.recent.length === 0 ? (
              <li className="px-4 py-6 text-sm text-slate-500">No tickets yet.</li>
            ) : null}
          </ul>
        </div>
      </div>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}

function Stat({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
  return (
    <div className="rounded border border-slate-200 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${danger ? "text-red-600" : "text-slate-900"}`}>
        {value}
      </p>
    </div>
  );
}
