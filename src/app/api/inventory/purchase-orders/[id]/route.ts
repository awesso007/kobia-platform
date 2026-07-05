/*
 * Single purchase order API (Sprint 20, authenticated). GET returns the PO with
 * items; PATCH updates status/notes/expectedDate. Send and receive are separate
 * action endpoints. RBAC inventory:manage.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { requirePermission, PermissionError } from "@/lib/rbac/require-permission";
import { getPurchaseOrder } from "@/lib/inventory/queries";
import { updatePurchaseOrder } from "@/lib/inventory/mutations";

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
    const result = await getPurchaseOrder(db, params.id);
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
    const expected = body.expectedDate !== undefined ? (body.expectedDate ? new Date(String(body.expectedDate)) : null) : undefined;
    await updatePurchaseOrder(db, params.id, {
      status: body.status as string | undefined,
      notes: body.notes as string | null | undefined,
      expectedDate: expected && Number.isNaN(expected.getTime()) ? null : expected,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}
