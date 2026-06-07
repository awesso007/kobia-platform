/*
 * Chat cron logic (Sprint 16, server-only). Two daily sweeps, called per tenant
 * by the cron routes with an explicit (schema-bound) db:
 *
 *  - sendChatDigest: email each member who has unread @mentions from the prior
 *    day a short digest. Uses the tenant's first configured email account; skips
 *    the tenant entirely when none exists. Respects ChatNotificationPref NONE.
 *  - cleanupChatPresence: flip ONLINE/AWAY/DND presence to OFFLINE when the last
 *    heartbeat (lastSeenAt) is older than 24h.
 *
 * Both are best-effort and return counts for the cron envelope.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { Prisma, type PrismaClient } from "@/lib/db/generated/tenant";
import { sendEmail } from "@/lib/email/send";

type Db = PrismaClient;

const DAY_MS = 86_400_000;

/**
 * Email a digest of yesterday's unread @mentions to each mentioned member.
 * Returns the number of digest emails sent.
 */
export async function sendChatDigest(db: Db): Promise<number> {
  const account = await db.emailAccount.findFirst({ where: { status: "ACTIVE" } });
  if (!account) return 0;

  const since = new Date(Date.now() - DAY_MS);
  const messages = await db.chatMessage.findMany({
    where: { createdAt: { gte: since }, deletedAt: null, NOT: { mentionsJson: { equals: Prisma.AnyNull } } },
    include: { channel: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  if (messages.length === 0) return 0;

  // Group mentions by mentioned user id.
  const byUser = new Map<string, Array<{ author: string; channel: string; body: string }>>();
  for (const m of messages) {
    const ids = Array.isArray(m.mentionsJson) ? (m.mentionsJson as unknown[]).map(String) : [];
    for (const uid of ids) {
      const list = byUser.get(uid) ?? [];
      list.push({ author: m.authorName, channel: m.channel?.name ?? "chat", body: m.bodyText.slice(0, 140) });
      byUser.set(uid, list);
    }
  }
  if (byUser.size === 0) return 0;

  let sent = 0;
  for (const [userId, mentions] of byUser) {
    const member = await db.membership.findUnique({ where: { clerkUserId: userId } });
    if (!member?.email) continue;

    const rows = mentions
      .map((x) => `<li><strong>${x.author}</strong> in #${x.channel}: ${x.body}</li>`)
      .join("");
    const html = `<p>You have ${mentions.length} unread chat ${mentions.length === 1 ? "mention" : "mentions"} from the last day:</p><ul>${rows}</ul>`;
    const res = await sendEmail(
      { accountId: account.id, to: [member.email], subject: "Your chat mentions digest", html },
      db,
    );
    if (res.ok) sent++;
  }
  return sent;
}

/** Flip stale non-OFFLINE presence rows to OFFLINE. Returns the count updated. */
export async function cleanupChatPresence(db: Db): Promise<number> {
  const cutoff = new Date(Date.now() - DAY_MS);
  const res = await db.chatPresence.updateMany({
    where: { status: { not: "OFFLINE" }, lastSeenAt: { lt: cutoff } },
    data: { status: "OFFLINE" },
  });
  return res.count;
}
