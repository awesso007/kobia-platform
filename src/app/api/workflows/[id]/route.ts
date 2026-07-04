/*
 * Single workflow API (Sprint 18, authenticated). GET returns detail (graph +
 * variables); PATCH updates name/description/trigger/graph/status/variables;
 * DELETE removes it. RBAC automation:manage; tenant via getTenantDb().
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { requirePermission, PermissionError } from "@/lib/rbac/require-permission";
import { getWorkflow } from "@/lib/workflows/queries";
import { updateWorkflow, deleteWorkflow } from "@/lib/workflows/mutations";
import { asGraph } from "@/lib/workflows/workflow-utils";

export const dynamic = "force-dynamic";

function fail(err: unknown) {
  if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
  if (err instanceof NoTenantError) return NextResponse.json({ ok: false, error: "No tenant." }, { status: 400 });
  return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission("automation:manage");
    const { db } = getTenantDb();
    const workflow = await getWorkflow(db, params.id);
    if (!workflow) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
    return NextResponse.json({ ok: true, workflow });
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
    await requirePermission("automation:manage");
    const { db } = getTenantDb();
    await updateWorkflow(db, params.id, {
      name: body.name !== undefined ? String(body.name) : undefined,
      description: body.description !== undefined ? (body.description as string | null) : undefined,
      entryTriggerType: body.entryTriggerType !== undefined ? String(body.entryTriggerType) : undefined,
      entryTriggerFilter: body.entryTriggerFilter,
      graph: body.graph !== undefined ? asGraph(body.graph) : undefined,
      status: body.status as "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED" | undefined,
      variables: body.variables as { name: string; type: "STRING" | "NUMBER" | "BOOLEAN" | "JSON"; defaultValue?: string | null }[] | undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission("automation:manage");
    const { db } = getTenantDb();
    await deleteWorkflow(db, params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}
