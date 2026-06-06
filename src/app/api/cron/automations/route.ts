/*
 * Vercel Cron entrypoint for automation WAIT continuations. Runs every 5 min
 * (see vercel.json). It enumerates ACTIVE tenants from the platform registry
 * and, for each, processes any AutomationQueue rows whose resumeAt has passed
 * using a Prisma client bound directly to that tenant's schema (cron requests
 * carry no tenant header, so getTenantDb() cannot resolve a tenant here).
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse } from "next/server";
import { getTenantPrisma } from "@/lib/db/tenant-prisma";
import { processAutomationQueue } from "@/lib/automations/dispatch";

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

    const results: { tenant: string; processed: number; error?: string }[] = [];
    for (const t of tenants) {
      try {
        const db = getTenantPrisma(t.schemaName);
        const { processed } = await processAutomationQueue(db);
        results.push({ tenant: t.slug, processed });
      } catch (err) {
        results.push({ tenant: t.slug, processed: 0, error: String(err instanceof Error ? err.message : err) });
      }
    }
    const total = results.reduce((sum, r) => sum + r.processed, 0);
    return NextResponse.json({ ok: true, total, tenants: results });
  } catch (err) {
    console.error("[cron/automations] failed", err);
    return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}
