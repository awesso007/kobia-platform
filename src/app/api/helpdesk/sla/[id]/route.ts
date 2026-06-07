/*
 * Single SLA policy API (Sprint 15, authenticated). DELETE removes it; tickets
 * and categories keep slaPolicyId null via onDelete: SetNull / nullable column.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse } from "next/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { requirePermission, PermissionError } from "@/lib/rbac/require-permission";

export const dynamic = "force-dynamic";

function fail(err: unknown) {
  if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
  if (err instanceof NoTenantError) return NextResponse.json({ ok: false, error: "No tenant." }, { status: 400 });
  return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requirePermission("record:delete");
    const { db } = getTenantDb();
    await db.slaPolicy.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}
