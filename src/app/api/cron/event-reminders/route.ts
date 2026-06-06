/*
 * Vercel Cron entrypoint for calendar event reminders (Sprint 12). Runs daily
 * (see vercel.json, schedule "15 10 * * *"). For each ACTIVE tenant it finds
 * non-canceled events starting within the next 24 hours and queues an in-app
 * EVENT_REMINDER notification to each internal attendee (and the organizer),
 * then dispatches EVENT_STARTING_SOON automations once per event.
 *
 * Hobby plans run crons daily only, so this is a once-a-day sweep rather than a
 * per-minute reminder engine. Per-minute reminders (honoring each event's
 * reminders[] offsets exactly) require the Pro plan; the booking/calendar copy
 * notes this. Idempotency: skip an attendee if an EVENT_REMINDER notification
 * already links to the event, so repeated runs do not spam.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse } from "next/server";
import { getTenantPrisma } from "@/lib/db/tenant-prisma";
import { notifyOn } from "@/lib/notifications/notify";
import { dispatchAutomation } from "@/lib/automations/dispatch";

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
    const horizon = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const results: { tenant: string; events: number; notified: number; error?: string }[] = [];

    for (const t of tenants) {
      let events = 0;
      let notified = 0;
      try {
        const db = getTenantPrisma(t.schemaName);
        const upcoming = await db.calendarEvent.findMany({
          where: { status: { not: "CANCELED" }, startAt: { gte: now, lte: horizon } },
          select: { id: true, title: true, startAt: true, organizerClerkUserId: true, attendees: { select: { clerkUserId: true } } },
          take: 500,
        });
        for (const ev of upcoming) {
          events++;
          const linkUrl = `/app/calendar?event=${ev.id}`;
          const recipients = new Set<string>();
          if (ev.organizerClerkUserId) recipients.add(ev.organizerClerkUserId);
          for (const a of ev.attendees) if (a.clerkUserId) recipients.add(a.clerkUserId);

          for (const clerkUserId of recipients) {
            const already = await db.notification.findFirst({
              where: { type: "EVENT_REMINDER", linkUrl, clerkUserId },
              select: { id: true },
            });
            if (already) continue;
            await notifyOn(db, clerkUserId, {
              type: "EVENT_REMINDER",
              title: `Reminder: ${ev.title}`,
              body: `Starts ${ev.startAt.toLocaleString()}`,
              linkUrl,
            });
            notified++;
          }
          await dispatchAutomation({ type: "EVENT_STARTING_SOON", entityType: "EVENT", entityId: ev.id }, db).catch(() => {});
        }
        results.push({ tenant: t.slug, events, notified });
      } catch (err) {
        results.push({ tenant: t.slug, events, notified, error: String(err instanceof Error ? err.message : err) });
      }
    }

    const total = results.reduce((sum, r) => sum + r.notified, 0);
    return NextResponse.json({ ok: true, total, tenants: results });
  } catch (err) {
    console.error("[cron/event-reminders] failed", err);
    return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}
