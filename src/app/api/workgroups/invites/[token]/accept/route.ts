/*
 * Accept a workgroup invite by token (Sprint 22, authenticated). Adds the
 * signed-in user as a member and marks the invite accepted. Returns the group
 * slug so the client can redirect into the group.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { requirePermission, getCurrentMembership } from "@/lib/rbac/require-permission";
import { acceptInvite } from "@/lib/workgroups/mutations";
import { failWorkgroup } from "@/lib/workgroups/api";

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, { params }: { params: { token: string } }) {
  try {
    await requirePermission("record:update");
    const member = await getCurrentMembership();
    if (!member) return NextResponse.json({ ok: false, error: "Sign in to accept this invite." }, { status: 401 });
    const { db } = getTenantDb();
    const result = await acceptInvite(db, params.token, member.clerkUserId);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return failWorkgroup(err);
  }
}
