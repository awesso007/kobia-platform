/*
 * Chat reaction API (Sprint 16, authenticated). POST toggles a text-label
 * reaction on a message for the caller. Emoji is a label only (no emoji char).
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { requirePermission, PermissionError, getCurrentMembership } from "@/lib/rbac/require-permission";
import { toggleReaction } from "@/lib/chat/mutations";

export const dynamic = "force-dynamic";

function fail(err: unknown) {
  if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
  if (err instanceof NoTenantError) return NextResponse.json({ ok: false, error: "No tenant." }, { status: 400 });
  return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
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
    const emoji = String(body.emoji ?? "").trim();
    if (!emoji) return NextResponse.json({ ok: false, error: "Reaction label is required." }, { status: 400 });
    const member = await getCurrentMembership();
    if (!member) return NextResponse.json({ ok: false, error: "No current user." }, { status: 400 });
    const { db } = getTenantDb();
    const res = await toggleReaction(db, { messageId: params.id, userId: member.clerkUserId, emoji });
    return NextResponse.json({ ok: true, ...res });
  } catch (err) {
    return fail(err);
  }
}
