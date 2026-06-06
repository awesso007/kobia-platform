/*
 * Vercel Cron entrypoint for external calendar sync (Sprint 12). Runs daily
 * (see vercel.json, schedule "0 10 * * *" - in the second hour-block so it does
 * not collide with the Sprint 9-11 crons at *:09). For each ACTIVE tenant it
 * fetches every EXTERNAL_ICS calendar via node-ical and upserts events by
 * externalId. EXTERNAL_GOOGLE / EXTERNAL_OUTLOOK calendars are logged as "not
 * configured" until OAuth lands in v0.4.
 *
 * Cron requests carry no tenant header, so we bind a Prisma client directly to
 * each tenant schema (getTenantPrisma).
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse } from "next/server";
import { getTenantPrisma } from "@/lib/db/tenant-prisma";
import { syncIcsCalendar } from "@/lib/calendar/ics";

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

    const results: { tenant: string; calendars: number; upserted: number; skipped: number; error?: string }[] = [];

    for (const t of tenants) {
      let calendars = 0;
      let upserted = 0;
      let skipped = 0;
      try {
        const db = getTenantPrisma(t.schemaName);
        const externals = await db.calendar.findMany({
          where: { type: { in: ["EXTERNAL_ICS", "EXTERNAL_GOOGLE", "EXTERNAL_OUTLOOK"] } },
          select: { id: true, type: true, externalUrl: true },
        });
        for (const cal of externals) {
          if (cal.type !== "EXTERNAL_ICS") {
            console.warn(`[cron/calendar-sync] ${t.slug}: ${cal.type} calendar ${cal.id} not configured (OAuth pending v0.4)`);
            skipped++;
            continue;
          }
          calendars++;
          const res = await syncIcsCalendar(db, { id: cal.id, externalUrl: cal.externalUrl });
          upserted += res.upserted;
          await db.calendar.update({ where: { id: cal.id }, data: { lastSyncedAt: new Date() } }).catch(() => {});
        }
        results.push({ tenant: t.slug, calendars, upserted, skipped });
      } catch (err) {
        results.push({ tenant: t.slug, calendars, upserted, skipped, error: String(err instanceof Error ? err.message : err) });
      }
    }

    const total = results.reduce((sum, r) => sum + r.upserted, 0);
    return NextResponse.json({ ok: true, total, tenants: results });
  } catch (err) {
    console.error("[cron/calendar-sync] failed", err);
    return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}
