/*
 * Workflows collection API (Sprint 18, authenticated). GET lists workflows;
 * POST creates one. Guarded by RBAC (automation:manage), tenant via
 * getTenantDb().
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { requirePermission, PermissionError } from "@/lib/rbac/require-permission";
import { listWorkflows } from "@/lib/workflows/queries";
import { createWorkflow } from "@/lib/workflows/mutations";

export const dynamic = "force-dynamic";

function fail(err: unknown) {
  if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
  if (err instanceof NoTenantError) return NextResponse.json({ ok: false, error: "No tenant." }, { status: 400 });
  return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
}

export async function GET() {
  try {
    await requirePermission("automation:manage");
    const { db } = getTenantDb();
    const workflows = await listWorkflows(db);
    return NextResponse.json({ ok: true, workflows });
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
    await requirePermission("automation:manage");
    const name = String(body.name ?? "").trim();
    const entryTriggerType = String(body.entryTriggerType ?? "").trim();
    if (!name) return NextResponse.json({ ok: false, error: "Name is required." }, { status: 400 });
    if (!entryTriggerType) return NextResponse.json({ ok: false, error: "Entry trigger is required." }, { status: 400 });
    const { db } = getTenantDb();
    const id = await createWorkflow(db, {
      name,
      description: (body.description as string) || null,
      entryTriggerType,
    });
    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (err) {
    return fail(err);
  }
}
