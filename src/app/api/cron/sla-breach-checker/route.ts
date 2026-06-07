/*
 * Vercel Cron entrypoint for helpdesk SLA breach detection (Sprint 15). Runs
 * daily (see vercel.json, schedule "15 11 * * *"). For each ACTIVE tenant it
 * scans open tickets whose first-response or resolve SLA target has passed,
 * logging an SLA_BREACHED audit event (once per kind) and dispatching the
 * SLA_BREACHED automation trigger. scanSlaBreaches is idempotent across runs,
 * so a daily sweep will not re-fire for tickets already flagged.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse } from "next/server";
import { getTenantPrisma } from "@/lib/db/tenant-prisma";
import { scanSlaBreaches } from "@/lib/helpdesk/tickets";

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

    const results: { tenant: string; breached: number; error?: string }[] = [];
    for (const t of tenants) {
      try {
        const db = getTenantPrisma(t.schemaName);
        const breached = await scanSlaBreaches(db);
        results.push({ tenant: t.slug, breached });
      } catch (err) {
        results.push({ tenant: t.slug, breached: 0, error: String(err instanceof Error ? err.message : err) });
      }
    }

    const total = results.reduce((sum, r) => sum + r.breached, 0);
    return NextResponse.json({ ok: true, total, tenants: results });
  } catch (err) {
    console.error("[cron/sla-breach-checker] failed", err);
    return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}
