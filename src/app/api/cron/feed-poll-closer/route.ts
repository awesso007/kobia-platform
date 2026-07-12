/*
 * Cron: feed poll closer (Sprint 21). For every ACTIVE tenant, closes feed polls
 * whose closesAt has passed but that are not yet closed (sets closedAt = now).
 * Mirrors the other per-tenant crons: queries the platform registry, binds a
 * per-tenant client, never lets one tenant's failure abort the others.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse } from "next/server";
import { getTenantPrisma } from "@/lib/db/tenant-prisma";

export const dynamic = "force-dynamic";

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
    const results: { tenant: string; closed: number; error?: string }[] = [];
    for (const t of tenants) {
      try {
        const db = getTenantPrisma(t.schemaName);
        const res = await db.feedPoll.updateMany({
          where: { closedAt: null, closesAt: { not: null, lte: now } },
          data: { closedAt: now },
        });
        results.push({ tenant: t.slug, closed: res.count });
      } catch (err) {
        results.push({ tenant: t.slug, closed: 0, error: String(err instanceof Error ? err.message : err) });
      }
    }

    const total = results.reduce((sum, r) => sum + r.closed, 0);
    return NextResponse.json({ ok: true, total, tenants: results });
  } catch (err) {
    console.error("[cron/feed-poll-closer] failed", err);
    return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}
