/*
 * Chat message edit/delete API (Sprint 16, authenticated). PATCH edits the body
 * (author only); DELETE soft-deletes (author, or ADMIN/OWNER). Both reindex.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { requirePermission, PermissionError, getCurrentMembership } from "@/lib/rbac/require-permission";
import { editMessage, deleteMessage } from "@/lib/chat/mutations";

export const dynamic = "force-dynamic";

function fail(err: unknown) {
  if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
  if (err instanceof NoTenantError) return NextResponse.json({ ok: false, error: "No tenant." }, { status: 400 });
  return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  try {
    await requirePermission("record:update");
    const bodyText = String(body.bodyText ?? "").trim();
    if (!bodyText) return NextResponse.json({ ok: false, error: "Message body is required." }, { status: 400 });
    const { db } = getTenantDb();
    const msg = await db.chatMessage.findUnique({ where: { id: params.id }, select: { authorId: true } });
    if (!msg) return NextResponse.json({ ok: false, error: "Message not found." }, { status: 404 });
    const member = await getCurrentMembership();
    if (member && member.clerkUserId !== msg.authorId) {
      return NextResponse.json({ ok: false, error: "Only the author can edit." }, { status: 403 });
    }
    await editMessage(db, params.id, bodyText);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission("record:update");
    const { db } = getTenantDb();
    const msg = await db.chatMessage.findUnique({ where: { id: params.id }, select: { authorId: true } });
    if (!msg) return NextResponse.json({ ok: false, error: "Message not found." }, { status: 404 });
    const member = await getCurrentMembership();
    const isAuthor = member?.clerkUserId === msg.authorId;
    const isAdmin = member?.role === "OWNER" || member?.role === "ADMIN";
    if (member && !isAuthor && !isAdmin) {
      return NextResponse.json({ ok: false, error: "Not permitted to delete." }, { status: 403 });
    }
    await deleteMessage(db, params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}
