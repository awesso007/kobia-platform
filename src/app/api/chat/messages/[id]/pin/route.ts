/*
 * Chat pin API (Sprint 16, authenticated). POST pins or unpins a message in its
 * own channel (channel resolved from the message). Toggles on repeat calls.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { requirePermission, PermissionError, getCurrentMembership } from "@/lib/rbac/require-permission";
import { togglePin } from "@/lib/chat/mutations";

export const dynamic = "force-dynamic";

function fail(err: unknown) {
  if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
  if (err instanceof NoTenantError) return NextResponse.json({ ok: false, error: "No tenant." }, { status: 400 });
  return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
}

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission("record:update");
    const { db } = getTenantDb();
    const msg = await db.chatMessage.findUnique({ where: { id: params.id }, select: { channelId: true } });
    if (!msg) return NextResponse.json({ ok: false, error: "Message not found." }, { status: 404 });
    const member = await getCurrentMembership();
    const res = await togglePin(db, {
      channelId: msg.channelId,
      messageId: params.id,
      pinnedById: member?.clerkUserId ?? null,
    });
    return NextResponse.json({ ok: true, ...res });
  } catch (err) {
    return fail(err);
  }
}
