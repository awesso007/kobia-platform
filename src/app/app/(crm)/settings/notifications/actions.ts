"use server";

/*
 * Notification preference server actions (Sprint 5). Per-type toggles for in-app
 * and email delivery. Email is a stub for v0.1 (the flag is stored but no email
 * is sent yet). Preferences are keyed by (clerkUserId, type) and scoped to the
 * current user in the active tenant.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { getTenantDb } from "@/lib/db/get-tenant-db";
import type { NotificationType } from "@/lib/notifications/notify";

const TYPES: NotificationType[] = ["MENTION", "ASSIGNMENT", "DUE_SOON", "AUTOMATION_RESULT", "SYSTEM"];

function currentUserId(): string | null {
  try {
    return auth().userId ?? null;
  } catch {
    return null;
  }
}

export async function setNotificationPref(input: {
  type: string;
  channel: "inApp" | "email";
  enabled: boolean;
}): Promise<{ ok: boolean }> {
  const clerkUserId = currentUserId();
  if (!clerkUserId) return { ok: false };
  if (!TYPES.includes(input.type as NotificationType)) return { ok: false };
  try {
    const { db } = getTenantDb();
    const type = input.type as NotificationType;
    const data = input.channel === "inApp" ? { inApp: input.enabled } : { email: input.enabled };
    await db.notificationPref.upsert({
      where: { clerkUserId_type: { clerkUserId, type } },
      update: data,
      create: {
        clerkUserId,
        type,
        inApp: input.channel === "inApp" ? input.enabled : true,
        email: input.channel === "email" ? input.enabled : false,
      },
    });
    revalidatePath("/app/settings/notifications");
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
