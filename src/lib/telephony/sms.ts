/*
 * sms.ts (Sprint 7) - the CRM SMS send + record path.
 *
 * sendAndRecordSms({ fromE164, toE164, body, mediaUrls?, contactId?, leadId? })
 * sends a text via Twilio and records the outbound message: it upserts the
 * SmsThread for (ourNumber, peer), inserts an SmsMessage, bumps thread counters,
 * and returns the thread + message ids. Twilio failures are recorded as a
 * FAILED message (the thread/message rows still exist for history).
 *
 * Callers inside a tenant request can omit `db`; automation dispatch / webhooks
 * pass an explicit schema-bound client.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { getTenantDb } from "@/lib/db/get-tenant-db";
import type { PrismaClient } from "@/lib/db/generated/tenant";
import { sendSms as twilioSendSms, isConfigured } from "./twilio";

type Db = PrismaClient;

export type SendSmsInput = {
  fromE164: string;
  toE164: string;
  body: string;
  mediaUrls?: string[];
  contactId?: string | null;
  leadId?: string | null;
};

export type SendSmsResult = {
  ok: boolean;
  threadId?: string;
  messageId?: string;
  error?: string;
};

/** Find or create the SmsThread for a (ourNumber, peer) pair. */
export async function upsertSmsThread(
  db: Db,
  ourNumberE164: string,
  peerE164: string,
  link?: { contactId?: string | null; leadId?: string | null },
): Promise<string> {
  const existing = await db.smsThread.findUnique({
    where: { ourNumberE164_peerE164: { ourNumberE164, peerE164 } },
  });
  if (existing) {
    // Backfill a link if the thread had none and we now have one.
    if ((!existing.contactId && link?.contactId) || (!existing.leadId && link?.leadId)) {
      await db.smsThread.update({
        where: { id: existing.id },
        data: {
          contactId: existing.contactId ?? link?.contactId ?? null,
          leadId: existing.leadId ?? link?.leadId ?? null,
        },
      });
    }
    return existing.id;
  }
  const thread = await db.smsThread.create({
    data: {
      ourNumberE164,
      peerE164,
      contactId: link?.contactId ?? null,
      leadId: link?.leadId ?? null,
      lastMessageAt: new Date(),
      messageCount: 0,
      unreadCount: 0,
    },
  });
  return thread.id;
}

export async function sendAndRecordSms(input: SendSmsInput, injectedDb?: Db): Promise<SendSmsResult> {
  const db = injectedDb ?? getTenantDb().db;
  const from = input.fromE164.trim();
  const to = input.toE164.trim();
  if (!from) return { ok: false, error: "A sending number is required." };
  if (!to) return { ok: false, error: "A recipient number is required." };
  if (!input.body.trim() && (!input.mediaUrls || input.mediaUrls.length === 0)) {
    return { ok: false, error: "Message body is required." };
  }

  let sid: string | null = null;
  let sendError: string | null = null;
  if (isConfigured()) {
    try {
      const res = await twilioSendSms({ from, to, body: input.body, mediaUrls: input.mediaUrls });
      sid = res.sid;
    } catch (err) {
      sendError = String(err instanceof Error ? err.message : err);
    }
  } else {
    sendError = "Twilio not configured.";
  }

  const threadId = await upsertSmsThread(db, from, to, { contactId: input.contactId, leadId: input.leadId });

  const message = await db.smsMessage.create({
    data: {
      threadId,
      direction: "OUTBOUND",
      fromE164: from,
      toE164: to,
      body: input.body,
      mediaUrls: (input.mediaUrls ?? []) as never,
      providerMessageSid: sid,
      status: (sendError ? "FAILED" : "SENT") as never,
      errorCode: sendError,
      sentAt: sendError ? null : new Date(),
    },
  });

  await db.smsThread.update({
    where: { id: threadId },
    data: { lastMessageAt: new Date(), messageCount: { increment: 1 } },
  });

  if (sendError) return { ok: false, error: sendError, threadId, messageId: message.id };
  return { ok: true, threadId, messageId: message.id };
}
