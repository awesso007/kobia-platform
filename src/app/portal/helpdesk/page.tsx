/*
 * Customer helpdesk portal landing (Sprint 15). Public, namespaced under
 * /portal/helpdesk to avoid colliding with the existing client portal at
 * /portal. Tenant resolved from a validated `?t=<slug>` query; the customer is
 * identified by the portal session cookie (validatePortalSession). Shows the
 * email login when there is no session, otherwise the contact's own tickets.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import Link from "next/link";
import { cookies } from "next/headers";
import { getTenantPrisma, schemaNameForSlug } from "@/lib/db/tenant-prisma";
import { validatePortalSession, PORTAL_COOKIE } from "@/lib/helpdesk/portal";
import { statusClass, priorityClass, fmtDateTime } from "@/app/app/(crm)/helpdesk/helpdesk-utils";
import { PortalLogin, PortalSignOut } from "./PortalUI";

export const dynamic = "force-dynamic";

function sanitizeSlug(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(slug) ? slug : null;
}

export default async function PortalHome({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const q = (k: string) => (Array.isArray(searchParams[k]) ? searchParams[k]?.[0] : searchParams[k]) as string | undefined;
  const tenant = sanitizeSlug(q("t")) ?? sanitizeSlug(q("tenant"));
  if (!tenant) return <Shell><Unavailable /></Shell>;
  const tq = `?t=${encodeURIComponent(tenant)}`;

  try {
    const db = getTenantPrisma(schemaNameForSlug(tenant));
    const token = cookies().get(PORTAL_COOKIE)?.value;
    const session = await validatePortalSession(db, token);

    if (!session) {
      return (
        <Shell>
          <h1 className="text-2xl font-semibold text-slate-900">Support portal</h1>
          <p className="mt-1 text-sm text-slate-500">
            Enter your email to view your tickets or open a new one.
          </p>
          <div className="mt-6 max-w-sm">
            <PortalLogin tenant={tenant} />
          </div>
          <p className="mt-6 text-sm text-slate-500">
            Looking for help articles?{" "}
            <Link href={`/kb${tq}`} className="text-slate-700 underline">
              Browse the knowledge base
            </Link>
            .
          </p>
        </Shell>
      );
    }

    const tickets = await db.ticket.findMany({
      where: { requesterContactId: session.contactId },
      orderBy: { createdAt: "desc" },
      select: { id: true, number: true, subject: true, status: true, priority: true, createdAt: true },
    });

    return (
      <Shell>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Your tickets</h1>
            <p className="mt-1 text-sm text-slate-500">Signed in as {session.email}</p>
          </div>
          <PortalSignOut tenant={tenant} />
        </div>
        <div className="mt-4">
          <Link
            href={`/portal/helpdesk/tickets/new${tq}`}
            className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            New ticket
          </Link>
        </div>
        <ul className="mt-6 space-y-3">
          {tickets.map((t) => (
            <li key={t.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <Link href={`/portal/helpdesk/tickets/${t.id}${tq}`} className="flex items-center justify-between">
                <span className="flex items-center gap-3">
                  <span className="font-mono text-xs text-slate-400">#{t.number}</span>
                  <span className="font-medium text-slate-900">{t.subject}</span>
                </span>
                <span className="flex items-center gap-2">
                  <Badge cls={priorityClass(t.priority)}>{t.priority}</Badge>
                  <Badge cls={statusClass(t.status)}>{t.status}</Badge>
                  <span className="text-xs text-slate-400">{fmtDateTime(t.createdAt)}</span>
                </span>
              </Link>
            </li>
          ))}
          {tickets.length === 0 ? <li className="text-sm text-slate-500">You have no tickets yet.</li> : null}
        </ul>
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
      <p className="text-base text-slate-700">This portal is not available.</p>
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
