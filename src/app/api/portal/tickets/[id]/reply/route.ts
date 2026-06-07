/*
 * Customer portal ticket reply (Sprint 15, public). Gated by the portal session
 * cookie. The contact may only reply to their own tickets; the reply is posted
 * as a CUSTOMER message (never internal), which addMessage uses to reopen a
 * pending/resolved ticket.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantPrisma, schemaNameForSlug } from "@/lib/db/tenant-prisma";
import { validatePortalSession, PORTAL_COOKIE } from "@/lib/helpdesk/portal";
import { addMessage } from "@/lib/helpdesk/tickets";

export const dynamic = "force-dynamic";

function sanitizeSlug(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(slug) ? slug : null;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const tenant =
    sanitizeSlug(req.nextUrl.searchParams.get("t")) ?? sanitizeSlug(req.nextUrl.searchParams.get("tenant"));
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

    const ticket = await db.ticket.findUnique({ where: { id: params.id } });
    if (!ticket || ticket.requesterContactId !== session.contactId) {
      return NextResponse.json({ ok: false, error: "Ticket not found." }, { status: 404 });
    }
    const bodyHtml = String(body.bodyHtml ?? "").trim();
    if (!bodyHtml) return NextResponse.json({ ok: false, error: "Reply body is required." }, { status: 400 });

    const messageId = await addMessage(db, {
      ticketId: ticket.id,
      authorType: "CUSTOMER",
      authorName: ticket.requesterName,
      authorEmail: session.email,
      bodyHtml,
      isInternal: false,
    });
    return NextResponse.json({ ok: true, messageId }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}
