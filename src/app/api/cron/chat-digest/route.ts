/*
 * Vercel Cron entrypoint for the daily chat mentions digest (Sprint 16). Runs
 * once a day (see vercel.json, schedule "45 11 * * *"). For each ACTIVE tenant
 * it emails members who were @mentioned in the prior day a short digest, using
 * the tenant's first configured email account.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse } from "next/server";
import { requireKobiaCronAuth } from "@/lib/security/cron-authorization";
import { getTenantPrisma } from "@/lib/db/tenant-prisma";
import { activeWebhookTenantSchema } from "@/lib/security/legacy-webhook-tenant";
import { sendChatDigest } from "@/lib/chat/crons";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  // Authentication must precede tenant enumeration and all side effects.
  const denied = requireKobiaCronAuth(req);
  if (denied) return denied;
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

    const results: { tenant: string; sent: number; error?: string }[] = [];
    for (const t of tenants) {
      try {
        // Never let a stale platform row route a worker into a foreign schema.
        const schema = await activeWebhookTenantSchema(t.slug);
        if (!schema || schema !== t.schemaName) continue;
        const db = getTenantPrisma(schema);
        const sent = await sendChatDigest(db);
        results.push({ tenant: t.slug, sent });
      } catch (err) {
        results.push({ tenant: t.slug, sent: 0, error: String(err instanceof Error ? err.message : err) });
      }
    }

    const total = results.reduce((sum, r) => sum + r.sent, 0);
    return NextResponse.json({ ok: true, total, tenants: results });
  } catch (err) {
    console.error("[cron/chat-digest] failed", err);
    return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}
