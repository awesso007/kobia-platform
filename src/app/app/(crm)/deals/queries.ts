/*
 * Deal board query helpers (server-only). Reads through getTenantDb().
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { getTenantDb } from "@/lib/db/get-tenant-db";

export type PipelineOption = { id: string; name: string; isDefault: boolean };
export type StageCol = { id: string; name: string; sortOrder: number; isWon: boolean; isLost: boolean };
export type DealCard = {
  id: string;
  name: string;
  stageId: string;
  amountCents: number;
  contactName: string | null;
  daysInStage: number;
  status: string;
};

export type DealBoard = {
  pipelines: PipelineOption[];
  activePipelineId: string | null;
  stages: StageCol[];
  deals: DealCard[];
};

function contactName(c: { firstName: string; lastName: string | null } | null): string | null {
  if (!c) return null;
  return [c.firstName, c.lastName].filter(Boolean).join(" ");
}

export async function getDealBoard(pipelineId?: string): Promise<DealBoard> {
  const { db } = getTenantDb();
  const pipelines = await db.pipeline.findMany({ orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] });
  if (pipelines.length === 0) {
    return { pipelines: [], activePipelineId: null, stages: [], deals: [] };
  }
  const active = pipelines.find((p) => p.id === pipelineId) ?? pipelines[0]!;

  const [stages, deals] = await Promise.all([
    db.dealStage.findMany({ where: { pipelineId: active.id }, orderBy: { sortOrder: "asc" } }),
    db.deal.findMany({
      where: { pipelineId: active.id },
      orderBy: { updatedAt: "desc" },
      include: { contact: { select: { firstName: true, lastName: true } } },
    }),
  ]);

  const now = Date.now();
  return {
    pipelines: pipelines.map((p) => ({ id: p.id, name: p.name, isDefault: p.isDefault })),
    activePipelineId: active.id,
    stages: stages.map((s) => ({ id: s.id, name: s.name, sortOrder: s.sortOrder, isWon: s.isWon, isLost: s.isLost })),
    deals: deals.map((d) => ({
      id: d.id,
      name: d.name,
      stageId: d.stageId,
      amountCents: Number(d.amountCents),
      contactName: contactName(d.contact),
      daysInStage: Math.max(0, Math.floor((now - d.updatedAt.getTime()) / 86_400_000)),
      status: d.status,
    })),
  };
}
