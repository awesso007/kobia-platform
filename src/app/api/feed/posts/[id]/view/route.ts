/*
 * Feed view API (Sprint 21, authenticated). POST records that the caller viewed
 * a post, incrementing viewCount at most once per user via the FeedView row.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { requirePermission, PermissionError, getCurrentMembership } from "@/lib/rbac/require-permission";
import { recordView } from "@/lib/feed/mutations";

export const dynamic = "force-dynamic";

function fail(err: unknown) {
  if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
  if (err instanceof NoTenantError) return NextResponse.json({ ok: false, error: "No tenant." }, { status: 400 });
  return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
}

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission("record:read");
    const member = await getCurrentMembership();
    if (!member) return NextResponse.json({ ok: true, skipped: true });
    const { db } = getTenantDb();
    await recordView(db, params.id, member.clerkUserId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}
