/*
 * notify.ts - create an in-app Notification for a user in the active tenant.
 *
 * notify(clerkUserId, {...}) inserts a Notification row (respecting the user's
 * in-app preference for that type when one exists). Like auditWrite, it never
 * throws: a failed notification must not break the action that triggered it.
 *
 * For tenant contexts WITHOUT a request header (cron jobs), pass an explicit
 * db client via notifyOn(db, ...). The header-based notify() is for server
 * actions running inside a tenant request.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { getTenantDb } from "@/lib/db/get-tenant-db";
import type { PrismaClient } from "@/lib/db/generated/tenant";

export type NotificationType =
  | "MENTION"
  | "ASSIGNMENT"
  | "DUE_SOON"
  | "AUTOMATION_RESULT"
  | "SYSTEM"
  | "TASK_ASSIGNED"
  | "TASK_DUE_SOON"
  | "TASK_MENTIONED"
  | "TASK_COMMENTED"
  | "EVENT_INVITE"
  | "EVENT_REMINDER"
  | "BOOKING_CREATED";

export type NotifyInput = {
  type: NotificationType;
  title: string;
  body?: string;
  linkUrl?: string;
};

/** Insert a notification using an explicit tenant client (safe in cron). */
export async function notifyOn(
  db: PrismaClient,
  clerkUserId: string,
  input: NotifyInput,
): Promise<void> {
  try {
    const pref = await db.notificationPref.findUnique({
      where: { clerkUserId_type: { clerkUserId, type: input.type } },
    });
    if (pref && !pref.inApp) return; // user muted this type in-app
    await db.notification.create({
      data: {
        clerkUserId,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        linkUrl: input.linkUrl ?? null,
      },
    });
  } catch (err) {
    console.error("[notify] failed to create notification", err);
  }
}

/** Insert a notification for a user in the request-scoped active tenant. */
export async function notify(clerkUserId: string, input: NotifyInput): Promise<void> {
  try {
    const { db } = getTenantDb();
    await notifyOn(db, clerkUserId, input);
  } catch (err) {
    console.error("[notify] failed to resolve tenant", err);
  }
}
