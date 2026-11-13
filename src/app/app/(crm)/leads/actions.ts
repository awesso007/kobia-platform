"use server";

/**
 * Round 55: historical Lead server actions have no businessId on the source
 * rows. Do not expose/mutate them in multi-business CHESS tenants. Validate
 * current session, tenant role, single-unit assignment, record ownership and
 * write a privacy-minimal audit in ONE SERIALIZABLE transaction.
 * UI invalidation, indexing, notifications and automations occur only after
 * the database commit. No premature side effects on rollback.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { getCurrentMembership, PermissionError } from "@/lib/rbac/require-permission";
import { notify } from "@/lib/notifications/notify";
import { dispatchAutomation } from "@/lib/automations/dispatch";
import { reindex } from "@/lib/search";
import {
  withAuditedLegacyLeadMutation, withAuditedLegacyLeadRead,
  type LeadActor,
} from "@/lib/chess/legacy-lead-security-round54";
import type { Prisma } from "@/lib/db/generated/tenant";

const leadSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().max(254).optional(),
  phone: z.string().trim().max(40).optional(),
  companyName: z.string().trim().max(200).optional(),
  source: z.enum(["WEBSITE", "REFERRAL", "CALL", "EMAIL", "EVENT", "OTHER"]).optional(),
  status: z.enum(["NEW", "CONTACTED", "QUALIFIED", "UNQUALIFIED", "CONVERTED"]).optional(),
  ownerUserId: z.string().trim().min(1).max(128).optional(),
  notes: z.string().max(4000).optional(),
  tagIds: z.array(z.string().min(1).max(128)).max(40).optional(),
  customFields: z.record(z.unknown()).optional(),
}).strict();
export type LeadInput = z.input<typeof leadSchema>;

async function identity(): Promise<string> {
  const member = await getCurrentMembership();
  if (!member || member.status !== "ACTIVE") throw new PermissionError("record:read");
  return member.clerkUserId;
}

function assertOwnLead(actor: LeadActor, ownerId: string | null): void {
  if (actor.role === "MEMBER" && actor.id !== ownerId)
    throw new PermissionError("record:update");
}
async function validateAssignedOwner(
  tx: Prisma.TransactionClient, actor: LeadActor, owner: string | null,
): Promise<string | null> {
  const id = actor.role === "MEMBER" ? actor.id : owner;
  if (owner && actor.role === "MEMBER" && owner !== actor.id)
    throw new PermissionError("record:update");
  if (id) {
    const current = await tx.membership.findUnique({
      where: { clerkUserId: id }, select: { status: true, role: true },
    });
    if (current?.status !== "ACTIVE" || current.role === "VIEWER")
      throw new PermissionError("record:update");
    if (actor.businessId) {
      const assigned = await tx.chessEmployeeAssignment.findUnique({
        where: { businessId_clerkUserId: {
          businessId: actor.businessId, clerkUserId: id,
        } }, select: { revokedAt: true },
      });
      if (!assigned || assigned.revokedAt) throw new PermissionError("record:update");
    }
  }
  return id;
}

async function changeLeadMetadata(
  tx: Prisma.TransactionClient, leadId: string,
  parsed: z.output<typeof leadSchema>,
) {
  if (parsed.tagIds) {
    const ids = [...new Set(parsed.tagIds)];
    const count = await tx.tag.count({ where: { id: { in: ids } } });
    if (count !== ids.length) throw new PermissionError("record:update");
    await tx.tagAssignment.deleteMany({ where: { entityType: "LEAD", entityId: leadId } });
    if (ids.length) await tx.tagAssignment.createMany({
      data: ids.map(tagId => ({ entityType: "LEAD", entityId: leadId, tagId })),
    });
  }
  if (parsed.customFields) {
    const entries = Object.entries(parsed.customFields);
    if (entries.length > 30 || JSON.stringify(parsed.customFields).length > 8000)
      throw new Error("Too many custom fields");
    const known = await tx.customField.findMany({
      where: { entityType: "LEAD", id: { in: entries.map(([id]) => id) } },
      select: { id: true },
    });
    if (known.length !== entries.length) throw new PermissionError("record:update");
    for (const [customFieldId, value] of entries) {
      const empty = value === null || value === undefined || value === "" ||
        Array.isArray(value) && value.length === 0;
      if (empty) {
        await tx.customFieldValue.deleteMany({
          where: { customFieldId, entityType: "LEAD", entityId: leadId },
        });
      } else {
        await tx.customFieldValue.upsert({
          where: { customFieldId_entityId: { customFieldId, entityId: leadId } },
          create: { customFieldId, entityType: "LEAD", entityId: leadId, value: value as never },
          update: { value: value as never },
        });
      }
    }
  }
}

function dataOf(input: z.output<typeof leadSchema>, ownerUserId: string | null) {
  return {
    name: input.name, email: input.email || null, phone: input.phone || null,
    companyName: input.companyName || null, source: input.source || "WEBSITE" as const,
    status: input.status || "NEW" as const,
    ownerUserId, notes: input.notes || null,
  };
}
async function afterLeadCommit(id: string, kind: "CREATE" | "UPDATE" | "STAGE") {
  const { db } = getTenantDb();
  await Promise.allSettled([reindex(db, "LEAD", id),
    dispatchAutomation({ type: kind === "CREATE" ? "RECORD_CREATED" :
      kind === "STAGE" ? "STAGE_CHANGED" : "RECORD_UPDATED",
      entityType: "LEAD", entityId: id })]);
  revalidatePath("/app/leads");
  if (kind === "STAGE") revalidatePath("/app/leads/kanban");
}

export async function moveLeadToStage(leadId: string, stageId: string) {
  const userId = await identity();
  const { db } = getTenantDb();
  await withAuditedLegacyLeadMutation(db, userId, "record:read",
    "LEGACY_LEAD_STAGE_CHANGED", leadId, async (tx, actor) => {
      const lead = await tx.lead.findUnique({ where: { id: leadId }, select: {
        id: true, ownerUserId: true, status: true,
      } });
      if (!lead || lead.status === "CONVERTED") throw new PermissionError("record:update");
      assertOwnLead(actor, lead.ownerUserId);
      const stage = await tx.dealStage.findUnique({
        where: { id: stageId }, include: { pipeline: true },
      });
      if (!stage || stage.pipeline.entityType !== "LEAD" ||
          stage.pipeline.archivedAt) throw new PermissionError("record:update");
      await tx.lead.update({
        where: { id: leadId }, data: { stageId, pipelineId: stage.pipelineId },
      });
      return true;
    });
  await afterLeadCommit(leadId, "STAGE");
}

export async function createLead(input: LeadInput) {
  const parsed = leadSchema.parse(input);
  const userId = await identity();
  const { db } = getTenantDb();
  const result = await withAuditedLegacyLeadMutation(db, userId, "record:create",
    "LEGACY_LEAD_CREATED", "NEW", async (tx, actor) => {
      const ownerUserId = await validateAssignedOwner(tx, actor, parsed.ownerUserId ?? null);
      const lead = await tx.lead.create({ data: dataOf(parsed, ownerUserId),
        select: { id: true, name: true, ownerUserId: true } });
      await changeLeadMetadata(tx, lead.id, parsed);
      return lead;
    });
  await afterLeadCommit(result.id, "CREATE");
  if (result.ownerUserId && result.ownerUserId !== userId)
    await notify(result.ownerUserId, {
      type: "ASSIGNMENT", title: "You were assigned a lead: " + result.name,
      linkUrl: "/app/leads",
    }).catch(() => undefined);
  return result.id;
}

export async function updateLead(id: string, input: LeadInput) {
  const parsed = leadSchema.parse(input);
  const userId = await identity();
  const { db } = getTenantDb();
  const changed = await withAuditedLegacyLeadMutation(db, userId, "record:read",
    "LEGACY_LEAD_UPDATED", id, async (tx, actor) => {
      const before = await tx.lead.findUnique({
        where: { id }, select: { id: true, ownerUserId: true },
      });
      if (!before) throw new PermissionError("record:update");
      assertOwnLead(actor, before.ownerUserId);
      const ownerUserId = await validateAssignedOwner(
        tx, actor, parsed.ownerUserId ?? before.ownerUserId,
      );
      await tx.lead.update({ where: { id }, data: dataOf(parsed, ownerUserId) });
      await changeLeadMetadata(tx, id, parsed);
      return { ownerUserId, previousOwner: before.ownerUserId };
    });
  await afterLeadCommit(id, "UPDATE");
  if (changed.ownerUserId && changed.ownerUserId !== changed.previousOwner)
    await notify(changed.ownerUserId, {
      type: "ASSIGNMENT", title: "You were assigned a lead: " + parsed.name,
      linkUrl: "/app/leads",
    }).catch(() => undefined);
}

export async function convertLeadToDeal(
  leadId: string, opts?: { dealName?: string; amountCents?: number },
): Promise<string> {
  const userId = await identity();
  const amount = opts?.amountCents ?? 0;
  if (!Number.isSafeInteger(amount) || amount < 0 ||
      (opts?.dealName && opts.dealName.trim().length > 200))
    throw new Error("Invalid deal amount/name");
  const { db } = getTenantDb();
  const ids = await withAuditedLegacyLeadMutation(db, userId, "record:read",
    "LEGACY_LEAD_CONVERTED", leadId, async (tx, actor) => {
      const lead = await tx.lead.findUnique({ where: { id: leadId } });
      if (!lead || lead.status === "CONVERTED") throw new PermissionError("record:update");
      assertOwnLead(actor, lead.ownerUserId);
      const pipeline = await tx.pipeline.findFirst({
        where: { entityType: "DEAL", archivedAt: null, isDefault: true },
        include: { stages: { orderBy: { sortOrder: "asc" }, take: 1 } },
      }) ?? await tx.pipeline.findFirst({
        where: { entityType: "DEAL", archivedAt: null },
        include: { stages: { orderBy: { sortOrder: "asc" }, take: 1 } },
      });
      const firstStage = pipeline?.stages[0];
      if (!pipeline || !firstStage) throw new Error("No usable deal pipeline");
      const contact = await tx.contact.create({
        data: { firstName: lead.name, email: lead.email, phone: lead.phone,
          ownerUserId: lead.ownerUserId }, select: { id: true },
      });
      const deal = await tx.deal.create({ data: {
        name: opts?.dealName?.trim() || lead.name, pipelineId: pipeline.id,
        stageId: firstStage.id, contactId: contact.id,
        ownerUserId: lead.ownerUserId, amountCents: BigInt(amount),
      }, select: { id: true } });
      const changed = await tx.lead.updateMany({
        where: { id: leadId, status: { not: "CONVERTED" } },
        data: { status: "CONVERTED", convertedAt: new Date() },
      });
      if (changed.count !== 1) throw new Error("Lead converted concurrently");
      await tx.crmActivity.create({ data: {
        type: "NOTE", subject: "Lead converted to deal", leadId: lead.id,
        dealId: deal.id, contactId: contact.id,
      } });
      return { dealId: deal.id, contactId: contact.id };
    });
  await Promise.allSettled([reindex(db, "LEAD", leadId),
    reindex(db, "CONTACT", ids.contactId), reindex(db, "DEAL", ids.dealId)]);
  revalidatePath("/app/leads");
  revalidatePath("/app/deals");
  return ids.dealId;
}

/** Record pane tags/custom fields are also private legacy lead details. */
export async function loadLeadDetail(id: string) {
  const userId = await identity();
  const { db } = getTenantDb();
  return withAuditedLegacyLeadRead(db, userId, "LEGACY_LEAD_DETAIL_READ",
    id, async (tx, actor) => {
      const lead = await tx.lead.findUnique({
        where: { id }, select: { id: true, ownerUserId: true },
      });
      if (!lead || actor.role === "MEMBER" && lead.ownerUserId !== actor.id)
        throw new PermissionError("record:read");
      const [tags, rows] = await Promise.all([
        tx.tagAssignment.findMany({
          where: { entityType: "LEAD", entityId: id }, include: { tag: true },
        }),
        tx.customFieldValue.findMany({ where: { entityType: "LEAD", entityId: id } }),
      ]);
      return { tagIds: tags.map(t => t.tagId),
        customValues: Object.fromEntries(rows.map(r => [r.customFieldId, r.value])) };
    });
}
