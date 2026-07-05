/*
 * Transfer receive action (Sprint 20, authenticated). POST moves an IN_TRANSIT
 * transfer to RECEIVED and records a TRANSFER_IN movement per line into the
 * destination warehouse. Fires TRANSFER_RECEIVED automation. RBAC inventory:manage.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { requirePermission, PermissionError, getCurrentMembership } from "@/lib/rbac/require-permission";
import { transferReceive } from "@/lib/inventory/stock";

export const dynamic = "force-dynamic";

function fail(err: unknown) {
  if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
  if (err instanceof NoTenantError) return NextResponse.json({ ok: false, error: "No tenant." }, { status: 400 });
  return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
}

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission("inventory:manage");
    const { db } = getTenantDb();
    const member = await getCurrentMembership();
    await transferReceive(db, params.id, member?.clerkUserId ?? null);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}
