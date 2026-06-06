/*
 * Vercel Cron entrypoint for "due soon" activity notifications. Runs daily
 * (see vercel.json, schedule "15 9 * * *" to avoid colliding with the
 * automation cron at "0 9 * * *"). It enumerates ACTIVE tenants and, for each,
 * finds open activities (completedAt null) whose dueAt falls within the next 24
 * hours and that have an owner, then notifies the owner once. Idempotency: we
 * skip an activity if a DUE_SOON notification already links to it, so repeated
 * daily runs do not spam.
 *
 * Cron requests carry no tenant header, so we bind a Prisma client directly to
 * each tenant schema (getTenantPrisma) and use notifyOn(db, ...).
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse } from "next/server";
import { getTenantPrisma } from "@/lib/db/tenant-prisma";
import { notifyOn } from "@/lib/notifications/notify";

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

    const horizon = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const results: { tenant: string; notified: number; error?: string }[] = [];

    for (const t of tenants) {
      let notified = 0;
      try {
        const db = getTenantPrisma(t.schemaName);
        const due = await db.crmActivity.findMany({
          where: {
            completedAt: null,
            ownerClerkUserId: { not: null },
            dueAt: { not: null, lte: horizon, gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          },
          select: { id: true, subject: true, dueAt: true, ownerClerkUserId: true },
          take: 200,
        });
        for (const a of due) {
          const linkUrl = `/app/activities?id=${a.id}`;
          const already = await db.notification.findFirst({
            where: { type: "DUE_SOON", linkUrl },
            select: { id: true },
          });
          if (already) continue;
          await notifyOn(db, a.ownerClerkUserId!, {
            type: "DUE_SOON",
            title: `Due soon: ${a.subject}`,
            body: a.dueAt ? `Due ${a.dueAt.toLocaleString()}` : undefined,
            linkUrl,
          });
          notified++;
        }
        results.push({ tenant: t.slug, notified });
      } catch (err) {
        results.push({ tenant: t.slug, notified, error: String(err instanceof Error ? err.message : err) });
      }
    }

    const total = results.reduce((sum, r) => sum + r.notified, 0);
    return NextResponse.json({ ok: true, total, tenants: results });
  } catch (err) {
    console.error("[cron/notifications] failed", err);
    return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}
