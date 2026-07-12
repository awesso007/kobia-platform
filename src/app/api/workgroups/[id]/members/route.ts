/*
 * Workgroup members API (Sprint 22, authenticated). POST invites a user by
 * clerk user id or by email (OWNER/MODERATOR only). GET lists members.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { requirePermission, getCurrentMembership } from "@/lib/rbac/require-permission";
import { listMembers } from "@/lib/workgroups/queries";
import { inviteByUserId, inviteByEmail } from "@/lib/workgroups/mutations";
import { failWorkgroup } from "@/lib/workgroups/api";
import { canManage, type WorkgroupMemberRole } from "@/lib/workgroups/workgroup-utils";

export const dynamic = "force-dynamic";

async function callerRole(db: ReturnType<typeof getTenantDb>["db"], workgroupId: string): Promise<{ role: WorkgroupMemberRole | null; userId: string | null }> {
  const member = await getCurrentMembership();
  if (!member) return { role: null, userId: null };
  const wm = await db.workgroupMember.findUnique({
    where: { workgroupId_userId: { workgroupId, userId: member.clerkUserId } },
    select: { role: true },
  });
  return { role: (wm?.role as WorkgroupMemberRole | undefined) ?? null, userId: member.clerkUserId };
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission("record:read");
    const { db } = getTenantDb();
    const members = await listMembers(db, params.id);
    return NextResponse.json({ ok: true, members });
  } catch (err) {
    return failWorkgroup(err);
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
    await requirePermission("record:update");
    const { db } = getTenantDb();
    const { role, userId } = await callerRole(db, params.id);
    if (!canManage(role)) return NextResponse.json({ ok: false, error: "Only owners and moderators can invite members." }, { status: 403 });
    const inviterId = userId ?? "system";

    const inviteeUserId = body.userId ? String(body.userId) : null;
    const inviteeEmail = body.email ? String(body.email).trim() : null;
    if (!inviteeUserId && !inviteeEmail) {
      return NextResponse.json({ ok: false, error: "Provide a user id or an email to invite." }, { status: 400 });
    }

    const invite = inviteeUserId
      ? await inviteByUserId(db, { workgroupId: params.id, inviterId, inviteeUserId })
      : await inviteByEmail(db, { workgroupId: params.id, inviterId, inviteeEmail: inviteeEmail! });
    return NextResponse.json({ ok: true, invite }, { status: 201 });
  } catch (err) {
    return failWorkgroup(err);
  }
}
