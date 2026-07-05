/*
 * Single vendor API (Sprint 20, authenticated). GET returns the vendor with its
 * purchase orders; PATCH updates fields; DELETE removes it. RBAC inventory:manage.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { requirePermission, PermissionError } from "@/lib/rbac/require-permission";
import { getVendor } from "@/lib/inventory/queries";
import { updateVendor, deleteVendor } from "@/lib/inventory/mutations";

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
    const vendor = await getVendor(db, params.id);
    if (!vendor) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
    return NextResponse.json({ ok: true, vendor });
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
    await updateVendor(db, params.id, {
      name: body.name as string | undefined,
      email: body.email as string | null | undefined,
      phone: body.phone as string | null | undefined,
      contactName: body.contactName as string | null | undefined,
      address: body.address as string | null | undefined,
      city: body.city as string | null | undefined,
      region: body.region as string | null | undefined,
      country: body.country as string | null | undefined,
      taxId: body.taxId as string | null | undefined,
      paymentTerms: body.paymentTerms as string | null | undefined,
      notes: body.notes as string | null | undefined,
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
    await deleteVendor(db, params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}
