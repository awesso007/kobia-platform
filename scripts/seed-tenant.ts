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
    // Raw queries below ($executeRawUnsafe for GENERATED-column inserts) do not
    // honor the ?schema= connection param, so pin the search_path explicitly.
    await db.$executeRawUnsafe(`SET search_path TO "${schema}"`);
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

    // 10. Memberships (Sprint 5 RBAC) - upsert by unique clerkUserId.
    const MEMBERS = [
      { clerkUserId: "user_acme_owner_seed", role: "OWNER" as const, email: "owner@acme.test", displayName: "Acme Owner" },
      { clerkUserId: "user_acme_admin_seed", role: "ADMIN" as const, email: "admin@acme.test", displayName: "Acme Admin" },
      { clerkUserId: "user_acme_member1_seed", role: "MEMBER" as const, email: "member1@acme.test", displayName: "Acme Member One" },
      { clerkUserId: "user_acme_member2_seed", role: "MEMBER" as const, email: "member2@acme.test", displayName: "Acme Member Two" },
      { clerkUserId: "user_acme_viewer_seed", role: "VIEWER" as const, email: "viewer@acme.test", displayName: "Acme Viewer" },
    ];
    for (const m of MEMBERS) {
      await db.membership.upsert({
        where: { clerkUserId: m.clerkUserId },
        create: { ...m, status: "ACTIVE" },
        update: { role: m.role, email: m.email, displayName: m.displayName, status: "ACTIVE" },
      });
    }
    console.log(`[seed-tenant] ${MEMBERS.length} memberships ready`);

    // 11. WebForm (Sprint 5 web-to-lead) - upsert by unique slug.
    await db.webForm.upsert({
      where: { slug: "contact" },
      create: {
        slug: "contact",
        name: "Contact Us",
        fieldsConfig: [
          { fieldName: "name", label: "Name", type: "text", required: true },
          { fieldName: "email", label: "Email", type: "email", required: true },
          { fieldName: "phone", label: "Phone", type: "tel", required: false },
          { fieldName: "message", label: "Message", type: "textarea", required: false },
        ] as never,
      },
      update: {},
    });
    console.log(`[seed-tenant] web form "contact" ready`);

    // 12. Notification (Sprint 5) - one unread notification for the OWNER.
    const notifCount = await db.notification.count();
    if (notifCount === 0) {
      await db.notification.create({
        data: {
          clerkUserId: "user_acme_owner_seed",
          type: "SYSTEM",
          title: "Welcome to KOBIA CRM",
          body: "Your workspace is ready. Invite your team from Settings -> Team.",
          linkUrl: "/app/settings/team",
        },
      });
      console.log(`[seed-tenant] inserted 1 notification`);
    } else {
      console.log(`[seed-tenant] notifications already present (${notifCount}); skipping insert`);
    }

    // 13. Email (Sprint 6) - one paused SMTP/IMAP account, two templates, one
    //     default signature, and one thread with two messages on a seeded deal.
    const OWNER = "user_acme_owner_seed";
    const emailAccountCount = await db.emailAccount.count();
    if (emailAccountCount === 0) {
      const account = await db.emailAccount.create({
        data: {
          ownerClerkUserId: OWNER,
          address: "owner@acme.test",
          displayName: "Acme Owner",
          provider: "SMTP_IMAP",
          status: "PAUSED",
          smtpHost: "smtp.example.test",
          smtpPort: 587,
          smtpUser: "owner@acme.test",
          imapHost: "imap.example.test",
          imapPort: 993,
          imapUser: "owner@acme.test",
        },
      });
      console.log(`[seed-tenant] inserted 1 email account`);

      await db.emailTemplate.create({
        data: {
          name: "Welcome",
          subject: "Welcome to Acme, {{contact.firstName}}",
          bodyHtml: "<p>Hi {{contact.firstName}},</p><p>Thanks for getting in touch. We are glad to have you.</p>",
          scope: "TENANT",
        },
      });
      await db.emailTemplate.create({
        data: {
          name: "Follow-up",
          subject: "Following up on {{deal.name}}",
          bodyHtml: "<p>Hi {{contact.firstName}},</p><p>Just following up on {{deal.name}}. Let me know your thoughts.</p>",
          scope: "TENANT",
        },
      });
      console.log(`[seed-tenant] inserted 2 email templates`);

      await db.emailSignature.create({
        data: {
          ownerClerkUserId: OWNER,
          html: "<p>--<br/>Acme Owner<br/>Acme Inc.</p>",
          isDefault: true,
        },
      });
      console.log(`[seed-tenant] inserted 1 email signature`);

      const seededDeal = await db.deal.findFirst({ orderBy: { createdAt: "asc" }, include: { contact: true } });
      if (seededDeal) {
        const counterparty = seededDeal.contact?.email ?? "client@example.test";
        const now = new Date();
        const earlier = new Date(now.getTime() - 60 * 60 * 1000);
        const thread = await db.emailThread.create({
          data: {
            subject: `Re: ${seededDeal.name}`,
            lastMessageAt: now,
            recordType: "DEAL",
            recordId: seededDeal.id,
            accountId: account.id,
            messageCount: 2,
            unreadCount: 1,
          },
        });
        await db.emailMessage.create({
          data: {
            threadId: thread.id,
            accountId: account.id,
            direction: "OUTBOUND",
            fromAddress: "owner@acme.test",
            toAddresses: [counterparty],
            subject: `Re: ${seededDeal.name}`,
            bodyHtml: "<p>Hi, sharing a quick proposal for your review. Let me know if the pricing works.</p>",
            snippet: "Hi, sharing a quick proposal for your review.",
            sentAt: earlier,
            status: "SENT",
          },
        });
        await db.emailMessage.create({
          data: {
            threadId: thread.id,
            accountId: account.id,
            direction: "INBOUND",
            fromAddress: counterparty,
            toAddresses: ["owner@acme.test"],
            subject: `Re: ${seededDeal.name}`,
            bodyHtml: "<p>Thanks, this looks great. Can we hop on a call next week?</p>",
            snippet: "Thanks, this looks great. Can we hop on a call next week?",
            receivedAt: now,
            status: "DELIVERED",
          },
        });
        console.log(`[seed-tenant] inserted 1 email thread + 2 messages on deal "${seededDeal.name}"`);
      }
    } else {
      console.log(`[seed-tenant] email accounts already present (${emailAccountCount}); skipping insert`);
    }

    // 14. Telephony + SMS (Sprint 7) - one phone number assigned to the OWNER,
    //     one VOICE routing rule, one OWNER UserPreference, one SMS thread with
    //     three messages on a seeded contact, and two historical calls. Seeded
    //     only when no phone number exists.
    const phoneNumberCount = await db.phoneNumber.count();
    if (phoneNumberCount === 0) {
      const number = await db.phoneNumber.create({
        data: {
          e164: "+15551234567",
          friendlyName: "Acme Main Line",
          type: "LOCAL",
          provider: "TWILIO",
          status: "ACTIVE",
          assignedClerkUserId: OWNER,
          monthlyPriceCents: 115,
          purchasedAt: new Date(),
        },
      });
      console.log(`[seed-tenant] inserted 1 phone number`);

      await db.telephonyRule.create({
        data: {
          phoneNumberId: number.id,
          kind: "VOICE",
          config: { mode: "ring" } as never,
        },
      });
      console.log(`[seed-tenant] inserted 1 telephony rule`);

      await db.userPreference.upsert({
        where: { clerkUserId: OWNER },
        create: {
          clerkUserId: OWNER,
          receiveCallNotifications: true,
          defaultOutboundNumberId: number.id,
        },
        update: { defaultOutboundNumberId: number.id },
      });
      console.log(`[seed-tenant] user preference ready for owner`);

      const smsContact = await db.contact.findFirst({ orderBy: { createdAt: "asc" } });
      const peerE164 = smsContact?.phone?.replace(/[^+\d]/g, "") || "+15555550101";
      const now = new Date();
      const t1 = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      const t2 = new Date(now.getTime() - 90 * 60 * 1000);
      const t3 = new Date(now.getTime() - 60 * 60 * 1000);
      const thread = await db.smsThread.create({
        data: {
          contactId: smsContact?.id ?? null,
          ourNumberE164: number.e164,
          peerE164,
          lastMessageAt: t3,
          messageCount: 3,
          unreadCount: 1,
        },
      });
      await db.smsMessage.create({
        data: {
          threadId: thread.id,
          direction: "OUTBOUND",
          fromE164: number.e164,
          toE164: peerE164,
          body: "Hi, this is Acme following up on your enquiry. Is now a good time to chat?",
          status: "DELIVERED",
          sentAt: t1,
          deliveredAt: t1,
        },
      });
      await db.smsMessage.create({
        data: {
          threadId: thread.id,
          direction: "INBOUND",
          fromE164: peerE164,
          toE164: number.e164,
          body: "Yes, please give me a call this afternoon.",
          status: "DELIVERED",
          deliveredAt: t2,
        },
      });
      await db.smsMessage.create({
        data: {
          threadId: thread.id,
          direction: "OUTBOUND",
          fromE164: number.e164,
          toE164: peerE164,
          body: "Great, I will ring you around 3pm. Talk soon.",
          status: "DELIVERED",
          sentAt: t3,
          deliveredAt: t3,
        },
      });
      console.log(`[seed-tenant] inserted 1 SMS thread + 3 messages`);

      await db.call.create({
        data: {
          direction: "INBOUND",
          fromE164: peerE164,
          toE164: number.e164,
          status: "COMPLETED",
          ownerClerkUserId: OWNER,
          contactId: smsContact?.id ?? null,
          startedAt: t2,
          answeredAt: t2,
          endedAt: new Date(t2.getTime() + 4 * 60 * 1000),
          durationSec: 240,
        },
      });
      await db.call.create({
        data: {
          direction: "OUTBOUND",
          fromE164: number.e164,
          toE164: peerE164,
          status: "NO_ANSWER",
          ownerClerkUserId: OWNER,
          contactId: smsContact?.id ?? null,
          startedAt: t3,
          endedAt: new Date(t3.getTime() + 30 * 1000),
          durationSec: 0,
        },
      });
      console.log(`[seed-tenant] inserted 2 calls`);
    } else {
      console.log(`[seed-tenant] phone numbers already present (${phoneNumberCount}); skipping insert`);
    }

    // 15. Files (Sprint 8) - one "Marketing" folder, three sample files (LOCAL,
    //     READY, MANUAL with fake storage keys), two attachments (to a seeded
    //     deal and contact), and one active public share link (no password).
    //     Seeded only when no file exists.
    const fileCount = await db.file.count();
    if (fileCount === 0) {
      const folder = await db.fileFolder.create({ data: { name: "Marketing" } });
      console.log(`[seed-tenant] inserted 1 file folder "Marketing"`);

      const png = await db.file.create({
        data: {
          name: "brand-logo.png",
          mimeType: "image/png",
          size: BigInt(50 * 1024),
          storageProvider: "LOCAL",
          storageKey: "tenants/acme/2026/06/seed-0001__brand-logo.png",
          status: "READY",
          source: "MANUAL",
          folderId: folder.id,
          uploadedByClerkUserId: OWNER,
        },
      });
      const pdf = await db.file.create({
        data: {
          name: "proposal.pdf",
          mimeType: "application/pdf",
          size: BigInt(200 * 1024),
          storageProvider: "LOCAL",
          storageKey: "tenants/acme/2026/06/seed-0002__proposal.pdf",
          status: "READY",
          source: "MANUAL",
          folderId: folder.id,
          uploadedByClerkUserId: OWNER,
        },
      });
      const docx = await db.file.create({
        data: {
          name: "contract.docx",
          mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          size: BigInt(80 * 1024),
          storageProvider: "LOCAL",
          storageKey: "tenants/acme/2026/06/seed-0003__contract.docx",
          status: "READY",
          source: "MANUAL",
          uploadedByClerkUserId: OWNER,
        },
      });
      console.log(`[seed-tenant] inserted 3 files`);

      const seededDeal = await db.deal.findFirst({ orderBy: { createdAt: "asc" } });
      const seededContact = await db.contact.findFirst({ orderBy: { createdAt: "asc" } });
      if (seededDeal) {
        await db.fileAttachment.create({
          data: { fileId: pdf.id, entityType: "DEAL", entityId: seededDeal.id, attachedByClerkUserId: OWNER },
        });
      }
      if (seededContact) {
        await db.fileAttachment.create({
          data: { fileId: png.id, entityType: "CONTACT", entityId: seededContact.id, attachedByClerkUserId: OWNER },
        });
      }
      console.log(`[seed-tenant] inserted 2 file attachments`);

      await db.fileShareLink.create({
        data: {
          fileId: docx.id,
          slug: "acmesharedoc",
          downloadCount: 0,
          createdByClerkUserId: OWNER,
        },
      });
      console.log(`[seed-tenant] inserted 1 file share link`);
    } else {
      console.log(`[seed-tenant] files already present (${fileCount}); skipping insert`);
    }

    // 14. Saved views (Sprint 9) - two tenant-scoped views. "Hot Leads" filters
    //     leads to the Hot tag; "Closing this month" filters deals to the
    //     Proposal + Won stages. Upsert-by-(entityType,name) via find-then-write
    //     so re-running the seed stays idempotent.
    const hotTag = await db.tag.findFirst({ where: { name: "Hot" } });
    const proposalStageId = stageByName.get("Proposal");
    const wonStageId = stageByName.get("Won");

    const SAVED_VIEWS = [
      {
        entityType: "LEAD" as const,
        name: "Hot Leads",
        scope: "TENANT" as const,
        filters: { tag: hotTag?.id ?? "" },
        columns: ["name", "source", "status", "owner", "tags", "created"],
        sortBy: "createdAt",
        sortDir: "DESC" as const,
      },
      {
        entityType: "DEAL" as const,
        name: "Closing this month",
        scope: "TENANT" as const,
        filters: { stage: [proposalStageId, wonStageId].filter(Boolean) },
        columns: ["name", "amount", "stage", "owner", "created"],
        sortBy: "createdAt",
        sortDir: "DESC" as const,
      },
    ];
    for (const v of SAVED_VIEWS) {
      const existing = await db.savedView.findFirst({ where: { entityType: v.entityType, name: v.name } });
      const data = {
        entityType: v.entityType as never,
        name: v.name,
        scope: v.scope as never,
        filters: v.filters as never,
        columns: v.columns as never,
        sortBy: v.sortBy,
        sortDir: v.sortDir as never,
      };
      if (existing) await db.savedView.update({ where: { id: existing.id }, data });
      else await db.savedView.create({ data });
    }
    console.log(`[seed-tenant] ${SAVED_VIEWS.length} saved views ready`);

    // 17. Products + categories (Sprint 10) - 2 categories, 5 products. Upsert
    //     categories by unique name and products by unique sku so re-runs do not
    //     duplicate.
    const PRODUCT_CATEGORIES = [
      { name: "Software", sortOrder: 0 },
      { name: "Services", sortOrder: 1 },
    ];
    for (const c of PRODUCT_CATEGORIES) {
      await db.productCategory.upsert({ where: { name: c.name }, create: c, update: { sortOrder: c.sortOrder } });
    }
    const PRODUCTS = [
      { sku: "SW-PRO", name: "KOBIA Pro License", type: "RECURRING_MONTHLY" as const, unitPriceCents: 9900, category: "Software", description: "Per-seat monthly license." },
      { sku: "SW-ENT", name: "KOBIA Enterprise License", type: "RECURRING_YEARLY" as const, unitPriceCents: 990000, category: "Software", description: "Annual enterprise license." },
      { sku: "SVC-ONB", name: "Onboarding Package", type: "ONE_TIME" as const, unitPriceCents: 250000, category: "Services", description: "Guided onboarding and data import." },
      { sku: "SVC-TRN", name: "Training Day", type: "SERVICE" as const, unitPriceCents: 120000, category: "Services", description: "One day of on-site training." },
      { sku: "SVC-SUP", name: "Priority Support", type: "RECURRING_MONTHLY" as const, unitPriceCents: 49900, category: "Services", description: "Priority support retainer." },
    ];
    const productBySku = new Map<string, { id: string; name: string; unitPriceCents: number }>();
    for (const p of PRODUCTS) {
      const product = await db.product.upsert({
        where: { sku: p.sku },
        create: p,
        update: { name: p.name, type: p.type, unitPriceCents: p.unitPriceCents, category: p.category, description: p.description },
      });
      productBySku.set(product.sku, { id: product.id, name: product.name, unitPriceCents: product.unitPriceCents });
    }
    console.log(`[seed-tenant] ${PRODUCT_CATEGORIES.length} product categories + ${PRODUCTS.length} products ready`);

    // 18. Deal line items (Sprint 10) - attach line items to the two seeded
    //     deals. lineTotalCents is a GENERATED column and must NOT be written,
    //     so we insert via raw SQL listing only the input columns. Seeded only
    //     when no deal line item exists.
    const dealLineItemCount = await db.dealLineItem.count();
    if (dealLineItemCount === 0) {
      const seededDeals = await db.deal.findMany({ orderBy: { createdAt: "asc" }, take: 2 });
      const pro = productBySku.get("SW-PRO")!;
      const onb = productBySku.get("SVC-ONB")!;
      const sup = productBySku.get("SVC-SUP")!;
      const trn = productBySku.get("SVC-TRN")!;
      const lineSpecs: Array<{ dealId: string; productId: string; name: string; quantity: number; unitPriceCents: number; sortOrder: number }> = [];
      if (seededDeals[0]) {
        lineSpecs.push({ dealId: seededDeals[0].id, productId: pro.id, name: pro.name, quantity: 10, unitPriceCents: pro.unitPriceCents, sortOrder: 0 });
        lineSpecs.push({ dealId: seededDeals[0].id, productId: onb.id, name: onb.name, quantity: 1, unitPriceCents: onb.unitPriceCents, sortOrder: 1 });
      }
      if (seededDeals[1]) {
        lineSpecs.push({ dealId: seededDeals[1].id, productId: sup.id, name: sup.name, quantity: 1, unitPriceCents: sup.unitPriceCents, sortOrder: 0 });
        lineSpecs.push({ dealId: seededDeals[1].id, productId: trn.id, name: trn.name, quantity: 2, unitPriceCents: trn.unitPriceCents, sortOrder: 1 });
      }
      for (const l of lineSpecs) {
        const id = `seedli_${l.dealId.slice(-6)}_${l.sortOrder}`;
        await db.$executeRawUnsafe(
          `INSERT INTO "DealLineItem" ("id","dealId","productId","name","quantity","unitPriceCents","discountPct","taxRatePct","sortOrder","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,0,0,$7, now(), now())`,
          id, l.dealId, l.productId, l.name, l.quantity, l.unitPriceCents, l.sortOrder,
        );
      }
      console.log(`[seed-tenant] inserted ${lineSpecs.length} deal line items`);
    } else {
      console.log(`[seed-tenant] deal line items already present (${dealLineItemCount}); skipping insert`);
    }

    // 19. Quote template + quotes (Sprint 10) - one template, two quotes (one
    //     SENT, one ACCEPTED) with line items. lineTotalCents on QuoteLineItem
    //     is also GENERATED, so line items go in via raw SQL. Parent quote
    //     subtotal/tax/total are recomputed in app code. Seeded only when no
    //     quote exists.
    const quoteTemplateCount = await db.quoteTemplate.count();
    let templateId: string;
    if (quoteTemplateCount === 0) {
      const template = await db.quoteTemplate.create({
        data: {
          name: "Standard Quote",
          htmlTemplate: "<div>{{quote.title}}</div>",
          defaultTerms: "Payment due within 30 days of acceptance.",
          defaultNotes: "Thank you for your business.",
          primaryColor: "#1d77bd",
        },
      });
      templateId = template.id;
      console.log(`[seed-tenant] inserted 1 quote template`);
    } else {
      const t = await db.quoteTemplate.findFirst({ orderBy: { createdAt: "asc" } });
      templateId = t!.id;
      console.log(`[seed-tenant] quote templates already present (${quoteTemplateCount}); skipping insert`);
    }

    const quoteCount = await db.quote.count();
    if (quoteCount === 0) {
      const seededDeals = await db.deal.findMany({ orderBy: { createdAt: "asc" }, take: 2, include: { contact: true } });
      const pro = productBySku.get("SW-PRO")!;
      const ent = productBySku.get("SW-ENT")!;
      const onb = productBySku.get("SVC-ONB")!;
      const now = new Date();

      const quoteSpecs = [
        {
          number: "Q-202606-0001",
          publicSlug: "acme-quote-0001",
          title: "Northwind annual proposal",
          status: "SENT" as const,
          sentAt: now,
          deal: seededDeals[0],
          taxRatePct: 0,
          lines: [
            { product: pro, quantity: 10, sortOrder: 0 },
            { product: onb, quantity: 1, sortOrder: 1 },
          ],
        },
        {
          number: "Q-202606-0002",
          publicSlug: "acme-quote-0002",
          title: "Brightpath enterprise proposal",
          status: "ACCEPTED" as const,
          sentAt: new Date(now.getTime() - 3 * 86_400_000),
          acceptedAt: now,
          deal: seededDeals[1],
          taxRatePct: 0,
          lines: [
            { product: ent, quantity: 1, sortOrder: 0 },
          ],
        },
      ];

      for (const q of quoteSpecs) {
        const subtotalCents = q.lines.reduce((sum, l) => sum + l.product.unitPriceCents * l.quantity, 0);
        const quote = await db.quote.create({
          data: {
            number: q.number,
            publicSlug: q.publicSlug,
            title: q.title,
            status: q.status,
            sentAt: q.sentAt ?? null,
            acceptedAt: (q as { acceptedAt?: Date }).acceptedAt ?? null,
            templateId,
            dealId: q.deal?.id ?? null,
            contactId: q.deal?.contactId ?? null,
            subtotalCents,
            discountCents: 0,
            taxCents: 0,
            totalCents: subtotalCents,
            notes: "Thank you for your business.",
            termsAndConditions: "Payment due within 30 days of acceptance.",
          },
        });
        for (const l of q.lines) {
          const id = `seedqli_${quote.id.slice(-6)}_${l.sortOrder}`;
          await db.$executeRawUnsafe(
            `INSERT INTO "QuoteLineItem" ("id","quoteId","productId","name","quantity","unitPriceCents","discountPct","taxRatePct","sortOrder") VALUES ($1,$2,$3,$4,$5,$6,0,0,$7)`,
            id, quote.id, l.product.id, l.product.name, l.quantity, l.product.unitPriceCents, l.sortOrder,
          );
        }
      }
      console.log(`[seed-tenant] inserted ${quoteSpecs.length} quotes + line items`);
    } else {
      console.log(`[seed-tenant] quotes already present (${quoteCount}); skipping insert`);
    }

    // 20. Lead pipeline (Sprint 10) - a LEAD-type pipeline with three stages so
    //     the Leads kanban has a board. Upsert by unique name.
    const leadPipeline = await db.pipeline.upsert({
      where: { name: "Lead Qualification" },
      create: { name: "Lead Qualification", entityType: "LEAD", isDefault: false, order: 1 },
      update: { entityType: "LEAD" },
    });
    const LEAD_STAGES = [
      { name: "Inbox", sortOrder: 0, wonOrLost: "OPEN" as const, probability: 0 },
      { name: "Working", sortOrder: 1, wonOrLost: "OPEN" as const, probability: 30 },
      { name: "Qualified", sortOrder: 2, wonOrLost: "WON" as const, probability: 100 },
    ];
    for (const s of LEAD_STAGES) {
      const existing = await db.dealStage.findFirst({ where: { pipelineId: leadPipeline.id, name: s.name } });
      if (existing) await db.dealStage.update({ where: { id: existing.id }, data: s });
      else await db.dealStage.create({ data: { ...s, pipelineId: leadPipeline.id } });
    }
    console.log(`[seed-tenant] lead pipeline "Lead Qualification" + ${LEAD_STAGES.length} stages ready`);

    // Summary
    const savedViews = await db.savedView.count();
    const [pipelines, stages, contacts, leads, deals, companies, tags, customFields, automations, automationRuns, savedReports, memberships, webForms, notifications, emailAccounts, emailTemplates, emailSignatures, emailThreads, emailMessages, phoneNumbers, calls, smsThreads, smsMessages, telephonyRules, userPreferences, files, fileFolders, fileAttachments, fileShareLinks, productCategories, products, dealLineItems, quoteTemplates, quotes, quoteLineItems, leadPipelines] = await Promise.all([
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
      db.membership.count(),
      db.webForm.count(),
      db.notification.count(),
      db.emailAccount.count(),
      db.emailTemplate.count(),
      db.emailSignature.count(),
      db.emailThread.count(),
      db.emailMessage.count(),
      db.phoneNumber.count(),
      db.call.count(),
      db.smsThread.count(),
      db.smsMessage.count(),
      db.telephonyRule.count(),
      db.userPreference.count(),
      db.file.count(),
      db.fileFolder.count(),
      db.fileAttachment.count(),
      db.fileShareLink.count(),
      db.productCategory.count(),
      db.product.count(),
      db.dealLineItem.count(),
      db.quoteTemplate.count(),
      db.quote.count(),
      db.quoteLineItem.count(),
      db.pipeline.count({ where: { entityType: "LEAD" } }),
    ]);
    console.log(
      `[seed-tenant] done. counts -> pipelines=${pipelines} stages=${stages} contacts=${contacts} leads=${leads} deals=${deals} companies=${companies} tags=${tags} customFields=${customFields} automations=${automations} automationRuns=${automationRuns} savedReports=${savedReports} memberships=${memberships} webForms=${webForms} notifications=${notifications} emailAccounts=${emailAccounts} emailTemplates=${emailTemplates} emailSignatures=${emailSignatures} emailThreads=${emailThreads} emailMessages=${emailMessages} phoneNumbers=${phoneNumbers} calls=${calls} smsThreads=${smsThreads} smsMessages=${smsMessages} telephonyRules=${telephonyRules} userPreferences=${userPreferences} files=${files} fileFolders=${fileFolders} fileAttachments=${fileAttachments} fileShareLinks=${fileShareLinks} savedViews=${savedViews} productCategories=${productCategories} products=${products} dealLineItems=${dealLineItems} quoteTemplates=${quoteTemplates} quotes=${quotes} quoteLineItems=${quoteLineItems} leadPipelines=${leadPipelines}`,
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
