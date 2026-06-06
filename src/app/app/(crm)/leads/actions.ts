"use server";

/*
 * Leads server actions. All DB access goes through getTenantDb() so the active
 * tenant is resolved from request headers (never by importing the tenant Prisma
 * client directly in a route handler).
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { revalidatePath } from "next/cache";
import { getTenantDb } from "@/lib/db/get-tenant-db";

const LEAD_SOURCES = ["WEBSITE", "REFERRAL", "CALL", "EMAIL", "EVENT", "OTHER"] as const;
const LEAD_STATUSES = ["NEW", "CONTACTED", "QUALIFIED", "UNQUALIFIED", "CONVERTED"] as const;
type LeadSource = (typeof LEAD_SOURCES)[number];
type LeadStatus = (typeof LEAD_STATUSES)[number];

function asSource(v: unknown): LeadSource {
  return LEAD_SOURCES.includes(v as LeadSource) ? (v as LeadSource) : "WEBSITE";
}
function asStatus(v: unknown): LeadStatus {
  return LEAD_STATUSES.includes(v as LeadStatus) ? (v as LeadStatus) : "NEW";
}

export type LeadInput = {
  name: string;
  email?: string;
  phone?: string;
  companyName?: string;
  source?: string;
  status?: string;
  ownerUserId?: string;
  notes?: string;
};

export async function createLead(input: LeadInput) {
  const name = input.name?.trim();
  if (!name) throw new Error("Lead name is required.");
  const { db } = getTenantDb();
  const lead = await db.lead.create({
    data: {
      name,
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      companyName: input.companyName?.trim() || null,
      source: asSource(input.source),
      status: asStatus(input.status),
      ownerUserId: input.ownerUserId?.trim() || null,
      notes: input.notes?.trim() || null,
    },
  });
  revalidatePath("/app/leads");
  return lead.id;
}

export async function updateLead(id: string, input: LeadInput) {
  const name = input.name?.trim();
  if (!name) throw new Error("Lead name is required.");
  const { db } = getTenantDb();
  await db.lead.update({
    where: { id },
    data: {
      name,
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      companyName: input.companyName?.trim() || null,
      source: asSource(input.source),
      status: asStatus(input.status),
      ownerUserId: input.ownerUserId?.trim() || null,
      notes: input.notes?.trim() || null,
    },
  });
  revalidatePath("/app/leads");
}

/**
 * Convert a lead into a deal: ensure a Contact exists for the lead, create a
 * Deal in the default pipeline's first stage, link the contact, and mark the
 * lead CONVERTED. Returns the new deal id.
 */
export async function convertLeadToDeal(
  leadId: string,
  opts?: { dealName?: string; amountCents?: number },
): Promise<string> {
  const { db } = getTenantDb();
  const lead = await db.lead.findUniqueOrThrow({ where: { id: leadId } });

  const pipeline = await db.pipeline.findFirst({
    where: { isDefault: true },
    include: { stages: { orderBy: { sortOrder: "asc" } } },
  });
  const fallback =
    pipeline ??
    (await db.pipeline.findFirst({
      orderBy: { createdAt: "asc" },
      include: { stages: { orderBy: { sortOrder: "asc" } } },
    }));
  if (!fallback || fallback.stages.length === 0) {
    throw new Error("No pipeline with stages exists. Seed a pipeline before converting leads.");
  }
  const firstStage = fallback.stages[0]!;

  const contact = await db.contact.create({
    data: {
      firstName: lead.name,
      email: lead.email,
      phone: lead.phone,
      ownerUserId: lead.ownerUserId,
    },
  });

  const deal = await db.deal.create({
    data: {
      name: opts?.dealName?.trim() || lead.name,
      pipelineId: fallback.id,
      stageId: firstStage.id,
      contactId: contact.id,
      ownerUserId: lead.ownerUserId,
      amountCents: BigInt(opts?.amountCents ?? 0),
    },
  });

  await db.lead.update({
    where: { id: leadId },
    data: { status: "CONVERTED", convertedAt: new Date() },
  });

  await db.crmActivity.create({
    data: {
      type: "NOTE",
      subject: "Lead converted to deal",
      body: `Converted from lead "${lead.name}".`,
      leadId: lead.id,
      dealId: deal.id,
      contactId: contact.id,
    },
  });

  revalidatePath("/app/leads");
  revalidatePath("/app/deals");
  return deal.id;
}
