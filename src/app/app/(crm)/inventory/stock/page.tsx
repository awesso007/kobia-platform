/*
 * Global stock table (Sprint 20). Server component; lists StockItem rows across
 * warehouses with search/warehouse filters and an adjust-stock modal.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../CrmError";
import { listStock, listWarehouseOptions, listProductOptions } from "@/lib/inventory/queries";
import { fmtQuantity } from "@/lib/inventory/inventory-utils";
import { PageHeader, Subnav, Card, EmptyState, Th, Td, StockBadge, AdjustStockButton, StockFilters } from "../InventoryUI";

export const dynamic = "force-dynamic";

export default async function StockPage({ searchParams }: { searchParams: { search?: string; warehouseId?: string } }) {
  try {
    const { db } = getTenantDb();
    const [rows, warehouses, products] = await Promise.all([
      listStock(db, { search: searchParams.search, warehouseId: searchParams.warehouseId }),
      listWarehouseOptions(db),
      listProductOptions(db),
    ]);
    return (
      <div className="p-6">
        <PageHeader title="Stock" subtitle="On-hand quantities across all warehouses." action={<AdjustStockButton products={products} warehouses={warehouses} />} />
        <Subnav />
        <StockFilters warehouses={warehouses} search={searchParams.search} warehouseId={searchParams.warehouseId} />
        <Card>
          {rows.length === 0 ? (
            <EmptyState message="No stock items found." />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--kb-border)" }}>
                  <Th>Product</Th>
                  <Th>SKU</Th>
                  <Th>Warehouse</Th>
                  <Th>On hand</Th>
                  <Th>Reserved</Th>
                  <Th>Threshold</Th>
                  <Th>Level</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.productId}-${r.warehouseId}`} style={{ borderBottom: "1px solid var(--kb-border)" }}>
                    <Td>{r.productName}</Td>
                    <Td>{r.sku ? <code className="text-xs">{r.sku}</code> : "-"}</Td>
                    <Td>{r.warehouseName}</Td>
                    <Td>{fmtQuantity(r.quantity)}</Td>
                    <Td>{fmtQuantity(r.reservedQuantity)}</Td>
                    <Td>{fmtQuantity(r.lowStockThreshold)}</Td>
                    <Td>
                      <StockBadge quantity={r.quantity} threshold={r.lowStockThreshold} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
