/*
 * Ticket list (Sprint 15). Server component: reads filters from searchParams,
 * lists matching tickets. Filter bar posts via GET to keep state in the URL.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import Link from "next/link";
import { listTickets } from "../queries";
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../CrmError";
import { fmtDateTime } from "../helpdesk-utils";
import { HelpdeskTabs, PageHeader, StatusBadge, PriorityChip } from "../HelpdeskUI";
import { TICKET_STATUSES, TICKET_PRIORITIES } from "../helpdesk-utils";

export const dynamic = "force-dynamic";

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: { status?: string; priority?: string; q?: string };
}) {
  try {
    const tickets = await listTickets({
      status: searchParams.status || undefined,
      priority: searchParams.priority || undefined,
      q: searchParams.q || undefined,
    });
    return (
      <div className="p-6">
        <PageHeader
          title="Tickets"
          subtitle="All support tickets across teams and channels."
          action={
            <Link
              href="/app/helpdesk/tickets/new"
              className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
            >
              New ticket
            </Link>
          }
        />
        <HelpdeskTabs active="/app/helpdesk/tickets" />

        <form method="GET" className="mb-4 flex flex-wrap items-end gap-2">
          <input
            name="q"
            defaultValue={searchParams.q ?? ""}
            placeholder="Search subject or requester"
            className="w-64 rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <select
            name="status"
            defaultValue={searchParams.status ?? ""}
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">All statuses</option>
            {TICKET_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            name="priority"
            defaultValue={searchParams.priority ?? ""}
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">All priorities</option>
            {TICKET_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <button className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
            Filter
          </button>
        </form>

        <div className="overflow-hidden rounded border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-2">#</th>
                <th className="px-4 py-2">Subject</th>
                <th className="px-4 py-2">Requester</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Priority</th>
                <th className="px-4 py-2">Team</th>
                <th className="px-4 py-2">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tickets.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-mono text-xs text-slate-400">
                    <Link href={`/app/helpdesk/tickets/${t.id}`}>#{t.number}</Link>
                  </td>
                  <td className="px-4 py-2 font-medium text-slate-800">
                    <Link href={`/app/helpdesk/tickets/${t.id}`} className="hover:underline">
                      {t.subject}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-slate-600">{t.requesterName}</td>
                  <td className="px-4 py-2">
                    <StatusBadge status={t.status} />
                  </td>
                  <td className="px-4 py-2">
                    <PriorityChip priority={t.priority} />
                  </td>
                  <td className="px-4 py-2 text-slate-600">{t.team?.name ?? "-"}</td>
                  <td className="px-4 py-2 text-xs text-slate-400">{fmtDateTime(t.createdAt)}</td>
                </tr>
              ))}
              {tickets.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-sm text-slate-500">
                    No tickets match these filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
