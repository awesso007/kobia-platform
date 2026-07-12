/*
 * Reject a pending join request (Sprint 22, authenticated, OWNER/MODERATOR).
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { requirePermission, getCurrentMembership } from "@/lib/rbac/require-permission";
import { rejectJoin } from "@/lib/workgroups/mutations";
import { failWorkgroup } from "@/lib/workgroups/api";
import { canManage, type WorkgroupMemberRole } from "@/lib/workgroups/workgroup-utils";

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, { params }: { params: { id: string; requestId: string } }) {
  try {
    await requirePermission("record:update");
    const { db } = getTenantDb();
    const member = await getCurrentMembership();
    const wm = member
      ? await db.workgroupMember.findUnique({ where: { workgroupId_userId: { workgroupId: params.id, userId: member.clerkUserId } }, select: { role: true } })
      : null;
    const role = (wm?.role as WorkgroupMemberRole | undefined) ?? null;
    if (!canManage(role)) return NextResponse.json({ ok: false, error: "Only owners and moderators can reject requests." }, { status: 403 });
    await rejectJoin(db, params.requestId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return failWorkgroup(err);
  }
}
