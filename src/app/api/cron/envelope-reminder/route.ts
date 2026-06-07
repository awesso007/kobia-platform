/*
 * Vercel Cron entrypoint for e-signature envelope reminders (Sprint 14). Runs
 * daily (see vercel.json, schedule "0 11 * * *"). For each ACTIVE tenant it
 * finds SENT envelopes whose current signer (lowest order, not yet SIGNED) was
 * last emailed more than a day ago and re-sends the signing link, updating
 * reminderSentAt and logging a SENT audit event so repeated daily runs do not
 * spam the same signer.
 *
 * Hobby plans run crons daily only, so this is a once-a-day sweep. Sequential
 * signing means only one signer is active per envelope, so at most one reminder
 * per envelope per run. The tenant slug is threaded through so the signing link
 * carries the correct `?t=` for the public /esign page.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse } from "next/server";
import { getTenantPrisma } from "@/lib/db/tenant-prisma";
import { remindEnvelopes } from "@/lib/documents/envelopes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

    const results: { tenant: string; reminded: number; error?: string }[] = [];
    for (const t of tenants) {
      try {
        const db = getTenantPrisma(t.schemaName);
        const reminded = await remindEnvelopes(db, t.slug);
        results.push({ tenant: t.slug, reminded });
      } catch (err) {
        results.push({ tenant: t.slug, reminded: 0, error: String(err instanceof Error ? err.message : err) });
      }
    }

    const total = results.reduce((sum, r) => sum + r.reminded, 0);
    return NextResponse.json({ ok: true, total, tenants: results });
  } catch (err) {
    console.error("[cron/envelope-reminder] failed", err);
    return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}
