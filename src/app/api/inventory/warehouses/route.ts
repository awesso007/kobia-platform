/*
 * Warehouses collection API (Sprint 20, authenticated). GET lists warehouses
 * with SKU counts; POST creates one. RBAC inventory:manage.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { requirePermission, PermissionError } from "@/lib/rbac/require-permission";
import { listWarehouses } from "@/lib/inventory/queries";
import { createWarehouse } from "@/lib/inventory/mutations";

export const dynamic = "force-dynamic";

function fail(err: unknown) {
  if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
  if (err instanceof NoTenantError) return NextResponse.json({ ok: false, error: "No tenant." }, { status: 400 });
  return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
}

export async function GET() {
  try {
    await requirePermission("inventory:manage");
    const { db } = getTenantDb();
    return NextResponse.json({ ok: true, warehouses: await listWarehouses(db) });
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
    const id = await createWarehouse(db, {
      name: String(body.name ?? ""),
      code: String(body.code ?? ""),
      address: (body.address as string) ?? null,
      city: (body.city as string) ?? null,
      region: (body.region as string) ?? null,
      country: (body.country as string) ?? null,
      isDefault: Boolean(body.isDefault),
      active: body.active === undefined ? true : Boolean(body.active),
    });
    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (err) {
    return fail(err);
  }
}
