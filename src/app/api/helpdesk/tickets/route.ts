/*
 * Helpdesk tickets API (Sprint 15, authenticated). GET lists tickets with the
 * same filters as the admin UI; POST opens a new ticket. Both enforce
 * requirePermission and go through getTenantDb(). The customer portal uses the
 * separate, unauthenticated /api/portal routes instead.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { requirePermission, PermissionError } from "@/lib/rbac/require-permission";
import { createTicket, type Priority } from "@/lib/helpdesk/tickets";
import { listTickets } from "@/app/app/(crm)/helpdesk/queries";

export const dynamic = "force-dynamic";

function fail(err: unknown) {
  if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
  if (err instanceof NoTenantError) return NextResponse.json({ ok: false, error: "No tenant." }, { status: 400 });
  return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
}

export async function GET(req: NextRequest) {
  try {
    await requirePermission("record:read");
    const sp = req.nextUrl.searchParams;
    const tickets = await listTickets({
      status: sp.get("status") || undefined,
      priority: sp.get("priority") || undefined,
      assigneeId: sp.get("assigneeId") || undefined,
      teamId: sp.get("teamId") || undefined,
      q: sp.get("q") || undefined,
    });
    return NextResponse.json({ ok: true, tickets });
  } catch (err) {
    return fail(err);
  }
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  try {
    await requirePermission("record:create");
    const subject = String(body.subject ?? "").trim();
    const requesterEmail = String(body.requesterEmail ?? "").trim();
    if (!subject) return NextResponse.json({ ok: false, error: "Subject is required." }, { status: 400 });
    if (!requesterEmail) return NextResponse.json({ ok: false, error: "Requester email is required." }, { status: 400 });
    const { db } = getTenantDb();
    const id = await createTicket(db, {
      subject,
      description: String(body.description ?? ""),
      priority: (body.priority as Priority) || undefined,
      requesterEmail,
      requesterName: String(body.requesterName ?? "").trim() || requesterEmail,
      teamId: (body.teamId as string) || null,
      categoryId: (body.categoryId as string) || null,
      slaPolicyId: (body.slaPolicyId as string) || null,
      assigneeId: (body.assigneeId as string) || null,
      channel: "MANUAL",
      actorType: "AGENT",
    });
    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (err) {
    return fail(err);
  }
}
