import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../../CrmError";
import { SettingsNav } from "../../SettingsNav";
import { CategoriesManager, type CategoryNode } from "./CategoriesManager";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  try {
    const { db } = getTenantDb();
    const categories = await db.productCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
    const nodes: CategoryNode[] = categories.map((c) => ({
      id: c.id,
      name: c.name,
      parentId: c.parentId,
      sortOrder: c.sortOrder,
    }));

    return (
      <div>
        <div className="mb-1 text-xs" style={{ color: "var(--kb-text-secondary)" }}>CRM / Settings / Products</div>
        <h1 className="mb-4" style={{ fontSize: "var(--kb-fs-h1)", fontWeight: 600, color: "var(--kb-text-primary)" }}>Settings</h1>
        <SettingsNav />
        <CategoriesManager nodes={nodes} />
      </div>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
