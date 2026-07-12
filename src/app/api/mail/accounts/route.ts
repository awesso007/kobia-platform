/*
 * GET /api/mail/accounts (Sprint 23) - connected email accounts for the current
 * user, used to populate the Webmail account switcher.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse } from "next/server";
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { requirePermission, getCurrentMembership } from "@/lib/rbac/require-permission";
import { listAccounts } from "@/lib/mail/queries";
import { failMail } from "@/lib/mail/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requirePermission("record:read");
    const { db } = getTenantDb();
    const member = await getCurrentMembership();
    const accounts = await listAccounts(db, member?.clerkUserId ?? null);
    return NextResponse.json({ ok: true, accounts });
  } catch (err) {
    return failMail(err);
  }
}
