/*
 * Shared JSON error mapper for the workgroup API routes (Sprint 22). Maps the
 * common error types to HTTP statuses: permission -> 403, no tenant -> 400,
 * group access -> 403, group not found -> 404, anything else -> 500.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse } from "next/server";
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { PermissionError } from "@/lib/rbac/require-permission";
import { GroupAccessError, GroupNotFoundError } from "./authz";

export function failWorkgroup(err: unknown) {
  if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
  if (err instanceof GroupAccessError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
  if (err instanceof GroupNotFoundError) return NextResponse.json({ ok: false, error: err.message }, { status: 404 });
  if (err instanceof NoTenantError) return NextResponse.json({ ok: false, error: "No tenant." }, { status: 400 });
  return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
}
