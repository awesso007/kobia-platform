/*
 * Ticket detail (Sprint 15). Server component: loads the ticket with messages,
 * audit trail, and relations. Conversation thread plus a controls sidebar
 * (status/priority/team) and a reply box, both client components.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTicket, listTeams } from "../../queries";
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../../CrmError";
import { fmtDateTime, fmtDueIn, isOverdue } from "../../helpdesk-utils";
import { StatusBadge, PriorityChip, TicketControls, ReplyBox } from "../../HelpdeskUI";

export const dynamic = "force-dynamic";

export default async function TicketDetailPage({ params }: { params: { id: string } }) {
  try {
    const [ticket, teams] = await Promise.all([getTicket(params.id), listTeams()]);
    if (!ticket) notFound();
    return (
      <div className="p-6">
        <Link href="/app/helpdesk/tickets" className="mb-4 inline-block text-sm text-slate-500 hover:underline">
          Back to tickets
        </Link>
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-3 text-xl font-semibold text-slate-900">
              <span className="font-mono text-base text-slate-400">#{ticket.number}</span>
              {ticket.subject}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {ticket.requesterName} ({ticket.requesterEmail}) - opened {fmtDateTime(ticket.createdAt)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <PriorityChip priority={ticket.priority} />
            <StatusBadge status={ticket.status} />
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
          <div className="space-y-4">
            <div className="rounded border border-slate-200 p-4">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
                Description
              </p>
              <div
                className="prose prose-sm max-w-none text-slate-700"
                dangerouslySetInnerHTML={{ __html: ticket.description || "<em>No description.</em>" }}
              />
            </div>

            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-slate-700">Conversation</h2>
              {ticket.messages.map((m) => (
                <div
                  key={m.id}
                  className={`rounded border p-3 ${
                    m.isInternal ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between text-xs text-slate-400">
                    <span className="font-medium text-slate-600">
                      {m.authorName} ({m.authorType})
                      {m.isInternal ? <span className="ml-2 text-amber-700">internal note</span> : null}
                    </span>
                    <span>{fmtDateTime(m.createdAt)}</span>
                  </div>
                  <div
                    className="prose prose-sm max-w-none text-slate-700"
                    dangerouslySetInnerHTML={{ __html: m.bodyHtml }}
                  />
                </div>
              ))}
              {ticket.messages.length === 0 ? (
                <p className="text-sm text-slate-500">No messages yet.</p>
              ) : null}
            </div>

            <div className="rounded border border-slate-200 p-4">
              <h2 className="mb-2 text-sm font-semibold text-slate-700">Add reply</h2>
              <ReplyBox ticketId={ticket.id} />
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded border border-slate-200 p-4">
              <h2 className="mb-3 text-sm font-semibold text-slate-700">Controls</h2>
              <TicketControls
                ticketId={ticket.id}
                status={ticket.status}
                priority={ticket.priority}
                teamId={ticket.teamId}
                teams={teams.map((t) => ({ id: t.id, name: t.name }))}
              />
            </div>

            <div className="rounded border border-slate-200 p-4 text-sm">
              <h2 className="mb-3 text-sm font-semibold text-slate-700">SLA</h2>
              <dl className="space-y-2 text-slate-600">
                <Row label="Policy" value={ticket.slaPolicy?.name ?? "none"} />
                <Row
                  label="First response"
                  value={ticket.firstResponseAt ? "met" : fmtDueIn(ticket.firstResponseDueAt)}
                  danger={!ticket.firstResponseAt && isOverdue(ticket.firstResponseDueAt)}
                />
                <Row
                  label="Resolve"
                  value={ticket.resolvedAt ? "met" : fmtDueIn(ticket.resolveDueAt)}
                  danger={!ticket.resolvedAt && isOverdue(ticket.resolveDueAt)}
                />
                <Row label="Category" value={ticket.category?.name ?? "none"} />
              </dl>
            </div>

            <div className="rounded border border-slate-200 p-4 text-sm">
              <h2 className="mb-3 text-sm font-semibold text-slate-700">Activity</h2>
              <ul className="space-y-2 text-xs text-slate-500">
                {ticket.auditEvents.map((e) => (
                  <li key={e.id}>
                    <span className="font-medium text-slate-600">{e.event}</span>
                    {e.oldValue || e.newValue ? (
                      <span>
                        {" "}
                        {e.oldValue ?? "-"} to {e.newValue ?? "-"}
                      </span>
                    ) : null}
                    <span className="block text-slate-400">{fmtDateTime(e.createdAt)}</span>
                  </li>
                ))}
                {ticket.auditEvents.length === 0 ? <li>No activity yet.</li> : null}
              </ul>
            </div>
          </aside>
        </div>
      </div>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}

function Row({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-slate-400">{label}</dt>
      <dd className={danger ? "font-medium text-red-600" : "text-slate-700"}>{value}</dd>
    </div>
  );
}
