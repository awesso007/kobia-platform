import { withAuditedHistoricalMutation } from "@/lib/chess/historical-mutation-response-audit-round57";
/*
 * Cancel a workflow run (Sprint 18, authenticated). POST sets a RUNNING/WAITING
 * run to CANCELED. RBAC automation:manage.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { requirePermission, PermissionError } from "@/lib/rbac/require-permission";
import { cancelRun } from "@/lib/workflows/runner";

import { workflowRunBelongsToWorkflow } from "@/lib/security/historical-resource-scope";

export const dynamic = "force-dynamic";

function fail(err: unknown) {
  if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
  if (err instanceof NoTenantError) return NextResponse.json({ ok: false, error: "No tenant." }, { status: 400 });
  return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
}

async function POSTOriginal(_req: NextRequest, { params }: { params: { id: string; runId: string } }) {
  try {
    await requirePermission("automation:manage");
    const { db } = getTenantDb();
    if (!await workflowRunBelongsToWorkflow(db, params.id, params.runId))
      return NextResponse.json({ ok: false, error: "Workflow run not found." }, { status: 404 });
    await cancelRun(db, params.runId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}

export const POST = withAuditedHistoricalMutation("workflows/[id]/runs/[runId]/cancel", "POST", POSTOriginal);
