/*
 * Single workflow run API (Sprint 18, authenticated). GET returns the run with
 * its step-by-step log. RBAC automation:manage.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { requirePermission, PermissionError } from "@/lib/rbac/require-permission";
import { getRun } from "@/lib/workflows/queries";

export const dynamic = "force-dynamic";

function fail(err: unknown) {
  if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
  if (err instanceof NoTenantError) return NextResponse.json({ ok: false, error: "No tenant." }, { status: 400 });
  return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
}

export async function GET(_req: NextRequest, { params }: { params: { id: string; runId: string } }) {
  try {
    await requirePermission("automation:manage");
    const { db } = getTenantDb();
    const run = await getRun(db, params.id, params.runId);
    if (!run) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
    return NextResponse.json({ ok: true, run });
  } catch (err) {
    return fail(err);
  }
}
