/*
 * Inventory dashboard (Sprint 20). Server component; shows headline stock stats
 * and the most recent movements for the active tenant.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../CrmError";
import { getDashboardStats } from "@/lib/inventory/queries";
import { fmtQuantity, fmtSignedQuantity, fmtDate, MOVEMENT_TYPE_LABELS, type MovementType } from "@/lib/inventory/inventory-utils";
import { PageHeader, Subnav, Card, EmptyState, StatCard, Th, Td } from "./InventoryUI";

export const dynamic = "force-dynamic";

export default async function InventoryDashboard() {
  try {
    const { db } = getTenantDb();
    const stats = await getDashboardStats(db);
    return (
      <div className="p-6">
        <PageHeader title="Inventory" subtitle="Warehouses, stock levels, movements, transfers, and purchasing." />
        <Subnav />
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard label="Warehouses" value={stats.warehouseCount} />
          <StatCard label="Tracked SKUs" value={stats.skuTrackedCount} />
          <StatCard label="Low stock" value={stats.lowStockCount} />
          <StatCard label="Units on hand" value={fmtQuantity(stats.totalOnHand)} />
        </div>
        <h2 className="mb-2 text-sm font-medium" style={{ color: "var(--kb-text-primary)" }}>
          Recent movements
        </h2>
        <Card>
          {stats.recentMovements.length === 0 ? (
            <EmptyState message="No stock movements yet." />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--kb-border)" }}>
                  <Th>Product</Th>
                  <Th>Warehouse</Th>
                  <Th>Type</Th>
                  <Th>Qty</Th>
                  <Th>When</Th>
                </tr>
              </thead>
              <tbody>
                {stats.recentMovements.map((m) => (
                  <tr key={m.id} style={{ borderBottom: "1px solid var(--kb-border)" }}>
                    <Td>
                      {m.productName}
                      {m.sku ? <span className="ml-1 text-xs" style={{ color: "var(--kb-text-secondary)" }}>({m.sku})</span> : null}
                    </Td>
                    <Td>{m.warehouseName}</Td>
                    <Td>{MOVEMENT_TYPE_LABELS[m.type as MovementType] ?? m.type}</Td>
                    <Td>{fmtSignedQuantity(m.quantity)}</Td>
                    <Td>{fmtDate(m.createdAt)}</Td>
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
