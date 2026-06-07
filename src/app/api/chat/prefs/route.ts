/*
 * Chat notification prefs API (Sprint 16, authenticated). POST upserts the
 * caller's per-channel notification level (ALL / MENTIONS / NONE).
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { requirePermission, PermissionError, getCurrentMembership } from "@/lib/rbac/require-permission";

export const dynamic = "force-dynamic";

const LEVELS = ["ALL", "MENTIONS", "NONE"] as const;

function fail(err: unknown) {
  if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
  if (err instanceof NoTenantError) return NextResponse.json({ ok: false, error: "No tenant." }, { status: 400 });
  return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  try {
    await requirePermission("record:update");
    const channelId = String(body.channelId ?? "").trim();
    const level = String(body.level ?? "");
    if (!channelId || !(LEVELS as readonly string[]).includes(level)) {
      return NextResponse.json({ ok: false, error: "channelId and a valid level are required." }, { status: 400 });
    }
    const member = await getCurrentMembership();
    if (!member) return NextResponse.json({ ok: true });
    const { db } = getTenantDb();
    await db.chatNotificationPref.upsert({
      where: { userId_channelId: { userId: member.clerkUserId, channelId } },
      create: { userId: member.clerkUserId, channelId, level: level as never },
      update: { level: level as never },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}
