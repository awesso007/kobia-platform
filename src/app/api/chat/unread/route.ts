/*
 * Chat unread API (Sprint 16, authenticated). GET returns per-channel unread
 * counts for the caller, plus the total, for sidebar + nav badges.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse } from "next/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { requirePermission, PermissionError, getCurrentMembership } from "@/lib/rbac/require-permission";
import { unreadCounts } from "@/lib/chat/queries";

export const dynamic = "force-dynamic";

function fail(err: unknown) {
  if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
  if (err instanceof NoTenantError) return NextResponse.json({ ok: false, error: "No tenant." }, { status: 400 });
  return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
}

export async function GET() {
  try {
    await requirePermission("record:read");
    const member = await getCurrentMembership();
    if (!member) return NextResponse.json({ ok: true, counts: {}, total: 0 });
    const { db } = getTenantDb();
    const counts = await unreadCounts(db, member.clerkUserId);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    return NextResponse.json({ ok: true, counts, total });
  } catch (err) {
    return fail(err);
  }
}
