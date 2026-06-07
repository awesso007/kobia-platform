/*
 * Ticket watchers API (Sprint 15, authenticated). POST adds a watcher, DELETE
 * removes one (userId in the JSON body for both).
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { requirePermission, PermissionError } from "@/lib/rbac/require-permission";
import { addWatcher, removeWatcher } from "@/lib/helpdesk/tickets";

export const dynamic = "force-dynamic";

function fail(err: unknown) {
  if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
  if (err instanceof NoTenantError) return NextResponse.json({ ok: false, error: "No tenant." }, { status: 400 });
  return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
}

async function userIdFrom(req: NextRequest): Promise<string> {
  try {
    const body = (await req.json()) as { userId?: unknown };
    return String(body.userId ?? "").trim();
  } catch {
    return "";
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission("record:update");
    const userId = await userIdFrom(req);
    if (!userId) return NextResponse.json({ ok: false, error: "userId is required." }, { status: 400 });
    const { db } = getTenantDb();
    await addWatcher(db, params.id, userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission("record:update");
    const userId = await userIdFrom(req);
    if (!userId) return NextResponse.json({ ok: false, error: "userId is required." }, { status: 400 });
    const { db } = getTenantDb();
    await removeWatcher(db, params.id, userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}
