"use server";

/*
 * Pipeline + stage management (Sprint 10). Pipelines belong to an entityType
 * (DEAL or LEAD) and carry order/color/archivedAt; one default per entityType.
 * Stages carry probability, rotting_days, wonOrLost (which also keeps the legacy
 * isWon/isLost bools in sync for older code paths).
 *
 * All DB access routes through getTenantDb(). SavedView-style non-CRM entities
 * are audited under the COMPANY stand-in (AuditEntry enum has only the 4 CRM
 * types) with the real type recorded in diff. No em-dashes in copy (use hyphens).
 */
import { revalidatePath } from "next/cache";
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { auditWrite } from "@/lib/crm/audit";
import { requirePermission } from "@/lib/rbac/require-permission";

type Entity = "DEAL" | "LEAD";
type WonOrLost = "OPEN" | "WON" | "LOST";

export type StageInput = {
  id?: string;
  name: string;
  sortOrder: number;
  probability: number;
  rotting_days: number | null;
  wonOrLost: WonOrLost;
  color: string | null;
};

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export async function createPipeline(input: { name: string; entityType: Entity; color?: string | null }): Promise<string> {
  await requirePermission("record:update");
  const name = input.name?.trim();
  if (!name) throw new Error("Pipeline name is required.");
  const { db } = getTenantDb();
  const max = await db.pipeline.aggregate({ where: { entityType: input.entityType }, _max: { order: true } });
  const isFirst = (await db.pipeline.count({ where: { entityType: input.entityType } })) === 0;
  const p = await db.pipeline.create({
    data: {
      name,
      entityType: input.entityType,
      color: input.color ?? null,
      order: (max._max.order ?? 0) + 1,
      isDefault: isFirst,
    },
  });
  await auditWrite({ action: "CREATE", entityType: "COMPANY", entityId: p.id, diff: { kind: "Pipeline", name } });
  revalidatePath("/app/settings/pipelines");
  return p.id;
}

export async function renamePipeline(id: string, input: { name?: string; color?: string | null }): Promise<void> {
  await requirePermission("record:update");
  const { db } = getTenantDb();
  const data: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error("Pipeline name is required.");
    data.name = name;
  }
  if (input.color !== undefined) data.color = input.color;
  await db.pipeline.update({ where: { id }, data });
  await auditWrite({ action: "UPDATE", entityType: "COMPANY", entityId: id, diff: { kind: "Pipeline", ...data } });
  revalidatePath("/app/settings/pipelines");
}

export async function archivePipeline(id: string, archived: boolean): Promise<void> {
  await requirePermission("record:update");
  const { db } = getTenantDb();
  await db.pipeline.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
  await auditWrite({ action: "UPDATE", entityType: "COMPANY", entityId: id, diff: { kind: "Pipeline", archived } });
  revalidatePath("/app/settings/pipelines");
}

export async function setDefaultPipeline(id: string): Promise<void> {
  await requirePermission("record:update");
  const { db } = getTenantDb();
  const p = await db.pipeline.findUniqueOrThrow({ where: { id } });
  await db.$transaction([
    db.pipeline.updateMany({ where: { entityType: p.entityType }, data: { isDefault: false } }),
    db.pipeline.update({ where: { id }, data: { isDefault: true } }),
  ]);
  await auditWrite({ action: "UPDATE", entityType: "COMPANY", entityId: id, diff: { kind: "Pipeline", isDefault: true } });
  revalidatePath("/app/settings/pipelines");
}

export async function duplicatePipeline(id: string): Promise<string> {
  await requirePermission("record:update");
  const { db } = getTenantDb();
  const src = await db.pipeline.findUniqueOrThrow({ where: { id }, include: { stages: { orderBy: { sortOrder: "asc" } } } });
  const max = await db.pipeline.aggregate({ where: { entityType: src.entityType }, _max: { order: true } });
  const copy = await db.pipeline.create({
    data: {
      name: `${src.name} (copy)`,
      entityType: src.entityType,
      color: src.color,
      order: (max._max.order ?? 0) + 1,
      isDefault: false,
      stages: {
        create: src.stages.map((s) => ({
          name: s.name,
          sortOrder: s.sortOrder,
          probability: s.probability,
          rotting_days: s.rotting_days,
          wonOrLost: s.wonOrLost,
          color: s.color,
          isWon: s.wonOrLost === "WON",
          isLost: s.wonOrLost === "LOST",
        })),
      },
    },
  });
  await auditWrite({ action: "CREATE", entityType: "COMPANY", entityId: copy.id, diff: { kind: "Pipeline", duplicatedFrom: id } });
  revalidatePath("/app/settings/pipelines");
  return copy.id;
}

/** Replace the full stage set for a pipeline (create/update/delete + reorder). */
export async function saveStages(pipelineId: string, stages: StageInput[]): Promise<void> {
  await requirePermission("record:update");
  const { db } = getTenantDb();
  const existing = await db.dealStage.findMany({ where: { pipelineId }, select: { id: true } });
  const keepIds = new Set(stages.map((s) => s.id).filter(Boolean) as string[]);
  const toDelete = existing.filter((e) => !keepIds.has(e.id)).map((e) => e.id);

  // Guard: do not delete a stage that still has deals; reassign happens manually.
  const blocked: string[] = [];
  for (const id of toDelete) {
    const inUse = await db.deal.count({ where: { stageId: id } });
    if (inUse > 0) blocked.push(id);
  }
  const deletable = toDelete.filter((id) => !blocked.includes(id));

  await db.$transaction(async (tx) => {
    if (deletable.length > 0) await tx.dealStage.deleteMany({ where: { id: { in: deletable } } });
    for (let i = 0; i < stages.length; i++) {
      const s = stages[i]!;
      const data = {
        name: s.name.trim() || `Stage ${i + 1}`,
        sortOrder: i,
        probability: clampPct(s.probability),
        rotting_days: s.rotting_days != null && s.rotting_days > 0 ? Math.round(s.rotting_days) : null,
        wonOrLost: s.wonOrLost,
        color: s.color,
        isWon: s.wonOrLost === "WON",
        isLost: s.wonOrLost === "LOST",
      };
      if (s.id) {
        await tx.dealStage.update({ where: { id: s.id }, data });
      } else {
        await tx.dealStage.create({ data: { ...data, pipelineId } });
      }
    }
  });

  await auditWrite({ action: "UPDATE", entityType: "COMPANY", entityId: pipelineId, diff: { kind: "PipelineStages", count: stages.length, blocked } });
  revalidatePath("/app/settings/pipelines");
  revalidatePath("/app/deals");
  revalidatePath("/app/leads/kanban");
}
