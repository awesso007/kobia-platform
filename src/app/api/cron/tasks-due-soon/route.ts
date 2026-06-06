/*
 * Vercel Cron entrypoint for "due soon" task notifications (Sprint 11). Runs
 * daily (see vercel.json, schedule "45 9 * * *" to avoid colliding with the
 * automation/notification/email crons earlier in the hour). It enumerates
 * ACTIVE tenants and, for each, finds open tasks (not DONE/CANCELED, not
 * soft-deleted) whose dueAt falls within the next 24 hours and that have an
 * assignee, then notifies the assignee once and dispatches TASK_DUE_SOON for
 * any matching automations. Idempotency: we skip a task if a TASK_DUE_SOON
 * notification already links to it, so repeated daily runs do not spam.
 *
 * Cron requests carry no tenant header, so we bind a Prisma client directly to
 * each tenant schema (getTenantPrisma) and use notifyOn(db, ...).
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse } from "next/server";
import { getTenantPrisma } from "@/lib/db/tenant-prisma";
import { notifyOn } from "@/lib/notifications/notify";
import { dispatchAutomation } from "@/lib/automations/dispatch";

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
    const floor = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const results: { tenant: string; notified: number; error?: string }[] = [];

    for (const t of tenants) {
      let notified = 0;
      try {
        const db = getTenantPrisma(t.schemaName);
        const due = await db.task.findMany({
          where: {
            deletedAt: null,
            status: { notIn: ["DONE", "CANCELED"] },
            assigneeClerkUserId: { not: null },
            dueAt: { not: null, lte: horizon, gte: floor },
          },
          select: { id: true, title: true, dueAt: true, projectId: true, assigneeClerkUserId: true },
          take: 500,
        });
        for (const task of due) {
          const linkUrl = task.projectId ? `/app/projects/${task.projectId}?task=${task.id}` : `/app/tasks?task=${task.id}`;
          const already = await db.notification.findFirst({
            where: { type: "TASK_DUE_SOON", linkUrl },
            select: { id: true },
          });
          if (already) continue;
          await notifyOn(db, task.assigneeClerkUserId!, {
            type: "TASK_DUE_SOON",
            title: `Due soon: ${task.title}`,
            body: task.dueAt ? `Due ${task.dueAt.toLocaleString()}` : undefined,
            linkUrl,
          });
          await dispatchAutomation({ type: "TASK_DUE_SOON", entityType: "TASK", entityId: task.id }, db);
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
    console.error("[cron/tasks-due-soon] failed", err);
    return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}
