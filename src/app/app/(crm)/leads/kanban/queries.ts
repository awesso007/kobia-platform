/*
 * Lead kanban query helpers (server-only, Sprint 10). Mirrors the deal board:
 * columns are the stages of a LEAD-type pipeline. A lead with no stageId is
 * dropped into the first stage column for display. Reads through getTenantDb().
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { getTagMapForEntities } from "@/lib/crm/tags";
import type { TagRow } from "@/lib/crm/record";

export type LeadStageCol = { id: string; name: string; sortOrder: number; color: string | null; wonOrLost: string };
export type LeadPipelineOption = { id: string; name: string; isDefault: boolean };
export type LeadKanbanCard = {
  id: string;
  name: string;
  stageId: string | null;
  companyName: string | null;
  status: string;
  tags: TagRow[];
};

export type LeadBoard = {
  pipelines: LeadPipelineOption[];
  activePipelineId: string | null;
  stages: LeadStageCol[];
  leads: LeadKanbanCard[];
};

export async function getLeadBoard(pipelineId?: string): Promise<LeadBoard> {
  const { db } = getTenantDb();
  const pipelines = await db.pipeline.findMany({
    where: { entityType: "LEAD", archivedAt: null },
    orderBy: [{ order: "asc" }, { isDefault: "desc" }, { createdAt: "asc" }],
  });
  if (pipelines.length === 0) {
    return { pipelines: [], activePipelineId: null, stages: [], leads: [] };
  }
  const active = pipelines.find((p) => p.id === pipelineId) ?? pipelines.find((p) => p.isDefault) ?? pipelines[0]!;

  const [stages, leads] = await Promise.all([
    db.dealStage.findMany({ where: { pipelineId: active.id }, orderBy: { sortOrder: "asc" } }),
    db.lead.findMany({ where: { pipelineId: active.id }, orderBy: { updatedAt: "desc" } }),
  ]);

  const firstStageId = stages[0]?.id ?? null;
  const tagMap = await getTagMapForEntities("LEAD", leads.map((l) => l.id));

  return {
    pipelines: pipelines.map((p) => ({ id: p.id, name: p.name, isDefault: p.isDefault })),
    activePipelineId: active.id,
    stages: stages.map((s) => ({ id: s.id, name: s.name, sortOrder: s.sortOrder, color: s.color, wonOrLost: s.wonOrLost })),
    leads: leads.map((l) => ({
      id: l.id,
      name: l.name,
      stageId: l.stageId ?? firstStageId,
      companyName: l.companyName,
      status: l.status,
      tags: tagMap[l.id] ?? [],
    })),
  };
}
