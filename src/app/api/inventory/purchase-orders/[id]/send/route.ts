/*
 * Purchase order send action (Sprint 20, authenticated). POST transitions a
 * DRAFT PO to SENT and stamps sentAt. RBAC inventory:manage.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { requirePermission, PermissionError } from "@/lib/rbac/require-permission";
import { updatePurchaseOrder } from "@/lib/inventory/mutations";

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
    await updatePurchaseOrder(db, params.id, { status: "SENT" });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}
