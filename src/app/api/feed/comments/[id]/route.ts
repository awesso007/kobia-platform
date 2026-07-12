/*
 * Single feed comment API (Sprint 21, authenticated). PATCH edits the body
 * (author only, within 15 minutes of creation); DELETE soft-deletes (author or
 * admin), decrementing the post commentCount.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { requirePermission, PermissionError, getCurrentMembership } from "@/lib/rbac/require-permission";
import { editComment, deleteComment } from "@/lib/feed/mutations";

export const dynamic = "force-dynamic";

const EDIT_WINDOW_MS = 15 * 60 * 1000;

function fail(err: unknown) {
  if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
  if (err instanceof NoTenantError) return NextResponse.json({ ok: false, error: "No tenant." }, { status: 400 });
  return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
}

function isAdmin(role?: string) {
  return role === "ADMIN" || role === "OWNER";
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
    const text = String(body.body ?? "").trim();
    if (!text) return NextResponse.json({ ok: false, error: "Comment body is required." }, { status: 400 });
    const { db } = getTenantDb();
    const comment = await db.feedComment.findFirst({
      where: { id: params.id, deletedAt: null },
      select: { authorId: true, createdAt: true },
    });
    if (!comment) return NextResponse.json({ ok: false, error: "Comment not found." }, { status: 404 });
    const member = await getCurrentMembership();
    if (member && member.clerkUserId !== comment.authorId) {
      return NextResponse.json({ ok: false, error: "Only the author can edit this comment." }, { status: 403 });
    }
    if (Date.now() - comment.createdAt.getTime() > EDIT_WINDOW_MS) {
      return NextResponse.json({ ok: false, error: "Comments can only be edited within 15 minutes of posting." }, { status: 403 });
    }
    await editComment(db, params.id, text);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission("record:delete");
    const { db } = getTenantDb();
    const comment = await db.feedComment.findFirst({ where: { id: params.id, deletedAt: null }, select: { authorId: true } });
    if (!comment) return NextResponse.json({ ok: false, error: "Comment not found." }, { status: 404 });
    const member = await getCurrentMembership();
    if (member && member.clerkUserId !== comment.authorId && !isAdmin(member.role)) {
      return NextResponse.json({ ok: false, error: "Only the author or an admin can delete this comment." }, { status: 403 });
    }
    await deleteComment(db, params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}
