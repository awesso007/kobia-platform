/*
 * seed-feed-acme.ts - populate a tenant schema with Sprint 21 Feed / Activity
 * Stream starter data. Idempotent: posts are found by their deterministic body,
 * comments/reactions/votes/mentions are only added when the owning post was just
 * created, so re-running does not duplicate.
 *
 * Seeds:
 *   - 1 pinned ANNOUNCEMENT "Welcome to KOBIA feed"
 *   - 1 POST "Team lunch Friday" (2 comments, ~3 reactions)
 *   - 1 POLL "Best day for weekly sync?" (3 options + votes)
 *   - 1 RECORD_SHARE referencing an existing deal (skipped if no deal)
 *   - 1-2 mentions when >= 2 active members exist
 *
 * Author/actor ids come from ACTIVE Membership rows. When fewer than 2 members
 * exist we still create the system-authored posts (author "system") but skip the
 * rows that need distinct real users (mentions, multi-user reactions/votes).
 *
 * Usage:
 *   tsx scripts/seed-feed-acme.ts --slug acme
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { PrismaClient } from "../src/lib/db/generated/tenant";

function fail(msg: string): never {
  console.error(`\n[seed-feed] ERROR: ${msg}\n`);
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

async function main() {
  const slug = parseSlug(process.argv.slice(2));
  const schema = schemaNameForSlug(slug);
  const db = new PrismaClient({ datasources: { db: { url: connectionForSchema(schema) } } });

  try {
    console.log(`[seed-feed] schema=${schema}`);

    const members = await db.membership.findMany({
      where: { status: "ACTIVE" },
      select: { clerkUserId: true },
      orderBy: { createdAt: "asc" },
    });
    const memberIds = members.map((m) => m.clerkUserId);
    const author = memberIds[0] ?? "system";
    const second = memberIds[1] ?? null;
    console.log(`  active members=${memberIds.length}`);

    // 1) Pinned announcement.
    const annBody = "Welcome to KOBIA feed. Share updates, ask questions, and celebrate wins here.";
    let announcement = await db.feedPost.findFirst({ where: { body: annBody } });
    if (!announcement) {
      announcement = await db.feedPost.create({
        data: {
          authorId: author,
          type: "ANNOUNCEMENT",
          title: "Welcome to KOBIA feed",
          body: annBody,
          pinned: true,
          visibility: "PUBLIC",
        },
      });
      console.log("  created announcement (pinned)");
    } else {
      console.log("  announcement already present");
    }

    // 2) Plain post with comments + reactions.
    const lunchBody = "Team lunch this Friday at noon. Reply with your order and reactions welcome.";
    let lunch = await db.feedPost.findFirst({ where: { body: lunchBody } });
    if (!lunch) {
      lunch = await db.feedPost.create({
        data: { authorId: author, type: "POST", body: lunchBody, visibility: "PUBLIC" },
      });
      const c1 = await db.feedComment.create({
        data: { postId: lunch.id, authorId: author, body: "Count me in - I'll grab the reservation." },
      });
      await db.feedComment.create({
        data: {
          postId: lunch.id,
          authorId: second ?? author,
          body: "Sounds great, adding it to my calendar.",
        },
      });
      // Reaction on the post plus one on the first comment.
      const reactors = memberIds.length >= 2 ? memberIds.slice(0, 3) : [author];
      const kinds = ["LIKE", "LOVE", "THANKS"] as const;
      let postReactionCount = 0;
      for (let i = 0; i < reactors.length; i++) {
        await db.feedReaction.create({
          data: { postId: lunch.id, userId: reactors[i]!, kind: kinds[i % kinds.length]! },
        });
        postReactionCount++;
      }
      await db.feedReaction.create({ data: { commentId: c1.id, userId: author, kind: "LIKE" } });
      await db.feedPost.update({
        where: { id: lunch.id },
        data: { commentCount: 2, reactionCount: postReactionCount },
      });
      await db.feedComment.update({ where: { id: c1.id }, data: { reactionCount: 1 } });
      console.log(`  created post "Team lunch Friday" (2 comments, ${postReactionCount} post reactions)`);
    } else {
      console.log("  team lunch post already present");
    }

    // 3) Poll post.
    const pollBody = "Help us pick a weekly sync slot.";
    let pollPost = await db.feedPost.findFirst({ where: { body: pollBody } });
    if (!pollPost) {
      pollPost = await db.feedPost.create({
        data: { authorId: author, type: "POLL", title: "Best day for weekly sync?", body: pollBody, visibility: "PUBLIC" },
      });
      const poll = await db.feedPoll.create({
        data: {
          postId: pollPost.id,
          question: "Best day for weekly sync?",
          allowMultiple: false,
          options: {
            create: [
              { label: "Monday", order: 0 },
              { label: "Wednesday", order: 1 },
              { label: "Friday", order: 2 },
            ],
          },
        },
        include: { options: { orderBy: { order: "asc" } } },
      });
      // Cast a few votes across members (one each, first option favored).
      const voters = memberIds.length >= 2 ? memberIds.slice(0, 3) : [author];
      const choice = [0, 0, 1];
      let voteCount = 0;
      for (let i = 0; i < voters.length; i++) {
        const opt = poll.options[choice[i] ?? 0];
        if (!opt) continue;
        await db.feedPollVote.create({ data: { pollId: poll.id, optionId: opt.id, userId: voters[i]! } });
        voteCount++;
      }
      console.log(`  created poll "Best day for weekly sync?" (${voteCount} votes)`);
    } else {
      console.log("  poll post already present");
    }

    // 4) Record share (only if a deal exists).
    const deal = await db.deal.findFirst({ select: { id: true, name: true } });
    const shareBody = deal
      ? `Sharing this deal with the team: ${deal.name}. Take a look and add your notes.`
      : null;
    if (shareBody) {
      const existingShare = await db.feedPost.findFirst({ where: { body: shareBody } });
      if (!existingShare) {
        await db.feedPost.create({
          data: {
            authorId: author,
            type: "RECORD_SHARE",
            body: shareBody,
            visibility: "PUBLIC",
            sharedRecordType: "DEAL",
            sharedRecordId: deal!.id,
          },
        });
        console.log(`  created record share (deal ${deal!.id})`);
      } else {
        console.log("  record share already present");
      }
    } else {
      console.log("  no deal found - skipping record share");
    }

    // 5) Mentions (need a distinct second member to mention on the announcement).
    if (second && announcement) {
      const existingMention = await db.feedMention.findFirst({
        where: { postId: announcement.id, mentionedUserId: second },
      });
      if (!existingMention) {
        await db.feedMention.create({ data: { postId: announcement.id, mentionedUserId: second } });
        console.log("  created 1 mention on announcement");
      } else {
        console.log("  mention already present");
      }
    } else {
      console.log("  fewer than 2 members - skipping mentions");
    }

    const [posts, comments, reactions, votes, mentions] = await Promise.all([
      db.feedPost.count(),
      db.feedComment.count(),
      db.feedReaction.count(),
      db.feedPollVote.count(),
      db.feedMention.count(),
    ]);
    console.log(
      `\n[seed-feed] done: posts=${posts} comments=${comments} reactions=${reactions} pollVotes=${votes} mentions=${mentions}`,
    );
  } catch (err) {
    fail(String(err instanceof Error ? err.message : err));
  } finally {
    await db.$disconnect();
  }
}

main();
