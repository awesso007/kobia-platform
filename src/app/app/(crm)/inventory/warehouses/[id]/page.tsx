/*
 * Warehouse detail (Sprint 20). Shows editable warehouse fields plus its stock
 * rows.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { notFound } from "next/navigation";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../../CrmError";
import { getWarehouse } from "@/lib/inventory/queries";
import { fmtQuantity } from "@/lib/inventory/inventory-utils";
import { PageHeader, Subnav, Card, EmptyState, Th, Td, StockBadge, WarehouseForm } from "../../InventoryUI";

export const dynamic = "force-dynamic";

export default async function WarehouseDetail({ params }: { params: { id: string } }) {
  try {
    const { db } = getTenantDb();
    const result = await getWarehouse(db, params.id);
    if (!result) notFound();
    const { warehouse, stock } = result;
    return (
      <div className="p-6">
        <PageHeader title={warehouse.name} subtitle={`Code ${warehouse.code}`} />
        <Subnav />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div>
            <h2 className="mb-2 text-sm font-medium" style={{ color: "var(--kb-text-primary)" }}>
              Details
            </h2>
            <Card>
              <WarehouseForm
                id={warehouse.id}
                initial={{
                  name: warehouse.name,
                  code: warehouse.code,
                  address: warehouse.address ?? "",
                  city: warehouse.city ?? "",
                  region: warehouse.region ?? "",
                  country: warehouse.country ?? "",
                  isDefault: warehouse.isDefault,
                  active: warehouse.active,
                }}
              />
            </Card>
          </div>
          <div>
            <h2 className="mb-2 text-sm font-medium" style={{ color: "var(--kb-text-primary)" }}>
              Stock in this warehouse
            </h2>
            <Card>
              {stock.length === 0 ? (
                <EmptyState message="No stock in this warehouse." />
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--kb-border)" }}>
                      <Th>Product</Th>
                      <Th>On hand</Th>
                      <Th>Threshold</Th>
                      <Th>Level</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {stock.map((s) => (
                      <tr key={s.id} style={{ borderBottom: "1px solid var(--kb-border)" }}>
                        <Td>
                          {s.productName}
                          {s.sku ? <span className="ml-1 text-xs" style={{ color: "var(--kb-text-secondary)" }}>({s.sku})</span> : null}
                        </Td>
                        <Td>{fmtQuantity(s.quantity)}</Td>
                        <Td>{fmtQuantity(s.lowStockThreshold)}</Td>
                        <Td>
                          <StockBadge quantity={s.quantity} threshold={s.lowStockThreshold} />
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </div>
        </div>
      </div>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
