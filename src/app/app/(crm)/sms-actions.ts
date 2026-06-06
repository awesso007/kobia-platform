"use server";

/*
 * SMS server actions for the Messages page and the RecordPane SMS tab (Sprint
 * 7). All tenant DB access goes through getTenantDb(). Sending is delegated to
 * src/lib/telephony/sms.ts (which records the message + bumps thread counters).
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { headers } from "next/headers";
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { requirePermission } from "@/lib/rbac/require-permission";
import { sendAndRecordSms } from "@/lib/telephony/sms";
import { ENTITY_TYPE_BY_RECORD, type RecordType } from "@/lib/crm/record";
import { fileDownloadUrl } from "@/lib/files/files";

export type SmsThreadRow = {
  id: string;
  ourNumberE164: string;
  peerE164: string;
  contactId: string | null;
  leadId: string | null;
  lastMessageAt: string | null;
  messageCount: number;
  unreadCount: number;
  peerName: string | null;
};

export type SmsMessageRow = {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  fromE164: string;
  toE164: string;
  body: string;
  mediaUrls: string[];
  status: string;
  errorCode: string | null;
  sentAt: string | null;
  createdAt: string;
};

export type OurNumberOption = { id: string; e164: string; friendlyName: string | null };

/** The active phone numbers we can send from (for the composer "From" select). */
export async function listOurNumbers(): Promise<OurNumberOption[]> {
  const { db } = getTenantDb();
  const rows = await db.phoneNumber.findMany({
    where: { status: "ACTIVE" },
    orderBy: { e164: "asc" },
    select: { id: true, e164: true, friendlyName: true },
  });
  return rows;
}

/** Resolve a friendly name for a peer number by matching a Contact/Lead phone. */
async function peerNameFor(
  db: ReturnType<typeof getTenantDb>["db"],
  link: { contactId: string | null; leadId: string | null },
): Promise<string | null> {
  if (link.contactId) {
    const c = await db.contact.findUnique({ where: { id: link.contactId } });
    if (c) return [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email || null;
  }
  if (link.leadId) {
    const l = await db.lead.findUnique({ where: { id: link.leadId } });
    if (l) return l.name ?? null;
  }
  return null;
}

/** All threads, latest first (the Messages page left pane). */
export async function listThreads(): Promise<SmsThreadRow[]> {
  const { db } = getTenantDb();
  const threads = await db.smsThread.findMany({
    orderBy: { lastMessageAt: "desc" },
    take: 200,
  });
  return Promise.all(
    threads.map(async (t) => ({
      id: t.id,
      ourNumberE164: t.ourNumberE164,
      peerE164: t.peerE164,
      contactId: t.contactId,
      leadId: t.leadId,
      lastMessageAt: t.lastMessageAt?.toISOString() ?? null,
      messageCount: t.messageCount,
      unreadCount: t.unreadCount,
      peerName: await peerNameFor(db, { contactId: t.contactId, leadId: t.leadId }),
    })),
  );
}

/** Threads linked to a CRM record (the RecordPane SMS tab). */
export async function listThreadsForRecord(type: RecordType, id: string): Promise<SmsThreadRow[]> {
  const { db } = getTenantDb();
  const entityType = ENTITY_TYPE_BY_RECORD[type];
  // SMS threads only link to contacts and leads.
  const where =
    entityType === "CONTACT" ? { contactId: id } : entityType === "LEAD" ? { leadId: id } : null;
  if (!where) return [];
  const threads = await db.smsThread.findMany({ where, orderBy: { lastMessageAt: "desc" }, take: 100 });
  return Promise.all(
    threads.map(async (t) => ({
      id: t.id,
      ourNumberE164: t.ourNumberE164,
      peerE164: t.peerE164,
      contactId: t.contactId,
      leadId: t.leadId,
      lastMessageAt: t.lastMessageAt?.toISOString() ?? null,
      messageCount: t.messageCount,
      unreadCount: t.unreadCount,
      peerName: await peerNameFor(db, { contactId: t.contactId, leadId: t.leadId }),
    })),
  );
}

/** Count unread SMS threads linked to a record (for the tab badge). */
export async function countUnreadForRecord(type: RecordType, id: string): Promise<number> {
  const { db } = getTenantDb();
  const entityType = ENTITY_TYPE_BY_RECORD[type];
  const where =
    entityType === "CONTACT"
      ? { contactId: id, unreadCount: { gt: 0 } }
      : entityType === "LEAD"
        ? { leadId: id, unreadCount: { gt: 0 } }
        : null;
  if (!where) return 0;
  const rows = await db.smsThread.findMany({ where, select: { id: true }, take: 1 });
  return rows.length;
}

/** Load a thread's messages in order and mark the thread read. */
export async function openThread(threadId: string): Promise<SmsMessageRow[]> {
  const { db } = getTenantDb();
  const messages = await db.smsMessage.findMany({ where: { threadId }, orderBy: { createdAt: "asc" } });
  await db.smsThread.update({ where: { id: threadId }, data: { unreadCount: 0 } }).catch(() => {});
  return messages.map((m) => ({
    id: m.id,
    direction: m.direction as "INBOUND" | "OUTBOUND",
    fromE164: m.fromE164,
    toE164: m.toE164,
    body: m.body,
    mediaUrls: (m.mediaUrls as string[] | null) ?? [],
    status: m.status,
    errorCode: m.errorCode,
    sentAt: m.sentAt?.toISOString() ?? null,
    createdAt: m.createdAt.toISOString(),
  }));
}

export type SendInput = {
  fromE164: string;
  toE164: string;
  body: string;
  contactId?: string | null;
  leadId?: string | null;
  /** File ids to send as MMS media (resolved to fetchable URLs for Twilio). */
  mediaFileIds?: string[];
};

/** Absolute base URL for media links Twilio must fetch (LOCAL provider needs it). */
function appOrigin(): string {
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : (process.env.NEXT_PUBLIC_APP_URL ?? "");
}

export async function sendSms(input: SendInput): Promise<{ ok: boolean; threadId?: string; messageId?: string; error?: string }> {
  await requirePermission("telephony:manage");
  const { db } = getTenantDb();

  let mediaUrls: string[] | undefined;
  if (input.mediaFileIds?.length) {
    const files = await db.file.findMany({ where: { id: { in: input.mediaFileIds }, status: "READY" } });
    const origin = appOrigin();
    // Twilio fetches media itself, so the link must outlive the send (> 1h).
    mediaUrls = await Promise.all(
      files.map(async (f) => {
        const url = await fileDownloadUrl(f, { inline: true, expiresIn: 60 * 60 * 6 });
        return url.startsWith("http") ? url : `${origin}${url}`;
      }),
    );
  }

  return sendAndRecordSms({
    fromE164: input.fromE164,
    toE164: input.toE164,
    body: input.body,
    contactId: input.contactId,
    leadId: input.leadId,
    ...(mediaUrls?.length ? { mediaUrls } : {}),
  });
}
