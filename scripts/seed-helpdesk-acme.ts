/*
 * seed-helpdesk-acme.ts - populate a tenant schema with Sprint 15 helpdesk
 * starter data. Idempotent: teams found by name, categories by name, SLA
 * policies by name, tickets by subject, KB categories by slug, KB articles by
 * title (via slug), so re-running does not duplicate rows. After seeding it
 * reindexes the tickets and articles for search.
 *
 * Seeds:
 *   - 2 Teams: Support, Engineering
 *   - 3 TicketCategories: Bug, Question, Billing
 *   - 2 SlaPolicies: Standard (60 / 1440), Priority (15 / 240)
 *       (Bug category points at Priority; Question/Billing at Standard)
 *   - 1 Contact (Dana Customer <dana@acme-customer.com>) used as the portal
 *       requester so /portal/helpdesk login works end to end
 *   - 3 Tickets, each with 2-3 messages:
 *       NEW      URGENT in Bug       "Login page returns 500"
 *       OPEN     NORMAL in Question  "How do I export my data?"
 *       RESOLVED NORMAL in Billing   "Duplicate charge on invoice" (firstResponseAt + resolvedAt)
 *   - 2 KbCategories: Getting Started, Account
 *   - 2 KbArticles (PUBLISHED, PUBLIC): "Getting Started", "Reset Your Password"
 *
 * Usage:
 *   tsx scripts/seed-helpdesk-acme.ts --slug acme
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { PrismaClient } from "../src/lib/db/generated/tenant";
import { createTicket, addMessage, changeStatus } from "../src/lib/helpdesk/tickets";
import { upsertArticle, slugify } from "../src/lib/helpdesk/kb";
import { reindex } from "../src/lib/search";

function fail(msg: string): never {
  console.error(`\n[seed-helpdesk] ERROR: ${msg}\n`);
  process.exit(1);
}

function parseSlug(argv: string[]): string {
  let slug: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--slug") slug = argv[++i];
  }
  if (!slug) fail("Missing --slug. Usage: tsx scripts/seed-helpdesk-acme.ts --slug acme");
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

async function findOrCreateTeam(db: PrismaClient, name: string): Promise<string> {
  const existing = await db.team.findFirst({ where: { name } });
  if (existing) return existing.id;
  const created = await db.team.create({ data: { name, memberIdsJson: [] } });
  return created.id;
}

async function findOrCreateSlaPolicy(
  db: PrismaClient,
  name: string,
  firstResponseMinutes: number,
  resolveMinutes: number,
): Promise<string> {
  const existing = await db.slaPolicy.findFirst({ where: { name } });
  if (existing) return existing.id;
  const created = await db.slaPolicy.create({ data: { name, firstResponseMinutes, resolveMinutes } });
  return created.id;
}

async function findOrCreateCategory(
  db: PrismaClient,
  name: string,
  slaPolicyId: string | null,
): Promise<string> {
  const existing = await db.ticketCategory.findFirst({ where: { name } });
  if (existing) return existing.id;
  const created = await db.ticketCategory.create({ data: { name, slaPolicyId } });
  return created.id;
}

async function findOrCreateKbCategory(db: PrismaClient, name: string, order: number): Promise<string> {
  const slug = slugify(name);
  const existing = await db.kbCategory.findUnique({ where: { slug } });
  if (existing) return existing.id;
  const created = await db.kbCategory.create({ data: { name, slug, order } });
  return created.id;
}

async function main() {
  const slug = parseSlug(process.argv.slice(2));
  const schema = schemaNameForSlug(slug);
  console.log(`[seed-helpdesk] seeding tenant "${slug}" -> schema "${schema}"`);

  const db = new PrismaClient({ datasources: { db: { url: connectionForSchema(schema) } } });
  try {
    await db.$executeRawUnsafe(`SET search_path TO "${schema}"`);

    // 1. Teams
    const supportTeam = await findOrCreateTeam(db, "Support");
    const engineeringTeam = await findOrCreateTeam(db, "Engineering");

    // 2. SLA policies
    const standardSla = await findOrCreateSlaPolicy(db, "Standard", 60, 1440);
    const prioritySla = await findOrCreateSlaPolicy(db, "Priority", 15, 240);

    // 3. Categories (Bug -> Priority, Question/Billing -> Standard)
    const bugCat = await findOrCreateCategory(db, "Bug", prioritySla);
    const questionCat = await findOrCreateCategory(db, "Question", standardSla);
    const billingCat = await findOrCreateCategory(db, "Billing", standardSla);

    // 4. Portal requester contact
    const requesterEmail = "dana@acme-customer.com";
    let contact = await db.contact.findFirst({
      where: { email: { equals: requesterEmail, mode: "insensitive" } },
    });
    if (!contact) {
      contact = await db.contact.create({
        data: { firstName: "Dana", lastName: "Customer", email: requesterEmail },
      });
    }
    const requesterName = "Dana Customer";

    const ticketIds: string[] = [];

    // 5a. NEW / URGENT / Bug
    let bugTicket = await db.ticket.findFirst({ where: { subject: "Login page returns 500" } });
    if (!bugTicket) {
      const id = await createTicket(db, {
        subject: "Login page returns 500",
        description: "<p>Every time I try to sign in I get a 500 error. This started this morning.</p>",
        priority: "URGENT",
        channel: "PORTAL",
        requesterEmail,
        requesterName,
        requesterContactId: contact.id,
        categoryId: bugCat,
        teamId: engineeringTeam,
        actorType: "CUSTOMER",
      });
      await addMessage(db, {
        ticketId: id,
        authorType: "AGENT",
        authorName: "Support Agent",
        bodyHtml: "<p>Thanks for reporting this. We are looking into it now.</p>",
      });
      bugTicket = await db.ticket.findUnique({ where: { id } });
      // addMessage by an agent moves NEW -> PENDING; pull back to NEW for the fixture.
      await changeStatus(db, id, "NEW", { actorType: "AGENT" });
    }
    if (bugTicket) ticketIds.push(bugTicket.id);

    // 5b. OPEN / NORMAL / Question
    let questionTicket = await db.ticket.findFirst({ where: { subject: "How do I export my data?" } });
    if (!questionTicket) {
      const id = await createTicket(db, {
        subject: "How do I export my data?",
        description: "<p>I would like to export all of my contacts to a CSV file. Where do I find that?</p>",
        priority: "NORMAL",
        channel: "PORTAL",
        requesterEmail,
        requesterName,
        requesterContactId: contact.id,
        categoryId: questionCat,
        teamId: supportTeam,
        actorType: "CUSTOMER",
      });
      await addMessage(db, {
        ticketId: id,
        authorType: "AGENT",
        authorName: "Support Agent",
        bodyHtml: "<p>You can export from the list view using the Export button in the top right.</p>",
      });
      await addMessage(db, {
        ticketId: id,
        authorType: "CUSTOMER",
        authorName: requesterName,
        authorEmail: requesterEmail,
        bodyHtml: "<p>Found it, thank you. One more question - can I schedule exports?</p>",
      });
      questionTicket = await db.ticket.findUnique({ where: { id } });
    }
    if (questionTicket) ticketIds.push(questionTicket.id);

    // 5c. RESOLVED / NORMAL / Billing
    let billingTicket = await db.ticket.findFirst({ where: { subject: "Duplicate charge on invoice" } });
    if (!billingTicket) {
      const id = await createTicket(db, {
        subject: "Duplicate charge on invoice",
        description: "<p>I was charged twice for my March invoice. Please refund the duplicate.</p>",
        priority: "NORMAL",
        channel: "PORTAL",
        requesterEmail,
        requesterName,
        requesterContactId: contact.id,
        categoryId: billingCat,
        teamId: supportTeam,
        actorType: "CUSTOMER",
      });
      await addMessage(db, {
        ticketId: id,
        authorType: "AGENT",
        authorName: "Support Agent",
        bodyHtml: "<p>Apologies for the trouble. I can see the duplicate and have issued a refund.</p>",
      });
      await addMessage(db, {
        ticketId: id,
        authorType: "CUSTOMER",
        authorName: requesterName,
        authorEmail: requesterEmail,
        bodyHtml: "<p>Got the refund confirmation. Thanks for the quick help.</p>",
      });
      await changeStatus(db, id, "RESOLVED", { actorType: "AGENT" });
      billingTicket = await db.ticket.findUnique({ where: { id } });
    }
    if (billingTicket) ticketIds.push(billingTicket.id);

    // 6. KB categories
    const gettingStartedCat = await findOrCreateKbCategory(db, "Getting Started", 0);
    const accountCat = await findOrCreateKbCategory(db, "Account", 1);

    // 7. KB articles (PUBLISHED, PUBLIC)
    const articleIds: string[] = [];
    let gettingStarted = await db.kbArticle.findUnique({ where: { slug: slugify("Getting Started") } });
    if (!gettingStarted) {
      const id = await upsertArticle(db, {
        title: "Getting Started",
        summary: "A quick tour to get you up and running.",
        bodyHtml:
          "<h2>Welcome</h2><p>This guide walks you through the first steps in your new workspace, from inviting your team to creating your first record.</p>",
        categoryId: gettingStartedCat,
        status: "PUBLISHED",
        visibility: "PUBLIC",
      });
      gettingStarted = await db.kbArticle.findUnique({ where: { id } });
    }
    if (gettingStarted) articleIds.push(gettingStarted.id);

    let resetPassword = await db.kbArticle.findUnique({ where: { slug: slugify("Reset Your Password") } });
    if (!resetPassword) {
      const id = await upsertArticle(db, {
        title: "Reset Your Password",
        summary: "Forgot your password? Here is how to reset it.",
        bodyHtml:
          "<h2>Resetting your password</h2><p>From the sign-in page, choose Forgot password and follow the emailed link to set a new one.</p>",
        categoryId: accountCat,
        status: "PUBLISHED",
        visibility: "PUBLIC",
      });
      resetPassword = await db.kbArticle.findUnique({ where: { id } });
    }
    if (resetPassword) articleIds.push(resetPassword.id);

    // Reindex tickets and articles for search.
    for (const id of ticketIds) await reindex(db, "TICKET", id);
    for (const id of articleIds) await reindex(db, "KB_ARTICLE", id);

    const [teams, categories, slaPolicies, tickets, messages, auditEvents, kbCategories, kbArticles] =
      await Promise.all([
        db.team.count(),
        db.ticketCategory.count(),
        db.slaPolicy.count(),
        db.ticket.count(),
        db.ticketMessage.count(),
        db.ticketAuditEvent.count(),
        db.kbCategory.count(),
        db.kbArticle.count(),
      ]);

    console.log(
      `[seed-helpdesk] ids -> support=${supportTeam} engineering=${engineeringTeam} standardSla=${standardSla} prioritySla=${prioritySla} bug=${bugCat} question=${questionCat} billing=${billingCat} contact=${contact.id}`,
    );
    console.log(
      `[seed-helpdesk] tickets -> bug=${bugTicket?.id} question=${questionTicket?.id} billing=${billingTicket?.id}`,
    );
    console.log(
      `[seed-helpdesk] articles -> gettingStarted=${gettingStarted?.id} resetPassword=${resetPassword?.id}`,
    );
    console.log(
      `[seed-helpdesk] counts -> teams=${teams} categories=${categories} slaPolicies=${slaPolicies} tickets=${tickets} messages=${messages} auditEvents=${auditEvents} kbCategories=${kbCategories} kbArticles=${kbArticles}`,
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error("[seed-helpdesk] failed", err);
  process.exit(1);
});
