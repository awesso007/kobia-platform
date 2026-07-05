/*
 * Purchase order detail (Sprint 20). Header, line items with received progress,
 * and Send/Receive actions gated by status.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { notFound } from "next/navigation";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../../CrmError";
import { getPurchaseOrder } from "@/lib/inventory/queries";
import { fmtQuantity, fmtCurrencyCents, fmtDate } from "@/lib/inventory/inventory-utils";
import { PageHeader, Subnav, Card, Th, Td, StatusBadge, PurchaseOrderActions } from "../../InventoryUI";

export const dynamic = "force-dynamic";

export default async function PurchaseOrderDetail({ params }: { params: { id: string } }) {
  try {
    const { db } = getTenantDb();
    const result = await getPurchaseOrder(db, params.id);
    if (!result) notFound();
    const { po, items } = result;
    return (
      <div className="p-6">
        <PageHeader title={po.poNumber} subtitle={`${po.vendor.name} to ${po.warehouse.name}`} />
        <Subnav />
        <div className="mb-4 flex flex-wrap items-center gap-4 text-sm" style={{ color: "var(--kb-text-secondary)" }}>
          <span>
            Status <StatusBadge status={po.status} />
          </span>
          <span>Total {fmtCurrencyCents(po.totalCents, po.currency)}</span>
          <span>Created {fmtDate(po.createdAt)}</span>
          {po.expectedDate ? <span>Expected {fmtDate(po.expectedDate)}</span> : null}
          {po.sentAt ? <span>Sent {fmtDate(po.sentAt)}</span> : null}
        </div>
        <div className="mb-4">
          <PurchaseOrderActions
            id={po.id}
            status={po.status}
            items={items.map((i) => ({ id: i.id, productName: i.productName, quantity: i.quantity, receivedQuantity: i.receivedQuantity }))}
          />
        </div>
        {po.notes ? (
          <p className="mb-4 text-sm" style={{ color: "var(--kb-text-primary)" }}>
            {po.notes}
          </p>
        ) : null}
        <Card>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--kb-border)" }}>
                <Th>Product</Th>
                <Th>Ordered</Th>
                <Th>Received</Th>
                <Th>Unit cost</Th>
                <Th>Line total</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} style={{ borderBottom: "1px solid var(--kb-border)" }}>
                  <Td>
                    {i.productName}
                    {i.sku ? <span className="ml-1 text-xs" style={{ color: "var(--kb-text-secondary)" }}>({i.sku})</span> : null}
                  </Td>
                  <Td>{fmtQuantity(i.quantity)}</Td>
                  <Td>{fmtQuantity(i.receivedQuantity)}</Td>
                  <Td>{fmtCurrencyCents(i.unitCostCents, po.currency)}</Td>
                  <Td>{fmtCurrencyCents(i.unitCostCents * i.quantity, po.currency)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
