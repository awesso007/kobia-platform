/*
 * Forms 2.0 submissions list API (Sprint 19, authenticated). GET returns recent
 * submissions for a form. RBAC form:manage.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { requirePermission, getCurrentMembership, PermissionError } from "@/lib/rbac/require-permission";
import {auditedHistoricalTenantRead} from "@/lib/chess/historical-sensitive-read";
import { listSubmissions } from "@/lib/forms2/queries";

export const dynamic = "force-dynamic";

function fail(err: unknown) {
  if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
  if (err instanceof NoTenantError) return NextResponse.json({ ok: false, error: "No tenant." }, { status: 400 });
  return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission("form:manage");
    const { db } = getTenantDb();
    const member=await getCurrentMembership();
    if(!member)throw new PermissionError("record:read");
    const submissions=await auditedHistoricalTenantRead(db,{
      actorClerkUserId:member.clerkUserId,
      action:"HISTORICAL_FORM_SUBMISSIONS_READ",
      resourceType:"FormV2",resourceId:params.id,
      allowedRoles:["OWNER","ADMIN"],
    },async tx=>{
      const form=await tx.formV2.findUnique({where:{id:params.id},select:{id:true}});
      return form?listSubmissions(tx,form.id):null;
    });
    return NextResponse.json({ ok: true, submissions });
  } catch (err) {
    return fail(err);
  }
}
