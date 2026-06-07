/*
 * Customer portal tickets API (Sprint 15, public). Gated by the portal session
 * cookie (validatePortalSession), NOT requirePermission. GET lists the signed-in
 * contact's own tickets; POST opens a new ticket on their behalf (channel
 * PORTAL, requesterContactId bound to the session contact).
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantPrisma, schemaNameForSlug } from "@/lib/db/tenant-prisma";
import { validatePortalSession, PORTAL_COOKIE } from "@/lib/helpdesk/portal";
import { createTicket, type Priority } from "@/lib/helpdesk/tickets";

export const dynamic = "force-dynamic";

function sanitizeSlug(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(slug) ? slug : null;
}

function tenantFrom(req: NextRequest): string | null {
  return (
    sanitizeSlug(req.nextUrl.searchParams.get("t")) ?? sanitizeSlug(req.nextUrl.searchParams.get("tenant"))
  );
}

export async function GET(req: NextRequest) {
  const tenant = tenantFrom(req);
  if (!tenant) return NextResponse.json({ ok: false, error: "Unknown workspace." }, { status: 400 });
  try {
    const db = getTenantPrisma(schemaNameForSlug(tenant));
    const session = await validatePortalSession(db, req.cookies.get(PORTAL_COOKIE)?.value);
    if (!session) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
    const tickets = await db.ticket.findMany({
      where: { requesterContactId: session.contactId },
      orderBy: { createdAt: "desc" },
      select: { id: true, number: true, subject: true, status: true, priority: true, createdAt: true },
    });
    return NextResponse.json({ ok: true, tickets });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const tenant = tenantFrom(req);
  if (!tenant) return NextResponse.json({ ok: false, error: "Unknown workspace." }, { status: 400 });
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  try {
    const db = getTenantPrisma(schemaNameForSlug(tenant));
    const session = await validatePortalSession(db, req.cookies.get(PORTAL_COOKIE)?.value);
    if (!session) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
    const subject = String(body.subject ?? "").trim();
    if (!subject) return NextResponse.json({ ok: false, error: "Subject is required." }, { status: 400 });
    const contact = await db.contact.findUnique({ where: { id: session.contactId } });
    const requesterName =
      [contact?.firstName, contact?.lastName].filter(Boolean).join(" ").trim() || session.email;
    const id = await createTicket(db, {
      subject,
      description: String(body.description ?? ""),
      priority: (body.priority as Priority) || "NORMAL",
      requesterEmail: session.email,
      requesterName,
      requesterContactId: session.contactId,
      channel: "PORTAL",
      actorType: "CUSTOMER",
    });
    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}
