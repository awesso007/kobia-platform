/*
 * Single feed post API (Sprint 21, authenticated). GET returns the post with
 * reactions, threaded comments, and poll tallies; PATCH edits title/body (author
 * or admin); DELETE soft-deletes (author or admin), cascading to comments.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { requirePermission, PermissionError, getCurrentMembership } from "@/lib/rbac/require-permission";
import { getPost } from "@/lib/feed/queries";
import { editPost, deletePost } from "@/lib/feed/mutations";

export const dynamic = "force-dynamic";

function fail(err: unknown) {
  if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
  if (err instanceof NoTenantError) return NextResponse.json({ ok: false, error: "No tenant." }, { status: 400 });
  return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
}

function isAdmin(role?: string) {
  return role === "ADMIN" || role === "OWNER";
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission("record:read");
    const { db } = getTenantDb();
    const post = await getPost(db, params.id);
    if (!post) return NextResponse.json({ ok: false, error: "Post not found." }, { status: 404 });
    return NextResponse.json({ ok: true, post });
  } catch (err) {
    return fail(err);
  }
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
    const { db } = getTenantDb();
    const post = await db.feedPost.findFirst({ where: { id: params.id, deletedAt: null }, select: { authorId: true } });
    if (!post) return NextResponse.json({ ok: false, error: "Post not found." }, { status: 404 });
    const member = await getCurrentMembership();
    if (member && member.clerkUserId !== post.authorId && !isAdmin(member.role)) {
      return NextResponse.json({ ok: false, error: "Only the author or an admin can edit this post." }, { status: 403 });
    }
    await editPost(db, params.id, {
      title: body.title === undefined ? undefined : (body.title as string | null),
      body: body.body === undefined ? undefined : String(body.body),
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission("record:delete");
    const { db } = getTenantDb();
    const post = await db.feedPost.findFirst({ where: { id: params.id, deletedAt: null }, select: { authorId: true } });
    if (!post) return NextResponse.json({ ok: false, error: "Post not found." }, { status: 404 });
    const member = await getCurrentMembership();
    if (member && member.clerkUserId !== post.authorId && !isAdmin(member.role)) {
      return NextResponse.json({ ok: false, error: "Only the author or an admin can delete this post." }, { status: 403 });
    }
    await deletePost(db, params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}
