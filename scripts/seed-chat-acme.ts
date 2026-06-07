/*
 * seed-chat-acme.ts - populate a tenant schema with Sprint 16 chat starter data.
 * Idempotent: channels found by slug, DM by its derived slug, messages by a
 * (channel, author, bodyText) lookup, reactions by their unique key, pins by
 * (channel, message). Re-running does not duplicate rows. After seeding it
 * reindexes the seeded messages for the command palette.
 *
 * Seeds:
 *   - 3 PUBLIC channels: #general, #random, #announcements
 *   - 1 PRIVATE channel: #leadership
 *   - 1 DM between the first two ACTIVE members
 *   - 10 ChatMessages spread across the public channels, dated within last week
 *   - 3 reactions on the most recent #general message
 *   - 1 pinned message in #announcements
 *
 * Usage:
 *   tsx scripts/seed-chat-acme.ts --slug acme
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { PrismaClient } from "../src/lib/db/generated/tenant";
import { reindex } from "../src/lib/search";
import { channelSlug, dmSlug } from "../src/lib/chat/chat-utils";

function fail(msg: string): never {
  console.error(`\n[seed-chat] ERROR: ${msg}\n`);
  process.exit(1);
}

function parseSlug(argv: string[]): string {
  let slug: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--slug") slug = argv[++i];
  }
  if (!slug) fail("Missing --slug. Usage: tsx scripts/seed-chat-acme.ts --slug acme");
  if (!/^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(slug!)) fail(`Invalid slug "${slug}".`);
  return slug!;
}

function schemaNameForSlug(slug: string): string {
  return `tenant_${slug.replace(/-/g, "_")}`;
}

function connectionForSchema(schema: string): string {
  const base = process.env.DATABASE_URL;
  if (!base) fail("DATABASE_URL is not set; cannot build a tenant connection.");
  const url = new URL(base!);
  url.searchParams.set("schema", schema);
  return url.toString();
}

async function findOrCreateChannel(
  db: PrismaClient,
  name: string,
  kind: "PUBLIC" | "PRIVATE",
  createdById: string | null,
): Promise<string> {
  const slug = channelSlug(name);
  const existing = await db.chatChannel.findUnique({ where: { slug } });
  if (existing) return existing.id;
  const created = await db.chatChannel.create({
    data: { name, slug, kind, createdById, description: `The ${name} channel.` },
  });
  return created.id;
}

async function ensureMember(db: PrismaClient, channelId: string, userId: string, role: "ADMIN" | "MEMBER" = "MEMBER") {
  await db.chatMember.upsert({
    where: { channelId_userId: { channelId, userId } },
    create: { channelId, userId, role },
    update: {},
  });
}

async function findOrCreateMessage(
  db: PrismaClient,
  input: { channelId: string; authorId: string; authorName: string; bodyText: string; createdAt: Date },
): Promise<string> {
  const existing = await db.chatMessage.findFirst({
    where: { channelId: input.channelId, authorId: input.authorId, bodyText: input.bodyText },
  });
  if (existing) return existing.id;
  const created = await db.chatMessage.create({
    data: {
      channelId: input.channelId,
      authorId: input.authorId,
      authorName: input.authorName,
      bodyText: input.bodyText,
      createdAt: input.createdAt,
    },
  });
  return created.id;
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86_400_000);
}

async function main() {
  const slug = parseSlug(process.argv.slice(2));
  const schema = schemaNameForSlug(slug);
  console.log(`[seed-chat] seeding tenant "${slug}" -> schema "${schema}"`);

  const db = new PrismaClient({ datasources: { db: { url: connectionForSchema(schema) } } });
  try {
    await db.$executeRawUnsafe(`SET search_path TO "${schema}"`);

    // Pick two active members as the chat participants.
    const members = await db.membership.findMany({
      where: { status: "ACTIVE" },
      orderBy: { createdAt: "asc" },
      take: 5,
    });
    if (members.length < 2) fail("Need at least 2 ACTIVE members to seed chat. Run the base tenant seed first.");
    const alice = members[0]!;
    const bob = members[1]!;
    const aliceName = alice.displayName ?? alice.email ?? alice.clerkUserId;
    const bobName = bob.displayName ?? bob.email ?? bob.clerkUserId;

    // 1. Channels
    const general = await findOrCreateChannel(db, "general", "PUBLIC", alice.clerkUserId);
    const random = await findOrCreateChannel(db, "random", "PUBLIC", alice.clerkUserId);
    const announcements = await findOrCreateChannel(db, "announcements", "PUBLIC", alice.clerkUserId);
    const leadership = await findOrCreateChannel(db, "leadership", "PRIVATE", alice.clerkUserId);

    // Memberships: both in public channels; only alice/bob in leadership.
    for (const ch of [general, random, announcements, leadership]) {
      await ensureMember(db, ch, alice.clerkUserId, "ADMIN");
      await ensureMember(db, ch, bob.clerkUserId, "MEMBER");
    }

    // 2. DM between alice and bob
    const dmSlugStr = dmSlug(alice.clerkUserId, bob.clerkUserId);
    let dm = await db.chatChannel.findUnique({ where: { slug: dmSlugStr } });
    if (!dm) {
      dm = await db.chatChannel.create({
        data: { name: "Direct message", slug: dmSlugStr, kind: "DM", createdById: alice.clerkUserId },
      });
    }
    await ensureMember(db, dm.id, alice.clerkUserId);
    await ensureMember(db, dm.id, bob.clerkUserId);

    // 3. Messages (10), dated within the last week.
    const seeded: string[] = [];
    const plan: Array<{ channelId: string; authorId: string; authorName: string; bodyText: string; createdAt: Date }> = [
      { channelId: general, authorId: alice.clerkUserId, authorName: aliceName, bodyText: "Welcome to the team chat. Introduce yourself here.", createdAt: daysAgo(6) },
      { channelId: general, authorId: bob.clerkUserId, authorName: bobName, bodyText: "Hi all, glad to be here.", createdAt: daysAgo(6) },
      { channelId: general, authorId: alice.clerkUserId, authorName: aliceName, bodyText: "Standup is at 9am daily.", createdAt: daysAgo(4) },
      { channelId: general, authorId: bob.clerkUserId, authorName: bobName, bodyText: "Thanks for the heads up.", createdAt: daysAgo(1) },
      { channelId: random, authorId: bob.clerkUserId, authorName: bobName, bodyText: "Anyone up for lunch later?", createdAt: daysAgo(5) },
      { channelId: random, authorId: alice.clerkUserId, authorName: aliceName, bodyText: "Count me in.", createdAt: daysAgo(5) },
      { channelId: random, authorId: bob.clerkUserId, authorName: bobName, bodyText: "Found a great coffee place nearby.", createdAt: daysAgo(2) },
      { channelId: announcements, authorId: alice.clerkUserId, authorName: aliceName, bodyText: "We shipped v0.4 of the platform today.", createdAt: daysAgo(3) },
      { channelId: announcements, authorId: alice.clerkUserId, authorName: aliceName, bodyText: "Office will be closed next Monday for the holiday.", createdAt: daysAgo(2) },
      { channelId: leadership, authorId: alice.clerkUserId, authorName: aliceName, bodyText: "Quarterly planning doc is ready for review.", createdAt: daysAgo(1) },
    ];
    for (const p of plan) {
      seeded.push(await findOrCreateMessage(db, p));
    }

    // 4. Three reactions on the most recent #general message.
    const lastGeneral = await db.chatMessage.findFirst({
      where: { channelId: general, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
    if (lastGeneral) {
      for (const r of [
        { userId: alice.clerkUserId, emoji: "thumbsup" },
        { userId: bob.clerkUserId, emoji: "thumbsup" },
        { userId: bob.clerkUserId, emoji: "heart" },
      ]) {
        await db.chatReaction.upsert({
          where: { messageId_userId_emoji: { messageId: lastGeneral.id, userId: r.userId, emoji: r.emoji } },
          create: { messageId: lastGeneral.id, userId: r.userId, emoji: r.emoji },
          update: {},
        });
      }
    }

    // 5. One pinned message in #announcements (the v0.4 ship note).
    const shipNote = await db.chatMessage.findFirst({
      where: { channelId: announcements, bodyText: "We shipped v0.4 of the platform today." },
    });
    if (shipNote) {
      await db.chatPinnedMessage.upsert({
        where: { channelId_messageId: { channelId: announcements, messageId: shipNote.id } },
        create: { channelId: announcements, messageId: shipNote.id, pinnedById: alice.clerkUserId },
        update: {},
      });
    }

    // 6. Reindex seeded messages for search.
    for (const id of seeded) {
      await reindex(db, "CHAT_MESSAGE", id);
    }

    // Verify + print counts.
    const [channelCount, dmCount, messageCount, reactionCount, pinCount, memberCount] = await Promise.all([
      db.chatChannel.count({ where: { kind: { in: ["PUBLIC", "PRIVATE"] } } }),
      db.chatChannel.count({ where: { kind: "DM" } }),
      db.chatMessage.count(),
      db.chatReaction.count(),
      db.chatPinnedMessage.count(),
      db.chatMember.count(),
    ]);

    console.log("[seed-chat] done. Counts:");
    console.log(`  channels (public/private): ${channelCount}`);
    console.log(`  dms:                       ${dmCount}`);
    console.log(`  messages:                  ${messageCount}`);
    console.log(`  reactions:                 ${reactionCount}`);
    console.log(`  pinned:                    ${pinCount}`);
    console.log(`  members:                   ${memberCount}`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error("[seed-chat] FAILED:", err);
  process.exit(1);
});
