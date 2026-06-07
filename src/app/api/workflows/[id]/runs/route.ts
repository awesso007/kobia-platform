/*
 * Workflow runs list API (Sprint 18, authenticated). GET lists runs for a
 * workflow, optionally filtered by ?status=. RBAC automation:manage.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { requirePermission, PermissionError } from "@/lib/rbac/require-permission";
import { listRuns } from "@/lib/workflows/queries";

export const dynamic = "force-dynamic";

function fail(err: unknown) {
  if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
  if (err instanceof NoTenantError) return NextResponse.json({ ok: false, error: "No tenant." }, { status: 400 });
  return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission("automation:manage");
    const status = req.nextUrl.searchParams.get("status") || undefined;
    const { db } = getTenantDb();
    const runs = await listRuns(db, params.id, status);
    return NextResponse.json({ ok: true, runs });
  } catch (err) {
    return fail(err);
  }
}
