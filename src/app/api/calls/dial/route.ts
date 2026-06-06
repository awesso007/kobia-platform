/*
 * POST /api/calls/dial (Sprint 7). Thin JSON wrapper over startCall() so the
 * client-side CallDialog popover can place a call. Runs in the request scope, so
 * getTenantDb() + requirePermission resolve normally (unlike the public Twilio
 * webhooks). Returns { ok, callId?, error? }.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { startCall, type StartCallInput } from "@/app/app/(crm)/call-actions";
import { PermissionError } from "@/lib/rbac/require-permission";
import { NoTenantError } from "@/lib/db/get-tenant-db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let input: StartCallInput;
  try {
    input = (await req.json()) as StartCallInput;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  if (!input?.toE164) return NextResponse.json({ ok: false, error: "Missing toE164." }, { status: 400 });

  try {
    const result = await startCall(input);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (err) {
    if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
    if (err instanceof NoTenantError) return NextResponse.json({ ok: false, error: "No tenant." }, { status: 400 });
    return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}
