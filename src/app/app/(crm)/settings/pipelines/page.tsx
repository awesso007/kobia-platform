import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../CrmError";
import { SettingsNav } from "../SettingsNav";
import { PipelinesManager, type PipelineRow } from "./PipelinesManager";

export const dynamic = "force-dynamic";

export default async function PipelinesSettingsPage() {
  try {
    const { db } = getTenantDb();
    const pipelines = await db.pipeline.findMany({
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      include: { stages: { orderBy: { sortOrder: "asc" } }, _count: { select: { deals: true } } },
    });

    const rows: PipelineRow[] = pipelines.map((p) => ({
      id: p.id,
      name: p.name,
      entityType: p.entityType === "LEAD" ? "LEAD" : "DEAL",
      isDefault: p.isDefault,
      archived: p.archivedAt != null,
      color: p.color,
      dealCount: p._count.deals,
      stages: p.stages.map((s) => ({
        id: s.id,
        name: s.name,
        sortOrder: s.sortOrder,
        probability: s.probability,
        rotting_days: s.rotting_days,
        wonOrLost: s.wonOrLost,
        color: s.color,
      })),
    }));

    return (
      <div>
        <div className="mb-1 text-xs" style={{ color: "var(--kb-text-secondary)" }}>CRM / Settings</div>
        <h1 className="mb-4" style={{ fontSize: "var(--kb-fs-h1)", fontWeight: 600, color: "var(--kb-text-primary)" }}>Settings</h1>
        <SettingsNav />
        <PipelinesManager pipelines={rows} />
      </div>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
