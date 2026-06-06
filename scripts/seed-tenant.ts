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

const COMPANIES = [
  { name: "Northwind Trading", domain: "northwind.example", industry: "Wholesale", size: "SIZE_51_200" as const, website: "https://northwind.example", phone: "+1-555-0301" },
  { name: "Brightpath Logistics", domain: "brightpath.example", industry: "Logistics", size: "SIZE_201_1000" as const, website: "https://brightpath.example", phone: "+1-555-0302" },
  { name: "Summit Labs", domain: "summitlabs.example", industry: "Biotech", size: "SIZE_11_50" as const, website: "https://summitlabs.example", phone: "+1-555-0303" },
  { name: "Cedar Financial", domain: "cedarfin.example", industry: "Finance", size: "SIZE_1000_PLUS" as const, website: "https://cedarfin.example", phone: "+1-555-0304" },
  { name: "Acme Manufacturing", domain: "acme-mfg.example", industry: "Manufacturing", size: "SIZE_1_10" as const, website: "https://acme-mfg.example", phone: "+1-555-0305" },
];

const TAGS = [
  { name: "Hot", color: "#e5484d" },
  { name: "Warm", color: "#f5a623" },
  { name: "Cold", color: "#1d77bd" },
];

const CUSTOM_FIELDS = [
  { entityType: "LEAD" as const, key: "lead_score", label: "Lead Score", type: "NUMBER" as const, order: 0 },
  { entityType: "LEAD" as const, key: "source_campaign", label: "Source Campaign", type: "TEXT" as const, order: 1 },
  { entityType: "DEAL" as const, key: "contract_term", label: "Contract Term", type: "SELECT" as const, order: 0, options: ["Monthly", "Annual", "Multi-year"] },
  { entityType: "DEAL" as const, key: "renewal_date", label: "Renewal Date", type: "DATE" as const, order: 1 },
  { entityType: "CONTACT" as const, key: "linkedin_url", label: "LinkedIn", type: "URL" as const, order: 0 },
  { entityType: "CONTACT" as const, key: "preferred_channel", label: "Preferred Channel", type: "SELECT" as const, order: 1, options: ["Email", "Phone", "SMS"] },
  { entityType: "COMPANY" as const, key: "annual_revenue", label: "Annual Revenue", type: "NUMBER" as const, order: 0 },
  { entityType: "COMPANY" as const, key: "is_strategic", label: "Strategic Account", type: "BOOLEAN" as const, order: 1 },
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

    // 5. Companies - upsert by unique name (idempotent), then link the seeded
    //    contacts to the matching company by domain.
    const companyByDomain = new Map<string, string>();
    for (const c of COMPANIES) {
      const existing = await db.company.findFirst({ where: { name: c.name } });
      const company = existing
        ? await db.company.update({ where: { id: existing.id }, data: c })
        : await db.company.create({ data: c });
      if (company.domain) companyByDomain.set(company.domain, company.id);
    }
    console.log(`[seed-tenant] ${COMPANIES.length} companies ready`);

    const unlinkedContacts = await db.contact.findMany({ where: { companyId: null } });
    let linked = 0;
    for (const contact of unlinkedContacts) {
      const domain = contact.email?.split("@")[1];
      const companyId = domain ? companyByDomain.get(domain) : undefined;
      if (companyId) {
        await db.contact.update({ where: { id: contact.id }, data: { companyId } });
        linked++;
      }
    }
    console.log(`[seed-tenant] linked ${linked} contacts to companies`);

    // 6. Tags - upsert by unique name.
    for (const t of TAGS) {
      await db.tag.upsert({ where: { name: t.name }, create: t, update: { color: t.color } });
    }
    console.log(`[seed-tenant] ${TAGS.length} tags ready`);

    // 7. Custom fields - upsert by unique (entityType, key).
    for (const f of CUSTOM_FIELDS) {
      const { entityType, key, options, ...rest } = f;
      await db.customField.upsert({
        where: { entityType_key: { entityType, key } },
        create: { entityType, key, ...rest, required: false, options: (options ?? undefined) as never },
        update: { ...rest, options: (options ?? undefined) as never },
      });
    }
    console.log(`[seed-tenant] ${CUSTOM_FIELDS.length} custom fields ready`);

    // 8. Automation - one sample "New Lead -> Create Welcome Task" plus two
    //    historical run rows. Seeded only when no automation exists.
    const automationCount = await db.automation.count();
    if (automationCount === 0) {
      const automation = await db.automation.create({
        data: {
          name: "New Lead -> Create Welcome Task",
          description: "When a lead is created, schedule a welcome call for the next day.",
          enabled: true,
          triggerType: "RECORD_CREATED",
          entityType: "LEAD",
          conditions: { combinator: "AND", rows: [] } as never,
          actions: [
            {
              kind: "CREATE_ACTIVITY",
              config: {
                activityType: "TASK",
                subject: "Welcome call: {{record.name}}",
                dueOffsetDays: 1,
              },
            },
          ] as never,
        },
      });
      await db.automationRun.create({
        data: {
          automationId: automation.id,
          entityType: "LEAD",
          status: "SUCCESS",
          finishedAt: new Date(),
          actionsExecuted: [{ kind: "CREATE_ACTIVITY", status: "done", detail: "Welcome call" }] as never,
        },
      });
      await db.automationRun.create({
        data: {
          automationId: automation.id,
          entityType: "LEAD",
          status: "SKIPPED",
          finishedAt: new Date(),
          actionsExecuted: [] as never,
        },
      });
      console.log(`[seed-tenant] inserted 1 automation + 2 runs`);
    } else {
      console.log(`[seed-tenant] automations already present (${automationCount}); skipping insert`);
    }

    // 9. Saved report - one sample custom report. Seeded only when none exist.
    const reportCount = await db.savedReport.count();
    if (reportCount === 0) {
      await db.savedReport.create({
        data: {
          name: "My Deals by Stage",
          definition: {
            entity: "DEAL",
            columns: [],
            filters: [],
            groupBy: "stageId",
            aggregation: "count",
            aggregateField: null,
            chart: "bar",
          } as never,
        },
      });
      console.log(`[seed-tenant] inserted 1 saved report`);
    } else {
      console.log(`[seed-tenant] saved reports already present (${reportCount}); skipping insert`);
    }

    // Summary
    const [pipelines, stages, contacts, leads, deals, companies, tags, customFields, automations, automationRuns, savedReports] = await Promise.all([
      db.pipeline.count(),
      db.dealStage.count(),
      db.contact.count(),
      db.lead.count(),
      db.deal.count(),
      db.company.count(),
      db.tag.count(),
      db.customField.count(),
      db.automation.count(),
      db.automationRun.count(),
      db.savedReport.count(),
    ]);
    console.log(
      `[seed-tenant] done. counts -> pipelines=${pipelines} stages=${stages} contacts=${contacts} leads=${leads} deals=${deals} companies=${companies} tags=${tags} customFields=${customFields} automations=${automations} automationRuns=${automationRuns} savedReports=${savedReports}`,
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
