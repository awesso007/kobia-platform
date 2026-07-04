/*
 * Workflow publish API (Sprint 18, authenticated). POST toggles status; defaults
 * to ACTIVE when no status is sent (DRAFT -> ACTIVE bumps version). RBAC
 * automation:manage; tenant via getTenantDb().
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { requirePermission, PermissionError } from "@/lib/rbac/require-permission";
import { setWorkflowStatus } from "@/lib/workflows/mutations";

export const dynamic = "force-dynamic";

function fail(err: unknown) {
  if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
  if (err instanceof NoTenantError) return NextResponse.json({ ok: false, error: "No tenant." }, { status: 400 });
  return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
}

const VALID = ["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"] as const;
type Status = (typeof VALID)[number];

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    // empty body is fine; default to ACTIVE
  }
  try {
    await requirePermission("automation:manage");
    const requested = String(body.status ?? "ACTIVE");
    const status = (VALID.includes(requested as Status) ? requested : "ACTIVE") as Status;
    const { db } = getTenantDb();
    await setWorkflowStatus(db, params.id, status);
    return NextResponse.json({ ok: true, status });
  } catch (err) {
    return fail(err);
  }
}
