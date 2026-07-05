/*
 * Forms 2.0 fields collection API (Sprint 19, authenticated). POST creates a new
 * field on a form/step. RBAC form:manage.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { requirePermission, PermissionError } from "@/lib/rbac/require-permission";
import type { FormFieldType } from "@/lib/db/generated/tenant";
import { FIELD_TYPES } from "@/lib/forms2/form-utils";
import { createField } from "@/lib/forms2/mutations";

export const dynamic = "force-dynamic";

function fail(err: unknown) {
  if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
  if (err instanceof NoTenantError) return NextResponse.json({ ok: false, error: "No tenant." }, { status: 400 });
  return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  try {
    await requirePermission("form:manage");
    const type = String(body.type ?? "SHORT_TEXT");
    if (!FIELD_TYPES.includes(type as (typeof FIELD_TYPES)[number])) {
      return NextResponse.json({ ok: false, error: "Invalid field type." }, { status: 400 });
    }
    const { db } = getTenantDb();
    const id = await createField(db, params.id, {
      stepId: (body.stepId as string) || null,
      type: type as FormFieldType,
      label: String(body.label ?? "Untitled"),
      key: body.key as string | undefined,
      required: Boolean(body.required),
      placeholder: body.placeholder as string | null | undefined,
      helpText: body.helpText as string | null | undefined,
      options: body.options,
      validation: body.validation,
      defaultValue: body.defaultValue as string | null | undefined,
      calculation: body.calculation as string | null | undefined,
      paymentAmount: body.paymentAmount === undefined || body.paymentAmount === null ? null : Number(body.paymentAmount),
      paymentCurrency: body.paymentCurrency as string | undefined,
      paymentDescription: body.paymentDescription as string | null | undefined,
      visibilityRule: body.visibilityRule,
    });
    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (err) {
    return fail(err);
  }
}
