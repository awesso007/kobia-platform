/**
 * R55: Lead kanban, pipeline and tag reads commit with live access
 * authorization and a privacy-minimal security event. Multi-business legacy
 * records without businessId are never exposed across CHESS units.
 */
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { getCurrentMembership, PermissionError } from "@/lib/rbac/require-permission";
import { withAuditedLegacyLeadRead, legacyOwnerFilter } from "@/lib/chess/legacy-lead-security-round54";
import type { TagRow } from "@/lib/crm/record";
export type LeadStageCol = {
  id: string; name: string; sortOrder: number; color: string | null; wonOrLost: string;
};
export type LeadPipelineOption = { id: string; name: string; isDefault: boolean };
export type LeadKanbanCard = {
  id: string; name: string; stageId: string | null; companyName: string | null;
  status: string; tags: TagRow[];
};
export type LeadBoard = {
  pipelines: LeadPipelineOption[]; activePipelineId: string | null;
  stages: LeadStageCol[]; leads: LeadKanbanCard[];
};
export async function getLeadBoard(pipelineId?: string): Promise<LeadBoard> {
  const member = await getCurrentMembership();
  if (!member || member.status !== "ACTIVE") throw new PermissionError("record:read");
  const { db } = getTenantDb();
  return withAuditedLegacyLeadRead(db, member.clerkUserId,
    "LEGACY_LEAD_BOARD_READ", "BOARD", async (tx, actor) => {
      const pipelines = await tx.pipeline.findMany({
        where: { entityType: "LEAD", archivedAt: null },
        orderBy: [{ order: "asc" }, { isDefault: "desc" }, { createdAt: "asc" }],
        take: 100,
      });
      if (!pipelines.length)
        return { pipelines: [], activePipelineId: null, stages: [], leads: [] };
      const active = pipelines.find(p => p.id === pipelineId) ??
        pipelines.find(p => p.isDefault) ?? pipelines[0]!;
      const [stages, leads] = await Promise.all([
        tx.dealStage.findMany({ where: { pipelineId: active.id }, orderBy: { sortOrder: "asc" }, take: 50 }),
        tx.lead.findMany({
          where: { pipelineId: active.id, ...legacyOwnerFilter(actor) },
          orderBy: { updatedAt: "desc" }, take: 250,
        }),
      ]);
      const tagRows = leads.length ? await tx.tagAssignment.findMany({
        where: { entityType: "LEAD", entityId: { in: leads.map(l => l.id) } },
        include: { tag: true },
      }) : [];
      const tags: Record<string, TagRow[]> = {};
      for (const t of tagRows)
        (tags[t.entityId] ??= []).push({ id: t.tag.id, name: t.tag.name, color: t.tag.color });
      return {
        pipelines: pipelines.map(p => ({ id: p.id, name: p.name, isDefault: p.isDefault })),
        activePipelineId: active.id,
        stages: stages.map(s => ({
          id: s.id, name: s.name, sortOrder: s.sortOrder, color: s.color,
          wonOrLost: s.wonOrLost,
        })),
        leads: leads.map(l => ({
          id: l.id, name: l.name, stageId: l.stageId ?? stages[0]?.id ?? null,
          companyName: l.companyName, status: l.status, tags: tags[l.id] ?? [],
        })),
      };
    });
}
