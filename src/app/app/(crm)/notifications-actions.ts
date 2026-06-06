"use server";

/*
 * Notification server actions (Sprint 5): mark a single notification read,
 * mark all read. Scoped to the current Clerk user in the active tenant so a
 * member can only mutate their own rows.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { auth } from "@clerk/nextjs/server";
import { getTenantDb } from "@/lib/db/get-tenant-db";

function currentUserId(): string | null {
  try {
    return auth().userId ?? null;
  } catch {
    return null;
  }
}

export async function markNotificationRead(id: string): Promise<{ ok: boolean }> {
  const clerkUserId = currentUserId();
  if (!clerkUserId) return { ok: false };
  try {
    const { db } = getTenantDb();
    await db.notification.updateMany({
      where: { id, clerkUserId, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function markAllNotificationsRead(): Promise<{ ok: boolean }> {
  const clerkUserId = currentUserId();
  if (!clerkUserId) return { ok: false };
  try {
    const { db } = getTenantDb();
    await db.notification.updateMany({
      where: { clerkUserId, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
