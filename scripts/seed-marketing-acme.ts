/*
 * seed-marketing-acme.ts - populate a tenant schema with Sprint 13 marketing
 * starter data. Idempotent: upserts/finds by name (segments, broadcast,
 * campaign), slug (landing page), and email (unsubscribe), so re-running does
 * not duplicate rows. After seeding it recalculates each segment's cached count
 * and enrolls the active campaign's segment.
 *
 * Seeds:
 *   - 2 Segments: "Active Leads" (lead.status = NEW), "All Contacts" (email set)
 *   - 1 Broadcast: "Welcome Email" (DRAFT, EMAIL, targets All Contacts)
 *   - 1 Campaign:  "New Lead Drip" (ACTIVE, MANUAL, targets Active Leads) with
 *                  3 steps: Email -> Wait 2d -> Email
 *   - 1 LandingPage: slug "welcome" (PUBLISHED)
 *   - 1 Unsubscribe: test@example.com
 *
 * Usage:
 *   tsx scripts/seed-marketing-acme.ts --slug acme
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { PrismaClient } from "../src/lib/db/generated/tenant";
import { recalcSegment } from "../src/lib/marketing/segments";
import { enrollContacts } from "../src/lib/marketing/campaign";

function fail(msg: string): never {
  console.error(`\n[seed-marketing] ERROR: ${msg}\n`);
  process.exit(1);
}

function parseSlug(argv: string[]): string {
  let slug: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--slug") slug = argv[++i];
  }
  if (!slug) fail("Missing --slug. Usage: tsx scripts/seed-marketing-acme.ts --slug acme");
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

const LANDING_HTML = `<main style="max-width:640px;margin:0 auto;padding:48px 24px;font-family:sans-serif;color:#1a2733">
  <h1 style="font-size:32px;margin:0 0 12px">Welcome to Acme</h1>
  <p style="font-size:16px;line-height:1.6;color:#566573">Thanks for stopping by. We help teams move faster with less busywork. Leave your email and we will be in touch.</p>
  <a href="#" style="display:inline-block;margin-top:20px;padding:12px 20px;background:#1d77bd;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">Get started</a>
</main>`;

const LANDING_CSS = `body{margin:0;background:#f4f6f8}`;

async function main() {
  const slug = parseSlug(process.argv.slice(2));
  const schema = schemaNameForSlug(slug);
  console.log(`[seed-marketing] seeding tenant "${slug}" -> schema "${schema}"`);

  const db = new PrismaClient({ datasources: { db: { url: connectionForSchema(schema) } } });
  try {
    await db.$executeRawUnsafe(`SET search_path TO "${schema}"`);

    // 1. Segments (find-or-create by name).
    const activeLeads =
      (await db.segment.findFirst({ where: { name: "Active Leads" } })) ??
      (await db.segment.create({
        data: {
          name: "Active Leads",
          description: "Leads in the NEW status.",
          entityType: "lead",
          filterJson: { combinator: "AND", rows: [{ field: "status", operator: "eq", value: "NEW" }] },
        },
      }));

    const allContacts =
      (await db.segment.findFirst({ where: { name: "All Contacts" } })) ??
      (await db.segment.create({
        data: {
          name: "All Contacts",
          description: "Every contact with an email address.",
          entityType: "contact",
          filterJson: { combinator: "AND", rows: [{ field: "email", operator: "is_set" }] },
        },
      }));

    // 2. Broadcast (DRAFT, targets All Contacts).
    const broadcast =
      (await db.broadcast.findFirst({ where: { name: "Welcome Email" } })) ??
      (await db.broadcast.create({
        data: {
          name: "Welcome Email",
          channel: "EMAIL",
          status: "DRAFT",
          subject: "Welcome to Acme",
          fromName: "Acme Team",
          bodyHtml: "<p>Hi there,</p><p>Thanks for joining us. We are glad to have you.</p>",
          bodyText: "Hi there, Thanks for joining us. We are glad to have you.",
          segmentId: allContacts.id,
        },
      }));

    // 3. Campaign (ACTIVE, MANUAL, targets Active Leads) with 3 steps.
    let campaign = await db.campaign.findFirst({ where: { name: "New Lead Drip" } });
    if (!campaign) {
      campaign = await db.campaign.create({
        data: {
          name: "New Lead Drip",
          description: "A short welcome sequence for newly captured leads.",
          status: "ACTIVE",
          triggerType: "MANUAL",
          triggerConfigJson: {},
          segmentId: activeLeads.id,
        },
      });
    }
    const stepCount = await db.campaignStep.count({ where: { campaignId: campaign.id } });
    if (stepCount === 0) {
      await db.campaignStep.create({
        data: {
          campaignId: campaign.id,
          order: 0,
          type: "EMAIL",
          config: { subject: "Welcome aboard", body: "<p>Thanks for your interest. Here is how to get started.</p>" },
        },
      });
      await db.campaignStep.create({
        data: { campaignId: campaign.id, order: 1, type: "WAIT", config: { days: 2, hours: 0 } },
      });
      await db.campaignStep.create({
        data: {
          campaignId: campaign.id,
          order: 2,
          type: "EMAIL",
          config: { subject: "Checking in", body: "<p>Just following up. Let us know if you have questions.</p>" },
        },
      });
    }

    // 4. Landing page (PUBLISHED, slug welcome).
    const landing =
      (await db.landingPage.findUnique({ where: { slug: "welcome" } })) ??
      (await db.landingPage.create({
        data: {
          slug: "welcome",
          title: "Welcome to Acme",
          status: "PUBLISHED",
          htmlContent: LANDING_HTML,
          cssContent: LANDING_CSS,
          metaTitle: "Welcome to Acme",
          metaDescription: "Get started with Acme in minutes.",
          publishedAt: new Date(),
        },
      }));

    // 5. Unsubscribe (test address).
    const unsub = await db.unsubscribe.upsert({
      where: { email: "test@example.com" },
      update: {},
      create: { email: "test@example.com", reason: "Seed fixture.", source: "MANUAL" },
    });

    // Recalculate cached segment counts and enroll the active campaign's segment.
    await recalcSegment(db, activeLeads.id);
    await recalcSegment(db, allContacts.id);
    const leadRecipients = await db.lead.findMany({ where: { status: "NEW" }, select: { id: true } });
    const enrolled = await enrollContacts(db, campaign.id, leadRecipients.map((l) => ({ entityType: "lead" as const, id: l.id })));

    const [segments, broadcasts, campaigns, steps, landingPages, unsubs, enrollments] = await Promise.all([
      db.segment.count(),
      db.broadcast.count(),
      db.campaign.count(),
      db.campaignStep.count(),
      db.landingPage.count(),
      db.unsubscribe.count(),
      db.campaignEnrollment.count(),
    ]);

    console.log(
      `[seed-marketing] done. ids -> activeLeads=${activeLeads.id} allContacts=${allContacts.id} broadcast=${broadcast.id} campaign=${campaign.id} landing=${landing.id} unsub=${unsub.id}`,
    );
    console.log(
      `[seed-marketing] counts -> segments=${segments} broadcasts=${broadcasts} campaigns=${campaigns} campaignSteps=${steps} landingPages=${landingPages} unsubscribes=${unsubs} enrollments=${enrollments} (newlyEnrolled=${enrolled})`,
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error("[seed-marketing] failed", err);
  process.exit(1);
});
