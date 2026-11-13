/*
 * Cron: resume parked workflow runs (Sprint 18). For every ACTIVE tenant, finds
 * WorkflowRun rows in status=WAITING whose resumeAt has passed and advances them
 * (delays and wait_until). Mirrors /api/cron/automations: queries the platform
 * registry, binds a per-tenant client, never lets one tenant's failure abort the
 * others.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse } from "next/server";
import { requireKobiaCronAuth } from "@/lib/security/cron-authorization";
import { getTenantPrisma } from "@/lib/db/tenant-prisma";
import { activeWebhookTenantSchema } from "@/lib/security/legacy-webhook-tenant";
import { resumeWaitingRuns } from "@/lib/workflows/runner";

export const dynamic = "force-dynamic";

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

    const results: { tenant: string; resumed: number; error?: string }[] = [];
    for (const t of tenants) {
      try {
        // Never let a stale platform row route a worker into a foreign schema.
        const schema = await activeWebhookTenantSchema(t.slug);
        if (!schema || schema !== t.schemaName) continue;
        const db = getTenantPrisma(schema);
        const { resumed } = await resumeWaitingRuns(db);
        results.push({ tenant: t.slug, resumed });
      } catch (err) {
        results.push({ tenant: t.slug, resumed: 0, error: String(err instanceof Error ? err.message : err) });
      }
    }

    const total = results.reduce((sum, r) => sum + r.resumed, 0);
    return NextResponse.json({ ok: true, total, tenants: results });
  } catch (err) {
    console.error("[cron/workflow-resumer] failed", err);
    return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}
