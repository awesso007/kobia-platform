/*
 * Chat DM API (Sprint 16, authenticated). POST finds-or-creates a 1:1 DM channel
 * between the caller and a target user, returning the channel id.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { requirePermission, PermissionError, getCurrentMembership } from "@/lib/rbac/require-permission";
import { findOrCreateDm } from "@/lib/chat/mutations";

export const dynamic = "force-dynamic";

function fail(err: unknown) {
  if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
  if (err instanceof NoTenantError) return NextResponse.json({ ok: false, error: "No tenant." }, { status: 400 });
  return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  try {
    await requirePermission("record:create");
    const targetUserId = String(body.userId ?? "").trim();
    if (!targetUserId) return NextResponse.json({ ok: false, error: "Target userId is required." }, { status: 400 });
    const member = await getCurrentMembership();
    if (!member) return NextResponse.json({ ok: false, error: "No current user." }, { status: 400 });
    if (member.clerkUserId === targetUserId) {
      return NextResponse.json({ ok: false, error: "Cannot DM yourself." }, { status: 400 });
    }
    const { db } = getTenantDb();
    const id = await findOrCreateDm(db, member.clerkUserId, targetUserId);
    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (err) {
    return fail(err);
  }
}
