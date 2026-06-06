/*
 * imap-sync.ts (Sprint 6) - pull new inbound mail for an SMTP_IMAP account.
 *
 * syncAccount(db, account) connects via imapflow, fetches messages in INBOX
 * newer than the account's lastSyncedAt (or the last 30 days on first sync),
 * and appends any not already stored (matched on externalId / messageId) as
 * INBOUND EmailMessage rows. Threads are resolved by references where possible,
 * else a new thread is created and auto-linked to a CRM record.
 *
 * OAuth accounts are skipped (no token plumbing yet). All failures are caught
 * by the caller (the cron route wraps each account in try/catch).
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { ImapFlow } from "imapflow";
import type { PrismaClient } from "@/lib/db/generated/tenant";
import { decrypt } from "@/lib/crypto/secrets";
import { resolveLinkForAddress } from "./link";
import { reindex } from "@/lib/search";

type Db = PrismaClient;
type Account = Awaited<ReturnType<Db["emailAccount"]["findFirst"]>>;

function snippetOf(html: string, text?: string): string {
  const raw = (text ?? html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  return raw.slice(0, 160);
}

export type SyncResult = { accountId: string; address: string; fetched: number; error?: string };

export async function syncAccount(db: Db, account: NonNullable<Account>): Promise<SyncResult> {
  if (account.provider !== "SMTP_IMAP") {
    return { accountId: account.id, address: account.address, fetched: 0, error: "skipped (oauth)" };
  }
  if (!account.imapHost || !account.imapPort) {
    return { accountId: account.id, address: account.address, fetched: 0, error: "no imap host/port" };
  }

  const since = account.lastSyncedAt ?? new Date(Date.now() - 30 * 86_400_000);
  const client = new ImapFlow({
    host: account.imapHost,
    port: account.imapPort,
    secure: account.imapPort === 993,
    auth: {
      user: account.imapUser ?? account.address,
      pass: decrypt(account.imapPassEncrypted ?? ""),
    },
    logger: false,
  });

  let fetched = 0;
  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      for await (const msg of client.fetch({ since }, { envelope: true, source: true, uid: true })) {
        const env = msg.envelope;
        const messageId = env?.messageId ?? `imap-${account.id}-${msg.uid}`;

        const dupe = await db.emailMessage.findFirst({ where: { externalId: messageId } });
        if (dupe) continue;

        const from = env?.from?.[0]?.address ?? "";
        const to = (env?.to ?? []).map((a) => a.address ?? "").filter(Boolean);
        const subject = env?.subject ?? null;
        const raw = msg.source?.toString("utf8") ?? "";
        const refIds = (env?.inReplyTo ? [env.inReplyTo] : []).filter(Boolean);

        let threadId: string | null = null;
        if (refIds.length > 0) {
          const prior = await db.emailMessage.findFirst({
            where: { externalId: { in: refIds } },
            orderBy: { createdAt: "desc" },
          });
          if (prior) threadId = prior.threadId;
        }
        if (!threadId) {
          const link = from ? await resolveLinkForAddress(db, from) : null;
          const thread = await db.emailThread.create({
            data: {
              subject,
              lastMessageAt: env?.date ?? new Date(),
              participantsJson: { from, to } as never,
              recordType: (link?.recordType ?? null) as never,
              recordId: link?.recordId ?? null,
              accountId: account.id,
              messageCount: 0,
              unreadCount: 0,
            },
          });
          threadId = thread.id;
        }

        const created = await db.emailMessage.create({
          data: {
            threadId,
            accountId: account.id,
            externalId: messageId,
            direction: "INBOUND",
            fromAddress: from,
            toAddresses: to as never,
            subject,
            bodyText: raw.slice(0, 100_000),
            snippet: snippetOf("", raw),
            receivedAt: env?.date ?? new Date(),
            status: "DELIVERED" as never,
          },
        });
        await db.emailThread.update({
          where: { id: threadId },
          data: { lastMessageAt: env?.date ?? new Date(), messageCount: { increment: 1 }, unreadCount: { increment: 1 } },
        });
        await reindex(db, "EMAIL_MESSAGE", created.id);
        fetched++;
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }

  await db.emailAccount.update({ where: { id: account.id }, data: { lastSyncedAt: new Date() } });
  return { accountId: account.id, address: account.address, fetched };
}
