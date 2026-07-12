/*
 * Single workgroup member API (Sprint 22, authenticated). PATCH changes a
 * member's role; DELETE removes a member. Both require OWNER/MODERATOR. The
 * owner's role cannot be changed and the owner cannot be removed. memberId is
 * the WorkgroupMember row id.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { requirePermission, getCurrentMembership } from "@/lib/rbac/require-permission";
import { changeRole, removeMember } from "@/lib/workgroups/mutations";
import { failWorkgroup } from "@/lib/workgroups/api";
import { canManage, type WorkgroupMemberRole } from "@/lib/workgroups/workgroup-utils";

export const dynamic = "force-dynamic";

const ROLES: WorkgroupMemberRole[] = ["OWNER", "MODERATOR", "MEMBER"];

async function callerRole(db: ReturnType<typeof getTenantDb>["db"], workgroupId: string): Promise<WorkgroupMemberRole | null> {
  const member = await getCurrentMembership();
  if (!member) return null;
  const wm = await db.workgroupMember.findUnique({
    where: { workgroupId_userId: { workgroupId, userId: member.clerkUserId } },
    select: { role: true },
  });
  return (wm?.role as WorkgroupMemberRole | undefined) ?? null;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string; memberId: string } }) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  try {
    await requirePermission("record:update");
    const { db } = getTenantDb();
    const role = await callerRole(db, params.id);
    if (!canManage(role)) return NextResponse.json({ ok: false, error: "Only owners and moderators can change roles." }, { status: 403 });
    const nextRole = String(body.role ?? "") as WorkgroupMemberRole;
    if (!ROLES.includes(nextRole)) return NextResponse.json({ ok: false, error: "Invalid role." }, { status: 400 });
    const target = await db.workgroupMember.findFirst({ where: { id: params.memberId, workgroupId: params.id }, select: { userId: true } });
    if (!target) return NextResponse.json({ ok: false, error: "Member not found." }, { status: 404 });
    await changeRole(db, params.id, target.userId, nextRole);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return failWorkgroup(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; memberId: string } }) {
  try {
    await requirePermission("record:update");
    const { db } = getTenantDb();
    const role = await callerRole(db, params.id);
    if (!canManage(role)) return NextResponse.json({ ok: false, error: "Only owners and moderators can remove members." }, { status: 403 });
    const target = await db.workgroupMember.findFirst({ where: { id: params.memberId, workgroupId: params.id }, select: { userId: true } });
    if (!target) return NextResponse.json({ ok: false, error: "Member not found." }, { status: 404 });
    await removeMember(db, params.id, target.userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return failWorkgroup(err);
  }
}
