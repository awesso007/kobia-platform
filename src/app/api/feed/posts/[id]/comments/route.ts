/*
 * Feed comments API (Sprint 21, authenticated). GET lists a post's comments
 * (with reactions) oldest-first; POST adds a comment (one-level threading),
 * resolving @mentions and dispatching FEED_COMMENT_CREATED.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { requirePermission, PermissionError, getCurrentMembership } from "@/lib/rbac/require-permission";
import { getPost } from "@/lib/feed/queries";
import { createComment } from "@/lib/feed/mutations";

export const dynamic = "force-dynamic";

function fail(err: unknown) {
  if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
  if (err instanceof NoTenantError) return NextResponse.json({ ok: false, error: "No tenant." }, { status: 400 });
  return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission("record:read");
    const { db } = getTenantDb();
    const post = await getPost(db, params.id);
    if (!post) return NextResponse.json({ ok: false, error: "Post not found." }, { status: 404 });
    return NextResponse.json({ ok: true, comments: post.comments });
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
    const text = String(body.body ?? "").trim();
    if (!text) return NextResponse.json({ ok: false, error: "Comment body is required." }, { status: 400 });
    const member = await getCurrentMembership();
    const authorId = member?.clerkUserId ?? "system";
    const authorName = member?.displayName ?? member?.email ?? null;
    const { db } = getTenantDb();
    const id = await createComment(db, {
      postId: params.id,
      authorId,
      authorName,
      body: text,
      parentCommentId: (body.parentCommentId as string) || null,
      attachments: body.attachments ?? null,
    });
    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (err) {
    return fail(err);
  }
}
