/*
 * seed-workgroups-acme.ts - populate a tenant schema with Sprint 22 Workgroups
 * starter data. Idempotent: groups are found by their unique slug, and members /
 * join requests / linked records are only added when missing, so re-running does
 * not duplicate.
 *
 * Seeds:
 *   - "Product Team" (slug=product-team, PUBLIC, icon "P"): owner + up to 2 members,
 *     1 sample FeedPost and 1 Task linked via workgroupId.
 *   - "Sales Leadership" (slug=sales-leadership, PRIVATE, icon "S"): owner + 1 member,
 *     1 pending join request from a distinct non-member.
 *
 * The owner is the first ACTIVE admin/owner Membership (falling back to the first
 * ACTIVE member). Rows needing distinct users are skipped when too few members exist.
 *
 * Usage:
 *   tsx scripts/seed-workgroups-acme.ts --slug acme
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { PrismaClient } from "../src/lib/db/generated/tenant";

function fail(msg: string): never {
  console.error(`\n[seed-workgroups] ERROR: ${msg}\n`);
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
    console.log(`[seed-workgroups] schema=${schema}`);

    const members = await db.membership.findMany({
      where: { status: "ACTIVE" },
      select: { clerkUserId: true, role: true },
      orderBy: { createdAt: "asc" },
    });
    const memberIds = members.map((m) => m.clerkUserId);
    const owner =
      members.find((m) => m.role === "OWNER" || m.role === "ADMIN")?.clerkUserId ??
      memberIds[0] ??
      "system";
    console.log(`  active members=${memberIds.length}; owner=${owner}`);

    async function ensureGroup(data: {
      name: string;
      slug: string;
      visibility: "PUBLIC" | "PRIVATE";
      icon: string;
      description: string;
    }) {
      let group = await db.workgroup.findUnique({ where: { slug: data.slug } });
      if (!group) {
        group = await db.workgroup.create({
          data: {
            name: data.name,
            slug: data.slug,
            description: data.description,
            visibility: data.visibility,
            icon: data.icon,
            ownerId: owner,
            status: "ACTIVE",
          },
        });
        console.log(`  created group "${data.name}" (${data.slug})`);
      } else {
        console.log(`  group "${data.name}" already present`);
      }
      return group;
    }

    async function ensureMember(workgroupId: string, userId: string, role: "OWNER" | "MODERATOR" | "MEMBER") {
      const existing = await db.workgroupMember.findUnique({
        where: { workgroupId_userId: { workgroupId, userId } },
      });
      if (!existing) {
        await db.workgroupMember.create({ data: { workgroupId, userId, role } });
        console.log(`    + member ${userId} (${role})`);
      }
    }

    // 1) Product Team (PUBLIC): owner + up to 2 members.
    const product = await ensureGroup({
      name: "Product Team",
      slug: "product-team",
      visibility: "PUBLIC",
      icon: "P",
      description: "Roadmap, releases, and everything product.",
    });
    await ensureMember(product.id, owner, "OWNER");
    for (const uid of memberIds.filter((id) => id !== owner).slice(0, 2)) {
      await ensureMember(product.id, uid, "MEMBER");
    }

    // Sample feed post linked to Product Team.
    const productPostBody = "Welcome to the Product Team workgroup. Roadmap updates land here.";
    const existingPost = await db.feedPost.findFirst({ where: { body: productPostBody, workgroupId: product.id } });
    if (!existingPost) {
      await db.feedPost.create({
        data: {
          authorId: owner,
          type: "ANNOUNCEMENT",
          title: "Welcome",
          body: productPostBody,
          visibility: "PUBLIC",
          workgroupId: product.id,
        },
      });
      console.log("    + sample feed post");
    }

    // Sample task linked to Product Team.
    const productTaskTitle = "Draft the Q3 roadmap";
    const existingTask = await db.task.findFirst({ where: { title: productTaskTitle, workgroupId: product.id } });
    if (!existingTask) {
      await db.task.create({
        data: {
          title: productTaskTitle,
          status: "TODO",
          reporterClerkUserId: owner,
          workgroupId: product.id,
        },
      });
      console.log("    + sample task");
    }

    // 2) Sales Leadership (PRIVATE): owner + 1 member + 1 pending join request.
    const sales = await ensureGroup({
      name: "Sales Leadership",
      slug: "sales-leadership",
      visibility: "PRIVATE",
      icon: "S",
      description: "Private space for sales leaders to align on strategy.",
    });
    await ensureMember(sales.id, owner, "OWNER");
    const salesSecond = memberIds.find((id) => id !== owner);
    if (salesSecond) await ensureMember(sales.id, salesSecond, "MEMBER");

    // Pending join request from a distinct non-member.
    const salesMemberIds = new Set(
      (await db.workgroupMember.findMany({ where: { workgroupId: sales.id }, select: { userId: true } })).map((m) => m.userId),
    );
    const requester = memberIds.find((id) => !salesMemberIds.has(id));
    if (requester) {
      const existingReq = await db.workgroupJoinRequest.findFirst({
        where: { workgroupId: sales.id, userId: requester },
      });
      if (!existingReq) {
        await db.workgroupJoinRequest.create({
          data: {
            workgroupId: sales.id,
            userId: requester,
            message: "I would like to join the sales leadership sync.",
            status: "PENDING",
          },
        });
        console.log(`    + pending join request from ${requester}`);
      } else {
        console.log("    join request already present");
      }
    } else {
      console.log("    no distinct non-member available - skipping join request");
    }

    const [groups, wgMembers, joinReqs] = await Promise.all([
      db.workgroup.count(),
      db.workgroupMember.count(),
      db.workgroupJoinRequest.count({ where: { status: "PENDING" } }),
    ]);
    console.log(`\n[seed-workgroups] done: groups=${groups} members=${wgMembers} pendingJoinRequests=${joinReqs}`);
  } catch (err) {
    fail(String(err instanceof Error ? err.message : err));
  } finally {
    await db.$disconnect();
  }
}

main();
