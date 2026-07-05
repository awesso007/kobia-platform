/*
 * Movements ledger (Sprint 20). Server component; paginated, filterable view of
 * the StockMovement ledger.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../CrmError";
import { listMovements, listWarehouseOptions } from "@/lib/inventory/queries";
import { fmtSignedQuantity, fmtDate, MOVEMENT_TYPE_LABELS, type MovementType } from "@/lib/inventory/inventory-utils";
import { PageHeader, Subnav, Card, EmptyState, Th, Td, MovementFilters, Pagination } from "../InventoryUI";

export const dynamic = "force-dynamic";

export default async function MovementsPage({ searchParams }: { searchParams: { type?: string; warehouseId?: string; page?: string } }) {
  try {
    const { db } = getTenantDb();
    const [result, warehouses] = await Promise.all([
      listMovements(db, {
        type: searchParams.type,
        warehouseId: searchParams.warehouseId,
        page: searchParams.page ? Number(searchParams.page) : undefined,
      }),
      listWarehouseOptions(db),
    ]);
    return (
      <div className="p-6">
        <PageHeader title="Movements" subtitle="Every stock change recorded in the ledger." />
        <Subnav />
        <MovementFilters type={searchParams.type} warehouseId={searchParams.warehouseId} warehouses={warehouses} />
        <Card>
          {result.rows.length === 0 ? (
            <EmptyState message="No movements match these filters." />
          ) : (
            <>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--kb-border)" }}>
                    <Th>Product</Th>
                    <Th>Warehouse</Th>
                    <Th>Type</Th>
                    <Th>Qty</Th>
                    <Th>Note</Th>
                    <Th>When</Th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((m) => (
                    <tr key={m.id} style={{ borderBottom: "1px solid var(--kb-border)" }}>
                      <Td>
                        {m.productName}
                        {m.sku ? <span className="ml-1 text-xs" style={{ color: "var(--kb-text-secondary)" }}>({m.sku})</span> : null}
                      </Td>
                      <Td>{m.warehouseName}</Td>
                      <Td>{MOVEMENT_TYPE_LABELS[m.type as MovementType] ?? m.type}</Td>
                      <Td>{fmtSignedQuantity(m.quantity)}</Td>
                      <Td>{m.note ?? "-"}</Td>
                      <Td>{fmtDate(m.createdAt)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination base="/app/inventory/movements" page={result.page} pageSize={result.pageSize} total={result.total} />
            </>
          )}
        </Card>
      </div>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
