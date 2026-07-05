/*
 * Global stock API (Sprint 20, authenticated). GET returns product-x-warehouse
 * stock rows, optionally filtered by warehouse or a product/sku search string.
 * RBAC inventory:manage.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { requirePermission, PermissionError } from "@/lib/rbac/require-permission";
import { listStock } from "@/lib/inventory/queries";

export const dynamic = "force-dynamic";

function fail(err: unknown) {
  if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
  if (err instanceof NoTenantError) return NextResponse.json({ ok: false, error: "No tenant." }, { status: 400 });
  return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
}

export async function GET(req: NextRequest) {
  try {
    await requirePermission("inventory:manage");
    const { db } = getTenantDb();
    const search = req.nextUrl.searchParams.get("search") ?? undefined;
    const warehouseId = req.nextUrl.searchParams.get("warehouseId") ?? undefined;
    return NextResponse.json({ ok: true, stock: await listStock(db, { search, warehouseId }) });
  } catch (err) {
    return fail(err);
  }
}
