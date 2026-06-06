/*
 * seed-tenant.ts - populate a tenant schema with starter CRM data (Sprint 2).
 *
 * Given a slug, this script seeds the tenant_<slug> Postgres schema with:
 *   - 1 "Default Sales Pipeline" (isDefault) + 5 stages
 *       New / Qualified / Proposal / Won (isWon) / Lost (isLost)
 *   - 3 sample contacts
 *   - 3 sample leads
 *   - 2 sample deals (in the default pipeline, linked to contacts)
 *
 * Usage:
 *   tsx scripts/seed-tenant.ts --slug acme
 *
 * Binds a PrismaClient directly to the tenant schema using DATABASE_URL (the
 * same approach as the app's tenant-prisma router). Idempotent: it upserts the
 * pipeline + stages by name and only inserts sample contacts/leads/deals when
 * the schema has none, so re-running does not duplicate rows.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { PrismaClient } from "../src/lib/db/generated/tenant";

type Args = { slug: string };

function parseArgs(argv: string[]): Args {
  const out: Partial<Args> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--slug") out.slug = argv[++i];
  }
  if (!out.slug) {
    fail("Missing --slug. Usage: tsx scripts/seed-tenant.ts --slug acme");
  }
  if (!/^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(out.slug!)) {
    fail(`Invalid slug "${out.slug}". Use lowercase letters, digits, and hyphens.`);
  }
  return out as Args;
}

function fail(msg: string): never {
  console.error(`\n[seed-tenant] ERROR: ${msg}\n`);
  process.exit(1);
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

const STAGES = [
  { name: "New", sortOrder: 0, isWon: false, isLost: false },
  { name: "Qualified", sortOrder: 1, isWon: false, isLost: false },
  { name: "Proposal", sortOrder: 2, isWon: false, isLost: false },
  { name: "Won", sortOrder: 3, isWon: true, isLost: false },
  { name: "Lost", sortOrder: 4, isWon: false, isLost: true },
];

const CONTACTS = [
  { firstName: "Maria", lastName: "Gomez", email: "maria.gomez@northwind.example", phone: "+1-555-0101", title: "VP Operations" },
  { firstName: "David", lastName: "Chen", email: "david.chen@brightpath.example", phone: "+1-555-0102", title: "Procurement Lead" },
  { firstName: "Aisha", lastName: "Khan", email: "aisha.khan@summitlabs.example", phone: "+1-555-0103", title: "Founder" },
];

const LEADS = [
  { name: "Northwind Trading", companyName: "Northwind Trading", email: "hello@northwind.example", phone: "+1-555-0201", source: "WEBSITE" as const, status: "NEW" as const, notes: "Inbound demo request from pricing page." },
  { name: "Brightpath Logistics", companyName: "Brightpath Logistics", email: "ops@brightpath.example", phone: "+1-555-0202", source: "REFERRAL" as const, status: "CONTACTED" as const, notes: "Referred by existing customer; wants a callback." },
  { name: "Summit Labs", companyName: "Summit Labs", email: "founder@summitlabs.example", phone: "+1-555-0203", source: "EVENT" as const, status: "QUALIFIED" as const, notes: "Met at SaaS Connect; budget confirmed." },
];

async function main() {
  const { slug } = parseArgs(process.argv.slice(2));
  const schema = schemaNameForSlug(slug);
  console.log(`[seed-tenant] seeding tenant "${slug}" -> schema "${schema}"`);

  const db = new PrismaClient({ datasources: { db: { url: connectionForSchema(schema) } } });
  try {
    // 1. Pipeline (upsert by unique name) + stages (idempotent by pipeline+name).
    const pipeline = await db.pipeline.upsert({
      where: { name: "Default Sales Pipeline" },
      create: { name: "Default Sales Pipeline", isDefault: true },
      update: { isDefault: true },
    });
    console.log(`[seed-tenant] pipeline ready: ${pipeline.name} (${pipeline.id})`);

    const stageByName = new Map<string, string>();
    for (const s of STAGES) {
      const existing = await db.dealStage.findFirst({ where: { pipelineId: pipeline.id, name: s.name } });
      const stage = existing
        ? await db.dealStage.update({ where: { id: existing.id }, data: s })
        : await db.dealStage.create({ data: { ...s, pipelineId: pipeline.id } });
      stageByName.set(stage.name, stage.id);
    }
    console.log(`[seed-tenant] ${STAGES.length} stages ready`);

    // 2. Contacts - only seed when the schema has none, to stay idempotent.
    const contactCount = await db.contact.count();
    const contactIds: string[] = [];
    if (contactCount === 0) {
      for (const c of CONTACTS) {
        const created = await db.contact.create({ data: c });
        contactIds.push(created.id);
      }
      console.log(`[seed-tenant] inserted ${CONTACTS.length} contacts`);
    } else {
      const existing = await db.contact.findMany({ take: CONTACTS.length, orderBy: { createdAt: "asc" } });
      contactIds.push(...existing.map((c) => c.id));
      console.log(`[seed-tenant] contacts already present (${contactCount}); skipping insert`);
    }

    // 3. Leads - only seed when none exist.
    const leadCount = await db.lead.count();
    if (leadCount === 0) {
      for (const l of LEADS) await db.lead.create({ data: l });
      console.log(`[seed-tenant] inserted ${LEADS.length} leads`);
    } else {
      console.log(`[seed-tenant] leads already present (${leadCount}); skipping insert`);
    }

    // 4. Deals - only seed when none exist.
    const dealCount = await db.deal.count();
    if (dealCount === 0) {
      const newStageId = stageByName.get("New")!;
      const qualifiedStageId = stageByName.get("Qualified")!;
      await db.deal.create({
        data: {
          name: "Northwind annual subscription",
          pipelineId: pipeline.id,
          stageId: newStageId,
          contactId: contactIds[0] ?? null,
          amountCents: BigInt(1_200_000),
          probabilityPct: 40,
        },
      });
      await db.deal.create({
        data: {
          name: "Brightpath onboarding package",
          pipelineId: pipeline.id,
          stageId: qualifiedStageId,
          contactId: contactIds[1] ?? null,
          amountCents: BigInt(450_000),
          probabilityPct: 60,
        },
      });
      console.log(`[seed-tenant] inserted 2 deals`);
    } else {
      console.log(`[seed-tenant] deals already present (${dealCount}); skipping insert`);
    }

    // Summary
    const [pipelines, stages, contacts, leads, deals] = await Promise.all([
      db.pipeline.count(),
      db.dealStage.count(),
      db.contact.count(),
      db.lead.count(),
      db.deal.count(),
    ]);
    console.log(
      `[seed-tenant] done. counts -> pipelines=${pipelines} stages=${stages} contacts=${contacts} leads=${leads} deals=${deals}`,
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
