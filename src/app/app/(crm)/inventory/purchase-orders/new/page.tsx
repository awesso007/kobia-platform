/*
 * New purchase order page (Sprint 20). Renders the shared PurchaseOrderForm with
 * product, warehouse, and vendor options.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../../CrmError";
import { listProductOptions, listWarehouseOptions, listVendorOptions } from "@/lib/inventory/queries";
import { PageHeader, Subnav, Card, PurchaseOrderForm } from "../../InventoryUI";

export const dynamic = "force-dynamic";

export default async function NewPurchaseOrderPage() {
  try {
    const { db } = getTenantDb();
    const [products, warehouses, vendors] = await Promise.all([listProductOptions(db), listWarehouseOptions(db), listVendorOptions(db)]);
    return (
      <div className="p-6">
        <PageHeader title="New purchase order" />
        <Subnav />
        <Card>
          <PurchaseOrderForm products={products} warehouses={warehouses} vendors={vendors} />
        </Card>
      </div>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
