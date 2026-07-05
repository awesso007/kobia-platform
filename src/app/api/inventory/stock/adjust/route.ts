/*
 * Stock adjustment API (Sprint 20, authenticated). POST records a signed
 * ADJUSTMENT movement for a product in a warehouse and keeps the running
 * StockItem quantity consistent (see lib/inventory/stock). RBAC inventory:manage.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { requirePermission, PermissionError, getCurrentMembership } from "@/lib/rbac/require-permission";
import { adjustStock } from "@/lib/inventory/stock";

export const dynamic = "force-dynamic";

function fail(err: unknown) {
  if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
  if (err instanceof NoTenantError) return NextResponse.json({ ok: false, error: "No tenant." }, { status: 400 });
  return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  try {
    await requirePermission("inventory:manage");
    const productId = String(body.productId ?? "");
    const warehouseId = String(body.warehouseId ?? "");
    const delta = Number(body.delta);
    if (!productId || !warehouseId) return NextResponse.json({ ok: false, error: "productId and warehouseId are required." }, { status: 400 });
    if (!Number.isInteger(delta) || delta === 0) return NextResponse.json({ ok: false, error: "delta must be a non-zero integer." }, { status: 400 });
    const { db } = getTenantDb();
    const member = await getCurrentMembership();
    await adjustStock(db, { productId, warehouseId, delta, note: (body.note as string) ?? null, createdById: member?.clerkUserId ?? null });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}
