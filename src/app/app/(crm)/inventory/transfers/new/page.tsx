/*
 * New transfer page (Sprint 20). Renders the shared TransferForm with product
 * and warehouse options.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../../CrmError";
import { listProductOptions, listWarehouseOptions } from "@/lib/inventory/queries";
import { PageHeader, Subnav, Card, TransferForm } from "../../InventoryUI";

export const dynamic = "force-dynamic";

export default async function NewTransferPage() {
  try {
    const { db } = getTenantDb();
    const [products, warehouses] = await Promise.all([listProductOptions(db), listWarehouseOptions(db)]);
    return (
      <div className="p-6">
        <PageHeader title="New transfer" />
        <Subnav />
        <Card>
          <TransferForm products={products} warehouses={warehouses} />
        </Card>
      </div>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
