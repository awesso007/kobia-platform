/*
 * Vercel Cron entrypoint for IMAP mail sync. Runs once daily (Hobby plan; see
 * vercel.json schedule "30 9 * * *", offset from the automations/notifications
 * crons). It enumerates ACTIVE tenants from the platform registry and, for each
 * active SMTP_IMAP EmailAccount, pulls new messages since lastSyncedAt.
 *
 * Cron requests carry no tenant header, so we bind a Prisma client directly to
 * each tenant schema. Every account is wrapped in try/catch so one bad mailbox
 * does not abort the run.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse } from "next/server";
import { getTenantPrisma } from "@/lib/db/tenant-prisma";
import { syncAccount, type SyncResult } from "@/lib/email/imap-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    const { PrismaClient } = await import("@/lib/db/generated/platform");
    const platform = new PrismaClient();
    let tenants: { slug: string; schemaName: string }[] = [];
    try {
      tenants = await platform.tenantRegistry.findMany({
        where: { status: "ACTIVE" },
        select: { slug: true, schemaName: true },
      });
    } finally {
      await platform.$disconnect();
    }

    const results: { tenant: string; accounts: SyncResult[]; error?: string }[] = [];
    for (const t of tenants) {
      try {
        const db = getTenantPrisma(t.schemaName);
        const accounts = await db.emailAccount.findMany({
          where: { status: "ACTIVE", provider: "SMTP_IMAP" },
        });
        const accountResults: SyncResult[] = [];
        for (const account of accounts) {
          try {
            accountResults.push(await syncAccount(db, account));
          } catch (err) {
            accountResults.push({
              accountId: account.id,
              address: account.address,
              fetched: 0,
              error: String(err instanceof Error ? err.message : err),
            });
          }
        }
        results.push({ tenant: t.slug, accounts: accountResults });
      } catch (err) {
        results.push({ tenant: t.slug, accounts: [], error: String(err instanceof Error ? err.message : err) });
      }
    }
    const total = results.reduce((sum, r) => sum + r.accounts.reduce((s, a) => s + a.fetched, 0), 0);
    return NextResponse.json({ ok: true, total, tenants: results });
  } catch (err) {
    console.error("[cron/email-sync] failed", err);
    return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}
