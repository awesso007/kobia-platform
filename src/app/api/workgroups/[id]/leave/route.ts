/*
 * Leave a workgroup (Sprint 22, authenticated). The owner cannot leave without
 * transferring ownership first.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { requirePermission, getCurrentMembership } from "@/lib/rbac/require-permission";
import { leaveGroup } from "@/lib/workgroups/mutations";
import { failWorkgroup } from "@/lib/workgroups/api";

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission("record:update");
    const member = await getCurrentMembership();
    if (!member) return NextResponse.json({ ok: false, error: "Sign in to leave a group." }, { status: 401 });
    const { db } = getTenantDb();
    await leaveGroup(db, params.id, member.clerkUserId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return failWorkgroup(err);
  }
}
