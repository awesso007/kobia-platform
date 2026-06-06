"use server";

/*
 * Click-to-call server actions (Sprint 7). startCall() places an outbound call
 * from the current user's assigned PhoneNumber (or an explicit fromPhoneNumberId)
 * to a target E.164, recording a Call row up front. The Twilio leg dials the
 * user's call-forwarding number (or assigned number) and bridges to the target
 * via the voice webhook. Voice status/recording webhooks finish the Call row and
 * write the CRM activity.
 *
 * Gated by requirePermission("telephony:manage"). Works in "not configured" mode
 * by returning a friendly error instead of throwing.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { requirePermission, getCurrentMembership } from "@/lib/rbac/require-permission";
import { auditWrite } from "@/lib/crm/audit";
import { resolveLinkForPhone } from "@/lib/telephony/link";
import { isConfigured, createOutboundCall } from "@/lib/telephony/twilio";

export type StartCallInput = {
  toE164: string;
  fromPhoneNumberId?: string;
  contactId?: string;
  leadId?: string;
  dealId?: string;
  companyId?: string;
};

export type StartCallResult = { ok: boolean; callId?: string; error?: string };

/** Pick the outbound number: explicit -> caller's assigned -> any active. */
async function pickFromNumber(
  db: ReturnType<typeof getTenantDb>["db"],
  fromPhoneNumberId: string | undefined,
  clerkUserId: string | null,
) {
  if (fromPhoneNumberId) {
    return db.phoneNumber.findUnique({ where: { id: fromPhoneNumberId } });
  }
  if (clerkUserId) {
    const assigned = await db.phoneNumber.findFirst({
      where: { assignedClerkUserId: clerkUserId, status: "ACTIVE" },
    });
    if (assigned) return assigned;
  }
  return db.phoneNumber.findFirst({ where: { status: "ACTIVE" }, orderBy: { createdAt: "asc" } });
}

export async function startCall(input: StartCallInput): Promise<StartCallResult> {
  await requirePermission("telephony:manage");
  const { db } = getTenantDb();

  const to = (input.toE164 ?? "").trim();
  if (!to) return { ok: false, error: "No number to call." };

  const member = await getCurrentMembership();
  const clerkUserId = member?.clerkUserId ?? null;

  const from = await pickFromNumber(db, input.fromPhoneNumberId, clerkUserId);
  if (!from) return { ok: false, error: "No active number to call from. Buy one in Telephony settings." };

  // Resolve CRM links if not supplied (so the Call row attaches to a record).
  const link =
    input.contactId || input.leadId || input.dealId || input.companyId
      ? { contactId: input.contactId ?? null, leadId: input.leadId ?? null, dealId: input.dealId ?? null, companyId: input.companyId ?? null }
      : await resolveLinkForPhone(db, to);

  const call = await db.call.create({
    data: {
      direction: "OUTBOUND",
      fromE164: from.e164,
      toE164: to,
      status: "QUEUED",
      ownerClerkUserId: clerkUserId,
      contactId: link.contactId,
      leadId: link.leadId,
      dealId: link.dealId,
      companyId: link.companyId,
    },
  });

  await auditWrite({ action: "CREATE", entityType: "COMPANY", entityId: call.id, diff: { toE164: to, direction: "OUTBOUND" } });

  if (!isConfigured()) {
    return { ok: true, callId: call.id, error: "Twilio not configured - call logged but not placed." };
  }

  try {
    const placed = await createOutboundCall({ from: from.e164, to, recordingEnabled: true });
    await db.call.update({
      where: { id: call.id },
      data: { providerCallSid: placed.sid, status: "RINGING", startedAt: new Date() },
    });
    return { ok: true, callId: call.id };
  } catch (err) {
    await db.call.update({ where: { id: call.id }, data: { status: "FAILED" } });
    return { ok: false, callId: call.id, error: String(err instanceof Error ? err.message : err) };
  }
}
