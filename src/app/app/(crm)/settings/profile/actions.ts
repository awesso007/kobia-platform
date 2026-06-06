"use server";

/*
 * Profile settings server actions (Sprint 7). Read + upsert the current user's
 * UserPreference row (call forwarding number, call-notification toggle, default
 * outbound number). Keyed by the resolved Clerk user id; falls back to a seed
 * id when no Clerk session is present (alpha single-tenant mode).
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { getCurrentMembership } from "@/lib/rbac/require-permission";

const FALLBACK_USER_ID = "user_acme_owner_seed";

export type ProfilePrefs = {
  clerkUserId: string;
  callForwardingE164: string | null;
  receiveCallNotifications: boolean;
  defaultOutboundNumberId: string | null;
};

export type OutboundNumberOption = { id: string; e164: string };

async function currentUserId(): Promise<string> {
  const member = await getCurrentMembership();
  return member?.clerkUserId ?? FALLBACK_USER_ID;
}

export async function getProfilePrefs(): Promise<{ prefs: ProfilePrefs; numbers: OutboundNumberOption[] }> {
  const { db } = getTenantDb();
  const clerkUserId = await currentUserId();
  const [row, numbers] = await Promise.all([
    db.userPreference.findUnique({ where: { clerkUserId } }),
    db.phoneNumber.findMany({ where: { status: "ACTIVE" }, orderBy: { e164: "asc" }, select: { id: true, e164: true } }),
  ]);
  return {
    prefs: {
      clerkUserId,
      callForwardingE164: row?.callForwardingE164 ?? null,
      receiveCallNotifications: row?.receiveCallNotifications ?? true,
      defaultOutboundNumberId: row?.defaultOutboundNumberId ?? null,
    },
    numbers,
  };
}

export async function saveProfilePrefs(input: {
  callForwardingE164?: string | null;
  receiveCallNotifications?: boolean;
  defaultOutboundNumberId?: string | null;
}): Promise<{ ok: boolean }> {
  const { db } = getTenantDb();
  const clerkUserId = await currentUserId();
  const data = {
    callForwardingE164: input.callForwardingE164?.trim() || null,
    receiveCallNotifications: input.receiveCallNotifications ?? true,
    defaultOutboundNumberId: input.defaultOutboundNumberId || null,
  };
  await db.userPreference.upsert({
    where: { clerkUserId },
    create: { clerkUserId, ...data },
    update: data,
  });
  return { ok: true };
}
