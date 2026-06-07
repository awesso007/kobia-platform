/*
 * Customer helpdesk portal: open a new ticket (Sprint 15). Public, gated by the
 * portal session cookie and namespaced under /portal/helpdesk to avoid colliding
 * with the existing client portal at /portal. Tenant resolved from a validated
 * `?t=<slug>` query. Unauthenticated visitors are sent back to the portal
 * landing to sign in first.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getTenantPrisma, schemaNameForSlug } from "@/lib/db/tenant-prisma";
import { validatePortalSession, PORTAL_COOKIE } from "@/lib/helpdesk/portal";
import { PortalNewTicket } from "../../PortalUI";

export const dynamic = "force-dynamic";

function sanitizeSlug(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(slug) ? slug : null;
}

export default async function PortalNewTicketPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const q = (k: string) => (Array.isArray(searchParams[k]) ? searchParams[k]?.[0] : searchParams[k]) as string | undefined;
  const tenant = sanitizeSlug(q("t")) ?? sanitizeSlug(q("tenant"));
  if (!tenant) return <Shell><Unavailable /></Shell>;
  const tq = `?t=${encodeURIComponent(tenant)}`;

  let signedIn = false;
  try {
    const db = getTenantPrisma(schemaNameForSlug(tenant));
    const session = await validatePortalSession(db, cookies().get(PORTAL_COOKIE)?.value);
    signedIn = session !== null;
  } catch {
    return <Shell><Unavailable /></Shell>;
  }

  if (!signedIn) redirect(`/portal/helpdesk${tq}`);

  return (
    <Shell>
      <Link href={`/portal/helpdesk${tq}`} className="text-sm text-slate-500 hover:underline">
        Back to your tickets
      </Link>
      <h1 className="mt-4 text-2xl font-semibold text-slate-900">New ticket</h1>
      <p className="mt-1 text-sm text-slate-500">Tell us what you need help with.</p>
      <div className="mt-6">
        <PortalNewTicket tenant={tenant} />
      </div>
    </Shell>
  );
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
