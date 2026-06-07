/*
 * Customer helpdesk portal: ticket detail (Sprint 15). Public, gated by the
 * portal session cookie and namespaced under /portal/helpdesk to avoid colliding
 * with the existing client portal at /portal. Tenant resolved from a validated
 * `?t=<slug>` query. The contact may only view their own ticket; internal notes
 * are never shown to the customer.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import Link from "next/link";
import { cookies } from "next/headers";
import { getTenantPrisma, schemaNameForSlug } from "@/lib/db/tenant-prisma";
import { validatePortalSession, PORTAL_COOKIE } from "@/lib/helpdesk/portal";
import { statusClass, priorityClass, fmtDateTime } from "@/app/app/(crm)/helpdesk/helpdesk-utils";
import { PortalReply } from "../../PortalUI";

export const dynamic = "force-dynamic";

function sanitizeSlug(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(slug) ? slug : null;
}

export default async function PortalTicketDetail({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const q = (k: string) => (Array.isArray(searchParams[k]) ? searchParams[k]?.[0] : searchParams[k]) as string | undefined;
  const tenant = sanitizeSlug(q("t")) ?? sanitizeSlug(q("tenant"));
  if (!tenant) return <Shell><Unavailable /></Shell>;
  const tq = `?t=${encodeURIComponent(tenant)}`;

  try {
    const db = getTenantPrisma(schemaNameForSlug(tenant));
    const session = await validatePortalSession(db, cookies().get(PORTAL_COOKIE)?.value);
    if (!session) return <Shell><Unavailable /></Shell>;

    const ticket = await db.ticket.findUnique({
      where: { id: params.id },
      include: {
        messages: {
          where: { isInternal: false },
          orderBy: { createdAt: "asc" },
          select: { id: true, authorType: true, authorName: true, bodyHtml: true, createdAt: true },
        },
      },
    });
    if (!ticket || ticket.requesterContactId !== session.contactId) {
      return <Shell><Unavailable /></Shell>;
    }

    return (
      <Shell>
        <Link href={`/portal/helpdesk${tq}`} className="text-sm text-slate-500 hover:underline">
          Back to your tickets
        </Link>
        <div className="mt-4 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">{ticket.subject}</h1>
            <p className="mt-1 flex items-center gap-3 text-sm text-slate-500">
              <span className="font-mono text-xs text-slate-400">#{ticket.number}</span>
              <span>Opened {fmtDateTime(ticket.createdAt)}</span>
            </p>
          </div>
          <span className="flex items-center gap-2">
            <Badge cls={priorityClass(ticket.priority)}>{ticket.priority}</Badge>
            <Badge cls={statusClass(ticket.status)}>{ticket.status}</Badge>
          </span>
        </div>

        {ticket.description ? (
          <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Description</p>
            <div
              className="prose mt-2 max-w-none text-sm text-slate-800"
              dangerouslySetInnerHTML={{ __html: ticket.description }}
            />
          </div>
        ) : null}

        <ul className="mt-6 space-y-3">
          {ticket.messages.map((m) => {
            const fromCustomer = m.authorType === "CUSTOMER";
            return (
              <li
                key={m.id}
                className={`rounded-lg border p-4 shadow-sm ${
                  fromCustomer ? "border-slate-200 bg-white" : "border-sky-200 bg-sky-50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-900">
                    {fromCustomer ? "You" : m.authorName || "Support"}
                  </span>
                  <span className="text-xs text-slate-400">{fmtDateTime(m.createdAt)}</span>
                </div>
                <div
                  className="prose mt-2 max-w-none text-sm text-slate-800"
                  dangerouslySetInnerHTML={{ __html: m.bodyHtml }}
                />
              </li>
            );
          })}
          {ticket.messages.length === 0 ? (
            <li className="text-sm text-slate-500">No replies yet.</li>
          ) : null}
        </ul>

        <div className="mt-6 border-t border-slate-200 pt-4">
          <PortalReply tenant={tenant} ticketId={ticket.id} />
        </div>
      </Shell>
    );
  } catch {
    return <Shell><Unavailable /></Shell>;
  }
}

function Badge({ cls, children }: { cls: string; children: React.ReactNode }) {
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}

function Unavailable() {
  return (
    <>
      <p className="text-base text-slate-700">This ticket is not available.</p>
      <p className="mt-1 text-sm text-slate-500">The link may be invalid.</p>
    </>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-3xl">{children}</div>
    </div>
  );
}
