"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type {
  ActivityType,
  DealStatus,
  LeadSource,
  LeadStatus,
} from "@prisma/client";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";

function assertRole(role: string) {
  if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(role)) {
    throw new Error("Forbidden");
  }
}

// Money helpers — input dollars string → BigInt cents
function dollarsToCents(s: string | null): bigint {
  if (!s) return 0n;
  const t = s.trim().replace(/[$,]/g, "");
  if (!t) return 0n;
  const n = Number(t);
  if (!Number.isFinite(n)) return 0n;
  return BigInt(Math.round(n * 100));
}

function parseDate(s: string | null): Date | null {
  if (!s) return null;
  const t = s.trim();
  if (!t) return null;
  return new Date(t + "T12:00:00Z");
}

// ─── PIPELINES ──────────────────────────────────────────────────────────────

/** Get or seed the default pipeline + stages for a tenant. Idempotent. */
async function ensureDefaultPipeline(tenantId: string) {
  const existing = await db.pipeline.findFirst({
    where: { tenantId, isDefault: true },
    include: { stages: { orderBy: { sortOrder: "asc" } } },
  });
  if (existing && existing.stages.length > 0) return existing;

  const created = await db.pipeline.upsert({
    where: {
      tenantId_name: { tenantId, name: "New Client Sales" },
    },
    update: { isDefault: true },
    create: { tenantId, name: "New Client Sales", isDefault: true },
  });

  const existingStages = await db.dealStage.findMany({
    where: { pipelineId: created.id },
  });
  if (existingStages.length === 0) {
    await db.dealStage.createMany({
      data: [
        { tenantId, pipelineId: created.id, name: "Qualified", sortOrder: 10 },
        { tenantId, pipelineId: created.id, name: "Proposal Sent", sortOrder: 20 },
        { tenantId, pipelineId: created.id, name: "Negotiation", sortOrder: 30 },
        { tenantId, pipelineId: created.id, name: "Closed Won", sortOrder: 40, isWon: true },
        { tenantId, pipelineId: created.id, name: "Closed Lost", sortOrder: 50, isLost: true },
      ],
    });
  }

  return db.pipeline.findFirst({
    where: { id: created.id },
    include: { stages: { orderBy: { sortOrder: "asc" } } },
  });
}

export async function seedDefaultPipelineAction(
  formData: FormData
): Promise<void> {
  const tenantSlug = formData.get("tenantSlug") as string;
  const auth = await getAuthContext(tenantSlug);
  if (!auth) redirect(`/${tenantSlug}/login`);
  assertRole(auth.role);

  await ensureDefaultPipeline(auth.tenant.id);
  revalidatePath(`/${tenantSlug}/crm`);
}

// ─── LEADS ──────────────────────────────────────────────────────────────────

export async function createLeadAction(formData: FormData): Promise<void> {
  const tenantSlug = formData.get("tenantSlug") as string;
  const auth = await getAuthContext(tenantSlug);
  if (!auth) redirect(`/${tenantSlug}/login`);
  assertRole(auth.role);

  const name = ((formData.get("name") as string) || "").trim();
  if (!name) throw new Error("Name is required");

  await db.lead.create({
    data: {
      tenantId: auth.tenant.id,
      name,
      companyName:
        ((formData.get("companyName") as string) || "").trim() || null,
      email: ((formData.get("email") as string) || "").trim() || null,
      phone: ((formData.get("phone") as string) || "").trim() || null,
      source:
        ((formData.get("source") as LeadSource) || "WEBSITE") as LeadSource,
      notes: ((formData.get("notes") as string) || "").trim() || null,
      ownerUserId: auth.user.id,
    },
  });

  revalidatePath(`/${tenantSlug}/crm/leads`);
  redirect(`/${tenantSlug}/crm/leads`);
}

export async function updateLeadStatusAction(formData: FormData): Promise<void> {
  const tenantSlug = formData.get("tenantSlug") as string;
  const auth = await getAuthContext(tenantSlug);
  if (!auth) redirect(`/${tenantSlug}/login`);
  assertRole(auth.role);

  const id = formData.get("id") as string;
  const status = formData.get("status") as LeadStatus;

  const existing = await db.lead.findFirst({
    where: { id, tenantId: auth.tenant.id },
  });
  if (!existing) throw new Error("Lead not found");

  await db.lead.update({ where: { id }, data: { status } });

  revalidatePath(`/${tenantSlug}/crm/leads`);
  revalidatePath(`/${tenantSlug}/crm/leads/${id}`);
}

/** Convert a lead into a deal in the default pipeline's first stage. */
export async function convertLeadToDealAction(
  formData: FormData
): Promise<void> {
  const tenantSlug = formData.get("tenantSlug") as string;
  const auth = await getAuthContext(tenantSlug);
  if (!auth) redirect(`/${tenantSlug}/login`);
  assertRole(auth.role);

  const leadId = formData.get("leadId") as string;
  const amount = formData.get("amount") as string | null;
  const closeDate = parseDate(formData.get("closeDate") as string | null);

  const lead = await db.lead.findFirst({
    where: { id: leadId, tenantId: auth.tenant.id },
  });
  if (!lead) throw new Error("Lead not found");
  if (lead.convertedDealId) throw new Error("Lead already converted");

  const pipeline = await ensureDefaultPipeline(auth.tenant.id);
  if (!pipeline || pipeline.stages.length === 0) {
    throw new Error("No pipeline configured");
  }
  const firstStage = pipeline.stages[0]!;

  const deal = await db.deal.create({
    data: {
      tenantId: auth.tenant.id,
      pipelineId: pipeline.id,
      stageId: firstStage.id,
      name: lead.companyName
        ? `${lead.companyName} \u2014 New Client`
        : `${lead.name} \u2014 New Client`,
      amountCents: dollarsToCents(amount),
      closeDate,
      ownerUserId: lead.ownerUserId ?? auth.user.id,
      notes: lead.notes,
    },
  });

  await db.lead.update({
    where: { id: leadId },
    data: {
      status: "CONVERTED",
      convertedDealId: deal.id,
      convertedAt: new Date(),
    },
  });

  revalidatePath(`/${tenantSlug}/crm`);
  revalidatePath(`/${tenantSlug}/crm/leads`);
  redirect(`/${tenantSlug}/crm/deals/${deal.id}`);
}

// ─── DEALS ──────────────────────────────────────────────────────────────────

export async function createDealAction(formData: FormData): Promise<void> {
  const tenantSlug = formData.get("tenantSlug") as string;
  const auth = await getAuthContext(tenantSlug);
  if (!auth) redirect(`/${tenantSlug}/login`);
  assertRole(auth.role);

  const name = ((formData.get("name") as string) || "").trim();
  if (!name) throw new Error("Name is required");

  const pipeline = await ensureDefaultPipeline(auth.tenant.id);
  if (!pipeline || pipeline.stages.length === 0) {
    throw new Error("No pipeline configured");
  }

  const stageId =
    ((formData.get("stageId") as string) || "").trim() ||
    pipeline.stages[0]!.id;

  await db.deal.create({
    data: {
      tenantId: auth.tenant.id,
      pipelineId: pipeline.id,
      stageId,
      name,
      amountCents: dollarsToCents(formData.get("amount") as string | null),
      probabilityPct: Math.max(
        0,
        Math.min(
          100,
          Number(formData.get("probabilityPct") as string | null) || 50
        )
      ),
      closeDate: parseDate(formData.get("closeDate") as string | null),
      ownerUserId: auth.user.id,
      entityId: ((formData.get("entityId") as string) || "").trim() || null,
      notes: ((formData.get("notes") as string) || "").trim() || null,
    },
  });

  revalidatePath(`/${tenantSlug}/crm`);
}

export async function moveDealStageAction(formData: FormData): Promise<void> {
  const tenantSlug = formData.get("tenantSlug") as string;
  const auth = await getAuthContext(tenantSlug);
  if (!auth) redirect(`/${tenantSlug}/login`);
  assertRole(auth.role);

  const id = formData.get("id") as string;
  const stageId = formData.get("stageId") as string;

  const deal = await db.deal.findFirst({
    where: { id, tenantId: auth.tenant.id },
  });
  if (!deal) throw new Error("Deal not found");

  const stage = await db.dealStage.findFirst({
    where: { id: stageId, tenantId: auth.tenant.id, pipelineId: deal.pipelineId },
  });
  if (!stage) throw new Error("Stage not found");

  // Auto-set status from stage flags
  const status: DealStatus = stage.isWon ? "WON" : stage.isLost ? "LOST" : "OPEN";

  await db.deal.update({
    where: { id },
    data: {
      stageId,
      status,
      wonAt: stage.isWon ? new Date() : null,
      lostAt: stage.isLost ? new Date() : null,
    },
  });

  revalidatePath(`/${tenantSlug}/crm`);
  revalidatePath(`/${tenantSlug}/crm/deals/${id}`);
}

export async function updateDealAction(formData: FormData): Promise<void> {
  const tenantSlug = formData.get("tenantSlug") as string;
  const auth = await getAuthContext(tenantSlug);
  if (!auth) redirect(`/${tenantSlug}/login`);
  assertRole(auth.role);

  const id = formData.get("id") as string;
  const existing = await db.deal.findFirst({
    where: { id, tenantId: auth.tenant.id },
  });
  if (!existing) throw new Error("Deal not found");

  await db.deal.update({
    where: { id },
    data: {
      name: ((formData.get("name") as string) || "").trim(),
      amountCents: dollarsToCents(formData.get("amount") as string | null),
      probabilityPct: Math.max(
        0,
        Math.min(
          100,
          Number(formData.get("probabilityPct") as string | null) || 50
        )
      ),
      closeDate: parseDate(formData.get("closeDate") as string | null),
      notes: ((formData.get("notes") as string) || "").trim() || null,
      lostReason: ((formData.get("lostReason") as string) || "").trim() || null,
    },
  });

  revalidatePath(`/${tenantSlug}/crm/deals/${id}`);
}

// ─── ACTIVITIES ─────────────────────────────────────────────────────────────

export async function logActivityAction(formData: FormData): Promise<void> {
  const tenantSlug = formData.get("tenantSlug") as string;
  const auth = await getAuthContext(tenantSlug);
  if (!auth) redirect(`/${tenantSlug}/login`);
  assertRole(auth.role);

  const subject = ((formData.get("subject") as string) || "").trim();
  if (!subject) throw new Error("Subject is required");

  const dealId = ((formData.get("dealId") as string) || "").trim() || null;
  const leadId = ((formData.get("leadId") as string) || "").trim() || null;
  if (!dealId && !leadId) {
    throw new Error("Activity must link to a lead or deal");
  }

  await db.crmActivity.create({
    data: {
      tenantId: auth.tenant.id,
      type: ((formData.get("type") as ActivityType) || "NOTE") as ActivityType,
      subject,
      body: ((formData.get("body") as string) || "").trim() || null,
      occurredAt:
        parseDate(formData.get("occurredAt") as string | null) ?? new Date(),
      dealId,
      leadId,
      createdByUserId: auth.user.id,
    },
  });

  if (dealId) {
    revalidatePath(`/${tenantSlug}/crm/deals/${dealId}`);
  }
  if (leadId) {
    revalidatePath(`/${tenantSlug}/crm/leads/${leadId}`);
  }
}
