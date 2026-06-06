import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../CrmError";
import { SettingsNav } from "../SettingsNav";
import { TagsManager } from "./TagsManager";
import type { TagRow } from "@/lib/crm/record";

export const dynamic = "force-dynamic";

export default async function TagsPage() {
  try {
    const { db } = getTenantDb();
    const tags = await db.tag.findMany({ orderBy: { name: "asc" } });
    const counts = await db.tagAssignment.groupBy({ by: ["tagId"], _count: { tagId: true } });
    const countMap = new Map(counts.map((c) => [c.tagId, c._count.tagId]));

    const rows: (TagRow & { usage: number })[] = tags.map((t) => ({
      id: t.id,
      name: t.name,
      color: t.color,
      usage: countMap.get(t.id) ?? 0,
    }));

    return (
      <div>
        <div className="mb-1 text-xs" style={{ color: "var(--kb-text-secondary)" }}>CRM / Settings</div>
        <h1 className="mb-4" style={{ fontSize: "var(--kb-fs-h1)", fontWeight: 600, color: "var(--kb-text-primary)" }}>Settings</h1>
        <SettingsNav />
        <TagsManager tags={rows} />
      </div>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
