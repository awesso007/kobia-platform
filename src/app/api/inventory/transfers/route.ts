/*
 * Stock transfers collection API (Sprint 20, authenticated). GET lists transfers
 * (optional status filter); POST creates a DRAFT transfer with line items. RBAC
 * inventory:manage.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { requirePermission, PermissionError, getCurrentMembership } from "@/lib/rbac/require-permission";
import { listTransfers } from "@/lib/inventory/queries";
import { createTransfer } from "@/lib/inventory/mutations";

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
    return NextResponse.json({ ok: true, transfers: await listTransfers(db, { status: req.nextUrl.searchParams.get("status") ?? undefined }) });
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
    const member = await getCurrentMembership();
    const items = Array.isArray(body.items)
      ? (body.items as { productId: string; quantity: number }[]).map((i) => ({ productId: String(i.productId), quantity: Number(i.quantity) }))
      : [];
    const id = await createTransfer(db, {
      fromWarehouseId: String(body.fromWarehouseId ?? ""),
      toWarehouseId: String(body.toWarehouseId ?? ""),
      notes: (body.notes as string) ?? null,
      items,
      createdById: member?.clerkUserId ?? null,
    });
    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (err) {
    return fail(err);
  }
}
