import { withAuditedHistoricalMutation } from "@/lib/chess/historical-mutation-response-audit-round57";
/*
 * Forms 2.0 steps collection API (Sprint 19, authenticated). POST creates a new
 * step on the form. RBAC form:manage.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { requirePermission, PermissionError } from "@/lib/rbac/require-permission";
import { createStep } from "@/lib/forms2/mutations";

import { formExists } from "@/lib/security/historical-resource-scope";

export const dynamic = "force-dynamic";

function fail(err: unknown) {
  if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
  if (err instanceof NoTenantError) return NextResponse.json({ ok: false, error: "No tenant." }, { status: 400 });
  return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
}

async function POSTOriginal(req: NextRequest, { params }: { params: { id: string } }) {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    // empty body is fine
  }
  try {
    await requirePermission("form:manage");
    const { db } = getTenantDb();
    if (!await formExists(db, params.id))
      return NextResponse.json({ ok: false, error: "Form not found." }, { status: 404 });
    const id = await createStep(db, params.id, {
      title: body.title as string | undefined,
      description: body.description as string | null | undefined,
    });
    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (err) {
    return fail(err);
  }
}

export const POST = withAuditedHistoricalMutation("forms2/[id]/steps", "POST", POSTOriginal);
