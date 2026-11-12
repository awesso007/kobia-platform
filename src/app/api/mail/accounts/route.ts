/*
 * GET /api/mail/accounts (Sprint 23) - connected email accounts for the current
 * user, used to populate the Webmail account switcher.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse } from "next/server";
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { requirePermission, getCurrentMembership, PermissionError } from "@/lib/rbac/require-permission";
import {auditedHistoricalTenantRead} from "@/lib/chess/historical-sensitive-read";
import { listAccounts } from "@/lib/mail/queries";
import { failMail } from "@/lib/mail/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requirePermission("record:read");
    const { db } = getTenantDb();
    const member = await getCurrentMembership();
    if(!member)throw new PermissionError("record:read");
    const accounts=await auditedHistoricalTenantRead(db,{
      actorClerkUserId:member.clerkUserId,action:"HISTORICAL_EMAIL_ACCOUNT_DIRECTORY_READ",
      resourceType:"EmailAccount",resourceId:"OWN_ACCOUNTS",
    },tx=>listAccounts(tx,member.clerkUserId));
    return NextResponse.json({ ok: true, accounts });
  } catch (err) {
    return failMail(err);
  }
}
