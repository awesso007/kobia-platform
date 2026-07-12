/*
 * Feed mentions API (Sprint 21, authenticated). GET returns posts and comments
 * where the current user is mentioned, most recent first.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { requirePermission, PermissionError, getCurrentMembership } from "@/lib/rbac/require-permission";
import { listMentions } from "@/lib/feed/queries";

export const dynamic = "force-dynamic";

function fail(err: unknown) {
  if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
  if (err instanceof NoTenantError) return NextResponse.json({ ok: false, error: "No tenant." }, { status: 400 });
  return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
}

export async function GET(_req: NextRequest) {
  try {
    await requirePermission("record:read");
    const member = await getCurrentMembership();
    if (!member) return NextResponse.json({ ok: true, mentions: [] });
    const { db } = getTenantDb();
    const mentions = await listMentions(db, member.clerkUserId);
    return NextResponse.json({ ok: true, mentions });
  } catch (err) {
    return fail(err);
  }
}
