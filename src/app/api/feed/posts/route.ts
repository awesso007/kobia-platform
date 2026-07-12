/*
 * Feed posts API (Sprint 21, authenticated). GET lists the stream with cursor
 * pagination and a filter (all|announcements|mentions|mine); POST creates a
 * post (optionally with a poll), resolving @mentions and dispatching automations.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { requirePermission, PermissionError, getCurrentMembership } from "@/lib/rbac/require-permission";
import { listPosts, type FeedFilter } from "@/lib/feed/queries";
import { createPost } from "@/lib/feed/mutations";

export const dynamic = "force-dynamic";

function fail(err: unknown) {
  if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
  if (err instanceof NoTenantError) return NextResponse.json({ ok: false, error: "No tenant." }, { status: 400 });
  return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
}

const FILTERS: FeedFilter[] = ["all", "announcements", "mentions", "mine"];

export async function GET(req: NextRequest) {
  try {
    await requirePermission("record:read");
    const { db } = getTenantDb();
    const member = await getCurrentMembership();
    const sp = req.nextUrl.searchParams;
    const raw = (sp.get("filter") ?? "all") as FeedFilter;
    const filter = FILTERS.includes(raw) ? raw : "all";
    const page = await listPosts(db, {
      filter,
      cursor: sp.get("cursor") || null,
      currentUserId: member?.clerkUserId ?? null,
      workgroupId: sp.get("workgroupId") || null,
    });
    return NextResponse.json({ ok: true, ...page });
  } catch (err) {
    return fail(err);
  }
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
    const text = String(body.body ?? "").trim();
    if (!text) return NextResponse.json({ ok: false, error: "Post body is required." }, { status: 400 });
    const member = await getCurrentMembership();
    const authorId = member?.clerkUserId ?? "system";
    const authorName = member?.displayName ?? member?.email ?? null;

    // Only admins/owners may pin on create.
    const pinned = Boolean(body.pinned) && (member?.role === "ADMIN" || member?.role === "OWNER");
    const workgroupId = body.workgroupId ? String(body.workgroupId) : null;

    const pollRaw = body.poll as { question?: unknown; options?: unknown; allowMultiple?: unknown; closesAt?: unknown } | null | undefined;
    const poll =
      pollRaw && String(pollRaw.question ?? "").trim() && Array.isArray(pollRaw.options)
        ? {
            question: String(pollRaw.question),
            options: (pollRaw.options as unknown[]).map((o) => String(o)),
            allowMultiple: Boolean(pollRaw.allowMultiple),
            closesAt: (pollRaw.closesAt as string) || null,
          }
        : null;

    const { db } = getTenantDb();
    const id = await createPost(db, {
      authorId,
      authorName,
      type: body.type as never,
      title: (body.title as string) ?? null,
      body: text,
      attachments: body.attachments ?? null,
      visibility: body.visibility as never,
      sharedRecordType: (body.sharedRecordType as never) ?? null,
      sharedRecordId: (body.sharedRecordId as string) ?? null,
      sharedRecordSnapshot: body.sharedRecordSnapshot ?? null,
      pinned,
      workgroupId,
      poll,
    });
    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (err) {
    return fail(err);
  }
}
