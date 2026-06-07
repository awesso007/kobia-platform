/*
 * Single ticket API (Sprint 15, authenticated). GET returns the ticket with its
 * thread; DELETE removes it. Status/priority/assignment/reply/watcher changes
 * have their own sub-routes.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse } from "next/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { requirePermission, PermissionError } from "@/lib/rbac/require-permission";
import { removeFromIndex } from "@/lib/search";
import { getTicket } from "@/app/app/(crm)/helpdesk/queries";

export const dynamic = "force-dynamic";

function fail(err: unknown) {
  if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
  if (err instanceof NoTenantError) return NextResponse.json({ ok: false, error: "No tenant." }, { status: 400 });
  return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requirePermission("record:read");
    const ticket = await getTicket(params.id);
    if (!ticket) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
    return NextResponse.json({ ok: true, ticket });
  } catch (err) {
    return fail(err);
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requirePermission("record:delete");
    const { db } = getTenantDb();
    await db.ticket.delete({ where: { id: params.id } });
    await removeFromIndex(db, "TICKET", params.id).catch(() => undefined);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}
