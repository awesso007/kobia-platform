/*
 * Feed reactions API (Sprint 21, authenticated). POST toggles the caller's
 * reaction of a kind on exactly one of a post or comment; DELETE removes the
 * caller's reaction of that kind. Body: {postId?|commentId?, kind}.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { requirePermission, PermissionError, getCurrentMembership } from "@/lib/rbac/require-permission";
import { toggleReaction, removeReaction } from "@/lib/feed/mutations";
import { REACTION_KINDS, type ReactionKind } from "@/lib/feed/feed-utils";

export const dynamic = "force-dynamic";

function fail(err: unknown) {
  if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
  if (err instanceof NoTenantError) return NextResponse.json({ ok: false, error: "No tenant." }, { status: 400 });
  return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
}

function parse(body: Record<string, unknown>): { postId: string | null; commentId: string | null; kind: ReactionKind } | { error: string } {
  const postId = (body.postId as string) || null;
  const commentId = (body.commentId as string) || null;
  if (Boolean(postId) === Boolean(commentId)) return { error: "Provide exactly one of postId or commentId." };
  const kind = String(body.kind ?? "") as ReactionKind;
  if (!REACTION_KINDS.includes(kind)) return { error: "Invalid reaction kind." };
  return { postId, commentId, kind };
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  try {
    await requirePermission("record:create");
    const parsed = parse(body);
    if ("error" in parsed) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
    const member = await getCurrentMembership();
    if (!member) return NextResponse.json({ ok: false, error: "No current user." }, { status: 400 });
    const { db } = getTenantDb();
    const res = await toggleReaction(db, { ...parsed, userId: member.clerkUserId });
    return NextResponse.json({ ok: true, ...res });
  } catch (err) {
    return fail(err);
  }
}

export async function DELETE(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  try {
    await requirePermission("record:create");
    const parsed = parse(body);
    if ("error" in parsed) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
    const member = await getCurrentMembership();
    if (!member) return NextResponse.json({ ok: false, error: "No current user." }, { status: 400 });
    const { db } = getTenantDb();
    const res = await removeReaction(db, { ...parsed, userId: member.clerkUserId });
    return NextResponse.json({ ok: true, ...res });
  } catch (err) {
    return fail(err);
  }
}
