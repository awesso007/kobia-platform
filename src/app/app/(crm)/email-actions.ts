"use server";

/*
 * Email server actions for the composer and the RecordPane Email tab (Sprint
 * 6). All tenant DB access goes through getTenantDb(). Sending is delegated to
 * src/lib/email/send.ts (which records the message + fires automations).
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { requirePermission } from "@/lib/rbac/require-permission";
import { sendEmail } from "@/lib/email/send";
import { ENTITY_TYPE_BY_RECORD, type RecordType } from "@/lib/crm/record";
import type { EmailRecordType } from "@/lib/email/link";

export type ComposerData = {
  accounts: { id: string; address: string; displayName: string | null }[];
  templates: { id: string; name: string; subject: string; bodyHtml: string }[];
  signatures: { id: string; html: string; isDefault: boolean }[];
};

/** Load the dropdown data the composer needs (active accounts + templates + sigs). */
export async function getComposerData(): Promise<ComposerData> {
  const { db } = getTenantDb();
  const [accounts, templates, signatures] = await Promise.all([
    db.emailAccount.findMany({ where: { status: { not: "PAUSED" } }, orderBy: { address: "asc" }, select: { id: true, address: true, displayName: true } }),
    db.emailTemplate.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, subject: true, bodyHtml: true } }),
    db.emailSignature.findMany({ orderBy: { isDefault: "desc" }, select: { id: true, html: true, isDefault: true } }),
  ]);
  return { accounts, templates, signatures };
}

export type ContactSuggestion = { id: string; name: string; email: string };

/** Typeahead over Contacts with an email, by name or email substring. */
export async function searchContacts(query: string): Promise<ContactSuggestion[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const { db } = getTenantDb();
  const rows = await db.contact.findMany({
    where: {
      email: { not: null },
      OR: [
        { firstName: { contains: q, mode: "insensitive" } },
        { lastName: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
      ],
    },
    take: 8,
    orderBy: { lastName: "asc" },
  });
  return rows
    .filter((r) => r.email)
    .map((r) => ({ id: r.id, name: [r.firstName, r.lastName].filter(Boolean).join(" "), email: r.email! }));
}

export type ComposeInput = {
  accountId: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html: string;
  replyToThreadId?: string;
  recordType?: RecordType;
  recordId?: string;
  /** File ids (already uploaded via the File system) to attach to this message. */
  attachmentFileIds?: string[];
};

export async function sendComposed(input: ComposeInput): Promise<{ ok: boolean; threadId?: string; messageId?: string; error?: string }> {
  await requirePermission("email:manage");
  const { db } = getTenantDb();
  const recordType = input.recordType ? (ENTITY_TYPE_BY_RECORD[input.recordType] as EmailRecordType) : undefined;
  const res = await sendEmail({
    accountId: input.accountId,
    to: input.to,
    cc: input.cc,
    bcc: input.bcc,
    subject: input.subject,
    html: input.html,
    replyToThreadId: input.replyToThreadId,
    recordType,
    recordId: input.recordId,
  });

  // Link any chosen Files to the sent message as EmailAttachment rows.
  if (res.ok && res.messageId && input.attachmentFileIds?.length) {
    const files = await db.file.findMany({ where: { id: { in: input.attachmentFileIds } } });
    for (const f of files) {
      await db.emailAttachment.create({
        data: {
          messageId: res.messageId,
          filename: f.name,
          mimeType: f.mimeType,
          size: Number(f.size),
          storageKey: f.storageKey,
          fileId: f.id,
        },
      });
    }
  }

  return res;
}

export type EmailThreadRow = {
  id: string;
  subject: string | null;
  lastMessageAt: string | null;
  messageCount: number;
  unreadCount: number;
};

export type EmailMessageRow = {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  fromAddress: string;
  toAddresses: string[];
  subject: string | null;
  bodyHtml: string | null;
  bodyText: string | null;
  snippet: string | null;
  sentAt: string | null;
  receivedAt: string | null;
  status: string;
};

/** Count unread email threads linked to a record (for the tab badge). */
export async function countUnreadForRecord(type: RecordType, id: string): Promise<number> {
  const { db } = getTenantDb();
  const recordType = ENTITY_TYPE_BY_RECORD[type];
  const rows = await db.emailThread.findMany({
    where: { recordType: recordType as never, recordId: id, unreadCount: { gt: 0 } },
    select: { id: true },
    take: 1,
  });
  return rows.length;
}

/** List threads linked to a CRM record, latest first. */
export async function listThreadsForRecord(type: RecordType, id: string): Promise<EmailThreadRow[]> {
  const { db } = getTenantDb();
  const recordType = ENTITY_TYPE_BY_RECORD[type];
  const threads = await db.emailThread.findMany({
    where: { recordType: recordType as never, recordId: id },
    orderBy: { lastMessageAt: "desc" },
    take: 100,
  });
  return threads.map((t) => ({
    id: t.id,
    subject: t.subject,
    lastMessageAt: t.lastMessageAt?.toISOString() ?? null,
    messageCount: t.messageCount,
    unreadCount: t.unreadCount,
  }));
}

/** Load a thread's messages in order and mark the thread read. */
export async function openThread(threadId: string): Promise<EmailMessageRow[]> {
  const { db } = getTenantDb();
  const messages = await db.emailMessage.findMany({
    where: { threadId },
    orderBy: { createdAt: "asc" },
  });
  await db.emailThread.update({ where: { id: threadId }, data: { unreadCount: 0 } }).catch(() => {});
  return messages.map((m) => ({
    id: m.id,
    direction: m.direction as "INBOUND" | "OUTBOUND",
    fromAddress: m.fromAddress,
    toAddresses: (m.toAddresses as string[] | null) ?? [],
    subject: m.subject,
    bodyHtml: m.bodyHtml,
    bodyText: m.bodyText,
    snippet: m.snippet,
    sentAt: m.sentAt?.toISOString() ?? null,
    receivedAt: m.receivedAt?.toISOString() ?? null,
    status: m.status,
  }));
}
