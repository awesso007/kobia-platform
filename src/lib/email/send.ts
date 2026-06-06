/*
 * send.ts (Sprint 6) - the CRM email send path.
 *
 * sendEmail({ accountId, to, cc, bcc, subject, html, text, replyToThreadId? })
 * sends through a configured EmailAccount and records the outbound message:
 *   - SMTP_IMAP accounts send via nodemailer.
 *   - GMAIL_OAUTH / OUTLOOK_OAUTH are stubbed: the plumbing accepts them so the
 *     UI works, but they return a "not configured" error for now.
 * On success it inserts an EmailMessage (status SENT), attaches it to an
 * existing thread (replyToThreadId) or a new one, notifies any tenant member
 * recipients, and fires an EMAIL_SENT automation event.
 *
 * Callers inside a tenant request can omit `db` (resolved from headers). Callers
 * without a request scope (automation dispatch / cron) must pass an explicit
 * schema-bound client.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import nodemailer from "nodemailer";
import { getTenantDb } from "@/lib/db/get-tenant-db";
import type { PrismaClient } from "@/lib/db/generated/tenant";
import { decrypt } from "@/lib/crypto/secrets";
import { notifyOn } from "@/lib/notifications/notify";
import { dispatchAutomation } from "@/lib/automations/dispatch";
import { reindex } from "@/lib/search";
import type { EmailRecordType } from "./link";

type Db = PrismaClient;

export type SendEmailInput = {
  accountId: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html: string;
  text?: string;
  replyToThreadId?: string;
  /** Optional CRM record to link a brand-new thread to. */
  recordType?: EmailRecordType;
  recordId?: string;
};

export type SendEmailResult = {
  ok: boolean;
  messageId?: string;
  threadId?: string;
  error?: string;
};

function snippetOf(html: string, text?: string): string {
  const raw = (text ?? html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  return raw.slice(0, 160);
}

export async function sendEmail(input: SendEmailInput, injectedDb?: Db): Promise<SendEmailResult> {
  const db = injectedDb ?? getTenantDb().db;

  const account = await db.emailAccount.findUnique({ where: { id: input.accountId } });
  if (!account) return { ok: false, error: "Email account not found." };
  if (account.status === "PAUSED") return { ok: false, error: "This email account is paused." };

  const to = input.to.filter(Boolean);
  if (to.length === 0) return { ok: false, error: "At least one recipient is required." };

  // OAuth providers are not wired yet - accept the type but do not send.
  if (account.provider === "GMAIL_OAUTH" || account.provider === "OUTLOOK_OAUTH") {
    console.warn("[email/send] OAuth send not yet implemented for provider", account.provider);
    return { ok: false, error: "OAuth sending is not configured yet. Use an SMTP/IMAP account for now." };
  }

  // SMTP send via nodemailer.
  if (!account.smtpHost || !account.smtpPort) {
    return { ok: false, error: "This account has no SMTP host/port configured." };
  }
  const transport = nodemailer.createTransport({
    host: account.smtpHost,
    port: account.smtpPort,
    secure: account.smtpPort === 465,
    auth: account.smtpUser
      ? { user: account.smtpUser, pass: decrypt(account.smtpPassEncrypted ?? "") }
      : undefined,
  });

  let sendError: string | null = null;
  try {
    await transport.sendMail({
      from: account.displayName ? `${account.displayName} <${account.address}>` : account.address,
      to,
      cc: input.cc?.filter(Boolean),
      bcc: input.bcc?.filter(Boolean),
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
  } catch (err) {
    sendError = String(err instanceof Error ? err.message : err);
  }

  // Resolve / create the thread.
  let threadId = input.replyToThreadId ?? null;
  if (threadId) {
    const exists = await db.emailThread.findUnique({ where: { id: threadId } });
    if (!exists) threadId = null;
  }
  if (!threadId) {
    const thread = await db.emailThread.create({
      data: {
        subject: input.subject,
        lastMessageAt: new Date(),
        participantsJson: { to, cc: input.cc ?? [], from: account.address } as never,
        recordType: (input.recordType ?? null) as never,
        recordId: input.recordId ?? null,
        accountId: account.id,
        messageCount: 0,
        unreadCount: 0,
      },
    });
    threadId = thread.id;
  }

  const status = sendError ? "FAILED" : "SENT";
  const message = await db.emailMessage.create({
    data: {
      threadId,
      accountId: account.id,
      direction: "OUTBOUND",
      fromAddress: account.address,
      toAddresses: to as never,
      ccAddresses: (input.cc ?? []) as never,
      bccAddresses: (input.bcc ?? []) as never,
      subject: input.subject,
      bodyHtml: input.html,
      bodyText: input.text ?? null,
      snippet: snippetOf(input.html, input.text),
      sentAt: sendError ? null : new Date(),
      readAt: new Date(),
      status: status as never,
      errorMessage: sendError,
    },
  });

  await db.emailThread.update({
    where: { id: threadId },
    data: { lastMessageAt: new Date(), messageCount: { increment: 1 } },
  });

  await reindex(db, "EMAIL_MESSAGE", message.id);

  if (sendError) return { ok: false, error: sendError, messageId: message.id, threadId };

  // Notify any recipients who are members of this tenant.
  try {
    const members = await db.membership.findMany({ where: { email: { in: to } } });
    for (const m of members) {
      await notifyOn(db, m.clerkUserId, {
        type: "SYSTEM",
        title: `New email: ${input.subject || "(no subject)"}`,
        body: snippetOf(input.html, input.text),
        linkUrl: "/app/settings/email",
      });
    }
  } catch (err) {
    console.error("[email/send] member notify failed", err);
  }

  // Fire automation event (best-effort; never blocks send).
  if (input.recordType && input.recordId) {
    await dispatchAutomation(
      {
        type: "EMAIL_SENT",
        entityType: input.recordType,
        entityId: input.recordId,
        payload: { messageId: message.id, threadId, subject: input.subject },
      },
      db,
    );
  }

  return { ok: true, messageId: message.id, threadId };
}
