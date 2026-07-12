/*
 * Single workgroup API (Sprint 22, authenticated). GET returns the group with
 * the caller's role and member count; PATCH edits settings (OWNER/MODERATOR);
 * DELETE archives the group (OWNER/MODERATOR) - archive, never hard delete.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { requirePermission, getCurrentMembership } from "@/lib/rbac/require-permission";
import { updateGroup, archiveGroup } from "@/lib/workgroups/mutations";
import { failWorkgroup } from "@/lib/workgroups/api";
import { canManage, type WorkgroupMemberRole, type WorkgroupVisibility } from "@/lib/workgroups/workgroup-utils";

export const dynamic = "force-dynamic";

const VISIBILITIES: WorkgroupVisibility[] = ["PUBLIC", "PRIVATE", "SECRET"];

async function callerRole(db: ReturnType<typeof getTenantDb>["db"], workgroupId: string): Promise<WorkgroupMemberRole | null> {
  const member = await getCurrentMembership();
  if (!member) return null;
  const wm = await db.workgroupMember.findUnique({
    where: { workgroupId_userId: { workgroupId, userId: member.clerkUserId } },
    select: { role: true },
  });
  return (wm?.role as WorkgroupMemberRole | undefined) ?? null;
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission("record:read");
    const { db } = getTenantDb();
    const group = await db.workgroup.findUnique({ where: { id: params.id } });
    if (!group) return NextResponse.json({ ok: false, error: "Workgroup not found." }, { status: 404 });
    const [memberCount, role] = await Promise.all([
      db.workgroupMember.count({ where: { workgroupId: group.id } }),
      callerRole(db, group.id),
    ]);
    return NextResponse.json({ ok: true, group: { ...group, memberCount, myRole: role } });
  } catch (err) {
    return failWorkgroup(err);
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
    const role = await callerRole(db, params.id);
    if (!canManage(role)) return NextResponse.json({ ok: false, error: "Only owners and moderators can edit this group." }, { status: 403 });
    const rawVis = body.visibility === undefined ? undefined : (String(body.visibility) as WorkgroupVisibility);
    await updateGroup(db, params.id, {
      name: body.name === undefined ? undefined : String(body.name),
      description: body.description === undefined ? undefined : (body.description as string | null),
      visibility: rawVis && VISIBILITIES.includes(rawVis) ? rawVis : undefined,
      icon: body.icon === undefined ? undefined : (body.icon as string | null),
      coverColor: body.coverColor === undefined ? undefined : (body.coverColor as string | null),
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return failWorkgroup(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission("record:delete");
    const { db } = getTenantDb();
    const role = await callerRole(db, params.id);
    if (!canManage(role)) return NextResponse.json({ ok: false, error: "Only owners and moderators can archive this group." }, { status: 403 });
    await archiveGroup(db, params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return failWorkgroup(err);
  }
}
