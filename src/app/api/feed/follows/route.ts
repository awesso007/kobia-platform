/*
 * Feed follows API (Sprint 21, authenticated). POST toggles a follow on a
 * target (POST/USER/RECORD); DELETE removes it. Body: {targetType, targetId}.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { requirePermission, PermissionError, getCurrentMembership } from "@/lib/rbac/require-permission";
import { toggleFollow } from "@/lib/feed/mutations";

export const dynamic = "force-dynamic";

const TARGET_TYPES = ["POST", "USER", "RECORD"] as const;
type TargetType = (typeof TARGET_TYPES)[number];

function fail(err: unknown) {
  if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
  if (err instanceof NoTenantError) return NextResponse.json({ ok: false, error: "No tenant." }, { status: 400 });
  return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
}

async function handle(req: NextRequest, remove: boolean) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  await requirePermission("record:create");
  const targetType = String(body.targetType ?? "") as TargetType;
  const targetId = String(body.targetId ?? "").trim();
  if (!TARGET_TYPES.includes(targetType) || !targetId) {
    return NextResponse.json({ ok: false, error: "targetType and targetId are required." }, { status: 400 });
  }
  const member = await getCurrentMembership();
  if (!member) return NextResponse.json({ ok: false, error: "No current user." }, { status: 400 });
  const { db } = getTenantDb();

  if (remove) {
    const existing = await db.feedFollow.findUnique({
      where: { userId_targetType_targetId: { userId: member.clerkUserId, targetType, targetId } },
    });
    if (existing) await db.feedFollow.delete({ where: { id: existing.id } });
    return NextResponse.json({ ok: true, following: false });
  }

  const res = await toggleFollow(db, { userId: member.clerkUserId, targetType, targetId });
  return NextResponse.json({ ok: true, ...res });
}

export async function POST(req: NextRequest) {
  try {
    return await handle(req, false);
  } catch (err) {
    return fail(err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    return await handle(req, true);
  } catch (err) {
    return fail(err);
  }
}
