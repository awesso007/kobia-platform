/*
 * Join a workgroup (Sprint 22, authenticated). PUBLIC groups join directly;
 * PRIVATE/SECRET groups create a pending join request that owners/moderators
 * approve.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { requirePermission, getCurrentMembership } from "@/lib/rbac/require-permission";
import { requestJoin } from "@/lib/workgroups/mutations";
import { failWorkgroup } from "@/lib/workgroups/api";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    // Body is optional for a join.
  }
  try {
    await requirePermission("record:update");
    const member = await getCurrentMembership();
    if (!member) return NextResponse.json({ ok: false, error: "Sign in to join a group." }, { status: 401 });
    const { db } = getTenantDb();
    const result = await requestJoin(db, {
      workgroupId: params.id,
      userId: member.clerkUserId,
      message: (body.message as string) ?? null,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return failWorkgroup(err);
  }
}
