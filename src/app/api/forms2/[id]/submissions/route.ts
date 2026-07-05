/*
 * Forms 2.0 submissions list API (Sprint 19, authenticated). GET returns recent
 * submissions for a form. RBAC form:manage.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { requirePermission, PermissionError } from "@/lib/rbac/require-permission";
import { listSubmissions } from "@/lib/forms2/queries";

export const dynamic = "force-dynamic";

function fail(err: unknown) {
  if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
  if (err instanceof NoTenantError) return NextResponse.json({ ok: false, error: "No tenant." }, { status: 400 });
  return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission("form:manage");
    const { db } = getTenantDb();
    const submissions = await listSubmissions(db, params.id);
    return NextResponse.json({ ok: true, submissions });
  } catch (err) {
    return fail(err);
  }
}
