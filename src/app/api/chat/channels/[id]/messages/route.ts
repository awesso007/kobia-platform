import {withAuditedHistoricalGet} from "@/lib/chess/historical-get-response-audit";
/*
 * Chat channel messages API (Sprint 16, authenticated). GET returns a cursor-
 * paginated page of messages (optionally a thread via ?parentId); POST sends a
 * new message (parsing @mentions, notifying mentioned users, dispatching
 * CHAT_MENTION). The caller is auto-added as a member of the channel on send.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { requirePermission, PermissionError, getCurrentMembership } from "@/lib/rbac/require-permission";
import { listMessages } from "@/lib/chat/queries";
import { sendMessage, ensureMember } from "@/lib/chat/mutations";

import { authorizedChatChannel, messageBelongsToChannel } from "@/lib/security/historical-chat-scope";

export const dynamic = "force-dynamic";

function fail(err: unknown) {
  if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
  if (err instanceof NoTenantError) return NextResponse.json({ ok: false, error: "No tenant." }, { status: 400 });
  return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
}

async function historicalAuditedGet(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission("record:read");
    const { db } = getTenantDb();
    const member = await getCurrentMembership();
    if (!member || !await authorizedChatChannel(db, params.id, member.clerkUserId))
      return NextResponse.json({ ok: false, error: "Channel not found." }, { status: 404 });
    const sp = req.nextUrl.searchParams;
    const page = await listMessages(db, params.id, {
      cursor: sp.get("cursor") || null,
      parentId: sp.get("parentId") || null,
    });
    return NextResponse.json({ ok: true, ...page });
  } catch (err) {
    return fail(err);
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  try {
    await requirePermission("record:create");
    const bodyText = String(body.bodyText ?? "").trim();
    if (!bodyText) return NextResponse.json({ ok: false, error: "Message body is required." }, { status: 400 });
    const member = await getCurrentMembership();
    const authorId = member?.clerkUserId ?? "system";
    const authorName = member?.displayName ?? member?.email ?? "Unknown";
    const { db } = getTenantDb();
    if (!member) return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });
    const channelAccess = await authorizedChatChannel(db, params.id, member.clerkUserId);
    if (!channelAccess)
      return NextResponse.json({ ok: false, error: "Channel not found." }, { status: 404 });
    if (body.parentId && !await messageBelongsToChannel(db, params.id, String(body.parentId)))
      return NextResponse.json({ ok: false, error: "Parent message not found." }, { status: 404 });
    // Only public channels allow implicit join. Never auto-enroll into DM/private.
    if (channelAccess === "PUBLIC") await ensureMember(db, params.id, member.clerkUserId);
    const id = await sendMessage(db, {
      channelId: params.id,
      authorId,
      authorName,
      bodyText,
      parentId: (body.parentId as string) || null,
      attachments: body.attachments ?? null,
    });
    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (err) {
    return fail(err);
  }
}

export const GET=withAuditedHistoricalGet("chat/channels/[id]/messages",historicalAuditedGet);
