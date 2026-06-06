/*
 * Vercel Cron entrypoint for sending scheduled broadcasts (Sprint 13). Runs
 * daily (see vercel.json, schedule "30 10 * * *"). For each ACTIVE tenant it
 * picks up SCHEDULED broadcasts whose scheduledAt has passed and runs
 * processBroadcast, threading the tenant slug so the injected open/click
 * tracking URLs can resolve the tenant schema.
 *
 * Hobby plans run crons daily only, so a broadcast scheduled for a precise time
 * sends on the next daily sweep rather than at the minute. processBroadcast
 * flips the broadcast to SENDING before iterating, so a re-entrant run skips a
 * broadcast already past SCHEDULED.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse } from "next/server";
import { getTenantPrisma } from "@/lib/db/tenant-prisma";
import { processBroadcast } from "@/lib/marketing/broadcast";

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

    const now = new Date();
    const results: { tenant: string; broadcasts: number; sent: number; failed: number; error?: string }[] = [];

    for (const t of tenants) {
      let broadcasts = 0;
      let sent = 0;
      let failed = 0;
      try {
        const db = getTenantPrisma(t.schemaName);
        const due = await db.broadcast.findMany({
          where: { status: "SCHEDULED", scheduledAt: { lte: now } },
          select: { id: true },
          take: 100,
        });
        for (const b of due) {
          broadcasts++;
          const res = await processBroadcast(db, b.id, t.slug);
          sent += res.sent;
          failed += res.failed;
        }
        results.push({ tenant: t.slug, broadcasts, sent, failed });
      } catch (err) {
        results.push({ tenant: t.slug, broadcasts, sent, failed, error: String(err instanceof Error ? err.message : err) });
      }
    }

    const totalSent = results.reduce((sum, r) => sum + r.sent, 0);
    return NextResponse.json({ ok: true, totalSent, tenants: results });
  } catch (err) {
    console.error("[cron/broadcast-sender] failed", err);
    return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}
