/*
 * Single warehouse API (Sprint 20, authenticated). GET returns the warehouse
 * plus its stock rows; PATCH updates it; DELETE removes it (cascade of stock
 * items and movements). RBAC inventory:manage.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { requirePermission, PermissionError } from "@/lib/rbac/require-permission";
import { getWarehouse } from "@/lib/inventory/queries";
import { updateWarehouse, deleteWarehouse } from "@/lib/inventory/mutations";

export const dynamic = "force-dynamic";

function fail(err: unknown) {
  if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
  if (err instanceof NoTenantError) return NextResponse.json({ ok: false, error: "No tenant." }, { status: 400 });
  return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission("inventory:manage");
    const { db } = getTenantDb();
    const result = await getWarehouse(db, params.id);
    if (!result) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return fail(err);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  try {
    await requirePermission("inventory:manage");
    const { db } = getTenantDb();
    await updateWarehouse(db, params.id, {
      name: body.name as string | undefined,
      code: body.code as string | undefined,
      address: body.address as string | null | undefined,
      city: body.city as string | null | undefined,
      region: body.region as string | null | undefined,
      country: body.country as string | null | undefined,
      isDefault: body.isDefault as boolean | undefined,
      active: body.active as boolean | undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission("inventory:manage");
    const { db } = getTenantDb();
    await deleteWarehouse(db, params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}
