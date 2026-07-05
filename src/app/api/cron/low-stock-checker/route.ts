/*
 * Cron: low-stock checker (Sprint 20). For every ACTIVE tenant, scans StockItem
 * rows at or below their low-stock threshold and fires STOCK_LOW (deduped via
 * lastLowStockNotifiedAt). Mirrors the other per-tenant crons: queries the
 * platform registry, binds a per-tenant client, never lets one tenant's failure
 * abort the others.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse } from "next/server";
import { getTenantPrisma } from "@/lib/db/tenant-prisma";
import { checkLowStock } from "@/lib/inventory/stock";

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

    const results: { tenant: string; notified: number; error?: string }[] = [];
    for (const t of tenants) {
      try {
        const db = getTenantPrisma(t.schemaName);
        const notified = await checkLowStock(db);
        results.push({ tenant: t.slug, notified });
      } catch (err) {
        results.push({ tenant: t.slug, notified: 0, error: String(err instanceof Error ? err.message : err) });
      }
    }

    const total = results.reduce((sum, r) => sum + r.notified, 0);
    return NextResponse.json({ ok: true, total, tenants: results });
  } catch (err) {
    console.error("[cron/low-stock-checker] failed", err);
    return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}
