/*
 * Stock movements API (Sprint 20, authenticated). GET returns a paginated,
 * filterable slice of the movement ledger. RBAC inventory:manage.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { requirePermission, PermissionError } from "@/lib/rbac/require-permission";
import { listMovements } from "@/lib/inventory/queries";

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
    const sp = req.nextUrl.searchParams;
    const from = sp.get("from") ? new Date(sp.get("from") as string) : undefined;
    const to = sp.get("to") ? new Date(sp.get("to") as string) : undefined;
    const result = await listMovements(db, {
      productId: sp.get("productId") ?? undefined,
      warehouseId: sp.get("warehouseId") ?? undefined,
      type: sp.get("type") ?? undefined,
      from: from && !Number.isNaN(from.getTime()) ? from : undefined,
      to: to && !Number.isNaN(to.getTime()) ? to : undefined,
      page: sp.get("page") ? Number(sp.get("page")) : undefined,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return fail(err);
  }
}
