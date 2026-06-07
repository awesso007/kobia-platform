/*
 * Vercel Cron entrypoint for chat presence cleanup (Sprint 16). Runs once a day
 * (see vercel.json, schedule "0 12 * * *"). For each ACTIVE tenant it flips any
 * non-OFFLINE presence whose last heartbeat is older than 24h back to OFFLINE.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse } from "next/server";
import { getTenantPrisma } from "@/lib/db/tenant-prisma";
import { cleanupChatPresence } from "@/lib/chat/crons";

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

    const results: { tenant: string; cleaned: number; error?: string }[] = [];
    for (const t of tenants) {
      try {
        const db = getTenantPrisma(t.schemaName);
        const cleaned = await cleanupChatPresence(db);
        results.push({ tenant: t.slug, cleaned });
      } catch (err) {
        results.push({ tenant: t.slug, cleaned: 0, error: String(err instanceof Error ? err.message : err) });
      }
    }

    const total = results.reduce((sum, r) => sum + r.cleaned, 0);
    return NextResponse.json({ ok: true, total, tenants: results });
  } catch (err) {
    console.error("[cron/chat-presence-cleanup] failed", err);
    return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}
