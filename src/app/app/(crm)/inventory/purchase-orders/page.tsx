/*
 * Purchase orders list (Sprint 20). Server component; lists POs with vendor,
 * warehouse, and totals.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import Link from "next/link";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../CrmError";
import { listPurchaseOrders } from "@/lib/inventory/queries";
import { fmtCurrencyCents, fmtDate } from "@/lib/inventory/inventory-utils";
import { PageHeader, Subnav, Card, EmptyState, Th, Td, StatusBadge } from "../InventoryUI";

export const dynamic = "force-dynamic";

export default async function PurchaseOrdersPage() {
  try {
    const { db } = getTenantDb();
    const rows = await listPurchaseOrders(db);
    return (
      <div className="p-6">
        <PageHeader
          title="Purchase orders"
          subtitle="Order stock from vendors and receive it into a warehouse."
          action={
            <Link href="/app/inventory/purchase-orders/new" className="inline-flex items-center rounded px-3 py-1.5 text-sm font-medium text-white" style={{ backgroundColor: "var(--kb-primary)", borderRadius: "var(--kb-radius-sm)" }}>
              New purchase order
            </Link>
          }
        />
        <Subnav />
        <Card>
          {rows.length === 0 ? (
            <EmptyState message="No purchase orders yet." />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--kb-border)" }}>
                  <Th>Number</Th>
                  <Th>Vendor</Th>
                  <Th>Warehouse</Th>
                  <Th>Items</Th>
                  <Th>Total</Th>
                  <Th>Status</Th>
                  <Th>Created</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} style={{ borderBottom: "1px solid var(--kb-border)" }}>
                    <Td>
                      <Link href={`/app/inventory/purchase-orders/${p.id}`} style={{ color: "var(--kb-primary)" }}>
                        {p.poNumber}
                      </Link>
                    </Td>
                    <Td>{p.vendorName}</Td>
                    <Td>{p.warehouseName}</Td>
                    <Td>{p.itemCount}</Td>
                    <Td>{fmtCurrencyCents(p.totalCents, p.currency)}</Td>
                    <Td>
                      <StatusBadge status={p.status} />
                    </Td>
                    <Td>{fmtDate(p.createdAt)}</Td>
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
