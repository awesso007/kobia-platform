"use server";

/*
 * Telephony settings server actions (Sprint 7). Manage phone numbers (search,
 * buy, release, assign) and per-number routing rules (TelephonyRule). Every
 * mutation is gated by requirePermission("telephony:manage") and recorded with
 * auditWrite. Twilio calls are guarded by isConfigured() so the UI works in
 * "not configured" mode.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { requirePermission } from "@/lib/rbac/require-permission";
import { auditWrite } from "@/lib/crm/audit";
import {
  isConfigured,
  searchNumbers as twilioSearch,
  buyNumber as twilioBuy,
  releaseNumber as twilioRelease,
  type AvailableNumber,
} from "@/lib/telephony/twilio";

export type PhoneNumberRow = {
  id: string;
  e164: string;
  friendlyName: string | null;
  type: string;
  provider: string;
  status: string;
  assignedClerkUserId: string | null;
  monthlyPriceCents: number;
};

export type MemberOption = { clerkUserId: string; displayName: string | null; email: string | null };

export async function listPhoneNumbers(): Promise<PhoneNumberRow[]> {
  const { db } = getTenantDb();
  const rows = await db.phoneNumber.findMany({ orderBy: { createdAt: "desc" } });
  return rows.map((r) => ({
    id: r.id,
    e164: r.e164,
    friendlyName: r.friendlyName,
    type: r.type,
    provider: r.provider,
    status: r.status,
    assignedClerkUserId: r.assignedClerkUserId,
    monthlyPriceCents: r.monthlyPriceCents,
  }));
}

export async function listMembers(): Promise<MemberOption[]> {
  const { db } = getTenantDb();
  const members = await db.membership.findMany({ orderBy: { displayName: "asc" } });
  return members.map((m) => ({ clerkUserId: m.clerkUserId, displayName: m.displayName, email: m.email }));
}

export async function searchAvailableNumbers(input: { areaCode?: string; contains?: string }): Promise<{ ok: boolean; numbers?: AvailableNumber[]; error?: string }> {
  await requirePermission("telephony:manage");
  if (!isConfigured()) return { ok: false, error: "Twilio not configured." };
  try {
    const numbers = await twilioSearch({ areaCode: input.areaCode, contains: input.contains, capabilities: { sms: true, voice: true }, limit: 20 });
    return { ok: true, numbers };
  } catch (err) {
    return { ok: false, error: String(err instanceof Error ? err.message : err) };
  }
}

export async function buyPhoneNumber(e164: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  await requirePermission("telephony:manage");
  const { db } = getTenantDb();
  if (!isConfigured()) return { ok: false, error: "Twilio not configured." };
  try {
    const bought = await twilioBuy(e164);
    const row = await db.phoneNumber.create({
      data: {
        e164: bought.e164,
        provider: "TWILIO",
        providerSid: bought.sid,
        capabilities: bought.capabilities as never,
        status: "ACTIVE",
        purchasedAt: new Date(),
        monthlyPriceCents: 115,
      },
    });
    await auditWrite({ action: "CREATE", entityType: "COMPANY", entityId: row.id, diff: { e164: bought.e164 } });
    return { ok: true, id: row.id };
  } catch (err) {
    return { ok: false, error: String(err instanceof Error ? err.message : err) };
  }
}

export async function releasePhoneNumber(id: string): Promise<{ ok: boolean; error?: string }> {
  await requirePermission("telephony:manage");
  const { db } = getTenantDb();
  const row = await db.phoneNumber.findUnique({ where: { id } });
  if (!row) return { ok: false, error: "Number not found." };
  try {
    if (isConfigured() && row.providerSid) await twilioRelease(row.providerSid);
  } catch (err) {
    // Release in Twilio may fail (already released); proceed to mark locally.
    console.error("[releasePhoneNumber] twilio release failed", err);
  }
  await db.phoneNumber.update({ where: { id }, data: { status: "RELEASED", assignedClerkUserId: null } });
  await auditWrite({ action: "UPDATE", entityType: "COMPANY", entityId: id, diff: { status: "RELEASED" } });
  return { ok: true };
}

export async function assignPhoneNumber(id: string, clerkUserId: string | null): Promise<{ ok: boolean }> {
  await requirePermission("telephony:manage");
  const { db } = getTenantDb();
  await db.phoneNumber.update({ where: { id }, data: { assignedClerkUserId: clerkUserId || null } });
  await auditWrite({ action: "UPDATE", entityType: "COMPANY", entityId: id, diff: { assignedClerkUserId: clerkUserId } });
  return { ok: true };
}

export type RoutingRule = {
  id: string;
  phoneNumberId: string;
  kind: "VOICE" | "SMS";
  config: Record<string, unknown>;
};

export async function listRules(): Promise<RoutingRule[]> {
  const { db } = getTenantDb();
  const rows = await db.telephonyRule.findMany({ orderBy: { createdAt: "asc" } });
  return rows.map((r) => ({ id: r.id, phoneNumberId: r.phoneNumberId, kind: r.kind as "VOICE" | "SMS", config: (r.config ?? {}) as Record<string, unknown> }));
}

export async function upsertRule(input: { id?: string; phoneNumberId: string; kind: "VOICE" | "SMS"; config: Record<string, unknown> }): Promise<{ ok: boolean; id?: string }> {
  await requirePermission("telephony:manage");
  const { db } = getTenantDb();
  if (input.id) {
    await db.telephonyRule.update({ where: { id: input.id }, data: { kind: input.kind, config: input.config as never } });
    await auditWrite({ action: "UPDATE", entityType: "COMPANY", entityId: input.id, diff: input.config });
    return { ok: true, id: input.id };
  }
  const row = await db.telephonyRule.create({
    data: { phoneNumberId: input.phoneNumberId, kind: input.kind, config: input.config as never },
  });
  await auditWrite({ action: "CREATE", entityType: "COMPANY", entityId: row.id, diff: input.config });
  return { ok: true, id: row.id };
}

export async function deleteRule(id: string): Promise<{ ok: boolean }> {
  await requirePermission("telephony:manage");
  const { db } = getTenantDb();
  await db.telephonyRule.delete({ where: { id } }).catch(() => {});
  await auditWrite({ action: "DELETE", entityType: "COMPANY", entityId: id });
  return { ok: true };
}
