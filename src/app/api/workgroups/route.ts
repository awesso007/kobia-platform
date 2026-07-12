/*
 * Workgroups collection API (Sprint 22, authenticated). GET returns the current
 * user's groups plus discoverable groups; POST creates a new group (and its
 * backing chat channel) with the caller as OWNER.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { requirePermission, getCurrentMembership } from "@/lib/rbac/require-permission";
import { listMyGroups, listDiscover } from "@/lib/workgroups/queries";
import { createGroup } from "@/lib/workgroups/mutations";
import { failWorkgroup } from "@/lib/workgroups/api";
import type { WorkgroupVisibility } from "@/lib/workgroups/workgroup-utils";

export const dynamic = "force-dynamic";

const VISIBILITIES: WorkgroupVisibility[] = ["PUBLIC", "PRIVATE", "SECRET"];

export async function GET() {
  try {
    await requirePermission("record:read");
    const { db } = getTenantDb();
    const member = await getCurrentMembership();
    const userId = member?.clerkUserId ?? null;
    const [mine, discover] = await Promise.all([
      userId ? listMyGroups(db, userId) : Promise.resolve([]),
      listDiscover(db, userId),
    ]);
    return NextResponse.json({ ok: true, mine, discover });
  } catch (err) {
    return failWorkgroup(err);
  }
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  try {
    await requirePermission("record:create");
    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ ok: false, error: "Group name is required." }, { status: 400 });
    const member = await getCurrentMembership();
    const ownerId = member?.clerkUserId ?? "system";
    const rawVis = String(body.visibility ?? "PUBLIC") as WorkgroupVisibility;
    const visibility = VISIBILITIES.includes(rawVis) ? rawVis : "PUBLIC";

    const { db } = getTenantDb();
    const id = await createGroup(db, {
      name,
      description: (body.description as string) ?? null,
      visibility,
      icon: (body.icon as string) ?? null,
      coverColor: (body.coverColor as string) ?? null,
      ownerId,
    });
    const group = await db.workgroup.findUnique({ where: { id }, select: { slug: true } });
    return NextResponse.json({ ok: true, id, slug: group?.slug ?? null }, { status: 201 });
  } catch (err) {
    return failWorkgroup(err);
  }
}
