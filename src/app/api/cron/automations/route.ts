/*
 * Vercel Cron entrypoint for automation maintenance (daily, see vercel.json).
 * It enumerates ACTIVE tenants from the platform registry and, for each, (1)
 * processes any AutomationQueue WAIT continuations whose resumeAt has passed and
 * (2) scans for rotting deals (time-in-stage past the stage's rotting_days),
 * dispatching STAGE_TIME_EXCEEDED. Uses a Prisma client bound directly to each
 * tenant's schema (cron requests carry no tenant header, so getTenantDb() cannot
 * resolve a tenant here).
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse } from "next/server";
import { getTenantPrisma } from "@/lib/db/tenant-prisma";
import { processAutomationQueue, scanRottingDeals } from "@/lib/automations/dispatch";

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

    const results: { tenant: string; processed: number; rotting: number; error?: string }[] = [];
    for (const t of tenants) {
      try {
        const db = getTenantPrisma(t.schemaName);
        const { processed } = await processAutomationQueue(db);
        const { rotting } = await scanRottingDeals(db);
        results.push({ tenant: t.slug, processed, rotting });
      } catch (err) {
        results.push({ tenant: t.slug, processed: 0, rotting: 0, error: String(err instanceof Error ? err.message : err) });
      }
    }
    const total = results.reduce((sum, r) => sum + r.processed, 0);
    const rottingTotal = results.reduce((sum, r) => sum + r.rotting, 0);
    return NextResponse.json({ ok: true, total, rottingTotal, tenants: results });
  } catch (err) {
    console.error("[cron/automations] failed", err);
    return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}
