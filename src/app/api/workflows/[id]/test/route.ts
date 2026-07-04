/*
 * Workflow test-run API (Sprint 18, authenticated). POST kicks off an immediate
 * run with a sample payload (body.payload), bypassing the trigger match. Returns
 * the new run id. RBAC automation:manage; tenant via getTenantDb().
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { requirePermission, PermissionError } from "@/lib/rbac/require-permission";
import { testRun } from "@/lib/workflows/runner";

export const dynamic = "force-dynamic";

function fail(err: unknown) {
  if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
  if (err instanceof NoTenantError) return NextResponse.json({ ok: false, error: "No tenant." }, { status: 400 });
  return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    // empty payload is fine
  }
  try {
    await requirePermission("automation:manage");
    const payload = (body.payload && typeof body.payload === "object" ? body.payload : {}) as Record<string, unknown>;
    const { db } = getTenantDb();
    const runId = await testRun(db, params.id, payload);
    if (!runId) return NextResponse.json({ ok: false, error: "Workflow not found." }, { status: 404 });
    return NextResponse.json({ ok: true, runId }, { status: 201 });
  } catch (err) {
    return fail(err);
  }
}
