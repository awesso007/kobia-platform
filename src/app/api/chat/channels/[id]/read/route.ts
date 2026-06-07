/*
 * Chat mark-read API (Sprint 16, authenticated). POST bumps the caller's
 * lastReadAt for the channel up to a given message (or now).
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { requirePermission, PermissionError, getCurrentMembership } from "@/lib/rbac/require-permission";
import { markRead, ensureMember } from "@/lib/chat/mutations";

export const dynamic = "force-dynamic";

function fail(err: unknown) {
  if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
  if (err instanceof NoTenantError) return NextResponse.json({ ok: false, error: "No tenant." }, { status: 400 });
  return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    // empty body is allowed: marks read up to now
  }
  try {
    await requirePermission("record:read");
    const member = await getCurrentMembership();
    if (!member) return NextResponse.json({ ok: true });
    const { db } = getTenantDb();
    await ensureMember(db, params.id, member.clerkUserId);
    await markRead(db, {
      channelId: params.id,
      userId: member.clerkUserId,
      upToMessageId: (body.upToMessageId as string) || null,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}
