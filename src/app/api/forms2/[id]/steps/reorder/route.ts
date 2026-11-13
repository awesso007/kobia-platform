import { withAuditedHistoricalMutation } from "@/lib/chess/historical-mutation-response-audit-round57";
/*
 * Forms 2.0 step reorder API (Sprint 19, authenticated). PATCH accepts an
 * ordered array of step ids and rewrites their order. RBAC form:manage.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { requirePermission, PermissionError } from "@/lib/rbac/require-permission";
import { reorderSteps } from "@/lib/forms2/mutations";

import { formExists, scopedFormStepsMatch } from "@/lib/security/historical-resource-scope";

export const dynamic = "force-dynamic";

function fail(err: unknown) {
  if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
  if (err instanceof NoTenantError) return NextResponse.json({ ok: false, error: "No tenant." }, { status: 400 });
  return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
}

async function PATCHOriginal(req: NextRequest, { params }: { params: { id: string } }) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  try {
    await requirePermission("form:manage");
    const orderedIds = Array.isArray(body.orderedIds) ? body.orderedIds.map(String) : [];
    const { db } = getTenantDb();
    if (!await formExists(db, params.id))
      return NextResponse.json({ ok: false, error: "Form not found." }, { status: 404 });
    if (!await scopedFormStepsMatch(db, params.id, orderedIds))
      return NextResponse.json({ ok: false, error: "Foreign or duplicate step." }, { status: 404 });
    await reorderSteps(db, params.id, orderedIds);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}

export const PATCH = withAuditedHistoricalMutation("forms2/[id]/steps/reorder", "PATCH", PATCHOriginal);
