/*
 * Vercel Cron entrypoint for drip campaign enrollments (Sprint 13). Runs daily
 * (see vercel.json, schedule "45 10 * * *"). For each ACTIVE tenant it picks up
 * ACTIVE CampaignEnrollments whose nextRunAt has passed and runs the current
 * step via runEnrollmentStep, which sends/advances/completes as appropriate.
 *
 * Hobby plans run crons daily only, so WAIT steps resolve at day granularity
 * (a 2-day wait resumes on the next sweep at or after the resume time) rather
 * than to the minute. runEnrollmentStep advances or reschedules each enrollment,
 * so a re-entrant run does not re-process the same step.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse } from "next/server";
import { getTenantPrisma } from "@/lib/db/tenant-prisma";
import { runEnrollmentStep } from "@/lib/marketing/campaign";

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
    const results: { tenant: string; processed: number; error?: string }[] = [];

    for (const t of tenants) {
      let processed = 0;
      try {
        const db = getTenantPrisma(t.schemaName);
        const due = await db.campaignEnrollment.findMany({
          where: {
            status: "ACTIVE",
            nextRunAt: { lte: now },
            campaign: { is: { status: "ACTIVE" } },
          },
          select: { id: true },
          take: 500,
        });
        for (const e of due) {
          await runEnrollmentStep(db, e.id);
          processed++;
        }
        results.push({ tenant: t.slug, processed });
      } catch (err) {
        results.push({ tenant: t.slug, processed, error: String(err instanceof Error ? err.message : err) });
      }
    }

    const total = results.reduce((sum, r) => sum + r.processed, 0);
    return NextResponse.json({ ok: true, total, tenants: results });
  } catch (err) {
    console.error("[cron/campaign-runner] failed", err);
    return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}
