/*
 * Ticket assignment API (Sprint 15, authenticated). POST sets the assignee
 * and/or team via assignTicket. Omit a field to leave it unchanged; pass null
 * to clear it.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { requirePermission, PermissionError } from "@/lib/rbac/require-permission";
import { assignTicket } from "@/lib/helpdesk/tickets";

export const dynamic = "force-dynamic";

function fail(err: unknown) {
  if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
  if (err instanceof NoTenantError) return NextResponse.json({ ok: false, error: "No tenant." }, { status: 400 });
  return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  try {
    await requirePermission("record:update");
    const { db } = getTenantDb();
    const ok = await assignTicket(db, params.id, {
      assigneeId: "assigneeId" in body ? ((body.assigneeId as string) || null) : undefined,
      teamId: "teamId" in body ? ((body.teamId as string) || null) : undefined,
    });
    if (!ok) return NextResponse.json({ ok: false, error: "Ticket not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}
