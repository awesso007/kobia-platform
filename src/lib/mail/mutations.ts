/*
 * mutations.ts (Sprint 23) - write helpers for the Webmail UI. Flags, labels,
 * drafts, sending (reuses the Sprint 6 SMTP send path), and CRUD for labels /
 * filters / signatures. Starring and labeling fire EMAIL_STARRED / EMAIL_LABELED
 * automations against the thread's linked CRM record when one exists (mirrors
 * the EMAIL_SENT precedent in src/lib/email/send.ts).
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import type { PrismaClient, EmailFolder } from "@/lib/db/generated/tenant";
import { sendEmail } from "@/lib/email/send";
import { dispatchAutomation } from "@/lib/automations/dispatch";
import type { AutomationEntityKind, AutomationTriggerKind } from "@/lib/automations/types";
import { applyFilterToMessage, type FilterAction, type FilterCondition } from "./filters";

type Db = PrismaClient;

/** Fire a mail automation against the message thread's linked CRM record. */
async function dispatchMailEvent(
  db: Db,
  messageId: string,
  type: AutomationTriggerKind,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    const message = await db.emailMessage.findUnique({
      where: { id: messageId },
      select: { thread: { select: { recordType: true, recordId: true } } },
    });
    const recordType = message?.thread?.recordType ?? null;
    const recordId = message?.thread?.recordId ?? null;
    if (!recordType || !recordId) return;
    await dispatchAutomation(
      { type, entityType: recordType as AutomationEntityKind, entityId: recordId, payload: { messageId, ...payload } },
      db,
    );
  } catch (err) {
    console.error("[mail/mutations] dispatch failed", err);
  }
}

export type MessageFlags = { folder?: EmailFolder; isRead?: boolean; isStarred?: boolean };

/** Update flags on one or more messages (scoped to the account). */
export async function updateMessageFlags(db: Db, accountId: string, ids: string[], flags: MessageFlags) {
  const clean = ids.filter(Boolean);
  if (clean.length === 0) return { count: 0 };

  const data: Record<string, unknown> = {};
  if (flags.folder) data.folder = flags.folder;
  if (typeof flags.isRead === "boolean") {
    data.isRead = flags.isRead;
    data.readAt = flags.isRead ? new Date() : null;
  }
  if (typeof flags.isStarred === "boolean") data.isStarred = flags.isStarred;

  const res = await db.emailMessage.updateMany({ where: { id: { in: clean }, accountId }, data });

  if (flags.isStarred === true) {
    for (const id of clean) await dispatchMailEvent(db, id, "EMAIL_STARRED", {});
  }
  return { count: res.count };
}

export async function applyLabel(db: Db, accountId: string, messageId: string, labelId: string) {
  const [message, label] = await Promise.all([
    db.emailMessage.findFirst({ where: { id: messageId, accountId }, select: { id: true } }),
    db.emailLabel.findFirst({ where: { id: labelId, accountId }, select: { id: true, name: true } }),
  ]);
  if (!message || !label) return { ok: false as const, error: "Message or label not found." };

  await db.emailMessageLabel.upsert({
    where: { messageId_labelId: { messageId, labelId } },
    create: { messageId, labelId },
    update: {},
  });
  await dispatchMailEvent(db, messageId, "EMAIL_LABELED", { labelId, labelName: label.name });
  return { ok: true as const };
}

export async function removeLabel(db: Db, accountId: string, messageId: string, labelId: string) {
  const message = await db.emailMessage.findFirst({ where: { id: messageId, accountId }, select: { id: true } });
  if (!message) return { ok: false as const, error: "Message not found." };
  await db.emailMessageLabel.deleteMany({ where: { messageId, labelId } });
  return { ok: true as const };
}

export type SaveDraftInput = {
  id?: string | null;
  threadId?: string | null;
  to?: string | null;
  cc?: string | null;
  bcc?: string | null;
  subject?: string | null;
  body?: string | null;
  attachments?: unknown;
  inReplyTo?: string | null;
};

/** Upsert a draft. Returns the draft id. */
export async function saveDraft(db: Db, accountId: string, input: SaveDraftInput) {
  const data = {
    threadId: input.threadId ?? null,
    to: input.to ?? null,
    cc: input.cc ?? null,
    bcc: input.bcc ?? null,
    subject: input.subject ?? null,
    body: input.body ?? null,
    attachments: (input.attachments ?? null) as never,
    inReplyTo: input.inReplyTo ?? null,
  };
  if (input.id) {
    const existing = await db.emailDraft.findFirst({ where: { id: input.id, accountId }, select: { id: true } });
    if (existing) {
      const updated = await db.emailDraft.update({ where: { id: input.id }, data });
      return updated.id;
    }
  }
  const created = await db.emailDraft.create({ data: { accountId, ...data } });
  return created.id;
}

export async function deleteDraft(db: Db, accountId: string, id: string) {
  await db.emailDraft.deleteMany({ where: { id, accountId } });
}

export type SendMailInput = {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  inReplyTo?: string | null;
  draftId?: string | null;
};

/**
 * Send via the Sprint 6 SMTP path, then file the resulting message in SENT and
 * clean up the draft. inReplyTo may be an EmailThread id (reply from a thread)
 * or a message id; both resolve to the parent thread.
 */
export async function sendMail(db: Db, accountId: string, input: SendMailInput) {
  let replyToThreadId: string | undefined;
  if (input.inReplyTo) {
    const asThread = await db.emailThread.findFirst({ where: { id: input.inReplyTo, accountId }, select: { id: true } });
    if (asThread) {
      replyToThreadId = asThread.id;
    } else {
      const asMessage = await db.emailMessage.findFirst({
        where: { id: input.inReplyTo, accountId },
        select: { threadId: true },
      });
      if (asMessage) replyToThreadId = asMessage.threadId;
    }
  }

  const result = await sendEmail(
    {
      accountId,
      to: input.to,
      cc: input.cc,
      bcc: input.bcc,
      subject: input.subject,
      html: input.body,
      replyToThreadId,
    },
    db,
  );

  if (result.ok && result.messageId) {
    await db.emailMessage.update({
      where: { id: result.messageId },
      data: { folder: "SENT", isRead: true },
    });
    if (input.draftId) await deleteDraft(db, accountId, input.draftId);
  }
  return result;
}

export async function createLabel(db: Db, accountId: string, name: string, color?: string) {
  return db.emailLabel.create({ data: { accountId, name, color: color || "#2563eb" } });
}

export async function updateLabel(db: Db, accountId: string, id: string, patch: { name?: string; color?: string }) {
  const existing = await db.emailLabel.findFirst({ where: { id, accountId }, select: { id: true } });
  if (!existing) return null;
  return db.emailLabel.update({ where: { id }, data: { name: patch.name, color: patch.color } });
}

export async function deleteLabel(db: Db, accountId: string, id: string) {
  await db.emailLabel.deleteMany({ where: { id, accountId } });
}

export async function createFilter(
  db: Db,
  accountId: string,
  input: { name: string; condition: FilterCondition; action: FilterAction; enabled?: boolean },
) {
  return db.emailFilter.create({
    data: {
      accountId,
      name: input.name,
      condition: input.condition as never,
      action: input.action as never,
      enabled: input.enabled ?? true,
    },
  });
}

export async function updateFilter(
  db: Db,
  accountId: string,
  id: string,
  patch: { name?: string; condition?: FilterCondition; action?: FilterAction; enabled?: boolean },
) {
  const existing = await db.emailFilter.findFirst({ where: { id, accountId }, select: { id: true } });
  if (!existing) return null;
  return db.emailFilter.update({
    where: { id },
    data: {
      name: patch.name,
      condition: patch.condition as never,
      action: patch.action as never,
      enabled: patch.enabled,
    },
  });
}

export async function deleteFilter(db: Db, accountId: string, id: string) {
  await db.emailFilter.deleteMany({ where: { id, accountId } });
}

/** Apply one filter retroactively to the account's INBOX. */
export async function runFilter(db: Db, accountId: string, filterId: string) {
  const filter = await db.emailFilter.findFirst({ where: { id: filterId, accountId } });
  if (!filter) return { matched: 0, updated: 0 };

  const messages = await db.emailMessage.findMany({
    where: { accountId, folder: "INBOX" },
    select: { id: true, fromAddress: true, subject: true, bodyText: true, bodyHtml: true },
  });

  let matched = 0;
  let updated = 0;
  for (const msg of messages) {
    const actions = applyFilterToMessage(
      { enabled: filter.enabled, condition: filter.condition as never, action: filter.action as never },
      msg,
    );
    if (actions.length === 0) continue;
    matched++;
    for (const action of actions) {
      if (action.kind === "APPLY_LABEL") await applyLabel(db, accountId, msg.id, action.labelId);
      else if (action.kind === "MOVE") await updateMessageFlags(db, accountId, [msg.id], { folder: action.folder });
      else if (action.kind === "MARK_READ") await updateMessageFlags(db, accountId, [msg.id], { isRead: true });
      else if (action.kind === "STAR") await updateMessageFlags(db, accountId, [msg.id], { isStarred: true });
    }
    updated++;
  }
  return { matched, updated };
}

export async function createSignature(
  db: Db,
  accountId: string,
  ownerClerkUserId: string,
  input: { name: string; html: string; isDefault?: boolean },
) {
  if (input.isDefault) {
    await db.emailSignature.updateMany({ where: { accountId }, data: { isDefault: false } });
  }
  return db.emailSignature.create({
    data: { accountId, ownerClerkUserId, name: input.name, html: input.html, isDefault: input.isDefault ?? false },
  });
}

export async function updateSignature(
  db: Db,
  accountId: string,
  id: string,
  patch: { name?: string; html?: string; isDefault?: boolean },
) {
  const existing = await db.emailSignature.findFirst({ where: { id, accountId }, select: { id: true } });
  if (!existing) return null;
  if (patch.isDefault) {
    await db.emailSignature.updateMany({ where: { accountId }, data: { isDefault: false } });
  }
  return db.emailSignature.update({
    where: { id },
    data: { name: patch.name, html: patch.html, isDefault: patch.isDefault },
  });
}

export async function deleteSignature(db: Db, accountId: string, id: string) {
  await db.emailSignature.deleteMany({ where: { id, accountId } });
}
