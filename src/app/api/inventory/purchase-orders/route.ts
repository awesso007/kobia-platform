/*
 * Purchase orders collection API (Sprint 20, authenticated). GET lists POs
 * (optional status filter); POST creates a DRAFT PO with line items and computed
 * totals. RBAC inventory:manage.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { requirePermission, PermissionError } from "@/lib/rbac/require-permission";
import { listPurchaseOrders } from "@/lib/inventory/queries";
import { createPurchaseOrder } from "@/lib/inventory/mutations";

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
    return NextResponse.json({ ok: true, purchaseOrders: await listPurchaseOrders(db, { status: req.nextUrl.searchParams.get("status") ?? undefined }) });
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
    await requirePermission("inventory:manage");
    const { db } = getTenantDb();
    const items = Array.isArray(body.items)
      ? (body.items as { productId: string; quantity: number; unitCostCents: number }[]).map((i) => ({
          productId: String(i.productId),
          quantity: Number(i.quantity),
          unitCostCents: Number(i.unitCostCents),
        }))
      : [];
    const expected = body.expectedDate ? new Date(String(body.expectedDate)) : null;
    const id = await createPurchaseOrder(db, {
      vendorId: String(body.vendorId ?? ""),
      warehouseId: String(body.warehouseId ?? ""),
      currency: (body.currency as string) || undefined,
      taxCents: body.taxCents !== undefined ? Number(body.taxCents) : undefined,
      expectedDate: expected && !Number.isNaN(expected.getTime()) ? expected : null,
      notes: (body.notes as string) ?? null,
      items,
    });
    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (err) {
    return fail(err);
  }
}
