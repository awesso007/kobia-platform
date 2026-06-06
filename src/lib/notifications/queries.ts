/*
 * Notification read/query helpers (Sprint 5). Server-only. These read the
 * active tenant via getTenantDb() and scope every query to the current Clerk
 * user so a member only ever sees their own notifications.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { auth } from "@clerk/nextjs/server";
import { getTenantDb } from "@/lib/db/get-tenant-db";
import type { NotificationType } from "./notify";

export type NotificationRow = {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  linkUrl: string | null;
  readAt: string | null;
  createdAt: string;
};

function currentUserId(): string | null {
  try {
    return auth().userId ?? null;
  } catch {
    return null;
  }
}

export async function listNotifications(limit = 50): Promise<NotificationRow[]> {
  const clerkUserId = currentUserId();
  if (!clerkUserId) return [];
  try {
    const { db } = getTenantDb();
    const rows = await db.notification.findMany({
      where: { clerkUserId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return rows.map((n) => ({
      id: n.id,
      type: n.type as NotificationType,
      title: n.title,
      body: n.body,
      linkUrl: n.linkUrl,
      readAt: n.readAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
    }));
  } catch {
    return [];
  }
}

export async function unreadCount(): Promise<number> {
  const clerkUserId = currentUserId();
  if (!clerkUserId) return 0;
  try {
    const { db } = getTenantDb();
    return await db.notification.count({ where: { clerkUserId, readAt: null } });
  } catch {
    return 0;
  }
}
