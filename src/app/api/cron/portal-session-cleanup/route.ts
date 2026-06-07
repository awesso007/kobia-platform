/*
 * Vercel Cron entrypoint for customer portal session cleanup (Sprint 15). Runs
 * daily (see vercel.json, schedule "30 11 * * *"). For each ACTIVE tenant it
 * deletes expired CustomerPortalSession rows so the table does not grow without
 * bound. Sessions are otherwise harmless once expired (validatePortalSession
 * rejects them), so this is purely housekeeping.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse } from "next/server";
import { getTenantPrisma } from "@/lib/db/tenant-prisma";
import { pruneExpiredSessions } from "@/lib/helpdesk/portal";

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

    const results: { tenant: string; pruned: number; error?: string }[] = [];
    for (const t of tenants) {
      try {
        const db = getTenantPrisma(t.schemaName);
        const pruned = await pruneExpiredSessions(db);
        results.push({ tenant: t.slug, pruned });
      } catch (err) {
        results.push({ tenant: t.slug, pruned: 0, error: String(err instanceof Error ? err.message : err) });
      }
    }

    const total = results.reduce((sum, r) => sum + r.pruned, 0);
    return NextResponse.json({ ok: true, total, tenants: results });
  } catch (err) {
    console.error("[cron/portal-session-cleanup] failed", err);
    return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}
