/*
 * seed-webmail-acme.ts - populate a tenant schema with Sprint 23 Webmail
 * starter data. Idempotent: the mailbox is found by (owner, address); every
 * message is keyed by a stable externalId so re-running never duplicates.
 *
 * Seeds:
 *   - 1 EmailAccount for the seed admin (a PAUSED stub is created only if the
 *     admin has no account yet, mirroring "connect a mailbox later").
 *   - 8 sample items: 5 INBOX messages (two grouped into one thread), 2 SENT,
 *     1 DRAFT (EmailDraft). Plus 1 SPAM message so the spam folder is non-empty.
 *     2 are unread, 1 is starred.
 *   - 3 labels (Clients blue, Vendors orange, Urgent red); the billing thread is
 *     tagged Vendors so the label view is populated.
 *   - 1 filter (from contains "billing" -> apply label Vendors).
 *   - 1 default signature.
 *
 * Usage:
 *   tsx scripts/seed-webmail-acme.ts --slug acme
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { PrismaClient, type EmailFolder, type EmailDirection } from "../src/lib/db/generated/tenant";

function fail(msg: string): never {
  console.error(`\n[seed-webmail] ERROR: ${msg}\n`);
  process.exit(1);
}

function parseSlug(argv: string[]): string {
  let slug: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--slug") slug = argv[++i];
  }
  return slug ?? "acme";
}

function schemaNameForSlug(slug: string): string {
  return `tenant_${slug.replace(/-/g, "_")}`;
}

function connectionForSchema(schema: string): string {
  const base = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!base) fail("DIRECT_URL/DATABASE_URL not set");
  const url = new URL(base);
  url.searchParams.set("schema", schema);
  return url.toString();
}

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

async function main() {
  const slug = parseSlug(process.argv.slice(2));
  const schema = schemaNameForSlug(slug);
  const db = new PrismaClient({ datasources: { db: { url: connectionForSchema(schema) } } });

  try {
    console.log(`[seed-webmail] schema=${schema}`);

    const owner =
      (
        await db.membership.findFirst({
          where: { status: "ACTIVE" },
          orderBy: { createdAt: "asc" },
          select: { clerkUserId: true },
        })
      )?.clerkUserId ?? "system";
    console.log(`  owner=${owner}`);

    // 1) Ensure a mailbox. Prefer any existing account for the owner; otherwise
    //    fall back to the first account in the tenant; only create a stub if none.
    let account =
      (await db.emailAccount.findFirst({ where: { ownerClerkUserId: owner }, orderBy: { createdAt: "asc" } })) ??
      (await db.emailAccount.findFirst({ orderBy: { createdAt: "asc" } }));
    if (!account) {
      account = await db.emailAccount.create({
        data: {
          ownerClerkUserId: owner,
          address: "admin@acme.test",
          displayName: "Acme Mailbox",
          provider: "SMTP_IMAP",
          status: "PAUSED",
        },
      });
      console.log(`  created stub mailbox ${account.address} (PAUSED)`);
    } else {
      console.log(`  using mailbox ${account.address}`);
    }
    const acct = account;
    const me = acct.address;

    // 2) Labels (unique on accountId+name).
    async function ensureLabel(name: string, color: string) {
      return db.emailLabel.upsert({
        where: { accountId_name: { accountId: acct.id, name } },
        update: { color },
        create: { accountId: acct.id, name, color },
      });
    }
    const clients = await ensureLabel("Clients", "#2563eb");
    const vendors = await ensureLabel("Vendors", "#f59e0b");
    await ensureLabel("Urgent", "#dc2626");
    console.log("  labels ensured (Clients, Vendors, Urgent)");

    // 3) Threads + messages, keyed by externalId for idempotency.
    type Seed = {
      threadKey: string;
      threadSubject: string;
      externalId: string;
      direction: EmailDirection;
      folder: EmailFolder;
      from: string;
      to: string[];
      subject: string;
      bodyText: string;
      isRead: boolean;
      isStarred: boolean;
      agoMs: number;
      labelIds?: string[];
    };

    const seeds: Seed[] = [
      {
        threadKey: "billing-1042",
        threadSubject: "Invoice #1042 is ready",
        externalId: "seed-wm-inbox-1",
        direction: "INBOUND",
        folder: "INBOX",
        from: "billing@example.com",
        to: [me],
        subject: "Invoice #1042 is ready",
        bodyText: "Hi there, your invoice #1042 for this month is now available. The total due is $420.00.",
        isRead: false,
        isStarred: false,
        agoMs: 2 * DAY,
        labelIds: [vendors.id],
      },
      {
        threadKey: "billing-1042",
        threadSubject: "Invoice #1042 is ready",
        externalId: "seed-wm-inbox-2",
        direction: "INBOUND",
        folder: "INBOX",
        from: "billing@example.com",
        to: [me],
        subject: "Re: Invoice #1042 is ready",
        bodyText: "A quick reminder that invoice #1042 is due at the end of the week. Thanks!",
        isRead: true,
        isStarred: false,
        agoMs: 2 * DAY - HOUR,
        labelIds: [vendors.id],
      },
      {
        threadKey: "gh-security",
        threadSubject: "Security alert for your repository",
        externalId: "seed-wm-inbox-3",
        direction: "INBOUND",
        folder: "INBOX",
        from: "support@github.com",
        to: [me],
        subject: "Security alert for your repository",
        bodyText: "We found a potential vulnerability in one of your dependencies. Review it in the security tab.",
        isRead: false,
        isStarred: true,
        agoMs: 1 * DAY,
      },
      {
        threadKey: "vercel-deploy",
        threadSubject: "Deployment succeeded",
        externalId: "seed-wm-inbox-4",
        direction: "INBOUND",
        folder: "INBOX",
        from: "team@vercel.com",
        to: [me],
        subject: "Deployment succeeded",
        bodyText: "Your latest deployment to production completed successfully in 47 seconds.",
        isRead: true,
        isStarred: false,
        agoMs: 3 * DAY,
      },
      {
        threadKey: "welcome",
        threadSubject: "Welcome to your new mailbox",
        externalId: "seed-wm-inbox-5",
        direction: "INBOUND",
        folder: "INBOX",
        from: "team@vercel.com",
        to: [me],
        subject: "Welcome to your new mailbox",
        bodyText: "Thanks for connecting your account. This is your unified inbox inside the platform.",
        isRead: true,
        isStarred: false,
        agoMs: 3 * DAY - HOUR,
      },
      {
        threadKey: "sent-proposal",
        threadSubject: "Proposal follow-up",
        externalId: "seed-wm-sent-1",
        direction: "OUTBOUND",
        folder: "SENT",
        from: me,
        to: ["client@acme-customer.com"],
        subject: "Proposal follow-up",
        bodyText: "Hi, following up on the proposal we sent last week. Happy to answer any questions.",
        isRead: true,
        isStarred: false,
        agoMs: 1 * DAY - HOUR,
      },
      {
        threadKey: "sent-intro",
        threadSubject: "Great to connect",
        externalId: "seed-wm-sent-2",
        direction: "OUTBOUND",
        folder: "SENT",
        from: me,
        to: ["support@github.com"],
        subject: "Great to connect",
        bodyText: "Thanks for the quick response earlier. Looking forward to working together.",
        isRead: true,
        isStarred: false,
        agoMs: 5 * HOUR,
      },
      {
        threadKey: "spam-offer",
        threadSubject: "You have won a prize",
        externalId: "seed-wm-spam-1",
        direction: "INBOUND",
        folder: "SPAM",
        from: "noreply@totally-legit.example.com",
        to: [me],
        subject: "You have won a prize",
        bodyText: "Congratulations! Click here to claim your reward before it expires.",
        isRead: false,
        isStarred: false,
        agoMs: 6 * HOUR,
      },
    ];

    const threadCache = new Map<string, string>();
    async function ensureThread(key: string, subject: string, lastAt: Date): Promise<string> {
      const cached = threadCache.get(key);
      if (cached) return cached;
      // Reuse a thread whose subject matches (idempotent re-runs), else create.
      const existing = await db.emailThread.findFirst({ where: { accountId: acct.id, subject } });
      const threadId =
        existing?.id ??
        (await db.emailThread.create({ data: { accountId: acct.id, subject, lastMessageAt: lastAt } })).id;
      threadCache.set(key, threadId);
      return threadId;
    }

    let createdMsgs = 0;
    for (const s of seeds) {
      const existing = await db.emailMessage.findFirst({
        where: { accountId: acct.id, externalId: s.externalId },
        select: { id: true },
      });
      const when = new Date(Date.now() - s.agoMs);
      const threadId = await ensureThread(s.threadKey, s.threadSubject, when);
      let messageId = existing?.id;
      if (!messageId) {
        const created = await db.emailMessage.create({
          data: {
            threadId,
            accountId: acct.id,
            externalId: s.externalId,
            direction: s.direction,
            fromAddress: s.from,
            toAddresses: s.to,
            subject: s.subject,
            bodyText: s.bodyText,
            bodyHtml: `<p>${s.bodyText}</p>`,
            snippet: s.bodyText.slice(0, 140),
            folder: s.folder,
            isRead: s.isRead,
            isStarred: s.isStarred,
            readAt: s.isRead ? when : null,
            status: s.direction === "OUTBOUND" ? "SENT" : "DELIVERED",
            receivedAt: s.direction === "INBOUND" ? when : null,
            sentAt: s.direction === "OUTBOUND" ? when : null,
          },
        });
        messageId = created.id;
        createdMsgs++;
      }
      for (const labelId of s.labelIds ?? []) {
        await db.emailMessageLabel.upsert({
          where: { messageId_labelId: { messageId, labelId } },
          update: {},
          create: { messageId, labelId },
        });
      }
    }
    console.log(`  messages: created ${createdMsgs} new (of ${seeds.length} seeds)`);

    // Refresh thread aggregate counts.
    for (const threadId of threadCache.values()) {
      const [count, unread, latest] = await Promise.all([
        db.emailMessage.count({ where: { threadId } }),
        db.emailMessage.count({ where: { threadId, isRead: false } }),
        db.emailMessage.findFirst({
          where: { threadId },
          orderBy: [{ receivedAt: "desc" }, { sentAt: "desc" }, { createdAt: "desc" }],
          select: { receivedAt: true, sentAt: true, createdAt: true },
        }),
      ]);
      await db.emailThread.update({
        where: { id: threadId },
        data: {
          messageCount: count,
          unreadCount: unread,
          lastMessageAt: latest?.receivedAt ?? latest?.sentAt ?? latest?.createdAt ?? null,
        },
      });
    }

    // 4) One draft.
    const draftSubject = "Draft: quarterly check-in";
    const existingDraft = await db.emailDraft.findFirst({ where: { accountId: acct.id, subject: draftSubject } });
    if (!existingDraft) {
      await db.emailDraft.create({
        data: {
          accountId: acct.id,
          to: "client@acme-customer.com",
          subject: draftSubject,
          body: "<p>Hi, wanted to schedule our quarterly check-in. Does next Tuesday work?</p>",
        },
      });
      console.log("  + draft created");
    } else {
      console.log("  draft already present");
    }

    // 5) One filter (from contains billing -> apply Vendors label).
    const filterName = "Billing to Vendors";
    const existingFilter = await db.emailFilter.findFirst({ where: { accountId: acct.id, name: filterName } });
    if (!existingFilter) {
      await db.emailFilter.create({
        data: {
          accountId: acct.id,
          name: filterName,
          condition: { field: "from", op: "contains", value: "billing" },
          action: { type: "APPLY_LABEL", value: vendors.id },
          enabled: true,
        },
      });
      console.log("  + filter created");
    } else {
      console.log("  filter already present");
    }

    // 6) One default signature.
    const sigName = "Default";
    const existingSig = await db.emailSignature.findFirst({ where: { accountId: acct.id, name: sigName } });
    if (!existingSig) {
      await db.emailSignature.create({
        data: {
          accountId: acct.id,
          ownerClerkUserId: owner,
          name: sigName,
          html: "<p>Best regards,<br/>The Acme Team</p>",
          isDefault: true,
        },
      });
      console.log("  + signature created");
    } else {
      console.log("  signature already present");
    }

    const [accounts, messages, drafts, labels, filters, signatures] = await Promise.all([
      db.emailAccount.count(),
      db.emailMessage.count({ where: { accountId: acct.id } }),
      db.emailDraft.count({ where: { accountId: acct.id } }),
      db.emailLabel.count({ where: { accountId: acct.id } }),
      db.emailFilter.count({ where: { accountId: acct.id } }),
      db.emailSignature.count({ where: { accountId: acct.id } }),
    ]);
    console.log(
      `\n[seed-webmail] done: accountId=${acct.id} accounts=${accounts} messages=${messages} drafts=${drafts} labels=${labels} filters=${filters} signatures=${signatures}`,
    );
  } catch (err) {
    fail(String(err instanceof Error ? err.message : err));
  } finally {
    await db.$disconnect();
  }
}

main();
