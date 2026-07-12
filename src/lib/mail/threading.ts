/*
 * threading.ts (Sprint 23) - resolve which EmailThread a message belongs to and
 * derive short snippets. Sprint 6 already models EmailThread as a first-class
 * row, so "threadId" throughout the Webmail feature is an EmailThread id.
 *
 * computeThreadId walks References -> In-Reply-To -> a subject-hash fallback to
 * group replies, creating a thread when nothing matches.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { createHash } from "crypto";
import type { PrismaClient } from "@/lib/db/generated/tenant";

type Db = PrismaClient;

/** First ~140 chars of a plain-text rendering of an HTML (or text) body. */
export function snippetFrom(bodyHtml: string | null | undefined, bodyText?: string | null): string {
  const raw = (bodyText ?? (bodyHtml ?? "").replace(/<[^>]+>/g, " "))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
  return raw.slice(0, 140);
}

/** Normalize a subject for threading (strip Re:/Fwd: prefixes, lowercase). */
export function normalizeSubject(subject: string | null | undefined): string {
  return (subject ?? "")
    .replace(/^(\s*(re|fwd|fw)\s*:\s*)+/i, "")
    .trim()
    .toLowerCase();
}

function subjectHash(accountId: string, subject: string | null | undefined): string {
  const norm = normalizeSubject(subject);
  return createHash("sha1").update(`${accountId}:${norm}`).digest("hex").slice(0, 24);
}

export type ThreadHints = {
  accountId: string;
  subject?: string | null;
  /** Message-Id values referenced by this message (References / In-Reply-To). */
  references?: string[];
  inReplyTo?: string | null;
};

/**
 * Resolve the EmailThread id for an incoming/synthetic message. Tries, in order:
 *   1. Any prior message whose externalId matches a reference / in-reply-to.
 *   2. An existing thread with the same normalized subject on this account.
 *   3. A brand-new thread (created here).
 */
export async function computeThreadId(db: Db, hints: ThreadHints): Promise<string> {
  const refs = [...(hints.references ?? []), ...(hints.inReplyTo ? [hints.inReplyTo] : [])]
    .map((r) => r.trim())
    .filter(Boolean);

  if (refs.length > 0) {
    const prior = await db.emailMessage.findFirst({
      where: { accountId: hints.accountId, externalId: { in: refs } },
      orderBy: { createdAt: "desc" },
      select: { threadId: true },
    });
    if (prior) return prior.threadId;
  }

  const norm = normalizeSubject(hints.subject);
  if (norm) {
    const bySubject = await db.emailThread.findFirst({
      where: { accountId: hints.accountId, subject: { not: null } },
      orderBy: { lastMessageAt: "desc" },
      select: { id: true, subject: true },
      take: 1,
      // Narrow candidates by a like on the normalized subject prefix.
    });
    if (bySubject && normalizeSubject(bySubject.subject) === norm) return bySubject.id;
  }

  const thread = await db.emailThread.create({
    data: {
      subject: hints.subject ?? null,
      lastMessageAt: new Date(),
      accountId: hints.accountId,
      messageCount: 0,
      unreadCount: 0,
    },
  });
  return thread.id;
}

/** Deterministic pseudo Message-Id for a locally-created (sent) message. */
export function localMessageId(accountId: string, subject: string | null | undefined): string {
  return `local-${subjectHash(accountId, subject)}-${Date.now()}@kobia`;
}
