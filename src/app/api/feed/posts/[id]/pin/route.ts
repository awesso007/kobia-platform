/*
 * Feed pin API (Sprint 21, authenticated, admin only). POST toggles the pinned
 * flag on a post and dispatches FEED_ANNOUNCEMENT_PINNED when pinning.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { requirePermission, PermissionError, getCurrentMembership } from "@/lib/rbac/require-permission";
import { togglePin } from "@/lib/feed/mutations";

export const dynamic = "force-dynamic";

function fail(err: unknown) {
  if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
  if (err instanceof NoTenantError) return NextResponse.json({ ok: false, error: "No tenant." }, { status: 400 });
  return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
}

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission("record:update");
    const member = await getCurrentMembership();
    if (member && member.role !== "ADMIN" && member.role !== "OWNER") {
      return NextResponse.json({ ok: false, error: "Only an admin can pin posts." }, { status: 403 });
    }
    const { db } = getTenantDb();
    const res = await togglePin(db, params.id);
    return NextResponse.json({ ok: true, ...res });
  } catch (err) {
    return fail(err);
  }
}
