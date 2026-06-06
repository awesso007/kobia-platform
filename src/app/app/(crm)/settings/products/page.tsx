import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../CrmError";
import { SettingsNav } from "../SettingsNav";
import { ProductsManager, type ProductRow, type CategoryOption } from "./ProductsManager";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  try {
    const { db } = getTenantDb();
    const [products, categories] = await Promise.all([
      db.product.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
      db.productCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    ]);

    const rows: ProductRow[] = products.map((p) => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      description: p.description,
      type: p.type,
      unitPriceCents: p.unitPriceCents,
      currency: p.currency,
      costCents: p.costCents,
      taxable: p.taxable,
      active: p.active,
      category: p.category,
      sortOrder: p.sortOrder,
    }));

    const categoryOptions: CategoryOption[] = categories.map((c) => ({ id: c.id, name: c.name }));

    return (
      <div>
        <div className="mb-1 text-xs" style={{ color: "var(--kb-text-secondary)" }}>CRM / Settings</div>
        <h1 className="mb-4" style={{ fontSize: "var(--kb-fs-h1)", fontWeight: 600, color: "var(--kb-text-primary)" }}>Settings</h1>
        <SettingsNav />
        <ProductsManager products={rows} categories={categoryOptions} />
      </div>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
